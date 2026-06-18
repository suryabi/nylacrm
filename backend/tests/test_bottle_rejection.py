"""
Production QC - Bottle-Based Rejection Tests
Tests for the NEW inspection flow:
- Inspect X crates → all crates pass through → Y individual bottles rejected
- InspectionRecord: qty_inspected (crates), qty_rejected (bottles), NO qty_passed field
- Validation: qty_rejected cannot exceed qty_inspected * bottles_per_crate
- Validation: qty_rejected cannot be negative, qty_inspected must be > 0
"""
import pytest
import requests
import os

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', '').rstrip('/')
TENANT_ID = "nyla-air-water"
TEST_BATCH_ID = "5833eb23-8664-4a53-8fc7-eedb9ff18178"
BOTTLES_PER_CRATE = 48  # From context

# Stage IDs from context
STAGE_QC1_ID = "a1b010e2-5489-4870-89ea-59765195f7a8"  # QC Stage 1 (order=1)
STAGE_QC2_ID = "95bafa4c-f6ca-4047-a094-b038e7551898"  # QC Stage 2 (order=2)
STAGE_LABELING_ID = "01373121-01eb-49b7-88e2-6c1b373afdbe"  # Labeling (order=3)
STAGE_FINAL_QC_ID = "3ffe56d0-51ad-4d05-b63a-1defa5a44506"  # Final QC (order=4)


@pytest.fixture(scope="module")
def auth_headers():
    """Login and get auth headers"""
    login_url = f"{BASE_URL}/api/auth/login"
    login_data = {
        "email": "surya.yadavalli@nylaairwater.earth",
        "password": "test123"
    }
    response = requests.post(login_url, json=login_data)
    if response.status_code != 200:
        pytest.skip(f"Login failed: {response.status_code} - {response.text}")
    
    data = response.json()
    token = data.get("session_token") or data.get("token")
    return {
        "Authorization": f"Bearer {token}",
        "X-Tenant-ID": TENANT_ID,
        "Content-Type": "application/json"
    }


class TestInspectionAPINewFormat:
    """Test the NEW inspection API format (no qty_passed field)"""
    
    def test_inspect_accepts_new_format_without_qty_passed(self, auth_headers):
        """POST /api/production/batches/{batch_id}/inspect - accepts qty_inspected and qty_rejected only"""
        # First get batch state to find a stage with pending crates
        batch_url = f"{BASE_URL}/api/production/batches/{TEST_BATCH_ID}"
        batch_response = requests.get(batch_url, headers=auth_headers)
        assert batch_response.status_code == 200
        batch = batch_response.json()
        
        # Find a stage with pending crates
        test_stage_id = None
        pending_qty = 0
        for stage in batch.get('qc_stages', []):
            bal = batch['stage_balances'].get(stage['id'], {})
            if bal.get('pending', 0) > 0:
                test_stage_id = stage['id']
                pending_qty = bal['pending']
                break
        
        if not test_stage_id:
            pytest.skip("No stages with pending crates for inspection test")
        
        # Test NEW format: qty_inspected (crates) and qty_rejected (bottles), NO qty_passed
        url = f"{BASE_URL}/api/production/batches/{TEST_BATCH_ID}/inspect"
        payload = {
            "stage_id": test_stage_id,
            "qty_inspected": 1,  # 1 crate
            "qty_rejected": 5,  # 5 bottles rejected
            "rejection_reason": "Test bottle rejection",
            "remarks": "Testing new bottle-based rejection"
        }
        response = requests.post(url, json=payload, headers=auth_headers)
        
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        
        updated_batch = response.json()
        print(f"Inspection recorded: 1 crate inspected, 5 bottles rejected")
        print(f"Total rejected bottles: {updated_batch.get('total_rejected')}")
    
    def test_inspect_validation_qty_inspected_must_be_positive(self, auth_headers):
        """POST /api/production/batches/{batch_id}/inspect - qty_inspected must be > 0"""
        url = f"{BASE_URL}/api/production/batches/{TEST_BATCH_ID}/inspect"
        payload = {
            "stage_id": STAGE_QC2_ID,
            "qty_inspected": 0,  # Invalid: must be > 0
            "qty_rejected": 0
        }
        response = requests.post(url, json=payload, headers=auth_headers)
        
        assert response.status_code == 400, f"Expected 400, got {response.status_code}: {response.text}"
        assert "Inspected quantity must be > 0" in response.text
        print("Validation PASSED: qty_inspected must be > 0")
    
    def test_inspect_validation_qty_rejected_cannot_be_negative(self, auth_headers):
        """POST /api/production/batches/{batch_id}/inspect - qty_rejected cannot be negative"""
        url = f"{BASE_URL}/api/production/batches/{TEST_BATCH_ID}/inspect"
        payload = {
            "stage_id": STAGE_QC2_ID,
            "qty_inspected": 1,
            "qty_rejected": -5  # Invalid: cannot be negative
        }
        response = requests.post(url, json=payload, headers=auth_headers)
        
        assert response.status_code == 400, f"Expected 400, got {response.status_code}: {response.text}"
        assert "Rejected bottles cannot be negative" in response.text
        print("Validation PASSED: qty_rejected cannot be negative")
    
    def test_inspect_validation_qty_rejected_cannot_exceed_max_bottles(self, auth_headers):
        """POST /api/production/batches/{batch_id}/inspect - qty_rejected cannot exceed qty_inspected * bottles_per_crate"""
        # First get batch to know bottles_per_crate
        batch_url = f"{BASE_URL}/api/production/batches/{TEST_BATCH_ID}"
        batch_response = requests.get(batch_url, headers=auth_headers)
        batch = batch_response.json()
        bottles_per_crate = batch.get('bottles_per_crate', 48)
        
        # Find a stage with pending crates
        test_stage_id = None
        for stage in batch.get('qc_stages', []):
            bal = batch['stage_balances'].get(stage['id'], {})
            if bal.get('pending', 0) > 0:
                test_stage_id = stage['id']
                break
        
        if not test_stage_id:
            pytest.skip("No stages with pending crates")
        
        # Try to reject more bottles than possible
        qty_inspected = 2  # 2 crates
        max_bottles = qty_inspected * bottles_per_crate  # 2 * 48 = 96
        
        url = f"{BASE_URL}/api/production/batches/{TEST_BATCH_ID}/inspect"
        payload = {
            "stage_id": test_stage_id,
            "qty_inspected": qty_inspected,
            "qty_rejected": max_bottles + 10  # More than max
        }
        response = requests.post(url, json=payload, headers=auth_headers)
        
        assert response.status_code == 400, f"Expected 400, got {response.status_code}: {response.text}"
        assert "Cannot reject more than" in response.text
        print(f"Validation PASSED: Cannot reject more than {max_bottles} bottles ({qty_inspected} crates x {bottles_per_crate})")
    
    def test_inspect_all_crates_pass_through(self, auth_headers):
        """Verify all inspected crates pass through (passed += qty_inspected)"""
        # Get current batch state
        batch_url = f"{BASE_URL}/api/production/batches/{TEST_BATCH_ID}"
        batch_response = requests.get(batch_url, headers=auth_headers)
        batch = batch_response.json()
        
        # Find a stage with pending crates
        test_stage_id = None
        test_stage_name = None
        pending_before = 0
        passed_before = 0
        
        for stage in batch.get('qc_stages', []):
            bal = batch['stage_balances'].get(stage['id'], {})
            if bal.get('pending', 0) >= 2:  # Need at least 2 pending
                test_stage_id = stage['id']
                test_stage_name = stage['name']
                pending_before = bal['pending']
                passed_before = bal.get('passed', 0)
                break
        
        if not test_stage_id:
            pytest.skip("No stages with enough pending crates")
        
        # Inspect 2 crates, reject 10 bottles
        url = f"{BASE_URL}/api/production/batches/{TEST_BATCH_ID}/inspect"
        payload = {
            "stage_id": test_stage_id,
            "qty_inspected": 2,  # 2 crates
            "qty_rejected": 10,  # 10 bottles
            "rejection_reason": "Test all crates pass through"
        }
        response = requests.post(url, json=payload, headers=auth_headers)
        
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        
        updated_batch = response.json()
        bal_after = updated_batch['stage_balances'].get(test_stage_id, {})
        
        # Verify: pending decreased by qty_inspected
        assert bal_after['pending'] == pending_before - 2, f"Pending should decrease by 2"
        
        # Verify: passed increased by qty_inspected (ALL crates pass through)
        assert bal_after['passed'] == passed_before + 2, f"Passed should increase by 2 (all crates pass)"
        
        print(f"Stage {test_stage_name}: pending {pending_before} -> {bal_after['pending']}, passed {passed_before} -> {bal_after['passed']}")
        print("VERIFIED: All inspected crates pass through")
    
    def test_inspect_rejected_bottles_tracked_separately(self, auth_headers):
        """Verify rejected bottles are tracked in stage balance and total_rejected"""
        # Get current batch state
        batch_url = f"{BASE_URL}/api/production/batches/{TEST_BATCH_ID}"
        batch_response = requests.get(batch_url, headers=auth_headers)
        batch = batch_response.json()
        
        total_rejected_before = batch.get('total_rejected', 0)
        
        # Find a stage with pending crates
        test_stage_id = None
        rejected_before = 0
        
        for stage in batch.get('qc_stages', []):
            bal = batch['stage_balances'].get(stage['id'], {})
            if bal.get('pending', 0) >= 1:
                test_stage_id = stage['id']
                rejected_before = bal.get('rejected', 0)
                break
        
        if not test_stage_id:
            pytest.skip("No stages with pending crates")
        
        # Inspect 1 crate, reject 15 bottles
        bottles_to_reject = 15
        url = f"{BASE_URL}/api/production/batches/{TEST_BATCH_ID}/inspect"
        payload = {
            "stage_id": test_stage_id,
            "qty_inspected": 1,
            "qty_rejected": bottles_to_reject,
            "rejection_reason": "Test bottle tracking"
        }
        response = requests.post(url, json=payload, headers=auth_headers)
        
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        
        updated_batch = response.json()
        bal_after = updated_batch['stage_balances'].get(test_stage_id, {})
        
        # Verify: stage rejected increased by bottles_to_reject
        assert bal_after['rejected'] == rejected_before + bottles_to_reject, f"Stage rejected should increase by {bottles_to_reject}"
        
        # Verify: total_rejected increased by bottles_to_reject
        assert updated_batch['total_rejected'] == total_rejected_before + bottles_to_reject, f"Total rejected should increase by {bottles_to_reject}"
        
        print(f"Stage rejected: {rejected_before} -> {bal_after['rejected']} bottles")
        print(f"Total rejected: {total_rejected_before} -> {updated_batch['total_rejected']} bottles")
        print("VERIFIED: Rejected bottles tracked correctly")


class TestInspectionHistoryFormat:
    """Test that inspection history shows correct format"""
    
    def test_history_shows_crates_inspected_bottles_rejected(self, auth_headers):
        """GET /api/production/batches/{batch_id}/history - shows 'X crates inspected, Y bottles rejected'"""
        url = f"{BASE_URL}/api/production/batches/{TEST_BATCH_ID}/history"
        response = requests.get(url, headers=auth_headers)
        
        assert response.status_code == 200
        data = response.json()
        
        # Check inspection records have correct fields
        # Note: Old inspection records may have qty_passed != qty_inspected (old logic)
        # New inspections should have qty_passed == qty_inspected
        for inspection in data.get('inspections', [])[:5]:
            assert 'qty_inspected' in inspection, "Inspection should have qty_inspected"
            assert 'qty_rejected' in inspection, "Inspection should have qty_rejected"
            assert 'qty_passed' in inspection, "Inspection should have qty_passed (auto-set)"
            
            print(f"Inspection at {inspection.get('stage_name')}: {inspection['qty_inspected']} crates inspected, {inspection['qty_rejected']} bottles rejected, {inspection['qty_passed']} passed")
        
        # Verify the most recent inspection (created by our tests) has qty_passed == qty_inspected
        recent_inspections = [i for i in data.get('inspections', []) if 'Test' in (i.get('remarks', '') or i.get('rejection_reason', ''))]
        if recent_inspections:
            for insp in recent_inspections[:3]:
                assert insp['qty_passed'] == insp['qty_inspected'], \
                    f"New inspection: qty_passed ({insp['qty_passed']}) should equal qty_inspected ({insp['qty_inspected']})"
                print(f"VERIFIED new inspection: {insp['qty_inspected']} crates inspected = {insp['qty_passed']} passed")
        
        print("VERIFIED: History shows correct format")


class TestBatchStateAfterInspections:
    """Test batch state reflects bottle-based rejection correctly"""
    
    def test_batch_detail_shows_correct_units(self, auth_headers):
        """GET /api/production/batches/{batch_id} - verify units in response"""
        url = f"{BASE_URL}/api/production/batches/{TEST_BATCH_ID}"
        response = requests.get(url, headers=auth_headers)
        
        assert response.status_code == 200
        batch = response.json()
        
        print(f"\n=== Batch State ===")
        print(f"Unallocated: {batch.get('unallocated_crates')} crates")
        print(f"Total Rejected: {batch.get('total_rejected')} bottles")
        print(f"Delivery Ready: {batch.get('total_passed_final')} crates")
        
        print(f"\n=== Stage Balances ===")
        for stage in batch.get('qc_stages', []):
            bal = batch['stage_balances'].get(stage['id'], {})
            print(f"{stage['name']}:")
            print(f"  Received: {bal.get('received', 0)} crates")
            print(f"  Pending: {bal.get('pending', 0)} crates")
            print(f"  Passed: {bal.get('passed', 0)} crates")
            print(f"  Rejected: {bal.get('rejected', 0)} bottles")
        
        # Verify structure
        assert 'unallocated_crates' in batch
        assert 'total_rejected' in batch
        assert 'total_passed_final' in batch
        assert 'stage_balances' in batch
        
        for stage_id, bal in batch['stage_balances'].items():
            assert 'received' in bal
            assert 'pending' in bal
            assert 'passed' in bal
            assert 'rejected' in bal


class TestInspectionWithZeroRejection:
    """Test inspection with zero bottles rejected"""
    
    def test_inspect_with_zero_rejection(self, auth_headers):
        """POST /api/production/batches/{batch_id}/inspect - zero rejection is valid"""
        # Get batch state
        batch_url = f"{BASE_URL}/api/production/batches/{TEST_BATCH_ID}"
        batch_response = requests.get(batch_url, headers=auth_headers)
        batch = batch_response.json()
        
        # Find a stage with pending crates
        test_stage_id = None
        for stage in batch.get('qc_stages', []):
            bal = batch['stage_balances'].get(stage['id'], {})
            if bal.get('pending', 0) >= 1:
                test_stage_id = stage['id']
                break
        
        if not test_stage_id:
            pytest.skip("No stages with pending crates")
        
        # Inspect with zero rejection
        url = f"{BASE_URL}/api/production/batches/{TEST_BATCH_ID}/inspect"
        payload = {
            "stage_id": test_stage_id,
            "qty_inspected": 1,
            "qty_rejected": 0,  # Zero rejection is valid
            "remarks": "All bottles passed inspection"
        }
        response = requests.post(url, json=payload, headers=auth_headers)
        
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        print("VERIFIED: Zero rejection is valid")


if __name__ == "__main__":
    pytest.main([__file__, "-v", "--tb=short"])
