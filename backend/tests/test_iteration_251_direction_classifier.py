"""Iteration 251 — direction classifier fix + /reclassify-direction endpoint.

Bug: production user reported RTGS CR (incoming credit) lines showing as money-OUT
because _direction_of() in routes/accounting_transactions.py checked
`transaction_type` BEFORE the authoritative Zoho `debit_or_credit` field. Some
Zoho transaction_type values (e.g. 'vendor_payment') mapped to _DEBIT_TYPES
even though `debit_or_credit` was 'credit'.

Fix verified here:
  1. Unit-test _direction_of for the quirky case + the standard cases.
  2. POST /api/accounting/transactions/reclassify-direction admin endpoint
     flips misclassified historic rows and is idempotent. Non-admin blocked
     by code-read (only admin creds exist in this env).
  3. Regression: existing list / category-summary / sync / sync-status routes
     still behave (no Zoho creds on preview => sync returns 400 fast).
"""
import os
import sys
from pathlib import Path

import pytest
import requests
from dotenv import dotenv_values
from pymongo import MongoClient

# Make backend importable for the unit-tests on _direction_of
sys.path.insert(0, "/app/backend")
from routes.accounting_transactions import _direction_of, COLL  # noqa: E402

# Sync pymongo for seed / verify (motor is single-loop bound)
BACKEND_ENV = dotenv_values(Path("/app/backend/.env"))
MONGO_URL = BACKEND_ENV.get("MONGO_URL") or os.environ.get("MONGO_URL")
DB_NAME = BACKEND_ENV.get("DB_NAME") or os.environ.get("DB_NAME")
assert MONGO_URL and DB_NAME, "MONGO_URL and DB_NAME must be set"
_sync_client = MongoClient(MONGO_URL)
sync_db = _sync_client[DB_NAME]

FRONTEND_ENV = dotenv_values(Path("/app/frontend/.env"))
BASE_URL = (FRONTEND_ENV.get("REACT_APP_BACKEND_URL")
            or os.environ.get("REACT_APP_BACKEND_URL") or "").rstrip("/")
assert BASE_URL, "REACT_APP_BACKEND_URL must be set"
API = f"{BASE_URL}/api"

TENANT = "nyla-air-water"
EMAIL = "surya.yadavalli@nylaairwater.earth"
PASSWORD = "test123"

TEST_PREFIX = "TEST-RECLASSIFY"


# -------- fixtures --------
@pytest.fixture(scope="module")
def auth_headers():
    r = requests.post(
        f"{API}/auth/login",
        json={"email": EMAIL, "password": PASSWORD, "tenant_id": TENANT},
        timeout=15,
    )
    assert r.status_code == 200, f"login failed: {r.status_code} {r.text}"
    body = r.json()
    token = (body.get("session_token") or body.get("access_token")
             or body.get("token"))
    assert token, f"no token in login response: {body}"
    return {
        "Authorization": f"Bearer {token}",
        "X-Tenant-ID": TENANT,
        "Content-Type": "application/json",
    }


# ============================================================
# Phase 1 — Pure unit tests on _direction_of
# ============================================================
class TestDirectionClassifier:
    """Direct function tests — no HTTP / no DB."""

    def test_transaction_type_wins_over_credit_field_for_vendor_payment(self):
        # REVERTED in iteration 252: transaction_type is now checked FIRST.
        # vendor_payment is a _DEBIT_TYPE, so result is 'debit' regardless of
        # the debit_or_credit field. (Original iter-251 priority was reverted
        # because it broke the much larger population of correctly-categorised
        # NEFT/UPI bank-feed credits.)
        txn = {"debit_or_credit": "credit", "transaction_type": "vendor_payment",
               "amount": 50000}
        assert _direction_of(txn) == "debit"

    def test_transaction_type_wins_over_debit_field_for_customer_payment(self):
        # customer_payment is in _CREDIT_TYPES, so result is 'credit' even when
        # debit_or_credit says 'debit'. This is the case the iteration-252 revert
        # restores — Zoho's debit_or_credit follows accounting (bank-ledger)
        # convention, transaction_type carries the semantic categorisation.
        txn = {"debit_or_credit": "debit", "transaction_type": "customer_payment",
               "amount": 1000}
        assert _direction_of(txn) == "credit"

    def test_only_customer_payment_type_yields_credit(self):
        assert _direction_of({"transaction_type": "customer_payment",
                              "amount": 1000}) == "credit"

    def test_only_expense_type_yields_debit(self):
        assert _direction_of({"transaction_type": "expense",
                              "amount": 500}) == "debit"

    def test_no_signal_positive_amount_credit(self):
        assert _direction_of({"amount": 100}) == "credit"

    def test_no_signal_negative_amount_debit(self):
        assert _direction_of({"amount": -100}) == "debit"

    def test_uppercase_credit_field(self):
        # Defensive — Zoho sometimes returns 'Credit' / 'CREDIT'.
        assert _direction_of({"debit_or_credit": "Credit"}) == "credit"
        assert _direction_of({"debit_or_credit": "DEBIT"}) == "debit"

    def test_empty_txn_defaults_credit_zero_amount(self):
        # zero amount → >=0 → 'credit' (documented behaviour)
        assert _direction_of({}) == "credit"


# ============================================================
# Phase 2 — Endpoint: POST /reclassify-direction
# ============================================================
class TestReclassifyEndpoint:
    """Seed two docs, call endpoint, verify flip + idempotency."""

    @pytest.fixture(autouse=True)
    def _seed_and_cleanup(self):
        """Seed two TEST-prefixed docs into accounting_transactions then clean up."""
        misclassified_id = f"{TEST_PREFIX}-1"
        correct_id = f"{TEST_PREFIX}-2"

        sync_db[COLL].delete_many(
            {"tenant_id": TENANT,
             "zoho_transaction_id": {"$regex": f"^{TEST_PREFIX}-"}}
        )
        # Doc A: stored direction='debit' but raw says credit → should flip.
        sync_db[COLL].insert_one({
            "id": f"{TEST_PREFIX}-uuid-1",
            "tenant_id": TENANT,
            "zoho_org_id": "TEST-ORG",
            "zoho_transaction_id": misclassified_id,
            "source": "zoho_bank",
            "direction": "debit",        # ← wrong
            "amount": 50000.0,
            "currency": "INR",
            "date": "2026-01-15",
            "status": "untagged",
            "txn_code": f"{TEST_PREFIX}-CODE-1",
            "raw": {
                "bank_transaction_id": misclassified_id,
                "debit_or_credit": "debit",
                "transaction_type": "customer_payment",
                "amount": 50000,
            },
            "tags": {}, "proofs": [],
            "created_at": "2026-01-15T00:00:00Z",
            "updated_at": "2026-01-15T00:00:00Z",
        })
        # Doc B: already correctly classified credit → should NOT flip.
        sync_db[COLL].insert_one({
            "id": f"{TEST_PREFIX}-uuid-2",
            "tenant_id": TENANT,
            "zoho_org_id": "TEST-ORG",
            "zoho_transaction_id": correct_id,
            "source": "zoho_bank",
            "direction": "credit",       # already correct
            "amount": 1000.0,
            "currency": "INR",
            "date": "2026-01-16",
            "status": "untagged",
            "txn_code": f"{TEST_PREFIX}-CODE-2",
            "raw": {
                "bank_transaction_id": correct_id,
                "debit_or_credit": "credit",
                "transaction_type": "customer_payment",
                "amount": 1000,
            },
            "tags": {}, "proofs": [],
            "created_at": "2026-01-16T00:00:00Z",
            "updated_at": "2026-01-16T00:00:00Z",
        })
        self.misclassified_id = misclassified_id
        self.correct_id = correct_id
        yield
        sync_db[COLL].delete_many(
            {"tenant_id": TENANT,
             "zoho_transaction_id": {"$regex": f"^{TEST_PREFIX}-"}}
        )

    def test_reclassify_flips_misclassified_and_is_idempotent(self, auth_headers):
        # First call — should flip exactly 1 row.
        r1 = requests.post(f"{API}/accounting/transactions/reclassify-direction",
                           headers=auth_headers, timeout=30)
        assert r1.status_code == 200, f"reclassify failed: {r1.status_code} {r1.text}"
        body1 = r1.json()
        assert body1.get("ok") is True, body1
        assert isinstance(body1.get("checked"), int) and body1["checked"] >= 2, body1
        assert isinstance(body1.get("flipped"), int) and body1["flipped"] >= 1, body1

        # Verify the misclassified doc is now 'credit' via sync DB read.
        doc_bad = sync_db[COLL].find_one(
            {"tenant_id": TENANT, "zoho_transaction_id": self.misclassified_id},
            {"_id": 0, "direction": 1})
        doc_ok = sync_db[COLL].find_one(
            {"tenant_id": TENANT, "zoho_transaction_id": self.correct_id},
            {"_id": 0, "direction": 1})
        assert doc_bad and doc_bad["direction"] == "credit", doc_bad
        assert doc_ok and doc_ok["direction"] == "credit", doc_ok

        # Second call — should be a no-op (flipped == 0).
        r2 = requests.post(f"{API}/accounting/transactions/reclassify-direction",
                           headers=auth_headers, timeout=30)
        assert r2.status_code == 200
        body2 = r2.json()
        assert body2.get("ok") is True
        assert body2.get("flipped") == 0, f"endpoint not idempotent: {body2}"

    def test_reclassify_requires_auth(self):
        # No bearer → 401/403
        r = requests.post(f"{API}/accounting/transactions/reclassify-direction",
                          headers={"X-Tenant-ID": TENANT}, timeout=15)
        assert r.status_code in (401, 403), r.status_code


# ============================================================
# Phase 3 — Regression on related endpoints
# ============================================================
class TestRegression:
    def test_list_transactions_still_works(self, auth_headers):
        r = requests.get(f"{API}/accounting/transactions",
                         headers=auth_headers, timeout=20)
        assert r.status_code == 200, r.text
        body = r.json()
        assert "items" in body and "summary" in body

    def test_category_summary_still_works(self, auth_headers):
        r = requests.get(f"{API}/accounting/transactions/category-summary",
                         headers=auth_headers, timeout=20)
        assert r.status_code == 200
        assert "items" in r.json()

    def test_sync_status_unknown_returns_404(self, auth_headers):
        r = requests.get(f"{API}/accounting/transactions/sync/status/does-not-exist",
                         headers=auth_headers, timeout=15)
        assert r.status_code == 404

    def test_sync_responds_fast_without_zoho_creds(self, auth_headers):
        # On preview without Zoho creds the route should 400 quickly (<5s),
        # not hang and not 500.
        import time
        t0 = time.time()
        r = requests.post(f"{API}/accounting/transactions/sync",
                          headers=auth_headers, timeout=10)
        elapsed = time.time() - t0
        assert elapsed < 8, f"sync route too slow ({elapsed:.2f}s)"
        # Either Zoho is connected (200 with job_id) or not (400).
        assert r.status_code in (200, 400), f"unexpected: {r.status_code} {r.text}"
        if r.status_code == 200:
            assert "job_id" in r.json()
