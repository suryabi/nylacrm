"""Manual check: completing a delivery deducts from batch rows; reversing it
restores the SAME rows (the old code silently no-op'd when the line had no
batch and no legacy row existed). Also covers the pre-fix fallback path and
the manual re-add endpoint. Cleans up after itself."""
import asyncio, os, sys, uuid
import httpx
from dotenv import load_dotenv
load_dotenv('/app/backend/.env')
load_dotenv('/app/frontend/.env')
from motor.motor_asyncio import AsyncIOMotorClient

API = os.environ['REACT_APP_BACKEND_URL'].rstrip('/') + '/api'
TENANT = 'nyla-air-water'
TAG = 'QA-REV-' + uuid.uuid4().hex[:6]


async def main():
    db = AsyncIOMotorClient(os.environ['MONGO_URL'])[os.environ['DB_NAME']]
    async with httpx.AsyncClient(timeout=60) as c:
        r = await c.post(f'{API}/auth/login', json={'email': 'surya.yadavalli@nylaairwater.earth', 'password': 'test123'})
        r.raise_for_status()
        tok = r.json().get('token') or r.json().get('access_token')
        H = {'Authorization': f'Bearer {tok}', 'X-Tenant-ID': TENANT}

        dist = await db.distributors.find_one({'tenant_id': TENANT, 'id': 'bb12d90e-4d33-4890-ac5f-17573c551b5c'}, {'_id': 0})
        loc = await db.distributor_locations.find_one({'tenant_id': TENANT, 'distributor_id': dist['id'], 'is_factory': {'$ne': True}}, {'_id': 0})
        sku = await db.master_skus.find_one({'tenant_id': TENANT}, {'_id': 0})
        acct = await db.accounts.find_one({'tenant_id': TENANT}, {'_id': 0})
        assert dist and loc and sku and acct, (bool(dist), bool(loc), bool(sku), bool(acct))
        sku_id = sku['id']
        print('dist', dist['distributor_name'], '| loc', loc['location_name'], '| sku', sku.get('sku_name'))

        # Isolate: park existing stock rows for this SKU/location aside.
        parked = await db.distributor_stock.find({'tenant_id': TENANT, 'distributor_location_id': loc['id'], 'sku_id': sku_id}).to_list(100)
        parked_ids = [p['_id'] for p in parked]
        if parked_ids:
            await db.distributor_stock.update_many({'_id': {'$in': parked_ids}}, {'$set': {'distributor_location_id': f'PARKED-{TAG}'}})

        created = []
        try:
            # Two batch rows, NO legacy row (the exact production shape).
            b1, b2 = str(uuid.uuid4()), str(uuid.uuid4())
            for bid, code, qty, ts in ((b1, f'{TAG}-B1', 40, '2026-01-01'), (b2, f'{TAG}-B2', 60, '2026-02-01')):
                rid = str(uuid.uuid4())
                created.append(rid)
                await db.distributor_stock.insert_one({
                    'id': rid, 'tenant_id': TENANT, 'distributor_id': dist['id'], 'distributor_location_id': loc['id'],
                    'sku_id': sku_id, 'sku_name': sku.get('sku_name'), 'quantity': qty, 'batch_id': bid, 'batch_code': code,
                    'child_sku_id': None, 'created_at': ts, 'updated_at': ts})

            async def totals():
                rows = await db.distributor_stock.find({'tenant_id': TENANT, 'distributor_location_id': loc['id'], 'sku_id': sku_id}, {'_id': 0, 'batch_code': 1, 'quantity': 1}).to_list(50)
                return {(r.get('batch_code') or 'LEGACY'): r['quantity'] for r in rows}

            async def make_delivery(qty, with_batch=None):
                did, iid = str(uuid.uuid4()), str(uuid.uuid4())
                await db.distributor_deliveries.insert_one({
                    'id': did, 'tenant_id': TENANT, 'distributor_id': dist['id'], 'distributor_location_id': loc['id'],
                    'account_id': acct['id'], 'account_name': acct.get('company') or acct.get('name'),
                    'delivery_number': f'{TAG}-{qty}', 'status': 'confirmed', 'delivery_date': '2026-06-01',
                    'created_at': '2026-06-01T00:00:00', 'updated_at': '2026-06-01T00:00:00'})
                await db.distributor_delivery_items.insert_one({
                    'id': iid, 'tenant_id': TENANT, 'delivery_id': did, 'sku_id': sku_id, 'sku_name': sku.get('sku_name'),
                    'quantity': qty, 'child_sku_id': None, 'batch_id': with_batch, 'units_per_package': 1})
                return did

            base = await totals()
            print('start', base)

            # 1) Line with NO batch → FIFO deduction spanning both batch rows (40 + 10)
            d1 = await make_delivery(50)
            r = await c.post(f'{API}/distributors/{dist["id"]}/deliveries/{d1}/complete', headers=H)
            print('complete', r.status_code, r.text[:200]); assert r.status_code == 200
            after = await totals(); print('after complete', after)
            assert after[f'{TAG}-B1'] == 0 and after[f'{TAG}-B2'] == 50, after
            ded = (await db.distributor_deliveries.find_one({'id': d1}, {'_id': 0, 'stock_deductions': 1}))['stock_deductions']
            print('recorded deductions', [(d['batch_code'], d['qty']) for d in ded])
            assert sorted(d['qty'] for d in ded) == [10, 40]

            r = await c.post(f'{API}/distributors/{dist["id"]}/deliveries/{d1}/reverse?acknowledge=true', headers=H)
            print('reverse', r.status_code, r.json().get('message')); assert r.status_code == 200
            after = await totals(); print('after reverse', after)
            assert after == base, (after, base)
            assert 'LEGACY' not in after
            dd = await db.distributor_deliveries.find_one({'id': d1}, {'_id': 0, 'stock_restored': 1, 'stock_readded': 1})
            assert dd['stock_readded'] and sum(x['qty'] for x in dd['stock_restored']) == 50

            # 2) Pre-fix delivery shape: completed earlier with no deduction log, no legacy row.
            d2 = await make_delivery(25)
            await db.distributor_stock.update_one({'batch_id': b2}, {'$inc': {'quantity': -25}})
            await db.distributor_deliveries.update_one({'id': d2}, {'$set': {'status': 'complete'}})
            r = await c.post(f'{API}/distributors/{dist["id"]}/deliveries/{d2}/reverse?acknowledge=true', headers=H)
            print('legacy-shape reverse', r.status_code, r.json().get('message')); assert r.status_code == 200
            after = await totals(); print('after legacy-shape reverse', after)
            assert sum(after.values()) == 100 and 'LEGACY' not in after, after

            # 3) Manual re-add guard: already restored → 400
            r = await c.post(f'{API}/distributors/{dist["id"]}/deliveries/{d2}/readd-stock?acknowledge=true', headers=H)
            print('readd again', r.status_code, r.json().get('detail')); assert r.status_code == 400

            # 4) Reversed delivery WITHOUT any restore record (old silent failure) → manual re-add works
            d3 = await make_delivery(30)
            await db.distributor_stock.update_one({'batch_id': b1}, {'$inc': {'quantity': -30}})
            await db.distributor_deliveries.update_one({'id': d3}, {'$set': {'status': 'reversed', 'stock_readded': True, 'stock_manual_readd_at': '2026-05-01T00:00:00'}})
            r = await c.post(f'{API}/distributors/{dist["id"]}/deliveries/{d3}/readd-stock?acknowledge=true', headers=H)
            print('manual readd', r.status_code, r.json().get('message')); assert r.status_code == 200
            after = await totals(); print('after manual readd', after)
            assert sum(after.values()) == 100 and 'LEGACY' not in after, after

            r = await c.get(f'{API}/distributors/{dist["id"]}/deliveries/{d3}/stock-audit', headers=H)
            assert r.status_code == 200 and r.json()['stock_restored'], r.text[:200]
            print('ALL OK')
        finally:
            await db.distributor_deliveries.delete_many({'tenant_id': TENANT, 'delivery_number': {'$regex': f'^{TAG}'}})
            dids = [d['id'] async for d in db.distributor_deliveries.find({'delivery_number': {'$regex': f'^{TAG}'}})]
            await db.distributor_delivery_items.delete_many({'tenant_id': TENANT, 'sku_id': sku_id, 'delivery_id': {'$in': dids}})
            await db.distributor_delivery_items.delete_many({'tenant_id': TENANT, 'delivery_id': {'$nin': [d['id'] async for d in db.distributor_deliveries.find({}, {'id': 1})]}, 'sku_id': sku_id, 'units_per_package': 1, 'batch_id': None, 'child_sku_id': None, 'quantity': {'$in': [50, 25, 30]}})
            await db.distributor_stock.delete_many({'tenant_id': TENANT, 'batch_code': {'$regex': f'^{TAG}'}})
            await db.distributor_stock.delete_many({'tenant_id': TENANT, 'distributor_location_id': loc['id'], 'sku_id': sku_id, 'id': {'$nin': created}, 'created_at': {'$gte': '2026-06'}})
            await db.stock_movements.delete_many({'tenant_id': TENANT, 'reference': {'$regex': f'^{TAG}'}})
            if parked_ids:
                await db.distributor_stock.update_many({'_id': {'$in': parked_ids}}, {'$set': {'distributor_location_id': loc['id']}})
            left = await db.distributor_stock.count_documents({'batch_code': {'$regex': f'^{TAG}'}})
            print('cleanup leftover', left)

asyncio.run(main())
