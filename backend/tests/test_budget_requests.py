"""
Budget Request API Tests
Testing: Budget categories, CRUD operations, approval workflow, SKU price lookup
"""
import pytest
import requests
import os
import time

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', '').rstrip('/')

# Test credentials
CEO_CREDENTIALS = {"email": "surya.yadavalli@nylaairwater.earth", "password": "surya123"}
DIRECTOR_CREDENTIALS = {"email": "admin@nylaairwater.earth", "password": "admin123"}


@pytest.fixture(scope="module")
def ceo_token():
    """Get CEO auth token"""
    response = requests.post(f"{BASE_URL}/api/auth/login", json=CEO_CREDENTIALS)
    if response.status_code == 200:
        return response.json().get('session_token')
    pytest.skip("CEO login failed")


@pytest.fixture(scope="module")
def director_token():
    """Get Director auth token"""
    response = requests.post(f"{BASE_URL}/api/auth/login", json=DIRECTOR_CREDENTIALS)
    if response.status_code == 200:
        return response.json().get('session_token')
    pytest.skip("Director login failed")


@pytest.fixture(scope="module")
def api_client():
    """Shared requests session"""
    session = requests.Session()
    session.headers.update({"Content-Type": "application/json"})
    return session


class TestBudgetCategories:
    """Test budget categories endpoint"""
    
    def test_get_budget_categories(self, api_client, director_token):
        """Get list of all 9 budget categories"""
        response = api_client.get(
            f"{BASE_URL}/api/budget-categories",
            headers={"Authorization": f"Bearer {director_token}"}
        )
        
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        
        categories = response.json()
        assert isinstance(categories, list), "Expected list of categories"
        assert len(categories) == 9, f"Expected 9 categories, got {len(categories)}"
        
        # Verify all expected categories are present
        expected_ids = [
            'customer_onboarding', 'event_sponsorship_amount', 'event_sponsorship_stock',
            'event_participation', 'setup_exhibit', 'customer_gifting',
            'customer_entertainment', 'customer_free_trials', 'digital_promotion'
        ]
        
        actual_ids = [cat['id'] for cat in categories]
        for expected_id in expected_ids:
            assert expected_id in actual_ids, f"Missing category: {expected_id}"
        
        # Verify customer-related categories require lead
        customer_categories = ['customer_onboarding', 'customer_gifting', 'customer_entertainment', 'customer_free_trials']
        for cat in categories:
            if cat['id'] in customer_categories:
                assert cat['requires_lead'] == True, f"{cat['id']} should require_lead"
        
        # Verify SKU-required categories
        sku_categories = ['event_sponsorship_stock', 'customer_free_trials']
        for cat in categories:
            if cat['id'] in sku_categories:
                assert cat['requires_sku'] == True, f"{cat['id']} should require_sku"
        
        print(f"✓ All 9 budget categories verified with correct flags")


class TestBudgetRequestCRUD:
    """Test budget request create, read, update operations"""
    
    def test_create_budget_request_as_draft(self, api_client, ceo_token):
        """Create budget request and save as draft"""
        payload = {
            "title": "TEST_Q1 Marketing Budget",
            "description": "Test budget request for Q1 marketing activities",
            "event_name": "Test Event",
            "event_date": "2026-03-15",
            "event_city": "Mumbai",
            "line_items": [
                {
                    "category_id": "event_participation",
                    "category_label": "Event Participation",
                    "amount": 50000,
                    "notes": "Registration and booth fees"
                }
            ],
            "submit_for_approval": False
        }
        
        response = api_client.post(
            f"{BASE_URL}/api/budget-requests",
            json=payload,
            headers={"Authorization": f"Bearer {ceo_token}"}
        )
        
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        
        data = response.json()
        assert data['title'] == payload['title']
        assert data['status'] == 'draft', "Draft request should have draft status"
        assert data['total_amount'] == 50000
        assert len(data['line_items']) == 1
        assert 'id' in data
        
        # Save request ID for cleanup
        TestBudgetRequestCRUD.created_draft_id = data['id']
        print(f"✓ Created draft budget request: {data['id']}")
    
    def test_create_budget_request_with_multiple_items(self, api_client, ceo_token):
        """Create budget request with multiple line items including customer-related"""
        payload = {
            "title": "TEST_Customer Onboarding Budget",
            "description": "Budget for customer onboarding activities",
            "line_items": [
                {
                    "category_id": "customer_onboarding",
                    "category_label": "Customer On-boarding",
                    "lead_name": "Test Lead Company",
                    "lead_city": "Mumbai",
                    "amount": 25000,
                    "notes": "Initial setup costs"
                },
                {
                    "category_id": "digital_promotion",
                    "category_label": "Digital Promotion",
                    "amount": 15000,
                    "notes": "Social media ads"
                }
            ],
            "submit_for_approval": False
        }
        
        response = api_client.post(
            f"{BASE_URL}/api/budget-requests",
            json=payload,
            headers={"Authorization": f"Bearer {ceo_token}"}
        )
        
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        
        data = response.json()
        assert len(data['line_items']) == 2, "Should have 2 line items"
        assert data['total_amount'] == 40000, f"Total should be 40000, got {data['total_amount']}"
        
        TestBudgetRequestCRUD.created_multi_item_id = data['id']
        print(f"✓ Created budget request with multiple items: {data['id']}")
    
    def test_create_budget_request_with_sku(self, api_client, ceo_token):
        """Create budget request with SKU-based category (stock sponsorship)"""
        payload = {
            "title": "TEST_Event Sponsorship Stock",
            "description": "Stock sponsorship for trade show",
            "event_name": "Trade Show 2026",
            "event_date": "2026-04-20",
            "event_city": "Delhi",
            "line_items": [
                {
                    "category_id": "event_sponsorship_stock",
                    "category_label": "Event Sponsorship - Stock",
                    "sku_name": "20L Premium",
                    "bottle_count": 100,
                    "price_per_unit": 200,
                    "amount": 20000,  # 100 * 200
                    "notes": "Premium water for VIP guests"
                }
            ],
            "submit_for_approval": False
        }
        
        response = api_client.post(
            f"{BASE_URL}/api/budget-requests",
            json=payload,
            headers={"Authorization": f"Bearer {ceo_token}"}
        )
        
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        
        data = response.json()
        assert data['line_items'][0]['sku_name'] == "20L Premium"
        assert data['line_items'][0]['bottle_count'] == 100
        assert data['total_amount'] == 20000
        
        TestBudgetRequestCRUD.created_sku_id = data['id']
        print(f"✓ Created budget request with SKU: {data['id']}")
    
    def test_get_budget_requests(self, api_client, ceo_token):
        """Get list of budget requests for current user"""
        response = api_client.get(
            f"{BASE_URL}/api/budget-requests",
            headers={"Authorization": f"Bearer {ceo_token}"}
        )
        
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        
        data = response.json()
        assert isinstance(data, list), "Expected list of requests"
        
        # Should contain our test requests
        test_requests = [r for r in data if r.get('title', '').startswith('TEST_')]
        assert len(test_requests) >= 1, "Should have at least one test request"
        
        print(f"✓ Retrieved {len(data)} budget requests, {len(test_requests)} test requests")
    
    def test_get_single_budget_request(self, api_client, ceo_token):
        """Get single budget request by ID"""
        request_id = getattr(TestBudgetRequestCRUD, 'created_draft_id', None)
        if not request_id:
            pytest.skip("No draft request created")
        
        response = api_client.get(
            f"{BASE_URL}/api/budget-requests/{request_id}",
            headers={"Authorization": f"Bearer {ceo_token}"}
        )
        
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        
        data = response.json()
        assert data['id'] == request_id
        assert data['title'] == "TEST_Q1 Marketing Budget"
        
        print(f"✓ Retrieved single budget request: {request_id}")


class TestBudgetApprovalWorkflow:
    """Test budget request approval workflow - Director only"""
    
    def test_submit_for_approval(self, api_client, ceo_token):
        """Submit budget request for approval (creates action item for Director)"""
        payload = {
            "title": "TEST_Approval Workflow Request",
            "description": "Request to test approval workflow",
            "line_items": [
                {
                    "category_id": "setup_exhibit",
                    "category_label": "Set up Exhibit",
                    "amount": 75000,
                    "notes": "Exhibition booth setup"
                }
            ],
            "submit_for_approval": True  # This triggers approval workflow
        }
        
        response = api_client.post(
            f"{BASE_URL}/api/budget-requests",
            json=payload,
            headers={"Authorization": f"Bearer {ceo_token}"}
        )
        
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        
        data = response.json()
        assert data['status'] == 'pending_approval', f"Expected pending_approval, got {data['status']}"
        
        TestBudgetApprovalWorkflow.pending_request_id = data['id']
        print(f"✓ Submitted budget request for approval: {data['id']}")
    
    def test_director_sees_pending_approvals(self, api_client, director_token):
        """Director should see pending approval requests"""
        response = api_client.get(
            f"{BASE_URL}/api/budget-requests",
            headers={"Authorization": f"Bearer {director_token}"}
        )
        
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        
        data = response.json()
        pending = [r for r in data if r['status'] == 'pending_approval']
        
        print(f"✓ Director can see {len(pending)} pending budget requests")
    
    def test_director_approve_request(self, api_client, director_token):
        """Director approves budget request"""
        request_id = getattr(TestBudgetApprovalWorkflow, 'pending_request_id', None)
        if not request_id:
            pytest.skip("No pending request to approve")
        
        response = api_client.put(
            f"{BASE_URL}/api/budget-requests/{request_id}/approve",
            json={"status": "approved"},
            headers={"Authorization": f"Bearer {director_token}"}
        )
        
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        
        # Verify the request is now approved
        get_response = api_client.get(
            f"{BASE_URL}/api/budget-requests/{request_id}",
            headers={"Authorization": f"Bearer {director_token}"}
        )
        
        assert get_response.status_code == 200
        data = get_response.json()
        assert data['status'] == 'approved'
        assert data['approved_by'] is not None
        
        print(f"✓ Director approved budget request: {request_id}")
    
    def test_director_reject_request(self, api_client, ceo_token, director_token):
        """Director rejects budget request with reason"""
        # First create a new request to reject
        payload = {
            "title": "TEST_Request to Reject",
            "description": "This request will be rejected",
            "line_items": [
                {
                    "category_id": "digital_promotion",
                    "category_label": "Digital Promotion",
                    "amount": 100000,
                    "notes": "Too expensive campaign"
                }
            ],
            "submit_for_approval": True
        }
        
        create_response = api_client.post(
            f"{BASE_URL}/api/budget-requests",
            json=payload,
            headers={"Authorization": f"Bearer {ceo_token}"}
        )
        
        assert create_response.status_code == 200
        request_id = create_response.json()['id']
        
        # Director rejects
        response = api_client.put(
            f"{BASE_URL}/api/budget-requests/{request_id}/approve",
            json={
                "status": "rejected",
                "rejection_reason": "Budget exceeds quarterly allocation"
            },
            headers={"Authorization": f"Bearer {director_token}"}
        )
        
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        
        # Verify rejection reason is stored
        get_response = api_client.get(
            f"{BASE_URL}/api/budget-requests/{request_id}",
            headers={"Authorization": f"Bearer {director_token}"}
        )
        
        data = get_response.json()
        assert data['status'] == 'rejected'
        assert data['rejection_reason'] == "Budget exceeds quarterly allocation"
        
        print(f"✓ Director rejected budget request with reason: {request_id}")
    
    def test_non_director_cannot_approve(self, api_client, ceo_token):
        """Non-Director users cannot approve budget requests"""
        # First create a pending request
        payload = {
            "title": "TEST_CEO Cannot Approve",
            "description": "Testing that CEO cannot approve",
            "line_items": [
                {
                    "category_id": "event_participation",
                    "category_label": "Event Participation",
                    "amount": 30000
                }
            ],
            "submit_for_approval": True
        }
        
        create_response = api_client.post(
            f"{BASE_URL}/api/budget-requests",
            json=payload,
            headers={"Authorization": f"Bearer {ceo_token}"}
        )
        
        assert create_response.status_code == 200
        request_id = create_response.json()['id']
        
        # CEO tries to approve (should fail)
        response = api_client.put(
            f"{BASE_URL}/api/budget-requests/{request_id}/approve",
            json={"status": "approved"},
            headers={"Authorization": f"Bearer {ceo_token}"}
        )
        
        # CEO role should not be able to approve - only Director
        assert response.status_code == 403, f"Expected 403 Forbidden for non-Director, got {response.status_code}"
        
        print(f"✓ Verified non-Director cannot approve budget requests")


class TestSKUPriceLookup:
    """Test SKU price lookup for auto-calculation"""
    
    def test_get_sku_price_for_city(self, api_client, director_token):
        """Get minimum landing price for SKU in a city"""
        city = "Mumbai"
        sku_name = "20L Premium"
        
        response = api_client.get(
            f"{BASE_URL}/api/cogs/sku-price/{city}/{sku_name}",
            headers={"Authorization": f"Bearer {director_token}"}
        )
        
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        
        data = response.json()
        assert 'minimum_landing_price' in data
        assert data['sku_name'] == sku_name
        assert data['city'] == city
        
        print(f"✓ SKU price lookup for {sku_name} in {city}: ₹{data['minimum_landing_price']}")
    
    def test_get_sku_price_not_found(self, api_client, director_token):
        """Test SKU price lookup for non-existent combination"""
        response = api_client.get(
            f"{BASE_URL}/api/cogs/sku-price/NonExistentCity/NonExistentSKU",
            headers={"Authorization": f"Bearer {director_token}"}
        )
        
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        
        data = response.json()
        assert data['found'] == False, "Should return found=False for non-existent SKU/city"
        assert data['minimum_landing_price'] == 0
        
        print(f"✓ SKU price not found returns default values correctly")


class TestBudgetRequestCancel:
    """Test budget request cancellation"""
    
    def test_cancel_draft_request(self, api_client, ceo_token):
        """User can cancel their own draft/pending request"""
        # Create a draft request
        payload = {
            "title": "TEST_Request to Cancel",
            "description": "This will be cancelled",
            "line_items": [
                {
                    "category_id": "customer_gifting",
                    "category_label": "Customer Gifting",
                    "lead_name": "Test Company",
                    "amount": 10000
                }
            ],
            "submit_for_approval": False
        }
        
        create_response = api_client.post(
            f"{BASE_URL}/api/budget-requests",
            json=payload,
            headers={"Authorization": f"Bearer {ceo_token}"}
        )
        
        assert create_response.status_code == 200
        request_id = create_response.json()['id']
        
        # Cancel the request
        response = api_client.put(
            f"{BASE_URL}/api/budget-requests/{request_id}/cancel",
            headers={"Authorization": f"Bearer {ceo_token}"}
        )
        
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        
        # Verify status is cancelled
        get_response = api_client.get(
            f"{BASE_URL}/api/budget-requests/{request_id}",
            headers={"Authorization": f"Bearer {ceo_token}"}
        )
        
        assert get_response.json()['status'] == 'cancelled'
        
        print(f"✓ Successfully cancelled budget request: {request_id}")


# Cleanup test data
class TestCleanup:
    """Cleanup test data"""
    
    def test_cleanup_test_requests(self, api_client, director_token):
        """Delete test budget requests"""
        # Get all requests
        response = api_client.get(
            f"{BASE_URL}/api/budget-requests",
            headers={"Authorization": f"Bearer {director_token}"}
        )
        
        if response.status_code == 200:
            data = response.json()
            test_requests = [r for r in data if r.get('title', '').startswith('TEST_')]
            print(f"✓ Found {len(test_requests)} test budget requests (cleanup optional)")


if __name__ == "__main__":
    pytest.main([__file__, "-v", "--tb=short"])
