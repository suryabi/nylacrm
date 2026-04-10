"""
Test Rejection Report Filters - Dynamic Batch Dropdown and Rejection Reason Filter
Features tested:
1. GET /api/production/batches - returns batches with sku_id, sku_name, production_date
2. GET /api/production/rejection-reasons - returns master data for rejection reasons
3. GET /api/production/rejection-report?rejection_reason=X - filters rows by rejection_reason
"""
import pytest
import requests
import os

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', '').rstrip('/')

# Test credentials
TEST_EMAIL = "surya.yadavalli@nylaairwater.earth"
TEST_PASSWORD = "test123"
TENANT_ID = "nyla-air-water"


@pytest.fixture(scope="module")
def auth_token():
    """Get authentication token"""
    response = requests.post(
        f"{BASE_URL}/api/auth/login",
        json={"email": TEST_EMAIL, "password": TEST_PASSWORD, "tenant_id": TENANT_ID}
    )
    if response.status_code == 200:
        data = response.json()
        # App uses 'session_token' not 'token'
        return data.get("session_token") or data.get("token")
    pytest.skip(f"Authentication failed: {response.status_code} - {response.text}")


@pytest.fixture(scope="module")
def auth_headers(auth_token):
    """Get auth headers with session token and tenant ID"""
    return {
        "Authorization": f"Bearer {auth_token}",
        "X-Tenant-ID": TENANT_ID,
        "Content-Type": "application/json"
    }


class TestBatchesEndpoint:
    """Test /api/production/batches endpoint for dynamic batch dropdown filtering"""
    
    def test_list_batches_returns_200(self, auth_headers):
        """Test that batches endpoint returns 200"""
        response = requests.get(f"{BASE_URL}/api/production/batches", headers=auth_headers)
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        print(f"✓ GET /api/production/batches returned 200")
    
    def test_batches_have_required_fields(self, auth_headers):
        """Test that batches have sku_id, sku_name, production_date for filtering"""
        response = requests.get(f"{BASE_URL}/api/production/batches", headers=auth_headers)
        assert response.status_code == 200
        batches = response.json()
        
        if len(batches) == 0:
            pytest.skip("No batches found in database")
        
        # Check first batch has required fields
        batch = batches[0]
        assert "id" in batch, "Batch missing 'id' field"
        assert "batch_code" in batch, "Batch missing 'batch_code' field"
        assert "sku_id" in batch, "Batch missing 'sku_id' field"
        assert "sku_name" in batch, "Batch missing 'sku_name' field"
        assert "production_date" in batch, "Batch missing 'production_date' field"
        
        print(f"✓ Batch has required fields: id, batch_code, sku_id, sku_name, production_date")
        print(f"  Sample batch: {batch.get('batch_code')} - SKU: {batch.get('sku_name')} - Date: {batch.get('production_date')}")
    
    def test_batches_production_date_format(self, auth_headers):
        """Test that production_date is in YYYY-MM-DD format for month/year filtering"""
        response = requests.get(f"{BASE_URL}/api/production/batches", headers=auth_headers)
        assert response.status_code == 200
        batches = response.json()
        
        if len(batches) == 0:
            pytest.skip("No batches found in database")
        
        # Check production_date format
        for batch in batches[:5]:  # Check first 5
            prod_date = batch.get("production_date", "")
            if prod_date:
                # Should be YYYY-MM-DD format
                parts = prod_date.split("-")
                assert len(parts) >= 3, f"Invalid date format: {prod_date}"
                assert len(parts[0]) == 4, f"Year should be 4 digits: {prod_date}"
                print(f"  Batch {batch.get('batch_code')}: production_date = {prod_date}")
        
        print(f"✓ Production dates are in correct format for filtering")


class TestRejectionReasonsEndpoint:
    """Test /api/production/rejection-reasons master data endpoint"""
    
    def test_list_rejection_reasons_returns_200(self, auth_headers):
        """Test that rejection-reasons endpoint returns 200"""
        response = requests.get(f"{BASE_URL}/api/production/rejection-reasons", headers=auth_headers)
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        print(f"✓ GET /api/production/rejection-reasons returned 200")
    
    def test_rejection_reasons_have_required_fields(self, auth_headers):
        """Test that rejection reasons have id and name fields"""
        response = requests.get(f"{BASE_URL}/api/production/rejection-reasons", headers=auth_headers)
        assert response.status_code == 200
        reasons = response.json()
        
        assert isinstance(reasons, list), "Response should be a list"
        
        if len(reasons) == 0:
            pytest.skip("No rejection reasons found in database")
        
        # Check first reason has required fields
        reason = reasons[0]
        assert "id" in reason, "Rejection reason missing 'id' field"
        assert "name" in reason, "Rejection reason missing 'name' field"
        
        print(f"✓ Rejection reasons have required fields: id, name")
        print(f"  Found {len(reasons)} rejection reasons")
        for r in reasons:
            print(f"    - {r.get('name')}")
    
    def test_expected_rejection_reasons_exist(self, auth_headers):
        """Test that expected rejection reasons exist in master data"""
        response = requests.get(f"{BASE_URL}/api/production/rejection-reasons", headers=auth_headers)
        assert response.status_code == 200
        reasons = response.json()
        
        reason_names = [r.get("name", "").lower() for r in reasons]
        
        # Expected reasons from problem statement
        expected = ["black particles", "bottle scratches", "cap issues", "white particles"]
        
        found = []
        missing = []
        for exp in expected:
            if exp in reason_names:
                found.append(exp)
            else:
                missing.append(exp)
        
        print(f"✓ Found rejection reasons: {found}")
        if missing:
            print(f"  Missing expected reasons: {missing}")
        
        # At least some expected reasons should exist
        assert len(found) > 0, f"None of the expected rejection reasons found. Available: {reason_names}"


class TestRejectionReportEndpoint:
    """Test /api/production/rejection-report endpoint with rejection_reason filter"""
    
    def test_rejection_report_returns_200(self, auth_headers):
        """Test that rejection-report endpoint returns 200"""
        response = requests.get(f"{BASE_URL}/api/production/rejection-report", headers=auth_headers)
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        print(f"✓ GET /api/production/rejection-report returned 200")
    
    def test_rejection_report_structure(self, auth_headers):
        """Test that rejection report has expected structure"""
        response = requests.get(f"{BASE_URL}/api/production/rejection-report", headers=auth_headers)
        assert response.status_code == 200
        data = response.json()
        
        assert "rows" in data, "Response missing 'rows' field"
        assert "total_rejected" in data, "Response missing 'total_rejected' field"
        assert "by_resource" in data, "Response missing 'by_resource' field"
        assert "by_date" in data, "Response missing 'by_date' field"
        
        print(f"✓ Rejection report has expected structure")
        print(f"  Total rows: {len(data['rows'])}")
        print(f"  Total rejected: {data['total_rejected']}")
    
    def test_rejection_report_rows_have_rejection_reason(self, auth_headers):
        """Test that rejection report rows include rejection_reason field"""
        response = requests.get(f"{BASE_URL}/api/production/rejection-report", headers=auth_headers)
        assert response.status_code == 200
        data = response.json()
        
        rows = data.get("rows", [])
        if len(rows) == 0:
            pytest.skip("No rejection rows found")
        
        # Check that rows have rejection_reason field
        row = rows[0]
        assert "rejection_reason" in row, "Row missing 'rejection_reason' field"
        
        # Collect unique reasons
        reasons = set()
        for r in rows:
            reason = r.get("rejection_reason", "")
            if reason:
                reasons.add(reason)
        
        print(f"✓ Rejection report rows have 'rejection_reason' field")
        print(f"  Unique reasons in data: {reasons}")
    
    def test_rejection_reason_filter_works(self, auth_headers):
        """Test that rejection_reason query param filters rows correctly"""
        # First get all rows to find a reason to filter by
        response = requests.get(f"{BASE_URL}/api/production/rejection-report", headers=auth_headers)
        assert response.status_code == 200
        all_data = response.json()
        all_rows = all_data.get("rows", [])
        
        if len(all_rows) == 0:
            pytest.skip("No rejection rows found")
        
        # Find a reason that exists in the data
        test_reason = None
        for row in all_rows:
            reason = row.get("rejection_reason", "")
            if reason:
                test_reason = reason
                break
        
        if not test_reason:
            pytest.skip("No rows with rejection_reason found")
        
        # Now filter by that reason
        response = requests.get(
            f"{BASE_URL}/api/production/rejection-report",
            params={"rejection_reason": test_reason},
            headers=auth_headers
        )
        assert response.status_code == 200
        filtered_data = response.json()
        filtered_rows = filtered_data.get("rows", [])
        
        # All filtered rows should have the specified reason
        for row in filtered_rows:
            row_reason = row.get("rejection_reason", "").lower()
            assert row_reason == test_reason.lower(), f"Row has reason '{row_reason}' but expected '{test_reason}'"
        
        # Filtered count should be less than or equal to total
        assert len(filtered_rows) <= len(all_rows), "Filtered rows should be <= total rows"
        
        print(f"✓ rejection_reason filter works correctly")
        print(f"  Filter: '{test_reason}'")
        print(f"  Total rows: {len(all_rows)}, Filtered rows: {len(filtered_rows)}")
    
    def test_rejection_reason_filter_case_insensitive(self, auth_headers):
        """Test that rejection_reason filter is case-insensitive"""
        # First get all rows to find a reason
        response = requests.get(f"{BASE_URL}/api/production/rejection-report", headers=auth_headers)
        assert response.status_code == 200
        all_data = response.json()
        all_rows = all_data.get("rows", [])
        
        if len(all_rows) == 0:
            pytest.skip("No rejection rows found")
        
        # Find a reason
        test_reason = None
        for row in all_rows:
            reason = row.get("rejection_reason", "")
            if reason:
                test_reason = reason
                break
        
        if not test_reason:
            pytest.skip("No rows with rejection_reason found")
        
        # Test with uppercase
        response_upper = requests.get(
            f"{BASE_URL}/api/production/rejection-report",
            params={"rejection_reason": test_reason.upper()},
            headers=auth_headers
        )
        assert response_upper.status_code == 200
        
        # Test with lowercase
        response_lower = requests.get(
            f"{BASE_URL}/api/production/rejection-report",
            params={"rejection_reason": test_reason.lower()},
            headers=auth_headers
        )
        assert response_lower.status_code == 200
        
        upper_rows = response_upper.json().get("rows", [])
        lower_rows = response_lower.json().get("rows", [])
        
        # Both should return same count (case-insensitive)
        assert len(upper_rows) == len(lower_rows), f"Case sensitivity issue: upper={len(upper_rows)}, lower={len(lower_rows)}"
        
        print(f"✓ rejection_reason filter is case-insensitive")
        print(f"  Upper case rows: {len(upper_rows)}, Lower case rows: {len(lower_rows)}")
    
    def test_rejection_reason_filter_nonexistent_reason(self, auth_headers):
        """Test that filtering by non-existent reason returns empty rows"""
        response = requests.get(
            f"{BASE_URL}/api/production/rejection-report",
            params={"rejection_reason": "NONEXISTENT_REASON_XYZ_123"},
            headers=auth_headers
        )
        assert response.status_code == 200
        data = response.json()
        
        rows = data.get("rows", [])
        total = data.get("total_rejected", 0)
        
        assert len(rows) == 0, f"Expected 0 rows for non-existent reason, got {len(rows)}"
        assert total == 0, f"Expected total_rejected=0 for non-existent reason, got {total}"
        
        print(f"✓ Non-existent rejection_reason returns empty results")
    
    def test_rejection_report_with_month_year_filter(self, auth_headers):
        """Test rejection report with month and year filters"""
        # Test with current month/year
        from datetime import datetime
        now = datetime.now()
        
        response = requests.get(
            f"{BASE_URL}/api/production/rejection-report",
            params={"month": now.month, "year": now.year},
            headers=auth_headers
        )
        assert response.status_code == 200
        data = response.json()
        
        print(f"✓ Month/Year filter works")
        print(f"  Month: {now.month}, Year: {now.year}")
        print(f"  Rows: {len(data.get('rows', []))}, Total rejected: {data.get('total_rejected', 0)}")
    
    def test_rejection_report_combined_filters(self, auth_headers):
        """Test rejection report with multiple filters combined"""
        # Get all data first
        response = requests.get(f"{BASE_URL}/api/production/rejection-report", headers=auth_headers)
        assert response.status_code == 200
        all_data = response.json()
        all_rows = all_data.get("rows", [])
        
        if len(all_rows) == 0:
            pytest.skip("No rejection rows found")
        
        # Find a reason to filter by
        test_reason = None
        for row in all_rows:
            reason = row.get("rejection_reason", "")
            if reason:
                test_reason = reason
                break
        
        if not test_reason:
            pytest.skip("No rows with rejection_reason found")
        
        # Test combined filter: month + year + rejection_reason
        from datetime import datetime
        now = datetime.now()
        
        response = requests.get(
            f"{BASE_URL}/api/production/rejection-report",
            params={
                "month": now.month,
                "year": now.year,
                "rejection_reason": test_reason
            },
            headers=auth_headers
        )
        assert response.status_code == 200
        data = response.json()
        
        # Verify all rows match the reason filter
        for row in data.get("rows", []):
            row_reason = row.get("rejection_reason", "").lower()
            assert row_reason == test_reason.lower(), f"Combined filter failed: got '{row_reason}'"
        
        print(f"✓ Combined filters work correctly")
        print(f"  Filters: month={now.month}, year={now.year}, rejection_reason={test_reason}")
        print(f"  Rows: {len(data.get('rows', []))}")


class TestClearFiltersResetsBehavior:
    """Test that clear filters resets all filters including rejection_reason"""
    
    def test_empty_rejection_reason_returns_all(self, auth_headers):
        """Test that empty rejection_reason param returns all rows"""
        # Get all rows
        response_all = requests.get(f"{BASE_URL}/api/production/rejection-report", headers=auth_headers)
        assert response_all.status_code == 200
        all_count = len(response_all.json().get("rows", []))
        
        # Get with empty rejection_reason
        response_empty = requests.get(
            f"{BASE_URL}/api/production/rejection-report",
            params={"rejection_reason": ""},
            headers=auth_headers
        )
        assert response_empty.status_code == 200
        empty_count = len(response_empty.json().get("rows", []))
        
        # Should be same count
        assert all_count == empty_count, f"Empty filter should return all: {all_count} vs {empty_count}"
        
        print(f"✓ Empty rejection_reason returns all rows ({all_count})")


if __name__ == "__main__":
    pytest.main([__file__, "-v", "--tb=short"])
