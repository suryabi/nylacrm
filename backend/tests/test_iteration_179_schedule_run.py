"""
Iteration 179 — Delivery Schedule run lifecycle:
  - POST /api/distributor/delivery-schedules/{id}/start  (approved → in_progress)
  - POST /api/distributor/delivery-schedules/{id}/finish (in_progress → completed)
  - POST /api/distributors/{did}/deliveries/{delivery_id}/complete records delivered_at
  - _enrich_schedule surfaces `delivered_at` + `delivered_by_name` per stop

Strategy: seed a minimal schedule directly via Mongo as the test distributor user
(brian / DIST-0003), then drive it through the state machine via HTTP.
"""
import os
import uuid
import asyncio
from datetime import datetime, timezone

import pytest
import requests
from dotenv import load_dotenv
from motor.motor_asyncio import AsyncIOMotorClient

load_dotenv("/app/backend/.env")

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "https://bevmail-documents.preview.emergentagent.com").rstrip("/")
DIST_EMAIL = "john.distributor@test.com"
DIST_PASS = "nyladist##"

# Pre-seeded distributor user (from /app/memory/test_credentials.md)
DISTRIBUTOR_ID = "bb12d90e-4d33-4890-ac5f-17573c551b5c"  # Brian (DIST-0003)
TENANT_ID = "nyla-air-water"


def _login(email, password):
    r = requests.post(f"{BASE_URL}/api/auth/login", json={"email": email, "password": password}, timeout=20)
    if r.status_code != 200:
        pytest.skip(f"Login failed: {r.status_code} {r.text[:200]}")
    return r.json().get("session_token") or r.json().get("token")


@pytest.fixture(scope="module")
def dist_token():
    return _login(DIST_EMAIL, DIST_PASS)


def _auth(tok):
    return {"Authorization": f"Bearer {tok}"}


def _db():
    return AsyncIOMotorClient(os.environ["MONGO_URL"])[os.environ["DB_NAME"]]


@pytest.fixture(scope="module")
def seeded_schedule(dist_token):
    """Create a minimal `approved` schedule with two deliveries directly via Mongo.
    Yields (schedule_id, [delivery_ids]). Cleans up afterwards."""
    schedule_id = str(uuid.uuid4())
    delivery_ids = [str(uuid.uuid4()), str(uuid.uuid4())]
    now = datetime.now(timezone.utc).isoformat()

    async def _setup():
        db = _db()
        # 2 deliveries pre-pinned to "delivery_scheduled"
        for did in delivery_ids:
            await db.distributor_deliveries.insert_one({
                "id": did,
                "tenant_id": TENANT_ID,
                "distributor_id": DISTRIBUTOR_ID,
                "delivery_number": f"DEL-TEST-{did[:8]}",
                "account_id": "test-account",
                "account_name": "Test Account",
                "delivery_address": {"city": "Hyderabad", "state": "Telangana"},
                "status": "delivery_scheduled",
                "created_at": now,
            })
        await db.distributor_delivery_schedules.insert_one({
            "id": schedule_id,
            "tenant_id": TENANT_ID,
            "distributor_id": DISTRIBUTOR_ID,
            "schedule_date": now[:10],
            "delivery_ids": delivery_ids,
            "status": "approved",
            "approved_at": now,
            "approved_by_name": "Test Approver",
            "created_at": now,
            "updated_at": now,
        })

    async def _teardown():
        db = _db()
        await db.distributor_delivery_schedules.delete_one({"id": schedule_id})
        for did in delivery_ids:
            await db.distributor_deliveries.delete_one({"id": did})

    asyncio.run(_setup())
    yield schedule_id, delivery_ids
    asyncio.run(_teardown())


class TestScheduleRunLifecycle:

    def test_cannot_start_unless_approved(self, dist_token, seeded_schedule):
        sid, _ = seeded_schedule
        # First, finish-before-start should fail too
        r = requests.post(f"{BASE_URL}/api/distributor/delivery-schedules/{sid}/finish",
                          headers=_auth(dist_token), timeout=20)
        assert r.status_code == 400, r.text
        assert "in-progress" in r.json()["detail"].lower()

    def test_start_transitions_approved_to_in_progress(self, dist_token, seeded_schedule):
        sid, dids = seeded_schedule
        r = requests.post(f"{BASE_URL}/api/distributor/delivery-schedules/{sid}/start",
                          headers=_auth(dist_token), timeout=20)
        assert r.status_code == 200, r.text
        data = r.json()
        assert data["status"] == "in_progress"
        assert data.get("started_at")
        assert data.get("started_by_name")
        # Underlying deliveries lifted to on_the_way
        async def _check():
            db = _db()
            docs = await db.distributor_deliveries.find(
                {"id": {"$in": dids}}, {"_id": 0, "status": 1}
            ).to_list(10)
            return [d["status"] for d in docs]
        statuses = asyncio.run(_check())
        assert all(s == "on_the_way" for s in statuses), statuses

    def test_double_start_rejected(self, dist_token, seeded_schedule):
        sid, _ = seeded_schedule
        r = requests.post(f"{BASE_URL}/api/distributor/delivery-schedules/{sid}/start",
                          headers=_auth(dist_token), timeout=20)
        assert r.status_code == 400
        assert "approved" in r.json()["detail"].lower()

    def test_mark_stop_delivered_records_timestamp(self, dist_token, seeded_schedule):
        _, dids = seeded_schedule
        # Mark only the FIRST delivery; leave second one to be "skipped".
        r = requests.post(
            f"{BASE_URL}/api/distributors/{DISTRIBUTOR_ID}/deliveries/{dids[0]}/complete",
            headers=_auth(dist_token), timeout=20,
        )
        assert r.status_code == 200, r.text
        body = r.json()
        assert body.get("status") == "complete"

        # Verify the underlying delivery row carries `delivered_at`
        async def _check():
            db = _db()
            doc = await db.distributor_deliveries.find_one({"id": dids[0]}, {"_id": 0})
            return doc
        doc = asyncio.run(_check())
        assert doc["status"] == "complete"
        assert doc.get("delivered_at")

    def test_enriched_schedule_surfaces_delivered_at(self, dist_token, seeded_schedule):
        sid, dids = seeded_schedule
        r = requests.get(f"{BASE_URL}/api/distributor/delivery-schedules/{sid}",
                         headers=_auth(dist_token), timeout=20)
        assert r.status_code == 200
        data = r.json()
        first = next((d for d in data["deliveries"] if d["id"] == dids[0]), None)
        second = next((d for d in data["deliveries"] if d["id"] == dids[1]), None)
        assert first and first.get("delivered_at"), "First stop should carry delivered_at"
        assert first.get("status") == "complete"
        assert second and not second.get("delivered_at"), "Second stop should NOT yet carry delivered_at"

    def test_finish_locks_schedule_with_audit_counts(self, dist_token, seeded_schedule):
        sid, _ = seeded_schedule
        r = requests.post(f"{BASE_URL}/api/distributor/delivery-schedules/{sid}/finish",
                          headers=_auth(dist_token), timeout=20)
        assert r.status_code == 200, r.text
        data = r.json()
        assert data["status"] == "completed"
        assert data.get("completed_at")
        assert data.get("completed_by_name")
        assert data.get("completed_total_count") == 2
        # One delivered, one skipped
        assert data.get("completed_delivered_count") == 1

    def test_cannot_start_after_finish(self, dist_token, seeded_schedule):
        sid, _ = seeded_schedule
        r = requests.post(f"{BASE_URL}/api/distributor/delivery-schedules/{sid}/start",
                          headers=_auth(dist_token), timeout=20)
        assert r.status_code == 400
        assert "approved" in r.json()["detail"].lower()
