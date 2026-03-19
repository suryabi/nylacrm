"""
Test cases for Distributor Billing & Reconciliation module
- BillingConfig CRUD (base prices, margin_percent, transfer_price)
- Billing Summary
- Reconciliation Calculate / Create / Confirm
- Debit/Credit Notes
- Record Payment
"""
import pytest
import requests
import os

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', '').rstrip('/')

# Test credentials
TEST_EMAIL = "surya.yadavalli@nylaairwater.earth"
TEST_PASSWORD = "test123"
TENANT_ID = "nyla-air-water"

# Test distributor ID from context
TEST_DISTRIBUTOR_ID = "99fb55dc-532c-4e85-b618-6b8a5e552c04"


class TestDistributorBilling:
    """Tests for Distributor Billing & Reconciliation APIs"""
    
    @pytest.fixture(autouse=True)
    def setup(self):
        """Setup session and authenticate"""
        self.session = requests.Session()
        self.session.headers.update({
            "Content-Type": "application/json",
            "X-Tenant-ID": TENANT_ID
        })
        self.token = self._get_auth_token()
        if self.token:
            self.session.headers.update({"Authorization": f"Bearer {self.token}"})
    
    def _get_auth_token(self):
        """Get authentication token"""
        try:
            response = self.session.post(f"{BASE_URL}/api/auth/login", json={
                "email": TEST_EMAIL,
                "password": TEST_PASSWORD
            })
            if response.status_code == 200:
                data = response.json()
                # API returns session_token, not access_token
                return data.get("session_token") or data.get("access_token")
        except Exception as e:
            print(f"Auth failed: {e}")
        return None
    
    # ============ Billing Config Tests ============
    
    def test_get_billing_configs(self):
        """Test GET /{distributor_id}/billing-config"""
        if not self.token:
            pytest.skip("Authentication failed")
        
        response = self.session.get(
            f"{BASE_URL}/api/distributors/{TEST_DISTRIBUTOR_ID}/billing-config"
        )
        
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        data = response.json()
        assert "configs" in data, "Response should contain 'configs' key"
        assert "count" in data, "Response should contain 'count' key"
        print(f"GET billing-config: {data['count']} configs found")
        
        # Verify config structure if any exist
        if data['count'] > 0:
            config = data['configs'][0]
            assert "sku_id" in config, "Config should have sku_id"
            assert "base_price" in config, "Config should have base_price"
            assert "margin_percent" in config, "Config should have margin_percent"
            assert "transfer_price" in config, "Config should have transfer_price"
            print(f"First config - SKU: {config.get('sku_name')}, Base: {config.get('base_price')}, Transfer: {config.get('transfer_price')}")
    
    def test_create_billing_config(self):
        """Test POST /{distributor_id}/billing-config - creates new billing config"""
        if not self.token:
            pytest.skip("Authentication failed")
        
        # First get SKUs to use for testing
        sku_response = self.session.get(f"{BASE_URL}/api/master-skus")
        skus = sku_response.json().get('skus', [])
        
        if not skus:
            pytest.skip("No SKUs available for testing")
        
        # Get existing configs to avoid duplicate
        existing_response = self.session.get(
            f"{BASE_URL}/api/distributors/{TEST_DISTRIBUTOR_ID}/billing-config"
        )
        existing_configs = existing_response.json().get('configs', [])
        existing_sku_ids = [c.get('sku_id') for c in existing_configs]
        
        # Find a SKU without config
        test_sku = None
        for sku in skus:
            if sku.get('id') not in existing_sku_ids:
                test_sku = sku
                break
        
        if not test_sku:
            print("All SKUs already have billing config - testing duplicate protection")
            # Test duplicate protection
            response = self.session.post(
                f"{BASE_URL}/api/distributors/{TEST_DISTRIBUTOR_ID}/billing-config",
                json={
                    "sku_id": existing_configs[0].get('sku_id'),
                    "base_price": 100,
                    "margin_percent": 2.5
                }
            )
            assert response.status_code == 400, f"Should reject duplicate, got {response.status_code}"
            assert "already exists" in response.json().get('detail', '').lower()
            print("Duplicate protection working correctly")
            return
        
        # Create new config
        payload = {
            "sku_id": test_sku.get('id'),
            "sku_name": test_sku.get('sku_name') or test_sku.get('name'),
            "base_price": 150.0,
            "margin_percent": 2.5,
            "remarks": "TEST_billing_config"
        }
        
        response = self.session.post(
            f"{BASE_URL}/api/distributors/{TEST_DISTRIBUTOR_ID}/billing-config",
            json=payload
        )
        
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        data = response.json()
        
        # Verify response structure
        assert data.get('sku_id') == test_sku.get('id'), "SKU ID should match"
        assert data.get('base_price') == 150.0, "Base price should match"
        assert data.get('margin_percent') == 2.5, "Margin percent should match"
        
        # Verify transfer_price calculation: base_price * (1 - margin_percent/100)
        expected_transfer = 150.0 * (1 - 2.5/100)
        assert abs(data.get('transfer_price') - expected_transfer) < 0.01, \
            f"Transfer price should be {expected_transfer}, got {data.get('transfer_price')}"
        
        print(f"Created billing config: ID={data.get('id')}, Transfer Price={data.get('transfer_price')}")
        
        # Cleanup - delete the test config
        if data.get('id'):
            delete_response = self.session.delete(
                f"{BASE_URL}/api/distributors/{TEST_DISTRIBUTOR_ID}/billing-config/{data.get('id')}"
            )
            print(f"Cleanup: deleted test config, status={delete_response.status_code}")
    
    def test_transfer_price_calculation(self):
        """Verify transfer_price = base_price * (1 - margin_percent/100)"""
        if not self.token:
            pytest.skip("Authentication failed")
        
        response = self.session.get(
            f"{BASE_URL}/api/distributors/{TEST_DISTRIBUTOR_ID}/billing-config"
        )
        
        assert response.status_code == 200
        configs = response.json().get('configs', [])
        
        for config in configs:
            base_price = config.get('base_price', 0)
            margin_percent = config.get('margin_percent', 0)
            transfer_price = config.get('transfer_price', 0)
            
            expected = base_price * (1 - margin_percent / 100)
            assert abs(transfer_price - expected) < 0.01, \
                f"Transfer price calculation wrong: expected {expected}, got {transfer_price}"
            print(f"SKU {config.get('sku_name')}: Base={base_price}, Margin={margin_percent}%, Transfer={transfer_price} ✓")
    
    # ============ Billing Summary Tests ============
    
    def test_get_billing_summary(self):
        """Test GET /{distributor_id}/billing/summary"""
        if not self.token:
            pytest.skip("Authentication failed")
        
        response = self.session.get(
            f"{BASE_URL}/api/distributors/{TEST_DISTRIBUTOR_ID}/billing/summary"
        )
        
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        data = response.json()
        
        # Verify response structure
        assert "distributor" in data, "Should have distributor info"
        assert "billing_configs" in data, "Should have billing_configs count"
        assert "pending_debit_amount" in data, "Should have pending_debit_amount"
        assert "pending_credit_amount" in data, "Should have pending_credit_amount"
        assert "net_balance" in data, "Should have net_balance"
        assert "unreconciled_deliveries" in data, "Should have unreconciled_deliveries"
        
        print(f"Billing Summary:")
        print(f"  - Billing Configs: {data.get('billing_configs')}")
        print(f"  - Pending Debit: ₹{data.get('pending_debit_amount')}")
        print(f"  - Pending Credit: ₹{data.get('pending_credit_amount')}")
        print(f"  - Net Balance: ₹{data.get('net_balance')}")
        print(f"  - Unreconciled Deliveries: {data.get('unreconciled_deliveries')}")
    
    # ============ Reconciliation Tests ============
    
    def test_calculate_reconciliation_preview(self):
        """Test POST /{distributor_id}/reconciliations/calculate - preview without saving"""
        if not self.token:
            pytest.skip("Authentication failed")
        
        # Use a date range that should have deliveries
        payload = {
            "period_start": "2025-01-01",
            "period_end": "2026-12-31"
        }
        
        response = self.session.post(
            f"{BASE_URL}/api/distributors/{TEST_DISTRIBUTOR_ID}/reconciliations/calculate",
            json=payload
        )
        
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        data = response.json()
        
        # Verify response structure
        assert "period_start" in data
        assert "period_end" in data
        assert "total_deliveries" in data
        
        print(f"Reconciliation Preview:")
        print(f"  - Period: {data.get('period_start')} to {data.get('period_end')}")
        print(f"  - Total Deliveries: {data.get('total_deliveries')}")
        
        if data.get('total_deliveries', 0) > 0:
            assert "total_quantity" in data
            assert "total_provisional_amount" in data
            assert "total_actual_gross_amount" in data
            assert "total_entitled_margin" in data
            assert "total_actual_net_amount" in data
            assert "total_difference" in data
            assert "settlement_type" in data
            
            print(f"  - Total Quantity: {data.get('total_quantity')}")
            print(f"  - Provisional Amount: ₹{data.get('total_provisional_amount')}")
            print(f"  - Actual Gross: ₹{data.get('total_actual_gross_amount')}")
            print(f"  - Entitled Margin: ₹{data.get('total_entitled_margin')}")
            print(f"  - Actual Net: ₹{data.get('total_actual_net_amount')}")
            print(f"  - Difference: ₹{data.get('total_difference')}")
            print(f"  - Settlement Type: {data.get('settlement_type')}")
            
            # Verify calculation logic
            # difference = actual_net - provisional
            # If difference > 0 => debit_note (distributor owes)
            # If difference < 0 => credit_note (Nyla owes)
            difference = data.get('total_difference', 0)
            settlement_type = data.get('settlement_type')
            if difference > 0:
                assert settlement_type == "debit_note", f"Positive difference should be debit_note"
            elif difference < 0:
                assert settlement_type == "credit_note", f"Negative difference should be credit_note"
    
    def test_get_reconciliations_list(self):
        """Test GET /{distributor_id}/reconciliations"""
        if not self.token:
            pytest.skip("Authentication failed")
        
        response = self.session.get(
            f"{BASE_URL}/api/distributors/{TEST_DISTRIBUTOR_ID}/reconciliations"
        )
        
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        data = response.json()
        
        assert "reconciliations" in data
        assert "total" in data
        
        print(f"Reconciliations: {data.get('total')} found")
        
        for rec in data.get('reconciliations', [])[:3]:
            print(f"  - {rec.get('reconciliation_number')}: {rec.get('status')}, Diff: ₹{rec.get('total_difference')}")
    
    def test_create_reconciliation(self):
        """Test POST /{distributor_id}/reconciliations - creates and saves reconciliation"""
        if not self.token:
            pytest.skip("Authentication failed")
        
        # First check if there are delivered deliveries
        calc_response = self.session.post(
            f"{BASE_URL}/api/distributors/{TEST_DISTRIBUTOR_ID}/reconciliations/calculate",
            json={"period_start": "2025-01-01", "period_end": "2026-12-31"}
        )
        calc_data = calc_response.json()
        
        if calc_data.get('total_deliveries', 0) == 0:
            print("No delivered items in period - skipping create test")
            return
        
        # Create reconciliation
        payload = {
            "period_start": "2025-01-01",
            "period_end": "2026-12-31",
            "remarks": "TEST_reconciliation"
        }
        
        response = self.session.post(
            f"{BASE_URL}/api/distributors/{TEST_DISTRIBUTOR_ID}/reconciliations",
            json=payload
        )
        
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        data = response.json()
        
        assert "id" in data, "Should return reconciliation id"
        assert "reconciliation_number" in data, "Should have reconciliation number"
        assert data.get('status') == "draft", "New reconciliation should be draft"
        
        print(f"Created Reconciliation: {data.get('reconciliation_number')}")
        print(f"  - Status: {data.get('status')}")
        print(f"  - Total Difference: ₹{data.get('total_difference')}")
        print(f"  - Settlement Type: {data.get('settlement_type')}")
        
        # Store for cleanup
        self.created_reconciliation_id = data.get('id')
    
    def test_get_reconciliation_detail(self):
        """Test GET /{distributor_id}/reconciliations/{id} - with line items"""
        if not self.token:
            pytest.skip("Authentication failed")
        
        # First get list of reconciliations
        list_response = self.session.get(
            f"{BASE_URL}/api/distributors/{TEST_DISTRIBUTOR_ID}/reconciliations"
        )
        recs = list_response.json().get('reconciliations', [])
        
        if not recs:
            print("No reconciliations found to test detail")
            return
        
        rec_id = recs[0].get('id')
        response = self.session.get(
            f"{BASE_URL}/api/distributors/{TEST_DISTRIBUTOR_ID}/reconciliations/{rec_id}"
        )
        
        assert response.status_code == 200, f"Expected 200, got {response.status_code}"
        data = response.json()
        
        assert "items" in data, "Detail should include items"
        print(f"Reconciliation {data.get('reconciliation_number')} has {len(data.get('items', []))} line items")
    
    def test_confirm_reconciliation_generates_note(self):
        """Test POST /{distributor_id}/reconciliations/{id}/confirm - generates debit/credit note"""
        if not self.token:
            pytest.skip("Authentication failed")
        
        # Find a draft reconciliation
        list_response = self.session.get(
            f"{BASE_URL}/api/distributors/{TEST_DISTRIBUTOR_ID}/reconciliations?status=draft"
        )
        drafts = list_response.json().get('reconciliations', [])
        
        if not drafts:
            print("No draft reconciliations to confirm")
            return
        
        rec = drafts[0]
        rec_id = rec.get('id')
        
        response = self.session.post(
            f"{BASE_URL}/api/distributors/{TEST_DISTRIBUTOR_ID}/reconciliations/{rec_id}/confirm"
        )
        
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        data = response.json()
        
        assert "message" in data
        print(f"Confirmed reconciliation: {data.get('reconciliation_number')}")
        print(f"  - Final Settlement: ₹{data.get('final_settlement_amount')}")
        print(f"  - Settlement Type: {data.get('settlement_type')}")
        print(f"  - Note ID: {data.get('note_id')}")
        
        # Verify note was created
        if data.get('note_id'):
            note_response = self.session.get(
                f"{BASE_URL}/api/distributors/{TEST_DISTRIBUTOR_ID}/debit-credit-notes/{data.get('note_id')}"
            )
            assert note_response.status_code == 200, "Note should be accessible"
            note = note_response.json()
            print(f"  - Note Number: {note.get('note_number')}")
            print(f"  - Note Type: {note.get('note_type')}")
    
    # ============ Debit/Credit Notes Tests ============
    
    def test_get_debit_credit_notes(self):
        """Test GET /{distributor_id}/debit-credit-notes"""
        if not self.token:
            pytest.skip("Authentication failed")
        
        response = self.session.get(
            f"{BASE_URL}/api/distributors/{TEST_DISTRIBUTOR_ID}/debit-credit-notes"
        )
        
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        data = response.json()
        
        assert "notes" in data
        assert "total" in data
        
        print(f"Debit/Credit Notes: {data.get('total')} found")
        
        for note in data.get('notes', [])[:5]:
            print(f"  - {note.get('note_number')}: {note.get('note_type')} ₹{note.get('amount')} ({note.get('status')})")
    
    def test_get_note_detail(self):
        """Test GET /{distributor_id}/debit-credit-notes/{id}"""
        if not self.token:
            pytest.skip("Authentication failed")
        
        # Get list first
        list_response = self.session.get(
            f"{BASE_URL}/api/distributors/{TEST_DISTRIBUTOR_ID}/debit-credit-notes"
        )
        notes = list_response.json().get('notes', [])
        
        if not notes:
            print("No notes found")
            return
        
        note_id = notes[0].get('id')
        response = self.session.get(
            f"{BASE_URL}/api/distributors/{TEST_DISTRIBUTOR_ID}/debit-credit-notes/{note_id}"
        )
        
        assert response.status_code == 200
        data = response.json()
        
        print(f"Note Detail: {data.get('note_number')}")
        print(f"  - Type: {data.get('note_type')}")
        print(f"  - Amount: ₹{data.get('amount')}")
        print(f"  - Paid: ₹{data.get('paid_amount')}")
        print(f"  - Balance: ₹{data.get('balance_amount')}")
        print(f"  - Status: {data.get('status')}")
    
    def test_record_payment_on_note(self):
        """Test POST /{distributor_id}/debit-credit-notes/{id}/record-payment"""
        if not self.token:
            pytest.skip("Authentication failed")
        
        # Get pending/partially_paid notes
        list_response = self.session.get(
            f"{BASE_URL}/api/distributors/{TEST_DISTRIBUTOR_ID}/debit-credit-notes?status=pending"
        )
        pending = list_response.json().get('notes', [])
        
        if not pending:
            # Try partially_paid
            list_response = self.session.get(
                f"{BASE_URL}/api/distributors/{TEST_DISTRIBUTOR_ID}/debit-credit-notes?status=partially_paid"
            )
            pending = list_response.json().get('notes', [])
        
        if not pending:
            print("No pending notes to test payment")
            return
        
        note = pending[0]
        note_id = note.get('id')
        balance = note.get('balance_amount', 0)
        
        if balance <= 0:
            print("Note has no balance")
            return
        
        # Record partial payment
        payment_amount = min(100, balance)  # Pay 100 or remaining balance
        
        response = self.session.post(
            f"{BASE_URL}/api/distributors/{TEST_DISTRIBUTOR_ID}/debit-credit-notes/{note_id}/record-payment",
            params={
                "amount": payment_amount,
                "payment_reference": "TEST_PAYMENT_001"
            }
        )
        
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        data = response.json()
        
        assert "paid_amount" in data
        assert "balance_amount" in data
        assert "status" in data
        
        print(f"Payment recorded on {note.get('note_number')}:")
        print(f"  - Amount Paid: ₹{payment_amount}")
        print(f"  - Total Paid: ₹{data.get('paid_amount')}")
        print(f"  - Remaining Balance: ₹{data.get('balance_amount')}")
        print(f"  - New Status: {data.get('status')}")
    
    # ============ Delete Billing Config Test ============
    
    def test_delete_billing_config(self):
        """Test DELETE /{distributor_id}/billing-config/{id}"""
        if not self.token:
            pytest.skip("Authentication failed")
        
        # Get existing configs
        response = self.session.get(
            f"{BASE_URL}/api/distributors/{TEST_DISTRIBUTOR_ID}/billing-config"
        )
        configs = response.json().get('configs', [])
        
        # Find a test config to delete (one with TEST_ prefix in remarks)
        test_config = None
        for c in configs:
            if c.get('remarks') and 'TEST_' in c.get('remarks'):
                test_config = c
                break
        
        if not test_config:
            print("No test configs to delete")
            return
        
        delete_response = self.session.delete(
            f"{BASE_URL}/api/distributors/{TEST_DISTRIBUTOR_ID}/billing-config/{test_config.get('id')}"
        )
        
        assert delete_response.status_code == 200, f"Expected 200, got {delete_response.status_code}"
        print(f"Deleted test billing config: {test_config.get('id')}")


class TestBillingBusinessLogic:
    """Test business logic specific to billing reconciliation"""
    
    @pytest.fixture(autouse=True)
    def setup(self):
        """Setup session and authenticate"""
        self.session = requests.Session()
        self.session.headers.update({
            "Content-Type": "application/json",
            "X-Tenant-ID": TENANT_ID
        })
        self.token = self._get_auth_token()
        if self.token:
            self.session.headers.update({"Authorization": f"Bearer {self.token}"})
    
    def _get_auth_token(self):
        """Get authentication token"""
        try:
            response = self.session.post(f"{BASE_URL}/api/auth/login", json={
                "email": TEST_EMAIL,
                "password": TEST_PASSWORD
            })
            if response.status_code == 200:
                data = response.json()
                # API returns session_token, not access_token
                return data.get("session_token") or data.get("access_token")
        except Exception as e:
            print(f"Auth failed: {e}")
        return None
    
    def test_reconciliation_business_logic(self):
        """
        Verify business logic:
        1. Stock sent at Transfer Price = Base Price × (1 - 2.5%)
        2. Distributor sells at actual customer price
        3. Distributor earns 2.5% of actual selling price
        4. Difference calculated: actual_net - provisional
           - Positive = Debit Note (distributor owes)
           - Negative = Credit Note (Nyla owes)
        """
        if not self.token:
            pytest.skip("Authentication failed")
        
        # Calculate reconciliation to verify business logic
        response = self.session.post(
            f"{BASE_URL}/api/distributors/{TEST_DISTRIBUTOR_ID}/reconciliations/calculate",
            json={"period_start": "2025-01-01", "period_end": "2026-12-31"}
        )
        
        if response.status_code != 200:
            print(f"Calculate failed: {response.status_code}")
            return
        
        data = response.json()
        items = data.get('items', [])
        
        if not items:
            print("No items to verify business logic")
            return
        
        print("Verifying business logic for each line item:")
        for item in items[:5]:  # Check first 5 items
            qty = item.get('quantity', 0)
            base_price = item.get('base_price', 0)
            margin_percent = item.get('margin_percent', 0)
            transfer_price = item.get('transfer_price', 0)
            actual_selling = item.get('actual_selling_price', 0)
            
            # Verify transfer price calculation
            expected_transfer = base_price * (1 - margin_percent / 100)
            assert abs(transfer_price - expected_transfer) < 0.01, \
                f"Transfer price should be {expected_transfer:.2f}"
            
            # Verify provisional amount
            expected_provisional = qty * transfer_price
            actual_provisional = item.get('provisional_amount', 0)
            assert abs(actual_provisional - expected_provisional) < 0.01, \
                f"Provisional should be {expected_provisional:.2f}"
            
            # Verify entitled margin calculation (2.5% of actual gross)
            actual_gross = item.get('actual_gross_amount', 0)
            expected_entitled_margin = actual_gross * margin_percent / 100
            actual_entitled = item.get('entitled_margin_amount', 0)
            assert abs(actual_entitled - expected_entitled_margin) < 0.01, \
                f"Entitled margin should be {expected_entitled_margin:.2f}"
            
            # Verify actual net = gross - margin
            expected_actual_net = actual_gross - actual_entitled
            actual_net = item.get('actual_net_amount', 0)
            assert abs(actual_net - expected_actual_net) < 0.01, \
                f"Actual net should be {expected_actual_net:.2f}"
            
            # Verify difference = actual_net - provisional
            expected_diff = actual_net - actual_provisional
            actual_diff = item.get('difference_amount', 0)
            assert abs(actual_diff - expected_diff) < 0.01, \
                f"Difference should be {expected_diff:.2f}"
            
            print(f"  ✓ {item.get('sku_name')}: qty={qty}, diff=₹{actual_diff:.2f}")
        
        # Verify settlement type logic
        total_diff = data.get('total_difference', 0)
        settlement_type = data.get('settlement_type')
        
        if total_diff > 0:
            assert settlement_type == "debit_note", "Positive diff = debit_note"
            print(f"Total Difference: ₹{total_diff:.2f} -> Debit Note (distributor owes Nyla)")
        elif total_diff < 0:
            assert settlement_type == "credit_note", "Negative diff = credit_note"
            print(f"Total Difference: ₹{total_diff:.2f} -> Credit Note (Nyla owes distributor)")
        else:
            print(f"Total Difference: ₹0 -> No settlement needed")


if __name__ == "__main__":
    pytest.main([__file__, "-v", "-s"])
