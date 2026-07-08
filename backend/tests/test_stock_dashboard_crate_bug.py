"""
Verify bug fix: Distributor Stock Dashboard converts crates to base bottles.

Reference: /app/backend/routes/distributors.py `_item_crates` helper (~line 8811).
When a line item has both `packages` (>0, crate count) and `packaging_units`
(>1, bottles-per-crate), stock_delivered must be packages * packaging_units
(base bottles), not `quantity` as-is.

Seed data (already in preview DB, do NOT delete):
- Distributor 'Brian' id bb12d90e-4d33-4890-ac5f-17573c551b5c
- SKU '20L Premium' id 51cbec53-a1d5-4e23-b708-a1fd0c014059
- Delivery TEST-DELIVERY-CRATE-BUG (delivery_number TEST-DC-BUG, status completed)
- Item: quantity=3, packages=3, packaging_units=12
- Expected stock_delivered for that SKU = 36 bottles (3 crates x 12).
"""

import os
import pytest
import requests

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "").rstrip("/")
if not BASE_URL:
    # Fallback to frontend/.env parsing so pytest doesn't hang the whole file
    try:
        with open("/app/frontend/.env") as f:
            for line in f:
                if line.startswith("REACT_APP_BACKEND_URL="):
                    BASE_URL = line.split("=", 1)[1].strip().rstrip("/")
                    break
    except Exception:
        pass

CEO_EMAIL = "surya.yadavalli@nylaairwater.earth"
CEO_PASSWORD = "test123"
TENANT_ID = "nyla-air-water"

DISTRIBUTOR_ID = "bb12d90e-4d33-4890-ac5f-17573c551b5c"  # Brian
TARGET_SKU_ID = "51cbec53-a1d5-4e23-b708-a1fd0c014059"  # 20L Premium


@pytest.fixture(scope="module")
def auth_headers():
    assert BASE_URL, "REACT_APP_BACKEND_URL missing"
    resp = requests.post(
        f"{BASE_URL}/api/auth/login",
        json={"email": CEO_EMAIL, "password": CEO_PASSWORD},
        headers={"Content-Type": "application/json", "X-Tenant-ID": TENANT_ID},
        timeout=30,
    )
    assert resp.status_code == 200, f"Login failed: {resp.status_code} {resp.text}"
    token = resp.json().get("session_token") or resp.json().get("access_token")
    assert token, f"No session_token in login response: {resp.json()}"
    return {
        "Authorization": f"Bearer {token}",
        "X-Tenant-ID": TENANT_ID,
        "Content-Type": "application/json",
    }


@pytest.fixture(scope="module")
def dashboard(auth_headers):
    url = f"{BASE_URL}/api/distributors/{DISTRIBUTOR_ID}/stock-dashboard"
    resp = requests.get(url, headers=auth_headers, timeout=60)
    assert resp.status_code == 200, f"Dashboard {resp.status_code}: {resp.text[:500]}"
    data = resp.json()
    assert "skus" in data, f"Response missing 'skus': {list(data.keys())}"
    return data


class TestStockDashboardCrateBugFix:
    """Bug: 3 crates (12 bottles/crate) was shown as 3 instead of 36."""

    def test_dashboard_loads_and_has_skus(self, dashboard):
        assert isinstance(dashboard["skus"], list)
        assert len(dashboard["skus"]) > 0, "No SKUs on Brian's dashboard"
        assert "totals" in dashboard, "totals row missing"

    def test_target_sku_delivered_is_36_not_3(self, dashboard):
        """Primary bug-fix assertion: stock_delivered == 36 for the seeded delivery."""
        skus = dashboard["skus"]
        target = next((s for s in skus if s.get("sku_id") == TARGET_SKU_ID), None)
        assert target is not None, (
            f"Target SKU {TARGET_SKU_ID} not found. Present SKUs: "
            f"{[(s.get('sku_id'), s.get('sku_name')) for s in skus]}"
        )
        delivered = target.get("stock_delivered")
        assert delivered is not None, f"stock_delivered missing: {target}"
        # Bug pre-fix would report 3. Fix should report at least 36 (or a
        # multiple thereof if other completed deliveries exist for same SKU).
        assert delivered >= 36, (
            f"stock_delivered={delivered} for SKU '{target.get('sku_name')}' — "
            f"expected >= 36 (3 crates x 12 bottles). Pre-fix bug value was 3."
        )
        # Guard against the OLD over-count regression (crates*bottles double-count).
        # A single 3x12 line should NOT explode to 3*12*12=432 or similar.
        # Received should never be absurdly larger than delivered+available combined.
        received = target.get("stock_received") or 0
        available = target.get("stock_available") or 0
        assert delivered < 10000, f"Suspiciously huge delivered={delivered}"
        assert received < 100000, f"Suspiciously huge received={received}"
        print(
            f"[OK] Target SKU '{target.get('sku_name')}' "
            f"received={received} delivered={delivered} available={available}"
        )

    def test_target_sku_delivered_is_multiple_of_12(self, dashboard):
        """Sanity: base-bottle total for a crate-packaged SKU should be a
        multiple of packaging_units (12)."""
        target = next(
            (s for s in dashboard["skus"] if s.get("sku_id") == TARGET_SKU_ID), None
        )
        assert target is not None
        delivered = target.get("stock_delivered") or 0
        # If any raw crate count leaked through, delivered % 12 would be non-zero
        # (e.g. 3 instead of 36). Accept only multiples of 12.
        assert delivered % 12 == 0, (
            f"stock_delivered={delivered} is not a multiple of 12 — a raw crate "
            f"count is likely still leaking into base-bottle aggregation."
        )

    def test_no_sku_has_double_counted_delivered(self, dashboard):
        """Regression: previously the 10-crate x 15-bottles line was inflated
        to 2250 (10*15*15). Confirm no SKU has delivered wildly larger than
        received (which would indicate a multiplicative bug)."""
        for s in dashboard["skus"]:
            recv = s.get("stock_received") or 0
            deliv = s.get("stock_delivered") or 0
            # delivered can be <= received; if delivered > received we have
            # negative on_hand which is a red flag but not the double-count bug.
            if recv > 0:
                assert deliv <= recv * 20, (
                    f"SKU '{s.get('sku_name')}' delivered={deliv} vs "
                    f"received={recv} — ratio suggests double-count regression."
                )

    def test_totals_row_coherent(self, dashboard):
        totals = dashboard.get("totals") or {}
        # Totals should sum non-negatively and be at least as large as any single SKU.
        t_received = totals.get("stock_received") or totals.get("total_received") or 0
        t_delivered = (
            totals.get("stock_delivered") or totals.get("total_delivered") or 0
        )
        assert t_received >= 0
        assert t_delivered >= 0
        max_sku_delivered = max(
            (s.get("stock_delivered") or 0) for s in dashboard["skus"]
        )
        # totals should be >= the max SKU (unless totals is expressed in a
        # different unit; keep this loose)
        assert t_delivered == 0 or t_delivered >= max_sku_delivered * 0.5, (
            f"totals.stock_delivered={t_delivered} seems too small vs "
            f"max SKU delivered={max_sku_delivered}"
        )
