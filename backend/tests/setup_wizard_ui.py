"""Setup ZZ TEST per_run + post_run equipment for the Production Run Wizard UI test.
Prints JSON with equipment ids for use in the Playwright script."""
import json
import requests

API = [l.split('=', 1)[1].strip() for l in open('/app/frontend/.env') if l.startswith('REACT_APP_BACKEND_URL')][0] + '/api'
T = 'nyla-air-water'; H = {'X-Tenant-ID': T}
tok = requests.post(f'{API}/auth/login', json={'email': 'admin@nylaairwater.earth', 'password': 'test123'}, headers=H).json()['session_token']
CEO = {**H, 'Authorization': f'Bearer {tok}'}
types = requests.get(f'{API}/production/equipment/types', headers=CEO).json()['types']
P = [{'key': 'pressure', 'name': 'Pressure', 'unit': 'bar', 'min': 1, 'max': 5, 'required': True}]
e_pre = requests.post(f'{API}/production/equipment', json={'name': 'ZZ TEST Dosing tank', 'equipment_type_id': types[0]['id'], 'per_run_maintenance': True, 'per_run_sku_ids': [], 'maintenance_parameters': P}, headers=CEO).json()['id']
e_post = requests.post(f'{API}/production/equipment', json={'name': 'ZZ TEST Filler CIP', 'equipment_type_id': types[0]['id'], 'post_run_maintenance': True, 'post_run_sku_ids': [], 'maintenance_parameters': P}, headers=CEO).json()['id']
print(json.dumps({'e_pre': e_pre, 'e_post': e_post}))
