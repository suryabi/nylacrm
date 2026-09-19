"""Backend tests for SKU Performance filters (iteration 383)."""
import os
import pytest
import requests

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "https://design-workflow-hub-11.preview.emergentagent.com").rstrip("/")
TENANT = "nyla-air-water"
EMAIL = "surya.yadavalli@nylaairwater.earth"
PASSWORD = "test123"


@pytest.fixture(scope="module")
def client():
    s = requests.Session()
    s.headers.update({"Content-Type": "application/json", "X-Tenant-ID": TENANT})
    r = s.post(f"{BASE_URL}/api/auth/login", json={"email": EMAIL, "password": PASSWORD}, headers={"X-Tenant-ID": TENANT})
    assert r.status_code == 200, f"login failed: {r.status_code} {r.text[:200]}"
    data = r.json()
    tok = data.get("token") or data.get("session_token") or data.get("access_token")
    assert tok, f"no token in login response: {data}"
    s.headers.update({"Authorization": f"Bearer {tok}"})
    return s


def _get(client, **params):
    params["time_filter"] = params.get("time_filter", "lifetime")
    r = client.get(f"{BASE_URL}/api/reports/sku-performance", params=params)
    assert r.status_code == 200, f"{params} -> {r.status_code} {r.text[:300]}"
    data = r.json()
    # flatten summary.total_achieved for convenience
    summary = data.get("summary") or {}
    if "total_achieved" not in data:
        data["total_achieved"] = summary.get("total_achieved", 0) or 0
    return data


def test_lifetime_baseline(client):
    d = _get(client)
    assert d.get("total_achieved", 0) > 0, f"expected total_achieved>0, got {d.get('total_achieved')}"
    opts = d.get("sku_options")
    assert isinstance(opts, list) and len(opts) >= 1, f"sku_options should be a non-empty list, got {opts}"


def test_territory_south_india_matches(client):
    d = _get(client, territory="South India")
    assert d.get("total_achieved", 0) > 0


def test_territory_west_india_zero(client):
    d = _get(client, territory="West India")
    assert d.get("total_achieved", 0) == 0


def test_state_goa_zero(client):
    d = _get(client, state="Goa")
    assert d.get("total_achieved", 0) == 0


def test_city_hyderabad_positive(client):
    d = _get(client, city="Hyderabad")
    assert d.get("total_achieved", 0) > 0


def test_resource_ceo_positive(client):
    d = _get(client, resource_id="7d03cff4-4db2-4b2e-969b-f5b3d57d58a6")
    assert d.get("total_achieved", 0) > 0


def test_resource_nobody_zero(client):
    d = _get(client, resource_id="nobody")
    assert d.get("total_achieved", 0) == 0


def test_account_toopa_positive_and_bounded(client):
    baseline = _get(client).get("total_achieved", 0)
    d = _get(client, account_id="81263309-2118-4d51-b1d9-fe9549da07b7")
    assert d.get("total_achieved", 0) > 0
    assert d["total_achieved"] <= baseline


def test_account_bogus_zero(client):
    d = _get(client, account_id="bogus")
    assert d.get("total_achieved", 0) == 0


def test_sku_filter_single_row(client):
    base = _get(client)
    opts = base.get("sku_options") or []
    assert opts
    first = opts[0]
    sku_name = first if isinstance(first, str) else (first.get("name") or first.get("label") or first.get("value"))
    d = _get(client, sku=sku_name)
    skus = d.get("skus") or []
    assert len(skus) == 1, f"expected 1 sku row got {len(skus)} for '{sku_name}'"
