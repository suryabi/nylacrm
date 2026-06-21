"""
Iteration 191 — Account-detail "Invoice Summary (This Month)" must use the
TENANT timezone (Asia/Kolkata), not UTC.

Bug (production): current-month invoices vanished from the account page near
month boundaries. `get_account_invoices` computed the this_month/this_week
window from `datetime.now(timezone.utc)`. For India users, UTC can still be in
the PREVIOUS month until 05:30 IST, so an invoice dated today (IST) fell
outside the (wrong) UTC window → "No invoices found for this month".

Fix: compute `now` in the tenant timezone (default Asia/Kolkata) before
building the date window — consistent with the rest of the app (server.py:5189).
"""
import os
from datetime import datetime, timezone
from zoneinfo import ZoneInfo

import pytest
import requests
from dotenv import load_dotenv

load_dotenv("/app/backend/.env")

BASE_URL = os.environ.get(
    "REACT_APP_BACKEND_URL",
    "https://supply-chain-hub-219.preview.emergentagent.com",
).rstrip("/")
ADMIN_EMAIL = "surya.yadavalli@nylaairwater.earth"
ADMIN_PASS = "test123"
# Account "Toopa Ice-creamery" — has invoices dated 2026-05-13 (x2) and 2026-05-16.
TOOPA_ACCOUNT = "81263309-2118-4d51-b1d9-fe9549da07b7"


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


# ── Pure-logic test of the window computation (the heart of the fix) ──
def _this_month_window(now):
    start_str = now.replace(day=1).strftime("%Y-%m-%d")
    end_str = now.replace(hour=23, minute=59, second=59).strftime("%Y-%m-%d") + "T23:59:59"
    return start_str, end_str


def test_utc_window_drops_boundary_invoice_but_ist_keeps_it():
    """At 03:00 IST on the 1st, UTC is still last month; IST is correct."""
    real_utc = datetime(2026, 5, 31, 21, 30, tzinfo=timezone.utc)  # = 2026-06-01 03:00 IST
    inv_date = "2026-06-01"  # invoice created "today" in IST

    s_utc, e_utc = _this_month_window(real_utc)
    assert not (s_utc <= inv_date <= e_utc), "UTC window wrongly includes/excludes"
    assert s_utc == "2026-05-01"  # UTC thinks it is still May → bug

    ist = real_utc.astimezone(ZoneInfo("Asia/Kolkata"))
    s_ist, e_ist = _this_month_window(ist)
    assert s_ist == "2026-06-01"  # IST correctly in June
    assert s_ist <= inv_date <= e_ist  # boundary invoice now included


# ── Live regression: the endpoint returns this-month invoices ──
def test_endpoint_returns_this_month_invoices(token):
    r = requests.get(
        f"{BASE_URL}/api/accounts/{TOOPA_ACCOUNT}/invoices",
        headers={"Authorization": f"Bearer {token}"},
        params={"page": 1, "limit": 5, "time_filter": "this_month"},
        timeout=30,
    )
    assert r.status_code == 200, r.text
    body = r.json()
    # Preview server clock is mid-May 2026; Toopa has 3 May invoices.
    assert body.get("total", 0) >= 1, body
    assert "pages" in body and "total" in body


def test_lifetime_superset_of_this_month(token):
    h = {"Authorization": f"Bearer {token}"}
    tm = requests.get(f"{BASE_URL}/api/accounts/{TOOPA_ACCOUNT}/invoices",
                      headers=h, params={"time_filter": "this_month", "limit": 100}, timeout=30).json()
    lt = requests.get(f"{BASE_URL}/api/accounts/{TOOPA_ACCOUNT}/invoices",
                      headers=h, params={"time_filter": "lifetime", "limit": 100}, timeout=30).json()
    assert lt.get("total", 0) >= tm.get("total", 0)
