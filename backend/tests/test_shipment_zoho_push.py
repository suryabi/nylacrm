"""Backend-only tests for Stock-In shipment Zoho push wiring.

Preview environment has NO Zoho credentials, so the actual Zoho invoice
creation cannot be exercised. These tests verify the wiring contract:

  1. Confirm still returns 200 and sets status=confirmed even when Zoho push
     would be skipped (Zoho not connected). Stock is deducted as usual.
  2. After such a confirm, the shipment has NO zoho_invoice_url / zoho_invoice_id.
  3. POST .../retry-zoho-push on a CONFIRMED shipment returns 400 with a clear
     message indicating Zoho is not connected / configured (or a similar push-
     skipped reason).
  4. POST .../retry-zoho-push on a DRAFT / cancelled / reversed shipment returns
     400 with the message "Only confirmed/dispatched/delivered shipments can
     be invoiced".

Source stock is restored (reverse) after each confirmed test so the dataset
ends near net-zero.
"""
import os
import uuid
import pytest
import requests

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL").rstrip("/")

ADMIN_EMAIL = "surya.yadavalli@nylaairwater.earth"
ADMIN_PASSWORD = "test123"
DISTRIBUTOR_ID = "bb12d90e-4d33-4890-ac5f-17573c551b5c"  # Brian
DEST_LOCATION_ID = "aa2eda05-1902-4a17-92bb-d33533535297"  # Delhi
SOURCE_WAREHOUSE_ID = "6eb87219-5585-4d73-8bc4-3c563da62233"  # factory
SKU_ID = "49e14d21-7f9a-4ed2-ad4c-3b69cadb4252"
BATCH_ID = "63e5d415-d2c1-4251-93b3-37a6628f568a"

QTY = 4


@pytest.fixture(scope="module")
def session():
    s = requests.Session()
    s.headers.update({"Content-Type": "application/json", "X-Tenant-ID": "nyla-air-water"})
    r = s.post(f"{BASE_URL}/api/auth/login",
               json={"email": ADMIN_EMAIL, "password": ADMIN_PASSWORD})
    assert r.status_code == 200, f"Login failed: {r.text}"
    token = r.json().get("session_token")
    assert token, f"No session_token: {r.json()}"
    s.headers.update({"Authorization": f"Bearer {token}"})
    return s


def get_source_qty(session):
    r = session.get(f"{BASE_URL}/api/production/factory-warehouse-stock",
                    params={"warehouse_id": SOURCE_WAREHOUSE_ID})
    assert r.status_code == 200, r.text
    for row in r.json().get("stock", []):
        if row.get("sku_id") == SKU_ID and row.get("batch_id") == BATCH_ID:
            return int(row.get("quantity", 0) or 0)
    return 0


def create_shipment(session, qty=QTY):
    payload = {
        "distributor_id": DISTRIBUTOR_ID,
        "distributor_location_id": DEST_LOCATION_ID,
        "source_warehouse_id": SOURCE_WAREHOUSE_ID,
        "shipment_date": "2026-01-15",
        "reference_number": f"TEST-ZOHO-{uuid.uuid4().hex[:8]}",
        "items": [{"sku_id": SKU_ID, "quantity": qty,
                   "unit_price": 100.0, "batch_id": BATCH_ID}],
    }
    r = session.post(f"{BASE_URL}/api/distributors/{DISTRIBUTOR_ID}/shipments",
                     json=payload)
    assert r.status_code in (200, 201), f"create failed: {r.status_code} {r.text}"
    sid = r.json().get("id") or r.json().get("shipment", {}).get("id")
    assert sid, f"no id: {r.json()}"
    return sid


def confirm(session, sid):
    return session.post(
        f"{BASE_URL}/api/distributors/{DISTRIBUTOR_ID}/shipments/{sid}/confirm")


def reverse(session, sid):
    return session.post(
        f"{BASE_URL}/api/distributors/{DISTRIBUTOR_ID}/shipments/{sid}/reverse",
        params={"acknowledge": "true", "reason": "pytest cleanup"})


def cancel(session, sid):
    return session.post(
        f"{BASE_URL}/api/distributors/{DISTRIBUTOR_ID}/shipments/{sid}/cancel",
        params={"reason": "pytest cleanup"})


def retry_zoho(session, sid):
    return session.post(
        f"{BASE_URL}/api/distributors/{DISTRIBUTOR_ID}/shipments/{sid}/retry-zoho-push")


def get_shipment(session, sid):
    r = session.get(
        f"{BASE_URL}/api/distributors/{DISTRIBUTOR_ID}/shipments/{sid}")
    assert r.status_code == 200, r.text
    return r.json()


class TestZohoConfirmWiring:
    """Confirm should not fail because Zoho is offline; push runs in background."""

    def test_confirm_succeeds_when_zoho_not_connected(self, session):
        src0 = get_source_qty(session)
        sid = create_shipment(session)
        r = confirm(session, sid)
        assert r.status_code == 200, f"confirm failed: {r.status_code} {r.text}"
        ship = get_shipment(session, sid)
        assert ship.get("status") == "confirmed"
        # Source stock was deducted regardless of Zoho status
        assert get_source_qty(session) == src0 - QTY

        # Give the background task a moment to run/skip
        import time
        time.sleep(2)

        ship2 = get_shipment(session, sid)
        # Zoho not connected -> no invoice created
        assert not ship2.get("zoho_invoice_url"), \
            f"unexpected zoho_invoice_url: {ship2.get('zoho_invoice_url')}"
        assert not ship2.get("zoho_invoice_id"), \
            f"unexpected zoho_invoice_id: {ship2.get('zoho_invoice_id')}"
        # Shipment must still be confirmed (not hard-failed)
        assert ship2.get("status") == "confirmed"

        # Cleanup -> reverse to restore source stock
        rr = reverse(session, sid)
        assert rr.status_code == 200, rr.text
        assert get_source_qty(session) == src0


class TestZohoRetryEndpoint:
    """Retry endpoint behaviour without Zoho connection."""

    def test_retry_on_confirmed_returns_400_zoho_skipped(self, session):
        src0 = get_source_qty(session)
        sid = create_shipment(session)
        assert confirm(session, sid).status_code == 200
        try:
            r = retry_zoho(session, sid)
            # In preview (no Zoho creds): ZohoPushSkippedError -> 400 with reason
            assert r.status_code == 400, \
                f"expected 400, got {r.status_code} {r.text}"
            detail = (r.json().get("detail") or "").lower()
            assert any(k in detail for k in (
                "zoho", "not connected", "not configured",
                "credentials", "branch", "item mapping", "mapping", "no invoice")), \
                f"unexpected detail: {detail!r}"
        finally:
            assert reverse(session, sid).status_code == 200
            assert get_source_qty(session) == src0

    def test_retry_on_draft_returns_400(self, session):
        sid = create_shipment(session)
        try:
            r = retry_zoho(session, sid)
            assert r.status_code == 400, \
                f"expected 400, got {r.status_code} {r.text}"
            detail = (r.json().get("detail") or "").lower()
            assert "confirmed" in detail and "invoiced" in detail, \
                f"unexpected detail: {detail!r}"
        finally:
            assert cancel(session, sid).status_code == 200

    def test_retry_on_cancelled_returns_400(self, session):
        sid = create_shipment(session)
        assert cancel(session, sid).status_code == 200
        r = retry_zoho(session, sid)
        assert r.status_code == 400
        detail = (r.json().get("detail") or "").lower()
        assert "confirmed" in detail and "invoiced" in detail, \
            f"unexpected detail: {detail!r}"

    def test_retry_on_reversed_returns_400(self, session):
        src0 = get_source_qty(session)
        sid = create_shipment(session)
        assert confirm(session, sid).status_code == 200
        assert reverse(session, sid).status_code == 200
        assert get_source_qty(session) == src0  # restored

        r = retry_zoho(session, sid)
        assert r.status_code == 400
        detail = (r.json().get("detail") or "").lower()
        assert "confirmed" in detail and "invoiced" in detail, \
            f"unexpected detail: {detail!r}"

    def test_retry_on_nonexistent_returns_404(self, session):
        bogus = f"nonexistent-{uuid.uuid4().hex}"
        r = retry_zoho(session, bogus)
        assert r.status_code == 404, f"expected 404, got {r.status_code} {r.text}"
