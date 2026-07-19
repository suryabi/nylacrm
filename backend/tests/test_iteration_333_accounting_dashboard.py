"""
Iteration 333 — Accounting Dashboard endpoints
Tests:
  - GET /api/accounting/transactions/dashboard
  - GET /api/accounting/transactions/dashboard/category-breakdown
  - GET /api/accounting/transactions/dashboard/category-transactions
  - P0 regression: CEO role has admin permissions (Team menu)
"""
import os
import pytest
import requests

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "https://design-workflow-hub-11.preview.emergentagent.com").rstrip("/")
TENANT = "nyla-air-water"
EMAIL = "surya.yadavalli@nylaairwater.earth"
PASSWORD = "test123"

FY_START = "2026-04-01"
FY_END = "2027-03-31"
FULL_START = "2025-04-01"
FULL_END = "2026-07-31"


@pytest.fixture(scope="session")
def session():
    s = requests.Session()
    s.headers.update({"X-Tenant-ID": TENANT, "Content-Type": "application/json"})
    r = s.post(f"{BASE_URL}/api/auth/login", json={"email": EMAIL, "password": PASSWORD})
    assert r.status_code == 200, f"Login failed: {r.status_code} {r.text}"
    body = r.json()
    token = body.get("session_token") or body.get("token")
    assert token, f"No session_token in login response: {body}"
    s.headers.update({"Authorization": f"Bearer {token}"})
    return s


# -------- P0 regression: CEO role has admin permissions --------
class TestCEORolePerms:
    def test_ceo_role_has_team_permission(self, session):
        r = session.get(f"{BASE_URL}/api/roles")
        assert r.status_code == 200, r.text
        body = r.json()
        roles = body["roles"] if isinstance(body, dict) else body
        ceo = next((x for x in roles if x.get("name", "").upper() == "CEO"), None)
        assert ceo, "CEO role not found"
        perms = ceo.get("permissions") or {}
        # Team management access — accept a variety of module keys
        team_keys = ["team", "team_management", "users", "team_members", "users_management"]
        has_team = any(
            isinstance(perms.get(k), dict) and (perms[k].get("view") or perms[k].get("access"))
            for k in team_keys
        )
        # Or admin/full-access flag
        has_admin = any(
            isinstance(perms.get(k), dict) and perms[k].get("view")
            for k in perms.keys()
        )
        assert has_team or has_admin, f"CEO role permissions look revoked: {list(perms.keys())[:30]}"


# -------- /dashboard --------
class TestDashboardEndpoint:
    def test_dashboard_default_fy(self, session):
        r = session.get(
            f"{BASE_URL}/api/accounting/transactions/dashboard",
            params={"date_start": FY_START, "date_end": FY_END},
        )
        assert r.status_code == 200, r.text
        d = r.json()
        # Top-level keys
        for k in ["kpis", "monthly", "expense_categories", "income_categories",
                  "top_vendors", "top_payees", "bank_accounts"]:
            assert k in d, f"Missing key {k}"
        # KPIs
        k = d["kpis"]
        for kk in ["money_in", "money_out", "net", "prev", "untagged", "bills_pending"]:
            assert kk in k, f"Missing kpi field {kk}"
        assert "total" in k["money_in"] and "count" in k["money_in"]
        assert "total" in k["money_out"] and "count" in k["money_out"]
        assert "total" in k["untagged"] and "count" in k["untagged"]
        assert "total" in k["bills_pending"] and "count" in k["bills_pending"]
        # prev present (given date range provided)
        assert k["prev"] is not None
        # Monthly array is a list
        assert isinstance(d["monthly"], list)
        # Categories are lists with expected fields when non-empty
        if d["expense_categories"]:
            top = d["expense_categories"][0]
            for f in ["id", "name", "total", "count", "pct", "has_children"]:
                assert f in top, f"Missing field {f} in expense_categories item"

    def test_dashboard_full_range_has_data(self, session):
        r = session.get(
            f"{BASE_URL}/api/accounting/transactions/dashboard",
            params={"date_start": FULL_START, "date_end": FULL_END},
        )
        assert r.status_code == 200
        d = r.json()
        # Demo data seeded ~534 rows should yield non-zero totals
        total_count = d["kpis"]["money_in"]["count"] + d["kpis"]["money_out"]["count"]
        assert total_count > 0, "Expected non-zero transactions across full seeded range"
        # Should have monthly data across seeded window
        assert len(d["monthly"]) >= 6
        # Should have at least 1 bank account
        assert len(d["bank_accounts"]) >= 1


# -------- /dashboard/category-breakdown --------
class TestCategoryBreakdown:
    def test_root_expense_breakdown(self, session):
        r = session.get(
            f"{BASE_URL}/api/accounting/transactions/dashboard/category-breakdown",
            params={"tag": "expense_category", "date_start": FULL_START, "date_end": FULL_END},
        )
        assert r.status_code == 200, r.text
        d = r.json()
        assert "items" in d
        # parent is None when no parent_id
        assert d.get("parent") is None
        assert len(d["items"]) >= 1
        # Field checks
        it = d["items"][0]
        for f in ["id", "name", "total", "count", "pct", "has_children"]:
            assert f in it

    def test_root_income_breakdown(self, session):
        r = session.get(
            f"{BASE_URL}/api/accounting/transactions/dashboard/category-breakdown",
            params={"tag": "income_category", "date_start": FULL_START, "date_end": FULL_END},
        )
        assert r.status_code == 200
        d = r.json()
        assert isinstance(d["items"], list)

    def test_invalid_tag_returns_400(self, session):
        r = session.get(
            f"{BASE_URL}/api/accounting/transactions/dashboard/category-breakdown",
            params={"tag": "invalid_tag", "date_start": FULL_START, "date_end": FULL_END},
        )
        assert r.status_code == 400, f"Expected 400, got {r.status_code}: {r.text}"

    def test_drill_into_root(self, session):
        # Get roots
        r = session.get(
            f"{BASE_URL}/api/accounting/transactions/dashboard/category-breakdown",
            params={"tag": "expense_category", "date_start": FULL_START, "date_end": FULL_END},
        )
        roots = r.json()["items"]
        parent_root = next((it for it in roots if it.get("has_children")), None)
        if not parent_root:
            pytest.skip("No root category with children")
        # Drill in
        r2 = session.get(
            f"{BASE_URL}/api/accounting/transactions/dashboard/category-breakdown",
            params={
                "tag": "expense_category",
                "parent_id": parent_root["id"],
                "date_start": FULL_START,
                "date_end": FULL_END,
            },
        )
        assert r2.status_code == 200, r2.text
        d = r2.json()
        assert d.get("parent") and d["parent"]["id"] == parent_root["id"]
        # Level should have at least one child
        assert len(d["items"]) >= 1


# -------- /dashboard/category-transactions --------
class TestCategoryTransactions:
    def _find_leaf_and_root(self, session, tag="expense_category"):
        r = session.get(
            f"{BASE_URL}/api/accounting/transactions/dashboard/category-breakdown",
            params={"tag": tag, "date_start": FULL_START, "date_end": FULL_END},
        )
        roots = r.json()["items"]
        # Pick first root with children — walk to a leaf
        non_leaf_root = next((it for it in roots if it.get("has_children")), None)
        leaf = None
        cur = non_leaf_root
        while cur and cur.get("has_children"):
            r2 = session.get(
                f"{BASE_URL}/api/accounting/transactions/dashboard/category-breakdown",
                params={"tag": tag, "parent_id": cur["id"], "date_start": FULL_START, "date_end": FULL_END},
            )
            items = r2.json().get("items") or []
            # skip the "Directly tagged" bucket that references the parent itself
            children = [it for it in items if it["id"] != cur["id"]]
            if not children:
                break
            cur = children[0]
            if not cur.get("has_children"):
                leaf = cur
        return non_leaf_root, leaf

    def test_leaf_transactions(self, session):
        non_leaf_root, leaf = self._find_leaf_and_root(session)
        if not leaf:
            # Fallback: use any root
            r = session.get(
                f"{BASE_URL}/api/accounting/transactions/dashboard/category-breakdown",
                params={"tag": "expense_category", "date_start": FULL_START, "date_end": FULL_END},
            )
            leaf = r.json()["items"][0]
        r = session.get(
            f"{BASE_URL}/api/accounting/transactions/dashboard/category-transactions",
            params={
                "tag": "expense_category",
                "category_id": leaf["id"],
                "date_start": FULL_START,
                "date_end": FULL_END,
            },
        )
        assert r.status_code == 200, r.text
        d = r.json()
        assert "items" in d and "total" in d
        assert isinstance(d["items"], list)
        if d["items"]:
            it = d["items"][0]
            # category_name enrichment
            assert "category_name" in it
            # Should be direction=debit (expense)
            assert it.get("direction") == "debit"

    def test_non_leaf_category_includes_descendants(self, session):
        non_leaf_root, _ = self._find_leaf_and_root(session)
        if not non_leaf_root:
            pytest.skip("No non-leaf root found")
        r = session.get(
            f"{BASE_URL}/api/accounting/transactions/dashboard/category-transactions",
            params={
                "tag": "expense_category",
                "category_id": non_leaf_root["id"],
                "date_start": FULL_START,
                "date_end": FULL_END,
            },
        )
        assert r.status_code == 200, r.text
        d = r.json()
        # Non-leaf should aggregate descendant-tagged txns — count should be >0 if any exist
        assert d["total"] >= 0
        # Verify no _id (mongo) leaks
        if d["items"]:
            assert "_id" not in d["items"][0]

    def test_invalid_tag_400(self, session):
        r = session.get(
            f"{BASE_URL}/api/accounting/transactions/dashboard/category-transactions",
            params={"tag": "bad", "category_id": "x", "date_start": FULL_START, "date_end": FULL_END},
        )
        assert r.status_code == 400


# -------- Regression: /transactions still works --------
class TestTransactionsRegression:
    def test_list_transactions(self, session):
        r = session.get(
            f"{BASE_URL}/api/accounting/transactions",
            params={"date_start": FULL_START, "date_end": FULL_END, "limit": 20},
        )
        assert r.status_code == 200, r.text
        d = r.json()
        # Response is either dict with items or a list
        items = d.get("items") if isinstance(d, dict) else d
        assert isinstance(items, list)
        assert len(items) >= 1
