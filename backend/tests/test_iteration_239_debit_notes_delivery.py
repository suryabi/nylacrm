"""
Iteration 239 — Debit Notes applied DURING delivery / stock-out.

Backend coverage:
  * GET /api/distributors/{distributor_id}/debit-notes/for-account/{account_id}
    returns {debit_notes, total_available, count} for an account that has at
    least one approved missing-return → DN-xxxx with balance>0.
  * Creating a delivery with debit_notes_to_apply ADDS the debit amount to
    net_customer_billing (= delivery_total - credit + debit) and bumps the
    debit note's status to 'applied' (when fully consumed), wiring
    applied_to_delivery_id / number.
  * The originating customer return moves to status='credit_issued' (UI
    re-labels it as 'Debit Issued' for missing returns).
  * Re-fetching debit-notes/for-account no longer lists the fully-applied DN.
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


@pytest.fixture(scope="module")
def ctx():
    s = requests.Session()
    s.headers.update({"Content-Type": "application/json"})
    r = s.post(f"{BASE_URL}/api/auth/login", json={"email": TEST_EMAIL, "password": TEST_PASSWORD})
    assert r.status_code == 200, f"Login failed: {r.text}"
    body = r.json()
    tok = body.get("session_token") or body.get("token")
    if tok:
        s.headers.update({"Authorization": f"Bearer {tok}"})
    # cookie is also set by login; either works.
    yield {"s": s, "created_return_ids": [], "created_delivery_ids": []}


def _pick_account_sku(s):
    """Find an account assigned to Brian distributor whose sku_pricing has a
    return_bottle_credit > 0 so we can produce a non-zero debit total."""
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
                        return adoc, sk
    return None, None


def _create_and_approve_missing_return(s, ctx, account_id, sku_id, qty=2):
    debit_reasons = s.get(f"{BASE_URL}/api/return-reasons?note_type=debit&applies_to=customer").json()["reasons"]
    debit_reason = next((r for r in debit_reasons if r.get("credit_type") == "sku_return_credit"), None)
    assert debit_reason, "No usable debit reason"

    body = {
        "account_id": account_id,
        "return_date": datetime.now().strftime("%Y-%m-%d"),
        "return_type": "missing",
        "items": [{"sku_id": sku_id, "quantity": qty, "reason_id": debit_reason["id"]}],
        "notes": "TEST_iter239_debit_for_delivery",
    }
    cr = s.post(f"{BASE_URL}/api/distributors/{DISTRIBUTOR_ID}/returns", json=body)
    assert cr.status_code in (200, 201), cr.text
    rdoc = cr.json().get("return") or cr.json()
    rid = rdoc["id"]
    ctx["created_return_ids"].append(rid)

    ap = s.post(f"{BASE_URL}/api/distributors/{DISTRIBUTOR_ID}/returns/{rid}/approve")
    assert ap.status_code == 200, ap.text
    out = ap.json()
    dn = out.get("debit_note")
    assert dn and str(dn.get("debit_note_number", "")).startswith("DN-"), f"No DN created: {out}"
    return rid, dn


# ---------- 1. GET debit-notes/for-account returns pending DN ----------
def test_get_debit_notes_for_account_lists_pending(ctx):
    s = ctx["s"]
    acct, sku = _pick_account_sku(s)
    if not acct:
        pytest.skip("No eligible Brian account with return_bottle_credit>0")
    ctx["account"] = acct
    ctx["sku"] = sku

    rid, dn = _create_and_approve_missing_return(s, ctx, acct["id"], sku["id"], qty=2)
    ctx["return_id"] = rid
    ctx["debit_note"] = dn

    r = s.get(f"{BASE_URL}/api/distributors/{DISTRIBUTOR_ID}/debit-notes/for-account/{acct['id']}")
    assert r.status_code == 200, r.text
    body = r.json()
    assert "debit_notes" in body and "total_available" in body and "count" in body, body
    nums = [x.get("debit_note_number") for x in body["debit_notes"]]
    assert dn["debit_note_number"] in nums, f"Our DN {dn['debit_note_number']} missing from list: {nums}"
    target = next(x for x in body["debit_notes"] if x["debit_note_number"] == dn["debit_note_number"])
    assert target.get("balance_amount", 0) > 0, target
    assert target.get("status") in ("pending", "partially_applied"), target
    assert body["total_available"] >= target["balance_amount"]
    assert body["count"] == len(body["debit_notes"])


# ---------- 2. Create delivery WITH debit note → status applied, billing increased ----------
def _resolve_distributor_location(s):
    d = s.get(f"{BASE_URL}/api/distributors/{DISTRIBUTOR_ID}").json()
    locs = (d.get("distributor") or d).get("locations") or []
    if locs:
        return locs[0].get("id") or locs[0].get("location_id")
    # fallback to top-level location_id
    return (d.get("distributor") or d).get("primary_location_id")


def test_delivery_with_debit_note_charges_customer(ctx):
    s = ctx["s"]
    if "debit_note" not in ctx:
        pytest.skip("Prerequisite test did not run")
    acct = ctx["account"]
    sku = ctx["sku"]
    dn = ctx["debit_note"]

    loc_id = _resolve_distributor_location(s)
    assert loc_id, "Could not resolve distributor location id"

    delivery_total = 1000.0  # 10 qty * 100 unit_price
    debit_amount = dn["balance_amount"]

    body = {
        "distributor_id": DISTRIBUTOR_ID,
        "distributor_location_id": loc_id,
        "account_id": acct["id"],
        "delivery_date": datetime.now().strftime("%Y-%m-%d"),
        "reference_number": f"TEST-DEL-{int(time.time())}",
        "items": [{
            "sku_id": sku["id"],
            "quantity": 10,
            "unit_price": 100.0,
            "customer_selling_price": 100.0,
            "discount_percent": 0,
        }],
        "credit_notes_to_apply": [],
        "debit_notes_to_apply": [{
            "debit_note_id": dn["id"],
            "amount_to_apply": debit_amount,
        }],
        "remarks": "TEST_iter239_apply_debit",
    }
    r = s.post(f"{BASE_URL}/api/distributors/{DISTRIBUTOR_ID}/deliveries", json=body)
    assert r.status_code in (200, 201), r.text
    delivery = r.json()
    ctx["created_delivery_ids"].append(delivery.get("id"))

    # Net billing should be delivery_total + debit - 0
    assert delivery.get("total_debit_applied", 0) == pytest.approx(debit_amount, rel=1e-3), delivery
    expected_net = delivery_total + debit_amount
    assert delivery.get("net_customer_billing", 0) == pytest.approx(expected_net, rel=1e-3), \
        f"Expected net {expected_net}, got {delivery.get('net_customer_billing')}"
    applied = delivery.get("applied_debit_notes") or []
    assert any(x.get("debit_note_id") == dn["id"] for x in applied), applied


# ---------- 3. After apply: DN status='applied', not listed in for-account ----------
def test_debit_note_status_after_apply(ctx):
    s = ctx["s"]
    if "debit_note" not in ctx:
        pytest.skip("Prerequisite test did not run")
    acct = ctx["account"]
    dn = ctx["debit_note"]

    # Re-fetch for-account list — should NOT contain our DN
    r = s.get(f"{BASE_URL}/api/distributors/{DISTRIBUTOR_ID}/debit-notes/for-account/{acct['id']}")
    assert r.status_code == 200
    nums = [x.get("debit_note_number") for x in r.json()["debit_notes"]]
    assert dn["debit_note_number"] not in nums, \
        f"Fully-applied DN still appears in for-account list: {nums}"

    # Originating return should be moved to credit_issued (rendered as Debit Issued)
    rid = ctx["return_id"]
    rg = s.get(f"{BASE_URL}/api/distributors/{DISTRIBUTOR_ID}/returns/{rid}").json()
    rg = rg.get("return") or rg
    assert rg.get("status") == "credit_issued", f"Return status didn't move: {rg.get('status')}"
    assert rg.get("debit_applied_to_delivery_number") or rg.get("debit_applied_to_delivery_id"), \
        f"Return missing debit_applied_to_delivery_*: {rg}"


if __name__ == "__main__":
    pytest.main([__file__, "-v", "--tb=short"])
