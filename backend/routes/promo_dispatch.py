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
from typing import Optional, List
from datetime import datetime, timezone
import uuid
import logging
import re

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
from routes.distributors import _reserved_qty_map, RESERVED_DELIVERY_STATUSES, generate_delivery_number
from utils.pdf_generator import generate_delivery_challan_pdf

logger = logging.getLogger(__name__)
router = APIRouter(tags=["Promotional Dispatch"])

ADMIN_ROLES = {"CEO", "Director", "Admin", "admin", "Super Admin", "super_admin"}
DEFAULT_REASONS = ["Promotion", "Networking", "Brand Visibility", "Sampling", "Other"]

# Promo stock-outs now live in `distributor_deliveries` (flagged is_promo=True)
# so they share the regular delivery lifecycle, the stock-reservation pool and
# the delivery-schedule system. Legacy records created before this change still
# live in `promo_dispatches` and remain viewable (historical, read-only).
PROMO_OPEN_STATUSES = ["draft", "confirmed", "delivery_assigned", "delivery_scheduled", "scheduled", "on_the_way", "in_transit"]


def _promo_delivery_response(doc: dict) -> dict:
    """Normalise an is_promo `distributor_deliveries` doc to the shape the promo
    UI expects (challan_number, status, zoho_doc_* …) without leaking Mongo
    internals."""
    d = {k: v for k, v in doc.items() if k != "_id"}
    d.setdefault("challan_number", d.get("delivery_number"))
    return d


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
    """Next unique DC number. Takes the highest existing numeric suffix across
    BOTH storage generations (legacy promo_dispatches + unified is_promo
    deliveries) — the old count-based scheme only counted the legacy collection,
    which froze the sequence and re-issued duplicate challan numbers."""
    ym = datetime.now(timezone.utc).strftime("%y%m")
    max_seq = 0
    for coll, q in ((db.promo_dispatches, {"tenant_id": tenant_id}),
                    (db.distributor_deliveries, {"tenant_id": tenant_id, "is_promo": True})):
        async for doc in coll.find(q, {"_id": 0, "challan_number": 1}):
            m = re.match(r"^DC-\d{4}-(\d+)$", doc.get("challan_number") or "")
            if m:
                max_seq = max(max_seq, int(m.group(1)))
    return f"DC-{ym}-{max_seq + 1:04d}"


# ───────────────────────────── Promo dispatch ───────────────────────────────
async def _allowed_child_ids(tenant_id: str, sku_ids: list) -> dict:
    """sku_id → [None, <generic child id>]: stock rows a promo line may draw
    from. Bottles held under a GENERIC child SKU are physically unbranded and
    freely dispatchable, so they count alongside null-child rows. Customer-
    branded children stay excluded. (Production bug: warehouse stock lived
    under the generic child — e.g. '24 Generic brand', 281 bottles — while
    every promo query hardcoded child_sku_id=None → 'available 0'.)"""
    out = {s: [None] for s in sku_ids if s}
    if not out:
        return out
    async for cs in db.child_skus.find(
            {"tenant_id": tenant_id, "parent_sku_id": {"$in": list(out.keys())},
             "$or": [{"child_type": "generic"},
                     # legacy children created before child_type existed
                     {"child_sku_name": {"$regex": "generic|unbranded", "$options": "i"}}]},
            {"_id": 0, "id": 1, "parent_sku_id": 1}):
        out[cs["parent_sku_id"]].append(cs["id"])
    return out


async def _stock_rows_summary(tenant_id: str, src_is_factory: bool, distributor_id: str,
                              loc_id: str, sku_id: str) -> str:
    """Short human-readable dump of EVERY stock row for a SKU at a location —
    appended to 'insufficient stock' errors so a production failure
    self-reports the data shape (child/batch split) we cannot inspect."""
    if src_is_factory:
        cur = db.factory_warehouse_stock.find(
            {"tenant_id": tenant_id, "warehouse_location_id": loc_id, "sku_id": sku_id},
            {"_id": 0, "child_sku_name": 1, "batch_code": 1, "quantity": 1})
    else:
        cur = db.distributor_stock.find(
            {"tenant_id": tenant_id, "distributor_id": distributor_id,
             "distributor_location_id": loc_id, "sku_id": sku_id},
            {"_id": 0, "child_sku_name": 1, "batch_code": 1, "quantity": 1})
    parts = []
    for r in await cur.to_list(50):
        label = r.get("child_sku_name") or "no-child"
        if r.get("batch_code"):
            label += f"/{r['batch_code']}"
        parts.append(f"{label}: {r.get('quantity') or 0}")
    return "; ".join(parts)[:300] if parts else "no stock rows for this SKU at this warehouse"


async def _adjust_stock_for_dispatch(tenant_id: str, dispatch: dict, items: list, *, sign: int) -> None:
    """Deduct (sign=-1) or restore (sign=+1) stock for every line of a dispatch.
    Child-SKU aware: a line with an explicit `child_sku_id` (set by batch
    allocation) hits exactly that row; otherwise the null-child row is used
    first, then the SKU's generic-child row. Deductions split across rows so a
    row is never driven negative while another still holds stock."""
    now = datetime.now(timezone.utc).isoformat()
    src_is_factory = bool(dispatch.get("is_factory"))
    distributor_id = dispatch.get("distributor_id")
    loc_id = dispatch.get("distributor_location_id")
    allowed = await _allowed_child_ids(tenant_id, [it.get("sku_id") for it in items])
    for it in items:
        qty = it.get("quantity") or 0
        if not qty:
            continue
        batch_id = it.get("batch_id")
        if src_is_factory:
            coll = db.factory_warehouse_stock
            base = {"tenant_id": tenant_id, "warehouse_location_id": loc_id, "sku_id": it.get("sku_id")}
            if batch_id and batch_id != "__legacy__":
                base["batch_id"] = batch_id
        else:
            coll = db.distributor_stock
            base = {"tenant_id": tenant_id, "distributor_id": distributor_id,
                    "distributor_location_id": loc_id, "sku_id": it.get("sku_id")}
            base["batch_id"] = batch_id if batch_id else {"$in": [None]}
        child_vals = [it["child_sku_id"]] if it.get("child_sku_id") else allowed.get(it.get("sku_id"), [None])
        key = {**base, "child_sku_id": {"$in": child_vals}}
        if sign > 0:
            await coll.update_one(key, {"$inc": {"quantity": qty}, "$set": {"updated_at": now}})
            continue
        # Deduction: walk matching rows (null-child first) and split as needed.
        rows = await coll.find({**key, "quantity": {"$gt": 0}},
                               {"_id": 0, "id": 1, "quantity": 1, "child_sku_id": 1}).to_list(100)
        rows.sort(key=lambda r: r.get("child_sku_id") is not None)
        remaining = qty
        for r in rows:
            take = min(int(r.get("quantity") or 0), remaining)
            if take <= 0:
                continue
            await coll.update_one({"id": r["id"], "tenant_id": tenant_id},
                                  {"$inc": {"quantity": -take}, "$set": {"updated_at": now}})
            remaining -= take
            if remaining <= 0:
                break
        if remaining > 0:
            # Legacy behaviour: drive a matching row negative (audit-visible).
            await coll.update_one(key, {"$inc": {"quantity": -remaining}, "$set": {"updated_at": now}})


async def _check_stock_availability(tenant_id: str, *, src_is_factory: bool, src_tracks_batches: bool,
                                    distributor_id: str, loc_id: str, items: list) -> None:
    """Raise HTTP 400 if any line lacks available stock (used at confirm time).
    Counts null-child AND generic-child stock rows (unbranded bottles)."""
    allowed = await _allowed_child_ids(tenant_id, [it.get("sku_id") for it in items])
    for it in items:
        qty = it.get("quantity") or 0
        sku_id = it.get("sku_id")
        sku_name = it.get("sku_name")
        batch_id = it.get("batch_id")
        child_vals = allowed.get(sku_id, [None])
        if qty <= 0:
            raise HTTPException(status_code=400, detail="Quantity must be greater than zero.")
        if src_is_factory and src_tracks_batches and not batch_id:
            raise HTTPException(status_code=400, detail=f"Batch is required for SKU {sku_name or sku_id}.")
        if src_is_factory:
            key = {"tenant_id": tenant_id, "warehouse_location_id": loc_id, "sku_id": sku_id,
                   "child_sku_id": {"$in": child_vals}}
            if batch_id and batch_id != "__legacy__":
                key["batch_id"] = batch_id
            rows = await db.factory_warehouse_stock.find(key, {"_id": 0, "quantity": 1}).to_list(1000)
        else:
            key = {"tenant_id": tenant_id, "distributor_id": distributor_id,
                   "distributor_location_id": loc_id, "sku_id": sku_id,
                   "child_sku_id": {"$in": child_vals}}
            key["batch_id"] = batch_id if batch_id else {"$in": [None]}
            rows = await db.distributor_stock.find(key, {"_id": 0, "quantity": 1}).to_list(1000)
        available = sum((r.get("quantity") or 0) for r in rows)
        if available < qty:
            raise HTTPException(
                status_code=400,
                detail=f"Insufficient stock for {sku_name or sku_id}: {available} available, {qty} requested.")


async def _allocate_batches_if_needed(tenant_id: str, d: dict, items: list, dispatch_id: str) -> list:
    """For a batch-tracked source, replace any line lacking a `batch_id` with one
    or more batch-allocated lines (FIFO across available stock, reservation-aware).

    This is essential for stock-outs auto-created from a Delivery Order, which
    never pick a batch: without this, confirm looks only for null-batch stock
    (which is zero on a batch-tracked warehouse) and falsely reports
    "available 0" even though plenty of batched stock exists. Rewrites the
    delivery's line items in place. Raises 400 if a SKU cannot be fully
    allocated from available batches."""
    distributor_id = d.get("distributor_id")
    loc_id = d.get("distributor_location_id")
    src_is_factory = bool(d.get("is_factory"))
    reserved = await _reserved_qty_map(tenant_id, distributor_id, loc_id, True, exclude_delivery_id=dispatch_id)
    allowed = await _allowed_child_ids(tenant_id, [it.get("sku_id") for it in items])
    new_items: list = []
    changed = False
    for it in items:
        if it.get("batch_id"):
            new_items.append(it)
            continue
        sku_id = it.get("sku_id")
        sku_name = it.get("sku_name")
        need = int(it.get("quantity") or 0)
        unit_price = float(it.get("unit_price") or 0)
        child_vals = allowed.get(sku_id, [None])
        if src_is_factory:
            rows = await db.factory_warehouse_stock.find(
                {"tenant_id": tenant_id, "warehouse_location_id": loc_id, "sku_id": sku_id,
                 "batch_id": {"$ne": None}, "quantity": {"$gt": 0}, "child_sku_id": {"$in": child_vals}},
                {"_id": 0, "batch_id": 1, "batch_code": 1, "quantity": 1, "production_date": 1,
                 "created_at": 1, "child_sku_id": 1, "child_sku_name": 1}).to_list(2000)
            rows.sort(key=lambda r: (r.get("production_date") or r.get("created_at") or "9999"))
        else:
            rows = await db.distributor_stock.find(
                {"tenant_id": tenant_id, "distributor_id": distributor_id, "distributor_location_id": loc_id,
                 "sku_id": sku_id, "batch_id": {"$ne": None}, "quantity": {"$gt": 0}, "child_sku_id": {"$in": child_vals}},
                {"_id": 0, "batch_id": 1, "batch_code": 1, "quantity": 1, "created_at": 1,
                 "child_sku_id": 1, "child_sku_name": 1}).to_list(2000)
            rows.sort(key=lambda r: (r.get("created_at") or "9999"))
        remaining = need
        allocations = []
        for r in rows:
            bid = r.get("batch_id")
            avail = int(r.get("quantity") or 0) - int(reserved.get((sku_id, bid), 0))
            if avail <= 0:
                continue
            take = min(avail, remaining)
            allocations.append((bid, r.get("batch_code"), take, r.get("child_sku_id"), r.get("child_sku_name")))
            # Reserve within this allocation pass so multiple null-batch lines of
            # the same SKU don't double-allocate the same batch.
            reserved[(sku_id, bid)] = int(reserved.get((sku_id, bid), 0)) + take
            remaining -= take
            if remaining <= 0:
                break
        if remaining > 0:
            # Fall back to NULL-BATCH rows (legacy stock-in / branding conversion
            # rows on a batch-tracked warehouse carry no batch). Lines allocated
            # here simply stay batch-less.
            if src_is_factory:
                nb_rows = await db.factory_warehouse_stock.find(
                    {"tenant_id": tenant_id, "warehouse_location_id": loc_id, "sku_id": sku_id,
                     "batch_id": None, "quantity": {"$gt": 0}, "child_sku_id": {"$in": child_vals}},
                    {"_id": 0, "quantity": 1, "child_sku_id": 1, "child_sku_name": 1}).to_list(100)
            else:
                nb_rows = await db.distributor_stock.find(
                    {"tenant_id": tenant_id, "distributor_id": distributor_id, "distributor_location_id": loc_id,
                     "sku_id": sku_id, "batch_id": None, "quantity": {"$gt": 0}, "child_sku_id": {"$in": child_vals}},
                    {"_id": 0, "quantity": 1, "child_sku_id": 1, "child_sku_name": 1}).to_list(100)
            for r in nb_rows:
                avail = int(r.get("quantity") or 0) - int(reserved.get((sku_id, None), 0))
                if avail <= 0:
                    continue
                take = min(avail, remaining)
                allocations.append((None, None, take, r.get("child_sku_id"), r.get("child_sku_name")))
                reserved[(sku_id, None)] = int(reserved.get((sku_id, None), 0)) + take
                remaining -= take
                if remaining <= 0:
                    break
        if remaining > 0:
            diag = await _stock_rows_summary(tenant_id, src_is_factory, distributor_id, loc_id, sku_id)
            raise HTTPException(
                status_code=400,
                detail=f"Insufficient stock for {sku_name or sku_id}: need {need}, "
                       f"available {need - remaining}. Stock rows here → {diag}")
        changed = True
        for bid, bcode, take, child_id, child_name in allocations:
            line = {**it}
            line.pop("_id", None)
            line["batch_id"] = bid
            line["batch_code"] = bcode
            line["quantity"] = take
            line["line_value"] = round(take * unit_price, 2)
            if child_id:
                line["child_sku_id"] = child_id
                line["child_sku_name"] = child_name
            new_items.append(line)
    if changed:
        await db.distributor_delivery_items.delete_many({"tenant_id": tenant_id, "delivery_id": dispatch_id})
        docs = []
        for line in new_items:
            doc = {**line}
            doc["id"] = str(uuid.uuid4())
            doc["tenant_id"] = tenant_id
            doc["delivery_id"] = dispatch_id
            docs.append(doc)
        if docs:
            await db.distributor_delivery_items.insert_many(docs)
    return new_items


async def _derived_on_hand_by_sku(tenant_id: str, distributor_id: str, loc_id: str,
                                  sku_ids: list) -> dict:
    """Dashboard-consistent on-hand (received − delivered) for non-factory,
    non-batch distributor sources. Single-location distributors are scoped
    distributor-wide because legacy shipments often lack a
    `distributor_location_id`, which would otherwise tally received=0 while
    delivered matches — driving on-hand negative (e.g. -720) even though the
    dashboard (distributor-wide) shows thousands available. Mirrors the regular
    Stock-Out guard in routes/distributors.py::create_delivery so the promo
    guard never disagrees with the dashboard the user just saw.
    (Bug hit in production for the Goa distributor, 2026-06.)"""
    out: dict = {}
    sku_ids = [s for s in sku_ids if s]
    if not sku_ids:
        return out
    non_factory_loc_count = await db.distributor_locations.count_documents({
        "tenant_id": tenant_id, "distributor_id": distributor_id,
        "is_factory": {"$ne": True},
    })
    single_location = non_factory_loc_count <= 1
    ship_filter = {"tenant_id": tenant_id, "distributor_id": distributor_id, "status": "delivered"}
    del_filter = {"tenant_id": tenant_id, "distributor_id": distributor_id,
                  "status": {"$in": ["delivered", "completed", "complete"]}}
    if not single_location:
        ship_filter["distributor_location_id"] = loc_id
        del_filter["distributor_location_id"] = loc_id
    # Received = sum(delivered shipment_items)
    delivered_ship_ids = await db.distributor_shipments.distinct("id", ship_filter)
    for srow in await db.distributor_shipment_items.find(
        {"tenant_id": tenant_id, "shipment_id": {"$in": delivered_ship_ids}, "sku_id": {"$in": sku_ids}},
        {"_id": 0, "sku_id": 1, "quantity": 1, "received_quantity": 1},
    ).to_list(20000):
        q = int(srow.get("received_quantity") or srow.get("quantity") or 0)
        out[srow["sku_id"]] = out.get(srow["sku_id"], 0) + q
    # Delivered out = sum(items on completed deliveries)
    done_delivery_ids = await db.distributor_deliveries.distinct("id", del_filter)
    for drow in await db.distributor_delivery_items.find(
        {"tenant_id": tenant_id, "delivery_id": {"$in": done_delivery_ids}, "sku_id": {"$in": sku_ids}},
        {"_id": 0, "sku_id": 1, "quantity": 1},
    ).to_list(20000):
        out[drow["sku_id"]] = out.get(drow["sku_id"], 0) - int(drow.get("quantity") or 0)
    # NOTE: open/pending orders are netted out separately via the Reserved map.
    return out



async def _push_promo_dispatch_to_zoho(tenant_id: str, dispatch_id: str, dispatch: dict, items: list, distributor: dict, coll=None) -> dict:
    """Best-effort Zoho delivery-challan push. Updates the dispatch/delivery row
    with the sync result and returns {status, error}. `coll` defaults to the
    legacy promo_dispatches collection; pass db.distributor_deliveries for the
    new unified records."""
    coll = coll if coll is not None else db.promo_dispatches
    now = datetime.now(timezone.utc).isoformat()
    items_for_zoho = [{
        "sku_id": it.get("sku_id"),
        "sku_name": it.get("sku_name"),
        "quantity": it.get("quantity"),
        "unit_price": float(it.get("unit_price") or 0),
        "batch_code": it.get("batch_code"),
        "packaging_type_id": it.get("packaging_type_id"),
        "packaging_type_name": it.get("packaging_type_name"),
        "packaging_units": it.get("packaging_units") or it.get("units_per_package"),
        "packages": it.get("packages"),
        "units_per_package": it.get("units_per_package"),
    } for it in items]
    try:
        mapping = await create_delivery_challan_for_promo_dispatch(
            tenant_id=tenant_id, dispatch=dispatch, items=items_for_zoho, distributor=distributor,
        )
        await coll.update_one(
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
        await coll.update_one(
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

    # ── Validate stock availability (reservation-aware) ────────────────────
    # Available = on-hand − reserved (open promo + regular Stock Outs at this
    # source location). Skipped for drafts — a draft may be saved even when
    # short; full validation runs at Confirm time.
    for it in data.items:
        if it.quantity is None or it.quantity <= 0:
            raise HTTPException(status_code=400, detail="Quantity must be greater than zero.")
    if not data.as_draft:
        reserved_map = await _reserved_qty_map(
            tenant_id, distributor_id, data.distributor_location_id, src_tracks_batches)
        demand_map: dict = {}
        for it in data.items:
            if src_is_factory and src_tracks_batches and not it.batch_id:
                raise HTTPException(status_code=400, detail=f"Batch is required for SKU {it.sku_name or it.sku_id}.")
            bkey = it.batch_id if src_tracks_batches else None
            k = (it.sku_id, bkey, it.sku_name)
            # Demand is in BOTTLES — the user enters crates (packages), so multiply
            # by units-per-package. on_hand / reserved are bottle-level.
            upp = int(it.units_per_package or 1) or 1
            demand_map[k] = demand_map.get(k, 0) + (it.quantity * upp)
        derived = {}
        if not src_is_factory and not src_tracks_batches:
            derived = await _derived_on_hand_by_sku(
                tenant_id, distributor_id, data.distributor_location_id,
                [s for (s, _b, _n) in demand_map.keys()])
        for (sku_id, bkey, sku_name), demand in demand_map.items():
            if src_is_factory:
                key = {"tenant_id": tenant_id, "warehouse_location_id": data.distributor_location_id, "sku_id": sku_id}
                if bkey and bkey != "__legacy__":
                    key["batch_id"] = bkey
                rows = await db.factory_warehouse_stock.find(key, {"_id": 0, "quantity": 1}).to_list(1000)
            else:
                key = {"tenant_id": tenant_id, "distributor_id": distributor_id,
                       "distributor_location_id": data.distributor_location_id, "sku_id": sku_id}
                key["batch_id"] = bkey if bkey else {"$in": [None]}
                rows = await db.distributor_stock.find(key, {"_id": 0, "quantity": 1}).to_list(1000)
            on_hand_rows = sum((r.get("quantity") or 0) for r in rows)
            # Never be more restrictive than the dashboard the user just saw.
            on_hand = max(on_hand_rows, derived.get(sku_id, 0)) if (not src_is_factory and not src_tracks_batches) else on_hand_rows
            reserved = reserved_map.get((sku_id, bkey), 0)
            available = on_hand - reserved
            if available < demand:
                committed = f", {reserved} reserved" if reserved else ""
                raise HTTPException(
                    status_code=400,
                    detail=f"Insufficient stock for {sku_name or sku_id}: need {demand}, "
                           f"available {available} ({on_hand} on-hand{committed}).")

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
    # Pasted Google Maps link — dispatch form wins, else the recipient's saved link.
    maps_link = (data.maps_link or da.get("maps_link") or recipient.get("maps_link") or "").strip() or None
    recipient_shipping = {
        "attention": recipient_name or "",
        "address": (da.get("address_line1") or recipient.get("address") or "")[:200],
        "street2": (da.get("address_line2") or "")[:200],
        "city":    (da.get("city")    or recipient.get("city")    or "")[:100],
        "state":   (da.get("state")   or recipient.get("state")   or "")[:100],
        "zip":     str(da.get("pincode") or recipient.get("pincode") or "")[:20],
        "country": (da.get("country") or recipient.get("country") or "India")[:50],
        "phone":   recipient_phone or "",
        "maps_link": maps_link,
    }

    total_qty = sum(
        it.quantity if (getattr(it, "quantity_unit", None) or "packages") == "bottles"
        else it.quantity * (int(it.units_per_package or 1) or 1)
        for it in data.items)
    total_value = sum(it.quantity * float(it.unit_price or 0) for it in data.items)

    # Promo stock-out persisted as an is_promo DELIVERY so it shares the
    # regular lifecycle (draft→confirmed→delivery_assigned→complete), the
    # stock-reservation pool and the delivery-schedule system. NO stock is
    # deducted here — an open delivery merely RESERVES stock; physical
    # deduction happens at Complete.
    dispatch = {
        "id": dispatch_id,
        "tenant_id": tenant_id,
        "is_promo": True,
        "distributor_id": distributor_id,
        "distributor_name": distributor.get("distributor_name"),
        "distributor_code": distributor.get("distributor_code"),
        "distributor_location_id": data.distributor_location_id,
        "distributor_location_name": loc.get("location_name"),
        "location_name": loc.get("location_name"),
        "is_factory": src_is_factory,
        # Recipient (lead / contact / employee). No billing account.
        "account_id": None,
        "account_name": recipient_name,          # shown as the "customer" in the deliveries list
        "recipient_type": recipient_type,
        "contact_id": data.contact_id if recipient_type == "contact" else None,
        "lead_id": data.lead_id if recipient_type == "lead" else None,
        "employee_id": data.employee_id if recipient_type == "employee" else None,
        "contact_name": recipient_name,
        "contact_phone": recipient_phone,
        "contact_company": recipient_company,
        "contact_address": contact_addr,
        "promo_reason": valid.get("name"),
        # delivery_number drives the schedule/deliveries UI; challan_number is
        # the same value kept for the promo UI / Zoho challan.
        "delivery_number": challan_number,
        "challan_number": challan_number,
        "delivery_date": data.delivery_date,
        "reference_number": data.reference_number,
        "vehicle_number": data.vehicle_number,
        "driver_name": data.driver_name,
        "driver_contact": data.driver_contact,
        "delivery_address": data.delivery_address or contact_addr,
        "maps_link": maps_link,
        "recipient_shipping_address": recipient_shipping,
        "source_zoho_branch_id": loc.get("zoho_branch_id"),
        "source_location_name": loc.get("location_name"),
        "source_gstin": loc.get("gstin"),
        "remarks": data.remarks,
        "total_quantity": total_qty,
        "total_indicative_value": round(total_value, 2),
        # No sale → all monetary delivery totals are zero (keeps settlement /
        # outstanding math untouched; promo is excluded from billing anyway).
        "total_net_amount": 0,
        "total_gross_amount": 0,
        "status": "draft" if data.as_draft else "confirmed",
        "zoho_sync_status": "not_attempted",
        "created_by": current_user.get("id"),
        "created_by_name": current_user.get("name"),
        "created_at": now,
        "updated_at": now,
    }
    await db.distributor_deliveries.insert_one(dispatch)

    # ── Create line items (reserved while the delivery is open; deducted at Complete) ──
    # Stored in the REGULAR Stock-Out convention so the shared reservation /
    # deduction / dashboard logic treats promo identically: `quantity` in BOTTLES,
    # `packaging_units` = bottles-per-package, `packages` = crates entered, and a
    # per-BOTTLE unit_price (so quantity × unit_price keeps the same value).
    #
    # Safety net: if a line names a packaging type but the unit count didn't come
    # through (older clients / auto-created from a Delivery Order), resolve units
    # from the SKU's packaging config so a crate never silently collapses to 1.
    _sku_ids = list({it.sku_id for it in data.items if it.sku_id})
    _pc_map: dict = {}
    if _sku_ids:
        async for _s in db.master_skus.find({"id": {"$in": _sku_ids}}, {"_id": 0, "id": 1, "packaging_config": 1}):
            _pc_map[_s["id"]] = _s.get("packaging_config") or {}

    def _resolve_units(it):
        """Returns (units_per_package, packaging_type_name, packaging_type_id)."""
        upp = int(it.units_per_package or 0)
        if upp > 1:
            return upp, it.packaging_type_name, it.packaging_type_id
        pc = _pc_map.get(it.sku_id) or {}
        pools = (pc.get("promo_stock_out") or []) + (pc.get("stock_out") or []) + (pc.get("master") or [])
        match = None
        if it.packaging_type_id:
            match = next((p for p in pools if p.get("packaging_type_id") == it.packaging_type_id), None)
        if not match and it.packaging_type_name:
            tgt = it.packaging_type_name.strip().lower()
            match = next((p for p in pools if (p.get("packaging_type_name") or "").strip().lower() == tgt), None)
        if match and int(match.get("units_per_package") or 0) > 1:
            return int(match["units_per_package"]), match.get("packaging_type_name") or it.packaging_type_name, match.get("packaging_type_id") or it.packaging_type_id
        # Last resort: pack size embedded in a container-style packaging name
        # ("12 Bottle Crate") — volume tokens stripped so "330ml Bottle" stays 1.
        _nm = it.packaging_type_name or ""
        if re.search(r"crate|case|carton|pack|box|tray|dozen", _nm, re.I):
            _cleaned = re.sub(r"\d+(?:\.\d+)?\s*(?:ml|ltr|litre|liter|l|kg|gm|g)\b", " ", _nm, flags=re.I)
            m = re.search(r"(\d+)", _cleaned)
            if m and int(m.group(1)) > 1:
                return int(m.group(1)), it.packaging_type_name, it.packaging_type_id
        return (upp or 1), it.packaging_type_name, it.packaging_type_id

    inserted_items: list[dict] = []
    for it in data.items:
        upp, pkg_name, pkg_id = _resolve_units(it)
        if (getattr(it, "quantity_unit", None) or "packages") == "bottles":
            # Base-unit contract (Delivery Order bridge): quantity IS bottles,
            # unit_price IS per bottle.
            bottles = int(it.quantity)
            if upp > 1 and bottles % upp == 0:
                crates = bottles // upp
            else:
                # Not a clean multiple of the pack size → dispatch loose bottles
                # and drop the pack label so "5 bottles" never prints as a crate.
                upp, pkg_name, pkg_id = 1, "Bottle", None
                crates = bottles
            per_bottle = float(it.unit_price or 0)
        else:
            crates = int(it.quantity)
            bottles = crates * upp
            per_bottle = round(float(it.unit_price or 0) / upp, 4) if upp else float(it.unit_price or 0)
        line_value = bottles * per_bottle
        line_doc = {
            "id": str(uuid.uuid4()),
            "tenant_id": tenant_id,
            "delivery_id": dispatch_id,
            "sku_id": it.sku_id,
            "sku_name": it.sku_name,
            "quantity": bottles,
            "packages": crates,
            "packaging_units": upp,
            "unit_price": per_bottle,
            "line_value": round(line_value, 2),
            "net_amount": 0,
            "batch_id": it.batch_id,
            "batch_code": it.batch_code,
            "packaging_type_id": pkg_id,
            "packaging_type_name": pkg_name,
            "units_per_package": upp,
            "remarks": it.remarks,
            "created_at": now,
        }
        await db.distributor_delivery_items.insert_one(dict(line_doc))
        inserted_items.append(line_doc)

    logger.info(f"Promo stock-out {challan_number} created by {current_user.get('email')} "
                f"(status={dispatch['status']}, stock reserved, no invoice).")

    # Drafts stop here — reserved only, no Zoho document yet.
    if data.as_draft:
        dispatch.pop("_id", None)
        return {
            "message": f"Draft {challan_number} saved",
            "dispatch": _promo_delivery_response(dispatch),
            "zoho_sync_status": "not_attempted",
            "zoho_sync_error": None,
        }

    # ── Confirmed on creation → push the Zoho delivery challan (best-effort) ──
    zoho_sync_status = "not_attempted"
    zoho_sync_error = None
    if is_zoho_configured():
        # Push the SAME normalized lines we stored (quantity in BOTTLES, per-bottle
        # rate, resolved packaging) — NOT the raw request payload — so the printed
        # challan matches the stock-out record (e.g. 1 crate → "1 × Crate-24 (24 Bottles)").
        items_for_zoho = [{
            "sku_id": d["sku_id"], "sku_name": d["sku_name"], "quantity": d["quantity"],
            "unit_price": d["unit_price"], "batch_code": d.get("batch_code"),
            "packaging_type_id": d.get("packaging_type_id"), "packaging_type_name": d.get("packaging_type_name"),
            "units_per_package": d.get("units_per_package"), "packages": d.get("packages"),
        } for d in inserted_items]
        zres = await _push_promo_dispatch_to_zoho(
            tenant_id, dispatch_id, dispatch, items_for_zoho, distributor, coll=db.distributor_deliveries)
        zoho_sync_status = zres.get("status")
        zoho_sync_error = zres.get("error")
        dispatch["zoho_sync_status"] = zoho_sync_status
        if zres.get("zoho_doc_url"):
            dispatch["zoho_doc_url"] = zres.get("zoho_doc_url")
            dispatch["zoho_doc_number"] = zres.get("zoho_doc_number")

    dispatch.pop("_id", None)
    return {
        "message": f"Delivery Challan {challan_number} generated",
        "dispatch": _promo_delivery_response(dispatch),
        "zoho_sync_status": zoho_sync_status,
        "zoho_sync_error": zoho_sync_error,
    }


async def _load_promo(tenant_id: str, distributor_id: str, dispatch_id: str):
    """Return (doc, items, is_legacy). Checks the unified is_promo deliveries
    first, then the legacy promo_dispatches collection. Returns (None, None,
    None) when nothing matches."""
    d = await db.distributor_deliveries.find_one(
        {"id": dispatch_id, "tenant_id": tenant_id, "distributor_id": distributor_id, "is_promo": True}, {"_id": 0})
    if d:
        items = await db.distributor_delivery_items.find(
            {"delivery_id": dispatch_id, "tenant_id": tenant_id}, {"_id": 0}).to_list(500)
        return _promo_delivery_response(d), items, False
    d = await db.promo_dispatches.find_one(
        {"id": dispatch_id, "tenant_id": tenant_id, "distributor_id": distributor_id}, {"_id": 0})
    if d:
        items = await db.promo_dispatch_items.find(
            {"dispatch_id": dispatch_id, "tenant_id": tenant_id}, {"_id": 0}).to_list(500)
        return d, items, True
    return None, None, None


def _promo_unit_label(items: list) -> Optional[str]:
    """Derive the unit-of-measure word (e.g. 'crate', 'bottle', 'carton') shared
    by a dispatch's line items so the list can show '12 crates' instead of a
    hardcoded 'Crates' column. Returns the singular word when all items use the
    same packaging unit, else None (frontend then shows the generic 'items')."""
    words = set()
    for it in items or []:
        name = (it.get("packaging_type_name") or "").strip()
        if not name:
            continue
        base = re.sub(r"\(.*\)$", "", name).strip()  # drop "(12)" size suffix
        parts = [p for p in base.replace("-", " ").split() if p.isalpha()]  # skip "- 12" style counts
        if parts:
            words.add(parts[-1].lower())
    return next(iter(words)) if len(words) == 1 else None


@router.get("/distributors/{distributor_id}/promo-deliveries")
async def list_promo_dispatches(distributor_id: str, current_user: dict = Depends(get_current_user)):
    if not can_manage_distributor_data(current_user, distributor_id):
        raise HTTPException(status_code=403, detail="Not authorised")
    tenant_id = get_current_tenant_id()
    new_rows = await db.distributor_deliveries.find(
        {"tenant_id": tenant_id, "distributor_id": distributor_id, "is_promo": True}, {"_id": 0}).to_list(2000)
    rows = [_promo_delivery_response(r) for r in new_rows]

    # Attach the per-dispatch unit label (crate / bottle / carton …) and the
    # package count so the UI can show "48 bottles (= 4 crates)" instead of
    # mislabelling bottles as crates.
    new_ids = [r["id"] for r in rows if r.get("id")]
    items_by_did: dict = {}
    if new_ids:
        for it in await db.distributor_delivery_items.find(
            {"tenant_id": tenant_id, "delivery_id": {"$in": new_ids}},
            {"_id": 0, "delivery_id": 1, "packaging_type_name": 1, "packages": 1},
        ).to_list(20000):
            items_by_did.setdefault(it.get("delivery_id"), []).append(it)
    for r in rows:
        its = items_by_did.get(r.get("id"), [])
        r["unit_label"] = _promo_unit_label(its)
        # total_packages only when every line carries a package count.
        if its and all(it.get("packages") is not None for it in its):
            r["total_packages"] = sum(int(it.get("packages") or 0) for it in its)
        else:
            r["total_packages"] = None

    legacy = await db.promo_dispatches.find(
        {"tenant_id": tenant_id, "distributor_id": distributor_id}, {"_id": 0}).to_list(2000)
    legacy_ids = [r["id"] for r in legacy if r.get("id")]
    legacy_items: dict = {}
    if legacy_ids:
        for it in await db.promo_dispatch_items.find(
            {"tenant_id": tenant_id, "dispatch_id": {"$in": legacy_ids}},
            {"_id": 0, "dispatch_id": 1, "packaging_type_name": 1},
        ).to_list(20000):
            legacy_items.setdefault(it.get("dispatch_id"), []).append(it)
    for r in legacy:
        r["is_legacy"] = True
        r["unit_label"] = _promo_unit_label(legacy_items.get(r.get("id"), []))
    rows.extend(legacy)
    rows.sort(key=lambda d: d.get("created_at", ""), reverse=True)
    return {"dispatches": rows}


@router.get("/promo-dispatches/summary")
async def promo_dispatch_summary(current_user: dict = Depends(get_current_user)):
    """Tenant-wide tracking of give-aways: total dispatches, units & indicative
    value — across both the unified is_promo deliveries and legacy records."""
    tenant_id = get_current_tenant_id()
    rows = await db.distributor_deliveries.find(
        {"tenant_id": tenant_id, "is_promo": True}, {"_id": 0}).to_list(10000)
    rows += await db.promo_dispatches.find({"tenant_id": tenant_id}, {"_id": 0}).to_list(10000)
    by_reason: dict = {}
    total_value = 0.0
    total_qty = 0
    for d in rows:
        # Reversed/cancelled give-aways shouldn't inflate the tracker.
        if (d.get("status") or "") in ("reversed", "cancelled"):
            continue
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
        "total_dispatches": sum(b["count"] for b in by_reason.values()),
        "total_quantity": total_qty,
        "total_indicative_value": round(total_value, 2),
        "by_reason": sorted(by_reason.values(), key=lambda x: x["indicative_value"], reverse=True),
    }


@router.get("/distributors/{distributor_id}/promo-deliveries/{dispatch_id}")
async def get_promo_dispatch(distributor_id: str, dispatch_id: str, current_user: dict = Depends(get_current_user)):
    if not can_manage_distributor_data(current_user, distributor_id):
        raise HTTPException(status_code=403, detail="Not authorised")
    tenant_id = get_current_tenant_id()
    d, items, _legacy = await _load_promo(tenant_id, distributor_id, dispatch_id)
    if not d:
        raise HTTPException(status_code=404, detail="Dispatch not found")
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
    d, items_rows, is_legacy = await _load_promo(tenant_id, distributor_id, dispatch_id)
    if not d:
        raise HTTPException(status_code=404, detail="Dispatch not found")
    coll = db.promo_dispatches if is_legacy else db.distributor_deliveries
    distributor = await db.distributors.find_one({"id": distributor_id, "tenant_id": tenant_id}, {"_id": 0}) or {}
    zres = await _push_promo_dispatch_to_zoho(tenant_id, dispatch_id, d, items_rows, distributor, coll=coll)
    if zres.get("status") == "synced":
        return {"ok": True, "zoho_doc_number": zres.get("zoho_doc_number"), "zoho_doc_url": zres.get("zoho_doc_url")}
    raise HTTPException(status_code=400, detail=f"Zoho push failed: {zres.get('error')}")


@router.post("/distributors/{distributor_id}/promo-deliveries/{dispatch_id}/confirm")
async def confirm_promo_dispatch(distributor_id: str, dispatch_id: str, current_user: dict = Depends(get_current_user)):
    """Confirm a DRAFT stock-out: re-validate stock (reservation-aware), move it
    to 'confirmed' (which RESERVES the stock — no physical deduction until
    Complete) and push the Zoho delivery challan (best-effort)."""
    if not can_manage_distributor_data(current_user, distributor_id):
        raise HTTPException(status_code=403, detail="Not authorised")
    tenant_id = get_current_tenant_id()
    d, items, is_legacy = await _load_promo(tenant_id, distributor_id, dispatch_id)
    if not d:
        raise HTTPException(status_code=404, detail="Dispatch not found")
    if d.get("status") != "draft":
        raise HTTPException(status_code=400, detail="Only draft stock-outs can be confirmed.")
    if not items:
        raise HTTPException(status_code=400, detail="This draft has no items.")

    loc = await db.distributor_locations.find_one(
        {"id": d.get("distributor_location_id"), "tenant_id": tenant_id}, {"_id": 0}) or {}
    now = datetime.now(timezone.utc).isoformat()

    if is_legacy:
        # Legacy behaviour: deduct immediately, mark dispatched.
        await _check_stock_availability(
            tenant_id, src_is_factory=bool(d.get("is_factory")), src_tracks_batches=bool(loc.get("track_batches")),
            distributor_id=distributor_id, loc_id=d.get("distributor_location_id"), items=items)
        await _adjust_stock_for_dispatch(tenant_id, d, items, sign=-1)
        await db.promo_dispatches.update_one(
            {"id": dispatch_id, "tenant_id": tenant_id},
            {"$set": {"status": "dispatched", "confirmed_at": now,
                      "confirmed_by": current_user.get("id"), "updated_at": now}})
        d["status"] = "dispatched"
        coll = db.promo_dispatches
    else:
        # New flow: reservation-aware validation, NO deduction (reserve only).
        tracks = bool(loc.get("track_batches"))
        # A stock-out auto-created from a Delivery Order never picks a batch.
        # On a batch-tracked warehouse, allocate batches FIFO now so the
        # validation below finds the (batched) stock instead of falsely
        # reporting "available 0" against the non-existent null batch.
        if tracks and any(not it.get("batch_id") for it in items):
            items = await _allocate_batches_if_needed(tenant_id, d, items, dispatch_id)
        reserved_map = await _reserved_qty_map(
            tenant_id, distributor_id, d.get("distributor_location_id"), tracks, exclude_delivery_id=dispatch_id)
        demand: dict = {}
        for it in items:
            bkey = it.get("batch_id") if tracks else None
            demand[(it.get("sku_id"), bkey, it.get("sku_name"))] = demand.get((it.get("sku_id"), bkey, it.get("sku_name")), 0) + (it.get("quantity") or 0)
        derived = {}
        if not d.get("is_factory") and not tracks:
            derived = await _derived_on_hand_by_sku(
                tenant_id, distributor_id, d.get("distributor_location_id"),
                [s for (s, _b, _n) in demand.keys()])
        for (sku_id, bkey, sku_name), need in demand.items():
            if d.get("is_factory"):
                key = {"tenant_id": tenant_id, "warehouse_location_id": d.get("distributor_location_id"), "sku_id": sku_id}
                if bkey and bkey != "__legacy__":
                    key["batch_id"] = bkey
                rows = await db.factory_warehouse_stock.find(key, {"_id": 0, "quantity": 1}).to_list(1000)
            else:
                key = {"tenant_id": tenant_id, "distributor_id": distributor_id,
                       "distributor_location_id": d.get("distributor_location_id"), "sku_id": sku_id}
                key["batch_id"] = bkey if bkey else {"$in": [None]}
                rows = await db.distributor_stock.find(key, {"_id": 0, "quantity": 1}).to_list(1000)
            on_hand_rows = sum((r.get("quantity") or 0) for r in rows)
            on_hand = max(on_hand_rows, derived.get(sku_id, 0)) if (not d.get("is_factory") and not tracks) else on_hand_rows
            available = on_hand - reserved_map.get((sku_id, bkey), 0)
            if available < need:
                diag = await _stock_rows_summary(tenant_id, bool(d.get("is_factory")), distributor_id,
                                                 d.get("distributor_location_id"), sku_id)
                reserved_qty = reserved_map.get((sku_id, bkey), 0)
                raise HTTPException(status_code=400,
                                    detail=f"Insufficient stock for {sku_name or sku_id}: need {need}, "
                                           f"available {available} ({on_hand} on-hand, {reserved_qty} reserved). "
                                           f"Stock rows here → {diag}")
        await db.distributor_deliveries.update_one(
            {"id": dispatch_id, "tenant_id": tenant_id},
            {"$set": {"status": "confirmed", "confirmed_at": now,
                      "confirmed_by": current_user.get("id"), "updated_at": now}})
        d["status"] = "confirmed"
        coll = db.distributor_deliveries

    zres = {"status": "not_attempted", "error": None}
    if is_zoho_configured():
        distributor = await db.distributors.find_one({"id": distributor_id, "tenant_id": tenant_id}, {"_id": 0}) or {}
        zres = await _push_promo_dispatch_to_zoho(tenant_id, dispatch_id, d, items, distributor, coll=coll)

    updated, _it, _lg = await _load_promo(tenant_id, distributor_id, dispatch_id)
    return {"message": f"Challan {d.get('challan_number')} confirmed",
            "dispatch": updated, "zoho_sync_status": zres.get("status"), "zoho_sync_error": zres.get("error")}


@router.post("/distributors/{distributor_id}/promo-deliveries/{dispatch_id}/complete")
async def complete_promo_dispatch(distributor_id: str, dispatch_id: str, current_user: dict = Depends(get_current_user)):
    """Mark a promo stock-out delivered/complete: physically DEDUCT the reserved
    stock from inventory and move the record to 'complete'. Only the new unified
    (is_promo delivery) records support completion."""
    if not can_manage_distributor_data(current_user, distributor_id):
        raise HTTPException(status_code=403, detail="Not authorised")
    tenant_id = get_current_tenant_id()
    d, items, is_legacy = await _load_promo(tenant_id, distributor_id, dispatch_id)
    if not d:
        raise HTTPException(status_code=404, detail="Dispatch not found")
    if is_legacy:
        raise HTTPException(status_code=400, detail="Legacy stock-outs are already completed (historical).")
    open_states = {"confirmed", "delivery_assigned", "delivery_scheduled", "scheduled", "on_the_way", "in_transit"}
    if d.get("status") not in open_states:
        raise HTTPException(status_code=400, detail="Only a confirmed/assigned stock-out can be completed.")

    # Deduct the reserved stock now (final physical movement).
    await _adjust_stock_for_dispatch(tenant_id, d, items, sign=-1)
    now = datetime.now(timezone.utc).isoformat()
    await db.distributor_deliveries.update_one(
        {"id": dispatch_id, "tenant_id": tenant_id},
        {"$set": {"status": "complete", "completed_at": now,
                  "completed_by": current_user.get("id"),
                  "completed_by_name": current_user.get("name"), "updated_at": now}})
    updated, _it, _lg = await _load_promo(tenant_id, distributor_id, dispatch_id)
    return {"ok": True, "message": f"Stock-out {d.get('challan_number')} completed — stock deducted",
            "dispatch": updated}


@router.post("/distributors/{distributor_id}/promo-deliveries/{dispatch_id}/reverse")
async def reverse_promo_dispatch(distributor_id: str, dispatch_id: str, current_user: dict = Depends(get_current_user)):
    """Reverse a stock-out and delete its Zoho delivery challan. For unified
    (is_promo delivery) records the stock was only RESERVED, so reversing simply
    releases the reservation (status→reversed) — no stock add-back. Legacy
    records had stock deducted on confirm, so those are added back. Kept and
    marked 'reversed' for audit; a failed Zoho delete is flagged for retry."""
    if not can_manage_distributor_data(current_user, distributor_id):
        raise HTTPException(status_code=403, detail="Not authorised")
    tenant_id = get_current_tenant_id()
    d, items, is_legacy = await _load_promo(tenant_id, distributor_id, dispatch_id)
    if not d:
        raise HTTPException(status_code=404, detail="Dispatch not found")
    coll = db.promo_dispatches if is_legacy else db.distributor_deliveries

    if is_legacy:
        if d.get("status") != "dispatched":
            raise HTTPException(status_code=400, detail="Only confirmed stock-outs can be reversed.")
        # Restore stock (legacy deducted on confirm).
        await _adjust_stock_for_dispatch(tenant_id, d, items, sign=+1)
    else:
        reversible = {"confirmed", "delivery_assigned", "delivery_scheduled", "scheduled", "on_the_way", "in_transit"}
        if d.get("status") not in reversible:
            raise HTTPException(status_code=400, detail="Only a not-yet-completed stock-out can be reversed.")
        # No stock add-back — it was reserved, not deducted. Status change frees it.

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
    await coll.update_one({"id": dispatch_id, "tenant_id": tenant_id}, {"$set": set_fields})

    restored = "stock restored" if is_legacy else "stock released"
    msg = f"Stock-out {d.get('challan_number')} reversed — {restored}"
    if has_zoho_doc:
        msg += " (Zoho challan deletion pending — will retry)" if zoho_cleanup_pending else " and Zoho challan deleted"
    updated, _it, _lg = await _load_promo(tenant_id, distributor_id, dispatch_id)
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
    d, _items, is_legacy = await _load_promo(tenant_id, distributor_id, dispatch_id)
    if not d:
        raise HTTPException(status_code=404, detail="Dispatch not found")
    if d.get("status") != "reversed" or not d.get("zoho_cleanup_pending"):
        raise HTTPException(status_code=400, detail="No pending Zoho cleanup for this stock-out.")
    coll = db.promo_dispatches if is_legacy else db.distributor_deliveries
    now = datetime.now(timezone.utc).isoformat()
    try:
        await delete_delivery_challan(tenant_id, d.get("zoho_doc_id"))
    except Exception as exc:
        err = str(exc)[:500]
        await coll.update_one(
            {"id": dispatch_id, "tenant_id": tenant_id},
            {"$set": {"zoho_cleanup_error": err, "updated_at": now}})
        raise HTTPException(status_code=400, detail=f"Zoho cleanup failed: {err}")
    await coll.update_one(
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
    d, _items, is_legacy = await _load_promo(tenant_id, distributor_id, dispatch_id)
    if not d:
        raise HTTPException(status_code=404, detail="Dispatch not found")
    if d.get("status") not in ("draft", "reversed"):
        raise HTTPException(
            status_code=400,
            detail="Only draft or reversed stock-outs can be deleted. Reverse a confirmed stock-out first.")
    if is_legacy:
        await db.promo_dispatch_items.delete_many({"dispatch_id": dispatch_id, "tenant_id": tenant_id})
        await db.promo_dispatches.delete_one({"id": dispatch_id, "tenant_id": tenant_id})
    else:
        await db.distributor_delivery_items.delete_many({"delivery_id": dispatch_id, "tenant_id": tenant_id})
        await db.distributor_deliveries.delete_one({"id": dispatch_id, "tenant_id": tenant_id})
    return {"ok": True, "deleted": dispatch_id}


@router.get("/distributors/{distributor_id}/promo-deliveries/{dispatch_id}/challan-pdf")
async def promo_challan_pdf(distributor_id: str, dispatch_id: str, current_user: dict = Depends(get_current_user)):
    if not can_manage_distributor_data(current_user, distributor_id):
        raise HTTPException(status_code=403, detail="Not authorised")
    tenant_id = get_current_tenant_id()
    d, items, _legacy = await _load_promo(tenant_id, distributor_id, dispatch_id)
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


# ─────────────────── Legacy crate-unit repair (admin, dry-run first) ───────────────────
class RepairRequest(BaseModel):
    apply: bool = False
    item_ids: Optional[List[str]] = None  # apply only these lines (per-row fix)
    distributor_id: Optional[str] = None  # scope the scan to one distributor


def _pkg_units_from_name(name: str) -> int:
    """Pack size from a packaging label — only when it clearly names a multi-unit
    container ("12 Bottle Crate", "Pack of 6"). Volume tokens are stripped first
    so "330ml Bottle" is never read as 330 units."""
    if not name or not re.search(r"crate|case|carton|pack|box|tray|dozen", name, re.I):
        return 0
    cleaned = re.sub(r"\d+(?:\.\d+)?\s*(?:ml|ltr|litre|liter|l|kg|gm|g)\b", " ", name, flags=re.I)
    m = re.search(r"(\d+)", cleaned)
    return int(m.group(1)) if m else 0


@router.post("/promo-deliveries/repair-crate-units")
async def repair_promo_crate_units(payload: RepairRequest, current_user: dict = Depends(get_current_user)):
    """Repairs legacy promo stock-out lines where '1 crate' was stored as 1 bottle.
    Dry-run by default: returns the exact changes; apply=true executes them once
    (repaired lines are stamped and skipped on later runs)."""
    _ensure_admin(current_user)
    tenant_id = get_current_tenant_id()
    now = datetime.now(timezone.utc).isoformat()
    DEDUCTED_STATUSES = {"dispatched", "delivered", "completed"}

    sku_cfg: dict = {}
    async for ms in db.master_skus.find({}, {"_id": 0, "id": 1, "bottles_per_crate": 1, "packaging_config": 1}):
        sku_cfg[ms["id"]] = ms

    def resolve_upp(item: dict):
        """Returns (units_per_package, force_ambiguous). SKU packaging config is
        authoritative; a config that says 1 while the label names a multi-unit
        container is contradictory → manual review only."""
        upp = int(item.get("units_per_package") or 0)
        if upp > 1:
            return upp, False
        name_units = _pkg_units_from_name(item.get("packaging_type_name") or "")
        ms = sku_cfg.get(item.get("sku_id")) or {}
        cfg = None
        tgt_name = (item.get("packaging_type_name") or "").strip().lower()
        for section in (ms.get("packaging_config") or {}).values():
            for p in (section or []):
                same_id = item.get("packaging_type_id") and p.get("packaging_type_id") == item.get("packaging_type_id")
                same_name = tgt_name and (p.get("packaging_type_name") or "").strip().lower() == tgt_name
                if same_id or same_name:
                    val = int(p.get("units") or p.get("units_per_package") or 0)
                    if val >= 1:
                        cfg = val
                        break
            if cfg is not None:
                break
        if cfg is not None and cfg > 1:
            return cfg, False
        if cfg == 1:
            # Config says single-unit — trust it unless the label contradicts it.
            return (name_units, True) if name_units > 1 else (1, False)
        if name_units > 1:
            return name_units, False
        pkg_name = (item.get("packaging_type_name") or "").lower()
        if "crate" in pkg_name and ms.get("bottles_per_crate"):
            return int(ms["bottles_per_crate"]), False
        return 0, False

    findings, applied, ambiguous_count = [], 0, 0

    async def scan(dispatch_coll, query, deducted_statuses):
        nonlocal applied, ambiguous_count
        legacy = dispatch_coll is db.promo_dispatches
        async for d in dispatch_coll.find(query, {"_id": 0}):
            items = [dict(i, _items_coll="distributor_delivery_items") for i in
                     await db.distributor_delivery_items.find(
                         {"tenant_id": tenant_id, "delivery_id": d["id"]}, {"_id": 0}).to_list(500)]
            if legacy:
                items += [dict(i, _items_coll="promo_dispatch_items") for i in
                          await db.promo_dispatch_items.find(
                              {"tenant_id": tenant_id, "dispatch_id": d["id"]}, {"_id": 0}).to_list(500)]
            for it in items:
                if it.get("unit_repair_applied_at"):
                    continue
                qty = int(it.get("quantity") or 0)
                if qty <= 0:
                    continue
                stored_upp = int(it.get("units_per_package") or 0)
                upp, force_ambiguous = resolve_upp(it)
                if upp <= 1:
                    continue
                packages = it.get("packages")
                # Bug signature: quantity equals the package count (never multiplied).
                if packages is not None and int(packages) != qty:
                    continue  # already stored in bottles (packages = qty / upp)
                if packages is None and stored_upp > 1 and qty % upp == 0 and qty >= upp:
                    continue  # quantity already looks like bottles
                # Collapsed lines (upp stored as 1) that are a clean multiple of the
                # pack size can't be told apart from genuine loose bottles →
                # flag for manual review, never auto-repair.
                ambiguous = force_ambiguous or (
                    stored_upp <= 1 and packages is not None and qty % upp == 0 and qty >= upp)
                correct_qty = qty * upp
                delta = correct_qty - qty
                stock_deducted = (d.get("status") in deducted_statuses)
                findings.append({
                    "item_id": it["id"],
                    "challan_number": d.get("challan_number"), "dispatch_id": d["id"],
                    "recipient": d.get("contact_name") or d.get("recipient_name"),
                    "delivery_date": (d.get("delivery_date") or d.get("created_at") or "")[:10],
                    "status": d.get("status"), "sku_name": it.get("sku_name"),
                    "packaging": it.get("packaging_type_name"), "stored_quantity": qty,
                    "correct_quantity_bottles": correct_qty, "missing_bottles": delta,
                    "stock_will_be_adjusted": stock_deducted, "ambiguous": ambiguous,
                })
                if ambiguous:
                    ambiguous_count += 1
                # Bulk apply skips ambiguous lines; a targeted per-row fix
                # (item_ids) is the user explicitly resolving that line.
                if payload.item_ids is not None:
                    apply_this = payload.apply and it["id"] in payload.item_ids
                else:
                    apply_this = payload.apply and not ambiguous
                if apply_this:
                    items_coll = getattr(db, it["_items_coll"])
                    await items_coll.update_one(
                        {"id": it["id"], "tenant_id": tenant_id},
                        {"$set": {"quantity": correct_qty, "packages": qty, "units_per_package": upp,
                                  "packaging_units": upp, "unit_repair_applied_at": now}})
                    link_key = "dispatch_id" if it["_items_coll"] == "promo_dispatch_items" else "delivery_id"
                    totals = await items_coll.aggregate([
                        {"$match": {"tenant_id": tenant_id, link_key: d["id"]}},
                        {"$group": {"_id": None, "q": {"$sum": "$quantity"}}}]).to_list(1)
                    await dispatch_coll.update_one(
                        {"id": d["id"], "tenant_id": tenant_id},
                        {"$set": {"total_quantity": (totals[0]["q"] if totals else correct_qty),
                                  "updated_at": now}})
                    if stock_deducted:
                        await _adjust_stock_for_dispatch(
                            tenant_id, d, [{"quantity": delta, "sku_id": it.get("sku_id"),
                                            "batch_id": it.get("batch_id")}], sign=-1)
                    applied += 1

    # Legacy records (stock deducted at confirm) + unified is_promo deliveries
    # (stock reserved until completion — open statuses need no stock write, the
    # reservation recomputes from the corrected item quantity).
    dist_scope = {"distributor_id": payload.distributor_id} if payload.distributor_id else {}
    await scan(db.promo_dispatches, {"tenant_id": tenant_id, **dist_scope}, DEDUCTED_STATUSES)
    await scan(db.distributor_deliveries, {"tenant_id": tenant_id, "is_promo": True, **dist_scope},
               {"complete", "completed", "delivered"})

    return {"dry_run": not payload.apply, "affected_lines": len(findings),
            "repaired": applied, "ambiguous": ambiguous_count, "findings": findings}


class UndoRepairRequest(BaseModel):
    apply: bool = False
    item_ids: Optional[List[str]] = None   # undo only these lines
    distributor_id: Optional[str] = None   # scope to one distributor


@router.post("/promo-deliveries/undo-crate-repairs")
async def undo_promo_crate_repairs(payload: UndoRepairRequest, current_user: dict = Depends(get_current_user)):
    """Reverts applied crate-unit repairs. Every repair stamped the line with
    unit_repair_applied_at and preserved the original quantity in `packages`,
    so the exact pre-repair state (quantity + stock) can be restored.
    Dry-run by default; apply=true reverts (per line via item_ids, or all)."""
    _ensure_admin(current_user)
    tenant_id = get_current_tenant_id()
    now = datetime.now(timezone.utc).isoformat()
    LEGACY_DEDUCTED = {"dispatched", "delivered", "completed"}
    NEW_DEDUCTED = {"complete", "completed", "delivered"}

    findings, reverted = [], 0
    dist_scope = {"distributor_id": payload.distributor_id} if payload.distributor_id else {}

    async def scan(dispatch_coll, query, deducted_statuses):
        nonlocal reverted
        legacy = dispatch_coll is db.promo_dispatches
        async for d in dispatch_coll.find(query, {"_id": 0}):
            items = [dict(i, _items_coll="distributor_delivery_items") for i in
                     await db.distributor_delivery_items.find(
                         {"tenant_id": tenant_id, "delivery_id": d["id"],
                          "unit_repair_applied_at": {"$exists": True, "$ne": None}}, {"_id": 0}).to_list(500)]
            if legacy:
                items += [dict(i, _items_coll="promo_dispatch_items") for i in
                          await db.promo_dispatch_items.find(
                              {"tenant_id": tenant_id, "dispatch_id": d["id"],
                               "unit_repair_applied_at": {"$exists": True, "$ne": None}}, {"_id": 0}).to_list(500)]
            for it in items:
                qty = int(it.get("quantity") or 0)
                original_qty = int(it.get("packages") or 0)
                if original_qty <= 0 or original_qty == qty:
                    continue
                delta = qty - original_qty  # bottles that the repair added/deducted
                stock_adjusted = (d.get("status") in deducted_statuses)
                findings.append({
                    "item_id": it["id"],
                    "challan_number": d.get("challan_number"), "dispatch_id": d["id"],
                    "recipient": d.get("contact_name") or d.get("recipient_name"),
                    "delivery_date": (d.get("delivery_date") or d.get("created_at") or "")[:10],
                    "status": d.get("status"), "sku_name": it.get("sku_name"),
                    "packaging": it.get("packaging_type_name"),
                    "current_quantity": qty, "restores_quantity_to": original_qty,
                    "stock_to_restore": delta, "stock_will_be_adjusted": stock_adjusted,
                    "repaired_at": it.get("unit_repair_applied_at"),
                })
                if payload.item_ids is not None:
                    undo_this = payload.apply and it["id"] in payload.item_ids
                else:
                    undo_this = payload.apply
                if undo_this:
                    items_coll = getattr(db, it["_items_coll"])
                    await items_coll.update_one(
                        {"id": it["id"], "tenant_id": tenant_id},
                        {"$set": {"quantity": original_qty, "unit_repair_undone_at": now},
                         "$unset": {"unit_repair_applied_at": ""}})
                    link_key = "dispatch_id" if it["_items_coll"] == "promo_dispatch_items" else "delivery_id"
                    totals = await items_coll.aggregate([
                        {"$match": {"tenant_id": tenant_id, link_key: d["id"]}},
                        {"$group": {"_id": None, "q": {"$sum": "$quantity"}}}]).to_list(1)
                    await dispatch_coll.update_one(
                        {"id": d["id"], "tenant_id": tenant_id},
                        {"$set": {"total_quantity": (totals[0]["q"] if totals else original_qty),
                                  "updated_at": now}})
                    if stock_adjusted:
                        # Repair deducted `delta` extra bottles — add them back.
                        await _adjust_stock_for_dispatch(
                            tenant_id, d, [{"quantity": delta, "sku_id": it.get("sku_id"),
                                            "batch_id": it.get("batch_id")}], sign=+1)
                    reverted += 1

    await scan(db.promo_dispatches, {"tenant_id": tenant_id, **dist_scope}, LEGACY_DEDUCTED)
    await scan(db.distributor_deliveries, {"tenant_id": tenant_id, "is_promo": True, **dist_scope}, NEW_DEDUCTED)

    return {"dry_run": not payload.apply, "applied_repairs": len(findings),
            "reverted": reverted, "findings": findings}
