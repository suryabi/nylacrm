"""
Iteration 237 — Debit Reasons (note_type='debit') for missing-bottle returns.

Backend coverage:
  * GET /api/return-reasons?note_type=debit&applies_to=customer auto-seeds and returns
    the 4 default debit reasons (NOT_RETURNED, LOST_AT_CUSTOMER, BROKEN_AT_CUSTOMER, PILFERAGE),
    each with note_type='debit'.
  * Calling the same endpoint twice does NOT duplicate the seeded reasons (idempotent).
  * GET ?note_type=credit excludes any debit reasons (only credit/legacy/None).
  * POST /api/return-reasons with note_type='debit' persists; appears in ?note_type=debit list.
  * PUT can change note_type credit↔debit.
  * Missing-return + debit reason → approve creates DN-YYYY-#### in db.debit_notes linked
    on the return. Returned + credit reason still creates CN-... credit note.
"""
import os
import time
import pytest
import requests
from datetime import datetime

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', '').rstrip('/')
TEST_EMAIL = "surya.yadavalli@nylaairwater.earth"
TEST_PASSWORD = "test123"
DISTRIBUTOR_ID = "bb12d90e-4d33-4890-ac5f-17573c551b5c"  # Brian DIST-0003

DEBIT_CODES = {"NOT_RETURNED", "LOST_AT_CUSTOMER", "BROKEN_AT_CUSTOMER", "PILFERAGE"}


@pytest.fixture(scope="module")
def ctx():
    s = requests.Session()
    s.headers.update({"Content-Type": "application/json"})
    r = s.post(f"{BASE_URL}/api/auth/login", json={"email": TEST_EMAIL, "password": TEST_PASSWORD})
    assert r.status_code == 200, f"Login failed: {r.text}"
    tok = r.json().get("session_token") or r.json().get("token")
    assert tok, f"No session token in login response: {r.json()}"
    s.headers.update({"Authorization": f"Bearer {tok}"})

    created_reason_ids = []
    created_return_ids = []
    yield {"s": s, "created_reason_ids": created_reason_ids, "created_return_ids": created_return_ids}

    # Cleanup any test reasons we created
    for rid in created_reason_ids:
        try:
            s.delete(f"{BASE_URL}/api/return-reasons/{rid}")
        except Exception:
            pass
    for rid in created_return_ids:
        try:
            s.delete(f"{BASE_URL}/api/distributors/{DISTRIBUTOR_ID}/returns/{rid}")
        except Exception:
            pass


# ---------- 1. Auto-seed default debit reasons ----------
def test_debit_reasons_seeded_and_filtered(ctx):
    s = ctx["s"]
    # First fetch (triggers auto-seed if not yet present)
    r1 = s.get(f"{BASE_URL}/api/return-reasons?note_type=debit&applies_to=customer")
    assert r1.status_code == 200, r1.text
    body1 = r1.json()
    reasons1 = body1.get("reasons", [])
    codes1 = {x["reason_code"] for x in reasons1}
    assert DEBIT_CODES.issubset(codes1), f"Missing debit defaults. Got {codes1}"
    # Validate every returned row has note_type='debit'
    for x in reasons1:
        assert x.get("note_type") == "debit", f"Non-debit returned by debit filter: {x}"
        assert x.get("reason_name")
    print(f"Seeded/found {len(reasons1)} debit reasons; defaults present: {DEBIT_CODES & codes1}")


def test_debit_seed_is_idempotent(ctx):
    s = ctx["s"]
    # Second fetch — should NOT duplicate
    r1 = s.get(f"{BASE_URL}/api/return-reasons?note_type=debit&applies_to=customer")
    r2 = s.get(f"{BASE_URL}/api/return-reasons?note_type=debit&applies_to=customer")
    assert r1.status_code == 200 and r2.status_code == 200
    c1 = sum(1 for x in r1.json()["reasons"] if x["reason_code"] in DEBIT_CODES)
    c2 = sum(1 for x in r2.json()["reasons"] if x["reason_code"] in DEBIT_CODES)
    assert c1 == 4 and c2 == 4, f"Expected exactly 4 default debit rows on each call, got {c1}/{c2}"


# ---------- 2. Credit filter excludes debit reasons ----------
def test_credit_filter_excludes_debit(ctx):
    s = ctx["s"]
    r = s.get(f"{BASE_URL}/api/return-reasons?note_type=credit&applies_to=customer")
    assert r.status_code == 200, r.text
    reasons = r.json().get("reasons", [])
    debit_leak = [x for x in reasons if x.get("note_type") == "debit"
                  or x.get("reason_code") in DEBIT_CODES]
    assert not debit_leak, f"Credit filter leaked debit reasons: {[x['reason_code'] for x in debit_leak]}"
    # Every returned row must be credit (explicit) per backfill
    for x in reasons:
        assert x.get("note_type") == "credit", f"Non-credit row in credit filter: {x}"


# ---------- 3. POST + PUT note_type ----------
def test_create_debit_reason_and_update_note_type(ctx):
    s = ctx["s"]
    code = f"TEST_DEBIT_{int(time.time())}"
    payload = {
        "reason_code": code,
        "reason_name": "TEST Custom Debit",
        "description": "iter237 test",
        "category": "empty_reusable",
        "credit_type": "sku_return_credit",
        "return_to_factory": False,
        "requires_inspection": False,
        "note_type": "debit",
        "applies_to": ["customer"],
        "color": "#F59E0B",
    }
    r = s.post(f"{BASE_URL}/api/return-reasons", json=payload)
    assert r.status_code in (200, 201), r.text
    created = r.json().get("reason") or r.json()
    rid = created["id"]
    ctx["created_reason_ids"].append(rid)
    assert created.get("note_type") == "debit", f"Created reason missing note_type=debit: {created}"

    # Should appear in debit filter
    lst = s.get(f"{BASE_URL}/api/return-reasons?note_type=debit&applies_to=customer").json()["reasons"]
    assert any(x["id"] == rid for x in lst), "New debit reason not in debit list"
    # Should NOT appear in credit filter
    lst_c = s.get(f"{BASE_URL}/api/return-reasons?note_type=credit&applies_to=customer").json()["reasons"]
    assert not any(x["id"] == rid for x in lst_c), "New debit reason leaked into credit list"

    # PUT to flip to credit
    upd = s.put(f"{BASE_URL}/api/return-reasons/{rid}", json={"note_type": "credit"})
    assert upd.status_code == 200, upd.text
    after = upd.json().get("reason")
    assert after.get("note_type") == "credit", f"PUT did not switch note_type: {after}"

    # GET reflects updated note_type
    g = s.get(f"{BASE_URL}/api/return-reasons/{rid}").json()
    assert g.get("note_type") == "credit"


# ---------- 4. Regression: missing-return with DEBIT reason → DN; returned with CREDIT reason → CN ----------
def _pick_account_sku(s):
    accts = s.get(f"{BASE_URL}/api/distributors/{DISTRIBUTOR_ID}/assigned-accounts").json().get("accounts", [])
    for a in accts:
        det = s.get(f"{BASE_URL}/api/accounts/{a['id']}")
        if det.status_code != 200:
            continue
        adoc = det.json()
        for p in (adoc.get("sku_pricing") or []):
            if (p.get("return_bottle_credit") or 0) > 0:
                target_sku_name = p.get("sku")
                skus = s.get(f"{BASE_URL}/api/master-skus").json()
                sku_list = skus.get("skus", skus) if isinstance(skus, dict) else skus
                for sk in sku_list:
                    if (sk.get("name") or sk.get("sku_name")) == target_sku_name:
                        return adoc["id"], sk["id"]
    return None, None


def test_missing_return_with_debit_reason_creates_debit_note(ctx):
    s = ctx["s"]
    account_id, sku_id = _pick_account_sku(s)
    if not account_id:
        pytest.skip("No account with return_bottle_credit>0 — cannot exercise total_credit path")

    debit_reasons = s.get(f"{BASE_URL}/api/return-reasons?note_type=debit&applies_to=customer").json()["reasons"]
    debit_reason = next((r for r in debit_reasons if r.get("credit_type") == "sku_return_credit"), None)
    assert debit_reason, "Need a debit reason with credit_type='sku_return_credit' (default seeds satisfy this)"

    body = {
        "account_id": account_id,
        "return_date": datetime.now().strftime("%Y-%m-%d"),
        "return_type": "missing",
        "items": [{"sku_id": sku_id, "quantity": 2, "reason_id": debit_reason["id"]}],
        "notes": "TEST_iter237_missing_debit",
    }
    cr = s.post(f"{BASE_URL}/api/distributors/{DISTRIBUTOR_ID}/returns", json=body)
    assert cr.status_code in (200, 201), cr.text
    rdoc = cr.json().get("return") or cr.json()
    rid = rdoc["id"]
    ctx["created_return_ids"].append(rid)
    assert rdoc.get("total_credit", 0) > 0, f"Expected total_credit>0, got {rdoc.get('total_credit')}"

    ap = s.post(f"{BASE_URL}/api/distributors/{DISTRIBUTOR_ID}/returns/{rid}/approve")
    assert ap.status_code == 200, ap.text
    out = ap.json()
    assert out.get("credit_note") in (None, {}), f"Missing-flow should not create CN: {out}"
    dn = out.get("debit_note")
    assert dn, f"Expected debit_note in approve response: {out}"
    assert str(dn.get("debit_note_number", "")).startswith("DN-"), f"Bad DN number: {dn}"

    # Confirm return doc is linked
    rg = s.get(f"{BASE_URL}/api/distributors/{DISTRIBUTOR_ID}/returns/{rid}").json()
    rg = rg.get("return") or rg
    assert rg.get("debit_note_number", "").startswith("DN-")
    assert not rg.get("credit_note_number"), "Missing-flow must NOT also produce a credit note"


def test_returned_with_credit_reason_creates_credit_note(ctx):
    s = ctx["s"]
    account_id, sku_id = _pick_account_sku(s)
    if not account_id:
        pytest.skip("No account with return_bottle_credit>0")

    credit_reasons = s.get(f"{BASE_URL}/api/return-reasons?note_type=credit&applies_to=customer").json()["reasons"]
    credit_reason = next((r for r in credit_reasons if r.get("credit_type") == "sku_return_credit"), None)
    assert credit_reason, "Need a credit reason with sku_return_credit"

    body = {
        "account_id": account_id,
        "return_date": datetime.now().strftime("%Y-%m-%d"),
        "return_type": "returned",
        "items": [{"sku_id": sku_id, "quantity": 1, "reason_id": credit_reason["id"]}],
        "notes": "TEST_iter237_returned_credit",
    }
    cr = s.post(f"{BASE_URL}/api/distributors/{DISTRIBUTOR_ID}/returns", json=body)
    assert cr.status_code in (200, 201), cr.text
    rid = (cr.json().get("return") or cr.json())["id"]
    ctx["created_return_ids"].append(rid)

    ap = s.post(f"{BASE_URL}/api/distributors/{DISTRIBUTOR_ID}/returns/{rid}/approve")
    assert ap.status_code == 200, ap.text
    out = ap.json()
    cn = out.get("credit_note")
    assert cn and str(cn.get("credit_note_number", "")).startswith("CN-"), f"Bad CN: {out}"
    assert out.get("debit_note") in (None, {}), "Returned-flow must NOT also produce a debit note"


if __name__ == "__main__":
    pytest.main([__file__, "-v", "--tb=short"])
