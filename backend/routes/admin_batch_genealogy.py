"""
Admin → Batch Genealogy.

For any production batch (`production_batches.id`), traces every movement of
that batch across the supply chain:

  • Origin            — `production_batches` row (SKU, factory, qty produced)
  • Stock In  events  — `distributor_shipments` lines that consumed the batch
                        from a factory and credited it to a partner
                        distributor warehouse.
  • Stock Transfer    — `distributor_stock_transfers` lines that moved the
                        batch between warehouses (same or different
                        distributor, same PAN).
  • Stock Out events  — `distributor_deliveries` lines that dispatched the
                        batch to an end customer (account).
  • Current stock     — `factory_warehouse_stock` + `distributor_stock` rows
                        keyed on this `batch_id` (where it sits *right now*).
  • Mass balance      — produced − shipped-out − transferred-out − delivered
                        − resting = should equal zero (or surfaces drift).

Tenant-scoped, admin-only. Read-only — no writes.

Useful for FSSAI traceability and product recall scenarios.
"""
from typing import Optional, List
from fastapi import APIRouter, HTTPException, Depends

from database import db
from deps import get_current_user
from core.tenant import get_current_tenant_id

router = APIRouter()

ALLOWED_ROLES = {"CEO", "Director", "Admin", "System Admin"}


def _ensure_admin(current_user: dict) -> None:
    role = (current_user.get("role") or "").strip()
    if role not in ALLOWED_ROLES:
        raise HTTPException(
            status_code=403,
            detail="Only CEO / Director / Admin / System Admin can view batch genealogy.",
        )


@router.get("/search")
async def search_batches(
    q: str = "",
    limit: int = 25,
    current_user: dict = Depends(get_current_user),
):
    """Quick search across `production_batches` by batch_code / sku_name.
    Returns up to `limit` rows. Used by the genealogy page's search box."""
    _ensure_admin(current_user)
    tenant_id = get_current_tenant_id()
    query = {"tenant_id": tenant_id}
    if q:
        query["$or"] = [
            {"batch_code": {"$regex": q, "$options": "i"}},
            {"sku_name": {"$regex": q, "$options": "i"}},
        ]
    rows = await db.production_batches.find(
        query,
        {"_id": 0, "id": 1, "batch_code": 1, "sku_id": 1, "sku_name": 1,
         "warehouse_location_id": 1, "quantity": 1, "status": 1, "created_at": 1},
    ).sort("created_at", -1).limit(max(1, min(limit, 200))).to_list(limit)
    return {"batches": rows}


@router.get("/{batch_id}/genealogy")
async def get_batch_genealogy(
    batch_id: str,
    current_user: dict = Depends(get_current_user),
):
    """Return the full lineage of a single production batch."""
    _ensure_admin(current_user)
    tenant_id = get_current_tenant_id()

    # ── Origin ─────────────────────────────────────────────────────────────
    origin = await db.production_batches.find_one(
        {"id": batch_id, "tenant_id": tenant_id},
        {"_id": 0},
    )
    if not origin:
        raise HTTPException(status_code=404, detail="Batch not found")
    src_loc_id = origin.get("warehouse_location_id")
    sku_id = origin.get("sku_id")

    # Resolve display names for known locations / accounts in one pass.
    loc_ids: set = set()
    if src_loc_id:
        loc_ids.add(src_loc_id)
    account_ids: set = set()

    # ── Stock In events (factory → distributor) ────────────────────────────
    # Items carrying this batch_id, joined back to the parent shipment doc.
    in_items = await db.distributor_shipment_items.find(
        {"tenant_id": tenant_id, "batch_id": batch_id},
        {"_id": 0, "shipment_id": 1, "sku_id": 1, "quantity": 1, "batch_code": 1, "unit_price": 1},
    ).to_list(1000)
    in_shipment_ids = list({i["shipment_id"] for i in in_items if i.get("shipment_id")})
    in_shipments = {
        s["id"]: s for s in await db.distributor_shipments.find(
            {"id": {"$in": in_shipment_ids}, "tenant_id": tenant_id},
            {"_id": 0, "id": 1, "shipment_number": 1, "source_warehouse_id": 1,
             "distributor_id": 1, "distributor_name": 1, "distributor_location_id": 1,
             "distributor_location_name": 1, "status": 1, "shipment_date": 1,
             "delivered_at": 1, "confirmed_at": 1},
        ).to_list(1000)
    }
    for s in in_shipments.values():
        if s.get("source_warehouse_id"):
            loc_ids.add(s["source_warehouse_id"])
        if s.get("distributor_location_id"):
            loc_ids.add(s["distributor_location_id"])

    # ── Stock Transfer events (warehouse → warehouse) ──────────────────────
    transfer_docs = await db.distributor_stock_transfers.find(
        {"tenant_id": tenant_id, "items.batch_id": batch_id},
        {"_id": 0},
    ).to_list(1000)
    for t in transfer_docs:
        if t.get("source_location_id"):
            loc_ids.add(t["source_location_id"])
        if t.get("dest_location_id"):
            loc_ids.add(t["dest_location_id"])

    # ── Stock Out events (distributor → customer) ──────────────────────────
    out_items = await db.distributor_delivery_items.find(
        {"tenant_id": tenant_id, "batch_id": batch_id},
        {"_id": 0, "delivery_id": 1, "sku_id": 1, "quantity": 1, "batch_code": 1, "unit_price": 1},
    ).to_list(2000)
    out_delivery_ids = list({i["delivery_id"] for i in out_items if i.get("delivery_id")})
    out_deliveries = {
        d["id"]: d for d in await db.distributor_deliveries.find(
            {"id": {"$in": out_delivery_ids}, "tenant_id": tenant_id},
            {"_id": 0, "id": 1, "delivery_number": 1, "account_id": 1, "account_name": 1,
             "distributor_id": 1, "distributor_location_id": 1, "delivery_date": 1,
             "status": 1, "completed_at": 1},
        ).to_list(2000)
    }
    for d in out_deliveries.values():
        if d.get("distributor_location_id"):
            loc_ids.add(d["distributor_location_id"])
        if d.get("account_id"):
            account_ids.add(d["account_id"])

    # ── Lookup display labels in one batched query each ────────────────────
    locs = {
        loc["id"]: loc for loc in await db.distributor_locations.find(
            {"id": {"$in": list(loc_ids)}, "tenant_id": tenant_id},
            {"_id": 0, "id": 1, "location_name": 1, "city": 1, "state": 1, "is_factory": 1},
        ).to_list(1000)
    } if loc_ids else {}
    accounts = {
        a["id"]: a for a in await db.accounts.find(
            {"id": {"$in": list(account_ids)}, "tenant_id": tenant_id},
            {"_id": 0, "id": 1, "account_name": 1, "city": 1},
        ).to_list(2000)
    } if account_ids else {}

    def _loc(lid: Optional[str]) -> Optional[dict]:
        if not lid:
            return None
        loc = locs.get(lid) or {}
        return {
            "id": lid,
            "name": loc.get("location_name") or "(unknown)",
            "city": loc.get("city"),
            "state": loc.get("state"),
            "is_factory": bool(loc.get("is_factory")),
        }

    # ── Build timeline ─────────────────────────────────────────────────────
    events: List[dict] = []

    # Produced
    events.append({
        "type": "produced",
        "at": origin.get("created_at"),
        "qty": origin.get("quantity", 0),
        "from": None,
        "to": _loc(src_loc_id),
        "ref": {"kind": "production_batch", "id": batch_id,
                "code": origin.get("batch_code")},
    })

    # Stock In events — one entry per shipment×batch row. Quantity is what
    # this batch contributed to that shipment.
    qty_by_shipment: dict = {}
    for it in in_items:
        qty_by_shipment[it["shipment_id"]] = qty_by_shipment.get(it["shipment_id"], 0) + (it.get("quantity") or 0)
    for sid, qty in qty_by_shipment.items():
        s = in_shipments.get(sid, {})
        events.append({
            "type": "stock_in",
            "at": s.get("delivered_at") or s.get("confirmed_at") or s.get("shipment_date") or s.get("created_at"),
            "qty": qty,
            "from": _loc(s.get("source_warehouse_id")),
            "to": _loc(s.get("distributor_location_id")),
            "status": s.get("status"),
            "ref": {"kind": "shipment", "id": sid,
                    "code": s.get("shipment_number"),
                    "distributor": s.get("distributor_name")},
        })

    # Stock Transfer events
    for t in transfer_docs:
        # Sum qty for this batch_id across items[]
        qty = sum(
            (it.get("quantity") or 0)
            for it in (t.get("items") or [])
            if it.get("batch_id") == batch_id
        )
        events.append({
            "type": "stock_transfer",
            "at": t.get("created_at"),
            "qty": qty,
            "from": _loc(t.get("source_location_id")),
            "to": _loc(t.get("dest_location_id")),
            "status": t.get("status"),
            "ref": {"kind": "stock_transfer", "id": t.get("id"),
                    "code": t.get("transfer_number")},
        })

    # Stock Out events
    qty_by_delivery: dict = {}
    for it in out_items:
        qty_by_delivery[it["delivery_id"]] = qty_by_delivery.get(it["delivery_id"], 0) + (it.get("quantity") or 0)
    for did, qty in qty_by_delivery.items():
        d = out_deliveries.get(did, {})
        acc = accounts.get(d.get("account_id")) if d.get("account_id") else None
        events.append({
            "type": "stock_out",
            "at": d.get("completed_at") or d.get("delivery_date"),
            "qty": qty,
            "from": _loc(d.get("distributor_location_id")),
            "to": {"id": d.get("account_id"),
                   "name": (acc or {}).get("account_name") or d.get("account_name") or "(unknown account)",
                   "city": (acc or {}).get("city"),
                   "is_factory": False},
            "status": d.get("status"),
            "ref": {"kind": "delivery", "id": did,
                    "code": d.get("delivery_number")},
        })

    # Sort timeline oldest → newest. Treat missing dates as max so they
    # bubble to the bottom rather than ahead of dated events.
    events.sort(key=lambda e: (e.get("at") or "9999-12-31"))

    # ── Current resting stock ──────────────────────────────────────────────
    factory_rest = await db.factory_warehouse_stock.find(
        {"tenant_id": tenant_id, "batch_id": batch_id, "quantity": {"$gt": 0}},
        {"_id": 0, "warehouse_location_id": 1, "quantity": 1, "sku_name": 1},
    ).to_list(500)
    distributor_rest = await db.distributor_stock.find(
        {"tenant_id": tenant_id, "batch_id": batch_id, "quantity": {"$gt": 0}},
        {"_id": 0, "distributor_id": 1, "distributor_name": 1, "distributor_location_id": 1,
         "quantity": 1, "sku_name": 1, "location_name": 1},
    ).to_list(2000)

    # Hydrate factory location labels for the resting list as well.
    extra_loc_ids = {r["warehouse_location_id"] for r in factory_rest if r.get("warehouse_location_id")}
    extra_loc_ids |= {r["distributor_location_id"] for r in distributor_rest if r.get("distributor_location_id")}
    extra_loc_ids -= set(locs.keys())
    if extra_loc_ids:
        more = {
            loc["id"]: loc for loc in await db.distributor_locations.find(
                {"id": {"$in": list(extra_loc_ids)}, "tenant_id": tenant_id},
                {"_id": 0, "id": 1, "location_name": 1, "city": 1, "state": 1, "is_factory": 1},
            ).to_list(1000)
        }
        locs.update(more)

    resting = []
    for r in factory_rest:
        loc = _loc(r.get("warehouse_location_id"))
        resting.append({
            "location": loc,
            "owner": "Factory",
            "qty": r.get("quantity", 0),
            "kind": "factory",
        })
    for r in distributor_rest:
        loc = _loc(r.get("distributor_location_id"))
        resting.append({
            "location": loc,
            "owner": r.get("distributor_name") or "(distributor)",
            "qty": r.get("quantity", 0),
            "kind": "distributor",
        })

    # ── Mass balance ───────────────────────────────────────────────────────
    produced = origin.get("quantity") or 0
    total_out = sum(qty_by_delivery.values())
    total_resting = sum(r["qty"] for r in resting)
    # Stock-in from factory to distributor doesn't reduce the batch's total
    # in the company's hands — it just moves ownership/location. Same for
    # internal transfers. So expected = produced - sold-to-customer.
    expected_resting = produced - total_out
    drift = expected_resting - total_resting

    return {
        "batch": {
            "id": batch_id,
            "batch_code": origin.get("batch_code"),
            "sku_id": sku_id,
            "sku_name": origin.get("sku_name"),
            "factory_location": _loc(src_loc_id),
            "produced_qty": produced,
            "produced_at": origin.get("created_at"),
            "status": origin.get("status"),
        },
        "timeline": events,
        "resting_stock": resting,
        "mass_balance": {
            "produced": produced,
            "delivered_to_customers": total_out,
            "currently_resting": total_resting,
            "expected_resting": expected_resting,
            "drift": drift,
        },
    }
