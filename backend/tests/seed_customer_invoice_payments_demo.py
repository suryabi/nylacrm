"""Load complete Customer Invoice Overview payment history in Preview.

The script creates report-safe, account-tagged accounting transactions for all
active accounts with invoice activity in the rolling six-month window. It does
NOT modify account outstanding balances. Records are isolated by seed_tag.

Usage:
  python3 backend/tests/seed_customer_invoice_payments_demo.py
  python3 backend/tests/seed_customer_invoice_payments_demo.py --clean
"""

from __future__ import annotations

import calendar
import pathlib
import sys
from collections import defaultdict
from datetime import date, datetime, timezone

from pymongo import MongoClient


TENANT = "nyla-air-water"
TAG = "SEED-CIO-PAYMENTS-COMPLETE"
ORG_ID = "seed-cio-payments-preview-org"


def _env() -> dict:
    values = {}
    for line in pathlib.Path("/app/backend/.env").read_text().splitlines():
        if "=" in line:
            key, value = line.split("=", 1)
            values[key] = value.strip().strip('"').strip("'")
    return values


config = _env()
db = MongoClient(config["MONGO_URL"])[config["DB_NAME"]]


def cleanup() -> int:
    return db.accounting_transactions.delete_many({"tenant_id": TENANT, "seed_tag": TAG}).deleted_count


if "--clean" in sys.argv:
    print(f"Removed {cleanup()} complete Customer Invoice payment demo transactions.")
    raise SystemExit(0)


cleanup()
now = datetime.now(timezone.utc)
today = now.date()
now_iso = now.isoformat()


def month_keys(value: date, count: int = 6) -> list[str]:
    year, month = value.year, value.month
    result = []
    for _ in range(count):
        result.append(f"{year:04d}-{month:02d}")
        month -= 1
        if month == 0:
            year -= 1
            month = 12
    return result[::-1]


def previous_month(key: str) -> str:
    year, month = map(int, key.split("-"))
    month -= 1
    if month == 0:
        year -= 1
        month = 12
    return f"{year:04d}-{month:02d}"


def payment_date(key: str, account_index: int, part: int = 0) -> str:
    year, month = map(int, key.split("-"))
    maximum = calendar.monthrange(year, month)[1]
    if year == today.year and month == today.month:
        maximum = min(maximum, today.day)
    preferred = 4 + (account_index % 3) * 6 + part * 2
    return f"{key}-{max(1, min(preferred, maximum)):02d}"


def gross(invoice: dict) -> float:
    try:
        return float(
            invoice.get("gross_invoice_value") or invoice.get("gross_amount")
            or invoice.get("grand_total") or invoice.get("total_amount") or 0
        )
    except (TypeError, ValueError):
        return 0.0


keys = month_keys(today)
baseline_key = previous_month(keys[0])
first_date = f"{keys[0]}-01"
last_date = today.isoformat()

accounts = list(db.accounts.find(
    {"tenant_id": TENANT, "status": {"$in": ["active", None]}},
    {"_id": 0, "id": 1, "account_id": 1, "account_name": 1},
))
by_uuid = {account["id"]: account for account in accounts if account.get("id")}
by_code = {account["account_id"]: account for account in accounts if account.get("account_id")}
by_name = {(account.get("account_name") or "").strip().lower(): account for account in accounts if account.get("account_name")}

invoice_totals = defaultdict(float)
for invoice in db.invoices.find(
    {"tenant_id": TENANT, "invoice_date": {"$gte": first_date, "$lte": last_date}},
    {"_id": 0, "account_id": 1, "account_uuid": 1, "account_name": 1, "customer_name": 1,
     "gross_invoice_value": 1, "gross_amount": 1, "grand_total": 1, "total_amount": 1},
):
    ref = invoice.get("account_id") or invoice.get("account_uuid")
    account = (by_code.get(ref) or by_uuid.get(ref)) if ref else None
    if not account:
        account = by_name.get((invoice.get("account_name") or invoice.get("customer_name") or "").strip().lower())
    if account:
        invoice_totals[account["id"]] += gross(invoice)

invoiced_accounts = sorted(
    [by_uuid[account_id] for account_id, amount in invoice_totals.items() if amount > 0 and account_id in by_uuid],
    key=lambda account: (account.get("account_name") or "").lower(),
)
if not invoiced_accounts:
    raise RuntimeError("No active invoiced Preview accounts were found in the six-month window")

patterns = [
    ("full", [1.0, 1.0, 1.0, 1.0, 1.0, 1.0], 1.0, 1),
    ("partial", [0.45, 0.55, 0.50, 0.60, 0.55, 0.50], 0.40, 1),
    ("delayed", [0.0, 0.90, 0.0, 1.10, 0.80, 1.20], 0.70, 1),
    ("multiple", [1.0, 1.0, 1.0, 1.0, 1.0, 1.0], 1.0, 2),
    ("increasing", [0.35, 0.50, 0.65, 0.80, 1.00, 1.20], 0.20, 1),
    ("declining", [1.20, 1.00, 0.80, 0.65, 0.50, 0.35], 1.35, 1),
    ("intermittent", [1.0, 0.0, 0.75, 0.0, 1.10, 0.0], 0.0, 1),
    ("zero", [0.0, 0.0, 0.0, 0.0, 0.0, 0.0], 0.0, 1),
]

documents = []
scenario_manifest = []


def add_payment(account: dict, scenario: str, key: str, amount: float, account_index: int, serial: int, part: int = 0):
    if amount <= 0:
        return
    reference = account.get("account_id") if (account_index + serial + part) % 2 else account["id"]
    transaction_id = f"seed-cio-pay-{account_index:02d}-{key.replace('-', '')}-{serial}-{part}"
    day = payment_date(key, account_index, part)
    documents.append({
        "id": transaction_id,
        "tenant_id": TENANT,
        "seed_tag": TAG,
        "seed_scenario": scenario,
        "zoho_org_id": ORG_ID,
        "zoho_transaction_id": transaction_id,
        "source": "preview_payment_seed",
        "txn_code": f"CIO-PAY-{account_index + 1:02d}-{key.replace('-', '')}-{serial}{part}",
        "date": day,
        "amount": round(amount, 2),
        "currency": "INR",
        "direction": "credit",
        "status": "tagged",
        "payment_status": "posted",
        "zoho_status": "categorized",
        "zoho_transaction_type": "customer_payment",
        "account_id": reference,
        "account_name": account.get("account_name"),
        "description": f"Preview payment demo · {scenario}",
        "account_adjustment": {
            "applied": True,
            "amount": round(amount, 2),
            "account_id": reference,
            "applied_at": f"{day}T10:00:00+00:00",
            "applied_by": "preview-payment-seed",
            "balance_untouched_for_seed": True,
        },
        "seed_balance_untouched": True,
        "created_at": f"{day}T10:00:00+00:00",
        "updated_at": f"{day}T10:00:00+00:00",
    })


for account_index, account in enumerate(invoiced_accounts):
    scenario, multipliers, baseline_multiplier, parts = patterns[account_index % len(patterns)]
    base = round(invoice_totals[account["id"]] / 6.0, 2)
    expected_total = 0.0
    serial = 0
    if baseline_multiplier:
        baseline_amount = round(base * baseline_multiplier, 2)
        if parts == 2:
            add_payment(account, scenario, baseline_key, baseline_amount * 0.4, account_index, serial, 0)
            add_payment(account, scenario, baseline_key, baseline_amount * 0.6, account_index, serial, 1)
        else:
            add_payment(account, scenario, baseline_key, baseline_amount, account_index, serial)
        serial += 1
    for key, multiplier in zip(keys, multipliers):
        amount = round(base * multiplier, 2)
        if amount <= 0:
            continue
        if parts == 2:
            add_payment(account, scenario, key, amount * 0.4, account_index, serial, 0)
            add_payment(account, scenario, key, amount * 0.6, account_index, serial, 1)
        else:
            add_payment(account, scenario, key, amount, account_index, serial)
        expected_total += amount
        serial += 1
    scenario_manifest.append({
        "account": account.get("account_name"),
        "account_id": account["id"],
        "scenario": scenario,
        "invoice_total": round(invoice_totals[account["id"]], 2),
        "payment_total": round(expected_total, 2),
    })

# Deliberately invalid controls prove report exclusions without affecting balances.
control_account = invoiced_accounts[0]
control_ref = control_account["id"]
for index, (label, overrides) in enumerate([
    ("cancelled", {"status": "cancelled"}),
    ("refunded", {"payment_status": "refunded"}),
    ("reversed", {"reversed": True}),
    ("deleted", {"is_deleted": True}),
    ("debit", {"direction": "debit"}),
]):
    transaction_id = f"seed-cio-pay-control-{label}"
    documents.append({
        "id": transaction_id,
        "tenant_id": TENANT,
        "seed_tag": TAG,
        "seed_scenario": f"excluded_{label}",
        "zoho_org_id": ORG_ID,
        "zoho_transaction_id": transaction_id,
        "source": "preview_payment_seed",
        "date": payment_date(keys[-1], 0, index),
        "amount": 999999.0 + index,
        "currency": "INR",
        "direction": "credit",
        "status": "tagged",
        "payment_status": "posted",
        "zoho_status": "categorized",
        "zoho_transaction_type": "customer_payment",
        "account_id": control_ref,
        "account_name": control_account.get("account_name"),
        "account_adjustment": {
            "applied": True,
            "amount": 999999.0 + index,
            "account_id": control_ref,
            "balance_untouched_for_seed": True,
        },
        "seed_balance_untouched": True,
        "created_at": now_iso,
        "updated_at": now_iso,
        **overrides,
    })

if documents:
    db.accounting_transactions.insert_many(documents)

scenario_counts = defaultdict(int)
for row in scenario_manifest:
    scenario_counts[row["scenario"]] += 1
valid_documents = [row for row in documents if not str(row.get("seed_scenario", "")).startswith("excluded_")]
print(f"Seeded complete Customer Invoice payment history in Preview ({TAG})")
print(f"  {len(invoiced_accounts)} invoiced accounts covered · {len(valid_documents)} valid payment transactions · 5 excluded controls")
print(f"  Window: {keys[0]} through {keys[-1]} + baseline {baseline_key}")
print("  Scenarios:", ", ".join(f"{name}={scenario_counts[name]}" for name, *_ in patterns))
print(f"  Valid displayed payment total: ₹{sum(row['payment_total'] for row in scenario_manifest):,.2f}")
print("  Account outstanding balances were NOT changed.")
print("  Remove later with: python3 backend/tests/seed_customer_invoice_payments_demo.py --clean")