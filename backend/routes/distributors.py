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
    AccountDistributorCreate, AccountDistributorUpdate,
    PrimaryShipmentCreate, PrimaryShipmentUpdate, ShipmentItemCreate,
    AccountDeliveryCreate, AccountDeliveryUpdate, DeliveryItemCreate,
    DistributorSettlementCreate, DistributorSettlementUpdate
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


# ============ Primary Shipment / Stock Receipt CRUD ============

SHIPMENT_STATUSES = {
    "draft": "Draft - Not yet confirmed",
    "confirmed": "Confirmed - Ready for dispatch",
    "in_transit": "In Transit - On the way to distributor",
    "delivered": "Delivered - Received by distributor",
    "partially_delivered": "Partially Delivered - Some items received",
    "cancelled": "Cancelled"
}


async def generate_shipment_number(tenant_id: str) -> str:
    """Generate unique shipment number like SHP-2026-0001"""
    year = datetime.now().year
    count = await db.distributor_shipments.count_documents({
        "tenant_id": tenant_id,
        "shipment_number": {"$regex": f"^SHP-{year}-"}
    })
    return f"SHP-{year}-{count + 1:04d}"


def calculate_item_amounts(item: dict) -> dict:
    """Calculate amounts for a shipment item"""
    quantity = item.get('quantity', 0)
    unit_price = item.get('unit_price', 0)
    discount_percent = item.get('discount_percent', 0) or 0
    tax_percent = item.get('tax_percent', 0) or 0
    
    gross_amount = quantity * unit_price
    discount_amount = round(gross_amount * discount_percent / 100, 2)
    taxable_amount = gross_amount - discount_amount
    tax_amount = round(taxable_amount * tax_percent / 100, 2)
    net_amount = taxable_amount + tax_amount
    
    return {
        **item,
        'gross_amount': round(gross_amount, 2),
        'discount_amount': discount_amount,
        'taxable_amount': round(taxable_amount, 2),
        'tax_amount': tax_amount,
        'net_amount': round(net_amount, 2)
    }


@router.get("/shipments/all")
async def list_all_shipments(
    distributor_id: Optional[str] = None,
    location_id: Optional[str] = None,
    status: Optional[str] = None,
    from_date: Optional[str] = None,
    to_date: Optional[str] = None,
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
    current_user: dict = Depends(get_current_user)
):
    """List all primary shipments with filters"""
    tenant_id = get_current_tenant_id()
    
    query = {"tenant_id": tenant_id}
    
    if distributor_id:
        query["distributor_id"] = distributor_id
    if location_id:
        query["distributor_location_id"] = location_id
    if status and status != 'all':
        query["status"] = status
    if from_date:
        query["shipment_date"] = {"$gte": from_date}
    if to_date:
        if "shipment_date" in query:
            query["shipment_date"]["$lte"] = to_date
        else:
            query["shipment_date"] = {"$lte": to_date}
    
    total = await db.distributor_shipments.count_documents(query)
    
    shipments = await db.distributor_shipments.find(
        query,
        {"_id": 0}
    ).sort("shipment_date", -1).skip((page - 1) * page_size).limit(page_size).to_list(page_size)
    
    return {
        "shipments": shipments,
        "total": total,
        "page": page,
        "page_size": page_size,
        "total_pages": (total + page_size - 1) // page_size
    }


@router.get("/shipments/summary")
async def get_shipments_summary(
    distributor_id: Optional[str] = None,
    current_user: dict = Depends(get_current_user)
):
    """Get shipments summary stats"""
    tenant_id = get_current_tenant_id()
    
    query = {"tenant_id": tenant_id}
    if distributor_id:
        query["distributor_id"] = distributor_id
    
    total = await db.distributor_shipments.count_documents(query)
    
    # Count by status
    draft = await db.distributor_shipments.count_documents({**query, "status": "draft"})
    confirmed = await db.distributor_shipments.count_documents({**query, "status": "confirmed"})
    in_transit = await db.distributor_shipments.count_documents({**query, "status": "in_transit"})
    delivered = await db.distributor_shipments.count_documents({**query, "status": "delivered"})
    cancelled = await db.distributor_shipments.count_documents({**query, "status": "cancelled"})
    
    # Calculate totals
    pipeline = [
        {"$match": {**query, "status": {"$ne": "cancelled"}}},
        {"$group": {
            "_id": None,
            "total_quantity": {"$sum": "$total_quantity"},
            "total_amount": {"$sum": "$total_net_amount"}
        }}
    ]
    
    totals = await db.distributor_shipments.aggregate(pipeline).to_list(1)
    total_quantity = totals[0]["total_quantity"] if totals else 0
    total_amount = totals[0]["total_amount"] if totals else 0
    
    return {
        "total": total,
        "by_status": {
            "draft": draft,
            "confirmed": confirmed,
            "in_transit": in_transit,
            "delivered": delivered,
            "cancelled": cancelled
        },
        "total_quantity": total_quantity,
        "total_amount": round(total_amount, 2)
    }


@router.get("/{distributor_id}/shipments")
async def list_distributor_shipments(
    distributor_id: str,
    status: Optional[str] = None,
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
    current_user: dict = Depends(get_current_user)
):
    """List shipments for a specific distributor"""
    tenant_id = get_current_tenant_id()
    
    query = {"tenant_id": tenant_id, "distributor_id": distributor_id}
    
    if status and status != 'all':
        query["status"] = status
    
    total = await db.distributor_shipments.count_documents(query)
    
    shipments = await db.distributor_shipments.find(
        query,
        {"_id": 0}
    ).sort("shipment_date", -1).skip((page - 1) * page_size).limit(page_size).to_list(page_size)
    
    return {
        "shipments": shipments,
        "total": total,
        "page": page,
        "page_size": page_size,
        "total_pages": (total + page_size - 1) // page_size
    }


@router.get("/{distributor_id}/shipments/{shipment_id}")
async def get_shipment(
    distributor_id: str,
    shipment_id: str,
    current_user: dict = Depends(get_current_user)
):
    """Get a specific shipment with items"""
    tenant_id = get_current_tenant_id()
    
    shipment = await db.distributor_shipments.find_one(
        {"id": shipment_id, "tenant_id": tenant_id, "distributor_id": distributor_id},
        {"_id": 0}
    )
    
    if not shipment:
        raise HTTPException(status_code=404, detail="Shipment not found")
    
    # Get shipment items
    items = await db.distributor_shipment_items.find(
        {"shipment_id": shipment_id, "tenant_id": tenant_id},
        {"_id": 0}
    ).to_list(500)
    
    shipment['items'] = items
    
    return shipment


@router.post("/{distributor_id}/shipments")
async def create_shipment(
    distributor_id: str,
    data: PrimaryShipmentCreate,
    current_user: dict = Depends(get_current_user)
):
    """Create a new primary shipment"""
    if not is_distributor_admin(current_user):
        raise HTTPException(status_code=403, detail="Admin access required")
    
    tenant_id = get_current_tenant_id()
    now = datetime.now(timezone.utc).isoformat()
    
    # Validate distributor exists
    distributor = await db.distributors.find_one(
        {"id": distributor_id, "tenant_id": tenant_id},
        {"_id": 0, "distributor_name": 1, "distributor_code": 1}
    )
    if not distributor:
        raise HTTPException(status_code=404, detail="Distributor not found")
    
    # Validate location exists and belongs to distributor
    location = await db.distributor_locations.find_one(
        {"id": data.distributor_location_id, "tenant_id": tenant_id, "distributor_id": distributor_id},
        {"_id": 0, "location_name": 1, "address_line_1": 1, "city": 1, "state": 1, "pincode": 1}
    )
    if not location:
        raise HTTPException(status_code=400, detail="Invalid distributor location")
    
    # Validate items
    if not data.items or len(data.items) == 0:
        raise HTTPException(status_code=400, detail="At least one item is required")
    
    # Generate shipment number
    shipment_number = await generate_shipment_number(tenant_id)
    shipment_id = str(uuid.uuid4())
    
    # Build shipping address from location if not provided
    shipping_address = data.shipping_address
    if not shipping_address:
        addr_parts = [location.get('location_name'), location.get('address_line_1'), 
                      location.get('city'), location.get('state'), location.get('pincode')]
        shipping_address = ', '.join([p for p in addr_parts if p])
    
    # Process items and calculate totals
    items_to_insert = []
    total_quantity = 0
    total_gross_amount = 0
    total_discount_amount = 0
    total_tax_amount = 0
    total_net_amount = 0
    
    for item_data in data.items:
        # Get SKU info if not provided
        sku_name = item_data.sku_name
        sku_code = item_data.sku_code
        if not sku_name or not sku_code:
            sku = await db.skus.find_one({"id": item_data.sku_id}, {"_id": 0, "name": 1, "sku_code": 1})
            if sku:
                sku_name = sku_name or sku.get('name')
                sku_code = sku_code or sku.get('sku_code')
        
        item_dict = {
            'id': str(uuid.uuid4()),
            'tenant_id': tenant_id,
            'shipment_id': shipment_id,
            'sku_id': item_data.sku_id,
            'sku_name': sku_name,
            'sku_code': sku_code,
            'quantity': item_data.quantity,
            'unit_price': item_data.unit_price,
            'discount_percent': item_data.discount_percent or 0,
            'tax_percent': item_data.tax_percent or 0,
            'remarks': item_data.remarks
        }
        
        # Calculate amounts
        item_dict = calculate_item_amounts(item_dict)
        items_to_insert.append(item_dict)
        
        total_quantity += item_data.quantity
        total_gross_amount += item_dict['gross_amount']
        total_discount_amount += item_dict['discount_amount']
        total_tax_amount += item_dict['tax_amount']
        total_net_amount += item_dict['net_amount']
    
    # Create shipment document
    shipment_doc = {
        "id": shipment_id,
        "tenant_id": tenant_id,
        "shipment_number": shipment_number,
        "distributor_id": distributor_id,
        "distributor_name": distributor.get('distributor_name'),
        "distributor_code": distributor.get('distributor_code'),
        "distributor_location_id": data.distributor_location_id,
        "distributor_location_name": location.get('location_name'),
        "shipment_date": data.shipment_date,
        "expected_delivery_date": data.expected_delivery_date,
        "actual_delivery_date": None,
        "reference_number": data.reference_number,
        "vehicle_number": data.vehicle_number,
        "driver_name": data.driver_name,
        "driver_contact": data.driver_contact,
        "shipping_address": shipping_address,
        "status": "draft",
        "total_quantity": total_quantity,
        "total_gross_amount": round(total_gross_amount, 2),
        "total_discount_amount": round(total_discount_amount, 2),
        "total_tax_amount": round(total_tax_amount, 2),
        "total_net_amount": round(total_net_amount, 2),
        "remarks": data.remarks,
        "created_at": now,
        "updated_at": now,
        "created_by": current_user.get('id'),
        "confirmed_at": None,
        "confirmed_by": None,
        "delivered_at": None,
        "delivered_by": None
    }
    
    # Insert shipment and items
    await db.distributor_shipments.insert_one(shipment_doc)
    if items_to_insert:
        await db.distributor_shipment_items.insert_many(items_to_insert)
    
    shipment_doc.pop('_id', None)
    shipment_doc['items'] = [
        {k: v for k, v in item.items() if k not in ['_id', 'tenant_id']} 
        for item in items_to_insert
    ]
    
    logger.info(f"Shipment {shipment_number} created for distributor {distributor_id} by {current_user['email']}")
    
    return shipment_doc


@router.put("/{distributor_id}/shipments/{shipment_id}")
async def update_shipment(
    distributor_id: str,
    shipment_id: str,
    data: PrimaryShipmentUpdate,
    current_user: dict = Depends(get_current_user)
):
    """Update a shipment (only draft shipments can be fully edited)"""
    if not is_distributor_admin(current_user):
        raise HTTPException(status_code=403, detail="Admin access required")
    
    tenant_id = get_current_tenant_id()
    
    shipment = await db.distributor_shipments.find_one(
        {"id": shipment_id, "tenant_id": tenant_id, "distributor_id": distributor_id}
    )
    
    if not shipment:
        raise HTTPException(status_code=404, detail="Shipment not found")
    
    current_status = shipment.get('status')
    
    # Only allow limited updates for non-draft shipments
    if current_status != 'draft':
        allowed_fields = ['remarks', 'vehicle_number', 'driver_name', 'driver_contact', 'expected_delivery_date']
        update_data = {"updated_at": datetime.now(timezone.utc).isoformat()}
        
        for field in allowed_fields:
            value = getattr(data, field, None)
            if value is not None:
                update_data[field] = value
        
        # Status transitions
        if data.status:
            valid_transitions = {
                'confirmed': ['in_transit', 'cancelled'],
                'in_transit': ['delivered', 'partially_delivered'],
                'partially_delivered': ['delivered']
            }
            if data.status not in valid_transitions.get(current_status, []):
                raise HTTPException(
                    status_code=400, 
                    detail=f"Cannot change status from '{current_status}' to '{data.status}'"
                )
            update_data['status'] = data.status
            
            # Set delivery date when marked as delivered
            if data.status in ['delivered', 'partially_delivered']:
                update_data['actual_delivery_date'] = datetime.now(timezone.utc).isoformat()[:10]
                update_data['delivered_at'] = datetime.now(timezone.utc).isoformat()
                update_data['delivered_by'] = current_user.get('id')
    else:
        # Full update for draft shipments
        update_data = {"updated_at": datetime.now(timezone.utc).isoformat()}
        
        for field in ['shipment_date', 'expected_delivery_date', 'reference_number', 
                      'vehicle_number', 'driver_name', 'driver_contact', 'shipping_address', 'remarks']:
            value = getattr(data, field, None)
            if value is not None:
                update_data[field] = value
    
    await db.distributor_shipments.update_one(
        {"id": shipment_id, "tenant_id": tenant_id},
        {"$set": update_data}
    )
    
    updated = await db.distributor_shipments.find_one(
        {"id": shipment_id, "tenant_id": tenant_id},
        {"_id": 0}
    )
    
    logger.info(f"Shipment {shipment_id} updated by {current_user['email']}")
    
    return updated


@router.post("/{distributor_id}/shipments/{shipment_id}/confirm")
async def confirm_shipment(
    distributor_id: str,
    shipment_id: str,
    current_user: dict = Depends(get_current_user)
):
    """Confirm a draft shipment - marks it ready for dispatch"""
    if not is_distributor_admin(current_user):
        raise HTTPException(status_code=403, detail="Admin access required")
    
    tenant_id = get_current_tenant_id()
    
    shipment = await db.distributor_shipments.find_one(
        {"id": shipment_id, "tenant_id": tenant_id, "distributor_id": distributor_id}
    )
    
    if not shipment:
        raise HTTPException(status_code=404, detail="Shipment not found")
    
    if shipment.get('status') != 'draft':
        raise HTTPException(status_code=400, detail="Only draft shipments can be confirmed")
    
    # Validate items exist
    items_count = await db.distributor_shipment_items.count_documents({"shipment_id": shipment_id})
    if items_count == 0:
        raise HTTPException(status_code=400, detail="Cannot confirm shipment without items")
    
    now = datetime.now(timezone.utc).isoformat()
    
    await db.distributor_shipments.update_one(
        {"id": shipment_id, "tenant_id": tenant_id},
        {"$set": {
            "status": "confirmed",
            "confirmed_at": now,
            "confirmed_by": current_user.get('id'),
            "updated_at": now
        }}
    )
    
    logger.info(f"Shipment {shipment['shipment_number']} confirmed by {current_user['email']}")
    
    return {"message": f"Shipment {shipment['shipment_number']} confirmed successfully", "status": "confirmed"}


@router.post("/{distributor_id}/shipments/{shipment_id}/dispatch")
async def dispatch_shipment(
    distributor_id: str,
    shipment_id: str,
    vehicle_number: Optional[str] = None,
    driver_name: Optional[str] = None,
    driver_contact: Optional[str] = None,
    current_user: dict = Depends(get_current_user)
):
    """Mark shipment as dispatched/in-transit"""
    if not is_distributor_admin(current_user):
        raise HTTPException(status_code=403, detail="Admin access required")
    
    tenant_id = get_current_tenant_id()
    
    shipment = await db.distributor_shipments.find_one(
        {"id": shipment_id, "tenant_id": tenant_id, "distributor_id": distributor_id}
    )
    
    if not shipment:
        raise HTTPException(status_code=404, detail="Shipment not found")
    
    if shipment.get('status') != 'confirmed':
        raise HTTPException(status_code=400, detail="Only confirmed shipments can be dispatched")
    
    now = datetime.now(timezone.utc).isoformat()
    
    update_data = {
        "status": "in_transit",
        "updated_at": now
    }
    
    if vehicle_number:
        update_data['vehicle_number'] = vehicle_number
    if driver_name:
        update_data['driver_name'] = driver_name
    if driver_contact:
        update_data['driver_contact'] = driver_contact
    
    await db.distributor_shipments.update_one(
        {"id": shipment_id, "tenant_id": tenant_id},
        {"$set": update_data}
    )
    
    logger.info(f"Shipment {shipment['shipment_number']} dispatched by {current_user['email']}")
    
    return {"message": f"Shipment {shipment['shipment_number']} dispatched", "status": "in_transit"}


@router.post("/{distributor_id}/shipments/{shipment_id}/deliver")
async def mark_shipment_delivered(
    distributor_id: str,
    shipment_id: str,
    delivery_date: Optional[str] = None,
    remarks: Optional[str] = None,
    current_user: dict = Depends(get_current_user)
):
    """Mark shipment as delivered"""
    if not is_distributor_admin(current_user):
        raise HTTPException(status_code=403, detail="Admin access required")
    
    tenant_id = get_current_tenant_id()
    
    shipment = await db.distributor_shipments.find_one(
        {"id": shipment_id, "tenant_id": tenant_id, "distributor_id": distributor_id}
    )
    
    if not shipment:
        raise HTTPException(status_code=404, detail="Shipment not found")
    
    if shipment.get('status') not in ['confirmed', 'in_transit', 'partially_delivered']:
        raise HTTPException(status_code=400, detail="Shipment cannot be marked as delivered in current status")
    
    now = datetime.now(timezone.utc).isoformat()
    actual_date = delivery_date or now[:10]
    
    update_data = {
        "status": "delivered",
        "actual_delivery_date": actual_date,
        "delivered_at": now,
        "delivered_by": current_user.get('id'),
        "updated_at": now
    }
    
    if remarks:
        update_data['remarks'] = (shipment.get('remarks', '') + '\n' + remarks).strip()
    
    await db.distributor_shipments.update_one(
        {"id": shipment_id, "tenant_id": tenant_id},
        {"$set": update_data}
    )
    
    # Update distributor stock (add to location inventory)
    items = await db.distributor_shipment_items.find(
        {"shipment_id": shipment_id, "tenant_id": tenant_id},
        {"_id": 0}
    ).to_list(500)
    
    for item in items:
        # Upsert stock record
        await db.distributor_stock.update_one(
            {
                "tenant_id": tenant_id,
                "distributor_id": distributor_id,
                "distributor_location_id": shipment.get('distributor_location_id'),
                "sku_id": item.get('sku_id')
            },
            {
                "$inc": {"quantity": item.get('quantity', 0)},
                "$set": {
                    "sku_name": item.get('sku_name'),
                    "sku_code": item.get('sku_code'),
                    "distributor_name": shipment.get('distributor_name'),
                    "location_name": shipment.get('distributor_location_name'),
                    "updated_at": now
                },
                "$setOnInsert": {
                    "id": str(uuid.uuid4()),
                    "tenant_id": tenant_id,
                    "distributor_id": distributor_id,
                    "distributor_location_id": shipment.get('distributor_location_id'),
                    "sku_id": item.get('sku_id'),
                    "created_at": now
                }
            },
            upsert=True
        )
    
    logger.info(f"Shipment {shipment['shipment_number']} delivered by {current_user['email']}")
    
    return {"message": f"Shipment {shipment['shipment_number']} delivered", "status": "delivered"}


@router.delete("/{distributor_id}/shipments/{shipment_id}")
async def delete_shipment(
    distributor_id: str,
    shipment_id: str,
    current_user: dict = Depends(get_current_user)
):
    """Delete a draft shipment"""
    if not is_distributor_admin(current_user):
        raise HTTPException(status_code=403, detail="Admin access required")
    
    tenant_id = get_current_tenant_id()
    
    shipment = await db.distributor_shipments.find_one(
        {"id": shipment_id, "tenant_id": tenant_id, "distributor_id": distributor_id}
    )
    
    if not shipment:
        raise HTTPException(status_code=404, detail="Shipment not found")
    
    if shipment.get('status') != 'draft':
        raise HTTPException(status_code=400, detail="Only draft shipments can be deleted")
    
    # Delete items first
    await db.distributor_shipment_items.delete_many({"shipment_id": shipment_id, "tenant_id": tenant_id})
    
    # Delete shipment
    await db.distributor_shipments.delete_one({"id": shipment_id, "tenant_id": tenant_id})
    
    logger.info(f"Shipment {shipment['shipment_number']} deleted by {current_user['email']}")
    
    return {"message": f"Shipment {shipment['shipment_number']} deleted"}


@router.post("/{distributor_id}/shipments/{shipment_id}/cancel")
async def cancel_shipment(
    distributor_id: str,
    shipment_id: str,
    reason: Optional[str] = None,
    current_user: dict = Depends(get_current_user)
):
    """Cancel a shipment (only draft or confirmed can be cancelled)"""
    if not is_distributor_admin(current_user):
        raise HTTPException(status_code=403, detail="Admin access required")
    
    tenant_id = get_current_tenant_id()
    
    shipment = await db.distributor_shipments.find_one(
        {"id": shipment_id, "tenant_id": tenant_id, "distributor_id": distributor_id}
    )
    
    if not shipment:
        raise HTTPException(status_code=404, detail="Shipment not found")
    
    if shipment.get('status') not in ['draft', 'confirmed']:
        raise HTTPException(status_code=400, detail="Only draft or confirmed shipments can be cancelled")
    
    now = datetime.now(timezone.utc).isoformat()
    
    remarks = shipment.get('remarks', '') or ''
    if reason:
        remarks = f"{remarks}\nCancelled: {reason}".strip()
    
    await db.distributor_shipments.update_one(
        {"id": shipment_id, "tenant_id": tenant_id},
        {"$set": {
            "status": "cancelled",
            "remarks": remarks,
            "updated_at": now
        }}
    )
    
    logger.info(f"Shipment {shipment['shipment_number']} cancelled by {current_user['email']}")
    
    return {"message": f"Shipment {shipment['shipment_number']} cancelled", "status": "cancelled"}


# ============ Shipment Items Management ============

@router.post("/{distributor_id}/shipments/{shipment_id}/items")
async def add_shipment_item(
    distributor_id: str,
    shipment_id: str,
    data: ShipmentItemCreate,
    current_user: dict = Depends(get_current_user)
):
    """Add an item to a draft shipment"""
    if not is_distributor_admin(current_user):
        raise HTTPException(status_code=403, detail="Admin access required")
    
    tenant_id = get_current_tenant_id()
    
    shipment = await db.distributor_shipments.find_one(
        {"id": shipment_id, "tenant_id": tenant_id, "distributor_id": distributor_id}
    )
    
    if not shipment:
        raise HTTPException(status_code=404, detail="Shipment not found")
    
    if shipment.get('status') != 'draft':
        raise HTTPException(status_code=400, detail="Can only add items to draft shipments")
    
    # Get SKU info
    sku_name = data.sku_name
    sku_code = data.sku_code
    if not sku_name or not sku_code:
        sku = await db.skus.find_one({"id": data.sku_id}, {"_id": 0, "name": 1, "sku_code": 1})
        if sku:
            sku_name = sku_name or sku.get('name')
            sku_code = sku_code or sku.get('sku_code')
    
    item_dict = {
        'id': str(uuid.uuid4()),
        'tenant_id': tenant_id,
        'shipment_id': shipment_id,
        'sku_id': data.sku_id,
        'sku_name': sku_name,
        'sku_code': sku_code,
        'quantity': data.quantity,
        'unit_price': data.unit_price,
        'discount_percent': data.discount_percent or 0,
        'tax_percent': data.tax_percent or 0,
        'remarks': data.remarks
    }
    
    item_dict = calculate_item_amounts(item_dict)
    
    await db.distributor_shipment_items.insert_one(item_dict)
    
    # Update shipment totals
    await recalculate_shipment_totals(shipment_id, tenant_id)
    
    item_dict.pop('_id', None)
    
    return item_dict


@router.delete("/{distributor_id}/shipments/{shipment_id}/items/{item_id}")
async def remove_shipment_item(
    distributor_id: str,
    shipment_id: str,
    item_id: str,
    current_user: dict = Depends(get_current_user)
):
    """Remove an item from a draft shipment"""
    if not is_distributor_admin(current_user):
        raise HTTPException(status_code=403, detail="Admin access required")
    
    tenant_id = get_current_tenant_id()
    
    shipment = await db.distributor_shipments.find_one(
        {"id": shipment_id, "tenant_id": tenant_id, "distributor_id": distributor_id}
    )
    
    if not shipment:
        raise HTTPException(status_code=404, detail="Shipment not found")
    
    if shipment.get('status') != 'draft':
        raise HTTPException(status_code=400, detail="Can only remove items from draft shipments")
    
    result = await db.distributor_shipment_items.delete_one({
        "id": item_id, 
        "shipment_id": shipment_id, 
        "tenant_id": tenant_id
    })
    
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Item not found")
    
    # Recalculate totals
    await recalculate_shipment_totals(shipment_id, tenant_id)
    
    return {"message": "Item removed"}


async def recalculate_shipment_totals(shipment_id: str, tenant_id: str):
    """Recalculate and update shipment totals"""
    items = await db.distributor_shipment_items.find(
        {"shipment_id": shipment_id, "tenant_id": tenant_id},
        {"_id": 0}
    ).to_list(500)
    
    total_quantity = sum(item.get('quantity', 0) for item in items)
    total_gross_amount = sum(item.get('gross_amount', 0) for item in items)
    total_discount_amount = sum(item.get('discount_amount', 0) for item in items)
    total_tax_amount = sum(item.get('tax_amount', 0) for item in items)
    total_net_amount = sum(item.get('net_amount', 0) for item in items)
    
    await db.distributor_shipments.update_one(
        {"id": shipment_id, "tenant_id": tenant_id},
        {"$set": {
            "total_quantity": total_quantity,
            "total_gross_amount": round(total_gross_amount, 2),
            "total_discount_amount": round(total_discount_amount, 2),
            "total_tax_amount": round(total_tax_amount, 2),
            "total_net_amount": round(total_net_amount, 2),
            "updated_at": datetime.now(timezone.utc).isoformat()
        }}
    )


# ============ Distributor Stock ============

@router.get("/{distributor_id}/stock")
async def get_distributor_stock(
    distributor_id: str,
    location_id: Optional[str] = None,
    current_user: dict = Depends(get_current_user)
):
    """Get current stock levels at distributor locations"""
    tenant_id = get_current_tenant_id()
    
    query = {"tenant_id": tenant_id, "distributor_id": distributor_id}
    
    if location_id:
        query["distributor_location_id"] = location_id
    
    stock = await db.distributor_stock.find(
        query,
        {"_id": 0}
    ).sort([("location_name", 1), ("sku_name", 1)]).to_list(1000)
    
    # Group by location
    by_location = {}
    for item in stock:
        loc_id = item.get('distributor_location_id')
        loc_name = item.get('location_name', 'Unknown')
        if loc_id not in by_location:
            by_location[loc_id] = {
                'location_id': loc_id,
                'location_name': loc_name,
                'items': [],
                'total_quantity': 0
            }
        by_location[loc_id]['items'].append(item)
        by_location[loc_id]['total_quantity'] += item.get('quantity', 0)
    
    return {
        "stock": stock,
        "by_location": list(by_location.values()),
        "total_items": len(stock)
    }


# ============ Distributor-to-Account Delivery CRUD ============

DELIVERY_STATUSES = {
    "draft": "Draft - Not yet confirmed",
    "confirmed": "Confirmed - Ready for delivery",
    "in_transit": "In Transit - On the way",
    "delivered": "Delivered - Completed",
    "partially_delivered": "Partially Delivered",
    "returned": "Returned",
    "cancelled": "Cancelled"
}


async def generate_delivery_number(tenant_id: str) -> str:
    """Generate unique delivery number like DEL-2026-0001"""
    year = datetime.now().year
    count = await db.distributor_deliveries.count_documents({
        "tenant_id": tenant_id,
        "delivery_number": {"$regex": f"^DEL-{year}-"}
    })
    return f"DEL-{year}-{count + 1:04d}"


def calculate_delivery_item_amounts(item: dict, margin_type: str = None, margin_value: float = None) -> dict:
    """Calculate amounts for a delivery item including margin"""
    quantity = item.get('quantity', 0)
    unit_price = item.get('unit_price', 0)
    discount_percent = item.get('discount_percent', 0) or 0
    tax_percent = item.get('tax_percent', 0) or 0
    
    gross_amount = quantity * unit_price
    discount_amount = round(gross_amount * discount_percent / 100, 2)
    taxable_amount = gross_amount - discount_amount
    tax_amount = round(taxable_amount * tax_percent / 100, 2)
    net_amount = taxable_amount + tax_amount
    
    # Calculate margin/earning
    margin_amount = 0
    if margin_type and margin_value:
        if margin_type == 'percentage':
            margin_amount = round(net_amount * margin_value / 100, 2)
        elif margin_type == 'fixed_per_bottle':
            margin_amount = round(quantity * margin_value, 2)
        elif margin_type == 'fixed_per_case':
            # Assuming 12 bottles per case
            cases = quantity / 12
            margin_amount = round(cases * margin_value, 2)
    
    return {
        **item,
        'gross_amount': round(gross_amount, 2),
        'discount_amount': discount_amount,
        'taxable_amount': round(taxable_amount, 2),
        'tax_amount': tax_amount,
        'net_amount': round(net_amount, 2),
        'margin_type': margin_type,
        'margin_value': margin_value,
        'margin_amount': margin_amount
    }


@router.get("/deliveries/all")
async def list_all_deliveries(
    distributor_id: Optional[str] = None,
    account_id: Optional[str] = None,
    status: Optional[str] = None,
    from_date: Optional[str] = None,
    to_date: Optional[str] = None,
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
    current_user: dict = Depends(get_current_user)
):
    """List all deliveries with filters"""
    tenant_id = get_current_tenant_id()
    
    query = {"tenant_id": tenant_id}
    
    if distributor_id:
        query["distributor_id"] = distributor_id
    if account_id:
        query["account_id"] = account_id
    if status and status != 'all':
        query["status"] = status
    if from_date:
        query["delivery_date"] = {"$gte": from_date}
    if to_date:
        if "delivery_date" in query:
            query["delivery_date"]["$lte"] = to_date
        else:
            query["delivery_date"] = {"$lte": to_date}
    
    total = await db.distributor_deliveries.count_documents(query)
    
    deliveries = await db.distributor_deliveries.find(
        query,
        {"_id": 0}
    ).sort("delivery_date", -1).skip((page - 1) * page_size).limit(page_size).to_list(page_size)
    
    return {
        "deliveries": deliveries,
        "total": total,
        "page": page,
        "page_size": page_size,
        "total_pages": (total + page_size - 1) // page_size
    }


@router.get("/deliveries/summary")
async def get_deliveries_summary(
    distributor_id: Optional[str] = None,
    current_user: dict = Depends(get_current_user)
):
    """Get deliveries summary stats"""
    tenant_id = get_current_tenant_id()
    
    query = {"tenant_id": tenant_id}
    if distributor_id:
        query["distributor_id"] = distributor_id
    
    total = await db.distributor_deliveries.count_documents(query)
    
    # Count by status
    draft = await db.distributor_deliveries.count_documents({**query, "status": "draft"})
    confirmed = await db.distributor_deliveries.count_documents({**query, "status": "confirmed"})
    delivered = await db.distributor_deliveries.count_documents({**query, "status": "delivered"})
    cancelled = await db.distributor_deliveries.count_documents({**query, "status": "cancelled"})
    
    # Calculate totals
    pipeline = [
        {"$match": {**query, "status": {"$nin": ["cancelled", "returned"]}}},
        {"$group": {
            "_id": None,
            "total_quantity": {"$sum": "$total_quantity"},
            "total_amount": {"$sum": "$total_net_amount"},
            "total_margin": {"$sum": "$total_margin_amount"}
        }}
    ]
    
    totals = await db.distributor_deliveries.aggregate(pipeline).to_list(1)
    total_quantity = totals[0]["total_quantity"] if totals else 0
    total_amount = totals[0]["total_amount"] if totals else 0
    total_margin = totals[0]["total_margin"] if totals else 0
    
    return {
        "total": total,
        "by_status": {
            "draft": draft,
            "confirmed": confirmed,
            "delivered": delivered,
            "cancelled": cancelled
        },
        "total_quantity": total_quantity,
        "total_amount": round(total_amount, 2),
        "total_margin": round(total_margin, 2)
    }


@router.get("/{distributor_id}/deliveries")
async def list_distributor_deliveries(
    distributor_id: str,
    status: Optional[str] = None,
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
    current_user: dict = Depends(get_current_user)
):
    """List deliveries for a specific distributor"""
    tenant_id = get_current_tenant_id()
    
    query = {"tenant_id": tenant_id, "distributor_id": distributor_id}
    
    if status and status != 'all':
        query["status"] = status
    
    total = await db.distributor_deliveries.count_documents(query)
    
    deliveries = await db.distributor_deliveries.find(
        query,
        {"_id": 0}
    ).sort("delivery_date", -1).skip((page - 1) * page_size).limit(page_size).to_list(page_size)
    
    return {
        "deliveries": deliveries,
        "total": total,
        "page": page,
        "page_size": page_size,
        "total_pages": (total + page_size - 1) // page_size
    }


@router.get("/{distributor_id}/deliveries/{delivery_id}")
async def get_delivery(
    distributor_id: str,
    delivery_id: str,
    current_user: dict = Depends(get_current_user)
):
    """Get a specific delivery with items"""
    tenant_id = get_current_tenant_id()
    
    delivery = await db.distributor_deliveries.find_one(
        {"id": delivery_id, "tenant_id": tenant_id, "distributor_id": distributor_id},
        {"_id": 0}
    )
    
    if not delivery:
        raise HTTPException(status_code=404, detail="Delivery not found")
    
    # Get delivery items
    items = await db.distributor_delivery_items.find(
        {"delivery_id": delivery_id, "tenant_id": tenant_id},
        {"_id": 0}
    ).to_list(500)
    
    delivery['items'] = items
    
    return delivery


@router.get("/{distributor_id}/assigned-accounts")
async def get_assigned_accounts_for_delivery(
    distributor_id: str,
    city: Optional[str] = None,
    current_user: dict = Depends(get_current_user)
):
    """Get accounts assigned to this distributor for delivery selection"""
    tenant_id = get_current_tenant_id()
    
    query = {
        "tenant_id": tenant_id,
        "distributor_id": distributor_id,
        "status": "active"
    }
    
    if city:
        query["servicing_city"] = city
    
    assignments = await db.account_distributor_assignments.find(
        query,
        {"_id": 0}
    ).to_list(500)
    
    # Get account details for each assignment
    accounts = []
    for assignment in assignments:
        account = await db.accounts.find_one(
            {"id": assignment.get('account_id')},
            {"_id": 0, "id": 1, "company": 1, "name": 1, "city": 1, "state": 1, "address": 1}
        )
        if account:
            accounts.append({
                **account,
                "servicing_city": assignment.get('servicing_city'),
                "distributor_location_id": assignment.get('distributor_location_id'),
                "distributor_location_name": assignment.get('distributor_location_name'),
                "is_primary": assignment.get('is_primary', False)
            })
    
    return {"accounts": accounts}


@router.post("/{distributor_id}/deliveries")
async def create_delivery(
    distributor_id: str,
    data: AccountDeliveryCreate,
    current_user: dict = Depends(get_current_user)
):
    """Create a new delivery to an account"""
    if not is_distributor_admin(current_user):
        raise HTTPException(status_code=403, detail="Admin access required")
    
    tenant_id = get_current_tenant_id()
    now = datetime.now(timezone.utc).isoformat()
    
    # Validate distributor exists
    distributor = await db.distributors.find_one(
        {"id": distributor_id, "tenant_id": tenant_id},
        {"_id": 0, "distributor_name": 1, "distributor_code": 1}
    )
    if not distributor:
        raise HTTPException(status_code=404, detail="Distributor not found")
    
    # Validate location
    location = await db.distributor_locations.find_one(
        {"id": data.distributor_location_id, "tenant_id": tenant_id, "distributor_id": distributor_id},
        {"_id": 0, "location_name": 1, "city": 1}
    )
    if not location:
        raise HTTPException(status_code=400, detail="Invalid distributor location")
    
    # Validate account exists
    account = await db.accounts.find_one(
        {"id": data.account_id, "tenant_id": tenant_id},
        {"_id": 0, "company": 1, "name": 1, "city": 1, "state": 1, "address": 1}
    )
    if not account:
        raise HTTPException(status_code=400, detail="Account not found")
    
    # Validate items
    if not data.items or len(data.items) == 0:
        raise HTTPException(status_code=400, detail="At least one item is required")
    
    # Generate delivery number
    delivery_number = await generate_delivery_number(tenant_id)
    delivery_id = str(uuid.uuid4())
    
    # Build delivery address
    delivery_address = data.delivery_address or account.get('address', '')
    
    # Get margin matrix for this account/city to calculate earnings
    account_city = account.get('city', '')
    
    # Process items and calculate totals
    items_to_insert = []
    total_quantity = 0
    total_gross_amount = 0
    total_discount_amount = 0
    total_tax_amount = 0
    total_net_amount = 0
    total_margin_amount = 0
    
    for item_data in data.items:
        # Get SKU info
        sku_name = item_data.sku_name
        sku_code = None
        sku = await db.master_skus.find_one({"id": item_data.sku_id}, {"_id": 0, "sku_name": 1, "sku_code": 1})
        if sku:
            sku_name = sku_name or sku.get('sku_name')
            sku_code = sku.get('sku_code')
        
        # Get margin for this SKU and city
        margin = await db.distributor_margin_matrix.find_one({
            "tenant_id": tenant_id,
            "distributor_id": distributor_id,
            "city": account_city,
            "sku_id": item_data.sku_id,
            "status": "active"
        }, {"_id": 0, "margin_type": 1, "margin_value": 1})
        
        margin_type = margin.get('margin_type') if margin else None
        margin_value = margin.get('margin_value') if margin else None
        
        item_dict = {
            'id': str(uuid.uuid4()),
            'tenant_id': tenant_id,
            'delivery_id': delivery_id,
            'sku_id': item_data.sku_id,
            'sku_name': sku_name,
            'sku_code': sku_code,
            'quantity': item_data.quantity,
            'unit_price': item_data.unit_price,
            'discount_percent': item_data.discount_percent or 0,
            'tax_percent': item_data.tax_percent or 0,
            'remarks': item_data.remarks
        }
        
        # Calculate amounts with margin
        item_dict = calculate_delivery_item_amounts(item_dict, margin_type, margin_value)
        items_to_insert.append(item_dict)
        
        total_quantity += item_data.quantity
        total_gross_amount += item_dict['gross_amount']
        total_discount_amount += item_dict['discount_amount']
        total_tax_amount += item_dict['tax_amount']
        total_net_amount += item_dict['net_amount']
        total_margin_amount += item_dict.get('margin_amount', 0)
    
    # Create delivery document
    delivery_doc = {
        "id": delivery_id,
        "tenant_id": tenant_id,
        "delivery_number": delivery_number,
        "distributor_id": distributor_id,
        "distributor_name": distributor.get('distributor_name'),
        "distributor_code": distributor.get('distributor_code'),
        "distributor_location_id": data.distributor_location_id,
        "distributor_location_name": location.get('location_name'),
        "account_id": data.account_id,
        "account_name": account.get('company') or account.get('name'),
        "account_city": account.get('city'),
        "account_state": account.get('state'),
        "delivery_date": data.delivery_date,
        "reference_number": data.reference_number,
        "vehicle_number": data.vehicle_number,
        "driver_name": data.driver_name,
        "driver_contact": data.driver_contact,
        "delivery_address": delivery_address,
        "status": "draft",
        "total_quantity": total_quantity,
        "total_gross_amount": round(total_gross_amount, 2),
        "total_discount_amount": round(total_discount_amount, 2),
        "total_tax_amount": round(total_tax_amount, 2),
        "total_net_amount": round(total_net_amount, 2),
        "total_margin_amount": round(total_margin_amount, 2),
        "remarks": data.remarks,
        "created_at": now,
        "updated_at": now,
        "created_by": current_user.get('id'),
        "confirmed_at": None,
        "confirmed_by": None,
        "delivered_at": None,
        "delivered_by": None
    }
    
    # Insert delivery and items
    await db.distributor_deliveries.insert_one(delivery_doc)
    if items_to_insert:
        await db.distributor_delivery_items.insert_many(items_to_insert)
    
    delivery_doc.pop('_id', None)
    delivery_doc['items'] = [
        {k: v for k, v in item.items() if k not in ['_id', 'tenant_id']} 
        for item in items_to_insert
    ]
    
    logger.info(f"Delivery {delivery_number} created for account {data.account_id} by {current_user['email']}")
    
    return delivery_doc


@router.put("/{distributor_id}/deliveries/{delivery_id}")
async def update_delivery(
    distributor_id: str,
    delivery_id: str,
    data: AccountDeliveryUpdate,
    current_user: dict = Depends(get_current_user)
):
    """Update a delivery"""
    if not is_distributor_admin(current_user):
        raise HTTPException(status_code=403, detail="Admin access required")
    
    tenant_id = get_current_tenant_id()
    
    delivery = await db.distributor_deliveries.find_one(
        {"id": delivery_id, "tenant_id": tenant_id, "distributor_id": distributor_id}
    )
    
    if not delivery:
        raise HTTPException(status_code=404, detail="Delivery not found")
    
    current_status = delivery.get('status')
    
    # Only allow limited updates for non-draft deliveries
    if current_status != 'draft':
        allowed_fields = ['remarks', 'vehicle_number', 'driver_name', 'driver_contact']
        update_data = {"updated_at": datetime.now(timezone.utc).isoformat()}
        
        for field in allowed_fields:
            value = getattr(data, field, None)
            if value is not None:
                update_data[field] = value
    else:
        update_data = {"updated_at": datetime.now(timezone.utc).isoformat()}
        
        for field in ['delivery_date', 'reference_number', 'vehicle_number', 
                      'driver_name', 'driver_contact', 'delivery_address', 'remarks']:
            value = getattr(data, field, None)
            if value is not None:
                update_data[field] = value
    
    await db.distributor_deliveries.update_one(
        {"id": delivery_id, "tenant_id": tenant_id},
        {"$set": update_data}
    )
    
    updated = await db.distributor_deliveries.find_one(
        {"id": delivery_id, "tenant_id": tenant_id},
        {"_id": 0}
    )
    
    return updated


@router.post("/{distributor_id}/deliveries/{delivery_id}/confirm")
async def confirm_delivery(
    distributor_id: str,
    delivery_id: str,
    current_user: dict = Depends(get_current_user)
):
    """Confirm a draft delivery"""
    if not is_distributor_admin(current_user):
        raise HTTPException(status_code=403, detail="Admin access required")
    
    tenant_id = get_current_tenant_id()
    
    delivery = await db.distributor_deliveries.find_one(
        {"id": delivery_id, "tenant_id": tenant_id, "distributor_id": distributor_id}
    )
    
    if not delivery:
        raise HTTPException(status_code=404, detail="Delivery not found")
    
    if delivery.get('status') != 'draft':
        raise HTTPException(status_code=400, detail="Only draft deliveries can be confirmed")
    
    now = datetime.now(timezone.utc).isoformat()
    
    await db.distributor_deliveries.update_one(
        {"id": delivery_id, "tenant_id": tenant_id},
        {"$set": {
            "status": "confirmed",
            "confirmed_at": now,
            "confirmed_by": current_user.get('id'),
            "updated_at": now
        }}
    )
    
    logger.info(f"Delivery {delivery['delivery_number']} confirmed by {current_user['email']}")
    
    return {"message": f"Delivery {delivery['delivery_number']} confirmed", "status": "confirmed"}


@router.post("/{distributor_id}/deliveries/{delivery_id}/complete")
async def complete_delivery(
    distributor_id: str,
    delivery_id: str,
    delivery_date: Optional[str] = None,
    remarks: Optional[str] = None,
    current_user: dict = Depends(get_current_user)
):
    """Mark delivery as completed - deducts from distributor stock"""
    if not is_distributor_admin(current_user):
        raise HTTPException(status_code=403, detail="Admin access required")
    
    tenant_id = get_current_tenant_id()
    
    delivery = await db.distributor_deliveries.find_one(
        {"id": delivery_id, "tenant_id": tenant_id, "distributor_id": distributor_id}
    )
    
    if not delivery:
        raise HTTPException(status_code=404, detail="Delivery not found")
    
    if delivery.get('status') not in ['draft', 'confirmed', 'in_transit']:
        raise HTTPException(status_code=400, detail="Delivery cannot be completed in current status")
    
    now = datetime.now(timezone.utc).isoformat()
    actual_date = delivery_date or now[:10]
    
    update_data = {
        "status": "delivered",
        "delivery_date": actual_date,
        "delivered_at": now,
        "delivered_by": current_user.get('id'),
        "updated_at": now
    }
    
    if remarks:
        update_data['remarks'] = (delivery.get('remarks', '') + '\n' + remarks).strip()
    
    await db.distributor_deliveries.update_one(
        {"id": delivery_id, "tenant_id": tenant_id},
        {"$set": update_data}
    )
    
    # Deduct from distributor stock
    items = await db.distributor_delivery_items.find(
        {"delivery_id": delivery_id, "tenant_id": tenant_id},
        {"_id": 0}
    ).to_list(500)
    
    for item in items:
        await db.distributor_stock.update_one(
            {
                "tenant_id": tenant_id,
                "distributor_id": distributor_id,
                "distributor_location_id": delivery.get('distributor_location_id'),
                "sku_id": item.get('sku_id')
            },
            {
                "$inc": {"quantity": -item.get('quantity', 0)},
                "$set": {"updated_at": now}
            }
        )
    
    logger.info(f"Delivery {delivery['delivery_number']} completed by {current_user['email']}")
    
    return {"message": f"Delivery {delivery['delivery_number']} completed", "status": "delivered"}


@router.delete("/{distributor_id}/deliveries/{delivery_id}")
async def delete_delivery(
    distributor_id: str,
    delivery_id: str,
    current_user: dict = Depends(get_current_user)
):
    """Delete a draft delivery"""
    if not is_distributor_admin(current_user):
        raise HTTPException(status_code=403, detail="Admin access required")
    
    tenant_id = get_current_tenant_id()
    
    delivery = await db.distributor_deliveries.find_one(
        {"id": delivery_id, "tenant_id": tenant_id, "distributor_id": distributor_id}
    )
    
    if not delivery:
        raise HTTPException(status_code=404, detail="Delivery not found")
    
    if delivery.get('status') != 'draft':
        raise HTTPException(status_code=400, detail="Only draft deliveries can be deleted")
    
    # Delete items first
    await db.distributor_delivery_items.delete_many({"delivery_id": delivery_id, "tenant_id": tenant_id})
    
    # Delete delivery
    await db.distributor_deliveries.delete_one({"id": delivery_id, "tenant_id": tenant_id})
    
    logger.info(f"Delivery {delivery['delivery_number']} deleted by {current_user['email']}")
    
    return {"message": f"Delivery {delivery['delivery_number']} deleted"}


@router.post("/{distributor_id}/deliveries/{delivery_id}/cancel")
async def cancel_delivery(
    distributor_id: str,
    delivery_id: str,
    reason: Optional[str] = None,
    current_user: dict = Depends(get_current_user)
):
    """Cancel a delivery"""
    if not is_distributor_admin(current_user):
        raise HTTPException(status_code=403, detail="Admin access required")
    
    tenant_id = get_current_tenant_id()
    
    delivery = await db.distributor_deliveries.find_one(
        {"id": delivery_id, "tenant_id": tenant_id, "distributor_id": distributor_id}
    )
    
    if not delivery:
        raise HTTPException(status_code=404, detail="Delivery not found")
    
    if delivery.get('status') in ['delivered', 'cancelled']:
        raise HTTPException(status_code=400, detail="Delivery cannot be cancelled")
    
    now = datetime.now(timezone.utc).isoformat()
    
    remarks = delivery.get('remarks', '') or ''
    if reason:
        remarks = f"{remarks}\nCancelled: {reason}".strip()
    
    await db.distributor_deliveries.update_one(
        {"id": delivery_id, "tenant_id": tenant_id},
        {"$set": {
            "status": "cancelled",
            "remarks": remarks,
            "updated_at": now
        }}
    )
    
    logger.info(f"Delivery {delivery['delivery_number']} cancelled by {current_user['email']}")
    
    return {"message": f"Delivery {delivery['delivery_number']} cancelled", "status": "cancelled"}



# ============ Distributor Settlement CRUD ============

SETTLEMENT_STATUSES = {
    "draft": "Draft - Being prepared",
    "pending_approval": "Pending Approval",
    "approved": "Approved - Ready for payment",
    "rejected": "Rejected",
    "paid": "Paid",
    "cancelled": "Cancelled"
}


async def generate_settlement_number(tenant_id: str) -> str:
    """Generate unique settlement number like STL-2026-0001"""
    year = datetime.now().year
    count = await db.distributor_settlements.count_documents({
        "tenant_id": tenant_id,
        "settlement_number": {"$regex": f"^STL-{year}-"}
    })
    return f"STL-{year}-{count + 1:04d}"


@router.get("/settlements/all")
async def list_all_settlements(
    distributor_id: Optional[str] = None,
    status: Optional[str] = None,
    from_date: Optional[str] = None,
    to_date: Optional[str] = None,
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
    current_user: dict = Depends(get_current_user)
):
    """List all settlements with filters"""
    tenant_id = get_current_tenant_id()
    
    query = {"tenant_id": tenant_id}
    
    if distributor_id:
        query["distributor_id"] = distributor_id
    if status and status != 'all':
        query["status"] = status
    if from_date:
        query["period_start"] = {"$gte": from_date}
    if to_date:
        if "period_end" in query:
            query["period_end"]["$lte"] = to_date
        else:
            query["period_end"] = {"$lte": to_date}
    
    total = await db.distributor_settlements.count_documents(query)
    
    settlements = await db.distributor_settlements.find(
        query,
        {"_id": 0}
    ).sort("created_at", -1).skip((page - 1) * page_size).limit(page_size).to_list(page_size)
    
    return {
        "settlements": settlements,
        "total": total,
        "page": page,
        "page_size": page_size,
        "total_pages": (total + page_size - 1) // page_size
    }


@router.get("/settlements/summary")
async def get_settlements_summary(
    distributor_id: Optional[str] = None,
    current_user: dict = Depends(get_current_user)
):
    """Get settlements summary stats"""
    tenant_id = get_current_tenant_id()
    
    query = {"tenant_id": tenant_id}
    if distributor_id:
        query["distributor_id"] = distributor_id
    
    total = await db.distributor_settlements.count_documents(query)
    
    # Count by status
    draft = await db.distributor_settlements.count_documents({**query, "status": "draft"})
    pending = await db.distributor_settlements.count_documents({**query, "status": "pending_approval"})
    approved = await db.distributor_settlements.count_documents({**query, "status": "approved"})
    paid = await db.distributor_settlements.count_documents({**query, "status": "paid"})
    
    # Calculate totals for paid settlements
    pipeline = [
        {"$match": {**query, "status": "paid"}},
        {"$group": {
            "_id": None,
            "total_paid": {"$sum": "$final_payout"}
        }}
    ]
    
    totals = await db.distributor_settlements.aggregate(pipeline).to_list(1)
    total_paid = totals[0]["total_paid"] if totals else 0
    
    # Pending payout (approved but not paid)
    pipeline_pending = [
        {"$match": {**query, "status": "approved"}},
        {"$group": {
            "_id": None,
            "pending_payout": {"$sum": "$final_payout"}
        }}
    ]
    
    pending_totals = await db.distributor_settlements.aggregate(pipeline_pending).to_list(1)
    pending_payout = pending_totals[0]["pending_payout"] if pending_totals else 0
    
    return {
        "total": total,
        "by_status": {
            "draft": draft,
            "pending_approval": pending,
            "approved": approved,
            "paid": paid
        },
        "total_paid": round(total_paid, 2),
        "pending_payout": round(pending_payout, 2)
    }


@router.get("/{distributor_id}/settlements")
async def list_distributor_settlements(
    distributor_id: str,
    status: Optional[str] = None,
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
    current_user: dict = Depends(get_current_user)
):
    """List settlements for a specific distributor"""
    tenant_id = get_current_tenant_id()
    
    query = {"tenant_id": tenant_id, "distributor_id": distributor_id}
    
    if status and status != 'all':
        query["status"] = status
    
    total = await db.distributor_settlements.count_documents(query)
    
    settlements = await db.distributor_settlements.find(
        query,
        {"_id": 0}
    ).sort("created_at", -1).skip((page - 1) * page_size).limit(page_size).to_list(page_size)
    
    return {
        "settlements": settlements,
        "total": total,
        "page": page,
        "page_size": page_size,
        "total_pages": (total + page_size - 1) // page_size
    }


@router.get("/{distributor_id}/settlements/{settlement_id}")
async def get_settlement(
    distributor_id: str,
    settlement_id: str,
    current_user: dict = Depends(get_current_user)
):
    """Get a specific settlement with items"""
    tenant_id = get_current_tenant_id()
    
    settlement = await db.distributor_settlements.find_one(
        {"id": settlement_id, "tenant_id": tenant_id, "distributor_id": distributor_id},
        {"_id": 0}
    )
    
    if not settlement:
        raise HTTPException(status_code=404, detail="Settlement not found")
    
    # Get settlement items (deliveries)
    items = await db.distributor_settlement_items.find(
        {"settlement_id": settlement_id, "tenant_id": tenant_id},
        {"_id": 0}
    ).sort("delivery_date", 1).to_list(500)
    
    settlement['items'] = items
    
    return settlement


@router.get("/{distributor_id}/unsettled-deliveries")
async def get_unsettled_deliveries(
    distributor_id: str,
    from_date: Optional[str] = None,
    to_date: Optional[str] = None,
    current_user: dict = Depends(get_current_user)
):
    """Get completed deliveries that haven't been settled yet"""
    tenant_id = get_current_tenant_id()
    
    # Get all settled delivery IDs
    settled_items = await db.distributor_settlement_items.find(
        {"tenant_id": tenant_id},
        {"delivery_id": 1}
    ).to_list(10000)
    
    settled_delivery_ids = [item['delivery_id'] for item in settled_items]
    
    # Query for completed deliveries not in settled list
    query = {
        "tenant_id": tenant_id,
        "distributor_id": distributor_id,
        "status": "delivered",
        "id": {"$nin": settled_delivery_ids}
    }
    
    if from_date:
        query["delivery_date"] = {"$gte": from_date}
    if to_date:
        if "delivery_date" in query:
            query["delivery_date"]["$lte"] = to_date
        else:
            query["delivery_date"] = {"$lte": to_date}
    
    deliveries = await db.distributor_deliveries.find(
        query,
        {"_id": 0}
    ).sort("delivery_date", 1).to_list(500)
    
    # Calculate totals
    total_quantity = sum(d.get('total_quantity', 0) for d in deliveries)
    total_amount = sum(d.get('total_net_amount', 0) for d in deliveries)
    total_margin = sum(d.get('total_margin_amount', 0) for d in deliveries)
    
    return {
        "deliveries": deliveries,
        "count": len(deliveries),
        "total_quantity": total_quantity,
        "total_amount": round(total_amount, 2),
        "total_margin": round(total_margin, 2)
    }


@router.post("/{distributor_id}/settlements")
async def create_settlement(
    distributor_id: str,
    data: DistributorSettlementCreate,
    current_user: dict = Depends(get_current_user)
):
    """Create a new settlement for a period"""
    if not is_distributor_admin(current_user):
        raise HTTPException(status_code=403, detail="Admin access required")
    
    tenant_id = get_current_tenant_id()
    now = datetime.now(timezone.utc).isoformat()
    
    # Validate distributor
    distributor = await db.distributors.find_one(
        {"id": distributor_id, "tenant_id": tenant_id},
        {"_id": 0, "distributor_name": 1, "distributor_code": 1}
    )
    if not distributor:
        raise HTTPException(status_code=404, detail="Distributor not found")
    
    # Get all settled delivery IDs to exclude
    settled_items = await db.distributor_settlement_items.find(
        {"tenant_id": tenant_id},
        {"delivery_id": 1}
    ).to_list(10000)
    
    settled_delivery_ids = [item['delivery_id'] for item in settled_items]
    
    # Get completed deliveries for the period that haven't been settled
    deliveries = await db.distributor_deliveries.find({
        "tenant_id": tenant_id,
        "distributor_id": distributor_id,
        "status": "delivered",
        "delivery_date": {"$gte": data.period_start, "$lte": data.period_end},
        "id": {"$nin": settled_delivery_ids}
    }, {"_id": 0}).sort("delivery_date", 1).to_list(500)
    
    if not deliveries:
        raise HTTPException(status_code=400, detail="No unsettled deliveries found for this period")
    
    # Generate settlement
    settlement_number = await generate_settlement_number(tenant_id)
    settlement_id = str(uuid.uuid4())
    
    # Calculate totals
    total_deliveries = len(deliveries)
    total_quantity = sum(d.get('total_quantity', 0) for d in deliveries)
    total_delivery_amount = sum(d.get('total_net_amount', 0) for d in deliveries)
    total_margin_amount = sum(d.get('total_margin_amount', 0) for d in deliveries)
    
    # Create settlement items
    items_to_insert = []
    for delivery in deliveries:
        items_to_insert.append({
            "id": str(uuid.uuid4()),
            "tenant_id": tenant_id,
            "settlement_id": settlement_id,
            "delivery_id": delivery['id'],
            "delivery_number": delivery.get('delivery_number'),
            "delivery_date": delivery.get('delivery_date'),
            "account_id": delivery.get('account_id'),
            "account_name": delivery.get('account_name'),
            "account_city": delivery.get('account_city'),
            "total_quantity": delivery.get('total_quantity', 0),
            "total_amount": delivery.get('total_net_amount', 0),
            "margin_amount": delivery.get('total_margin_amount', 0)
        })
    
    # Create settlement document
    settlement_doc = {
        "id": settlement_id,
        "tenant_id": tenant_id,
        "settlement_number": settlement_number,
        "distributor_id": distributor_id,
        "distributor_name": distributor.get('distributor_name'),
        "distributor_code": distributor.get('distributor_code'),
        "period_type": data.period_type,
        "period_start": data.period_start,
        "period_end": data.period_end,
        "total_deliveries": total_deliveries,
        "total_quantity": total_quantity,
        "total_delivery_amount": round(total_delivery_amount, 2),
        "total_margin_amount": round(total_margin_amount, 2),
        "adjustments": 0,
        "final_payout": round(total_margin_amount, 2),
        "status": "draft",
        "remarks": data.remarks,
        "created_at": now,
        "updated_at": now,
        "created_by": current_user.get('id'),
        "submitted_at": None,
        "submitted_by": None,
        "approved_at": None,
        "approved_by": None,
        "approved_by_name": None,
        "rejected_at": None,
        "rejected_by": None,
        "rejection_reason": None,
        "paid_at": None,
        "paid_by": None,
        "payment_reference": None
    }
    
    # Insert settlement and items
    await db.distributor_settlements.insert_one(settlement_doc)
    if items_to_insert:
        await db.distributor_settlement_items.insert_many(items_to_insert)
    
    settlement_doc.pop('_id', None)
    settlement_doc['items'] = [
        {k: v for k, v in item.items() if k not in ['_id', 'tenant_id']} 
        for item in items_to_insert
    ]
    
    logger.info(f"Settlement {settlement_number} created for distributor {distributor_id} with {total_deliveries} deliveries by {current_user['email']}")
    
    return settlement_doc


@router.put("/{distributor_id}/settlements/{settlement_id}")
async def update_settlement(
    distributor_id: str,
    settlement_id: str,
    data: DistributorSettlementUpdate,
    current_user: dict = Depends(get_current_user)
):
    """Update a settlement (remarks, adjustments)"""
    if not is_distributor_admin(current_user):
        raise HTTPException(status_code=403, detail="Admin access required")
    
    tenant_id = get_current_tenant_id()
    
    settlement = await db.distributor_settlements.find_one(
        {"id": settlement_id, "tenant_id": tenant_id, "distributor_id": distributor_id}
    )
    
    if not settlement:
        raise HTTPException(status_code=404, detail="Settlement not found")
    
    if settlement.get('status') not in ['draft', 'pending_approval']:
        raise HTTPException(status_code=400, detail="Cannot modify settlement in current status")
    
    update_data = {"updated_at": datetime.now(timezone.utc).isoformat()}
    
    if data.remarks is not None:
        update_data['remarks'] = data.remarks
    
    if data.adjustments is not None:
        update_data['adjustments'] = data.adjustments
        update_data['final_payout'] = round(settlement.get('total_margin_amount', 0) + data.adjustments, 2)
    
    await db.distributor_settlements.update_one(
        {"id": settlement_id, "tenant_id": tenant_id},
        {"$set": update_data}
    )
    
    updated = await db.distributor_settlements.find_one(
        {"id": settlement_id, "tenant_id": tenant_id},
        {"_id": 0}
    )
    
    return updated


@router.post("/{distributor_id}/settlements/{settlement_id}/submit")
async def submit_settlement(
    distributor_id: str,
    settlement_id: str,
    current_user: dict = Depends(get_current_user)
):
    """Submit settlement for approval"""
    if not is_distributor_admin(current_user):
        raise HTTPException(status_code=403, detail="Admin access required")
    
    tenant_id = get_current_tenant_id()
    
    settlement = await db.distributor_settlements.find_one(
        {"id": settlement_id, "tenant_id": tenant_id, "distributor_id": distributor_id}
    )
    
    if not settlement:
        raise HTTPException(status_code=404, detail="Settlement not found")
    
    if settlement.get('status') != 'draft':
        raise HTTPException(status_code=400, detail="Only draft settlements can be submitted")
    
    now = datetime.now(timezone.utc).isoformat()
    
    await db.distributor_settlements.update_one(
        {"id": settlement_id, "tenant_id": tenant_id},
        {"$set": {
            "status": "pending_approval",
            "submitted_at": now,
            "submitted_by": current_user.get('id'),
            "updated_at": now
        }}
    )
    
    logger.info(f"Settlement {settlement['settlement_number']} submitted for approval by {current_user['email']}")
    
    return {"message": f"Settlement {settlement['settlement_number']} submitted for approval", "status": "pending_approval"}


@router.post("/{distributor_id}/settlements/{settlement_id}/approve")
async def approve_settlement(
    distributor_id: str,
    settlement_id: str,
    current_user: dict = Depends(get_current_user)
):
    """Approve a settlement"""
    # Only CEO/Director can approve
    if current_user.get('role') not in ['CEO', 'Director', 'Vice President']:
        raise HTTPException(status_code=403, detail="Only senior management can approve settlements")
    
    tenant_id = get_current_tenant_id()
    
    settlement = await db.distributor_settlements.find_one(
        {"id": settlement_id, "tenant_id": tenant_id, "distributor_id": distributor_id}
    )
    
    if not settlement:
        raise HTTPException(status_code=404, detail="Settlement not found")
    
    if settlement.get('status') != 'pending_approval':
        raise HTTPException(status_code=400, detail="Settlement is not pending approval")
    
    now = datetime.now(timezone.utc).isoformat()
    
    await db.distributor_settlements.update_one(
        {"id": settlement_id, "tenant_id": tenant_id},
        {"$set": {
            "status": "approved",
            "approved_at": now,
            "approved_by": current_user.get('id'),
            "approved_by_name": current_user.get('name') or current_user.get('email'),
            "updated_at": now
        }}
    )
    
    logger.info(f"Settlement {settlement['settlement_number']} approved by {current_user['email']}")
    
    return {"message": f"Settlement {settlement['settlement_number']} approved", "status": "approved"}


@router.post("/{distributor_id}/settlements/{settlement_id}/reject")
async def reject_settlement(
    distributor_id: str,
    settlement_id: str,
    reason: str = "",
    current_user: dict = Depends(get_current_user)
):
    """Reject a settlement"""
    if current_user.get('role') not in ['CEO', 'Director', 'Vice President']:
        raise HTTPException(status_code=403, detail="Only senior management can reject settlements")
    
    tenant_id = get_current_tenant_id()
    
    settlement = await db.distributor_settlements.find_one(
        {"id": settlement_id, "tenant_id": tenant_id, "distributor_id": distributor_id}
    )
    
    if not settlement:
        raise HTTPException(status_code=404, detail="Settlement not found")
    
    if settlement.get('status') != 'pending_approval':
        raise HTTPException(status_code=400, detail="Settlement is not pending approval")
    
    now = datetime.now(timezone.utc).isoformat()
    
    await db.distributor_settlements.update_one(
        {"id": settlement_id, "tenant_id": tenant_id},
        {"$set": {
            "status": "rejected",
            "rejected_at": now,
            "rejected_by": current_user.get('id'),
            "rejection_reason": reason,
            "updated_at": now
        }}
    )
    
    logger.info(f"Settlement {settlement['settlement_number']} rejected by {current_user['email']}")
    
    return {"message": f"Settlement {settlement['settlement_number']} rejected", "status": "rejected"}


@router.post("/{distributor_id}/settlements/{settlement_id}/mark-paid")
async def mark_settlement_paid(
    distributor_id: str,
    settlement_id: str,
    payment_reference: str = "",
    current_user: dict = Depends(get_current_user)
):
    """Mark settlement as paid"""
    if not is_distributor_admin(current_user):
        raise HTTPException(status_code=403, detail="Admin access required")
    
    tenant_id = get_current_tenant_id()
    
    settlement = await db.distributor_settlements.find_one(
        {"id": settlement_id, "tenant_id": tenant_id, "distributor_id": distributor_id}
    )
    
    if not settlement:
        raise HTTPException(status_code=404, detail="Settlement not found")
    
    if settlement.get('status') != 'approved':
        raise HTTPException(status_code=400, detail="Only approved settlements can be marked as paid")
    
    now = datetime.now(timezone.utc).isoformat()
    
    await db.distributor_settlements.update_one(
        {"id": settlement_id, "tenant_id": tenant_id},
        {"$set": {
            "status": "paid",
            "paid_at": now,
            "paid_by": current_user.get('id'),
            "payment_reference": payment_reference,
            "updated_at": now
        }}
    )
    
    logger.info(f"Settlement {settlement['settlement_number']} marked as paid by {current_user['email']}")
    
    return {"message": f"Settlement {settlement['settlement_number']} marked as paid", "status": "paid"}


@router.delete("/{distributor_id}/settlements/{settlement_id}")
async def delete_settlement(
    distributor_id: str,
    settlement_id: str,
    current_user: dict = Depends(get_current_user)
):
    """Delete a draft settlement"""
    if not is_distributor_admin(current_user):
        raise HTTPException(status_code=403, detail="Admin access required")
    
    tenant_id = get_current_tenant_id()
    
    settlement = await db.distributor_settlements.find_one(
        {"id": settlement_id, "tenant_id": tenant_id, "distributor_id": distributor_id}
    )
    
    if not settlement:
        raise HTTPException(status_code=404, detail="Settlement not found")
    
    if settlement.get('status') != 'draft':
        raise HTTPException(status_code=400, detail="Only draft settlements can be deleted")
    
    # Delete items first
    await db.distributor_settlement_items.delete_many({"settlement_id": settlement_id, "tenant_id": tenant_id})
    
    # Delete settlement
    await db.distributor_settlements.delete_one({"id": settlement_id, "tenant_id": tenant_id})
    
    logger.info(f"Settlement {settlement['settlement_number']} deleted by {current_user['email']}")
    
    return {"message": f"Settlement {settlement['settlement_number']} deleted"}