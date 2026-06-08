"""Tests for batch picker on Stock In (Distributor primary shipments).

Validates that:
  - The new GET /api/distributor/stock-transfers/production-batches?sku_id=
    endpoint returns a list shape compatible with the Stock In dialog.
  - Creating a shipment to a `track_batches=true` distributor location now
    requires a batch_id on every line (matches Stock Out behaviour).
"""
import os
from pathlib import Path
import pytest
import requests


def _load_frontend_env():
    p = Path("/app/frontend/.env")
    if p.exists():
        for line in p.read_text().splitlines():
            if line.startswith("REACT_APP_BACKEND_URL="):
                return line.split("=", 1)[1].strip()
    return None


BASE_URL = (os.environ.get("REACT_APP_BACKEND_URL") or _load_frontend_env() or "").rstrip("/")
assert BASE_URL, "REACT_APP_BACKEND_URL not configured"
API = f"{BASE_URL}/api"

ADMIN_EMAIL = "surya.yadavalli@nylaairwater.earth"
ADMIN_PASSWORD = "test123"


@pytest.fixture(scope="module")
def hdr():
    r = requests.post(f"{API}/auth/login",
                      json={"email": ADMIN_EMAIL, "password": ADMIN_PASSWORD}, timeout=20)
    assert r.status_code == 200, r.text
    return {"Authorization": f"Bearer {r.json()['session_token']}"}


class TestProductionBatchesEndpoint:
    def test_404_unauth(self):
        r = requests.get(f"{API}/distributor/stock-transfers/production-batches?sku_id=any", timeout=20)
        assert r.status_code in (401, 403)

    def test_returns_shape(self, hdr):
        # Pull any SKU
        r = requests.get(f"{API}/master-skus", headers=hdr, timeout=20)
        assert r.status_code == 200
        body = r.json()
        skus = body.get("skus") or body.get("items") or body if isinstance(body, list) else body.get("skus") or []
        if not skus:
            pytest.skip("No SKUs in tenant")
        sku_id = skus[0]["id"]
        r = requests.get(f"{API}/distributor/stock-transfers/production-batches?sku_id={sku_id}",
                         headers=hdr, timeout=20)
        assert r.status_code == 200, r.text
        body = r.json()
        assert "batches" in body
        # Each row has the shape expected by the frontend picker
        for b in body["batches"][:3]:
            assert "batch_id" in b
            assert "batch_code" in b
            assert "quantity" in b

    def test_unknown_sku_returns_empty(self, hdr):
        r = requests.get(f"{API}/distributor/stock-transfers/production-batches?sku_id=does-not-exist",
                         headers=hdr, timeout=20)
        assert r.status_code == 200
        assert r.json().get("batches") == []


class TestShipmentDestinationBatchEnforcement:
    """When destination location has track_batches=True, creating a shipment
    without a batch_id on each line should be rejected with HTTP 400."""

    def test_dest_track_batches_requires_batch_id(self, hdr):
        # Find a distributor location with track_batches=True
        r = requests.get(f"{API}/distributors", headers=hdr, timeout=20)
        assert r.status_code == 200
        body = r.json()
        rows = body.get("distributors") or body.get("items") or body
        target_dist_id = None
        target_loc_id = None
        for d in rows:
            for loc in (d.get("locations") or []):
                if loc.get("track_batches") and loc.get("status") == "active":
                    target_dist_id = d.get("id")
                    target_loc_id = loc.get("id")
                    break
            if target_dist_id:
                break
        if not target_dist_id:
            pytest.skip("No distributor location with track_batches=true in this tenant")

        # Pull any SKU
        s = requests.get(f"{API}/master-skus", headers=hdr, timeout=20).json()
        sku_list = s.get("skus") or s.get("items") or (s if isinstance(s, list) else [])
        if not sku_list:
            pytest.skip("No SKUs available")
        sku = sku_list[0]

        payload = {
            "distributor_location_id": target_loc_id,
            "shipment_date": "2026-02-06",
            "items": [{
                "sku_id": sku["id"],
                "sku_name": sku.get("name") or sku.get("sku_name"),
                "quantity": 1,
                "unit_price": 100,
                "discount_percent": 0,
                "packaging_units": 1,
                # NOTE: no batch_id — should be rejected
            }],
        }
        r = requests.post(f"{API}/distributors/{target_dist_id}/shipments",
                          headers={**hdr, "Content-Type": "application/json"},
                          json=payload, timeout=30)
        assert r.status_code == 400, f"Expected 400 'batch required', got {r.status_code}: {r.text}"
        assert "batch" in r.text.lower()
