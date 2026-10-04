"""Load a complete, isolated Customer Order Overview dataset in Preview.

Scenarios: six displayed months plus previous-month baseline, two distributors,
growth/decline/steady/sporadic/rebound/zero rows, and three accounts collapsed
into one Brand Group through two shared Child SKUs.

Usage:
  python3 backend/tests/seed_customer_order_overview_demo.py
  python3 backend/tests/seed_customer_order_overview_demo.py --clean
"""

from __future__ import annotations

import calendar
import pathlib
import sys
from datetime import date, datetime, timezone

from pymongo import MongoClient


TENANT = "nyla-air-water"
TAG = "SEED-COO-COMPLETE"


def _env() -> dict:
    values = {}
    for line in pathlib.Path("/app/backend/.env").read_text().splitlines():
        if "=" in line:
            key, value = line.split("=", 1)
            values[key] = value.strip().strip('"').strip("'")
    return values


config = _env()
db = MongoClient(config["MONGO_URL"])[config["DB_NAME"]]


def cleanup() -> dict:
    collections = [
        "distributor_delivery_items",
        "distributor_deliveries",
        "account_distributor_assignments",
        "child_skus",
        "brand_groups",
        "accounts",
        "distributor_locations",
        "distributors",
    ]
    return {
        collection: db[collection].delete_many({"tenant_id": TENANT, "seed_tag": TAG}).deleted_count
        for collection in collections
    }


if "--clean" in sys.argv:
    removed = cleanup()
    print("Cleaned Customer Order Overview demo data:", ", ".join(f"{name}={count}" for name, count in removed.items()))
    raise SystemExit(0)


# Idempotent refresh: replace only this script's tagged records, preserving every
# other Preview seed and all ordinary Preview records.
cleanup()

now = datetime.now(timezone.utc)
today = now.date()
now_iso = now.isoformat()


def add_months(value: date, amount: int) -> date:
    index = value.year * 12 + value.month - 1 + amount
    year, month0 = divmod(index, 12)
    return date(year, month0 + 1, 1)


months = [add_months(today.replace(day=1), offset) for offset in range(-6, 1)]


def delivery_day(month: date, sequence: int) -> date:
    preferred = 4 + sequence * 5
    last = calendar.monthrange(month.year, month.month)[1]
    if month.year == today.year and month.month == today.month:
        last = min(last, today.day)
    return month.replace(day=max(1, min(preferred, last)))


distributors = [
    {
        "id": "seed-coo-dist-north",
        "tenant_id": TENANT,
        "distributor_name": "COO Preview · Hyderabad Distributor",
        "distributor_code": "COO-HYD",
        "city": "Hyderabad",
        "state": "Telangana",
        "status": "active",
        "seed_tag": TAG,
        "created_at": now_iso,
        "updated_at": now_iso,
    },
    {
        "id": "seed-coo-dist-south",
        "tenant_id": TENANT,
        "distributor_name": "COO Preview · Bengaluru Distributor",
        "distributor_code": "COO-BLR",
        "city": "Bengaluru",
        "state": "Karnataka",
        "status": "active",
        "seed_tag": TAG,
        "created_at": now_iso,
        "updated_at": now_iso,
    },
]
db.distributors.insert_many(distributors)

locations = [
    {
        "id": "seed-coo-location-north",
        "tenant_id": TENANT,
        "distributor_id": distributors[0]["id"],
        "location_name": "COO Hyderabad Preview Warehouse",
        "city": "Hyderabad",
        "state": "Telangana",
        "status": "active",
        "seed_tag": TAG,
        "created_at": now_iso,
        "updated_at": now_iso,
    },
    {
        "id": "seed-coo-location-south",
        "tenant_id": TENANT,
        "distributor_id": distributors[1]["id"],
        "location_name": "COO Bengaluru Preview Warehouse",
        "city": "Bengaluru",
        "state": "Karnataka",
        "status": "active",
        "seed_tag": TAG,
        "created_at": now_iso,
        "updated_at": now_iso,
    },
]
db.distributor_locations.insert_many(locations)

account_specs = [
    ("group-a", "COO Preview · Aurora Hotel Hyderabad", "Hyderabad", "Telangana"),
    ("group-b", "COO Preview · Aurora Hotel Bengaluru", "Bengaluru", "Karnataka"),
    ("group-c", "COO Preview · Aurora Hotel Goa", "Panaji", "Goa"),
    ("growth", "COO Preview · Growth Account", "Hyderabad", "Telangana"),
    ("decline", "COO Preview · Declining Account", "Bengaluru", "Karnataka"),
    ("steady", "COO Preview · Steady Account", "Hyderabad", "Telangana"),
    ("sporadic", "COO Preview · Sporadic Account", "Bengaluru", "Karnataka"),
    ("rebound", "COO Preview · Rebound Account", "Hyderabad", "Telangana"),
    ("zero", "COO Preview · Zero Orders Account", "Pune", "Maharashtra"),
]
accounts = []
for index, (key, name, city, state) in enumerate(account_specs, start=1):
    accounts.append({
        "id": f"seed-coo-account-{key}",
        "tenant_id": TENANT,
        "account_id": f"COO-{index:03d}",
        "account_name": name,
        "city": city,
        "state": state,
        "category": "Preview Test Data",
        "status": "active",
        "seed_tag": TAG,
        "created_at": now_iso,
        "updated_at": now_iso,
    })
db.accounts.insert_many(accounts)
account_by_key = {key: account for (key, *_), account in zip(account_specs, accounts)}

assignments = []
assignment_map = {
    "group-a": 0,
    "group-b": 1,
    "group-c": 0,
    "growth": 0,
    "decline": 1,
    "steady": 0,
    "sporadic": 1,
    "rebound": 0,
}
for key, distributor_index in assignment_map.items():
    account = account_by_key[key]
    distributor = distributors[distributor_index]
    assignments.append({
        "id": f"seed-coo-assignment-{key}",
        "tenant_id": TENANT,
        "account_id": account["id"],
        "account_name": account["account_name"],
        "distributor_id": distributor["id"],
        "distributor_name": distributor["distributor_name"],
        "is_primary": True,
        "status": "active",
        "seed_tag": TAG,
        "created_at": now_iso,
        "updated_at": now_iso,
    })
db.account_distributor_assignments.insert_many(assignments)

group = {
    "id": "seed-coo-brand-group-aurora",
    "tenant_id": TENANT,
    "name": "COO Preview · Aurora Hospitality Group",
    "code": "COO-AURORA",
    "description": "Preview-only shared Child SKU grouping scenario",
    "account_ids": [account_by_key[key]["id"] for key in ("group-a", "group-b", "group-c")],
    "is_active": True,
    "seed_tag": TAG,
    "created_at": now_iso,
    "updated_at": now_iso,
    "created_by": "preview-seed",
}
db.brand_groups.insert_one(group)

sku_600 = db.master_skus.find_one({"id": "20d525e8-c4af-4f40-965a-549dcd50c0a9"}, {"_id": 0})
sku_330 = db.master_skus.find_one({"id": "b39203a7-4067-458b-a316-5831a98be946"}, {"_id": 0})
if not sku_600 or not sku_330:
    cleanup()
    raise RuntimeError("Required Nyla 600 ml / 330 ml master SKUs are missing")

shared_children = [
    {
        "id": "seed-coo-child-aurora-600",
        "tenant_id": TENANT,
        "parent_sku_id": sku_600["id"],
        "parent_sku_name": sku_600.get("sku_name"),
        "child_sku_name": "COO Preview · Aurora Shared 600 ml",
        "child_sku_code": "COO-AURORA-600",
        "child_type": "customer",
        "customer_account_id": None,
        "customer_account_name": None,
        "brand_group_id": group["id"],
        "brand_group_name": group["name"],
        "is_active": True,
        "seed_tag": TAG,
        "created_at": now_iso,
        "updated_at": now_iso,
        "created_by": "preview-seed",
    },
    {
        "id": "seed-coo-child-aurora-330",
        "tenant_id": TENANT,
        "parent_sku_id": sku_330["id"],
        "parent_sku_name": sku_330.get("sku_name"),
        "child_sku_name": "COO Preview · Aurora Shared 330 ml",
        "child_sku_code": "COO-AURORA-330",
        "child_type": "customer",
        "customer_account_id": None,
        "customer_account_name": None,
        "brand_group_id": group["id"],
        "brand_group_name": group["name"],
        "is_active": True,
        "seed_tag": TAG,
        "created_at": now_iso,
        "updated_at": now_iso,
        "created_by": "preview-seed",
    },
]
db.child_skus.insert_many(shared_children)

# Seven values per row: previous-month baseline + the six displayed months.
volumes = {
    "group-a": [240, 300, 360, 420, 480, 540, 600],
    "group-b": [144, 192, 216, 264, 288, 336, 360],
    "group-c": [96, 120, 144, 168, 192, 216, 240],
    "growth": [120, 240, 360, 480, 600, 720, 840],
    "decline": [840, 720, 600, 480, 360, 240, 120],
    "steady": [360, 360, 360, 360, 360, 360, 360],
    "sporadic": [120, 0, 240, 0, 360, 0, 480],
    "rebound": [600, 480, 360, 240, 120, 0, 600],
}
statuses = ["delivered", "complete", "completed"]
deliveries = []
items = []
for account_index, (key, monthly_values) in enumerate(volumes.items()):
    account = account_by_key[key]
    distributor_index = assignment_map[key]
    distributor = distributors[distributor_index]
    location = locations[distributor_index]
    for month_index, (month, bottles) in enumerate(zip(months, monthly_values)):
        if bottles == 0:
            continue
        delivered = delivery_day(month, account_index % 3)
        delivery_id = f"seed-coo-delivery-{key}-{month:%Y%m}"
        child = None
        sku = sku_600 if account_index % 2 == 0 else sku_330
        bottles_per_crate = int(sku.get("bottles_per_crate") or (12 if sku["id"] == sku_600["id"] else 24))
        if key in {"group-a", "group-b", "group-c"}:
            child = shared_children[0] if key != "group-b" else shared_children[1]
            sku = sku_600 if child["parent_sku_id"] == sku_600["id"] else sku_330
            bottles_per_crate = int(sku.get("bottles_per_crate") or (12 if sku["id"] == sku_600["id"] else 24))
        price = 30.0 if sku["id"] == sku_600["id"] else 22.0
        amount = round(bottles * price, 2)
        delivered_at = f"{delivered.isoformat()}T10:30:00+00:00"
        deliveries.append({
            "id": delivery_id,
            "tenant_id": TENANT,
            "delivery_number": f"COO-{key.upper()}-{month:%y%m}",
            "distributor_id": distributor["id"],
            "distributor_name": distributor["distributor_name"],
            "distributor_code": distributor["distributor_code"],
            "distributor_location_id": location["id"],
            "distributor_location_name": location["location_name"],
            "account_id": account["id"],
            "account_name": account["account_name"],
            "account_city": account["city"],
            "delivery_date": delivered.isoformat(),
            "delivered_at": delivered_at,
            "delivered_by": "preview-seed",
            "delivered_by_name": "COO Preview Seeder",
            "status": statuses[(account_index + month_index) % len(statuses)],
            "is_promo": False,
            "total_quantity": bottles,
            "total_gross_amount": amount,
            "total_net_amount": amount,
            "seed_tag": TAG,
            "created_at": delivered_at,
            "updated_at": delivered_at,
            "created_by": "preview-seed",
        })
        items.append({
            "id": f"seed-coo-item-{key}-{month:%Y%m}",
            "tenant_id": TENANT,
            "delivery_id": delivery_id,
            "sku_id": sku["id"],
            "sku_name": sku.get("sku_name"),
            "quantity": bottles,
            "unit_price": price,
            "customer_selling_price": price,
            "gross_amount": amount,
            "taxable_amount": amount,
            "tax_amount": 0.0,
            "net_amount": amount,
            "discount_percent": 0.0,
            "tax_percent": 0.0,
            "packaging_type_name": f"Crate-{bottles_per_crate}",
            "packaging_units": bottles_per_crate,
            "units_per_package": bottles_per_crate,
            "packages": bottles // bottles_per_crate,
            "child_sku_id": child["id"] if child else None,
            "child_sku_name": child["child_sku_name"] if child else None,
            "seed_tag": TAG,
            "created_at": delivered_at,
            "updated_at": delivered_at,
        })

db.distributor_deliveries.insert_many(deliveries)
db.distributor_delivery_items.insert_many(items)

displayed = months[1:]
print(f"Seeded complete Customer Order Overview data in Preview ({TAG})")
print(f"  {len(accounts)} accounts → 7 logical rows (1 shared group + 6 individual)")
print(f"  {len(deliveries)} completed Stock-Outs / {len(items)} item lines")
print(f"  2 distributors · displayed months {displayed[0]:%b %Y} – {displayed[-1]:%b %Y}")
print("  Scenarios: growth, decline, steady, sporadic, rebound, zero orders, shared Child SKU group")
print("  Remove later with: python3 backend/tests/seed_customer_order_overview_demo.py --clean")