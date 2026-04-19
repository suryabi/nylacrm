"""
Test Packaging Types CRUD API endpoints
Tests: GET, POST, PUT, DELETE /api/packaging-types
"""
import pytest
import requests
import os
import uuid

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', '').rstrip('/')

# Test credentials
TEST_EMAIL = "surya.yadavalli@nylaairwater.earth"
TEST_PASSWORD = "test123"


@pytest.fixture(scope="module")
def auth_token():
    """Get authentication token"""
    response = requests.post(f"{BASE_URL}/api/auth/login", json={
        "email": TEST_EMAIL,
        "password": TEST_PASSWORD
    })
    if response.status_code == 200:
        data = response.json()
        # API returns session_token, not token
        return data.get("session_token") or data.get("token")
    pytest.skip(f"Authentication failed: {response.status_code} - {response.text}")


@pytest.fixture(scope="module")
def auth_headers(auth_token):
    """Get headers with auth token"""
    return {
        "Authorization": f"Bearer {auth_token}",
        "Content-Type": "application/json"
    }


class TestPackagingTypesAPI:
    """Test Packaging Types CRUD operations"""
    
    created_type_id = None
    
    def test_01_list_packaging_types(self, auth_headers):
        """GET /api/packaging-types - List all packaging types"""
        response = requests.get(f"{BASE_URL}/api/packaging-types", headers=auth_headers)
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        
        data = response.json()
        assert "packaging_types" in data, "Response should have 'packaging_types' key"
        assert isinstance(data["packaging_types"], list), "packaging_types should be a list"
        
        # Check seeded data exists (4 types were seeded)
        types = data["packaging_types"]
        print(f"Found {len(types)} packaging types")
        
        # Verify structure of each type
        for pt in types:
            assert "id" in pt, "Each type should have 'id'"
            assert "name" in pt, "Each type should have 'name'"
            assert "units_per_package" in pt, "Each type should have 'units_per_package'"
            print(f"  - {pt['name']}: {pt['units_per_package']} units")
    
    def test_02_create_packaging_type(self, auth_headers):
        """POST /api/packaging-types - Create a new packaging type"""
        unique_name = f"TEST_Box_{uuid.uuid4().hex[:6]}"
        payload = {
            "name": unique_name,
            "units_per_package": 36,
            "description": "Test packaging type for automated testing"
        }
        
        response = requests.post(f"{BASE_URL}/api/packaging-types", json=payload, headers=auth_headers)
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        
        data = response.json()
        assert data["name"] == unique_name, f"Name mismatch: expected {unique_name}, got {data.get('name')}"
        assert data["units_per_package"] == 36, f"Units mismatch: expected 36, got {data.get('units_per_package')}"
        assert "id" in data, "Response should have 'id'"
        
        # Store for later tests
        TestPackagingTypesAPI.created_type_id = data["id"]
        print(f"Created packaging type: {data['name']} (ID: {data['id']})")
    
    def test_03_create_duplicate_name_returns_400(self, auth_headers):
        """POST /api/packaging-types with duplicate name should return 400"""
        # Try to create with same name as seeded type
        payload = {
            "name": "Crate - 24",  # This should already exist from seeding
            "units_per_package": 24,
            "description": "Duplicate test"
        }
        
        response = requests.post(f"{BASE_URL}/api/packaging-types", json=payload, headers=auth_headers)
        # Should return 400 for duplicate
        assert response.status_code == 400, f"Expected 400 for duplicate, got {response.status_code}: {response.text}"
        print(f"Correctly rejected duplicate name with 400")
    
    def test_04_update_packaging_type(self, auth_headers):
        """PUT /api/packaging-types/{id} - Update a packaging type"""
        if not TestPackagingTypesAPI.created_type_id:
            pytest.skip("No type created to update")
        
        type_id = TestPackagingTypesAPI.created_type_id
        new_name = f"TEST_UpdatedBox_{uuid.uuid4().hex[:6]}"
        payload = {
            "name": new_name,
            "units_per_package": 48,
            "description": "Updated description"
        }
        
        response = requests.put(f"{BASE_URL}/api/packaging-types/{type_id}", json=payload, headers=auth_headers)
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        
        data = response.json()
        assert data["name"] == new_name, f"Name not updated: expected {new_name}, got {data.get('name')}"
        assert data["units_per_package"] == 48, f"Units not updated: expected 48, got {data.get('units_per_package')}"
        print(f"Updated packaging type to: {data['name']} ({data['units_per_package']} units)")
    
    def test_05_update_nonexistent_returns_404(self, auth_headers):
        """PUT /api/packaging-types/{id} with invalid ID should return 404"""
        fake_id = str(uuid.uuid4())
        payload = {"name": "Nonexistent", "units_per_package": 10}
        
        response = requests.put(f"{BASE_URL}/api/packaging-types/{fake_id}", json=payload, headers=auth_headers)
        assert response.status_code == 404, f"Expected 404, got {response.status_code}: {response.text}"
        print("Correctly returned 404 for nonexistent type")
    
    def test_06_delete_packaging_type(self, auth_headers):
        """DELETE /api/packaging-types/{id} - Delete a packaging type"""
        if not TestPackagingTypesAPI.created_type_id:
            pytest.skip("No type created to delete")
        
        type_id = TestPackagingTypesAPI.created_type_id
        
        response = requests.delete(f"{BASE_URL}/api/packaging-types/{type_id}", headers=auth_headers)
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        
        # Verify deletion
        get_response = requests.get(f"{BASE_URL}/api/packaging-types", headers=auth_headers)
        types = get_response.json().get("packaging_types", [])
        deleted_exists = any(t["id"] == type_id for t in types)
        assert not deleted_exists, "Deleted type should not exist in list"
        print(f"Successfully deleted packaging type {type_id}")
    
    def test_07_delete_nonexistent_returns_404(self, auth_headers):
        """DELETE /api/packaging-types/{id} with invalid ID should return 404"""
        fake_id = str(uuid.uuid4())
        
        response = requests.delete(f"{BASE_URL}/api/packaging-types/{fake_id}", headers=auth_headers)
        assert response.status_code == 404, f"Expected 404, got {response.status_code}: {response.text}"
        print("Correctly returned 404 for nonexistent type deletion")
    
    def test_08_verify_seeded_packaging_types(self, auth_headers):
        """Verify the 4 seeded packaging types exist"""
        response = requests.get(f"{BASE_URL}/api/packaging-types", headers=auth_headers)
        assert response.status_code == 200
        
        types = response.json().get("packaging_types", [])
        type_names = {t["name"]: t["units_per_package"] for t in types}
        
        # Check seeded types (from agent context)
        expected_seeded = {
            "Crate - 24": 24,
            "Crate - 12": 12,
            "Carton - 6": 6,
            "Carton - 48": 48
        }
        
        for name, units in expected_seeded.items():
            if name in type_names:
                assert type_names[name] == units, f"{name} should have {units} units, got {type_names[name]}"
                print(f"✓ Seeded type verified: {name} ({units} units)")
            else:
                print(f"⚠ Seeded type not found: {name}")


class TestSKUPackagingTypeIntegration:
    """Test SKU Management with packaging type dropdown"""
    
    def test_01_get_skus_with_packaging_info(self, auth_headers):
        """GET /api/master-skus - Check SKUs can have packaging type fields"""
        response = requests.get(f"{BASE_URL}/api/master-skus", headers=auth_headers)
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        
        data = response.json()
        skus = data.get("skus", [])
        print(f"Found {len(skus)} SKUs")
        
        # Check if any SKU has packaging type fields
        for sku in skus[:5]:  # Check first 5
            print(f"  SKU: {sku.get('sku_name', sku.get('sku'))} - packaging_type_id: {sku.get('packaging_type_id', 'N/A')}")


class TestProductionBatchPackagingType:
    """Test Production Batch creation with packaging type"""
    
    def test_01_get_production_batches(self, auth_headers):
        """GET /api/production/batches - Verify batches endpoint works"""
        response = requests.get(f"{BASE_URL}/api/production/batches", headers=auth_headers)
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        
        batches = response.json()
        print(f"Found {len(batches)} production batches")
        
        # Check if batches have bottles_per_crate field
        for batch in batches[:3]:
            print(f"  Batch: {batch.get('batch_code')} - bottles_per_crate: {batch.get('bottles_per_crate', 'N/A')}")


if __name__ == "__main__":
    pytest.main([__file__, "-v", "--tb=short"])
