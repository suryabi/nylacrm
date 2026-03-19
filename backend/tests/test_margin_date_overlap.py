"""
Test Margin Matrix Date Overlap Validation
Tests for multiple margin entries per SKU with non-overlapping date ranges
"""
import pytest
import requests
import os

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', '').rstrip('/')

# Test credentials from user spec
TEST_EMAIL = "surya.yadavalli@nylaairwater.earth"
TEST_PASSWORD = "test123"
TENANT_ID = "nyla-air-water"

# Test distributor and SKU IDs from user spec
DISTRIBUTOR_ID = "99fb55dc-532c-4e85-b618-6b8a5e552c04"
SKU_ID = "b39203a7-4067-458b-a316-5831a98be946"  # Nyla 330ml Silver
CITY = "Gurugram"
STATE = "Haryana"

class TestMarginDateOverlap:
    """Tests for date overlap validation on margin entries"""
    
    @pytest.fixture(autouse=True)
    def setup(self):
        """Login and get auth token"""
        self.session = requests.Session()
        self.session.headers.update({
            "Content-Type": "application/json",
            "X-Tenant-ID": TENANT_ID
        })
        
        # Login
        login_response = self.session.post(f"{BASE_URL}/api/auth/login", json={
            "email": TEST_EMAIL,
            "password": TEST_PASSWORD
        })
        
        if login_response.status_code != 200:
            pytest.skip(f"Login failed: {login_response.status_code}")
        
        token = login_response.json().get("token")
        self.session.headers.update({"Authorization": f"Bearer {token}"})
        self.created_margin_ids = []
        yield
        
        # Cleanup: Delete test-created margin entries
        for margin_id in self.created_margin_ids:
            try:
                self.session.delete(f"{BASE_URL}/api/distributors/{DISTRIBUTOR_ID}/margins/{margin_id}")
            except:
                pass
    
    def test_can_list_margins_for_sku(self):
        """Test: Can list existing margin entries for a city"""
        response = self.session.get(f"{BASE_URL}/api/distributors/{DISTRIBUTOR_ID}/margins?city={CITY}")
        
        assert response.status_code == 200, f"Failed to list margins: {response.text}"
        data = response.json()
        assert "margins" in data
        print(f"Found {len(data['margins'])} margin entries for {CITY}")
        
        # Check for existing SKU entries
        sku_entries = [m for m in data['margins'] if m.get('sku_id') == SKU_ID]
        print(f"Found {len(sku_entries)} entries for Nyla 330ml Silver SKU")
        for entry in sku_entries:
            print(f"  - ID: {entry['id'][:8]}..., Base: {entry.get('base_price')}, From: {entry.get('active_from')}, To: {entry.get('active_to')}")
    
    def test_create_margin_with_non_overlapping_dates(self):
        """Test: Can create a margin entry with non-overlapping date range"""
        # First, get existing entries to find a safe date range
        response = self.session.get(f"{BASE_URL}/api/distributors/{DISTRIBUTOR_ID}/margins?city={CITY}")
        assert response.status_code == 200
        
        # Using year 2030 which should be far enough in the future
        margin_data = {
            "distributor_id": DISTRIBUTOR_ID,
            "state": STATE,
            "city": CITY,
            "sku_id": SKU_ID,
            "sku_name": "Nyla – 330 ml / Silver",
            "base_price": 200,
            "margin_type": "percentage",
            "margin_value": 5.0,
            "active_from": "2030-01-01",
            "active_to": "2030-12-31"
        }
        
        create_response = self.session.post(
            f"{BASE_URL}/api/distributors/{DISTRIBUTOR_ID}/margins",
            json=margin_data
        )
        
        assert create_response.status_code == 200, f"Failed to create margin: {create_response.text}"
        created = create_response.json()
        self.created_margin_ids.append(created['id'])
        
        assert created['sku_id'] == SKU_ID
        assert created['base_price'] == 200
        assert created['margin_value'] == 5.0
        assert created['active_from'] == "2030-01-01"
        assert created['active_to'] == "2030-12-31"
        print(f"Successfully created margin entry with ID: {created['id']}")
    
    def test_reject_overlapping_date_range_on_create(self):
        """Test: API rejects new entry that overlaps with existing entry"""
        # First create a margin entry with known dates
        first_margin = {
            "distributor_id": DISTRIBUTOR_ID,
            "state": STATE,
            "city": CITY,
            "sku_id": SKU_ID,
            "sku_name": "Nyla – 330 ml / Silver",
            "base_price": 150,
            "margin_type": "percentage",
            "margin_value": 3.0,
            "active_from": "2031-01-01",
            "active_to": "2031-06-30"
        }
        
        create_response = self.session.post(
            f"{BASE_URL}/api/distributors/{DISTRIBUTOR_ID}/margins",
            json=first_margin
        )
        
        assert create_response.status_code == 200, f"Failed to create first margin: {create_response.text}"
        first_id = create_response.json()['id']
        self.created_margin_ids.append(first_id)
        print(f"Created first margin entry: {first_id}")
        
        # Now try to create an overlapping entry (overlap in the middle)
        overlapping_margin = {
            "distributor_id": DISTRIBUTOR_ID,
            "state": STATE,
            "city": CITY,
            "sku_id": SKU_ID,
            "sku_name": "Nyla – 330 ml / Silver",
            "base_price": 160,
            "margin_type": "percentage",
            "margin_value": 3.5,
            "active_from": "2031-03-01",  # Overlaps with 2031-01-01 to 2031-06-30
            "active_to": "2031-08-31"
        }
        
        overlap_response = self.session.post(
            f"{BASE_URL}/api/distributors/{DISTRIBUTOR_ID}/margins",
            json=overlapping_margin
        )
        
        # Should be rejected with 400
        assert overlap_response.status_code == 400, f"Expected 400 for overlapping dates, got {overlap_response.status_code}"
        error_detail = overlap_response.json().get('detail', '')
        assert 'overlap' in error_detail.lower(), f"Error should mention overlap: {error_detail}"
        print(f"Correctly rejected overlapping entry: {error_detail}")
    
    def test_reject_fully_contained_date_range(self):
        """Test: Rejects entry whose range is fully contained in existing entry"""
        # Create an entry that spans a full year
        first_margin = {
            "distributor_id": DISTRIBUTOR_ID,
            "state": STATE,
            "city": CITY,
            "sku_id": SKU_ID,
            "sku_name": "Nyla – 330 ml / Silver",
            "base_price": 180,
            "margin_type": "percentage",
            "margin_value": 4.0,
            "active_from": "2032-01-01",
            "active_to": "2032-12-31"
        }
        
        create_response = self.session.post(
            f"{BASE_URL}/api/distributors/{DISTRIBUTOR_ID}/margins",
            json=first_margin
        )
        
        assert create_response.status_code == 200, f"Failed to create first margin: {create_response.text}"
        self.created_margin_ids.append(create_response.json()['id'])
        
        # Try to create entry fully contained within
        contained_margin = {
            "distributor_id": DISTRIBUTOR_ID,
            "state": STATE,
            "city": CITY,
            "sku_id": SKU_ID,
            "sku_name": "Nyla – 330 ml / Silver",
            "base_price": 185,
            "margin_type": "percentage",
            "margin_value": 4.5,
            "active_from": "2032-06-01",  # Fully within 2032-01-01 to 2032-12-31
            "active_to": "2032-09-30"
        }
        
        overlap_response = self.session.post(
            f"{BASE_URL}/api/distributors/{DISTRIBUTOR_ID}/margins",
            json=contained_margin
        )
        
        assert overlap_response.status_code == 400, f"Expected 400 for contained dates, got {overlap_response.status_code}"
        print(f"Correctly rejected fully contained entry")
    
    def test_allow_adjacent_date_ranges(self):
        """Test: Adjacent (non-overlapping) date ranges are allowed"""
        # Create first entry
        first_margin = {
            "distributor_id": DISTRIBUTOR_ID,
            "state": STATE,
            "city": CITY,
            "sku_id": SKU_ID,
            "sku_name": "Nyla – 330 ml / Silver",
            "base_price": 190,
            "margin_type": "percentage",
            "margin_value": 2.0,
            "active_from": "2033-01-01",
            "active_to": "2033-06-30"
        }
        
        create_response = self.session.post(
            f"{BASE_URL}/api/distributors/{DISTRIBUTOR_ID}/margins",
            json=first_margin
        )
        
        assert create_response.status_code == 200, f"Failed to create first margin: {create_response.text}"
        self.created_margin_ids.append(create_response.json()['id'])
        
        # Create adjacent entry (starts day after first ends)
        adjacent_margin = {
            "distributor_id": DISTRIBUTOR_ID,
            "state": STATE,
            "city": CITY,
            "sku_id": SKU_ID,
            "sku_name": "Nyla – 330 ml / Silver",
            "base_price": 195,
            "margin_type": "percentage",
            "margin_value": 2.5,
            "active_from": "2033-07-01",  # Day after first ends
            "active_to": "2033-12-31"
        }
        
        adjacent_response = self.session.post(
            f"{BASE_URL}/api/distributors/{DISTRIBUTOR_ID}/margins",
            json=adjacent_margin
        )
        
        assert adjacent_response.status_code == 200, f"Adjacent dates should be allowed: {adjacent_response.text}"
        self.created_margin_ids.append(adjacent_response.json()['id'])
        print(f"Successfully created adjacent margin entries")
    
    def test_update_margin_entry_dates(self):
        """Test: Can update margin entry dates"""
        # Create a margin entry
        margin_data = {
            "distributor_id": DISTRIBUTOR_ID,
            "state": STATE,
            "city": CITY,
            "sku_id": SKU_ID,
            "sku_name": "Nyla – 330 ml / Silver",
            "base_price": 210,
            "margin_type": "percentage",
            "margin_value": 3.0,
            "active_from": "2034-01-01",
            "active_to": "2034-06-30"
        }
        
        create_response = self.session.post(
            f"{BASE_URL}/api/distributors/{DISTRIBUTOR_ID}/margins",
            json=margin_data
        )
        
        assert create_response.status_code == 200, f"Failed to create margin: {create_response.text}"
        margin_id = create_response.json()['id']
        self.created_margin_ids.append(margin_id)
        
        # Update the dates
        update_response = self.session.put(
            f"{BASE_URL}/api/distributors/{DISTRIBUTOR_ID}/margins/{margin_id}",
            json={
                "active_from": "2034-02-01",
                "active_to": "2034-08-31"
            }
        )
        
        assert update_response.status_code == 200, f"Failed to update margin: {update_response.text}"
        updated = update_response.json()
        assert updated['active_from'] == "2034-02-01"
        assert updated['active_to'] == "2034-08-31"
        print(f"Successfully updated margin entry dates")
    
    def test_update_rejects_overlapping_dates(self):
        """Test: Update API also rejects overlapping dates"""
        # Create two non-overlapping entries
        first_margin = {
            "distributor_id": DISTRIBUTOR_ID,
            "state": STATE,
            "city": CITY,
            "sku_id": SKU_ID,
            "sku_name": "Nyla – 330 ml / Silver",
            "base_price": 220,
            "margin_type": "percentage",
            "margin_value": 2.0,
            "active_from": "2035-01-01",
            "active_to": "2035-06-30"
        }
        
        create_response = self.session.post(
            f"{BASE_URL}/api/distributors/{DISTRIBUTOR_ID}/margins",
            json=first_margin
        )
        assert create_response.status_code == 200, f"Failed to create first margin: {create_response.text}"
        first_id = create_response.json()['id']
        self.created_margin_ids.append(first_id)
        
        second_margin = {
            "distributor_id": DISTRIBUTOR_ID,
            "state": STATE,
            "city": CITY,
            "sku_id": SKU_ID,
            "sku_name": "Nyla – 330 ml / Silver",
            "base_price": 225,
            "margin_type": "percentage",
            "margin_value": 2.5,
            "active_from": "2035-07-01",
            "active_to": "2035-12-31"
        }
        
        create_response2 = self.session.post(
            f"{BASE_URL}/api/distributors/{DISTRIBUTOR_ID}/margins",
            json=second_margin
        )
        assert create_response2.status_code == 200, f"Failed to create second margin: {create_response2.text}"
        second_id = create_response2.json()['id']
        self.created_margin_ids.append(second_id)
        
        # Try to update second entry to overlap with first
        update_response = self.session.put(
            f"{BASE_URL}/api/distributors/{DISTRIBUTOR_ID}/margins/{second_id}",
            json={
                "active_from": "2035-05-01",  # Would overlap with first
                "active_to": "2035-12-31"
            }
        )
        
        assert update_response.status_code == 400, f"Expected 400 for overlapping update, got {update_response.status_code}"
        print(f"Correctly rejected overlapping update")
    
    def test_delete_margin_entry(self):
        """Test: Can delete a margin entry"""
        # Create a margin entry
        margin_data = {
            "distributor_id": DISTRIBUTOR_ID,
            "state": STATE,
            "city": CITY,
            "sku_id": SKU_ID,
            "sku_name": "Nyla – 330 ml / Silver",
            "base_price": 230,
            "margin_type": "percentage",
            "margin_value": 3.5,
            "active_from": "2036-01-01",
            "active_to": "2036-12-31"
        }
        
        create_response = self.session.post(
            f"{BASE_URL}/api/distributors/{DISTRIBUTOR_ID}/margins",
            json=margin_data
        )
        
        assert create_response.status_code == 200, f"Failed to create margin: {create_response.text}"
        margin_id = create_response.json()['id']
        
        # Delete it
        delete_response = self.session.delete(
            f"{BASE_URL}/api/distributors/{DISTRIBUTOR_ID}/margins/{margin_id}"
        )
        
        assert delete_response.status_code == 200, f"Failed to delete margin: {delete_response.text}"
        print(f"Successfully deleted margin entry")
        
        # Verify it's gone
        get_response = self.session.get(f"{BASE_URL}/api/distributors/{DISTRIBUTOR_ID}/margins/{margin_id}")
        assert get_response.status_code == 404
    
    def test_margin_list_summary_counts(self):
        """Test: Margin list returns correct summary counts"""
        response = self.session.get(f"{BASE_URL}/api/distributors/{DISTRIBUTOR_ID}/margins?city={CITY}")
        
        assert response.status_code == 200
        data = response.json()
        
        # Check that summary fields are present
        assert "total" in data
        assert "active" in data
        print(f"Summary - Total: {data['total']}, Active: {data['active']}")
        
        # Verify counts
        margins = data['margins']
        assert data['total'] == len(margins)
