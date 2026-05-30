"""
Iteration 189 — Revenue Analytics dashboard endpoints.

Source of truth = `invoices` collection (Zoho + EBE), tenant-scoped via
get_tdb(). Two endpoints under /api/reports/*:
  • GET /reports/revenue-analytics  — grouped totals for one time window.
  • GET /reports/revenue-compare    — month A vs month B paired by group label.

Numbers must reconcile with the trusted Account-Performance report (same
_gross/_net helpers, same invoice→account matching).
"""
import os

import pytest
import requests
from dotenv import load_dotenv

load_dotenv("/app/backend/.env")

BASE_URL = os.environ.get(
    "REACT_APP_BACKEND_URL",
    "https://stock-analytics-pro-3.preview.emergentagent.com",
).rstrip("/")
ADMIN_EMAIL = "surya.yadavalli@nylaairwater.earth"
ADMIN_PASS = "test123"


def _login():
    r = requests.post(
        f"{BASE_URL}/api/auth/login",
        json={"email": ADMIN_EMAIL, "password": ADMIN_PASS},
        timeout=20,
    )
    if r.status_code != 200:
        pytest.skip(f"Login failed: {r.status_code}")
    return r.json()["session_token"]


@pytest.fixture(scope="module")
def token():
    return _login()


def _auth(t):
    return {"Authorization": f"Bearer {t}"}


def _ra(t, **params):
    return requests.get(
        f"{BASE_URL}/api/reports/revenue-analytics",
        headers=_auth(t), params=params, timeout=30,
    )


def _rc(t, **params):
    return requests.get(
        f"{BASE_URL}/api/reports/revenue-compare",
        headers=_auth(t), params=params, timeout=30,
    )


# ───────────────────────────── auth ─────────────────────────────
def test_requires_auth():
    r = requests.get(f"{BASE_URL}/api/reports/revenue-analytics", timeout=20)
    assert r.status_code in (401, 403), r.status_code


# ──────────────────────── analytics shape ───────────────────────
@pytest.mark.parametrize("group_by", ["city", "state", "territory", "business_category", "sku"])
def test_analytics_each_group_by(token, group_by):
    r = _ra(token, time_filter="all_time", group_by=group_by, top_n=15)
    assert r.status_code == 200, r.text
    body = r.json()
    assert body["group_by"] == group_by
    assert "groups" in body and isinstance(body["groups"], list)
    assert "total_revenue" in body
    assert "total_gross" in body
    assert "total_invoice_count" in body
    for g in body["groups"]:
        assert {"label", "revenue", "count"} <= set(g.keys())


def test_analytics_totals_match_sum_of_groups(token):
    """Sum of every group's revenue == total_revenue (no silent drops)."""
    r = _ra(token, time_filter="all_time", group_by="city", top_n=200)
    assert r.status_code == 200, r.text
    body = r.json()
    summed = round(sum(g["revenue"] for g in body["groups"]), 2)
    assert summed == round(body["total_revenue"], 2)


def test_analytics_custom_requires_dates(token):
    r = _ra(token, time_filter="custom", group_by="city")
    assert r.status_code == 400, r.text


def test_analytics_custom_window(token):
    r = _ra(token, time_filter="custom", group_by="city",
            from_date="2026-01-01", to_date="2026-12-31")
    assert r.status_code == 200, r.text
    assert r.json()["from"] == "2026-01-01"
    assert r.json()["to"] == "2026-12-31"


def test_analytics_top_n_others_bucket(token):
    """top_n=1 must collapse the tail into a single Others row when >1 group."""
    full = _ra(token, time_filter="all_time", group_by="city", top_n=200).json()
    if full["raw_group_count"] <= 1:
        pytest.skip("Not enough distinct groups to exercise Others bucket")
    r = _ra(token, time_filter="all_time", group_by="city", top_n=1)
    assert r.status_code == 200
    groups = r.json()["groups"]
    assert any(g.get("is_others") for g in groups)
    # Grand total preserved regardless of top_n.
    assert round(r.json()["total_revenue"], 2) == round(full["total_revenue"], 2)


# ──────────────────────── compare shape ─────────────────────────
def test_compare_shape(token):
    r = _rc(token, period_a_year=2026, period_a_month=3,
            period_b_year=2026, period_b_month=4, group_by="city")
    assert r.status_code == 200, r.text
    body = r.json()
    assert set(["period_a", "period_b", "delta", "delta_pct", "rows"]) <= set(body.keys())
    assert body["period_a"]["month"] == 3
    assert body["period_b"]["month"] == 4
    for row in body["rows"]:
        assert {"label", "a_revenue", "b_revenue", "delta", "delta_pct"} <= set(row.keys())


def test_compare_delta_math(token):
    r = _rc(token, period_a_year=2026, period_a_month=3,
            period_b_year=2026, period_b_month=4, group_by="city")
    body = r.json()
    a = body["period_a"]["total"]
    b = body["period_b"]["total"]
    assert round(body["delta"], 2) == round(b - a, 2)


def test_compare_group_by_total(token):
    r = _rc(token, period_a_year=2026, period_a_month=3,
            period_b_year=2026, period_b_month=4, group_by="total")
    assert r.status_code == 200, r.text
    assert r.json()["group_by"] == "total"


def test_compare_invalid_month(token):
    r = _rc(token, period_a_year=2026, period_a_month=13,
            period_b_year=2026, period_b_month=4)
    assert r.status_code == 422, r.text
