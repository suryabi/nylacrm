"""Iteration 322 — Delivery branded-stock scoping (Feb 2026 bug fix).

Covers the account-scoped filter added to:
  - GET /api/distributor/stock-transfers/location-stock  (?account_id=...)
  - GET /api/distributor/stock-transfers/batches-available (?account_id=...)

And the defensive "no matching branded row" guard in
POST /api/distributors/{id}/deliveries/{delivery_id}/complete which must
- Return HTTP 400 with a descriptive error
- Revert delivery status from 'complete' back to 'confirmed'
- Clear delivered_at / delivered_by
- Write `stock_deduction_error` on the delivery doc

Seed context (from agent_to_agent_context_note):
- PARENT SKU:      8bc87348-5398-4604-92d8-eff59610b7f9 (24 Brand)
- BRANDED CHILD:   ba79db11-532d-49a8-b629-d5a27c04d281 (24 Brand – Drive Folder Test Lead)
- OWNER ACCOUNT:   56b872b1-02e7-4a99-8391-8558c968f450 (Drive Folder Test Lead)
- OTHER ACCOUNT:   81263309-2118-4d51-b1d9-fe9549da07b7 (Toopa Ice-creamery)
- FACTORY LOC:     6eb87219-5585-4d73-8bc4-3c563da62233 (Default master, factory+batch-tracked)
  → 200 bottles branded (Drive Folder) + 200 bottles generic on batch 5bb86f13-...
"""
from __future__ import annotations
import os
import uuid
import pytest
import requests
from pymongo import MongoClient
from datetime import datetime, timezone

def _read_frontend_env_url():
    try:
        with open("/app/frontend/.env", "r") as f:
            for line in f:
                if line.strip().startswith("REACT_APP_BACKEND_URL="):
                    return line.split("=", 1)[1].strip().strip('"').strip("'")
    except OSError:
        pass
    return ""


BASE_URL = (os.environ.get("REACT_APP_BACKEND_URL") or _read_frontend_env_url()).rstrip("/")
assert BASE_URL, "REACT_APP_BACKEND_URL required (env or /app/frontend/.env)"

TENANT_ID = "nyla-air-water"
EMAIL = "surya.yadavalli@nylaairwater.earth"
PASSWORD = "test123"

PARENT_SKU_ID = "8bc87348-5398-4604-92d8-eff59610b7f9"
BRANDED_CHILD_ID = "ba79db11-532d-49a8-b629-d5a27c04d281"
OWNER_ACCOUNT_ID = "56b872b1-02e7-4a99-8391-8558c968f450"
OTHER_ACCOUNT_ID = "81263309-2118-4d51-b1d9-fe9549da07b7"
FACTORY_LOC_ID = "6eb87219-5585-4d73-8bc4-3c563da62233"
BRANDED_BATCH_ID = "5bb86f13-a57d-4b2f-9a46-c10fe22d8a94"

MONGO_URL = os.environ.get("MONGO_URL", "mongodb://localhost:27017")
DB_NAME = os.environ.get("DB_NAME", "test_database")


@pytest.fixture(scope="module")
def mongo():
    c = MongoClient(MONGO_URL)
    yield c[DB_NAME]
    c.close()


@pytest.fixture(scope="module")
def client():
    s = requests.Session()
    r = s.post(f"{BASE_URL}/api/auth/login",
               json={"email": EMAIL, "password": PASSWORD}, timeout=30)
    assert r.status_code == 200, r.text
    tok = r.json().get("session_token")
    assert tok
    s.headers.update({
        "Authorization": f"Bearer {tok}",
        "X-Tenant-ID": TENANT_ID,
        "Content-Type": "application/json",
    })
    yield s


# ─────────────────────────────────────────────────────────────────
# 1) /location-stock account_id scoping
# ─────────────────────────────────────────────────────────────────
class TestLocationStockAccountScoping:

    def _rows(self, resp_json):
        return resp_json.get("stock_by_child", [])

    def _has_child(self, rows, child_id):
        return any(r for r in rows
                   if r.get("sku_id") == PARENT_SKU_ID
                   and r.get("child_sku_id") == child_id
                   and int(r.get("quantity") or 0) > 0)

    def test_no_account_returns_all_rows(self, client):
        """Regression: omitting account_id keeps original behavior."""
        r = client.get(f"{BASE_URL}/api/distributor/stock-transfers/location-stock",
                       params={"location_id": FACTORY_LOC_ID}, timeout=30)
        assert r.status_code == 200, r.text
        rows = self._rows(r.json())
        assert self._has_child(rows, BRANDED_CHILD_ID), \
            "Branded row must be present when no account filter"
        assert self._has_child(rows, None), \
            "Generic row must be present when no account filter"

    def test_owner_account_sees_branded_and_generic(self, client):
        """Owner account of the branded child SEES its own branded row + generic."""
        r = client.get(f"{BASE_URL}/api/distributor/stock-transfers/location-stock",
                       params={"location_id": FACTORY_LOC_ID,
                               "account_id": OWNER_ACCOUNT_ID}, timeout=30)
        assert r.status_code == 200, r.text
        rows = self._rows(r.json())
        assert self._has_child(rows, BRANDED_CHILD_ID), \
            "Owner account must see its branded row"
        assert self._has_child(rows, None), "Generic must always be visible"

    def test_other_account_hides_branded_shows_generic(self, client):
        """DIFFERENT account MUST NOT see the branded row; generic still visible."""
        r = client.get(f"{BASE_URL}/api/distributor/stock-transfers/location-stock",
                       params={"location_id": FACTORY_LOC_ID,
                               "account_id": OTHER_ACCOUNT_ID}, timeout=30)
        assert r.status_code == 200, r.text
        rows = self._rows(r.json())
        assert not self._has_child(rows, BRANDED_CHILD_ID), \
            f"Other account MUST NOT see branded child {BRANDED_CHILD_ID}. rows={rows}"
        assert self._has_child(rows, None), "Generic row must remain visible"

    def test_aggregate_stock_sum_excludes_hidden_branded(self, client):
        """Aggregate `stock` per-SKU should reflect only what's visible."""
        r_all = client.get(f"{BASE_URL}/api/distributor/stock-transfers/location-stock",
                           params={"location_id": FACTORY_LOC_ID}, timeout=30)
        r_other = client.get(f"{BASE_URL}/api/distributor/stock-transfers/location-stock",
                             params={"location_id": FACTORY_LOC_ID,
                                     "account_id": OTHER_ACCOUNT_ID}, timeout=30)
        assert r_all.status_code == 200 and r_other.status_code == 200

        def _sku_qty(payload):
            for s in payload.json().get("stock", []):
                if s.get("sku_id") == PARENT_SKU_ID:
                    return int(s.get("quantity") or 0)
            return 0

        total_unfiltered = _sku_qty(r_all)
        total_scoped_other = _sku_qty(r_other)
        # Branded row (200) must be dropped when scoping to a different account.
        assert total_unfiltered - total_scoped_other >= 200, (
            f"Expected at least 200 bottles removed by scoping. "
            f"unfiltered={total_unfiltered} other={total_scoped_other}"
        )


# ─────────────────────────────────────────────────────────────────
# 2) /batches-available account_id scoping
# ─────────────────────────────────────────────────────────────────
class TestBatchesAvailableAccountScoping:

    def _find(self, batches, child_id):
        return [b for b in batches if b.get("child_sku_id") == child_id
                and int(b.get("quantity") or 0) > 0]

    def test_no_account_returns_all(self, client):
        r = client.get(f"{BASE_URL}/api/distributor/stock-transfers/batches-available",
                       params={"location_id": FACTORY_LOC_ID,
                               "sku_id": PARENT_SKU_ID}, timeout=30)
        assert r.status_code == 200, r.text
        batches = r.json().get("batches", [])
        assert self._find(batches, BRANDED_CHILD_ID), \
            "Branded batch must be listed when no account filter"
        assert self._find(batches, None), \
            "Generic batch row must be listed when no account filter"

    def test_owner_account_sees_branded_batch(self, client):
        r = client.get(f"{BASE_URL}/api/distributor/stock-transfers/batches-available",
                       params={"location_id": FACTORY_LOC_ID,
                               "sku_id": PARENT_SKU_ID,
                               "account_id": OWNER_ACCOUNT_ID}, timeout=30)
        assert r.status_code == 200, r.text
        batches = r.json().get("batches", [])
        assert self._find(batches, BRANDED_CHILD_ID), \
            "Owner account must see its branded batch"
        assert self._find(batches, None), "Generic batch always visible"

    def test_other_account_hides_branded_batch(self, client):
        r = client.get(f"{BASE_URL}/api/distributor/stock-transfers/batches-available",
                       params={"location_id": FACTORY_LOC_ID,
                               "sku_id": PARENT_SKU_ID,
                               "account_id": OTHER_ACCOUNT_ID}, timeout=30)
        assert r.status_code == 200, r.text
        batches = r.json().get("batches", [])
        assert not self._find(batches, BRANDED_CHILD_ID), \
            f"Other account must NOT see the branded batch. batches={batches}"
        assert self._find(batches, None), \
            "Generic batch must still be visible for the other account"


# ─────────────────────────────────────────────────────────────────
# 3) Defensive branded-deduction guard on complete_delivery
# ─────────────────────────────────────────────────────────────────
#
# This test SEEDS a synthetic delivery + item in the DB directly and points
# it at a branded child_sku_id whose stock row does NOT exist at the source
# warehouse. Calling complete must return 400 AND revert the delivery to
# 'confirmed' with `stock_deduction_error` populated.
class TestBrandedDeductionMissRevert:

    @pytest.fixture(scope="class")
    def seed(self, mongo, client):
        """Create a phantom delivery + item pointing at branded child with NO stock."""
        now = datetime.now(timezone.utc).isoformat()
        # Use factory location — but SKU + child that have NO stock row here.
        # Trick: assign a fresh child_sku_id (never existed anywhere) so the branded
        # deduction is guaranteed to miss. We insert a child_sku doc so the branded
        # is valid at API-level, but no factory_warehouse_stock row for it.
        phantom_child_id = f"TEST_PHANTOM_{uuid.uuid4().hex[:8]}"
        mongo.child_skus.insert_one({
            "id": phantom_child_id,
            "tenant_id": TENANT_ID,
            "parent_sku_id": PARENT_SKU_ID,
            "sku_name": "TEST 24 Brand – Phantom",
            "child_type": "customer",
            "customer_account_id": OWNER_ACCOUNT_ID,
            "created_at": now,
        })

        # Get distributor for the factory location
        loc = mongo.distributor_locations.find_one(
            {"id": FACTORY_LOC_ID}, {"_id": 0, "distributor_id": 1, "location_name": 1})
        assert loc, "factory loc must exist"
        distributor_id = loc["distributor_id"]

        delivery_id = f"TEST_DEL_{uuid.uuid4().hex[:8]}"
        item_id = f"TEST_ITEM_{uuid.uuid4().hex[:8]}"

        mongo.distributor_deliveries.insert_one({
            "id": delivery_id,
            "tenant_id": TENANT_ID,
            "distributor_id": distributor_id,
            "distributor_location_id": FACTORY_LOC_ID,
            "account_id": OWNER_ACCOUNT_ID,
            "delivery_number": f"TEST-DEL-{uuid.uuid4().hex[:6]}",
            "status": "confirmed",
            "delivery_date": now,
            "created_at": now,
            "updated_at": now,
        })
        mongo.distributor_delivery_items.insert_one({
            "id": item_id,
            "delivery_id": delivery_id,
            "tenant_id": TENANT_ID,
            "sku_id": PARENT_SKU_ID,
            "sku_name": "24 Brand",
            "child_sku_id": phantom_child_id,
            "child_sku_name": "TEST 24 Brand – Phantom",
            "quantity": 1,
            # No batch_id — since the sku has no branded stock row at all.
        })

        yield {
            "delivery_id": delivery_id,
            "distributor_id": distributor_id,
            "phantom_child_id": phantom_child_id,
        }

        # Teardown
        mongo.distributor_delivery_items.delete_many({"delivery_id": delivery_id})
        mongo.distributor_deliveries.delete_many({"id": delivery_id})
        mongo.child_skus.delete_many({"id": phantom_child_id})

    def test_complete_returns_400_and_reverts(self, client, mongo, seed):
        distributor_id = seed["distributor_id"]
        delivery_id = seed["delivery_id"]

        # Snapshot pre-state
        pre = mongo.distributor_deliveries.find_one({"id": delivery_id}, {"_id": 0})
        assert pre["status"] == "confirmed"

        r = client.post(
            f"{BASE_URL}/api/distributors/{distributor_id}/deliveries/{delivery_id}/complete",
            timeout=30,
        )
        # Expect a 400 (branded miss) — NOT a 200.
        assert r.status_code == 400, (
            f"Expected 400 on branded miss; got {r.status_code}: {r.text}"
        )
        body = r.json() if r.headers.get("content-type", "").startswith("application/json") else {}
        detail = (body.get("detail") or "").lower()
        assert "branded" in detail or "stock" in detail, (
            f"Error detail should mention branded/stock: {detail}"
        )

        # Verify delivery reverted to 'confirmed', delivered_* cleared, error stored.
        post = mongo.distributor_deliveries.find_one({"id": delivery_id}, {"_id": 0})
        assert post["status"] == "confirmed", (
            f"Delivery must be reverted to 'confirmed' after miss. Got: {post.get('status')}"
        )
        assert not post.get("delivered_at"), (
            f"delivered_at must be cleared. Got: {post.get('delivered_at')}"
        )
        assert not post.get("delivered_by"), (
            f"delivered_by must be cleared. Got: {post.get('delivered_by')}"
        )
        assert post.get("stock_deduction_error"), \
            "stock_deduction_error must be written on the delivery doc"
        err = post["stock_deduction_error"].lower()
        assert "branded" in err or "stock" in err or "no on-hand" in err.lower() \
            or "no stock row" in err, f"Unexpected error text: {err}"


# ─────────────────────────────────────────────────────────────────
# 4) Regression sanity — endpoints work for non-branded queries
# ─────────────────────────────────────────────────────────────────
class TestRegression:
    def test_batches_available_generic_untouched(self, client):
        """When account is not specified, generic + branded batches list per legacy."""
        r = client.get(f"{BASE_URL}/api/distributor/stock-transfers/batches-available",
                       params={"location_id": FACTORY_LOC_ID,
                               "sku_id": PARENT_SKU_ID}, timeout=30)
        assert r.status_code == 200
        batches = r.json().get("batches", [])
        # Both classifications should be listable
        classes = {b.get("child_sku_id") for b in batches}
        assert None in classes, f"Legacy list should include generic. Got: {classes}"

    def test_location_stock_no_account_backward_compatible(self, client):
        r = client.get(f"{BASE_URL}/api/distributor/stock-transfers/location-stock",
                       params={"location_id": FACTORY_LOC_ID}, timeout=30)
        assert r.status_code == 200
        js = r.json()
        assert "stock" in js and "stock_by_child" in js and "is_factory" in js
        assert js["is_factory"] is True
