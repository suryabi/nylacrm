"""Iteration 249 — verify the Zoho-401-scope error translator contract.

The background worker (_run_sync) was updated to detect Zoho 401 + code:57
errors (missing ZohoBooks.banking.READ scope) and write a friendly message +
error_kind='zoho_banking_scope' into the sync-job doc. We can't exercise the
worker without real Zoho creds, so we directly seed a fake job doc into
`accounting_txn_sync_jobs` and validate /sync/status returns the expected
contract that the frontend toast relies on.

Also re-verifies all the pre-existing endpoints still respond correctly.
"""
import os
import time
import uuid
from datetime import datetime, timezone
from pathlib import Path

import pytest
import requests
from dotenv import dotenv_values
from pymongo import MongoClient

# Load BASE_URL from frontend/.env (REACT_APP_BACKEND_URL is the public URL)
FRONTEND_ENV = dotenv_values(Path("/app/frontend/.env"))
BASE_URL = (FRONTEND_ENV.get("REACT_APP_BACKEND_URL") or os.environ.get("REACT_APP_BACKEND_URL") or "").rstrip("/")
assert BASE_URL, "REACT_APP_BACKEND_URL must be set"
API = f"{BASE_URL}/api"

# Mongo connection (same as backend's database.py)
BACKEND_ENV = dotenv_values(Path("/app/backend/.env"))
MONGO_URL = BACKEND_ENV.get("MONGO_URL") or os.environ["MONGO_URL"]
DB_NAME = BACKEND_ENV.get("DB_NAME") or os.environ["DB_NAME"]

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
    token = body.get("access_token") or body.get("token") or body.get("session_token")
    assert token, f"No token in login response: {body}"
    return {"Authorization": f"Bearer {token}", "X-Tenant-ID": TENANT,
            "Content-Type": "application/json"}


@pytest.fixture(scope="module")
def mongo_db():
    client = MongoClient(MONGO_URL)
    yield client[DB_NAME]
    client.close()


# ---------- 1) Login sanity ----------
def test_login_works(auth_headers):
    assert "Authorization" in auth_headers


# ---------- 2) Pre-flight gate: /sync still returns 400 fast on preview ----------
def test_sync_returns_400_fast_when_zoho_not_connected(auth_headers):
    t0 = time.monotonic()
    r = requests.post(
        f"{API}/accounting/transactions/sync",
        params={"date_start": "2026-06-01", "date_end": "2026-06-30"},
        headers=auth_headers, timeout=15,
    )
    elapsed = time.monotonic() - t0
    print(f"/sync responded in {elapsed:.2f}s status={r.status_code} body={r.text[:300]}")
    assert elapsed < 5.0, f"/sync took {elapsed:.2f}s — must be sub-5s"
    assert r.status_code == 400, f"Expected 400 (Zoho not connected) but got {r.status_code}: {r.text}"
    detail = (r.json() or {}).get("detail", "")
    assert "Zoho Books is not connected" in detail, f"Unexpected 400 detail: {detail}"


# ---------- 3) Status endpoint regression: 404 for unknown job ----------
def test_sync_status_unknown_job_returns_404(auth_headers):
    bogus = "00000000-0000-0000-0000-000000000000"
    r = requests.get(f"{API}/accounting/transactions/sync/status/{bogus}",
                     headers=auth_headers, timeout=15)
    assert r.status_code == 404, f"Expected 404, got {r.status_code}: {r.text}"
    assert "Sync job not found" in (r.json() or {}).get("detail", "")


# ---------- 4) THE NEW CONTRACT: failed job with error_kind='zoho_banking_scope'
def test_sync_status_returns_friendly_scope_error(auth_headers, mongo_db):
    """Insert a fake failed sync-job doc that mimics what _run_sync writes when
    Zoho returns 401 + code:57, then GET /sync/status/{job_id} and assert the
    contract the FE toast depends on: status='failed', error_kind='zoho_banking_scope',
    a friendly (non-raw-JSON) error message."""
    job_id = str(uuid.uuid4())
    now = datetime.now(timezone.utc).isoformat()
    friendly = (
        "Zoho rejected the request: the connected account is missing the "
        "banking access scope. Open Settings → Integrations → Zoho Books "
        "and reconnect Zoho with the 'Banking' permission, then try again."
    )
    doc = {
        "id": job_id,
        "tenant_id": TENANT,
        "status": "failed",
        "from": "2026-06-01", "to": "2026-06-30",
        "new": 0, "updated": 0,
        "progress": {"page": 0, "new": 0, "updated": 0},
        "started_at": now, "started_by": "test-iter-249",
        "created_at": now, "updated_at": now, "finished_at": now,
        "error": friendly,
        "error_kind": "zoho_banking_scope",
    }
    try:
        mongo_db["accounting_txn_sync_jobs"].insert_one(doc)

        r = requests.get(f"{API}/accounting/transactions/sync/status/{job_id}",
                         headers=auth_headers, timeout=15)
        assert r.status_code == 200, f"Expected 200, got {r.status_code}: {r.text}"
        body = r.json()
        # _id must not leak
        assert "_id" not in body, f"_id leaked in response: {body}"
        # core FE contract
        assert body.get("status") == "failed"
        assert body.get("error_kind") == "zoho_banking_scope"
        assert body.get("error") == friendly
        # ensure raw Zoho JSON is NOT present in the user-visible error
        assert '"code":57' not in body.get("error", "")
        assert "Zoho API 401" not in body.get("error", "")
        # date range echoed
        assert body.get("from") == "2026-06-01"
        assert body.get("to") == "2026-06-30"
        print(f"GET /sync/status returned friendly error: {body.get('error')[:120]}")
    finally:
        mongo_db["accounting_txn_sync_jobs"].delete_one({"id": job_id})


# ---------- 5) Same shape works for non-scope errors (error_kind='other') ----------
def test_sync_status_other_error_kind(auth_headers, mongo_db):
    job_id = str(uuid.uuid4())
    now = datetime.now(timezone.utc).isoformat()
    doc = {
        "id": job_id, "tenant_id": TENANT, "status": "failed",
        "from": "2026-05-01", "to": "2026-05-31",
        "new": 0, "updated": 0,
        "progress": {"page": 2, "new": 5, "updated": 1},
        "started_at": now, "started_by": "test-iter-249",
        "created_at": now, "updated_at": now, "finished_at": now,
        "error": "Some random transient network error",
        "error_kind": "other",
    }
    try:
        mongo_db["accounting_txn_sync_jobs"].insert_one(doc)
        r = requests.get(f"{API}/accounting/transactions/sync/status/{job_id}",
                         headers=auth_headers, timeout=15)
        assert r.status_code == 200
        body = r.json()
        assert body.get("status") == "failed"
        assert body.get("error_kind") == "other"
        assert body.get("error") == "Some random transient network error"
    finally:
        mongo_db["accounting_txn_sync_jobs"].delete_one({"id": job_id})


# ---------- 6) Tenant isolation — another tenant's job must 404 ----------
def test_sync_status_tenant_isolation(auth_headers, mongo_db):
    job_id = str(uuid.uuid4())
    now = datetime.now(timezone.utc).isoformat()
    doc = {
        "id": job_id, "tenant_id": "some-other-tenant", "status": "failed",
        "from": "2026-06-01", "to": "2026-06-30",
        "started_at": now, "created_at": now, "updated_at": now, "finished_at": now,
        "error": "leak check", "error_kind": "zoho_banking_scope",
    }
    try:
        mongo_db["accounting_txn_sync_jobs"].insert_one(doc)
        r = requests.get(f"{API}/accounting/transactions/sync/status/{job_id}",
                         headers=auth_headers, timeout=15)
        assert r.status_code == 404, f"Cross-tenant leak! got {r.status_code}: {r.text}"
    finally:
        mongo_db["accounting_txn_sync_jobs"].delete_one({"id": job_id})


# ---------- 7) Pre-existing regressions ----------
def test_list_transactions(auth_headers):
    r = requests.get(f"{API}/accounting/transactions", headers=auth_headers, timeout=30)
    assert r.status_code == 200, f"List failed: {r.status_code} {r.text[:300]}"
    body = r.json()
    assert "items" in body and isinstance(body["items"], list)
    assert "summary" in body and {"untagged", "tagged", "all"}.issubset(body["summary"].keys())


def test_category_summary(auth_headers):
    r = requests.get(f"{API}/accounting/transactions/category-summary",
                     headers=auth_headers, timeout=30)
    assert r.status_code == 200, f"category-summary failed: {r.status_code} {r.text[:300]}"
    assert isinstance(r.json().get("items"), list)


def test_bank_accounts(auth_headers):
    r = requests.get(f"{API}/accounting/transactions/bank-accounts",
                     headers=auth_headers, timeout=15)
    assert r.status_code == 200
    assert isinstance(r.json().get("items"), list)


def test_export_csv(auth_headers):
    r = requests.get(f"{API}/accounting/transactions/export",
                     params={"format": "csv"}, headers=auth_headers, timeout=60)
    assert r.status_code == 200, f"export failed: {r.status_code} {r.text[:200]}"
    assert "text/csv" in r.headers.get("content-type", "").lower()
    body = r.text
    assert "Transaction ID" in body, "CSV header row missing"


def test_patch_tags_still_works(auth_headers):
    r = requests.get(f"{API}/accounting/transactions",
                     params={"direction": "debit", "limit": 5},
                     headers=auth_headers, timeout=30)
    assert r.status_code == 200
    items = r.json().get("items", [])
    if not items:
        pytest.skip("No debit transactions to test PATCH /tags")
    txn_id = items[0]["id"]
    r = requests.patch(f"{API}/accounting/transactions/{txn_id}/tags",
                       json={"tags": {}, "vendor_id": None, "vendor_name": None,
                             "notes": "iteration-249-test"},
                       headers=auth_headers, timeout=30)
    assert r.status_code == 200, f"PATCH /tags failed: {r.status_code} {r.text[:300]}"
    body = r.json()
    assert body.get("status") == "untagged"
    assert body.get("notes") == "iteration-249-test"


def test_masters_list(auth_headers):
    r = requests.get(f"{API}/accounting/masters", headers=auth_headers, timeout=15)
    assert r.status_code == 200, f"masters failed: {r.status_code} {r.text[:200]}"


def test_vendors_list(auth_headers):
    r = requests.get(f"{API}/accounting/vendors", headers=auth_headers, timeout=15)
    assert r.status_code == 200, f"vendors failed: {r.status_code} {r.text[:200]}"


def test_employees_list(auth_headers):
    r = requests.get(f"{API}/accounting/employees", headers=auth_headers, timeout=15)
    assert r.status_code == 200, f"employees failed: {r.status_code} {r.text[:200]}"
