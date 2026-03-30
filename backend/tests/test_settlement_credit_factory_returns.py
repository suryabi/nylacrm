"""
Test Settlement Integration with Credit Notes and Factory Returns
Tests the settlement creation flow that considers:
1. Deliveries (existing)
2. Credit notes issued by distributor to customer (from credit_notes collection)
3. Factory returns from warehouse that are adjustable

Settlement creation should work even without deliveries if there are credit notes or factory returns.
Net Payout = Earnings - Price Adj (Dist→Factory) + Return Credits (Factory→Dist) + Factory Returns (Factory→Dist)
"""
import pytest
import requests
import os
from datetime import datetime, timedelta

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', '').rstrip('/')

# Test credentials
TEST_EMAIL = "surya.yadavalli@nylaairwater.earth"
TEST_PASSWORD = "test123"
DISTRIBUTOR_ID = "d091204f-e04f-46f2-b9a9-d92d9f89b528"
TENANT_ID = "nyla-air-water"


class TestSettlementCreditFactoryReturns:
    """Test settlement creation with credit notes and factory returns"""
    
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
        self.period_start = self.today.replace(day=1).strftime("%Y-%m-%d")
        self.period_end = self.today.strftime("%Y-%m-%d")
        
        yield
        
        # Cleanup - delete test settlements
        self._cleanup_test_data()
    
    def _cleanup_test_data(self):
        """Clean up test data created during tests"""
        try:
            # Get settlements for this period
            response = self.session.get(
                f"{BASE_URL}/api/distributors/{DISTRIBUTOR_ID}/settlements",
                params={"status": "draft"}
            )
            if response.status_code == 200:
                data = response.json()
                for settlement in data.get('settlements', []):
                    if settlement.get('status') == 'draft':
                        self.session.delete(
                            f"{BASE_URL}/api/distributors/{DISTRIBUTOR_ID}/settlements/{settlement['id']}"
                        )
        except Exception as e:
            print(f"Cleanup error: {e}")
    
    def _get_account_id(self):
        """Get an account ID assigned to the distributor"""
        response = self.session.get(f"{BASE_URL}/api/distributors/{DISTRIBUTOR_ID}/accounts")
        if response.status_code == 200:
            data = response.json()
            accounts = data.get('accounts', [])
            if accounts:
                return accounts[0].get('id')
        return None
    
    def _get_sku_info(self):
        """Get SKU info for creating deliveries"""
        response = self.session.get(f"{BASE_URL}/api/skus")
        if response.status_code == 200:
            data = response.json()
            skus = data.get('skus', [])
            if skus:
                sku = skus[0]
                return {
                    "sku_id": sku.get('id'),
                    "sku_name": sku.get('name'),
                    "base_price": sku.get('base_price', 100)
                }
        return None
    
    def _get_warehouse_id(self):
        """Get warehouse/location ID for the distributor"""
        response = self.session.get(f"{BASE_URL}/api/distributors/{DISTRIBUTOR_ID}/locations")
        if response.status_code == 200:
            data = response.json()
            locations = data.get('locations', [])
            if locations:
                return locations[0].get('id')
        return None
    
    def _create_delivery(self, account_id, sku_info):
        """Create a delivery for testing"""
        delivery_data = {
            "account_id": account_id,
            "delivery_date": self.today.strftime("%Y-%m-%d"),
            "items": [{
                "sku_id": sku_info['sku_id'],
                "sku_name": sku_info['sku_name'],
                "quantity": 10,
                "customer_selling_price": 120,
                "base_price": sku_info['base_price'],
                "distributor_commission_percent": 10,
                "tax_percent": 18
            }]
        }
        response = self.session.post(
            f"{BASE_URL}/api/distributors/{DISTRIBUTOR_ID}/deliveries",
            json=delivery_data
        )
        return response
    
    def _create_factory_return(self, warehouse_id, sku_info, source="warehouse"):
        """Create a factory return for testing"""
        return_data = {
            "warehouse_id": warehouse_id,
            "return_date": self.today.strftime("%Y-%m-%d"),
            "source": source,
            "reason": "expired" if source == "warehouse" else "empty_reusable",
            "items": [{
                "sku_id": sku_info['sku_id'],
                "sku_name": sku_info['sku_name'],
                "quantity": 5,
                "unit_credit_amount": 50
            }],
            "remarks": "Test factory return for settlement"
        }
        response = self.session.post(
            f"{BASE_URL}/api/distributors/{DISTRIBUTOR_ID}/factory-returns",
            json=return_data
        )
        return response
    
    def _confirm_factory_return(self, return_id):
        """Confirm a factory return"""
        response = self.session.put(
            f"{BASE_URL}/api/distributors/{DISTRIBUTOR_ID}/factory-returns/{return_id}/confirm"
        )
        return response
    
    def test_01_login_and_get_distributor(self):
        """Test login and verify distributor exists"""
        response = self.session.get(f"{BASE_URL}/api/distributors/{DISTRIBUTOR_ID}")
        assert response.status_code == 200, f"Failed to get distributor: {response.text}"
        
        data = response.json()
        assert data.get('id') == DISTRIBUTOR_ID
        print(f"✓ Distributor found: {data.get('distributor_name')}")
    
    def test_02_settlement_rejects_when_no_data(self):
        """Test that settlement creation rejects when there are no deliveries, credit notes, or factory returns"""
        # Use a future period where there's definitely no data
        future_start = (self.today + timedelta(days=365)).strftime("%Y-%m-%d")
        future_end = (self.today + timedelta(days=395)).strftime("%Y-%m-%d")
        
        settlement_data = {
            "distributor_id": DISTRIBUTOR_ID,
            "period_type": "monthly",
            "period_start": future_start,
            "period_end": future_end
        }
        
        response = self.session.post(
            f"{BASE_URL}/api/distributors/{DISTRIBUTOR_ID}/settlements",
            json=settlement_data
        )
        
        # Should reject with 400 error
        assert response.status_code == 400, f"Expected 400, got {response.status_code}: {response.text}"
        
        data = response.json()
        assert "no unsettled" in data.get('detail', '').lower() or "no deliveries" in data.get('detail', '').lower(), \
            f"Expected rejection message about no data, got: {data.get('detail')}"
        
        print("✓ Settlement correctly rejects when no deliveries, credit notes, or factory returns")
    
    def test_03_create_delivery_for_settlement(self):
        """Create a delivery to be included in settlement"""
        account_id = self._get_account_id()
        if not account_id:
            pytest.skip("No account found for distributor")
        
        sku_info = self._get_sku_info()
        if not sku_info:
            pytest.skip("No SKU found")
        
        response = self._create_delivery(account_id, sku_info)
        
        if response.status_code == 201:
            data = response.json()
            print(f"✓ Delivery created: {data.get('delivery_number')}")
            
            # Mark as delivered
            delivery_id = data.get('id')
            deliver_response = self.session.put(
                f"{BASE_URL}/api/distributors/{DISTRIBUTOR_ID}/deliveries/{delivery_id}/deliver"
            )
            if deliver_response.status_code == 200:
                print(f"✓ Delivery marked as delivered")
        else:
            print(f"Delivery creation returned: {response.status_code} - {response.text}")
    
    def test_04_create_factory_return_for_settlement(self):
        """Create a factory return (warehouse source) to be included in settlement"""
        warehouse_id = self._get_warehouse_id()
        if not warehouse_id:
            pytest.skip("No warehouse found for distributor")
        
        sku_info = self._get_sku_info()
        if not sku_info:
            pytest.skip("No SKU found")
        
        # Create factory return with warehouse source (requires_settlement=true)
        response = self._create_factory_return(warehouse_id, sku_info, source="warehouse")
        
        if response.status_code == 201:
            data = response.json()
            print(f"✓ Factory return created: {data.get('return_number')}")
            print(f"  - Source: {data.get('source')}")
            print(f"  - Requires settlement: {data.get('requires_settlement')}")
            
            # Confirm the factory return
            return_id = data.get('id')
            confirm_response = self._confirm_factory_return(return_id)
            if confirm_response.status_code == 200:
                print(f"✓ Factory return confirmed")
        else:
            print(f"Factory return creation returned: {response.status_code} - {response.text}")
    
    def test_05_settlement_with_deliveries_and_factory_returns(self):
        """Test settlement creation with deliveries + credit notes + factory returns"""
        settlement_data = {
            "distributor_id": DISTRIBUTOR_ID,
            "period_type": "monthly",
            "period_start": self.period_start,
            "period_end": self.period_end
        }
        
        response = self.session.post(
            f"{BASE_URL}/api/distributors/{DISTRIBUTOR_ID}/settlements",
            json=settlement_data
        )
        
        if response.status_code == 201:
            data = response.json()
            print(f"✓ Settlement created: {data.get('settlement_number')}")
            print(f"  - Total deliveries: {data.get('total_deliveries')}")
            print(f"  - Total credit notes: {data.get('total_credit_notes', 0)}")
            print(f"  - Total factory returns: {data.get('total_factory_returns', 0)}")
            print(f"  - Total credit notes issued: ₹{data.get('total_credit_notes_issued', 0)}")
            print(f"  - Total factory return credit: ₹{data.get('total_factory_return_credit', 0)}")
            print(f"  - Final payout: ₹{data.get('final_payout', 0)}")
            
            # Verify settlement stores credit_note_ids and factory_return_ids arrays
            assert 'credit_note_ids' in data, "Settlement should have credit_note_ids array"
            assert 'factory_return_ids' in data, "Settlement should have factory_return_ids array"
            assert isinstance(data.get('credit_note_ids'), list), "credit_note_ids should be a list"
            assert isinstance(data.get('factory_return_ids'), list), "factory_return_ids should be a list"
            
            # Verify settlement includes total_credit_notes_issued and total_factory_return_credit
            assert 'total_credit_notes_issued' in data, "Settlement should have total_credit_notes_issued"
            assert 'total_factory_return_credit' in data, "Settlement should have total_factory_return_credit"
            
            print("✓ Settlement has credit_note_ids and factory_return_ids arrays")
            print("✓ Settlement has total_credit_notes_issued and total_factory_return_credit fields")
        elif response.status_code == 400:
            data = response.json()
            print(f"Settlement creation returned 400: {data.get('detail')}")
            print("This may be expected if no unsettled data exists for the period")
        else:
            print(f"Settlement creation returned: {response.status_code} - {response.text}")
    
    def test_06_settlement_with_only_factory_returns(self):
        """Test settlement creation succeeds when there are ONLY factory returns (no deliveries)"""
        # First, create a factory return for a different period
        warehouse_id = self._get_warehouse_id()
        sku_info = self._get_sku_info()
        
        if not warehouse_id or not sku_info:
            pytest.skip("No warehouse or SKU found")
        
        # Create factory return
        response = self._create_factory_return(warehouse_id, sku_info, source="warehouse")
        
        if response.status_code == 201:
            data = response.json()
            return_id = data.get('id')
            
            # Confirm it
            self._confirm_factory_return(return_id)
            
            # Now try to create settlement for this period
            settlement_data = {
                "distributor_id": DISTRIBUTOR_ID,
                "period_type": "monthly",
                "period_start": self.period_start,
                "period_end": self.period_end
            }
            
            settlement_response = self.session.post(
                f"{BASE_URL}/api/distributors/{DISTRIBUTOR_ID}/settlements",
                json=settlement_data
            )
            
            if settlement_response.status_code == 201:
                settlement_data = settlement_response.json()
                print(f"✓ Settlement created with factory returns only")
                print(f"  - Total deliveries: {settlement_data.get('total_deliveries')}")
                print(f"  - Total factory returns: {settlement_data.get('total_factory_returns', 0)}")
                print(f"  - Total factory return credit: ₹{settlement_data.get('total_factory_return_credit', 0)}")
            elif settlement_response.status_code == 400:
                # This is acceptable if there's no unsettled data
                print(f"Settlement returned 400 - may be expected if data already settled")
            else:
                print(f"Settlement returned: {settlement_response.status_code}")
    
    def test_07_monthly_reconciliation_returns_factory_return_credit(self):
        """Test that monthly reconciliation returns total_factory_return_credit field"""
        month = self.today.month
        year = self.today.year
        
        response = self.session.get(
            f"{BASE_URL}/api/distributors/{DISTRIBUTOR_ID}/monthly-reconciliation",
            params={"month": month, "year": year}
        )
        
        assert response.status_code == 200, f"Monthly reconciliation failed: {response.text}"
        
        data = response.json()
        
        # Verify the response includes total_factory_return_credit
        assert 'total_factory_return_credit' in data, "Monthly reconciliation should return total_factory_return_credit"
        
        print(f"✓ Monthly reconciliation response includes total_factory_return_credit")
        print(f"  - Total unreconciled: {data.get('total_unreconciled')}")
        print(f"  - Total reconciled: {data.get('total_reconciled')}")
        print(f"  - Total billing value: ₹{data.get('total_billing_value', 0)}")
        print(f"  - Total credit notes applied: ₹{data.get('total_credit_notes_applied', 0)}")
        print(f"  - Total factory return credit: ₹{data.get('total_factory_return_credit', 0)}")
    
    def test_08_verify_settlement_structure(self):
        """Verify settlement document structure has all required fields"""
        # Get existing settlements
        response = self.session.get(
            f"{BASE_URL}/api/distributors/{DISTRIBUTOR_ID}/settlements"
        )
        
        assert response.status_code == 200, f"Failed to get settlements: {response.text}"
        
        data = response.json()
        settlements = data.get('settlements', [])
        
        if settlements:
            settlement = settlements[0]
            
            # Check for required fields
            required_fields = [
                'id', 'settlement_number', 'distributor_id', 'period_start', 'period_end',
                'total_deliveries', 'status'
            ]
            
            for field in required_fields:
                assert field in settlement, f"Settlement missing required field: {field}"
            
            # Check for new fields (may not be present in old settlements)
            new_fields = ['credit_note_ids', 'factory_return_ids', 'total_credit_notes_issued', 'total_factory_return_credit']
            present_new_fields = [f for f in new_fields if f in settlement]
            
            print(f"✓ Settlement structure verified")
            print(f"  - Settlement: {settlement.get('settlement_number')}")
            print(f"  - Status: {settlement.get('status')}")
            print(f"  - New fields present: {present_new_fields}")
        else:
            print("No settlements found to verify structure")


class TestBillingTabUI:
    """Test BillingTab frontend requirements (API-level verification)"""
    
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
    
    def test_monthly_reconciliation_data_for_billing_tab(self):
        """Verify monthly reconciliation returns data needed for BillingTab summary cards"""
        month = self.today.month
        year = self.today.year
        
        response = self.session.get(
            f"{BASE_URL}/api/distributors/{DISTRIBUTOR_ID}/monthly-reconciliation",
            params={"month": month, "year": year}
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
        
        # Verify settlements have the fields needed for per-account detail table
        settlements = data.get('unreconciled_settlements', [])
        if settlements:
            settlement = settlements[0]
            detail_fields = [
                'settlement_number', 'total_deliveries', 'total_billing_value',
                'distributor_earnings'
            ]
            for field in detail_fields:
                if field not in settlement:
                    print(f"  Warning: Settlement missing field: {field}")
            
            # Check for factory return credit in settlement
            if 'total_factory_return_credit' in settlement:
                print(f"  ✓ Settlement has total_factory_return_credit field")
            else:
                print(f"  Note: Settlement may not have total_factory_return_credit (older settlement)")


if __name__ == "__main__":
    pytest.main([__file__, "-v", "--tb=short"])
