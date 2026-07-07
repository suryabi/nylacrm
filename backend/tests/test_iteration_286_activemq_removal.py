"""
Iteration 286 — Backend regression tests after ActiveMQ removal & non-blocking startup.

Verifies:
  1) Health endpoints respond 200 immediately.
  2) CEO login works and returns a session_token.
  3) Removed ActiveMQ / invoice-webhook endpoints return 404 (not 500).
  4) Core read endpoints still work with the CEO token.
  5) Guard framework endpoints (from iteration 285) still work.
"""
import os
import pytest
import requests

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "https://design-workflow-hub-11.preview.emergentagent.com").rstrip("/")
CEO_EMAIL = "surya.yadavalli@nylaairwater.earth"
CEO_PASSWORD = "test123"
DRN_ID = "24d674f4-74ac-4752-992e-9fc73c801bc0"


@pytest.fixture(scope="session")
def api_client():
    s = requests.Session()
    s.headers.update({"Content-Type": "application/json"})
    return s


@pytest.fixture(scope="session")
def auth_token(api_client):
    r = api_client.post(
        f"{BASE_URL}/api/auth/login",
        json={"email": CEO_EMAIL, "password": CEO_PASSWORD},
        timeout=30,
    )
    assert r.status_code == 200, f"Login failed: {r.status_code} {r.text[:300]}"
    data = r.json()
    assert "session_token" in data, f"No session_token in response: {data}"
    assert isinstance(data["session_token"], str) and len(data["session_token"]) > 0
    assert "user" in data
    return data["session_token"]


@pytest.fixture(scope="session")
def auth_client(api_client, auth_token):
    api_client.headers.update({"Authorization": f"Bearer {auth_token}"})
    return api_client


# ---------- Health / boot ----------
class TestHealth:
    def test_health(self, api_client):
        r = api_client.get(f"{BASE_URL}/api/health", timeout=10)
        assert r.status_code == 200
        body = r.json()
        assert body.get("status") == "healthy", f"Unexpected health body: {body}"

    def test_healthz(self, api_client):
        r = api_client.get(f"{BASE_URL}/api/healthz", timeout=10)
        assert r.status_code == 200, f"/api/healthz got {r.status_code}: {r.text[:200]}"

    def test_ping(self, api_client):
        r = api_client.get(f"{BASE_URL}/api/ping", timeout=10)
        assert r.status_code == 200, f"/api/ping got {r.status_code}: {r.text[:200]}"


# ---------- Auth ----------
class TestAuth:
    def test_login_returns_session_token_and_user(self, auth_token):
        assert isinstance(auth_token, str) and len(auth_token) > 10


# ---------- Removed ActiveMQ endpoints should be 404 (not 500) ----------
class TestActiveMQRemoved:
    @pytest.mark.parametrize(
        "method,path,acceptable",
        [
            # mq/status + activemq/status are on unique paths — must be 404
            ("GET", "/api/mq/status", {404}),
            ("GET", "/api/activemq/status", {404}),
            # /api/invoices/webhook is now shadowed by dynamic /api/invoices/{invoice_id}
            # routes (DELETE/void/pdf handlers), so FastAPI returns 405 instead of 404 —
            # both are acceptable proof the ActiveMQ webhook POST handler is gone.
            ("POST", "/api/invoices/webhook", {404, 405}),
        ],
    )
    def test_removed_endpoint_no_longer_500(self, auth_client, method, path, acceptable):
        url = f"{BASE_URL}{path}"
        if method == "GET":
            r = auth_client.get(url, timeout=10)
        else:
            r = auth_client.post(url, json={}, timeout=10)
        assert r.status_code in acceptable, (
            f"{method} {path}: expected {acceptable}, got {r.status_code} — body: {r.text[:200]}"
        )
        # Must not be 5xx (no import/runtime regression)
        assert r.status_code < 500


# ---------- Core read endpoints ----------
class TestCoreReads:
    def test_leads_list(self, auth_client):
        r = auth_client.get(f"{BASE_URL}/api/leads", timeout=30)
        assert r.status_code == 200, f"/api/leads: {r.status_code} {r.text[:300]}"
        body = r.json()
        # tolerate list or {items:[...]}
        assert isinstance(body, (list, dict)), type(body)

    def test_design_requests_new_list(self, auth_client):
        r = auth_client.get(f"{BASE_URL}/api/design-requests-new/", timeout=30)
        assert r.status_code == 200, f"/api/design-requests-new/: {r.status_code} {r.text[:300]}"

    def test_invoices_list(self, auth_client):
        # Try both common paths
        for path in ["/api/invoices", "/api/invoices/"]:
            r = auth_client.get(f"{BASE_URL}{path}", timeout=30)
            if r.status_code == 200:
                return
        pytest.fail(f"invoices list failed on both /api/invoices and /api/invoices/: {r.status_code} {r.text[:300]}")

    def test_accounting_transactions_list(self, auth_client):
        # accounting_transactions router — background index task should not affect availability
        for path in ["/api/accounting-transactions", "/api/accounting-transactions/", "/api/accounting/transactions"]:
            r = auth_client.get(f"{BASE_URL}{path}", timeout=30)
            if r.status_code == 200:
                return
        # Not fatal — just record; but expected to work per the review request
        pytest.fail(f"Accounting transactions endpoint not reachable: last status {r.status_code} {r.text[:200]}")


# ---------- Guard-framework regression (iteration 285) ----------
class TestGuardRegression:
    def test_fields_catalog_design_requests_new(self, auth_client):
        r = auth_client.get(
            f"{BASE_URL}/api/state-machines/fields/catalog",
            params={"workflow_key": "design_requests_new"},
            timeout=15,
        )
        assert r.status_code == 200, f"catalog got {r.status_code}: {r.text[:300]}"
        body = r.json()
        # tolerate shapes: {fields:[...]} or [...]
        fields = body["fields"] if isinstance(body, dict) and "fields" in body else body
        assert isinstance(fields, list) and len(fields) > 0
        keys = {f.get("key") or f.get("name") for f in fields}
        for expected in ("approved_versions", "lead.status", "lead.logo_url"):
            assert expected in keys, f"missing derived field '{expected}' in catalog keys: {sorted(keys)}"
        # lead.status must have non-empty options
        lead_status = next((f for f in fields if (f.get("key") or f.get("name")) == "lead.status"), None)
        assert lead_status is not None
        opts = lead_status.get("options") or lead_status.get("enum") or []
        assert isinstance(opts, list) and len(opts) > 0, f"lead.status options empty: {lead_status}"

    def test_drn_available_transitions(self, auth_client):
        r = auth_client.get(
            f"{BASE_URL}/api/design-requests-new/{DRN_ID}/available-transitions",
            timeout=15,
        )
        assert r.status_code == 200, f"available-transitions got {r.status_code}: {r.text[:300]}"
        body = r.json()
        # Should be a list/dict with transitions
        assert isinstance(body, (list, dict))
