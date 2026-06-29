"""
Iteration 267 — Stock-In (shipment) packaging breakdown + Zoho line builder helpers.

Covers:
  1) POST /api/distributors/{id}/shipments persists packaging_type_name / packaging_units /
     packages on each item; GET returns them with quantity == packages * packaging_units.
  2) GET /api/distributors/{id}/deliveries/{delivery_id}/invoice-preview returns per-line
     packaging_type_name, packaging_units, packages and base_uom.
  3) Pure helpers in services.zoho_service (no real Zoho calls):
       _pack_clause / _line_description / _pluralize_uom.
"""

import os
import sys
import uuid
from datetime import datetime, timezone

import pytest
import requests

# Make backend importable for unit-testing zoho helpers without touching Zoho
sys.path.insert(0, "/app/backend")

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "").rstrip("/")
DISTRIBUTOR_ID = "bb12d90e-4d33-4890-ac5f-17573c551b5c"   # Brian
TENANT = "nyla-air-water"


# ---------- fixtures --------------------------------------------------------

@pytest.fixture(scope="module")
def client():
    s = requests.Session()
    s.headers.update({"Content-Type": "application/json"})
    resp = s.post(
        f"{BASE_URL}/api/auth/login",
        json={"email": "surya.yadavalli@nylaairwater.earth", "password": "test123"},
        timeout=30,
    )
    if resp.status_code != 200:
        pytest.skip(f"Login failed: {resp.status_code} {resp.text[:200]}")
    token = resp.json().get("session_token")
    if not token:
        pytest.skip("No session_token in login response")
    s.headers.update({"Authorization": f"Bearer {token}"})
    return s


@pytest.fixture(scope="module")
def shipment_context(client):
    """Pick a non-batch-tracking destination location for Brian + a factory
    warehouse that doesn't track batches, plus an SKU with crate packaging."""
    # 1) Distributor locations
    r = client.get(f"{BASE_URL}/api/distributors/{DISTRIBUTOR_ID}/locations", timeout=30)
    assert r.status_code == 200, r.text[:400]
    body = r.json() or {}
    locs = body.get("locations") if isinstance(body, dict) else body
    locs = locs or []
    non_batch = [l for l in locs if not l.get("track_batches") and l.get("status") == "active"]
    if not non_batch:
        pytest.skip("no non-batch active location for Brian")
    dest = non_batch[0]

    # 2) Factory warehouse (active, non-batch) as source
    r2 = client.get(f"{BASE_URL}/api/factory-warehouses", timeout=30)
    src_id = None
    if r2.status_code == 200:
        whs = r2.json() if isinstance(r2.json(), list) else r2.json().get("warehouses") or []
        for w in whs:
            if w.get("status") == "active" and not w.get("track_batches"):
                src_id = w.get("id")
                break
    # source_warehouse_id is optional; if none, omit

    # 3) Find a master SKU with a Crate-12 pack (Nyla 600ml Silver per spec)
    sr = client.get(f"{BASE_URL}/api/master-skus", timeout=30)
    assert sr.status_code == 200
    sku_list = sr.json().get("skus") if isinstance(sr.json(), dict) else sr.json()
    sku = None
    for s in sku_list:
        name = (s.get("sku_name") or s.get("sku") or "").lower()
        if "600" in name and "silver" in name:
            sku = s
            break
    if not sku:
        # fallback any sku
        sku = sku_list[0]
    sku_id = sku.get("id")
    sku_name = sku.get("sku_name") or sku.get("sku")
    sku_code = sku.get("sku_code")
    return {
        "dest_location_id": dest["id"],
        "source_warehouse_id": src_id,
        "sku_id": sku_id,
        "sku_name": sku_name,
        "sku_code": sku_code,
    }


# ---------- 1) Shipment persistence ----------------------------------------

class TestShipmentPackagingPersistence:
    created_shipment_id = None

    def test_create_shipment_with_packaging(self, client, shipment_context):
        ctx = shipment_context
        packages = 5
        packaging_units = 12
        bottles = packages * packaging_units  # 60

        today = datetime.now(timezone.utc).strftime("%Y-%m-%d")
        payload = {
            "distributor_id": DISTRIBUTOR_ID,
            "distributor_location_id": ctx["dest_location_id"],
            "shipment_date": today,
            "reference_number": f"TEST-PKG-{uuid.uuid4().hex[:6]}",
            "items": [
                {
                    "sku_id": ctx["sku_id"],
                    "sku_name": ctx["sku_name"],
                    "sku_code": ctx["sku_code"],
                    "quantity": bottles,
                    "unit_price": 100.0,
                    "base_price": 120.0,
                    "distributor_margin": 0,
                    "discount_percent": 0,
                    "tax_percent": 0,
                    "packaging_type_name": "Crate-12",
                    "packaging_units": packaging_units,
                    "packages": packages,
                }
            ],
            "gst_percent": 0,
        }
        if ctx["source_warehouse_id"]:
            payload["source_warehouse_id"] = ctx["source_warehouse_id"]

        r = client.post(
            f"{BASE_URL}/api/distributors/{DISTRIBUTOR_ID}/shipments",
            json=payload, timeout=60,
        )
        assert r.status_code == 200, f"create failed: {r.status_code} {r.text[:400]}"
        body = r.json()
        sid = body.get("id")
        assert sid, f"no id in create response: {body}"
        TestShipmentPackagingPersistence.created_shipment_id = sid

        items = body.get("items") or []
        assert items, "no items echoed on create"
        it = items[0]
        assert it["quantity"] == bottles
        # Persistence assertion on the echoed item (best-effort; GET confirms below)
        if "packaging_units" in it:
            assert it.get("packaging_units") == packaging_units
            assert it.get("packages") == packages
            assert it.get("packaging_type_name") == "Crate-12"

    def test_get_shipment_returns_packaging_fields(self, client):
        sid = TestShipmentPackagingPersistence.created_shipment_id
        if not sid:
            pytest.skip("shipment not created")
        r = client.get(
            f"{BASE_URL}/api/distributors/{DISTRIBUTOR_ID}/shipments/{sid}",
            timeout=30,
        )
        assert r.status_code == 200, f"get failed: {r.status_code} {r.text[:400]}"
        data = r.json()
        items = data.get("items") or []
        assert items, f"no items on GET: {data}"
        it = items[0]

        pkg_units = it.get("packaging_units")
        packages = it.get("packages")
        pkg_name = it.get("packaging_type_name")
        qty = it.get("quantity")

        assert pkg_name == "Crate-12", f"pkg name mismatch: {pkg_name}"
        assert pkg_units == 12, f"packaging_units missing/wrong: {it}"
        assert packages == 5, f"packages missing/wrong: {it}"
        assert qty == packages * pkg_units, (
            f"quantity != packages * packaging_units: qty={qty}, "
            f"packages={packages}, units={pkg_units}"
        )

    def test_cleanup_shipment(self, client):
        sid = TestShipmentPackagingPersistence.created_shipment_id
        if not sid:
            pytest.skip("nothing to clean up")
        # Best-effort delete (route supports delete/cancel for drafts)
        for path in (
            f"/api/distributors/{DISTRIBUTOR_ID}/shipments/{sid}",
            f"/api/distributors/{DISTRIBUTOR_ID}/shipments/{sid}/cancel",
        ):
            try:
                if path.endswith("/cancel"):
                    rr = client.post(f"{BASE_URL}{path}", timeout=30)
                else:
                    rr = client.delete(f"{BASE_URL}{path}", timeout=30)
                if rr.status_code in (200, 204):
                    return
            except Exception:
                pass
        # leave as draft if cleanup not possible — flagged in summary


# ---------- 2) Delivery invoice preview includes packaging + base_uom ------

class TestDeliveryInvoicePreviewPackaging:
    def test_invoice_preview_returns_packaging_and_base_uom(self, client):
        # Find any existing delivery for Brian that has packaging fields
        r = client.get(
            f"{BASE_URL}/api/distributors/{DISTRIBUTOR_ID}/deliveries",
            params={"limit": 50}, timeout=30,
        )
        assert r.status_code == 200, r.text[:400]
        body = r.json()
        deliveries = body.get("deliveries") if isinstance(body, dict) else body
        deliveries = deliveries or []
        if not deliveries:
            pytest.skip("no existing deliveries for Brian")

        target = None
        for d in deliveries[:25]:
            did = d.get("id")
            dr = client.get(
                f"{BASE_URL}/api/distributors/{DISTRIBUTOR_ID}/deliveries/{did}",
                timeout=15,
            )
            if dr.status_code != 200:
                continue
            items = dr.json().get("items") or []
            for it in items:
                if (it.get("packaging_units") or 0) > 1 and (it.get("packages") or 0) > 0:
                    target = d
                    break
            if target:
                break

        if not target:
            pytest.skip("no delivery item with packaging breakdown found")

        # Now hit invoice preview
        pr = client.get(
            f"{BASE_URL}/api/distributors/{DISTRIBUTOR_ID}/deliveries/{target['id']}/invoice-preview",
            timeout=30,
        )
        assert pr.status_code == 200, f"preview failed: {pr.status_code} {pr.text[:400]}"
        pdata = pr.json()
        lines = pdata.get("lines") or []
        assert lines, f"no lines on preview: {pdata}"
        # At least one line should carry packaging + base_uom
        has_pkg = False
        for ln in lines:
            assert "base_uom" in ln, f"line missing base_uom: {ln}"
            assert ln["base_uom"], f"empty base_uom: {ln}"
            if (ln.get("packaging_units") or 0) > 1 and (ln.get("packages") or 0) > 0:
                assert ln.get("packaging_type_name"), f"missing pack name: {ln}"
                has_pkg = True
        assert has_pkg, f"no packaged line in preview: {lines}"


# ---------- 3) Pure helpers (no Zoho calls) --------------------------------

class TestZohoHelperFormatting:
    def test_pluralize_uom_singular(self):
        from services.zoho_service import _pluralize_uom
        assert _pluralize_uom("Bottle", 1) == "Bottle"

    def test_pluralize_uom_plural(self):
        from services.zoho_service import _pluralize_uom
        assert _pluralize_uom("Bottle", 60) == "Bottles"

    def test_pluralize_uom_zero_uses_plural(self):
        from services.zoho_service import _pluralize_uom
        # count != 1 -> plural form
        assert _pluralize_uom("Bottle", 0) == "Bottles"

    def test_pluralize_uom_already_plural_not_double(self):
        from services.zoho_service import _pluralize_uom
        assert _pluralize_uom("Bottles", 5) == "Bottles"

    def test_pack_clause_standard(self):
        from services.zoho_service import _pack_clause
        assert _pack_clause(5, 12, "Crate-12", 60, "Bottle") == "5 × Crate-12 (60 Bottles)"

    def test_pack_clause_single_unit_pack_is_empty(self):
        from services.zoho_service import _pack_clause
        # units <= 1 -> empty
        assert _pack_clause(0, 1, "", 3, "Bottle") == ""
        assert _pack_clause(3, 1, "Bottle", 3, "Bottle") == ""

    def test_pack_clause_zero_packages_is_empty(self):
        from services.zoho_service import _pack_clause
        assert _pack_clause(0, 12, "Crate-12", 0, "Bottle") == ""

    def test_line_description_with_packaging_and_batch(self):
        from services.zoho_service import _line_description
        out = _line_description(
            {
                "packages": 5,
                "packaging_units": 12,
                "packaging_type_name": "Crate-12",
                "quantity": 60,
                "batch_code": "B1",
            },
            "Bottle",
        )
        assert out == "5 × Crate-12 (60 Bottles) | Batch: B1"

    def test_line_description_no_packaging_no_batch(self):
        from services.zoho_service import _line_description
        out = _line_description(
            {"packages": 0, "packaging_units": 1, "quantity": 3},
            "Bottle",
        )
        assert out == ""

    def test_line_description_packaging_only(self):
        from services.zoho_service import _line_description
        out = _line_description(
            {
                "packages": 2,
                "packaging_units": 24,
                "packaging_type_name": "Crate-24",
                "quantity": 48,
            },
            "Bottle",
        )
        assert out == "2 × Crate-24 (48 Bottles)"
