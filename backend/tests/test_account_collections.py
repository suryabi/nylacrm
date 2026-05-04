"""Backend tests for the Top-10 Priorities → Collections / Outstanding sub-tab.

Endpoint under test:
  GET /api/performance/account-collections?resource_ids=&time_filter=
"""
import os
import pytest
import requests

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "").rstrip("/")
TENANT_ID = "nyla-air-water"
EMAIL = "surya.yadavalli@nylaairwater.earth"
PASSWORD = "test123"

EXPECTED_ROW_FIELDS = {
    "account_id", "account_name", "account_type", "territory", "state", "city",
    "gross_invoice_total", "net_invoice_total", "bottle_credit", "contribution_pct",
    "average_order_amount", "outstanding_balance", "overdue_amount",
    "last_payment_amount", "last_payment_date", "invoice_count",
}
EXPECTED_SUMMARY_FIELDS = {
    "account_count", "total_gross", "total_net", "total_bottle_credit",
    "total_outstanding", "total_overdue", "average_order_amount", "total_invoice_count",
}
VALID_TIME_FILTERS = ["lifetime", "this_month", "last_month", "this_quarter", "this_year"]


# ── Fixtures ──────────────────────────────────────────────────────────────────
@pytest.fixture(scope="module")
def auth_session():
    assert BASE_URL, "REACT_APP_BACKEND_URL must be set"
    s = requests.Session()
    s.headers.update({"Content-Type": "application/json", "X-Tenant-ID": TENANT_ID})
    r = s.post(f"{BASE_URL}/api/auth/login", json={"email": EMAIL, "password": PASSWORD})
    if r.status_code != 200:
        pytest.skip(f"Login failed {r.status_code}: {r.text[:200]}")
    data = r.json()
    token = data.get("session_token") or data.get("token") or data.get("access_token")
    if not token:
        pytest.skip(f"No token in login response: {data}")
    s.headers.update({"Authorization": f"Bearer {token}"})
    s._user = data.get("user") or {}
    return s


@pytest.fixture(scope="module")
def me(auth_session):
    r = auth_session.get(f"{BASE_URL}/api/auth/me")
    assert r.status_code == 200, r.text
    return r.json()


@pytest.fixture(scope="module")
def user_id(me, auth_session):
    uid = me.get("id") or auth_session._user.get("id")
    assert uid, "Unable to resolve current user id"
    return uid


def _get(auth_session, **params):
    return auth_session.get(f"{BASE_URL}/api/performance/account-collections", params=params)


# ── Auth ──────────────────────────────────────────────────────────────────────
class TestAuth:
    def test_unauthenticated_blocked(self):
        r = requests.get(
            f"{BASE_URL}/api/performance/account-collections",
            params={"resource_ids": "", "time_filter": "lifetime"},
        )
        assert r.status_code in (401, 403)


# ── Shape ─────────────────────────────────────────────────────────────────────
class TestResponseShape:
    def test_top_level_shape(self, auth_session, user_id):
        r = _get(auth_session, resource_ids=user_id, time_filter="lifetime")
        assert r.status_code == 200, r.text
        data = r.json()
        assert data["time_filter"] == "lifetime"
        assert isinstance(data["resource_ids"], list)
        assert data["resource_ids"] == [user_id]
        assert isinstance(data["accounts"], list)
        assert isinstance(data["summary"], dict)

    def test_summary_has_all_required_fields(self, auth_session, user_id):
        r = _get(auth_session, resource_ids=user_id, time_filter="lifetime")
        assert r.status_code == 200
        summary = r.json()["summary"]
        missing = EXPECTED_SUMMARY_FIELDS - set(summary.keys())
        assert not missing, f"Missing summary fields: {missing}"

    def test_account_count_matches_accounts_length(self, auth_session, user_id):
        r = _get(auth_session, resource_ids=user_id, time_filter="lifetime")
        body = r.json()
        assert body["summary"]["account_count"] == len(body["accounts"])

    def test_row_has_all_required_fields(self, auth_session, user_id):
        r = _get(auth_session, resource_ids=user_id, time_filter="lifetime")
        rows = r.json()["accounts"]
        if not rows:
            pytest.skip("No accounts assigned to current user")
        missing = EXPECTED_ROW_FIELDS - set(rows[0].keys())
        assert not missing, f"Missing row fields: {missing}"

    def test_no_mongo_id_leaks(self, auth_session, user_id):
        r = _get(auth_session, resource_ids=user_id, time_filter="lifetime")
        body = r.json()
        for row in body["accounts"]:
            assert "_id" not in row


# ── Resource filtering ────────────────────────────────────────────────────────
class TestResourceFilter:
    def test_filter_by_resource_returns_only_assigned(self, auth_session, user_id):
        r = _get(auth_session, resource_ids=user_id, time_filter="lifetime")
        assert r.status_code == 200
        for row in r.json()["accounts"]:
            # assigned_to may not be in returned shape, but the endpoint must have filtered
            # Verify no other resource ID present
            if "assigned_to" in row and row["assigned_to"]:
                assert row["assigned_to"] == user_id

    def test_empty_resource_returns_all_for_tenant(self, auth_session, user_id):
        r_all = _get(auth_session, resource_ids="", time_filter="lifetime")
        r_one = _get(auth_session, resource_ids=user_id, time_filter="lifetime")
        assert r_all.status_code == 200 and r_one.status_code == 200
        assert r_all.json()["summary"]["account_count"] >= r_one.json()["summary"]["account_count"]
        assert r_all.json()["resource_ids"] == []

    def test_unknown_resource_returns_empty(self, auth_session):
        r = _get(auth_session, resource_ids="not-a-real-uuid-zzz", time_filter="lifetime")
        assert r.status_code == 200
        body = r.json()
        assert body["summary"]["account_count"] == 0
        assert body["accounts"] == []
        assert body["summary"]["total_gross"] == 0
        assert body["summary"]["total_outstanding"] == 0


# ── Time filter ──────────────────────────────────────────────────────────────
class TestTimeFilter:
    @pytest.mark.parametrize("tf", VALID_TIME_FILTERS)
    def test_all_time_filters_supported(self, auth_session, user_id, tf):
        r = _get(auth_session, resource_ids=user_id, time_filter=tf)
        assert r.status_code == 200, f"{tf} failed: {r.text[:200]}"
        assert r.json()["time_filter"] == tf

    def test_account_list_unchanged_across_filters(self, auth_session, user_id):
        """Time filter only narrows invoice aggregation, not the account list."""
        counts = []
        for tf in VALID_TIME_FILTERS:
            r = _get(auth_session, resource_ids=user_id, time_filter=tf)
            assert r.status_code == 200
            counts.append(r.json()["summary"]["account_count"])
        assert len(set(counts)) == 1, f"Account counts varied across time_filter values: {counts}"

    def test_lifetime_gross_ge_this_month_gross(self, auth_session, user_id):
        r_life = _get(auth_session, resource_ids=user_id, time_filter="lifetime").json()
        r_mo = _get(auth_session, resource_ids=user_id, time_filter="this_month").json()
        assert r_life["summary"]["total_gross"] >= r_mo["summary"]["total_gross"] - 0.01


# ── Sorting & totals ──────────────────────────────────────────────────────────
class TestSortingAndTotals:
    def test_rows_sorted_by_outstanding_desc_then_gross_desc(self, auth_session):
        r = _get(auth_session, resource_ids="", time_filter="lifetime")
        rows = r.json()["accounts"]
        if len(rows) < 2:
            pytest.skip("Not enough accounts to test sort")
        for i in range(len(rows) - 1):
            a, b = rows[i], rows[i + 1]
            if (a["outstanding_balance"] or 0) == (b["outstanding_balance"] or 0):
                assert (a["gross_invoice_total"] or 0) >= (b["gross_invoice_total"] or 0)
            else:
                assert (a["outstanding_balance"] or 0) > (b["outstanding_balance"] or 0)

    def test_summary_outstanding_equals_sum_of_rows(self, auth_session, user_id):
        r = _get(auth_session, resource_ids=user_id, time_filter="lifetime")
        body = r.json()
        rows_sum = round(sum(row["outstanding_balance"] for row in body["accounts"]), 2)
        assert body["summary"]["total_outstanding"] == pytest.approx(rows_sum, abs=0.01)

    def test_summary_gross_equals_sum_of_rows(self, auth_session, user_id):
        r = _get(auth_session, resource_ids=user_id, time_filter="lifetime")
        body = r.json()
        rows_sum = round(sum(row["gross_invoice_total"] for row in body["accounts"]), 2)
        assert body["summary"]["total_gross"] == pytest.approx(rows_sum, abs=0.01)

    def test_summary_total_invoice_count_equals_sum(self, auth_session, user_id):
        r = _get(auth_session, resource_ids=user_id, time_filter="lifetime")
        body = r.json()
        rows_sum = sum(row["invoice_count"] for row in body["accounts"])
        assert body["summary"]["total_invoice_count"] == rows_sum

    def test_average_order_amount_consistent(self, auth_session):
        r = _get(auth_session, resource_ids="", time_filter="lifetime")
        body = r.json()
        s = body["summary"]
        if s["total_invoice_count"] > 0:
            expected = round(s["total_gross"] / s["total_invoice_count"], 2)
            assert s["average_order_amount"] == pytest.approx(expected, abs=0.01)
        else:
            assert s["average_order_amount"] == 0
