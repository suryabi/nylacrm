import io
import zipfile
import requests
from PIL import Image
from pymongo import MongoClient
from dotenv import dotenv_values
API = [l.split('=', 1)[1].strip() for l in open('/app/frontend/.env') if l.startswith('REACT_APP_BACKEND_URL')][0] + '/api'
T = 'nyla-air-water'; H = {'X-Tenant-ID': T}
env = dotenv_values('/app/backend/.env'); db = MongoClient(env['MONGO_URL'])[env['DB_NAME']]
login = lambda e: {**H, 'Authorization': 'Bearer ' + requests.post(f'{API}/auth/login', json={'email': e, 'password': 'test123'}, headers=H).json()['session_token']}
CEO = login('admin@nylaairwater.earth')
sup = db.users.find_one({'tenant_id': T, 'email': 'noida.sales3@nylaairwater.earth'}, {'_id': 0, 'id': 1, 'name': 1})
types = requests.get(f'{API}/production/equipment/types', headers=CEO).json()['types']
P = [{'key': 'pressure', 'name': 'Pressure', 'type': 'number', 'unit': 'bar', 'min': 1, 'max': 5},
     {'key': 'condition', 'name': 'Condition', 'type': 'radio', 'options': [{'label': 'OK'}, {'label': 'Leaking', 'photo_required': True, 'alert': True}]}]
mk = lambda name: requests.post(f'{API}/production/equipment', json={'name': name, 'equipment_type_id': types[0]['id'], 'per_run_maintenance': True, 'per_run_sku_ids': [], 'maintenance_parameters': P, 'supervisor_ids': [sup['id']] if 'SUP' in name else []}, headers=CEO).json()['id']
e1, e2 = mk('ZZ DIG SUP pump'), mk('ZZ DIG other pump')
print('set sup ->', requests.put(f'{API}/production/equipment/{e1}/supervisors', json={'user_ids': [sup['id']]}, headers=CEO).status_code, db.equipment_master.find_one({'id': e1}, {'_id': 0, 'supervisor_ids': 1}))
photo = lambda eid: requests.post(f'{API}/maintenance/equipment/{eid}/param-photo', files={'file': ('c.jpg', (lambda b: (Image.new('RGB', (300, 200), (200, 40, 40)).save(b, 'JPEG'), b.getvalue())[1])(io.BytesIO()), 'image/jpeg')}, headers=CEO).json()['id']
clear = lambda eid, body: requests.post(f'{API}/maintenance/pre-production/{eid}/clear', json={'parameter_values': body}, headers=CEO)
try:
    r1 = clear(e1, {'pressure': 9, 'condition': {'value': 'Leaking', 'photo_ids': [photo(e1)]}}); print('rec1', r1.status_code, r1.json()['record']['parameters_out_of_range'])
    r2 = clear(e2, {'pressure': 0.5, 'condition': 'OK'}); print('rec2', r2.status_code, r2.json()['record']['parameters_out_of_range'])
    day = r1.json()['record']['completed_at'][:10]
    pv = requests.get(f'{API}/maintenance/alert-digest', params={'date': day}, headers=CEO).json()
    mine = [i for i in pv['items'] if i['equipment_name'].startswith('ZZ DIG')]; print('preview items', len(mine), [(i['equipment_name'], [(f['parameter'], f['value'], f['kind'], f['photos']) for f in i['flags']]) for i in mine])
    before = db.notifications.count_documents({'tenant_id': T, 'title': {'$regex': 'alert digest'}})
    s = requests.post(f'{API}/maintenance/alert-digest/send', params={'date': day}, headers=CEO).json(); print('send ->', s)
    notes = list(db.notifications.find({'tenant_id': T, 'title': {'$regex': 'alert digest'}}, {'_id': 0, 'user_id': 1, 'body': 1}))
    supn = [n for n in notes if n['user_id'] == sup['id']]; print('supervisor notif:', len(supn), (supn[0]['body'][:120] if supn else None))
    print('supervisor body excludes other pump:', all('other pump' not in n['body'] for n in supn))
    print('marker:', db.maintenance_alert_digest.find_one({'tenant_id': T, 'date': day}, {'_id': 0, 'recipients': 1, 'items': 1}))
    g = requests.get(f'{API}/maintenance/equipment/{e1}/photos', headers=CEO).json(); print('gallery', g['counts'], g['months'], [(p['kind'], p['parameter'], p['option'], p['alert'], p['record_status'], 'storage_path' in p) for p in g['photos']])
    print('filter month none:', len(requests.get(f'{API}/maintenance/equipment/{e1}/photos', params={'month': '1999-01'}, headers=CEO).json()['photos']), '| kind inspection:', len(requests.get(f'{API}/maintenance/equipment/{e1}/photos', params={'kind': 'inspection'}, headers=CEO).json()['photos']))
    z = requests.get(f'{API}/maintenance/equipment/{e1}/photos.zip', headers=CEO); zf = zipfile.ZipFile(io.BytesIO(z.content)); print('zip', z.status_code, z.headers.get('content-type'), zf.namelist()); print(zf.read('manifest.csv').decode()[:300])
finally:
    for eid in (e1, e2):
        db.maintenance_records.delete_many({'tenant_id': T, 'equipment_id': eid}); db.maintenance_param_photos.delete_many({'equipment_id': eid})
    db.equipment_master.delete_many({'tenant_id': T, 'name': {'$regex': '^ZZ DIG'}})
    db.notifications.delete_many({'tenant_id': T, 'title': {'$regex': 'ZZ DIG|alert digest'}}); db.maintenance_alert_digest.delete_many({'tenant_id': T})
    print('leftover', db.equipment_master.count_documents({'name': {'$regex': '^ZZ DIG'}}))
