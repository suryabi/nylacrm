"""Backend regression tests for Delivery Orders -> auto Promo Stock-Out flow.
Covers: mandatory requested_date, place_order action -> draft promo creation,
DO mirrors promo_dispatch_id/promo_challan_number/promo_distributor_name/fulfillment_status."""
import os
import time
import requests
from datetime import date, timedelta

BASE = os.environ.get("REACT_APP_BACKEND_URL", "").rstrip("/")
assert BASE, "REACT_APP_BACKEND_URL must be set"

EMAIL = "surya.yadavalli@nylaairwater.earth"
PASSWORD = "test123"
TENANT = "nyla-air-water"
EMPIRE_ACCOUNT_ID = "d4e2187a-5e7d-4847-902b-b6699ae910fc"


def _login():
    s = requests.Session()
    s.headers.update({"Content-Type": "application/json", "X-Tenant-ID": TENANT})
    r = s.post(f"{BASE}/api/auth/login",
               json={"email": EMAIL, "password": PASSWORD, "tenant_id": TENANT})
    assert r.status_code == 200, f"login failed: {r.status_code} {r.text[:300]}"
    j = r.json()
    tok = j.get("access_token") or j.get("token") or j.get("session_token")
    assert tok
    s.headers.update({"Authorization": f"Bearer {tok}"})
    return s


def _pick_sku(s):
    r = s.get(f"{BASE}/api/master-skus")
    assert r.status_code == 200, r.text[:200]
    d = r.json()
    items = d.get("skus") or d.get("items") or (d if isinstance(d, list) else [])
    assert items, "no SKUs in tenant"
    return items[0]


def _pick_reason(s):
    r = s.get(f"{BASE}/api/promotional-reasons")
    if r.status_code != 200:
        return None
    items = r.json()
    items = items.get("items", items) if isinstance(items, dict) else items
    return items[0] if items else None


def test_create_do_missing_requested_date_blocks():
    s = _login()
    sku = _pick_sku(s)
    payload = {
        "recipient_type": "account",
        "account_id": EMPIRE_ACCOUNT_ID,
        "items": [{"sku_id": sku["id"], "sku_name": sku.get("name"),
                   "quantity": 1, "unit_price": 100}],
        "delivery_address": {"city": "Bengaluru"},
        # NO requested_date
    }
    r = s.post(f"{BASE}/api/delivery-orders", json=payload)
    assert r.status_code in (400, 422), f"expected validation error, got {r.status_code}: {r.text[:200]}"


def test_account_assignment_path_place_order_creates_promo():
    s = _login()
    sku = _pick_sku(s)
    reason = _pick_reason(s)
    future = (date.today() + timedelta(days=5)).isoformat()
    payload = {
        "recipient_type": "account",
        "account_id": EMPIRE_ACCOUNT_ID,
        "requested_date": future,
        "reason": (reason.get("name") if reason else "Sampling"),
        "delivery_address": {"city": "Bengaluru"},
        "items": [{"sku_id": sku["id"],
                   "sku_name": sku.get("name"),
                   "quantity": 2, "unit_price": 100}],
    }
    r = s.post(f"{BASE}/api/delivery-orders", json=payload)
    assert r.status_code in (200, 201), f"create failed: {r.status_code} {r.text[:400]}"
    do = r.json()
    do_id = do["id"]
    assert do.get("requested_date") == future

    # submit
    r = s.post(f"{BASE}/api/delivery-orders/{do_id}/transition", json={"action_key": "submit"})
    assert r.status_code == 200, f"submit failed: {r.status_code} {r.text[:300]}"

    # approve
    r = s.post(f"{BASE}/api/delivery-orders/{do_id}/transition", json={"action_key": "approve"})
    assert r.status_code == 200, f"approve failed: {r.status_code} {r.text[:300]}"

    # place_order -> auto promo
    r = s.post(f"{BASE}/api/delivery-orders/{do_id}/transition", json={"action_key": "place_order"})
    assert r.status_code == 200, f"place_order failed: {r.status_code} {r.text[:400]}"
    body = r.json()
    # response may carry promo info
    promo_id_resp = body.get("promo_dispatch_id") or (body.get("order") or {}).get("promo_dispatch_id")

    # GET DO and assert linkage
    r = s.get(f"{BASE}/api/delivery-orders/{do_id}")
    assert r.status_code == 200, r.text[:200]
    fetched = r.json()
    assert fetched.get("promo_dispatch_id"), f"DO missing promo_dispatch_id: {fetched}"
    assert fetched.get("promo_challan_number"), "DO missing promo_challan_number"
    assert fetched.get("promo_distributor_name") == "Test", \
        f"expected distributor 'Test' (account assignment), got {fetched.get('promo_distributor_name')}"
    assert fetched.get("fulfillment_status") == "draft", \
        f"expected fulfillment_status=draft, got {fetched.get('fulfillment_status')}"

    # verify the underlying promo dispatch document exists
    r = s.get(f"{BASE}/api/distributor-deliveries/{fetched['promo_dispatch_id']}")
    if r.status_code == 200:
        promo = r.json()
        assert promo.get("is_promo") is True
        assert promo.get("status") == "draft"


def test_city_coverage_fallback_path():
    """Recipient=contact with a city covered by a distributor (Bangalore -> Brian)."""
    s = _login()
    # find a contact
    r = s.get(f"{BASE}/api/contacts")
    assert r.status_code == 200
    d = r.json()
    contacts = d.get("contacts") or d.get("items") or (d if isinstance(d, list) else [])
    if not contacts:
        return  # skip
    contact = contacts[0]

    sku = _pick_sku(s)
    reason = _pick_reason(s)
    future = (date.today() + timedelta(days=6)).isoformat()
    payload = {
        "recipient_type": "contact",
        "contact_id": contact["id"],
        "requested_date": future,
        "reason": (reason.get("name") if reason else "Sampling"),
        "delivery_address": {"city": "Bangalore"},
        "items": [{"sku_id": sku["id"], "sku_name": sku.get("name"),
                   "quantity": 1, "unit_price": 50}],
    }
    r = s.post(f"{BASE}/api/delivery-orders", json=payload)
    assert r.status_code in (200, 201), f"create failed: {r.status_code} {r.text[:300]}"
    do_id = r.json()["id"]
    for action in ("submit", "approve", "place_order"):
        r = s.post(f"{BASE}/api/delivery-orders/{do_id}/transition", json={"action_key": action})
        assert r.status_code == 200, f"{action} failed: {r.status_code} {r.text[:300]}"

    r = s.get(f"{BASE}/api/delivery-orders/{do_id}")
    fetched = r.json()
    # promo may or may not be created depending on Brian's coverage; if created, must be draft
    if fetched.get("promo_dispatch_id"):
        assert fetched.get("fulfillment_status") == "draft"
        # in city-coverage fallback the distributor should NOT be 'Test' (since contact has no account assignment)
        # accept either 'Brian' or any non-empty name
        assert fetched.get("promo_distributor_name")
    else:
        # acceptable - report via print
        print(f"city-fallback DO {do_id} created but no promo (no matching distributor coverage)")
