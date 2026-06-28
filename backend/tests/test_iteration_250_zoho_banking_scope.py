"""Iteration 250 — verify ZohoBooks.banking.READ scope is included in OAuth URL.

Bug: User on production saw Zoho consent screen missing the 'Banking' permission.
Root cause: scopes list in services/zoho_service.py did not include
'ZohoBooks.banking.READ'. Fix: scope appended at line ~78.

This test verifies:
  1. GET /api/zoho/oauth/initiate returns an authorize_url whose 'scope' query
     param (URL-decoded) contains 'ZohoBooks.banking.READ'.
  2. None of the pre-existing scopes were dropped.
  3. Direct unit-level: services.zoho_service.build_authorize_url() also
     includes the scope (covers the case where ZOHO creds may be missing on the
     preview env so the route returns 400).
"""
import os
import sys
from pathlib import Path
from urllib.parse import urlparse, parse_qs, unquote

import pytest
import requests
from dotenv import dotenv_values

# Frontend public URL
FRONTEND_ENV = dotenv_values(Path("/app/frontend/.env"))
BASE_URL = (FRONTEND_ENV.get("REACT_APP_BACKEND_URL") or os.environ.get("REACT_APP_BACKEND_URL") or "").rstrip("/")
assert BASE_URL, "REACT_APP_BACKEND_URL must be set"
API = f"{BASE_URL}/api"

TENANT = "nyla-air-water"
EMAIL = "surya.yadavalli@nylaairwater.earth"
PASSWORD = "test123"

EXPECTED_SCOPES = [
    "ZohoBooks.contacts.READ",
    "ZohoBooks.invoices.READ",
    "ZohoBooks.creditnotes.READ",
    "ZohoBooks.deliverychallans.READ",
    "ZohoBooks.items.READ",
    "ZohoBooks.settings.READ",
    "ZohoBooks.settings.UPDATE",
    "ZohoBooks.banking.READ",  # the new one
]


@pytest.fixture(scope="module")
def auth_headers():
    r = requests.post(f"{API}/auth/login",
                      json={"email": EMAIL, "password": PASSWORD, "tenant_id": TENANT},
                      timeout=15)
    assert r.status_code == 200, f"Login failed: {r.status_code} {r.text}"
    body = r.json()
    token = body.get("access_token") or body.get("token") or body.get("session_token")
    assert token, f"No token in login response: {body}"
    return {"Authorization": f"Bearer {token}", "X-Tenant-ID": TENANT,
            "Content-Type": "application/json"}


def _extract_scope_param(authorize_url: str) -> str:
    """Pull the 'scope' query param from a Zoho authorize URL, URL-decoded."""
    parsed = urlparse(authorize_url)
    qs = parse_qs(parsed.query)
    raw_scope = qs.get("scope", [""])[0]
    # parse_qs already URL-decodes once; do it again defensively in case of double-encoding
    return unquote(raw_scope)


class TestOAuthInitiateScopes:
    """Hit the live /api/zoho/oauth/initiate endpoint as admin."""

    def test_initiate_returns_authorize_url_with_banking_scope(self, auth_headers):
        r = requests.get(f"{API}/zoho/oauth/initiate", headers=auth_headers, timeout=15)
        # If Zoho creds aren't configured on preview, the route raises 400.
        # That's a separate concern — see the unit test below.
        if r.status_code == 400 and "not configured" in r.text.lower():
            pytest.skip(f"Zoho creds not configured on preview: {r.text}")
        assert r.status_code == 200, f"initiate failed: {r.status_code} {r.text}"
        body = r.json()
        assert "authorize_url" in body, f"missing authorize_url in response: {body}"
        authorize_url = body["authorize_url"]
        assert authorize_url.startswith("http"), f"bad authorize_url: {authorize_url}"

        scope_str = _extract_scope_param(authorize_url)
        assert scope_str, f"empty scope param in {authorize_url}"
        scopes = [s.strip() for s in scope_str.split(",")]

        # THE CORE ASSERTION for this iteration
        assert "ZohoBooks.banking.READ" in scopes, (
            f"ZohoBooks.banking.READ missing from authorize URL scope list. "
            f"Found: {scopes}"
        )

    def test_initiate_preserves_pre_existing_scopes(self, auth_headers):
        r = requests.get(f"{API}/zoho/oauth/initiate", headers=auth_headers, timeout=15)
        if r.status_code == 400 and "not configured" in r.text.lower():
            pytest.skip(f"Zoho creds not configured on preview: {r.text}")
        assert r.status_code == 200
        scope_str = _extract_scope_param(r.json()["authorize_url"])
        scopes = set(s.strip() for s in scope_str.split(","))
        missing = [s for s in EXPECTED_SCOPES if s not in scopes]
        assert not missing, (
            f"Pre-existing scopes were dropped: {missing}. Full scope list: {sorted(scopes)}"
        )

    def test_initiate_requires_auth(self):
        # Sanity: unauthenticated must NOT get an authorize URL.
        r = requests.get(f"{API}/zoho/oauth/initiate", timeout=10)
        assert r.status_code in (401, 403), f"unauthenticated got {r.status_code} {r.text}"


class TestZohoServiceUnit:
    """Direct unit-level — works even when env creds are missing on preview."""

    def test_build_authorize_url_contains_banking_scope(self):
        # Import lazily so test collection doesn't fail on import errors
        sys.path.insert(0, "/app/backend")
        from services import zoho_service  # noqa: E402

        url = zoho_service.build_authorize_url("teststate-xyz", "https://example.com/cb")
        assert url, "build_authorize_url returned empty"

        scope_str = _extract_scope_param(url)
        scopes = [s.strip() for s in scope_str.split(",")]
        assert "ZohoBooks.banking.READ" in scopes, (
            f"build_authorize_url missing banking scope. Got: {scopes}"
        )

    def test_build_authorize_url_preserves_all_expected_scopes(self):
        sys.path.insert(0, "/app/backend")
        from services import zoho_service  # noqa: E402

        url = zoho_service.build_authorize_url("teststate-xyz", "https://example.com/cb")
        scope_str = _extract_scope_param(url)
        scopes = set(s.strip() for s in scope_str.split(","))
        missing = [s for s in EXPECTED_SCOPES if s not in scopes]
        assert not missing, f"Scopes dropped: {missing}. Got: {sorted(scopes)}"

    def test_build_authorize_url_query_shape(self):
        sys.path.insert(0, "/app/backend")
        from services import zoho_service  # noqa: E402

        url = zoho_service.build_authorize_url("statevalue", "https://example.com/cb")
        parsed = urlparse(url)
        qs = parse_qs(parsed.query)
        # standard Zoho OAuth params should all be present
        for key in ("scope", "client_id", "response_type", "redirect_uri", "state"):
            assert key in qs, f"missing OAuth query param {key} in {url}"
        assert qs["state"][0] == "statevalue"
        assert qs["redirect_uri"][0] == "https://example.com/cb"


class TestRegressionExistingZohoEndpoints:
    """Make sure surrounding Zoho endpoints still respond as before."""

    def test_zoho_config_status(self, auth_headers):
        r = requests.get(f"{API}/zoho/config-status", headers=auth_headers, timeout=15)
        assert r.status_code == 200, f"{r.status_code} {r.text}"
        # Should return a dict telling us if creds are configured
        body = r.json()
        assert isinstance(body, dict)

    def test_zoho_connection_status(self, auth_headers):
        r = requests.get(f"{API}/zoho/status", headers=auth_headers, timeout=15)
        assert r.status_code == 200, f"{r.status_code} {r.text}"
        assert isinstance(r.json(), dict)


class TestRegressionAccountingTransactionsSync:
    """Iteration 248/249 regression: sync endpoints still reachable & contract intact."""

    def test_list_endpoint_reachable(self, auth_headers):
        r = requests.get(f"{API}/accounting/transactions", headers=auth_headers, timeout=15)
        assert r.status_code in (200, 400), f"{r.status_code} {r.text}"

    def test_category_summary_reachable(self, auth_headers):
        r = requests.get(f"{API}/accounting/transactions/category-summary",
                         headers=auth_headers, timeout=15)
        assert r.status_code in (200, 400), f"{r.status_code} {r.text}"

    def test_sync_status_404_for_unknown_job(self, auth_headers):
        r = requests.get(f"{API}/accounting/transactions/sync/status/does-not-exist-xyz",
                         headers=auth_headers, timeout=15)
        assert r.status_code == 404, f"{r.status_code} {r.text}"

    def test_sync_kickoff_preflight(self, auth_headers):
        # Pre-flight gate from iter 248: when Zoho not connected -> 400 quickly.
        r = requests.post(f"{API}/accounting/transactions/sync",
                          headers=auth_headers,
                          json={"from": "2024-01-01", "to": "2024-01-31"},
                          timeout=15)
        # Either 400 (zoho not connected, expected on preview) or 202 (job queued)
        assert r.status_code in (200, 202, 400), f"{r.status_code} {r.text}"
