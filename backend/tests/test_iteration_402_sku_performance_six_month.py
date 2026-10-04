"""Iteration 402: six-month SKU performance API + legacy contract regression tests."""

from datetime import datetime, timezone
from pathlib import Path
import sys

import pytest
import requests

sys.path.append("/app/backend")
from services.sku_performance_six_month import _line_crates


# Modules/features: auth bootstrap, six-month SKU report math/filters, legacy SKU endpoint contract


def _read_frontend_base_url() -> str:
    env_path = Path("/app/frontend/.env")
    for raw in env_path.read_text().splitlines():
        line = raw.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        key, value = line.split("=", 1)
        if key.strip() == "REACT_APP_BACKEND_URL":
            parsed = value.strip().strip('"').strip("'")
            if not parsed:
                raise RuntimeError("REACT_APP_BACKEND_URL is empty in frontend/.env")
            return parsed.rstrip("/")
    raise RuntimeError("REACT_APP_BACKEND_URL missing in frontend/.env")


BASE_URL = _read_frontend_base_url()
TENANT = "nyla-air-water"
ADMIN_EMAIL = "surya.yadavalli@nylaairwater.earth"
ADMIN_PASSWORD = "test123"


@pytest.fixture(scope="module")
def session() -> requests.Session:
    s = requests.Session()
    s.headers.update({"Content-Type": "application/json", "X-Tenant-ID": TENANT})
    login = s.post(
        f"{BASE_URL}/api/auth/login",
        json={"email": ADMIN_EMAIL, "password": ADMIN_PASSWORD},
        headers={"X-Tenant-ID": TENANT},
        timeout=30,
    )
    assert login.status_code == 200, f"login failed: {login.status_code} {login.text[:300]}"
    payload = login.json()
    token = payload.get("token") or payload.get("session_token") or payload.get("access_token")
    if token:
        s.headers.update({"Authorization": f"Bearer {token}"})
    return s


def _get_six_month(session: requests.Session, **params) -> dict:
    response = session.get(f"{BASE_URL}/api/reports/sku-performance-six-month", params=params, timeout=45)
    assert response.status_code == 200, f"params={params} -> {response.status_code} {response.text[:400]}"
    return response.json()


def _sum_months(months: list, field: str):
    return sum((m.get(field) or 0) for m in months)


def test_six_month_window_and_period_label(session):
    data = _get_six_month(session)
    months = data.get("months") or []
    assert len(months) == 6
    keys = [m.get("key") for m in months]
    assert keys == sorted(keys), f"month keys not chronological: {keys}"
    now_key = datetime.now(timezone.utc).strftime("%Y-%m")
    assert keys[-1] == now_key, f"last key should be current month {now_key}, got {keys[-1]}"
    assert "–" in (data.get("period_label") or "")
    assert months[-1].get("current") is True


def test_per_sku_month_totals_and_accounts_reconcile(session):
    data = _get_six_month(session)
    for row in data.get("skus") or []:
        months = row.get("months") or []
        assert len(months) == 6, f"{row.get('sku')} does not have 6 months"
        assert _sum_months(months, "units") == row.get("units_sold", 0)
        assert round(_sum_months(months, "revenue"), 2) == round(row.get("achieved_revenue", 0), 2)
        assert round(_sum_months(months, "crates"), 2) == round(row.get("crates_sold", 0), 2)

        accounts = row.get("accounts") or []
        assert len(accounts) == row.get("accounts_count", 0)
        if accounts:
            units_list = [a.get("units", 0) for a in accounts]
            assert units_list == sorted(units_list, reverse=True)

            acc_units = sum(a.get("units", 0) for a in accounts)
            acc_revenue = round(sum(a.get("revenue", 0) for a in accounts), 2)
            assert acc_units == row.get("units_sold", 0)
            assert acc_revenue == round(row.get("achieved_revenue", 0), 2)

            for acc in accounts:
                acc_months = acc.get("months") or []
                assert len(acc_months) == 6
                assert sum(m.get("units", 0) for m in acc_months) == acc.get("units", 0)
                assert round(sum(m.get("revenue", 0) for m in acc_months), 2) == round(acc.get("revenue", 0), 2)


def test_summary_reconciles_with_sku_rows(session):
    data = _get_six_month(session)
    skus = data.get("skus") or []
    summary = data.get("summary") or {}

    sum_units = sum(r.get("units_sold", 0) for r in skus)
    sum_revenue = round(sum(r.get("achieved_revenue", 0) for r in skus), 2)
    sum_crates = round(sum(r.get("crates_sold", 0) for r in skus), 2)
    active_skus = sum(1 for r in skus if (r.get("units_sold") or 0) > 0 or (r.get("achieved_revenue") or 0) > 0)
    distinct_accounts = len({a.get("key") for r in skus for a in (r.get("accounts") or [])})

    assert summary.get("total_units", 0) == sum_units
    assert round(summary.get("total_revenue", 0), 2) == sum_revenue
    assert round(summary.get("total_crates", 0), 2) == sum_crates
    assert summary.get("active_skus", 0) == active_skus
    assert summary.get("total_accounts", 0) == distinct_accounts

    current_units = sum(r.get("current_month_units", 0) for r in skus)
    previous_units = sum(r.get("previous_month_units", 0) for r in skus)
    current_revenue = round(sum(r.get("current_month_revenue", 0) for r in skus), 2)
    previous_revenue = round(sum(r.get("previous_month_revenue", 0) for r in skus), 2)

    assert summary.get("current_month_units", 0) == current_units
    assert summary.get("previous_month_units", 0) == previous_units
    assert summary.get("mom_units_change", 0) == (current_units - previous_units)
    assert round(summary.get("current_month_revenue", 0), 2) == current_revenue
    assert round(summary.get("previous_month_revenue", 0), 2) == previous_revenue
    assert round(summary.get("mom_revenue_change", 0), 2) == round(current_revenue - previous_revenue, 2)


def test_distributor_and_unassigned_filters(session):
    base = _get_six_month(session)
    distributors = base.get("filters", {}).get("distributors", [])
    real_distributor = next((d for d in distributors if d.get("id") not in (None, "all", "unassigned")), None)
    if real_distributor:
        filtered = _get_six_month(session, distributor_id=real_distributor["id"])
        for sku_row in filtered.get("skus") or []:
            for account in sku_row.get("accounts") or []:
                assert account.get("distributor_id") == real_distributor["id"]

    if any(d.get("id") == "unassigned" for d in distributors):
        unassigned = _get_six_month(session, distributor_id="unassigned")
        for sku_row in unassigned.get("skus") or []:
            for account in sku_row.get("accounts") or []:
                assert not account.get("distributor_id")


def test_default_distributor_non_empty_if_provided(session):
    data = _get_six_month(session)
    default_id = data.get("default_distributor_id")
    if not default_id:
        pytest.skip("default_distributor_id not present for this user")
    filtered = _get_six_month(session, distributor_id=default_id)
    assert (filtered.get("summary") or {}).get("total_units", 0) > 0
    assert len(filtered.get("skus") or []) > 0


def test_filter_narrowing_and_reset_equivalent(session):
    base = _get_six_month(session)
    skus = base.get("skus") or []
    if not skus:
        pytest.skip("No SKU data")

    sample_sku = skus[0]["sku"]
    sku_filtered = _get_six_month(session, sku=sample_sku)
    assert len(sku_filtered.get("skus") or []) == 1
    assert (sku_filtered.get("skus") or [{}])[0].get("sku") == sample_sku

    sample_account = None
    for row in skus:
        if row.get("accounts"):
            sample_account = row["accounts"][0].get("account_uuid") or row["accounts"][0].get("key")
            break
    if sample_account:
        acc_filtered = _get_six_month(session, account_id=sample_account)
        for row in acc_filtered.get("skus") or []:
            for account in row.get("accounts") or []:
                assert (account.get("account_uuid") or account.get("key")) == sample_account

    reset_like = _get_six_month(session)
    assert (reset_like.get("summary") or {}).get("total_units", 0) == (base.get("summary") or {}).get("total_units", 0)


def test_legacy_sku_performance_contract_still_works(session):
    response = session.get(
        f"{BASE_URL}/api/reports/sku-performance",
        params={"time_filter": "last_6_months"},
        timeout=45,
    )
    assert response.status_code == 200, response.text[:300]
    data = response.json()
    assert isinstance(data.get("skus"), list)
    assert isinstance(data.get("sku_options"), list)
    assert isinstance(data.get("summary"), dict)

    if data.get("skus"):
        row = data["skus"][0]
        assert "accounts" in row
        assert isinstance(row["accounts"], list)
        assert row.get("accounts_count", 0) == len(row["accounts"])


def test_crates_prefers_stored_line_value():
    item = {"crates": 3, "crate_capacity": 24, "quantity": 240}
    crates = _line_crates(item=item, quantity=240, fallback_capacity=12)
    assert crates == 3


def test_crates_derives_from_capacity_fallback_chain():
    item = {"crates": None, "crate_capacity": None, "bottles_per_crate": 24, "quantity": 240}
    crates = _line_crates(item=item, quantity=240, fallback_capacity=12)
    assert crates == 10

    item2 = {"crates": 0, "packaging_units": None, "units_per_package": None, "quantity": 240}
    crates2 = _line_crates(item=item2, quantity=240, fallback_capacity=12)
    assert crates2 == 20
