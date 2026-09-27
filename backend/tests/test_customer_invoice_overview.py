"""Backend tests for Customer Invoice Overview report."""
import os
from datetime import datetime, timezone
import pytest
import requests

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "").rstrip("/")
if not BASE_URL:
    # fallback: read frontend/.env
    with open("/app/frontend/.env") as f:
        for line in f:
            if line.startswith("REACT_APP_BACKEND_URL="):
                BASE_URL = line.split("=", 1)[1].strip().rstrip("/")

TENANT = "nyla-air-water"
EMAIL = "surya.yadavalli@nylaairwater.earth"
PASSWORD = "test123"


@pytest.fixture(scope="module")
def token():
    r = requests.post(
        f"{BASE_URL}/api/auth/login",
        json={"email": EMAIL, "password": PASSWORD},
        headers={"X-Tenant-ID": TENANT},
        timeout=30,
    )
    assert r.status_code == 200, r.text
    tok = r.json().get("session_token") or r.json().get("token") or r.json().get("access_token")
    assert tok, r.json()
    return tok


@pytest.fixture(scope="module")
def headers(token):
    return {"Authorization": f"Bearer {token}", "X-Tenant-ID": TENANT}


def test_overview_structure(headers):
    r = requests.get(f"{BASE_URL}/api/reports/customer-invoice-overview", headers=headers, timeout=60)
    assert r.status_code == 200, r.text
    data = r.json()

    # months
    assert len(data["months"]) == 6
    keys = [m["key"] for m in data["months"]]
    assert keys == sorted(keys), "months must be chronological"
    now = datetime.now(timezone.utc)
    cur_key = f"{now.year:04d}-{now.month:02d}"
    assert data["months"][-1]["key"] == cur_key
    assert data["months"][-1]["current"] is True
    assert all(m["current"] is False for m in data["months"][:-1])
    # label like 'Apr 2026'
    import re
    for m in data["months"]:
        assert re.match(r"^[A-Z][a-z]{2} \d{4}$", m["label"]), m["label"]

    # rows
    rows = data["rows"]
    assert len(rows) > 0
    names = [(r.get("account_name") or "").lower() for r in rows]
    assert names == sorted(names), "rows must be sorted A→Z by name"
    for row in rows:
        assert len(row["months"]) == 6
        for v in row["months"]:
            assert v is not None and isinstance(v, (int, float))
        assert row["total"] == pytest.approx(round(sum(row["months"]), 2), abs=0.02)
        assert "invoice_count" in row

    # month_totals and grand_total consistency
    assert len(data["month_totals"]) == 6
    for i in range(6):
        expected = round(sum(r["months"][i] for r in rows), 2)
        assert data["month_totals"][i] == pytest.approx(expected, abs=0.02)
    assert data["grand_total"] == pytest.approx(round(sum(data["month_totals"]), 2), abs=0.02)

    # summary
    s = data["summary"]
    assert s["customers"] == len(rows)
    assert s["invoiced_customers"] == sum(1 for r in rows if r["total"] > 0)
    assert isinstance(s["invoices"], int)


def test_toopa_may_value(headers):
    r = requests.get(f"{BASE_URL}/api/reports/customer-invoice-overview", headers=headers, timeout=60)
    data = r.json()
    keys = [m["key"] for m in data["months"]]
    # find May 2026 index if present
    if "2026-05" not in keys:
        pytest.skip("May 2026 not in the current 6-month window")
    idx = keys.index("2026-05")
    toopa = next((r for r in data["rows"] if "toopa" in (r["account_name"] or "").lower()), None)
    assert toopa, "Toopa Ice-creamery not found"
    assert toopa["months"][idx] == pytest.approx(3576, abs=1), toopa


def test_export_xlsx(headers):
    r = requests.get(f"{BASE_URL}/api/reports/customer-invoice-overview/export", headers=headers, timeout=60)
    assert r.status_code == 200
    assert "spreadsheetml" in r.headers.get("content-type", "")
    assert r.content[:2] == b"PK"  # xlsx zip magic
    assert len(r.content) > 1000


def test_export_unauth():
    r = requests.get(f"{BASE_URL}/api/reports/customer-invoice-overview/export", timeout=30)
    assert r.status_code == 401


def test_overview_unauth():
    r = requests.get(f"{BASE_URL}/api/reports/customer-invoice-overview", timeout=30)
    assert r.status_code == 401
