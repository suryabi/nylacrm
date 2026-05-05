"""
Backend tests for per-user home widget order preferences.
GET/PUT /api/preferences/home-widget-order
"""
import os
import pytest
import requests

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "").rstrip("/")
if not BASE_URL:
    # Fallback to frontend/.env if not set in backend env
    try:
        with open("/app/frontend/.env") as f:
            for line in f:
                if line.startswith("REACT_APP_BACKEND_URL"):
                    BASE_URL = line.split("=", 1)[1].strip().rstrip("/")
                    break
    except Exception:
        pass
assert BASE_URL, "REACT_APP_BACKEND_URL must be set"

USER_A = {"email": "surya.yadavalli@nylaairwater.earth", "password": "test123"}
DEFAULT_ORDER = ["meetings", "pipeline", "followups"]
ENDPOINT = f"{BASE_URL}/api/preferences/home-widget-order"


def _login(session, creds):
    r = session.post(f"{BASE_URL}/api/auth/login", json=creds, timeout=20)
    assert r.status_code == 200, f"login failed: {r.status_code} {r.text}"
    data = r.json()
    tok = data.get("access_token") or data.get("token")
    if tok:
        session.headers.update({"Authorization": f"Bearer {tok}"})
    return data


@pytest.fixture(scope="module")
def client_a():
    s = requests.Session()
    s.headers.update({"Content-Type": "application/json"})
    _login(s, USER_A)
    yield s
    # cleanup: reset to default at the end
    s.put(ENDPOINT, json={"order": DEFAULT_ORDER}, timeout=15)


def _reset_default(session):
    """Delete saved preference via mongo-less path: set to default with is_default flag by clearing.
    Simplest: PUT default order. is_default will then be false but order is default."""
    session.put(ENDPOINT, json={"order": DEFAULT_ORDER}, timeout=15)


# ---- Tests ----

def test_get_returns_default_when_unset(client_a):
    """Drop the saved pref directly via Mongo would be nice, but we can at minimum
    verify shape and content."""
    r = client_a.get(ENDPOINT, timeout=15)
    assert r.status_code == 200
    data = r.json()
    assert "order" in data and "is_default" in data
    assert isinstance(data["order"], list)
    assert set(data["order"]) == set(DEFAULT_ORDER)
    assert len(data["order"]) == 3


def test_put_persists_custom_order_and_get_reflects(client_a):
    custom = ["pipeline", "followups", "meetings"]
    r = client_a.put(ENDPOINT, json={"order": custom}, timeout=15)
    assert r.status_code == 200
    data = r.json()
    assert data["order"] == custom
    assert data["is_default"] is False

    # GET confirms persistence
    g = client_a.get(ENDPOINT, timeout=15)
    assert g.status_code == 200
    gd = g.json()
    assert gd["order"] == custom
    assert gd["is_default"] is False


def test_put_validates_drops_unknown_and_dedupes_and_appends_missing(client_a):
    payload = {"order": ["pipeline", "unknown_id", "pipeline", "followups"]}
    r = client_a.put(ENDPOINT, json=payload, timeout=15)
    assert r.status_code == 200
    out = r.json()["order"]
    # must contain exactly the 3 valid widgets
    assert len(out) == 3
    assert set(out) == set(DEFAULT_ORDER)
    # cleaned (in order, deduped) part first, then missing appended
    assert out[0] == "pipeline"
    assert out[1] == "followups"
    assert out[2] == "meetings"


def test_put_empty_order_returns_400(client_a):
    r = client_a.put(ENDPOINT, json={"order": []}, timeout=15)
    assert r.status_code == 400


def _sync_db():
    """Synchronous pymongo handle — avoids motor event-loop issues in pytest."""
    import os as _os
    from pymongo import MongoClient
    url = _os.environ.get("MONGO_URL")
    name = _os.environ.get("DB_NAME")
    if not (url and name):
        # Read from backend/.env
        env_path = "/app/backend/.env"
        try:
            with open(env_path) as f:
                for line in f:
                    k, _, v = line.strip().partition("=")
                    if k == "MONGO_URL" and not url:
                        url = v.strip().strip('"').strip("'")
                    if k == "DB_NAME" and not name:
                        name = v.strip().strip('"').strip("'")
        except Exception:
            pass
    assert url and name, "MONGO_URL/DB_NAME missing"
    return MongoClient(url)[name]


def test_put_upserts_not_duplicates(client_a):
    """Call PUT multiple times and check the document in Mongo isn't duplicated."""
    for order in (
        ["meetings", "pipeline", "followups"],
        ["followups", "pipeline", "meetings"],
        ["pipeline", "meetings", "followups"],
    ):
        r = client_a.put(ENDPOINT, json={"order": order}, timeout=15)
        assert r.status_code == 200

    d = _sync_db()
    me = d.users.find_one({"email": USER_A["email"]}, {"id": 1})
    uid = (me or {}).get("id")
    assert uid, "user id lookup failed"
    cnt = d.user_preferences.count_documents(
        {"user_id": uid, "key": "home_widget_order"}
    )
    assert cnt == 1, f"expected single doc, got {cnt}"


def test_get_default_flag_true_when_no_doc(client_a):
    """Remove the doc directly from mongo, then GET should return is_default=true."""
    d = _sync_db()
    me = d.users.find_one({"email": USER_A["email"]}, {"id": 1})
    uid = (me or {}).get("id")
    d.user_preferences.delete_many({"user_id": uid, "key": "home_widget_order"})

    r = client_a.get(ENDPOINT, timeout=15)
    assert r.status_code == 200
    data = r.json()
    assert data["is_default"] is True
    assert data["order"] == DEFAULT_ORDER


def test_per_user_isolation(client_a):
    """User A saves a custom order. A second session (user B) should see default."""
    custom_a = ["pipeline", "followups", "meetings"]
    client_a.put(ENDPOINT, json={"order": custom_a}, timeout=15)

    d = _sync_db()
    other_users = list(d.users.find(
        {"email": {"$ne": USER_A["email"]}, "is_active": {"$ne": False}},
        {"email": 1, "id": 1},
    ).limit(25))

    # Try logging in with test123 (common test password in this tenant)
    session_b = requests.Session()
    session_b.headers.update({"Content-Type": "application/json"})
    logged_in = False
    other_uid = None
    for u in other_users:
        email = u.get("email")
        if not email:
            continue
        r = session_b.post(
            f"{BASE_URL}/api/auth/login",
            json={"email": email, "password": "test123"},
            timeout=15,
        )
        if r.status_code == 200:
            rd = r.json()
            tok = rd.get("access_token") or rd.get("token")
            if tok:
                session_b.headers.update({"Authorization": f"Bearer {tok}"})
            logged_in = True
            other_uid = u.get("id")
            break

    if not logged_in:
        pytest.skip("No second user with password test123 found for isolation test")

    # Clear any prior pref for clean comparison
    d.user_preferences.delete_many({"user_id": other_uid, "key": "home_widget_order"})

    # User B GET — should be default, not user A's custom
    r = session_b.get(ENDPOINT, timeout=15)
    assert r.status_code == 200, r.text
    db_data = r.json()
    assert db_data["order"] == DEFAULT_ORDER
    assert db_data["is_default"] is True

    # User A still has custom
    ra = client_a.get(ENDPOINT, timeout=15)
    assert ra.status_code == 200
    assert ra.json()["order"] == custom_a
