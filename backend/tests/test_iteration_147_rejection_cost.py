"""Iteration 147 — Rejection Cost Module (Stage × Reason → impacted COGS components).

Covers:
- GET /api/production/rejection-cost-config
- POST/GET/DELETE /api/production/rejection-cost-mappings (upsert behavior)
- POST /api/production/rejection-cost-calculate (PET 7.5+12.25 → 19.75 unit, 197.50 for qty=10)
- Reason fallback by reason_name
- Missing mapping returns total_cost=0 with missing_mapping=True
- /rejection-report enriched with cost_of_rejection and total_cost
- Old /rejection-cost-rules endpoints are removed (regression)
"""
import os
import pytest
import requests

_url = os.environ.get("REACT_APP_BACKEND_URL")
if not _url:
    try:
        with open("/app/frontend/.env") as _f:
            for _line in _f:
                if _line.startswith("REACT_APP_BACKEND_URL="):
                    _url = _line.split("=", 1)[1].strip()
                    break
    except Exception:
        pass
BASE_URL = (_url or "").rstrip("/")
EMAIL = "surya.yadavalli@nylaairwater.earth"
PASSWORD = "test123"
PET_SKU_ID = "ff23d238-07eb-4a5b-98c3-46e268a9e367"


@pytest.fixture(scope="module")
def session():
    s = requests.Session()
    s.headers.update({"Content-Type": "application/json"})
    r = s.post(f"{BASE_URL}/api/auth/login", json={"email": EMAIL, "password": PASSWORD})
    assert r.status_code == 200, f"login failed: {r.status_code} {r.text}"
    token = r.json().get("token") or r.json().get("access_token")
    if token:
        s.headers.update({"Authorization": f"Bearer {token}"})
    return s


@pytest.fixture(scope="module")
def config(session):
    r = session.get(f"{BASE_URL}/api/production/rejection-cost-config")
    assert r.status_code == 200, r.text
    return r.json()


# ── Config endpoint ──
class TestConfig:
    def test_config_has_components(self, config):
        comps = config["components"]
        assert isinstance(comps, list) and len(comps) >= 1
        keys = {c["key"] for c in comps}
        # System keys MUST not be present
        assert "outbound_logistics_cost" not in keys
        assert "distribution_cost" not in keys
        assert "gross_margin" not in keys
        # Expected master rupee keys present
        assert "primary_packaging_cost" in keys
        assert "manufacturing_variable_cost" in keys

    def test_config_has_stages(self, config):
        stages = config["stages"]
        assert isinstance(stages, list) and len(stages) >= 1
        names = {s["name"] for s in stages}
        assert "QC Stage 1" in names or len(names) > 0

    def test_config_has_reasons(self, config):
        reasons = config["reasons"]
        assert isinstance(reasons, list) and len(reasons) >= 1
        for r in reasons:
            assert "id" in r and "name" in r

    def test_config_has_mappings_field(self, config):
        assert "mappings" in config
        assert isinstance(config["mappings"], list)


# ── Mappings CRUD / upsert ──
class TestMappings:
    def _find_reason(self, config, name):
        for r in config["reasons"]:
            if r["name"].lower() == name.lower():
                return r["id"]
        return None

    def test_upsert_creates_then_updates(self, session, config):
        reason_id = self._find_reason(config, "Black Particles")
        assert reason_id, "Black Particles reason missing"
        # First create
        body = {
            "stage_name": "QC Stage 1",
            "reason_id": reason_id,
            "impacted_component_keys": ["primary_packaging_cost", "manufacturing_variable_cost"],
            "notes": "test create",
        }
        r1 = session.post(f"{BASE_URL}/api/production/rejection-cost-mappings", json=body)
        assert r1.status_code == 200, r1.text
        d1 = r1.json()
        assert d1["stage_name"] == "QC Stage 1"
        assert d1["reason_id"] == reason_id
        assert set(d1["impacted_component_keys"]) == {"primary_packaging_cost", "manufacturing_variable_cost"}
        first_id = d1["id"]

        # Second POST same (stage,reason) — should UPDATE same id (upsert)
        body2 = {**body, "impacted_component_keys": ["primary_packaging_cost"], "notes": "test update"}
        r2 = session.post(f"{BASE_URL}/api/production/rejection-cost-mappings", json=body2)
        assert r2.status_code == 200, r2.text
        d2 = r2.json()
        assert d2["id"] == first_id, "upsert should reuse same id"
        assert d2["impacted_component_keys"] == ["primary_packaging_cost"]
        assert d2["notes"] == "test update"

        # Restore for downstream calc tests
        body3 = {**body, "impacted_component_keys": ["primary_packaging_cost", "manufacturing_variable_cost"]}
        r3 = session.post(f"{BASE_URL}/api/production/rejection-cost-mappings", json=body3)
        assert r3.status_code == 200

    def test_upsert_filters_unknown_components(self, session, config):
        reason_id = self._find_reason(config, "Black Particles")
        body = {
            "stage_name": "QC Stage 1",
            "reason_id": reason_id,
            "impacted_component_keys": ["primary_packaging_cost", "manufacturing_variable_cost", "TOTALLY_BOGUS_KEY", "outbound_logistics_cost"],
        }
        r = session.post(f"{BASE_URL}/api/production/rejection-cost-mappings", json=body)
        assert r.status_code == 200
        keys = set(r.json()["impacted_component_keys"])
        assert "TOTALLY_BOGUS_KEY" not in keys
        # System keys are not in master rupee components → must be filtered out
        assert "outbound_logistics_cost" not in keys
        assert "primary_packaging_cost" in keys

    def test_upsert_404_for_unknown_reason(self, session):
        body = {
            "stage_name": "QC Stage 1",
            "reason_id": "non-existent-reason-id-xxx",
            "impacted_component_keys": [],
        }
        r = session.post(f"{BASE_URL}/api/production/rejection-cost-mappings", json=body)
        assert r.status_code == 404, r.text

    def test_list_mappings(self, session):
        r = session.get(f"{BASE_URL}/api/production/rejection-cost-mappings")
        assert r.status_code == 200
        items = r.json()
        assert isinstance(items, list)
        assert any(m.get("stage_name") == "QC Stage 1" for m in items)

    def test_delete_unknown_returns_404(self, session):
        r = session.delete(f"{BASE_URL}/api/production/rejection-cost-mappings/does-not-exist-xyz")
        assert r.status_code == 404

    def test_create_and_delete_roundtrip(self, session, config):
        reason_id = self._find_reason(config, "Cap Issues")
        if not reason_id:
            pytest.skip("Cap Issues reason missing")
        body = {
            "stage_name": "QC Stage 2",
            "reason_id": reason_id,
            "impacted_component_keys": ["cap"] if any(c["key"] == "cap" for c in config["components"]) else [],
        }
        r1 = session.post(f"{BASE_URL}/api/production/rejection-cost-mappings", json=body)
        assert r1.status_code == 200
        mid = r1.json()["id"]
        r2 = session.delete(f"{BASE_URL}/api/production/rejection-cost-mappings/{mid}")
        assert r2.status_code == 200
        # Verify gone via list
        r3 = session.get(f"{BASE_URL}/api/production/rejection-cost-mappings")
        assert all(m["id"] != mid for m in r3.json())


# ── Calculate ──
class TestCalculate:
    def _find_reason(self, config, name):
        for r in config["reasons"]:
            if r["name"].lower() == name.lower():
                return r["id"]
        return None

    def test_calculate_pet_black_particles_qty10(self, session, config):
        # Ensure SKU master values primary=7.5 mfg=12.25
        # The mapping was restored in TestMappings; here we assume PET has those values per the spec.
        # First set them deterministically:
        sku_r = session.put(
            f"{BASE_URL}/api/master-skus/{PET_SKU_ID}",
            json={"cogs_components_values": {"primary_packaging_cost": 7.5, "manufacturing_variable_cost": 12.25}},
        )
        assert sku_r.status_code in (200, 201), sku_r.text

        reason_id = self._find_reason(config, "Black Particles")
        body = {
            "sku_id": PET_SKU_ID,
            "stage_name": "QC Stage 1",
            "reason_id": reason_id,
            "qty_rejected": 10,
        }
        r = session.post(f"{BASE_URL}/api/production/rejection-cost-calculate", json=body)
        assert r.status_code == 200, r.text
        d = r.json()
        assert d["missing_mapping"] is False
        assert d["unit_cost"] == 19.75
        assert d["total_cost"] == 197.5
        assert len(d["breakdown"]) == 2
        labels = {b["component_key"]: b["unit_cost"] for b in d["breakdown"]}
        assert labels["primary_packaging_cost"] == 7.5
        assert labels["manufacturing_variable_cost"] == 12.25

    def test_calculate_no_mapping_returns_zero(self, session, config):
        # Use a stage that has no mapping for given reason
        reason_id = self._find_reason(config, "White Particles")
        if not reason_id:
            pytest.skip("White Particles reason missing")
        body = {
            "sku_id": PET_SKU_ID,
            "stage_name": "Labeling",  # no mapping configured for this stage+reason
            "reason_id": reason_id,
            "qty_rejected": 5,
        }
        r = session.post(f"{BASE_URL}/api/production/rejection-cost-calculate", json=body)
        assert r.status_code == 200
        d = r.json()
        assert d["missing_mapping"] is True
        assert d["total_cost"] == 0
        assert d["unit_cost"] == 0

    def test_calculate_by_reason_name_fallback(self, session):
        body = {
            "sku_id": PET_SKU_ID,
            "stage_name": "QC Stage 1",
            "reason_name": "Black Particles",  # no reason_id, only name
            "qty_rejected": 4,
        }
        r = session.post(f"{BASE_URL}/api/production/rejection-cost-calculate", json=body)
        assert r.status_code == 200
        d = r.json()
        assert d["missing_mapping"] is False
        assert d["unit_cost"] == 19.75
        assert d["total_cost"] == 79.0


# ── Rejection Report enrichment ──
class TestRejectionReport:
    def test_report_has_cost_fields(self, session):
        r = session.get(f"{BASE_URL}/api/production/rejection-report")
        assert r.status_code == 200, r.text
        d = r.json()
        assert "rows" in d and "total_cost" in d
        assert isinstance(d["total_cost"], (int, float))
        for row in d["rows"]:
            assert "cost_of_rejection" in row
            assert "missing_mapping" in row


# ── Regression: old endpoints removed ──
class TestRegression:
    def test_old_rules_endpoint_removed(self, session):
        r = session.get(f"{BASE_URL}/api/production/rejection-cost-rules")
        assert r.status_code in (404, 405), f"old endpoint must be gone, got {r.status_code}"

    def test_old_rules_post_removed(self, session):
        r = session.post(f"{BASE_URL}/api/production/rejection-cost-rules", json={})
        assert r.status_code in (404, 405)
