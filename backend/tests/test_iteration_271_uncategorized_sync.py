"""Iteration 271 — Zoho bank-transaction sync: uncategorized inbox must NOT be
date-windowed.

Bug: uncategorized statement lines dated OUTSIDE the incremental sync window
were being dropped by the client-side _norm_filter (and the endpoint strategy
that returns has_more=true with 0 rows could spin to the 50-page cap).

Fix (verified here):
  • _norm_filter — only enforces window when date_start/date_end provided.
  • _run_sync — calls fetch_uncategorized_bank_transactions(... None, None ...)
    with ignore_window=True and breaks pagination on an empty page.
"""
import os
import sys
import uuid
import asyncio
from datetime import datetime, timezone, timedelta

import pytest

# make /app/backend importable when pytest runs from /app
sys.path.insert(0, "/app/backend")

pytestmark = pytest.mark.asyncio(loop_scope="module")

from routes import accounting_transactions as at_mod  # noqa: E402
from database import db  # noqa: E402

TEST_ORG_ID = "TESTORG"
TEST_TENANT_ID = f"test-tenant-iter271-{uuid.uuid4().hex[:8]}"
TEST_USER_ID = "test-user-iter271"
ACCT_ID = "A1"


# ------------------------------------------------------------------
# Pure-function tests on _norm_filter (no DB / no async needed)
# ------------------------------------------------------------------

def test_norm_filter_drops_out_of_window_when_window_provided():
    """Row dated OUTSIDE [date_start, date_end] is dropped when a window is set."""
    raw = [{"bank_transaction_id": "OUT1", "date": "2020-01-01", "amount": 100,
            "transaction_type": "deposit", "status": "uncategorized"}]
    docs = at_mod._norm_filter(raw, TEST_TENANT_ID, TEST_ORG_ID,
                               date_start="2026-01-01", date_end="2026-01-31")
    assert docs == [], "row dated 2020-01-01 must be filtered out when window=2026-01"


def test_norm_filter_keeps_row_when_window_is_none():
    """Same out-of-range row is KEPT when both window bounds are None."""
    raw = [{"bank_transaction_id": "OUT1", "date": "2020-01-01", "amount": 100,
            "transaction_type": "deposit", "status": "uncategorized"}]
    docs = at_mod._norm_filter(raw, TEST_TENANT_ID, TEST_ORG_ID,
                               date_start=None, date_end=None)
    assert len(docs) == 1
    assert docs[0]["zoho_transaction_id"] == "OUT1"
    assert docs[0]["zoho_status"] == "uncategorized"


def test_norm_filter_keeps_in_window_row():
    raw = [{"bank_transaction_id": "IN1", "date": "2026-01-15", "amount": 50,
            "transaction_type": "deposit", "status": "categorized"}]
    docs = at_mod._norm_filter(raw, TEST_TENANT_ID, TEST_ORG_ID,
                               date_start="2026-01-01", date_end="2026-01-31")
    assert len(docs) == 1 and docs[0]["zoho_transaction_id"] == "IN1"


# ------------------------------------------------------------------
# _run_sync — monkeypatched, deterministic
# ------------------------------------------------------------------

@pytest.fixture
def cleanup_test_docs():
    """Yield, then delete any docs we inserted for this fake org/tenant."""
    yield
    async def _purge():
        await db[at_mod.COLL].delete_many(
            {"$or": [{"tenant_id": TEST_TENANT_ID}, {"zoho_org_id": TEST_ORG_ID}]})
        await db[at_mod.SYNC_JOB_COLL].delete_many({"tenant_id": TEST_TENANT_ID})
        await db[at_mod.SYNC_COLL].delete_many({"tenant_id": TEST_TENANT_ID})
        await db["counters"].delete_many({"_id": f"{TEST_TENANT_ID}:accounting_txn"})
    try:
        loop = asyncio.get_event_loop()
        if loop.is_running():
            asyncio.ensure_future(_purge())
        else:
            loop.run_until_complete(_purge())
    except Exception:
        pass


async def _purge_now():
    await db[at_mod.COLL].delete_many(
        {"$or": [{"tenant_id": TEST_TENANT_ID}, {"zoho_org_id": TEST_ORG_ID}]})
    await db[at_mod.SYNC_JOB_COLL].delete_many({"tenant_id": TEST_TENANT_ID})
    await db[at_mod.SYNC_COLL].delete_many({"tenant_id": TEST_TENANT_ID})
    await db["counters"].delete_many({"_id": f"{TEST_TENANT_ID}:accounting_txn"})


async def test_run_sync_uncategorized_out_of_window_persisted(monkeypatch):
    """The crux: an uncategorized txn dated OUTSIDE the sync window must STILL
    be persisted, AND the broken endpoint-strategy (empty+has_more=true) must
    NOT spin to the 50-page cap. Also verifies fetch_uncategorized is called
    with date_start=None and date_end=None."""
    await _purge_now()
    try:
        await at_mod.ensure_indexes()

        # Sync window — recent. Our out-of-range uncategorized txn is dated far in the past.
        date_end = datetime.now(timezone.utc).strftime("%Y-%m-%d")
        date_start = (datetime.now(timezone.utc) - timedelta(days=7)).strftime("%Y-%m-%d")
        in_window = date_start  # date_start itself is inside the window

        # Call recorders
        uncat_calls = []           # list of dicts (args/kwargs) per call
        endpoint_call_count = 0
        register_call_count = 0

        # --- monkeypatch zoho_service via the route module's bound reference ---
        async def fake_get_credentials(tenant_id):
            return {"organization_id": TEST_ORG_ID}

        async def fake_fetch_bank_accounts(tenant_id):
            return [{"account_id": ACCT_ID, "account_name": "Test Bank",
                     "account_type": "bank"}]

        async def fake_fetch_bank_transactions(tenant_id, ds=None, de=None, page=1,
                                               per_page=200, status="All"):
            nonlocal register_call_count
            register_call_count += 1
            if page == 1:
                return {"transactions": [{
                    "bank_transaction_id": "REG_IN_1",
                    "transaction_type": "deposit", "status": "categorized",
                    "date": in_window, "amount": 500, "currency_code": "INR",
                    "account_id": ACCT_ID, "account_name": "Test Bank",
                    "payee": "ACME"}], "has_more": False, "page": 1}
            return {"transactions": [], "has_more": False, "page": page}

        async def fake_fetch_uncategorized(tenant_id, account_id, ds=None, de=None,
                                           page=1, per_page=200, strategy="endpoint"):
            nonlocal endpoint_call_count
            uncat_calls.append({"tenant_id": tenant_id, "account_id": account_id,
                                "date_start": ds, "date_end": de,
                                "page": page, "strategy": strategy})
            if strategy == "endpoint":
                endpoint_call_count += 1
                # Simulate the broken endpoint: empty rows but has_more=true.
                return {"transactions": [], "has_more": True, "page": page}
            # strategy == "status": ONE out-of-window uncategorized txn on page 1
            if page == 1:
                return {"transactions": [{
                    "bank_transaction_id": "UNCAT_OUT_1",
                    "transaction_type": None, "status": "uncategorized",
                    "date": "2020-01-01",   # FAR outside the recent window
                    "amount": 999.50, "currency_code": "INR",
                    "debit_or_credit": "credit",
                    "account_id": ACCT_ID, "account_name": "Test Bank",
                    "payee": "Old Statement Line"}],
                    "has_more": False, "page": 1}
            return {"transactions": [], "has_more": False, "page": page}

        monkeypatch.setattr(at_mod.zoho_service, "get_credentials", fake_get_credentials)
        monkeypatch.setattr(at_mod.zoho_service, "fetch_bank_accounts", fake_fetch_bank_accounts)
        monkeypatch.setattr(at_mod.zoho_service, "fetch_bank_transactions", fake_fetch_bank_transactions)
        monkeypatch.setattr(at_mod.zoho_service, "fetch_uncategorized_bank_transactions",
                            fake_fetch_uncategorized)

        # --- run the sync ---
        job_id = str(uuid.uuid4())
        await db[at_mod.SYNC_JOB_COLL].insert_one({
            "id": job_id, "tenant_id": TEST_TENANT_ID, "status": "running",
            "from": date_start, "to": date_end,
            "created_at": at_mod._now(), "updated_at": at_mod._now(),
        })

        await at_mod._run_sync(TEST_TENANT_ID, TEST_USER_ID,
                               date_start, date_end, explicit_range=True,
                               job_id=job_id)

        # --- assertions ---

        # 1) Job should be completed
        job = await db[at_mod.SYNC_JOB_COLL].find_one({"id": job_id}, {"_id": 0})
        assert job["status"] == "completed", f"sync didn't complete: {job}"

        # 2) The out-of-window uncategorized txn must be persisted
        uncat = await db[at_mod.COLL].find_one(
            {"tenant_id": TEST_TENANT_ID, "zoho_transaction_id": "UNCAT_OUT_1"},
            {"_id": 0})
        assert uncat is not None, "Out-of-window uncategorized txn was NOT persisted"
        assert uncat["zoho_status"] == "uncategorized"
        assert uncat["status"] == "untagged"
        assert uncat["zoho_account_id"] == ACCT_ID
        assert uncat["date"] == "2020-01-01"
        assert uncat["zoho_org_id"] == TEST_ORG_ID
        assert uncat["txn_code"] and uncat["txn_code"].startswith("TXN-")

        # 3) The in-window register txn must also be persisted
        reg = await db[at_mod.COLL].find_one(
            {"tenant_id": TEST_TENANT_ID, "zoho_transaction_id": "REG_IN_1"},
            {"_id": 0})
        assert reg is not None, "In-window register txn was NOT persisted"
        assert reg["status"] == "untagged"

        # 4) NO infinite loop on the broken endpoint (empty + has_more=true).
        #    With the fix, _drain should break after the first empty page.
        assert endpoint_call_count == 1, (
            f"endpoint strategy called {endpoint_call_count}x; should break on empty page (==1)")

        # 5) Status-strategy fallback ran (endpoint returned 0 raw rows)
        status_calls = [c for c in uncat_calls if c["strategy"] == "status"]
        assert len(status_calls) >= 1, "status fallback did not run"

        # 6) fetch_uncategorized called with date_start=None and date_end=None
        for c in uncat_calls:
            assert c["date_start"] is None, f"uncategorized called with date_start={c['date_start']!r}"
            assert c["date_end"] is None, f"uncategorized called with date_end={c['date_end']!r}"

        # 7) Register pull still uses the date window (regression).
        #    fake_fetch_bank_transactions doesn't strictly check ds/de but page-1
        #    in-window row IS persisted — confirming window logic still applies
        #    only to the register path. Explicit check: out-of-range register row.
        # (covered by pure-function tests above + reg["date"] == in_window)
        assert reg["date"] == in_window

    finally:
        await _purge_now()


async def test_run_sync_register_out_of_window_dropped(monkeypatch):
    """Regression: register pull (NOT uncategorized) STILL applies the window.
    An out-of-window register row must be dropped."""
    await _purge_now()
    try:
        await at_mod.ensure_indexes()
        date_end = datetime.now(timezone.utc).strftime("%Y-%m-%d")
        date_start = (datetime.now(timezone.utc) - timedelta(days=7)).strftime("%Y-%m-%d")

        async def fake_get_credentials(tenant_id):
            return {"organization_id": TEST_ORG_ID}

        async def fake_fetch_bank_accounts(tenant_id):
            return []   # no accounts -> skip uncategorized branch entirely

        async def fake_fetch_bank_transactions(tenant_id, ds=None, de=None, page=1,
                                               per_page=200, status="All"):
            if page == 1:
                return {"transactions": [{
                    "bank_transaction_id": "REG_OUT_OLD",
                    "transaction_type": "deposit", "status": "categorized",
                    "date": "2019-06-30",  # outside window
                    "amount": 1000, "currency_code": "INR",
                    "account_id": ACCT_ID, "account_name": "Test Bank"}],
                    "has_more": False, "page": 1}
            return {"transactions": [], "has_more": False, "page": page}

        async def fake_fetch_uncategorized(*a, **kw):
            return {"transactions": [], "has_more": False, "page": kw.get("page", 1)}

        monkeypatch.setattr(at_mod.zoho_service, "get_credentials", fake_get_credentials)
        monkeypatch.setattr(at_mod.zoho_service, "fetch_bank_accounts", fake_fetch_bank_accounts)
        monkeypatch.setattr(at_mod.zoho_service, "fetch_bank_transactions", fake_fetch_bank_transactions)
        monkeypatch.setattr(at_mod.zoho_service, "fetch_uncategorized_bank_transactions",
                            fake_fetch_uncategorized)

        job_id = str(uuid.uuid4())
        await db[at_mod.SYNC_JOB_COLL].insert_one({
            "id": job_id, "tenant_id": TEST_TENANT_ID, "status": "running",
            "from": date_start, "to": date_end,
            "created_at": at_mod._now(), "updated_at": at_mod._now()})

        await at_mod._run_sync(TEST_TENANT_ID, TEST_USER_ID,
                               date_start, date_end, explicit_range=True,
                               job_id=job_id)

        # Out-of-window register row must NOT be persisted.
        dropped = await db[at_mod.COLL].find_one(
            {"tenant_id": TEST_TENANT_ID, "zoho_transaction_id": "REG_OUT_OLD"})
        assert dropped is None, "Register pull must still enforce the date window"

        job = await db[at_mod.SYNC_JOB_COLL].find_one({"id": job_id}, {"_id": 0})
        assert job["status"] == "completed"
        assert job.get("new", 0) == 0
    finally:
        await _purge_now()
