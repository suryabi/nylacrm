"""CIO iter395: default distributor by city, prev_month/mom_change contract, export xlsx header."""
import io
import os
import re

import pytest
import requests
from openpyxl import load_workbook

def _read_env_backend_url():
    with open("/app/frontend/.env") as f:
        for line in f:
            if line.startswith("REACT_APP_BACKEND_URL"):
                return line.split("=", 1)[1].strip().rstrip("/")
    raise RuntimeError("REACT_APP_BACKEND_URL not found")

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL") or _read_env_backend_url()
BASE_URL = BASE_URL.rstrip("/")
TENANT = "nyla-air-water"
ADMIN = {"email": "surya.yadavalli@nylaairwater.earth", "password": "test123"}
CD = {"email": "creative.director@nylaairwater.earth", "password": "test123"}
EXPECTED_MAIN_ID = "b8876367-df64-4c55-a382-d5eb3b4b2380"


def _login(email, password):
    r = requests.post(f"{BASE_URL}/api/auth/login",
                      json={"email": email, "password": password},
                      headers={"X-Tenant-ID": TENANT}, timeout=30)
    assert r.status_code == 200, f"login {email} -> {r.status_code} {r.text[:200]}"
    body = r.json()
    tok = body.get("token") or body.get("session_token") or body.get("access_token")
    assert tok, f"no token in {body.keys()}"
    return tok, body.get("user") or body


def _get_report(tok):
    r = requests.get(f"{BASE_URL}/api/reports/customer-invoice-overview",
                     headers={"Authorization": f"Bearer {tok}", "X-Tenant-ID": TENANT}, timeout=30)
    assert r.status_code == 200, r.text[:200]
    return r.json()


class TestCIO:
    def test_admin_default_is_main(self):
        tok, user = _login(**ADMIN)
        assert (user.get("city") or "").strip().lower() == "hyderabad"
        data = _get_report(tok)
        assert data["default_distributor_id"] == EXPECTED_MAIN_ID
        names = {d["id"]: d["name"] for d in data["filters"]["distributors"]}
        assert names.get(EXPECTED_MAIN_ID) == "Main"

    def test_prev_month_and_mom_change_contract(self):
        tok, _ = _login(**ADMIN)
        data = _get_report(tok)
        rows = data["rows"]
        assert len(rows) > 0
        # Check aggregate
        month_totals = data["month_totals"]
        assert abs(data["mom_change_total"] - (month_totals[-1] - month_totals[-2])) < 0.01
        # Prev totals consistent
        assert abs(data["prev_month_total"] - sum(r["prev_month"] for r in rows)) < 0.01
        # Row-level mom_change equals months[5]-months[4]
        for r in rows:
            assert isinstance(r["prev_month"], (int, float))
            expected = round(r["months"][5] - r["months"][4], 2)
            assert abs(r["mom_change"] - expected) < 0.01, f"{r['account_name']} mom_change mismatch"

    def test_toopa_specific_values(self):
        tok, _ = _login(**ADMIN)
        data = _get_report(tok)
        toopa = next((r for r in data["rows"] if "toopa" in (r["account_name"] or "").lower()), None)
        assert toopa is not None, "Toopa not found"
        assert abs(toopa["prev_month"] - 59351.5) < 0.5, f"prev={toopa['prev_month']}"
        assert toopa["months"] == [0, 3576, 0, 0, 0, 0] or toopa["months"][:2] == [0, 3576]

    def test_non_matching_user_default_null(self):
        # Creative director - check their city; if it matches Hyderabad we skip
        tok, user = _login(**CD)
        city = (user.get("city") or "").strip().lower()
        data = _get_report(tok)
        if city in {"hyderabad", "bengaluru", "bangalore", "mumbai", "delhi", "chennai", "kolkata"}:
            # may still match; just log
            print(f"CD city={city} default={data['default_distributor_id']}")
        else:
            assert data["default_distributor_id"] is None, f"expected null, got {data['default_distributor_id']} for city={city}"

    def test_export_header_has_change_no_total(self):
        tok, _ = _login(**ADMIN)
        r = requests.get(f"{BASE_URL}/api/reports/customer-invoice-overview/export",
                         headers={"Authorization": f"Bearer {tok}", "X-Tenant-ID": TENANT}, timeout=60)
        assert r.status_code == 200
        wb = load_workbook(io.BytesIO(r.content))
        ws = wb.active
        header_row = None
        for row in ws.iter_rows(values_only=True):
            if row and row[0] == "Customer":
                header_row = list(row)
                break
        assert header_row is not None, "header not found"
        assert header_row[-1] == "Change vs last month", f"last header={header_row[-1]}"
        # no '6-mo Total' column
        assert not any(h and "6-mo" in str(h) for h in header_row)
        assert not any(h and str(h).strip().lower() == "total" for h in header_row)
        # last row Total
        last_row = None
        for row in ws.iter_rows(values_only=True):
            if row and row[0] == "Total":
                last_row = list(row)
        assert last_row is not None
        assert isinstance(last_row[-1], (int, float)), f"total-row last cell type={type(last_row[-1])}"
