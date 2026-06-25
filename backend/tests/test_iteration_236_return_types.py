"""
Iteration 236 — Customer Returns: return_type (returned vs missing) → CN vs DN.

Covers:
  * RETURNED path: approve → response has credit_note (CN-...), debit_note=null,
    return doc has credit_note_number.
  * MISSING path: approve → response has debit_note (DN-YYYY-####), credit_note=null,
    debit_notes collection row exists for the return with original=balance=total_credit,
    return doc has debit_note_number / debit_note_id and NO credit_note_id.
  * Default return_type → 'returned'; invalid return_type falls back to 'returned'.
  * Idempotency: re-approving an already-approved return is rejected;
    create_debit_note_from_return is idempotent for the same return.
"""
import os
import pytest
import requests
from datetime import datetime

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', '').rstrip('/')
TEST_EMAIL = "surya.yadavalli@nylaairwater.earth"
TEST_PASSWORD = "test123"
DISTRIBUTOR_ID = "bb12d90e-4d33-4890-ac5f-17573c551b5c"  # Brian DIST-0003


@pytest.fixture(scope="module")
def ctx():
    s = requests.Session()
    s.headers.update({"Content-Type": "application/json"})
    r = s.post(f"{BASE_URL}/api/auth/login", json={"email": TEST_EMAIL, "password": TEST_PASSWORD})
    assert r.status_code == 200, f"Login failed: {r.text}"
    tok = r.json().get("session_token")
    assert tok
    s.headers.update({"Authorization": f"Bearer {tok}"})

    # Pick an account with sku_pricing that yields return_bottle_credit so total_credit > 0
    accts_resp = s.get(f"{BASE_URL}/api/distributors/{DISTRIBUTOR_ID}/assigned-accounts")
    assert accts_resp.status_code == 200, accts_resp.text
    accounts = accts_resp.json().get("accounts", [])
    assert accounts, "Need at least one assigned account on Brian"

    # Pull full account docs to find one with return_bottle_credit > 0
    target_account = None
    target_sku_id = None
    target_sku_name = None
    for a in accounts:
        det = s.get(f"{BASE_URL}/api/accounts/{a['id']}")
        if det.status_code != 200:
            continue
        adoc = det.json()
        for p in (adoc.get("sku_pricing") or []):
            if (p.get("return_bottle_credit") or 0) > 0:
                target_account = adoc
                target_sku_name = p.get("sku")
                # Resolve sku id from master skus list (match by name)
                break
        if target_account:
            break
    assert target_account, "Need an account with return_bottle_credit>0 in sku_pricing"

    # Resolve sku id from master_skus by name
    skus = s.get(f"{BASE_URL}/api/master-skus").json()
    sku_list = skus.get("skus", skus) if isinstance(skus, dict) else skus
    for sk in sku_list:
        if (sk.get("name") or sk.get("sku_name")) == target_sku_name:
            target_sku_id = sk.get("id")
            break
    assert target_sku_id, f"Cannot resolve sku id for name {target_sku_name}"

    # Find a return reason with credit_type sku_return_credit
    rr = s.get(f"{BASE_URL}/api/return-reasons?is_active=true").json()
    reasons = rr.get("reasons", rr) if isinstance(rr, dict) else rr
    reason = next((r for r in reasons if r.get("credit_type") == "sku_return_credit"), None)
    assert reason, "Need a return_reason with credit_type='sku_return_credit'"

    created_ids = []
    yield {
        "s": s, "account_id": target_account["id"], "sku_id": target_sku_id,
        "reason_id": reason["id"], "created_ids": created_ids,
    }

    # Cleanup: delete created returns and their debit notes
    for rid in created_ids:
        try:
            s.delete(f"{BASE_URL}/api/distributors/{DISTRIBUTOR_ID}/returns/{rid}")
        except Exception:
            pass


def _create_return(s, account_id, sku_id, reason_id, return_type=None, qty=2):
    body = {
        "account_id": account_id,
        "return_date": datetime.now().strftime("%Y-%m-%d"),
        "items": [{"sku_id": sku_id, "quantity": qty, "reason_id": reason_id}],
        "notes": "TEST_iter236",
    }
    if return_type is not None:
        body["return_type"] = return_type
    r = s.post(f"{BASE_URL}/api/distributors/{DISTRIBUTOR_ID}/returns", json=body)
    assert r.status_code in (200, 201), f"Create return failed: {r.text}"
    return r.json()["return"]


# --- RETURNED (regression) -------------------------------------------------
def test_returned_path_creates_credit_note(ctx):
    s = ctx["s"]
    ret = _create_return(s, ctx["account_id"], ctx["sku_id"], ctx["reason_id"], "returned")
    ctx["created_ids"].append(ret["id"])
    assert ret["return_type"] == "returned"
    assert ret["total_credit"] > 0, f"need total_credit>0, got {ret['total_credit']}"

    ap = s.post(f"{BASE_URL}/api/distributors/{DISTRIBUTOR_ID}/returns/{ret['id']}/approve")
    assert ap.status_code == 200, ap.text
    body = ap.json()
    assert body.get("credit_note") is not None
    assert body.get("debit_note") is None
    assert (body["credit_note"].get("credit_note_number") or "").startswith("CN-")

    det = s.get(f"{BASE_URL}/api/distributors/{DISTRIBUTOR_ID}/returns/{ret['id']}").json()
    assert det.get("credit_note_number"), "return doc should have credit_note_number"
    assert not det.get("debit_note_number")


# --- MISSING (core new) ----------------------------------------------------
def test_missing_path_creates_debit_note(ctx):
    s = ctx["s"]
    ret = _create_return(s, ctx["account_id"], ctx["sku_id"], ctx["reason_id"], "missing")
    ctx["created_ids"].append(ret["id"])
    assert ret["return_type"] == "missing"
    total = ret["total_credit"]
    assert total > 0

    ap = s.post(f"{BASE_URL}/api/distributors/{DISTRIBUTOR_ID}/returns/{ret['id']}/approve")
    assert ap.status_code == 200, ap.text
    body = ap.json()
    assert body.get("debit_note") is not None, f"missing path must return debit_note, body={body}"
    assert body.get("credit_note") is None
    dn = body["debit_note"]
    year = datetime.now().year
    assert dn["debit_note_number"].startswith(f"DN-{year}-")
    assert dn["note_type"] == "debit"
    assert dn["original_amount"] == total
    assert dn["balance_amount"] == total
    assert dn["status"] == "pending"
    assert dn["return_id"] == ret["id"]

    # Return doc reflects debit-only linkage
    det = s.get(f"{BASE_URL}/api/distributors/{DISTRIBUTOR_ID}/returns/{ret['id']}").json()
    assert det.get("debit_note_number") == dn["debit_note_number"]
    assert det.get("debit_note_id") == dn["id"]
    assert not det.get("credit_note_id")
    assert not det.get("credit_note_number")

    # List endpoint surfaces it
    lst = s.get(f"{BASE_URL}/api/distributors/{DISTRIBUTOR_ID}/returns").json()
    match = next((r for r in lst.get("returns", []) if r["id"] == ret["id"]), None)
    assert match, "return missing from list"
    assert match.get("return_type") == "missing"
    assert match.get("debit_note_number") == dn["debit_note_number"]


# --- default + invalid return_type ----------------------------------------
def test_default_return_type_is_returned(ctx):
    s = ctx["s"]
    ret = _create_return(s, ctx["account_id"], ctx["sku_id"], ctx["reason_id"], return_type=None)
    ctx["created_ids"].append(ret["id"])
    assert ret["return_type"] == "returned"


def test_invalid_return_type_falls_back_to_returned(ctx):
    s = ctx["s"]
    ret = _create_return(s, ctx["account_id"], ctx["sku_id"], ctx["reason_id"], return_type="garbage")
    ctx["created_ids"].append(ret["id"])
    assert ret["return_type"] == "returned"


# --- idempotency ----------------------------------------------------------
def test_cannot_reapprove_and_debit_note_is_idempotent(ctx):
    s = ctx["s"]
    ret = _create_return(s, ctx["account_id"], ctx["sku_id"], ctx["reason_id"], "missing")
    ctx["created_ids"].append(ret["id"])
    first = s.post(f"{BASE_URL}/api/distributors/{DISTRIBUTOR_ID}/returns/{ret['id']}/approve")
    assert first.status_code == 200
    dn_num_1 = first.json()["debit_note"]["debit_note_number"]
    # second approve should fail (only draft can be approved)
    second = s.post(f"{BASE_URL}/api/distributors/{DISTRIBUTOR_ID}/returns/{ret['id']}/approve")
    assert second.status_code == 400, f"second approve should be rejected, got {second.status_code} {second.text}"

    # The return still references the same debit note (no duplicate)
    det = s.get(f"{BASE_URL}/api/distributors/{DISTRIBUTOR_ID}/returns/{ret['id']}").json()
    assert det["debit_note_number"] == dn_num_1
