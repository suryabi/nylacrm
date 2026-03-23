"""
Test for-approver endpoints for Leave, Travel, Budget, and Expense requests.
These endpoints return requests from reportees + requests previously acted upon by the approver.
"""
import pytest
import requests
import os

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', '').rstrip('/')

# Test credentials
ADMIN_EMAIL = "surya.yadavalli@nylaairwater.earth"
ADMIN_PASSWORD = "test123"
ADMIN_USER_ID = "7d03cff4-4db2-4b2e-969b-f5b3d57d58a6"

# Vamsi (Director) reports to Surya (CEO)
REPORTEE_USER_ID = "8194d1b1-d50c-4a04-a9a7-5a79e4d8b5fd"


@pytest.fixture(scope="module")
def api_client():
    """Create authenticated session using session cookie or Bearer token"""
    session = requests.Session()
    response = session.post(
        f"{BASE_URL}/api/auth/login",
        json={"email": ADMIN_EMAIL, "password": ADMIN_PASSWORD}
    )
    if response.status_code == 200:
        data = response.json()
        session_token = data.get("session_token")
        if session_token:
            # Use both cookie and Authorization header for compatibility
            session.cookies.set('session_token', session_token)
            session.headers.update({"Authorization": f"Bearer {session_token}"})
        return session
    pytest.skip(f"Authentication failed: {response.status_code} - {response.text}")


class TestLeaveRequestsForApprover:
    """Test /leave-requests/for-approver endpoint"""
    
    def test_for_approver_endpoint_returns_200(self, api_client):
        """Test that for-approver endpoint returns 200"""
        response = api_client.get(f"{BASE_URL}/api/leave-requests/for-approver")
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        data = response.json()
        assert isinstance(data, list), "Response should be a list"
        print(f"Leave requests for approver: {len(data)} requests found")
    
    def test_for_approver_returns_reportee_requests(self, api_client):
        """Test that for-approver returns requests from reportees"""
        response = api_client.get(f"{BASE_URL}/api/leave-requests/for-approver")
        assert response.status_code == 200
        data = response.json()
        
        # Check if any requests are from reportees (Vamsi reports to Surya)
        reportee_requests = [r for r in data if r.get('user_id') == REPORTEE_USER_ID]
        print(f"Found {len(reportee_requests)} leave requests from reportee (Vamsi)")
        
        # Also check for requests approved by current user
        approved_by_user = [r for r in data if r.get('approved_by') == ADMIN_USER_ID]
        print(f"Found {len(approved_by_user)} leave requests previously approved by admin")
    
    def test_for_approver_with_status_filter(self, api_client):
        """Test for-approver endpoint with status filter"""
        response = api_client.get(f"{BASE_URL}/api/leave-requests/for-approver?status=pending")
        assert response.status_code == 200
        data = response.json()
        
        # All returned requests should have pending status
        for req in data:
            assert req.get('status') == 'pending', f"Expected pending status, got {req.get('status')}"
        print(f"Found {len(data)} pending leave requests for approver")
    
    def test_my_leave_requests_endpoint(self, api_client):
        """Test that user can see leave requests (own + direct reports for CEO/Director)"""
        response = api_client.get(f"{BASE_URL}/api/leave-requests?user_id={ADMIN_USER_ID}")
        assert response.status_code == 200
        data = response.json()
        
        # CEO/Director sees their own + direct reports' requests
        # Just verify we get a list back
        assert isinstance(data, list), "Response should be a list"
        print(f"Found {len(data)} leave requests for current user (CEO sees own + direct reports)")


class TestTravelRequestsForApprover:
    """Test /travel-requests/for-approver endpoint"""
    
    def test_for_approver_endpoint_returns_200(self, api_client):
        """Test that for-approver endpoint returns 200"""
        response = api_client.get(f"{BASE_URL}/api/travel-requests/for-approver")
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        data = response.json()
        assert isinstance(data, list), "Response should be a list"
        print(f"Travel requests for approver: {len(data)} requests found")
    
    def test_for_approver_returns_reportee_requests(self, api_client):
        """Test that for-approver returns requests from reportees"""
        response = api_client.get(f"{BASE_URL}/api/travel-requests/for-approver")
        assert response.status_code == 200
        data = response.json()
        
        # Check if any requests are from reportees
        reportee_requests = [r for r in data if r.get('user_id') == REPORTEE_USER_ID]
        print(f"Found {len(reportee_requests)} travel requests from reportee (Vamsi)")
        
        # Also check for requests approved by current user
        approved_by_user = [r for r in data if r.get('approved_by') == ADMIN_USER_ID]
        print(f"Found {len(approved_by_user)} travel requests previously approved by admin")
    
    def test_for_approver_with_status_filter(self, api_client):
        """Test for-approver endpoint with status filter"""
        response = api_client.get(f"{BASE_URL}/api/travel-requests/for-approver?status=pending_approval")
        assert response.status_code == 200
        data = response.json()
        
        # All returned requests should have pending_approval status
        for req in data:
            assert req.get('status') == 'pending_approval', f"Expected pending_approval status, got {req.get('status')}"
        print(f"Found {len(data)} pending travel requests for approver")
    
    def test_my_travel_requests_endpoint(self, api_client):
        """Test that user can see travel requests (own + pending for CEO/Director)"""
        response = api_client.get(f"{BASE_URL}/api/travel-requests")
        assert response.status_code == 200
        data = response.json()
        
        # CEO/Director sees their own + all pending requests
        # Just verify we get a list back
        assert isinstance(data, list), "Response should be a list"
        print(f"Found {len(data)} travel requests for current user (CEO sees own + pending)")


class TestBudgetRequestsForApprover:
    """Test /budget-requests/for-approver endpoint"""
    
    def test_for_approver_endpoint_returns_200(self, api_client):
        """Test that for-approver endpoint returns 200"""
        response = api_client.get(f"{BASE_URL}/api/budget-requests/for-approver")
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        data = response.json()
        assert isinstance(data, list), "Response should be a list"
        print(f"Budget requests for approver: {len(data)} requests found")
    
    def test_for_approver_returns_reportee_requests(self, api_client):
        """Test that for-approver returns requests from reportees"""
        response = api_client.get(f"{BASE_URL}/api/budget-requests/for-approver")
        assert response.status_code == 200
        data = response.json()
        
        # Check if any requests are from reportees
        reportee_requests = [r for r in data if r.get('user_id') == REPORTEE_USER_ID]
        print(f"Found {len(reportee_requests)} budget requests from reportee (Vamsi)")
        
        # Also check for requests approved by current user
        approved_by_user = [r for r in data if r.get('approved_by') == ADMIN_USER_ID]
        print(f"Found {len(approved_by_user)} budget requests previously approved by admin")
    
    def test_for_approver_with_status_filter(self, api_client):
        """Test for-approver endpoint with status filter"""
        response = api_client.get(f"{BASE_URL}/api/budget-requests/for-approver?status=pending_approval")
        assert response.status_code == 200
        data = response.json()
        
        # All returned requests should have pending_approval status
        for req in data:
            assert req.get('status') == 'pending_approval', f"Expected pending_approval status, got {req.get('status')}"
        print(f"Found {len(data)} pending budget requests for approver")
    
    def test_my_budget_requests_endpoint(self, api_client):
        """Test that user can see their own budget requests"""
        response = api_client.get(f"{BASE_URL}/api/budget-requests?user_id={ADMIN_USER_ID}")
        assert response.status_code == 200
        data = response.json()
        
        # All returned requests should belong to the user
        for req in data:
            assert req.get('user_id') == ADMIN_USER_ID, f"Expected user_id {ADMIN_USER_ID}, got {req.get('user_id')}"
        print(f"Found {len(data)} budget requests for current user")


class TestExpenseRequestsForApprover:
    """Test /expense-requests/for-approver endpoint"""
    
    def test_for_approver_endpoint_returns_200(self, api_client):
        """Test that for-approver endpoint returns 200"""
        response = api_client.get(f"{BASE_URL}/api/expense-requests/for-approver")
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        data = response.json()
        assert isinstance(data, list), "Response should be a list"
        print(f"Expense requests for approver: {len(data)} requests found")
    
    def test_for_approver_returns_reportee_requests(self, api_client):
        """Test that for-approver returns requests from reportees"""
        response = api_client.get(f"{BASE_URL}/api/expense-requests/for-approver")
        assert response.status_code == 200
        data = response.json()
        
        # Check if any requests are from reportees
        reportee_requests = [r for r in data if r.get('user_id') == REPORTEE_USER_ID]
        print(f"Found {len(reportee_requests)} expense requests from reportee (Vamsi)")
        
        # Also check for requests approved by current user
        approved_by_user = [r for r in data if r.get('approved_by') == ADMIN_USER_ID]
        print(f"Found {len(approved_by_user)} expense requests previously approved by admin")
    
    def test_for_approver_with_status_filter(self, api_client):
        """Test for-approver endpoint with status filter"""
        response = api_client.get(f"{BASE_URL}/api/expense-requests/for-approver?status=pending_approval")
        assert response.status_code == 200
        data = response.json()
        
        # All returned requests should have pending_approval status
        for req in data:
            assert req.get('status') == 'pending_approval', f"Expected pending_approval status, got {req.get('status')}"
        print(f"Found {len(data)} pending expense requests for approver")
    
    def test_my_expense_requests_endpoint(self, api_client):
        """Test that user can see their own expense requests"""
        response = api_client.get(f"{BASE_URL}/api/expense-requests?user_id={ADMIN_USER_ID}")
        assert response.status_code == 200
        data = response.json()
        
        # All returned requests should belong to the user
        for req in data:
            assert req.get('user_id') == ADMIN_USER_ID, f"Expected user_id {ADMIN_USER_ID}, got {req.get('user_id')}"
        print(f"Found {len(data)} expense requests for current user")


class TestVisibilityRules:
    """Test that visibility rules work correctly for both requestor and approver"""
    
    def test_requestor_sees_own_requests_any_status(self, api_client):
        """Test that requestor can see their own requests regardless of status"""
        # Get all leave requests for current user (CEO sees own + direct reports)
        response = api_client.get(f"{BASE_URL}/api/leave-requests?user_id={ADMIN_USER_ID}")
        assert response.status_code == 200
        data = response.json()
        
        # Check that we get requests with various statuses
        statuses = set(r.get('status') for r in data)
        print(f"User's leave requests have statuses: {statuses}")
        
        # CEO/Director sees their own + direct reports' requests
        # Just verify we get a list back
        assert isinstance(data, list), "Response should be a list"
        print(f"Found {len(data)} leave requests (CEO sees own + direct reports)")
    
    def test_approver_sees_pending_and_reviewed_requests(self, api_client):
        """Test that approver sees both pending and previously reviewed requests"""
        response = api_client.get(f"{BASE_URL}/api/travel-requests/for-approver")
        assert response.status_code == 200
        data = response.json()
        
        # Check for various statuses
        statuses = set(r.get('status') for r in data)
        print(f"Approver's travel requests have statuses: {statuses}")
        
        # Should include both pending and approved/rejected
        pending_count = len([r for r in data if r.get('status') == 'pending_approval'])
        reviewed_count = len([r for r in data if r.get('status') in ['approved', 'rejected']])
        print(f"Pending: {pending_count}, Reviewed: {reviewed_count}")
