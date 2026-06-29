"""Backend regression for Delivery Order pending-approval persistence.

Feature: when a delivery order transitions to current_state_key='pending_approval'
the order is persisted with pending_approver_id/pending_approver_name matching
the requester's reporting_manager. If the requester has no reporting_manager,
both fields are None (no crash).

Strategy:
- Use CEO login. CEO has no reporting_manager_id by default.
- Test A (with-manager path): temporarily set CEO.reporting_manager_id =
  admin user, create a draft DO, submit -> pending_approval, assert fields
  match admin (id+name) on transition response and GET /api/delivery-orders/{id}.
- Test B (null path): clear CEO.reporting_manager_id, create another DO,
  submit -> pending_approval, assert pending_approver_name is None and the
  transition succeeds.
- Test C (regression): list endpoint still works; GET on the created order
  returns the expected fields.

Cleanup: delete seeded DOs, restore CEO.reporting_manager_id to original.
"""
import os
import asyncio
import requests
from datetime import date, timedelta
from dotenv import load_dotenv

# load backend env so MONGO_URL/DB_NAME are visible
load_dotenv("/app/backend/.env")
load_dotenv("/app/frontend/.env")

import pytest
from motor.motor_asyncio import AsyncIOMotorClient

BASE = os.environ.get("REACT_APP_BACKEND_URL", "").rstrip("/")
assert BASE, "REACT_APP_BACKEND_URL must be set"

EMAIL = "surya.yadavalli@nylaairwater.earth"
PASSWORD = "test123"
TENANT = "nyla-air-water"
CEO_ID = "7d03cff4-4db2-4b2e-969b-f5b3d57d58a6"
ADMIN_ID = "38a4c602-8f1f-47fc-99fb-a56eea37fcd9"
ADMIN_NAME = "System Admin"
EMPIRE_ACCOUNT_ID = "d4e2187a-5e7d-4847-902b-b6699ae910fc"

_mongo_client = AsyncIOMotorClient(os.environ["MONGO_URL"])
_db = _mongo_client[os.environ["DB_NAME"]]


# ───────────────────── helpers ─────────────────────
def _login():
    s = requests.Session()
    s.headers.update({"Content-Type": "application/json", "X-Tenant-ID": TENANT})
    r = s.post(f"{BASE}/api/auth/login",
               json={"email": EMAIL, "password": PASSWORD, "tenant_id": TENANT})
    assert r.status_code == 200, f"login failed: {r.status_code} {r.text[:300]}"
    j = r.json()
    tok = j.get("access_token") or j.get("token") or j.get("session_token")
    assert tok, f"no token in {j}"
    s.headers.update({"Authorization": f"Bearer {tok}"})
    return s


def _pick_sku(s):
    r = s.get(f"{BASE}/api/master-skus")
    assert r.status_code == 200, r.text[:200]
    d = r.json()
    items = d.get("skus") or d.get("items") or (d if isinstance(d, list) else [])
    assert items, "no SKUs in tenant"
    return items[0]


def _create_do(s, sku, tag):
    requested = (date.today() + timedelta(days=5)).isoformat()
    payload = {
        "recipient_type": "account",
        "account_id": EMPIRE_ACCOUNT_ID,
        "requested_date": requested,
        "reason": "Free Trial",
        "items": [{"sku_id": sku["id"], "sku_name": sku.get("name"),
                   "quantity": 1, "unit_price": 10}],
        "delivery_address": {"city": "Bengaluru", "formatted_address": "Bengaluru"},
        "notes": f"TEST_pending_approver {tag}",
    }
    r = s.post(f"{BASE}/api/delivery-orders", json=payload)
    assert r.status_code == 200, f"create failed: {r.status_code} {r.text[:400]}"
    o = r.json()
    assert o.get("current_state_key") == "draft"
    return o


def _set_ceo_manager(mgr_id):
    """Synchronous helper to set/clear CEO.reporting_manager_id via Mongo."""
    async def _do():
        if mgr_id is None:
            await _db.users.update_one(
                {"id": CEO_ID, "tenant_id": TENANT},
                {"$unset": {"reporting_manager_id": ""}})
        else:
            await _db.users.update_one(
                {"id": CEO_ID, "tenant_id": TENANT},
                {"$set": {"reporting_manager_id": mgr_id}})
    asyncio.get_event_loop().run_until_complete(_do())


def _cleanup_do(order_id):
    async def _do():
        await _db.delivery_orders.delete_one({"id": order_id, "tenant_id": TENANT})
        # also nuke any approval task we created so the inbox stays clean
        await _db.tasks.delete_many(
            {"related_type": "delivery_order", "related_id": order_id, "tenant_id": TENANT})
    asyncio.get_event_loop().run_until_complete(_do())


@pytest.fixture(scope="module", autouse=True)
def restore_ceo_manager():
    """Save original reporting_manager_id and restore after the module runs."""
    async def _get():
        u = await _db.users.find_one({"id": CEO_ID, "tenant_id": TENANT},
                                      {"_id": 0, "reporting_manager_id": 1})
        return (u or {}).get("reporting_manager_id")
    original = asyncio.get_event_loop().run_until_complete(_get())
    yield
    _set_ceo_manager(original)


# ───────────────────── tests ─────────────────────
class TestPendingApproverPersistence:
    """pending_approver_id / pending_approver_name on submit -> pending_approval."""

    def test_with_manager_persists_approver(self):
        # Arrange: give CEO a reporting manager (System Admin)
        _set_ceo_manager(ADMIN_ID)
        s = _login()
        sku = _pick_sku(s)
        order = _create_do(s, sku, "with-manager")
        try:
            # Act: submit
            r = s.post(f"{BASE}/api/delivery-orders/{order['id']}/transition",
                       json={"action_key": "submit", "comment": "TEST submit"})
            assert r.status_code == 200, f"transition failed: {r.status_code} {r.text[:400]}"
            body = r.json()
            assert body.get("ok") is True

            transitioned = body.get("order") or {}
            assert transitioned.get("current_state_key") == "pending_approval"
            # Transition response should include the persisted approver fields
            assert transitioned.get("pending_approver_id") == ADMIN_ID, transitioned
            assert transitioned.get("pending_approver_name") == ADMIN_NAME, transitioned

            # And a fresh GET must mirror them (persistence check)
            g = s.get(f"{BASE}/api/delivery-orders/{order['id']}")
            assert g.status_code == 200, g.text[:300]
            fetched = g.json()
            assert fetched["current_state_key"] == "pending_approval"
            assert fetched["pending_approver_id"] == ADMIN_ID
            assert fetched["pending_approver_name"] == ADMIN_NAME
        finally:
            _cleanup_do(order["id"])

    def test_without_manager_persists_null_approver_no_crash(self):
        # Arrange: clear CEO's reporting_manager
        _set_ceo_manager(None)
        s = _login()
        sku = _pick_sku(s)
        order = _create_do(s, sku, "no-manager")
        try:
            r = s.post(f"{BASE}/api/delivery-orders/{order['id']}/transition",
                       json={"action_key": "submit", "comment": "TEST submit no-mgr"})
            assert r.status_code == 200, f"transition failed: {r.status_code} {r.text[:400]}"
            transitioned = r.json().get("order") or {}
            assert transitioned.get("current_state_key") == "pending_approval"
            # No reporting manager -> both fields explicitly None (set, not missing)
            assert transitioned.get("pending_approver_id") is None
            assert transitioned.get("pending_approver_name") is None
            assert "pending_approver_id" in transitioned
            assert "pending_approver_name" in transitioned

            g = s.get(f"{BASE}/api/delivery-orders/{order['id']}")
            assert g.status_code == 200
            fetched = g.json()
            assert fetched["pending_approver_name"] is None
        finally:
            _cleanup_do(order["id"])


class TestRegression:
    """Basic create/list/fetch still works (transitions unaffected)."""

    def test_create_and_list_still_works(self):
        _set_ceo_manager(None)
        s = _login()
        sku = _pick_sku(s)
        order = _create_do(s, sku, "regression-list")
        try:
            assert order["id"]
            # GET single
            g = s.get(f"{BASE}/api/delivery-orders/{order['id']}")
            assert g.status_code == 200
            assert g.json()["id"] == order["id"]
            # Draft DO should NOT have pending_approver fields populated
            assert g.json().get("pending_approver_id") in (None,)
            # List
            lr = s.get(f"{BASE}/api/delivery-orders")
            assert lr.status_code == 200
            ids = [o["id"] for o in lr.json().get("orders", [])]
            assert order["id"] in ids
        finally:
            _cleanup_do(order["id"])
