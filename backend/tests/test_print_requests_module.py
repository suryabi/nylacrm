"""Backend tests for the new Print Requests module.

Covers:
  - Print Vendors CRUD (/api/print-vendors)
  - Print Statuses GET/POST/PATCH (/api/print-request-statuses)
  - Print Requests lifecycle: create from final-approved Marketing Request
    (or skip create test gracefully when none exists) → GET → PATCH → status
    change → DELETE permission check.
"""
import os
import uuid
import pytest
import requests
from pathlib import Path


def _load_frontend_env():
    env_path = Path("/app/frontend/.env")
    if env_path.exists():
        for line in env_path.read_text().splitlines():
            if line.startswith("REACT_APP_BACKEND_URL="):
                return line.split("=", 1)[1].strip()
    return None


BASE_URL = (os.environ.get("REACT_APP_BACKEND_URL") or _load_frontend_env() or "").rstrip("/")
assert BASE_URL, "REACT_APP_BACKEND_URL not configured"

ADMIN_EMAIL = "surya.yadavalli@nylaairwater.earth"
ADMIN_PASSWORD = "test123"


# ─────────────────────── fixtures ───────────────────────
@pytest.fixture(scope="module")
def admin_token():
    r = requests.post(
        f"{BASE_URL}/api/auth/login",
        json={"email": ADMIN_EMAIL, "password": ADMIN_PASSWORD},
        timeout=20,
    )
    assert r.status_code == 200, f"Login failed: {r.status_code} {r.text}"
    data = r.json()
    token = data.get("session_token")
    assert token, "session_token missing"
    return token


@pytest.fixture(scope="module")
def client(admin_token):
    s = requests.Session()
    s.headers.update({
        "Authorization": f"Bearer {admin_token}",
        "Content-Type": "application/json",
    })
    return s


# ─────────────────────── Print Statuses ───────────────────────
class TestPrintStatuses:
    def test_list_seeds_defaults(self, client):
        r = client.get(f"{BASE_URL}/api/print-request-statuses", timeout=20)
        assert r.status_code == 200, r.text
        data = r.json()
        assert "statuses" in data and isinstance(data["statuses"], list)
        # Defaults seeded on first GET
        names = {s["name"] for s in data["statuses"]}
        assert {"New", "In Printing", "Printed"}.issubset(names), names

    def test_create_update_status(self, client):
        unique_name = f"TEST_QUEUED_{uuid.uuid4().hex[:6]}"
        r = client.post(
            f"{BASE_URL}/api/print-request-statuses",
            json={
                "name": unique_name,
                "color": "#94a3b8",
                "order": 99,
                "is_initial": False,
                "is_terminal": False,
                "is_active": True,
            },
            timeout=20,
        )
        assert r.status_code == 200, r.text
        created = r.json()
        assert created["name"] == unique_name
        assert created["color"] == "#94a3b8"
        sid = created["id"]

        # Verify persistence
        lst = client.get(f"{BASE_URL}/api/print-request-statuses", timeout=20).json()
        assert any(s["id"] == sid for s in lst["statuses"])

        # PATCH
        r2 = client.patch(
            f"{BASE_URL}/api/print-request-statuses/{sid}",
            json={"color": "#000000"},
            timeout=20,
        )
        assert r2.status_code == 200, r2.text
        assert r2.json()["color"] == "#000000"

        # DELETE (non-default → allowed)
        r3 = client.delete(f"{BASE_URL}/api/print-request-statuses/{sid}", timeout=20)
        assert r3.status_code == 200, r3.text

    def test_cannot_delete_seeded_default(self, client):
        lst = client.get(f"{BASE_URL}/api/print-request-statuses", timeout=20).json()
        default = next((s for s in lst["statuses"] if s.get("is_default")), None)
        if not default:
            pytest.skip("No seeded default status found")
        r = client.delete(
            f"{BASE_URL}/api/print-request-statuses/{default['id']}", timeout=20
        )
        # API returns 400 since seeded defaults must be deactivated, not deleted
        assert r.status_code == 400, r.text


# ─────────────────────── Print Vendors ───────────────────────
class TestPrintVendors:
    created_id = None

    def test_create_vendor(self, client):
        name = f"TEST_Acme_{uuid.uuid4().hex[:6]}"
        r = client.post(
            f"{BASE_URL}/api/print-vendors",
            json={
                "name": name,
                "contact_person": "John",
                "phone": "+91-99999",
                "email": "john@acme.test",
                "is_active": True,
            },
            timeout=20,
        )
        assert r.status_code == 200, r.text
        data = r.json()
        assert data["name"] == name
        assert data["contact_person"] == "John"
        assert data["email"] == "john@acme.test"
        assert "id" in data
        TestPrintVendors.created_id = data["id"]

    def test_list_vendor_persists(self, client):
        assert TestPrintVendors.created_id, "create test must run first"
        r = client.get(f"{BASE_URL}/api/print-vendors", timeout=20)
        assert r.status_code == 200, r.text
        data = r.json()
        assert any(v["id"] == TestPrintVendors.created_id for v in data["vendors"])

    def test_patch_vendor(self, client):
        vid = TestPrintVendors.created_id
        r = client.patch(
            f"{BASE_URL}/api/print-vendors/{vid}",
            json={"contact_person": "Jane"},
            timeout=20,
        )
        assert r.status_code == 200, r.text
        assert r.json()["contact_person"] == "Jane"

    def test_delete_vendor(self, client):
        vid = TestPrintVendors.created_id
        r = client.delete(f"{BASE_URL}/api/print-vendors/{vid}", timeout=20)
        assert r.status_code == 200, r.text
        # Verify gone
        listed = client.get(f"{BASE_URL}/api/print-vendors", timeout=20).json()
        assert all(v["id"] != vid for v in listed["vendors"])


# ─────────────────────── Print Requests lifecycle ───────────────────────
def _find_final_approved_mr(client):
    """Look for a Marketing Request whose current_state_key is final_approved-ish."""
    FINAL_APPROVED_STATES = {"final_approved", "production_in_progress", "production_completed"}
    # marketing-requests list endpoint doesn't support current_state_key filter
    # — scan a couple of pages and filter client-side.
    for page in range(1, 6):
        r = client.get(
            f"{BASE_URL}/api/marketing-requests",
            params={"limit": 50, "page": page},
            timeout=20,
        )
        if r.status_code != 200:
            return None
        body = r.json()
        items = body.get("items") if isinstance(body, dict) else body
        if not items:
            return None
        for mr in items:
            if mr.get("current_state_key") in FINAL_APPROVED_STATES:
                return mr
        if isinstance(body, dict) and page >= body.get("pages", 1):
            break
    return None


class TestPrintRequestsLifecycle:
    created_print_id = None
    created_vendor_id = None

    def test_create_vendor_for_assignment(self, client):
        r = client.post(
            f"{BASE_URL}/api/print-vendors",
            json={"name": f"TEST_VendorPR_{uuid.uuid4().hex[:6]}"},
            timeout=20,
        )
        assert r.status_code == 200, r.text
        TestPrintRequestsLifecycle.created_vendor_id = r.json()["id"]

    def test_create_from_final_approved(self, client):
        mr = _find_final_approved_mr(client)
        if not mr:
            pytest.skip("No final-approved Marketing Request available to seed test")
        payload = {
            "marketing_request_id": mr["id"],
            "quantity": 250,
            "requested_due_date": "2026-03-15",
            "notes": "TEST_print_request",
            "vendor_id": TestPrintRequestsLifecycle.created_vendor_id,
        }
        r = client.post(f"{BASE_URL}/api/print-requests", json=payload, timeout=30)
        assert r.status_code in (200, 201), f"{r.status_code} {r.text}"
        body = r.json()
        assert "print_number" in body and body["print_number"].startswith("PR-")
        assert body["quantity"] == 250
        assert body["requested_due_date"] == "2026-03-15"
        assert body["source_marketing_request_id"] == mr["id"]
        assert body["lead_id"] == mr.get("lead_id")
        assert body["status_id"], "initial status should be auto-assigned"
        assert len(body.get("status_history") or []) >= 1
        TestPrintRequestsLifecycle.created_print_id = body["id"]

    def test_get_print_request(self, client):
        pid = TestPrintRequestsLifecycle.created_print_id
        if not pid:
            pytest.skip("No print request created")
        r = client.get(f"{BASE_URL}/api/print-requests/{pid}", timeout=20)
        assert r.status_code == 200, r.text
        assert r.json()["id"] == pid

    def test_list_print_requests(self, client):
        r = client.get(f"{BASE_URL}/api/print-requests", timeout=20)
        assert r.status_code == 200, r.text
        body = r.json()
        assert "items" in body and isinstance(body["items"], list)

    def test_patch_print_request(self, client):
        pid = TestPrintRequestsLifecycle.created_print_id
        if not pid:
            pytest.skip("No print request created")
        r = client.patch(
            f"{BASE_URL}/api/print-requests/{pid}",
            json={"quantity": 500, "notes": "TEST_updated"},
            timeout=20,
        )
        assert r.status_code == 200, r.text
        body = r.json()
        assert body["quantity"] == 500
        assert body["notes"] == "TEST_updated"

    def test_change_status(self, client):
        pid = TestPrintRequestsLifecycle.created_print_id
        if not pid:
            pytest.skip("No print request created")
        statuses = client.get(
            f"{BASE_URL}/api/print-request-statuses", timeout=20
        ).json()["statuses"]
        current = client.get(f"{BASE_URL}/api/print-requests/{pid}", timeout=20).json()
        # pick a different status
        target = next(
            (s for s in statuses if s["id"] != current.get("status_id")), None
        )
        assert target, "Need another status to change to"
        r = client.patch(
            f"{BASE_URL}/api/print-requests/{pid}/status",
            json={"status_id": target["id"], "note": "TEST_move"},
            timeout=20,
        )
        assert r.status_code == 200, r.text
        body = r.json()
        assert body["status_id"] == target["id"]
        assert body["status_name"] == target["name"]
        assert any(h.get("note") == "TEST_move" for h in body.get("status_history") or [])

    def test_create_validation_errors(self, client):
        # Non-existent marketing request
        r = client.post(
            f"{BASE_URL}/api/print-requests",
            json={
                "marketing_request_id": "non-existent-id",
                "quantity": 10,
                "requested_due_date": "2026-04-01",
            },
            timeout=20,
        )
        assert r.status_code == 404, r.text

    def test_delete_print_request_admin(self, client):
        pid = TestPrintRequestsLifecycle.created_print_id
        if not pid:
            pytest.skip("No print request created")
        r = client.delete(f"{BASE_URL}/api/print-requests/{pid}", timeout=20)
        assert r.status_code == 200, r.text
        # Verify 404
        r2 = client.get(f"{BASE_URL}/api/print-requests/{pid}", timeout=20)
        assert r2.status_code == 404

    def test_cleanup_vendor(self, client):
        vid = TestPrintRequestsLifecycle.created_vendor_id
        if vid:
            client.delete(f"{BASE_URL}/api/print-vendors/{vid}", timeout=20)


# ─────────────────────── Auth guard ───────────────────────
class TestAuthGuard:
    def test_unauthenticated_blocked(self):
        r = requests.get(f"{BASE_URL}/api/print-requests", timeout=20)
        assert r.status_code in (401, 403), r.text

    def test_unauthenticated_vendor_blocked(self):
        r = requests.get(f"{BASE_URL}/api/print-vendors", timeout=20)
        assert r.status_code in (401, 403), r.text
