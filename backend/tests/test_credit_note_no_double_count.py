"""
Regression test: Credit notes from customer returns must NOT be double-counted in the
settlement math.

Bug history (Feb 2026):
A return-issued Credit Note is auto-applied to a delivery (counted in
`stockout_totals.credit_applied`) AND it later gets a `credit_note_issuances` row when
the distributor "Pays Customer" (counted in `stockout_totals.direct_credit_issued`).
The original implementation summed BOTH, double-deducting the same money.

Fix: `direct_credit_issued` must only include issuances whose parent CN has no
`return_id` (truly standalone customer payouts).

This test verifies the API behaviour by hitting the live backend.
"""
import os
import requests

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', '').rstrip('/')
TENANT_ID = "nyla-air-water"
ADMIN_EMAIL = "admin@nylaairwater.earth"
ADMIN_PASSWORD = "test123"
DIST_ID = "bb12d90e-4d33-4890-ac5f-17573c551b5c"


def _login():
    r = requests.post(
        f"{BASE_URL}/api/auth/login",
        json={"email": ADMIN_EMAIL, "password": ADMIN_PASSWORD},
        timeout=10,
    )
    r.raise_for_status()
    return r.json()["session_token"]


def test_return_linked_credits_not_double_counted():
    token = _login()
    headers = {"Authorization": f"Bearer {token}", "X-Tenant-ID": TENANT_ID}
    r = requests.get(
        f"{BASE_URL}/api/distributors/{DIST_ID}/monthly-reconciliation?month=5&year=2026",
        headers=headers,
        timeout=15,
    )
    r.raise_for_status()
    data = r.json()

    settlements = (data.get("unreconciled_settlements") or []) + (
        data.get("reconciled_settlements") or []
    )
    assert settlements, "Need at least one settlement to validate"

    for s in settlements:
        for iss in s.get("direct_credit_issuances", []):
            # A direct (standalone) issuance must have NO return linkage —
            # otherwise it's already counted via the delivery's credit_applied.
            assert not iss.get("return_id"), (
                f"Settlement {s.get('settlement_number')} surfaced a "
                f"return-linked issuance ({iss.get('credit_note_number')}) as "
                f"`direct_credit_issued`. This double-counts the credit. "
                f"Filter must exclude rows with return_id set."
            )


def test_customer_reconciliation_credits_match_credit_notes():
    """
    Customer Reconciliation `credit_notes_paid` per customer must equal the sum of
    delivery-linked credit notes (credit_applied) PLUS truly-standalone issuances —
    never the same credit counted twice.
    """
    token = _login()
    headers = {"Authorization": f"Bearer {token}", "X-Tenant-ID": TENANT_ID}
    r = requests.get(
        f"{BASE_URL}/api/distributors/{DIST_ID}/monthly-reconciliation?month=5&year=2026",
        headers=headers,
        timeout=15,
    )
    r.raise_for_status()
    data = r.json()

    rows = data.get("customer_reconciliation") or []
    settlements = (data.get("unreconciled_settlements") or []) + (
        data.get("reconciled_settlements") or []
    )

    # Build expected per-account totals from settlement-level numbers.
    expected = {}
    for s in settlements:
        aid = s.get("account_id") or "unknown"
        t = s.get("stockout_totals") or {}
        expected[aid] = expected.get(aid, 0.0) + (t.get("credit_applied") or 0) + (
            t.get("direct_credit_issued") or 0
        )

    for row in rows:
        aid = row["account_id"]
        assert abs(row["credit_notes_paid"] - round(expected.get(aid, 0), 2)) < 0.01, (
            f"Customer {row['account_name']}: customer_reconciliation reports "
            f"credit_notes_paid={row['credit_notes_paid']} but settlement-side "
            f"sum={expected.get(aid)}"
        )
