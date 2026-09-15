"""Manual check for Legacy Stock Repair endpoints + always-on batch flags."""
import asyncio, os, uuid
import httpx
from dotenv import load_dotenv
load_dotenv('/app/backend/.env'); load_dotenv('/app/frontend/.env')
from motor.motor_asyncio import AsyncIOMotorClient

API = os.environ['REACT_APP_BACKEND_URL'].rstrip('/') + '/api'
TENANT = 'nyla-air-water'
TAG = 'QA-LEG-' + uuid.uuid4().hex[:6]


async def main():
    db = AsyncIOMotorClient(os.environ['MONGO_URL'])[os.environ['DB_NAME']]
    async with httpx.AsyncClient(timeout=60) as c:
        r = await c.post(f'{API}/auth/login', json={'email': 'surya.yadavalli@nylaairwater.earth', 'password': 'test123'})
        tok = r.json().get('token') or r.json().get('access_token')
        H = {'Authorization': f'Bearer {tok}', 'X-Tenant-ID': TENANT}

        # always-on: every location now reports track_batches true
        locs = await db.distributor_locations.count_documents({'tenant_id': TENANT, 'track_batches': {'$ne': True}})
        print('locations without track_batches:', locs); assert locs == 0
        r = await c.get(f'{API}/distributor/stock-transfers/locations', headers=H)
        if r.status_code == 200:
            body = r.json()
            items = body if isinstance(body, list) else (body.get('locations') or body.get('sources') or [])
            assert all(l.get('track_batches') for l in items if 'track_batches' in l), 'location list still exposes track_batches=false'
            print('stock-transfer locations all tracked:', len(items))

        loc = await db.distributor_locations.find_one({'tenant_id': TENANT, 'location_name': 'Delhi'}, {'_id': 0})
        batch = await db.production_batches.find_one({'tenant_id': TENANT, 'batch_code': {'$exists': True}}, {'_id': 0})
        sku_id = batch['sku_id']
        rid = str(uuid.uuid4())
        await db.distributor_stock.insert_one({'id': rid, 'tenant_id': TENANT, 'distributor_id': loc['distributor_id'],
            'distributor_location_id': loc['id'], 'sku_id': sku_id, 'sku_name': batch.get('sku_name'), 'quantity': 77,
            'child_sku_id': None, 'created_at': '2026-01-01', 'updated_at': '2026-01-01'})
        # inbound history for suggestion: a stock transfer into Delhi carrying this batch
        tr_id = str(uuid.uuid4())
        await db.distributor_stock_transfers.insert_one({'id': tr_id, 'tenant_id': TENANT, 'transfer_number': TAG,
            'dest_location_id': loc['id'], 'status': 'completed', 'transfer_date': '2026-01-05',
            'items': [{'sku_id': sku_id, 'batch_id': batch['id'], 'batch_code': batch['batch_code'], 'quantity': 77}]})
        try:
            r = await c.get(f'{API}/distributor/legacy-stock', headers=H); assert r.status_code == 200, r.text
            row = next((x for x in r.json()['rows'] if x['location_id'] == loc['id'] and x['sku_id'] == sku_id and not x['child_sku_id']), None)
            print('legacy row', row and (row['location_name'], row['quantity'], row['suggested_batch_code'], row['suggestion_basis']))
            assert row and row['quantity'] >= 77 and row['suggested_batch_id'] == batch['id'] and row['suggestion_basis'] == 'history'
            assert any(s['batch_id'] == batch['id'] and 'transfer' in s['sources'] for s in row['suggestions'])

            r = await c.get(f'{API}/distributor/legacy-stock/batches?sku_id={sku_id}', headers=H)
            assert r.status_code == 200 and any(b['batch_id'] == batch['id'] for b in r.json()['batches'])

            r = await c.post(f'{API}/distributor/legacy-stock/assign', headers=H, json={'assignments': [
                {'location_id': loc['id'], 'sku_id': sku_id, 'child_sku_id': None, 'batch_id': batch['id'], 'quantity': 77},
                {'location_id': 'nope', 'sku_id': sku_id, 'batch_id': batch['id']},
            ]})
            print('assign', r.status_code, {k: r.json()[k] for k in ('assigned_units', 'succeeded', 'failed')})
            assert r.status_code == 200 and r.json()['succeeded'] == 1 and r.json()['failed'] == 1 and r.json()['assigned_units'] == 77

            brow = await db.distributor_stock.find_one({'tenant_id': TENANT, 'distributor_location_id': loc['id'], 'sku_id': sku_id, 'batch_id': batch['id']}, {'_id': 0})
            print('batch row qty', brow and brow['quantity'], brow and brow.get('batch_code')); assert brow and brow['quantity'] >= 77
            r = await c.get(f'{API}/distributor/legacy-stock/history', headers=H)
            assert r.status_code == 200 and any(l.get('source') == 'legacy_repair' and l['quantity'] == 77 for l in r.json()['logs'])

            # non-admin forbidden
            r2 = await c.post(f'{API}/auth/login', json={'email': 'creative.director@nylaairwater.earth', 'password': 'test123'})
            t2 = r2.json().get('token') or r2.json().get('access_token')
            r = await c.get(f'{API}/distributor/legacy-stock', headers={'Authorization': f'Bearer {t2}', 'X-Tenant-ID': TENANT})
            print('non-admin', r.status_code); assert r.status_code == 403
            print('ALL OK')
        finally:
            await db.distributor_stock.update_one({'tenant_id': TENANT, 'distributor_location_id': loc['id'], 'sku_id': sku_id, 'batch_id': batch['id']}, {'$inc': {'quantity': -77}})
            await db.distributor_stock.delete_many({'tenant_id': TENANT, 'distributor_location_id': loc['id'], 'sku_id': sku_id, 'batch_id': batch['id'], 'quantity': {'$lte': 0}})
            await db.distributor_stock.delete_many({'id': rid})
            await db.distributor_stock_transfers.delete_many({'id': tr_id})
            await db.stock_batch_assignments.delete_many({'tenant_id': TENANT, 'source': 'legacy_repair', 'quantity': 77, 'warehouse_location_id': loc['id']})
            print('cleanup done')

asyncio.run(main())
