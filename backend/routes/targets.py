"""
Target Planning routes - Plans, allocations, dashboard
"""
from fastapi import APIRouter, HTTPException, Depends
from typing import List, Optional
from datetime import datetime, timezone, timedelta
from pydantic import BaseModel, Field
import uuid
from dateutil.relativedelta import relativedelta

from database import db
from deps import get_current_user

router = APIRouter()

# ============= MODELS =============

class TargetPlanCreate(BaseModel):
    name: str
    start_date: str
    end_date: str
    total_amount: float
    goal_type: str = 'run_rate'  # 'run_rate' or 'cumulative'
    milestones: int = 4
    description: Optional[str] = None


class TargetPlanUpdate(BaseModel):
    name: Optional[str] = None
    start_date: Optional[str] = None
    end_date: Optional[str] = None
    total_amount: Optional[float] = None
    goal_type: Optional[str] = None
    milestones: Optional[int] = None
    description: Optional[str] = None
    status: Optional[str] = None


class AllocationCreate(BaseModel):
    territory_id: Optional[str] = None
    territory_name: Optional[str] = None
    city: Optional[str] = None
    state: Optional[str] = None
    resource_id: Optional[str] = None
    resource_name: Optional[str] = None
    sku_id: Optional[str] = None
    sku_name: Optional[str] = None
    parent_allocation_id: Optional[str] = None
    level: str = 'territory'  # 'territory', 'city', 'resource', 'sku'
    amount: float


class AllocationUpdate(BaseModel):
    amount: float


# ============= HELPER FUNCTIONS =============

def calculate_timeline_progress(start_date: str, end_date: str, milestones: int = 4):
    """Calculate timeline progress and milestone data"""
    start = datetime.strptime(start_date, '%Y-%m-%d')
    end = datetime.strptime(end_date, '%Y-%m-%d')
    today = datetime.now()
    
    total_days = (end - start).days
    days_elapsed = min(max((today - start).days, 0), total_days)
    days_remaining = max(total_days - days_elapsed, 0)
    progress_percent = round((days_elapsed / total_days * 100), 1) if total_days > 0 else 0
    
    # Calculate milestone dates
    milestone_data = []
    for i in range(1, milestones + 1):
        milestone_days = int(total_days * i / milestones)
        milestone_date = start + timedelta(days=milestone_days)
        is_completed = today >= milestone_date
        is_current = not is_completed and (i == 1 or (start + timedelta(days=int(total_days * (i-1) / milestones))) <= today)
        
        milestone_data.append({
            'milestone': i,
            'days': milestone_days,
            'date': milestone_date.strftime('%Y-%m-%d'),
            'date_label': milestone_date.strftime('%b %d'),
            'target_amount': 0,  # Will be filled by caller
            'is_completed': is_completed,
            'is_current': is_current
        })
    
    return {
        'total_days': total_days,
        'days_elapsed': days_elapsed,
        'days_remaining': days_remaining,
        'progress_percent': progress_percent,
        'milestones': milestone_data
    }


def calculate_monthly_breakdown(start_date: str, end_date: str):
    """Calculate monthly breakdown between start and end dates"""
    start = datetime.strptime(start_date, '%Y-%m-%d')
    end = datetime.strptime(end_date, '%Y-%m-%d')
    today = datetime.now()
    
    months = []
    current = start.replace(day=1)
    
    while current <= end:
        month_end = (current + relativedelta(months=1)) - timedelta(days=1)
        is_current = current.year == today.year and current.month == today.month
        is_past = current.year < today.year or (current.year == today.year and current.month < today.month)
        
        months.append({
            'month': current.strftime('%b %Y'),
            'start_date': current.strftime('%Y-%m-%d'),
            'end_date': min(month_end, end).strftime('%Y-%m-%d'),
            'is_current': is_current,
            'is_past': is_past,
            'invoice_value': 0,
            'collections': 0
        })
        
        current = current + relativedelta(months=1)
    
    return months


# ============= TARGET PLAN ROUTES =============

@router.get("")
async def get_target_plans(current_user: dict = Depends(get_current_user)):
    """Get all target plans"""
    plans = await db.target_plans_v2.find({}, {'_id': 0}).sort('created_at', -1).to_list(100)
    
    # Add computed fields
    for plan in plans:
        timeline = calculate_timeline_progress(
            plan['start_date'], 
            plan['end_date'], 
            plan.get('milestones', 4)
        )
        plan['time_elapsed_percent'] = timeline['progress_percent']
        
        # Get allocation summary
        allocations = await db.target_allocations_v2.find(
            {'plan_id': plan['id'], 'level': 'territory'},
            {'_id': 0, 'amount': 1}
        ).to_list(100)
        plan['allocated_amount'] = sum(a.get('amount', 0) for a in allocations)
        plan['allocated_percent'] = round((plan['allocated_amount'] / plan['total_amount'] * 100), 1) if plan['total_amount'] > 0 else 0
    
    return plans


@router.post("")
async def create_target_plan(plan: TargetPlanCreate, current_user: dict = Depends(get_current_user)):
    """Create a new target plan"""
    plan_data = {
        'id': str(uuid.uuid4()),
        'name': plan.name,
        'start_date': plan.start_date,
        'end_date': plan.end_date,
        'total_amount': plan.total_amount,
        'goal_type': plan.goal_type,
        'milestones': plan.milestones,
        'description': plan.description,
        'status': 'draft',
        'created_by': current_user['id'],
        'created_at': datetime.now(timezone.utc).isoformat(),
        'updated_at': datetime.now(timezone.utc).isoformat()
    }
    
    await db.target_plans_v2.insert_one(plan_data)
    
    return plan_data


@router.get("/city-achievement")
async def get_city_achievement(
    city: str,
    start_date: str,
    end_date: str,
    current_user: dict = Depends(get_current_user)
):
    """Get achieved revenue for a city within a date range"""
    # Sum invoice values for leads in this city within the date range
    pipeline = [
        {
            '$lookup': {
                'from': 'leads',
                'localField': 'ca_lead_id',
                'foreignField': 'lead_id',
                'as': 'lead'
            }
        },
        {'$unwind': {'path': '$lead', 'preserveNullAndEmptyArrays': False}},
        {
            '$match': {
                'lead.city': city,
                'invoice_date': {'$gte': start_date, '$lte': end_date}
            }
        },
        {
            '$group': {
                '_id': None,
                'achieved': {'$sum': '$net_invoice_value'}
            }
        }
    ]
    
    result = await db.invoices.aggregate(pipeline).to_list(1)
    achieved = result[0]['achieved'] if result else 0
    
    return {'city': city, 'achieved': achieved}


@router.get("/achievement")
async def get_achievement(
    start_date: str,
    end_date: str,
    resource_id: Optional[str] = None,
    sku_id: Optional[str] = None,
    city: Optional[str] = None,
    current_user: dict = Depends(get_current_user)
):
    """Get achieved revenue filtered by resource (sales person) or SKU within a date range"""
    
    pipeline = []
    
    if resource_id:
        # Get achievement by sales person - match leads assigned to this resource
        pipeline = [
            {
                '$lookup': {
                    'from': 'leads',
                    'localField': 'ca_lead_id',
                    'foreignField': 'lead_id',
                    'as': 'lead'
                }
            },
            {'$unwind': {'path': '$lead', 'preserveNullAndEmptyArrays': False}},
            {
                '$match': {
                    'lead.assigned_to': resource_id,
                    'invoice_date': {'$gte': start_date, '$lte': end_date},
                    **(({'lead.city': city} if city else {}))
                }
            },
            {
                '$group': {
                    '_id': None,
                    'achieved': {'$sum': '$net_invoice_value'}
                }
            }
        ]
    elif sku_id:
        # Get achievement by SKU - sum invoice line items for this SKU
        # First check invoice_items for SKU-level tracking, or use estimates
        pipeline = [
            {
                '$match': {
                    'invoice_date': {'$gte': start_date, '$lte': end_date}
                }
            },
            {'$unwind': {'path': '$items', 'preserveNullAndEmptyArrays': True}},
            {
                '$match': {
                    '$or': [
                        {'items.sku_id': sku_id},
                        {'items.sku': sku_id}
                    ]
                }
            },
            {
                '$group': {
                    '_id': None,
                    'achieved': {'$sum': {'$ifNull': ['$items.amount', '$items.value', 0]}}
                }
            }
        ]
        
        # If no SKU-level data, return 0 for now
        result = await db.invoices.aggregate(pipeline).to_list(1)
        if not result:
            # Fallback: estimate based on total invoices (placeholder)
            return {'achieved': 0, 'note': 'SKU-level tracking not available'}
    else:
        return {'achieved': 0, 'error': 'Either resource_id or sku_id is required'}
    
    result = await db.invoices.aggregate(pipeline).to_list(1)
    achieved = result[0]['achieved'] if result else 0
    
    return {'achieved': achieved}


@router.get("/resources/by-location")
async def get_resources_by_location(
    city: Optional[str] = None,
    territory: Optional[str] = None,
    current_user: dict = Depends(get_current_user)
):
    """Get sales resources filtered by city or territory"""
    query = {'is_active': True}
    
    if city:
        query['city'] = city
    if territory:
        query['territory'] = territory
    
    # Filter for sales roles
    sales_roles = ['Business Development Executive', 'Regional Sales Manager', 'Partner - Sales', 
                   'National Sales Head', 'Head of Business']
    query['role'] = {'$in': sales_roles}
    
    users = await db.users.find(query, {'_id': 0, 'password': 0}).to_list(100)
    
    return users


@router.get("/resources/sales")
async def get_sales_resources(current_user: dict = Depends(get_current_user)):
    """Get all sales resources"""
    sales_roles = ['Business Development Executive', 'Regional Sales Manager', 'Partner - Sales',
                   'National Sales Head', 'Head of Business', 'CEO', 'Director', 'Vice President']
    
    users = await db.users.find(
        {'is_active': True, 'role': {'$in': sales_roles}},
        {'_id': 0, 'password': 0}
    ).to_list(100)
    
    return users


@router.get("/{plan_id}")
async def get_target_plan(plan_id: str, current_user: dict = Depends(get_current_user)):
    """Get a single target plan with allocations"""
    plan = await db.target_plans_v2.find_one({'id': plan_id}, {'_id': 0})
    if not plan:
        raise HTTPException(status_code=404, detail='Target plan not found')
    
    # Get territory-level allocations
    allocations = await db.target_allocations_v2.find(
        {'plan_id': plan_id, 'level': 'territory'},
        {'_id': 0}
    ).to_list(100)
    
    # For each territory, get city children
    for alloc in allocations:
        children = await db.target_allocations_v2.find(
            {'plan_id': plan_id, 'parent_allocation_id': alloc['id']},
            {'_id': 0}
        ).to_list(100)
        alloc['children'] = children
        alloc['allocated_to_children'] = sum(c.get('amount', 0) for c in children)
    
    plan['allocations'] = allocations
    
    return plan


@router.put("/{plan_id}")
async def update_target_plan(plan_id: str, update: TargetPlanUpdate, current_user: dict = Depends(get_current_user)):
    """Update a target plan"""
    existing = await db.target_plans_v2.find_one({'id': plan_id}, {'_id': 0})
    if not existing:
        raise HTTPException(status_code=404, detail='Target plan not found')
    
    update_data = {k: v for k, v in update.model_dump().items() if v is not None}
    update_data['updated_at'] = datetime.now(timezone.utc).isoformat()
    
    await db.target_plans_v2.update_one({'id': plan_id}, {'$set': update_data})
    
    return await db.target_plans_v2.find_one({'id': plan_id}, {'_id': 0})


@router.delete("/{plan_id}")
async def delete_target_plan(plan_id: str, current_user: dict = Depends(get_current_user)):
    """Delete a target plan and its allocations"""
    result = await db.target_plans_v2.delete_one({'id': plan_id})
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail='Target plan not found')
    
    # Delete all allocations
    await db.target_allocations_v2.delete_many({'plan_id': plan_id})
    
    return {'message': 'Target plan deleted successfully'}


# ============= ALLOCATION ROUTES =============

@router.post("/{plan_id}/allocations")
async def create_allocation(plan_id: str, allocation: AllocationCreate, current_user: dict = Depends(get_current_user)):
    """Create a new allocation for a target plan"""
    print(f"Creating allocation with level: {allocation.level}, sku_id: {allocation.sku_id}, sku_name: {allocation.sku_name}")
    
    plan = await db.target_plans_v2.find_one({'id': plan_id}, {'_id': 0})
    if not plan:
        raise HTTPException(status_code=404, detail='Target plan not found')
    
    allocation_data = {
        'id': str(uuid.uuid4()),
        'plan_id': plan_id,
        'territory_id': allocation.territory_id,
        'territory_name': allocation.territory_name,
        'city': allocation.city,
        'state': allocation.state,
        'resource_id': allocation.resource_id,
        'resource_name': allocation.resource_name,
        'sku_id': allocation.sku_id,
        'sku_name': allocation.sku_name,
        'parent_allocation_id': allocation.parent_allocation_id,
        'level': allocation.level,
        'amount': allocation.amount,
        'created_by': current_user['id'],
        'created_at': datetime.now(timezone.utc).isoformat()
    }
    
    await db.target_allocations_v2.insert_one(allocation_data)
    
    return allocation_data


@router.put("/{plan_id}/allocations/{allocation_id}")
async def update_allocation(plan_id: str, allocation_id: str, update: AllocationUpdate, current_user: dict = Depends(get_current_user)):
    """Update an allocation amount"""
    existing = await db.target_allocations_v2.find_one({'id': allocation_id, 'plan_id': plan_id}, {'_id': 0})
    if not existing:
        raise HTTPException(status_code=404, detail='Allocation not found')
    
    await db.target_allocations_v2.update_one(
        {'id': allocation_id},
        {'$set': {'amount': update.amount, 'updated_at': datetime.now(timezone.utc).isoformat()}}
    )
    
    return await db.target_allocations_v2.find_one({'id': allocation_id}, {'_id': 0})


@router.delete("/{plan_id}/allocations/{allocation_id}")
async def delete_allocation(plan_id: str, allocation_id: str, current_user: dict = Depends(get_current_user)):
    """Delete an allocation and its children"""
    existing = await db.target_allocations_v2.find_one({'id': allocation_id, 'plan_id': plan_id}, {'_id': 0})
    if not existing:
        raise HTTPException(status_code=404, detail='Allocation not found')
    
    # Delete children first (cascade)
    await db.target_allocations_v2.delete_many({'parent_allocation_id': allocation_id})
    
    # Delete the allocation
    await db.target_allocations_v2.delete_one({'id': allocation_id})
    
    return {'message': 'Allocation deleted successfully'}


@router.get("/{plan_id}/allocations/{allocation_id}/children")
async def get_allocation_children(plan_id: str, allocation_id: str, current_user: dict = Depends(get_current_user)):
    """Get child allocations for a parent allocation"""
    children = await db.target_allocations_v2.find(
        {'plan_id': plan_id, 'parent_allocation_id': allocation_id},
        {'_id': 0}
    ).to_list(100)
    
    return children


# ============= DASHBOARD ROUTE =============

@router.get("/{plan_id}/dashboard")
async def get_target_plan_dashboard(plan_id: str, current_user: dict = Depends(get_current_user)):
    """Get comprehensive dashboard data for a target plan"""
    plan = await db.target_plans_v2.find_one({'id': plan_id}, {'_id': 0})
    if not plan:
        raise HTTPException(status_code=404, detail='Target plan not found')
    
    # Timeline progress
    timeline = calculate_timeline_progress(
        plan['start_date'],
        plan['end_date'],
        plan.get('milestones', 4)
    )
    
    # Update milestone targets
    target = plan['total_amount']
    for i, ms in enumerate(timeline['milestones']):
        ms['target_amount'] = int(target * (i + 1) / len(timeline['milestones']))
    
    # Get allocations with children
    allocations = await db.target_allocations_v2.find(
        {'plan_id': plan_id, 'level': 'territory'},
        {'_id': 0}
    ).to_list(100)
    
    for alloc in allocations:
        children = await db.target_allocations_v2.find(
            {'plan_id': plan_id, 'parent_allocation_id': alloc['id']},
            {'_id': 0}
        ).to_list(100)
        alloc['children'] = children
        alloc['allocated_to_children'] = sum(c.get('amount', 0) for c in children)
    
    # Monthly breakdown
    monthly_breakdown = calculate_monthly_breakdown(plan['start_date'], plan['end_date'])
    
    # Get invoice data for each month (simplified - would need actual implementation)
    for month in monthly_breakdown:
        if month['is_past'] or month['is_current']:
            # Query invoices for this month
            invoices = await db.invoices.find({
                'invoice_date': {'$gte': month['start_date'], '$lte': month['end_date']}
            }, {'_id': 0, 'net_invoice_value': 1}).to_list(1000)
            month['invoice_value'] = sum(inv.get('net_invoice_value', 0) for inv in invoices)
    
    # Estimated revenue from customers on-boarded
    # Criteria: Leads that were set to WON within the target period AND
    # either stayed in WON status OR progressed to active Customer (converted to account)
    onboarded_leads = await db.leads.find({
        '$and': [
            # Lead was updated (status changed) within the target period
            {'updated_at': {'$gte': plan['start_date'], '$lte': plan['end_date']}},
            # Either still in WON status OR converted to account (active customer)
            {'$or': [
                {'status': 'won'},
                {'converted_to_account': True}
            ]}
        ]
    }, {'_id': 0, 'estimated_value': 1, 'status': 1, 'converted_to_account': 1}).to_list(1000)
    
    estimated_achieved = sum(lead.get('estimated_value', 0) or 0 for lead in onboarded_leads)
    estimated_revenue = {
        'achieved': estimated_achieved,
        'remaining': max(target - estimated_achieved, 0),
        'percent': round((estimated_achieved / target * 100), 1) if target > 0 else 0,
        'won_leads_count': len(onboarded_leads)
    }
    
    # Actual revenue (from invoices)
    invoices = await db.invoices.find({
        'invoice_date': {'$gte': plan['start_date'], '$lte': plan['end_date']}
    }, {'_id': 0, 'net_invoice_value': 1}).to_list(1000)
    
    actual_achieved = sum(inv.get('net_invoice_value', 0) for inv in invoices)
    actual_revenue = {
        'achieved': actual_achieved,
        'remaining': max(target - actual_achieved, 0),
        'percent': round((actual_achieved / target * 100), 1) if target > 0 else 0,
        'invoices_count': len(invoices)
    }
    
    return {
        'plan': plan,
        'timeline': timeline,
        'allocations': allocations,
        'monthly_breakdown': monthly_breakdown,
        'estimated_revenue': estimated_revenue,
        'actual_revenue': actual_revenue
    }
