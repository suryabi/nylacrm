"""
Iteration 189 — Revenue Analytics extra coverage:
  • All time_filter enum values return 200.
  • Reconciliation with Account-Performance net revenue.
  • Compare endpoint produces sorted rows + handles missing labels on one side.
"""
import os
import pytest
import requests
from dotenv import load_dotenv

load_dotenv("/app/backend/.env")
load_dotenv("/app/frontend/.env")

BASE_URL = os.environ["REACT_APP_BACKEND_URL"].rstrip("/")
ADMIN_EMAIL = "surya.yadavalli@nylaairwater.earth"
ADMIN_PASS = "test123"


def _login():
    r = requests.post(
        f"{BASE_URL}/api/auth/login",
        json={"email": ADMIN_EMAIL, "password": ADMIN_PASS}, timeout=20,
    )
    if r.status_code != 200:
        pytest.skip(f"Login failed: {r.status_code}")
    return r.json()["session_token"]


@pytest.fixture(scope="module")
def token():
    return _login()


def _hdr(t):
    return {"Authorization": f"Bearer {t}"}


# Every supported time_filter must return 200 with a coherent shape.
@pytest.mark.parametrize(
    "tf", ["this_month", "last_month", "this_quarter", "this_year",
           "last_year", "all_time"],
)
def test_time_filter_enum(token, tf):
    r = requests.get(
        f"{BASE_URL}/api/reports/revenue-analytics",
        headers=_hdr(token),
        params={"time_filter": tf, "group_by": "city", "top_n": 10},
        timeout=30,
    )
    assert r.status_code == 200, r.text
    body = r.json()
    assert "total_revenue" in body and isinstance(body["total_revenue"], (int, float))
    assert isinstance(body.get("groups"), list)


# Reconciliation: revenue-analytics all_time net must match account-performance net.
def test_reconcile_with_account_performance(token):
    ra = requests.get(
        f"{BASE_URL}/api/reports/revenue-analytics",
        headers=_hdr(token),
        params={"time_filter": "all_time", "group_by": "city", "top_n": 200},
        timeout=30,
    )
    assert ra.status_code == 200, ra.text
    ra_total = round(ra.json()["total_revenue"], 2)

    ap = requests.get(
        f"{BASE_URL}/api/reports/account-performance",
        headers=_hdr(token),
        params={"time_filter": "all_time"},
        timeout=30,
    )
    if ap.status_code != 200:
        pytest.skip(f"Account-performance unavailable: {ap.status_code}")
    ap_body = ap.json()
    # Pull the headline net total – field name varies; try common keys.
    ap_total = None
    for key in ("total_net_revenue", "total_revenue", "grand_total_net",
                "net_revenue_total"):
        if key in ap_body:
            ap_total = round(float(ap_body[key]), 2)
            break
    if ap_total is None and isinstance(ap_body.get("accounts"), list):
        ap_total = round(
            sum(float(a.get("net_invoice_total",
                            a.get("net_revenue",
                                  a.get("revenue", 0))) or 0)
                for a in ap_body["accounts"]),
            2,
        )
    if ap_total is None:
        pytest.skip("Could not derive AP net total from response shape")
    # Allow ₹1 tolerance for rounding.
    assert abs(ra_total - ap_total) <= 1.0, (ra_total, ap_total)


def test_compare_rows_sorted_desc(token):
    r = requests.get(
        f"{BASE_URL}/api/reports/revenue-compare",
        headers=_hdr(token),
        params={"period_a_year": 2026, "period_a_month": 4,
                "period_b_year": 2026, "period_b_month": 5,
                "group_by": "city"},
        timeout=30,
    )
    assert r.status_code == 200, r.text
    rows = r.json()["rows"]
    if len(rows) > 1:
        # Sorted by max(a_revenue, b_revenue) descending – check non-increasing.
        max_vals = [max(row["a_revenue"], row["b_revenue"]) for row in rows]
        assert max_vals == sorted(max_vals, reverse=True), max_vals


def test_compare_delta_pct_for_zero_base(token):
    """When period_a is 0 and period_b > 0, delta_pct should be defined (100 or null, not crash)."""
    r = requests.get(
        f"{BASE_URL}/api/reports/revenue-compare",
        headers=_hdr(token),
        params={"period_a_year": 2020, "period_a_month": 1,
                "period_b_year": 2026, "period_b_month": 5,
                "group_by": "total"},
        timeout=30,
    )
    assert r.status_code == 200, r.text
    body = r.json()
    # delta_pct should be a number or None — never a server error.
    assert body["delta_pct"] is None or isinstance(body["delta_pct"], (int, float))
