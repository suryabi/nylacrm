"""
Test suite for Files & Documents Management Module
Tests: Document Categories, Subcategories, and Document CRUD operations
"""
import pytest
import requests
import os
import base64

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', '').rstrip('/')

# Test credentials - Key User (Director role)
TEST_EMAIL = "admin@nylaairwater.earth"
TEST_PASSWORD = "admin123"

# Test data prefixes for cleanup
TEST_PREFIX = "TEST_"


class TestFilesDocumentsModule:
    """Test suite for Files & Documents Management Module"""
    
    @pytest.fixture(autouse=True)
    def setup(self):
        """Setup: Login and get session token"""
        self.session = requests.Session()
        self.session.headers.update({"Content-Type": "application/json"})
        
        # Login to get auth token
        login_response = self.session.post(f"{BASE_URL}/api/auth/login", json={
            "email": TEST_EMAIL,
            "password": TEST_PASSWORD
        })
        
        if login_response.status_code != 200:
            pytest.skip(f"Login failed: {login_response.text}")
        
        login_data = login_response.json()
        self.session_token = login_data.get("session_token")
        self.user = login_data.get("user")
        
        # Update headers with auth token
        self.session.headers.update({
            "Authorization": f"Bearer {self.session_token}"
        })
        
        yield
        
        # Cleanup: Delete test data
        self._cleanup_test_data()
    
    def _cleanup_test_data(self):
        """Cleanup test-created data"""
        try:
            # Delete test documents
            docs_response = self.session.get(f"{BASE_URL}/api/documents")
            if docs_response.status_code == 200:
                for doc in docs_response.json().get("documents", []):
                    if doc.get("name", "").startswith(TEST_PREFIX):
                        self.session.delete(f"{BASE_URL}/api/documents/{doc['id']}")
            
            # Delete test subcategories
            subs_response = self.session.get(f"{BASE_URL}/api/document-subcategories")
            if subs_response.status_code == 200:
                for sub in subs_response.json().get("subcategories", []):
                    if sub.get("name", "").startswith(TEST_PREFIX):
                        self.session.delete(f"{BASE_URL}/api/document-subcategories/{sub['id']}")
            
            # Delete test categories
            cats_response = self.session.get(f"{BASE_URL}/api/document-categories")
            if cats_response.status_code == 200:
                for cat in cats_response.json().get("categories", []):
                    if cat.get("name", "").startswith(TEST_PREFIX):
                        self.session.delete(f"{BASE_URL}/api/document-categories/{cat['id']}")
        except Exception as e:
            print(f"Cleanup error: {e}")
    
    # ============= CATEGORY TESTS =============
    
    def test_01_list_categories(self):
        """Test GET /api/document-categories - list all categories"""
        response = self.session.get(f"{BASE_URL}/api/document-categories")
        
        assert response.status_code == 200
        data = response.json()
        assert "categories" in data
        assert isinstance(data["categories"], list)
    
    def test_02_create_category(self):
        """Test POST /api/document-categories - create category"""
        payload = {
            "name": f"{TEST_PREFIX}Sales Materials",
            "description": "Test category for sales documents"
        }
        
        response = self.session.post(f"{BASE_URL}/api/document-categories", json=payload)
        
        assert response.status_code == 200
        data = response.json()
        assert "category" in data
        assert data["category"]["name"] == payload["name"]
        assert data["category"]["description"] == payload["description"]
        assert "id" in data["category"]
        
        # Store for later tests
        self.created_category_id = data["category"]["id"]
    
    def test_03_create_category_duplicate_name(self):
        """Test POST /api/document-categories - should reject duplicate name"""
        # First create a category
        payload = {"name": f"{TEST_PREFIX}Unique Category"}
        response1 = self.session.post(f"{BASE_URL}/api/document-categories", json=payload)
        assert response1.status_code == 200
        
        # Try to create with same name
        response2 = self.session.post(f"{BASE_URL}/api/document-categories", json=payload)
        assert response2.status_code == 400
        assert "already exists" in response2.json().get("detail", "").lower()
    
    def test_04_update_category(self):
        """Test PUT /api/document-categories/{id} - update category"""
        # Create category first
        create_response = self.session.post(f"{BASE_URL}/api/document-categories", json={
            "name": f"{TEST_PREFIX}Category to Update",
            "description": "Original description"
        })
        assert create_response.status_code == 200
        category_id = create_response.json()["category"]["id"]
        
        # Update it
        update_payload = {
            "name": f"{TEST_PREFIX}Updated Category Name",
            "description": "Updated description"
        }
        update_response = self.session.put(
            f"{BASE_URL}/api/document-categories/{category_id}", 
            json=update_payload
        )
        
        assert update_response.status_code == 200
        
        # Verify update by listing
        list_response = self.session.get(f"{BASE_URL}/api/document-categories")
        categories = list_response.json().get("categories", [])
        updated_cat = next((c for c in categories if c["id"] == category_id), None)
        assert updated_cat is not None
        assert updated_cat["name"] == update_payload["name"]
    
    def test_05_delete_category_empty(self):
        """Test DELETE /api/document-categories/{id} - delete empty category"""
        # Create category
        create_response = self.session.post(f"{BASE_URL}/api/document-categories", json={
            "name": f"{TEST_PREFIX}Category to Delete"
        })
        assert create_response.status_code == 200
        category_id = create_response.json()["category"]["id"]
        
        # Delete it
        delete_response = self.session.delete(f"{BASE_URL}/api/document-categories/{category_id}")
        assert delete_response.status_code == 200
        
        # Verify deletion
        list_response = self.session.get(f"{BASE_URL}/api/document-categories")
        categories = list_response.json().get("categories", [])
        assert not any(c["id"] == category_id for c in categories)
    
    def test_06_delete_category_nonexistent(self):
        """Test DELETE /api/document-categories/{id} - 404 for nonexistent"""
        response = self.session.delete(f"{BASE_URL}/api/document-categories/nonexistent-id-12345")
        assert response.status_code == 404
    
    # ============= SUBCATEGORY TESTS =============
    
    def test_07_list_subcategories(self):
        """Test GET /api/document-subcategories - list all subcategories"""
        response = self.session.get(f"{BASE_URL}/api/document-subcategories")
        
        assert response.status_code == 200
        data = response.json()
        assert "subcategories" in data
        assert isinstance(data["subcategories"], list)
    
    def test_08_create_subcategory(self):
        """Test POST /api/document-subcategories - create subcategory"""
        # First create parent category
        cat_response = self.session.post(f"{BASE_URL}/api/document-categories", json={
            "name": f"{TEST_PREFIX}Parent Category for Sub"
        })
        assert cat_response.status_code == 200
        category_id = cat_response.json()["category"]["id"]
        
        # Create subcategory
        payload = {
            "name": f"{TEST_PREFIX}Contracts",
            "description": "Test subcategory for contracts",
            "category_id": category_id
        }
        
        response = self.session.post(f"{BASE_URL}/api/document-subcategories", json=payload)
        
        assert response.status_code == 200
        data = response.json()
        assert "subcategory" in data
        assert data["subcategory"]["name"] == payload["name"]
        assert data["subcategory"]["category_id"] == category_id
    
    def test_09_create_subcategory_invalid_category(self):
        """Test POST /api/document-subcategories - 404 for invalid parent category"""
        payload = {
            "name": f"{TEST_PREFIX}Invalid Sub",
            "category_id": "nonexistent-category-id-12345"
        }
        
        response = self.session.post(f"{BASE_URL}/api/document-subcategories", json=payload)
        assert response.status_code == 404
        assert "category" in response.json().get("detail", "").lower()
    
    def test_10_filter_subcategories_by_category(self):
        """Test GET /api/document-subcategories?category_id - filter by category"""
        # Create category and subcategory
        cat_response = self.session.post(f"{BASE_URL}/api/document-categories", json={
            "name": f"{TEST_PREFIX}Filter Test Category"
        })
        category_id = cat_response.json()["category"]["id"]
        
        self.session.post(f"{BASE_URL}/api/document-subcategories", json={
            "name": f"{TEST_PREFIX}Filtered Sub",
            "category_id": category_id
        })
        
        # Filter by category
        response = self.session.get(f"{BASE_URL}/api/document-subcategories?category_id={category_id}")
        
        assert response.status_code == 200
        subs = response.json().get("subcategories", [])
        # All returned subs should belong to this category
        for sub in subs:
            assert sub["category_id"] == category_id
    
    def test_11_update_subcategory(self):
        """Test PUT /api/document-subcategories/{id} - update subcategory"""
        # Create category and subcategory
        cat_response = self.session.post(f"{BASE_URL}/api/document-categories", json={
            "name": f"{TEST_PREFIX}Update Sub Parent"
        })
        category_id = cat_response.json()["category"]["id"]
        
        sub_response = self.session.post(f"{BASE_URL}/api/document-subcategories", json={
            "name": f"{TEST_PREFIX}Sub to Update",
            "category_id": category_id
        })
        subcategory_id = sub_response.json()["subcategory"]["id"]
        
        # Update
        update_response = self.session.put(
            f"{BASE_URL}/api/document-subcategories/{subcategory_id}",
            json={"name": f"{TEST_PREFIX}Updated Sub Name", "description": "New desc"}
        )
        
        assert update_response.status_code == 200
    
    def test_12_delete_subcategory_empty(self):
        """Test DELETE /api/document-subcategories/{id} - delete empty subcategory"""
        # Create category and subcategory
        cat_response = self.session.post(f"{BASE_URL}/api/document-categories", json={
            "name": f"{TEST_PREFIX}Delete Sub Parent"
        })
        category_id = cat_response.json()["category"]["id"]
        
        sub_response = self.session.post(f"{BASE_URL}/api/document-subcategories", json={
            "name": f"{TEST_PREFIX}Sub to Delete",
            "category_id": category_id
        })
        subcategory_id = sub_response.json()["subcategory"]["id"]
        
        # Delete
        delete_response = self.session.delete(f"{BASE_URL}/api/document-subcategories/{subcategory_id}")
        assert delete_response.status_code == 200
    
    # ============= DOCUMENT TESTS =============
    
    def test_13_list_documents(self):
        """Test GET /api/documents - list all documents"""
        response = self.session.get(f"{BASE_URL}/api/documents")
        
        assert response.status_code == 200
        data = response.json()
        assert "documents" in data
        assert isinstance(data["documents"], list)
    
    def test_14_upload_document_pdf(self):
        """Test POST /api/documents/upload - upload PDF document"""
        # Create category first
        cat_response = self.session.post(f"{BASE_URL}/api/document-categories", json={
            "name": f"{TEST_PREFIX}Upload Test Category"
        })
        category_id = cat_response.json()["category"]["id"]
        
        # Create a fake PDF (just bytes with PDF header)
        fake_pdf = b'%PDF-1.4\n' + b'0' * 100
        
        # Upload file
        files = {"file": ("test_doc.pdf", fake_pdf, "application/pdf")}
        data = {
            "name": f"{TEST_PREFIX}Test PDF Document",
            "category_id": category_id
        }
        
        # Use multipart/form-data (remove Content-Type header)
        headers = {"Authorization": f"Bearer {self.session_token}"}
        response = requests.post(
            f"{BASE_URL}/api/documents/upload",
            files=files,
            data=data,
            headers=headers
        )
        
        assert response.status_code == 200
        doc_data = response.json()
        assert "document" in doc_data
        assert doc_data["document"]["document_type"] == "pdf"
        assert doc_data["document"]["category_id"] == category_id
    
    def test_15_upload_document_image(self):
        """Test POST /api/documents/upload - upload image document"""
        # Create category first
        cat_response = self.session.post(f"{BASE_URL}/api/document-categories", json={
            "name": f"{TEST_PREFIX}Image Upload Category"
        })
        category_id = cat_response.json()["category"]["id"]
        
        # Create a minimal PNG (1x1 pixel red image)
        png_header = bytes([
            0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A,  # PNG signature
            0x00, 0x00, 0x00, 0x0D,  # IHDR length
            0x49, 0x48, 0x44, 0x52,  # IHDR
            0x00, 0x00, 0x00, 0x01,  # width = 1
            0x00, 0x00, 0x00, 0x01,  # height = 1
            0x08, 0x02,  # bit depth, color type
            0x00, 0x00, 0x00,  # compression, filter, interlace
            0x90, 0x77, 0x53, 0xDE,  # CRC
        ])
        fake_png = png_header + b'\x00' * 50
        
        files = {"file": ("test_image.png", fake_png, "image/png")}
        data = {
            "name": f"{TEST_PREFIX}Test Image Document",
            "category_id": category_id
        }
        
        headers = {"Authorization": f"Bearer {self.session_token}"}
        response = requests.post(
            f"{BASE_URL}/api/documents/upload",
            files=files,
            data=data,
            headers=headers
        )
        
        assert response.status_code == 200
        doc_data = response.json()
        assert doc_data["document"]["document_type"] == "image"
    
    def test_16_upload_document_with_subcategory(self):
        """Test POST /api/documents/upload - upload with subcategory"""
        # Create category and subcategory
        cat_response = self.session.post(f"{BASE_URL}/api/document-categories", json={
            "name": f"{TEST_PREFIX}Subcategory Upload Category"
        })
        category_id = cat_response.json()["category"]["id"]
        
        sub_response = self.session.post(f"{BASE_URL}/api/document-subcategories", json={
            "name": f"{TEST_PREFIX}Subcategory for Upload",
            "category_id": category_id
        })
        subcategory_id = sub_response.json()["subcategory"]["id"]
        
        # Upload document with subcategory
        fake_pdf = b'%PDF-1.4\n' + b'0' * 100
        files = {"file": ("sub_doc.pdf", fake_pdf, "application/pdf")}
        data = {
            "name": f"{TEST_PREFIX}Doc with Subcategory",
            "category_id": category_id,
            "subcategory_id": subcategory_id
        }
        
        headers = {"Authorization": f"Bearer {self.session_token}"}
        response = requests.post(
            f"{BASE_URL}/api/documents/upload",
            files=files,
            data=data,
            headers=headers
        )
        
        assert response.status_code == 200
        doc_data = response.json()
        assert doc_data["document"]["subcategory_id"] == subcategory_id
    
    def test_17_upload_document_size_limit(self):
        """Test POST /api/documents/upload - reject files over 5MB"""
        # Create category first
        cat_response = self.session.post(f"{BASE_URL}/api/document-categories", json={
            "name": f"{TEST_PREFIX}Size Limit Category"
        })
        category_id = cat_response.json()["category"]["id"]
        
        # Create a file larger than 5MB
        large_file = b'%PDF-1.4\n' + b'0' * (6 * 1024 * 1024)  # 6MB
        
        files = {"file": ("large.pdf", large_file, "application/pdf")}
        data = {
            "name": f"{TEST_PREFIX}Large File",
            "category_id": category_id
        }
        
        headers = {"Authorization": f"Bearer {self.session_token}"}
        response = requests.post(
            f"{BASE_URL}/api/documents/upload",
            files=files,
            data=data,
            headers=headers
        )
        
        assert response.status_code == 400
        assert "5 MB" in response.json().get("detail", "")
    
    def test_18_upload_document_invalid_type(self):
        """Test POST /api/documents/upload - reject invalid file type"""
        # Create category first
        cat_response = self.session.post(f"{BASE_URL}/api/document-categories", json={
            "name": f"{TEST_PREFIX}Invalid Type Category"
        })
        category_id = cat_response.json()["category"]["id"]
        
        # Create an executable file
        exe_file = b'MZ' + b'\x00' * 100
        
        files = {"file": ("virus.exe", exe_file, "application/x-msdownload")}
        data = {
            "name": f"{TEST_PREFIX}Bad File",
            "category_id": category_id
        }
        
        headers = {"Authorization": f"Bearer {self.session_token}"}
        response = requests.post(
            f"{BASE_URL}/api/documents/upload",
            files=files,
            data=data,
            headers=headers
        )
        
        assert response.status_code == 400
        assert "not allowed" in response.json().get("detail", "").lower()
    
    def test_19_upload_document_missing_category(self):
        """Test POST /api/documents/upload - require category"""
        fake_pdf = b'%PDF-1.4\n' + b'0' * 100
        
        files = {"file": ("no_cat.pdf", fake_pdf, "application/pdf")}
        data = {"name": f"{TEST_PREFIX}No Category Doc"}
        
        headers = {"Authorization": f"Bearer {self.session_token}"}
        response = requests.post(
            f"{BASE_URL}/api/documents/upload",
            files=files,
            data=data,
            headers=headers
        )
        
        assert response.status_code == 400
        assert "category" in response.json().get("detail", "").lower()
    
    def test_20_get_document_for_download(self):
        """Test GET /api/documents/{id} - get document with file data"""
        # Create category and upload document
        cat_response = self.session.post(f"{BASE_URL}/api/document-categories", json={
            "name": f"{TEST_PREFIX}Download Test Category"
        })
        category_id = cat_response.json()["category"]["id"]
        
        original_content = b'%PDF-1.4\nTest content for download'
        files = {"file": ("download_test.pdf", original_content, "application/pdf")}
        data = {
            "name": f"{TEST_PREFIX}Download Test Doc",
            "category_id": category_id
        }
        
        headers = {"Authorization": f"Bearer {self.session_token}"}
        upload_response = requests.post(
            f"{BASE_URL}/api/documents/upload",
            files=files,
            data=data,
            headers=headers
        )
        document_id = upload_response.json()["document"]["id"]
        
        # Get document for download
        get_response = self.session.get(f"{BASE_URL}/api/documents/{document_id}")
        
        assert get_response.status_code == 200
        doc_data = get_response.json()["document"]
        assert "file_data" in doc_data
        
        # Verify content matches
        decoded_content = base64.b64decode(doc_data["file_data"])
        assert decoded_content == original_content
    
    def test_21_delete_document_by_uploader(self):
        """Test DELETE /api/documents/{id} - uploader can delete their document"""
        # Create category and upload document
        cat_response = self.session.post(f"{BASE_URL}/api/document-categories", json={
            "name": f"{TEST_PREFIX}Delete Doc Category"
        })
        category_id = cat_response.json()["category"]["id"]
        
        fake_pdf = b'%PDF-1.4\n' + b'0' * 100
        files = {"file": ("to_delete.pdf", fake_pdf, "application/pdf")}
        data = {
            "name": f"{TEST_PREFIX}Doc to Delete",
            "category_id": category_id
        }
        
        headers = {"Authorization": f"Bearer {self.session_token}"}
        upload_response = requests.post(
            f"{BASE_URL}/api/documents/upload",
            files=files,
            data=data,
            headers=headers
        )
        document_id = upload_response.json()["document"]["id"]
        
        # Delete document
        delete_response = self.session.delete(f"{BASE_URL}/api/documents/{document_id}")
        assert delete_response.status_code == 200
        
        # Verify deletion
        get_response = self.session.get(f"{BASE_URL}/api/documents/{document_id}")
        assert get_response.status_code == 404
    
    def test_22_filter_documents_by_category(self):
        """Test GET /api/documents?category_id - filter by category"""
        # Create category and upload document
        cat_response = self.session.post(f"{BASE_URL}/api/document-categories", json={
            "name": f"{TEST_PREFIX}Filter Docs Category"
        })
        category_id = cat_response.json()["category"]["id"]
        
        fake_pdf = b'%PDF-1.4\n' + b'0' * 100
        files = {"file": ("filtered.pdf", fake_pdf, "application/pdf")}
        data = {
            "name": f"{TEST_PREFIX}Filtered Doc",
            "category_id": category_id
        }
        
        headers = {"Authorization": f"Bearer {self.session_token}"}
        requests.post(
            f"{BASE_URL}/api/documents/upload",
            files=files,
            data=data,
            headers=headers
        )
        
        # Filter documents
        filter_response = self.session.get(f"{BASE_URL}/api/documents?category_id={category_id}")
        
        assert filter_response.status_code == 200
        docs = filter_response.json().get("documents", [])
        for doc in docs:
            assert doc["category_id"] == category_id
    
    def test_23_delete_category_with_documents_fails(self):
        """Test DELETE /api/document-categories/{id} - cannot delete category with documents"""
        # Create category
        cat_response = self.session.post(f"{BASE_URL}/api/document-categories", json={
            "name": f"{TEST_PREFIX}No Delete Category"
        })
        category_id = cat_response.json()["category"]["id"]
        
        # Upload document
        fake_pdf = b'%PDF-1.4\n' + b'0' * 100
        files = {"file": ("blocker.pdf", fake_pdf, "application/pdf")}
        data = {
            "name": f"{TEST_PREFIX}Blocker Doc",
            "category_id": category_id
        }
        
        headers = {"Authorization": f"Bearer {self.session_token}"}
        requests.post(
            f"{BASE_URL}/api/documents/upload",
            files=files,
            data=data,
            headers=headers
        )
        
        # Try to delete category
        delete_response = self.session.delete(f"{BASE_URL}/api/document-categories/{category_id}")
        assert delete_response.status_code == 400
        assert "document" in delete_response.json().get("detail", "").lower()


# Entry point for pytest
if __name__ == "__main__":
    pytest.main([__file__, "-v"])
