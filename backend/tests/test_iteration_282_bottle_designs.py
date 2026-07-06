"""Backend tests for lead bottle-designs endpoints (Approve & Save to Lead)."""
import os
import base64
import pytest
import requests

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', 'https://crm-beverage-ops.preview.emergentagent.com').rstrip('/')
LEAD_ID = '2c609055-1413-4311-be67-6b0ef1b564e8'  # Test Multi Brand Co

# 1x1 transparent PNG data URLs (both variants)
TINY_PNG_B64 = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII='
DATA_URL = f'data:image/png;base64,{TINY_PNG_B64}'


@pytest.fixture(scope='module')
def auth_token():
    r = requests.post(f"{BASE_URL}/api/auth/login", json={
        "email": "surya.yadavalli@nylaairwater.earth",
        "password": "test123",
    }, timeout=30)
    assert r.status_code == 200, f"Login failed: {r.status_code} {r.text[:200]}"
    data = r.json()
    token = data.get('session_token') or data.get('token') or data.get('access_token')
    assert token, f"No token in response: {list(data.keys())}"
    return token


@pytest.fixture(scope='module')
def hdrs(auth_token):
    return {"Authorization": f"Bearer {auth_token}"}


@pytest.fixture(scope='module', autouse=True)
def cleanup(hdrs):
    """Ensure lead starts and ends with 0 designs."""
    # pre-clean
    r = requests.get(f"{BASE_URL}/api/leads/{LEAD_ID}/bottle-designs", headers=hdrs, timeout=15)
    if r.status_code == 200:
        for d in r.json().get('designs', []) or []:
            requests.delete(f"{BASE_URL}/api/leads/{LEAD_ID}/bottle-designs/{d['id']}", headers=hdrs, timeout=15)
    yield
    # post-clean
    r = requests.get(f"{BASE_URL}/api/leads/{LEAD_ID}/bottle-designs", headers=hdrs, timeout=15)
    if r.status_code == 200:
        for d in r.json().get('designs', []) or []:
            requests.delete(f"{BASE_URL}/api/leads/{LEAD_ID}/bottle-designs/{d['id']}", headers=hdrs, timeout=15)


class TestBottleDesigns:
    """CRUD + replace-in-place for lead bottle-designs."""

    def test_list_initially_empty(self, hdrs):
        r = requests.get(f"{BASE_URL}/api/leads/{LEAD_ID}/bottle-designs", headers=hdrs, timeout=15)
        assert r.status_code == 200
        data = r.json()
        assert 'designs' in data
        assert isinstance(data['designs'], list)
        assert len(data['designs']) == 0
        assert data.get('company')  # company populated

    def test_list_requires_auth(self):
        r = requests.get(f"{BASE_URL}/api/leads/{LEAD_ID}/bottle-designs", timeout=15)
        assert r.status_code in (401, 403)

    def test_list_lead_not_found(self, hdrs):
        r = requests.get(f"{BASE_URL}/api/leads/does-not-exist-xyz/bottle-designs", headers=hdrs, timeout=15)
        assert r.status_code == 404

    def test_add_first_design(self, hdrs):
        payload = {
            "image_data": DATA_URL,
            "clean_data": DATA_URL,
            "customer_name": "TEST_MultiBrand",
            "bottle_template": "air-water-duo",
            "bottle_template_name": "Air Water Duo",
            "logo_size_mm": 35,
            "price": 2.5,
        }
        r = requests.post(f"{BASE_URL}/api/leads/{LEAD_ID}/bottle-designs", json=payload, headers=hdrs, timeout=30)
        assert r.status_code == 200, r.text[:300]
        data = r.json()
        assert data['message'] == 'Design saved'
        assert data['count'] == 1
        design = data['design']
        assert design['id']
        assert design['image_url'].endswith('.png')
        assert design['clean_url'] and design['clean_url'].endswith('_clean.png')
        assert design['customer_name'] == 'TEST_MultiBrand'
        assert design['logo_size_mm'] == 35
        assert design['created_by']

        # Verify PNG is served
        img = requests.get(f"{BASE_URL}{design['image_url']}", timeout=15)
        assert img.status_code == 200
        assert img.headers.get('content-type', '').startswith('image/')

        # Persistence via GET
        g = requests.get(f"{BASE_URL}/api/leads/{LEAD_ID}/bottle-designs", headers=hdrs, timeout=15)
        assert g.status_code == 200
        designs = g.json()['designs']
        assert len(designs) == 1
        assert designs[0]['id'] == design['id']

    def test_add_second_design(self, hdrs):
        payload = {
            "image_data": DATA_URL,
            "clean_data": DATA_URL,
            "customer_name": "TEST_MultiBrand_2",
            "logo_size_mm": 40,
        }
        r = requests.post(f"{BASE_URL}/api/leads/{LEAD_ID}/bottle-designs", json=payload, headers=hdrs, timeout=30)
        assert r.status_code == 200
        data = r.json()
        assert data['count'] == 2
        assert data['message'] == 'Design saved'

    def test_replace_in_place(self, hdrs):
        # Get an existing design id
        g = requests.get(f"{BASE_URL}/api/leads/{LEAD_ID}/bottle-designs", headers=hdrs, timeout=15)
        designs = g.json()['designs']
        assert len(designs) >= 1
        target_id = designs[-1]['id']  # replace last one
        before_count = len(designs)

        payload = {
            "image_data": DATA_URL,
            "clean_data": DATA_URL,
            "customer_name": "TEST_Replaced",
            "logo_size_mm": 45,
            "replace_design_id": target_id,
        }
        r = requests.post(f"{BASE_URL}/api/leads/{LEAD_ID}/bottle-designs", json=payload, headers=hdrs, timeout=30)
        assert r.status_code == 200
        data = r.json()
        assert data['message'] == 'Design replaced'
        assert data['count'] == before_count  # replace-in-place, not add
        assert data['design']['id'] == target_id
        assert data['design']['customer_name'] == 'TEST_Replaced'
        assert data['design']['logo_size_mm'] == 45

    def test_delete_design(self, hdrs):
        g = requests.get(f"{BASE_URL}/api/leads/{LEAD_ID}/bottle-designs", headers=hdrs, timeout=15)
        designs = g.json()['designs']
        assert len(designs) >= 1
        target_id = designs[0]['id']
        before = len(designs)

        r = requests.delete(f"{BASE_URL}/api/leads/{LEAD_ID}/bottle-designs/{target_id}", headers=hdrs, timeout=15)
        assert r.status_code == 200
        assert r.json()['count'] == before - 1

        # Verify gone
        g2 = requests.get(f"{BASE_URL}/api/leads/{LEAD_ID}/bottle-designs", headers=hdrs, timeout=15)
        remaining_ids = [d['id'] for d in g2.json()['designs']]
        assert target_id not in remaining_ids

    def test_delete_nonexistent_design(self, hdrs):
        r = requests.delete(f"{BASE_URL}/api/leads/{LEAD_ID}/bottle-designs/nonexistent-design-id", headers=hdrs, timeout=15)
        assert r.status_code == 404

    def test_add_invalid_image_data(self, hdrs):
        payload = {"image_data": "not-a-valid-data-url-@@@"}
        r = requests.post(f"{BASE_URL}/api/leads/{LEAD_ID}/bottle-designs", json=payload, headers=hdrs, timeout=15)
        assert r.status_code == 400
