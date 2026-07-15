"""Backend tests for the new Stock Transfer Request → Approval → Fulfillment workflow.

Covers:
  1) my-permissions guard (CEO true/true, non-transfer role false/false)
  2) POST create 403 when role lacks permission + Roles & Permissions hint text
  3) Role management backfills stock_transfer_requests module + grant flow
  4) Full lifecycle: create pending → reject; another create → approve → fulfil via
     stock transfer create (400 guard when linked request is rejected)
  5) Bell notifications delivered to approvers + requester
"""
import os
import uuid

import pytest
import requests

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "https://design-workflow-hub-11.preview.emergentagent.com").rstrip("/")
TENANT = "nyla-air-water"

CEO_EMAIL = "surya.yadavalli@nylaairwater.earth"
REQ_EMAIL = "noida.sales3@nylaairwater.earth"
PWD = "test123"


def _session(email: str, password: str) -> requests.Session:
    s = requests.Session()
    s.headers.update({"Content-Type": "application/json", "X-Tenant-ID": TENANT})
    r = s.post(f"{BASE_URL}/api/auth/login", json={"email": email, "password": password}, timeout=30)
    assert r.status_code == 200, f"login {email} failed: {r.status_code} {r.text[:200]}"
    tok = r.json().get("session_token")
    if tok:
        s.headers["Authorization"] = f"Bearer {tok}"
    return s


@pytest.fixture(scope="module")
def ceo():
    return _session(CEO_EMAIL, PWD)


@pytest.fixture(scope="module")
def requester():
    return _session(REQ_EMAIL, PWD)


@pytest.fixture(scope="module")
def created_state():
    # Shared bag for created request IDs so tests can cross-reference cleanly.
    return {}


# ────────────────────────────────────────────────────────────────
# BACKEND 1 — permissions
# ────────────────────────────────────────────────────────────────
def test_1a_ceo_can_request_and_approve(ceo):
    r = ceo.get(f"{BASE_URL}/api/stock-transfer-requests/my-permissions", timeout=30)
    assert r.status_code == 200, r.text
    data = r.json()
    assert data.get("can_request") is True
    assert data.get("can_approve") is True


def test_1b_head_of_business_initially_denied(requester, ceo):
    # First force the role backfill via GET /api/roles as CEO so the module key exists.
    ceo.get(f"{BASE_URL}/api/roles", timeout=30)
    r = requester.get(f"{BASE_URL}/api/stock-transfer-requests/my-permissions", timeout=30)
    assert r.status_code == 200, r.text
    data = r.json()
    # Baseline: role has neither the new create permission nor stock_transfers.create
    assert data.get("can_approve") is False
    # can_request should start False before we grant the role permission
    if data.get("can_request") is True:
        pytest.skip("Requester already has can_request=true from a prior run — proceeding is fine, "
                    "but the initial denial test only makes sense on a clean slate.")


def test_1c_create_denied_without_permission(requester):
    r = requester.post(
        f"{BASE_URL}/api/stock-transfer-requests",
        json={"dest_location_id": "dummy", "items": [{"sku_id": "x", "quantity_units": 1}]},
        timeout=30,
    )
    assert r.status_code == 403, f"expected 403, got {r.status_code} — {r.text[:200]}"
    body = r.json()
    msg = (body.get("detail") or body.get("message") or "").lower()
    assert "roles" in msg and "permissions" in msg, f"Missing settings hint in error: {msg}"


# ────────────────────────────────────────────────────────────────
# BACKEND 2 — Grant requester role & re-check
# ────────────────────────────────────────────────────────────────
def test_2a_roles_list_exposes_module(ceo):
    r = ceo.get(f"{BASE_URL}/api/roles", timeout=30)
    assert r.status_code == 200, r.text
    payload = r.json()
    labels = payload.get("module_labels") or {}
    assert "stock_transfer_requests" in labels, "module key missing from module_labels"
    assert labels["stock_transfer_requests"] == "Stock Transfer Requests"
    # Also asserted in module_categories under Distribution
    cats = payload.get("module_categories") or {}
    all_keys = {k for lst in cats.values() for k in lst}
    assert "stock_transfer_requests" in all_keys


def test_2b_grant_head_of_business_and_verify(ceo, requester, created_state):
    roles_res = ceo.get(f"{BASE_URL}/api/roles", timeout=30)
    assert roles_res.status_code == 200
    roles = roles_res.json().get("roles") or []
    hob = next((rr for rr in roles if rr.get("name") == "Head of Business"), None)
    if not hob:
        # 'Head of Business' role document doesn't exist in this tenant even though
        # users carry that role name. Create it so we can exercise the grant flow.
        # This mirrors what an admin would do in Settings → Roles & Permissions.
        create_body = {
            "name": "Head of Business",
            "description": "Auto-created by backend test to exercise role permission grant.",
            "permissions": {"stock_transfer_requests": {"view": True, "create": True, "edit": False, "delete": False}},
        }
        cr = ceo.post(f"{BASE_URL}/api/roles", json=create_body, timeout=30)
        assert cr.status_code in (200, 201), f"create role failed: {cr.status_code} {cr.text[:200]}"
        hob = cr.json()
        created_state["role_created_by_test"] = True
    perms = dict(hob.get("permissions") or {})
    perms["stock_transfer_requests"] = {"view": True, "create": True, "edit": False, "delete": False}
    upd = ceo.put(
        f"{BASE_URL}/api/roles/{hob['id']}",
        json={"permissions": perms},
        timeout=30,
    )
    assert upd.status_code == 200, f"grant failed: {upd.status_code} {upd.text[:200]}"
    created_state["role_id"] = hob["id"]

    # Now requester should see can_request=true (approve still false)
    r = requester.get(f"{BASE_URL}/api/stock-transfer-requests/my-permissions", timeout=30)
    assert r.status_code == 200
    d = r.json()
    assert d.get("can_request") is True, d
    assert d.get("can_approve") is False, d


# ────────────────────────────────────────────────────────────────
# BACKEND 3 — Request lifecycle + notifications
# ────────────────────────────────────────────────────────────────
def _pick_dest_and_sku(ceo):
    tg = ceo.get(f"{BASE_URL}/api/distributor/stock-transfers/eligible-targets", timeout=30)
    assert tg.status_code == 200, tg.text
    targets = tg.json().get("targets") or []
    # Prefer a self-managed non-factory target
    dest = next((t for t in targets if t.get("is_self_managed") and not t.get("is_factory")), None) \
           or (targets[0] if targets else None)
    assert dest, "no eligible targets available"

    sku_res = ceo.get(f"{BASE_URL}/api/master-skus", timeout=30)
    assert sku_res.status_code == 200, sku_res.text
    body = sku_res.json()
    skus = body if isinstance(body, list) else (body.get("skus") or body.get("items") or [])
    assert skus, f"no master skus found: {sku_res.text[:200]}"
    sku = skus[0]
    return dest["location_id"], sku["id"]


def test_3a_create_and_reject(ceo, requester, created_state):
    dest_id, sku_id = _pick_dest_and_sku(ceo)
    created_state["dest_id"] = dest_id
    created_state["sku_id"] = sku_id

    payload = {
        "dest_location_id": dest_id,
        "items": [{"sku_id": sku_id, "quantity_units": 24}],
        "reason": "TEST_reject_flow",
    }
    r = requester.post(f"{BASE_URL}/api/stock-transfer-requests", json=payload, timeout=30)
    assert r.status_code in (200, 201), f"create failed: {r.status_code} {r.text[:200]}"
    doc = r.json()
    assert doc.get("status") == "pending"
    assert doc.get("request_number", "").startswith("STR-")
    created_state["reject_req_id"] = doc["id"]
    created_state["reject_req_number"] = doc["request_number"]

    # Requester sees own request
    lst = requester.get(f"{BASE_URL}/api/stock-transfer-requests", timeout=30)
    assert lst.status_code == 200
    ids = [x["id"] for x in lst.json().get("requests", [])]
    assert doc["id"] in ids

    # CEO rejects
    rej = ceo.post(
        f"{BASE_URL}/api/stock-transfer-requests/{doc['id']}/reject",
        json={"remark": "TEST_not_needed"}, timeout=30,
    )
    assert rej.status_code == 200, rej.text

    # Verify persistence via list
    lst2 = ceo.get(f"{BASE_URL}/api/stock-transfer-requests", timeout=30)
    row = next((x for x in lst2.json().get("requests", []) if x["id"] == doc["id"]), None)
    assert row is not None
    assert row.get("status") == "rejected"
    assert row.get("rejection_remark") == "TEST_not_needed"


def test_3b_create_and_approve(ceo, requester, created_state):
    dest_id = created_state["dest_id"]
    sku_id = created_state["sku_id"]
    payload = {
        "dest_location_id": dest_id,
        "items": [{"sku_id": sku_id, "quantity_units": 24}],
        "reason": "TEST_approve_flow",
    }
    r = requester.post(f"{BASE_URL}/api/stock-transfer-requests", json=payload, timeout=30)
    assert r.status_code in (200, 201), r.text
    doc = r.json()
    created_state["approve_req_id"] = doc["id"]
    created_state["approve_req_number"] = doc["request_number"]

    appr = ceo.post(
        f"{BASE_URL}/api/stock-transfer-requests/{doc['id']}/approve",
        json={"remark": "TEST_ok"}, timeout=30,
    )
    assert appr.status_code == 200, appr.text

    # Verify persistence
    lst = ceo.get(f"{BASE_URL}/api/stock-transfer-requests?status=approved", timeout=30)
    assert lst.status_code == 200
    row = next((x for x in lst.json().get("requests", []) if x["id"] == doc["id"]), None)
    assert row is not None
    assert row.get("status") == "approved"


def test_3c_double_action_blocked(ceo, created_state):
    """Approving/rejecting an already-actioned request must fail with 400."""
    rid = created_state.get("reject_req_id")
    if not rid:
        pytest.skip("Reject flow test did not run — cannot check double-action guard.")
    r = ceo.post(f"{BASE_URL}/api/stock-transfer-requests/{rid}/approve", json={}, timeout=30)
    assert r.status_code == 400, f"expected 400 when actioning rejected request, got {r.status_code}: {r.text[:200]}"


def test_3d_notifications_visible(ceo, requester, created_state):
    approve_num = created_state.get("approve_req_number", "")
    reject_num = created_state.get("reject_req_number", "")
    # Requester notifications should include approval/rejection titles
    n = requester.get(f"{BASE_URL}/api/notifications", timeout=30)
    assert n.status_code == 200, n.text
    body = n.json()
    items = body.get("notifications") or body.get("items") or (body if isinstance(body, list) else [])
    titles = [(it.get("title") or "") for it in items]
    joined = " | ".join(titles)
    assert any(("approved" in t.lower() or "rejected" in t.lower()) and "STR-" in t for t in titles), \
        f"requester bell missing approve/reject notification. titles={titles[:10]}"

    # CEO bell should include the "Stock transfer request STR-..." notifications
    n2 = ceo.get(f"{BASE_URL}/api/notifications", timeout=30)
    assert n2.status_code == 200
    body2 = n2.json()
    items2 = body2.get("notifications") or body2.get("items") or (body2 if isinstance(body2, list) else [])
    titles2 = [(it.get("title") or "") for it in items2]
    # The CEO is BOTH an approver AND (as per role) requester in this tenant.
    # The approver notification is skipped for the requester's own user_id, so if
    # the requester is a different user we should still see approver notifications.
    # We just assert a "Stock transfer request STR-..." title exists somewhere.
    assert any("Stock transfer request STR-" in t for t in titles2), \
        f"CEO bell missing 'new request' notification. titles={titles2[:10]}"


# ────────────────────────────────────────────────────────────────
# BACKEND 4 — Fulfilment guard
# ────────────────────────────────────────────────────────────────
def test_4a_transfer_create_rejects_rejected_request(ceo, created_state):
    """Trying to fulfil a REJECTED request via POST /api/distributor/stock-transfers must 400."""
    rid = created_state.get("reject_req_id")
    if not rid:
        pytest.skip("no rejected request id — earlier tests failed")

    # Send a minimally-shaped payload; the request_id guard fires BEFORE we validate
    # the transfer payload (see distributor_stock_transfers.create_stock_transfer ~line 1157).
    payload = {
        "source_distributor_id": "any",
        "source_location_id": "any-src",
        "dest_distributor_id": "any",
        "dest_location_id": "any-dst",
        "items": [{
            "sku_id": "x",
            "packaging_type_name": "Crate",
            "units_per_package": 12,
            "quantity": 1,
        }],
        "request_id": rid,
    }
    r = ceo.post(f"{BASE_URL}/api/distributor/stock-transfers", json=payload, timeout=30)
    assert r.status_code == 400, f"expected 400 for rejected request, got {r.status_code}: {r.text[:200]}"
    body = r.json()
    detail = (body.get("detail") or body.get("message") or "").lower()
    assert "rejected" in detail or "approved" in detail, detail


def test_4b_transfer_create_rejects_missing_request(ceo):
    payload = {
        "source_distributor_id": "any",
        "source_location_id": "any-src",
        "dest_distributor_id": "any",
        "dest_location_id": "any-dst",
        "items": [{
            "sku_id": "x",
            "packaging_type_name": "Crate",
            "units_per_package": 12,
            "quantity": 1,
        }],
        "request_id": f"non-existent-{uuid.uuid4()}",
    }
    r = ceo.post(f"{BASE_URL}/api/distributor/stock-transfers", json=payload, timeout=30)
    assert r.status_code == 404, f"expected 404 for missing request, got {r.status_code}: {r.text[:200]}"


def test_4c_cancel_pending_request(ceo, requester, created_state):
    """Sanity check on cancel endpoint — create a fresh pending and cancel it."""
    dest_id = created_state.get("dest_id")
    sku_id = created_state.get("sku_id")
    if not (dest_id and sku_id):
        pytest.skip("earlier setup missing")
    r = requester.post(
        f"{BASE_URL}/api/stock-transfer-requests",
        json={"dest_location_id": dest_id, "items": [{"sku_id": sku_id, "quantity_units": 12}],
              "reason": "TEST_cancel"},
        timeout=30,
    )
    assert r.status_code in (200, 201), r.text
    rid = r.json()["id"]
    c = requester.post(f"{BASE_URL}/api/stock-transfer-requests/{rid}/cancel", timeout=30)
    assert c.status_code == 200, c.text
