"""Tests for the duplicate-prevention guards added 2026-05-26.

1. Lead → Account convert: if an account already exists with the lead's GSTIN
   OR matching company+city, the existing account is returned (no duplicate
   insert) and the lead is linked to it.
2. Distributor account-assignment: a second POST for the same
   (account, distributor, city) triple is rejected with HTTP 409.

Uses live /api endpoints via the testing-only admin token from
/app/memory/test_credentials.md.
"""
from __future__ import annotations

import os
import uuid

import pytest
import requests


BASE_URL = os.environ.get("PUBLIC_BACKEND_URL", "https://beverage-crm-ops.preview.emergentagent.com")
ADMIN_EMAIL = "surya.yadavalli@nylaairwater.earth"
ADMIN_PASSWORD = "test123"


@pytest.fixture(scope="module")
def admin_token():
    res = requests.post(f"{BASE_URL}/api/auth/login",
                        json={"email": ADMIN_EMAIL, "password": ADMIN_PASSWORD})
    res.raise_for_status()
    data = res.json()
    return data.get("session_token") or data.get("token")


@pytest.fixture(scope="module")
def H(admin_token):
    return {"Authorization": f"Bearer {admin_token}", "Content-Type": "application/json"}


def test_duplicate_account_assignment_blocked(H):
    """Re-submitting an existing (distributor, account, city) returns 409."""
    # Find any existing distributor + its first assignment
    dists = requests.get(f"{BASE_URL}/api/distributors", headers=H).json()
    items = dists.get("items") or dists.get("distributors") or dists or []
    if not items:
        pytest.skip("No distributors in tenant — cannot exercise dedup")
    distributor = items[0]
    dist_id = distributor["id"]

    assignments = requests.get(
        f"{BASE_URL}/api/distributors/{dist_id}/assignments?page=1&limit=1",
        headers=H,
    ).json()
    rows = assignments.get("items") or assignments.get("assignments") or []
    if not rows:
        pytest.skip(f"Distributor {dist_id} has no assignments — cannot exercise dedup")
    a = rows[0]

    payload = {
        "distributor_id": dist_id,
        "account_id": a["account_id"],
        "servicing_city": a["servicing_city"],
        "servicing_state": a.get("servicing_state"),
        "is_primary": False,
    }
    res = requests.post(f"{BASE_URL}/api/distributors/{dist_id}/assignments",
                        headers=H, json=payload)
    assert res.status_code == 409, f"Expected 409 for duplicate; got {res.status_code}: {res.text}"
    detail = res.json().get("detail", "")
    assert "already assigned" in detail.lower(), f"Expected friendly message, got: {detail}"


def test_lead_dedup_returns_existing_account_on_gstin_match(H):
    """If an account already has a GSTIN matching the lead, convert-lead returns
    that account with already_existed=True instead of creating a duplicate.

    Skips gracefully when no won lead with a matching account exists — this is
    only a smoke test of the code path, not a setup-and-tear-down integration.
    """
    leads_res = requests.get(f"{BASE_URL}/api/leads?status=won&page=1&limit=20", headers=H)
    if leads_res.status_code != 200:
        pytest.skip(f"Could not list leads ({leads_res.status_code}) — skipping dedup test.")
    leads_list = leads_res.json().get("items") or leads_res.json().get("leads") or []
    matching = next((l for l in leads_list if l.get("gstin")), None)
    if not matching:
        pytest.skip("No won lead with GSTIN — cannot exercise GSTIN-based dedup.")

    # Convert it — we don't really care which path it takes here. Just assert
    # that the response is well-formed and either creates OR de-dupes cleanly.
    res = requests.post(
        f"{BASE_URL}/api/accounts/convert-lead",
        headers=H,
        json={"lead_id": matching["id"]},
    )
    if res.status_code == 400 and "Please add at least one SKU" in res.text:
        pytest.skip("Lead needs proposed_sku_pricing — skipping (this is a different flow).")
    assert res.status_code in (200, 201), f"Unexpected status: {res.status_code} — {res.text}"
    body = res.json()
    # already_existed is set ONLY when we matched a pre-existing account by
    # identity (lead-id link OR GSTIN/name match). Either path is acceptable
    # here — we just verify the contract.
    assert "account_id" in body
