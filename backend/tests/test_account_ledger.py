"""
Tests for the new per-account Zoho Books ledger / statement endpoints:
  GET  /api/accounts/{account_id}/statement/status
  GET  /api/accounts/{account_id}/statement/pdf
  POST /api/accounts/{account_id}/statement/share-link
  GET  /api/share/d/{token}      (public, no auth)

ENVIRONMENT NOTE: Zoho Books is NOT connected in this preview environment.
Therefore:
  • statement/status must report zoho_connected=false
  • statement/pdf must return HTTP 409 (not connected) or 400 (not linked)
  • statement/share-link must still succeed (PDF is only fetched on public download)
  • public /share/d/{token} must return a 4xx/5xx (typically 502) without crashing
"""
import os
import pytest
import requests
from urllib.parse import unquote

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL').rstrip('/')

# Test credentials (CEO)
LOGIN_EMAIL = "surya.yadavalli@nylaairwater.earth"
LOGIN_PASSWORD = "test123"

# Linked account (Toopa Ice-creamery — has zoho_contact_id)
LINKED_ACCOUNT_ID = "81263309-2118-4d51-b1d9-fe9549da07b7"


@pytest.fixture(scope="module")
def session():
    s = requests.Session()
    s.headers.update({"Content-Type": "application/json"})
    resp = s.post(f"{BASE_URL}/api/auth/login", json={
        "email": LOGIN_EMAIL, "password": LOGIN_PASSWORD,
    })
    if resp.status_code != 200:
        pytest.skip(f"Auth failed: {resp.status_code} {resp.text[:200]}")
    token = resp.json().get("session_token")
    assert token, "No session_token in login response"
    s.headers.update({"Authorization": f"Bearer {token}"})
    return s


@pytest.fixture(scope="module")
def unlinked_account_id(session):
    """Find any account without zoho_contact_id (for the 400 'not linked' case)."""
    resp = session.get(f"{BASE_URL}/api/accounts?page=1&page_size=200")
    if resp.status_code != 200:
        pytest.skip(f"Could not list accounts: {resp.status_code}")
    data = resp.json()
    accts = data.get("data") or data.get("accounts") or data.get("items") or (data if isinstance(data, list) else [])
    for a in accts:
        if not (a.get("zoho_contact_id") or "").strip():
            return a.get("id") or a.get("account_id")
    pytest.skip("No unlinked account found for 400 test")


# ── /statement/status ───────────────────────────────────────────────────────
class TestStatementStatus:
    def test_status_linked_account_returns_expected_shape(self, session):
        resp = session.get(f"{BASE_URL}/api/accounts/{LINKED_ACCOUNT_ID}/statement/status")
        assert resp.status_code == 200, resp.text
        data = resp.json()
        # Required keys
        for key in ("account_id", "account_name", "zoho_connected", "linked", "zoho_contact_id"):
            assert key in data, f"missing {key} in {data}"
        # Zoho is intentionally NOT connected in preview
        assert data["zoho_connected"] is False
        # This is a linked account
        assert data["linked"] is True
        assert data["zoho_contact_id"], "Expected a non-empty zoho_contact_id for the linked account"
        assert data["account_id"] == LINKED_ACCOUNT_ID
        assert isinstance(data["account_name"], str) and data["account_name"]

    def test_status_unknown_account_404(self, session):
        resp = session.get(f"{BASE_URL}/api/accounts/does-not-exist-xyz/statement/status")
        assert resp.status_code == 404

    def test_status_requires_auth(self):
        anon = requests.Session()
        resp = anon.get(f"{BASE_URL}/api/accounts/{LINKED_ACCOUNT_ID}/statement/status")
        assert resp.status_code in (401, 403)


# ── /statement/pdf ──────────────────────────────────────────────────────────
class TestStatementPdf:
    def test_pdf_linked_account_returns_409_when_zoho_disconnected(self, session):
        """Zoho is not connected → RuntimeError → HTTPException(409)."""
        resp = session.get(f"{BASE_URL}/api/accounts/{LINKED_ACCOUNT_ID}/statement/pdf")
        # In preview zoho is not connected. Should be 409 with clean detail message.
        assert resp.status_code == 409, f"expected 409, got {resp.status_code}: {resp.text[:300]}"
        detail = resp.json().get("detail", "")
        assert "not connected" in detail.lower(), f"expected 'not connected' in detail; got: {detail!r}"

    def test_pdf_unlinked_account_returns_400(self, session, unlinked_account_id):
        resp = session.get(f"{BASE_URL}/api/accounts/{unlinked_account_id}/statement/pdf")
        assert resp.status_code == 400, f"expected 400, got {resp.status_code}: {resp.text[:300]}"
        detail = resp.json().get("detail", "")
        assert "not linked" in detail.lower()


# ── /statement/share-link ───────────────────────────────────────────────────
class TestStatementShareLink:
    def test_share_link_success(self, session):
        resp = session.post(
            f"{BASE_URL}/api/accounts/{LINKED_ACCOUNT_ID}/statement/share-link",
            json={"base_url": BASE_URL},
        )
        assert resp.status_code == 200, resp.text
        data = resp.json()
        # Required keys
        for k in ("public_url", "whatsapp_url", "expires_at"):
            assert k in data, f"missing {k} in {data}"
        # public_url must be absolute https ending in /api/share/d/<token>
        pu = data["public_url"]
        assert pu.startswith("https://"), f"public_url must be absolute https: {pu}"
        assert "/api/share/d/" in pu, f"public_url missing /api/share/d/: {pu}"
        token = pu.rsplit("/api/share/d/", 1)[-1]
        assert token and "/" not in token, f"unexpected token in public_url: {pu}"
        # whatsapp_url shape
        wa = data["whatsapp_url"]
        assert wa.startswith("https://wa.me/"), f"whatsapp_url must start with https://wa.me/: {wa}"
        # It must contain the url-encoded public_url in the text= parameter
        assert "text=" in wa
        text_val = wa.split("text=", 1)[1]
        assert pu in unquote(text_val), (
            f"whatsapp_url text= must contain the public_url. wa={wa} public_url={pu}"
        )
        # Return token for the public-download test
        pytest._ledger_public_token = token
        pytest._ledger_public_url = pu

    def test_share_link_unlinked_account_returns_400(self, session, unlinked_account_id):
        resp = session.post(
            f"{BASE_URL}/api/accounts/{unlinked_account_id}/statement/share-link",
            json={"base_url": BASE_URL},
        )
        assert resp.status_code == 400
        assert "not linked" in resp.json().get("detail", "").lower()


# ── Public signed link (no auth) ────────────────────────────────────────────
class TestPublicShareDownload:
    def test_public_download_returns_clean_5xx_when_zoho_disconnected(self, session):
        """Preview: Zoho is not connected. The resolver's fetch_pdf raises
        RuntimeError. The public endpoint must return a clean 4xx/5xx (not 500)
        and must not crash."""
        # Ensure we have a token from the share-link test
        pu = getattr(pytest, "_ledger_public_url", None)
        if not pu:
            # Create one on the fly
            r = session.post(
                f"{BASE_URL}/api/accounts/{LINKED_ACCOUNT_ID}/statement/share-link",
                json={"base_url": BASE_URL},
            )
            assert r.status_code == 200
            pu = r.json()["public_url"]
        # Hit it anonymously (no auth header)
        anon = requests.Session()
        resp = anon.get(pu, allow_redirects=False)
        # Accept 502 (fetch failed) or 404 (invalid). 500 == crash == bug.
        assert resp.status_code in (400, 404, 409, 502), (
            f"unexpected status {resp.status_code} on public download; body={resp.text[:300]}"
        )
        # Backend returns JSON {"detail": "..."} but Cloudflare/ingress may replace
        # 5xx bodies with its own HTML error page — that's an infra concern, not a
        # backend bug. So we only require: a) not 500/crash, b) body is either
        # valid JSON with detail OR an HTML error page. Confirmed via backend logs
        # that FastAPI itself returns 502 JSON without crashing.
        ctype = (resp.headers.get("content-type") or "").lower()
        if "json" in ctype:
            body = resp.json()
            assert body.get("detail") or body.get("message"), f"empty error body: {body}"
        else:
            # HTML from an edge proxy — just ensure it isn't a Python traceback
            assert "traceback" not in resp.text.lower(), "python traceback leaked to client"

    def test_public_download_invalid_token_404(self):
        anon = requests.Session()
        resp = anon.get(f"{BASE_URL}/api/share/d/not-a-real-token-xyz")
        assert resp.status_code == 404
