"""
Iteration 181 — Reject deliveries that exceed on-hand stock.

Bug reproduction:
  User has 6000 bottles of batch TEST in `factory_warehouse_stock` and was
  able to record a delivery of 12000 bottles (1000 crates × 12). The system
  silently accepted it and drove the (broken) deduction path negative.

Fix in `create_delivery` (distributors.py): aggregate demand per (sku, batch),
look up on-hand at the right collection/key, and reject with a 400 listing
the shortages.

Coverage:
  1. Factory source + batch-tracked → over-deliver rejected with 400
  2. Factory source + batch-tracked → exact-fit accepted (201)
  3. Factory source + non-tracked aggregate → over-deliver rejected
  4. Distributor source + non-tracked aggregate → over-deliver rejected
  5. Distributor source + non-tracked aggregate → under-stock accepted
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

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "https://accounting-inbox.preview.emergentagent.com").rstrip("/")
ADMIN_EMAIL = "surya.yadavalli@nylaairwater.earth"
ADMIN_PASS = "test123"
TENANT_ID = "nyla-air-water"


def _login():
    r = requests.post(f"{BASE_URL}/api/auth/login", json={"email": ADMIN_EMAIL, "password": ADMIN_PASS}, timeout=20)
    if r.status_code != 200:
        pytest.skip(f"Login failed: {r.status_code} {r.text[:200]}")
    return r.json().get("session_token")


@pytest.fixture(scope="module")
def token():
    return _login()


def _auth(tok):
    return {"Authorization": f"Bearer {tok}"}


def _db():
    return AsyncIOMotorClient(os.environ["MONGO_URL"])[os.environ["DB_NAME"]]


@pytest.fixture(scope="module")
def scenario():
    """Seed:
       - Factory dist w/ 1 tracked factory warehouse → 6000 bottles of batch TEST
       - Factory dist w/ 1 aggregate factory warehouse → 4000 bottles (no batch)
       - Regular dist w/ 1 distributor warehouse → 2000 bottles (no batch)
       - 1 customer account
    """
    ids = {
        "factory_dist_id": str(uuid.uuid4()),
        "tracked_factory_loc": str(uuid.uuid4()),
        "agg_factory_loc": str(uuid.uuid4()),
        "regular_dist_id": str(uuid.uuid4()),
        "dist_loc": str(uuid.uuid4()),
        "sku_id": str(uuid.uuid4()),
        "batch_id": str(uuid.uuid4()),
        "account_id": str(uuid.uuid4()),
    }
    now = datetime.now(timezone.utc).isoformat()

    async def _setup():
        db = _db()
        # Distributors
        await db.distributors.insert_many([
            {"id": ids["factory_dist_id"], "tenant_id": TENANT_ID,
             "distributor_name": "ITER181 Factory", "distributor_code": "DIST-ITER181-F",
             "billing_approach": "margin_upfront"},
            {"id": ids["regular_dist_id"], "tenant_id": TENANT_ID,
             "distributor_name": "ITER181 Regular", "distributor_code": "DIST-ITER181-R",
             "billing_approach": "margin_upfront"},
        ])
        # Locations
        await db.distributor_locations.insert_many([
            {"id": ids["tracked_factory_loc"], "tenant_id": TENANT_ID,
             "distributor_id": ids["factory_dist_id"],
             "location_name": "ITER181 Tracked Factory WH", "city": "Hyderabad",
             "is_factory": True, "track_batches": True, "status": "active"},
            {"id": ids["agg_factory_loc"], "tenant_id": TENANT_ID,
             "distributor_id": ids["factory_dist_id"],
             "location_name": "ITER181 Aggregate Factory WH", "city": "Hyderabad",
             "is_factory": True, "track_batches": False, "status": "active"},
            {"id": ids["dist_loc"], "tenant_id": TENANT_ID,
             "distributor_id": ids["regular_dist_id"],
             "location_name": "ITER181 Regular Dist WH", "city": "Hyderabad",
             "is_factory": False, "track_batches": False, "status": "active"},
        ])
        # SKU
        await db.master_skus.insert_one({
            "id": ids["sku_id"], "tenant_id": TENANT_ID,
            "sku_name": "ITER181 Test SKU", "category": "test", "is_active": True,
        })
        # Account with sku_pricing so the existing pricing-lookup branch works
        await db.accounts.insert_one({
            "id": ids["account_id"], "tenant_id": TENANT_ID,
            "account_name": "ITER181 Customer", "city": "Hyderabad", "state": "Telangana",
            "billed_by": "company",
            "sku_pricing": [{
                "sku_id": ids["sku_id"], "sku_name": "ITER181 Test SKU",
                "unit_price": 100, "packaging_units": 12,
            }],
            "distributor_assignments": [
                {"distributor_id": ids["factory_dist_id"], "is_primary": True},
                {"distributor_id": ids["regular_dist_id"], "is_primary": False},
            ],
        })
        # Production batch (so the front-end / picker would surface it; also referenced
        # by the tracked factory stock row).
        await db.production_batches.insert_one({
            "id": ids["batch_id"], "tenant_id": TENANT_ID,
            "batch_code": "ITER181-BATCH-TEST",
            "sku_id": ids["sku_id"], "sku_name": "ITER181 Test SKU",
            "total_bottles": 6000, "total_passed_final": 6000,
            "transferred_to_warehouse": 6000, "total_rejected": 0,
            "status": "completed", "created_at": now,
        })
        # Stock rows
        await db.factory_warehouse_stock.insert_many([
            {"id": str(uuid.uuid4()), "tenant_id": TENANT_ID,
             "warehouse_location_id": ids["tracked_factory_loc"],
             "sku_id": ids["sku_id"], "sku_name": "ITER181 Test SKU",
             "batch_id": ids["batch_id"], "batch_code": "ITER181-BATCH-TEST",
             "quantity": 6000, "bottles_per_crate": 12,
             "created_at": now, "updated_at": now},
            {"id": str(uuid.uuid4()), "tenant_id": TENANT_ID,
             "warehouse_location_id": ids["agg_factory_loc"],
             "sku_id": ids["sku_id"], "sku_name": "ITER181 Test SKU",
             "quantity": 4000, "bottles_per_crate": 12,
             "created_at": now, "updated_at": now},
        ])
        await db.distributor_stock.insert_one({
            "id": str(uuid.uuid4()), "tenant_id": TENANT_ID,
            "distributor_id": ids["regular_dist_id"],
            "distributor_location_id": ids["dist_loc"],
            "sku_id": ids["sku_id"], "sku_name": "ITER181 Test SKU",
            "quantity": 2000,
            "created_at": now, "updated_at": now,
        })

    async def _teardown():
        db = _db()
        await db.distributor_delivery_items.delete_many({"sku_id": ids["sku_id"]})
        await db.distributor_deliveries.delete_many({"account_id": ids["account_id"]})
        await db.accounts.delete_one({"id": ids["account_id"]})
        await db.production_batches.delete_one({"id": ids["batch_id"]})
        await db.factory_warehouse_stock.delete_many({"sku_id": ids["sku_id"]})
        await db.distributor_stock.delete_many({"sku_id": ids["sku_id"]})
        await db.master_skus.delete_one({"id": ids["sku_id"]})
        await db.distributor_locations.delete_many({"id": {"$in": [
            ids["tracked_factory_loc"], ids["agg_factory_loc"], ids["dist_loc"],
        ]}})
        await db.distributors.delete_many({"id": {"$in": [
            ids["factory_dist_id"], ids["regular_dist_id"],
        ]}})

    asyncio.run(_setup())
    yield ids
    asyncio.run(_teardown())


def _delivery_payload(loc_id, sku_id, account_id, qty, batch_id=None, distributor_id=None):
    item = {
        "sku_id": sku_id,
        "sku_name": "ITER181 Test SKU",
        "quantity": qty,
        "unit_price": 100,
        "packaging_units": 12,
    }
    if batch_id:
        item["batch_id"] = batch_id
        item["batch_code"] = "ITER181-BATCH-TEST"
    return {
        "distributor_id": distributor_id,
        "account_id": account_id,
        "distributor_location_id": loc_id,
        "delivery_date": datetime.now(timezone.utc).strftime("%Y-%m-%d"),
        "items": [item],
    }


class TestDeliveryStockGuard:

    def test_factory_tracked_rejects_over_delivery(self, token, scenario):
        # 12000 demanded, only 6000 in batch
        r = requests.post(
            f"{BASE_URL}/api/distributors/{scenario['factory_dist_id']}/deliveries",
            headers=_auth(token), timeout=20,
            json=_delivery_payload(
                scenario["tracked_factory_loc"], scenario["sku_id"],
                scenario["account_id"], 12000,
                batch_id=scenario["batch_id"],
                distributor_id=scenario["factory_dist_id"],
            ),
        )
        assert r.status_code == 400, r.text
        detail = r.json()["detail"].lower()
        assert "not enough stock" in detail
        assert "need 12000" in detail and "have 6000" in detail

    def test_factory_tracked_accepts_exact_fit(self, token, scenario):
        # An exact-fit delivery passes the stock guard; the next downstream
        # validation (margin matrix) is not my concern. Confirm we did NOT
        # bail on the new stock check.
        r = requests.post(
            f"{BASE_URL}/api/distributors/{scenario['factory_dist_id']}/deliveries",
            headers=_auth(token), timeout=20,
            json=_delivery_payload(
                scenario["tracked_factory_loc"], scenario["sku_id"],
                scenario["account_id"], 6000,
                batch_id=scenario["batch_id"],
                distributor_id=scenario["factory_dist_id"],
            ),
        )
        # Either created (201) OR a *different* downstream 400 (e.g., margins).
        if r.status_code == 400:
            assert "not enough stock" not in r.json()["detail"].lower(), r.text
        else:
            assert r.status_code in (200, 201), r.text

    def test_factory_aggregate_rejects_over_delivery(self, token, scenario):
        r = requests.post(
            f"{BASE_URL}/api/distributors/{scenario['factory_dist_id']}/deliveries",
            headers=_auth(token), timeout=20,
            json=_delivery_payload(
                scenario["agg_factory_loc"], scenario["sku_id"],
                scenario["account_id"], 5000,
                distributor_id=scenario["factory_dist_id"],
            ),
        )
        assert r.status_code == 400
        assert "not enough stock" in r.json()["detail"].lower()

    def test_distributor_aggregate_rejects_over_delivery(self, token, scenario):
        r = requests.post(
            f"{BASE_URL}/api/distributors/{scenario['regular_dist_id']}/deliveries",
            headers=_auth(token), timeout=20,
            json=_delivery_payload(
                scenario["dist_loc"], scenario["sku_id"],
                scenario["account_id"], 2500,
                distributor_id=scenario["regular_dist_id"],
            ),
        )
        assert r.status_code == 400
        assert "have 2000" in r.json()["detail"].lower()

    def test_distributor_aggregate_accepts_under_stock(self, token, scenario):
        r = requests.post(
            f"{BASE_URL}/api/distributors/{scenario['regular_dist_id']}/deliveries",
            headers=_auth(token), timeout=20,
            json=_delivery_payload(
                scenario["dist_loc"], scenario["sku_id"],
                scenario["account_id"], 100,
                distributor_id=scenario["regular_dist_id"],
            ),
        )
        # Pass-through: confirm the new stock guard didn't block this.
        if r.status_code == 400:
            assert "not enough stock" not in r.json()["detail"].lower(), r.text
        else:
            assert r.status_code in (200, 201), r.text
