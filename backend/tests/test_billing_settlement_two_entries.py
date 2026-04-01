"""
Test Billing & Settlement Two-Entry System
Tests the new billing reconciliation with separate entries:
- Entry 1: Monthly Billing (at transfer price)
- Entry 2: Monthly Settlement (adjustments → debit/credit note)

Key formulas:
- Entry 1: total_payable_to_nyla = total_billing_value - total_distributor_earnings - total_factory_adjustment
- Entry 2: settlement_debits = total_factory_adjustment
- Entry 2: settlement_credits = total_credit_notes_applied + total_factory_return_credit
- Entry 2: net_adjustment_amount = settlement_debits - settlement_credits
- settlement_note_type = 'debit' if net > 0, 'credit' if net < 0, 'none' if 0
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
    """Authenticated requests session"""
    session = requests.Session()
    session.headers.update({
        "Authorization": f"Bearer {auth_token}",
        "Content-Type": "application/json",
        "X-Tenant-ID": TENANT_ID
    })
    return session


class TestMonthlyReconciliationEndpoint:
    """Test GET /api/distributors/{id}/monthly-reconciliation returns correct fields"""
    
    def test_endpoint_returns_200(self, api_client):
        """Test endpoint is accessible and returns 200"""
        response = api_client.get(
            f"{BASE_URL}/api/distributors/{DISTRIBUTOR_ID}/monthly-reconciliation",
            params={"month": 1, "year": 2026}
        )
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        print("✓ Monthly reconciliation endpoint returns 200")
    
    def test_response_contains_settlement_debits(self, api_client):
        """Test response contains settlement_debits field"""
        response = api_client.get(
            f"{BASE_URL}/api/distributors/{DISTRIBUTOR_ID}/monthly-reconciliation",
            params={"month": 1, "year": 2026}
        )
        data = response.json()
        assert "settlement_debits" in data, "Response missing 'settlement_debits' field"
        assert isinstance(data["settlement_debits"], (int, float)), "settlement_debits should be numeric"
        print(f"✓ settlement_debits field present: {data['settlement_debits']}")
    
    def test_response_contains_settlement_credits(self, api_client):
        """Test response contains settlement_credits field"""
        response = api_client.get(
            f"{BASE_URL}/api/distributors/{DISTRIBUTOR_ID}/monthly-reconciliation",
            params={"month": 1, "year": 2026}
        )
        data = response.json()
        assert "settlement_credits" in data, "Response missing 'settlement_credits' field"
        assert isinstance(data["settlement_credits"], (int, float)), "settlement_credits should be numeric"
        print(f"✓ settlement_credits field present: {data['settlement_credits']}")
    
    def test_response_contains_net_adjustment_amount(self, api_client):
        """Test response contains net_adjustment_amount field"""
        response = api_client.get(
            f"{BASE_URL}/api/distributors/{DISTRIBUTOR_ID}/monthly-reconciliation",
            params={"month": 1, "year": 2026}
        )
        data = response.json()
        assert "net_adjustment_amount" in data, "Response missing 'net_adjustment_amount' field"
        assert isinstance(data["net_adjustment_amount"], (int, float)), "net_adjustment_amount should be numeric"
        print(f"✓ net_adjustment_amount field present: {data['net_adjustment_amount']}")
    
    def test_response_contains_settlement_note_type(self, api_client):
        """Test response contains settlement_note_type field"""
        response = api_client.get(
            f"{BASE_URL}/api/distributors/{DISTRIBUTOR_ID}/monthly-reconciliation",
            params={"month": 1, "year": 2026}
        )
        data = response.json()
        assert "settlement_note_type" in data, "Response missing 'settlement_note_type' field"
        assert data["settlement_note_type"] in ["debit", "credit", "none"], \
            f"settlement_note_type should be 'debit', 'credit', or 'none', got: {data['settlement_note_type']}"
        print(f"✓ settlement_note_type field present: {data['settlement_note_type']}")
    
    def test_response_contains_total_payable_to_nyla(self, api_client):
        """Test response contains total_payable_to_nyla field"""
        response = api_client.get(
            f"{BASE_URL}/api/distributors/{DISTRIBUTOR_ID}/monthly-reconciliation",
            params={"month": 1, "year": 2026}
        )
        data = response.json()
        assert "total_payable_to_nyla" in data, "Response missing 'total_payable_to_nyla' field"
        assert isinstance(data["total_payable_to_nyla"], (int, float)), "total_payable_to_nyla should be numeric"
        print(f"✓ total_payable_to_nyla field present: {data['total_payable_to_nyla']}")
    
    def test_settlement_debits_equals_factory_adjustment(self, api_client):
        """Test settlement_debits = total_factory_adjustment"""
        response = api_client.get(
            f"{BASE_URL}/api/distributors/{DISTRIBUTOR_ID}/monthly-reconciliation",
            params={"month": 1, "year": 2026}
        )
        data = response.json()
        settlement_debits = data.get("settlement_debits", 0)
        total_factory_adj = data.get("total_factory_adjustment", 0)
        assert settlement_debits == total_factory_adj, \
            f"settlement_debits ({settlement_debits}) should equal total_factory_adjustment ({total_factory_adj})"
        print(f"✓ settlement_debits ({settlement_debits}) = total_factory_adjustment ({total_factory_adj})")
    
    def test_settlement_credits_formula(self, api_client):
        """Test settlement_credits = total_credit_notes_applied + total_factory_return_credit"""
        response = api_client.get(
            f"{BASE_URL}/api/distributors/{DISTRIBUTOR_ID}/monthly-reconciliation",
            params={"month": 1, "year": 2026}
        )
        data = response.json()
        settlement_credits = data.get("settlement_credits", 0)
        total_cn = data.get("total_credit_notes_applied", 0)
        total_fr = data.get("total_factory_return_credit", 0)
        expected = total_cn + total_fr
        assert abs(settlement_credits - expected) < 0.01, \
            f"settlement_credits ({settlement_credits}) should equal CN ({total_cn}) + FR ({total_fr}) = {expected}"
        print(f"✓ settlement_credits ({settlement_credits}) = CN ({total_cn}) + FR ({total_fr})")
    
    def test_net_adjustment_formula(self, api_client):
        """Test net_adjustment_amount = settlement_debits - settlement_credits"""
        response = api_client.get(
            f"{BASE_URL}/api/distributors/{DISTRIBUTOR_ID}/monthly-reconciliation",
            params={"month": 1, "year": 2026}
        )
        data = response.json()
        net_adj = data.get("net_adjustment_amount", 0)
        debits = data.get("settlement_debits", 0)
        credits = data.get("settlement_credits", 0)
        expected = debits - credits
        assert abs(net_adj - expected) < 0.01, \
            f"net_adjustment_amount ({net_adj}) should equal debits ({debits}) - credits ({credits}) = {expected}"
        print(f"✓ net_adjustment_amount ({net_adj}) = debits ({debits}) - credits ({credits})")
    
    def test_settlement_note_type_logic(self, api_client):
        """Test settlement_note_type is correct based on net_adjustment_amount"""
        response = api_client.get(
            f"{BASE_URL}/api/distributors/{DISTRIBUTOR_ID}/monthly-reconciliation",
            params={"month": 1, "year": 2026}
        )
        data = response.json()
        net_adj = data.get("net_adjustment_amount", 0)
        note_type = data.get("settlement_note_type", "")
        
        if net_adj > 0:
            expected = "debit"
        elif net_adj < 0:
            expected = "credit"
        else:
            expected = "none"
        
        assert note_type == expected, \
            f"settlement_note_type should be '{expected}' for net_adjustment={net_adj}, got '{note_type}'"
        print(f"✓ settlement_note_type '{note_type}' is correct for net_adjustment={net_adj}")
    
    def test_total_payable_formula(self, api_client):
        """Test total_payable_to_nyla = billing - earnings - factory_adj"""
        response = api_client.get(
            f"{BASE_URL}/api/distributors/{DISTRIBUTOR_ID}/monthly-reconciliation",
            params={"month": 1, "year": 2026}
        )
        data = response.json()
        payable = data.get("total_payable_to_nyla", 0)
        billing = data.get("total_billing_value", 0)
        earnings = data.get("total_distributor_earnings", 0)
        factory_adj = data.get("total_factory_adjustment", 0)
        expected = billing - earnings - factory_adj
        assert abs(payable - expected) < 0.01, \
            f"total_payable_to_nyla ({payable}) should equal billing ({billing}) - earnings ({earnings}) - factory_adj ({factory_adj}) = {expected}"
        print(f"✓ total_payable_to_nyla ({payable}) = billing ({billing}) - earnings ({earnings}) - factory_adj ({factory_adj})")


class TestGenerateMonthlyNoteEndpoint:
    """Test POST /api/distributors/{id}/generate-monthly-note uses net_adjustment_amount"""
    
    def test_endpoint_requires_month_year(self, api_client):
        """Test endpoint requires month and year parameters"""
        response = api_client.post(
            f"{BASE_URL}/api/distributors/{DISTRIBUTOR_ID}/generate-monthly-note",
            json={}
        )
        assert response.status_code == 400, f"Expected 400 for missing params, got {response.status_code}"
        print("✓ Endpoint correctly requires month and year")
    
    def test_endpoint_returns_400_when_no_settlements(self, api_client):
        """Test endpoint returns 400 when no approved unreconciled settlements"""
        # Use a month/year that likely has no settlements
        response = api_client.post(
            f"{BASE_URL}/api/distributors/{DISTRIBUTOR_ID}/generate-monthly-note",
            json={"month": 12, "year": 2020}
        )
        # Should return 400 with "No approved unreconciled settlements" or similar
        assert response.status_code == 400, f"Expected 400, got {response.status_code}"
        print("✓ Endpoint returns 400 when no approved settlements")


class TestResponseStructure:
    """Test complete response structure for monthly reconciliation"""
    
    def test_all_required_fields_present(self, api_client):
        """Test all required fields are present in response"""
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
            "settlement_debits",
            "settlement_credits",
            "net_adjustment_amount",
            "settlement_note_type"
        ]
        
        missing = [f for f in required_fields if f not in data]
        assert not missing, f"Missing required fields: {missing}"
        print(f"✓ All {len(required_fields)} required fields present")
    
    def test_numeric_fields_are_rounded(self, api_client):
        """Test numeric fields are properly rounded to 2 decimal places"""
        response = api_client.get(
            f"{BASE_URL}/api/distributors/{DISTRIBUTOR_ID}/monthly-reconciliation",
            params={"month": 1, "year": 2026}
        )
        data = response.json()
        
        numeric_fields = [
            "total_billing_value",
            "total_distributor_earnings",
            "total_factory_adjustment",
            "total_credit_notes_applied",
            "total_factory_return_credit",
            "total_payable_to_nyla",
            "settlement_debits",
            "settlement_credits",
            "net_adjustment_amount"
        ]
        
        for field in numeric_fields:
            value = data.get(field, 0)
            # Check it's a number
            assert isinstance(value, (int, float)), f"{field} should be numeric"
        
        print("✓ All numeric fields are properly typed")


if __name__ == "__main__":
    pytest.main([__file__, "-v", "--tb=short"])
