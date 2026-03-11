"""
Tenant Registration Routes - Self-service tenant onboarding
Handles: tenant registration, subdomain availability, email verification
"""
from fastapi import APIRouter, HTTPException, BackgroundTasks
from datetime import datetime, timezone, timedelta
from typing import Optional
import uuid
import re
import os
import logging

from database import db
from models.tenant import (
    Tenant, TenantRegistration, TenantBranding, TenantModules,
    TenantSettings, TenantAuthConfig, TenantPublicInfo, GoogleWorkspaceConfig
)
from models.user import User
from models.role import get_default_roles
from deps import hash_password

router = APIRouter()
logger = logging.getLogger(__name__)


@router.get("/check-subdomain/{subdomain}")
async def check_subdomain_availability(subdomain: str):
    """Check if a subdomain is available for registration"""
    subdomain = subdomain.lower().strip()
    
    # Validate format
    if len(subdomain) < 3:
        return {"available": False, "reason": "Subdomain must be at least 3 characters"}
    
    if not re.match(r'^[a-z][a-z0-9-]*[a-z0-9]$', subdomain) and len(subdomain) > 2:
        return {"available": False, "reason": "Subdomain must start with a letter and contain only lowercase letters, numbers, and hyphens"}
    
    # Check reserved subdomains
    reserved = ['www', 'api', 'admin', 'app', 'mail', 'ftp', 'localhost', 'test', 'demo', 'staging', 'production', 'support', 'help', 'billing']
    if subdomain in reserved:
        return {"available": False, "reason": f"'{subdomain}' is a reserved subdomain"}
    
    # Check if already taken
    existing = await db.tenants.find_one({"tenant_id": subdomain}, {"_id": 0, "tenant_id": 1})
    if existing:
        return {"available": False, "reason": "This subdomain is already taken"}
    
    return {"available": True, "subdomain": subdomain}


@router.post("/register")
async def register_tenant(registration: TenantRegistration, background_tasks: BackgroundTasks):
    """
    Register a new tenant with admin user.
    Creates: Tenant record, Admin user, Default configuration
    """
    subdomain = registration.subdomain.lower().strip()
    admin_email = registration.admin_email.lower().strip()
    
    # Check subdomain availability
    existing_tenant = await db.tenants.find_one({"tenant_id": subdomain}, {"_id": 0})
    if existing_tenant:
        raise HTTPException(status_code=400, detail="Subdomain already taken")
    
    # Check if email already used as admin elsewhere
    existing_admin = await db.users.find_one({"email": admin_email}, {"_id": 0})
    if existing_admin:
        raise HTTPException(status_code=400, detail="Email already registered. Please login or use a different email.")
    
    # Generate IDs and tokens
    tenant_uuid = str(uuid.uuid4())
    admin_user_id = str(uuid.uuid4())
    verification_token = str(uuid.uuid4())
    now = datetime.now(timezone.utc)
    trial_end = now + timedelta(days=14)  # 14-day trial
    verification_expires = now + timedelta(hours=24)
    
    # Extract domain from email for Google Workspace hint
    email_domain = admin_email.split('@')[1] if '@' in admin_email else None
    
    # Create tenant document
    tenant = Tenant(
        id=tenant_uuid,
        tenant_id=subdomain,
        name=registration.company_name,
        is_active=True,
        is_trial=True,
        trial_ends_at=trial_end.isoformat(),
        subscription_plan="trial",
        registered_email=admin_email,
        email_verified=False,
        verification_token=verification_token,
        verification_expires_at=verification_expires.isoformat(),
        owner_id=admin_user_id,
        branding=TenantBranding(
            app_name=registration.company_name,
            tagline="Welcome to your CRM",
            primary_color="#0d9488",  # Teal default
            accent_color="#ffffff"
        ),
        modules=TenantModules(),  # All defaults
        settings=TenantSettings(),
        auth_config=TenantAuthConfig(
            allow_password_login=True,
            allow_user_registration=False,
            google_workspace=GoogleWorkspaceConfig(
                enabled=False,
                allowed_domain=email_domain  # Pre-fill with admin's email domain
            )
        ),
        created_at=now,
        updated_at=now
    )
    
    # Create admin user document
    admin_user = {
        "id": admin_user_id,
        "tenant_id": subdomain,
        "email": admin_email,
        "name": registration.admin_name,
        "password": hash_password(registration.admin_password),
        "role": "Admin",
        "is_active": True,
        "phone": "",
        "territory_id": None,
        "reports_to": None,
        "created_at": now.isoformat(),
        "updated_at": now.isoformat()
    }
    
    # Insert tenant and admin user
    tenant_doc = tenant.model_dump()
    tenant_doc['created_at'] = tenant_doc['created_at'].isoformat()
    tenant_doc['updated_at'] = tenant_doc['updated_at'].isoformat()
    
    await db.tenants.insert_one(tenant_doc)
    await db.users.insert_one(admin_user)
    
    # Create default lead statuses for the tenant
    default_statuses = [
        {"id": str(uuid.uuid4()), "tenant_id": subdomain, "name": "New", "color": "#3b82f6", "order": 1},
        {"id": str(uuid.uuid4()), "tenant_id": subdomain, "name": "Contacted", "color": "#eab308", "order": 2},
        {"id": str(uuid.uuid4()), "tenant_id": subdomain, "name": "Qualified", "color": "#22c55e", "order": 3},
        {"id": str(uuid.uuid4()), "tenant_id": subdomain, "name": "Proposal Sent", "color": "#a855f7", "order": 4},
        {"id": str(uuid.uuid4()), "tenant_id": subdomain, "name": "Won", "color": "#10b981", "order": 5},
        {"id": str(uuid.uuid4()), "tenant_id": subdomain, "name": "Lost", "color": "#ef4444", "order": 6},
    ]
    await db.lead_statuses.insert_many(default_statuses)
    
    # Create default roles for the tenant
    default_roles = get_default_roles(subdomain)
    await db.roles.insert_many(default_roles)
    
    # TODO: Send verification email in background
    # background_tasks.add_task(send_verification_email, admin_email, verification_token, subdomain)
    
    logger.info(f"New tenant registered: {subdomain} by {admin_email}")
    
    return {
        "success": True,
        "tenant_id": subdomain,
        "message": f"Tenant '{registration.company_name}' created successfully!",
        "login_url": f"/{subdomain}/login",  # Frontend will handle routing
        "admin_email": admin_email,
        "trial_ends_at": trial_end.isoformat(),
        "next_steps": [
            "Login with your admin credentials",
            "Configure your company profile in Tenant Settings",
            "Invite team members",
            "Optionally enable Google Workspace SSO"
        ]
    }


@router.get("/info/{tenant_id}")
async def get_tenant_public_info(tenant_id: str):
    """
    Get public tenant info for login page.
    Returns branding and auth config (no sensitive data).
    """
    tenant = await db.tenants.find_one({"tenant_id": tenant_id}, {"_id": 0})
    
    if not tenant:
        raise HTTPException(status_code=404, detail="Tenant not found")
    
    if not tenant.get('is_active', True):
        raise HTTPException(status_code=403, detail="This workspace is currently inactive")
    
    # Build safe auth config (no secrets)
    auth_config = tenant.get('auth_config', {})
    google_ws = auth_config.get('google_workspace', {})
    
    auth_config_public = {
        "allow_password_login": auth_config.get('allow_password_login', True),
        "google_workspace_enabled": google_ws.get('enabled', False),
        "google_workspace_domain": google_ws.get('allowed_domain', None)
    }
    
    # Build branding
    branding_data = tenant.get('branding', {})
    branding = TenantBranding(**branding_data) if branding_data else TenantBranding()
    
    return {
        "tenant_id": tenant['tenant_id'],
        "name": tenant['name'],
        "branding": branding.model_dump(),
        "auth_config": auth_config_public,
        "is_trial": tenant.get('is_trial', False),
        "trial_ends_at": tenant.get('trial_ends_at')
    }


@router.post("/verify-email/{token}")
async def verify_email(token: str):
    """Verify tenant admin email"""
    tenant = await db.tenants.find_one({"verification_token": token}, {"_id": 0})
    
    if not tenant:
        raise HTTPException(status_code=400, detail="Invalid verification token")
    
    expires_at = tenant.get('verification_expires_at')
    if expires_at:
        expires = datetime.fromisoformat(expires_at.replace('Z', '+00:00'))
        if datetime.now(timezone.utc) > expires:
            raise HTTPException(status_code=400, detail="Verification token expired")
    
    await db.tenants.update_one(
        {"tenant_id": tenant['tenant_id']},
        {
            "$set": {
                "email_verified": True,
                "verification_token": None,
                "updated_at": datetime.now(timezone.utc).isoformat()
            }
        }
    )
    
    return {"success": True, "message": "Email verified successfully"}


@router.get("/list")
async def list_all_tenants():
    """
    List all tenants (for platform admin or debugging).
    In production, this should be protected.
    """
    tenants = await db.tenants.find(
        {},
        {"_id": 0, "tenant_id": 1, "name": 1, "is_active": 1, "is_trial": 1, "created_at": 1, "registered_email": 1}
    ).to_list(100)
    
    return {"tenants": tenants, "count": len(tenants)}
