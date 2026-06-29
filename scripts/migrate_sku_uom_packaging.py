"""One-shot, idempotent migration for the SKU UOM + Packaging Master feature.

For every master_sku:
  1. Sets base_uom = "Bottle" when missing.
  2. Builds packaging_config.master = union of existing per-flow packs
     (dedup by packaging_type_id; units come from the existing entries).
  3. For non-test SKUs that have NO packaging at all, seeds a single default
     pack equal to the base unit ("Bottle" = 1) into master + all flows, so
     stock-out/promo never silently fall back to 1:1.

Re-running is safe: master is recomputed from current state; base pack is only
seeded when both master and all flows are empty.
"""
import os, asyncio, uuid
from motor.motor_asyncio import AsyncIOMotorClient
from dotenv import load_dotenv

load_dotenv('/app/backend/.env')
FLOWS = ['production', 'stock_in', 'stock_out', 'promo_stock_out']


def derive_master(pc):
    seen = {}
    order = []
    for m in (pc.get('master') or []):
        pid = m.get('packaging_type_id')
        if pid and pid not in seen:
            seen[pid] = {'packaging_type_id': pid, 'packaging_type_name': m.get('packaging_type_name'), 'units_per_package': m.get('units_per_package')}
            order.append(pid)
    for f in FLOWS:
        for it in (pc.get(f) or []):
            pid = it.get('packaging_type_id')
            if pid and pid not in seen:
                seen[pid] = {'packaging_type_id': pid, 'packaging_type_name': it.get('packaging_type_name'), 'units_per_package': it.get('units_per_package')}
                order.append(pid)
    return [seen[p] for p in order]


async def main(dry=False):
    db = AsyncIOMotorClient(os.environ['MONGO_URL'])[os.environ['DB_NAME']]
    skus = await db.master_skus.find({}, {'_id': 0}).to_list(2000)
    n_uom = n_master = n_seed = 0
    for s in skus:
        sid = s['id']
        name = s.get('sku_name') or ''
        is_test = name.startswith('TEST') or name.startswith('Test')
        pc = dict(s.get('packaging_config') or {})
        update = {}

        if not s.get('base_uom'):
            update['base_uom'] = 'Bottle'
            n_uom += 1

        master = derive_master(pc)
        has_any_flow = any(pc.get(f) for f in FLOWS)

        if not master and not has_any_flow and not is_test:
            # Seed the base unit as a 1:1 pack so flows are never blank.
            base = (update.get('base_uom') or s.get('base_uom') or 'Bottle')
            pid = str(uuid.uuid4())
            base_pack = {'packaging_type_id': pid, 'packaging_type_name': base, 'units_per_package': 1}
            master = [dict(base_pack)]
            for f in FLOWS:
                pc[f] = [dict(base_pack, is_default=True)]
            n_seed += 1

        # always persist a normalized master (idempotent)
        if master != (s.get('packaging_config') or {}).get('master') or 'master' not in pc:
            n_master += 1
        pc['master'] = master
        update['packaging_config'] = pc

        if update and not dry:
            await db.master_skus.update_one({'id': sid}, {'$set': update})

    print(f"SKUs scanned: {len(skus)}")
    print(f"  base_uom set: {n_uom}")
    print(f"  packaging master written: {n_master}")
    print(f"  empty SKUs seeded with base pack: {n_seed}")
    print("DRY RUN — no writes." if dry else "Writes committed.")

asyncio.run(main(dry=('--dry' in os.sys.argv)))
