"""Iteration 276 — Invoice "Void" endpoint tests.

The POST /api/invoices/{invoice_id}/void endpoint (added in routes/invoices.py
right after delete_invoice) voids an invoice in Zoho Books AND wipes the local
copy so it stops counting in Revenue Analytics / Invoices list / account
totals. CEO/Admin only. Double-confirmation (body.confirmation == 'VOID').
If the Zoho void call fails, the local invoice MUST be left intact.

ALL Zoho-touching tests monkeypatch services.zoho_service.void_invoice — no
real Zoho call is made. Synthetic test invoice docs are inserted directly
into Mongo (tenant nyla-air-water) and cleaned up afterwards.
"""
import os
import sys
import asyncio
import uuid
import pytest
import pytest_asyncio
import requests
from dotenv import load_dotenv

sys.path.insert(0, "/app/backend")
load_dotenv("/app/backend/.env")
load_dotenv("/app/frontend/.env")

import httpx  # noqa: E402
from httpx import ASGITransport  # noqa: E402
from server import app  # noqa: E402
from database import get_db  # noqa: E402
from services import zoho_service as zoho_service_mod  # noqa: E402

pytestmark = pytest.mark.asyncio(loop_scope="module")

PUBLIC_BASE = os.environ.get("REACT_APP_BACKEND_URL", "").rstrip("/")
EMAIL = "surya.yadavalli@nylaairwater.earth"
PASSWORD = "test123"
TENANT = "nyla-air-water"
SEED_ACCOUNT_ID = "d4e2187a-5e7d-4847-902b-b6699ae910fc"  # Empire Restaurant


@pytest.fixture(scope="module")
def event_loop():
    loop = asyncio.new_event_loop()
    yield loop
    loop.close()


@pytest.fixture(scope="module")
def http():
    assert PUBLIC_BASE, "REACT_APP_BACKEND_URL must be set"
    s = requests.Session()
    s.headers.update({"Content-Type": "application/json", "X-Tenant-ID": TENANT})
    r = s.post(
        f"{PUBLIC_BASE}/api/auth/login",
        json={"email": EMAIL, "password": PASSWORD, "tenant_id": TENANT},
    )
    assert r.status_code == 200, f"Login failed: {r.status_code} {r.text}"
    body = r.json()
    token = body.get("session_token") or body.get("token")
    assert token, f"No token in {body}"
    s.headers.update({"Authorization": f"Bearer {token}"})
    s.token = token  # type: ignore[attr-defined]
    return s


@pytest_asyncio.fixture(loop_scope="module", scope="module")
async def client(http):
    """In-process ASGI httpx client sharing the same Mongo as deployed backend."""
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


# ── Helpers ───────────────────────────────────────────────────────────────
async def _insert_synthetic_invoice(*, with_zoho_id=True, gross=12345.67):
    db = get_db()
    inv_id = f"TEST_VOID_{uuid.uuid4().hex[:10]}"
    doc = {
        "id": inv_id,
        "invoice_no": f"TEST/VOID/{inv_id[-6:]}",
        "tenant_id": TENANT,
        "account_uuid": SEED_ACCOUNT_ID,
        "gross_invoice_value": gross,
        "net_invoice_value": gross,
        "credit_note_value": 0.0,
        "outstanding": gross,
        "outstanding_counted": True,
        "status": "matched",
        "synthetic_test_marker": "iteration_276",
    }
    if with_zoho_id:
        doc["zoho_invoice_id"] = f"FAKE_ZOHO_{uuid.uuid4().hex[:8]}"
    await db.invoices.insert_one(doc)
    return doc


async def _delete_synthetic_invoice(inv_id):
    db = get_db()
    await db.invoices.delete_one({"id": inv_id})


async def _get_account_snapshot():
    db = get_db()
    return await db.accounts.find_one(
        {"$or": [{"id": SEED_ACCOUNT_ID}, {"account_id": SEED_ACCOUNT_ID}],
         "tenant_id": TENANT}
    )


async def _restore_account_balance(orig_outstanding):
    """Restore outstanding_balance after a synthetic-decrement test."""
    db = get_db()
    if orig_outstanding is None:
        return
    await db.accounts.update_one(
        {"$or": [{"id": SEED_ACCOUNT_ID}, {"account_id": SEED_ACCOUNT_ID}],
         "tenant_id": TENANT},
        {"$set": {"outstanding_balance": orig_outstanding}},
    )


# ── Test 1: Guard — confirmation must be 'VOID' (400) ──────────────────────
class TestConfirmationGuard:
    @pytest.mark.asyncio(loop_scope="module")
    async def test_wrong_confirmation_returns_400(self, client):
        inv = await _insert_synthetic_invoice()
        try:
            r = await client.post(
                f"/api/invoices/{inv['id']}/void",
                json={"confirmation": "void"},  # lowercase → invalid
            )
            assert r.status_code == 400, f"Got {r.status_code}: {r.text}"
            assert "Type VOID to confirm" in r.json().get("detail", "")

            # Invoice must NOT have been deleted
            db = get_db()
            still_there = await db.invoices.find_one({"id": inv["id"]})
            assert still_there is not None, "Invoice was deleted on failed guard"
        finally:
            await _delete_synthetic_invoice(inv["id"])

    @pytest.mark.asyncio(loop_scope="module")
    async def test_missing_confirmation_returns_422_or_400(self, client):
        inv = await _insert_synthetic_invoice()
        try:
            r = await client.post(f"/api/invoices/{inv['id']}/void", json={})
            # Pydantic missing-field → 422; explicit-empty → 400. Both acceptable.
            assert r.status_code in (400, 422), f"Got {r.status_code}: {r.text}"
        finally:
            await _delete_synthetic_invoice(inv["id"])


# ── Test 2: Non-existent invoice id → 404 ─────────────────────────────────
class TestNotFound:
    @pytest.mark.asyncio(loop_scope="module")
    async def test_unknown_invoice_id_returns_404(self, client):
        r = await client.post(
            "/api/invoices/DOES_NOT_EXIST_xxx/void",
            json={"confirmation": "VOID"},
        )
        assert r.status_code == 404, f"Got {r.status_code}: {r.text}"
        assert r.json().get("detail") == "Invoice not found"


# ── Test 3: Role gate — CEO is allowed (code path exists) ──────────────────
class TestRoleGate:
    """We only have the CEO test account, so we verify the CEO path is allowed
    (does NOT 403) and that the role-check code path exists. A low-priv user
    cannot be safely created here — flagged as 'skip lower-priv branch'."""

    @pytest.mark.asyncio(loop_scope="module")
    async def test_ceo_not_blocked_by_role_check(self, client):
        # Use a known-bad invoice id so we exit via 404 (not 403). If the
        # role gate had rejected the CEO, we would get 403 first.
        r = await client.post(
            "/api/invoices/ROLE_GATE_PROBE_xxx/void",
            json={"confirmation": "VOID"},
        )
        assert r.status_code != 403, (
            f"CEO unexpectedly got 403 from void endpoint: {r.text}"
        )

    def test_role_gate_string_present_in_source(self):
        """Static check: the 403 'Only CEO and Admin can void invoices'
        branch exists in routes/invoices.py."""
        with open("/app/backend/routes/invoices.py") as f:
            src = f.read()
        assert "Only CEO and Admin can void invoices" in src


# ── Test 4: HAPPY PATH — Zoho void mocked to succeed ──────────────────────
class TestHappyPath:
    @pytest.mark.asyncio(loop_scope="module")
    async def test_happy_path_deletes_invoice_and_decrements_outstanding(
        self, client, monkeypatch
    ):
        # Mock Zoho void → async no-op returning True. Patch on the module
        # so the route's `from services.zoho_service import void_invoice`
        # picks it up.
        calls = {"n": 0}

        async def fake_void(tenant_id, zoho_invoice_id):
            calls["n"] += 1
            return True

        monkeypatch.setattr(zoho_service_mod, "void_invoice", fake_void)

        inv = await _insert_synthetic_invoice(with_zoho_id=True, gross=5000.0)
        acct_before = await _get_account_snapshot()
        out_before = (acct_before or {}).get("outstanding_balance") or 0
        orig_out = out_before

        try:
            r = await client.post(
                f"/api/invoices/{inv['id']}/void",
                json={"confirmation": "VOID", "reason": "iter-276 happy path"},
            )
            assert r.status_code == 200, f"Got {r.status_code}: {r.text}"
            body = r.json()
            assert body.get("success") is True
            assert body.get("zoho_voided") is True
            assert calls["n"] == 1, "Mocked Zoho void was not called exactly once"

            # Local doc must be deleted
            db = get_db()
            gone = await db.invoices.find_one({"id": inv["id"]})
            assert gone is None, "Invoice doc was NOT deleted on happy path"

            # Account outstanding decremented by gross
            acct_after = await _get_account_snapshot()
            out_after = (acct_after or {}).get("outstanding_balance") or 0
            assert round(out_before - out_after, 2) == 5000.0, (
                f"Outstanding not decremented: before={out_before} after={out_after}"
            )

            # Aggregates were recalculated (total_* fields exist & numeric)
            for k in (
                "total_gross_invoice_value",
                "total_net_invoice_value",
                "total_credit_note_value",
                "total_outstanding",
                "invoice_count",
            ):
                assert k in acct_after, f"Account missing recalculated field {k}"
        finally:
            # Cleanup: insert was deleted by endpoint; restore outstanding_balance
            await _delete_synthetic_invoice(inv["id"])  # no-op if already gone
            await _restore_account_balance(orig_out)


# ── Test 5: FAILURE PATH — Zoho raises → local doc intact, 502 ─────────────
class TestZohoFailurePath:
    @pytest.mark.asyncio(loop_scope="module")
    async def test_zoho_failure_leaves_local_invoice_intact(
        self, client, monkeypatch
    ):
        async def boom(tenant_id, zoho_invoice_id):
            raise RuntimeError("simulated zoho 500")

        monkeypatch.setattr(zoho_service_mod, "void_invoice", boom)

        inv = await _insert_synthetic_invoice(with_zoho_id=True, gross=777.0)
        acct_before = await _get_account_snapshot()
        out_before = (acct_before or {}).get("outstanding_balance") or 0

        try:
            r = await client.post(
                f"/api/invoices/{inv['id']}/void",
                json={"confirmation": "VOID"},
            )
            assert r.status_code == 502, f"Got {r.status_code}: {r.text}"
            detail = r.json().get("detail", "")
            assert "left intact" in detail.lower(), (
                f"502 detail does not mention 'left intact': {detail}"
            )

            # Invoice must STILL exist
            db = get_db()
            still = await db.invoices.find_one({"id": inv["id"]})
            assert still is not None, "Invoice was deleted despite Zoho failure"

            # Account outstanding must be unchanged
            acct_after = await _get_account_snapshot()
            out_after = (acct_after or {}).get("outstanding_balance") or 0
            assert out_before == out_after, (
                f"Outstanding changed despite Zoho failure: {out_before} -> {out_after}"
            )
        finally:
            await _delete_synthetic_invoice(inv["id"])


# ── Test 6: No zoho_invoice_id → skip Zoho, still delete + recalc ─────────
class TestNoZohoId:
    @pytest.mark.asyncio(loop_scope="module")
    async def test_no_zoho_id_skips_zoho_call(self, client, monkeypatch):
        # If Zoho were called, this would explode the test.
        async def explode(*a, **kw):
            raise AssertionError("Zoho void should NOT be called when no zoho_invoice_id")

        monkeypatch.setattr(zoho_service_mod, "void_invoice", explode)

        inv = await _insert_synthetic_invoice(with_zoho_id=False, gross=999.0)
        acct_before = await _get_account_snapshot()
        out_before = (acct_before or {}).get("outstanding_balance") or 0
        orig_out = out_before

        try:
            r = await client.post(
                f"/api/invoices/{inv['id']}/void",
                json={"confirmation": "VOID"},
            )
            assert r.status_code == 200, f"Got {r.status_code}: {r.text}"
            body = r.json()
            assert body.get("success") is True
            assert body.get("zoho_voided") is False, (
                f"zoho_voided should be False when no zoho_invoice_id: {body}"
            )

            db = get_db()
            gone = await db.invoices.find_one({"id": inv["id"]})
            assert gone is None, "Invoice doc was NOT deleted on no-zoho path"

            acct_after = await _get_account_snapshot()
            out_after = (acct_after or {}).get("outstanding_balance") or 0
            assert round(out_before - out_after, 2) == 999.0, (
                f"Outstanding not decremented: {out_before} -> {out_after}"
            )
        finally:
            await _delete_synthetic_invoice(inv["id"])
            await _restore_account_balance(orig_out)
