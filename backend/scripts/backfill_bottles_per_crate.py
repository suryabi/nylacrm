"""Idempotent backfill: ensure `bottles_per_crate` (crate size) is set wherever
it's missing/≤1 but the SKU actually has a multi-unit crate packaging.

Fixes the "crates counted as bottles" class of bugs on the Transfer-to-Master-
Warehouse flow and the stock dashboard's bottles→crates display conversion.

SAFE: only fills the crate-size hint field. It never recomputes derived totals
(total_bottles / passed / rejected balances). Run anytime; re-running is a no-op.

Usage:
    cd /app/backend && python scripts/backfill_bottles_per_crate.py
"""
import asyncio
import os
from motor.motor_asyncio import AsyncIOMotorClient
from dotenv import load_dotenv

load_dotenv()


def crate_units_from_sku(sku_doc: dict):
    if not sku_doc:
        return None
    pc = sku_doc.get("packaging_config") or {}
    prod = pc.get("production") or []
    default = next((p for p in prod if p.get("is_default")), None) or (prod[0] if prod else None)
    if default:
        u = int(default.get("units_per_package") or 0)
        if u > 1:
            return u
    for key in ("production", "stock_out", "master", "stock_in"):
        for p in (pc.get(key) or []):
            u = int(p.get("units_per_package") or 0)
            if u > 1:
                return u
    bpc = sku_doc.get("bottles_per_crate")
    try:
        if bpc and int(bpc) > 1:
            return int(bpc)
    except (TypeError, ValueError):
        pass
    return None


def _missing(v) -> bool:
    try:
        return v is None or int(v) <= 1
    except (TypeError, ValueError):
        return True


async def main():
    client = AsyncIOMotorClient(os.environ["MONGO_URL"])
    db = client[os.environ["DB_NAME"]]

    # Build SKU crate-size map (across all tenants)
    sku_map = {}
    async for ms in db.master_skus.find({}, {"_id": 0, "id": 1, "packaging_config": 1, "bottles_per_crate": 1}):
        sku_map[ms["id"]] = crate_units_from_sku(ms)

    stats = {"master_skus": 0, "production_batches": 0, "factory_warehouse_stock": 0}

    # 1) master_skus: set explicit bottles_per_crate when derivable and missing
    async for ms in db.master_skus.find({}, {"_id": 0, "id": 1, "bottles_per_crate": 1, "packaging_config": 1}):
        crate = crate_units_from_sku(ms)
        if crate and _missing(ms.get("bottles_per_crate")):
            await db.master_skus.update_one({"id": ms["id"]}, {"$set": {"bottles_per_crate": crate}})
            stats["master_skus"] += 1

    # 2) production_batches: set crate size (field only; does NOT recompute totals)
    async for b in db.production_batches.find({}, {"_id": 0, "id": 1, "sku_id": 1, "bottles_per_crate": 1}):
        if not _missing(b.get("bottles_per_crate")):
            continue
        crate = sku_map.get(b.get("sku_id"))
        if crate and crate > 1:
            await db.production_batches.update_one({"id": b["id"]}, {"$set": {"bottles_per_crate": crate}})
            stats["production_batches"] += 1

    # 3) factory_warehouse_stock: set crate size for correct bottles→crates display
    async for fws in db.factory_warehouse_stock.find({}, {"_id": 0, "id": 1, "sku_id": 1, "bottles_per_crate": 1}):
        if not _missing(fws.get("bottles_per_crate")):
            continue
        crate = sku_map.get(fws.get("sku_id"))
        if crate and crate > 1:
            await db.factory_warehouse_stock.update_one({"id": fws["id"]}, {"$set": {"bottles_per_crate": crate}})
            stats["factory_warehouse_stock"] += 1

    print("Backfill complete. Updated:")
    for k, v in stats.items():
        print(f"  {k}: {v}")
    client.close()


if __name__ == "__main__":
    asyncio.run(main())
