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
import re
from datetime import datetime, timezone
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


@router.get("/stock-rows")
async def batch_stock_rows(batch_code: str, current_user: dict = Depends(get_current_user)):
    """Admin diagnostic: every raw stock row (including NEGATIVE rows the
    dashboards hide) for a batch, across factory + distributor stock."""
    _ensure_admin(current_user)
    tenant_id = get_current_tenant_id()
    out = {}
    for name, coll in (("factory_warehouse_stock", db.factory_warehouse_stock),
                       ("distributor_stock", db.distributor_stock)):
        rows = await coll.find(
            {"tenant_id": tenant_id, "batch_code": batch_code}, {"_id": 0}
        ).to_list(500)
        out[name] = rows
        out[f"{name}_net_quantity"] = sum(int(r.get("quantity") or 0) for r in rows)
    return out


@router.post("/rebalance-negative-stock")
async def rebalance_negative_stock(
    apply: bool = False,
    batch_code: Optional[str] = None,
    current_user: dict = Depends(get_current_user),
):
    """Repair tool: finds (warehouse, sku, batch) groups where one
    classification row went negative while sibling rows stayed positive
    (retro-categorization overdraw) and zeroes the negatives against the
    positives. Net quantity is untouched. Dry-run by default; ?apply=true writes."""
    _ensure_admin(current_user)
    tenant_id = get_current_tenant_id()
    now = datetime.now(timezone.utc).isoformat()
    moves = []
    for coll_name, coll, loc_field in (
        ("factory_warehouse_stock", db.factory_warehouse_stock, "warehouse_location_id"),
        ("distributor_stock", db.distributor_stock, "distributor_location_id"),
    ):
        q = {"tenant_id": tenant_id}
        if batch_code:
            q["batch_code"] = batch_code
        rows = await coll.find(q).to_list(20000)
        groups = {}
        for r in rows:
            groups.setdefault((r.get(loc_field), r.get("sku_id"), r.get("batch_id")), []).append(r)
        for grp in groups.values():
            negs = [r for r in grp if (r.get("quantity") or 0) < 0]
            poss = [r for r in grp if (r.get("quantity") or 0) > 0]
            if not negs or not poss:
                continue
            for neg in negs:
                need = -int(neg.get("quantity") or 0)
                for pos in poss:
                    if need <= 0:
                        break
                    avail = int(pos.get("quantity") or 0)
                    take = min(need, avail)
                    if take <= 0:
                        continue
                    moves.append({
                        "collection": coll_name,
                        "location_id": pos.get(loc_field),
                        "sku_name": neg.get("sku_name") or pos.get("sku_name"),
                        "batch_code": neg.get("batch_code") or pos.get("batch_code"),
                        "from_classification": pos.get("child_sku_name") or "Generic",
                        "to_classification": neg.get("child_sku_name") or "Generic",
                        "units": take,
                        "negative_row_before": int(neg.get("quantity") or 0),
                        "positive_row_before": avail,
                    })
                    pos["quantity"] = avail - take
                    need -= take
                    if apply:
                        await coll.update_one({"_id": pos["_id"]}, {"$inc": {"quantity": -take}, "$set": {"updated_at": now}})
                        await coll.update_one({"_id": neg["_id"]}, {"$inc": {"quantity": take}, "$set": {"updated_at": now}})
    return {"applied": apply, "total_moves": len(moves), "moves": moves}


@router.get("/repair-promo-units")
async def repair_promo_units(apply: bool = False, current_user: dict = Depends(get_current_user)):
    """Repair tool for the bottles-interpreted-as-crates bug: promo stock-outs
    auto-created from Delivery Orders inflated quantities by units-per-package
    (order asked N bottles → promo dispatched N crates = N×upp bottles).
    Detects linked promo items where quantity == order_qty × upp and corrects
    them back to bottles (+ per-bottle price + dispatch totals). For COMPLETED
    dispatches the over-deducted stock is restored to the source warehouse row;
    draft/confirmed dispatches only RESERVE stock, so fixing the item rows fixes
    the reservation. Dry-run by default; ?apply=true writes."""
    _ensure_admin(current_user)
    from routes.promo_dispatch import _adjust_stock_for_dispatch
    tenant_id = get_current_tenant_id()
    now = datetime.now(timezone.utc).isoformat()
    findings = []
    affected_batches = set()
    orders = await db.delivery_orders.find(
        {"tenant_id": tenant_id, "promo_dispatch_id": {"$nin": [None, ""]}},
        {"_id": 0, "id": 1, "order_number": 1, "items": 1, "promo_dispatch_id": 1}).to_list(2000)
    for order in orders:
        promo_id = order["promo_dispatch_id"]
        promo_items = await db.distributor_delivery_items.find(
            {"tenant_id": tenant_id, "delivery_id": promo_id}).to_list(100)
        dispatch = await db.distributor_deliveries.find_one(
            {"tenant_id": tenant_id, "id": promo_id},
            {"_id": 0, "id": 1, "challan_number": 1, "delivery_number": 1, "status": 1,
             "is_factory": 1, "distributor_id": 1, "distributor_location_id": 1})
        if not promo_items or not dispatch:
            continue
        order_by_sku = {}
        for oi in order.get("items") or []:
            order_by_sku.setdefault(oi.get("sku_id"), []).append(oi)
        changed = False
        for pi in promo_items:
            candidates = order_by_sku.get(pi.get("sku_id")) or []
            upp = int(pi.get("packaging_units") or pi.get("units_per_package") or 1)
            oi = next((o for o in candidates
                       if upp > 1
                       and int(pi.get("packages") or 0) == int(o.get("quantity") or 0)
                       and int(pi.get("quantity") or 0) == int(o.get("quantity") or 0) * upp), None)
            if not oi:
                continue
            correct_bottles = int(oi.get("quantity") or 0)
            per_bottle = float(oi.get("unit_price") or 0)
            if correct_bottles >= upp and correct_bottles % upp == 0:
                new_packages, new_upp = correct_bottles // upp, upp
            else:
                new_packages, new_upp = correct_bottles, 1
            excess = int(pi.get("quantity") or 0) - correct_bottles
            stock_deducted = (dispatch.get("status") or "") in ("complete", "completed", "delivered")
            findings.append({
                "order_number": order.get("order_number"),
                "challan": dispatch.get("challan_number") or dispatch.get("delivery_number"),
                "dispatch_status": dispatch.get("status"),
                "sku_name": pi.get("sku_name"),
                "batch_code": pi.get("batch_code"),
                "was_bottles": int(pi.get("quantity") or 0),
                "corrected_bottles": correct_bottles,
                "excess_bottles": excess,
                "stock_restoration": "restored" if (stock_deducted and excess > 0) else
                                     ("not needed — stock only reserved, reservation shrinks with the fix"
                                      if excess > 0 else "none"),
            })
            if pi.get("batch_code"):
                affected_batches.add(pi["batch_code"])
            if apply:
                await db.distributor_delivery_items.update_one(
                    {"_id": pi["_id"]},
                    {"$set": {"quantity": correct_bottles, "packages": new_packages,
                              "packaging_units": new_upp, "units_per_package": new_upp,
                              "unit_price": per_bottle,
                              "line_value": round(correct_bottles * per_bottle, 2),
                              "updated_at": now,
                              "unit_repair_note": f"Corrected bottles-as-crates inflation on {now}"}})
                if stock_deducted and excess > 0:
                    # Restore the over-deducted units to the exact stock row the
                    # completion deducted from (same key convention).
                    await _adjust_stock_for_dispatch(
                        tenant_id, dispatch, [{**pi, "quantity": excess}], sign=+1)
                changed = True
        if apply and changed:
            fresh = await db.distributor_delivery_items.find(
                {"tenant_id": tenant_id, "delivery_id": promo_id},
                {"_id": 0, "quantity": 1, "line_value": 1}).to_list(100)
            await db.distributor_deliveries.update_one(
                {"tenant_id": tenant_id, "id": promo_id},
                {"$set": {"total_quantity": sum(int(f.get("quantity") or 0) for f in fresh),
                          "total_value": round(sum(float(f.get("line_value") or 0) for f in fresh), 2),
                          "updated_at": now}})
    return {
        "applied": apply,
        "total_inflated_lines": len(findings),
        "findings": findings,
        "affected_batch_codes": sorted(affected_batches),
        "note": ("Stock for COMPLETED dispatches is restored automatically on apply. "
                 "Optionally verify each affected batch with reconcile-batch-stock?batch_code=<code> (dry-run)."),
    }


@router.get("/reconcile-batch-stock")
async def reconcile_batch_stock(
    batch_code: str,
    apply: bool = False,
    current_user: dict = Depends(get_current_user),
):
    """Compares the RAW factory_warehouse_stock rows for a batch against the
    EXPECTED on-hand derived from movement evidence (warehouse transfers in −
    confirmed shipments out − completed direct deliveries out ± completed stock
    transfers). Reports the delta per warehouse; ?apply=true corrects the rows
    to the evidence-based expected value (adjustment applied to the largest row)."""
    _ensure_admin(current_user)
    tenant_id = get_current_tenant_id()
    now = datetime.now(timezone.utc).isoformat()

    batch = await db.production_batches.find_one(
        {"tenant_id": tenant_id, "batch_code": batch_code}, {"_id": 0, "id": 1, "sku_id": 1})
    if not batch:
        raise HTTPException(404, f"Batch {batch_code} not found")
    batch_id = batch["id"]

    # IN: QC → factory warehouse transfers
    in_by_wh: dict = {}
    async for t in db.warehouse_transfers.find(
            {"tenant_id": tenant_id, "batch_id": batch_id}, {"_id": 0, "warehouse_location_id": 1, "quantity": 1}):
        wid = t.get("warehouse_location_id")
        if wid:
            in_by_wh[wid] = in_by_wh.get(wid, 0) + int(t.get("quantity") or 0)

    # OUT 1: confirmed Stock-In shipments leaving a factory warehouse
    out_by_wh: dict = {}
    ship_items = await db.distributor_shipment_items.find(
        {"tenant_id": tenant_id, "batch_id": batch_id}, {"_id": 0, "shipment_id": 1, "quantity": 1}).to_list(2000)
    ship_ids = list({i["shipment_id"] for i in ship_items if i.get("shipment_id")})
    ships = {s["id"]: s for s in await db.distributor_shipments.find(
        {"tenant_id": tenant_id, "id": {"$in": ship_ids},
         "status": {"$nin": ["draft", "pending", "cancelled"]}},
        {"_id": 0, "id": 1, "source_warehouse_id": 1, "shipment_number": 1}).to_list(2000)} if ship_ids else {}
    for i in ship_items:
        s = ships.get(i.get("shipment_id"))
        if s and s.get("source_warehouse_id"):
            wid = s["source_warehouse_id"]
            out_by_wh[wid] = out_by_wh.get(wid, 0) + int(i.get("quantity") or 0)

    # OUT 2: completed direct factory→account deliveries
    delv_items = await db.distributor_delivery_items.find(
        {"tenant_id": tenant_id, "batch_id": batch_id}, {"_id": 0, "delivery_id": 1, "quantity": 1}).to_list(2000)
    delv_ids = list({i["delivery_id"] for i in delv_items if i.get("delivery_id")})
    delvs = {d["id"]: d for d in await db.distributor_deliveries.find(
        {"tenant_id": tenant_id, "id": {"$in": delv_ids},
         "status": {"$in": ["complete", "completed", "delivered"]}},
        {"_id": 0, "id": 1, "distributor_location_id": 1, "delivery_number": 1}).to_list(2000)} if delv_ids else {}
    delivery_out_detail = []
    for i in delv_items:
        d = delvs.get(i.get("delivery_id"))
        if d and d.get("distributor_location_id"):
            wid = d["distributor_location_id"]
            out_by_wh[wid] = out_by_wh.get(wid, 0) + int(i.get("quantity") or 0)
            delivery_out_detail.append({"delivery_number": d.get("delivery_number"), "units": int(i.get("quantity") or 0)})

    # OUT/IN 3: completed inter-warehouse stock transfers carrying this batch
    async for x in db.distributor_stock_transfers.find(
            {"tenant_id": tenant_id, "status": "completed", "items.batch_id": batch_id},
            {"_id": 0, "source_location_id": 1, "dest_location_id": 1, "items": 1}):
        for it in x.get("items") or []:
            if it.get("batch_id") != batch_id:
                continue
            units = int(it.get("quantity_units") or it.get("quantity") or 0)
            if x.get("source_location_id"):
                out_by_wh[x["source_location_id"]] = out_by_wh.get(x["source_location_id"], 0) + units
            if x.get("dest_location_id"):
                in_by_wh[x["dest_location_id"]] = in_by_wh.get(x["dest_location_id"], 0) + units

    # ACTUAL rows
    rows = await db.factory_warehouse_stock.find(
        {"tenant_id": tenant_id, "batch_id": batch_id}).to_list(500)
    actual_by_wh: dict = {}
    rows_by_wh: dict = {}
    for r in rows:
        wid = r.get("warehouse_location_id")
        actual_by_wh[wid] = actual_by_wh.get(wid, 0) + int(r.get("quantity") or 0)
        rows_by_wh.setdefault(wid, []).append(r)

    report = []
    for wid in set(list(in_by_wh) + list(out_by_wh) + list(actual_by_wh)):
        expected = in_by_wh.get(wid, 0) - out_by_wh.get(wid, 0)
        actual = actual_by_wh.get(wid, 0)
        delta = actual - expected
        corrected = False
        if apply and delta != 0 and rows_by_wh.get(wid):
            target = max(rows_by_wh[wid], key=lambda r: int(r.get("quantity") or 0))
            await db.factory_warehouse_stock.update_one(
                {"_id": target["_id"]},
                {"$inc": {"quantity": -delta},
                 "$set": {"updated_at": now,
                          "reconcile_note": f"Reconciled {delta:+d} on {now} by {current_user.get('email')} (evidence-based)"}})
            corrected = True
        report.append({
            "warehouse_location_id": wid,
            "received_in": in_by_wh.get(wid, 0),
            "moved_out": out_by_wh.get(wid, 0),
            "expected_on_hand": expected,
            "actual_rows_total": actual,
            "delta_phantom_units": delta,
            "row_quantities": [{"quantity": r.get("quantity"), "child_sku_name": r.get("child_sku_name") or "Generic"} for r in rows_by_wh.get(wid, [])],
            "corrected": corrected,
        })
    return {
        "batch_code": batch_code,
        "applied": apply,
        "warehouses": report,
        "delivery_out_detail": delivery_out_detail,
    }


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
        # Escape regex metachars — `q` is a user-supplied substring filter,
        # not a regex contract.
        safe = re.escape(q)
        query["$or"] = [
            {"batch_code": {"$regex": safe, "$options": "i"}},
            {"sku_name": {"$regex": safe, "$options": "i"}},
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
