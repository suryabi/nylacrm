"""Backend tests for Sampling/Trials feature (iteration 156).

Endpoints under test (Performance Tracker → Top 10 Priorities → Sampling/Trials):
  - GET    /api/performance/sampling-trials
  - POST   /api/performance/sampling-trials
  - PUT    /api/performance/sampling-trials/{trial_id}
  - DELETE /api/performance/sampling-trials/{trial_id}
"""
import os
import pytest
import requests

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "https://crm-suite-preview.preview.emergentagent.com").rstrip("/")
TENANT_ID = "nyla-air-water"
EMAIL = "surya.yadavalli@nylaairwater.earth"
PASSWORD = "test123"


@pytest.fixture(scope="module")
def auth_session():
    s = requests.Session()
    s.headers.update({"Content-Type": "application/json", "X-Tenant-ID": TENANT_ID})
    r = s.post(f"{BASE_URL}/api/auth/login", json={"email": EMAIL, "password": PASSWORD})
    if r.status_code != 200:
        pytest.skip(f"Login failed {r.status_code}: {r.text[:200]}")
    data = r.json()
    token = data.get("token") or data.get("access_token") or data.get("session_token")
    if not token:
        pytest.skip(f"No token in login response: {data}")
    s.headers.update({"Authorization": f"Bearer {token}"})
    s._user = data.get("user") or {}
    return s


@pytest.fixture(scope="module")
def me(auth_session):
    r = auth_session.get(f"{BASE_URL}/api/auth/me")
    assert r.status_code == 200, r.text
    return r.json()


@pytest.fixture(scope="module")
def a_lead(auth_session, me):
    """Find a lead assigned to current user (or any lead) for this tenant."""
    uid = me.get("id") or auth_session._user.get("id")
    # Try resource-filtered first
    r = auth_session.get(f"{BASE_URL}/api/performance/sampling-trials", params={"resource_ids": uid or ""})
    if r.status_code == 200:
        leads = r.json().get("leads") or []
        if leads:
            return leads[0]
    # Fallback: list all leads
    r = auth_session.get(f"{BASE_URL}/api/leads")
    if r.status_code == 200:
        items = r.json() if isinstance(r.json(), list) else r.json().get("items", [])
        if items:
            l = items[0]
            return {"id": l.get("id"), "name": l.get("company"), "city": l.get("city"), "sku_options": []}
    pytest.skip("No leads available for this tenant")


# ── List endpoint ─────────────────────────────────────────────────────────────
class TestSamplingList:
    def test_list_returns_shape(self, auth_session, me):
        uid = me.get("id") or ""
        r = auth_session.get(f"{BASE_URL}/api/performance/sampling-trials", params={"resource_ids": uid})
        assert r.status_code == 200, r.text
        data = r.json()
        assert "leads" in data and isinstance(data["leads"], list)
        assert "trials" in data and isinstance(data["trials"], list)
        assert "totals" in data and isinstance(data["totals"], dict)
        assert "by_status" in data["totals"]

    def test_leads_have_sku_options_field(self, auth_session, me):
        r = auth_session.get(f"{BASE_URL}/api/performance/sampling-trials", params={"resource_ids": me.get("id") or ""})
        assert r.status_code == 200
        for ld in r.json().get("leads", []):
            assert "sku_options" in ld and isinstance(ld["sku_options"], list)
            for sku in ld["sku_options"]:
                assert "sku" in sku
                assert "price_per_unit" in sku


# ── Create + lifecycle ────────────────────────────────────────────────────────
class TestSamplingLifecycle:
    created_id = None

    def test_create_invalid_status_400(self, auth_session, a_lead):
        r = auth_session.post(f"{BASE_URL}/api/performance/sampling-trials", json={
            "lead_id": a_lead["id"], "trial_date": "2026-05-10",
            "duration_days": 5, "status": "bogus", "sku_plans": [],
        })
        assert r.status_code == 400, r.text

    def test_create_zero_duration_400(self, auth_session, a_lead):
        r = auth_session.post(f"{BASE_URL}/api/performance/sampling-trials", json={
            "lead_id": a_lead["id"], "trial_date": "2026-05-10",
            "duration_days": 0, "status": "not_started", "sku_plans": [],
        })
        assert r.status_code == 400
        assert "Duration" in r.text or "duration" in r.text

    def test_create_nonexistent_lead_404(self, auth_session):
        r = auth_session.post(f"{BASE_URL}/api/performance/sampling-trials", json={
            "lead_id": "TEST_does_not_exist_xyz", "trial_date": "2026-05-10",
            "duration_days": 3, "status": "not_started", "sku_plans": [],
        })
        assert r.status_code == 404, r.text

    def test_create_success_end_date_formula(self, auth_session, a_lead):
        payload = {
            "lead_id": a_lead["id"],
            "trial_date": "2026-05-10",
            "duration_days": 5,
            "status": "not_started",
            "sku_plans": [
                {"sku": "TEST_SKU_A", "crates": 4, "units_per_package": 12, "price_per_unit": 100.0}
            ],
            "notes": "TEST_iter156 sampling trial",
        }
        r = auth_session.post(f"{BASE_URL}/api/performance/sampling-trials", json=payload)
        assert r.status_code == 200, r.text
        doc = r.json()
        assert doc["trial_date"] == "2026-05-10"
        # start + (duration - 1) → 2026-05-10 + 4d = 2026-05-14
        assert doc["end_date"] == "2026-05-14", f"Expected 2026-05-14 got {doc['end_date']}"
        assert doc["duration_days"] == 5
        assert doc["status"] == "not_started"
        # 4 crates * 12 units * 100 = 4800
        assert doc["total_amount"] == 4800.0, doc
        assert "id" in doc
        TestSamplingLifecycle.created_id = doc["id"]

    def test_list_includes_created_trial(self, auth_session, me):
        tid = TestSamplingLifecycle.created_id
        assert tid, "create must run first"
        r = auth_session.get(f"{BASE_URL}/api/performance/sampling-trials", params={"resource_ids": me.get("id") or ""})
        assert r.status_code == 200
        # If lead isn't assigned to current user, fall back to no filter
        ids = [t.get("id") for t in r.json().get("trials", [])]
        if tid not in ids:
            r2 = auth_session.get(f"{BASE_URL}/api/performance/sampling-trials")
            ids = [t.get("id") for t in r2.json().get("trials", [])]
        assert tid in ids, f"Created trial id {tid} not present in list"

    def test_update_duration_recomputes_end_date(self, auth_session):
        tid = TestSamplingLifecycle.created_id
        r = auth_session.put(f"{BASE_URL}/api/performance/sampling-trials/{tid}", json={
            "duration_days": 3,
        })
        assert r.status_code == 200, r.text
        doc = r.json()
        assert doc["duration_days"] == 3
        # 2026-05-10 + 2d = 2026-05-12
        assert doc["end_date"] == "2026-05-12", doc

    def test_update_trial_date_recomputes_end_date(self, auth_session):
        tid = TestSamplingLifecycle.created_id
        r = auth_session.put(f"{BASE_URL}/api/performance/sampling-trials/{tid}", json={
            "trial_date": "2026-06-01",
        })
        assert r.status_code == 200
        doc = r.json()
        assert doc["trial_date"] == "2026-06-01"
        # duration is now 3, so end = 2026-06-03
        assert doc["end_date"] == "2026-06-03", doc

    def test_update_status_persists(self, auth_session):
        tid = TestSamplingLifecycle.created_id
        r = auth_session.put(f"{BASE_URL}/api/performance/sampling-trials/{tid}", json={
            "status": "in_progress",
        })
        assert r.status_code == 200
        assert r.json()["status"] == "in_progress"

    def test_update_invalid_status_400(self, auth_session):
        tid = TestSamplingLifecycle.created_id
        r = auth_session.put(f"{BASE_URL}/api/performance/sampling-trials/{tid}", json={
            "status": "invalid_xyz",
        })
        assert r.status_code == 400

    def test_update_zero_duration_400(self, auth_session):
        tid = TestSamplingLifecycle.created_id
        r = auth_session.put(f"{BASE_URL}/api/performance/sampling-trials/{tid}", json={
            "duration_days": 0,
        })
        assert r.status_code == 400

    def test_update_sku_plans_changes_total(self, auth_session):
        tid = TestSamplingLifecycle.created_id
        r = auth_session.put(f"{BASE_URL}/api/performance/sampling-trials/{tid}", json={
            "sku_plans": [
                {"sku": "TEST_SKU_A", "crates": 2, "units_per_package": 10, "price_per_unit": 50.0},
                {"sku": "TEST_SKU_B", "crates": 3, "units_per_package": 6, "price_per_unit": 25.0},
            ]
        })
        assert r.status_code == 200
        # 2*10*50 + 3*6*25 = 1000 + 450 = 1450
        assert r.json()["total_amount"] == 1450.0, r.json()

    def test_delete_success(self, auth_session):
        tid = TestSamplingLifecycle.created_id
        r = auth_session.delete(f"{BASE_URL}/api/performance/sampling-trials/{tid}")
        assert r.status_code == 200
        # GET list and ensure not present
        r2 = auth_session.get(f"{BASE_URL}/api/performance/sampling-trials")
        ids = [t.get("id") for t in r2.json().get("trials", [])]
        assert tid not in ids

    def test_delete_nonexistent_404(self, auth_session):
        r = auth_session.delete(f"{BASE_URL}/api/performance/sampling-trials/TEST_no_such_trial")
        assert r.status_code == 404
