"""
Iteration 266 - SKU base_uom + Packaging Master (packaging_config.master) feature
Verifies:
- GET /api/master-skus returns base_uom ('Bottle' default) and packaging_config.master
- Migrated Nyla 600ml Silver SKU has the expected master packs (Crate-12=12, Crate-24=24, Carton-48=48, Carton-6=6)
- PUT /api/master-skus/{id} persists base_uom + packaging_config (master + per-flow arrays); GET round-trips
- POST/DELETE /api/master-skus creates and removes a SKU with packaging_config
"""

import os
import pytest
import requests
import copy

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', '').rstrip('/')


@pytest.fixture(scope="module")
def session():
    s = requests.Session()
    s.headers.update({"Content-Type": "application/json"})
    resp = s.post(f"{BASE_URL}/api/auth/login", json={
        "email": "surya.yadavalli@nylaairwater.earth",
        "password": "test123",
    })
    if resp.status_code != 200:
        pytest.skip(f"Login failed: {resp.status_code} {resp.text}")
    token = resp.json().get("session_token")
    if not token:
        pytest.skip("No session_token in login response")
    s.headers.update({"Authorization": f"Bearer {token}"})
    return s


@pytest.fixture(scope="module")
def all_skus(session):
    r = session.get(f"{BASE_URL}/api/master-skus")
    assert r.status_code == 200, f"GET /api/master-skus failed {r.status_code}"
    data = r.json()
    skus = data.get("skus", data if isinstance(data, list) else [])
    assert isinstance(skus, list) and len(skus) > 0
    return skus


class TestGetMasterSkusBaseUomAndMaster:
    def test_all_skus_have_base_uom_bottle(self, all_skus):
        missing = [s.get("sku") for s in all_skus if (s.get("base_uom") or "").strip() == ""]
        assert not missing, f"SKUs missing base_uom: {missing}"
        not_bottle = [s.get("sku") for s in all_skus if s.get("base_uom") != "Bottle"]
        # Per spec base_uom is always 'Bottle'
        assert not not_bottle, f"SKUs with non-'Bottle' base_uom: {not_bottle}"

    def test_all_skus_have_packaging_master(self, all_skus):
        bad = []
        for s in all_skus:
            pc = s.get("packaging_config") or {}
            master = pc.get("master")
            if not isinstance(master, list) or len(master) == 0:
                bad.append(s.get("sku"))
        assert not bad, f"SKUs missing packaging_config.master: {bad}"

    def test_nyla_600ml_silver_master_contents(self, all_skus):
        target = next((s for s in all_skus if s.get("sku") == "Nyla – 600 ml / Silver"), None)
        assert target is not None, "Nyla – 600 ml / Silver SKU not found"
        assert target.get("base_uom") == "Bottle"
        master = (target.get("packaging_config") or {}).get("master") or []
        # Build name->units map
        m = {p.get("packaging_type_name"): p.get("units_per_package") for p in master}
        # Required packs from spec
        # The migrated names may be either "Crate-12" or "Crate - 12" (spaces around hyphen) -
        # normalize by stripping spaces for comparison.
        def norm(s):
            return (s or "").replace(" ", "").lower()
        norm_map = {norm(k): v for k, v in m.items()}
        expected = {"Crate-12": 12, "Crate-24": 24, "Carton-48": 48, "Carton-6": 6}
        for name, units in expected.items():
            assert norm(name) in norm_map, f"Missing pack {name} in master for Nyla 600ml Silver. master={m}"
            assert int(norm_map[norm(name)]) == units, f"{name} expected {units} units, got {norm_map[norm(name)]}"


class TestPutMasterSkuPersistsPackagingConfig:
    def test_update_and_roundtrip(self, session, all_skus):
        # Pick the Nyla 600ml Silver SKU (has rich master); fall back to first SKU otherwise
        sku = next((s for s in all_skus if s.get("sku") == "Nyla – 600 ml / Silver"), None) or all_skus[0]
        sku_id = sku["id"]

        # Snapshot original payload to restore later
        original_pc = copy.deepcopy(sku.get("packaging_config") or {})
        original_base_uom = sku.get("base_uom") or "Bottle"

        # Build a new packaging_config: keep existing master, append a uniquely named test pack
        test_pack_name = "TEST_PACK_PYTEST_266"
        new_master = list(original_pc.get("master") or [])
        # Avoid duplicating if test reran
        new_master = [p for p in new_master if p.get("packaging_type_name") != test_pack_name]
        new_master.append({
            "packaging_type_id": "test-pack-266",
            "packaging_type_name": test_pack_name,
            "units_per_package": 7,
        })
        new_flow_entry = {
            "packaging_type_id": "test-pack-266",
            "packaging_type_name": test_pack_name,
            "units_per_package": 7,
            "is_default": True,
        }
        update_payload = {
            "base_uom": "Bottle",
            "packaging_config": {
                "master": new_master,
                "production": [new_flow_entry],
                "stock_in": [new_flow_entry],
                "stock_out": [new_flow_entry],
                "promo_stock_out": [new_flow_entry],
            },
        }

        put = session.put(f"{BASE_URL}/api/master-skus/{sku_id}", json=update_payload)
        assert put.status_code == 200, f"PUT failed: {put.status_code} {put.text}"

        # GET and verify persistence
        get_one = session.get(f"{BASE_URL}/api/master-skus")
        assert get_one.status_code == 200
        all_skus_after = get_one.json().get("skus", [])
        updated = next((s for s in all_skus_after if s["id"] == sku_id), None)
        assert updated is not None
        assert updated.get("base_uom") == "Bottle"

        pc = updated.get("packaging_config") or {}
        master_names = [p.get("packaging_type_name") for p in (pc.get("master") or [])]
        assert test_pack_name in master_names, f"Test pack not in master after update: {master_names}"
        for flow in ("production", "stock_in", "stock_out", "promo_stock_out"):
            arr = pc.get(flow) or []
            assert any(p.get("packaging_type_name") == test_pack_name and p.get("is_default") for p in arr), (
                f"Flow {flow} missing default test pack. arr={arr}"
            )

        # Restore original packaging_config + base_uom so catalog stays clean
        restore = session.put(f"{BASE_URL}/api/master-skus/{sku_id}", json={
            "base_uom": original_base_uom,
            "packaging_config": original_pc,
        })
        assert restore.status_code == 200, f"Restore PUT failed: {restore.status_code} {restore.text}"

        # Confirm restore took effect (test pack no longer there)
        verify = session.get(f"{BASE_URL}/api/master-skus").json().get("skus", [])
        v = next((s for s in verify if s["id"] == sku_id), None)
        restored_master_names = [p.get("packaging_type_name") for p in ((v or {}).get("packaging_config") or {}).get("master", [])]
        assert test_pack_name not in restored_master_names, "Test pack still present after restore"


class TestCreateAndDeleteMasterSku:
    def test_create_then_delete(self, session):
        payload = {
            "sku_name": "TEST_SKU_266_PYTEST",
            "category": "Other",
            "unit": "Bottle",
            "base_uom": "Bottle",
            "packaging_config": {
                "master": [
                    {"packaging_type_id": "p1", "packaging_type_name": "TEST_Pack_A", "units_per_package": 5},
                ],
                "production": [],
                "stock_in": [],
                "stock_out": [
                    {"packaging_type_id": "p1", "packaging_type_name": "TEST_Pack_A", "units_per_package": 5, "is_default": True},
                ],
                "promo_stock_out": [],
            },
        }
        created = session.post(f"{BASE_URL}/api/master-skus", json=payload)
        assert created.status_code in (200, 201), f"POST failed: {created.status_code} {created.text}"
        body = created.json()
        new_id = body.get("id") or body.get("sku_id")
        assert new_id, f"No id returned: {body}"

        # GET and verify
        listing = session.get(f"{BASE_URL}/api/master-skus").json().get("skus", [])
        match = next((s for s in listing if s["id"] == new_id), None)
        assert match is not None, "Newly-created SKU not found in listing"
        assert match.get("base_uom") == "Bottle"
        master = (match.get("packaging_config") or {}).get("master") or []
        assert any(p.get("packaging_type_name") == "TEST_Pack_A" and int(p.get("units_per_package")) == 5 for p in master)
        stock_out = (match.get("packaging_config") or {}).get("stock_out") or []
        assert any(p.get("packaging_type_name") == "TEST_Pack_A" and p.get("is_default") for p in stock_out)

        # Cleanup - CEO hard delete
        d = session.delete(f"{BASE_URL}/api/master-skus/{new_id}")
        assert d.status_code in (200, 204), f"Delete failed: {d.status_code} {d.text}"

        # Verify gone
        listing2 = session.get(f"{BASE_URL}/api/master-skus").json().get("skus", [])
        assert not any(s["id"] == new_id for s in listing2), "SKU still present after delete"


if __name__ == "__main__":
    pytest.main([__file__, "-v", "--tb=short"])
