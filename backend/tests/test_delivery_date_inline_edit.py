"""
Regression tests for the inline 'Edit delivery date' control.

PUT /api/distributors/{distributor_id}/deliveries/{delivery_id}
  - On NON-draft deliveries, `delivery_date` MUST be editable (added in this
    iteration). Other restricted fields (e.g. total_amount) must remain
    untouched on non-draft updates.
  - On DRAFT deliveries, delivery_date editing remains supported (regression).
"""
import os
import uuid
from datetime import datetime, timedelta, timezone

import pytest
import requests

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "").rstrip("/")
TENANT_ID = "nyla-air-water"
BRIAN_DISTRIBUTOR_ID = "bb12d90e-4d33-4890-ac5f-17573c551b5c"


@pytest.fixture(scope="module")
def auth_token():
    r = requests.post(
        f"{BASE_URL}/api/auth/login",
        json={"email": "surya.yadavalli@nylaairwater.earth", "password": "test123"},
        headers={"X-Tenant-ID": TENANT_ID},
        timeout=30,
    )
    if r.status_code != 200:
        pytest.skip(f"Login failed: {r.status_code} {r.text[:200]}")
    return r.json().get("session_token")


@pytest.fixture(scope="module")
def client(auth_token):
    s = requests.Session()
    s.headers.update({
        "Authorization": f"Bearer {auth_token}",
        "Content-Type": "application/json",
        "X-Tenant-ID": TENANT_ID,
    })
    s.cookies.set("session_token", auth_token)
    return s


@pytest.fixture(scope="module")
def brian_location(client):
    r = client.get(f"{BASE_URL}/api/distributors/{BRIAN_DISTRIBUTOR_ID}/locations")
    assert r.status_code == 200, r.text
    body = r.json()
    locs = body.get("locations", body) if isinstance(body, dict) else body
    candidates = [loc for loc in locs if not loc.get("is_factory") and not loc.get("track_batches")] or locs
    for loc in candidates:
        sr = client.get(
            f"{BASE_URL}/api/distributors/{BRIAN_DISTRIBUTOR_ID}/stock",
            params={"location_id": loc["id"]},
        )
        if sr.status_code == 200 and sr.json().get("stock"):
            items = [s for s in sr.json()["stock"] if (s.get("quantity") or 0) > 1]
            if items:
                loc["_stock_items"] = items
                return loc
    pytest.skip("No Brian location with stock")


@pytest.fixture(scope="module")
def assigned_account(client):
    r = client.get(f"{BASE_URL}/api/distributors/{BRIAN_DISTRIBUTOR_ID}/assigned-accounts")
    if r.status_code != 200:
        pytest.skip(f"Cannot fetch accounts: {r.status_code}")
    accounts = r.json().get("accounts", [])
    if not accounts:
        pytest.skip("No assigned accounts")
    return accounts[0]


def _iso_days_ago(n):
    return (datetime.now(timezone.utc) - timedelta(days=n)).strftime("%Y-%m-%d")


def _payload(brian_location, assigned_account, delivery_date):
    item = brian_location["_stock_items"][0]
    return {
        "distributor_id": BRIAN_DISTRIBUTOR_ID,
        "distributor_location_id": brian_location["id"],
        "account_id": assigned_account["id"],
        "delivery_date": delivery_date,
        "reference_number": f"TEST-INLINE-{uuid.uuid4().hex[:8]}",
        "items": [{
            "sku_id": item["sku_id"],
            "sku_name": item.get("sku_name", "Test SKU"),
            "quantity": 1,
            "unit_price": 100.0,
            "discount_percent": 0,
            "tax_percent": 0,
        }],
    }


def _create(client, payload):
    r = client.post(
        f"{BASE_URL}/api/distributors/{BRIAN_DISTRIBUTOR_ID}/deliveries", json=payload
    )
    assert r.status_code == 200, f"create failed: {r.status_code} {r.text[:300]}"
    return r.json()


def _confirm(client, did):
    r = client.post(
        f"{BASE_URL}/api/distributors/{BRIAN_DISTRIBUTOR_ID}/deliveries/{did}/confirm"
    )
    assert r.status_code == 200, f"confirm failed: {r.status_code} {r.text[:300]}"
    return r.json()


def _get(client, did):
    r = client.get(
        f"{BASE_URL}/api/distributors/{BRIAN_DISTRIBUTOR_ID}/deliveries/{did}"
    )
    assert r.status_code == 200, r.text
    return r.json()


class TestNonDraftDeliveryDateEdit:
    """delivery_date is now editable on non-draft (confirmed/complete) rows."""

    def test_edit_delivery_date_on_confirmed_delivery_to_past_date(
        self, client, brian_location, assigned_account
    ):
        original = _iso_days_ago(0)  # today
        new_date = _iso_days_ago(1)  # yesterday

        d = _create(client, _payload(brian_location, assigned_account, original))
        _confirm(client, d["id"])

        # Verify it's in non-draft status now
        got = _get(client, d["id"])
        assert got.get("status") != "draft", f"expected non-draft, got {got.get('status')}"

        # Edit delivery_date inline
        r = client.put(
            f"{BASE_URL}/api/distributors/{BRIAN_DISTRIBUTOR_ID}/deliveries/{d['id']}",
            json={"delivery_date": new_date},
        )
        assert r.status_code == 200, f"PUT failed: {r.status_code} {r.text[:300]}"

        # GET shows the new date
        got = _get(client, d["id"])
        assert got.get("delivery_date", "")[:10] == new_date, (
            f"delivery_date not updated: expected {new_date}, got {got.get('delivery_date')!r}"
        )

    def test_disallowed_field_total_amount_not_corrupted_on_non_draft(
        self, client, brian_location, assigned_account
    ):
        original = _iso_days_ago(0)
        new_date = _iso_days_ago(2)

        d = _create(client, _payload(brian_location, assigned_account, original))
        _confirm(client, d["id"])
        before = _get(client, d["id"])
        original_total = before.get("total_amount")

        # Try to update delivery_date AND total_amount on non-draft
        r = client.put(
            f"{BASE_URL}/api/distributors/{BRIAN_DISTRIBUTOR_ID}/deliveries/{d['id']}",
            json={"delivery_date": new_date, "total_amount": 999999.99},
        )
        # Server should accept the request (200) but ignore total_amount.
        # If model rejects unknown field, it could be 422 - that's also fine
        # because the doc would be uncorrupted.
        assert r.status_code in (200, 422), f"unexpected: {r.status_code} {r.text[:300]}"

        got = _get(client, d["id"])
        if r.status_code == 200:
            assert got.get("delivery_date", "")[:10] == new_date
        # total_amount must NOT have been overridden
        assert got.get("total_amount") == original_total, (
            f"total_amount corrupted: was {original_total}, now {got.get('total_amount')}"
        )

    def test_edit_delivery_date_on_draft_still_works(
        self, client, brian_location, assigned_account
    ):
        """Regression: draft already supported full edits."""
        original = _iso_days_ago(0)
        new_date = _iso_days_ago(3)

        d = _create(client, _payload(brian_location, assigned_account, original))
        # Do NOT confirm - keep as draft
        got = _get(client, d["id"])
        assert got.get("status") == "draft", f"expected draft, got {got.get('status')}"

        r = client.put(
            f"{BASE_URL}/api/distributors/{BRIAN_DISTRIBUTOR_ID}/deliveries/{d['id']}",
            json={"delivery_date": new_date},
        )
        assert r.status_code == 200, f"PUT failed: {r.status_code} {r.text[:300]}"

        got = _get(client, d["id"])
        assert got.get("delivery_date", "")[:10] == new_date


if __name__ == "__main__":
    pytest.main([__file__, "-v", "--tb=short"])
