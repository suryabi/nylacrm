"""Regression test for the 'duplicate SKU rows in Factory Warehouse Stock' bug.

The distributor stock-dashboard endpoint used to append one row per
`factory_warehouse_stock` document to `factory_warehouses[*].skus`, which
meant a SKU with N batches showed as N separate rows in the UI. The fix
aggregates per (warehouse, sku_id) so each SKU appears exactly once with
the total crate quantity.
"""
import os
from pathlib import Path
import pytest
import requests


def _backend_url():
    p = Path("/app/frontend/.env")
    if p.exists():
        for line in p.read_text().splitlines():
            if line.startswith("REACT_APP_BACKEND_URL="):
                return line.split("=", 1)[1].strip()
    return os.environ.get("REACT_APP_BACKEND_URL", "")


BASE = (_backend_url() or "").rstrip("/")
assert BASE, "REACT_APP_BACKEND_URL not configured"
API = f"{BASE}/api"


@pytest.fixture(scope="module")
def hdr():
    r = requests.post(
        f"{API}/auth/login",
        json={"email": "surya.yadavalli@nylaairwater.earth", "password": "test123"},
        timeout=20,
    )
    assert r.status_code == 200, r.text
    return {"Authorization": f"Bearer {r.json()['session_token']}"}


def test_factory_warehouse_skus_are_unique_per_warehouse(hdr):
    # Find a distributor whose stock dashboard surfaces factory warehouse stock
    rows = requests.get(f"{API}/distributors", headers=hdr, timeout=20).json()
    rows = rows.get("distributors") or rows
    seen_any = False
    for d in rows:
        r = requests.get(
            f"{API}/distributors/{d['id']}/stock-dashboard",
            headers=hdr,
            timeout=30,
        )
        if r.status_code != 200:
            continue
        body = r.json()
        for wh in body.get("factory_warehouses", []) or []:
            sku_ids = [s.get("sku_id") for s in (wh.get("skus") or [])]
            assert len(sku_ids) == len(set(sku_ids)), (
                f"Duplicate SKUs detected in warehouse '{wh.get('warehouse_name')}' "
                f"for distributor '{d.get('distributor_name')}': {sku_ids}"
            )
            # Quantities are positive ints (crates)
            for s in (wh.get("skus") or []):
                assert isinstance(s.get("quantity"), int) and s["quantity"] >= 0
            if wh.get("skus"):
                seen_any = True
    if not seen_any:
        pytest.skip("No factory warehouse stock surfaced for any distributor in this tenant")
