"""
Tenant Administration API Routes
Super Admin and Tenant Admin management
"""
from fastapi import APIRouter, HTTPException, Depends, Request
from typing import Optional, List
from datetime import datetime, timezone
import uuid
import os

from deps import get_current_user, db
from models.tenant import (
    Tenant, TenantCreate, TenantUpdate, 
    TenantBranding, TenantModules, TenantIntegrations, TenantSettings,
    DEFAULT_TENANT
)
from core.tenant import get_current_tenant_id, add_tenant_filter, with_tenant_id

router = APIRouter(prefix="/tenants", tags=["Tenant Administration"])

# Super admin check (platform owner)
SUPER_ADMIN_EMAILS = os.environ.get('SUPER_ADMIN_EMAILS', 'surya.yadavalli@nylaairwater.earth').split(',')


def is_super_admin(user: dict) -> bool:
    """Check if user is a platform super admin"""
    return user.get('email') in SUPER_ADMIN_EMAILS


def is_tenant_admin(user: dict) -> bool:
    """Check if user is a tenant admin (CEO, Director, System Admin)"""
    return user.get('role') in ['CEO', 'Director', 'System Admin']


async def ensure_default_tenant():
    """Ensure the default tenant exists"""
    existing = await db.tenants.find_one({'tenant_id': DEFAULT_TENANT.tenant_id}, {'_id': 0})
    if not existing:
        tenant_doc = DEFAULT_TENANT.model_dump()
        tenant_doc['created_at'] = tenant_doc['created_at'].isoformat()
        tenant_doc['updated_at'] = tenant_doc['updated_at'].isoformat()
        await db.tenants.insert_one(tenant_doc)
        return DEFAULT_TENANT.model_dump()
    return existing


# ============== PUBLIC ENDPOINTS (No Auth Required) ==============

@router.get("/public-list")
async def list_public_tenants():
    """
    List active tenants for login dropdown (no auth required).
    Only returns tenant_id and name for security.
    """
    await ensure_default_tenant()
    
    tenants = await db.tenants.find(
        {'is_active': True},
        {'_id': 0, 'tenant_id': 1, 'name': 1, 'branding.app_name': 1}
    ).to_list(100)
    
    return [
        {
            'tenant_id': t['tenant_id'],
            'name': t['name'],
            'app_name': t.get('branding', {}).get('app_name', t['name'])
        }
        for t in tenants
    ]


# ============== SUPER ADMIN ENDPOINTS ==============

@router.get("")
async def list_tenants(
    page: int = 1,
    page_size: int = 20,
    include_inactive: bool = False,
    current_user: dict = Depends(get_current_user)
):
    """List all tenants (Super Admin only)"""
    if not is_super_admin(current_user):
        raise HTTPException(status_code=403, detail="Super Admin access required")
    
    await ensure_default_tenant()
    
    query = {} if include_inactive else {'is_active': True}
    
    total = await db.tenants.count_documents(query)
    skip = (page - 1) * page_size
    
    tenants = await db.tenants.find(query, {'_id': 0}).skip(skip).limit(page_size).to_list(page_size)
    
    return {
        'tenants': tenants,
        'total': total,
        'page': page,
        'page_size': page_size,
        'total_pages': (total + page_size - 1) // page_size
    }


@router.post("")
async def create_tenant(
    tenant_input: TenantCreate,
    current_user: dict = Depends(get_current_user)
):
    """Create a new tenant (Super Admin only)"""
    if not is_super_admin(current_user):
        raise HTTPException(status_code=403, detail="Super Admin access required")
    
    # Check for duplicate tenant_id
    existing = await db.tenants.find_one({'tenant_id': tenant_input.tenant_id}, {'_id': 0})
    if existing:
        raise HTTPException(status_code=400, detail="Tenant ID already exists")
    
    # Create tenant
    tenant = Tenant(
        tenant_id=tenant_input.tenant_id,
        name=tenant_input.name,
        domain=tenant_input.domain,
        branding=tenant_input.branding or TenantBranding(app_name=tenant_input.name),
        modules=tenant_input.modules or TenantModules()
    )
    
    tenant_doc = tenant.model_dump()
    tenant_doc['created_at'] = tenant_doc['created_at'].isoformat()
    tenant_doc['updated_at'] = tenant_doc['updated_at'].isoformat()
    
    await db.tenants.insert_one(tenant_doc)
    
    # Remove MongoDB _id from response
    tenant_doc.pop('_id', None)
    
    return tenant_doc


@router.get("/{tenant_id}")
async def get_tenant(
    tenant_id: str,
    current_user: dict = Depends(get_current_user)
):
    """Get tenant details"""
    # Super admin can view any tenant
    # Tenant admin can only view their own tenant
    current_tenant = get_current_tenant_id()
    
    if not is_super_admin(current_user) and tenant_id != current_tenant:
        raise HTTPException(status_code=403, detail="Access denied")
    
    tenant = await db.tenants.find_one({'tenant_id': tenant_id}, {'_id': 0})
    if not tenant:
        raise HTTPException(status_code=404, detail="Tenant not found")
    
    return tenant


@router.put("/{tenant_id}")
async def update_tenant(
    tenant_id: str,
    tenant_update: TenantUpdate,
    current_user: dict = Depends(get_current_user)
):
    """Update tenant settings"""
    current_tenant = get_current_tenant_id()
    
    # Super admin can update any tenant
    # Tenant admin can only update their own tenant (limited fields)
    if not is_super_admin(current_user):
        if tenant_id != current_tenant:
            raise HTTPException(status_code=403, detail="Access denied")
        if not is_tenant_admin(current_user):
            raise HTTPException(status_code=403, detail="Tenant Admin access required")
    
    tenant = await db.tenants.find_one({'tenant_id': tenant_id}, {'_id': 0})
    if not tenant:
        raise HTTPException(status_code=404, detail="Tenant not found")
    
    # Build update
    update_data = {}
    
    if tenant_update.name is not None:
        update_data['name'] = tenant_update.name
    if tenant_update.domain is not None:
        update_data['domain'] = tenant_update.domain
    if tenant_update.is_active is not None and is_super_admin(current_user):
        update_data['is_active'] = tenant_update.is_active
    if tenant_update.branding is not None:
        update_data['branding'] = tenant_update.branding.model_dump()
    if tenant_update.modules is not None and is_super_admin(current_user):
        update_data['modules'] = tenant_update.modules.model_dump()
    if tenant_update.integrations is not None:
        update_data['integrations'] = tenant_update.integrations.model_dump()
    if tenant_update.settings is not None:
        update_data['settings'] = tenant_update.settings.model_dump()
    
    update_data['updated_at'] = datetime.now(timezone.utc).isoformat()
    
    await db.tenants.update_one({'tenant_id': tenant_id}, {'$set': update_data})
    
    updated = await db.tenants.find_one({'tenant_id': tenant_id}, {'_id': 0})
    return updated


@router.delete("/{tenant_id}")
async def delete_tenant(
    tenant_id: str,
    current_user: dict = Depends(get_current_user)
):
    """Deactivate a tenant (Super Admin only)"""
    if not is_super_admin(current_user):
        raise HTTPException(status_code=403, detail="Super Admin access required")
    
    if tenant_id == 'nyla-air-water':
        raise HTTPException(status_code=400, detail="Cannot delete default tenant")
    
    tenant = await db.tenants.find_one({'tenant_id': tenant_id}, {'_id': 0})
    if not tenant:
        raise HTTPException(status_code=404, detail="Tenant not found")
    
    # Soft delete - just deactivate
    await db.tenants.update_one(
        {'tenant_id': tenant_id},
        {'$set': {'is_active': False, 'updated_at': datetime.now(timezone.utc).isoformat()}}
    )
    
    return {"message": f"Tenant {tenant_id} deactivated"}


# ============== CURRENT TENANT ENDPOINTS ==============

@router.get("/current/config")
async def get_current_tenant_config(
    request: Request,
    current_user: dict = Depends(get_current_user)
):
    """Get current tenant configuration (for frontend)"""
    tenant_id = get_current_tenant_id()
    
    await ensure_default_tenant()
    
    tenant = await db.tenants.find_one({'tenant_id': tenant_id}, {'_id': 0})
    if not tenant:
        # Return default config
        return DEFAULT_TENANT.model_dump()
    
    return tenant


@router.put("/current/branding")
async def update_current_tenant_branding(
    branding: TenantBranding,
    current_user: dict = Depends(get_current_user)
):
    """Update current tenant branding (Tenant Admin)"""
    if not is_tenant_admin(current_user):
        raise HTTPException(status_code=403, detail="Tenant Admin access required")
    
    tenant_id = get_current_tenant_id()
    
    await db.tenants.update_one(
        {'tenant_id': tenant_id},
        {'$set': {
            'branding': branding.model_dump(),
            'updated_at': datetime.now(timezone.utc).isoformat()
        }}
    )
    
    updated = await db.tenants.find_one({'tenant_id': tenant_id}, {'_id': 0})
    return updated


@router.put("/current/settings")
async def update_current_tenant_settings(
    settings: TenantSettings,
    current_user: dict = Depends(get_current_user)
):
    """Update current tenant settings (Tenant Admin)"""
    if not is_tenant_admin(current_user):
        raise HTTPException(status_code=403, detail="Tenant Admin access required")
    
    tenant_id = get_current_tenant_id()
    
    await db.tenants.update_one(
        {'tenant_id': tenant_id},
        {'$set': {
            'settings': settings.model_dump(),
            'updated_at': datetime.now(timezone.utc).isoformat()
        }}
    )
    
    updated = await db.tenants.find_one({'tenant_id': tenant_id}, {'_id': 0})
    return updated


@router.put("/current/config")
async def update_current_tenant_config(
    request: Request,
    current_user: dict = Depends(get_current_user)
):
    """Update current tenant config (modules require Super Admin)"""
    if not is_tenant_admin(current_user):
        raise HTTPException(status_code=403, detail="Tenant Admin access required")
    
    tenant_id = get_current_tenant_id()
    data = await request.json()
    
    update_data = {}
    
    # Branding can be updated by tenant admin
    if 'branding' in data:
        update_data['branding'] = data['branding']
    
    # Settings can be updated by tenant admin
    if 'settings' in data:
        update_data['settings'] = data['settings']
    
    # Modules require super admin
    if 'modules' in data:
        if is_super_admin(current_user):
            update_data['modules'] = data['modules']
        else:
            raise HTTPException(status_code=403, detail="Module changes require Super Admin access")
    
    if update_data:
        update_data['updated_at'] = datetime.now(timezone.utc).isoformat()
        await db.tenants.update_one(
            {'tenant_id': tenant_id},
            {'$set': update_data}
        )
    
    updated = await db.tenants.find_one({'tenant_id': tenant_id}, {'_id': 0})
    return updated


# ============== TENANT STATS ==============

@router.get("/{tenant_id}/stats")
async def get_tenant_stats(
    tenant_id: str,
    current_user: dict = Depends(get_current_user)
):
    """Get tenant usage statistics"""
    current_tenant = get_current_tenant_id()
    
    if not is_super_admin(current_user) and tenant_id != current_tenant:
        raise HTTPException(status_code=403, detail="Access denied")
    
    # Count documents per collection for this tenant
    stats = {
        'users': await db.users.count_documents({'tenant_id': tenant_id}),
        'leads': await db.leads.count_documents({'tenant_id': tenant_id}),
        'accounts': await db.accounts.count_documents({'tenant_id': tenant_id}),
        'contacts': await db.contacts.count_documents({'tenant_id': tenant_id}),
        'activities': await db.activities.count_documents({'tenant_id': tenant_id}),
        'tasks': await db.tasks.count_documents({'tenant_id': tenant_id}),
        'meetings': await db.meetings.count_documents({'tenant_id': tenant_id}),
    }
    
    return stats
