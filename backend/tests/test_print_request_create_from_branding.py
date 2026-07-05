"""Backend tests for the new "Create Print Request from Customer Branding" wiring.

Focus (new behavior added in this iteration):
 - Persist total_monthly_volume, starting_monthly_volume, initial_order_quantity,
   requested_due_date, notes on POST /api/print-requests
 - Reject creation for a design request NOT in a Final Approved state (400)
 - Reject when initial_order_quantity <= 0 (400)
 - Reject when requested_due_date is not a valid ISO date (400)

Skips gracefully if no seeded Marketing Request in a Final Approved state exists,
falling back to design_requests_new lookup as well.
"""
import os
import uuid
from pathlib import Path

import pytest
import requests


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
FINAL_APPROVED_STATES = {"final_approved", "production_in_progress", "production_completed"}


# ── fixtures ──
@pytest.fixture(scope="module")
def token():
    r = requests.post(
        f"{BASE_URL}/api/auth/login",
        json={"email": ADMIN_EMAIL, "password": ADMIN_PASSWORD},
        timeout=20,
    )
    assert r.status_code == 200, r.text
    tk = r.json().get("session_token")
    assert tk
    return tk


@pytest.fixture(scope="module")
def client(token):
    s = requests.Session()
    s.headers.update({
        "Authorization": f"Bearer {token}",
        "Content-Type": "application/json",
    })
    return s


def _scan_design_requests_new(client):
    """Iterate design_requests_new and return one whose current_state_key is
    in FINAL_APPROVED_STATES."""
    for page in range(1, 15):
        r = client.get(
            f"{BASE_URL}/api/design-requests-new",
            params={"limit": 50, "page": page},
            timeout=25,
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
        if isinstance(body, dict):
            pages = body.get("pages") or 1
            if page >= pages:
                break
    return None


def _scan_marketing_requests(client):
    for page in range(1, 8):
        r = client.get(
            f"{BASE_URL}/api/marketing-requests",
            params={"limit": 50, "page": page},
            timeout=25,
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
        if isinstance(body, dict):
            pages = body.get("pages") or 1
            if page >= pages:
                break
    return None


@pytest.fixture(scope="module")
def final_approved_mr(client):
    mr = _scan_design_requests_new(client) or _scan_marketing_requests(client)
    if not mr:
        pytest.skip("No Marketing/Design Request in a Final Approved state available")
    return mr


@pytest.fixture(scope="module")
def non_final_mr(client):
    # Find any design/marketing request whose state is NOT final-approved-ish
    for page in range(1, 15):
        r = client.get(
            f"{BASE_URL}/api/design-requests-new",
            params={"limit": 50, "page": page},
            timeout=25,
        )
        if r.status_code != 200:
            break
        body = r.json()
        items = body.get("items") if isinstance(body, dict) else body
        if not items:
            break
        for mr in items:
            if mr.get("current_state_key") and mr["current_state_key"] not in FINAL_APPROVED_STATES:
                return mr
        if isinstance(body, dict):
            pages = body.get("pages") or 1
            if page >= pages:
                break
    pytest.skip("No non-final-approved Marketing/Design Request available")


# ── Tests ──
class TestCreatePrintRequestFromBranding:
    created_ids = []

    def test_success_persists_all_fields(self, client, final_approved_mr):
        payload = {
            "marketing_request_id": final_approved_mr["id"],
            "initial_order_quantity": 120,
            "quantity": 120,
            "total_monthly_volume": 5000,
            "starting_monthly_volume": 1200,
            "requested_due_date": "2026-05-20",
            "notes": "TEST_branding_flow",
        }
        r = client.post(f"{BASE_URL}/api/print-requests", json=payload, timeout=30)
        assert r.status_code in (200, 201), f"{r.status_code} {r.text}"
        body = r.json()
        assert body.get("print_number", "").startswith("PR-")
        assert body["initial_order_quantity"] == 120
        assert body["quantity"] == 120
        assert body["total_monthly_volume"] == 5000
        assert body["starting_monthly_volume"] == 1200
        assert body["requested_due_date"] == "2026-05-20"
        assert body["notes"] == "TEST_branding_flow"
        assert body["source_marketing_request_id"] == final_approved_mr["id"]
        # Track for cleanup + persistence verification
        TestCreatePrintRequestFromBranding.created_ids.append(body["id"])

        # GET to verify persistence
        g = client.get(f"{BASE_URL}/api/print-requests/{body['id']}", timeout=20)
        assert g.status_code == 200, g.text
        gb = g.json()
        assert gb["total_monthly_volume"] == 5000
        assert gb["starting_monthly_volume"] == 1200
        assert gb["initial_order_quantity"] == 120
        assert gb["requested_due_date"] == "2026-05-20"
        assert gb["notes"] == "TEST_branding_flow"

    def test_reject_non_final_approved_state(self, client, non_final_mr):
        payload = {
            "marketing_request_id": non_final_mr["id"],
            "initial_order_quantity": 10,
            "quantity": 10,
            "requested_due_date": "2026-05-25",
        }
        r = client.post(f"{BASE_URL}/api/print-requests", json=payload, timeout=25)
        assert r.status_code == 400, f"Expected 400, got {r.status_code}: {r.text}"
        detail = (r.json().get("detail") or "").lower()
        assert "final approved" in detail, f"Unexpected error message: {detail}"

    def test_reject_zero_or_negative_qty(self, client, final_approved_mr):
        # 0
        payload = {
            "marketing_request_id": final_approved_mr["id"],
            "initial_order_quantity": 0,
            "quantity": 0,
            "requested_due_date": "2026-05-20",
        }
        r = client.post(f"{BASE_URL}/api/print-requests", json=payload, timeout=25)
        assert r.status_code == 400, r.text
        assert "quantity" in (r.json().get("detail") or "").lower()

        # -5
        payload["initial_order_quantity"] = -5
        payload["quantity"] = -5
        r = client.post(f"{BASE_URL}/api/print-requests", json=payload, timeout=25)
        assert r.status_code == 400, r.text

    def test_reject_invalid_due_date(self, client, final_approved_mr):
        payload = {
            "marketing_request_id": final_approved_mr["id"],
            "initial_order_quantity": 5,
            "quantity": 5,
            "requested_due_date": "not-a-date",
        }
        r = client.post(f"{BASE_URL}/api/print-requests", json=payload, timeout=25)
        assert r.status_code == 400, r.text
        assert "iso" in (r.json().get("detail") or "").lower() or "yyyy" in (r.json().get("detail") or "").lower()

    def test_lead_bottle_designs_returns_current_volume(self, client, final_approved_mr):
        """The dialog uses current_volume from GET /api/leads/{lead_id}/bottle-designs
        to prefill Total Monthly Volume."""
        lead_id = final_approved_mr.get("lead_id")
        if not lead_id:
            pytest.skip("Final approved MR has no lead_id")
        r = client.get(f"{BASE_URL}/api/leads/{lead_id}/bottle-designs", timeout=20)
        assert r.status_code == 200, r.text
        body = r.json()
        # keys should be present (values may be null)
        assert "current_volume" in body
        assert "lead_uuid" in body

    def test_cleanup(self, client):
        for pid in TestCreatePrintRequestFromBranding.created_ids:
            try:
                client.delete(f"{BASE_URL}/api/print-requests/{pid}", timeout=20)
            except Exception:
                pass
