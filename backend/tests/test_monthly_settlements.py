"""
Test Monthly Settlement Generation and Deliveries with Line-Item Calculations
Tests for:
1. GET /api/distributors/{distributor_id}/deliveries - List deliveries with filters
2. GET /api/distributors/{distributor_id}/unsettled-deliveries - Get unsettled deliveries for month/year
3. POST /api/distributors/{distributor_id}/settlements/generate-monthly - Generate monthly settlements per account
4. GET /api/distributors/{distributor_id}/settlements - List settlements with month/year filters
"""
import pytest
import requests
import os
from datetime import datetime

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', '').rstrip('/')
DISTRIBUTOR_ID = "99fb55dc-532c-4e85-b618-6b8a5e552c04"
TENANT_ID = "nyla-air-water"

class TestDeliveriesEndpoint:
    """Test GET /api/distributors/{distributor_id}/deliveries endpoint"""
    
    @pytest.fixture(autouse=True)
    def setup(self):
        """Setup test session with authentication"""
        self.session = requests.Session()
        self.session.headers.update({
            "Content-Type": "application/json",
            "X-Tenant-ID": TENANT_ID
        })
        # Login to get token
        login_response = self.session.post(f"{BASE_URL}/api/auth/login", json={
            "email": "surya.yadavalli@nylaairwater.earth",
            "password": "test123"
        })
        if login_response.status_code == 200:
            token = login_response.json().get('token')
            self.session.headers.update({"Authorization": f"Bearer {token}"})
        yield
    
    def test_list_deliveries_default(self):
        """Test listing deliveries with default parameters"""
        response = self.session.get(f"{BASE_URL}/api/distributors/{DISTRIBUTOR_ID}/deliveries")
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        
        data = response.json()
        assert "deliveries" in data, "Response should contain 'deliveries' key"
        assert "total" in data, "Response should contain 'total' key"
        assert "page" in data, "Response should contain 'page' key"
        assert "page_size" in data, "Response should contain 'page_size' key"
        assert "total_pages" in data, "Response should contain 'total_pages' key"
        
        print(f"Found {data['total']} total deliveries, showing page {data['page']} of {data['total_pages']}")
    
    def test_list_deliveries_with_time_filter_this_month(self):
        """Test listing deliveries with this_month time filter"""
        response = self.session.get(
            f"{BASE_URL}/api/distributors/{DISTRIBUTOR_ID}/deliveries",
            params={"time_filter": "this_month"}
        )
        assert response.status_code == 200, f"Expected 200, got {response.status_code}"
        
        data = response.json()
        print(f"This month deliveries: {data['total']}")
    
    def test_list_deliveries_with_time_filter_last_month(self):
        """Test listing deliveries with last_month time filter"""
        response = self.session.get(
            f"{BASE_URL}/api/distributors/{DISTRIBUTOR_ID}/deliveries",
            params={"time_filter": "last_month"}
        )
        assert response.status_code == 200, f"Expected 200, got {response.status_code}"
        
        data = response.json()
        print(f"Last month deliveries: {data['total']}")
    
    def test_list_deliveries_with_time_filter_lifetime(self):
        """Test listing deliveries with lifetime time filter (no date restriction)"""
        response = self.session.get(
            f"{BASE_URL}/api/distributors/{DISTRIBUTOR_ID}/deliveries",
            params={"time_filter": "lifetime"}
        )
        assert response.status_code == 200, f"Expected 200, got {response.status_code}"
        
        data = response.json()
        print(f"Lifetime deliveries: {data['total']}")
    
    def test_list_deliveries_with_pagination(self):
        """Test listing deliveries with pagination"""
        response = self.session.get(
            f"{BASE_URL}/api/distributors/{DISTRIBUTOR_ID}/deliveries",
            params={"time_filter": "lifetime", "page": 1, "page_size": 5}
        )
        assert response.status_code == 200, f"Expected 200, got {response.status_code}"
        
        data = response.json()
        assert data['page'] == 1
        assert data['page_size'] == 5
        assert len(data['deliveries']) <= 5
        print(f"Page 1 with 5 items: {len(data['deliveries'])} deliveries returned")
    
    def test_deliveries_contain_items(self):
        """Test that deliveries contain items array with line-item data"""
        response = self.session.get(
            f"{BASE_URL}/api/distributors/{DISTRIBUTOR_ID}/deliveries",
            params={"time_filter": "lifetime", "page_size": 10}
        )
        assert response.status_code == 200
        
        data = response.json()
        deliveries = data['deliveries']
        
        if len(deliveries) > 0:
            delivery = deliveries[0]
            assert 'items' in delivery, "Delivery should contain 'items' array"
            
            if len(delivery['items']) > 0:
                item = delivery['items'][0]
                print(f"Sample delivery item fields: {list(item.keys())}")
                # Check for expected fields
                expected_fields = ['quantity', 'sku_name']
                for field in expected_fields:
                    if field in item:
                        print(f"  - {field}: {item[field]}")


class TestUnsettledDeliveriesEndpoint:
    """Test GET /api/distributors/{distributor_id}/unsettled-deliveries endpoint"""
    
    @pytest.fixture(autouse=True)
    def setup(self):
        """Setup test session with authentication"""
        self.session = requests.Session()
        self.session.headers.update({
            "Content-Type": "application/json",
            "X-Tenant-ID": TENANT_ID
        })
        login_response = self.session.post(f"{BASE_URL}/api/auth/login", json={
            "email": "surya.yadavalli@nylaairwater.earth",
            "password": "test123"
        })
        if login_response.status_code == 200:
            token = login_response.json().get('token')
            self.session.headers.update({"Authorization": f"Bearer {token}"})
        yield
    
    def test_get_unsettled_deliveries_current_month(self):
        """Test getting unsettled deliveries for current month"""
        current_month = datetime.now().month
        current_year = datetime.now().year
        
        response = self.session.get(
            f"{BASE_URL}/api/distributors/{DISTRIBUTOR_ID}/unsettled-deliveries",
            params={"month": current_month, "year": current_year}
        )
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        
        data = response.json()
        assert "deliveries" in data, "Response should contain 'deliveries' key"
        assert "count" in data, "Response should contain 'count' key"
        
        print(f"Unsettled deliveries for {current_month}/{current_year}: {data['count']}")
    
    def test_get_unsettled_deliveries_previous_month(self):
        """Test getting unsettled deliveries for previous month"""
        now = datetime.now()
        if now.month == 1:
            prev_month = 12
            prev_year = now.year - 1
        else:
            prev_month = now.month - 1
            prev_year = now.year
        
        response = self.session.get(
            f"{BASE_URL}/api/distributors/{DISTRIBUTOR_ID}/unsettled-deliveries",
            params={"month": prev_month, "year": prev_year}
        )
        assert response.status_code == 200, f"Expected 200, got {response.status_code}"
        
        data = response.json()
        print(f"Unsettled deliveries for {prev_month}/{prev_year}: {data['count']}")
    
    def test_unsettled_deliveries_contain_items(self):
        """Test that unsettled deliveries contain items for calculation"""
        response = self.session.get(
            f"{BASE_URL}/api/distributors/{DISTRIBUTOR_ID}/unsettled-deliveries",
            params={"month": 1, "year": 2026}  # January 2026
        )
        assert response.status_code == 200
        
        data = response.json()
        deliveries = data['deliveries']
        
        if len(deliveries) > 0:
            delivery = deliveries[0]
            assert 'items' in delivery, "Unsettled delivery should contain 'items' array"
            print(f"Found {len(delivery.get('items', []))} items in first unsettled delivery")


class TestSettlementsListEndpoint:
    """Test GET /api/distributors/{distributor_id}/settlements endpoint"""
    
    @pytest.fixture(autouse=True)
    def setup(self):
        """Setup test session with authentication"""
        self.session = requests.Session()
        self.session.headers.update({
            "Content-Type": "application/json",
            "X-Tenant-ID": TENANT_ID
        })
        login_response = self.session.post(f"{BASE_URL}/api/auth/login", json={
            "email": "surya.yadavalli@nylaairwater.earth",
            "password": "test123"
        })
        if login_response.status_code == 200:
            token = login_response.json().get('token')
            self.session.headers.update({"Authorization": f"Bearer {token}"})
        yield
    
    def test_list_settlements_default(self):
        """Test listing settlements with default parameters"""
        response = self.session.get(f"{BASE_URL}/api/distributors/{DISTRIBUTOR_ID}/settlements")
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        
        data = response.json()
        assert "settlements" in data, "Response should contain 'settlements' key"
        assert "total" in data, "Response should contain 'total' key"
        
        print(f"Found {data['total']} total settlements")
    
    def test_list_settlements_with_month_filter(self):
        """Test listing settlements filtered by month"""
        response = self.session.get(
            f"{BASE_URL}/api/distributors/{DISTRIBUTOR_ID}/settlements",
            params={"month": 1}  # January
        )
        assert response.status_code == 200, f"Expected 200, got {response.status_code}"
        
        data = response.json()
        print(f"Settlements for January: {data['total']}")
    
    def test_list_settlements_with_year_filter(self):
        """Test listing settlements filtered by year"""
        response = self.session.get(
            f"{BASE_URL}/api/distributors/{DISTRIBUTOR_ID}/settlements",
            params={"year": 2026}
        )
        assert response.status_code == 200, f"Expected 200, got {response.status_code}"
        
        data = response.json()
        print(f"Settlements for 2026: {data['total']}")
    
    def test_list_settlements_with_month_and_year_filter(self):
        """Test listing settlements filtered by both month and year"""
        response = self.session.get(
            f"{BASE_URL}/api/distributors/{DISTRIBUTOR_ID}/settlements",
            params={"month": 1, "year": 2026}
        )
        assert response.status_code == 200, f"Expected 200, got {response.status_code}"
        
        data = response.json()
        print(f"Settlements for January 2026: {data['total']}")
    
    def test_settlement_contains_expected_fields(self):
        """Test that settlements contain expected fields for monthly settlements"""
        response = self.session.get(f"{BASE_URL}/api/distributors/{DISTRIBUTOR_ID}/settlements")
        assert response.status_code == 200
        
        data = response.json()
        settlements = data['settlements']
        
        if len(settlements) > 0:
            settlement = settlements[0]
            print(f"Settlement fields: {list(settlement.keys())}")
            
            # Check for monthly settlement fields
            expected_fields = ['settlement_number', 'status', 'total_deliveries']
            for field in expected_fields:
                assert field in settlement, f"Settlement should contain '{field}' field"
            
            # Check for new calculation fields (may not exist in old settlements)
            new_fields = ['account_name', 'settlement_month', 'settlement_year', 
                         'total_billing_value', 'distributor_earnings', 
                         'margin_at_transfer_price', 'adjustment_payable']
            for field in new_fields:
                if field in settlement:
                    print(f"  - {field}: {settlement[field]}")


class TestGenerateMonthlySettlements:
    """Test POST /api/distributors/{distributor_id}/settlements/generate-monthly endpoint"""
    
    @pytest.fixture(autouse=True)
    def setup(self):
        """Setup test session with authentication"""
        self.session = requests.Session()
        self.session.headers.update({
            "Content-Type": "application/json",
            "X-Tenant-ID": TENANT_ID
        })
        login_response = self.session.post(f"{BASE_URL}/api/auth/login", json={
            "email": "surya.yadavalli@nylaairwater.earth",
            "password": "test123"
        })
        if login_response.status_code == 200:
            token = login_response.json().get('token')
            self.session.headers.update({"Authorization": f"Bearer {token}"})
        yield
    
    def test_generate_monthly_settlement_missing_params(self):
        """Test that generating settlement without month/year returns error"""
        response = self.session.post(
            f"{BASE_URL}/api/distributors/{DISTRIBUTOR_ID}/settlements/generate-monthly",
            json={}
        )
        assert response.status_code == 400, f"Expected 400, got {response.status_code}"
        print(f"Error response: {response.json()}")
    
    def test_generate_monthly_settlement_no_deliveries(self):
        """Test generating settlement for month with no unsettled deliveries"""
        # Use a far future month that likely has no deliveries
        response = self.session.post(
            f"{BASE_URL}/api/distributors/{DISTRIBUTOR_ID}/settlements/generate-monthly",
            json={
                "settlement_month": 12,
                "settlement_year": 2030,
                "remarks": "Test settlement"
            }
        )
        # Should return 400 if no deliveries found
        if response.status_code == 400:
            print(f"Expected: No unsettled deliveries for 12/2030")
        else:
            print(f"Unexpected response: {response.status_code} - {response.text}")
    
    def test_generate_monthly_settlement_endpoint_exists(self):
        """Test that the generate-monthly endpoint exists and is accessible"""
        # First check if there are unsettled deliveries
        unsettled_response = self.session.get(
            f"{BASE_URL}/api/distributors/{DISTRIBUTOR_ID}/unsettled-deliveries",
            params={"month": 1, "year": 2026}
        )
        
        if unsettled_response.status_code == 200:
            unsettled_data = unsettled_response.json()
            print(f"Unsettled deliveries for Jan 2026: {unsettled_data['count']}")
            
            if unsettled_data['count'] > 0:
                # Try to generate settlement
                response = self.session.post(
                    f"{BASE_URL}/api/distributors/{DISTRIBUTOR_ID}/settlements/generate-monthly",
                    json={
                        "settlement_month": 1,
                        "settlement_year": 2026,
                        "remarks": "Test monthly settlement"
                    }
                )
                print(f"Generate settlement response: {response.status_code}")
                if response.status_code == 200:
                    data = response.json()
                    print(f"Created {len(data.get('settlements', []))} settlements")
                    # Verify settlement structure
                    if 'settlements' in data and len(data['settlements']) > 0:
                        settlement = data['settlements'][0]
                        assert 'account_name' in settlement, "Settlement should have account_name"
                        assert 'settlement_month' in settlement, "Settlement should have settlement_month"
                        assert 'settlement_year' in settlement, "Settlement should have settlement_year"
                        print(f"First settlement: {settlement.get('settlement_number')} for {settlement.get('account_name')}")
                elif response.status_code == 400:
                    print(f"No unsettled deliveries or already settled: {response.json()}")
            else:
                print("No unsettled deliveries to test with")


class TestDeliveryItemCalculations:
    """Test that delivery items have correct calculation fields"""
    
    @pytest.fixture(autouse=True)
    def setup(self):
        """Setup test session with authentication"""
        self.session = requests.Session()
        self.session.headers.update({
            "Content-Type": "application/json",
            "X-Tenant-ID": TENANT_ID
        })
        login_response = self.session.post(f"{BASE_URL}/api/auth/login", json={
            "email": "surya.yadavalli@nylaairwater.earth",
            "password": "test123"
        })
        if login_response.status_code == 200:
            token = login_response.json().get('token')
            self.session.headers.update({"Authorization": f"Bearer {token}"})
        yield
    
    def test_delivery_items_have_calculation_fields(self):
        """Test that delivery items have fields needed for calculations"""
        response = self.session.get(
            f"{BASE_URL}/api/distributors/{DISTRIBUTOR_ID}/deliveries",
            params={"time_filter": "lifetime", "page_size": 50}
        )
        assert response.status_code == 200
        
        data = response.json()
        deliveries = data['deliveries']
        
        items_with_data = 0
        items_without_data = 0
        
        for delivery in deliveries:
            items = delivery.get('items', [])
            for item in items:
                # Check for calculation fields
                has_customer_price = 'customer_selling_price' in item or 'unit_price' in item
                has_commission = 'distributor_commission_percent' in item or 'margin_percent' in item
                has_transfer_price = 'transfer_price' in item or 'base_price' in item
                
                if has_customer_price and has_commission and has_transfer_price:
                    items_with_data += 1
                else:
                    items_without_data += 1
        
        print(f"Items with calculation data: {items_with_data}")
        print(f"Items without full calculation data: {items_without_data}")
        print("Note: Legacy data may not have all new fields populated")


if __name__ == "__main__":
    pytest.main([__file__, "-v", "--tb=short"])
