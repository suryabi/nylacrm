"""Seed 'ZZ PARAM Pump' equipment with 3 typed params for UI testing.

Prints JSON: {"eq_id":"...","sku_id":"..."} on stdout final line.
"""
import json, requests
from dotenv import dotenv_values
from pymongo import MongoClient

API = [l.split('=', 1)[1].strip() for l in open('/app/frontend/.env') if l.startswith('REACT_APP_BACKEND_URL')][0] + '/api'
T = 'nyla-air-water'
H = {'X-Tenant-ID': T}
env = dotenv_values('/app/backend/.env')
db = MongoClient(env['MONGO_URL'])[env['DB_NAME']]

tok = requests.post(f'{API}/auth/login', json={'email': 'admin@nylaairwater.earth', 'password': 'test123'}, headers=H).json()['session_token']
CEO = {**H, 'Authorization': 'Bearer ' + tok}

# Cleanup any prior ZZ PARAM equipment
prev = list(db.equipment_master.find({'tenant_id': T, 'name': {'$regex': '^ZZ PARAM'}}))
for e in prev:
    db.maintenance_records.delete_many({'equipment_id': e['id']})
    db.maintenance_param_photos.delete_many({'equipment_id': e['id']})
    db.post_run_tasks.delete_many({'equipment_id': e['id']})
db.equipment_master.delete_many({'tenant_id': T, 'name': {'$regex': '^ZZ PARAM'}})
db.notifications.delete_many({'tenant_id': T, 'title': {'$regex': 'ZZ PARAM'}})

types = requests.get(f'{API}/production/equipment/types', headers=CEO).json()['types']
params = [
    {'key': 'pressure', 'name': 'Pressure', 'type': 'number', 'unit': 'bar', 'min': 1, 'max': 5, 'required': True},
    {'key': 'condition', 'name': 'Condition', 'type': 'radio', 'required': True, 'options': [
        {'label': 'OK', 'photo_required': False, 'alert': False},
        {'label': 'Leaking', 'photo_required': True, 'alert': True},
    ]},
    {'key': 'notes', 'name': 'Notes', 'type': 'text', 'required': False},
]
r = requests.post(f'{API}/production/equipment', json={
    'name': 'ZZ PARAM Pump',
    'equipment_type_id': types[0]['id'],
    'per_run_maintenance': True,
    'per_run_sku_ids': [],  # all SKUs
    'maintenance_parameters': params,
}, headers=CEO)
r.raise_for_status()
eq = r.json()

# Locate 'Demo 500ml' SKU
skus = requests.get(f'{API}/production-skus', headers=CEO).json().get('production_skus', [])
demo = next((s for s in skus if s.get('sku_name', '').lower().startswith('demo 500')), None)

print(json.dumps({'eq_id': eq['id'], 'sku_id': demo['id'] if demo else None, 'sku_name': demo['sku_name'] if demo else None, 'params_persisted': [(p['name'], p['type'], len(p.get('options', []))) for p in eq['maintenance_parameters']]}))
