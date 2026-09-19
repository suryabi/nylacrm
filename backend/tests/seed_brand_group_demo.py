"""Seed one demo Brand Group ("Demo Franchise Group") with two seeded CSD accounts,
a shared child SKU and 240 units of distributor stock so the Customer Stock Dashboard
group tile can be exercised. Idempotent. Run with --clean to remove."""
import os, re, sys, uuid, pathlib
from datetime import datetime, timezone
import requests
from pymongo import MongoClient

BASE = ""
for line in pathlib.Path("/app/frontend/.env").read_text().splitlines():
    m = re.match(r'REACT_APP_BACKEND_URL="?([^"]+)"?', line)
    if m:
        BASE = m.group(1).rstrip("/")
API = f"{BASE}/api"
env = {}
for line in pathlib.Path("/app/backend/.env").read_text().splitlines():
    if "=" in line:
        k, v = line.split("=", 1)
        env[k] = v.strip().strip('"')
db = MongoClient(env["MONGO_URL"])[env["DB_NAME"]]
TENANT = "nyla-air-water"
GROUP_NAME = "Demo Franchise Group"
CHILD_NAME = "Demo Franchise – 600 ml"
PARENT_SKU_ID = "20d525e8-c4af-4f40-965a-549dcd50c0a9"
ACCTS = ["seed-csd-acct-1", "seed-csd-acct-3"]
DIST_ID = "bb12d90e-4d33-4890-ac5f-17573c551b5c"
DIST_LOC = "aa2eda05-1902-4a17-92bb-d33533535297"
BATCH = "DEMO-BG"

if "--clean" in sys.argv:
    ch = db.child_skus.find_one({"tenant_id": TENANT, "child_sku_name": CHILD_NAME})
    if ch:
        db.distributor_stock.delete_many({"tenant_id": TENANT, "child_sku_id": ch["id"]})
        db.child_skus.delete_one({"id": ch["id"]})
    db.brand_groups.delete_many({"tenant_id": TENANT, "name": GROUP_NAME})
    print("cleaned")
    sys.exit(0)

tok = requests.post(f"{API}/auth/login", json={"email": "surya.yadavalli@nylaairwater.earth", "password": "test123"}).json()
tok = tok.get("session_token") or tok.get("token")
H = {"Authorization": f"Bearer {tok}", "X-Tenant-ID": TENANT}

g = db.brand_groups.find_one({"tenant_id": TENANT, "name": GROUP_NAME})
if not g:
    r = requests.post(f"{API}/brand-groups", headers=H, json={"name": GROUP_NAME, "code": "DFG", "account_ids": ACCTS})
    r.raise_for_status()
    g = r.json()
db.master_skus.update_one({"id": PARENT_SKU_ID}, {"$set": {"allows_child_skus": True}})
ch = db.child_skus.find_one({"tenant_id": TENANT, "child_sku_name": CHILD_NAME})
if not ch:
    r = requests.post(f"{API}/child-skus", headers=H, json={"parent_sku_id": PARENT_SKU_ID, "child_sku_name": CHILD_NAME,
                                                             "child_type": "customer", "brand_group_id": g["id"]})
    r.raise_for_status()
    ch = r.json()
if not db.distributor_stock.find_one({"tenant_id": TENANT, "child_sku_id": ch["id"], "batch_code": BATCH}):
    db.distributor_stock.insert_one({"id": str(uuid.uuid4()), "tenant_id": TENANT, "distributor_id": DIST_ID,
                                     "distributor_location_id": DIST_LOC, "sku_id": PARENT_SKU_ID, "child_sku_id": ch["id"],
                                     "batch_id": "demo-bg-batch", "batch_code": BATCH, "quantity": 240,
                                     "created_at": datetime.now(timezone.utc).isoformat()})
print("group", g["id"], "child", ch["id"])
