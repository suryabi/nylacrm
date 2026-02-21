"""
Test Master SKU API and Lead Proposed SKU Pricing
Tests for:
- GET /api/master-skus - Master SKU list
- PUT /api/leads/{id} - Update lead with proposed_sku_pricing
- Account SKU Pricing persistence
"""

import pytest
import requests
import os

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', '').rstrip('/')

@pytest.fixture(scope="module")
def session():
    """Create authenticated session"""
    s = requests.Session()
    s.headers.update({"Content-Type": "application/json"})
    
    # Login
    response = s.post(f"{BASE_URL}/api/auth/login", json={
        "email": "admin@nylaairwater.earth",
        "password": "admin123"
    })
    
    if response.status_code != 200:
        pytest.skip(f"Login failed: {response.status_code}")
    
    data = response.json()
    token = data.get('session_token')
    if token:
        s.headers.update({"Authorization": f"Bearer {token}"})
    
    return s


class TestMasterSkus:
    """Tests for /api/master-skus endpoint"""
    
    def test_get_master_skus_returns_200(self, session):
        """GET /api/master-skus returns 200"""
        response = session.get(f"{BASE_URL}/api/master-skus")
        assert response.status_code == 200, f"Expected 200, got {response.status_code}"
    
    def test_master_skus_returns_list(self, session):
        """Master SKUs endpoint returns a list of SKUs"""
        response = session.get(f"{BASE_URL}/api/master-skus")
        data = response.json()
        
        assert 'skus' in data, "Response should contain 'skus' key"
        assert isinstance(data['skus'], list), "SKUs should be a list"
        assert len(data['skus']) > 0, "SKU list should not be empty"
    
    def test_master_skus_contains_expected_skus(self, session):
        """Master SKU list contains expected SKUs like 20L Premium, Nyla variants, 24 Brand"""
        response = session.get(f"{BASE_URL}/api/master-skus")
        data = response.json()
        
        sku_names = [s['sku'] for s in data['skus']]
        
        # Check for key SKUs mentioned in requirements
        assert '20L Premium' in sku_names, "Should contain 20L Premium"
        assert '24 Brand' in sku_names, "Should contain 24 Brand"
        
        # Check for Nyla variants
        nyla_skus = [s for s in sku_names if 'Nyla' in s]
        assert len(nyla_skus) >= 6, f"Should have at least 6 Nyla variants, found {len(nyla_skus)}"
    
    def test_master_skus_structure(self, session):
        """Each SKU has required fields: sku, category, unit"""
        response = session.get(f"{BASE_URL}/api/master-skus")
        data = response.json()
        
        for sku in data['skus']:
            assert 'sku' in sku, "SKU should have 'sku' field"
            assert 'category' in sku, "SKU should have 'category' field"
            assert 'unit' in sku, "SKU should have 'unit' field"
    
    def test_master_skus_count(self, session):
        """Master SKU list contains 14 SKUs as expected"""
        response = session.get(f"{BASE_URL}/api/master-skus")
        data = response.json()
        
        assert len(data['skus']) == 14, f"Expected 14 SKUs, got {len(data['skus'])}"


class TestLeadProposedSkuPricing:
    """Tests for Proposed SKU Pricing on Leads"""
    
    @pytest.fixture
    def test_lead(self, session):
        """Create a test lead and return its ID"""
        lead_data = {
            "company": "TEST_SKU_Pricing_Lead",
            "city": "Hyderabad",
            "state": "Telangana",
            "region": "South India",
            "status": "new"
        }
        response = session.post(f"{BASE_URL}/api/leads", json=lead_data)
        assert response.status_code == 200, f"Failed to create test lead: {response.text}"
        lead = response.json()
        yield lead
        
        # Cleanup
        session.delete(f"{BASE_URL}/api/leads/{lead['id']}")
    
    def test_update_lead_with_proposed_sku_pricing(self, session, test_lead):
        """Lead can be updated with proposed_sku_pricing"""
        pricing_data = {
            "proposed_sku_pricing": [
                {"sku": "20L Premium", "price_per_unit": 150, "return_bottle_credit": 50}
            ]
        }
        
        response = session.put(f"{BASE_URL}/api/leads/{test_lead['id']}", json=pricing_data)
        assert response.status_code == 200, f"Update failed: {response.text}"
        
        # Verify the update
        updated = response.json()
        assert 'proposed_sku_pricing' in updated, "Response should contain proposed_sku_pricing"
        assert len(updated['proposed_sku_pricing']) == 1
    
    def test_proposed_sku_pricing_persists(self, session, test_lead):
        """Proposed SKU pricing persists after update"""
        pricing_data = {
            "proposed_sku_pricing": [
                {"sku": "20L Premium", "price_per_unit": 160, "return_bottle_credit": 55},
                {"sku": "Nyla – 600 ml / Silver", "price_per_unit": 80, "return_bottle_credit": 0}
            ]
        }
        
        # Update
        response = session.put(f"{BASE_URL}/api/leads/{test_lead['id']}", json=pricing_data)
        assert response.status_code == 200
        
        # GET to verify persistence
        get_response = session.get(f"{BASE_URL}/api/leads/{test_lead['id']}")
        assert get_response.status_code == 200
        
        lead = get_response.json()
        assert len(lead['proposed_sku_pricing']) == 2, "Should have 2 SKU pricing entries"
        
        # Verify specific values
        skus = {p['sku']: p for p in lead['proposed_sku_pricing']}
        assert skus['20L Premium']['price_per_unit'] == 160
        assert skus['20L Premium']['return_bottle_credit'] == 55
    
    def test_clear_proposed_sku_pricing(self, session, test_lead):
        """Can clear proposed SKU pricing by setting empty array"""
        # First add some pricing
        session.put(f"{BASE_URL}/api/leads/{test_lead['id']}", json={
            "proposed_sku_pricing": [{"sku": "20L Premium", "price_per_unit": 100, "return_bottle_credit": 30}]
        })
        
        # Now clear it
        response = session.put(f"{BASE_URL}/api/leads/{test_lead['id']}", json={
            "proposed_sku_pricing": []
        })
        assert response.status_code == 200
        
        # Verify it's cleared
        get_response = session.get(f"{BASE_URL}/api/leads/{test_lead['id']}")
        lead = get_response.json()
        assert lead['proposed_sku_pricing'] == [], "Proposed SKU pricing should be empty"


class TestAccountSkuPricing:
    """Tests for SKU Pricing on Accounts"""
    
    def test_get_existing_account_with_sku_pricing(self, session):
        """Can retrieve accounts and check for sku_pricing field"""
        response = session.get(f"{BASE_URL}/api/accounts?page=1&page_size=5")
        
        if response.status_code == 200:
            data = response.json()
            if data.get('data') and len(data['data']) > 0:
                account = data['data'][0]
                # sku_pricing should exist as a field (can be empty list)
                assert 'sku_pricing' in account, "Account should have sku_pricing field"
    
    def test_update_account_with_sku_pricing(self, session):
        """Account SKU pricing can be updated"""
        # First get an account
        response = session.get(f"{BASE_URL}/api/accounts?page=1&page_size=1")
        
        if response.status_code != 200 or not response.json().get('data'):
            pytest.skip("No accounts available for testing")
        
        account = response.json()['data'][0]
        account_id = account['id']
        
        # Update with SKU pricing
        sku_pricing = [
            {"sku": "20L Premium", "price_per_unit": 140, "return_bottle_credit": 45}
        ]
        
        update_response = session.put(f"{BASE_URL}/api/accounts/{account_id}", json={
            "sku_pricing": sku_pricing
        })
        
        assert update_response.status_code == 200, f"Failed to update: {update_response.text}"
        
        # Verify persistence
        get_response = session.get(f"{BASE_URL}/api/accounts/{account_id}")
        assert get_response.status_code == 200
        
        updated_account = get_response.json()
        assert len(updated_account['sku_pricing']) >= 1, "Should have at least 1 SKU pricing"


if __name__ == "__main__":
    pytest.main([__file__, "-v", "--tb=short"])
