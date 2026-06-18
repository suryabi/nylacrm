"""Iteration 150 — Production Dashboard time filter & rejection cost regression."""
import os
import pytest
import requests

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL").rstrip("/")
EMAIL = "surya.yadavalli@nylaairwater.earth"
PASSWORD = "test123"
TENANT_ID = "nyla-air-water"

TIME_FILTERS = [
    "this_week", "last_week", "this_month", "last_month",
    "last_3_months", "last_6_months", "this_quarter", "last_quarter",
    "this_year", "last_year", "lifetime",
]

REQUIRED_SUMMARY_KEYS = {
    "time_filter", "total_skus", "total_batches", "total_crates",
    "unallocated_crates", "ready_for_warehouse", "transferred_to_warehouse",
    "total_rejected", "total_rejection_cost", "rejection_events", "rejection_unmapped",
}


@pytest.fixture(scope="session")
def auth_headers():
    r = requests.post(f"{BASE_URL}/api/auth/login",
                      json={"email": EMAIL, "password": PASSWORD},
                      timeout=15)
    assert r.status_code == 200, f"Login failed: {r.status_code} {r.text}"
    tok = r.json().get("session_token") or r.json().get("token") or r.json().get("access_token")
    assert tok, f"No token in response: {r.json()}"
    return {"Authorization": f"Bearer {tok}", "X-Tenant-ID": TENANT_ID}


# ── Time filter coverage ─────────────────────────────────────────────
class TestTimeFilters:
    @pytest.mark.parametrize("tf", TIME_FILTERS)
    def test_dashboard_returns_all_required_summary_fields(self, auth_headers, tf):
        r = requests.get(f"{BASE_URL}/api/production/dashboard",
                         headers=auth_headers, params={"time_filter": tf}, timeout=30)
        assert r.status_code == 200, f"{tf} failed: {r.text[:200]}"
        body = r.json()
        assert "summary" in body and "skus" in body and "rejection_breakdown" in body
        s = body["summary"]
        missing = REQUIRED_SUMMARY_KEYS - set(s.keys())
        assert not missing, f"{tf} missing keys: {missing}"
        assert s["time_filter"] == tf

    def test_lifetime_vs_this_month_differ_or_equal_consistently(self, auth_headers):
        rl = requests.get(f"{BASE_URL}/api/production/dashboard",
                          headers=auth_headers, params={"time_filter": "lifetime"}, timeout=30).json()
        rm = requests.get(f"{BASE_URL}/api/production/dashboard",
                          headers=auth_headers, params={"time_filter": "this_month"}, timeout=30).json()
        # lifetime must be >= this_month
        assert rl["summary"]["total_batches"] >= rm["summary"]["total_batches"]
        assert rl["summary"]["total_crates"] >= rm["summary"]["total_crates"]

    def test_last_year_returns_zero_or_minimal(self, auth_headers):
        r = requests.get(f"{BASE_URL}/api/production/dashboard",
                         headers=auth_headers, params={"time_filter": "last_year"}, timeout=30).json()
        # Spec says zero summary expected
        assert r["summary"]["total_batches"] == 0, f"Expected 0 batches in last_year, got {r['summary']['total_batches']}"
        assert r["summary"]["total_rejection_cost"] == 0
        assert r["summary"]["rejection_events"] == 0


# ── Rejection cost aggregation correctness ───────────────────────────
class TestRejectionCostAggregation:
    def test_lifetime_rejection_breakdown_sorted_desc(self, auth_headers):
        r = requests.get(f"{BASE_URL}/api/production/dashboard",
                         headers=auth_headers, params={"time_filter": "lifetime"}, timeout=30).json()
        bd = r["rejection_breakdown"]
        for key in ("by_reason", "by_stage"):
            costs = [x["cost"] for x in bd.get(key, [])]
            assert costs == sorted(costs, reverse=True), f"{key} not desc-sorted: {costs}"
        top = bd.get("top_skus", [])
        top_costs = [x["rejection_cost"] for x in top]
        assert top_costs == sorted(top_costs, reverse=True)
        assert len(top) <= 5

    def test_total_rejection_cost_equals_sum_by_reason_and_stage(self, auth_headers):
        r = requests.get(f"{BASE_URL}/api/production/dashboard",
                         headers=auth_headers, params={"time_filter": "lifetime"}, timeout=30).json()
        s = r["summary"]
        total = s["total_rejection_cost"]
        by_reason_sum = round(sum(x["cost"] for x in r["rejection_breakdown"]["by_reason"]), 2)
        by_stage_sum = round(sum(x["cost"] for x in r["rejection_breakdown"]["by_stage"]), 2)
        # Allow tiny rounding tolerance
        assert abs(total - by_reason_sum) < 0.5, f"total={total} by_reason_sum={by_reason_sum}"
        assert abs(total - by_stage_sum) < 0.5, f"total={total} by_stage_sum={by_stage_sum}"

    def test_per_sku_rejection_cost_present_and_rounded(self, auth_headers):
        r = requests.get(f"{BASE_URL}/api/production/dashboard",
                         headers=auth_headers, params={"time_filter": "lifetime"}, timeout=30).json()
        for sku in r["skus"]:
            assert "rejection_cost" in sku
            v = sku["rejection_cost"]
            assert isinstance(v, (int, float))
            # Rounded to 2 decimals
            assert round(v, 2) == v

    def test_lifetime_expected_totals(self, auth_headers):
        """Manual verification said lifetime: 28 batches, total_rejection_cost ~ 2548."""
        r = requests.get(f"{BASE_URL}/api/production/dashboard",
                         headers=auth_headers, params={"time_filter": "lifetime"}, timeout=30).json()
        s = r["summary"]
        assert s["total_batches"] >= 1, "Expected non-empty lifetime data"
        assert s["total_rejection_cost"] >= 0


# ── Regression: rejection-report still works ─────────────────────────
class TestRejectionReportRegression:
    def test_rejection_report_returns_cost(self, auth_headers):
        r = requests.get(f"{BASE_URL}/api/production/rejection-report",
                         headers=auth_headers, timeout=30)
        assert r.status_code == 200
        body = r.json()
        assert "rows" in body and "total_cost" in body and "total_rejected" in body
        # Each row should have cost_of_rejection key
        for row in body["rows"][:5]:
            assert "cost_of_rejection" in row


# ── Regression: QC routes / batches CRUD readable ────────────────────
class TestQCRegression:
    def test_qc_routes_list(self, auth_headers):
        r = requests.get(f"{BASE_URL}/api/production/qc-routes", headers=auth_headers, timeout=15)
        assert r.status_code == 200
        assert isinstance(r.json(), list)

    def test_batches_list(self, auth_headers):
        r = requests.get(f"{BASE_URL}/api/production/batches", headers=auth_headers, timeout=15)
        assert r.status_code == 200
        assert isinstance(r.json(), list)

    def test_rejection_cost_mappings_list(self, auth_headers):
        r = requests.get(f"{BASE_URL}/api/production/rejection-cost-mappings", headers=auth_headers, timeout=15)
        assert r.status_code == 200
        assert isinstance(r.json(), list)

    def test_stats(self, auth_headers):
        r = requests.get(f"{BASE_URL}/api/production/stats", headers=auth_headers, timeout=15)
        assert r.status_code == 200
        assert "total_batches" in r.json()
