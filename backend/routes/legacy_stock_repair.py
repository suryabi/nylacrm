"""Legacy Stock Repair — admin tool to assign real production batches to
batch-less ("legacy / no batch") stock rows across every warehouse.

Endpoints (mounted under /api):
  GET  /distributor/legacy-stock            all legacy rows + batch suggestions
  GET  /distributor/legacy-stock/batches    production batches for a SKU (manual pick)
  POST /distributor/legacy-stock/assign     bulk assign (per-row or auto FIFO)
  GET  /distributor/legacy-stock/history    assignment audit trail
"""
from typing import Optional, List
from collections import defaultdict

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel, Field

from database import db
from core.tenant import get_current_tenant_id
from deps import get_current_user
from routes.branding_entries import assign_batch_to_legacy_rows, REPAIR_ROLES

router = APIRouter()

_LEGACY_Q = {"$or": [{"batch_id": None}, {"batch_id": {"$exists": False}}], "quantity": {"$gt": 0}}


def _require_repair_role(user: dict):
    if user.get("role") not in REPAIR_ROLES:
        raise HTTPException(403, "Only CEO / Admin / System Admin can repair legacy stock.")


async def _inbound_history(tenant_id: str, pairs: set) -> dict:
    """{(location_id, sku_id): {batch_id: {batch_code, qty_in, first_seen, sources:set}}}"""
    hist: dict = defaultdict(lambda: defaultdict(lambda: {"qty_in": 0, "first_seen": None, "sources": set(), "batch_code": None}))
    loc_ids = list({p[0] for p in pairs})
    sku_ids = list({p[1] for p in pairs})

    def _add(loc_id, sku_id, batch_id, batch_code, qty, when, source):
        if (loc_id, sku_id) not in pairs or not batch_id:
            return
        h = hist[(loc_id, sku_id)][batch_id]
        h["qty_in"] += int(qty or 0)
        h["sources"].add(source)
        h["batch_code"] = h["batch_code"] or batch_code
        if when and (h["first_seen"] is None or when < h["first_seen"]):
            h["first_seen"] = when

    async for t in db.warehouse_transfers.find(
            {"tenant_id": tenant_id, "warehouse_location_id": {"$in": loc_ids}, "sku_id": {"$in": sku_ids}},
            {"_id": 0, "warehouse_location_id": 1, "sku_id": 1, "batch_id": 1, "batch_code": 1, "quantity": 1, "transferred_at": 1}):
        _add(t["warehouse_location_id"], t["sku_id"], t.get("batch_id"), t.get("batch_code"), t.get("quantity"), t.get("transferred_at"), "production")

    ships = {s["id"]: s async for s in db.distributor_shipments.find(
        {"tenant_id": tenant_id, "distributor_location_id": {"$in": loc_ids}, "status": {"$in": ["delivered", "discrepancy_pending"]}},
        {"_id": 0, "id": 1, "distributor_location_id": 1, "delivered_at": 1, "shipment_date": 1})}
    if ships:
        async for it in db.distributor_shipment_items.find(
                {"tenant_id": tenant_id, "shipment_id": {"$in": list(ships)}, "sku_id": {"$in": sku_ids}},
                {"_id": 0, "shipment_id": 1, "sku_id": 1, "batch_id": 1, "batch_code": 1, "quantity": 1}):
            s = ships[it["shipment_id"]]
            _add(s["distributor_location_id"], it["sku_id"], it.get("batch_id"), it.get("batch_code"), it.get("quantity"),
                 s.get("delivered_at") or s.get("shipment_date"), "stock-in")

    async for tr in db.distributor_stock_transfers.find(
            {"tenant_id": tenant_id, "dest_location_id": {"$in": loc_ids}, "status": {"$nin": ["cancelled", "reversed"]}},
            {"_id": 0, "dest_location_id": 1, "items": 1, "transfer_date": 1, "created_at": 1}):
        for it in tr.get("items") or []:
            _add(tr["dest_location_id"], it.get("sku_id"), it.get("batch_id"), it.get("batch_code"), it.get("quantity"),
                 tr.get("transfer_date") or tr.get("created_at"), "transfer")
    return hist


async def _batches_for_skus(tenant_id: str, sku_ids: list) -> dict:
    out = defaultdict(list)
    async for b in db.production_batches.find(
            {"tenant_id": tenant_id, "sku_id": {"$in": sku_ids}, "status": {"$nin": ["cancelled", "deleted"]}},
            {"_id": 0, "id": 1, "sku_id": 1, "batch_code": 1, "production_date": 1, "created_at": 1, "status": 1}):
        out[b["sku_id"]].append(b)
    for v in out.values():
        v.sort(key=lambda b: (b.get("production_date") or b.get("created_at") or ""))
    return out


@router.get("/distributor/legacy-stock")
async def list_legacy_stock(current_user: dict = Depends(get_current_user)):
    _require_repair_role(current_user)
    tenant_id = get_current_tenant_id()
    rows = []
    async for r in db.factory_warehouse_stock.find({"tenant_id": tenant_id, **_LEGACY_Q}, {"_id": 0}):
        rows.append({**r, "location_id": r.get("warehouse_location_id"), "is_factory": True})
    async for r in db.distributor_stock.find({"tenant_id": tenant_id, **_LEGACY_Q}, {"_id": 0}):
        rows.append({**r, "location_id": r.get("distributor_location_id"), "is_factory": False})
    if not rows:
        return {"rows": [], "total_units": 0, "warehouses": 0}

    loc_ids = list({r["location_id"] for r in rows if r.get("location_id")})
    locs = {l["id"]: l async for l in db.distributor_locations.find(
        {"tenant_id": tenant_id, "id": {"$in": loc_ids}}, {"_id": 0, "id": 1, "location_name": 1, "distributor_id": 1, "is_factory": 1})}
    dist_ids = list({l.get("distributor_id") for l in locs.values() if l.get("distributor_id")})
    dists = {d["id"]: d.get("distributor_name") async for d in db.distributors.find(
        {"tenant_id": tenant_id, "id": {"$in": dist_ids}}, {"_id": 0, "id": 1, "distributor_name": 1})}
    sku_ids = list({r["sku_id"] for r in rows if r.get("sku_id")})
    skus = {s["id"]: s.get("sku_name") async for s in db.master_skus.find(
        {"id": {"$in": sku_ids}}, {"_id": 0, "id": 1, "sku_name": 1})}
    pairs = {(r["location_id"], r["sku_id"]) for r in rows}
    hist = await _inbound_history(tenant_id, pairs)
    all_batches = await _batches_for_skus(tenant_id, sku_ids)
    batch_meta = {b["id"]: b for bl in all_batches.values() for b in bl}

    out = []
    for r in rows:
        loc = locs.get(r["location_id"], {})
        h = hist.get((r["location_id"], r["sku_id"]), {})
        suggestions = []
        for bid, info in h.items():
            meta = batch_meta.get(bid, {})
            suggestions.append({
                "batch_id": bid,
                "batch_code": info["batch_code"] or meta.get("batch_code") or bid,
                "production_date": meta.get("production_date"),
                "qty_in": info["qty_in"],
                "first_seen": info["first_seen"],
                "sources": sorted(info["sources"]),
            })
        suggestions.sort(key=lambda s: (s.get("production_date") or s.get("first_seen") or "9999"))
        if suggestions:
            suggested, basis = suggestions[0], "history"
        else:
            latest = (all_batches.get(r["sku_id"]) or [])[-1:] 
            suggested = ({"batch_id": latest[0]["id"], "batch_code": latest[0].get("batch_code"),
                          "production_date": latest[0].get("production_date"), "qty_in": 0, "sources": []} if latest else None)
            basis = "latest_batch" if latest else None
        out.append({
            "key": f"{r['location_id']}|{r['sku_id']}|{r.get('child_sku_id') or ''}",
            "location_id": r["location_id"],
            "location_name": loc.get("location_name") or r.get("warehouse_name") or r.get("location_name") or "Unknown",
            "is_factory": bool(loc.get("is_factory", r.get("is_factory"))),
            "distributor_id": loc.get("distributor_id"),
            "distributor_name": dists.get(loc.get("distributor_id")),
            "sku_id": r["sku_id"],
            "sku_name": skus.get(r["sku_id"]) or r.get("sku_name") or r["sku_id"],
            "child_sku_id": r.get("child_sku_id"),
            "child_sku_name": r.get("child_sku_name") or ("Generic / Unbranded" if not r.get("child_sku_id") else r.get("child_sku_id")),
            "quantity": int(r.get("quantity") or 0),
            "created_at": r.get("created_at"),
            "suggestions": suggestions,
            "suggested_batch_id": (suggested or {}).get("batch_id"),
            "suggested_batch_code": (suggested or {}).get("batch_code"),
            "suggestion_basis": basis,
            "sku_batch_count": len(all_batches.get(r["sku_id"]) or []),
        })
    out.sort(key=lambda x: (x["location_name"], x["sku_name"], x["child_sku_name"]))
    return {"rows": out, "total_units": sum(x["quantity"] for x in out),
            "warehouses": len({x["location_id"] for x in out})}


@router.get("/distributor/legacy-stock/batches")
async def legacy_stock_batches(sku_id: str = Query(...), current_user: dict = Depends(get_current_user)):
    _require_repair_role(current_user)
    tenant_id = get_current_tenant_id()
    batches = (await _batches_for_skus(tenant_id, [sku_id])).get(sku_id, [])
    return {"batches": [{"batch_id": b["id"], "batch_code": b.get("batch_code"),
                         "production_date": b.get("production_date"), "status": b.get("status")}
                        for b in reversed(batches)]}


class LegacyAssignment(BaseModel):
    location_id: str
    sku_id: str
    child_sku_id: Optional[str] = None
    batch_id: str
    quantity: Optional[int] = Field(None, gt=0)


class LegacyAssignRequest(BaseModel):
    assignments: List[LegacyAssignment]


@router.post("/distributor/legacy-stock/assign")
async def assign_legacy_stock(payload: LegacyAssignRequest, current_user: dict = Depends(get_current_user)):
    _require_repair_role(current_user)
    if not payload.assignments:
        raise HTTPException(400, "Nothing to assign.")
    tenant_id = get_current_tenant_id()
    results, assigned_units = [], 0
    for a in payload.assignments:
        loc = await db.distributor_locations.find_one({"id": a.location_id, "tenant_id": tenant_id}, {"_id": 0})
        if not loc:
            results.append({"key": f"{a.location_id}|{a.sku_id}|{a.child_sku_id or ''}", "ok": False, "error": "Warehouse not found"})
            continue
        try:
            res = await assign_batch_to_legacy_rows(tenant_id, loc, a.sku_id, a.child_sku_id, a.batch_id,
                                                    a.quantity, current_user, source="legacy_repair")
            assigned_units += res["assigned_units"]
            results.append({"key": f"{a.location_id}|{a.sku_id}|{a.child_sku_id or ''}", "ok": True, **res})
        except HTTPException as exc:
            results.append({"key": f"{a.location_id}|{a.sku_id}|{a.child_sku_id or ''}", "ok": False, "error": exc.detail})
    return {"ok": all(r["ok"] for r in results), "assigned_units": assigned_units,
            "succeeded": sum(1 for r in results if r["ok"]), "failed": sum(1 for r in results if not r["ok"]),
            "results": results}


@router.get("/distributor/legacy-stock/history")
async def legacy_stock_history(limit: int = Query(200, le=1000), current_user: dict = Depends(get_current_user)):
    _require_repair_role(current_user)
    tenant_id = get_current_tenant_id()
    logs = await db.stock_batch_assignments.find({"tenant_id": tenant_id}, {"_id": 0}).sort("created_at", -1).to_list(limit)
    return {"logs": logs}
