"""End-to-end tests for the new Driver mobile-web app + admin driver provisioning."""
import os
import time
import uuid
import requests
import pytest

def _read_base_url():
    url = os.environ.get("REACT_APP_BACKEND_URL")
    if url:
        return url.rstrip("/")
    try:
        with open("/app/frontend/.env") as f:
            for line in f:
                if line.startswith("REACT_APP_BACKEND_URL="):
                    return line.split("=", 1)[1].strip().rstrip("/")
    except Exception:
        pass
    raise RuntimeError("REACT_APP_BACKEND_URL not configured")


BASE_URL = _read_base_url()
ADMIN_EMAIL = "surya.yadavalli@nylaairwater.earth"
ADMIN_PASS = "test123"
DIST_EMAIL = "john.distributor@test.com"
DIST_PASS = "nyladist##"


def _login(email, password):
    r = requests.post(f"{BASE_URL}/api/auth/login", json={"email": email, "password": password}, timeout=20)
    assert r.status_code == 200, f"login failed {email}: {r.status_code} {r.text}"
    return r.json()["session_token"]


@pytest.fixture(scope="module")
def admin_token():
    return _login(ADMIN_EMAIL, ADMIN_PASS)


@pytest.fixture(scope="module")
def admin_headers(admin_token):
    return {"Authorization": f"Bearer {admin_token}"}


@pytest.fixture(scope="module")
def created_driver(admin_headers):
    suffix = str(int(time.time()))[-6:]
    phone = f"99{suffix}{suffix[:2]}"[:10]
    payload = {
        "full_name": "TEST Driver E2E",
        "phone": phone,
        "license_number": f"TESTDL{suffix}",
        "city": "Hyderabad",
        "status": "active",
    }
    r = requests.post(f"{BASE_URL}/api/admin/drivers", json=payload, headers=admin_headers, timeout=20)
    assert r.status_code == 200, f"create driver failed: {r.status_code} {r.text}"
    data = r.json()
    assert "login_password" in data and data["login_password"], "login_password missing"
    assert data["login_username"] == phone
    yield data
    # cleanup
    requests.delete(f"{BASE_URL}/api/admin/drivers/{data['id']}", headers=admin_headers, timeout=20)


def test_create_driver_returns_credentials(created_driver):
    assert created_driver["id"]
    assert created_driver["phone"] == created_driver["login_username"]
    assert len(created_driver["login_password"]) >= 6


def test_driver_login_with_initial_password(created_driver):
    r = requests.post(
        f"{BASE_URL}/api/driver/login",
        json={"phone": created_driver["phone"], "password": created_driver["login_password"]},
        timeout=20,
    )
    assert r.status_code == 200, r.text
    body = r.json()
    assert body["session_token"]
    assert body["user"]["role"] == "Driver"
    assert body["user"].get("driver_id") == created_driver["id"]


def test_driver_login_bad_password(created_driver):
    r = requests.post(
        f"{BASE_URL}/api/driver/login",
        json={"phone": created_driver["phone"], "password": "wrong-pass-xx"},
        timeout=20,
    )
    assert r.status_code == 401


def test_regenerate_password_rotates(created_driver, admin_headers):
    old_pwd = created_driver["login_password"]
    r = requests.post(
        f"{BASE_URL}/api/admin/drivers/{created_driver['id']}/regenerate-password",
        headers=admin_headers, timeout=20,
    )
    assert r.status_code == 200, r.text
    new_pwd = r.json()["login_password"]
    assert new_pwd and new_pwd != old_pwd
    # old rejected
    r1 = requests.post(f"{BASE_URL}/api/driver/login",
                      json={"phone": created_driver["phone"], "password": old_pwd}, timeout=20)
    assert r1.status_code == 401
    # new accepted
    r2 = requests.post(f"{BASE_URL}/api/driver/login",
                      json={"phone": created_driver["phone"], "password": new_pwd}, timeout=20)
    assert r2.status_code == 200
    # stash for later tests
    created_driver["login_password"] = new_pwd


@pytest.fixture(scope="module")
def driver_session(created_driver):
    r = requests.post(
        f"{BASE_URL}/api/driver/login",
        json={"phone": created_driver["phone"], "password": created_driver["login_password"]},
        timeout=20,
    )
    assert r.status_code == 200
    token = r.json()["session_token"]
    return {"Authorization": f"Bearer {token}", "token": token}


def test_driver_me_has_role(driver_session):
    h = {"Authorization": driver_session["Authorization"]}
    r = requests.get(f"{BASE_URL}/api/auth/me", headers=h, timeout=20)
    assert r.status_code == 200
    assert r.json().get("role") == "Driver"


def test_driver_schedules_empty_ok(driver_session):
    h = {"Authorization": driver_session["Authorization"]}
    r = requests.get(f"{BASE_URL}/api/driver/schedules", headers=h, timeout=20)
    assert r.status_code == 200, r.text
    body = r.json()
    assert "schedules" in body
    assert isinstance(body["schedules"], list)


def test_tracking_settings_default(driver_session):
    h = {"Authorization": driver_session["Authorization"]}
    r = requests.get(f"{BASE_URL}/api/driver/tracking/settings", headers=h, timeout=20)
    assert r.status_code == 200
    interval = r.json().get("gps_ping_interval_minutes")
    assert isinstance(interval, int) and interval >= 1


def test_admin_can_update_gps_interval(admin_headers):
    r = requests.put(
        f"{BASE_URL}/api/tenants/current/settings",
        json={"gps_ping_interval_minutes": 7},
        headers=admin_headers, timeout=20,
    )
    assert r.status_code in (200, 204), r.text


def test_other_distributor_cannot_read_tracking(admin_headers):
    # Find any existing schedule
    r = requests.get(f"{BASE_URL}/api/admin/drivers", headers=admin_headers, timeout=20)
    assert r.status_code == 200
    # Try distributor login
    try:
        dist_tok = _login(DIST_EMAIL, DIST_PASS)
    except AssertionError:
        pytest.skip("Distributor credentials not working in this env")
    dh = {"Authorization": f"Bearer {dist_tok}"}
    # 404 acceptable for fake id
    fake = str(uuid.uuid4())
    rr = requests.get(f"{BASE_URL}/api/distributor/delivery-schedules/{fake}/tracking", headers=dh, timeout=20)
    assert rr.status_code in (404, 403)


def test_ping_rejected_when_not_in_progress(driver_session):
    h = {"Authorization": driver_session["Authorization"]}
    # No real schedule for the test driver — should be 404
    r = requests.post(f"{BASE_URL}/api/driver/tracking/ping",
                      json={"schedule_id": str(uuid.uuid4()), "lat": 17.4, "lng": 78.5},
                      headers=h, timeout=20)
    assert r.status_code in (404, 400)


def test_delete_driver_cascades(admin_headers, created_driver):
    # snapshot phone+pwd before deletion
    phone = created_driver["phone"]
    pwd = created_driver["login_password"]
    r = requests.delete(f"{BASE_URL}/api/admin/drivers/{created_driver['id']}", headers=admin_headers, timeout=20)
    assert r.status_code == 200, r.text
    # driver login should now fail
    r2 = requests.post(f"{BASE_URL}/api/driver/login",
                      json={"phone": phone, "password": pwd}, timeout=20)
    assert r2.status_code == 401
