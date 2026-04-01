"""
Test Task Management Module APIs
- Labels CRUD (admin only)
- Milestones CRUD (admin only)
- Tasks CRUD with department visibility
- Comments and Activity
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


class TestLabelsAPI:
    """Test Labels CRUD operations"""
    
    def test_get_labels(self, headers):
        """Test getting all labels"""
        response = requests.get(f"{BASE_URL}/api/task-management/labels", headers=headers)
        assert response.status_code == 200
        data = response.json()
        assert isinstance(data, list)
        print(f"Found {len(data)} labels")
    
    def test_create_label(self, headers):
        """Test creating a new label (admin only)"""
        label_name = f"TEST_Label_{uuid.uuid4().hex[:6]}"
        payload = {
            "name": label_name,
            "color": "#ef4444",
            "description": "Test label for automated testing"
        }
        response = requests.post(f"{BASE_URL}/api/task-management/labels", json=payload, headers=headers)
        assert response.status_code == 200, f"Failed to create label: {response.text}"
        data = response.json()
        assert data["name"] == label_name
        assert data["color"] == "#ef4444"
        assert "id" in data
        print(f"Created label: {data['name']} with id: {data['id']}")
        return data["id"]
    
    def test_update_label(self, headers):
        """Test updating a label"""
        # First create a label
        label_name = f"TEST_Update_{uuid.uuid4().hex[:6]}"
        create_response = requests.post(f"{BASE_URL}/api/task-management/labels", json={
            "name": label_name,
            "color": "#3b82f6"
        }, headers=headers)
        assert create_response.status_code == 200
        label_id = create_response.json()["id"]
        
        # Update the label
        update_response = requests.put(f"{BASE_URL}/api/task-management/labels/{label_id}", json={
            "name": f"{label_name}_Updated",
            "color": "#10b981"
        }, headers=headers)
        assert update_response.status_code == 200
        updated = update_response.json()
        assert updated["color"] == "#10b981"
        print(f"Updated label: {updated['name']}")
        
        # Cleanup
        requests.delete(f"{BASE_URL}/api/task-management/labels/{label_id}", headers=headers)
    
    def test_delete_label(self, headers):
        """Test deleting a label"""
        # Create a label to delete
        label_name = f"TEST_Delete_{uuid.uuid4().hex[:6]}"
        create_response = requests.post(f"{BASE_URL}/api/task-management/labels", json={
            "name": label_name,
            "color": "#f59e0b"
        }, headers=headers)
        assert create_response.status_code == 200
        label_id = create_response.json()["id"]
        
        # Delete the label
        delete_response = requests.delete(f"{BASE_URL}/api/task-management/labels/{label_id}", headers=headers)
        assert delete_response.status_code == 200
        print(f"Deleted label: {label_name}")
        
        # Verify deletion
        get_response = requests.get(f"{BASE_URL}/api/task-management/labels", headers=headers)
        labels = get_response.json()
        assert not any(l["id"] == label_id for l in labels)


class TestMilestonesAPI:
    """Test Milestones CRUD operations"""
    
    def test_get_milestones(self, headers):
        """Test getting all milestones"""
        response = requests.get(f"{BASE_URL}/api/task-management/milestones", headers=headers)
        assert response.status_code == 200
        data = response.json()
        assert isinstance(data, list)
        print(f"Found {len(data)} milestones")
        # Check milestone structure
        if data:
            milestone = data[0]
            assert "id" in milestone
            assert "title" in milestone
            print(f"First milestone: {milestone['title']}")
    
    def test_create_milestone(self, headers):
        """Test creating a new milestone (admin only)"""
        milestone_title = f"TEST_Milestone_{uuid.uuid4().hex[:6]}"
        payload = {
            "title": milestone_title,
            "description": "Test milestone for automated testing",
            "due_date": "2026-03-31"
        }
        response = requests.post(f"{BASE_URL}/api/task-management/milestones", json=payload, headers=headers)
        assert response.status_code == 200, f"Failed to create milestone: {response.text}"
        data = response.json()
        assert data["title"] == milestone_title
        assert data["status"] == "open"
        assert "id" in data
        print(f"Created milestone: {data['title']} with id: {data['id']}")
        return data["id"]
    
    def test_update_milestone(self, headers):
        """Test updating a milestone"""
        # First create a milestone
        milestone_title = f"TEST_MilestoneUpdate_{uuid.uuid4().hex[:6]}"
        create_response = requests.post(f"{BASE_URL}/api/task-management/milestones", json={
            "title": milestone_title,
            "due_date": "2026-04-30"
        }, headers=headers)
        assert create_response.status_code == 200
        milestone_id = create_response.json()["id"]
        
        # Update the milestone
        update_response = requests.put(f"{BASE_URL}/api/task-management/milestones/{milestone_id}", json={
            "title": f"{milestone_title}_Updated",
            "description": "Updated description"
        }, headers=headers)
        assert update_response.status_code == 200
        updated = update_response.json()
        assert "Updated" in updated["title"]
        print(f"Updated milestone: {updated['title']}")
        
        # Cleanup
        requests.delete(f"{BASE_URL}/api/task-management/milestones/{milestone_id}", headers=headers)
    
    def test_delete_milestone(self, headers):
        """Test deleting a milestone"""
        # Create a milestone to delete
        milestone_title = f"TEST_MilestoneDelete_{uuid.uuid4().hex[:6]}"
        create_response = requests.post(f"{BASE_URL}/api/task-management/milestones", json={
            "title": milestone_title
        }, headers=headers)
        assert create_response.status_code == 200
        milestone_id = create_response.json()["id"]
        
        # Delete the milestone
        delete_response = requests.delete(f"{BASE_URL}/api/task-management/milestones/{milestone_id}", headers=headers)
        assert delete_response.status_code == 200
        print(f"Deleted milestone: {milestone_title}")


class TestTasksAPI:
    """Test Tasks CRUD operations"""
    
    def test_get_tasks(self, headers):
        """Test getting all tasks"""
        response = requests.get(f"{BASE_URL}/api/task-management/tasks", headers=headers)
        assert response.status_code == 200
        data = response.json()
        assert isinstance(data, list)
        print(f"Found {len(data)} tasks")
    
    def test_get_task_stats(self, headers):
        """Test getting task statistics"""
        response = requests.get(f"{BASE_URL}/api/task-management/tasks/stats", headers=headers)
        assert response.status_code == 200
        data = response.json()
        assert "by_status" in data
        assert "by_severity" in data
        assert "total" in data
        print(f"Task stats: {data}")
    
    def test_create_task(self, headers, user_info):
        """Test creating a new task"""
        task_title = f"TEST_Task_{uuid.uuid4().hex[:6]}"
        payload = {
            "title": task_title,
            "description": "Test task for automated testing",
            "severity": "high",
            "status": "open",
            "department_id": "Sales",
            "assignees": [user_info["id"]],
            "due_date": "2026-02-28"
        }
        response = requests.post(f"{BASE_URL}/api/task-management/tasks", json=payload, headers=headers)
        assert response.status_code == 200, f"Failed to create task: {response.text}"
        data = response.json()
        assert data["title"] == task_title
        assert data["severity"] == "high"
        assert data["status"] == "open"
        assert "task_number" in data
        assert "id" in data
        print(f"Created task: {data['task_number']} - {data['title']}")
        return data["id"]
    
    def test_get_single_task(self, headers, user_info):
        """Test getting a single task with full details"""
        # First create a task
        task_title = f"TEST_SingleTask_{uuid.uuid4().hex[:6]}"
        create_response = requests.post(f"{BASE_URL}/api/task-management/tasks", json={
            "title": task_title,
            "department_id": "Sales",
            "severity": "medium"
        }, headers=headers)
        assert create_response.status_code == 200
        task_id = create_response.json()["id"]
        
        # Get the task
        get_response = requests.get(f"{BASE_URL}/api/task-management/tasks/{task_id}", headers=headers)
        assert get_response.status_code == 200
        task = get_response.json()
        assert task["title"] == task_title
        assert "comments" in task
        assert "activities" in task
        print(f"Got task: {task['task_number']} with {len(task.get('activities', []))} activities")
        
        # Cleanup
        requests.delete(f"{BASE_URL}/api/task-management/tasks/{task_id}", headers=headers)
    
    def test_update_task_status(self, headers):
        """Test updating task status"""
        # Create a task
        task_title = f"TEST_StatusUpdate_{uuid.uuid4().hex[:6]}"
        create_response = requests.post(f"{BASE_URL}/api/task-management/tasks", json={
            "title": task_title,
            "department_id": "Sales",
            "status": "open"
        }, headers=headers)
        assert create_response.status_code == 200
        task_id = create_response.json()["id"]
        
        # Update status to in_progress
        update_response = requests.put(f"{BASE_URL}/api/task-management/tasks/{task_id}", json={
            "status": "in_progress"
        }, headers=headers)
        assert update_response.status_code == 200
        updated = update_response.json()
        assert updated["status"] == "in_progress"
        print(f"Updated task status to: {updated['status']}")
        
        # Update status to review
        update_response2 = requests.put(f"{BASE_URL}/api/task-management/tasks/{task_id}", json={
            "status": "review"
        }, headers=headers)
        assert update_response2.status_code == 200
        assert update_response2.json()["status"] == "review"
        
        # Update status to closed
        update_response3 = requests.put(f"{BASE_URL}/api/task-management/tasks/{task_id}", json={
            "status": "closed"
        }, headers=headers)
        assert update_response3.status_code == 200
        assert update_response3.json()["status"] == "closed"
        print("Task status workflow: open -> in_progress -> review -> closed PASSED")
        
        # Cleanup
        requests.delete(f"{BASE_URL}/api/task-management/tasks/{task_id}", headers=headers)
    
    def test_delete_task(self, headers):
        """Test deleting a task"""
        # Create a task to delete
        task_title = f"TEST_DeleteTask_{uuid.uuid4().hex[:6]}"
        create_response = requests.post(f"{BASE_URL}/api/task-management/tasks", json={
            "title": task_title,
            "department_id": "Sales"
        }, headers=headers)
        assert create_response.status_code == 200
        task_id = create_response.json()["id"]
        
        # Delete the task
        delete_response = requests.delete(f"{BASE_URL}/api/task-management/tasks/{task_id}", headers=headers)
        assert delete_response.status_code == 200
        print(f"Deleted task: {task_title}")
        
        # Verify deletion
        get_response = requests.get(f"{BASE_URL}/api/task-management/tasks/{task_id}", headers=headers)
        assert get_response.status_code == 404


class TestTaskFilters:
    """Test task filtering functionality"""
    
    def test_filter_by_department(self, headers):
        """Test filtering tasks by department"""
        response = requests.get(f"{BASE_URL}/api/task-management/tasks", 
                               params={"department_id": "Sales"}, headers=headers)
        assert response.status_code == 200
        tasks = response.json()
        print(f"Found {len(tasks)} tasks in Sales department")
    
    def test_filter_by_severity(self, headers):
        """Test filtering tasks by severity"""
        response = requests.get(f"{BASE_URL}/api/task-management/tasks", 
                               params={"severity": "high"}, headers=headers)
        assert response.status_code == 200
        tasks = response.json()
        for task in tasks:
            assert task["severity"] == "high"
        print(f"Found {len(tasks)} high severity tasks")
    
    def test_filter_by_status(self, headers):
        """Test filtering tasks by status"""
        response = requests.get(f"{BASE_URL}/api/task-management/tasks", 
                               params={"status": "open"}, headers=headers)
        assert response.status_code == 200
        tasks = response.json()
        for task in tasks:
            assert task["status"] == "open"
        print(f"Found {len(tasks)} open tasks")


class TestCommentsAPI:
    """Test task comments functionality"""
    
    def test_add_comment(self, headers):
        """Test adding a comment to a task"""
        # Create a task
        task_title = f"TEST_CommentTask_{uuid.uuid4().hex[:6]}"
        create_response = requests.post(f"{BASE_URL}/api/task-management/tasks", json={
            "title": task_title,
            "department_id": "Sales"
        }, headers=headers)
        assert create_response.status_code == 200
        task_id = create_response.json()["id"]
        
        # Add a comment
        comment_response = requests.post(f"{BASE_URL}/api/task-management/tasks/{task_id}/comments", json={
            "content": "This is a test comment",
            "mentions": []
        }, headers=headers)
        assert comment_response.status_code == 200
        comment = comment_response.json()
        assert comment["content"] == "This is a test comment"
        assert "id" in comment
        print(f"Added comment to task: {comment['id']}")
        
        # Verify comment appears in task
        get_response = requests.get(f"{BASE_URL}/api/task-management/tasks/{task_id}", headers=headers)
        task = get_response.json()
        assert len(task["comments"]) > 0
        
        # Cleanup
        requests.delete(f"{BASE_URL}/api/task-management/tasks/{task_id}", headers=headers)


class TestDepartmentsAPI:
    """Test departments endpoint"""
    
    def test_get_departments(self, headers):
        """Test getting list of departments"""
        response = requests.get(f"{BASE_URL}/api/task-management/departments", headers=headers)
        assert response.status_code == 200
        data = response.json()
        assert isinstance(data, list)
        assert len(data) > 0
        # Check structure
        dept = data[0]
        assert "id" in dept
        assert "name" in dept
        print(f"Found {len(data)} departments: {[d['name'] for d in data]}")


class TestWatchAPI:
    """Test task watch/unwatch functionality"""
    
    def test_watch_unwatch_task(self, headers):
        """Test watching and unwatching a task"""
        # Create a task
        task_title = f"TEST_WatchTask_{uuid.uuid4().hex[:6]}"
        create_response = requests.post(f"{BASE_URL}/api/task-management/tasks", json={
            "title": task_title,
            "department_id": "Sales"
        }, headers=headers)
        assert create_response.status_code == 200
        task_id = create_response.json()["id"]
        
        # Watch the task (creator is auto-watching, so unwatch first)
        unwatch_response = requests.delete(f"{BASE_URL}/api/task-management/tasks/{task_id}/watch", headers=headers)
        assert unwatch_response.status_code == 200
        print("Unwatched task")
        
        # Watch again
        watch_response = requests.post(f"{BASE_URL}/api/task-management/tasks/{task_id}/watch", headers=headers)
        assert watch_response.status_code == 200
        print("Watched task again")
        
        # Cleanup
        requests.delete(f"{BASE_URL}/api/task-management/tasks/{task_id}", headers=headers)


# Cleanup test data after all tests
@pytest.fixture(scope="module", autouse=True)
def cleanup_test_data(headers):
    """Cleanup TEST_ prefixed data after tests"""
    yield
    # Cleanup labels
    labels_response = requests.get(f"{BASE_URL}/api/task-management/labels", headers=headers)
    if labels_response.status_code == 200:
        for label in labels_response.json():
            if label["name"].startswith("TEST_"):
                requests.delete(f"{BASE_URL}/api/task-management/labels/{label['id']}", headers=headers)
    
    # Cleanup milestones
    milestones_response = requests.get(f"{BASE_URL}/api/task-management/milestones", headers=headers)
    if milestones_response.status_code == 200:
        for milestone in milestones_response.json():
            if milestone["title"].startswith("TEST_"):
                requests.delete(f"{BASE_URL}/api/task-management/milestones/{milestone['id']}", headers=headers)
    
    # Cleanup tasks
    tasks_response = requests.get(f"{BASE_URL}/api/task-management/tasks", headers=headers)
    if tasks_response.status_code == 200:
        for task in tasks_response.json():
            if task["title"].startswith("TEST_"):
                requests.delete(f"{BASE_URL}/api/task-management/tasks/{task['id']}", headers=headers)
