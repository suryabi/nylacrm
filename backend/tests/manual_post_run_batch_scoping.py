"""After-run tasks of batch A must never appear in batch B's before-run checklist
(pending or completed), and B's start must not consume A's after-run tasks."""
import requests
from pymongo import MongoClient
from dotenv import dotenv_values
API = [l.split('=', 1)[1].strip() for l in open('/app/frontend/.env') if l.startswith('REACT_APP_BACKEND_URL')][0] + '/api'
T = 'nyla-air-water'; H = {'X-Tenant-ID': T}
env = dotenv_values('/app/backend/.env'); db = MongoClient(env['MONGO_URL'])[env['DB_NAME']]
login = lambda e: {**H, 'Authorization': 'Bearer ' + requests.post(f'{API}/auth/login', json={'email': e, 'password': 'test123'}, headers=H).json()['session_token']}
CEO = login('admin@nylaairwater.earth')
types = requests.get(f'{API}/production/equipment/types', headers=CEO).json()['types']
pre_id = requests.post(f'{API}/production/equipment', json={'name': 'ZZ SCOPE2 pre', 'equipment_type_id': types[0]['id'], 'per_run_maintenance': True, 'per_run_sku_ids': []}, headers=CEO).json()['id']
post_id = requests.post(f'{API}/production/equipment', json={'name': 'ZZ SCOPE2 post', 'equipment_type_id': types[0]['id'], 'post_run_maintenance': True, 'post_run_sku_ids': []}, headers=CEO).json()['id']
sku = requests.get(f'{API}/production/run/skus', headers=CEO).json()['skus'][0]['id']
init = lambda: requests.post(f'{API}/production/run/initiate', json={'sku_id': sku}, headers=CEO).json()['batch_id']
run = lambda b: requests.get(f'{API}/production/run/{b}', headers=CEO).json()
ids = []
try:
    A = init(); ids.append(A)
    rA = run(A)
    assert all(i['kind'] == 'pre' for i in rA['checklist']['items']) and rA['checklist']['post_items'] == [], rA['checklist']
    print('A before-run has only BEFORE RUN items:', [i['name'] for i in rA['checklist']['items'] if 'SCOPE2' in i['name']])
    assert requests.post(f'{API}/maintenance/pre-production/{pre_id}/clear', json={'batch_id': A}, headers=CEO).status_code == 200
    assert requests.post(f'{API}/production/run/{A}/start', json={}, headers=CEO).status_code == 200
    assert requests.post(f'{API}/production/run/{A}/stop', json={'total_crates': 1}, headers=CEO).status_code in (200, 201), 'stop'
    tasksA = db.post_run_tasks.find({'batch_id': A}).to_list() if hasattr(db.post_run_tasks.find({}), 'to_list') else list(db.post_run_tasks.find({'batch_id': A}))
    mine = [t for t in tasksA if t['equipment_id'] == post_id]
    print('A after-run tasks created:', len(tasksA), '| ours pending:', bool(mine and mine[0]['status'] == 'pending'))
    assert mine
    # Complete one of A's after-run tasks (leave A open).
    assert requests.post(f'{API}/maintenance/pre-production/post/{mine[0]["id"]}/complete', json={}, headers=CEO).status_code == 200

    B = init(); ids.append(B)
    rB = run(B)
    names = [i['name'] for i in rB['checklist']['items']] + [i.get('name') for i in rB['checklist']['post_items']]
    print('B before-run items:', [n for n in names if n and 'SCOPE2' in n], '(expect only pre)')
    assert 'ZZ SCOPE2 post' not in names and rB['checklist']['post_items'] == []
    assert all(i['kind'] == 'pre' for i in rB['checklist']['pending'])
    # B can start once ITS OWN before-run items are cleared, regardless of A's pending after-run tasks
    assert requests.post(f'{API}/maintenance/pre-production/{pre_id}/clear', json={'batch_id': B}, headers=CEO).status_code == 200
    s = requests.post(f'{API}/production/run/{B}/start', json={}, headers=CEO)
    print('B start ->', s.status_code, '(expect 200)'); assert s.status_code == 200
    consumed = db.post_run_tasks.count_documents({'batch_id': A, 'consumed_by_batch_id': B})
    print("A's after-run tasks consumed by B:", consumed, '(expect 0)'); assert consumed == 0
    stillA = db.post_run_tasks.find_one({'id': mine[0]['id']})
    assert stillA['status'] == 'completed' and stillA['batch_id'] == A
    # QR equipment page: the completed task (recent) still visible, tasks scoped by batch
    page = requests.get(f'{API}/maintenance/scan/{db.equipment_master.find_one({"id": post_id}).get("qr_token") or post_id}', headers=CEO)
    if page.status_code == 200 and 'post_run' in page.json():
        print('QR post_run entries:', [(p.get('batch_code'), p.get('cleared')) for p in page.json()['post_run']])
    print('ALL OK')
finally:
    for b in ids: requests.post(f'{API}/production/run/{b}/cancel', headers=CEO)
    db.production_batches.delete_many({'tenant_id': T, 'id': {'$in': ids}}); db.post_run_tasks.delete_many({'batch_id': {'$in': ids}})
    db.maintenance_records.delete_many({'equipment_id': {'$in': [pre_id, post_id]}}); db.maintenance_audit.delete_many({'batch_id': {'$in': ids}})
    db.equipment_master.delete_many({'name': {'$regex': '^ZZ SCOPE2'}})
    print('leftover', db.equipment_master.count_documents({'name': {'$regex': '^ZZ SCOPE2'}}), db.production_batches.count_documents({'id': {'$in': ids}}))
