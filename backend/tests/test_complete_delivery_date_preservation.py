"""
Regression tests for the Stock Out / Promo Stock Out completion endpoints.

Bug fix being validated:
  POST /api/distributors/{distributor_id}/deliveries/{delivery_id}/complete
  used to overwrite `delivery_date` with the completion date whenever no
  `delivery_date` query param was passed. Result: a delivery scheduled for
  YESTERDAY that was marked complete today would jump into TODAY's group on
  the UI (which groups by delivery_date).

  Fix: completion records `delivered_at = now` and ONLY updates delivery_date
  when the caller explicitly passes the `delivery_date` query param.

  Promo: POST /api/distributors/{distributor_id}/promo-deliveries/{dispatch_id}/complete
  must continue to leave delivery_date untouched (it never modified it).
"""
import os
import uuid
from datetime import datetime, timedelta, timezone

import pytest
import requests

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "").rstrip("/")
TENANT_ID = "nyla-air-water"

# Brian DIST-0003 — has stock and assigned accounts per test_credentials.md
BRIAN_DISTRIBUTOR_ID = "bb12d90e-4d33-4890-ac5f-17573c551b5c"


# ---------------------------------------------------------------------------
# Fixtures
# ---------------------------------------------------------------------------
@pytest.fixture(scope="module")
def auth_token():
    r = requests.post(
        f"{BASE_URL}/api/auth/login",
        json={
            "email": "surya.yadavalli@nylaairwater.earth",
            "password": "test123",
        },
        headers={"X-Tenant-ID": TENANT_ID},
        timeout=30,
    )
    if r.status_code != 200:
        pytest.skip(f"Login failed: {r.status_code} {r.text[:200]}")
    return r.json().get("session_token")


@pytest.fixture(scope="module")
def client(auth_token):
    s = requests.Session()
    s.headers.update(
        {
            "Authorization": f"Bearer {auth_token}",
            "Content-Type": "application/json",
            "X-Tenant-ID": TENANT_ID,
        }
    )
    s.cookies.set("session_token", auth_token)
    return s


@pytest.fixture(scope="module")
def brian_location(client):
    """Pick Brian's first non-factory, non-batch-tracked location with stock."""
    r = client.get(f"{BASE_URL}/api/distributors/{BRIAN_DISTRIBUTOR_ID}/locations")
    assert r.status_code == 200, r.text
    locs = r.json().get("locations", r.json()) if isinstance(r.json(), dict) else r.json()
    # Filter to plain (non-factory, non-batch) locations
    candidates = [
        loc for loc in locs
        if not loc.get("is_factory") and not loc.get("track_batches")
    ]
    if not candidates:
        candidates = locs
    # Pick one that has stock
    for loc in candidates:
        sr = client.get(
            f"{BASE_URL}/api/distributors/{BRIAN_DISTRIBUTOR_ID}/stock",
            params={"location_id": loc["id"]},
        )
        if sr.status_code == 200 and sr.json().get("stock"):
            stock_items = [s for s in sr.json()["stock"] if (s.get("quantity") or 0) > 1]
            if stock_items:
                loc["_stock_items"] = stock_items
                return loc
    pytest.skip("No Brian location with stock available")


@pytest.fixture(scope="module")
def assigned_account(client):
    r = client.get(
        f"{BASE_URL}/api/distributors/{BRIAN_DISTRIBUTOR_ID}/assigned-accounts"
    )
    if r.status_code != 200:
        pytest.skip(f"Cannot fetch assigned accounts: {r.status_code} {r.text[:200]}")
    accounts = r.json().get("accounts", [])
    if not accounts:
        pytest.skip("Brian has no assigned accounts to deliver to")
    return accounts[0]


def _yesterday_iso():
    return (datetime.now(timezone.utc) - timedelta(days=1)).strftime("%Y-%m-%d")


def _today_iso():
    return datetime.now(timezone.utc).strftime("%Y-%m-%d")


def _build_delivery_payload(brian_location, assigned_account, delivery_date):
    stock_item = brian_location["_stock_items"][0]
    return {
        "distributor_id": BRIAN_DISTRIBUTOR_ID,
        "distributor_location_id": brian_location["id"],
        "account_id": assigned_account["id"],
        "delivery_date": delivery_date,
        "reference_number": f"TEST-REGR-{uuid.uuid4().hex[:8]}",
        "items": [
            {
                "sku_id": stock_item["sku_id"],
                "sku_name": stock_item.get("sku_name", "Test SKU"),
                "quantity": 1,
                "unit_price": 100.0,
                "discount_percent": 0,
                "tax_percent": 0,
            }
        ],
    }


def _create_and_confirm_delivery(client, brian_location, assigned_account, delivery_date):
    payload = _build_delivery_payload(brian_location, assigned_account, delivery_date)
    cr = client.post(
        f"{BASE_URL}/api/distributors/{BRIAN_DISTRIBUTOR_ID}/deliveries",
        json=payload,
    )
    assert cr.status_code == 200, f"create failed: {cr.status_code} {cr.text[:300]}"
    delivery = cr.json()

    # Confirm to put it in a completable status
    cf = client.post(
        f"{BASE_URL}/api/distributors/{BRIAN_DISTRIBUTOR_ID}/deliveries/{delivery['id']}/confirm"
    )
    assert cf.status_code == 200, f"confirm failed: {cf.status_code} {cf.text[:300]}"
    return delivery


# ---------------------------------------------------------------------------
# Tests
# ---------------------------------------------------------------------------
class TestStockOutCompleteDatePreservation:
    """Core regression: completing without delivery_date param must NOT change
    the delivery_date set at create time."""

    def test_complete_without_delivery_date_preserves_delivery_date(
        self, client, brian_location, assigned_account
    ):
        yesterday = _yesterday_iso()

        # 1) Capture stock-before for the SKU to validate deduction side-effect
        sku_id = brian_location["_stock_items"][0]["sku_id"]
        loc_id = brian_location["id"]
        before_stock = _get_sku_stock(client, loc_id, sku_id)

        # 2) Create + confirm delivery scheduled for YESTERDAY
        delivery = _create_and_confirm_delivery(
            client, brian_location, assigned_account, yesterday
        )
        delivery_id = delivery["id"]

        # 3) Complete with EMPTY body (no delivery_date query param)
        comp = client.post(
            f"{BASE_URL}/api/distributors/{BRIAN_DISTRIBUTOR_ID}"
            f"/deliveries/{delivery_id}/complete"
        )
        assert comp.status_code == 200, (
            f"complete failed: {comp.status_code} {comp.text[:300]}"
        )

        # 4) GET delivery and assert delivery_date STILL == yesterday
        gr = client.get(
            f"{BASE_URL}/api/distributors/{BRIAN_DISTRIBUTOR_ID}/deliveries/{delivery_id}"
        )
        assert gr.status_code == 200, gr.text
        got = gr.json()
        # delivery_date may be returned as YYYY-MM-DD or with extra time component
        assert got.get("delivery_date", "")[:10] == yesterday, (
            f"REGRESSION: delivery_date should remain {yesterday} but got "
            f"{got.get('delivery_date')!r}"
        )

        # 5) status is 'complete'
        assert got.get("status") == "complete", (
            f"expected status=complete, got {got.get('status')}"
        )

        # 6) delivered_at is set and recent (within last 5 min)
        delivered_at = got.get("delivered_at")
        assert delivered_at, "delivered_at must be populated by completion"
        try:
            dt = datetime.fromisoformat(delivered_at.replace("Z", "+00:00"))
        except Exception:
            pytest.fail(f"delivered_at is not parseable: {delivered_at!r}")
        delta = datetime.now(timezone.utc) - dt
        assert abs(delta.total_seconds()) < 300, (
            f"delivered_at should be ~now, drift={delta.total_seconds()}s"
        )

        # 7) Stock deduction side-effect (1 unit)
        after_stock = _get_sku_stock(client, loc_id, sku_id)
        assert after_stock == before_stock - 1, (
            f"Stock not deducted: before={before_stock} after={after_stock}"
        )

    def test_complete_with_explicit_delivery_date_overrides(
        self, client, brian_location, assigned_account
    ):
        """The override path: passing delivery_date query param updates it."""
        original_date = _yesterday_iso()
        override_date = "2026-01-15"  # arbitrary, distinct from original + today

        delivery = _create_and_confirm_delivery(
            client, brian_location, assigned_account, original_date
        )
        delivery_id = delivery["id"]

        comp = client.post(
            f"{BASE_URL}/api/distributors/{BRIAN_DISTRIBUTOR_ID}"
            f"/deliveries/{delivery_id}/complete",
            params={"delivery_date": override_date},
        )
        assert comp.status_code == 200, (
            f"complete (override) failed: {comp.status_code} {comp.text[:300]}"
        )

        gr = client.get(
            f"{BASE_URL}/api/distributors/{BRIAN_DISTRIBUTOR_ID}/deliveries/{delivery_id}"
        )
        assert gr.status_code == 200, gr.text
        got = gr.json()
        assert got.get("delivery_date", "")[:10] == override_date, (
            f"OVERRIDE failed: expected {override_date}, got "
            f"{got.get('delivery_date')!r}"
        )
        assert got.get("status") == "complete"
        assert got.get("delivered_at"), "delivered_at must still be set when override"


def _get_sku_stock(client, location_id, sku_id):
    """Helper: sum on-hand qty for a SKU at a Brian location."""
    r = client.get(
        f"{BASE_URL}/api/distributors/{BRIAN_DISTRIBUTOR_ID}/stock",
        params={"location_id": location_id},
    )
    assert r.status_code == 200, r.text
    return sum(
        (s.get("quantity") or 0)
        for s in r.json().get("stock", [])
        if s.get("sku_id") == sku_id
    )


# ---------------------------------------------------------------------------
# Promo Stock-Out regression
# ---------------------------------------------------------------------------
@pytest.fixture(scope="module")
def promo_contact(client):
    """Find any contact in nyla-air-water (we use the Promo Test Contact if available)."""
    r = client.get(f"{BASE_URL}/api/contacts")
    if r.status_code != 200:
        pytest.skip(f"Cannot list contacts: {r.status_code}")
    payload = r.json()
    contacts = payload.get("contacts", payload) if isinstance(payload, dict) else payload
    if not contacts:
        pytest.skip("No contacts available for promo dispatch test")
    # Prefer "Promo Test Contact"
    for c in contacts:
        if "promo" in (c.get("name") or "").lower():
            return c
    return contacts[0]


@pytest.fixture(scope="module")
def promo_reason(client):
    r = client.get(f"{BASE_URL}/api/admin/promo-reasons")
    if r.status_code != 200:
        pytest.skip(f"Cannot list promo reasons: {r.status_code}")
    data = r.json()
    items = data.get("reasons", data) if isinstance(data, dict) else data
    actives = [x for x in items if x.get("is_active", True)]
    if not actives:
        pytest.skip("No active promo reasons in master list")
    return actives[0]["name"]


class TestPromoCompleteDatePreservation:
    """Promo complete endpoint must NOT modify delivery_date."""

    def test_promo_complete_preserves_delivery_date(
        self, client, brian_location, promo_contact, promo_reason
    ):
        yesterday = _yesterday_iso()
        stock_item = brian_location["_stock_items"][0]

        # Build promo dispatch payload
        payload = {
            "distributor_location_id": brian_location["id"],
            "recipient_type": "contact",
            "contact_id": promo_contact["id"],
            "delivery_date": yesterday,
            "reason": promo_reason,
            "reference_number": f"TEST-PROMO-{uuid.uuid4().hex[:8]}",
            "items": [
                {
                    "sku_id": stock_item["sku_id"],
                    "sku_name": stock_item.get("sku_name", "Test SKU"),
                    "quantity": 1,
                }
            ],
            "as_draft": False,
        }
        cr = client.post(
            f"{BASE_URL}/api/distributors/{BRIAN_DISTRIBUTOR_ID}/promo-deliveries",
            json=payload,
        )
        assert cr.status_code == 200, (
            f"promo create failed: {cr.status_code} {cr.text[:300]}"
        )
        created = cr.json()
        # The endpoint returns either {"dispatch": {...}} or the doc itself
        dispatch = created.get("dispatch", created)
        dispatch_id = dispatch.get("id")
        assert dispatch_id, f"no dispatch id in response: {created}"

        # Confirm if still in draft (as_draft=False above usually creates it
        # in `confirmed` state already; only confirm explicitly when needed).
        if (dispatch.get("status") or "").lower() == "draft":
            cf = client.post(
                f"{BASE_URL}/api/distributors/{BRIAN_DISTRIBUTOR_ID}"
                f"/promo-deliveries/{dispatch_id}/confirm"
            )
            assert cf.status_code == 200, (
                f"promo confirm failed: {cf.status_code} {cf.text[:300]}"
            )

        # Complete
        comp = client.post(
            f"{BASE_URL}/api/distributors/{BRIAN_DISTRIBUTOR_ID}"
            f"/promo-deliveries/{dispatch_id}/complete"
        )
        assert comp.status_code == 200, (
            f"promo complete failed: {comp.status_code} {comp.text[:300]}"
        )

        # GET and assert delivery_date unchanged
        gr = client.get(
            f"{BASE_URL}/api/distributors/{BRIAN_DISTRIBUTOR_ID}"
            f"/promo-deliveries/{dispatch_id}"
        )
        assert gr.status_code == 200, gr.text
        body = gr.json()
        got = body.get("dispatch", body)
        assert got.get("delivery_date", "")[:10] == yesterday, (
            f"PROMO REGRESSION: delivery_date should remain {yesterday}, got "
            f"{got.get('delivery_date')!r}"
        )
        assert got.get("status") == "complete", (
            f"expected status=complete, got {got.get('status')}"
        )


if __name__ == "__main__":
    pytest.main([__file__, "-v", "--tb=short"])
