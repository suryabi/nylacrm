"""
Role Management Routes
CRUD operations for custom roles per tenant
"""
from fastapi import APIRouter, HTTPException, Depends
from datetime import datetime, timezone
from typing import List
import logging

from database import db
from models.role import (
    Role, RoleCreate, RoleUpdate, 
    get_default_roles, MODULE_CATEGORIES, MODULE_LABELS,
    DEFAULT_MODULE_PERMISSIONS, FULL_ACCESS_PERMISSIONS
)
from deps import get_current_user
from core.tenant import get_current_tenant_id

router = APIRouter()
logger = logging.getLogger(__name__)


def is_role_admin(user: dict) -> bool:
    """Check if user can manage roles (Admin only)"""
    return user.get('role') in ['Admin', 'CEO', 'Director', 'System Admin']


@router.get("")
async def list_roles(current_user: dict = Depends(get_current_user)):
    """List all roles for current tenant"""
    tenant_id = get_current_tenant_id()
    
    roles = await db.roles.find(
        {"tenant_id": tenant_id},
        {"_id": 0}
    ).sort("name", 1).to_list(100)
    
    # If no roles exist, create default roles
    if not roles:
        default_roles = get_default_roles(tenant_id)
        await db.roles.insert_many(default_roles)
        # Re-fetch to avoid _id in response
        roles = await db.roles.find(
            {"tenant_id": tenant_id},
            {"_id": 0}
        ).sort("name", 1).to_list(100)
    
    # Backfill: ensure every role has all currently-known module keys.
    # New keys default to view=False (admin-style roles get full access via name match).
    admin_role_names = {"Admin", "System Admin"}
    for role in roles:
        perms = role.get("permissions") or {}
        is_admin_like = role.get("name") in admin_role_names
        added = False
        for key, default in DEFAULT_MODULE_PERMISSIONS.items():
            if key not in perms:
                perms[key] = (
                    {"view": True, "create": True, "edit": True, "delete": True}
                    if is_admin_like else dict(default)
                )
                added = True
        if added:
            role["permissions"] = perms
            await db.roles.update_one(
                {"id": role["id"], "tenant_id": tenant_id},
                {"$set": {"permissions": perms, "updated_at": datetime.now(timezone.utc).isoformat()}}
            )
    
    return {
        "roles": roles,
        "module_categories": MODULE_CATEGORIES,
        "module_labels": MODULE_LABELS
    }


@router.get("/{role_id}")
async def get_role(role_id: str, current_user: dict = Depends(get_current_user)):
    """Get a specific role by ID"""
    tenant_id = get_current_tenant_id()
    
    role = await db.roles.find_one(
        {"id": role_id, "tenant_id": tenant_id},
        {"_id": 0}
    )
    
    if not role:
        raise HTTPException(status_code=404, detail="Role not found")
    
    return role


@router.post("")
async def create_role(
    role_data: RoleCreate,
    current_user: dict = Depends(get_current_user)
):
    """Create a new custom role"""
    if not is_role_admin(current_user):
        raise HTTPException(status_code=403, detail="Admin access required to create roles")
    
    tenant_id = get_current_tenant_id()
    
    # Check if role name already exists
    existing = await db.roles.find_one(
        {"tenant_id": tenant_id, "name": {"$regex": f"^{role_data.name}$", "$options": "i"}},
        {"_id": 0}
    )
    if existing:
        raise HTTPException(status_code=400, detail="A role with this name already exists")
    
    # Create new role
    now = datetime.now(timezone.utc)
    new_role = Role(
        tenant_id=tenant_id,
        name=role_data.name,
        description=role_data.description,
        permissions=role_data.permissions or DEFAULT_MODULE_PERMISSIONS.copy(),
        is_system_role=False,
        is_default=role_data.is_default,
        created_at=now,
        updated_at=now,
        created_by=current_user.get('id')
    )
    
    # If this is set as default, unset other default roles
    if role_data.is_default:
        await db.roles.update_many(
            {"tenant_id": tenant_id, "is_default": True},
            {"$set": {"is_default": False, "updated_at": now.isoformat()}}
        )
    
    role_doc = new_role.model_dump()
    role_doc['created_at'] = role_doc['created_at'].isoformat()
    role_doc['updated_at'] = role_doc['updated_at'].isoformat()
    
    await db.roles.insert_one(role_doc)
    
    # Remove _id added by MongoDB before returning
    role_doc.pop('_id', None)
    
    logger.info(f"Role '{role_data.name}' created by {current_user['email']} in tenant {tenant_id}")
    
    return role_doc


@router.put("/{role_id}")
async def update_role(
    role_id: str,
    role_data: RoleUpdate,
    current_user: dict = Depends(get_current_user)
):
    """Update an existing role"""
    if not is_role_admin(current_user):
        raise HTTPException(status_code=403, detail="Admin access required to update roles")
    
    tenant_id = get_current_tenant_id()
    
    role = await db.roles.find_one(
        {"id": role_id, "tenant_id": tenant_id},
        {"_id": 0}
    )
    
    if not role:
        raise HTTPException(status_code=404, detail="Role not found")
    
    # Check name uniqueness if changing name
    if role_data.name and role_data.name.lower() != role['name'].lower():
        existing = await db.roles.find_one(
            {"tenant_id": tenant_id, "name": {"$regex": f"^{role_data.name}$", "$options": "i"}},
            {"_id": 0}
        )
        if existing:
            raise HTTPException(status_code=400, detail="A role with this name already exists")
    
    now = datetime.now(timezone.utc)
    update_data = {"updated_at": now.isoformat()}
    
    if role_data.name is not None:
        update_data['name'] = role_data.name
    if role_data.description is not None:
        update_data['description'] = role_data.description
    if role_data.permissions is not None:
        update_data['permissions'] = role_data.permissions
    
    # Handle default role change
    if role_data.is_default is not None:
        if role_data.is_default:
            # Unset other default roles
            await db.roles.update_many(
                {"tenant_id": tenant_id, "is_default": True},
                {"$set": {"is_default": False, "updated_at": now.isoformat()}}
            )
        update_data['is_default'] = role_data.is_default
    
    await db.roles.update_one(
        {"id": role_id, "tenant_id": tenant_id},
        {"$set": update_data}
    )
    
    updated_role = await db.roles.find_one(
        {"id": role_id, "tenant_id": tenant_id},
        {"_id": 0}
    )
    
    logger.info(f"Role '{role['name']}' updated by {current_user['email']}")
    
    return updated_role


@router.delete("/{role_id}")
async def delete_role(role_id: str, current_user: dict = Depends(get_current_user)):
    """Delete a custom role"""
    if not is_role_admin(current_user):
        raise HTTPException(status_code=403, detail="Admin access required to delete roles")
    
    tenant_id = get_current_tenant_id()
    
    role = await db.roles.find_one(
        {"id": role_id, "tenant_id": tenant_id},
        {"_id": 0}
    )
    
    if not role:
        raise HTTPException(status_code=404, detail="Role not found")
    
    # CEO can delete system roles, others cannot
    if role.get('is_system_role') and current_user.get('role') != 'CEO':
        raise HTTPException(status_code=400, detail="Only CEO can delete system roles")
    
    # Check if any users have this role
    users_with_role = await db.users.count_documents({
        "tenant_id": tenant_id,
        "role": role['name']
    })
    
    if users_with_role > 0:
        raise HTTPException(
            status_code=400, 
            detail=f"Cannot delete role. {users_with_role} user(s) are assigned this role. Reassign them first."
        )
    
    await db.roles.delete_one({"id": role_id, "tenant_id": tenant_id})
    
    logger.info(f"Role '{role['name']}' deleted by {current_user['email']}")
    
    return {"message": f"Role '{role['name']}' deleted successfully"}


@router.post("/{role_id}/set-default")
async def set_default_role(role_id: str, current_user: dict = Depends(get_current_user)):
    """Set a role as the default for new users"""
    if not is_role_admin(current_user):
        raise HTTPException(status_code=403, detail="Admin access required")
    
    tenant_id = get_current_tenant_id()
    
    role = await db.roles.find_one(
        {"id": role_id, "tenant_id": tenant_id},
        {"_id": 0}
    )
    
    if not role:
        raise HTTPException(status_code=404, detail="Role not found")
    
    now = datetime.now(timezone.utc).isoformat()
    
    # Unset all other defaults
    await db.roles.update_many(
        {"tenant_id": tenant_id, "is_default": True},
        {"$set": {"is_default": False, "updated_at": now}}
    )
    
    # Set this role as default
    await db.roles.update_one(
        {"id": role_id, "tenant_id": tenant_id},
        {"$set": {"is_default": True, "updated_at": now}}
    )
    
    return {"message": f"'{role['name']}' is now the default role for new users"}


@router.get("/by-name/{role_name}")
async def get_role_by_name(role_name: str, current_user: dict = Depends(get_current_user)):
    """Get a role by name (case-insensitive)"""
    tenant_id = get_current_tenant_id()
    
    role = await db.roles.find_one(
        {"tenant_id": tenant_id, "name": {"$regex": f"^{role_name}$", "$options": "i"}},
        {"_id": 0}
    )
    
    if not role:
        # Return default permissions if role not found
        return {
            "name": role_name,
            "permissions": DEFAULT_MODULE_PERMISSIONS,
            "is_default": False
        }
    
    return role


@router.post("/ensure-defaults")
async def ensure_default_roles(current_user: dict = Depends(get_current_user)):
    """Ensure default system roles exist for tenant"""
    if not is_role_admin(current_user):
        raise HTTPException(status_code=403, detail="Admin access required")
    
    tenant_id = get_current_tenant_id()
    
    # Check if roles exist
    existing_count = await db.roles.count_documents({"tenant_id": tenant_id})
    
    if existing_count == 0:
        default_roles = get_default_roles(tenant_id)
        await db.roles.insert_many(default_roles)
        return {"message": "Default roles created", "count": len(default_roles)}
    
    return {"message": "Roles already exist", "count": existing_count}
