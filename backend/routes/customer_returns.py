"""
Customer Returns Routes
Track customer returns to distributors with credit calculation
"""
from fastapi import APIRouter, Depends, HTTPException, Query
from typing import Optional, List
from datetime import datetime, timezone
import uuid
import logging

from database import db
from deps import get_current_user
from core.tenant import get_current_tenant_id
from models.customer_return import (
    CustomerReturn, CustomerReturnItem, 
    CustomerReturnCreate, CustomerReturnUpdate,
    FactoryReturnUpdate
)

router = APIRouter(tags=["Customer Returns"])
logger = logging.getLogger(__name__)


async def generate_return_number(tenant_id: str) -> str:
    """Generate unique return number"""
    year = datetime.now().year
    
    # Find the highest return number for this year
    latest = await db.customer_returns.find_one(
        {"tenant_id": tenant_id, "return_number": {"$regex": f"^RET-{year}-"}},
        sort=[("return_number", -1)]
    )
    
    if latest:
        try:
            last_num = int(latest["return_number"].split("-")[-1])
            new_num = last_num + 1
        except (ValueError, IndexError):
            new_num = 1
    else:
        new_num = 1
    
    return f"RET-{year}-{new_num:04d}"


async def calculate_item_credit(
    item: dict,
    reason: dict,
    account_sku_pricing: dict = None
) -> dict:
    """Calculate credit for a return item based on reason type"""
    quantity = item.get('quantity', 0)
    unit_price = item.get('unit_price', 0)
    
    credit_type = reason.get('credit_type', 'no_credit')
    credit_percentage = reason.get('credit_percentage')
    
    # Get return credit from account SKU pricing if available
    return_credit_per_unit = 0
    if account_sku_pricing:
        return_credit_per_unit = account_sku_pricing.get('return_credit_per_unit', 0)
    
    # Calculate credit based on type
    if credit_type == 'sku_return_credit':
        # Use return_credit_per_unit from account SKU pricing
        credit_per_unit = return_credit_per_unit
    elif credit_type == 'full_price':
        # Full selling price refund
        credit_per_unit = unit_price
    elif credit_type == 'percentage':
        # Percentage of selling price
        pct = credit_percentage or 0
        credit_per_unit = unit_price * (pct / 100)
    else:  # no_credit
        credit_per_unit = 0
    
    total_credit = quantity * credit_per_unit
    
    return {
        'credit_type': credit_type,
        'credit_percentage': credit_percentage,
        'return_credit_per_unit': return_credit_per_unit,
        'credit_per_unit': round(credit_per_unit, 2),
        'total_credit': round(total_credit, 2)
    }


@router.get("/{distributor_id}/returns")
async def list_customer_returns(
    distributor_id: str,
    status: Optional[str] = Query(None, description="Filter by status"),
    account_id: Optional[str] = Query(None, description="Filter by account"),
    from_date: Optional[str] = Query(None, description="Filter from date"),
    to_date: Optional[str] = Query(None, description="Filter to date"),
    current_user: dict = Depends(get_current_user)
):
    """List all customer returns for a distributor"""
    tenant_id = get_current_tenant_id()
    
    query = {"tenant_id": tenant_id, "distributor_id": distributor_id}
    
    if status:
        query["status"] = status
    
    if account_id:
        query["account_id"] = account_id
    
    if from_date:
        query["return_date"] = {"$gte": from_date}
    
    if to_date:
        if "return_date" in query:
            query["return_date"]["$lte"] = to_date
        else:
            query["return_date"] = {"$lte": to_date}
    
    returns = await db.customer_returns.find(
        query,
        {"_id": 0}
    ).sort("created_at", -1).to_list(500)
    
    # Calculate summary
    total_quantity = sum(r.get('total_quantity', 0) for r in returns)
    total_credit = sum(r.get('total_credit', 0) for r in returns)
    
    # Group by category for factory return tracking
    category_summary = {}
    for ret in returns:
        for item in ret.get('items', []):
            cat = item.get('reason_category', 'other')
            if cat not in category_summary:
                category_summary[cat] = {
                    'category': cat,
                    'total_quantity': 0,
                    'pending_factory_return': 0,
                    'completed_factory_return': 0
                }
            category_summary[cat]['total_quantity'] += item.get('quantity', 0)
            if item.get('return_to_factory', False):
                if item.get('returned_to_factory', False):
                    category_summary[cat]['completed_factory_return'] += item.get('quantity', 0)
                else:
                    category_summary[cat]['pending_factory_return'] += item.get('quantity', 0)
    
    return {
        "returns": returns,
        "total": len(returns),
        "summary": {
            "total_quantity": total_quantity,
            "total_credit": round(total_credit, 2),
            "by_category": list(category_summary.values())
        }
    }


@router.get("/{distributor_id}/returns/{return_id}")
async def get_customer_return(
    distributor_id: str,
    return_id: str,
    current_user: dict = Depends(get_current_user)
):
    """Get a specific customer return"""
    tenant_id = get_current_tenant_id()
    
    ret = await db.customer_returns.find_one(
        {"id": return_id, "tenant_id": tenant_id, "distributor_id": distributor_id},
        {"_id": 0}
    )
    
    if not ret:
        raise HTTPException(status_code=404, detail="Return not found")
    
    return ret


@router.post("/{distributor_id}/returns")
async def create_customer_return(
    distributor_id: str,
    data: CustomerReturnCreate,
    current_user: dict = Depends(get_current_user)
):
    """Create a new customer return"""
    tenant_id = get_current_tenant_id()
    
    # Verify distributor exists
    distributor = await db.distributors.find_one(
        {"id": distributor_id, "tenant_id": tenant_id}
    )
    if not distributor:
        raise HTTPException(status_code=404, detail="Distributor not found")
    
    # Get account details
    account = await db.accounts.find_one(
        {"id": data.account_id, "tenant_id": tenant_id}
    )
    if not account:
        raise HTTPException(status_code=404, detail="Account not found")
    
    # Generate return number
    return_number = await generate_return_number(tenant_id)
    
    # Process items
    processed_items = []
    total_quantity = 0
    total_credit = 0
    factory_return_pending = 0
    
    for item_data in data.items:
        # Get SKU details - check master_skus (global catalog)
        sku = await db.master_skus.find_one({"id": item_data.sku_id})
        if not sku:
            raise HTTPException(status_code=404, detail=f"SKU {item_data.sku_id} not found")
        
        # Get return reason
        reason = await db.return_reasons.find_one(
            {"id": item_data.reason_id, "tenant_id": tenant_id, "is_active": True}
        )
        if not reason:
            raise HTTPException(status_code=404, detail=f"Return reason {item_data.reason_id} not found or inactive")
        
        # Get account SKU pricing for return credit
        account_sku = await db.account_sku_pricing.find_one({
            "tenant_id": tenant_id,
            "account_id": data.account_id,
            "sku_id": item_data.sku_id
        })
        
        # Get unit price - from input, account pricing, or SKU default
        unit_price = item_data.unit_price
        if not unit_price:
            if account_sku:
                unit_price = account_sku.get('selling_price', 0)
            else:
                unit_price = sku.get('mrp', 0)
        
        base_price = sku.get('base_price', 0) or sku.get('transfer_price', 0)
        
        # Calculate credit
        credit_info = await calculate_item_credit(
            {'quantity': item_data.quantity, 'unit_price': unit_price, 'base_price': base_price},
            reason,
            account_sku
        )
        
        # Create item
        item = CustomerReturnItem(
            sku_id=item_data.sku_id,
            sku_code=sku.get('sku_code'),
            sku_name=sku.get('name'),
            hsn_code=sku.get('hsn_code'),
            quantity=item_data.quantity,
            reason_id=item_data.reason_id,
            reason_code=reason.get('reason_code'),
            reason_name=reason.get('reason_name'),
            reason_category=reason.get('category'),
            unit_price=unit_price,
            base_price=base_price,
            return_credit_per_unit=credit_info['return_credit_per_unit'],
            credit_type=credit_info['credit_type'],
            credit_percentage=credit_info['credit_percentage'],
            credit_per_unit=credit_info['credit_per_unit'],
            total_credit=credit_info['total_credit'],
            return_to_factory=reason.get('return_to_factory', True),
            requires_inspection=reason.get('requires_inspection', False),
            inspection_status='pending' if reason.get('requires_inspection') else None
        )
        
        processed_items.append(item.model_dump())
        total_quantity += item_data.quantity
        total_credit += credit_info['total_credit']
        
        if reason.get('return_to_factory', True):
            factory_return_pending += item_data.quantity
    
    # Create return record
    customer_return = CustomerReturn(
        tenant_id=tenant_id,
        distributor_id=distributor_id,
        return_number=return_number,
        account_id=data.account_id,
        account_name=account.get('account_name') or account.get('name'),
        account_city=account.get('city'),
        return_date=data.return_date or datetime.now(timezone.utc).strftime('%Y-%m-%d'),
        received_by=current_user.get('name') or current_user.get('email'),
        items=processed_items,
        total_quantity=total_quantity,
        total_credit=round(total_credit, 2),
        factory_return_pending=factory_return_pending,
        notes=data.notes,
        created_by=current_user.get('id')
    )
    
    await db.customer_returns.insert_one(customer_return.model_dump())
    
    logger.info(f"Created customer return {return_number} for distributor {distributor_id}")
    
    return {
        "message": "Customer return created",
        "return": customer_return.model_dump()
    }


@router.put("/{distributor_id}/returns/{return_id}")
async def update_customer_return(
    distributor_id: str,
    return_id: str,
    data: CustomerReturnUpdate,
    current_user: dict = Depends(get_current_user)
):
    """Update a customer return (only draft status)"""
    tenant_id = get_current_tenant_id()
    
    ret = await db.customer_returns.find_one(
        {"id": return_id, "tenant_id": tenant_id, "distributor_id": distributor_id}
    )
    
    if not ret:
        raise HTTPException(status_code=404, detail="Return not found")
    
    if ret.get('status') not in ['draft']:
        raise HTTPException(status_code=400, detail="Can only update draft returns")
    
    update_data = {"updated_at": datetime.now(timezone.utc).isoformat()}
    
    if data.return_date:
        update_data["return_date"] = data.return_date
    
    if data.notes is not None:
        update_data["notes"] = data.notes
    
    if data.status:
        if data.status not in ['draft', 'confirmed', 'cancelled']:
            raise HTTPException(status_code=400, detail="Invalid status")
        update_data["status"] = data.status
    
    await db.customer_returns.update_one(
        {"id": return_id, "tenant_id": tenant_id},
        {"$set": update_data}
    )
    
    updated = await db.customer_returns.find_one(
        {"id": return_id, "tenant_id": tenant_id},
        {"_id": 0}
    )
    
    return {"message": "Return updated", "return": updated}


@router.post("/{distributor_id}/returns/{return_id}/confirm")
async def confirm_customer_return(
    distributor_id: str,
    return_id: str,
    current_user: dict = Depends(get_current_user)
):
    """Confirm a customer return"""
    tenant_id = get_current_tenant_id()
    
    ret = await db.customer_returns.find_one(
        {"id": return_id, "tenant_id": tenant_id, "distributor_id": distributor_id}
    )
    
    if not ret:
        raise HTTPException(status_code=404, detail="Return not found")
    
    if ret.get('status') != 'draft':
        raise HTTPException(status_code=400, detail="Can only confirm draft returns")
    
    await db.customer_returns.update_one(
        {"id": return_id, "tenant_id": tenant_id},
        {"$set": {
            "status": "confirmed",
            "updated_at": datetime.now(timezone.utc).isoformat()
        }}
    )
    
    logger.info(f"Confirmed customer return {ret['return_number']}")
    
    return {"message": "Return confirmed", "status": "confirmed"}


@router.post("/{distributor_id}/returns/{return_id}/cancel")
async def cancel_customer_return(
    distributor_id: str,
    return_id: str,
    current_user: dict = Depends(get_current_user)
):
    """Cancel a customer return"""
    tenant_id = get_current_tenant_id()
    
    ret = await db.customer_returns.find_one(
        {"id": return_id, "tenant_id": tenant_id, "distributor_id": distributor_id}
    )
    
    if not ret:
        raise HTTPException(status_code=404, detail="Return not found")
    
    if ret.get('status') in ['settled', 'cancelled']:
        raise HTTPException(status_code=400, detail="Cannot cancel settled or already cancelled returns")
    
    await db.customer_returns.update_one(
        {"id": return_id, "tenant_id": tenant_id},
        {"$set": {
            "status": "cancelled",
            "updated_at": datetime.now(timezone.utc).isoformat()
        }}
    )
    
    logger.info(f"Cancelled customer return {ret['return_number']}")
    
    return {"message": "Return cancelled", "status": "cancelled"}


@router.post("/{distributor_id}/returns/{return_id}/factory-return")
async def mark_factory_return(
    distributor_id: str,
    return_id: str,
    data: FactoryReturnUpdate,
    current_user: dict = Depends(get_current_user)
):
    """Mark items as returned to factory"""
    tenant_id = get_current_tenant_id()
    
    ret = await db.customer_returns.find_one(
        {"id": return_id, "tenant_id": tenant_id, "distributor_id": distributor_id}
    )
    
    if not ret:
        raise HTTPException(status_code=404, detail="Return not found")
    
    if ret.get('status') not in ['confirmed', 'processed']:
        raise HTTPException(status_code=400, detail="Can only mark factory return for confirmed/processed returns")
    
    return_date = data.return_date or datetime.now(timezone.utc).strftime('%Y-%m-%d')
    
    # Update items
    items = ret.get('items', [])
    updated_count = 0
    factory_return_completed = ret.get('factory_return_completed', 0)
    factory_return_pending = ret.get('factory_return_pending', 0)
    
    for item in items:
        if item.get('id') in data.item_ids and not item.get('returned_to_factory'):
            item['returned_to_factory'] = True
            item['factory_return_date'] = return_date
            updated_count += 1
            qty = item.get('quantity', 0)
            factory_return_completed += qty
            factory_return_pending -= qty
    
    await db.customer_returns.update_one(
        {"id": return_id, "tenant_id": tenant_id},
        {"$set": {
            "items": items,
            "factory_return_completed": factory_return_completed,
            "factory_return_pending": max(0, factory_return_pending),
            "updated_at": datetime.now(timezone.utc).isoformat()
        }}
    )
    
    logger.info(f"Marked {updated_count} items as returned to factory for {ret['return_number']}")
    
    return {
        "message": f"Marked {updated_count} items as returned to factory",
        "factory_return_completed": factory_return_completed,
        "factory_return_pending": max(0, factory_return_pending)
    }


@router.delete("/{distributor_id}/returns/{return_id}")
async def delete_customer_return(
    distributor_id: str,
    return_id: str,
    current_user: dict = Depends(get_current_user)
):
    """Delete a customer return (draft only)"""
    tenant_id = get_current_tenant_id()
    
    ret = await db.customer_returns.find_one(
        {"id": return_id, "tenant_id": tenant_id, "distributor_id": distributor_id}
    )
    
    if not ret:
        raise HTTPException(status_code=404, detail="Return not found")
    
    if ret.get('status') != 'draft':
        raise HTTPException(status_code=400, detail="Can only delete draft returns")
    
    await db.customer_returns.delete_one({"id": return_id, "tenant_id": tenant_id})
    
    logger.info(f"Deleted customer return {ret['return_number']}")
    
    return {"message": "Return deleted"}


@router.get("/{distributor_id}/returns-summary")
async def get_returns_summary(
    distributor_id: str,
    current_user: dict = Depends(get_current_user)
):
    """Get returns summary for a distributor"""
    tenant_id = get_current_tenant_id()
    
    # Aggregate returns by status
    pipeline = [
        {"$match": {"tenant_id": tenant_id, "distributor_id": distributor_id}},
        {"$group": {
            "_id": "$status",
            "count": {"$sum": 1},
            "total_quantity": {"$sum": "$total_quantity"},
            "total_credit": {"$sum": "$total_credit"}
        }}
    ]
    
    status_summary = await db.customer_returns.aggregate(pipeline).to_list(10)
    
    # Aggregate by category
    all_returns = await db.customer_returns.find(
        {"tenant_id": tenant_id, "distributor_id": distributor_id, "status": {"$ne": "cancelled"}},
        {"items": 1}
    ).to_list(1000)
    
    category_summary = {}
    for ret in all_returns:
        for item in ret.get('items', []):
            cat = item.get('reason_category', 'other')
            if cat not in category_summary:
                category_summary[cat] = {
                    'category': cat,
                    'total_quantity': 0,
                    'total_credit': 0,
                    'pending_factory_return': 0,
                    'completed_factory_return': 0
                }
            qty = item.get('quantity', 0)
            category_summary[cat]['total_quantity'] += qty
            category_summary[cat]['total_credit'] += item.get('total_credit', 0)
            
            if item.get('return_to_factory', False):
                if item.get('returned_to_factory', False):
                    category_summary[cat]['completed_factory_return'] += qty
                else:
                    category_summary[cat]['pending_factory_return'] += qty
    
    return {
        "by_status": {s['_id']: s for s in status_summary},
        "by_category": list(category_summary.values())
    }
