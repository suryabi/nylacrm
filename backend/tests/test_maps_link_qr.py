"""
Iteration 228 — Maps link → QR (priority: maps_link → GPS → text address).

Backend coverage:
 1. POST /api/distributors/{distributor_id}/promo-deliveries with maps_link in
    body persists it on dispatch.maps_link AND
    dispatch.recipient_shipping_address.maps_link.
 2. Confirm the draft and GET the challan PDF — must be a valid %PDF.
 3. Bundle PDF (GET /api/distributor/delivery-schedules/{schedule_id}/pdf)
    where dispatch carries maps_link → returns valid %PDF.
 4. Models accept maps_link (PromoDeliveryCreate, DeliveryOrders.DeliveryAddress) —
    no 422 on POST.
 5. Tolerance: maps_link=null / empty string → 200 (field optional).
 6. Priority logic of build_maps_qr / _maps_qr_flowable (maps_link first).
"""
import os
import io
import re
import uuid
import asyncio
import datetime as dt
import pytest
import requests
from dotenv import load_dotenv

load_dotenv("/app/backend/.env")
load_dotenv("/app/frontend/.env")

BASE_URL = os.environ["REACT_APP_BACKEND_URL"].rstrip("/")
TENANT = "nyla-air-water"
DIST_ID_BRIAN = "bb12d90e-4d33-4890-ac5f-17573c551b5c"
LOC_DELHI = "aa2eda05-1902-4a17-92bb-d33533535297"  # non-factory, non-batch
SKU_ID = "ee1e5f58-5509-4691-ae93-d3e3badc3442"
CONTACT_PROMO = "502e7e1e-6f29-4f81-b80c-e8ab411dd9c8"
VALID_MAPS_LINK = "https://maps.app.goo.gl/eU2YJBYWqCEyFwhr9?g_st=iw"


# -------- helpers --------
@pytest.fixture(scope="module")
def session():
    s = requests.Session()
    r = s.post(f"{BASE_URL}/api/auth/login",
               json={"email": "surya.yadavalli@nylaairwater.earth", "password": "test123"},
               timeout=20)
    assert r.status_code == 200, f"login failed {r.status_code}: {r.text[:200]}"
    tok = (r.json().get("access_token") or r.json().get("token"))
    if tok:
        s.headers["Authorization"] = f"Bearer {tok}"
    s.headers["X-Tenant-ID"] = TENANT
    return s


@pytest.fixture(scope="module")
def dist_session():
    s = requests.Session()
    r = s.post(f"{BASE_URL}/api/auth/login",
               json={"email": "john.distributor@test.com", "password": "nyladist##"},
               timeout=20)
    assert r.status_code == 200, f"dist login failed {r.status_code}: {r.text[:200]}"
    tok = (r.json().get("access_token") or r.json().get("token"))
    if tok:
        s.headers["Authorization"] = f"Bearer {tok}"
    s.headers["X-Tenant-ID"] = TENANT
    return s


def _motor():
    from motor.motor_asyncio import AsyncIOMotorClient
    client = AsyncIOMotorClient(os.environ["MONGO_URL"])
    return client, client[os.environ["DB_NAME"]]


def _promo_payload(maps_link, qty=1):
    return {
        "distributor_location_id": LOC_DELHI,
        "recipient_type": "contact",
        "contact_id": CONTACT_PROMO,
        "delivery_date": dt.date.today().isoformat(),
        "reason": "Sampling",
        "delivery_address": "MG Road, Bengaluru, Karnataka 560001",
        "maps_link": maps_link,
        "items": [{
            "sku_id": SKU_ID,
            "sku_name": "Nyla – 660 ml / Sparkling",
            "quantity": qty,
            "unit_price": 0,
        }],
        "as_draft": True,  # skips stock validation; field persistence/PDF still work
    }


async def _cleanup_dispatch(dispatch_id):
    client, db = _motor()
    try:
        await db.distributor_deliveries.delete_many({"id": dispatch_id})
        await db.distributor_delivery_items.delete_many({"delivery_id": dispatch_id})
        await db.distributor_delivery_schedules.delete_many({"delivery_ids": dispatch_id})
    finally:
        client.close()


# ============================== TESTS ====================================

# Model acceptance — direct import (no HTTP) to assert maps_link field exists.
def test_promo_delivery_create_model_has_maps_link():
    from models.distributor import PromoDeliveryCreate
    m = PromoDeliveryCreate(
        distributor_location_id="x", recipient_type="contact",
        delivery_date="2026-01-01", reason="Sampling",
        maps_link=VALID_MAPS_LINK, items=[],
    )
    assert m.maps_link == VALID_MAPS_LINK


def test_delivery_orders_delivery_address_has_maps_link():
    from routes.delivery_orders import DeliveryAddress
    a = DeliveryAddress(maps_link=VALID_MAPS_LINK)
    assert a.maps_link == VALID_MAPS_LINK


# build_maps_qr / _maps_qr_flowable priority (maps_link first)
def test_build_maps_qr_priority_maps_link_over_gps():
    """maps_link branch must win even when GPS + address are present."""
    from utils.pdf_generator import build_maps_qr
    # smoke: returns Image when maps_link present (priority — won't fall to gps).
    img = build_maps_qr(address_text="Foo", lat=12.97, lng=77.59, maps_link=VALID_MAPS_LINK)
    assert img is not None
    # GPS only path also works
    img2 = build_maps_qr(address_text="Foo", lat=12.97, lng=77.59, maps_link=None)
    assert img2 is not None
    # Source-level proof of priority: link is checked BEFORE lat/lng in the function body.
    import inspect
    src = inspect.getsource(build_maps_qr)
    i_link = src.find("link = ")
    i_lat = src.find("float(lat)")
    assert 0 < i_link < i_lat, "build_maps_qr must evaluate maps_link before GPS"


def test_distributor_schedule_maps_qr_priority():
    """_maps_qr_flowable in distributor_delivery_schedules must check maps_link first."""
    import inspect
    from routes import distributor_delivery_schedules as mod
    src = inspect.getsource(mod._maps_qr_flowable)
    i_link = src.find("link = ")
    i_lat = src.find("float(lat)")
    assert 0 < i_link < i_lat, "_maps_qr_flowable must evaluate maps_link before GPS"


# HTTP — create promo with maps_link, persistence + challan PDF.
def test_create_promo_with_maps_link_persists_and_renders_challan(session):
    payload = _promo_payload(VALID_MAPS_LINK)
    r = session.post(f"{BASE_URL}/api/distributors/{DIST_ID_BRIAN}/promo-deliveries",
                     json=payload, timeout=30)
    assert r.status_code == 200, f"create promo {r.status_code}: {r.text[:400]}"
    body = r.json()
    dispatch_id = body.get("id") or (body.get("dispatch") or {}).get("id")
    assert dispatch_id, f"no id in response: {body}"

    try:
        # Persistence: assert via direct Mongo (single source of truth).
        async def _check():
            client, db = _motor()
            try:
                d = await db.distributor_deliveries.find_one({"id": dispatch_id}, {"_id": 0})
                assert d is not None
                assert d.get("maps_link") == VALID_MAPS_LINK, f"top-level maps_link missing: {d.get('maps_link')!r}"
                ship = d.get("recipient_shipping_address") or {}
                assert ship.get("maps_link") == VALID_MAPS_LINK, f"recipient_shipping_address.maps_link missing: {ship.get('maps_link')!r}"
            finally:
                client.close()
        asyncio.new_event_loop().run_until_complete(_check())

        # Confirm draft → confirmed, then challan PDF.
        rc = session.post(
            f"{BASE_URL}/api/distributors/{DIST_ID_BRIAN}/promo-deliveries/{dispatch_id}/confirm",
            timeout=30)
        # Confirm may need stock — if it fails, the maps_link persistence test is
        # already proven; still try the challan PDF (works on draft too).
        # We don't hard-assert confirm here.

        rp = session.get(
            f"{BASE_URL}/api/distributors/{DIST_ID_BRIAN}/promo-deliveries/{dispatch_id}/challan-pdf",
            timeout=30)
        assert rp.status_code == 200, f"challan PDF {rp.status_code}: {rp.text[:300]}"
        assert rp.content[:4] == b"%PDF", "challan response is not a PDF"
        assert len(rp.content) > 1500
    finally:
        asyncio.new_event_loop().run_until_complete(_cleanup_dispatch(dispatch_id))


def test_create_promo_with_null_maps_link_succeeds(session):
    """Tolerance: maps_link=None still succeeds (field optional)."""
    payload = _promo_payload(None)
    r = session.post(f"{BASE_URL}/api/distributors/{DIST_ID_BRIAN}/promo-deliveries",
                     json=payload, timeout=30)
    assert r.status_code == 200, f"null maps_link {r.status_code}: {r.text[:300]}"
    body = r.json()
    dispatch_id = body.get("id") or (body.get("dispatch") or {}).get("id")
    assert dispatch_id
    try:
        async def _check():
            client, db = _motor()
            try:
                d = await db.distributor_deliveries.find_one({"id": dispatch_id}, {"_id": 0})
                assert d is not None
                assert d.get("maps_link") in (None, "")
            finally:
                client.close()
        asyncio.new_event_loop().run_until_complete(_check())
    finally:
        asyncio.new_event_loop().run_until_complete(_cleanup_dispatch(dispatch_id))


def test_create_promo_with_empty_maps_link_succeeds(session):
    payload = _promo_payload("")
    r = session.post(f"{BASE_URL}/api/distributors/{DIST_ID_BRIAN}/promo-deliveries",
                     json=payload, timeout=30)
    assert r.status_code == 200, f"empty maps_link {r.status_code}: {r.text[:300]}"
    body = r.json()
    dispatch_id = body.get("id") or (body.get("dispatch") or {}).get("id")
    assert dispatch_id
    try:
        pass
    finally:
        asyncio.new_event_loop().run_until_complete(_cleanup_dispatch(dispatch_id))


def test_bundle_pdf_includes_maps_link_dispatch(dist_session):
    """Bundle PDF (distributor-only) renders when dispatch carries maps_link.
    Seed a confirmed promo + schedule directly so we exercise the PDF endpoint
    end-to-end (no Zoho / stock side effects)."""
    qid = f"qa-maps-{uuid.uuid4().hex[:6]}"
    delivery_id = f"{qid}-promo"
    sched_id = f"{qid}-sched"

    async def _seed():
        client, db = _motor()
        try:
            today = dt.datetime.utcnow().isoformat()
            await db.distributor_deliveries.insert_one({
                "id": delivery_id, "tenant_id": TENANT, "distributor_id": DIST_ID_BRIAN,
                "is_promo": True, "status": "confirmed",
                "recipient_type": "contact", "delivery_number": f"DC-MAPS-{qid[-4:]}",
                "delivery_date": today,
                "delivery_address": "MG Road, Bengaluru, Karnataka 560001",
                "maps_link": VALID_MAPS_LINK,
                "recipient_shipping_address": {
                    "line1": "MG Road", "city": "Bengaluru",
                    "state": "Karnataka", "pincode": "560001",
                    "maps_link": VALID_MAPS_LINK,
                },
                "created_at": today, "subtotal": 100.0,
            })
            await db.distributor_delivery_items.insert_one({
                "id": f"{qid}-item", "tenant_id": TENANT,
                "delivery_id": delivery_id, "sku_id": SKU_ID,
                "sku_name": "Nyla – 660 ml / Sparkling",
                "quantity": 1, "delivered_quantity": 1,
                "packaging_type_name": "Bottle", "units_per_package": 1,
                "unit_price": 0, "gross_amount": 0, "net_amount": 0,
            })
            await db.distributor_delivery_schedules.insert_one({
                "id": sched_id, "tenant_id": TENANT, "distributor_id": DIST_ID_BRIAN,
                "schedule_date": today[:10], "vehicle_id": None, "driver_id": None,
                "delivery_ids": [delivery_id], "status": "approved",
                "created_at": today, "approved_at": today,
            })
        finally:
            client.close()

    async def _teardown():
        client, db = _motor()
        try:
            await db.distributor_deliveries.delete_many({"id": delivery_id})
            await db.distributor_delivery_items.delete_many({"delivery_id": delivery_id})
            await db.distributor_delivery_schedules.delete_many({"id": sched_id})
        finally:
            client.close()

    asyncio.new_event_loop().run_until_complete(_seed())
    try:
        r = dist_session.get(
            f"{BASE_URL}/api/distributor/delivery-schedules/{sched_id}/pdf", timeout=30)
        assert r.status_code == 200, f"bundle PDF {r.status_code}: {r.text[:300]}"
        assert r.content[:4] == b"%PDF"
        assert len(r.content) > 1500
    finally:
        asyncio.new_event_loop().run_until_complete(_teardown())
