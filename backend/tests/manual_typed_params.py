import io
import requests
from PIL import Image
from pymongo import MongoClient
from dotenv import dotenv_values
API = [l.split('=', 1)[1].strip() for l in open('/app/frontend/.env') if l.startswith('REACT_APP_BACKEND_URL')][0] + '/api'
T = 'nyla-air-water'; H = {'X-Tenant-ID': T}
env = dotenv_values('/app/backend/.env'); db = MongoClient(env['MONGO_URL'])[env['DB_NAME']]
login = lambda e: {**H, 'Authorization': 'Bearer ' + requests.post(f'{API}/auth/login', json={'email': e, 'password': 'test123'}, headers=H).json()['session_token']}
CEO = login('admin@nylaairwater.earth')
types = requests.get(f'{API}/production/equipment/types', headers=CEO).json()['types']
P = [{'key': 'pressure', 'name': 'Pressure', 'type': 'number', 'unit': 'bar', 'min': 1, 'max': 5, 'required': True},
     {'key': 'remarks', 'name': 'Remarks', 'type': 'text', 'required': False},
     {'key': 'condition', 'name': 'Condition', 'type': 'radio', 'required': True, 'options': [{'label': 'OK'}, {'label': 'Leaking', 'photo_required': True, 'alert': True}]},
     {'key': 'checks', 'name': 'Checks done', 'type': 'checkbox', 'required': True, 'options': [{'label': 'Cleaned'}, {'label': 'Lubricated'}, {'label': 'Seal replaced', 'photo_required': True}]}]
r = requests.post(f'{API}/production/equipment', json={'name': 'ZZ TYPED pump', 'equipment_type_id': types[0]['id'], 'per_run_maintenance': True, 'per_run_sku_ids': [], 'maintenance_parameters': P}, headers=CEO)
eid = r.json()['id']; print('equipment ->', r.status_code, [(p['type'], len(p.get('options', []))) for p in r.json()['maintenance_parameters']])
clear = lambda body: requests.post(f'{API}/maintenance/pre-production/{eid}/clear', json={'parameter_values': body}, headers=CEO)
undo = lambda: requests.post(f'{API}/maintenance/pre-production/{eid}/undo', json={}, headers=CEO).status_code
try:
    print('missing radio ->', clear({'pressure': 3, 'checks': ['Cleaned']}).status_code, clear({'pressure': 3, 'checks': ['Cleaned']}).json()['detail'])
    print('invalid option ->', clear({'pressure': 3, 'condition': 'Broken', 'checks': ['Cleaned']}).json()['detail'])
    print('radio multi ->', clear({'pressure': 3, 'condition': ['OK', 'Leaking'], 'checks': ['Cleaned']}).json()['detail'])
    r = clear({'pressure': 3, 'condition': 'Leaking', 'checks': ['Cleaned']}); print('photo required ->', r.status_code, r.json()['detail'])
    buf = io.BytesIO(); Image.new('RGB', (400, 300), (30, 120, 200)).save(buf, 'JPEG')
    ph = requests.post(f'{API}/maintenance/equipment/{eid}/param-photo', files={'file': ('c.jpg', buf.getvalue(), 'image/jpeg')}, headers=CEO); print('photo upload ->', ph.status_code, ph.json().get('filename'))
    pid = ph.json()['id']
    r = clear({'pressure': 3, 'remarks': '  noted ', 'condition': {'value': 'Leaking', 'photo_ids': [pid]}, 'checks': ['Cleaned', 'Lubricated']}); print('clear ->', r.status_code)
    rec = r.json()['record']; print('rows:', [(p['type'], p['value'], p['in_range'], len(p['photos'])) for p in rec['parameters']]); print('out:', rec['parameters_out_of_range'])
    print('pending photo cleaned:', db.maintenance_param_photos.count_documents({'id': pid}), '| alert notif:', db.notifications.count_documents({'tenant_id': T, 'title': {'$regex': 'parameter alert — ZZ TYPED'}}))
    img = requests.get(f'{API}/maintenance/records/{rec["id"]}/photos/{pid}', headers=CEO); print('record photo ->', img.status_code, img.headers.get('content-type'), len(img.content))
    st = requests.get(f'{API}/maintenance/pre-production', headers=CEO).json(); it = next(i for i in st['items'] if i['id'] == eid); print('checklist record params', len(it['record']['parameters']), 'photos', len(it['record']['parameters'][2]['photos']))
    print('undo ->', undo())
    print('optional text omitted ok ->', clear({'pressure': 2, 'condition': 'OK', 'checks': ['Cleaned']}).status_code, '| undo', undo())
    print('legacy number-only payload ->', clear({'pressure': 2, 'condition': 'OK', 'checks': 'Cleaned'}).status_code, '| undo', undo())
finally:
    db.maintenance_records.delete_many({'tenant_id': T, 'equipment_id': eid}); db.maintenance_param_photos.delete_many({'equipment_id': eid})
    db.equipment_master.delete_many({'tenant_id': T, 'name': {'$regex': '^ZZ TYPED'}}); db.notifications.delete_many({'tenant_id': T, 'title': {'$regex': 'ZZ TYPED'}})
    print('leftover', db.equipment_master.count_documents({'name': {'$regex': '^ZZ TYPED'}}))
