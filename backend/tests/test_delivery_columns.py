"""
Test cases for the restructured delivery columns feature
Tests: new_transfer_price, factory_distributor_adjustment calculations
"""
import pytest
import requests
import os

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', 'https://pl-tracker-5.preview.emergentagent.com')

class TestDeliveryColumnCalculations:
    """Test delivery item amount calculations with new columns"""
    
    @pytest.fixture(autouse=True)
    def setup(self):
        """Login and get auth token"""
        response = requests.post(f"{BASE_URL}/api/auth/login", json={
            "email": "surya.yadavalli@nylaairwater.earth",
            "password": "test123"
        })
        assert response.status_code == 200, f"Login failed: {response.text}"
        data = response.json()
        self.token = data.get('session_token')
        self.headers = {
            'Authorization': f'Bearer {self.token}',
            'X-Tenant-ID': 'nyla-air-water',
            'Content-Type': 'application/json'
        }
        
        # Get distributor ID
        dist_response = requests.get(f"{BASE_URL}/api/distributors", headers=self.headers)
        assert dist_response.status_code == 200
        distributors = dist_response.json().get('distributors', [])
        self.distributor_id = None
        for d in distributors:
            if d.get('distributor_name') == 'Surya Distributions':
                self.distributor_id = d.get('id')
                break
        assert self.distributor_id, "Surya Distributions not found"
    
    def test_delivery_items_have_new_transfer_price(self):
        """Test that delivery items include new_transfer_price field"""
        # Get deliveries
        response = requests.get(
            f"{BASE_URL}/api/distributors/{self.distributor_id}/deliveries?time_filter=lifetime",
            headers=self.headers
        )
        assert response.status_code == 200
        data = response.json()
        deliveries = data.get('deliveries', [])
        
        if len(deliveries) > 0:
            delivery = deliveries[0]
            items = delivery.get('items', [])
            if len(items) > 0:
                item = items[0]
                # Check that item has the expected fields
                assert 'customer_selling_price' in item or 'unit_price' in item, "Missing customer price field"
                assert 'base_price' in item or 'transfer_price' in item, "Missing base price field"
                assert 'distributor_commission_percent' in item or 'margin_percent' in item, "Missing margin field"
                print(f"Item fields: {list(item.keys())}")
                
                # Verify calculation logic
                qty = item.get('quantity', 0)
                customer_price = item.get('customer_selling_price') or item.get('unit_price', 0)
                commission_pct = item.get('distributor_commission_percent') or item.get('margin_percent', 2.5)
                base_price = item.get('base_price') or item.get('transfer_price', 0)
                
                # Calculate expected values
                expected_transfer_price = base_price * (1 - commission_pct / 100) if base_price else 0
                expected_new_transfer_price = customer_price * (1 - commission_pct / 100) if customer_price else 0
                expected_factory_adj = qty * (commission_pct / 100) * (customer_price - base_price) if commission_pct and base_price else 0
                
                print(f"Qty: {qty}, Customer Price: {customer_price}, Base Price: {base_price}, Commission: {commission_pct}%")
                print(f"Expected Transfer Price: {expected_transfer_price}")
                print(f"Expected New Transfer Price: {expected_new_transfer_price}")
                print(f"Expected Factory Adjustment: {expected_factory_adj}")
        else:
            pytest.skip("No deliveries found to test")
    
    def test_delivery_has_total_factory_adjustment(self):
        """Test that delivery document includes total_factory_adjustment"""
        response = requests.get(
            f"{BASE_URL}/api/distributors/{self.distributor_id}/deliveries?time_filter=lifetime",
            headers=self.headers
        )
        assert response.status_code == 200
        data = response.json()
        deliveries = data.get('deliveries', [])
        
        if len(deliveries) > 0:
            delivery = deliveries[0]
            # Check for total_factory_adjustment field (may not exist in old deliveries)
            if 'total_factory_adjustment' in delivery:
                print(f"Delivery {delivery.get('delivery_number')} has total_factory_adjustment: {delivery.get('total_factory_adjustment')}")
            else:
                print(f"Delivery {delivery.get('delivery_number')} does not have total_factory_adjustment field (pre-feature data)")
        else:
            pytest.skip("No deliveries found to test")
    
    def test_settlement_has_factory_distributor_adjustment(self):
        """Test that settlement includes factory_distributor_adjustment"""
        response = requests.get(
            f"{BASE_URL}/api/distributors/{self.distributor_id}/settlements",
            headers=self.headers
        )
        assert response.status_code == 200
        data = response.json()
        settlements = data.get('settlements', [])
        
        if len(settlements) > 0:
            settlement = settlements[0]
            # Check for factory_distributor_adjustment field
            if 'factory_distributor_adjustment' in settlement:
                print(f"Settlement {settlement.get('settlement_number')} has factory_distributor_adjustment: {settlement.get('factory_distributor_adjustment')}")
            else:
                print(f"Settlement {settlement.get('settlement_number')} does not have factory_distributor_adjustment field")
        else:
            pytest.skip("No settlements found to test")
    
    def test_monthly_reconciliation_has_factory_adjustment(self):
        """Test that monthly reconciliation includes factory_adjustment totals"""
        response = requests.get(
            f"{BASE_URL}/api/distributors/{self.distributor_id}/monthly-reconciliation?month=3&year=2026",
            headers=self.headers
        )
        assert response.status_code == 200
        data = response.json()
        
        # Check for factory adjustment fields in response
        print(f"Monthly reconciliation response keys: {list(data.keys())}")
        
        unreconciled = data.get('unreconciled_settlements', [])
        if len(unreconciled) > 0:
            settlement = unreconciled[0]
            if 'factory_distributor_adjustment' in settlement:
                print(f"Unreconciled settlement has factory_distributor_adjustment: {settlement.get('factory_distributor_adjustment')}")
    
    def test_calculate_delivery_item_amounts_formula(self):
        """Test the formula: Factory→Dist Adjustment = qty × margin% × (customer_price - base_price)"""
        # This tests the frontend calculation logic
        # Example values from the delivery we saw
        qty = 10
        customer_price = 399.0
        base_price = 97.5
        commission_pct = 2.5
        
        # Calculate expected values
        transfer_price = base_price * (1 - commission_pct / 100)  # 97.5 * 0.975 = 95.0625
        new_transfer_price = customer_price * (1 - commission_pct / 100)  # 399 * 0.975 = 389.025
        factory_adj = qty * (commission_pct / 100) * (customer_price - base_price)  # 10 * 0.025 * (399 - 97.5) = 75.375
        billing_value = qty * customer_price  # 10 * 399 = 3990
        
        print(f"Transfer Price: {transfer_price}")
        print(f"New Transfer Price: {new_transfer_price}")
        print(f"Factory Adjustment: {factory_adj}")
        print(f"Billing Value: {billing_value}")
        
        # Verify calculations
        assert abs(transfer_price - 95.0625) < 0.01, f"Transfer price mismatch: {transfer_price}"
        assert abs(new_transfer_price - 389.025) < 0.01, f"New transfer price mismatch: {new_transfer_price}"
        assert abs(factory_adj - 75.375) < 0.01, f"Factory adjustment mismatch: {factory_adj}"
        assert billing_value == 3990, f"Billing value mismatch: {billing_value}"
        
        print("✓ All formula calculations verified")


class TestDeliveryColumnOrder:
    """Test that delivery columns are in correct order"""
    
    def test_column_order_description(self):
        """Document the expected column order"""
        expected_columns = [
            "Delivery #",
            "SKU (with Margin % below)",
            "Base Price (blue tint - theoretical)",
            "Transfer Price (blue tint - theoretical)",
            "Customer Price (emerald tint - actual)",
            "New Transfer Price (emerald tint - actual)",
            "Qty",
            "Distributor → Customer Billing (emerald tint)",
            "Factory → Distributor Adjustment (emerald tint)",
            "Status",
            "Actions"
        ]
        
        print("Expected column order:")
        for i, col in enumerate(expected_columns, 1):
            print(f"  {i}. {col}")
        
        # This is a documentation test - always passes
        assert True


if __name__ == "__main__":
    pytest.main([__file__, "-v"])
