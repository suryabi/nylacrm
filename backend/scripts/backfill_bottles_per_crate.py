"""OPTIONAL, SAFE backfill: fill the `bottles_per_crate` (crate size) HINT field
wherever it is missing/<=1 but the SKU actually has a multi-unit crate packaging.

You do NOT need to run this for the Transfer-to-Master-Warehouse fix — the backend
now derives the crate size from the SKU packaging at read-time. This script only
tidies the stored hint field for display consistency on legacy rows.

SAFETY GUARANTEES:
  * Only ever WRITES `bottles_per_crate`. Never touches any quantity / balance /
    total / received / delivered / on-hand / passed / rejected field.
  * Only fills rows where `bottles_per_crate` is missing or <= 1. Never overwrites
    an existing real crate size (> 1).
  * Derives the value from the SKU's own configured packaging (same source the app
    already uses everywhere else).
  * Idempotent — re-running is a no-op.
  * DRY-RUN BY DEFAULT: prints exactly what it *would* change and writes NOTHING.
    You must pass --apply to actually write.

Usage:
    # 1) Preview only (writes nothing):
    cd /app/backend && python scripts/backfill_bottles_per_crate.py

    # 2) Apply for real (after reviewing the preview):
    cd /app/backend && python scripts/backfill_bottles_per_crate.py --apply
"""
import argparse
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


async def main(apply: bool):
    client = AsyncIOMotorClient(os.environ["MONGO_URL"])
    db = client[os.environ["DB_NAME"]]

    mode = "APPLY (writing changes)" if apply else "DRY-RUN (no writes — preview only)"
    print(f"\n=== bottles_per_crate backfill — {mode} ===\n")

    # Build SKU crate-size map (across all tenants)
    sku_map = {}
    async for ms in db.master_skus.find({}, {"_id": 0, "id": 1, "packaging_config": 1, "bottles_per_crate": 1}):
        sku_map[ms["id"]] = crate_units_from_sku(ms)

    stats = {"master_skus": 0, "production_batches": 0, "factory_warehouse_stock": 0}
    MAX_PRINT = 40

    async def process(collection_name, extra_proj=None):
        coll = db[collection_name]
        proj = {"_id": 0, "id": 1, "bottles_per_crate": 1}
        if extra_proj:
            proj.update(extra_proj)
        printed = 0
        async for doc in coll.find({}, proj):
            if not _missing(doc.get("bottles_per_crate")):
                continue
            if collection_name == "master_skus":
                crate = crate_units_from_sku(
                    await db.master_skus.find_one({"id": doc["id"]}, {"_id": 0, "packaging_config": 1, "bottles_per_crate": 1})
                )
            else:
                crate = sku_map.get(doc.get("sku_id"))
            if not (crate and crate > 1):
                continue
            stats[collection_name] += 1
            if printed < MAX_PRINT:
                label = doc.get("batch_code") or doc.get("sku_name") or doc.get("id")
                print(f"  [{collection_name}] {label}: bottles_per_crate {doc.get('bottles_per_crate')!r} -> {crate}")
                printed += 1
            if apply:
                await coll.update_one({"id": doc["id"]}, {"$set": {"bottles_per_crate": crate}})
        if stats[collection_name] > printed:
            print(f"  ... and {stats[collection_name] - printed} more in {collection_name}")

    await process("master_skus")
    await process("production_batches", {"sku_id": 1, "sku_name": 1, "batch_code": 1})
    await process("factory_warehouse_stock", {"sku_id": 1, "sku_name": 1})

    print("\n--- Summary (rows " + ("updated" if apply else "that WOULD be updated") + ") ---")
    for k, v in stats.items():
        print(f"  {k}: {v}")
    if not apply:
        print("\nNo changes were written (dry-run). Re-run with --apply to write.\n")
    else:
        print("\nDone. Changes written.\n")
    client.close()


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Backfill bottles_per_crate hint field (safe, idempotent).")
    parser.add_argument("--apply", action="store_true", help="Actually write changes (default is dry-run/preview).")
    args = parser.parse_args()
    asyncio.run(main(args.apply))
