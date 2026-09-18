"""Customer Stock Dashboard — one tile per active customer (account):
last Stock-Out delivery (quantity + date) and stock-in-hand of the customer's
own branded child SKUs across every warehouse.

GET /api/distributor/customer-stock-dashboard?distributor_id=&account_id=
"""
import io
from collections import defaultdict
from datetime import datetime, timezone, timedelta
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
    ws.append(["Customer Stock Dashboard", "", "", "", "", "", "", "", "", ""])
    ws["A1"].font = Font(bold=True, size=14)
    ws.append([f"Distributor: {dist_name or 'All'}", f"Account: {acct_name or 'All'}",
               f"Generated: {datetime.now(timezone.utc).strftime('%d %b %Y %H:%M UTC')}"])
    ws.append([])
    headers = ["Customer", "City", "Category", "Last Order Quantity", "Last Order Date", "Expected Next Order",
               "Branded Child SKU", "Stock in Hand", "Low Stock", "Warehouses"]
    ws.append(headers)
    hdr_row = ws.max_row
    for cell in ws[hdr_row]:
        cell.font = Font(bold=True, color="FFFFFF")
        cell.fill = PatternFill(start_color="0F172A", end_color="0F172A", fill_type="solid")
        cell.alignment = Alignment(horizontal="center", vertical="center", wrap_text=True)

    cust_fill = PatternFill(start_color="ECFEFF", end_color="ECFEFF", fill_type="solid")
    for t in data["tiles"]:
        base = [t["account_name"], t.get("city") or "", t.get("category") or "",
                t["last_order_quantity"] if t["last_order_quantity"] is not None else "—",
                _fmt_date(t["last_order_date"]) or "—", _fmt_date(t.get("expected_next_order_date")) or "—"]
        skus = t["child_skus"] or [{"child_sku_name": "No branded SKU", "stock_in_hand": "—", "warehouses": []}]
        for i, s in enumerate(skus):
            row = (base if i == 0 else ["", "", "", "", "", ""]) + [
                s["child_sku_name"], s["stock_in_hand"], ("YES" if t["low_stock"] else "") if i == 0 else "",
                " · ".join(f"{w['location_name']} {w['quantity']}" for w in s.get("warehouses") or [])]
            ws.append(row)
            if i == 0:
                ws.cell(row=ws.max_row, column=1).font = Font(bold=True)
                for cell in ws[ws.max_row]:
                    cell.fill = cust_fill
                urg = t.get("next_order_urgency")
                if urg:
                    ws.cell(row=ws.max_row, column=6).font = Font(bold=True, color={"red": "DC2626", "amber": "CA8A04", "green": "15803D"}[urg])
                if t["low_stock"]:
                    ws.cell(row=ws.max_row, column=9).font = Font(bold=True, color="DC2626")
        if len(skus) > 1:
            ws.append(["", "", "", "", "", "", "Total", t["stock_in_hand"], "", ""])
            ws.cell(row=ws.max_row, column=7).font = Font(bold=True)
            ws.cell(row=ws.max_row, column=8).font = Font(bold=True)

    sm = data["summary"]
    ws.append([])
    ws.append([f"{sm['customers']} customers · {sm['with_orders']} with orders · {sm['low_stock']} low stock · {sm['due_soon']} order due ≤7d", "", "", "", "", "", "TOTAL STOCK IN HAND", sm["stock_in_hand"], "", ""])
    for cell in ws[ws.max_row]:
        cell.font = Font(bold=True, size=12)
        cell.fill = PatternFill(start_color="C7D2FE", end_color="C7D2FE", fill_type="solid")

    for i, wd in enumerate([32, 16, 16, 18, 16, 20, 34, 14, 10, 40], start=1):
        ws.column_dimensions[ws.cell(row=hdr_row, column=i).column_letter].width = wd
    ws.freeze_panes = ws.cell(row=hdr_row + 1, column=1)

    buf = io.BytesIO()
    brand_workbook(wb)
    wb.save(buf)
    buf.seek(0)
    fname = f"customer-stock-{datetime.now(timezone.utc).strftime('%Y%m%d-%H%M')}.xlsx"
    return StreamingResponse(buf, media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
                             headers={"Content-Disposition": f'attachment; filename="{fname}"'})


DEFAULT_ORDER_INTERVAL_DAYS = 30


def _expected_next_order(days: list, today) -> dict:
    """Expected next order = last order date + average gap between the last few orders
    (30-day default when the customer has ordered only once). Urgency: red ≤ 7 days
    (or overdue), amber ≤ 10 days, green otherwise."""
    if not days:
        return {"expected_next_order_date": None, "next_order_in_days": None, "order_interval_days": None,
                "next_order_urgency": None, "interval_basis": None}
    dates = []
    for d in days:
        try:
            dates.append(datetime.fromisoformat(d[:10]).date())
        except ValueError:
            continue
    if not dates:
        return {"expected_next_order_date": None, "next_order_in_days": None, "order_interval_days": None,
                "next_order_urgency": None, "interval_basis": None}
    recent = dates[-6:]
    gaps = [(b - a).days for a, b in zip(recent, recent[1:]) if (b - a).days > 0]
    if gaps:
        interval, basis = max(1, round(sum(gaps) / len(gaps))), f"avg of last {len(gaps) + 1} orders"
    else:
        interval, basis = DEFAULT_ORDER_INTERVAL_DAYS, "default (single order)"
    expected = dates[-1] + timedelta(days=interval)
    in_days = (expected - today).days
    urgency = "red" if in_days <= 7 else ("amber" if in_days <= 10 else "green")
    return {"expected_next_order_date": expected.isoformat(), "next_order_in_days": in_days,
            "order_interval_days": interval, "next_order_urgency": urgency, "interval_basis": basis}


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

    # Latest delivered Stock-Out per account (optionally from one distributor).
    deliv_q = {"tenant_id": tenant_id, "account_id": {"$in": acct_ids}, "status": {"$in": ORDER_STATUSES}}
    if distributor_id:
        deliv_q["distributor_id"] = distributor_id
    last_order = {}
    order_dates = defaultdict(set)
    async for d in db.distributor_deliveries.find(
            deliv_q, {"_id": 0, "id": 1, "account_id": 1, "delivery_number": 1, "delivery_date": 1, "delivered_at": 1,
                      "total_quantity": 1, "distributor_name": 1, "distributor_id": 1}):
        key = (d.get("delivery_date") or "", d.get("delivered_at") or "")
        day = (d.get("delivery_date") or d.get("delivered_at") or "")[:10]
        if day:
            order_dates[d["account_id"]].add(day)
        cur = last_order.get(d["account_id"])
        if cur is None or key > cur["_key"]:
            last_order[d["account_id"]] = {**d, "_key": key}
    missing_qty = [d["id"] for d in last_order.values() if d.get("total_quantity") in (None, 0, "0")]
    if missing_qty:
        sums = defaultdict(int)
        async for it in db.distributor_delivery_items.find({"tenant_id": tenant_id, "delivery_id": {"$in": missing_qty}}, {"_id": 0, "delivery_id": 1, "quantity": 1}):
            sums[it["delivery_id"]] += int(it.get("quantity") or 0)
        for d in last_order.values():
            if d["id"] in sums:
                d["total_quantity"] = sums[d["id"]]

    # Customer-branded child SKUs + stock in hand across all warehouses.
    children = await db.child_skus.find(
        {"tenant_id": tenant_id, "customer_account_id": {"$in": acct_ids}, "is_active": {"$ne": False}},
        {"_id": 0, "id": 1, "customer_account_id": 1, "child_sku_name": 1, "child_sku_code": 1, "parent_sku_name": 1}).to_list(5000)
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
    children_by_acct = defaultdict(list)
    for c in children:
        children_by_acct[c["customer_account_id"]].append({
            "child_sku_id": c["id"], "child_sku_name": c.get("child_sku_name"), "child_sku_code": c.get("child_sku_code"),
            "parent_sku_name": c.get("parent_sku_name"), "stock_in_hand": stock_by_child.get(c["id"], 0),
            "warehouses": sorted(wh_breakdown.get(c["id"], []), key=lambda w: -w["quantity"]) if child_ids else [],
        })

    today = datetime.now(timezone.utc).date()
    tiles = []
    for a in accounts:
        lo = last_order.get(a["id"])
        skus = sorted(children_by_acct.get(a["id"], []), key=lambda s: (s["child_sku_name"] or "").lower())
        stock = sum(s["stock_in_hand"] for s in skus)
        last_qty = int(lo.get("total_quantity") or 0) if lo else None
        last_date = ((lo.get("delivery_date") or lo.get("delivered_at") or "")[:10] or None) if lo else None
        nxt = _expected_next_order(sorted(order_dates.get(a["id"], [])), today)
        low_stock = bool(skus) and last_qty is not None and stock < last_qty
        tiles.append({
            "account_id": a["id"], "account_code": a.get("account_id"), "account_name": a.get("account_name") or "—",
            "city": a.get("city"), "state": a.get("state"), "category": a.get("category"),
            "last_order_quantity": last_qty,
            "last_order_date": last_date,
            "last_order_number": lo.get("delivery_number") if lo else None,
            "last_order_distributor": lo.get("distributor_name") if lo else None,
            "child_skus": skus,
            "stock_in_hand": stock,
            "low_stock": low_stock,
            **nxt,
            "priority": low_stock and nxt["next_order_urgency"] == "red",
        })
    tiles.sort(key=lambda t: (not t["priority"], (t["account_name"] or "").lower()))

    distributors = await db.distributors.find({"tenant_id": tenant_id}, {"_id": 0, "id": 1, "distributor_name": 1, "distributor_code": 1}).sort("distributor_name", 1).to_list(1000)
    all_accounts = accounts if not (distributor_id or account_id) else await db.accounts.find(
        {"tenant_id": tenant_id, "status": active}, {"_id": 0, "id": 1, "account_name": 1, "city": 1}).to_list(5000)
    return {
        "tiles": tiles,
        "summary": {"customers": len(tiles), "with_orders": sum(1 for t in tiles if t["last_order_date"]),
                    "low_stock": sum(1 for t in tiles if t["low_stock"]),
                    "due_soon": sum(1 for t in tiles if t["next_order_urgency"] == "red"),
                    "priority": sum(1 for t in tiles if t["priority"]),
                    "stock_in_hand": sum(t["stock_in_hand"] for t in tiles),
                    "branded_skus": sum(len(t["child_skus"]) for t in tiles)},
        "filters": {
            "distributors": [{"id": d["id"], "name": d.get("distributor_name"), "code": d.get("distributor_code")} for d in distributors],
            "accounts": sorted([{"id": a["id"], "name": a.get("account_name") or "—", "city": a.get("city")} for a in all_accounts], key=lambda x: x["name"].lower()),
        },
    }
