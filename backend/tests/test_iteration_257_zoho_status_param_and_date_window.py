"""Iteration 257 — Tests for the two production bugs:
  (1) zoho_service.fetch_bank_transactions() must now send `status` query param
      (NOT `filter_by`) — using `filter_by=Status.All` causes Zoho /banktransactions
      to return HTTP 400.
  (2) Zoho frequently IGNORES date_start/date_end on /banktransactions, so the
      caller (_run_sync) must enforce the requested [date_start, date_end] window
      CLIENT-SIDE — out-of-month rows must be dropped.

Test coverage:
  • UNIT: fetch_bank_transactions sends status='All' and does NOT send filter_by
  • LOGIC: _date_in_range boundary handling
  • INTEGRATION: _run_sync drops out-of-range rows across multiple pages, real Mongo
  • REGRESSION: POST /sync 400 when Zoho not connected, list/flow-summary/export 2xx
"""
import os
import sys
import asyncio
import uuid
import requests
import pytest

# Make backend importable when running pytest from /app
sys.path.insert(0, "/app/backend")

from services import zoho_service  # noqa: E402
from routes import accounting_transactions as at_routes  # noqa: E402
from database import db  # noqa: E402


def _load_frontend_env_url():
    try:
        with open("/app/frontend/.env", "r") as f:
            for line in f:
                if line.strip().startswith("REACT_APP_BACKEND_URL="):
                    return line.strip().split("=", 1)[1]
    except Exception:
        pass
    return None


BASE_URL = (os.environ.get("REACT_APP_BACKEND_URL") or _load_frontend_env_url() or "").rstrip("/")
assert BASE_URL, "REACT_APP_BACKEND_URL must be set"
API = f"{BASE_URL}/api"
TENANT = "nyla-air-water"
EMAIL = "surya.yadavalli@nylaairwater.earth"
PASSWORD = "test123"


@pytest.fixture(scope="module")
def auth_headers():
    r = requests.post(
        f"{API}/auth/login",
        json={"email": EMAIL, "password": PASSWORD, "tenant_id": TENANT},
        timeout=15,
    )
    assert r.status_code == 200, f"Login failed: {r.status_code} {r.text}"
    body = r.json()
    token = body.get("session_token") or body.get("access_token") or body.get("token")
    assert token, f"No token: {body}"
    return {
        "Authorization": f"Bearer {token}",
        "X-Tenant-ID": TENANT,
        "Content-Type": "application/json",
    }


# =========================================================================
# (1) UNIT — fetch_bank_transactions sends status='All' and NO filter_by
# =========================================================================
class TestFetchBankTransactionsParams:
    """Verify the Zoho query params (the actual production fix)."""

    def test_default_sends_status_All_and_no_filter_by(self, monkeypatch):
        captured = {}

        async def fake_zoho_request(method, path, *, tenant_id, params=None, json=None, **kw):
            captured["method"] = method
            captured["path"] = path
            captured["params"] = dict(params or {})
            return {"banktransactions": [], "page_context": {"has_more_page": False}}

        monkeypatch.setattr(zoho_service, "_zoho_request", fake_zoho_request)
        monkeypatch.setattr(zoho_service, "is_zoho_configured", lambda: True)

        result = asyncio.run(zoho_service.fetch_bank_transactions(
            "t1", date_start="2026-01-01", date_end="2026-01-31", page=1,
        ))

        assert captured["method"] == "GET"
        assert captured["path"] == "/books/v3/banktransactions"
        # CRITICAL: status='All' is sent
        assert captured["params"].get("status") == "All", \
            f"Expected status='All' in params, got {captured['params']}"
        # CRITICAL: filter_by is NOT sent (the bug)
        assert "filter_by" not in captured["params"], \
            f"filter_by must NOT be present (causes 400). Got: {captured['params']}"
        assert captured["params"].get("date_start") == "2026-01-01"
        assert captured["params"].get("date_end") == "2026-01-31"
        assert result == {"transactions": [], "has_more": False, "page": 1}

    def test_status_kwarg_can_be_overridden(self, monkeypatch):
        captured = {}

        async def fake_zoho_request(method, path, *, tenant_id, params=None, json=None, **kw):
            captured["params"] = dict(params or {})
            return {"banktransactions": [], "page_context": {"has_more_page": False}}

        monkeypatch.setattr(zoho_service, "_zoho_request", fake_zoho_request)
        monkeypatch.setattr(zoho_service, "is_zoho_configured", lambda: True)

        asyncio.run(zoho_service.fetch_bank_transactions(
            "t1", date_start=None, date_end=None, status="uncategorized",
        ))
        assert captured["params"].get("status") == "uncategorized"
        assert "filter_by" not in captured["params"]


# =========================================================================
# (2) LOGIC — _date_in_range helper
# =========================================================================
class TestDateInRange:
    def test_in_range_inclusive_boundaries(self):
        assert at_routes._date_in_range("2026-01-01", "2026-01-01", "2026-01-31") is True
        assert at_routes._date_in_range("2026-01-31", "2026-01-01", "2026-01-31") is True
        assert at_routes._date_in_range("2026-01-15", "2026-01-01", "2026-01-31") is True

    def test_before_start_rejected(self):
        assert at_routes._date_in_range("2025-12-31", "2026-01-01", "2026-01-31") is False

    def test_after_end_rejected(self):
        assert at_routes._date_in_range("2026-02-01", "2026-01-01", "2026-01-31") is False

    def test_empty_or_missing_date_rejected(self):
        assert at_routes._date_in_range("", "2026-01-01", "2026-01-31") is False
        assert at_routes._date_in_range(None, "2026-01-01", "2026-01-31") is False

    def test_only_start_only_end(self):
        # only start
        assert at_routes._date_in_range("2026-02-15", "2026-01-01", "") is True
        assert at_routes._date_in_range("2025-12-31", "2026-01-01", "") is False
        # only end
        assert at_routes._date_in_range("2025-12-31", "", "2026-01-31") is True
        assert at_routes._date_in_range("2026-02-01", "", "2026-01-31") is False


# =========================================================================
# (3) INTEGRATION — _run_sync drops out-of-range rows (real Mongo, mock Zoho)
# =========================================================================
@pytest.mark.asyncio
async def test_run_sync_drops_out_of_range_rows(monkeypatch):
    """Simulate Zoho IGNORING date filter: it returns a mix of in-month and
    out-of-month rows across two pages. _run_sync must only persist the
    in-range ones, and the job doc must end status='completed'."""
    tenant_id = f"TEST_tenant_{uuid.uuid4().hex[:8]}"
    user_id = "TEST_user"
    date_start = "2026-01-01"
    date_end = "2026-01-31"
    job_id = str(uuid.uuid4())

    # Page 1: 2 in-range, 1 out-of-range (before), 1 with no date
    page1 = [
        {"bank_transaction_id": "z-in-1",   "amount": 100, "date": "2026-01-05",
         "transaction_type": "deposit", "currency_code": "INR"},
        {"bank_transaction_id": "z-out-pre", "amount": 50, "date": "2025-12-20",
         "transaction_type": "deposit", "currency_code": "INR"},
        {"bank_transaction_id": "z-in-2",   "amount": 200, "date": "2026-01-31",
         "transaction_type": "expense", "currency_code": "INR"},
        {"bank_transaction_id": "z-nodate", "amount": 75,  "date": "",
         "transaction_type": "deposit", "currency_code": "INR"},
    ]
    # Page 2: 1 in-range, 1 out-of-range (after)
    page2 = [
        {"bank_transaction_id": "z-out-post", "amount": 999, "date": "2026-02-15",
         "transaction_type": "deposit", "currency_code": "INR"},
        {"bank_transaction_id": "z-in-3",     "amount": 300, "date": "2026-01-15",
         "transaction_type": "deposit", "currency_code": "INR"},
    ]

    async def fake_fetch(tid, ds, de, page=1, per_page=200, status="All"):
        if page == 1:
            return {"transactions": page1, "has_more": True, "page": 1}
        if page == 2:
            return {"transactions": page2, "has_more": False, "page": 2}
        return {"transactions": [], "has_more": False, "page": page}

    async def fake_get_credentials(tid):
        return {"organization_id": "TEST_ORG_257", "tenant_id": tid}

    monkeypatch.setattr(zoho_service, "fetch_bank_transactions", fake_fetch)
    monkeypatch.setattr(zoho_service, "get_credentials", fake_get_credentials)

    # Pre-seed the sync job doc (the real /sync endpoint does this).
    await db[at_routes.SYNC_JOB_COLL].insert_one({
        "id": job_id, "tenant_id": tenant_id, "status": "running",
        "from": date_start, "to": date_end, "new": 0, "updated": 0,
        "created_at": at_routes._now(), "updated_at": at_routes._now(),
    })

    try:
        await at_routes._run_sync(tenant_id, user_id, date_start, date_end,
                                  explicit_range=True, job_id=job_id)

        # Verify only in-range rows were inserted
        inserted = await db[at_routes.COLL].find(
            {"tenant_id": tenant_id}, {"_id": 0, "zoho_transaction_id": 1, "date": 1},
        ).to_list(100)
        ids = sorted([d["zoho_transaction_id"] for d in inserted])
        assert ids == ["z-in-1", "z-in-2", "z-in-3"], \
            f"Expected only in-range ids, got: {ids}"

        # Out-of-range / no-date rows must NOT be present
        for bad in ("z-out-pre", "z-out-post", "z-nodate"):
            assert bad not in ids, f"Out-of-range row {bad} should have been dropped"

        # Verify all persisted rows fall inside the window
        for d in inserted:
            assert date_start <= d["date"] <= date_end, \
                f"Persisted row outside window: {d}"

        # Verify job doc ended status='completed'
        job = await db[at_routes.SYNC_JOB_COLL].find_one({"id": job_id}, {"_id": 0})
        assert job is not None
        assert job["status"] == "completed", f"Job status: {job}"
        assert job.get("new") == 3, f"new count: {job.get('new')}"

    finally:
        # Cleanup test docs
        await db[at_routes.COLL].delete_many({"tenant_id": tenant_id})
        await db[at_routes.SYNC_JOB_COLL].delete_many({"tenant_id": tenant_id})
        await db["counters"].delete_one({"_id": f"{tenant_id}:accounting_txn"})


# =========================================================================
# (4) REGRESSION — public endpoints still behave correctly
# =========================================================================
class TestBackendRegression:
    def test_sync_returns_400_when_zoho_not_connected(self, auth_headers):
        r = requests.post(
            f"{API}/accounting/transactions/sync",
            headers=auth_headers,
            params={"date_start": "2026-01-01", "date_end": "2026-01-31"},
            timeout=20,
        )
        assert r.status_code == 400, f"Expected 400 (Zoho not connected), got {r.status_code}: {r.text}"
        detail = (r.json().get("detail") or "").lower()
        assert "zoho" in detail and ("not connected" in detail or "connect" in detail), \
            f"Detail not readable: {r.text}"

    def test_list_transactions_2xx(self, auth_headers):
        r = requests.get(f"{API}/accounting/transactions",
                         headers=auth_headers, params={"page": 1, "limit": 5}, timeout=20)
        assert r.status_code == 200, f"{r.status_code} {r.text}"
        body = r.json()
        assert "items" in body and "summary" in body and "total" in body

    def test_flow_summary_2xx(self, auth_headers):
        r = requests.get(f"{API}/accounting/transactions/flow-summary",
                         headers=auth_headers, timeout=20)
        assert r.status_code == 200, f"{r.status_code} {r.text}"
        body = r.json()
        assert "credit" in body and "debit" in body and "net" in body

    def test_export_csv_2xx(self, auth_headers):
        r = requests.get(f"{API}/accounting/transactions/export",
                         headers=auth_headers, params={"format": "csv"}, timeout=30)
        assert r.status_code == 200, f"{r.status_code} {r.text[:200]}"
        ctype = r.headers.get("content-type", "")
        assert "csv" in ctype.lower(), f"Unexpected content-type: {ctype}"
