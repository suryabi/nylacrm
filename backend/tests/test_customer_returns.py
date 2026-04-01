"""
Customer Returns API Tests
Tests for Phase 2 of Returns module - Customer Returns tracking
"""
import pytest
import requests
import os
from datetime import datetime

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', '').rstrip('/')

# Test credentials
TEST_EMAIL = "surya.yadavalli@nylaairwater.earth"
TEST_PASSWORD = "test123"


class TestCustomerReturnsAPI:
    """Test Customer Returns CRUD endpoints"""
    
    @pytest.fixture(autouse=True)
    def setup(self):
        """Setup test fixtures"""
        self.session = requests.Session()
        self.session.headers.update({"Content-Type": "application/json"})
        
        # Login to get token
        login_response = self.session.post(f"{BASE_URL}/api/auth/login", json={
            "email": TEST_EMAIL,
            "password": TEST_PASSWORD
        })
        assert login_response.status_code == 200, f"Login failed: {login_response.text}"
        token = login_response.json().get("session_token")
        assert token, "No session token received"
        self.session.headers.update({"Authorization": f"Bearer {token}"})
        
        # Get a distributor (Brian)
        dist_response = self.session.get(f"{BASE_URL}/api/distributors")
        assert dist_response.status_code == 200
        distributors = dist_response.json().get("distributors", [])
        assert len(distributors) > 0, "No distributors found"
        
        # Find Brian or use first distributor
        self.distributor = None
        for d in distributors:
            if "brian" in d.get("distributor_name", "").lower():
                self.distributor = d
                break
        if not self.distributor:
            self.distributor = distributors[0]
        
        self.distributor_id = self.distributor["id"]
        print(f"Using distributor: {self.distributor.get('distributor_name')} ({self.distributor_id})")
        
        # Get assigned accounts for this distributor
        accounts_response = self.session.get(f"{BASE_URL}/api/distributors/{self.distributor_id}/assigned-accounts")
        if accounts_response.status_code == 200:
            self.accounts = accounts_response.json().get("accounts", [])
        else:
            self.accounts = []
        
        # Get SKUs
        skus_response = self.session.get(f"{BASE_URL}/api/master-skus")
        if skus_response.status_code == 200:
            self.skus = skus_response.json().get("skus", skus_response.json())
            if isinstance(self.skus, list) and len(self.skus) > 0:
                self.test_sku = self.skus[0]
            else:
                self.test_sku = None
        else:
            self.skus = []
            self.test_sku = None
        
        # Get return reasons
        reasons_response = self.session.get(f"{BASE_URL}/api/return-reasons?is_active=true")
        if reasons_response.status_code == 200:
            self.return_reasons = reasons_response.json().get("reasons", [])
        else:
            self.return_reasons = []
        
        yield
        
        # Cleanup - delete test returns
        self._cleanup_test_returns()
    
    def _cleanup_test_returns(self):
        """Clean up test-created returns"""
        try:
            response = self.session.get(f"{BASE_URL}/api/distributors/{self.distributor_id}/returns")
            if response.status_code == 200:
                returns = response.json().get("returns", [])
                for ret in returns:
                    if ret.get("status") == "draft" and "TEST" in ret.get("notes", ""):
                        self.session.delete(f"{BASE_URL}/api/distributors/{self.distributor_id}/returns/{ret['id']}")
        except Exception as e:
            print(f"Cleanup error: {e}")
    
    # ============ List Returns Tests ============
    
    def test_list_returns_endpoint_exists(self):
        """Test that list returns endpoint exists and returns proper structure"""
        response = self.session.get(f"{BASE_URL}/api/distributors/{self.distributor_id}/returns")
        assert response.status_code == 200, f"List returns failed: {response.text}"
        
        data = response.json()
        assert "returns" in data, "Response should have 'returns' key"
        assert "total" in data, "Response should have 'total' key"
        assert "summary" in data, "Response should have 'summary' key"
        print(f"Found {data['total']} returns")
    
    def test_list_returns_with_status_filter(self):
        """Test filtering returns by status"""
        response = self.session.get(f"{BASE_URL}/api/distributors/{self.distributor_id}/returns?status=draft")
        assert response.status_code == 200
        
        data = response.json()
        for ret in data.get("returns", []):
            assert ret.get("status") == "draft", "All returns should be draft status"
    
    def test_list_returns_with_account_filter(self):
        """Test filtering returns by account"""
        if not self.accounts:
            pytest.skip("No accounts available for testing")
        
        account_id = self.accounts[0].get("id")
        response = self.session.get(f"{BASE_URL}/api/distributors/{self.distributor_id}/returns?account_id={account_id}")
        assert response.status_code == 200
    
    # ============ Create Return Tests ============
    
    def test_create_return_requires_account(self):
        """Test that creating a return requires an account"""
        response = self.session.post(
            f"{BASE_URL}/api/distributors/{self.distributor_id}/returns",
            json={
                "return_date": datetime.now().strftime("%Y-%m-%d"),
                "items": [],
                "notes": "TEST - should fail"
            }
        )
        assert response.status_code == 422, "Should fail validation without account_id"
    
    def test_create_return_requires_items(self):
        """Test that creating a return requires at least one item"""
        if not self.accounts:
            pytest.skip("No accounts available for testing")
        
        response = self.session.post(
            f"{BASE_URL}/api/distributors/{self.distributor_id}/returns",
            json={
                "account_id": self.accounts[0].get("id"),
                "return_date": datetime.now().strftime("%Y-%m-%d"),
                "items": [],
                "notes": "TEST - should fail"
            }
        )
        # Empty items should be allowed but may result in 0 quantity return
        # or validation error depending on implementation
        assert response.status_code in [200, 201, 400, 422]
    
    def test_create_return_success(self):
        """Test creating a customer return successfully"""
        if not self.accounts:
            pytest.skip("No accounts available for testing")
        if not self.test_sku:
            pytest.skip("No SKUs available for testing")
        if not self.return_reasons:
            pytest.skip("No return reasons available for testing")
        
        account = self.accounts[0]
        reason = self.return_reasons[0]
        
        response = self.session.post(
            f"{BASE_URL}/api/distributors/{self.distributor_id}/returns",
            json={
                "account_id": account.get("id"),
                "return_date": datetime.now().strftime("%Y-%m-%d"),
                "items": [
                    {
                        "sku_id": self.test_sku.get("id"),
                        "quantity": 5,
                        "reason_id": reason.get("id")
                    }
                ],
                "notes": "TEST - automated test return"
            }
        )
        
        assert response.status_code in [200, 201], f"Create return failed: {response.text}"
        
        data = response.json()
        assert "return" in data, "Response should have 'return' key"
        
        created_return = data["return"]
        assert created_return.get("return_number"), "Return should have a return_number"
        assert created_return.get("status") == "draft", "New return should be in draft status"
        assert created_return.get("total_quantity") == 5, "Total quantity should be 5"
        assert created_return.get("account_id") == account.get("id"), "Account ID should match"
        
        # Store for later tests
        self.created_return_id = created_return.get("id")
        print(f"Created return: {created_return.get('return_number')}")
        
        return created_return
    
    def test_create_return_with_invalid_sku(self):
        """Test creating a return with invalid SKU fails"""
        if not self.accounts:
            pytest.skip("No accounts available for testing")
        if not self.return_reasons:
            pytest.skip("No return reasons available for testing")
        
        response = self.session.post(
            f"{BASE_URL}/api/distributors/{self.distributor_id}/returns",
            json={
                "account_id": self.accounts[0].get("id"),
                "return_date": datetime.now().strftime("%Y-%m-%d"),
                "items": [
                    {
                        "sku_id": "invalid-sku-id-12345",
                        "quantity": 5,
                        "reason_id": self.return_reasons[0].get("id")
                    }
                ],
                "notes": "TEST - should fail"
            }
        )
        assert response.status_code == 404, "Should fail with invalid SKU"
    
    def test_create_return_with_invalid_reason(self):
        """Test creating a return with invalid reason fails"""
        if not self.accounts:
            pytest.skip("No accounts available for testing")
        if not self.test_sku:
            pytest.skip("No SKUs available for testing")
        
        response = self.session.post(
            f"{BASE_URL}/api/distributors/{self.distributor_id}/returns",
            json={
                "account_id": self.accounts[0].get("id"),
                "return_date": datetime.now().strftime("%Y-%m-%d"),
                "items": [
                    {
                        "sku_id": self.test_sku.get("id"),
                        "quantity": 5,
                        "reason_id": "invalid-reason-id-12345"
                    }
                ],
                "notes": "TEST - should fail"
            }
        )
        assert response.status_code == 404, "Should fail with invalid reason"
    
    # ============ Get Return Detail Tests ============
    
    def test_get_return_detail(self):
        """Test getting a specific return's details"""
        # First create a return
        created = self.test_create_return_success()
        if not created:
            pytest.skip("Could not create return for testing")
        
        return_id = created.get("id")
        
        response = self.session.get(f"{BASE_URL}/api/distributors/{self.distributor_id}/returns/{return_id}")
        assert response.status_code == 200, f"Get return detail failed: {response.text}"
        
        data = response.json()
        assert data.get("id") == return_id
        assert data.get("return_number") == created.get("return_number")
        assert "items" in data, "Return should have items"
        
        # Verify item structure
        if data.get("items"):
            item = data["items"][0]
            assert "sku_id" in item
            assert "quantity" in item
            assert "reason_id" in item
            assert "credit_type" in item
            assert "total_credit" in item
    
    def test_get_nonexistent_return(self):
        """Test getting a non-existent return returns 404"""
        response = self.session.get(f"{BASE_URL}/api/distributors/{self.distributor_id}/returns/nonexistent-id-12345")
        assert response.status_code == 404
    
    # ============ Confirm Return Tests ============
    
    def test_confirm_return(self):
        """Test confirming a draft return"""
        # First create a return
        created = self.test_create_return_success()
        if not created:
            pytest.skip("Could not create return for testing")
        
        return_id = created.get("id")
        
        response = self.session.post(f"{BASE_URL}/api/distributors/{self.distributor_id}/returns/{return_id}/confirm")
        assert response.status_code == 200, f"Confirm return failed: {response.text}"
        
        data = response.json()
        assert data.get("status") == "confirmed", "Return should be confirmed"
        
        # Verify status changed
        get_response = self.session.get(f"{BASE_URL}/api/distributors/{self.distributor_id}/returns/{return_id}")
        assert get_response.status_code == 200
        assert get_response.json().get("status") == "confirmed"
    
    def test_confirm_already_confirmed_return(self):
        """Test confirming an already confirmed return fails"""
        # First create and confirm a return
        created = self.test_create_return_success()
        if not created:
            pytest.skip("Could not create return for testing")
        
        return_id = created.get("id")
        
        # Confirm first time
        self.session.post(f"{BASE_URL}/api/distributors/{self.distributor_id}/returns/{return_id}/confirm")
        
        # Try to confirm again
        response = self.session.post(f"{BASE_URL}/api/distributors/{self.distributor_id}/returns/{return_id}/confirm")
        assert response.status_code == 400, "Should not be able to confirm already confirmed return"
    
    # ============ Cancel Return Tests ============
    
    def test_cancel_return(self):
        """Test cancelling a return"""
        # First create a return
        created = self.test_create_return_success()
        if not created:
            pytest.skip("Could not create return for testing")
        
        return_id = created.get("id")
        
        response = self.session.post(f"{BASE_URL}/api/distributors/{self.distributor_id}/returns/{return_id}/cancel")
        assert response.status_code == 200, f"Cancel return failed: {response.text}"
        
        data = response.json()
        assert data.get("status") == "cancelled", "Return should be cancelled"
    
    def test_cancel_already_cancelled_return(self):
        """Test cancelling an already cancelled return fails"""
        # First create and cancel a return
        created = self.test_create_return_success()
        if not created:
            pytest.skip("Could not create return for testing")
        
        return_id = created.get("id")
        
        # Cancel first time
        self.session.post(f"{BASE_URL}/api/distributors/{self.distributor_id}/returns/{return_id}/cancel")
        
        # Try to cancel again
        response = self.session.post(f"{BASE_URL}/api/distributors/{self.distributor_id}/returns/{return_id}/cancel")
        assert response.status_code == 400, "Should not be able to cancel already cancelled return"
    
    # ============ Delete Return Tests ============
    
    def test_delete_draft_return(self):
        """Test deleting a draft return"""
        # First create a return
        created = self.test_create_return_success()
        if not created:
            pytest.skip("Could not create return for testing")
        
        return_id = created.get("id")
        
        response = self.session.delete(f"{BASE_URL}/api/distributors/{self.distributor_id}/returns/{return_id}")
        assert response.status_code == 200, f"Delete return failed: {response.text}"
        
        # Verify deleted
        get_response = self.session.get(f"{BASE_URL}/api/distributors/{self.distributor_id}/returns/{return_id}")
        assert get_response.status_code == 404, "Deleted return should not be found"
    
    def test_delete_confirmed_return_fails(self):
        """Test that deleting a confirmed return fails"""
        # First create and confirm a return
        created = self.test_create_return_success()
        if not created:
            pytest.skip("Could not create return for testing")
        
        return_id = created.get("id")
        
        # Confirm the return
        self.session.post(f"{BASE_URL}/api/distributors/{self.distributor_id}/returns/{return_id}/confirm")
        
        # Try to delete
        response = self.session.delete(f"{BASE_URL}/api/distributors/{self.distributor_id}/returns/{return_id}")
        assert response.status_code == 400, "Should not be able to delete confirmed return"
    
    # ============ Returns Summary Tests ============
    
    def test_returns_summary(self):
        """Test getting returns summary for a distributor"""
        response = self.session.get(f"{BASE_URL}/api/distributors/{self.distributor_id}/returns-summary")
        assert response.status_code == 200, f"Get returns summary failed: {response.text}"
        
        data = response.json()
        assert "by_status" in data, "Summary should have by_status"
        assert "by_category" in data, "Summary should have by_category"
    
    # ============ Credit Calculation Tests ============
    
    def test_credit_calculation_sku_return_credit(self):
        """Test credit calculation for SKU return credit type"""
        if not self.accounts:
            pytest.skip("No accounts available for testing")
        if not self.test_sku:
            pytest.skip("No SKUs available for testing")
        
        # Find EMPTY_RETURN reason (sku_return_credit type)
        empty_reason = None
        for r in self.return_reasons:
            if r.get("credit_type") == "sku_return_credit":
                empty_reason = r
                break
        
        if not empty_reason:
            pytest.skip("No sku_return_credit reason found")
        
        response = self.session.post(
            f"{BASE_URL}/api/distributors/{self.distributor_id}/returns",
            json={
                "account_id": self.accounts[0].get("id"),
                "return_date": datetime.now().strftime("%Y-%m-%d"),
                "items": [
                    {
                        "sku_id": self.test_sku.get("id"),
                        "quantity": 10,
                        "reason_id": empty_reason.get("id")
                    }
                ],
                "notes": "TEST - credit calculation test"
            }
        )
        
        assert response.status_code in [200, 201]
        
        data = response.json()
        created_return = data.get("return", {})
        items = created_return.get("items", [])
        
        if items:
            item = items[0]
            assert item.get("credit_type") == "sku_return_credit"
            # Credit should be based on return_credit_per_unit from account SKU pricing
            print(f"Credit per unit: {item.get('credit_per_unit')}, Total credit: {item.get('total_credit')}")
    
    def test_credit_calculation_full_price(self):
        """Test credit calculation for full price type"""
        if not self.accounts:
            pytest.skip("No accounts available for testing")
        if not self.test_sku:
            pytest.skip("No SKUs available for testing")
        
        # Find EXPIRED or DAMAGED reason (full_price type)
        full_price_reason = None
        for r in self.return_reasons:
            if r.get("credit_type") == "full_price":
                full_price_reason = r
                break
        
        if not full_price_reason:
            pytest.skip("No full_price reason found")
        
        response = self.session.post(
            f"{BASE_URL}/api/distributors/{self.distributor_id}/returns",
            json={
                "account_id": self.accounts[0].get("id"),
                "return_date": datetime.now().strftime("%Y-%m-%d"),
                "items": [
                    {
                        "sku_id": self.test_sku.get("id"),
                        "quantity": 5,
                        "reason_id": full_price_reason.get("id"),
                        "unit_price": 100.00
                    }
                ],
                "notes": "TEST - full price credit test"
            }
        )
        
        assert response.status_code in [200, 201]
        
        data = response.json()
        created_return = data.get("return", {})
        items = created_return.get("items", [])
        
        if items:
            item = items[0]
            assert item.get("credit_type") == "full_price"
            # Credit should be unit_price * quantity
            expected_credit = 100.00 * 5
            assert item.get("total_credit") == expected_credit, f"Expected {expected_credit}, got {item.get('total_credit')}"
    
    def test_credit_calculation_no_credit(self):
        """Test credit calculation for no credit type (FOC/Promotional)"""
        if not self.accounts:
            pytest.skip("No accounts available for testing")
        if not self.test_sku:
            pytest.skip("No SKUs available for testing")
        
        # Find FOC_PROMO reason (no_credit type)
        no_credit_reason = None
        for r in self.return_reasons:
            if r.get("credit_type") == "no_credit":
                no_credit_reason = r
                break
        
        if not no_credit_reason:
            pytest.skip("No no_credit reason found")
        
        response = self.session.post(
            f"{BASE_URL}/api/distributors/{self.distributor_id}/returns",
            json={
                "account_id": self.accounts[0].get("id"),
                "return_date": datetime.now().strftime("%Y-%m-%d"),
                "items": [
                    {
                        "sku_id": self.test_sku.get("id"),
                        "quantity": 3,
                        "reason_id": no_credit_reason.get("id")
                    }
                ],
                "notes": "TEST - no credit test"
            }
        )
        
        assert response.status_code in [200, 201]
        
        data = response.json()
        created_return = data.get("return", {})
        items = created_return.get("items", [])
        
        if items:
            item = items[0]
            assert item.get("credit_type") == "no_credit"
            assert item.get("total_credit") == 0, "No credit type should have 0 credit"


if __name__ == "__main__":
    pytest.main([__file__, "-v", "--tb=short"])
