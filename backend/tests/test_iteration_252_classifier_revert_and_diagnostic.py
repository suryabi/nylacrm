"""Iteration 252 — REVERT of iteration-251 classifier priority + new
admin-only GET /api/accounting/transactions/{item_id}/diagnostic endpoint.

Context:
  Iter-251 reordered _direction_of() to prioritise Zoho's `debit_or_credit`
  over `transaction_type`. That over-corrected a handful of mis-categorised
  rows but mis-flipped the much larger population of correctly-classified
  NEFT/UPI/customer-payment credits (because Zoho's `debit_or_credit` for
  bank-feed lines follows ACCOUNTING convention — money IN -> bank asset
  debited -> 'debit' — whereas the prior code interpreted 'debit' as
  money-out, statement convention).

Fix verified here:
  1. _direction_of unit tests with transaction_type FIRST priority.
  2. New GET /accounting/transactions/{item_id}/diagnostic endpoint
     returns stored raw + currently-classified direction.
  3. 404 for unknown id, requires admin auth.
"""
import os
import sys
from pathlib import Path

import pytest
import requests
from dotenv import dotenv_values
from pymongo import MongoClient

# Make backend importable for unit tests on _direction_of
sys.path.insert(0, "/app/backend")
from routes.accounting_transactions import _direction_of, COLL  # noqa: E402

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
# Phase 1 — Unit tests on _direction_of with REVERTED priority
# ============================================================
class TestDirectionClassifierReverted:
    """transaction_type FIRST, debit_or_credit SECOND (statement convention),
    amount sign last."""

    def test_customer_payment_with_debit_field_returns_credit(self):
        # The production-reported case: bank-feed credit from a customer.
        # Zoho marks debit_or_credit='debit' (bank-ledger asset debited),
        # transaction_type='customer_payment' → must classify as 'credit'.
        assert _direction_of({
            "transaction_type": "customer_payment",
            "debit_or_credit": "debit",
        }) == "credit"

    def test_vendor_payment_with_credit_field_returns_debit(self):
        # Symmetric: vendor payment is money-out.
        assert _direction_of({
            "transaction_type": "vendor_payment",
            "debit_or_credit": "credit",
        }) == "debit"

    def test_deposit_type_only_returns_credit(self):
        assert _direction_of({"transaction_type": "deposit"}) == "credit"

    def test_expense_type_only_returns_debit(self):
        assert _direction_of({"transaction_type": "expense"}) == "debit"

    def test_unknown_type_falls_back_to_credit_field_credit(self):
        assert _direction_of({
            "transaction_type": "unknown_xyz",
            "debit_or_credit": "credit",
        }) == "credit"

    def test_unknown_type_falls_back_to_credit_field_debit(self):
        assert _direction_of({
            "transaction_type": "unknown_xyz",
            "debit_or_credit": "debit",
        }) == "debit"

    def test_no_signals_positive_amount_credit(self):
        assert _direction_of({
            "transaction_type": "",
            "debit_or_credit": "",
            "amount": 100,
        }) == "credit"

    def test_no_signals_negative_amount_debit(self):
        assert _direction_of({
            "transaction_type": "",
            "debit_or_credit": "",
            "amount": -100,
        }) == "debit"


# ============================================================
# Phase 2 — New diagnostic endpoint
# ============================================================
DIAG_ID = "DIAG-TEST-1"
DIAG_TXN_CODE = "TXN-DIAG-1"


class TestDiagnosticEndpoint:
    """Seed a doc with known stored fields + raw, then assert the diagnostic
    endpoint returns the expected shape both by id and by txn_code."""

    @pytest.fixture(autouse=True)
    def _seed_and_cleanup(self):
        sync_db[COLL].delete_many({"tenant_id": TENANT,
                                   "$or": [{"id": DIAG_ID},
                                           {"txn_code": DIAG_TXN_CODE}]})
        sync_db[COLL].insert_one({
            "id": DIAG_ID,
            "tenant_id": TENANT,
            "zoho_org_id": "TEST-ORG-DIAG",
            "zoho_transaction_id": "ZOHO-DIAG-1",
            "source": "zoho_bank",
            "direction": "debit",            # stored (wrong) value
            "amount": 17278.0,
            "currency": "INR",
            "date": "2026-01-20",
            "status": "untagged",
            "txn_code": DIAG_TXN_CODE,
            "raw": {
                "transaction_type": "customer_payment",
                "debit_or_credit": "debit",
                "amount": 17278,
                "description": "NEFT CR-ICIC0SF0002-APARNA INFRAHOUSI...",
                "bank_account_name": "HDFC Current",
            },
            "tags": {}, "proofs": [],
            "created_at": "2026-01-20T00:00:00Z",
            "updated_at": "2026-01-20T00:00:00Z",
        })
        yield
        sync_db[COLL].delete_many({"tenant_id": TENANT,
                                   "$or": [{"id": DIAG_ID},
                                           {"txn_code": DIAG_TXN_CODE}]})

    def _assert_diagnostic_shape(self, body):
        assert body.get("txn_code") == DIAG_TXN_CODE, body
        assert body.get("stored_direction") == "debit", body
        # Reverted classifier: transaction_type='customer_payment' is a credit
        # type → classified_now must be 'credit'.
        assert body.get("classified_now") == "credit", body
        diag = body.get("diagnosis") or {}
        assert diag.get("zoho_transaction_type") == "customer_payment", diag
        assert diag.get("zoho_debit_or_credit") == "debit", diag
        assert diag.get("raw_amount_sign") == "positive", diag
        # raw payload returned
        assert isinstance(body.get("raw"), dict), body
        assert body["raw"].get("transaction_type") == "customer_payment"
        assert body["raw"].get("debit_or_credit") == "debit"

    def test_diagnostic_by_id_returns_expected_shape(self, auth_headers):
        r = requests.get(
            f"{API}/accounting/transactions/{DIAG_ID}/diagnostic",
            headers=auth_headers, timeout=15,
        )
        assert r.status_code == 200, f"{r.status_code} {r.text}"
        self._assert_diagnostic_shape(r.json())

    def test_diagnostic_by_txn_code_returns_expected_shape(self, auth_headers):
        r = requests.get(
            f"{API}/accounting/transactions/{DIAG_TXN_CODE}/diagnostic",
            headers=auth_headers, timeout=15,
        )
        assert r.status_code == 200, f"{r.status_code} {r.text}"
        self._assert_diagnostic_shape(r.json())

    def test_diagnostic_unknown_id_returns_404(self, auth_headers):
        r = requests.get(
            f"{API}/accounting/transactions/NO-SUCH-ID-{os.urandom(4).hex()}/diagnostic",
            headers=auth_headers, timeout=15,
        )
        assert r.status_code == 404, f"{r.status_code} {r.text}"
        body = r.json()
        # FastAPI default: {"detail": "..."}
        assert "not found" in str(body.get("detail", "")).lower(), body

    def test_diagnostic_requires_auth(self):
        r = requests.get(
            f"{API}/accounting/transactions/{DIAG_ID}/diagnostic",
            headers={"X-Tenant-ID": TENANT}, timeout=15,
        )
        # No bearer token at all → 401/403
        assert r.status_code in (401, 403), r.status_code


# ============================================================
# Phase 3 — Regression on related endpoints
# ============================================================
class TestRegression:
    def test_reclassify_direction_still_returns_expected_shape(self, auth_headers):
        r = requests.post(
            f"{API}/accounting/transactions/reclassify-direction",
            headers=auth_headers, timeout=60,
        )
        assert r.status_code == 200, r.text
        body = r.json()
        assert body.get("ok") is True, body
        assert isinstance(body.get("checked"), int), body
        assert isinstance(body.get("flipped"), int), body
        first_flipped = body["flipped"]

        # Second call must not flip more rows than the first
        r2 = requests.post(
            f"{API}/accounting/transactions/reclassify-direction",
            headers=auth_headers, timeout=60,
        )
        assert r2.status_code == 200
        body2 = r2.json()
        assert body2.get("flipped") <= first_flipped, (
            f"non-idempotent: first={first_flipped}, second={body2.get('flipped')}"
        )

    def test_list_transactions(self, auth_headers):
        r = requests.get(f"{API}/accounting/transactions",
                         headers=auth_headers, timeout=20)
        assert r.status_code == 200, r.text
        body = r.json()
        assert "items" in body and "summary" in body

    def test_flow_summary(self, auth_headers):
        r = requests.get(f"{API}/accounting/transactions/flow-summary",
                         headers=auth_headers, timeout=20)
        assert r.status_code == 200, r.text
        body = r.json()
        assert "credit" in body and "debit" in body and "net" in body

    def test_category_summary(self, auth_headers):
        r = requests.get(f"{API}/accounting/transactions/category-summary",
                         headers=auth_headers, timeout=20)
        assert r.status_code == 200
        assert "items" in r.json()

    def test_sync_status_unknown_returns_404(self, auth_headers):
        r = requests.get(
            f"{API}/accounting/transactions/sync/status/does-not-exist",
            headers=auth_headers, timeout=15,
        )
        assert r.status_code == 404

    def test_sync_responds_fast(self, auth_headers):
        import time
        t0 = time.time()
        r = requests.post(f"{API}/accounting/transactions/sync",
                          headers=auth_headers, timeout=10)
        elapsed = time.time() - t0
        assert elapsed < 8, f"sync route too slow ({elapsed:.2f}s)"
        assert r.status_code in (200, 400), f"unexpected: {r.status_code} {r.text}"
