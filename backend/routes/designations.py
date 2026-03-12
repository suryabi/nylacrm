"""
Designation Management Routes
CRUD operations for custom designations per tenant
"""
from fastapi import APIRouter, HTTPException, Depends
from datetime import datetime, timezone
from typing import List, Optional
from pydantic import BaseModel
import logging
import uuid

from database import db
from deps import get_current_user
from core.tenant import get_current_tenant_id

router = APIRouter()
logger = logging.getLogger(__name__)

# Default designations
DEFAULT_DESIGNATIONS = [
    {"name": "CEO", "department": "Admin", "level": 1},
    {"name": "Director", "department": "Admin", "level": 2},
    {"name": "Vice President", "department": "Admin", "level": 3},
    {"name": "National Sales Head", "department": "Sales", "level": 4},
    {"name": "Regional Sales Manager", "department": "Sales", "level": 5},
    {"name": "Partner - Sales", "department": "Sales", "level": 6},
    {"name": "Head of Business", "department": "Sales", "level": 7},
    {"name": "Business Development Executive", "department": "Sales", "level": 8},
    {"name": "Sales Representative", "department": "Sales", "level": 9},
    {"name": "Production Manager", "department": "Production", "level": 5},
    {"name": "Production Supervisor", "department": "Production", "level": 6},
    {"name": "System Admin", "department": "Admin", "level": 3},
]


class DesignationCreate(BaseModel):
    name: str
    department: Optional[str] = "Sales"
    level: Optional[int] = 10


class DesignationUpdate(BaseModel):
    name: Optional[str] = None
    department: Optional[str] = None
    level: Optional[int] = None


def is_admin(user: dict) -> bool:
    """Check if user can manage designations"""
    return user.get('role') in ['Admin', 'CEO', 'Director', 'System Admin']


@router.get("")
async def list_designations(current_user: dict = Depends(get_current_user)):
    """List all designations for current tenant"""
    tenant_id = get_current_tenant_id()
    
    designations = await db.designations.find(
        {"tenant_id": tenant_id},
        {"_id": 0}
    ).sort("level", 1).to_list(100)
    
    # If no designations exist, create defaults
    if not designations:
        now = datetime.now(timezone.utc).isoformat()
        default_docs = []
        for d in DEFAULT_DESIGNATIONS:
            default_docs.append({
                "id": str(uuid.uuid4()),
                "tenant_id": tenant_id,
                "name": d["name"],
                "department": d["department"],
                "level": d["level"],
                "is_system": True,
                "created_at": now,
                "updated_at": now
            })
        await db.designations.insert_many(default_docs)
        
        # Re-fetch to avoid _id in response
        designations = await db.designations.find(
            {"tenant_id": tenant_id},
            {"_id": 0}
        ).sort("level", 1).to_list(100)
    
    return {
        "designations": designations,
        "total": len(designations)
    }


@router.post("")
async def create_designation(
    data: DesignationCreate,
    current_user: dict = Depends(get_current_user)
):
    """Create a new designation"""
    if not is_admin(current_user):
        raise HTTPException(status_code=403, detail="Admin access required")
    
    tenant_id = get_current_tenant_id()
    
    # Check if designation name already exists
    existing = await db.designations.find_one(
        {"tenant_id": tenant_id, "name": {"$regex": f"^{data.name}$", "$options": "i"}},
        {"_id": 0}
    )
    if existing:
        raise HTTPException(status_code=400, detail="A designation with this name already exists")
    
    now = datetime.now(timezone.utc).isoformat()
    new_designation = {
        "id": str(uuid.uuid4()),
        "tenant_id": tenant_id,
        "name": data.name,
        "department": data.department,
        "level": data.level,
        "is_system": False,
        "created_at": now,
        "updated_at": now,
        "created_by": current_user.get('id')
    }
    
    await db.designations.insert_one(new_designation)
    new_designation.pop('_id', None)
    
    logger.info(f"Designation '{data.name}' created by {current_user['email']} in tenant {tenant_id}")
    
    return new_designation


@router.put("/{designation_id}")
async def update_designation(
    designation_id: str,
    data: DesignationUpdate,
    current_user: dict = Depends(get_current_user)
):
    """Update a designation"""
    if not is_admin(current_user):
        raise HTTPException(status_code=403, detail="Admin access required")
    
    tenant_id = get_current_tenant_id()
    
    designation = await db.designations.find_one(
        {"id": designation_id, "tenant_id": tenant_id},
        {"_id": 0}
    )
    
    if not designation:
        raise HTTPException(status_code=404, detail="Designation not found")
    
    # Check name uniqueness if changing name
    if data.name and data.name.lower() != designation['name'].lower():
        existing = await db.designations.find_one(
            {"tenant_id": tenant_id, "name": {"$regex": f"^{data.name}$", "$options": "i"}},
            {"_id": 0}
        )
        if existing:
            raise HTTPException(status_code=400, detail="A designation with this name already exists")
    
    update_data = {"updated_at": datetime.now(timezone.utc).isoformat()}
    
    if data.name is not None:
        update_data['name'] = data.name
    if data.department is not None:
        update_data['department'] = data.department
    if data.level is not None:
        update_data['level'] = data.level
    
    await db.designations.update_one(
        {"id": designation_id, "tenant_id": tenant_id},
        {"$set": update_data}
    )
    
    updated = await db.designations.find_one(
        {"id": designation_id, "tenant_id": tenant_id},
        {"_id": 0}
    )
    
    return updated


@router.delete("/{designation_id}")
async def delete_designation(
    designation_id: str,
    current_user: dict = Depends(get_current_user)
):
    """Delete a designation"""
    if not is_admin(current_user):
        raise HTTPException(status_code=403, detail="Admin access required")
    
    tenant_id = get_current_tenant_id()
    
    designation = await db.designations.find_one(
        {"id": designation_id, "tenant_id": tenant_id},
        {"_id": 0}
    )
    
    if not designation:
        raise HTTPException(status_code=404, detail="Designation not found")
    
    if designation.get('is_system'):
        raise HTTPException(status_code=400, detail="System designations cannot be deleted")
    
    # Check if any users have this designation
    users_with_designation = await db.users.count_documents({
        "tenant_id": tenant_id,
        "designation": designation['name']
    })
    
    if users_with_designation > 0:
        raise HTTPException(
            status_code=400,
            detail=f"Cannot delete designation. {users_with_designation} user(s) have this designation."
        )
    
    await db.designations.delete_one({"id": designation_id, "tenant_id": tenant_id})
    
    logger.info(f"Designation '{designation['name']}' deleted by {current_user['email']}")
    
    return {"message": f"Designation '{designation['name']}' deleted successfully"}
