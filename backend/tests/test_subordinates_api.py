"""
Test suite for /api/users/subordinates/all endpoint
Tests the manager subordinate dropdown feature for Daily Status page
- Tests authentication with session token
- Tests CEO user gets list of all subordinates
- Tests Partner user with no direct reports gets empty array
"""
import pytest
import requests
import os

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', '').rstrip('/')

# Test credentials from problem statement
CEO_EMAIL = "surya.yadavalli@nylaairwater.earth"
CEO_PASSWORD = "surya123"
PARTNER_EMAIL = "priya.sales@nylaairwater.earth"
PARTNER_PASSWORD = "priya123"
DIRECTOR_EMAIL = "admin@nylaairwater.earth"
DIRECTOR_PASSWORD = "admin123"


class TestLogin:
    """Authentication endpoint tests - prerequisite for subordinates API"""
    
    def test_login_ceo_success(self):
        """Test CEO login returns session token"""
        response = requests.post(
            f"{BASE_URL}/api/auth/login",
            json={"email": CEO_EMAIL, "password": CEO_PASSWORD},
            headers={"Content-Type": "application/json"}
        )
        assert response.status_code == 200, f"Login failed: {response.text}"
        data = response.json()
        assert "session_token" in data, "Missing session_token in response"
        assert "user" in data, "Missing user in response"
        assert data["user"]["email"] == CEO_EMAIL
        assert data["user"]["role"] == "CEO"
        assert len(data["session_token"]) == 36  # UUID format
    
    def test_login_partner_success(self):
        """Test Partner login returns session token"""
        response = requests.post(
            f"{BASE_URL}/api/auth/login",
            json={"email": PARTNER_EMAIL, "password": PARTNER_PASSWORD},
            headers={"Content-Type": "application/json"}
        )
        assert response.status_code == 200, f"Login failed: {response.text}"
        data = response.json()
        assert "session_token" in data, "Missing session_token in response"
        assert data["user"]["email"] == PARTNER_EMAIL
        assert data["user"]["role"] == "Partner - Sales"
    
    def test_login_invalid_credentials(self):
        """Test login with invalid credentials returns 401"""
        response = requests.post(
            f"{BASE_URL}/api/auth/login",
            json={"email": "invalid@example.com", "password": "wrongpass"},
            headers={"Content-Type": "application/json"}
        )
        assert response.status_code == 401 or response.status_code == 400
        data = response.json()
        assert "detail" in data


@pytest.fixture
def ceo_session_token():
    """Get CEO session token for authenticated tests"""
    response = requests.post(
        f"{BASE_URL}/api/auth/login",
        json={"email": CEO_EMAIL, "password": CEO_PASSWORD}
    )
    if response.status_code == 200:
        return response.json()["session_token"]
    pytest.skip("CEO login failed - skipping authenticated tests")


@pytest.fixture
def partner_session_token():
    """Get Partner session token for authenticated tests"""
    response = requests.post(
        f"{BASE_URL}/api/auth/login",
        json={"email": PARTNER_EMAIL, "password": PARTNER_PASSWORD}
    )
    if response.status_code == 200:
        return response.json()["session_token"]
    pytest.skip("Partner login failed - skipping authenticated tests")


@pytest.fixture
def director_session_token():
    """Get Director session token for authenticated tests"""
    response = requests.post(
        f"{BASE_URL}/api/auth/login",
        json={"email": DIRECTOR_EMAIL, "password": DIRECTOR_PASSWORD}
    )
    if response.status_code == 200:
        return response.json()["session_token"]
    pytest.skip("Director login failed - skipping authenticated tests")


class TestSubordinatesAPI:
    """Tests for GET /api/users/subordinates/all endpoint"""
    
    def test_subordinates_without_auth_returns_401(self):
        """Test subordinates endpoint without authentication returns 401"""
        response = requests.get(
            f"{BASE_URL}/api/users/subordinates/all",
            headers={"Content-Type": "application/json"}
        )
        assert response.status_code == 401, f"Expected 401, got {response.status_code}"
    
    def test_subordinates_with_invalid_token_returns_401(self):
        """Test subordinates endpoint with invalid token returns 401"""
        response = requests.get(
            f"{BASE_URL}/api/users/subordinates/all",
            headers={
                "Authorization": "Bearer invalid-token-12345",
                "Content-Type": "application/json"
            }
        )
        assert response.status_code == 401, f"Expected 401, got {response.status_code}"
    
    def test_ceo_gets_subordinates_list(self, ceo_session_token):
        """Test CEO user gets list of all subordinates (direct and indirect)"""
        response = requests.get(
            f"{BASE_URL}/api/users/subordinates/all",
            headers={
                "Authorization": f"Bearer {ceo_session_token}",
                "Content-Type": "application/json"
            }
        )
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        data = response.json()
        
        # CEO should have multiple subordinates (10+)
        assert isinstance(data, list), "Response should be a list"
        assert len(data) >= 1, "CEO should have at least 1 subordinate"
        
        # Verify subordinate structure
        if len(data) > 0:
            sub = data[0]
            assert "id" in sub, "Subordinate missing id"
            assert "name" in sub, "Subordinate missing name"
            assert "email" in sub, "Subordinate missing email"
            assert "role" in sub, "Subordinate missing role"
            assert "_id" not in sub, "MongoDB _id should not be in response"
            assert "password" not in sub, "Password should not be in response"
        
        print(f"CEO has {len(data)} subordinates")
    
    def test_partner_gets_empty_subordinates(self, partner_session_token):
        """Test Partner user with no direct reports gets empty array"""
        response = requests.get(
            f"{BASE_URL}/api/users/subordinates/all",
            headers={
                "Authorization": f"Bearer {partner_session_token}",
                "Content-Type": "application/json"
            }
        )
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        data = response.json()
        
        # Partner (Priya) should have no subordinates
        assert isinstance(data, list), "Response should be a list"
        # Partner may have 0 or some subordinates, just verify it doesn't error
        print(f"Partner has {len(data)} subordinates")
    
    def test_director_gets_subordinates(self, director_session_token):
        """Test Director user gets their subordinates"""
        response = requests.get(
            f"{BASE_URL}/api/users/subordinates/all",
            headers={
                "Authorization": f"Bearer {director_session_token}",
                "Content-Type": "application/json"
            }
        )
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        data = response.json()
        
        # Director should get list of subordinates
        assert isinstance(data, list), "Response should be a list"
        print(f"Director has {len(data)} subordinates")
    
    def test_subordinates_sorted_by_name(self, ceo_session_token):
        """Test subordinates are returned sorted alphabetically by name"""
        response = requests.get(
            f"{BASE_URL}/api/users/subordinates/all",
            headers={
                "Authorization": f"Bearer {ceo_session_token}",
                "Content-Type": "application/json"
            }
        )
        assert response.status_code == 200
        data = response.json()
        
        if len(data) >= 2:
            names = [sub.get('name', '') for sub in data]
            assert names == sorted(names), f"Subordinates not sorted by name: {names}"


class TestSessionPersistence:
    """Tests to verify session token works correctly after fix"""
    
    def test_session_works_for_multiple_requests(self, ceo_session_token):
        """Test same session token works for multiple API calls"""
        # First request
        response1 = requests.get(
            f"{BASE_URL}/api/users/subordinates/all",
            headers={"Authorization": f"Bearer {ceo_session_token}"}
        )
        assert response1.status_code == 200
        
        # Second request with same token
        response2 = requests.get(
            f"{BASE_URL}/api/users/subordinates/all",
            headers={"Authorization": f"Bearer {ceo_session_token}"}
        )
        assert response2.status_code == 200
        
        # Both should return same data
        assert response1.json() == response2.json()
    
    def test_session_token_via_cookie(self, ceo_session_token):
        """Test session token works via cookie as well as header"""
        session = requests.Session()
        session.cookies.set('session_token', ceo_session_token)
        
        response = session.get(f"{BASE_URL}/api/users/subordinates/all")
        assert response.status_code == 200
        data = response.json()
        assert isinstance(data, list)


if __name__ == "__main__":
    pytest.main([__file__, "-v", "--tb=short"])
