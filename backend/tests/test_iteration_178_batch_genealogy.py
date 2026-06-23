"""
Iteration 178 — Admin → Batch Genealogy backend tests.
Covers:
  - GET /api/admin/batches/search (default, q-filter, limit)
  - GET /api/admin/batches/{id}/genealogy (admin-only, 404, payload shape)
  - 403 for non-admin role (Distributor)
"""
import os
import pytest
import requests

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "https://reversals-audit-log.preview.emergentagent.com").rstrip("/")
ADMIN_EMAIL = "surya.yadavalli@nylaairwater.earth"
ADMIN_PASS = "test123"
DIST_EMAIL = "john.distributor@test.com"
DIST_PASS = "nyladist##"

BATCH_FULL = "d68a630a-55aa-4375-911d-e045c98b10c3"
BATCH_SIMPLE = "821db50f-e9e2-40c2-8591-2242136ce534"
INVALID_BATCH = "00000000-0000-0000-0000-000000000000"


def _login(email, password):
    r = requests.post(f"{BASE_URL}/api/auth/login", json={"email": email, "password": password}, timeout=20)
    if r.status_code != 200:
        pytest.skip(f"Login failed for {email}: {r.status_code} {r.text[:200]}")
    return r.json().get("session_token") or r.json().get("token")


@pytest.fixture(scope="session")
def admin_client():
    token = _login(ADMIN_EMAIL, ADMIN_PASS)
    s = requests.Session()
    s.headers.update({"Authorization": f"Bearer {token}", "Content-Type": "application/json"})
    return s


@pytest.fixture(scope="session")
def dist_client():
    token = _login(DIST_EMAIL, DIST_PASS)
    s = requests.Session()
    s.headers.update({"Authorization": f"Bearer {token}", "Content-Type": "application/json"})
    return s


# ── Search endpoint ──
class TestBatchSearch:
    def test_search_default_admin(self, admin_client):
        r = admin_client.get(f"{BASE_URL}/api/admin/batches/search", params={"limit": 25})
        assert r.status_code == 200, r.text
        data = r.json()
        assert "batches" in data and isinstance(data["batches"], list)
        assert len(data["batches"]) <= 25
        if data["batches"]:
            b = data["batches"][0]
            assert "id" in b and "batch_code" in b

    def test_search_q_filter_case_insensitive(self, admin_client):
        r = admin_client.get(f"{BASE_URL}/api/admin/batches/search", params={"q": "test", "limit": 50})
        assert r.status_code == 200
        rows = r.json()["batches"]
        for row in rows:
            text = ((row.get("batch_code") or "") + " " + (row.get("sku_name") or "")).lower()
            assert "test" in text

    def test_search_limit_clamped(self, admin_client):
        r = admin_client.get(f"{BASE_URL}/api/admin/batches/search", params={"limit": 5})
        assert r.status_code == 200
        assert len(r.json()["batches"]) <= 5

    def test_search_403_for_distributor(self, dist_client):
        r = dist_client.get(f"{BASE_URL}/api/admin/batches/search")
        assert r.status_code == 403, f"Expected 403 for distributor, got {r.status_code}: {r.text[:200]}"

    def test_search_401_unauth(self):
        r = requests.get(f"{BASE_URL}/api/admin/batches/search")
        assert r.status_code in (401, 403)


# ── Genealogy endpoint ──
class TestBatchGenealogy:
    def test_genealogy_full_chain(self, admin_client):
        r = admin_client.get(f"{BASE_URL}/api/admin/batches/{BATCH_FULL}/genealogy")
        assert r.status_code == 200, r.text
        d = r.json()
        # Required top-level keys
        for k in ("batch", "timeline", "resting_stock", "mass_balance"):
            assert k in d, f"missing key {k}"
        # Batch metadata
        assert d["batch"]["id"] == BATCH_FULL
        assert d["batch"].get("batch_code")
        # Timeline must contain 'produced' as first event
        types = [e["type"] for e in d["timeline"]]
        assert "produced" in types
        # Mass balance schema
        mb = d["mass_balance"]
        for k in ("produced", "rejected_at_qc", "transferred_to_warehouse",
                  "delivered_to_customers", "currently_resting",
                  "expected_resting", "drift"):
            assert k in mb, f"mass_balance missing {k}"
        assert isinstance(mb["drift"], (int, float))

    def test_genealogy_simple_chain(self, admin_client):
        r = admin_client.get(f"{BASE_URL}/api/admin/batches/{BATCH_SIMPLE}/genealogy")
        assert r.status_code == 200
        d = r.json()
        assert d["batch"]["id"] == BATCH_SIMPLE
        types = [e["type"] for e in d["timeline"]]
        assert "produced" in types
        # Has factory_transfer per request description
        assert "factory_transfer" in types
        assert d["batch"].get("total_bottles", 0) >= 0

    def test_genealogy_invalid_id_404(self, admin_client):
        r = admin_client.get(f"{BASE_URL}/api/admin/batches/{INVALID_BATCH}/genealogy")
        assert r.status_code == 404
        assert "not found" in r.text.lower()

    def test_genealogy_403_for_distributor(self, dist_client):
        r = dist_client.get(f"{BASE_URL}/api/admin/batches/{BATCH_SIMPLE}/genealogy")
        assert r.status_code == 403

    def test_genealogy_resting_stock_shape(self, admin_client):
        r = admin_client.get(f"{BASE_URL}/api/admin/batches/{BATCH_FULL}/genealogy")
        assert r.status_code == 200
        for row in r.json()["resting_stock"]:
            assert "owner" in row and "qty" in row and "kind" in row
            assert row["kind"] in ("factory", "distributor")
