"""
Platform Admin Routes - Super admin management of all tenants
Only accessible by platform administrators
"""
from fastapi import APIRouter, HTTPException, Depends, Request
from datetime import datetime, timezone, timedelta
from typing import Optional, List
import os
import logging

from database import db
from deps import get_current_user

router = APIRouter()
logger = logging.getLogger(__name__)

# Platform admin emails - these users can manage ALL tenants
PLATFORM_ADMIN_EMAILS = os.environ.get(
    'PLATFORM_ADMIN_EMAILS', 
    'surya.yadavalli@gmail.com,surya.yadavalli@nylaairwater.earth'
).lower().split(',')


def is_platform_admin(user: dict) -> bool:
    """Check if user is a platform administrator"""
    if not user:
        return False
    email = user.get('email', '').lower().strip()
    return email in [e.strip() for e in PLATFORM_ADMIN_EMAILS]


def require_platform_admin(current_user: dict = Depends(get_current_user)):
    """Dependency to require platform admin access"""
    if not is_platform_admin(current_user):
        raise HTTPException(
            status_code=403, 
            detail="Platform Admin access required. Contact support if you need access."
        )
    return current_user


@router.get("/tenants")
async def list_all_tenants(
    current_user: dict = Depends(require_platform_admin),
    skip: int = 0,
    limit: int = 50,
    search: Optional[str] = None,
    status: Optional[str] = None  # active, inactive, trial
):
    """List all tenants with filtering options"""
    query = {}
    
    if search:
        query["$or"] = [
            {"name": {"$regex": search, "$options": "i"}},
            {"tenant_id": {"$regex": search, "$options": "i"}},
            {"registered_email": {"$regex": search, "$options": "i"}}
        ]
    
    if status == "active":
        query["is_active"] = True
        query["is_trial"] = False
    elif status == "inactive":
        query["is_active"] = False
    elif status == "trial":
        query["is_trial"] = True
    
    # Get total count
    total = await db.tenants.count_documents(query)
    
    # Get tenants
    tenants = await db.tenants.find(
        query,
        {
            "_id": 0,
            "tenant_id": 1,
            "name": 1,
            "is_active": 1,
            "is_trial": 1,
            "trial_ends_at": 1,
            "subscription_plan": 1,
            "registered_email": 1,
            "email_verified": 1,
            "created_at": 1,
            "branding.app_name": 1,
            "branding.primary_color": 1,
            "auth_config.google_workspace.enabled": 1
        }
    ).sort("created_at", -1).skip(skip).limit(limit).to_list(limit)
    
    # Get user counts for each tenant
    for tenant in tenants:
        user_count = await db.users.count_documents({"tenant_id": tenant["tenant_id"]})
        tenant["user_count"] = user_count
    
    return {
        "tenants": tenants,
        "total": total,
        "skip": skip,
        "limit": limit
    }


@router.get("/tenants/{tenant_id}")
async def get_tenant_details(
    tenant_id: str,
    current_user: dict = Depends(require_platform_admin)
):
    """Get full details of a specific tenant"""
    tenant = await db.tenants.find_one({"tenant_id": tenant_id}, {"_id": 0})
    
    if not tenant:
        raise HTTPException(status_code=404, detail="Tenant not found")
    
    # Get additional stats
    user_count = await db.users.count_documents({"tenant_id": tenant_id})
    lead_count = await db.leads.count_documents({"tenant_id": tenant_id})
    account_count = await db.accounts.count_documents({"tenant_id": tenant_id})
    
    # Get admin users
    admins = await db.users.find(
        {"tenant_id": tenant_id, "role": {"$in": ["Admin", "Director", "CEO"]}},
        {"_id": 0, "id": 1, "name": 1, "email": 1, "role": 1}
    ).to_list(10)
    
    return {
        **tenant,
        "stats": {
            "user_count": user_count,
            "lead_count": lead_count,
            "account_count": account_count
        },
        "admins": admins
    }


@router.put("/tenants/{tenant_id}")
async def update_tenant(
    tenant_id: str,
    request: Request,
    current_user: dict = Depends(require_platform_admin)
):
    """Update any tenant's configuration (Platform Admin only)"""
    tenant = await db.tenants.find_one({"tenant_id": tenant_id}, {"_id": 0})
    
    if not tenant:
        raise HTTPException(status_code=404, detail="Tenant not found")
    
    data = await request.json()
    update_data = {}
    
    # Allowed fields for platform admin to update
    allowed_fields = [
        'name', 'is_active', 'is_trial', 'trial_ends_at', 
        'subscription_plan', 'branding', 'modules', 'settings', 
        'auth_config', 'company_profile'
    ]
    
    for field in allowed_fields:
        if field in data:
            update_data[field] = data[field]
    
    if update_data:
        update_data['updated_at'] = datetime.now(timezone.utc).isoformat()
        await db.tenants.update_one(
            {'tenant_id': tenant_id},
            {'$set': update_data}
        )
        
        logger.info(f"Platform Admin {current_user['email']} updated tenant {tenant_id}")
    
    updated = await db.tenants.find_one({'tenant_id': tenant_id}, {'_id': 0})
    return updated


@router.post("/tenants/{tenant_id}/toggle-status")
async def toggle_tenant_status(
    tenant_id: str,
    current_user: dict = Depends(require_platform_admin)
):
    """Enable or disable a tenant"""
    tenant = await db.tenants.find_one({"tenant_id": tenant_id}, {"_id": 0, "is_active": 1})
    
    if not tenant:
        raise HTTPException(status_code=404, detail="Tenant not found")
    
    new_status = not tenant.get('is_active', True)
    
    await db.tenants.update_one(
        {'tenant_id': tenant_id},
        {'$set': {
            'is_active': new_status,
            'updated_at': datetime.now(timezone.utc).isoformat()
        }}
    )
    
    logger.info(f"Platform Admin {current_user['email']} {'enabled' if new_status else 'disabled'} tenant {tenant_id}")
    
    return {
        "tenant_id": tenant_id,
        "is_active": new_status,
        "message": f"Tenant {'enabled' if new_status else 'disabled'} successfully"
    }


@router.post("/tenants/{tenant_id}/extend-trial")
async def extend_trial(
    tenant_id: str,
    request: Request,
    current_user: dict = Depends(require_platform_admin)
):
    """Extend a tenant's trial period"""
    tenant = await db.tenants.find_one({"tenant_id": tenant_id}, {"_id": 0})
    
    if not tenant:
        raise HTTPException(status_code=404, detail="Tenant not found")
    
    data = await request.json()
    days = data.get('days', 14)  # Default 14 days extension
    
    # Calculate new trial end date
    current_end = tenant.get('trial_ends_at')
    if current_end:
        try:
            base_date = datetime.fromisoformat(current_end.replace('Z', '+00:00'))
        except (ValueError, AttributeError):
            base_date = datetime.now(timezone.utc)
    else:
        base_date = datetime.now(timezone.utc)
    
    new_end = base_date + timedelta(days=days)
    
    await db.tenants.update_one(
        {'tenant_id': tenant_id},
        {'$set': {
            'trial_ends_at': new_end.isoformat(),
            'is_trial': True,
            'updated_at': datetime.now(timezone.utc).isoformat()
        }}
    )
    
    logger.info(f"Platform Admin {current_user['email']} extended trial for {tenant_id} by {days} days")
    
    return {
        "tenant_id": tenant_id,
        "trial_ends_at": new_end.isoformat(),
        "message": f"Trial extended by {days} days"
    }


@router.post("/tenants/{tenant_id}/upgrade")
async def upgrade_tenant(
    tenant_id: str,
    request: Request,
    current_user: dict = Depends(require_platform_admin)
):
    """Upgrade a tenant's subscription plan"""
    tenant = await db.tenants.find_one({"tenant_id": tenant_id}, {"_id": 0})
    
    if not tenant:
        raise HTTPException(status_code=404, detail="Tenant not found")
    
    data = await request.json()
    plan = data.get('plan', 'professional')  # trial, starter, professional, enterprise
    
    valid_plans = ['trial', 'starter', 'professional', 'enterprise']
    if plan not in valid_plans:
        raise HTTPException(status_code=400, detail=f"Invalid plan. Choose from: {valid_plans}")
    
    await db.tenants.update_one(
        {'tenant_id': tenant_id},
        {'$set': {
            'subscription_plan': plan,
            'is_trial': plan == 'trial',
            'updated_at': datetime.now(timezone.utc).isoformat()
        }}
    )
    
    logger.info(f"Platform Admin {current_user['email']} upgraded {tenant_id} to {plan}")
    
    return {
        "tenant_id": tenant_id,
        "subscription_plan": plan,
        "message": f"Tenant upgraded to {plan} plan"
    }


@router.get("/stats")
async def get_platform_stats(
    current_user: dict = Depends(require_platform_admin)
):
    """Get overall platform statistics"""
    total_tenants = await db.tenants.count_documents({})
    active_tenants = await db.tenants.count_documents({"is_active": True})
    trial_tenants = await db.tenants.count_documents({"is_trial": True})
    total_users = await db.users.count_documents({})
    total_leads = await db.leads.count_documents({})
    
    # Get tenants created in last 30 days
    thirty_days_ago = (datetime.now(timezone.utc) - timedelta(days=30)).isoformat()
    new_tenants = await db.tenants.count_documents({
        "created_at": {"$gte": thirty_days_ago}
    })
    
    # Get subscription breakdown
    plans = await db.tenants.aggregate([
        {"$group": {"_id": "$subscription_plan", "count": {"$sum": 1}}}
    ]).to_list(10)
    
    return {
        "total_tenants": total_tenants,
        "active_tenants": active_tenants,
        "trial_tenants": trial_tenants,
        "inactive_tenants": total_tenants - active_tenants,
        "new_tenants_30d": new_tenants,
        "total_users": total_users,
        "total_leads": total_leads,
        "subscription_breakdown": {p["_id"] or "unknown": p["count"] for p in plans}
    }


@router.delete("/tenants/{tenant_id}")
async def delete_tenant(
    tenant_id: str,
    current_user: dict = Depends(require_platform_admin)
):
    """Delete a tenant and all its data (DANGEROUS - use with caution)"""
    tenant = await db.tenants.find_one({"tenant_id": tenant_id}, {"_id": 0})
    
    if not tenant:
        raise HTTPException(status_code=404, detail="Tenant not found")
    
    # Delete all tenant data
    collections_to_clean = [
        'users', 'leads', 'accounts', 'activities', 'contacts',
        'tasks', 'meetings', 'leave_requests', 'travel_requests',
        'budget_requests', 'lead_statuses', 'business_categories',
        'expense_categories', 'contact_categories', 'documents',
        'target_plans', 'user_sessions'
    ]
    
    deleted_counts = {}
    for collection_name in collections_to_clean:
        collection = db[collection_name]
        result = await collection.delete_many({"tenant_id": tenant_id})
        deleted_counts[collection_name] = result.deleted_count
    
    # Delete the tenant itself
    await db.tenants.delete_one({"tenant_id": tenant_id})
    
    logger.warning(f"Platform Admin {current_user['email']} DELETED tenant {tenant_id}")
    
    return {
        "message": f"Tenant {tenant_id} and all data deleted",
        "deleted_counts": deleted_counts
    }
