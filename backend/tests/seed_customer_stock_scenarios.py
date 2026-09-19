"""Seed demo customers covering every Customer Stock Dashboard scenario.
    python3 tests/seed_customer_stock_scenarios.py          # seed
    python3 tests/seed_customer_stock_scenarios.py --clean  # remove
All docs carry seed_tag = "SEED-CSD" so cleanup is exact."""
import asyncio, os, sys, uuid
from datetime import date, timedelta, datetime, timezone
from dotenv import load_dotenv
load_dotenv('/app/backend/.env')
from motor.motor_asyncio import AsyncIOMotorClient

T = 'nyla-air-water'
TAG = 'SEED-CSD'
DIST = {'id': 'bb12d90e-4d33-4890-ac5f-17573c551b5c', 'name': 'Brian', 'code': 'DIST-0003'}
WH = {'id': 'aa2eda05-1902-4a17-92bb-d33533535297', 'name': 'Delhi'}           # distributor warehouse
SKU_600 = {'id': '20d525e8-c4af-4f40-965a-549dcd50c0a9', 'name': 'Nyla – 600 ml / Silver', 'upc': 12}
SKU_330 = {'id': 'b39203a7-4067-458b-a316-5831a98be946', 'name': 'Nyla – 330 ml / Silver', 'upc': 24}
today = datetime.now(timezone.utc).date()
now = datetime.now(timezone.utc).isoformat()


def d(days_ago): return (today - timedelta(days=days_ago)).isoformat()


# name, city, orders [(days_ago, [(sku, crates)])], branded [(sku, stock_units, label)]
SCENARIOS = [
    ('Seed A · Low Stock – Monthly Buyer', 'Hyderabad',
     [(95, [(SKU_600, 20)]), (64, [(SKU_600, 10)]), (34, [(SKU_600, 20)]), (4, [(SKU_600, 20)])],
     [(SKU_600, 8 * 12, 'Seed A – 600 ml')]),                                    # 8 cr < 20 → RED, priority
    ('Seed B · Stock Covers – Monthly Buyer', 'Bengaluru',
     [(92, [(SKU_600, 15)]), (61, [(SKU_600, 15)]), (30, [(SKU_600, 12)])],
     [(SKU_600, 30 * 12, 'Seed B – 600 ml')]),                                  # 30 cr ≥ 15 → GREEN
    ('Seed C · Frequent Buyer (weekly)', 'Chennai',
     [(35, [(SKU_330, 5)]), (28, [(SKU_330, 5)]), (21, [(SKU_330, 6)]), (14, [(SKU_330, 5)]), (7, [(SKU_330, 5)]), (0, [(SKU_330, 5)])],
     [(SKU_330, 3 * 24, 'Seed C – 330 ml')]),                                   # gap 7d → last+7 ; 3 cr < 5 → RED
    ('Seed D · Single Order Only', 'Pune',
     [(12, [(SKU_600, 8)])],
     [(SKU_600, 10 * 12, 'Seed D – 600 ml')]),                                  # next month same day; GREEN
    ('Seed E · Orders but No Branded SKU', 'Mumbai',
     [(70, [(SKU_600, 6)]), (40, [(SKU_600, 6)]), (10, [(SKU_600, 6)])],
     []),                                                                       # NEUTRAL grey
    ('Seed F · Branded Stock, Never Ordered', 'Kolkata',
     [],
     [(SKU_600, 12 * 12, 'Seed F – 600 ml')]),                                  # dashes, stock 12 cr
    ('Seed G · Two Branded SKUs (one short)', 'Delhi',
     [(88, [(SKU_600, 10), (SKU_330, 4)]), (58, [(SKU_600, 10), (SKU_330, 4)]), (27, [(SKU_600, 10), (SKU_330, 4)])],
     [(SKU_600, 6 * 12, 'Seed G – 600 ml'), (SKU_330, 4 * 24, 'Seed G – 330 ml')]),  # total 10 < 14 → RED, shows Total row
    ('Seed H · Zero Branded Stock', 'Jaipur',
     [(50, [(SKU_600, 5)]), (20, [(SKU_600, 5)])],
     [(SKU_600, 0, 'Seed H – 600 ml')]),                                        # shows 0 crates, RED
    ('Seed I · Irregular Quantities (median)', 'Goa',
     [(100, [(SKU_600, 3)]), (75, [(SKU_600, 9)]), (45, [(SKU_600, 6)]), (15, [(SKU_600, 12)])],
     [(SKU_600, 9 * 12, 'Seed I – 600 ml')]),                                   # no mode → median 7.5; 9 ≥ 7.5 GREEN
]


async def clean(db):
    for coll in ('distributor_delivery_items', 'distributor_deliveries', 'distributor_stock', 'child_skus', 'accounts',
                 'account_distributor_assignments'):
        r = await db[coll].delete_many({'seed_tag': TAG})
        print(f'  {coll}: removed {r.deleted_count}')


async def seed(db):
    await clean(db)
    n_orders = 0
    for idx, (name, city, orders, branded) in enumerate(SCENARIOS):
        acct_id = f'seed-csd-acct-{idx}'
        await db.accounts.insert_one({'id': acct_id, 'account_id': f'SEED-CSD-{idx:02d}', 'account_name': name, 'city': city,
                                      'state': 'Demo', 'category': 'Demo scenario', 'status': 'active', 'lead_type': 'B2B',
                                      'lead_id': f'seed-csd-lead-{idx}', 'territory': 'Demo', 'company': name, 'contact_name': 'Demo Contact',
                                      'phone': '', 'email': '', 'converted_at': now, 'sku_pricing': [],
                                      'tenant_id': T, 'seed_tag': TAG, 'created_at': now, 'updated_at': now})
        await db.account_distributor_assignments.insert_one({'id': str(uuid.uuid4()), 'tenant_id': T, 'account_id': acct_id, 'account_name': name,
                                                             'distributor_id': DIST['id'], 'distributor_name': DIST['name'],
                                                             'distributor_location_id': WH['id'], 'distributor_location_name': WH['name'],
                                                             'is_primary': True, 'status': 'active', 'seed_tag': TAG, 'created_at': now})
        for sku, units, label in branded:
            child_id = f'seed-csd-child-{idx}-{sku["upc"]}'
            await db.child_skus.insert_one({'id': child_id, 'parent_sku_id': sku['id'], 'parent_sku_name': sku['name'],
                                            'child_sku_name': label, 'child_sku_code': label.upper().replace(' ', '-'),
                                            'child_type': 'customer', 'customer_account_id': acct_id, 'customer_account_name': name,
                                            'is_active': True, 'tenant_id': T, 'seed_tag': TAG, 'created_at': now, 'updated_at': now})
            if units > 0:
                await db.distributor_stock.insert_one({'id': str(uuid.uuid4()), 'tenant_id': T, 'distributor_id': DIST['id'],
                                                       'distributor_location_id': WH['id'], 'location_name': WH['name'],
                                                       'sku_id': sku['id'], 'sku_name': sku['name'], 'child_sku_id': child_id,
                                                       'child_sku_name': label, 'batch_id': f'seed-csd-batch-{idx}', 'batch_code': f'SEED-{idx:02d}',
                                                       'quantity': units, 'seed_tag': TAG, 'created_at': now, 'updated_at': now})
        for k, (days_ago, lines) in enumerate(orders):
            did = str(uuid.uuid4())
            total_units = sum(c * s['upc'] for s, c in lines)
            await db.distributor_deliveries.insert_one({'id': did, 'tenant_id': T, 'delivery_number': f'SEED-DEL-{idx:02d}{k:02d}',
                                                        'distributor_id': DIST['id'], 'distributor_name': DIST['name'], 'distributor_code': DIST['code'],
                                                        'distributor_location_id': WH['id'], 'distributor_location_name': WH['name'],
                                                        'account_id': acct_id, 'account_name': name, 'account_city': city,
                                                        'delivery_date': d(days_ago), 'status': 'delivered', 'total_quantity': total_units,
                                                        'delivered_at': f'{d(days_ago)}T10:00:00+00:00', 'seed_tag': TAG,
                                                        'created_at': f'{d(days_ago)}T09:00:00+00:00', 'updated_at': now})
            for s, c in lines:
                await db.distributor_delivery_items.insert_one({'id': str(uuid.uuid4()), 'tenant_id': T, 'delivery_id': did,
                                                                'sku_id': s['id'], 'sku_name': s['name'], 'quantity': c * s['upc'],
                                                                'units_per_package': s['upc'], 'seed_tag': TAG})
            n_orders += 1
        print(f'  {name}: {len(orders)} orders, {len(branded)} branded SKU(s)')
    print(f'seeded {len(SCENARIOS)} customers, {n_orders} deliveries')


async def main():
    db = AsyncIOMotorClient(os.environ['MONGO_URL'])[os.environ['DB_NAME']]
    if '--clean' in sys.argv:
        await clean(db)
    else:
        await seed(db)

asyncio.run(main())
