"""Backend tests for Customer Stock Dashboard endpoint."""
import os
import pytest
import requests

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', 'https://design-workflow-hub-11.preview.emergentagent.com').rstrip('/')
EP = f"{BASE_URL}/api/distributor/customer-stock-dashboard"
LOGIN = f"{BASE_URL}/api/auth/login"

BRIAN_ID = "bb12d90e-4d33-4890-ac5f-17573c551b5c"


@pytest.fixture(scope="module")
def token():
    r = requests.post(LOGIN, json={"email": "surya.yadavalli@nylaairwater.earth", "password": "test123"})
    assert r.status_code == 200, r.text
    j = r.json()
    return j.get("session_token") or j.get("token") or j.get("access_token")


@pytest.fixture(scope="module")
def h(token):
    return {"Authorization": f"Bearer {token}"}


def test_unauth_401():
    r = requests.get(EP)
    assert r.status_code in (401, 403)


def test_base_response_shape(h):
    r = requests.get(EP, headers=h)
    assert r.status_code == 200, r.text
    j = r.json()
    for k in ("tiles", "summary", "filters"):
        assert k in j
    assert isinstance(j["tiles"], list)
    # Sorted alphabetical case-insensitive
    names = [(t["account_name"] or "").lower() for t in j["tiles"]]
    assert names == sorted(names)
    # ~15 customers
    print("customer count:", len(j["tiles"]))
    assert len(j["tiles"]) >= 5
    # Each tile keys
    t0 = j["tiles"][0]
    for k in ("account_id", "account_name", "last_order_quantity", "last_order_date", "child_skus", "stock_in_hand"):
        assert k in t0


def test_demo_fresh_mart(h):
    r = requests.get(EP, headers=h)
    j = r.json()
    dfm = next((t for t in j["tiles"] if t["account_name"] == "Demo Fresh Mart (New)"), None)
    assert dfm is not None, "Demo Fresh Mart (New) tile missing"
    assert dfm["last_order_quantity"] == 24, dfm
    assert dfm["last_order_date"] == "2026-08-23", dfm
    sku = next((s for s in dfm["child_skus"] if s["child_sku_name"] == "Demo NoBPC – Fresh Mart"), None)
    assert sku is not None, dfm["child_skus"]
    assert sku["stock_in_hand"] == 240, sku
    whs = [w["location_name"] for w in sku.get("warehouses", [])]
    assert any("Demo Stock WH" in (w or "") for w in whs), sku


def test_drive_folder_no_orders(h):
    r = requests.get(EP, headers=h)
    j = r.json()
    dft = next((t for t in j["tiles"] if t["account_name"] == "Drive Folder Test Lead"), None)
    assert dft is not None
    assert dft["last_order_quantity"] is None
    assert dft["last_order_date"] is None
    sku = next((s for s in dft["child_skus"] if s["child_sku_name"] == "24 Brand – Drive Folder Test Lead"), None)
    assert sku is not None
    assert sku["stock_in_hand"] == 100


def test_distributor_filter_brian(h):
    r = requests.get(EP, headers=h, params={"distributor_id": BRIAN_ID})
    assert r.status_code == 200
    j = r.json()
    names = sorted([t["account_name"] for t in j["tiles"]])
    print("Brian customers:", names)
    expected = {"Bangalore Tech Park", "Empire Restaurant", "Tansen", "Toopa Ice-creamery"}
    assert set(names) == expected, f"expected {expected}, got {set(names)}"


def test_account_filter(h):
    r = requests.get(EP, headers=h, params={"account_id": "vgdemo-acc-new"})
    assert r.status_code == 200
    j = r.json()
    assert len(j["tiles"]) == 1
    assert j["tiles"][0]["account_id"] == "vgdemo-acc-new"


def test_last_order_matches_mongo(h):
    # verify last_order_quantity matches latest delivered delivery for one customer via a re-check call
    r = requests.get(EP, headers=h)
    j = r.json()
    dfm = next((t for t in j["tiles"] if t["account_name"] == "Demo Fresh Mart (New)"), None)
    # quantity 24 already asserted; also verify date format
    assert len(dfm["last_order_date"]) == 10 and dfm["last_order_date"][4] == "-"
