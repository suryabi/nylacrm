"""Backend tests for Brand Group 'Consolidate SKUs' feature.

Covers:
- Preview endpoint (CEO ok, non-admin 403)
- Consolidate happy path with batch-aware FIFO
- Idempotency, unknown group, keep not in group validation
- Customer stock dashboard shared:true after consolidation
- Cleanup
"""
import os
import uuid
from datetime import datetime, timezone

import pytest
import requests
from pymongo import MongoClient

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "").rstrip("/")
if not BASE_URL:
    import re, pathlib
    for line in pathlib.Path("/app/frontend/.env").read_text().splitlines():
        m = re.match(r"REACT_APP_BACKEND_URL=\"?([^\"]+)\"?", line)
        if m:
            BASE_URL = m.group(1).rstrip("/")
API = f"{BASE_URL}/api"

MONGO_URL = os.environ.get("MONGO_URL") or "mongodb://localhost:27017"
DB_NAME = os.environ.get("DB_NAME") or "test_database"
TENANT_ID = "nyla-air-water"

CEO_EMAIL = "surya.yadavalli@nylaairwater.earth"
CEO_PWD = "test123"
NONADM_EMAIL = "creative.director@nylaairwater.earth"
NONADM_PWD = "test123"

PARENT_SKU_ID = "20d525e8-c4af-4f40-965a-549dcd50c0a9"
DIST_ID = "bb12d90e-4d33-4890-ac5f-17573c551b5c"
DIST_LOC = "aa2eda05-1902-4a17-92bb-d33533535297"  # Delhi

STATE = {}


@pytest.fixture(scope="module")
def mongo():
    c = MongoClient(MONGO_URL)
    yield c[DB_NAME]
    c.close()


def _login(email, pwd):
    r = requests.post(f"{API}/auth/login", json={"email": email, "password": pwd}, timeout=20)
    assert r.status_code == 200, f"login {email}: {r.status_code} {r.text[:200]}"
    return r.json().get("session_token") or r.json().get("token")


@pytest.fixture(scope="module")
def ceo_headers():
    tok = _login(CEO_EMAIL, CEO_PWD)
    return {"Authorization": f"Bearer {tok}", "X-Tenant-ID": TENANT_ID, "Content-Type": "application/json"}


@pytest.fixture(scope="module")
def nonadm_headers():
    tok = _login(NONADM_EMAIL, NONADM_PWD)
    return {"Authorization": f"Bearer {tok}", "X-Tenant-ID": TENANT_ID, "Content-Type": "application/json"}


def _clean(mongo):
    mongo.brand_groups.delete_many({"tenant_id": TENANT_ID, "name": {"$regex": "^QA-CONS "}})
    mongo.child_skus.delete_many({"tenant_id": TENANT_ID, "child_sku_name": {"$regex": "^QA-CONS "}})
    mongo.distributor_stock.delete_many({"tenant_id": TENANT_ID, "batch_code": {"$regex": "^QA-CONS-"}})
    mongo.branding_entries.delete_many({"tenant_id": TENANT_ID, "notes": {"$regex": "QA-CONS"}})
    mongo.accounts.delete_many({"tenant_id": TENANT_ID, "account_name": {"$regex": "^QA-CONS "}})


# ---------- setup ----------
def test_00_setup_accounts_and_group(ceo_headers, mongo):
    _clean(mongo)
    # Ensure parent allows child SKUs
    parent = mongo.master_skus.find_one({"id": PARENT_SKU_ID})
    assert parent, "parent sku missing"
    STATE["parent_orig_allows"] = parent.get("allows_child_skus")
    if not parent.get("allows_child_skus"):
        mongo.master_skus.update_one({"id": PARENT_SKU_ID}, {"$set": {"allows_child_skus": True}})

    # Create 2 QA accounts directly in Mongo (avoids touching seed data / lead pipeline)
    now = datetime.now(timezone.utc).isoformat()
    a_id, b_id = str(uuid.uuid4()), str(uuid.uuid4())
    for aid, name in [(a_id, "QA-CONS Account Alpha"), (b_id, "QA-CONS Account Beta")]:
        mongo.accounts.insert_one({
            "id": aid, "tenant_id": TENANT_ID, "account_name": name,
            "account_id": f"QA-{aid[:6]}", "city": "Delhi",
            "status": "active", "is_active": True,
            "sku_pricing": [{"sku_id": PARENT_SKU_ID, "price": 100}],
            "created_at": now, "updated_at": now,
        })
    STATE["acct_a"] = a_id
    STATE["acct_b"] = b_id

    # Create the brand group via API
    r = requests.post(f"{API}/brand-groups", headers=ceo_headers,
                      json={"name": "QA-CONS Group One", "account_ids": [a_id, b_id]}, timeout=20)
    assert r.status_code in (200, 201), r.text
    STATE["group_id"] = r.json()["id"]
    STATE["group_name"] = r.json()["name"]


def test_01_create_two_individual_child_skus(ceo_headers):
    # Child A → account Alpha
    r1 = requests.post(f"{API}/child-skus", headers=ceo_headers, json={
        "parent_sku_id": PARENT_SKU_ID,
        "child_sku_name": "QA-CONS Child A",
        "child_type": "customer",
        "customer_account_id": STATE["acct_a"],
    }, timeout=25)
    assert r1.status_code == 200, r1.text
    STATE["child_a"] = r1.json()["id"]

    r2 = requests.post(f"{API}/child-skus", headers=ceo_headers, json={
        "parent_sku_id": PARENT_SKU_ID,
        "child_sku_name": "QA-CONS Child B",
        "child_type": "customer",
        "customer_account_id": STATE["acct_b"],
    }, timeout=25)
    assert r2.status_code == 200, r2.text
    STATE["child_b"] = r2.json()["id"]


def test_02_insert_distributor_stock(mongo):
    now = datetime.now(timezone.utc).isoformat()
    rows = [
        # child A: 120 QA-CONS-B1
        {"child_sku_id": STATE["child_a"], "child_sku_name": "QA-CONS Child A",
         "batch_id": "qa-cons-b1", "batch_code": "QA-CONS-B1", "quantity": 120},
        # child B: 60 QA-CONS-B2
        {"child_sku_id": STATE["child_b"], "child_sku_name": "QA-CONS Child B",
         "batch_id": "qa-cons-b2", "batch_code": "QA-CONS-B2", "quantity": 60},
        # child B: 30 QA-CONS-B3
        {"child_sku_id": STATE["child_b"], "child_sku_name": "QA-CONS Child B",
         "batch_id": "qa-cons-b3", "batch_code": "QA-CONS-B3", "quantity": 30},
    ]
    for r in rows:
        mongo.distributor_stock.insert_one({
            "id": str(uuid.uuid4()), "tenant_id": TENANT_ID,
            "distributor_id": DIST_ID, "distributor_location_id": DIST_LOC,
            "sku_id": PARENT_SKU_ID, "created_at": now, **r,
        })


# ---------- Preview ----------
def test_03_preview_ceo(ceo_headers):
    r = requests.get(f"{API}/brand-groups/{STATE['group_id']}/consolidation-preview",
                     headers=ceo_headers, timeout=20)
    assert r.status_code == 200, r.text
    d = r.json()
    parents = d.get("parents") or []
    p = next((x for x in parents if x["parent_sku_id"] == PARENT_SKU_ID), None)
    assert p, f"parent block missing; got {[x['parent_sku_id'] for x in parents]}"
    assert p["needs_consolidation"] is True
    kids = {c["child_sku_id"]: c for c in p["children"]}
    assert STATE["child_a"] in kids and STATE["child_b"] in kids
    assert kids[STATE["child_a"]]["shared"] is False
    assert kids[STATE["child_b"]]["shared"] is False
    assert kids[STATE["child_a"]]["stock_total"] == 120
    assert kids[STATE["child_b"]]["stock_total"] == 90
    # suggested_keep = child with most stock => A
    assert p["suggested_keep"] == STATE["child_a"], f"expected A, got {p['suggested_keep']}"


def test_04_preview_nonadmin_forbidden(nonadm_headers):
    r = requests.get(f"{API}/brand-groups/{STATE['group_id']}/consolidation-preview",
                     headers=nonadm_headers, timeout=20)
    assert r.status_code == 403, r.text


# ---------- Consolidate ----------
def test_05_consolidate_keep_a(ceo_headers, mongo):
    r = requests.post(f"{API}/brand-groups/{STATE['group_id']}/consolidate",
                      headers=ceo_headers, json={
                          "parent_sku_id": PARENT_SKU_ID,
                          "keep_child_sku_id": STATE["child_a"],
                      }, timeout=30)
    assert r.status_code == 200, r.text
    d = r.json()
    assert d["ok"] is True, d
    assert d["keep"]["child_sku_id"] == STATE["child_a"]
    assert d["keep"]["promoted_from"] == "QA-CONS Account Alpha"
    assert d["moved_units"] == 90
    assert len(d["moved"]) == 1
    m0 = d["moved"][0]
    assert m0["child_sku_id"] == STATE["child_b"]
    assert m0["quantity"] == 90
    assert m0["entry_number"].startswith("BRD-")
    assert len(d["deactivated"]) == 1
    assert d["deactivated"][0]["child_sku_id"] == STATE["child_b"]
    assert d["errors"] == []

    # Mongo checks
    ca = mongo.child_skus.find_one({"id": STATE["child_a"]})
    assert ca["brand_group_id"] == STATE["group_id"]
    assert ca.get("customer_account_id") in (None, "")
    assert ca.get("customer_account_name") == STATE["group_name"]

    cb = mongo.child_skus.find_one({"id": STATE["child_b"]})
    assert cb["is_active"] is False
    assert cb["consolidated_into_child_sku_id"] == STATE["child_a"]

    # distributor_stock: child A rows sum to 210, child B rows sum to 0
    a_rows = list(mongo.distributor_stock.find({"tenant_id": TENANT_ID, "child_sku_id": STATE["child_a"]}))
    b_rows = list(mongo.distributor_stock.find({"tenant_id": TENANT_ID, "child_sku_id": STATE["child_b"]}))
    a_total = sum(int(r.get("quantity") or 0) for r in a_rows)
    b_total = sum(int(r.get("quantity") or 0) for r in b_rows)
    assert a_total == 210, f"child A total expected 210 got {a_total}; rows={[(r.get('batch_code'), r.get('quantity')) for r in a_rows]}"
    assert b_total == 0, f"child B rows should be drained, got {b_total}"

    # Batch lineage: rows on child A per batch
    by_batch = {r.get("batch_code"): int(r.get("quantity") or 0) for r in a_rows if int(r.get("quantity") or 0) > 0}
    assert by_batch.get("QA-CONS-B1") == 120
    assert by_batch.get("QA-CONS-B2") == 60
    assert by_batch.get("QA-CONS-B3") == 30

    # branding_entries: exactly one new entry from B → A qty 90 with 2 batch moves
    entries = list(mongo.branding_entries.find({
        "tenant_id": TENANT_ID,
        "from_child_sku_id": STATE["child_b"],
        "to_child_sku_id": STATE["child_a"],
    }))
    assert len(entries) == 1, f"expected 1 entry, got {len(entries)}"
    e = entries[0]
    assert e["quantity"] == 90
    move_batches = {m.get("batch_code") for m in (e.get("moves") or [])}
    assert {"QA-CONS-B2", "QA-CONS-B3"}.issubset(move_batches), f"got {move_batches}"

    # brand_groups.consolidations[] appended
    g = mongo.brand_groups.find_one({"id": STATE["group_id"]})
    cons = g.get("consolidations") or []
    assert len(cons) == 1
    assert cons[0]["keep_child_sku_id"] == STATE["child_a"]


# ---------- Idempotent + edge cases ----------
def test_06_consolidate_again_idempotent(ceo_headers):
    r = requests.post(f"{API}/brand-groups/{STATE['group_id']}/consolidate",
                      headers=ceo_headers, json={
                          "parent_sku_id": PARENT_SKU_ID,
                          "keep_child_sku_id": STATE["child_a"],
                      }, timeout=20)
    assert r.status_code == 200, r.text
    d = r.json()
    assert d["ok"] is True
    assert d["moved"] == []
    assert d["deactivated"] == []
    assert d["moved_units"] == 0


def test_07_consolidate_keep_not_in_group_400(ceo_headers):
    # Child B is now deactivated & not in the group anymore → 400
    r = requests.post(f"{API}/brand-groups/{STATE['group_id']}/consolidate",
                      headers=ceo_headers, json={
                          "parent_sku_id": PARENT_SKU_ID,
                          "keep_child_sku_id": STATE["child_b"],
                      }, timeout=20)
    assert r.status_code == 400, r.text


def test_08_consolidate_unknown_group_404(ceo_headers):
    r = requests.post(f"{API}/brand-groups/{uuid.uuid4()}/consolidate",
                      headers=ceo_headers, json={
                          "parent_sku_id": PARENT_SKU_ID,
                          "keep_child_sku_id": STATE["child_a"],
                      }, timeout=20)
    assert r.status_code == 404, r.text


def test_09_consolidate_nonadmin_403(nonadm_headers):
    r = requests.post(f"{API}/brand-groups/{STATE['group_id']}/consolidate",
                      headers=nonadm_headers, json={
                          "parent_sku_id": PARENT_SKU_ID,
                          "keep_child_sku_id": STATE["child_a"],
                      }, timeout=20)
    assert r.status_code == 403, r.text


# ---------- Customer stock dashboard shows shared:true for both accounts ----------
def test_10_dashboard_shared_true_both_accounts(ceo_headers):
    r = requests.get(f"{API}/distributor/customer-stock-dashboard", headers=ceo_headers, timeout=30)
    assert r.status_code == 200, r.text
    d = r.json()
    tiles = d.get("accounts") or d.get("tiles") or []
    def _tile(a):
        for t in tiles:
            if t.get("account_id") == a or t.get("id") == a:
                return t
        return None
    tA, tB = _tile(STATE["acct_a"]), _tile(STATE["acct_b"])
    assert tA and tB, "tiles missing"

    def _has_shared_a(t):
        for sku in (t.get("skus") or t.get("child_skus") or []):
            if sku.get("child_sku_id") == STATE["child_a"] or sku.get("id") == STATE["child_a"]:
                return sku.get("shared") is True
            for c in (sku.get("children") or []):
                if c.get("child_sku_id") == STATE["child_a"] or c.get("id") == STATE["child_a"]:
                    return c.get("shared") is True
        return False
    assert _has_shared_a(tA), "child A missing / not shared on Alpha tile"
    assert _has_shared_a(tB), "child A missing / not shared on Beta tile"


# ---------- cleanup ----------
def test_99_cleanup(mongo):
    _clean(mongo)
    if STATE.get("parent_orig_allows") is False:
        from pymongo import MongoClient  # noqa
        mongo.master_skus.update_one({"id": PARENT_SKU_ID}, {"$set": {"allows_child_skus": False}})
    # leftover counts (should be 0)
    leftover = {
        "brand_groups": mongo.brand_groups.count_documents({"tenant_id": TENANT_ID, "name": {"$regex": "^QA-CONS "}}),
        "child_skus": mongo.child_skus.count_documents({"tenant_id": TENANT_ID, "child_sku_name": {"$regex": "^QA-CONS "}}),
        "distributor_stock": mongo.distributor_stock.count_documents({"tenant_id": TENANT_ID, "batch_code": {"$regex": "^QA-CONS-"}}),
        "branding_entries": mongo.branding_entries.count_documents({"tenant_id": TENANT_ID, "notes": {"$regex": "QA-CONS"}}),
        "accounts": mongo.accounts.count_documents({"tenant_id": TENANT_ID, "account_name": {"$regex": "^QA-CONS "}}),
    }
    print(f"LEFTOVER={leftover}")
    for k, v in leftover.items():
        assert v == 0, f"leftover {k}={v}"
