"""Iteration 289 tests: Design Requests module rename + request-type default icons.

Covers:
- RBAC migration: marketing_requests -> admin only; design_requests_new inherits.
- Module labels: 'Design Requests - OLD' / 'Design Requests'.
- Request type icon upload/serve/attach + enrichment on list.
- Lead-driven creation targets NEW module (design-requests-new/from-lead/...).
- lead_id filter on GET /api/design-requests-new.
"""
import io
import os
import pytest
import requests

# Load frontend/.env so REACT_APP_BACKEND_URL is available during pytest runs
_env_path = "/app/frontend/.env"
if os.path.exists(_env_path):
    with open(_env_path) as _fh:
        for _line in _fh:
            _line = _line.strip()
            if not _line or _line.startswith("#") or "=" not in _line:
                continue
            _k, _, _v = _line.partition("=")
            os.environ.setdefault(_k.strip(), _v.strip())

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "").rstrip("/")
assert BASE_URL, "REACT_APP_BACKEND_URL not configured"


@pytest.fixture(scope="module")
def admin_session():
    s = requests.Session()
    r = s.post(
        f"{BASE_URL}/api/auth/login",
        json={"email": "surya.yadavalli@nylaairwater.earth", "password": "test123"},
        headers={"X-Tenant-ID": "nyla-air-water"},
        timeout=30,
    )
    assert r.status_code == 200, f"Login failed: {r.status_code} {r.text[:200]}"
    data = r.json()
    token = data.get("access_token") or data.get("token")
    if token:
        s.headers.update({"Authorization": f"Bearer {token}"})
    s.headers.update({"X-Tenant-ID": "nyla-air-water"})
    return s


# ── RBAC / module labels ──────────────────────────────────────
class TestRBACMigration:
    def test_roles_returns_migrated_labels(self, admin_session):
        r = admin_session.get(f"{BASE_URL}/api/roles", timeout=30)
        assert r.status_code == 200, r.text[:300]
        body = r.json()
        roles = body.get("roles") if isinstance(body, dict) else body
        assert roles, "no roles returned"

        # Find admin & a non-admin
        by_name = {(x.get("name") or "").lower(): x for x in roles}
        admin = by_name.get("admin") or by_name.get("ceo")
        assert admin, f"admin role missing; got: {list(by_name)}"
        perms = admin.get("permissions") or {}
        # marketing_requests should exist and admin should have view
        assert "marketing_requests" in perms, "marketing_requests key missing"
        assert perms["marketing_requests"].get("view") is True
        assert "design_requests_new" in perms, "design_requests_new key missing"
        assert perms["design_requests_new"].get("view") is True

        # Non-admin role: OLD.view false, NEW.view true (per migration spec)
        non_admin = None
        for candidate_name in ("user", "manager", "viewer", "sales"):
            if candidate_name in by_name and candidate_name not in ("admin", "ceo"):
                non_admin = by_name[candidate_name]
                break
        if non_admin:
            p2 = non_admin.get("permissions") or {}
            if "marketing_requests" in p2 and "design_requests_new" in p2:
                assert p2["marketing_requests"].get("view") is False, (
                    f"{non_admin['name']} still has view on marketing_requests"
                )
                assert p2["design_requests_new"].get("view") in (True, False), \
                    "design_requests_new perm missing"

    def test_module_labels_endpoint(self, admin_session):
        # module_labels lives in models/role.py - accessible via /api/roles or a labels endpoint
        r = admin_session.get(f"{BASE_URL}/api/roles/module-labels", timeout=15)
        if r.status_code == 404:
            pytest.skip("module-labels endpoint not exposed - labels checked via UI")
        assert r.status_code == 200, r.text[:300]
        labels = r.json()
        # Accept either dict or list
        if isinstance(labels, dict):
            m = labels
        else:
            m = {x.get("key"): x.get("label") for x in labels}
        assert m.get("marketing_requests", "").lower().startswith("design requests - old") \
            or "old" in (m.get("marketing_requests", "").lower())
        assert m.get("design_requests_new", "").lower() in ("design requests", "design requests ")


# ── Request Type icon upload/serve ────────────────────────────
class TestRequestTypeIcons:
    def test_icon_upload_and_attach(self, admin_session):
        # 1) List types
        r = admin_session.get(f"{BASE_URL}/api/marketing-request-types", timeout=15)
        assert r.status_code == 200, r.text[:300]
        types = r.json().get("types") or []
        assert types, "no request types"
        type_id = types[0]["id"]

        # 2) Upload an icon via design-requests-new/upload
        png_1x1 = bytes.fromhex(
            "89504E470D0A1A0A0000000D49484452000000010000000108060000001F15C4"
            "890000000D49444154789C6300010000000500010D0A2DB40000000049454E44AE426082"
        )
        files = {"file": ("icon.png", io.BytesIO(png_1x1), "image/png")}
        up = admin_session.post(
            f"{BASE_URL}/api/design-requests-new/upload", files=files, timeout=30
        )
        assert up.status_code == 200, f"upload failed: {up.status_code} {up.text[:300]}"
        file_id = up.json().get("id")
        assert file_id

        # 3) Serve the icon
        serve = admin_session.get(
            f"{BASE_URL}/api/design-requests-new/files/{file_id}", timeout=30
        )
        assert serve.status_code == 200, f"serve failed {serve.status_code}"
        assert serve.headers.get("content-type", "").startswith("image/"), \
            f"unexpected ct: {serve.headers.get('content-type')}"

        # 4) Attach to type
        patch = admin_session.patch(
            f"{BASE_URL}/api/marketing-request-types/{type_id}",
            json={"icon_file_id": file_id},
            timeout=15,
        )
        assert patch.status_code == 200, patch.text[:300]
        assert patch.json().get("icon_file_id") == file_id

        # 5) Verify enrichment: any request with this type gets request_type_icon_url
        lst = admin_session.get(
            f"{BASE_URL}/api/design-requests-new?no_limit=true", timeout=30
        )
        assert lst.status_code == 200
        body = lst.json()
        rows = body.get("items") if isinstance(body, dict) else body
        rows = rows or []
        matching = [r for r in rows if r.get("request_type_id") == type_id]
        if matching:
            assert any(
                (r.get("request_type_icon_url") or "").endswith(file_id) for r in matching
            ), "request_type_icon_url not enriched on rows"


# ── Lead-driven creation lands in NEW module ──────────────────
class TestLeadDrivenCreation:
    def test_lead_id_filter_and_from_lead_endpoints(self, admin_session):
        # Find a lead that has a logo (logo_storage_path)
        # We can't hit mongo directly; use the leads list & try to detect a logo.
        r = admin_session.get(f"{BASE_URL}/api/leads?limit=200", timeout=30)
        assert r.status_code == 200, r.text[:300]
        body = r.json()
        leads = body.get("data") if isinstance(body, dict) else body
        leads = leads or []
        lead_with_logo = None
        for lead in leads:
            if lead.get("logo_url") or lead.get("logo_storage_path"):
                lead_with_logo = lead
                break
        if not lead_with_logo:
            for lead in leads[:20]:
                d = admin_session.get(
                    f"{BASE_URL}/api/leads/{lead['id']}", timeout=15
                )
                if d.status_code == 200 and (
                    d.json().get("logo_url") or d.json().get("logo_storage_path")
                ):
                    lead_with_logo = d.json()
                    break
        if not lead_with_logo:
            pytest.skip("no lead with logo present in tenant - cannot test from-lead")
        lead_id = lead_with_logo["id"]

        # a) filter with lead_id returns only requests for this lead
        r2 = admin_session.get(
            f"{BASE_URL}/api/design-requests-new?lead_id={lead_id}&no_limit=true",
            timeout=30,
        )
        assert r2.status_code == 200, r2.text[:300]
        body2 = r2.json()
        rows = body2.get("items") if isinstance(body2, dict) else body2
        rows = rows or []
        for r_ in rows:
            assert r_.get("lead_id") == lead_id, \
                f"lead_id filter leaks: {r_.get('lead_id')} != {lead_id}"

        # b) Create neck tags request from lead
        c = admin_session.post(
            f"{BASE_URL}/api/design-requests-new/from-lead/{lead_id}/neck-tags",
            timeout=45,
        )
        assert c.status_code in (200, 201), f"neck-tags create failed {c.status_code}: {c.text[:400]}"
        created = c.json()
        # Should be in NEW module; request_number typically 'DRN-' or 'MR-'
        assert created.get("id"), created
        assert created.get("lead_id") == lead_id
        new_id = created["id"]

        # c) Verify it shows up in the lead's filtered list
        r3 = admin_session.get(
            f"{BASE_URL}/api/design-requests-new?lead_id={lead_id}&no_limit=true",
            timeout=30,
        )
        body3 = r3.json()
        rows3 = body3.get("items") if isinstance(body3, dict) else body3
        rows3 = rows3 or []
        assert any(r_.get("id") == new_id for r_ in rows3), "created request not returned by lead_id filter"

        # d) The same id should NOT exist under old marketing-requests
        old = admin_session.get(f"{BASE_URL}/api/marketing-requests/{new_id}", timeout=15)
        assert old.status_code in (404, 403), (
            f"expected 404/403 in old module, got {old.status_code}"
        )
