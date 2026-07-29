"""Global Stock Dashboard — tenant-wide snapshot grouped Warehouse → SKU → Child SKU.

Metrics per node (all reported BOTH in crates and units/bottles) — mirrors the
per-distributor Stock Dashboard tab:
  received        — stock received (delivered shipments + inbound transfers +
                    factory-warehouse stock from production)
  delivered       — delivered to CUSTOMER accounts (delivery status delivered/complete)
  reserved        — committed to open Stock Out orders (draft → in-transit)
  sent            — transferred OUT to other warehouses (stock transfers, completed)
  empty_bottles   — customer returns: empty/reusable + promotional (recycling)
  product_returns — customer returns: damaged + expired (unsellable)
  factory_returns — stock sent back to the factory
  on_hand         — current physical warehouse stock (Wh. Stock)
  available       — on_hand − reserved (deliverable right now)

NOTE: customer returns carry no warehouse — they are attributed to the
distributor's default location.
"""
import io
from datetime import datetime, timezone

from fastapi import APIRouter, Depends
from fastapi.responses import StreamingResponse
from typing import Optional
from openpyxl import Workbook
from openpyxl.styles import Font, PatternFill, Alignment

from deps import get_current_user, db
from core.tenant import get_current_tenant_id

router = APIRouter()

DELIVERED_STATUSES = {"delivered", "complete", "completed"}
RESERVED_STATUSES = {"draft", "confirmed", "scheduled"}
EMPTY_CATEGORIES = {"empty_reusable", "promotional"}
PRODUCT_RETURN_CATEGORIES = {"damaged", "expired"}

METRICS = ("received", "delivered", "reserved", "sent",
           "empty_bottles", "product_returns", "factory_returns", "on_hand")


def _zero() -> dict:
    d = {}
    for m in METRICS:
        d[f"{m}_crates"] = 0.0
        d[f"{m}_units"] = 0
    return d


def _round(v: float) -> float:
    r = round(v, 2)
    return int(r) if r == int(r) else r


def _item_units(item: dict) -> int:
    """Line item base-unit (bottles) contribution.

    Ground truth is packages × packaging_units when both known; falls back to
    qty × packaging_units (old model) or qty as-is (loose base units)."""
    try:
        qty = int(item.get("quantity") or 0)
    except Exception:
        qty = 0
    try:
        pu = int(item.get("packaging_units") or 0)
    except Exception:
        pu = 0
    pk = item.get("packages")
    try:
        pk = int(pk) if pk not in (None, "") else 0
    except (TypeError, ValueError):
        pk = 0
    if pk > 0 and pu > 1:
        return pk * pu
    if pk > 0:
        return qty
    if pu > 1:
        return qty * pu
    return qty


async def _build_dashboard(tenant_id: str) -> dict:

    # ── Location / distributor metadata ──────────────────────────────────
    locs = {l["id"]: l for l in await db.distributor_locations.find(
        {"tenant_id": tenant_id},
        {"_id": 0, "id": 1, "location_name": 1, "city": 1, "distributor_id": 1,
         "is_factory": 1, "is_default": 1, "created_at": 1},
    ).to_list(3000)}
    dists = {d["id"]: d for d in await db.distributors.find(
        {"tenant_id": tenant_id}, {"_id": 0, "id": 1, "distributor_name": 1}
    ).to_list(3000)}

    # distributor_id → default (or first) location, used for flows that are
    # only distributor-scoped (customer returns).
    default_loc_by_dist: dict = {}
    for l in locs.values():
        did = l.get("distributor_id")
        if not did:
            continue
        cur = default_loc_by_dist.get(did)
        if cur is None or (l.get("is_default") and not cur.get("is_default")):
            default_loc_by_dist[did] = l

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

    # 2. On hand — factory warehouses (UNITS/bottles). Production stock in the
    #    warehouse also counts as "received" (mirrors distributor dashboard).
    for r in fws_rows:
        for metric in ("on_hand", "received"):
            bump(r.get("warehouse_location_id"), r.get("sku_id"), r.get("child_sku_id"),
                 metric, units=r.get("quantity") or 0,
                 sku_name=r.get("sku_name"), child_name=r.get("child_sku_name"),
                 warehouse_name=r.get("warehouse_name"))

    # 3. Received — delivered stock-in shipments (per warehouse)
    shipments = await db.distributor_shipments.find(
        {"tenant_id": tenant_id, "status": "delivered"},
        {"_id": 0, "id": 1, "distributor_id": 1, "distributor_location_id": 1},
    ).to_list(20000)
    ship_map = {s["id"]: s for s in shipments}
    if ship_map:
        sitems = await db.distributor_shipment_items.find(
            {"tenant_id": tenant_id, "shipment_id": {"$in": list(ship_map.keys())}},
            {"_id": 0, "shipment_id": 1, "sku_id": 1, "sku_name": 1,
             "child_sku_id": 1, "child_sku_name": 1,
             "quantity": 1, "packaging_units": 1, "packages": 1},
        ).to_list(50000)
        for it in sitems:
            s = ship_map.get(it.get("shipment_id"))
            if not s:
                continue
            loc_id = s.get("distributor_location_id") or \
                (default_loc_by_dist.get(s.get("distributor_id")) or {}).get("id")
            bump(loc_id, it.get("sku_id"), it.get("child_sku_id"),
                 "received", units=_item_units(it),
                 sku_name=it.get("sku_name"), child_name=it.get("child_sku_name"))

    # 4. Deliveries → delivered / reserved (base units via item heuristic)
    deliveries = await db.distributor_deliveries.find(
        {"tenant_id": tenant_id, "status": {"$in": list(DELIVERED_STATUSES | RESERVED_STATUSES)}},
        {"_id": 0, "id": 1, "distributor_location_id": 1, "status": 1},
    ).to_list(20000)
    del_map = {d["id"]: d for d in deliveries}
    if del_map:
        items = await db.distributor_delivery_items.find(
            {"tenant_id": tenant_id, "delivery_id": {"$in": list(del_map.keys())}},
            {"_id": 0, "delivery_id": 1, "sku_id": 1, "sku_name": 1,
             "child_sku_id": 1, "child_sku_name": 1,
             "quantity": 1, "packaging_units": 1, "packages": 1},
        ).to_list(50000)
        for it in items:
            d = del_map.get(it.get("delivery_id"))
            if not d:
                continue
            metric = "delivered" if d.get("status") in DELIVERED_STATUSES else "reserved"
            bump(d.get("distributor_location_id"), it.get("sku_id"), it.get("child_sku_id"),
                 metric, units=_item_units(it),
                 sku_name=it.get("sku_name"), child_name=it.get("child_sku_name"))

    # 5. Transfers → sent (source) / received (destination). Item quantity is
    #    packages/crates; units_per_package when stored, else SKU default upc.
    transfers = await db.distributor_stock_transfers.find(
        {"tenant_id": tenant_id, "status": "completed"},
        {"_id": 0, "source_location_id": 1, "dest_location_id": 1, "items": 1},
    ).to_list(20000)
    for t in transfers:
        for it in (t.get("items") or []):
            sid = it.get("sku_id")
            qty = it.get("quantity") or 0
            try:
                upp = int(it.get("units_per_package") or 0)
            except Exception:
                upp = 0
            units = qty * (upp or sku_upc(sid))
            bump(t.get("source_location_id"), sid, it.get("child_sku_id"),
                 "sent", crates=qty, units=units,
                 sku_name=it.get("sku_name"), child_name=it.get("child_sku_name"))
            bump(t.get("dest_location_id"), sid, it.get("child_sku_id"),
                 "received", crates=qty, units=units,
                 sku_name=it.get("sku_name"), child_name=it.get("child_sku_name"))

    # 6. Customer returns → empty_bottles / product_returns (raw bottles).
    #    Returns have no warehouse — attributed to distributor default location.
    customer_returns = await db.customer_returns.find(
        {"tenant_id": tenant_id, "status": {"$nin": ["cancelled", "draft"]}},
        {"_id": 0, "distributor_id": 1, "items": 1},
    ).to_list(20000)
    for cr in customer_returns:
        loc = default_loc_by_dist.get(cr.get("distributor_id")) or {}
        for it in (cr.get("items") or []):
            cat = it.get("reason_category") or "other"
            if cat in EMPTY_CATEGORIES:
                metric = "empty_bottles"
            elif cat in PRODUCT_RETURN_CATEGORIES:
                metric = "product_returns"
            else:
                continue
            bump(loc.get("id"), it.get("sku_id"), it.get("child_sku_id"),
                 metric, units=it.get("quantity") or 0,
                 sku_name=it.get("sku_name"), child_name=it.get("child_sku_name"))

    # 7. Factory returns (per warehouse; quantities are base units/bottles)
    factory_returns = await db.distributor_factory_returns.find(
        {"tenant_id": tenant_id, "status": {"$nin": ["cancelled", "draft"]}},
        {"_id": 0, "distributor_id": 1, "distributor_location_id": 1, "items": 1},
    ).to_list(20000)
    for fr in factory_returns:
        loc_id = fr.get("distributor_location_id") or \
            (default_loc_by_dist.get(fr.get("distributor_id")) or {}).get("id")
        for it in (fr.get("items") or []):
            bump(loc_id, it.get("sku_id"), it.get("child_sku_id"),
                 "factory_returns", units=it.get("quantity") or 0,
                 sku_name=it.get("sku_name"), child_name=it.get("child_sku_name"))

    # ── Build hierarchy: warehouse → sku → child ─────────────────────────
    def add_into(target: dict, node: dict):
        for m in METRICS:
            target[f"{m}_crates"] += node[f"{m}_crates"]
            target[f"{m}_units"] += node[f"{m}_units"]

    def finalize(node: dict):
        """Round crates + derive available = on_hand − reserved."""
        for m in METRICS:
            node[f"{m}_crates"] = _round(node[f"{m}_crates"])
        node["available_crates"] = _round(node["on_hand_crates"] - node["reserved_crates"])
        node["available_units"] = node["on_hand_units"] - node["reserved_units"]

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
                finalize(c)
            sku["children"] = sorted(
                children, key=lambda c: -c["on_hand_crates"]
            ) if has_real_children else []
            finalize(sku["totals"])
            skus.append(sku)
        skus.sort(key=lambda s: -s["totals"]["on_hand_crates"])
        wh["skus"] = skus
        add_into(grand, wh["totals"])
        finalize(wh["totals"])
        out.append(wh)
    out.sort(key=lambda w: -w["totals"]["on_hand_crates"])
    finalize(grand)

    return {
        "warehouses": out,
        "grand_totals": grand,
        "warehouse_count": len(out),
        "sku_count": len({k[1] for k in agg.keys()}),
    }


@router.get("/distributor/global-stock-dashboard")
async def global_stock_dashboard(current_user: dict = Depends(get_current_user)):
    return await _build_dashboard(get_current_tenant_id())


EXPORT_METRICS = [
    ("received", "Received"), ("delivered", "Delivered"), ("reserved", "Reserved"),
    ("sent", "Transfer Out"), ("empty_bottles", "Empty Bottles"),
    ("product_returns", "Product Ret."), ("factory_returns", "Factory Ret."),
    ("on_hand", "Wh. Stock"), ("available", "Available"),
]


@router.get("/distributor/global-stock-dashboard/export")
async def export_global_stock_dashboard(
    unit: str = "crates",
    current_user: dict = Depends(get_current_user),
):
    """Excel export of the global stock dashboard incl. child SKU drill-down."""
    tenant_id = get_current_tenant_id()
    data = await _build_dashboard(tenant_id)
    suffix = "crates" if unit == "crates" else "units"

    wb = Workbook()
    ws = wb.active
    ws.title = f"Global Stock ({suffix})"

    headers = ["Warehouse", "Owner", "City", "Type", "SKU", "Child SKU / Branding",
               "Units per Crate"] + [label for _, label in EXPORT_METRICS]
    ws.append(headers)
    head_fill = PatternFill(start_color="1E293B", end_color="1E293B", fill_type="solid")
    for cell in ws[1]:
        cell.font = Font(bold=True, color="FFFFFF")
        cell.fill = head_fill
        cell.alignment = Alignment(horizontal="center", wrap_text=True)

    wh_fill = PatternFill(start_color="D1FAE5", end_color="D1FAE5", fill_type="solid")
    child_fill = PatternFill(start_color="F1F5F9", end_color="F1F5F9", fill_type="solid")
    bold = Font(bold=True)

    def metric_cells(node):
        return [node.get(f"{m}_{suffix}", 0) for m, _ in EXPORT_METRICS]

    for w in data["warehouses"]:
        wh_type = "Factory" if w.get("is_factory") else "Warehouse"
        row = [w.get("location_name") or "", w.get("owner_name") or "", w.get("city") or "",
               wh_type, "— WAREHOUSE TOTAL —", "", ""] + metric_cells(w["totals"])
        ws.append(row)
        for cell in ws[ws.max_row]:
            cell.font = bold
            cell.fill = wh_fill
        for s in w.get("skus", []):
            ws.append([w.get("location_name") or "", w.get("owner_name") or "", w.get("city") or "",
                       wh_type, s.get("sku_name") or "", "", s.get("units_per_crate") or 1]
                      + metric_cells(s["totals"]))
            for c in s.get("children", []):
                ws.append([w.get("location_name") or "", w.get("owner_name") or "", w.get("city") or "",
                           wh_type, s.get("sku_name") or "",
                           c.get("child_sku_name") or "Generic / Unbranded",
                           s.get("units_per_crate") or 1] + metric_cells(c))
                for cell in ws[ws.max_row]:
                    cell.fill = child_fill

    g = data["grand_totals"]
    ws.append(["GRAND TOTAL", "", "", "", "", "", ""] + metric_cells(g))
    for cell in ws[ws.max_row]:
        cell.font = Font(bold=True, size=12)
        cell.fill = PatternFill(start_color="C7D2FE", end_color="C7D2FE", fill_type="solid")

    widths = [24, 20, 14, 11, 26, 26, 13] + [13] * len(EXPORT_METRICS)
    for i, wd in enumerate(widths, start=1):
        ws.column_dimensions[ws.cell(row=1, column=i).column_letter].width = wd
    ws.freeze_panes = "A2"

    buf = io.BytesIO()
    wb.save(buf)
    buf.seek(0)
    fname = f"global-stock-{suffix}-{datetime.now(timezone.utc).strftime('%Y%m%d-%H%M')}.xlsx"
    return StreamingResponse(
        buf,
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        headers={"Content-Disposition": f'attachment; filename="{fname}"'},
    )
