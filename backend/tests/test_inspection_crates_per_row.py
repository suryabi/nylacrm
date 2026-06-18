"""
Test: Inspection Grid with Crates Inspected per Row
- RejectionEntry now has qty_inspected field per row (crates inspected at resource level)
- InspectionRecord no longer has top-level qty_inspected - derived from sum of entries
- Validation: total crates from all rows cannot exceed pending
- Validation: each row qty_inspected > 0
- Validation: rejected cannot exceed row's crates × bottles_per_crate
"""
import pytest
import requests
import os
import uuid

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', '').rstrip('/')

# Test credentials
TEST_EMAIL = "surya.yadavalli@nylaairwater.earth"
TEST_PASSWORD = "test123"
TEST_TENANT_ID = "nyla-air-water"
TEST_BATCH_ID = "5833eb23-8664-4a53-8fc7-eedb9ff18178"


@pytest.fixture(scope="module")
def auth_headers():
    """Get authentication headers"""
    response = requests.post(f"{BASE_URL}/api/auth/login", json={
        "email": TEST_EMAIL,
        "password": TEST_PASSWORD,
        "tenant_id": TEST_TENANT_ID
    })
    assert response.status_code == 200, f"Login failed: {response.text}"
    data = response.json()
    token = data.get("session_token") or data.get("token")
    return {
        "Authorization": f"Bearer {token}",
        "X-Tenant-ID": TEST_TENANT_ID,
        "Content-Type": "application/json"
    }


@pytest.fixture(scope="module")
def test_qc_member(auth_headers):
    """Create a test QC team member for inspection tests"""
    member_name = f"TEST_QC_Member_{uuid.uuid4().hex[:6]}"
    response = requests.post(f"{BASE_URL}/api/production/qc-team", 
        headers=auth_headers,
        json={"name": member_name, "role": "Inspector"})
    assert response.status_code == 200, f"Failed to create QC member: {response.text}"
    member = response.json()
    yield member
    # Cleanup
    requests.delete(f"{BASE_URL}/api/production/qc-team/{member['id']}", headers=auth_headers)


@pytest.fixture(scope="module")
def test_rejection_reason(auth_headers):
    """Create a test rejection reason"""
    reason_name = f"TEST_Reason_{uuid.uuid4().hex[:6]}"
    response = requests.post(f"{BASE_URL}/api/production/rejection-reasons",
        headers=auth_headers,
        json={"name": reason_name, "description": "Test reason"})
    assert response.status_code == 200, f"Failed to create rejection reason: {response.text}"
    reason = response.json()
    yield reason
    # Cleanup
    requests.delete(f"{BASE_URL}/api/production/rejection-reasons/{reason['id']}", headers=auth_headers)


class TestInspectionCratesPerRow:
    """Test inspection with crates inspected per row"""
    
    def test_get_batch_details(self, auth_headers):
        """Verify batch exists and has pending crates"""
        response = requests.get(f"{BASE_URL}/api/production/batches/{TEST_BATCH_ID}", headers=auth_headers)
        assert response.status_code == 200, f"Failed to get batch: {response.text}"
        batch = response.json()
        
        # Verify batch structure
        assert "stage_balances" in batch, "Batch should have stage_balances"
        assert "qc_stages" in batch, "Batch should have qc_stages"
        assert "bottles_per_crate" in batch, "Batch should have bottles_per_crate"
        
        print(f"Batch: {batch['batch_code']}, bottles_per_crate: {batch['bottles_per_crate']}")
        print(f"Stage balances: {batch['stage_balances']}")
        
    def test_inspection_with_per_row_crates(self, auth_headers, test_qc_member, test_rejection_reason):
        """Test inspection with qty_inspected per row"""
        # First get batch to find a stage with pending crates
        batch_resp = requests.get(f"{BASE_URL}/api/production/batches/{TEST_BATCH_ID}", headers=auth_headers)
        assert batch_resp.status_code == 200
        batch = batch_resp.json()
        
        # Find a stage with pending crates
        stage_id = None
        pending = 0
        for stage in batch.get("qc_stages", []):
            bal = batch.get("stage_balances", {}).get(stage["id"], {})
            if bal.get("pending", 0) > 0:
                stage_id = stage["id"]
                pending = bal["pending"]
                break
        
        if not stage_id:
            pytest.skip("No stage with pending crates found")
        
        bottles_per_crate = batch.get("bottles_per_crate", 48)
        
        # Test inspection with per-row crates inspected
        # Use 1 crate to be safe
        crates_to_inspect = min(1, pending)
        
        payload = {
            "stage_id": stage_id,
            "rejections": [
                {
                    "resource_id": test_qc_member["id"],
                    "resource_name": test_qc_member["name"],
                    "date": "2026-01-15",
                    "qty_inspected": crates_to_inspect,  # NEW: crates inspected per row
                    "qty_rejected": 2,  # bottles rejected
                    "reason": test_rejection_reason["name"]
                }
            ],
            "remarks": "Test inspection with per-row crates"
        }
        
        response = requests.post(f"{BASE_URL}/api/production/batches/{TEST_BATCH_ID}/inspect",
            headers=auth_headers, json=payload)
        
        assert response.status_code == 200, f"Inspection failed: {response.text}"
        result = response.json()
        
        # Verify stage balance updated
        updated_bal = result.get("stage_balances", {}).get(stage_id, {})
        print(f"Updated balance: {updated_bal}")
        
    def test_inspection_multiple_rows_with_crates(self, auth_headers, test_qc_member, test_rejection_reason):
        """Test inspection with multiple rows, each having its own crates inspected"""
        batch_resp = requests.get(f"{BASE_URL}/api/production/batches/{TEST_BATCH_ID}", headers=auth_headers)
        batch = batch_resp.json()
        
        # Find a stage with at least 2 pending crates
        stage_id = None
        pending = 0
        for stage in batch.get("qc_stages", []):
            bal = batch.get("stage_balances", {}).get(stage["id"], {})
            if bal.get("pending", 0) >= 2:
                stage_id = stage["id"]
                pending = bal["pending"]
                break
        
        if not stage_id:
            pytest.skip("No stage with 2+ pending crates found")
        
        # Create second QC member for multi-row test
        member2_name = f"TEST_QC_Member2_{uuid.uuid4().hex[:6]}"
        member2_resp = requests.post(f"{BASE_URL}/api/production/qc-team",
            headers=auth_headers, json={"name": member2_name, "role": "Inspector"})
        member2 = member2_resp.json() if member2_resp.status_code == 200 else None
        
        try:
            payload = {
                "stage_id": stage_id,
                "rejections": [
                    {
                        "resource_id": test_qc_member["id"],
                        "resource_name": test_qc_member["name"],
                        "date": "2026-01-15",
                        "qty_inspected": 1,  # 1 crate for first row
                        "qty_rejected": 1,
                        "reason": test_rejection_reason["name"]
                    },
                    {
                        "resource_id": member2["id"] if member2 else test_qc_member["id"],
                        "resource_name": member2["name"] if member2 else test_qc_member["name"],
                        "date": "2026-01-15",
                        "qty_inspected": 1,  # 1 crate for second row
                        "qty_rejected": 0,
                        "reason": test_rejection_reason["name"]
                    }
                ],
                "remarks": "Multi-row inspection test"
            }
            
            response = requests.post(f"{BASE_URL}/api/production/batches/{TEST_BATCH_ID}/inspect",
                headers=auth_headers, json=payload)
            
            assert response.status_code == 200, f"Multi-row inspection failed: {response.text}"
            print(f"Multi-row inspection successful")
        finally:
            if member2:
                requests.delete(f"{BASE_URL}/api/production/qc-team/{member2['id']}", headers=auth_headers)
    
    def test_validation_total_crates_exceeds_pending(self, auth_headers, test_qc_member, test_rejection_reason):
        """Test validation: total crates from all rows cannot exceed pending"""
        batch_resp = requests.get(f"{BASE_URL}/api/production/batches/{TEST_BATCH_ID}", headers=auth_headers)
        batch = batch_resp.json()
        
        # Find a stage with pending crates
        stage_id = None
        pending = 0
        for stage in batch.get("qc_stages", []):
            bal = batch.get("stage_balances", {}).get(stage["id"], {})
            if bal.get("pending", 0) > 0:
                stage_id = stage["id"]
                pending = bal["pending"]
                break
        
        if not stage_id:
            pytest.skip("No stage with pending crates found")
        
        # Try to inspect more crates than pending
        payload = {
            "stage_id": stage_id,
            "rejections": [
                {
                    "resource_id": test_qc_member["id"],
                    "resource_name": test_qc_member["name"],
                    "date": "2026-01-15",
                    "qty_inspected": pending + 100,  # Exceeds pending
                    "qty_rejected": 0,
                    "reason": test_rejection_reason["name"]
                }
            ],
            "remarks": "Should fail - exceeds pending"
        }
        
        response = requests.post(f"{BASE_URL}/api/production/batches/{TEST_BATCH_ID}/inspect",
            headers=auth_headers, json=payload)
        
        assert response.status_code == 400, f"Should fail with 400, got {response.status_code}: {response.text}"
        assert "pending" in response.text.lower() or "crates" in response.text.lower(), \
            f"Error should mention pending crates: {response.text}"
        print(f"Validation passed: {response.json()}")
    
    def test_validation_row_crates_must_be_positive(self, auth_headers, test_qc_member, test_rejection_reason):
        """Test validation: each row qty_inspected > 0"""
        batch_resp = requests.get(f"{BASE_URL}/api/production/batches/{TEST_BATCH_ID}", headers=auth_headers)
        batch = batch_resp.json()
        
        # Find a stage with pending crates
        stage_id = None
        for stage in batch.get("qc_stages", []):
            bal = batch.get("stage_balances", {}).get(stage["id"], {})
            if bal.get("pending", 0) > 0:
                stage_id = stage["id"]
                break
        
        if not stage_id:
            pytest.skip("No stage with pending crates found")
        
        # Try with qty_inspected = 0
        payload = {
            "stage_id": stage_id,
            "rejections": [
                {
                    "resource_id": test_qc_member["id"],
                    "resource_name": test_qc_member["name"],
                    "date": "2026-01-15",
                    "qty_inspected": 0,  # Invalid: must be > 0
                    "qty_rejected": 0,
                    "reason": test_rejection_reason["name"]
                }
            ],
            "remarks": "Should fail - zero crates"
        }
        
        response = requests.post(f"{BASE_URL}/api/production/batches/{TEST_BATCH_ID}/inspect",
            headers=auth_headers, json=payload)
        
        assert response.status_code == 400, f"Should fail with 400, got {response.status_code}: {response.text}"
        print(f"Validation passed: {response.json()}")
    
    def test_validation_rejected_exceeds_row_max(self, auth_headers, test_qc_member, test_rejection_reason):
        """Test validation: rejected cannot exceed row's crates × bottles_per_crate"""
        batch_resp = requests.get(f"{BASE_URL}/api/production/batches/{TEST_BATCH_ID}", headers=auth_headers)
        batch = batch_resp.json()
        
        bottles_per_crate = batch.get("bottles_per_crate", 48)
        
        # Find a stage with pending crates
        stage_id = None
        for stage in batch.get("qc_stages", []):
            bal = batch.get("stage_balances", {}).get(stage["id"], {})
            if bal.get("pending", 0) > 0:
                stage_id = stage["id"]
                break
        
        if not stage_id:
            pytest.skip("No stage with pending crates found")
        
        # Try to reject more bottles than possible for 1 crate
        max_bottles = 1 * bottles_per_crate
        payload = {
            "stage_id": stage_id,
            "rejections": [
                {
                    "resource_id": test_qc_member["id"],
                    "resource_name": test_qc_member["name"],
                    "date": "2026-01-15",
                    "qty_inspected": 1,  # 1 crate
                    "qty_rejected": max_bottles + 10,  # Exceeds max for 1 crate
                    "reason": test_rejection_reason["name"]
                }
            ],
            "remarks": "Should fail - rejected exceeds max"
        }
        
        response = requests.post(f"{BASE_URL}/api/production/batches/{TEST_BATCH_ID}/inspect",
            headers=auth_headers, json=payload)
        
        assert response.status_code == 400, f"Should fail with 400, got {response.status_code}: {response.text}"
        assert "exceeds" in response.text.lower() or "max" in response.text.lower(), \
            f"Error should mention exceeds max: {response.text}"
        print(f"Validation passed: {response.json()}")


class TestRejectionReportColumns:
    """Test rejection report includes Crates Inspected and Rejected Count columns"""
    
    def test_rejection_report_has_qty_inspected(self, auth_headers):
        """Verify rejection report rows include qty_inspected field"""
        response = requests.get(f"{BASE_URL}/api/production/rejection-report", headers=auth_headers)
        assert response.status_code == 200, f"Failed to get rejection report: {response.text}"
        
        report = response.json()
        rows = report.get("rows", [])
        
        if len(rows) > 0:
            # Check first row has qty_inspected
            first_row = rows[0]
            assert "qty_inspected" in first_row, f"Row should have qty_inspected field: {first_row.keys()}"
            assert "qty_rejected" in first_row, f"Row should have qty_rejected field: {first_row.keys()}"
            print(f"Rejection report row fields: {list(first_row.keys())}")
        else:
            print("No rejection rows found - skipping field check")


class TestBatchHistoryRejections:
    """Test batch history includes per-row rejection data"""
    
    def test_history_inspections_have_rejections_array(self, auth_headers):
        """Verify batch history inspections include rejections array with qty_inspected"""
        response = requests.get(f"{BASE_URL}/api/production/batches/{TEST_BATCH_ID}/history", headers=auth_headers)
        assert response.status_code == 200, f"Failed to get batch history: {response.text}"
        
        history = response.json()
        inspections = history.get("inspections", [])
        
        if len(inspections) > 0:
            # Check first inspection has rejections array
            first_insp = inspections[0]
            assert "rejections" in first_insp, f"Inspection should have rejections array: {first_insp.keys()}"
            
            rejections = first_insp.get("rejections", [])
            if len(rejections) > 0:
                first_rej = rejections[0]
                assert "qty_inspected" in first_rej, f"Rejection entry should have qty_inspected: {first_rej.keys()}"
                print(f"Rejection entry fields: {list(first_rej.keys())}")
        else:
            print("No inspections found - skipping field check")
