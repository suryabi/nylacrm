"""
Distributor User Access Tests
Tests for:
1. Distributor user login with default password 'nyladist##'
2. Login response includes force_password_change flag and distributor_id
3. Distributor user can only see their own distributor data
4. Distributor user cannot access other distributors
5. Distributor user has distributor_id linked to their user record
"""
import pytest
import requests
import os

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL').rstrip('/')

# Test credentials
ADMIN_EMAIL = "surya.yadavalli@nylaairwater.earth"
ADMIN_PASSWORD = "test123"
DISTRIBUTOR_EMAIL = "john.distributor@test.com"
DISTRIBUTOR_PASSWORD = "nyladist##"
DISTRIBUTOR_ID = "bb12d90e-4d33-4890-ac5f-17573c551b5c"


class TestDistributorUserLogin:
    """Test distributor user login functionality"""
    
    def test_distributor_login_with_default_password(self):
        """Test that distributor user can login with default password 'nyladist##'"""
        response = requests.post(f"{BASE_URL}/api/auth/login", json={
            "email": DISTRIBUTOR_EMAIL,
            "password": DISTRIBUTOR_PASSWORD
        })
        
        print(f"Login response status: {response.status_code}")
        print(f"Login response: {response.json()}")
        
        assert response.status_code == 200, f"Login failed: {response.text}"
        
        data = response.json()
        assert "user" in data, "Response should contain user object"
        assert "session_token" in data, "Response should contain session_token"
        
    def test_login_response_includes_force_password_change(self):
        """Test that login response includes force_password_change flag"""
        response = requests.post(f"{BASE_URL}/api/auth/login", json={
            "email": DISTRIBUTOR_EMAIL,
            "password": DISTRIBUTOR_PASSWORD
        })
        
        assert response.status_code == 200
        data = response.json()
        
        # Check force_password_change is in response
        assert "force_password_change" in data, "Response should include force_password_change flag"
        print(f"force_password_change: {data['force_password_change']}")
        
        # For new distributor users, this should be True
        assert data["force_password_change"] == True, "New distributor user should have force_password_change=True"
        
    def test_login_response_includes_distributor_id(self):
        """Test that login response includes distributor_id for distributor users"""
        response = requests.post(f"{BASE_URL}/api/auth/login", json={
            "email": DISTRIBUTOR_EMAIL,
            "password": DISTRIBUTOR_PASSWORD
        })
        
        assert response.status_code == 200
        data = response.json()
        
        # Check distributor_id is in response
        assert "distributor_id" in data, "Response should include distributor_id"
        print(f"distributor_id: {data['distributor_id']}")
        
        # Verify it matches the expected distributor
        assert data["distributor_id"] == DISTRIBUTOR_ID, f"distributor_id should be {DISTRIBUTOR_ID}"
        
    def test_user_has_distributor_role(self):
        """Test that distributor user has role='Distributor'"""
        response = requests.post(f"{BASE_URL}/api/auth/login", json={
            "email": DISTRIBUTOR_EMAIL,
            "password": DISTRIBUTOR_PASSWORD
        })
        
        assert response.status_code == 200
        data = response.json()
        
        user = data["user"]
        assert user["role"] == "Distributor", f"User role should be 'Distributor', got '{user['role']}'"
        print(f"User role: {user['role']}")


class TestDistributorDataAccess:
    """Test distributor user data access restrictions"""
    
    @pytest.fixture
    def distributor_session(self):
        """Get authenticated session for distributor user"""
        session = requests.Session()
        response = session.post(f"{BASE_URL}/api/auth/login", json={
            "email": DISTRIBUTOR_EMAIL,
            "password": DISTRIBUTOR_PASSWORD
        })
        assert response.status_code == 200, f"Login failed: {response.text}"
        return session
    
    @pytest.fixture
    def admin_session(self):
        """Get authenticated session for admin user"""
        session = requests.Session()
        response = session.post(f"{BASE_URL}/api/auth/login", json={
            "email": ADMIN_EMAIL,
            "password": ADMIN_PASSWORD
        })
        assert response.status_code == 200, f"Admin login failed: {response.text}"
        return session
    
    def test_distributor_can_list_only_own_distributor(self, distributor_session):
        """Test that distributor user can only see their own distributor in list"""
        response = distributor_session.get(f"{BASE_URL}/api/distributors")
        
        print(f"List distributors response status: {response.status_code}")
        print(f"List distributors response: {response.json()}")
        
        assert response.status_code == 200
        data = response.json()
        
        # Should only return 1 distributor (their own)
        assert data["total"] == 1, f"Distributor user should only see 1 distributor, got {data['total']}"
        assert len(data["distributors"]) == 1, "Should only have 1 distributor in list"
        
        # Verify it's their own distributor
        distributor = data["distributors"][0]
        assert distributor["id"] == DISTRIBUTOR_ID, f"Should only see own distributor {DISTRIBUTOR_ID}"
        print(f"Distributor sees: {distributor['distributor_name']}")
        
    def test_distributor_can_view_own_profile(self, distributor_session):
        """Test that distributor user can view their own distributor profile"""
        response = distributor_session.get(f"{BASE_URL}/api/distributors/{DISTRIBUTOR_ID}")
        
        print(f"Get own distributor response status: {response.status_code}")
        
        assert response.status_code == 200
        data = response.json()
        
        assert data["id"] == DISTRIBUTOR_ID
        print(f"Distributor profile: {data['distributor_name']}")
        
    def test_distributor_cannot_access_other_distributors(self, distributor_session, admin_session):
        """Test that distributor user cannot access other distributors"""
        # First, get list of all distributors as admin to find another distributor
        admin_response = admin_session.get(f"{BASE_URL}/api/distributors")
        assert admin_response.status_code == 200
        
        admin_data = admin_response.json()
        other_distributors = [d for d in admin_data["distributors"] if d["id"] != DISTRIBUTOR_ID]
        
        if len(other_distributors) == 0:
            pytest.skip("No other distributors to test access restriction")
        
        other_distributor_id = other_distributors[0]["id"]
        print(f"Testing access to other distributor: {other_distributor_id}")
        
        # Try to access another distributor as distributor user
        response = distributor_session.get(f"{BASE_URL}/api/distributors/{other_distributor_id}")
        
        print(f"Access other distributor response status: {response.status_code}")
        print(f"Access other distributor response: {response.text}")
        
        # Should be forbidden
        assert response.status_code == 403, f"Should get 403 Forbidden, got {response.status_code}"
        
    def test_distributor_can_view_own_coverage(self, distributor_session):
        """Test that distributor user can view their own coverage"""
        response = distributor_session.get(f"{BASE_URL}/api/distributors/{DISTRIBUTOR_ID}/coverage")
        
        print(f"Get coverage response status: {response.status_code}")
        
        assert response.status_code == 200
        data = response.json()
        assert "coverage" in data
        print(f"Coverage count: {len(data['coverage'])}")
        
    def test_distributor_can_view_own_locations(self, distributor_session):
        """Test that distributor user can view their own locations"""
        response = distributor_session.get(f"{BASE_URL}/api/distributors/{DISTRIBUTOR_ID}/locations")
        
        print(f"Get locations response status: {response.status_code}")
        
        assert response.status_code == 200
        data = response.json()
        assert "locations" in data
        print(f"Locations count: {len(data['locations'])}")
        
    def test_distributor_can_view_own_shipments(self, distributor_session):
        """Test that distributor user can view their own shipments (stock in)"""
        response = distributor_session.get(f"{BASE_URL}/api/distributors/{DISTRIBUTOR_ID}/shipments")
        
        print(f"Get shipments response status: {response.status_code}")
        
        assert response.status_code == 200
        data = response.json()
        assert "shipments" in data
        print(f"Shipments count: {data['total']}")
        
    def test_distributor_can_view_own_settlements(self, distributor_session):
        """Test that distributor user can view their own settlements"""
        response = distributor_session.get(f"{BASE_URL}/api/distributors/{DISTRIBUTOR_ID}/settlements")
        
        print(f"Get settlements response status: {response.status_code}")
        
        assert response.status_code == 200
        data = response.json()
        assert "settlements" in data
        print(f"Settlements count: {len(data['settlements'])}")


class TestAdminVsDistributorAccess:
    """Compare admin vs distributor access levels"""
    
    @pytest.fixture
    def admin_session(self):
        """Get authenticated session for admin user"""
        session = requests.Session()
        response = session.post(f"{BASE_URL}/api/auth/login", json={
            "email": ADMIN_EMAIL,
            "password": ADMIN_PASSWORD
        })
        assert response.status_code == 200
        return session
    
    @pytest.fixture
    def distributor_session(self):
        """Get authenticated session for distributor user"""
        session = requests.Session()
        response = session.post(f"{BASE_URL}/api/auth/login", json={
            "email": DISTRIBUTOR_EMAIL,
            "password": DISTRIBUTOR_PASSWORD
        })
        assert response.status_code == 200
        return session
    
    def test_admin_sees_all_distributors(self, admin_session):
        """Test that admin can see all distributors"""
        response = admin_session.get(f"{BASE_URL}/api/distributors")
        
        assert response.status_code == 200
        data = response.json()
        
        print(f"Admin sees {data['total']} distributors")
        assert data["total"] >= 1, "Admin should see at least 1 distributor"
        
    def test_distributor_sees_only_one(self, distributor_session):
        """Test that distributor sees only their own"""
        response = distributor_session.get(f"{BASE_URL}/api/distributors")
        
        assert response.status_code == 200
        data = response.json()
        
        print(f"Distributor sees {data['total']} distributors")
        assert data["total"] == 1, "Distributor should see exactly 1 distributor"
        
    def test_distributor_cannot_create_distributor(self, distributor_session):
        """Test that distributor user cannot create new distributors"""
        response = distributor_session.post(f"{BASE_URL}/api/distributors", json={
            "distributor_name": "Test Unauthorized Create",
            "legal_entity_name": "Test Entity",
            "primary_contact_name": "Test Contact",
            "primary_contact_mobile": "9999999999",
            "primary_contact_email": "test@test.com"
        })
        
        print(f"Create distributor response status: {response.status_code}")
        
        # Should be forbidden (403) - only admins can create
        assert response.status_code == 403, f"Should get 403 Forbidden, got {response.status_code}"


if __name__ == "__main__":
    pytest.main([__file__, "-v", "--tb=short"])
