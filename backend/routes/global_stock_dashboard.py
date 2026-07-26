"""Global Stock Dashboard — tenant-wide snapshot grouped Warehouse → SKU → Child SKU.

Metrics per node (all reported BOTH in crates and units/bottles):
  on_hand   — current stock at the warehouse
              (distributor_stock is stored in CRATES; factory_warehouse_stock in UNITS/bottles)
  delivered — delivered to customer accounts from that warehouse (delivery status delivered/complete)
  reserved  — deliveries created but not yet delivered (status draft/confirmed/scheduled)
  sent      — stock transferred OUT to other warehouses (distributor_stock_transfers, status completed)
"""
from fastapi import APIRouter, Depends
from typing import Optional

from deps import get_current_user, db
from core.tenant import get_current_tenant_id

router = APIRouter()

DELIVERED_STATUSES = {"delivered", "complete"}
RESERVED_STATUSES = {"draft", "confirmed", "scheduled"}

METRICS = ("on_hand", "delivered", "reserved", "sent")


def _zero() -> dict:
    d = {}
    for m in METRICS:
        d[f"{m}_crates"] = 0.0
        d[f"{m}_units"] = 0
    return d


def _round(v: float) -> float:
    r = round(v, 2)
    return int(r) if r == int(r) else r


@router.get("/distributor/global-stock-dashboard")
async def global_stock_dashboard(current_user: dict = Depends(get_current_user)):
    tenant_id = get_current_tenant_id()

    # ── Location / distributor metadata ──────────────────────────────────
    locs = {l["id"]: l for l in await db.distributor_locations.find(
        {"tenant_id": tenant_id},
        {"_id": 0, "id": 1, "location_name": 1, "city": 1, "distributor_id": 1, "is_factory": 1},
    ).to_list(3000)}
    dists = {d["id"]: d for d in await db.distributors.find(
        {"tenant_id": tenant_id}, {"_id": 0, "id": 1, "distributor_name": 1}
    ).to_list(3000)}

    # ── units-per-crate lookup (bottles per crate, per SKU) ──────────────
    upc: dict = {}

    def learn_upc(sku_id: Optional[str], bpc):
        if sku_id and bpc and sku_id not in upc:
            try:
                b = int(bpc)
                if b > 0:
                    upc[sku_id] = b
            except Exception:
                pass

    fws_rows = await db.factory_warehouse_stock.find(
        {"tenant_id": tenant_id}, {"_id": 0}
    ).to_list(8000)
    for r in fws_rows:
        learn_upc(r.get("sku_id"), r.get("bottles_per_crate"))

    dist_rows = await db.distributor_stock.find(
        {"tenant_id": tenant_id}, {"_id": 0}
    ).to_list(8000)

    all_sku_ids = list({r.get("sku_id") for r in fws_rows + dist_rows if r.get("sku_id")})
    if all_sku_ids:
        async for ms in db.master_skus.find(
            {"id": {"$in": all_sku_ids}},
            {"_id": 0, "id": 1, "bottles_per_crate": 1, "packaging_config": 1},
        ):
            bpc = ms.get("bottles_per_crate")
            if not bpc:
                pc = (ms.get("packaging_config") or {}).get("production") or []
                default = next((p for p in pc if p.get("is_default")), None)
                if default:
                    bpc = default.get("units") or default.get("units_per_package")
            learn_upc(ms["id"], bpc)

    def sku_upc(sku_id: Optional[str]) -> int:
        return upc.get(sku_id) or 1

    # ── Aggregation: (location_id, sku_id, child_sku_id) → metrics ───────
    agg: dict = {}
    meta: dict = {}  # per-key sku_name / child name

    def bump(loc_id, sku_id, child_id, metric, crates=None, units=None,
             sku_name=None, child_name=None, warehouse_name=None):
        if not loc_id or not sku_id:
            return
        key = (loc_id, sku_id, child_id or None)
        node = agg.setdefault(key, _zero())
        n = sku_upc(sku_id)
        if crates is None:
            crates = (units or 0) / n
        if units is None:
            units = (crates or 0) * n
        node[f"{metric}_crates"] += max(0.0, float(crates or 0))
        node[f"{metric}_units"] += max(0, int(round(units or 0)))
        m = meta.setdefault(key, {})
        if sku_name:
            m.setdefault("sku_name", sku_name)
        if child_name:
            m.setdefault("child_sku_name", child_name)
        if warehouse_name:
            m.setdefault("warehouse_name", warehouse_name)

    # 1. On hand — distributor warehouses (CRATES)
    for r in dist_rows:
        bump(r.get("distributor_location_id"), r.get("sku_id"), r.get("child_sku_id"),
             "on_hand", crates=r.get("quantity") or 0,
             sku_name=r.get("sku_name"), child_name=r.get("child_sku_name"),
             warehouse_name=r.get("location_name"))

    # 2. On hand — factory warehouses (UNITS/bottles)
    for r in fws_rows:
        bump(r.get("warehouse_location_id"), r.get("sku_id"), r.get("child_sku_id"),
             "on_hand", units=r.get("quantity") or 0,
             sku_name=r.get("sku_name"), child_name=r.get("child_sku_name"),
             warehouse_name=r.get("warehouse_name"))

    # 3. Deliveries → delivered / reserved (item quantities are CRATES)
    deliveries = await db.distributor_deliveries.find(
        {"tenant_id": tenant_id, "status": {"$in": list(DELIVERED_STATUSES | RESERVED_STATUSES)}},
        {"_id": 0, "id": 1, "distributor_location_id": 1, "status": 1},
    ).to_list(20000)
    del_map = {d["id"]: d for d in deliveries}
    if del_map:
        items = await db.distributor_delivery_items.find(
            {"tenant_id": tenant_id, "delivery_id": {"$in": list(del_map.keys())}},
            {"_id": 0, "delivery_id": 1, "sku_id": 1, "sku_name": 1,
             "child_sku_id": 1, "child_sku_name": 1, "quantity": 1},
        ).to_list(50000)
        for it in items:
            d = del_map.get(it.get("delivery_id"))
            if not d:
                continue
            metric = "delivered" if d.get("status") in DELIVERED_STATUSES else "reserved"
            bump(d.get("distributor_location_id"), it.get("sku_id"), it.get("child_sku_id"),
                 metric, crates=it.get("quantity") or 0,
                 sku_name=it.get("sku_name"), child_name=it.get("child_sku_name"))

    # 4. Outbound transfers → sent (item quantities are CRATES)
    transfers = await db.distributor_stock_transfers.find(
        {"tenant_id": tenant_id, "status": "completed"},
        {"_id": 0, "source_location_id": 1, "items": 1},
    ).to_list(20000)
    for t in transfers:
        for it in (t.get("items") or []):
            bump(t.get("source_location_id"), it.get("sku_id"), it.get("child_sku_id"),
                 "sent", crates=it.get("quantity") or 0,
                 sku_name=it.get("sku_name"), child_name=it.get("child_sku_name"))

    # ── Build hierarchy: warehouse → sku → child ─────────────────────────
    def add_into(target: dict, node: dict):
        for m in METRICS:
            target[f"{m}_crates"] += node[f"{m}_crates"]
            target[f"{m}_units"] += node[f"{m}_units"]

    warehouses: dict = {}
    for (loc_id, sku_id, child_id), node in agg.items():
        m = meta.get((loc_id, sku_id, child_id), {})
        loc = locs.get(loc_id, {})
        wh = warehouses.setdefault(loc_id, {
            "location_id": loc_id,
            "location_name": loc.get("location_name") or m.get("warehouse_name") or "Unknown Warehouse",
            "city": loc.get("city"),
            "is_factory": bool(loc.get("is_factory")),
            "owner_name": (dists.get(loc.get("distributor_id")) or {}).get("distributor_name"),
            "totals": _zero(),
            "_skus": {},
        })
        sku = wh["_skus"].setdefault(sku_id, {
            "sku_id": sku_id,
            "sku_name": m.get("sku_name") or "Unknown SKU",
            "units_per_crate": sku_upc(sku_id),
            "totals": _zero(),
            "_children": {},
        })
        if not sku.get("sku_name") or sku["sku_name"] == "Unknown SKU":
            if m.get("sku_name"):
                sku["sku_name"] = m["sku_name"]
        child = sku["_children"].setdefault(child_id, {
            "child_sku_id": child_id,
            "child_sku_name": m.get("child_sku_name") or ("Generic / Unbranded" if child_id is None else "Child SKU"),
            **_zero(),
        })
        add_into(child, node)
        add_into(sku["totals"], node)
        add_into(wh["totals"], node)

    grand = _zero()
    out = []
    for wh in warehouses.values():
        skus = []
        for sku in wh.pop("_skus").values():
            children = list(sku.pop("_children").values())
            # Only expose the child breakdown when there is a REAL child SKU;
            # a lone "Generic" bucket equals the parent row and adds noise.
            has_real_children = any(c["child_sku_id"] for c in children)
            for c in children:
                for m in METRICS:
                    c[f"{m}_crates"] = _round(c[f"{m}_crates"])
            sku["children"] = sorted(
                children, key=lambda c: -c["on_hand_crates"]
            ) if has_real_children else []
            for m in METRICS:
                sku["totals"][f"{m}_crates"] = _round(sku["totals"][f"{m}_crates"])
            skus.append(sku)
        skus.sort(key=lambda s: -s["totals"]["on_hand_crates"])
        wh["skus"] = skus
        add_into(grand, wh["totals"])
        for m in METRICS:
            wh["totals"][f"{m}_crates"] = _round(wh["totals"][f"{m}_crates"])
        out.append(wh)
    out.sort(key=lambda w: -w["totals"]["on_hand_crates"])
    for m in METRICS:
        grand[f"{m}_crates"] = _round(grand[f"{m}_crates"])

    return {
        "warehouses": out,
        "grand_totals": grand,
        "warehouse_count": len(out),
        "sku_count": len({k[1] for k in agg.keys()}),
    }
