"""Iteration 285 — Guard framework: field catalog + end-to-end enforcement for
Design Requests - New workflow. Restores the state machine to no-guards at teardown.
"""
import os
import copy
import pytest
import requests

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "https://crm-beverage-ops.preview.emergentagent.com").rstrip("/")

CREDS = {"email": "surya.yadavalli@nylaairwater.earth", "password": "test123"}
SM_ID = "2434a384-84aa-4a30-8b1c-576e2205e618"  # Design Requests - New Lifecycle (default)
REQ_ID = "24d674f4-74ac-4752-992e-9fc73c801bc0"  # DRN-2026-0001 (production_in_progress, 0 versions)


@pytest.fixture(scope="module")
def token():
    r = requests.post(f"{BASE_URL}/api/auth/login", json=CREDS, timeout=15)
    assert r.status_code == 200, f"Login failed: {r.status_code} {r.text}"
    return r.json()["session_token"]


@pytest.fixture(scope="module")
def client(token):
    s = requests.Session()
    s.headers.update({"Authorization": f"Bearer {token}", "Content-Type": "application/json"})
    return s


@pytest.fixture(scope="module")
def sm_snapshot(client):
    """Snapshot the state machine BEFORE tests, restore AFTER (guarantee no residual guards)."""
    r = client.get(f"{BASE_URL}/api/state-machines/{SM_ID}", timeout=15)
    assert r.status_code == 200, r.text
    original = r.json()
    original_transitions = copy.deepcopy(original.get("transitions", []))
    yield original
    # Teardown: restore original transitions (with no guards)
    restore = {"transitions": original_transitions}
    r2 = client.put(f"{BASE_URL}/api/state-machines/{SM_ID}", json=restore, timeout=15)
    assert r2.status_code == 200, f"Failed to restore SM: {r2.status_code} {r2.text}"
    # Sanity check: guards removed
    r3 = client.get(f"{BASE_URL}/api/state-machines/{SM_ID}", timeout=15)
    for t in r3.json().get("transitions", []):
        if t.get("action_key") == "close" and t.get("from_state") == "production_in_progress":
            g = t.get("guards") or {}
            conds = g.get("conditions") or []
            assert len(conds) == 0, f"Teardown failed — close transition still has guards: {conds}"


# ---------- Field catalog assertions (fix (b) + derived fields) ----------

class TestFieldsCatalog:
    def test_catalog_contains_new_derived_fields(self, client):
        r = client.get(f"{BASE_URL}/api/state-machines/fields/catalog?workflow_key=design_requests_new", timeout=15)
        assert r.status_code == 200, r.text
        fields = {f["key"]: f for f in r.json()["fields"]}

        # Existing sanity
        assert "versions" in fields
        # NEW derived fields
        for key in ("approved_versions", "lead.status", "lead.logo_url", "lead.city"):
            assert key in fields, f"Missing derived field '{key}' in catalog"

    def test_enum_fields_have_non_empty_options(self, client):
        r = client.get(f"{BASE_URL}/api/state-machines/fields/catalog?workflow_key=design_requests_new", timeout=15)
        fields = {f["key"]: f for f in r.json()["fields"]}

        # fix (b) — enum resolution for design_requests_new (previously empty)
        assert fields["request_type_name"]["type"] == "enum"
        assert len(fields["request_type_name"].get("options") or []) > 0, "request_type_name options empty"

        assert fields["assigned_department_name"]["type"] == "enum"
        assert len(fields["assigned_department_name"].get("options") or []) > 0, "assigned_department_name options empty"

        # New derived enum
        assert fields["lead.status"]["type"] == "enum"
        assert len(fields["lead.status"].get("options") or []) > 0, "lead.status options empty"


# ---------- End-to-end enforcement ----------

class TestGuardEnforcement:
    def test_e2e_close_blocked_by_versions_guard(self, client, sm_snapshot):
        # 1. Verify baseline: close is currently ALLOWED
        r = client.get(f"{BASE_URL}/api/design-requests-new/{REQ_ID}/available-transitions", timeout=15)
        assert r.status_code == 200
        close = next((t for t in r.json()["transitions"] if t["action_key"] == "close"), None)
        assert close is not None, "close transition not in available-transitions"
        assert close["allowed"] is True, "Baseline: close should be allowed with no guards"

        # 2. Add a guard to the close transition (Work versions >= 1)
        transitions = copy.deepcopy(sm_snapshot.get("transitions", []))
        target = None
        for t in transitions:
            if t.get("action_key") == "close" and t.get("from_state") == "production_in_progress":
                target = t
                break
        assert target is not None, "close transition not found on SM"
        target["guards"] = {
            "match": "all",
            "conditions": [
                {
                    "field": "versions",
                    "op": "count_gte",
                    "value": 1,
                    "message": "Upload at least one work version first.",
                }
            ],
        }
        r = client.put(f"{BASE_URL}/api/state-machines/{SM_ID}",
                       json={"transitions": transitions}, timeout=15)
        assert r.status_code == 200, f"PUT sm failed: {r.status_code} {r.text}"

        # 3. available-transitions should now show close as BLOCKED
        r = client.get(f"{BASE_URL}/api/design-requests-new/{REQ_ID}/available-transitions", timeout=15)
        assert r.status_code == 200
        close = next((t for t in r.json()["transitions"] if t["action_key"] == "close"), None)
        assert close is not None
        assert close.get("guards_ok") is False, f"Expected guards_ok=False, got: {close}"
        block_reasons = close.get("block_reasons") or []
        assert any("version" in br.lower() for br in block_reasons), f"Expected block reason mentioning version, got: {block_reasons}"

        # 4. Attempt POST /transition with action_key=close — should return HTTP 400
        r = client.post(f"{BASE_URL}/api/design-requests-new/{REQ_ID}/transition",
                        json={"action_key": "close"}, timeout=15)
        assert r.status_code == 400, f"Expected 400, got {r.status_code}: {r.text}"
        body = r.text.lower()
        assert "version" in body or "upload" in body, f"Expected block message in body, got: {r.text}"

    def test_e2e_approved_versions_field_resolution(self, client, sm_snapshot):
        """Verify augment_doc_for_guards exposes approved_versions=0 for DRN-2026-0001."""
        # Add a guard requiring approved_versions >= 1
        transitions = copy.deepcopy(sm_snapshot.get("transitions", []))
        for t in transitions:
            if t.get("action_key") == "close" and t.get("from_state") == "production_in_progress":
                t["guards"] = {
                    "match": "all",
                    "conditions": [
                        {
                            "field": "approved_versions",
                            "op": "count_gte",
                            "value": 1,
                            "message": "At least one APPROVED version is required.",
                        }
                    ],
                }
                break

        r = client.put(f"{BASE_URL}/api/state-machines/{SM_ID}",
                       json={"transitions": transitions}, timeout=15)
        assert r.status_code == 200

        r = client.post(f"{BASE_URL}/api/design-requests-new/{REQ_ID}/transition",
                        json={"action_key": "close"}, timeout=15)
        assert r.status_code == 400, f"Expected 400 for approved_versions guard, got {r.status_code}: {r.text}"
        assert "approved" in r.text.lower(), r.text
