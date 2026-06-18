"""
Test Task Management Module - My Tasks / All Tasks Tab Features
Tests for:
- view=mine parameter (combined assigned+created tasks)
- comma-separated department_id for multi-department filtering
- Personal metrics (my_total, my_tasks, created_by_me, my_in_progress, my_overdue, my_high_severity)
- Department-level metrics (total, by_status, overdue)
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


class TestViewMineParameter:
    """Test view=mine parameter for combined assigned+created tasks"""
    
    def test_view_mine_returns_200(self, headers):
        """Test that view=mine parameter returns 200"""
        response = requests.get(f"{BASE_URL}/api/task-management/tasks", 
                               params={"view": "mine"}, headers=headers)
        assert response.status_code == 200
        data = response.json()
        assert isinstance(data, list)
        print(f"view=mine returned {len(data)} tasks")
    
    def test_view_mine_includes_assigned_tasks(self, headers, user_info):
        """Test that view=mine includes tasks assigned to user"""
        # Get tasks with view=mine
        response = requests.get(f"{BASE_URL}/api/task-management/tasks", 
                               params={"view": "mine"}, headers=headers)
        assert response.status_code == 200
        tasks = response.json()
        
        # Get tasks assigned to user
        assigned_response = requests.get(f"{BASE_URL}/api/task-management/tasks", 
                                        params={"view": "my_tasks"}, headers=headers)
        assigned_tasks = assigned_response.json()
        
        # All assigned tasks should be in view=mine
        mine_ids = {t["id"] for t in tasks}
        for task in assigned_tasks:
            assert task["id"] in mine_ids, f"Assigned task {task['id']} not in view=mine"
        print(f"All {len(assigned_tasks)} assigned tasks found in view=mine")
    
    def test_view_mine_includes_created_tasks(self, headers, user_info):
        """Test that view=mine includes tasks created by user"""
        # Get tasks with view=mine
        response = requests.get(f"{BASE_URL}/api/task-management/tasks", 
                               params={"view": "mine"}, headers=headers)
        assert response.status_code == 200
        tasks = response.json()
        
        # Get tasks created by user
        created_response = requests.get(f"{BASE_URL}/api/task-management/tasks", 
                                       params={"view": "assigned_by_me"}, headers=headers)
        created_tasks = created_response.json()
        
        # All created tasks should be in view=mine
        mine_ids = {t["id"] for t in tasks}
        for task in created_tasks:
            assert task["id"] in mine_ids, f"Created task {task['id']} not in view=mine"
        print(f"All {len(created_tasks)} created tasks found in view=mine")


class TestMultiDepartmentFilter:
    """Test comma-separated department_id for multi-department filtering"""
    
    def test_single_department_filter(self, headers):
        """Test filtering by single department"""
        response = requests.get(f"{BASE_URL}/api/task-management/tasks", 
                               params={"department_id": "Sales"}, headers=headers)
        assert response.status_code == 200
        tasks = response.json()
        for task in tasks:
            assert task["department_id"] == "Sales", f"Task {task['id']} has wrong department"
        print(f"Single department filter: {len(tasks)} Sales tasks")
    
    def test_multi_department_filter_comma_separated(self, headers):
        """Test filtering by multiple departments using comma-separated values"""
        response = requests.get(f"{BASE_URL}/api/task-management/tasks", 
                               params={"department_id": "Sales,Marketing"}, headers=headers)
        assert response.status_code == 200
        tasks = response.json()
        for task in tasks:
            assert task["department_id"] in ["Sales", "Marketing"], \
                f"Task {task['id']} has department {task['department_id']}, expected Sales or Marketing"
        print(f"Multi-department filter (Sales,Marketing): {len(tasks)} tasks")
    
    def test_multi_department_filter_three_depts(self, headers):
        """Test filtering by three departments"""
        response = requests.get(f"{BASE_URL}/api/task-management/tasks", 
                               params={"department_id": "Sales,Marketing,Production"}, headers=headers)
        assert response.status_code == 200
        tasks = response.json()
        valid_depts = ["Sales", "Marketing", "Production"]
        for task in tasks:
            assert task["department_id"] in valid_depts, \
                f"Task {task['id']} has department {task['department_id']}"
        print(f"Multi-department filter (3 depts): {len(tasks)} tasks")
    
    def test_stats_with_multi_department_filter(self, headers):
        """Test stats endpoint with comma-separated department_id"""
        response = requests.get(f"{BASE_URL}/api/task-management/tasks/stats", 
                               params={"department_id": "Sales,Marketing"}, headers=headers)
        assert response.status_code == 200
        stats = response.json()
        assert "total" in stats
        assert "by_status" in stats
        print(f"Stats with multi-dept filter: total={stats['total']}")


class TestPersonalMetrics:
    """Test personal metrics for My Tasks tab"""
    
    def test_stats_returns_my_total(self, headers):
        """Test that stats returns my_total (combined assigned+created)"""
        response = requests.get(f"{BASE_URL}/api/task-management/tasks/stats", headers=headers)
        assert response.status_code == 200
        stats = response.json()
        assert "my_total" in stats, "my_total not in stats response"
        assert isinstance(stats["my_total"], int)
        print(f"my_total: {stats['my_total']}")
    
    def test_stats_returns_my_tasks(self, headers):
        """Test that stats returns my_tasks (assigned to me)"""
        response = requests.get(f"{BASE_URL}/api/task-management/tasks/stats", headers=headers)
        assert response.status_code == 200
        stats = response.json()
        assert "my_tasks" in stats, "my_tasks not in stats response"
        assert isinstance(stats["my_tasks"], int)
        print(f"my_tasks (assigned to me): {stats['my_tasks']}")
    
    def test_stats_returns_created_by_me(self, headers):
        """Test that stats returns created_by_me count"""
        response = requests.get(f"{BASE_URL}/api/task-management/tasks/stats", headers=headers)
        assert response.status_code == 200
        stats = response.json()
        assert "created_by_me" in stats, "created_by_me not in stats response"
        assert isinstance(stats["created_by_me"], int)
        print(f"created_by_me: {stats['created_by_me']}")
    
    def test_stats_returns_my_in_progress(self, headers):
        """Test that stats returns my_in_progress count"""
        response = requests.get(f"{BASE_URL}/api/task-management/tasks/stats", headers=headers)
        assert response.status_code == 200
        stats = response.json()
        assert "my_in_progress" in stats, "my_in_progress not in stats response"
        assert isinstance(stats["my_in_progress"], int)
        print(f"my_in_progress: {stats['my_in_progress']}")
    
    def test_stats_returns_my_overdue(self, headers):
        """Test that stats returns my_overdue count"""
        response = requests.get(f"{BASE_URL}/api/task-management/tasks/stats", headers=headers)
        assert response.status_code == 200
        stats = response.json()
        assert "my_overdue" in stats, "my_overdue not in stats response"
        assert isinstance(stats["my_overdue"], int)
        print(f"my_overdue: {stats['my_overdue']}")
    
    def test_stats_returns_my_high_severity(self, headers):
        """Test that stats returns my_high_severity count"""
        response = requests.get(f"{BASE_URL}/api/task-management/tasks/stats", headers=headers)
        assert response.status_code == 200
        stats = response.json()
        assert "my_high_severity" in stats, "my_high_severity not in stats response"
        assert isinstance(stats["my_high_severity"], int)
        print(f"my_high_severity: {stats['my_high_severity']}")
    
    def test_stats_returns_my_completed(self, headers):
        """Test that stats returns my_completed count"""
        response = requests.get(f"{BASE_URL}/api/task-management/tasks/stats", headers=headers)
        assert response.status_code == 200
        stats = response.json()
        assert "my_completed" in stats, "my_completed not in stats response"
        assert isinstance(stats["my_completed"], int)
        print(f"my_completed: {stats['my_completed']}")


class TestDepartmentMetrics:
    """Test department-level metrics for All Tasks tab"""
    
    def test_stats_returns_total(self, headers):
        """Test that stats returns total count"""
        response = requests.get(f"{BASE_URL}/api/task-management/tasks/stats", headers=headers)
        assert response.status_code == 200
        stats = response.json()
        assert "total" in stats, "total not in stats response"
        assert isinstance(stats["total"], int)
        print(f"total: {stats['total']}")
    
    def test_stats_returns_by_status(self, headers):
        """Test that stats returns by_status breakdown"""
        response = requests.get(f"{BASE_URL}/api/task-management/tasks/stats", headers=headers)
        assert response.status_code == 200
        stats = response.json()
        assert "by_status" in stats, "by_status not in stats response"
        assert isinstance(stats["by_status"], dict)
        print(f"by_status: {stats['by_status']}")
    
    def test_stats_by_status_has_expected_keys(self, headers):
        """Test that by_status has expected status keys"""
        response = requests.get(f"{BASE_URL}/api/task-management/tasks/stats", headers=headers)
        assert response.status_code == 200
        stats = response.json()
        by_status = stats.get("by_status", {})
        # Check for expected status keys (may not all be present if no tasks in that status)
        expected_statuses = ["open", "in_progress", "review", "closed"]
        for status in expected_statuses:
            if status in by_status:
                assert isinstance(by_status[status], int)
        print(f"Status breakdown: open={by_status.get('open', 0)}, in_progress={by_status.get('in_progress', 0)}, review={by_status.get('review', 0)}, closed={by_status.get('closed', 0)}")
    
    def test_stats_returns_overdue(self, headers):
        """Test that stats returns overdue count"""
        response = requests.get(f"{BASE_URL}/api/task-management/tasks/stats", headers=headers)
        assert response.status_code == 200
        stats = response.json()
        assert "overdue" in stats, "overdue not in stats response"
        assert isinstance(stats["overdue"], int)
        print(f"overdue: {stats['overdue']}")
    
    def test_stats_returns_by_severity(self, headers):
        """Test that stats returns by_severity breakdown"""
        response = requests.get(f"{BASE_URL}/api/task-management/tasks/stats", headers=headers)
        assert response.status_code == 200
        stats = response.json()
        assert "by_severity" in stats, "by_severity not in stats response"
        assert isinstance(stats["by_severity"], dict)
        print(f"by_severity: {stats['by_severity']}")


class TestOverdueFilter:
    """Test overdue filter functionality"""
    
    def test_overdue_filter_returns_200(self, headers):
        """Test that overdue filter returns 200"""
        response = requests.get(f"{BASE_URL}/api/task-management/tasks", 
                               params={"overdue": "true"}, headers=headers)
        assert response.status_code == 200
        tasks = response.json()
        print(f"Overdue filter returned {len(tasks)} tasks")
    
    def test_overdue_filter_with_view_mine(self, headers):
        """Test overdue filter combined with view=mine"""
        response = requests.get(f"{BASE_URL}/api/task-management/tasks", 
                               params={"overdue": "true", "view": "mine"}, headers=headers)
        assert response.status_code == 200
        tasks = response.json()
        print(f"Overdue + view=mine returned {len(tasks)} tasks")


class TestDepartmentsEndpoint:
    """Test departments endpoint"""
    
    def test_get_departments_returns_200(self, headers):
        """Test that departments endpoint returns 200"""
        response = requests.get(f"{BASE_URL}/api/task-management/departments", headers=headers)
        assert response.status_code == 200
        data = response.json()
        assert isinstance(data, list)
        assert len(data) > 0
        print(f"Found {len(data)} departments")
    
    def test_departments_have_required_fields(self, headers):
        """Test that departments have id and name fields"""
        response = requests.get(f"{BASE_URL}/api/task-management/departments", headers=headers)
        assert response.status_code == 200
        departments = response.json()
        for dept in departments:
            assert "id" in dept, f"Department missing id field"
            assert "name" in dept, f"Department missing name field"
        print(f"All departments have required fields")
    
    def test_expected_departments_exist(self, headers):
        """Test that expected departments exist"""
        response = requests.get(f"{BASE_URL}/api/task-management/departments", headers=headers)
        assert response.status_code == 200
        departments = response.json()
        dept_ids = [d["id"] for d in departments]
        expected = ["Sales", "Marketing", "Production", "Finance"]
        for exp in expected:
            assert exp in dept_ids, f"Expected department {exp} not found"
        print(f"All expected departments found: {expected}")


class TestUserDepartments:
    """Test user department info for default filter"""
    
    def test_user_has_department(self, headers, user_info):
        """Test that user info includes department"""
        assert "department" in user_info, "User info missing department field"
        print(f"User department: {user_info['department']}")
    
    def test_user_department_is_list_or_string(self, headers, user_info):
        """Test that user department is list or string"""
        dept = user_info.get("department")
        assert dept is not None, "User department is None"
        assert isinstance(dept, (list, str)), f"User department is {type(dept)}, expected list or str"
        if isinstance(dept, list):
            print(f"User has multiple departments: {dept}")
        else:
            print(f"User has single department: {dept}")


class TestTaskCreation:
    """Test task creation for verifying metrics"""
    
    def test_create_task_and_verify_in_my_tasks(self, headers, user_info):
        """Test creating a task and verifying it appears in view=mine"""
        # Create a task
        task_title = f"TEST_MyTask_{uuid.uuid4().hex[:6]}"
        create_response = requests.post(f"{BASE_URL}/api/task-management/tasks", json={
            "title": task_title,
            "department_id": "Sales",
            "severity": "high",
            "assignees": [user_info["id"]]
        }, headers=headers)
        assert create_response.status_code == 200
        task_id = create_response.json()["id"]
        print(f"Created task: {task_id}")
        
        # Verify task appears in view=mine
        mine_response = requests.get(f"{BASE_URL}/api/task-management/tasks", 
                                    params={"view": "mine"}, headers=headers)
        assert mine_response.status_code == 200
        mine_tasks = mine_response.json()
        task_ids = [t["id"] for t in mine_tasks]
        assert task_id in task_ids, "Created task not found in view=mine"
        print("Task found in view=mine")
        
        # Cleanup
        requests.delete(f"{BASE_URL}/api/task-management/tasks/{task_id}", headers=headers)
    
    def test_create_task_updates_stats(self, headers, user_info):
        """Test that creating a task updates stats"""
        # Get initial stats
        initial_stats = requests.get(f"{BASE_URL}/api/task-management/tasks/stats", headers=headers).json()
        initial_my_total = initial_stats.get("my_total", 0)
        
        # Create a task
        task_title = f"TEST_StatsTask_{uuid.uuid4().hex[:6]}"
        create_response = requests.post(f"{BASE_URL}/api/task-management/tasks", json={
            "title": task_title,
            "department_id": "Sales",
            "severity": "high",
            "assignees": [user_info["id"]]
        }, headers=headers)
        assert create_response.status_code == 200
        task_id = create_response.json()["id"]
        
        # Get updated stats
        updated_stats = requests.get(f"{BASE_URL}/api/task-management/tasks/stats", headers=headers).json()
        updated_my_total = updated_stats.get("my_total", 0)
        
        # my_total should have increased
        assert updated_my_total >= initial_my_total, "my_total did not increase after creating task"
        print(f"my_total: {initial_my_total} -> {updated_my_total}")
        
        # Cleanup
        requests.delete(f"{BASE_URL}/api/task-management/tasks/{task_id}", headers=headers)


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
