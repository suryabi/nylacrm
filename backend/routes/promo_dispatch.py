"""
Promotional / Non-sale stock-out (Delivery Challan) routes.

Sometimes goods are stocked out from a distributor and handed to people saved in
the CRM **Contacts** module — for promotions, networking, brand visibility or
sampling. There is NO sale: no invoice, no account balance, no revenue. Stock
is still deducted (inventory stays accurate) and a **Delivery Challan** is
generated with indicative values marked "Not for Sale".

Zoho integration: a delivery-challan document is also pushed to Zoho Books with
`gst_treatment=out_of_scope` and a prominent "Not for Sale · No Commercial
Value" banner in the notes — purely as an audit trail. A failure to push does
NOT block the local dispatch (it remains usable and can be retried).

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
from services.zoho_service import (
    create_delivery_challan_for_promo_dispatch,
    fetch_delivery_challan_pdf,
    delete_delivery_challan,
    is_zoho_configured,
)
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
async def _adjust_stock_for_dispatch(tenant_id: str, dispatch: dict, items: list, *, sign: int) -> None:
    """Deduct (sign=-1) or restore (sign=+1) stock for every line of a dispatch.
    Mirrors the exact stock-key convention used at creation so reversals land
    on the same stock row. `items` are stored item dicts."""
    now = datetime.now(timezone.utc).isoformat()
    src_is_factory = bool(dispatch.get("is_factory"))
    distributor_id = dispatch.get("distributor_id")
    loc_id = dispatch.get("distributor_location_id")
    for it in items:
        qty = it.get("quantity") or 0
        if not qty:
            continue
        batch_id = it.get("batch_id")
        if src_is_factory:
            stock_key = {"tenant_id": tenant_id, "warehouse_location_id": loc_id, "sku_id": it.get("sku_id")}
            if batch_id and batch_id != "__legacy__":
                stock_key["batch_id"] = batch_id
            await db.factory_warehouse_stock.update_one(
                stock_key, {"$inc": {"quantity": sign * qty}, "$set": {"updated_at": now}})
        else:
            stock_key = {"tenant_id": tenant_id, "distributor_id": distributor_id,
                         "distributor_location_id": loc_id, "sku_id": it.get("sku_id")}
            stock_key["batch_id"] = batch_id if batch_id else {"$in": [None]}
            await db.distributor_stock.update_one(
                stock_key, {"$inc": {"quantity": sign * qty}, "$set": {"updated_at": now}})


async def _check_stock_availability(tenant_id: str, *, src_is_factory: bool, src_tracks_batches: bool,
                                    distributor_id: str, loc_id: str, items: list) -> None:
    """Raise HTTP 400 if any line lacks available stock (used at confirm time)."""
    for it in items:
        qty = it.get("quantity") or 0
        sku_id = it.get("sku_id")
        sku_name = it.get("sku_name")
        batch_id = it.get("batch_id")
        if qty <= 0:
            raise HTTPException(status_code=400, detail="Quantity must be greater than zero.")
        if src_is_factory and src_tracks_batches and not batch_id:
            raise HTTPException(status_code=400, detail=f"Batch is required for SKU {sku_name or sku_id}.")
        if src_is_factory:
            key = {"tenant_id": tenant_id, "warehouse_location_id": loc_id, "sku_id": sku_id}
            if batch_id and batch_id != "__legacy__":
                key["batch_id"] = batch_id
            rows = await db.factory_warehouse_stock.find(key, {"_id": 0, "quantity": 1}).to_list(1000)
        else:
            key = {"tenant_id": tenant_id, "distributor_id": distributor_id,
                   "distributor_location_id": loc_id, "sku_id": sku_id}
            key["batch_id"] = batch_id if batch_id else {"$in": [None]}
            rows = await db.distributor_stock.find(key, {"_id": 0, "quantity": 1}).to_list(1000)
        available = sum((r.get("quantity") or 0) for r in rows)
        if available < qty:
            raise HTTPException(
                status_code=400,
                detail=f"Insufficient stock for {sku_name or sku_id}: {available} available, {qty} requested.")


async def _push_promo_dispatch_to_zoho(tenant_id: str, dispatch_id: str, dispatch: dict, items: list, distributor: dict) -> dict:
    """Best-effort Zoho delivery-challan push. Updates the dispatch row with the
    sync result and returns {status, error}."""
    now = datetime.now(timezone.utc).isoformat()
    items_for_zoho = [{
        "sku_id": it.get("sku_id"),
        "sku_name": it.get("sku_name"),
        "quantity": it.get("quantity"),
        "unit_price": float(it.get("unit_price") or 0),
        "batch_code": it.get("batch_code"),
        "packaging_type_id": it.get("packaging_type_id"),
        "packaging_type_name": it.get("packaging_type_name"),
        "units_per_package": it.get("units_per_package"),
    } for it in items]
    try:
        mapping = await create_delivery_challan_for_promo_dispatch(
            tenant_id=tenant_id, dispatch=dispatch, items=items_for_zoho, distributor=distributor,
        )
        await db.promo_dispatches.update_one(
            {"id": dispatch_id, "tenant_id": tenant_id},
            {"$set": {
                "zoho_sync_status": "synced",
                "zoho_doc_id": mapping.get("zoho_invoice_id"),
                "zoho_doc_number": mapping.get("zoho_invoice_number"),
                "zoho_doc_url": mapping.get("zoho_invoice_url"),
                "zoho_synced_at": now,
                "zoho_sync_error": None,
                "updated_at": now,
            }},
        )
        return {"status": "synced", "error": None,
                "zoho_doc_number": mapping.get("zoho_invoice_number"),
                "zoho_doc_url": mapping.get("zoho_invoice_url")}
    except Exception as exc:
        err = str(exc)[:500]
        logger.exception(f"Zoho push failed for promo dispatch {dispatch.get('challan_number')}; local dispatch saved, can be retried.")
        await db.promo_dispatches.update_one(
            {"id": dispatch_id, "tenant_id": tenant_id},
            {"$set": {"zoho_sync_status": "failed", "zoho_sync_error": err, "updated_at": now}},
        )
        return {"status": "failed", "error": err}


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

    # Validate recipient — a CRM Contact, a Lead, or an internal Employee.
    recipient_type = (data.recipient_type or "contact").lower()
    if recipient_type not in ("contact", "lead", "employee"):
        raise HTTPException(status_code=400, detail="recipient_type must be 'contact', 'lead' or 'employee'.")
    if recipient_type == "lead":
        if not data.lead_id:
            raise HTTPException(status_code=400, detail="lead_id is required when recipient_type is 'lead'.")
        recipient = await db.leads.find_one({"id": data.lead_id, "tenant_id": tenant_id}, {"_id": 0})
        if not recipient:
            raise HTTPException(status_code=404, detail="Lead not found")
        recipient_name = recipient.get("contact_person") or recipient.get("name") or recipient.get("company")
        recipient_company = recipient.get("company")
        recipient_phone = recipient.get("phone")
    elif recipient_type == "employee":
        if not data.employee_id:
            raise HTTPException(status_code=400, detail="employee_id is required when recipient_type is 'employee'.")
        recipient = await db.users.find_one({"id": data.employee_id, "tenant_id": tenant_id}, {"_id": 0, "password": 0})
        if not recipient:
            raise HTTPException(status_code=404, detail="Employee not found")
        if (recipient.get("role") or "") in ("Distributor", "Driver"):
            raise HTTPException(status_code=400, detail="Selected user is not an internal employee.")
        recipient_name = recipient.get("name")
        dept = recipient.get("department")
        if isinstance(dept, list):
            dept = ", ".join(dept)
        recipient_company = " · ".join([x for x in [recipient.get("role"), dept] if x])
        recipient_phone = recipient.get("phone")
    else:
        if not data.contact_id:
            raise HTTPException(status_code=400, detail="contact_id is required when recipient_type is 'contact'.")
        recipient = await db.contacts.find_one({"id": data.contact_id, "tenant_id": tenant_id}, {"_id": 0})
        if not recipient:
            raise HTTPException(status_code=404, detail="Contact not found")
        recipient_name = recipient.get("name")
        recipient_company = recipient.get("company")
        recipient_phone = recipient.get("phone")

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
    # Skipped for drafts — a draft never touches stock and may be saved even
    # when stock is short; full validation runs at Confirm time.
    for it in data.items:
        if it.quantity is None or it.quantity <= 0:
            raise HTTPException(status_code=400, detail="Quantity must be greater than zero.")
        if data.as_draft:
            continue
        if src_is_factory and src_tracks_batches and not it.batch_id:
            raise HTTPException(status_code=400, detail=f"Batch is required for SKU {it.sku_name or it.sku_id}.")
        if src_is_factory:
            key = {"tenant_id": tenant_id, "warehouse_location_id": data.distributor_location_id, "sku_id": it.sku_id}
            # Honour the picked batch whenever the user supplied one — even if
            # the source location wasn't explicitly flagged `track_batches=True`.
            # The frontend now surfaces the batch picker whenever batches exist,
            # so a batch_id here means the rep made a real choice that the
            # backend should respect for both availability and deduction.
            if it.batch_id and it.batch_id != "__legacy__":
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
    contact_addr = ", ".join([x for x in [recipient.get("address"), recipient.get("city"), recipient.get("state")] if x])

    # Build a STRUCTURED shipping address for the recipient (lead / contact /
    # employee) so the Zoho Delivery Challan PDF prints the real Deliver-To
    # block — not the distributor's billing address. Leads created via Lead
    # Discovery carry a nested `delivery_address` dict; older leads/contacts
    # carry the same fields at the top level. We accept both.
    da = recipient.get("delivery_address") if isinstance(recipient.get("delivery_address"), dict) else {}
    recipient_shipping = {
        "attention": recipient_name or "",
        "address": (da.get("address_line1") or recipient.get("address") or "")[:200],
        "street2": (da.get("address_line2") or "")[:200],
        "city":    (da.get("city")    or recipient.get("city")    or "")[:100],
        "state":   (da.get("state")   or recipient.get("state")   or "")[:100],
        "zip":     str(da.get("pincode") or recipient.get("pincode") or "")[:20],
        "country": (da.get("country") or recipient.get("country") or "India")[:50],
        "phone":   recipient_phone or "",
    }

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
        "recipient_type": recipient_type,
        "contact_id": data.contact_id if recipient_type == "contact" else None,
        "lead_id": data.lead_id if recipient_type == "lead" else None,
        "employee_id": data.employee_id if recipient_type == "employee" else None,
        "contact_name": recipient_name,
        "contact_phone": recipient_phone,
        "contact_company": recipient_company,
        "contact_address": contact_addr,
        "promo_reason": valid.get("name"),
        "challan_number": challan_number,
        "delivery_date": data.delivery_date,
        "reference_number": data.reference_number,
        "vehicle_number": data.vehicle_number,
        "driver_name": data.driver_name,
        "driver_contact": data.driver_contact,
        "delivery_address": data.delivery_address or contact_addr,
        # Structured shipping address (recipient) + source warehouse branch
        # mapping — used by the Zoho push to set the right "Deliver To" block
        # and source-branch header. Persisted so retries don't need to re-fetch
        # the lead/contact/employee or the source warehouse.
        "recipient_shipping_address": recipient_shipping,
        "source_zoho_branch_id": loc.get("zoho_branch_id"),
        "source_location_name": loc.get("location_name"),
        "source_gstin": loc.get("gstin"),
        "remarks": data.remarks,
        "total_quantity": total_qty,
        "total_indicative_value": round(total_value, 2),
        "status": "draft" if data.as_draft else "dispatched",
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
            "packaging_type_id": it.packaging_type_id,
            "packaging_type_name": it.packaging_type_name,
            "units_per_package": it.units_per_package,
            "remarks": it.remarks,
            "created_at": now,
        })
        if data.as_draft:
            continue
        if src_is_factory:
            stock_key = {"tenant_id": tenant_id, "warehouse_location_id": data.distributor_location_id, "sku_id": it.sku_id}
            # Mirror the availability check: respect the picked batch when one
            # was supplied, regardless of the location's track_batches flag.
            if it.batch_id and it.batch_id != "__legacy__":
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

    # Drafts stop here — no stock movement, no Zoho document.
    if data.as_draft:
        dispatch.pop("_id", None)
        return {
            "message": f"Draft {challan_number} saved",
            "dispatch": dispatch,
            "zoho_sync_status": "not_attempted",
            "zoho_sync_error": None,
        }

    # ── Best-effort Zoho push (out-of-scope delivery challan, no GST) ──
    zoho_sync_status = "not_attempted"
    zoho_sync_error = None
    if is_zoho_configured():
        try:
            items_for_zoho = [{
                "sku_id": it.sku_id,
                "sku_name": it.sku_name,
                "quantity": it.quantity,
                "unit_price": float(it.unit_price or 0),
                "batch_code": it.batch_code,
                "packaging_type_id": it.packaging_type_id,
                "packaging_type_name": it.packaging_type_name,
                "units_per_package": it.units_per_package,
            } for it in data.items]
            mapping = await create_delivery_challan_for_promo_dispatch(
                tenant_id=tenant_id, dispatch=dispatch, items=items_for_zoho, distributor=distributor,
            )
            zoho_sync_status = "synced"
            await db.promo_dispatches.update_one(
                {"id": dispatch_id, "tenant_id": tenant_id},
                {"$set": {
                    "zoho_sync_status": "synced",
                    "zoho_doc_id": mapping.get("zoho_invoice_id"),
                    "zoho_doc_number": mapping.get("zoho_invoice_number"),
                    "zoho_doc_url": mapping.get("zoho_invoice_url"),
                    "zoho_synced_at": now,
                    "updated_at": datetime.now(timezone.utc).isoformat(),
                }},
            )
            dispatch["zoho_sync_status"] = "synced"
            dispatch["zoho_doc_id"] = mapping.get("zoho_invoice_id")
            dispatch["zoho_doc_number"] = mapping.get("zoho_invoice_number")
            dispatch["zoho_doc_url"] = mapping.get("zoho_invoice_url")
            logger.info(
                f"Promo dispatch {challan_number} pushed to Zoho as "
                f"{mapping.get('zoho_invoice_number')}"
            )
        except Exception as exc:
            zoho_sync_status = "failed"
            zoho_sync_error = str(exc)[:500]
            logger.exception(
                f"Zoho push failed for promo dispatch {challan_number}; "
                f"local dispatch saved, can be retried."
            )
            await db.promo_dispatches.update_one(
                {"id": dispatch_id, "tenant_id": tenant_id},
                {"$set": {
                    "zoho_sync_status": "failed",
                    "zoho_sync_error": zoho_sync_error,
                    "updated_at": datetime.now(timezone.utc).isoformat(),
                }},
            )
            dispatch["zoho_sync_status"] = "failed"
            dispatch["zoho_sync_error"] = zoho_sync_error

    dispatch.pop("_id", None)
    return {
        "message": f"Delivery Challan {challan_number} generated",
        "dispatch": dispatch,
        "zoho_sync_status": zoho_sync_status,
        "zoho_sync_error": zoho_sync_error,
    }


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


@router.post("/distributors/{distributor_id}/promo-deliveries/{dispatch_id}/retry-zoho")
async def retry_zoho_for_promo_dispatch(distributor_id: str, dispatch_id: str, current_user: dict = Depends(get_current_user)):
    """Re-attempt the Zoho delivery-challan push for a dispatch that failed
    (or was created before the integration was configured). Idempotent —
    already-synced dispatches return their existing mapping."""
    if not can_manage_distributor_data(current_user, distributor_id):
        raise HTTPException(status_code=403, detail="Not authorised")
    if not is_zoho_configured():
        raise HTTPException(status_code=400, detail="Zoho Books integration is not configured for this tenant.")
    tenant_id = get_current_tenant_id()
    d = await db.promo_dispatches.find_one(
        {"id": dispatch_id, "tenant_id": tenant_id, "distributor_id": distributor_id}, {"_id": 0})
    if not d:
        raise HTTPException(status_code=404, detail="Dispatch not found")
    items_rows = await db.promo_dispatch_items.find({"dispatch_id": dispatch_id, "tenant_id": tenant_id}, {"_id": 0}).to_list(500)
    distributor = await db.distributors.find_one({"id": distributor_id, "tenant_id": tenant_id}, {"_id": 0}) or {}
    items_for_zoho = [{
        "sku_id": it.get("sku_id"),
        "sku_name": it.get("sku_name"),
        "quantity": it.get("quantity"),
        "unit_price": float(it.get("unit_price") or 0),
        "batch_code": it.get("batch_code"),
        "packaging_type_id": it.get("packaging_type_id"),
        "packaging_type_name": it.get("packaging_type_name"),
        "units_per_package": it.get("units_per_package"),
    } for it in items_rows]
    try:
        mapping = await create_delivery_challan_for_promo_dispatch(
            tenant_id=tenant_id, dispatch=d, items=items_for_zoho, distributor=distributor,
        )
        now = datetime.now(timezone.utc).isoformat()
        await db.promo_dispatches.update_one(
            {"id": dispatch_id, "tenant_id": tenant_id},
            {"$set": {
                "zoho_sync_status": "synced",
                "zoho_doc_id": mapping.get("zoho_invoice_id"),
                "zoho_doc_number": mapping.get("zoho_invoice_number"),
                "zoho_doc_url": mapping.get("zoho_invoice_url"),
                "zoho_synced_at": now,
                "zoho_sync_error": None,
                "updated_at": now,
            }},
        )
        return {"ok": True, "zoho_doc_number": mapping.get("zoho_invoice_number"),
                "zoho_doc_url": mapping.get("zoho_invoice_url")}
    except Exception as exc:
        err = str(exc)[:500]
        logger.exception(f"Retry Zoho push failed for promo dispatch {d.get('challan_number')}")
        await db.promo_dispatches.update_one(
            {"id": dispatch_id, "tenant_id": tenant_id},
            {"$set": {"zoho_sync_status": "failed", "zoho_sync_error": err,
                      "updated_at": datetime.now(timezone.utc).isoformat()}},
        )
        raise HTTPException(status_code=400, detail=f"Zoho push failed: {err}")


@router.post("/distributors/{distributor_id}/promo-deliveries/{dispatch_id}/confirm")
async def confirm_promo_dispatch(distributor_id: str, dispatch_id: str, current_user: dict = Depends(get_current_user)):
    """Confirm a DRAFT stock-out: re-validate stock, deduct inventory, and push
    the Zoho delivery challan (best-effort)."""
    if not can_manage_distributor_data(current_user, distributor_id):
        raise HTTPException(status_code=403, detail="Not authorised")
    tenant_id = get_current_tenant_id()
    d = await db.promo_dispatches.find_one(
        {"id": dispatch_id, "tenant_id": tenant_id, "distributor_id": distributor_id}, {"_id": 0})
    if not d:
        raise HTTPException(status_code=404, detail="Dispatch not found")
    if d.get("status") != "draft":
        raise HTTPException(status_code=400, detail="Only draft stock-outs can be confirmed.")

    loc = await db.distributor_locations.find_one(
        {"id": d.get("distributor_location_id"), "tenant_id": tenant_id}, {"_id": 0}) or {}
    items = await db.promo_dispatch_items.find(
        {"dispatch_id": dispatch_id, "tenant_id": tenant_id}, {"_id": 0}).to_list(500)
    if not items:
        raise HTTPException(status_code=400, detail="This draft has no items.")

    await _check_stock_availability(
        tenant_id, src_is_factory=bool(d.get("is_factory")), src_tracks_batches=bool(loc.get("track_batches")),
        distributor_id=distributor_id, loc_id=d.get("distributor_location_id"), items=items)

    await _adjust_stock_for_dispatch(tenant_id, d, items, sign=-1)
    now = datetime.now(timezone.utc).isoformat()
    await db.promo_dispatches.update_one(
        {"id": dispatch_id, "tenant_id": tenant_id},
        {"$set": {"status": "dispatched", "confirmed_at": now,
                  "confirmed_by": current_user.get("id"), "updated_at": now}})
    d["status"] = "dispatched"

    zres = {"status": "not_attempted", "error": None}
    if is_zoho_configured():
        distributor = await db.distributors.find_one({"id": distributor_id, "tenant_id": tenant_id}, {"_id": 0}) or {}
        zres = await _push_promo_dispatch_to_zoho(tenant_id, dispatch_id, d, items, distributor)

    updated = await db.promo_dispatches.find_one({"id": dispatch_id, "tenant_id": tenant_id}, {"_id": 0})
    return {"message": f"Challan {d.get('challan_number')} confirmed",
            "dispatch": updated, "zoho_sync_status": zres.get("status"), "zoho_sync_error": zres.get("error")}


@router.post("/distributors/{distributor_id}/promo-deliveries/{dispatch_id}/reverse")
async def reverse_promo_dispatch(distributor_id: str, dispatch_id: str, current_user: dict = Depends(get_current_user)):
    """Reverse a CONFIRMED stock-out: add stock back to inventory and delete the
    Zoho delivery challan. The record is kept and marked 'reversed' for audit.
    If the Zoho deletion fails, the reversal still completes and is flagged
    'zoho_cleanup_pending' for a later retry."""
    if not can_manage_distributor_data(current_user, distributor_id):
        raise HTTPException(status_code=403, detail="Not authorised")
    tenant_id = get_current_tenant_id()
    d = await db.promo_dispatches.find_one(
        {"id": dispatch_id, "tenant_id": tenant_id, "distributor_id": distributor_id}, {"_id": 0})
    if not d:
        raise HTTPException(status_code=404, detail="Dispatch not found")
    if d.get("status") != "dispatched":
        raise HTTPException(status_code=400, detail="Only confirmed stock-outs can be reversed.")

    items = await db.promo_dispatch_items.find(
        {"dispatch_id": dispatch_id, "tenant_id": tenant_id}, {"_id": 0}).to_list(500)

    # 1) Restore stock
    await _adjust_stock_for_dispatch(tenant_id, d, items, sign=+1)

    # 2) Delete the Zoho delivery challan (if one was created)
    zoho_cleanup_pending = False
    zoho_cleanup_error = None
    has_zoho_doc = bool(d.get("zoho_doc_id")) and d.get("zoho_sync_status") == "synced"
    if has_zoho_doc:
        try:
            await delete_delivery_challan(tenant_id, d.get("zoho_doc_id"))
        except Exception as exc:
            zoho_cleanup_pending = True
            zoho_cleanup_error = str(exc)[:500]
            logger.exception(f"Zoho challan delete failed during reverse for {d.get('challan_number')}")

    now = datetime.now(timezone.utc).isoformat()
    set_fields = {
        "status": "reversed",
        "reversed_at": now,
        "reversed_by": current_user.get("id"),
        "reversed_by_name": current_user.get("name"),
        "updated_at": now,
        "zoho_cleanup_pending": zoho_cleanup_pending,
        "zoho_cleanup_error": zoho_cleanup_error,
    }
    if has_zoho_doc and not zoho_cleanup_pending:
        set_fields["zoho_doc_deleted"] = True
    await db.promo_dispatches.update_one({"id": dispatch_id, "tenant_id": tenant_id}, {"$set": set_fields})

    msg = f"Stock-out {d.get('challan_number')} reversed — stock restored"
    if has_zoho_doc:
        msg += " (Zoho challan deletion pending — will retry)" if zoho_cleanup_pending else " and Zoho challan deleted"
    updated = await db.promo_dispatches.find_one({"id": dispatch_id, "tenant_id": tenant_id}, {"_id": 0})
    return {"ok": True, "dispatch": updated, "message": msg,
            "zoho_cleanup_pending": zoho_cleanup_pending, "zoho_cleanup_error": zoho_cleanup_error}


@router.post("/distributors/{distributor_id}/promo-deliveries/{dispatch_id}/reverse-zoho-cleanup")
async def retry_reverse_zoho_cleanup(distributor_id: str, dispatch_id: str, current_user: dict = Depends(get_current_user)):
    """Re-attempt deleting the Zoho delivery challan for a reversed stock-out
    whose Zoho cleanup is still pending."""
    if not can_manage_distributor_data(current_user, distributor_id):
        raise HTTPException(status_code=403, detail="Not authorised")
    if not is_zoho_configured():
        raise HTTPException(status_code=400, detail="Zoho Books integration is not configured for this tenant.")
    tenant_id = get_current_tenant_id()
    d = await db.promo_dispatches.find_one(
        {"id": dispatch_id, "tenant_id": tenant_id, "distributor_id": distributor_id}, {"_id": 0})
    if not d:
        raise HTTPException(status_code=404, detail="Dispatch not found")
    if d.get("status") != "reversed" or not d.get("zoho_cleanup_pending"):
        raise HTTPException(status_code=400, detail="No pending Zoho cleanup for this stock-out.")
    now = datetime.now(timezone.utc).isoformat()
    try:
        await delete_delivery_challan(tenant_id, d.get("zoho_doc_id"))
    except Exception as exc:
        err = str(exc)[:500]
        await db.promo_dispatches.update_one(
            {"id": dispatch_id, "tenant_id": tenant_id},
            {"$set": {"zoho_cleanup_error": err, "updated_at": now}})
        raise HTTPException(status_code=400, detail=f"Zoho cleanup failed: {err}")
    await db.promo_dispatches.update_one(
        {"id": dispatch_id, "tenant_id": tenant_id},
        {"$set": {"zoho_cleanup_pending": False, "zoho_cleanup_error": None,
                  "zoho_doc_deleted": True, "updated_at": now}})
    return {"ok": True, "message": "Zoho delivery challan deleted."}


@router.delete("/distributors/{distributor_id}/promo-deliveries/{dispatch_id}")
async def delete_promo_dispatch(distributor_id: str, dispatch_id: str, current_user: dict = Depends(get_current_user)):
    """Hard-delete a stock-out. Allowed only for DRAFT (never touched stock) or
    REVERSED (stock already restored) records — a confirmed stock-out must be
    reversed first."""
    if not can_manage_distributor_data(current_user, distributor_id):
        raise HTTPException(status_code=403, detail="Not authorised")
    tenant_id = get_current_tenant_id()
    d = await db.promo_dispatches.find_one(
        {"id": dispatch_id, "tenant_id": tenant_id, "distributor_id": distributor_id}, {"_id": 0})
    if not d:
        raise HTTPException(status_code=404, detail="Dispatch not found")
    if d.get("status") not in ("draft", "reversed"):
        raise HTTPException(
            status_code=400,
            detail="Only draft or reversed stock-outs can be deleted. Reverse a confirmed stock-out first.")
    await db.promo_dispatch_items.delete_many({"dispatch_id": dispatch_id, "tenant_id": tenant_id})
    await db.promo_dispatches.delete_one({"id": dispatch_id, "tenant_id": tenant_id})
    return {"ok": True, "deleted": dispatch_id}


@router.get("/distributors/{distributor_id}/promo-deliveries/{dispatch_id}/challan-pdf")
async def promo_challan_pdf(distributor_id: str, dispatch_id: str, current_user: dict = Depends(get_current_user)):
    if not can_manage_distributor_data(current_user, distributor_id):
        raise HTTPException(status_code=403, detail="Not authorised")
    tenant_id = get_current_tenant_id()
    d = await db.promo_dispatches.find_one(
        {"id": dispatch_id, "tenant_id": tenant_id, "distributor_id": distributor_id}, {"_id": 0})
    if not d:
        raise HTTPException(status_code=404, detail="Dispatch not found")

    # Prefer the Zoho-rendered PDF when the dispatch has been synced — that
    # is the only source of truth once it's pushed (no duplicate documents).
    # The locally-rendered PDF is kept strictly as a fallback for dispatches
    # that pre-date the integration or whose Zoho push failed.
    if d.get("zoho_sync_status") == "synced" and d.get("zoho_doc_id"):
        try:
            pdf_bytes, _zoho_challan_no = await fetch_delivery_challan_pdf(tenant_id, d["zoho_doc_id"])
            filename = f"challan_{d.get('zoho_doc_number') or d.get('challan_number', dispatch_id)}.pdf"
            return Response(
                content=pdf_bytes, media_type="application/pdf",
                headers={"Content-Disposition": f"inline; filename={filename}"})
        except Exception:
            logger.exception(
                f"Zoho PDF fetch failed for promo dispatch {d.get('challan_number')}; "
                f"falling back to locally-rendered PDF."
            )

    items = await db.promo_dispatch_items.find({"dispatch_id": dispatch_id, "tenant_id": tenant_id}, {"_id": 0}).to_list(500)
    d["items"] = items

    tenant = await db.tenants.find_one({"id": tenant_id}, {"_id": 0}) or {}
    company_profile = (tenant.get("settings") or {}).get("company_profile") or tenant.get("company_profile") or {}
    branding = tenant.get("branding") or {}
    # Build the recipient block from the stored dispatch fields (works for both
    # Contact and Lead recipients without re-fetching).
    contact_data = {
        "name": d.get("contact_name"),
        "company": d.get("contact_company"),
        "phone": d.get("contact_phone"),
        "address": d.get("contact_address"),
    }
    distributor_data = {
        "distributor_name": d.get("distributor_name"),
        "location_name": d.get("location_name"),
    }
    pdf_bytes = generate_delivery_challan_pdf(d, company_profile, contact_data, distributor_data, branding)
    filename = f"challan_{d.get('challan_number', dispatch_id)}.pdf"
    return Response(
        content=pdf_bytes, media_type="application/pdf",
        headers={"Content-Disposition": f"inline; filename={filename}"})
