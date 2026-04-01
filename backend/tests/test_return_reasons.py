"""
Test Return Reasons Master CRUD endpoints
Phase 1 of Returns module - Return Reasons configuration in Tenant Settings
"""
import pytest
import requests
import os

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', '').rstrip('/')

# Test credentials
TEST_EMAIL = "surya.yadavalli@nylaairwater.earth"
TEST_PASSWORD = "test123"


class TestReturnReasonsMaster:
    """Test Return Reasons Master CRUD operations"""
    
    @pytest.fixture(autouse=True)
    def setup(self):
        """Setup - get auth token"""
        self.session = requests.Session()
        self.session.headers.update({"Content-Type": "application/json"})
        
        # Login to get token
        login_response = self.session.post(f"{BASE_URL}/api/auth/login", json={
            "email": TEST_EMAIL,
            "password": TEST_PASSWORD
        })
        
        if login_response.status_code != 200:
            pytest.skip(f"Login failed: {login_response.status_code} - {login_response.text}")
        
        token = login_response.json().get("token")
        self.session.headers.update({"Authorization": f"Bearer {token}"})
    
    def test_01_list_return_reasons_empty_or_existing(self):
        """Test listing return reasons - may be empty or have existing data"""
        response = self.session.get(f"{BASE_URL}/api/return-reasons")
        
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        
        data = response.json()
        assert "reasons" in data, "Response should have 'reasons' key"
        assert "total" in data, "Response should have 'total' key"
        assert isinstance(data["reasons"], list), "reasons should be a list"
        
        print(f"Found {data['total']} existing return reasons")
    
    def test_02_get_return_categories(self):
        """Test getting available return categories"""
        response = self.session.get(f"{BASE_URL}/api/return-reasons/categories")
        
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        
        data = response.json()
        assert "categories" in data, "Response should have 'categories' key"
        
        categories = data["categories"]
        assert len(categories) == 4, f"Expected 4 categories, got {len(categories)}"
        
        # Verify expected categories
        category_values = [c["value"] for c in categories]
        expected = ["empty_reusable", "expired", "damaged", "promotional"]
        for exp in expected:
            assert exp in category_values, f"Missing category: {exp}"
        
        print(f"Categories: {category_values}")
    
    def test_03_get_credit_types(self):
        """Test getting available credit calculation types"""
        response = self.session.get(f"{BASE_URL}/api/return-reasons/credit-types")
        
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        
        data = response.json()
        assert "credit_types" in data, "Response should have 'credit_types' key"
        
        credit_types = data["credit_types"]
        assert len(credit_types) == 4, f"Expected 4 credit types, got {len(credit_types)}"
        
        # Verify expected credit types
        type_values = [t["value"] for t in credit_types]
        expected = ["sku_return_credit", "full_price", "percentage", "no_credit"]
        for exp in expected:
            assert exp in type_values, f"Missing credit type: {exp}"
        
        print(f"Credit types: {type_values}")
    
    def test_04_initialize_default_reasons(self):
        """Test initializing default return reasons"""
        response = self.session.post(f"{BASE_URL}/api/return-reasons/initialize-defaults")
        
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        
        data = response.json()
        assert "message" in data, "Response should have 'message' key"
        
        # Either creates new or says already exists
        if "already exist" in data["message"].lower():
            print(f"Default reasons already exist: {data.get('count', 'N/A')} reasons")
        else:
            assert "reasons" in data, "Should return created reason codes"
            print(f"Created default reasons: {data.get('reasons', [])}")
    
    def test_05_list_return_reasons_after_init(self):
        """Test listing return reasons after initialization"""
        response = self.session.get(f"{BASE_URL}/api/return-reasons")
        
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        
        data = response.json()
        reasons = data["reasons"]
        
        # Should have at least 4 default reasons
        assert len(reasons) >= 4, f"Expected at least 4 reasons, got {len(reasons)}"
        
        # Verify default reason codes exist
        reason_codes = [r["reason_code"] for r in reasons]
        expected_codes = ["EMPTY_RETURN", "EXPIRED", "DAMAGED", "FOC_PROMO"]
        for code in expected_codes:
            assert code in reason_codes, f"Missing default reason: {code}"
        
        # Verify credit types for each default reason
        for reason in reasons:
            if reason["reason_code"] == "EMPTY_RETURN":
                assert reason["credit_type"] == "sku_return_credit", "EMPTY_RETURN should use sku_return_credit"
                assert reason["category"] == "empty_reusable", "EMPTY_RETURN should be empty_reusable category"
            elif reason["reason_code"] == "EXPIRED":
                assert reason["credit_type"] == "full_price", "EXPIRED should use full_price"
                assert reason["category"] == "expired", "EXPIRED should be expired category"
            elif reason["reason_code"] == "DAMAGED":
                assert reason["credit_type"] == "full_price", "DAMAGED should use full_price"
                assert reason["category"] == "damaged", "DAMAGED should be damaged category"
            elif reason["reason_code"] == "FOC_PROMO":
                assert reason["credit_type"] == "no_credit", "FOC_PROMO should use no_credit"
                assert reason["category"] == "promotional", "FOC_PROMO should be promotional category"
        
        print(f"Verified {len(reasons)} return reasons with correct credit types")
    
    def test_06_get_single_return_reason(self):
        """Test getting a single return reason by ID"""
        # First get list to find an ID
        list_response = self.session.get(f"{BASE_URL}/api/return-reasons")
        assert list_response.status_code == 200
        
        reasons = list_response.json()["reasons"]
        if not reasons:
            pytest.skip("No return reasons to test")
        
        reason_id = reasons[0]["id"]
        
        # Get single reason
        response = self.session.get(f"{BASE_URL}/api/return-reasons/{reason_id}")
        
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        
        data = response.json()
        assert data["id"] == reason_id, "Returned reason ID should match"
        assert "reason_code" in data, "Should have reason_code"
        assert "reason_name" in data, "Should have reason_name"
        assert "credit_type" in data, "Should have credit_type"
        
        print(f"Retrieved reason: {data['reason_code']} - {data['reason_name']}")
    
    def test_07_create_custom_return_reason(self):
        """Test creating a custom return reason"""
        custom_reason = {
            "reason_code": "TEST_CUSTOM_REASON",
            "reason_name": "Test Custom Return Reason",
            "description": "A test custom return reason for testing",
            "category": "damaged",
            "credit_type": "percentage",
            "credit_percentage": 50.0,
            "return_to_factory": True,
            "requires_inspection": True,
            "color": "#FF5733"
        }
        
        response = self.session.post(f"{BASE_URL}/api/return-reasons", json=custom_reason)
        
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        
        data = response.json()
        assert "reason" in data, "Response should have 'reason' key"
        
        created = data["reason"]
        assert created["reason_code"] == "TEST_CUSTOM_REASON", "Reason code should match"
        assert created["credit_type"] == "percentage", "Credit type should be percentage"
        assert created["credit_percentage"] == 50.0, "Credit percentage should be 50"
        assert created["requires_inspection"] == True, "Should require inspection"
        
        # Store ID for later tests
        self.__class__.custom_reason_id = created["id"]
        
        print(f"Created custom reason: {created['reason_code']} with ID {created['id']}")
    
    def test_08_create_duplicate_reason_code_fails(self):
        """Test that creating a duplicate reason code fails"""
        duplicate_reason = {
            "reason_code": "EMPTY_RETURN",  # Already exists
            "reason_name": "Duplicate Test",
            "category": "empty_reusable",
            "credit_type": "sku_return_credit"
        }
        
        response = self.session.post(f"{BASE_URL}/api/return-reasons", json=duplicate_reason)
        
        assert response.status_code == 400, f"Expected 400 for duplicate, got {response.status_code}"
        
        data = response.json()
        assert "already exists" in data.get("detail", "").lower(), "Should mention already exists"
        
        print("Correctly rejected duplicate reason code")
    
    def test_09_update_return_reason(self):
        """Test updating a return reason"""
        if not hasattr(self.__class__, 'custom_reason_id'):
            pytest.skip("No custom reason created to update")
        
        reason_id = self.__class__.custom_reason_id
        
        update_data = {
            "reason_name": "Updated Test Reason",
            "description": "Updated description",
            "credit_percentage": 75.0,
            "requires_inspection": False
        }
        
        response = self.session.put(f"{BASE_URL}/api/return-reasons/{reason_id}", json=update_data)
        
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        
        data = response.json()
        assert "reason" in data, "Response should have 'reason' key"
        
        updated = data["reason"]
        assert updated["reason_name"] == "Updated Test Reason", "Name should be updated"
        assert updated["credit_percentage"] == 75.0, "Credit percentage should be updated"
        assert updated["requires_inspection"] == False, "Inspection flag should be updated"
        
        print(f"Updated reason: {updated['reason_name']}")
    
    def test_10_toggle_reason_active_status(self):
        """Test toggling a return reason's active status"""
        if not hasattr(self.__class__, 'custom_reason_id'):
            pytest.skip("No custom reason created to toggle")
        
        reason_id = self.__class__.custom_reason_id
        
        # Deactivate
        response = self.session.put(f"{BASE_URL}/api/return-reasons/{reason_id}", json={"is_active": False})
        
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        
        data = response.json()
        assert data["reason"]["is_active"] == False, "Should be deactivated"
        
        # Reactivate
        response = self.session.put(f"{BASE_URL}/api/return-reasons/{reason_id}", json={"is_active": True})
        
        assert response.status_code == 200
        assert response.json()["reason"]["is_active"] == True, "Should be reactivated"
        
        print("Successfully toggled active status")
    
    def test_11_filter_by_active_status(self):
        """Test filtering return reasons by active status"""
        # Get only active reasons
        response = self.session.get(f"{BASE_URL}/api/return-reasons?is_active=true")
        
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        
        data = response.json()
        for reason in data["reasons"]:
            assert reason["is_active"] == True, "All returned reasons should be active"
        
        print(f"Found {data['total']} active reasons")
    
    def test_12_filter_by_category(self):
        """Test filtering return reasons by category"""
        response = self.session.get(f"{BASE_URL}/api/return-reasons?category=expired")
        
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        
        data = response.json()
        for reason in data["reasons"]:
            assert reason["category"] == "expired", "All returned reasons should be expired category"
        
        print(f"Found {data['total']} expired category reasons")
    
    def test_13_delete_custom_reason(self):
        """Test deleting a custom return reason"""
        if not hasattr(self.__class__, 'custom_reason_id'):
            pytest.skip("No custom reason created to delete")
        
        reason_id = self.__class__.custom_reason_id
        
        response = self.session.delete(f"{BASE_URL}/api/return-reasons/{reason_id}")
        
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        
        # Verify deletion
        get_response = self.session.get(f"{BASE_URL}/api/return-reasons/{reason_id}")
        assert get_response.status_code == 404, "Deleted reason should return 404"
        
        print(f"Successfully deleted custom reason {reason_id}")
    
    def test_14_cannot_delete_system_reason(self):
        """Test that system return reasons cannot be deleted"""
        # Get a system reason
        list_response = self.session.get(f"{BASE_URL}/api/return-reasons")
        assert list_response.status_code == 200
        
        reasons = list_response.json()["reasons"]
        system_reason = next((r for r in reasons if r.get("is_system")), None)
        
        if not system_reason:
            pytest.skip("No system reasons found to test")
        
        response = self.session.delete(f"{BASE_URL}/api/return-reasons/{system_reason['id']}")
        
        assert response.status_code == 400, f"Expected 400 for system reason delete, got {response.status_code}"
        
        data = response.json()
        assert "cannot be deleted" in data.get("detail", "").lower() or "system" in data.get("detail", "").lower(), \
            "Should mention system reasons cannot be deleted"
        
        print(f"Correctly prevented deletion of system reason: {system_reason['reason_code']}")
    
    def test_15_get_nonexistent_reason_returns_404(self):
        """Test that getting a non-existent reason returns 404"""
        response = self.session.get(f"{BASE_URL}/api/return-reasons/nonexistent-id-12345")
        
        assert response.status_code == 404, f"Expected 404, got {response.status_code}"
        
        print("Correctly returned 404 for non-existent reason")


if __name__ == "__main__":
    pytest.main([__file__, "-v", "--tb=short"])
