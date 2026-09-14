import requests
from pymongo import MongoClient
from dotenv import dotenv_values
API = [l.split('=', 1)[1].strip() for l in open('/app/frontend/.env') if l.startswith('REACT_APP_BACKEND_URL')][0] + '/api'
T = 'nyla-air-water'; H = {'X-Tenant-ID': T}
env = dotenv_values('/app/backend/.env'); db = MongoClient(env['MONGO_URL'])[env['DB_NAME']]
login = lambda e: {**H, 'Authorization': 'Bearer ' + requests.post(f'{API}/auth/login', json={'email': e, 'password': 'test123'}, headers=H).json()['session_token']}
CEO = login('admin@nylaairwater.earth')
types = requests.get(f'{API}/production/equipment/types', headers=CEO).json()['types']
eid = requests.post(f'{API}/production/equipment', json={'name': 'ZZ SCOPE tank', 'equipment_type_id': types[0]['id'], 'per_run_maintenance': True, 'per_run_sku_ids': []}, headers=CEO).json()['id']
sku = requests.get(f'{API}/production/run/skus', headers=CEO).json()['skus'][0]['id']
init = lambda: requests.post(f'{API}/production/run/initiate', json={'sku_id': sku}, headers=CEO).json()['batch_id']
run = lambda b: requests.get(f'{API}/production/run/{b}', headers=CEO).json()
item = lambda b: next(i for i in run(b)['checklist']['items'] if i['id'] == eid)
clear = lambda body: requests.post(f'{API}/maintenance/pre-production/{eid}/clear', json=body, headers=CEO)
ids = []
try:
    A = init(); ids.append(A)
    print('A fresh cleared?', item(A)['cleared'])
    print('tick in A ->', clear({'batch_id': A}).status_code, '| A cleared', item(A)['cleared'])
    B = init(); ids.append(B)
    print('B (parallel) sees A tick?', item(B)['cleared'], '(expect False)')
    print('QR page sees A tick?', next(i for i in requests.get(f'{API}/maintenance/pre-production', headers=CEO).json()['items'] if i['id'] == eid)['cleared'], '(expect False)')
    n_before = db.maintenance_records.count_documents({'equipment_id': eid})
    c = requests.post(f'{API}/production/run/{A}/cancel', headers=CEO).json(); print('cancel A ->', c)
    print('records after cancel', db.maintenance_records.count_documents({'equipment_id': eid}), '(was', n_before, ')', '| audit', db.maintenance_audit.count_documents({'action': 'production_run_cancelled', 'batch_id': A}))
    print('B still fresh', item(B)['cleared'] is False)
    print('QR-page tick (untagged) ->', clear({}).status_code, '| B sees it', item(B)['cleared'], '(expect True: same-day QR check counts)')
    print('start B ->', requests.post(f'{API}/production/run/{B}/start', json={}, headers=CEO).status_code, '| consumed by B', db.maintenance_records.count_documents({'equipment_id': eid, 'consumed_by_batch_id': B}))
    C = init(); ids.append(C)
    print('C after B started: cleared?', item(C)['cleared'], '(expect False)')
    print('tick in C then stale-batch guard: tick for cancelled A ->', clear({'batch_id': A}).status_code, '(409)')
    print('tick in C ->', clear({'batch_id': C}).status_code, '| undo w/o batch ->', requests.post(f'{API}/maintenance/pre-production/{eid}/undo', json={}, headers=CEO).status_code, '(409) | undo with batch ->', requests.post(f'{API}/maintenance/pre-production/{eid}/undo', json={'batch_id': C}, headers=CEO).status_code)
    # yesterday untagged record should be stale
    db.maintenance_records.insert_one({'id': 'zz-old', 'tenant_id': T, 'equipment_id': eid, 'trigger': 'per_run', 'status': 'completed', 'consumed_by_batch_id': None, 'scheduled_date': '2020-01-01', 'created_at': '2020-01-01T00:00:00'})
    print('old untagged counts?', item(C)['cleared'], '(expect False)')
finally:
    for b in ids: requests.post(f'{API}/production/run/{b}/cancel', headers=CEO)
    db.production_batches.delete_many({'tenant_id': T, 'id': {'$in': ids}}); db.post_run_tasks.delete_many({'batch_id': {'$in': ids}})
    db.maintenance_records.delete_many({'equipment_id': eid}); db.maintenance_audit.delete_many({'batch_id': {'$in': ids}})
    db.equipment_master.delete_many({'name': {'$regex': '^ZZ SCOPE'}})
    print('leftover', db.equipment_master.count_documents({'name': {'$regex': '^ZZ SCOPE'}}), db.production_batches.count_documents({'id': {'$in': ids}}))
