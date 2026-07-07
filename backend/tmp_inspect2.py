import asyncio, os
from motor.motor_asyncio import AsyncIOMotorClient
from dotenv import load_dotenv
load_dotenv()
client = AsyncIOMotorClient(os.environ["MONGO_URL"])
db = client[os.environ["DB_NAME"]]

async def main():
    print("=== production_batches for 330 Silver + others (bottles_per_crate) ===")
    batches = await db.production_batches.find(
        {}, {"_id": 0, "id": 1, "batch_code": 1, "sku_name": 1, "sku_id": 1,
             "bottles_per_crate": 1, "total_passed_final": 1, "transferred_to_warehouse": 1,
             "packaging_type_name": 1, "units_per_package": 1}
    ).sort("created_at", -1).to_list(25)
    none_count = 0
    for b in batches:
        bpc = b.get("bottles_per_crate")
        if bpc in (None, 0, 1):
            none_count += 1
        print(f"  {b.get('batch_code')} | {b.get('sku_name')} | bpc={bpc} | passed={b.get('total_passed_final')} | transferred={b.get('transferred_to_warehouse')} | pkg={b.get('packaging_type_name')} upp={b.get('units_per_package')}")
    print(f"\n  Batches with bpc None/0/1: {none_count}/{len(batches)}")

asyncio.run(main())
