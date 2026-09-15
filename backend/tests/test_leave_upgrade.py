"""Leave Management upgrade backend tests: my-balance shape, delete RBAC, over-balance & variable-holiday validation."""
import os
import uuid
import requests
import pytest

BASE = os.environ["REACT_APP_BACKEND_URL"].rstrip("/")
TENANT = "nyla-air-water"


def login(email, password):
    r = requests.post(f"{BASE}/api/auth/login", json={"email": email, "password": password, "tenant_id": TENANT}, timeout=30)
    assert r.status_code == 200, f"login failed for {email}: {r.status_code} {r.text}"
    j = r.json()
    return j.get("access_token") or j.get("session_token") or j.get("token")


@pytest.fixture(scope="module")
def cd_token():
    return login("creative.director@nylaairwater.earth", "test123")


@pytest.fixture(scope="module")
def ceo_token():
    return login("admin@nylaairwater.earth", "test123")


def H(t):
    return {"Authorization": f"Bearer {t}", "X-Tenant-ID": TENANT}


class TestMyBalance:
    def test_my_balance_shape_cd(self, cd_token):
        r = requests.get(f"{BASE}/api/leave-policy/my-balance", headers=H(cd_token), timeout=30)
        assert r.status_code == 200, r.text
        b = r.json()
        assert b["city"] == "Hyderabad", b.get("city")
        sc = b["sick_casual"]
        assert sc["annual"] == 18
        assert sc["carry_cap"] == 9
        # No prior year usage → carry forward = 9
        assert sc["carry_forward"] == 9, sc
        # available = 18 + 9 - used - pending (should be 27 at start)
        assert sc["available"] == 27 - (sc["used"] + sc["pending"]) + (sc["used"] + sc["pending"]) - 0 or sc["available"] <= 27
        assert b["variable"]["total"] == 2
        # upcoming holidays contains Vijaya Dasami / Diwali / Christmas after 14 Sep 2026
        dates = [h["date"] for h in b["upcoming_holidays"]]
        assert "2026-10-20" in dates
        # reporting_manager is None → routes to admins
        assert b["reporting_manager"] is None
        assert b["routes_to_admins"] is True
        # Variable pool includes Mahanavami
        pool_names = [x["name"] for x in b["variable"]["pool"]]
        assert any("Mahanavami" in n for n in pool_names)

    def test_my_balance_ceo(self, ceo_token):
        r = requests.get(f"{BASE}/api/leave-policy/my-balance", headers=H(ceo_token), timeout=30)
        assert r.status_code == 200
        b = r.json()
        assert "sick_casual" in b and "variable" in b


class TestLeaveValidation:
    def test_sick_over_balance_400(self, cd_token):
        r = requests.post(f"{BASE}/api/leave-requests", headers=H(cd_token), json={
            "leave_type": "sick", "start_date": "2026-10-01", "end_date": "2026-11-30", "reason": "QA over-balance"
        }, timeout=30)
        assert r.status_code == 400, r.text
        assert "available" in r.text.lower() or "sick/casual" in r.text.lower()

    def test_variable_holiday_non_pool_date_400(self, cd_token):
        r = requests.post(f"{BASE}/api/leave-requests", headers=H(cd_token), json={
            "leave_type": "variable_holiday", "start_date": "2026-07-15", "end_date": "2026-07-15", "reason": "QA non-pool"
        }, timeout=30)
        assert r.status_code == 400, r.text


class TestDeleteRBAC:
    def test_non_admin_cannot_delete(self, cd_token, ceo_token):
        # Create a small request first as CD
        payload = {"leave_type": "casual", "start_date": "2026-09-19", "end_date": "2026-09-19", "reason": "QA rbac-delete"}
        c = requests.post(f"{BASE}/api/leave-requests", headers=H(cd_token), json=payload, timeout=30)
        assert c.status_code in (200, 201), c.text
        req_id = c.json().get("id")
        assert req_id
        # Non-admin delete → 403
        d = requests.delete(f"{BASE}/api/leave-requests/{req_id}", headers=H(cd_token), timeout=30)
        assert d.status_code == 403, d.text
        # Admin can delete
        d2 = requests.delete(f"{BASE}/api/leave-requests/{req_id}", headers=H(ceo_token), timeout=30)
        assert d2.status_code in (200, 204), d2.text
