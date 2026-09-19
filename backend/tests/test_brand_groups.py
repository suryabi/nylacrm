"""Backend tests for Brand Groups feature (Nyla CRM).

Covers:
- Brand Group CRUD (CEO) + non-admin 403
- Child SKU creation using brand_group_id
- Distributor stock-transfer batches-available scoping
- Customer stock dashboard shared:true and single-count summary
"""
import os
import uuid
from datetime import datetime, timezone

import pytest
import requests
from pymongo import MongoClient

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "").rstrip("/")
if not BASE_URL:
    # fall back to file
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

PARENT_SKU_ID = "20d525e8-c4af-4f40-965a-549dcd50c0a9"  # Nyla – 600 ml / Silver
ACCT_B = "seed-csd-acct-1"
ACCT_D = "seed-csd-acct-3"
ACCT_NOT = "seed-csd-acct-0"
DIST_ID = "bb12d90e-4d33-4890-ac5f-17573c551b5c"
DIST_LOC = "aa2eda05-1902-4a17-92bb-d33533535297"


# ---------- shared state ----------
STATE = {}


@pytest.fixture(scope="module")
def mongo():
    client = MongoClient(MONGO_URL)
    yield client[DB_NAME]
    client.close()


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


# ---------- Brand Group CRUD ----------
def test_01_create_brand_group(ceo_headers, mongo):
    # Cleanup stale
    mongo.brand_groups.delete_many({"tenant_id": TENANT_ID, "name": {"$regex": "^QA Franchise"}})
    r = requests.post(f"{API}/brand-groups", headers=ceo_headers,
                      json={"name": "QA Franchise Group", "account_ids": [ACCT_B, ACCT_D]}, timeout=20)
    assert r.status_code in (200, 201), r.text
    d = r.json()
    assert d["name"] == "QA Franchise Group"
    assert d.get("code")
    assert {a["id"] for a in d.get("accounts", [])} == {ACCT_B, ACCT_D}
    assert d.get("child_sku_count") == 0
    STATE["group_id"] = d["id"]


def test_02_list_brand_groups(ceo_headers):
    r = requests.get(f"{API}/brand-groups", headers=ceo_headers, timeout=20)
    assert r.status_code == 200
    groups = r.json().get("brand_groups", [])
    match = [g for g in groups if g["id"] == STATE["group_id"]]
    assert match, "created group not listed"
    assert match[0]["child_sku_count"] == 0


def test_03_update_rename_and_add_account(ceo_headers):
    # We need a third existing account id. Use accounts endpoint.
    r = requests.get(f"{API}/brand-groups/accounts", headers=ceo_headers, timeout=20)
    assert r.status_code == 200
    all_accts = [a["id"] for a in r.json().get("accounts", [])]
    third = next((a for a in all_accts if a not in {ACCT_B, ACCT_D}), None)
    assert third, "no third account available"
    STATE["third"] = third
    r = requests.put(f"{API}/brand-groups/{STATE['group_id']}", headers=ceo_headers,
                     json={"name": "QA Franchise Group A", "account_ids": [ACCT_B, ACCT_D, third]}, timeout=20)
    assert r.status_code == 200, r.text
    d = r.json()
    assert d["name"] == "QA Franchise Group A"
    assert len(d["account_ids"]) == 3


def test_04_duplicate_name_rejected(ceo_headers, mongo):
    # Create a second group, then attempt to rename to first's name
    r = requests.post(f"{API}/brand-groups", headers=ceo_headers,
                      json={"name": "QA Franchise Dup", "account_ids": [ACCT_B]}, timeout=20)
    assert r.status_code in (200, 201), r.text
    dup_id = r.json()["id"]
    STATE["dup_id"] = dup_id
    r2 = requests.put(f"{API}/brand-groups/{dup_id}", headers=ceo_headers,
                      json={"name": "QA Franchise Group A"}, timeout=20)
    assert r2.status_code == 400, r2.text


def test_05_non_admin_forbidden(nonadm_headers):
    r = requests.post(f"{API}/brand-groups", headers=nonadm_headers,
                      json={"name": "QA Franchise Illegal", "account_ids": [ACCT_B]}, timeout=20)
    assert r.status_code == 403, r.text


# ---------- Child SKU with brand_group_id ----------
def test_06_child_sku_for_group(ceo_headers, mongo):
    # Ensure parent allows child skus
    parent = mongo.master_skus.find_one({"id": PARENT_SKU_ID})
    STATE["parent_orig_allows"] = parent.get("allows_child_skus") if parent else None
    if parent and not parent.get("allows_child_skus"):
        mongo.master_skus.update_one({"id": PARENT_SKU_ID}, {"$set": {"allows_child_skus": True}})
    # cleanup stale
    mongo.child_skus.delete_many({"tenant_id": TENANT_ID, "child_sku_name": "QA Franchise – 600 ml"})

    r = requests.post(f"{API}/child-skus", headers=ceo_headers,
                      json={"parent_sku_id": PARENT_SKU_ID,
                            "child_sku_name": "QA Franchise – 600 ml",
                            "child_type": "customer",
                            "brand_group_id": STATE["group_id"]}, timeout=25)
    assert r.status_code == 200, r.text
    d = r.json()
    assert d["brand_group_id"] == STATE["group_id"]
    assert d["brand_group_name"] == "QA Franchise Group A"
    assert d["customer_account_name"] == "QA Franchise Group A"
    assert d["customer_account_id"] is None
    STATE["child_id"] = d["id"]


def test_07_list_child_skus_account_ids(ceo_headers):
    r = requests.get(f"{API}/child-skus?parent_sku_id={PARENT_SKU_ID}", headers=ceo_headers, timeout=20)
    assert r.status_code == 200
    rows = r.json().get("child_skus", [])
    ours = [c for c in rows if c["id"] == STATE["child_id"]]
    assert ours, "child sku missing"
    ids = set(ours[0].get("account_ids") or [])
    expected = {ACCT_B, ACCT_D, STATE["third"]}
    assert expected.issubset(ids), f"expected member accounts {expected}, got {ids}"


def test_08_child_sku_without_account_or_group_400(ceo_headers):
    r = requests.post(f"{API}/child-skus", headers=ceo_headers,
                      json={"parent_sku_id": PARENT_SKU_ID,
                            "child_sku_name": f"QA No-Owner {uuid.uuid4().hex[:6]}",
                            "child_type": "customer"}, timeout=20)
    assert r.status_code == 400, r.text


def test_09_delete_group_in_use_400(ceo_headers):
    r = requests.delete(f"{API}/brand-groups/{STATE['group_id']}", headers=ceo_headers, timeout=20)
    assert r.status_code == 400, r.text


# ---------- Distributor stock + dashboard ----------
def test_10_dashboard_before_and_stock_insert(ceo_headers, mongo):
    r = requests.get(f"{API}/distributor/customer-stock-dashboard", headers=ceo_headers, timeout=30)
    assert r.status_code == 200, r.text
    d0 = r.json()
    STATE["crates_before"] = (d0.get("summary") or {}).get("stock_crates", 0)

    # Verify both member tiles list the child SKU with shared:true (stock may be 0)
    accts_view = d0.get("accounts") or d0.get("tiles") or []
    def _get_tile(a_id):
        for t in accts_view:
            if t.get("account_id") == a_id or t.get("id") == a_id:
                return t
        return None
    tB, tD = _get_tile(ACCT_B), _get_tile(ACCT_D)
    assert tB and tD, f"tiles missing for member accounts (found keys: {[t.get('account_id') or t.get('id') for t in accts_view][:5]})"

    def _has_child(tile):
        for sku in (tile.get("skus") or tile.get("child_skus") or []):
            if sku.get("child_sku_id") == STATE["child_id"] or sku.get("id") == STATE["child_id"]:
                assert sku.get("shared") is True
                assert sku.get("brand_group_name")
                return True
            # nested search
            for c in (sku.get("children") or []):
                if c.get("child_sku_id") == STATE["child_id"] or c.get("id") == STATE["child_id"]:
                    assert c.get("shared") is True
                    return True
        return False
    assert _has_child(tB), "child sku not listed on Seed B tile"
    assert _has_child(tD), "child sku not listed on Seed D tile"

    # Insert a distributor_stock row (120 units)
    mongo.distributor_stock.delete_many({"tenant_id": TENANT_ID, "batch_code": "QA-BG"})
    mongo.distributor_stock.insert_one({
        "id": str(uuid.uuid4()),
        "tenant_id": TENANT_ID,
        "distributor_id": DIST_ID,
        "distributor_location_id": DIST_LOC,
        "sku_id": PARENT_SKU_ID,
        "child_sku_id": STATE["child_id"],
        "batch_id": "qa-bg-batch",
        "batch_code": "QA-BG",
        "quantity": 120,
        "created_at": datetime.now(timezone.utc).isoformat(),
    })


def test_11_dashboard_after_stock(ceo_headers):
    r = requests.get(f"{API}/distributor/customer-stock-dashboard", headers=ceo_headers, timeout=30)
    assert r.status_code == 200
    d = r.json()
    crates_after = (d.get("summary") or {}).get("stock_crates", 0)
    delta = crates_after - STATE["crates_before"]
    # 120 units / 12 = 10 crates
    assert delta == 10, f"summary.stock_crates delta expected 10 (not 20), got {delta}"


def test_12_batches_available_included_for_member(ceo_headers):
    r = requests.get(
        f"{API}/distributor/stock-transfers/batches-available",
        params={"location_id": DIST_LOC, "sku_id": PARENT_SKU_ID, "account_id": ACCT_D},
        headers=ceo_headers, timeout=20)
    assert r.status_code == 200, r.text
    batches = r.json().get("batches", [])
    assert any(b.get("batch_code") == "QA-BG" for b in batches), f"QA-BG not offered for member acct; got {[b.get('batch_code') for b in batches]}"


def test_13_batches_available_excluded_for_non_member(ceo_headers):
    r = requests.get(
        f"{API}/distributor/stock-transfers/batches-available",
        params={"location_id": DIST_LOC, "sku_id": PARENT_SKU_ID, "account_id": ACCT_NOT},
        headers=ceo_headers, timeout=20)
    assert r.status_code == 200, r.text
    batches = r.json().get("batches", [])
    assert not any(b.get("batch_code") == "QA-BG" for b in batches), "QA-BG leaked to non-member account"


# ---------- cleanup ----------
def test_99_cleanup(ceo_headers, mongo):
    mongo.distributor_stock.delete_many({"tenant_id": TENANT_ID, "batch_code": "QA-BG"})
    mongo.child_skus.delete_many({"tenant_id": TENANT_ID, "child_sku_name": "QA Franchise – 600 ml"})
    mongo.child_skus.delete_many({"tenant_id": TENANT_ID, "child_sku_name": {"$regex": "^QA No-Owner"}})
    mongo.brand_groups.delete_many({"tenant_id": TENANT_ID, "name": {"$regex": "^QA Franchise"}})
    if STATE.get("parent_orig_allows") is False:
        mongo.master_skus.update_one({"id": PARENT_SKU_ID}, {"$set": {"allows_child_skus": False}})
