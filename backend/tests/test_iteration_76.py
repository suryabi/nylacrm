"""
Iteration 76 Tests:
1. Home Dashboard: Action Items widget is completely REMOVED
2. Home Dashboard: Task Metrics widget still shows
3. Home Dashboard: No 'New Task' button on home page
4. Backend: POST /api/travel-requests with submit_for_approval=true creates approval task in tasks_v2
5. Backend: POST /api/budget-requests with submit_for_approval=true creates approval task in tasks_v2
6. Backend: GET /api/task-management/tasks shows auto-created approval tasks
7. RBAC: GET /api/roles returns Task Management category with task_management, task_milestones, task_labels
8. Google OAuth: GoogleAuthCallback.js stores session_token in localStorage (code review)
9. Google OAuth: AuthCallback.js stores session_token in localStorage (code review)
"""

import pytest
import requests
import os
import uuid
from datetime import datetime, timedelta

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', '').rstrip('/')

class TestIteration76:
    """Tests for iteration 76 features"""
    
    @pytest.fixture(autouse=True)
    def setup(self):
        """Setup test session with authentication"""
        self.session = requests.Session()
        self.session.headers.update({"Content-Type": "application/json"})
        
        # Login with test credentials
        login_response = self.session.post(
            f"{BASE_URL}/api/auth/login",
            json={"email": "surya.yadavalli@nylaairwater.earth", "password": "test123"}
        )
        
        if login_response.status_code == 200:
            data = login_response.json()
            self.token = data.get('session_token') or data.get('token')
            self.user = data.get('user', {})
            self.session.headers.update({"Authorization": f"Bearer {self.token}"})
        else:
            pytest.skip(f"Login failed: {login_response.status_code}")
        
        yield
        
        # Cleanup: Delete test-created travel and budget requests
        self._cleanup_test_data()
    
    def _cleanup_test_data(self):
        """Clean up test data created during tests"""
        try:
            # Get and delete test travel requests
            travel_resp = self.session.get(f"{BASE_URL}/api/travel-requests")
            if travel_resp.status_code == 200:
                for req in travel_resp.json():
                    if req.get('from_location', '').startswith('TEST_'):
                        self.session.put(f"{BASE_URL}/api/travel-requests/{req['id']}/cancel")
            
            # Get and delete test budget requests
            budget_resp = self.session.get(f"{BASE_URL}/api/budget-requests")
            if budget_resp.status_code == 200:
                for req in budget_resp.json():
                    if req.get('title', '').startswith('TEST_'):
                        self.session.put(f"{BASE_URL}/api/budget-requests/{req['id']}/cancel")
        except Exception as e:
            print(f"Cleanup error: {e}")
    
    # ============= RBAC Tests =============
    
    def test_roles_endpoint_returns_task_management_category(self):
        """Test that GET /api/roles returns Task Management category with correct modules"""
        response = self.session.get(f"{BASE_URL}/api/roles")
        
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        
        data = response.json()
        
        # Response is a dict with 'roles', 'module_categories', 'module_labels'
        assert 'roles' in data, "Response should have 'roles' key"
        assert 'module_categories' in data, "Response should have 'module_categories' key"
        assert 'module_labels' in data, "Response should have 'module_labels' key"
        
        roles = data['roles']
        module_categories = data['module_categories']
        module_labels = data['module_labels']
        
        # Check Task Management category exists
        assert 'Task Management' in module_categories, "Task Management category should exist"
        task_mgmt_modules = module_categories['Task Management']
        
        # Verify task_management, task_milestones, task_labels are in the category
        assert 'task_management' in task_mgmt_modules, "task_management should be in Task Management category"
        assert 'task_milestones' in task_mgmt_modules, "task_milestones should be in Task Management category"
        assert 'task_labels' in task_mgmt_modules, "task_labels should be in Task Management category"
        
        # Check module labels
        assert 'task_management' in module_labels, "task_management should have a label"
        assert 'task_milestones' in module_labels, "task_milestones should have a label"
        assert 'task_labels' in module_labels, "task_labels should have a label"
        
        # Verify labels are correct
        assert module_labels['task_management'] == 'Tasks', f"task_management label should be 'Tasks', got {module_labels['task_management']}"
        assert module_labels['task_milestones'] == 'Milestones', f"task_milestones label should be 'Milestones'"
        assert module_labels['task_labels'] == 'Labels', f"task_labels label should be 'Labels'"
        
        print(f"PASSED: Roles endpoint returns Task Management category with modules: {task_mgmt_modules}")
    
    # ============= Travel Request Auto-Task Tests =============
    
    def test_travel_request_creates_approval_task_in_tasks_v2(self):
        """Test that POST /api/travel-requests with submit_for_approval=true creates task in tasks_v2"""
        
        # Create a travel request with submit_for_approval=true
        travel_data = {
            "from_location": "TEST_Hyderabad",
            "to_location": "TEST_Mumbai",
            "departure_date": (datetime.now() + timedelta(days=20)).strftime('%Y-%m-%d'),
            "return_date": (datetime.now() + timedelta(days=23)).strftime('%Y-%m-%d'),
            "purpose": "lead_customer_visits",
            "tentative_budget": 25000,
            "budget_breakdown": {
                "travel": 10000,
                "accommodation": 8000,
                "local_transport": 3000,
                "meals": 3000,
                "others": 1000
            },
            "selected_leads": [],
            "submit_for_approval": True
        }
        
        response = self.session.post(f"{BASE_URL}/api/travel-requests", json=travel_data)
        
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        
        travel_request = response.json()
        travel_request_id = travel_request.get('id')
        assert travel_request_id, "Travel request should have an ID"
        assert travel_request.get('status') == 'pending_approval', "Status should be pending_approval"
        
        print(f"Created travel request: {travel_request_id}")
        
        # Now check if approval task was created in tasks_v2
        tasks_response = self.session.get(f"{BASE_URL}/api/task-management/tasks")
        
        assert tasks_response.status_code == 200, f"Expected 200, got {tasks_response.status_code}"
        
        tasks = tasks_response.json()
        if isinstance(tasks, dict):
            tasks = tasks.get('tasks', [])
        
        # Find the approval task for this travel request
        approval_task = None
        for task in tasks:
            if (task.get('is_approval_task') and 
                task.get('approval_type') == 'travel_request' and
                task.get('linked_entity_id') == travel_request_id):
                approval_task = task
                break
        
        assert approval_task is not None, f"Approval task should be created in tasks_v2 for travel request {travel_request_id}"
        assert 'Travel Approval' in approval_task.get('title', ''), "Task title should contain 'Travel Approval'"
        assert approval_task.get('status') in ['open', 'pending'], "Task status should be open or pending"
        
        print(f"PASSED: Travel request created approval task in tasks_v2: {approval_task.get('task_number')}")
    
    def test_travel_request_draft_does_not_create_task(self):
        """Test that travel request saved as draft does NOT create approval task"""
        
        travel_data = {
            "from_location": "TEST_Delhi",
            "to_location": "TEST_Chennai",
            "departure_date": (datetime.now() + timedelta(days=25)).strftime('%Y-%m-%d'),
            "return_date": (datetime.now() + timedelta(days=27)).strftime('%Y-%m-%d'),
            "purpose": "team_visit",
            "tentative_budget": 15000,
            "budget_breakdown": {
                "travel": 8000,
                "accommodation": 4000,
                "local_transport": 2000,
                "meals": 1000,
                "others": 0
            },
            "selected_leads": [],
            "submit_for_approval": False  # Draft - should NOT create task
        }
        
        response = self.session.post(f"{BASE_URL}/api/travel-requests", json=travel_data)
        
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        
        travel_request = response.json()
        travel_request_id = travel_request.get('id')
        assert travel_request.get('status') == 'draft', "Status should be draft"
        
        # Check that NO approval task was created
        tasks_response = self.session.get(f"{BASE_URL}/api/task-management/tasks")
        tasks = tasks_response.json()
        if isinstance(tasks, dict):
            tasks = tasks.get('tasks', [])
        
        # Should NOT find approval task for this draft
        for task in tasks:
            if (task.get('is_approval_task') and 
                task.get('linked_entity_id') == travel_request_id):
                pytest.fail(f"Draft travel request should NOT create approval task")
        
        print("PASSED: Draft travel request does not create approval task")
    
    # ============= Budget Request Auto-Task Tests =============
    
    def test_budget_request_creates_approval_task_in_tasks_v2(self):
        """Test that POST /api/budget-requests with submit_for_approval=true creates task in tasks_v2"""
        
        budget_data = {
            "title": "TEST_Marketing Event Budget",
            "description": "Budget for Q1 marketing event",
            "line_items": [
                {
                    "category_id": "event_participation",
                    "category_label": "Event Participation",
                    "amount": 50000,
                    "notes": "Conference booth"
                },
                {
                    "category_id": "marketing_collateral",
                    "category_label": "Marketing Collateral",
                    "amount": 25000,
                    "notes": "Brochures and banners"
                }
            ],
            "event_name": "Tech Summit 2026",
            "event_date": (datetime.now() + timedelta(days=30)).strftime('%Y-%m-%d'),
            "event_city": "Bangalore",
            "submit_for_approval": True
        }
        
        response = self.session.post(f"{BASE_URL}/api/budget-requests", json=budget_data)
        
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        
        budget_request = response.json()
        budget_request_id = budget_request.get('id')
        assert budget_request_id, "Budget request should have an ID"
        assert budget_request.get('status') == 'pending_approval', "Status should be pending_approval"
        assert budget_request.get('total_amount') == 75000, "Total amount should be 75000"
        
        print(f"Created budget request: {budget_request_id}")
        
        # Check if approval task was created in tasks_v2
        tasks_response = self.session.get(f"{BASE_URL}/api/task-management/tasks")
        
        assert tasks_response.status_code == 200, f"Expected 200, got {tasks_response.status_code}"
        
        tasks = tasks_response.json()
        if isinstance(tasks, dict):
            tasks = tasks.get('tasks', [])
        
        # Find the approval task for this budget request
        approval_task = None
        for task in tasks:
            if (task.get('is_approval_task') and 
                task.get('approval_type') == 'budget_request' and
                task.get('linked_entity_id') == budget_request_id):
                approval_task = task
                break
        
        assert approval_task is not None, f"Approval task should be created in tasks_v2 for budget request {budget_request_id}"
        assert 'Budget Approval' in approval_task.get('title', ''), "Task title should contain 'Budget Approval'"
        
        print(f"PASSED: Budget request created approval task in tasks_v2: {approval_task.get('task_number')}")
    
    def test_budget_request_draft_does_not_create_task(self):
        """Test that budget request saved as draft does NOT create approval task"""
        
        budget_data = {
            "title": "TEST_Draft Budget Request",
            "description": "This is a draft",
            "line_items": [
                {
                    "category_id": "office_supplies",
                    "category_label": "Office Supplies",
                    "amount": 10000
                }
            ],
            "submit_for_approval": False  # Draft
        }
        
        response = self.session.post(f"{BASE_URL}/api/budget-requests", json=budget_data)
        
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        
        budget_request = response.json()
        budget_request_id = budget_request.get('id')
        assert budget_request.get('status') == 'draft', "Status should be draft"
        
        # Check that NO approval task was created
        tasks_response = self.session.get(f"{BASE_URL}/api/task-management/tasks")
        tasks = tasks_response.json()
        if isinstance(tasks, dict):
            tasks = tasks.get('tasks', [])
        
        for task in tasks:
            if (task.get('is_approval_task') and 
                task.get('linked_entity_id') == budget_request_id):
                pytest.fail(f"Draft budget request should NOT create approval task")
        
        print("PASSED: Draft budget request does not create approval task")
    
    # ============= Task Management API Tests =============
    
    def test_task_management_tasks_endpoint(self):
        """Test that GET /api/task-management/tasks returns tasks including approval tasks"""
        response = self.session.get(f"{BASE_URL}/api/task-management/tasks")
        
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        
        data = response.json()
        # Response could be list or dict with 'tasks' key
        if isinstance(data, dict):
            tasks = data.get('tasks', [])
        else:
            tasks = data
        
        assert isinstance(tasks, list), "Tasks should be a list"
        print(f"PASSED: Task management endpoint returns {len(tasks)} tasks")
    
    def test_task_management_stats_endpoint(self):
        """Test that GET /api/task-management/tasks/stats returns correct stats"""
        response = self.session.get(f"{BASE_URL}/api/task-management/tasks/stats")
        
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        
        stats = response.json()
        assert 'total' in stats, "Stats should have 'total'"
        # Stats has by_status with open/closed counts
        assert 'by_status' in stats, "Stats should have 'by_status'"
        assert 'by_severity' in stats, "Stats should have 'by_severity'"
        
        by_status = stats.get('by_status', {})
        print(f"PASSED: Task stats endpoint returns: total={stats.get('total')}, by_status={by_status}")
    
    def test_my_dashboard_stats_endpoint(self):
        """Test that GET /api/task-management/tasks/my-dashboard-stats returns home dashboard stats"""
        response = self.session.get(f"{BASE_URL}/api/task-management/tasks/my-dashboard-stats")
        
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        
        stats = response.json()
        assert 'assigned_to_me' in stats, "Stats should have 'assigned_to_me'"
        assert 'created_by_me' in stats, "Stats should have 'created_by_me'"
        assert 'overdue' in stats, "Stats should have 'overdue'"
        assert 'high_severity' in stats, "Stats should have 'high_severity'"
        
        print(f"PASSED: My dashboard stats: assigned={stats.get('assigned_to_me')}, created={stats.get('created_by_me')}, overdue={stats.get('overdue')}, high_severity={stats.get('high_severity')}")
    
    # ============= Dashboard API Test =============
    
    def test_dashboard_endpoint(self):
        """Test that GET /api/dashboard returns data (used by HomeDashboard)"""
        response = self.session.get(f"{BASE_URL}/api/dashboard")
        
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        
        data = response.json()
        # Dashboard should return various widgets data
        assert isinstance(data, dict), "Dashboard should return a dict"
        
        print(f"PASSED: Dashboard endpoint returns data with keys: {list(data.keys())}")
    
    # ============= Login Response Test =============
    
    def test_login_returns_session_token(self):
        """Test that login response includes session_token field"""
        response = requests.post(
            f"{BASE_URL}/api/auth/login",
            json={"email": "surya.yadavalli@nylaairwater.earth", "password": "test123"}
        )
        
        assert response.status_code == 200, f"Expected 200, got {response.status_code}"
        
        data = response.json()
        # Should have session_token or token
        has_token = 'session_token' in data or 'token' in data
        assert has_token, "Login response should include session_token or token"
        
        token_value = data.get('session_token') or data.get('token')
        assert token_value, "Token should not be empty"
        
        print(f"PASSED: Login returns session_token field")


if __name__ == "__main__":
    pytest.main([__file__, "-v", "--tb=short"])
