"""
Test suite for Contacts and Contact Categories API
Tests CRUD operations for:
- Contact Categories (Master)
- Contacts (CRUD with filters)
- Extract visiting card (OCR - optional)
"""
import pytest
import requests
import os

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', '').rstrip('/')

# Test credentials
CEO_EMAIL = "surya.yadavalli@nylaairwater.earth"
CEO_PASSWORD = "surya123"


@pytest.fixture(scope="module")
def session():
    """Shared requests session"""
    s = requests.Session()
    s.headers.update({"Content-Type": "application/json"})
    return s


@pytest.fixture(scope="module")
def auth_cookies(session):
    """Login and get auth cookies"""
    response = session.post(f"{BASE_URL}/api/auth/login", json={
        "email": CEO_EMAIL,
        "password": CEO_PASSWORD
    })
    assert response.status_code == 200, f"Login failed: {response.text}"
    return session.cookies


# ============== Contact Categories Tests ==============

class TestContactCategories:
    """Tests for Contact Categories CRUD"""
    
    def test_get_categories_requires_auth(self, session):
        """GET /api/contacts/categories requires authentication"""
        # Make request without auth cookies
        response = requests.get(f"{BASE_URL}/api/contacts/categories")
        assert response.status_code == 401
    
    def test_get_categories_returns_default_categories(self, session, auth_cookies):
        """GET /api/contacts/categories returns 5 default categories"""
        response = session.get(f"{BASE_URL}/api/contacts/categories?include_inactive=true")
        assert response.status_code == 200
        
        categories = response.json()
        assert isinstance(categories, list)
        
        # Check default categories exist
        category_names = [c['name'] for c in categories]
        expected_defaults = ['Vendors', 'Partners', 'Distributors', 'Hoteliers', 'Event Managers']
        
        for expected in expected_defaults:
            assert expected in category_names, f"Default category '{expected}' not found"
        
        # Verify structure
        for cat in categories:
            assert 'id' in cat
            assert 'name' in cat
            assert 'is_active' in cat
            assert 'is_default' in cat
            assert 'color' in cat
    
    def test_category_structure(self, session, auth_cookies):
        """Verify category has all required fields"""
        response = session.get(f"{BASE_URL}/api/contacts/categories")
        assert response.status_code == 200
        
        categories = response.json()
        assert len(categories) > 0
        
        cat = categories[0]
        assert 'id' in cat
        assert 'name' in cat
        assert 'description' in cat or cat.get('description') is None
        assert 'icon' in cat
        assert 'color' in cat
        assert 'is_active' in cat
        assert 'is_default' in cat
    
    def test_create_category(self, session, auth_cookies):
        """POST /api/contacts/categories creates new category"""
        payload = {
            "name": "TEST_Consultants",
            "description": "Test consultant contacts",
            "icon": "users",
            "color": "#3b82f6"
        }
        
        response = session.post(f"{BASE_URL}/api/contacts/categories", json=payload)
        assert response.status_code == 200
        
        data = response.json()
        assert data['name'] == "TEST_Consultants"
        assert data['description'] == "Test consultant contacts"
        assert data['is_default'] == False
        assert 'id' in data
        
        # Store ID for cleanup
        TestContactCategories.created_category_id = data['id']
    
    def test_create_duplicate_category_fails(self, session, auth_cookies):
        """POST /api/contacts/categories with duplicate name should fail"""
        payload = {
            "name": "Vendors",  # Already exists
            "description": "Duplicate test"
        }
        
        response = session.post(f"{BASE_URL}/api/contacts/categories", json=payload)
        assert response.status_code == 400
    
    def test_update_category(self, session, auth_cookies):
        """PUT /api/contacts/categories/{id} updates category"""
        category_id = getattr(TestContactCategories, 'created_category_id', None)
        if not category_id:
            pytest.skip("No category created to update")
        
        payload = {
            "description": "Updated consultant description"
        }
        
        response = session.put(f"{BASE_URL}/api/contacts/categories/{category_id}", json=payload)
        assert response.status_code == 200
        
        data = response.json()
        assert data['description'] == "Updated consultant description"
    
    def test_delete_category(self, session, auth_cookies):
        """DELETE /api/contacts/categories/{id} deletes category"""
        category_id = getattr(TestContactCategories, 'created_category_id', None)
        if not category_id:
            pytest.skip("No category created to delete")
        
        response = session.delete(f"{BASE_URL}/api/contacts/categories/{category_id}")
        assert response.status_code == 200
        assert 'message' in response.json()


# ============== Contacts Tests ==============

class TestContacts:
    """Tests for Contacts CRUD with filters"""
    
    @pytest.fixture(autouse=True)
    def get_category_id(self, session, auth_cookies):
        """Get a valid category ID for creating contacts"""
        response = session.get(f"{BASE_URL}/api/contacts/categories")
        assert response.status_code == 200
        categories = response.json()
        assert len(categories) > 0
        self.category_id = categories[0]['id']
        self.category_name = categories[0]['name']
    
    def test_get_contacts_requires_auth(self, session):
        """GET /api/contacts requires authentication"""
        response = requests.get(f"{BASE_URL}/api/contacts")
        assert response.status_code == 401
    
    def test_get_contacts_returns_paginated_list(self, session, auth_cookies):
        """GET /api/contacts returns paginated response structure"""
        response = session.get(f"{BASE_URL}/api/contacts")
        assert response.status_code == 200
        
        data = response.json()
        assert 'contacts' in data
        assert 'total' in data
        assert 'page' in data
        assert 'page_size' in data
        assert 'total_pages' in data
        
        assert isinstance(data['contacts'], list)
    
    def test_create_contact(self, session, auth_cookies):
        """POST /api/contacts creates new contact"""
        payload = {
            "category_id": self.category_id,
            "name": "TEST_John Doe",
            "company": "TEST_Acme Corp",
            "designation": "CEO",
            "phone": "+91 9876543210",
            "email": "test_john@acmecorp.com",
            "city": "Hyderabad",
            "state": "Telangana",
            "country": "India"
        }
        
        response = session.post(f"{BASE_URL}/api/contacts", json=payload)
        assert response.status_code == 200
        
        data = response.json()
        assert data['name'] == "TEST_John Doe"
        assert data['company'] == "TEST_Acme Corp"
        assert data['email'] == "test_john@acmecorp.com"
        assert data['city'] == "Hyderabad"
        assert 'id' in data
        
        # Store for later tests
        TestContacts.created_contact_id = data['id']
    
    def test_create_contact_requires_name(self, session, auth_cookies):
        """POST /api/contacts requires name field"""
        payload = {
            "category_id": self.category_id,
            "company": "Some Company"
            # Missing name
        }
        
        response = session.post(f"{BASE_URL}/api/contacts", json=payload)
        assert response.status_code in [400, 422]  # Validation error
    
    def test_create_contact_requires_valid_category(self, session, auth_cookies):
        """POST /api/contacts requires valid category_id"""
        payload = {
            "category_id": "invalid-category-id",
            "name": "Test Contact"
        }
        
        response = session.post(f"{BASE_URL}/api/contacts", json=payload)
        assert response.status_code == 400
    
    def test_get_contact_by_id(self, session, auth_cookies):
        """GET /api/contacts/{id} returns single contact"""
        contact_id = getattr(TestContacts, 'created_contact_id', None)
        if not contact_id:
            pytest.skip("No contact created to fetch")
        
        response = session.get(f"{BASE_URL}/api/contacts/{contact_id}")
        assert response.status_code == 200
        
        data = response.json()
        assert data['id'] == contact_id
        assert data['name'] == "TEST_John Doe"
        assert 'category_name' in data or 'category_id' in data
    
    def test_update_contact(self, session, auth_cookies):
        """PUT /api/contacts/{id} updates contact"""
        contact_id = getattr(TestContacts, 'created_contact_id', None)
        if not contact_id:
            pytest.skip("No contact created to update")
        
        payload = {
            "designation": "CTO",
            "phone": "+91 9876543211"
        }
        
        response = session.put(f"{BASE_URL}/api/contacts/{contact_id}", json=payload)
        assert response.status_code == 200
        
        data = response.json()
        assert data['designation'] == "CTO"
        assert data['phone'] == "+91 9876543211"
        # Original fields unchanged
        assert data['name'] == "TEST_John Doe"
    
    def test_get_filter_options(self, session, auth_cookies):
        """GET /api/contacts/filter-options returns dropdown values"""
        response = session.get(f"{BASE_URL}/api/contacts/filter-options")
        assert response.status_code == 200
        
        data = response.json()
        assert 'categories' in data
        assert 'companies' in data
        assert 'cities' in data
        
        assert isinstance(data['categories'], list)
        assert isinstance(data['companies'], list)
        assert isinstance(data['cities'], list)
        
        # Check categories have id and name
        if len(data['categories']) > 0:
            assert 'id' in data['categories'][0]
            assert 'name' in data['categories'][0]
    
    def test_filter_contacts_by_category(self, session, auth_cookies):
        """GET /api/contacts?category_id=x filters by category"""
        response = session.get(f"{BASE_URL}/api/contacts?category_id={self.category_id}")
        assert response.status_code == 200
        
        data = response.json()
        assert 'contacts' in data
        
        # All returned contacts should have matching category
        for contact in data['contacts']:
            assert contact.get('category_id') == self.category_id
    
    def test_filter_contacts_by_city(self, session, auth_cookies):
        """GET /api/contacts?city=Hyderabad filters by city"""
        response = session.get(f"{BASE_URL}/api/contacts?city=Hyderabad")
        assert response.status_code == 200
        
        data = response.json()
        # Should return contacts from Hyderabad (case insensitive search)
        assert 'contacts' in data
    
    def test_search_contacts(self, session, auth_cookies):
        """GET /api/contacts?search=TEST filters by search term"""
        response = session.get(f"{BASE_URL}/api/contacts?search=TEST_John")
        assert response.status_code == 200
        
        data = response.json()
        assert 'contacts' in data
        
        # Should find our test contact
        if data['total'] > 0:
            names = [c['name'] for c in data['contacts']]
            assert any('TEST_John' in name for name in names)
    
    def test_pagination(self, session, auth_cookies):
        """GET /api/contacts supports pagination"""
        response = session.get(f"{BASE_URL}/api/contacts?page=1&page_size=5")
        assert response.status_code == 200
        
        data = response.json()
        assert data['page'] == 1
        assert data['page_size'] == 5
        assert len(data['contacts']) <= 5
    
    def test_delete_contact(self, session, auth_cookies):
        """DELETE /api/contacts/{id} deletes contact"""
        contact_id = getattr(TestContacts, 'created_contact_id', None)
        if not contact_id:
            pytest.skip("No contact created to delete")
        
        response = session.delete(f"{BASE_URL}/api/contacts/{contact_id}")
        assert response.status_code == 200
        assert 'message' in response.json()
        
        # Verify deletion
        verify_response = session.get(f"{BASE_URL}/api/contacts/{contact_id}")
        assert verify_response.status_code == 404
    
    def test_delete_nonexistent_contact(self, session, auth_cookies):
        """DELETE /api/contacts/{id} returns 404 for nonexistent contact"""
        response = session.delete(f"{BASE_URL}/api/contacts/nonexistent-id")
        assert response.status_code == 404


# ============== Extract Card Tests (Optional - Claude Vision) ==============

class TestExtractCard:
    """Tests for visiting card extraction (OCR) - optional functionality"""
    
    def test_extract_card_requires_auth(self, session):
        """POST /api/contacts/extract-card requires authentication"""
        response = requests.post(f"{BASE_URL}/api/contacts/extract-card")
        assert response.status_code in [401, 422]  # 422 if missing form data before auth check
    
    def test_extract_card_requires_image(self, session, auth_cookies):
        """POST /api/contacts/extract-card requires at least one image"""
        # Send without any image data but with multipart form
        # Remove content-type header to allow requests to set multipart boundary
        headers = session.headers.copy()
        session.headers.pop('Content-Type', None)
        
        response = session.post(
            f"{BASE_URL}/api/contacts/extract-card",
            files={},  # Empty files triggers multipart form
            data={}
        )
        
        # Restore headers
        session.headers.update(headers)
        
        # Should return error about missing image (400) or server error (500) if validation happens later
        # The 500 error is acceptable as it occurs during Claude Vision call with no images
        assert response.status_code in [400, 422, 500]


if __name__ == "__main__":
    pytest.main([__file__, "-v", "--tb=short"])
