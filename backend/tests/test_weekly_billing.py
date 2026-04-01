"""
Test Weekly Billing Breakdown Feature
Tests the weekly_billing array in GET /api/distributors/{id}/monthly-reconciliation
- Verifies weekly breakdown structure (week number, start_day, end_day, label, amount, deliveries)
- Tests March 2026 returns 5 weeks (29-31 as week 5)
- Tests February 2026 returns 4 weeks (ending at 28)
- Verifies weekly amounts sum to total_at_transfer_price
"""
import pytest
import requests
import os
import calendar

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', '').rstrip('/')
TENANT_ID = "nyla-air-water"
TEST_EMAIL = "surya.yadavalli@nylaairwater.earth"
TEST_PASSWORD = "test123"
TEST_DISTRIBUTOR_ID = "99fb55dc-532c-4e85-b618-6b8a5e552c04"


@pytest.fixture(scope="module")
def auth_token():
    """Get authentication token"""
    response = requests.post(
        f"{BASE_URL}/api/auth/login",
        json={"email": TEST_EMAIL, "password": TEST_PASSWORD},
        headers={"X-Tenant-ID": TENANT_ID}
    )
    if response.status_code == 200:
        # API returns session_token, not token
        return response.json().get("session_token")
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


class TestWeeklyBillingStructure:
    """Test weekly_billing array structure in monthly-reconciliation endpoint"""
    
    def test_monthly_reconciliation_returns_weekly_billing_array(self, api_client):
        """Verify endpoint returns weekly_billing array"""
        response = api_client.get(
            f"{BASE_URL}/api/distributors/{TEST_DISTRIBUTOR_ID}/monthly-reconciliation",
            params={"month": 3, "year": 2026}
        )
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        
        data = response.json()
        assert "weekly_billing" in data, "Response must contain weekly_billing array"
        assert isinstance(data["weekly_billing"], list), "weekly_billing must be a list"
    
    def test_weekly_billing_has_required_fields(self, api_client):
        """Each week entry must have: week, start_day, end_day, label, amount, deliveries"""
        response = api_client.get(
            f"{BASE_URL}/api/distributors/{TEST_DISTRIBUTOR_ID}/monthly-reconciliation",
            params={"month": 3, "year": 2026}
        )
        assert response.status_code == 200
        
        data = response.json()
        weekly_billing = data.get("weekly_billing", [])
        assert len(weekly_billing) > 0, "weekly_billing should have at least one week"
        
        required_fields = ["week", "start_day", "end_day", "label", "amount", "deliveries"]
        for week in weekly_billing:
            for field in required_fields:
                assert field in week, f"Week entry missing required field: {field}"
    
    def test_weekly_billing_field_types(self, api_client):
        """Verify field types: week/start_day/end_day/deliveries are int, amount is number, label is string"""
        response = api_client.get(
            f"{BASE_URL}/api/distributors/{TEST_DISTRIBUTOR_ID}/monthly-reconciliation",
            params={"month": 3, "year": 2026}
        )
        assert response.status_code == 200
        
        data = response.json()
        for week in data.get("weekly_billing", []):
            assert isinstance(week["week"], int), f"week should be int, got {type(week['week'])}"
            assert isinstance(week["start_day"], int), f"start_day should be int, got {type(week['start_day'])}"
            assert isinstance(week["end_day"], int), f"end_day should be int, got {type(week['end_day'])}"
            assert isinstance(week["deliveries"], int), f"deliveries should be int, got {type(week['deliveries'])}"
            assert isinstance(week["amount"], (int, float)), f"amount should be number, got {type(week['amount'])}"
            assert isinstance(week["label"], str), f"label should be string, got {type(week['label'])}"


class TestWeeklyBillingMarch2026:
    """Test March 2026 returns 5 weeks (29-31 as week 5)"""
    
    def test_march_2026_has_5_weeks(self, api_client):
        """March 2026 has 31 days, should return 5 weeks"""
        response = api_client.get(
            f"{BASE_URL}/api/distributors/{TEST_DISTRIBUTOR_ID}/monthly-reconciliation",
            params={"month": 3, "year": 2026}
        )
        assert response.status_code == 200
        
        data = response.json()
        weekly_billing = data.get("weekly_billing", [])
        assert len(weekly_billing) == 5, f"March 2026 should have 5 weeks, got {len(weekly_billing)}"
    
    def test_march_2026_week_ranges(self, api_client):
        """Verify March 2026 week ranges: 1-7, 8-14, 15-21, 22-28, 29-31"""
        response = api_client.get(
            f"{BASE_URL}/api/distributors/{TEST_DISTRIBUTOR_ID}/monthly-reconciliation",
            params={"month": 3, "year": 2026}
        )
        assert response.status_code == 200
        
        data = response.json()
        weekly_billing = data.get("weekly_billing", [])
        
        expected_ranges = [
            {"week": 1, "start_day": 1, "end_day": 7},
            {"week": 2, "start_day": 8, "end_day": 14},
            {"week": 3, "start_day": 15, "end_day": 21},
            {"week": 4, "start_day": 22, "end_day": 28},
            {"week": 5, "start_day": 29, "end_day": 31}
        ]
        
        for i, expected in enumerate(expected_ranges):
            actual = weekly_billing[i]
            assert actual["week"] == expected["week"], f"Week {i+1}: expected week={expected['week']}, got {actual['week']}"
            assert actual["start_day"] == expected["start_day"], f"Week {i+1}: expected start_day={expected['start_day']}, got {actual['start_day']}"
            assert actual["end_day"] == expected["end_day"], f"Week {i+1}: expected end_day={expected['end_day']}, got {actual['end_day']}"
    
    def test_march_2026_week_labels(self, api_client):
        """Verify March 2026 week labels contain 'Mar' abbreviation"""
        response = api_client.get(
            f"{BASE_URL}/api/distributors/{TEST_DISTRIBUTOR_ID}/monthly-reconciliation",
            params={"month": 3, "year": 2026}
        )
        assert response.status_code == 200
        
        data = response.json()
        for week in data.get("weekly_billing", []):
            assert "Mar" in week["label"], f"Week label should contain 'Mar': {week['label']}"
            assert f"Week {week['week']}" in week["label"], f"Week label should contain 'Week {week['week']}': {week['label']}"


class TestWeeklyBillingFebruary2026:
    """Test February 2026 returns 4 weeks (ending at 28)"""
    
    def test_february_2026_has_4_weeks(self, api_client):
        """February 2026 has 28 days (non-leap year), should return 4 weeks"""
        # 2026 is not a leap year
        days_in_feb = calendar.monthrange(2026, 2)[1]
        assert days_in_feb == 28, f"February 2026 should have 28 days, got {days_in_feb}"
        
        response = api_client.get(
            f"{BASE_URL}/api/distributors/{TEST_DISTRIBUTOR_ID}/monthly-reconciliation",
            params={"month": 2, "year": 2026}
        )
        assert response.status_code == 200
        
        data = response.json()
        weekly_billing = data.get("weekly_billing", [])
        assert len(weekly_billing) == 4, f"February 2026 should have 4 weeks, got {len(weekly_billing)}"
    
    def test_february_2026_week_ranges(self, api_client):
        """Verify February 2026 week ranges: 1-7, 8-14, 15-21, 22-28"""
        response = api_client.get(
            f"{BASE_URL}/api/distributors/{TEST_DISTRIBUTOR_ID}/monthly-reconciliation",
            params={"month": 2, "year": 2026}
        )
        assert response.status_code == 200
        
        data = response.json()
        weekly_billing = data.get("weekly_billing", [])
        
        expected_ranges = [
            {"week": 1, "start_day": 1, "end_day": 7},
            {"week": 2, "start_day": 8, "end_day": 14},
            {"week": 3, "start_day": 15, "end_day": 21},
            {"week": 4, "start_day": 22, "end_day": 28}
        ]
        
        for i, expected in enumerate(expected_ranges):
            actual = weekly_billing[i]
            assert actual["week"] == expected["week"], f"Week {i+1}: expected week={expected['week']}, got {actual['week']}"
            assert actual["start_day"] == expected["start_day"], f"Week {i+1}: expected start_day={expected['start_day']}, got {actual['start_day']}"
            assert actual["end_day"] == expected["end_day"], f"Week {i+1}: expected end_day={expected['end_day']}, got {actual['end_day']}"
    
    def test_february_2026_last_week_ends_at_28(self, api_client):
        """Verify February 2026 last week ends at day 28"""
        response = api_client.get(
            f"{BASE_URL}/api/distributors/{TEST_DISTRIBUTOR_ID}/monthly-reconciliation",
            params={"month": 2, "year": 2026}
        )
        assert response.status_code == 200
        
        data = response.json()
        weekly_billing = data.get("weekly_billing", [])
        last_week = weekly_billing[-1]
        assert last_week["end_day"] == 28, f"February 2026 last week should end at 28, got {last_week['end_day']}"


class TestWeeklyBillingAmounts:
    """Test weekly amounts sum to total_at_transfer_price"""
    
    def test_weekly_amounts_sum_to_total(self, api_client):
        """Sum of weekly amounts should equal total_at_transfer_price"""
        response = api_client.get(
            f"{BASE_URL}/api/distributors/{TEST_DISTRIBUTOR_ID}/monthly-reconciliation",
            params={"month": 3, "year": 2026}
        )
        assert response.status_code == 200
        
        data = response.json()
        weekly_billing = data.get("weekly_billing", [])
        total_at_transfer_price = data.get("total_at_transfer_price", 0)
        
        weekly_sum = sum(week.get("amount", 0) for week in weekly_billing)
        
        # Allow small floating point tolerance
        assert abs(weekly_sum - total_at_transfer_price) < 0.01, \
            f"Weekly sum ({weekly_sum}) should equal total_at_transfer_price ({total_at_transfer_price})"
    
    def test_weekly_amounts_are_non_negative(self, api_client):
        """All weekly amounts should be >= 0"""
        response = api_client.get(
            f"{BASE_URL}/api/distributors/{TEST_DISTRIBUTOR_ID}/monthly-reconciliation",
            params={"month": 3, "year": 2026}
        )
        assert response.status_code == 200
        
        data = response.json()
        for week in data.get("weekly_billing", []):
            assert week["amount"] >= 0, f"Week {week['week']} amount should be >= 0, got {week['amount']}"
    
    def test_weekly_deliveries_are_non_negative(self, api_client):
        """All weekly delivery counts should be >= 0"""
        response = api_client.get(
            f"{BASE_URL}/api/distributors/{TEST_DISTRIBUTOR_ID}/monthly-reconciliation",
            params={"month": 3, "year": 2026}
        )
        assert response.status_code == 200
        
        data = response.json()
        for week in data.get("weekly_billing", []):
            assert week["deliveries"] >= 0, f"Week {week['week']} deliveries should be >= 0, got {week['deliveries']}"


class TestWeeklyBillingEmptyState:
    """Test weekly billing with no settlements (empty state)"""
    
    def test_empty_state_returns_weeks_with_zero_amounts(self, api_client):
        """When no settlements exist, weeks should still be returned with 0 amounts"""
        # Use a future month that likely has no data
        response = api_client.get(
            f"{BASE_URL}/api/distributors/{TEST_DISTRIBUTOR_ID}/monthly-reconciliation",
            params={"month": 12, "year": 2030}
        )
        assert response.status_code == 200
        
        data = response.json()
        weekly_billing = data.get("weekly_billing", [])
        
        # December has 31 days, should have 5 weeks
        assert len(weekly_billing) == 5, f"December should have 5 weeks, got {len(weekly_billing)}"
        
        # All amounts should be 0
        for week in weekly_billing:
            assert week["amount"] == 0, f"Week {week['week']} amount should be 0 in empty state, got {week['amount']}"
            assert week["deliveries"] == 0, f"Week {week['week']} deliveries should be 0 in empty state, got {week['deliveries']}"


class TestWeeklyBillingOtherMonths:
    """Test weekly billing for various month lengths"""
    
    def test_january_2026_has_5_weeks(self, api_client):
        """January 2026 has 31 days, should return 5 weeks (29-31 as week 5)"""
        response = api_client.get(
            f"{BASE_URL}/api/distributors/{TEST_DISTRIBUTOR_ID}/monthly-reconciliation",
            params={"month": 1, "year": 2026}
        )
        assert response.status_code == 200
        
        data = response.json()
        weekly_billing = data.get("weekly_billing", [])
        assert len(weekly_billing) == 5, f"January 2026 should have 5 weeks, got {len(weekly_billing)}"
        
        # Last week should be 29-31
        last_week = weekly_billing[-1]
        assert last_week["start_day"] == 29, f"January week 5 should start at 29, got {last_week['start_day']}"
        assert last_week["end_day"] == 31, f"January week 5 should end at 31, got {last_week['end_day']}"
    
    def test_april_2026_has_5_weeks(self, api_client):
        """April 2026 has 30 days, should return 5 weeks (29-30 as week 5)"""
        response = api_client.get(
            f"{BASE_URL}/api/distributors/{TEST_DISTRIBUTOR_ID}/monthly-reconciliation",
            params={"month": 4, "year": 2026}
        )
        assert response.status_code == 200
        
        data = response.json()
        weekly_billing = data.get("weekly_billing", [])
        assert len(weekly_billing) == 5, f"April 2026 should have 5 weeks, got {len(weekly_billing)}"
        
        # Last week should be 29-30
        last_week = weekly_billing[-1]
        assert last_week["start_day"] == 29, f"April week 5 should start at 29, got {last_week['start_day']}"
        assert last_week["end_day"] == 30, f"April week 5 should end at 30, got {last_week['end_day']}"
    
    def test_leap_year_february_has_5_weeks(self, api_client):
        """February 2024 (leap year) has 29 days, should return 5 weeks (29-29 as week 5)"""
        response = api_client.get(
            f"{BASE_URL}/api/distributors/{TEST_DISTRIBUTOR_ID}/monthly-reconciliation",
            params={"month": 2, "year": 2024}
        )
        assert response.status_code == 200
        
        data = response.json()
        weekly_billing = data.get("weekly_billing", [])
        assert len(weekly_billing) == 5, f"February 2024 (leap year) should have 5 weeks, got {len(weekly_billing)}"
        
        # Last week should be 29-29 (single day)
        last_week = weekly_billing[-1]
        assert last_week["start_day"] == 29, f"February 2024 week 5 should start at 29, got {last_week['start_day']}"
        assert last_week["end_day"] == 29, f"February 2024 week 5 should end at 29, got {last_week['end_day']}"


class TestEntry2StillWorks:
    """Verify Entry 2 (adjustments) still returns correctly"""
    
    def test_entry2_fields_present(self, api_client):
        """Verify Entry 2 fields are still present in response"""
        response = api_client.get(
            f"{BASE_URL}/api/distributors/{TEST_DISTRIBUTOR_ID}/monthly-reconciliation",
            params={"month": 3, "year": 2026}
        )
        assert response.status_code == 200
        
        data = response.json()
        
        # Entry 2 fields
        assert "settlement_selling_price_adj" in data, "Response must contain settlement_selling_price_adj"
        assert "total_credit_notes_applied" in data, "Response must contain total_credit_notes_applied"
        assert "total_factory_return_credit" in data, "Response must contain total_factory_return_credit"
        assert "net_adjustment_amount" in data, "Response must contain net_adjustment_amount"
        assert "settlement_note_type" in data, "Response must contain settlement_note_type"
    
    def test_entry2_note_type_valid(self, api_client):
        """settlement_note_type should be 'debit', 'credit', or 'none'"""
        response = api_client.get(
            f"{BASE_URL}/api/distributors/{TEST_DISTRIBUTOR_ID}/monthly-reconciliation",
            params={"month": 3, "year": 2026}
        )
        assert response.status_code == 200
        
        data = response.json()
        note_type = data.get("settlement_note_type")
        assert note_type in ["debit", "credit", "none"], f"settlement_note_type should be debit/credit/none, got {note_type}"


if __name__ == "__main__":
    pytest.main([__file__, "-v"])
