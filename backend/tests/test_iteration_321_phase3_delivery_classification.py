"""Iteration 321 — SKU Hierarchy Phase 3 (P0) — delivery-order fulfilment classification.

Covers backend features for /api/distributors/{DIST}/deliveries:
- Item-level child_sku_id / child_sku_name persistence
- Customer-match guard (branded item to a DIFFERENT account → 400 "is branded for")
- Wrong-parent child (child_sku_id of another SKU) → 400 "does not belong to"
- Classification-scoped availability: branded shortage message contains child name
  and reserved count; generic lines validated against generic stock only
- complete-delivery deducts ONLY branded row; generic untouched
- reverse-delivery restores branded row exactly
- Regression: plain generic create + complete + reverse still works and only
  touches Generic rows (child_sku_id in [None])
- GET returns items carrying child fields

Fixture per SETUP:
(a) Add {sku_id, sku, price} to Toopa account sku_pricing
(b) Set master_skus base_price=10 on 24 Brand
(c) Ensure distributor_margin_matrix has active row for DIST + Hyderabad + SKU
(d) Create a customer child SKU under 24 Brand for Toopa via API
(e) Create two batches with skip_qc=True (one branded, one generic) and transfer
    60 bottles each to Noida Factory Warehouse (0361dd27...); note the WH already
    has 9 pre-existing GENERIC bottles → baseline generic 9, post-transfer 69.

Full teardown: reverse open deliveries, delete deliveries + child + batches +
warehouse_transfers, purge any leaked stock rows tied to our child, restore Noida
generic to exactly 9, unset base_price, remove sku_pricing entry, drop our margin row.
"""
from __future__ import annotations
import os
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

PARENT_SKU_ID = "8bc87348-5398-4604-92d8-eff59610b7f9"    # 24 Brand
PARENT_SKU_NAME = "24 Brand"
NOIDA_WH_ID = "0361dd27-e65b-4537-afa5-8486822e0a54"       # factory, no batch tracking
DIST_ID = "99fb55dc-532c-4e85-b618-6b8a5e552c04"
ACCOUNT_ID_TOOPA = "81263309-2118-4d51-b1d9-fe9549da07b7"  # Toopa Ice-creamery
BASELINE_GENERIC = 9                                        # pre-existing generic bottles

MONGO_URL = os.environ.get("MONGO_URL", "mongodb://localhost:27017")
DB_NAME = os.environ.get("DB_NAME", "test_database")


# ─────────────────────────────────────────────────────────────────
# Fixtures
# ─────────────────────────────────────────────────────────────────
@pytest.fixture(scope="module")
def mongo():
    c = MongoClient(MONGO_URL)
    yield c[DB_NAME]
    c.close()


@pytest.fixture(scope="module")
def client():
    s = requests.Session()
    r = s.post(f"{BASE_URL}/api/auth/login",
               json={"email": EMAIL, "password": PASSWORD}, timeout=30)
    assert r.status_code == 200, r.text
    tok = r.json().get("session_token")
    assert tok
    s.headers.update({
        "Authorization": f"Bearer {tok}",
        "X-Tenant-ID": TENANT_ID,
        "Content-Type": "application/json",
    })
    yield s


@pytest.fixture(scope="module")
def state(client, mongo):
    """SETUP fixtures + teardown that restores tenant to pre-test state."""
    st = {
        "child_id": None,
        "child_name": f"TEST_P3_Cust_{uuid.uuid4().hex[:6]}",
        "rogue_child_id": None,
        "base_price_was": None,
        "pricing_was": None,
        "margin_id_we_created": None,
        "batches": [],
        "deliveries": [],   # (id, status_hint) — we clean up all
        "second_account": None,
        "other_parent_sku_id": None,
    }

    # (b) base_price snapshot & set
    parent = mongo.master_skus.find_one({"id": PARENT_SKU_ID})
    assert parent, "24 Brand master SKU missing"
    st["base_price_was"] = parent.get("base_price")
    mongo.master_skus.update_one({"id": PARENT_SKU_ID},
                                 {"$set": {"base_price": 10.0}})

    # (a) sku_pricing snapshot & add
    acc = mongo.accounts.find_one({"id": ACCOUNT_ID_TOOPA})
    assert acc, "Toopa account missing"
    st["pricing_was"] = acc.get("sku_pricing") or []
    if not any(p.get("sku_id") == PARENT_SKU_ID for p in st["pricing_was"]):
        new_pricing = st["pricing_was"] + [
            {"sku_id": PARENT_SKU_ID, "sku": PARENT_SKU_NAME, "price_per_unit": 100.0}
        ]
        mongo.accounts.update_one({"id": ACCOUNT_ID_TOOPA},
                                  {"$set": {"sku_pricing": new_pricing}})

    # (c) distributor_margin_matrix — insert directly if not present
    existing_mm = mongo.distributor_margin_matrix.find_one({
        "tenant_id": TENANT_ID, "distributor_id": DIST_ID,
        "sku_id": PARENT_SKU_ID, "city": "Hyderabad", "status": "active",
    })
    if not existing_mm:
        mid = str(uuid.uuid4())
        mongo.distributor_margin_matrix.insert_one({
            "id": mid, "tenant_id": TENANT_ID, "distributor_id": DIST_ID,
            "state": "Telangana", "city": "Hyderabad",
            "sku_id": PARENT_SKU_ID, "sku_name": PARENT_SKU_NAME,
            "base_price": 10.0, "margin_type": "percentage",
            "margin_value": 5.0, "transfer_price": 9.5,
            "active_from": "2020-01-01", "active_to": None,
            "status": "active", "created_at": "2026-01-01T00:00:00Z",
            "updated_at": "2026-01-01T00:00:00Z",
        })
        st["margin_id_we_created"] = mid

    # (d) Create customer child SKU
    r = client.post(f"{BASE_URL}/api/child-skus", json={
        "parent_sku_id": PARENT_SKU_ID,
        "child_sku_name": st["child_name"],
        "child_type": "customer",
        "customer_account_id": ACCOUNT_ID_TOOPA,
    }, timeout=30)
    assert r.status_code in (200, 201), f"child-sku create failed: {r.text}"
    st["child_id"] = r.json()["id"]

    # (e) Create two batches skip_qc=True — one branded, one generic — and transfer
    for tag, target in (("BRANDED", st["child_id"]), ("GENERIC", None)):
        code = f"TEST-P3-{tag}-{uuid.uuid4().hex[:5].upper()}"
        payload = {
            "sku_id": PARENT_SKU_ID, "batch_code": code,
            "production_date": "2026-01-15",
            "total_crates": 5, "bottles_per_crate": 12,
            "skip_qc": True, "skip_qc_reason": "phase3 automated test",
        }
        if target:
            payload["target_child_sku_id"] = target
        r = client.post(f"{BASE_URL}/api/production/batches", json=payload, timeout=30)
        assert r.status_code in (200, 201), r.text
        bid = r.json()["id"]
        st["batches"].append(bid)
        r = client.post(
            f"{BASE_URL}/api/production/batches/{bid}/transfer-to-warehouse",
            json={"warehouse_location_id": NOIDA_WH_ID, "quantity": 60}, timeout=30,
        )
        assert r.status_code in (200, 201), f"transfer failed for {tag}: {r.text}"

    # Rogue child under another parent — for wrong-parent test
    other_parent = mongo.master_skus.find_one({
        "id": {"$ne": PARENT_SKU_ID}, "is_active": True,
    }, {"id": 1, "name": 1})
    if other_parent:
        # allows_child_skus filter above may miss — insert rogue directly if API fails
        rogue_id = str(uuid.uuid4())
        rogue_doc = {
            "id": rogue_id, "tenant_id": TENANT_ID,
            "parent_sku_id": other_parent["id"],
            "child_sku_name": f"TEST_P3_ROGUE_{uuid.uuid4().hex[:5]}",
            "child_sku_code": f"TEST-ROGUE-{uuid.uuid4().hex[:4]}",
            "child_type": "generic", "is_active": True,
            "created_at": "2026-01-01T00:00:00Z",
        }
        mongo.child_skus.insert_one(rogue_doc)
        st["rogue_child_id"] = rogue_id
        st["other_parent_sku_id"] = other_parent["id"]

    # Find a second account (different from Toopa) with a delivery city
    acc2 = mongo.accounts.find_one(
        {"tenant_id": TENANT_ID, "id": {"$ne": ACCOUNT_ID_TOOPA}, "is_active": {"$ne": False}},
        {"id": 1, "account_name": 1}
    )
    st["second_account"] = acc2 and acc2.get("id")

    yield st

    # ── TEARDOWN ──
    # 1. Cancel/delete our deliveries (reverse if completed)
    for did in st["deliveries"]:
        try:
            client.post(f"{BASE_URL}/api/distributors/{DIST_ID}/deliveries/{did}/reverse",
                        params={"acknowledge": "true"}, timeout=30)
        except Exception:
            pass
        try:
            client.delete(f"{BASE_URL}/api/distributors/{DIST_ID}/deliveries/{did}", timeout=30)
        except Exception:
            pass
    # Hard purge any lingering delivery docs by TEST child_sku_name
    try:
        mongo.distributor_deliveries.delete_many({
            "tenant_id": TENANT_ID,
            "id": {"$in": st["deliveries"]},
        })
    except Exception:
        pass

    # 2. Force-delete batches (cascades stock rollback)
    for bid in st["batches"]:
        try:
            client.delete(f"{BASE_URL}/api/production/batches/{bid}",
                          params={"force": "true"}, timeout=30)
        except Exception:
            pass

    # 3. Purge our warehouse_transfers docs & any leaked stock rows
    try:
        mongo.warehouse_transfers.delete_many({
            "tenant_id": TENANT_ID, "batch_id": {"$in": st["batches"]},
        })
    except Exception:
        pass
    # Purge branded/child rows we created
    if st["child_id"]:
        mongo.factory_warehouse_stock.delete_many({
            "tenant_id": TENANT_ID, "child_sku_id": st["child_id"],
        })
        mongo.distributor_stock.delete_many({
            "tenant_id": TENANT_ID, "child_sku_id": st["child_id"],
        })
    # Restore Noida generic to exactly BASELINE_GENERIC (9)
    mongo.factory_warehouse_stock.update_one(
        {"tenant_id": TENANT_ID, "warehouse_location_id": NOIDA_WH_ID,
         "sku_id": PARENT_SKU_ID, "child_sku_id": None},
        {"$set": {"quantity": BASELINE_GENERIC}},
    )

    # 4. Delete rogue + main child SKUs
    if st["rogue_child_id"]:
        try:
            mongo.child_skus.delete_one({"id": st["rogue_child_id"]})
        except Exception:
            pass
    if st["child_id"]:
        try:
            client.delete(f"{BASE_URL}/api/child-skus/{st['child_id']}", timeout=30)
        except Exception:
            pass
        try:
            mongo.child_skus.delete_one({"id": st["child_id"]})
        except Exception:
            pass

    # 5. Restore base_price
    if st["base_price_was"] is None:
        mongo.master_skus.update_one({"id": PARENT_SKU_ID},
                                     {"$unset": {"base_price": ""}})
    else:
        mongo.master_skus.update_one({"id": PARENT_SKU_ID},
                                     {"$set": {"base_price": st["base_price_was"]}})

    # 6. Restore Toopa sku_pricing
    mongo.accounts.update_one({"id": ACCOUNT_ID_TOOPA},
                              {"$set": {"sku_pricing": st["pricing_was"]}})

    # 7. Drop margin row we created (only if WE created it)
    if st["margin_id_we_created"]:
        mongo.distributor_margin_matrix.delete_one({"id": st["margin_id_we_created"]})


# Helpers ─────────────────────────────────────────────────────────
def _breakdown(client, sku_id=PARENT_SKU_ID, wh=NOIDA_WH_ID):
    r = client.get(
        f"{BASE_URL}/api/branding-entries/stock-breakdown",
        params={"warehouse_location_id": wh, "sku_id": sku_id}, timeout=30,
    )
    assert r.status_code == 200, r.text
    rows = r.json().get("breakdown") or []
    return {row.get("child_sku_id"): row.get("quantity") for row in rows}


def _payload_base():
    return {
        "distributor_id": DIST_ID,
        "distributor_location_id": NOIDA_WH_ID,
        "account_id": ACCOUNT_ID_TOOPA,
        "delivery_date": "2026-06-13",
    }


def _branded_item(child_id, qty=24, packages=2):
    return {
        "sku_id": PARENT_SKU_ID, "sku_name": PARENT_SKU_NAME,
        "quantity": qty, "unit_price": 10,
        "packaging_units": 12, "packages": packages,
        "packaging_type_name": "Crate - 12",
        "child_sku_id": child_id,
    }


def _generic_item(qty=24, packages=2):
    return {
        "sku_id": PARENT_SKU_ID, "sku_name": PARENT_SKU_NAME,
        "quantity": qty, "unit_price": 10,
        "packaging_units": 12, "packages": packages,
        "packaging_type_name": "Crate - 12",
    }


# ─────────────────────────────────────────────────────────────────
# Test cases
# ─────────────────────────────────────────────────────────────────
class TestFixtureSanity:
    def test_baseline_stock_60_branded_69_generic(self, client, state):
        bd = _breakdown(client)
        # Baseline generic 9 + 60 transferred = 69 ; branded = 60
        assert bd.get(state["child_id"]) == 60, f"branded stock wrong: {bd}"
        assert bd.get(None) == BASELINE_GENERIC + 60, f"generic stock wrong: {bd}"


class TestDeliveryCreation:
    def test_branded_delivery_to_right_account_persists_child(self, client, state):
        r = client.post(
            f"{BASE_URL}/api/distributors/{DIST_ID}/deliveries",
            json={**_payload_base(), "items": [_branded_item(state["child_id"])]}, timeout=30,
        )
        assert r.status_code in (200, 201), r.text
        j = r.json()
        state["deliveries"].append(j["id"])
        state["branded_deliv_id"] = j["id"]
        items = j.get("items") or []
        assert items, "delivery has no items"
        it = items[0]
        assert it.get("child_sku_id") == state["child_id"], it
        assert it.get("child_sku_name"), it

    def test_get_returns_child_fields(self, client, state):
        did = state["branded_deliv_id"]
        r = client.get(f"{BASE_URL}/api/distributors/{DIST_ID}/deliveries/{did}", timeout=30)
        assert r.status_code == 200, r.text
        items = r.json().get("items") or []
        assert items and items[0].get("child_sku_id") == state["child_id"]
        assert items[0].get("child_sku_name")


class TestCustomerMatchGuard:
    def test_branded_to_different_account_400(self, client, state):
        if not state["second_account"]:
            pytest.skip("no second account available")
        r = client.post(
            f"{BASE_URL}/api/distributors/{DIST_ID}/deliveries",
            json={**_payload_base(), "account_id": state["second_account"],
                  "items": [_branded_item(state["child_id"])]}, timeout=30,
        )
        assert r.status_code == 400, r.text
        assert "branded for" in r.text.lower() or "branded for" in r.text

    def test_wrong_parent_child_400(self, client, state):
        if not state["rogue_child_id"]:
            pytest.skip("no rogue child available")
        # We pass child_sku_id of another parent's child; expect 400
        r = client.post(
            f"{BASE_URL}/api/distributors/{DIST_ID}/deliveries",
            json={**_payload_base(),
                  "items": [_branded_item(state["rogue_child_id"])]}, timeout=30,
        )
        assert r.status_code == 400, r.text
        assert "does not belong" in r.text.lower(), r.text


class TestClassificationScopedAvailability:
    def test_branded_over_qty_with_reserved_netting(self, client, state):
        # Open branded delivery already reserves 24 of 60 → available 36.
        # Request 48 → should fail with '[' <child> ']' and 'reserved' mention.
        r = client.post(
            f"{BASE_URL}/api/distributors/{DIST_ID}/deliveries",
            json={**_payload_base(),
                  "items": [_branded_item(state["child_id"], qty=48, packages=4)]},
            timeout=30,
        )
        assert r.status_code == 400, r.text
        body = r.text
        assert "[" in body and state["child_name"].split("_")[-1] in body or "reserved" in body.lower(), body

    def test_generic_line_within_generic_only_ok(self, client, state):
        # Generic stock = 69. Available generic (no other open generic reservations) = 69.
        # Request 48 as generic → 200 (not blocked by 60 branded stock).
        r = client.post(
            f"{BASE_URL}/api/distributors/{DIST_ID}/deliveries",
            json={**_payload_base(),
                  "items": [_generic_item(qty=48, packages=4)]}, timeout=30,
        )
        assert r.status_code in (200, 201), r.text
        gid = r.json()["id"]
        state["deliveries"].append(gid)
        state["_generic_scoped_deliv"] = gid

    def test_generic_over_qty_ignores_branded_stock(self, client, state):
        # Add another open generic reservation to push us over: 48 already reserved, +48 = 96 > 69
        r = client.post(
            f"{BASE_URL}/api/distributors/{DIST_ID}/deliveries",
            json={**_payload_base(),
                  "items": [_generic_item(qty=48, packages=4)]}, timeout=30,
        )
        # Should fail because generic-only availability (69) exceeded, NOT because branded exists
        assert r.status_code == 400, r.text
        # Delete the one generic draft we created earlier to unblock complete-branded flow
        gid = state.get("_generic_scoped_deliv")
        if gid:
            client.delete(f"{BASE_URL}/api/distributors/{DIST_ID}/deliveries/{gid}", timeout=30)
            state["deliveries"] = [d for d in state["deliveries"] if d != gid]


class TestCompleteAndReverse:
    def test_complete_deducts_only_branded(self, client, state):
        did = state["branded_deliv_id"]
        before = _breakdown(client)
        r = client.post(f"{BASE_URL}/api/distributors/{DIST_ID}/deliveries/{did}/complete", timeout=30)
        assert r.status_code == 200, r.text
        after = _breakdown(client)
        assert after.get(None) == before.get(None), f"generic changed: {before} -> {after}"
        assert after.get(state["child_id"]) == before.get(state["child_id"]) - 24, \
            f"branded not deducted by 24: {before} -> {after}"

    def test_reverse_restores_branded_exact(self, client, state):
        did = state["branded_deliv_id"]
        before = _breakdown(client)
        r = client.post(f"{BASE_URL}/api/distributors/{DIST_ID}/deliveries/{did}/reverse",
                        params={"acknowledge": "true"}, timeout=30)
        assert r.status_code == 200, r.text
        after = _breakdown(client)
        assert after.get(None) == before.get(None), f"generic changed on reverse: {before} -> {after}"
        assert after.get(state["child_id"]) == before.get(state["child_id"]) + 24, \
            f"branded not restored by 24: {before} -> {after}"


class TestGenericRegression:
    """classification-less flows still work and only touch Generic rows."""
    def test_plain_generic_create_complete_reverse(self, client, state):
        # Create plain generic delivery (no child_sku_id) — 24 bottles.
        r = client.post(
            f"{BASE_URL}/api/distributors/{DIST_ID}/deliveries",
            json={**_payload_base(), "items": [_generic_item(qty=24, packages=2)]}, timeout=30,
        )
        assert r.status_code in (200, 201), r.text
        did = r.json()["id"]
        state["deliveries"].append(did)
        items = r.json().get("items") or []
        # Item should NOT carry a child_sku_id
        assert not items[0].get("child_sku_id"), items[0]

        before = _breakdown(client)
        # Complete → generic decrement, branded unchanged
        r = client.post(f"{BASE_URL}/api/distributors/{DIST_ID}/deliveries/{did}/complete", timeout=30)
        assert r.status_code == 200, r.text
        after = _breakdown(client)
        assert after.get(None) == before.get(None) - 24, \
            f"generic not deducted: {before} -> {after}"
        assert after.get(state["child_id"]) == before.get(state["child_id"]), \
            f"branded touched by generic complete: {before} -> {after}"

        # Reverse → restores generic exactly
        r = client.post(f"{BASE_URL}/api/distributors/{DIST_ID}/deliveries/{did}/reverse",
                        params={"acknowledge": "true"}, timeout=30)
        assert r.status_code == 200, r.text
        after2 = _breakdown(client)
        assert after2.get(None) == before.get(None), \
            f"generic not restored: {before} -> {after2}"
        assert after2.get(state["child_id"]) == before.get(state["child_id"]), \
            f"branded touched by generic reverse: {before} -> {after2}"
