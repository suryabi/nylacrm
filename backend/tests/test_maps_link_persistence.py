"""
Iteration 229 — maps_link persistence on Contacts, Accounts (PUT + PATCH
delivery-info), and Leads. Follow-up to iteration_228 which validated the
Promo / DO paths only. The bug was that ContactCreate/ContactUpdate and the
account write-path DeliveryAddress did NOT include the maps_link field, so
the value was silently dropped on save.

Backend coverage:
  - POST /api/contacts with maps_link → GET returns it
  - PUT /api/contacts/{id} with updated maps_link → GET returns new value
  - PUT /api/accounts/{id} with delivery_address.maps_link → GET returns it
  - PATCH /api/accounts/{id}/delivery-info with delivery_address.maps_link → GET
  - PUT /api/leads/{id} with delivery_address.maps_link → GET returns it
  - Pydantic models include maps_link (ContactCreate / ContactUpdate /
    accounts.DeliveryAddress / models.account.DeliveryAddress)
  - Promo regression smoke: PromoDeliveryCreate accepts maps_link
"""
import os
import asyncio
import datetime as dt
import pytest
import requests
from dotenv import load_dotenv

load_dotenv("/app/backend/.env")
load_dotenv("/app/frontend/.env")

BASE_URL = os.environ["REACT_APP_BACKEND_URL"].rstrip("/")
TENANT = "nyla-air-water"

# Seed IDs (verified via Mongo before running)
ACCOUNT_ID = "81263309-2118-4d51-b1d9-fe9549da07b7"  # Toopa Ice-creamery
LEAD_ID = "1b5f9703-91c1-46a5-bb36-68d36fa475eb"      # INNO-MUM-L26-001
CATEGORY_ID = "fb290a76-20fa-4952-b32d-17cf0ae3d2c9"  # Vendors

MAPS_LINK_A = "https://maps.app.goo.gl/eU2YJBYWqCEyFwhr9?g_st=iw"
MAPS_LINK_B = "https://maps.app.goo.gl/ABCDEFGhijklmn123?g_st=ic"


# -------- helpers --------
@pytest.fixture(scope="module")
def session():
    s = requests.Session()
    r = s.post(
        f"{BASE_URL}/api/auth/login",
        json={"email": "surya.yadavalli@nylaairwater.earth", "password": "test123"},
        timeout=20,
    )
    assert r.status_code == 200, f"login failed {r.status_code}: {r.text[:200]}"
    tok = r.json().get("access_token") or r.json().get("token")
    if tok:
        s.headers["Authorization"] = f"Bearer {tok}"
    s.headers["X-Tenant-ID"] = TENANT
    return s


def _motor():
    from motor.motor_asyncio import AsyncIOMotorClient
    client = AsyncIOMotorClient(os.environ["MONGO_URL"])
    return client, client[os.environ["DB_NAME"]]


# ===================== MODEL ACCEPTANCE =====================
def test_contact_create_model_has_maps_link():
    from routes.contacts import ContactCreate, ContactUpdate
    c = ContactCreate(category_id="x", name="Y", maps_link=MAPS_LINK_A)
    assert c.maps_link == MAPS_LINK_A
    u = ContactUpdate(maps_link=MAPS_LINK_A)
    assert u.maps_link == MAPS_LINK_A


def test_accounts_route_delivery_address_has_maps_link():
    from routes.accounts import DeliveryAddress
    a = DeliveryAddress(maps_link=MAPS_LINK_A, city="X")
    assert a.maps_link == MAPS_LINK_A


def test_account_model_delivery_address_has_maps_link():
    from models.account import DeliveryAddress
    a = DeliveryAddress(maps_link=MAPS_LINK_A, lat=12.97, lng=77.59,
                        formatted_address="Foo")
    assert a.maps_link == MAPS_LINK_A
    assert a.lat == 12.97 and a.lng == 77.59


def test_promo_delivery_model_still_has_maps_link():
    from models.distributor import PromoDeliveryCreate
    m = PromoDeliveryCreate(
        distributor_location_id="x", recipient_type="contact",
        delivery_date="2026-01-01", reason="Sampling",
        maps_link=MAPS_LINK_A, items=[],
    )
    assert m.maps_link == MAPS_LINK_A


# ============================ CONTACT =========================
def test_contact_create_and_update_persists_maps_link(session):
    # CREATE
    create_payload = {
        "category_id": CATEGORY_ID,
        "name": "TEST_maps_link_contact",
        "company": "TEST_maps_link Co",
        "phone": "9000000111",
        "maps_link": MAPS_LINK_A,
    }
    r = session.post(f"{BASE_URL}/api/contacts", json=create_payload, timeout=20)
    assert r.status_code == 200, f"create contact {r.status_code}: {r.text[:300]}"
    body = r.json()
    contact_id = body.get("id")
    assert contact_id

    try:
        # response should already include maps_link
        assert body.get("maps_link") == MAPS_LINK_A, \
            f"create response missing maps_link: {body.get('maps_link')!r}"

        # GET to verify DB persistence
        rg = session.get(f"{BASE_URL}/api/contacts/{contact_id}", timeout=20)
        assert rg.status_code == 200
        got = rg.json()
        assert got.get("maps_link") == MAPS_LINK_A, \
            f"GET after create missing maps_link: {got.get('maps_link')!r}"

        # UPDATE to a different valid link
        ru = session.put(
            f"{BASE_URL}/api/contacts/{contact_id}",
            json={"maps_link": MAPS_LINK_B}, timeout=20,
        )
        assert ru.status_code == 200, f"update contact {ru.status_code}: {ru.text[:300]}"
        assert ru.json().get("maps_link") == MAPS_LINK_B

        # GET to verify update persisted
        rg2 = session.get(f"{BASE_URL}/api/contacts/{contact_id}", timeout=20)
        assert rg2.status_code == 200
        assert rg2.json().get("maps_link") == MAPS_LINK_B

    finally:
        # cleanup
        session.delete(f"{BASE_URL}/api/contacts/{contact_id}", timeout=20)


# ============================ ACCOUNT =========================
def test_account_put_persists_delivery_address_maps_link(session):
    # snapshot existing delivery_address so we can restore
    rg0 = session.get(f"{BASE_URL}/api/accounts/{ACCOUNT_ID}", timeout=20)
    assert rg0.status_code == 200, f"acc fetch failed: {rg0.status_code}"
    orig = rg0.json().get("delivery_address") or {}

    new_addr = {
        "address_line1": "TEST_PUT line1",
        "address_line2": "TEST_PUT line2",
        "city": "Bengaluru",
        "state": "Karnataka",
        "pincode": "560001",
        "landmark": "Near park",
        "lat": 12.97,
        "lng": 77.59,
        "formatted_address": "TEST_PUT formatted",
        "maps_link": MAPS_LINK_A,
    }
    r = session.put(
        f"{BASE_URL}/api/accounts/{ACCOUNT_ID}",
        json={"delivery_address": new_addr}, timeout=30,
    )
    assert r.status_code == 200, f"PUT account {r.status_code}: {r.text[:400]}"

    try:
        rg = session.get(f"{BASE_URL}/api/accounts/{ACCOUNT_ID}", timeout=20)
        assert rg.status_code == 200
        got_addr = rg.json().get("delivery_address") or {}
        assert got_addr.get("maps_link") == MAPS_LINK_A, \
            f"PUT account: maps_link missing: {got_addr!r}"
        assert got_addr.get("address_line1") == "TEST_PUT line1"
    finally:
        # restore (best-effort)
        session.put(
            f"{BASE_URL}/api/accounts/{ACCOUNT_ID}",
            json={"delivery_address": orig}, timeout=30,
        )


def test_account_patch_delivery_info_persists_maps_link(session):
    # snapshot
    rg0 = session.get(f"{BASE_URL}/api/accounts/{ACCOUNT_ID}", timeout=20)
    orig = rg0.json().get("delivery_address") or {}

    new_addr = {
        "address_line1": "TEST_PATCH line1",
        "city": "Bengaluru",
        "state": "Karnataka",
        "pincode": "560002",
        "lat": 12.98,
        "lng": 77.60,
        "formatted_address": "TEST_PATCH formatted",
        "maps_link": MAPS_LINK_B,
    }
    r = session.patch(
        f"{BASE_URL}/api/accounts/{ACCOUNT_ID}/delivery-info",
        json={"delivery_address": new_addr}, timeout=30,
    )
    assert r.status_code == 200, f"PATCH delivery-info {r.status_code}: {r.text[:400]}"

    try:
        rg = session.get(f"{BASE_URL}/api/accounts/{ACCOUNT_ID}", timeout=20)
        got_addr = rg.json().get("delivery_address") or {}
        assert got_addr.get("maps_link") == MAPS_LINK_B, \
            f"PATCH delivery-info: maps_link missing: {got_addr!r}"
        assert got_addr.get("address_line1") == "TEST_PATCH line1"
    finally:
        session.put(
            f"{BASE_URL}/api/accounts/{ACCOUNT_ID}",
            json={"delivery_address": orig}, timeout=30,
        )


# ============================ LEAD ============================
def test_lead_put_persists_delivery_address_maps_link(session):
    # snapshot
    rg0 = session.get(f"{BASE_URL}/api/leads/{LEAD_ID}", timeout=20)
    assert rg0.status_code == 200, f"lead fetch failed: {rg0.status_code}: {rg0.text[:200]}"
    orig = rg0.json().get("delivery_address") or {}

    new_addr = {
        "address_line1": "TEST_LEAD line1",
        "city": "Mumbai",
        "state": "Maharashtra",
        "pincode": "400001",
        "lat": 19.07,
        "lng": 72.87,
        "formatted_address": "TEST_LEAD formatted",
        "maps_link": MAPS_LINK_A,
    }
    r = session.put(
        f"{BASE_URL}/api/leads/{LEAD_ID}",
        json={"delivery_address": new_addr}, timeout=30,
    )
    assert r.status_code == 200, f"PUT lead {r.status_code}: {r.text[:400]}"

    try:
        rg = session.get(f"{BASE_URL}/api/leads/{LEAD_ID}", timeout=20)
        assert rg.status_code == 200
        got_addr = rg.json().get("delivery_address") or {}
        assert got_addr.get("maps_link") == MAPS_LINK_A, \
            f"PUT lead: maps_link missing: {got_addr!r}"
        assert got_addr.get("address_line1") == "TEST_LEAD line1"
    finally:
        session.put(
            f"{BASE_URL}/api/leads/{LEAD_ID}",
            json={"delivery_address": orig}, timeout=30,
        )
