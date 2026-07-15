"""Backend tests focused on the NEW packaging fields in Stock Transfer Requests.

Verifies:
 - POST /api/stock-transfer-requests accepts packaging_type_id, packaging_type_name,
   units_per_package, packages fields and echoes them back in the response.
 - GET /api/stock-transfer-requests returns items with all packaging fields preserved.
 - Approve endpoint works for the new-packaging-shaped request.
 - Approved request can be cancelled/left approved for downstream prefill testing.
"""
import os
import uuid

import pytest
import requests

BASE_URL = os.environ.get(
    "REACT_APP_BACKEND_URL", "https://design-workflow-hub-11.preview.emergentagent.com"
).rstrip("/")
TENANT = "nyla-air-water"

CEO_EMAIL = "surya.yadavalli@nylaairwater.earth"
PWD = "test123"

# Known-good test data supplied by main agent
KNOWN_SKU_ID = "20d525e8-c4af-4f40-965a-549dcd50c0a9"     # Nyla – 600 ml / Silver
DEST_LOCATION_ID = "aa2eda05-1902-4a17-92bb-d33533535297"  # Brian — Delhi


def _login(email, pwd):
    s = requests.Session()
    s.headers.update({"Content-Type": "application/json", "X-Tenant-ID": TENANT})
    r = s.post(f"{BASE_URL}/api/auth/login", json={"email": email, "password": pwd}, timeout=30)
    assert r.status_code == 200, f"login failed: {r.status_code} {r.text[:200]}"
    tok = r.json().get("session_token")
    if tok:
        s.headers["Authorization"] = f"Bearer {tok}"
    return s


@pytest.fixture(scope="module")
def ceo():
    return _login(CEO_EMAIL, PWD)


@pytest.fixture(scope="module")
def sku_pkg_info(ceo):
    """Fetch packaging info for the known SKU so tests can pick a real packaging option."""
    r = ceo.get(f"{BASE_URL}/api/master-skus", timeout=30)
    assert r.status_code == 200
    body = r.json()
    skus = body if isinstance(body, list) else (body.get("skus") or body.get("items") or [])
    sku = next((s for s in skus if s["id"] == KNOWN_SKU_ID), None)
    if not sku:
        pytest.skip(f"Known SKU {KNOWN_SKU_ID} not found in master_skus response.")
    stock_out = (sku.get("packaging_config") or {}).get("stock_out") or []
    if not stock_out:
        pytest.skip("SKU has no stock_out packaging options")
    return {
        "sku_id": sku["id"],
        "sku_name": sku.get("sku_name"),
        "packaging_options": stock_out,
    }


@pytest.fixture(scope="module")
def state():
    return {}


def test_1_packaging_options_available(sku_pkg_info):
    """Sanity: the SKU exposes at least one packaging option with units_per_package."""
    pkgs = sku_pkg_info["packaging_options"]
    assert len(pkgs) >= 1
    for p in pkgs:
        assert "packaging_type_id" in p
        assert "packaging_type_name" in p
        assert p.get("units_per_package", 0) > 0
    # At least one should be marked default (or default falls back to first)
    print(f"SKU {sku_pkg_info['sku_name']} has {len(pkgs)} packaging options:",
          [(p['packaging_type_name'], p['units_per_package'], p.get('is_default')) for p in pkgs])


def test_2_create_request_with_packaging_echoes_fields(ceo, sku_pkg_info, state):
    """POST with packaging fields returns them intact in the response body."""
    pkgs = sku_pkg_info["packaging_options"]
    # Prefer non-default packaging if available (to prove we don't silently overwrite with default)
    default_pkg = next((p for p in pkgs if p.get("is_default")), pkgs[0])
    non_default = next((p for p in pkgs if not p.get("is_default")), None)
    chosen = non_default or default_pkg
    packages = 5
    units = packages * chosen["units_per_package"]

    payload = {
        "dest_location_id": DEST_LOCATION_ID,
        "reason": "TEST_packaging_echo",
        "items": [{
            "sku_id": sku_pkg_info["sku_id"],
            "quantity_units": units,
            "packaging_type_id": chosen["packaging_type_id"],
            "packaging_type_name": chosen["packaging_type_name"],
            "units_per_package": chosen["units_per_package"],
            "packages": packages,
        }],
    }
    r = ceo.post(f"{BASE_URL}/api/stock-transfer-requests", json=payload, timeout=30)
    assert r.status_code in (200, 201), f"create failed: {r.status_code} {r.text[:200]}"
    doc = r.json()
    assert doc.get("status") == "pending"
    assert doc.get("request_number", "").startswith("STR-")
    it = doc["items"][0]
    assert it["sku_id"] == sku_pkg_info["sku_id"]
    assert it["quantity_units"] == units
    assert it["packaging_type_id"] == chosen["packaging_type_id"]
    assert it["packaging_type_name"] == chosen["packaging_type_name"]
    assert it["units_per_package"] == chosen["units_per_package"]
    assert it["packages"] == packages
    assert it.get("sku_name")  # backfilled by backend

    state["req_id"] = doc["id"]
    state["req_number"] = doc["request_number"]
    state["chosen_pkg"] = chosen
    state["packages"] = packages
    state["units"] = units


def test_3_list_request_preserves_packaging(ceo, state):
    """GET /api/stock-transfer-requests returns the same packaging fields."""
    if "req_id" not in state:
        pytest.skip("prior create test did not run")
    r = ceo.get(f"{BASE_URL}/api/stock-transfer-requests", timeout=30)
    assert r.status_code == 200
    rows = r.json().get("requests", [])
    row = next((x for x in rows if x["id"] == state["req_id"]), None)
    assert row is not None, f"request {state['req_id']} not found in listing"
    it = row["items"][0]
    assert it["packages"] == state["packages"]
    assert it["units_per_package"] == state["chosen_pkg"]["units_per_package"]
    assert it["packaging_type_name"] == state["chosen_pkg"]["packaging_type_name"]
    assert it["packaging_type_id"] == state["chosen_pkg"]["packaging_type_id"]
    assert it["quantity_units"] == state["units"]


def test_4_approve_packaging_request(ceo, state):
    """Approve endpoint should work regardless of item shape."""
    if "req_id" not in state:
        pytest.skip("prior create test did not run")
    r = ceo.post(
        f"{BASE_URL}/api/stock-transfer-requests/{state['req_id']}/approve",
        json={"remark": "TEST_pkg_approve"},
        timeout=30,
    )
    assert r.status_code == 200, f"approve failed: {r.status_code} {r.text[:200]}"
    # Verify state
    lst = ceo.get(f"{BASE_URL}/api/stock-transfer-requests?status=approved", timeout=30)
    row = next((x for x in lst.json().get("requests", []) if x["id"] == state["req_id"]), None)
    assert row is not None
    assert row["status"] == "approved"
    # Packaging fields should still be preserved after approval
    it = row["items"][0]
    assert it["packages"] == state["packages"]
    assert it["packaging_type_name"] == state["chosen_pkg"]["packaging_type_name"]


def test_5_backwards_compat_units_only_still_works(ceo, sku_pkg_info):
    """Old-shape payload (units only, no packaging) must still be accepted."""
    payload = {
        "dest_location_id": DEST_LOCATION_ID,
        "reason": "TEST_units_only",
        "items": [{
            "sku_id": sku_pkg_info["sku_id"],
            "quantity_units": 12,
        }],
    }
    r = ceo.post(f"{BASE_URL}/api/stock-transfer-requests", json=payload, timeout=30)
    assert r.status_code in (200, 201), f"units-only create failed: {r.status_code} {r.text[:200]}"
    doc = r.json()
    it = doc["items"][0]
    assert it["quantity_units"] == 12
    assert it.get("packages") is None
    assert it.get("packaging_type_id") is None
    # Cleanup: cancel this pending
    rid = doc["id"]
    ceo.post(f"{BASE_URL}/api/stock-transfer-requests/{rid}/cancel", timeout=30)


def test_6_reject_endpoint_still_works(ceo, sku_pkg_info):
    """Ensure reject works on a fresh packaging request."""
    pkgs = sku_pkg_info["packaging_options"]
    chosen = pkgs[0]
    payload = {
        "dest_location_id": DEST_LOCATION_ID,
        "reason": "TEST_reject_pkg",
        "items": [{
            "sku_id": sku_pkg_info["sku_id"],
            "quantity_units": chosen["units_per_package"],
            "packaging_type_id": chosen["packaging_type_id"],
            "packaging_type_name": chosen["packaging_type_name"],
            "units_per_package": chosen["units_per_package"],
            "packages": 1,
        }],
    }
    r = ceo.post(f"{BASE_URL}/api/stock-transfer-requests", json=payload, timeout=30)
    assert r.status_code in (200, 201)
    rid = r.json()["id"]
    rej = ceo.post(
        f"{BASE_URL}/api/stock-transfer-requests/{rid}/reject",
        json={"remark": "TEST_reject"}, timeout=30,
    )
    assert rej.status_code == 200
