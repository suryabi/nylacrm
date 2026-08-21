"""Backend tests for Account Volume Tracking Grid module."""
import os
import pytest
import requests
from dotenv import load_dotenv

load_dotenv("/app/frontend/.env")
load_dotenv("/app/backend/.env")

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL").rstrip("/")
ADMIN = {"email": "surya.yadavalli@nylaairwater.earth", "password": "test123"}
TENANT = "nyla-air-water"


@pytest.fixture(scope="module")
def token():
    r = requests.post(f"{BASE_URL}/api/auth/login",
                      json=ADMIN, headers={"X-Tenant-ID": TENANT}, timeout=15)
    assert r.status_code == 200, r.text
    return r.json().get("session_token") or r.json().get("token")


@pytest.fixture(scope="module")
def h(token):
    return {"Authorization": f"Bearer {token}", "X-Tenant-ID": TENANT,
            "Content-Type": "application/json"}


# ---- GET grid ----
class TestGridGet:
    def test_grid_lists_accounts_with_metrics(self, h):
        r = requests.get(f"{BASE_URL}/api/account-volume-grid", headers=h, timeout=15)
        assert r.status_code == 200
        data = r.json()
        assert "rows" in data and "custom_columns" in data
        assert data["total"] >= 13, f"Expected >=13 accounts, got {data['total']}"
        rows = data["rows"]

        empire = next((r for r in rows if r["account_name"] == "Empire Restaurant"), None)
        assert empire, "Empire Restaurant not found"
        assert empire["avg_order_frequency_days"] == 5, empire
        assert empire["first_delivery_date"] == "2026-05-10", empire
        assert empire["latest_delivery_date"] == "2026-06-25", empire
        assert empire["last_order_quantity"] == 1, empire

        btp = next((r for r in rows if r["account_name"] == "Bangalore Tech Park"), None)
        assert btp, "Bangalore Tech Park not found"
        assert btp["expected_monthly_volume_crates"] == 200, btp
        assert btp["biweekly_volume_crates"] == 100, btp

    def test_annual_volume_formula_column_exists(self, h):
        r = requests.get(f"{BASE_URL}/api/account-volume-grid", headers=h, timeout=15)
        cols = r.json().get("custom_columns", [])
        av = next((c for c in cols if c["name"] == "Annual Volume"), None)
        assert av, f"Annual Volume column missing: {cols}"
        assert av["type"] == "formula"
        assert "Expected Monthly Volume * 12" in (av.get("formula") or "")

    def test_search_filter(self, h):
        r = requests.get(f"{BASE_URL}/api/account-volume-grid?search=Empire",
                         headers=h, timeout=15)
        assert r.status_code == 200
        rows = r.json()["rows"]
        assert all("empire" in row["account_name"].lower() for row in rows)
        assert len(rows) >= 1

    def test_territory_state_city_filter_no_error(self, h):
        # Just ensure endpoint accepts filters gracefully
        r = requests.get(f"{BASE_URL}/api/account-volume-grid?state=Telangana",
                         headers=h, timeout=15)
        assert r.status_code == 200
        rows = r.json()["rows"]
        for row in rows:
            assert row.get("state") == "Telangana"


# ---- PUT row update ----
class TestRowUpdate:
    def test_put_expected_and_verify_biweekly_and_persistence(self, h):
        # find any account other than Bangalore Tech Park
        r = requests.get(f"{BASE_URL}/api/account-volume-grid", headers=h, timeout=15)
        rows = r.json()["rows"]
        target = next(row for row in rows
                      if row["account_name"] != "Bangalore Tech Park")
        acc_id = target["account_id"]
        original = target["expected_monthly_volume_crates"]

        # set to 400
        r = requests.put(f"{BASE_URL}/api/account-volume-grid/rows/{acc_id}",
                         headers=h, json={"expected_monthly_volume_crates": 400},
                         timeout=15)
        assert r.status_code == 200, r.text

        # verify GET
        r = requests.get(f"{BASE_URL}/api/account-volume-grid", headers=h, timeout=15)
        row = next(x for x in r.json()["rows"] if x["account_id"] == acc_id)
        assert row["expected_monthly_volume_crates"] == 400
        assert row["biweekly_volume_crates"] == 200

        # clear
        r = requests.put(f"{BASE_URL}/api/account-volume-grid/rows/{acc_id}",
                         headers=h, json={"clear_expected": True}, timeout=15)
        assert r.status_code == 200

        r = requests.get(f"{BASE_URL}/api/account-volume-grid", headers=h, timeout=15)
        row = next(x for x in r.json()["rows"] if x["account_id"] == acc_id)
        assert row["expected_monthly_volume_crates"] in (None,)
        assert row["biweekly_volume_crates"] is None

        # restore original if any
        if original is not None:
            requests.put(f"{BASE_URL}/api/account-volume-grid/rows/{acc_id}",
                         headers=h,
                         json={"expected_monthly_volume_crates": original},
                         timeout=15)

    def test_negative_value_returns_422(self, h):
        r = requests.get(f"{BASE_URL}/api/account-volume-grid", headers=h, timeout=15)
        acc_id = r.json()["rows"][0]["account_id"]
        r = requests.put(f"{BASE_URL}/api/account-volume-grid/rows/{acc_id}",
                         headers=h, json={"expected_monthly_volume_crates": -10},
                         timeout=15)
        assert r.status_code == 422, r.text

    def test_unknown_account_404(self, h):
        r = requests.put(f"{BASE_URL}/api/account-volume-grid/rows/nonexistent-id",
                         headers=h, json={"expected_monthly_volume_crates": 5},
                         timeout=15)
        assert r.status_code == 404


# ---- Columns ----
class TestColumns:
    created_ids = []

    def test_create_number_column_and_edit_value(self, h):
        r = requests.post(f"{BASE_URL}/api/account-volume-grid/columns",
                          headers=h,
                          json={"name": "TEST_Number_Col", "type": "number"},
                          timeout=15)
        assert r.status_code == 200, r.text
        col = r.json()
        assert col["type"] == "number" and col["name"] == "TEST_Number_Col"
        TestColumns.created_ids.append(col["id"])

        # edit value on some account
        grid = requests.get(f"{BASE_URL}/api/account-volume-grid",
                            headers=h, timeout=15).json()
        acc_id = grid["rows"][0]["account_id"]
        r = requests.put(f"{BASE_URL}/api/account-volume-grid/rows/{acc_id}",
                         headers=h,
                         json={"custom_values": {col["id"]: 42}},
                         timeout=15)
        assert r.status_code == 200

        # persist check
        grid = requests.get(f"{BASE_URL}/api/account-volume-grid",
                            headers=h, timeout=15).json()
        row = next(x for x in grid["rows"] if x["account_id"] == acc_id)
        assert row["custom_values"].get(col["id"]) == 42

        # cleanup value
        requests.put(f"{BASE_URL}/api/account-volume-grid/rows/{acc_id}",
                     headers=h, json={"custom_values": {col["id"]: None}},
                     timeout=15)

    def test_create_formula_column(self, h):
        r = requests.post(f"{BASE_URL}/api/account-volume-grid/columns",
                          headers=h,
                          json={"name": "TEST_Formula",
                                "type": "formula",
                                "formula": "Last Order Quantity * 2"},
                          timeout=15)
        assert r.status_code == 200, r.text
        col = r.json()
        assert col["type"] == "formula"
        assert col["formula"] == "Last Order Quantity * 2"
        TestColumns.created_ids.append(col["id"])

    def test_duplicate_column_name_400(self, h):
        r = requests.post(f"{BASE_URL}/api/account-volume-grid/columns",
                          headers=h,
                          json={"name": "Annual Volume", "type": "number"},
                          timeout=15)
        assert r.status_code == 400, r.text
        assert "already exists" in r.json().get("detail", "").lower()

    def test_invalid_type_400(self, h):
        r = requests.post(f"{BASE_URL}/api/account-volume-grid/columns",
                          headers=h,
                          json={"name": "TEST_Bad", "type": "bogus"},
                          timeout=15)
        assert r.status_code == 400

    def test_formula_without_formula_400(self, h):
        r = requests.post(f"{BASE_URL}/api/account-volume-grid/columns",
                          headers=h,
                          json={"name": "TEST_NoFormula", "type": "formula"},
                          timeout=15)
        assert r.status_code == 400

    def test_delete_unknown_column_404(self, h):
        r = requests.delete(f"{BASE_URL}/api/account-volume-grid/columns/nope-id",
                            headers=h, timeout=15)
        assert r.status_code == 404

    def test_zzz_cleanup_created_columns(self, h):
        for cid in TestColumns.created_ids:
            r = requests.delete(f"{BASE_URL}/api/account-volume-grid/columns/{cid}",
                                headers=h, timeout=15)
            assert r.status_code in (200, 404)

        # confirm Annual Volume still exists
        r = requests.get(f"{BASE_URL}/api/account-volume-grid", headers=h, timeout=15)
        names = [c["name"] for c in r.json()["custom_columns"]]
        assert "Annual Volume" in names
        assert "TEST_Number_Col" not in names
        assert "TEST_Formula" not in names


# ---- Regression: Accounts page still works ----
class TestAccountsRegression:
    def test_accounts_list(self, h):
        r = requests.get(f"{BASE_URL}/api/accounts", headers=h, timeout=15)
        assert r.status_code == 200
        # returns list or dict-with-rows
        data = r.json()
        rows = data if isinstance(data, list) else data.get("data") or data.get("rows") or data.get("accounts") or []
        assert len(rows) >= 1
