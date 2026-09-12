import requests
from datetime import datetime, timezone, timedelta
from pymongo import MongoClient
from dotenv import dotenv_values
API = [l.split('=', 1)[1].strip() for l in open('/app/frontend/.env') if l.startswith('REACT_APP_BACKEND_URL')][0] + '/api'
T = 'nyla-air-water'; H = {'X-Tenant-ID': T}
env = dotenv_values('/app/backend/.env'); db = MongoClient(env['MONGO_URL'])[env['DB_NAME']]
login = lambda e: {**H, 'Authorization': 'Bearer ' + requests.post(f'{API}/auth/login', json={'email': e, 'password': 'test123'}, headers=H).json()['session_token']}
CEO = login('admin@nylaairwater.earth')
skus = list(db.master_skus.find({'tenant_id': T}, {'_id': 0, 'id': 1, 'sku_name': 1})); skuA, skuB = skus[0], skus[1]
today = (datetime.now(timezone.utc) + timedelta(hours=5, minutes=30)).strftime('%Y-%m-%d')
types = requests.get(f'{API}/production/equipment/types', headers=CEO).json()['types']
e_post = requests.post(f'{API}/production/equipment', json={'name': 'ZZ Mixer (after run, all SKUs)', 'equipment_type_id': types[0]['id'], 'post_run_maintenance': True, 'post_run_sku_ids': []}, headers=CEO).json()['id']
e_postA = requests.post(f'{API}/production/equipment', json={'name': 'ZZ Labeler (after run, SKU A)', 'equipment_type_id': types[0]['id'], 'post_run_maintenance': True, 'post_run_sku_ids': [skuA['id']]}, headers=CEO).json()['id']
m1 = requests.post(f'{API}/production/qc-team', json={'name': 'ZZ Post Staff', 'role': 'Operator'}, headers=CEO).json()['id']
requests.put(f'{API}/production/qc-team/{m1}/pin', json={'pin': '8888'}, headers=CEO)
body = lambda sku, code, **kw: {'sku_id': sku['id'], 'sku_name': sku['sku_name'], 'bottles_per_crate': 12, 'total_crates': 1, 'batch_code': code, 'production_date': today, **kw}
try:
    print('flags stored:', db.equipment_master.find_one({'id': e_postA}, {'_id': 0, 'post_run_maintenance': 1, 'post_run_sku_ids': 1}))
    # batch 1 for SKU B: nothing pending, creates post-run task for Mixer only (Labeler is SKU A only)
    r = requests.post(f'{API}/production/batches', json=body(skuB, 'ZZ-POST-1'), headers=CEO); print('batch1 ->', r.status_code, 'post tasks', [t['equipment_name'] for t in r.json().get('post_run_tasks', [])])
    tasks = list(db.post_run_tasks.find({'batch_code': 'ZZ-POST-1'}, {'_id': 0, 'id': 1, 'equipment_name': 1, 'status': 1})); print('tasks in db:', [(t['equipment_name'], t['status']) for t in tasks])
    st = requests.get(f'{API}/maintenance/pre-production', params={'sku_id': skuB['id']}, headers=CEO).json()
    print('checklist B: post_items', [(i['name'], i['kind'], i['batch_code'], i['cleared']) for i in st['post_items']], 'all_clear', st['all_clear'])
    # batch 2 for SKU B blocked by open after-run task
    r = requests.post(f'{API}/production/batches', json=body(skuB, 'ZZ-POST-2'), headers=CEO); print('batch2 blocked ->', r.status_code, r.json()['detail'][:70])
    # staff completes via checklist QR
    S = {'X-Staff-Token': requests.post(f'{API}/maintenance/staff-auth/login', json={'pre_production': T, 'member_id': m1, 'pin': '8888'}).json()['staff_token']}
    sc = requests.get(f'{API}/maintenance/equipment-scan/{e_post}', headers=S).json(); print('equipment-scan post_run:', [(t['batch_code'], t['can_tick']) for t in sc['post_run']])
    tid = tasks[0]['id']
    r = requests.post(f'{API}/maintenance/pre-production/post/{tid}/complete', json={}, headers=S); print('complete task', r.status_code, r.json()['record']['performed_via'], r.json()['record']['batch_code'])
    print('complete again ->', requests.post(f'{API}/maintenance/pre-production/post/{tid}/complete', json={}, headers=S).status_code, '(409)')
    print('CEO undo staff task ->', requests.post(f'{API}/maintenance/pre-production/post/{tid}/undo', headers=CEO).status_code, '(409)')
    print('staff undo own ->', requests.post(f'{API}/maintenance/pre-production/post/{tid}/undo', headers=S).status_code, 'task status', db.post_run_tasks.find_one({'id': tid})['status'], 'records', db.maintenance_records.count_documents({'post_run_task_id': tid}))
    r = requests.post(f'{API}/maintenance/pre-production/post/{tid}/complete', json={}, headers=S); print('complete again after undo', r.status_code)
    # batch 2 now allowed; consumes the task; creates a new task
    r = requests.post(f'{API}/production/batches', json=body(skuB, 'ZZ-POST-2'), headers=CEO); print('batch2 ->', r.status_code, 'clearances', [(c['kind'], c['equipment_name'], c.get('after_batch_code'), c.get('status')) for c in r.json().get('pre_production_clearances', [])])
    print('task consumed by', db.post_run_tasks.find_one({'id': tid})['consumed_by_batch_code'], '| open tasks now', [(t['batch_code'], t['equipment_name']) for t in db.post_run_tasks.find({'tenant_id': T, 'consumed_by_batch_id': None, 'batch_code': {'$regex': '^ZZ'}})])
    print('undo after consume ->', requests.post(f'{API}/maintenance/pre-production/post/{tid}/undo', headers=S).status_code, '(409)')
    # SKU A batch: blocked by Mixer's open task from batch 2 (Mixer applies to all SKUs); Labeler task created only after an SKU-A batch
    r = requests.post(f'{API}/production/batches', json=body(skuA, 'ZZ-POST-3'), headers=CEO); print('SKU A batch blocked ->', r.status_code)
    r = requests.post(f'{API}/production/batches', json=body(skuA, 'ZZ-POST-3', override_pre_production=True, override_pre_production_reason='test'), headers=CEO); print('SKU A override ->', r.status_code, 'new tasks', [t['equipment_name'] for t in r.json().get('post_run_tasks', [])])
    stick = requests.get(f'{API}/maintenance/pre-production/sticker', params={'origin': 'https://x'}, headers=CEO).json(); print('sticker count', stick['equipment_count'])
finally:
    db.production_batches.delete_many({'tenant_id': T, 'batch_code': {'$regex': '^ZZ-POST'}}); db.post_run_tasks.delete_many({'tenant_id': T, 'batch_code': {'$regex': '^ZZ-POST'}})
    db.maintenance_records.delete_many({'equipment_id': {'$in': [e_post, e_postA]}}); db.maintenance_audit.delete_many({'equipment_id': {'$in': [e_post, e_postA]}})
    db.notifications.delete_many({'tenant_id': T, 'title': {'$regex': 'checklist overridden'}}); db.factory_staff_sessions.delete_many({'member_id': m1})
    for e in (e_post, e_postA): requests.delete(f'{API}/production/equipment/{e}', headers=CEO)
    requests.delete(f'{API}/production/qc-team/{m1}', headers=CEO)
    print('cleaned; ZZ left:', db.equipment_master.count_documents({'name': {'$regex': '^ZZ'}}), db.post_run_tasks.count_documents({'batch_code': {'$regex': '^ZZ'}}))
