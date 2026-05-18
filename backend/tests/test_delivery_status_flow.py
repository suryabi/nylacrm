"""
Backend tests for the new Distributor-Delivery status lifecycle:

  Draft -> Confirmed -> delivery_assigned -> delivery_scheduled
                                          -> on_the_way -> complete
       (Stock-out direct path) Confirmed -> complete

Also exercises:
  * Detach delivery from schedule reverts status to 'confirmed'
  * GET /deliveries/summary counts 'complete' AND legacy 'delivered'

Auth strategy:
  - Distributor user (john.distributor@test.com) to drive the schedule lifecycle
    (linked to distributor bb12d90e-4d33-4890-ac5f-17573c551b5c)
  - Admin user (surya.yadavalli@nylaairwater.earth) to provision a one-shot driver
    (needed to start the schedule and complete the stop)
"""
import os
import uuid
from datetime import datetime, timezone

import pytest
import requests

def _load_base_url():
    url = os.environ.get("REACT_APP_BACKEND_URL")
    if url:
        return url.rstrip("/")
    # Fallback: read /app/frontend/.env
    try:
        with open("/app/frontend/.env") as f:
            for line in f:
                if line.startswith("REACT_APP_BACKEND_URL="):
                    return line.split("=", 1)[1].strip().rstrip("/")
    except Exception:
        pass
    return ""


BASE_URL = _load_base_url()
TENANT_ID = "nyla-air-water"
DISTRIBUTOR_ID = "bb12d90e-4d33-4890-ac5f-17573c551b5c"  # Brian (DIST-0003)

ADMIN = {"email": "surya.yadavalli@nylaairwater.earth", "password": "test123"}
DIST_USER = {"email": "john.distributor@test.com", "password": "nyladist##"}


# ---------- helpers ----------------------------------------------------------

def _login(email: str, password: str) -> requests.Session:
    s = requests.Session()
    s.headers.update({"Content-Type": "application/json", "X-Tenant-ID": TENANT_ID})
    r = s.post(f"{BASE_URL}/api/auth/login", json={"email": email, "password": password})
    if r.status_code != 200:
        pytest.skip(f"Login failed for {email}: {r.status_code} {r.text}")
    token = r.json().get("session_token")
    s.headers["Authorization"] = f"Bearer {token}"
    s.cookies.set("session_token", token)
    return s


def _driver_login(phone: str, password: str) -> requests.Session:
    s = requests.Session()
    s.headers.update({"Content-Type": "application/json", "X-Tenant-ID": TENANT_ID})
    r = s.post(f"{BASE_URL}/api/driver/login", json={"phone": phone, "password": password})
    if r.status_code != 200:
        pytest.skip(f"Driver login failed: {r.status_code} {r.text}")
    token = r.json().get("session_token") or r.json().get("token")
    if token:
        s.headers["Authorization"] = f"Bearer {token}"
        s.cookies.set("session_token", token)
    return s


@pytest.fixture(scope="module")
def admin_client():
    return _login(ADMIN["email"], ADMIN["password"])


@pytest.fixture(scope="module")
def dist_client():
    return _login(DIST_USER["email"], DIST_USER["password"])


@pytest.fixture(scope="module")
def distributor_info(dist_client):
    r = dist_client.get(f"{BASE_URL}/api/distributors/{DISTRIBUTOR_ID}")
    if r.status_code != 200:
        pytest.skip(f"Cannot read distributor: {r.status_code} {r.text}")
    return r.json()


@pytest.fixture(scope="module")
def first_sku(dist_client):
    r = dist_client.get(f"{BASE_URL}/api/master-skus")
    if r.status_code != 200:
        pytest.skip(f"SKUs unavailable: {r.status_code}")
    skus = r.json().get("skus", r.json())
    if not skus:
        pytest.skip("No SKUs configured")
    return skus[0]


@pytest.fixture(scope="module")
def first_account(dist_client):
    r = dist_client.get(f"{BASE_URL}/api/distributors/{DISTRIBUTOR_ID}/assigned-accounts")
    if r.status_code != 200:
        pytest.skip(f"Assigned accounts call failed: {r.status_code}")
    accs = r.json().get("accounts", [])
    if not accs:
        pytest.skip("No accounts assigned to test distributor")
    return accs[0]


@pytest.fixture(scope="module")
def vehicle(dist_client):
    r = dist_client.get(f"{BASE_URL}/api/distributor/delivery-schedules/fleet/vehicles")
    if r.status_code != 200:
        pytest.skip(f"Vehicles list failed: {r.status_code}")
    body = r.json()
    items = body.get("vehicles") if isinstance(body, dict) else body
    if not items:
        pytest.skip("No vehicles configured in this tenant")
    return items[0]


@pytest.fixture(scope="module")
def driver_user(admin_client):
    """Create a driver via admin API, return (driver_id, phone, password). Cleaned up after."""
    phone = "98" + str(uuid.uuid4().int)[:8]  # 10 digits, unique-ish
    payload = {
        "full_name": "TEST_FLOW Driver",
        "phone": phone,
        "license_number": f"TESTFLOW-{uuid.uuid4().hex[:8]}",
        "city": "Test City",
        "status": "active",
    }
    r = admin_client.post(f"{BASE_URL}/api/admin/drivers", json=payload)
    if r.status_code != 200:
        pytest.skip(f"Driver provisioning failed: {r.status_code} {r.text}")
    d = r.json()
    driver_id = d["id"]
    pwd = d.get("login_password")
    if not pwd:
        pytest.skip("Driver create did not return login_password — cannot login driver")
    yield {"driver_id": driver_id, "phone": d.get("login_username") or phone, "password": pwd}
    admin_client.delete(f"{BASE_URL}/api/admin/drivers/{driver_id}")


def _make_delivery(dist_client, distributor_info, first_sku, first_account, suffix="A"):
    locations = distributor_info.get("locations", [])
    if not locations:
        pytest.skip("Distributor has no locations")
    body = {
        "distributor_id": DISTRIBUTOR_ID,
        "distributor_location_id": locations[0]["id"],
        "account_id": first_account["id"],
        "delivery_date": datetime.now().strftime("%Y-%m-%d"),
        "reference_number": f"TEST_FLOW-{suffix}-{datetime.now().strftime('%H%M%S%f')}",
        "items": [{
            "sku_id": first_sku["id"],
            "sku_name": first_sku.get("name", "SKU"),
            "quantity": 1,
            "unit_price": 100.0,
            "discount_percent": 0,
            "tax_percent": 18,
        }],
    }
    r = dist_client.post(f"{BASE_URL}/api/distributors/{DISTRIBUTOR_ID}/deliveries", json=body)
    assert r.status_code == 200, f"Create delivery failed: {r.status_code} {r.text}"
    return r.json()


def _confirm_delivery(dist_client, delivery_id):
    r = dist_client.post(f"{BASE_URL}/api/distributors/{DISTRIBUTOR_ID}/deliveries/{delivery_id}/confirm")
    assert r.status_code == 200, f"Confirm delivery failed: {r.status_code} {r.text}"
    return r.json()


def _get_delivery(dist_client, delivery_id):
    r = dist_client.get(f"{BASE_URL}/api/distributors/{DISTRIBUTOR_ID}/deliveries/{delivery_id}")
    assert r.status_code == 200, f"Get delivery failed: {r.status_code} {r.text}"
    return r.json()


# ---------- P0e: direct stock-out complete -----------------------------------

class TestStockOutDirectComplete:
    def test_stockout_confirmed_to_complete(self, dist_client, distributor_info, first_sku, first_account):
        d = _make_delivery(dist_client, distributor_info, first_sku, first_account, suffix="STOCKOUT")
        _confirm_delivery(dist_client, d["id"])
        r = dist_client.post(
            f"{BASE_URL}/api/distributors/{DISTRIBUTOR_ID}/deliveries/{d['id']}/complete"
        )
        assert r.status_code == 200, f"Direct complete failed: {r.status_code} {r.text}"
        body = r.json()
        assert body.get("status") == "complete", f"Expected 'complete', got {body.get('status')}"
        # Persist check via GET
        got = _get_delivery(dist_client, d["id"])
        assert got["status"] == "complete"


# ---------- P0a..P0d full schedule lifecycle ---------------------------------

class TestScheduleLifecycle:
    @pytest.fixture(scope="class")
    def lifecycle(self, dist_client, admin_client, distributor_info, first_sku, first_account,
                  vehicle, driver_user):
        # 1. delivery -> confirmed
        d = _make_delivery(dist_client, distributor_info, first_sku, first_account, suffix="LIFE")
        _confirm_delivery(dist_client, d["id"])

        # 2. Draft schedule with vehicle + driver
        sch_payload = {
            "schedule_date": datetime.now().strftime("%Y-%m-%d"),
            "vehicle_id": vehicle["id"],
            "driver_id": driver_user["driver_id"],
            "notes": "TEST_FLOW schedule",
        }
        r = dist_client.post(f"{BASE_URL}/api/distributor/delivery-schedules", json=sch_payload)
        assert r.status_code == 200, f"Create schedule failed: {r.status_code} {r.text}"
        sched = r.json()
        yield {"delivery_id": d["id"], "schedule_id": sched["id"]}

        # Cleanup
        try:
            dist_client.post(f"{BASE_URL}/api/distributor/delivery-schedules/{sched['id']}/cancel")
        except Exception:
            pass
        try:
            dist_client.delete(f"{BASE_URL}/api/distributor/delivery-schedules/{sched['id']}")
        except Exception:
            pass

    def test_p0a_attach_sets_delivery_assigned(self, dist_client, lifecycle):
        r = dist_client.post(
            f"{BASE_URL}/api/distributor/delivery-schedules/{lifecycle['schedule_id']}/attach-deliveries",
            json={"delivery_ids": [lifecycle["delivery_id"]]},
        )
        assert r.status_code == 200, f"Attach failed: {r.status_code} {r.text}"
        got = _get_delivery(dist_client, lifecycle["delivery_id"])
        assert got["status"] == "delivery_assigned", f"Expected 'delivery_assigned', got {got['status']}"

    def test_p0f_detach_reverts_to_confirmed(self, dist_client, lifecycle):
        r = dist_client.post(
            f"{BASE_URL}/api/distributor/delivery-schedules/{lifecycle['schedule_id']}/detach-delivery/{lifecycle['delivery_id']}"
        )
        assert r.status_code == 200, f"Detach failed: {r.status_code} {r.text}"
        got = _get_delivery(dist_client, lifecycle["delivery_id"])
        assert got["status"] == "confirmed", f"After detach expected 'confirmed', got {got['status']}"

        # Re-attach for downstream tests
        r2 = dist_client.post(
            f"{BASE_URL}/api/distributor/delivery-schedules/{lifecycle['schedule_id']}/attach-deliveries",
            json={"delivery_ids": [lifecycle["delivery_id"]]},
        )
        assert r2.status_code == 200, f"Re-attach failed: {r2.status_code} {r2.text}"

    def test_p0b_approve_sets_delivery_scheduled(self, dist_client, lifecycle):
        # confirm schedule first
        rc = dist_client.post(
            f"{BASE_URL}/api/distributor/delivery-schedules/{lifecycle['schedule_id']}/confirm"
        )
        assert rc.status_code == 200, f"Confirm schedule failed: {rc.status_code} {rc.text}"
        # After confirm, delivery should still be 'delivery_assigned'
        mid = _get_delivery(dist_client, lifecycle["delivery_id"])
        assert mid["status"] == "delivery_assigned", \
            f"After schedule confirm, expected delivery still 'delivery_assigned', got {mid['status']}"

        ra = dist_client.post(
            f"{BASE_URL}/api/distributor/delivery-schedules/{lifecycle['schedule_id']}/approve"
        )
        assert ra.status_code == 200, f"Approve failed: {ra.status_code} {ra.text}"
        got = _get_delivery(dist_client, lifecycle["delivery_id"])
        assert got["status"] == "delivery_scheduled", \
            f"After approve expected 'delivery_scheduled', got {got['status']}"

    def test_p0c_driver_start_sets_on_the_way(self, dist_client, driver_user, lifecycle):
        drv = _driver_login(driver_user["phone"], driver_user["password"])
        r = drv.post(
            f"{BASE_URL}/api/driver/schedules/{lifecycle['schedule_id']}/start"
        )
        assert r.status_code == 200, f"Driver start failed: {r.status_code} {r.text}"
        got = _get_delivery(dist_client, lifecycle["delivery_id"])
        assert got["status"] == "on_the_way", f"Expected 'on_the_way', got {got['status']}"

    def test_p0d_driver_complete_stop_sets_complete(self, dist_client, driver_user, lifecycle):
        drv = _driver_login(driver_user["phone"], driver_user["password"])
        r = drv.post(
            f"{BASE_URL}/api/driver/schedules/{lifecycle['schedule_id']}/stops/{lifecycle['delivery_id']}/complete",
            json={"notes": "done", "lat": 12.97, "lng": 77.59},
        )
        assert r.status_code == 200, f"Driver complete-stop failed: {r.status_code} {r.text}"
        got = _get_delivery(dist_client, lifecycle["delivery_id"])
        assert got["status"] == "complete", f"Expected 'complete', got {got['status']}"


# ---------- P0g: summary counts both 'complete' and legacy 'delivered' -------

class TestDeliverySummary:
    def test_summary_includes_complete_in_delivered_count(self, dist_client):
        # The previous TestStockOutDirectComplete and lifecycle tests should have
        # created at least one 'complete' record for this distributor today.
        r = dist_client.get(
            f"{BASE_URL}/api/distributors/deliveries/summary",
            params={"distributor_id": DISTRIBUTOR_ID},
        )
        assert r.status_code == 200, f"Summary failed: {r.status_code} {r.text}"
        body = r.json()
        by_status = body.get("by_status") or {}
        # "delivered" bucket should be >= 1 (since complete is counted under it)
        assert by_status.get("delivered", 0) >= 1, \
            f"Expected delivered bucket to include 'complete' rows, got: {by_status}"
