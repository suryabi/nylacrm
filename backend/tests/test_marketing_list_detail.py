"""
Marketing Module - List View and Post Detail Page Tests
Tests for: GET /posts/{post_id}, PUT /posts/{post_id}/status, GET /calendar with filters
Focus on the new List View and Post Detail page features
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
    """Get authentication token for tests"""
    response = requests.post(
        f"{BASE_URL}/api/auth/login",
        json={"email": TEST_EMAIL, "password": TEST_PASSWORD},
        headers={"X-Tenant-ID": TENANT_ID}
    )
    if response.status_code == 200:
        data = response.json()
        return data.get("session_token") or data.get("token")
    pytest.skip(f"Authentication failed: {response.status_code} - {response.text}")


@pytest.fixture(scope="module")
def api_headers(auth_token):
    """Headers for authenticated requests"""
    return {
        "Authorization": f"Bearer {auth_token}",
        "X-Tenant-ID": TENANT_ID,
        "Content-Type": "application/json"
    }


class TestGetSinglePost:
    """Tests for GET /api/marketing/posts/{post_id} - Post Detail page data"""
    
    @pytest.fixture(scope="class")
    def test_post(self, api_headers):
        """Create a test post for detail page tests"""
        post_data = {
            "post_date": "2026-04-10",
            "category": "Health",
            "content_type": "reel",
            "concept": "TEST_Detail page test post",
            "message": "Testing the post detail page functionality",
            "platforms": ["linkedin", "instagram", "youtube"],
            "status": "draft"
        }
        response = requests.post(
            f"{BASE_URL}/api/marketing/posts",
            json=post_data,
            headers=api_headers
        )
        assert response.status_code == 200, f"Failed to create test post: {response.text}"
        data = response.json()
        yield data
        
        # Cleanup
        requests.delete(f"{BASE_URL}/api/marketing/posts/{data['id']}", headers=api_headers)
    
    def test_get_single_post_returns_all_fields(self, api_headers, test_post):
        """GET /api/marketing/posts/{post_id} returns complete post data"""
        response = requests.get(
            f"{BASE_URL}/api/marketing/posts/{test_post['id']}",
            headers=api_headers
        )
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        
        data = response.json()
        
        # Verify all required fields for Post Detail page
        required_fields = ["id", "post_date", "category", "content_type", "concept", 
                          "message", "platforms", "status", "created_at"]
        for field in required_fields:
            assert field in data, f"Response should contain {field}"
        
        # Verify field values
        assert data["id"] == test_post["id"]
        assert data["concept"] == "TEST_Detail page test post"
        assert data["message"] == "Testing the post detail page functionality"
        assert data["category"] == "Health"
        assert data["content_type"] == "reel"
        assert data["status"] == "draft"
        assert "linkedin" in data["platforms"]
        assert "instagram" in data["platforms"]
        assert "youtube" in data["platforms"]
        
        print(f"Single post retrieved successfully: {data['id']}")
    
    def test_get_nonexistent_post_returns_404(self, api_headers):
        """GET /api/marketing/posts/{post_id} for nonexistent post returns 404"""
        fake_id = str(uuid.uuid4())
        response = requests.get(
            f"{BASE_URL}/api/marketing/posts/{fake_id}",
            headers=api_headers
        )
        assert response.status_code == 404, f"Expected 404, got {response.status_code}"
        print("Nonexistent post correctly returns 404")


class TestUpdatePostStatus:
    """Tests for PUT /api/marketing/posts/{post_id}/status - Workflow status changes"""
    
    @pytest.fixture(scope="class")
    def workflow_post(self, api_headers):
        """Create a test post for workflow tests"""
        post_data = {
            "post_date": "2026-04-12",
            "category": "Brand",
            "content_type": "image",
            "concept": "TEST_Workflow test post",
            "status": "draft"
        }
        response = requests.post(
            f"{BASE_URL}/api/marketing/posts",
            json=post_data,
            headers=api_headers
        )
        assert response.status_code == 200
        data = response.json()
        yield data
        
        # Cleanup
        requests.delete(f"{BASE_URL}/api/marketing/posts/{data['id']}", headers=api_headers)
    
    def test_update_status_draft_to_review(self, api_headers, workflow_post):
        """PUT /api/marketing/posts/{id}/status changes status from draft to review"""
        response = requests.put(
            f"{BASE_URL}/api/marketing/posts/{workflow_post['id']}/status",
            json={"status": "review"},
            headers=api_headers
        )
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        
        # Verify status change
        get_response = requests.get(
            f"{BASE_URL}/api/marketing/posts/{workflow_post['id']}",
            headers=api_headers
        )
        assert get_response.status_code == 200
        assert get_response.json()["status"] == "review"
        print("Status changed: draft -> review")
    
    def test_update_status_review_to_scheduled(self, api_headers, workflow_post):
        """PUT /api/marketing/posts/{id}/status changes status from review to scheduled"""
        response = requests.put(
            f"{BASE_URL}/api/marketing/posts/{workflow_post['id']}/status",
            json={"status": "scheduled"},
            headers=api_headers
        )
        assert response.status_code == 200
        
        # Verify
        get_response = requests.get(
            f"{BASE_URL}/api/marketing/posts/{workflow_post['id']}",
            headers=api_headers
        )
        assert get_response.json()["status"] == "scheduled"
        print("Status changed: review -> scheduled")
    
    def test_update_status_scheduled_to_published(self, api_headers, workflow_post):
        """PUT /api/marketing/posts/{id}/status changes status from scheduled to published"""
        response = requests.put(
            f"{BASE_URL}/api/marketing/posts/{workflow_post['id']}/status",
            json={"status": "published"},
            headers=api_headers
        )
        assert response.status_code == 200
        
        # Verify
        get_response = requests.get(
            f"{BASE_URL}/api/marketing/posts/{workflow_post['id']}",
            headers=api_headers
        )
        assert get_response.json()["status"] == "published"
        print("Status changed: scheduled -> published")
    
    def test_update_status_invalid_returns_400(self, api_headers, workflow_post):
        """PUT /api/marketing/posts/{id}/status with invalid status returns 400"""
        response = requests.put(
            f"{BASE_URL}/api/marketing/posts/{workflow_post['id']}/status",
            json={"status": "invalid_status"},
            headers=api_headers
        )
        assert response.status_code == 400, f"Expected 400, got {response.status_code}"
        print("Invalid status correctly rejected with 400")
    
    def test_update_status_nonexistent_post_returns_404(self, api_headers):
        """PUT /api/marketing/posts/{id}/status for nonexistent post returns 404"""
        fake_id = str(uuid.uuid4())
        response = requests.put(
            f"{BASE_URL}/api/marketing/posts/{fake_id}/status",
            json={"status": "review"},
            headers=api_headers
        )
        assert response.status_code == 404, f"Expected 404, got {response.status_code}"
        print("Nonexistent post status update correctly returns 404")


class TestCalendarWithStats:
    """Tests for GET /api/marketing/calendar - Calendar data with stats for List View"""
    
    def test_calendar_returns_posts_grouped_by_date(self, api_headers):
        """GET /api/marketing/calendar returns posts_by_date dictionary"""
        response = requests.get(
            f"{BASE_URL}/api/marketing/calendar?month=4&year=2026",
            headers=api_headers
        )
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        
        data = response.json()
        assert "posts_by_date" in data, "Response should contain posts_by_date"
        assert isinstance(data["posts_by_date"], dict), "posts_by_date should be a dictionary"
        
        # Verify date format in keys (YYYY-MM-DD)
        for date_key in data["posts_by_date"].keys():
            assert date_key.startswith("2026-04-"), f"Date key should be in April 2026: {date_key}"
        
        print(f"Calendar has {len(data['posts_by_date'])} dates with posts")
    
    def test_calendar_returns_stats(self, api_headers):
        """GET /api/marketing/calendar returns stats with by_status, by_category, by_content_type"""
        response = requests.get(
            f"{BASE_URL}/api/marketing/calendar?month=4&year=2026",
            headers=api_headers
        )
        assert response.status_code == 200
        
        data = response.json()
        assert "stats" in data, "Response should contain stats"
        
        stats = data["stats"]
        assert "total" in stats, "Stats should have total"
        assert "by_status" in stats, "Stats should have by_status"
        assert "by_category" in stats, "Stats should have by_category"
        assert "by_content_type" in stats, "Stats should have by_content_type"
        assert "events_count" in stats, "Stats should have events_count"
        
        print(f"Stats: total={stats['total']}, by_status={stats['by_status']}")
    
    def test_calendar_returns_events(self, api_headers):
        """GET /api/marketing/calendar returns events for the month"""
        response = requests.get(
            f"{BASE_URL}/api/marketing/calendar?month=4&year=2026",
            headers=api_headers
        )
        assert response.status_code == 200
        
        data = response.json()
        assert "events" in data, "Response should contain events"
        assert isinstance(data["events"], list), "events should be a list"
        
        # April should have Earth Day (04-22), World Health Day (04-07), Ambedkar Jayanti (04-14)
        event_names = [e["name"] for e in data["events"]]
        assert any("Earth Day" in name for name in event_names), "April should have Earth Day"
        
        print(f"April events: {event_names}")
    
    def test_calendar_month_year_params(self, api_headers):
        """GET /api/marketing/calendar correctly uses month and year params"""
        # Test January 2026
        response = requests.get(
            f"{BASE_URL}/api/marketing/calendar?month=1&year=2026",
            headers=api_headers
        )
        assert response.status_code == 200
        data = response.json()
        assert data["month"] == 1
        assert data["year"] == 2026
        
        # January events should include New Year, Republic Day
        event_names = [e["name"] for e in data["events"]]
        assert any("New Year" in name for name in event_names), "January should have New Year"
        assert any("Republic Day" in name for name in event_names), "January should have Republic Day"
        
        print(f"January 2026 events: {event_names}")


class TestListViewFiltering:
    """Tests for List View filtering - posts filtered by month/year/status/category"""
    
    @pytest.fixture(scope="class")
    def test_posts(self, api_headers):
        """Create multiple test posts for filtering tests"""
        posts = []
        test_data = [
            {"post_date": "2026-04-05", "category": "Health", "status": "draft", "concept": "TEST_Filter draft health"},
            {"post_date": "2026-04-10", "category": "Water", "status": "review", "concept": "TEST_Filter review water"},
            {"post_date": "2026-04-15", "category": "Health", "status": "scheduled", "concept": "TEST_Filter scheduled health"},
            {"post_date": "2026-04-20", "category": "Brand", "status": "published", "concept": "TEST_Filter published brand"},
        ]
        
        for data in test_data:
            data["content_type"] = "image"
            data["platforms"] = ["linkedin"]
            response = requests.post(
                f"{BASE_URL}/api/marketing/posts",
                json=data,
                headers=api_headers
            )
            if response.status_code == 200:
                posts.append(response.json())
        
        yield posts
        
        # Cleanup
        for post in posts:
            requests.delete(f"{BASE_URL}/api/marketing/posts/{post['id']}", headers=api_headers)
    
    def test_filter_by_status(self, api_headers, test_posts):
        """GET /api/marketing/posts?status=draft returns only draft posts"""
        response = requests.get(
            f"{BASE_URL}/api/marketing/posts?status=draft",
            headers=api_headers
        )
        assert response.status_code == 200
        
        data = response.json()
        for post in data:
            assert post["status"] == "draft", f"All posts should be draft, got {post['status']}"
        
        print(f"Draft posts: {len(data)}")
    
    def test_filter_by_category(self, api_headers, test_posts):
        """GET /api/marketing/posts?category=Health returns only Health category posts"""
        response = requests.get(
            f"{BASE_URL}/api/marketing/posts?category=Health",
            headers=api_headers
        )
        assert response.status_code == 200
        
        data = response.json()
        for post in data:
            assert post["category"] == "Health", f"All posts should be Health category, got {post['category']}"
        
        print(f"Health category posts: {len(data)}")
    
    def test_filter_by_month_year(self, api_headers, test_posts):
        """GET /api/marketing/posts?month=4&year=2026 returns only April 2026 posts"""
        response = requests.get(
            f"{BASE_URL}/api/marketing/posts?month=4&year=2026",
            headers=api_headers
        )
        assert response.status_code == 200
        
        data = response.json()
        for post in data:
            assert post["post_date"].startswith("2026-04"), f"All posts should be in April 2026, got {post['post_date']}"
        
        print(f"April 2026 posts: {len(data)}")
    
    def test_combined_filters(self, api_headers, test_posts):
        """GET /api/marketing/posts with multiple filters works correctly"""
        response = requests.get(
            f"{BASE_URL}/api/marketing/posts?month=4&year=2026&status=draft&category=Health",
            headers=api_headers
        )
        assert response.status_code == 200
        
        data = response.json()
        for post in data:
            assert post["status"] == "draft"
            assert post["category"] == "Health"
            assert post["post_date"].startswith("2026-04")
        
        print(f"Filtered posts (April 2026, draft, Health): {len(data)}")


class TestPostDetailPageData:
    """Tests to verify all data needed for Post Detail page is available"""
    
    @pytest.fixture(scope="class")
    def complete_post(self, api_headers):
        """Create a complete post with all fields"""
        post_data = {
            "post_date": "2026-04-18",
            "category": "Luxury",
            "content_type": "video",
            "concept": "TEST_Complete post for detail page",
            "message": "This is a complete message with all details for the post detail page test",
            "platforms": ["linkedin", "whatsapp", "youtube", "instagram", "facebook"],
            "status": "scheduled",
            "owner_name": "Test Owner"
        }
        response = requests.post(
            f"{BASE_URL}/api/marketing/posts",
            json=post_data,
            headers=api_headers
        )
        assert response.status_code == 200
        data = response.json()
        yield data
        
        # Cleanup
        requests.delete(f"{BASE_URL}/api/marketing/posts/{data['id']}", headers=api_headers)
    
    def test_post_detail_has_concept(self, api_headers, complete_post):
        """Post detail includes concept field"""
        response = requests.get(
            f"{BASE_URL}/api/marketing/posts/{complete_post['id']}",
            headers=api_headers
        )
        assert response.status_code == 200
        data = response.json()
        assert "concept" in data
        assert data["concept"] == "TEST_Complete post for detail page"
        print(f"Concept: {data['concept']}")
    
    def test_post_detail_has_message(self, api_headers, complete_post):
        """Post detail includes message field"""
        response = requests.get(
            f"{BASE_URL}/api/marketing/posts/{complete_post['id']}",
            headers=api_headers
        )
        assert response.status_code == 200
        data = response.json()
        assert "message" in data
        assert len(data["message"]) > 0
        print(f"Message: {data['message'][:50]}...")
    
    def test_post_detail_has_platforms(self, api_headers, complete_post):
        """Post detail includes platforms array"""
        response = requests.get(
            f"{BASE_URL}/api/marketing/posts/{complete_post['id']}",
            headers=api_headers
        )
        assert response.status_code == 200
        data = response.json()
        assert "platforms" in data
        assert isinstance(data["platforms"], list)
        assert len(data["platforms"]) == 5  # All 5 platforms
        print(f"Platforms: {data['platforms']}")
    
    def test_post_detail_has_workflow_status(self, api_headers, complete_post):
        """Post detail includes status for workflow display"""
        response = requests.get(
            f"{BASE_URL}/api/marketing/posts/{complete_post['id']}",
            headers=api_headers
        )
        assert response.status_code == 200
        data = response.json()
        assert "status" in data
        assert data["status"] in ["draft", "review", "scheduled", "published"]
        print(f"Status: {data['status']}")
    
    def test_post_detail_has_metadata(self, api_headers, complete_post):
        """Post detail includes metadata (date, category, content_type, created_by)"""
        response = requests.get(
            f"{BASE_URL}/api/marketing/posts/{complete_post['id']}",
            headers=api_headers
        )
        assert response.status_code == 200
        data = response.json()
        
        assert "post_date" in data
        assert "category" in data
        assert "content_type" in data
        assert "created_at" in data
        
        print(f"Metadata: date={data['post_date']}, category={data['category']}, type={data['content_type']}")


if __name__ == "__main__":
    pytest.main([__file__, "-v", "--tb=short"])
