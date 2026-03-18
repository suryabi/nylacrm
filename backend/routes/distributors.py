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
    DistributorLocationCreate, DistributorLocationUpdate,
    MarginMatrixCreate, MarginMatrixUpdate,
    AccountDistributorCreate, AccountDistributorUpdate
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


# ============ Margin Matrix CRUD ============

MARGIN_TYPES = {
    "percentage": "Percentage on Account Invoice Value",
    "fixed_per_bottle": "Fixed Amount per Bottle",
    "fixed_per_case": "Fixed Amount per Case/Crate"
}


@router.get("/{distributor_id}/margins")
async def list_margin_matrix(
    distributor_id: str,
    city: Optional[str] = None,
    sku_id: Optional[str] = None,
    status: Optional[str] = None,
    current_user: dict = Depends(get_current_user)
):
    """List margin matrix entries for a distributor"""
    tenant_id = get_current_tenant_id()
    
    query = {"tenant_id": tenant_id, "distributor_id": distributor_id}
    
    if city and city != 'all':
        query["city"] = city
    if sku_id and sku_id != 'all':
        query["sku_id"] = sku_id
    if status and status != 'all':
        query["status"] = status
    
    margins = await db.distributor_margin_matrix.find(
        query,
        {"_id": 0}
    ).sort([("city", 1), ("sku_name", 1)]).to_list(1000)
    
    # Get summary stats
    total = len(margins)
    active = len([m for m in margins if m.get('status') == 'active'])
    by_type = {}
    for m in margins:
        mt = m.get('margin_type', 'unknown')
        by_type[mt] = by_type.get(mt, 0) + 1
    
    return {
        "margins": margins,
        "total": total,
        "active": active,
        "by_type": by_type
    }


@router.get("/{distributor_id}/margins/{margin_id}")
async def get_margin_entry(
    distributor_id: str,
    margin_id: str,
    current_user: dict = Depends(get_current_user)
):
    """Get a specific margin matrix entry"""
    tenant_id = get_current_tenant_id()
    
    margin = await db.distributor_margin_matrix.find_one(
        {"id": margin_id, "tenant_id": tenant_id, "distributor_id": distributor_id},
        {"_id": 0}
    )
    
    if not margin:
        raise HTTPException(status_code=404, detail="Margin entry not found")
    
    return margin


@router.post("/{distributor_id}/margins")
async def create_margin_entry(
    distributor_id: str,
    data: MarginMatrixCreate,
    current_user: dict = Depends(get_current_user)
):
    """Create a new margin matrix entry"""
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
            detail=f"City '{data.city}' is not in distributor's operating coverage"
        )
    
    # Validate margin type
    if data.margin_type not in MARGIN_TYPES:
        raise HTTPException(status_code=400, detail=f"Invalid margin type. Must be one of: {list(MARGIN_TYPES.keys())}")
    
    # Check for duplicate active entry for same city+SKU+date range
    existing = await db.distributor_margin_matrix.find_one({
        "tenant_id": tenant_id,
        "distributor_id": distributor_id,
        "city": data.city,
        "sku_id": data.sku_id,
        "status": "active"
    })
    if existing:
        raise HTTPException(
            status_code=400,
            detail=f"Active margin entry already exists for {data.city} + SKU. Edit the existing entry or deactivate it first."
        )
    
    # Get SKU name if not provided
    sku_name = data.sku_name
    if not sku_name and data.sku_id:
        sku = await db.skus.find_one({"id": data.sku_id}, {"_id": 0, "name": 1})
        if sku:
            sku_name = sku.get('name')
    
    margin_doc = {
        "id": str(uuid.uuid4()),
        "tenant_id": tenant_id,
        "distributor_id": distributor_id,
        "state": data.state,
        "city": data.city,
        "sku_id": data.sku_id,
        "sku_name": sku_name,
        "margin_type": data.margin_type,
        "margin_value": data.margin_value,
        "min_quantity": data.min_quantity,
        "max_quantity": data.max_quantity,
        "effective_from": data.effective_from or now,
        "effective_to": data.effective_to,
        "remarks": data.remarks,
        "status": data.status or "active",
        "created_at": now,
        "updated_at": now,
        "created_by": current_user.get('id')
    }
    
    await db.distributor_margin_matrix.insert_one(margin_doc)
    margin_doc.pop('_id', None)
    
    logger.info(f"Margin entry created for distributor {distributor_id}, city {data.city}, SKU {sku_name} by {current_user['email']}")
    
    return margin_doc


@router.post("/{distributor_id}/margins/bulk")
async def create_bulk_margin_entries(
    distributor_id: str,
    data: List[MarginMatrixCreate],
    current_user: dict = Depends(get_current_user)
):
    """Create multiple margin matrix entries"""
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
        # Check if city is in operating coverage
        coverage = await db.distributor_operating_coverage.find_one({
            "tenant_id": tenant_id,
            "distributor_id": distributor_id,
            "city": item.city,
            "status": "active"
        })
        if not coverage:
            skipped.append({"city": item.city, "sku_id": item.sku_id, "reason": "City not in coverage"})
            continue
        
        # Check for duplicate
        existing = await db.distributor_margin_matrix.find_one({
            "tenant_id": tenant_id,
            "distributor_id": distributor_id,
            "city": item.city,
            "sku_id": item.sku_id,
            "status": "active"
        })
        if existing:
            skipped.append({"city": item.city, "sku_id": item.sku_id, "reason": "Already exists"})
            continue
        
        # Get SKU name
        sku_name = item.sku_name
        if not sku_name and item.sku_id:
            sku = await db.skus.find_one({"id": item.sku_id}, {"_id": 0, "name": 1})
            if sku:
                sku_name = sku.get('name')
        
        margin_doc = {
            "id": str(uuid.uuid4()),
            "tenant_id": tenant_id,
            "distributor_id": distributor_id,
            "state": item.state,
            "city": item.city,
            "sku_id": item.sku_id,
            "sku_name": sku_name,
            "margin_type": item.margin_type,
            "margin_value": item.margin_value,
            "min_quantity": item.min_quantity,
            "max_quantity": item.max_quantity,
            "effective_from": item.effective_from or now,
            "effective_to": item.effective_to,
            "remarks": item.remarks,
            "status": item.status or "active",
            "created_at": now,
            "updated_at": now,
            "created_by": current_user.get('id')
        }
        
        await db.distributor_margin_matrix.insert_one(margin_doc)
        margin_doc.pop('_id', None)
        added.append(margin_doc)
    
    return {
        "added": added,
        "added_count": len(added),
        "skipped": skipped,
        "skipped_count": len(skipped)
    }


@router.put("/{distributor_id}/margins/{margin_id}")
async def update_margin_entry(
    distributor_id: str,
    margin_id: str,
    data: MarginMatrixUpdate,
    current_user: dict = Depends(get_current_user)
):
    """Update a margin matrix entry"""
    if not is_distributor_admin(current_user):
        raise HTTPException(status_code=403, detail="Admin access required")
    
    tenant_id = get_current_tenant_id()
    
    margin = await db.distributor_margin_matrix.find_one({
        "id": margin_id,
        "tenant_id": tenant_id,
        "distributor_id": distributor_id
    })
    
    if not margin:
        raise HTTPException(status_code=404, detail="Margin entry not found")
    
    update_data = {"updated_at": datetime.now(timezone.utc).isoformat()}
    
    for field in ['state', 'city', 'sku_id', 'sku_name', 'margin_type', 'margin_value',
                  'min_quantity', 'max_quantity', 'effective_from', 'effective_to',
                  'remarks', 'status']:
        value = getattr(data, field, None)
        if value is not None:
            update_data[field] = value
    
    # Validate margin type if being updated
    if data.margin_type and data.margin_type not in MARGIN_TYPES:
        raise HTTPException(status_code=400, detail=f"Invalid margin type. Must be one of: {list(MARGIN_TYPES.keys())}")
    
    await db.distributor_margin_matrix.update_one(
        {"id": margin_id, "tenant_id": tenant_id},
        {"$set": update_data}
    )
    
    updated = await db.distributor_margin_matrix.find_one(
        {"id": margin_id, "tenant_id": tenant_id},
        {"_id": 0}
    )
    
    logger.info(f"Margin entry {margin_id} updated by {current_user['email']}")
    
    return updated


@router.delete("/{distributor_id}/margins/{margin_id}")
async def delete_margin_entry(
    distributor_id: str,
    margin_id: str,
    current_user: dict = Depends(get_current_user)
):
    """Delete a margin matrix entry"""
    if not is_distributor_admin(current_user):
        raise HTTPException(status_code=403, detail="Admin access required")
    
    tenant_id = get_current_tenant_id()
    
    margin = await db.distributor_margin_matrix.find_one({
        "id": margin_id,
        "tenant_id": tenant_id,
        "distributor_id": distributor_id
    })
    
    if not margin:
        raise HTTPException(status_code=404, detail="Margin entry not found")
    
    await db.distributor_margin_matrix.delete_one({
        "id": margin_id,
        "tenant_id": tenant_id
    })
    
    logger.info(f"Margin entry {margin_id} deleted by {current_user['email']}")
    
    return {"message": "Margin entry deleted successfully"}


@router.get("/{distributor_id}/margins/cities/list")
async def get_margin_cities(
    distributor_id: str,
    current_user: dict = Depends(get_current_user)
):
    """Get list of cities with margin entries for this distributor"""
    tenant_id = get_current_tenant_id()
    
    margins = await db.distributor_margin_matrix.find(
        {"tenant_id": tenant_id, "distributor_id": distributor_id},
        {"_id": 0, "city": 1}
    ).to_list(1000)
    
    cities = list(set([m['city'] for m in margins]))
    cities.sort()
    
    return {"cities": cities}


@router.get("/{distributor_id}/margins/skus/list")
async def get_margin_skus(
    distributor_id: str,
    current_user: dict = Depends(get_current_user)
):
    """Get list of SKUs with margin entries for this distributor"""
    tenant_id = get_current_tenant_id()
    
    margins = await db.distributor_margin_matrix.find(
        {"tenant_id": tenant_id, "distributor_id": distributor_id},
        {"_id": 0, "sku_id": 1, "sku_name": 1}
    ).to_list(1000)
    
    # Deduplicate by sku_id
    skus = {}
    for m in margins:
        if m['sku_id'] not in skus:
            skus[m['sku_id']] = {"id": m['sku_id'], "name": m.get('sku_name', m['sku_id'])}
    
    return {"skus": list(skus.values())}



# ============ Account-Distributor Assignment CRUD ============

@router.get("/assignments/all")
async def list_all_account_assignments(
    distributor_id: Optional[str] = None,
    account_id: Optional[str] = None,
    city: Optional[str] = None,
    status: Optional[str] = None,
    page: int = Query(1, ge=1),
    page_size: int = Query(50, ge=1, le=200),
    current_user: dict = Depends(get_current_user)
):
    """List all account-distributor assignments"""
    tenant_id = get_current_tenant_id()
    
    query = {"tenant_id": tenant_id}
    
    if distributor_id:
        query["distributor_id"] = distributor_id
    if account_id:
        query["account_id"] = account_id
    if city and city != 'all':
        query["servicing_city"] = city
    if status and status != 'all':
        query["status"] = status
    
    total = await db.account_distributor_assignments.count_documents(query)
    
    assignments = await db.account_distributor_assignments.find(
        query,
        {"_id": 0}
    ).sort([("servicing_city", 1), ("account_name", 1)]).skip((page - 1) * page_size).limit(page_size).to_list(page_size)
    
    return {
        "assignments": assignments,
        "total": total,
        "page": page,
        "page_size": page_size,
        "total_pages": (total + page_size - 1) // page_size
    }


@router.get("/{distributor_id}/assignments")
async def list_distributor_account_assignments(
    distributor_id: str,
    city: Optional[str] = None,
    status: Optional[str] = None,
    current_user: dict = Depends(get_current_user)
):
    """List account assignments for a specific distributor"""
    tenant_id = get_current_tenant_id()
    
    query = {"tenant_id": tenant_id, "distributor_id": distributor_id}
    
    if city and city != 'all':
        query["servicing_city"] = city
    if status and status != 'all':
        query["status"] = status
    
    assignments = await db.account_distributor_assignments.find(
        query,
        {"_id": 0}
    ).sort([("servicing_city", 1), ("account_name", 1)]).to_list(1000)
    
    # Group by city
    by_city = {}
    for a in assignments:
        city_name = a.get('servicing_city', 'Unknown')
        if city_name not in by_city:
            by_city[city_name] = []
        by_city[city_name].append(a)
    
    return {
        "assignments": assignments,
        "by_city": by_city,
        "total": len(assignments)
    }


@router.get("/{distributor_id}/assignments/{assignment_id}")
async def get_assignment(
    distributor_id: str,
    assignment_id: str,
    current_user: dict = Depends(get_current_user)
):
    """Get a specific account-distributor assignment"""
    tenant_id = get_current_tenant_id()
    
    assignment = await db.account_distributor_assignments.find_one(
        {"id": assignment_id, "tenant_id": tenant_id, "distributor_id": distributor_id},
        {"_id": 0}
    )
    
    if not assignment:
        raise HTTPException(status_code=404, detail="Assignment not found")
    
    return assignment


@router.post("/{distributor_id}/assignments")
async def create_account_assignment(
    distributor_id: str,
    data: AccountDistributorCreate,
    current_user: dict = Depends(get_current_user)
):
    """Create a new account-distributor assignment"""
    if not is_distributor_admin(current_user):
        raise HTTPException(status_code=403, detail="Admin access required")
    
    tenant_id = get_current_tenant_id()
    now = datetime.now(timezone.utc).isoformat()
    
    # Validate distributor exists
    distributor = await db.distributors.find_one({"id": distributor_id, "tenant_id": tenant_id})
    if not distributor:
        raise HTTPException(status_code=404, detail="Distributor not found")
    
    # Validate account exists
    account = await db.accounts.find_one({"id": data.account_id, "tenant_id": tenant_id})
    if not account:
        raise HTTPException(status_code=404, detail="Account not found")
    
    # Validate city is in distributor's operating coverage
    coverage = await db.distributor_operating_coverage.find_one({
        "tenant_id": tenant_id,
        "distributor_id": distributor_id,
        "city": data.servicing_city,
        "status": "active"
    })
    if not coverage:
        raise HTTPException(
            status_code=400,
            detail=f"City '{data.servicing_city}' is not in distributor's operating coverage"
        )
    
    # Validate distributor location if provided
    if data.distributor_location_id:
        location = await db.distributor_locations.find_one({
            "id": data.distributor_location_id,
            "tenant_id": tenant_id,
            "distributor_id": distributor_id,
            "status": "active"
        })
        if not location:
            raise HTTPException(status_code=400, detail="Invalid distributor location")
    
    # Check for existing primary assignment for same account + city
    if data.is_primary:
        existing_primary = await db.account_distributor_assignments.find_one({
            "tenant_id": tenant_id,
            "account_id": data.account_id,
            "servicing_city": data.servicing_city,
            "is_primary": True,
            "status": "active"
        })
        if existing_primary and existing_primary.get('distributor_id') != distributor_id:
            raise HTTPException(
                status_code=400,
                detail=f"Account already has a primary distributor for {data.servicing_city}. Remove or change existing assignment first."
            )
    
    # Get names for denormalization
    account_name = data.account_name or account.get('company') or account.get('name')
    distributor_name = data.distributor_name or distributor.get('distributor_name')
    location_name = data.distributor_location_name
    if data.distributor_location_id and not location_name:
        loc = await db.distributor_locations.find_one({"id": data.distributor_location_id}, {"_id": 0, "location_name": 1})
        location_name = loc.get('location_name') if loc else None
    
    assignment_doc = {
        "id": str(uuid.uuid4()),
        "tenant_id": tenant_id,
        "account_id": data.account_id,
        "account_name": account_name,
        "distributor_id": distributor_id,
        "distributor_name": distributor_name,
        "servicing_state": data.servicing_state,
        "servicing_city": data.servicing_city,
        "distributor_location_id": data.distributor_location_id,
        "distributor_location_name": location_name,
        "is_primary": data.is_primary if data.is_primary is not None else True,
        "is_backup": data.is_backup if data.is_backup is not None else False,
        "has_special_override": data.has_special_override or False,
        "override_type": data.override_type,
        "override_value": data.override_value,
        "effective_from": data.effective_from or now,
        "effective_to": data.effective_to,
        "remarks": data.remarks,
        "status": data.status or "active",
        "created_at": now,
        "updated_at": now,
        "created_by": current_user.get('id')
    }
    
    await db.account_distributor_assignments.insert_one(assignment_doc)
    assignment_doc.pop('_id', None)
    
    logger.info(f"Account '{account_name}' assigned to distributor '{distributor_name}' in {data.servicing_city} by {current_user['email']}")
    
    return assignment_doc


@router.put("/{distributor_id}/assignments/{assignment_id}")
async def update_account_assignment(
    distributor_id: str,
    assignment_id: str,
    data: AccountDistributorUpdate,
    current_user: dict = Depends(get_current_user)
):
    """Update an account-distributor assignment"""
    if not is_distributor_admin(current_user):
        raise HTTPException(status_code=403, detail="Admin access required")
    
    tenant_id = get_current_tenant_id()
    
    assignment = await db.account_distributor_assignments.find_one({
        "id": assignment_id,
        "tenant_id": tenant_id,
        "distributor_id": distributor_id
    })
    
    if not assignment:
        raise HTTPException(status_code=404, detail="Assignment not found")
    
    update_data = {"updated_at": datetime.now(timezone.utc).isoformat()}
    
    # Validate distributor location if being updated
    if data.distributor_location_id:
        location = await db.distributor_locations.find_one({
            "id": data.distributor_location_id,
            "tenant_id": tenant_id,
            "distributor_id": distributor_id,
            "status": "active"
        })
        if not location:
            raise HTTPException(status_code=400, detail="Invalid distributor location")
        update_data["distributor_location_name"] = location.get('location_name')
    
    for field in ['distributor_id', 'distributor_name', 'servicing_state', 'servicing_city',
                  'distributor_location_id', 'distributor_location_name', 'is_primary', 'is_backup',
                  'has_special_override', 'override_type', 'override_value',
                  'effective_from', 'effective_to', 'remarks', 'status']:
        value = getattr(data, field, None)
        if value is not None:
            update_data[field] = value
    
    await db.account_distributor_assignments.update_one(
        {"id": assignment_id, "tenant_id": tenant_id},
        {"$set": update_data}
    )
    
    updated = await db.account_distributor_assignments.find_one(
        {"id": assignment_id, "tenant_id": tenant_id},
        {"_id": 0}
    )
    
    logger.info(f"Assignment {assignment_id} updated by {current_user['email']}")
    
    return updated


@router.delete("/{distributor_id}/assignments/{assignment_id}")
async def delete_account_assignment(
    distributor_id: str,
    assignment_id: str,
    current_user: dict = Depends(get_current_user)
):
    """Delete an account-distributor assignment"""
    if not is_distributor_admin(current_user):
        raise HTTPException(status_code=403, detail="Admin access required")
    
    tenant_id = get_current_tenant_id()
    
    assignment = await db.account_distributor_assignments.find_one({
        "id": assignment_id,
        "tenant_id": tenant_id,
        "distributor_id": distributor_id
    })
    
    if not assignment:
        raise HTTPException(status_code=404, detail="Assignment not found")
    
    await db.account_distributor_assignments.delete_one({
        "id": assignment_id,
        "tenant_id": tenant_id
    })
    
    logger.info(f"Assignment for account '{assignment.get('account_name')}' deleted by {current_user['email']}")
    
    return {"message": "Assignment deleted successfully"}


@router.get("/{distributor_id}/assignments/cities/list")
async def get_assignment_cities(
    distributor_id: str,
    current_user: dict = Depends(get_current_user)
):
    """Get list of cities with account assignments for this distributor"""
    tenant_id = get_current_tenant_id()
    
    assignments = await db.account_distributor_assignments.find(
        {"tenant_id": tenant_id, "distributor_id": distributor_id},
        {"_id": 0, "servicing_city": 1}
    ).to_list(1000)
    
    cities = list(set([a['servicing_city'] for a in assignments]))
    cities.sort()
    
    return {"cities": cities}


# Get account's distributor assignments (for account detail page)
@router.get("/account/{account_id}/distributors")
async def get_account_distributors(
    account_id: str,
    current_user: dict = Depends(get_current_user)
):
    """Get distributor assignments for a specific account"""
    tenant_id = get_current_tenant_id()
    
    assignments = await db.account_distributor_assignments.find(
        {"tenant_id": tenant_id, "account_id": account_id},
        {"_id": 0}
    ).sort([("is_primary", -1), ("servicing_city", 1)]).to_list(100)
    
    return {
        "assignments": assignments,
        "total": len(assignments)
    }


# Search accounts for assignment
@router.get("/accounts/search")
async def search_accounts_for_assignment(
    q: str = Query(..., min_length=2),
    city: Optional[str] = None,
    limit: int = Query(20, le=50),
    current_user: dict = Depends(get_current_user)
):
    """Search accounts for distributor assignment"""
    tenant_id = get_current_tenant_id()
    
    query = {
        "tenant_id": tenant_id,
        "$or": [
            {"company": {"$regex": q, "$options": "i"}},
            {"name": {"$regex": q, "$options": "i"}},
            {"account_id": {"$regex": q, "$options": "i"}}
        ]
    }
    
    if city:
        query["city"] = city
    
    accounts = await db.accounts.find(
        query,
        {"_id": 0, "id": 1, "company": 1, "name": 1, "city": 1, "state": 1, "account_id": 1}
    ).limit(limit).to_list(limit)
    
    return {"accounts": accounts}

