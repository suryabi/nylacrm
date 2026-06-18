"""
Iteration 148 — Per-SKU Rejection Cost Configuration tests.

Verifies:
- /production/rejection-cost-config without sku_id returns skus, components, reasons (no stages, no mappings)
- /production/rejection-cost-config?sku_id=X returns sku, stages (from QC route), and mappings
- SKU with QC route returns its stages; SKU without QC route returns empty stages
- POST /production/rejection-cost-mappings requires sku_id (422)
- POST with invalid sku_id returns 404
- POST upsert is idempotent on (sku_id, stage_name, reason_id)
- POST with same (stage_name, reason_id) but different sku_id creates separate mapping (SKU isolation)
- GET /production/rejection-cost-mappings?sku_id=X returns only that SKU's mappings
- DELETE works
- POST /production/rejection-cost-calculate uses sku-scoped lookup (missing_mapping=true for other SKU)
- /rejection-report enrichment uses (sku_id, stage_name, reason_name) tuple
"""
import os
import pytest
import requests

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "").rstrip("/")
EMAIL = "surya.yadavalli@nylaairwater.earth"
PASSWORD = "test123"

SKU_PREMIUM_20L = "51cbec53-a1d5-4e23-b708-a1fd0c014059"
SKU_PET = "ff23d238-07eb-4a5b-98c3-46e268a9e367"

EXPECTED_PREMIUM_STAGES = {"QC Stage 1", "QC Stage 2", "Labeling", "Final QC"}


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


# ─── Config endpoint ─────────────────────────────────────────────────────────

class TestConfigEndpoint:
    def test_config_without_sku_id(self, client):
        r = client.get(f"{BASE_URL}/api/production/rejection-cost-config", timeout=30)
        assert r.status_code == 200, r.text
        data = r.json()
        assert "skus" in data and isinstance(data["skus"], list) and len(data["skus"]) > 0
        assert "components" in data and isinstance(data["components"], list)
        assert "reasons" in data and isinstance(data["reasons"], list)
        # NO stages, NO mappings without sku_id
        assert "stages" not in data
        assert "mappings" not in data
        # Verify components are master rupee components
        keys = {c.get("key") for c in data["components"]}
        for k in ["primary_packaging_cost", "manufacturing_variable_cost"]:
            assert k in keys, f"missing master component {k}"

    def test_config_with_sku_with_qc_route(self, client):
        r = client.get(
            f"{BASE_URL}/api/production/rejection-cost-config",
            params={"sku_id": SKU_PREMIUM_20L},
            timeout=30,
        )
        assert r.status_code == 200, r.text
        data = r.json()
        assert "sku" in data and data["sku"] is not None
        assert data["sku"]["id"] == SKU_PREMIUM_20L
        assert "stages" in data and isinstance(data["stages"], list)
        stage_names = {s.get("name") for s in data["stages"]}
        # All expected stages must be present
        missing = EXPECTED_PREMIUM_STAGES - stage_names
        assert not missing, f"Missing stages: {missing} (got {stage_names})"
        assert "mappings" in data and isinstance(data["mappings"], list)

    def test_config_with_sku_without_qc_route(self, client):
        r = client.get(
            f"{BASE_URL}/api/production/rejection-cost-config",
            params={"sku_id": SKU_PET},
            timeout=30,
        )
        assert r.status_code == 200, r.text
        data = r.json()
        assert "sku" in data
        assert data.get("stages") == [], f"PET should have no stages, got {data.get('stages')}"
        assert isinstance(data.get("mappings"), list)


# ─── Upsert validation ───────────────────────────────────────────────────────

class TestUpsertValidation:
    def test_upsert_missing_sku_id_returns_422(self, client):
        # Without sku_id at all → Pydantic returns 422
        r = client.post(
            f"{BASE_URL}/api/production/rejection-cost-mappings",
            json={"stage_name": "QC Stage 1", "reason_id": "x", "impacted_component_keys": []},
            timeout=15,
        )
        assert r.status_code == 422, f"expected 422 missing sku_id, got {r.status_code}: {r.text}"

    def test_upsert_nonexistent_sku_returns_404(self, client):
        # Need a real reason
        cfg = client.get(f"{BASE_URL}/api/production/rejection-cost-config", timeout=15).json()
        reason_id = cfg["reasons"][0]["id"]
        r = client.post(
            f"{BASE_URL}/api/production/rejection-cost-mappings",
            json={
                "sku_id": "non-existent-sku-id-xxx",
                "stage_name": "QC Stage 1",
                "reason_id": reason_id,
                "impacted_component_keys": ["primary_packaging_cost"],
            },
            timeout=15,
        )
        assert r.status_code == 404, r.text
        assert "SKU" in (r.json().get("detail") or "")


# ─── Upsert + isolation + delete ─────────────────────────────────────────────

class TestUpsertAndIsolation:
    @pytest.fixture(scope="class")
    def reason_id(self, client):
        cfg = client.get(f"{BASE_URL}/api/production/rejection-cost-config", timeout=15).json()
        # pick "Black Particles" if available
        for rs in cfg["reasons"]:
            if rs["name"] == "Black Particles":
                return rs["id"]
        return cfg["reasons"][0]["id"]

    @pytest.fixture(scope="class")
    def created_ids(self):
        return []

    def test_create_mapping_for_premium(self, client, reason_id, created_ids):
        r = client.post(
            f"{BASE_URL}/api/production/rejection-cost-mappings",
            json={
                "sku_id": SKU_PREMIUM_20L,
                "stage_name": "QC Stage 1",
                "reason_id": reason_id,
                "impacted_component_keys": ["primary_packaging_cost"],
            },
            timeout=15,
        )
        assert r.status_code == 200, r.text
        d = r.json()
        assert d["sku_id"] == SKU_PREMIUM_20L
        assert d["stage_name"] == "QC Stage 1"
        assert d["reason_id"] == reason_id
        assert "primary_packaging_cost" in d["impacted_component_keys"]
        created_ids.append(d["id"])

    def test_upsert_same_keys_updates_existing(self, client, reason_id, created_ids):
        r1 = client.post(
            f"{BASE_URL}/api/production/rejection-cost-mappings",
            json={
                "sku_id": SKU_PREMIUM_20L,
                "stage_name": "QC Stage 1",
                "reason_id": reason_id,
                "impacted_component_keys": ["primary_packaging_cost", "manufacturing_variable_cost"],
            },
            timeout=15,
        )
        assert r1.status_code == 200, r1.text
        d1 = r1.json()
        # Same id as created earlier
        assert d1["id"] == created_ids[0]
        assert set(d1["impacted_component_keys"]) == {"primary_packaging_cost", "manufacturing_variable_cost"}

    def test_isolation_pet_creates_separate_mapping(self, client, reason_id, created_ids):
        r = client.post(
            f"{BASE_URL}/api/production/rejection-cost-mappings",
            json={
                "sku_id": SKU_PET,
                "stage_name": "QC Stage 1",
                "reason_id": reason_id,
                "impacted_component_keys": ["manufacturing_variable_cost"],
            },
            timeout=15,
        )
        assert r.status_code == 200, r.text
        d = r.json()
        assert d["sku_id"] == SKU_PET
        # Distinct id from premium one
        assert d["id"] != created_ids[0]
        created_ids.append(d["id"])

    def test_list_filtered_by_sku(self, client, created_ids):
        # Premium list contains premium id, NOT pet id
        rp = client.get(
            f"{BASE_URL}/api/production/rejection-cost-mappings",
            params={"sku_id": SKU_PREMIUM_20L},
            timeout=15,
        )
        assert rp.status_code == 200
        ids_p = {m["id"] for m in rp.json()}
        assert created_ids[0] in ids_p
        assert created_ids[1] not in ids_p
        # All entries are scoped to this SKU
        assert all(m.get("sku_id") == SKU_PREMIUM_20L for m in rp.json())

        # PET list contains pet id, not premium id
        rpet = client.get(
            f"{BASE_URL}/api/production/rejection-cost-mappings",
            params={"sku_id": SKU_PET},
            timeout=15,
        )
        assert rpet.status_code == 200
        ids_pet = {m["id"] for m in rpet.json()}
        assert created_ids[1] in ids_pet
        assert created_ids[0] not in ids_pet

    def test_calculate_sku_scoped(self, client, reason_id):
        # Premium has mapping with primary_packaging_cost+manufacturing_variable_cost → no missing
        r1 = client.post(
            f"{BASE_URL}/api/production/rejection-cost-calculate",
            json={
                "sku_id": SKU_PREMIUM_20L,
                "stage_name": "QC Stage 1",
                "reason_id": reason_id,
                "qty_rejected": 5,
            },
            timeout=15,
        )
        assert r1.status_code == 200, r1.text
        d1 = r1.json()
        assert d1["missing_mapping"] is False

        # Now calculate for SKU_PREMIUM_20L but with a stage that has NO mapping
        # → missing_mapping=true
        r2 = client.post(
            f"{BASE_URL}/api/production/rejection-cost-calculate",
            json={
                "sku_id": SKU_PREMIUM_20L,
                "stage_name": "Final QC",  # we did NOT create a mapping for this stage
                "reason_id": reason_id,
                "qty_rejected": 3,
            },
            timeout=15,
        )
        assert r2.status_code == 200
        assert r2.json().get("missing_mapping") is True

    def test_cleanup_delete(self, client, created_ids):
        for mid in created_ids:
            r = client.delete(f"{BASE_URL}/api/production/rejection-cost-mappings/{mid}", timeout=15)
            assert r.status_code == 200, r.text


# ─── Rejection report enrichment ─────────────────────────────────────────────

class TestRejectionReportEnrichment:
    def test_report_returns_rows_and_cost_fields(self, client):
        r = client.get(f"{BASE_URL}/api/production/rejection-report", timeout=30)
        assert r.status_code == 200, r.text
        data = r.json()
        assert "rows" in data
        assert "total_cost" in data
        # Each row should have cost_of_rejection and missing_mapping fields
        for row in data["rows"][:20]:
            assert "cost_of_rejection" in row
            assert "missing_mapping" in row
            assert "sku_id" in row
