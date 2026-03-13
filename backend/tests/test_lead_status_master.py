"""
Test suite for Lead Status Master API endpoints
Tests CRUD operations and dynamic status integration across the CRM
"""
import pytest
import requests
import os
import uuid

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', 'https://crm-preview-20.preview.emergentagent.com')

class TestLeadStatusMasterAPI:
    """Tests for /api/master/lead-statuses endpoints"""
    
    session_token = None
    
    @pytest.fixture(autouse=True)
    def setup(self):
        """Login with CEO credentials (has admin privileges for status management)"""
        if TestLeadStatusMasterAPI.session_token is None:
            login_response = requests.post(
                f"{BASE_URL}/api/auth/login",
                json={"email": "surya.yadavalli@nylaairwater.earth", "password": "surya123"}
            )
            assert login_response.status_code == 200, f"Login failed: {login_response.text}"
            data = login_response.json()
            TestLeadStatusMasterAPI.session_token = data.get('session_token')
        
        self.cookies = {'session_token': TestLeadStatusMasterAPI.session_token}
    
    def test_get_lead_statuses(self):
        """Test GET /api/master/lead-statuses returns all statuses"""
        response = requests.get(
            f"{BASE_URL}/api/master/lead-statuses",
            cookies=self.cookies
        )
        assert response.status_code == 200, f"Failed to get lead statuses: {response.text}"
        
        data = response.json()
        assert 'statuses' in data, "Response missing 'statuses' key"
        
        statuses = data['statuses']
        assert len(statuses) >= 10, f"Expected at least 10 statuses, got {len(statuses)}"
        
        # Verify required fields
        for status in statuses:
            assert 'id' in status, f"Status missing 'id': {status}"
            assert 'label' in status, f"Status missing 'label': {status}"
            assert 'color' in status, f"Status missing 'color': {status}"
            assert 'order' in status, f"Status missing 'order': {status}"
        
        # Verify expected statuses exist
        status_ids = [s['id'] for s in statuses]
        expected_statuses = ['new', 'qualified', 'contacted', 'proposal_internal_review', 
                            'ready_to_share_proposal', 'proposal_shared_with_customer',
                            'trial_in_progress', 'won', 'lost', 'not_qualified']
        
        for expected_id in expected_statuses:
            assert expected_id in status_ids, f"Missing expected status: {expected_id}"
        
        print(f"✓ GET lead-statuses returned {len(statuses)} statuses with all required fields")
    
    def test_statuses_ordered_correctly(self):
        """Test that statuses are returned in order"""
        response = requests.get(
            f"{BASE_URL}/api/master/lead-statuses",
            cookies=self.cookies
        )
        assert response.status_code == 200
        
        statuses = response.json()['statuses']
        orders = [s['order'] for s in statuses]
        
        # Check orders are ascending
        for i in range(1, len(orders)):
            assert orders[i] >= orders[i-1], f"Statuses not in order: {orders}"
        
        print(f"✓ Statuses are correctly ordered: {orders}")
    
    def test_create_lead_status(self):
        """Test POST /api/master/lead-statuses to create a new status"""
        test_label = f"TEST_Status_{uuid.uuid4().hex[:6]}"
        
        response = requests.post(
            f"{BASE_URL}/api/master/lead-statuses",
            json={"label": test_label, "color": "pink"},
            cookies=self.cookies
        )
        assert response.status_code in [200, 201], f"Failed to create status: {response.text}"
        
        data = response.json()
        created_status = data.get('status', data)  # Handle nested or flat response
        assert created_status['label'] == test_label
        assert created_status['color'] == 'pink'
        assert 'id' in created_status
        
        # Verify it appears in the list
        get_response = requests.get(
            f"{BASE_URL}/api/master/lead-statuses",
            cookies=self.cookies
        )
        statuses = get_response.json()['statuses']
        found = any(s['label'] == test_label for s in statuses)
        assert found, f"Created status {test_label} not found in list"
        
        # Cleanup - delete the test status
        requests.delete(
            f"{BASE_URL}/api/master/lead-statuses/{created_status['id']}",
            cookies=self.cookies
        )
        
        print(f"✓ Successfully created and verified new status: {test_label}")
    
    def test_update_lead_status(self):
        """Test PUT /api/master/lead-statuses/{id} to update a status"""
        # First create a test status
        test_label = f"TEST_Update_{uuid.uuid4().hex[:6]}"
        create_response = requests.post(
            f"{BASE_URL}/api/master/lead-statuses",
            json={"label": test_label, "color": "teal"},
            cookies=self.cookies
        )
        assert create_response.status_code in [200, 201]
        create_data = create_response.json()
        status_id = create_data.get('status', create_data)['id']
        
        # Update the status
        updated_label = f"TEST_Updated_{uuid.uuid4().hex[:6]}"
        update_response = requests.put(
            f"{BASE_URL}/api/master/lead-statuses/{status_id}",
            json={"label": updated_label, "color": "orange"},
            cookies=self.cookies
        )
        assert update_response.status_code == 200, f"Failed to update status: {update_response.text}"
        
        update_data = update_response.json()
        updated_status = update_data.get('status', update_data)
        assert updated_status['label'] == updated_label
        assert updated_status['color'] == 'orange'
        
        # Cleanup
        requests.delete(
            f"{BASE_URL}/api/master/lead-statuses/{status_id}",
            cookies=self.cookies
        )
        
        print(f"✓ Successfully updated status from {test_label} to {updated_label}")
    
    def test_delete_lead_status(self):
        """Test DELETE /api/master/lead-statuses/{id}"""
        # Create a test status to delete
        test_label = f"TEST_Delete_{uuid.uuid4().hex[:6]}"
        create_response = requests.post(
            f"{BASE_URL}/api/master/lead-statuses",
            json={"label": test_label, "color": "gray"},
            cookies=self.cookies
        )
        assert create_response.status_code in [200, 201]
        create_data = create_response.json()
        status_id = create_data.get('status', create_data)['id']
        
        # Delete the status
        delete_response = requests.delete(
            f"{BASE_URL}/api/master/lead-statuses/{status_id}",
            cookies=self.cookies
        )
        assert delete_response.status_code == 200, f"Failed to delete status: {delete_response.text}"
        
        # Verify it's gone
        get_response = requests.get(
            f"{BASE_URL}/api/master/lead-statuses",
            cookies=self.cookies
        )
        statuses = get_response.json()['statuses']
        found = any(s['id'] == status_id for s in statuses)
        assert not found, f"Deleted status {status_id} still found in list"
        
        print(f"✓ Successfully deleted status: {status_id}")


class TestDashboardStatusIntegration:
    """Tests for dashboard using dynamic statuses"""
    
    session_token = None
    
    @pytest.fixture(autouse=True)
    def setup(self):
        """Login and get session token"""
        if TestDashboardStatusIntegration.session_token is None:
            login_response = requests.post(
                f"{BASE_URL}/api/auth/login",
                json={"email": "admin@nylaairwater.earth", "password": "admin123"}
            )
            assert login_response.status_code == 200
            TestDashboardStatusIntegration.session_token = login_response.json().get('session_token')
        
        self.cookies = {'session_token': TestDashboardStatusIntegration.session_token}
    
    def test_dashboard_analytics_endpoint(self):
        """Test dashboard analytics endpoint returns status distribution"""
        response = requests.get(
            f"{BASE_URL}/api/analytics/dashboard?time_filter=lifetime",
            cookies=self.cookies
        )
        assert response.status_code == 200, f"Dashboard analytics failed: {response.text}"
        
        data = response.json()
        assert 'status_distribution' in data, "Missing status_distribution in response"
        assert 'total_leads' in data
        assert 'pipeline_value' in data
        
        print(f"✓ Dashboard analytics endpoint working, total_leads: {data['total_leads']}")


class TestLeadsListStatusIntegration:
    """Tests for leads list using dynamic statuses for filtering"""
    
    session_token = None
    
    @pytest.fixture(autouse=True)
    def setup(self):
        """Login and get session token"""
        if TestLeadsListStatusIntegration.session_token is None:
            login_response = requests.post(
                f"{BASE_URL}/api/auth/login",
                json={"email": "admin@nylaairwater.earth", "password": "admin123"}
            )
            assert login_response.status_code == 200
            TestLeadsListStatusIntegration.session_token = login_response.json().get('session_token')
        
        self.cookies = {'session_token': TestLeadsListStatusIntegration.session_token}
    
    def test_leads_list_with_status_filter(self):
        """Test leads list API with status filter"""
        response = requests.get(
            f"{BASE_URL}/api/leads?status=new&page=1&pageSize=10",
            cookies=self.cookies
        )
        assert response.status_code == 200, f"Leads list failed: {response.text}"
        
        data = response.json()
        assert 'data' in data
        assert 'total' in data
        
        print(f"✓ Leads list with status filter returned {data['total']} leads")
    
    def test_leads_list_with_multiple_statuses(self):
        """Test leads list API with multiple status filter"""
        response = requests.get(
            f"{BASE_URL}/api/leads?status=new,qualified,contacted&page=1&pageSize=25",
            cookies=self.cookies
        )
        assert response.status_code == 200, f"Leads list failed: {response.text}"
        
        data = response.json()
        assert 'data' in data
        
        print(f"✓ Leads list with multiple status filter returned {data['total']} leads")


class TestKanbanStatusIntegration:
    """Tests verifying Kanban uses dynamic statuses"""
    
    session_token = None
    
    @pytest.fixture(autouse=True)
    def setup(self):
        if TestKanbanStatusIntegration.session_token is None:
            login_response = requests.post(
                f"{BASE_URL}/api/auth/login",
                json={"email": "admin@nylaairwater.earth", "password": "admin123"}
            )
            assert login_response.status_code == 200
            TestKanbanStatusIntegration.session_token = login_response.json().get('session_token')
        
        self.cookies = {'session_token': TestKanbanStatusIntegration.session_token}
    
    def test_kanban_data_endpoints(self):
        """Test that Kanban can fetch all required data"""
        # Test leads endpoint used by Kanban
        leads_response = requests.get(
            f"{BASE_URL}/api/leads?page_size=500",
            cookies=self.cookies
        )
        assert leads_response.status_code == 200, f"Leads fetch failed: {leads_response.text}"
        
        # Test statuses endpoint
        statuses_response = requests.get(
            f"{BASE_URL}/api/master/lead-statuses",
            cookies=self.cookies
        )
        assert statuses_response.status_code == 200, f"Statuses fetch failed: {statuses_response.text}"
        
        # Test users endpoint
        users_response = requests.get(
            f"{BASE_URL}/api/users",
            cookies=self.cookies
        )
        assert users_response.status_code == 200, f"Users fetch failed: {users_response.text}"
        
        print("✓ All Kanban data endpoints working correctly")


if __name__ == "__main__":
    pytest.main([__file__, "-v"])
