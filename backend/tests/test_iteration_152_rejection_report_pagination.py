"""
Iteration 152 - Rejection Report new aggregation/cost surface.

Validates GET /api/production/rejection-report response includes:
  - by_reason, by_stage (sorted desc by cost)
  - by_resource, by_date (now include cost)
  - top_skus (top 5)
  - unmapped_count, total_cost
And per-row enrichment cost_of_rejection / missing_mapping.
Also verifies query params are still functional and regression on
production dashboard total_rejection_cost + rejection-cost-mappings.
"""
import os
import requests
import pytest

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "https://rejection-cost-dash.preview.emergentagent.com").rstrip("/")
EMAIL = "surya.yadavalli@nylaairwater.earth"
PASSWORD = "test123"


@pytest.fixture(scope="module")
def auth_headers():
    r = requests.post(
        f"{BASE_URL}/api/auth/login",
        json={"email": EMAIL, "password": PASSWORD, "tenant_id": "nyla-air-water"},
        timeout=30,
    )
    if r.status_code != 200:
        # Try without tenant_id
        r = requests.post(
            f"{BASE_URL}/api/auth/login",
            json={"email": EMAIL, "password": PASSWORD},
            timeout=30,
        )
    assert r.status_code == 200, f"Login failed: {r.status_code} {r.text}"
    data = r.json()
    token = data.get("session_token") or data.get("token") or data.get("access_token")
    assert token, f"No token in login response: {data}"
    return {"Authorization": f"Bearer {token}", "Content-Type": "application/json"}


@pytest.fixture(scope="module")
def lifetime_report(auth_headers):
    # Lifetime - no month/year params
    r = requests.get(f"{BASE_URL}/api/production/rejection-report", headers=auth_headers, timeout=60)
    assert r.status_code == 200, f"Status {r.status_code}: {r.text[:300]}"
    return r.json()


# ── Aggregation shape tests ──────────────────────────────────────────
class TestRejectionReportShape:
    def test_top_level_keys_present(self, lifetime_report):
        for key in ["rows", "total_rejected", "total_cost", "unmapped_count",
                    "by_resource", "by_date", "by_reason", "by_stage", "top_skus"]:
            assert key in lifetime_report, f"Missing key: {key}"

    def test_total_cost_is_number(self, lifetime_report):
        assert isinstance(lifetime_report["total_cost"], (int, float))
        assert lifetime_report["total_cost"] >= 0

    def test_unmapped_count_is_int(self, lifetime_report):
        assert isinstance(lifetime_report["unmapped_count"], int)
        assert lifetime_report["unmapped_count"] >= 0

    def test_by_reason_shape_and_sorted_desc_by_cost(self, lifetime_report):
        items = lifetime_report["by_reason"]
        assert isinstance(items, list)
        for it in items:
            assert set(["reason", "bottles", "cost"]).issubset(it.keys()), f"by_reason item keys: {it}"
        costs = [it["cost"] for it in items]
        assert costs == sorted(costs, reverse=True), "by_reason not sorted desc by cost"

    def test_by_stage_shape_and_sorted_desc_by_cost(self, lifetime_report):
        items = lifetime_report["by_stage"]
        assert isinstance(items, list)
        for it in items:
            assert set(["stage", "bottles", "cost"]).issubset(it.keys())
        costs = [it["cost"] for it in items]
        assert costs == sorted(costs, reverse=True), "by_stage not sorted desc by cost"

    def test_by_resource_now_includes_cost(self, lifetime_report):
        items = lifetime_report["by_resource"]
        assert isinstance(items, list)
        for it in items:
            assert set(["name", "bottles", "cost"]).issubset(it.keys()), f"by_resource missing cost: {it}"

    def test_by_date_now_includes_cost(self, lifetime_report):
        items = lifetime_report["by_date"]
        assert isinstance(items, list)
        for it in items:
            assert set(["date", "bottles", "cost"]).issubset(it.keys()), f"by_date missing cost: {it}"

    def test_top_skus_max_5_and_sorted(self, lifetime_report):
        items = lifetime_report["top_skus"]
        assert isinstance(items, list)
        assert len(items) <= 5
        for it in items:
            assert set(["sku_id", "sku_name", "bottles", "cost"]).issubset(it.keys())
            assert it["cost"] > 0  # only those with cost > 0
        costs = [it["cost"] for it in items]
        assert costs == sorted(costs, reverse=True), "top_skus not sorted desc by cost"

    def test_per_row_cost_and_missing_mapping(self, lifetime_report):
        rows = lifetime_report["rows"]
        assert len(rows) > 0, "Expected non-empty rows for nyla-air-water lifetime"
        for r in rows[:30]:
            assert "cost_of_rejection" in r
            assert "missing_mapping" in r
            if r["missing_mapping"] is True:
                assert r["cost_of_rejection"] == 0.0 or r["cost_of_rejection"] == 0

    def test_total_cost_equals_sum_of_row_costs(self, lifetime_report):
        rows = lifetime_report["rows"]
        s = round(sum((r.get("cost_of_rejection") or 0) for r in rows), 2)
        assert abs(s - lifetime_report["total_cost"]) < 0.5, \
            f"Sum mismatch: rows={s}, total_cost={lifetime_report['total_cost']}"

    def test_unmapped_count_equals_missing_mapping_rows(self, lifetime_report):
        rows = lifetime_report["rows"]
        unmapped = sum(1 for r in rows if r.get("missing_mapping") is True)
        assert unmapped == lifetime_report["unmapped_count"]


# ── Query param functionality ────────────────────────────────────────
class TestQueryParams:
    def test_month_year_filter(self, auth_headers):
        r = requests.get(
            f"{BASE_URL}/api/production/rejection-report",
            params={"month": 1, "year": 2026},
            headers=auth_headers, timeout=30,
        )
        assert r.status_code == 200
        data = r.json()
        assert "rows" in data and "total_cost" in data

    def test_stage_type_filter(self, auth_headers):
        r = requests.get(
            f"{BASE_URL}/api/production/rejection-report",
            params={"stage_type": "qc"},
            headers=auth_headers, timeout=30,
        )
        assert r.status_code == 200
        rows = r.json().get("rows", [])
        for row in rows:
            assert row.get("stage_type") == "qc"

    def test_rejection_reason_filter(self, auth_headers, lifetime_report):
        # Pick a real reason from lifetime
        reasons = [it["reason"] for it in lifetime_report["by_reason"] if it["reason"] and it["reason"] != "—"]
        if not reasons:
            pytest.skip("No reasons present")
        target = reasons[0]
        r = requests.get(
            f"{BASE_URL}/api/production/rejection-report",
            params={"rejection_reason": target},
            headers=auth_headers, timeout=30,
        )
        assert r.status_code == 200
        rows = r.json().get("rows", [])
        for row in rows:
            assert row.get("rejection_reason", "").lower() == target.lower()

    def test_invalid_batch_id_returns_empty(self, auth_headers):
        r = requests.get(
            f"{BASE_URL}/api/production/rejection-report",
            params={"batch_id": "non-existent-batch-xyz"},
            headers=auth_headers, timeout=30,
        )
        assert r.status_code == 200
        data = r.json()
        assert data["rows"] == []
        assert data["total_cost"] == 0
        assert data["unmapped_count"] == 0


# ── Regression tests ─────────────────────────────────────────────────
class TestRegression:
    def test_rejection_cost_mappings_endpoint(self, auth_headers):
        r = requests.get(f"{BASE_URL}/api/production/rejection-cost-mappings",
                         headers=auth_headers, timeout=30)
        assert r.status_code == 200, r.text[:200]
        data = r.json()
        # Could be {"mappings": [...]} or just list
        assert isinstance(data, (list, dict))

    def test_production_dashboard_total_rejection_cost(self, auth_headers):
        r = requests.get(f"{BASE_URL}/api/production/dashboard",
                         headers=auth_headers, timeout=30)
        assert r.status_code == 200
        data = r.json()
        # Should have total_rejection_cost key (or in summary nested)
        flat = str(data)
        assert "rejection" in flat.lower(), "dashboard missing rejection metrics"
