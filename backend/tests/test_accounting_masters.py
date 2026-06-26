"""
Tests for the Accounting Masters module.
Covers:
- GET /api/accounting/masters (11 types + counts + seeded expense_type)
- Flat CRUD (department): create, list, patch, delete, duplicate
- Hierarchical (expense_category): 3-level tree, level/has_children flags,
  parent-delete guard, re-parent under descendant guard
- Role gate: Distributor (non-admin) gets 403 on writes, but GET is allowed
"""
import os
import uuid
import pytest
import requests

from dotenv import load_dotenv
load_dotenv("/app/frontend/.env")
BASE_URL = os.environ.get("REACT_APP_BACKEND_URL").rstrip("/")
ADMIN_EMAIL = "surya.yadavalli@nylaairwater.earth"
ADMIN_PASSWORD = "test123"
DIST_EMAIL = "john.distributor@test.com"
DIST_PASSWORD = "nyladist##"

EXPECTED_TYPES = {
    "expense_type", "expense_category", "department", "cost_center",
    "project_business_unit", "payment_source", "vendor", "employee",
    "city_location", "budget_head", "approval_category",
}
DEFAULT_EXPENSE = {"OPEX", "COGS", "CAPEX", "Financial", "Tax"}


def _login(email, password):
    r = requests.post(f"{BASE_URL}/api/auth/login",
                      json={"email": email, "password": password}, timeout=20)
    assert r.status_code == 200, f"Login failed for {email}: {r.status_code} {r.text}"
    return r.json().get("access_token") or r.json().get("session_token") or r.json().get("token")


@pytest.fixture(scope="module")
def admin_headers():
    tok = _login(ADMIN_EMAIL, ADMIN_PASSWORD)
    return {"Authorization": f"Bearer {tok}", "Content-Type": "application/json"}


@pytest.fixture(scope="module")
def dist_headers():
    try:
        tok = _login(DIST_EMAIL, DIST_PASSWORD)
    except AssertionError:
        pytest.skip("Distributor user login failed")
    return {"Authorization": f"Bearer {tok}", "Content-Type": "application/json"}


# ── Summary endpoint ────────────────────────────────────────────────────────
class TestMastersSummary:
    def test_summary_lists_all_11_types(self, admin_headers):
        r = requests.get(f"{BASE_URL}/api/accounting/masters", headers=admin_headers, timeout=20)
        assert r.status_code == 200, r.text
        data = r.json()
        assert "types" in data
        keys = {t["key"] for t in data["types"]}
        assert keys == EXPECTED_TYPES, f"Missing/extra master types: {keys ^ EXPECTED_TYPES}"
        # hierarchical flag only true for expense_category
        for t in data["types"]:
            if t["key"] == "expense_category":
                assert t["hierarchical"] is True
            else:
                assert t["hierarchical"] is False
            assert "label" in t and "count" in t
            assert isinstance(t["count"], int)

    def test_expense_type_seeded(self, admin_headers):
        r = requests.get(f"{BASE_URL}/api/accounting/masters/expense_type",
                         headers=admin_headers, timeout=20)
        assert r.status_code == 200, r.text
        items = r.json()["items"]
        names = {i["name"] for i in items}
        # Seed must include exactly the defaults (extra user-created entries acceptable but
        # in a clean tenant we should see exactly these 5)
        missing = DEFAULT_EXPENSE - names
        assert not missing, f"Missing seeded expense types: {missing}"


# ── Flat CRUD (department) ─────────────────────────────────────────────────
class TestFlatCRUD:
    created_id = None
    unique = f"TEST_Dept_{uuid.uuid4().hex[:6]}"

    def test_create(self, admin_headers):
        body = {"name": self.__class__.unique, "code": "TDEP", "description": "auto"}
        r = requests.post(f"{BASE_URL}/api/accounting/masters/department",
                          json=body, headers=admin_headers, timeout=20)
        assert r.status_code == 200, r.text
        data = r.json()
        assert data["name"] == self.__class__.unique
        assert data["master_type"] == "department"
        assert data["parent_id"] is None
        assert "id" in data
        TestFlatCRUD.created_id = data["id"]

    def test_list_contains(self, admin_headers):
        r = requests.get(f"{BASE_URL}/api/accounting/masters/department",
                         headers=admin_headers, timeout=20)
        assert r.status_code == 200
        names = [i["name"] for i in r.json()["items"]]
        assert self.__class__.unique in names

    def test_duplicate_rejected(self, admin_headers):
        body = {"name": self.__class__.unique}
        r = requests.post(f"{BASE_URL}/api/accounting/masters/department",
                          json=body, headers=admin_headers, timeout=20)
        assert r.status_code == 400, f"Expected 400 duplicate, got {r.status_code}"

    def test_patch_update(self, admin_headers):
        assert self.__class__.created_id
        r = requests.patch(
            f"{BASE_URL}/api/accounting/masters/department/{self.__class__.created_id}",
            json={"is_active": False, "code": "TDEP2"},
            headers=admin_headers, timeout=20,
        )
        assert r.status_code == 200, r.text
        # verify persistence
        r2 = requests.get(f"{BASE_URL}/api/accounting/masters/department",
                          headers=admin_headers, timeout=20)
        rec = next((i for i in r2.json()["items"] if i["id"] == self.__class__.created_id), None)
        assert rec and rec["is_active"] is False and rec["code"] == "TDEP2"

    def test_delete(self, admin_headers):
        assert self.__class__.created_id
        r = requests.delete(
            f"{BASE_URL}/api/accounting/masters/department/{self.__class__.created_id}",
            headers=admin_headers, timeout=20,
        )
        assert r.status_code == 200, r.text
        # verify gone
        r2 = requests.get(f"{BASE_URL}/api/accounting/masters/department",
                          headers=admin_headers, timeout=20)
        ids = [i["id"] for i in r2.json()["items"]]
        assert self.__class__.created_id not in ids


# ── Hierarchical (expense_category) ────────────────────────────────────────
class TestHierarchy:
    parent_id = None
    child_id = None
    grand_id = None
    sibling_id = None
    prefix = f"TEST_Cat_{uuid.uuid4().hex[:6]}"

    def test_create_3_levels(self, admin_headers):
        # parent
        p = requests.post(f"{BASE_URL}/api/accounting/masters/expense_category",
                          json={"name": f"{self.prefix}_P"}, headers=admin_headers, timeout=20)
        assert p.status_code == 200, p.text
        TestHierarchy.parent_id = p.json()["id"]
        # child
        c = requests.post(f"{BASE_URL}/api/accounting/masters/expense_category",
                          json={"name": f"{self.prefix}_C", "parent_id": TestHierarchy.parent_id},
                          headers=admin_headers, timeout=20)
        assert c.status_code == 200, c.text
        TestHierarchy.child_id = c.json()["id"]
        # grandchild
        g = requests.post(f"{BASE_URL}/api/accounting/masters/expense_category",
                          json={"name": f"{self.prefix}_G", "parent_id": TestHierarchy.child_id},
                          headers=admin_headers, timeout=20)
        assert g.status_code == 200, g.text
        TestHierarchy.grand_id = g.json()["id"]
        # sibling under parent (for re-parent test)
        s = requests.post(f"{BASE_URL}/api/accounting/masters/expense_category",
                          json={"name": f"{self.prefix}_S", "parent_id": TestHierarchy.parent_id},
                          headers=admin_headers, timeout=20)
        assert s.status_code == 200, s.text
        TestHierarchy.sibling_id = s.json()["id"]

    def test_level_and_has_children(self, admin_headers):
        r = requests.get(f"{BASE_URL}/api/accounting/masters/expense_category",
                         headers=admin_headers, timeout=20)
        assert r.status_code == 200
        items = {i["id"]: i for i in r.json()["items"]}
        p, c, g = items[self.parent_id], items[self.child_id], items[self.grand_id]
        assert p["level"] == 0 and p["has_children"] is True
        assert c["level"] == 1 and c["has_children"] is True
        assert g["level"] == 2 and g["has_children"] is False

    def test_delete_parent_with_children_rejected(self, admin_headers):
        r = requests.delete(
            f"{BASE_URL}/api/accounting/masters/expense_category/{self.parent_id}",
            headers=admin_headers, timeout=20)
        assert r.status_code == 400, f"Expected 400, got {r.status_code}: {r.text}"

    def test_reparent_under_descendant_rejected(self, admin_headers):
        # Try to move parent under grandchild → 400
        r = requests.patch(
            f"{BASE_URL}/api/accounting/masters/expense_category/{self.parent_id}",
            json={"parent_id": self.grand_id},
            headers=admin_headers, timeout=20)
        assert r.status_code == 400, f"Expected 400, got {r.status_code}: {r.text}"

    def test_cleanup(self, admin_headers):
        # delete bottom-up
        for nid in [self.grand_id, self.child_id, self.sibling_id, self.parent_id]:
            if not nid:
                continue
            requests.delete(
                f"{BASE_URL}/api/accounting/masters/expense_category/{nid}",
                headers=admin_headers, timeout=20)


# ── Role gate ──────────────────────────────────────────────────────────────
class TestRoleGate:
    def test_distributor_can_read(self, dist_headers):
        r = requests.get(f"{BASE_URL}/api/accounting/masters",
                         headers=dist_headers, timeout=20)
        assert r.status_code == 200, r.text
        r2 = requests.get(f"{BASE_URL}/api/accounting/masters/department",
                          headers=dist_headers, timeout=20)
        assert r2.status_code == 200

    def test_distributor_cannot_create(self, dist_headers):
        r = requests.post(f"{BASE_URL}/api/accounting/masters/department",
                          json={"name": f"TEST_Forbidden_{uuid.uuid4().hex[:6]}"},
                          headers=dist_headers, timeout=20)
        assert r.status_code == 403, f"Expected 403, got {r.status_code}: {r.text}"

    def test_distributor_cannot_patch(self, dist_headers, admin_headers):
        # need a real id; pull one from listing
        lst = requests.get(f"{BASE_URL}/api/accounting/masters/expense_type",
                           headers=admin_headers, timeout=20).json()["items"]
        assert lst, "Need at least one expense_type to test patch denial"
        target = lst[0]["id"]
        r = requests.patch(f"{BASE_URL}/api/accounting/masters/expense_type/{target}",
                           json={"description": "blocked"},
                           headers=dist_headers, timeout=20)
        assert r.status_code == 403, f"Expected 403, got {r.status_code}: {r.text}"

    def test_distributor_cannot_delete(self, dist_headers, admin_headers):
        lst = requests.get(f"{BASE_URL}/api/accounting/masters/expense_type",
                           headers=admin_headers, timeout=20).json()["items"]
        target = lst[0]["id"]
        r = requests.delete(f"{BASE_URL}/api/accounting/masters/expense_type/{target}",
                            headers=dist_headers, timeout=20)
        assert r.status_code == 403, f"Expected 403, got {r.status_code}: {r.text}"
