import requests
import sys
from datetime import datetime, timedelta
import json

class NylaCRMTester:
    def __init__(self, base_url="https://cost-config.preview.emergentagent.com"):
        self.base_url = base_url
        self.tokens = {}
        self.users = {}
        self.test_lead_id = None
        self.tests_run = 0
        self.tests_passed = 0
        self.failed_tests = []

    def run_test(self, name, method, endpoint, expected_status, data=None, token=None, description=""):
        """Run a single API test"""
        url = f"{self.base_url}/api/{endpoint}"
        headers = {'Content-Type': 'application/json'}
        if token:
            headers['Authorization'] = f'Bearer {token}'

        self.tests_run += 1
        print(f"\n{'='*60}")
        print(f"🔍 Test #{self.tests_run}: {name}")
        if description:
            print(f"   Description: {description}")
        print(f"   Endpoint: {method} {endpoint}")
        
        try:
            if method == 'GET':
                response = requests.get(url, headers=headers, timeout=10)
            elif method == 'POST':
                response = requests.post(url, json=data, headers=headers, timeout=10)
            elif method == 'PUT':
                response = requests.put(url, json=data, headers=headers, timeout=10)
            elif method == 'DELETE':
                response = requests.delete(url, headers=headers, timeout=10)

            success = response.status_code == expected_status
            
            if success:
                self.tests_passed += 1
                print(f"✅ PASSED - Status: {response.status_code}")
                try:
                    response_data = response.json()
                    print(f"   Response: {json.dumps(response_data, indent=2)[:200]}...")
                except:
                    pass
            else:
                print(f"❌ FAILED - Expected {expected_status}, got {response.status_code}")
                try:
                    error_data = response.json()
                    print(f"   Error: {error_data}")
                except:
                    print(f"   Response: {response.text[:200]}")
                self.failed_tests.append({
                    'test': name,
                    'endpoint': endpoint,
                    'expected': expected_status,
                    'actual': response.status_code,
                    'error': response.text[:200]
                })

            return success, response.json() if response.text else {}

        except requests.exceptions.Timeout:
            print(f"❌ FAILED - Request timeout")
            self.failed_tests.append({
                'test': name,
                'endpoint': endpoint,
                'error': 'Request timeout'
            })
            return False, {}
        except Exception as e:
            print(f"❌ FAILED - Error: {str(e)}")
            self.failed_tests.append({
                'test': name,
                'endpoint': endpoint,
                'error': str(e)
            })
            return False, {}

    def test_authentication(self):
        """Test authentication for all user roles"""
        print("\n" + "="*60)
        print("🔐 TESTING AUTHENTICATION")
        print("="*60)
        
        test_users = [
            {'email': 'admin@nyla.com', 'password': 'admin123', 'role': 'admin'},
            {'email': 'manager@nyla.com', 'password': 'manager123', 'role': 'sales_manager'},
            {'email': 'sales@nyla.com', 'password': 'sales123', 'role': 'sales_rep'}
        ]
        
        for user_data in test_users:
            success, response = self.run_test(
                f"Login as {user_data['role']}",
                "POST",
                "auth/login",
                200,
                data={'email': user_data['email'], 'password': user_data['password']},
                description=f"Authenticate {user_data['email']}"
            )
            
            if success and 'access_token' in response:
                self.tokens[user_data['role']] = response['access_token']
                self.users[user_data['role']] = response['user']
                print(f"   ✓ Token saved for {user_data['role']}")
            else:
                print(f"   ✗ Failed to get token for {user_data['role']}")
                return False
        
        return True

    def test_dashboard_analytics(self):
        """Test dashboard analytics endpoint"""
        print("\n" + "="*60)
        print("📊 TESTING DASHBOARD ANALYTICS")
        print("="*60)
        
        success, response = self.run_test(
            "Get Dashboard Analytics",
            "GET",
            "analytics/dashboard",
            200,
            token=self.tokens.get('admin'),
            description="Fetch dashboard metrics"
        )
        
        if success:
            required_fields = ['total_leads', 'conversion_rate', 'pipeline_value', 'today_follow_ups', 'status_distribution']
            for field in required_fields:
                if field in response:
                    print(f"   ✓ {field}: {response[field]}")
                else:
                    print(f"   ✗ Missing field: {field}")
        
        return success

    def test_leads_crud(self):
        """Test leads CRUD operations"""
        print("\n" + "="*60)
        print("📝 TESTING LEADS CRUD OPERATIONS")
        print("="*60)
        
        # Create lead
        lead_data = {
            'name': 'Test Lead',
            'email': 'testlead@example.com',
            'phone': '555-1234',
            'company': 'Test Company',
            'status': 'new',
            'source': 'website',
            'assigned_to': self.users.get('sales_rep', {}).get('id'),
            'estimated_value': 10000,
            'priority': 'high',
            'notes': 'Test lead for automated testing'
        }
        
        success, response = self.run_test(
            "Create Lead",
            "POST",
            "leads",
            200,
            data=lead_data,
            token=self.tokens.get('admin'),
            description="Create a new lead"
        )
        
        if success and 'id' in response:
            self.test_lead_id = response['id']
            print(f"   ✓ Lead created with ID: {self.test_lead_id}")
        else:
            print(f"   ✗ Failed to create lead")
            return False
        
        # Get all leads
        success, response = self.run_test(
            "Get All Leads",
            "GET",
            "leads",
            200,
            token=self.tokens.get('admin'),
            description="Fetch all leads"
        )
        
        if success:
            print(f"   ✓ Retrieved {len(response)} leads")
        
        # Get single lead
        success, response = self.run_test(
            "Get Lead by ID",
            "GET",
            f"leads/{self.test_lead_id}",
            200,
            token=self.tokens.get('admin'),
            description=f"Fetch lead {self.test_lead_id}"
        )
        
        # Update lead
        update_data = {
            'status': 'contacted',
            'notes': 'Updated notes'
        }
        
        success, response = self.run_test(
            "Update Lead",
            "PUT",
            f"leads/{self.test_lead_id}",
            200,
            data=update_data,
            token=self.tokens.get('admin'),
            description="Update lead status"
        )
        
        if success and response.get('status') == 'contacted':
            print(f"   ✓ Lead status updated to 'contacted'")
        
        return True

    def test_role_based_permissions(self):
        """Test role-based access control"""
        print("\n" + "="*60)
        print("🔒 TESTING ROLE-BASED PERMISSIONS")
        print("="*60)
        
        # Sales rep should only see assigned leads
        success, response = self.run_test(
            "Sales Rep - Get Leads",
            "GET",
            "leads",
            200,
            token=self.tokens.get('sales_rep'),
            description="Sales rep should only see assigned leads"
        )
        
        if success:
            print(f"   ✓ Sales rep can access {len(response)} leads")
        
        # Sales rep should NOT be able to delete leads
        success, response = self.run_test(
            "Sales Rep - Delete Lead (Should Fail)",
            "DELETE",
            f"leads/{self.test_lead_id}",
            403,
            token=self.tokens.get('sales_rep'),
            description="Sales rep should not be able to delete leads"
        )
        
        if success:
            print(f"   ✓ Sales rep correctly denied delete permission")
        
        # Admin should see all leads
        success, response = self.run_test(
            "Admin - Get All Leads",
            "GET",
            "leads",
            200,
            token=self.tokens.get('admin'),
            description="Admin should see all leads"
        )
        
        if success:
            print(f"   ✓ Admin can access {len(response)} leads")
        
        return True

    def test_activities(self):
        """Test activities endpoints"""
        print("\n" + "="*60)
        print("📋 TESTING ACTIVITIES")
        print("="*60)
        
        if not self.test_lead_id:
            print("   ⚠️  Skipping - No test lead available")
            return False
        
        # Create activity
        activity_data = {
            'lead_id': self.test_lead_id,
            'activity_type': 'call',
            'description': 'Test call activity'
        }
        
        success, response = self.run_test(
            "Create Activity",
            "POST",
            "activities",
            200,
            data=activity_data,
            token=self.tokens.get('admin'),
            description="Add activity to lead"
        )
        
        # Get activities for lead
        success, response = self.run_test(
            "Get Activities",
            "GET",
            f"activities/{self.test_lead_id}",
            200,
            token=self.tokens.get('admin'),
            description="Fetch lead activities"
        )
        
        if success:
            print(f"   ✓ Retrieved {len(response)} activities")
        
        return True

    def test_comments(self):
        """Test comments endpoints"""
        print("\n" + "="*60)
        print("💬 TESTING COMMENTS")
        print("="*60)
        
        if not self.test_lead_id:
            print("   ⚠️  Skipping - No test lead available")
            return False
        
        # Create comment
        comment_data = {
            'lead_id': self.test_lead_id,
            'comment': 'This is a test comment'
        }
        
        success, response = self.run_test(
            "Create Comment",
            "POST",
            "comments",
            200,
            data=comment_data,
            token=self.tokens.get('admin'),
            description="Add comment to lead"
        )
        
        # Get comments for lead
        success, response = self.run_test(
            "Get Comments",
            "GET",
            f"comments/{self.test_lead_id}",
            200,
            token=self.tokens.get('admin'),
            description="Fetch lead comments"
        )
        
        if success:
            print(f"   ✓ Retrieved {len(response)} comments")
        
        return True

    def test_follow_ups(self):
        """Test follow-ups endpoints"""
        print("\n" + "="*60)
        print("📅 TESTING FOLLOW-UPS")
        print("="*60)
        
        if not self.test_lead_id:
            print("   ⚠️  Skipping - No test lead available")
            return False
        
        # Create follow-up
        scheduled_date = (datetime.now() + timedelta(days=1)).isoformat()
        follow_up_data = {
            'lead_id': self.test_lead_id,
            'title': 'Test Follow-up',
            'description': 'Follow up with test lead',
            'scheduled_date': scheduled_date,
            'assigned_to': self.users.get('sales_rep', {}).get('id')
        }
        
        success, response = self.run_test(
            "Create Follow-up",
            "POST",
            "follow-ups",
            200,
            data=follow_up_data,
            token=self.tokens.get('admin'),
            description="Schedule follow-up"
        )
        
        follow_up_id = None
        if success and 'id' in response:
            follow_up_id = response['id']
            print(f"   ✓ Follow-up created with ID: {follow_up_id}")
        
        # Get all follow-ups
        success, response = self.run_test(
            "Get Follow-ups",
            "GET",
            "follow-ups",
            200,
            token=self.tokens.get('admin'),
            description="Fetch all follow-ups"
        )
        
        if success:
            print(f"   ✓ Retrieved {len(response)} follow-ups")
        
        # Complete follow-up
        if follow_up_id:
            success, response = self.run_test(
                "Complete Follow-up",
                "PUT",
                f"follow-ups/{follow_up_id}/complete",
                200,
                token=self.tokens.get('admin'),
                description="Mark follow-up as completed"
            )
        
        return True

    def test_reports(self):
        """Test reports endpoints"""
        print("\n" + "="*60)
        print("📈 TESTING REPORTS")
        print("="*60)
        
        success, response = self.run_test(
            "Get Reports",
            "GET",
            "analytics/reports",
            200,
            token=self.tokens.get('admin'),
            description="Fetch analytics reports"
        )
        
        if success:
            required_fields = ['source_analysis', 'team_performance', 'monthly_trends']
            for field in required_fields:
                if field in response:
                    print(f"   ✓ {field}: Present")
                else:
                    print(f"   ✗ Missing field: {field}")
        
        return success

    def test_team_management(self):
        """Test team management endpoints"""
        print("\n" + "="*60)
        print("👥 TESTING TEAM MANAGEMENT")
        print("="*60)
        
        success, response = self.run_test(
            "Get All Users",
            "GET",
            "users",
            200,
            token=self.tokens.get('admin'),
            description="Fetch all team members"
        )
        
        if success:
            print(f"   ✓ Retrieved {len(response)} users")
            for user in response:
                print(f"      - {user.get('name')} ({user.get('role')})")
        
        return success

    def cleanup(self):
        """Clean up test data"""
        print("\n" + "="*60)
        print("🧹 CLEANING UP TEST DATA")
        print("="*60)
        
        if self.test_lead_id:
            success, response = self.run_test(
                "Delete Test Lead",
                "DELETE",
                f"leads/{self.test_lead_id}",
                200,
                token=self.tokens.get('admin'),
                description="Remove test lead"
            )
            
            if success:
                print(f"   ✓ Test lead deleted successfully")

    def print_summary(self):
        """Print test summary"""
        print("\n" + "="*60)
        print("📊 TEST SUMMARY")
        print("="*60)
        print(f"Total Tests: {self.tests_run}")
        print(f"Passed: {self.tests_passed}")
        print(f"Failed: {len(self.failed_tests)}")
        print(f"Success Rate: {(self.tests_passed/self.tests_run*100):.1f}%")
        
        if self.failed_tests:
            print("\n❌ FAILED TESTS:")
            for i, test in enumerate(self.failed_tests, 1):
                print(f"\n{i}. {test['test']}")
                print(f"   Endpoint: {test.get('endpoint', 'N/A')}")
                if 'expected' in test:
                    print(f"   Expected: {test['expected']}, Got: {test['actual']}")
                print(f"   Error: {test.get('error', 'Unknown error')}")
        
        print("\n" + "="*60)

def main():
    print("="*60)
    print("🚀 NYLA SALES CRM - BACKEND API TESTING")
    print("="*60)
    
    tester = NylaCRMTester()
    
    # Run all tests
    if not tester.test_authentication():
        print("\n❌ Authentication failed - stopping tests")
        return 1
    
    tester.test_dashboard_analytics()
    tester.test_leads_crud()
    tester.test_role_based_permissions()
    tester.test_activities()
    tester.test_comments()
    tester.test_follow_ups()
    tester.test_reports()
    tester.test_team_management()
    
    # Cleanup
    tester.cleanup()
    
    # Print summary
    tester.print_summary()
    
    # Return exit code
    return 0 if len(tester.failed_tests) == 0 else 1

if __name__ == "__main__":
    sys.exit(main())
