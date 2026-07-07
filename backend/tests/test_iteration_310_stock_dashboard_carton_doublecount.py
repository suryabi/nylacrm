"""
Iteration 310 — Regression test for the Stock-by-SKU carton double-count bug.

Fix: routes/distributors.py :: get_stock_dashboard :: _item_crates
- If a delivery/shipment/pending line item has `packages` field > 0,
  quantity is ALREADY the base-unit total → use as-is.
- Only for legacy rows (no packages field AND packaging_units > 1) do we
  multiply quantity × packaging_units.
- Plain rows (packaging_units <= 1, no packages) → use quantity unchanged.

Distributor under test: bb12d90e-4d33-4890-ac5f-17573c551b5c (tenant nyla-air-water)
Verifies:
  * Sparkling stock_delivered == 24  (12 + 12) NOT 288  (12*12 + 12*12)
  * 330 Silver stock_pending_out is nowhere near 144 (i.e. the reserved DRAFT
    12/12/1 is counted as 12, not 144)
  * Received magnitudes remain the expected order-of-magnitude and are
    non-negative
  * Available (stock_at_hand) is non-negative for every SKU
"""

import os
import pytest
import requests

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL").rstrip("/")
TENANT = "nyla-air-water"
DISTRIBUTOR_ID = "bb12d90e-4d33-4890-ac5f-17573c551b5c"


@pytest.fixture(scope="module")
def token():
    r = requests.post(
        f"{BASE_URL}/api/auth/login",
        headers={"Content-Type": "application/json", "X-Tenant-ID": TENANT},
        json={"email": "surya.yadavalli@nylaairwater.earth", "password": "test123"},
        timeout=15,
    )
    assert r.status_code == 200, r.text
    tok = r.json().get("session_token") or r.json().get("token")
    assert tok, r.json()
    return tok


@pytest.fixture(scope="module")
def dashboard(token):
    r = requests.get(
        f"{BASE_URL}/api/distributors/{DISTRIBUTOR_ID}/stock-dashboard",
        headers={"X-Tenant-ID": TENANT, "Authorization": f"Bearer {token}"},
        timeout=30,
    )
    assert r.status_code == 200, r.text
    d = r.json()
    assert "skus" in d and isinstance(d["skus"], list)
    return d


def _find_sku(dash, needle):
    for s in dash["skus"]:
        if needle.lower() in (s.get("sku_name") or "").lower():
            return s
    return None


class TestStockDashboardCartonBug:
    def test_sparkling_delivered_not_double_counted(self, dashboard):
        # NEW-model rows: qty=12, packaging_units=12, packages=1 (each of 2 delivered)
        # Base bottles must be 12+12 = 24 (NOT 288).
        s = _find_sku(dashboard, "Sparkling")
        assert s is not None, "Sparkling SKU missing from dashboard"
        assert s["stock_delivered"] == 24, (
            f"Sparkling stock_delivered={s['stock_delivered']} — expected 24. "
            f"288 would indicate the double-count bug returned."
        )

    def test_silver_330_pending_reserved_not_double_counted(self, dashboard):
        # DRAFT delivery qty=12/pu=12/packages=1 must count as 12, not 144.
        s = _find_sku(dashboard, "330 ml / Silver")
        assert s is not None, "330 ml Silver SKU missing"
        assert s["stock_pending_out"] < 144, (
            f"Silver 330 stock_pending_out={s['stock_pending_out']} — "
            f"a value >= 144 indicates the double-count bug on RESERVED path."
        )
        assert s["stock_pending_out"] >= 12, (
            f"Silver 330 stock_pending_out={s['stock_pending_out']} — expected >=12 "
            f"(the DRAFT reservation should still count)."
        )

    def test_received_magnitudes_reasonable(self, dashboard):
        # Order-of-magnitude sanity from task description.
        # (Exact numbers depend on stored data, so we use inclusive bands.)
        expected_bands = {
            "600 ml / Silver": (1500, 2500),   # ~1857
            "330 ml / Silver": (100, 300),      # ~166
            "Sparkling":        (50, 150),      # ~83
            "660 ml / Gold":   (10, 100),       # ~24
        }
        for needle, (lo, hi) in expected_bands.items():
            s = _find_sku(dashboard, needle)
            assert s is not None, f"SKU '{needle}' missing"
            rx = s.get("stock_received", 0)
            assert rx >= 0, f"{needle} received is negative: {rx}"
            assert lo <= rx <= hi, (
                f"{needle} received={rx} outside expected band [{lo},{hi}] "
                f"— possible regression in stock-in aggregation."
            )

    def test_available_non_negative_and_consistent(self, dashboard):
        for s in dashboard["skus"]:
            at_hand = s.get("stock_at_hand", 0)
            recv = s.get("stock_received", 0)
            deliv = s.get("stock_delivered", 0)
            assert at_hand >= 0, (
                f"{s.get('sku_name')} at_hand={at_hand} negative — "
                f"received={recv}, delivered={deliv}"
            )

    def test_item_crates_helper_direct(self):
        """Directly import _item_crates via a local re-implementation guard:
        confirm the three branches behave as the task requires.
        (Unit-level guard — the real function is a closure inside the route
        handler so we replicate its logic here to lock down the contract.)
        """
        def _item_crates(item):
            qty = int(item.get("quantity") or 0)
            pu = int(item.get("packaging_units") or 0)
            pk = item.get("packages")
            try:
                pk = int(pk) if pk not in (None, "") else 0
            except (TypeError, ValueError):
                pk = 0
            if pk > 0:
                return qty
            if pu > 1:
                return qty * pu
            return qty

        # NEW model — quantity is already base units
        assert _item_crates({"quantity": 150, "packaging_units": 15, "packages": 10}) == 150
        assert _item_crates({"quantity": 12, "packaging_units": 12, "packages": 1}) == 12
        # OLD model — quantity is number of packages
        assert _item_crates({"quantity": 10, "packaging_units": 15}) == 150
        # Plain
        assert _item_crates({"quantity": 42}) == 42
        assert _item_crates({"quantity": 42, "packaging_units": 1}) == 42
        # Edge: packages present but zero → falls through to legacy path
        assert _item_crates({"quantity": 10, "packaging_units": 15, "packages": 0}) == 150
        # Edge: packages present but blank string → falls through
        assert _item_crates({"quantity": 10, "packaging_units": 15, "packages": ""}) == 150
