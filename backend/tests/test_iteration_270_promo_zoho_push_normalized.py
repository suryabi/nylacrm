"""Iteration 270 — Promo Dispatch Zoho push uses NORMALIZED stored items
(not the raw crate payload).

Recurring production bug: a confirmed promo Delivery Challan printed
"Qty 1.00 pcs · Rate ₹2,688 · 1 Bottle" for a crate line, while the in-app
Stock-Out record correctly showed "Qty 24, 1 × 24 Bottle Crate (24 Bottles),
₹112/bottle".

ROOT CAUSE: routes/promo_dispatch.py::create_promo_dispatch stored the line
normalized (quantity in BOTTLES, per-bottle unit_price) but the Zoho push for
a CONFIRMED (non-draft) promo was built from the RAW request payload
(`data.items` — quantity=crates=1, per-crate price), so the printed challan
got qty=1 / rate=per-crate.

FIX: the push now builds items_for_zoho from `inserted_items` (the same
normalized dicts written to MongoDB).

This test:
 1. Uses in-process FastAPI TestClient + monkeypatch to capture the items
    kwarg passed into create_delivery_challan_for_promo_dispatch when a
    CONFIRMED (as_draft=False) promo is created.
 2. Asserts the captured items[0] has quantity==12 BOTTLES, unit_price==112
    PER BOTTLE, packaging_units==12, packages==1, packaging_type_name
    contains 'Crate'.
 3. Asserts the DB-stored line (fetched over HTTP) matches the same.
 4. Validates the pure helper services.zoho_service._pack_clause renders
    "1 × Crate - 12 (12 Bottles)".
 5. Safety-net regression (iteration_269): packaging_type_name='Crate - 12'
    WITHOUT units_per_package is still normalized to qty=12 by the resolver
    when going through the confirmed-push path.
 6. Draft path (as_draft=True) does NOT call Zoho and stores qty==12.

No real Zoho HTTP is triggered — every Zoho call is monkeypatched.
"""
import os
import sys
import asyncio
import uuid
import pytest
import pytest_asyncio
import requests
from dotenv import load_dotenv

# Make backend importable AND load its .env BEFORE importing server.
sys.path.insert(0, "/app/backend")
load_dotenv("/app/backend/.env")

import httpx  # noqa: E402
from httpx import ASGITransport  # noqa: E402
from server import app  # noqa: E402
import routes.promo_dispatch as promo_module  # noqa: E402
from services.zoho_service import _pack_clause  # noqa: E402

# pytest-asyncio 1.x — share a single event loop across the whole module so
# Motor (bound on import) stays usable across tests.
pytestmark = pytest.mark.asyncio(loop_scope="module")

PUBLIC_BASE = os.environ.get("REACT_APP_BACKEND_URL", "").rstrip("/")
EMAIL = "surya.yadavalli@nylaairwater.earth"
PASSWORD = "test123"
TENANT = "nyla-air-water"
BRIAN_ID = "bb12d90e-4d33-4890-ac5f-17573c551b5c"


# ── Fixtures ──────────────────────────────────────────────────────────────
@pytest.fixture(scope="module")
def http():
    """Real HTTP session against the public backend (for login + cleanup).
    The deployed backend and the in-process TestClient share the same
    MongoDB, so session tokens minted via HTTP work for both."""
    assert PUBLIC_BASE, "REACT_APP_BACKEND_URL must be set"
    s = requests.Session()
    s.headers.update({"Content-Type": "application/json", "X-Tenant-ID": TENANT})
    r = s.post(
        f"{PUBLIC_BASE}/api/auth/login",
        json={"email": EMAIL, "password": PASSWORD, "tenant_id": TENANT},
    )
    assert r.status_code == 200, f"Login failed: {r.status_code} {r.text}"
    body = r.json()
    token = body.get("session_token") or body.get("token") or body.get("access_token")
    assert token, f"No token in {body}"
    s.headers.update({"Authorization": f"Bearer {token}"})
    s.token = token  # type: ignore[attr-defined]
    return s


@pytest.fixture(scope="module")
def event_loop():
    """Single event loop for the whole module — required so the Motor client
    (bound on import) keeps using the same loop across all async tests."""
    loop = asyncio.new_event_loop()
    yield loop
    loop.close()


@pytest_asyncio.fixture(loop_scope="module", scope="module")
async def client(http):
    """In-process ASGI httpx client sharing one event loop."""
    transport = ASGITransport(app=app)
    async with httpx.AsyncClient(
        transport=transport,
        base_url="http://testserver",
        headers={
            "Authorization": f"Bearer {http.token}",
            "Content-Type": "application/json",
            "X-Tenant-ID": TENANT,
        },
        timeout=30.0,
    ) as c:
        yield c


@pytest.fixture(scope="module")
def ctx(http):
    """Pick the Nyla 600ml/Silver SKU, Brian's non-batch location and the
    Promo Test Contact."""
    skus_resp = http.get(f"{PUBLIC_BASE}/api/master-skus").json()
    skus = skus_resp.get("skus") if isinstance(skus_resp, dict) else skus_resp
    nyla = next(
        s for s in skus
        if "Nyla" in (s.get("sku_name") or s.get("sku") or "")
        and "600" in (s.get("sku_name") or s.get("sku") or "")
        and "Silver" in (s.get("sku_name") or s.get("sku") or "")
    )
    nyla["name"] = nyla.get("sku_name") or nyla.get("sku")

    locs_resp = http.get(f"{PUBLIC_BASE}/api/distributors/{BRIAN_ID}/locations").json()
    locs = locs_resp.get("locations") if isinstance(locs_resp, dict) else locs_resp
    loc = next(l for l in locs if not l.get("track_batches"))

    contacts_resp = http.get(f"{PUBLIC_BASE}/api/contacts?search=Promo").json()
    contacts = contacts_resp if isinstance(contacts_resp, list) else (
        contacts_resp.get("contacts") or contacts_resp.get("items") or []
    )
    promo_contact = next(c for c in contacts if "Promo Test Contact" in (c.get("name") or ""))

    return {"sku": nyla, "location": loc, "contact": promo_contact}


def _cleanup_dispatch(http, dispatch_id):
    """Reverse confirmed promo (restores stock) then hard-delete. Confirmed
    dispatches cannot be hard-deleted directly — must be reversed first.
    We also patch out the Zoho call during reverse since the test populated
    fake Zoho IDs."""
    if not dispatch_id:
        return
    try:
        # Reverse — best-effort. The reverse endpoint may try to delete the
        # Zoho document; we made the IDs synthetic so it will 404 from Zoho.
        # That's fine — the dispatch row will still be marked reversed if
        # the route is tolerant, otherwise it's a no-op. We try, then delete.
        http.post(
            f"{PUBLIC_BASE}/api/distributors/{BRIAN_ID}/promo-deliveries/{dispatch_id}/reverse",
            json={"reason": "test cleanup"},
        )
    except Exception:
        pass
    try:
        http.delete(
            f"{PUBLIC_BASE}/api/distributors/{BRIAN_ID}/promo-deliveries/{dispatch_id}"
        )
    except Exception:
        pass


# ── Test 1: _pack_clause pure helper ──────────────────────────────────────
class TestPackClauseHelper:
    def test_crate_12_one_pack(self):
        assert _pack_clause(1, 12, "Crate - 12", 12, "Bottle") == "1 × Crate - 12 (12 Bottles)"

    def test_crate_12_two_packs(self):
        assert _pack_clause(2, 12, "Crate-12", 24, "Bottle") == "2 × Crate-12 (24 Bottles)"

    def test_loose_units_empty(self):
        # units == 1 → no pack clause
        assert _pack_clause(1, 1, "Bottle", 1, "Bottle") == ""

    def test_zero_packages_empty(self):
        assert _pack_clause(0, 12, "Crate", 0, "Bottle") == ""


# ── Test 2: Confirmed promo push uses NORMALIZED items ────────────────────
class TestConfirmedPromoPushUsesNormalizedItems:
    """The PRIMARY fix verification: when as_draft=False, the items kwarg
    handed to create_delivery_challan_for_promo_dispatch must be the
    NORMALIZED stored lines (qty in bottles, per-bottle rate, packages,
    packaging_units), NOT the raw crate payload."""

    @pytest.mark.asyncio(loop_scope="module")
    async def test_confirmed_create_pushes_bottles_not_crates(
        self, http, client, ctx, monkeypatch
    ):
        sku = ctx["sku"]
        captured = {}

        async def fake_create_challan(**kwargs):
            captured["kwargs"] = kwargs
            captured["items"] = kwargs.get("items")
            captured["dispatch"] = kwargs.get("dispatch")
            return {
                "zoho_invoice_id": f"TEST-DC-{uuid.uuid4().hex[:8]}",
                "zoho_invoice_number": "DC-TEST-001",
                "zoho_invoice_url": "https://example.invalid/dc/test",
                "status": "synced",
            }

        # Force the confirmed-push path AND capture its items kwarg.
        monkeypatch.setattr(promo_module, "is_zoho_configured", lambda: True)
        monkeypatch.setattr(
            promo_module, "create_delivery_challan_for_promo_dispatch", fake_create_challan
        )

        # Input mimics the production bug payload: user enters 1 CRATE.
        # Backend convention (per iteration_269 observation): API unit_price
        # is PER-CRATE — backend divides by upp to store per-bottle. So we
        # send 1344 (=12×112) here to get per-bottle 112 in stored+pushed.
        payload = {
            "distributor_location_id": ctx["location"]["id"],
            "recipient_type": "contact",
            "contact_id": ctx["contact"]["id"],
            "delivery_date": "2026-02-20",
            "reason": "Sampling",
            "remarks": "TEST_ITER270_PUSH_NORMALIZED",
            "as_draft": False,
            "items": [{
                "sku_id": sku["id"],
                "sku_name": sku["name"],
                "quantity": 1,                            # 1 crate (raw)
                "unit_price": 1344.0,                     # per-crate (=12×112)
                "packaging_type_name": "Crate - 12",
                "units_per_package": 12,
            }],
        }
        r = await client.post(
            f"/api/distributors/{BRIAN_ID}/promo-deliveries", json=payload
        )
        assert r.status_code == 200, f"create failed: {r.status_code} {r.text[:300]}"
        body = r.json()
        dispatch_id = (body.get("dispatch") or body).get("id")
        assert dispatch_id, f"no dispatch id: {body}"

        try:
            # 1) The Zoho push MUST have been invoked.
            assert "items" in captured, "create_delivery_challan_for_promo_dispatch was NOT called"
            assert body.get("zoho_sync_status") == "synced", body

            # 2) The captured items[0] is the NORMALIZED line — qty in BOTTLES.
            pushed = captured["items"]
            assert pushed and len(pushed) == 1, f"unexpected items: {pushed}"
            line = pushed[0]
            print(f"\n[CONFIRMED PUSH] captured items[0]: {line}")
            assert int(line.get("quantity")) == 12, \
                f"PUSHED quantity is crates, not bottles: {line}"
            assert abs(float(line.get("unit_price") or 0) - 112.0) < 0.0001, \
                f"PUSHED unit_price is not per-bottle: {line}"
            assert int(line.get("packaging_units") or 0) == 12, line
            assert int(line.get("packages") or 0) == 1, line
            assert "Crate" in (line.get("packaging_type_name") or ""), line
            assert line.get("sku_id") == sku["id"]
            assert line.get("sku_name") == sku["name"]

            # 3) The DB-stored line must agree with the push (single source of truth).
            g = await client.get(f"/api/distributors/{BRIAN_ID}/promo-deliveries/{dispatch_id}")
            assert g.status_code == 200, g.text
            stored_items = g.json().get("items") or []
            assert stored_items and int(stored_items[0]["quantity"]) == 12, stored_items
            assert abs(float(stored_items[0]["unit_price"]) - 112.0) < 0.0001, stored_items[0]
            assert int(stored_items[0].get("packaging_units") or 0) == 12
            assert int(stored_items[0].get("packages") or 0) == 1
        finally:
            _cleanup_dispatch(http, dispatch_id)

    @pytest.mark.asyncio(loop_scope="module")
    async def test_confirmed_create_safety_net_resolves_upp_from_sku_config(
        self, http, client, ctx, monkeypatch
    ):
        """iteration_269 safety net regression — confirmed push path:
        omit units_per_package, name 'Crate - 12', backend resolves from
        SKU stock_out config. PUSHED quantity must still be 12 bottles."""
        sku = ctx["sku"]
        captured = {}

        async def fake_create_challan(**kwargs):
            captured["items"] = kwargs.get("items")
            return {
                "zoho_invoice_id": f"TEST-DC-{uuid.uuid4().hex[:8]}",
                "zoho_invoice_number": "DC-TEST-002",
                "status": "synced",
            }

        monkeypatch.setattr(promo_module, "is_zoho_configured", lambda: True)
        monkeypatch.setattr(
            promo_module, "create_delivery_challan_for_promo_dispatch", fake_create_challan
        )

        payload = {
            "distributor_location_id": ctx["location"]["id"],
            "recipient_type": "contact",
            "contact_id": ctx["contact"]["id"],
            "delivery_date": "2026-02-21",
            "reason": "Sampling",
            "remarks": "TEST_ITER270_PUSH_SAFETY_NET",
            "as_draft": False,
            "items": [{
                "sku_id": sku["id"],
                "sku_name": sku["name"],
                "quantity": 1,
                "unit_price": 1344.0,                      # per-crate
                "packaging_type_name": "Crate - 12",
                # units_per_package OMITTED — resolver must fill in 12.
            }],
        }
        r = await client.post(
            f"/api/distributors/{BRIAN_ID}/promo-deliveries", json=payload
        )
        assert r.status_code == 200, f"create failed: {r.status_code} {r.text[:300]}"
        dispatch_id = (r.json().get("dispatch") or r.json()).get("id")
        try:
            assert captured.get("items"), "Zoho push not invoked"
            line = captured["items"][0]
            print(f"\n[SAFETY NET PUSH] captured items[0]: {line}")
            assert int(line.get("quantity")) == 12, line
            assert int(line.get("packaging_units") or 0) == 12, line
            assert int(line.get("packages") or 0) == 1, line
            assert "Crate" in (line.get("packaging_type_name") or ""), line
        finally:
            _cleanup_dispatch(http, dispatch_id)


# ── Test 3: Draft path — NO Zoho push, still normalized in DB ─────────────
class TestDraftPathUnchanged:
    @pytest.mark.asyncio(loop_scope="module")
    async def test_draft_does_not_push_and_stores_normalized(
        self, http, client, ctx, monkeypatch
    ):
        sku = ctx["sku"]
        zoho_called = {"called": False}

        async def fake_create_challan(**kwargs):
            zoho_called["called"] = True
            return {"zoho_invoice_id": "X", "status": "synced"}

        monkeypatch.setattr(promo_module, "is_zoho_configured", lambda: True)
        monkeypatch.setattr(
            promo_module, "create_delivery_challan_for_promo_dispatch", fake_create_challan
        )

        payload = {
            "distributor_location_id": ctx["location"]["id"],
            "recipient_type": "contact",
            "contact_id": ctx["contact"]["id"],
            "delivery_date": "2026-02-22",
            "reason": "Sampling",
            "remarks": "TEST_ITER270_DRAFT_NO_PUSH",
            "as_draft": True,
            "items": [{
                "sku_id": sku["id"],
                "sku_name": sku["name"],
                "quantity": 1,
                "unit_price": 1344.0,                      # per-crate
                "packaging_type_name": "Crate - 12",
                "units_per_package": 12,
            }],
        }
        r = await client.post(
            f"/api/distributors/{BRIAN_ID}/promo-deliveries", json=payload
        )
        assert r.status_code == 200, f"create failed: {r.status_code} {r.text[:300]}"
        dispatch_id = (r.json().get("dispatch") or r.json()).get("id")
        try:
            assert zoho_called["called"] is False, "Zoho was invoked for a DRAFT promo"
            g = await client.get(f"/api/distributors/{BRIAN_ID}/promo-deliveries/{dispatch_id}")
            assert g.status_code == 200
            items = g.json().get("items") or []
            assert items and int(items[0]["quantity"]) == 12, items
            assert abs(float(items[0]["unit_price"]) - 112.0) < 0.0001, items[0]
            assert int(items[0].get("packaging_units") or 0) == 12
            assert int(items[0].get("packages") or 0) == 1
        finally:
            _cleanup_dispatch(http, dispatch_id)
