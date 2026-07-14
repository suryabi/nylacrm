"""Iteration 323 — Branded Stock by Customer sections.

Verifies that the new `branded_stock` array is present, correctly shaped and
correctly populated for:
  - GET /api/distributors/dashboard/stock-summary  (tenant-wide)
  - GET /api/distributors/{id}/stock-dashboard     (per distributor)

Also asserts regression: the existing top-level keys of both endpoints
(summary, by_distributor, by_sku, by_location, cities // totals, skus,
factory_warehouses, bottle_tracking) are still present and populated.

Seed context (nyla-air-water, unchanged from iteration_322):
  PARENT SKU:     8bc87348-5398-4604-92d8-eff59610b7f9  (24 Brand)
  BRANDED CHILD:  ba79db11-532d-49a8-b629-d5a27c04d281  (24 Brand – Drive Folder Test Lead)
  OWNER ACCOUNT:  56b872b1-02e7-4a99-8391-8558c968f450  (Drive Folder Test Lead)
  DIST b8876367:  b8876367-df64-4c55-a382-d5eb3b4b2380  (has 200 branded + 200 generic bottles at
                  the "Default master" factory warehouse for the 24 Brand SKU).
  Tenant-wide totals for 24 Brand branded_stock section (per problem statement):
    total_quantity=409, generic_total=209, customer_total=200
    (the extra 9 generic bottles live at Noida Factory Warehouse)
"""
from __future__ import annotations
import os
import pytest
import requests


def _read_frontend_env_url():
    try:
        with open("/app/frontend/.env", "r") as f:
            for line in f:
                if line.strip().startswith("REACT_APP_BACKEND_URL="):
                    return line.split("=", 1)[1].strip().strip('"').strip("'")
    except OSError:
        pass
    return ""


BASE_URL = (os.environ.get("REACT_APP_BACKEND_URL") or _read_frontend_env_url()).rstrip("/")
assert BASE_URL, "REACT_APP_BACKEND_URL required"

TENANT_ID = "nyla-air-water"
EMAIL = "surya.yadavalli@nylaairwater.earth"
PASSWORD = "test123"

PARENT_SKU_ID = "8bc87348-5398-4604-92d8-eff59610b7f9"
BRANDED_CHILD_ID = "ba79db11-532d-49a8-b629-d5a27c04d281"
OWNER_ACCOUNT_ID = "56b872b1-02e7-4a99-8391-8558c968f450"
OWNER_ACCOUNT_NAME = "Drive Folder Test Lead"
DIST_ID = "b8876367-df64-4c55-a382-d5eb3b4b2380"
FACTORY_LOC_NAME = "Default master"


# ────────────────────────────── fixtures ──────────────────────────────

@pytest.fixture(scope="module")
def client():
    s = requests.Session()
    r = s.post(
        f"{BASE_URL}/api/auth/login",
        json={"email": EMAIL, "password": PASSWORD},
        timeout=30,
    )
    assert r.status_code == 200, f"login failed: {r.status_code} {r.text}"
    tok = r.json().get("session_token")
    assert tok, "session_token missing in login response"
    s.headers.update({
        "Authorization": f"Bearer {tok}",
        "X-Tenant-ID": TENANT_ID,
        "Content-Type": "application/json",
    })
    yield s


@pytest.fixture(scope="module")
def summary_json(client):
    r = client.get(f"{BASE_URL}/api/distributors/dashboard/stock-summary", timeout=60)
    assert r.status_code == 200, f"stock-summary failed: {r.status_code} {r.text}"
    return r.json()


@pytest.fixture(scope="module")
def dist_dashboard_json(client):
    r = client.get(f"{BASE_URL}/api/distributors/{DIST_ID}/stock-dashboard", timeout=60)
    assert r.status_code == 200, f"per-distributor dashboard failed: {r.status_code} {r.text}"
    return r.json()


# ─────────────────── 1) Global stock-summary: shape ───────────────────

class TestStockSummaryShape:

    def test_existing_keys_still_present(self, summary_json):
        # Regression — problem statement lists these five legacy keys.
        for k in ["summary", "by_distributor", "by_sku", "by_location", "cities"]:
            assert k in summary_json, f"missing legacy key: {k}"
        assert isinstance(summary_json["summary"], dict)
        assert isinstance(summary_json["by_distributor"], list)
        assert isinstance(summary_json["by_sku"], list)
        assert isinstance(summary_json["by_location"], list)
        assert isinstance(summary_json["cities"], list)

    def test_branded_stock_key_present_and_is_list(self, summary_json):
        assert "branded_stock" in summary_json
        assert isinstance(summary_json["branded_stock"], list)

    def test_by_sku_populated(self, summary_json):
        # Sanity — legacy report has SKU rows for this tenant.
        assert len(summary_json["by_sku"]) > 0


# ────────────── 2) Global stock-summary: branded_stock content ──────────────

class TestStockSummaryBrandedContent:

    def _find_section(self, sections, sku_id):
        for s in sections:
            if s.get("sku_id") == sku_id:
                return s
        return None

    def test_one_section_for_24brand(self, summary_json):
        sections = summary_json["branded_stock"]
        # Must contain the seeded 24 Brand section (there may be more branded
        # parents in the tenant — assert on the one from the spec).
        sec = self._find_section(sections, PARENT_SKU_ID)
        assert sec is not None, (
            f"branded_stock missing section for parent SKU {PARENT_SKU_ID}. "
            f"Got sku_ids: {[s.get('sku_id') for s in sections]}"
        )

    def test_section_totals_24brand(self, summary_json):
        sec = self._find_section(summary_json["branded_stock"], PARENT_SKU_ID)
        assert sec is not None
        assert sec.get("sku_name") == "24 Brand", f"unexpected sku_name: {sec.get('sku_name')}"
        assert sec.get("total_quantity") == 409, f"total_quantity mismatch: {sec.get('total_quantity')}"
        assert sec.get("generic_total") == 209, f"generic_total mismatch: {sec.get('generic_total')}"
        assert sec.get("customer_total") == 200, f"customer_total mismatch: {sec.get('customer_total')}"

    def test_section_top_level_keys(self, summary_json):
        sec = self._find_section(summary_json["branded_stock"], PARENT_SKU_ID)
        for k in ["sku_id", "sku_name", "total_quantity",
                  "generic_total", "customer_total", "generic", "customers"]:
            assert k in sec, f"section missing key {k}"
        assert isinstance(sec["generic"], list)
        assert isinstance(sec["customers"], list)

    def test_generic_entries_shape(self, summary_json):
        sec = self._find_section(summary_json["branded_stock"], PARENT_SKU_ID)
        assert len(sec["generic"]) > 0
        for entry in sec["generic"]:
            for k in ["child_sku_name", "quantity", "locations"]:
                assert k in entry, f"generic entry missing key {k}: {entry}"
            assert isinstance(entry["locations"], list)
            for loc in entry["locations"]:
                for k in ["location_id", "location_name", "quantity", "is_factory"]:
                    assert k in loc, f"generic loc missing {k}: {loc}"
        # generic quantities should sum to generic_total.
        assert sum(e["quantity"] for e in sec["generic"]) == sec["generic_total"]

    def test_customers_contains_drive_folder(self, summary_json):
        sec = self._find_section(summary_json["branded_stock"], PARENT_SKU_ID)
        matches = [c for c in sec["customers"] if c.get("customer_name") == OWNER_ACCOUNT_NAME]
        assert matches, (
            f"customer '{OWNER_ACCOUNT_NAME}' missing. Got: "
            f"{[c.get('customer_name') for c in sec['customers']]}"
        )
        cust = matches[0]
        assert cust.get("total_quantity") == 200, f"expected 200, got {cust.get('total_quantity')}"
        assert isinstance(cust.get("children"), list) and cust["children"], "customer children empty"
        for ch in cust["children"]:
            for k in ["child_sku_id", "child_sku_name", "quantity", "locations"]:
                assert k in ch, f"customer child missing {k}: {ch}"
            for loc in ch["locations"]:
                for k in ["location_id", "location_name", "quantity"]:
                    assert k in loc


# ───────────────── 3) Per-distributor dashboard: shape/regression ─────────────────

class TestDistributorDashboardShape:

    def test_existing_keys_still_present(self, dist_dashboard_json):
        # Regression — original per-distributor keys must not vanish.
        for k in ["totals", "skus", "factory_warehouses", "bottle_tracking"]:
            assert k in dist_dashboard_json, f"missing legacy key: {k}"

    def test_branded_stock_key_present(self, dist_dashboard_json):
        assert "branded_stock" in dist_dashboard_json
        assert isinstance(dist_dashboard_json["branded_stock"], list)

    def test_skus_populated(self, dist_dashboard_json):
        assert isinstance(dist_dashboard_json["skus"], list)
        assert len(dist_dashboard_json["skus"]) > 0


# ───────────── 4) Per-distributor dashboard: branded_stock content ─────────────

class TestDistributorDashboardBrandedContent:

    def _find_section(self, sections, sku_id):
        for s in sections:
            if s.get("sku_id") == sku_id:
                return s
        return None

    def test_exactly_one_section(self, dist_dashboard_json):
        sections = dist_dashboard_json["branded_stock"]
        # Per spec: 1 section for distributor b8876367 (only 24 Brand has branding here).
        assert len(sections) == 1, (
            f"expected 1 branded section, got {len(sections)}: "
            f"{[(s.get('sku_id'), s.get('sku_name')) for s in sections]}"
        )

    def test_24brand_totals(self, dist_dashboard_json):
        sec = self._find_section(dist_dashboard_json["branded_stock"], PARENT_SKU_ID)
        assert sec is not None
        assert sec.get("sku_name") == "24 Brand"
        assert sec.get("total_quantity") == 400, f"total_quantity: {sec.get('total_quantity')}"
        assert sec.get("generic_total") == 200, f"generic_total: {sec.get('generic_total')}"
        assert sec.get("customer_total") == 200, f"customer_total: {sec.get('customer_total')}"

    def test_generic_bucket_default_master(self, dist_dashboard_json):
        sec = self._find_section(dist_dashboard_json["branded_stock"], PARENT_SKU_ID)
        assert len(sec["generic"]) >= 1
        # There must be an entry labelled "Generic (unclassified)" with 200 at Default master.
        gen_unclass = [e for e in sec["generic"] if e.get("child_sku_name") == "Generic (unclassified)"]
        assert gen_unclass, f"'Generic (unclassified)' entry missing. Got: {[e.get('child_sku_name') for e in sec['generic']]}"
        entry = gen_unclass[0]
        assert entry["quantity"] == 200
        assert entry["locations"], "generic locations empty"
        loc_names = {l.get("location_name") for l in entry["locations"]}
        assert FACTORY_LOC_NAME in loc_names, f"expected '{FACTORY_LOC_NAME}' in {loc_names}"

    def test_customer_bucket_drive_folder(self, dist_dashboard_json):
        sec = self._find_section(dist_dashboard_json["branded_stock"], PARENT_SKU_ID)
        matches = [c for c in sec["customers"] if c.get("customer_name") == OWNER_ACCOUNT_NAME]
        assert matches, f"customer missing. Got: {[c.get('customer_name') for c in sec['customers']]}"
        cust = matches[0]
        assert cust.get("customer_account_id") == OWNER_ACCOUNT_ID
        assert cust.get("total_quantity") == 200
        assert cust["children"], "children empty for customer"
        # child must reference the branded child SKU.
        child_ids = {c.get("child_sku_id") for c in cust["children"]}
        assert BRANDED_CHILD_ID in child_ids, f"branded child missing. Got: {child_ids}"

    def test_customer_child_locations_present(self, dist_dashboard_json):
        sec = self._find_section(dist_dashboard_json["branded_stock"], PARENT_SKU_ID)
        cust = next(c for c in sec["customers"] if c.get("customer_name") == OWNER_ACCOUNT_NAME)
        branded = next(c for c in cust["children"] if c["child_sku_id"] == BRANDED_CHILD_ID)
        assert branded["quantity"] == 200
        assert branded["locations"], "branded child has no locations"
        loc_names = {l.get("location_name") for l in branded["locations"]}
        assert FACTORY_LOC_NAME in loc_names
        # Location quantities should sum to child quantity.
        assert sum(l["quantity"] for l in branded["locations"]) == branded["quantity"]


# ─────────── 5) Cross-endpoint sanity: same section keys/shape ───────────

class TestBrandedShapeConsistency:

    def test_same_keys_between_endpoints(self, summary_json, dist_dashboard_json):
        global_secs = summary_json["branded_stock"]
        dist_secs = dist_dashboard_json["branded_stock"]
        assert global_secs and dist_secs, "both must return at least the 24 Brand section"
        g0 = next(s for s in global_secs if s["sku_id"] == PARENT_SKU_ID)
        d0 = next(s for s in dist_secs if s["sku_id"] == PARENT_SKU_ID)
        assert set(g0.keys()) == set(d0.keys()), (
            f"section top-level key mismatch: global={sorted(g0.keys())}, dist={sorted(d0.keys())}"
        )
