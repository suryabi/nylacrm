import random, requests
from datetime import datetime, timezone, timedelta
from pymongo import MongoClient
from dotenv import dotenv_values

API = [l.split('=', 1)[1].strip() for l in open('/app/frontend/.env') if l.startswith('REACT_APP_BACKEND_URL')][0] + '/api'
T = 'nyla-air-water'
H = {'X-Tenant-ID': T}
env = dotenv_values('/app/backend/.env'); db = MongoClient(env['MONGO_URL'])[env['DB_NAME']]

def j(r):
    try: return r.json()
    except Exception: return r.text

tok = requests.post(f'{API}/auth/login', json={'email': 'admin@nylaairwater.earth', 'password': 'test123'}, headers=H).json()['session_token']
A = {**H, 'Authorization': f'Bearer {tok}'}
fac = db.facilities.find_one({'tenant_id': T, 'floors.areas.0': {'$exists': True}}, {'_id': 0})
fl = next(f for f in fac['floors'] if f.get('areas')); area = fl['areas'][0]
print('using area', fac['facility_name'], '›', fl['name'], '›', area['name'], area['id'])
today = (datetime.now(timezone.utc) + timedelta(hours=5, minutes=30)).strftime('%Y-%m-%d')
types = requests.get(f'{API}/production/equipment/types', headers=A).json()['types']
mk = lambda name: requests.post(f'{API}/production/equipment', json={'name': name, 'equipment_type_id': types[0]['id'], 'maintenance_frequency_days': 1,
      'maintenance_start_date': today, 'facility_id': fac['id'], 'floor_id': fl['id'], 'area_id': area['id']}, headers=A).json()['id']
e1, e2, e3 = mk('ZZ Area Pump A'), mk('ZZ Area Pump B'), mk('ZZ Area Filter C (others)')
m1 = requests.post(f'{API}/production/qc-team', json={'name': 'ZZ Area Staff', 'role': 'Operator'}, headers=A).json()['id']
m2 = requests.post(f'{API}/production/qc-team', json={'name': 'ZZ Other Staff', 'role': 'Operator'}, headers=A).json()['id']
requests.put(f'{API}/production/qc-team/{m1}/pin', json={'pin': '2468'}, headers=A)
requests.put(f'{API}/production/equipment/{e1}/maintenance-staff', json={'user_ids': [m1]}, headers=A)
requests.put(f'{API}/production/equipment/{e3}/maintenance-staff', json={'user_ids': [m2]}, headers=A)
try:
    st = requests.get(f'{API}/maintenance/areas/stickers', params={'origin': 'https://x.test', 'area_id': area['id']}, headers=A).json()['areas'][0]
    print('sticker:', st['area_name'], 'equipment_count', st['equipment_count'], 'qr', st['qr'][:22])
    print('area-scan no auth ->', requests.get(f'{API}/maintenance/area-scan/{area["id"]}').status_code, '(401)')
    ro = requests.get(f'{API}/maintenance/staff-auth/roster', params={'area_id': area['id']}).json()
    print('roster (assigned union):', sorted(m['name'] for m in ro['members']))
    lg = requests.post(f'{API}/maintenance/staff-auth/login', json={'area_id': area['id'], 'member_id': m1, 'pin': '2468'}); print('staff login', lg.status_code)
    S = {'X-Staff-Token': lg.json()['staff_token']}
    sc = requests.get(f'{API}/maintenance/area-scan/{area["id"]}', headers=S).json()
    mine = {i['name']: (i['state'], i['can_tick']) for i in sc['equipment'] if i['name'].startswith('ZZ')}
    print('staff view:', mine, '| summary', sc['summary'])
    # force photo_required on e2 to test the skip
    db.maintenance_slots.update_one({'tenant_id': T, 'equipment_id': e2, 'date': today}, {'$set': {'photo_required': True}})
    sc = requests.get(f'{API}/maintenance/area-scan/{area["id"]}', headers=S).json()
    print('after photo flag:', {i['name']: i['state'] for i in sc['equipment'] if i['name'].startswith('ZZ')})
    res = requests.post(f'{API}/maintenance/area-scan/{area["id"]}/complete', json={'equipment_ids': [e1, e2, e3], 'remarks': 'area bulk test'}, headers=S).json()
    print('complete:', [c['name'] for c in res['completed']], '| skipped:', [(s['name'], s['reason'][:40]) for s in res['skipped']])
    rec = db.maintenance_records.find_one({'tenant_id': T, 'equipment_id': e1}, {'_id': 0, 'performed_via': 1, 'performed_by': 1, 'area_name': 1, 'status': 1})
    print('record:', rec)
    sc = requests.get(f'{API}/maintenance/area-scan/{area["id"]}', headers=S).json()
    print('after complete:', {i['name']: i['state'] for i in sc['equipment'] if i['name'].startswith('ZZ')})
    print('again ->', requests.post(f'{API}/maintenance/area-scan/{area["id"]}/complete', json={'equipment_ids': [e1]}, headers=S).json()['skipped'][0]['reason'])
    ad = requests.get(f'{API}/maintenance/area-scan/{area["id"]}', headers=A).json()
    print('admin view can_tick C:', next(i['can_tick'] for i in ad['equipment'] if i['id'] == e3), 'is_admin', ad['actor']['is_admin'])
    eq = db.equipment_master.find_one({'id': e1}, {'_id': 0, 'last_maintenance_date': 1, 'next_maintenance_due': 1}); print('equipment dates:', eq)
finally:
    print('cleanup: slots', db.maintenance_slots.delete_many({'tenant_id': T, 'equipment_id': {'$in': [e1, e2, e3]}}).deleted_count,
          'records', db.maintenance_records.delete_many({'tenant_id': T, 'equipment_id': {'$in': [e1, e2, e3]}}).deleted_count,
          'sessions', db.factory_staff_sessions.delete_many({'member_id': {'$in': [m1, m2]}}).deleted_count)
    for e in (e1, e2, e3): requests.delete(f'{API}/production/equipment/{e}', headers=A)
    for m in (m1, m2): requests.delete(f'{API}/production/qc-team/{m}', headers=A)
    print('cleanup done; remaining ZZ equipment:', db.equipment_master.count_documents({'tenant_id': T, 'name': {'$regex': '^ZZ Area'}}))
