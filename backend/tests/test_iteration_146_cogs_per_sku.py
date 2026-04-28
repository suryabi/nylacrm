"""
Tests for COGS-per-SKU feature (iteration 146):
- SKU master holds `cogs_components_values` dict (merge, not replace, on PUT)
- GET /api/cogs/{city} overlays master values onto each row
- Same SKU returns identical master values across cities
- PUT /api/cogs/{sku_id} dispatches master-managed keys back to SKU master
- System columns (outbound_logistics_cost, distribution_cost, gross_margin) stay per-city
- Calculator math correctness after overlay
- Regression: external_sku_id still returned
"""
import os
import pytest
import requests

_url = os.environ.get('REACT_APP_BACKEND_URL')
if not _url:
    # Fallback: read from frontend/.env
    try:
        with open('/app/frontend/.env') as f:
            for line in f:
                if line.startswith('REACT_APP_BACKEND_URL='):
                    _url = line.split('=', 1)[1].strip()
                    break
    except Exception:
        pass
assert _url, "REACT_APP_BACKEND_URL missing"
BASE_URL = _url.rstrip('/')
EMAIL = "surya.yadavalli@nylaairwater.earth"
PASSWORD = "test123"
TENANT = "nyla-air-water"

SYSTEM_KEYS = {"outbound_logistics_cost", "distribution_cost", "gross_margin"}


@pytest.fixture(scope="module")
def token():
    r = requests.post(f"{BASE_URL}/api/auth/login",
                      json={"email": EMAIL, "password": PASSWORD},
                      timeout=30)
    assert r.status_code == 200, f"login failed: {r.status_code} {r.text}"
    tok = r.json().get("session_token") or r.json().get("access_token") or r.json().get("token")
    assert tok, f"no token in {r.json()}"
    return tok


@pytest.fixture(scope="module")
def client(token):
    s = requests.Session()
    s.headers.update({"Authorization": f"Bearer {token}", "Content-Type": "application/json"})
    return s


@pytest.fixture(scope="module")
def pet_sku(client):
    """Locate the PET SKU (must be present per problem statement)."""
    r = client.get(f"{BASE_URL}/api/master-skus", timeout=30)
    assert r.status_code == 200, r.text
    skus = r.json()
    if isinstance(skus, dict):
        skus = skus.get("skus") or skus.get("data") or []
    pet = next((s for s in skus if (s.get("sku_name") or s.get("sku")) == "PET"), None)
    assert pet, f"PET SKU not found among {[s.get('sku_name') for s in skus]}"
    return pet


@pytest.fixture(scope="module")
def master_rupee_keys(client):
    r = client.get(f"{BASE_URL}/api/master/cogs-components", timeout=30)
    assert r.status_code == 200, r.text
    body = r.json()
    items = body if isinstance(body, list) else (body.get("components") or body.get("data") or [])
    keys = {c.get("key") for c in items if c.get("unit") == "rupee" and c.get("is_active", True)}
    return keys - SYSTEM_KEYS


# ---------- 1. master-skus shape -------------------------------------------------
class TestMasterSkusShape:
    def test_get_master_skus_includes_cogs_components_values(self, client):
        r = client.get(f"{BASE_URL}/api/master-skus", timeout=30)
        assert r.status_code == 200, r.text
        skus = r.json()
        if isinstance(skus, dict):
            skus = skus.get("skus") or skus.get("data") or []
        assert len(skus) > 0
        for s in skus:
            assert "cogs_components_values" in s, f"missing field on {s.get('sku_name')}"
            assert isinstance(s["cogs_components_values"], dict)

    def test_external_sku_id_regression(self, client):
        r = client.get(f"{BASE_URL}/api/master-skus", timeout=30)
        assert r.status_code == 200
        skus = r.json()
        if isinstance(skus, dict):
            skus = skus.get("skus") or skus.get("data") or []
        # Field should at least be present on returned SKUs (value can be None/empty)
        for s in skus:
            assert "external_sku_id" in s, f"external_sku_id missing on {s.get('sku_name')}"


# ---------- 2. PUT master-skus merge -----------------------------------------
class TestMasterSkuMerge:
    def test_put_merges_partial_cogs_components_values(self, client, pet_sku):
        # Seed initial values
        seed = {
            "primary_packaging_cost": 7.5,
            "manufacturing_variable_cost": 12.25,
            "secondary_packaging_cost": 0.5,
        }
        r = client.put(f"{BASE_URL}/api/master-skus/{pet_sku['id']}",
                       json={"cogs_components_values": seed}, timeout=30)
        assert r.status_code == 200, r.text
        vals = r.json().get("cogs_components_values") or {}
        for k, v in seed.items():
            assert float(vals.get(k)) == v, f"{k} not persisted: got {vals.get(k)}"

        # Patch only one key — others must stay
        r2 = client.put(f"{BASE_URL}/api/master-skus/{pet_sku['id']}",
                        json={"cogs_components_values": {"primary_packaging_cost": 8.0}},
                        timeout=30)
        assert r2.status_code == 200, r2.text
        vals2 = r2.json().get("cogs_components_values") or {}
        assert float(vals2["primary_packaging_cost"]) == 8.0
        assert float(vals2["manufacturing_variable_cost"]) == 12.25, "merge failed (mfg lost)"
        assert float(vals2["secondary_packaging_cost"]) == 0.5, "merge failed (sec lost)"

    def test_put_null_removes_key(self, client, pet_sku):
        # Add a transient custom key
        r = client.put(f"{BASE_URL}/api/master-skus/{pet_sku['id']}",
                       json={"cogs_components_values": {"_test_remove": 9.99}}, timeout=30)
        assert r.status_code == 200
        assert "_test_remove" in (r.json().get("cogs_components_values") or {})

        # Send null to remove
        r2 = client.put(f"{BASE_URL}/api/master-skus/{pet_sku['id']}",
                        json={"cogs_components_values": {"_test_remove": None}}, timeout=30)
        assert r2.status_code == 200, r2.text
        assert "_test_remove" not in (r2.json().get("cogs_components_values") or {}), \
            "null value should remove key"


# ---------- 3. Overlay on /cogs/{city} ----------------------------------------
class TestCogsOverlay:
    def test_overlay_legacy_keys_visible_in_calculator(self, client, pet_sku):
        # Set master values
        master = {"primary_packaging_cost": 7.5, "manufacturing_variable_cost": 12.25,
                  "secondary_packaging_cost": 0.5}
        client.put(f"{BASE_URL}/api/master-skus/{pet_sku['id']}",
                   json={"cogs_components_values": master}, timeout=30)

        r = client.get(f"{BASE_URL}/api/cogs/Hyderabad", timeout=30)
        assert r.status_code == 200, r.text
        rows = r.json().get("cogs_data", [])
        pet_row = next((x for x in rows if x.get("sku_name") == "PET"), None)
        assert pet_row, "PET row missing in Hyderabad COGS"
        assert "master_sku_id" in pet_row
        assert pet_row["master_sku_id"] == pet_sku["id"]
        assert float(pet_row.get("primary_packaging_cost", 0)) == 7.5
        assert float(pet_row.get("manufacturing_variable_cost", 0)) == 12.25
        assert float(pet_row.get("secondary_packaging_cost", 0)) == 0.5

    def test_same_sku_identical_across_cities(self, client, pet_sku):
        # Ensure baseline master values
        client.put(f"{BASE_URL}/api/master-skus/{pet_sku['id']}",
                   json={"cogs_components_values": {
                       "primary_packaging_cost": 7.5,
                       "manufacturing_variable_cost": 12.25,
                       "secondary_packaging_cost": 0.5,
                   }}, timeout=30)

        h = client.get(f"{BASE_URL}/api/cogs/Hyderabad", timeout=30).json().get("cogs_data", [])
        b = client.get(f"{BASE_URL}/api/cogs/Bangalore", timeout=30).json().get("cogs_data", [])
        ph = next((x for x in h if x["sku_name"] == "PET"), None)
        pb = next((x for x in b if x["sku_name"] == "PET"), None)
        assert ph and pb
        for k in ("primary_packaging_cost", "secondary_packaging_cost", "manufacturing_variable_cost"):
            assert float(ph.get(k, 0)) == float(pb.get(k, 0)), \
                f"{k} differs: HYD={ph.get(k)} BLR={pb.get(k)}"


# ---------- 4. PUT /cogs dispatches to master --------------------------------
class TestCogsDispatch:
    def test_put_cogs_legacy_key_updates_master(self, client, pet_sku):
        # Find PET row id in Hyderabad
        rows = client.get(f"{BASE_URL}/api/cogs/Hyderabad", timeout=30).json().get("cogs_data", [])
        pet_row = next((x for x in rows if x["sku_name"] == "PET"), None)
        assert pet_row
        cogs_id = pet_row["id"]

        new_primary = 9.99
        r = client.put(f"{BASE_URL}/api/cogs/{cogs_id}",
                       json={"primary_packaging_cost": new_primary}, timeout=30)
        assert r.status_code == 200, r.text

        # Verify master_skus reflects new value
        skus = client.get(f"{BASE_URL}/api/master-skus", timeout=30).json()
        if isinstance(skus, dict):
            skus = skus.get("skus") or skus.get("data") or []
        pet_master = next((s for s in skus if s["sku_name"] == "PET"), None)
        assert pet_master
        assert float(pet_master["cogs_components_values"]["primary_packaging_cost"]) == new_primary, \
            "Master not updated by PUT /cogs"

        # Verify another city overlays the new value
        b = client.get(f"{BASE_URL}/api/cogs/Bangalore", timeout=30).json().get("cogs_data", [])
        pb = next((x for x in b if x["sku_name"] == "PET"), None)
        assert float(pb["primary_packaging_cost"]) == new_primary, \
            "Bangalore did not pick up dispatched master value"

    def test_system_columns_stay_per_city(self, client, pet_sku):
        # Update outbound_logistics_cost in HYD only
        rows_h = client.get(f"{BASE_URL}/api/cogs/Hyderabad", timeout=30).json().get("cogs_data", [])
        pet_h = next((x for x in rows_h if x["sku_name"] == "PET"), None)
        assert pet_h
        hyd_logistics = 11.11
        r = client.put(f"{BASE_URL}/api/cogs/{pet_h['id']}",
                       json={"outbound_logistics_cost": hyd_logistics,
                             "distribution_cost": 5.0,
                             "gross_margin": 20.0}, timeout=30)
        assert r.status_code == 200, r.text

        # Master must NOT contain logistics/distribution/gross_margin
        skus = client.get(f"{BASE_URL}/api/master-skus", timeout=30).json()
        if isinstance(skus, dict):
            skus = skus.get("skus") or skus.get("data") or []
        pet_master = next((s for s in skus if s["sku_name"] == "PET"), None)
        master_vals = pet_master.get("cogs_components_values") or {}
        for k in SYSTEM_KEYS:
            assert k not in master_vals, f"system key {k} leaked into master_skus"

        # Bangalore row should NOT inherit Hyderabad's logistics value
        rows_b = client.get(f"{BASE_URL}/api/cogs/Bangalore", timeout=30).json().get("cogs_data", [])
        pet_b = next((x for x in rows_b if x["sku_name"] == "PET"), None)
        # Either different value or default 0 — must NOT equal HYD's
        # (allow equality only if both happen to be set independently — but Bangalore was untouched)
        assert float(pet_b.get("outbound_logistics_cost", 0)) != hyd_logistics or \
               pet_b["id"] == pet_h["id"], \
               "outbound_logistics_cost should not be shared between cities"


# ---------- 5. Calculator math --------------------------------------------------
class TestCalculatorMath:
    def test_total_cogs_and_landing_price(self, client, pet_sku):
        # Set master rupee components precisely
        client.put(f"{BASE_URL}/api/master-skus/{pet_sku['id']}",
                   json={"cogs_components_values": {
                       "primary_packaging_cost": 5.0,
                       "secondary_packaging_cost": 2.0,
                       "manufacturing_variable_cost": 3.0,
                   }}, timeout=30)

        # Set system columns in HYD
        rows = client.get(f"{BASE_URL}/api/cogs/Hyderabad", timeout=30).json().get("cogs_data", [])
        pet = next((x for x in rows if x["sku_name"] == "PET"), None)
        assert pet
        client.put(f"{BASE_URL}/api/cogs/{pet['id']}",
                   json={"outbound_logistics_cost": 4.0,
                         "distribution_cost": 10.0,
                         "gross_margin": 25.0}, timeout=30)

        rows = client.get(f"{BASE_URL}/api/cogs/Hyderabad", timeout=30).json().get("cogs_data", [])
        pet = next((x for x in rows if x["sku_name"] == "PET"), None)

        # We cannot know all custom rupee components in master — compute expected from
        # whatever total we observe. Validate landing_price formula instead:
        total = float(pet["total_cogs"])
        gm = total * (25.0 / 100)
        expected_landing = (total + gm) / (1 - 10.0 / 100)
        assert abs(float(pet["minimum_landing_price"]) - round(expected_landing, 2)) < 0.05, \
            f"landing price math wrong: total={total}, got={pet['minimum_landing_price']}, expected~{expected_landing}"

        # total must include at least the legacy 3 + logistics = 5+2+3+4 = 14
        assert total >= 14.0 - 0.01, f"total_cogs={total} should be >= 14 (5+2+3+4)"


# ---------- 6. cogs-components master excludes system keys --------------------
class TestCogsComponentsMaster:
    def test_no_system_keys_in_cogs_components_master(self, client):
        r = client.get(f"{BASE_URL}/api/master/cogs-components", timeout=30)
        assert r.status_code == 200, r.text
        body = r.json()
        items = body if isinstance(body, list) else (body.get("components") or body.get("data") or [])
        keys = {c.get("key") for c in items}
        for k in SYSTEM_KEYS:
            assert k not in keys, f"system key {k} should not exist in cogs_components master"
