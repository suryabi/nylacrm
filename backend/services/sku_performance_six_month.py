"""Rolling six-calendar-month SKU performance report builder."""

from collections import defaultdict
from datetime import datetime, timezone

from database import get_tenant_db
from routes.customer_invoice_overview import _account_distributors, _default_distributor, _distributor_cities, _month_keys
from services.sku_resolver import build_sku_resolver


MONTHS = 6


def _number(value) -> float:
    if value is None:
        return 0.0
    try:
        return float(str(value).replace("%", "").replace(",", "").strip())
    except (TypeError, ValueError):
        return 0.0


def _line_revenue(item: dict) -> float:
    if item.get("net_amount") is not None:
        return _number(item.get("net_amount"))
    if item.get("gross_amount") is not None:
        return _number(item.get("gross_amount"))
    quantity = _number(item.get("quantity"))
    rate = _number(item.get("rate") or item.get("unit_price"))
    discount = _number(item.get("discount_percent") or item.get("discount"))
    if discount > 100:
        discount /= 100.0
    return quantity * rate * max(0.0, 1.0 - discount / 100.0)


def _master_crate_capacity(master: dict) -> float:
    direct = _number(master.get("bottles_per_crate"))
    if direct > 0:
        return direct
    packages = (master.get("packaging_config") or {}).get("production") or []
    preferred = next((item for item in packages if item.get("is_default")), None) or (packages[0] if packages else None)
    return _number((preferred or {}).get("units") or (preferred or {}).get("units_per_package"))


def _line_crates(item: dict, quantity: float, fallback_capacity: float) -> float:
    stored = _number(item.get("crates"))
    if stored > 0:
        return stored
    capacity = _number(
        item.get("crate_capacity") or item.get("bottles_per_crate")
        or item.get("packaging_units") or item.get("units_per_package")
    ) or fallback_capacity
    return quantity / capacity if capacity > 0 else 0.0


def _account_for_invoice(invoice: dict, by_uuid: dict, by_code: dict, by_name: dict):
    for value in (invoice.get("account_uuid"), invoice.get("account_id"), invoice.get("account_id_from_mq")):
        if value:
            account = by_uuid.get(str(value)) or by_code.get(str(value))
            if account:
                return account
    name = (invoice.get("account_name") or invoice.get("customer_name") or "").strip().lower()
    return by_name.get(name) if name else None


async def build_sku_performance_six_month(
    current_user: dict,
    distributor_id: str | None = None,
    resource_id: str | None = None,
    sku: str | None = None,
    account_id: str | None = None,
) -> dict:
    tdb = get_tenant_db()
    today = datetime.now(timezone.utc).date()
    keys = _month_keys(today, MONTHS)
    labels = [datetime.strptime(key, "%Y-%m").strftime("%b %Y") for key in keys]
    first_day = f"{keys[0]}-01"
    last_day = today.isoformat()

    accounts = await tdb.accounts.find(
        {},
        {"_id": 0, "id": 1, "account_id": 1, "account_name": 1, "city": 1, "sales_owner_id": 1, "assigned_to": 1, "status": 1},
    ).to_list(10000)
    by_uuid = {str(row["id"]): row for row in accounts if row.get("id")}
    by_code = {str(row["account_id"]): row for row in accounts if row.get("account_id")}
    by_name = {(row.get("account_name") or "").strip().lower(): row for row in accounts if row.get("account_name")}
    account_ids = list(by_uuid)
    distributor_by_account = await _account_distributors(tdb, account_ids)

    distributors = await tdb.distributors.find(
        {"status": {"$in": ["active", None]}},
        {"_id": 0, "id": 1, "distributor_name": 1, "distributor_code": 1},
    ).sort("distributor_name", 1).to_list(2000)
    distributor_names = {row["id"]: row.get("distributor_name") or "Unknown" for row in distributors}

    def account_allowed(account: dict | None) -> bool:
        if account_id and (not account or account.get("id") != account_id):
            return False
        if resource_id and (
            not account or resource_id not in {account.get("sales_owner_id"), account.get("assigned_to")}
        ):
            return False
        if distributor_id:
            assigned = distributor_by_account.get((account or {}).get("id")) or {}
            if distributor_id == "unassigned":
                return not assigned.get("id")
            return assigned.get("id") == distributor_id
        return True

    masters = await tdb.master_skus.find({}, {"_id": 0}).to_list(2000)
    resolver = await build_sku_resolver(tdb)
    active_sku_names = set()
    capacity_by_name = {}
    for master in masters:
        name = master.get("sku_name") or master.get("sku") or master.get("name")
        if not name:
            continue
        if master.get("is_active", True):
            active_sku_names.add(name)
        capacity_by_name[name] = _master_crate_capacity(master)

    invoices = await tdb.invoices.find(
        {"invoice_date": {"$gte": first_day, "$lte": last_day}},
        {"_id": 0},
    ).to_list(100000)

    monthly = defaultdict(lambda: defaultdict(lambda: {"units": 0.0, "revenue": 0.0, "crates": 0.0}))
    account_rows = defaultdict(dict)
    sku_accounts = defaultdict(set)
    all_buying_accounts = set()
    invoice_seen = set()

    for invoice in invoices:
        month = str(invoice.get("invoice_date") or "")[:7]
        if month not in keys:
            continue
        account = _account_for_invoice(invoice, by_uuid, by_code, by_name)
        if not account_allowed(account):
            continue
        fallback_key = (
            invoice.get("account_id") or invoice.get("account_uuid") or invoice.get("account_id_from_mq")
            or (invoice.get("account_name") or invoice.get("customer_name") or "Unknown account").strip().lower()
        )
        account_key = (account or {}).get("id") or str(fallback_key)
        assigned = distributor_by_account.get((account or {}).get("id")) or {}
        touched = set()
        for item in invoice.get("items") or invoice.get("line_items") or []:
            sku_name = resolver.resolve(item)
            if not sku_name or (sku and sku != "all" and sku_name != sku):
                continue
            quantity = _number(item.get("quantity"))
            revenue = _line_revenue(item)
            crates = _line_crates(item, quantity, capacity_by_name.get(sku_name, 0))
            bucket = monthly[sku_name][month]
            bucket["units"] += quantity
            bucket["revenue"] += revenue
            bucket["crates"] += crates
            sku_accounts[sku_name].add(account_key)
            all_buying_accounts.add(account_key)

            row = account_rows[sku_name].setdefault(account_key, {
                "key": account_key,
                "account_uuid": (account or {}).get("id"),
                "name": (account or {}).get("account_name") or invoice.get("account_name") or invoice.get("customer_name") or str(account_key),
                "city": (account or {}).get("city"),
                "distributor_id": assigned.get("id"),
                "distributor_name": assigned.get("name") or "Unassigned",
                "units": 0.0,
                "revenue": 0.0,
                "crates": 0.0,
                "invoices": 0,
                "months": {key: {"units": 0.0, "revenue": 0.0} for key in keys},
            })
            row["units"] += quantity
            row["revenue"] += revenue
            row["crates"] += crates
            row["months"][month]["units"] += quantity
            row["months"][month]["revenue"] += revenue
            touch_key = (sku_name, account_key)
            if touch_key not in touched:
                row["invoices"] += 1
                touched.add(touch_key)
            invoice_key = (str(invoice.get("id") or invoice.get("invoice_no") or id(invoice)), sku_name)
            invoice_seen.add(invoice_key)

    if sku and sku != "all":
        sku_names = [sku]
    else:
        sku_names = sorted(active_sku_names | set(monthly))

    rows = []
    for sku_name in sku_names:
        month_rows = []
        total_units = total_revenue = total_crates = 0.0
        for key, label in zip(keys, labels):
            values = monthly[sku_name][key]
            month_row = {
                "key": key,
                "label": label,
                "current": key == keys[-1],
                "units": int(round(values["units"])),
                "revenue": round(values["revenue"], 2),
                "crates": round(values["crates"], 2),
            }
            total_units += values["units"]
            total_revenue += values["revenue"]
            total_crates += values["crates"]
            month_rows.append(month_row)

        accounts_for_sku = []
        for account in account_rows.get(sku_name, {}).values():
            accounts_for_sku.append({
                **account,
                "units": int(round(account["units"])),
                "revenue": round(account["revenue"], 2),
                "crates": round(account["crates"], 2),
                "units_pct": round(account["units"] / total_units * 100, 1) if total_units else 0,
                "months": [
                    {
                        "key": key,
                        "units": int(round(account["months"][key]["units"])),
                        "revenue": round(account["months"][key]["revenue"], 2),
                    }
                    for key in keys
                ],
            })
        accounts_for_sku.sort(key=lambda row: (-row["units"], -row["revenue"], row["name"].lower()))
        rows.append({
            "sku": sku_name,
            "months": month_rows,
            "units_sold": int(round(total_units)),
            "achieved_revenue": round(total_revenue, 2),
            "crates_sold": round(total_crates, 2),
            "accounts_count": len(sku_accounts.get(sku_name, set())),
            "accounts": accounts_for_sku,
            "current_month_units": month_rows[-1]["units"],
            "previous_month_units": month_rows[-2]["units"],
            "mom_units_change": month_rows[-1]["units"] - month_rows[-2]["units"],
            "current_month_revenue": month_rows[-1]["revenue"],
            "previous_month_revenue": month_rows[-2]["revenue"],
            "mom_revenue_change": round(month_rows[-1]["revenue"] - month_rows[-2]["revenue"], 2),
        })

    rows.sort(key=lambda row: (-row["achieved_revenue"], -row["units_sold"], row["sku"].lower()))
    total_units = sum(row["units_sold"] for row in rows)
    total_revenue = round(sum(row["achieved_revenue"] for row in rows), 2)
    total_crates = round(sum(row["crates_sold"] for row in rows), 2)
    for row in rows:
        row["units_pct"] = round(row["units_sold"] / total_units * 100, 1) if total_units else 0

    current_units = sum(row["current_month_units"] for row in rows)
    previous_units = sum(row["previous_month_units"] for row in rows)
    current_revenue = round(sum(row["current_month_revenue"] for row in rows), 2)
    previous_revenue = round(sum(row["previous_month_revenue"] for row in rows), 2)

    active_accounts = [row for row in accounts if row.get("status") in ("active", None)]
    filter_accounts = []
    for account in active_accounts:
        assigned = distributor_by_account.get(account.get("id")) or {}
        if distributor_id == "unassigned" and assigned.get("id"):
            continue
        if distributor_id and distributor_id != "unassigned" and assigned.get("id") != distributor_id:
            continue
        if resource_id and resource_id not in {account.get("sales_owner_id"), account.get("assigned_to")}:
            continue
        filter_accounts.append({
            "id": account["id"],
            "name": account.get("account_name") or "—",
            "sub": " · ".join(value for value in (account.get("account_id"), account.get("city")) if value),
        })
    filter_accounts.sort(key=lambda row: row["name"].lower())

    dist_cities = await _distributor_cities(tdb)
    default_rows = [
        {"account_id": account["id"], "distributor_id": (distributor_by_account.get(account["id"]) or {}).get("id")}
        for account in active_accounts
        if account["id"] in all_buying_accounts
    ]
    return {
        "months": [{"key": key, "label": label, "current": key == keys[-1]} for key, label in zip(keys, labels)],
        "period_label": f"{labels[0]} – {labels[-1]}",
        "skus": rows,
        "sku_options": sorted(active_sku_names | set(monthly)),
        "default_distributor_id": _default_distributor(current_user, default_rows, dist_cities),
        "filters": {
            "distributors": [{"id": row["id"], "name": row.get("distributor_name") or "Unknown", "code": row.get("distributor_code")} for row in distributors]
            + ([{"id": "unassigned", "name": "Unassigned"}] if any(not (distributor_by_account.get(row["id"]) or {}).get("id") for row in active_accounts) else []),
            "accounts": filter_accounts,
        },
        "summary": {
            "total_units": total_units,
            "total_crates": total_crates,
            "total_revenue": total_revenue,
            "active_skus": sum(1 for row in rows if row["units_sold"] or row["achieved_revenue"]),
            "total_accounts": len(all_buying_accounts),
            "current_month_units": current_units,
            "previous_month_units": previous_units,
            "mom_units_change": current_units - previous_units,
            "current_month_revenue": current_revenue,
            "previous_month_revenue": previous_revenue,
            "mom_revenue_change": round(current_revenue - previous_revenue, 2),
            "invoice_sku_pairs": len(invoice_seen),
        },
    }