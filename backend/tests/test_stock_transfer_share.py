"""Backend tests for stock transfer share default_subject/default_message."""
import os
import re
import requests
import pytest

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "https://design-workflow-hub-11.preview.emergentagent.com").rstrip("/")
TID = open("/tmp/tid").read().strip()

ADMIN_EMAIL = "surya.yadavalli@nylaairwater.earth"
ADMIN_PW = "test123"
TENANT = "nyla-air-water"


@pytest.fixture(scope="module")
def session():
    s = requests.Session()
    r = s.post(f"{BASE_URL}/api/auth/login", json={
        "email": ADMIN_EMAIL, "password": ADMIN_PW, "tenant_slug": TENANT
    })
    assert r.status_code == 200, r.text
    tok = r.json().get("session_token") or r.json().get("token")
    assert tok
    s.headers.update({"Authorization": f"Bearer {tok}"})
    return s


def test_recipients_default_subject_and_message(session):
    r = session.get(f"{BASE_URL}/api/share/recipients",
                    params={"document_type": "stock_transfer_doc", "document_id": TID})
    assert r.status_code == 200, r.text
    data = r.json()
    subj = data.get("default_subject", "")
    msg = data.get("default_message", "")
    print("SUBJECT:", subj)
    print("MSG LEN:", len(msg))
    print("MSG:", msg[:2000])

    assert "INV-QA-1" in subj, f"subject missing INV-QA-1: {subj}"
    assert "ST-2026-0010" in subj, f"subject missing ST-2026-0010: {subj}"

    assert "Aparna Cinemas" in msg
    assert "Batch B-QA-01" in msg
    assert "5 × Crate" in msg or "5 &times; Crate" in msg or "5 x Crate" in msg
    assert "60 bottles" in msg
    assert "Total: 11 packages" in msg
    assert "96 bottles" in msg
    assert "2 SKUs" in msg
    assert "Surya Yadavalli" in msg

    # No money terms (word-boundary case-insensitive)
    lower_msg = msg.lower()
    forbidden = ["rate", "amount", "price", "value"]
    for term in forbidden:
        assert not re.search(rf"\b{term}\b", lower_msg), f"forbidden term found: {term}"
    assert "₹" not in msg
    assert not re.search(r"\brs\b", lower_msg)


def test_unsynced_transfer_no_500(session):
    # Search for a transfer that is not synced
    r = session.get(f"{BASE_URL}/api/stock-transfers", params={"limit": 50})
    if r.status_code != 200:
        pytest.skip(f"cannot list transfers: {r.status_code}")
    items = r.json() if isinstance(r.json(), list) else r.json().get("items", [])
    unsynced = [t for t in items if t.get("zoho_status") != "synced" and t.get("id") != TID]
    if not unsynced:
        pytest.skip("no unsynced transfer found")
    tid = unsynced[0]["id"]
    r2 = session.get(f"{BASE_URL}/api/share/recipients",
                     params={"document_type": "stock_transfer_doc", "document_id": tid})
    assert r2.status_code != 500, r2.text
    assert r2.status_code in (200, 400, 404), r2.status_code
