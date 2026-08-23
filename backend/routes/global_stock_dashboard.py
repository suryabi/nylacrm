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
from utils.excel_branding import brand_workbook
from utils.sku_order import master_sku_order, sku_sort_key

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

    # 1. On hand — distributor warehouses. `distributor_stock.quantity` is in
    #    BASE UNITS (bottles): every writer (shipment delivery, stock-out
    #    deduction, reversals) increments it with item base-unit quantities.
    for r in dist_rows:
        bump(r.get("distributor_location_id"), r.get("sku_id"), r.get("child_sku_id"),
             "on_hand", units=r.get("quantity") or 0,
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
    sku_order = await master_sku_order({k[1] for k in agg.keys()})
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
        skus.sort(key=sku_sort_key(sku_order))
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
    from core.terminology import get_terms, term
    terms = await get_terms()
    suffix = "crates" if unit == "crates" else "units"
    suffix_label = term(terms, "package", plural=True, lower=True) if unit == "crates" else f"units ({term(terms, 'unit', plural=True, lower=True)})"

    wb = Workbook()
    ws = wb.active
    ws.title = f"Global Stock ({suffix_label})"[:31]

    headers = ["Warehouse", "Owner", "City", "Type", term(terms, "sku"), f"Child {term(terms, 'sku')} / Branding",
               f"Units per {term(terms, 'package')}"] + [label for _, label in EXPORT_METRICS]
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
    brand_workbook(wb)
    wb.save(buf)
    buf.seek(0)
    fname = f"global-stock-{suffix}-{datetime.now(timezone.utc).strftime('%Y%m%d-%H%M')}.xlsx"
    return StreamingResponse(
        buf,
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        headers={"Content-Disposition": f'attachment; filename="{fname}"'},
    )


# ═══════════════════ Child-split reconciliation / realign ═══════════════════
# WH stock rows carry a child (branding) classification. Transactions
# (shipments, deliveries, transfers, factory returns, branding conversions)
# also carry one. When a write hits a different child's row than the
# transaction line said (e.g. promo stock-outs always deducting Generic),
# the per-child split drifts even though the SKU total stays right.
# This tool rebuilds the expected split from the transaction history and
# realigns the stock rows to it WITHOUT ever changing the SKU total.

from pydantic import BaseModel
from fastapi import HTTPException

_REALIGN_ADMIN_ROLES = {"CEO", "Director", "Admin", "admin", "ceo", "director"}


class RealignRequest(BaseModel):
    apply: bool = False
    location_id: Optional[str] = None
    sku_id: Optional[str] = None
    distributor_id: Optional[str] = None  # realign is always scoped per distributor
    include_branding: bool = True  # count Branding-module conversions in the split


async def _apply_child_delta(tenant_id: str, loc: dict, sku_id: str, child_id, delta: int,
                             sku_name=None, child_name=None, now=None):
    """Moves `delta` bottles into (+) or out of (−) one child's stock rows at a
    warehouse. Negative deltas deduct largest-row-first; positive deltas credit
    the aggregate (batch-less) row. Never touches other children."""
    if not delta:
        return
    import uuid as _uuid
    now = now or datetime.now(timezone.utc).isoformat()
    is_factory = bool(loc.get("is_factory"))
    coll = db.factory_warehouse_stock if is_factory else db.distributor_stock
    loc_field = "warehouse_location_id" if is_factory else "distributor_location_id"
    base = {"tenant_id": tenant_id, loc_field: loc["id"], "sku_id": sku_id}
    if not is_factory:
        base["distributor_id"] = loc.get("distributor_id")
    child_q = {**base, "child_sku_id": child_id if child_id else {"$in": [None]}}
    remaining = -delta if delta < 0 else 0
    if delta < 0:
        rows = await coll.find(child_q, {"_id": 0}).to_list(500)
        for r in sorted(rows, key=lambda r: -(r.get("quantity") or 0)):
            if remaining <= 0:
                break
            take = min(remaining, int(r.get("quantity") or 0))
            if take <= 0:
                continue
            remaining -= take
            await coll.update_one({"id": r["id"], "tenant_id": tenant_id},
                                  {"$inc": {"quantity": -take}, "$set": {"updated_at": now}})
    credit = delta if delta > 0 else -remaining  # leftover deficit lands on aggregate row
    if credit:
        on_insert = {"id": str(_uuid.uuid4()), "tenant_id": tenant_id, loc_field: loc["id"],
                     "sku_id": sku_id, "child_sku_id": child_id, "batch_id": None, "created_at": now}
        if not is_factory:
            on_insert["distributor_id"] = loc.get("distributor_id")
        set_fields = {"updated_at": now}
        if sku_name:
            set_fields["sku_name"] = sku_name
        if child_name and child_id:
            set_fields["child_sku_name"] = child_name
        await coll.update_one(
            {**child_q, "batch_id": {"$in": [None]}},
            {"$inc": {"quantity": credit}, "$set": set_fields, "$setOnInsert": on_insert},
            upsert=True)


async def _collect_child_stock_data(tenant_id: str):
    """Shared collector: actual stock rows + expected transaction flows per
    (warehouse, sku, child). Used by realign and branding cleanup."""
    locs = {l["id"]: l for l in await db.distributor_locations.find(
        {"tenant_id": tenant_id},
        {"_id": 0, "id": 1, "location_name": 1, "distributor_id": 1, "is_factory": 1, "is_default": 1},
    ).to_list(3000)}
    default_loc_by_dist: dict = {}
    for l in locs.values():
        did = l.get("distributor_id")
        if not did:
            continue
        cur = default_loc_by_dist.get(did)
        if cur is None or (l.get("is_default") and not cur.get("is_default")):
            default_loc_by_dist[did] = l

    # ── actual stock rows per (loc, sku, child) ──────────────────────────
    actual: dict = {}
    rows_by_key: dict = {}
    names: dict = {}

    def note_names(sku_id, child_id, sku_name=None, child_name=None):
        m = names.setdefault((sku_id, child_id or None), {})
        if sku_name:
            m.setdefault("sku_name", sku_name)
        if child_name:
            m.setdefault("child_sku_name", child_name)

    for coll_name, loc_field in (("factory_warehouse_stock", "warehouse_location_id"),
                                 ("distributor_stock", "distributor_location_id")):
        async for r in getattr(db, coll_name).find({"tenant_id": tenant_id}, {"_id": 0}):
            loc_id = r.get(loc_field)
            key = (loc_id, r.get("sku_id"), r.get("child_sku_id") or None)
            if not loc_id or not r.get("sku_id"):
                continue
            actual[key] = actual.get(key, 0) + int(r.get("quantity") or 0)
            rows_by_key.setdefault(key, []).append({**r, "_coll": coll_name})
            note_names(r.get("sku_id"), r.get("child_sku_id"), r.get("sku_name"), r.get("child_sku_name"))

    # ── expected net flow per (loc, sku, child) ──────────────────────────
    flows: dict = {}

    def flow(loc_id, sku_id, child_id, units, sku_name=None, child_name=None, comp="other"):
        if not loc_id or not sku_id:
            return
        key = (loc_id, sku_id, child_id or None)
        m = flows.setdefault(key, {})
        m[comp] = m.get(comp, 0) + int(units or 0)
        note_names(sku_id, child_id, sku_name, child_name)

    # shipments in (distributor warehouses)
    ships = {s["id"]: s for s in await db.distributor_shipments.find(
        {"tenant_id": tenant_id, "status": "delivered"},
        {"_id": 0, "id": 1, "distributor_id": 1, "distributor_location_id": 1}).to_list(20000)}
    if ships:
        async for it in db.distributor_shipment_items.find(
                {"tenant_id": tenant_id, "shipment_id": {"$in": list(ships.keys())}}, {"_id": 0}):
            s = ships.get(it.get("shipment_id"))
            if not s:
                continue
            loc_id = s.get("distributor_location_id") or \
                (default_loc_by_dist.get(s.get("distributor_id")) or {}).get("id")
            flow(loc_id, it.get("sku_id"), it.get("child_sku_id"), _item_units(it),
                 it.get("sku_name"), it.get("child_sku_name"), comp="received")

    # deliveries out (incl. is_promo stock-outs — same collection)
    dels = {d["id"]: d for d in await db.distributor_deliveries.find(
        {"tenant_id": tenant_id, "status": {"$in": list(DELIVERED_STATUSES)}},
        {"_id": 0, "id": 1, "distributor_location_id": 1}).to_list(20000)}
    if dels:
        async for it in db.distributor_delivery_items.find(
                {"tenant_id": tenant_id, "delivery_id": {"$in": list(dels.keys())}}, {"_id": 0}):
            d = dels.get(it.get("delivery_id"))
            if not d:
                continue
            flow(d.get("distributor_location_id"), it.get("sku_id"), it.get("child_sku_id"),
                 -_item_units(it), it.get("sku_name"), it.get("child_sku_name"), comp="delivered")

    # legacy promo dispatches (deducted at confirm; not in distributor_deliveries)
    legacy_promos = {p["id"]: p for p in await db.promo_dispatches.find(
        {"tenant_id": tenant_id, "status": {"$in": ["dispatched", "delivered", "completed"]}},
        {"_id": 0, "id": 1, "distributor_location_id": 1}).to_list(5000)}
    if legacy_promos:
        for coll_name, link in (("distributor_delivery_items", "delivery_id"),
                                ("promo_dispatch_items", "dispatch_id")):
            async for it in getattr(db, coll_name).find(
                    {"tenant_id": tenant_id, link: {"$in": list(legacy_promos.keys())}}, {"_id": 0}):
                p = legacy_promos.get(it.get(link))
                if not p:
                    continue
                flow(p.get("distributor_location_id"), it.get("sku_id"), it.get("child_sku_id"),
                     -_item_units(it), it.get("sku_name"), it.get("child_sku_name"), comp="delivered")

    # transfers (source −, dest +); item quantity is packages
    async for t in db.distributor_stock_transfers.find(
            {"tenant_id": tenant_id, "status": "completed"}, {"_id": 0}):
        for it in (t.get("items") or []):
            try:
                upp = int(it.get("units_per_package") or 0)
            except Exception:
                upp = 0
            units = int(it.get("quantity") or 0) * (upp or 1)
            flow(t.get("source_location_id"), it.get("sku_id"), it.get("child_sku_id"),
                 -units, it.get("sku_name"), it.get("child_sku_name"), comp="transfer_out")
            flow(t.get("dest_location_id"), it.get("sku_id"), it.get("child_sku_id"),
                 units, it.get("sku_name"), it.get("child_sku_name"), comp="received")

    # factory returns out
    async for fr in db.distributor_factory_returns.find(
            {"tenant_id": tenant_id, "status": {"$nin": ["cancelled", "draft"]}}, {"_id": 0}):
        loc_id = fr.get("distributor_location_id") or \
            (default_loc_by_dist.get(fr.get("distributor_id")) or {}).get("id")
        for it in (fr.get("items") or []):
            flow(loc_id, it.get("sku_id"), it.get("child_sku_id"),
                 -(int(it.get("quantity") or 0)), it.get("sku_name"), it.get("child_sku_name"),
                 comp="factory_returns")

    # branding conversions (from −, to +)
    async for be in db.branding_entries.find({"tenant_id": tenant_id}, {"_id": 0}):
        qty = int(be.get("quantity") or 0)
        flow(be.get("warehouse_location_id"), be.get("sku_id"), be.get("from_child_sku_id"),
             -qty, be.get("sku_name"), be.get("from_child_sku_name"), comp="branding")
        flow(be.get("warehouse_location_id"), be.get("sku_id"), be.get("to_child_sku_id"),
             qty, be.get("sku_name"), be.get("to_child_sku_name"), comp="branding")

    # ── open stock-outs (scheduled/confirmed — stock NOT yet deducted) ───
    # These don't change the physical split, but each child's realign target
    # must keep at least this much so pending orders can still complete.
    OPEN_STATUSES = ["draft", "confirmed", "scheduled", "in_transit",
                     "delivery_assigned", "delivery_scheduled", "on_the_way"]
    reserved: dict = {}
    open_dels = {d["id"]: d for d in await db.distributor_deliveries.find(
        {"tenant_id": tenant_id, "status": {"$in": OPEN_STATUSES}},
        {"_id": 0, "id": 1, "distributor_location_id": 1}).to_list(20000)}
    if open_dels:
        async for it in db.distributor_delivery_items.find(
                {"tenant_id": tenant_id, "delivery_id": {"$in": list(open_dels.keys())}}, {"_id": 0}):
            d = open_dels.get(it.get("delivery_id"))
            if not d or not d.get("distributor_location_id"):
                continue
            rkey = (d["distributor_location_id"], it.get("sku_id"), it.get("child_sku_id") or None)
            reserved[rkey] = reserved.get(rkey, 0) + _item_units(it)

    return {"locs": locs, "actual": actual, "flows": flows, "names": names, "reserved": reserved}


@router.post("/distributor/stock-child-realign")
async def stock_child_realign(payload: RealignRequest, current_user: dict = Depends(get_current_user)):
    if (current_user.get("role") or "").strip() not in _REALIGN_ADMIN_ROLES:
        raise HTTPException(status_code=403, detail="Only CEO / Director / Admin can realign stock.")
    tenant_id = get_current_tenant_id()
    now = datetime.now(timezone.utc).isoformat()
    data = await _collect_child_stock_data(tenant_id)
    locs, actual, flows = data["locs"], data["actual"], data["flows"]
    names, reserved = data["names"], data["reserved"]

    # ── per (loc, sku): targets that preserve the SKU total exactly ──────
    by_loc_sku: dict = {}
    for key in set(list(actual.keys()) + list(flows.keys())):
        loc_id, sku_id, child_id = key
        if payload.location_id and loc_id != payload.location_id:
            continue
        if payload.sku_id and sku_id != payload.sku_id:
            continue
        if payload.distributor_id and (locs.get(loc_id) or {}).get("distributor_id") != payload.distributor_id:
            continue
        by_loc_sku.setdefault((loc_id, sku_id), set()).add(child_id)

    findings, applied = [], 0
    for (loc_id, sku_id), children in sorted(by_loc_sku.items(), key=lambda x: str(x[0])):
        if len(children) < 2:
            continue  # nothing to redistribute
        actual_total = sum(actual.get((loc_id, sku_id, c), 0) for c in children)

        def net(c):
            m = flows.get((loc_id, sku_id, c), {})
            return sum(v for k, v in m.items() if payload.include_branding or k != "branding")
        expected = {c: net(c) for c in children}
        residual = actual_total - sum(expected.values())
        expected[None] = expected.get(None, 0) + residual  # production / unexplained → Generic
        children = set(children) | {None}
        # clamp negatives → shortfall comes out of Generic, then largest child
        for c in [c for c in children if c is not None]:
            if expected[c] < 0:
                expected[None] = expected.get(None, 0) + expected[c]
                expected[c] = 0
        if expected.get(None, 0) < 0:
            deficit = -expected[None]
            expected[None] = 0
            for c in sorted([c for c in children if c is not None],
                            key=lambda c: -expected[c]):
                take = min(deficit, expected[c])
                expected[c] -= take
                deficit -= take
                if deficit <= 0:
                    break
        # ── keep each child's target ≥ its open stock-out commitments ────
        # (scheduled/confirmed orders haven't deducted stock yet; when they
        # complete they deduct from THAT child's rows — don't realign it away)
        res = {c: reserved.get((loc_id, sku_id, c), 0) for c in children}
        for c in children:
            need = res[c] - expected[c]
            if need <= 0:
                continue
            donors = sorted([d for d in children if d != c],
                            key=lambda d: (d is not None, -(expected[d] - res[d])))
            for dn in donors:
                surplus = expected[dn] - res[dn]
                if surplus <= 0:
                    continue
                take = min(need, surplus)
                expected[dn] -= take
                expected[c] += take
                need -= take
                if need <= 0:
                    break
        deltas = {c: expected[c] - actual.get((loc_id, sku_id, c), 0) for c in children}
        if all(d == 0 for d in deltas.values()):
            continue
        loc = locs.get(loc_id, {})
        sku_name = next((names.get((sku_id, c), {}).get("sku_name") for c in children
                         if names.get((sku_id, c), {}).get("sku_name")), sku_id)
        finding = {
            "location_id": loc_id, "location_name": loc.get("location_name") or "Unknown",
            "is_factory": bool(loc.get("is_factory")),
            "sku_id": sku_id, "sku_name": sku_name,
            "total": actual_total,
            "children": [{
                "child_sku_id": c,
                "child_sku_name": (names.get((sku_id, c), {}).get("child_sku_name")
                                   or ("Generic / Unbranded" if c is None else c)),
                "actual": actual.get((loc_id, sku_id, c), 0),
                "target": expected[c],
                "delta": deltas[c],
                "reserved": res.get(c, 0),
                "flows": {k: flows.get((loc_id, sku_id, c), {}).get(k, 0)
                          for k in ("received", "delivered", "transfer_out", "factory_returns", "branding")},
            } for c in sorted(children, key=lambda c: (c is not None, str(c)))],
        }
        findings.append(finding)

        if payload.apply:
            changes = []
            loc_doc = {"id": loc_id, **loc}
            for c, delta in deltas.items():
                if delta == 0:
                    continue
                child_name = names.get((sku_id, c), {}).get("child_sku_name")
                await _apply_child_delta(tenant_id, loc_doc, sku_id, c, delta,
                                         sku_name=sku_name, child_name=child_name, now=now)
                changes.append({"child_sku_id": c, "child_sku_name": child_name or ("Generic / Unbranded" if c is None else c),
                                "delta": delta})
            import uuid as _uuid
            await db.stock_realign_log.insert_one({
                "id": str(_uuid.uuid4()), "tenant_id": tenant_id,
                "location_id": loc_id, "location_name": loc.get("location_name"),
                "distributor_id": loc.get("distributor_id"),
                "sku_id": sku_id, "sku_name": sku_name, "total": actual_total,
                "changes": changes, "applied_at": now,
                "applied_by": current_user.get("id"),
                "applied_by_name": current_user.get("name") or current_user.get("email"),
            })
            applied += 1

    return {"dry_run": not payload.apply, "skus_with_drift": len(findings),
            "realigned": applied, "findings": findings}


class RealignHistoryRequest(BaseModel):
    distributor_id: Optional[str] = None


class RealignUndoRequest(BaseModel):
    log_ids: Optional[list] = None      # undo only these applied realignments
    distributor_id: Optional[str] = None


@router.post("/distributor/stock-child-realign/history")
async def stock_child_realign_history(payload: RealignHistoryRequest,
                                      current_user: dict = Depends(get_current_user)):
    if (current_user.get("role") or "").strip() not in _REALIGN_ADMIN_ROLES:
        raise HTTPException(status_code=403, detail="Only CEO / Director / Admin can view realignments.")
    tenant_id = get_current_tenant_id()
    q = {"tenant_id": tenant_id}
    if payload.distributor_id:
        q["distributor_id"] = payload.distributor_id
    logs = await db.stock_realign_log.find(q, {"_id": 0}).sort("applied_at", -1).to_list(500)
    return {"logs": logs}


@router.post("/distributor/stock-child-realign/undo")
async def stock_child_realign_undo(payload: RealignUndoRequest,
                                   current_user: dict = Depends(get_current_user)):
    """Reverses applied realignments by applying the inverse per-child deltas.
    The SKU total is preserved both ways, so undo restores the exact prior split."""
    if (current_user.get("role") or "").strip() not in _REALIGN_ADMIN_ROLES:
        raise HTTPException(status_code=403, detail="Only CEO / Director / Admin can undo realignments.")
    tenant_id = get_current_tenant_id()
    now = datetime.now(timezone.utc).isoformat()
    q = {"tenant_id": tenant_id, "reverted_at": {"$exists": False}}
    if payload.distributor_id:
        q["distributor_id"] = payload.distributor_id
    if payload.log_ids is not None:
        q["id"] = {"$in": payload.log_ids}
    logs = await db.stock_realign_log.find(q, {"_id": 0}).sort("applied_at", -1).to_list(500)
    locs = {l["id"]: l for l in await db.distributor_locations.find(
        {"tenant_id": tenant_id},
        {"_id": 0, "id": 1, "location_name": 1, "distributor_id": 1, "is_factory": 1},
    ).to_list(3000)}
    reverted = 0
    for log in logs:
        loc = locs.get(log.get("location_id"))
        if not loc:
            continue
        for ch in (log.get("changes") or []):
            await _apply_child_delta(tenant_id, loc, log["sku_id"], ch.get("child_sku_id"),
                                     -(int(ch.get("delta") or 0)),
                                     sku_name=log.get("sku_name"),
                                     child_name=ch.get("child_sku_name"), now=now)
        await db.stock_realign_log.update_one(
            {"id": log["id"], "tenant_id": tenant_id},
            {"$set": {"reverted_at": now, "reverted_by": current_user.get("id"),
                      "reverted_by_name": current_user.get("name") or current_user.get("email")}})
        reverted += 1
    return {"reverted": reverted}


# ═══════════════════ Branding entry cleanup (duplicates) ════════════════════
# When stock arrives ALREADY branded (shipment items carry the child SKU) but a
# Branding-module conversion was ALSO recorded for the same movement, the entry
# double-counts: it physically moved Generic rows that belonged to other stock.
# An entry group is "suspect" when excluding branding conversions makes the
# per-child split match the stock rows BETTER than including them.

class BrandingCleanupListRequest(BaseModel):
    distributor_id: Optional[str] = None


class BrandingCleanupActionRequest(BaseModel):
    entry_ids: list
    distributor_id: Optional[str] = None


def _branding_drift_scores(data, loc_id, sku_id):
    actual, flows = data["actual"], data["flows"]
    children = set()
    for (l, s, c) in set(list(actual.keys()) + list(flows.keys())):
        if l == loc_id and s == sku_id:
            children.add(c)
    def score(include_branding):
        tot = 0
        for c in children:
            m = flows.get((loc_id, sku_id, c), {})
            exp = sum(v for k, v in m.items() if include_branding or k != "branding")
            tot += abs(exp - actual.get((loc_id, sku_id, c), 0))
        return tot
    return score(True), score(False)


@router.post("/distributor/branding-entries/cleanup")
async def branding_cleanup_list(payload: BrandingCleanupListRequest,
                                current_user: dict = Depends(get_current_user)):
    if (current_user.get("role") or "").strip() not in _REALIGN_ADMIN_ROLES:
        raise HTTPException(status_code=403, detail="Only CEO / Director / Admin can manage branding cleanup.")
    tenant_id = get_current_tenant_id()
    data = await _collect_child_stock_data(tenant_id)
    locs = data["locs"]
    loc_ids = None
    if payload.distributor_id:
        loc_ids = [lid for lid, l in locs.items() if l.get("distributor_id") == payload.distributor_id]
    q = {"tenant_id": tenant_id}
    if loc_ids is not None:
        q["warehouse_location_id"] = {"$in": loc_ids}
    entries, scores_cache = [], {}
    async for be in db.branding_entries.find(q, {"_id": 0}).sort("created_at", -1):
        gkey = (be.get("warehouse_location_id"), be.get("sku_id"))
        if gkey not in scores_cache:
            scores_cache[gkey] = _branding_drift_scores(data, *gkey)
        with_b, without_b = scores_cache[gkey]
        entries.append({
            "id": be.get("id"), "created_at": be.get("created_at"),
            "location_name": (locs.get(be.get("warehouse_location_id")) or {}).get("location_name"),
            "sku_name": be.get("sku_name"),
            "from_name": be.get("from_child_sku_name") or "Generic / Unbranded",
            "to_name": be.get("to_child_sku_name") or "Generic / Unbranded",
            "quantity": be.get("quantity"),
            "created_by_name": be.get("created_by_name"),
            "suspect": with_b > without_b,
            "drift_with_branding": with_b, "drift_without_branding": without_b,
        })
    removed = await db.branding_entries_removed.find(
        {"tenant_id": tenant_id, **({"warehouse_location_id": {"$in": loc_ids}} if loc_ids is not None else {})},
        {"_id": 0}).sort("removed_at", -1).to_list(200)
    removed_view = [{
        "id": r.get("id"), "created_at": r.get("created_at"),
        "location_name": (locs.get(r.get("warehouse_location_id")) or {}).get("location_name"),
        "sku_name": r.get("sku_name"),
        "from_name": r.get("from_child_sku_name") or "Generic / Unbranded",
        "to_name": r.get("to_child_sku_name") or "Generic / Unbranded",
        "quantity": r.get("quantity"), "removed_at": r.get("removed_at"),
        "removed_by_name": r.get("removed_by_name"),
    } for r in removed]
    return {"entries": entries, "removed": removed_view,
            "suspect_count": sum(1 for e in entries if e["suspect"])}


@router.post("/distributor/branding-entries/cleanup/remove")
async def branding_cleanup_remove(payload: BrandingCleanupActionRequest,
                                  current_user: dict = Depends(get_current_user)):
    """Archives + deletes branding entry RECORDS only — stock rows are not
    touched (run Reconcile afterwards to realign the rows). Fully restorable."""
    if (current_user.get("role") or "").strip() not in _REALIGN_ADMIN_ROLES:
        raise HTTPException(status_code=403, detail="Only CEO / Director / Admin can manage branding cleanup.")
    tenant_id = get_current_tenant_id()
    now = datetime.now(timezone.utc).isoformat()
    removed = 0
    for eid in payload.entry_ids:
        be = await db.branding_entries.find_one({"id": eid, "tenant_id": tenant_id}, {"_id": 0})
        if not be:
            continue
        await db.branding_entries_removed.insert_one({
            **be, "removed_at": now, "removed_by": current_user.get("id"),
            "removed_by_name": current_user.get("name") or current_user.get("email")})
        await db.branding_entries.delete_one({"id": eid, "tenant_id": tenant_id})
        removed += 1
    return {"removed": removed}


@router.post("/distributor/branding-entries/cleanup/restore")
async def branding_cleanup_restore(payload: BrandingCleanupActionRequest,
                                   current_user: dict = Depends(get_current_user)):
    if (current_user.get("role") or "").strip() not in _REALIGN_ADMIN_ROLES:
        raise HTTPException(status_code=403, detail="Only CEO / Director / Admin can manage branding cleanup.")
    tenant_id = get_current_tenant_id()
    restored = 0
    for eid in payload.entry_ids:
        r = await db.branding_entries_removed.find_one({"id": eid, "tenant_id": tenant_id}, {"_id": 0})
        if not r:
            continue
        for k in ("removed_at", "removed_by", "removed_by_name"):
            r.pop(k, None)
        await db.branding_entries.insert_one(r)
        await db.branding_entries_removed.delete_one({"id": eid, "tenant_id": tenant_id})
        restored += 1
    return {"restored": restored}
