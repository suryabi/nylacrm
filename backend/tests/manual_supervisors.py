import requests, uuid
from datetime import datetime, timezone, timedelta
from pymongo import MongoClient
from dotenv import dotenv_values
API = [l.split('=', 1)[1].strip() for l in open('/app/frontend/.env') if l.startswith('REACT_APP_BACKEND_URL')][0] + '/api'
T = 'nyla-air-water'; H = {'X-Tenant-ID': T}
env = dotenv_values('/app/backend/.env'); db = MongoClient(env['MONGO_URL'])[env['DB_NAME']]
login = lambda e: {**H, 'Authorization': 'Bearer ' + requests.post(f'{API}/auth/login', json={'email': e, 'password': 'test123'}, headers=H).json()['session_token']}
A = login('admin@nylaairwater.earth'); SUP = login('creative.director@nylaairwater.earth')
sup_user = db.users.find_one({'tenant_id': T, 'email': 'creative.director@nylaairwater.earth'}, {'_id': 0, 'id': 1, 'name': 1}); print('supervisor user', sup_user)
fac = db.facilities.find_one({'tenant_id': T, 'floors.areas.0': {'$exists': True}}, {'_id': 0}); fl = next(f for f in fac['floors'] if f.get('areas')); area = fl['areas'][0]
today = (datetime.now(timezone.utc) + timedelta(hours=5, minutes=30)).strftime('%Y-%m-%d')
types = requests.get(f'{API}/production/equipment/types', headers=A).json()['types']
mk = lambda n: requests.post(f'{API}/production/equipment', json={'name': n, 'equipment_type_id': types[0]['id'], 'maintenance_frequency_days': 1, 'maintenance_start_date': today,
      'facility_id': fac['id'], 'floor_id': fl['id'], 'area_id': area['id']}, headers=A).json()['id']
e1, e2 = mk('ZZ Sup Pump Direct'), mk('ZZ Sup Pump Inherit')
prev_area_sups = area.get('supervisor_ids') or []
try:
    # 1. direct supervisor on e1
    r = requests.put(f'{API}/production/equipment/{e1}/supervisors', json={'user_ids': [sup_user['id']]}, headers=A); print('set eq supervisors', r.status_code, [x['name'] for x in r.json()['supervisors']])
    # before area supervisors: e2 has none -> supervisor cannot act
    sc = requests.get(f'{API}/maintenance/equipment-scan/{e2}', headers=SUP).json(); st = requests.get(f'{API}/maintenance/scan/{sc["token"]}', headers=SUP).json()
    print('e2 (no sup) as CD: staff_required', st['staff_verification_required'], 'supervisor_bypass', st['supervisor_bypass'])
    # 2. area supervisors -> e2 inherits
    r = requests.put(f'{API}/facilities/{fac["id"]}/floors/{fl["id"]}/areas/{area["id"]}/supervisors', json={'user_ids': [sup_user['id']]}, headers=A); print('set area supervisors', r.status_code)
    st = requests.get(f'{API}/maintenance/scan/{sc["token"]}', headers=SUP).json()
    print('e2 (inherited) as CD: staff_required', st['staff_verification_required'], 'supervisor_bypass', st['supervisor_bypass'], 'supervisors', [x['name'] for x in st['supervisors']])
    sub = requests.post(f'{API}/maintenance/scan/{sc["token"]}/submit', json={'status': 'completed', 'photo_ids': []}, headers=SUP); print('submit as supervisor', sub.status_code, sub.json().get('performed_via'), sub.json().get('performed_by'))
    # 3. area page as supervisor: e1 tickable
    ar = requests.get(f'{API}/maintenance/area-scan/{area["id"]}', headers=SUP).json()
    print('area as CD: actor', ar['actor'], 'e1 can_tick', next(i['can_tick'] for i in ar['equipment'] if i['id'] == e1))
    tk = requests.post(f'{API}/maintenance/area-scan/{area["id"]}/tick', json={'equipment_id': e1}, headers=SUP); print('area tick as CD', tk.status_code, tk.json().get('record', {}).get('actor_kind'))
    # 4. missed summary routed to supervisor: undo tick, create missed slot for e1 yesterday
    requests.post(f'{API}/maintenance/area-scan/{area["id"]}/untick', json={'equipment_id': e1}, headers=SUP)
    yday = (datetime.now(timezone.utc) + timedelta(hours=5, minutes=30) - timedelta(days=1)).strftime('%Y-%m-%d')
    db.maintenance_slots.insert_one({'id': 'test-missed-' + uuid.uuid4().hex[:6], 'tenant_id': T, 'equipment_id': e1, 'date': yday, 'token': uuid.uuid4().hex, 'submitted': False, 'photo_required': True, 'created_at': 'x'})
    before = db.notifications.count_documents({'tenant_id': T, 'user_id': sup_user['id'], 'title': {'$regex': 'your equipment'}})
    mc = requests.post(f'{API}/maintenance/missed-check', headers=A).json(); print('missed-check', mc)
    n = db.notifications.find_one({'tenant_id': T, 'user_id': sup_user['id'], 'title': {'$regex': 'your equipment'}}, {'_id': 0, 'title': 1, 'body': 1}, sort=[('created_at', -1)])
    print('supervisor notification:', (db.notifications.count_documents({'tenant_id': T, 'user_id': sup_user['id'], 'title': {'$regex': 'your equipment'}}) - before), n and n['title'])
    # 5. non-supervisor team user without staff identity is still blocked on e1? (CD is supervisor of e1 directly; check an unrelated eq scenario skipped)
finally:
    db.maintenance_slots.delete_many({'tenant_id': T, 'equipment_id': {'$in': [e1, e2]}}); db.maintenance_records.delete_many({'tenant_id': T, 'equipment_id': {'$in': [e1, e2]}})
    db.maintenance_audit.delete_many({'equipment_id': {'$in': [e1, e2]}}); db.notifications.delete_many({'tenant_id': T, 'title': {'$regex': 'Missed maintenance'}, 'created_at': {'$gte': (datetime.now(timezone.utc) - timedelta(minutes=3)).isoformat()}})
    requests.put(f'{API}/facilities/{fac["id"]}/floors/{fl["id"]}/areas/{area["id"]}/supervisors', json={'user_ids': prev_area_sups}, headers=A)
    for e in (e1, e2): requests.delete(f'{API}/production/equipment/{e}', headers=A)
    print('cleaned; area sups restored to', prev_area_sups)
