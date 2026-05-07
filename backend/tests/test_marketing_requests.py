"""
Marketing Requests + Master Request Types — backend test suite (Iteration 155)
Covers full lifecycle, comments, files, links, lookups, dashboard, RBAC counts.
"""
import os
import pytest
import requests

BASE_URL = (os.environ.get("REACT_APP_BACKEND_URL") or "https://qc-invoice-hub.preview.emergentagent.com").rstrip("/")
API = f"{BASE_URL}/api"

ADMIN_EMAIL = "surya.yadavalli@nylaairwater.earth"
ADMIN_PASSWORD = "test123"
TENANT = "nyla-air-water"


@pytest.fixture(scope="session")
def auth_headers():
    r = requests.post(f"{API}/auth/login", json={
        "email": ADMIN_EMAIL,
        "password": ADMIN_PASSWORD,
        "tenant_id": TENANT,
    }, timeout=20)
    if r.status_code != 200:
        pytest.skip(f"Auth failed: {r.status_code} {r.text[:200]}")
    data = r.json()
    token = data.get("session_token") or data.get("token") or data.get("access_token")
    assert token, f"No token in login response: {data}"
    return {"Authorization": f"Bearer {token}", "Content-Type": "application/json"}


@pytest.fixture(scope="session")
def created_type(auth_headers):
    payload = {
        "name": "TEST_NeckTagDesign_155",
        "description": "Neck tag design for testing",
        "default_priority": "high",
        "default_due_offset_days": 5,
        "color": "indigo",
        "icon": "tag",
        "is_active": True,
        "sort_order": 1,
    }
    r = requests.post(f"{API}/master-request-types", json=payload, headers=auth_headers, timeout=15)
    assert r.status_code == 200, f"Create type failed: {r.status_code} {r.text[:200]}"
    return r.json()


# ───────────── Master Request Types ─────────────
class TestMasterRequestTypes:
    def test_list_types(self, auth_headers, created_type):
        r = requests.get(f"{API}/master-request-types", headers=auth_headers, timeout=15)
        assert r.status_code == 200
        rows = r.json()
        assert isinstance(rows, list)
        assert any(t["id"] == created_type["id"] for t in rows)

    def test_create_type_admin(self, created_type):
        assert created_type["name"] == "TEST_NeckTagDesign_155"
        assert created_type["is_active"] is True
        assert "id" in created_type

    def test_update_type(self, auth_headers, created_type):
        r = requests.put(
            f"{API}/master-request-types/{created_type['id']}",
            json={"description": "Updated description"},
            headers=auth_headers, timeout=15,
        )
        assert r.status_code == 200
        assert r.json()["description"] == "Updated description"


# ───────────── Marketing Requests CRUD ─────────────
class TestMarketingRequestsCRUD:
    def test_create_without_assignee_status_created(self, auth_headers, created_type):
        payload = {
            "title": "TEST_MR_NeckTag_NoAssignee",
            "description": "Need a new neck tag",
            "request_type_id": created_type["id"],
            "priority": "high",
            "due_date": "2026-05-15",
        }
        r = requests.post(f"{API}/marketing-requests", json=payload, headers=auth_headers, timeout=15)
        assert r.status_code == 200, r.text[:300]
        data = r.json()
        assert data["status"] == "created"
        assert data["request_type_name"] == created_type["name"]
        assert isinstance(data.get("activity"), list) and len(data["activity"]) >= 1
        pytest.mr_id = data["id"]

    def test_invalid_request_type_rejected(self, auth_headers):
        r = requests.post(f"{API}/marketing-requests", json={
            "title": "TEST_BadType",
            "request_type_id": "non-existent-id",
        }, headers=auth_headers, timeout=15)
        assert r.status_code == 400

    def test_get_by_id(self, auth_headers):
        rid = getattr(pytest, "mr_id", None)
        assert rid, "Previous create must succeed"
        r = requests.get(f"{API}/marketing-requests/{rid}", headers=auth_headers, timeout=15)
        assert r.status_code == 200
        d = r.json()
        assert d["id"] == rid
        for key in ("activity", "comments", "input_files", "output_files", "reference_links", "output_links"):
            assert key in d

    def test_list_with_filters(self, auth_headers, created_type):
        r = requests.get(f"{API}/marketing-requests?status=created,assigned&request_type_id=" + created_type["id"],
                         headers=auth_headers, timeout=15)
        assert r.status_code == 200
        rows = r.json()
        assert isinstance(rows, list)
        assert all(row["request_type_id"] == created_type["id"] for row in rows)

    def test_status_transition_inprogress(self, auth_headers):
        rid = pytest.mr_id
        r = requests.put(f"{API}/marketing-requests/{rid}", json={"status": "in_progress"},
                         headers=auth_headers, timeout=15)
        assert r.status_code == 200
        assert r.json()["status"] == "in_progress"

    def test_status_invalid_rejected(self, auth_headers):
        rid = pytest.mr_id
        r = requests.put(f"{API}/marketing-requests/{rid}", json={"status": "bogus_status"},
                         headers=auth_headers, timeout=15)
        assert r.status_code == 400

    def test_complete_sets_completed_at(self, auth_headers):
        rid = pytest.mr_id
        r = requests.put(f"{API}/marketing-requests/{rid}", json={"status": "completed"},
                         headers=auth_headers, timeout=15)
        assert r.status_code == 200
        d = r.json()
        assert d["status"] == "completed"
        assert d.get("completed_at")

    def test_add_comment(self, auth_headers):
        rid = pytest.mr_id
        r = requests.post(f"{API}/marketing-requests/{rid}/comments",
                          json={"text": "TEST_Comment_1"},
                          headers=auth_headers, timeout=15)
        assert r.status_code == 200
        c = r.json()
        assert c["text"] == "TEST_Comment_1"
        assert "id" in c
        # Verify persisted
        full = requests.get(f"{API}/marketing-requests/{rid}", headers=auth_headers, timeout=15).json()
        assert any(cm["id"] == c["id"] for cm in full["comments"])

    def test_attach_file_input(self, auth_headers):
        rid = pytest.mr_id
        r = requests.post(f"{API}/marketing-requests/{rid}/files", json={
            "name": "brief.pdf", "url": "https://drive.test/brief.pdf", "kind": "input"
        }, headers=auth_headers, timeout=15)
        assert r.status_code == 200
        f = r.json()
        pytest.mr_file_id = f["id"]
        full = requests.get(f"{API}/marketing-requests/{rid}", headers=auth_headers, timeout=15).json()
        assert any(x["id"] == f["id"] for x in full["input_files"])

    def test_attach_file_output_routing(self, auth_headers):
        rid = pytest.mr_id
        r = requests.post(f"{API}/marketing-requests/{rid}/files", json={
            "name": "design.png", "url": "https://drive.test/design.png", "kind": "output"
        }, headers=auth_headers, timeout=15)
        assert r.status_code == 200
        full = requests.get(f"{API}/marketing-requests/{rid}", headers=auth_headers, timeout=15).json()
        assert any(x["name"] == "design.png" for x in full["output_files"])

    def test_delete_file(self, auth_headers):
        rid, fid = pytest.mr_id, pytest.mr_file_id
        r = requests.delete(f"{API}/marketing-requests/{rid}/files/{fid}", headers=auth_headers, timeout=15)
        assert r.status_code == 200
        full = requests.get(f"{API}/marketing-requests/{rid}", headers=auth_headers, timeout=15).json()
        assert not any(x["id"] == fid for x in full["input_files"])

    def test_attach_link(self, auth_headers):
        rid = pytest.mr_id
        r = requests.post(f"{API}/marketing-requests/{rid}/links", json={
            "label": "Final Drive", "url": "https://drive.test/final", "kind": "output"
        }, headers=auth_headers, timeout=15)
        assert r.status_code == 200
        link = r.json()
        full = requests.get(f"{API}/marketing-requests/{rid}", headers=auth_headers, timeout=15).json()
        assert any(x["id"] == link["id"] for x in full["output_links"])


# ───────────── Lookups & Dashboard ─────────────
class TestLookupsAndDashboard:
    def test_departments_includes_marketing(self, auth_headers):
        r = requests.get(f"{API}/marketing-requests/lookups/departments", headers=auth_headers, timeout=15)
        assert r.status_code == 200
        depts = r.json()
        assert "Marketing" in depts

    def test_users_by_department(self, auth_headers):
        r = requests.get(f"{API}/marketing-requests/lookups/users-by-department?department=Marketing",
                         headers=auth_headers, timeout=15)
        assert r.status_code == 200
        users = r.json()
        assert isinstance(users, list)

    def test_dashboard_summary(self, auth_headers):
        r = requests.get(f"{API}/marketing-requests/summary/dashboard", headers=auth_headers, timeout=15)
        assert r.status_code == 200
        d = r.json()
        assert "total" in d and "by_status" in d and "overdue" in d
        for s in ("created", "assigned", "in_progress", "review", "completed", "rejected"):
            assert s in d["by_status"]


# ───────────── RBAC ─────────────
class TestRBAC:
    def test_module_categories_count(self, auth_headers):
        r = requests.get(f"{API}/roles", headers=auth_headers, timeout=15)
        assert r.status_code == 200, r.text[:300]
        data = r.json()
        cats = data.get("module_categories")
        assert cats, "module_categories missing in /roles response"
        assert "marketing_requests" in cats["Marketing"]
        assert len(cats["Marketing"]) == 3, f"Marketing expected 3, got {cats['Marketing']}"
        assert "master_request_types" in cats["Organization"]
        assert len(cats["Organization"]) == 9, f"Organization expected 9, got {cats['Organization']}"
        total = sum(len(v) for v in cats.values() if isinstance(v, list))
        assert total == 74, f"Expected 74 module keys, got {total}"

    def test_admin_role_has_marketing_requests_full_access(self, auth_headers):
        r = requests.get(f"{API}/roles", headers=auth_headers, timeout=15)
        assert r.status_code == 200
        roles = r.json()["roles"]
        admin = next((x for x in roles if x["name"] == "Admin"), None)
        assert admin, "Admin role missing"
        mr = admin["permissions"].get("marketing_requests")
        mrt = admin["permissions"].get("master_request_types")
        assert mr and all(mr.values()), f"Admin missing full marketing_requests perms: {mr}"
        assert mrt and all(mrt.values()), f"Admin missing full master_request_types perms: {mrt}"


# ───────────── Cleanup ─────────────
class TestCleanup:
    def test_delete_request(self, auth_headers):
        rid = getattr(pytest, "mr_id", None)
        if not rid:
            pytest.skip("No request to delete")
        r = requests.delete(f"{API}/marketing-requests/{rid}", headers=auth_headers, timeout=15)
        assert r.status_code == 200
        r2 = requests.get(f"{API}/marketing-requests/{rid}", headers=auth_headers, timeout=15)
        assert r2.status_code == 404

    def test_soft_delete_type(self, auth_headers, created_type):
        r = requests.delete(f"{API}/master-request-types/{created_type['id']}",
                            headers=auth_headers, timeout=15)
        assert r.status_code == 200
        # Verify is_active false in include_inactive listing
        r2 = requests.get(f"{API}/master-request-types?include_inactive=true",
                          headers=auth_headers, timeout=15)
        assert r2.status_code == 200
        rows = r2.json()
        match = next((t for t in rows if t["id"] == created_type["id"]), None)
        assert match is not None
        assert match["is_active"] is False
