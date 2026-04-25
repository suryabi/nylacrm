"""
Marketing Spreadsheet Upload/Download Feature Tests
Tests: Template download, Export posts, Upload preview, Upload confirm (replace posts)
"""

import pytest
import requests
import os
import io

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', '').rstrip('/')

# Test credentials
TEST_EMAIL = "surya.yadavalli@nylaairwater.earth"
TEST_PASSWORD = "test123"
TEST_TENANT = "nyla-air-water"


@pytest.fixture(scope="module")
def auth_token():
    """Get authentication token"""
    response = requests.post(f"{BASE_URL}/api/auth/login", json={
        "email": TEST_EMAIL,
        "password": TEST_PASSWORD,
        "tenant_id": TEST_TENANT
    })
    assert response.status_code == 200, f"Login failed: {response.text}"
    data = response.json()
    token = data.get("session_token") or data.get("token")
    assert token, "No token in response"
    return token


@pytest.fixture(scope="module")
def auth_headers(auth_token):
    """Auth headers for requests"""
    return {"Authorization": f"Bearer {auth_token}"}


class TestTemplateDownload:
    """Tests for GET /api/marketing/template"""
    
    def test_template_download_returns_xlsx(self, auth_headers):
        """Template endpoint returns xlsx file"""
        response = requests.get(f"{BASE_URL}/api/marketing/template", headers=auth_headers)
        assert response.status_code == 200, f"Template download failed: {response.status_code}"
        
        # Check content type is xlsx
        content_type = response.headers.get('Content-Type', '')
        assert 'spreadsheet' in content_type or 'octet-stream' in content_type, f"Unexpected content type: {content_type}"
        
        # Check content disposition has filename
        content_disp = response.headers.get('Content-Disposition', '')
        assert 'attachment' in content_disp, f"Missing attachment disposition: {content_disp}"
        assert '.xlsx' in content_disp, f"Missing xlsx extension: {content_disp}"
        
        # Check content is not empty
        assert len(response.content) > 0, "Template file is empty"
        print(f"Template downloaded: {len(response.content)} bytes")
    
    def test_template_download_requires_auth(self):
        """Template endpoint requires authentication"""
        response = requests.get(f"{BASE_URL}/api/marketing/template")
        assert response.status_code in [401, 403], f"Expected auth error, got: {response.status_code}"


class TestExportPosts:
    """Tests for GET /api/marketing/export?month=X&year=Y"""
    
    def test_export_april_2026_returns_xlsx(self, auth_headers):
        """Export endpoint returns xlsx for April 2026"""
        response = requests.get(f"{BASE_URL}/api/marketing/export?month=4&year=2026", headers=auth_headers)
        assert response.status_code == 200, f"Export failed: {response.status_code}"
        
        # Check content type
        content_type = response.headers.get('Content-Type', '')
        assert 'spreadsheet' in content_type or 'octet-stream' in content_type, f"Unexpected content type: {content_type}"
        
        # Check filename in disposition
        content_disp = response.headers.get('Content-Disposition', '')
        assert 'marketing_calendar_2026_04.xlsx' in content_disp, f"Unexpected filename: {content_disp}"
        
        # Check content is not empty
        assert len(response.content) > 0, "Export file is empty"
        print(f"Export downloaded: {len(response.content)} bytes")
    
    def test_export_requires_month_and_year(self, auth_headers):
        """Export requires month and year parameters"""
        # Missing both
        response = requests.get(f"{BASE_URL}/api/marketing/export", headers=auth_headers)
        assert response.status_code == 422, f"Expected 422 for missing params, got: {response.status_code}"
        
        # Missing year
        response = requests.get(f"{BASE_URL}/api/marketing/export?month=4", headers=auth_headers)
        assert response.status_code == 422, f"Expected 422 for missing year, got: {response.status_code}"
        
        # Missing month
        response = requests.get(f"{BASE_URL}/api/marketing/export?year=2026", headers=auth_headers)
        assert response.status_code == 422, f"Expected 422 for missing month, got: {response.status_code}"
    
    def test_export_empty_month_returns_xlsx(self, auth_headers):
        """Export for month with no posts still returns valid xlsx"""
        # Use a month unlikely to have posts
        response = requests.get(f"{BASE_URL}/api/marketing/export?month=1&year=2020", headers=auth_headers)
        assert response.status_code == 200, f"Export failed: {response.status_code}"
        assert len(response.content) > 0, "Export file is empty"


class TestUploadPreview:
    """Tests for POST /api/marketing/upload-preview"""
    
    def test_upload_preview_parses_exported_xlsx(self, auth_headers):
        """Upload preview parses an exported xlsx file"""
        # First export the current data
        export_resp = requests.get(f"{BASE_URL}/api/marketing/export?month=4&year=2026", headers=auth_headers)
        assert export_resp.status_code == 200, "Export failed"
        
        # Upload the exported file for preview
        files = {'file': ('test_export.xlsx', io.BytesIO(export_resp.content), 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')}
        response = requests.post(f"{BASE_URL}/api/marketing/upload-preview", headers=auth_headers, files=files)
        
        assert response.status_code == 200, f"Upload preview failed: {response.status_code} - {response.text}"
        data = response.json()
        
        # Check response structure
        assert 'rows' in data, "Missing 'rows' in response"
        assert 'total' in data, "Missing 'total' in response"
        assert 'valid_count' in data, "Missing 'valid_count' in response"
        assert 'error_count' in data, "Missing 'error_count' in response"
        
        print(f"Parsed {data['total']} rows, {data['valid_count']} valid, {data['error_count']} errors")
        
        # If there are rows, check structure
        if data['rows']:
            row = data['rows'][0]
            assert 'row_num' in row, "Missing row_num"
            assert 'post_date' in row, "Missing post_date"
            assert 'concept' in row, "Missing concept"
            assert 'valid' in row, "Missing valid flag"
    
    def test_upload_preview_parses_template(self, auth_headers):
        """Upload preview parses the template file"""
        # Download template
        template_resp = requests.get(f"{BASE_URL}/api/marketing/template", headers=auth_headers)
        assert template_resp.status_code == 200, "Template download failed"
        
        # Upload template for preview
        files = {'file': ('template.xlsx', io.BytesIO(template_resp.content), 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')}
        response = requests.post(f"{BASE_URL}/api/marketing/upload-preview", headers=auth_headers, files=files)
        
        assert response.status_code == 200, f"Upload preview failed: {response.status_code} - {response.text}"
        data = response.json()
        
        # Template has a sample row
        assert data['total'] >= 1, "Template should have at least 1 sample row"
        print(f"Template parsed: {data['total']} rows")
    
    def test_upload_preview_validates_missing_date(self, auth_headers):
        """Upload preview marks rows with missing date as invalid"""
        # Create a simple CSV with missing date
        csv_content = """Post Date,Category,Content Type,Concept,Message / Caption,Platforms,Status
,Health,reel,Test Concept,Test message,linkedin,draft
2026-04-15,Water,image,Valid Concept,Valid message,instagram,draft"""
        
        files = {'file': ('test.csv', io.BytesIO(csv_content.encode()), 'text/csv')}
        response = requests.post(f"{BASE_URL}/api/marketing/upload-preview", headers=auth_headers, files=files)
        
        assert response.status_code == 200, f"Upload preview failed: {response.status_code}"
        data = response.json()
        
        assert data['total'] == 2, f"Expected 2 rows, got {data['total']}"
        assert data['error_count'] >= 1, "Should have at least 1 error for missing date"
        
        # Find the invalid row
        invalid_rows = [r for r in data['rows'] if not r['valid']]
        assert len(invalid_rows) >= 1, "Should have invalid row"
        assert 'Missing date' in str(invalid_rows[0].get('errors', [])), "Should have 'Missing date' error"
    
    def test_upload_preview_validates_missing_concept(self, auth_headers):
        """Upload preview marks rows with missing concept as invalid"""
        csv_content = """Post Date,Category,Content Type,Concept,Message / Caption,Platforms,Status
2026-04-15,Health,reel,,Test message,linkedin,draft
2026-04-16,Water,image,Valid Concept,Valid message,instagram,draft"""
        
        files = {'file': ('test.csv', io.BytesIO(csv_content.encode()), 'text/csv')}
        response = requests.post(f"{BASE_URL}/api/marketing/upload-preview", headers=auth_headers, files=files)
        
        assert response.status_code == 200, f"Upload preview failed: {response.status_code}"
        data = response.json()
        
        assert data['error_count'] >= 1, "Should have at least 1 error for missing concept"
        
        invalid_rows = [r for r in data['rows'] if not r['valid']]
        assert 'Missing concept' in str(invalid_rows[0].get('errors', [])), "Should have 'Missing concept' error"
    
    def test_upload_preview_validates_invalid_content_type(self, auth_headers):
        """Upload preview marks rows with invalid content type as invalid"""
        csv_content = """Post Date,Category,Content Type,Concept,Message / Caption,Platforms,Status
2026-04-15,Health,invalid_type,Test Concept,Test message,linkedin,draft"""
        
        files = {'file': ('test.csv', io.BytesIO(csv_content.encode()), 'text/csv')}
        response = requests.post(f"{BASE_URL}/api/marketing/upload-preview", headers=auth_headers, files=files)
        
        assert response.status_code == 200, f"Upload preview failed: {response.status_code}"
        data = response.json()
        
        assert data['error_count'] >= 1, "Should have error for invalid content type"
    
    def test_upload_preview_requires_file(self, auth_headers):
        """Upload preview requires a file"""
        response = requests.post(f"{BASE_URL}/api/marketing/upload-preview", headers=auth_headers)
        assert response.status_code == 422, f"Expected 422 for missing file, got: {response.status_code}"
    
    def test_upload_preview_handles_csv(self, auth_headers):
        """Upload preview handles CSV files"""
        csv_content = """Post Date,Category,Content Type,Concept,Message / Caption,Platforms,Status
2026-04-15,Health,reel,CSV Test Concept,CSV test message,linkedin,draft"""
        
        files = {'file': ('test.csv', io.BytesIO(csv_content.encode()), 'text/csv')}
        response = requests.post(f"{BASE_URL}/api/marketing/upload-preview", headers=auth_headers, files=files)
        
        assert response.status_code == 200, f"CSV upload failed: {response.status_code}"
        data = response.json()
        assert data['total'] == 1, f"Expected 1 row, got {data['total']}"
        assert data['valid_count'] == 1, "Row should be valid"


class TestUploadConfirm:
    """Tests for POST /api/marketing/upload-confirm"""
    
    def test_upload_confirm_replaces_posts(self, auth_headers):
        """Upload confirm replaces all posts for the month"""
        # First get current posts count for a test month (use December 2025 to avoid affecting April 2026)
        test_month = 12
        test_year = 2025
        
        # Get current posts
        posts_resp = requests.get(f"{BASE_URL}/api/marketing/posts?month={test_month}&year={test_year}", headers=auth_headers)
        assert posts_resp.status_code == 200
        initial_posts = posts_resp.json()
        initial_count = len(initial_posts)
        print(f"Initial posts for {test_year}-{test_month}: {initial_count}")
        
        # Upload new posts
        new_rows = [
            {"post_date": f"{test_year}-{test_month:02d}-10", "category": "Health", "content_type": "reel", "concept": "TEST_Upload Test 1", "message": "Test message 1", "platforms": ["linkedin"], "status": "draft"},
            {"post_date": f"{test_year}-{test_month:02d}-15", "category": "Water", "content_type": "image", "concept": "TEST_Upload Test 2", "message": "Test message 2", "platforms": ["instagram", "facebook"], "status": "review"},
        ]
        
        response = requests.post(f"{BASE_URL}/api/marketing/upload-confirm", headers=auth_headers, json={
            "month": test_month,
            "year": test_year,
            "rows": new_rows
        })
        
        assert response.status_code == 200, f"Upload confirm failed: {response.status_code} - {response.text}"
        data = response.json()
        
        # Check response
        assert 'deleted' in data, "Missing 'deleted' count"
        assert 'inserted' in data, "Missing 'inserted' count"
        assert data['inserted'] == 2, f"Expected 2 inserted, got {data['inserted']}"
        print(f"Deleted: {data['deleted']}, Inserted: {data['inserted']}")
        
        # Verify posts were replaced
        verify_resp = requests.get(f"{BASE_URL}/api/marketing/posts?month={test_month}&year={test_year}", headers=auth_headers)
        assert verify_resp.status_code == 200
        final_posts = verify_resp.json()
        assert len(final_posts) == 2, f"Expected 2 posts, got {len(final_posts)}"
        
        # Verify content
        concepts = [p['concept'] for p in final_posts]
        assert 'TEST_Upload Test 1' in concepts, "Missing first uploaded post"
        assert 'TEST_Upload Test 2' in concepts, "Missing second uploaded post"
        
        # Cleanup - delete test posts
        for post in final_posts:
            requests.delete(f"{BASE_URL}/api/marketing/posts/{post['id']}", headers=auth_headers)
    
    def test_upload_confirm_requires_month_year(self, auth_headers):
        """Upload confirm requires month and year"""
        response = requests.post(f"{BASE_URL}/api/marketing/upload-confirm", headers=auth_headers, json={
            "rows": [{"post_date": "2026-04-15", "concept": "Test"}]
        })
        assert response.status_code == 400, f"Expected 400 for missing month/year, got: {response.status_code}"
    
    def test_upload_confirm_requires_rows(self, auth_headers):
        """Upload confirm requires rows"""
        response = requests.post(f"{BASE_URL}/api/marketing/upload-confirm", headers=auth_headers, json={
            "month": 4,
            "year": 2026,
            "rows": []
        })
        assert response.status_code == 400, f"Expected 400 for empty rows, got: {response.status_code}"
    
    def test_upload_confirm_returns_counts(self, auth_headers):
        """Upload confirm returns deleted and inserted counts"""
        # Use a unique test month
        test_month = 11
        test_year = 2025
        
        # First ensure there's at least one post
        create_resp = requests.post(f"{BASE_URL}/api/marketing/posts", headers=auth_headers, json={
            "post_date": f"{test_year}-{test_month:02d}-05",
            "concept": "TEST_Pre-existing post",
            "content_type": "image",
            "platforms": ["linkedin"]
        })
        assert create_resp.status_code == 200
        
        # Now upload to replace
        response = requests.post(f"{BASE_URL}/api/marketing/upload-confirm", headers=auth_headers, json={
            "month": test_month,
            "year": test_year,
            "rows": [
                {"post_date": f"{test_year}-{test_month:02d}-10", "concept": "TEST_Replacement post", "content_type": "reel", "platforms": ["instagram"]}
            ]
        })
        
        assert response.status_code == 200
        data = response.json()
        
        assert data['deleted'] >= 1, "Should have deleted at least 1 post"
        assert data['inserted'] == 1, "Should have inserted 1 post"
        assert 'message' in data, "Should have message"
        
        # Cleanup
        verify_resp = requests.get(f"{BASE_URL}/api/marketing/posts?month={test_month}&year={test_year}", headers=auth_headers)
        for post in verify_resp.json():
            requests.delete(f"{BASE_URL}/api/marketing/posts/{post['id']}", headers=auth_headers)


class TestEndToEndUploadFlow:
    """End-to-end test of the upload flow"""
    
    def test_full_upload_flow(self, auth_headers):
        """Test complete flow: export -> preview -> confirm"""
        # Use a test month
        test_month = 10
        test_year = 2025
        
        # 1. Create some initial posts
        for i in range(3):
            requests.post(f"{BASE_URL}/api/marketing/posts", headers=auth_headers, json={
                "post_date": f"{test_year}-{test_month:02d}-{10+i:02d}",
                "concept": f"TEST_Initial Post {i+1}",
                "content_type": "image",
                "platforms": ["linkedin", "instagram"]
            })
        
        # 2. Export the month
        export_resp = requests.get(f"{BASE_URL}/api/marketing/export?month={test_month}&year={test_year}", headers=auth_headers)
        assert export_resp.status_code == 200, "Export failed"
        print(f"Exported {len(export_resp.content)} bytes")
        
        # 3. Upload for preview
        files = {'file': ('export.xlsx', io.BytesIO(export_resp.content), 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')}
        preview_resp = requests.post(f"{BASE_URL}/api/marketing/upload-preview", headers=auth_headers, files=files)
        assert preview_resp.status_code == 200, f"Preview failed: {preview_resp.text}"
        preview_data = preview_resp.json()
        print(f"Preview: {preview_data['total']} rows, {preview_data['valid_count']} valid")
        
        # 4. Confirm upload (this will replace with same data)
        valid_rows = [r for r in preview_data['rows'] if r['valid']]
        if valid_rows:
            confirm_resp = requests.post(f"{BASE_URL}/api/marketing/upload-confirm", headers=auth_headers, json={
                "month": test_month,
                "year": test_year,
                "rows": valid_rows
            })
            assert confirm_resp.status_code == 200, f"Confirm failed: {confirm_resp.text}"
            confirm_data = confirm_resp.json()
            print(f"Confirmed: deleted {confirm_data['deleted']}, inserted {confirm_data['inserted']}")
        
        # 5. Cleanup
        posts_resp = requests.get(f"{BASE_URL}/api/marketing/posts?month={test_month}&year={test_year}", headers=auth_headers)
        for post in posts_resp.json():
            requests.delete(f"{BASE_URL}/api/marketing/posts/{post['id']}", headers=auth_headers)


if __name__ == "__main__":
    pytest.main([__file__, "-v"])
