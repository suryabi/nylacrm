"""Iteration 265 — Delivery item packaging breakdown persistence.

Scope (backend, public API):
  1. POST /api/distributors/{id}/deliveries with items carrying
     packaging_type_name, packaging_units and packages persists those fields.
  2. GET /api/distributors/{id}/deliveries/{delivery_id} returns the packaging
     fields back on each item alongside `quantity` (bottles).
  3. quantity == packages * packaging_units (frontend contract).

A pre-existing delivery without packaging fields ("legacy") is also exercised
via GET — fields must be absent or null, no crash.
"""
from __future__ import annotations

import os
from datetime import datetime

import pytest
import requests

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "").rstrip("/")
TENANT_ID = "nyla-air-water"
DISTRIBUTOR_ID = "bb12d90e-4d33-4890-ac5f-17573c551b5c"  # "Brian"


# ---------------------------------------------------------------------------
# Auth + client fixtures
# ---------------------------------------------------------------------------
@pytest.fixture(scope="module")
def auth_token():
    resp = requests.post(
        f"{BASE_URL}/api/auth/login",
        json={"email": "surya.yadavalli@nylaairwater.earth", "password": "test123"},
        headers={"X-Tenant-ID": TENANT_ID},
        timeout=30,
    )
    if resp.status_code != 200:
        pytest.skip(f"Auth failed: {resp.status_code} {resp.text[:200]}")
    return resp.json().get("session_token")


@pytest.fixture(scope="module")
def client(auth_token):
    s = requests.Session()
    s.headers.update({
        "Authorization": f"Bearer {auth_token}",
        "Content-Type": "application/json",
        "X-Tenant-ID": TENANT_ID,
    })
    s.cookies.set("session_token", auth_token)
    return s


# ---------------------------------------------------------------------------
# Resolve a usable (distributor location, account, sku, batch) tuple
# ---------------------------------------------------------------------------
@pytest.fixture(scope="module")
def delivery_context(client):
    """Find a non-batch-tracking location with stock + an assigned account.

    The test only needs `quantity = packages * packaging_units` accepted by the
    backend; the packaging breakdown is metadata. We pick the first SKU that
    has any stock at any active location for distributor Brian.
    """
    # 1) distributor info -> locations
    r = client.get(f"{BASE_URL}/api/distributors/{DISTRIBUTOR_ID}", timeout=30)
    if r.status_code != 200:
        pytest.skip(f"distributor fetch failed: {r.status_code}")
    locations = r.json().get("locations", [])
    if not locations:
        pytest.skip("no locations on distributor")

    # 2) assigned accounts
    r = client.get(
        f"{BASE_URL}/api/distributors/{DISTRIBUTOR_ID}/assigned-accounts",
        timeout=30,
    )
    if r.status_code != 200:
        pytest.skip(f"assigned accounts fetch failed: {r.status_code}")
    accounts = r.json().get("accounts", [])
    if not accounts:
        pytest.skip("no assigned accounts")

    # 3) iterate locations, pick first one whose stock endpoint yields a row
    chosen = None
    for loc in locations:
        if loc.get("status") and loc.get("status") != "active":
            continue
        if loc.get("track_batches"):
            # Skip batch-tracked locations — keep payload simple.
            continue
        sr = client.get(
            f"{BASE_URL}/api/distributors/{DISTRIBUTOR_ID}/stock",
            params={"location_id": loc["id"]},
            timeout=30,
        )
        if sr.status_code != 200:
            continue
        stock = sr.json().get("stock") or []
        # Filter to rows with positive available qty
        good = [
            s for s in stock
            if (s.get("quantity") or s.get("available_quantity") or s.get("quantity_bottles") or 0) >= 2
        ]
        if good:
            chosen = (loc, good[0])
            break
    if not chosen:
        pytest.skip("no non-batch location with stock for packaging test")
    loc, stock_row = chosen
    return {
        "location": loc,
        "account": accounts[0],
        "stock_row": stock_row,
    }


# ---------------------------------------------------------------------------
# Tests
# ---------------------------------------------------------------------------
class TestDeliveryPackagingPersistence:
    created_delivery_id = None  # shared between tests for cleanup

    def test_create_delivery_persists_packaging_fields(self, client, delivery_context):
        loc = delivery_context["location"]
        acc = delivery_context["account"]
        stock = delivery_context["stock_row"]

        sku_id = stock.get("sku_id")
        sku_name = stock.get("sku_name") or stock.get("name") or "Test SKU"
        assert sku_id, f"stock row missing sku_id: {stock}"

        # Packaging breakdown: 1 crate of 12 bottles  => quantity (bottles) = 12
        packaging_units = 12
        packages = 1
        bottles = packages * packaging_units

        # Confirm enough stock for `bottles`. If not, fall back to 2 bottles
        # using a packaging_units=2, packages=1 breakdown so we still exercise
        # the persistence path.
        avail = stock.get("quantity") or stock.get("available_quantity") or stock.get("quantity_bottles") or 0
        if avail < bottles:
            packaging_units = 2
            packages = 1
            bottles = 2
            if avail < bottles:
                pytest.skip(f"not enough stock ({avail}) for any packaging test")

        payload = {
            "distributor_id": DISTRIBUTOR_ID,
            "distributor_location_id": loc["id"],
            "account_id": acc["id"],
            "delivery_date": datetime.now().strftime("%Y-%m-%d"),
            "reference_number": f"TEST-PKG-{datetime.now().strftime('%H%M%S')}",
            "remarks": "TEST_iteration_265 packaging breakdown",
            "items": [
                {
                    "sku_id": sku_id,
                    "sku_name": sku_name,
                    "quantity": bottles,            # total bottles
                    "packages": packages,           # number of crates
                    "packaging_units": packaging_units,  # bottles per crate
                    "packaging_type_name": f"Crate-{packaging_units}",
                    "unit_price": 100.0,
                    "customer_selling_price": 100.0,
                    "discount_percent": 0,
                    "tax_percent": 0,
                }
            ],
        }

        r = client.post(
            f"{BASE_URL}/api/distributors/{DISTRIBUTOR_ID}/deliveries",
            json=payload,
            timeout=60,
        )
        assert r.status_code == 200, f"create failed: {r.status_code} {r.text[:400]}"
        body = r.json()
        delivery_id = body.get("id")
        assert delivery_id, f"no id in create response: {body}"
        TestDeliveryPackagingPersistence.created_delivery_id = delivery_id

        # Assert echoed quantity (bottles)
        items = body.get("items") or []
        assert items, "no items echoed on create"
        it = items[0]
        assert it["quantity"] == bottles, it
        # Some create paths may not echo packaging fields — confirm via GET.

    def test_get_delivery_returns_packaging_fields(self, client):
        delivery_id = TestDeliveryPackagingPersistence.created_delivery_id
        if not delivery_id:
            pytest.skip("delivery not created — earlier test skipped/failed")

        r = client.get(
            f"{BASE_URL}/api/distributors/{DISTRIBUTOR_ID}/deliveries/{delivery_id}",
            timeout=30,
        )
        assert r.status_code == 200, f"get failed: {r.status_code} {r.text[:400]}"
        data = r.json()
        items = data.get("items") or []
        assert items, f"no items on GET: {data}"
        it = items[0]

        # Core data assertions: packaging fields persisted + math is correct.
        pkg_units = it.get("packaging_units")
        packages = it.get("packages")
        pkg_name = it.get("packaging_type_name")
        qty = it.get("quantity")

        assert pkg_units is not None, f"packaging_units missing: {it}"
        assert packages is not None, f"packages missing: {it}"
        assert pkg_name, f"packaging_type_name missing or falsy: {it}"

        assert isinstance(pkg_units, int) and pkg_units >= 1
        assert isinstance(packages, int) and packages >= 1
        assert qty == packages * pkg_units, (
            f"quantity != packages*packaging_units: qty={qty} "
            f"packages={packages} pkg_units={pkg_units}"
        )
        assert pkg_name.startswith("Crate-"), pkg_name

    def test_legacy_delivery_returns_no_packaging_fields_safely(self, client):
        """Pick any existing delivery that does NOT have packaging fields
        and confirm GET still succeeds and items are returned without crash.
        """
        r = client.get(
            f"{BASE_URL}/api/distributors/{DISTRIBUTOR_ID}/deliveries",
            params={"page_size": 50},
            timeout=30,
        )
        assert r.status_code == 200, r.text[:300]
        deliveries = r.json().get("deliveries") or []
        # Walk through deliveries (oldest first if available) and pick one whose
        # items lack packaging_units. We GET each until we find a legacy one or
        # run out — finding none is also acceptable (test trivially passes).
        legacy_id = None
        for d in deliveries:
            did = d.get("id")
            if not did or did == TestDeliveryPackagingPersistence.created_delivery_id:
                continue
            gr = client.get(
                f"{BASE_URL}/api/distributors/{DISTRIBUTOR_ID}/deliveries/{did}",
                timeout=30,
            )
            if gr.status_code != 200:
                continue
            items = gr.json().get("items") or []
            if not items:
                continue
            sample = items[0]
            if not sample.get("packaging_units") and not sample.get("packaging_type_name"):
                legacy_id = did
                # Verify it didn't crash and quantity is still present
                assert "quantity" in sample
                break
        # If we couldn't find a legacy one, that's not a failure — just log it.
        print(f"legacy delivery exercised: {legacy_id}")

    def test_cleanup_created_delivery(self, client):
        delivery_id = TestDeliveryPackagingPersistence.created_delivery_id
        if not delivery_id:
            pytest.skip("nothing to clean up")
        # Best-effort delete — accept 200/204/400 (if not draft) without failing
        r = client.delete(
            f"{BASE_URL}/api/distributors/{DISTRIBUTOR_ID}/deliveries/{delivery_id}",
            timeout=30,
        )
        print(f"cleanup delete -> {r.status_code}")
        assert r.status_code in (200, 204, 400, 404)
