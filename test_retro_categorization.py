"""E2E test: retrospective categorization (Stock In / Transfer / Stock Out)."""
import asyncio, os, uuid, requests
from dotenv import load_dotenv

load_dotenv('/app/backend/.env')
API = [l.split('=', 1)[1].strip() for l in open('/app/frontend/.env') if l.startswith('REACT_APP_BACKEND_URL')][0]
TENANT = "nyla-air-water"

from motor.motor_asyncio import AsyncIOMotorClient

def client_db():
    c = AsyncIOMotorClient(os.environ['MONGO_URL'])
    return c, c[os.environ['DB_NAME']]

TAG = "retrotest"

async def seed():
    c, db = client_db()
    sku = await db.master_skus.find_one({}, {"_id": 0, "id": 1, "sku_name": 1})
    wh = await db.distributor_locations.find_one({"tenant_id": TENANT, "is_factory": True, "track_batches": True, "status": "active"}, {"_id": 0, "id": 1, "location_name": 1})
    dist = await db.distributors.find_one({"tenant_id": TENANT}, {"_id": 0, "id": 1, "distributor_name": 1})
    loc = await db.distributor_locations.find_one({"tenant_id": TENANT, "distributor_id": dist["id"], "is_factory": {"$ne": True}, "status": "active"}, {"_id": 0, "id": 1, "location_name": 1})
    acct = await db.accounts.find_one({"tenant_id": TENANT}, {"_id": 0, "id": 1, "account_name": 1})
    other_acct = await db.accounts.find_one({"tenant_id": TENANT, "id": {"$ne": acct["id"]}}, {"_id": 0, "id": 1})
    child_id = f"{TAG}-child-1"
    await db.child_skus.insert_one({"id": child_id, "tenant_id": TENANT, "parent_sku_id": sku["id"],
        "child_sku_name": "RETRO BrandedCo", "child_sku_code": "RETRO-01", "child_type": "customer",
        "customer_account_id": acct["id"], "customer_account_name": acct.get("account_name"), "is_active": True})
    # child for a DIFFERENT account (negative test on delivery)
    child2_id = f"{TAG}-child-2"
    await db.child_skus.insert_one({"id": child2_id, "tenant_id": TENANT, "parent_sku_id": sku["id"],
        "child_sku_name": "RETRO OtherCo", "child_type": "customer",
        "customer_account_id": (other_acct or {}).get("id", "none"), "is_active": True})
    batch_id = f"{TAG}-batch-1"
    await db.production_batches.insert_one({"id": batch_id, "tenant_id": TENANT, "sku_id": sku["id"],
        "batch_code": "RETRO-B1", "total_bottles": 1000, "production_date": "2026-05-01",
        "created_at": "2026-05-01T00:00:00Z", "status": "completed"})
    # generic factory stock for the batch
    await db.factory_warehouse_stock.insert_one({"id": str(uuid.uuid4()), "tenant_id": TENANT,
        "warehouse_location_id": wh["id"], "sku_id": sku["id"], "sku_name": sku["sku_name"],
        "batch_id": batch_id, "batch_code": "RETRO-B1", "child_sku_id": None,
        "quantity": 1000, "created_at": "2026-05-01T00:00:00Z"})
    c.close()
    return {"sku": sku, "wh": wh, "dist": dist, "loc": loc, "acct": acct,
            "child_id": child_id, "child2_id": child2_id, "batch_id": batch_id}

async def seed_delivery(ctx):
    c, db = client_db()
    did = f"{TAG}-del-1"
    await db.distributor_deliveries.insert_one({"id": did, "tenant_id": TENANT,
        "delivery_number": "DEL-RETRO-1", "distributor_id": ctx["dist"]["id"],
        "distributor_location_id": ctx["loc"]["id"], "account_id": ctx["acct"]["id"],
        "account_name": ctx["acct"].get("account_name"), "status": "delivered",
        "delivery_date": "2026-06-01", "created_at": "2026-06-01T00:00:00Z"})
    iid = f"{TAG}-delitem-1"
    await db.distributor_delivery_items.insert_one({"id": iid, "tenant_id": TENANT,
        "delivery_id": did, "sku_id": ctx["sku"]["id"], "sku_name": ctx["sku"]["sku_name"],
        "quantity": 120, "packaging_units": 12, "packages": 10, "unit_price": 20.0,
        "gross_amount": 2400.0, "discount_amount": 0.0, "taxable_amount": 2400.0,
        "tax_amount": 0.0, "net_amount": 2400.0, "margin_amount": 240.0,
        "child_sku_id": None, "batch_id": None})
    c.close()
    return did, iid

async def seed_transfer(ctx):
    c, db = client_db()
    tid = f"{TAG}-tr-1"
    await db.distributor_stock_transfers.insert_one({"id": tid, "tenant_id": TENANT,
        "transfer_number": "ST-RETRO-1", "status": "completed",
        "source_location_id": ctx["wh"]["id"], "dest_location_id": ctx["loc"]["id"],
        "dest_distributor_id": ctx["dist"]["id"],
        "items": [{"sku_id": ctx["sku"]["id"], "sku_name": ctx["sku"]["sku_name"],
                   "packaging_type_name": "Crate - 12", "units_per_package": 12,
                   "quantity": 20, "quantity_units": 240, "batch_id": None, "batch_code": None,
                   "child_sku_id": None, "child_sku_name": None, "rate": 100.0, "line_total": 2000.0}],
        "total_packages": 20, "total_units": 240, "total_value": 2000.0,
        "created_at": "2026-06-01T00:00:00Z"})
    # generic stock at dest to be moved (only 180 of 240 remain)
    await db.distributor_stock.insert_one({"id": str(uuid.uuid4()), "tenant_id": TENANT,
        "distributor_id": ctx["dist"]["id"], "distributor_location_id": ctx["loc"]["id"],
        "sku_id": ctx["sku"]["id"], "sku_name": ctx["sku"]["sku_name"], "batch_id": None,
        "child_sku_id": None, "quantity": 180, "created_at": "2026-06-01T00:00:00Z"})
    c.close()
    return tid

async def q(coll, flt, proj=None):
    c, db = client_db()
    r = await getattr(db, coll).find({**flt}, {"_id": 0, **(proj or {})}).to_list(50)
    c.close()
    return r

async def cleanup():
    c, db = client_db()
    await db.child_skus.delete_many({"id": {"$regex": f"^{TAG}"}})
    await db.production_batches.delete_many({"id": {"$regex": f"^{TAG}"}})
    await db.factory_warehouse_stock.delete_many({"batch_id": {"$regex": f"^{TAG}"}})
    await db.distributor_stock.delete_many({"$or": [{"batch_id": {"$regex": f"^{TAG}"}}, {"child_sku_id": {"$regex": f"^{TAG}"}}]})
    ships = await db.distributor_shipments.find({"tenant_id": TENANT, "reference_number": TAG}, {"_id": 0, "id": 1}).to_list(20)
    for s in ships:
        await db.distributor_shipments.delete_one({"id": s["id"]})
        await db.distributor_shipment_items.delete_many({"shipment_id": s["id"]})
    await db.distributor_deliveries.delete_many({"id": {"$regex": f"^{TAG}"}})
    await db.distributor_delivery_items.delete_many({"id": {"$regex": f"^{TAG}"}})
    await db.distributor_delivery_items.delete_many({"delivery_id": {"$regex": f"^{TAG}"}})
    await db.distributor_stock_transfers.delete_many({"id": {"$regex": f"^{TAG}"}})
    await db.branding_entries.delete_many({"notes": {"$regex": "RETRO|ST-RETRO|Stock In SHP"}, "source": "retro_categorization"})
    # clean generic dest rows we seeded
    await db.distributor_stock.delete_many({"tenant_id": TENANT, "created_at": "2026-06-01T00:00:00Z"})
    c.close()

ctx = asyncio.run(seed())
sku, wh, dist, loc, acct = ctx["sku"], ctx["wh"], ctx["dist"], ctx["loc"], ctx["acct"]
print(f"Seeded: sku={sku['sku_name']} wh={wh['location_name']} dist={dist['distributor_name']} acct={acct['account_name']}")

login = requests.post(f"{API}/api/auth/login", json={"email": "surya.yadavalli@nylaairwater.earth", "password": "test123"}, headers={"X-Tenant-ID": TENANT}).json()
H = {"Authorization": f"Bearer {login['session_token']}", "X-Tenant-ID": TENANT}

passed, failed = [], []
def check(name, cond, detail=""):
    (passed if cond else failed).append(name)
    print(("PASS" if cond else "FAIL"), name, detail if not cond else "")

try:
    # ── 1) eligible-children ──
    r = requests.get(f"{API}/api/retro-categorize/eligible-children", params={"sku_id": sku["id"]}, headers=H).json()
    ids = {c["id"] for c in r.get("children", [])}
    check("1a eligible-children (no account) includes both", ctx["child_id"] in ids and ctx["child2_id"] in ids, str(r))
    r = requests.get(f"{API}/api/retro-categorize/eligible-children", params={"sku_id": sku["id"], "account_id": acct["id"]}, headers=H).json()
    ids = {c["id"] for c in r.get("children", [])}
    check("1b eligible-children (account scoped)", ids == {ctx["child_id"]}, str(r))

    # ── 2) Stock In retro (partial split + stock move) ──
    payload = {"distributor_id": dist["id"], "distributor_location_id": loc["id"], "source_warehouse_id": wh["id"],
        "shipment_date": "2026-06-15", "gst_percent": 0, "reference_number": TAG,
        "items": [{"sku_id": sku["id"], "sku_name": sku["sku_name"], "quantity": 240, "unit_price": 10.0,
                   "packaging_units": 12, "packages": 20, "batch_id": ctx["batch_id"], "batch_code": "RETRO-B1"}]}
    ship = requests.post(f"{API}/api/distributors/{dist['id']}/shipments", json=payload, headers=H).json()
    ship_id = ship["id"]; item_id = ship["items"][0]["id"]
    requests.post(f"{API}/api/distributors/{dist['id']}/shipments/{ship_id}/confirm", headers=H)
    requests.post(f"{API}/api/distributors/{dist['id']}/shipments/{ship_id}/dispatch", headers=H)
    rr = requests.post(f"{API}/api/distributors/{dist['id']}/shipments/{ship_id}/deliver", headers=H)
    check("2a shipment created+delivered (generic)", rr.status_code == 200, rr.text[:200])

    # categorize 120 of 240 (partial → split)
    r = requests.post(f"{API}/api/retro-categorize/shipment-item", json={
        "distributor_id": dist["id"], "shipment_id": ship_id, "item_id": item_id,
        "child_sku_id": ctx["child_id"], "quantity": 120}, headers=H)
    d = r.json() if r.status_code == 200 else {}
    check("2b shipment categorize 200 + split", r.status_code == 200 and d.get("split") is True, r.text[:300])
    check("2c stock moved 120 + BRD entry", d.get("stock_moved_units") == 120 and d.get("branding_entry_number"), str(d))
    items = asyncio.run(q("distributor_shipment_items", {"shipment_id": ship_id}))
    tot = sum(i["quantity"] for i in items)
    branded = [i for i in items if i.get("child_sku_id") == ctx["child_id"]]
    generic = [i for i in items if not i.get("child_sku_id")]
    check("2d line split preserves total (240)", tot == 240 and len(items) == 2, str([(i['quantity'], i.get('child_sku_id')) for i in items]))
    check("2e branded line 120 + audit", branded and branded[0]["quantity"] == 120 and branded[0].get("retro_categorized") is True
          and branded[0].get("gross_amount") == 1200.0 and generic[0].get("gross_amount") == 1200.0, str(branded))
    rows = asyncio.run(q("distributor_stock", {"tenant_id": TENANT, "distributor_location_id": loc["id"], "sku_id": sku["id"], "batch_id": ctx["batch_id"]}))
    gq = sum(x["quantity"] for x in rows if not x.get("child_sku_id"))
    bq = sum(x["quantity"] for x in rows if x.get("child_sku_id") == ctx["child_id"])
    check("2f dest stock: 120 generic / 120 branded", gq == 120 and bq == 120, str(rows))

    # already-categorized line rejected
    r = requests.post(f"{API}/api/retro-categorize/shipment-item", json={
        "distributor_id": dist["id"], "shipment_id": ship_id, "item_id": branded[0]["id"],
        "child_sku_id": ctx["child_id"]}, headers=H)
    check("2g re-categorize blocked (400)", r.status_code == 400, r.text[:200])

    # ── 3) Stock Out retro (relabel only, account-scoped) ──
    del_id, del_item = asyncio.run(seed_delivery(ctx))
    # wrong-account child rejected
    r = requests.post(f"{API}/api/retro-categorize/delivery-item", json={
        "distributor_id": dist["id"], "delivery_id": del_id, "item_id": del_item,
        "child_sku_id": ctx["child2_id"]}, headers=H)
    check("3a wrong-account child rejected (400)", r.status_code == 400, r.text[:200])
    # full-line categorize
    r = requests.post(f"{API}/api/retro-categorize/delivery-item", json={
        "distributor_id": dist["id"], "delivery_id": del_id, "item_id": del_item,
        "child_sku_id": ctx["child_id"]}, headers=H)
    d = r.json() if r.status_code == 200 else {}
    check("3b delivery categorize full line, no stock move", r.status_code == 200 and d.get("split") is False and d.get("stock_moved_units") == 0, r.text[:300])
    it = asyncio.run(q("distributor_delivery_items", {"id": del_item}))[0]
    check("3c delivery item relabeled, qty/amounts intact", it.get("child_sku_id") == ctx["child_id"] and it["quantity"] == 120 and it["net_amount"] == 2400.0, str(it))

    # ── 4) Transfer retro (partial split, stock move capped at 180 avail) ──
    tr_id = asyncio.run(seed_transfer(ctx))
    r = requests.post(f"{API}/api/retro-categorize/transfer-item", json={
        "transfer_id": tr_id, "item_index": 0, "child_sku_id": ctx["child_id"], "quantity": 240}, headers=H)
    d = r.json() if r.status_code == 200 else {}
    check("4a transfer categorize full line", r.status_code == 200 and d.get("split") is False, r.text[:300])
    # FIFO sweep: 180 seeded no-batch generic + 60 of the 120 generic batch units left by step 2 = 240
    check("4b stock move swept 240 across generic rows", d.get("stock_moved_units") == 240 and d.get("branding_entry_number"), str(d))
    tr = asyncio.run(q("distributor_stock_transfers", {"id": tr_id}))[0]
    check("4c transfer item relabeled, totals intact", tr["items"][0].get("child_sku_id") == ctx["child_id"]
          and tr["total_units"] == 240 and tr["items"][0]["quantity_units"] == 240, str(tr["items"]))
    rows = asyncio.run(q("distributor_stock", {"tenant_id": TENANT, "distributor_location_id": loc["id"], "sku_id": sku["id"], "batch_id": None}))
    gq = sum(x["quantity"] for x in rows if not x.get("child_sku_id"))
    bq = sum(x["quantity"] for x in rows if x.get("child_sku_id") == ctx["child_id"])
    check("4d dest no-batch stock: 0 generic / 180 branded", gq == 0 and bq == 180, str(rows))
    rows = asyncio.run(q("distributor_stock", {"tenant_id": TENANT, "distributor_location_id": loc["id"], "sku_id": sku["id"], "batch_id": ctx["batch_id"]}))
    gq = sum(x["quantity"] for x in rows if not x.get("child_sku_id"))
    bq = sum(x["quantity"] for x in rows if x.get("child_sku_id") == ctx["child_id"])
    check("4e dest batch stock: 60 generic / 180 branded (batch lineage kept)", gq == 60 and bq == 180, str(rows))

    # ── 5) RBAC — non-admin role blocked ──
    l2 = requests.post(f"{API}/api/auth/login", json={"email": "creative.director@nylaairwater.earth", "password": "test123"}, headers={"X-Tenant-ID": TENANT}).json()
    if l2.get("session_token"):
        H2 = {"Authorization": f"Bearer {l2['session_token']}", "X-Tenant-ID": TENANT}
        r = requests.post(f"{API}/api/retro-categorize/delivery-item", json={
            "distributor_id": dist["id"], "delivery_id": del_id, "item_id": del_item,
            "child_sku_id": ctx["child_id"]}, headers=H2)
        check("5a non-admin blocked (403)", r.status_code == 403, f"{r.status_code} {r.text[:150]}")
    else:
        print("SKIP 5a (creative director login failed)")

    print(f"\n{'ALL TESTS PASSED' if not failed else 'FAILURES: ' + str(failed)} ({len(passed)} passed, {len(failed)} failed)")
finally:
    asyncio.run(cleanup())
    print("Cleaned up test data")
