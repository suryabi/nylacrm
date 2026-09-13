import requests
from pymongo import MongoClient
from dotenv import dotenv_values
API = [l.split('=', 1)[1].strip() for l in open('/app/frontend/.env') if l.startswith('REACT_APP_BACKEND_URL')][0] + '/api'
T = 'nyla-air-water'; H = {'X-Tenant-ID': T}
env = dotenv_values('/app/backend/.env'); db = MongoClient(env['MONGO_URL'])[env['DB_NAME']]
login = lambda e: {**H, 'Authorization': 'Bearer ' + requests.post(f'{API}/auth/login', json={'email': e, 'password': 'test123'}, headers=H).json()['session_token']}
CEO = login('admin@nylaairwater.earth')
pre_ops = db.qc_team.count_documents({'tenant_id': T, 'production_operator': True})
print('sticker (no ops yet) ->', requests.get(f'{API}/maintenance/start-production/sticker', params={'origin': 'https://x.test'}, headers=CEO).json()['operator_count'], '| roster ->', requests.get(f'{API}/maintenance/staff-auth/roster', params={'start_production': T}).status_code if pre_ops == 0 else 'skip')
op = requests.post(f'{API}/production/qc-team', json={'name': 'ZZ OP Ravi', 'role': 'Factory Staff', 'production_operator': True}, headers=CEO).json()
plain = requests.post(f'{API}/production/qc-team', json={'name': 'ZZ OP Plain', 'role': 'Factory Staff'}, headers=CEO).json()
print('created op flag:', op.get('production_operator'), '| plain flag:', plain.get('production_operator'))
bid = None
try:
    for m in (op, plain): requests.put(f'{API}/production/qc-team/{m["id"]}/pin', json={'pin': '4321'}, headers=CEO)
    ro = requests.get(f'{API}/maintenance/staff-auth/roster', params={'start_production': T}).json(); names = [m['name'] for m in ro['members']]
    print('roster:', ro['equipment_name'], 'op in roster', 'ZZ OP Ravi' in names, '| plain excluded', 'ZZ OP Plain' not in names)
    print('plain pin login ->', requests.post(f'{API}/maintenance/staff-auth/login', json={'start_production': T, 'member_id': plain['id'], 'pin': '4321'}).status_code, '(400 expected: not in pool)')
    lg = requests.post(f'{API}/maintenance/staff-auth/login', json={'start_production': T, 'member_id': op['id'], 'pin': '4321'}); print('op pin login ->', lg.status_code)
    S = {'X-Staff-Token': lg.json()['staff_token']}
    sk = requests.get(f'{API}/production/run/skus', headers=S).json()['skus']; print('skus via staff:', len(sk))
    r = requests.post(f'{API}/production/run/initiate', json={'sku_id': sk[0]['id']}, headers=S); print('initiate via staff ->', r.status_code, r.json()); bid = r.json()['batch_id']
    print('active runs ->', [x['batch_code'] for x in requests.get(f'{API}/production/run/active', headers=S).json()['runs'] if x['id'] == bid])
    g = requests.get(f'{API}/production/run/{bid}', headers=S).json(); print('get run status', g['batch']['status'], 'created_by', g['batch']['created_by_name'], 'pending', len(g['checklist']['pending']))
    print('start ->', requests.post(f'{API}/production/run/{bid}/start', json={}, headers=S).status_code)
    print('stop ->', requests.post(f'{API}/production/run/{bid}/stop', json={'total_crates': 12}, headers=S).status_code)
    r = requests.post(f'{API}/production/run/{bid}/close', json={'batch_code': 'ZZ-OP-1'}, headers=S); print('close ->', r.status_code, r.json().get('status'))
    b = db.production_batches.find_one({'id': bid}, {'_id': 0, 'status': 1, 'run.started_by': 1, 'run.closed_by': 1}); print('batch:', b)
    db.qc_team.update_one({'id': op['id']}, {'$set': {'production_operator': False}})
    print('flag removed → skus ->', requests.get(f'{API}/production/run/skus', headers=S).status_code, requests.get(f'{API}/production/run/skus', headers=S).json()['detail'][:60])
    print('app user skus ->', requests.get(f'{API}/production/run/skus', headers=CEO).status_code)
    print('unauth skus ->', requests.get(f'{API}/production/run/skus', headers=H).status_code)
finally:
    db.production_batches.delete_many({'tenant_id': T, '$or': [{'id': bid}, {'batch_code': {'$regex': '^ZZ-OP'}}]})
    db.post_run_tasks.delete_many({'tenant_id': T, 'batch_id': bid})
    db.qc_team.delete_many({'tenant_id': T, 'name': {'$regex': '^ZZ OP'}}); db.factory_staff_sessions.delete_many({'member_id': {'$in': [op['id'], plain['id']]}})
    db.notifications.delete_many({'tenant_id': T, 'title': {'$regex': 'ZZ-OP'}})
    print('leftover', db.qc_team.count_documents({'name': {'$regex': '^ZZ OP'}}), db.production_batches.count_documents({'batch_code': {'$regex': '^ZZ-OP'}}))
