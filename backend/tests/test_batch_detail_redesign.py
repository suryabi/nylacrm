"""
Test suite for Batch Detail Page Redesign
Tests the two-column layout, pH badge, compact info row, quality bar, stage cards,
rejection summary, activity log, inspection form, move/receive form, and warehouse transfer.
"""
import pytest
import requests
import os

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', '').rstrip('/')

class TestBatchDetailRedesign:
    """Tests for the redesigned batch detail page APIs"""
    
    @pytest.fixture(autouse=True)
    def setup(self):
        """Setup test fixtures"""
        # Login and get token
        response = requests.post(f"{BASE_URL}/api/auth/login", json={
            "email": "surya.yadavalli@nylaairwater.earth",
            "password": "test123"
        })
        assert response.status_code == 200, f"Login failed: {response.text}"
        self.token = response.json().get('session_token')
        self.headers = {
            'Authorization': f'Bearer {self.token}',
            'Content-Type': 'application/json'
        }
        # Test batch IDs
        self.batch_660g = "e476fca6-3a91-480b-96b8-b8fbb3e55e37"  # 660G-APR-001 with rich rejection data
        self.batch_test_fix = "a93ea877-d0e1-45ca-b6d0-c3bd3e85f8a9"  # TEST-FIX-001 with pending items
        self.batch_created = "790149fb-d1d2-485a-bbcc-50e995bb2b8f"  # 20L-APR-004 with created status
    
    # ============ Batch Detail API Tests ============
    
    def test_batch_detail_returns_ph_value(self):
        """Test that batch detail includes pH value for pH badge display"""
        response = requests.get(
            f"{BASE_URL}/api/production/batches/{self.batch_660g}",
            headers=self.headers
        )
        assert response.status_code == 200
        data = response.json()
        assert 'ph_value' in data, "pH value should be in response"
        assert data['ph_value'] == 8.5, f"Expected pH 8.5, got {data['ph_value']}"
    
    def test_batch_detail_returns_compact_info_fields(self):
        """Test that batch detail includes fields for compact info row"""
        response = requests.get(
            f"{BASE_URL}/api/production/batches/{self.batch_660g}",
            headers=self.headers
        )
        assert response.status_code == 200
        data = response.json()
        
        # Check required fields for compact info row
        assert 'production_date' in data, "production_date required for info row"
        assert 'total_crates' in data, "total_crates required for info row"
        assert 'bottles_per_crate' in data, "bottles_per_crate required for info row"
        assert 'total_bottles' in data, "total_bottles required for info row"
        
        # Verify values
        assert data['total_crates'] == 120
        assert data['bottles_per_crate'] == 24
        assert data['total_bottles'] == 2880
    
    def test_batch_detail_returns_quality_metrics(self):
        """Test that batch detail includes metrics for overall quality bar"""
        response = requests.get(
            f"{BASE_URL}/api/production/batches/{self.batch_660g}",
            headers=self.headers
        )
        assert response.status_code == 200
        data = response.json()
        
        # Check quality metrics
        assert 'total_bottles' in data
        assert 'total_rejected' in data
        assert data['total_rejected'] == 222, f"Expected 222 rejected, got {data['total_rejected']}"
        
        # Calculate expected percentages
        total = data['total_bottles']
        rejected = data['total_rejected']
        rej_pct = (rejected / total) * 100
        assert 7.5 < rej_pct < 8.0, f"Rejection percentage should be ~7.7%, got {rej_pct:.1f}%"
    
    def test_batch_detail_returns_stage_balances(self):
        """Test that batch detail includes stage balances for stage cards"""
        response = requests.get(
            f"{BASE_URL}/api/production/batches/{self.batch_660g}",
            headers=self.headers
        )
        assert response.status_code == 200
        data = response.json()
        
        assert 'stage_balances' in data, "stage_balances required for stage cards"
        balances = data['stage_balances']
        
        # Check that each stage has required fields
        for stage_id, bal in balances.items():
            assert 'received' in bal, f"Stage {stage_id} missing 'received'"
            assert 'pending' in bal, f"Stage {stage_id} missing 'pending'"
            assert 'passed' in bal, f"Stage {stage_id} missing 'passed'"
            assert 'rejected' in bal, f"Stage {stage_id} missing 'rejected'"
    
    def test_batch_detail_returns_qc_stages(self):
        """Test that batch detail includes QC stages for stage cards"""
        response = requests.get(
            f"{BASE_URL}/api/production/batches/{self.batch_660g}",
            headers=self.headers
        )
        assert response.status_code == 200
        data = response.json()
        
        assert 'qc_stages' in data, "qc_stages required for stage cards"
        stages = data['qc_stages']
        assert len(stages) == 4, f"Expected 4 stages, got {len(stages)}"
        
        # Check stage structure
        for stage in stages:
            assert 'id' in stage
            assert 'name' in stage
            assert 'stage_type' in stage
            assert 'order' in stage
    
    # ============ Batch History API Tests ============
    
    def test_batch_history_returns_timeline(self):
        """Test that batch history includes timeline for activity log"""
        response = requests.get(
            f"{BASE_URL}/api/production/batches/{self.batch_660g}/history",
            headers=self.headers
        )
        assert response.status_code == 200
        data = response.json()
        
        assert 'timeline' in data, "timeline required for activity log"
        assert len(data['timeline']) > 0, "Timeline should have entries"
    
    def test_batch_history_returns_inspections_with_rejections(self):
        """Test that batch history includes inspections for rejection summary"""
        response = requests.get(
            f"{BASE_URL}/api/production/batches/{self.batch_660g}/history",
            headers=self.headers
        )
        assert response.status_code == 200
        data = response.json()
        
        assert 'inspections' in data, "inspections required for rejection summary"
        inspections = data['inspections']
        
        # Check that inspections have rejection data
        rejections_found = [i for i in inspections if i.get('qty_rejected', 0) > 0]
        assert len(rejections_found) > 0, "Should have inspections with rejections"
    
    # ============ Supporting API Tests ============
    
    def test_rejection_reasons_api(self):
        """Test rejection reasons API for inspection form dropdown"""
        response = requests.get(
            f"{BASE_URL}/api/production/rejection-reasons",
            headers=self.headers
        )
        assert response.status_code == 200
        data = response.json()
        assert isinstance(data, list), "Should return list of rejection reasons"
        assert len(data) > 0, "Should have at least one rejection reason"
    
    def test_qc_team_api(self):
        """Test QC team API for inspection form resource dropdown"""
        response = requests.get(
            f"{BASE_URL}/api/production/qc-team",
            headers=self.headers
        )
        assert response.status_code == 200
        data = response.json()
        assert isinstance(data, list), "Should return list of QC team members"
        assert len(data) > 0, "Should have at least one QC team member"
    
    def test_factory_warehouses_api(self):
        """Test factory warehouses API for warehouse transfer dropdown"""
        response = requests.get(
            f"{BASE_URL}/api/production/factory-warehouses",
            headers=self.headers
        )
        assert response.status_code == 200
        data = response.json()
        assert 'warehouses' in data, "Should return warehouses list"
    
    def test_warehouse_transfers_api(self):
        """Test warehouse transfers API for transfer history"""
        response = requests.get(
            f"{BASE_URL}/api/production/batches/{self.batch_660g}/warehouse-transfers",
            headers=self.headers
        )
        assert response.status_code == 200
        data = response.json()
        assert 'transfers' in data, "Should return transfers list"
    
    # ============ Batch Status Tests ============
    
    def test_batch_with_created_status(self):
        """Test batch with 'created' status for delete button visibility"""
        response = requests.get(
            f"{BASE_URL}/api/production/batches/{self.batch_created}",
            headers=self.headers
        )
        assert response.status_code == 200
        data = response.json()
        assert data['status'] == 'created', f"Expected 'created' status, got {data['status']}"
    
    def test_batch_with_pending_items(self):
        """Test batch with pending items for inspect button visibility"""
        response = requests.get(
            f"{BASE_URL}/api/production/batches/{self.batch_test_fix}",
            headers=self.headers
        )
        assert response.status_code == 200
        data = response.json()
        
        # Check for pending items in stage balances
        balances = data.get('stage_balances', {})
        has_pending = any(bal.get('pending', 0) > 0 for bal in balances.values())
        assert has_pending, "Should have at least one stage with pending items"
    
    # ============ pH Value Tests ============
    
    def test_ph_value_8_5_batch(self):
        """Test batch with pH 8.5 (660G-APR-001)"""
        response = requests.get(
            f"{BASE_URL}/api/production/batches/{self.batch_660g}",
            headers=self.headers
        )
        assert response.status_code == 200
        data = response.json()
        assert data['ph_value'] == 8.5
    
    def test_ph_value_7_5_batch(self):
        """Test batch with pH 7.5 (TEST-FIX-001)"""
        response = requests.get(
            f"{BASE_URL}/api/production/batches/{self.batch_test_fix}",
            headers=self.headers
        )
        assert response.status_code == 200
        data = response.json()
        assert data['ph_value'] == 7.5


if __name__ == "__main__":
    pytest.main([__file__, "-v"])
