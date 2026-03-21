"""
Distributor Management Routes
CRUD operations for distributors, operating coverage, and locations
"""
from fastapi import APIRouter, HTTPException, Depends, Query
from datetime import datetime, timezone, timedelta
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
    DistributorSettlementCreate, DistributorSettlementUpdate,
    BillingConfigCreate, BillingConfigUpdate,
    ProvisionalInvoiceCreate, ReconciliationCreate, DebitCreditNoteCreate
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
    
    # Check for date overlap with existing active entries for same city+SKU
    # Two date ranges overlap if: start1 <= end2 AND start2 <= end1
    new_start = data.active_from or now[:10]
    new_end = data.active_to or "9999-12-31"  # Far future date for open-ended entries
    
    existing_entries = await db.distributor_margin_matrix.find({
        "tenant_id": tenant_id,
        "distributor_id": distributor_id,
        "city": data.city,
        "sku_id": data.sku_id,
        "status": "active"
    }).to_list(100)
    
    for existing in existing_entries:
        exist_start = existing.get('active_from') or "1900-01-01"
        exist_end = existing.get('active_to') or "9999-12-31"
        
        # Check for overlap: new_start <= exist_end AND exist_start <= new_end
        if new_start <= exist_end and exist_start <= new_end:
            raise HTTPException(
                status_code=400,
                detail=f"Date range overlaps with existing entry (ID: {existing.get('id')[:8]}..., Active: {exist_start} to {exist_end if exist_end != '9999-12-31' else 'ongoing'}). Please adjust dates to avoid overlap."
            )
    
    # Get SKU name if not provided
    sku_name = data.sku_name
    if not sku_name and data.sku_id:
        sku = await db.skus.find_one({"id": data.sku_id}, {"_id": 0, "name": 1})
        if sku:
            sku_name = sku.get('name')
    
    # Calculate transfer price for percentage margin type
    transfer_price = None
    if data.margin_type == 'percentage' and data.base_price:
        transfer_price = data.base_price * (1 - data.margin_value / 100)
    
    margin_doc = {
        "id": str(uuid.uuid4()),
        "tenant_id": tenant_id,
        "distributor_id": distributor_id,
        "state": data.state,
        "city": data.city,
        "sku_id": data.sku_id,
        "sku_name": sku_name,
        "base_price": data.base_price,
        "margin_type": data.margin_type,
        "margin_value": data.margin_value,
        "transfer_price": round(transfer_price, 2) if transfer_price else None,
        "min_quantity": data.min_quantity,
        "max_quantity": data.max_quantity,
        "active_from": data.active_from or now[:10],
        "active_to": data.active_to,
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
        
        # Calculate transfer price for percentage margin type
        transfer_price = None
        if item.margin_type == 'percentage' and item.base_price:
            transfer_price = item.base_price * (1 - item.margin_value / 100)
        
        margin_doc = {
            "id": str(uuid.uuid4()),
            "tenant_id": tenant_id,
            "distributor_id": distributor_id,
            "state": item.state,
            "city": item.city,
            "sku_id": item.sku_id,
            "sku_name": sku_name,
            "base_price": item.base_price,
            "margin_type": item.margin_type,
            "margin_value": item.margin_value,
            "transfer_price": round(transfer_price, 2) if transfer_price else None,
            "min_quantity": item.min_quantity,
            "max_quantity": item.max_quantity,
            "active_from": item.active_from or now[:10],
            "active_to": item.active_to,
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
    
    for field in ['state', 'city', 'sku_id', 'sku_name', 'base_price', 'margin_type', 'margin_value',
                  'min_quantity', 'max_quantity', 'active_from', 'active_to',
                  'remarks', 'status']:
        value = getattr(data, field, None)
        if value is not None:
            update_data[field] = value
    
    # Validate margin type if being updated
    if data.margin_type and data.margin_type not in MARGIN_TYPES:
        raise HTTPException(status_code=400, detail=f"Invalid margin type. Must be one of: {list(MARGIN_TYPES.keys())}")
    
    # Check for date overlap if dates are being changed
    if data.active_from is not None or data.active_to is not None:
        new_start = update_data.get('active_from', margin.get('active_from')) or "1900-01-01"
        new_end = update_data.get('active_to', margin.get('active_to')) or "9999-12-31"
        
        # Get other entries for same city+SKU (excluding current one)
        other_entries = await db.distributor_margin_matrix.find({
            "tenant_id": tenant_id,
            "distributor_id": distributor_id,
            "city": margin.get('city'),
            "sku_id": margin.get('sku_id'),
            "status": "active",
            "id": {"$ne": margin_id}  # Exclude current entry
        }).to_list(100)
        
        for existing in other_entries:
            exist_start = existing.get('active_from') or "1900-01-01"
            exist_end = existing.get('active_to') or "9999-12-31"
            
            # Check for overlap
            if new_start <= exist_end and exist_start <= new_end:
                raise HTTPException(
                    status_code=400,
                    detail=f"Date range overlaps with existing entry (ID: {existing.get('id')[:8]}..., Active: {exist_start} to {exist_end if exist_end != '9999-12-31' else 'ongoing'}). Please adjust dates to avoid overlap."
                )
    
    # Recalculate transfer price if base_price or margin_value changed
    base_price = update_data.get('base_price', margin.get('base_price'))
    margin_type = update_data.get('margin_type', margin.get('margin_type'))
    margin_value = update_data.get('margin_value', margin.get('margin_value'))
    
    if margin_type == 'percentage' and base_price:
        update_data['transfer_price'] = round(base_price * (1 - margin_value / 100), 2)
    
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
            {"account_name": {"$regex": q, "$options": "i"}},
            {"contact_name": {"$regex": q, "$options": "i"}},
            {"account_id": {"$regex": q, "$options": "i"}},
            {"city": {"$regex": q, "$options": "i"}}
        ]
    }
    
    if city:
        query["city"] = city
    
    accounts = await db.accounts.find(
        query,
        {"_id": 0, "id": 1, "account_name": 1, "contact_name": 1, "city": 1, "state": 1, "account_id": 1, "territory": 1, "contact_number": 1, "delivery_address": 1}
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
    """List shipments for a specific distributor with item aggregates"""
    tenant_id = get_current_tenant_id()
    
    query = {"tenant_id": tenant_id, "distributor_id": distributor_id}
    
    if status and status != 'all':
        query["status"] = status
    
    total = await db.distributor_shipments.count_documents(query)
    
    shipments = await db.distributor_shipments.find(
        query,
        {"_id": 0}
    ).sort("shipment_date", -1).skip((page - 1) * page_size).limit(page_size).to_list(page_size)
    
    # For each shipment, get aggregated item data
    for shipment in shipments:
        items = await db.distributor_shipment_items.find(
            {"shipment_id": shipment['id'], "tenant_id": tenant_id},
            {"_id": 0, "base_price": 1, "distributor_margin": 1, "unit_price": 1, "tax_percent": 1, "quantity": 1}
        ).to_list(500)
        
        if items:
            # Calculate weighted averages
            total_qty = sum(item.get('quantity', 0) for item in items)
            if total_qty > 0:
                # Weighted average base price
                weighted_base = sum((item.get('base_price') or 0) * item.get('quantity', 0) for item in items)
                shipment['avg_base_price'] = round(weighted_base / total_qty, 2) if weighted_base else None
                
                # Weighted average margin
                weighted_margin = sum((item.get('distributor_margin') or 0) * item.get('quantity', 0) for item in items)
                shipment['avg_distributor_margin'] = round(weighted_margin / total_qty, 2) if weighted_margin else None
                
                # Weighted average transfer price
                weighted_transfer = sum((item.get('unit_price') or 0) * item.get('quantity', 0) for item in items)
                shipment['avg_transfer_price'] = round(weighted_transfer / total_qty, 2) if weighted_transfer else None
                
                # Weighted average GST
                weighted_gst = sum((item.get('tax_percent') or 0) * item.get('quantity', 0) for item in items)
                shipment['avg_gst_percent'] = round(weighted_gst / total_qty, 2) if weighted_gst else None
    
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
            'base_price': item_data.base_price,
            'distributor_margin': item_data.distributor_margin,
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


# ============ Stock Dashboard ============

@router.get("/dashboard/stock-summary")
async def get_stock_dashboard_summary(
    city: Optional[str] = None,
    distributor_id: Optional[str] = None,
    current_user: dict = Depends(get_current_user)
):
    """Get stock dashboard summary across all distributors"""
    tenant_id = get_current_tenant_id()
    
    # Build query
    query = {"tenant_id": tenant_id}
    if distributor_id:
        query["distributor_id"] = distributor_id
    
    # Get all stock records
    stock = await db.distributor_stock.find(query, {"_id": 0}).to_list(5000)
    
    # If city filter is applied, filter by distributor locations in that city
    if city:
        # Get locations in this city
        locations_in_city = await db.distributor_locations.find(
            {"tenant_id": tenant_id, "city": city},
            {"id": 1}
        ).to_list(500)
        location_ids = [loc['id'] for loc in locations_in_city]
        stock = [s for s in stock if s.get('distributor_location_id') in location_ids]
    
    # Calculate summary metrics
    total_quantity = sum(s.get('quantity', 0) for s in stock)
    total_skus = len(set(s.get('sku_id') for s in stock if s.get('sku_id')))
    total_locations = len(set(s.get('distributor_location_id') for s in stock if s.get('distributor_location_id')))
    total_distributors = len(set(s.get('distributor_id') for s in stock if s.get('distributor_id')))
    
    # Group by distributor
    by_distributor = {}
    for item in stock:
        dist_id = item.get('distributor_id')
        dist_name = item.get('distributor_name', 'Unknown')
        if dist_id not in by_distributor:
            by_distributor[dist_id] = {
                'distributor_id': dist_id,
                'distributor_name': dist_name,
                'total_quantity': 0,
                'sku_count': set(),
                'locations': set()
            }
        by_distributor[dist_id]['total_quantity'] += item.get('quantity', 0)
        by_distributor[dist_id]['sku_count'].add(item.get('sku_id'))
        by_distributor[dist_id]['locations'].add(item.get('distributor_location_id'))
    
    # Convert sets to counts
    distributor_summary = []
    for dist_id, data in by_distributor.items():
        distributor_summary.append({
            'distributor_id': dist_id,
            'distributor_name': data['distributor_name'],
            'total_quantity': data['total_quantity'],
            'sku_count': len(data['sku_count']),
            'location_count': len(data['locations'])
        })
    
    # Sort by quantity descending
    distributor_summary.sort(key=lambda x: x['total_quantity'], reverse=True)
    
    # Group by SKU
    by_sku = {}
    for item in stock:
        sku_id = item.get('sku_id')
        sku_name = item.get('sku_name', 'Unknown')
        if sku_id not in by_sku:
            by_sku[sku_id] = {
                'sku_id': sku_id,
                'sku_name': sku_name,
                'total_quantity': 0,
                'locations': set()
            }
        by_sku[sku_id]['total_quantity'] += item.get('quantity', 0)
        by_sku[sku_id]['locations'].add(item.get('distributor_location_id'))
    
    sku_summary = []
    for sku_id, data in by_sku.items():
        sku_summary.append({
            'sku_id': sku_id,
            'sku_name': data['sku_name'],
            'total_quantity': data['total_quantity'],
            'location_count': len(data['locations'])
        })
    
    sku_summary.sort(key=lambda x: x['total_quantity'], reverse=True)
    
    # Group by location
    by_location = {}
    for item in stock:
        loc_id = item.get('distributor_location_id')
        loc_name = item.get('location_name', 'Unknown')
        dist_name = item.get('distributor_name', 'Unknown')
        if loc_id not in by_location:
            by_location[loc_id] = {
                'location_id': loc_id,
                'location_name': loc_name,
                'distributor_name': dist_name,
                'total_quantity': 0,
                'sku_count': set(),
                'items': []
            }
        by_location[loc_id]['total_quantity'] += item.get('quantity', 0)
        by_location[loc_id]['sku_count'].add(item.get('sku_id'))
        by_location[loc_id]['items'].append({
            'sku_id': item.get('sku_id'),
            'sku_name': item.get('sku_name'),
            'quantity': item.get('quantity', 0)
        })
    
    location_summary = []
    for loc_id, data in by_location.items():
        location_summary.append({
            'location_id': loc_id,
            'location_name': data['location_name'],
            'distributor_name': data['distributor_name'],
            'total_quantity': data['total_quantity'],
            'sku_count': len(data['sku_count']),
            'items': data['items']
        })
    
    location_summary.sort(key=lambda x: x['total_quantity'], reverse=True)
    
    # Get list of cities with stock
    cities_with_stock = await db.distributor_locations.distinct(
        "city",
        {"tenant_id": tenant_id, "id": {"$in": list(set(s.get('distributor_location_id') for s in stock))}}
    )
    
    return {
        "summary": {
            "total_quantity": total_quantity,
            "total_skus": total_skus,
            "total_locations": total_locations,
            "total_distributors": total_distributors
        },
        "by_distributor": distributor_summary,
        "by_sku": sku_summary,
        "by_location": location_summary,
        "cities": sorted(cities_with_stock) if cities_with_stock else [],
        "raw_stock": stock
    }


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


def calculate_delivery_item_amounts(item: dict, margin_type: str = None, margin_value: float = None, transfer_price: float = None, base_price: float = None) -> dict:
    """Calculate amounts for a delivery item including margin and adjustment calculations
    
    Calculations:
    - Total Customer Billing Value = Qty × Customer Selling Price
    - Distributor Earnings (On Selling Price) = Total Billing × Commission %
    - Distributor Margin at Transfer Price = Qty × Transfer Price × Commission %
    - Adjustment Payable = Distributor Earnings - Margin at Transfer Price
    """
    quantity = item.get('quantity', 0)
    unit_price = item.get('unit_price', 0)  # Customer Selling Price
    customer_selling_price = item.get('customer_selling_price') or unit_price
    discount_percent = item.get('discount_percent', 0) or 0
    tax_percent = item.get('tax_percent', 0) or 0
    
    # Get transfer price from item or passed parameter
    item_transfer_price = item.get('transfer_price') or item.get('base_price') or transfer_price or base_price or 0
    
    # Get commission percentage from item or margin_value
    commission_percent = item.get('distributor_commission_percent') or margin_value or 0
    
    # Calculate billing amounts
    gross_amount = quantity * customer_selling_price  # Total Customer Billing Value
    discount_amount = round(gross_amount * discount_percent / 100, 2)
    taxable_amount = gross_amount - discount_amount
    tax_amount = round(taxable_amount * tax_percent / 100, 2)
    net_amount = taxable_amount + tax_amount
    
    # Calculate distributor earnings and adjustments
    # Distributor Earnings = Total Customer Billing Value × Commission %
    distributor_earnings = round(gross_amount * commission_percent / 100, 2) if commission_percent else 0
    
    # Margin at Transfer Price = Qty × Transfer Price × Commission %
    margin_at_transfer_price = round(quantity * item_transfer_price * commission_percent / 100, 2) if item_transfer_price and commission_percent else 0
    
    # Adjustment Payable = Distributor Earnings - Margin at Transfer Price
    # Positive means distributor owes company, Negative means company owes distributor
    adjustment_payable = round(distributor_earnings - margin_at_transfer_price, 2)
    
    # Legacy margin calculation (for backward compatibility)
    margin_amount = 0
    if margin_type and margin_value:
        if margin_type == 'percentage':
            margin_amount = round(net_amount * margin_value / 100, 2)
        elif margin_type == 'fixed_per_bottle':
            margin_amount = round(quantity * margin_value, 2)
        elif margin_type == 'fixed_per_case':
            cases = quantity / 12
            margin_amount = round(cases * margin_value, 2)
    
    return {
        **item,
        'customer_selling_price': customer_selling_price,
        'distributor_commission_percent': commission_percent,
        'transfer_price': item_transfer_price,
        'base_price': item_transfer_price,
        'gross_amount': round(gross_amount, 2),
        'discount_amount': discount_amount,
        'taxable_amount': round(taxable_amount, 2),
        'tax_amount': tax_amount,
        'net_amount': round(net_amount, 2),
        'distributor_earnings': distributor_earnings,
        'margin_at_transfer_price': margin_at_transfer_price,
        'adjustment_payable': adjustment_payable,
        'margin_type': margin_type,
        'margin_value': margin_value,
        'margin_amount': margin_amount or distributor_earnings  # Use new calculation as default
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
    account_id: Optional[str] = None,
    time_filter: Optional[str] = 'this_month',
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
    current_user: dict = Depends(get_current_user)
):
    """List deliveries for a specific distributor with items, pagination, and time filter"""
    tenant_id = get_current_tenant_id()
    
    query = {"tenant_id": tenant_id, "distributor_id": distributor_id}
    
    if status and status != 'all':
        query["status"] = status
    
    if account_id and account_id != 'all':
        query["account_id"] = account_id
    
    # Apply time filter
    now = datetime.now(timezone.utc)
    if time_filter and time_filter != 'lifetime':
        if time_filter == 'this_week':
            start_date = (now - timedelta(days=now.weekday())).replace(hour=0, minute=0, second=0, microsecond=0)
            end_date = now
        elif time_filter == 'last_week':
            start_date = (now - timedelta(days=now.weekday() + 7)).replace(hour=0, minute=0, second=0, microsecond=0)
            end_date = (now - timedelta(days=now.weekday() + 1)).replace(hour=23, minute=59, second=59, microsecond=999999)
        elif time_filter == 'this_month':
            start_date = now.replace(day=1, hour=0, minute=0, second=0, microsecond=0)
            end_date = now
        elif time_filter == 'last_month':
            first_of_current = now.replace(day=1, hour=0, minute=0, second=0, microsecond=0)
            last_day_of_prev = first_of_current - timedelta(days=1)
            start_date = last_day_of_prev.replace(day=1)
            end_date = last_day_of_prev.replace(hour=23, minute=59, second=59, microsecond=999999)
        elif time_filter == 'last_3_months':
            start_date = (now - timedelta(days=90)).replace(hour=0, minute=0, second=0, microsecond=0)
            end_date = now
        elif time_filter == 'last_6_months':
            start_date = (now - timedelta(days=180)).replace(hour=0, minute=0, second=0, microsecond=0)
            end_date = now
        elif time_filter == 'this_year':
            start_date = now.replace(month=1, day=1, hour=0, minute=0, second=0, microsecond=0)
            end_date = now
        else:
            start_date = None
            end_date = None
        
        if start_date and end_date:
            query["delivery_date"] = {
                "$gte": start_date.strftime("%Y-%m-%d"),
                "$lte": end_date.strftime("%Y-%m-%d")
            }
    
    total = await db.distributor_deliveries.count_documents(query)
    
    deliveries = await db.distributor_deliveries.find(
        query,
        {"_id": 0}
    ).sort("delivery_date", -1).skip((page - 1) * page_size).limit(page_size).to_list(page_size)
    
    # Fetch items for each delivery
    for delivery in deliveries:
        items = await db.distributor_delivery_items.find(
            {"delivery_id": delivery['id'], "tenant_id": tenant_id},
            {"_id": 0}
        ).to_list(500)
        delivery['items'] = items
    
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
            {"_id": 0, "id": 1, "account_name": 1, "contact_name": 1, "city": 1, "state": 1, "delivery_address": 1, "territory": 1, "contact_number": 1, "sku_pricing": 1}
        )
        if account:
            # Get SKU pricing and enrich with master SKU data for ID mapping
            sku_pricing = account.get('sku_pricing', [])
            enriched_skus = []
            if sku_pricing:
                # Get all master SKUs to map names to IDs
                # Note: master_skus may not have tenant_id set (global catalog)
                master_skus = await db.master_skus.find(
                    {"$or": [{"tenant_id": tenant_id}, {"tenant_id": None}, {"tenant_id": {"$exists": False}}]},
                    {"_id": 0, "id": 1, "name": 1, "sku_name": 1}
                ).to_list(500)
                
                # Build name-to-ID mapping using sku_name (primary) or name (fallback)
                sku_name_to_id = {}
                for s in master_skus:
                    sku_key = s.get('sku_name') or s.get('name')
                    if sku_key:
                        sku_name_to_id[sku_key] = s.get('id')
                
                for sku_item in sku_pricing:
                    sku_name = sku_item.get('sku')
                    sku_id = sku_name_to_id.get(sku_name)
                    if sku_id:
                        enriched_skus.append({
                            "id": sku_id,
                            "name": sku_name,
                            "price_per_unit": sku_item.get('price_per_unit', 0),
                            "return_bottle_credit": sku_item.get('return_bottle_credit', 0)
                        })
            
            accounts.append({
                "id": account.get('id'),
                "account_name": account.get('account_name', 'Unknown Account'),
                "contact_name": account.get('contact_name', ''),
                "contact_number": account.get('contact_number', ''),
                "city": account.get('city', ''),
                "state": account.get('state', ''),
                "territory": account.get('territory', ''),
                "delivery_address": account.get('delivery_address', ''),
                "servicing_city": assignment.get('servicing_city'),
                "distributor_location_id": assignment.get('distributor_location_id'),
                "distributor_location_name": assignment.get('distributor_location_name'),
                "is_primary": assignment.get('is_primary', False),
                "sku_pricing": enriched_skus  # Include account's configured SKUs with IDs
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
        }, {"_id": 0, "margin_type": 1, "margin_value": 1, "transfer_price": 1, "base_price": 1})
        
        margin_type = margin.get('margin_type') if margin else None
        margin_value = margin.get('margin_value') if margin else None
        transfer_price = margin.get('transfer_price') if margin else None
        base_price = margin.get('base_price') if margin else None
        
        item_dict = {
            'id': str(uuid.uuid4()),
            'tenant_id': tenant_id,
            'delivery_id': delivery_id,
            'sku_id': item_data.sku_id,
            'sku_name': sku_name,
            'sku_code': sku_code,
            'quantity': item_data.quantity,
            'unit_price': item_data.unit_price,
            'customer_selling_price': item_data.customer_selling_price or item_data.unit_price,
            'distributor_commission_percent': item_data.distributor_commission_percent or margin_value,
            'transfer_price': item_data.transfer_price or transfer_price,
            'base_price': item_data.base_price or base_price,
            'discount_percent': item_data.discount_percent or 0,
            'tax_percent': item_data.tax_percent or 0,
            'remarks': item_data.remarks
        }
        
        # Calculate amounts with margin and transfer price
        item_dict = calculate_delivery_item_amounts(item_dict, margin_type, margin_value, transfer_price, base_price)
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


# ============ Billing Configuration CRUD ============

async def generate_billing_config_id() -> str:
    return str(uuid.uuid4())


@router.get("/{distributor_id}/billing-config")
async def get_billing_configs(
    distributor_id: str,
    status: Optional[str] = None,
    current_user: dict = Depends(get_current_user)
):
    """Get billing configurations (base prices) for a distributor"""
    tenant_id = get_current_tenant_id()
    
    query = {"tenant_id": tenant_id, "distributor_id": distributor_id}
    if status:
        query["status"] = status
    
    configs = await db.distributor_billing_config.find(
        query, {"_id": 0}
    ).sort("sku_name", 1).to_list(500)
    
    return {"configs": configs, "count": len(configs)}


@router.post("/{distributor_id}/billing-config")
async def create_billing_config(
    distributor_id: str,
    data: BillingConfigCreate,
    current_user: dict = Depends(get_current_user)
):
    """Create billing configuration for a SKU at distributor level"""
    if not is_distributor_admin(current_user):
        raise HTTPException(status_code=403, detail="Admin access required")
    
    tenant_id = get_current_tenant_id()
    
    # Check for existing config
    existing = await db.distributor_billing_config.find_one({
        "tenant_id": tenant_id,
        "distributor_id": distributor_id,
        "sku_id": data.sku_id,
        "status": "active"
    })
    if existing:
        raise HTTPException(status_code=400, detail="Active billing config already exists for this SKU")
    
    # Get SKU name if not provided
    sku_name = data.sku_name
    if not sku_name:
        sku = await db.master_skus.find_one({"id": data.sku_id})
        sku_name = sku.get('sku_name') or sku.get('name') if sku else None
    
    # Calculate transfer price
    transfer_price = data.base_price * (1 - data.margin_percent / 100)
    
    now = datetime.now(timezone.utc).isoformat()
    config_id = await generate_billing_config_id()
    
    config_doc = {
        "id": config_id,
        "tenant_id": tenant_id,
        "distributor_id": distributor_id,
        "sku_id": data.sku_id,
        "sku_name": sku_name,
        "base_price": data.base_price,
        "margin_percent": data.margin_percent,
        "transfer_price": transfer_price,
        "effective_from": data.effective_from or now[:10],
        "effective_to": data.effective_to,
        "remarks": data.remarks,
        "status": data.status or "active",
        "created_at": now,
        "updated_at": now,
        "created_by": current_user.get('id')
    }
    
    await db.distributor_billing_config.insert_one(config_doc)
    config_doc.pop('_id', None)
    
    return config_doc


@router.post("/{distributor_id}/billing-config/bulk")
async def bulk_create_billing_config(
    distributor_id: str,
    configs: List[BillingConfigCreate],
    current_user: dict = Depends(get_current_user)
):
    """Bulk create billing configurations"""
    if not is_distributor_admin(current_user):
        raise HTTPException(status_code=403, detail="Admin access required")
    
    tenant_id = get_current_tenant_id()
    now = datetime.now(timezone.utc).isoformat()
    
    # Get all SKU names
    sku_ids = [c.sku_id for c in configs]
    skus = await db.master_skus.find(
        {"$or": [{"id": {"$in": sku_ids}}, {"tenant_id": tenant_id}]}
    ).to_list(500)
    sku_map = {s.get('id'): s.get('sku_name') or s.get('name') for s in skus}
    
    created = []
    skipped = []
    
    for data in configs:
        # Check for existing
        existing = await db.distributor_billing_config.find_one({
            "tenant_id": tenant_id,
            "distributor_id": distributor_id,
            "sku_id": data.sku_id,
            "status": "active"
        })
        if existing:
            skipped.append(data.sku_id)
            continue
        
        transfer_price = data.base_price * (1 - data.margin_percent / 100)
        config_id = await generate_billing_config_id()
        
        config_doc = {
            "id": config_id,
            "tenant_id": tenant_id,
            "distributor_id": distributor_id,
            "sku_id": data.sku_id,
            "sku_name": data.sku_name or sku_map.get(data.sku_id),
            "base_price": data.base_price,
            "margin_percent": data.margin_percent,
            "transfer_price": transfer_price,
            "effective_from": data.effective_from or now[:10],
            "effective_to": data.effective_to,
            "remarks": data.remarks,
            "status": data.status or "active",
            "created_at": now,
            "updated_at": now,
            "created_by": current_user.get('id')
        }
        
        await db.distributor_billing_config.insert_one(config_doc)
        created.append(config_id)
    
    return {"created": len(created), "skipped": len(skipped), "skipped_sku_ids": skipped}


@router.put("/{distributor_id}/billing-config/{config_id}")
async def update_billing_config(
    distributor_id: str,
    config_id: str,
    data: BillingConfigUpdate,
    current_user: dict = Depends(get_current_user)
):
    """Update billing configuration"""
    if not is_distributor_admin(current_user):
        raise HTTPException(status_code=403, detail="Admin access required")
    
    tenant_id = get_current_tenant_id()
    
    config = await db.distributor_billing_config.find_one({
        "id": config_id, "tenant_id": tenant_id, "distributor_id": distributor_id
    })
    if not config:
        raise HTTPException(status_code=404, detail="Billing config not found")
    
    update_data = {"updated_at": datetime.now(timezone.utc).isoformat()}
    
    if data.base_price is not None:
        update_data["base_price"] = data.base_price
    if data.margin_percent is not None:
        update_data["margin_percent"] = data.margin_percent
    
    # Recalculate transfer price if base_price or margin changed
    base_price = update_data.get("base_price", config.get("base_price"))
    margin_percent = update_data.get("margin_percent", config.get("margin_percent"))
    update_data["transfer_price"] = base_price * (1 - margin_percent / 100)
    
    if data.effective_from is not None:
        update_data["effective_from"] = data.effective_from
    if data.effective_to is not None:
        update_data["effective_to"] = data.effective_to
    if data.remarks is not None:
        update_data["remarks"] = data.remarks
    if data.status is not None:
        update_data["status"] = data.status
    
    await db.distributor_billing_config.update_one(
        {"id": config_id, "tenant_id": tenant_id},
        {"$set": update_data}
    )
    
    return {"message": "Billing config updated", "id": config_id}


@router.delete("/{distributor_id}/billing-config/{config_id}")
async def delete_billing_config(
    distributor_id: str,
    config_id: str,
    current_user: dict = Depends(get_current_user)
):
    """Delete billing configuration"""
    if not is_distributor_admin(current_user):
        raise HTTPException(status_code=403, detail="Admin access required")
    
    tenant_id = get_current_tenant_id()
    
    result = await db.distributor_billing_config.delete_one({
        "id": config_id, "tenant_id": tenant_id, "distributor_id": distributor_id
    })
    
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Billing config not found")
    
    return {"message": "Billing config deleted"}


# ============ Provisional Invoice Generation ============

async def generate_provisional_invoice_number(tenant_id: str) -> str:
    """Generate unique provisional invoice number like PINV-2026-0001"""
    year = datetime.now().year
    count = await db.distributor_provisional_invoices.count_documents({
        "tenant_id": tenant_id,
        "invoice_number": {"$regex": f"^PINV-{year}-"}
    })
    return f"PINV-{year}-{count + 1:04d}"


@router.post("/{distributor_id}/provisional-invoices/generate")
async def generate_provisional_invoice(
    distributor_id: str,
    shipment_id: str,
    current_user: dict = Depends(get_current_user)
):
    """Generate provisional invoice when shipment is delivered"""
    if not is_distributor_admin(current_user):
        raise HTTPException(status_code=403, detail="Admin access required")
    
    tenant_id = get_current_tenant_id()
    
    # Get shipment
    shipment = await db.distributor_shipments.find_one({
        "id": shipment_id, "tenant_id": tenant_id, "distributor_id": distributor_id
    })
    if not shipment:
        raise HTTPException(status_code=404, detail="Shipment not found")
    
    if shipment.get('status') != 'delivered':
        raise HTTPException(status_code=400, detail="Shipment must be delivered to generate invoice")
    
    # Check if invoice already exists
    existing = await db.distributor_provisional_invoices.find_one({
        "tenant_id": tenant_id, "shipment_id": shipment_id
    })
    if existing:
        raise HTTPException(status_code=400, detail="Provisional invoice already exists for this shipment")
    
    # Get billing configs for this distributor
    configs = await db.distributor_billing_config.find({
        "tenant_id": tenant_id,
        "distributor_id": distributor_id,
        "status": "active"
    }).to_list(500)
    config_map = {c.get('sku_id'): c for c in configs}
    
    # Get shipment items
    shipment_items = await db.distributor_shipment_items.find({
        "shipment_id": shipment_id, "tenant_id": tenant_id
    }).to_list(500)
    
    # Generate invoice
    now = datetime.now(timezone.utc).isoformat()
    invoice_id = str(uuid.uuid4())
    invoice_number = await generate_provisional_invoice_number(tenant_id)
    
    invoice_items = []
    total_quantity = 0
    total_gross_amount = 0
    total_margin_amount = 0
    total_net_amount = 0
    
    for item in shipment_items:
        sku_id = item.get('sku_id')
        quantity = item.get('quantity', 0)
        config = config_map.get(sku_id)
        
        if not config:
            # If no config, use shipment item price as base
            base_price = item.get('unit_price', 0)
            margin_percent = 2.5  # Default margin
        else:
            base_price = config.get('base_price', item.get('unit_price', 0))
            margin_percent = config.get('margin_percent', 2.5)
        
        transfer_price = base_price * (1 - margin_percent / 100)
        gross_amount = quantity * base_price
        margin_amount = gross_amount * margin_percent / 100
        net_amount = gross_amount - margin_amount
        
        item_id = str(uuid.uuid4())
        invoice_item = {
            "id": item_id,
            "invoice_id": invoice_id,
            "tenant_id": tenant_id,
            "sku_id": sku_id,
            "sku_name": item.get('sku_name'),
            "quantity": quantity,
            "base_price": base_price,
            "margin_percent": margin_percent,
            "transfer_price": transfer_price,
            "gross_amount": gross_amount,
            "margin_amount": margin_amount,
            "net_amount": net_amount
        }
        invoice_items.append(invoice_item)
        
        total_quantity += quantity
        total_gross_amount += gross_amount
        total_margin_amount += margin_amount
        total_net_amount += net_amount
    
    # Create invoice
    distributor = await db.distributors.find_one({"id": distributor_id})
    
    invoice_doc = {
        "id": invoice_id,
        "tenant_id": tenant_id,
        "invoice_number": invoice_number,
        "distributor_id": distributor_id,
        "distributor_name": distributor.get('distributor_name') if distributor else None,
        "distributor_code": distributor.get('distributor_code') if distributor else None,
        "shipment_id": shipment_id,
        "shipment_number": shipment.get('shipment_number'),
        "invoice_date": now[:10],
        "due_date": None,
        "total_quantity": total_quantity,
        "total_gross_amount": round(total_gross_amount, 2),
        "total_margin_amount": round(total_margin_amount, 2),
        "total_net_amount": round(total_net_amount, 2),
        "status": "pending",
        "reconciliation_status": "pending",
        "reconciled_quantity": 0,
        "reconciled_amount": 0,
        "remarks": f"Auto-generated from shipment {shipment.get('shipment_number')}",
        "created_at": now,
        "updated_at": now,
        "created_by": current_user.get('id')
    }
    
    await db.distributor_provisional_invoices.insert_one(invoice_doc)
    if invoice_items:
        await db.distributor_provisional_invoice_items.insert_many(invoice_items)
    
    invoice_doc.pop('_id', None)
    invoice_doc['items'] = invoice_items
    
    logger.info(f"Generated provisional invoice {invoice_number} for shipment {shipment.get('shipment_number')}")
    
    return invoice_doc


@router.get("/{distributor_id}/provisional-invoices")
async def get_provisional_invoices(
    distributor_id: str,
    status: Optional[str] = None,
    reconciliation_status: Optional[str] = None,
    page: int = 1,
    page_size: int = 20,
    current_user: dict = Depends(get_current_user)
):
    """Get provisional invoices for a distributor"""
    tenant_id = get_current_tenant_id()
    
    query = {"tenant_id": tenant_id, "distributor_id": distributor_id}
    if status:
        query["status"] = status
    if reconciliation_status:
        query["reconciliation_status"] = reconciliation_status
    
    total = await db.distributor_provisional_invoices.count_documents(query)
    invoices = await db.distributor_provisional_invoices.find(
        query, {"_id": 0}
    ).sort("created_at", -1).skip((page - 1) * page_size).limit(page_size).to_list(page_size)
    
    return {
        "invoices": invoices,
        "total": total,
        "page": page,
        "page_size": page_size,
        "total_pages": (total + page_size - 1) // page_size
    }


@router.get("/{distributor_id}/provisional-invoices/{invoice_id}")
async def get_provisional_invoice(
    distributor_id: str,
    invoice_id: str,
    current_user: dict = Depends(get_current_user)
):
    """Get provisional invoice with items"""
    tenant_id = get_current_tenant_id()
    
    invoice = await db.distributor_provisional_invoices.find_one({
        "id": invoice_id, "tenant_id": tenant_id, "distributor_id": distributor_id
    }, {"_id": 0})
    
    if not invoice:
        raise HTTPException(status_code=404, detail="Invoice not found")
    
    items = await db.distributor_provisional_invoice_items.find({
        "invoice_id": invoice_id, "tenant_id": tenant_id
    }, {"_id": 0}).to_list(500)
    
    invoice['items'] = items
    return invoice


# ============ Reconciliation Engine ============

async def generate_reconciliation_number(tenant_id: str) -> str:
    """Generate unique reconciliation number like REC-2026-0001"""
    year = datetime.now().year
    count = await db.distributor_reconciliations.count_documents({
        "tenant_id": tenant_id,
        "reconciliation_number": {"$regex": f"^REC-{year}-"}
    })
    return f"REC-{year}-{count + 1:04d}"


@router.post("/{distributor_id}/reconciliations/calculate")
async def calculate_reconciliation(
    distributor_id: str,
    data: ReconciliationCreate,
    current_user: dict = Depends(get_current_user)
):
    """Calculate reconciliation for a period (preview without saving)"""
    tenant_id = get_current_tenant_id()
    
    # Get margin matrix entries for this distributor
    # Filter by active dates - entry is valid if:
    # (active_from is null or active_from <= period_end) AND (active_to is null or active_to >= period_start)
    margin_entries = await db.distributor_margin_matrix.find({
        "tenant_id": tenant_id,
        "distributor_id": distributor_id,
        "status": "active",
        "$or": [
            {"active_from": None},
            {"active_from": {"$lte": data.period_end}}
        ]
    }).to_list(500)
    
    # Filter out entries that ended before the period started
    margin_entries = [
        m for m in margin_entries 
        if not m.get('active_to') or m.get('active_to') >= data.period_start
    ]
    
    # Build lookup map: (sku_id, city) -> margin entry
    # For entries without city match, we'll use sku_id only as fallback
    margin_map_by_city_sku = {}
    margin_map_by_sku = {}
    for m in margin_entries:
        key = (m.get('sku_id'), m.get('city'))
        margin_map_by_city_sku[key] = m
        # Also keep by sku_id only for fallback
        if m.get('sku_id') not in margin_map_by_sku:
            margin_map_by_sku[m.get('sku_id')] = m
    
    # Get deliveries in the period
    deliveries = await db.distributor_deliveries.find({
        "tenant_id": tenant_id,
        "distributor_id": distributor_id,
        "status": "delivered",
        "delivery_date": {"$gte": data.period_start, "$lte": data.period_end}
    }).to_list(1000)
    
    if not deliveries:
        return {
            "message": "No delivered items found in this period",
            "period_start": data.period_start,
            "period_end": data.period_end,
            "total_deliveries": 0,
            "items": []
        }
    
    # Get all delivery items
    delivery_ids = [d.get('id') for d in deliveries]
    delivery_items = await db.distributor_delivery_items.find({
        "delivery_id": {"$in": delivery_ids},
        "tenant_id": tenant_id
    }).to_list(5000)
    
    # Build delivery map
    delivery_map = {d.get('id'): d for d in deliveries}
    
    # Get accounts to get city info
    account_ids = list(set(d.get('account_id') for d in deliveries if d.get('account_id')))
    accounts = await db.accounts.find(
        {"id": {"$in": account_ids}},
        {"_id": 0, "id": 1, "city": 1}
    ).to_list(500)
    account_city_map = {a.get('id'): a.get('city') for a in accounts}
    
    # Calculate reconciliation items
    items = []
    total_provisional = 0
    total_actual_gross = 0
    total_entitled_margin = 0
    total_actual_net = 0
    total_quantity = 0
    
    for item in delivery_items:
        delivery = delivery_map.get(item.get('delivery_id'))
        if not delivery:
            continue
        
        sku_id = item.get('sku_id')
        quantity = item.get('quantity', 0)
        actual_selling_price = item.get('unit_price', 0)  # Price sold to customer
        
        # Get account city for lookup
        account_id = delivery.get('account_id')
        account_city = delivery.get('account_city') or account_city_map.get(account_id)
        
        # Get margin entry - first try city+sku, then sku only
        margin_entry = margin_map_by_city_sku.get((sku_id, account_city)) or margin_map_by_sku.get(sku_id)
        
        if margin_entry:
            base_price = margin_entry.get('base_price', actual_selling_price)
            margin_type = margin_entry.get('margin_type', 'percentage')
            margin_value = margin_entry.get('margin_value', 2.5)
            
            # Calculate margin based on type
            if margin_type == 'percentage':
                margin_percent = margin_value
            else:
                # For fixed margin types, convert to percentage for calculation
                margin_percent = (margin_value / base_price * 100) if base_price > 0 else 2.5
        else:
            base_price = actual_selling_price  # Fallback - no margin entry found
            margin_percent = 2.5
        
        transfer_price = base_price * (1 - margin_percent / 100)
        
        # Provisional (what distributor paid)
        provisional_amount = quantity * transfer_price
        
        # Actual (based on customer selling price)
        actual_gross_amount = quantity * actual_selling_price
        entitled_margin_amount = actual_gross_amount * margin_percent / 100
        actual_net_amount = actual_gross_amount - entitled_margin_amount
        
        # Difference
        difference_amount = actual_net_amount - provisional_amount
        
        rec_item = {
            "delivery_id": delivery.get('id'),
            "delivery_number": delivery.get('delivery_number'),
            "delivery_date": delivery.get('delivery_date'),
            "account_id": delivery.get('account_id'),
            "account_name": delivery.get('account_name'),
            "account_city": account_city,
            "sku_id": sku_id,
            "sku_name": item.get('sku_name'),
            "quantity": quantity,
            "base_price": round(base_price, 2),
            "margin_percent": round(margin_percent, 2),
            "transfer_price": round(transfer_price, 2),
            "provisional_amount": round(provisional_amount, 2),
            "actual_selling_price": round(actual_selling_price, 2),
            "actual_gross_amount": round(actual_gross_amount, 2),
            "entitled_margin_amount": round(entitled_margin_amount, 2),
            "actual_net_amount": round(actual_net_amount, 2),
            "difference_amount": round(difference_amount, 2),
            "margin_entry_found": margin_entry is not None
        }
        items.append(rec_item)
        
        total_quantity += quantity
        total_provisional += provisional_amount
        total_actual_gross += actual_gross_amount
        total_entitled_margin += entitled_margin_amount
        total_actual_net += actual_net_amount
    
    total_difference = total_actual_net - total_provisional
    settlement_type = "debit_note" if total_difference > 0 else "credit_note" if total_difference < 0 else None
    
    return {
        "period_start": data.period_start,
        "period_end": data.period_end,
        "total_deliveries": len(deliveries),
        "total_quantity": total_quantity,
        "total_provisional_amount": round(total_provisional, 2),
        "total_actual_gross_amount": round(total_actual_gross, 2),
        "total_entitled_margin": round(total_entitled_margin, 2),
        "total_actual_net_amount": round(total_actual_net, 2),
        "total_difference": round(total_difference, 2),
        "settlement_type": settlement_type,
        "items": items
    }


@router.post("/{distributor_id}/reconciliations")
async def create_reconciliation(
    distributor_id: str,
    data: ReconciliationCreate,
    current_user: dict = Depends(get_current_user)
):
    """Create and save reconciliation"""
    if not is_distributor_admin(current_user):
        raise HTTPException(status_code=403, detail="Admin access required")
    
    tenant_id = get_current_tenant_id()
    
    # First calculate
    calc_result = await calculate_reconciliation(distributor_id, data, current_user)
    
    if calc_result.get('total_deliveries', 0) == 0:
        raise HTTPException(status_code=400, detail="No delivered items found in this period")
    
    now = datetime.now(timezone.utc).isoformat()
    reconciliation_id = str(uuid.uuid4())
    reconciliation_number = await generate_reconciliation_number(tenant_id)
    
    # Get distributor info
    distributor = await db.distributors.find_one({"id": distributor_id})
    
    # Create reconciliation document
    rec_doc = {
        "id": reconciliation_id,
        "tenant_id": tenant_id,
        "reconciliation_number": reconciliation_number,
        "distributor_id": distributor_id,
        "distributor_name": distributor.get('distributor_name') if distributor else None,
        "distributor_code": distributor.get('distributor_code') if distributor else None,
        "period_start": data.period_start,
        "period_end": data.period_end,
        "total_deliveries": calc_result.get('total_deliveries'),
        "total_quantity": calc_result.get('total_quantity'),
        "total_provisional_amount": calc_result.get('total_provisional_amount'),
        "total_actual_gross_amount": calc_result.get('total_actual_gross_amount'),
        "total_entitled_margin": calc_result.get('total_entitled_margin'),
        "total_actual_net_amount": calc_result.get('total_actual_net_amount'),
        "total_difference": calc_result.get('total_difference'),
        "adjustments": 0,
        "final_settlement_amount": calc_result.get('total_difference'),
        "settlement_type": calc_result.get('settlement_type'),
        "status": "draft",
        "remarks": data.remarks,
        "created_at": now,
        "updated_at": now,
        "created_by": current_user.get('id')
    }
    
    await db.distributor_reconciliations.insert_one(rec_doc)
    
    # Create line items
    rec_items = []
    for item in calc_result.get('items', []):
        item_id = str(uuid.uuid4())
        rec_item = {
            "id": item_id,
            "reconciliation_id": reconciliation_id,
            "tenant_id": tenant_id,
            **item
        }
        rec_items.append(rec_item)
    
    if rec_items:
        await db.distributor_reconciliation_items.insert_many(rec_items)
    
    rec_doc.pop('_id', None)
    # Remove _id from each item after insert
    for item in rec_items:
        item.pop('_id', None)
    rec_doc['items'] = rec_items
    
    logger.info(f"Created reconciliation {reconciliation_number} for distributor {distributor_id}")
    
    return rec_doc


@router.get("/{distributor_id}/reconciliations")
async def get_reconciliations(
    distributor_id: str,
    status: Optional[str] = None,
    page: int = 1,
    page_size: int = 20,
    current_user: dict = Depends(get_current_user)
):
    """Get reconciliations for a distributor with delivery items"""
    tenant_id = get_current_tenant_id()
    
    query = {"tenant_id": tenant_id, "distributor_id": distributor_id}
    if status:
        query["status"] = status
    
    total = await db.distributor_reconciliations.count_documents(query)
    recs = await db.distributor_reconciliations.find(
        query, {"_id": 0}
    ).sort("created_at", -1).skip((page - 1) * page_size).limit(page_size).to_list(page_size)
    
    # For each reconciliation, fetch the delivery items with adjustment amounts
    for rec in recs:
        items = await db.distributor_reconciliation_items.find(
            {"reconciliation_id": rec['id'], "tenant_id": tenant_id},
            {"_id": 0}
        ).to_list(500)
        
        # Enrich items with delivery details
        delivery_items = []
        for item in items:
            delivery_id = item.get('delivery_id')
            if delivery_id:
                # Get delivery info
                delivery = await db.distributor_deliveries.find_one(
                    {"id": delivery_id, "tenant_id": tenant_id},
                    {"_id": 0, "delivery_number": 1, "account_name": 1, "account_id": 1}
                )
                if delivery:
                    item['delivery_number'] = delivery.get('delivery_number')
                    item['account_name'] = delivery.get('account_name')
            
            # Calculate adjustment if not already present
            distributor_earnings = item.get('distributor_earnings') or item.get('margin_amount') or 0
            margin_at_transfer = item.get('margin_at_transfer_price') or 0
            item['adjustment_amount'] = item.get('adjustment_amount') or item.get('adjustment_payable') or (distributor_earnings - margin_at_transfer)
            item['total_billing_value'] = item.get('total_billing_value') or item.get('gross_amount') or item.get('actual_net_amount') or 0
            
            delivery_items.append(item)
        
        rec['delivery_items'] = delivery_items
    
    return {
        "reconciliations": recs,
        "total": total,
        "page": page,
        "page_size": page_size
    }


@router.get("/{distributor_id}/reconciliations/{reconciliation_id}")
async def get_reconciliation(
    distributor_id: str,
    reconciliation_id: str,
    current_user: dict = Depends(get_current_user)
):
    """Get reconciliation with items"""
    tenant_id = get_current_tenant_id()
    
    rec = await db.distributor_reconciliations.find_one({
        "id": reconciliation_id, "tenant_id": tenant_id, "distributor_id": distributor_id
    }, {"_id": 0})
    
    if not rec:
        raise HTTPException(status_code=404, detail="Reconciliation not found")
    
    items = await db.distributor_reconciliation_items.find({
        "reconciliation_id": reconciliation_id, "tenant_id": tenant_id
    }, {"_id": 0}).to_list(5000)
    
    rec['items'] = items
    return rec


@router.post("/{distributor_id}/reconciliations/{reconciliation_id}/confirm")
async def confirm_reconciliation(
    distributor_id: str,
    reconciliation_id: str,
    adjustments: float = 0,
    current_user: dict = Depends(get_current_user)
):
    """Confirm reconciliation and generate debit/credit note"""
    if not is_distributor_admin(current_user):
        raise HTTPException(status_code=403, detail="Admin access required")
    
    tenant_id = get_current_tenant_id()
    now = datetime.now(timezone.utc).isoformat()
    
    rec = await db.distributor_reconciliations.find_one({
        "id": reconciliation_id, "tenant_id": tenant_id, "distributor_id": distributor_id
    })
    
    if not rec:
        raise HTTPException(status_code=404, detail="Reconciliation not found")
    
    if rec.get('status') != 'draft':
        raise HTTPException(status_code=400, detail="Only draft reconciliations can be confirmed")
    
    # Calculate final amount with adjustments
    total_difference = rec.get('total_difference', 0)
    final_amount = total_difference + adjustments
    settlement_type = "debit_note" if final_amount > 0 else "credit_note" if final_amount < 0 else None
    
    # Generate debit/credit note if there's a settlement amount
    note_id = None
    if abs(final_amount) > 0 and settlement_type:
        note_id = str(uuid.uuid4())
        year = datetime.now().year
        prefix = "DN" if settlement_type == "debit_note" else "CN"
        count = await db.distributor_debit_credit_notes.count_documents({
            "tenant_id": tenant_id,
            "note_number": {"$regex": f"^{prefix}-{year}-"}
        })
        note_number = f"{prefix}-{year}-{count + 1:04d}"
        
        distributor = await db.distributors.find_one({"id": distributor_id})
        
        note_doc = {
            "id": note_id,
            "tenant_id": tenant_id,
            "note_number": note_number,
            "note_type": "debit" if settlement_type == "debit_note" else "credit",
            "reconciliation_id": reconciliation_id,
            "reconciliation_number": rec.get('reconciliation_number'),
            "distributor_id": distributor_id,
            "distributor_name": distributor.get('distributor_name') if distributor else None,
            "distributor_code": distributor.get('distributor_code') if distributor else None,
            "amount": abs(round(final_amount, 2)),
            "status": "pending",
            "paid_amount": 0,
            "balance_amount": abs(round(final_amount, 2)),
            "remarks": f"Generated from reconciliation {rec.get('reconciliation_number')}",
            "created_at": now,
            "updated_at": now,
            "created_by": current_user.get('id')
        }
        
        await db.distributor_debit_credit_notes.insert_one(note_doc)
    
    # Update reconciliation
    await db.distributor_reconciliations.update_one(
        {"id": reconciliation_id, "tenant_id": tenant_id},
        {"$set": {
            "status": "confirmed",
            "adjustments": adjustments,
            "final_settlement_amount": round(final_amount, 2),
            "settlement_type": settlement_type,
            "debit_credit_note_id": note_id,
            "confirmed_at": now,
            "confirmed_by": current_user.get('id'),
            "updated_at": now
        }}
    )
    
    return {
        "message": "Reconciliation confirmed",
        "reconciliation_number": rec.get('reconciliation_number'),
        "final_settlement_amount": round(final_amount, 2),
        "settlement_type": settlement_type,
        "note_id": note_id
    }


@router.delete("/{distributor_id}/reconciliations/{reconciliation_id}")
async def delete_reconciliation(
    distributor_id: str,
    reconciliation_id: str,
    current_user: dict = Depends(get_current_user)
):
    """Delete a draft reconciliation"""
    if not is_distributor_admin(current_user):
        raise HTTPException(status_code=403, detail="Admin access required")
    
    tenant_id = get_current_tenant_id()
    
    rec = await db.distributor_reconciliations.find_one({
        "id": reconciliation_id, "tenant_id": tenant_id, "distributor_id": distributor_id
    })
    
    if not rec:
        raise HTTPException(status_code=404, detail="Reconciliation not found")
    
    if rec.get('status') != 'draft':
        raise HTTPException(status_code=400, detail="Only draft reconciliations can be deleted")
    
    await db.distributor_reconciliation_items.delete_many({"reconciliation_id": reconciliation_id})
    await db.distributor_reconciliations.delete_one({"id": reconciliation_id, "tenant_id": tenant_id})
    
    return {"message": "Reconciliation deleted"}


# ============ Debit/Credit Notes ============

@router.get("/{distributor_id}/debit-credit-notes")
async def get_debit_credit_notes(
    distributor_id: str,
    note_type: Optional[str] = None,
    status: Optional[str] = None,
    page: int = 1,
    page_size: int = 20,
    current_user: dict = Depends(get_current_user)
):
    """Get debit/credit notes for a distributor"""
    tenant_id = get_current_tenant_id()
    
    query = {"tenant_id": tenant_id, "distributor_id": distributor_id}
    if note_type:
        query["note_type"] = note_type
    if status:
        query["status"] = status
    
    total = await db.distributor_debit_credit_notes.count_documents(query)
    notes = await db.distributor_debit_credit_notes.find(
        query, {"_id": 0}
    ).sort("created_at", -1).skip((page - 1) * page_size).limit(page_size).to_list(page_size)
    
    return {
        "notes": notes,
        "total": total,
        "page": page,
        "page_size": page_size
    }


@router.get("/{distributor_id}/debit-credit-notes/{note_id}")
async def get_debit_credit_note(
    distributor_id: str,
    note_id: str,
    current_user: dict = Depends(get_current_user)
):
    """Get debit/credit note details"""
    tenant_id = get_current_tenant_id()
    
    note = await db.distributor_debit_credit_notes.find_one({
        "id": note_id, "tenant_id": tenant_id, "distributor_id": distributor_id
    }, {"_id": 0})
    
    if not note:
        raise HTTPException(status_code=404, detail="Note not found")
    
    # Get reconciliation details if available
    if note.get('reconciliation_id'):
        rec = await db.distributor_reconciliations.find_one({
            "id": note.get('reconciliation_id'), "tenant_id": tenant_id
        }, {"_id": 0})
        note['reconciliation'] = rec
    
    return note


@router.post("/{distributor_id}/debit-credit-notes/{note_id}/record-payment")
async def record_note_payment(
    distributor_id: str,
    note_id: str,
    amount: float,
    payment_reference: Optional[str] = None,
    current_user: dict = Depends(get_current_user)
):
    """Record payment against debit/credit note"""
    if not is_distributor_admin(current_user):
        raise HTTPException(status_code=403, detail="Admin access required")
    
    tenant_id = get_current_tenant_id()
    now = datetime.now(timezone.utc).isoformat()
    
    note = await db.distributor_debit_credit_notes.find_one({
        "id": note_id, "tenant_id": tenant_id, "distributor_id": distributor_id
    })
    
    if not note:
        raise HTTPException(status_code=404, detail="Note not found")
    
    if note.get('status') == 'paid':
        raise HTTPException(status_code=400, detail="Note is already fully paid")
    
    if note.get('status') == 'cancelled':
        raise HTTPException(status_code=400, detail="Note is cancelled")
    
    new_paid_amount = (note.get('paid_amount', 0) or 0) + amount
    new_balance = note.get('amount', 0) - new_paid_amount
    new_status = "paid" if new_balance <= 0 else "partially_paid"
    
    update_data = {
        "paid_amount": round(new_paid_amount, 2),
        "balance_amount": round(max(0, new_balance), 2),
        "status": new_status,
        "updated_at": now
    }
    
    if new_status == "paid":
        update_data["paid_at"] = now
        update_data["paid_by"] = current_user.get('id')
    
    if payment_reference:
        update_data["payment_reference"] = payment_reference
    
    await db.distributor_debit_credit_notes.update_one(
        {"id": note_id, "tenant_id": tenant_id},
        {"$set": update_data}
    )
    
    # If note is paid, update reconciliation status
    if new_status == "paid" and note.get('reconciliation_id'):
        await db.distributor_reconciliations.update_one(
            {"id": note.get('reconciliation_id'), "tenant_id": tenant_id},
            {"$set": {
                "status": "settled",
                "settled_at": now,
                "settled_by": current_user.get('id'),
                "updated_at": now
            }}
        )
    
    return {
        "message": "Payment recorded",
        "paid_amount": round(new_paid_amount, 2),
        "balance_amount": round(max(0, new_balance), 2),
        "status": new_status
    }


@router.delete("/{distributor_id}/notes/{note_id}")
async def delete_debit_credit_note(
    distributor_id: str,
    note_id: str,
    current_user: dict = Depends(get_current_user)
):
    """Delete a debit/credit note - CEO/Admin only"""
    tenant_id = get_current_tenant_id()
    
    # Check role - only CEO and Admin can delete notes
    user_role = current_user.get('role', '')
    if user_role not in ['CEO', 'Admin', 'System Admin']:
        raise HTTPException(
            status_code=403, 
            detail="Only CEO and Admin can delete debit/credit notes"
        )
    
    # Find the note
    note = await db.distributor_debit_credit_notes.find_one({
        "id": note_id,
        "distributor_id": distributor_id,
        "tenant_id": tenant_id
    })
    
    if not note:
        raise HTTPException(status_code=404, detail="Note not found")
    
    # Delete the note
    await db.distributor_debit_credit_notes.delete_one({
        "id": note_id,
        "tenant_id": tenant_id
    })
    
    # If note was linked to a reconciliation, update the reconciliation status back to draft
    if note.get('reconciliation_id'):
        await db.distributor_reconciliations.update_one(
            {"id": note.get('reconciliation_id'), "tenant_id": tenant_id},
            {"$set": {
                "status": "draft",
                "settlement_type": None,
                "updated_at": datetime.now(timezone.utc)
            }}
        )
    
    return {"message": "Note deleted successfully", "note_number": note.get('note_number')}


# ============ Real-time Reconciliation Status ============

@router.get("/{distributor_id}/billing/summary")
async def get_billing_summary(
    distributor_id: str,
    current_user: dict = Depends(get_current_user)
):
    """Get real-time billing summary for a distributor"""
    tenant_id = get_current_tenant_id()
    
    # Get distributor info
    distributor = await db.distributors.find_one(
        {"id": distributor_id, "tenant_id": tenant_id},
        {"_id": 0, "distributor_name": 1, "distributor_code": 1}
    )
    
    if not distributor:
        raise HTTPException(status_code=404, detail="Distributor not found")
    
    # Count billing configs
    config_count = await db.distributor_billing_config.count_documents({
        "tenant_id": tenant_id, "distributor_id": distributor_id, "status": "active"
    })
    
    # Provisional invoices summary
    invoice_pipeline = [
        {"$match": {"tenant_id": tenant_id, "distributor_id": distributor_id}},
        {"$group": {
            "_id": "$status",
            "count": {"$sum": 1},
            "total_amount": {"$sum": "$total_net_amount"}
        }}
    ]
    invoice_stats = await db.distributor_provisional_invoices.aggregate(invoice_pipeline).to_list(10)
    invoice_summary = {s['_id']: {"count": s['count'], "amount": s['total_amount']} for s in invoice_stats}
    
    # Reconciliation summary
    rec_pipeline = [
        {"$match": {"tenant_id": tenant_id, "distributor_id": distributor_id}},
        {"$group": {
            "_id": "$status",
            "count": {"$sum": 1},
            "total_difference": {"$sum": "$total_difference"}
        }}
    ]
    rec_stats = await db.distributor_reconciliations.aggregate(rec_pipeline).to_list(10)
    rec_summary = {s['_id']: {"count": s['count'], "total_difference": s['total_difference']} for s in rec_stats}
    
    # Debit/Credit notes summary
    note_pipeline = [
        {"$match": {"tenant_id": tenant_id, "distributor_id": distributor_id}},
        {"$group": {
            "_id": {"type": "$note_type", "status": "$status"},
            "count": {"$sum": 1},
            "total_amount": {"$sum": "$amount"},
            "total_balance": {"$sum": "$balance_amount"}
        }}
    ]
    note_stats = await db.distributor_debit_credit_notes.aggregate(note_pipeline).to_list(20)
    
    pending_debit = sum(s['total_balance'] for s in note_stats 
                       if s['_id']['type'] == 'debit' and s['_id']['status'] in ['pending', 'partially_paid'])
    pending_credit = sum(s['total_balance'] for s in note_stats 
                        if s['_id']['type'] == 'credit' and s['_id']['status'] in ['pending', 'partially_paid'])
    
    # Get unreconciled deliveries count
    # Find deliveries that are not in any reconciliation
    reconciled_delivery_ids = await db.distributor_reconciliation_items.distinct(
        "delivery_id", {"tenant_id": tenant_id}
    )
    unreconciled_count = await db.distributor_deliveries.count_documents({
        "tenant_id": tenant_id,
        "distributor_id": distributor_id,
        "status": "delivered",
        "id": {"$nin": reconciled_delivery_ids}
    })
    
    return {
        "distributor": distributor,
        "billing_configs": config_count,
        "provisional_invoices": invoice_summary,
        "reconciliations": rec_summary,
        "pending_debit_amount": round(pending_debit, 2),
        "pending_credit_amount": round(pending_credit, 2),
        "net_balance": round(pending_debit - pending_credit, 2),  # Positive = distributor owes
        "unreconciled_deliveries": unreconciled_count
    }
