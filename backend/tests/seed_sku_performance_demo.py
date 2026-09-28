"""Seed demo invoices (current month + previous month) across many accounts and
SKUs so SKU Performance's Accounts (N) popup and the Customer Invoice Overview
have realistic data in Preview. Idempotent (fixed ids). --clean removes."""
import sys, pathlib, random
from datetime import datetime, timezone, timedelta
from pymongo import MongoClient

env = {}
for line in pathlib.Path("/app/backend/.env").read_text().splitlines():
    if "=" in line:
        k, v = line.split("=", 1)
        env[k] = v.strip().strip('"')
db = MongoClient(env["MONGO_URL"])[env["DB_NAME"]]
TENANT, TAG = "nyla-air-water", "SEED-SKUP"

if "--clean" in sys.argv:
    n = db.invoices.delete_many({"tenant_id": TENANT, "seed_tag": TAG}).deleted_count
    print(f"cleaned {n} invoices")
    sys.exit(0)

SKUS = [  # external code, rate/bottle, bottles per crate
    ("B660", 38.0, 12), ("A330", 68.0, 24), ("A660", 114.0, 12), ("S330", 72.0, 24), ("B330", 26.0, 24),
]
accounts = list(db.accounts.find({"tenant_id": TENANT, "status": {"$in": ["active", None]}},
                                 {"_id": 0, "id": 1, "account_id": 1, "account_name": 1}))
accounts = [a for a in accounts if a.get("account_name")]
rng = random.Random(42)
today = datetime.now(timezone.utc).date()
first_this = today.replace(day=1)
last_prev = first_this - timedelta(days=1)
first_prev = last_prev.replace(day=1)
now_iso = datetime.now(timezone.utc).isoformat()

created = 0
for ai, acc in enumerate(accounts):
    # ~80% of accounts buy this month, ~70% last month; volumes vary so the popup ranks nicely
    for label, start, end, chance in (("cur", first_this, today, 0.8), ("prev", first_prev, last_prev, 0.7)):
        if rng.random() > chance:
            continue
        n_inv = rng.choice([1, 1, 2])
        for k in range(n_inv):
            span = max(0, (end - start).days)
            day = start + timedelta(days=rng.randint(0, span))
            picks = rng.sample(SKUS, rng.choice([1, 2, 2, 3]))
            items, gross_total, net_total = [], 0.0, 0.0
            for code, rate, bpc in picks:
                crates = rng.choice([2, 3, 5, 8, 10, 15, 20, 30])
                qty = crates * bpc
                disc = rng.choice([0, 0, 5, 10, 18.03])
                gross = round(qty * rate, 2)
                net = round(gross * (1 - disc / 100), 2)
                gross_total += gross
                net_total += net
                items.append({"external_item_id": code, "external_sku_id": code, "sku_id": None, "sku_name": None,
                              "quantity": float(qty), "crates": float(crates), "crate_capacity": float(bpc), "rate": rate,
                              "discount_percent": disc, "gross_amount": gross, "discount_amount": round(gross - net, 2),
                              "net_amount": net, "line_total": net, "batch_number": f"B{day.strftime('%y%m')}-{rng.randint(100, 999)}",
                              "expiry_date": None, "matched": False})
            inv_id = f"SEED-{label.upper()}-{ai:03d}-{k}"
            db.invoices.update_one({"id": inv_id}, {"$set": {
                "id": inv_id, "invoice_no": inv_id, "invoice_date": day.isoformat(),
                "gross_invoice_value": round(gross_total, 2), "net_invoice_value": round(net_total, 2), "credit_note_value": 0.0,
                "outstanding": round(net_total, 2), "account_id": acc.get("account_id"), "account_uuid": acc["id"],
                "account_name": acc["account_name"], "tenant_id": TENANT, "source": "seed", "seed_tag": TAG,
                "line_items_net_total": round(net_total, 2), "status": "matched", "items": items,
                "created_at": now_iso, "updated_at": now_iso, "created_by": "seed", "updated_by": "seed"}}, upsert=True)
            created += 1
print(f"seeded {created} invoices for {len(accounts)} accounts · months {first_prev:%b %Y} + {first_this:%b %Y}. Remove with --clean.")
