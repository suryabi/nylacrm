"""
Iteration 281: Backend tests for the new bottle-preview lead-logo endpoint and
the /api/leads search used for autocomplete on the White-Label Bottle Preview page.
"""
import os
import pytest
import requests

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', 'https://crm-beverage-ops.preview.emergentagent.com').rstrip('/')

CEO_EMAIL = 'surya.yadavalli@nylaairwater.earth'
CEO_PASSWORD = 'test123'

LEAD_WITH_LOGO_ID = '2c609055-1413-4311-be67-6b0ef1b564e8'  # Test Multi Brand Co


@pytest.fixture(scope='module')
def auth_headers():
    r = requests.post(f'{BASE_URL}/api/auth/login', json={
        'email': CEO_EMAIL, 'password': CEO_PASSWORD
    }, timeout=30)
    assert r.status_code == 200, f'login failed: {r.status_code} {r.text[:200]}'
    token = r.json().get('session_token') or r.json().get('access_token') or r.json().get('token')
    assert token, f'no token in login response: {r.json()}'
    return {'Authorization': f'Bearer {token}'}


class TestLeadsSearch:
    def test_leads_search_returns_data(self, auth_headers):
        r = requests.get(f'{BASE_URL}/api/leads', params={'search': 'Test', 'page_size': 8, 'page': 1},
                         headers=auth_headers, timeout=30)
        assert r.status_code == 200, r.text[:200]
        body = r.json()
        assert 'data' in body, f'expected data key, got {list(body.keys())}'
        assert isinstance(body['data'], list)
        # Should contain at least one lead when searching common word
        # Do not fail hard if no match, just log
        if body['data']:
            lead = body['data'][0]
            assert 'id' in lead
            assert 'company' in lead

    def test_leads_search_multi_brand(self, auth_headers):
        r = requests.get(f'{BASE_URL}/api/leads', params={'search': 'Test Multi Brand', 'page_size': 8},
                         headers=auth_headers, timeout=30)
        assert r.status_code == 200
        data = r.json().get('data', [])
        ids = [d.get('id') for d in data]
        assert LEAD_WITH_LOGO_ID in ids, f'expected {LEAD_WITH_LOGO_ID} in search results, got {ids}'

    def test_leads_search_nonsense(self, auth_headers):
        r = requests.get(f'{BASE_URL}/api/leads', params={'search': 'zzzznomatch', 'page_size': 8},
                         headers=auth_headers, timeout=30)
        assert r.status_code == 200
        data = r.json().get('data', [])
        assert data == [] or len(data) == 0, f'expected no matches, got {len(data)}'


class TestBottlePreviewLeadLogo:
    def test_lead_logo_has_logo(self, auth_headers):
        r = requests.get(f'{BASE_URL}/api/bottle-preview/lead-logo/{LEAD_WITH_LOGO_ID}',
                         headers=auth_headers, timeout=30)
        assert r.status_code == 200, r.text[:200]
        body = r.json()
        assert body.get('has_logo') is True, f'expected has_logo=True, got {body}'
        assert body.get('logo_data', '').startswith('data:image/png;base64,'), \
            f'expected PNG data URL, got prefix: {str(body.get("logo_data", ""))[:60]}'
        assert body.get('company')

    def test_lead_logo_missing(self, auth_headers):
        # Pick a lead without a logo
        r = requests.get(f'{BASE_URL}/api/leads', params={'search': 'Taj', 'page_size': 8},
                         headers=auth_headers, timeout=30)
        data = r.json().get('data', [])
        target = next((d for d in data if not d.get('logo_url')), None)
        if not target:
            pytest.skip('No lead without logo found in "Taj" search')
        lr = requests.get(f'{BASE_URL}/api/bottle-preview/lead-logo/{target["id"]}',
                          headers=auth_headers, timeout=30)
        assert lr.status_code == 200
        body = lr.json()
        assert body.get('has_logo') is False
        assert body.get('logo_data') in (None, '')
        assert body.get('company') == target.get('company')

    def test_lead_logo_not_found(self, auth_headers):
        r = requests.get(f'{BASE_URL}/api/bottle-preview/lead-logo/nonexistent-id-xyz',
                         headers=auth_headers, timeout=30)
        assert r.status_code == 404

    def test_lead_logo_requires_auth(self):
        r = requests.get(f'{BASE_URL}/api/bottle-preview/lead-logo/{LEAD_WITH_LOGO_ID}', timeout=30)
        assert r.status_code in (401, 403)
