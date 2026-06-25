"""
Tests for the Delivery Orders LIST endpoint mirroring the live status of the
linked Promotional Stock-Out (distributor_deliveries) into fulfillment_status.

Scenario under test:
  - DO-2026-0005 (id a8697ae8-...) is linked via promo_dispatch_id to a promo
    challan (id 9d4d2c0b-...). The list endpoint must reflect (and persist)
    the live promo status on every call.
"""

import os
import asyncio
import pytest
import requests
from motor.motor_asyncio import AsyncIOMotorClient

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "https://supply-chain-hub-229.preview.emergentagent.com").rstrip("/")
MONGO_URL = os.environ.get("MONGO_URL", "mongodb://localhost:27017")
DB_NAME = os.environ.get("DB_NAME", "test_database")

CEO_EMAIL = "surya.yadavalli@nylaairwater.earth"
CEO_PASSWORD = "test123"
TENANT_ID = "nyla-air-water"

DO_ID = "a8697ae8-7644-4e86-b692-8830f1abd70b"
DO_NUMBER = "DO-2026-0005"
PROMO_ID = "9d4d2c0b-f37a-41b2-b0b3-6889950c2910"


# --------- Fixtures ---------

@pytest.fixture(scope="module")
def session():
    """Authenticated requests.Session using httpOnly cookie (no token in body)."""
    s = requests.Session()
    s.headers.update({"Content-Type": "application/json", "X-Tenant-ID": TENANT_ID})
    r = s.post(
        f"{BASE_URL}/api/auth/login",
        json={"email": CEO_EMAIL, "password": CEO_PASSWORD},
        timeout=30,
    )
    assert r.status_code == 200, f"Login failed: {r.status_code} {r.text}"
    # Cookie jar now has the auth cookie
    return s


def _set_promo_and_do(promo_status: str, do_fulfillment_status):
    """Set the promo's distributor_deliveries.status and the DO's fulfillment_status directly in Mongo."""
    async def _run():
        client = AsyncIOMotorClient(MONGO_URL)
        db = client[DB_NAME]
        await db.distributor_deliveries.update_one(
            {"id": PROMO_ID, "tenant_id": TENANT_ID},
            {"$set": {"status": promo_status}},
        )
        await db.delivery_orders.update_one(
            {"id": DO_ID, "tenant_id": TENANT_ID},
            {"$set": {"fulfillment_status": do_fulfillment_status}},
        )
        client.close()
    asyncio.run(_run())


def _get_do_from_list(session):
    r = session.get(f"{BASE_URL}/api/delivery-orders", timeout=30)
    assert r.status_code == 200, f"List failed: {r.status_code} {r.text}"
    data = r.json()
    assert "orders" in data
    row = next((o for o in data["orders"] if o.get("id") == DO_ID), None)
    assert row is not None, f"{DO_NUMBER} not found in list response"
    return row, data["orders"]


def _get_do_persisted_from_db():
    async def _run():
        client = AsyncIOMotorClient(MONGO_URL)
        db = client[DB_NAME]
        doc = await db.delivery_orders.find_one(
            {"id": DO_ID, "tenant_id": TENANT_ID}, {"_id": 0, "fulfillment_status": 1}
        )
        client.close()
        return doc
    return asyncio.run(_run())


# --------- Tests ---------

class TestDeliveryOrderFulfillmentMirror:

    def test_a_health_and_target_rows_exist(self):
        # Sanity: the target DO and promo exist in DB
        async def _run():
            client = AsyncIOMotorClient(MONGO_URL)
            db = client[DB_NAME]
            do = await db.delivery_orders.find_one({"id": DO_ID, "tenant_id": TENANT_ID}, {"_id": 0, "order_number": 1, "promo_dispatch_id": 1})
            promo = await db.distributor_deliveries.find_one({"id": PROMO_ID, "tenant_id": TENANT_ID}, {"_id": 0, "id": 1})
            client.close()
            return do, promo
        do, promo = asyncio.run(_run())
        assert do is not None, "DO-2026-0005 does not exist"
        assert do.get("order_number") == DO_NUMBER
        assert do.get("promo_dispatch_id") == PROMO_ID
        assert promo is not None, "Linked promo challan does not exist"

    def test_b_list_mirrors_confirmed_when_stored_is_draft(self, session):
        """Simulate stale state: promo=confirmed, DO=draft. LIST should reflect 'confirmed'."""
        _set_promo_and_do(promo_status="confirmed", do_fulfillment_status="draft")
        row, _ = _get_do_from_list(session)
        assert row["fulfillment_status"] == "confirmed", \
            f"Expected fulfillment_status='confirmed' from live promo, got {row['fulfillment_status']!r}"

    def test_c_persisted_after_list_call(self, session):
        """A second GET should still return 'confirmed' (and DB now persists it)."""
        # Run list again (should be idempotent)
        row, _ = _get_do_from_list(session)
        assert row["fulfillment_status"] == "confirmed"
        # And the DB row was persisted by the previous list call
        persisted = _get_do_persisted_from_db()
        assert persisted is not None
        assert persisted.get("fulfillment_status") == "confirmed", \
            f"Expected persisted fulfillment_status='confirmed', got {persisted.get('fulfillment_status')!r}"

    def test_d_list_updates_live_when_promo_changes_to_delivery_assigned(self, session):
        _set_promo_and_do(promo_status="delivery_assigned", do_fulfillment_status="confirmed")
        row, _ = _get_do_from_list(session)
        assert row["fulfillment_status"] == "delivery_assigned", \
            f"Expected 'delivery_assigned', got {row['fulfillment_status']!r}"
        persisted = _get_do_persisted_from_db()
        assert persisted.get("fulfillment_status") == "delivery_assigned"

    def test_e_list_updates_live_when_promo_changes_to_on_the_way(self, session):
        _set_promo_and_do(promo_status="on_the_way", do_fulfillment_status="delivery_assigned")
        row, _ = _get_do_from_list(session)
        assert row["fulfillment_status"] == "on_the_way"
        persisted = _get_do_persisted_from_db()
        assert persisted.get("fulfillment_status") == "on_the_way"

    def test_f_dos_without_promo_unaffected(self, session):
        """DOs that have no promo_dispatch_id must not have their fulfillment_status mutated."""
        _, orders = _get_do_from_list(session)
        # Collect a snapshot of all DOs without a promo
        no_promo_rows = [o for o in orders if not o.get("promo_dispatch_id")]
        assert len(orders) > 0, "Expected at least 1 DO in the list"
        # The list should still return all orders (no crash, no filter dropouts)
        # And for each no-promo row, the value must be whatever was stored (or null).
        # Read each from DB and assert equality.
        async def _check():
            client = AsyncIOMotorClient(MONGO_URL)
            db = client[DB_NAME]
            mismatches = []
            for o in no_promo_rows:
                doc = await db.delivery_orders.find_one(
                    {"id": o["id"], "tenant_id": TENANT_ID},
                    {"_id": 0, "fulfillment_status": 1},
                )
                if (doc or {}).get("fulfillment_status") != o.get("fulfillment_status"):
                    mismatches.append((o["id"], o.get("fulfillment_status"), (doc or {}).get("fulfillment_status")))
            client.close()
            return mismatches
        mismatches = asyncio.run(_check())
        assert not mismatches, f"Non-promo DOs had their fulfillment_status mutated: {mismatches}"

    def test_g_list_with_lead_account_filter_also_mirrors(self, session):
        """If the target DO has account_id/lead_id, the filtered list should also mirror live status."""
        # Find DO doc to discover filters
        async def _get_doc():
            client = AsyncIOMotorClient(MONGO_URL)
            db = client[DB_NAME]
            doc = await db.delivery_orders.find_one(
                {"id": DO_ID, "tenant_id": TENANT_ID},
                {"_id": 0, "account_id": 1, "lead_id": 1},
            )
            client.close()
            return doc
        doc = asyncio.run(_get_doc())
        # Set a distinct live status
        _set_promo_and_do(promo_status="confirmed", do_fulfillment_status="draft")
        params = {}
        if doc.get("account_id"):
            params["account_id"] = doc["account_id"]
        elif doc.get("lead_id"):
            params["lead_id"] = doc["lead_id"]
        # Only run filter test if we have one of these
        if not params:
            pytest.skip("DO has neither account_id nor lead_id; skipping filtered-list mirror check")
        r = session.get(f"{BASE_URL}/api/delivery-orders", params=params, timeout=30)
        assert r.status_code == 200, r.text
        rows = r.json().get("orders", [])
        row = next((o for o in rows if o.get("id") == DO_ID), None)
        assert row is not None, f"DO not present in filtered list with params={params}"
        assert row["fulfillment_status"] == "confirmed"

    def test_z_restore_final_state(self):
        """Leave consistent final state: promo=confirmed, DO=confirmed (live mirror)."""
        _set_promo_and_do(promo_status="confirmed", do_fulfillment_status="confirmed")
        persisted = _get_do_persisted_from_db()
        assert persisted.get("fulfillment_status") == "confirmed"
