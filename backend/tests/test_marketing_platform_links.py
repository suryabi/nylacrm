"""
Test Marketing Platform Links & Analytics Feature
Tests PUT /api/marketing/posts/{post_id}/links endpoint and related functionality
"""
import pytest
import requests
import os

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', '').rstrip('/')

# Test credentials
TEST_EMAIL = "surya.yadavalli@nylaairwater.earth"
TEST_PASSWORD = "test123"
TEST_TENANT_ID = "nyla-air-water"

# Known test post with links data
POST_WITH_LINKS = "792b3da1-a633-4ec3-b65e-bba81f635a75"


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
    return data.get("session_token") or data.get("token")


@pytest.fixture(scope="module")
def api_client(auth_token):
    """Shared requests session with auth"""
    session = requests.Session()
    session.headers.update({
        "Content-Type": "application/json",
        "Authorization": f"Bearer {auth_token}"
    })
    return session


@pytest.fixture(scope="module")
def test_post_id(api_client):
    """Create a test post for link testing"""
    response = api_client.post(f"{BASE_URL}/api/marketing/posts", json={
        "post_date": "2026-04-20",
        "category": "Health",
        "content_type": "reel",
        "concept": "TEST_LINKS_Post for platform links testing",
        "message": "Test message for links",
        "platforms": ["linkedin", "youtube", "instagram"],
        "status": "draft"
    })
    assert response.status_code == 200, f"Failed to create test post: {response.text}"
    post_id = response.json().get("id")
    yield post_id
    # Cleanup
    api_client.delete(f"{BASE_URL}/api/marketing/posts/{post_id}")


class TestPutPostLinks:
    """Tests for PUT /api/marketing/posts/{post_id}/links endpoint"""

    def test_save_platform_links_with_url_and_analytics(self, api_client, test_post_id):
        """Test saving platform links with URL and analytics fields"""
        payload = {
            "platform_links": {
                "linkedin": {
                    "url": "https://linkedin.com/post/test123",
                    "views": 1500,
                    "likes": 120,
                    "comments": 25,
                    "shares": 45,
                    "subscribers_added": 10
                }
            }
        }
        response = api_client.put(f"{BASE_URL}/api/marketing/posts/{test_post_id}/links", json=payload)
        assert response.status_code == 200, f"Failed to save links: {response.text}"
        
        data = response.json()
        assert "platform_links" in data
        assert "linkedin" in data["platform_links"]
        assert data["platform_links"]["linkedin"]["url"] == "https://linkedin.com/post/test123"
        assert data["platform_links"]["linkedin"]["views"] == 1500
        assert data["platform_links"]["linkedin"]["likes"] == 120
        assert data["platform_links"]["linkedin"]["comments"] == 25
        assert data["platform_links"]["linkedin"]["shares"] == 45
        assert data["platform_links"]["linkedin"]["subscribers_added"] == 10

    def test_only_accepts_assigned_platforms(self, api_client, test_post_id):
        """Test that only platforms assigned to the post are accepted"""
        # Post has linkedin, youtube, instagram - try to add facebook (not assigned)
        payload = {
            "platform_links": {
                "facebook": {
                    "url": "https://facebook.com/post/test",
                    "views": 500
                }
            }
        }
        response = api_client.put(f"{BASE_URL}/api/marketing/posts/{test_post_id}/links", json=payload)
        assert response.status_code == 200
        
        data = response.json()
        # Facebook should NOT be in platform_links since it's not assigned to the post
        assert "facebook" not in data.get("platform_links", {})

    def test_validates_numeric_fields(self, api_client, test_post_id):
        """Test that numeric fields are validated and converted properly"""
        payload = {
            "platform_links": {
                "youtube": {
                    "url": "https://youtube.com/watch?v=test",
                    "views": "invalid",  # Should be converted to 0
                    "likes": 50,
                    "comments": "abc",  # Should be converted to 0
                    "shares": 10
                }
            }
        }
        response = api_client.put(f"{BASE_URL}/api/marketing/posts/{test_post_id}/links", json=payload)
        assert response.status_code == 200
        
        data = response.json()
        assert "youtube" in data["platform_links"]
        # Invalid values should be converted to 0
        assert data["platform_links"]["youtube"]["views"] == 0
        assert data["platform_links"]["youtube"]["comments"] == 0
        # Valid values should be preserved
        assert data["platform_links"]["youtube"]["likes"] == 50
        assert data["platform_links"]["youtube"]["shares"] == 10

    def test_merges_with_existing_links_data(self, api_client, test_post_id):
        """Test that new data merges with existing links data"""
        # First, add linkedin data
        payload1 = {
            "platform_links": {
                "linkedin": {
                    "url": "https://linkedin.com/post/merge-test",
                    "views": 1000,
                    "likes": 100
                }
            }
        }
        response1 = api_client.put(f"{BASE_URL}/api/marketing/posts/{test_post_id}/links", json=payload1)
        assert response1.status_code == 200
        
        # Now add instagram data - linkedin should still be there
        payload2 = {
            "platform_links": {
                "instagram": {
                    "url": "https://instagram.com/p/merge-test",
                    "views": 2000,
                    "likes": 200
                }
            }
        }
        response2 = api_client.put(f"{BASE_URL}/api/marketing/posts/{test_post_id}/links", json=payload2)
        assert response2.status_code == 200
        
        data = response2.json()
        # Both platforms should have data
        assert "linkedin" in data["platform_links"]
        assert "instagram" in data["platform_links"]
        assert data["platform_links"]["linkedin"]["url"] == "https://linkedin.com/post/merge-test"
        assert data["platform_links"]["instagram"]["url"] == "https://instagram.com/p/merge-test"

    def test_updates_existing_platform_metrics(self, api_client, test_post_id):
        """Test that updating a platform merges/updates its metrics"""
        # First set initial data
        payload1 = {
            "platform_links": {
                "youtube": {
                    "url": "https://youtube.com/watch?v=update-test",
                    "views": 500,
                    "likes": 50
                }
            }
        }
        api_client.put(f"{BASE_URL}/api/marketing/posts/{test_post_id}/links", json=payload1)
        
        # Now update with new metrics
        payload2 = {
            "platform_links": {
                "youtube": {
                    "views": 1000,  # Updated
                    "comments": 25  # New field
                }
            }
        }
        response = api_client.put(f"{BASE_URL}/api/marketing/posts/{test_post_id}/links", json=payload2)
        assert response.status_code == 200
        
        data = response.json()
        yt = data["platform_links"]["youtube"]
        # Updated field
        assert yt["views"] == 1000
        # New field
        assert yt["comments"] == 25
        # Existing field should be preserved
        assert yt["likes"] == 50
        # URL should be preserved
        assert yt["url"] == "https://youtube.com/watch?v=update-test"

    def test_returns_404_for_nonexistent_post(self, api_client):
        """Test that 404 is returned for non-existent post"""
        payload = {
            "platform_links": {
                "linkedin": {"url": "https://test.com"}
            }
        }
        response = api_client.put(f"{BASE_URL}/api/marketing/posts/nonexistent-post-id/links", json=payload)
        assert response.status_code == 404

    def test_invalid_platform_links_format(self, api_client, test_post_id):
        """Test that invalid platform_links format returns error"""
        payload = {
            "platform_links": "invalid-string"  # Should be dict
        }
        response = api_client.put(f"{BASE_URL}/api/marketing/posts/{test_post_id}/links", json=payload)
        assert response.status_code == 400


class TestGetPostWithLinks:
    """Tests for GET /api/marketing/posts/{post_id} returning platform_links"""

    def test_get_post_returns_platform_links(self, api_client):
        """Test that GET post returns platform_links in response"""
        response = api_client.get(f"{BASE_URL}/api/marketing/posts/{POST_WITH_LINKS}")
        assert response.status_code == 200
        
        data = response.json()
        assert "platform_links" in data
        assert isinstance(data["platform_links"], dict)

    def test_post_with_links_has_analytics_data(self, api_client):
        """Test that post with links has analytics data"""
        response = api_client.get(f"{BASE_URL}/api/marketing/posts/{POST_WITH_LINKS}")
        assert response.status_code == 200
        
        data = response.json()
        platform_links = data.get("platform_links", {})
        
        # Check that at least one platform has analytics data
        has_analytics = False
        for platform, metrics in platform_links.items():
            if isinstance(metrics, dict):
                if any(key in metrics for key in ["views", "likes", "comments", "shares", "subscribers_added"]):
                    has_analytics = True
                    break
        
        # If the post has links, it should have some analytics
        if platform_links:
            assert has_analytics, "Post with links should have analytics data"

    def test_new_post_has_empty_platform_links(self, api_client):
        """Test that newly created post has empty platform_links"""
        # Create a new post
        response = api_client.post(f"{BASE_URL}/api/marketing/posts", json={
            "post_date": "2026-04-21",
            "category": "Water",
            "content_type": "image",
            "concept": "TEST_New post for empty links test",
            "platforms": ["linkedin", "instagram"],
            "status": "draft"
        })
        assert response.status_code == 200
        
        data = response.json()
        post_id = data.get("id")
        
        # Verify platform_links is empty dict
        assert data.get("platform_links") == {} or data.get("platform_links") is None or data.get("platform_links") == {}
        
        # Cleanup
        api_client.delete(f"{BASE_URL}/api/marketing/posts/{post_id}")


class TestPlatformLinksEdgeCases:
    """Edge case tests for platform links"""

    def test_empty_platform_links_payload(self, api_client, test_post_id):
        """Test sending empty platform_links"""
        payload = {"platform_links": {}}
        response = api_client.put(f"{BASE_URL}/api/marketing/posts/{test_post_id}/links", json=payload)
        assert response.status_code == 200

    def test_url_only_without_analytics(self, api_client, test_post_id):
        """Test saving URL without analytics metrics"""
        payload = {
            "platform_links": {
                "instagram": {
                    "url": "https://instagram.com/p/url-only-test"
                }
            }
        }
        response = api_client.put(f"{BASE_URL}/api/marketing/posts/{test_post_id}/links", json=payload)
        assert response.status_code == 200
        
        data = response.json()
        assert data["platform_links"]["instagram"]["url"] == "https://instagram.com/p/url-only-test"

    def test_analytics_without_url(self, api_client, test_post_id):
        """Test saving analytics without URL"""
        payload = {
            "platform_links": {
                "linkedin": {
                    "views": 500,
                    "likes": 50
                }
            }
        }
        response = api_client.put(f"{BASE_URL}/api/marketing/posts/{test_post_id}/links", json=payload)
        assert response.status_code == 200
        
        data = response.json()
        assert data["platform_links"]["linkedin"]["views"] == 500
        assert data["platform_links"]["linkedin"]["likes"] == 50

    def test_zero_values_for_analytics(self, api_client, test_post_id):
        """Test that zero values are accepted for analytics"""
        payload = {
            "platform_links": {
                "youtube": {
                    "url": "https://youtube.com/watch?v=zero-test",
                    "views": 0,
                    "likes": 0,
                    "comments": 0,
                    "shares": 0,
                    "subscribers_added": 0
                }
            }
        }
        response = api_client.put(f"{BASE_URL}/api/marketing/posts/{test_post_id}/links", json=payload)
        assert response.status_code == 200
        
        data = response.json()
        yt = data["platform_links"]["youtube"]
        assert yt["views"] == 0
        assert yt["likes"] == 0
        assert yt["comments"] == 0
        assert yt["shares"] == 0
        assert yt["subscribers_added"] == 0

    def test_large_analytics_values(self, api_client, test_post_id):
        """Test that large analytics values are handled"""
        payload = {
            "platform_links": {
                "linkedin": {
                    "url": "https://linkedin.com/post/viral",
                    "views": 10000000,
                    "likes": 500000,
                    "comments": 25000,
                    "shares": 100000,
                    "subscribers_added": 50000
                }
            }
        }
        response = api_client.put(f"{BASE_URL}/api/marketing/posts/{test_post_id}/links", json=payload)
        assert response.status_code == 200
        
        data = response.json()
        li = data["platform_links"]["linkedin"]
        assert li["views"] == 10000000
        assert li["likes"] == 500000


if __name__ == "__main__":
    pytest.main([__file__, "-v"])
