"""Tests for /api/performance/generate next_month_leads_list and revenue override save flow."""
import os
import datetime as _dt
import requests
import pytest

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "").rstrip("/")
EMAIL = "surya.yadavalli@nylaairwater.earth"
PASSWORD = "test123"


@pytest.fixture(scope="module")
def auth():
    r = requests.post(
        f"{BASE_URL}/api/auth/login",
        json={"email": EMAIL, "password": PASSWORD},
        timeout=20,
    )
    assert r.status_code == 200, r.text
    body = r.json()
    return {
        "token": body["session_token"],
        "user": body["user"],
    }


@pytest.fixture(scope="module")
def headers(auth):
    return {"Authorization": f"Bearer {auth['token']}", "Content-Type": "application/json"}


@pytest.fixture(scope="module")
def now_my():
    n = _dt.datetime.utcnow()
    return n.month, n.year


# ---------- /api/performance/generate ----------

def test_generate_returns_pipeline_block(headers, auth, now_my):
    m, y = now_my
    r = requests.get(
        f"{BASE_URL}/api/performance/generate",
        params={"resource_id": auth["user"]["id"], "month": m, "year": y},
        headers=headers, timeout=30,
    )
    assert r.status_code == 200, r.text
    data = r.json()
    assert "pipeline" in data, list(data.keys())
    p = data["pipeline"]
    # Regression fields preserved
    assert "next_month_leads_count" in p
    assert "next_month_pipeline_value" in p
    assert "next_month" in p
    assert "next_year" in p
    # New field
    assert "next_month_leads_list" in p
    assert isinstance(p["next_month_leads_list"], list)


def test_next_month_leads_list_item_shape(headers, auth, now_my):
    m, y = now_my
    r = requests.get(
        f"{BASE_URL}/api/performance/generate",
        params={"resource_id": auth["user"]["id"], "month": m, "year": y},
        headers=headers, timeout=30,
    )
    assert r.status_code == 200
    p = r.json()["pipeline"]
    expected = {"id", "name", "company", "city", "status",
                "pipeline_value", "target_closure_month", "target_closure_year"}
    for lead in p["next_month_leads_list"]:
        missing = expected - set(lead.keys())
        assert not missing, f"missing keys: {missing}"
        assert isinstance(lead["pipeline_value"], (int, float))


def test_next_month_leads_count_matches_list(headers, auth, now_my):
    m, y = now_my
    r = requests.get(
        f"{BASE_URL}/api/performance/generate",
        params={"resource_id": auth["user"]["id"], "month": m, "year": y},
        headers=headers, timeout=30,
    )
    p = r.json()["pipeline"]
    assert p["next_month_leads_count"] == len(p["next_month_leads_list"])


def test_next_month_pipeline_value_matches_sum(headers, auth, now_my):
    m, y = now_my
    r = requests.get(
        f"{BASE_URL}/api/performance/generate",
        params={"resource_id": auth["user"]["id"], "month": m, "year": y},
        headers=headers, timeout=30,
    )
    p = r.json()["pipeline"]
    s = round(sum(l["pipeline_value"] for l in p["next_month_leads_list"]), 2)
    assert abs(p["next_month_pipeline_value"] - s) < 0.5


def test_no_mongo_id_leak(headers, auth, now_my):
    m, y = now_my
    r = requests.get(
        f"{BASE_URL}/api/performance/generate",
        params={"resource_id": auth["user"]["id"], "month": m, "year": y},
        headers=headers, timeout=30,
    )
    p = r.json()["pipeline"]
    for lead in p["next_month_leads_list"]:
        assert "_id" not in lead


# ---------- /api/performance/save (override fields) ----------

def test_save_revenue_overrides_persist(headers, auth, now_my):
    m, y = now_my
    payload = {
        "resource_id": auth["user"]["id"],
        "resource_name": auth["user"].get("name", ""),
        "month": m,
        "year": y,
        "status": "draft",
        "revenue_lifetime_override": 1234567.89,
        "revenue_this_month_override": 23456.78,
        "revenue_new_accounts_override": 999.99,
    }
    r = requests.post(f"{BASE_URL}/api/performance/save", json=payload, headers=headers, timeout=30)
    assert r.status_code in (200, 201), r.text

    # Fetch back via generate — saved_record should echo fields
    r2 = requests.get(
        f"{BASE_URL}/api/performance/generate",
        params={"resource_id": auth["user"]["id"], "month": m, "year": y},
        headers=headers, timeout=30,
    )
    assert r2.status_code == 200
    saved = r2.json().get("saved_record") or {}
    assert saved.get("revenue_lifetime_override") == 1234567.89, saved
    assert saved.get("revenue_this_month_override") == 23456.78
    assert saved.get("revenue_new_accounts_override") == 999.99


def test_clear_revenue_overrides(headers, auth, now_my):
    m, y = now_my
    payload = {
        "resource_id": auth["user"]["id"],
        "resource_name": auth["user"].get("name", ""),
        "month": m,
        "year": y,
        "status": "draft",
        "revenue_lifetime_override": None,
        "revenue_this_month_override": None,
        "revenue_new_accounts_override": None,
    }
    r = requests.post(f"{BASE_URL}/api/performance/save", json=payload, headers=headers, timeout=30)
    assert r.status_code in (200, 201), r.text

    r2 = requests.get(
        f"{BASE_URL}/api/performance/generate",
        params={"resource_id": auth["user"]["id"], "month": m, "year": y},
        headers=headers, timeout=30,
    )
    saved = r2.json().get("saved_record") or {}
    assert saved.get("revenue_lifetime_override") is None
    assert saved.get("revenue_this_month_override") is None
    assert saved.get("revenue_new_accounts_override") is None
