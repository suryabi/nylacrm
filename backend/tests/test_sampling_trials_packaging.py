"""Backend tests for Sampling/Trials SKU packaging dropdown feature.

Covers:
- GET /api/performance/sampling-trials returns sku_options[].packaging_options
- units_per_package comes from master_skus.packaging_config.stock_out default
- POST/PUT /api/performance/sampling-trials persists packaging_type_id round-trip
"""
import os
import pytest
import requests

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL").rstrip("/")
EMAIL = "surya.yadavalli@nylaairwater.earth"
PASSWORD = "test123"


@pytest.fixture(scope="module")
def token():
    r = requests.post(f"{BASE_URL}/api/auth/login", json={"email": EMAIL, "password": PASSWORD}, timeout=30)
    assert r.status_code == 200, r.text
    j = r.json()
    tok = j.get("session_token") or j.get("token") or j.get("access_token")
    assert tok, j
    return tok


@pytest.fixture(scope="module")
def client(token):
    s = requests.Session()
    s.headers.update({"Authorization": f"Bearer {token}", "Content-Type": "application/json"})
    return s


@pytest.fixture(scope="module")
def sampling(client):
    r = client.get(f"{BASE_URL}/api/performance/sampling-trials", timeout=30)
    assert r.status_code == 200, r.text
    return r.json()


# ── GET sampling-trials shape ──────────────────────────────────────────
class TestSamplingTrialsGet:
    def test_has_leads_array(self, sampling):
        assert "leads" in sampling
        assert isinstance(sampling["leads"], list)

    def test_sku_options_have_packaging_options(self, sampling):
        found = False
        for lead in sampling["leads"]:
            for opt in lead.get("sku_options") or []:
                assert "packaging_options" in opt, f"missing packaging_options on sku_option: {opt}"
                assert isinstance(opt["packaging_options"], list)
                assert "units_per_package" in opt
                for p in opt["packaging_options"]:
                    assert "packaging_type_id" in p
                    assert "name" in p
                    assert "units_per_package" in p
                    assert "is_default" in p
                    assert isinstance(p["units_per_package"], int)
                    assert p["units_per_package"] > 0
                if opt["packaging_options"]:
                    found = True
        assert found, "No lead sku_options had packaging_options - test data missing"

    def test_default_units_matches_default_packaging(self, sampling):
        """When there is an is_default:true packaging, units_per_package must match its value."""
        checked = 0
        for lead in sampling["leads"]:
            for opt in lead.get("sku_options") or []:
                pkgs = opt.get("packaging_options") or []
                default_pkg = next((p for p in pkgs if p.get("is_default")), None)
                if default_pkg:
                    assert opt["units_per_package"] == default_pkg["units_per_package"], (
                        f"mismatch on {opt['sku']}: upp={opt['units_per_package']} default={default_pkg}"
                    )
                    checked += 1
                elif pkgs:
                    # fallback to first packaging
                    assert opt["units_per_package"] == pkgs[0]["units_per_package"]
                    checked += 1
        assert checked > 0

    def test_empire_restaurant_nyla_600ml_silver(self, sampling):
        """Per PRD: Empire Restaurant has Nyla – 600 ml / Silver with Carton-6 & Crate-12 (default)."""
        empire = next((l for l in sampling["leads"] if "empire" in (l.get("name") or "").lower()), None)
        if not empire:
            pytest.skip("Empire Restaurant lead not present in tenant")
        silver_600 = next(
            (o for o in empire.get("sku_options") or [] if "600" in o.get("sku", "") and "silver" in o.get("sku", "").lower()),
            None,
        )
        if not silver_600:
            pytest.skip("Nyla – 600 ml / Silver not proposed on Empire Restaurant")
        pkgs = silver_600.get("packaging_options") or []
        names = [p.get("name") for p in pkgs]
        upps = [p.get("units_per_package") for p in pkgs]
        assert len(pkgs) >= 2, f"expected 2 packaging options, got {pkgs}"
        assert 6 in upps and 12 in upps, f"expected 6 and 12 in upps={upps} names={names}"
        default = next((p for p in pkgs if p.get("is_default")), None)
        assert default is not None, "no default packaging flagged"
        assert default["units_per_package"] == 12, f"default should be Crate-12, got {default}"
        assert silver_600["units_per_package"] == 12


# ── Round-trip POST/PUT with packaging_type_id ─────────────────────────
class TestSkuPlanPackagingRoundtrip:
    def _find_lead_with_sku(self, sampling):
        for lead in sampling["leads"]:
            for opt in lead.get("sku_options") or []:
                if opt.get("packaging_options"):
                    return lead, opt
        return None, None

    def test_create_trial_persists_packaging_type_id(self, client, sampling):
        lead, opt = self._find_lead_with_sku(sampling)
        if not lead:
            pytest.skip("No lead with sku packaging_options")
        pkg = opt["packaging_options"][0]
        payload = {
            "lead_id": lead["id"],
            "trial_date": "2026-02-01",
            "duration_days": 3,
            "status": "not_started",
            "sku_plans": [
                {
                    "sku": opt["sku"],
                    "crates": 2,
                    "units_per_package": pkg["units_per_package"],
                    "packaging_type_id": pkg["packaging_type_id"],
                    "price_per_unit": opt.get("price_per_unit") or 10.0,
                }
            ],
            "notes": "TEST_packaging_roundtrip",
        }
        r = client.post(f"{BASE_URL}/api/performance/sampling-trials", json=payload, timeout=30)
        assert r.status_code == 200, r.text
        created = r.json()
        assert created.get("id")
        plans = created.get("sku_plans") or []
        assert len(plans) == 1
        assert plans[0].get("packaging_type_id") == pkg["packaging_type_id"]
        assert plans[0].get("units_per_package") == pkg["units_per_package"]

        # Verify persistence via GET
        r2 = client.get(f"{BASE_URL}/api/performance/sampling-trials", timeout=30)
        assert r2.status_code == 200
        trials = r2.json().get("trials") or []
        t = next((x for x in trials if x.get("id") == created["id"]), None)
        assert t is not None, "created trial not returned on list"
        assert t["sku_plans"][0]["packaging_type_id"] == pkg["packaging_type_id"]

        # Amount correctness: crates * units_per_package * price_per_unit
        expected = 2 * pkg["units_per_package"] * (opt.get("price_per_unit") or 10.0)
        assert abs(t["total_amount"] - expected) < 0.01, f"amount mismatch: got {t['total_amount']} expected {expected}"

        # PUT update to different packaging if available
        if len(opt["packaging_options"]) >= 2:
            pkg2 = opt["packaging_options"][1]
            upd = {
                "sku_plans": [
                    {
                        "sku": opt["sku"],
                        "crates": 3,
                        "units_per_package": pkg2["units_per_package"],
                        "packaging_type_id": pkg2["packaging_type_id"],
                        "price_per_unit": opt.get("price_per_unit") or 10.0,
                    }
                ]
            }
            r3 = client.put(f"{BASE_URL}/api/performance/sampling-trials/{created['id']}", json=upd, timeout=30)
            assert r3.status_code == 200, r3.text
            updated = r3.json()
            assert updated["sku_plans"][0]["packaging_type_id"] == pkg2["packaging_type_id"]
            assert updated["sku_plans"][0]["units_per_package"] == pkg2["units_per_package"]

        # Cleanup
        rd = client.delete(f"{BASE_URL}/api/performance/sampling-trials/{created['id']}", timeout=30)
        assert rd.status_code == 200
