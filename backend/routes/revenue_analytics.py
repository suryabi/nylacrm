"""
Revenue Analytics dashboard endpoints.

Source of truth = `invoices` collection (Zoho tax invoices + External Billing
Entries combined). Surface revenue grouped by:
  • city                 (account.city)
  • state                (account.state)
  • territory            (account.territory)
  • business_category    (account.category — legacy field name)
  • sku                  (invoice.items[].sku_id → master_skus.sku_name)

Two endpoints:
  GET /reports/revenue-analytics       — one period, grouped totals.
  GET /reports/revenue-compare         — period A vs period B (paired bars).

Filters by `invoice_date` (string ISO 'YYYY-MM-DD'), so the same window
matches what users see on the Invoices tab.
"""
from __future__ import annotations

from datetime import datetime, timezone, timedelta
from calendar import monthrange
from typing import Optional, Literal

from fastapi import APIRouter, Depends, HTTPException, Query

from database import db
from deps import get_current_user
from core.tenant import get_current_tenant_id

router = APIRouter()

GROUP_BY = Literal["city", "state", "territory", "business_category", "sku", "total"]


# ──────────────────────────────────────────────────────────────────────────
# Time-window resolver — same options the Leads filter exposes so users get
# a consistent UX. Returns inclusive [from_iso, to_iso] yyyy-mm-dd strings.
# ──────────────────────────────────────────────────────────────────────────
def _window(
    time_filter: str,
    from_date: Optional[str],
    to_date: Optional[str],
) -> tuple[str, str]:
    today = datetime.now(timezone.utc).date()
    if time_filter == "custom":
        if not from_date or not to_date:
            raise HTTPException(status_code=400, detail="from_date/to_date required for custom")
        return from_date, to_date
    if time_filter == "this_week":
        start = today - timedelta(days=today.weekday())
        return start.isoformat(), today.isoformat()
    if time_filter == "last_week":
        end = today - timedelta(days=today.weekday() + 1)
        start = end - timedelta(days=6)
        return start.isoformat(), end.isoformat()
    if time_filter == "this_month":
        start = today.replace(day=1)
        return start.isoformat(), today.isoformat()
    if time_filter == "last_month":
        first = today.replace(day=1)
        end = first - timedelta(days=1)
        return end.replace(day=1).isoformat(), end.isoformat()
    if time_filter == "this_quarter":
        q_start_month = ((today.month - 1) // 3) * 3 + 1
        start = today.replace(month=q_start_month, day=1)
        return start.isoformat(), today.isoformat()
    if time_filter == "this_year":
        return today.replace(month=1, day=1).isoformat(), today.isoformat()
    if time_filter == "last_year":
        return f"{today.year - 1}-01-01", f"{today.year - 1}-12-31"
    if time_filter == "all_time":
        return "1970-01-01", today.isoformat()
    # Default: this_month
    start = today.replace(day=1)
    return start.isoformat(), today.isoformat()


def _month_window(year: int, month: int) -> tuple[str, str]:
    last = monthrange(year, month)[1]
    return f"{year:04d}-{month:02d}-01", f"{year:04d}-{month:02d}-{last:02d}"


def _group_label(account: dict, group_by: str) -> str:
    # Empty / null group values bucket under "Uncategorised" so the chart
    # remains accurate. We never silently drop revenue.
    if group_by == "city":
        return (account or {}).get("city") or "Uncategorised"
    if group_by == "state":
        return (account or {}).get("state") or "Uncategorised"
    if group_by == "territory":
        return (account or {}).get("territory") or "Uncategorised"
    if group_by == "business_category":
        return (account or {}).get("category") or (account or {}).get("business_category") or "Uncategorised"
    if group_by == "total":
        return "Total"
    return "Unknown"


async def _aggregate(
    tenant_id: str,
    from_date: str,
    to_date: str,
    group_by: str,
) -> list[dict]:
    """Group invoice revenue. Returns `[{label, revenue, count}]` sorted desc."""
    query = {
        "tenant_id": tenant_id,
        "invoice_date": {"$gte": from_date, "$lte": to_date},
        # Both Zoho invoices (default `source` missing) AND EBE rows count.
        # `cancelled` invoices are excluded.
        "status": {"$ne": "cancelled"},
    }

    if group_by == "sku":
        # Sum line items grouped by sku. We use `customer_selling_price` →
        # `unit_price` → `rate` in that fallback order to handle every line
        # variant the codebase has emitted over the years.
        invoices = await db.invoices.find(
            query,
            {"_id": 0, "items": 1, "gross_invoice_value": 1},
        ).to_list(20000)
        sku_ids: set = set()
        for inv in invoices:
            for it in (inv.get("items") or []):
                sid = it.get("sku_id") or it.get("itemId") or it.get("sku_code")
                if sid:
                    sku_ids.add(sid)
        # Hydrate names. Try id-keyed first, then itemId/sku_code legacy keys.
        sku_name_map: dict[str, str] = {}
        if sku_ids:
            cursor = db.master_skus.find(
                {"tenant_id": tenant_id, "$or": [
                    {"id": {"$in": list(sku_ids)}},
                    {"sku_code": {"$in": list(sku_ids)}},
                ]},
                {"_id": 0, "id": 1, "sku_name": 1, "sku_code": 1},
            )
            async for s in cursor:
                if s.get("id"):
                    sku_name_map[s["id"]] = s.get("sku_name") or s.get("sku_code")
                if s.get("sku_code"):
                    sku_name_map[s["sku_code"]] = s.get("sku_name") or s.get("sku_code")

        groups: dict[str, dict] = {}
        for inv in invoices:
            for it in (inv.get("items") or []):
                sid = it.get("sku_id") or it.get("itemId") or it.get("sku_code") or "Uncategorised"
                label = (it.get("sku_name") or sku_name_map.get(sid) or sid)
                try:
                    qty = float(it.get("quantity") or 0)
                    rate = float(it.get("customer_selling_price")
                                 or it.get("unit_price")
                                 or it.get("rate") or 0)
                    revenue = qty * rate
                except (TypeError, ValueError):
                    revenue = 0.0
                grp = groups.setdefault(label, {"label": label, "revenue": 0.0, "count": 0})
                grp["revenue"] += revenue
                grp["count"] += 1
        return sorted(groups.values(), key=lambda g: g["revenue"], reverse=True)

    # Account-attribute group-bys — load all invoices + the accounts they
    # reference, then aggregate in Python.
    invoices = await db.invoices.find(
        query,
        {"_id": 0, "id": 1, "account_uuid": 1, "account_id": 1,
         "gross_invoice_value": 1, "net_invoice_value": 1},
    ).to_list(20000)

    account_ids = list({
        inv.get("account_uuid") or inv.get("account_id")
        for inv in invoices
        if inv.get("account_uuid") or inv.get("account_id")
    })
    accounts_map: dict[str, dict] = {}
    if account_ids:
        async for a in db.accounts.find(
            {"$or": [{"id": {"$in": account_ids}}, {"account_id": {"$in": account_ids}}]},
            {"_id": 0, "id": 1, "account_id": 1, "city": 1, "state": 1,
             "territory": 1, "category": 1, "business_category": 1, "account_name": 1},
        ):
            if a.get("id"):
                accounts_map[a["id"]] = a
            if a.get("account_id"):
                accounts_map[a["account_id"]] = a

    groups: dict[str, dict] = {}
    for inv in invoices:
        a = accounts_map.get(inv.get("account_uuid")) or accounts_map.get(inv.get("account_id")) or {}
        label = _group_label(a, group_by)
        # Net (post-credit-note) revenue is the truth for analytics. Fall back
        # to gross if net is missing.
        revenue = float(inv.get("net_invoice_value") or inv.get("gross_invoice_value") or 0)
        grp = groups.setdefault(label, {"label": label, "revenue": 0.0, "count": 0})
        grp["revenue"] += revenue
        grp["count"] += 1
    return sorted(groups.values(), key=lambda g: g["revenue"], reverse=True)


@router.get("/reports/revenue-analytics")
async def revenue_analytics(
    time_filter: str = "this_month",
    group_by: GROUP_BY = "city",
    from_date: Optional[str] = None,
    to_date: Optional[str] = None,
    top_n: int = Query(15, ge=1, le=200),
    _user: dict = Depends(get_current_user),
):
    """Revenue per group for one time window."""
    tenant_id = get_current_tenant_id()
    fd, td = _window(time_filter, from_date, to_date)
    groups = await _aggregate(tenant_id, fd, td, group_by)

    # Roll groups beyond `top_n` into a single "Others" bucket so the bar
    # chart doesn't degrade visually with 100 SKUs.
    head = groups[:top_n]
    tail = groups[top_n:]
    if tail:
        head.append({
            "label": f"Others ({len(tail)})",
            "revenue": sum(g["revenue"] for g in tail),
            "count": sum(g["count"] for g in tail),
            "is_others": True,
        })

    total_revenue = sum(g["revenue"] for g in groups)
    total_count = sum(g["count"] for g in groups)
    return {
        "from": fd,
        "to": td,
        "group_by": group_by,
        "groups": head,
        "raw_group_count": len(groups),
        "total_revenue": total_revenue,
        "total_invoice_count": total_count,
    }


@router.get("/reports/revenue-compare")
async def revenue_compare(
    period_a_year: int = Query(..., ge=2000, le=2100),
    period_a_month: int = Query(..., ge=1, le=12),
    period_b_year: int = Query(..., ge=2000, le=2100),
    period_b_month: int = Query(..., ge=1, le=12),
    group_by: GROUP_BY = "total",
    top_n: int = Query(15, ge=1, le=200),
    _user: dict = Depends(get_current_user),
):
    """Compare revenue between two months. Paired by group label so the
    frontend can render side-by-side bars.

    `group_by='total'` returns a single row with both period values, useful
    for the headline comparison number on the chart.
    """
    tenant_id = get_current_tenant_id()
    a_from, a_to = _month_window(period_a_year, period_a_month)
    b_from, b_to = _month_window(period_b_year, period_b_month)

    a_groups = await _aggregate(tenant_id, a_from, a_to, group_by)
    b_groups = await _aggregate(tenant_id, b_from, b_to, group_by)

    a_map = {g["label"]: g for g in a_groups}
    b_map = {g["label"]: g for g in b_groups}

    # Union of labels — sorted by the *larger* of the two periods so the
    # tallest bar is at the top of the chart no matter which period it came
    # from.
    union_labels = list({*a_map.keys(), *b_map.keys()})

    def _key(label: str) -> float:
        return max(
            (a_map.get(label) or {}).get("revenue", 0),
            (b_map.get(label) or {}).get("revenue", 0),
        )

    union_labels.sort(key=_key, reverse=True)

    head = union_labels[:top_n]
    tail = union_labels[top_n:]
    rows = []
    for label in head:
        a_rev = (a_map.get(label) or {}).get("revenue", 0.0)
        b_rev = (b_map.get(label) or {}).get("revenue", 0.0)
        delta = b_rev - a_rev
        pct = ((delta / a_rev) * 100) if a_rev else (100.0 if b_rev else 0.0)
        rows.append({
            "label": label,
            "a_revenue": a_rev,
            "b_revenue": b_rev,
            "delta": delta,
            "delta_pct": round(pct, 1),
        })
    if tail:
        a_rev_t = sum((a_map.get(l) or {}).get("revenue", 0.0) for l in tail)
        b_rev_t = sum((b_map.get(l) or {}).get("revenue", 0.0) for l in tail)
        rows.append({
            "label": f"Others ({len(tail)})",
            "a_revenue": a_rev_t,
            "b_revenue": b_rev_t,
            "delta": b_rev_t - a_rev_t,
            "delta_pct": round(((b_rev_t - a_rev_t) / a_rev_t * 100) if a_rev_t else 0, 1),
            "is_others": True,
        })

    a_total = sum(g["revenue"] for g in a_groups)
    b_total = sum(g["revenue"] for g in b_groups)
    delta_total = b_total - a_total
    return {
        "period_a": {"year": period_a_year, "month": period_a_month, "from": a_from, "to": a_to, "total": a_total},
        "period_b": {"year": period_b_year, "month": period_b_month, "from": b_from, "to": b_to, "total": b_total},
        "delta": delta_total,
        "delta_pct": round(((delta_total / a_total) * 100) if a_total else (100.0 if b_total else 0.0), 1),
        "group_by": group_by,
        "rows": rows,
        "raw_group_count": len(union_labels),
    }
