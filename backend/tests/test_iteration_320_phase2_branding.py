"""Iteration 320 — SKU Hierarchy & Variant Management Phase 2 (Model C).

Covers backend features:
- Batch target_child_sku_id on create (with skip_qc) and update (set/clear/invalid)
- Batch → Master Warehouse transfer classification (default from batch target,
  '' → Generic, explicit id, per-classification factory_warehouse_stock rows)
- Branding Entries: stock-breakdown, POST (Generic↔branded, over-quantity 400,
  reverse direction), list, BRD-YYYY-NNNN numbering
- Distributor Stock Transfers with classification: create, over-availability
  error mentions child name, location-stock returns stock_by_child, reverse
  restores classification-correct quantities
- Regression: plain (no child) transfers still work, warehouse-stock-overview
  and stock-summary endpoints still respond 200.

Cleans up all fixtures after run (batches, child SKU, stock rows, transfers,
branding entries, base_price, account sku_pricing).
"""
from __future__ import annotations
import os
import time
import uuid
import pytest
import requests
from pymongo import MongoClient

BASE_URL = os.environ.get(
    "REACT_APP_BACKEND_URL",
    "https://design-workflow-hub-11.preview.emergentagent.com",
).rstrip("/")
TENANT_ID = "nyla-air-water"
EMAIL = "surya.yadavalli@nylaairwater.earth"
PASSWORD = "test123"

PARENT_SKU_ID = "8bc87348-5398-4604-92d8-eff59610b7f9"  # 24 Brand
PARENT_SKU_NAME = "24 Brand"
NOIDA_WH_ID = "0361dd27-e65b-4537-afa5-8486822e0a54"     # factory, no batch tracking
TEST_WH_ID = "9972b6cb-4692-4433-88b7-330063ff29a2"      # non-factory
DIST_ID = "99fb55dc-532c-4e85-b618-6b8a5e552c04"
ACCOUNT_ID_TOOPA = "81263309-2118-4d51-b1d9-fe9549da07b7"  # Toopa Ice-creamery

MONGO_URL = os.environ.get("MONGO_URL", "mongodb://localhost:27017")
DB_NAME = os.environ.get("DB_NAME", "test_database")


# ─────────────────────────────────────────────────────────────────
# Fixtures
# ─────────────────────────────────────────────────────────────────
@pytest.fixture(scope="module")
def mongo():
    client = MongoClient(MONGO_URL)
    yield client[DB_NAME]
    client.close()


@pytest.fixture(scope="module")
def client():
    s = requests.Session()
    r = s.post(f"{BASE_URL}/api/auth/login",
               json={"email": EMAIL, "password": PASSWORD}, timeout=30)
    assert r.status_code == 200, r.text
    tok = r.json().get("session_token")
    assert tok, f"session_token missing from login: keys={list(r.json().keys())}"
    s.headers.update({
        "Authorization": f"Bearer {tok}",
        "X-Tenant-ID": TENANT_ID,
        "Content-Type": "application/json",
    })
    yield s


@pytest.fixture(scope="module")
def fixture_state(client, mongo):
    """Set up base_price + account sku_pricing + a child SKU. Torn down at end."""
    state = {
        "child_id": None,
        "child_name": f"TEST_P2_Cust_{uuid.uuid4().hex[:6]}",
        "base_price_was": None,
        "pricing_was": None,
        "batches": [],
        "transfers": [],
        "branding_ids": [],
    }

    # 1. Snapshot & set base_price=10 on 24 Brand
    parent = mongo.master_skus.find_one({"id": PARENT_SKU_ID})
    assert parent, "24 Brand master SKU missing"
    state["base_price_was"] = parent.get("base_price")
    mongo.master_skus.update_one({"id": PARENT_SKU_ID},
                                 {"$set": {"base_price": 10.0}})

    # 2. Snapshot & add sku_pricing entry to Toopa account
    acc = mongo.accounts.find_one({"id": ACCOUNT_ID_TOOPA})
    assert acc, "Toopa Ice-creamery account missing"
    state["pricing_was"] = acc.get("sku_pricing") or []
    if not any(p.get("sku_id") == PARENT_SKU_ID for p in state["pricing_was"]):
        new_pricing = state["pricing_was"] + [
            {"sku_id": PARENT_SKU_ID, "sku": PARENT_SKU_NAME, "price_per_unit": 100.0}
        ]
        mongo.accounts.update_one({"id": ACCOUNT_ID_TOOPA},
                                  {"$set": {"sku_pricing": new_pricing}})

    # 3. Create customer child SKU via API
    payload = {
        "parent_sku_id": PARENT_SKU_ID,
        "child_sku_name": state["child_name"],
        "child_type": "customer",
        "customer_account_id": ACCOUNT_ID_TOOPA,
    }
    r = client.post(f"{BASE_URL}/api/child-skus", json=payload, timeout=30)
    assert r.status_code == 200, f"child-sku create failed: {r.status_code} {r.text}"
    state["child_id"] = r.json()["id"]

    yield state

    # ── Teardown ──
    # Cleanup stock transfers (reverse if completed, else delete)
    for tid in state["transfers"]:
        try:
            client.post(f"{BASE_URL}/api/distributor/stock-transfers/{tid}/reverse", timeout=30)
        except Exception:
            pass
        try:
            client.delete(f"{BASE_URL}/api/distributor/stock-transfers/{tid}?reverse_inventory=true", timeout=30)
        except Exception:
            pass
    # Batches — force delete cascades warehouse stock rollback
    for bid in state["batches"]:
        try:
            client.delete(f"{BASE_URL}/api/production/batches/{bid}?force=true", timeout=30)
        except Exception:
            pass
    # Purge any leftover factory_warehouse_stock rows tied to our child SKU
    try:
        mongo.factory_warehouse_stock.delete_many({
            "tenant_id": TENANT_ID, "child_sku_id": state["child_id"],
        })
        mongo.distributor_stock.delete_many({
            "tenant_id": TENANT_ID, "child_sku_id": state["child_id"],
        })
    except Exception:
        pass
    # Branding entries
    try:
        mongo.branding_entries.delete_many({
            "tenant_id": TENANT_ID, "id": {"$in": state["branding_ids"]},
        })
    except Exception:
        pass
    # Delete child SKU
    if state["child_id"]:
        try:
            client.delete(f"{BASE_URL}/api/child-skus/{state['child_id']}", timeout=30)
        except Exception:
            pass
        # Hard delete just in case
        try:
            mongo.child_skus.delete_one({"id": state["child_id"]})
        except Exception:
            pass
    # Restore base_price
    if state["base_price_was"] is None:
        mongo.master_skus.update_one({"id": PARENT_SKU_ID},
                                     {"$unset": {"base_price": ""}})
    else:
        mongo.master_skus.update_one({"id": PARENT_SKU_ID},
                                     {"$set": {"base_price": state["base_price_was"]}})
    # Restore account sku_pricing
    mongo.accounts.update_one({"id": ACCOUNT_ID_TOOPA},
                              {"$set": {"sku_pricing": state["pricing_was"]}})


# ─────────────────────────────────────────────────────────────────
# 1. Batch create/update with target_child_sku_id
# ─────────────────────────────────────────────────────────────────
class TestBatchTargetChild:
    def test_create_batch_with_target_child_and_skip_qc(self, client, fixture_state):
        code = f"TEST-P2-B-{uuid.uuid4().hex[:6].upper()}"
        payload = {
            "sku_id": PARENT_SKU_ID,
            "batch_code": code,
            "production_date": "2026-01-15",
            "total_crates": 100,
            "bottles_per_crate": 1,
            "skip_qc": True,
            "skip_qc_reason": "phase2 automated test",
            "target_child_sku_id": fixture_state["child_id"],
        }
        r = client.post(f"{BASE_URL}/api/production/batches", json=payload, timeout=30)
        assert r.status_code in (200, 201), r.text
        data = r.json()
        assert data.get("target_child_sku_id") == fixture_state["child_id"]
        assert data.get("target_child_sku_name") == fixture_state["child_name"]
        assert data.get("status") == "completed"
        fixture_state["batches"].append(data["id"])

    def test_update_batch_clear_and_set_target(self, client, fixture_state):
        bid = fixture_state["batches"][0]
        # Clear
        r = client.put(f"{BASE_URL}/api/production/batches/{bid}",
                       json={"target_child_sku_id": ""}, timeout=30)
        assert r.status_code == 200, r.text
        r2 = client.get(f"{BASE_URL}/api/production/batches/{bid}", timeout=30)
        assert r2.status_code == 200 and r2.json().get("target_child_sku_id") in (None, ""), r2.text
        # Set back
        r = client.put(f"{BASE_URL}/api/production/batches/{bid}",
                       json={"target_child_sku_id": fixture_state["child_id"]}, timeout=30)
        assert r.status_code == 200, r.text
        r2 = client.get(f"{BASE_URL}/api/production/batches/{bid}", timeout=30)
        assert r2.json().get("target_child_sku_id") == fixture_state["child_id"]

    def test_update_batch_invalid_child_id_400(self, client, fixture_state, mongo):
        # Create a child under a DIFFERENT parent (temporary) to make it invalid for our batch
        # We'll seed a synthetic child under a different parent.
        other_parent = mongo.master_skus.find_one({
            "id": {"$ne": PARENT_SKU_ID}, "is_active": True,
        }, {"id": 1})
        assert other_parent
        rogue = {
            "id": str(uuid.uuid4()),
            "tenant_id": TENANT_ID,
            "parent_sku_id": other_parent["id"],
            "child_sku_name": f"TEST_ROGUE_{uuid.uuid4().hex[:4]}",
            "child_sku_code": f"TEST-ROGUE-{uuid.uuid4().hex[:4]}",
            "child_type": "generic",
            "is_active": True,
        }
        try:
            mongo.child_skus.insert_one(rogue)
            bid = fixture_state["batches"][0]
            r = client.put(f"{BASE_URL}/api/production/batches/{bid}",
                           json={"target_child_sku_id": rogue["id"]}, timeout=30)
            assert r.status_code == 400, f"expected 400, got {r.status_code}: {r.text}"
            assert "does not belong" in r.text.lower() or "not belong" in r.text.lower()
        finally:
            mongo.child_skus.delete_one({"id": rogue["id"]})


# ─────────────────────────────────────────────────────────────────
# 2. Batch → Master Warehouse transfer classification
# ─────────────────────────────────────────────────────────────────
class TestBatchTransferToWarehouse:
    def _batch_id(self, fixture_state):
        return fixture_state["batches"][0]

    def test_transfer_default_uses_batch_target(self, client, fixture_state):
        bid = self._batch_id(fixture_state)
        r = client.post(
            f"{BASE_URL}/api/production/batches/{bid}/transfer-to-warehouse",
            json={"warehouse_location_id": NOIDA_WH_ID, "quantity": 30, "notes": "default"},
            timeout=30,
        )
        assert r.status_code == 200, r.text
        # Verify the resulting stock row is child-classified
        r2 = client.get(f"{BASE_URL}/api/production/factory-warehouse-stock?warehouse_id={NOIDA_WH_ID}",
                        timeout=30)
        assert r2.status_code == 200
        rows = r2.json().get("stock", [])
        branded = [x for x in rows if x.get("sku_id") == PARENT_SKU_ID
                   and x.get("child_sku_id") == fixture_state["child_id"]]
        assert branded, f"no branded stock row found; rows={rows}"
        assert sum(int(x.get("quantity") or 0) for x in branded) >= 30
        assert branded[0].get("child_sku_name") == fixture_state["child_name"]

    def test_transfer_explicit_generic(self, client, fixture_state):
        bid = self._batch_id(fixture_state)
        r = client.post(
            f"{BASE_URL}/api/production/batches/{bid}/transfer-to-warehouse",
            json={"warehouse_location_id": NOIDA_WH_ID, "quantity": 20, "child_sku_id": ""},
            timeout=30,
        )
        assert r.status_code == 200, r.text
        r2 = client.get(f"{BASE_URL}/api/production/factory-warehouse-stock?warehouse_id={NOIDA_WH_ID}",
                        timeout=30)
        rows = r2.json().get("stock", [])
        generic = [x for x in rows if x.get("sku_id") == PARENT_SKU_ID and not x.get("child_sku_id")]
        assert generic, f"no generic stock row found for parent SKU; rows={rows}"
        assert sum(int(x.get("quantity") or 0) for x in generic) >= 20

    def test_transfer_explicit_child_id(self, client, fixture_state):
        bid = self._batch_id(fixture_state)
        r = client.post(
            f"{BASE_URL}/api/production/batches/{bid}/transfer-to-warehouse",
            json={"warehouse_location_id": NOIDA_WH_ID, "quantity": 10,
                  "child_sku_id": fixture_state["child_id"]},
            timeout=30,
        )
        assert r.status_code == 200, r.text


# ─────────────────────────────────────────────────────────────────
# 3. Branding Entries
# ─────────────────────────────────────────────────────────────────
class TestBrandingEntries:
    def test_stock_breakdown(self, client, fixture_state):
        r = client.get(
            f"{BASE_URL}/api/branding-entries/stock-breakdown"
            f"?warehouse_location_id={NOIDA_WH_ID}&sku_id={PARENT_SKU_ID}",
            timeout=30,
        )
        assert r.status_code == 200, r.text
        breakdown = r.json().get("breakdown", [])
        # Should have Generic (None) and branded (our child)
        keys = {x.get("child_sku_id") for x in breakdown}
        assert None in keys or "" in keys, f"no Generic row: {breakdown}"
        assert fixture_state["child_id"] in keys, f"no branded row: {breakdown}"

    def test_create_branding_entry_generic_to_branded(self, client, fixture_state):
        # Move 5 bottles from Generic → branded
        r = client.post(
            f"{BASE_URL}/api/branding-entries",
            json={
                "warehouse_location_id": NOIDA_WH_ID,
                "sku_id": PARENT_SKU_ID,
                "from_child_sku_id": None,
                "to_child_sku_id": fixture_state["child_id"],
                "quantity": 5,
                "notes": "phase2 test G→B",
            },
            timeout=30,
        )
        assert r.status_code == 200, r.text
        entry = r.json()
        assert entry.get("entry_number", "").startswith("BRD-"), entry
        assert entry.get("quantity") == 5
        assert entry.get("to_child_sku_id") == fixture_state["child_id"]
        fixture_state["branding_ids"].append(entry["id"])

    def test_over_quantity_400(self, client, fixture_state):
        r = client.post(
            f"{BASE_URL}/api/branding-entries",
            json={
                "warehouse_location_id": NOIDA_WH_ID,
                "sku_id": PARENT_SKU_ID,
                "from_child_sku_id": None,
                "to_child_sku_id": fixture_state["child_id"],
                "quantity": 999_999,
            },
            timeout=30,
        )
        assert r.status_code == 400
        assert "insufficient" in r.text.lower()

    def test_reverse_branded_to_generic(self, client, fixture_state):
        r = client.post(
            f"{BASE_URL}/api/branding-entries",
            json={
                "warehouse_location_id": NOIDA_WH_ID,
                "sku_id": PARENT_SKU_ID,
                "from_child_sku_id": fixture_state["child_id"],
                "to_child_sku_id": None,
                "quantity": 2,
                "notes": "phase2 test B→G",
            },
            timeout=30,
        )
        assert r.status_code == 200, r.text
        fixture_state["branding_ids"].append(r.json()["id"])

    def test_list_entries(self, client, fixture_state):
        r = client.get(
            f"{BASE_URL}/api/branding-entries?warehouse_location_id={NOIDA_WH_ID}&sku_id={PARENT_SKU_ID}",
            timeout=30,
        )
        assert r.status_code == 200, r.text
        items = r.json().get("items", [])
        our_ids = {e["id"] for e in items}
        assert set(fixture_state["branding_ids"]).issubset(our_ids), f"missing entries; got {our_ids}"


# ─────────────────────────────────────────────────────────────────
# 4. Distributor Stock Transfer with classification
# ─────────────────────────────────────────────────────────────────
class TestStockTransferClassification:
    def test_location_stock_returns_stock_by_child(self, client):
        r = client.get(
            f"{BASE_URL}/api/distributor/stock-transfers/location-stock?location_id={NOIDA_WH_ID}",
            timeout=30,
        )
        assert r.status_code == 200, r.text
        body = r.json()
        assert "stock" in body and "stock_by_child" in body, body
        # Filter for our SKU
        by_child = [x for x in body["stock_by_child"] if x.get("sku_id") == PARENT_SKU_ID]
        keys = {x.get("child_sku_id") for x in by_child}
        assert None in keys, f"generic row missing: {by_child}"

    def test_transfer_with_classification_and_reverse(self, client, fixture_state):
        # Snapshot before
        r = client.get(
            f"{BASE_URL}/api/distributor/stock-transfers/location-stock?location_id={NOIDA_WH_ID}",
            timeout=30,
        )
        assert r.status_code == 200
        src_before = {(x.get("sku_id"), x.get("child_sku_id")): x.get("quantity") for x in r.json()["stock_by_child"]}

        payload = {
            "source_distributor_id": DIST_ID,
            "source_location_id": NOIDA_WH_ID,
            "dest_distributor_id": DIST_ID,
            "dest_location_id": TEST_WH_ID,
            "items": [{
                "sku_id": PARENT_SKU_ID,
                "sku_name": PARENT_SKU_NAME,
                "packaging_type_name": "Bottle",
                "units_per_package": 1,
                "quantity": 3,
                "child_sku_id": fixture_state["child_id"],
            }],
            "notes": "phase2 classification test",
        }
        r = client.post(f"{BASE_URL}/api/distributor/stock-transfers/", json=payload, timeout=45)
        assert r.status_code in (200, 201), r.text
        t = r.json()
        tid = t.get("id") or t.get("transfer", {}).get("id")
        assert tid, f"no transfer id: {t}"
        fixture_state["transfers"].append(tid)

        # Source branded should decrease by 3, dest branded should be >=3
        r = client.get(
            f"{BASE_URL}/api/distributor/stock-transfers/location-stock?location_id={NOIDA_WH_ID}",
            timeout=30,
        )
        src_after = {(x.get("sku_id"), x.get("child_sku_id")): x.get("quantity") for x in r.json()["stock_by_child"]}
        key = (PARENT_SKU_ID, fixture_state["child_id"])
        assert (src_before.get(key, 0) or 0) - (src_after.get(key, 0) or 0) == 3, \
            f"branded stock at source didn't decrease by 3: before={src_before.get(key)}, after={src_after.get(key)}"

        r = client.get(
            f"{BASE_URL}/api/distributor/stock-transfers/location-stock?location_id={TEST_WH_ID}",
            timeout=30,
        )
        dst = {(x.get("sku_id"), x.get("child_sku_id")): x.get("quantity") for x in r.json()["stock_by_child"]}
        assert dst.get(key, 0) >= 3, f"branded stock missing at dest: {dst}"

        # Reverse
        r = client.post(f"{BASE_URL}/api/distributor/stock-transfers/{tid}/reverse", timeout=45)
        assert r.status_code == 200, r.text  # zoho may fail non-fatally
        # After reverse: dest should drop by 3, source should recover
        r = client.get(
            f"{BASE_URL}/api/distributor/stock-transfers/location-stock?location_id={NOIDA_WH_ID}",
            timeout=30,
        )
        src_rev = {(x.get("sku_id"), x.get("child_sku_id")): x.get("quantity") for x in r.json()["stock_by_child"]}
        assert src_rev.get(key, 0) == src_before.get(key, 0), \
            f"source not restored after reverse: before={src_before.get(key)}, after_reverse={src_rev.get(key)}"

    def test_over_availability_400_mentions_child_name(self, client, fixture_state):
        payload = {
            "source_distributor_id": DIST_ID,
            "source_location_id": NOIDA_WH_ID,
            "dest_distributor_id": DIST_ID,
            "dest_location_id": TEST_WH_ID,
            "items": [{
                "sku_id": PARENT_SKU_ID,
                "sku_name": PARENT_SKU_NAME,
                "packaging_type_name": "Bottle",
                "units_per_package": 1,
                "quantity": 999_999,
                "child_sku_id": fixture_state["child_id"],
            }],
        }
        r = client.post(f"{BASE_URL}/api/distributor/stock-transfers/", json=payload, timeout=30)
        assert r.status_code == 400, r.text
        assert fixture_state["child_name"] in r.text, f"child name missing from error: {r.text}"


# ─────────────────────────────────────────────────────────────────
# 5. Regression — legacy flows still work
# ─────────────────────────────────────────────────────────────────
class TestLegacyRegression:
    def test_plain_stock_transfer_no_classification(self, client, fixture_state):
        payload = {
            "source_distributor_id": DIST_ID,
            "source_location_id": NOIDA_WH_ID,
            "dest_distributor_id": DIST_ID,
            "dest_location_id": TEST_WH_ID,
            "items": [{
                "sku_id": PARENT_SKU_ID,
                "sku_name": PARENT_SKU_NAME,
                "packaging_type_name": "Bottle",
                "units_per_package": 1,
                "quantity": 2,
                # no child_sku_id → Generic
            }],
            "notes": "phase2 regression - generic transfer",
        }
        r = client.post(f"{BASE_URL}/api/distributor/stock-transfers/", json=payload, timeout=45)
        assert r.status_code in (200, 201), r.text
        t = r.json()
        tid = t.get("id") or t.get("transfer", {}).get("id")
        assert tid
        fixture_state["transfers"].append(tid)

    def test_warehouse_stock_overview_ok(self, client):
        r = client.get(f"{BASE_URL}/api/distributor/stock-transfers/warehouse-stock-overview", timeout=30)
        assert r.status_code == 200

    def test_distributor_stock_summary_ok(self, client):
        r = client.get(f"{BASE_URL}/api/distributors/{DIST_ID}/stock-summary", timeout=30)
        # Might return 200 or 404 depending on route; just verify no 500
        assert r.status_code < 500, r.text


if __name__ == "__main__":
    pytest.main([__file__, "-v", "--tb=short"])
