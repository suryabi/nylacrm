"""
Iteration 200 — Target Planning: Monthly Allocation (City × Month matrix).

Exercises the new endpoints end-to-end against the live preview API:
  GET  /api/target-planning/{plan_id}/monthly-allocation
  PUT  /api/target-planning/{plan_id}/monthly-allocation   (draft + finalize)

Validation contract:
  - Months span the plan's [start_date, end_date] inclusive (Jun..Sep -> 4).
  - Each city row's `total_target` == its city-allocation amount.
  - A draft save persists cells but leaves the plan unbalanced/un-finalized.
  - finalize=true is REJECTED (400) while any city's monthly sum != its total.
  - finalize=true SUCCEEDS once every city is balanced; plan is marked finalized.
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
        "email": TEST_EMAIL, "password": TEST_PASSWORD, "tenant_id": TENANT,
    })
    if r.status_code != 200:
        pytest.skip(f"Auth failed: {r.status_code} {r.text[:120]}")
    token = r.json().get("session_token") or r.json().get("token")
    if not token:
        pytest.skip("No session_token in login response")
    s.headers.update({"Authorization": f"Bearer {token}"})
    return s


@pytest.fixture(scope="module")
def plan(session):
    """Create a Jun→Sep plan with one territory + two city allocations, yield
    the matrix context, then delete the plan at the end."""
    # Plan spanning Jun 1 -> Sep 30 (4 months)
    pr = session.post(f"{BASE_URL}/api/target-planning", json={
        "name": f"IT200 Monthly Alloc {uuid.uuid4().hex[:6]}",
        "start_date": "2026-06-01",
        "end_date": "2026-09-30",
        "goal_type": "cumulative",
        "total_amount": 600000,
        "milestones": 4,
    })
    assert pr.status_code == 200, pr.text
    plan_id = pr.json()["id"]

    terr_id = str(uuid.uuid4())
    # Territory allocation (600000)
    tr = session.post(f"{BASE_URL}/api/target-planning/{plan_id}/allocations", json={
        "territory_id": terr_id, "territory_name": "West India",
        "level": "territory", "amount": 600000,
    })
    assert tr.status_code == 200, tr.text
    terr_alloc_id = tr.json()["id"]

    # Two city allocations under the territory
    cities = {}
    for city_name, amt in [("Mumbai", 400000), ("Pune", 200000)]:
        cr = session.post(f"{BASE_URL}/api/target-planning/{plan_id}/allocations", json={
            "territory_id": terr_id, "territory_name": "West India",
            "city": city_name, "level": "city", "amount": amt,
            "parent_allocation_id": terr_alloc_id,
        })
        assert cr.status_code == 200, cr.text
        cities[city_name] = {"allocation_id": cr.json()["id"], "amount": amt}

    yield {"plan_id": plan_id, "cities": cities}

    session.delete(f"{BASE_URL}/api/target-planning/{plan_id}")


def _get_matrix(session, plan_id):
    r = session.get(f"{BASE_URL}/api/target-planning/{plan_id}/monthly-allocation")
    assert r.status_code == 200, r.text
    return r.json()


def test_01_matrix_shape(session, plan):
    m = _get_matrix(session, plan["plan_id"])
    keys = [mm["key"] for mm in m["months"]]
    assert keys == ["2026-06", "2026-07", "2026-08", "2026-09"], keys
    # two city rows, each starting fully unallocated (balance == total)
    by_city = {r["city"]: r for r in m["rows"]}
    assert set(by_city) == {"Mumbai", "Pune"}
    assert by_city["Mumbai"]["total_target"] == 400000
    assert by_city["Mumbai"]["allocated_total"] == 0
    assert by_city["Mumbai"]["balance"] == 400000
    assert by_city["Mumbai"]["is_balanced"] is False
    assert m["is_balanced"] is False
    assert m["grand_target"] == 600000


def test_02_draft_save_persists_but_unbalanced(session, plan):
    cities = plan["cities"]
    body = {
        "finalize": False,
        "rows": [
            {"allocation_id": cities["Mumbai"]["allocation_id"],
             "monthly": {"2026-06": 100000, "2026-07": 100000}},  # only 200k of 400k
            {"allocation_id": cities["Pune"]["allocation_id"],
             "monthly": {"2026-06": 50000}},  # only 50k of 200k
        ],
    }
    r = session.put(f"{BASE_URL}/api/target-planning/{plan['plan_id']}/monthly-allocation", json=body)
    assert r.status_code == 200, r.text
    m = r.json()
    by_city = {row["city"]: row for row in m["rows"]}
    assert by_city["Mumbai"]["allocated_total"] == 200000
    assert by_city["Mumbai"]["balance"] == 200000
    assert by_city["Pune"]["allocated_total"] == 50000
    assert m["is_balanced"] is False
    assert m["finalized"] is False


def test_03_finalize_rejected_when_unbalanced(session, plan):
    cities = plan["cities"]
    body = {
        "finalize": True,
        "rows": [
            {"allocation_id": cities["Mumbai"]["allocation_id"],
             "monthly": {"2026-06": 100000, "2026-07": 100000, "2026-08": 100000, "2026-09": 100000}},  # 400k OK
            {"allocation_id": cities["Pune"]["allocation_id"],
             "monthly": {"2026-06": 50000}},  # 50k of 200k -> mismatch
        ],
    }
    r = session.put(f"{BASE_URL}/api/target-planning/{plan['plan_id']}/monthly-allocation", json=body)
    assert r.status_code == 400, r.text
    detail = r.json()["detail"]
    mismatches = detail["mismatches"] if isinstance(detail, dict) else []
    assert any(mm["city"] == "Pune" and mm["balance"] == 150000 for mm in mismatches), detail


def test_04_finalize_succeeds_when_balanced(session, plan):
    cities = plan["cities"]
    body = {
        "finalize": True,
        "rows": [
            {"allocation_id": cities["Mumbai"]["allocation_id"],
             "monthly": {"2026-06": 100000, "2026-07": 100000, "2026-08": 100000, "2026-09": 100000}},
            {"allocation_id": cities["Pune"]["allocation_id"],
             "monthly": {"2026-06": 50000, "2026-07": 50000, "2026-08": 50000, "2026-09": 50000}},
        ],
    }
    r = session.put(f"{BASE_URL}/api/target-planning/{plan['plan_id']}/monthly-allocation", json=body)
    assert r.status_code == 200, r.text
    m = r.json()
    assert m["is_balanced"] is True
    assert m["finalized"] is True
    assert m["grand_allocated"] == 600000
    assert m["grand_balance"] == 0
    # per-month totals reconcile (150k each month)
    assert m["month_totals"]["2026-06"] == 150000
    assert m["month_totals"]["2026-09"] == 150000


def test_05_persisted_on_reload(session, plan):
    m = _get_matrix(session, plan["plan_id"])
    assert m["finalized"] is True
    by_city = {row["city"]: row for row in m["rows"]}
    assert by_city["Mumbai"]["monthly"]["2026-08"] == 100000
    assert by_city["Pune"]["monthly"]["2026-07"] == 50000
