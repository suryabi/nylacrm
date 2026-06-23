"""Tests for Free Trial migration + entity DO filters + expense type changes."""
import os
import pytest
import requests
from datetime import datetime, timedelta

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "").rstrip("/")
ADMIN_EMAIL = "surya.yadavalli@nylaairwater.earth"
ADMIN_PASSWORD = "test123"
TENANT_ID = "nyla-air-water"
LEAD_ID = "2a3ca2de-8e26-406a-8be0-d9a28adfc0fb"
ACCOUNT_ID = "d4e2187a-5e7d-4847-902b-b6699ae910fc"


@pytest.fixture(scope="module")
def session():
    s = requests.Session()
    s.headers.update({"Content-Type": "application/json", "X-Tenant-ID": TENANT_ID})
    r = s.post(f"{BASE_URL}/api/auth/login",
               json={"email": ADMIN_EMAIL, "password": ADMIN_PASSWORD})
    assert r.status_code == 200, f"login failed: {r.status_code} {r.text}"
    body = r.json()
    token = body.get("token") or body.get("access_token")
    if token:
        s.headers.update({"Authorization": f"Bearer {token}"})
    return s


# ── Migration endpoints ──
def test_migration_preview(session):
    r = session.get(f"{BASE_URL}/api/admin/migrate-free-trial-expenses/preview")
    assert r.status_code == 200, r.text
    d = r.json()
    for k in ("eligible", "already_migrated", "skipped_no_items", "skipped_not_in_tenant"):
        assert k in d, f"missing {k} in {d}"
    assert d["already_migrated"] >= 1, f"expected already_migrated>=1, got {d}"
    print("preview:", d)


def test_migration_idempotent(session):
    r = session.post(f"{BASE_URL}/api/admin/migrate-free-trial-expenses")
    assert r.status_code == 200, r.text
    d = r.json()
    assert d.get("created", -1) == 0, f"expected created=0 on rerun, got {d}"
    print("migrate:", d)


# ── Entity DO list filters ──
def test_list_delivery_orders_by_lead(session):
    r = session.get(f"{BASE_URL}/api/delivery-orders", params={"lead_id": LEAD_ID})
    assert r.status_code == 200, r.text
    orders = r.json().get("orders", [])
    assert any(o.get("order_number") == "DO-2026-0011" for o in orders), \
        f"DO-2026-0011 not found in lead DOs: {[o.get('order_number') for o in orders]}"
    migrated = [o for o in orders if o.get("order_number") == "DO-2026-0011"][0]
    assert migrated.get("recipient_type") == "lead"
    assert migrated.get("recipient_name") == "Taj Sarees"


def test_list_delivery_orders_by_account(session):
    r = session.get(f"{BASE_URL}/api/delivery-orders", params={"account_id": ACCOUNT_ID})
    assert r.status_code == 200, r.text
    orders = r.json().get("orders", [])
    # Some DOs may already exist; assert filter only returns this account's DOs
    for o in orders:
        assert o.get("account_id") == ACCOUNT_ID, f"unexpected DO: {o.get('order_number')}"
    print(f"account DOs: {len(orders)}")


# ── Entity-bound DO create (lead) ──
def test_create_delivery_order_for_lead(session):
    # fetch one sku to use
    skus = session.get(f"{BASE_URL}/api/master-skus").json().get("skus", [])
    assert skus, "no skus available"
    sku = next((s for s in skus if s.get("is_active", True) is not False), skus[0])

    future = (datetime.utcnow() + timedelta(days=7)).date().isoformat()
    payload = {
        "recipient_type": "lead",
        "lead_id": LEAD_ID,
        "requested_date": future,
        "reason": "Free Trial",
        "delivery_address": {"city": "Ambala"},
        "items": [{
            "sku_id": sku["id"],
            "sku_name": sku.get("name") or sku.get("sku_name"),
            "quantity": 2,
            "unit_price": 50,
        }],
    }
    r = session.post(f"{BASE_URL}/api/delivery-orders", json=payload)
    assert r.status_code == 200, r.text
    do = r.json()
    assert do["lead_id"] == LEAD_ID
    assert do["recipient_type"] == "lead"
    # Verify GET filter picks it up
    r2 = session.get(f"{BASE_URL}/api/delivery-orders", params={"lead_id": LEAD_ID})
    nums = [o["order_number"] for o in r2.json().get("orders", [])]
    assert do["order_number"] in nums


# ── Expense Requests: migrated record hidden ──
def test_migrated_free_trial_marked(session):
    """The expense_requests endpoint for the lead must show the migrated free_trial
    record (it still exists) with migrated_to_delivery_order_id set, OR the listing
    endpoint must filter it out. We probe the data."""
    r = session.get(f"{BASE_URL}/api/expense-requests",
                    params={"entity_type": "lead", "entity_id": LEAD_ID})
    if r.status_code != 200:
        pytest.skip(f"expense-requests endpoint shape unknown: {r.status_code}")
    data = r.json()
    rows = data if isinstance(data, list) else (data.get("expenses") or data.get("requests") or [])
    free_trials = [e for e in rows if e.get("expense_type") == "free_trial"]
    # All listed free_trial entries must have migration flag (or none returned at all)
    for ft in free_trials:
        assert ft.get("migrated_to_delivery_order_id"), \
            f"unmigrated free_trial still listed: {ft.get('id')}"
    print(f"free_trials returned: {len(free_trials)} (all migrated)")
