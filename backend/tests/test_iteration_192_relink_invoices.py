"""
Iteration 192 — Invoice→Account relink by stable Account ID.

Bug (production): invoices synced from Zoho / matched to leads didn't carry the
CRM account id, and the account-detail page's name fallback failed when the
Zoho name format differed ("Varma Steels Pvt Ltd" vs "Varma Steels Private
Limited"), so the invoices never appeared on the account page.

Fix: POST /api/accounts/relink-invoices stamps the stable account_uuid +
account_id onto invoices using ID keys (account id / Zoho customer / lead) with
a one-time normalized-name fallback (unique match only). After relink the
account-detail page matches purely by ID.
"""
import os
import uuid

import pytest
import requests
from dotenv import load_dotenv

load_dotenv("/app/backend/.env")

BASE_URL = os.environ.get(
    "REACT_APP_BACKEND_URL",
    "https://design-requests-ui.preview.emergentagent.com",
).rstrip("/")
ADMIN_EMAIL = "surya.yadavalli@nylaairwater.earth"
ADMIN_PASS = "test123"
TENANT = "nyla-air-water"


def _login():
    r = requests.post(
        f"{BASE_URL}/api/auth/login",
        json={"email": ADMIN_EMAIL, "password": ADMIN_PASS},
        timeout=20,
    )
    if r.status_code != 200:
        pytest.skip(f"Login failed: {r.status_code}")
    return r.json()["session_token"]


@pytest.fixture(scope="module")
def token():
    return _login()


def _auth(t):
    return {"Authorization": f"Bearer {t}"}


# ── unit: company-name normalisation (the bootstrap key) ──
def test_norm_company_name_ignores_suffix_and_punctuation():
    from routes.accounts import _norm_company_name
    a = _norm_company_name("Varma Steels Pvt Ltd")
    b = _norm_company_name("Varma Steels Private Limited")
    c = _norm_company_name("M/s. Varma Steels Pvt. Ltd.")
    assert a == b == c == "varma steels", (a, b, c)
    # Empty / noise-only names never produce a match key.
    assert _norm_company_name("Pvt Ltd") == ""
    assert _norm_company_name(None) == ""


# ── api: relink endpoint shape + idempotency ──
def test_relink_dry_run_shape(token):
    r = requests.post(
        f"{BASE_URL}/api/accounts/relink-invoices?dry_run=true",
        headers=_auth(token), timeout=60,
    )
    assert r.status_code == 200, r.text
    body = r.json()
    for k in ("dry_run", "scanned", "updated", "already_linked",
              "unresolved_count", "ambiguous_name_count", "by_key"):
        assert k in body, body
    assert body["dry_run"] is True


def test_relink_requires_auth():
    r = requests.post(f"{BASE_URL}/api/accounts/relink-invoices", timeout=20)
    assert r.status_code in (401, 403), r.status_code


# ── end-to-end: a name-mismatched invoice becomes visible after relink ──
@pytest.mark.asyncio
async def test_relink_makes_name_mismatched_invoice_visible(token):
    import sys
    sys.path.insert(0, "/app/backend")
    from database import db

    acc_uuid = str(uuid.uuid4())
    acc_code = f"RLT-{uuid.uuid4().hex[:6].upper()}"
    inv_no = f"INV-RLT-{uuid.uuid4().hex[:6].upper()}"
    await db.accounts.insert_one({
        "id": acc_uuid, "tenant_id": TENANT, "account_id": acc_code,
        "account_name": "Relink Test Steels Private Limited",
        "city": "Hyderabad", "state": "Telangana",
    })
    await db.invoices.insert_one({
        "id": str(uuid.uuid4()), "tenant_id": TENANT, "invoice_no": inv_no,
        "account_id": "ZOHO-NOCRM-1", "account_uuid": None,
        "account_name": "Relink Test Steels Pvt Ltd",     # different format
        "customer_name": "Relink Test Steels Pvt Ltd",
        "invoice_date": "2026-05-20", "net_invoice_value": 1234,
        "gross_invoice_value": 1234, "status": "matched",
    })
    try:
        # before: invisible on the account page
        before = requests.get(
            f"{BASE_URL}/api/accounts/{acc_code}/invoices?time_filter=this_month&limit=20",
            headers=_auth(token), timeout=30,
        ).json()
        assert before.get("total", 0) == 0, before

        # relink (apply)
        res = requests.post(
            f"{BASE_URL}/api/accounts/relink-invoices",
            headers=_auth(token), timeout=60,
        ).json()
        assert res["by_key"].get("name_normalized", 0) >= 1, res

        # after: visible, matched by stamped account id
        after = requests.get(
            f"{BASE_URL}/api/accounts/{acc_code}/invoices?time_filter=this_month&limit=20",
            headers=_auth(token), timeout=30,
        ).json()
        assert after.get("total", 0) >= 1, after

        # the invoice now carries the stable CRM ids
        doc = await db.invoices.find_one({"invoice_no": inv_no}, {"_id": 0})
        assert doc["account_uuid"] == acc_uuid
        assert doc["account_id"] == acc_code
    finally:
        await db.invoices.delete_many({"invoice_no": inv_no})
        await db.accounts.delete_many({"account_id": acc_code})
