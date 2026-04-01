"""
Test Task Dashboard Stats APIs - New endpoints for home dashboard task metrics
- GET /api/task-management/tasks/my-dashboard-stats - Personal metrics for home dashboard
- GET /api/task-management/tasks/stats - Enhanced with created_by_me field
"""
import pytest
import requests
import os
import uuid

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', '').rstrip('/')

# Test credentials
TEST_EMAIL = "surya.yadavalli@nylaairwater.earth"
TEST_PASSWORD = "test123"


@pytest.fixture(scope="module")
def auth_token():
    """Get authentication token"""
    response = requests.post(f"{BASE_URL}/api/auth/login", json={
        "email": TEST_EMAIL,
        "password": TEST_PASSWORD
    })
    assert response.status_code == 200, f"Login failed: {response.text}"
    data = response.json()
    # API returns session_token instead of token
    token = data.get("session_token") or data.get("token")
    assert token, "No token in response"
    return token


@pytest.fixture(scope="module")
def headers(auth_token):
    """Get headers with auth token"""
    return {
        "Authorization": f"Bearer {auth_token}",
        "Content-Type": "application/json"
    }


@pytest.fixture(scope="module")
def user_info(headers):
    """Get current user info"""
    response = requests.get(f"{BASE_URL}/api/auth/me", headers=headers)
    assert response.status_code == 200
    return response.json()


class TestMyDashboardStats:
    """Test the new /tasks/my-dashboard-stats endpoint for home dashboard"""
    
    def test_my_dashboard_stats_endpoint_exists(self, headers):
        """Test that the my-dashboard-stats endpoint exists and returns 200"""
        response = requests.get(f"{BASE_URL}/api/task-management/tasks/my-dashboard-stats", headers=headers)
        assert response.status_code == 200, f"Endpoint failed: {response.text}"
        print("my-dashboard-stats endpoint exists and returns 200")
    
    def test_my_dashboard_stats_structure(self, headers):
        """Test that my-dashboard-stats returns correct structure"""
        response = requests.get(f"{BASE_URL}/api/task-management/tasks/my-dashboard-stats", headers=headers)
        assert response.status_code == 200
        data = response.json()
        
        # Check required fields
        required_fields = ['assigned_to_me', 'created_by_me', 'overdue', 'high_severity']
        for field in required_fields:
            assert field in data, f"Missing field: {field}"
            assert isinstance(data[field], int), f"Field {field} should be integer"
        
        print(f"Dashboard stats structure: {data}")
    
    def test_my_dashboard_stats_values(self, headers, user_info):
        """Test that my-dashboard-stats returns correct values after creating test tasks"""
        # Create a test task assigned to current user with high severity
        task_title = f"TEST_DashboardStats_{uuid.uuid4().hex[:6]}"
        create_response = requests.post(f"{BASE_URL}/api/task-management/tasks", json={
            "title": task_title,
            "department_id": "Sales",
            "severity": "high",
            "status": "open",
            "assignees": [user_info["id"]],
            "due_date": "2025-01-01"  # Past date for overdue
        }, headers=headers)
        assert create_response.status_code == 200, f"Failed to create task: {create_response.text}"
        task_id = create_response.json()["id"]
        
        # Get dashboard stats
        stats_response = requests.get(f"{BASE_URL}/api/task-management/tasks/my-dashboard-stats", headers=headers)
        assert stats_response.status_code == 200
        stats = stats_response.json()
        
        # Verify counts are >= 1 (since we just created a task)
        assert stats['assigned_to_me'] >= 1, "assigned_to_me should be >= 1"
        assert stats['created_by_me'] >= 1, "created_by_me should be >= 1"
        assert stats['high_severity'] >= 1, "high_severity should be >= 1"
        assert stats['overdue'] >= 1, "overdue should be >= 1 (task has past due date)"
        
        print(f"Dashboard stats after creating test task: {stats}")
        
        # Cleanup
        requests.delete(f"{BASE_URL}/api/task-management/tasks/{task_id}", headers=headers)


class TestTaskStatsEnhanced:
    """Test the enhanced /tasks/stats endpoint with created_by_me field"""
    
    def test_task_stats_has_created_by_me(self, headers):
        """Test that /tasks/stats includes created_by_me field"""
        response = requests.get(f"{BASE_URL}/api/task-management/tasks/stats", headers=headers)
        assert response.status_code == 200
        data = response.json()
        
        # Check that created_by_me field exists
        assert 'created_by_me' in data, "Missing created_by_me field in stats"
        assert isinstance(data['created_by_me'], int), "created_by_me should be integer"
        
        # Check other expected fields
        assert 'my_tasks' in data, "Missing my_tasks field"
        assert 'overdue' in data, "Missing overdue field"
        assert 'total' in data, "Missing total field"
        assert 'by_status' in data, "Missing by_status field"
        assert 'by_severity' in data, "Missing by_severity field"
        
        print(f"Task stats with created_by_me: {data}")


class TestTaskFiltersWithView:
    """Test task filtering with view parameter"""
    
    def test_filter_my_tasks(self, headers, user_info):
        """Test filtering tasks with view=my_tasks"""
        response = requests.get(f"{BASE_URL}/api/task-management/tasks", 
                               params={"view": "my_tasks"}, headers=headers)
        assert response.status_code == 200
        tasks = response.json()
        # All tasks should be assigned to current user
        for task in tasks:
            assert user_info["id"] in task.get("assignees", []), f"Task {task['id']} not assigned to current user"
        print(f"Found {len(tasks)} tasks assigned to me")
    
    def test_filter_assigned_by_me(self, headers, user_info):
        """Test filtering tasks with view=assigned_by_me (created by me)"""
        response = requests.get(f"{BASE_URL}/api/task-management/tasks", 
                               params={"view": "assigned_by_me"}, headers=headers)
        assert response.status_code == 200
        tasks = response.json()
        # All tasks should be created by current user
        for task in tasks:
            assert task.get("created_by") == user_info["id"], f"Task {task['id']} not created by current user"
        print(f"Found {len(tasks)} tasks created by me")
    
    def test_filter_combined_view_and_severity(self, headers):
        """Test combining view filter with severity filter"""
        response = requests.get(f"{BASE_URL}/api/task-management/tasks", 
                               params={"view": "my_tasks", "severity": "high"}, headers=headers)
        assert response.status_code == 200
        tasks = response.json()
        for task in tasks:
            assert task.get("severity") == "high", f"Task {task['id']} has wrong severity"
        print(f"Found {len(tasks)} high severity tasks assigned to me")
    
    def test_filter_combined_view_and_status(self, headers):
        """Test combining view filter with status filter"""
        response = requests.get(f"{BASE_URL}/api/task-management/tasks", 
                               params={"view": "my_tasks", "status": "open"}, headers=headers)
        assert response.status_code == 200
        tasks = response.json()
        for task in tasks:
            assert task.get("status") == "open", f"Task {task['id']} has wrong status"
        print(f"Found {len(tasks)} open tasks assigned to me")


# Cleanup test data after all tests
@pytest.fixture(scope="module", autouse=True)
def cleanup_test_data(headers):
    """Cleanup TEST_ prefixed data after tests"""
    yield
    # Cleanup tasks
    tasks_response = requests.get(f"{BASE_URL}/api/task-management/tasks", headers=headers)
    if tasks_response.status_code == 200:
        for task in tasks_response.json():
            if task["title"].startswith("TEST_"):
                requests.delete(f"{BASE_URL}/api/task-management/tasks/{task['id']}", headers=headers)
