"""
Test Activity Metrics in Performance Tracker
Tests the /api/performance/generate endpoint for:
1. Total Activities: messages, calls, visits, emails, total
2. Unique Customers Reached: unique_messages, unique_calls, unique_visits, unique_emails
3. Productivity metrics: visit_productivity, call_productivity
"""

import pytest
import requests
import os

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', '').rstrip('/')

class TestActivityMetrics:
    """Test Activity Metrics in Performance Tracker"""
    
    @pytest.fixture(autouse=True)
    def setup(self):
        """Setup test session with authentication"""
        self.session = requests.Session()
        self.session.headers.update({"Content-Type": "application/json"})
        
        # Login
        login_response = self.session.post(f"{BASE_URL}/api/auth/login", json={
            "email": "surya.yadavalli@nylaairwater.earth",
            "password": "test123",
            "tenant_id": "nyla-air-water"
        })
        
        if login_response.status_code != 200:
            pytest.skip("Authentication failed - skipping tests")
        
        login_data = login_response.json()
        token = login_data.get("session_token") or login_data.get("token")
        
        if not token:
            pytest.skip("No token received - skipping tests")
        
        self.session.headers.update({
            "Authorization": f"Bearer {token}",
            "X-Tenant-ID": "nyla-air-water"
        })
        
        # Get target plans
        plans_response = self.session.get(f"{BASE_URL}/api/performance/target-plans")
        if plans_response.status_code != 200:
            pytest.skip("Could not fetch target plans")
        
        plans = plans_response.json()
        if not plans:
            pytest.skip("No target plans available")
        
        self.plan_id = plans[0]["id"]
        
        # Get resources for plan
        resources_response = self.session.get(f"{BASE_URL}/api/performance/resources-for-plan/{self.plan_id}")
        if resources_response.status_code != 200:
            pytest.skip("Could not fetch resources")
        
        resources = resources_response.json()
        if not resources:
            pytest.skip("No resources available for plan")
        
        self.resource_id = resources[0]["resource_id"]
        self.resource_name = resources[0].get("resource_name", "Unknown")
    
    def test_generate_endpoint_returns_activities_structure(self):
        """Test that /api/performance/generate returns activities with all required fields"""
        response = self.session.get(
            f"{BASE_URL}/api/performance/generate",
            params={
                "plan_id": self.plan_id,
                "resource_id": self.resource_id,
                "month": 1,
                "year": 2026
            }
        )
        
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        
        data = response.json()
        assert "activities" in data, "Response should contain 'activities' key"
        
        activities = data["activities"]
        
        # Verify Total Activities fields exist
        assert "messages" in activities, "activities should have 'messages' field"
        assert "calls" in activities, "activities should have 'calls' field"
        assert "visits" in activities, "activities should have 'visits' field"
        assert "emails" in activities, "activities should have 'emails' field"
        assert "total" in activities, "activities should have 'total' field"
        
        print(f"✓ Total Activities structure verified: messages={activities['messages']}, calls={activities['calls']}, visits={activities['visits']}, emails={activities['emails']}, total={activities['total']}")
    
    def test_generate_endpoint_returns_unique_customer_counts(self):
        """Test that /api/performance/generate returns unique customer counts"""
        response = self.session.get(
            f"{BASE_URL}/api/performance/generate",
            params={
                "plan_id": self.plan_id,
                "resource_id": self.resource_id,
                "month": 1,
                "year": 2026
            }
        )
        
        assert response.status_code == 200
        
        data = response.json()
        activities = data["activities"]
        
        # Verify Unique Customers Reached fields exist
        assert "unique_messages" in activities, "activities should have 'unique_messages' field"
        assert "unique_calls" in activities, "activities should have 'unique_calls' field"
        assert "unique_visits" in activities, "activities should have 'unique_visits' field"
        assert "unique_emails" in activities, "activities should have 'unique_emails' field"
        
        print(f"✓ Unique Customers structure verified: unique_messages={activities['unique_messages']}, unique_calls={activities['unique_calls']}, unique_visits={activities['unique_visits']}, unique_emails={activities['unique_emails']}")
    
    def test_generate_endpoint_returns_productivity_metrics(self):
        """Test that /api/performance/generate returns productivity metrics"""
        response = self.session.get(
            f"{BASE_URL}/api/performance/generate",
            params={
                "plan_id": self.plan_id,
                "resource_id": self.resource_id,
                "month": 1,
                "year": 2026
            }
        )
        
        assert response.status_code == 200
        
        data = response.json()
        activities = data["activities"]
        
        # Verify Productivity fields exist
        assert "visit_productivity" in activities, "activities should have 'visit_productivity' field"
        assert "call_productivity" in activities, "activities should have 'call_productivity' field"
        
        print(f"✓ Productivity metrics verified: visit_productivity={activities['visit_productivity']}, call_productivity={activities['call_productivity']}")
    
    def test_activities_total_equals_sum_of_individual_counts(self):
        """Test that total activities equals sum of messages + calls + visits + emails"""
        response = self.session.get(
            f"{BASE_URL}/api/performance/generate",
            params={
                "plan_id": self.plan_id,
                "resource_id": self.resource_id,
                "month": 1,
                "year": 2026
            }
        )
        
        assert response.status_code == 200
        
        data = response.json()
        activities = data["activities"]
        
        expected_total = activities["messages"] + activities["calls"] + activities["visits"] + activities["emails"]
        actual_total = activities["total"]
        
        assert actual_total == expected_total, f"Total ({actual_total}) should equal sum of individual counts ({expected_total})"
        
        print(f"✓ Total calculation verified: {activities['messages']} + {activities['calls']} + {activities['visits']} + {activities['emails']} = {actual_total}")
    
    def test_activities_values_are_integers(self):
        """Test that all activity counts are integers (not floats or strings)"""
        response = self.session.get(
            f"{BASE_URL}/api/performance/generate",
            params={
                "plan_id": self.plan_id,
                "resource_id": self.resource_id,
                "month": 1,
                "year": 2026
            }
        )
        
        assert response.status_code == 200
        
        data = response.json()
        activities = data["activities"]
        
        # Check all count fields are integers
        count_fields = ["messages", "calls", "visits", "emails", "total", 
                       "unique_messages", "unique_calls", "unique_visits", "unique_emails"]
        
        for field in count_fields:
            assert isinstance(activities[field], int), f"{field} should be an integer, got {type(activities[field])}"
        
        print(f"✓ All activity count fields are integers")
    
    def test_unique_counts_not_greater_than_total_counts(self):
        """Test that unique counts are not greater than total counts for each activity type"""
        response = self.session.get(
            f"{BASE_URL}/api/performance/generate",
            params={
                "plan_id": self.plan_id,
                "resource_id": self.resource_id,
                "month": 1,
                "year": 2026
            }
        )
        
        assert response.status_code == 200
        
        data = response.json()
        activities = data["activities"]
        
        # Unique counts should never exceed total counts
        assert activities["unique_messages"] <= activities["messages"], "unique_messages should not exceed messages"
        assert activities["unique_calls"] <= activities["calls"], "unique_calls should not exceed calls"
        assert activities["unique_visits"] <= activities["visits"], "unique_visits should not exceed visits"
        assert activities["unique_emails"] <= activities["emails"], "unique_emails should not exceed emails"
        
        print(f"✓ Unique counts are valid (not exceeding total counts)")


if __name__ == "__main__":
    pytest.main([__file__, "-v"])
