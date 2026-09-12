import requests, uuid
from datetime import datetime, timezone, timedelta
from pymongo import MongoClient
from dotenv import dotenv_values
API = [l.split('=', 1)[1].strip() for l in open('/app/frontend/.env') if l.startswith('REACT_APP_BACKEND_URL')][0] + '/api'
T = 'nyla-air-water'; H = {'X-Tenant-ID': T}
env = dotenv_values('/app/backend/.env'); db = MongoClient(env['MONGO_URL'])[env['DB_NAME']]
login = lambda e: {**H, 'Authorization': 'Bearer ' + requests.post(f'{API}/auth/login', json={'email': e, 'password': 'test123'}, headers=H).json()['session_token']}
CEO = login('admin@nylaairwater.earth'); CD = login('creative.director@nylaairwater.earth')
skus = list(db.master_skus.find({'tenant_id': T}, {'_id': 0, 'id': 1, 'sku_name': 1})); skuA, skuB = skus[0], skus[1]
today = (datetime.now(timezone.utc) + timedelta(hours=5, minutes=30)).strftime('%Y-%m-%d')
types = requests.get(f'{API}/production/equipment/types', headers=CEO).json()['types']
def mk(name, sku_ids):
    r = requests.post(f'{API}/production/equipment', json={'name': name, 'equipment_type_id': types[0]['id'], 'per_run_maintenance': True, 'per_run_sku_ids': sku_ids}, headers=CEO)
    return r.json()['id']
e_all = mk('ZZ Dosing Tank (all SKUs)', []); e_a = mk('ZZ Filler Head (SKU A only)', [skuA['id']])
m1 = requests.post(f'{API}/production/qc-team', json={'name': 'ZZ Run Staff', 'role': 'Operator'}, headers=CEO).json()['id']
requests.put(f'{API}/production/qc-team/{m1}/pin', json={'pin': '7777'}, headers=CEO)
codes = []
try:
    eq = db.equipment_master.find_one({'id': e_a}, {'_id': 0, 'per_run_maintenance': 1, 'per_run_sku_ids': 1}); print('stored flags', eq)
    st = requests.get(f'{API}/maintenance/pre-production', params={'sku_id': skuB['id']}, headers=CEO).json(); print('SKU B checklist:', [i['name'] for i in st['items']], 'all_clear', st['all_clear'])
    st = requests.get(f'{API}/maintenance/pre-production', params={'sku_id': skuA['id']}, headers=CEO).json(); print('SKU A checklist:', [i['name'] for i in st['items']])
    stick = requests.get(f'{API}/maintenance/pre-production/sticker', params={'origin': 'https://x'}, headers=CEO).json(); print('sticker count', stick['equipment_count'], stick['qr'][:15])
    # batch for SKU B blocked (dosing tank pending)
    body = lambda code, **kw: {'sku_id': skuB['id'], 'sku_name': skuB['sku_name'], 'bottles_per_crate': 12, 'total_crates': 1, 'batch_code': code, 'production_date': today, **kw}
    r = requests.post(f'{API}/production/batches', json=body('ZZ-RUN-1'), headers=CEO); print('batch blocked ->', r.status_code, r.json()['detail'][:80])
    # non-elevated override refused
    r = requests.post(f'{API}/production/batches', json=body('ZZ-RUN-1', override_pre_production=True, override_pre_production_reason='x'), headers=CD); print('CD override ->', r.status_code)
    # CEO override without reason refused
    r = requests.post(f'{API}/production/batches', json=body('ZZ-RUN-1', override_pre_production=True), headers=CEO); print('CEO override no reason ->', r.status_code)
    # staff clears dosing tank via checklist QR flow
    ro = requests.get(f'{API}/maintenance/staff-auth/roster', params={'pre_production': T}).json(); print('roster ok', ro['equipment_name'], len(ro['members']) > 0)
    S = {'X-Staff-Token': requests.post(f'{API}/maintenance/staff-auth/login', json={'pre_production': T, 'member_id': m1, 'pin': '7777'}).json()['staff_token']}
    st = requests.get(f'{API}/maintenance/pre-production', headers=S).json(); print('staff sees', [(i['name'], i['can_tick']) for i in st['items']])
    r = requests.post(f'{API}/maintenance/pre-production/{e_all}/clear', json={}, headers=S); print('staff clear', r.status_code, r.json()['record']['performed_via'], r.json()['record']['actor_kind'])
    print('clear again ->', requests.post(f'{API}/maintenance/pre-production/{e_all}/clear', json={}, headers=S).status_code, '(409)')
    print('CEO undo of staff clearance ->', requests.post(f'{API}/maintenance/pre-production/{e_all}/undo', headers=CEO).status_code, '(409)')
    sc = requests.get(f'{API}/maintenance/equipment-scan/{e_all}', headers=S).json(); print('equipment-scan per_run:', sc['per_run']['cleared'], sc['per_run']['record']['performed_by'])
    # batch for SKU B now allowed and consumes the clearance
    r = requests.post(f'{API}/production/batches', json=body('ZZ-RUN-1'), headers=CEO); print('batch B ->', r.status_code, 'clearances', [(c['equipment_name'], c['performed_by']) for c in r.json().get('pre_production_clearances', [])]); codes.append(r.json().get('id'))
    rec = db.maintenance_records.find_one({'equipment_id': e_all}, {'_id': 0, 'consumed_by_batch_code': 1}); print('record consumed by', rec['consumed_by_batch_code'])
    print('undo after consume ->', requests.post(f'{API}/maintenance/pre-production/{e_all}/undo', headers=S).status_code, '(409)')
    # second batch for B blocked again (clearance consumed)
    r = requests.post(f'{API}/production/batches', json=body('ZZ-RUN-2'), headers=CEO); print('batch B again ->', r.status_code)
    # CEO override with reason works + admin notification
    before = db.notifications.count_documents({'tenant_id': T, 'title': {'$regex': 'checklist overridden'}})
    r = requests.post(f'{API}/production/batches', json=body('ZZ-RUN-2', override_pre_production=True, override_pre_production_reason='urgent order'), headers=CEO); print('CEO override ->', r.status_code, r.json().get('pre_production_override', {}).get('reason')); codes.append(r.json().get('id'))
    print('override notifications:', db.notifications.count_documents({'tenant_id': T, 'title': {'$regex': 'checklist overridden'}}) - before)
    # SKU A needs both; clear filler as staff then undo own
    r = requests.post(f'{API}/maintenance/pre-production/{e_a}/clear', json={}, headers=S); print('clear filler', r.status_code)
    print('staff undo own ->', requests.post(f'{API}/maintenance/pre-production/{e_a}/undo', headers=S).status_code, 'audit', db.maintenance_audit.count_documents({'equipment_id': e_a, 'action': 'pre_production_undo'}))
finally:
    db.production_batches.delete_many({'tenant_id': T, 'batch_code': {'$regex': '^ZZ-RUN'}})
    db.maintenance_records.delete_many({'equipment_id': {'$in': [e_all, e_a]}}); db.maintenance_audit.delete_many({'equipment_id': {'$in': [e_all, e_a]}})
    db.notifications.delete_many({'tenant_id': T, 'title': {'$regex': 'checklist overridden'}}); db.factory_staff_sessions.delete_many({'member_id': m1})
    for e in (e_all, e_a): requests.delete(f'{API}/production/equipment/{e}', headers=CEO)
    requests.delete(f'{API}/production/qc-team/{m1}', headers=CEO)
    print('cleaned; ZZ left:', db.equipment_master.count_documents({'name': {'$regex': '^ZZ'}}), db.production_batches.count_documents({'batch_code': {'$regex': '^ZZ'}}))
