"""Iteration 319 — Parent & Customer-Specific Child SKU classification.

Covers:
- allows_child_skus flag on master SKUs (GET + PUT toggle)
- Child SKU CRUD with validations (parent-toggle guard, one-generic-per-parent,
  unique code per tenant, unique name per parent, customer required, denormalize name)
- GET filters (parent_sku_id, include_inactive)
- Artwork upload/download round-trip against Emergent object storage

Cleans up after itself so DB is left clean; leaves 24 Brand allows_child_skus=True.
"""
import io
import os
import time
import pytest
import requests

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "https://design-workflow-hub-11.preview.emergentagent.com").rstrip("/")
EMAIL = "surya.yadavalli@nylaairwater.earth"
PASSWORD = "test123"
PARENT_SKU_ID = "8bc87348-5398-4604-92d8-eff59610b7f9"  # 24 Brand

created_ids: list[str] = []
_assoc_state: dict = {}  # temp account↔SKU association added by the test (restored in teardown)


@pytest.fixture(scope="module")
def client():
    s = requests.Session()
    r = s.post(f"{BASE_URL}/api/auth/login", json={"email": EMAIL, "password": PASSWORD}, timeout=30)
    assert r.status_code == 200, f"login failed {r.status_code} {r.text}"
    tok = r.json().get("access_token") or r.json().get("token")
    if tok:
        s.headers.update({"Authorization": f"Bearer {tok}"})
    s.headers.update({"X-Tenant-ID": "nyla-air-water", "Content-Type": "application/json"})
    yield s
    # Teardown: delete any children we created
    s.headers.pop("Content-Type", None)
    for cid in created_ids:
        try:
            s.delete(f"{BASE_URL}/api/child-skus/{cid}", timeout=15)
        except Exception:
            pass
    # Restore the account's original sku_pricing if we temporarily associated it
    if _assoc_state.get("account_id"):
        try:
            s.put(
                f"{BASE_URL}/api/accounts/{_assoc_state['account_id']}",
                json={"sku_pricing": _assoc_state["original_pricing"]},
                timeout=15,
            )
        except Exception:
            pass


# -------- master-skus allows_child_skus field --------

def _extract_master_skus(body):
    if isinstance(body, list):
        return body
    return body.get("skus") or body.get("master_skus") or body.get("data") or []


def test_master_skus_has_allows_child_skus(client):
    r = client.get(f"{BASE_URL}/api/master-skus", timeout=30)
    assert r.status_code == 200
    rows = _extract_master_skus(r.json())
    assert isinstance(rows, list) and len(rows) > 0
    # field must be present at least on some rows
    parent = next((r for r in rows if r.get("id") == PARENT_SKU_ID), None)
    assert parent is not None, "24 Brand SKU not found in list"
    assert "allows_child_skus" in parent
    assert parent.get("allows_child_skus") is True


# -------- child SKU create validations --------

def test_child_sku_create_requires_parent_toggle(client):
    # Find a master SKU that does NOT allow children
    r = client.get(f"{BASE_URL}/api/master-skus", timeout=30)
    rows = _extract_master_skus(r.json())
    off_parent = next((x for x in rows if x.get("id") != PARENT_SKU_ID and not x.get("allows_child_skus")), None)
    if not off_parent:
        pytest.skip("No master SKU with allows_child_skus=false available")
    payload = {
        "parent_sku_id": off_parent["id"],
        "child_sku_name": "TEST_no_toggle",
        "child_sku_code": "TEST-NT-1",
        "child_type": "generic",
    }
    r = client.post(f"{BASE_URL}/api/child-skus", json=payload, timeout=30)
    assert r.status_code == 400
    assert "not allow" in r.text.lower() or "enable" in r.text.lower()


def test_child_sku_generic_and_second_generic_rejected(client):
    payload = {
        "parent_sku_id": PARENT_SKU_ID,
        "child_sku_name": "TEST_24B_Generic_319",
        "child_sku_code": "TEST-24B-GEN-319",
        "child_type": "generic",
    }
    r = client.post(f"{BASE_URL}/api/child-skus", json=payload, timeout=30)
    assert r.status_code == 200, r.text
    data = r.json()
    assert data["child_type"] == "generic"
    assert data["parent_sku_name"]
    created_ids.append(data["id"])

    # Second generic under same parent should fail
    payload2 = {
        "parent_sku_id": PARENT_SKU_ID,
        "child_sku_name": "TEST_24B_Generic_319_v2",
        "child_sku_code": "TEST-24B-GEN-319-v2",
        "child_type": "generic",
    }
    r2 = client.post(f"{BASE_URL}/api/child-skus", json=payload2, timeout=30)
    assert r2.status_code == 400
    assert "generic" in r2.text.lower()


def test_child_sku_customer_requires_account_id(client):
    payload = {
        "parent_sku_id": PARENT_SKU_ID,
        "child_sku_name": "TEST_24B_CustomerNoAcc_319",
        "child_sku_code": "TEST-24B-CUSTNA-319",
        "child_type": "customer",
    }
    r = client.post(f"{BASE_URL}/api/child-skus", json=payload, timeout=30)
    assert r.status_code == 400
    assert "customer" in r.text.lower()


def test_child_sku_customer_happy_path_and_dup_checks(client):
    # Eligible accounts = accounts already associated with the parent SKU via sku_pricing
    r = client.get(f"{BASE_URL}/api/child-skus/eligible-accounts?parent_sku_id={PARENT_SKU_ID}", timeout=30)
    assert r.status_code == 200, r.text
    body = r.json()
    parent_code = body.get("parent_code")
    assert parent_code, "eligible-accounts must return parent_code"
    eligible = body.get("accounts") or []

    if not eligible:
        # Associate the first account with the parent SKU (restored in teardown)
        r = client.get(f"{BASE_URL}/api/accounts?page=1&page_size=5", timeout=30)
        accs = r.json().get("data") or []
        assert accs, "no accounts available"
        acc = accs[0]
        _assoc_state["account_id"] = acc["id"]
        _assoc_state["original_pricing"] = acc.get("sku_pricing") or []
        new_pricing = _assoc_state["original_pricing"] + [
            {"sku_id": PARENT_SKU_ID, "sku": "24 Brand", "price_per_unit": 1.0}
        ]
        r = client.put(f"{BASE_URL}/api/accounts/{acc['id']}", json={"sku_pricing": new_pricing}, timeout=30)
        assert r.status_code == 200, r.text
        r = client.get(f"{BASE_URL}/api/child-skus/eligible-accounts?parent_sku_id={PARENT_SKU_ID}", timeout=30)
        eligible = r.json().get("accounts") or []
        assert eligible, "account should now be eligible"

    acc = eligible[0]
    acc_id = acc["id"]

    # An account NOT associated with the parent SKU must be rejected
    r = client.get(f"{BASE_URL}/api/accounts?page=1&page_size=100", timeout=30)
    all_accs = r.json().get("data") or []
    eligible_ids = {a["id"] for a in eligible}
    outsider = next((a for a in all_accs if a["id"] not in eligible_ids), None)
    if outsider:
        r = client.post(f"{BASE_URL}/api/child-skus", json={
            "parent_sku_id": PARENT_SKU_ID,
            "child_sku_name": "TEST_24B_Outsider_319",
            "child_type": "customer",
            "customer_account_id": outsider["id"],
        }, timeout=30)
        assert r.status_code == 400
        assert "not associated" in r.text.lower()

    # Happy path — no child_sku_code sent → auto-generated from parent code + account code
    payload = {
        "parent_sku_id": PARENT_SKU_ID,
        "child_sku_name": "TEST_24B_CustA_319",
        "child_type": "customer",
        "customer_account_id": acc_id,
        "label_version": "v1",
    }
    r = client.post(f"{BASE_URL}/api/child-skus", json=payload, timeout=30)
    assert r.status_code == 200, r.text
    data = r.json()
    assert data["child_type"] == "customer"
    assert data["customer_account_id"] == acc_id
    assert data["customer_account_name"], "customer_account_name must be denormalized"
    assert data["child_sku_code"].startswith(f"{parent_code}-"), f"auto code should start with parent code: {data['child_sku_code']}"
    if acc.get("account_id"):
        assert acc["account_id"] in data["child_sku_code"]
    created_ids.append(data["id"])

    # duplicate explicit code
    dup_code = dict(payload, child_sku_name="TEST_dup_name_319", child_sku_code=data["child_sku_code"])
    r = client.post(f"{BASE_URL}/api/child-skus", json=dup_code, timeout=30)
    assert r.status_code == 400
    assert "code" in r.text.lower()

    # duplicate name (auto code would differ)
    dup_name = dict(payload)
    r = client.post(f"{BASE_URL}/api/child-skus", json=dup_name, timeout=30)
    assert r.status_code == 400
    assert "already exists" in r.text.lower()


# -------- listing & update --------

def test_list_and_update_and_delete_flow(client):
    # list under parent
    r = client.get(f"{BASE_URL}/api/child-skus?parent_sku_id={PARENT_SKU_ID}", timeout=30)
    assert r.status_code == 200
    rows = r.json()["child_skus"]
    assert all(row["parent_sku_name"] for row in rows)
    assert any(row["id"] in created_ids for row in rows)

    # include_inactive filter
    # first deactivate one child, then verify default hides it, include_inactive shows it
    target = created_ids[-1]
    r = client.put(f"{BASE_URL}/api/child-skus/{target}", json={"is_active": False, "label_version": "v2"}, timeout=30)
    assert r.status_code == 200, r.text
    upd = r.json()
    assert upd["is_active"] is False
    assert upd["label_version"] == "v2"

    r = client.get(f"{BASE_URL}/api/child-skus?parent_sku_id={PARENT_SKU_ID}", timeout=30)
    ids_default = [x["id"] for x in r.json()["child_skus"]]
    assert target not in ids_default

    r = client.get(f"{BASE_URL}/api/child-skus?parent_sku_id={PARENT_SKU_ID}&include_inactive=true", timeout=30)
    ids_all = [x["id"] for x in r.json()["child_skus"]]
    assert target in ids_all

    # Reactivate then delete
    r = client.put(f"{BASE_URL}/api/child-skus/{target}", json={"is_active": True}, timeout=30)
    assert r.status_code == 200

    r = client.delete(f"{BASE_URL}/api/child-skus/{target}", timeout=30)
    assert r.status_code == 200, r.text
    body = r.json()
    assert body.get("deactivated") is False
    created_ids.remove(target)


# -------- artwork upload/download round-trip --------

def test_artwork_upload_download_roundtrip(client):
    assert created_ids, "need at least one child left from prior tests"
    cid = created_ids[0]
    content = b"%PDF-1.4\n%TEST_artwork_319\n" + os.urandom(64)

    files = {"file": ("test_artwork.pdf", io.BytesIO(content), "application/pdf")}
    # For multipart, use session (cookies persisted) but drop json Content-Type
    ct = client.headers.pop("Content-Type", None)
    try:
        r = client.post(f"{BASE_URL}/api/child-skus/{cid}/artwork", files=files, timeout=60)
        assert r.status_code == 200, r.text
        assert r.json().get("artwork_file_name") == "test_artwork.pdf"

        r = client.get(f"{BASE_URL}/api/child-skus/{cid}/artwork", timeout=60)
        assert r.status_code == 200
        assert r.content == content, "artwork content mismatch on download"
    finally:
        if ct:
            client.headers["Content-Type"] = ct


# -------- master SKU toggle-off guard --------

def test_master_sku_toggle_off_while_children_exist_blocked(client):
    assert created_ids, "need active child to trigger guard"
    # Attempt to disable toggle while at least one active child exists under parent
    r = client.put(
        f"{BASE_URL}/api/master-skus/{PARENT_SKU_ID}",
        json={"allows_child_skus": False},
        timeout=30,
    )
    assert r.status_code == 400, f"expected 400 but got {r.status_code}: {r.text}"


def test_master_sku_toggle_stays_on_after_cleanup(client):
    # Cleanup remaining children then verify guard no longer blocks (but do NOT actually turn off)
    for cid in list(created_ids):
        client.delete(f"{BASE_URL}/api/child-skus/{cid}", timeout=30)
        created_ids.remove(cid)
    # Verify no children remain
    r = client.get(f"{BASE_URL}/api/child-skus?parent_sku_id={PARENT_SKU_ID}&include_inactive=true", timeout=30)
    assert r.status_code == 200
    rows = r.json()["child_skus"]
    remaining_test = [x for x in rows if str(x.get("child_sku_code", "")).startswith("TEST-")]
    assert not remaining_test, f"test children left behind: {remaining_test}"
    # Leave allows_child_skus = True per instructions
    r = client.get(f"{BASE_URL}/api/master-skus", timeout=30)
    rows = _extract_master_skus(r.json())
    parent = next((x for x in rows if x.get("id") == PARENT_SKU_ID), None)
    assert parent and parent.get("allows_child_skus") is True
