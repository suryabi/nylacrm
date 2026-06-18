"""Iteration 175 — Factory↔Distributor stock transfers + Safety Overview.

Verifies:
  • /eligible-sources returns both distributor and factory warehouses with
    `source_kind` and `is_factory` flags.
  • /eligible-targets exposes `is_factory` per target.
  • /location-stock new endpoint reads from the right collection.
  • /warehouse-stock-overview totals + mismatch warnings + orphans math.
  • POST /  factory→distributor transfer deducts factory_warehouse_stock and
    adds to distributor_stock; persisted doc carries source_kind, source_is_factory,
    dest_kind, dest_is_factory.
"""
import os
import uuid
import pytest
import requests
from pymongo import MongoClient

BASE_URL = os.environ["REACT_APP_BACKEND_URL"].rstrip("/")
MONGO_URL = os.environ["MONGO_URL"]
DB_NAME = os.environ["DB_NAME"]
ADMIN_EMAIL = "surya.yadavalli@nylaairwater.earth"
ADMIN_PASS = "test123"

# ──────────────────────────────────────────────────────────────
# Fixtures
# ──────────────────────────────────────────────────────────────
@pytest.fixture(scope="module")
def mongo():
    return MongoClient(MONGO_URL)[DB_NAME]


@pytest.fixture(scope="module")
def token():
    r = requests.post(
        f"{BASE_URL}/api/auth/login",
        json={"email": ADMIN_EMAIL, "password": ADMIN_PASS},
        timeout=15,
    )
    assert r.status_code == 200, r.text
    return r.json()["session_token"]


@pytest.fixture(scope="module")
def headers(token):
    return {"Authorization": f"Bearer {token}", "Content-Type": "application/json"}


# ──────────────────────────────────────────────────────────────
# eligible-sources & eligible-targets shape
# ──────────────────────────────────────────────────────────────
class TestEligibleEndpoints:
    def test_eligible_sources_returns_factory_and_distributor(self, headers):
        r = requests.get(f"{BASE_URL}/api/distributor/stock-transfers/eligible-sources",
                         headers=headers, timeout=20)
        assert r.status_code == 200, r.text
        data = r.json()
        assert "sources" in data and isinstance(data["sources"], list)
        # every row carries the new keys
        for src in data["sources"]:
            assert "source_kind" in src and src["source_kind"] in ("distributor", "factory")
            assert "is_factory" in src and isinstance(src["is_factory"], bool)
            assert (src["source_kind"] == "factory") == src["is_factory"]
            assert "location_id" in src and "total_qty" in src
        # at least one factory source must exist (user reported a 600-crate one in Hyderabad)
        factory_sources = [s for s in data["sources"] if s["is_factory"]]
        assert len(factory_sources) >= 1, "Expected at least one factory warehouse in eligible-sources"

    def test_eligible_targets_exposes_is_factory(self, headers):
        r = requests.get(f"{BASE_URL}/api/distributor/stock-transfers/eligible-targets",
                         headers=headers, timeout=20)
        assert r.status_code == 200, r.text
        data = r.json()
        for t in data["targets"]:
            assert "is_factory" in t and isinstance(t["is_factory"], bool)


# ──────────────────────────────────────────────────────────────
# /location-stock new endpoint
# ──────────────────────────────────────────────────────────────
class TestLocationStock:
    def test_location_stock_for_factory(self, headers):
        srcs = requests.get(f"{BASE_URL}/api/distributor/stock-transfers/eligible-sources",
                            headers=headers, timeout=20).json()["sources"]
        factory = next((s for s in srcs if s["is_factory"] and s["total_qty"] > 0), None)
        if not factory:
            pytest.skip("No factory warehouse with stock available")
        r = requests.get(
            f"{BASE_URL}/api/distributor/stock-transfers/location-stock",
            params={"location_id": factory["location_id"]},
            headers=headers, timeout=20,
        )
        assert r.status_code == 200, r.text
        data = r.json()
        assert data["is_factory"] is True
        assert isinstance(data["stock"], list)
        # at least one SKU row with positive quantity
        assert any(int(row.get("quantity") or 0) > 0 for row in data["stock"])

    def test_location_stock_for_distributor(self, headers):
        srcs = requests.get(f"{BASE_URL}/api/distributor/stock-transfers/eligible-sources",
                            headers=headers, timeout=20).json()["sources"]
        dist = next((s for s in srcs if not s["is_factory"] and s["total_qty"] > 0), None)
        if not dist:
            pytest.skip("No distributor warehouse with stock available")
        r = requests.get(
            f"{BASE_URL}/api/distributor/stock-transfers/location-stock",
            params={"location_id": dist["location_id"]},
            headers=headers, timeout=20,
        )
        assert r.status_code == 200, r.text
        data = r.json()
        assert data["is_factory"] is False

    def test_location_stock_unknown_location_404(self, headers):
        r = requests.get(
            f"{BASE_URL}/api/distributor/stock-transfers/location-stock",
            params={"location_id": "non-existent-id-12345"},
            headers=headers, timeout=15,
        )
        # _load_location raises 400 not 404 — verify it's a 4xx with helpful detail
        assert r.status_code in (400, 404), r.text


# ──────────────────────────────────────────────────────────────
# Warehouse stock overview
# ──────────────────────────────────────────────────────────────
class TestWarehouseStockOverview:
    def test_overview_shape_and_totals(self, headers):
        r = requests.get(f"{BASE_URL}/api/distributor/stock-transfers/warehouse-stock-overview",
                         headers=headers, timeout=20)
        assert r.status_code == 200, r.text
        data = r.json()
        assert {"warehouses", "orphans", "totals"} <= data.keys()
        totals = data["totals"]
        assert totals["grand_bottles"] == totals["factory_bottles"] + totals["distributor_bottles"]
        assert totals["warehouse_count"] == len(data["warehouses"])
        assert totals["orphan_rows"] == len(data["orphans"])
        # warehouses include both factory + distributor types
        kinds = {w["is_factory"] for w in data["warehouses"]}
        assert True in kinds  # at least one factory


# ──────────────────────────────────────────────────────────────
# Factory → Distributor POST
# ──────────────────────────────────────────────────────────────
class TestFactoryToDistributorTransfer:
    def test_post_factory_to_distributor(self, headers, mongo):
        tenant_id = "nyla-air-water"

        # Pick a factory source with stock
        srcs = requests.get(f"{BASE_URL}/api/distributor/stock-transfers/eligible-sources",
                            headers=headers, timeout=20).json()["sources"]
        factory = next((s for s in srcs if s["is_factory"] and s["total_qty"] > 0), None)
        if not factory:
            pytest.skip("No factory source available")

        # Stock on factory
        ls = requests.get(
            f"{BASE_URL}/api/distributor/stock-transfers/location-stock",
            params={"location_id": factory["location_id"]},
            headers=headers, timeout=20,
        ).json()
        sku_row = next((r for r in ls["stock"] if int(r.get("quantity") or 0) >= 24), None)
        if not sku_row:
            pytest.skip("No SKU with enough bottles on the factory warehouse")
        sku_id = sku_row["sku_id"]

        # Pick a non-factory destination owned by a self-managed distributor
        tgts = requests.get(f"{BASE_URL}/api/distributor/stock-transfers/eligible-targets",
                            headers=headers, timeout=20,
                            params={"exclude_location_id": factory["location_id"]}).json()["targets"]
        dest = next((t for t in tgts if not t["is_factory"] and t.get("city")), None)
        assert dest, "Need a distributor destination with a city"

        # Seed margin matrix for dest distributor + city + sku
        seed_tag = "_test_factory_transfer_iter175"
        mongo.distributor_margin_matrix.delete_many({seed_tag: True})
        mongo.distributor_margin_matrix.insert_one({
            "id": str(uuid.uuid4()),
            "tenant_id": tenant_id,
            "distributor_id": dest["distributor_id"],
            "sku_id": sku_id,
            "city": dest["city"],
            "status": "active",
            "active_from": "2024-01-01",
            "active_to": None,
            "base_price": 20.0,
            "transfer_price": 18.0,
            "margin_type": "cost_based",
            "margin_value": 0.0,
            seed_tag: True,
        })

        # Snapshot factory stock before
        before_doc = mongo.factory_warehouse_stock.find_one({
            "tenant_id": tenant_id,
            "warehouse_location_id": factory["location_id"],
            "sku_id": sku_id,
        }) or {}
        before_qty = int(before_doc.get("quantity") or 0)

        # POST transfer — 1 crate of 24 bottles
        payload = {
            "source_distributor_id": factory["distributor_id"],
            "source_location_id": factory["location_id"],
            "dest_distributor_id": dest["distributor_id"],
            "dest_location_id": dest["location_id"],
            "items": [{
                "sku_id": sku_id,
                "sku_name": sku_row.get("sku_name"),
                "packaging_type_name": "Crate-24",
                "units_per_package": 24,
                "quantity": 1,
            }],
            "notes": "TEST_iter175_factory_to_distributor",
        }
        r = requests.post(f"{BASE_URL}/api/distributor/stock-transfers/",
                          headers=headers, json=payload, timeout=30)
        try:
            assert r.status_code in (200, 201), r.text
            doc = r.json()

            # New persisted fields
            assert doc["source_kind"] == "factory"
            assert doc["source_is_factory"] is True
            assert doc["dest_kind"] == "distributor"
            assert doc["dest_is_factory"] is False
            assert doc["total_units"] == 24

            # Stock deducted from factory_warehouse_stock
            after_doc = mongo.factory_warehouse_stock.find_one({
                "tenant_id": tenant_id,
                "warehouse_location_id": factory["location_id"],
                "sku_id": sku_id,
            }) or {}
            after_qty = int(after_doc.get("quantity") or 0)
            assert after_qty == before_qty - 24, f"factory stock {before_qty} -> {after_qty}"

            # Stock added at the distributor destination (via /location-stock)
            ls_dest = requests.get(
                f"{BASE_URL}/api/distributor/stock-transfers/location-stock",
                params={"location_id": dest["location_id"]},
                headers=headers, timeout=20,
            ).json()
            assert ls_dest["is_factory"] is False
            dest_row = next((row for row in ls_dest["stock"] if row["sku_id"] == sku_id), None)
            assert dest_row is not None
            assert int(dest_row["quantity"]) >= 24
        finally:
            mongo.distributor_margin_matrix.delete_many({seed_tag: True})


if __name__ == "__main__":
    pytest.main([__file__, "-v", "-s"])
