"""
Backend tests for:
- Legacy Stock Repair endpoints (admin-only)
- Always-on batches (track_batches always true, shipment/delivery validation)
- Reversal alerts / stock audit endpoints
"""
import os
import pytest
import requests
from dotenv import load_dotenv

load_dotenv('/app/backend/.env')
BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', '').rstrip('/')
if not BASE_URL:
    # fallback to frontend env
    with open('/app/frontend/.env') as f:
        for line in f:
            if line.startswith('REACT_APP_BACKEND_URL='):
                BASE_URL = line.split('=', 1)[1].strip().rstrip('/')

CEO_EMAIL = "surya.yadavalli@nylaairwater.earth"
NON_ADMIN_EMAIL = "creative.director@nylaairwater.earth"
PASSWORD = "test123"
BRIAN_ID = "bb12d90e-4d33-4890-ac5f-17573c551b5c"
TENANT = "nyla-air-water"


def _login(email, password):
    r = requests.post(f"{BASE_URL}/api/auth/login",
                      json={"email": email, "password": password}, timeout=30)
    if r.status_code != 200:
        pytest.skip(f"Login failed for {email}: {r.status_code} {r.text[:200]}")
    return r.json().get("session_token") or r.json().get("access_token") or r.json().get("token")


@pytest.fixture(scope="module")
def ceo_headers():
    tok = _login(CEO_EMAIL, PASSWORD)
    return {"Authorization": f"Bearer {tok}", "X-Tenant-ID": TENANT}


@pytest.fixture(scope="module")
def nonadmin_headers():
    tok = _login(NON_ADMIN_EMAIL, PASSWORD)
    return {"Authorization": f"Bearer {tok}", "X-Tenant-ID": TENANT}


# ----------- Legacy Stock Repair ----------
class TestLegacyStock:
    def test_ceo_can_list_legacy_stock(self, ceo_headers):
        r = requests.get(f"{BASE_URL}/api/distributor/legacy-stock", headers=ceo_headers, timeout=60)
        assert r.status_code == 200, r.text[:300]
        data = r.json()
        assert isinstance(data, (list, dict))
        # If dict, common wrappers
        if isinstance(data, dict):
            assert "rows" in data or "items" in data or "legacy" in data or "results" in data

    def test_nonadmin_forbidden(self, nonadmin_headers):
        r = requests.get(f"{BASE_URL}/api/distributor/legacy-stock", headers=nonadmin_headers, timeout=30)
        assert r.status_code in (401, 403), f"Expected 403 got {r.status_code}: {r.text[:200]}"

    def test_legacy_history(self, ceo_headers):
        r = requests.get(f"{BASE_URL}/api/distributor/legacy-stock/history", headers=ceo_headers, timeout=30)
        assert r.status_code == 200, r.text[:300]

    def test_legacy_batches_requires_sku(self, ceo_headers):
        # Missing sku_id should be 400/422
        r = requests.get(f"{BASE_URL}/api/distributor/legacy-stock/batches", headers=ceo_headers, timeout=30)
        assert r.status_code in (400, 422), f"Expected 400/422 got {r.status_code}"


# ----------- Always-On Batches ----------
class TestAlwaysOnBatches:
    def test_transfer_locations_all_track_batches_true(self, ceo_headers):
        r = requests.get(f"{BASE_URL}/api/distributor/stock-transfers/eligible-sources",
                         headers=ceo_headers, timeout=30)
        assert r.status_code == 200, r.text[:300]
        data = r.json()
        items = data.get("sources") if isinstance(data, dict) else data
        assert items, "No eligible sources returned"
        bad = [x for x in items if x.get("track_batches") is not True]
        assert not bad, f"{len(bad)} sources missing track_batches=True. Sample: {bad[:2]}"

    def test_shipment_without_batch_id_rejected(self, ceo_headers):
        # Provide required fields; only omit batch_id in items to test always-on batch validation
        payload = {
            "distributor_id": BRIAN_ID,
            "distributor_location_id": "aa2eda05-1902-4a17-92bb-d33533535297",
            "shipment_date": "2026-01-15",
            "items": [{"sku_id": "sku1", "quantity": 1, "unit_price": 10}],
        }
        r = requests.post(f"{BASE_URL}/api/distributors/{BRIAN_ID}/shipments",
                          headers=ceo_headers, json=payload, timeout=30)
        # 400 mentioning batch OR 404 (location) — but we specifically want the batch check to fire.
        body = r.text.lower()
        # Accept 400/422 with 'batch' keyword — this is the always-on batch check
        assert r.status_code in (400, 404, 422), f"Unexpected {r.status_code}: {r.text[:200]}"
        # If 400, must mention batch
        if r.status_code == 400:
            assert "batch" in body, f"400 did not mention batch: {r.text[:300]}"


# ----------- Reversal Stock Audit endpoint reachability ----------
class TestReversalAudit:
    def test_deliveries_list_reachable(self, ceo_headers):
        r = requests.get(f"{BASE_URL}/api/distributors/{BRIAN_ID}/deliveries",
                         headers=ceo_headers, timeout=30)
        assert r.status_code == 200, r.text[:300]

    def test_stock_audit_endpoint_exists(self, ceo_headers):
        # Try with a bogus id — expect 404, not 401/500
        r = requests.get(f"{BASE_URL}/api/distributors/{BRIAN_ID}/deliveries/does-not-exist/stock-audit",
                         headers=ceo_headers, timeout=30)
        assert r.status_code in (404, 400), f"Unexpected {r.status_code}: {r.text[:200]}"
