"""Backend tests for the NEW 'Design Requests - New' module (mirror of marketing_requests).

Covers:
- create / list / get / transition / comment / export
- file upload + download
- shared masters (types + departments) reuse
- RBAC labels/categories in /api/roles
- data isolation from old marketing_requests
"""
import os
import io
import time
import pytest
import requests

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL").rstrip("/")
ADMIN_EMAIL = "surya.yadavalli@nylaairwater.earth"
ADMIN_PW = "test123"


@pytest.fixture(scope="module")
def token():
    r = requests.post(f"{BASE_URL}/api/auth/login",
                      json={"email": ADMIN_EMAIL, "password": ADMIN_PW})
    assert r.status_code == 200, r.text
    data = r.json()
    tok = data.get("session_token") or data.get("token") or data.get("access_token")
    assert tok, f"No token in login response: {data}"
    return tok


@pytest.fixture(scope="module")
def hdr(token):
    return {"Authorization": f"Bearer {token}"}


# ─────────────────── Masters (shared) ───────────────────
@pytest.fixture(scope="module")
def types(hdr):
    r = requests.get(f"{BASE_URL}/api/marketing-request-types", headers=hdr)
    assert r.status_code == 200
    data = r.json()
    lst = data.get("types") if isinstance(data, dict) else data
    assert lst and len(lst) > 0
    return lst


@pytest.fixture(scope="module")
def departments(hdr):
    r = requests.get(f"{BASE_URL}/api/master-departments", headers=hdr)
    assert r.status_code == 200
    data = r.json()
    lst = data.get("departments") if isinstance(data, dict) else data
    assert lst and len(lst) > 0
    return lst


def _find_design(dept_list):
    for d in dept_list:
        if (d.get("name") or "").strip().lower() == "design":
            return d
    return dept_list[0]


# ─────────────────── Basic list + counts (auto-seeds SM) ───────────────────
def test_list_endpoint(hdr):
    r = requests.get(f"{BASE_URL}/api/design-requests-new", headers=hdr)
    assert r.status_code == 200, r.text
    data = r.json()
    assert "items" in data and "total" in data
    assert isinstance(data["items"], list)


def test_counts_and_seed_sm(hdr):
    r = requests.get(f"{BASE_URL}/api/design-requests-new/counts", headers=hdr)
    assert r.status_code == 200, r.text
    data = r.json()
    assert data.get("state_machine_id"), "SM not seeded"
    assert "Design Requests - New" in (data.get("state_machine_name") or ""), data.get("state_machine_name")
    states = data.get("states") or []
    assert len(states) > 0
    initial = [s for s in states if s.get("is_initial")]
    assert initial, "No initial state on seeded SM"
    assert initial[0].get("key") == "submitted" or initial[0].get("label", "").lower() == "submitted"


# ─────────────────── Create request → DRN- numbering ───────────────────
@pytest.fixture(scope="module")
def created_request(hdr, types, departments):
    tp = types[0]
    dept = _find_design(departments)
    # 90 days out to easily pass lead-time guardrail
    from datetime import date, timedelta
    due = (date.today() + timedelta(days=90)).isoformat()
    payload = {
        "request_type_id": tp["id"],
        "assigned_department_id": dept["id"],
        "requested_due_date": due,
        "requirement_details": "TEST_DRN_NEW - automated test request",
        "is_urgent": False,
    }
    r = requests.post(f"{BASE_URL}/api/design-requests-new", json=payload, headers=hdr)
    assert r.status_code == 200, r.text
    doc = r.json()
    yield doc
    # cleanup
    try:
        requests.delete(f"{BASE_URL}/api/design-requests-new/{doc['id']}", headers=hdr)
    except Exception:
        pass


def test_create_returns_drn_prefix(created_request):
    rn = created_request.get("request_number")
    assert rn and rn.startswith("DRN-"), f"Expected DRN- prefix, got {rn}"
    assert created_request.get("current_state_key") == "submitted"
    assert created_request.get("state_machine_id")


def test_get_request_by_id(hdr, created_request):
    r = requests.get(f"{BASE_URL}/api/design-requests-new/{created_request['id']}", headers=hdr)
    assert r.status_code == 200
    doc = r.json()
    assert doc["id"] == created_request["id"]
    assert doc["request_number"] == created_request["request_number"]
    assert doc.get("status_history") and len(doc["status_history"]) >= 1


# ─────────────────── Transition next state ───────────────────
def test_available_transitions(hdr, created_request):
    r = requests.get(f"{BASE_URL}/api/design-requests-new/{created_request['id']}/available-transitions",
                     headers=hdr)
    assert r.status_code == 200
    data = r.json()
    assert "transitions" in data
    assert len(data["transitions"]) > 0


def test_transition_next_state(hdr, created_request):
    # find first allowed transition
    r = requests.get(f"{BASE_URL}/api/design-requests-new/{created_request['id']}/available-transitions",
                     headers=hdr)
    trs = r.json().get("transitions", [])
    allowed = [t for t in trs if t.get("allowed")]
    if not allowed:
        pytest.skip("No user-allowed transitions from initial state for this admin")
    action = allowed[0]["action_key"]
    payload = {"action_key": action, "comment": "TEST_DRN_NEW transition"}
    # Provide any required_fields with a dummy value
    if allowed[0].get("required_fields"):
        payload["field_data"] = {f["key"]: (f.get("options", [None])[0] if f.get("type") == "select" else "1")
                                 for f in allowed[0]["required_fields"]}
    r2 = requests.post(f"{BASE_URL}/api/design-requests-new/{created_request['id']}/transition",
                       json=payload, headers=hdr)
    assert r2.status_code == 200, r2.text
    doc = r2.json()
    assert doc.get("current_state_key") != "submitted"
    assert len(doc.get("status_history") or []) >= 2


# ─────────────────── File upload + download ───────────────────
def test_upload_file_and_download(hdr, types, departments):
    # upload a tiny PNG bytes
    png = (b"\x89PNG\r\n\x1a\n\x00\x00\x00\rIHDR\x00\x00\x00\x01\x00\x00\x00\x01"
           b"\x08\x02\x00\x00\x00\x90wS\xde\x00\x00\x00\x0cIDATx\x9cc``\x00\x00\x00\x04\x00\x01"
           b"\x0e\x86\xecc\x00\x00\x00\x00IEND\xaeB`\x82")
    files = {"file": ("test.png", io.BytesIO(png), "image/png")}
    r = requests.post(f"{BASE_URL}/api/design-requests-new/upload",
                      files=files, headers=hdr)
    assert r.status_code == 200, r.text
    up = r.json()
    assert up.get("id")
    # download it back
    r2 = requests.get(f"{BASE_URL}/api/design-requests-new/files/{up['id']}", headers=hdr)
    assert r2.status_code == 200
    assert r2.content[:4] == b"\x89PNG"

    # create request with this file as logo
    tp = types[0]
    dept = _find_design(departments)
    from datetime import date, timedelta
    payload = {
        "request_type_id": tp["id"],
        "assigned_department_id": dept["id"],
        "requested_due_date": (date.today() + timedelta(days=90)).isoformat(),
        "requirement_details": "TEST_DRN_NEW - with logo",
        "logo_file_id": up["id"],
        "reference_file_ids": [up["id"]],
    }
    r3 = requests.post(f"{BASE_URL}/api/design-requests-new", json=payload, headers=hdr)
    assert r3.status_code == 200, r3.text
    doc = r3.json()
    assert doc.get("logo") and doc["logo"]["id"] == up["id"]
    assert doc.get("references") and doc["references"][0]["id"] == up["id"]
    # cleanup
    requests.delete(f"{BASE_URL}/api/design-requests-new/{doc['id']}", headers=hdr)


# ─────────────────── Comment ───────────────────
def test_add_comment(hdr, created_request):
    r = requests.post(
        f"{BASE_URL}/api/design-requests-new/{created_request['id']}/comments",
        json={"text": "TEST_DRN_NEW automated comment", "kind": "comment"},
        headers=hdr,
    )
    assert r.status_code == 200, r.text
    # verify persisted
    r2 = requests.get(f"{BASE_URL}/api/design-requests-new/{created_request['id']}", headers=hdr)
    doc = r2.json()
    comments = doc.get("comments") or []
    assert any(c.get("text") == "TEST_DRN_NEW automated comment" for c in comments)


# ─────────────────── CSV Export ───────────────────
def test_csv_export(hdr):
    r = requests.get(f"{BASE_URL}/api/design-requests-new/export", headers=hdr)
    assert r.status_code == 200
    assert "text/csv" in r.headers.get("content-type", "")
    text = r.text
    assert "Request #" in text  # header row


# ─────────────────── RBAC labels / categories ───────────────────
def test_roles_module_label_and_category(hdr):
    r = requests.get(f"{BASE_URL}/api/roles", headers=hdr)
    assert r.status_code == 200
    data = r.json()
    labels = data.get("module_labels") or {}
    cats = data.get("module_categories") or {}
    assert labels.get("design_requests_new") == "Design Requests - New", labels.get("design_requests_new")
    marketing_cat = cats.get("Marketing") or []
    assert "design_requests_new" in marketing_cat, marketing_cat


# ─────────────────── Data isolation ───────────────────
def test_data_isolation_from_old_module(hdr, created_request):
    # Old module list must NOT contain the DRN- request
    r = requests.get(f"{BASE_URL}/api/marketing-requests?limit=100", headers=hdr)
    assert r.status_code == 200
    items = r.json().get("items") or []
    drn_nums = [i.get("request_number") for i in items
                if (i.get("request_number") or "").startswith("DRN-")]
    assert not drn_nums, f"DRN numbers leaked into old module: {drn_nums}"

    # Create in old module — should be MR-
    from datetime import date, timedelta
    r_types = requests.get(f"{BASE_URL}/api/marketing-request-types", headers=hdr).json()
    r_depts = requests.get(f"{BASE_URL}/api/master-departments", headers=hdr).json()
    tp = (r_types.get("types") or r_types)[0]
    dept = _find_design(r_depts.get("departments") or r_depts)
    payload = {
        "request_type_id": tp["id"],
        "assigned_department_id": dept["id"],
        "requested_due_date": (date.today() + timedelta(days=90)).isoformat(),
        "requirement_details": "TEST_MR_OLD - regression from DRN test",
    }
    r2 = requests.post(f"{BASE_URL}/api/marketing-requests", json=payload, headers=hdr)
    assert r2.status_code == 200, r2.text
    old = r2.json()
    assert (old.get("request_number") or "").startswith("MR-"), old.get("request_number")

    # New module list must NOT contain the old MR- number
    r3 = requests.get(f"{BASE_URL}/api/design-requests-new?limit=100", headers=hdr)
    items3 = r3.json().get("items") or []
    mr_leaked = [i.get("request_number") for i in items3
                 if (i.get("request_number") or "").startswith("MR-")]
    assert not mr_leaked, f"MR numbers leaked into new module: {mr_leaked}"

    # cleanup old
    try:
        requests.delete(f"{BASE_URL}/api/marketing-requests/{old['id']}", headers=hdr)
    except Exception:
        pass
