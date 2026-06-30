"""Iteration 248 — verify accounting transactions /sync is now non-blocking
(returns within ~5s) and the new /sync/status/{job_id} polling endpoint.
Also re-verifies that list, category-summary, and PATCH /tags still work.
"""
import os
import time
import pytest
import requests
from datetime import datetime, timezone

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "https://crm-accounting-fix.preview.emergentagent.com").rstrip("/")
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
    token = body.get("access_token") or body.get("token") or body.get("session_token")
    assert token, f"No token in login response: {body}"
    return {"Authorization": f"Bearer {token}", "X-Tenant-ID": TENANT,
            "Content-Type": "application/json"}


# ---------- 1) Login sanity ----------
def test_login_works(auth_headers):
    assert "Authorization" in auth_headers


# ---------- 2) THE bug fix: /sync responds fast even without Zoho ----------
def test_sync_responds_under_5_seconds(auth_headers):
    """Critical — endpoint MUST NOT block on Zoho work. In preview Zoho is not
    connected so we expect a 400 with a helpful detail, but the response must
    come back well under 5 seconds (target sub-5s, hard ceiling 10s)."""
    t0 = time.monotonic()
    r = requests.post(
        f"{API}/accounting/transactions/sync",
        params={"date_start": "2026-06-01", "date_end": "2026-06-30"},
        headers=auth_headers, timeout=15,
    )
    elapsed = time.monotonic() - t0
    print(f"/sync responded in {elapsed:.2f}s status={r.status_code} body={r.text[:300]}")
    assert elapsed < 5.0, f"/sync took {elapsed:.2f}s — must be <5s (the bug we're fixing)"
    # Preview env has Zoho not connected → expect 400 with helpful detail
    if r.status_code == 400:
        detail = (r.json() or {}).get("detail", "")
        assert "Zoho Books is not connected" in detail, f"Unexpected 400 detail: {detail}"
    elif r.status_code == 200:
        body = r.json()
        assert "job_id" in body and body.get("status") == "started"
        assert body.get("from") == "2026-06-01"
        assert body.get("to") == "2026-06-30"
    else:
        pytest.fail(f"Unexpected status {r.status_code}: {r.text}")


def test_sync_responds_fast_without_date_params(auth_headers):
    """Same fast-return guarantee without explicit date params."""
    t0 = time.monotonic()
    r = requests.post(f"{API}/accounting/transactions/sync",
                      headers=auth_headers, timeout=15)
    elapsed = time.monotonic() - t0
    print(f"/sync (no params) -> {elapsed:.2f}s status={r.status_code}")
    assert elapsed < 5.0, f"/sync took {elapsed:.2f}s — must be <5s"
    assert r.status_code in (200, 400)


# ---------- 3) Status endpoint: 404 for unknown job ----------
def test_sync_status_unknown_job_returns_404(auth_headers):
    bogus = "00000000-0000-0000-0000-000000000000"
    r = requests.get(f"{API}/accounting/transactions/sync/status/{bogus}",
                     headers=auth_headers, timeout=15)
    assert r.status_code == 404, f"Expected 404, got {r.status_code}: {r.text}"
    body = r.json()
    detail = body.get("detail", "")
    assert "Sync job not found" in detail, f"Unexpected detail: {detail}"


# ---------- 4) Existing list endpoint still works ----------
def test_list_transactions_still_works(auth_headers):
    r = requests.get(f"{API}/accounting/transactions",
                     headers=auth_headers, timeout=30)
    assert r.status_code == 200, f"List failed: {r.status_code} {r.text[:300]}"
    body = r.json()
    assert "items" in body and isinstance(body["items"], list)
    assert "summary" in body
    summary = body["summary"]
    for k in ("untagged", "tagged", "all"):
        assert k in summary, f"Missing summary key {k}"
    assert "total" in body and isinstance(body["total"], int)


# ---------- 5) Existing category-summary still works ----------
def test_category_summary_still_works(auth_headers):
    r = requests.get(f"{API}/accounting/transactions/category-summary",
                     headers=auth_headers, timeout=30)
    assert r.status_code == 200, f"category-summary failed: {r.status_code} {r.text[:300]}"
    body = r.json()
    assert "items" in body and isinstance(body["items"], list)


# ---------- 6) Existing PATCH /tags still works ----------
def test_patch_tags_still_works(auth_headers):
    # find a debit transaction
    r = requests.get(f"{API}/accounting/transactions",
                     params={"direction": "debit", "limit": 5},
                     headers=auth_headers, timeout=30)
    assert r.status_code == 200
    items = r.json().get("items", [])
    if not items:
        pytest.skip("No debit transactions seeded to test PATCH /tags")
    txn_id = items[0]["id"]

    # PATCH with empty selection -> status untagged
    r = requests.patch(f"{API}/accounting/transactions/{txn_id}/tags",
                       json={"tags": {}, "vendor_id": None, "vendor_name": None, "notes": "iteration-248-test"},
                       headers=auth_headers, timeout=30)
    assert r.status_code == 200, f"PATCH /tags failed: {r.status_code} {r.text[:300]}"
    body = r.json()
    assert body.get("status") == "untagged"
    assert body.get("notes") == "iteration-248-test"


# ---------- 7) Bank accounts endpoint still works (smoke) ----------
def test_bank_accounts_endpoint(auth_headers):
    r = requests.get(f"{API}/accounting/transactions/bank-accounts",
                     headers=auth_headers, timeout=15)
    assert r.status_code == 200
    body = r.json()
    assert "items" in body and isinstance(body["items"], list)
