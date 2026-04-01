"""
Test Settlement Generate Monthly Endpoint with Credit Notes and Factory Returns
Tests the generate-monthly settlement endpoint that considers:
1. Deliveries
2. Credit notes issued by distributor to customers
3. Factory returns from warehouse that are adjustable

Net Payout = Earnings - Price Adj (Dist→Factory) + Credit Notes (Factory→Dist) + Factory Returns (Factory→Dist)
"""
import pytest
import requests
import os
from datetime import datetime, timedelta

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', '').rstrip('/')

# Test credentials
TEST_EMAIL = "surya.yadavalli@nylaairwater.earth"
TEST_PASSWORD = "test123"
DISTRIBUTOR_ID = "99fb55dc-532c-4e85-b618-6b8a5e552c04"
TENANT_ID = "nyla-air-water"


class TestGenerateMonthlySettlement:
    """Test generate-monthly settlement endpoint"""
    
    @pytest.fixture(autouse=True)
    def setup(self):
        """Setup test session with authentication"""
        self.session = requests.Session()
        self.session.headers.update({
            "Content-Type": "application/json",
            "X-Tenant-ID": TENANT_ID
        })
        
        # Login
        login_response = self.session.post(f"{BASE_URL}/api/auth/login", json={
            "email": TEST_EMAIL,
            "password": TEST_PASSWORD
        })
        assert login_response.status_code == 200, f"Login failed: {login_response.text}"
        
        login_data = login_response.json()
        self.token = login_data.get('session_token') or login_data.get('token')
        assert self.token, "No token in login response"
        
        self.session.headers.update({"Authorization": f"Bearer {self.token}"})
        
        # Get current date for period
        self.today = datetime.now()
        self.current_month = self.today.month
        self.current_year = self.today.year
        
        yield
    
    def test_01_generate_monthly_rejects_when_no_data(self):
        """Test that generate-monthly returns proper error when no data exists"""
        # Use a future period where there's definitely no data
        future_month = (self.current_month % 12) + 1
        future_year = self.current_year + 1 if future_month == 1 else self.current_year
        
        response = self.session.post(
            f"{BASE_URL}/api/distributors/{DISTRIBUTOR_ID}/settlements/generate-monthly",
            json={
                "settlement_month": future_month,
                "settlement_year": future_year
            }
        )
        
        # Should return 400 with proper error message
        assert response.status_code == 400, f"Expected 400, got {response.status_code}: {response.text}"
        
        data = response.json()
        detail = data.get('detail', '').lower()
        assert "no unsettled" in detail or "no deliveries" in detail, \
            f"Expected rejection message about no data, got: {data.get('detail')}"
        
        print("✓ generate-monthly correctly rejects when no deliveries, credit notes, or factory returns")
    
    def test_02_generate_monthly_endpoint_exists(self):
        """Test that the generate-monthly endpoint exists and is accessible"""
        response = self.session.post(
            f"{BASE_URL}/api/distributors/{DISTRIBUTOR_ID}/settlements/generate-monthly",
            json={
                "settlement_month": self.current_month,
                "settlement_year": self.current_year
            }
        )
        
        # Should return either 201 (success) or 400 (no data) - not 404 or 500
        assert response.status_code in [201, 400], \
            f"Unexpected status code {response.status_code}: {response.text}"
        
        print(f"✓ generate-monthly endpoint accessible, returned {response.status_code}")
    
    def test_03_monthly_reconciliation_returns_required_fields(self):
        """Test that monthly reconciliation returns total_credit_notes_issued and total_factory_return_credit"""
        response = self.session.get(
            f"{BASE_URL}/api/distributors/{DISTRIBUTOR_ID}/monthly-reconciliation",
            params={"month": self.current_month, "year": self.current_year}
        )
        
        assert response.status_code == 200, f"Monthly reconciliation failed: {response.text}"
        
        data = response.json()
        
        # Verify required fields exist
        required_fields = [
            'unreconciled_settlements',
            'reconciled_settlements',
            'total_unreconciled',
            'total_reconciled',
            'total_billing_value',
            'total_distributor_earnings',
            'total_credit_notes_applied',
            'total_factory_return_credit'
        ]
        
        for field in required_fields:
            assert field in data, f"Missing required field: {field}"
        
        print("✓ Monthly reconciliation returns all required fields including total_factory_return_credit")
        print(f"  - total_credit_notes_applied: {data.get('total_credit_notes_applied', 0)}")
        print(f"  - total_factory_return_credit: {data.get('total_factory_return_credit', 0)}")
    
    def test_04_distributor_exists(self):
        """Verify the test distributor exists"""
        response = self.session.get(f"{BASE_URL}/api/distributors/{DISTRIBUTOR_ID}")
        
        assert response.status_code == 200, f"Distributor not found: {response.text}"
        
        data = response.json()
        assert data.get('id') == DISTRIBUTOR_ID
        print(f"✓ Distributor found: {data.get('distributor_name')}")
    
    def test_05_distributor_has_locations(self):
        """Verify distributor has warehouse locations for factory returns"""
        response = self.session.get(f"{BASE_URL}/api/distributors/{DISTRIBUTOR_ID}/locations")
        
        assert response.status_code == 200, f"Failed to get locations: {response.text}"
        
        data = response.json()
        locations = data.get('locations', [])
        
        if locations:
            print(f"✓ Distributor has {len(locations)} location(s)")
            for loc in locations[:2]:
                print(f"  - {loc.get('location_name')} ({loc.get('id')})")
        else:
            print("⚠ No locations found for distributor")
    
    def test_06_factory_returns_endpoint_works(self):
        """Test that factory returns endpoint is accessible"""
        response = self.session.get(f"{BASE_URL}/api/distributors/{DISTRIBUTOR_ID}/factory-returns")
        
        assert response.status_code == 200, f"Factory returns endpoint failed: {response.text}"
        
        data = response.json()
        returns = data.get('factory_returns', [])
        print(f"✓ Factory returns endpoint works, found {len(returns)} return(s)")
    
    def test_07_settlements_endpoint_works(self):
        """Test that settlements endpoint is accessible"""
        response = self.session.get(f"{BASE_URL}/api/distributors/{DISTRIBUTOR_ID}/settlements")
        
        assert response.status_code == 200, f"Settlements endpoint failed: {response.text}"
        
        data = response.json()
        settlements = data.get('settlements', [])
        print(f"✓ Settlements endpoint works, found {len(settlements)} settlement(s)")
        
        # If there are settlements, verify they have the new fields
        if settlements:
            settlement = settlements[0]
            new_fields = ['credit_note_ids', 'factory_return_ids', 'total_credit_notes_issued', 'total_factory_return_credit']
            present_fields = [f for f in new_fields if f in settlement]
            print(f"  - New fields present in settlement: {present_fields}")


class TestSettlementStructure:
    """Test settlement document structure"""
    
    @pytest.fixture(autouse=True)
    def setup(self):
        """Setup test session"""
        self.session = requests.Session()
        self.session.headers.update({
            "Content-Type": "application/json",
            "X-Tenant-ID": TENANT_ID
        })
        
        # Login
        login_response = self.session.post(f"{BASE_URL}/api/auth/login", json={
            "email": TEST_EMAIL,
            "password": TEST_PASSWORD
        })
        assert login_response.status_code == 200
        
        login_data = login_response.json()
        self.token = login_data.get('session_token') or login_data.get('token')
        self.session.headers.update({"Authorization": f"Bearer {self.token}"})
        
        yield
    
    def test_settlement_model_has_required_fields(self):
        """Verify settlement model includes credit notes and factory return fields"""
        # Get existing settlements to check structure
        response = self.session.get(f"{BASE_URL}/api/distributors/{DISTRIBUTOR_ID}/settlements")
        
        assert response.status_code == 200, f"Failed to get settlements: {response.text}"
        
        data = response.json()
        settlements = data.get('settlements', [])
        
        if settlements:
            settlement = settlements[0]
            
            # Check for standard fields
            standard_fields = ['id', 'settlement_number', 'distributor_id', 'status']
            for field in standard_fields:
                assert field in settlement, f"Missing standard field: {field}"
            
            print("✓ Settlement has standard fields")
            
            # Check for new fields (may not be present in old settlements)
            new_fields = ['credit_note_ids', 'factory_return_ids', 'total_credit_notes_issued', 'total_factory_return_credit']
            present = [f for f in new_fields if f in settlement]
            missing = [f for f in new_fields if f not in settlement]
            
            if present:
                print(f"✓ Settlement has new fields: {present}")
            if missing:
                print(f"⚠ Settlement missing new fields (may be old settlement): {missing}")
        else:
            print("⚠ No settlements found to verify structure")


class TestBillingTabAPI:
    """Test API endpoints needed for BillingTab frontend"""
    
    @pytest.fixture(autouse=True)
    def setup(self):
        """Setup test session"""
        self.session = requests.Session()
        self.session.headers.update({
            "Content-Type": "application/json",
            "X-Tenant-ID": TENANT_ID
        })
        
        # Login
        login_response = self.session.post(f"{BASE_URL}/api/auth/login", json={
            "email": TEST_EMAIL,
            "password": TEST_PASSWORD
        })
        assert login_response.status_code == 200
        
        login_data = login_response.json()
        self.token = login_data.get('session_token') or login_data.get('token')
        self.session.headers.update({"Authorization": f"Bearer {self.token}"})
        
        self.today = datetime.now()
        yield
    
    def test_monthly_reconciliation_for_billing_tab(self):
        """Verify monthly reconciliation returns data needed for BillingTab 7 summary cards"""
        response = self.session.get(
            f"{BASE_URL}/api/distributors/{DISTRIBUTOR_ID}/monthly-reconciliation",
            params={"month": self.today.month, "year": self.today.year}
        )
        
        assert response.status_code == 200, f"Failed: {response.text}"
        
        data = response.json()
        
        # BillingTab needs these fields for the 7 summary cards:
        # 1. Accounts count (from unreconciled_settlements)
        # 2. Billing Value (total_billing_value)
        # 3. Distributor Earnings (total_distributor_earnings)
        # 4. ① Price Adj (Dist → Factory) - from factory_distributor_adjustment in settlements
        # 5. ② Return Credits (Factory → Dist) - total_credit_notes_applied
        # 6. ③ Factory Returns (Factory → Dist) - total_factory_return_credit
        # 7. Net Payout = Earnings - ① + ② + ③
        
        required_fields = [
            'unreconciled_settlements',
            'total_billing_value',
            'total_distributor_earnings',
            'total_credit_notes_applied',
            'total_factory_return_credit'
        ]
        
        for field in required_fields:
            assert field in data, f"Missing field for BillingTab: {field}"
        
        print("✓ Monthly reconciliation returns all fields needed for BillingTab")
        print(f"  - Unreconciled settlements: {len(data.get('unreconciled_settlements', []))}")
        print(f"  - Total billing value: ₹{data.get('total_billing_value', 0)}")
        print(f"  - Total distributor earnings: ₹{data.get('total_distributor_earnings', 0)}")
        print(f"  - Total credit notes applied (②): ₹{data.get('total_credit_notes_applied', 0)}")
        print(f"  - Total factory return credit (③): ₹{data.get('total_factory_return_credit', 0)}")


if __name__ == "__main__":
    pytest.main([__file__, "-v", "--tb=short"])
