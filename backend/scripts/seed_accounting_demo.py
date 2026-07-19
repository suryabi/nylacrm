"""Seed demo accounting transactions for the Accounting Dashboard (preview only).
Idempotent: wipes previous demo rows (demo_seed=True) then re-inserts.
Run: cd /app/backend && python3 scripts/seed_accounting_demo.py
"""
import asyncio
import os
import random
import sys
import uuid
from datetime import date, timedelta, datetime, timezone

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
from dotenv import load_dotenv

load_dotenv(os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), ".env"))
from motor.motor_asyncio import AsyncIOMotorClient

TENANT = "nyla-air-water"
BANKS = [
    {"id": "demo-bank-hdfc", "name": "HDFC Current A/C ••4321"},
    {"id": "demo-bank-icici", "name": "ICICI Operations A/C ••8765"},
]

# (leaf expense category name, payee/vendor, amount range, monthly frequency)
EXPENSE_PLAN = [
    ("Glass Bottles", "Borosil Glassworks Pvt Ltd", (80000, 220000), 2),
    ("Caps", "SealTight Closures", (15000, 45000), 1),
    ("Labels", "PrintPack Labels India", (12000, 35000), 1),
    ("Crates", "Nilkamal Plastics", (20000, 60000), 1),
    ("Electricity", "TSSPDCL", (45000, 90000), 1),
    ("Diesel", "Indian Oil Fuel Station", (18000, 40000), 2),
    ("Freight", "SafeXpress Logistics", (25000, 80000), 2),
    ("Transportation", "BlueDart Surface", (10000, 30000), 2),
    ("Fuel", "HP Fuel Station", (8000, 22000), 3),
    ("Google Ads", "Google India", (30000, 90000), 1),
    ("Meta Ads", "Meta Platforms", (25000, 70000), 1),
    ("Events", "EventWorks Hyderabad", (40000, 150000), 0.5),
    ("Printing", "Sri Venkateshwara Printers", (8000, 25000), 1),
    ("Sales Commission", "Sales Team Payout", (35000, 90000), 1),
    ("Samples", "Sample Dispatch", (5000, 18000), 1),
    ("Factory Maintenance", "Krishna Engineering Works", (15000, 50000), 0.7),
    ("Water", "HMWSSB", (6000, 15000), 1),
    ("Minerals", "AquaMinerals Supply Co", (20000, 55000), 1),
    ("Chemicals", "ChemPure Industries", (10000, 30000), 0.7),
    ("Sponsorships", "Hyderabad Marathon", (50000, 200000), 0.25),
]

INCOME_PLAN = [
    ("Bottled Water Sales", "Empire Restaurant Group", (150000, 600000), 3),
    ("Bottled Water Sales", "Novotel Hyderabad", (100000, 400000), 2),
    ("Distributor Margins", "Brian Distributors", (80000, 300000), 2),
    ("AWG Unit Sales", "Corporate Client Payment", (200000, 800000), 0.6),
    ("Installation Charges", "AWG Installation Receipt", (15000, 50000), 0.8),
    ("Bank Interest", "HDFC Bank Interest", (2000, 9000), 1),
    ("Scrap Sales", "Scrap Buyer", (3000, 12000), 0.4),
]


async def main():
    c = AsyncIOMotorClient(os.environ["MONGO_URL"])
    db = c[os.environ["DB_NAME"]]
    coll = db["accounting_transactions"]

    removed = await coll.delete_many({"tenant_id": TENANT, "demo_seed": True})
    print(f"Removed {removed.deleted_count} previous demo rows")

    cats = {}
    async for m in db["accounting_masters"].find(
        {"tenant_id": TENANT, "master_type": {"$in": ["expense_category", "income_category", "expense_type", "payment_source"]}},
        {"_id": 0, "id": 1, "name": 1, "master_type": 1},
    ):
        cats.setdefault(m["master_type"], {})[m["name"]] = m["id"]
    exp = cats.get("expense_category", {})
    inc = cats.get("income_category", {})
    opex = cats.get("expense_type", {}).get("Operating Expense (OPEX)")
    cogs = cats.get("expense_type", {}).get("COGS (Cost of Goods Sold)")
    bank_transfer = cats.get("payment_source", {}).get("Bank Transfer")

    # Ensure demo vendors exist
    vendor_ids = {}
    for _, payee, _, _ in EXPENSE_PLAN:
        existing = await db["accounting_vendors"].find_one({"tenant_id": TENANT, "name": payee}, {"_id": 0, "id": 1})
        if existing:
            vendor_ids[payee] = existing["id"]
        else:
            vid = str(uuid.uuid4())
            await db["accounting_vendors"].insert_one({
                "id": vid, "tenant_id": TENANT, "name": payee, "demo_seed": True,
                "created_at": datetime.now(timezone.utc).isoformat(),
            })
            vendor_ids[payee] = vid

    random.seed(42)
    today = date.today()
    start = date(2025, 4, 1)
    docs = []
    seq = 1

    def month_iter():
        d = date(start.year, start.month, 1)
        while d <= today:
            yield d
            d = date(d.year + (d.month // 12), (d.month % 12) + 1, 1)

    now = datetime.now(timezone.utc).isoformat()
    for m0 in month_iter():
        days_in_month = ((date(m0.year + (m0.month // 12), (m0.month % 12) + 1, 1) - timedelta(days=1)).day)
        # growth factor so recent months look bigger
        growth = 1.0 + 0.05 * ((m0.year - 2025) * 12 + m0.month - 4)

        def add(direction, cat_id, extra_tags, payee, lo, hi, vendor=None):
            nonlocal seq
            day = min(random.randint(1, days_in_month), (today - m0).days + 1 if m0.month == today.month and m0.year == today.year else days_in_month)
            d = date(m0.year, m0.month, max(1, day))
            if d > today:
                d = today
            amount = round(random.uniform(lo, hi) * growth, 2)
            untagged = random.random() < 0.12
            tags = {}
            if not untagged and cat_id:
                tags = {("income_category" if direction == "credit" else "expense_category"): cat_id}
                tags.update(extra_tags)
            doc = {
                "id": str(uuid.uuid4()), "tenant_id": TENANT, "demo_seed": True,
                "zoho_org_id": "demo-org", "zoho_transaction_id": f"demo-{seq}",
                "txn_code": f"TXN-D{seq:04d}",
                "amount": amount, "currency": "INR", "date": d.strftime("%Y-%m-%d"),
                "direction": direction, "direction_override": None,
                "status": "untagged" if untagged else "tagged",
                "zoho_status": "uncategorized" if untagged else "categorized",
                "zoho_transaction_type": "deposit" if direction == "credit" else "expense",
                "payee": payee,
                "reference_number": f"DEMO/{d.strftime('%y%m')}/{seq:04d}",
                "description": f"{payee} — {d.strftime('%b %Y')}",
                "bank_account_name": None, "zoho_account_id": None,
                "tags": tags,
                "vendor_id": (vendor if not untagged else None),
                "vendor_name": (payee if vendor and not untagged else None),
                "account_id": None, "account_name": None, "account_adjustment": None,
                "bills_pending": (direction == "debit" and random.random() < 0.07),
                "proofs": [], "notes": None, "tagged_by": None, "tagged_at": None,
                "created_at": now, "updated_at": now,
            }
            bank = random.choice(BANKS)
            doc["zoho_account_id"] = bank["id"]
            doc["bank_account_name"] = bank["name"]
            docs.append(doc)
            seq += 1

        for cat_name, payee, (lo, hi), freq in EXPENSE_PLAN:
            cid = exp.get(cat_name)
            if not cid:
                continue
            n = int(freq) + (1 if random.random() < (freq % 1) else 0)
            etype = cogs if cat_name in ("Glass Bottles", "Caps", "Labels", "Crates", "Minerals", "Chemicals") else opex
            extra = {k: v for k, v in (("expense_type", etype), ("payment_source", bank_transfer)) if v}
            for _ in range(n):
                add("debit", cid, extra, payee, lo, hi, vendor=vendor_ids.get(payee))

        for cat_name, payee, (lo, hi), freq in INCOME_PLAN:
            cid = inc.get(cat_name)
            if not cid:
                continue
            n = int(freq) + (1 if random.random() < (freq % 1) else 0)
            for _ in range(n):
                add("credit", cid, {}, payee, lo, hi)

    await coll.insert_many(docs)
    print(f"Inserted {len(docs)} demo transactions ({start} → {today})")


if __name__ == "__main__":
    asyncio.run(main())
