"""
Admin → Batch Genealogy.

For any production batch (`production_batches.id`), traces every movement of
that batch across the supply chain:

  • Origin            — `production_batches` row (SKU, total produced/rejected,
                        warehouse-ready). Factory warehouse(s) the batch was
                        transferred to are derived from `warehouse_transfers`.
  • Factory Transfer  — `warehouse_transfers` rows where the QC'd bottles of
                        this batch were moved into specific factory warehouse
                        locations.
  • Stock In  events  — `distributor_shipment_items` carrying this batch_id,
                        joined to the parent `distributor_shipments`.
  • Stock Transfer    — `distributor_stock_transfers` whose `items[].batch_id`
                        matches (inter-warehouse moves under same PAN).
  • Stock Out events  — `distributor_delivery_items` carrying this batch_id,
                        joined to parent `distributor_deliveries`.
  • Resting stock     — Factory: derived (transferred_to_warehouse minus
                        shipments out for this batch, since
                        `factory_warehouse_stock` is NOT batch-aware).
                        Distributor: direct read of `distributor_stock` rows
                        for this batch_id.
  • Mass balance      — produced − rejected − delivered − resting = drift.
                        Should be ~0 for a healthy batch.

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
    Used by the genealogy page's batch picker."""
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
        {
            "_id": 0, "id": 1, "batch_code": 1, "sku_id": 1, "sku_name": 1,
            "total_bottles": 1, "total_passed_final": 1,
            "transferred_to_warehouse": 1, "total_rejected": 1, "status": 1,
            "production_date": 1, "created_at": 1,
        },
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
    sku_id = origin.get("sku_id")

    # Collect location & account ids to hydrate names in one pass.
    loc_ids: set = set()
    account_ids: set = set()

    # ── Factory warehouse arrivals (warehouse_transfers) ───────────────────
    factory_transfers = await db.warehouse_transfers.find(
        {"tenant_id": tenant_id, "batch_id": batch_id},
        {"_id": 0, "id": 1, "warehouse_location_id": 1, "warehouse_name": 1,
         "quantity": 1, "transferred_at": 1, "transferred_by_name": 1, "notes": 1},
    ).to_list(500)
    for ft in factory_transfers:
        if ft.get("warehouse_location_id"):
            loc_ids.add(ft["warehouse_location_id"])

    # ── Stock In events (factory → distributor) ────────────────────────────
    in_items = await db.distributor_shipment_items.find(
        {"tenant_id": tenant_id, "batch_id": batch_id},
        {"_id": 0, "shipment_id": 1, "sku_id": 1, "quantity": 1,
         "batch_code": 1, "unit_price": 1},
    ).to_list(2000)
    in_shipment_ids = list({i["shipment_id"] for i in in_items if i.get("shipment_id")})
    in_shipments = {
        s["id"]: s for s in await db.distributor_shipments.find(
            {"id": {"$in": in_shipment_ids}, "tenant_id": tenant_id},
            {"_id": 0, "id": 1, "shipment_number": 1, "source_warehouse_id": 1,
             "distributor_id": 1, "distributor_name": 1,
             "distributor_location_id": 1, "distributor_location_name": 1,
             "status": 1, "shipment_date": 1, "delivered_at": 1,
             "confirmed_at": 1, "created_at": 1},
        ).to_list(2000)
    } if in_shipment_ids else {}
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
        {"_id": 0, "delivery_id": 1, "sku_id": 1, "quantity": 1,
         "batch_code": 1, "unit_price": 1},
    ).to_list(2000)
    out_delivery_ids = list({i["delivery_id"] for i in out_items if i.get("delivery_id")})
    out_deliveries = {
        d["id"]: d for d in await db.distributor_deliveries.find(
            {"id": {"$in": out_delivery_ids}, "tenant_id": tenant_id},
            {"_id": 0, "id": 1, "delivery_number": 1, "account_id": 1,
             "account_name": 1, "distributor_id": 1,
             "distributor_location_id": 1, "delivery_date": 1, "status": 1,
             "completed_at": 1, "created_at": 1},
        ).to_list(2000)
    } if out_delivery_ids else {}
    for d in out_deliveries.values():
        if d.get("distributor_location_id"):
            loc_ids.add(d["distributor_location_id"])
        if d.get("account_id"):
            account_ids.add(d["account_id"])

    # ── Distributor resting stock (batch-aware) ────────────────────────────
    distributor_rest = await db.distributor_stock.find(
        {"tenant_id": tenant_id, "batch_id": batch_id, "quantity": {"$gt": 0}},
        {"_id": 0, "distributor_id": 1, "distributor_name": 1,
         "distributor_location_id": 1, "quantity": 1, "sku_name": 1,
         "location_name": 1},
    ).to_list(2000)
    for r in distributor_rest:
        if r.get("distributor_location_id"):
            loc_ids.add(r["distributor_location_id"])

    # ── Hydrate location & account labels ──────────────────────────────────
    locs = {
        loc["id"]: loc for loc in await db.distributor_locations.find(
            {"id": {"$in": list(loc_ids)}, "tenant_id": tenant_id},
            {"_id": 0, "id": 1, "location_name": 1, "city": 1, "state": 1,
             "is_factory": 1, "distributor_id": 1, "distributor_name": 1},
        ).to_list(2000)
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
            "distributor_name": loc.get("distributor_name"),
        }

    # ── Build chronological timeline ───────────────────────────────────────
    events: List[dict] = []

    # 1. Produced
    events.append({
        "type": "produced",
        "at": origin.get("created_at"),
        "qty": origin.get("total_bottles") or 0,
        "from": None,
        "to": None,
        "ref": {
            "kind": "production_batch",
            "id": batch_id,
            "code": origin.get("batch_code"),
        },
        "note": (
            f"QC passed: {origin.get('total_passed_final') or 0}, "
            f"Rejected: {origin.get('total_rejected') or 0}"
        ),
    })

    # 2. Factory warehouse arrivals
    for ft in factory_transfers:
        events.append({
            "type": "factory_transfer",
            "at": ft.get("transferred_at"),
            "qty": ft.get("quantity") or 0,
            "from": None,
            "to": _loc(ft.get("warehouse_location_id")),
            "ref": {
                "kind": "warehouse_transfer",
                "id": ft.get("id"),
                "code": None,
            },
            "note": ft.get("notes") or None,
            "by": ft.get("transferred_by_name"),
        })

    # 3. Stock In events — one entry per shipment×batch row.
    qty_by_shipment: dict = {}
    for it in in_items:
        qty_by_shipment[it["shipment_id"]] = (
            qty_by_shipment.get(it["shipment_id"], 0) + (it.get("quantity") or 0)
        )
    for sid, qty in qty_by_shipment.items():
        s = in_shipments.get(sid, {})
        events.append({
            "type": "stock_in",
            "at": (s.get("delivered_at") or s.get("confirmed_at")
                   or s.get("shipment_date") or s.get("created_at")),
            "qty": qty,
            "from": _loc(s.get("source_warehouse_id")),
            "to": _loc(s.get("distributor_location_id")),
            "status": s.get("status"),
            "ref": {
                "kind": "shipment",
                "id": sid,
                "code": s.get("shipment_number"),
                "distributor": s.get("distributor_name"),
            },
        })

    # 4. Stock Transfer events
    for t in transfer_docs:
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
            "ref": {
                "kind": "stock_transfer",
                "id": t.get("id"),
                "code": t.get("transfer_number"),
            },
        })

    # 5. Stock Out events
    qty_by_delivery: dict = {}
    for it in out_items:
        qty_by_delivery[it["delivery_id"]] = (
            qty_by_delivery.get(it["delivery_id"], 0) + (it.get("quantity") or 0)
        )
    for did, qty in qty_by_delivery.items():
        d = out_deliveries.get(did, {})
        acc = accounts.get(d.get("account_id")) if d.get("account_id") else None
        events.append({
            "type": "stock_out",
            "at": d.get("completed_at") or d.get("delivery_date") or d.get("created_at"),
            "qty": qty,
            "from": _loc(d.get("distributor_location_id")),
            "to": {
                "id": d.get("account_id"),
                "name": (acc or {}).get("account_name") or d.get("account_name") or "(unknown account)",
                "city": (acc or {}).get("city"),
                "is_factory": False,
            },
            "status": d.get("status"),
            "ref": {
                "kind": "delivery",
                "id": did,
                "code": d.get("delivery_number"),
            },
        })

    # Sort oldest → newest. Missing dates sink to bottom.
    events.sort(key=lambda e: (e.get("at") or "9999-12-31"))

    # ── Resting stock view ─────────────────────────────────────────────────
    # Factory resting is derived: per-warehouse, sum(arrivals) − sum(stock_in
    # shipments leaving from that warehouse for this batch).
    factory_in_by_loc: dict = {}
    for ft in factory_transfers:
        wid = ft.get("warehouse_location_id")
        if wid:
            factory_in_by_loc[wid] = factory_in_by_loc.get(wid, 0) + (ft.get("quantity") or 0)
    factory_out_by_loc: dict = {}
    for it in in_items:
        s = in_shipments.get(it.get("shipment_id"), {})
        wid = s.get("source_warehouse_id")
        if wid:
            factory_out_by_loc[wid] = factory_out_by_loc.get(wid, 0) + (it.get("quantity") or 0)

    resting: list = []
    for wid, qty_in in factory_in_by_loc.items():
        net = qty_in - factory_out_by_loc.get(wid, 0)
        if net > 0:
            resting.append({
                "location": _loc(wid),
                "owner": "Factory",
                "qty": net,
                "kind": "factory",
            })
    for r in distributor_rest:
        resting.append({
            "location": _loc(r.get("distributor_location_id")),
            "owner": r.get("distributor_name") or "(distributor)",
            "qty": r.get("quantity", 0),
            "kind": "distributor",
        })

    # ── Mass balance ───────────────────────────────────────────────────────
    produced = origin.get("total_bottles") or 0
    rejected = origin.get("total_rejected") or 0
    transferred_to_warehouse = origin.get("transferred_to_warehouse") or 0
    delivered_to_customers = sum(qty_by_delivery.values())
    currently_resting = sum(r["qty"] for r in resting)

    # Expected resting after the chain settles. A unit can be:
    #  - rejected at QC (never enters warehouse), OR
    #  - awaiting warehouse transfer (still in QC pipeline), OR
    #  - resting at factory/distributor warehouse, OR
    #  - delivered out to a customer.
    in_qc_pipeline = max(produced - rejected - transferred_to_warehouse, 0)
    expected_resting = transferred_to_warehouse - delivered_to_customers
    drift = expected_resting - currently_resting

    return {
        "batch": {
            "id": batch_id,
            "batch_code": origin.get("batch_code"),
            "sku_id": sku_id,
            "sku_name": origin.get("sku_name"),
            "production_date": origin.get("production_date"),
            "produced_at": origin.get("created_at"),
            "status": origin.get("status"),
            "total_bottles": produced,
            "total_passed_final": origin.get("total_passed_final") or 0,
            "transferred_to_warehouse": transferred_to_warehouse,
            "total_rejected": rejected,
            "bottles_per_crate": origin.get("bottles_per_crate"),
            "total_crates": origin.get("total_crates"),
        },
        "timeline": events,
        "resting_stock": resting,
        "mass_balance": {
            "produced": produced,
            "rejected_at_qc": rejected,
            "transferred_to_warehouse": transferred_to_warehouse,
            "delivered_to_customers": delivered_to_customers,
            "currently_resting": currently_resting,
            "in_qc_pipeline": in_qc_pipeline,
            "expected_resting": expected_resting,
            "drift": drift,
        },
    }
