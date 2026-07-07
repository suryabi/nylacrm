"""
Iteration 309 — Production batch effective bottles_per_crate enrichment.

Verifies that GET /api/production/batches/{batch_id} always returns a
trustworthy bottles_per_crate (>1 for crate-based SKUs), even when the
batch document has a missing/<=1 stored value. Backend helper:
production_qc._effective_bottles_per_crate.
"""
import os
import pytest
import requests

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "").rstrip("/")
if not BASE_URL:
    with open("/app/frontend/.env") as f:
        for line in f:
            if line.startswith("REACT_APP_BACKEND_URL="):
                BASE_URL = line.split("=", 1)[1].strip().rstrip("/")

TENANT = "nyla-air-water"
EMAIL = "surya.yadavalli@nylaairwater.earth"
PASSWORD = "test123"

NYLA_330_SILVER_BATCH = "87ebf40f-9947-4713-81d3-572730f54def"
NYLA_330_SILVER_SKU = "b39203a7-4067-458b-a316-5831a98be946"


@pytest.fixture(scope="module")
def token():
    r = requests.post(
        f"{BASE_URL}/api/auth/login",
        json={"email": EMAIL, "password": PASSWORD, "tenant_id": TENANT},
        timeout=15,
    )
    assert r.status_code == 200, r.text
    d = r.json()
    tok = d.get("session_token") or d.get("token") or d.get("access_token")
    assert tok
    return tok


@pytest.fixture(scope="module")
def headers(token):
    return {"Authorization": f"Bearer {token}", "X-Tenant-ID": TENANT}


def test_nyla_330_silver_batch_bpc_greater_than_one(headers):
    """The referenced batch must expose a crate size > 1."""
    r = requests.get(
        f"{BASE_URL}/api/production/batches/{NYLA_330_SILVER_BATCH}",
        headers=headers,
        timeout=15,
    )
    assert r.status_code == 200, r.text
    body = r.json()
    bpc = body.get("bottles_per_crate")
    assert isinstance(bpc, int)
    assert bpc > 1, f"Expected bottles_per_crate>1, got {bpc}"
    assert body.get("sku_id") == NYLA_330_SILVER_SKU


def test_sku_master_has_crate_packaging(headers):
    """Sanity check on the source SKU (used by the fallback path)."""
    r = requests.get(
        f"{BASE_URL}/api/master-skus/{NYLA_330_SILVER_SKU}",
        headers=headers,
        timeout=15,
    )
    if r.status_code in (404, 405):
        pytest.skip("master-skus/{id} endpoint not exposed; core batch test covers the fix")
    assert r.status_code == 200, r.text
    sku = r.json()
    pc = sku.get("packaging_config") or {}
    crate_units = None
    for key in ("production", "stock_out", "master", "stock_in"):
        for p in pc.get(key, []) or []:
            try:
                u = int(p.get("units_per_package") or 0)
            except (TypeError, ValueError):
                u = 0
            if u > 1:
                crate_units = u
                break
        if crate_units:
            break
    assert crate_units and crate_units > 1, (
        f"SKU should have multi-unit packaging for fallback to work; "
        f"packaging_config={pc}"
    )


def test_all_batches_expose_valid_bpc(headers):
    """Scan a page of batches — endpoint must never return bpc <=0."""
    r = requests.get(
        f"{BASE_URL}/api/production/batches",
        headers=headers,
        params={"limit": 20},
        timeout=20,
    )
    assert r.status_code == 200, r.text
    data = r.json()
    batches = data if isinstance(data, list) else data.get("batches") or data.get("items") or []
    if not batches:
        pytest.skip("No batches returned by list endpoint")
    checked = 0
    for b in batches[:10]:
        bid = b.get("id")
        if not bid:
            continue
        rd = requests.get(
            f"{BASE_URL}/api/production/batches/{bid}", headers=headers, timeout=15
        )
        if rd.status_code != 200:
            continue
        bpc = rd.json().get("bottles_per_crate")
        assert isinstance(bpc, int) and bpc >= 1, (
            f"Batch {bid} returned invalid bpc={bpc}"
        )
        checked += 1
    assert checked > 0, "Could not verify any batch detail response"
