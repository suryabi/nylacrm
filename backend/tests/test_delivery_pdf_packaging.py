"""
Iteration 227 — verifies the packaging fix in routes/distributor_delivery_schedules.py:
  • Promo / DO lines that carry their own packaging_type_name (e.g. "Bottle (1)" with
    units_per_package=1) must keep that packaging on the delivery bundle PDF and the
    per-challan PDF — NOT be silently converted to the SKU's default "Crate".

We exercise two code paths in routes/distributor_delivery_schedules.py:
  - _enrich_schedule item loop (~line 528-564) — bundle items use line packaging when set.
  - Crate-total aggregation (~line 718-728) — totals respect line packaging_type_name.

And the HTTP endpoints:
  - GET /api/distributor/delivery-schedules/{schedule_id}/pdf  → bundle PDF
  - GET /api/distributors/{distributor_id}/promo-deliveries/{dispatch_id}/challan-pdf

Strategy: insert temporary "qa-bottle-" seed documents in Mongo, hit the endpoints over
the public REACT_APP_BACKEND_URL with the CEO session, validate the PDF bytes and the
internal enrichment, then clean up.
"""
import os
import asyncio
import datetime as dt
import uuid
import pytest
import requests
from dotenv import load_dotenv

load_dotenv("/app/backend/.env")
load_dotenv("/app/frontend/.env")
BASE_URL = os.environ["REACT_APP_BACKEND_URL"].rstrip("/")
TENANT = "nyla-air-water"
DIST_ID = "99fb55dc-532c-4e85-b618-6b8a5e552c04"   # "Test" distributor (per test_credentials.md)
DIST_ID_BRIAN = "bb12d90e-4d33-4890-ac5f-17573c551b5c"
SKU_ID = "ee1e5f58-5509-4691-ae93-d3e3badc3442"     # Nyla – 660 ml / Sparkling (master_skus)


@pytest.fixture(scope="module")
def session():
    s = requests.Session()
    r = s.post(f"{BASE_URL}/api/auth/login",
               json={"email": "surya.yadavalli@nylaairwater.earth", "password": "test123"},
               timeout=20)
    assert r.status_code == 200, f"login failed {r.status_code}: {r.text[:200]}"
    body = r.json()
    tok = body.get("access_token") or body.get("token")
    if tok:
        s.headers["Authorization"] = f"Bearer {tok}"
    s.headers["X-Tenant-ID"] = TENANT
    return s


@pytest.fixture(scope="module")
def motor_db():
    """Build a Motor client lazily inside each test's own loop."""
    from motor.motor_asyncio import AsyncIOMotorClient
    def _factory():
        client = AsyncIOMotorClient(os.environ["MONGO_URL"])
        return client, client[os.environ["DB_NAME"]]
    return _factory


# -------------------------------------------------------------------------- seed
async def _seed_promo_with_bottle(db, qid_prefix):
    """Insert a promo delivery + 1 line item with packaging_type_name='Bottle' upp=1."""
    delivery_id = f"{qid_prefix}-promo"
    item_id = f"{qid_prefix}-item"
    today = dt.datetime.utcnow().isoformat()
    promo_doc = {
        "id": delivery_id, "tenant_id": TENANT, "distributor_id": DIST_ID,
        "is_promo": True, "status": "confirmed",
        "recipient_type": "contact", "delivery_number": f"DC-QA-{qid_prefix[-4:]}",
        "delivery_date": today,
        "delivery_address": "MG Road, Bengaluru, Karnataka 560001",
        "contact_address": "MG Road, Bengaluru, Karnataka 560001",
        "recipient_shipping_address": {"line1": "MG Road", "city": "Bengaluru",
                                       "state": "Karnataka", "pincode": "560001"},
        "created_at": today, "subtotal": 100.0,
    }
    line_doc = {
        "id": item_id, "tenant_id": TENANT,
        "delivery_id": delivery_id, "sku_id": SKU_ID,
        "sku_name": "Nyla – 660 ml / Sparkling",
        "quantity": 3,                         # ← 3 BOTTLES, NOT 3 crates
        "delivered_quantity": 3,
        "packaging_type_name": "Bottle",       # the fix's target field
        "units_per_package": 1,
        "unit_price": 100.0, "gross_amount": 300.0, "net_amount": 300.0,
    }
    await db.distributor_deliveries.insert_one(promo_doc)
    await db.distributor_delivery_items.insert_one(line_doc)
    return delivery_id, item_id


async def _seed_schedule(db, qid_prefix, delivery_ids):
    sid = f"{qid_prefix}-sched"
    today = dt.datetime.utcnow().isoformat()
    await db.distributor_delivery_schedules.insert_one({
        "id": sid, "tenant_id": TENANT, "distributor_id": DIST_ID,
        "schedule_date": today[:10], "vehicle_id": None, "driver_id": None,
        "delivery_ids": delivery_ids, "status": "approved",
        "created_at": today, "approved_at": today,
    })
    return sid


async def _cleanup(db, qid_prefix):
    pat = {"$regex": f"^{qid_prefix}"}
    await db.distributor_deliveries.delete_many({"id": pat})
    await db.distributor_delivery_items.delete_many({"id": pat})
    await db.distributor_delivery_items.delete_many({"delivery_id": pat})
    await db.distributor_delivery_schedules.delete_many({"id": pat})


# ============================================================ TESTS ==========

def test_enrich_schedule_keeps_bottle_packaging(motor_db):
    """_enrich_schedule must surface packaging_label='Bottle' (not 'Crate') for the line."""
    qid = f"qa-pkg-{uuid.uuid4().hex[:6]}"

    async def _run():
        client, db = motor_db()
        try:
            from routes import distributor_delivery_schedules as mod
            mod.db = db  # bind module-level db for _enrich_schedule
            d_id, _ = await _seed_promo_with_bottle(db, qid)
            sid = await _seed_schedule(db, qid, [d_id])

            sch = await db.distributor_delivery_schedules.find_one({"id": sid})
            enriched = await mod._enrich_schedule(sch, TENANT)
            assert enriched is not None
            deliveries = enriched.get("deliveries") or []
            assert deliveries, "schedule enrichment produced no deliveries"
            items = deliveries[0].get("items") or []
            assert items, "no items in enriched delivery"
            it = items[0]
            # The KEY assertion: packaging_label must come from the line, not 'Crate'
            assert it["packaging_label"] == "Bottle", (
                f"packaging_label expected 'Bottle' (from line), got {it['packaging_label']!r}"
            )
            assert it["units_per_package"] == 1
            assert it["quantity"] == 3, f"package count expected 3 bottles, got {it['quantity']}"
            assert it["quantity_units"] == 3
        finally:
            await _cleanup(db, qid)
            client.close()

    asyncio.new_event_loop().run_until_complete(_run())


def test_crate_total_respects_line_packaging(motor_db):
    """Bundle 'total_crates'/items aggregation must NOT inflate when line is in bottles."""
    qid = f"qa-pkg-{uuid.uuid4().hex[:6]}"

    async def _run():
        client, db = motor_db()
        try:
            from routes import distributor_delivery_schedules as mod
            mod.db = db
            d_id, _ = await _seed_promo_with_bottle(db, qid)
            sid = await _seed_schedule(db, qid, [d_id])
            sch = await db.distributor_delivery_schedules.find_one({"id": sid})
            enriched = await mod._enrich_schedule(sch, TENANT)
            d0 = enriched["deliveries"][0]
            # total_packages / total_units derived in the loop
            tot_pkg = d0.get("total_packages") or sum(i["quantity"] for i in d0["items"])
            tot_units = d0.get("total_units") or sum(i["quantity_units"] for i in d0["items"])
            assert tot_pkg == 3, f"expected 3 bottles total, got {tot_pkg}"
            assert tot_units == 3, f"expected 3 base units, got {tot_units}"
        finally:
            await _cleanup(db, qid)
            client.close()

    asyncio.new_event_loop().run_until_complete(_run())


def test_bundle_pdf_endpoint_renders(motor_db):
    """GET /api/distributor/delivery-schedules/{sid}/pdf returns a valid PDF.
    The bundle endpoint is distributor-scoped, so we log in as the distributor user
    and seed under that distributor (Brian)."""
    qid = f"qa-pkg-{uuid.uuid4().hex[:6]}"

    # Distributor-scoped login
    dist_session = requests.Session()
    r = dist_session.post(f"{BASE_URL}/api/auth/login",
                          json={"email": "john.distributor@test.com",
                                "password": "nyladist##"},
                          timeout=20)
    assert r.status_code == 200, f"distributor login failed: {r.status_code} {r.text[:200]}"
    body = r.json()
    tok = body.get("access_token") or body.get("token")
    if tok:
        dist_session.headers["Authorization"] = f"Bearer {tok}"
    dist_session.headers["X-Tenant-ID"] = TENANT

    async def _setup():
        client, db = motor_db()
        try:
            # seed promo under Brian distributor
            delivery_id = f"{qid}-promo"
            item_id = f"{qid}-item"
            today = dt.datetime.utcnow().isoformat()
            await db.distributor_deliveries.insert_one({
                "id": delivery_id, "tenant_id": TENANT, "distributor_id": DIST_ID_BRIAN,
                "is_promo": True, "status": "confirmed",
                "recipient_type": "contact", "delivery_number": f"DC-QA-{qid[-4:]}",
                "delivery_date": today,
                "delivery_address": "MG Road, Bengaluru, Karnataka 560001",
                "contact_address": "MG Road, Bengaluru, Karnataka 560001",
                "recipient_shipping_address": {"line1": "MG Road", "city": "Bengaluru",
                                               "state": "Karnataka", "pincode": "560001"},
                "created_at": today, "subtotal": 100.0,
            })
            await db.distributor_delivery_items.insert_one({
                "id": item_id, "tenant_id": TENANT,
                "delivery_id": delivery_id, "sku_id": SKU_ID,
                "sku_name": "Nyla – 660 ml / Sparkling",
                "quantity": 3, "delivered_quantity": 3,
                "packaging_type_name": "Bottle", "units_per_package": 1,
                "unit_price": 100.0, "gross_amount": 300.0, "net_amount": 300.0,
            })
            sid = f"{qid}-sched"
            await db.distributor_delivery_schedules.insert_one({
                "id": sid, "tenant_id": TENANT, "distributor_id": DIST_ID_BRIAN,
                "schedule_date": today[:10], "vehicle_id": None, "driver_id": None,
                "delivery_ids": [delivery_id], "status": "approved",
                "created_at": today, "approved_at": today,
            })
            return sid
        finally:
            client.close()

    async def _teardown():
        client, db = motor_db()
        try:
            await _cleanup(db, qid)
        finally:
            client.close()

    sid = asyncio.new_event_loop().run_until_complete(_setup())
    try:
        r = dist_session.get(f"{BASE_URL}/api/distributor/delivery-schedules/{sid}/pdf",
                             timeout=30)
        assert r.status_code == 200, f"bundle PDF returned {r.status_code}: {r.text[:300]}"
        assert r.headers.get("content-type", "").startswith("application/pdf"), r.headers
        assert r.content[:4] == b"%PDF", "not a valid PDF header"
    finally:
        asyncio.new_event_loop().run_until_complete(_teardown())


def test_promo_challan_pdf_endpoint(session, motor_db):
    """GET /api/distributors/{did}/promo-deliveries/{pid}/challan-pdf returns a valid PDF
    when the promo line carries its own 'Bottle' packaging."""
    qid = f"qa-pkg-{uuid.uuid4().hex[:6]}"

    async def _setup():
        client, db = motor_db()
        try:
            d_id, _ = await _seed_promo_with_bottle(db, qid)
            return d_id
        finally:
            client.close()

    async def _teardown():
        client, db = motor_db()
        try:
            await _cleanup(db, qid)
        finally:
            client.close()

    d_id = asyncio.new_event_loop().run_until_complete(_setup())
    try:
        url = f"{BASE_URL}/api/distributors/{DIST_ID}/promo-deliveries/{d_id}/challan-pdf"
        r = session.get(url, timeout=30)
        assert r.status_code == 200, f"challan PDF returned {r.status_code}: {r.text[:300]}"
        assert r.content[:4] == b"%PDF"
        # PDF size sanity
        assert len(r.content) > 1500, f"PDF too small ({len(r.content)} bytes)"
    finally:
        asyncio.new_event_loop().run_until_complete(_teardown())


def test_existing_promo_with_crate_packaging_unchanged(session, motor_db):
    """Regression: a real promo with packaging_type_name='Crate - 12' upp=12 still renders
    the existing packaging label (not silently flipped). Uses pre-existing seed data."""
    EXISTING_PROMO = "e07703e0-ac20-4554-8c20-460fadb563a0"

    async def _run():
        client, db = motor_db()
        try:
            from routes import distributor_delivery_schedules as mod
            mod.db = db
            d = await db.distributor_deliveries.find_one({"id": EXISTING_PROMO})
            if not d:
                pytest.skip("existing promo e07703e0 missing")
            qid = f"qa-pkg-{uuid.uuid4().hex[:6]}"
            sid = await _seed_schedule(db, qid, [EXISTING_PROMO])
            try:
                sch = await db.distributor_delivery_schedules.find_one({"id": sid})
                enriched = await mod._enrich_schedule(sch, TENANT)
                items = enriched["deliveries"][0]["items"]
                it = items[0]
                assert it["packaging_label"] == "Crate - 12", \
                    f"expected 'Crate - 12' (line packaging), got {it['packaging_label']!r}"
                assert it["units_per_package"] == 12
                # qty stored = 2 (i.e. 2 crates), units = 2 * 12 = 24
                assert it["quantity"] == 2
                assert it["quantity_units"] == 24
            finally:
                await db.distributor_delivery_schedules.delete_one({"id": sid})
        finally:
            client.close()

    asyncio.new_event_loop().run_until_complete(_run())
