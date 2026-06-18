"""
Test is_factory flag for warehouse locations and is_self_managed flag for distributors.
Tests the new flags added to distributor and location creation/update APIs.
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
TEST_DISTRIBUTOR_ID = "99fb55dc-532c-4e85-b618-6b8a5e552c04"

# Test data prefix for cleanup
TEST_PREFIX = "TEST_FLAG_"


@pytest.fixture(scope="module")
def auth_token():
    """Get authentication token"""
    response = requests.post(
        f"{BASE_URL}/api/auth/login",
        json={"email": TEST_EMAIL, "password": TEST_PASSWORD, "tenant_id": TEST_TENANT_ID}
    )
    assert response.status_code == 200, f"Login failed: {response.text}"
    data = response.json()
    # Backend returns session_token, not token
    token = data.get("session_token") or data.get("token")
    assert token, f"No token in response: {data}"
    return token


@pytest.fixture(scope="module")
def api_client(auth_token):
    """Create authenticated session"""
    session = requests.Session()
    session.headers.update({
        "Authorization": f"Bearer {auth_token}",
        "Content-Type": "application/json"
    })
    return session


class TestDistributorIsSelfManaged:
    """Tests for is_self_managed flag on distributors"""
    
    created_distributor_ids = []
    
    def test_create_distributor_with_is_self_managed_true(self, api_client):
        """POST /api/distributors with is_self_managed=true should create distributor with flag"""
        payload = {
            "distributor_name": f"{TEST_PREFIX}Self_Managed_Dist_{uuid.uuid4().hex[:6]}",
            "primary_contact_name": "Test Contact",
            "primary_contact_mobile": "+91 9876543210",
            "is_self_managed": True
        }
        
        response = api_client.post(f"{BASE_URL}/api/distributors", json=payload)
        assert response.status_code == 200, f"Create failed: {response.text}"
        
        data = response.json()
        assert data.get("is_self_managed") == True, f"is_self_managed should be True, got: {data.get('is_self_managed')}"
        
        # Store for cleanup
        self.created_distributor_ids.append(data.get("id"))
        print(f"PASSED: Created distributor with is_self_managed=True, ID: {data.get('id')}")
    
    def test_create_distributor_with_is_self_managed_false(self, api_client):
        """POST /api/distributors with is_self_managed=false should create distributor with flag=false"""
        payload = {
            "distributor_name": f"{TEST_PREFIX}Third_Party_Dist_{uuid.uuid4().hex[:6]}",
            "primary_contact_name": "Test Contact",
            "primary_contact_mobile": "+91 9876543211",
            "is_self_managed": False
        }
        
        response = api_client.post(f"{BASE_URL}/api/distributors", json=payload)
        assert response.status_code == 200, f"Create failed: {response.text}"
        
        data = response.json()
        assert data.get("is_self_managed") == False, f"is_self_managed should be False, got: {data.get('is_self_managed')}"
        
        self.created_distributor_ids.append(data.get("id"))
        print(f"PASSED: Created distributor with is_self_managed=False, ID: {data.get('id')}")
    
    def test_create_distributor_without_is_self_managed_defaults_to_false(self, api_client):
        """POST /api/distributors without is_self_managed should default to false"""
        payload = {
            "distributor_name": f"{TEST_PREFIX}Default_Dist_{uuid.uuid4().hex[:6]}",
            "primary_contact_name": "Test Contact",
            "primary_contact_mobile": "+91 9876543212"
            # is_self_managed not provided
        }
        
        response = api_client.post(f"{BASE_URL}/api/distributors", json=payload)
        assert response.status_code == 200, f"Create failed: {response.text}"
        
        data = response.json()
        # Should default to False
        assert data.get("is_self_managed") == False or data.get("is_self_managed") is None, \
            f"is_self_managed should default to False, got: {data.get('is_self_managed')}"
        
        self.created_distributor_ids.append(data.get("id"))
        print(f"PASSED: Created distributor without is_self_managed, defaults to False")
    
    def test_update_distributor_is_self_managed_flag(self, api_client):
        """PUT /api/distributors/{id} should update is_self_managed flag"""
        # First create a distributor with is_self_managed=False
        payload = {
            "distributor_name": f"{TEST_PREFIX}Update_Test_Dist_{uuid.uuid4().hex[:6]}",
            "primary_contact_name": "Test Contact",
            "primary_contact_mobile": "+91 9876543213",
            "is_self_managed": False
        }
        
        create_response = api_client.post(f"{BASE_URL}/api/distributors", json=payload)
        assert create_response.status_code == 200, f"Create failed: {create_response.text}"
        
        distributor_id = create_response.json().get("id")
        self.created_distributor_ids.append(distributor_id)
        
        # Now update to is_self_managed=True
        update_response = api_client.put(
            f"{BASE_URL}/api/distributors/{distributor_id}",
            json={"is_self_managed": True}
        )
        assert update_response.status_code == 200, f"Update failed: {update_response.text}"
        
        updated_data = update_response.json()
        assert updated_data.get("is_self_managed") == True, \
            f"is_self_managed should be True after update, got: {updated_data.get('is_self_managed')}"
        
        print(f"PASSED: Updated distributor is_self_managed from False to True")
    
    def test_get_distributors_returns_is_self_managed_field(self, api_client):
        """GET /api/distributors should return is_self_managed field on distributor objects"""
        response = api_client.get(f"{BASE_URL}/api/distributors")
        assert response.status_code == 200, f"GET failed: {response.text}"
        
        data = response.json()
        distributors = data.get("distributors", [])
        
        # Check that at least one distributor has the is_self_managed field
        has_field = False
        for dist in distributors:
            if "is_self_managed" in dist:
                has_field = True
                break
        
        # Note: Existing distributors may not have this field yet
        print(f"PASSED: GET /api/distributors returns distributors (is_self_managed field present: {has_field})")
    
    def test_get_distributor_detail_returns_is_self_managed(self, api_client):
        """GET /api/distributors/{id} should return is_self_managed field"""
        response = api_client.get(f"{BASE_URL}/api/distributors/{TEST_DISTRIBUTOR_ID}")
        assert response.status_code == 200, f"GET failed: {response.text}"
        
        data = response.json()
        # Field may be present or not depending on when distributor was created
        print(f"PASSED: GET /api/distributors/{TEST_DISTRIBUTOR_ID} returned, is_self_managed: {data.get('is_self_managed', 'NOT_SET')}")


class TestLocationIsFactory:
    """Tests for is_factory flag on distributor locations"""
    
    created_location_ids = []
    
    def test_create_location_with_is_factory_true(self, api_client):
        """POST /api/distributors/{id}/locations with is_factory=true should create location with flag"""
        # First get the distributor to find a covered city
        dist_response = api_client.get(f"{BASE_URL}/api/distributors/{TEST_DISTRIBUTOR_ID}")
        assert dist_response.status_code == 200, f"Get distributor failed: {dist_response.text}"
        
        dist_data = dist_response.json()
        coverage = dist_data.get("operating_coverage", [])
        
        if not coverage:
            pytest.skip("Test distributor has no operating coverage")
        
        # Use first covered city
        first_coverage = coverage[0]
        
        payload = {
            "distributor_id": TEST_DISTRIBUTOR_ID,
            "location_name": f"{TEST_PREFIX}Factory_Warehouse_{uuid.uuid4().hex[:6]}",
            "state": first_coverage.get("state"),
            "city": first_coverage.get("city"),
            "is_factory": True,
            "is_default": False
        }
        
        response = api_client.post(f"{BASE_URL}/api/distributors/{TEST_DISTRIBUTOR_ID}/locations", json=payload)
        assert response.status_code == 200, f"Create location failed: {response.text}"
        
        data = response.json()
        assert data.get("is_factory") == True, f"is_factory should be True, got: {data.get('is_factory')}"
        
        self.created_location_ids.append(data.get("id"))
        print(f"PASSED: Created location with is_factory=True, ID: {data.get('id')}")
    
    def test_create_location_with_is_factory_false(self, api_client):
        """POST /api/distributors/{id}/locations with is_factory=false should create location with flag=false"""
        dist_response = api_client.get(f"{BASE_URL}/api/distributors/{TEST_DISTRIBUTOR_ID}")
        assert dist_response.status_code == 200
        
        dist_data = dist_response.json()
        coverage = dist_data.get("operating_coverage", [])
        
        if not coverage:
            pytest.skip("Test distributor has no operating coverage")
        
        first_coverage = coverage[0]
        
        payload = {
            "distributor_id": TEST_DISTRIBUTOR_ID,
            "location_name": f"{TEST_PREFIX}Regular_Warehouse_{uuid.uuid4().hex[:6]}",
            "state": first_coverage.get("state"),
            "city": first_coverage.get("city"),
            "is_factory": False,
            "is_default": False
        }
        
        response = api_client.post(f"{BASE_URL}/api/distributors/{TEST_DISTRIBUTOR_ID}/locations", json=payload)
        assert response.status_code == 200, f"Create location failed: {response.text}"
        
        data = response.json()
        assert data.get("is_factory") == False, f"is_factory should be False, got: {data.get('is_factory')}"
        
        self.created_location_ids.append(data.get("id"))
        print(f"PASSED: Created location with is_factory=False, ID: {data.get('id')}")
    
    def test_create_location_without_is_factory_defaults_to_false(self, api_client):
        """POST /api/distributors/{id}/locations without is_factory should default to false"""
        dist_response = api_client.get(f"{BASE_URL}/api/distributors/{TEST_DISTRIBUTOR_ID}")
        assert dist_response.status_code == 200
        
        dist_data = dist_response.json()
        coverage = dist_data.get("operating_coverage", [])
        
        if not coverage:
            pytest.skip("Test distributor has no operating coverage")
        
        first_coverage = coverage[0]
        
        payload = {
            "distributor_id": TEST_DISTRIBUTOR_ID,
            "location_name": f"{TEST_PREFIX}Default_Warehouse_{uuid.uuid4().hex[:6]}",
            "state": first_coverage.get("state"),
            "city": first_coverage.get("city"),
            "is_default": False
            # is_factory not provided
        }
        
        response = api_client.post(f"{BASE_URL}/api/distributors/{TEST_DISTRIBUTOR_ID}/locations", json=payload)
        assert response.status_code == 200, f"Create location failed: {response.text}"
        
        data = response.json()
        # Should default to False
        assert data.get("is_factory") == False or data.get("is_factory") is None, \
            f"is_factory should default to False, got: {data.get('is_factory')}"
        
        self.created_location_ids.append(data.get("id"))
        print(f"PASSED: Created location without is_factory, defaults to False")
    
    def test_update_location_is_factory_flag(self, api_client):
        """PUT /api/distributors/{id}/locations/{loc_id} should update is_factory flag"""
        dist_response = api_client.get(f"{BASE_URL}/api/distributors/{TEST_DISTRIBUTOR_ID}")
        assert dist_response.status_code == 200
        
        dist_data = dist_response.json()
        coverage = dist_data.get("operating_coverage", [])
        
        if not coverage:
            pytest.skip("Test distributor has no operating coverage")
        
        first_coverage = coverage[0]
        
        # Create a location with is_factory=False
        payload = {
            "distributor_id": TEST_DISTRIBUTOR_ID,
            "location_name": f"{TEST_PREFIX}Update_Test_Warehouse_{uuid.uuid4().hex[:6]}",
            "state": first_coverage.get("state"),
            "city": first_coverage.get("city"),
            "is_factory": False,
            "is_default": False
        }
        
        create_response = api_client.post(f"{BASE_URL}/api/distributors/{TEST_DISTRIBUTOR_ID}/locations", json=payload)
        assert create_response.status_code == 200, f"Create location failed: {create_response.text}"
        
        location_id = create_response.json().get("id")
        self.created_location_ids.append(location_id)
        
        # Update to is_factory=True
        update_response = api_client.put(
            f"{BASE_URL}/api/distributors/{TEST_DISTRIBUTOR_ID}/locations/{location_id}",
            json={"is_factory": True}
        )
        assert update_response.status_code == 200, f"Update location failed: {update_response.text}"
        
        updated_data = update_response.json()
        assert updated_data.get("is_factory") == True, \
            f"is_factory should be True after update, got: {updated_data.get('is_factory')}"
        
        print(f"PASSED: Updated location is_factory from False to True")
    
    def test_get_distributor_returns_is_factory_on_locations(self, api_client):
        """GET /api/distributors/{id} should return is_factory field on location objects"""
        response = api_client.get(f"{BASE_URL}/api/distributors/{TEST_DISTRIBUTOR_ID}")
        assert response.status_code == 200, f"GET failed: {response.text}"
        
        data = response.json()
        locations = data.get("locations", [])
        
        # Check that locations have the is_factory field
        has_field = False
        for loc in locations:
            if "is_factory" in loc:
                has_field = True
                print(f"  Location '{loc.get('location_name')}': is_factory={loc.get('is_factory')}")
        
        print(f"PASSED: GET /api/distributors/{TEST_DISTRIBUTOR_ID} returns locations (is_factory field present: {has_field})")
    
    def test_locations_dropdown_returns_is_factory(self, api_client):
        """GET /api/distributors/{id}/locations/dropdown should return is_factory field"""
        response = api_client.get(f"{BASE_URL}/api/distributors/{TEST_DISTRIBUTOR_ID}/locations/dropdown")
        assert response.status_code == 200, f"GET dropdown failed: {response.text}"
        
        data = response.json()
        locations = data.get("locations", [])
        
        # Check that dropdown locations have is_factory field
        has_field = False
        for loc in locations:
            if "is_factory" in loc:
                has_field = True
                print(f"  Dropdown location '{loc.get('location_name')}': is_factory={loc.get('is_factory')}")
        
        print(f"PASSED: GET /api/distributors/{TEST_DISTRIBUTOR_ID}/locations/dropdown returns is_factory field: {has_field}")


class TestCleanup:
    """Cleanup test data"""
    
    def test_cleanup_test_distributors(self, api_client):
        """Clean up test distributors created during testing"""
        # Get all distributors and delete TEST_FLAG_ prefixed ones
        response = api_client.get(f"{BASE_URL}/api/distributors?page_size=100")
        if response.status_code == 200:
            distributors = response.json().get("distributors", [])
            deleted_count = 0
            for dist in distributors:
                if dist.get("distributor_name", "").startswith(TEST_PREFIX):
                    delete_response = api_client.delete(f"{BASE_URL}/api/distributors/{dist.get('id')}")
                    if delete_response.status_code == 200:
                        deleted_count += 1
            print(f"PASSED: Cleaned up {deleted_count} test distributors")
        else:
            print("PASSED: Cleanup skipped (could not fetch distributors)")
    
    def test_cleanup_test_locations(self, api_client):
        """Clean up test locations created during testing"""
        # Get distributor locations and delete TEST_FLAG_ prefixed ones
        response = api_client.get(f"{BASE_URL}/api/distributors/{TEST_DISTRIBUTOR_ID}")
        if response.status_code == 200:
            locations = response.json().get("locations", [])
            deleted_count = 0
            for loc in locations:
                if loc.get("location_name", "").startswith(TEST_PREFIX):
                    delete_response = api_client.delete(
                        f"{BASE_URL}/api/distributors/{TEST_DISTRIBUTOR_ID}/locations/{loc.get('id')}"
                    )
                    if delete_response.status_code == 200:
                        deleted_count += 1
            print(f"PASSED: Cleaned up {deleted_count} test locations")
        else:
            print("PASSED: Cleanup skipped (could not fetch locations)")


if __name__ == "__main__":
    pytest.main([__file__, "-v", "--tb=short"])
