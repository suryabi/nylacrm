"""
Iteration 201 — Target Planning: assign a plan to a user + name resolution.

Covers the new `assigned_to` field on target plans:
  - Create with assigned_to -> backend resolves & stores assigned_to_name.
  - PUT to reassign -> name updates to the new user.
  - PUT with assigned_to="" -> assignment cleared (both id + name null).
The frontend groups plans by `assigned_to_name`, so accurate resolution matters.
"""
import os
import uuid

import pytest
import requests

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', '').rstrip('/')
TEST_EMAIL = "surya.yadavalli@nylaairwater.earth"
TEST_PASSWORD = "test123"
TENANT = "nyla-air-water"


@pytest.fixture(scope="module")
def session():
    s = requests.Session()
    s.headers.update({"Content-Type": "application/json", "X-Tenant-ID": TENANT})
    r = s.post(f"{BASE_URL}/api/auth/login", json={
        "email": TEST_EMAIL, "password": TEST_PASSWORD, "tenant_id": TENANT})
    if r.status_code != 200:
        pytest.skip(f"Auth failed: {r.status_code}")
    token = r.json().get("session_token") or r.json().get("token")
    if not token:
        pytest.skip("No session_token")
    s.headers.update({"Authorization": f"Bearer {token}"})
    return s


@pytest.fixture(scope="module")
def two_users(session):
    r = session.get(f"{BASE_URL}/api/users?is_active=true")
    assert r.status_code == 200, r.text
    data = r.json()
    users = data if isinstance(data, list) else data.get("data", [])
    assert len(users) >= 2, "Need at least 2 users to test reassignment"
    return users[0], users[1]


@pytest.fixture
def plan_id(session):
    pid = None
    yield_holder = {}

    def _create(assigned_to=None):
        body = {
            "name": f"IT201 Assign {uuid.uuid4().hex[:6]}",
            "start_date": "2026-06-01", "end_date": "2026-09-30",
            "goal_type": "cumulative", "total_amount": 100000, "milestones": 4,
        }
        if assigned_to is not None:
            body["assigned_to"] = assigned_to
        r = session.post(f"{BASE_URL}/api/target-planning", json=body)
        assert r.status_code == 200, r.text
        yield_holder["id"] = r.json()["id"]
        yield_holder["resp"] = r.json()
        return r.json()

    yield _create
    if yield_holder.get("id"):
        session.delete(f"{BASE_URL}/api/target-planning/{yield_holder['id']}")


def test_create_with_assignee_resolves_name(session, two_users, plan_id):
    u0, _ = two_users
    plan = plan_id(assigned_to=u0["id"])
    assert plan["assigned_to"] == u0["id"]
    assert plan["assigned_to_name"] == (u0.get("name") or u0.get("email"))


def test_reassign_updates_name(session, two_users, plan_id):
    u0, u1 = two_users
    plan = plan_id(assigned_to=u0["id"])
    pid = plan["id"]
    r = session.put(f"{BASE_URL}/api/target-planning/{pid}", json={"assigned_to": u1["id"]})
    assert r.status_code == 200, r.text
    assert r.json()["assigned_to"] == u1["id"]
    assert r.json()["assigned_to_name"] == (u1.get("name") or u1.get("email"))


def test_unassign_clears(session, two_users, plan_id):
    u0, _ = two_users
    plan = plan_id(assigned_to=u0["id"])
    pid = plan["id"]
    r = session.put(f"{BASE_URL}/api/target-planning/{pid}", json={"assigned_to": ""})
    assert r.status_code == 200, r.text
    assert r.json()["assigned_to"] is None
    assert r.json()["assigned_to_name"] is None


def test_create_without_assignee_is_unassigned(session, plan_id):
    plan = plan_id()
    assert plan.get("assigned_to") is None
    assert plan.get("assigned_to_name") is None
