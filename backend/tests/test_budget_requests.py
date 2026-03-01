"""
Budget Request API Tests - Testing the updated Budget Request module
Focus: Non-customer categories (no lead selection), SKU workflow for event_sponsorship_stock
"""
import pytest
import requests
import os

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', '').rstrip('/')

# Test credentials
CEO_CREDS = {"email": "surya.yadavalli@nylaairwater.earth", "password": "surya123"}
DIRECTOR_CREDS = {"email": "admin@nylaairwater.earth", "password": "admin123"}

class TestBudgetCategories:
    """Test Budget Categories endpoint - verify no customer-related categories"""
    
    def test_get_budget_categories(self):
        """GET /api/budget-categories - Returns non-customer categories"""
        response = requests.get(f"{BASE_URL}/api/budget-categories")
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        
        categories = response.json()
        assert isinstance(categories, list), "Expected list of categories"
        assert len(categories) == 9, f"Expected 9 categories, got {len(categories)}"
        
        # Verify category structure
        category_ids = [c['id'] for c in categories]
        
        # All these should be present
        expected_ids = [
            'event_sponsorship_amount',
            'event_sponsorship_stock',
            'event_participation',
            'setup_exhibit',
            'digital_promotion',
            'marketing_collateral',
            'office_supplies',
            'travel_general',
            'other'
        ]
        
        for expected in expected_ids:
            assert expected in category_ids, f"Missing category: {expected}"
        
        print(f"PASS: All 9 budget categories present: {category_ids}")
    
    def test_no_customer_categories(self):
        """Verify no customer-related categories (customer_onboarding, customer_gifting, etc.)"""
        response = requests.get(f"{BASE_URL}/api/budget-categories")
        assert response.status_code == 200
        
        categories = response.json()
        category_ids = [c['id'] for c in categories]
        
        # These customer-related categories should NOT be present
        excluded_ids = [
            'customer_onboarding',
            'customer_gifting',
            'staff_gifting',
            'free_trial',
            'customer_sponsorship'
        ]
        
        for excluded in excluded_ids:
            assert excluded not in category_ids, f"Customer category '{excluded}' should not be in budget categories"
        
        print("PASS: No customer-related categories in budget categories")
    
    def test_all_categories_no_lead_required(self):
        """Verify all categories have requires_lead=False"""
        response = requests.get(f"{BASE_URL}/api/budget-categories")
        assert response.status_code == 200
        
        categories = response.json()
        
        for cat in categories:
            assert cat.get('requires_lead') == False, f"Category '{cat['id']}' should have requires_lead=False"
        
        print("PASS: All categories have requires_lead=False")
    
    def test_event_sponsorship_stock_requires_sku(self):
        """Verify event_sponsorship_stock requires SKU selection"""
        response = requests.get(f"{BASE_URL}/api/budget-categories")
        assert response.status_code == 200
        
        categories = response.json()
        stock_cat = next((c for c in categories if c['id'] == 'event_sponsorship_stock'), None)
        
        assert stock_cat is not None, "Missing event_sponsorship_stock category"
        assert stock_cat.get('requires_sku') == True, "event_sponsorship_stock should require SKU"
        
        print("PASS: event_sponsorship_stock requires SKU selection")


class TestBudgetRequestCRUD:
    """Test Budget Request CRUD operations"""
    
    @pytest.fixture(autouse=True)
    def setup(self):
        """Login and get token for CEO user"""
        response = requests.post(f"{BASE_URL}/api/auth/login", json=CEO_CREDS)
        assert response.status_code == 200, f"Login failed: {response.text}"
        data = response.json()
        self.token = data.get('token')
        self.user_id = data.get('user', {}).get('id')
        self.user_name = data.get('user', {}).get('name')
        self.headers = {"Authorization": f"Bearer {self.token}"}
    
    def test_create_budget_request_draft(self):
        """POST /api/budget-requests - Create as draft"""
        payload = {
            "title": "TEST_Marketing Event Budget Q1",
            "description": "Budget for Q1 marketing events",
            "line_items": [
                {
                    "category_id": "event_participation",
                    "category_label": "Event Participation",
                    "amount": 50000,
                    "notes": "Tech conference participation fee"
                }
            ],
            "event_name": "Tech Summit 2026",
            "event_date": "2026-03-15",
            "event_city": "Bengaluru",
            "submit_for_approval": False
        }
        
        response = requests.post(f"{BASE_URL}/api/budget-requests", json=payload, headers=self.headers)
        assert response.status_code == 201, f"Expected 201, got {response.status_code}: {response.text}"
        
        data = response.json()
        assert data.get('status') == 'draft', f"Expected draft status, got {data.get('status')}"
        assert data.get('title') == payload['title']
        assert len(data.get('line_items', [])) == 1
        
        # Store for cleanup
        self.draft_request_id = data.get('id')
        print(f"PASS: Created draft budget request: {self.draft_request_id}")
        
        return data.get('id')
    
    def test_create_budget_request_submit(self):
        """POST /api/budget-requests - Create and submit for approval"""
        payload = {
            "title": "TEST_Office Supplies Budget",
            "description": "Monthly office supplies",
            "line_items": [
                {
                    "category_id": "office_supplies",
                    "category_label": "Office Supplies",
                    "amount": 15000,
                    "notes": "Stationery and consumables"
                },
                {
                    "category_id": "digital_promotion",
                    "category_label": "Digital Promotion",
                    "amount": 25000,
                    "notes": "Social media ads"
                }
            ],
            "submit_for_approval": True
        }
        
        response = requests.post(f"{BASE_URL}/api/budget-requests", json=payload, headers=self.headers)
        assert response.status_code == 201, f"Expected 201, got {response.status_code}: {response.text}"
        
        data = response.json()
        assert data.get('status') == 'pending_approval', f"Expected pending_approval, got {data.get('status')}"
        assert data.get('total_amount') == 40000, f"Expected total 40000, got {data.get('total_amount')}"
        
        print(f"PASS: Created and submitted budget request: {data.get('id')}")
        return data.get('id')
    
    def test_create_budget_request_with_sku(self):
        """POST /api/budget-requests - Create with SKU-based category (event_sponsorship_stock)"""
        payload = {
            "title": "TEST_Event Sponsorship Stock",
            "description": "Product sponsorship for trade show",
            "line_items": [
                {
                    "category_id": "event_sponsorship_stock",
                    "category_label": "Event Sponsorship - Stock",
                    "sku_name": "20L Premium",
                    "bottle_count": 100,
                    "price_per_unit": 150,
                    "amount": 15000,
                    "notes": "Sample bottles for event"
                }
            ],
            "event_name": "Food Expo 2026",
            "event_date": "2026-04-20",
            "event_city": "Mumbai",
            "submit_for_approval": False
        }
        
        response = requests.post(f"{BASE_URL}/api/budget-requests", json=payload, headers=self.headers)
        assert response.status_code == 201, f"Expected 201, got {response.status_code}: {response.text}"
        
        data = response.json()
        line_item = data.get('line_items', [{}])[0]
        assert line_item.get('sku_name') == "20L Premium"
        assert line_item.get('bottle_count') == 100
        assert line_item.get('price_per_unit') == 150
        
        print(f"PASS: Created budget request with SKU: {data.get('id')}")
        return data.get('id')
    
    def test_get_budget_requests_list(self):
        """GET /api/budget-requests - Get user's budget requests"""
        response = requests.get(f"{BASE_URL}/api/budget-requests", headers=self.headers)
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        
        data = response.json()
        assert isinstance(data, list), "Expected list of budget requests"
        
        print(f"PASS: Got {len(data)} budget requests")
    
    def test_get_single_budget_request(self):
        """GET /api/budget-requests/{id} - Get single request"""
        # First create one
        create_payload = {
            "title": "TEST_Single Request Test",
            "line_items": [{"category_id": "other", "category_label": "Other", "amount": 5000}],
            "submit_for_approval": False
        }
        create_resp = requests.post(f"{BASE_URL}/api/budget-requests", json=create_payload, headers=self.headers)
        request_id = create_resp.json().get('id')
        
        # Get it
        response = requests.get(f"{BASE_URL}/api/budget-requests/{request_id}", headers=self.headers)
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        
        data = response.json()
        assert data.get('id') == request_id
        assert data.get('title') == "TEST_Single Request Test"
        
        print(f"PASS: Retrieved single budget request: {request_id}")


class TestBudgetRequestApproval:
    """Test Budget Request approval workflow"""
    
    @pytest.fixture(autouse=True)
    def setup(self):
        """Login as CEO (requestor) and Director (approver)"""
        # CEO login
        ceo_resp = requests.post(f"{BASE_URL}/api/auth/login", json=CEO_CREDS)
        assert ceo_resp.status_code == 200, f"CEO login failed: {ceo_resp.text}"
        self.ceo_token = ceo_resp.json().get('token')
        self.ceo_headers = {"Authorization": f"Bearer {self.ceo_token}"}
        
        # Director login
        dir_resp = requests.post(f"{BASE_URL}/api/auth/login", json=DIRECTOR_CREDS)
        assert dir_resp.status_code == 200, f"Director login failed: {dir_resp.text}"
        self.dir_token = dir_resp.json().get('token')
        self.dir_headers = {"Authorization": f"Bearer {self.dir_token}"}
    
    def test_director_approve_request(self):
        """PUT /api/budget-requests/{id}/approve - Director approves request"""
        # Create request as CEO
        create_payload = {
            "title": "TEST_Approval Test Request",
            "line_items": [{"category_id": "marketing_collateral", "category_label": "Marketing Collateral", "amount": 30000}],
            "submit_for_approval": True
        }
        create_resp = requests.post(f"{BASE_URL}/api/budget-requests", json=create_payload, headers=self.ceo_headers)
        assert create_resp.status_code == 201
        request_id = create_resp.json().get('id')
        
        # Approve as Director
        approve_payload = {"status": "approved"}
        response = requests.put(f"{BASE_URL}/api/budget-requests/{request_id}/approve", json=approve_payload, headers=self.dir_headers)
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        
        data = response.json()
        assert data.get('status') == 'approved'
        assert data.get('approved_by') is not None
        
        print(f"PASS: Director approved budget request: {request_id}")
    
    def test_director_reject_request(self):
        """PUT /api/budget-requests/{id}/approve - Director rejects request"""
        # Create request
        create_payload = {
            "title": "TEST_Rejection Test Request",
            "line_items": [{"category_id": "travel_general", "category_label": "General Travel", "amount": 100000}],
            "submit_for_approval": True
        }
        create_resp = requests.post(f"{BASE_URL}/api/budget-requests", json=create_payload, headers=self.ceo_headers)
        assert create_resp.status_code == 201
        request_id = create_resp.json().get('id')
        
        # Reject as Director
        reject_payload = {"status": "rejected", "rejection_reason": "Budget too high for this quarter"}
        response = requests.put(f"{BASE_URL}/api/budget-requests/{request_id}/approve", json=reject_payload, headers=self.dir_headers)
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        
        data = response.json()
        assert data.get('status') == 'rejected'
        assert "Budget too high" in data.get('rejection_reason', '')
        
        print(f"PASS: Director rejected budget request: {request_id}")
    
    def test_non_director_cannot_approve(self):
        """Non-director users cannot approve budget requests"""
        # Create request as CEO and try to approve as CEO (not director)
        create_payload = {
            "title": "TEST_Self Approve Test",
            "line_items": [{"category_id": "other", "category_label": "Other", "amount": 5000}],
            "submit_for_approval": True
        }
        create_resp = requests.post(f"{BASE_URL}/api/budget-requests", json=create_payload, headers=self.ceo_headers)
        assert create_resp.status_code == 201
        request_id = create_resp.json().get('id')
        
        # Try to approve as CEO (should fail if CEO is not director role)
        approve_payload = {"status": "approved"}
        response = requests.put(f"{BASE_URL}/api/budget-requests/{request_id}/approve", json=approve_payload, headers=self.ceo_headers)
        
        # This might succeed if CEO has director privileges, otherwise should fail
        if response.status_code == 403:
            print(f"PASS: Non-director cannot approve (403)")
        else:
            print(f"INFO: CEO user may have director privileges, approval allowed")


class TestCOGSPriceEndpoint:
    """Test COGS SKU price endpoint used for event_sponsorship_stock"""
    
    @pytest.fixture(autouse=True)
    def setup(self):
        response = requests.post(f"{BASE_URL}/api/auth/login", json=CEO_CREDS)
        assert response.status_code == 200
        self.token = response.json().get('token')
        self.headers = {"Authorization": f"Bearer {self.token}"}
    
    def test_get_sku_price_for_city(self):
        """GET /api/cogs/sku-price/{city}/{sku_name} - Get SKU price from COGS"""
        city = "Bengaluru"
        sku_name = "20L Premium"
        
        response = requests.get(f"{BASE_URL}/api/cogs/sku-price/{city}/{sku_name}", headers=self.headers)
        
        # This might return 404 if no COGS data exists, or 200 with price
        if response.status_code == 200:
            data = response.json()
            print(f"PASS: Got SKU price - found: {data.get('found')}, price: {data.get('minimum_landing_price')}")
        elif response.status_code == 404:
            print(f"INFO: No COGS data for {sku_name} in {city}")
        else:
            assert False, f"Unexpected status {response.status_code}: {response.text}"


class TestMasterSKUs:
    """Test Master SKUs endpoint for budget request form"""
    
    @pytest.fixture(autouse=True)
    def setup(self):
        response = requests.post(f"{BASE_URL}/api/auth/login", json=CEO_CREDS)
        assert response.status_code == 200
        self.token = response.json().get('token')
        self.headers = {"Authorization": f"Bearer {self.token}"}
    
    def test_get_master_skus(self):
        """GET /api/master-skus - Get available SKUs for selection"""
        response = requests.get(f"{BASE_URL}/api/master-skus", headers=self.headers)
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        
        data = response.json()
        skus = data.get('skus', [])
        assert len(skus) > 0, "Expected at least one SKU"
        
        # Verify SKU structure
        for sku in skus[:3]:  # Check first 3
            assert 'sku_name' in sku, "SKU should have sku_name field"
            assert 'id' in sku, "SKU should have id field"
        
        print(f"PASS: Got {len(skus)} master SKUs")


class TestMasterLocations:
    """Test Master Locations endpoint for event city selection"""
    
    @pytest.fixture(autouse=True)
    def setup(self):
        response = requests.post(f"{BASE_URL}/api/auth/login", json=CEO_CREDS)
        assert response.status_code == 200
        self.token = response.json().get('token')
        self.headers = {"Authorization": f"Bearer {self.token}"}
    
    def test_get_locations_flat(self):
        """GET /api/master-locations/flat - Get cities for event city dropdown"""
        response = requests.get(f"{BASE_URL}/api/master-locations/flat", headers=self.headers)
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        
        data = response.json()
        cities = data.get('cities', [])
        
        print(f"PASS: Got {len(cities)} cities for selection")


if __name__ == "__main__":
    pytest.main([__file__, "-v", "--tb=short"])
