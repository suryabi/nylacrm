"""Light tests for Customer Stock Dashboard `Table by distributor` extensions."""
import os
import requests
import pytest

def _load_frontend_env():
    p = "/app/frontend/.env"
    if os.path.exists(p):
        for line in open(p):
            if line.startswith("REACT_APP_BACKEND_URL="):
                return line.split("=", 1)[1].strip().rstrip("/")
    return os.environ.get("REACT_APP_BACKEND_URL", "").rstrip("/")

BASE = _load_frontend_env()
CEO_EMAIL = "surya.yadavalli@nylaairwater.earth"
CEO_PASSWORD = "test123"
TENANT = "nyla-air-water"


@pytest.fixture(scope="module")
def auth_headers():
    r = requests.post(f"{BASE}/api/auth/login", json={"email": CEO_EMAIL, "password": CEO_PASSWORD}, timeout=30)
    assert r.status_code == 200, r.text
    tok = r.json().get("session_token") or r.json().get("token") or r.json().get("access_token")
    assert tok, r.json()
    return {"Authorization": f"Bearer {tok}", "X-Tenant-ID": TENANT}


def test_csd_returns_distributor_and_brand_group_fields(auth_headers):
    r = requests.get(f"{BASE}/api/distributor/customer-stock-dashboard", headers=auth_headers, timeout=60)
    assert r.status_code == 200, r.text
    data = r.json()
    assert "filters" in data and "distributors" in data["filters"]
    tiles = data.get("tiles") or []
    assert tiles, "expected tiles"
    seed = [t for t in tiles if t.get("account_id", "").startswith("seed-csd-acct-")]
    assert seed, "expected seed-csd-acct-* tiles"
    for t in seed:
        assert "distributor_id" in t
        assert isinstance(t.get("distributor_name"), str) and t["distributor_name"]
        assert isinstance(t.get("brand_group_names"), list)
        assert t["distributor_name"] == "Brian", f"seed tile {t['account_id']} distributor={t['distributor_name']}"


def test_csd_filter_by_account(auth_headers):
    r = requests.get(f"{BASE}/api/distributor/customer-stock-dashboard",
                     params={"account_id": "seed-csd-acct-7"}, headers=auth_headers, timeout=60)
    assert r.status_code == 200
    tiles = r.json().get("tiles") or []
    assert len(tiles) == 1 and tiles[0]["account_id"] == "seed-csd-acct-7"
    assert tiles[0]["distributor_name"] == "Brian"


def test_csd_unassigned_string_when_none(auth_headers):
    r = requests.get(f"{BASE}/api/distributor/customer-stock-dashboard", headers=auth_headers, timeout=60)
    tiles = r.json().get("tiles") or []
    # ensure every tile has a non-empty distributor_name (Unassigned when none)
    for t in tiles:
        assert t.get("distributor_name"), f"tile {t.get('account_id')} missing distributor_name"
