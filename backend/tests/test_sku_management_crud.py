"""
Test SKU Management CRUD Operations
Tests for full SKU Management module:
- GET /api/master-skus (with include_inactive param)
- POST /api/master-skus (create new SKU)
- PUT /api/master-skus/{id} (update existing SKU)
- DELETE /api/master-skus/{id} (soft delete/deactivate SKU)
- GET /api/sku-categories (list unique categories)
"""

import pytest
import requests
import os
import uuid

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', '').rstrip('/')


@pytest.fixture(scope="module")
def session():
    """Create authenticated session"""
    s = requests.Session()
    s.headers.update({"Content-Type": "application/json"})
    
    # Login
    response = s.post(f"{BASE_URL}/api/auth/login", json={
        "email": "admin@nylaairwater.earth",
        "password": "admin123"
    })
    
    if response.status_code != 200:
        pytest.skip(f"Login failed: {response.status_code}")
    
    data = response.json()
    token = data.get('session_token')
    if token:
        s.headers.update({"Authorization": f"Bearer {token}"})
    
    return s


class TestGetMasterSKUs:
    """Tests for GET /api/master-skus endpoint"""
    
    def test_get_master_skus_returns_200(self, session):
        """GET /api/master-skus returns 200"""
        response = session.get(f"{BASE_URL}/api/master-skus")
        assert response.status_code == 200, f"Expected 200, got {response.status_code}"
    
    def test_returns_skus_array(self, session):
        """Response contains 'skus' array"""
        response = session.get(f"{BASE_URL}/api/master-skus")
        data = response.json()
        
        assert 'skus' in data, "Response should contain 'skus' key"
        assert isinstance(data['skus'], list), "SKUs should be a list"
    
    def test_skus_have_required_fields(self, session):
        """Each SKU has required fields: id, sku_name, category, unit, is_active"""
        response = session.get(f"{BASE_URL}/api/master-skus")
        data = response.json()
        
        for sku in data['skus']:
            assert 'id' in sku, "SKU should have 'id' field"
            assert 'sku_name' in sku, "SKU should have 'sku_name' field"
            assert 'category' in sku, "SKU should have 'category' field"
            assert 'unit' in sku, "SKU should have 'unit' field"
            assert 'is_active' in sku, "SKU should have 'is_active' field"
    
    def test_default_returns_only_active(self, session):
        """Without include_inactive, only active SKUs returned"""
        response = session.get(f"{BASE_URL}/api/master-skus")
        data = response.json()
        
        # All returned should be active (or None which is treated as active)
        for sku in data['skus']:
            assert sku.get('is_active', True) != False, "Default query should only return active SKUs"
    
    def test_include_inactive_parameter(self, session):
        """With include_inactive=true, inactive SKUs included"""
        response = session.get(f"{BASE_URL}/api/master-skus?include_inactive=true")
        assert response.status_code == 200
        # Just verify it doesn't error - we'll test this more after creating and deleting


class TestSKUCategories:
    """Tests for GET /api/sku-categories endpoint"""
    
    def test_get_categories_returns_200(self, session):
        """GET /api/sku-categories returns 200"""
        response = session.get(f"{BASE_URL}/api/sku-categories")
        assert response.status_code == 200
    
    def test_returns_categories_array(self, session):
        """Response contains categories array"""
        response = session.get(f"{BASE_URL}/api/sku-categories")
        data = response.json()
        
        assert 'categories' in data, "Response should contain 'categories' key"
        assert isinstance(data['categories'], list), "Categories should be a list"
    
    def test_expected_categories_present(self, session):
        """Expected categories (Jar, Bottle, Premium, Sparkling) are present"""
        response = session.get(f"{BASE_URL}/api/sku-categories")
        data = response.json()
        categories = data['categories']
        
        expected = ['Jar', 'Bottle', 'Premium', 'Sparkling']
        for cat in expected:
            assert cat in categories, f"Category '{cat}' should be present"


class TestCreateSKU:
    """Tests for POST /api/master-skus endpoint"""
    
    def test_create_sku_returns_201_or_200(self, session):
        """POST /api/master-skus creates new SKU"""
        unique_name = f"TEST_SKU_{uuid.uuid4().hex[:8]}"
        sku_data = {
            "sku_name": unique_name,
            "category": "Jar",
            "unit": "20L",
            "description": "Test SKU for automated testing",
            "is_active": True,
            "sort_order": 99
        }
        
        response = session.post(f"{BASE_URL}/api/master-skus", json=sku_data)
        assert response.status_code in [200, 201], f"Expected 200/201, got {response.status_code}: {response.text}"
        
        # Verify response structure
        data = response.json()
        assert data['sku_name'] == unique_name
        assert data['category'] == "Jar"
        assert data['unit'] == "20L"
        assert 'id' in data
        
        # Cleanup - deactivate test SKU
        session.delete(f"{BASE_URL}/api/master-skus/{data['id']}")
    
    def test_create_sku_persists_in_database(self, session):
        """Created SKU can be retrieved via GET"""
        unique_name = f"TEST_PERSIST_{uuid.uuid4().hex[:8]}"
        sku_data = {
            "sku_name": unique_name,
            "category": "Bottle",
            "unit": "1L",
        }
        
        # Create
        create_response = session.post(f"{BASE_URL}/api/master-skus", json=sku_data)
        assert create_response.status_code in [200, 201]
        created_sku = create_response.json()
        sku_id = created_sku['id']
        
        # Verify via GET
        get_response = session.get(f"{BASE_URL}/api/master-skus")
        all_skus = get_response.json()['skus']
        
        found = [s for s in all_skus if s['id'] == sku_id]
        assert len(found) == 1, "Created SKU should be in master list"
        assert found[0]['sku_name'] == unique_name
        
        # Cleanup
        session.delete(f"{BASE_URL}/api/master-skus/{sku_id}")
    
    def test_duplicate_sku_name_returns_400(self, session):
        """Creating SKU with duplicate name returns 400"""
        unique_name = f"TEST_DUP_{uuid.uuid4().hex[:8]}"
        sku_data = {"sku_name": unique_name, "category": "Jar", "unit": "20L"}
        
        # Create first one
        first = session.post(f"{BASE_URL}/api/master-skus", json=sku_data)
        assert first.status_code in [200, 201]
        first_id = first.json()['id']
        
        # Try to create duplicate
        second = session.post(f"{BASE_URL}/api/master-skus", json=sku_data)
        assert second.status_code == 400, "Duplicate SKU name should return 400"
        
        # Cleanup
        session.delete(f"{BASE_URL}/api/master-skus/{first_id}")


class TestUpdateSKU:
    """Tests for PUT /api/master-skus/{id} endpoint"""
    
    @pytest.fixture
    def test_sku(self, session):
        """Create a test SKU and clean up after"""
        unique_name = f"TEST_UPDATE_{uuid.uuid4().hex[:8]}"
        sku_data = {
            "sku_name": unique_name,
            "category": "Can",
            "unit": "5L",
            "sort_order": 50
        }
        response = session.post(f"{BASE_URL}/api/master-skus", json=sku_data)
        assert response.status_code in [200, 201]
        sku = response.json()
        yield sku
        
        # Cleanup
        session.delete(f"{BASE_URL}/api/master-skus/{sku['id']}")
    
    def test_update_sku_returns_200(self, session, test_sku):
        """PUT /api/master-skus/{id} returns 200"""
        update_data = {"description": "Updated description"}
        response = session.put(f"{BASE_URL}/api/master-skus/{test_sku['id']}", json=update_data)
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
    
    def test_update_sku_changes_persisted(self, session, test_sku):
        """Updated SKU fields persist"""
        new_unit = "10L"
        new_sort = 999
        
        update_data = {
            "unit": new_unit,
            "sort_order": new_sort,
            "description": "Changed for test"
        }
        
        response = session.put(f"{BASE_URL}/api/master-skus/{test_sku['id']}", json=update_data)
        assert response.status_code == 200
        updated = response.json()
        
        assert updated['unit'] == new_unit, "Unit should be updated"
        assert updated['sort_order'] == new_sort, "Sort order should be updated"
        
        # Verify via fresh GET
        get_response = session.get(f"{BASE_URL}/api/master-skus")
        all_skus = get_response.json()['skus']
        found = [s for s in all_skus if s['id'] == test_sku['id']]
        
        assert len(found) == 1
        assert found[0]['unit'] == new_unit
        assert found[0]['sort_order'] == new_sort
    
    def test_update_nonexistent_sku_returns_404(self, session):
        """PUT with non-existent ID returns 404"""
        fake_id = "nonexistent-uuid-12345"
        response = session.put(f"{BASE_URL}/api/master-skus/{fake_id}", json={"unit": "test"})
        assert response.status_code == 404


class TestDeleteSKU:
    """Tests for DELETE /api/master-skus/{id} endpoint (soft delete)"""
    
    def test_delete_sku_returns_200(self, session):
        """DELETE /api/master-skus/{id} returns 200"""
        # Create a SKU to delete
        unique_name = f"TEST_DELETE_{uuid.uuid4().hex[:8]}"
        sku_data = {"sku_name": unique_name, "category": "Jar", "unit": "20L"}
        create_resp = session.post(f"{BASE_URL}/api/master-skus", json=sku_data)
        sku_id = create_resp.json()['id']
        
        # Delete it
        response = session.delete(f"{BASE_URL}/api/master-skus/{sku_id}")
        assert response.status_code == 200, f"Expected 200, got {response.status_code}"
    
    def test_delete_soft_deletes(self, session):
        """Delete marks SKU as inactive, doesn't hard delete"""
        unique_name = f"TEST_SOFTDEL_{uuid.uuid4().hex[:8]}"
        sku_data = {"sku_name": unique_name, "category": "Bottle", "unit": "500ml"}
        create_resp = session.post(f"{BASE_URL}/api/master-skus", json=sku_data)
        sku_id = create_resp.json()['id']
        
        # Delete
        session.delete(f"{BASE_URL}/api/master-skus/{sku_id}")
        
        # Should NOT appear in default GET (active only)
        active_response = session.get(f"{BASE_URL}/api/master-skus")
        active_skus = active_response.json()['skus']
        active_ids = [s['id'] for s in active_skus]
        assert sku_id not in active_ids, "Deleted SKU should not appear in active list"
        
        # Should appear with include_inactive=true
        all_response = session.get(f"{BASE_URL}/api/master-skus?include_inactive=true")
        all_skus = all_response.json()['skus']
        found = [s for s in all_skus if s['id'] == sku_id]
        
        assert len(found) == 1, "Soft-deleted SKU should appear with include_inactive"
        assert found[0]['is_active'] == False, "SKU should be marked inactive"
    
    def test_reactivate_deleted_sku(self, session):
        """Deleted SKU can be reactivated via PUT"""
        unique_name = f"TEST_REACT_{uuid.uuid4().hex[:8]}"
        sku_data = {"sku_name": unique_name, "category": "Premium", "unit": "660ml"}
        create_resp = session.post(f"{BASE_URL}/api/master-skus", json=sku_data)
        sku_id = create_resp.json()['id']
        
        # Delete (deactivate)
        session.delete(f"{BASE_URL}/api/master-skus/{sku_id}")
        
        # Reactivate
        reactivate_resp = session.put(f"{BASE_URL}/api/master-skus/{sku_id}", json={"is_active": True})
        assert reactivate_resp.status_code == 200
        
        # Verify it's back in active list
        active_response = session.get(f"{BASE_URL}/api/master-skus")
        active_ids = [s['id'] for s in active_response.json()['skus']]
        assert sku_id in active_ids, "Reactivated SKU should appear in active list"
        
        # Cleanup
        session.delete(f"{BASE_URL}/api/master-skus/{sku_id}")
    
    def test_delete_nonexistent_returns_404(self, session):
        """DELETE with non-existent ID returns 404"""
        fake_id = "nonexistent-uuid-67890"
        response = session.delete(f"{BASE_URL}/api/master-skus/{fake_id}")
        assert response.status_code == 404


class TestSKUsFromMasterList:
    """Tests to verify SKUs are from database, not hardcoded"""
    
    def test_sku_count_matches_database(self, session):
        """SKU count from API matches expected seeded count (14+)"""
        response = session.get(f"{BASE_URL}/api/master-skus")
        skus = response.json()['skus']
        
        # Should have at least 14 default SKUs
        assert len(skus) >= 14, f"Expected at least 14 SKUs, got {len(skus)}"
    
    def test_created_sku_appears_dynamically(self, session):
        """Newly created SKU appears in list (proving data from DB not hardcoded)"""
        # Get initial count
        initial = session.get(f"{BASE_URL}/api/master-skus")
        initial_count = len(initial.json()['skus'])
        
        # Create new SKU
        unique_name = f"TEST_DYNAMIC_{uuid.uuid4().hex[:8]}"
        sku_data = {"sku_name": unique_name, "category": "Jar", "unit": "50L"}
        create_resp = session.post(f"{BASE_URL}/api/master-skus", json=sku_data)
        sku_id = create_resp.json()['id']
        
        # Get new count
        after = session.get(f"{BASE_URL}/api/master-skus")
        after_count = len(after.json()['skus'])
        
        # Count should increase by 1
        assert after_count == initial_count + 1, "SKU count should increase after creation"
        
        # Cleanup
        session.delete(f"{BASE_URL}/api/master-skus/{sku_id}")


if __name__ == "__main__":
    pytest.main([__file__, "-v", "--tb=short"])
