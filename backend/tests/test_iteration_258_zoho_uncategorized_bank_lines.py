"""Iteration 258 — Tests for the Zoho uncategorized bank-feed sync fix.

PROBLEM (prod): user reported only 53 transactions imported (the categorized /
matched register ones). The many UNCATEGORIZED bank-feed statement lines were
missing. Zoho separates 'register transactions' (GET /banktransactions —
categorized/matched/manually-added) from 'uncategorized statement lines'
(GET /banktransactions/uncategorized?account_id=…). The register endpoint
NEVER returns uncategorized lines.

FIX: zoho_service now has fetch_bank_accounts() and
fetch_uncategorized_bank_transactions(); routes/accounting_transactions._run_sync
pulls BOTH sources, merges them (dedup by Zoho id), client-side window-filters,
records non-fatal warnings, and skips non-bank/credit_card accounts.

Coverage:
  • INTEGRATION (real Mongo, mock Zoho): both sources persisted, job completes,
    out-of-month rows dropped, non-bank accounts skipped, account_name enriched.
  • DEFENSIVE: fetch_bank_accounts failure / per-account uncategorized failure
    is captured in warnings; sync still completes with register rows.
  • UNIT: fetch_uncategorized_bank_transactions and fetch_bank_accounts send the
    correct HTTP path + params to Zoho.
  • REGRESSION: POST /sync returns 400 when Zoho not connected; list /
    flow-summary / export still 2xx.
"""
import os
import sys
import asyncio
import uuid
import requests
import pytest

sys.path.insert(0, "/app/backend")

from services import zoho_service  # noqa: E402
from routes import accounting_transactions as at_routes  # noqa: E402
from database import db  # noqa: E402


def _load_url():
    try:
        with open("/app/frontend/.env") as f:
            for line in f:
                if line.strip().startswith("REACT_APP_BACKEND_URL="):
                    return line.strip().split("=", 1)[1]
    except Exception:
        return None


BASE_URL = (os.environ.get("REACT_APP_BACKEND_URL") or _load_url() or "").rstrip("/")
assert BASE_URL, "REACT_APP_BACKEND_URL must be set"
API = f"{BASE_URL}/api"
TENANT = "nyla-air-water"
EMAIL = "surya.yadavalli@nylaairwater.earth"
PASSWORD = "test123"


# Motor's AsyncIOMotorClient binds to the first event loop it sees, so all
# async tests in this module MUST share one loop — otherwise pytest-asyncio
# closes the loop after the first integration test and motor calls in the
# next test fail with "Event loop is closed". Each async test below uses
# @pytest.mark.asyncio(loop_scope="module") to opt into a module-scoped loop.


@pytest.fixture(scope="module")
def auth_headers():
    r = requests.post(f"{API}/auth/login",
                      json={"email": EMAIL, "password": PASSWORD, "tenant_id": TENANT},
                      timeout=15)
    assert r.status_code == 200, f"Login failed: {r.status_code} {r.text}"
    body = r.json()
    token = body.get("session_token") or body.get("access_token") or body.get("token")
    assert token
    return {"Authorization": f"Bearer {token}", "X-Tenant-ID": TENANT,
            "Content-Type": "application/json"}


# =========================================================================
# UNIT — Zoho service params
# =========================================================================
class TestZohoServiceUncategorizedParams:
    def test_fetch_uncategorized_sends_account_id_page_per_page(self, monkeypatch):
        captured = {}

        async def fake_req(method, path, *, tenant_id, params=None, json=None, **kw):
            captured["method"] = method
            captured["path"] = path
            captured["params"] = dict(params or {})
            return {"banktransactions": [], "page_context": {"has_more_page": False}}

        monkeypatch.setattr(zoho_service, "_zoho_request", fake_req)
        monkeypatch.setattr(zoho_service, "is_zoho_configured", lambda: True)

        asyncio.run(zoho_service.fetch_uncategorized_bank_transactions(
            "t1", "acct-123", date_start="2026-01-01", date_end="2026-01-31",
            page=2, per_page=100,
        ))
        assert captured["method"] == "GET"
        assert captured["path"] == "/books/v3/banktransactions/uncategorized"
        p = captured["params"]
        assert p.get("account_id") == "acct-123"
        assert p.get("page") == 2
        assert p.get("per_page") == 100
        assert p.get("date_start") == "2026-01-01"
        assert p.get("date_end") == "2026-01-31"

    def test_fetch_uncategorized_omits_dates_when_none(self, monkeypatch):
        captured = {}

        async def fake_req(method, path, *, tenant_id, params=None, **kw):
            captured["params"] = dict(params or {})
            return {"banktransactions": [], "page_context": {}}

        monkeypatch.setattr(zoho_service, "_zoho_request", fake_req)
        monkeypatch.setattr(zoho_service, "is_zoho_configured", lambda: True)

        asyncio.run(zoho_service.fetch_uncategorized_bank_transactions("t1", "a1"))
        assert "date_start" not in captured["params"]
        assert "date_end" not in captured["params"]
        assert captured["params"].get("account_id") == "a1"

    def test_fetch_bank_accounts_hits_bankaccounts_endpoint(self, monkeypatch):
        captured = {}

        async def fake_req(method, path, *, tenant_id, params=None, **kw):
            captured["method"] = method
            captured["path"] = path
            captured["params"] = dict(params or {})
            return {"bankaccounts": [{"account_id": "a1", "account_name": "HDFC",
                                      "account_type": "bank"}]}

        monkeypatch.setattr(zoho_service, "_zoho_request", fake_req)
        monkeypatch.setattr(zoho_service, "is_zoho_configured", lambda: True)

        out = asyncio.run(zoho_service.fetch_bank_accounts("t1"))
        assert captured["method"] == "GET"
        assert captured["path"] == "/books/v3/bankaccounts"
        assert out and out[0]["account_id"] == "a1"


# =========================================================================
# INTEGRATION — _run_sync merges register + uncategorized (mock Zoho, real Mongo)
# =========================================================================
@pytest.mark.asyncio(loop_scope="module")
async def test_run_sync_pulls_register_and_uncategorized_and_filters_date_and_account_type(monkeypatch):
    """Cover bullets 1-4:
      • Both sources persisted
      • Out-of-month uncategorized dropped
      • Non-bank/credit_card accounts skipped (no fetch for them)
      • Uncategorized line without account_name gets enriched from acct
    """
    tenant_id = f"TEST_tenant_{uuid.uuid4().hex[:8]}"
    user_id = "TEST_user"
    date_start = "2026-01-01"
    date_end = "2026-01-31"
    job_id = str(uuid.uuid4())

    accounts = [
        {"account_id": "A1", "account_name": "HDFC", "account_type": "bank"},
        {"account_id": "A2", "account_name": "Petty Cash Asset",
         "account_type": "other_current_asset"},  # MUST be skipped
        {"account_id": "A3", "account_name": "ICICI Credit Card",
         "account_type": "credit_card"},
    ]

    # Register source — 1 in-range row
    register_page = [
        {"bank_transaction_id": "reg1", "amount": 100, "date": "2026-01-10",
         "transaction_type": "deposit", "currency_code": "INR",
         "account_id": "A1", "account_name": "HDFC"},
    ]
    # Uncategorized per account
    # A1: 1 in-range without account_name (enrichment), 1 out-of-range (Feb)
    unc_A1 = [
        {"bank_transaction_id": "unc1", "amount": 50, "date": "2026-01-20",
         "currency_code": "INR"},  # no account_name -> should be enriched
        {"bank_transaction_id": "unc2", "amount": 999, "date": "2026-02-05",
         "currency_code": "INR"},  # outside window -> dropped
    ]
    # A3: 1 in-range
    unc_A3 = [
        {"bank_transaction_id": "unc3", "amount": 75, "date": "2026-01-25",
         "currency_code": "INR"},
    ]
    fetched_uncats_for = []

    async def fake_register(tid, ds, de, page=1, per_page=200, status="All"):
        if page == 1:
            return {"transactions": register_page, "has_more": False, "page": 1}
        return {"transactions": [], "has_more": False, "page": page}

    async def fake_bank_accounts(tid):
        return accounts

    async def fake_uncategorized(tid, aid, ds=None, de=None, page=1, per_page=200):
        fetched_uncats_for.append(aid)
        if page > 1:
            return {"transactions": [], "has_more": False, "page": page}
        if aid == "A1":
            return {"transactions": unc_A1, "has_more": False, "page": 1}
        if aid == "A3":
            return {"transactions": unc_A3, "has_more": False, "page": 1}
        return {"transactions": [], "has_more": False, "page": 1}

    async def fake_credentials(tid):
        return {"organization_id": "ORG_258", "tenant_id": tid}

    monkeypatch.setattr(zoho_service, "fetch_bank_transactions", fake_register)
    monkeypatch.setattr(zoho_service, "fetch_bank_accounts", fake_bank_accounts)
    monkeypatch.setattr(zoho_service, "fetch_uncategorized_bank_transactions", fake_uncategorized)
    monkeypatch.setattr(zoho_service, "get_credentials", fake_credentials)

    await db[at_routes.SYNC_JOB_COLL].insert_one({
        "id": job_id, "tenant_id": tenant_id, "status": "running",
        "from": date_start, "to": date_end, "new": 0, "updated": 0,
        "created_at": at_routes._now(), "updated_at": at_routes._now(),
    })

    try:
        await at_routes._run_sync(tenant_id, user_id, date_start, date_end,
                                  explicit_range=True, job_id=job_id)

        rows = await db[at_routes.COLL].find(
            {"tenant_id": tenant_id},
            {"_id": 0, "zoho_transaction_id": 1, "date": 1, "bank_account_name": 1,
             "zoho_account_id": 1},
        ).to_list(100)
        ids = sorted([r["zoho_transaction_id"] for r in rows])

        # Bullet 1: both a register row AND an uncategorized row are present
        assert "reg1" in ids, f"register row missing: {ids}"
        assert "unc1" in ids, f"uncategorized row missing: {ids}"
        assert "unc3" in ids, f"uncategorized row (credit_card acct) missing: {ids}"

        # Bullet 2: out-of-range uncategorized dropped
        assert "unc2" not in ids, f"out-of-range row leaked: {ids}"

        # Bullet 3: non-bank/credit_card account (A2 'other_current_asset') NOT queried
        assert "A2" not in fetched_uncats_for, \
            f"non-bank account fetched: {fetched_uncats_for}"
        assert set(fetched_uncats_for) == {"A1", "A3"}, \
            f"fetched accounts: {fetched_uncats_for}"

        # Bullet 4: enrichment — unc1 had no account_name in raw payload
        unc1_row = next(r for r in rows if r["zoho_transaction_id"] == "unc1")
        assert unc1_row.get("bank_account_name") == "HDFC", \
            f"account_name not enriched: {unc1_row}"
        assert unc1_row.get("zoho_account_id") == "A1", \
            f"account_id not enriched: {unc1_row}"

        # Job completed with both sources in count (3 new rows total)
        job = await db[at_routes.SYNC_JOB_COLL].find_one({"id": job_id}, {"_id": 0})
        assert job["status"] == "completed", f"job: {job}"
        assert job.get("new") == 3, f"new count: {job.get('new')}"
        # no warnings on the happy path
        assert not job.get("warnings"), f"unexpected warnings: {job.get('warnings')}"

    finally:
        await db[at_routes.COLL].delete_many({"tenant_id": tenant_id})
        await db[at_routes.SYNC_JOB_COLL].delete_many({"tenant_id": tenant_id})
        await db["counters"].delete_one({"_id": f"{tenant_id}:accounting_txn"})


# =========================================================================
# DEFENSIVE — fetch_bank_accounts raises => sync completes with register rows only
# =========================================================================
@pytest.mark.asyncio(loop_scope="module")
async def test_run_sync_defensive_when_fetch_bank_accounts_raises(monkeypatch):
    tenant_id = f"TEST_tenant_{uuid.uuid4().hex[:8]}"
    job_id = str(uuid.uuid4())
    date_start, date_end = "2026-01-01", "2026-01-31"

    async def fake_register(tid, ds, de, page=1, per_page=200, status="All"):
        if page == 1:
            return {"transactions": [
                {"bank_transaction_id": "reg-only", "amount": 200, "date": "2026-01-12",
                 "transaction_type": "deposit", "currency_code": "INR"}
            ], "has_more": False, "page": 1}
        return {"transactions": [], "has_more": False, "page": page}

    async def fake_accounts_boom(tid):
        raise RuntimeError("Zoho /bankaccounts 500")

    async def fake_credentials(tid):
        return {"organization_id": "ORG_258", "tenant_id": tid}

    monkeypatch.setattr(zoho_service, "fetch_bank_transactions", fake_register)
    monkeypatch.setattr(zoho_service, "fetch_bank_accounts", fake_accounts_boom)
    monkeypatch.setattr(zoho_service, "get_credentials", fake_credentials)

    await db[at_routes.SYNC_JOB_COLL].insert_one({
        "id": job_id, "tenant_id": tenant_id, "status": "running",
        "from": date_start, "to": date_end, "new": 0, "updated": 0,
        "created_at": at_routes._now(), "updated_at": at_routes._now(),
    })

    try:
        await at_routes._run_sync(tenant_id, "u1", date_start, date_end,
                                  explicit_range=True, job_id=job_id)
        job = await db[at_routes.SYNC_JOB_COLL].find_one({"id": job_id}, {"_id": 0})
        # Sync still completes — register pull not aborted by uncategorized failure
        assert job["status"] == "completed", f"job: {job}"
        assert job.get("new") == 1
        warnings = job.get("warnings") or []
        assert any("bank account" in w.lower() or "uncategorized" in w.lower()
                   for w in warnings), f"expected warning, got: {warnings}"

        rows = await db[at_routes.COLL].find(
            {"tenant_id": tenant_id}, {"_id": 0, "zoho_transaction_id": 1},
        ).to_list(20)
        assert [r["zoho_transaction_id"] for r in rows] == ["reg-only"]
    finally:
        await db[at_routes.COLL].delete_many({"tenant_id": tenant_id})
        await db[at_routes.SYNC_JOB_COLL].delete_many({"tenant_id": tenant_id})
        await db["counters"].delete_one({"_id": f"{tenant_id}:accounting_txn"})


@pytest.mark.asyncio(loop_scope="module")
async def test_run_sync_defensive_when_uncategorized_raises_for_one_account(monkeypatch):
    """Per-account uncategorized failure must NOT abort the register pull or
    block other accounts; warning recorded for the offending account."""
    tenant_id = f"TEST_tenant_{uuid.uuid4().hex[:8]}"
    job_id = str(uuid.uuid4())
    date_start, date_end = "2026-01-01", "2026-01-31"

    accounts = [
        {"account_id": "A1", "account_name": "HDFC", "account_type": "bank"},
        {"account_id": "A2", "account_name": "BadBank", "account_type": "bank"},
    ]

    async def fake_register(tid, ds, de, page=1, per_page=200, status="All"):
        if page == 1:
            return {"transactions": [
                {"bank_transaction_id": "regX", "amount": 10, "date": "2026-01-02",
                 "transaction_type": "deposit", "currency_code": "INR"}
            ], "has_more": False, "page": 1}
        return {"transactions": [], "has_more": False, "page": page}

    async def fake_accounts(tid):
        return accounts

    async def fake_uncat(tid, aid, ds=None, de=None, page=1, per_page=200):
        if aid == "A2":
            raise RuntimeError("Zoho 500 on uncategorized for A2")
        if page == 1 and aid == "A1":
            return {"transactions": [
                {"bank_transaction_id": "uncA1", "amount": 22, "date": "2026-01-15",
                 "currency_code": "INR"}
            ], "has_more": False, "page": 1}
        return {"transactions": [], "has_more": False, "page": page}

    async def fake_credentials(tid):
        return {"organization_id": "ORG_258", "tenant_id": tid}

    monkeypatch.setattr(zoho_service, "fetch_bank_transactions", fake_register)
    monkeypatch.setattr(zoho_service, "fetch_bank_accounts", fake_accounts)
    monkeypatch.setattr(zoho_service, "fetch_uncategorized_bank_transactions", fake_uncat)
    monkeypatch.setattr(zoho_service, "get_credentials", fake_credentials)

    await db[at_routes.SYNC_JOB_COLL].insert_one({
        "id": job_id, "tenant_id": tenant_id, "status": "running",
        "from": date_start, "to": date_end, "new": 0, "updated": 0,
        "created_at": at_routes._now(), "updated_at": at_routes._now(),
    })

    try:
        await at_routes._run_sync(tenant_id, "u1", date_start, date_end,
                                  explicit_range=True, job_id=job_id)
        job = await db[at_routes.SYNC_JOB_COLL].find_one({"id": job_id}, {"_id": 0})
        assert job["status"] == "completed", f"job: {job}"
        # register + A1 uncategorized survived
        assert job.get("new") == 2
        warnings = job.get("warnings") or []
        assert any("BadBank" in w or "A2" in w for w in warnings), \
            f"expected warning mentioning the failed account, got: {warnings}"

        rows = await db[at_routes.COLL].find(
            {"tenant_id": tenant_id}, {"_id": 0, "zoho_transaction_id": 1},
        ).to_list(20)
        ids = sorted(r["zoho_transaction_id"] for r in rows)
        assert ids == ["regX", "uncA1"], f"got: {ids}"
    finally:
        await db[at_routes.COLL].delete_many({"tenant_id": tenant_id})
        await db[at_routes.SYNC_JOB_COLL].delete_many({"tenant_id": tenant_id})
        await db["counters"].delete_one({"_id": f"{tenant_id}:accounting_txn"})


# =========================================================================
# REGRESSION — public endpoints unchanged
# =========================================================================
class TestRegression:
    def test_sync_400_when_zoho_not_connected(self, auth_headers):
        r = requests.post(f"{API}/accounting/transactions/sync",
                          headers=auth_headers,
                          params={"date_start": "2026-01-01", "date_end": "2026-01-31"},
                          timeout=20)
        assert r.status_code == 400, f"{r.status_code} {r.text}"
        detail = (r.json().get("detail") or "").lower()
        assert "zoho" in detail

    def test_list_2xx(self, auth_headers):
        r = requests.get(f"{API}/accounting/transactions",
                         headers=auth_headers, params={"page": 1, "limit": 5}, timeout=20)
        assert r.status_code == 200, f"{r.status_code} {r.text}"
        b = r.json()
        assert "items" in b and "summary" in b

    def test_flow_summary_2xx(self, auth_headers):
        r = requests.get(f"{API}/accounting/transactions/flow-summary",
                         headers=auth_headers, timeout=20)
        assert r.status_code == 200
        b = r.json()
        assert "credit" in b and "debit" in b and "net" in b

    def test_export_csv_2xx(self, auth_headers):
        r = requests.get(f"{API}/accounting/transactions/export",
                         headers=auth_headers, params={"format": "csv"}, timeout=30)
        assert r.status_code == 200
        assert "csv" in r.headers.get("content-type", "").lower()
