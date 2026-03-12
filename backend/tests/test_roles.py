"""
Role Management API Tests
Tests CRUD operations for roles: GET, POST, PUT, DELETE
Testing the fix for ObjectId serialization bug in POST /api/roles
"""
import pytest
import requests
import os
import uuid

# Get BASE_URL from environment
BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', '').rstrip('/')

# Test credentials
TEST_USER_EMAIL = "surya.yadavalli@nylaairwater.earth"
TEST_USER_PASSWORD = "surya123"
TENANT_ID = "nyla-air-water"


@pytest.fixture(scope="module")
def auth_token():
    """Get authentication token"""
    response = requests.post(
        f"{BASE_URL}/api/auth/login",
        json={"email": TEST_USER_EMAIL, "password": TEST_USER_PASSWORD},
        headers={"X-Tenant-ID": TENANT_ID}
    )
    assert response.status_code == 200, f"Login failed: {response.text}"
    data = response.json()
    token = data.get("session_token") or data.get("token")
    assert token, f"No token returned from login. Response: {data}"
    return token


@pytest.fixture(scope="module")
def auth_headers(auth_token):
    """Get headers with auth token"""
    return {
        "Authorization": f"Bearer {auth_token}",
        "X-Tenant-ID": TENANT_ID,
        "Content-Type": "application/json"
    }


class TestRolesListAPI:
    """Test GET /api/roles - List all roles"""
    
    def test_list_roles_returns_200(self, auth_headers):
        """GET /api/roles should return 200 with roles list"""
        response = requests.get(f"{BASE_URL}/api/roles", headers=auth_headers)
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        
        data = response.json()
        assert "roles" in data, "Response should contain 'roles' key"
        assert isinstance(data["roles"], list), "Roles should be a list"
        assert "module_categories" in data, "Response should contain 'module_categories'"
        assert "module_labels" in data, "Response should contain 'module_labels'"
        print(f"PASS: GET /api/roles returned {len(data['roles'])} roles")
    
    def test_roles_have_correct_structure(self, auth_headers):
        """Roles should have id, name, permissions fields"""
        response = requests.get(f"{BASE_URL}/api/roles", headers=auth_headers)
        assert response.status_code == 200
        
        roles = response.json()["roles"]
        if len(roles) > 0:
            role = roles[0]
            assert "id" in role, "Role should have 'id' field"
            assert "name" in role, "Role should have 'name' field"
            assert "tenant_id" in role, "Role should have 'tenant_id' field"
            # Ensure no MongoDB _id field
            assert "_id" not in role, "Role should NOT have MongoDB '_id' field"
            print(f"PASS: Role structure is correct, no _id field")
        else:
            pytest.skip("No roles to test structure")


class TestRolesCreateAPI:
    """Test POST /api/roles - Create new custom role (ObjectId fix verification)"""
    
    def test_create_role_returns_200(self, auth_headers):
        """POST /api/roles should return created role without ObjectId error"""
        unique_name = f"TEST_Role_{uuid.uuid4().hex[:8]}"
        
        response = requests.post(
            f"{BASE_URL}/api/roles",
            headers=auth_headers,
            json={
                "name": unique_name,
                "description": "Test role for automation testing",
                "is_default": False
            }
        )
        
        # This was the bug - used to return 500 due to ObjectId serialization
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        
        data = response.json()
        assert "id" in data, "Created role should have 'id' field"
        assert data["name"] == unique_name, f"Role name should be '{unique_name}'"
        # Ensure no MongoDB _id field in response
        assert "_id" not in data, "Created role should NOT have MongoDB '_id' field"
        
        print(f"PASS: POST /api/roles created role '{unique_name}' without ObjectId error")
        
        # Cleanup - delete the test role
        role_id = data["id"]
        delete_response = requests.delete(
            f"{BASE_URL}/api/roles/{role_id}",
            headers=auth_headers
        )
        print(f"Cleanup: Deleted test role, status: {delete_response.status_code}")
    
    def test_create_role_with_permissions(self, auth_headers):
        """POST /api/roles with custom permissions"""
        unique_name = f"TEST_CustomPerms_{uuid.uuid4().hex[:8]}"
        
        custom_permissions = {
            "leads": {"view": True, "create": True, "edit": False, "delete": False},
            "accounts": {"view": True, "create": False, "edit": False, "delete": False}
        }
        
        response = requests.post(
            f"{BASE_URL}/api/roles",
            headers=auth_headers,
            json={
                "name": unique_name,
                "description": "Test role with custom permissions",
                "permissions": custom_permissions,
                "is_default": False
            }
        )
        
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        
        data = response.json()
        assert data["permissions"] is not None, "Permissions should be set"
        
        print(f"PASS: Created role with custom permissions")
        
        # Cleanup
        requests.delete(f"{BASE_URL}/api/roles/{data['id']}", headers=auth_headers)
    
    def test_create_duplicate_role_returns_400(self, auth_headers):
        """POST /api/roles with duplicate name should return 400"""
        unique_name = f"TEST_Duplicate_{uuid.uuid4().hex[:8]}"
        
        # Create first role
        response1 = requests.post(
            f"{BASE_URL}/api/roles",
            headers=auth_headers,
            json={"name": unique_name, "description": "First role"}
        )
        assert response1.status_code == 200
        role_id = response1.json()["id"]
        
        # Try to create duplicate
        response2 = requests.post(
            f"{BASE_URL}/api/roles",
            headers=auth_headers,
            json={"name": unique_name, "description": "Duplicate role"}
        )
        assert response2.status_code == 400, f"Expected 400 for duplicate, got {response2.status_code}"
        
        print(f"PASS: Duplicate role creation correctly returns 400")
        
        # Cleanup
        requests.delete(f"{BASE_URL}/api/roles/{role_id}", headers=auth_headers)


class TestRolesUpdateAPI:
    """Test PUT /api/roles/{role_id} - Update role permissions"""
    
    def test_update_role_permissions(self, auth_headers):
        """PUT /api/roles/{role_id} should update permissions"""
        # Create a test role first
        unique_name = f"TEST_Update_{uuid.uuid4().hex[:8]}"
        create_response = requests.post(
            f"{BASE_URL}/api/roles",
            headers=auth_headers,
            json={"name": unique_name, "description": "Test role for update"}
        )
        assert create_response.status_code == 200
        role_id = create_response.json()["id"]
        
        # Update permissions
        new_permissions = {
            "leads": {"view": True, "create": True, "edit": True, "delete": True},
            "accounts": {"view": True, "create": True, "edit": True, "delete": False}
        }
        
        update_response = requests.put(
            f"{BASE_URL}/api/roles/{role_id}",
            headers=auth_headers,
            json={"permissions": new_permissions}
        )
        
        assert update_response.status_code == 200, f"Expected 200, got {update_response.status_code}: {update_response.text}"
        
        # Verify update
        get_response = requests.get(f"{BASE_URL}/api/roles/{role_id}", headers=auth_headers)
        assert get_response.status_code == 200
        updated_role = get_response.json()
        assert updated_role["permissions"]["leads"]["delete"] == True
        
        print(f"PASS: PUT /api/roles/{role_id} updated permissions successfully")
        
        # Cleanup
        requests.delete(f"{BASE_URL}/api/roles/{role_id}", headers=auth_headers)
    
    def test_update_nonexistent_role_returns_404(self, auth_headers):
        """PUT /api/roles/{nonexistent} should return 404"""
        response = requests.put(
            f"{BASE_URL}/api/roles/nonexistent-role-id",
            headers=auth_headers,
            json={"name": "Test"}
        )
        assert response.status_code == 404, f"Expected 404, got {response.status_code}"
        print(f"PASS: Update nonexistent role returns 404")


class TestRolesDeleteAPI:
    """Test DELETE /api/roles/{role_id} - Delete custom role"""
    
    def test_delete_custom_role(self, auth_headers):
        """DELETE /api/roles/{role_id} should delete custom role"""
        # Create a test role first
        unique_name = f"TEST_Delete_{uuid.uuid4().hex[:8]}"
        create_response = requests.post(
            f"{BASE_URL}/api/roles",
            headers=auth_headers,
            json={"name": unique_name, "description": "Test role for deletion"}
        )
        assert create_response.status_code == 200
        role_id = create_response.json()["id"]
        
        # Delete the role
        delete_response = requests.delete(
            f"{BASE_URL}/api/roles/{role_id}",
            headers=auth_headers
        )
        
        assert delete_response.status_code == 200, f"Expected 200, got {delete_response.status_code}: {delete_response.text}"
        
        # Verify deletion
        get_response = requests.get(f"{BASE_URL}/api/roles/{role_id}", headers=auth_headers)
        assert get_response.status_code == 404, "Deleted role should return 404"
        
        print(f"PASS: DELETE /api/roles/{role_id} deleted role successfully")
    
    def test_delete_system_role_returns_400(self, auth_headers):
        """DELETE /api/roles/{system_role_id} should return 400"""
        # Get list of roles and find a system role
        response = requests.get(f"{BASE_URL}/api/roles", headers=auth_headers)
        assert response.status_code == 200
        
        roles = response.json()["roles"]
        system_roles = [r for r in roles if r.get("is_system_role", False)]
        
        if len(system_roles) > 0:
            system_role_id = system_roles[0]["id"]
            delete_response = requests.delete(
                f"{BASE_URL}/api/roles/{system_role_id}",
                headers=auth_headers
            )
            assert delete_response.status_code == 400, f"Expected 400 for system role, got {delete_response.status_code}"
            print(f"PASS: System role deletion correctly returns 400")
        else:
            pytest.skip("No system roles found to test")
    
    def test_delete_nonexistent_role_returns_404(self, auth_headers):
        """DELETE /api/roles/{nonexistent} should return 404"""
        response = requests.delete(
            f"{BASE_URL}/api/roles/nonexistent-role-id",
            headers=auth_headers
        )
        assert response.status_code == 404, f"Expected 404, got {response.status_code}"
        print(f"PASS: Delete nonexistent role returns 404")


class TestRolesGetByIdAPI:
    """Test GET /api/roles/{role_id} - Get specific role"""
    
    def test_get_role_by_id(self, auth_headers):
        """GET /api/roles/{role_id} should return role details"""
        # Get list of roles
        list_response = requests.get(f"{BASE_URL}/api/roles", headers=auth_headers)
        assert list_response.status_code == 200
        
        roles = list_response.json()["roles"]
        if len(roles) > 0:
            role_id = roles[0]["id"]
            
            response = requests.get(f"{BASE_URL}/api/roles/{role_id}", headers=auth_headers)
            assert response.status_code == 200, f"Expected 200, got {response.status_code}"
            
            role = response.json()
            assert "_id" not in role, "Response should NOT have MongoDB '_id' field"
            assert "id" in role, "Response should have 'id' field"
            
            print(f"PASS: GET /api/roles/{role_id} returns role without _id")
        else:
            pytest.skip("No roles to test")


class TestRolesSetDefaultAPI:
    """Test POST /api/roles/{role_id}/set-default"""
    
    def test_set_default_role(self, auth_headers):
        """POST /api/roles/{role_id}/set-default should set role as default"""
        # Create a test role first
        unique_name = f"TEST_Default_{uuid.uuid4().hex[:8]}"
        create_response = requests.post(
            f"{BASE_URL}/api/roles",
            headers=auth_headers,
            json={"name": unique_name, "description": "Test default role"}
        )
        assert create_response.status_code == 200
        role_id = create_response.json()["id"]
        
        # Set as default
        set_default_response = requests.post(
            f"{BASE_URL}/api/roles/{role_id}/set-default",
            headers=auth_headers
        )
        
        assert set_default_response.status_code == 200, f"Expected 200, got {set_default_response.status_code}"
        
        # Verify it's now default
        get_response = requests.get(f"{BASE_URL}/api/roles/{role_id}", headers=auth_headers)
        assert get_response.status_code == 200
        assert get_response.json()["is_default"] == True
        
        print(f"PASS: POST /api/roles/{role_id}/set-default works correctly")
        
        # Cleanup
        requests.delete(f"{BASE_URL}/api/roles/{role_id}", headers=auth_headers)


if __name__ == "__main__":
    pytest.main([__file__, "-v"])
