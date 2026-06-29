"""Iteration 268 — Promo Dispatch packaging fallback regression.

Verifies the production bug fix for "Crate-12 printed as 1 Bottle":
1. Backend create_promo_dispatch normalizes quantity to bottles (crates * upp),
   persists packages, packaging_units, packaging_type_name, and per-bottle
   unit_price (so line value is preserved).
2. The Zoho promo challan line-builder pure helper _pack_clause renders
   '1 × Crate-12 (12 Bottles)' / '1 × Crate-24 (24 Bottles)'.
3. SKU "Nyla – 600 ml / Silver" exposes Crate-12 in stock_out (used as the
   frontend fallback when promo_stock_out is empty).

The Zoho push is NEVER triggered — we create the dispatch as draft, and
the helpers are pure functions (no network).
"""

import os
import sys
import uuid
import pytest
import requests

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL").rstrip("/")
ADMIN_EMAIL = "surya.yadavalli@nylaairwater.earth"
ADMIN_PASSWORD = "test123"
DISTRIBUTOR_ID = "bb12d90e-4d33-4890-ac5f-17573c551b5c"  # Brian

sys.path.insert(0, "/app/backend")


# ── Fixtures ──────────────────────────────────────────────────────────────
@pytest.fixture(scope="module")
def api():
    s = requests.Session()
    s.headers.update({"Content-Type": "application/json"})
    r = s.post(
        f"{BASE_URL}/api/auth/login",
        json={"email": ADMIN_EMAIL, "password": ADMIN_PASSWORD},
    )
    assert r.status_code == 200, f"Login failed: {r.status_code} {r.text}"
    body = r.json()
    token = body.get("token") or body.get("access_token") or body.get("session_token")
    assert token, f"No token in login response: {r.json()}"
    s.headers.update({"Authorization": f"Bearer {token}"})
    return s


@pytest.fixture(scope="module")
def brian_context(api):
    """Resolve Brian's location + SKU + contact + reason."""
    locs_resp = api.get(
        f"{BASE_URL}/api/distributors/{DISTRIBUTOR_ID}/locations"
    ).json()
    locs = locs_resp.get("locations") if isinstance(locs_resp, dict) else locs_resp
    # Pick first non-batch location (Bangalore Warehouse or Delhi)
    loc = next((l for l in locs if not l.get("track_batches")), None)
    assert loc, f"No non-batch location for Brian: {locs}"

    skus_resp = api.get(f"{BASE_URL}/api/master-skus").json()
    skus = (
        skus_resp.get("skus")
        or skus_resp.get("items")
        or skus_resp.get("master_skus")
        if isinstance(skus_resp, dict)
        else skus_resp
    )
    if not skus:
        skus = skus_resp.get("data") if isinstance(skus_resp, dict) else []
    nyla = next(
        (
            s
            for s in skus
            if "Nyla" in (s.get("sku_name") or s.get("sku") or "")
            and "600" in (s.get("sku_name") or s.get("sku") or "")
            and "Silver" in (s.get("sku_name") or s.get("sku") or "")
        ),
        None,
    )
    assert nyla, "Nyla 600 ml / Silver SKU not found"
    # Normalize sku_name for downstream use
    nyla["name"] = nyla.get("sku_name") or nyla.get("sku")

    contacts = api.get(f"{BASE_URL}/api/contacts?search=Promo").json()
    contacts_list = (
        contacts
        if isinstance(contacts, list)
        else (
            contacts.get("contacts")
            or contacts.get("items")
            or contacts.get("data")
            or []
        )
    )
    promo_contact = next(
        (c for c in contacts_list if "Promo Test Contact" in (c.get("name") or "")),
        None,
    )
    assert promo_contact, "Promo Test Contact not found"

    return {
        "location": loc,
        "sku": nyla,
        "contact": promo_contact,
    }


# ── 1. Pure Zoho helper (unit) ────────────────────────────────────────────
class TestZohoPackClause:
    def test_pack_clause_crate12(self):
        from services.zoho_service import _pack_clause

        assert (
            _pack_clause(1, 12, "Crate-12", 12, "Bottle")
            == "1 × Crate-12 (12 Bottles)"
        )

    def test_pack_clause_crate24(self):
        from services.zoho_service import _pack_clause

        assert (
            _pack_clause(1, 24, "Crate-24", 24, "Bottle")
            == "1 × Crate-24 (24 Bottles)"
        )

    def test_pack_clause_single_unit_returns_empty(self):
        """Edge case: a 1-unit pack is just a bottle — no clause."""
        from services.zoho_service import _pack_clause

        assert _pack_clause(0, 1, "", 3, "Bottle") == ""

    def test_pluralize_uom(self):
        from services.zoho_service import _pluralize_uom

        assert _pluralize_uom("Bottle", 1) == "Bottle"
        assert _pluralize_uom("Bottle", 12) == "Bottles"


# ── 2. SKU packaging fallback data is present (proxy for FE fix) ──────────
class TestSkuPackagingFallback:
    def test_nyla_silver_has_crate12_in_stock_out(self, brian_context):
        pc = brian_context["sku"].get("packaging_config") or {}
        promo = pc.get("promo_stock_out") or []
        stock_out = pc.get("stock_out") or []
        # The whole point of the fix: promo can be empty BUT stock_out has a Crate.
        crate12 = next(
            (
                p
                for p in stock_out
                if int(p.get("units_per_package") or 0) == 12
            ),
            None,
        )
        assert crate12, (
            f"Expected Crate-12 in stock_out fallback. promo_stock_out={promo} "
            f"stock_out={stock_out}"
        )
        # Sanity: the fallback chain (promo_stock_out → stock_out → master)
        # would resolve Crate-12 for the FE here.
        fallback_pkgs = promo or stock_out or pc.get("master") or []
        assert any(
            int(p.get("units_per_package") or 0) == 12 for p in fallback_pkgs
        ), f"Fallback chain yielded no Crate-12: {fallback_pkgs}"


# ── 3. Backend normalization: 1 crate × 12 upp → 12 bottles ───────────────
class TestPromoDispatchNormalization:
    def test_create_draft_normalizes_to_bottles(self, api, brian_context):
        sku = brian_context["sku"]
        pc = sku.get("packaging_config") or {}
        crate12 = next(
            p
            for p in (pc.get("promo_stock_out") or pc.get("stock_out") or pc.get("master") or [])
            if int(p.get("units_per_package") or 0) == 12
        )
        crate_price = 120.0  # arbitrary indicative per-CRATE value
        payload = {
            "distributor_location_id": brian_context["location"]["id"],
            "recipient_type": "contact",
            "contact_id": brian_context["contact"]["id"],
            "delivery_date": "2026-01-15",
            "reason": "Sampling",
            "remarks": "TEST_ITER268 — packaging fallback regression",
            "as_draft": True,
            "items": [
                {
                    "sku_id": sku["id"],
                    "sku_name": sku["name"],
                    "quantity": 1,  # 1 crate entered
                    "unit_price": crate_price,  # per-crate indicative
                    "packaging_type_id": crate12.get("packaging_type_id")
                    or crate12.get("id"),
                    "packaging_type_name": crate12.get("packaging_type_name")
                    or crate12.get("name")
                    or "Crate-12",
                    "units_per_package": 12,
                }
            ],
        }
        r = api.post(
            f"{BASE_URL}/api/distributors/{DISTRIBUTOR_ID}/promo-deliveries",
            json=payload,
        )
        assert r.status_code == 200, f"Create failed: {r.status_code} {r.text}"
        body = r.json()
        dispatch = body.get("dispatch") or body
        dispatch_id = dispatch.get("id")
        assert dispatch_id, f"Missing dispatch id in {body}"

        try:
            # GET the dispatch back and inspect its stored items
            g = api.get(
                f"{BASE_URL}/api/distributors/{DISTRIBUTOR_ID}/promo-deliveries/{dispatch_id}"
            )
            assert g.status_code == 200, f"GET failed: {g.text}"
            full = g.json()
            items = full.get("items") or []
            assert len(items) == 1, f"Expected 1 line, got {items}"
            line = items[0]
            # quantity == bottles (1 crate * 12 upp = 12)
            assert (
                int(line.get("quantity")) == 12
            ), f"quantity not normalized to bottles: {line}"
            assert (
                int(line.get("packages") or 0) == 1
            ), f"packages != 1: {line}"
            assert (
                int(line.get("packaging_units") or 0) == 12
            ), f"packaging_units != 12: {line}"
            # unit_price persisted as per-BOTTLE → quantity*unit_price ≈ per-crate value
            per_bottle = float(line.get("unit_price") or 0)
            assert (
                abs(per_bottle * 12 - crate_price) < 0.05
            ), f"per-bottle×12 ({per_bottle*12}) != crate price ({crate_price}); line={line}"
        finally:
            # Cleanup: delete the draft
            d = api.delete(
                f"{BASE_URL}/api/distributors/{DISTRIBUTOR_ID}/promo-deliveries/{dispatch_id}"
            )
            assert d.status_code in (
                200,
                204,
            ), f"Cleanup delete failed: {d.status_code} {d.text}"
