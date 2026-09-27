"""Customer Invoice Overview — every account × last 6 calendar months (incl. current),
gross invoice value per month (0 where nothing applies).

GET /api/reports/customer-invoice-overview
GET /api/reports/customer-invoice-overview/export
"""
import io
from collections import defaultdict
from datetime import datetime, timezone

from fastapi import APIRouter, Depends
from fastapi.responses import StreamingResponse
from openpyxl import Workbook
from openpyxl.styles import Font, PatternFill, Alignment
from utils.excel_branding import brand_workbook

from database import get_tenant_db
from deps import get_current_user

router = APIRouter()
MONTHS = 6


def _month_keys(today) -> list:
    y, m = today.year, today.month
    keys = []
    for _ in range(MONTHS):
        keys.append(f"{y:04d}-{m:02d}")
        m -= 1
        if m == 0:
            y, m = y - 1, 12
    return keys[::-1]


def _gross(inv) -> float:
    try:
        return float(inv.get("gross_invoice_value") or inv.get("gross_amount") or inv.get("grand_total") or inv.get("total_amount") or 0)
    except (TypeError, ValueError):
        return 0.0


async def _build() -> dict:
    tdb = get_tenant_db()
    today = datetime.now(timezone.utc).date()
    keys = _month_keys(today)
    labels = [datetime.strptime(k, "%Y-%m").strftime("%b %Y") for k in keys]

    accounts = await tdb.accounts.find(
        {"status": {"$in": ["active", None]}},
        {"_id": 0, "id": 1, "account_id": 1, "account_name": 1, "city": 1, "created_at": 1, "onboarded_month": 1, "onboarded_year": 1},
    ).to_list(5000)
    by_code = {a.get("account_id"): a for a in accounts if a.get("account_id")}
    by_uuid = {a["id"]: a for a in accounts if a.get("id")}
    by_name = {(a.get("account_name") or "").strip().lower(): a for a in accounts if a.get("account_name")}

    first, last = f"{keys[0]}-01", f"{keys[-1]}-31"
    totals = defaultdict(lambda: defaultdict(float))
    counts = defaultdict(int)
    async for inv in tdb.invoices.find({"invoice_date": {"$gte": first, "$lte": last}},
                                       {"_id": 0, "invoice_date": 1, "account_id": 1, "account_uuid": 1, "account_name": 1, "customer_name": 1,
                                        "gross_invoice_value": 1, "gross_amount": 1, "grand_total": 1, "total_amount": 1}):
        ref = inv.get("account_id") or inv.get("account_uuid")
        acc = (by_code.get(ref) or by_uuid.get(ref)) if ref else None
        if not acc:
            acc = by_name.get((inv.get("account_name") or inv.get("customer_name") or "").strip().lower())
        if not acc:
            continue
        month = (inv.get("invoice_date") or "")[:7]
        if month in keys:
            totals[acc["id"]][month] += _gross(inv)
            counts[acc["id"]] += 1

    rows = []
    for a in accounts:
        vals = [round(totals[a["id"]].get(k, 0.0), 2) for k in keys]
        rows.append({
            "account_id": a["id"], "account_code": a.get("account_id"), "account_name": a.get("account_name") or "—",
            "city": a.get("city"), "months": vals, "total": round(sum(vals), 2), "invoice_count": counts.get(a["id"], 0),
        })
    rows.sort(key=lambda r: (r["account_name"] or "").lower())
    month_totals = [round(sum(r["months"][i] for r in rows), 2) for i in range(MONTHS)]
    return {
        "months": [{"key": k, "label": l, "current": k == keys[-1]} for k, l in zip(keys, labels)],
        "rows": rows,
        "month_totals": month_totals,
        "grand_total": round(sum(month_totals), 2),
        "summary": {"customers": len(rows), "invoiced_customers": sum(1 for r in rows if r["total"] > 0),
                    "invoices": sum(counts.values())},
        "generated_at": datetime.now(timezone.utc).isoformat(),
    }


@router.get("/reports/customer-invoice-overview")
async def customer_invoice_overview(current_user: dict = Depends(get_current_user)):
    return await _build()


@router.get("/reports/customer-invoice-overview/export")
async def export_customer_invoice_overview(current_user: dict = Depends(get_current_user)):
    data = await _build()
    wb = Workbook()
    ws = wb.active
    ws.title = "Customer Invoice Overview"
    ws.append(["Customer Invoice Overview — gross invoice value, last 6 months"])
    ws["A1"].font = Font(bold=True, size=14)
    ws.append([f"Generated: {datetime.now(timezone.utc).strftime('%d %b %Y %H:%M UTC')}"])
    ws.append([])
    ws.append(["Customer", "Code", "City"] + [m["label"] for m in data["months"]] + ["Total"])
    hdr = ws.max_row
    for c in ws[hdr]:
        c.font = Font(bold=True, color="FFFFFF")
        c.fill = PatternFill(start_color="0F172A", end_color="0F172A", fill_type="solid")
        c.alignment = Alignment(horizontal="center", vertical="center")
    for r in data["rows"]:
        ws.append([r["account_name"], r.get("account_code") or "", r.get("city") or ""] + r["months"] + [r["total"]])
    ws.append(["Total", "", ""] + data["month_totals"] + [data["grand_total"]])
    for c in ws[ws.max_row]:
        c.font = Font(bold=True)
        c.fill = PatternFill(start_color="F1F5F9", end_color="F1F5F9", fill_type="solid")
    for row in ws.iter_rows(min_row=hdr + 1, min_col=4, max_col=4 + MONTHS):
        for c in row:
            c.number_format = "#,##0.00"
    for i, wd in enumerate([34, 20, 16] + [14] * MONTHS + [16], start=1):
        ws.column_dimensions[ws.cell(row=hdr, column=i).column_letter].width = wd
    ws.freeze_panes = ws.cell(row=hdr + 1, column=2)
    brand_workbook(wb)
    buf = io.BytesIO()
    wb.save(buf)
    buf.seek(0)
    fname = f"customer-invoice-overview-{datetime.now(timezone.utc).strftime('%Y%m%d')}.xlsx"
    return StreamingResponse(buf, media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
                             headers={"Content-Disposition": f'attachment; filename="{fname}"'})
