"""
Distributor Management Routes
CRUD operations for distributors, operating coverage, and locations
"""
from fastapi import APIRouter, HTTPException, Depends, Query
from datetime import datetime, timezone
from typing import Optional, List
import logging
import uuid

from database import db
from deps import get_current_user
from core.tenant import get_current_tenant_id
from models.distributor import (
    DistributorCreate, DistributorUpdate, Distributor,
    OperatingCoverageCreate, OperatingCoverageUpdate,
    DistributorLocationCreate, DistributorLocationUpdate
)

router = APIRouter()
logger = logging.getLogger(__name__)


def is_distributor_admin(user: dict) -> bool:
    """Check if user can manage distributors"""
    return user.get('role') in ['CEO', 'Director', 'Admin', 'System Admin', 'Vice President', 'National Sales Head']


async def generate_distributor_code(tenant_id: str) -> str:
    """Generate unique distributor code"""
    count = await db.distributors.count_documents({"tenant_id": tenant_id})
    return f"DIST-{count + 1:04d}"


async def generate_location_code(distributor_id: str, tenant_id: str) -> str:
    """Generate unique location code"""
    count = await db.distributor_locations.count_documents({
        "tenant_id": tenant_id,
        "distributor_id": distributor_id
    })
    return f"LOC-{count + 1:03d}"


# ============ Distributor Master CRUD ============

@router.get("")
async def list_distributors(
    status: Optional[str] = None,
    search: Optional[str] = None,
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
    current_user: dict = Depends(get_current_user)
):
    """List all distributors for current tenant"""
    tenant_id = get_current_tenant_id()
    
    query = {"tenant_id": tenant_id}
    
    if status and status != 'all':
        query["status"] = status
    
    if search:
        query["$or"] = [
            {"distributor_name": {"$regex": search, "$options": "i"}},
            {"distributor_code": {"$regex": search, "$options": "i"}},
            {"primary_contact_name": {"$regex": search, "$options": "i"}},
            {"primary_contact_mobile": {"$regex": search, "$options": "i"}}
        ]
    
    total = await db.distributors.count_documents(query)
    
    distributors = await db.distributors.find(
        query,
        {"_id": 0}
    ).sort("created_at", -1).skip((page - 1) * page_size).limit(page_size).to_list(page_size)
    
    # Enrich with counts
    for dist in distributors:
        dist['coverage_count'] = await db.distributor_operating_coverage.count_documents({
            "tenant_id": tenant_id,
            "distributor_id": dist['id'],
            "status": "active"
        })
        dist['locations_count'] = await db.distributor_locations.count_documents({
            "tenant_id": tenant_id,
            "distributor_id": dist['id'],
            "status": "active"
        })
    
    return {
        "distributors": distributors,
        "total": total,
        "page": page,
        "page_size": page_size,
        "total_pages": (total + page_size - 1) // page_size
    }


@router.get("/summary")
async def get_distributors_summary(current_user: dict = Depends(get_current_user)):
    """Get distributors summary stats"""
    tenant_id = get_current_tenant_id()
    
    total = await db.distributors.count_documents({"tenant_id": tenant_id})
    active = await db.distributors.count_documents({"tenant_id": tenant_id, "status": "active"})
    inactive = await db.distributors.count_documents({"tenant_id": tenant_id, "status": "inactive"})
    suspended = await db.distributors.count_documents({"tenant_id": tenant_id, "status": "suspended"})
    
    total_locations = await db.distributor_locations.count_documents({
        "tenant_id": tenant_id,
        "status": "active"
    })
    
    return {
        "total": total,
        "active": active,
        "inactive": inactive,
        "suspended": suspended,
        "total_locations": total_locations
    }


@router.get("/{distributor_id}")
async def get_distributor(distributor_id: str, current_user: dict = Depends(get_current_user)):
    """Get a specific distributor by ID"""
    tenant_id = get_current_tenant_id()
    
    distributor = await db.distributors.find_one(
        {"id": distributor_id, "tenant_id": tenant_id},
        {"_id": 0}
    )
    
    if not distributor:
        raise HTTPException(status_code=404, detail="Distributor not found")
    
    # Get related data
    distributor['operating_coverage'] = await db.distributor_operating_coverage.find(
        {"tenant_id": tenant_id, "distributor_id": distributor_id},
        {"_id": 0}
    ).sort("city", 1).to_list(500)
    
    distributor['locations'] = await db.distributor_locations.find(
        {"tenant_id": tenant_id, "distributor_id": distributor_id},
        {"_id": 0}
    ).sort("location_name", 1).to_list(100)
    
    return distributor


@router.post("")
async def create_distributor(
    data: DistributorCreate,
    current_user: dict = Depends(get_current_user)
):
    """Create a new distributor"""
    if not is_distributor_admin(current_user):
        raise HTTPException(status_code=403, detail="Admin access required to create distributors")
    
    tenant_id = get_current_tenant_id()
    now = datetime.now(timezone.utc).isoformat()
    
    # Generate distributor code if not provided
    distributor_code = data.distributor_code or await generate_distributor_code(tenant_id)
    
    # Check if code already exists
    existing = await db.distributors.find_one({
        "tenant_id": tenant_id,
        "distributor_code": distributor_code
    })
    if existing:
        raise HTTPException(status_code=400, detail="Distributor code already exists")
    
    distributor_doc = {
        "id": str(uuid.uuid4()),
        "tenant_id": tenant_id,
        "distributor_name": data.distributor_name,
        "legal_entity_name": data.legal_entity_name,
        "distributor_code": distributor_code,
        "gstin": data.gstin,
        "pan": data.pan,
        "billing_address": data.billing_address,
        "registered_address": data.registered_address,
        "primary_contact_name": data.primary_contact_name,
        "primary_contact_mobile": data.primary_contact_mobile,
        "primary_contact_email": data.primary_contact_email,
        "secondary_contact_name": data.secondary_contact_name,
        "secondary_contact_mobile": data.secondary_contact_mobile,
        "secondary_contact_email": data.secondary_contact_email,
        "payment_terms": data.payment_terms or "net_30",
        "credit_days": data.credit_days or 30,
        "credit_limit": data.credit_limit or 0,
        "security_deposit": data.security_deposit or 0,
        "status": data.status or "active",
        "notes": data.notes,
        "created_at": now,
        "updated_at": now,
        "created_by": current_user.get('id')
    }
    
    await db.distributors.insert_one(distributor_doc)
    distributor_doc.pop('_id', None)
    
    logger.info(f"Distributor '{data.distributor_name}' created by {current_user['email']}")
    
    return distributor_doc


@router.put("/{distributor_id}")
async def update_distributor(
    distributor_id: str,
    data: DistributorUpdate,
    current_user: dict = Depends(get_current_user)
):
    """Update a distributor"""
    if not is_distributor_admin(current_user):
        raise HTTPException(status_code=403, detail="Admin access required to update distributors")
    
    tenant_id = get_current_tenant_id()
    
    distributor = await db.distributors.find_one(
        {"id": distributor_id, "tenant_id": tenant_id},
        {"_id": 0}
    )
    
    if not distributor:
        raise HTTPException(status_code=404, detail="Distributor not found")
    
    update_data = {"updated_at": datetime.now(timezone.utc).isoformat()}
    
    # Update only provided fields
    for field in ['distributor_name', 'legal_entity_name', 'distributor_code', 'gstin', 'pan',
                  'billing_address', 'registered_address', 'primary_contact_name', 'primary_contact_mobile',
                  'primary_contact_email', 'secondary_contact_name', 'secondary_contact_mobile',
                  'secondary_contact_email', 'payment_terms', 'credit_days', 'credit_limit',
                  'security_deposit', 'status', 'notes']:
        value = getattr(data, field, None)
        if value is not None:
            update_data[field] = value
    
    await db.distributors.update_one(
        {"id": distributor_id, "tenant_id": tenant_id},
        {"$set": update_data}
    )
    
    updated = await db.distributors.find_one(
        {"id": distributor_id, "tenant_id": tenant_id},
        {"_id": 0}
    )
    
    logger.info(f"Distributor '{distributor_id}' updated by {current_user['email']}")
    
    return updated


@router.delete("/{distributor_id}")
async def delete_distributor(distributor_id: str, current_user: dict = Depends(get_current_user)):
    """Delete a distributor (soft delete by setting status to inactive)"""
    if not is_distributor_admin(current_user):
        raise HTTPException(status_code=403, detail="Admin access required to delete distributors")
    
    tenant_id = get_current_tenant_id()
    
    distributor = await db.distributors.find_one(
        {"id": distributor_id, "tenant_id": tenant_id},
        {"_id": 0}
    )
    
    if not distributor:
        raise HTTPException(status_code=404, detail="Distributor not found")
    
    # Soft delete
    await db.distributors.update_one(
        {"id": distributor_id, "tenant_id": tenant_id},
        {"$set": {"status": "inactive", "updated_at": datetime.now(timezone.utc).isoformat()}}
    )
    
    logger.info(f"Distributor '{distributor['distributor_name']}' deleted by {current_user['email']}")
    
    return {"message": f"Distributor '{distributor['distributor_name']}' deleted successfully"}


# ============ Operating Coverage CRUD ============

@router.get("/{distributor_id}/coverage")
async def list_operating_coverage(
    distributor_id: str,
    current_user: dict = Depends(get_current_user)
):
    """List operating coverage for a distributor"""
    tenant_id = get_current_tenant_id()
    
    coverage = await db.distributor_operating_coverage.find(
        {"tenant_id": tenant_id, "distributor_id": distributor_id},
        {"_id": 0}
    ).sort([("state", 1), ("city", 1)]).to_list(500)
    
    return {"coverage": coverage, "total": len(coverage)}


@router.post("/{distributor_id}/coverage")
async def add_operating_coverage(
    distributor_id: str,
    data: OperatingCoverageCreate,
    current_user: dict = Depends(get_current_user)
):
    """Add operating coverage for a distributor"""
    if not is_distributor_admin(current_user):
        raise HTTPException(status_code=403, detail="Admin access required")
    
    tenant_id = get_current_tenant_id()
    now = datetime.now(timezone.utc).isoformat()
    
    # Check if distributor exists
    distributor = await db.distributors.find_one({"id": distributor_id, "tenant_id": tenant_id})
    if not distributor:
        raise HTTPException(status_code=404, detail="Distributor not found")
    
    # Check for duplicate
    existing = await db.distributor_operating_coverage.find_one({
        "tenant_id": tenant_id,
        "distributor_id": distributor_id,
        "state": data.state,
        "city": data.city,
        "status": "active"
    })
    if existing:
        raise HTTPException(status_code=400, detail="Coverage for this city already exists")
    
    coverage_doc = {
        "id": str(uuid.uuid4()),
        "tenant_id": tenant_id,
        "distributor_id": distributor_id,
        "state": data.state,
        "city": data.city,
        "effective_from": data.effective_from or now,
        "effective_to": data.effective_to,
        "status": data.status or "active",
        "created_at": now,
        "updated_at": now
    }
    
    await db.distributor_operating_coverage.insert_one(coverage_doc)
    coverage_doc.pop('_id', None)
    
    return coverage_doc


@router.post("/{distributor_id}/coverage/bulk")
async def add_bulk_operating_coverage(
    distributor_id: str,
    data: List[OperatingCoverageCreate],
    current_user: dict = Depends(get_current_user)
):
    """Add multiple operating coverages for a distributor"""
    if not is_distributor_admin(current_user):
        raise HTTPException(status_code=403, detail="Admin access required")
    
    tenant_id = get_current_tenant_id()
    now = datetime.now(timezone.utc).isoformat()
    
    # Check if distributor exists
    distributor = await db.distributors.find_one({"id": distributor_id, "tenant_id": tenant_id})
    if not distributor:
        raise HTTPException(status_code=404, detail="Distributor not found")
    
    added = []
    skipped = []
    
    for item in data:
        # Check for duplicate
        existing = await db.distributor_operating_coverage.find_one({
            "tenant_id": tenant_id,
            "distributor_id": distributor_id,
            "state": item.state,
            "city": item.city,
            "status": "active"
        })
        
        if existing:
            skipped.append({"state": item.state, "city": item.city, "reason": "Already exists"})
            continue
        
        coverage_doc = {
            "id": str(uuid.uuid4()),
            "tenant_id": tenant_id,
            "distributor_id": distributor_id,
            "state": item.state,
            "city": item.city,
            "effective_from": item.effective_from or now,
            "effective_to": item.effective_to,
            "status": item.status or "active",
            "created_at": now,
            "updated_at": now
        }
        
        await db.distributor_operating_coverage.insert_one(coverage_doc)
        coverage_doc.pop('_id', None)
        added.append(coverage_doc)
    
    return {
        "added": added,
        "added_count": len(added),
        "skipped": skipped,
        "skipped_count": len(skipped)
    }


@router.delete("/{distributor_id}/coverage/{coverage_id}")
async def delete_operating_coverage(
    distributor_id: str,
    coverage_id: str,
    current_user: dict = Depends(get_current_user)
):
    """Delete operating coverage"""
    if not is_distributor_admin(current_user):
        raise HTTPException(status_code=403, detail="Admin access required")
    
    tenant_id = get_current_tenant_id()
    
    result = await db.distributor_operating_coverage.delete_one({
        "id": coverage_id,
        "tenant_id": tenant_id,
        "distributor_id": distributor_id
    })
    
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Coverage not found")
    
    return {"message": "Coverage deleted successfully"}


# ============ Distributor Locations CRUD ============

@router.get("/{distributor_id}/locations")
async def list_distributor_locations(
    distributor_id: str,
    current_user: dict = Depends(get_current_user)
):
    """List locations for a distributor"""
    tenant_id = get_current_tenant_id()
    
    locations = await db.distributor_locations.find(
        {"tenant_id": tenant_id, "distributor_id": distributor_id},
        {"_id": 0}
    ).sort("location_name", 1).to_list(100)
    
    return {"locations": locations, "total": len(locations)}


@router.post("/{distributor_id}/locations")
async def create_distributor_location(
    distributor_id: str,
    data: DistributorLocationCreate,
    current_user: dict = Depends(get_current_user)
):
    """Create a new distributor location/warehouse"""
    if not is_distributor_admin(current_user):
        raise HTTPException(status_code=403, detail="Admin access required")
    
    tenant_id = get_current_tenant_id()
    now = datetime.now(timezone.utc).isoformat()
    
    # Check if distributor exists
    distributor = await db.distributors.find_one({"id": distributor_id, "tenant_id": tenant_id})
    if not distributor:
        raise HTTPException(status_code=404, detail="Distributor not found")
    
    # Check if city is in operating coverage
    coverage = await db.distributor_operating_coverage.find_one({
        "tenant_id": tenant_id,
        "distributor_id": distributor_id,
        "city": data.city,
        "status": "active"
    })
    if not coverage:
        raise HTTPException(
            status_code=400, 
            detail=f"City '{data.city}' is not in distributor's operating coverage. Add coverage first."
        )
    
    # Generate location code if not provided
    location_code = data.location_code or await generate_location_code(distributor_id, tenant_id)
    
    # If this is marked as default, unset other defaults
    if data.is_default:
        await db.distributor_locations.update_many(
            {"tenant_id": tenant_id, "distributor_id": distributor_id},
            {"$set": {"is_default": False}}
        )
    
    location_doc = {
        "id": str(uuid.uuid4()),
        "tenant_id": tenant_id,
        "distributor_id": distributor_id,
        "location_name": data.location_name,
        "location_code": location_code,
        "address_line_1": data.address_line_1,
        "address_line_2": data.address_line_2,
        "state": data.state,
        "city": data.city,
        "pincode": data.pincode,
        "contact_person": data.contact_person,
        "contact_number": data.contact_number,
        "email": data.email,
        "is_default": data.is_default or False,
        "status": data.status or "active",
        "created_at": now,
        "updated_at": now
    }
    
    await db.distributor_locations.insert_one(location_doc)
    location_doc.pop('_id', None)
    
    logger.info(f"Distributor location '{data.location_name}' created by {current_user['email']}")
    
    return location_doc


@router.put("/{distributor_id}/locations/{location_id}")
async def update_distributor_location(
    distributor_id: str,
    location_id: str,
    data: DistributorLocationUpdate,
    current_user: dict = Depends(get_current_user)
):
    """Update a distributor location"""
    if not is_distributor_admin(current_user):
        raise HTTPException(status_code=403, detail="Admin access required")
    
    tenant_id = get_current_tenant_id()
    
    location = await db.distributor_locations.find_one({
        "id": location_id,
        "tenant_id": tenant_id,
        "distributor_id": distributor_id
    })
    
    if not location:
        raise HTTPException(status_code=404, detail="Location not found")
    
    update_data = {"updated_at": datetime.now(timezone.utc).isoformat()}
    
    # If setting as default, unset other defaults
    if data.is_default:
        await db.distributor_locations.update_many(
            {"tenant_id": tenant_id, "distributor_id": distributor_id, "id": {"$ne": location_id}},
            {"$set": {"is_default": False}}
        )
    
    for field in ['location_name', 'location_code', 'address_line_1', 'address_line_2',
                  'state', 'city', 'pincode', 'contact_person', 'contact_number',
                  'email', 'is_default', 'status']:
        value = getattr(data, field, None)
        if value is not None:
            update_data[field] = value
    
    await db.distributor_locations.update_one(
        {"id": location_id, "tenant_id": tenant_id},
        {"$set": update_data}
    )
    
    updated = await db.distributor_locations.find_one(
        {"id": location_id, "tenant_id": tenant_id},
        {"_id": 0}
    )
    
    return updated


@router.delete("/{distributor_id}/locations/{location_id}")
async def delete_distributor_location(
    distributor_id: str,
    location_id: str,
    current_user: dict = Depends(get_current_user)
):
    """Delete a distributor location"""
    if not is_distributor_admin(current_user):
        raise HTTPException(status_code=403, detail="Admin access required")
    
    tenant_id = get_current_tenant_id()
    
    location = await db.distributor_locations.find_one({
        "id": location_id,
        "tenant_id": tenant_id,
        "distributor_id": distributor_id
    })
    
    if not location:
        raise HTTPException(status_code=404, detail="Location not found")
    
    # Soft delete
    await db.distributor_locations.update_one(
        {"id": location_id, "tenant_id": tenant_id},
        {"$set": {"status": "inactive", "updated_at": datetime.now(timezone.utc).isoformat()}}
    )
    
    return {"message": f"Location '{location['location_name']}' deleted successfully"}


# ============ Dropdown Data ============

@router.get("/dropdown/active")
async def get_active_distributors_dropdown(current_user: dict = Depends(get_current_user)):
    """Get active distributors for dropdown"""
    tenant_id = get_current_tenant_id()
    
    distributors = await db.distributors.find(
        {"tenant_id": tenant_id, "status": "active"},
        {"_id": 0, "id": 1, "distributor_name": 1, "distributor_code": 1}
    ).sort("distributor_name", 1).to_list(500)
    
    return {"distributors": distributors}


@router.get("/{distributor_id}/locations/dropdown")
async def get_distributor_locations_dropdown(
    distributor_id: str,
    current_user: dict = Depends(get_current_user)
):
    """Get active locations for a distributor (for dropdown)"""
    tenant_id = get_current_tenant_id()
    
    locations = await db.distributor_locations.find(
        {"tenant_id": tenant_id, "distributor_id": distributor_id, "status": "active"},
        {"_id": 0, "id": 1, "location_name": 1, "location_code": 1, "city": 1, "is_default": 1}
    ).sort("location_name", 1).to_list(100)
    
    return {"locations": locations}
