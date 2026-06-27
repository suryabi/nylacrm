"""
Iteration 246 — Accounting module enhancements.
Covers:
- Vendor Types master (GET auto-seeds 17 defaults; POST/PATCH/DELETE; dup 400)
- Default seeds counts: payment_source=13, project_business_unit=14, cost_center=19
- expense_type list = authoritative 10 names; no legacy short names
- expense_category 3-level tree; 11 roots; key sub-category item counts
- /api/accounting/masters summary excludes vendor/employee/city_location
- Vendors CRUD + dup
- Employees CRUD + dup employee_code
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
TENANT_HEADER = {"X-Tenant-ID": "nyla-air-water"}


def _login():
    r = requests.post(f"{BASE_URL}/api/auth/login",
                      headers=TENANT_HEADER,
                      json={"email": ADMIN_EMAIL, "password": ADMIN_PASSWORD}, timeout=30)
    assert r.status_code == 200, f"Login failed: {r.status_code} {r.text}"
    body = r.json()
    return body.get("access_token") or body.get("session_token") or body.get("token")


@pytest.fixture(scope="module")
def H():
    tok = _login()
    return {
        "Authorization": f"Bearer {tok}",
        "Content-Type": "application/json",
        "X-Tenant-ID": "nyla-air-water",
    }


# ── Vendor Types ────────────────────────────────────────────────────────────
class TestVendorTypes:
    def test_get_seeds_17_defaults(self, H):
        r = requests.get(f"{BASE_URL}/api/vendor-types", headers=H, timeout=30)
        assert r.status_code == 200, r.text
        items = r.json().get("items", [])
        assert len(items) >= 17, f"Expected at least 17 seeded vendor types; got {len(items)}"
        names = {i["name"] for i in items}
        for must in ["Raw Material Supplier", "Logistics Partner", "IT Vendor", "Hotel"]:
            assert must in names, f"Missing default vendor type: {must}"

    def test_create_patch_delete_and_duplicate(self, H):
        unique = f"TEST_VT_{uuid.uuid4().hex[:8]}"
        r = requests.post(f"{BASE_URL}/api/vendor-types",
                          headers=H, json={"name": unique}, timeout=30)
        assert r.status_code == 200, r.text
        item = r.json()
        vid = item["id"]
        assert item["name"] == unique

        # duplicate (case-insensitive)
        r2 = requests.post(f"{BASE_URL}/api/vendor-types",
                           headers=H, json={"name": unique.lower()}, timeout=30)
        assert r2.status_code == 400, r2.text

        # patch
        new_name = unique + "_X"
        r3 = requests.patch(f"{BASE_URL}/api/vendor-types/{vid}",
                            headers=H, json={"name": new_name}, timeout=30)
        assert r3.status_code == 200, r3.text
        assert r3.json()["name"] == new_name

        # delete
        r4 = requests.delete(f"{BASE_URL}/api/vendor-types/{vid}", headers=H, timeout=30)
        assert r4.status_code == 200, r4.text


# ── Master defaults (counts) ────────────────────────────────────────────────
class TestMasterDefaults:
    def _names(self, H, mtype):
        r = requests.get(f"{BASE_URL}/api/accounting/masters/{mtype}", headers=H, timeout=30)
        assert r.status_code == 200, r.text
        data = r.json()
        # Could be list of dicts under 'items' or root list of items.
        items = data.get("items") if isinstance(data, dict) else data
        return [i.get("name") for i in items if i.get("name")]

    def test_payment_source_13(self, H):
        names = self._names(H, "payment_source")
        assert len(names) >= 13, f"Expected 13 payment_source, got {len(names)}: {names}"
        for must in ["Petty Cash", "Bank Transfer", "UPI", "Journal Entry"]:
            assert must in names

    def test_project_business_unit_14(self, H):
        names = self._names(H, "project_business_unit")
        assert len(names) >= 14, f"Expected 14 project_business_unit, got {len(names)}"
        for must in ["Household AWG", "Corporate Operations", "Export Business"]:
            assert must in names

    def test_cost_center_19(self, H):
        names = self._names(H, "cost_center")
        assert len(names) >= 19, f"Expected 19 cost_center, got {len(names)}"
        for must in ["Corporate Office", "Hyderabad Plant", "R&D Center"]:
            assert must in names

    def test_expense_type_authoritative_10(self, H):
        names = self._names(H, "expense_type")
        expected = {
            "COGS (Cost of Goods Sold)", "Operating Expense (OPEX)", "Capital Expense (CAPEX)",
            "Financial Expense", "Tax & Statutory", "Depreciation & Amortization",
            "Extraordinary / Exceptional Expense", "Intercompany Expense",
            "Prepaid Expense", "Accrued Expense",
        }
        names_set = set(names)
        missing = expected - names_set
        assert not missing, f"Missing authoritative expense types: {missing}"
        legacy_short = {"OPEX", "COGS", "CAPEX", "Financial", "Tax"} & names_set
        assert not legacy_short, f"Legacy short expense_type names still present: {legacy_short}"


# ── Expense Category tree ───────────────────────────────────────────────────
class TestExpenseCategoryTree:
    @pytest.fixture(scope="class")
    def tree(self, H):
        r = requests.get(f"{BASE_URL}/api/accounting/masters/expense_category", headers=H, timeout=30)
        assert r.status_code == 200, r.text
        d = r.json()
        items = d.get("items") if isinstance(d, dict) else d
        return items

    def test_eleven_root_categories_unique(self, tree):
        roots = [i for i in tree if not i.get("parent_id")]
        root_names = [r["name"] for r in roots]
        # dedupe check
        assert len(root_names) == len(set(root_names)), \
            f"Duplicate roots: {[n for n in root_names if root_names.count(n) > 1]}"
        for must in ["Production & Manufacturing", "Marketing", "IT", "HR",
                     "Administration", "Logistics", "Travel", "Finance",
                     "Sales", "Capital Assets", "Taxes"]:
            assert must in root_names, f"Missing root: {must}"
        assert len(roots) >= 11, f"Expected 11 roots, got {len(roots)}"

    def _children_of(self, tree, parent_id):
        return [i for i in tree if i.get("parent_id") == parent_id]

    def _find_by_path(self, tree, *names):
        parent = None
        for n in names:
            candidates = [i for i in tree
                          if i.get("name") == n and i.get("parent_id") == (parent["id"] if parent else None)]
            assert candidates, f"Path segment not found: {n} under {parent['name'] if parent else 'ROOT'}"
            parent = candidates[0]
        return parent

    def test_it_software_licenses_has_11(self, tree):
        node = self._find_by_path(tree, "IT", "Software Licenses")
        kids = self._children_of(tree, node["id"])
        names = [k["name"] for k in kids]
        for must in ["Zoho", "Microsoft 365", "Google Workspace", "OpenAI", "Canva", "AWS", "Azure"]:
            assert must in names, f"Missing {must} under IT>Software Licenses"
        assert len(kids) >= 11, f"IT>Software Licenses children count={len(kids)}; expected 11. Names={names}"

    def test_hr_salaries_has_6(self, tree):
        node = self._find_by_path(tree, "HR", "Salaries")
        kids = [k["name"] for k in self._children_of(tree, node["id"])]
        for must in ["Monthly Salary", "Bonus", "Incentives", "PF", "ESI", "Gratuity"]:
            assert must in kids
        assert len(kids) >= 6

    def test_production_raw_materials_has_9(self, tree):
        node = self._find_by_path(tree, "Production & Manufacturing", "Raw Materials")
        kids = [k["name"] for k in self._children_of(tree, node["id"])]
        for must in ["Glass Bottles", "Caps", "Labels", "Cartons", "Crates", "Minerals", "Chemicals"]:
            assert must in kids
        assert len(kids) >= 9, f"Raw Materials items={len(kids)}: {kids}"

    def test_admin_repairs_has_4(self, tree):
        node = self._find_by_path(tree, "Administration", "Repairs")
        kids = [k["name"] for k in self._children_of(tree, node["id"])]
        for must in ["Machinery Repair", "Vehicle Repair", "Building Maintenance", "Computer Repair"]:
            assert must in kids
        assert len(kids) >= 4

    def test_logistics_extras_l1(self, tree):
        node = self._find_by_path(tree, "Logistics")
        kids = [k["name"] for k in self._children_of(tree, node["id"])]
        for must in ["Local Transport", "Interstate Freight", "Cold Chain", "Last Mile Delivery"]:
            assert must in kids, f"Missing logistics L1 extra: {must}; got {kids}"

    def test_travel_extras_l1(self, tree):
        node = self._find_by_path(tree, "Travel")
        kids = [k["name"] for k in self._children_of(tree, node["id"])]
        for must in ["Airfare", "Hotel Stay", "Toll Charges", "Food"]:
            assert must in kids, f"Missing travel L1 extra: {must}; got {kids}"


# ── Summary excludes removed types ──────────────────────────────────────────
class TestMastersSummaryExcludes:
    def test_excludes_vendor_employee_city(self, H):
        r = requests.get(f"{BASE_URL}/api/accounting/masters", headers=H, timeout=30)
        assert r.status_code == 200, r.text
        types = {t["key"] for t in r.json().get("types", [])}
        for bad in ["vendor", "employee", "city_location"]:
            assert bad not in types, f"{bad} should not appear in masters summary; got {types}"


# ── Vendors CRUD ────────────────────────────────────────────────────────────
class TestVendorsCRUD:
    def test_create_list_patch_delete_and_duplicate(self, H):
        name = f"TEST_Vendor_{uuid.uuid4().hex[:6]}"
        payload = {
            "name": name, "vendor_type": "IT Vendor",
            "city": "Hyderabad", "email": "v@x.com", "phone": "9999999999",
        }
        r = requests.post(f"{BASE_URL}/api/accounting/vendors", headers=H, json=payload, timeout=30)
        assert r.status_code == 200, r.text
        v = r.json()
        vid = v["id"]
        assert v["name"] == name
        assert v["city"] == "Hyderabad"

        # duplicate
        r_dup = requests.post(f"{BASE_URL}/api/accounting/vendors",
                              headers=H, json={"name": name.lower()}, timeout=30)
        assert r_dup.status_code == 400, r_dup.text

        # list contains it
        r_list = requests.get(f"{BASE_URL}/api/accounting/vendors", headers=H, timeout=30)
        assert r_list.status_code == 200
        assert any(it["id"] == vid for it in r_list.json().get("items", []))

        # patch
        r_p = requests.patch(f"{BASE_URL}/api/accounting/vendors/{vid}",
                             headers=H, json={**payload, "phone": "8888888888"}, timeout=30)
        assert r_p.status_code == 200
        assert r_p.json()["phone"] == "8888888888"

        # delete
        r_d = requests.delete(f"{BASE_URL}/api/accounting/vendors/{vid}", headers=H, timeout=30)
        assert r_d.status_code == 200


# ── Employees CRUD ──────────────────────────────────────────────────────────
class TestEmployeesCRUD:
    def test_create_list_patch_delete_and_dup_code(self, H):
        name = f"TEST_Emp_{uuid.uuid4().hex[:6]}"
        code = f"EMP_{uuid.uuid4().hex[:6]}"
        payload = {"full_name": name, "employee_code": code,
                   "department": "HR", "city": "Hyderabad", "email": "e@x.com"}
        r = requests.post(f"{BASE_URL}/api/accounting/employees", headers=H, json=payload, timeout=30)
        assert r.status_code == 200, r.text
        emp = r.json()
        eid = emp["id"]
        assert emp["full_name"] == name
        assert emp["employee_code"] == code

        # duplicate code (different name)
        r_dup = requests.post(f"{BASE_URL}/api/accounting/employees",
                              headers=H, json={"full_name": name + "_2", "employee_code": code}, timeout=30)
        assert r_dup.status_code == 400, r_dup.text

        # list contains it
        r_list = requests.get(f"{BASE_URL}/api/accounting/employees", headers=H, timeout=30)
        assert r_list.status_code == 200
        assert any(it["id"] == eid for it in r_list.json().get("items", []))

        # patch
        r_p = requests.patch(f"{BASE_URL}/api/accounting/employees/{eid}",
                             headers=H, json={**payload, "designation": "Manager"}, timeout=30)
        assert r_p.status_code == 200
        assert r_p.json()["designation"] == "Manager"

        # delete
        r_d = requests.delete(f"{BASE_URL}/api/accounting/employees/{eid}", headers=H, timeout=30)
        assert r_d.status_code == 200
