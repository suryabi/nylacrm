"""Iteration 275 — Revenue Analytics state attribution + diagnostic endpoint.

Validates:
- GET /api/reports/revenue-analytics group_by=state (and city/territory/business_category/sku/total)
- GET /api/reports/revenue-state-diagnostic (NEW): structure, target_state_net reconciliation
- GET /api/reports/revenue-compare (regression)
- GET /api/reports/revenue-reconciliation (regression)
"""
import os
import pytest
import requests

BASE_URL = os.environ["REACT_APP_BACKEND_URL"].rstrip("/")
EMAIL = "surya.yadavalli@nylaairwater.earth"
PASSWORD = "test123"


@pytest.fixture(scope="module")
def session():
    s = requests.Session()
    r = s.post(f"{BASE_URL}/api/auth/login", json={"email": EMAIL, "password": PASSWORD}, timeout=30)
    assert r.status_code == 200, f"login failed: {r.status_code} {r.text}"
    tok = r.json().get("session_token")
    assert tok, f"no session_token in login response: {r.json()}"
    s.headers.update({"Authorization": f"Bearer {tok}", "Content-Type": "application/json"})
    return s


# ── revenue-analytics group_by=state ───────────────────────────────────────
class TestRevenueAnalyticsState:
    def test_group_by_state_returns_200_and_structure(self, session):
        r = session.get(f"{BASE_URL}/api/reports/revenue-analytics",
                        params={"group_by": "state", "time_filter": "all_time"}, timeout=60)
        assert r.status_code == 200, r.text
        data = r.json()
        for k in ("from", "to", "group_by", "groups", "total_revenue", "total_gross", "total_invoice_count"):
            assert k in data, f"missing key {k}"
        assert data["group_by"] == "state"
        assert isinstance(data["groups"], list)
        for g in data["groups"]:
            assert g["revenue"] >= 0, f"negative revenue in {g}"
            assert g["gross"] >= 0
            assert g["count"] >= 0
            assert isinstance(g["label"], str) and g["label"]
        # sum of breakdown net groups should be <= headline net (loose: equal here since same source)
        sum_net = sum(g["revenue"] for g in data["groups"])
        assert sum_net <= data["total_revenue"] + 0.01, f"sum group net {sum_net} > headline {data['total_revenue']}"
        assert data["total_invoice_count"] >= 0


# ── revenue-analytics regression on other group_bys ────────────────────────
@pytest.mark.parametrize("gb", ["city", "territory", "business_category", "sku", "total"])
def test_revenue_analytics_other_group_bys(session, gb):
    r = session.get(f"{BASE_URL}/api/reports/revenue-analytics",
                    params={"group_by": gb, "time_filter": "all_time"}, timeout=60)
    assert r.status_code == 200, f"{gb}: {r.status_code} {r.text}"
    data = r.json()
    assert data["group_by"] == gb
    assert isinstance(data["groups"], list)
    assert "total_revenue" in data and "total_gross" in data and "total_invoice_count" in data
    for g in data["groups"]:
        assert g["revenue"] >= 0 or gb == "sku"  # sku line totals always >= 0
        assert g["count"] >= 0


# ── NEW diagnostic endpoint structure + reconciliation ─────────────────────
class TestRevenueStateDiagnostic:
    def test_diagnostic_returns_required_fields(self, session):
        r = session.get(f"{BASE_URL}/api/reports/revenue-state-diagnostic",
                        params={"state": "Telangana", "time_filter": "all_time"}, timeout=60)
        assert r.status_code == 200, r.text
        data = r.json()
        for k in ("from", "to", "state", "invoice_count", "target_state_net",
                  "unmatched_invoice_count", "unmatched_net", "invoices"):
            assert k in data, f"missing key {k}"
        assert data["state"] == "Telangana"
        assert isinstance(data["invoices"], list)
        assert data["invoice_count"] == len(data["invoices"])
        assert data["unmatched_invoice_count"] >= 0
        assert data["unmatched_net"] >= 0
        assert data["target_state_net"] >= 0
        for row in data["invoices"]:
            for k in ("invoice_no", "invoice_date", "account_name", "account_id",
                      "account_uuid", "matched", "attributed_state", "net", "status", "source"):
                assert k in row, f"row missing {k}: {row}"
            assert isinstance(row["matched"], bool)
            if row["matched"]:
                # When matched, attributed_state must not be 'Uncategorised'
                assert row["attributed_state"] and row["attributed_state"] != "Uncategorised"

    def test_unmatched_accounting_consistent(self, session):
        """Sum of unmatched rows' net == unmatched_net; matched-to-target rows sum == target_state_net."""
        r = session.get(f"{BASE_URL}/api/reports/revenue-state-diagnostic",
                        params={"state": "Telangana", "time_filter": "all_time"}, timeout=60)
        assert r.status_code == 200
        data = r.json()
        sum_unmatched_net = round(sum(row["net"] for row in data["invoices"] if not row["matched"]), 2)
        sum_unmatched_count = sum(1 for row in data["invoices"] if not row["matched"])
        assert abs(sum_unmatched_net - data["unmatched_net"]) < 0.5, \
            f"unmatched_net mismatch: row-sum {sum_unmatched_net} vs reported {data['unmatched_net']}"
        assert sum_unmatched_count == data["unmatched_invoice_count"]

        sum_target = round(sum(row["net"] for row in data["invoices"]
                               if row["attributed_state"].strip().lower() == "telangana"), 2)
        assert abs(sum_target - data["target_state_net"]) < 0.5, \
            f"target_state_net mismatch: row-sum {sum_target} vs reported {data['target_state_net']}"

    def test_diagnostic_reconciles_with_analytics_state_total(self, session):
        """Critical assertion: diagnostic target_state_net == analytics group_by=state revenue for same state."""
        # pick a state that exists in the data
        ra = session.get(f"{BASE_URL}/api/reports/revenue-analytics",
                         params={"group_by": "state", "time_filter": "all_time", "top_n": 200}, timeout=60).json()
        candidate_states = [g["label"] for g in ra["groups"]
                            if g["label"] != "Uncategorised" and g["revenue"] > 0]
        if not candidate_states:
            pytest.skip("No non-uncategorised state with revenue in seed data")
        for st in candidate_states[:3]:  # check up to 3 states
            diag = session.get(f"{BASE_URL}/api/reports/revenue-state-diagnostic",
                               params={"state": st, "time_filter": "all_time"}, timeout=60).json()
            analytics_net = next(g["revenue"] for g in ra["groups"] if g["label"] == st)
            assert abs(diag["target_state_net"] - round(analytics_net, 2)) < 0.5, (
                f"reconciliation FAILED for state '{st}': "
                f"analytics={analytics_net} vs diagnostic.target_state_net={diag['target_state_net']}")


# ── regression: revenue-compare ────────────────────────────────────────────
def test_revenue_compare_two_months_200(session):
    r = session.get(f"{BASE_URL}/api/reports/revenue-compare",
                    params={"period_a_year": 2025, "period_a_month": 11,
                            "period_b_year": 2025, "period_b_month": 12,
                            "group_by": "state"}, timeout=60)
    assert r.status_code == 200, r.text
    data = r.json()
    assert "period_a" in data and "period_b" in data
    assert "rows" in data and isinstance(data["rows"], list)


# ── regression: revenue-reconciliation ─────────────────────────────────────
def test_revenue_reconciliation_200(session):
    r = session.get(f"{BASE_URL}/api/reports/revenue-reconciliation",
                    params={"time_filter": "all_time"}, timeout=60)
    assert r.status_code == 200, r.text
    data = r.json()
    assert "gross" in data and "net" in data
    assert data["gross"] >= 0 and data["net"] >= 0
    # net = gross - credit_notes
    assert abs((data["gross"] - data["credit_notes"]) - data["net"]) < 0.5
