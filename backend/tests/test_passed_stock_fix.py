"""
Test: Passed Stock Fix - Inspection Rejection Crate Equivalents
Bug: When stock moves from one stage to another, only passed crates should move.
     Previously, rejected stock was also moving (count was wrong).
Fix: record_inspection function now converts rejected bottles to crate equivalents
     (floor division: rejected_bottles // bottles_per_crate) and subtracts from passed crates.

Key formula: passed_crates = inspected_crates - floor(rejected_bottles / bottles_per_crate)
"""

import pytest
import requests
import os
import uuid
from datetime import datetime

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', '').rstrip('/')

# Test credentials
TEST_EMAIL = "surya.yadavalli@nylaairwater.earth"
TEST_PASSWORD = "test123"

# SKU and QC Route info from context
SKU_ID = "b39203a7-4067-458b-a316-5831a98be946"
SKU_NAME = "Nyla - 330 ml / Silver"
BOTTLES_PER_CRATE = 24

# QC Stages for this SKU
STAGE_1_ID = "s1-b39203a7"  # QC Stage 1
STAGE_2_ID = "s2-b39203a7"  # QC Stage 2
STAGE_3_ID = "s3-b39203a7"  # Labeling
STAGE_4_ID = "s4-b39203a7"  # Final QC


@pytest.fixture(scope="module")
def auth_token():
    """Get authentication token"""
    response = requests.post(f"{BASE_URL}/api/auth/login", json={
        "email": TEST_EMAIL,
        "password": TEST_PASSWORD
    })
    assert response.status_code == 200, f"Login failed: {response.text}"
    data = response.json()
    # Auth token key is session_token per context
    token = data.get("session_token") or data.get("token")
    assert token, f"No token in response: {data}"
    return token


@pytest.fixture(scope="module")
def headers(auth_token):
    """Headers with auth token"""
    return {
        "Authorization": f"Bearer {auth_token}",
        "Content-Type": "application/json"
    }


@pytest.fixture
def qc_team_member(headers):
    """Get or create a QC team member for inspections"""
    # First try to get existing QC team
    response = requests.get(f"{BASE_URL}/api/production/qc-team", headers=headers)
    assert response.status_code == 200
    team = response.json()
    
    if team and len(team) > 0:
        # Find Raju or use first member
        raju = next((m for m in team if m.get("name", "").lower() == "raju"), None)
        if raju:
            return raju
        return team[0]
    
    # Create a test QC team member
    response = requests.post(f"{BASE_URL}/api/production/qc-team", headers=headers, json={
        "name": "Test QC Inspector",
        "role": "Inspector"
    })
    if response.status_code == 200:
        return response.json()
    
    pytest.skip("Could not get or create QC team member")


@pytest.fixture
def rejection_reason(headers):
    """Get or create a rejection reason"""
    response = requests.get(f"{BASE_URL}/api/production/rejection-reasons", headers=headers)
    assert response.status_code == 200
    reasons = response.json()
    
    if reasons and len(reasons) > 0:
        # Find Cap Issues or use first reason
        cap_issues = next((r for r in reasons if "cap" in r.get("name", "").lower()), None)
        if cap_issues:
            return cap_issues
        return reasons[0]
    
    # Create a test rejection reason
    response = requests.post(f"{BASE_URL}/api/production/rejection-reasons", headers=headers, json={
        "name": "Test Rejection Reason",
        "description": "For testing"
    })
    if response.status_code == 200:
        return response.json()
    
    pytest.skip("Could not get or create rejection reason")


def create_test_batch(headers, batch_code_suffix):
    """Helper to create a test batch"""
    batch_code = f"TEST-FIX-{batch_code_suffix}-{uuid.uuid4().hex[:6].upper()}"
    response = requests.post(f"{BASE_URL}/api/production/batches", headers=headers, json={
        "sku_id": SKU_ID,
        "sku_name": SKU_NAME,
        "batch_code": batch_code,
        "production_date": datetime.now().strftime("%Y-%m-%d"),
        "total_crates": 100,
        "bottles_per_crate": BOTTLES_PER_CRATE,
        "ph_value": 7.5,
        "notes": "Test batch for passed stock fix verification"
    })
    return response


class TestPassedStockFix:
    """Test the fix for passed stock calculation after inspection with rejections"""
    
    def test_01_login_and_verify_api_access(self, headers):
        """Verify API access is working"""
        response = requests.get(f"{BASE_URL}/api/production/batches", headers=headers)
        assert response.status_code == 200, f"API access failed: {response.text}"
        print("API access verified")
    
    def test_02_edge_case_zero_rejections(self, headers, qc_team_member, rejection_reason):
        """Edge case: 0 rejections → all inspected crates pass"""
        # Create batch
        resp = create_test_batch(headers, "ZERO-REJ")
        assert resp.status_code == 200, f"Batch creation failed: {resp.text}"
        batch = resp.json()
        batch_id = batch["id"]
        
        try:
            # Get first stage ID from batch
            stages = batch.get("qc_stages", [])
            assert len(stages) > 0, "No QC stages found"
            first_stage = sorted(stages, key=lambda s: s["order"])[0]
            stage_id = first_stage["id"]
            
            # Move 10 crates to first stage
            resp = requests.post(f"{BASE_URL}/api/production/batches/{batch_id}/move", headers=headers, json={
                "to_stage_id": stage_id,
                "quantity": 10,
                "notes": "Test move"
            })
            assert resp.status_code == 200, f"Move failed: {resp.text}"
            
            # Inspect 10 crates with 0 rejections
            resp = requests.post(f"{BASE_URL}/api/production/batches/{batch_id}/inspect", headers=headers, json={
                "stage_id": stage_id,
                "entries": [{
                    "resource_id": qc_team_member["id"],
                    "resource_name": qc_team_member["name"],
                    "date": datetime.now().strftime("%Y-%m-%d"),
                    "qty_inspected": 10,
                    "rejections": []  # No rejections
                }],
                "remarks": "Zero rejection test"
            })
            assert resp.status_code == 200, f"Inspection failed: {resp.text}"
            updated_batch = resp.json()
            
            # Verify: passed = 10 (all inspected crates pass)
            stage_bal = updated_batch.get("stage_balances", {}).get(stage_id, {})
            passed = stage_bal.get("passed", 0)
            rejected = stage_bal.get("rejected", 0)
            
            assert passed == 10, f"Expected 10 passed crates, got {passed}"
            assert rejected == 0, f"Expected 0 rejected bottles, got {rejected}"
            print(f"PASSED: Zero rejections - inspected=10, passed={passed}, rejected={rejected}")
            
        finally:
            # Cleanup - delete batch if in created status
            requests.delete(f"{BASE_URL}/api/production/batches/{batch_id}", headers=headers)
    
    def test_03_edge_case_rejected_less_than_one_crate(self, headers, qc_team_member, rejection_reason):
        """Edge case: rejected bottles < 1 crate equivalent (e.g., 5 bottles at 24 BPC) → 0 crate deduction"""
        resp = create_test_batch(headers, "LESS-1-CRATE")
        assert resp.status_code == 200, f"Batch creation failed: {resp.text}"
        batch = resp.json()
        batch_id = batch["id"]
        
        try:
            stages = batch.get("qc_stages", [])
            first_stage = sorted(stages, key=lambda s: s["order"])[0]
            stage_id = first_stage["id"]
            
            # Move 10 crates to first stage
            resp = requests.post(f"{BASE_URL}/api/production/batches/{batch_id}/move", headers=headers, json={
                "to_stage_id": stage_id,
                "quantity": 10
            })
            assert resp.status_code == 200
            
            # Inspect 10 crates with 5 bottles rejected (5 < 24, so 0 crate deduction)
            resp = requests.post(f"{BASE_URL}/api/production/batches/{batch_id}/inspect", headers=headers, json={
                "stage_id": stage_id,
                "entries": [{
                    "resource_id": qc_team_member["id"],
                    "resource_name": qc_team_member["name"],
                    "date": datetime.now().strftime("%Y-%m-%d"),
                    "qty_inspected": 10,
                    "rejections": [{
                        "qty_rejected": 5,  # 5 bottles < 24 BPC
                        "reason": rejection_reason["name"]
                    }]
                }]
            })
            assert resp.status_code == 200, f"Inspection failed: {resp.text}"
            updated_batch = resp.json()
            
            # Verify: passed = 10 - floor(5/24) = 10 - 0 = 10
            stage_bal = updated_batch.get("stage_balances", {}).get(stage_id, {})
            passed = stage_bal.get("passed", 0)
            rejected = stage_bal.get("rejected", 0)
            
            # floor(5/24) = 0, so passed should be 10
            expected_passed = 10 - (5 // BOTTLES_PER_CRATE)  # 10 - 0 = 10
            assert passed == expected_passed, f"Expected {expected_passed} passed crates, got {passed}"
            assert rejected == 5, f"Expected 5 rejected bottles, got {rejected}"
            print(f"PASSED: 5 bottles rejected (< 1 crate) - inspected=10, passed={passed}, rejected={rejected}")
            
        finally:
            requests.delete(f"{BASE_URL}/api/production/batches/{batch_id}", headers=headers)
    
    def test_04_edge_case_rejected_exactly_one_crate(self, headers, qc_team_member, rejection_reason):
        """Edge case: rejected bottles = exactly 1 crate equivalent (24 bottles at 24 BPC) → 1 crate deducted"""
        resp = create_test_batch(headers, "EXACT-1-CRATE")
        assert resp.status_code == 200
        batch = resp.json()
        batch_id = batch["id"]
        
        try:
            stages = batch.get("qc_stages", [])
            first_stage = sorted(stages, key=lambda s: s["order"])[0]
            stage_id = first_stage["id"]
            
            # Move 10 crates
            resp = requests.post(f"{BASE_URL}/api/production/batches/{batch_id}/move", headers=headers, json={
                "to_stage_id": stage_id,
                "quantity": 10
            })
            assert resp.status_code == 200
            
            # Inspect 10 crates with 24 bottles rejected (exactly 1 crate)
            resp = requests.post(f"{BASE_URL}/api/production/batches/{batch_id}/inspect", headers=headers, json={
                "stage_id": stage_id,
                "entries": [{
                    "resource_id": qc_team_member["id"],
                    "resource_name": qc_team_member["name"],
                    "date": datetime.now().strftime("%Y-%m-%d"),
                    "qty_inspected": 10,
                    "rejections": [{
                        "qty_rejected": 24,  # Exactly 1 crate worth
                        "reason": rejection_reason["name"]
                    }]
                }]
            })
            assert resp.status_code == 200, f"Inspection failed: {resp.text}"
            updated_batch = resp.json()
            
            # Verify: passed = 10 - floor(24/24) = 10 - 1 = 9
            stage_bal = updated_batch.get("stage_balances", {}).get(stage_id, {})
            passed = stage_bal.get("passed", 0)
            rejected = stage_bal.get("rejected", 0)
            
            expected_passed = 10 - (24 // BOTTLES_PER_CRATE)  # 10 - 1 = 9
            assert passed == expected_passed, f"Expected {expected_passed} passed crates, got {passed}"
            assert rejected == 24, f"Expected 24 rejected bottles, got {rejected}"
            print(f"PASSED: 24 bottles rejected (= 1 crate) - inspected=10, passed={passed}, rejected={rejected}")
            
        finally:
            requests.delete(f"{BASE_URL}/api/production/batches/{batch_id}", headers=headers)
    
    def test_05_edge_case_rejected_more_than_one_crate(self, headers, qc_team_member, rejection_reason):
        """Edge case: rejected bottles > 1 crate equivalent (48 bottles at 24 BPC) → 2 crates deducted"""
        resp = create_test_batch(headers, "MORE-1-CRATE")
        assert resp.status_code == 200
        batch = resp.json()
        batch_id = batch["id"]
        
        try:
            stages = batch.get("qc_stages", [])
            first_stage = sorted(stages, key=lambda s: s["order"])[0]
            stage_id = first_stage["id"]
            
            # Move 10 crates
            resp = requests.post(f"{BASE_URL}/api/production/batches/{batch_id}/move", headers=headers, json={
                "to_stage_id": stage_id,
                "quantity": 10
            })
            assert resp.status_code == 200
            
            # Inspect 10 crates with 48 bottles rejected (2 crates worth)
            resp = requests.post(f"{BASE_URL}/api/production/batches/{batch_id}/inspect", headers=headers, json={
                "stage_id": stage_id,
                "entries": [{
                    "resource_id": qc_team_member["id"],
                    "resource_name": qc_team_member["name"],
                    "date": datetime.now().strftime("%Y-%m-%d"),
                    "qty_inspected": 10,
                    "rejections": [{
                        "qty_rejected": 48,  # 2 crates worth
                        "reason": rejection_reason["name"]
                    }]
                }]
            })
            assert resp.status_code == 200, f"Inspection failed: {resp.text}"
            updated_batch = resp.json()
            
            # Verify: passed = 10 - floor(48/24) = 10 - 2 = 8
            stage_bal = updated_batch.get("stage_balances", {}).get(stage_id, {})
            passed = stage_bal.get("passed", 0)
            rejected = stage_bal.get("rejected", 0)
            
            expected_passed = 10 - (48 // BOTTLES_PER_CRATE)  # 10 - 2 = 8
            assert passed == expected_passed, f"Expected {expected_passed} passed crates, got {passed}"
            assert rejected == 48, f"Expected 48 rejected bottles, got {rejected}"
            print(f"PASSED: 48 bottles rejected (= 2 crates) - inspected=10, passed={passed}, rejected={rejected}")
            
        finally:
            requests.delete(f"{BASE_URL}/api/production/batches/{batch_id}", headers=headers)
    
    def test_06_move_to_next_stage_uses_passed_count(self, headers, qc_team_member, rejection_reason):
        """Verify move to next stage uses passed count (not inspected count)"""
        resp = create_test_batch(headers, "MOVE-PASSED")
        assert resp.status_code == 200
        batch = resp.json()
        batch_id = batch["id"]
        
        try:
            stages = sorted(batch.get("qc_stages", []), key=lambda s: s["order"])
            assert len(stages) >= 2, "Need at least 2 stages"
            stage_1_id = stages[0]["id"]
            stage_2_id = stages[1]["id"]
            
            # Move 10 crates to stage 1
            resp = requests.post(f"{BASE_URL}/api/production/batches/{batch_id}/move", headers=headers, json={
                "to_stage_id": stage_1_id,
                "quantity": 10
            })
            assert resp.status_code == 200
            
            # Inspect 10 crates with 48 bottles rejected (2 crates deducted, 8 passed)
            resp = requests.post(f"{BASE_URL}/api/production/batches/{batch_id}/inspect", headers=headers, json={
                "stage_id": stage_1_id,
                "entries": [{
                    "resource_id": qc_team_member["id"],
                    "resource_name": qc_team_member["name"],
                    "date": datetime.now().strftime("%Y-%m-%d"),
                    "qty_inspected": 10,
                    "rejections": [{
                        "qty_rejected": 48,
                        "reason": rejection_reason["name"]
                    }]
                }]
            })
            assert resp.status_code == 200
            updated_batch = resp.json()
            
            # Verify stage 1 has 8 passed
            stage_1_bal = updated_batch.get("stage_balances", {}).get(stage_1_id, {})
            passed_stage_1 = stage_1_bal.get("passed", 0)
            assert passed_stage_1 == 8, f"Expected 8 passed in stage 1, got {passed_stage_1}"
            
            # Try to move 8 crates to stage 2 (should succeed)
            resp = requests.post(f"{BASE_URL}/api/production/batches/{batch_id}/move", headers=headers, json={
                "to_stage_id": stage_2_id,
                "quantity": 8
            })
            assert resp.status_code == 200, f"Move of 8 crates should succeed: {resp.text}"
            print("PASSED: Move of 8 crates (= passed count) succeeded")
            
        finally:
            requests.delete(f"{BASE_URL}/api/production/batches/{batch_id}", headers=headers)
    
    def test_07_move_fails_if_quantity_exceeds_passed(self, headers, qc_team_member, rejection_reason):
        """Move to next stage should fail if quantity > passed count"""
        resp = create_test_batch(headers, "MOVE-FAIL")
        assert resp.status_code == 200
        batch = resp.json()
        batch_id = batch["id"]
        
        try:
            stages = sorted(batch.get("qc_stages", []), key=lambda s: s["order"])
            assert len(stages) >= 2
            stage_1_id = stages[0]["id"]
            stage_2_id = stages[1]["id"]
            
            # Move 10 crates to stage 1
            resp = requests.post(f"{BASE_URL}/api/production/batches/{batch_id}/move", headers=headers, json={
                "to_stage_id": stage_1_id,
                "quantity": 10
            })
            assert resp.status_code == 200
            
            # Inspect 10 crates with 48 bottles rejected (8 passed)
            resp = requests.post(f"{BASE_URL}/api/production/batches/{batch_id}/inspect", headers=headers, json={
                "stage_id": stage_1_id,
                "entries": [{
                    "resource_id": qc_team_member["id"],
                    "resource_name": qc_team_member["name"],
                    "date": datetime.now().strftime("%Y-%m-%d"),
                    "qty_inspected": 10,
                    "rejections": [{
                        "qty_rejected": 48,
                        "reason": rejection_reason["name"]
                    }]
                }]
            })
            assert resp.status_code == 200
            
            # Try to move 10 crates to stage 2 (should fail - only 8 passed)
            resp = requests.post(f"{BASE_URL}/api/production/batches/{batch_id}/move", headers=headers, json={
                "to_stage_id": stage_2_id,
                "quantity": 10  # Trying to move more than passed
            })
            assert resp.status_code == 400, f"Move of 10 crates should fail (only 8 passed): {resp.text}"
            error_detail = resp.json().get("detail", "")
            assert "8" in error_detail or "passed" in error_detail.lower(), f"Error should mention available count: {error_detail}"
            print(f"PASSED: Move of 10 crates correctly failed - {error_detail}")
            
        finally:
            requests.delete(f"{BASE_URL}/api/production/batches/{batch_id}", headers=headers)
    
    def test_08_move_succeeds_if_quantity_equals_passed(self, headers, qc_team_member, rejection_reason):
        """Move to next stage should succeed if quantity <= passed count"""
        resp = create_test_batch(headers, "MOVE-OK")
        assert resp.status_code == 200
        batch = resp.json()
        batch_id = batch["id"]
        
        try:
            stages = sorted(batch.get("qc_stages", []), key=lambda s: s["order"])
            assert len(stages) >= 2
            stage_1_id = stages[0]["id"]
            stage_2_id = stages[1]["id"]
            
            # Move 10 crates to stage 1
            resp = requests.post(f"{BASE_URL}/api/production/batches/{batch_id}/move", headers=headers, json={
                "to_stage_id": stage_1_id,
                "quantity": 10
            })
            assert resp.status_code == 200
            
            # Inspect 10 crates with 24 bottles rejected (9 passed)
            resp = requests.post(f"{BASE_URL}/api/production/batches/{batch_id}/inspect", headers=headers, json={
                "stage_id": stage_1_id,
                "entries": [{
                    "resource_id": qc_team_member["id"],
                    "resource_name": qc_team_member["name"],
                    "date": datetime.now().strftime("%Y-%m-%d"),
                    "qty_inspected": 10,
                    "rejections": [{
                        "qty_rejected": 24,  # 1 crate deducted
                        "reason": rejection_reason["name"]
                    }]
                }]
            })
            assert resp.status_code == 200
            
            # Move exactly 9 crates (= passed count)
            resp = requests.post(f"{BASE_URL}/api/production/batches/{batch_id}/move", headers=headers, json={
                "to_stage_id": stage_2_id,
                "quantity": 9
            })
            assert resp.status_code == 200, f"Move of 9 crates should succeed: {resp.text}"
            
            updated_batch = resp.json()
            stage_2_bal = updated_batch.get("stage_balances", {}).get(stage_2_id, {})
            received = stage_2_bal.get("received", 0)
            pending = stage_2_bal.get("pending", 0)
            
            assert received == 9, f"Stage 2 should have received 9 crates, got {received}"
            assert pending == 9, f"Stage 2 should have 9 pending, got {pending}"
            print(f"PASSED: Move of 9 crates succeeded - stage 2 received={received}, pending={pending}")
            
        finally:
            requests.delete(f"{BASE_URL}/api/production/batches/{batch_id}", headers=headers)
    
    def test_09_partial_crate_rejection_floor_division(self, headers, qc_team_member, rejection_reason):
        """Test floor division: 30 bottles rejected at 24 BPC = 1 crate deducted (not 2)"""
        resp = create_test_batch(headers, "FLOOR-DIV")
        assert resp.status_code == 200
        batch = resp.json()
        batch_id = batch["id"]
        
        try:
            stages = batch.get("qc_stages", [])
            first_stage = sorted(stages, key=lambda s: s["order"])[0]
            stage_id = first_stage["id"]
            
            # Move 10 crates
            resp = requests.post(f"{BASE_URL}/api/production/batches/{batch_id}/move", headers=headers, json={
                "to_stage_id": stage_id,
                "quantity": 10
            })
            assert resp.status_code == 200
            
            # Inspect 10 crates with 30 bottles rejected
            # floor(30/24) = 1, so passed = 10 - 1 = 9
            resp = requests.post(f"{BASE_URL}/api/production/batches/{batch_id}/inspect", headers=headers, json={
                "stage_id": stage_id,
                "entries": [{
                    "resource_id": qc_team_member["id"],
                    "resource_name": qc_team_member["name"],
                    "date": datetime.now().strftime("%Y-%m-%d"),
                    "qty_inspected": 10,
                    "rejections": [{
                        "qty_rejected": 30,  # 30 bottles = floor(30/24) = 1 crate
                        "reason": rejection_reason["name"]
                    }]
                }]
            })
            assert resp.status_code == 200, f"Inspection failed: {resp.text}"
            updated_batch = resp.json()
            
            stage_bal = updated_batch.get("stage_balances", {}).get(stage_id, {})
            passed = stage_bal.get("passed", 0)
            rejected = stage_bal.get("rejected", 0)
            
            # floor(30/24) = 1, so passed = 10 - 1 = 9
            expected_passed = 10 - (30 // BOTTLES_PER_CRATE)  # 10 - 1 = 9
            assert passed == expected_passed, f"Expected {expected_passed} passed (floor division), got {passed}"
            assert rejected == 30, f"Expected 30 rejected bottles, got {rejected}"
            print(f"PASSED: Floor division - 30 bottles rejected, floor(30/24)=1, passed={passed}")
            
        finally:
            requests.delete(f"{BASE_URL}/api/production/batches/{batch_id}", headers=headers)
    
    def test_10_multiple_rejection_entries_sum(self, headers, qc_team_member, rejection_reason):
        """Test multiple rejection entries are summed correctly"""
        resp = create_test_batch(headers, "MULTI-REJ")
        assert resp.status_code == 200
        batch = resp.json()
        batch_id = batch["id"]
        
        try:
            stages = batch.get("qc_stages", [])
            first_stage = sorted(stages, key=lambda s: s["order"])[0]
            stage_id = first_stage["id"]
            
            # Move 10 crates
            resp = requests.post(f"{BASE_URL}/api/production/batches/{batch_id}/move", headers=headers, json={
                "to_stage_id": stage_id,
                "quantity": 10
            })
            assert resp.status_code == 200
            
            # Inspect with multiple rejection entries: 12 + 12 = 24 bottles = 1 crate
            resp = requests.post(f"{BASE_URL}/api/production/batches/{batch_id}/inspect", headers=headers, json={
                "stage_id": stage_id,
                "entries": [{
                    "resource_id": qc_team_member["id"],
                    "resource_name": qc_team_member["name"],
                    "date": datetime.now().strftime("%Y-%m-%d"),
                    "qty_inspected": 10,
                    "rejections": [
                        {"qty_rejected": 12, "reason": rejection_reason["name"]},
                        {"qty_rejected": 12, "reason": rejection_reason["name"]}
                    ]
                }]
            })
            assert resp.status_code == 200, f"Inspection failed: {resp.text}"
            updated_batch = resp.json()
            
            stage_bal = updated_batch.get("stage_balances", {}).get(stage_id, {})
            passed = stage_bal.get("passed", 0)
            rejected = stage_bal.get("rejected", 0)
            
            # Total rejected = 12 + 12 = 24, floor(24/24) = 1, passed = 10 - 1 = 9
            expected_passed = 10 - (24 // BOTTLES_PER_CRATE)  # 10 - 1 = 9
            assert passed == expected_passed, f"Expected {expected_passed} passed, got {passed}"
            assert rejected == 24, f"Expected 24 rejected bottles, got {rejected}"
            print(f"PASSED: Multiple rejections summed - 12+12=24 bottles, passed={passed}")
            
        finally:
            requests.delete(f"{BASE_URL}/api/production/batches/{batch_id}", headers=headers)


if __name__ == "__main__":
    pytest.main([__file__, "-v", "--tb=short"])
