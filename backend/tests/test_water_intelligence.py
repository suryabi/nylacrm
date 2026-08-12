"""Water Intelligence module tests: CRUD, transitions, settings, RBAC, public API."""
import os
import pytest
import requests

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "").rstrip("/") or "https://design-workflow-hub-11.preview.emergentagent.com"
API = f"{BASE_URL}/api"

ADMIN = {"email": "surya.yadavalli@nylaairwater.earth", "password": "test123"}
FINANCE = {"email": "finance.user@nylaairwater.earth", "password": "test123"}


def _login(creds):
    r = requests.post(f"{API}/auth/login", json=creds, timeout=30)
    assert r.status_code == 200, f"login failed {r.status_code}: {r.text[:200]}"
    tok = r.json().get("session_token") or r.json().get("token")
    assert tok
    return tok


@pytest.fixture(scope="module")
def admin_headers():
    return {"Authorization": f"Bearer {_login(ADMIN)}"}


@pytest.fixture(scope="module")
def finance_headers():
    return {"Authorization": f"Bearer {_login(FINANCE)}"}


# ─────────── Listing / Stats / Settings / Runs ───────────

def test_list_articles(admin_headers):
    r = requests.get(f"{API}/water-intelligence", headers=admin_headers, timeout=30)
    assert r.status_code == 200
    body = r.json()
    for k in ("articles", "total", "page", "limit"):
        assert k in body
    assert isinstance(body["articles"], list)


def test_list_filters(admin_headers):
    r = requests.get(f"{API}/water-intelligence?status=pending_approval&page=1&limit=5", headers=admin_headers, timeout=30)
    assert r.status_code == 200
    body = r.json()
    assert body["limit"] == 5
    for a in body["articles"]:
        assert a["status"] == "pending_approval"


def test_stats(admin_headers):
    r = requests.get(f"{API}/water-intelligence/stats", headers=admin_headers, timeout=30)
    assert r.status_code == 200
    body = r.json()
    assert "counts" in body and "categories" in body
    assert isinstance(body["categories"], list) and len(body["categories"]) > 5


def test_runs(admin_headers):
    r = requests.get(f"{API}/water-intelligence/runs", headers=admin_headers, timeout=30)
    assert r.status_code == 200
    runs = r.json().get("runs", [])
    assert isinstance(runs, list)
    if runs:
        for k in ("fetched", "duplicates", "reviewed", "kept", "status"):
            assert k in runs[0]


def test_get_settings(admin_headers):
    r = requests.get(f"{API}/water-intelligence/settings", headers=admin_headers, timeout=30)
    assert r.status_code == 200
    s = r.json()
    for k in ("topics", "custom_feeds", "min_score", "schedule_hour", "schedule_minute", "max_articles_per_run"):
        assert k in s


def test_update_settings_persist(admin_headers):
    r = requests.get(f"{API}/water-intelligence/settings", headers=admin_headers, timeout=30)
    orig = r.json()
    payload = {
        "min_score": 65,
        "schedule_hour": 6,
        "schedule_minute": 45,
        "max_articles_per_run": 42,
        "topics": orig.get("topics"),
    }
    r = requests.put(f"{API}/water-intelligence/settings", json=payload, headers=admin_headers, timeout=30)
    assert r.status_code == 200, r.text
    r = requests.get(f"{API}/water-intelligence/settings", headers=admin_headers, timeout=30)
    s = r.json()
    assert s["min_score"] == 65
    assert s["schedule_hour"] == 6
    assert s["schedule_minute"] == 45
    assert s["max_articles_per_run"] == 42
    # restore
    requests.put(f"{API}/water-intelligence/settings", json={
        "min_score": orig.get("min_score", 70),
        "schedule_hour": orig.get("schedule_hour", 5),
        "schedule_minute": orig.get("schedule_minute", 30),
        "max_articles_per_run": orig.get("max_articles_per_run", 40),
    }, headers=admin_headers, timeout=30)


def test_settings_bounds(admin_headers):
    r = requests.put(f"{API}/water-intelligence/settings",
                     json={"schedule_hour": 99, "schedule_minute": 200, "min_score": 500},
                     headers=admin_headers, timeout=30)
    assert r.status_code == 200
    s = r.json()
    assert s["schedule_hour"] == 23
    assert s["schedule_minute"] == 59
    assert s["min_score"] == 100
    # restore
    requests.put(f"{API}/water-intelligence/settings",
                 json={"schedule_hour": 5, "schedule_minute": 30, "min_score": 70},
                 headers=admin_headers, timeout=30)


# ─────────── Edit + transitions ───────────

def _first_of(status, admin_headers):
    r = requests.get(f"{API}/water-intelligence?status={status}&limit=50", headers=admin_headers, timeout=30)
    assert r.status_code == 200
    return r.json()["articles"]


def test_edit_article(admin_headers):
    arts = _first_of("pending_approval", admin_headers)
    if not arts:
        pytest.skip("no pending articles")
    art = arts[-1]  # last one
    old_headline = art["headline"]
    new_headline = f"TEST_EDIT {old_headline}"[:160]
    r = requests.put(f"{API}/water-intelligence/{art['id']}",
                     json={"headline": new_headline, "region": "India"},
                     headers=admin_headers, timeout=30)
    assert r.status_code == 200, r.text
    assert r.json()["headline"] == new_headline
    # revert
    requests.put(f"{API}/water-intelligence/{art['id']}",
                 json={"headline": old_headline}, headers=admin_headers, timeout=30)


def test_edit_invalid_category(admin_headers):
    arts = _first_of("pending_approval", admin_headers)
    if not arts:
        pytest.skip("no pending articles")
    r = requests.put(f"{API}/water-intelligence/{arts[0]['id']}",
                     json={"category": "NOT_A_CATEGORY"},
                     headers=admin_headers, timeout=30)
    assert r.status_code == 400


def test_transition_full_cycle(admin_headers):
    """approve → publish → unpublish → reject → resubmit (pending_approval)"""
    arts = _first_of("pending_approval", admin_headers)
    if len(arts) < 2:
        pytest.skip("need pending articles for transition tests")
    art = arts[-1]
    aid = art["id"]

    r = requests.post(f"{API}/water-intelligence/{aid}/transition",
                      json={"action": "approve"}, headers=admin_headers, timeout=30)
    assert r.status_code == 200, r.text
    assert r.json()["status"] == "approved"

    r = requests.post(f"{API}/water-intelligence/{aid}/transition",
                      json={"action": "publish"}, headers=admin_headers, timeout=30)
    assert r.status_code == 200
    assert r.json()["status"] == "published"
    assert r.json().get("published_at")

    r = requests.post(f"{API}/water-intelligence/{aid}/transition",
                      json={"action": "unpublish"}, headers=admin_headers, timeout=30)
    assert r.status_code == 200
    assert r.json()["status"] == "approved"

    r = requests.post(f"{API}/water-intelligence/{aid}/transition",
                      json={"action": "reject", "reason": "test"}, headers=admin_headers, timeout=30)
    assert r.status_code == 200
    assert r.json()["status"] == "rejected"

    r = requests.post(f"{API}/water-intelligence/{aid}/transition",
                      json={"action": "resubmit"}, headers=admin_headers, timeout=30)
    assert r.status_code == 200
    assert r.json()["status"] == "pending_approval"


def test_invalid_state_transition(admin_headers):
    arts = _first_of("pending_approval", admin_headers)
    if not arts:
        pytest.skip("no pending articles")
    aid = arts[0]["id"]
    # unpublish on pending article should be 400
    r = requests.post(f"{API}/water-intelligence/{aid}/transition",
                      json={"action": "unpublish"}, headers=admin_headers, timeout=30)
    assert r.status_code == 400


def test_unknown_action(admin_headers):
    arts = _first_of("pending_approval", admin_headers)
    if not arts:
        pytest.skip("no pending articles")
    r = requests.post(f"{API}/water-intelligence/{arts[0]['id']}/transition",
                      json={"action": "vaporize"}, headers=admin_headers, timeout=30)
    assert r.status_code == 400


# ─────────── Run Now guard ───────────

def test_run_now_conflict_or_success(admin_headers):
    """Do NOT trigger a fresh run — just verify endpoint responds (either 200 or 409)."""
    # Only test the 409 guard IF one is already running.
    r = requests.get(f"{API}/water-intelligence/runs", headers=admin_headers, timeout=30)
    runs = r.json().get("runs", [])
    running = [x for x in runs if x.get("status") == "running"]
    if running:
        r = requests.post(f"{API}/water-intelligence/run", headers=admin_headers, timeout=30)
        assert r.status_code == 409
    else:
        pytest.skip("no running pipeline; skipping to avoid triggering GPT-5.5")


# ─────────── RBAC ───────────

def test_finance_cannot_run(finance_headers):
    r = requests.post(f"{API}/water-intelligence/run", headers=finance_headers, timeout=30)
    assert r.status_code == 403


def test_finance_cannot_update_settings(finance_headers):
    r = requests.put(f"{API}/water-intelligence/settings",
                     json={"min_score": 50}, headers=finance_headers, timeout=30)
    assert r.status_code == 403


def test_finance_cannot_transition(finance_headers, admin_headers):
    arts = _first_of("pending_approval", admin_headers)
    if not arts:
        pytest.skip("no pending articles")
    r = requests.post(f"{API}/water-intelligence/{arts[0]['id']}/transition",
                      json={"action": "approve"}, headers=finance_headers, timeout=30)
    assert r.status_code == 403


# ─────────── Public API (no auth) ───────────

def test_public_no_auth():
    r = requests.get(f"{API}/public/water-news", timeout=30)
    assert r.status_code == 200
    body = r.json()
    for k in ("articles", "total", "page", "limit", "categories"):
        assert k in body


def test_public_only_published():
    r = requests.get(f"{API}/public/water-news?limit=50", timeout=30)
    for a in r.json()["articles"]:
        # public payload strips status; but source_url and headline must exist
        assert "headline" in a
        assert "published_at" in a
        # ensure no leaking of tenant/db fields
        assert "_id" not in a
        assert "tenant_id" not in a


def test_public_filters():
    r = requests.get(f"{API}/public/water-news?category=AWG&page=1&limit=5", timeout=30)
    assert r.status_code == 200
    body = r.json()
    for a in body["articles"]:
        assert a["category"] == "AWG"


def test_public_search():
    r = requests.get(f"{API}/public/water-news?q=water&limit=5", timeout=30)
    assert r.status_code == 200
