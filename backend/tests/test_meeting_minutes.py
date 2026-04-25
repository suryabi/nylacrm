"""
Meeting Minutes Module Tests
- CRUD operations for meeting minutes
- Filters: month, year, periodicity, purpose, participant
- Edit history tracking
"""
import pytest
import requests
import os
import uuid
from datetime import datetime

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', '').rstrip('/')

# Test credentials
TEST_EMAIL = "surya.yadavalli@nylaairwater.earth"
TEST_PASSWORD = "test123"
TENANT_ID = "nyla-air-water"


class TestMeetingMinutesModule:
    """Meeting Minutes CRUD and filter tests"""
    
    @pytest.fixture(autouse=True)
    def setup(self):
        """Setup: Login and get auth token"""
        self.session = requests.Session()
        self.session.headers.update({
            "Content-Type": "application/json",
            "X-Tenant-ID": TENANT_ID
        })
        
        # Login
        login_response = self.session.post(f"{BASE_URL}/api/auth/login", json={
            "email": TEST_EMAIL,
            "password": TEST_PASSWORD,
            "tenant_id": TENANT_ID
        })
        assert login_response.status_code == 200, f"Login failed: {login_response.text}"
        
        login_data = login_response.json()
        token = login_data.get("session_token") or login_data.get("token")
        assert token, "No token in login response"
        
        self.session.headers.update({"Authorization": f"Bearer {token}"})
        self.user_id = login_data.get("user", {}).get("id")
        self.user_name = login_data.get("user", {}).get("name")
        
        # Get users list for participant tests
        users_response = self.session.get(f"{BASE_URL}/api/users")
        if users_response.status_code == 200:
            self.users = users_response.json()[:3]  # Get first 3 users
        else:
            self.users = []
        
        yield
        
        # Cleanup: Delete test meetings created during tests
        self._cleanup_test_meetings()
    
    def _cleanup_test_meetings(self):
        """Delete meetings with TEST_ prefix in title"""
        try:
            # Get all meetings for current month
            now = datetime.now()
            response = self.session.get(f"{BASE_URL}/api/meeting-minutes", params={
                "month": now.month,
                "year": now.year
            })
            if response.status_code == 200:
                meetings = response.json()
                for meeting in meetings:
                    if meeting.get("title", "").startswith("TEST_"):
                        self.session.delete(f"{BASE_URL}/api/meeting-minutes/{meeting['id']}")
        except Exception:
            pass
    
    # ==================== CREATE TESTS ====================
    
    def test_create_meeting_basic(self):
        """Test creating a basic meeting with required fields"""
        payload = {
            "date": "2026-04-15",
            "title": "TEST_Basic Meeting",
            "periodicity": "weekly",
            "purpose": ["sales"],
            "participants": [],
            "minutes": ["Discussion point 1", "Discussion point 2"],
            "action_items": []
        }
        
        response = self.session.post(f"{BASE_URL}/api/meeting-minutes", json=payload)
        assert response.status_code == 200, f"Create failed: {response.text}"
        
        data = response.json()
        assert "id" in data, "Response should contain id"
        assert data["date"] == "2026-04-15"
        assert data["title"] == "TEST_Basic Meeting"
        assert data["periodicity"] == "weekly"
        assert data["purpose"] == ["sales"]
        assert len(data["minutes"]) == 2
        assert data["created_by"] is not None
        assert data["created_at"] is not None
        assert data["edit_history"] == []
        
        # Cleanup
        self.session.delete(f"{BASE_URL}/api/meeting-minutes/{data['id']}")
        print("✅ test_create_meeting_basic PASSED")
    
    def test_create_meeting_with_all_fields(self):
        """Test creating a meeting with all fields including action items"""
        participants = [{"id": u["id"], "name": u["name"]} for u in self.users[:2]] if self.users else []
        
        payload = {
            "date": "2026-04-20",
            "title": "TEST_Full Meeting",
            "periodicity": "monthly",
            "purpose": ["sales", "finance", "marketing"],
            "participants": participants,
            "minutes": ["Point 1", "Point 2", "Point 3"],
            "action_items": [
                {
                    "description": "Follow up with client",
                    "assignee_id": self.users[0]["id"] if self.users else "",
                    "assignee_name": self.users[0]["name"] if self.users else "",
                    "due_date": "2026-04-25",
                    "status": "open"
                },
                {
                    "description": "Prepare report",
                    "assignee_id": self.users[1]["id"] if len(self.users) > 1 else "",
                    "assignee_name": self.users[1]["name"] if len(self.users) > 1 else "",
                    "due_date": "2026-04-30",
                    "status": "in_progress"
                }
            ]
        }
        
        response = self.session.post(f"{BASE_URL}/api/meeting-minutes", json=payload)
        assert response.status_code == 200, f"Create failed: {response.text}"
        
        data = response.json()
        assert data["periodicity"] == "monthly"
        assert set(data["purpose"]) == {"sales", "finance", "marketing"}
        assert len(data["participants"]) == len(participants)
        assert len(data["minutes"]) == 3
        assert len(data["action_items"]) == 2
        
        # Verify action items have IDs
        for ai in data["action_items"]:
            assert "id" in ai
            assert ai["status"] in ["open", "in_progress", "done"]
        
        # Cleanup
        self.session.delete(f"{BASE_URL}/api/meeting-minutes/{data['id']}")
        print("✅ test_create_meeting_with_all_fields PASSED")
    
    def test_create_meeting_requires_date(self):
        """Test that date is required"""
        payload = {
            "title": "TEST_No Date Meeting",
            "periodicity": "weekly"
        }
        
        response = self.session.post(f"{BASE_URL}/api/meeting-minutes", json=payload)
        assert response.status_code == 400, f"Expected 400, got {response.status_code}"
        print("✅ test_create_meeting_requires_date PASSED")
    
    def test_create_meeting_invalid_periodicity_defaults_to_adhoc(self):
        """Test that invalid periodicity defaults to adhoc"""
        payload = {
            "date": "2026-04-15",
            "title": "TEST_Invalid Periodicity",
            "periodicity": "invalid_value"
        }
        
        response = self.session.post(f"{BASE_URL}/api/meeting-minutes", json=payload)
        assert response.status_code == 200
        
        data = response.json()
        assert data["periodicity"] == "adhoc"
        
        # Cleanup
        self.session.delete(f"{BASE_URL}/api/meeting-minutes/{data['id']}")
        print("✅ test_create_meeting_invalid_periodicity_defaults_to_adhoc PASSED")
    
    def test_create_meeting_filters_invalid_purpose(self):
        """Test that invalid purpose values are filtered out"""
        payload = {
            "date": "2026-04-15",
            "title": "TEST_Invalid Purpose",
            "purpose": ["sales", "invalid_purpose", "finance"]
        }
        
        response = self.session.post(f"{BASE_URL}/api/meeting-minutes", json=payload)
        assert response.status_code == 200
        
        data = response.json()
        assert "invalid_purpose" not in data["purpose"]
        assert "sales" in data["purpose"]
        assert "finance" in data["purpose"]
        
        # Cleanup
        self.session.delete(f"{BASE_URL}/api/meeting-minutes/{data['id']}")
        print("✅ test_create_meeting_filters_invalid_purpose PASSED")
    
    # ==================== READ TESTS ====================
    
    def test_list_meetings_basic(self):
        """Test listing meetings for current month"""
        # Create a test meeting first
        payload = {
            "date": "2026-04-10",
            "title": "TEST_List Meeting",
            "periodicity": "weekly"
        }
        create_response = self.session.post(f"{BASE_URL}/api/meeting-minutes", json=payload)
        assert create_response.status_code == 200
        created_id = create_response.json()["id"]
        
        # List meetings
        response = self.session.get(f"{BASE_URL}/api/meeting-minutes", params={
            "month": 4,
            "year": 2026
        })
        assert response.status_code == 200
        
        meetings = response.json()
        assert isinstance(meetings, list)
        
        # Verify our test meeting is in the list
        test_meeting = next((m for m in meetings if m["id"] == created_id), None)
        assert test_meeting is not None
        
        # Cleanup
        self.session.delete(f"{BASE_URL}/api/meeting-minutes/{created_id}")
        print("✅ test_list_meetings_basic PASSED")
    
    def test_list_meetings_filter_by_periodicity(self):
        """Test filtering meetings by periodicity"""
        # Create meetings with different periodicities
        weekly_payload = {"date": "2026-04-11", "title": "TEST_Weekly", "periodicity": "weekly"}
        monthly_payload = {"date": "2026-04-12", "title": "TEST_Monthly", "periodicity": "monthly"}
        
        weekly_resp = self.session.post(f"{BASE_URL}/api/meeting-minutes", json=weekly_payload)
        monthly_resp = self.session.post(f"{BASE_URL}/api/meeting-minutes", json=monthly_payload)
        
        weekly_id = weekly_resp.json()["id"]
        monthly_id = monthly_resp.json()["id"]
        
        # Filter by weekly
        response = self.session.get(f"{BASE_URL}/api/meeting-minutes", params={
            "month": 4,
            "year": 2026,
            "periodicity": "weekly"
        })
        assert response.status_code == 200
        
        meetings = response.json()
        # All returned meetings should be weekly
        for m in meetings:
            assert m["periodicity"] == "weekly"
        
        # Cleanup
        self.session.delete(f"{BASE_URL}/api/meeting-minutes/{weekly_id}")
        self.session.delete(f"{BASE_URL}/api/meeting-minutes/{monthly_id}")
        print("✅ test_list_meetings_filter_by_periodicity PASSED")
    
    def test_list_meetings_filter_by_purpose(self):
        """Test filtering meetings by purpose (multi-select)"""
        # Create meetings with different purposes
        sales_payload = {"date": "2026-04-13", "title": "TEST_Sales", "purpose": ["sales"]}
        finance_payload = {"date": "2026-04-14", "title": "TEST_Finance", "purpose": ["finance"]}
        
        sales_resp = self.session.post(f"{BASE_URL}/api/meeting-minutes", json=sales_payload)
        finance_resp = self.session.post(f"{BASE_URL}/api/meeting-minutes", json=finance_payload)
        
        sales_id = sales_resp.json()["id"]
        finance_id = finance_resp.json()["id"]
        
        # Filter by sales purpose
        response = self.session.get(f"{BASE_URL}/api/meeting-minutes", params={
            "month": 4,
            "year": 2026,
            "purpose": "sales"
        })
        assert response.status_code == 200
        
        meetings = response.json()
        # All returned meetings should have sales in purpose
        for m in meetings:
            assert "sales" in m["purpose"]
        
        # Filter by multiple purposes
        response = self.session.get(f"{BASE_URL}/api/meeting-minutes", params={
            "month": 4,
            "year": 2026,
            "purpose": "sales,finance"
        })
        assert response.status_code == 200
        
        # Cleanup
        self.session.delete(f"{BASE_URL}/api/meeting-minutes/{sales_id}")
        self.session.delete(f"{BASE_URL}/api/meeting-minutes/{finance_id}")
        print("✅ test_list_meetings_filter_by_purpose PASSED")
    
    def test_list_meetings_filter_by_participant(self):
        """Test filtering meetings by participant"""
        if not self.users:
            pytest.skip("No users available for participant test")
        
        participant = {"id": self.users[0]["id"], "name": self.users[0]["name"]}
        
        # Create meeting with participant
        payload = {
            "date": "2026-04-15",
            "title": "TEST_With Participant",
            "participants": [participant]
        }
        create_resp = self.session.post(f"{BASE_URL}/api/meeting-minutes", json=payload)
        created_id = create_resp.json()["id"]
        
        # Filter by participant
        response = self.session.get(f"{BASE_URL}/api/meeting-minutes", params={
            "month": 4,
            "year": 2026,
            "participant": participant["id"]
        })
        assert response.status_code == 200
        
        meetings = response.json()
        # All returned meetings should have this participant
        for m in meetings:
            participant_ids = [p["id"] for p in m.get("participants", [])]
            assert participant["id"] in participant_ids
        
        # Cleanup
        self.session.delete(f"{BASE_URL}/api/meeting-minutes/{created_id}")
        print("✅ test_list_meetings_filter_by_participant PASSED")
    
    def test_get_single_meeting(self):
        """Test getting a single meeting by ID"""
        # Create a meeting
        payload = {
            "date": "2026-04-16",
            "title": "TEST_Single Meeting",
            "periodicity": "quarterly",
            "purpose": ["investors"],
            "minutes": ["Important discussion"]
        }
        create_resp = self.session.post(f"{BASE_URL}/api/meeting-minutes", json=payload)
        created_id = create_resp.json()["id"]
        
        # Get single meeting
        response = self.session.get(f"{BASE_URL}/api/meeting-minutes/{created_id}")
        assert response.status_code == 200
        
        data = response.json()
        assert data["id"] == created_id
        assert data["title"] == "TEST_Single Meeting"
        assert data["periodicity"] == "quarterly"
        assert "investors" in data["purpose"]
        
        # Cleanup
        self.session.delete(f"{BASE_URL}/api/meeting-minutes/{created_id}")
        print("✅ test_get_single_meeting PASSED")
    
    def test_get_nonexistent_meeting_returns_404(self):
        """Test getting a non-existent meeting returns 404"""
        fake_id = str(uuid.uuid4())
        response = self.session.get(f"{BASE_URL}/api/meeting-minutes/{fake_id}")
        assert response.status_code == 404
        print("✅ test_get_nonexistent_meeting_returns_404 PASSED")
    
    # ==================== UPDATE TESTS ====================
    
    def test_update_meeting_basic(self):
        """Test updating a meeting"""
        # Create a meeting
        payload = {
            "date": "2026-04-17",
            "title": "TEST_Update Meeting",
            "periodicity": "weekly"
        }
        create_resp = self.session.post(f"{BASE_URL}/api/meeting-minutes", json=payload)
        created_id = create_resp.json()["id"]
        
        # Update the meeting
        update_payload = {
            "title": "TEST_Updated Meeting Title",
            "periodicity": "monthly",
            "purpose": ["production", "general"]
        }
        response = self.session.put(f"{BASE_URL}/api/meeting-minutes/{created_id}", json=update_payload)
        assert response.status_code == 200
        
        data = response.json()
        assert data["title"] == "TEST_Updated Meeting Title"
        assert data["periodicity"] == "monthly"
        assert set(data["purpose"]) == {"production", "general"}
        
        # Cleanup
        self.session.delete(f"{BASE_URL}/api/meeting-minutes/{created_id}")
        print("✅ test_update_meeting_basic PASSED")
    
    def test_update_meeting_adds_edit_history(self):
        """Test that updating a meeting adds an edit history entry"""
        # Create a meeting
        payload = {
            "date": "2026-04-18",
            "title": "TEST_Edit History Meeting"
        }
        create_resp = self.session.post(f"{BASE_URL}/api/meeting-minutes", json=payload)
        created_id = create_resp.json()["id"]
        
        # Verify initial edit_history is empty
        initial = create_resp.json()
        assert initial["edit_history"] == []
        
        # Update the meeting
        update_payload = {"title": "TEST_Edited Title"}
        response = self.session.put(f"{BASE_URL}/api/meeting-minutes/{created_id}", json=update_payload)
        assert response.status_code == 200
        
        data = response.json()
        assert len(data["edit_history"]) == 1
        
        edit_entry = data["edit_history"][0]
        assert "edited_by" in edit_entry
        assert "edited_by_name" in edit_entry
        assert "edited_at" in edit_entry
        
        # Update again and verify history grows
        response2 = self.session.put(f"{BASE_URL}/api/meeting-minutes/{created_id}", json={"title": "TEST_Edited Again"})
        data2 = response2.json()
        assert len(data2["edit_history"]) == 2
        
        # Cleanup
        self.session.delete(f"{BASE_URL}/api/meeting-minutes/{created_id}")
        print("✅ test_update_meeting_adds_edit_history PASSED")
    
    def test_update_meeting_action_items(self):
        """Test updating action items in a meeting"""
        # Create a meeting with action items
        payload = {
            "date": "2026-04-19",
            "title": "TEST_Action Items Meeting",
            "action_items": [
                {"description": "Task 1", "status": "open"}
            ]
        }
        create_resp = self.session.post(f"{BASE_URL}/api/meeting-minutes", json=payload)
        created_id = create_resp.json()["id"]
        original_action_id = create_resp.json()["action_items"][0]["id"]
        
        # Update action items - change status and add new one
        update_payload = {
            "action_items": [
                {"id": original_action_id, "description": "Task 1 Updated", "status": "done"},
                {"description": "Task 2", "status": "open"}
            ]
        }
        response = self.session.put(f"{BASE_URL}/api/meeting-minutes/{created_id}", json=update_payload)
        assert response.status_code == 200
        
        data = response.json()
        assert len(data["action_items"]) == 2
        
        # Verify first task was updated
        task1 = next((a for a in data["action_items"] if a["id"] == original_action_id), None)
        assert task1 is not None
        assert task1["description"] == "Task 1 Updated"
        assert task1["status"] == "done"
        
        # Cleanup
        self.session.delete(f"{BASE_URL}/api/meeting-minutes/{created_id}")
        print("✅ test_update_meeting_action_items PASSED")
    
    def test_update_nonexistent_meeting_returns_404(self):
        """Test updating a non-existent meeting returns 404"""
        fake_id = str(uuid.uuid4())
        response = self.session.put(f"{BASE_URL}/api/meeting-minutes/{fake_id}", json={"title": "Test"})
        assert response.status_code == 404
        print("✅ test_update_nonexistent_meeting_returns_404 PASSED")
    
    # ==================== DELETE TESTS ====================
    
    def test_delete_meeting(self):
        """Test deleting a meeting"""
        # Create a meeting
        payload = {
            "date": "2026-04-20",
            "title": "TEST_Delete Meeting"
        }
        create_resp = self.session.post(f"{BASE_URL}/api/meeting-minutes", json=payload)
        created_id = create_resp.json()["id"]
        
        # Delete the meeting
        response = self.session.delete(f"{BASE_URL}/api/meeting-minutes/{created_id}")
        assert response.status_code == 200
        
        # Verify it's deleted
        get_response = self.session.get(f"{BASE_URL}/api/meeting-minutes/{created_id}")
        assert get_response.status_code == 404
        print("✅ test_delete_meeting PASSED")
    
    def test_delete_nonexistent_meeting_returns_404(self):
        """Test deleting a non-existent meeting returns 404"""
        fake_id = str(uuid.uuid4())
        response = self.session.delete(f"{BASE_URL}/api/meeting-minutes/{fake_id}")
        assert response.status_code == 404
        print("✅ test_delete_nonexistent_meeting_returns_404 PASSED")
    
    # ==================== VALIDATION TESTS ====================
    
    def test_all_valid_periodicities(self):
        """Test all valid periodicity values"""
        valid_periodicities = ["weekly", "monthly", "quarterly", "adhoc"]
        created_ids = []
        
        for i, periodicity in enumerate(valid_periodicities):
            payload = {
                "date": f"2026-04-{21+i}",
                "title": f"TEST_{periodicity.capitalize()} Meeting",
                "periodicity": periodicity
            }
            response = self.session.post(f"{BASE_URL}/api/meeting-minutes", json=payload)
            assert response.status_code == 200, f"Failed for periodicity: {periodicity}"
            assert response.json()["periodicity"] == periodicity
            created_ids.append(response.json()["id"])
        
        # Cleanup
        for cid in created_ids:
            self.session.delete(f"{BASE_URL}/api/meeting-minutes/{cid}")
        print("✅ test_all_valid_periodicities PASSED")
    
    def test_all_valid_purposes(self):
        """Test all valid purpose values"""
        valid_purposes = ["sales", "production", "general", "finance", "administration", "investors", "marketing"]
        
        payload = {
            "date": "2026-04-25",
            "title": "TEST_All Purposes Meeting",
            "purpose": valid_purposes
        }
        response = self.session.post(f"{BASE_URL}/api/meeting-minutes", json=payload)
        assert response.status_code == 200
        
        data = response.json()
        assert set(data["purpose"]) == set(valid_purposes)
        
        # Cleanup
        self.session.delete(f"{BASE_URL}/api/meeting-minutes/{data['id']}")
        print("✅ test_all_valid_purposes PASSED")
    
    def test_all_valid_action_statuses(self):
        """Test all valid action item status values"""
        valid_statuses = ["open", "in_progress", "done"]
        
        payload = {
            "date": "2026-04-26",
            "title": "TEST_All Statuses Meeting",
            "action_items": [
                {"description": f"Task with {status} status", "status": status}
                for status in valid_statuses
            ]
        }
        response = self.session.post(f"{BASE_URL}/api/meeting-minutes", json=payload)
        assert response.status_code == 200
        
        data = response.json()
        statuses_in_response = [ai["status"] for ai in data["action_items"]]
        assert set(statuses_in_response) == set(valid_statuses)
        
        # Cleanup
        self.session.delete(f"{BASE_URL}/api/meeting-minutes/{data['id']}")
        print("✅ test_all_valid_action_statuses PASSED")
    
    def test_invalid_action_status_defaults_to_open(self):
        """Test that invalid action status defaults to open"""
        payload = {
            "date": "2026-04-27",
            "title": "TEST_Invalid Status Meeting",
            "action_items": [
                {"description": "Task with invalid status", "status": "invalid_status"}
            ]
        }
        response = self.session.post(f"{BASE_URL}/api/meeting-minutes", json=payload)
        assert response.status_code == 200
        
        data = response.json()
        assert data["action_items"][0]["status"] == "open"
        
        # Cleanup
        self.session.delete(f"{BASE_URL}/api/meeting-minutes/{data['id']}")
        print("✅ test_invalid_action_status_defaults_to_open PASSED")
    
    # ==================== AUTH TESTS ====================
    
    def test_list_meetings_requires_auth(self):
        """Test that listing meetings requires authentication"""
        no_auth_session = requests.Session()
        no_auth_session.headers.update({
            "Content-Type": "application/json",
            "X-Tenant-ID": TENANT_ID
        })
        
        response = no_auth_session.get(f"{BASE_URL}/api/meeting-minutes", params={
            "month": 4,
            "year": 2026
        })
        assert response.status_code in [401, 403], f"Expected 401/403, got {response.status_code}"
        print("✅ test_list_meetings_requires_auth PASSED")
    
    def test_create_meeting_requires_auth(self):
        """Test that creating a meeting requires authentication"""
        no_auth_session = requests.Session()
        no_auth_session.headers.update({
            "Content-Type": "application/json",
            "X-Tenant-ID": TENANT_ID
        })
        
        payload = {"date": "2026-04-28", "title": "TEST_No Auth"}
        response = no_auth_session.post(f"{BASE_URL}/api/meeting-minutes", json=payload)
        assert response.status_code in [401, 403], f"Expected 401/403, got {response.status_code}"
        print("✅ test_create_meeting_requires_auth PASSED")


if __name__ == "__main__":
    pytest.main([__file__, "-v", "--tb=short"])
