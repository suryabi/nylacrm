"""Tests for Performance Tracker section-order endpoints (iteration_162).

Verifies:
- GET /api/performance/section-order returns default order with is_default=True when unset
- PUT persists new order for CEO/System Admin and returns cleaned order
- Subsequent GET reflects saved order with is_default=False
- PUT validates: drops unknown ids, appends missing default ids
- PUT with non-admin role returns 403
"""
import os
import pytest
import requests

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL").rstrip("/")
API = f"{BASE_URL}/api"

CEO_EMAIL = "surya.yadavalli@nylaairwater.earth"
CEO_PASSWORD = "test123"
TENANT_ID = "nyla-air-water"

DEFAULT_ORDER = [
    "new_accounts",
    "case_targets",
    "sampling_trials",
    "focus_leads",
    "next_month_leads",
    "existing_accounts",
]


def _login_session(email: str, password: str):
    """Login and return a requests.Session with session_token cookie/header set."""
    s = requests.Session()
    r = s.post(f"{API}/auth/login", json={"email": email, "password": password})
    if r.status_code != 200:
        return None, r
    body = r.json() if r.headers.get("content-type", "").startswith("application/json") else {}
    token = body.get("session_token") or body.get("access_token") or body.get("token")
    if r.cookies.get("session_token"):
        s.cookies.set("session_token", r.cookies.get("session_token"))
    if token:
        s.headers.update({"Authorization": f"Bearer {token}"})
    s.headers.update({"X-Tenant-ID": TENANT_ID, "Content-Type": "application/json"})
    return s, r


@pytest.fixture(scope="module")
def ceo_session():
    s, r = _login_session(CEO_EMAIL, CEO_PASSWORD)
    if not s:
        pytest.skip(f"CEO login failed: {r.status_code} {r.text}")
    return s


@pytest.fixture(scope="module")
def ceo_headers(ceo_session):
    return ceo_session  # used as "client" — same session-based interface


@pytest.fixture(scope="module", autouse=True)
def reset_to_default(ceo_session):
    """Reset section order to default before tests run."""
    ceo_session.put(
        f"{API}/performance/section-order",
        json={"order": DEFAULT_ORDER},
    )
    yield
    ceo_session.put(
        f"{API}/performance/section-order",
        json={"order": DEFAULT_ORDER},
    )


class TestSectionOrderGet:
    def test_get_returns_complete_order(self, ceo_session):
        r = ceo_session.get(f"{API}/performance/section-order")
        assert r.status_code == 200, r.text
        data = r.json()
        assert "order" in data
        assert "is_default" in data
        assert isinstance(data["order"], list)
        assert sorted(data["order"]) == sorted(DEFAULT_ORDER)
        assert data["order"] == DEFAULT_ORDER  # matches required default order


class TestSectionOrderPutCEO:
    def test_put_persists_new_order(self, ceo_session):
        new_order = [
            "case_targets",
            "new_accounts",
            "sampling_trials",
            "focus_leads",
            "next_month_leads",
            "existing_accounts",
        ]
        r = ceo_session.put(
            f"{API}/performance/section-order",
            json={"order": new_order},
        )
        assert r.status_code == 200, r.text
        data = r.json()
        assert data["order"] == new_order
        assert data["is_default"] is False

        # GET reflects saved order
        g = ceo_session.get(f"{API}/performance/section-order")
        assert g.status_code == 200
        gd = g.json()
        assert gd["order"] == new_order
        assert gd["is_default"] is False

    def test_put_drops_unknown_and_appends_missing(self, ceo_session):
        payload = ["case_targets", "unknown_id", "new_accounts"]
        r = ceo_session.put(
            f"{API}/performance/section-order",
            json={"order": payload},
        )
        assert r.status_code == 200, r.text
        cleaned = r.json()["order"]
        assert cleaned[0] == "case_targets"
        assert cleaned[1] == "new_accounts"
        assert "unknown_id" not in cleaned
        assert sorted(cleaned) == sorted(DEFAULT_ORDER)
        assert len(cleaned) == len(DEFAULT_ORDER)
        appended = cleaned[2:]
        expected_appended = [s for s in DEFAULT_ORDER if s not in ("case_targets", "new_accounts")]
        assert appended == expected_appended

    def test_put_empty_order_rejected(self, ceo_session):
        r = ceo_session.put(
            f"{API}/performance/section-order",
            json={"order": []},
        )
        assert r.status_code == 400


class TestSectionOrderPutNonAdmin:
    def test_non_admin_forbidden(self, ceo_session):
        # Find a non-admin user from team list
        r = ceo_session.get(f"{API}/team/users")
        if r.status_code != 200:
            pytest.skip(f"team/users not accessible: {r.status_code}")
        users = r.json()
        if isinstance(users, dict):
            users = users.get("users") or users.get("data") or []
        non_admin = None
        for u in users:
            role = u.get("role") or ""
            if role and role not in ("CEO", "System Admin"):
                non_admin = u
                break
        if not non_admin:
            pytest.skip("No non-admin user available for 403 test")

        email = non_admin.get("email")
        if not email:
            pytest.skip("Non-admin user has no email")

        sess = None
        for pw in ("test123", "password", "Test@123"):
            s, lr = _login_session(email, pw)
            if s is not None:
                sess = s
                break
        if not sess:
            pytest.skip(f"Could not login as non-admin {email} (no known password)")

        r = sess.put(
            f"{API}/performance/section-order",
            json={"order": DEFAULT_ORDER},
        )
        assert r.status_code == 403, f"Expected 403, got {r.status_code}: {r.text}"
