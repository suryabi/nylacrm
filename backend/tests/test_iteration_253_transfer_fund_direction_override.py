"""Iteration 253 — transfer_fund / intra_account_transfer fall-through + manual
direction-override endpoint.

Background:
  Production reported a Zoho transfer (transaction_type='transfer_fund') from
  'Director loan Vamshi Krishna Bommena' INTO 'Madapur Warehouse' showing as
  money-OUT for Madapur even though for Madapur it's money-IN. Root cause:
  _DEBIT_TYPES allowlist contained 'transfer_fund', but a transfer is inherently
  directional per account.

Fix verified here:
  1. _direction_of: 'transfer_fund' / 'intra_account_transfer' fall through to
     debit_or_credit (statement convention).
  2. PATCH /api/accounting/transactions/{id}/direction-override: credit / debit /
     auto + validation + 404 + auth gate.
  3. Override survives re-sync: /reclassify-direction must NOT flip a row that
     has direction_override set.
  4. Diagnostic endpoint still works.
  5. Regression: sync / sync-status / list / category-summary / flow-summary /
     export / reclassify-direction still respond as before.
"""
import os
import sys
import time
from pathlib import Path

import pytest
import requests
from dotenv import dotenv_values
from pymongo import MongoClient

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
TEST_PREFIX = "TEST-ITER253"


@pytest.fixture(scope="module")
def auth_headers():
    r = requests.post(
        f"{API}/auth/login",
        json={"email": EMAIL, "password": PASSWORD, "tenant_id": TENANT},
        timeout=20,
    )
    assert r.status_code == 200, f"login failed: {r.status_code} {r.text}"
    body = r.json()
    token = body.get("session_token") or body.get("access_token") or body.get("token")
    assert token, body
    return {
        "Authorization": f"Bearer {token}",
        "X-Tenant-ID": TENANT,
        "Content-Type": "application/json",
    }


# ============================================================
# Phase 1 — Pure unit tests on _direction_of (new allowlist)
# ============================================================
class TestDirectionClassifierTransferFund:
    """transfer_fund / intra_account_transfer must NOT be in the allowlists;
    they should fall through to debit_or_credit (statement convention)."""

    def test_transfer_fund_with_credit_field_yields_credit(self):
        # Madapur Warehouse's perspective on the prod-reported transfer.
        # PRE-FIX: this returned 'debit' (transfer_fund was in _DEBIT_TYPES).
        # POST-FIX: falls through -> 'credit'.
        assert _direction_of({
            "transaction_type": "transfer_fund",
            "debit_or_credit": "credit",
            "amount": 100000,
        }) == "credit"

    def test_transfer_fund_with_debit_field_yields_debit(self):
        # Source-side (Director-loan account) on the same transfer.
        assert _direction_of({
            "transaction_type": "transfer_fund",
            "debit_or_credit": "debit",
            "amount": 100000,
        }) == "debit"

    def test_intra_account_transfer_with_credit_field_yields_credit(self):
        assert _direction_of({
            "transaction_type": "intra_account_transfer",
            "debit_or_credit": "credit",
            "amount": 5000,
        }) == "credit"

    def test_intra_account_transfer_with_debit_field_yields_debit(self):
        assert _direction_of({
            "transaction_type": "intra_account_transfer",
            "debit_or_credit": "debit",
            "amount": 5000,
        }) == "debit"

    # Unambiguous types should still classify correctly.
    def test_customer_payment_yields_credit(self):
        assert _direction_of({"transaction_type": "customer_payment", "amount": 1}) == "credit"

    def test_vendor_payment_yields_debit(self):
        assert _direction_of({"transaction_type": "vendor_payment", "amount": 1}) == "debit"

    def test_deposit_yields_credit(self):
        assert _direction_of({"transaction_type": "deposit", "amount": 1}) == "credit"

    def test_expense_yields_debit(self):
        assert _direction_of({"transaction_type": "expense", "amount": 1}) == "debit"

    def test_unknown_positive_amount_yields_credit(self):
        assert _direction_of({"transaction_type": "unknown_xyz", "amount": 100}) == "credit"

    def test_unknown_only_debit_field_yields_debit(self):
        assert _direction_of({"debit_or_credit": "debit"}) == "debit"


# ============================================================
# Phase 2 — PATCH /direction-override endpoint behaviour
# ============================================================
class TestDirectionOverrideEndpoint:
    """Seed a row, set credit/auto/debit overrides, verify DB + validation."""

    @pytest.fixture(autouse=True)
    def _seed_and_cleanup(self):
        uid = f"{TEST_PREFIX}-OV-uuid-1"
        zid = f"{TEST_PREFIX}-OV-1"
        sync_db[COLL].delete_many(
            {"tenant_id": TENANT,
             "zoho_transaction_id": {"$regex": f"^{TEST_PREFIX}-"}}
        )
        sync_db[COLL].insert_one({
            "id": uid,
            "tenant_id": TENANT,
            "zoho_org_id": "TEST-ORG",
            "zoho_transaction_id": zid,
            "source": "zoho_bank",
            # The raw payload says 'transfer_fund' + debit (so 'auto'
            # classification will yield 'debit'). The override workflow is
            # what we're testing here, so the seed direction starts as 'debit'.
            "direction": "debit",
            "amount": 100000.0,
            "currency": "INR",
            "date": "2026-01-15",
            "status": "untagged",
            "txn_code": f"{TEST_PREFIX}-OV-CODE-1",
            "raw": {
                "bank_transaction_id": zid,
                "transaction_type": "transfer_fund",
                "debit_or_credit": "debit",
                "amount": 100000,
            },
            "tags": {}, "proofs": [],
            "created_at": "2026-01-15T00:00:00Z",
            "updated_at": "2026-01-15T00:00:00Z",
        })
        self.uid = uid
        self.zid = zid
        yield
        sync_db[COLL].delete_many(
            {"tenant_id": TENANT,
             "zoho_transaction_id": {"$regex": f"^{TEST_PREFIX}-"}}
        )

    def _patch(self, headers, direction, item_id=None):
        item_id = item_id or self.uid
        return requests.patch(
            f"{API}/accounting/transactions/{item_id}/direction-override",
            headers=headers, json={"direction": direction}, timeout=15,
        )

    def test_set_override_credit_then_auto_then_debit(self, auth_headers):
        # 1) credit
        r = self._patch(auth_headers, "credit")
        assert r.status_code == 200, r.text
        body = r.json()
        assert body.get("ok") is True
        assert body.get("direction") == "credit"
        assert body.get("override") == "credit"
        doc = sync_db[COLL].find_one(
            {"id": self.uid, "tenant_id": TENANT},
            {"_id": 0, "direction": 1, "direction_override": 1},
        )
        assert doc["direction"] == "credit"
        assert doc["direction_override"] == "credit"

        # 2) auto -> override cleared, direction recomputed from raw (transfer_fund + debit)
        r2 = self._patch(auth_headers, "auto")
        assert r2.status_code == 200, r2.text
        body2 = r2.json()
        assert body2.get("ok") is True
        assert body2.get("override") in (None,)
        # raw says transfer_fund + debit_or_credit=debit -> 'debit' under new logic
        assert body2.get("direction") == "debit"
        doc2 = sync_db[COLL].find_one(
            {"id": self.uid, "tenant_id": TENANT},
            {"_id": 0, "direction": 1, "direction_override": 1},
        )
        assert doc2["direction"] == "debit"
        # direction_override should be UNSET (not present in doc)
        assert "direction_override" not in doc2, f"override not cleared: {doc2}"

        # 3) debit
        r3 = self._patch(auth_headers, "debit")
        assert r3.status_code == 200
        body3 = r3.json()
        assert body3.get("direction") == "debit"
        assert body3.get("override") == "debit"
        doc3 = sync_db[COLL].find_one(
            {"id": self.uid, "tenant_id": TENANT},
            {"_id": 0, "direction": 1, "direction_override": 1},
        )
        assert doc3["direction_override"] == "debit"

    def test_invalid_direction_value_returns_400(self, auth_headers):
        r = self._patch(auth_headers, "sideways")
        assert r.status_code == 400, r.text
        detail = (r.json() or {}).get("detail", "")
        assert "credit" in detail and "debit" in detail and "auto" in detail, detail

    def test_unknown_id_returns_404(self, auth_headers):
        r = self._patch(auth_headers, "credit", item_id="this-id-does-not-exist-xyz")
        assert r.status_code == 404, r.text

    def test_unauthenticated_returns_401_or_403(self):
        r = requests.patch(
            f"{API}/accounting/transactions/{self.uid}/direction-override",
            headers={"X-Tenant-ID": TENANT, "Content-Type": "application/json"},
            json={"direction": "credit"}, timeout=15,
        )
        assert r.status_code in (401, 403), r.status_code


# ============================================================
# Phase 3 — Override survives /reclassify-direction
# ============================================================
class TestOverrideSurvivesReclassify:
    """Seeded row: raw says expense+debit (would auto-classify as 'debit').
    User overrides to 'credit'. /reclassify-direction must NOT flip back."""

    @pytest.fixture(autouse=True)
    def _seed_and_cleanup(self):
        uid = f"{TEST_PREFIX}-RSY-uuid-1"
        zid = f"{TEST_PREFIX}-Z-RESYNC-1"
        sync_db[COLL].delete_many(
            {"tenant_id": TENANT,
             "zoho_transaction_id": {"$regex": f"^{TEST_PREFIX}-"}}
        )
        sync_db[COLL].insert_one({
            "id": uid,
            "tenant_id": TENANT,
            "zoho_org_id": "TEST-ORG",
            "zoho_transaction_id": zid,
            "source": "zoho_bank",
            "direction": "debit",
            "amount": 500.0,
            "currency": "INR",
            "date": "2026-01-17",
            "status": "untagged",
            "txn_code": f"{TEST_PREFIX}-RSY-CODE-1",
            "raw": {
                "bank_transaction_id": zid,
                "transaction_type": "expense",
                "debit_or_credit": "debit",
                "amount": 500,
            },
            "tags": {}, "proofs": [],
            "created_at": "2026-01-17T00:00:00Z",
            "updated_at": "2026-01-17T00:00:00Z",
        })
        self.uid = uid
        self.zid = zid
        yield
        sync_db[COLL].delete_many(
            {"tenant_id": TENANT,
             "zoho_transaction_id": {"$regex": f"^{TEST_PREFIX}-"}}
        )

    def test_override_credit_is_preserved_after_reclassify(self, auth_headers):
        # Override -> credit
        r = requests.patch(
            f"{API}/accounting/transactions/{self.uid}/direction-override",
            headers=auth_headers, json={"direction": "credit"}, timeout=15,
        )
        assert r.status_code == 200, r.text

        # Call reclassify — should NOT touch this row's direction.
        r2 = requests.post(f"{API}/accounting/transactions/reclassify-direction",
                           headers=auth_headers, timeout=60)
        assert r2.status_code == 200, r2.text
        assert r2.json().get("ok") is True

        # Verify the row still reads credit + override='credit'
        doc = sync_db[COLL].find_one(
            {"id": self.uid, "tenant_id": TENANT},
            {"_id": 0, "direction": 1, "direction_override": 1},
        )
        assert doc is not None
        assert doc.get("direction") == "credit", f"override not respected: {doc}"
        assert doc.get("direction_override") == "credit", doc


# ============================================================
# Phase 4 — Diagnostic endpoint regression
# ============================================================
class TestDiagnosticRegression:
    @pytest.fixture(autouse=True)
    def _seed_and_cleanup(self):
        uid = f"{TEST_PREFIX}-DIAG-uuid-1"
        zid = f"{TEST_PREFIX}-DIAG-1"
        code = f"{TEST_PREFIX}-DIAG-CODE-1"
        sync_db[COLL].delete_many(
            {"tenant_id": TENANT,
             "zoho_transaction_id": {"$regex": f"^{TEST_PREFIX}-"}}
        )
        sync_db[COLL].insert_one({
            "id": uid, "tenant_id": TENANT, "zoho_org_id": "TEST-ORG",
            "zoho_transaction_id": zid, "source": "zoho_bank",
            "direction": "credit", "amount": 1000.0, "currency": "INR",
            "date": "2026-01-18", "status": "untagged", "txn_code": code,
            "raw": {"bank_transaction_id": zid, "transaction_type": "customer_payment",
                    "debit_or_credit": "credit", "amount": 1000},
            "tags": {}, "proofs": [],
            "created_at": "2026-01-18T00:00:00Z",
            "updated_at": "2026-01-18T00:00:00Z",
        })
        self.uid = uid
        self.code = code
        yield
        sync_db[COLL].delete_many(
            {"tenant_id": TENANT,
             "zoho_transaction_id": {"$regex": f"^{TEST_PREFIX}-"}}
        )

    def test_diagnostic_by_id(self, auth_headers):
        r = requests.get(f"{API}/accounting/transactions/{self.uid}/diagnostic",
                         headers=auth_headers, timeout=15)
        assert r.status_code == 200, r.text
        body = r.json()
        # Common diagnostic fields the endpoint returns.
        assert "raw" in body or "diagnosis" in body or "stored_direction" in body, body

    def test_diagnostic_by_txn_code(self, auth_headers):
        r = requests.get(f"{API}/accounting/transactions/{self.code}/diagnostic",
                         headers=auth_headers, timeout=15)
        assert r.status_code == 200, r.text

    def test_diagnostic_unknown_id_returns_404(self, auth_headers):
        r = requests.get(f"{API}/accounting/transactions/not-a-real-id/diagnostic",
                         headers=auth_headers, timeout=15)
        assert r.status_code == 404, r.text


# ============================================================
# Phase 5 — Regression on sync / list / summary / export
# ============================================================
class TestRegression:
    def test_list_transactions(self, auth_headers):
        r = requests.get(f"{API}/accounting/transactions",
                         headers=auth_headers, timeout=20)
        assert r.status_code == 200, r.text
        body = r.json()
        assert "items" in body and "summary" in body

    def test_category_summary(self, auth_headers):
        r = requests.get(f"{API}/accounting/transactions/category-summary",
                         headers=auth_headers, timeout=20)
        assert r.status_code == 200

    def test_flow_summary(self, auth_headers):
        r = requests.get(f"{API}/accounting/transactions/flow-summary",
                         headers=auth_headers, timeout=20)
        assert r.status_code == 200
        body = r.json()
        # Expect credit/debit/net keys somewhere in the response
        keys = " ".join(body.keys()) if isinstance(body, dict) else ""
        assert ("credit" in keys.lower()) or ("debit" in keys.lower()) or ("items" in body), body

    def test_export(self, auth_headers):
        r = requests.get(f"{API}/accounting/transactions/export",
                         headers=auth_headers, timeout=30)
        # Should be 200 (CSV/XLSX) — not 5xx.
        assert r.status_code == 200, f"{r.status_code} {r.text[:200]}"

    def test_sync_status_unknown_returns_404(self, auth_headers):
        r = requests.get(f"{API}/accounting/transactions/sync/status/no-such-job",
                         headers=auth_headers, timeout=15)
        assert r.status_code == 404

    def test_sync_responds_fast(self, auth_headers):
        t0 = time.time()
        r = requests.post(f"{API}/accounting/transactions/sync",
                          headers=auth_headers, timeout=10)
        elapsed = time.time() - t0
        assert elapsed < 8, f"sync too slow: {elapsed:.2f}s"
        assert r.status_code in (200, 400), f"{r.status_code} {r.text}"
        if r.status_code == 200:
            assert "job_id" in r.json()

    def test_reclassify_direction_returns_ok(self, auth_headers):
        r = requests.post(f"{API}/accounting/transactions/reclassify-direction",
                          headers=auth_headers, timeout=60)
        assert r.status_code == 200
        body = r.json()
        assert body.get("ok") is True
        assert "checked" in body and "flipped" in body
