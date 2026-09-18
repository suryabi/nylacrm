"""External (API-key) batch creation must skip the pre-production checklist gate;
in-app creation must still enforce it. Cleans up after itself."""
import asyncio, os, uuid
import httpx
from dotenv import load_dotenv
load_dotenv('/app/backend/.env'); load_dotenv('/app/frontend/.env')
from motor.motor_asyncio import AsyncIOMotorClient

API = os.environ['REACT_APP_BACKEND_URL'].rstrip('/') + '/api'
T = 'nyla-air-water'
TAG = 'QA-EXT-' + uuid.uuid4().hex[:6]


async def main():
    db = AsyncIOMotorClient(os.environ['MONGO_URL'])[os.environ['DB_NAME']]
    async with httpx.AsyncClient(timeout=60) as c:
        r = await c.post(f'{API}/auth/login', json={'email': 'surya.yadavalli@nylaairwater.earth', 'password': 'test123'})
        tok = r.json().get('token') or r.json().get('access_token')
        H = {'Authorization': f'Bearer {tok}', 'X-Tenant-ID': T}

        sku = await db.master_skus.find_one({'tenant_id': T, 'bottles_per_crate': {'$gt': 0}}, {'_id': 0}) or await db.master_skus.find_one({'tenant_id': T}, {'_id': 0})
        # A per-run equipment applicable to all SKUs → checklist pending for this SKU
        eq_id = str(uuid.uuid4())
        await db.equipment_master.insert_one({'id': eq_id, 'tenant_id': T, 'name': TAG + ' Filler', 'per_run_maintenance': True,
                                              'per_run_sku_ids': [], 'status': 'active', 'created_at': '2026-06-01'})
        r = await c.get(f'{API}/api-keys/available-endpoints', headers=H)
        ep_ids = [e['id'] for e in (r.json() if isinstance(r.json(), list) else r.json().get('endpoints', [])) if 'batch' in str(e).lower()]
        r = await c.post(f'{API}/api-keys', headers=H, json={'name': TAG, 'allowed_endpoint_ids': ep_ids})
        assert r.status_code in (200, 201), r.text
        raw = r.json().get('key') or r.json().get('api_key') or r.json().get('raw_key')
        key_id = r.json().get('id')
        assert raw, r.json()
        created = []
        try:
            payload = {'sku_id': sku['id'], 'batch_code': f'{TAG}-APP', 'production_date': '2026-06-15', 'total_crates': 2,
                       'bottles_per_crate': sku.get('bottles_per_crate') or 12}
            # in-app: gate applies
            r = await c.post(f'{API}/production/batches', headers=H, json=payload)
            print('in-app', r.status_code, r.text[:140])
            assert r.status_code == 409 and 'checklist pending' in r.text.lower()
            # external: gate skipped
            r = await c.post(f'{API}/production/batches', headers={'X-API-Key': raw, 'X-Tenant-ID': T},
                             json={**payload, 'batch_code': f'{TAG}-EXT'})
            print('external', r.status_code, r.text[:160])
            assert r.status_code in (200, 201), r.text
            created.append(r.json().get('id'))
            doc = await db.production_batches.find_one({'batch_code': f'{TAG}-EXT'}, {'_id': 0, 'pre_production_skipped': 1, 'pre_production_clearances': 1})
            print('doc', doc); assert doc['pre_production_skipped'] == 'external_api' and doc['pre_production_clearances'] == []
            print('ALL OK')
        finally:
            await db.production_batches.delete_many({'tenant_id': T, 'batch_code': {'$regex': f'^{TAG}'}})
            await db.maintenance_tasks.delete_many({'tenant_id': T, 'batch_code': {'$regex': f'^{TAG}'}}) if 'maintenance_tasks' in await db.list_collection_names() else None
            await db.equipment_master.delete_one({'id': eq_id})
            await db.api_keys.delete_many({'tenant_id': T, 'name': TAG})
            print('cleanup done')

asyncio.run(main())
