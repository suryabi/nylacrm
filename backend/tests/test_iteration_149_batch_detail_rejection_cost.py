"""
Iteration 149 — BatchDetail Rejection Cost regression tests.

Verifies the backend endpoints relied on by the BatchDetail RejectionPanel:
- GET /api/master-skus returns SKUs with cogs_components_values map (used to compute unit cost)
- GET /api/production/rejection-cost-mappings?sku_id=X returns SKU-scoped mappings
- GET /api/production/rejection-report still returns cost_of_rejection per row + total_cost
"""
import os
import pytest
import requests

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "").rstrip("/")
EMAIL = "surya.yadavalli@nylaairwater.earth"
PASSWORD = "test123"
SKU_PET = "ff23d238-07eb-4a5b-98c3-46e268a9e367"


@pytest.fixture(scope="module")
def client():
    s = requests.Session()
    s.headers.update({"Content-Type": "application/json"})
    r = s.post(f"{BASE_URL}/api/auth/login", json={"email": EMAIL, "password": PASSWORD}, timeout=20)
    if r.status_code != 200:
        pytest.skip(f"Login failed: {r.status_code} {r.text}")
    token = r.json().get("token") or r.json().get("access_token")
    if token:
        s.headers.update({"Authorization": f"Bearer {token}"})
    return s


# Master SKUs cogs_components_values
class TestMasterSkusCogs:
    def test_master_skus_returns_cogs_values(self, client):
        r = client.get(f"{BASE_URL}/api/master-skus", timeout=30)
        assert r.status_code == 200, r.text
        data = r.json()
        skus = data.get("skus") or data
        assert isinstance(skus, list) and len(skus) > 0
        # Every SKU should expose cogs_components_values (may be {} but key present, or absent)
        # Find PET specifically and validate prices
        pet = next((s for s in skus if s.get("id") == SKU_PET), None)
        assert pet is not None, "PET SKU not found in master-skus response"
        cogs = pet.get("cogs_components_values") or {}
        # Per main agent context: PET has primary 7.50 + mfg 12.25 + secondary 2.0
        assert isinstance(cogs, dict)
        # At least one of these keys must be set with a positive number
        has_any = any(
            float(cogs.get(k, 0) or 0) > 0
            for k in ["primary_packaging_cost", "manufacturing_variable_cost", "secondary_packaging_cost"]
        )
        assert has_any, f"PET cogs_components_values has no positive cost: {cogs}"


# Rejection cost mappings filtered by sku_id
class TestRejectionCostMappingsScoped:
    def test_mappings_scoped_to_sku(self, client):
        r = client.get(
            f"{BASE_URL}/api/production/rejection-cost-mappings",
            params={"sku_id": SKU_PET},
            timeout=15,
        )
        assert r.status_code == 200, r.text
        body = r.json()
        assert isinstance(body, list)
        # All rows must be scoped to PET
        assert all(m.get("sku_id") == SKU_PET for m in body)
        # Each mapping must expose stage_name + reason_name + impacted_component_keys for FE join
        for m in body:
            assert "stage_name" in m
            assert "reason_name" in m
            assert "impacted_component_keys" in m
            assert isinstance(m["impacted_component_keys"], list)


# Rejection report enrichment
class TestRejectionReportCost:
    def test_report_has_cost_columns(self, client):
        r = client.get(f"{BASE_URL}/api/production/rejection-report", timeout=30)
        assert r.status_code == 200, r.text
        data = r.json()
        assert "rows" in data and isinstance(data["rows"], list)
        assert "total_cost" in data
        assert isinstance(data["total_cost"], (int, float))
        for row in data["rows"][:25]:
            assert "cost_of_rejection" in row
            assert "missing_mapping" in row
            assert "sku_id" in row
            # cost should be numeric
            assert isinstance(row["cost_of_rejection"], (int, float))


# Batch listing → drill into one batch with rejections
class TestBatchWithRejections:
    def test_find_batch_with_rejections(self, client):
        # Lightweight check: get batches, find one with total_rejected>0
        # endpoint might be /api/production/batches
        r = client.get(f"{BASE_URL}/api/production/batches", timeout=30)
        if r.status_code != 200:
            pytest.skip(f"Batch list endpoint returned {r.status_code}")
        body = r.json()
        batches = body.get("batches") if isinstance(body, dict) else body
        if not isinstance(batches, list) or not batches:
            pytest.skip("No batches available in tenant")
        with_rej = [b for b in batches if (b.get("total_rejected") or 0) > 0]
        if not with_rej:
            pytest.skip("No batch with recorded rejections")
        b = with_rej[0]
        bid = b["id"]
        # Fetch detail + history
        rb = client.get(f"{BASE_URL}/api/production/batches/{bid}", timeout=15)
        assert rb.status_code == 200, rb.text
        detail = rb.json()
        sku_id = detail.get("sku_id")
        assert sku_id, "Batch detail must expose sku_id for FE cost calc"
        rh = client.get(f"{BASE_URL}/api/production/batches/{bid}/history", timeout=15)
        assert rh.status_code == 200, rh.text
        hist = rh.json()
        assert "inspections" in hist or "timeline" in hist
        # Now fetch sku-scoped mappings — must succeed even if empty
        rm = client.get(
            f"{BASE_URL}/api/production/rejection-cost-mappings",
            params={"sku_id": sku_id},
            timeout=15,
        )
        assert rm.status_code == 200
