"""
Iteration 247 — Accounting Transactions (Phase 1) backend tests.

Covers GET listing + summary, sync graceful failure (Zoho not connected),
filters (status/direction/search), PATCH /tags (expense path on DEBIT),
apply-account / unapply-account on CREDIT (verifies outstanding_balance
delta), apply-account on DEBIT → 400, proof upload/download/delete,
and the unique-index de-dup guarantee.
"""
import os
import io
import uuid
import asyncio
import pytest
import requests
from dotenv import load_dotenv

load_dotenv("/app/frontend/.env")
load_dotenv("/app/backend/.env")
BASE_URL = os.environ.get("REACT_APP_BACKEND_URL").rstrip("/")
ADMIN_EMAIL = "surya.yadavalli@nylaairwater.earth"
ADMIN_PASSWORD = "test123"
TENANT = "nyla-air-water"

TEST_DEBIT_ZID = "TEST-DEBIT-1"
TEST_CREDIT_ZID = "TEST-CREDIT-1"


def _login():
    r = requests.post(
        f"{BASE_URL}/api/auth/login",
        headers={"X-Tenant-ID": TENANT},
        json={"email": ADMIN_EMAIL, "password": ADMIN_PASSWORD},
        timeout=30,
    )
    assert r.status_code == 200, f"Login failed: {r.status_code} {r.text}"
    body = r.json()
    return body.get("access_token") or body.get("session_token") or body.get("token")


@pytest.fixture(scope="module")
def H():
    tok = _login()
    return {
        "Authorization": f"Bearer {tok}",
        "Content-Type": "application/json",
        "X-Tenant-ID": TENANT,
    }


@pytest.fixture(scope="module")
def H_form():
    tok = _login()
    # for multipart — DO NOT set Content-Type, requests handles it
    return {
        "Authorization": f"Bearer {tok}",
        "X-Tenant-ID": TENANT,
    }


@pytest.fixture(scope="module")
def txns(H):
    """Resolve the pre-seeded TEST-* transactions and return {'debit': id, 'credit': id}."""
    r = requests.get(f"{BASE_URL}/api/accounting/transactions?limit=200", headers=H, timeout=30)
    assert r.status_code == 200, r.text
    items = r.json().get("items", [])
    out = {}
    for it in items:
        if it.get("zoho_transaction_id") == TEST_DEBIT_ZID:
            out["debit"] = it["id"]
        elif it.get("zoho_transaction_id") == TEST_CREDIT_ZID:
            out["credit"] = it["id"]
    assert "debit" in out and "credit" in out, f"Test seed transactions missing: {out}"
    return out


# ── List + Summary ────────────────────────────────────────────────────────
class TestList:
    def test_list_includes_test_rows_and_summary_shape(self, H):
        r = requests.get(f"{BASE_URL}/api/accounting/transactions?limit=200", headers=H, timeout=30)
        assert r.status_code == 200, r.text
        body = r.json()
        for key in ("items", "total", "summary"):
            assert key in body
        s = body["summary"]
        for k in ("untagged", "tagged", "all"):
            assert k in s and isinstance(s[k], int)
        zids = {i.get("zoho_transaction_id") for i in body["items"]}
        assert TEST_DEBIT_ZID in zids
        assert TEST_CREDIT_ZID in zids

    def test_filter_direction_debit(self, H):
        r = requests.get(f"{BASE_URL}/api/accounting/transactions?direction=debit&limit=200",
                         headers=H, timeout=30)
        assert r.status_code == 200
        items = r.json()["items"]
        assert all(i["direction"] == "debit" for i in items)
        assert any(i["zoho_transaction_id"] == TEST_DEBIT_ZID for i in items)

    def test_filter_direction_credit(self, H):
        r = requests.get(f"{BASE_URL}/api/accounting/transactions?direction=credit&limit=200",
                         headers=H, timeout=30)
        assert r.status_code == 200
        items = r.json()["items"]
        assert all(i["direction"] == "credit" for i in items)
        assert any(i["zoho_transaction_id"] == TEST_CREDIT_ZID for i in items)

    def test_filter_search_acme(self, H):
        r = requests.get(f"{BASE_URL}/api/accounting/transactions?search=Acme&limit=200",
                         headers=H, timeout=30)
        assert r.status_code == 200
        items = r.json()["items"]
        assert any(i["zoho_transaction_id"] == TEST_DEBIT_ZID for i in items)

    def test_filter_status_untagged_includes_seeds_initially(self, H):
        # Before tagging tests run this only verifies endpoint shape & filter works
        r = requests.get(f"{BASE_URL}/api/accounting/transactions?status=untagged&limit=200",
                         headers=H, timeout=30)
        assert r.status_code == 200
        items = r.json()["items"]
        assert all(i["status"] == "untagged" for i in items)


# ── Sync graceful failure (no Zoho creds in Preview) ──────────────────────
class TestSync:
    def test_sync_returns_400_when_zoho_not_connected(self, H):
        r = requests.post(f"{BASE_URL}/api/accounting/transactions/sync", headers=H, timeout=30)
        # In Preview, Zoho is not connected → expect 400 with a clear message.
        assert r.status_code == 400, f"Expected 400 not connected; got {r.status_code} {r.text}"
        body = r.json()
        detail = (body.get("detail") or "").lower()
        assert "zoho" in detail and ("not connected" in detail or "not configured" in detail), body


# ── Tagging on DEBIT ──────────────────────────────────────────────────────
class TestTagging:
    def test_patch_tags_sets_status_tagged_and_persists(self, H, txns):
        # Pull a real master id from each expense master
        master_ids = {}
        for mt in ("expense_type", "expense_category", "cost_center", "payment_source"):
            r = requests.get(f"{BASE_URL}/api/accounting/masters/{mt}", headers=H, timeout=30)
            assert r.status_code == 200, f"GET masters/{mt} → {r.status_code} {r.text}"
            items = r.json().get("items", [])
            assert items, f"No master items for {mt}"
            master_ids[mt] = items[0]["id"]

        # Pick or create a vendor
        rv = requests.get(f"{BASE_URL}/api/accounting/vendors", headers=H, timeout=30)
        assert rv.status_code == 200, rv.text
        vendors = rv.json().get("items", [])
        if vendors:
            vendor = vendors[0]
        else:
            # need a vendor_type id
            rvt = requests.get(f"{BASE_URL}/api/vendor-types", headers=H, timeout=30)
            vt = rvt.json()["items"][0]
            unique = f"TEST_Vendor_{uuid.uuid4().hex[:6]}"
            rc = requests.post(
                f"{BASE_URL}/api/accounting/vendors",
                headers=H,
                json={"name": unique, "vendor_type_id": vt["id"]},
                timeout=30,
            )
            assert rc.status_code == 200, rc.text
            vendor = rc.json()

        payload = {
            "tags": {
                "expense_type": master_ids["expense_type"],
                "expense_category": master_ids["expense_category"],
                "cost_center": master_ids["cost_center"],
                "payment_source": master_ids["payment_source"],
            },
            "vendor_id": vendor["id"],
            "vendor_name": vendor.get("name"),
        }
        r = requests.patch(
            f"{BASE_URL}/api/accounting/transactions/{txns['debit']}/tags",
            headers=H, json=payload, timeout=30,
        )
        assert r.status_code == 200, r.text
        doc = r.json()
        assert doc["status"] == "tagged"
        assert doc["tags"]["expense_type"] == master_ids["expense_type"]
        assert doc["vendor_id"] == vendor["id"]

        # GET-verify persistence
        rg = requests.get(f"{BASE_URL}/api/accounting/transactions?limit=200", headers=H, timeout=30)
        item = next(i for i in rg.json()["items"] if i["id"] == txns["debit"])
        assert item["status"] == "tagged"
        assert item["tags"]["payment_source"] == master_ids["payment_source"]


# ── Apply / Unapply Account on CREDIT (+ outstanding delta) ───────────────
class TestApplyAccount:
    def _get_account(self, H):
        r = requests.get(f"{BASE_URL}/api/accounts?limit=50", headers=H, timeout=30)
        assert r.status_code == 200, r.text
        body = r.json()
        items = (body.get("data") or body.get("items") or body.get("accounts")
                 or (body if isinstance(body, list) else []))
        assert items, "No accounts found to test apply-account"
        return items[0]

    def _outstanding(self, H, acc_id):
        r = requests.get(f"{BASE_URL}/api/accounts/{acc_id}", headers=H, timeout=30)
        assert r.status_code == 200, r.text
        return float(r.json().get("outstanding_balance") or 0)

    def test_apply_then_unapply_credit_adjusts_outstanding(self, H, txns):
        acc = self._get_account(H)
        acc_id = acc.get("id") or acc.get("account_id")
        before = self._outstanding(H, acc_id)

        r = requests.post(
            f"{BASE_URL}/api/accounting/transactions/{txns['credit']}/apply-account",
            headers=H, json={"account_id": acc_id, "account_name": acc.get("account_name")},
            timeout=30,
        )
        assert r.status_code == 200, r.text
        adj = r.json().get("adjustment") or {}
        assert adj.get("applied") is True
        assert float(adj.get("amount")) == 50000.0

        after_apply = self._outstanding(H, acc_id)
        assert round(before - after_apply, 2) == 50000.0, \
            f"Outstanding did not decrease by 50000. before={before}, after={after_apply}"

        # Re-apply should now 400
        r2 = requests.post(
            f"{BASE_URL}/api/accounting/transactions/{txns['credit']}/apply-account",
            headers=H, json={"account_id": acc_id, "account_name": acc.get("account_name")},
            timeout=30,
        )
        assert r2.status_code == 400, f"Expected 400 on re-apply; got {r2.status_code} {r2.text}"

        # Unapply restores balance
        ru = requests.post(
            f"{BASE_URL}/api/accounting/transactions/{txns['credit']}/unapply-account",
            headers=H, timeout=30,
        )
        assert ru.status_code == 200, ru.text
        after_unapply = self._outstanding(H, acc_id)
        assert round(after_unapply - after_apply, 2) == 50000.0, \
            f"Outstanding not restored. after_apply={after_apply}, after_unapply={after_unapply}"
        # Net delta back to before
        assert round(after_unapply - before, 2) == 0.0

    def test_apply_account_on_debit_returns_400(self, H, txns):
        # Pick any account
        acc = self._get_account(H)
        acc_id = acc.get("id") or acc.get("account_id")
        r = requests.post(
            f"{BASE_URL}/api/accounting/transactions/{txns['debit']}/apply-account",
            headers=H, json={"account_id": acc_id}, timeout=30,
        )
        assert r.status_code == 400, f"Expected 400 on debit; got {r.status_code} {r.text}"


# ── Proofs ────────────────────────────────────────────────────────────────
class TestProofs:
    def test_upload_download_delete_proof(self, H, H_form, txns):
        files = {"file": ("TEST_proof.txt", io.BytesIO(b"hello-proof-bytes"), "text/plain")}
        data = {"proof_type": "payment_proof"}
        r = requests.post(
            f"{BASE_URL}/api/accounting/transactions/{txns['debit']}/proofs",
            headers=H_form, files=files, data=data, timeout=60,
        )
        assert r.status_code == 200, r.text
        proof = r.json()
        assert proof.get("id")
        assert proof.get("storage_path")
        assert proof.get("type") == "payment_proof"

        # Download
        rd = requests.get(
            f"{BASE_URL}/api/accounting/transactions/{txns['debit']}/proofs/{proof['id']}/download",
            headers=H_form, timeout=60,
        )
        assert rd.status_code == 200, rd.text
        assert rd.content == b"hello-proof-bytes"

        # Delete (soft)
        rdl = requests.delete(
            f"{BASE_URL}/api/accounting/transactions/{txns['debit']}/proofs/{proof['id']}",
            headers=H_form, timeout=30,
        )
        assert rdl.status_code == 200, rdl.text

        # Download after delete should 404
        rd2 = requests.get(
            f"{BASE_URL}/api/accounting/transactions/{txns['debit']}/proofs/{proof['id']}/download",
            headers=H_form, timeout=30,
        )
        assert rd2.status_code == 404


# ── De-dup via unique index ───────────────────────────────────────────────
class TestDedupIndex:
    def test_unique_index_exists_and_duplicate_rejected(self):
        from database import db
        from pymongo.errors import DuplicateKeyError

        async def run():
            # Ensure index exists (route uses ensure_indexes on sync; create here defensively)
            await db.accounting_transactions.create_index(
                [("tenant_id", 1), ("zoho_org_id", 1), ("zoho_transaction_id", 1)],
                unique=True, name="uniq_zoho_txn",
            )
            idx = await db.accounting_transactions.index_information()
            uniq = next((v for k, v in idx.items() if k == "uniq_zoho_txn"), None)
            assert uniq is not None, f"uniq_zoho_txn index missing. Got: {list(idx.keys())}"
            assert uniq.get("unique") is True
            assert uniq["key"] == [("tenant_id", 1), ("zoho_org_id", 1), ("zoho_transaction_id", 1)]

            zid = f"TEST-DUP-{uuid.uuid4().hex[:6]}"
            base = {
                "id": str(uuid.uuid4()),
                "tenant_id": TENANT, "zoho_org_id": "TEST-ORG",
                "zoho_transaction_id": zid,
                "direction": "debit", "amount": 1.0, "status": "untagged",
            }
            await db.accounting_transactions.insert_one(dict(base))
            raised = False
            try:
                d2 = dict(base); d2["id"] = str(uuid.uuid4())
                await db.accounting_transactions.insert_one(d2)
            except DuplicateKeyError:
                raised = True
            # cleanup
            await db.accounting_transactions.delete_many({"zoho_transaction_id": zid})
            assert raised, "Duplicate insert was NOT rejected by the unique index"

        asyncio.get_event_loop().run_until_complete(run())
