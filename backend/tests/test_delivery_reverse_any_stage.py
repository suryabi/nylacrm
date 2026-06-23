"""E2E test for universal Stock-Out reversal (any stage).

Seeds a COMPLETED distributor delivery whose stock was deducted, then exercises
the reverse endpoint over HTTP:
  - reversing a non-draft delivery WITHOUT acknowledge → 400 (double-confirm guard)
  - reversing WITH acknowledge=true → 200, status 'reversed', stock added back.
"""
import asyncio
import os
import uuid
from pathlib import Path

import pytest
import requests

from database import db


def _backend_url():
    p = Path("/app/frontend/.env")
    for line in p.read_text().splitlines():
        if line.startswith("REACT_APP_BACKEND_URL="):
            return line.split("=", 1)[1].strip()
    return os.environ.get("REACT_APP_BACKEND_URL", "")


BASE = _backend_url().rstrip("/")
API = f"{BASE}/api"
DIST_ID = "3b92cc38-092e-4666-b0b5-c9dd70f50ac3"  # Cost Card Testing (single-location Goa)


def _run(coro):
    return asyncio.get_event_loop().run_until_complete(coro)


def _login():
    r = requests.post(f"{API}/auth/login",
                      json={"email": "surya.yadavalli@nylaairwater.earth", "password": "test123"}, timeout=30)
    r.raise_for_status()
    return r.json()["session_token"]


def test_reverse_completed_delivery_readds_stock_and_guards_ack():
    token = _login()
    hdr = {"Authorization": f"Bearer {token}"}

    sku_id = f"test-sku-{uuid.uuid4().hex[:8]}"
    delivery_id = str(uuid.uuid4())
    item_id = str(uuid.uuid4())

    async def setup():
        # tenant + active non-factory location for this distributor
        dist = await db.distributors.find_one({"id": DIST_ID}, {"_id": 0, "tenant_id": 1})
        tenant = dist["tenant_id"]
        loc = await db.distributor_locations.find_one(
            {"distributor_id": DIST_ID, "tenant_id": tenant, "is_factory": {"$ne": True}}, {"_id": 0, "id": 1})
        loc_id = loc["id"]
        # stock row currently 100 (post-deduction baseline)
        await db.distributor_stock.insert_one({
            "id": str(uuid.uuid4()), "tenant_id": tenant, "distributor_id": DIST_ID,
            "distributor_location_id": loc_id, "sku_id": sku_id, "batch_id": None, "quantity": 100,
        })
        # a COMPLETED delivery that already deducted 10
        await db.distributor_deliveries.insert_one({
            "id": delivery_id, "tenant_id": tenant, "distributor_id": DIST_ID,
            "distributor_location_id": loc_id, "delivery_number": "DEL-TEST-REV",
            "status": "complete", "account_id": "acct-test",
        })
        await db.distributor_delivery_items.insert_one({
            "id": item_id, "tenant_id": tenant, "delivery_id": delivery_id,
            "sku_id": sku_id, "quantity": 10, "batch_id": None,
        })
        return tenant, loc_id

    async def stock_qty(tenant, loc_id):
        row = await db.distributor_stock.find_one(
            {"tenant_id": tenant, "distributor_id": DIST_ID, "distributor_location_id": loc_id,
             "sku_id": sku_id}, {"_id": 0, "quantity": 1})
        return (row or {}).get("quantity")

    async def cleanup(tenant):
        await db.distributor_stock.delete_many({"tenant_id": tenant, "sku_id": sku_id})
        await db.distributor_deliveries.delete_many({"id": delivery_id})
        await db.distributor_delivery_items.delete_many({"delivery_id": delivery_id})

    tenant, loc_id = _run(setup())
    try:
        # Guard: non-draft without acknowledge → 400
        r1 = requests.post(f"{API}/distributors/{DIST_ID}/deliveries/{delivery_id}/reverse", headers=hdr, timeout=30)
        assert r1.status_code == 400, f"expected 400 guard, got {r1.status_code}: {r1.text}"

        # With acknowledge → 200, stock added back (100 → 110)
        r2 = requests.post(f"{API}/distributors/{DIST_ID}/deliveries/{delivery_id}/reverse",
                           headers=hdr, params={"acknowledge": "true", "reason": "test"}, timeout=30)
        assert r2.status_code == 200, f"expected 200, got {r2.status_code}: {r2.text}"
        body = r2.json()
        assert body["delivery"]["status"] == "reversed"
        assert _run(stock_qty(tenant, loc_id)) == 110, "stock should be added back (+10)"
    finally:
        _run(cleanup(tenant))
