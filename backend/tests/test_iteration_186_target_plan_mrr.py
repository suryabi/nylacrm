"""
Iteration 186 — Target Plan dashboard's "Customers On-boarded Revenue"
must show MRR (Monthly Run Rate), not the lifetime estimated_value.

User on 2026-05-28: "The 4.3 L is incorrect. it should pull the MRR — current
month revenue from all the accounts together since the target 1.5 is the MRR
target."
"""
import os
import uuid
import asyncio
from datetime import datetime, timezone, timedelta

import pytest
import requests
from dotenv import load_dotenv
from motor.motor_asyncio import AsyncIOMotorClient

load_dotenv("/app/backend/.env")

BASE_URL = os.environ.get(
    "REACT_APP_BACKEND_URL",
    "https://stock-analytics-pro-3.preview.emergentagent.com",
).rstrip("/")
ADMIN_EMAIL = "surya.yadavalli@nylaairwater.earth"
ADMIN_PASS = "test123"
TENANT_ID = "nyla-air-water"


def _login():
    r = requests.post(
        f"{BASE_URL}/api/auth/login",
        json={"email": ADMIN_EMAIL, "password": ADMIN_PASS},
        timeout=20,
    )
    if r.status_code != 200:
        pytest.skip(f"Login failed: {r.status_code}")
    return r.json()["session_token"]


@pytest.fixture(scope="module")
def token():
    return _login()


def _auth(t):
    return {"Authorization": f"Bearer {t}"}


def _db():
    return AsyncIOMotorClient(os.environ["MONGO_URL"])[os.environ["DB_NAME"]]


@pytest.fixture(scope="module")
def scenario():
    """Seed:
       * Plan with start_date = first of this month, end_date = end of month,
         total_amount = 1_50_00_000 (₹1.5 Cr).
       * Three won leads in cities scoped to the plan's territory allocations:
           - Lead A: cached estimated_monthly_revenue = ₹2,00,000
                     (this is the fast path)
           - Lead B: no cached field, but `monthly_bottles = 1000` &
                     `proposed_sku_pricing = [{percentage: 100, price_per_unit: 80}]`
                     → derived MRR = ₹80,000 (the fallback path)
           - Lead C: estimated_value = ₹10_00_000 (lifetime) but no monthly
                     fields → MRR contribution = 0 (must NOT use lifetime).
       Expected `estimated_revenue.achieved` = 2,00,000 + 80,000 + 0 = ₹2,80,000.
    """
    plan_id = str(uuid.uuid4())
    leads = []
    now = datetime.now(timezone.utc)
    start = now.replace(day=1).strftime("%Y-%m-%d")
    end = (now.replace(day=28) + timedelta(days=4)).replace(day=1).strftime("%Y-%m-%d")
    today = now.strftime("%Y-%m-%dT00:00:00+00:00")

    city = f"ITER186-City-{uuid.uuid4().hex[:6]}"

    async def _setup():
        db = _db()
        # Minimal plan with one territory allocation covering our city.
        await db.target_plans_v2.insert_one({
            "id": plan_id, "tenant_id": TENANT_ID,
            "plan_name": "ITER186 Monthly Plan",
            "start_date": start, "end_date": end,
            "total_amount": 15_000_000,
            "milestones": 4,
            "goal_type": "cumulative",
            "city_allocations": [{
                "city": city, "amount": 15_000_000,
                "child_allocations": [],
            }],
        })

        # Lead A — cached MRR
        leads.append({
            "id": str(uuid.uuid4()), "tenant_id": TENANT_ID,
            "status": "won", "city": city, "territory": "T1",
            "updated_at": today,
            "estimated_value": 50_000_000,   # lifetime — must be IGNORED
            "opportunity_estimation": {"estimated_monthly_revenue": 200_000},
        })
        # Lead B — fallback compute from proposed_sku_pricing
        leads.append({
            "id": str(uuid.uuid4()), "tenant_id": TENANT_ID,
            "status": "won", "city": city, "territory": "T1",
            "updated_at": today,
            "estimated_value": 99_999_999,   # lifetime — must be IGNORED
            "opportunity_estimation": {
                "final_monthly": 1000,
                # no estimated_monthly_revenue cached
            },
            "proposed_sku_pricing": [{"percentage": 100, "price_per_unit": 80}],
        })
        # Lead C — only has lifetime (legacy) — must contribute 0 to MRR
        leads.append({
            "id": str(uuid.uuid4()), "tenant_id": TENANT_ID,
            "status": "won", "city": city, "territory": "T2",
            "updated_at": today,
            "estimated_value": 10_00_000,
        })
        await db.leads.insert_many(leads)

    async def _teardown():
        db = _db()
        await db.leads.delete_many({"id": {"$in": [l["id"] for l in leads]}})
        await db.target_plans_v2.delete_one({"id": plan_id})

    asyncio.run(_setup())
    yield {"plan_id": plan_id, "city": city}
    asyncio.run(_teardown())


def test_estimated_revenue_uses_mrr_not_lifetime(token, scenario):
    r = requests.get(
        f"{BASE_URL}/api/target-planning/{scenario['plan_id']}/dashboard",
        headers=_auth(token), timeout=30,
    )
    assert r.status_code == 200, r.text
    body = r.json()
    achieved = body["estimated_revenue"]["achieved"]
    # ₹2,00,000 (cached) + ₹80,000 (computed: 1000 × 80) + ₹0 (no MRR data)
    # Other tenant won-leads may add to this — assert lower bound matching
    # OUR 3 seeded leads while making sure lifetime values aren't used.
    assert achieved >= 280_000, (
        f"Expected MRR achieved ≥ ₹2,80,000 (our 3 leads), got ₹{achieved:,}."
    )
    # If lifetime were leaking in, achieved would jump by ₹50M / ₹100M / ₹10L.
    assert achieved < 50_000_000, (
        f"Achieved ₹{achieved:,} looks like lifetime estimated_value leaked in."
    )
    assert body["estimated_revenue"]["won_leads_count"] >= 3
