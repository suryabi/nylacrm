"""
Test Company Documents Page - /company-documents
Tests the expense policy API endpoint that provides role-specific limits for the Travel Policy tab.

Features tested:
- GET /api/expense-master/policy returns role-specific limits
- CEO gets 5x multiplier on limits
- Partner - Sales gets 1.2x multiplier on limits
- Policy data structure includes categories, expense types, limits
"""

import pytest
import requests
import os

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', '').rstrip('/')

# Test credentials
CEO_CREDS = {"email": "surya.yadavalli@nylaairwater.earth", "password": "surya123"}
PARTNER_CREDS = {"email": "priya.sales@nylaairwater.earth", "password": "priya123"}


@pytest.fixture(scope="module")
def ceo_session():
    """Create authenticated session as CEO"""
    session = requests.Session()
    response = session.post(f"{BASE_URL}/api/auth/login", json=CEO_CREDS)
    if response.status_code != 200:
        pytest.skip(f"CEO login failed: {response.text}")
    return session


@pytest.fixture(scope="module")
def partner_session():
    """Create authenticated session as Partner - Sales"""
    session = requests.Session()
    response = session.post(f"{BASE_URL}/api/auth/login", json=PARTNER_CREDS)
    if response.status_code != 200:
        pytest.skip(f"Partner login failed: {response.text}")
    return session


class TestExpensePolicyAPI:
    """Tests for GET /api/expense-master/policy endpoint"""
    
    def test_policy_endpoint_requires_auth(self):
        """Policy endpoint should require authentication"""
        session = requests.Session()
        response = session.get(f"{BASE_URL}/api/expense-master/policy")
        assert response.status_code == 401, f"Expected 401, got {response.status_code}"
    
    def test_policy_returns_categories(self, ceo_session):
        """Policy endpoint should return expense categories"""
        response = ceo_session.get(f"{BASE_URL}/api/expense-master/policy?role=CEO")
        assert response.status_code == 200
        data = response.json()
        assert isinstance(data, list), "Response should be a list of categories"
        assert len(data) > 0, "Should have at least one category"
    
    def test_policy_returns_travel_category(self, ceo_session):
        """Policy should include Travel category"""
        response = ceo_session.get(f"{BASE_URL}/api/expense-master/policy?role=CEO")
        assert response.status_code == 200
        data = response.json()
        travel_cat = next((c for c in data if c['name'] == 'Travel'), None)
        assert travel_cat is not None, "Travel category should exist"
        assert 'expense_types' in travel_cat, "Should have expense_types"
        assert len(travel_cat['expense_types']) > 0, "Should have expense types"
    
    def test_policy_returns_accommodation_category(self, ceo_session):
        """Policy should include Accommodation category"""
        response = ceo_session.get(f"{BASE_URL}/api/expense-master/policy?role=CEO")
        assert response.status_code == 200
        data = response.json()
        cat = next((c for c in data if c['name'] == 'Accommodation'), None)
        assert cat is not None, "Accommodation category should exist"
    
    def test_policy_returns_meals_category(self, ceo_session):
        """Policy should include Meals & Entertainment category"""
        response = ceo_session.get(f"{BASE_URL}/api/expense-master/policy?role=CEO")
        assert response.status_code == 200
        data = response.json()
        cat = next((c for c in data if c['name'] == 'Meals & Entertainment'), None)
        assert cat is not None, "Meals & Entertainment category should exist"
    
    def test_expense_type_structure(self, ceo_session):
        """Expense types should have required fields"""
        response = ceo_session.get(f"{BASE_URL}/api/expense-master/policy?role=CEO")
        assert response.status_code == 200
        data = response.json()
        travel_cat = next((c for c in data if c['name'] == 'Travel'), None)
        assert travel_cat is not None
        
        expense_type = travel_cat['expense_types'][0]
        assert 'id' in expense_type, "Should have id"
        assert 'name' in expense_type, "Should have name"
        assert 'default_limit' in expense_type, "Should have default_limit"
        assert 'role_limit' in expense_type, "Should have role_limit"
        assert 'requires_receipt' in expense_type, "Should have requires_receipt"
        assert 'is_allowed_for_role' in expense_type, "Should have is_allowed_for_role"
    
    def test_category_has_policy_guidelines(self, ceo_session):
        """Categories should have policy guidelines"""
        response = ceo_session.get(f"{BASE_URL}/api/expense-master/policy?role=CEO")
        assert response.status_code == 200
        data = response.json()
        travel_cat = next((c for c in data if c['name'] == 'Travel'), None)
        assert travel_cat is not None
        assert 'policy_guidelines' in travel_cat, "Should have policy_guidelines"
        assert travel_cat['policy_guidelines'] is not None, "Policy guidelines should not be None"


class TestRoleBasedLimits:
    """Tests verifying role-based limit multipliers work correctly"""
    
    def test_ceo_gets_5x_multiplier(self, ceo_session):
        """CEO should get 5x multiplier on limits"""
        response = ceo_session.get(f"{BASE_URL}/api/expense-master/policy?role=CEO")
        assert response.status_code == 200
        data = response.json()
        
        travel_cat = next((c for c in data if c['name'] == 'Travel'), None)
        assert travel_cat is not None
        
        # Find Domestic Flight
        domestic_flight = next((e for e in travel_cat['expense_types'] if e['name'] == 'Domestic Flight'), None)
        assert domestic_flight is not None, "Domestic Flight expense type should exist"
        
        # Default limit is 15000, CEO should get 5x = 75000
        default = domestic_flight.get('default_limit', 0)
        role_limit = domestic_flight.get('role_limit', 0)
        
        assert default == 15000, f"Default limit should be 15000, got {default}"
        assert role_limit == 75000.0, f"CEO role limit should be 75000 (5x), got {role_limit}"
    
    def test_partner_sales_gets_1_2x_multiplier(self, ceo_session):
        """Partner - Sales should get 1.2x multiplier on limits"""
        response = ceo_session.get(f"{BASE_URL}/api/expense-master/policy?role=Partner%20-%20Sales")
        assert response.status_code == 200
        data = response.json()
        
        travel_cat = next((c for c in data if c['name'] == 'Travel'), None)
        assert travel_cat is not None
        
        # Find Domestic Flight
        domestic_flight = next((e for e in travel_cat['expense_types'] if e['name'] == 'Domestic Flight'), None)
        assert domestic_flight is not None
        
        # Default limit is 15000, Partner - Sales should get 1.2x = 18000
        default = domestic_flight.get('default_limit', 0)
        role_limit = domestic_flight.get('role_limit', 0)
        
        assert default == 15000, f"Default limit should be 15000, got {default}"
        assert role_limit == 18000.0, f"Partner - Sales role limit should be 18000 (1.2x), got {role_limit}"
    
    def test_ceo_vs_partner_different_limits(self, ceo_session):
        """CEO and Partner - Sales should have different limits"""
        # Get CEO limits
        ceo_response = ceo_session.get(f"{BASE_URL}/api/expense-master/policy?role=CEO")
        assert ceo_response.status_code == 200
        ceo_data = ceo_response.json()
        
        # Get Partner limits
        partner_response = ceo_session.get(f"{BASE_URL}/api/expense-master/policy?role=Partner%20-%20Sales")
        assert partner_response.status_code == 200
        partner_data = partner_response.json()
        
        # Compare Travel - Domestic Flight limits
        ceo_travel = next((c for c in ceo_data if c['name'] == 'Travel'), None)
        partner_travel = next((c for c in partner_data if c['name'] == 'Travel'), None)
        
        ceo_flight = next((e for e in ceo_travel['expense_types'] if e['name'] == 'Domestic Flight'), None)
        partner_flight = next((e for e in partner_travel['expense_types'] if e['name'] == 'Domestic Flight'), None)
        
        ceo_limit = ceo_flight.get('role_limit', 0)
        partner_limit = partner_flight.get('role_limit', 0)
        
        assert ceo_limit > partner_limit, f"CEO limit ({ceo_limit}) should be higher than Partner limit ({partner_limit})"
        # CEO gets 5x, Partner gets 1.2x, so CEO should be about 4x Partner
        ratio = ceo_limit / partner_limit
        assert 4.0 < ratio < 4.5, f"CEO/Partner ratio should be ~4.17 (5/1.2), got {ratio}"
    
    def test_international_flight_limits(self, ceo_session):
        """International Flight should have higher limits"""
        response = ceo_session.get(f"{BASE_URL}/api/expense-master/policy?role=CEO")
        assert response.status_code == 200
        data = response.json()
        
        travel_cat = next((c for c in data if c['name'] == 'Travel'), None)
        intl_flight = next((e for e in travel_cat['expense_types'] if e['name'] == 'International Flight'), None)
        
        assert intl_flight is not None, "International Flight should exist"
        assert intl_flight['default_limit'] == 100000, "International Flight default should be 100000"
        assert intl_flight['role_limit'] == 500000.0, "CEO International Flight should be 500000 (5x)"


class TestTravelPolicyStructure:
    """Tests for Travel Policy data structure required by frontend"""
    
    def test_travel_category_has_icon(self, ceo_session):
        """Travel category should have icon for display"""
        response = ceo_session.get(f"{BASE_URL}/api/expense-master/policy?role=CEO")
        assert response.status_code == 200
        data = response.json()
        
        travel_cat = next((c for c in data if c['name'] == 'Travel'), None)
        assert 'icon' in travel_cat, "Should have icon"
        assert travel_cat['icon'] == 'plane', f"Travel icon should be 'plane', got {travel_cat['icon']}"
    
    def test_travel_category_has_color(self, ceo_session):
        """Travel category should have color for UI"""
        response = ceo_session.get(f"{BASE_URL}/api/expense-master/policy?role=CEO")
        assert response.status_code == 200
        data = response.json()
        
        travel_cat = next((c for c in data if c['name'] == 'Travel'), None)
        assert 'color' in travel_cat, "Should have color"
        assert travel_cat['color'] is not None, "Color should not be None"
    
    def test_expense_types_have_receipt_requirement(self, ceo_session):
        """Expense types should indicate receipt requirement"""
        response = ceo_session.get(f"{BASE_URL}/api/expense-master/policy?role=CEO")
        assert response.status_code == 200
        data = response.json()
        
        travel_cat = next((c for c in data if c['name'] == 'Travel'), None)
        for exp_type in travel_cat['expense_types']:
            assert 'requires_receipt' in exp_type, f"{exp_type['name']} should have requires_receipt"
            assert isinstance(exp_type['requires_receipt'], bool)
    
    def test_expense_types_have_justification_requirement(self, ceo_session):
        """Expense types should indicate justification requirement"""
        response = ceo_session.get(f"{BASE_URL}/api/expense-master/policy?role=CEO")
        assert response.status_code == 200
        data = response.json()
        
        travel_cat = next((c for c in data if c['name'] == 'Travel'), None)
        for exp_type in travel_cat['expense_types']:
            assert 'requires_justification' in exp_type, f"{exp_type['name']} should have requires_justification"


class TestAllTravelExpenseTypes:
    """Tests to verify all expected travel expense types exist"""
    
    def test_all_travel_expense_types_exist(self, ceo_session):
        """All expected travel expense types should exist"""
        response = ceo_session.get(f"{BASE_URL}/api/expense-master/policy?role=CEO")
        assert response.status_code == 200
        data = response.json()
        
        travel_cat = next((c for c in data if c['name'] == 'Travel'), None)
        expense_names = [e['name'] for e in travel_cat['expense_types']]
        
        expected_types = [
            'Domestic Flight',
            'International Flight',
            'Train Travel',
            'Bus Travel',
            'Taxi/Cab',
            'Car Rental',
            'Fuel/Mileage',
            'Parking & Tolls'
        ]
        
        for expected in expected_types:
            assert expected in expense_names, f"{expected} should exist in Travel expense types"
    
    def test_accommodation_expense_types_exist(self, ceo_session):
        """Accommodation expense types should exist"""
        response = ceo_session.get(f"{BASE_URL}/api/expense-master/policy?role=CEO")
        assert response.status_code == 200
        data = response.json()
        
        acc_cat = next((c for c in data if c['name'] == 'Accommodation'), None)
        expense_names = [e['name'] for e in acc_cat['expense_types']]
        
        expected_types = [
            'Hotel - Metro Cities',
            'Hotel - Tier 2 Cities',
            'Hotel - Other Cities',
            'Service Apartment'
        ]
        
        for expected in expected_types:
            assert expected in expense_names, f"{expected} should exist in Accommodation types"
    
    def test_meals_expense_types_exist(self, ceo_session):
        """Meals & Entertainment expense types should exist"""
        response = ceo_session.get(f"{BASE_URL}/api/expense-master/policy?role=CEO")
        assert response.status_code == 200
        data = response.json()
        
        meals_cat = next((c for c in data if c['name'] == 'Meals & Entertainment'), None)
        expense_names = [e['name'] for e in meals_cat['expense_types']]
        
        expected_types = ['Daily Meals', 'Client Entertainment', 'Team Meals']
        
        for expected in expected_types:
            assert expected in expense_names, f"{expected} should exist in Meals & Entertainment types"


if __name__ == "__main__":
    pytest.main([__file__, "-v"])
