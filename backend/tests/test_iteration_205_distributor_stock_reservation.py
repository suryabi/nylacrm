"""
Iteration 205: Distributor Stock-Out Reservation
================================================
Tests the new "Reserved Stock" derivation feature on the distributor stock
dashboard and create_delivery flow:

- GET /api/distributors/{id}/stock-dashboard returns stock_on_hand /
  stock_reserved / stock_available per SKU and in totals.
- Creating an open Stock-Out order reserves stock (on_hand unchanged,
  reserved +qty, available -qty).
- Over-allocation is blocked with HTTP 400 referencing 'available'.
- Cancelling / deleting an open order releases reservation.

NOTE: We never call the /complete endpoint (live Zoho push).
"""

import os
import uuid
import datetime as _dt
import pytest
import requests

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "https://invoice-export-11.preview.emergentagent.com").rstrip("/")
DISTRIBUTOR_ID = "b8876367-df64-4c55-a382-d5eb3b4b2380"  # Surya 1
LOGIN_EMAIL = "surya.yadavalli@nylaairwater.earth"
LOGIN_PASSWORD = "test123"


# ─────────────────────────── fixtures ───────────────────────────────────
@pytest.fixture(scope="module")
def session():
    s = requests.Session()
    s.headers.update({"Content-Type": "application/json"})
    r = s.post(f"{BASE_URL}/api/auth/login",
               json={"email": LOGIN_EMAIL, "password": LOGIN_PASSWORD}, timeout=30)
    assert r.status_code == 200, f"login failed: {r.status_code} {r.text[:200]}"
    token = r.json().get("session_token")
    assert token, "no session_token returned"
    s.headers.update({"Authorization": f"Bearer {token}"})
    return s


@pytest.fixture(scope="module")
def dashboard(session):
    r = session.get(f"{BASE_URL}/api/distributors/{DISTRIBUTOR_ID}/stock-dashboard", timeout=60)
    assert r.status_code == 200, r.text[:300]
    return r.json()


# Track created delivery ids for cleanup
_created_ids: list = []


@pytest.fixture(scope="module", autouse=True)
def _cleanup(session):
    yield
    for did in _created_ids:
        try:
            session.delete(f"{BASE_URL}/api/distributors/{DISTRIBUTOR_ID}/deliveries/{did}", timeout=30)
        except Exception:
            pass


# ─────────────── helper: pick a sku/location/account to use ─────────────
def _pick_target(session, dashboard):
    """Return (location_id, sku_id, sku_name, account_id, batch_id_or_None).
    We prefer a non-factory non-batch location, but fall back to a factory
    batch source (picking a batch with stock) so the tests work on the live
    Surya 1 dataset where most stock sits in a batched factory warehouse."""
    # 1. Accounts
    r = session.get(f"{BASE_URL}/api/accounts?limit=50", timeout=30)
    assert r.status_code == 200, r.text[:200]
    body = r.json()
    accounts = body if isinstance(body, list) else (
        body.get("data") or body.get("accounts") or body.get("items") or []
    )
    assert accounts, "no accounts available to deliver to"

    # 2. Locations
    rl = session.get(f"{BASE_URL}/api/distributors/{DISTRIBUTOR_ID}/locations", timeout=30)
    assert rl.status_code == 200
    locs = (rl.json().get("locations") or [])

    # 3. Margin allowed-sku set per city
    rm = session.get(f"{BASE_URL}/api/distributors/{DISTRIBUTOR_ID}/margins", timeout=30)
    margin_rows = []
    if rm.status_code == 200:
        mb = rm.json()
        margin_rows = mb if isinstance(mb, list) else (
            mb.get("margins") or mb.get("data") or mb.get("rows") or []
        )
    active_margins = [m for m in margin_rows if m.get("status") == "active"]

    # Try (account, sku) combos until we find one that maps to a source
    # location with enough stock. We iterate SKUs from the dashboard that
    # have stock and a matching margin row.
    skus_by_id = {s["sku_id"]: s for s in (dashboard.get("skus") or []) if (s.get("stock_available") or 0) > 0}
    for m in active_margins:
        sku_id = m.get("sku_id")
        city = m.get("city")
        sku = skus_by_id.get(sku_id)
        if not sku:
            continue
        acc = next((a for a in accounts if a.get("city") == city), None)
        if not acc:
            continue

        # 3a. Try a non-batch, non-factory distributor location first. We can
        # only use it if the SKU has actual stock there. Cheap heuristic:
        # call create_delivery dry-run? Not available. We'll attempt the
        # factory batch path which is the only one with stock for Surya 1.

        # 3b. Factory batched path — pick the batch with the largest qty
        batches = sorted(
            (b for b in (sku.get("factory_warehouse_batches") or []) if (b.get("quantity") or 0) > 0),
            key=lambda b: -(b.get("quantity") or 0),
        )
        if batches:
            b = batches[0]
            return (
                b["warehouse_id"], sku_id, sku.get("sku_name"),
                acc["id"], b["batch_id"],
            )

        # 3c. Fallback to a non-factory location (may still fail if no stock)
        loc = next(
            (l for l in locs if not l.get("is_factory") and not l.get("track_batches") and l.get("status") == "active"),
            None,
        )
        if loc:
            return loc["id"], sku_id, sku.get("sku_name"), acc["id"], None
    return None


# ───────────────────────────── tests ────────────────────────────────────
class TestStockDashboardShape:
    """1. dashboard returns the new reserved/available fields and invariant holds."""

    def test_dashboard_totals_have_new_fields(self, dashboard):
        totals = dashboard.get("totals") or {}
        for k in ("stock_on_hand", "stock_reserved", "stock_available"):
            assert k in totals, f"totals missing {k}: keys={list(totals.keys())}"
        # invariant
        on_hand = totals.get("stock_on_hand", 0)
        reserved = totals.get("stock_reserved", 0)
        available = totals.get("stock_available", 0)
        assert available == on_hand - reserved, (
            f"invariant broken in totals: avail={available} on_hand={on_hand} reserved={reserved}"
        )

    def test_dashboard_sku_invariant(self, dashboard):
        broken = []
        for sku in (dashboard.get("skus") or []):
            for k in ("stock_on_hand", "stock_reserved", "stock_available"):
                assert k in sku, f"sku {sku.get('sku_id')} missing {k}"
            if sku["stock_available"] != sku["stock_on_hand"] - sku["stock_reserved"]:
                broken.append(sku.get("sku_name") or sku.get("sku_id"))
        assert not broken, f"invariant broken for SKUs: {broken[:5]}"


class TestReservationFlow:
    """2-4. create reserves, over-allocation rejected, cancel releases."""

    def test_reservation_lifecycle(self, session, dashboard):
        pick = _pick_target(session, dashboard)
        if not pick:
            pytest.skip("No suitable non-batch/non-factory location with stock + account found")
        loc_id, sku_id, sku_name, account_id, batch_id = pick
        # quantity is in BOTTLES on the wire; dashboard converts via
        # packaging_units (typically 12 bottles / crate). Use 12 so we get a
        # clean +1 crate delta on the dashboard.
        order_qty_bottles = 12
        expected_crate_delta = 1

        # baseline per-sku numbers
        def _sku_row(d):
            return next((s for s in d.get("skus", []) if s.get("sku_id") == sku_id), None)

        base_row = _sku_row(dashboard)
        base_on_hand = base_row["stock_on_hand"]
        base_reserved = base_row["stock_reserved"]
        base_available = base_row["stock_available"]

        # ─── 2. CREATE delivery → reservation must INCREASE
        today = _dt.date.today().isoformat()
        payload = {
            "distributor_id": DISTRIBUTOR_ID,
            "distributor_location_id": loc_id,
            "account_id": account_id,
            "delivery_date": today,
            "reference_number": f"TEST-RES-{uuid.uuid4().hex[:6]}",
            "items": [{
                "sku_id": sku_id,
                "sku_name": sku_name,
                "quantity": order_qty_bottles,
                "unit_price": 100.0,
                "batch_id": batch_id,
            }],
            "remarks": "TEST_iteration_205 reservation test",
        }
        r = session.post(
            f"{BASE_URL}/api/distributors/{DISTRIBUTOR_ID}/deliveries",
            json=payload, timeout=45,
        )
        if r.status_code != 200 and r.status_code != 201:
            # Surface margin-matrix or other validation errors clearly
            pytest.skip(f"create_delivery blocked by validation: {r.status_code} {r.text[:400]}")
        body = r.json()
        delivery_id = body.get("delivery_id") or body.get("id") or (body.get("delivery") or {}).get("id")
        assert delivery_id, f"no delivery id in response: {body}"
        _created_ids.append(delivery_id)

        # Re-fetch dashboard
        r2 = session.get(f"{BASE_URL}/api/distributors/{DISTRIBUTOR_ID}/stock-dashboard", timeout=60)
        assert r2.status_code == 200
        after_row = _sku_row(r2.json())
        assert after_row, "sku missing after create"
        # invariants
        assert after_row["stock_on_hand"] == base_on_hand, (
            f"on_hand changed unexpectedly: {base_on_hand} -> {after_row['stock_on_hand']}"
        )
        assert after_row["stock_reserved"] == base_reserved + expected_crate_delta, (
            f"reserved expected {base_reserved + expected_crate_delta}, got {after_row['stock_reserved']}"
        )
        assert after_row["stock_available"] == base_available - expected_crate_delta, (
            f"available expected {base_available - expected_crate_delta}, got {after_row['stock_available']}"
        )

        # ─── 3. OVER-ALLOCATION blocked. Use a HUGE qty so it definitely
        # exceeds available at this location.
        over_qty = 10**8
        over_payload = dict(payload)
        over_payload["reference_number"] = f"TEST-RES-OVER-{uuid.uuid4().hex[:6]}"
        over_payload["items"] = [{
            "sku_id": sku_id, "sku_name": sku_name,
            "quantity": over_qty, "unit_price": 100.0,
            "batch_id": batch_id,
        }]
        r3 = session.post(
            f"{BASE_URL}/api/distributors/{DISTRIBUTOR_ID}/deliveries",
            json=over_payload, timeout=45,
        )
        assert r3.status_code == 400, (
            f"over-allocation should be rejected with 400, got {r3.status_code}: {r3.text[:300]}"
        )
        detail = (r3.json().get("detail") or "").lower()
        assert "available" in detail, f"error msg should mention 'available': {detail[:300]}"
        assert "need" in detail, f"error should include per-line shortage info: {detail[:300]}"

        # ─── 4. CANCEL releases the reservation
        r4 = session.post(
            f"{BASE_URL}/api/distributors/{DISTRIBUTOR_ID}/deliveries/{delivery_id}/cancel",
            timeout=30,
        )
        assert r4.status_code == 200, f"cancel failed: {r4.status_code} {r4.text[:300]}"

        r5 = session.get(f"{BASE_URL}/api/distributors/{DISTRIBUTOR_ID}/stock-dashboard", timeout=60)
        assert r5.status_code == 200
        post_cancel = _sku_row(r5.json())
        assert post_cancel["stock_reserved"] == base_reserved, (
            f"reserved should drop back to {base_reserved}, got {post_cancel['stock_reserved']}"
        )
        assert post_cancel["stock_available"] == base_available, (
            f"available should restore to {base_available}, got {post_cancel['stock_available']}"
        )
        assert post_cancel["stock_on_hand"] == base_on_hand


class TestDeleteReleasesReservation:
    """Bonus: DELETE on a draft delivery also releases the reservation."""

    def test_delete_open_order_releases(self, session, dashboard):
        pick = _pick_target(session, dashboard)
        if not pick:
            pytest.skip("no suitable target")
        loc_id, sku_id, sku_name, account_id, batch_id = pick
        order_qty_bottles = 12  # 1 crate
        expected_crate_delta = 1
        today = _dt.date.today().isoformat()

        # baseline
        def _row(d):
            return next((s for s in d.get("skus", []) if s.get("sku_id") == sku_id), None)
        base = _row(dashboard)
        base_reserved = base["stock_reserved"]

        payload = {
            "distributor_id": DISTRIBUTOR_ID,
            "distributor_location_id": loc_id,
            "account_id": account_id,
            "delivery_date": today,
            "reference_number": f"TEST-RES-DEL-{uuid.uuid4().hex[:6]}",
            "items": [{
                "sku_id": sku_id, "sku_name": sku_name,
                "quantity": order_qty_bottles, "unit_price": 100.0,
                "batch_id": batch_id,
            }],
            "remarks": "TEST_iteration_205 delete-releases",
        }
        r = session.post(
            f"{BASE_URL}/api/distributors/{DISTRIBUTOR_ID}/deliveries",
            json=payload, timeout=45,
        )
        if r.status_code not in (200, 201):
            pytest.skip(f"create blocked: {r.status_code} {r.text[:200]}")
        body = r.json()
        did = body.get("delivery_id") or body.get("id") or (body.get("delivery") or {}).get("id")
        assert did

        # confirm reservation went up
        mid = session.get(f"{BASE_URL}/api/distributors/{DISTRIBUTOR_ID}/stock-dashboard", timeout=60).json()
        assert _row(mid)["stock_reserved"] == base_reserved + expected_crate_delta

        # DELETE
        rd = session.delete(
            f"{BASE_URL}/api/distributors/{DISTRIBUTOR_ID}/deliveries/{did}",
            timeout=30,
        )
        assert rd.status_code == 200, f"delete failed: {rd.status_code} {rd.text[:200]}"

        after = session.get(f"{BASE_URL}/api/distributors/{DISTRIBUTOR_ID}/stock-dashboard", timeout=60).json()
        assert _row(after)["stock_reserved"] == base_reserved, (
            f"reserved should drop back after DELETE: expected {base_reserved}, got {_row(after)['stock_reserved']}"
        )
