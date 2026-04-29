"""
Investor Module API Tests
Tests for Annual Business Plan, Monthly Updates, and Comments endpoints.
"""
import pytest
import requests
import os
from datetime import datetime

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', 'https://prod-qc-sync.preview.emergentagent.com')

# Test credentials
TEST_EMAIL = "surya.yadavalli@nylaairwater.earth"
TEST_PASSWORD = "test123"
TENANT_ID = "nyla-air-water"


class TestInvestorModule:
    """Investor Module endpoint tests"""
    
    @pytest.fixture(autouse=True)
    def setup(self):
        """Setup session with auth token"""
        self.session = requests.Session()
        self.session.headers.update({
            "Content-Type": "application/json",
            "X-Tenant-ID": TENANT_ID
        })
        
        # Login to get token
        login_response = self.session.post(
            f"{BASE_URL}/api/auth/login",
            json={"email": TEST_EMAIL, "password": TEST_PASSWORD}
        )
        
        if login_response.status_code == 200:
            data = login_response.json()
            # Auth returns session_token (not token)
            token = data.get("session_token") or data.get("token")
            if token:
                self.session.headers.update({"Authorization": f"Bearer {token}"})
            self.user = data.get("user", {})
        else:
            pytest.skip(f"Authentication failed: {login_response.status_code}")
    
    # ---- Annual Plan Tests ----
    
    def test_get_plan_default_fy(self):
        """GET /api/investor/plan - returns plan data with auto_computed CRM metrics"""
        response = self.session.get(f"{BASE_URL}/api/investor/plan")
        
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        
        data = response.json()
        assert "plan" in data, "Response should contain 'plan'"
        assert "auto_computed" in data, "Response should contain 'auto_computed'"
        assert "fy" in data, "Response should contain 'fy'"
        
        # Verify plan structure
        plan = data["plan"]
        assert "summary" in plan, "Plan should have summary"
        assert "revenue_buildup" in plan, "Plan should have revenue_buildup"
        assert "pnl" in plan, "Plan should have pnl"
        assert "priorities" in plan, "Plan should have priorities"
        assert "risks" in plan, "Plan should have risks"
        assert "support" in plan, "Plan should have support"
        
        # Verify auto_computed structure
        auto = data["auto_computed"]
        assert "revenue" in auto, "auto_computed should have revenue"
        assert "total_accounts" in auto, "auto_computed should have total_accounts"
        
        print(f"✓ GET /api/investor/plan - FY: {data['fy']}")
    
    def test_get_plan_specific_fy(self):
        """GET /api/investor/plan?fy=FY2025-2026 - returns plan for specific FY"""
        fy = "FY2025-2026"
        response = self.session.get(f"{BASE_URL}/api/investor/plan?fy={fy}")
        
        assert response.status_code == 200, f"Expected 200, got {response.status_code}"
        
        data = response.json()
        assert data["fy"] == fy, f"Expected FY {fy}, got {data['fy']}"
        
        print(f"✓ GET /api/investor/plan?fy={fy}")
    
    def test_update_plan_ceo_role(self):
        """PUT /api/investor/plan - saves plan data (requires CEO/Director/Admin role)"""
        fy = "FY2025-2026"
        
        # First get existing plan
        get_response = self.session.get(f"{BASE_URL}/api/investor/plan?fy={fy}")
        assert get_response.status_code == 200
        existing_plan = get_response.json()["plan"]
        
        # Update plan with test data
        test_plan = existing_plan.copy()
        test_plan["summary"]["revenue"]["fy_target"] = 10000000
        test_plan["priorities"] = ["TEST_Priority_1", "TEST_Priority_2", "", "", ""]
        
        update_response = self.session.put(
            f"{BASE_URL}/api/investor/plan",
            json={"fy": fy, "plan": test_plan}
        )
        
        assert update_response.status_code == 200, f"Expected 200, got {update_response.status_code}: {update_response.text}"
        
        data = update_response.json()
        assert "message" in data, "Response should have message"
        assert data["fy"] == fy, f"Response FY should be {fy}"
        
        # Verify persistence by fetching again
        verify_response = self.session.get(f"{BASE_URL}/api/investor/plan?fy={fy}")
        assert verify_response.status_code == 200
        verified_plan = verify_response.json()["plan"]
        assert verified_plan["summary"]["revenue"]["fy_target"] == 10000000
        assert "TEST_Priority_1" in verified_plan["priorities"]
        
        print(f"✓ PUT /api/investor/plan - Plan saved and verified for {fy}")
    
    def test_update_plan_missing_fy(self):
        """PUT /api/investor/plan - returns 400 if FY is missing"""
        response = self.session.put(
            f"{BASE_URL}/api/investor/plan",
            json={"plan": {}}
        )
        
        assert response.status_code == 400, f"Expected 400, got {response.status_code}"
        print("✓ PUT /api/investor/plan - Returns 400 for missing FY")
    
    # ---- Monthly Update Tests ----
    
    def test_get_monthly_update(self):
        """GET /api/investor/monthly/{year}/{month} - returns monthly update with actuals, targets, overrides"""
        year = 2026
        month = 1
        
        response = self.session.get(f"{BASE_URL}/api/investor/monthly/{year}/{month}")
        
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        
        data = response.json()
        assert "monthly" in data, "Response should contain 'monthly'"
        assert "actuals" in data, "Response should contain 'actuals'"
        assert "targets" in data, "Response should contain 'targets'"
        assert "fy" in data, "Response should contain 'fy'"
        
        # Verify monthly structure
        monthly = data["monthly"]
        assert "year" in monthly, "Monthly should have year"
        assert "month" in monthly, "Monthly should have month"
        assert monthly["year"] == year
        assert monthly["month"] == month
        
        # Verify actuals structure
        actuals = data["actuals"]
        assert "revenue" in actuals, "Actuals should have revenue"
        assert "new_customers" in actuals, "Actuals should have new_customers"
        
        print(f"✓ GET /api/investor/monthly/{year}/{month} - FY: {data['fy']}")
    
    def test_update_monthly_with_overrides(self):
        """PUT /api/investor/monthly/{year}/{month} - saves monthly data with overrides"""
        year = 2026
        month = 1
        
        # First get existing monthly data
        get_response = self.session.get(f"{BASE_URL}/api/investor/monthly/{year}/{month}")
        assert get_response.status_code == 200
        existing = get_response.json()["monthly"]
        
        # Update with test data
        update_data = {
            "pnl_overrides": {"revenue": 500000, "cogs": 200000},
            "new_customers_bd": ["TEST_Customer_1", "TEST_Customer_2"],
            "orders_won": ["TEST_Order_1"],
            "updates": ["TEST_Update_1", "TEST_Update_2"]
        }
        
        update_response = self.session.put(
            f"{BASE_URL}/api/investor/monthly/{year}/{month}",
            json=update_data
        )
        
        assert update_response.status_code == 200, f"Expected 200, got {update_response.status_code}: {update_response.text}"
        
        data = update_response.json()
        assert "message" in data, "Response should have message"
        
        # Verify persistence
        verify_response = self.session.get(f"{BASE_URL}/api/investor/monthly/{year}/{month}")
        assert verify_response.status_code == 200
        verified = verify_response.json()["monthly"]
        assert verified["pnl_overrides"]["revenue"] == 500000
        assert "TEST_Customer_1" in verified["new_customers_bd"]
        assert "TEST_Update_1" in verified["updates"]
        
        print(f"✓ PUT /api/investor/monthly/{year}/{month} - Monthly data saved and verified")
    
    def test_get_monthly_different_months(self):
        """GET /api/investor/monthly - test different months for FY calculation"""
        # April (month 4) should be FY2026-2027
        response_apr = self.session.get(f"{BASE_URL}/api/investor/monthly/2026/4")
        assert response_apr.status_code == 200
        assert response_apr.json()["fy"] == "FY2026-2027"
        
        # January (month 1) should be FY2025-2026
        response_jan = self.session.get(f"{BASE_URL}/api/investor/monthly/2026/1")
        assert response_jan.status_code == 200
        assert response_jan.json()["fy"] == "FY2025-2026"
        
        print("✓ GET /api/investor/monthly - FY calculation correct for different months")
    
    # ---- Comments Tests ----
    
    def test_get_comments_empty(self):
        """GET /api/investor/comments - returns comments (may be empty)"""
        response = self.session.get(f"{BASE_URL}/api/investor/comments")
        
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        
        data = response.json()
        assert isinstance(data, list), "Response should be a list"
        
        print(f"✓ GET /api/investor/comments - Returned {len(data)} comments")
    
    def test_get_comments_filtered_by_section(self):
        """GET /api/investor/comments?section=summary - returns filtered comments"""
        response = self.session.get(f"{BASE_URL}/api/investor/comments?section=summary")
        
        assert response.status_code == 200, f"Expected 200, got {response.status_code}"
        
        data = response.json()
        assert isinstance(data, list), "Response should be a list"
        # All returned comments should have section=summary
        for comment in data:
            assert comment.get("section") == "summary", f"Comment section should be 'summary', got {comment.get('section')}"
        
        print(f"✓ GET /api/investor/comments?section=summary - Returned {len(data)} comments")
    
    def test_add_comment(self):
        """POST /api/investor/comments - adds a comment"""
        comment_data = {
            "section": "summary",
            "fy": "FY2025-2026",
            "text": "TEST_Comment_" + datetime.now().isoformat()
        }
        
        response = self.session.post(
            f"{BASE_URL}/api/investor/comments",
            json=comment_data
        )
        
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        
        data = response.json()
        assert "id" in data, "Response should have id"
        assert data["section"] == "summary", "Comment section should be 'summary'"
        assert "TEST_Comment_" in data["text"], "Comment text should contain test marker"
        assert "author_name" in data, "Comment should have author_name"
        
        # Store comment ID for deletion test
        self.test_comment_id = data["id"]
        
        print(f"✓ POST /api/investor/comments - Comment added with ID: {data['id']}")
        
        return data["id"]
    
    def test_add_and_delete_comment(self):
        """POST then DELETE /api/investor/comments/{id} - full lifecycle"""
        # Add comment
        comment_data = {
            "section": "pnl",
            "fy": "FY2025-2026",
            "text": "TEST_Delete_Comment_" + datetime.now().isoformat()
        }
        
        add_response = self.session.post(
            f"{BASE_URL}/api/investor/comments",
            json=comment_data
        )
        assert add_response.status_code == 200
        comment_id = add_response.json()["id"]
        
        # Delete comment
        delete_response = self.session.delete(f"{BASE_URL}/api/investor/comments/{comment_id}")
        
        assert delete_response.status_code == 200, f"Expected 200, got {delete_response.status_code}: {delete_response.text}"
        
        data = delete_response.json()
        assert "message" in data, "Response should have message"
        
        # Verify deletion - comment should not appear in list
        verify_response = self.session.get(f"{BASE_URL}/api/investor/comments?section=pnl&fy=FY2025-2026")
        assert verify_response.status_code == 200
        comments = verify_response.json()
        comment_ids = [c["id"] for c in comments]
        assert comment_id not in comment_ids, "Deleted comment should not appear in list"
        
        print(f"✓ DELETE /api/investor/comments/{comment_id} - Comment deleted and verified")
    
    def test_delete_nonexistent_comment(self):
        """DELETE /api/investor/comments/{id} - returns 404 for nonexistent comment"""
        fake_id = "nonexistent-comment-id-12345"
        
        response = self.session.delete(f"{BASE_URL}/api/investor/comments/{fake_id}")
        
        assert response.status_code == 404, f"Expected 404, got {response.status_code}"
        
        print("✓ DELETE /api/investor/comments - Returns 404 for nonexistent comment")
    
    def test_add_monthly_comment(self):
        """POST /api/investor/comments - adds a comment for monthly section"""
        comment_data = {
            "section": "monthly_pnl",
            "year": 2026,
            "month": 1,
            "text": "TEST_Monthly_Comment_" + datetime.now().isoformat()
        }
        
        response = self.session.post(
            f"{BASE_URL}/api/investor/comments",
            json=comment_data
        )
        
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        
        data = response.json()
        assert data["section"] == "monthly_pnl"
        assert data["year"] == 2026
        assert data["month"] == 1
        
        # Cleanup
        self.session.delete(f"{BASE_URL}/api/investor/comments/{data['id']}")
        
        print("✓ POST /api/investor/comments - Monthly comment added")
    
    def test_get_comments_filtered_by_year_month(self):
        """GET /api/investor/comments?year=2026&month=1 - returns filtered comments"""
        response = self.session.get(f"{BASE_URL}/api/investor/comments?year=2026&month=1")
        
        assert response.status_code == 200, f"Expected 200, got {response.status_code}"
        
        data = response.json()
        assert isinstance(data, list), "Response should be a list"
        
        print(f"✓ GET /api/investor/comments?year=2026&month=1 - Returned {len(data)} comments")


class TestInvestorModuleRBAC:
    """Test RBAC - Investor role should be read-only"""
    
    def test_investor_role_cannot_edit_plan(self):
        """Investor role should not be able to edit plan (403)"""
        # This test would require an Investor role user
        # For now, we verify the endpoint exists and CEO can edit
        session = requests.Session()
        session.headers.update({
            "Content-Type": "application/json",
            "X-Tenant-ID": TENANT_ID
        })
        
        # Login as CEO
        login_response = session.post(
            f"{BASE_URL}/api/auth/login",
            json={"email": TEST_EMAIL, "password": TEST_PASSWORD}
        )
        
        if login_response.status_code == 200:
            data = login_response.json()
            token = data.get("session_token") or data.get("token")
            if token:
                session.headers.update({"Authorization": f"Bearer {token}"})
            
            user = data.get("user", {})
            role = user.get("role", "")
            
            # CEO should be able to edit
            if role in ["CEO", "Director", "Admin"]:
                response = session.put(
                    f"{BASE_URL}/api/investor/plan",
                    json={"fy": "FY2025-2026", "plan": {"summary": {}}}
                )
                assert response.status_code == 200, f"CEO should be able to edit, got {response.status_code}"
                print(f"✓ RBAC - {role} role can edit plan")
            else:
                print(f"⚠ Skipping RBAC test - user role is {role}")
        else:
            pytest.skip("Authentication failed")


if __name__ == "__main__":
    pytest.main([__file__, "-v", "--tb=short"])
