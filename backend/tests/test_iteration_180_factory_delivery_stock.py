"""
Iteration 180 — regression for the factory→account delivery stock leak.

Bug: `complete_delivery` always tried to deduct from `distributor_stock`
even when the delivery source was a factory warehouse (`is_factory=true`).
factory_warehouse_stock was never touched, so the at-hand widget kept showing
the pre-delivery quantity. This test seeds the exact scenario the user hit
in production (500 crates received → 25 crates delivered) and asserts the
factory_warehouse_stock row decrements by the delivered quantity.
"""
import os
import uuid
import asyncio
from datetime import datetime, timezone

import pytest
import requests
from dotenv import load_dotenv
from motor.motor_asyncio import AsyncIOMotorClient

load_dotenv("/app/backend/.env")

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "https://traceability-hub-9.preview.emergentagent.com").rstrip("/")
ADMIN_EMAIL = "surya.yadavalli@nylaairwater.earth"
ADMIN_PASS = "test123"
TENANT_ID = "nyla-air-water"


def _login(email, password):
    r = requests.post(f"{BASE_URL}/api/auth/login", json={"email": email, "password": password}, timeout=20)
    if r.status_code != 200:
        pytest.skip(f"Login failed: {r.status_code} {r.text[:200]}")
    return r.json().get("session_token") or r.json().get("token")


@pytest.fixture(scope="module")
def admin_token():
    return _login(ADMIN_EMAIL, ADMIN_PASS)


def _auth(tok):
    return {"Authorization": f"Bearer {tok}"}


def _db():
    return AsyncIOMotorClient(os.environ["MONGO_URL"])[os.environ["DB_NAME"]]


@pytest.fixture(scope="module")
def seeded_factory_scenario():
    """Seed: factory warehouse with 6000 bottles of one SKU, a customer account,
    and a draft delivery for 300 bottles. Returns the IDs needed to exercise
    `complete_delivery` and inspect `factory_warehouse_stock` afterwards.
    """
    factory_loc_id = str(uuid.uuid4())
    distributor_id = str(uuid.uuid4())
    sku_id = str(uuid.uuid4())
    account_id = str(uuid.uuid4())
    delivery_id = str(uuid.uuid4())
    delivery_item_id = str(uuid.uuid4())
    fws_id = str(uuid.uuid4())
    now = datetime.now(timezone.utc).isoformat()

    async def _setup():
        db = _db()
        await db.distributors.insert_one({
            "id": distributor_id, "tenant_id": TENANT_ID,
            "distributor_name": "ITER180 Factory-Dist", "distributor_code": "DIST-ITER180",
            "billing_approach": "margin_upfront",
        })
        await db.distributor_locations.insert_one({
            "id": factory_loc_id, "tenant_id": TENANT_ID,
            "distributor_id": distributor_id,
            "location_name": "ITER180 Factory Warehouse", "city": "Hyderabad", "state": "Telangana",
            "is_factory": True, "status": "active", "track_batches": False,
        })
        await db.master_skus.insert_one({
            "id": sku_id, "tenant_id": TENANT_ID, "sku_name": "ITER180 Test SKU",
            "category": "test", "is_active": True,
        })
        await db.factory_warehouse_stock.insert_one({
            "id": fws_id, "tenant_id": TENANT_ID,
            "warehouse_location_id": factory_loc_id,
            "sku_id": sku_id, "sku_name": "ITER180 Test SKU",
            "quantity": 6000, "bottles_per_crate": 12,
            "created_at": now, "updated_at": now,
        })
        await db.accounts.insert_one({
            "id": account_id, "tenant_id": TENANT_ID,
            "account_name": "ITER180 Customer", "city": "Hyderabad", "state": "Telangana",
            "billed_by": "company",
        })
        await db.distributor_deliveries.insert_one({
            "id": delivery_id, "tenant_id": TENANT_ID,
            "distributor_id": distributor_id,
            "distributor_location_id": factory_loc_id,
            "account_id": account_id, "account_name": "ITER180 Customer",
            "delivery_number": "DEL-ITER180-0001",
            "delivery_date": now[:10],
            "status": "delivery_scheduled",
            "created_at": now,
        })
        await db.distributor_delivery_items.insert_one({
            "id": delivery_item_id, "tenant_id": TENANT_ID,
            "delivery_id": delivery_id,
            "sku_id": sku_id, "sku_name": "ITER180 Test SKU",
            "quantity": 300,        # 25 crates × 12 bottles — user's exact scenario
            "unit_price": 100,
            "batch_id": None,
        })

    async def _teardown():
        db = _db()
        await db.distributor_delivery_items.delete_one({"id": delivery_item_id})
        await db.distributor_deliveries.delete_one({"id": delivery_id})
        await db.accounts.delete_one({"id": account_id})
        await db.factory_warehouse_stock.delete_one({"id": fws_id})
        await db.master_skus.delete_one({"id": sku_id})
        await db.distributor_locations.delete_one({"id": factory_loc_id})
        await db.distributors.delete_one({"id": distributor_id})

    asyncio.run(_setup())
    yield {
        "factory_loc_id": factory_loc_id,
        "distributor_id": distributor_id,
        "sku_id": sku_id,
        "delivery_id": delivery_id,
    }
    asyncio.run(_teardown())


class TestFactoryDeliveryStockDeduction:

    def test_factory_stock_decrements_on_complete_delivery(self, admin_token, seeded_factory_scenario):
        ctx = seeded_factory_scenario
        # Pre-condition: 6000 bottles at factory
        async def _get_qty():
            db = _db()
            row = await db.factory_warehouse_stock.find_one(
                {"warehouse_location_id": ctx["factory_loc_id"], "sku_id": ctx["sku_id"]},
                {"_id": 0, "quantity": 1},
            )
            return (row or {}).get("quantity", -1)
        assert asyncio.run(_get_qty()) == 6000

        r = requests.post(
            f"{BASE_URL}/api/distributors/{ctx['distributor_id']}/deliveries/{ctx['delivery_id']}/complete",
            headers=_auth(admin_token), timeout=20,
        )
        assert r.status_code == 200, r.text
        assert r.json().get("status") == "complete"

        # Post-condition: 6000 − 300 = 5700 bottles
        assert asyncio.run(_get_qty()) == 5700

    def test_distributor_stock_untouched_when_source_is_factory(self, admin_token, seeded_factory_scenario):
        """The bug was double-edged: not only did factory stock not decrement,
        but distributor_stock was being matched against a non-existent row,
        silently doing nothing. Confirm no phantom distributor_stock row was
        created or modified for this factory delivery."""
        ctx = seeded_factory_scenario

        async def _ds_count():
            db = _db()
            return await db.distributor_stock.count_documents({
                "tenant_id": TENANT_ID,
                "distributor_id": ctx["distributor_id"],
                "distributor_location_id": ctx["factory_loc_id"],
                "sku_id": ctx["sku_id"],
            })
        # No distributor_stock row should exist for this factory location's stock.
        assert asyncio.run(_ds_count()) == 0
