"""
Iteration 255: Hierarchical Income Category master replaces flat Revenue Stream.
Tests:
- /api/accounting/masters?group=income returns income_category (hierarchical) only, no revenue_stream
- /api/accounting/masters/income_category returns hierarchical tree with 5 roots
- /api/accounting/masters/revenue_stream returns 404
- POST income_category with parent_id creates a sub-category visible in tree
- Export endpoint CSV header includes 'Income Category' (not 'Revenue Stream')
"""
import os
import pytest
import requests

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL").rstrip("/")
LOGIN = {"email": "surya.yadavalli@nylaairwater.earth", "password": "test123"}

EXPECTED_ROOTS = {
    "Operating Income", "Non-Operating Income", "Financial Receipts",
    "Investing Receipts", "Other Income",
}


@pytest.fixture(scope="module")
def session():
    s = requests.Session()
    s.headers.update({"Content-Type": "application/json"})
    r = s.post(f"{BASE_URL}/api/auth/login", json=LOGIN, timeout=30)
    assert r.status_code == 200, f"login failed: {r.status_code} {r.text}"
    data = r.json()
    token = data.get("session_token") or data.get("token") or data.get("access_token")
    assert token, f"no session_token in login response: {data}"
    s.headers.update({"Authorization": f"Bearer {token}"})
    return s


# --- Group filter on summary ---
def test_masters_group_income_excludes_revenue_stream(session):
    r = session.get(f"{BASE_URL}/api/accounting/masters?group=income", timeout=30)
    assert r.status_code == 200, r.text
    types = r.json().get("types", [])
    keys = [t["key"] for t in types]
    assert "income_category" in keys, f"income_category missing: {keys}"
    assert "revenue_stream" not in keys, f"revenue_stream still present: {keys}"
    inc = next(t for t in types if t["key"] == "income_category")
    assert inc["hierarchical"] is True
    assert inc["group"] == "income"
    assert inc["count"] >= 5


# --- Income Category tree shape ---
def test_income_category_tree_roots_and_levels(session):
    r = session.get(f"{BASE_URL}/api/accounting/masters/income_category", timeout=30)
    assert r.status_code == 200, r.text
    payload = r.json()
    assert payload["hierarchical"] is True
    items = payload["items"]
    assert len(items) >= 5

    roots = [it for it in items if not it.get("parent_id")]
    root_names = {it["name"] for it in roots}
    assert EXPECTED_ROOTS.issubset(root_names), f"missing roots: {EXPECTED_ROOTS - root_names}"

    # level field present and root level == 0
    for it in roots:
        assert it["level"] == 0
        assert "has_children" in it

    # at least one root has has_children True (subcategories seeded)
    assert any(it.get("has_children") for it in roots)

    # at least one level-1 node exists
    level1 = [it for it in items if it.get("level") == 1]
    assert len(level1) > 0
    # parent_id of level1 must point to a root id
    root_ids = {it["id"] for it in roots}
    assert all(it["parent_id"] in root_ids for it in level1)


# --- Old type removed ---
def test_revenue_stream_returns_404(session):
    r = session.get(f"{BASE_URL}/api/accounting/masters/revenue_stream", timeout=30)
    assert r.status_code == 404, f"expected 404, got {r.status_code}: {r.text}"


# --- Create sub-category under a root ---
def test_create_income_subcategory_under_root(session):
    # Find Operating Income root id
    r = session.get(f"{BASE_URL}/api/accounting/masters/income_category", timeout=30)
    assert r.status_code == 200
    items = r.json()["items"]
    op_root = next(it for it in items if it["name"] == "Operating Income" and not it.get("parent_id"))

    payload = {"name": "TEST_Subcat_255", "parent_id": op_root["id"], "is_active": True, "sort_order": 99}
    cr = session.post(f"{BASE_URL}/api/accounting/masters/income_category", json=payload, timeout=30)
    assert cr.status_code == 200, cr.text
    created = cr.json()
    assert created["name"] == "TEST_Subcat_255"
    assert created["parent_id"] == op_root["id"]
    created_id = created["id"]

    try:
        # GET to verify persistence and tree placement
        g = session.get(f"{BASE_URL}/api/accounting/masters/income_category", timeout=30)
        assert g.status_code == 200
        items2 = g.json()["items"]
        found = next((it for it in items2 if it["id"] == created_id), None)
        assert found is not None, "new sub-category not in tree"
        assert found["parent_id"] == op_root["id"]
        assert found["level"] == 1
    finally:
        # cleanup
        session.delete(f"{BASE_URL}/api/accounting/masters/income_category/{created_id}", timeout=30)


# --- Export CSV header uses 'Income Category' ---
def test_transactions_export_csv_header_uses_income_category(session):
    r = session.get(f"{BASE_URL}/api/accounting/transactions/export?format=csv", timeout=60)
    assert r.status_code == 200, f"export failed: {r.status_code} {r.text[:200]}"
    body = r.text
    header_line = body.splitlines()[0] if body else ""
    assert "Income Category" in header_line, f"missing 'Income Category' in header: {header_line}"
    assert "Revenue Stream" not in header_line, f"'Revenue Stream' still in header: {header_line}"
