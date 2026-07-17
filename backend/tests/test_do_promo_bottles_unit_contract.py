"""
Iteration test — Delivery Order → auto Promo Stock-Out BOTTLES unit contract.

Bug being verified:
- Sample delivery requests (Delivery Orders) are entered in BOTTLES.
- Previously, the auto-created promotional stock-out interpreted the DO
  quantity as CRATES, inflating dispatched quantity by units-per-package
  (30 bottles requested -> 30 crates = 360 bottles dispatched).
- Fix: `PromoDeliveryItemCreate.quantity_unit` defaults to 'packages' (legacy),
  and the DO->promo bridge (`_auto_create_draft_promo`) now passes
  `quantity_unit='bottles'` so the DO qty is interpreted as base units.

Coverage:
  1) DO E2E: create -> submit -> approve -> place_order, then read the linked
     promo dispatch items and assert quantity/packages/packaging_units/
     unit_price/line_value (bottles contract).
  2) Regression: direct promo dispatch (POST /distributors/{id}/promo-deliveries)
     without quantity_unit still interprets quantity as packages (legacy).
  3) Repair admin endpoints smoke — GET repair-promo-units dry-run and
     GET reconcile-batch-stock?batch_code=NOPE => 404.
"""
import os
from datetime import date, timedelta

import requests

BASE = os.environ.get("REACT_APP_BACKEND_URL", "").rstrip("/")
assert BASE, "REACT_APP_BACKEND_URL must be set"

EMAIL = "surya.yadavalli@nylaairwater.earth"
PASSWORD = "test123"
TENANT = "nyla-air-water"

EMPIRE_ACCOUNT_ID = "d4e2187a-5e7d-4847-902b-b6699ae910fc"
NYLA_600_SILVER_SKU = "20d525e8-c4af-4f40-965a-549dcd50c0a9"
CRATE_12_PACKAGING = {
    "packaging_type_id": "864f1d58-e21c-43eb-91a5-4bfd787f7e64",
    "packaging_type_name": "Crate - 12",
    "units_per_package": 12,
}


# ─── Session / helpers ────────────────────────────────────────────────────
def _login():
    s = requests.Session()
    s.headers.update({"Content-Type": "application/json", "X-Tenant-ID": TENANT})
    r = s.post(f"{BASE}/api/auth/login",
               json={"email": EMAIL, "password": PASSWORD, "tenant_id": TENANT}, timeout=30)
    assert r.status_code == 200, f"login failed: {r.status_code} {r.text[:300]}"
    j = r.json()
    tok = j.get("access_token") or j.get("token") or j.get("session_token")
    assert tok, "no token in login response"
    s.headers.update({"Authorization": f"Bearer {tok}"})
    return s


def _pick_reason(s):
    r = s.get(f"{BASE}/api/admin/promo-reasons")
    if r.status_code == 200:
        items = (r.json() or {}).get("reasons") or []
        if items:
            return items[0].get("name")
    return "Sampling"


# ─── Feature: DO -> auto promo BOTTLES contract ───────────────────────────
def test_do_place_order_creates_promo_with_bottles_contract():
    s = _login()
    reason = _pick_reason(s)
    future = (date.today() + timedelta(days=5)).isoformat()
    payload = {
        "recipient_type": "account",
        "account_id": EMPIRE_ACCOUNT_ID,
        "requested_date": future,
        "reason": reason,
        "delivery_address": {"city": "Bengaluru"},
        "items": [{
            "sku_id": NYLA_600_SILVER_SKU,
            "sku_name": "Nyla – 600 ml / Silver",
            "quantity": 24,          # BOTTLES
            "unit_price": 10,        # per bottle
            **CRATE_12_PACKAGING,
        }],
    }
    r = s.post(f"{BASE}/api/delivery-orders", json=payload)
    assert r.status_code in (200, 201), f"create DO failed: {r.status_code} {r.text[:400]}"
    do = r.json()
    do_id = do["id"]

    # Drive the state machine to place_order (auto-creates promo)
    for action in ("submit", "approve", "place_order"):
        r = s.post(f"{BASE}/api/delivery-orders/{do_id}/transition",
                   json={"action_key": action})
        assert r.status_code == 200, f"{action} failed: {r.status_code} {r.text[:400]}"
        if action == "place_order":
            body = r.json()
            promo = body.get("promo") or {}
            assert promo.get("status") == "created", (
                f"auto-promo not created: {promo}. If failed with 'no linked contact' "
                "check the account has a contact, if 'no distributor' verify assignment.")

    # Fetch DO — asserts linkage
    r = s.get(f"{BASE}/api/delivery-orders/{do_id}")
    assert r.status_code == 200, r.text[:200]
    fetched = r.json()
    promo_id = fetched.get("promo_dispatch_id")
    dist_id = fetched.get("promo_distributor_id")
    assert promo_id, f"DO missing promo_dispatch_id: {fetched}"
    assert dist_id, f"DO missing promo_distributor_id: {fetched}"

    # Fetch the linked promo dispatch + items
    r = s.get(f"{BASE}/api/distributors/{dist_id}/promo-deliveries/{promo_id}")
    assert r.status_code == 200, f"promo GET failed: {r.status_code} {r.text[:300]}"
    promo = r.json()
    items = promo.get("items") or []
    assert len(items) == 1, f"expected 1 item, got {len(items)}: {items}"
    it = items[0]

    # THE core assertion for the bug fix
    assert it["quantity"] == 24, f"BUG! quantity expected 24 bottles, got {it['quantity']} (inflation to {it['quantity']} suggests crates-interpretation)"
    assert it["packages"] == 2, f"expected packages=2, got {it['packages']}"
    assert it["packaging_units"] == 12, f"expected packaging_units=12, got {it['packaging_units']}"
    assert it["units_per_package"] == 12, f"expected units_per_package=12, got {it['units_per_package']}"
    assert float(it["unit_price"]) == 10.0, f"expected unit_price=10 per bottle, got {it['unit_price']}"
    assert float(it["line_value"]) == 240.0, f"expected line_value=240, got {it['line_value']}"

    # Cleanup: delete draft promo then draft DO
    try:
        s.delete(f"{BASE}/api/distributors/{dist_id}/promo-deliveries/{promo_id}")
    except Exception:
        pass


def test_do_place_order_bottles_non_multiple_falls_back_to_loose_bottles():
    """Entering 25 bottles with a Crate-12 packaging is NOT a clean multiple.
    Should still dispatch 25 bottles (loose), not inflate to 25 crates."""
    s = _login()
    reason = _pick_reason(s)
    future = (date.today() + timedelta(days=5)).isoformat()
    payload = {
        "recipient_type": "account",
        "account_id": EMPIRE_ACCOUNT_ID,
        "requested_date": future,
        "reason": reason,
        "delivery_address": {"city": "Bengaluru"},
        "items": [{
            "sku_id": NYLA_600_SILVER_SKU,
            "sku_name": "Nyla – 600 ml / Silver",
            "quantity": 25,
            "unit_price": 10,
            **CRATE_12_PACKAGING,
        }],
    }
    r = s.post(f"{BASE}/api/delivery-orders", json=payload)
    assert r.status_code in (200, 201), r.text[:300]
    do_id = r.json()["id"]
    for action in ("submit", "approve", "place_order"):
        r = s.post(f"{BASE}/api/delivery-orders/{do_id}/transition", json={"action_key": action})
        assert r.status_code == 200, f"{action}: {r.text[:300]}"
    fetched = s.get(f"{BASE}/api/delivery-orders/{do_id}").json()
    promo_id = fetched.get("promo_dispatch_id")
    dist_id = fetched.get("promo_distributor_id")
    if not promo_id:
        # promo failed to be created -- report why
        raise AssertionError(f"promo not created for 25-bottle DO: {fetched}")
    promo = s.get(f"{BASE}/api/distributors/{dist_id}/promo-deliveries/{promo_id}").json()
    it = (promo.get("items") or [])[0]
    assert it["quantity"] == 25, f"expected 25 bottles, got {it['quantity']}"
    # 25 is not a multiple of 12 -> safety net falls back to loose bottles
    assert it["packaging_units"] == 1 and it["packages"] == 25, (
        f"expected loose-bottle fallback (units=1, packages=25), got units={it['packaging_units']}, packages={it['packages']}")
    try:
        s.delete(f"{BASE}/api/distributors/{dist_id}/promo-deliveries/{promo_id}")
    except Exception:
        pass


# ─── Regression: direct promo (legacy packages contract) ──────────────────
def _pick_distributor_with_location(s):
    r = s.get(f"{BASE}/api/distributors")
    r.raise_for_status()
    data = r.json()
    dists = data.get("distributors") or data.get("items") or data
    for d in dists:
        did = d.get("id")
        rr = s.get(f"{BASE}/api/distributors/{did}/locations")
        if rr.status_code != 200:
            continue
        locs = (rr.json() or {}).get("locations") or []
        for loc in locs:
            if (loc.get("status") or "active") == "active" and not loc.get("is_factory"):
                return did, loc["id"]
    return None, None


def test_direct_promo_no_quantity_unit_uses_packages_contract():
    """Direct promo dispatch (from dialog) with quantity=2 crates, 12/pack and
    NO quantity_unit — should store item as 24 bottles, packages=2 (legacy)."""
    s = _login()
    dist_id, loc_id = _pick_distributor_with_location(s)
    if not (dist_id and loc_id):
        # not enough setup — skip cleanly
        import pytest
        pytest.skip("no distributor+location available for direct promo test")

    # need a contact for recipient
    r = s.get(f"{BASE}/api/contacts")
    contacts = (r.json() or {}).get("contacts") or (r.json() or {}).get("items") or []
    if not contacts:
        import pytest
        pytest.skip("no contact available for direct promo test")
    contact_id = contacts[0]["id"]

    reason = _pick_reason(s)
    payload = {
        "distributor_location_id": loc_id,
        "recipient_type": "contact",
        "contact_id": contact_id,
        "delivery_date": (date.today() + timedelta(days=3)).isoformat(),
        "reason": reason,
        "as_draft": True,       # skip stock validation + Zoho
        "items": [{
            "sku_id": NYLA_600_SILVER_SKU,
            "sku_name": "Nyla – 600 ml / Silver",
            "quantity": 2,       # crates (legacy)
            "unit_price": 120,   # per crate
            # NO quantity_unit -> defaults to 'packages'
            **CRATE_12_PACKAGING,
        }],
    }
    r = s.post(f"{BASE}/api/distributors/{dist_id}/promo-deliveries", json=payload)
    assert r.status_code in (200, 201), f"direct promo create failed: {r.status_code} {r.text[:400]}"
    dispatch = (r.json() or {}).get("dispatch") or {}
    dispatch_id = dispatch.get("id")
    assert dispatch_id, f"no dispatch id in response: {r.json()}"

    # Fetch items and assert legacy expansion
    r = s.get(f"{BASE}/api/distributors/{dist_id}/promo-deliveries/{dispatch_id}")
    assert r.status_code == 200
    it = (r.json().get("items") or [])[0]
    assert it["quantity"] == 24, f"expected 24 bottles (2 crates × 12), got {it['quantity']}"
    assert it["packages"] == 2, f"expected 2 packages, got {it['packages']}"
    assert it["packaging_units"] == 12
    # per-bottle price should be 120/12 = 10
    assert abs(float(it["unit_price"]) - 10.0) < 0.01, f"expected per-bottle price 10, got {it['unit_price']}"

    # Cleanup
    try:
        s.delete(f"{BASE}/api/distributors/{dist_id}/promo-deliveries/{dispatch_id}")
    except Exception:
        pass


# ─── Repair endpoints smoke ───────────────────────────────────────────────
def test_repair_promo_units_dry_run():
    s = _login()
    r = s.get(f"{BASE}/api/admin/batches/repair-promo-units")
    assert r.status_code == 200, f"repair-promo-units: {r.status_code} {r.text[:300]}"
    body = r.json()
    # dry-run must NOT apply
    assert body.get("applied") is False, f"dry-run should not apply, got {body}"


def test_reconcile_batch_stock_unknown_batch_404():
    s = _login()
    r = s.get(f"{BASE}/api/admin/batches/reconcile-batch-stock",
              params={"batch_code": "NOPE-DOES-NOT-EXIST-XYZ"})
    assert r.status_code == 404, f"expected 404, got {r.status_code} {r.text[:300]}"
