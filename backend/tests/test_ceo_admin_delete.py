"""
Test CEO/Admin Delete Functionality
Tests that CEO/Admin can delete deliveries, customer returns, factory returns, and credit notes
regardless of their status (not just draft).
"""
import pytest
import requests
import os

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', '').rstrip('/')

# Test credentials from test_credentials.md
ADMIN_EMAIL = "surya.yadavalli@nylaairwater.earth"
ADMIN_PASSWORD = "test123"
TENANT_ID = "nyla-air-water"
DISTRIBUTOR_ID = "d091204f-e04f-46f2-b9a9-d92d9f89b528"  # Distributor with data


class TestCEOAdminDelete:
    """Test CEO/Admin delete functionality for various transaction types"""
    
    @pytest.fixture(autouse=True)
    def setup(self):
        """Setup test session with authentication"""
        self.session = requests.Session()
        self.session.headers.update({
            "Content-Type": "application/json",
            "X-Tenant-ID": TENANT_ID
        })
        
        # Login to get token
        login_response = self.session.post(
            f"{BASE_URL}/api/auth/login",
            json={"email": ADMIN_EMAIL, "password": ADMIN_PASSWORD}
        )
        
        if login_response.status_code != 200:
            pytest.skip(f"Login failed: {login_response.status_code} - {login_response.text}")
        
        login_data = login_response.json()
        # Auth returns session_token, not token
        token = login_data.get('session_token') or login_data.get('token')
        if not token:
            pytest.skip(f"No token in login response: {login_data}")
        
        self.session.headers.update({"Authorization": f"Bearer {token}"})
        self.user_role = login_data.get('user', {}).get('role', '')
        print(f"Logged in as {ADMIN_EMAIL} with role: {self.user_role}")
        
        yield
        
        self.session.close()
    
    # ============ DELIVERY DELETE TESTS ============
    
    def test_list_deliveries(self):
        """Test listing deliveries to find ones with various statuses"""
        response = self.session.get(
            f"{BASE_URL}/api/distributors/{DISTRIBUTOR_ID}/deliveries?page_size=50"
        )
        assert response.status_code == 200, f"Failed to list deliveries: {response.text}"
        
        data = response.json()
        deliveries = data.get('deliveries', [])
        print(f"Found {len(deliveries)} deliveries")
        
        # Group by status
        by_status = {}
        for d in deliveries:
            status = d.get('status', 'unknown')
            if status not in by_status:
                by_status[status] = []
            by_status[status].append(d)
        
        for status, items in by_status.items():
            print(f"  - {status}: {len(items)} deliveries")
        
        return deliveries
    
    def test_ceo_can_delete_delivered_delivery(self):
        """Test that CEO can delete a delivered delivery (not just draft)"""
        # First, list deliveries to find a delivered one
        response = self.session.get(
            f"{BASE_URL}/api/distributors/{DISTRIBUTOR_ID}/deliveries?page_size=100"
        )
        assert response.status_code == 200
        
        deliveries = response.json().get('deliveries', [])
        
        # Find a delivered delivery that's not part of a settlement
        delivered = [d for d in deliveries if d.get('status') == 'delivered' and not d.get('settlement_id')]
        
        if not delivered:
            # Create a test delivery and mark it as delivered
            print("No delivered deliveries found, creating one for test...")
            delivery_id = self._create_test_delivery()
            if delivery_id:
                # Complete the delivery
                complete_resp = self.session.post(
                    f"{BASE_URL}/api/distributors/{DISTRIBUTOR_ID}/deliveries/{delivery_id}/complete"
                )
                if complete_resp.status_code == 200:
                    delivered = [{"id": delivery_id, "delivery_number": "TEST"}]
        
        if not delivered:
            pytest.skip("No delivered deliveries available for testing")
        
        delivery = delivered[0]
        delivery_id = delivery.get('id')
        delivery_number = delivery.get('delivery_number')
        
        print(f"Attempting to delete delivered delivery: {delivery_number} (ID: {delivery_id})")
        
        # Try to delete
        delete_response = self.session.delete(
            f"{BASE_URL}/api/distributors/{DISTRIBUTOR_ID}/deliveries/{delivery_id}"
        )
        
        print(f"Delete response: {delete_response.status_code} - {delete_response.text}")
        
        # CEO should be able to delete delivered deliveries
        assert delete_response.status_code == 200, f"CEO should be able to delete delivered delivery: {delete_response.text}"
        
        # Verify it's deleted
        get_response = self.session.get(
            f"{BASE_URL}/api/distributors/{DISTRIBUTOR_ID}/deliveries/{delivery_id}"
        )
        assert get_response.status_code == 404, "Delivery should be deleted"
        
        print(f"Successfully deleted delivered delivery: {delivery_number}")
    
    def _create_test_delivery(self):
        """Helper to create a test delivery"""
        # Get assigned accounts
        accounts_resp = self.session.get(
            f"{BASE_URL}/api/distributors/{DISTRIBUTOR_ID}/assigned-accounts"
        )
        if accounts_resp.status_code != 200:
            return None
        
        accounts = accounts_resp.json().get('accounts', [])
        if not accounts:
            return None
        
        # Get locations
        locations_resp = self.session.get(
            f"{BASE_URL}/api/distributors/{DISTRIBUTOR_ID}/locations"
        )
        if locations_resp.status_code != 200:
            return None
        
        locations = locations_resp.json().get('locations', [])
        if not locations:
            return None
        
        # Get SKUs
        skus_resp = self.session.get(f"{BASE_URL}/api/master-skus")
        if skus_resp.status_code != 200:
            return None
        
        skus = skus_resp.json().get('skus', [])
        if not skus:
            return None
        
        # Create delivery
        create_resp = self.session.post(
            f"{BASE_URL}/api/distributors/{DISTRIBUTOR_ID}/deliveries",
            json={
                "account_id": accounts[0].get('account_id') or accounts[0].get('id'),
                "distributor_location_id": locations[0].get('id'),
                "delivery_date": "2026-01-15",
                "items": [{
                    "sku_id": skus[0].get('id'),
                    "quantity": 1,
                    "unit_price": 100
                }]
            }
        )
        
        if create_resp.status_code in [200, 201]:
            return create_resp.json().get('id')
        return None
    
    # ============ CUSTOMER RETURN DELETE TESTS ============
    
    def test_list_customer_returns(self):
        """Test listing customer returns to find ones with various statuses"""
        response = self.session.get(
            f"{BASE_URL}/api/distributors/{DISTRIBUTOR_ID}/returns"
        )
        assert response.status_code == 200, f"Failed to list returns: {response.text}"
        
        data = response.json()
        returns = data.get('returns', [])
        print(f"Found {len(returns)} customer returns")
        
        # Group by status
        by_status = {}
        for r in returns:
            status = r.get('status', 'unknown')
            if status not in by_status:
                by_status[status] = []
            by_status[status].append(r)
        
        for status, items in by_status.items():
            print(f"  - {status}: {len(items)} returns")
        
        return returns
    
    def test_ceo_can_delete_approved_customer_return(self):
        """Test that CEO can delete an approved customer return (not just draft)"""
        response = self.session.get(
            f"{BASE_URL}/api/distributors/{DISTRIBUTOR_ID}/returns"
        )
        assert response.status_code == 200
        
        returns = response.json().get('returns', [])
        
        # Find a non-draft return (approved, credit_issued, etc.)
        non_draft = [r for r in returns if r.get('status') not in ['draft', 'cancelled']]
        
        if not non_draft:
            # Try to find a draft and approve it
            draft = [r for r in returns if r.get('status') == 'draft']
            if draft:
                return_id = draft[0].get('id')
                approve_resp = self.session.post(
                    f"{BASE_URL}/api/distributors/{DISTRIBUTOR_ID}/returns/{return_id}/approve"
                )
                if approve_resp.status_code == 200:
                    non_draft = [{"id": return_id, "return_number": draft[0].get('return_number'), "status": "approved"}]
        
        if not non_draft:
            pytest.skip("No non-draft customer returns available for testing")
        
        ret = non_draft[0]
        return_id = ret.get('id')
        return_number = ret.get('return_number')
        status = ret.get('status')
        
        print(f"Attempting to delete {status} customer return: {return_number} (ID: {return_id})")
        
        # Try to delete
        delete_response = self.session.delete(
            f"{BASE_URL}/api/distributors/{DISTRIBUTOR_ID}/returns/{return_id}"
        )
        
        print(f"Delete response: {delete_response.status_code} - {delete_response.text}")
        
        # CEO should be able to delete non-draft returns
        assert delete_response.status_code == 200, f"CEO should be able to delete {status} return: {delete_response.text}"
        
        # Verify it's deleted
        get_response = self.session.get(
            f"{BASE_URL}/api/distributors/{DISTRIBUTOR_ID}/returns/{return_id}"
        )
        assert get_response.status_code == 404, "Return should be deleted"
        
        print(f"Successfully deleted {status} customer return: {return_number}")
    
    # ============ FACTORY RETURN DELETE TESTS ============
    
    def test_list_factory_returns(self):
        """Test listing factory returns to find ones with various statuses"""
        response = self.session.get(
            f"{BASE_URL}/api/distributors/{DISTRIBUTOR_ID}/factory-returns"
        )
        assert response.status_code == 200, f"Failed to list factory returns: {response.text}"
        
        data = response.json()
        returns = data.get('factory_returns', [])
        print(f"Found {len(returns)} factory returns")
        
        # Group by status
        by_status = {}
        for r in returns:
            status = r.get('status', 'unknown')
            if status not in by_status:
                by_status[status] = []
            by_status[status].append(r)
        
        for status, items in by_status.items():
            print(f"  - {status}: {len(items)} returns")
        
        return returns
    
    def test_ceo_can_delete_confirmed_factory_return(self):
        """Test that CEO can delete a confirmed factory return (not just draft)"""
        response = self.session.get(
            f"{BASE_URL}/api/distributors/{DISTRIBUTOR_ID}/factory-returns"
        )
        assert response.status_code == 200
        
        returns = response.json().get('factory_returns', [])
        
        # Find a non-draft return (confirmed, received, etc.)
        non_draft = [r for r in returns if r.get('status') not in ['draft', 'cancelled']]
        
        if not non_draft:
            # Try to find a draft and confirm it
            draft = [r for r in returns if r.get('status') == 'draft']
            if draft:
                return_id = draft[0].get('id')
                confirm_resp = self.session.put(
                    f"{BASE_URL}/api/distributors/{DISTRIBUTOR_ID}/factory-returns/{return_id}/confirm"
                )
                if confirm_resp.status_code == 200:
                    non_draft = [{"id": return_id, "return_number": draft[0].get('return_number'), "status": "confirmed"}]
        
        if not non_draft:
            pytest.skip("No non-draft factory returns available for testing")
        
        ret = non_draft[0]
        return_id = ret.get('id')
        return_number = ret.get('return_number')
        status = ret.get('status')
        
        print(f"Attempting to delete {status} factory return: {return_number} (ID: {return_id})")
        
        # Try to delete
        delete_response = self.session.delete(
            f"{BASE_URL}/api/distributors/{DISTRIBUTOR_ID}/factory-returns/{return_id}"
        )
        
        print(f"Delete response: {delete_response.status_code} - {delete_response.text}")
        
        # CEO should be able to delete non-draft factory returns
        assert delete_response.status_code == 200, f"CEO should be able to delete {status} factory return: {delete_response.text}"
        
        # Verify it's deleted
        get_response = self.session.get(
            f"{BASE_URL}/api/distributors/{DISTRIBUTOR_ID}/factory-returns/{return_id}"
        )
        assert get_response.status_code == 404, "Factory return should be deleted"
        
        print(f"Successfully deleted {status} factory return: {return_number}")
    
    # ============ CREDIT NOTE DELETE TESTS ============
    
    def test_list_credit_notes(self):
        """Test listing credit notes"""
        response = self.session.get(
            f"{BASE_URL}/api/distributors/{DISTRIBUTOR_ID}/credit-notes"
        )
        assert response.status_code == 200, f"Failed to list credit notes: {response.text}"
        
        data = response.json()
        credit_notes = data.get('credit_notes', [])
        print(f"Found {len(credit_notes)} credit notes")
        
        # Group by status
        by_status = {}
        for cn in credit_notes:
            status = cn.get('status', 'unknown')
            if status not in by_status:
                by_status[status] = []
            by_status[status].append(cn)
        
        for status, items in by_status.items():
            print(f"  - {status}: {len(items)} credit notes")
        
        return credit_notes
    
    def test_ceo_can_delete_credit_note(self):
        """Test that CEO can delete a credit note (new endpoint)"""
        response = self.session.get(
            f"{BASE_URL}/api/distributors/{DISTRIBUTOR_ID}/credit-notes"
        )
        assert response.status_code == 200
        
        credit_notes = response.json().get('credit_notes', [])
        
        # Find a credit note that hasn't been applied (applied_amount == 0)
        unapplied = [cn for cn in credit_notes if cn.get('applied_amount', 0) == 0 and cn.get('status') != 'cancelled']
        
        if not unapplied:
            pytest.skip("No unapplied credit notes available for testing")
        
        cn = unapplied[0]
        cn_id = cn.get('id')
        cn_number = cn.get('credit_note_number')
        status = cn.get('status')
        
        print(f"Attempting to delete credit note: {cn_number} (ID: {cn_id}, status: {status})")
        
        # Try to delete
        delete_response = self.session.delete(
            f"{BASE_URL}/api/distributors/{DISTRIBUTOR_ID}/credit-notes/{cn_id}"
        )
        
        print(f"Delete response: {delete_response.status_code} - {delete_response.text}")
        
        # CEO should be able to delete credit notes
        assert delete_response.status_code == 200, f"CEO should be able to delete credit note: {delete_response.text}"
        
        # Verify it's deleted
        get_response = self.session.get(
            f"{BASE_URL}/api/distributors/{DISTRIBUTOR_ID}/credit-notes/{cn_id}"
        )
        assert get_response.status_code == 404, "Credit note should be deleted"
        
        print(f"Successfully deleted credit note: {cn_number}")
    
    def test_non_ceo_cannot_delete_credit_note(self):
        """Test that non-CEO/Admin users cannot delete credit notes"""
        # This test would require a non-CEO user, skipping for now
        # The endpoint checks for role in ['ceo', 'admin', 'system admin']
        pytest.skip("Requires non-CEO user credentials to test")
    
    # ============ ENDPOINT EXISTENCE TESTS ============
    
    def test_delete_delivery_endpoint_exists(self):
        """Verify DELETE /api/distributors/{id}/deliveries/{delivery_id} endpoint exists"""
        # Use a non-existent ID to test endpoint existence
        response = self.session.delete(
            f"{BASE_URL}/api/distributors/{DISTRIBUTOR_ID}/deliveries/non-existent-id"
        )
        # Should return 404 (not found) not 405 (method not allowed)
        assert response.status_code in [404, 400], f"Endpoint should exist: {response.status_code}"
        print("DELETE delivery endpoint exists")
    
    def test_delete_customer_return_endpoint_exists(self):
        """Verify DELETE /api/distributors/{id}/returns/{return_id} endpoint exists"""
        response = self.session.delete(
            f"{BASE_URL}/api/distributors/{DISTRIBUTOR_ID}/returns/non-existent-id"
        )
        assert response.status_code in [404, 400], f"Endpoint should exist: {response.status_code}"
        print("DELETE customer return endpoint exists")
    
    def test_delete_factory_return_endpoint_exists(self):
        """Verify DELETE /api/distributors/{id}/factory-returns/{return_id} endpoint exists"""
        response = self.session.delete(
            f"{BASE_URL}/api/distributors/{DISTRIBUTOR_ID}/factory-returns/non-existent-id"
        )
        assert response.status_code in [404, 400], f"Endpoint should exist: {response.status_code}"
        print("DELETE factory return endpoint exists")
    
    def test_delete_credit_note_endpoint_exists(self):
        """Verify DELETE /api/distributors/{id}/credit-notes/{credit_note_id} endpoint exists"""
        response = self.session.delete(
            f"{BASE_URL}/api/distributors/{DISTRIBUTOR_ID}/credit-notes/non-existent-id"
        )
        assert response.status_code in [404, 400], f"Endpoint should exist: {response.status_code}"
        print("DELETE credit note endpoint exists")


if __name__ == "__main__":
    pytest.main([__file__, "-v", "-s"])
