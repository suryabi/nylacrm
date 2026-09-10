import os, sys, json, random, requests
API = [l.split('=', 1)[1].strip() for l in open('/app/frontend/.env') if l.startswith('REACT_APP_BACKEND_URL')][0] + '/api'
T = 'nyla-air-water'
H = {'X-Tenant-ID': T}

def j(r):
    try: return r.json()
    except Exception: return r.text

r = requests.post(f'{API}/auth/login', json={'email': 'admin@nylaairwater.earth', 'password': 'test123'}, headers=H)
tok = r.json()['session_token']
A = {**H, 'Authorization': f'Bearer {tok}'}

# temp staff member with PIN + face
m = requests.post(f'{API}/production/qc-team', json={'name': 'ZZ Test Staff Face', 'role': 'Factory Operator'}, headers=A); print('member', m.status_code, j(m).get('id'))
mid = m.json()['id']
random.seed(11); desc = [round(random.uniform(-0.2, 0.2), 4) for _ in range(128)]
print('face', requests.put(f'{API}/production/qc-team/{mid}/face', json={'descriptors': [desc]}, headers=A).status_code)
print('pin', requests.put(f'{API}/production/qc-team/{mid}/pin', json={'pin': '4321'}, headers=A).status_code)

# temp equipment assigned to this staff, daily maintenance from today
types = requests.get(f'{API}/production/equipment/types', headers=A).json()['types']
from datetime import datetime, timezone, timedelta
today = (datetime.now(timezone.utc) + timedelta(hours=5, minutes=30)).strftime('%Y-%m-%d')
e = requests.post(f'{API}/production/equipment', json={'name': 'ZZ Test Scan Pump', 'equipment_type_id': types[0]['id'],
                  'maintenance_frequency_days': 1, 'maintenance_start_date': today}, headers=A); print('equipment', e.status_code)
eid = e.json()['id']
print('assign', requests.put(f'{API}/production/equipment/{eid}/maintenance-staff', json={'user_ids': [mid]}, headers=A).status_code)

try:
    # 1. unauthenticated sticker scan → 401
    print('sticker no-auth ->', requests.get(f'{API}/maintenance/equipment-scan/{eid}').status_code, '(expect 401)')
    # 2. public roster
    ro = requests.get(f'{API}/maintenance/staff-auth/roster', params={'equipment_id': eid}); print('roster', ro.status_code, [x['name'] for x in ro.json()['members']], 'face_available', ro.json()['face_available'])
    # 3. wrong pin
    print('wrong pin ->', requests.post(f'{API}/maintenance/staff-auth/login', json={'equipment_id': eid, 'member_id': mid, 'pin': '0000'}).status_code, '(expect 401)')
    # 4. pin login
    lg = requests.post(f'{API}/maintenance/staff-auth/login', json={'equipment_id': eid, 'member_id': mid, 'pin': '4321'}); print('pin login', lg.status_code, lg.json().get('member'))
    st = lg.json()['staff_token']; S = {'X-Staff-Token': st}
    # 5. face login (server-side match)
    fl = requests.post(f'{API}/maintenance/staff-auth/login', json={'equipment_id': eid, 'descriptor': desc}); print('face login', fl.status_code, fl.json().get('member', fl.json()))
    bad = requests.post(f'{API}/maintenance/staff-auth/login', json={'equipment_id': eid, 'descriptor': [0.9] * 128}); print('unknown face ->', bad.status_code, j(bad))
    # 6. sticker scan with staff token → token for today
    sc = requests.get(f'{API}/maintenance/equipment-scan/{eid}', headers=S); print('sticker w/ staff', sc.status_code, 'scheduled_today', sc.json().get('scheduled_today'))
    token = sc.json()['token']
    # 7. roster by token too
    print('roster by token', requests.get(f'{API}/maintenance/staff-auth/roster', params={'token': token}).status_code)
    # 8. scan status
    ss = requests.get(f'{API}/maintenance/scan/{token}', headers=S); print('scan status', ss.status_code, 'valid', ss.json().get('valid'), 'staff_required', ss.json().get('staff_verification_required'), 'admin_bypass', ss.json().get('admin_bypass'))
    # 9. submit without staff_member_id (actor = staff)
    sub = requests.post(f'{API}/maintenance/scan/{token}/submit', json={'status': 'completed', 'remarks': 'staff phone test', 'photo_ids': []}, headers=S)
    print('submit', sub.status_code, {k: sub.json().get(k) for k in ('performed_by', 'performed_via', 'performed_by_role', 'verified_by_user')} if sub.ok else j(sub))
    # 10. unassigned staff: create another member and try
    m2 = requests.post(f'{API}/production/qc-team', json={'name': 'ZZ Test Staff Other', 'role': 'Helper'}, headers=A).json(); mid2 = m2['id']
    requests.put(f'{API}/production/qc-team/{mid2}/pin', json={'pin': '9999'}, headers=A)
    ro2 = requests.get(f'{API}/maintenance/staff-auth/roster', params={'equipment_id': eid}).json(); print('roster excludes unassigned:', mid2 not in [x['id'] for x in ro2['members']])
    print('unassigned pin login ->', requests.post(f'{API}/maintenance/staff-auth/login', json={'equipment_id': eid, 'member_id': mid2, 'pin': '9999'}).status_code, '(expect 400)')
    # 11. logout invalidates
    print('logout', requests.post(f'{API}/maintenance/staff-auth/logout', headers=S).status_code, '-> scan after logout', requests.get(f'{API}/maintenance/scan/{token}', headers=S).status_code, '(expect 401)')
    # 12. admin app session still works
    print('admin scan status', requests.get(f'{API}/maintenance/scan/{token}', headers=A).status_code)
finally:
    # cleanup
    from pymongo import MongoClient
    from dotenv import dotenv_values
    env = dotenv_values('/app/backend/.env'); db = MongoClient(env['MONGO_URL'])[env['DB_NAME']]
    print('cleanup slots', db.maintenance_slots.delete_many({'tenant_id': T, 'equipment_id': eid}).deleted_count,
          'records', db.maintenance_records.delete_many({'tenant_id': T, 'equipment_id': eid}).deleted_count,
          'sessions', db.factory_staff_sessions.delete_many({'tenant_id': T, 'member_id': {'$in': [mid]}}).deleted_count,
          'lockouts', db.login_attempts.delete_many({'identifier': {'$regex': f'staff:{T}$'}}).deleted_count)
    print('del equipment', requests.delete(f'{API}/production/equipment/{eid}', headers=A).status_code)
    for x in (mid, locals().get('mid2')):
        if x: print('del member', requests.delete(f'{API}/production/qc-team/{x}', headers=A).status_code)
