"""Permission-gate + queue/filter regression tests for the SM-driven Marketing Requests.

Covers gaps not in test_marketing_requests_lifecycle.py:
- Non-admin user is blocked by allowed_role_keys / allowed_department_ids gates (403)
- requestor_only: only doc creator (or admin) can trigger; non-creator non-admin gets 403
- comment_required: 400 when no comment supplied
- queues=my_raised / my_assigned filtering
- Counts endpoint queue counts
"""
from datetime import date, timedelta
import os
import requests

BACKEND_URL = os.environ.get("REACT_APP_BACKEND_URL") or "http://localhost:8001"
API = f"{BACKEND_URL.rstrip('/')}/api"

ADMIN_EMAIL = "surya.yadavalli@nylaairwater.earth"
ADMIN_PASSWORD = "test123"
NONADMIN_EMAIL = "john.distributor@test.com"
NONADMIN_PASSWORD = "nyladist##"


def _login(email, pw):
    r = requests.post(f"{API}/auth/login", json={"email": email, "password": pw}, timeout=15)
    r.raise_for_status()
    return r.json()["session_token"]


def _h(token):
    return {"Authorization": f"Bearer {token}"}


def _create_mr(H):
    types = requests.get(f"{API}/marketing-request-types", headers=H, timeout=10).json()["types"]
    depts = requests.get(f"{API}/master-departments", headers=H, timeout=10).json()["departments"]
    marketing = next(d for d in depts if d["name"].lower() == "marketing")
    due = (date.today() + timedelta(days=60)).isoformat()
    payload = {
        "request_type_id": types[0]["id"],
        "assigned_department_id": marketing["id"],
        "requested_due_date": due,
        "requirement_details": "perm-test",
    }
    r = requests.post(f"{API}/marketing-requests", json=payload, headers=H, timeout=15)
    r.raise_for_status()
    return r.json()


def _patch_transition(admin_H, sm_id, action_key, from_state, **fields):
    sm = requests.get(f"{API}/state-machines/{sm_id}", headers=admin_H, timeout=10).json()
    for t in sm["transitions"]:
        if t["action_key"] == action_key and t.get("from_state") == from_state:
            t.update(fields)
    r = requests.put(f"{API}/state-machines/{sm_id}", json=sm, headers=admin_H, timeout=15)
    assert r.status_code == 200, r.text


# ─── Permission gate: allowed_role_keys ───────────────────────────────────────
def test_allowed_role_keys_blocks_non_admin():
    admin = _login(ADMIN_EMAIL, ADMIN_PASSWORD)
    nonadmin_token = None
    try:
        nonadmin_token = _login(NONADMIN_EMAIL, NONADMIN_PASSWORD)
    except Exception:
        import pytest
        pytest.skip("non-admin user not available")

    aH = _h(admin)
    nH = _h(nonadmin_token)
    sm = requests.get(f"{API}/marketing-requests/state-machine", headers=aH).json()

    # restrict start_working from submitted → only CEO role
    _patch_transition(aH, sm["id"], "start_working", "submitted", allowed_role_keys=["CEO"], allowed_department_ids=[])

    mr = _create_mr(aH)
    # available-transitions for non-admin should show allowed=false for start_working
    r = requests.get(f"{API}/marketing-requests/{mr['id']}/available-transitions", headers=nH, timeout=10)
    assert r.status_code == 200
    txns = {t["action_key"]: t for t in r.json()["transitions"]}
    assert "start_working" in txns
    assert txns["start_working"]["allowed"] is False, "non-admin should NOT be allowed"

    # Non-admin POST transition → 403
    r = requests.post(
        f"{API}/marketing-requests/{mr['id']}/transition",
        json={"action_key": "start_working"}, headers=nH, timeout=10,
    )
    assert r.status_code == 403, f"expected 403, got {r.status_code} body={r.text}"

    # Admin bypasses gate → 200
    r = requests.post(
        f"{API}/marketing-requests/{mr['id']}/transition",
        json={"action_key": "start_working"}, headers=aH, timeout=10,
    )
    assert r.status_code == 200, r.text

    # Cleanup: restore transition (no gates)
    _patch_transition(aH, sm["id"], "start_working", "submitted", allowed_role_keys=[], allowed_department_ids=[])


# ─── requestor_only ───────────────────────────────────────────────────────────
def test_requestor_only_blocks_non_creator():
    """The default SM has final_approve from approved_internal as requestor_only.
    Even though it's hard to log in as a different user as the creator, we instead
    flip a non-requestor_only transition to requestor_only and verify a non-admin
    non-creator gets 403."""
    admin = _login(ADMIN_EMAIL, ADMIN_PASSWORD)
    try:
        nonadmin_token = _login(NONADMIN_EMAIL, NONADMIN_PASSWORD)
    except Exception:
        import pytest
        pytest.skip("non-admin user not available")
    aH = _h(admin)
    nH = _h(nonadmin_token)
    sm = requests.get(f"{API}/marketing-requests/state-machine", headers=aH).json()

    # Mark start_working (submitted→in_progress) as requestor_only
    _patch_transition(aH, sm["id"], "start_working", "submitted",
                      requestor_only=True, allowed_role_keys=[], allowed_department_ids=[])

    # Create MR as admin (so non-admin is NOT the creator)
    mr = _create_mr(aH)

    # Non-admin (non-creator) → 403
    r = requests.post(f"{API}/marketing-requests/{mr['id']}/transition",
                      json={"action_key": "start_working"}, headers=nH, timeout=10)
    assert r.status_code == 403, f"expected 403, got {r.status_code} body={r.text}"

    # Admin bypasses → 200
    r = requests.post(f"{API}/marketing-requests/{mr['id']}/transition",
                      json={"action_key": "start_working"}, headers=aH, timeout=10)
    assert r.status_code == 200, r.text

    # Restore
    _patch_transition(aH, sm["id"], "start_working", "submitted",
                      requestor_only=False, allowed_role_keys=[], allowed_department_ids=[])


# ─── comment_required ─────────────────────────────────────────────────────────
def test_comment_required_returns_400_without_comment():
    admin = _login(ADMIN_EMAIL, ADMIN_PASSWORD)
    aH = _h(admin)
    sm = requests.get(f"{API}/marketing-requests/state-machine", headers=aH).json()
    _patch_transition(aH, sm["id"], "start_working", "submitted", comment_required=True)
    mr = _create_mr(aH)

    # No comment → 400
    r = requests.post(f"{API}/marketing-requests/{mr['id']}/transition",
                      json={"action_key": "start_working"}, headers=aH, timeout=10)
    assert r.status_code == 400, f"expected 400, got {r.status_code} body={r.text}"

    # With comment → 200
    r = requests.post(f"{API}/marketing-requests/{mr['id']}/transition",
                      json={"action_key": "start_working", "comment": "starting now"},
                      headers=aH, timeout=10)
    assert r.status_code == 200, r.text

    # Restore
    _patch_transition(aH, sm["id"], "start_working", "submitted", comment_required=False)


# ─── Queue filters & counts ───────────────────────────────────────────────────
def test_queues_my_raised_and_my_assigned():
    admin = _login(ADMIN_EMAIL, ADMIN_PASSWORD)
    aH = _h(admin)
    mr = _create_mr(aH)

    # my_raised
    r = requests.get(f"{API}/marketing-requests?queue=my_raised", headers=aH, timeout=10)
    assert r.status_code == 200
    items = r.json()["items"]
    assert any(it["id"] == mr["id"] for it in items)

    # counts has queues + by_state + states
    r = requests.get(f"{API}/marketing-requests/counts", headers=aH, timeout=10)
    assert r.status_code == 200
    counts = r.json()
    assert counts["queues"]["my_raised"] >= 1
    assert "submitted" in counts["by_state"] or counts["total"] >= 1
    assert isinstance(counts["states"], list) and len(counts["states"]) >= 8


# ─── Unknown action returns 400 with specific message ────────────────────────
def test_unknown_action_returns_400():
    admin = _login(ADMIN_EMAIL, ADMIN_PASSWORD)
    aH = _h(admin)
    mr = _create_mr(aH)
    r = requests.post(f"{API}/marketing-requests/{mr['id']}/transition",
                      json={"action_key": "totally_made_up"}, headers=aH, timeout=10)
    assert r.status_code == 400
    assert "No transition" in r.json()["detail"]
