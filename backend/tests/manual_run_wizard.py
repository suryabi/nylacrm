import requests
from pymongo import MongoClient
from dotenv import dotenv_values
API = [l.split('=', 1)[1].strip() for l in open('/app/frontend/.env') if l.startswith('REACT_APP_BACKEND_URL')][0] + '/api'
T = 'nyla-air-water'; H = {'X-Tenant-ID': T}
env = dotenv_values('/app/backend/.env'); db = MongoClient(env['MONGO_URL'])[env['DB_NAME']]
login = lambda e: {**H, 'Authorization': 'Bearer ' + requests.post(f'{API}/auth/login', json={'email': e, 'password': 'test123'}, headers=H).json()['session_token']}
CEO = login('admin@nylaairwater.earth')
sku = db.master_skus.find_one({'tenant_id': T, 'is_active': {'$ne': False}}, {'_id': 0, 'id': 1, 'sku_name': 1, 'sku_code': 1})
types = requests.get(f'{API}/production/equipment/types', headers=CEO).json()['types']
P = [{'key': 'pressure', 'name': 'Pressure', 'unit': 'bar', 'min': 1, 'max': 5, 'required': True}]
e_pre = requests.post(f'{API}/production/equipment', json={'name': 'ZZ WIZ Dosing tank', 'equipment_type_id': types[0]['id'], 'per_run_maintenance': True, 'per_run_sku_ids': [sku['id']], 'maintenance_parameters': P}, headers=CEO).json()['id']
e_post = requests.post(f'{API}/production/equipment', json={'name': 'ZZ WIZ Filler CIP', 'equipment_type_id': types[0]['id'], 'post_run_maintenance': True, 'post_run_sku_ids': [], 'maintenance_parameters': P}, headers=CEO).json()['id']
bid = None
try:
    r = requests.post(f'{API}/production/run/initiate', json={'sku_id': sku['id']}, headers=CEO); print('initiate ->', r.status_code, r.json()); bid = r.json()['batch_id']
    r2 = requests.post(f'{API}/production/run/initiate', json={'sku_id': sku['id']}, headers=CEO).json(); print('2nd initiate code', r2['batch_code'])
    print('cancel 2nd ->', requests.post(f'{API}/production/run/{r2["batch_id"]}/cancel', headers=CEO).status_code, db.production_batches.count_documents({'id': r2['batch_id']}))
    g = requests.get(f'{API}/production/run/{bid}', headers=CEO).json(); print('status', g['batch']['status'], 'pre items', [(i['name'], i['can_tick'], len(i['maintenance_parameters'])) for i in g['checklist']['items']], 'all_clear', g['checklist']['all_clear'])
    print('start blocked ->', requests.post(f'{API}/production/run/{bid}/start', json={}, headers=CEO).status_code)
    print('clear w/o params ->', requests.post(f'{API}/maintenance/pre-production/{e_pre}/clear', json={}, headers=CEO).status_code)
    r = requests.post(f'{API}/maintenance/pre-production/{e_pre}/clear', json={'parameter_values': {'pressure': 3.2}}, headers=CEO); print('clear ->', r.status_code)
    g = requests.get(f'{API}/production/run/{bid}', headers=CEO).json(); print('record params', g['checklist']['items'][0]['record'].get('parameters'), 'all_clear', g['checklist']['all_clear'])
    print('start (no QC params needed) ->', requests.post(f'{API}/production/run/{bid}/start', json={}, headers=CEO).status_code)
    print('stop ->', requests.post(f'{API}/production/run/{bid}/stop', json={'total_crates': 40, 'notes': 'ok'}, headers=CEO).status_code)
    g = requests.get(f'{API}/production/run/{bid}', headers=CEO).json(); tid = g['post_tasks'][0]['id']; print('post tasks', [(t['equipment_name'], t['status'], len(t['maintenance_parameters'])) for t in g['post_tasks']])
    print('close blocked ->', requests.post(f'{API}/production/run/{bid}/close', json={}, headers=CEO).status_code)
    print('post complete ->', requests.post(f'{API}/maintenance/pre-production/post/{tid}/complete', json={'parameter_values': {'pressure': 9}}, headers=CEO).status_code, db.post_run_tasks.find_one({'id': tid}, {'parameters': 1})['parameters'])
    print('close dup code ->', requests.post(f'{API}/production/run/{bid}/close', json={'batch_code': db.production_batches.find_one({'tenant_id': T, 'id': {'$ne': bid}})['batch_code']}, headers=CEO).status_code)
    r = requests.post(f'{API}/production/run/{bid}/close', json={'batch_code': 'ZZ-WIZ-FINAL', 'total_crates': 42, 'notes': 'final', 'production_date': '2026-06-02'}, headers=CEO); print('close ->', r.status_code, r.json())
    b = db.production_batches.find_one({'id': bid}, {'_id': 0, 'batch_code': 1, 'status': 1, 'total_crates': 1, 'total_bottles': 1, 'production_date': 1, 'run.output_notes': 1, 'pre_production_clearances.parameters': 1}); print('final batch', b)
    pdf = requests.get(f'{API}/production/run/{bid}/report.pdf', headers=CEO); print('pdf', pdf.status_code, pdf.headers.get('content-type'), pdf.content[:5])
    print('cancel closed ->', requests.post(f'{API}/production/run/{bid}/cancel', headers=CEO).status_code, '(409)')
finally:
    db.production_batches.delete_many({'tenant_id': T, '$or': [{'id': bid}, {'batch_code': {'$regex': '^ZZ-WIZ'}}, {'sku_id': sku['id'], 'run.wizard': True, 'status': 'planned'}]})
    db.post_run_tasks.delete_many({'tenant_id': T, 'equipment_id': {'$in': [e_pre, e_post]}})
    db.maintenance_records.delete_many({'tenant_id': T, 'equipment_id': {'$in': [e_pre, e_post]}})
    db.equipment_master.delete_many({'tenant_id': T, 'name': {'$regex': '^ZZ WIZ'}})
    db.notifications.delete_many({'tenant_id': T, 'title': {'$regex': 'ZZ-WIZ|closed — batch'}})
    print('leftover', db.equipment_master.count_documents({'name': {'$regex': '^ZZ WIZ'}}), db.production_batches.count_documents({'batch_code': {'$regex': '^ZZ-WIZ'}}))
