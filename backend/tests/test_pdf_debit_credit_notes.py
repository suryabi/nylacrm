"""
Test PDF Generation for Debit/Credit Notes
Tests:
- PDF generation endpoint (generate-monthly-note)
- PDF download endpoint (notes/{note_id}/download)
- PDF content validation (starts with %PDF header)
- Object storage upload/download
"""
import pytest
import requests
import os

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', '').rstrip('/')
TENANT_ID = "nyla-air-water"

# Test credentials
ADMIN_EMAIL = "surya.yadavalli@nylaairwater.earth"
ADMIN_PASSWORD = "test123"

# Test distributor ID from main agent context
TEST_DISTRIBUTOR_ID = "99fb55dc-532c-4e85-b618-6b8a5e552c04"


@pytest.fixture(scope="module")
def auth_token():
    """Get authentication token for admin user"""
    response = requests.post(
        f"{BASE_URL}/api/auth/login",
        json={"email": ADMIN_EMAIL, "password": ADMIN_PASSWORD},
        headers={"X-Tenant-ID": TENANT_ID}
    )
    assert response.status_code == 200, f"Login failed: {response.text}"
    data = response.json()
    # API returns session_token, not token
    return data.get("session_token") or data.get("token")


@pytest.fixture(scope="module")
def auth_headers(auth_token):
    """Get headers with auth token"""
    return {
        "Authorization": f"Bearer {auth_token}",
        "X-Tenant-ID": TENANT_ID,
        "Content-Type": "application/json"
    }


class TestPDFDebitCreditNotes:
    """Test PDF generation and download for debit/credit notes"""
    
    def test_01_login_success(self):
        """Test admin login works"""
        response = requests.post(
            f"{BASE_URL}/api/auth/login",
            json={"email": ADMIN_EMAIL, "password": ADMIN_PASSWORD},
            headers={"X-Tenant-ID": TENANT_ID}
        )
        assert response.status_code == 200
        data = response.json()
        # API returns session_token, not token
        assert "session_token" in data or "token" in data
        print(f"Login successful for {ADMIN_EMAIL}")
    
    def test_02_get_distributor_exists(self, auth_headers):
        """Verify test distributor exists"""
        response = requests.get(
            f"{BASE_URL}/api/distributors/{TEST_DISTRIBUTOR_ID}",
            headers=auth_headers
        )
        assert response.status_code == 200, f"Distributor not found: {response.text}"
        data = response.json()
        print(f"Distributor found: {data.get('distributor_name')} ({data.get('distributor_code')})")
    
    def test_03_get_existing_notes(self, auth_headers):
        """Get existing debit/credit notes for the distributor"""
        response = requests.get(
            f"{BASE_URL}/api/distributors/{TEST_DISTRIBUTOR_ID}/debit-credit-notes",
            headers=auth_headers
        )
        assert response.status_code == 200, f"Failed to get notes: {response.text}"
        data = response.json()
        notes = data.get("notes", [])
        print(f"Found {len(notes)} existing notes")
        
        for note in notes:
            print(f"  - {note.get('note_number')}: {note.get('note_type')} ₹{note.get('amount')} (pdf_path: {note.get('pdf_path', 'None')})")
        
        return notes
    
    def test_04_download_pdf_for_note_with_path(self, auth_headers):
        """Test downloading PDF for a note that has pdf_path stored"""
        # First get notes
        response = requests.get(
            f"{BASE_URL}/api/distributors/{TEST_DISTRIBUTOR_ID}/debit-credit-notes",
            headers=auth_headers
        )
        assert response.status_code == 200
        notes = response.json().get("notes", [])
        
        # Find a note with pdf_path
        note_with_pdf = None
        for note in notes:
            if note.get("pdf_path"):
                note_with_pdf = note
                break
        
        if not note_with_pdf:
            pytest.skip("No notes with pdf_path found - will test on-demand generation instead")
        
        note_id = note_with_pdf["id"]
        note_number = note_with_pdf.get("note_number")
        print(f"Testing download for note {note_number} (has pdf_path: {note_with_pdf.get('pdf_path')})")
        
        # Download PDF
        response = requests.get(
            f"{BASE_URL}/api/distributors/{TEST_DISTRIBUTOR_ID}/notes/{note_id}/download",
            headers=auth_headers
        )
        
        assert response.status_code == 200, f"PDF download failed: {response.text}"
        assert response.headers.get("Content-Type") == "application/pdf"
        
        # Verify PDF content starts with %PDF header
        pdf_content = response.content
        assert pdf_content[:4] == b'%PDF', f"Invalid PDF header: {pdf_content[:20]}"
        
        print(f"PDF downloaded successfully: {len(pdf_content)} bytes")
        print(f"PDF header: {pdf_content[:20]}")
    
    def test_05_download_pdf_on_demand_generation(self, auth_headers):
        """Test downloading PDF for a note without pdf_path (on-demand generation)"""
        # First get notes
        response = requests.get(
            f"{BASE_URL}/api/distributors/{TEST_DISTRIBUTOR_ID}/debit-credit-notes",
            headers=auth_headers
        )
        assert response.status_code == 200
        notes = response.json().get("notes", [])
        
        # Find a note without pdf_path
        note_without_pdf = None
        for note in notes:
            if not note.get("pdf_path"):
                note_without_pdf = note
                break
        
        if not note_without_pdf:
            # All notes have PDF - just test any note
            if notes:
                note_without_pdf = notes[0]
                print(f"All notes have pdf_path, testing download for {note_without_pdf.get('note_number')}")
            else:
                pytest.skip("No notes found for testing")
        else:
            print(f"Testing on-demand PDF generation for note {note_without_pdf.get('note_number')} (no pdf_path)")
        
        note_id = note_without_pdf["id"]
        
        # Download PDF (should generate on-demand if not exists)
        response = requests.get(
            f"{BASE_URL}/api/distributors/{TEST_DISTRIBUTOR_ID}/notes/{note_id}/download",
            headers=auth_headers
        )
        
        assert response.status_code == 200, f"PDF download/generation failed: {response.text}"
        assert response.headers.get("Content-Type") == "application/pdf"
        
        # Verify PDF content
        pdf_content = response.content
        assert pdf_content[:4] == b'%PDF', f"Invalid PDF header: {pdf_content[:20]}"
        
        print(f"PDF downloaded/generated successfully: {len(pdf_content)} bytes")
    
    def test_06_download_pdf_invalid_note_id(self, auth_headers):
        """Test downloading PDF for non-existent note returns 404"""
        response = requests.get(
            f"{BASE_URL}/api/distributors/{TEST_DISTRIBUTOR_ID}/notes/invalid-note-id/download",
            headers=auth_headers
        )
        assert response.status_code == 404
        print("Correctly returned 404 for invalid note ID")
    
    def test_07_monthly_reconciliation_data(self, auth_headers):
        """Test monthly reconciliation endpoint returns data"""
        # Test for January 2026
        response = requests.get(
            f"{BASE_URL}/api/distributors/{TEST_DISTRIBUTOR_ID}/monthly-reconciliation?month=1&year=2026",
            headers=auth_headers
        )
        assert response.status_code == 200, f"Monthly reconciliation failed: {response.text}"
        data = response.json()
        
        print(f"Monthly reconciliation data for Jan 2026:")
        print(f"  - Total unreconciled: {data.get('total_unreconciled', 0)}")
        print(f"  - Total reconciled: {data.get('total_reconciled', 0)}")
        print(f"  - Net adjustment: ₹{data.get('net_adjustment', 0)}")
        print(f"  - Existing notes: {data.get('total_notes', 0)}")
    
    def test_08_generate_note_requires_auth(self):
        """Test generate note endpoint requires authentication"""
        response = requests.post(
            f"{BASE_URL}/api/distributors/{TEST_DISTRIBUTOR_ID}/generate-monthly-note",
            json={"month": 1, "year": 2026},
            headers={"X-Tenant-ID": TENANT_ID, "Content-Type": "application/json"}
        )
        assert response.status_code == 401, f"Expected 401, got {response.status_code}"
        print("Correctly requires authentication")
    
    def test_09_generate_note_requires_month_year(self, auth_headers):
        """Test generate note endpoint requires month and year"""
        response = requests.post(
            f"{BASE_URL}/api/distributors/{TEST_DISTRIBUTOR_ID}/generate-monthly-note",
            json={},
            headers=auth_headers
        )
        assert response.status_code == 400, f"Expected 400, got {response.status_code}: {response.text}"
        print("Correctly validates month/year requirement")
    
    def test_10_pdf_content_validation(self, auth_headers):
        """Validate PDF content structure"""
        # Get any note
        response = requests.get(
            f"{BASE_URL}/api/distributors/{TEST_DISTRIBUTOR_ID}/debit-credit-notes",
            headers=auth_headers
        )
        assert response.status_code == 200
        notes = response.json().get("notes", [])
        
        if not notes:
            pytest.skip("No notes available for PDF validation")
        
        note = notes[0]
        note_id = note["id"]
        
        # Download PDF
        response = requests.get(
            f"{BASE_URL}/api/distributors/{TEST_DISTRIBUTOR_ID}/notes/{note_id}/download",
            headers=auth_headers
        )
        
        assert response.status_code == 200
        pdf_content = response.content
        
        # Validate PDF structure
        assert pdf_content[:4] == b'%PDF', "PDF must start with %PDF header"
        assert b'%%EOF' in pdf_content[-100:] or b'%%EOF' in pdf_content, "PDF should contain EOF marker"
        
        # Check Content-Disposition header
        content_disp = response.headers.get("Content-Disposition", "")
        assert "attachment" in content_disp, "Should have attachment disposition"
        assert ".pdf" in content_disp, "Filename should have .pdf extension"
        
        print(f"PDF validation passed:")
        print(f"  - Size: {len(pdf_content)} bytes")
        print(f"  - Header: {pdf_content[:8]}")
        print(f"  - Content-Disposition: {content_disp}")


class TestPDFGenerationFlow:
    """Test the full PDF generation flow"""
    
    def test_01_check_unreconciled_settlements(self, auth_headers):
        """Check if there are unreconciled settlements available"""
        response = requests.get(
            f"{BASE_URL}/api/distributors/{TEST_DISTRIBUTOR_ID}/monthly-reconciliation?month=1&year=2026",
            headers=auth_headers
        )
        assert response.status_code == 200
        data = response.json()
        
        unreconciled = data.get("total_unreconciled", 0)
        net_adjustment = data.get("net_adjustment", 0)
        
        print(f"Unreconciled settlements: {unreconciled}")
        print(f"Net adjustment: ₹{net_adjustment}")
        
        if unreconciled == 0:
            print("No unreconciled settlements - note generation would fail (expected)")
        else:
            print(f"Can generate note for ₹{abs(net_adjustment)}")
    
    def test_02_verify_note_has_pdf_fields(self, auth_headers):
        """Verify notes have PDF-related fields"""
        response = requests.get(
            f"{BASE_URL}/api/distributors/{TEST_DISTRIBUTOR_ID}/debit-credit-notes",
            headers=auth_headers
        )
        assert response.status_code == 200
        notes = response.json().get("notes", [])
        
        if not notes:
            pytest.skip("No notes to verify")
        
        for note in notes:
            note_number = note.get("note_number")
            has_pdf_path = "pdf_path" in note and note.get("pdf_path")
            has_pdf_size = "pdf_size" in note
            has_pdf_generated_at = "pdf_generated_at" in note
            
            print(f"Note {note_number}:")
            print(f"  - pdf_path: {note.get('pdf_path', 'None')}")
            print(f"  - pdf_size: {note.get('pdf_size', 'None')}")
            print(f"  - pdf_generated_at: {note.get('pdf_generated_at', 'None')}")
            
            # At least some notes should have PDF info
            if has_pdf_path:
                assert note.get("pdf_path").startswith("nyla-crm/"), "PDF path should start with app name"


if __name__ == "__main__":
    pytest.main([__file__, "-v", "--tb=short"])
