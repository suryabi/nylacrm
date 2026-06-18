"""
Regression tests for external partner API Keys feature.

Covers:
 - GET /api/api-keys/available-endpoints (catalog)
 - POST /api/api-keys (create) + duplicate name
 - GET /api/api-keys (list - no key_hash, no raw key)
 - PUT /api/api-keys/{id} (update name/allowed/active)
 - DELETE /api/api-keys/{id} (revoke)
 - X-API-Key & Authorization Bearer ak_live_ on /api/accounts/{id}/invoices (POST/PUT)
 - Forbidden endpoint (403), inactive key (401), invalid key (401), no auth (401)
 - JWT regression on the same external endpoints
 - Non-admin -> 403 on /api/api-keys
"""
import os
import secrets
import time
import requests
import pytest

def _load_base_url():
    val = os.environ.get("REACT_APP_BACKEND_URL")
    if not val:
        # Fallback: read from frontend/.env
        env_path = os.path.join(os.path.dirname(__file__), "..", "..", "frontend", ".env")
        try:
            with open(os.path.abspath(env_path)) as f:
                for line in f:
                    if line.startswith("REACT_APP_BACKEND_URL="):
                        val = line.split("=", 1)[1].strip()
                        break
        except Exception:
            pass
    if not val:
        raise RuntimeError("REACT_APP_BACKEND_URL not set")
    return val.rstrip("/")

BASE_URL = _load_base_url()
ADMIN_EMAIL = "surya.yadavalli@nylaairwater.earth"
ADMIN_PASSWORD = "test123"
ACCOUNT_CODE = "PATN-KOL-A26-001"
ACCOUNT_ID = "feaaaec8-fbd3-4c78-9b88-5dabc9ba2630"


# ============== Fixtures ==============

@pytest.fixture(scope="session")
def admin_session():
    s = requests.Session()
    r = s.post(
        f"{BASE_URL}/api/auth/login",
        json={"email": ADMIN_EMAIL, "password": ADMIN_PASSWORD},
        timeout=20,
    )
    assert r.status_code == 200, f"Login failed: {r.status_code} {r.text}"
    body = r.json()
    token = body.get("token") or body.get("access_token") or body.get("session_token")
    assert token, f"No token in login response: {body}"
    s.headers.update({"Authorization": f"Bearer {token}"})
    s.token = token  # type: ignore
    return s


@pytest.fixture(scope="session")
def admin_token(admin_session):
    return admin_session.token  # type: ignore


@pytest.fixture(scope="session")
def created_keys():
    """Tracks all created keys so we can clean up at end of session."""
    return []


@pytest.fixture(scope="session", autouse=True)
def _cleanup(admin_session, created_keys):
    yield
    for kid in created_keys:
        try:
            admin_session.delete(f"{BASE_URL}/api/api-keys/{kid}", timeout=10)
        except Exception:
            pass


def _unique(prefix: str) -> str:
    return f"TEST_{prefix}_{secrets.token_hex(4)}"


# ============== Catalog ==============

class TestAvailableEndpoints:
    def test_catalog_returns_expected_entries(self, admin_session):
        r = admin_session.get(f"{BASE_URL}/api/api-keys/available-endpoints", timeout=15)
        assert r.status_code == 200, r.text
        data = r.json()
        assert isinstance(data, list)
        ids = {e["id"] for e in data}
        for must in ["create_account_invoice", "update_account_invoice", "list_master_skus",
                     "get_account_invoices", "list_accounts"]:
            assert must in ids, f"Missing endpoint id: {must}"
        # Each entry has method + path_pattern
        for e in data:
            assert e.get("method") and e.get("path_pattern")


# ============== CRUD ==============

class TestApiKeyCRUD:
    def test_create_returns_full_key_once(self, admin_session, created_keys):
        name = _unique("create")
        r = admin_session.post(
            f"{BASE_URL}/api/api-keys",
            json={"name": name, "allowed_endpoint_ids": ["create_account_invoice", "update_account_invoice"]},
            timeout=15,
        )
        assert r.status_code == 200, r.text
        d = r.json()
        assert d["name"] == name
        assert d["key"].startswith("ak_live_")
        assert len(d["key"]) >= 50  # 'ak_live_' (8) + 48 hex
        assert d["key_prefix"].startswith("ak_live_") and len(d["key_prefix"]) == 12
        assert isinstance(d.get("allowed_endpoints"), list) and len(d["allowed_endpoints"]) == 2
        assert d.get("is_active") is True
        assert "key_hash" not in d
        created_keys.append(d["id"])

    def test_duplicate_name_rejected(self, admin_session, created_keys):
        name = _unique("dup")
        r1 = admin_session.post(
            f"{BASE_URL}/api/api-keys",
            json={"name": name, "allowed_endpoint_ids": ["create_account_invoice"]},
        )
        assert r1.status_code == 200
        created_keys.append(r1.json()["id"])
        r2 = admin_session.post(
            f"{BASE_URL}/api/api-keys",
            json={"name": name, "allowed_endpoint_ids": ["create_account_invoice"]},
        )
        assert r2.status_code == 400
        assert "already exists" in r2.text.lower()

    def test_list_excludes_secrets(self, admin_session, created_keys):
        # Ensure at least one key exists
        if not created_keys:
            r = admin_session.post(
                f"{BASE_URL}/api/api-keys",
                json={"name": _unique("list"), "allowed_endpoint_ids": ["create_account_invoice"]},
            )
            assert r.status_code == 200
            created_keys.append(r.json()["id"])
        r = admin_session.get(f"{BASE_URL}/api/api-keys", timeout=15)
        assert r.status_code == 200
        for item in r.json():
            assert "key_hash" not in item
            assert "key" not in item  # full raw key never returned in list
            assert item.get("key_prefix", "").startswith("ak_live_")

    def test_update_name_and_endpoints(self, admin_session, created_keys):
        r = admin_session.post(
            f"{BASE_URL}/api/api-keys",
            json={"name": _unique("upd"), "allowed_endpoint_ids": ["create_account_invoice"]},
        )
        assert r.status_code == 200
        kid = r.json()["id"]
        created_keys.append(kid)
        new_name = _unique("upd2")
        r2 = admin_session.put(
            f"{BASE_URL}/api/api-keys/{kid}",
            json={"name": new_name, "allowed_endpoint_ids": ["list_master_skus", "list_accounts"], "is_active": False},
        )
        assert r2.status_code == 200, r2.text
        d = r2.json()
        assert d["name"] == new_name
        assert d["is_active"] is False
        ids = {e["id"] for e in d["allowed_endpoints"]}
        assert ids == {"list_master_skus", "list_accounts"}


# ============== External Auth ==============

class TestExternalAuth:
    @pytest.fixture(scope="class")
    def keypair(self, admin_session, created_keys):
        """Create a key authorized for create+update invoice."""
        r = admin_session.post(
            f"{BASE_URL}/api/api-keys",
            json={
                "name": _unique("ext"),
                "allowed_endpoint_ids": ["create_account_invoice", "update_account_invoice"],
            },
        )
        assert r.status_code == 200, r.text
        d = r.json()
        created_keys.append(d["id"])
        return d  # has 'key' and 'id'

    @pytest.fixture(scope="class")
    def restricted_key(self, admin_session, created_keys):
        """Key only allowed to LIST master SKUs - NOT create invoices."""
        r = admin_session.post(
            f"{BASE_URL}/api/api-keys",
            json={"name": _unique("restr"), "allowed_endpoint_ids": ["list_master_skus"]},
        )
        assert r.status_code == 200
        d = r.json()
        created_keys.append(d["id"])
        return d

    def _invoice_payload(self):
        # Minimal payload; backend may need real fields - we only assert auth layer
        # so 401/403 vs >= 200 / 4xx-business-error is what matters.
        return {
            "invoice_no": f"TEST-API-{secrets.token_hex(3).upper()}",
            "invoice_date": "2026-01-15",
            "items": [],
            "totals": {"grand_total": 0},
        }

    def test_create_invoice_with_x_api_key(self, keypair):
        r = requests.post(
            f"{BASE_URL}/api/accounts/{ACCOUNT_ID}/invoices",
            json=self._invoice_payload(),
            headers={"X-API-Key": keypair["key"]},
            timeout=20,
        )
        # Auth layer must pass: should NOT be 401/403
        assert r.status_code not in (401, 403), f"API key auth failed: {r.status_code} {r.text}"

    def test_update_invoice_with_bearer_ak(self, keypair):
        # PUT - we just confirm the auth layer accepts it (not 401/403).
        # Use a non-existent invoice_no; a 404 from business layer is acceptable evidence auth passed.
        r = requests.put(
            f"{BASE_URL}/api/accounts/{ACCOUNT_ID}/invoices/NONEXISTENT-{secrets.token_hex(3)}",
            json=self._invoice_payload(),
            headers={"Authorization": f"Bearer {keypair['key']}"},
            timeout=20,
        )
        assert r.status_code not in (401, 403), f"Bearer ak_ auth failed: {r.status_code} {r.text}"

    def test_forbidden_endpoint_returns_403(self, restricted_key):
        r = requests.post(
            f"{BASE_URL}/api/accounts/{ACCOUNT_ID}/invoices",
            json=self._invoice_payload(),
            headers={"X-API-Key": restricted_key["key"]},
            timeout=15,
        )
        assert r.status_code == 403, r.text
        assert "permission" in r.text.lower()

    def test_inactive_key_returns_401(self, admin_session, created_keys):
        r = admin_session.post(
            f"{BASE_URL}/api/api-keys",
            json={"name": _unique("inact"), "allowed_endpoint_ids": ["create_account_invoice"]},
        )
        assert r.status_code == 200
        d = r.json()
        created_keys.append(d["id"])
        # Deactivate
        r2 = admin_session.put(f"{BASE_URL}/api/api-keys/{d['id']}", json={"is_active": False})
        assert r2.status_code == 200
        # Attempt
        r3 = requests.post(
            f"{BASE_URL}/api/accounts/{ACCOUNT_ID}/invoices",
            json=self._invoice_payload(),
            headers={"X-API-Key": d["key"]},
            timeout=15,
        )
        assert r3.status_code == 401, r3.text

    def test_random_invalid_key_returns_401(self):
        bogus = "ak_live_" + secrets.token_hex(24)
        r = requests.post(
            f"{BASE_URL}/api/accounts/{ACCOUNT_ID}/invoices",
            json={"invoice_no": "X"},
            headers={"X-API-Key": bogus},
            timeout=15,
        )
        assert r.status_code == 401, r.text

    def test_no_auth_returns_401(self):
        r = requests.post(
            f"{BASE_URL}/api/accounts/{ACCOUNT_ID}/invoices",
            json={"invoice_no": "X"},
            timeout=15,
        )
        assert r.status_code == 401, r.text


# ============== JWT Regression on external endpoints ==============

class TestJwtRegression:
    def test_jwt_can_call_create_invoice(self, admin_session):
        r = admin_session.post(
            f"{BASE_URL}/api/accounts/{ACCOUNT_ID}/invoices",
            json={
                "invoice_no": f"TEST-JWT-{secrets.token_hex(3).upper()}",
                "invoice_date": "2026-01-15",
                "items": [],
                "totals": {"grand_total": 0},
            },
            timeout=20,
        )
        # must not be 401/403 (auth must accept session token)
        assert r.status_code not in (401, 403), f"JWT regression broke: {r.status_code} {r.text}"

    def test_revoked_key_then_401(self, admin_session, created_keys):
        r = admin_session.post(
            f"{BASE_URL}/api/api-keys",
            json={"name": _unique("rev"), "allowed_endpoint_ids": ["create_account_invoice"]},
        )
        assert r.status_code == 200
        d = r.json()
        # explicit revoke (do NOT add to cleanup since we're deleting it now)
        rd = admin_session.delete(f"{BASE_URL}/api/api-keys/{d['id']}")
        assert rd.status_code == 200, rd.text
        time.sleep(0.5)
        r2 = requests.post(
            f"{BASE_URL}/api/accounts/{ACCOUNT_ID}/invoices",
            json={"invoice_no": "X"},
            headers={"X-API-Key": d["key"]},
            timeout=15,
        )
        assert r2.status_code == 401, r2.text


# ============== Authorization (RBAC) ==============

class TestRoleProtection:
    def test_non_admin_login_blocked_from_api_keys(self):
        """Try to find any non-admin user via known seeded creds. If we can't get one, skip."""
        # Best-effort: try a known distributor email pattern
        candidates = [
            ("distributor@nylaairwater.earth", "test123"),
            ("user@nylaairwater.earth", "test123"),
        ]
        sess = None
        for email, pwd in candidates:
            r = requests.post(f"{BASE_URL}/api/auth/login", json={"email": email, "password": pwd}, timeout=10)
            if r.status_code == 200:
                body = r.json()
                role = (body.get("user") or {}).get("role", "")
                if role and role not in {"System Admin", "CEO", "Director", "Admin", "admin"}:
                    sess = requests.Session()
                    tok = body.get("token") or body.get("access_token") or body.get("session_token")
                    sess.headers.update({"Authorization": f"Bearer {tok}"})
                    break
        if not sess:
            pytest.skip("No non-admin test user available")
        r = sess.get(f"{BASE_URL}/api/api-keys", timeout=10)
        assert r.status_code == 403
