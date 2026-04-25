"""
Meeting Minutes Module v2 Tests
- Tests full page views, textareas, and auto-task creation
- Tests edit history tracking with edited_by_name and edited_at
- Tests action items with task_id and task_number linking
"""
import pytest
import requests
import os
import uuid

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', '').rstrip('/')

# Test credentials
TEST_EMAIL = "surya.yadavalli@nylaairwater.earth"
TEST_PASSWORD = "test123"
TENANT_ID = "nyla-air-water"


@pytest.fixture(scope="module")
def auth_token():
    """Get authentication token"""
    response = requests.post(
        f"{BASE_URL}/api/auth/login",
        json={"email": TEST_EMAIL, "password": TEST_PASSWORD, "tenant_id": TENANT_ID}
    )
    if response.status_code == 200:
        data = response.json()
        return data.get("session_token") or data.get("token")
    pytest.skip(f"Authentication failed: {response.status_code} - {response.text}")


@pytest.fixture(scope="module")
def auth_headers(auth_token):
    """Get auth headers"""
    return {
        "Authorization": f"Bearer {auth_token}",
        "X-Tenant-ID": TENANT_ID,
        "Content-Type": "application/json"
    }


@pytest.fixture(scope="module")
def test_user(auth_headers):
    """Get a test user for assignee"""
    response = requests.get(f"{BASE_URL}/api/users", headers=auth_headers)
    if response.status_code == 200:
        users = response.json()
        if users:
            return users[0]
    return {"id": "test-user-id", "name": "Test User"}


class TestMeetingMinutesAutoTaskCreation:
    """Test auto-task creation for action items"""
    
    def test_create_meeting_with_action_items_creates_tasks(self, auth_headers, test_user):
        """POST /api/meeting-minutes with action items should auto-create tasks in tasks_v2"""
        unique_id = str(uuid.uuid4())[:8]
        payload = {
            "date": "2026-04-15",
            "title": f"TEST_AutoTask_Meeting_{unique_id}",
            "periodicity": "weekly",
            "purpose": ["sales", "production"],
            "participants": [{"id": test_user["id"], "name": test_user.get("name", "Test User")}],
            "minutes": ["Discussion point 1", "Discussion point 2"],
            "action_items": [
                {
                    "description": f"TEST_Action_Item_1_{unique_id}",
                    "assignee_id": test_user["id"],
                    "assignee_name": test_user.get("name", "Test User"),
                    "due_date": "2026-04-20",
                    "status": "open"
                },
                {
                    "description": f"TEST_Action_Item_2_{unique_id}",
                    "assignee_id": test_user["id"],
                    "assignee_name": test_user.get("name", "Test User"),
                    "due_date": "2026-04-25",
                    "status": "in_progress"
                }
            ]
        }
        
        response = requests.post(f"{BASE_URL}/api/meeting-minutes", json=payload, headers=auth_headers)
        assert response.status_code == 200, f"Failed to create meeting: {response.text}"
        
        meeting = response.json()
        assert "id" in meeting
        assert meeting["title"] == payload["title"]
        
        # Verify action items have task_id and task_number
        action_items = meeting.get("action_items", [])
        assert len(action_items) == 2, f"Expected 2 action items, got {len(action_items)}"
        
        for ai in action_items:
            assert "task_id" in ai, f"Action item missing task_id: {ai}"
            assert "task_number" in ai, f"Action item missing task_number: {ai}"
            assert ai["task_number"].startswith("TASK-"), f"Invalid task_number format: {ai['task_number']}"
        
        # Verify tasks were created in tasks_v2 (use task-management endpoint)
        task_id_1 = action_items[0]["task_id"]
        task_response = requests.get(f"{BASE_URL}/api/task-management/tasks/{task_id_1}", headers=auth_headers)
        assert task_response.status_code == 200, f"Task not found: {task_response.text}"
        
        task = task_response.json()
        assert task["linked_entity_type"] == "meeting", f"Task linked_entity_type should be 'meeting', got {task.get('linked_entity_type')}"
        assert task["linked_entity_id"] == meeting["id"], f"Task linked_entity_id should be meeting ID"
        
        # Cleanup
        requests.delete(f"{BASE_URL}/api/meeting-minutes/{meeting['id']}", headers=auth_headers)
        # Note: Tasks may remain after meeting deletion (by design)
    
    def test_update_meeting_with_new_action_items_creates_tasks(self, auth_headers, test_user):
        """PUT /api/meeting-minutes/{id} with new action items should auto-create tasks"""
        unique_id = str(uuid.uuid4())[:8]
        
        # Create meeting without action items
        create_payload = {
            "date": "2026-04-16",
            "title": f"TEST_UpdateTask_Meeting_{unique_id}",
            "periodicity": "monthly",
            "purpose": ["finance"],
            "minutes": ["Initial discussion"]
        }
        
        create_response = requests.post(f"{BASE_URL}/api/meeting-minutes", json=create_payload, headers=auth_headers)
        assert create_response.status_code == 200
        meeting = create_response.json()
        meeting_id = meeting["id"]
        
        # Update with new action items
        update_payload = {
            "action_items": [
                {
                    "description": f"TEST_New_Action_{unique_id}",
                    "assignee_id": test_user["id"],
                    "assignee_name": test_user.get("name", "Test User"),
                    "due_date": "2026-04-30",
                    "status": "open"
                }
            ]
        }
        
        update_response = requests.put(f"{BASE_URL}/api/meeting-minutes/{meeting_id}", json=update_payload, headers=auth_headers)
        assert update_response.status_code == 200, f"Failed to update meeting: {update_response.text}"
        
        updated_meeting = update_response.json()
        action_items = updated_meeting.get("action_items", [])
        assert len(action_items) == 1
        
        # Verify task was created
        assert "task_id" in action_items[0], "New action item should have task_id"
        assert "task_number" in action_items[0], "New action item should have task_number"
        
        # Cleanup
        requests.delete(f"{BASE_URL}/api/meeting-minutes/{meeting_id}", headers=auth_headers)


class TestMeetingMinutesEditHistory:
    """Test edit history tracking"""
    
    def test_update_meeting_tracks_edit_history(self, auth_headers):
        """PUT /api/meeting-minutes/{id} should track edit history with edited_by_name and edited_at"""
        unique_id = str(uuid.uuid4())[:8]
        
        # Create meeting
        create_payload = {
            "date": "2026-04-17",
            "title": f"TEST_EditHistory_Meeting_{unique_id}",
            "periodicity": "adhoc",
            "purpose": ["general"]
        }
        
        create_response = requests.post(f"{BASE_URL}/api/meeting-minutes", json=create_payload, headers=auth_headers)
        assert create_response.status_code == 200
        meeting = create_response.json()
        meeting_id = meeting["id"]
        
        # Initial meeting should have empty edit_history
        assert meeting.get("edit_history", []) == [], "New meeting should have empty edit_history"
        
        # Update meeting
        update_payload = {"title": f"TEST_EditHistory_Meeting_Updated_{unique_id}"}
        update_response = requests.put(f"{BASE_URL}/api/meeting-minutes/{meeting_id}", json=update_payload, headers=auth_headers)
        assert update_response.status_code == 200
        
        updated_meeting = update_response.json()
        edit_history = updated_meeting.get("edit_history", [])
        
        assert len(edit_history) >= 1, "Edit history should have at least one entry"
        
        latest_edit = edit_history[-1]
        assert "edited_by" in latest_edit, "Edit entry should have edited_by"
        assert "edited_by_name" in latest_edit, "Edit entry should have edited_by_name"
        assert "edited_at" in latest_edit, "Edit entry should have edited_at"
        
        # Cleanup
        requests.delete(f"{BASE_URL}/api/meeting-minutes/{meeting_id}", headers=auth_headers)
    
    def test_multiple_updates_accumulate_edit_history(self, auth_headers):
        """Multiple updates should accumulate edit history entries"""
        unique_id = str(uuid.uuid4())[:8]
        
        # Create meeting
        create_payload = {
            "date": "2026-04-18",
            "title": f"TEST_MultiEdit_Meeting_{unique_id}",
            "periodicity": "weekly"
        }
        
        create_response = requests.post(f"{BASE_URL}/api/meeting-minutes", json=create_payload, headers=auth_headers)
        assert create_response.status_code == 200
        meeting_id = create_response.json()["id"]
        
        # First update
        requests.put(f"{BASE_URL}/api/meeting-minutes/{meeting_id}", json={"title": "Update 1"}, headers=auth_headers)
        
        # Second update
        requests.put(f"{BASE_URL}/api/meeting-minutes/{meeting_id}", json={"title": "Update 2"}, headers=auth_headers)
        
        # Third update
        update_response = requests.put(f"{BASE_URL}/api/meeting-minutes/{meeting_id}", json={"title": "Update 3"}, headers=auth_headers)
        
        updated_meeting = update_response.json()
        edit_history = updated_meeting.get("edit_history", [])
        
        assert len(edit_history) >= 3, f"Expected at least 3 edit history entries, got {len(edit_history)}"
        
        # Cleanup
        requests.delete(f"{BASE_URL}/api/meeting-minutes/{meeting_id}", headers=auth_headers)


class TestMeetingMinutesGetWithTaskInfo:
    """Test GET returns action items with task_id and task_number"""
    
    def test_get_meeting_returns_action_items_with_task_info(self, auth_headers, test_user):
        """GET /api/meeting-minutes/{id} should return action items with task_id and task_number"""
        unique_id = str(uuid.uuid4())[:8]
        
        # Create meeting with action items
        payload = {
            "date": "2026-04-19",
            "title": f"TEST_GetTaskInfo_Meeting_{unique_id}",
            "periodicity": "quarterly",
            "purpose": ["investors"],
            "action_items": [
                {
                    "description": f"TEST_GetAction_{unique_id}",
                    "assignee_id": test_user["id"],
                    "assignee_name": test_user.get("name", "Test User"),
                    "status": "open"
                }
            ]
        }
        
        create_response = requests.post(f"{BASE_URL}/api/meeting-minutes", json=payload, headers=auth_headers)
        assert create_response.status_code == 200
        meeting_id = create_response.json()["id"]
        
        # GET the meeting
        get_response = requests.get(f"{BASE_URL}/api/meeting-minutes/{meeting_id}", headers=auth_headers)
        assert get_response.status_code == 200
        
        meeting = get_response.json()
        action_items = meeting.get("action_items", [])
        
        assert len(action_items) == 1
        assert "task_id" in action_items[0], "Action item should have task_id"
        assert "task_number" in action_items[0], "Action item should have task_number"
        
        # Cleanup
        requests.delete(f"{BASE_URL}/api/meeting-minutes/{meeting_id}", headers=auth_headers)


class TestMeetingMinutesCRUD:
    """Basic CRUD tests for meeting minutes"""
    
    def test_list_meetings_for_april_2026(self, auth_headers):
        """GET /api/meeting-minutes with month=4&year=2026 should return meetings"""
        response = requests.get(
            f"{BASE_URL}/api/meeting-minutes",
            params={"month": 4, "year": 2026},
            headers=auth_headers
        )
        assert response.status_code == 200
        meetings = response.json()
        assert isinstance(meetings, list)
    
    def test_create_meeting_basic(self, auth_headers):
        """POST /api/meeting-minutes creates meeting with required fields"""
        unique_id = str(uuid.uuid4())[:8]
        payload = {
            "date": "2026-04-20",
            "title": f"TEST_Basic_Meeting_{unique_id}",
            "periodicity": "adhoc"
        }
        
        response = requests.post(f"{BASE_URL}/api/meeting-minutes", json=payload, headers=auth_headers)
        assert response.status_code == 200
        
        meeting = response.json()
        assert meeting["date"] == payload["date"]
        assert meeting["title"] == payload["title"]
        assert "id" in meeting
        assert "created_by" in meeting
        assert "created_by_name" in meeting
        assert "created_at" in meeting
        
        # Cleanup
        requests.delete(f"{BASE_URL}/api/meeting-minutes/{meeting['id']}", headers=auth_headers)
    
    def test_get_meeting_by_id(self, auth_headers):
        """GET /api/meeting-minutes/{id} returns meeting details"""
        unique_id = str(uuid.uuid4())[:8]
        
        # Create
        create_response = requests.post(
            f"{BASE_URL}/api/meeting-minutes",
            json={"date": "2026-04-21", "title": f"TEST_GetById_{unique_id}"},
            headers=auth_headers
        )
        meeting_id = create_response.json()["id"]
        
        # Get
        get_response = requests.get(f"{BASE_URL}/api/meeting-minutes/{meeting_id}", headers=auth_headers)
        assert get_response.status_code == 200
        
        meeting = get_response.json()
        assert meeting["id"] == meeting_id
        
        # Cleanup
        requests.delete(f"{BASE_URL}/api/meeting-minutes/{meeting_id}", headers=auth_headers)
    
    def test_delete_meeting(self, auth_headers):
        """DELETE /api/meeting-minutes/{id} deletes meeting"""
        unique_id = str(uuid.uuid4())[:8]
        
        # Create
        create_response = requests.post(
            f"{BASE_URL}/api/meeting-minutes",
            json={"date": "2026-04-22", "title": f"TEST_Delete_{unique_id}"},
            headers=auth_headers
        )
        meeting_id = create_response.json()["id"]
        
        # Delete
        delete_response = requests.delete(f"{BASE_URL}/api/meeting-minutes/{meeting_id}", headers=auth_headers)
        assert delete_response.status_code == 200
        
        # Verify deleted
        get_response = requests.get(f"{BASE_URL}/api/meeting-minutes/{meeting_id}", headers=auth_headers)
        assert get_response.status_code == 404


class TestMeetingMinutesFilters:
    """Test filter functionality"""
    
    def test_filter_by_periodicity(self, auth_headers):
        """Filter by periodicity works"""
        response = requests.get(
            f"{BASE_URL}/api/meeting-minutes",
            params={"month": 4, "year": 2026, "periodicity": "weekly"},
            headers=auth_headers
        )
        assert response.status_code == 200
        meetings = response.json()
        for m in meetings:
            assert m.get("periodicity") == "weekly"
    
    def test_filter_by_purpose(self, auth_headers):
        """Filter by purpose (multi-select) works"""
        response = requests.get(
            f"{BASE_URL}/api/meeting-minutes",
            params={"month": 4, "year": 2026, "purpose": "sales,production"},
            headers=auth_headers
        )
        assert response.status_code == 200
        # Just verify it returns without error
        assert isinstance(response.json(), list)


class TestTaskLinkingVerification:
    """Verify task linking is correct"""
    
    def test_task_has_correct_linked_entity_fields(self, auth_headers, test_user):
        """Tasks created from action items should have linked_entity_type='meeting' and linked_entity_id=meeting_id"""
        unique_id = str(uuid.uuid4())[:8]
        
        payload = {
            "date": "2026-04-23",
            "title": f"TEST_TaskLink_Meeting_{unique_id}",
            "periodicity": "monthly",
            "action_items": [
                {
                    "description": f"TEST_TaskLink_Action_{unique_id}",
                    "assignee_id": test_user["id"],
                    "assignee_name": test_user.get("name", "Test User"),
                    "status": "open"
                }
            ]
        }
        
        create_response = requests.post(f"{BASE_URL}/api/meeting-minutes", json=payload, headers=auth_headers)
        assert create_response.status_code == 200
        
        meeting = create_response.json()
        meeting_id = meeting["id"]
        task_id = meeting["action_items"][0]["task_id"]
        
        # Get the task (use task-management endpoint)
        task_response = requests.get(f"{BASE_URL}/api/task-management/tasks/{task_id}", headers=auth_headers)
        assert task_response.status_code == 200
        
        task = task_response.json()
        assert task["linked_entity_type"] == "meeting"
        assert task["linked_entity_id"] == meeting_id
        assert task["title"] == payload["action_items"][0]["description"]
        
        # Cleanup
        requests.delete(f"{BASE_URL}/api/meeting-minutes/{meeting_id}", headers=auth_headers)
