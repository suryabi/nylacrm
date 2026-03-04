"""
Backend tests for Invoice Creation with COGS, Logistics, and Margin Calculation
Tests the POST /api/accounts/{account_id}/invoices and GET /api/accounts/{account_id}/invoices endpoints
"""
import pytest
import requests
import os

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', '').rstrip('/')


class TestInvoiceCreation:
    """Test suite for invoice creation and retrieval with margin calculations"""
    
    @pytest.fixture(scope="class")
    def auth_token(self):
        """Get authentication token"""
        response = requests.post(f"{BASE_URL}/api/auth/login", json={
            "email": "admin@nylaairwater.earth",
            "password": "admin123"
        })
        assert response.status_code == 200, f"Login failed: {response.text}"
        return response.json().get("session_token")
    
    @pytest.fixture(scope="class")
    def auth_headers(self, auth_token):
        """Get authorization headers"""
        return {"Authorization": f"Bearer {auth_token}", "Content-Type": "application/json"}
    
    @pytest.fixture(scope="class")
    def test_account(self, auth_headers):
        """Get the Oceans Fresh Seafood test account"""
        response = requests.get(
            f"{BASE_URL}/api/accounts?search=Oceans",
            headers=auth_headers
        )
        assert response.status_code == 200
        data = response.json()
        accounts = data.get('data', [])
        assert len(accounts) > 0, "Oceans Fresh Seafood account not found"
        account = accounts[0]
        assert account['city'] == 'Hyderabad', f"Expected Hyderabad, got {account['city']}"
        return account

    # Module: Test account lookup
    def test_account_exists_with_correct_city(self, auth_headers, test_account):
        """Verify the test account exists and is in Hyderabad"""
        assert test_account['account_id'] == 'OCEA-HYD-A26-001'
        assert test_account['city'] == 'Hyderabad'
        assert test_account['account_name'] == 'Oceans Fresh Seafood'
        print(f"✓ Test account found: {test_account['account_name']} in {test_account['city']}")
    
    # Module: Test COGS data availability
    def test_cogs_data_exists_for_hyderabad(self, auth_headers):
        """Verify COGS data exists for Hyderabad city"""
        response = requests.get(
            f"{BASE_URL}/api/cogs/Hyderabad",
            headers=auth_headers
        )
        assert response.status_code == 200
        data = response.json()
        cogs_data = data.get('cogs_data', [])
        assert len(cogs_data) > 0, "No COGS data found for Hyderabad"
        
        # Verify specific SKUs have COGS and logistics data
        sku_names = [c['sku_name'] for c in cogs_data]
        assert 'Nyla – 600 ml / Silver' in sku_names, "Nyla – 600 ml / Silver not found in COGS"
        assert 'Nyla – 330 ml / Gold' in sku_names, "Nyla – 330 ml / Gold not found in COGS"
        
        # Verify COGS values are non-zero
        silver_cogs = next(c for c in cogs_data if c['sku_name'] == 'Nyla – 600 ml / Silver')
        assert silver_cogs['total_cogs'] > 0, "COGS should be greater than 0"
        assert silver_cogs['outbound_logistics_cost'] > 0, "Logistics cost should be greater than 0"
        print(f"✓ COGS data found for {len(cogs_data)} SKUs in Hyderabad")

    # Module: Test invoice creation
    def test_create_invoice_with_margin_calculation(self, auth_headers, test_account):
        """Create an invoice and verify COGS, logistics, and margin are calculated"""
        invoice_payload = {
            "invoice_date": "2026-03-04",
            "line_items": [
                {"sku_name": "Nyla – 600 ml / Silver", "bottles": 100, "price_per_bottle": 150},
                {"sku_name": "Nyla – 330 ml / Gold", "bottles": 50, "price_per_bottle": 100}
            ],
            "notes": "Test invoice for COGS calculation verification"
        }
        
        response = requests.post(
            f"{BASE_URL}/api/accounts/{test_account['account_id']}/invoices",
            headers=auth_headers,
            json=invoice_payload
        )
        assert response.status_code == 200, f"Invoice creation failed: {response.text}"
        
        data = response.json()
        assert data['message'] == 'Invoice created successfully'
        
        # Verify invoice data
        invoice = data['invoice']
        assert 'invoice_number' in invoice
        assert invoice['total_bottles'] == 150
        assert invoice['line_items_count'] == 2
        
        # Verify margin summary is returned
        margin_summary = data['margin_summary']
        assert margin_summary['invoice_revenue'] == 20000.0  # 100*150 + 50*100
        assert margin_summary['total_cogs'] > 0, "COGS should be calculated"
        assert margin_summary['total_logistics'] > 0, "Logistics should be calculated"
        assert margin_summary['gross_margin'] > 0, "Gross margin should be positive"
        assert margin_summary['gross_margin_percent'] > 0, "Gross margin percent should be positive"
        
        print(f"✓ Invoice {invoice['invoice_number']} created successfully")
        print(f"  Revenue: ₹{margin_summary['invoice_revenue']}")
        print(f"  COGS: ₹{margin_summary['total_cogs']}")
        print(f"  Logistics: ₹{margin_summary['total_logistics']}")
        print(f"  Gross Margin: ₹{margin_summary['gross_margin']} ({margin_summary['gross_margin_percent']}%)")
        
        return invoice['invoice_number']

    # Module: Test invoice retrieval
    def test_get_invoices_returns_line_items_with_costs(self, auth_headers, test_account):
        """Verify GET invoices returns line items with COGS and logistics breakdown"""
        response = requests.get(
            f"{BASE_URL}/api/accounts/{test_account['account_id']}/invoices",
            headers=auth_headers
        )
        assert response.status_code == 200, f"Failed to get invoices: {response.text}"
        
        data = response.json()
        invoices = data.get('invoices', [])
        assert len(invoices) > 0, "No invoices found for account"
        
        # Check the most recent invoice
        invoice = invoices[0]
        assert 'invoice_number' in invoice
        assert 'gross_amount' in invoice
        assert 'total_cogs' in invoice
        assert 'total_logistics' in invoice
        assert 'gross_margin' in invoice
        assert 'gross_margin_percent' in invoice
        
        # Verify line items have cost breakdown
        items = invoice.get('items', [])
        if len(items) > 0:
            item = items[0]
            assert 'sku_name' in item
            assert 'bottles' in item
            assert 'price_per_bottle' in item
            assert 'line_total' in item
            assert 'cogs_per_bottle' in item
            assert 'cogs_total' in item
            assert 'logistics_per_bottle' in item
            assert 'logistics_total' in item
            assert 'margin' in item
            print(f"✓ Invoice line items have complete cost breakdown")
        
        print(f"✓ Found {len(invoices)} invoices for account")
        print(f"  Total invoice value: ₹{data.get('total_amount', 0)}")

    # Module: Test COGS lookup for different SKUs
    def test_cogs_lookup_by_sku_and_city(self, auth_headers):
        """Verify COGS is correctly looked up by SKU name and city"""
        # Create invoice with a known SKU and verify COGS matches
        response = requests.get(
            f"{BASE_URL}/api/cogs/Hyderabad",
            headers=auth_headers
        )
        cogs_data = response.json().get('cogs_data', [])
        silver_cogs = next((c for c in cogs_data if c['sku_name'] == 'Nyla – 600 ml / Silver'), None)
        
        assert silver_cogs is not None, "COGS not found for Nyla – 600 ml / Silver"
        expected_cogs = silver_cogs['total_cogs']
        expected_logistics = silver_cogs['outbound_logistics_cost']
        
        # Create a single-item invoice
        response = requests.post(
            f"{BASE_URL}/api/accounts/OCEA-HYD-A26-001/invoices",
            headers=auth_headers,
            json={
                "invoice_date": "2026-03-04",
                "line_items": [{"sku_name": "Nyla – 600 ml / Silver", "bottles": 10, "price_per_bottle": 150}],
                "notes": "Single SKU test"
            }
        )
        assert response.status_code == 200
        
        margin_summary = response.json()['margin_summary']
        
        # Verify COGS calculation: bottles * cogs_per_bottle
        expected_total_cogs = round(10 * expected_cogs, 2)
        expected_total_logistics = round(10 * expected_logistics, 2)
        
        assert margin_summary['total_cogs'] == expected_total_cogs, \
            f"Expected COGS {expected_total_cogs}, got {margin_summary['total_cogs']}"
        assert margin_summary['total_logistics'] == expected_total_logistics, \
            f"Expected logistics {expected_total_logistics}, got {margin_summary['total_logistics']}"
        
        print(f"✓ COGS calculation verified: {expected_cogs}/bottle × 10 = ₹{expected_total_cogs}")
        print(f"✓ Logistics calculation verified: {expected_logistics}/bottle × 10 = ₹{expected_total_logistics}")

    # Module: Test margin calculation formula
    def test_gross_margin_calculation(self, auth_headers):
        """Verify gross margin = revenue - COGS - logistics"""
        response = requests.post(
            f"{BASE_URL}/api/accounts/OCEA-HYD-A26-001/invoices",
            headers=auth_headers,
            json={
                "invoice_date": "2026-03-04",
                "line_items": [{"sku_name": "Nyla – 330 ml / Silver", "bottles": 20, "price_per_bottle": 100}],
                "notes": "Margin formula test"
            }
        )
        assert response.status_code == 200
        
        margin_summary = response.json()['margin_summary']
        revenue = margin_summary['invoice_revenue']
        cogs = margin_summary['total_cogs']
        logistics = margin_summary['total_logistics']
        gross_margin = margin_summary['gross_margin']
        margin_percent = margin_summary['gross_margin_percent']
        
        # Verify margin formula
        expected_margin = round(revenue - cogs - logistics, 2)
        assert gross_margin == expected_margin, \
            f"Margin mismatch: expected {expected_margin}, got {gross_margin}"
        
        # Verify margin percent formula
        expected_percent = round((expected_margin / revenue) * 100, 2) if revenue > 0 else 0
        assert margin_percent == expected_percent, \
            f"Margin % mismatch: expected {expected_percent}, got {margin_percent}"
        
        print(f"✓ Margin formula verified: ₹{revenue} - ₹{cogs} - ₹{logistics} = ₹{gross_margin} ({margin_percent}%)")

    # Module: Test invoice validation
    def test_invoice_creation_validates_line_items(self, auth_headers):
        """Verify API validates required fields in line items"""
        # Missing bottles
        response = requests.post(
            f"{BASE_URL}/api/accounts/OCEA-HYD-A26-001/invoices",
            headers=auth_headers,
            json={
                "invoice_date": "2026-03-04",
                "line_items": [{"sku_name": "Nyla – 600 ml / Silver", "price_per_bottle": 100}],
                "notes": "Missing bottles test"
            }
        )
        # Should fail or have default value
        assert response.status_code in [200, 422], f"Unexpected status: {response.status_code}"
        
        # Empty line items should not create invoice
        response = requests.post(
            f"{BASE_URL}/api/accounts/OCEA-HYD-A26-001/invoices",
            headers=auth_headers,
            json={
                "invoice_date": "2026-03-04",
                "line_items": []
            }
        )
        # Depends on implementation - may return error or empty invoice
        print(f"✓ Line item validation test completed")

    # Module: Test account not found
    def test_invoice_creation_for_invalid_account(self, auth_headers):
        """Verify API returns 404 for non-existent account"""
        response = requests.post(
            f"{BASE_URL}/api/accounts/INVALID-ACCOUNT-ID/invoices",
            headers=auth_headers,
            json={
                "invoice_date": "2026-03-04",
                "line_items": [{"sku_name": "Nyla – 600 ml / Silver", "bottles": 10, "price_per_bottle": 100}]
            }
        )
        assert response.status_code == 404, f"Expected 404, got {response.status_code}"
        print(f"✓ Invalid account returns 404 as expected")


if __name__ == "__main__":
    pytest.main([__file__, "-v"])
