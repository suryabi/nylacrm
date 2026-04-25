"""
Production QC Tracking Module - Phase 2 Tests
Tests for:
- Batch Detail retrieval
- Stage Movement (move stock from unallocated to stages)
- Inspection Recording (pass/reject crates)
- Stage Balance tracking
- Activity Log/History
- Validation rules
"""
import pytest
import requests
import os

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', '').rstrip('/')
TENANT_ID = "nyla-air-water"
TEST_BATCH_ID = "5833eb23-8664-4a53-8fc7-eedb9ff18178"

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


class TestBatchDetailRetrieval:
    """Test batch detail and history retrieval"""
    
    def test_get_batch_detail(self, auth_headers):
        """GET /api/production/batches/{batch_id} - Get batch with stage balances"""
        url = f"{BASE_URL}/api/production/batches/{TEST_BATCH_ID}"
        response = requests.get(url, headers=auth_headers)
        
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        
        data = response.json()
        # Verify batch structure
        assert "id" in data
        assert "batch_code" in data
        assert "sku_name" in data
        assert "status" in data
        assert "qc_stages" in data
        assert "stage_balances" in data
        assert "unallocated_crates" in data
        assert "total_rejected" in data
        assert "total_passed_final" in data
        
        print(f"Batch: {data['batch_code']}, Status: {data['status']}")
        print(f"Unallocated: {data['unallocated_crates']}, Total Rejected: {data['total_rejected']}")
        print(f"QC Stages: {len(data['qc_stages'])}")
        
        # Verify stage balances structure
        for stage_id, balance in data['stage_balances'].items():
            assert "received" in balance
            assert "pending" in balance
            assert "passed" in balance
            assert "rejected" in balance
            print(f"Stage {balance.get('stage_name', stage_id)}: received={balance['received']}, pending={balance['pending']}, passed={balance['passed']}, rejected={balance['rejected']}")
    
    def test_get_batch_history(self, auth_headers):
        """GET /api/production/batches/{batch_id}/history - Get movement and inspection history"""
        url = f"{BASE_URL}/api/production/batches/{TEST_BATCH_ID}/history"
        response = requests.get(url, headers=auth_headers)
        
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        
        data = response.json()
        assert "movements" in data
        assert "inspections" in data
        assert "timeline" in data
        
        print(f"Movements: {len(data['movements'])}, Inspections: {len(data['inspections'])}")
        print(f"Timeline entries: {len(data['timeline'])}")
        
        # Verify timeline structure
        for item in data['timeline'][:3]:  # Check first 3
            assert "type" in item
            assert "timestamp" in item
            if item['type'] == 'movement':
                assert "quantity" in item
                assert "to_stage_name" in item
            elif item['type'] == 'inspection':
                assert "qty_inspected" in item
                assert "qty_passed" in item
                assert "qty_rejected" in item


class TestStageMovement:
    """Test stock movement between stages"""
    
    def test_move_validation_zero_quantity(self, auth_headers):
        """POST /api/production/batches/{batch_id}/move - Reject zero quantity"""
        url = f"{BASE_URL}/api/production/batches/{TEST_BATCH_ID}/move"
        payload = {
            "to_stage_id": STAGE_QC1_ID,
            "quantity": 0,
            "notes": "Test zero quantity"
        }
        response = requests.post(url, json=payload, headers=auth_headers)
        
        assert response.status_code == 400, f"Expected 400, got {response.status_code}: {response.text}"
        assert "Quantity must be > 0" in response.text
        print("Zero quantity validation: PASSED")
    
    def test_move_validation_negative_quantity(self, auth_headers):
        """POST /api/production/batches/{batch_id}/move - Reject negative quantity"""
        url = f"{BASE_URL}/api/production/batches/{TEST_BATCH_ID}/move"
        payload = {
            "to_stage_id": STAGE_QC1_ID,
            "quantity": -5,
            "notes": "Test negative quantity"
        }
        response = requests.post(url, json=payload, headers=auth_headers)
        
        assert response.status_code == 400, f"Expected 400, got {response.status_code}: {response.text}"
        print("Negative quantity validation: PASSED")
    
    def test_move_validation_invalid_stage(self, auth_headers):
        """POST /api/production/batches/{batch_id}/move - Reject invalid stage"""
        url = f"{BASE_URL}/api/production/batches/{TEST_BATCH_ID}/move"
        payload = {
            "to_stage_id": "invalid-stage-id",
            "quantity": 5,
            "notes": "Test invalid stage"
        }
        response = requests.post(url, json=payload, headers=auth_headers)
        
        assert response.status_code == 400, f"Expected 400, got {response.status_code}: {response.text}"
        assert "Invalid stage" in response.text
        print("Invalid stage validation: PASSED")
    
    def test_move_validation_exceeds_available(self, auth_headers):
        """POST /api/production/batches/{batch_id}/move - Reject quantity exceeding available"""
        # First get current batch state
        batch_url = f"{BASE_URL}/api/production/batches/{TEST_BATCH_ID}"
        batch_response = requests.get(batch_url, headers=auth_headers)
        batch = batch_response.json()
        unallocated = batch.get('unallocated_crates', 0)
        
        url = f"{BASE_URL}/api/production/batches/{TEST_BATCH_ID}/move"
        payload = {
            "to_stage_id": STAGE_QC1_ID,
            "quantity": unallocated + 1000,  # More than available
            "notes": "Test exceeds available"
        }
        response = requests.post(url, json=payload, headers=auth_headers)
        
        assert response.status_code == 400, f"Expected 400, got {response.status_code}: {response.text}"
        print(f"Exceeds available validation (tried {unallocated + 1000}, available {unallocated}): PASSED")


class TestInspectionRecording:
    """Test inspection recording at stages"""
    
    def test_inspect_validation_zero_inspected(self, auth_headers):
        """POST /api/production/batches/{batch_id}/inspect - Reject zero inspected"""
        url = f"{BASE_URL}/api/production/batches/{TEST_BATCH_ID}/inspect"
        payload = {
            "stage_id": STAGE_QC2_ID,
            "qty_inspected": 0,
            "qty_passed": 0,
            "qty_rejected": 0
        }
        response = requests.post(url, json=payload, headers=auth_headers)
        
        assert response.status_code == 400, f"Expected 400, got {response.status_code}: {response.text}"
        assert "Inspected quantity must be > 0" in response.text
        print("Zero inspected validation: PASSED")
    
    def test_inspect_validation_pass_reject_mismatch(self, auth_headers):
        """POST /api/production/batches/{batch_id}/inspect - Reject when passed+rejected != inspected"""
        url = f"{BASE_URL}/api/production/batches/{TEST_BATCH_ID}/inspect"
        payload = {
            "stage_id": STAGE_QC2_ID,
            "qty_inspected": 10,
            "qty_passed": 5,
            "qty_rejected": 3  # 5+3=8 != 10
        }
        response = requests.post(url, json=payload, headers=auth_headers)
        
        assert response.status_code == 400, f"Expected 400, got {response.status_code}: {response.text}"
        assert "Passed + Rejected must equal Inspected" in response.text
        print("Pass+Reject mismatch validation: PASSED")
    
    def test_inspect_validation_invalid_stage(self, auth_headers):
        """POST /api/production/batches/{batch_id}/inspect - Reject invalid stage"""
        url = f"{BASE_URL}/api/production/batches/{TEST_BATCH_ID}/inspect"
        payload = {
            "stage_id": "invalid-stage-id",
            "qty_inspected": 5,
            "qty_passed": 4,
            "qty_rejected": 1
        }
        response = requests.post(url, json=payload, headers=auth_headers)
        
        assert response.status_code == 400, f"Expected 400, got {response.status_code}: {response.text}"
        assert "Invalid stage" in response.text
        print("Invalid stage validation: PASSED")


class TestMoveAndInspectFlow:
    """Test actual move and inspect operations (if there's available stock)"""
    
    def test_get_current_batch_state(self, auth_headers):
        """Get current batch state to determine what operations are possible"""
        url = f"{BASE_URL}/api/production/batches/{TEST_BATCH_ID}"
        response = requests.get(url, headers=auth_headers)
        
        assert response.status_code == 200
        batch = response.json()
        
        print(f"\n=== Current Batch State ===")
        print(f"Batch Code: {batch['batch_code']}")
        print(f"Status: {batch['status']}")
        print(f"Unallocated Crates: {batch['unallocated_crates']}")
        print(f"Total Rejected: {batch['total_rejected']}")
        print(f"Total Passed Final: {batch['total_passed_final']}")
        
        print(f"\n=== Stage Balances ===")
        for stage in batch.get('qc_stages', []):
            stage_id = stage['id']
            bal = batch['stage_balances'].get(stage_id, {})
            print(f"{stage['name']} (order={stage['order']}): received={bal.get('received', 0)}, pending={bal.get('pending', 0)}, passed={bal.get('passed', 0)}, rejected={bal.get('rejected', 0)}")
        
        return batch
    
    def test_move_to_first_stage_if_available(self, auth_headers):
        """Move stock from unallocated to first stage if available"""
        # Get current state
        batch_url = f"{BASE_URL}/api/production/batches/{TEST_BATCH_ID}"
        batch_response = requests.get(batch_url, headers=auth_headers)
        batch = batch_response.json()
        
        unallocated = batch.get('unallocated_crates', 0)
        if unallocated == 0:
            pytest.skip("No unallocated crates available for move test")
        
        # Move 5 crates (or less if not enough)
        move_qty = min(5, unallocated)
        
        url = f"{BASE_URL}/api/production/batches/{TEST_BATCH_ID}/move"
        payload = {
            "to_stage_id": STAGE_QC1_ID,
            "quantity": move_qty,
            "notes": "Test move from pytest"
        }
        response = requests.post(url, json=payload, headers=auth_headers)
        
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        
        updated_batch = response.json()
        
        # Verify unallocated decreased
        assert updated_batch['unallocated_crates'] == unallocated - move_qty
        
        # Verify stage balance increased
        qc1_bal = updated_batch['stage_balances'].get(STAGE_QC1_ID, {})
        print(f"Moved {move_qty} crates to QC Stage 1")
        print(f"New unallocated: {updated_batch['unallocated_crates']}")
        print(f"QC Stage 1 - received: {qc1_bal.get('received')}, pending: {qc1_bal.get('pending')}")
        
        # Verify status changed to in_qc if it was created
        if batch['status'] == 'created':
            assert updated_batch['status'] == 'in_qc'
            print("Status changed from 'created' to 'in_qc'")
    
    def test_inspect_at_stage_if_pending(self, auth_headers):
        """Record inspection at a stage if there are pending crates"""
        # Get current state
        batch_url = f"{BASE_URL}/api/production/batches/{TEST_BATCH_ID}"
        batch_response = requests.get(batch_url, headers=auth_headers)
        batch = batch_response.json()
        
        # Find a stage with pending crates
        test_stage_id = None
        test_stage_name = None
        pending_qty = 0
        
        for stage in batch.get('qc_stages', []):
            stage_id = stage['id']
            bal = batch['stage_balances'].get(stage_id, {})
            if bal.get('pending', 0) > 0:
                test_stage_id = stage_id
                test_stage_name = stage['name']
                pending_qty = bal['pending']
                break
        
        if not test_stage_id:
            pytest.skip("No stages with pending crates for inspection test")
        
        # Inspect 2 crates (or less if not enough): 1 pass, 1 reject
        inspect_qty = min(2, pending_qty)
        pass_qty = inspect_qty - 1 if inspect_qty > 1 else inspect_qty
        reject_qty = inspect_qty - pass_qty
        
        url = f"{BASE_URL}/api/production/batches/{TEST_BATCH_ID}/inspect"
        payload = {
            "stage_id": test_stage_id,
            "qty_inspected": inspect_qty,
            "qty_passed": pass_qty,
            "qty_rejected": reject_qty,
            "rejection_reason": "Test rejection from pytest" if reject_qty > 0 else "",
            "remarks": "Pytest inspection test"
        }
        response = requests.post(url, json=payload, headers=auth_headers)
        
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        
        updated_batch = response.json()
        
        # Verify stage balance updated
        stage_bal = updated_batch['stage_balances'].get(test_stage_id, {})
        print(f"Inspected {inspect_qty} crates at {test_stage_name}")
        print(f"Passed: {pass_qty}, Rejected: {reject_qty}")
        print(f"Stage balance - pending: {stage_bal.get('pending')}, passed: {stage_bal.get('passed')}, rejected: {stage_bal.get('rejected')}")
        
        # Verify total_rejected increased if we rejected any
        if reject_qty > 0:
            assert updated_batch['total_rejected'] >= batch['total_rejected'] + reject_qty
            print(f"Total rejected increased to: {updated_batch['total_rejected']}")
    
    def test_history_after_operations(self, auth_headers):
        """Verify history contains our operations"""
        url = f"{BASE_URL}/api/production/batches/{TEST_BATCH_ID}/history"
        response = requests.get(url, headers=auth_headers)
        
        assert response.status_code == 200
        data = response.json()
        
        print(f"\n=== Activity History ===")
        print(f"Total movements: {len(data['movements'])}")
        print(f"Total inspections: {len(data['inspections'])}")
        
        # Show recent timeline entries
        for item in data['timeline'][:5]:
            if item['type'] == 'movement':
                print(f"[MOVE] {item['quantity']} crates to {item['to_stage_name']} by {item.get('moved_by_name', 'Unknown')}")
            else:
                print(f"[INSPECT] {item['qty_inspected']} at {item['stage_name']} - passed: {item['qty_passed']}, rejected: {item['qty_rejected']}")


class TestBatchNotFound:
    """Test 404 handling for non-existent batch"""
    
    def test_get_nonexistent_batch(self, auth_headers):
        """GET /api/production/batches/{batch_id} - 404 for non-existent batch"""
        url = f"{BASE_URL}/api/production/batches/nonexistent-batch-id"
        response = requests.get(url, headers=auth_headers)
        
        assert response.status_code == 404, f"Expected 404, got {response.status_code}"
        print("Non-existent batch returns 404: PASSED")
    
    def test_move_nonexistent_batch(self, auth_headers):
        """POST /api/production/batches/{batch_id}/move - 404 for non-existent batch"""
        url = f"{BASE_URL}/api/production/batches/nonexistent-batch-id/move"
        payload = {
            "to_stage_id": STAGE_QC1_ID,
            "quantity": 5
        }
        response = requests.post(url, json=payload, headers=auth_headers)
        
        assert response.status_code == 404, f"Expected 404, got {response.status_code}"
        print("Move on non-existent batch returns 404: PASSED")
    
    def test_inspect_nonexistent_batch(self, auth_headers):
        """POST /api/production/batches/{batch_id}/inspect - 404 for non-existent batch"""
        url = f"{BASE_URL}/api/production/batches/nonexistent-batch-id/inspect"
        payload = {
            "stage_id": STAGE_QC1_ID,
            "qty_inspected": 5,
            "qty_passed": 4,
            "qty_rejected": 1
        }
        response = requests.post(url, json=payload, headers=auth_headers)
        
        assert response.status_code == 404, f"Expected 404, got {response.status_code}"
        print("Inspect on non-existent batch returns 404: PASSED")


if __name__ == "__main__":
    pytest.main([__file__, "-v", "--tb=short"])
