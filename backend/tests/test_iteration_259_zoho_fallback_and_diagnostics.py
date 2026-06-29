"""Iteration 259 — Tests for the Zoho fallback strategy + diagnostics endpoint.

Coverage:
  • UNIT: zoho_service.fetch_uncategorized_bank_transactions strategy param hits
    the correct path + params for "endpoint" and "status".
  • INTEGRATION (mock Zoho, real Mongo): _run_sync tries strategy="endpoint"
    first; when it returns 0 rows it falls back to strategy="status" and
    persists the strategy-B row alongside the register row. Job completes.
  • INTEGRATION: When BOTH strategies raise, the sync still completes (status
    'completed') with the register rows only, and a human-readable note appears
    in job.warnings.
  • API: GET /api/accounting/transactions/zoho-diagnostics
      - admin: returns 400 "Zoho Books is not connected" in this preview env.
      - unauthenticated: rejected (401/403).
  • REGRESSION: list / flow-summary / export?format=csv 2xx; POST /sync 400.

NOTE: motor's AsyncIOMotorClient binds to the first event loop it sees, so all
async tests in this module use @pytest.mark.asyncio(loop_scope="module") to
share one event loop — same pattern as iteration 258.
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
# UNIT — strategy param routes to correct Zoho path + params
# =========================================================================
class TestStrategyParam:
    def test_strategy_endpoint_uses_dedicated_path(self, monkeypatch):
        captured = {}

        async def fake_req(method, path, *, tenant_id, params=None, **kw):
            captured["method"] = method
            captured["path"] = path
            captured["params"] = dict(params or {})
            return {"banktransactions": [], "page_context": {"has_more_page": False}}

        monkeypatch.setattr(zoho_service, "_zoho_request", fake_req)
        monkeypatch.setattr(zoho_service, "is_zoho_configured", lambda: True)

        asyncio.run(zoho_service.fetch_uncategorized_bank_transactions(
            "t1", "acct-A", strategy="endpoint"))
        assert captured["method"] == "GET"
        assert captured["path"] == "/books/v3/banktransactions/uncategorized"
        assert captured["params"].get("account_id") == "acct-A"
        # strategy=endpoint must NOT set status param
        assert "status" not in captured["params"]

    def test_strategy_status_uses_register_path_with_status_param(self, monkeypatch):
        captured = {}

        async def fake_req(method, path, *, tenant_id, params=None, **kw):
            captured["method"] = method
            captured["path"] = path
            captured["params"] = dict(params or {})
            return {"banktransactions": [], "page_context": {"has_more_page": False}}

        monkeypatch.setattr(zoho_service, "_zoho_request", fake_req)
        monkeypatch.setattr(zoho_service, "is_zoho_configured", lambda: True)

        asyncio.run(zoho_service.fetch_uncategorized_bank_transactions(
            "t1", "acct-B", strategy="status"))
        assert captured["path"] == "/books/v3/banktransactions"
        assert captured["params"].get("account_id") == "acct-B"
        assert captured["params"].get("status") == "uncategorized"

    def test_default_strategy_is_endpoint(self, monkeypatch):
        captured = {}

        async def fake_req(method, path, *, tenant_id, params=None, **kw):
            captured["path"] = path
            captured["params"] = dict(params or {})
            return {"banktransactions": [], "page_context": {}}

        monkeypatch.setattr(zoho_service, "_zoho_request", fake_req)
        monkeypatch.setattr(zoho_service, "is_zoho_configured", lambda: True)

        asyncio.run(zoho_service.fetch_uncategorized_bank_transactions("t1", "a1"))
        assert captured["path"] == "/books/v3/banktransactions/uncategorized"
        assert "status" not in captured["params"]


# =========================================================================
# INTEGRATION — endpoint→status fallback persists strategy-B row
# =========================================================================
@pytest.mark.asyncio(loop_scope="module")
async def test_run_sync_falls_back_to_status_when_endpoint_returns_zero(monkeypatch):
    tenant_id = f"TEST_tenant_{uuid.uuid4().hex[:8]}"
    job_id = str(uuid.uuid4())
    date_start, date_end = "2026-01-01", "2026-01-31"

    accounts = [
        {"account_id": "A1", "account_name": "HDFC", "account_type": "bank"},
    ]
    register_page = [
        {"bank_transaction_id": "reg1", "amount": 100, "date": "2026-01-10",
         "transaction_type": "deposit", "currency_code": "INR",
         "account_id": "A1", "account_name": "HDFC"},
    ]
    # strategy=endpoint -> empty, strategy=status -> one row
    status_row = {
        "bank_transaction_id": "unc-status-1", "amount": 77, "date": "2026-01-22",
        "currency_code": "INR", "account_id": "A1", "account_name": "HDFC"}

    strategies_seen = []

    async def fake_register(tid, ds, de, page=1, per_page=200, status="All"):
        if page == 1:
            return {"transactions": register_page, "has_more": False, "page": 1}
        return {"transactions": [], "has_more": False, "page": page}

    async def fake_accounts(tid):
        return accounts

    async def fake_uncat(tid, aid, ds=None, de=None, page=1, per_page=200,
                         strategy="endpoint"):
        strategies_seen.append(strategy)
        if page > 1:
            return {"transactions": [], "has_more": False, "page": page}
        if strategy == "endpoint":
            return {"transactions": [], "has_more": False, "page": 1}
        if strategy == "status":
            return {"transactions": [status_row], "has_more": False, "page": 1}
        return {"transactions": [], "has_more": False, "page": 1}

    async def fake_credentials(tid):
        return {"organization_id": "ORG_259", "tenant_id": tid}

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

        # Both strategies must be tried in order: endpoint then status
        assert "endpoint" in strategies_seen, f"endpoint not attempted: {strategies_seen}"
        assert "status" in strategies_seen, f"status fallback not attempted: {strategies_seen}"
        assert strategies_seen.index("endpoint") < strategies_seen.index("status"), \
            f"wrong order: {strategies_seen}"

        rows = await db[at_routes.COLL].find(
            {"tenant_id": tenant_id}, {"_id": 0, "zoho_transaction_id": 1},
        ).to_list(50)
        ids = sorted(r["zoho_transaction_id"] for r in rows)
        assert "reg1" in ids, f"register row missing: {ids}"
        assert "unc-status-1" in ids, f"strategy-B row missing: {ids}"

        job = await db[at_routes.SYNC_JOB_COLL].find_one({"id": job_id}, {"_id": 0})
        assert job["status"] == "completed", f"job: {job}"
        assert job.get("new") == 2, f"new count: {job.get('new')}"

    finally:
        await db[at_routes.COLL].delete_many({"tenant_id": tenant_id})
        await db[at_routes.SYNC_JOB_COLL].delete_many({"tenant_id": tenant_id})
        await db["counters"].delete_one({"_id": f"{tenant_id}:accounting_txn"})


@pytest.mark.asyncio(loop_scope="module")
async def test_run_sync_warnings_when_both_strategies_raise(monkeypatch):
    """When both uncategorized strategies raise for an account, the sync must
    still complete with the register row and a readable warning per failure."""
    tenant_id = f"TEST_tenant_{uuid.uuid4().hex[:8]}"
    job_id = str(uuid.uuid4())
    date_start, date_end = "2026-01-01", "2026-01-31"

    accounts = [
        {"account_id": "A1", "account_name": "HDFC", "account_type": "bank"},
    ]

    async def fake_register(tid, ds, de, page=1, per_page=200, status="All"):
        if page == 1:
            return {"transactions": [
                {"bank_transaction_id": "reg-only-259", "amount": 10,
                 "date": "2026-01-05", "transaction_type": "deposit",
                 "currency_code": "INR", "account_id": "A1"}
            ], "has_more": False, "page": 1}
        return {"transactions": [], "has_more": False, "page": page}

    async def fake_accounts(tid):
        return accounts

    async def fake_uncat_boom(tid, aid, ds=None, de=None, page=1, per_page=200,
                              strategy="endpoint"):
        raise RuntimeError(f"Zoho 500 on {strategy}")

    async def fake_credentials(tid):
        return {"organization_id": "ORG_259", "tenant_id": tid}

    monkeypatch.setattr(zoho_service, "fetch_bank_transactions", fake_register)
    monkeypatch.setattr(zoho_service, "fetch_bank_accounts", fake_accounts)
    monkeypatch.setattr(zoho_service, "fetch_uncategorized_bank_transactions", fake_uncat_boom)
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
        assert job.get("new") == 1
        warnings = job.get("warnings") or []
        # Both endpoint and status strategy failures should produce warnings
        joined = " | ".join(warnings).lower()
        assert "endpoint" in joined or "uncategorized" in joined, \
            f"missing endpoint warning: {warnings}"
        assert "status" in joined or len([w for w in warnings if "uncategorized" in w.lower()]) >= 2, \
            f"missing status fallback warning: {warnings}"

        rows = await db[at_routes.COLL].find(
            {"tenant_id": tenant_id}, {"_id": 0, "zoho_transaction_id": 1},
        ).to_list(20)
        assert [r["zoho_transaction_id"] for r in rows] == ["reg-only-259"]
    finally:
        await db[at_routes.COLL].delete_many({"tenant_id": tenant_id})
        await db[at_routes.SYNC_JOB_COLL].delete_many({"tenant_id": tenant_id})
        await db["counters"].delete_one({"_id": f"{tenant_id}:accounting_txn"})


# =========================================================================
# API — diagnostics endpoint (Zoho not connected in preview)
# =========================================================================
class TestDiagnosticsEndpoint:
    def test_diagnostics_admin_returns_400_when_not_connected(self, auth_headers):
        r = requests.get(f"{API}/accounting/transactions/zoho-diagnostics",
                         headers=auth_headers, timeout=20)
        assert r.status_code == 400, f"{r.status_code} {r.text}"
        body = r.json()
        detail = (body.get("detail") or "").lower()
        assert "zoho" in detail and "not connected" in detail, f"detail: {body}"

    def test_diagnostics_unauthenticated_rejected(self):
        r = requests.get(f"{API}/accounting/transactions/zoho-diagnostics",
                         timeout=15)
        # FastAPI auth dep typically returns 401 or 403 when no token present
        assert r.status_code in (401, 403), f"{r.status_code} {r.text}"


# =========================================================================
# REGRESSION — list/flow-summary/export/sync
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
