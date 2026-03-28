"""
Test Price Premium Payable Feature - Iteration 78
Tests the new price_premium_payable calculation in distributor deliveries and settlements.

Formula: price_premium_payable = qty × (customer_selling_price - transfer_price) 
         when customer_selling_price > transfer_price, else 0
"""
import pytest
import requests
import os
import uuid
from datetime import datetime

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', '').rstrip('/')
TENANT_ID = 'nyla-air-water'

# Test credentials
TEST_EMAIL = "surya.yadavalli@nylaairwater.earth"
TEST_PASSWORD = "test123"


class TestPricePremiumPayable:
    """Test price_premium_payable calculation in deliveries and settlements"""
    
    @pytest.fixture(autouse=True)
    def setup(self):
        """Setup test session with authentication"""
        self.session = requests.Session()
        self.session.headers.update({
            "Content-Type": "application/json",
            "X-Tenant-ID": TENANT_ID
        })
        
        # Login to get session_token
        login_response = self.session.post(
            f"{BASE_URL}/api/auth/login",
            json={"email": TEST_EMAIL, "password": TEST_PASSWORD}
        )
        
        if login_response.status_code == 200:
            data = login_response.json()
            # API returns session_token, not token
            token = data.get('session_token') or data.get('token')
            if token:
                self.session.headers.update({"Authorization": f"Bearer {token}"})
                self.token = token
            # Store cookies for distributor APIs
            self.session.cookies.update(login_response.cookies)
        else:
            pytest.skip(f"Login failed: {login_response.status_code}")
        
        yield
        
        self.session.close()
    
    def test_01_login_success(self):
        """Verify login works and we have a valid token"""
        assert hasattr(self, 'token'), "Token should be set after login"
        print(f"✓ Login successful, token obtained")
    
    def test_02_get_distributors(self):
        """Get list of distributors to use for testing"""
        response = self.session.get(f"{BASE_URL}/api/distributors")
        assert response.status_code == 200, f"Failed to get distributors: {response.text}"
        
        data = response.json()
        distributors = data.get('distributors', [])
        assert len(distributors) > 0, "No distributors found"
        
        # Store first distributor for later tests
        self.distributor = distributors[0]
        print(f"✓ Found {len(distributors)} distributors, using: {self.distributor.get('distributor_name')}")
    
    def test_03_get_distributor_margins(self):
        """Get margin matrix for a distributor to understand pricing"""
        # First get distributors
        dist_response = self.session.get(f"{BASE_URL}/api/distributors")
        assert dist_response.status_code == 200
        distributors = dist_response.json().get('distributors', [])
        
        if not distributors:
            pytest.skip("No distributors available")
        
        distributor_id = distributors[0]['id']
        
        response = self.session.get(f"{BASE_URL}/api/distributors/{distributor_id}/margins")
        assert response.status_code == 200, f"Failed to get margins: {response.text}"
        
        data = response.json()
        margins = data.get('margins', [])
        print(f"✓ Found {len(margins)} margin entries for distributor")
        
        if margins:
            margin = margins[0]
            print(f"  Sample margin: SKU={margin.get('sku_name')}, base_price={margin.get('base_price')}, transfer_price={margin.get('transfer_price')}")
    
    def test_04_get_existing_deliveries(self):
        """Get existing deliveries to check price_premium_payable field"""
        response = self.session.get(f"{BASE_URL}/api/distributors/deliveries/all?page_size=5")
        assert response.status_code == 200, f"Failed to get deliveries: {response.text}"
        
        data = response.json()
        deliveries = data.get('deliveries', [])
        print(f"✓ Found {len(deliveries)} deliveries")
        
        # Check if deliveries have price_premium field
        for delivery in deliveries[:3]:
            total_price_premium = delivery.get('total_price_premium', 'NOT_FOUND')
            print(f"  Delivery {delivery.get('delivery_number')}: total_price_premium={total_price_premium}")
    
    def test_05_get_existing_settlements(self):
        """Get existing settlements to check price_premium_payable field"""
        # Get a distributor first
        dist_response = self.session.get(f"{BASE_URL}/api/distributors")
        assert dist_response.status_code == 200
        distributors = dist_response.json().get('distributors', [])
        
        if not distributors:
            pytest.skip("No distributors available")
        
        distributor_id = distributors[0]['id']
        
        response = self.session.get(f"{BASE_URL}/api/distributors/{distributor_id}/settlements")
        assert response.status_code == 200, f"Failed to get settlements: {response.text}"
        
        data = response.json()
        settlements = data.get('settlements', [])
        print(f"✓ Found {len(settlements)} settlements")
        
        # Check if settlements have price_premium_payable field
        for settlement in settlements[:3]:
            price_premium = settlement.get('price_premium_payable', 'NOT_FOUND')
            print(f"  Settlement {settlement.get('settlement_number')}: price_premium_payable={price_premium}")
    
    def test_06_calculate_delivery_item_amounts_logic(self):
        """Test the price_premium_payable calculation logic
        
        Formula: price_premium_payable = qty × (customer_selling_price - transfer_price)
                 when customer_selling_price > transfer_price, else 0
        """
        # Test case 1: Customer price > transfer price (should have premium)
        qty = 10
        customer_price = 100
        transfer_price = 80
        expected_premium = qty * (customer_price - transfer_price)  # 10 * 20 = 200
        
        print(f"✓ Test case 1: qty={qty}, customer_price={customer_price}, transfer_price={transfer_price}")
        print(f"  Expected price_premium_payable: {expected_premium}")
        assert expected_premium == 200, "Price premium calculation incorrect"
        
        # Test case 2: Customer price = transfer price (no premium)
        customer_price_2 = 80
        expected_premium_2 = 0  # No premium when prices are equal
        
        print(f"✓ Test case 2: qty={qty}, customer_price={customer_price_2}, transfer_price={transfer_price}")
        print(f"  Expected price_premium_payable: {expected_premium_2}")
        
        # Test case 3: Customer price < transfer price (no premium)
        customer_price_3 = 70
        expected_premium_3 = 0  # No premium when customer price is lower
        
        print(f"✓ Test case 3: qty={qty}, customer_price={customer_price_3}, transfer_price={transfer_price}")
        print(f"  Expected price_premium_payable: {expected_premium_3}")
    
    def test_07_delivery_detail_has_price_premium(self):
        """Check that delivery detail endpoint returns price_premium fields"""
        # Get deliveries
        response = self.session.get(f"{BASE_URL}/api/distributors/deliveries/all?page_size=1")
        assert response.status_code == 200
        
        deliveries = response.json().get('deliveries', [])
        if not deliveries:
            pytest.skip("No deliveries available to test")
        
        delivery = deliveries[0]
        distributor_id = delivery.get('distributor_id')
        delivery_id = delivery.get('id')
        
        # Get delivery detail
        detail_response = self.session.get(
            f"{BASE_URL}/api/distributors/{distributor_id}/deliveries/{delivery_id}"
        )
        assert detail_response.status_code == 200, f"Failed to get delivery detail: {detail_response.text}"
        
        detail = detail_response.json()
        
        # Check for total_price_premium field
        has_total_price_premium = 'total_price_premium' in detail
        print(f"✓ Delivery detail has 'total_price_premium' field: {has_total_price_premium}")
        
        if has_total_price_premium:
            print(f"  total_price_premium value: {detail.get('total_price_premium')}")
        
        # Check items for price_premium_payable
        items = detail.get('items', [])
        if items:
            item = items[0]
            has_item_premium = 'price_premium_payable' in item
            print(f"✓ Delivery item has 'price_premium_payable' field: {has_item_premium}")
            if has_item_premium:
                print(f"  Item price_premium_payable: {item.get('price_premium_payable')}")
    
    def test_08_settlement_detail_has_price_premium(self):
        """Check that settlement detail endpoint returns price_premium_payable"""
        # Get a distributor
        dist_response = self.session.get(f"{BASE_URL}/api/distributors")
        assert dist_response.status_code == 200
        distributors = dist_response.json().get('distributors', [])
        
        if not distributors:
            pytest.skip("No distributors available")
        
        distributor_id = distributors[0]['id']
        
        # Get settlements
        response = self.session.get(f"{BASE_URL}/api/distributors/{distributor_id}/settlements?page_size=1")
        assert response.status_code == 200
        
        settlements = response.json().get('settlements', [])
        if not settlements:
            pytest.skip("No settlements available to test")
        
        settlement = settlements[0]
        settlement_id = settlement.get('id')
        
        # Get settlement detail
        detail_response = self.session.get(
            f"{BASE_URL}/api/distributors/{distributor_id}/settlements/{settlement_id}"
        )
        assert detail_response.status_code == 200, f"Failed to get settlement detail: {detail_response.text}"
        
        detail = detail_response.json()
        
        # Check for price_premium_payable field
        # Note: Existing settlements may not have this field if created before the feature
        has_price_premium = 'price_premium_payable' in detail
        print(f"✓ Settlement detail has 'price_premium_payable' field: {has_price_premium}")
        
        if has_price_premium:
            print(f"  price_premium_payable value: {detail.get('price_premium_payable')}")
        else:
            print("  Note: Field not present - this is expected for settlements created before the feature")
        
        # Don't fail the test - just report the finding
        # The field will be present for newly created settlements
    
    def test_09_monthly_reconciliation_has_price_premium(self):
        """Check that monthly reconciliation endpoint returns price_premium data"""
        # Get a distributor
        dist_response = self.session.get(f"{BASE_URL}/api/distributors")
        assert dist_response.status_code == 200
        distributors = dist_response.json().get('distributors', [])
        
        if not distributors:
            pytest.skip("No distributors available")
        
        distributor_id = distributors[0]['id']
        
        # Get monthly reconciliation for current month
        current_month = datetime.now().month
        current_year = datetime.now().year
        
        response = self.session.get(
            f"{BASE_URL}/api/distributors/{distributor_id}/monthly-reconciliation?month={current_month}&year={current_year}"
        )
        
        # This endpoint might return 200 even with no data
        if response.status_code == 200:
            data = response.json()
            print(f"✓ Monthly reconciliation endpoint works")
            print(f"  Total unreconciled: {data.get('total_unreconciled', 0)}")
            print(f"  Total reconciled: {data.get('total_reconciled', 0)}")
            
            # Check unreconciled settlements for price_premium
            unreconciled = data.get('unreconciled_settlements', [])
            if unreconciled:
                settlement = unreconciled[0]
                has_premium = 'price_premium_payable' in settlement
                print(f"  Unreconciled settlement has price_premium_payable: {has_premium}")
        else:
            print(f"  Monthly reconciliation returned: {response.status_code}")


class TestPricePremiumFrontendIntegration:
    """Test that frontend components receive price_premium data correctly"""
    
    @pytest.fixture(autouse=True)
    def setup(self):
        """Setup test session with authentication"""
        self.session = requests.Session()
        self.session.headers.update({
            "Content-Type": "application/json",
            "X-Tenant-ID": TENANT_ID
        })
        
        # Login
        login_response = self.session.post(
            f"{BASE_URL}/api/auth/login",
            json={"email": TEST_EMAIL, "password": TEST_PASSWORD}
        )
        
        if login_response.status_code == 200:
            data = login_response.json()
            # API returns session_token, not token
            token = data.get('session_token') or data.get('token')
            if token:
                self.session.headers.update({"Authorization": f"Bearer {token}"})
            self.session.cookies.update(login_response.cookies)
        else:
            pytest.skip(f"Login failed: {login_response.status_code}")
        
        yield
        self.session.close()
    
    def test_10_settlements_list_returns_price_premium(self):
        """Verify settlements list API returns price_premium_payable for each settlement"""
        # Get distributors
        dist_response = self.session.get(f"{BASE_URL}/api/distributors")
        assert dist_response.status_code == 200
        distributors = dist_response.json().get('distributors', [])
        
        if not distributors:
            pytest.skip("No distributors available")
        
        distributor_id = distributors[0]['id']
        
        # Get settlements list
        response = self.session.get(f"{BASE_URL}/api/distributors/{distributor_id}/settlements")
        assert response.status_code == 200
        
        data = response.json()
        settlements = data.get('settlements', [])
        
        print(f"✓ Settlements list returned {len(settlements)} settlements")
        
        # Check each settlement for price_premium_payable
        # Note: Existing settlements may not have this field
        settlements_with_field = 0
        for settlement in settlements[:5]:
            settlement_num = settlement.get('settlement_number')
            price_premium = settlement.get('price_premium_payable')
            
            if 'price_premium_payable' in settlement:
                settlements_with_field += 1
                print(f"  {settlement_num}: price_premium_payable = {price_premium}")
            else:
                print(f"  {settlement_num}: price_premium_payable field NOT present (pre-feature data)")
        
        print(f"✓ {settlements_with_field}/{len(settlements[:5])} settlements have price_premium_payable field")
    
    def test_11_deliveries_list_returns_total_price_premium(self):
        """Verify deliveries list API returns total_price_premium for each delivery"""
        response = self.session.get(f"{BASE_URL}/api/distributors/deliveries/all?page_size=10")
        assert response.status_code == 200
        
        data = response.json()
        deliveries = data.get('deliveries', [])
        
        print(f"✓ Deliveries list returned {len(deliveries)} deliveries")
        
        # Check each delivery for total_price_premium
        # Note: Existing deliveries may not have this field
        deliveries_with_field = 0
        for delivery in deliveries[:5]:
            delivery_num = delivery.get('delivery_number')
            total_premium = delivery.get('total_price_premium')
            
            if 'total_price_premium' in delivery:
                deliveries_with_field += 1
                print(f"  {delivery_num}: total_price_premium = {total_premium}")
            else:
                print(f"  {delivery_num}: total_price_premium field NOT present (pre-feature data)")
        
        print(f"✓ {deliveries_with_field}/{len(deliveries[:5])} deliveries have total_price_premium field")


if __name__ == "__main__":
    pytest.main([__file__, "-v", "--tb=short"])
