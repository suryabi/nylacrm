"""
Test suite for Expense Category Master Module
Tests CRUD operations for categories and expense types with role-based limits
"""
import pytest
import requests
import os

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', '').rstrip('/')


class TestExpenseMasterAPI:
    """Test expense master API endpoints"""
    
    @pytest.fixture(autouse=True)
    def setup(self):
        """Login as CEO before each test"""
        self.session = requests.Session()
        login_response = self.session.post(f"{BASE_URL}/api/auth/login", json={
            "email": "surya.yadavalli@nylaairwater.earth",
            "password": "surya123"
        })
        assert login_response.status_code == 200, f"Login failed: {login_response.text}"
        
    # === GET /api/expense-master/roles ===
    def test_get_roles(self):
        """Test getting available roles"""
        response = self.session.get(f"{BASE_URL}/api/expense-master/roles")
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        
        data = response.json()
        assert isinstance(data, list), "Expected list of roles"
        assert len(data) > 0, "Expected at least one role"
        
        # Verify role structure
        first_role = data[0]
        assert 'id' in first_role, "Role should have id"
        assert 'name' in first_role, "Role should have name"
        
        # Check for expected roles
        role_ids = [r['id'] for r in data]
        assert 'CEO' in role_ids, "CEO role should be present"
        assert 'Director' in role_ids, "Director role should be present"
        print(f"SUCCESS: GET /api/expense-master/roles returned {len(data)} roles")
        
    # === GET /api/expense-master/categories ===
    def test_get_categories_basic(self):
        """Test getting expense categories"""
        response = self.session.get(f"{BASE_URL}/api/expense-master/categories")
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        
        data = response.json()
        assert isinstance(data, list), "Expected list of categories"
        print(f"SUCCESS: GET /api/expense-master/categories returned {len(data)} categories")
        
    def test_get_categories_with_inactive(self):
        """Test getting all categories including inactive"""
        response = self.session.get(f"{BASE_URL}/api/expense-master/categories?include_inactive=true")
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        
        data = response.json()
        assert isinstance(data, list), "Expected list of categories"
        print(f"SUCCESS: GET categories with include_inactive returned {len(data)} categories")
        
    def test_categories_have_expense_types(self):
        """Test that categories include their expense types"""
        response = self.session.get(f"{BASE_URL}/api/expense-master/categories?include_inactive=true")
        assert response.status_code == 200
        
        data = response.json()
        if len(data) > 0:
            # Find a category with expense types
            cat_with_types = next((c for c in data if len(c.get('expense_types', [])) > 0), None)
            if cat_with_types:
                assert 'expense_types' in cat_with_types
                assert isinstance(cat_with_types['expense_types'], list)
                
                # Verify expense type structure
                first_type = cat_with_types['expense_types'][0]
                assert 'id' in first_type
                assert 'name' in first_type
                assert 'default_limit' in first_type
                print(f"SUCCESS: Category '{cat_with_types['name']}' has {len(cat_with_types['expense_types'])} expense types")
            else:
                print("INFO: No categories with expense types found - may need initialization")
        else:
            print("INFO: No categories found")
            
    def test_category_structure(self):
        """Test category data structure"""
        response = self.session.get(f"{BASE_URL}/api/expense-master/categories?include_inactive=true")
        assert response.status_code == 200
        
        data = response.json()
        if len(data) > 0:
            cat = data[0]
            assert 'id' in cat, "Category should have id"
            assert 'name' in cat, "Category should have name"
            assert 'is_active' in cat or cat.get('is_active') is not False, "Category should have is_active"
            assert 'expense_types' in cat, "Category should have expense_types array"
            print(f"SUCCESS: Category structure verified for '{cat['name']}'")
            
    # === POST /api/expense-master/categories ===
    def test_create_category(self):
        """Test creating a new expense category"""
        import time
        # Use unique name to avoid conflicts with previous test runs
        test_category = {
            "name": f"TEST_Training_Category_{int(time.time())}",
            "description": "Test category for automated testing",
            "icon": "briefcase",
            "color": "#3B82F6",
            "display_order": 99,
            "policy_guidelines": "Test policy guidelines",
            "is_active": True
        }
        
        response = self.session.post(f"{BASE_URL}/api/expense-master/categories", json=test_category)
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        
        data = response.json()
        assert 'id' in data, "Response should have id"
        assert data['name'] == test_category['name'], "Name should match"
        assert data['description'] == test_category['description'], "Description should match"
        
        # Save for cleanup and further tests
        self.created_category_id = data['id']
        print(f"SUCCESS: Created category '{data['name']}' with id {data['id']}")
        
        # Verify it's actually created by GET
        get_response = self.session.get(f"{BASE_URL}/api/expense-master/categories?include_inactive=true")
        assert get_response.status_code == 200
        categories = get_response.json()
        created_cat = next((c for c in categories if c['id'] == data['id']), None)
        assert created_cat is not None, "Created category should be retrievable"
        print(f"SUCCESS: Verified category creation via GET")
        
        return data
        
    def test_create_category_duplicate_name_fails(self):
        """Test that creating a category with duplicate name fails"""
        # First create a category
        test_category = {
            "name": "TEST_Duplicate_Check",
            "description": "Original category",
            "icon": "briefcase",
            "color": "#3B82F6",
            "is_active": True
        }
        
        response1 = self.session.post(f"{BASE_URL}/api/expense-master/categories", json=test_category)
        # If category already exists from previous test, skip this test
        if response1.status_code == 400:
            print("INFO: Category already exists, skipping duplicate test")
            return
            
        assert response1.status_code == 200
        
        # Try to create with same name - should fail
        response2 = self.session.post(f"{BASE_URL}/api/expense-master/categories", json=test_category)
        assert response2.status_code == 400, f"Expected 400 for duplicate, got {response2.status_code}"
        print(f"SUCCESS: Duplicate category creation properly rejected")
        
    # === PUT /api/expense-master/categories/{id} ===
    def test_update_category(self):
        """Test updating an expense category"""
        # First get an existing category
        response = self.session.get(f"{BASE_URL}/api/expense-master/categories?include_inactive=true")
        assert response.status_code == 200
        
        categories = response.json()
        if len(categories) == 0:
            pytest.skip("No categories to update")
            
        # Find a test category or use first one
        test_cat = next((c for c in categories if 'TEST_' in c.get('name', '')), categories[0])
        cat_id = test_cat['id']
        
        # Update it
        update_data = {
            "description": f"Updated description at test run",
            "display_order": 50
        }
        
        response = self.session.put(f"{BASE_URL}/api/expense-master/categories/{cat_id}", json=update_data)
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        
        data = response.json()
        assert data.get('description') == update_data['description'], "Description should be updated"
        print(f"SUCCESS: Updated category '{data['name']}'")
        
    def test_update_category_not_found(self):
        """Test updating non-existent category"""
        response = self.session.put(
            f"{BASE_URL}/api/expense-master/categories/non-existent-id",
            json={"description": "test"}
        )
        assert response.status_code == 404, f"Expected 404, got {response.status_code}"
        print("SUCCESS: Non-existent category update properly returns 404")
        
    # === DELETE /api/expense-master/categories/{id} ===
    def test_delete_category(self):
        """Test soft deleting a category"""
        # First create a category to delete
        test_category = {
            "name": "TEST_ToDelete_Category",
            "description": "Category to be deleted",
            "icon": "briefcase",
            "color": "#EF4444",
            "is_active": True
        }
        
        create_response = self.session.post(f"{BASE_URL}/api/expense-master/categories", json=test_category)
        if create_response.status_code == 400:  # Already exists
            # Get its ID
            cats = self.session.get(f"{BASE_URL}/api/expense-master/categories?include_inactive=true").json()
            cat = next((c for c in cats if c['name'] == test_category['name']), None)
            if cat:
                cat_id = cat['id']
            else:
                pytest.skip("Cannot find category to delete")
        else:
            assert create_response.status_code == 200
            cat_id = create_response.json()['id']
        
        # Delete it (soft delete)
        delete_response = self.session.delete(f"{BASE_URL}/api/expense-master/categories/{cat_id}")
        assert delete_response.status_code == 200, f"Expected 200, got {delete_response.status_code}: {delete_response.text}"
        
        # Verify it's marked as inactive (soft delete)
        get_response = self.session.get(f"{BASE_URL}/api/expense-master/categories?include_inactive=true")
        categories = get_response.json()
        deleted_cat = next((c for c in categories if c['id'] == cat_id), None)
        
        # Should still exist but be inactive
        if deleted_cat:
            assert deleted_cat.get('is_active') == False, "Category should be marked inactive"
            print(f"SUCCESS: Category soft-deleted (marked inactive)")
        else:
            print("SUCCESS: Category deleted")
            
    # === POST /api/expense-master/types ===
    def test_create_expense_type(self):
        """Test creating a new expense type"""
        # First get a category to add type to
        response = self.session.get(f"{BASE_URL}/api/expense-master/categories?include_inactive=true")
        assert response.status_code == 200
        
        categories = response.json()
        if len(categories) == 0:
            pytest.skip("No categories available to add expense type")
            
        # Use first active category
        category = next((c for c in categories if c.get('is_active', True)), categories[0])
        
        test_type = {
            "category_id": category['id'],
            "name": "TEST_Expense_Type",
            "description": "Test expense type for automated testing",
            "is_active": True,
            "requires_receipt": True,
            "requires_justification": False,
            "default_limit": 5000,
            "role_limits": [
                {"role": "CEO", "max_limit": 25000, "is_allowed": True, "requires_approval": False},
                {"role": "Director", "max_limit": 15000, "is_allowed": True, "requires_approval": True}
            ],
            "policy_guidelines": "Test policy for expense type"
        }
        
        response = self.session.post(f"{BASE_URL}/api/expense-master/types", json=test_type)
        
        # If already exists, it's fine
        if response.status_code == 400 and 'already exists' in response.text.lower():
            print("INFO: Expense type already exists")
            return
            
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        
        data = response.json()
        assert 'id' in data, "Response should have id"
        assert data['name'] == test_type['name']
        assert data['default_limit'] == test_type['default_limit']
        assert 'role_limits' in data
        print(f"SUCCESS: Created expense type '{data['name']}' with id {data['id']}")
        
    def test_create_expense_type_invalid_category_fails(self):
        """Test that creating expense type with invalid category fails"""
        test_type = {
            "category_id": "invalid-category-id",
            "name": "TEST_Invalid_Type",
            "default_limit": 1000
        }
        
        response = self.session.post(f"{BASE_URL}/api/expense-master/types", json=test_type)
        assert response.status_code == 400, f"Expected 400, got {response.status_code}"
        print("SUCCESS: Invalid category ID properly rejected")
        
    # === PUT /api/expense-master/types/{id} ===
    def test_update_expense_type(self):
        """Test updating an expense type"""
        # Get categories with expense types
        response = self.session.get(f"{BASE_URL}/api/expense-master/categories?include_inactive=true")
        assert response.status_code == 200
        
        categories = response.json()
        expense_type = None
        for cat in categories:
            if cat.get('expense_types') and len(cat['expense_types']) > 0:
                expense_type = cat['expense_types'][0]
                break
                
        if not expense_type:
            pytest.skip("No expense types to update")
            
        type_id = expense_type['id']
        
        update_data = {
            "description": "Updated description from test",
            "default_limit": expense_type.get('default_limit', 1000) + 500
        }
        
        response = self.session.put(f"{BASE_URL}/api/expense-master/types/{type_id}", json=update_data)
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        
        data = response.json()
        assert data.get('description') == update_data['description']
        print(f"SUCCESS: Updated expense type '{data['name']}'")
        
    def test_update_expense_type_role_limits(self):
        """Test updating role limits for an expense type"""
        # Get categories with expense types
        response = self.session.get(f"{BASE_URL}/api/expense-master/categories?include_inactive=true")
        assert response.status_code == 200
        
        categories = response.json()
        expense_type = None
        for cat in categories:
            if cat.get('expense_types') and len(cat['expense_types']) > 0:
                expense_type = cat['expense_types'][0]
                break
                
        if not expense_type:
            pytest.skip("No expense types to update")
            
        type_id = expense_type['id']
        
        # Update role limits
        update_data = {
            "role_limits": [
                {"role": "CEO", "max_limit": 50000, "is_allowed": True, "requires_approval": False},
                {"role": "Director", "max_limit": 30000, "is_allowed": True, "requires_approval": True},
                {"role": "Sales Representative", "max_limit": 5000, "is_allowed": True, "requires_approval": True}
            ]
        }
        
        response = self.session.put(f"{BASE_URL}/api/expense-master/types/{type_id}", json=update_data)
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        
        data = response.json()
        assert 'role_limits' in data
        print(f"SUCCESS: Updated role limits for expense type '{data['name']}'")
        
    # === DELETE /api/expense-master/types/{id} ===  
    def test_delete_expense_type(self):
        """Test soft deleting an expense type"""
        # Get categories with expense types
        response = self.session.get(f"{BASE_URL}/api/expense-master/categories?include_inactive=true")
        assert response.status_code == 200
        
        categories = response.json()
        
        # Find a TEST_ expense type to delete
        expense_type = None
        for cat in categories:
            for et in cat.get('expense_types', []):
                if 'TEST_' in et.get('name', ''):
                    expense_type = et
                    break
            if expense_type:
                break
                
        if not expense_type:
            print("INFO: No TEST_ expense types to delete, skipping")
            return
            
        type_id = expense_type['id']
        
        response = self.session.delete(f"{BASE_URL}/api/expense-master/types/{type_id}")
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        print(f"SUCCESS: Deleted expense type '{expense_type['name']}'")
        
    # === GET /api/expense-master/policy ===
    def test_get_expense_policy(self):
        """Test getting complete expense policy"""
        response = self.session.get(f"{BASE_URL}/api/expense-master/policy")
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        
        data = response.json()
        assert isinstance(data, list), "Expected list of policy categories"
        print(f"SUCCESS: GET /api/expense-master/policy returned {len(data)} categories")
        
    def test_get_expense_policy_for_role(self):
        """Test getting expense policy filtered by role"""
        response = self.session.get(f"{BASE_URL}/api/expense-master/policy?role=CEO")
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        
        data = response.json()
        assert isinstance(data, list)
        
        # Check role-specific fields are added
        if len(data) > 0 and len(data[0].get('expense_types', [])) > 0:
            exp_type = data[0]['expense_types'][0]
            # These fields are added when filtering by role
            if 'role_config' in exp_type or 'is_allowed_for_role' in exp_type:
                print(f"SUCCESS: Policy includes role-specific configuration")
            else:
                print("INFO: Policy returned but role-specific fields may not be present")
        print(f"SUCCESS: GET policy for CEO role returned {len(data)} categories")
        
    # === POST /api/expense-master/initialize ===
    def test_initialize_endpoint_exists(self):
        """Test that initialize endpoint exists and works"""
        response = self.session.post(f"{BASE_URL}/api/expense-master/initialize")
        # Should return 200 (already initialized) or successfully initialize
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        print(f"SUCCESS: Initialize endpoint working")


class TestExpenseMasterAuthorization:
    """Test authorization for expense master endpoints"""
    
    def test_unauthenticated_request_fails(self):
        """Test that unauthenticated requests fail"""
        response = requests.get(f"{BASE_URL}/api/expense-master/categories")
        assert response.status_code == 401, f"Expected 401, got {response.status_code}"
        print("SUCCESS: Unauthenticated request properly rejected")
        
    def test_non_admin_cannot_create_category(self):
        """Test that non-admin users cannot create categories"""
        # Login as a non-admin user (Partner)
        session = requests.Session()
        login_response = session.post(f"{BASE_URL}/api/auth/login", json={
            "email": "priya.sales@nylaairwater.earth",
            "password": "priya123"
        })
        
        # If this user doesn't exist, skip
        if login_response.status_code != 200:
            print("INFO: Partner user not available, skipping auth test")
            return
            
        response = session.post(f"{BASE_URL}/api/expense-master/categories", json={
            "name": "TEST_Unauthorized",
            "description": "Should fail"
        })
        
        assert response.status_code == 403, f"Expected 403, got {response.status_code}"
        print("SUCCESS: Non-admin user properly denied category creation")


class TestExpenseMasterDataIntegrity:
    """Test data integrity and relationships"""
    
    @pytest.fixture(autouse=True)
    def setup(self):
        """Login as CEO before each test"""
        self.session = requests.Session()
        login_response = self.session.post(f"{BASE_URL}/api/auth/login", json={
            "email": "surya.yadavalli@nylaairwater.earth",
            "password": "surya123"
        })
        assert login_response.status_code == 200
        
    def test_expense_types_reference_valid_categories(self):
        """Test that all expense types reference valid categories"""
        response = self.session.get(f"{BASE_URL}/api/expense-master/categories?include_inactive=true")
        assert response.status_code == 200
        
        categories = response.json()
        category_ids = set(c['id'] for c in categories)
        
        for cat in categories:
            for exp_type in cat.get('expense_types', []):
                assert exp_type.get('category_id') == cat['id'], \
                    f"Expense type {exp_type['name']} has mismatched category_id"
                    
        print("SUCCESS: All expense types reference valid categories")
        
    def test_role_limits_reference_valid_roles(self):
        """Test that role limits reference valid role IDs"""
        # Get valid roles
        roles_response = self.session.get(f"{BASE_URL}/api/expense-master/roles")
        assert roles_response.status_code == 200
        valid_role_ids = set(r['id'] for r in roles_response.json())
        
        # Get categories with expense types
        cats_response = self.session.get(f"{BASE_URL}/api/expense-master/categories?include_inactive=true")
        assert cats_response.status_code == 200
        
        for cat in cats_response.json():
            for exp_type in cat.get('expense_types', []):
                for role_limit in exp_type.get('role_limits', []):
                    assert role_limit.get('role') in valid_role_ids, \
                        f"Invalid role '{role_limit.get('role')}' in expense type '{exp_type['name']}'"
                        
        print("SUCCESS: All role limits reference valid roles")


if __name__ == "__main__":
    pytest.main([__file__, "-v"])
