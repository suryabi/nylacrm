"""Read-only audit of master_skus packaging_config across flows.
Entry shape: {packaging_type_id, packaging_type_name, units_per_package, is_default}
Finds: missing units, name<->units mismatch, same pack-id with differing
units/name across flows or across SKUs, missing default, empty configs."""
import os, asyncio, re
from collections import defaultdict
from motor.motor_asyncio import AsyncIOMotorClient
from dotenv import load_dotenv

load_dotenv('/app/backend/.env')
FLOWS = ['production', 'stock_in', 'stock_out', 'promo_stock_out']


def trailing_num(nm):
    m = re.search(r'(\d+)\s*$', (nm or '').strip())
    return int(m.group(1)) if m else None


async def main():
    db = AsyncIOMotorClient(os.environ['MONGO_URL'])[os.environ['DB_NAME']]
    skus = await db.master_skus.find({}, {'_id': 0}).to_list(2000)
    real = [s for s in skus if not (s.get('sku_name') or '').startswith('TEST') and not (s.get('sku_name') or '').startswith('Test')]
    print(f"Total master_skus: {len(skus)} | non-test: {len(real)}\n")

    issues = defaultdict(list)
    global_pack = defaultdict(set)   # pack_id -> set of (name, units) seen anywhere
    for s in real:
        name = s.get('sku_name')
        pc = s.get('packaging_config') or {}
        present_flows = [f for f in FLOWS if pc.get(f)]
        if not present_flows:
            issues['no_packaging_config'].append(f"{name} (unit='{s.get('unit')}')")
            continue
        id_units = defaultdict(set)
        for flow in FLOWS:
            entries = pc.get(flow) or []
            has_default = False
            for e in entries:
                pid = e.get('packaging_type_id')
                pn = (e.get('packaging_type_name') or '').strip()
                u = e.get('units_per_package')
                if e.get('is_default'):
                    has_default = True
                if u in (None, 0, ''):
                    issues['missing_units'].append(f"{name} [{flow}] '{pn}' units={u}")
                tn = trailing_num(pn)
                if tn is not None and u is not None and tn != u:
                    issues['name_vs_units_mismatch'].append(f"{name} [{flow}] '{pn}' but units_per_package={u}")
                if pid:
                    id_units[pid].add((pn, u))
                    global_pack[pid].add((pn, u))
            if entries and not has_default:
                issues['no_default'].append(f"{name} [{flow}]")
        for pid, vals in id_units.items():
            if len({v[1] for v in vals}) > 1:
                issues['intra_sku_id_drift'].append(f"{name}: pack-id {pid[:8]} has differing units across flows {sorted(vals)}")
        if 'promo_stock_out' not in present_flows:
            issues['no_promo_flow'].append(name)

    # cross-SKU: same packaging_type_id meaning different things
    for pid, vals in global_pack.items():
        if len({v[1] for v in vals}) > 1:
            issues['cross_sku_id_drift'].append(f"pack-id {pid[:8]} used with DIFFERENT units across SKUs: {sorted(vals)}")

    def dump(key, title):
        rows = issues.get(key, [])
        print(f"### {title}: {len(rows)}")
        for r in rows[:60]:
            print(f"  - {r}")
        print()

    dump('no_packaging_config', 'Non-test SKUs with NO packaging_config')
    dump('name_vs_units_mismatch', 'Pack NAME number != units_per_package (e.g. "Carton-6" but units=8)')
    dump('missing_units', 'Pack entries with missing/0 units')
    dump('intra_sku_id_drift', 'Same pack-id, different units across flows within one SKU')
    dump('cross_sku_id_drift', 'Same pack-id, different units across different SKUs')
    dump('no_default', 'Flows with packs but NO default')
    dump('no_promo_flow', 'SKUs missing promo_stock_out flow (promo falls back / can miscount)')

asyncio.run(main())
