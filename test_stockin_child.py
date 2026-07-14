"""E2E test: branded child SKU carried through Stock In (shipment) pipeline."""
import asyncio, os, sys, uuid, requests
from dotenv import load_dotenv

load_dotenv('/app/backend/.env')
API = [l.split('=', 1)[1].strip() for l in open('/app/frontend/.env') if l.startswith('REACT_APP_BACKEND_URL')][0]
TENANT = "nyla-air-water"

from motor.motor_asyncio import AsyncIOMotorClient

async def seed():
    client = AsyncIOMotorClient(os.environ['MONGO_URL'])
    db = client[os.environ['DB_NAME']]
    wh = await db.distributor_locations.find_one({"tenant_id": TENANT, "is_factory": True, "track_batches": True, "status": "active"}, {"_id": 0, "id": 1, "location_name": 1})
    dist = await db.distributors.find_one({"tenant_id": TENANT}, {"_id": 0, "id": 1, "distributor_name": 1})
    loc = await db.distributor_locations.find_one({"tenant_id": TENANT, "distributor_id": dist["id"], "is_factory": {"$ne": True}, "status": "active"}, {"_id": 0, "id": 1, "location_name": 1})
    sku = await db.master_skus.find_one({}, {"_id": 0, "id": 1, "sku_name": 1})
    sku["name"] = sku.get("sku_name")
    # create a test child sku (customer branded)
    child_id = f"test-child-{uuid.uuid4().hex[:8]}"
    acct = await db.accounts.find_one({"tenant_id": TENANT}, {"_id": 0, "id": 1, "account_name": 1})
    await db.child_skus.insert_one({"id": child_id, "tenant_id": TENANT, "parent_sku_id": sku["id"],
        "child_sku_name": "TEST BrandedCo 1L", "child_type": "customer",
        "customer_account_id": (acct or {}).get("id"), "is_active": True})
    # create a batch + branded factory stock row
    batch_id = f"test-batch-{uuid.uuid4().hex[:8]}"
    await db.production_batches.insert_one({"id": batch_id, "tenant_id": TENANT, "sku_id": sku["id"],
        "batch_code": "TB-CHILD-01", "total_bottles": 500, "production_date": "2026-06-01",
        "created_at": "2026-06-01T00:00:00Z", "status": "completed",
        "target_child_sku_id": child_id, "target_child_sku_name": "TEST BrandedCo 1L"})
    await db.factory_warehouse_stock.insert_one({"id": str(uuid.uuid4()), "tenant_id": TENANT,
        "warehouse_location_id": wh["id"], "sku_id": sku["id"], "sku_name": sku["name"],
        "batch_id": batch_id, "batch_code": "TB-CHILD-01", "child_sku_id": child_id,
        "child_sku_name": "TEST BrandedCo 1L", "quantity": 500, "created_at": "2026-06-01T00:00:00Z"})
    client.close()
    return wh, dist, loc, sku, child_id, batch_id

async def check_dist_stock(dist_id, loc_id, sku_id, batch_id, child_id):
    client = AsyncIOMotorClient(os.environ['MONGO_URL'])
    db = client[os.environ['DB_NAME']]
    row = await db.distributor_stock.find_one({"tenant_id": TENANT, "distributor_id": dist_id,
        "distributor_location_id": loc_id, "sku_id": sku_id, "batch_id": batch_id, "child_sku_id": child_id}, {"_id": 0})
    fac = await db.factory_warehouse_stock.find_one({"tenant_id": TENANT, "batch_id": batch_id, "child_sku_id": child_id}, {"_id": 0, "quantity": 1})
    client.close()
    return row, fac

async def cleanup(child_id, batch_id, ship_id):
    client = AsyncIOMotorClient(os.environ['MONGO_URL'])
    db = client[os.environ['DB_NAME']]
    await db.child_skus.delete_one({"id": child_id})
    await db.production_batches.delete_one({"id": batch_id})
    await db.factory_warehouse_stock.delete_many({"batch_id": batch_id})
    await db.distributor_stock.delete_many({"batch_id": batch_id})
    if ship_id:
        await db.distributor_shipments.delete_one({"id": ship_id})
        await db.distributor_shipment_items.delete_many({"shipment_id": ship_id})
    client.close()

wh, dist, loc, sku, child_id, batch_id = asyncio.run(seed())
print(f"Seeded: wh={wh['location_name']}, dist={dist['distributor_name']}, sku={sku['name']}, child={child_id}, batch={batch_id}")

tok = requests.post(f"{API}/api/auth/login", json={"email": "surya.yadavalli@nylaairwater.earth", "password": "test123"}, headers={"X-Tenant-ID": TENANT}).json()
H = {"Authorization": f"Bearer {tok['session_token']}", "X-Tenant-ID": TENANT}

ship_id = None
try:
    # 1) batches-available must return branded row with child fields
    r = requests.get(f"{API}/api/distributor/stock-transfers/batches-available", params={"location_id": wh["id"], "sku_id": sku["id"]}, headers=H).json()
    branded = [b for b in r.get("batches", []) if b.get("batch_id") == batch_id]
    assert branded and branded[0].get("child_sku_id") == child_id and branded[0].get("child_sku_name") == "TEST BrandedCo 1L", f"batches-available missing child: {branded}"
    print("1. PASS batches-available returns child_sku fields")

    # 2) production-batches must return target child fields
    r = requests.get(f"{API}/api/distributor/stock-transfers/production-batches", params={"sku_id": sku["id"]}, headers=H).json()
    pb = [b for b in r.get("batches", []) if b.get("batch_id") == batch_id]
    assert pb and pb[0].get("child_sku_id") == child_id, f"production-batches missing child: {pb}"
    print("2. PASS production-batches returns child_sku fields")

    # 3) create shipment with branded line
    payload = {"distributor_id": dist["id"], "distributor_location_id": loc["id"], "source_warehouse_id": wh["id"],
        "shipment_date": "2026-06-18", "gst_percent": 0,
        "items": [{"sku_id": sku["id"], "sku_name": sku["name"], "quantity": 100, "unit_price": 10.0,
                   "batch_id": batch_id, "batch_code": "TB-CHILD-01", "child_sku_id": child_id}]}
    r = requests.post(f"{API}/api/distributors/{dist['id']}/shipments", json=payload, headers=H)
    assert r.status_code == 200, f"create failed {r.status_code}: {r.text[:300]}"
    ship = r.json(); ship_id = ship["id"]
    assert ship["items"][0].get("child_sku_id") == child_id and ship["items"][0].get("child_sku_name") == "TEST BrandedCo 1L", f"item missing child: {ship['items'][0]}"
    print(f"3. PASS shipment {ship['shipment_number']} created, item carries child SKU")

    # 4) confirm — must deduct the BRANDED factory row
    r = requests.post(f"{API}/api/distributors/{dist['id']}/shipments/{ship_id}/confirm", headers=H)
    assert r.status_code == 200, f"confirm failed {r.status_code}: {r.text[:300]}"
    _, fac = asyncio.run(check_dist_stock(dist["id"], loc["id"], sku["id"], batch_id, child_id))
    assert fac and fac["quantity"] == 400, f"factory branded row expected 400, got {fac}"
    print("4. PASS confirm deducted branded factory row (500→400)")

    # 5) dispatch + deliver — distributor stock must carry the child classification
    requests.post(f"{API}/api/distributors/{dist['id']}/shipments/{ship_id}/dispatch", headers=H)
    r = requests.post(f"{API}/api/distributors/{dist['id']}/shipments/{ship_id}/deliver", headers=H)
    assert r.status_code == 200, f"deliver failed {r.status_code}: {r.text[:300]}"
    row, _ = asyncio.run(check_dist_stock(dist["id"], loc["id"], sku["id"], batch_id, child_id))
    assert row and row["quantity"] == 100 and row.get("child_sku_name") == "TEST BrandedCo 1L", f"dist stock branded row wrong: {row}"
    print("5. PASS delivered: distributor stock row is branded (qty=100, child carried)")

    # 6) reverse — branded rows restored/removed
    r = requests.post(f"{API}/api/distributors/{dist['id']}/shipments/{ship_id}/reverse", params={"acknowledge": "true"}, headers=H)
    assert r.status_code == 200, f"reverse failed {r.status_code}: {r.text[:300]}"
    row, fac = asyncio.run(check_dist_stock(dist["id"], loc["id"], sku["id"], batch_id, child_id))
    assert fac and fac["quantity"] == 500, f"factory branded row expected 500 after reverse, got {fac}"
    assert row and row["quantity"] == 0, f"dist branded row expected 0 after reverse, got {row}"
    print("6. PASS reverse restored branded factory row and zeroed distributor branded row")
    print("\nALL TESTS PASSED")
finally:
    asyncio.run(cleanup(child_id, batch_id, ship_id))
    print("Cleaned up test data")
