"""Tests for the new per-SM Actions[] feature.

Covers:
- GET /api/state-machines/ returns SMs with actions[]; legacy SMs auto-migrate.
- POST validation: dup keys, invalid kind, transition referencing unknown action_key.
- POST auto-derivation: empty actions[] is derived from transitions[].
- PUT partial updates and rename propagation rules.
- GET /api/state-machines/actions/catalog returns the 16-item ACTION_CATALOG.
"""
import os
import uuid
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


_BASE_STATES = [
    {"key": "open", "label": "Open", "is_initial": True, "is_terminal": False},
    {"key": "closed", "label": "Closed", "is_initial": False, "is_terminal": True},
]


# ── Catalog endpoint ───────────────────────────────────────────────────────
def test_actions_catalog():
    H = _h(_login())
    r = requests.get(f"{API}/state-machines/actions/catalog", headers=H, timeout=10)
    assert r.status_code == 200, r.text
    actions = r.json()["actions"]
    assert len(actions) == 16, f"Expected 16 actions in catalog, got {len(actions)}"
    keys = {a["key"] for a in actions}
    assert "approve" in keys and "close" in keys and "custom" in keys


# ── GET list includes actions[] and migrates legacy ────────────────────────
def test_list_returns_actions_and_migrates_legacy():
    H = _h(_login())
    r = requests.get(f"{API}/state-machines/", headers=H, timeout=15)
    assert r.status_code == 200, r.text
    sms = r.json()
    assert len(sms) >= 1
    for sm in sms:
        assert "actions" in sm, f"SM {sm.get('name')} missing actions[]"
        assert isinstance(sm["actions"], list)
        # Every action_key in transitions must exist in actions[]
        action_keys = {a["key"] for a in sm["actions"]}
        for t in sm.get("transitions", []):
            assert t["action_key"] in action_keys, (
                f"SM {sm.get('name')}: transition references {t['action_key']} not in actions[]"
            )
    # Find the default Marketing Request Lifecycle
    mr_sm = next((s for s in sms if "Marketing Request" in s.get("name", "")), None)
    assert mr_sm is not None, "Default Marketing Request SM not found"
    assert len(mr_sm["actions"]) == 9, f"Default MR SM should have 9 actions, got {len(mr_sm['actions'])}"
    assert len(mr_sm["transitions"]) == 12, f"Default MR SM should have 12 transitions, got {len(mr_sm['transitions'])}"
    expected_keys = {
        "start_working", "request_changes", "resume", "send_for_review",
        "approve", "submit_for_final_approval", "final_approve", "close", "reopen",
    }
    actual_keys = {a["key"] for a in mr_sm["actions"]}
    assert expected_keys == actual_keys, f"MR action keys mismatch. Got: {actual_keys}"

    # Verify Legacy SM (without actions[] in DB) was auto-migrated
    legacy = next((s for s in sms if "Legacy" in s.get("name", "")), None)
    if legacy:
        assert isinstance(legacy["actions"], list)
        # Each transition's action_key should be present
        keys_in_actions = {a["key"] for a in legacy["actions"]}
        for t in legacy["transitions"]:
            assert t["action_key"] in keys_in_actions
        # kind hints applied
        for a in legacy["actions"]:
            assert a["kind"] in ("positive", "neutral", "negative")


# ── GET single also migrates ───────────────────────────────────────────────
def test_get_single_migrates_actions():
    H = _h(_login())
    sms = requests.get(f"{API}/state-machines/", headers=H, timeout=10).json()
    if not sms:
        return
    target_id = sms[0]["id"]
    r = requests.get(f"{API}/state-machines/{target_id}", headers=H, timeout=10)
    assert r.status_code == 200
    sm = r.json()
    assert "actions" in sm and isinstance(sm["actions"], list)


# ── POST happy path ────────────────────────────────────────────────────────
def _make_sm_payload(suffix):
    return {
        "name": f"TEST_sm_{suffix}",
        "description": "test",
        "states": _BASE_STATES,
        "actions": [
            {"key": "close_it", "label": "Close It", "kind": "positive", "description": "close"},
        ],
        "transitions": [
            {"action_key": "close_it", "action_label": "Close It", "from_state": "open", "to_state": "closed"},
        ],
        "applied_to": [],
    }


def test_post_create_with_actions():
    H = _h(_login())
    payload = _make_sm_payload(uuid.uuid4().hex[:8])
    r = requests.post(f"{API}/state-machines/", json=payload, headers=H, timeout=10)
    assert r.status_code == 200, r.text
    sm = r.json()
    assert len(sm["actions"]) == 1 and sm["actions"][0]["key"] == "close_it"
    assert sm["actions"][0]["kind"] == "positive"
    # cleanup
    requests.delete(f"{API}/state-machines/{sm['id']}", headers=H, timeout=10)


def test_post_rejects_transition_referencing_unknown_action():
    H = _h(_login())
    payload = _make_sm_payload(uuid.uuid4().hex[:8])
    payload["transitions"][0]["action_key"] = "nonexistent_action"
    r = requests.post(f"{API}/state-machines/", json=payload, headers=H, timeout=10)
    assert r.status_code == 400, r.text
    assert "not defined in this workflow" in r.json()["detail"].lower()


def test_post_rejects_duplicate_action_keys():
    H = _h(_login())
    payload = _make_sm_payload(uuid.uuid4().hex[:8])
    payload["actions"].append({"key": "close_it", "label": "Dup", "kind": "neutral"})
    r = requests.post(f"{API}/state-machines/", json=payload, headers=H, timeout=10)
    assert r.status_code == 400, r.text
    assert "duplicate" in r.json()["detail"].lower()


def test_post_rejects_invalid_kind():
    H = _h(_login())
    payload = _make_sm_payload(uuid.uuid4().hex[:8])
    payload["actions"][0]["kind"] = "bogus"
    r = requests.post(f"{API}/state-machines/", json=payload, headers=H, timeout=10)
    assert r.status_code == 400, r.text
    assert "positive" in r.json()["detail"].lower() or "kind" in r.json()["detail"].lower()


def test_post_auto_derives_actions_when_empty():
    H = _h(_login())
    payload = _make_sm_payload(uuid.uuid4().hex[:8])
    # Wipe actions, keep transitions referencing a catalog key
    payload["actions"] = []
    payload["transitions"] = [
        {"action_key": "approve", "from_state": "open", "to_state": "closed"},
    ]
    r = requests.post(f"{API}/state-machines/", json=payload, headers=H, timeout=10)
    assert r.status_code == 200, r.text
    sm = r.json()
    assert len(sm["actions"]) == 1
    assert sm["actions"][0]["key"] == "approve"
    assert sm["actions"][0]["kind"] == "positive"
    requests.delete(f"{API}/state-machines/{sm['id']}", headers=H, timeout=10)


# ── PUT updates ───────────────────────────────────────────────────────────
def test_put_partial_update_actions():
    H = _h(_login())
    payload = _make_sm_payload(uuid.uuid4().hex[:8])
    sm = requests.post(f"{API}/state-machines/", json=payload, headers=H, timeout=10).json()
    sm_id = sm["id"]

    # Rename action key and propagate into transitions in same PUT
    update_payload = {
        "actions": [{"key": "wrap_up", "label": "Wrap Up", "kind": "positive", "description": "renamed"}],
        "transitions": [{"action_key": "wrap_up", "action_label": "Wrap Up", "from_state": "open", "to_state": "closed"}],
    }
    r = requests.put(f"{API}/state-machines/{sm_id}", json=update_payload, headers=H, timeout=10)
    assert r.status_code == 200, r.text
    updated = r.json()
    assert updated["actions"][0]["key"] == "wrap_up"
    assert updated["transitions"][0]["action_key"] == "wrap_up"

    # Verify GET persistence
    r2 = requests.get(f"{API}/state-machines/{sm_id}", headers=H, timeout=10)
    assert r2.json()["actions"][0]["key"] == "wrap_up"

    requests.delete(f"{API}/state-machines/{sm_id}", headers=H, timeout=10)


def test_put_rejects_rename_when_transition_still_uses_old_key():
    H = _h(_login())
    payload = _make_sm_payload(uuid.uuid4().hex[:8])
    sm = requests.post(f"{API}/state-machines/", json=payload, headers=H, timeout=10).json()
    sm_id = sm["id"]

    bad_update = {
        "actions": [{"key": "wrap_up", "label": "Wrap Up", "kind": "positive"}],
        "transitions": [{"action_key": "close_it", "from_state": "open", "to_state": "closed"}],
    }
    r = requests.put(f"{API}/state-machines/{sm_id}", json=bad_update, headers=H, timeout=10)
    assert r.status_code == 400, r.text
    assert "not defined" in r.json()["detail"].lower()

    requests.delete(f"{API}/state-machines/{sm_id}", headers=H, timeout=10)
