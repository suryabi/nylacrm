"""
Iteration 185 — Stock Dashboard must show CRATES (not bottles) when the SKU
master is missing `bottles_per_crate`.

Bug: When master_skus.bottles_per_crate is not set, the dashboard's bottles→
crates conversion fell back to 1, so pending-out, deliveries, and returns
appeared as bottles while received & WH stock appeared correctly in crates.

Fix: aggregation uses each item's own `packaging_units` field (which is always
stored on delivery & shipment items) so the SKU master doesn't need to be
configured. The bpc lookup is also seeded from those items so customer return
quantities (which don't carry packaging_units) can still convert correctly.
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

BASE_URL = os.environ.get(
    "REACT_APP_BACKEND_URL",
    "https://invoice-export-11.preview.emergentagent.com",
).rstrip("/")
ADMIN_EMAIL = "surya.yadavalli@nylaairwater.earth"
ADMIN_PASS = "test123"
TENANT_ID = "nyla-air-water"


def _login():
    r = requests.post(
        f"{BASE_URL}/api/auth/login",
        json={"email": ADMIN_EMAIL, "password": ADMIN_PASS},
        timeout=20,
    )
    if r.status_code != 200:
        pytest.skip(f"Login failed: {r.status_code}")
    return r.json()["session_token"]


@pytest.fixture(scope="module")
def token():
    return _login()


def _auth(t):
    return {"Authorization": f"Bearer {t}"}


def _db():
    return AsyncIOMotorClient(os.environ["MONGO_URL"])[os.environ["DB_NAME"]]


@pytest.fixture(scope="module")
def scenario():
    """Seed an SKU WITHOUT bottles_per_crate on master_skus. The factory
    warehouse row + delivery items each carry the bpc explicitly. The
    dashboard must still report everything in crates."""
    distributor_id = str(uuid.uuid4())
    factory_loc_id = str(uuid.uuid4())
    sku_id = str(uuid.uuid4())
    fws_id = str(uuid.uuid4())
    account_id = str(uuid.uuid4())
    scheduled_delivery_id = str(uuid.uuid4())
    scheduled_item_id = str(uuid.uuid4())
    cust_return_id = str(uuid.uuid4())
    now = datetime.now(timezone.utc).isoformat()

    BPC = 24
    RECEIVED_CRATES = 140
    SCHEDULED_CRATES = 36   # the user's exact scenario from the screenshot
    CUST_RET_CRATES = 35

    async def _setup():
        db = _db()
        await db.distributors.insert_one({
            "id": distributor_id, "tenant_id": TENANT_ID,
            "distributor_name": "ITER185-Dist", "distributor_code": "DIST-ITER185",
            "billing_approach": "margin_upfront",
        })
        await db.distributor_locations.insert_one({
            "id": factory_loc_id, "tenant_id": TENANT_ID,
            "distributor_id": distributor_id,
            "location_name": "ITER185 Factory WH", "city": "Hyderabad",
            "is_factory": True, "status": "active",
        })
        # No bottles_per_crate on the master — must NOT be needed.
        await db.master_skus.insert_one({
            "id": sku_id, "tenant_id": TENANT_ID,
            "sku_name": "ITER185 660ml No-BPC",
            "category": "test", "is_active": True,
        })
        await db.factory_warehouse_stock.insert_one({
            "id": fws_id, "tenant_id": TENANT_ID,
            "warehouse_location_id": factory_loc_id,
            "sku_id": sku_id, "sku_name": "ITER185 660ml No-BPC",
            "quantity": RECEIVED_CRATES * BPC,
            "bottles_per_crate": BPC,
            "created_at": now, "updated_at": now,
        })
        await db.accounts.insert_one({
            "id": account_id, "tenant_id": TENANT_ID,
            "account_name": "ITER185 Customer", "city": "Hyderabad",
            "state": "Telangana", "billed_by": "company",
        })
        await db.distributor_deliveries.insert_one({
            "id": scheduled_delivery_id, "tenant_id": TENANT_ID,
            "distributor_id": distributor_id,
            "distributor_location_id": factory_loc_id,
            "account_id": account_id, "account_name": "ITER185 Customer",
            "delivery_number": "DEL-ITER185-1",
            "delivery_date": now[:10],
            "status": "delivery_scheduled",
            "created_at": now,
        })
        # quantity is in BOTTLES; packaging_units carries the per-line bpc.
        await db.distributor_delivery_items.insert_one({
            "id": scheduled_item_id, "tenant_id": TENANT_ID,
            "delivery_id": scheduled_delivery_id,
            "sku_id": sku_id, "sku_name": "ITER185 660ml No-BPC",
            "quantity": SCHEDULED_CRATES * BPC,
            "packaging_units": BPC,         # <-- key field
            "unit_price": 56,
        })
        # Returns DON'T carry packaging_units — they rely on bpc_by_sku.
        await db.customer_returns.insert_one({
            "id": cust_return_id, "tenant_id": TENANT_ID,
            "distributor_id": distributor_id,
            "account_id": account_id,
            "return_number": "RET-ITER185-1",
            "status": "complete",
            "items": [{
                "sku_id": sku_id, "sku_name": "ITER185 660ml No-BPC",
                "quantity": CUST_RET_CRATES * BPC,
                "reason_category": "empty_reusable",
            }],
            "created_at": now,
        })

    async def _teardown():
        db = _db()
        await db.customer_returns.delete_one({"id": cust_return_id})
        await db.distributor_delivery_items.delete_one({"id": scheduled_item_id})
        await db.distributor_deliveries.delete_one({"id": scheduled_delivery_id})
        await db.accounts.delete_one({"id": account_id})
        await db.factory_warehouse_stock.delete_one({"id": fws_id})
        await db.master_skus.delete_one({"id": sku_id})
        await db.distributor_locations.delete_one({"id": factory_loc_id})
        await db.distributors.delete_one({"id": distributor_id})

    asyncio.run(_setup())
    yield {
        "distributor_id": distributor_id, "sku_id": sku_id,
        "received_crates": RECEIVED_CRATES,
        "scheduled_crates": SCHEDULED_CRATES,
        "cust_ret_crates": CUST_RET_CRATES,
    }
    asyncio.run(_teardown())


def _get_dashboard(token, distributor_id):
    r = requests.get(
        f"{BASE_URL}/api/distributors/{distributor_id}/stock-dashboard",
        headers=_auth(token), timeout=30,
    )
    assert r.status_code == 200, r.text
    return r.json()


class TestStockDashboardUnitsAreCrates:

    def test_pending_out_is_in_crates_not_bottles(self, token, scenario):
        data = _get_dashboard(token, scenario["distributor_id"])
        sku = next(s for s in data["skus"] if s["sku_id"] == scenario["sku_id"])
        # The bug would yield 864 (= 36 crates × 24 bottles). Correct: 36.
        assert sku["stock_pending_out"] == scenario["scheduled_crates"], (
            f"pending_out should be {scenario['scheduled_crates']} crates, "
            f"got {sku['stock_pending_out']}"
        )

    def test_customer_returns_in_crates_via_seeded_bpc(self, token, scenario):
        """Returns don't carry packaging_units. They must convert correctly
        from the bpc seeded by the delivery item (line: ITER185)."""
        data = _get_dashboard(token, scenario["distributor_id"])
        sku = next(s for s in data["skus"] if s["sku_id"] == scenario["sku_id"])
        assert sku["customer_returns"] == scenario["cust_ret_crates"], (
            f"customer_returns should be {scenario['cust_ret_crates']} crates, "
            f"got {sku['customer_returns']}"
        )

    def test_at_hand_matches_pure_crate_math(self, token, scenario):
        data = _get_dashboard(token, scenario["distributor_id"])
        sku = next(s for s in data["skus"] if s["sku_id"] == scenario["sku_id"])
        # received(140) − delivered(0) − pending(36) − factory_returns(0) = 104
        expected = scenario["received_crates"] - scenario["scheduled_crates"]
        assert sku["stock_at_hand"] == expected, (
            f"at_hand should be {expected} crates, got {sku['stock_at_hand']}"
        )
