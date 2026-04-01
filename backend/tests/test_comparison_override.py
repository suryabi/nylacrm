"""
Test suite for Month-on-Month Comparison Table Editable Feature
Tests: Revenue and Outstanding row overrides, reset functionality
"""
import pytest
import requests
import os

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', '').rstrip('/')

class TestComparisonOverride:
    """Tests for comparison table override endpoints"""
    
    @pytest.fixture(autouse=True)
    def setup(self):
        """Setup test fixtures - login and get auth token"""
        self.session = requests.Session()
        self.session.headers.update({"Content-Type": "application/json"})
        
        # Login to get token
        login_response = self.session.post(f"{BASE_URL}/api/auth/login", json={
            "email": "surya.yadavalli@nylaairwater.earth",
            "password": "test123"
        })
        assert login_response.status_code == 200, f"Login failed: {login_response.text}"
        login_data = login_response.json()
        
        # Auth returns session_token (not token)
        token = login_data.get("session_token") or login_data.get("token")
        assert token, f"No token in response: {login_data}"
        
        self.session.headers.update({
            "Authorization": f"Bearer {token}",
            "X-Tenant-ID": "nyla-air-water"
        })
        
        # Get first plan and resource for testing
        plans_response = self.session.get(f"{BASE_URL}/api/performance/target-plans")
        assert plans_response.status_code == 200
        plans = plans_response.json()
        assert len(plans) > 0, "No target plans found"
        self.plan_id = plans[0]["id"]
        
        resources_response = self.session.get(f"{BASE_URL}/api/performance/resources-for-plan/{self.plan_id}")
        assert resources_response.status_code == 200
        resources = resources_response.json()
        assert len(resources) > 0, "No resources found for plan"
        self.resource_id = resources[0]["resource_id"]
        
        # Use current month/year for testing
        from datetime import datetime
        now = datetime.now()
        self.test_month = now.month
        self.test_year = now.year
        
        yield
        
        # Cleanup: Reset any overrides created during tests
        try:
            self.session.delete(
                f"{BASE_URL}/api/performance/comparison/override",
                params={
                    "resource_id": self.resource_id,
                    "plan_id": self.plan_id,
                    "month": self.test_month,
                    "year": self.test_year,
                    "field": "revenue"
                }
            )
            self.session.delete(
                f"{BASE_URL}/api/performance/comparison/override",
                params={
                    "resource_id": self.resource_id,
                    "plan_id": self.plan_id,
                    "month": self.test_month,
                    "year": self.test_year,
                    "field": "outstanding"
                }
            )
        except:
            pass

    def test_get_comparison_returns_override_flags(self):
        """GET /api/performance/comparison returns has_revenue_override and has_outstanding_override flags"""
        response = self.session.get(
            f"{BASE_URL}/api/performance/comparison",
            params={
                "resource_id": self.resource_id,
                "plan_id": self.plan_id,
                "months": 3
            }
        )
        assert response.status_code == 200, f"Failed: {response.text}"
        data = response.json()
        
        assert "months" in data, "Response should have 'months' array"
        assert len(data["months"]) > 0, "Should have at least one month"
        
        # Check each month has the required flags
        for month_data in data["months"]:
            assert "has_revenue_override" in month_data, f"Missing has_revenue_override in {month_data}"
            assert "has_outstanding_override" in month_data, f"Missing has_outstanding_override in {month_data}"
            assert "auto_revenue" in month_data, f"Missing auto_revenue in {month_data}"
            assert "auto_outstanding" in month_data, f"Missing auto_outstanding in {month_data}"
            assert isinstance(month_data["has_revenue_override"], bool)
            assert isinstance(month_data["has_outstanding_override"], bool)
        
        print(f"✓ Comparison returns override flags for {len(data['months'])} months")

    def test_post_revenue_override_saves_correctly(self):
        """POST /api/performance/comparison/override saves manual_revenue correctly"""
        test_value = 12345.67
        
        response = self.session.post(
            f"{BASE_URL}/api/performance/comparison/override",
            json={
                "resource_id": self.resource_id,
                "plan_id": self.plan_id,
                "month": self.test_month,
                "year": self.test_year,
                "field": "revenue",
                "value": test_value
            }
        )
        assert response.status_code == 200, f"Failed to save override: {response.text}"
        
        # Verify by fetching comparison
        comp_response = self.session.get(
            f"{BASE_URL}/api/performance/comparison",
            params={
                "resource_id": self.resource_id,
                "plan_id": self.plan_id,
                "months": 3
            }
        )
        assert comp_response.status_code == 200
        data = comp_response.json()
        
        # Find the month we just updated
        target_month = next(
            (m for m in data["months"] if m["month"] == self.test_month and m["year"] == self.test_year),
            None
        )
        assert target_month is not None, f"Could not find month {self.test_month}/{self.test_year}"
        assert target_month["has_revenue_override"] == True, "has_revenue_override should be True"
        assert target_month["revenue_achieved"] == test_value, f"revenue_achieved should be {test_value}, got {target_month['revenue_achieved']}"
        
        print(f"✓ Revenue override saved: {test_value}")

    def test_post_outstanding_override_saves_correctly(self):
        """POST /api/performance/comparison/override saves manual_outstanding correctly"""
        test_value = 54321.89
        
        response = self.session.post(
            f"{BASE_URL}/api/performance/comparison/override",
            json={
                "resource_id": self.resource_id,
                "plan_id": self.plan_id,
                "month": self.test_month,
                "year": self.test_year,
                "field": "outstanding",
                "value": test_value
            }
        )
        assert response.status_code == 200, f"Failed to save override: {response.text}"
        
        # Verify by fetching comparison
        comp_response = self.session.get(
            f"{BASE_URL}/api/performance/comparison",
            params={
                "resource_id": self.resource_id,
                "plan_id": self.plan_id,
                "months": 3
            }
        )
        assert comp_response.status_code == 200
        data = comp_response.json()
        
        target_month = next(
            (m for m in data["months"] if m["month"] == self.test_month and m["year"] == self.test_year),
            None
        )
        assert target_month is not None
        assert target_month["has_outstanding_override"] == True, "has_outstanding_override should be True"
        assert target_month["total_outstanding"] == test_value, f"total_outstanding should be {test_value}"
        
        print(f"✓ Outstanding override saved: {test_value}")

    def test_delete_revenue_override_resets_to_auto(self):
        """DELETE /api/performance/comparison/override resets revenue override"""
        # First create an override
        self.session.post(
            f"{BASE_URL}/api/performance/comparison/override",
            json={
                "resource_id": self.resource_id,
                "plan_id": self.plan_id,
                "month": self.test_month,
                "year": self.test_year,
                "field": "revenue",
                "value": 99999.99
            }
        )
        
        # Now delete it
        response = self.session.delete(
            f"{BASE_URL}/api/performance/comparison/override",
            params={
                "resource_id": self.resource_id,
                "plan_id": self.plan_id,
                "month": self.test_month,
                "year": self.test_year,
                "field": "revenue"
            }
        )
        assert response.status_code == 200, f"Failed to reset override: {response.text}"
        
        # Verify override is cleared
        comp_response = self.session.get(
            f"{BASE_URL}/api/performance/comparison",
            params={
                "resource_id": self.resource_id,
                "plan_id": self.plan_id,
                "months": 3
            }
        )
        assert comp_response.status_code == 200
        data = comp_response.json()
        
        target_month = next(
            (m for m in data["months"] if m["month"] == self.test_month and m["year"] == self.test_year),
            None
        )
        assert target_month is not None
        assert target_month["has_revenue_override"] == False, "has_revenue_override should be False after reset"
        # revenue_achieved should equal auto_revenue after reset
        assert target_month["revenue_achieved"] == target_month["auto_revenue"], "revenue should be auto-computed after reset"
        
        print("✓ Revenue override reset successfully")

    def test_delete_outstanding_override_resets_to_auto(self):
        """DELETE /api/performance/comparison/override resets outstanding override"""
        # First create an override
        self.session.post(
            f"{BASE_URL}/api/performance/comparison/override",
            json={
                "resource_id": self.resource_id,
                "plan_id": self.plan_id,
                "month": self.test_month,
                "year": self.test_year,
                "field": "outstanding",
                "value": 88888.88
            }
        )
        
        # Now delete it
        response = self.session.delete(
            f"{BASE_URL}/api/performance/comparison/override",
            params={
                "resource_id": self.resource_id,
                "plan_id": self.plan_id,
                "month": self.test_month,
                "year": self.test_year,
                "field": "outstanding"
            }
        )
        assert response.status_code == 200, f"Failed to reset override: {response.text}"
        
        # Verify override is cleared
        comp_response = self.session.get(
            f"{BASE_URL}/api/performance/comparison",
            params={
                "resource_id": self.resource_id,
                "plan_id": self.plan_id,
                "months": 3
            }
        )
        assert comp_response.status_code == 200
        data = comp_response.json()
        
        target_month = next(
            (m for m in data["months"] if m["month"] == self.test_month and m["year"] == self.test_year),
            None
        )
        assert target_month is not None
        assert target_month["has_outstanding_override"] == False, "has_outstanding_override should be False after reset"
        assert target_month["total_outstanding"] == target_month["auto_outstanding"], "outstanding should be auto-computed after reset"
        
        print("✓ Outstanding override reset successfully")

    def test_override_invalid_field_returns_400(self):
        """POST /api/performance/comparison/override with invalid field returns 400"""
        response = self.session.post(
            f"{BASE_URL}/api/performance/comparison/override",
            json={
                "resource_id": self.resource_id,
                "plan_id": self.plan_id,
                "month": self.test_month,
                "year": self.test_year,
                "field": "invalid_field",
                "value": 100
            }
        )
        assert response.status_code == 400, f"Expected 400 for invalid field, got {response.status_code}"
        print("✓ Invalid field returns 400")

    def test_override_missing_required_fields_returns_400(self):
        """POST /api/performance/comparison/override with missing fields returns 400"""
        response = self.session.post(
            f"{BASE_URL}/api/performance/comparison/override",
            json={
                "resource_id": self.resource_id,
                # Missing plan_id, month, year, field
            }
        )
        assert response.status_code == 400, f"Expected 400 for missing fields, got {response.status_code}"
        print("✓ Missing required fields returns 400")

    def test_comparison_returns_auto_values_for_reset(self):
        """GET /api/performance/comparison returns auto_revenue and auto_outstanding for reset reference"""
        response = self.session.get(
            f"{BASE_URL}/api/performance/comparison",
            params={
                "resource_id": self.resource_id,
                "plan_id": self.plan_id,
                "months": 3
            }
        )
        assert response.status_code == 200
        data = response.json()
        
        for month_data in data["months"]:
            # auto_revenue and auto_outstanding should always be present
            assert "auto_revenue" in month_data, "auto_revenue should be present"
            assert "auto_outstanding" in month_data, "auto_outstanding should be present"
            # They should be numeric
            assert isinstance(month_data["auto_revenue"], (int, float))
            assert isinstance(month_data["auto_outstanding"], (int, float))
        
        print("✓ Auto values present for reset reference")


if __name__ == "__main__":
    pytest.main([__file__, "-v"])
