"""
Marketing Comments API Tests
Tests for the comments feature on Marketing Posts and Events.
Endpoints tested:
- GET /api/marketing/comments/{entity_type}/{entity_id} - Get comments for post/event
- POST /api/marketing/comments/{entity_type}/{entity_id} - Add comment to post/event
- DELETE /api/marketing/comments/{comment_id} - Delete comment (author only)
"""

import pytest
import requests
import os
import uuid

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', '').rstrip('/')

# Test credentials
TEST_EMAIL = "surya.yadavalli@nylaairwater.earth"
TEST_PASSWORD = "test123"
TEST_TENANT_ID = "nyla-air-water"

# Known test IDs from the context
TEST_EVENT_ID = "7e26e41d-653c-4685-b748-eb76a8208872"
TEST_POST_ID = "c3a6b8d5-5e81-4060-ac99-7f2cb8f8005b"


@pytest.fixture(scope="module")
def auth_token():
    """Get authentication token"""
    response = requests.post(f"{BASE_URL}/api/auth/login", json={
        "email": TEST_EMAIL,
        "password": TEST_PASSWORD,
        "tenant_id": TEST_TENANT_ID
    })
    assert response.status_code == 200, f"Login failed: {response.text}"
    data = response.json()
    # App uses 'session_token' not 'token'
    token = data.get("session_token") or data.get("token")
    assert token, f"No token in response: {data}"
    return token


@pytest.fixture(scope="module")
def auth_headers(auth_token):
    """Get auth headers"""
    return {"Authorization": f"Bearer {auth_token}"}


class TestGetCommentsForEvent:
    """Test GET /api/marketing/comments/event/{event_id}"""
    
    def test_get_event_comments_returns_200(self, auth_headers):
        """GET comments for event returns 200"""
        response = requests.get(
            f"{BASE_URL}/api/marketing/comments/event/{TEST_EVENT_ID}",
            headers=auth_headers
        )
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
    
    def test_get_event_comments_returns_list(self, auth_headers):
        """GET comments for event returns a list"""
        response = requests.get(
            f"{BASE_URL}/api/marketing/comments/event/{TEST_EVENT_ID}",
            headers=auth_headers
        )
        assert response.status_code == 200
        data = response.json()
        assert isinstance(data, list), f"Expected list, got {type(data)}"
    
    def test_event_comments_have_required_fields(self, auth_headers):
        """Comments have required fields: id, content, created_by, created_by_name, created_at"""
        response = requests.get(
            f"{BASE_URL}/api/marketing/comments/event/{TEST_EVENT_ID}",
            headers=auth_headers
        )
        assert response.status_code == 200
        data = response.json()
        if len(data) > 0:
            comment = data[0]
            assert "id" in comment, "Comment missing 'id'"
            assert "content" in comment, "Comment missing 'content'"
            assert "created_by" in comment, "Comment missing 'created_by'"
            assert "created_by_name" in comment, "Comment missing 'created_by_name'"
            assert "created_at" in comment, "Comment missing 'created_at'"


class TestGetCommentsForPost:
    """Test GET /api/marketing/comments/post/{post_id}"""
    
    def test_get_post_comments_returns_200(self, auth_headers):
        """GET comments for post returns 200"""
        response = requests.get(
            f"{BASE_URL}/api/marketing/comments/post/{TEST_POST_ID}",
            headers=auth_headers
        )
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
    
    def test_get_post_comments_returns_list(self, auth_headers):
        """GET comments for post returns a list"""
        response = requests.get(
            f"{BASE_URL}/api/marketing/comments/post/{TEST_POST_ID}",
            headers=auth_headers
        )
        assert response.status_code == 200
        data = response.json()
        assert isinstance(data, list), f"Expected list, got {type(data)}"


class TestInvalidEntityType:
    """Test invalid entity_type returns 400"""
    
    def test_invalid_entity_type_get_returns_400(self, auth_headers):
        """GET with invalid entity_type returns 400"""
        response = requests.get(
            f"{BASE_URL}/api/marketing/comments/invalid/{TEST_EVENT_ID}",
            headers=auth_headers
        )
        assert response.status_code == 400, f"Expected 400, got {response.status_code}: {response.text}"
    
    def test_invalid_entity_type_post_returns_400(self, auth_headers):
        """POST with invalid entity_type returns 400"""
        response = requests.post(
            f"{BASE_URL}/api/marketing/comments/invalid/{TEST_EVENT_ID}",
            headers=auth_headers,
            json={"content": "Test comment"}
        )
        assert response.status_code == 400, f"Expected 400, got {response.status_code}: {response.text}"


class TestAddCommentToEvent:
    """Test POST /api/marketing/comments/event/{event_id}"""
    
    def test_add_event_comment_returns_200(self, auth_headers):
        """POST comment to event returns 200"""
        response = requests.post(
            f"{BASE_URL}/api/marketing/comments/event/{TEST_EVENT_ID}",
            headers=auth_headers,
            json={"content": f"TEST_Comment_{uuid.uuid4().hex[:8]}"}
        )
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
    
    def test_add_event_comment_returns_comment_data(self, auth_headers):
        """POST comment returns the created comment with all fields"""
        content = f"TEST_Comment_{uuid.uuid4().hex[:8]}"
        response = requests.post(
            f"{BASE_URL}/api/marketing/comments/event/{TEST_EVENT_ID}",
            headers=auth_headers,
            json={"content": content}
        )
        assert response.status_code == 200
        data = response.json()
        assert "id" in data, "Response missing 'id'"
        assert data["content"] == content, f"Content mismatch: {data['content']} != {content}"
        assert "created_by" in data, "Response missing 'created_by'"
        assert "created_by_name" in data, "Response missing 'created_by_name'"
        assert "created_at" in data, "Response missing 'created_at'"
        assert data["entity_type"] == "event", f"entity_type should be 'event', got {data.get('entity_type')}"
        assert data["entity_id"] == TEST_EVENT_ID, f"entity_id mismatch"
    
    def test_add_event_comment_persists(self, auth_headers):
        """POST comment is persisted and can be retrieved via GET"""
        content = f"TEST_Persist_{uuid.uuid4().hex[:8]}"
        # Create comment
        create_response = requests.post(
            f"{BASE_URL}/api/marketing/comments/event/{TEST_EVENT_ID}",
            headers=auth_headers,
            json={"content": content}
        )
        assert create_response.status_code == 200
        created_comment = create_response.json()
        comment_id = created_comment["id"]
        
        # Verify via GET
        get_response = requests.get(
            f"{BASE_URL}/api/marketing/comments/event/{TEST_EVENT_ID}",
            headers=auth_headers
        )
        assert get_response.status_code == 200
        comments = get_response.json()
        found = any(c["id"] == comment_id for c in comments)
        assert found, f"Created comment {comment_id} not found in GET response"


class TestAddCommentToPost:
    """Test POST /api/marketing/comments/post/{post_id}"""
    
    def test_add_post_comment_returns_200(self, auth_headers):
        """POST comment to post returns 200"""
        response = requests.post(
            f"{BASE_URL}/api/marketing/comments/post/{TEST_POST_ID}",
            headers=auth_headers,
            json={"content": f"TEST_PostComment_{uuid.uuid4().hex[:8]}"}
        )
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
    
    def test_add_post_comment_returns_comment_data(self, auth_headers):
        """POST comment to post returns the created comment"""
        content = f"TEST_PostComment_{uuid.uuid4().hex[:8]}"
        response = requests.post(
            f"{BASE_URL}/api/marketing/comments/post/{TEST_POST_ID}",
            headers=auth_headers,
            json={"content": content}
        )
        assert response.status_code == 200
        data = response.json()
        assert data["content"] == content
        assert data["entity_type"] == "post"
        assert data["entity_id"] == TEST_POST_ID


class TestEmptyContentValidation:
    """Test empty content returns 400"""
    
    def test_empty_content_returns_400(self, auth_headers):
        """POST with empty content returns 400"""
        response = requests.post(
            f"{BASE_URL}/api/marketing/comments/event/{TEST_EVENT_ID}",
            headers=auth_headers,
            json={"content": ""}
        )
        assert response.status_code == 400, f"Expected 400, got {response.status_code}: {response.text}"
    
    def test_whitespace_only_content_returns_400(self, auth_headers):
        """POST with whitespace-only content returns 400"""
        response = requests.post(
            f"{BASE_URL}/api/marketing/comments/event/{TEST_EVENT_ID}",
            headers=auth_headers,
            json={"content": "   "}
        )
        assert response.status_code == 400, f"Expected 400, got {response.status_code}: {response.text}"
    
    def test_missing_content_returns_400(self, auth_headers):
        """POST without content field returns 400"""
        response = requests.post(
            f"{BASE_URL}/api/marketing/comments/event/{TEST_EVENT_ID}",
            headers=auth_headers,
            json={}
        )
        assert response.status_code == 400, f"Expected 400, got {response.status_code}: {response.text}"


class TestDeleteComment:
    """Test DELETE /api/marketing/comments/{comment_id}"""
    
    def test_delete_own_comment_returns_200(self, auth_headers):
        """DELETE own comment returns 200"""
        # First create a comment
        content = f"TEST_ToDelete_{uuid.uuid4().hex[:8]}"
        create_response = requests.post(
            f"{BASE_URL}/api/marketing/comments/event/{TEST_EVENT_ID}",
            headers=auth_headers,
            json={"content": content}
        )
        assert create_response.status_code == 200
        comment_id = create_response.json()["id"]
        
        # Delete it
        delete_response = requests.delete(
            f"{BASE_URL}/api/marketing/comments/{comment_id}",
            headers=auth_headers
        )
        assert delete_response.status_code == 200, f"Expected 200, got {delete_response.status_code}: {delete_response.text}"
    
    def test_delete_comment_removes_from_list(self, auth_headers):
        """DELETE comment removes it from GET response"""
        # Create a comment
        content = f"TEST_DeleteVerify_{uuid.uuid4().hex[:8]}"
        create_response = requests.post(
            f"{BASE_URL}/api/marketing/comments/event/{TEST_EVENT_ID}",
            headers=auth_headers,
            json={"content": content}
        )
        assert create_response.status_code == 200
        comment_id = create_response.json()["id"]
        
        # Delete it
        delete_response = requests.delete(
            f"{BASE_URL}/api/marketing/comments/{comment_id}",
            headers=auth_headers
        )
        assert delete_response.status_code == 200
        
        # Verify it's gone
        get_response = requests.get(
            f"{BASE_URL}/api/marketing/comments/event/{TEST_EVENT_ID}",
            headers=auth_headers
        )
        assert get_response.status_code == 200
        comments = get_response.json()
        found = any(c["id"] == comment_id for c in comments)
        assert not found, f"Deleted comment {comment_id} still found in GET response"
    
    def test_delete_nonexistent_comment_returns_404(self, auth_headers):
        """DELETE non-existent comment returns 404"""
        fake_id = str(uuid.uuid4())
        response = requests.delete(
            f"{BASE_URL}/api/marketing/comments/{fake_id}",
            headers=auth_headers
        )
        assert response.status_code == 404, f"Expected 404, got {response.status_code}: {response.text}"


class TestCalendarEventExists:
    """Verify test calendar event exists"""
    
    def test_calendar_event_exists(self, auth_headers):
        """Verify the test calendar event exists"""
        response = requests.get(
            f"{BASE_URL}/api/marketing/calendar-events/{TEST_EVENT_ID}",
            headers=auth_headers
        )
        # If 404, the event doesn't exist - we need to create one or use a different ID
        if response.status_code == 404:
            pytest.skip(f"Test event {TEST_EVENT_ID} not found - may need to create test data")
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"


class TestPostExists:
    """Verify test post exists"""
    
    def test_post_exists(self, auth_headers):
        """Verify the test post exists"""
        response = requests.get(
            f"{BASE_URL}/api/marketing/posts/{TEST_POST_ID}",
            headers=auth_headers
        )
        # If 404, the post doesn't exist
        if response.status_code == 404:
            pytest.skip(f"Test post {TEST_POST_ID} not found - may need to create test data")
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
