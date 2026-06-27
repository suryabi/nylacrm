"""
Iteration 184 — Stock Dashboard formula fix.

User-reported bugs (2026-05-28):
  1. `customer_returns` was being ADDED back to `stock_at_hand` — returned
     bottles aren't deliverable (empty / damaged / expired), so this inflated
     the at-hand figure and could allow over-deliveries.
  2. Scheduled / on-the-way deliveries never depleted stock-at-hand — only
     COMPLETED deliveries did. A driver could be assigned 30 crates yet the
     dashboard would still show all 140 as available, letting staff schedule
     more deliveries against the same crates.

Fix asserts:
  • A scheduled (`delivery_scheduled`) delivery shows up as `stock_pending_out`
    AND deducts from `stock_at_hand`.
  • Customer returns appear in `customer_returns` but do NOT increase
    `stock_at_hand`.
  • Sum-check: received − delivered − pending_out − factory_returns ==
    stock_at_hand (no return add-back).
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
    "https://accounting-inbox.preview.emergentagent.com",
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
    """Seed the exact user-reported scenario: 140 crates received in factory
    warehouse, 30 crates committed via a `delivery_scheduled` delivery, and a
    20-crate customer return — and assert the dashboard shows them all
    correctly under the new formula.
    """
    distributor_id = str(uuid.uuid4())
    factory_loc_id = str(uuid.uuid4())
    sku_id = str(uuid.uuid4())
    fws_id = str(uuid.uuid4())
    account_id = str(uuid.uuid4())
    scheduled_delivery_id = str(uuid.uuid4())
    scheduled_item_id = str(uuid.uuid4())
    cust_return_id = str(uuid.uuid4())
    now = datetime.now(timezone.utc).isoformat()

    # 140 crates × 24 bottles = 3360 bottles in factory warehouse
    BPC = 24
    RECEIVED_CRATES = 140
    SCHEDULED_CRATES = 30
    CUST_RET_CRATES = 20

    async def _setup():
        db = _db()
        await db.distributors.insert_one({
            "id": distributor_id, "tenant_id": TENANT_ID,
            "distributor_name": "ITER184-Dist", "distributor_code": "DIST-ITER184",
            "billing_approach": "margin_upfront",
        })
        await db.distributor_locations.insert_one({
            "id": factory_loc_id, "tenant_id": TENANT_ID,
            "distributor_id": distributor_id,
            "location_name": "ITER184 Factory WH", "city": "Hyderabad",
            "is_factory": True, "status": "active",
        })
        await db.master_skus.insert_one({
            "id": sku_id, "tenant_id": TENANT_ID,
            "sku_name": "ITER184 Test SKU 330ml",
            "bottles_per_crate": BPC,
            "category": "test", "is_active": True,
        })
        await db.factory_warehouse_stock.insert_one({
            "id": fws_id, "tenant_id": TENANT_ID,
            "warehouse_location_id": factory_loc_id,
            "sku_id": sku_id, "sku_name": "ITER184 Test SKU 330ml",
            "quantity": RECEIVED_CRATES * BPC,   # bottles
            "bottles_per_crate": BPC,
            "created_at": now, "updated_at": now,
        })
        await db.accounts.insert_one({
            "id": account_id, "tenant_id": TENANT_ID,
            "account_name": "ITER184 Customer", "city": "Hyderabad",
            "state": "Telangana", "billed_by": "company",
        })
        # Scheduled (not yet delivered) delivery — should appear in pending_out
        await db.distributor_deliveries.insert_one({
            "id": scheduled_delivery_id, "tenant_id": TENANT_ID,
            "distributor_id": distributor_id,
            "distributor_location_id": factory_loc_id,
            "account_id": account_id, "account_name": "ITER184 Customer",
            "delivery_number": "DEL-ITER184-S",
            "delivery_date": now[:10],
            "status": "delivery_scheduled",       # <- key
            "created_at": now,
        })
        await db.distributor_delivery_items.insert_one({
            "id": scheduled_item_id, "tenant_id": TENANT_ID,
            "delivery_id": scheduled_delivery_id,
            "sku_id": sku_id, "sku_name": "ITER184 Test SKU 330ml",
            "quantity": SCHEDULED_CRATES * BPC,   # bottles
            "unit_price": 56,
        })
        # Customer return — should NOT add back to at-hand
        await db.customer_returns.insert_one({
            "id": cust_return_id, "tenant_id": TENANT_ID,
            "distributor_id": distributor_id,
            "account_id": account_id,
            "return_number": "RET-ITER184-1",
            "status": "complete",
            "items": [{
                "sku_id": sku_id, "sku_name": "ITER184 Test SKU 330ml",
                "quantity": CUST_RET_CRATES * BPC,   # bottles
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
        "distributor_id": distributor_id,
        "sku_id": sku_id,
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


class TestStockDashboardFormula:

    def test_pending_out_is_surfaced(self, token, scenario):
        data = _get_dashboard(token, scenario["distributor_id"])
        t = data["totals"]
        assert t["stock_pending_out"] == scenario["scheduled_crates"], (
            f"Expected {scenario['scheduled_crates']} pending crates, got {t['stock_pending_out']}"
        )
        sku = next(s for s in data["skus"] if s["sku_id"] == scenario["sku_id"])
        assert sku["stock_pending_out"] == scenario["scheduled_crates"]

    def test_at_hand_drops_by_pending_out(self, token, scenario):
        """140 received − 30 scheduled = 110 at-hand. Earlier code returned 140."""
        data = _get_dashboard(token, scenario["distributor_id"])
        expected = scenario["received_crates"] - scenario["scheduled_crates"]
        assert data["totals"]["stock_at_hand"] == expected, (
            f"Expected {expected} crates at hand, got {data['totals']['stock_at_hand']}"
        )

    def test_customer_returns_do_not_add_back_to_at_hand(self, token, scenario):
        """20-crate customer return must NOT inflate at-hand. It must show in
        customer_returns counter but at-hand stays at 110, not 130."""
        data = _get_dashboard(token, scenario["distributor_id"])
        t = data["totals"]
        assert t["customer_returns"] == scenario["cust_ret_crates"]
        assert t["stock_at_hand"] != (
            scenario["received_crates"]
            - scenario["scheduled_crates"]
            + scenario["cust_ret_crates"]
        ), "Returns must not add back to at-hand"

    def test_formula_sum_check(self, token, scenario):
        data = _get_dashboard(token, scenario["distributor_id"])
        t = data["totals"]
        derived = (
            t["stock_received"]
            - t["stock_delivered"]
            - t["stock_pending_out"]
            - t["factory_returns"]
        )
        assert derived == t["stock_at_hand"], (
            f"Formula mismatch: derived={derived}, returned={t['stock_at_hand']}"
        )
