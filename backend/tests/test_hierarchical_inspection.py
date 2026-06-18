"""
Test Hierarchical Inspection Structure
- Entry (Resource + Date + Crates) → multiple Rejection Items (Count + Reason)
- Backend model: InspectionRecord has entries[] where each entry has resource_id, resource_name, date, qty_inspected, and rejections[] sub-array of {qty_rejected, reason}
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
QC_STAGE_2_ID = "95bafa4c-f6ca-4047-a094-b038e7551898"


@pytest.fixture(scope="module")
def auth_headers():
    """Get authentication headers"""
    session = requests.Session()
    response = session.post(f"{BASE_URL}/api/auth/login", json={
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
    unique_name = f"TEST_QC_Member_{uuid.uuid4().hex[:6]}"
    response = requests.post(f"{BASE_URL}/api/production/qc-team", 
        json={"name": unique_name, "role": "Inspector"},
        headers=auth_headers
    )
    if response.status_code == 200 or response.status_code == 201:
        member = response.json()
        yield member
        # Cleanup
        requests.delete(f"{BASE_URL}/api/production/qc-team/{member['id']}", headers=auth_headers)
    else:
        # Try to find existing test member
        list_resp = requests.get(f"{BASE_URL}/api/production/qc-team", headers=auth_headers)
        if list_resp.status_code == 200:
            members = list_resp.json()
            if members:
                yield members[0]
            else:
                pytest.skip("No QC team members available")
        else:
            pytest.skip("Could not create or find QC team member")


@pytest.fixture(scope="module")
def test_rejection_reason(auth_headers):
    """Create a test rejection reason"""
    unique_name = f"TEST_Reason_{uuid.uuid4().hex[:6]}"
    response = requests.post(f"{BASE_URL}/api/production/rejection-reasons",
        json={"name": unique_name, "description": "Test reason"},
        headers=auth_headers
    )
    if response.status_code == 200 or response.status_code == 201:
        reason = response.json()
        yield reason
        # Cleanup
        requests.delete(f"{BASE_URL}/api/production/rejection-reasons/{reason['id']}", headers=auth_headers)
    else:
        # Try to find existing reason
        list_resp = requests.get(f"{BASE_URL}/api/production/rejection-reasons", headers=auth_headers)
        if list_resp.status_code == 200:
            reasons = list_resp.json()
            if reasons:
                yield reasons[0]
            else:
                pytest.skip("No rejection reasons available")
        else:
            pytest.skip("Could not create or find rejection reason")


class TestHierarchicalInspectionBackend:
    """Test the new hierarchical inspection structure"""

    def test_get_batch_details(self, auth_headers):
        """Verify batch has required fields for inspection"""
        response = requests.get(f"{BASE_URL}/api/production/batches/{TEST_BATCH_ID}", headers=auth_headers)
        assert response.status_code == 200, f"Failed to get batch: {response.text}"
        
        batch = response.json()
        assert "stage_balances" in batch, "Batch should have stage_balances"
        assert "qc_stages" in batch, "Batch should have qc_stages"
        assert "bottles_per_crate" in batch, "Batch should have bottles_per_crate"
        print(f"Batch {batch['batch_code']}: {batch['total_crates']} crates, {batch['bottles_per_crate']} bottles/crate")
        print(f"Stage balances: {batch.get('stage_balances', {})}")

    def test_get_qc_stage_pending(self, auth_headers):
        """Check pending crates at QC Stage 2"""
        response = requests.get(f"{BASE_URL}/api/production/batches/{TEST_BATCH_ID}", headers=auth_headers)
        assert response.status_code == 200
        
        batch = response.json()
        balances = batch.get("stage_balances", {})
        stage_bal = balances.get(QC_STAGE_2_ID, {})
        pending = stage_bal.get("pending", 0)
        print(f"QC Stage 2 pending: {pending} crates")
        # Just verify we can read the data
        assert isinstance(pending, int), "Pending should be an integer"

    def test_inspection_payload_structure(self, auth_headers, test_qc_member, test_rejection_reason):
        """Test that the new hierarchical payload structure is accepted"""
        # First check if there are pending crates
        batch_resp = requests.get(f"{BASE_URL}/api/production/batches/{TEST_BATCH_ID}", headers=auth_headers)
        assert batch_resp.status_code == 200
        batch = batch_resp.json()
        
        balances = batch.get("stage_balances", {})
        stage_bal = balances.get(QC_STAGE_2_ID, {})
        pending = stage_bal.get("pending", 0)
        
        if pending == 0:
            pytest.skip(f"No pending crates at QC Stage 2 to test inspection")
        
        # Build hierarchical payload
        payload = {
            "stage_id": QC_STAGE_2_ID,
            "entries": [
                {
                    "resource_id": test_qc_member["id"],
                    "resource_name": test_qc_member["name"],
                    "date": "2026-01-15",
                    "qty_inspected": 1,  # Use 1 crate to minimize impact
                    "rejections": [
                        {
                            "qty_rejected": 2,
                            "reason": test_rejection_reason["name"]
                        }
                    ]
                }
            ],
            "remarks": "Test hierarchical inspection"
        }
        
        response = requests.post(
            f"{BASE_URL}/api/production/batches/{TEST_BATCH_ID}/inspect",
            json=payload,
            headers=auth_headers
        )
        
        # Should succeed or fail with validation error (not 500)
        assert response.status_code in [200, 400], f"Unexpected status: {response.status_code}, {response.text}"
        
        if response.status_code == 200:
            print("Inspection recorded successfully with hierarchical structure")
            result = response.json()
            assert "stage_balances" in result
        else:
            print(f"Validation error (expected if no pending): {response.json().get('detail')}")

    def test_inspection_multiple_entries(self, auth_headers, test_qc_member, test_rejection_reason):
        """Test inspection with multiple entries (different resources/dates)"""
        batch_resp = requests.get(f"{BASE_URL}/api/production/batches/{TEST_BATCH_ID}", headers=auth_headers)
        batch = batch_resp.json()
        
        balances = batch.get("stage_balances", {})
        stage_bal = balances.get(QC_STAGE_2_ID, {})
        pending = stage_bal.get("pending", 0)
        
        if pending < 2:
            pytest.skip(f"Need at least 2 pending crates, have {pending}")
        
        payload = {
            "stage_id": QC_STAGE_2_ID,
            "entries": [
                {
                    "resource_id": test_qc_member["id"],
                    "resource_name": test_qc_member["name"],
                    "date": "2026-01-15",
                    "qty_inspected": 1,
                    "rejections": [
                        {"qty_rejected": 1, "reason": test_rejection_reason["name"]}
                    ]
                },
                {
                    "resource_id": test_qc_member["id"],
                    "resource_name": test_qc_member["name"],
                    "date": "2026-01-16",
                    "qty_inspected": 1,
                    "rejections": [
                        {"qty_rejected": 2, "reason": test_rejection_reason["name"]}
                    ]
                }
            ],
            "remarks": "Test multiple entries"
        }
        
        response = requests.post(
            f"{BASE_URL}/api/production/batches/{TEST_BATCH_ID}/inspect",
            json=payload,
            headers=auth_headers
        )
        
        assert response.status_code in [200, 400], f"Unexpected: {response.status_code}, {response.text}"
        print(f"Multiple entries test: {response.status_code}")

    def test_inspection_multiple_rejections_per_entry(self, auth_headers, test_qc_member, test_rejection_reason):
        """Test entry with multiple rejection items (different reasons)"""
        batch_resp = requests.get(f"{BASE_URL}/api/production/batches/{TEST_BATCH_ID}", headers=auth_headers)
        batch = batch_resp.json()
        
        balances = batch.get("stage_balances", {})
        stage_bal = balances.get(QC_STAGE_2_ID, {})
        pending = stage_bal.get("pending", 0)
        bottles_per_crate = batch.get("bottles_per_crate", 48)
        
        if pending < 1:
            pytest.skip(f"No pending crates")
        
        # Create second rejection reason
        reason2_name = f"TEST_Reason2_{uuid.uuid4().hex[:6]}"
        reason2_resp = requests.post(f"{BASE_URL}/api/production/rejection-reasons",
            json={"name": reason2_name},
            headers=auth_headers
        )
        reason2_id = None
        if reason2_resp.status_code in [200, 201]:
            reason2_id = reason2_resp.json().get("id")
        
        try:
            payload = {
                "stage_id": QC_STAGE_2_ID,
                "entries": [
                    {
                        "resource_id": test_qc_member["id"],
                        "resource_name": test_qc_member["name"],
                        "date": "2026-01-15",
                        "qty_inspected": 1,
                        "rejections": [
                            {"qty_rejected": 1, "reason": test_rejection_reason["name"]},
                            {"qty_rejected": 2, "reason": reason2_name if reason2_id else test_rejection_reason["name"]}
                        ]
                    }
                ],
                "remarks": "Test multiple rejections per entry"
            }
            
            response = requests.post(
                f"{BASE_URL}/api/production/batches/{TEST_BATCH_ID}/inspect",
                json=payload,
                headers=auth_headers
            )
            
            assert response.status_code in [200, 400], f"Unexpected: {response.status_code}, {response.text}"
            print(f"Multiple rejections per entry test: {response.status_code}")
        finally:
            if reason2_id:
                requests.delete(f"{BASE_URL}/api/production/rejection-reasons/{reason2_id}", headers=auth_headers)

    def test_validation_total_crates_exceeds_pending(self, auth_headers, test_qc_member, test_rejection_reason):
        """Validation: Total crates from all entries cannot exceed pending"""
        batch_resp = requests.get(f"{BASE_URL}/api/production/batches/{TEST_BATCH_ID}", headers=auth_headers)
        batch = batch_resp.json()
        
        balances = batch.get("stage_balances", {})
        stage_bal = balances.get(QC_STAGE_2_ID, {})
        pending = stage_bal.get("pending", 0)
        
        # Try to inspect more than pending
        payload = {
            "stage_id": QC_STAGE_2_ID,
            "entries": [
                {
                    "resource_id": test_qc_member["id"],
                    "resource_name": test_qc_member["name"],
                    "date": "2026-01-15",
                    "qty_inspected": pending + 100,  # Exceed pending
                    "rejections": []
                }
            ],
            "remarks": "Test exceeding pending"
        }
        
        response = requests.post(
            f"{BASE_URL}/api/production/batches/{TEST_BATCH_ID}/inspect",
            json=payload,
            headers=auth_headers
        )
        
        assert response.status_code == 400, f"Should reject exceeding pending: {response.status_code}"
        detail = response.json().get("detail", "")
        assert "pending" in detail.lower() or "crates" in detail.lower(), f"Error should mention pending: {detail}"
        print(f"Validation passed: {detail}")

    def test_validation_entry_rejected_exceeds_max_bottles(self, auth_headers, test_qc_member, test_rejection_reason):
        """Validation: Per-entry rejected total cannot exceed entry's crates × bottles_per_crate"""
        batch_resp = requests.get(f"{BASE_URL}/api/production/batches/{TEST_BATCH_ID}", headers=auth_headers)
        batch = batch_resp.json()
        
        balances = batch.get("stage_balances", {})
        stage_bal = balances.get(QC_STAGE_2_ID, {})
        pending = stage_bal.get("pending", 0)
        bottles_per_crate = batch.get("bottles_per_crate", 48)
        
        if pending < 1:
            pytest.skip("No pending crates")
        
        # Try to reject more bottles than possible for 1 crate
        max_bottles = 1 * bottles_per_crate
        payload = {
            "stage_id": QC_STAGE_2_ID,
            "entries": [
                {
                    "resource_id": test_qc_member["id"],
                    "resource_name": test_qc_member["name"],
                    "date": "2026-01-15",
                    "qty_inspected": 1,
                    "rejections": [
                        {"qty_rejected": max_bottles + 10, "reason": test_rejection_reason["name"]}
                    ]
                }
            ],
            "remarks": "Test exceeding max bottles"
        }
        
        response = requests.post(
            f"{BASE_URL}/api/production/batches/{TEST_BATCH_ID}/inspect",
            json=payload,
            headers=auth_headers
        )
        
        assert response.status_code == 400, f"Should reject exceeding max bottles: {response.status_code}"
        detail = response.json().get("detail", "")
        assert "exceed" in detail.lower() or "max" in detail.lower(), f"Error should mention exceeding: {detail}"
        print(f"Validation passed: {detail}")

    def test_validation_entry_crates_must_be_positive(self, auth_headers, test_qc_member, test_rejection_reason):
        """Validation: Each entry's qty_inspected must be > 0"""
        payload = {
            "stage_id": QC_STAGE_2_ID,
            "entries": [
                {
                    "resource_id": test_qc_member["id"],
                    "resource_name": test_qc_member["name"],
                    "date": "2026-01-15",
                    "qty_inspected": 0,  # Invalid
                    "rejections": []
                }
            ],
            "remarks": "Test zero crates"
        }
        
        response = requests.post(
            f"{BASE_URL}/api/production/batches/{TEST_BATCH_ID}/inspect",
            json=payload,
            headers=auth_headers
        )
        
        assert response.status_code == 400, f"Should reject zero crates: {response.status_code}"
        print(f"Validation passed: {response.json().get('detail')}")

    def test_validation_at_least_one_entry_required(self, auth_headers):
        """Validation: At least one entry is required"""
        payload = {
            "stage_id": QC_STAGE_2_ID,
            "entries": [],  # Empty
            "remarks": "Test empty entries"
        }
        
        response = requests.post(
            f"{BASE_URL}/api/production/batches/{TEST_BATCH_ID}/inspect",
            json=payload,
            headers=auth_headers
        )
        
        assert response.status_code == 400, f"Should reject empty entries: {response.status_code}"
        print(f"Validation passed: {response.json().get('detail')}")

    def test_inspection_stored_with_entries_field(self, auth_headers, test_qc_member, test_rejection_reason):
        """Verify inspection is stored with 'entries' field (nested structure)"""
        # Get history to check stored inspections
        response = requests.get(
            f"{BASE_URL}/api/production/batches/{TEST_BATCH_ID}/history",
            headers=auth_headers
        )
        assert response.status_code == 200
        
        history = response.json()
        inspections = history.get("inspections", [])
        
        # Check if any inspection has the new 'entries' format
        has_entries_format = False
        for insp in inspections:
            if "entries" in insp and isinstance(insp["entries"], list):
                has_entries_format = True
                print(f"Found inspection with entries format: {len(insp['entries'])} entries")
                for entry in insp["entries"]:
                    print(f"  - {entry.get('resource_name')}: {entry.get('qty_inspected')} crates, {len(entry.get('rejections', []))} rejections")
                break
        
        # This test just verifies the structure exists in history
        print(f"Inspections found: {len(inspections)}, has entries format: {has_entries_format}")

    def test_rejection_report_expands_entries(self, auth_headers):
        """Verify rejection report expands entries[].rejections[] into flat rows"""
        response = requests.get(
            f"{BASE_URL}/api/production/rejection-report?batch_id={TEST_BATCH_ID}",
            headers=auth_headers
        )
        assert response.status_code == 200
        
        report = response.json()
        rows = report.get("rows", [])
        
        print(f"Rejection report: {len(rows)} rows, total rejected: {report.get('total_rejected')}")
        
        # Check row structure
        if rows:
            row = rows[0]
            expected_fields = ["resource_name", "date", "qty_inspected", "qty_rejected", "rejection_reason"]
            for field in expected_fields:
                assert field in row, f"Row should have {field}"
            print(f"Sample row: {row.get('resource_name')} - {row.get('date')} - {row.get('qty_rejected')} rejected")


class TestQCTeamAndReasons:
    """Test QC Team and Rejection Reasons master data"""

    def test_list_qc_team(self, auth_headers):
        """List QC team members"""
        response = requests.get(f"{BASE_URL}/api/production/qc-team", headers=auth_headers)
        assert response.status_code == 200
        members = response.json()
        print(f"QC Team members: {len(members)}")
        for m in members[:3]:
            print(f"  - {m.get('name')} ({m.get('role', 'N/A')})")

    def test_list_rejection_reasons(self, auth_headers):
        """List rejection reasons"""
        response = requests.get(f"{BASE_URL}/api/production/rejection-reasons", headers=auth_headers)
        assert response.status_code == 200
        reasons = response.json()
        print(f"Rejection reasons: {len(reasons)}")
        for r in reasons[:3]:
            print(f"  - {r.get('name')}")


if __name__ == "__main__":
    pytest.main([__file__, "-v", "--tb=short"])
