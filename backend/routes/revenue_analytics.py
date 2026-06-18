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

from database import get_tenant_db
from deps import get_current_user
from services.sku_resolver import build_sku_resolver

router = APIRouter()


def get_tdb():
    """Tenant-scoped DB handle (auto-injects tenant_id into every query),
    identical to what reports.py uses so analytics totals reconcile exactly
    with the trusted Revenue / Account-Performance reports."""
    return get_tenant_db()


GROUP_BY = Literal["city", "state", "territory", "business_category", "sku", "total"]


# ──────────────────────────────────────────────────────────────────────────
# Invoice value readers — handle BOTH internal (gross/net_invoice_value) and
# external/Zoho payload shapes (gross_amount / net_amount / grand_total …).
# Mirrors reports.py:_gross/_net so numbers match the existing reports.
# ──────────────────────────────────────────────────────────────────────────
def _gross(inv: dict) -> float:
    return float(
        inv.get("gross_invoice_value")
        or inv.get("gross_amount")
        or inv.get("grand_total")
        or inv.get("total_amount")
        or 0
    )


def _net(inv: dict) -> float:
    v = inv.get("net_invoice_value")
    if v is None:
        v = inv.get("net_amount")
    if v is not None:
        return float(v)
    return _gross(inv) - float(inv.get("credit_note_value") or inv.get("credit_note") or 0)


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
        return (account or {}).get("category") or (account or {}).get("business_category") or (account or {}).get("lead_business_category") or "Uncategorised"
    if group_by == "total":
        return "Total"
    return "Unknown"


async def _aggregate(
    from_date: str,
    to_date: str,
    group_by: str,
) -> list[dict]:
    """Group invoice revenue over [from_date, to_date]. Tenant scoping is
    automatic via get_tdb(). Returns `[{label, revenue, gross, count}]` sorted
    by net revenue descending. `revenue` == net (post-credit-note) value, which
    is the figure the Account-Performance report headlines."""
    tdb = get_tdb()
    invoice_query = {"invoice_date": {"$gte": from_date, "$lte": to_date}}
    invoices = await tdb.invoices.find(invoice_query, {"_id": 0}).to_list(20000)

    if group_by == "sku":
        # Code-first resolution + sku_aliases so historical line items with
        # stale names / retired codes consolidate under the current SKU.
        resolver = await build_sku_resolver(tdb)
        groups: dict[str, dict] = {}
        for inv in invoices:
            for it in (inv.get("items") or []):
                label = resolver.resolve(it) or "Uncategorised"
                # Line revenue: prefer an explicit line total, else qty * rate.
                try:
                    line_rev = it.get("net_amount")
                    if line_rev is None:
                        line_rev = it.get("line_total")
                    if line_rev is None:
                        line_rev = it.get("gross_amount")
                    if line_rev is None:
                        qty = float(it.get("quantity") or 0)
                        rate = float(
                            it.get("customer_selling_price")
                            or it.get("unit_price")
                            or it.get("rate")
                            or 0
                        )
                        line_rev = qty * rate
                    line_rev = float(line_rev or 0)
                except (TypeError, ValueError):
                    line_rev = 0.0
                grp = groups.setdefault(label, {"label": label, "revenue": 0.0, "gross": 0.0, "count": 0})
                grp["revenue"] += line_rev
                grp["gross"] += line_rev
                grp["count"] += 1
        return sorted(groups.values(), key=lambda g: g.get("gross", 0), reverse=True)

    # ── Account-attribute group-bys (city / state / territory / category) ──
    # Load every account once into lookup maps, then match each invoice the
    # same way the Account-Performance report does.
    accounts = await tdb.accounts.find(
        {},
        {"_id": 0, "id": 1, "account_id": 1, "account_name": 1,
         "city": 1, "state": 1, "territory": 1,
         "category": 1, "business_category": 1, "lead_business_category": 1},
    ).to_list(5000)
    by_code = {a.get("account_id"): a for a in accounts if a.get("account_id")}
    by_uuid = {a.get("id"): a for a in accounts if a.get("id")}
    by_name = {(a.get("account_name") or "").strip().lower(): a for a in accounts if a.get("account_name")}

    groups: dict[str, dict] = {}
    for inv in invoices:
        acc = None
        acc_field = inv.get("account_id") or inv.get("account_uuid")
        if acc_field:
            acc = by_code.get(acc_field) or by_uuid.get(acc_field)
        if not acc:
            nm = (inv.get("account_name") or inv.get("customer_name") or "").strip().lower()
            if nm:
                acc = by_name.get(nm)
        label = _group_label(acc or {}, group_by)
        net = _net(inv)
        gross = _gross(inv)
        grp = groups.setdefault(label, {"label": label, "revenue": 0.0, "gross": 0.0, "count": 0})
        grp["revenue"] += net
        grp["gross"] += gross
        grp["count"] += 1
    return sorted(groups.values(), key=lambda g: g.get("gross", 0), reverse=True)


async def _window_totals(from_date: str, to_date: str) -> tuple[float, float, int]:
    """Headline totals for a time window, computed from the INVOICES themselves
    (not from the grouped breakdown) so Gross / Net / Invoice-count are identical
    regardless of the `group_by` dimension. Returns (gross, net, invoice_count)."""
    tdb = get_tdb()
    invoices = await tdb.invoices.find(
        {"invoice_date": {"$gte": from_date, "$lte": to_date}},
        {"_id": 0, "gross_invoice_value": 1, "gross_amount": 1, "grand_total": 1,
         "total_amount": 1, "net_invoice_value": 1, "net_amount": 1,
         "credit_note_value": 1, "credit_note": 1},
    ).to_list(20000)
    total_gross = sum(_gross(inv) for inv in invoices)
    total_net = sum(_net(inv) for inv in invoices)
    return total_gross, total_net, len(invoices)


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
    fd, td = _window(time_filter, from_date, to_date)
    groups = await _aggregate(fd, td, group_by)

    # Roll groups beyond `top_n` into a single "Others" bucket so the bar
    # chart doesn't degrade visually with 100 SKUs.
    head = groups[:top_n]
    tail = groups[top_n:]
    if tail:
        head.append({
            "label": f"Others ({len(tail)})",
            "revenue": sum(g["revenue"] for g in tail),
            "gross": sum(g.get("gross", 0) for g in tail),
            "count": sum(g["count"] for g in tail),
            "is_others": True,
        })

    total_revenue = sum(g["revenue"] for g in groups)
    total_gross = sum(g.get("gross", 0) for g in groups)
    total_count = sum(g["count"] for g in groups)
    # Headline KPIs are computed from the invoices in the window — INDEPENDENT of
    # group_by — so Gross / Net / Invoice-count never change when you switch the
    # breakdown dimension. (group_by only re-slices the breakdown above.) The
    # per-group sums above remain for the breakdown chart/table only.
    headline_gross, headline_net, headline_count = await _window_totals(fd, td)
    return {
        "from": fd,
        "to": td,
        "time_filter": time_filter,
        "group_by": group_by,
        "groups": head,
        "raw_group_count": len(groups),
        "total_revenue": headline_net,
        "total_gross": headline_gross,
        "total_invoice_count": headline_count,
        # Sum of the breakdown rows (differs from the headline for SKU, which is
        # product-line revenue ex-tax) — kept for debugging/reconciliation.
        "breakdown_gross": total_gross,
        "breakdown_revenue": total_revenue,
        "breakdown_count": total_count,
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
    a_from, a_to = _month_window(period_a_year, period_a_month)
    b_from, b_to = _month_window(period_b_year, period_b_month)

    a_groups = await _aggregate(a_from, a_to, group_by)
    b_groups = await _aggregate(b_from, b_to, group_by)

    a_map = {g["label"]: g for g in a_groups}
    b_map = {g["label"]: g for g in b_groups}

    # Union of labels — sorted by the *larger* of the two periods so the
    # tallest bar is at the top of the chart no matter which period it came
    # from.
    union_labels = list({*a_map.keys(), *b_map.keys()})

    def _key(label: str) -> float:
        return max(
            (a_map.get(label) or {}).get("gross", 0),
            (b_map.get(label) or {}).get("gross", 0),
        )

    union_labels.sort(key=_key, reverse=True)

    head = union_labels[:top_n]
    tail = union_labels[top_n:]
    rows = []
    for label in head:
        a_rev = (a_map.get(label) or {}).get("gross", 0.0)
        b_rev = (b_map.get(label) or {}).get("gross", 0.0)
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
        a_rev_t = sum((a_map.get(lbl) or {}).get("gross", 0.0) for lbl in tail)
        b_rev_t = sum((b_map.get(lbl) or {}).get("gross", 0.0) for lbl in tail)
        rows.append({
            "label": f"Others ({len(tail)})",
            "a_revenue": a_rev_t,
            "b_revenue": b_rev_t,
            "delta": b_rev_t - a_rev_t,
            "delta_pct": round(((b_rev_t - a_rev_t) / a_rev_t * 100) if a_rev_t else 0, 1),
            "is_others": True,
        })

    a_total = sum(g.get("gross", 0) for g in a_groups)
    b_total = sum(g.get("gross", 0) for g in b_groups)
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


# ──────────────────────────────────────────────────────────────────────────
# Revenue reconciliation — bridges the Revenue-Analytics headline GROSS (full
# invoice totals) to the SKU-Performance "Achieved" figure (product line-item
# revenue). They legitimately differ by tax/charges + invoices that carry no
# SKU line items (e.g. External Billing Entries). This returns the exact bridge
# over the SAME invoice window the Revenue-Analytics page uses.
# ──────────────────────────────────────────────────────────────────────────
def _rec_parse_num(v) -> float:
    if v is None:
        return 0.0
    try:
        return float(str(v).replace('%', '').replace(',', '').strip())
    except (TypeError, ValueError):
        return 0.0


def _skuperf_line_value(item: dict) -> float:
    """Identical to reports.py get_sku_performance._line_value so the
    reconciliation's product-line revenue matches the SKU-Performance total."""
    if item.get('net_amount') is not None:
        return _rec_parse_num(item.get('net_amount'))
    if item.get('gross_amount') is not None:
        return _rec_parse_num(item.get('gross_amount'))
    qty = _rec_parse_num(item.get('quantity'))
    rate = _rec_parse_num(item.get('rate'))
    disc = _rec_parse_num(item.get('discount_percent') or item.get('discount'))
    if disc > 100:
        disc = disc / 100.0
    return qty * rate * max(0.0, 1.0 - disc / 100.0)


@router.get("/reports/revenue-reconciliation")
async def revenue_reconciliation(
    time_filter: str = "this_month",
    from_date: Optional[str] = None,
    to_date: Optional[str] = None,
    _user: dict = Depends(get_current_user),
):
    """Bridge Revenue-Analytics GROSS → SKU-Performance product-line revenue:

        Gross  =  Product line revenue (SKU Perf)
                + Tax & other charges
                + Invoices without SKU line items
                + Lines without a SKU identifier
        Net    =  Gross − Credit notes

    Also surfaces how much product-line revenue is still attributed to
    unmapped/old SKU names (a subset of product line revenue) so it can link to
    the SKU Aliases tool. Computed over the same invoice window the
    Revenue-Analytics headline uses, so `gross`/`net` match it exactly.
    """
    fd, td = _window(time_filter, from_date, to_date)
    tdb = get_tdb()
    resolver = await build_sku_resolver(tdb)
    invoices = await tdb.invoices.find(
        {"invoice_date": {"$gte": fd, "$lte": td}}, {"_id": 0}
    ).to_list(20000)

    gross_total = net_total = 0.0
    product = tax_charges = no_item = unidentified = 0.0
    no_item_count = 0
    unmapped_rev = 0.0
    unmapped_keys: set = set()

    for inv in invoices:
        g = _gross(inv)
        gross_total += g
        net_total += _net(inv)
        items = inv.get("items") or inv.get("line_items") or []
        if not items:
            no_item += g
            no_item_count += 1
            continue
        all_line = 0.0
        resolvable_line = 0.0
        for it in items:
            if not isinstance(it, dict):
                continue
            lv = _skuperf_line_value(it)
            all_line += lv
            if resolver.resolve(it):
                resolvable_line += lv
            uk = resolver.unmapped_key(it)
            if uk:
                unmapped_rev += lv
                unmapped_keys.add(f"{uk[0]}::{uk[1]}")
        product += resolvable_line
        unidentified += (all_line - resolvable_line)
        tax_charges += (g - all_line)

    credit_notes = gross_total - net_total
    return {
        "from": fd,
        "to": td,
        "time_filter": time_filter,
        "invoice_count": len(invoices),
        "gross": round(gross_total, 2),
        "net": round(net_total, 2),
        "credit_notes": round(credit_notes, 2),
        "product_line_revenue": round(product, 2),
        "tax_and_charges": round(tax_charges, 2),
        "invoices_without_sku_lines": round(no_item, 2),
        "invoices_without_sku_lines_count": no_item_count,
        "unidentified_line_revenue": round(unidentified, 2),
        "unmapped_line_revenue": round(unmapped_rev, 2),
        "unmapped_identifier_count": len(unmapped_keys),
    }
