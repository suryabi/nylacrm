"""
Marketing Module API Tests
Tests for: Calendar, Posts CRUD, Categories, Platforms, Events
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


class TestMarketingCalendar:
    """Tests for /api/marketing/calendar endpoint"""
    
    def test_get_calendar_april_2026(self, api_headers):
        """GET /api/marketing/calendar?month=4&year=2026 returns posts_by_date, events, stats"""
        response = requests.get(
            f"{BASE_URL}/api/marketing/calendar?month=4&year=2026",
            headers=api_headers
        )
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        
        data = response.json()
        assert "posts_by_date" in data, "Response should contain posts_by_date"
        assert "events" in data, "Response should contain events"
        assert "stats" in data, "Response should contain stats"
        assert data["month"] == 4, "Month should be 4"
        assert data["year"] == 2026, "Year should be 2026"
        
        # Verify stats structure
        assert "total" in data["stats"], "Stats should have total"
        assert "by_status" in data["stats"], "Stats should have by_status"
        
        # Verify April events (Earth Day, World Health Day, Ambedkar Jayanti)
        event_names = [e["name"] for e in data["events"]]
        assert any("Earth Day" in name for name in event_names), "April should have Earth Day event"
        print(f"Calendar data retrieved: {data['stats']['total']} posts, {len(data['events'])} events")
    
    def test_get_calendar_january_2026(self, api_headers):
        """GET /api/marketing/calendar for January - should have New Year events"""
        response = requests.get(
            f"{BASE_URL}/api/marketing/calendar?month=1&year=2026",
            headers=api_headers
        )
        assert response.status_code == 200
        
        data = response.json()
        event_names = [e["name"] for e in data["events"]]
        assert any("New Year" in name for name in event_names), "January should have New Year event"
        assert any("Republic Day" in name for name in event_names), "January should have Republic Day (Indian)"
        print(f"January events: {event_names}")


class TestMarketingPosts:
    """Tests for /api/marketing/posts CRUD endpoints"""
    
    @pytest.fixture(scope="class")
    def created_post_id(self, api_headers):
        """Create a test post and return its ID for other tests"""
        post_data = {
            "post_date": "2026-04-15",
            "category": "TEST_Health",
            "content_type": "reel",
            "concept": "TEST_Spring wellness tips",
            "message": "Stay healthy this spring with our water solutions!",
            "platforms": ["linkedin", "instagram"],
            "status": "draft"
        }
        response = requests.post(
            f"{BASE_URL}/api/marketing/posts",
            json=post_data,
            headers=api_headers
        )
        assert response.status_code == 200, f"Failed to create post: {response.text}"
        data = response.json()
        yield data["id"]
        
        # Cleanup
        requests.delete(f"{BASE_URL}/api/marketing/posts/{data['id']}", headers=api_headers)
    
    def test_get_all_posts(self, api_headers):
        """GET /api/marketing/posts returns all posts"""
        response = requests.get(
            f"{BASE_URL}/api/marketing/posts",
            headers=api_headers
        )
        assert response.status_code == 200
        data = response.json()
        assert isinstance(data, list), "Response should be a list"
        print(f"Total posts: {len(data)}")
    
    def test_get_posts_with_filters(self, api_headers):
        """GET /api/marketing/posts supports month/year/status/category filters"""
        # Filter by month and year
        response = requests.get(
            f"{BASE_URL}/api/marketing/posts?month=4&year=2026",
            headers=api_headers
        )
        assert response.status_code == 200
        
        # Filter by status
        response = requests.get(
            f"{BASE_URL}/api/marketing/posts?status=draft",
            headers=api_headers
        )
        assert response.status_code == 200
        data = response.json()
        for post in data:
            assert post.get("status") == "draft", "All posts should have draft status"
        print(f"Draft posts: {len(data)}")
    
    def test_create_post(self, api_headers):
        """POST /api/marketing/posts creates a new post with all fields"""
        post_data = {
            "post_date": "2026-04-22",
            "category": "Sustainability",
            "content_type": "video",
            "concept": "TEST_Earth Day celebration",
            "message": "Celebrating Earth Day with sustainable water solutions!",
            "platforms": ["linkedin", "youtube", "facebook"],
            "status": "draft"
        }
        response = requests.post(
            f"{BASE_URL}/api/marketing/posts",
            json=post_data,
            headers=api_headers
        )
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        
        data = response.json()
        assert "id" in data, "Response should contain id"
        assert data["post_date"] == "2026-04-22", "Post date should match"
        assert data["category"] == "Sustainability", "Category should match"
        assert data["content_type"] == "video", "Content type should match"
        assert data["concept"] == "TEST_Earth Day celebration", "Concept should match"
        assert data["status"] == "draft", "Status should be draft"
        assert "linkedin" in data["platforms"], "Platforms should include linkedin"
        
        # Verify persistence with GET
        get_response = requests.get(
            f"{BASE_URL}/api/marketing/posts/{data['id']}",
            headers=api_headers
        )
        assert get_response.status_code == 200
        fetched = get_response.json()
        assert fetched["concept"] == "TEST_Earth Day celebration"
        
        # Cleanup
        requests.delete(f"{BASE_URL}/api/marketing/posts/{data['id']}", headers=api_headers)
        print(f"Created and verified post: {data['id']}")
    
    def test_update_post(self, api_headers, created_post_id):
        """PUT /api/marketing/posts/{id} updates a post"""
        update_data = {
            "concept": "TEST_Updated wellness tips",
            "message": "Updated message for spring wellness!",
            "status": "review"
        }
        response = requests.put(
            f"{BASE_URL}/api/marketing/posts/{created_post_id}",
            json=update_data,
            headers=api_headers
        )
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        
        data = response.json()
        assert data["concept"] == "TEST_Updated wellness tips", "Concept should be updated"
        assert data["status"] == "review", "Status should be updated to review"
        
        # Verify persistence
        get_response = requests.get(
            f"{BASE_URL}/api/marketing/posts/{created_post_id}",
            headers=api_headers
        )
        assert get_response.status_code == 200
        fetched = get_response.json()
        assert fetched["concept"] == "TEST_Updated wellness tips"
        print(f"Updated post: {created_post_id}")
    
    def test_update_post_status(self, api_headers, created_post_id):
        """PUT /api/marketing/posts/{id}/status updates post status (workflow transition)"""
        response = requests.put(
            f"{BASE_URL}/api/marketing/posts/{created_post_id}/status",
            json={"status": "scheduled"},
            headers=api_headers
        )
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        
        # Verify status change
        get_response = requests.get(
            f"{BASE_URL}/api/marketing/posts/{created_post_id}",
            headers=api_headers
        )
        assert get_response.status_code == 200
        fetched = get_response.json()
        assert fetched["status"] == "scheduled", "Status should be scheduled"
        print(f"Status updated to scheduled for post: {created_post_id}")
    
    def test_update_post_status_invalid(self, api_headers, created_post_id):
        """PUT /api/marketing/posts/{id}/status with invalid status returns 400"""
        response = requests.put(
            f"{BASE_URL}/api/marketing/posts/{created_post_id}/status",
            json={"status": "invalid_status"},
            headers=api_headers
        )
        assert response.status_code == 400, f"Expected 400 for invalid status, got {response.status_code}"
        print("Invalid status correctly rejected")
    
    def test_delete_post(self, api_headers):
        """DELETE /api/marketing/posts/{id} deletes a post"""
        # Create a post to delete
        post_data = {
            "post_date": "2026-04-30",
            "category": "Brand",
            "content_type": "image",
            "concept": "TEST_Post to delete",
            "status": "draft"
        }
        create_response = requests.post(
            f"{BASE_URL}/api/marketing/posts",
            json=post_data,
            headers=api_headers
        )
        assert create_response.status_code == 200
        post_id = create_response.json()["id"]
        
        # Delete the post
        delete_response = requests.delete(
            f"{BASE_URL}/api/marketing/posts/{post_id}",
            headers=api_headers
        )
        assert delete_response.status_code == 200, f"Expected 200, got {delete_response.status_code}"
        
        # Verify deletion
        get_response = requests.get(
            f"{BASE_URL}/api/marketing/posts/{post_id}",
            headers=api_headers
        )
        assert get_response.status_code == 404, "Deleted post should return 404"
        print(f"Deleted post: {post_id}")
    
    def test_get_nonexistent_post(self, api_headers):
        """GET /api/marketing/posts/{id} for nonexistent post returns 404"""
        fake_id = str(uuid.uuid4())
        response = requests.get(
            f"{BASE_URL}/api/marketing/posts/{fake_id}",
            headers=api_headers
        )
        assert response.status_code == 404, f"Expected 404, got {response.status_code}"


class TestMarketingCategories:
    """Tests for /api/marketing/categories endpoints"""
    
    def test_get_categories_seeds_defaults(self, api_headers):
        """GET /api/marketing/categories returns categories (seeds defaults on first call)"""
        response = requests.get(
            f"{BASE_URL}/api/marketing/categories",
            headers=api_headers
        )
        assert response.status_code == 200
        
        data = response.json()
        assert isinstance(data, list), "Response should be a list"
        assert len(data) > 0, "Should have at least default categories"
        
        # Check for expected default categories
        category_names = [c["name"] for c in data]
        expected_defaults = ["Health", "Water", "Luxury", "Sustainability"]
        for expected in expected_defaults:
            assert expected in category_names, f"Should have default category: {expected}"
        
        # Verify structure
        for cat in data:
            assert "id" in cat, "Category should have id"
            assert "name" in cat, "Category should have name"
            assert "color" in cat, "Category should have color"
        
        print(f"Categories: {category_names}")
    
    def test_create_category(self, api_headers):
        """POST /api/marketing/categories creates a new category"""
        cat_data = {
            "name": "TEST_NewCategory",
            "color": "#FF5733"
        }
        response = requests.post(
            f"{BASE_URL}/api/marketing/categories",
            json=cat_data,
            headers=api_headers
        )
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        
        data = response.json()
        assert "id" in data, "Response should contain id"
        assert data["name"] == "TEST_NewCategory", "Name should match"
        assert data["color"] == "#FF5733", "Color should match"
        
        # Cleanup
        requests.delete(f"{BASE_URL}/api/marketing/categories/{data['id']}", headers=api_headers)
        print(f"Created category: {data['id']}")
    
    def test_update_category(self, api_headers):
        """PUT /api/marketing/categories/{id} updates a category"""
        # Create a category to update
        cat_data = {"name": "TEST_UpdateCat", "color": "#123456"}
        create_response = requests.post(
            f"{BASE_URL}/api/marketing/categories",
            json=cat_data,
            headers=api_headers
        )
        assert create_response.status_code == 200
        cat_id = create_response.json()["id"]
        
        # Update the category
        update_response = requests.put(
            f"{BASE_URL}/api/marketing/categories/{cat_id}",
            json={"name": "TEST_UpdatedCat", "color": "#654321"},
            headers=api_headers
        )
        assert update_response.status_code == 200, f"Expected 200, got {update_response.status_code}"
        
        # Verify update
        get_response = requests.get(
            f"{BASE_URL}/api/marketing/categories",
            headers=api_headers
        )
        categories = get_response.json()
        updated_cat = next((c for c in categories if c["id"] == cat_id), None)
        assert updated_cat is not None, "Updated category should exist"
        assert updated_cat["name"] == "TEST_UpdatedCat", "Name should be updated"
        
        # Cleanup
        requests.delete(f"{BASE_URL}/api/marketing/categories/{cat_id}", headers=api_headers)
        print(f"Updated category: {cat_id}")
    
    def test_delete_category(self, api_headers):
        """DELETE /api/marketing/categories/{id} deletes a category"""
        # Create a category to delete
        cat_data = {"name": "TEST_DeleteCat", "color": "#AABBCC"}
        create_response = requests.post(
            f"{BASE_URL}/api/marketing/categories",
            json=cat_data,
            headers=api_headers
        )
        assert create_response.status_code == 200
        cat_id = create_response.json()["id"]
        
        # Delete the category
        delete_response = requests.delete(
            f"{BASE_URL}/api/marketing/categories/{cat_id}",
            headers=api_headers
        )
        assert delete_response.status_code == 200, f"Expected 200, got {delete_response.status_code}"
        
        # Verify deletion
        get_response = requests.get(
            f"{BASE_URL}/api/marketing/categories",
            headers=api_headers
        )
        categories = get_response.json()
        deleted_cat = next((c for c in categories if c["id"] == cat_id), None)
        assert deleted_cat is None, "Deleted category should not exist"
        print(f"Deleted category: {cat_id}")


class TestMarketingPlatforms:
    """Tests for /api/marketing/platforms endpoints"""
    
    def test_get_platforms_seeds_defaults(self, api_headers):
        """GET /api/marketing/platforms returns platforms (seeds defaults on first call)"""
        response = requests.get(
            f"{BASE_URL}/api/marketing/platforms",
            headers=api_headers
        )
        assert response.status_code == 200
        
        data = response.json()
        assert isinstance(data, list), "Response should be a list"
        assert len(data) >= 5, "Should have at least 5 default platforms"
        
        # Check for expected default platforms
        platform_keys = [p["key"] for p in data]
        expected_platforms = ["linkedin", "whatsapp", "youtube", "instagram", "facebook"]
        for expected in expected_platforms:
            assert expected in platform_keys, f"Should have default platform: {expected}"
        
        # Verify structure
        for plat in data:
            assert "id" in plat, "Platform should have id"
            assert "name" in plat, "Platform should have name"
            assert "key" in plat, "Platform should have key"
            assert "enabled" in plat, "Platform should have enabled flag"
        
        print(f"Platforms: {platform_keys}")
    
    def test_toggle_platform_enabled(self, api_headers):
        """PUT /api/marketing/platforms/{id} toggles enabled/disabled"""
        # Get platforms
        get_response = requests.get(
            f"{BASE_URL}/api/marketing/platforms",
            headers=api_headers
        )
        platforms = get_response.json()
        
        # Find a platform to toggle
        test_platform = next((p for p in platforms if p["key"] == "facebook"), None)
        assert test_platform is not None, "Should have facebook platform"
        
        original_enabled = test_platform["enabled"]
        
        # Toggle enabled
        toggle_response = requests.put(
            f"{BASE_URL}/api/marketing/platforms/{test_platform['id']}",
            json={"enabled": not original_enabled},
            headers=api_headers
        )
        assert toggle_response.status_code == 200, f"Expected 200, got {toggle_response.status_code}"
        
        # Verify toggle
        get_response2 = requests.get(
            f"{BASE_URL}/api/marketing/platforms",
            headers=api_headers
        )
        platforms2 = get_response2.json()
        toggled_platform = next((p for p in platforms2 if p["id"] == test_platform["id"]), None)
        assert toggled_platform["enabled"] == (not original_enabled), "Enabled should be toggled"
        
        # Restore original state
        requests.put(
            f"{BASE_URL}/api/marketing/platforms/{test_platform['id']}",
            json={"enabled": original_enabled},
            headers=api_headers
        )
        print(f"Toggled platform {test_platform['key']}: {original_enabled} -> {not original_enabled} -> {original_enabled}")


class TestMarketingEvents:
    """Tests for /api/marketing/events endpoints"""
    
    def test_get_events_includes_auto_events(self, api_headers):
        """GET /api/marketing/events returns auto + custom events"""
        response = requests.get(
            f"{BASE_URL}/api/marketing/events",
            headers=api_headers
        )
        assert response.status_code == 200
        
        data = response.json()
        assert isinstance(data, list), "Response should be a list"
        
        # Check for auto events
        event_types = set(e.get("type") for e in data)
        assert "global" in event_types or "indian" in event_types, "Should have auto events"
        
        # Check for specific auto events
        event_names = [e["name"] for e in data]
        assert any("New Year" in name for name in event_names), "Should have New Year event"
        assert any("Diwali" in name for name in event_names), "Should have Diwali event"
        
        print(f"Total events: {len(data)}, Types: {event_types}")
    
    def test_get_events_filtered_by_month(self, api_headers):
        """GET /api/marketing/events?month=3 filters by month"""
        response = requests.get(
            f"{BASE_URL}/api/marketing/events?month=3",
            headers=api_headers
        )
        assert response.status_code == 200
        
        data = response.json()
        # All events should be in March (03-XX)
        for event in data:
            assert event["date"].startswith("03"), f"Event date should be in March: {event['date']}"
        
        # March should have Holi and Women's Day
        event_names = [e["name"] for e in data]
        assert any("Holi" in name for name in event_names), "March should have Holi"
        assert any("Women" in name for name in event_names), "March should have Women's Day"
        print(f"March events: {event_names}")
    
    def test_create_custom_event(self, api_headers):
        """POST /api/marketing/events creates custom event"""
        event_data = {
            "date": "06-15",
            "name": "TEST_Company Anniversary"
        }
        response = requests.post(
            f"{BASE_URL}/api/marketing/events",
            json=event_data,
            headers=api_headers
        )
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        
        data = response.json()
        assert "id" in data, "Response should contain id"
        assert data["date"] == "06-15", "Date should match"
        assert data["name"] == "TEST_Company Anniversary", "Name should match"
        
        # Verify in events list
        get_response = requests.get(
            f"{BASE_URL}/api/marketing/events",
            headers=api_headers
        )
        events = get_response.json()
        custom_event = next((e for e in events if e.get("id") == data["id"]), None)
        assert custom_event is not None, "Custom event should be in list"
        assert custom_event.get("type") == "custom", "Event type should be custom"
        
        # Cleanup
        requests.delete(f"{BASE_URL}/api/marketing/events/{data['id']}", headers=api_headers)
        print(f"Created custom event: {data['id']}")
    
    def test_delete_custom_event(self, api_headers):
        """DELETE /api/marketing/events/{id} deletes custom event"""
        # Create an event to delete
        event_data = {"date": "07-04", "name": "TEST_Event to delete"}
        create_response = requests.post(
            f"{BASE_URL}/api/marketing/events",
            json=event_data,
            headers=api_headers
        )
        assert create_response.status_code == 200
        event_id = create_response.json()["id"]
        
        # Delete the event
        delete_response = requests.delete(
            f"{BASE_URL}/api/marketing/events/{event_id}",
            headers=api_headers
        )
        assert delete_response.status_code == 200, f"Expected 200, got {delete_response.status_code}"
        
        # Verify deletion
        get_response = requests.get(
            f"{BASE_URL}/api/marketing/events",
            headers=api_headers
        )
        events = get_response.json()
        deleted_event = next((e for e in events if e.get("id") == event_id), None)
        assert deleted_event is None, "Deleted event should not exist"
        print(f"Deleted event: {event_id}")
    
    def test_delete_nonexistent_event(self, api_headers):
        """DELETE /api/marketing/events/{id} for nonexistent event returns 404"""
        fake_id = str(uuid.uuid4())
        response = requests.delete(
            f"{BASE_URL}/api/marketing/events/{fake_id}",
            headers=api_headers
        )
        assert response.status_code == 404, f"Expected 404, got {response.status_code}"


class TestMarketingIntegration:
    """Integration tests for Marketing module"""
    
    def test_full_post_workflow(self, api_headers):
        """Test complete post workflow: create -> update -> status changes -> delete"""
        # 1. Create post
        post_data = {
            "post_date": "2026-05-01",
            "category": "Brand",
            "content_type": "reel",
            "concept": "TEST_Integration test post",
            "message": "Testing full workflow",
            "platforms": ["linkedin", "instagram"],
            "status": "draft"
        }
        create_response = requests.post(
            f"{BASE_URL}/api/marketing/posts",
            json=post_data,
            headers=api_headers
        )
        assert create_response.status_code == 200
        post_id = create_response.json()["id"]
        print(f"1. Created post: {post_id}")
        
        # 2. Update post
        update_response = requests.put(
            f"{BASE_URL}/api/marketing/posts/{post_id}",
            json={"concept": "TEST_Updated integration post"},
            headers=api_headers
        )
        assert update_response.status_code == 200
        print("2. Updated post concept")
        
        # 3. Status workflow: draft -> review -> scheduled -> published
        for status in ["review", "scheduled", "published"]:
            status_response = requests.put(
                f"{BASE_URL}/api/marketing/posts/{post_id}/status",
                json={"status": status},
                headers=api_headers
            )
            assert status_response.status_code == 200, f"Failed to set status to {status}"
            print(f"3. Status changed to: {status}")
        
        # 4. Verify final state
        get_response = requests.get(
            f"{BASE_URL}/api/marketing/posts/{post_id}",
            headers=api_headers
        )
        assert get_response.status_code == 200
        final_post = get_response.json()
        assert final_post["status"] == "published"
        assert final_post["concept"] == "TEST_Updated integration post"
        print("4. Verified final state")
        
        # 5. Verify in calendar
        calendar_response = requests.get(
            f"{BASE_URL}/api/marketing/calendar?month=5&year=2026",
            headers=api_headers
        )
        assert calendar_response.status_code == 200
        calendar_data = calendar_response.json()
        posts_on_date = calendar_data["posts_by_date"].get("2026-05-01", [])
        assert any(p["id"] == post_id for p in posts_on_date), "Post should appear in calendar"
        print("5. Verified in calendar")
        
        # 6. Delete post
        delete_response = requests.delete(
            f"{BASE_URL}/api/marketing/posts/{post_id}",
            headers=api_headers
        )
        assert delete_response.status_code == 200
        print("6. Deleted post - workflow complete!")


if __name__ == "__main__":
    pytest.main([__file__, "-v", "--tb=short"])
