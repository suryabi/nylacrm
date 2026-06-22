"""
Iteration 187 — Delivery stock guard must agree with the Stock Dashboard.

Production bug (2026-05-28): user saw 3,468 crates on the dashboard for the
'Pickval Warehouse (Goa)' distributor but `create_delivery` rejected with
"need 12, have 0". Reason: the guard read from `distributor_stock` while the
dashboard derives from `shipments delivered − deliveries`. Legacy data left
`distributor_stock` empty for that distributor.

Fix: For non-factory, non-batch-tracked sources, the guard now takes
`max(distributor_stock_sum, dashboard_derived)` so it never disagrees with
what the user just saw.
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
    "https://crm-suite-preview.preview.emergentagent.com",
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
    """Seed the exact production scenario: a delivered shipment of 3600
    bottles, NO distributor_stock row (simulating legacy / missing data), and
    attempt a delivery of 12 bottles. The guard must allow it because the
    dashboard-derived on-hand is 3600.
    """
    distributor_id = str(uuid.uuid4())
    location_id = str(uuid.uuid4())
    sku_id = str(uuid.uuid4())
    shipment_id = str(uuid.uuid4())
    shipment_item_id = str(uuid.uuid4())
    account_id = str(uuid.uuid4())
    now = datetime.now(timezone.utc).isoformat()

    async def _setup():
        db = _db()
        await db.distributors.insert_one({
            "id": distributor_id, "tenant_id": TENANT_ID,
            "distributor_name": "ITER187 Dist", "distributor_code": "DIST-ITER187",
            "billing_approach": "margin_upfront",
        })
        await db.distributor_locations.insert_one({
            "id": location_id, "tenant_id": TENANT_ID,
            "distributor_id": distributor_id,
            "location_name": "ITER187 Warehouse", "city": "Goa",
            "is_factory": False, "track_batches": False, "status": "active",
        })
        await db.master_skus.insert_one({
            "id": sku_id, "tenant_id": TENANT_ID,
            "sku_name": "ITER187 660ml", "category": "test", "is_active": True,
        })
        await db.accounts.insert_one({
            "id": account_id, "tenant_id": TENANT_ID,
            "account_name": "ITER187 Cust", "city": "Goa", "state": "Goa",
            "billed_by": "company",
            "sku_pricing": [{"sku_id": sku_id, "sku_name": "ITER187 660ml",
                              "unit_price": 100, "packaging_units": 12}],
            "distributor_assignments": [{"distributor_id": distributor_id, "is_primary": True}],
        })
        # Margin matrix row — required by downstream validation but not the
        # focus of this test. Without it create_delivery 400s before the
        # stock guard runs.
        await db.distributor_margin_matrix.insert_one({
            "id": str(uuid.uuid4()), "tenant_id": TENANT_ID,
            "distributor_id": distributor_id,
            "city": "Goa", "sku_id": sku_id,
            "margin_percent": 5, "status": "active",
        })
        # A delivered shipment of 3600 bottles. NO `distributor_stock` row —
        # this is the production gap we're patching around.
        await db.distributor_shipments.insert_one({
            "id": shipment_id, "tenant_id": TENANT_ID,
            "distributor_id": distributor_id,
            "distributor_location_id": location_id,
            "shipment_number": "SHP-ITER187-001",
            "status": "delivered",
            "shipment_date": now[:10], "delivered_at": now,
            "created_at": now,
        })
        await db.distributor_shipment_items.insert_one({
            "id": shipment_item_id, "tenant_id": TENANT_ID,
            "shipment_id": shipment_id,
            "sku_id": sku_id, "sku_name": "ITER187 660ml",
            "quantity": 3600, "received_quantity": 3600,
            "unit_price": 80,
        })

    async def _teardown():
        db = _db()
        await db.distributor_delivery_items.delete_many({"sku_id": sku_id})
        await db.distributor_deliveries.delete_many({"account_id": account_id})
        await db.distributor_shipment_items.delete_one({"id": shipment_item_id})
        await db.distributor_shipments.delete_one({"id": shipment_id})
        await db.distributor_margin_matrix.delete_many({"sku_id": sku_id})
        await db.accounts.delete_one({"id": account_id})
        await db.master_skus.delete_one({"id": sku_id})
        await db.distributor_locations.delete_one({"id": location_id})
        await db.distributors.delete_one({"id": distributor_id})

    asyncio.run(_setup())
    yield {
        "distributor_id": distributor_id, "location_id": location_id,
        "sku_id": sku_id, "account_id": account_id,
    }
    asyncio.run(_teardown())


def _payload(s, bottles_qty):
    return {
        "distributor_id": s["distributor_id"],
        "account_id": s["account_id"],
        "distributor_location_id": s["location_id"],
        "delivery_date": datetime.now(timezone.utc).strftime("%Y-%m-%d"),
        "items": [{
            "sku_id": s["sku_id"], "sku_name": "ITER187 660ml",
            # `quantity` is in BOTTLES (frontend sends pkgs × packaging_units).
            "quantity": bottles_qty,
            "unit_price": 100, "packaging_units": 12,
        }],
    }


class TestDeliveryGuardConsistencyWithDashboard:

    def test_guard_allows_when_distributor_stock_empty_but_shipment_delivered(self, token, scenario):
        """Production case: zero distributor_stock rows, but a delivered
        shipment of 3600 bottles. Guard must allow a 12-bottle delivery."""
        r = requests.post(
            f"{BASE_URL}/api/distributors/{scenario['distributor_id']}/deliveries",
            headers=_auth(token), timeout=20,
            json=_payload(scenario, 12),     # 1 crate
        )
        if r.status_code == 400:
            assert "not enough stock" not in r.json()["detail"].lower(), r.text
        else:
            assert r.status_code in (200, 201), r.text

    def test_guard_still_rejects_when_demand_exceeds_derived_on_hand(self, token, scenario):
        """3600 bottles received in total. Asking for 3700 must be rejected."""
        r = requests.post(
            f"{BASE_URL}/api/distributors/{scenario['distributor_id']}/deliveries",
            headers=_auth(token), timeout=20,
            json=_payload(scenario, 3700),
        )
        assert r.status_code == 400, r.text
        detail = r.json()["detail"].lower()
        assert "not enough stock" in detail, r.text
        assert "have 3600" in detail, r.text
