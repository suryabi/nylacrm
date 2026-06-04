"""
Promotional / Non-sale stock-out (Delivery Challan) routes.

Sometimes goods are stocked out from a distributor and handed to people saved in
the CRM **Contacts** module — for promotions, networking, brand visibility or
sampling. There is NO sale: no invoice, no Zoho push, no account balance, no
revenue. Stock is still deducted (inventory stays accurate) and a **Delivery
Challan** is generated with indicative values marked "Not for Sale".

Collections (kept separate from account deliveries to avoid any regression):
  • promo_reasons        — admin-managed master list of reasons
  • promo_dispatches     — one per challan
  • promo_dispatch_items — line items
"""
from fastapi import APIRouter, HTTPException, Depends, Response
from pydantic import BaseModel
from typing import Optional
from datetime import datetime, timezone
import uuid
import logging

from database import db
from deps import get_current_user
from core.tenant import get_current_tenant_id
from models.distributor import PromoDeliveryCreate
from routes.distributors import can_manage_distributor_data
from utils.pdf_generator import generate_delivery_challan_pdf

logger = logging.getLogger(__name__)
router = APIRouter(tags=["Promotional Dispatch"])

ADMIN_ROLES = {"CEO", "Director", "Admin", "admin", "Super Admin", "super_admin"}
DEFAULT_REASONS = ["Promotion", "Networking", "Brand Visibility", "Sampling", "Other"]


def _ensure_admin(user: dict) -> None:
    if (user.get("role") or "").strip() not in ADMIN_ROLES:
        raise HTTPException(status_code=403, detail="Only CEO / Director / Admin can manage promo reasons.")


# ───────────────────────────── Promo reasons master ─────────────────────────
class PromoReasonCreate(BaseModel):
    name: str


class PromoReasonUpdate(BaseModel):
    name: Optional[str] = None
    is_active: Optional[bool] = None
    sort_order: Optional[int] = None


async def _seed_reasons_if_empty(tenant_id: str) -> None:
    if await db.promo_reasons.count_documents({"tenant_id": tenant_id}) == 0:
        now = datetime.now(timezone.utc).isoformat()
        await db.promo_reasons.insert_many([
            {"id": str(uuid.uuid4()), "tenant_id": tenant_id, "name": name,
             "is_active": True, "sort_order": i, "created_at": now}
            for i, name in enumerate(DEFAULT_REASONS)
        ])


@router.get("/admin/promo-reasons")
async def list_promo_reasons(include_inactive: bool = False, current_user: dict = Depends(get_current_user)):
    tenant_id = get_current_tenant_id()
    await _seed_reasons_if_empty(tenant_id)
    q = {"tenant_id": tenant_id}
    if not include_inactive:
        q["is_active"] = True
    reasons = await db.promo_reasons.find(q, {"_id": 0}).to_list(500)
    reasons.sort(key=lambda r: (r.get("sort_order", 0), (r.get("name") or "").lower()))
    return {"reasons": reasons}


@router.post("/admin/promo-reasons")
async def create_promo_reason(payload: PromoReasonCreate, current_user: dict = Depends(get_current_user)):
    _ensure_admin(current_user)
    tenant_id = get_current_tenant_id()
    name = (payload.name or "").strip()
    if not name:
        raise HTTPException(status_code=400, detail="Reason name is required.")
    existing = await db.promo_reasons.find_one({"tenant_id": tenant_id, "name": {"$regex": f"^{name}$", "$options": "i"}})
    if existing:
        raise HTTPException(status_code=409, detail="A reason with this name already exists.")
    count = await db.promo_reasons.count_documents({"tenant_id": tenant_id})
    doc = {"id": str(uuid.uuid4()), "tenant_id": tenant_id, "name": name,
           "is_active": True, "sort_order": count, "created_at": datetime.now(timezone.utc).isoformat()}
    await db.promo_reasons.insert_one(doc)
    doc.pop("_id", None)
    return doc


@router.put("/admin/promo-reasons/{reason_id}")
async def update_promo_reason(reason_id: str, payload: PromoReasonUpdate, current_user: dict = Depends(get_current_user)):
    _ensure_admin(current_user)
    tenant_id = get_current_tenant_id()
    updates = {k: v for k, v in payload.dict(exclude_unset=True).items() if v is not None}
    if "name" in updates:
        updates["name"] = updates["name"].strip()
    if not updates:
        raise HTTPException(status_code=400, detail="Nothing to update.")
    res = await db.promo_reasons.update_one({"id": reason_id, "tenant_id": tenant_id}, {"$set": updates})
    if res.matched_count == 0:
        raise HTTPException(status_code=404, detail="Reason not found.")
    return {"ok": True}


@router.delete("/admin/promo-reasons/{reason_id}")
async def delete_promo_reason(reason_id: str, current_user: dict = Depends(get_current_user)):
    _ensure_admin(current_user)
    tenant_id = get_current_tenant_id()
    res = await db.promo_reasons.update_one({"id": reason_id, "tenant_id": tenant_id}, {"$set": {"is_active": False}})
    if res.matched_count == 0:
        raise HTTPException(status_code=404, detail="Reason not found.")
    return {"ok": True}


# ───────────────────────────── Challan numbering ────────────────────────────
async def _generate_challan_number(tenant_id: str) -> str:
    ym = datetime.now(timezone.utc).strftime("%y%m")
    count = await db.promo_dispatches.count_documents({"tenant_id": tenant_id})
    return f"DC-{ym}-{count + 1:04d}"


# ───────────────────────────── Promo dispatch ───────────────────────────────
@router.post("/distributors/{distributor_id}/promo-deliveries")
async def create_promo_dispatch(distributor_id: str, data: PromoDeliveryCreate, current_user: dict = Depends(get_current_user)):
    """Create a promotional (non-sale) stock-out to a Contact: validates stock,
    deducts inventory, and generates a Delivery Challan. Never invoices."""
    if not can_manage_distributor_data(current_user, distributor_id):
        raise HTTPException(status_code=403, detail="Not authorised to manage this distributor's stock-outs")
    tenant_id = get_current_tenant_id()
    now = datetime.now(timezone.utc).isoformat()

    if not data.items:
        raise HTTPException(status_code=400, detail="At least one item is required.")

    # Validate distributor + location
    distributor = await db.distributors.find_one({"id": distributor_id, "tenant_id": tenant_id}, {"_id": 0})
    if not distributor:
        raise HTTPException(status_code=404, detail="Distributor not found")
    loc = await db.distributor_locations.find_one(
        {"id": data.distributor_location_id, "tenant_id": tenant_id, "distributor_id": distributor_id}, {"_id": 0})
    if not loc:
        raise HTTPException(status_code=404, detail="Distributor location not found")

    # Validate contact
    contact = await db.contacts.find_one({"id": data.contact_id, "tenant_id": tenant_id}, {"_id": 0})
    if not contact:
        raise HTTPException(status_code=404, detail="Contact not found")

    # Validate reason against the active master list
    reason = (data.reason or "").strip()
    await _seed_reasons_if_empty(tenant_id)
    valid = await db.promo_reasons.find_one(
        {"tenant_id": tenant_id, "is_active": True, "name": {"$regex": f"^{reason}$", "$options": "i"}})
    if not valid:
        raise HTTPException(status_code=400, detail="Invalid reason. Pick one from the master list in Admin.")

    src_is_factory = bool(loc.get("is_factory"))
    src_tracks_batches = bool(loc.get("track_batches"))

    # ── Validate stock availability for every line (and batch requirement) ──
    for it in data.items:
        if it.quantity is None or it.quantity <= 0:
            raise HTTPException(status_code=400, detail="Quantity must be greater than zero.")
        if src_is_factory and src_tracks_batches and not it.batch_id:
            raise HTTPException(status_code=400, detail=f"Batch is required for SKU {it.sku_name or it.sku_id}.")
        if src_is_factory:
            key = {"tenant_id": tenant_id, "warehouse_location_id": data.distributor_location_id, "sku_id": it.sku_id}
            if src_tracks_batches and it.batch_id:
                key["batch_id"] = it.batch_id
            rows = await db.factory_warehouse_stock.find(key, {"_id": 0, "quantity": 1}).to_list(1000)
        else:
            key = {"tenant_id": tenant_id, "distributor_id": distributor_id,
                   "distributor_location_id": data.distributor_location_id, "sku_id": it.sku_id}
            key["batch_id"] = it.batch_id if it.batch_id else {"$in": [None]}
            rows = await db.distributor_stock.find(key, {"_id": 0, "quantity": 1}).to_list(1000)
        available = sum((r.get("quantity") or 0) for r in rows)
        if available < it.quantity:
            raise HTTPException(
                status_code=400,
                detail=f"Insufficient stock for {it.sku_name or it.sku_id}: {available} available, {it.quantity} requested.")

    # ── Create dispatch header ──
    challan_number = await _generate_challan_number(tenant_id)
    dispatch_id = str(uuid.uuid4())
    contact_addr = ", ".join([x for x in [contact.get("address"), contact.get("city"), contact.get("state")] if x])
    total_qty = sum(it.quantity for it in data.items)
    total_value = sum(it.quantity * float(it.unit_price or 0) for it in data.items)

    dispatch = {
        "id": dispatch_id,
        "tenant_id": tenant_id,
        "distributor_id": distributor_id,
        "distributor_name": distributor.get("distributor_name"),
        "distributor_location_id": data.distributor_location_id,
        "location_name": loc.get("location_name"),
        "is_factory": src_is_factory,
        "contact_id": data.contact_id,
        "contact_name": contact.get("name"),
        "contact_phone": contact.get("phone"),
        "contact_company": contact.get("company"),
        "contact_address": contact_addr,
        "promo_reason": valid.get("name"),
        "challan_number": challan_number,
        "delivery_date": data.delivery_date,
        "reference_number": data.reference_number,
        "vehicle_number": data.vehicle_number,
        "driver_name": data.driver_name,
        "driver_contact": data.driver_contact,
        "delivery_address": data.delivery_address or contact_addr,
        "remarks": data.remarks,
        "total_quantity": total_qty,
        "total_indicative_value": round(total_value, 2),
        "status": "dispatched",
        "created_by": current_user.get("id"),
        "created_by_name": current_user.get("name"),
        "created_at": now,
        "updated_at": now,
    }
    await db.promo_dispatches.insert_one(dispatch)

    # ── Create items + deduct stock (same convention as complete_delivery) ──
    for it in data.items:
        line_value = it.quantity * float(it.unit_price or 0)
        await db.promo_dispatch_items.insert_one({
            "id": str(uuid.uuid4()),
            "tenant_id": tenant_id,
            "dispatch_id": dispatch_id,
            "sku_id": it.sku_id,
            "sku_name": it.sku_name,
            "quantity": it.quantity,
            "unit_price": float(it.unit_price or 0),
            "line_value": round(line_value, 2),
            "batch_id": it.batch_id,
            "batch_code": it.batch_code,
            "remarks": it.remarks,
            "created_at": now,
        })
        if src_is_factory:
            stock_key = {"tenant_id": tenant_id, "warehouse_location_id": data.distributor_location_id, "sku_id": it.sku_id}
            if src_tracks_batches and it.batch_id:
                stock_key["batch_id"] = it.batch_id
            await db.factory_warehouse_stock.update_one(
                stock_key, {"$inc": {"quantity": -it.quantity}, "$set": {"updated_at": now}})
        else:
            stock_key = {"tenant_id": tenant_id, "distributor_id": distributor_id,
                         "distributor_location_id": data.distributor_location_id, "sku_id": it.sku_id}
            stock_key["batch_id"] = it.batch_id if it.batch_id else {"$in": [None]}
            await db.distributor_stock.update_one(
                stock_key, {"$inc": {"quantity": -it.quantity}, "$set": {"updated_at": now}})

    logger.info(f"Promo dispatch {challan_number} created by {current_user.get('email')} (no invoice).")
    dispatch.pop("_id", None)
    return {"message": f"Delivery Challan {challan_number} generated", "dispatch": dispatch}


@router.get("/distributors/{distributor_id}/promo-deliveries")
async def list_promo_dispatches(distributor_id: str, current_user: dict = Depends(get_current_user)):
    if not can_manage_distributor_data(current_user, distributor_id):
        raise HTTPException(status_code=403, detail="Not authorised")
    tenant_id = get_current_tenant_id()
    rows = await db.promo_dispatches.find(
        {"tenant_id": tenant_id, "distributor_id": distributor_id}, {"_id": 0}).to_list(1000)
    rows.sort(key=lambda d: d.get("created_at", ""), reverse=True)
    return {"dispatches": rows}


@router.get("/promo-dispatches/summary")
async def promo_dispatch_summary(current_user: dict = Depends(get_current_user)):
    """Tenant-wide tracking of give-aways: total dispatches, units & indicative value."""
    tenant_id = get_current_tenant_id()
    rows = await db.promo_dispatches.find({"tenant_id": tenant_id}, {"_id": 0}).to_list(5000)
    by_reason: dict = {}
    total_value = 0.0
    total_qty = 0
    for d in rows:
        r = d.get("promo_reason") or "Other"
        b = by_reason.setdefault(r, {"reason": r, "count": 0, "quantity": 0, "indicative_value": 0.0})
        b["count"] += 1
        b["quantity"] += d.get("total_quantity", 0) or 0
        b["indicative_value"] += d.get("total_indicative_value", 0) or 0
        total_value += d.get("total_indicative_value", 0) or 0
        total_qty += d.get("total_quantity", 0) or 0
    for b in by_reason.values():
        b["indicative_value"] = round(b["indicative_value"], 2)
    return {
        "total_dispatches": len(rows),
        "total_quantity": total_qty,
        "total_indicative_value": round(total_value, 2),
        "by_reason": sorted(by_reason.values(), key=lambda x: x["indicative_value"], reverse=True),
    }


@router.get("/distributors/{distributor_id}/promo-deliveries/{dispatch_id}")
async def get_promo_dispatch(distributor_id: str, dispatch_id: str, current_user: dict = Depends(get_current_user)):
    if not can_manage_distributor_data(current_user, distributor_id):
        raise HTTPException(status_code=403, detail="Not authorised")
    tenant_id = get_current_tenant_id()
    d = await db.promo_dispatches.find_one(
        {"id": dispatch_id, "tenant_id": tenant_id, "distributor_id": distributor_id}, {"_id": 0})
    if not d:
        raise HTTPException(status_code=404, detail="Dispatch not found")
    items = await db.promo_dispatch_items.find({"dispatch_id": dispatch_id, "tenant_id": tenant_id}, {"_id": 0}).to_list(500)
    d["items"] = items
    return d


@router.get("/distributors/{distributor_id}/promo-deliveries/{dispatch_id}/challan-pdf")
async def promo_challan_pdf(distributor_id: str, dispatch_id: str, current_user: dict = Depends(get_current_user)):
    if not can_manage_distributor_data(current_user, distributor_id):
        raise HTTPException(status_code=403, detail="Not authorised")
    tenant_id = get_current_tenant_id()
    d = await db.promo_dispatches.find_one(
        {"id": dispatch_id, "tenant_id": tenant_id, "distributor_id": distributor_id}, {"_id": 0})
    if not d:
        raise HTTPException(status_code=404, detail="Dispatch not found")
    items = await db.promo_dispatch_items.find({"dispatch_id": dispatch_id, "tenant_id": tenant_id}, {"_id": 0}).to_list(500)
    d["items"] = items

    tenant = await db.tenants.find_one({"id": tenant_id}, {"_id": 0}) or {}
    company_profile = (tenant.get("settings") or {}).get("company_profile") or tenant.get("company_profile") or {}
    branding = tenant.get("branding") or {}
    contact = await db.contacts.find_one({"id": d.get("contact_id"), "tenant_id": tenant_id}, {"_id": 0}) or {}
    distributor_data = {
        "distributor_name": d.get("distributor_name"),
        "location_name": d.get("location_name"),
    }
    pdf_bytes = generate_delivery_challan_pdf(d, company_profile, contact, distributor_data, branding)
    filename = f"challan_{d.get('challan_number', dispatch_id)}.pdf"
    return Response(
        content=pdf_bytes, media_type="application/pdf",
        headers={"Content-Disposition": f"inline; filename={filename}"})
