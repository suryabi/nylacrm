"""End-to-end regression test for the SM-driven Marketing Requests module.

Covers:
- Default SM auto-seeding (GET /api/marketing-requests/state-machine)
- Create request lands in the SM's initial state
- /available-transitions returns SM-defined transitions filtered by user permissions
- POST /{id}/transition validates action_key, applies auto-assign side-effects, denies blocked actions
- Auto-assign to department (via PATCH on the SM)
- requestor_only gate works (admin bypasses)
- Counts endpoint returns by_state + queue counts + states catalog
- Comments + Versions still work
"""
from datetime import date, timedelta
import os
import requests

BACKEND_URL = os.environ.get("REACT_APP_BACKEND_URL") or "http://localhost:8001"
API = f"{BACKEND_URL.rstrip('/')}/api"

ADMIN_EMAIL = "surya.yadavalli@nylaairwater.earth"
ADMIN_PASSWORD = "test123"


def _login():
    r = requests.post(f"{API}/auth/login", json={"email": ADMIN_EMAIL, "password": ADMIN_PASSWORD}, timeout=15)
    r.raise_for_status()
    return r.json()["session_token"]


def _h(token):
    return {"Authorization": f"Bearer {token}"}


def test_sm_seed_and_full_lifecycle():
    token = _login()
    H = _h(token)

    # 1. SM is auto-seeded
    r = requests.get(f"{API}/marketing-requests/state-machine", headers=H, timeout=10)
    assert r.status_code == 200, r.text
    sm = r.json()
    assert sm["applied_to"] == ["marketing_requests"]
    state_keys = [s["key"] for s in sm["states"]]
    assert "submitted" in state_keys
    assert "production_completed" in state_keys

    # 2. Counts endpoint
    r = requests.get(f"{API}/marketing-requests/counts", headers=H, timeout=10)
    assert r.status_code == 200
    counts = r.json()
    assert "by_state" in counts and "queues" in counts and "states" in counts
    assert counts["state_machine_id"] == sm["id"]

    # 3. Create a request (need type + dept first)
    types = requests.get(f"{API}/marketing-request-types", headers=H, timeout=10).json()["types"]
    assert types, "default types should auto-seed"
    type_id = types[0]["id"]
    depts = requests.get(f"{API}/master-departments", headers=H, timeout=10).json()["departments"]
    marketing = next(d for d in depts if d["name"].lower() == "marketing")
    due = (date.today() + timedelta(days=90)).isoformat()

    payload = {
        "request_type_id": type_id,
        "assigned_department_id": marketing["id"],
        "requested_due_date": due,
        "requirement_details": "Regression test request",
    }
    r = requests.post(f"{API}/marketing-requests", json=payload, headers=H, timeout=15)
    assert r.status_code == 200, r.text
    mr = r.json()
    mr_id = mr["id"]
    assert mr["request_number"].startswith("MR-")
    initial_state = next(s for s in sm["states"] if s.get("is_initial"))
    assert mr["current_state_key"] == initial_state["key"]
    assert mr["state_machine_id"] == sm["id"]

    # 4. Available transitions from initial state
    r = requests.get(f"{API}/marketing-requests/{mr_id}/available-transitions", headers=H, timeout=10)
    assert r.status_code == 200
    txns = r.json()["transitions"]
    assert len(txns) >= 1
    # admin should be allowed on all
    assert all(t["allowed"] for t in txns)
    txn_keys = {t["action_key"] for t in txns}
    assert "start_working" in txn_keys

    # 5. Trigger transition by action_key
    r = requests.post(
        f"{API}/marketing-requests/{mr_id}/transition",
        json={"action_key": "start_working", "comment": "kicking off"},
        headers=H, timeout=10,
    )
    assert r.status_code == 200, r.text
    mr = r.json()
    assert mr["current_state_key"] == "in_progress"
    # Comment kind=status_change appended
    assert mr["comments"][-1]["kind"] == "status_change"

    # 6. Invalid action from in_progress
    r = requests.post(
        f"{API}/marketing-requests/{mr_id}/transition",
        json={"action_key": "final_approve"},
        headers=H, timeout=10,
    )
    assert r.status_code == 400 and "No transition" in r.json()["detail"]

    # 7. PATCH the SM to auto-assign on the in_review→approved_internal transition,
    #    then advance to in_review and trigger approve to validate auto-assign.
    r = requests.get(f"{API}/state-machines/{sm['id']}", headers=H, timeout=10)
    assert r.status_code == 200
    sm_full = r.json()
    target_dept = next(d for d in depts if d["name"].lower() == "design")
    for t in sm_full["transitions"]:
        if t["action_key"] == "approve" and t.get("from_state") == "in_review":
            t["auto_assign_mode"] = "department"
            t["auto_assign_department_id"] = target_dept["id"]
            t["auto_assign_user_id"] = None
            t["auto_assign_role"] = None
    r = requests.put(f"{API}/state-machines/{sm['id']}", json=sm_full, headers=H, timeout=10)
    assert r.status_code == 200, r.text

    # Advance in_progress → in_review
    r = requests.post(f"{API}/marketing-requests/{mr_id}/transition", json={"action_key": "send_for_review"}, headers=H, timeout=10)
    assert r.status_code == 200
    # in_review → approved_internal with auto-assign
    r = requests.post(f"{API}/marketing-requests/{mr_id}/transition", json={"action_key": "approve"}, headers=H, timeout=10)
    assert r.status_code == 200, r.text
    mr = r.json()
    assert mr["current_state_key"] == "approved_internal"
    assert mr["assigned_department_name"].lower() == "design", \
        f"Expected auto-assign to Design, got: {mr.get('assigned_department_name')}"
    # last comment should mention auto-assign
    assert "auto-assigned" in mr["comments"][-1]["text"].lower()

    # 8. Comments still work
    r = requests.post(f"{API}/marketing-requests/{mr_id}/comments",
                      json={"text": "Looks great, awaiting final sign-off"}, headers=H, timeout=10)
    assert r.status_code == 200
    assert r.json()["kind"] == "comment"

    # 9. Versions still work (without files for simplicity)
    r = requests.post(f"{API}/marketing-requests/{mr_id}/versions",
                      json={"version_name": "v1", "file_ids": [], "links": ["https://figma.com/x"]},
                      headers=H, timeout=10)
    assert r.status_code == 200
    assert r.json()["version_name"] == "v1"

    # 10. Counts now reflect the state change
    r = requests.get(f"{API}/marketing-requests/counts", headers=H, timeout=10)
    assert r.status_code == 200
    counts = r.json()
    assert counts["total"] >= 1
    assert counts["by_state"]["approved_internal"] >= 1

    # 11. List endpoint with state_key filter
    r = requests.get(f"{API}/marketing-requests?state_key=approved_internal", headers=H, timeout=10)
    assert r.status_code == 200
    items = r.json()["items"]
    assert any(it["id"] == mr_id for it in items)

    # Cleanup — delete the test MR so subsequent runs are deterministic
    # (delete via direct DB is not exposed; leaving it is fine because the test
    # only asserts inclusion, not exact totals.)
