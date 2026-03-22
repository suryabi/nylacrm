"""
Test Monthly Reconciliation Endpoints
Tests for the redesigned Billing & Reconciliation module:
- GET /api/distributors/{id}/monthly-reconciliation - Get settlements for a month
- POST /api/distributors/{id}/generate-monthly-note - Generate Debit/Credit Note
"""
import pytest
import requests
import os

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', '').rstrip('/')
DISTRIBUTOR_ID = "99fb55dc-532c-4e85-b618-6b8a5e552c04"
TENANT_ID = "nyla-air-water"


@pytest.fixture(scope="module")
def auth_token():
    """Get authentication token"""
    response = requests.post(
        f"{BASE_URL}/api/auth/login",
        json={
            "email": "surya.yadavalli@nylaairwater.earth",
            "password": "test123"
        },
        headers={"X-Tenant-ID": TENANT_ID}
    )
    if response.status_code == 200:
        data = response.json()
        # API returns session_token, not token
        return data.get("session_token") or data.get("token")
    pytest.skip(f"Authentication failed: {response.status_code} - {response.text}")


@pytest.fixture(scope="module")
def auth_headers(auth_token):
    """Get headers with auth token"""
    return {
        "Authorization": f"Bearer {auth_token}",
        "X-Tenant-ID": TENANT_ID,
        "Content-Type": "application/json"
    }


class TestMonthlyReconciliationEndpoint:
    """Tests for GET /api/distributors/{id}/monthly-reconciliation"""
    
    def test_get_monthly_reconciliation_march_2026(self, auth_headers):
        """Test getting monthly reconciliation data for March 2026"""
        response = requests.get(
            f"{BASE_URL}/api/distributors/{DISTRIBUTOR_ID}/monthly-reconciliation",
            params={"month": 3, "year": 2026},
            headers=auth_headers
        )
        
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        
        data = response.json()
        
        # Verify response structure
        assert "settlements" in data, "Response should contain 'settlements'"
        assert "total_settlements" in data, "Response should contain 'total_settlements'"
        assert "total_billing_value" in data, "Response should contain 'total_billing_value'"
        assert "total_distributor_earnings" in data, "Response should contain 'total_distributor_earnings'"
        assert "total_margin_at_transfer" in data, "Response should contain 'total_margin_at_transfer'"
        assert "net_adjustment" in data, "Response should contain 'net_adjustment'"
        assert "existing_note" in data, "Response should contain 'existing_note'"
        
        print(f"Monthly reconciliation for March 2026:")
        print(f"  Total settlements: {data['total_settlements']}")
        print(f"  Total billing value: ₹{data['total_billing_value']}")
        print(f"  Total distributor earnings: ₹{data['total_distributor_earnings']}")
        print(f"  Total margin at transfer: ₹{data['total_margin_at_transfer']}")
        print(f"  Net adjustment: ₹{data['net_adjustment']}")
        print(f"  Existing note: {data['existing_note']}")
        
        # Verify settlements array
        assert isinstance(data['settlements'], list), "settlements should be a list"
        
        # If there are settlements, verify their structure
        if data['settlements']:
            settlement = data['settlements'][0]
            print(f"\n  Sample settlement: {settlement.get('settlement_number')}")
            print(f"    Account: {settlement.get('account_name')}")
            print(f"    Billing value: ₹{settlement.get('total_billing_value', 0)}")
            print(f"    Distributor earnings: ₹{settlement.get('distributor_earnings', 0)}")
            print(f"    Adjustment: ₹{settlement.get('adjustment_payable', 0)}")
    
    def test_get_monthly_reconciliation_empty_month(self, auth_headers):
        """Test getting monthly reconciliation for a month with no settlements"""
        response = requests.get(
            f"{BASE_URL}/api/distributors/{DISTRIBUTOR_ID}/monthly-reconciliation",
            params={"month": 1, "year": 2020},  # Old date with no data
            headers=auth_headers
        )
        
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        
        data = response.json()
        assert data['total_settlements'] == 0, "Should have 0 settlements for empty month"
        assert data['settlements'] == [], "Settlements should be empty list"
        assert data['net_adjustment'] == 0, "Net adjustment should be 0"
        print("Empty month test passed - returns 0 settlements correctly")
    
    def test_get_monthly_reconciliation_invalid_distributor(self, auth_headers):
        """Test getting monthly reconciliation for non-existent distributor"""
        response = requests.get(
            f"{BASE_URL}/api/distributors/invalid-distributor-id/monthly-reconciliation",
            params={"month": 3, "year": 2026},
            headers=auth_headers
        )
        
        # Should return 200 with empty data (not 404) since it's a query
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        data = response.json()
        assert data['total_settlements'] == 0, "Should have 0 settlements for invalid distributor"
        print("Invalid distributor test passed - returns empty data")
    
    def test_get_monthly_reconciliation_requires_auth(self):
        """Test that endpoint requires authentication"""
        response = requests.get(
            f"{BASE_URL}/api/distributors/{DISTRIBUTOR_ID}/monthly-reconciliation",
            params={"month": 3, "year": 2026}
        )
        
        assert response.status_code == 401, f"Expected 401, got {response.status_code}"
        print("Auth required test passed")


class TestGenerateMonthlyNoteEndpoint:
    """Tests for POST /api/distributors/{id}/generate-monthly-note"""
    
    def test_generate_note_requires_auth(self):
        """Test that endpoint requires authentication"""
        response = requests.post(
            f"{BASE_URL}/api/distributors/{DISTRIBUTOR_ID}/generate-monthly-note",
            json={"month": 3, "year": 2026}
        )
        
        assert response.status_code == 401, f"Expected 401, got {response.status_code}"
        print("Auth required test passed")
    
    def test_generate_note_requires_month_year(self, auth_headers):
        """Test that month and year are required"""
        response = requests.post(
            f"{BASE_URL}/api/distributors/{DISTRIBUTOR_ID}/generate-monthly-note",
            json={},
            headers=auth_headers
        )
        
        assert response.status_code == 400, f"Expected 400, got {response.status_code}: {response.text}"
        print("Month/year required test passed")
    
    def test_generate_note_no_settlements(self, auth_headers):
        """Test generating note for month with no settlements"""
        response = requests.post(
            f"{BASE_URL}/api/distributors/{DISTRIBUTOR_ID}/generate-monthly-note",
            json={"month": 1, "year": 2020},  # Old date with no data
            headers=auth_headers
        )
        
        assert response.status_code == 400, f"Expected 400, got {response.status_code}: {response.text}"
        data = response.json()
        assert "No settlements found" in data.get('detail', ''), f"Expected 'No settlements found' error, got: {data}"
        print("No settlements test passed")
    
    def test_generate_note_for_march_2026(self, auth_headers):
        """Test generating note for March 2026 (if settlements exist)"""
        # First check if there are settlements
        recon_response = requests.get(
            f"{BASE_URL}/api/distributors/{DISTRIBUTOR_ID}/monthly-reconciliation",
            params={"month": 3, "year": 2026},
            headers=auth_headers
        )
        
        recon_data = recon_response.json()
        
        if recon_data['total_settlements'] == 0:
            pytest.skip("No settlements for March 2026 - skipping note generation test")
        
        if recon_data['existing_note']:
            print(f"Note already exists: {recon_data['existing_note']['note_number']}")
            # Test that duplicate note creation fails
            response = requests.post(
                f"{BASE_URL}/api/distributors/{DISTRIBUTOR_ID}/generate-monthly-note",
                json={"month": 3, "year": 2026, "remarks": "Test note"},
                headers=auth_headers
            )
            assert response.status_code == 400, f"Expected 400 for duplicate note, got {response.status_code}"
            assert "already exists" in response.json().get('detail', '').lower()
            print("Duplicate note prevention test passed")
            return
        
        if recon_data['net_adjustment'] == 0:
            # Test that zero adjustment fails
            response = requests.post(
                f"{BASE_URL}/api/distributors/{DISTRIBUTOR_ID}/generate-monthly-note",
                json={"month": 3, "year": 2026},
                headers=auth_headers
            )
            assert response.status_code == 400, f"Expected 400 for zero adjustment, got {response.status_code}"
            print("Zero adjustment test passed")
            return
        
        # Generate the note
        response = requests.post(
            f"{BASE_URL}/api/distributors/{DISTRIBUTOR_ID}/generate-monthly-note",
            json={"month": 3, "year": 2026, "remarks": "Test monthly reconciliation note"},
            headers=auth_headers
        )
        
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        
        data = response.json()
        
        # Verify response structure
        assert "id" in data, "Response should contain 'id'"
        assert "note_number" in data, "Response should contain 'note_number'"
        assert "note_type" in data, "Response should contain 'note_type'"
        assert "amount" in data, "Response should contain 'amount'"
        assert "month" in data, "Response should contain 'month'"
        assert "year" in data, "Response should contain 'year'"
        
        print(f"Generated note: {data['note_number']}")
        print(f"  Type: {data['note_type']}")
        print(f"  Amount: ₹{data['amount']}")
        print(f"  Month/Year: {data['month']}/{data['year']}")
        print(f"  Total settlements: {data.get('total_settlements', 'N/A')}")
        
        # Verify note type matches adjustment sign
        if recon_data['net_adjustment'] >= 0:
            assert data['note_type'] == 'credit', f"Expected credit note for positive adjustment, got {data['note_type']}"
        else:
            assert data['note_type'] == 'debit', f"Expected debit note for negative adjustment, got {data['note_type']}"


class TestDebitCreditNotesEndpoint:
    """Tests for GET /api/distributors/{id}/debit-credit-notes"""
    
    def test_list_notes(self, auth_headers):
        """Test listing debit/credit notes"""
        response = requests.get(
            f"{BASE_URL}/api/distributors/{DISTRIBUTOR_ID}/debit-credit-notes",
            headers=auth_headers
        )
        
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        
        data = response.json()
        assert "notes" in data, "Response should contain 'notes'"
        
        print(f"Found {len(data['notes'])} debit/credit notes")
        
        for note in data['notes'][:5]:  # Show first 5
            print(f"  {note.get('note_number')}: {note.get('note_type')} - ₹{note.get('amount')} ({note.get('status')})")


class TestSettlementsEndpoint:
    """Tests for settlements endpoint to verify data exists"""
    
    def test_list_settlements(self, auth_headers):
        """Test listing settlements for the distributor"""
        response = requests.get(
            f"{BASE_URL}/api/distributors/{DISTRIBUTOR_ID}/settlements",
            headers=auth_headers
        )
        
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        
        data = response.json()
        assert "settlements" in data, "Response should contain 'settlements'"
        
        print(f"Found {len(data['settlements'])} total settlements")
        
        # Check for March 2026 settlements
        march_2026_settlements = [
            s for s in data['settlements'] 
            if s.get('settlement_month') == 3 and s.get('settlement_year') == 2026
        ]
        
        print(f"March 2026 settlements: {len(march_2026_settlements)}")
        
        for s in march_2026_settlements:
            print(f"  {s.get('settlement_number')}: {s.get('account_name')}")
            print(f"    Billing: ₹{s.get('total_billing_value', 0)}")
            print(f"    Earnings: ₹{s.get('distributor_earnings', 0)}")
            print(f"    Adjustment: ₹{s.get('adjustment_payable', 0)}")


if __name__ == "__main__":
    pytest.main([__file__, "-v", "--tb=short"])
