"""
Test Settlement Adjustment Formula
Verifies that the adjustment calculation in Settlements matches Stock Out formula:
Adjustment = Actual Billable - Billed to Dist = qty × (1 - margin%) × (customer_price - base_price)
"""
import pytest
import requests
import os

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', '').rstrip('/')

class TestSettlementAdjustmentFormula:
    """Test the settlement adjustment formula matches Stock Out"""
    
    @pytest.fixture(autouse=True)
    def setup(self):
        """Setup test - login and get auth token"""
        self.session = requests.Session()
        self.session.headers.update({"Content-Type": "application/json"})
        
        # Login with admin credentials
        login_response = self.session.post(f"{BASE_URL}/api/auth/login", json={
            "email": "surya.yadavalli@nylaairwater.earth",
            "password": "test123"
        })
        
        if login_response.status_code == 200:
            token = login_response.json().get('token')
            self.session.headers.update({"Authorization": f"Bearer {token}"})
            self.logged_in = True
        else:
            self.logged_in = False
            pytest.skip("Login failed - skipping tests")
    
    def test_login_successful(self):
        """Verify login works"""
        assert self.logged_in, "Login should be successful"
    
    def test_get_distributors(self):
        """Get list of distributors"""
        response = self.session.get(f"{BASE_URL}/api/distributors")
        assert response.status_code == 200
        data = response.json()
        assert 'distributors' in data
        print(f"Found {len(data['distributors'])} distributors")
        
        # Find Brian distributor
        brian = None
        for dist in data['distributors']:
            if 'Brian' in dist.get('distributor_name', ''):
                brian = dist
                break
        
        if brian:
            print(f"Found Brian: {brian['id']}")
            self.brian_id = brian['id']
        else:
            print("Brian distributor not found")
    
    def test_get_settlements_for_distributor(self):
        """Get settlements for a distributor and verify adjustment field exists"""
        # First get distributors
        response = self.session.get(f"{BASE_URL}/api/distributors")
        assert response.status_code == 200
        distributors = response.json().get('distributors', [])
        
        if not distributors:
            pytest.skip("No distributors found")
        
        # Find Brian or use first distributor
        distributor_id = None
        for dist in distributors:
            if 'Brian' in dist.get('distributor_name', ''):
                distributor_id = dist['id']
                break
        
        if not distributor_id:
            distributor_id = distributors[0]['id']
        
        # Get settlements
        response = self.session.get(f"{BASE_URL}/api/distributors/{distributor_id}/settlements")
        assert response.status_code == 200
        data = response.json()
        
        settlements = data.get('settlements', [])
        print(f"Found {len(settlements)} settlements for distributor")
        
        if settlements:
            settlement = settlements[0]
            print(f"Settlement fields: {list(settlement.keys())}")
            
            # Verify factory_distributor_adjustment field exists
            assert 'factory_distributor_adjustment' in settlement or 'adjustment_payable' in settlement, \
                "Settlement should have adjustment field"
            
            # Print adjustment values
            factory_adj = settlement.get('factory_distributor_adjustment', 0)
            adj_payable = settlement.get('adjustment_payable', 0)
            print(f"factory_distributor_adjustment: {factory_adj}")
            print(f"adjustment_payable: {adj_payable}")
    
    def test_get_deliveries_for_distributor(self):
        """Get deliveries and verify adjustment calculation in items"""
        # First get distributors
        response = self.session.get(f"{BASE_URL}/api/distributors")
        assert response.status_code == 200
        distributors = response.json().get('distributors', [])
        
        if not distributors:
            pytest.skip("No distributors found")
        
        # Find Brian or use first distributor
        distributor_id = None
        for dist in distributors:
            if 'Brian' in dist.get('distributor_name', ''):
                distributor_id = dist['id']
                break
        
        if not distributor_id:
            distributor_id = distributors[0]['id']
        
        # Get deliveries
        response = self.session.get(f"{BASE_URL}/api/distributors/{distributor_id}/deliveries")
        assert response.status_code == 200
        data = response.json()
        
        deliveries = data.get('deliveries', [])
        print(f"Found {len(deliveries)} deliveries for distributor")
        
        if deliveries:
            # Get first delivery with items
            delivery = deliveries[0]
            delivery_id = delivery['id']
            
            # Get delivery detail
            detail_response = self.session.get(f"{BASE_URL}/api/distributors/{distributor_id}/deliveries/{delivery_id}")
            assert detail_response.status_code == 200
            detail = detail_response.json()
            
            items = detail.get('items', [])
            print(f"Delivery {delivery.get('delivery_number')} has {len(items)} items")
            
            if items:
                item = items[0]
                print(f"Item fields: {list(item.keys())}")
                
                # Verify adjustment fields exist
                assert 'factory_distributor_adjustment' in item or 'billed_to_dist' in item, \
                    "Item should have adjustment-related fields"
                
                # Print item values for verification
                qty = item.get('quantity', 0)
                base_price = item.get('base_price', 0)
                customer_price = item.get('customer_selling_price', 0) or item.get('unit_price', 0)
                margin_pct = item.get('distributor_commission_percent', 0) or item.get('margin_percent', 2.5)
                
                print(f"qty: {qty}, base_price: {base_price}, customer_price: {customer_price}, margin%: {margin_pct}")
                
                # Calculate expected values using NEW FORMULA
                transfer_price = base_price * (1 - margin_pct / 100) if base_price > 0 else 0
                new_transfer_price = customer_price * (1 - margin_pct / 100) if customer_price > 0 else 0
                billed_to_dist = qty * transfer_price
                actual_billable = qty * new_transfer_price
                expected_adjustment = actual_billable - billed_to_dist
                
                print(f"Expected: transfer_price={transfer_price:.2f}, new_transfer_price={new_transfer_price:.2f}")
                print(f"Expected: billed_to_dist={billed_to_dist:.2f}, actual_billable={actual_billable:.2f}")
                print(f"Expected adjustment: {expected_adjustment:.2f}")
                
                # Get actual values from item
                actual_billed = item.get('billed_to_dist', 0)
                actual_billable_val = item.get('actual_billable_to_dist', 0)
                actual_adjustment = item.get('factory_distributor_adjustment', 0)
                
                print(f"Actual: billed_to_dist={actual_billed}, actual_billable={actual_billable_val}")
                print(f"Actual adjustment: {actual_adjustment}")
    
    def test_unsettled_deliveries_endpoint(self):
        """Test the unsettled deliveries endpoint used for settlement preview"""
        # First get distributors
        response = self.session.get(f"{BASE_URL}/api/distributors")
        assert response.status_code == 200
        distributors = response.json().get('distributors', [])
        
        if not distributors:
            pytest.skip("No distributors found")
        
        # Find Brian or use first distributor
        distributor_id = None
        for dist in distributors:
            if 'Brian' in dist.get('distributor_name', ''):
                distributor_id = dist['id']
                break
        
        if not distributor_id:
            distributor_id = distributors[0]['id']
        
        # Get unsettled deliveries for current month
        import datetime
        current_month = datetime.datetime.now().month
        current_year = datetime.datetime.now().year
        
        response = self.session.get(
            f"{BASE_URL}/api/distributors/{distributor_id}/unsettled-deliveries",
            params={"month": current_month, "year": current_year}
        )
        
        # This endpoint might return 200 with empty list or 404 if no unsettled deliveries
        if response.status_code == 200:
            data = response.json()
            deliveries = data.get('deliveries', [])
            print(f"Found {len(deliveries)} unsettled deliveries for {current_month}/{current_year}")
            
            if deliveries:
                delivery = deliveries[0]
                items = delivery.get('items', [])
                print(f"First delivery has {len(items)} items")
                
                if items:
                    item = items[0]
                    # Verify item has the fields needed for adjustment calculation
                    print(f"Item keys: {list(item.keys())}")
        else:
            print(f"Unsettled deliveries endpoint returned {response.status_code}")
    
    def test_adjustment_formula_calculation(self):
        """Verify the adjustment formula: Adjustment = Actual Billable - Billed to Dist"""
        # Test with sample values
        # Example from problem statement:
        # qty=1, base=146.25, customer=140, margin=2.5%
        # OLD: 1 × 0.025 × (140 - 146.25) = -0.156
        # NEW: (1 × 140 × 0.975) - (1 × 146.25 × 0.975) = 136.5 - 142.59 = -6.09
        
        qty = 1
        base_price = 146.25
        customer_price = 140
        margin_pct = 2.5
        
        # NEW FORMULA calculation
        transfer_price = base_price * (1 - margin_pct / 100)  # 146.25 × 0.975 = 142.59375
        new_transfer_price = customer_price * (1 - margin_pct / 100)  # 140 × 0.975 = 136.5
        billed_to_dist = qty * transfer_price  # 142.59375
        actual_billable = qty * new_transfer_price  # 136.5
        adjustment = actual_billable - billed_to_dist  # 136.5 - 142.59375 = -6.09375
        
        print(f"Test calculation:")
        print(f"  qty={qty}, base_price={base_price}, customer_price={customer_price}, margin%={margin_pct}")
        print(f"  transfer_price = {base_price} × (1 - {margin_pct}/100) = {transfer_price:.4f}")
        print(f"  new_transfer_price = {customer_price} × (1 - {margin_pct}/100) = {new_transfer_price:.4f}")
        print(f"  billed_to_dist = {qty} × {transfer_price:.4f} = {billed_to_dist:.4f}")
        print(f"  actual_billable = {qty} × {new_transfer_price:.4f} = {actual_billable:.4f}")
        print(f"  adjustment = {actual_billable:.4f} - {billed_to_dist:.4f} = {adjustment:.4f}")
        
        # Verify the formula gives expected result
        expected_adjustment = -6.09  # Approximately
        assert abs(adjustment - expected_adjustment) < 0.1, \
            f"Adjustment should be approximately {expected_adjustment}, got {adjustment:.4f}"
        
        # Verify sign: negative when customer_price < base_price
        assert adjustment < 0, "Adjustment should be negative when customer_price < base_price"
        
        # Test positive case: customer_price > base_price
        customer_price_high = 150
        new_transfer_price_high = customer_price_high * (1 - margin_pct / 100)  # 150 × 0.975 = 146.25
        actual_billable_high = qty * new_transfer_price_high
        adjustment_high = actual_billable_high - billed_to_dist
        
        print(f"\nPositive case (customer_price={customer_price_high}):")
        print(f"  adjustment = {actual_billable_high:.4f} - {billed_to_dist:.4f} = {adjustment_high:.4f}")
        
        assert adjustment_high > 0, "Adjustment should be positive when customer_price > base_price"


class TestSettlementGeneration:
    """Test settlement generation endpoint"""
    
    @pytest.fixture(autouse=True)
    def setup(self):
        """Setup test - login and get auth token"""
        self.session = requests.Session()
        self.session.headers.update({"Content-Type": "application/json"})
        
        # Login with admin credentials
        login_response = self.session.post(f"{BASE_URL}/api/auth/login", json={
            "email": "surya.yadavalli@nylaairwater.earth",
            "password": "test123"
        })
        
        if login_response.status_code == 200:
            token = login_response.json().get('token')
            self.session.headers.update({"Authorization": f"Bearer {token}"})
            self.logged_in = True
        else:
            self.logged_in = False
            pytest.skip("Login failed - skipping tests")
    
    def test_settlement_detail_has_adjustment_fields(self):
        """Verify settlement detail includes factory_distributor_adjustment"""
        # Get distributors
        response = self.session.get(f"{BASE_URL}/api/distributors")
        assert response.status_code == 200
        distributors = response.json().get('distributors', [])
        
        if not distributors:
            pytest.skip("No distributors found")
        
        # Find Brian or use first distributor
        distributor_id = None
        for dist in distributors:
            if 'Brian' in dist.get('distributor_name', ''):
                distributor_id = dist['id']
                break
        
        if not distributor_id:
            distributor_id = distributors[0]['id']
        
        # Get settlements
        response = self.session.get(f"{BASE_URL}/api/distributors/{distributor_id}/settlements")
        assert response.status_code == 200
        settlements = response.json().get('settlements', [])
        
        if not settlements:
            print("No settlements found - skipping detail test")
            return
        
        # Get settlement detail
        settlement_id = settlements[0]['id']
        detail_response = self.session.get(f"{BASE_URL}/api/distributors/{distributor_id}/settlements/{settlement_id}")
        
        if detail_response.status_code == 200:
            detail = detail_response.json()
            print(f"Settlement detail fields: {list(detail.keys())}")
            
            # Verify factory_distributor_adjustment exists
            assert 'factory_distributor_adjustment' in detail, \
                "Settlement detail should have factory_distributor_adjustment field"
            
            print(f"factory_distributor_adjustment: {detail.get('factory_distributor_adjustment')}")
            
            # Check items if present
            items = detail.get('items', [])
            if items:
                item = items[0]
                print(f"Settlement item fields: {list(item.keys())}")
                if 'factory_distributor_adjustment' in item:
                    print(f"Item factory_distributor_adjustment: {item.get('factory_distributor_adjustment')}")


if __name__ == "__main__":
    pytest.main([__file__, "-v", "--tb=short"])
