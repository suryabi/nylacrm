"""Backend tests for Top 5 Leads to Focus feature (Performance Tracker → Top 10 Priorities).

Endpoints under test:
  - GET  /api/performance/focus-leads?year=&month=&resource_ids=
  - POST /api/performance/focus-leads  (upsert selection)
"""
import os
import pytest
import requests

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "").rstrip("/")
TENANT_ID = "nyla-air-water"
EMAIL = "surya.yadavalli@nylaairwater.earth"
PASSWORD = "test123"

YEAR = 2026
MONTH = 5
ALT_MONTH = 6


# ── Fixtures ──────────────────────────────────────────────────────────────────
@pytest.fixture(scope="module")
def auth_session():
    assert BASE_URL, "REACT_APP_BACKEND_URL must be set"
    s = requests.Session()
    s.headers.update({"Content-Type": "application/json", "X-Tenant-ID": TENANT_ID})
    r = s.post(f"{BASE_URL}/api/auth/login", json={"email": EMAIL, "password": PASSWORD})
    if r.status_code != 200:
        pytest.skip(f"Login failed {r.status_code}: {r.text[:200]}")
    data = r.json()
    token = data.get("session_token") or data.get("token") or data.get("access_token")
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
def user_id(me, auth_session):
    uid = me.get("id") or auth_session._user.get("id")
    assert uid, "Unable to resolve current user id"
    return uid


@pytest.fixture(scope="module")
def assigned_leads(auth_session, user_id):
    """Get leads assigned to Surya via focus-leads GET."""
    r = auth_session.get(
        f"{BASE_URL}/api/performance/focus-leads",
        params={"year": YEAR, "month": MONTH, "resource_ids": user_id},
    )
    assert r.status_code == 200, r.text
    leads = r.json().get("leads") or []
    if not leads:
        pytest.skip("No leads assigned to current user")
    return leads


@pytest.fixture(autouse=False)
def cleanup_selection(auth_session, user_id):
    """Reset selection for (YEAR, MONTH, user) after test."""
    yield
    auth_session.post(
        f"{BASE_URL}/api/performance/focus-leads",
        json={"year": YEAR, "month": MONTH, "resource_id": user_id, "lead_ids": []},
    )


# ── GET /focus-leads ──────────────────────────────────────────────────────────
class TestGetFocusLeads:
    def test_get_returns_expected_shape(self, auth_session, user_id):
        r = auth_session.get(
            f"{BASE_URL}/api/performance/focus-leads",
            params={"year": YEAR, "month": MONTH, "resource_ids": user_id},
        )
        assert r.status_code == 200, r.text
        data = r.json()
        assert data["year"] == YEAR
        assert data["month"] == MONTH
        assert isinstance(data.get("leads"), list)
        assert isinstance(data.get("selected_lead_ids"), list)
        assert "is_editable" in data
        assert "totals" in data
        assert "selected_count" in data["totals"]
        assert "estimated_monthly_revenue" in data["totals"]

    def test_single_resource_is_editable_true(self, auth_session, user_id):
        r = auth_session.get(
            f"{BASE_URL}/api/performance/focus-leads",
            params={"year": YEAR, "month": MONTH, "resource_ids": user_id},
        )
        assert r.status_code == 200
        assert r.json()["is_editable"] is True

    def test_multi_resource_is_editable_false(self, auth_session, user_id):
        rids = f"{user_id},someother-id-abc"
        r = auth_session.get(
            f"{BASE_URL}/api/performance/focus-leads",
            params={"year": YEAR, "month": MONTH, "resource_ids": rids},
        )
        assert r.status_code == 200
        assert r.json()["is_editable"] is False

    def test_leads_have_required_fields(self, auth_session, user_id, assigned_leads):
        lead = assigned_leads[0]
        for field in ("id", "name", "city", "status", "priority", "estimated_monthly_revenue"):
            assert field in lead, f"Missing {field} in lead row: {lead}"

    def test_invalid_month_returns_400(self, auth_session, user_id):
        r = auth_session.get(
            f"{BASE_URL}/api/performance/focus-leads",
            params={"year": YEAR, "month": 13, "resource_ids": user_id},
        )
        assert r.status_code == 400


# ── POST /focus-leads ─────────────────────────────────────────────────────────
class TestUpsertFocusLeads:
    def test_post_without_resource_id_returns_400(self, auth_session):
        r = auth_session.post(
            f"{BASE_URL}/api/performance/focus-leads",
            json={"year": YEAR, "month": MONTH, "resource_id": "", "lead_ids": []},
        )
        assert r.status_code == 400

    def test_post_with_invalid_month_returns_400(self, auth_session, user_id):
        r = auth_session.post(
            f"{BASE_URL}/api/performance/focus-leads",
            json={"year": YEAR, "month": 0, "resource_id": user_id, "lead_ids": []},
        )
        assert r.status_code == 400

    def test_upsert_persists_and_get_returns_same(self, auth_session, user_id, assigned_leads, cleanup_selection):
        pick = [l["id"] for l in assigned_leads[:3]]
        r = auth_session.post(
            f"{BASE_URL}/api/performance/focus-leads",
            json={"year": YEAR, "month": MONTH, "resource_id": user_id, "lead_ids": pick},
        )
        assert r.status_code == 200, r.text
        body = r.json()
        assert body.get("ok") is True
        assert body.get("count") == len(pick)
        assert body.get("lead_ids") == pick

        r2 = auth_session.get(
            f"{BASE_URL}/api/performance/focus-leads",
            params={"year": YEAR, "month": MONTH, "resource_ids": user_id},
        )
        assert r2.status_code == 200
        sel = r2.json().get("selected_lead_ids")
        assert sel == pick
        assert r2.json()["totals"]["selected_count"] == len(pick)

    def test_upsert_empty_clears_selection(self, auth_session, user_id, assigned_leads):
        pick = [l["id"] for l in assigned_leads[:2]]
        auth_session.post(
            f"{BASE_URL}/api/performance/focus-leads",
            json={"year": YEAR, "month": MONTH, "resource_id": user_id, "lead_ids": pick},
        )
        r = auth_session.post(
            f"{BASE_URL}/api/performance/focus-leads",
            json={"year": YEAR, "month": MONTH, "resource_id": user_id, "lead_ids": []},
        )
        assert r.status_code == 200
        assert r.json()["count"] == 0

        r2 = auth_session.get(
            f"{BASE_URL}/api/performance/focus-leads",
            params={"year": YEAR, "month": MONTH, "resource_ids": user_id},
        )
        assert r2.json()["selected_lead_ids"] == []

    def test_dedup_preserves_order(self, auth_session, user_id, assigned_leads, cleanup_selection):
        if len(assigned_leads) < 3:
            pytest.skip("Not enough leads to test dedup")
        a, b, c = (l["id"] for l in assigned_leads[:3])
        payload_ids = [a, b, a, c, b, c]  # duplicates
        r = auth_session.post(
            f"{BASE_URL}/api/performance/focus-leads",
            json={"year": YEAR, "month": MONTH, "resource_id": user_id, "lead_ids": payload_ids},
        )
        assert r.status_code == 200
        assert r.json()["lead_ids"] == [a, b, c]

    def test_no_cap_more_than_five(self, auth_session, user_id, assigned_leads, cleanup_selection):
        if len(assigned_leads) < 6:
            pytest.skip("Need at least 6 assigned leads for this test")
        pick = [l["id"] for l in assigned_leads[:7]]
        r = auth_session.post(
            f"{BASE_URL}/api/performance/focus-leads",
            json={"year": YEAR, "month": MONTH, "resource_id": user_id, "lead_ids": pick},
        )
        assert r.status_code == 200
        assert r.json()["count"] == 7

        r2 = auth_session.get(
            f"{BASE_URL}/api/performance/focus-leads",
            params={"year": YEAR, "month": MONTH, "resource_ids": user_id},
        )
        assert len(r2.json()["selected_lead_ids"]) == 7

    def test_months_are_independent(self, auth_session, user_id, assigned_leads):
        a = assigned_leads[0]["id"]
        b = assigned_leads[1]["id"] if len(assigned_leads) > 1 else a
        # month 5 = [a], month 6 = [b]
        auth_session.post(
            f"{BASE_URL}/api/performance/focus-leads",
            json={"year": YEAR, "month": MONTH, "resource_id": user_id, "lead_ids": [a]},
        )
        auth_session.post(
            f"{BASE_URL}/api/performance/focus-leads",
            json={"year": YEAR, "month": ALT_MONTH, "resource_id": user_id, "lead_ids": [b]},
        )
        r1 = auth_session.get(
            f"{BASE_URL}/api/performance/focus-leads",
            params={"year": YEAR, "month": MONTH, "resource_ids": user_id},
        )
        r2 = auth_session.get(
            f"{BASE_URL}/api/performance/focus-leads",
            params={"year": YEAR, "month": ALT_MONTH, "resource_ids": user_id},
        )
        assert r1.json()["selected_lead_ids"] == [a]
        assert r2.json()["selected_lead_ids"] == [b]
        # cleanup both
        for m in (MONTH, ALT_MONTH):
            auth_session.post(
                f"{BASE_URL}/api/performance/focus-leads",
                json={"year": YEAR, "month": m, "resource_id": user_id, "lead_ids": []},
            )

    def test_totals_revenue_matches_sum_of_selected(self, auth_session, user_id, assigned_leads, cleanup_selection):
        pick_leads = assigned_leads[:3]
        pick_ids = [l["id"] for l in pick_leads]
        expected = round(sum(float(l.get("estimated_monthly_revenue") or 0) for l in pick_leads), 2)
        auth_session.post(
            f"{BASE_URL}/api/performance/focus-leads",
            json={"year": YEAR, "month": MONTH, "resource_id": user_id, "lead_ids": pick_ids},
        )
        r = auth_session.get(
            f"{BASE_URL}/api/performance/focus-leads",
            params={"year": YEAR, "month": MONTH, "resource_ids": user_id},
        )
        assert r.status_code == 200
        assert r.json()["totals"]["estimated_monthly_revenue"] == pytest.approx(expected, abs=0.01)
        assert r.json()["totals"]["selected_count"] == 3


# ── Unauthorized ──────────────────────────────────────────────────────────────
class TestAuth:
    def test_get_without_auth_blocked(self):
        r = requests.get(
            f"{BASE_URL}/api/performance/focus-leads",
            params={"year": YEAR, "month": MONTH, "resource_ids": ""},
        )
        assert r.status_code in (401, 403)

    def test_post_without_auth_blocked(self):
        r = requests.post(
            f"{BASE_URL}/api/performance/focus-leads",
            json={"year": YEAR, "month": MONTH, "resource_id": "x", "lead_ids": []},
        )
        assert r.status_code in (401, 403)
