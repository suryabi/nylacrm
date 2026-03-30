"""
Test Billing/Reconciliation Tab - Transfer Price Based Reconciliation
Tests for:
- GET /api/distributors/{id}/monthly-reconciliation - new fields
- POST /api/distributors/{id}/generate-monthly-note - uses net_settlement
- Formula: total_payable_to_nyla = total_billing_value - total_distributor_earnings - total_factory_adjustment
- net_settlement = total_payable_to_nyla - total_credit_notes_applied - total_factory_return_credit
- settlement_note_type: 'debit' if net > 0, 'credit' if net < 0, 'none' if 0
"""
import pytest
import requests
import os

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', '').rstrip('/')
TEST_EMAIL = "surya.yadavalli@nylaairwater.earth"
TEST_PASSWORD = "test123"
TENANT_ID = "nyla-air-water"
DISTRIBUTOR_ID = "99fb55dc-532c-4e85-b618-6b8a5e552c04"


@pytest.fixture(scope="module")
def auth_token():
    """Get authentication token"""
    response = requests.post(
        f"{BASE_URL}/api/auth/login",
        json={"email": TEST_EMAIL, "password": TEST_PASSWORD},
        headers={"X-Tenant-ID": TENANT_ID}
    )
    if response.status_code == 200:
        data = response.json()
        # API returns session_token, not token
        return data.get("session_token") or data.get("token")
    pytest.skip(f"Authentication failed: {response.status_code} - {response.text}")


@pytest.fixture(scope="module")
def api_client(auth_token):
    """Shared requests session with auth"""
    session = requests.Session()
    session.headers.update({
        "Content-Type": "application/json",
        "Authorization": f"Bearer {auth_token}",
        "X-Tenant-ID": TENANT_ID
    })
    return session


class TestMonthlyReconciliationEndpoint:
    """Tests for GET /api/distributors/{id}/monthly-reconciliation"""
    
    def test_monthly_reconciliation_returns_200(self, api_client):
        """Test endpoint returns 200 status"""
        response = api_client.get(
            f"{BASE_URL}/api/distributors/{DISTRIBUTOR_ID}/monthly-reconciliation",
            params={"month": 1, "year": 2026}
        )
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        print("✓ Monthly reconciliation endpoint returns 200")
    
    def test_monthly_reconciliation_has_total_payable_to_nyla(self, api_client):
        """Test response contains total_payable_to_nyla field"""
        response = api_client.get(
            f"{BASE_URL}/api/distributors/{DISTRIBUTOR_ID}/monthly-reconciliation",
            params={"month": 1, "year": 2026}
        )
        data = response.json()
        assert "total_payable_to_nyla" in data, f"Missing total_payable_to_nyla field. Keys: {data.keys()}"
        assert isinstance(data["total_payable_to_nyla"], (int, float)), "total_payable_to_nyla should be numeric"
        print(f"✓ total_payable_to_nyla present: {data['total_payable_to_nyla']}")
    
    def test_monthly_reconciliation_has_net_settlement(self, api_client):
        """Test response contains net_settlement field"""
        response = api_client.get(
            f"{BASE_URL}/api/distributors/{DISTRIBUTOR_ID}/monthly-reconciliation",
            params={"month": 1, "year": 2026}
        )
        data = response.json()
        assert "net_settlement" in data, f"Missing net_settlement field. Keys: {data.keys()}"
        assert isinstance(data["net_settlement"], (int, float)), "net_settlement should be numeric"
        print(f"✓ net_settlement present: {data['net_settlement']}")
    
    def test_monthly_reconciliation_has_settlement_note_type(self, api_client):
        """Test response contains settlement_note_type field"""
        response = api_client.get(
            f"{BASE_URL}/api/distributors/{DISTRIBUTOR_ID}/monthly-reconciliation",
            params={"month": 1, "year": 2026}
        )
        data = response.json()
        assert "settlement_note_type" in data, f"Missing settlement_note_type field. Keys: {data.keys()}"
        assert data["settlement_note_type"] in ["debit", "credit", "none"], f"Invalid settlement_note_type: {data['settlement_note_type']}"
        print(f"✓ settlement_note_type present: {data['settlement_note_type']}")
    
    def test_monthly_reconciliation_has_reconciled_payable_to_nyla(self, api_client):
        """Test response contains reconciled_payable_to_nyla field"""
        response = api_client.get(
            f"{BASE_URL}/api/distributors/{DISTRIBUTOR_ID}/monthly-reconciliation",
            params={"month": 1, "year": 2026}
        )
        data = response.json()
        assert "reconciled_payable_to_nyla" in data, f"Missing reconciled_payable_to_nyla field. Keys: {data.keys()}"
        assert isinstance(data["reconciled_payable_to_nyla"], (int, float)), "reconciled_payable_to_nyla should be numeric"
        print(f"✓ reconciled_payable_to_nyla present: {data['reconciled_payable_to_nyla']}")
    
    def test_monthly_reconciliation_formula_calculation(self, api_client):
        """Test formula: total_payable_to_nyla = total_billing_value - total_distributor_earnings - total_factory_adjustment"""
        response = api_client.get(
            f"{BASE_URL}/api/distributors/{DISTRIBUTOR_ID}/monthly-reconciliation",
            params={"month": 1, "year": 2026}
        )
        data = response.json()
        
        # Get values
        total_billing = data.get("total_billing_value", 0)
        total_earnings = data.get("total_distributor_earnings", 0)
        total_factory_adj = data.get("total_factory_adjustment", 0)
        total_payable = data.get("total_payable_to_nyla", 0)
        
        # Calculate expected
        expected_payable = total_billing - total_earnings - total_factory_adj
        
        # Allow small floating point difference
        assert abs(total_payable - expected_payable) < 0.01, \
            f"Formula mismatch: {total_payable} != {total_billing} - {total_earnings} - {total_factory_adj} = {expected_payable}"
        print(f"✓ Formula verified: {total_billing} - {total_earnings} - {total_factory_adj} = {total_payable}")
    
    def test_monthly_reconciliation_net_settlement_formula(self, api_client):
        """Test formula: net_settlement = total_payable_to_nyla - total_credit_notes_applied - total_factory_return_credit"""
        response = api_client.get(
            f"{BASE_URL}/api/distributors/{DISTRIBUTOR_ID}/monthly-reconciliation",
            params={"month": 1, "year": 2026}
        )
        data = response.json()
        
        # Get values
        total_payable = data.get("total_payable_to_nyla", 0)
        total_credit_notes = data.get("total_credit_notes_applied", 0)
        total_factory_returns = data.get("total_factory_return_credit", 0)
        net_settlement = data.get("net_settlement", 0)
        
        # Calculate expected
        expected_net = total_payable - total_credit_notes - total_factory_returns
        
        # Allow small floating point difference
        assert abs(net_settlement - expected_net) < 0.01, \
            f"Net settlement formula mismatch: {net_settlement} != {total_payable} - {total_credit_notes} - {total_factory_returns} = {expected_net}"
        print(f"✓ Net settlement formula verified: {total_payable} - {total_credit_notes} - {total_factory_returns} = {net_settlement}")
    
    def test_settlement_note_type_logic(self, api_client):
        """Test settlement_note_type: 'debit' if net > 0, 'credit' if net < 0, 'none' if 0"""
        response = api_client.get(
            f"{BASE_URL}/api/distributors/{DISTRIBUTOR_ID}/monthly-reconciliation",
            params={"month": 1, "year": 2026}
        )
        data = response.json()
        
        net_settlement = data.get("net_settlement", 0)
        note_type = data.get("settlement_note_type")
        
        if net_settlement > 0:
            assert note_type == "debit", f"Expected 'debit' for positive net ({net_settlement}), got '{note_type}'"
        elif net_settlement < 0:
            assert note_type == "credit", f"Expected 'credit' for negative net ({net_settlement}), got '{note_type}'"
        else:
            assert note_type == "none", f"Expected 'none' for zero net ({net_settlement}), got '{note_type}'"
        
        print(f"✓ settlement_note_type logic verified: net={net_settlement} → type={note_type}")
    
    def test_monthly_reconciliation_has_all_required_fields(self, api_client):
        """Test response contains all required fields for transfer-price reconciliation"""
        response = api_client.get(
            f"{BASE_URL}/api/distributors/{DISTRIBUTOR_ID}/monthly-reconciliation",
            params={"month": 1, "year": 2026}
        )
        data = response.json()
        
        required_fields = [
            "unreconciled_settlements",
            "reconciled_settlements",
            "total_unreconciled",
            "total_reconciled",
            "total_billing_value",
            "total_distributor_earnings",
            "total_factory_adjustment",
            "total_credit_notes_applied",
            "total_factory_return_credit",
            "total_payable_to_nyla",
            "net_settlement",
            "settlement_note_type",
            "reconciled_payable_to_nyla"
        ]
        
        missing = [f for f in required_fields if f not in data]
        assert not missing, f"Missing required fields: {missing}"
        print(f"✓ All {len(required_fields)} required fields present")


class TestGenerateMonthlyNoteEndpoint:
    """Tests for POST /api/distributors/{id}/generate-monthly-note"""
    
    def test_generate_note_requires_month_year(self, api_client):
        """Test endpoint requires month and year parameters"""
        response = api_client.post(
            f"{BASE_URL}/api/distributors/{DISTRIBUTOR_ID}/generate-monthly-note",
            json={}
        )
        assert response.status_code == 400, f"Expected 400 for missing params, got {response.status_code}"
        print("✓ Generate note requires month and year")
    
    def test_generate_note_returns_error_when_no_settlements(self, api_client):
        """Test endpoint returns 400 when no approved unreconciled settlements exist"""
        # Use a month/year that likely has no data
        response = api_client.post(
            f"{BASE_URL}/api/distributors/{DISTRIBUTOR_ID}/generate-monthly-note",
            json={"month": 12, "year": 2020}
        )
        # Should return 400 with "No approved unreconciled settlements found"
        assert response.status_code == 400, f"Expected 400, got {response.status_code}: {response.text}"
        data = response.json()
        assert "detail" in data
        print(f"✓ Returns error when no settlements: {data.get('detail')}")


class TestMonthlyReconciliationDifferentMonths:
    """Test monthly reconciliation for different months"""
    
    @pytest.mark.parametrize("month,year", [
        (1, 2026),
        (6, 2025),
        (12, 2025),
    ])
    def test_monthly_reconciliation_different_periods(self, api_client, month, year):
        """Test endpoint works for different month/year combinations"""
        response = api_client.get(
            f"{BASE_URL}/api/distributors/{DISTRIBUTOR_ID}/monthly-reconciliation",
            params={"month": month, "year": year}
        )
        assert response.status_code == 200, f"Failed for {month}/{year}: {response.status_code}"
        data = response.json()
        
        # Verify structure
        assert "total_payable_to_nyla" in data
        assert "net_settlement" in data
        assert "settlement_note_type" in data
        print(f"✓ Monthly reconciliation works for {month}/{year}")


class TestEmptyStateReconciliation:
    """Test reconciliation with no data (empty state)"""
    
    def test_empty_state_returns_zeros(self, api_client):
        """Test that empty state returns zero values correctly"""
        response = api_client.get(
            f"{BASE_URL}/api/distributors/{DISTRIBUTOR_ID}/monthly-reconciliation",
            params={"month": 1, "year": 2026}
        )
        data = response.json()
        
        # If no settlements, all values should be 0
        if data.get("total_unreconciled", 0) == 0:
            assert data.get("total_payable_to_nyla") == 0, "Expected 0 payable when no settlements"
            assert data.get("net_settlement") == 0, "Expected 0 net settlement when no settlements"
            assert data.get("settlement_note_type") == "none", "Expected 'none' note type when no settlements"
            print("✓ Empty state returns zeros correctly")
        else:
            print(f"✓ Has {data.get('total_unreconciled')} unreconciled settlements - skipping empty state test")


if __name__ == "__main__":
    pytest.main([__file__, "-v"])
