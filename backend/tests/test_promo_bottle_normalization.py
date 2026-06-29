"""Tests for PROMO stock-out bottle-normalization bug fix.

Verifies create_promo_dispatch stores quantity in BOTTLES (crates × units_per_package),
packaging_units, packages, per-bottle unit_price; total_quantity in bottles;
reservation/dashboard math agrees with regular Stock-Out convention.
"""
import os, requests, pytest, uuid

BASE = os.environ.get("REACT_APP_BACKEND_URL", "").rstrip("/")
if not BASE:
    # fallback to frontend/.env
    from pathlib import Path
    for line in Path("/app/frontend/.env").read_text().splitlines():
        if line.startswith("REACT_APP_BACKEND_URL="):
            BASE = line.split("=",1)[1].strip().rstrip("/")

CRED = {"email": "surya.yadavalli@nylaairwater.earth", "password": "test123"}
DISTRIBUTOR_ID = "bb12d90e-4d33-4890-ac5f-17573c551b5c"  # Brian
TENANT = "nyla-air-water"

@pytest.fixture(scope="module")
def sess():
    s = requests.Session()
    s.headers.update({"Content-Type": "application/json", "X-Tenant-ID": TENANT})
    r = s.post(f"{BASE}/api/auth/login", json=CRED, timeout=20)
    assert r.status_code == 200, r.text
    tok = r.json().get("session_token") or r.json().get("token")
    assert tok
    s.headers["Authorization"] = f"Bearer {tok}"
    return s

@pytest.fixture(scope="module")
def ctx(sess):
    # find a non-factory non-batch-tracked location with stock
    r = sess.get(f"{BASE}/api/distributors/{DISTRIBUTOR_ID}/locations", timeout=20)
    assert r.status_code == 200, r.text
    locs = r.json() if isinstance(r.json(), list) else r.json().get("locations") or r.json().get("data") or []
    loc = next((l for l in locs if not l.get("is_factory") and not l.get("track_batches")), None)
    assert loc, f"No non-factory non-batch location found: {locs}"
    loc_id = loc["id"]
    # pick a sku with stock at this location
    r = sess.get(f"{BASE}/api/distributors/{DISTRIBUTOR_ID}/stock", timeout=20)
    assert r.status_code == 200, r.text
    stock = r.json().get("stock") or r.json().get("data") or r.json()
    if isinstance(stock, dict) and "items" in stock:
        stock = stock["items"]
    cand = None
    for row in stock:
        if row.get("distributor_location_id") == loc_id and (row.get("quantity") or 0) >= 24:
            cand = row; break
    if not cand:
        # try any sku at the location regardless of >24 (will use upp=1 fallback test only)
        for row in stock:
            if row.get("distributor_location_id") == loc_id and (row.get("quantity") or 0) >= 12:
                cand = row; break
    assert cand, "No SKU with sufficient stock at the location"
    # contact id
    r = sess.get(f"{BASE}/api/contacts", timeout=20)
    contacts = r.json() if isinstance(r.json(), list) else r.json().get("data") or r.json().get("contacts") or []
    contact_id = contacts[0]["id"] if contacts else None
    assert contact_id, "No contact available"
    # promo reason
    r = sess.get(f"{BASE}/api/admin/promo-reasons", timeout=20)
    reasons = r.json().get("reasons") or []
    assert reasons
    reason = reasons[0]["name"]
    return {
        "loc_id": loc_id,
        "sku_id": cand["sku_id"],
        "sku_name": cand.get("sku_name") or cand.get("name") or "TEST_SKU",
        "available": cand["quantity"],
        "contact_id": contact_id,
        "reason": reason,
    }

def _reserved_for(sess, sku_id, loc_id):
    r = sess.get(f"{BASE}/api/distributors/{DISTRIBUTOR_ID}/stock", timeout=20)
    rows = r.json().get("stock") or r.json().get("data") or r.json()
    if isinstance(rows, dict): rows = rows.get("items", [])
    for row in rows:
        if row.get("sku_id") == sku_id and row.get("distributor_location_id") == loc_id:
            return row.get("reserved_quantity") or row.get("reserved") or 0, row.get("quantity") or 0
    return 0, 0

def _create_promo(sess, ctx, qty_crates, upp=12, as_draft=False, unit_price=120.0):
    payload = {
        "distributor_location_id": ctx["loc_id"],
        "recipient_type": "contact",
        "contact_id": ctx["contact_id"],
        "reason": ctx["reason"],
        "delivery_date": "2026-01-15",
        "as_draft": as_draft,
        "items": [{
            "sku_id": ctx["sku_id"],
            "sku_name": ctx["sku_name"],
            "quantity": qty_crates,
            "unit_price": unit_price,
            "units_per_package": upp,
            "packaging_type_name": f"{upp}-bottle crate" if upp > 1 else None,
        }],
    }
    return sess.post(
        f"{BASE}/api/distributors/{DISTRIBUTOR_ID}/promo-deliveries",
        json=payload, timeout=30)

# ----- TEST 1: core bug - bottle normalization on create -----
def test_promo_create_normalizes_to_bottles(sess, ctx):
    created_ids = []
    try:
        r = _create_promo(sess, ctx, qty_crates=1, upp=12, as_draft=True, unit_price=120.0)
        assert r.status_code == 200, r.text
        dispatch = r.json()["dispatch"]
        did = dispatch["id"]; created_ids.append(did)
        # header total_quantity should be bottles = 12
        assert dispatch["total_quantity"] == 12, f"expected total_quantity=12 (bottles), got {dispatch['total_quantity']}"
        # fetch items
        r = sess.get(f"{BASE}/api/distributors/{DISTRIBUTOR_ID}/promo-deliveries/{did}", timeout=20)
        assert r.status_code == 200
        items = r.json().get("items") or []
        assert len(items) == 1
        it = items[0]
        assert it["quantity"] == 12, f"line quantity should be in BOTTLES (12), got {it['quantity']}"
        assert it.get("packaging_units") == 12, f"packaging_units expected 12, got {it.get('packaging_units')}"
        assert it.get("packages") == 1, f"packages (crates) expected 1, got {it.get('packages')}"
        assert abs(float(it.get("unit_price") or 0) - 10.0) < 0.01, f"unit_price should be per-bottle (120/12=10), got {it.get('unit_price')}"
    finally:
        for d in created_ids:
            sess.delete(f"{BASE}/api/distributors/{DISTRIBUTOR_ID}/promo-deliveries/{d}", timeout=20)

# ----- TEST 2: stock dashboard reserved increases by 1 CRATE (12 bottles) -----
def test_promo_reserves_one_crate(sess, ctx):
    before_reserved, _ = _reserved_for(sess, ctx["sku_id"], ctx["loc_id"])
    r = _create_promo(sess, ctx, qty_crates=1, upp=12, as_draft=False, unit_price=120.0)
    assert r.status_code == 200, r.text
    did = r.json()["dispatch"]["id"]
    try:
        after_reserved, _ = _reserved_for(sess, ctx["sku_id"], ctx["loc_id"])
        delta = after_reserved - before_reserved
        # reserved is in BOTTLES on the stock row; dashboard divides by packaging_units to get crates.
        # Bug would yield delta=1 (1 bottle); fix yields delta=12 (1 crate = 12 bottles).
        assert delta == 12, f"reserved should increase by 12 bottles (1 crate), got delta={delta} (before={before_reserved}, after={after_reserved})"
    finally:
        sess.post(f"{BASE}/api/distributors/{DISTRIBUTOR_ID}/promo-deliveries/{did}/reverse", timeout=20)
        sess.delete(f"{BASE}/api/distributors/{DISTRIBUTOR_ID}/promo-deliveries/{did}", timeout=20)

# ----- TEST 3: availability error uses bottles -----
def test_promo_availability_error_in_bottles(sess, ctx):
    # demand more than available in bottles
    _, on_hand = _reserved_for(sess, ctx["sku_id"], ctx["loc_id"])
    # request crates such that crates*12 > on_hand
    crates = max(1, int((on_hand // 12) + 100))
    r = _create_promo(sess, ctx, qty_crates=crates, upp=12, as_draft=False, unit_price=120.0)
    assert r.status_code == 400, f"expected 400, got {r.status_code}: {r.text}"
    detail = r.json().get("detail", "")
    # the 'need' should be in bottles (= crates * 12) — not crates
    assert f"need {crates*12}" in detail, f"availability error not in bottles: {detail}"

# ----- TEST 4: complete deducts bottle quantity from inventory -----
def test_promo_complete_deducts_bottles(sess, ctx):
    _, on_hand_before = _reserved_for(sess, ctx["sku_id"], ctx["loc_id"])
    r = _create_promo(sess, ctx, qty_crates=1, upp=12, as_draft=False, unit_price=120.0)
    assert r.status_code == 200, r.text
    did = r.json()["dispatch"]["id"]
    try:
        rc = sess.post(f"{BASE}/api/distributors/{DISTRIBUTOR_ID}/promo-deliveries/{did}/complete", timeout=30)
        assert rc.status_code == 200, rc.text
        _, on_hand_after = _reserved_for(sess, ctx["sku_id"], ctx["loc_id"])
        delta = on_hand_before - on_hand_after
        assert delta == 12, f"complete should deduct 12 bottles, got delta={delta} (before={on_hand_before}, after={on_hand_after})"
    finally:
        # complete is terminal; cannot delete a complete record. Leave audit trail.
        pass

# ----- TEST 6: regression — promo with no packaging (upp=1) treats qty as 1 bottle -----
def test_promo_no_packaging_unaffected(sess, ctx):
    r = _create_promo(sess, ctx, qty_crates=3, upp=1, as_draft=True, unit_price=15.0)
    assert r.status_code == 200, r.text
    did = r.json()["dispatch"]["id"]
    try:
        assert r.json()["dispatch"]["total_quantity"] == 3
        items = sess.get(f"{BASE}/api/distributors/{DISTRIBUTOR_ID}/promo-deliveries/{did}", timeout=20).json().get("items") or []
        it = items[0]
        assert it["quantity"] == 3
        assert it.get("packaging_units") == 1
        assert it.get("packages") == 3
        assert abs(float(it.get("unit_price") or 0) - 15.0) < 0.01
    finally:
        sess.delete(f"{BASE}/api/distributors/{DISTRIBUTOR_ID}/promo-deliveries/{did}", timeout=20)
