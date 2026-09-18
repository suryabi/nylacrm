"""Seed / cleanup QA deliveries for Customer Stock Dashboard tests.

Usage:
  python seed_csd_qa.py seed
  python seed_csd_qa.py clean
"""
import asyncio
import os
import sys
import uuid
from datetime import datetime, timezone, timedelta
from motor.motor_asyncio import AsyncIOMotorClient
from dotenv import load_dotenv

load_dotenv("/app/backend/.env")
MONGO_URL = os.environ["MONGO_URL"]
DB_NAME = os.environ["DB_NAME"]

TENANT_ID = "nyla-air-water"
DFT_ACCOUNT_ID = "56b872b1-02e7-4a99-8391-8558c968f450"
BRIAN_ID = "bb12d90e-4d33-4890-ac5f-17573c551b5c"


async def get_taj_account_id(db):
    a = await db.accounts.find_one({"tenant_id": TENANT_ID, "account_name": "Taj Sarees"}, {"_id": 0, "id": 1})
    if not a:
        raise RuntimeError("Taj Sarees not found")
    return a["id"]


async def any_distributor_location(db):
    loc = await db.distributor_locations.find_one({"tenant_id": TENANT_ID}, {"_id": 0, "id": 1})
    return loc["id"] if loc else "5fff767e-7aed-4a36-b805-313000000000"


async def seed():
    client = AsyncIOMotorClient(MONGO_URL)
    db = client[DB_NAME]
    today = datetime.now(timezone.utc).date()
    taj_id = await get_taj_account_id(db)
    loc_id = await any_distributor_location(db)

    docs = [
        {
            "id": str(uuid.uuid4()),
            "tenant_id": TENANT_ID,
            "delivery_number": "QA-CSD-0001",
            "status": "delivered",
            "delivery_date": (today - timedelta(days=55)).isoformat(),
            "total_quantity": 150,
            "distributor_id": BRIAN_ID,
            "distributor_name": "Brian",
            "distributor_location_id": loc_id,
            "account_id": DFT_ACCOUNT_ID,
            "account_name": "Drive Folder Test Lead",
            "created_at": datetime.now(timezone.utc).isoformat(),
        },
        {
            "id": str(uuid.uuid4()),
            "tenant_id": TENANT_ID,
            "delivery_number": "QA-CSD-0002",
            "status": "delivered",
            "delivery_date": (today - timedelta(days=25)).isoformat(),
            "total_quantity": 150,
            "distributor_id": BRIAN_ID,
            "distributor_name": "Brian",
            "distributor_location_id": loc_id,
            "account_id": DFT_ACCOUNT_ID,
            "account_name": "Drive Folder Test Lead",
            "created_at": datetime.now(timezone.utc).isoformat(),
        },
        {
            "id": str(uuid.uuid4()),
            "tenant_id": TENANT_ID,
            "delivery_number": "QA-CSD-0003",
            "status": "delivered",
            "delivery_date": (today - timedelta(days=21)).isoformat(),
            "total_quantity": 10,
            "distributor_id": BRIAN_ID,
            "distributor_name": "Brian",
            "distributor_location_id": loc_id,
            "account_id": taj_id,
            "account_name": "Taj Sarees",
            "created_at": datetime.now(timezone.utc).isoformat(),
        },
    ]
    # Idempotent: remove any prior QA-CSD-* first
    await db.distributor_deliveries.delete_many({"delivery_number": {"$regex": "^QA-CSD-"}})
    r = await db.distributor_deliveries.insert_many(docs)
    print(f"Seeded {len(r.inserted_ids)} deliveries. Taj id={taj_id}, loc={loc_id}")
    print(f"Today={today}, DFT dates: {docs[0]['delivery_date']}, {docs[1]['delivery_date']}, Taj: {docs[2]['delivery_date']}")


async def clean():
    client = AsyncIOMotorClient(MONGO_URL)
    db = client[DB_NAME]
    r = await db.distributor_deliveries.delete_many({"delivery_number": {"$regex": "^QA-CSD-"}})
    print(f"Deleted {r.deleted_count} QA-CSD deliveries")


if __name__ == "__main__":
    cmd = sys.argv[1] if len(sys.argv) > 1 else "seed"
    asyncio.run(clean() if cmd == "clean" else seed())
