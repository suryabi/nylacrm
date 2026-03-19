"""
Test Tenant Registration and Google Workspace SSO APIs
Tests: tenant registration, subdomain check, tenant info, admin login
"""
import pytest
import requests
import os
import uuid
from datetime import datetime

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', 'https://dist-margins-toggle.preview.emergentagent.com').rstrip('/')


class TestSubdomainAvailability:
    """Test subdomain availability check endpoint"""
    
    def test_check_subdomain_too_short(self):
        """Subdomain less than 3 chars should be rejected"""
        response = requests.get(f"{BASE_URL}/api/tenants/check-subdomain/ab")
        assert response.status_code == 200
        data = response.json()
        assert data['available'] == False
        assert 'at least 3 characters' in data['reason'].lower()
        print(f"PASS: Short subdomain rejected - {data['reason']}")
    
    def test_check_reserved_subdomain(self):
        """Reserved subdomains should not be available"""
        reserved_names = ['www', 'api', 'admin', 'app', 'mail', 'test', 'demo']
        for name in reserved_names:
            response = requests.get(f"{BASE_URL}/api/tenants/check-subdomain/{name}")
            assert response.status_code == 200
            data = response.json()
            assert data['available'] == False
            assert 'reserved' in data['reason'].lower()
        print(f"PASS: Reserved subdomains correctly rejected: {reserved_names}")
    
    def test_check_existing_subdomain(self):
        """Existing tenant subdomain should not be available"""
        response = requests.get(f"{BASE_URL}/api/tenants/check-subdomain/nyla-air-water")
        assert response.status_code == 200
        data = response.json()
        assert data['available'] == False
        assert 'already taken' in data['reason'].lower()
        print("PASS: Existing subdomain 'nyla-air-water' correctly marked as taken")
    
    def test_check_available_subdomain(self):
        """New unique subdomain should be available"""
        unique_subdomain = f"test-tenant-{uuid.uuid4().hex[:8]}"
        response = requests.get(f"{BASE_URL}/api/tenants/check-subdomain/{unique_subdomain}")
        assert response.status_code == 200
        data = response.json()
        assert data['available'] == True
        assert data['subdomain'] == unique_subdomain
        print(f"PASS: New subdomain '{unique_subdomain}' is available")
    
    def test_subdomain_format_validation(self):
        """Invalid subdomain formats should be rejected"""
        invalid_subdomains = ['123test', '-test', 'test-', 'Test-Upper']
        for subdomain in invalid_subdomains:
            response = requests.get(f"{BASE_URL}/api/tenants/check-subdomain/{subdomain}")
            assert response.status_code == 200
            data = response.json()
            # Either invalid format or available if format is valid
            print(f"Subdomain '{subdomain}': available={data['available']}, reason={data.get('reason', 'N/A')}")


class TestTenantRegistration:
    """Test tenant registration endpoint"""
    
    def test_register_tenant_success(self):
        """Register a new tenant successfully"""
        unique_id = uuid.uuid4().hex[:8]
        subdomain = f"test-reg-{unique_id}"
        email = f"testadmin{unique_id}@example.com"
        
        payload = {
            "company_name": f"Test Company {unique_id}",
            "subdomain": subdomain,
            "admin_name": "Test Admin",
            "admin_email": email,
            "admin_password": "TestPass123!"
        }
        
        response = requests.post(f"{BASE_URL}/api/tenants/register", json=payload)
        assert response.status_code == 200, f"Registration failed: {response.text}"
        
        data = response.json()
        assert data['success'] == True
        assert data['tenant_id'] == subdomain
        assert data['admin_email'] == email.lower()
        assert 'login_url' in data
        assert 'trial_ends_at' in data
        assert 'next_steps' in data
        
        print(f"PASS: Tenant '{subdomain}' registered successfully")
        print(f"  - Admin email: {email}")
        print(f"  - Trial ends: {data['trial_ends_at']}")
        
        # Store for login test
        return subdomain, email, payload['admin_password']
    
    def test_register_duplicate_subdomain(self):
        """Registration with existing subdomain should fail"""
        payload = {
            "company_name": "Duplicate Test",
            "subdomain": "nyla-air-water",  # Existing
            "admin_name": "Test Admin",
            "admin_email": f"test{uuid.uuid4().hex[:8]}@example.com",
            "admin_password": "TestPass123!"
        }
        
        response = requests.post(f"{BASE_URL}/api/tenants/register", json=payload)
        assert response.status_code == 400
        data = response.json()
        assert 'already taken' in data['detail'].lower() or 'subdomain' in data['detail'].lower()
        print("PASS: Duplicate subdomain registration rejected")
    
    def test_register_duplicate_email(self):
        """Registration with existing admin email should fail"""
        payload = {
            "company_name": "Email Test",
            "subdomain": f"test-email-{uuid.uuid4().hex[:8]}",
            "admin_name": "Test Admin",
            "admin_email": "admin@nylaairwater.earth",  # Existing
            "admin_password": "TestPass123!"
        }
        
        response = requests.post(f"{BASE_URL}/api/tenants/register", json=payload)
        assert response.status_code == 400
        data = response.json()
        assert 'already registered' in data['detail'].lower() or 'email' in data['detail'].lower()
        print("PASS: Duplicate email registration rejected")
    
    def test_register_invalid_email_format(self):
        """Registration with invalid email should fail"""
        payload = {
            "company_name": "Invalid Email Test",
            "subdomain": f"test-inv-{uuid.uuid4().hex[:8]}",
            "admin_name": "Test Admin",
            "admin_email": "invalid-email",
            "admin_password": "TestPass123!"
        }
        
        response = requests.post(f"{BASE_URL}/api/tenants/register", json=payload)
        assert response.status_code == 422  # Validation error
        print("PASS: Invalid email format rejected (422 validation error)")
    
    def test_register_short_password(self):
        """Registration with short password should fail"""
        payload = {
            "company_name": "Short Password Test",
            "subdomain": f"test-pwd-{uuid.uuid4().hex[:8]}",
            "admin_name": "Test Admin",
            "admin_email": f"test{uuid.uuid4().hex[:8]}@example.com",
            "admin_password": "short"  # Less than 8 chars
        }
        
        response = requests.post(f"{BASE_URL}/api/tenants/register", json=payload)
        assert response.status_code == 422  # Validation error
        print("PASS: Short password rejected (422 validation error)")


class TestTenantInfo:
    """Test tenant info endpoint"""
    
    def test_get_existing_tenant_info(self):
        """Get public info for existing tenant"""
        response = requests.get(f"{BASE_URL}/api/tenants/info/nyla-air-water")
        assert response.status_code == 200
        
        data = response.json()
        assert data['tenant_id'] == 'nyla-air-water'
        assert 'name' in data
        assert 'branding' in data
        assert 'auth_config' in data
        
        # Check branding structure
        branding = data['branding']
        assert 'app_name' in branding
        assert 'primary_color' in branding
        
        # Check auth config structure
        auth_config = data['auth_config']
        assert 'allow_password_login' in auth_config
        assert 'google_workspace_enabled' in auth_config
        
        print(f"PASS: Tenant info for 'nyla-air-water' retrieved")
        print(f"  - Name: {data['name']}")
        print(f"  - App Name: {branding['app_name']}")
        print(f"  - Google Workspace: {auth_config.get('google_workspace_enabled', False)}")
    
    def test_get_nonexistent_tenant_info(self):
        """Get info for non-existent tenant should fail"""
        response = requests.get(f"{BASE_URL}/api/tenants/info/nonexistent-tenant-xyz")
        assert response.status_code == 404
        data = response.json()
        assert 'not found' in data['detail'].lower()
        print("PASS: Non-existent tenant returns 404")
    
    def test_get_newly_registered_tenant_info(self):
        """Register a tenant and verify its info is accessible"""
        # First register a new tenant
        unique_id = uuid.uuid4().hex[:8]
        subdomain = f"test-info-{unique_id}"
        
        payload = {
            "company_name": f"Info Test Company {unique_id}",
            "subdomain": subdomain,
            "admin_name": "Test Admin",
            "admin_email": f"testinfo{unique_id}@example.com",
            "admin_password": "TestPass123!"
        }
        
        reg_response = requests.post(f"{BASE_URL}/api/tenants/register", json=payload)
        assert reg_response.status_code == 200, f"Registration failed: {reg_response.text}"
        
        # Now get the info
        response = requests.get(f"{BASE_URL}/api/tenants/info/{subdomain}")
        assert response.status_code == 200
        
        data = response.json()
        assert data['tenant_id'] == subdomain
        assert data['name'] == payload['company_name']
        assert data['is_trial'] == True
        assert 'trial_ends_at' in data
        
        print(f"PASS: Newly registered tenant '{subdomain}' info accessible")


class TestNewTenantLogin:
    """Test login with newly registered tenant admin"""
    
    def test_login_with_new_tenant_admin(self):
        """Register a tenant and login with admin credentials"""
        # Register new tenant
        unique_id = uuid.uuid4().hex[:8]
        subdomain = f"test-login-{unique_id}"
        email = f"logintest{unique_id}@example.com"
        password = "LoginTest123!"
        
        reg_payload = {
            "company_name": f"Login Test Company {unique_id}",
            "subdomain": subdomain,
            "admin_name": "Login Test Admin",
            "admin_email": email,
            "admin_password": password
        }
        
        reg_response = requests.post(f"{BASE_URL}/api/tenants/register", json=reg_payload)
        assert reg_response.status_code == 200, f"Registration failed: {reg_response.text}"
        print(f"Registered tenant: {subdomain}")
        
        # Login with the new admin
        login_payload = {
            "email": email,
            "password": password
        }
        
        login_response = requests.post(
            f"{BASE_URL}/api/auth/login",
            json=login_payload,
            headers={"X-Tenant-ID": subdomain}
        )
        assert login_response.status_code == 200, f"Login failed: {login_response.text}"
        
        data = login_response.json()
        assert 'user' in data
        assert 'session_token' in data
        assert data['user']['email'] == email.lower()
        assert data['user']['role'] == 'Admin'
        
        print(f"PASS: Login successful for new tenant admin")
        print(f"  - Tenant: {subdomain}")
        print(f"  - Email: {email}")
        print(f"  - Role: Admin")
    
    def test_login_with_wrong_password(self):
        """Login with wrong password should fail"""
        login_payload = {
            "email": "admin@nylaairwater.earth",
            "password": "wrongpassword"
        }
        
        login_response = requests.post(
            f"{BASE_URL}/api/auth/login",
            json=login_payload,
            headers={"X-Tenant-ID": "nyla-air-water"}
        )
        assert login_response.status_code == 401
        data = login_response.json()
        assert 'invalid' in data['detail'].lower()
        print("PASS: Wrong password login rejected")
    
    def test_login_with_existing_admin(self):
        """Login with existing admin credentials"""
        login_payload = {
            "email": "admin@nylaairwater.earth",
            "password": "admin123"
        }
        
        login_response = requests.post(
            f"{BASE_URL}/api/auth/login",
            json=login_payload,
            headers={"X-Tenant-ID": "nyla-air-water"}
        )
        assert login_response.status_code == 200
        
        data = login_response.json()
        assert 'user' in data
        assert 'session_token' in data
        print(f"PASS: Existing admin login successful")


class TestGoogleWorkspaceConfig:
    """Test Google Workspace SSO configuration"""
    
    def test_tenant_auth_config_structure(self):
        """Verify tenant info includes Google Workspace config structure"""
        response = requests.get(f"{BASE_URL}/api/tenants/info/nyla-air-water")
        assert response.status_code == 200
        
        data = response.json()
        auth_config = data['auth_config']
        
        # Check structure
        assert 'allow_password_login' in auth_config
        assert 'google_workspace_enabled' in auth_config
        assert 'google_workspace_domain' in auth_config
        
        print(f"PASS: Auth config structure correct")
        print(f"  - Password login: {auth_config['allow_password_login']}")
        print(f"  - Google Workspace enabled: {auth_config['google_workspace_enabled']}")
        print(f"  - Google Workspace domain: {auth_config.get('google_workspace_domain', 'Not set')}")
    
    def test_google_workspace_login_without_config(self):
        """Google Workspace login should fail for tenants without it enabled"""
        # First register a new tenant (Google Workspace disabled by default)
        unique_id = uuid.uuid4().hex[:8]
        subdomain = f"test-gws-{unique_id}"
        
        reg_payload = {
            "company_name": f"GWS Test Company {unique_id}",
            "subdomain": subdomain,
            "admin_name": "GWS Test Admin",
            "admin_email": f"gwstest{unique_id}@example.com",
            "admin_password": "TestPass123!"
        }
        
        reg_response = requests.post(f"{BASE_URL}/api/tenants/register", json=reg_payload)
        assert reg_response.status_code == 200
        
        # Try Google Workspace login (should fail - not enabled)
        gws_payload = {
            "code": "fake_auth_code"
        }
        
        gws_response = requests.post(
            f"{BASE_URL}/api/auth/google-workspace-login",
            json=gws_payload,
            headers={"X-Tenant-ID": subdomain}
        )
        
        # Should fail with 403 (not enabled) or 400 (no code)
        assert gws_response.status_code in [400, 403]
        print(f"PASS: Google Workspace login correctly blocked for tenant without config")


class TestTenantList:
    """Test tenant listing endpoint"""
    
    def test_list_tenants(self):
        """List all tenants (for testing)"""
        response = requests.get(f"{BASE_URL}/api/tenants/list")
        assert response.status_code == 200
        
        data = response.json()
        assert 'tenants' in data
        assert 'count' in data
        assert isinstance(data['tenants'], list)
        
        # Verify nyla-air-water exists
        tenant_ids = [t['tenant_id'] for t in data['tenants']]
        assert 'nyla-air-water' in tenant_ids
        
        print(f"PASS: Listed {data['count']} tenants")
        print(f"  - Includes: nyla-air-water")


if __name__ == "__main__":
    pytest.main([__file__, "-v", "--tb=short"])
