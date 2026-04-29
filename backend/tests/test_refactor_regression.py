"""Regression tests after server.py refactor.

Verifies that endpoints moved to /app/backend/routes/ (analytics, reports,
daily_status, target_planning, master_locations, proxies, bottle_preview)
plus previously-existing untouched endpoints still return 2xx responses.
"""
import os
from datetime import datetime

import pytest
import requests

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL") or "https://rejection-cost-dash.preview.emergentagent.com"
BASE_URL = BASE_URL.rstrip("/")

ADMIN_EMAIL = "surya.yadavalli@nylaairwater.earth"
ADMIN_PASSWORD = "test123"


@pytest.fixture(scope="session")
def session_token():
    r = requests.post(
        f"{BASE_URL}/api/auth/login",
        json={"email": ADMIN_EMAIL, "password": ADMIN_PASSWORD},
        timeout=30,
    )
    assert r.status_code == 200, f"Login failed: {r.status_code} {r.text[:200]}"
    data = r.json()
    assert "session_token" in data, f"No session_token in response: {data}"
    assert "user" in data
    assert data["user"]["email"] == ADMIN_EMAIL
    return data["session_token"]


@pytest.fixture(scope="session")
def auth_headers(session_token):
    return {"Authorization": f"Bearer {session_token}", "Content-Type": "application/json"}


# ---------- Auth ----------
class TestAuth:
    def test_login_returns_token(self, session_token):
        assert isinstance(session_token, str) and len(session_token) > 10

    def test_auth_me(self, auth_headers):
        r = requests.get(f"{BASE_URL}/api/auth/me", headers=auth_headers, timeout=30)
        assert r.status_code == 200, r.text[:300]
        data = r.json()
        assert data.get("email") == ADMIN_EMAIL


# ---------- Dashboard ----------
class TestDashboard:
    def test_dashboard(self, auth_headers):
        r = requests.get(f"{BASE_URL}/api/dashboard", headers=auth_headers, timeout=30)
        assert r.status_code == 200, r.text[:300]
        assert isinstance(r.json(), (dict, list))


# ---------- Analytics (moved to routes/analytics.py) ----------
class TestAnalytics:
    def test_analytics_dashboard(self, auth_headers):
        r = requests.get(f"{BASE_URL}/api/analytics/dashboard", headers=auth_headers, timeout=30)
        assert r.status_code == 200, r.text[:300]

    def test_pipeline_accounts(self, auth_headers):
        r = requests.get(f"{BASE_URL}/api/analytics/pipeline-accounts", headers=auth_headers, timeout=30)
        assert r.status_code == 200, r.text[:300]

    def test_activity_metrics(self, auth_headers):
        params = {"start_date": "2026-01-01", "end_date": "2026-12-31"}
        r = requests.get(
            f"{BASE_URL}/api/analytics/activity-metrics",
            headers=auth_headers,
            params=params,
            timeout=30,
        )
        assert r.status_code == 200, r.text[:300]


# ---------- Reports (moved to routes/reports.py) ----------
class TestReports:
    def test_sku_performance(self, auth_headers):
        r = requests.get(f"{BASE_URL}/api/reports/sku-performance", headers=auth_headers, timeout=60)
        assert r.status_code == 200, r.text[:300]

    def test_resource_performance(self, auth_headers):
        r = requests.get(f"{BASE_URL}/api/reports/resource-performance", headers=auth_headers, timeout=60)
        assert r.status_code == 200, r.text[:300]

    def test_account_performance(self, auth_headers):
        r = requests.get(f"{BASE_URL}/api/reports/account-performance", headers=auth_headers, timeout=60)
        assert r.status_code == 200, r.text[:300]

    def test_target_resource_allocation(self, auth_headers):
        r = requests.get(f"{BASE_URL}/api/reports/target-resource-allocation", headers=auth_headers, timeout=60)
        assert r.status_code == 200, r.text[:300]

    def test_target_sku_allocation(self, auth_headers):
        r = requests.get(f"{BASE_URL}/api/reports/target-sku-allocation", headers=auth_headers, timeout=60)
        assert r.status_code == 200, r.text[:300]


# ---------- Daily Status (moved to routes/daily_status.py) ----------
class TestDailyStatus:
    def test_list(self, auth_headers):
        r = requests.get(f"{BASE_URL}/api/daily-status", headers=auth_headers, timeout=30)
        assert r.status_code == 200, r.text[:300]

    def test_auto_populate(self, auth_headers):
        today = datetime.utcnow().strftime("%Y-%m-%d")
        r = requests.get(
            f"{BASE_URL}/api/daily-status/auto-populate/{today}", headers=auth_headers, timeout=60
        )
        # 200 or 404 are both acceptable (404 if no data for user that date)
        assert r.status_code in (200, 404), r.text[:300]

    def test_team_rollup(self, auth_headers):
        r = requests.get(f"{BASE_URL}/api/daily-status/team-rollup", headers=auth_headers, timeout=30)
        assert r.status_code == 200, r.text[:300]


# ---------- Target Planning (moved to routes/target_planning.py) ----------
class TestTargetPlanning:
    def test_list(self, auth_headers):
        r = requests.get(f"{BASE_URL}/api/target-planning", headers=auth_headers, timeout=30)
        assert r.status_code == 200, r.text[:300]
        assert isinstance(r.json(), list)

    def test_sales_resources(self, auth_headers):
        r = requests.get(
            f"{BASE_URL}/api/target-planning/resources/sales", headers=auth_headers, timeout=30
        )
        assert r.status_code == 200, r.text[:300]

    def test_detail_and_dashboard(self, auth_headers):
        lst = requests.get(f"{BASE_URL}/api/target-planning", headers=auth_headers, timeout=30).json()
        if not lst:
            pytest.skip("No target planning records to test detail/dashboard")
        tid = lst[0].get("id")
        r = requests.get(f"{BASE_URL}/api/target-planning/{tid}", headers=auth_headers, timeout=30)
        assert r.status_code == 200, r.text[:300]
        r2 = requests.get(
            f"{BASE_URL}/api/target-planning/{tid}/dashboard", headers=auth_headers, timeout=30
        )
        assert r2.status_code == 200, r2.text[:300]


# ---------- Master Locations (moved to routes/master_locations.py) ----------
class TestMasterLocations:
    def test_master_locations(self, auth_headers):
        r = requests.get(f"{BASE_URL}/api/master-locations", headers=auth_headers, timeout=30)
        assert r.status_code == 200, r.text[:300]

    def test_master_locations_flat(self, auth_headers):
        r = requests.get(f"{BASE_URL}/api/master-locations/flat", headers=auth_headers, timeout=30)
        assert r.status_code == 200, r.text[:300]


# ---------- Proxies (moved to routes/proxies.py) ----------
class TestProxies:
    def test_quotes_water(self, auth_headers):
        r = requests.get(f"{BASE_URL}/api/quotes/water", headers=auth_headers, timeout=30)
        # Proxy may return 200 or upstream-derived status
        assert r.status_code in (200, 502, 503), r.text[:200]

    def test_quotes_sales(self, auth_headers):
        r = requests.get(f"{BASE_URL}/api/quotes/sales", headers=auth_headers, timeout=30)
        assert r.status_code in (200, 502, 503), r.text[:200]

    def test_weather(self, auth_headers):
        # Hyderabad coordinates
        params = {"latitude": 17.385, "longitude": 78.4867}
        r = requests.get(
            f"{BASE_URL}/api/weather", headers=auth_headers, params=params, timeout=30
        )
        assert r.status_code in (200, 400, 502, 503), r.text[:200]


# ---------- Bottle Preview (moved to routes/bottle_preview.py) ----------
class TestBottlePreview:
    def test_history(self, auth_headers):
        r = requests.get(f"{BASE_URL}/api/bottle-preview/history", headers=auth_headers, timeout=30)
        assert r.status_code == 200, r.text[:300]


# ---------- Existing untouched endpoints ----------
UNTOUCHED_GET_ENDPOINTS = [
    "/api/accounts",
    "/api/leads",
    "/api/master-skus",
    "/api/meetings",
    "/api/tasks",
    "/api/distributors",
    "/api/users",
    "/api/invoices",
    "/api/leave-requests",
    "/api/travel-requests",
    "/api/budget-requests",
    "/api/expense-requests",
    "/api/production/batches",
    "/api/cost-cards",
    "/api/packaging-types",
    "/api/document-categories",
    "/api/documents",
]


@pytest.mark.parametrize("endpoint", UNTOUCHED_GET_ENDPOINTS)
def test_untouched_endpoints(endpoint, auth_headers):
    r = requests.get(f"{BASE_URL}{endpoint}", headers=auth_headers, timeout=45)
    assert r.status_code == 200, f"{endpoint} -> {r.status_code}: {r.text[:200]}"


def test_cogs_by_city(auth_headers):
    # Fetch a distributor's city dynamically to avoid hardcoding
    r = requests.get(f"{BASE_URL}/api/distributors", headers=auth_headers, timeout=30)
    assert r.status_code == 200
    dists = r.json()
    city = None
    if isinstance(dists, list):
        for d in dists:
            if d.get("city"):
                city = d["city"]
                break
    if not city:
        city = "Hyderabad"
    r2 = requests.get(f"{BASE_URL}/api/cogs/{city}", headers=auth_headers, timeout=30)
    # 200 if data exists, 404 if none for that city - both acceptable post-refactor
    assert r2.status_code in (200, 404), f"/api/cogs/{city} -> {r2.status_code}: {r2.text[:200]}"
