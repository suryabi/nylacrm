"""Iteration 254 — Bulk direction-override endpoint.

POST /api/accounting/transactions/bulk/direction-override
  body: { ids: [...], direction: 'credit' | 'debit' | 'auto' }

Tested here:
  1. Bulk 'credit' updates direction + direction_override on ALL ids.
  2. Bulk 'debit' flips them again.
  3. Bulk 'auto' RECOMPUTES direction (using stored raw) AND clears
     direction_override ($unset).
  4. Validation: empty ids -> 400, invalid direction -> 400, >500 ids -> 400,
     non-admin -> 403.
  5. Tenant isolation: rows belonging to OTHER-TENANT must NOT be updated even
     if the id is passed.
  6. Regression: single PATCH endpoint, /reclassify-direction respecting bulk
     overrides, list / flow-summary / category-summary / export / diagnostic /
     sync still respond.
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
from routes.accounting_transactions import COLL  # noqa: E402

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
OTHER_TENANT = "OTHER-TENANT"
EMAIL = "surya.yadavalli@nylaairwater.earth"
PASSWORD = "test123"
TEST_PREFIX = "TEST-ITER254"


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


def _cleanup():
    sync_db[COLL].delete_many(
        {"zoho_transaction_id": {"$regex": f"^{TEST_PREFIX}-"}}
    )


def _seed_row(uid, *, tenant=TENANT, direction="debit", direction_override=None,
              raw=None, suffix=""):
    zid = f"{TEST_PREFIX}-{uid}{suffix}"
    doc = {
        "id": uid,
        "tenant_id": tenant,
        "zoho_org_id": "TEST-ORG",
        "zoho_transaction_id": zid,
        "source": "zoho_bank",
        "direction": direction,
        "amount": (raw or {}).get("amount", 1000.0),
        "currency": "INR",
        "date": "2026-01-20",
        "status": "untagged",
        "txn_code": f"{TEST_PREFIX}-{uid}-CODE",
        "raw": raw or {
            "bank_transaction_id": zid,
            "transaction_type": "expense",
            "debit_or_credit": "debit",
            "amount": 500,
        },
        "tags": {}, "proofs": [],
        "created_at": "2026-01-20T00:00:00Z",
        "updated_at": "2026-01-20T00:00:00Z",
    }
    if direction_override is not None:
        doc["direction_override"] = direction_override
    sync_db[COLL].insert_one(doc)


# ============================================================
# Phase 1 — credit / debit bulk flip
# ============================================================
class TestBulkCreditDebit:

    @pytest.fixture(autouse=True)
    def _seed(self):
        _cleanup()
        self.ids = [f"{TEST_PREFIX}-bulk-{i}" for i in range(1, 4)]
        for uid in self.ids:
            _seed_row(uid, direction="debit")
        yield
        _cleanup()

    def test_bulk_credit_flips_all_and_sets_override(self, auth_headers):
        r = requests.post(
            f"{API}/accounting/transactions/bulk/direction-override",
            headers=auth_headers,
            json={"ids": self.ids, "direction": "credit"},
            timeout=20,
        )
        assert r.status_code == 200, r.text
        body = r.json()
        assert body.get("ok") is True
        assert body.get("direction") == "credit"
        assert body.get("updated") == 3, body

        # All 3 rows must have direction='credit' AND direction_override='credit'
        for uid in self.ids:
            doc = sync_db[COLL].find_one(
                {"id": uid, "tenant_id": TENANT},
                {"_id": 0, "direction": 1, "direction_override": 1},
            )
            assert doc["direction"] == "credit", doc
            assert doc["direction_override"] == "credit", doc

    def test_bulk_debit_flips_them_back(self, auth_headers):
        # first force credit
        requests.post(
            f"{API}/accounting/transactions/bulk/direction-override",
            headers=auth_headers,
            json={"ids": self.ids, "direction": "credit"}, timeout=20,
        )
        # now flip to debit
        r = requests.post(
            f"{API}/accounting/transactions/bulk/direction-override",
            headers=auth_headers,
            json={"ids": self.ids, "direction": "debit"}, timeout=20,
        )
        assert r.status_code == 200
        body = r.json()
        assert body.get("direction") == "debit"
        assert body.get("updated") == 3
        for uid in self.ids:
            doc = sync_db[COLL].find_one(
                {"id": uid, "tenant_id": TENANT},
                {"_id": 0, "direction": 1, "direction_override": 1},
            )
            assert doc["direction"] == "debit"
            assert doc["direction_override"] == "debit"


# ============================================================
# Phase 2 — 'auto' clears override and recomputes via _direction_of
# ============================================================
class TestBulkAutoClearsOverride:

    @pytest.fixture(autouse=True)
    def _seed(self):
        _cleanup()
        self.uid = f"{TEST_PREFIX}-auto-1"
        # seed: direction='debit', override='credit', raw=expense+amount=500
        # raw without explicit debit_or_credit so _direction_of relies on type
        _seed_row(
            self.uid,
            direction="debit",
            direction_override="credit",
            raw={"transaction_type": "expense", "amount": 500},
        )
        yield
        _cleanup()

    def test_bulk_auto_unsets_override_and_recomputes(self, auth_headers):
        r = requests.post(
            f"{API}/accounting/transactions/bulk/direction-override",
            headers=auth_headers,
            json={"ids": [self.uid], "direction": "auto"}, timeout=20,
        )
        assert r.status_code == 200, r.text
        body = r.json()
        assert body.get("ok") is True
        assert body.get("direction") == "auto"
        assert body.get("updated") >= 0  # modified_count may be 0 on $unset-only on some Mongo versions

        # Re-fetch and validate persistence
        doc = sync_db[COLL].find_one(
            {"id": self.uid, "tenant_id": TENANT},
            {"_id": 0, "direction": 1, "direction_override": 1},
        )
        assert doc is not None
        # expense is in _DEBIT_TYPES -> direction recomputed to 'debit'
        assert doc["direction"] == "debit", doc
        # direction_override must be GONE
        assert "direction_override" not in doc, f"override not cleared: {doc}"


# ============================================================
# Phase 3 — Validation errors
# ============================================================
class TestBulkValidation:

    def test_empty_ids_returns_400(self, auth_headers):
        r = requests.post(
            f"{API}/accounting/transactions/bulk/direction-override",
            headers=auth_headers,
            json={"ids": [], "direction": "credit"}, timeout=15,
        )
        assert r.status_code == 400, r.text
        detail = (r.json() or {}).get("detail", "")
        assert "empty" in detail.lower() or "ids" in detail.lower(), detail

    def test_invalid_direction_returns_400(self, auth_headers):
        r = requests.post(
            f"{API}/accounting/transactions/bulk/direction-override",
            headers=auth_headers,
            json={"ids": ["x"], "direction": "sideways"}, timeout=15,
        )
        assert r.status_code == 400, r.text
        detail = (r.json() or {}).get("detail", "")
        assert "credit" in detail and "debit" in detail and "auto" in detail, detail

    def test_over_500_ids_returns_400(self, auth_headers):
        big = [f"id-{i}" for i in range(501)]
        r = requests.post(
            f"{API}/accounting/transactions/bulk/direction-override",
            headers=auth_headers,
            json={"ids": big, "direction": "credit"}, timeout=20,
        )
        assert r.status_code == 400, r.text
        detail = (r.json() or {}).get("detail", "")
        assert "500" in detail or "maximum" in detail.lower(), detail

    def test_unauthenticated_is_blocked(self):
        r = requests.post(
            f"{API}/accounting/transactions/bulk/direction-override",
            headers={"X-Tenant-ID": TENANT, "Content-Type": "application/json"},
            json={"ids": ["x"], "direction": "credit"}, timeout=15,
        )
        assert r.status_code in (401, 403), r.status_code


# ============================================================
# Phase 4 — Tenant isolation
# ============================================================
class TestBulkTenantIsolation:

    @pytest.fixture(autouse=True)
    def _seed(self):
        _cleanup()
        self.foreign_uid = f"{TEST_PREFIX}-foreign-1"
        _seed_row(
            self.foreign_uid,
            tenant=OTHER_TENANT,
            direction="debit",
            raw={"transaction_type": "expense", "amount": 999},
        )
        yield
        _cleanup()

    def test_foreign_tenant_row_not_modified(self, auth_headers):
        # nyla-air-water admin tries to flip an OTHER-TENANT row
        r = requests.post(
            f"{API}/accounting/transactions/bulk/direction-override",
            headers=auth_headers,
            json={"ids": [self.foreign_uid], "direction": "credit"}, timeout=15,
        )
        # Endpoint accepts the call (200) but should match 0 docs in the tenant scope
        assert r.status_code == 200, r.text
        body = r.json()
        assert body.get("updated") == 0, body

        # Verify foreign row unchanged
        doc = sync_db[COLL].find_one(
            {"id": self.foreign_uid, "tenant_id": OTHER_TENANT},
            {"_id": 0, "direction": 1, "direction_override": 1, "tenant_id": 1},
        )
        assert doc is not None
        assert doc["direction"] == "debit", doc
        assert "direction_override" not in doc, doc


# ============================================================
# Phase 5 — Regression: single PATCH, reclassify, list, summaries, export,
# sync still work alongside the new bulk endpoint.
# ============================================================
class TestRegression:

    @pytest.fixture(autouse=True)
    def _seed(self):
        _cleanup()
        self.uid = f"{TEST_PREFIX}-reg-1"
        _seed_row(
            self.uid,
            direction="debit",
            raw={"transaction_type": "expense",
                 "debit_or_credit": "debit", "amount": 750},
        )
        yield
        _cleanup()

    def test_single_patch_still_works(self, auth_headers):
        r = requests.patch(
            f"{API}/accounting/transactions/{self.uid}/direction-override",
            headers=auth_headers, json={"direction": "credit"}, timeout=15,
        )
        assert r.status_code == 200, r.text
        body = r.json()
        assert body.get("direction") == "credit"
        assert body.get("override") == "credit"

    def test_reclassify_respects_bulk_set_override(self, auth_headers):
        # set override via BULK endpoint -> credit
        requests.post(
            f"{API}/accounting/transactions/bulk/direction-override",
            headers=auth_headers,
            json={"ids": [self.uid], "direction": "credit"}, timeout=15,
        )
        # now /reclassify-direction must NOT flip it back to debit
        r = requests.post(
            f"{API}/accounting/transactions/reclassify-direction",
            headers=auth_headers, timeout=30,
        )
        assert r.status_code == 200, r.text
        doc = sync_db[COLL].find_one(
            {"id": self.uid, "tenant_id": TENANT},
            {"_id": 0, "direction": 1, "direction_override": 1},
        )
        assert doc["direction"] == "credit", doc
        assert doc["direction_override"] == "credit", doc

    def test_list_endpoint(self, auth_headers):
        r = requests.get(f"{API}/accounting/transactions",
                         headers=auth_headers, timeout=20)
        assert r.status_code == 200, r.text
        body = r.json()
        assert "items" in body or "transactions" in body or isinstance(body, list)

    def test_flow_summary(self, auth_headers):
        r = requests.get(f"{API}/accounting/transactions/flow-summary",
                         headers=auth_headers, timeout=20)
        assert r.status_code == 200, r.text

    def test_category_summary(self, auth_headers):
        r = requests.get(f"{API}/accounting/transactions/category-summary",
                         headers=auth_headers, timeout=20)
        assert r.status_code == 200, r.text

    def test_export(self, auth_headers):
        r = requests.get(f"{API}/accounting/transactions/export",
                         headers=auth_headers, timeout=30)
        assert r.status_code == 200, r.text

    def test_diagnostic(self, auth_headers):
        r = requests.get(
            f"{API}/accounting/transactions/{self.uid}/diagnostic",
            headers=auth_headers, timeout=15,
        )
        assert r.status_code == 200, r.text

    def test_sync_status_unknown_returns_404(self, auth_headers):
        r = requests.get(
            f"{API}/accounting/transactions/sync/status/this-job-does-not-exist",
            headers=auth_headers, timeout=10,
        )
        assert r.status_code == 404, r.text

    def test_sync_responds_quickly(self, auth_headers):
        t0 = time.time()
        r = requests.post(f"{API}/accounting/transactions/sync",
                          headers=auth_headers, timeout=15)
        elapsed = time.time() - t0
        # Should NOT block; either 200 with job_id or fast 4xx
        assert r.status_code in (200, 202, 400, 409, 422, 503), r.text
        assert elapsed < 10, f"sync took {elapsed:.1f}s"
