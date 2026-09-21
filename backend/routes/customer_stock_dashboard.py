"""Customer Stock Dashboard — one tile per active customer (account):
last Stock-Out delivery (quantity + date) and stock-in-hand of the customer's
own branded child SKUs across every warehouse.

GET /api/distributor/customer-stock-dashboard?distributor_id=&account_id=
"""
import io
from collections import defaultdict
from datetime import datetime, timezone, timedelta, date
from statistics import median
from collections import Counter
from typing import Optional

from fastapi import APIRouter, Depends, Query
from fastapi.responses import StreamingResponse
from openpyxl import Workbook
from openpyxl.styles import Font, PatternFill, Alignment
from utils.excel_branding import brand_workbook

from database import db
from core.tenant import get_current_tenant_id
from deps import get_current_user

router = APIRouter()

ORDER_STATUSES = ["delivered", "complete", "completed"]


@router.get("/distributor/customer-stock-dashboard")
async def customer_stock_dashboard(
    distributor_id: Optional[str] = Query(None),
    account_id: Optional[str] = Query(None),
    current_user: dict = Depends(get_current_user),
):
    return await _build(get_current_tenant_id(), distributor_id, account_id)


def _fmt_date(iso):
    if not iso:
        return ""
    try:
        return datetime.fromisoformat(iso[:10]).strftime("%d %b %Y")
    except ValueError:
        return iso


@router.get("/distributor/customer-stock-dashboard/export")
async def export_customer_stock_dashboard(
    distributor_id: Optional[str] = Query(None),
    account_id: Optional[str] = Query(None),
    current_user: dict = Depends(get_current_user),
):
    data = await _build(get_current_tenant_id(), distributor_id, account_id)
    dist_name = next((d["name"] for d in data["filters"]["distributors"] if d["id"] == distributor_id), None) if distributor_id else None
    acct_name = next((t["account_name"] for t in data["tiles"] if t["account_id"] == account_id), None) if account_id else None

    wb = Workbook()
    ws = wb.active
    ws.title = "Customer Stock"
    ws.append(["Customer Stock Dashboard"] + [""] * 11)
    ws["A1"].font = Font(bold=True, size=14)
    ws.append([f"Distributor: {dist_name or 'All'}", f"Account: {acct_name or 'All'}",
               f"Generated: {datetime.now(timezone.utc).strftime('%d %b %Y %H:%M UTC')}"])
    ws.append([])
    headers = ["Customer", "City", "Category", "Last Order (crates)", "Last Order Date", "Order Frequency (days)", "Expected Next Order",
               "Expected Crates", "SKU (branded child / generic parent)", "Stock in Hand (crates)", "Stock in Hand (units)", "Low Stock", "Warehouses"]
    ws.append(headers)
    hdr_row = ws.max_row
    for cell in ws[hdr_row]:
        cell.font = Font(bold=True, color="FFFFFF")
        cell.fill = PatternFill(start_color="0F172A", end_color="0F172A", fill_type="solid")
        cell.alignment = Alignment(horizontal="center", vertical="center", wrap_text=True)

    cust_fill = PatternFill(start_color="ECFEFF", end_color="ECFEFF", fill_type="solid")
    for t in data["tiles"]:
        base = [t["account_name"], t.get("city") or "", t.get("category") or "",
                t["last_order_crates"] if t["last_order_crates"] is not None else "—",
                _fmt_date(t["last_order_date"]) or "—", t.get("order_frequency_days") if t.get("order_frequency_days") is not None else "—",
                _fmt_date(t.get("expected_next_order_date")) or "—",
                t["expected_crates"] if t["expected_crates"] is not None else "—"]
        skus = t["child_skus"] or [{"child_sku_name": "No SKU", "stock_in_hand": "—", "stock_crates": "—", "warehouses": []}]
        for i, s in enumerate(skus):
            row = (base if i == 0 else [""] * 8) + [
                f"{s['child_sku_name']} (generic)" if s.get("generic") else s["child_sku_name"], s["stock_crates"], s["stock_in_hand"], ("YES" if t["low_stock"] else "") if i == 0 else "",
                " · ".join(f"{w['location_name']} {w['quantity']}" for w in s.get("warehouses") or [])]
            ws.append(row)
            if i == 0:
                ws.cell(row=ws.max_row, column=1).font = Font(bold=True)
                for cell in ws[ws.max_row]:
                    cell.fill = cust_fill
                color = {"red": "BE123C", "green": "047857"}.get(t.get("next_order_urgency"))
                if color:
                    ws.cell(row=ws.max_row, column=6).font = Font(bold=True, color=color)
                    ws.cell(row=ws.max_row, column=7).font = Font(bold=True, color=color)
                if t["low_stock"]:
                    ws.cell(row=ws.max_row, column=11).font = Font(bold=True, color="BE123C")
        if len(skus) > 1:
            ws.append([""] * 8 + ["Total", t["stock_crates"], t["stock_in_hand"], "", ""])
            for col in (8, 9, 10):
                ws.cell(row=ws.max_row, column=col).font = Font(bold=True)

    sm = data["summary"]
    ws.append([])
    ws.append([f"{sm['customers']} customers · {sm['with_orders']} with orders · {sm['low_stock']} low stock"] + [""] * 6 + ["TOTAL STOCK IN HAND", sm["stock_crates"], sm["stock_in_hand"], "", ""])
    for cell in ws[ws.max_row]:
        cell.font = Font(bold=True, size=12)
        cell.fill = PatternFill(start_color="C7D2FE", end_color="C7D2FE", fill_type="solid")

    for i, wd in enumerate([32, 16, 16, 18, 16, 14, 20, 16, 34, 18, 18, 10, 40], start=1):
        ws.column_dimensions[ws.cell(row=hdr_row, column=i).column_letter].width = wd
    ws.freeze_panes = ws.cell(row=hdr_row + 1, column=1)

    if data["groups"]:
        gs = wb.create_sheet("Brand Groups")
        gs.append(["Brand Groups — branded stock (shared + members' own child SKUs, generic excluded) & members' orders"])
        gs["A1"].font = Font(bold=True, size=14)
        gs.append([])
        gh = ["Brand Group", "Members", "Child SKU (shared / own)", "Stock in Hand (crates)", "Stock in Hand (units)",
              "Members' Last Orders (crates)", "Latest Order Date", f"Last {SAMPLE_ORDERS} Orders / Member (crates)", "Orders Sampled",
              "Expected Next Order", "Expected Crates (all)", "Low Stock"]
        gs.append(gh)
        g_hdr = gs.max_row
        for cell in gs[g_hdr]:
            cell.font = Font(bold=True, color="FFFFFF")
            cell.fill = PatternFill(start_color="4C1D95", end_color="4C1D95", fill_type="solid")
            cell.alignment = Alignment(horizontal="center", vertical="center", wrap_text=True)
        grp_fill = PatternFill(start_color="F5F3FF", end_color="F5F3FF", fill_type="solid")
        for g in data["groups"]:
            base = [g["name"], f"{len(g['members'])} of {g['total_members']}"]
            skus = g["shared_skus"] or [{"child_sku_name": "No branded SKU", "stock_crates": "—", "stock_in_hand": "—"}]
            for i, s in enumerate(skus):
                tail = [g["last_orders_crates"] if g["last_orders_crates"] is not None else "—", _fmt_date(g["last_order_date"]) or "—",
                        g["history_crates"], g["history_orders"], _fmt_date(g.get("expected_next_order_date")) or "—",
                        g["expected_crates"] if g["expected_crates"] is not None else "—", "YES" if g["low_stock"] else ""] if i == 0 else [""] * 7
                label = f"{s['child_sku_name']} (shared)" if s.get("shared") else f"{s['child_sku_name']} (own · {s.get('owner_name') or 'member'})" if s.get("child_sku_id") else s["child_sku_name"]
                gs.append((base if i == 0 else ["", ""]) + [label, s["stock_crates"], s["stock_in_hand"]] + tail)
                if i == 0:
                    for cell in gs[gs.max_row]:
                        cell.fill = grp_fill
                    gs.cell(row=gs.max_row, column=1).font = Font(bold=True)
                    if g["low_stock"]:
                        for col in (10, 11, 12):
                            gs.cell(row=gs.max_row, column=col).font = Font(bold=True, color="BE123C")
            if len(skus) > 1:
                gs.append(["", "", "Total in hand", g["stock_crates"], g["stock_in_hand"]])
                for col in (3, 4, 5):
                    gs.cell(row=gs.max_row, column=col).font = Font(bold=True)
            for m in g["members"]:
                gs.append(["", f"↳ {m['account_name']}", f"{m['own_skus']} own SKU(s)" if m["own_skus"] else "", "", "",
                           m["last_order_crates"] if m["last_order_crates"] is not None else "—", _fmt_date(m["last_order_date"]) or "—", "", "",
                           _fmt_date(m.get("expected_next_order_date")) or "—", m["expected_crates"] if m["expected_crates"] is not None else "—",
                           "YES" if m["low_stock"] else ""])
                for cell in gs[gs.max_row]:
                    cell.font = Font(color="475569", size=10)
            gs.append([])
        for i, wd in enumerate([30, 26, 34, 18, 18, 22, 16, 22, 12, 18, 16, 10], start=1):
            gs.column_dimensions[gs.cell(row=g_hdr, column=i).column_letter].width = wd
        gs.freeze_panes = gs.cell(row=g_hdr + 1, column=1)

    buf = io.BytesIO()
    brand_workbook(wb)
    wb.save(buf)
    buf.seek(0)
    fname = f"customer-stock-{datetime.now(timezone.utc).strftime('%Y%m%d-%H%M')}.xlsx"
    return StreamingResponse(buf, media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
                             headers={"Content-Disposition": f'attachment; filename="{fname}"'})


SAMPLE_ORDERS = 6


def _parse_day(iso):
    try:
        return datetime.fromisoformat((iso or "")[:10]).date()
    except ValueError:
        return None


def _add_months(d, months: int):
    m0 = d.month - 1 + months
    y, m = d.year + m0 // 12, m0 % 12 + 1
    last = (date(y + (m // 12), m % 12 + 1, 1) - timedelta(days=1)).day
    return date(y, m, min(d.day, last))


def _forecast(orders: list, today) -> dict:
    """orders: [{"day": date, "crates": float}] oldest→newest, at most SAMPLE_ORDERS.
    Expected crates = the quantity ordered most often (ties → larger); if every order
    differs, the median. Expected date = next occurrence of the customer's usual
    day-of-month (monthly buyers) or last order + median gap (frequent buyers)."""
    if not orders:
        return {"expected_next_order_date": None, "next_order_in_days": None, "expected_crates": None,
                "monthly_volume_crates": None, "usual_order_day": None, "forecast_basis": None, "sample_orders": 0}
    days = [o["day"] for o in orders]
    crates = [round(o["crates"], 1) for o in orders]
    counts = Counter(crates)
    top = max(counts.values())
    if top >= 2:
        expected_crates = max(q for q, c in counts.items() if c == top)
        qty_basis = f"ordered {top} of {len(crates)} times"
    else:
        expected_crates = float(median(crates))
        qty_basis = "single order" if len(crates) == 1 else f"median of {len(crates)} orders"
    span_months = max(1.0, ((days[-1] - days[0]).days / 30.4) if len(days) > 1 else 1.0)
    monthly_volume = round(sum(crates) / span_months, 1)
    usual_day = int(median(d.day for d in days))
    gaps = [(b - a).days for a, b in zip(days, days[1:]) if (b - a).days > 0]
    med_gap = int(median(gaps)) if gaps else None
    if med_gap is not None and med_gap <= 20:
        expected = days[-1] + timedelta(days=med_gap)
        date_basis = f"orders every ~{med_gap} days"
    else:
        nxt = _add_months(days[-1], 1)
        last_dom = (_add_months(nxt.replace(day=1), 1) - timedelta(days=1)).day
        expected = nxt.replace(day=min(usual_day, last_dom))
        date_basis = f"usually orders around the {usual_day}{'th' if 11 <= usual_day <= 13 else {1: 'st', 2: 'nd', 3: 'rd'}.get(usual_day % 10, 'th')}"
    ec = int(expected_crates) if float(expected_crates).is_integer() else expected_crates
    return {"expected_next_order_date": expected.isoformat(), "next_order_in_days": (expected - today).days,
            "expected_crates": ec, "monthly_volume_crates": monthly_volume, "usual_order_day": usual_day,
            "forecast_basis": f"{qty_basis} · {date_basis} · ~{monthly_volume} crates/month", "sample_orders": len(orders)}


def _order_frequency(all_days: list) -> dict:
    """Typical days between orders from the customer's whole delivery history.
    Same-day deliveries count as one order; the median gap is used (robust to one-off
    rush orders). If the last 3 gaps clearly differ from the long-run median (>40%),
    the recent cadence wins so a customer who sped up / slowed down is reflected."""
    days = sorted(set(all_days))
    gaps = [(b - a).days for a, b in zip(days, days[1:]) if (b - a).days > 0]
    if not gaps:
        return {"order_frequency_days": None, "frequency_basis": None, "total_orders": len(days)}
    overall = median(gaps)
    recent = median(gaps[-3:]) if len(gaps) >= 4 else overall
    freq = recent if abs(recent - overall) / overall > 0.4 else overall
    basis = f"every ~{int(round(freq))} days · {len(days)} orders" + (" · recent pace" if freq != overall else "")
    return {"order_frequency_days": int(round(freq)), "frequency_basis": basis, "total_orders": len(days)}


def _group_tiles(group_docs: list, tiles: list, child_rows: dict, sample: dict) -> list:
    """One roll-up per Brand Group with members in view: branded stock every member
    can draw from (shared child SKUs + members' own child SKUs, each counted once —
    generic parent stock excluded) + members' orders combined."""
    tile_by_acct = {t["account_id"]: t for t in tiles}
    out = []
    for g in group_docs:
        members = [tile_by_acct[a] for a in g.get("account_ids") or [] if a in tile_by_acct]
        if not members:
            continue
        shared = [r for r in child_rows.values() if r.get("brand_group_id") == g["id"]]
        own = {s["child_sku_id"]: s for m in members for s in m["child_skus"] if not s["shared"] and not s.get("generic")}
        skus = sorted(shared, key=lambda s: (s["child_sku_name"] or "").lower()) + sorted(own.values(), key=lambda s: ((s.get("owner_name") or "").lower(), (s["child_sku_name"] or "").lower()))
        last_crates = [m["last_order_crates"] for m in members if m["last_order_crates"] is not None]
        last_dates = [m["last_order_date"] for m in members if m["last_order_date"]]
        hist = [d for m in members for d in sample.get(m["account_id"], [])]
        expected = [m["expected_crates"] for m in members if m["expected_crates"] is not None]
        exp_dates = [m["expected_next_order_date"] for m in members if m["expected_next_order_date"]]
        stock_crates = round(sum(s["stock_crates"] for s in skus), 2)
        exp_total = round(sum(expected), 1) if expected else None
        if exp_total is not None and float(exp_total).is_integer():
            exp_total = int(exp_total)
        low = bool(skus) and exp_total is not None and stock_crates < exp_total
        out.append({
            "group_id": g["id"], "name": g.get("name"), "code": g.get("code"),
            "total_members": len(g.get("account_ids") or []),
            "members": sorted([{
                "account_id": m["account_id"], "account_name": m["account_name"], "city": m.get("city"),
                "last_order_crates": m["last_order_crates"], "last_order_date": m["last_order_date"],
                "expected_crates": m["expected_crates"], "expected_next_order_date": m["expected_next_order_date"],
                "order_frequency_days": m["order_frequency_days"], "frequency_basis": m["frequency_basis"], "total_orders": m["total_orders"],
                "low_stock": m["low_stock"], "own_skus": sum(1 for s in m["child_skus"] if not s["shared"] and not s.get("generic")),
            } for m in members], key=lambda m: (m["account_name"] or "").lower()),
            "shared_skus": skus,
            "shared_count": len(shared), "own_count": len(own),
            "stock_in_hand": sum(s["stock_in_hand"] for s in skus), "stock_crates": stock_crates,
            "reserved_crates": round(sum(s.get("reserved_crates") or 0 for s in skus), 2),
            "last_orders_crates": round(sum(last_crates), 1) if last_crates else None,
            "last_order_date": max(last_dates) if last_dates else None,
            "members_ordering": len(last_dates),
            "history_crates": round(sum(d["crates"] for d in hist), 1), "history_orders": len(hist),
            "expected_crates": exp_total,
            "expected_next_order_date": min(exp_dates) if exp_dates else None,
            "low_stock": low, "priority": low,
            "next_order_urgency": (None if not exp_dates else "red" if low else "green" if skus else "neutral"),
        })
    out.sort(key=lambda g: (not g["priority"], (g["name"] or "").lower()))
    return out


async def _generic_parent_rows(tenant_id: str, sku_ids: set, upc: dict) -> dict:
    """Generic (no child SKU) stock per parent SKU, shaped like child rows.
    Keyed (sku_id, distributor_id) for distributor-scoped stock and (sku_id, None) for all warehouses."""
    if not sku_ids:
        return {}
    ids = list(sku_ids)
    names = {m["id"]: m.get("sku_name") or m.get("name") async for m in db.master_skus.find({"id": {"$in": ids}}, {"_id": 0, "id": 1, "sku_name": 1, "name": 1})}
    no_child = {"$in": [None, ""]}
    breakdown, loc_names = defaultdict(int), {}
    for coll, loc_field in ((db.distributor_stock, "distributor_location_id"), (db.factory_warehouse_stock, "warehouse_location_id")):
        async for r in coll.find({"tenant_id": tenant_id, "sku_id": {"$in": ids}, "child_sku_id": no_child, "quantity": {"$gt": 0}},
                                 {"_id": 0, "sku_id": 1, "quantity": 1, loc_field: 1, "distributor_id": 1, "location_name": 1, "warehouse_name": 1, "sku_name": 1}):
            q = int(r.get("quantity") or 0)
            lid = r.get(loc_field)
            loc_names.setdefault(lid, r.get("location_name") or r.get("warehouse_name"))
            breakdown[(r["sku_id"], r.get("distributor_id"), lid)] += q
            names.setdefault(r["sku_id"], r.get("sku_name"))
    unnamed = [l for l, n in loc_names.items() if not n and l]
    if unnamed:
        async for l in db.distributor_locations.find({"id": {"$in": unnamed}}, {"_id": 0, "id": 1, "location_name": 1}):
            loc_names[l["id"]] = l.get("location_name")
    scopes = {(s, d) for (s, d, _) in breakdown} | {(s, None) for s in ids}
    rows = {}
    for sid, did in scopes:
        cu = upc.get(sid, 1)
        whs = [{"location_id": lid, "location_name": loc_names.get(lid) or "Warehouse", "quantity": q}
               for (s, d, lid), q in breakdown.items() if s == sid and (did is None or d == did)]
        total = sum(w["quantity"] for w in whs)
        rows[(sid, did)] = {
            "child_sku_id": f"parent:{sid}:{did or 'all'}", "sku_id": sid, "child_sku_name": names.get(sid) or "Parent SKU", "child_sku_code": None,
            "parent_sku_name": names.get(sid), "stock_in_hand": total, "shared": False, "generic": True, "scope": "distributor" if did else "all",
            "brand_group_id": None, "brand_group_name": None, "units_per_crate": cu,
            "stock_crates": round(total / cu, 2), "warehouses": sorted(whs, key=lambda w: -w["quantity"]),
        }
    return rows


async def _units_per_crate(tenant_id: str, sku_ids: list) -> dict:
    """Bottles per crate, resolved exactly like the Global Stock Dashboard:
    factory stock row bottles_per_crate first, then master SKU (default production pack)."""
    ids = [s for s in sku_ids if s]
    upc = {}

    def learn(sid, b):
        try:
            b = int(b or 0)
        except (TypeError, ValueError):
            return
        if sid and b > 0 and sid not in upc:
            upc[sid] = b
    async for r in db.factory_warehouse_stock.find({"tenant_id": tenant_id, "sku_id": {"$in": ids}}, {"_id": 0, "sku_id": 1, "bottles_per_crate": 1}):
        learn(r.get("sku_id"), r.get("bottles_per_crate"))
    async for ms in db.master_skus.find({"id": {"$in": ids}}, {"_id": 0, "id": 1, "bottles_per_crate": 1, "packaging_config": 1}):
        b = ms.get("bottles_per_crate")
        if not b:
            pc = (ms.get("packaging_config") or {}).get("production") or []
            default = next((p for p in pc if p.get("is_default")), None)
            if default:
                b = default.get("units") or default.get("units_per_package")
        learn(ms["id"], b)
    return {s: upc.get(s, 1) for s in ids}


async def _reserved_by_child(tenant_id: str, child_ids: list) -> dict:
    """Bottles committed to OPEN Stock-Outs per child SKU (same rule as Global Stock Dashboard)."""
    if not child_ids:
        return {}
    from routes.global_stock_dashboard import RESERVED_STATUSES, _item_units
    open_ids = await db.distributor_deliveries.distinct("id", {"tenant_id": tenant_id, "status": {"$in": list(RESERVED_STATUSES)}})
    out = defaultdict(int)
    if open_ids:
        async for it in db.distributor_delivery_items.find(
                {"tenant_id": tenant_id, "delivery_id": {"$in": open_ids}, "child_sku_id": {"$in": child_ids}},
                {"_id": 0, "child_sku_id": 1, "quantity": 1, "packaging_units": 1, "packages": 1}):
            out[it["child_sku_id"]] += _item_units(it)
    return out


async def _build(tenant_id: str, distributor_id: Optional[str], account_id: Optional[str]) -> dict:
    active = {"$in": ["active", None]}
    acct_q = {"tenant_id": tenant_id, "status": active}
    if account_id:
        acct_q["id"] = account_id
    if distributor_id:
        assigned = await db.account_distributor_assignments.distinct(
            "account_id", {"tenant_id": tenant_id, "distributor_id": distributor_id, "status": {"$ne": "inactive"}})
        served = await db.distributor_deliveries.distinct(
            "account_id", {"tenant_id": tenant_id, "distributor_id": distributor_id, "status": {"$in": ORDER_STATUSES}})
        acct_q["id"] = {"$in": sorted(x for x in set(assigned) | set(served) if x)} if not account_id else account_id
    accounts = await db.accounts.find(acct_q, {"_id": 0, "id": 1, "account_name": 1, "account_id": 1, "city": 1, "state": 1, "category": 1}).to_list(5000)
    acct_ids = [a["id"] for a in accounts]

    # Delivered Stock-Outs per account (optionally from one distributor), newest first.
    deliv_q = {"tenant_id": tenant_id, "account_id": {"$in": acct_ids}, "status": {"$in": ORDER_STATUSES}}
    if distributor_id:
        deliv_q["distributor_id"] = distributor_id
    by_acct = defaultdict(list)
    async for d in db.distributor_deliveries.find(
            deliv_q, {"_id": 0, "id": 1, "account_id": 1, "delivery_number": 1, "delivery_date": 1, "delivered_at": 1,
                      "total_quantity": 1, "distributor_name": 1, "distributor_id": 1}):
        day = _parse_day(d.get("delivery_date") or d.get("delivered_at"))
        if day:
            by_acct[d["account_id"]].append({**d, "day": day})
    sample, freq = {}, {}
    for aid, lst in by_acct.items():
        lst.sort(key=lambda x: (x["day"], x.get("delivered_at") or ""))
        sample[aid] = lst[-SAMPLE_ORDERS:]
        freq[aid] = _order_frequency([d["day"] for d in lst])
    sample_ids = [d["id"] for lst in sample.values() for d in lst]
    items_by_deliv = defaultdict(list)
    async for it in db.distributor_delivery_items.find({"tenant_id": tenant_id, "delivery_id": {"$in": sample_ids}},
                                                       {"_id": 0, "delivery_id": 1, "sku_id": 1, "quantity": 1}):
        items_by_deliv[it["delivery_id"]].append(it)
    group_docs = await db.brand_groups.find(
        {"tenant_id": tenant_id, "account_ids": {"$in": acct_ids}, "is_active": {"$ne": False}},
        {"_id": 0, "id": 1, "name": 1, "code": 1, "account_ids": 1}).sort("name", 1).to_list(1000)
    group_ids = [g["id"] for g in group_docs]
    children = await db.child_skus.find(
        {"tenant_id": tenant_id, "is_active": {"$ne": False},
         "$or": [{"customer_account_id": {"$in": acct_ids}}, {"brand_group_id": {"$in": group_ids}}]},
        {"_id": 0, "id": 1, "customer_account_id": 1, "brand_group_id": 1, "brand_group_name": 1, "child_sku_name": 1,
         "child_sku_code": 1, "parent_sku_id": 1, "parent_sku_name": 1}).to_list(5000)
    from routes.brand_groups import child_account_ids_map
    child_accts = await child_account_ids_map(tenant_id, children)
    acct_set = set(acct_ids)
    upc = await _units_per_crate(tenant_id, {it["sku_id"] for its in items_by_deliv.values() for it in its}
                                 | {c.get("parent_sku_id") for c in children if c.get("parent_sku_id")})
    for lst in sample.values():
        for d in lst:
            its = items_by_deliv.get(d["id"]) or []
            d["units"] = sum(int(it.get("quantity") or 0) for it in its) or int(d.get("total_quantity") or 0)
            d["crates"] = round(sum(int(it.get("quantity") or 0) / upc.get(it["sku_id"], 1) for it in its), 1) if its else round(d["units"] / max(upc.values() or [1]) if upc else d["units"], 1)

    # Customer-branded child SKUs + stock in hand across all warehouses.
    child_ids = [c["id"] for c in children]
    stock_by_child = defaultdict(int)
    breakdown = defaultdict(list)
    if child_ids:
        loc_names = {}
        for coll, loc_field in ((db.distributor_stock, "distributor_location_id"), (db.factory_warehouse_stock, "warehouse_location_id")):
            async for r in coll.find({"tenant_id": tenant_id, "child_sku_id": {"$in": child_ids}, "quantity": {"$gt": 0}},
                                     {"_id": 0, "child_sku_id": 1, "quantity": 1, loc_field: 1, "location_name": 1, "warehouse_name": 1}):
                q = int(r.get("quantity") or 0)
                stock_by_child[r["child_sku_id"]] += q
                lid = r.get(loc_field)
                loc_names.setdefault(lid, r.get("location_name") or r.get("warehouse_name"))
                breakdown[(r["child_sku_id"], lid)].append(q)
        unnamed = [l for l, n in loc_names.items() if not n and l]
        if unnamed:
            async for l in db.distributor_locations.find({"id": {"$in": unnamed}}, {"_id": 0, "id": 1, "location_name": 1}):
                loc_names[l["id"]] = l.get("location_name")
        wh_breakdown = defaultdict(list)
        for (cid, lid), qs in breakdown.items():
            wh_breakdown[cid].append({"location_id": lid, "location_name": loc_names.get(lid) or "Warehouse", "quantity": sum(qs)})
    reserved_by_child = await _reserved_by_child(tenant_id, child_ids)
    acct_names = {a["id"]: a.get("account_name") for a in accounts}
    children_by_acct = defaultdict(list)
    child_rows = {}
    for c in children:
        cu = upc.get(c.get("parent_sku_id"), 1)
        child_rows[c["id"]] = {
            "child_sku_id": c["id"], "child_sku_name": c.get("child_sku_name"), "child_sku_code": c.get("child_sku_code"),
            "parent_sku_name": c.get("parent_sku_name"), "stock_in_hand": stock_by_child.get(c["id"], 0),
            "shared": bool(c.get("brand_group_id")), "brand_group_id": c.get("brand_group_id"), "brand_group_name": c.get("brand_group_name"),
            "owner_account_id": c.get("customer_account_id"), "owner_name": acct_names.get(c.get("customer_account_id")),
            "units_per_crate": cu, "stock_crates": round(stock_by_child.get(c["id"], 0) / cu, 2),
            "reserved_in_hand": reserved_by_child.get(c["id"], 0), "reserved_crates": round(reserved_by_child.get(c["id"], 0) / cu, 2),
            "warehouses": sorted(wh_breakdown.get(c["id"], []), key=lambda w: -w["quantity"]) if child_ids else [],
        }
        for aid in child_accts.get(c["id"], set()) & acct_set:
            children_by_acct[aid].append(child_rows[c["id"]])
    groups_by_acct = defaultdict(list)
    for g in group_docs:
        for aid in g.get("account_ids") or []:
            groups_by_acct[aid].append(g["id"])

    # Fallback: customers without a branded child SKU show the parent SKUs they
    # actually order, backed by generic (unbranded) stock.
    parent_by_acct = defaultdict(set)
    for aid, lst in sample.items():
        if aid in children_by_acct:
            continue
        for d in lst:
            for it in items_by_deliv.get(d["id"]) or []:
                if it.get("sku_id"):
                    parent_by_acct[aid].add(it["sku_id"])
    parent_rows = await _generic_parent_rows(tenant_id, {s for v in parent_by_acct.values() for s in v}, upc)

    today = datetime.now(timezone.utc).date()
    distributors = await db.distributors.find({"tenant_id": tenant_id}, {"_id": 0, "id": 1, "distributor_name": 1, "distributor_code": 1}).sort("distributor_name", 1).to_list(1000)
    dist_names = {d["id"]: d.get("distributor_name") for d in distributors}
    assigned_dist = {}
    async for asg in db.account_distributor_assignments.find(
            {"tenant_id": tenant_id, "account_id": {"$in": acct_ids}, "status": {"$ne": "inactive"}},
            {"_id": 0, "account_id": 1, "distributor_id": 1, "distributor_name": 1, "is_primary": 1}).sort("is_primary", -1):
        assigned_dist.setdefault(asg["account_id"], asg)
    tiles = []
    for a in accounts:
        hist = sample.get(a["id"], [])
        lo = hist[-1] if hist else None
        asg = assigned_dist.get(a["id"]) or {}
        dist_id = (lo or {}).get("distributor_id") or asg.get("distributor_id")
        dist_name = dist_names.get(dist_id) or (lo or {}).get("distributor_name") or asg.get("distributor_name")
        skus = sorted(children_by_acct.get(a["id"], []), key=lambda s: (s["child_sku_name"] or "").lower())
        stock_kind = "branded" if skus else None
        if not skus and parent_by_acct.get(a["id"]):
            skus = sorted((parent_rows.get((s, dist_id)) or parent_rows[(s, None)] for s in parent_by_acct[a["id"]] if (s, None) in parent_rows),
                          key=lambda s: (s["child_sku_name"] or "").lower())
            stock_kind = "generic" if skus else None
        stock_units = sum(s["stock_in_hand"] for s in skus)
        stock_crates = round(sum(s["stock_crates"] for s in skus), 2)
        reserved_crates = round(sum(s.get("reserved_crates") or 0 for s in skus), 2)
        fc = _forecast([{"day": d["day"], "crates": d["crates"]} for d in hist], today)
        tracks_stock = bool(skus)
        low_stock = tracks_stock and fc["expected_crates"] is not None and stock_crates < fc["expected_crates"]
        tiles.append({
            "account_id": a["id"], "account_code": a.get("account_id"), "account_name": a.get("account_name") or "—",
            "city": a.get("city"), "state": a.get("state"), "category": a.get("category"),
            "last_order_quantity": lo["units"] if lo else None,
            "last_order_crates": lo["crates"] if lo else None,
            "last_order_date": lo["day"].isoformat() if lo else None,
            "last_order_number": lo.get("delivery_number") if lo else None,
            "last_order_distributor": lo.get("distributor_name") if lo else None,
            **freq.get(a["id"], {"order_frequency_days": None, "frequency_basis": None, "total_orders": 0}),
            "distributor_id": dist_id, "distributor_name": dist_name or "Unassigned",
            "child_skus": skus,
            "stock_kind": stock_kind,
            "brand_group_ids": groups_by_acct.get(a["id"], []),
            "brand_group_names": [g.get("name") for g in group_docs if a["id"] in (g.get("account_ids") or [])],
            "stock_in_hand": stock_units,
            "stock_crates": stock_crates,
            "reserved_crates": reserved_crates,
            "tracks_stock": tracks_stock,
            "low_stock": low_stock,
            **fc,
            "next_order_urgency": (None if not fc["expected_next_order_date"] else "red" if low_stock else "green" if tracks_stock else "neutral"),
            "priority": low_stock,
        })
    tiles.sort(key=lambda t: (not t["priority"], (t["account_name"] or "").lower()))
    groups = _group_tiles(group_docs, tiles, child_rows, sample)

    all_accounts = accounts if not (distributor_id or account_id) else await db.accounts.find(
        {"tenant_id": tenant_id, "status": active}, {"_id": 0, "id": 1, "account_name": 1, "city": 1}).to_list(5000)
    return {
        "tiles": tiles,
        "groups": groups,
        "summary": {"customers": len(tiles), "with_orders": sum(1 for t in tiles if t["last_order_date"]),
                    "groups": len(groups), "grouped_customers": sum(len(g["members"]) for g in groups),
                    "low_stock": sum(1 for t in tiles if t["low_stock"]),
                    "due_soon": sum(1 for t in tiles if t["next_order_in_days"] is not None and t["next_order_in_days"] <= 7),
                    "priority": sum(1 for t in tiles if t["priority"]),
                    "stock_in_hand": sum(v["stock_in_hand"] for v in {s["child_sku_id"]: s for t in tiles for s in t["child_skus"]}.values()),
                    "stock_crates": round(sum(v["stock_crates"] for v in {s["child_sku_id"]: s for t in tiles for s in t["child_skus"]}.values()), 2),
                    "branded_skus": sum(len(t["child_skus"]) for t in tiles if t["stock_kind"] == "branded"),
                    "generic_customers": sum(1 for t in tiles if t["stock_kind"] == "generic")},
        "filters": {
            "distributors": [{"id": d["id"], "name": d.get("distributor_name"), "code": d.get("distributor_code")} for d in distributors],
            "accounts": sorted([{"id": a["id"], "name": a.get("account_name") or "—", "city": a.get("city")} for a in all_accounts], key=lambda x: x["name"].lower()),
        },
    }
