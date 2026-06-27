"""Tests for Stock-In shipment REVERSE and CANCEL flows on Distributor module.

Covers:
  * reverse a delivered shipment: source restored, destination decremented
  * reverse a confirmed shipment: source restored only
  * reverse non-draft without acknowledge=true -> 400
  * reverse a draft shipment: no stock change
  * cancel a confirmed shipment: source restored (was buggy before)
  * cancel a draft shipment: no stock change
  * reverse an already cancelled/reversed shipment -> 400

All assertions verify ACTUAL stock deltas via the public APIs, not only HTTP
status codes.  We intentionally pick a source factory warehouse + (sku, batch)
that has lots of stock so the confirm step never fails.
"""
import os
import uuid
import pytest
import requests

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL").rstrip("/")

# ── Constants from /app/memory/test_credentials.md ──────────────────────────
ADMIN_EMAIL = "surya.yadavalli@nylaairwater.earth"
ADMIN_PASSWORD = "test123"
DISTRIBUTOR_ID = "bb12d90e-4d33-4890-ac5f-17573c551b5c"  # Brian
# Delhi loc on Brian: track_batches=False -> destination stock keyed without batch
DEST_LOCATION_ID = "aa2eda05-1902-4a17-92bb-d33533535297"
# Source factory warehouse with lots of batched stock
SOURCE_WAREHOUSE_ID = "6eb87219-5585-4d73-8bc4-3c563da62233"
# SKU + batch with 12000 units in source warehouse
SKU_ID = "49e14d21-7f9a-4ed2-ad4c-3b69cadb4252"
BATCH_ID = "63e5d415-d2c1-4251-93b3-37a6628f568a"

QTY = 4  # Small quantity so we never deplete the source.


# ── Fixtures ─────────────────────────────────────────────────────────────────
@pytest.fixture(scope="module")
def session():
    s = requests.Session()
    s.headers.update({"Content-Type": "application/json"})
    r = s.post(
        f"{BASE_URL}/api/auth/login",
        json={"email": ADMIN_EMAIL, "password": ADMIN_PASSWORD},
    )
    assert r.status_code == 200, f"Login failed: {r.text}"
    token = r.json().get("session_token")
    assert token, f"No session_token in login response: {r.json()}"
    s.headers.update({"Authorization": f"Bearer {token}"})
    return s


# ── Stock helpers ───────────────────────────────────────────────────────────
def get_source_qty(session, sku_id=SKU_ID, batch_id=BATCH_ID):
    r = session.get(
        f"{BASE_URL}/api/production/factory-warehouse-stock",
        params={"warehouse_id": SOURCE_WAREHOUSE_ID},
    )
    assert r.status_code == 200, r.text
    for row in r.json().get("stock", []):
        if row.get("sku_id") == sku_id and row.get("batch_id") == batch_id:
            return int(row.get("quantity", 0) or 0)
    return 0


def get_dest_qty(session, sku_id=SKU_ID):
    """Destination distributor stock at Brian/Delhi for the SKU (no batch since
    Delhi doesn't track batches; the row is keyed with batch_id=None)."""
    r = session.get(
        f"{BASE_URL}/api/distributors/{DISTRIBUTOR_ID}/stock",
        params={"location_id": DEST_LOCATION_ID},
    )
    assert r.status_code == 200, r.text
    for row in r.json().get("stock", []):
        if row.get("sku_id") == sku_id:
            return int(row.get("quantity", 0) or 0)
    return 0


def create_shipment(session, qty=QTY):
    payload = {
        "distributor_id": DISTRIBUTOR_ID,
        "distributor_location_id": DEST_LOCATION_ID,
        "source_warehouse_id": SOURCE_WAREHOUSE_ID,
        "shipment_date": "2026-01-15",
        "reference_number": f"TEST-REV-{uuid.uuid4().hex[:8]}",
        "items": [
            {
                "sku_id": SKU_ID,
                "quantity": qty,
                "unit_price": 100.0,
                "batch_id": BATCH_ID,
            }
        ],
    }
    r = session.post(
        f"{BASE_URL}/api/distributors/{DISTRIBUTOR_ID}/shipments", json=payload
    )
    assert r.status_code in (200, 201), f"create_shipment failed: {r.status_code} {r.text}"
    sid = r.json().get("id") or r.json().get("shipment", {}).get("id")
    assert sid, f"No shipment id in response: {r.json()}"
    return sid


def confirm(session, sid):
    r = session.post(
        f"{BASE_URL}/api/distributors/{DISTRIBUTOR_ID}/shipments/{sid}/confirm"
    )
    assert r.status_code == 200, f"confirm failed: {r.status_code} {r.text}"


def dispatch(session, sid):
    r = session.post(
        f"{BASE_URL}/api/distributors/{DISTRIBUTOR_ID}/shipments/{sid}/dispatch"
    )
    assert r.status_code == 200, f"dispatch failed: {r.status_code} {r.text}"


def deliver(session, sid):
    r = session.post(
        f"{BASE_URL}/api/distributors/{DISTRIBUTOR_ID}/shipments/{sid}/deliver"
    )
    assert r.status_code == 200, f"deliver failed: {r.status_code} {r.text}"


def reverse(session, sid, acknowledge=True, reason="pytest reverse"):
    return session.post(
        f"{BASE_URL}/api/distributors/{DISTRIBUTOR_ID}/shipments/{sid}/reverse",
        params={"acknowledge": str(acknowledge).lower(), "reason": reason},
    )


def cancel(session, sid, reason="pytest cancel"):
    return session.post(
        f"{BASE_URL}/api/distributors/{DISTRIBUTOR_ID}/shipments/{sid}/cancel",
        params={"reason": reason},
    )


def get_shipment(session, sid):
    r = session.get(
        f"{BASE_URL}/api/distributors/{DISTRIBUTOR_ID}/shipments/{sid}"
    )
    assert r.status_code == 200, r.text
    return r.json()


# ── Tests ────────────────────────────────────────────────────────────────────
class TestReverseShipment:
    """Stock-in shipment reverse flow"""

    def test_reverse_delivered_restores_source_and_decrements_dest(self, session):
        src0 = get_source_qty(session)
        dst0 = get_dest_qty(session)

        sid = create_shipment(session)
        confirm(session, sid)
        # After confirm: source -QTY, dest unchanged
        assert get_source_qty(session) == src0 - QTY
        assert get_dest_qty(session) == dst0

        dispatch(session, sid)
        deliver(session, sid)
        # After deliver: source still -QTY, dest +QTY
        assert get_source_qty(session) == src0 - QTY
        assert get_dest_qty(session) == dst0 + QTY

        r = reverse(session, sid, acknowledge=True)
        assert r.status_code == 200, f"reverse failed: {r.status_code} {r.text}"

        # Stock should return to baseline
        assert get_source_qty(session) == src0, "source not restored on reverse(delivered)"
        assert get_dest_qty(session) == dst0, "destination not decremented on reverse(delivered)"

        ship = get_shipment(session, sid)
        assert ship.get("status") == "reversed"
        assert ship.get("source_stock_restored") is True
        assert ship.get("destination_stock_removed") is True
        assert ship.get("reversed_from_status") == "delivered"

    def test_reverse_confirmed_restores_source_only(self, session):
        src0 = get_source_qty(session)
        dst0 = get_dest_qty(session)

        sid = create_shipment(session)
        confirm(session, sid)
        assert get_source_qty(session) == src0 - QTY

        r = reverse(session, sid, acknowledge=True)
        assert r.status_code == 200, f"reverse failed: {r.status_code} {r.text}"

        assert get_source_qty(session) == src0, "source not restored on reverse(confirmed)"
        assert get_dest_qty(session) == dst0, "destination unexpectedly changed"

        ship = get_shipment(session, sid)
        assert ship.get("status") == "reversed"
        assert ship.get("source_stock_restored") is True
        assert ship.get("destination_stock_removed") is False

    def test_reverse_non_draft_without_acknowledge_returns_400(self, session):
        src0 = get_source_qty(session)
        sid = create_shipment(session)
        confirm(session, sid)
        assert get_source_qty(session) == src0 - QTY  # confirm did deduct

        r = reverse(session, sid, acknowledge=False)
        assert r.status_code == 400, f"expected 400, got {r.status_code} {r.text}"
        # Stock unchanged (still deducted)
        assert get_source_qty(session) == src0 - QTY
        # Status unchanged
        assert get_shipment(session, sid).get("status") == "confirmed"

        # Cleanup: reverse it properly so source is restored.
        r2 = reverse(session, sid, acknowledge=True)
        assert r2.status_code == 200
        assert get_source_qty(session) == src0

    def test_reverse_draft_allowed_with_no_acknowledge_and_no_stock_change(self, session):
        src0 = get_source_qty(session)
        dst0 = get_dest_qty(session)
        sid = create_shipment(session)
        # Stays draft -> no deduction yet
        assert get_source_qty(session) == src0
        assert get_dest_qty(session) == dst0

        r = reverse(session, sid, acknowledge=False)
        assert r.status_code == 200, f"reverse(draft) failed: {r.status_code} {r.text}"

        ship = get_shipment(session, sid)
        assert ship.get("status") == "reversed"
        assert ship.get("source_stock_restored") is False
        assert ship.get("destination_stock_removed") is False
        # Nothing moved.
        assert get_source_qty(session) == src0
        assert get_dest_qty(session) == dst0

    def test_double_reverse_returns_400(self, session):
        src0 = get_source_qty(session)
        sid = create_shipment(session)
        confirm(session, sid)
        r = reverse(session, sid, acknowledge=True)
        assert r.status_code == 200
        assert get_source_qty(session) == src0  # restored

        # Second reverse should be rejected
        r2 = reverse(session, sid, acknowledge=True)
        assert r2.status_code == 400
        body = r2.json()
        msg = (body.get("detail") or "").lower()
        assert "already" in msg or "cancelled" in msg or "reversed" in msg
        # Stock untouched by the failed second reverse
        assert get_source_qty(session) == src0


class TestCancelShipment:
    """Stock-in shipment cancel flow (post-fix: confirmed cancel restores source)"""

    def test_cancel_confirmed_restores_source(self, session):
        src0 = get_source_qty(session)
        dst0 = get_dest_qty(session)
        sid = create_shipment(session)
        confirm(session, sid)
        assert get_source_qty(session) == src0 - QTY

        r = cancel(session, sid)
        assert r.status_code == 200, f"cancel failed: {r.status_code} {r.text}"

        # The bug being tested: source MUST be restored after cancel-of-confirmed.
        assert get_source_qty(session) == src0, "source NOT restored when cancelling a confirmed shipment"
        assert get_dest_qty(session) == dst0  # never moved on confirm

        ship = get_shipment(session, sid)
        assert ship.get("status") == "cancelled"
        assert ship.get("source_stock_restored") is True
        assert ship.get("cancelled_from_status") == "confirmed"

    def test_cancel_draft_does_not_touch_stock(self, session):
        src0 = get_source_qty(session)
        dst0 = get_dest_qty(session)
        sid = create_shipment(session)

        r = cancel(session, sid)
        assert r.status_code == 200, f"cancel(draft) failed: {r.status_code} {r.text}"

        assert get_source_qty(session) == src0
        assert get_dest_qty(session) == dst0
        ship = get_shipment(session, sid)
        assert ship.get("status") == "cancelled"
        assert ship.get("source_stock_restored") is False

    def test_reverse_after_cancel_returns_400(self, session):
        sid = create_shipment(session)
        r1 = cancel(session, sid)
        assert r1.status_code == 200

        r2 = reverse(session, sid, acknowledge=True)
        assert r2.status_code == 400
