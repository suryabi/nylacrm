"""
Target Planning Module (V2)
Provides target plans, allocations, city achievement, and dashboard analytics.
"""
from fastapi import APIRouter, HTTPException, Depends
from pydantic import BaseModel
from typing import Optional
from datetime import datetime, timezone, timedelta
import uuid

from database import db, get_tenant_db
from deps import get_current_user

router = APIRouter()


def get_tdb():
    return get_tenant_db()


# ============= Pydantic Models =============

class TargetPlanCreateV2(BaseModel):
    name: str
    start_date: str  # YYYY-MM-DD
    end_date: str    # YYYY-MM-DD
    goal_type: str = "run_rate"
    total_amount: float
    milestones: int = 4
    description: Optional[str] = None


class TargetPlanUpdateV2(BaseModel):
    name: Optional[str] = None
    start_date: Optional[str] = None
    end_date: Optional[str] = None
    goal_type: Optional[str] = None
    total_amount: Optional[float] = None
    milestones: Optional[int] = None
    description: Optional[str] = None
    status: Optional[str] = None


class TargetAllocationCreateV2(BaseModel):
    territory_id: str
    territory_name: str
    city: Optional[str] = None
    state: Optional[str] = None
    resource_id: Optional[str] = None
    resource_name: Optional[str] = None
    sku_id: Optional[str] = None
    sku_name: Optional[str] = None
    parent_allocation_id: Optional[str] = None
    level: str = 'territory'
    amount: float


class TargetAllocationUpdateV2(BaseModel):
    amount: Optional[float] = None


# Sales roles for resource filtering
SALES_ROLES_V2 = ['National Sales Head', 'Regional Sales Manager', 'Partner - Sales', 'Head of Business']


# ============= Helper =============

async def get_monthly_breakdown(plan, start_date, end_date, today):
    """Calculate monthly revenue breakdown for a target plan"""
    monthly_data = []
    current = start_date.replace(day=1)

    while current <= end_date:
        month_start = current.strftime('%Y-%m-01')
        if current.month == 12:
            next_month = current.replace(year=current.year + 1, month=1, day=1)
        else:
            next_month = current.replace(month=current.month + 1, day=1)
        month_end = (next_month - timedelta(days=1)).strftime('%Y-%m-%d')

        is_past_or_current = current <= today

        month_entry = {
            'month': current.strftime('%b %Y'),
            'month_short': current.strftime('%b'),
            'month_num': current.month,
            'year': current.year,
            'is_current': current.month == today.month and current.year == today.year,
            'is_past': current < today.replace(day=1),
            'invoice_value': 0,
            'collections': 0,
            'target': plan['total_amount']
        }

        if is_past_or_current:
            invoices = await get_tdb().invoices.find({
                'invoice_date': {'$gte': month_start, '$lte': month_end}
            }, {'_id': 0}).to_list(500)
            month_entry['invoice_value'] = sum(inv.get('total_amount', 0) or inv.get('gross_invoice_value', 0) or 0 for inv in invoices)
            month_entry['invoices_count'] = len(invoices)

            payments = await db.payments.find({
                'payment_date': {'$gte': month_start, '$lte': month_end}
            }, {'_id': 0}).to_list(500)
            month_entry['collections'] = sum(p.get('amount', 0) or 0 for p in payments)
            month_entry['payments_count'] = len(payments)

        monthly_data.append(month_entry)

        if current.month == 12:
            current = current.replace(year=current.year + 1, month=1)
        else:
            current = current.replace(month=current.month + 1)

    return monthly_data


# ============= Endpoints =============

@router.get("/target-planning")
async def get_target_planning_list(
    status: Optional[str] = None,
    current_user: dict = Depends(get_current_user)
):
    """Get all target plans with monthly revenue breakdown"""
    query = {}
    if status:
        query['status'] = status

    plans = await db.target_plans_v2.find(query, {'_id': 0}).sort('created_at', -1).to_list(100)

    for plan in plans:
        start = datetime.fromisoformat(plan['start_date'])
        end = datetime.fromisoformat(plan['end_date'])
        now = datetime.now(timezone.utc).replace(tzinfo=None)

        monthly_data = []
        current = start.replace(day=1)

        while current <= end:
            month_start = current.strftime('%Y-%m-01')
            if current.month == 12:
                next_month = current.replace(year=current.year + 1, month=1, day=1)
            else:
                next_month = current.replace(month=current.month + 1, day=1)
            month_end = (next_month - timedelta(days=1)).strftime('%Y-%m-%d')

            is_past_or_current = current <= now

            month_entry = {
                'month': current.strftime('%b %Y'),
                'month_num': current.month,
                'year': current.year,
                'is_current': current.month == now.month and current.year == now.year,
                'is_past': current < now.replace(day=1),
                'invoice_value': 0,
                'collections': 0
            }

            if is_past_or_current:
                invoices = await get_tdb().invoices.find({
                    'invoice_date': {'$gte': month_start, '$lte': month_end}
                }, {'_id': 0}).to_list(500)
                month_entry['invoice_value'] = sum(inv.get('total_amount', 0) or inv.get('gross_invoice_value', 0) or 0 for inv in invoices)

                payments = await db.payments.find({
                    'payment_date': {'$gte': month_start, '$lte': month_end}
                }, {'_id': 0}).to_list(500)
                month_entry['collections'] = sum(p.get('amount', 0) or 0 for p in payments)

            monthly_data.append(month_entry)

            if current.month == 12:
                current = current.replace(year=current.year + 1, month=1)
            else:
                current = current.replace(month=current.month + 1)

        plan['monthly_breakdown'] = monthly_data
        current_month_data = next((m for m in monthly_data if m['is_current']), None)
        plan['current_month'] = current_month_data
        plan['total_invoice_value'] = sum(m['invoice_value'] for m in monthly_data)
        plan['total_collections'] = sum(m['collections'] for m in monthly_data)

    return plans


@router.post("/target-planning")
async def create_target_planning(
    plan: TargetPlanCreateV2,
    current_user: dict = Depends(get_current_user)
):
    """Create a new target plan (v2)"""
    plan_data = {
        'id': str(uuid.uuid4()),
        'name': plan.name,
        'start_date': plan.start_date,
        'end_date': plan.end_date,
        'goal_type': plan.goal_type,
        'total_amount': plan.total_amount,
        'milestones': plan.milestones,
        'allocated_amount': 0,
        'description': plan.description,
        'status': 'draft',
        'created_by': current_user['id'],
        'created_by_name': current_user.get('name', current_user.get('email')),
        'created_at': datetime.now(timezone.utc).isoformat(),
        'updated_at': datetime.now(timezone.utc).isoformat()
    }

    await db.target_plans_v2.insert_one(plan_data)
    plan_data.pop('_id', None)
    return plan_data


@router.get("/target-planning/city-achievement")
async def get_city_achievement(
    city: str,
    start_date: str,
    end_date: str,
    current_user: dict = Depends(get_current_user)
):
    """Get achievement for a city within a date range"""
    accounts = await get_tdb().accounts.find({'city': city}, {'account_id': 1}).to_list(1000)
    account_ids = [a['account_id'] for a in accounts]

    invoices_query = {
        'account_id': {'$in': account_ids},
        'invoice_date': {'$gte': start_date, '$lte': end_date}
    }
    invoices = await get_tdb().invoices.find(invoices_query, {'_id': 0}).to_list(1000)
    achieved = sum(inv.get('total_amount', 0) or inv.get('gross_invoice_value', 0) or 0 for inv in invoices)

    won_leads = await get_tdb().leads.find({
        'city': city,
        'status': 'won',
        'updated_at': {'$gte': start_date, '$lte': end_date}
    }, {'_id': 0}).to_list(1000)
    estimated = sum(lead.get('estimated_value', 0) or 0 for lead in won_leads)

    return {
        'city': city,
        'achieved': achieved,
        'estimated': estimated,
        'invoices_count': len(invoices),
        'won_leads_count': len(won_leads)
    }


@router.get("/target-planning/resources/by-location")
async def get_resources_by_location(
    territory: Optional[str] = None,
    city: Optional[str] = None,
    current_user: dict = Depends(get_current_user)
):
    """Get sales resources filtered by territory or city"""
    query = {'is_active': True}
    query['department'] = {'$in': ['Sales', 'Admin', 'sales', 'admin']}

    if city:
        query['city'] = city
    elif territory:
        query['territory'] = territory

    users = await get_tdb().users.find(
        query,
        {'_id': 0, 'id': 1, 'name': 1, 'email': 1, 'role': 1, 'department': 1, 'city': 1, 'state': 1, 'territory': 1}
    ).to_list(200)
    return users


@router.get("/target-planning/resources/sales")
async def get_sales_resources_v2(
    current_user: dict = Depends(get_current_user)
):
    """Get all sales and admin department members for target allocation"""
    users = await get_tdb().users.find(
        {'is_active': True, 'department': {'$in': ['Sales', 'Admin', 'sales', 'admin']}},
        {'_id': 0, 'id': 1, 'name': 1, 'email': 1, 'role': 1, 'department': 1, 'city': 1, 'territory': 1}
    ).to_list(200)
    return users


@router.get("/target-planning/{plan_id}")
async def get_target_planning_detail(
    plan_id: str,
    current_user: dict = Depends(get_current_user)
):
    """Get a specific target plan with allocations"""
    plan = await db.target_plans_v2.find_one({'id': plan_id}, {'_id': 0})
    if not plan:
        raise HTTPException(status_code=404, detail="Target plan not found")

    allocations = await db.target_allocations_v2.find(
        {'plan_id': plan_id}, {'_id': 0}
    ).to_list(500)

    plan['allocations'] = allocations
    return plan


@router.put("/target-planning/{plan_id}")
async def update_target_planning(
    plan_id: str,
    plan_update: TargetPlanUpdateV2,
    current_user: dict = Depends(get_current_user)
):
    """Update a target plan"""
    existing = await db.target_plans_v2.find_one({'id': plan_id})
    if not existing:
        raise HTTPException(status_code=404, detail="Target plan not found")

    update_data = {k: v for k, v in plan_update.model_dump().items() if v is not None}
    update_data['updated_at'] = datetime.now(timezone.utc).isoformat()

    await db.target_plans_v2.update_one({'id': plan_id}, {'$set': update_data})

    updated = await db.target_plans_v2.find_one({'id': plan_id}, {'_id': 0})
    return updated


@router.delete("/target-planning/{plan_id}")
async def delete_target_planning(
    plan_id: str,
    current_user: dict = Depends(get_current_user)
):
    """Delete a target plan and its allocations"""
    existing = await db.target_plans_v2.find_one({'id': plan_id})
    if not existing:
        raise HTTPException(status_code=404, detail="Target plan not found")

    await db.target_allocations_v2.delete_many({'plan_id': plan_id})
    await db.target_plans_v2.delete_one({'id': plan_id})

    return {"message": "Target plan deleted successfully"}


@router.post("/target-planning/{plan_id}/allocations")
async def create_target_allocation_v2(
    plan_id: str,
    allocation: TargetAllocationCreateV2,
    current_user: dict = Depends(get_current_user)
):
    """Add an allocation to a target plan"""
    plan = await db.target_plans_v2.find_one({'id': plan_id})
    if not plan:
        raise HTTPException(status_code=404, detail="Target plan not found")

    level = allocation.level
    if not level or level == 'territory':
        if allocation.resource_id:
            level = 'resource'
        elif allocation.sku_id:
            level = 'sku'
        elif allocation.city:
            level = 'city'
        else:
            level = 'territory'

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
        'level': level,
        'amount': allocation.amount,
        'created_at': datetime.now(timezone.utc).isoformat()
    }

    await db.target_allocations_v2.insert_one(allocation_data)

    territory_allocations = await db.target_allocations_v2.aggregate([
        {'$match': {'plan_id': plan_id, 'level': 'territory'}},
        {'$group': {'_id': None, 'total': {'$sum': '$amount'}}}
    ]).to_list(1)

    allocated = territory_allocations[0]['total'] if territory_allocations else 0
    await db.target_plans_v2.update_one(
        {'id': plan_id},
        {'$set': {'allocated_amount': allocated, 'updated_at': datetime.now(timezone.utc).isoformat()}}
    )

    allocation_data.pop('_id', None)
    return allocation_data


@router.delete("/target-planning/{plan_id}/allocations/{allocation_id}")
async def delete_target_allocation_v2(
    plan_id: str,
    allocation_id: str,
    current_user: dict = Depends(get_current_user)
):
    """Delete an allocation and its child allocations"""
    existing = await db.target_allocations_v2.find_one({'id': allocation_id, 'plan_id': plan_id})
    if not existing:
        raise HTTPException(status_code=404, detail="Allocation not found")

    await db.target_allocations_v2.delete_many({
        '$or': [
            {'id': allocation_id},
            {'parent_allocation_id': allocation_id}
        ]
    })

    territory_allocations = await db.target_allocations_v2.aggregate([
        {'$match': {'plan_id': plan_id, 'level': 'territory'}},
        {'$group': {'_id': None, 'total': {'$sum': '$amount'}}}
    ]).to_list(1)

    allocated = territory_allocations[0]['total'] if territory_allocations else 0
    await db.target_plans_v2.update_one(
        {'id': plan_id},
        {'$set': {'allocated_amount': allocated, 'updated_at': datetime.now(timezone.utc).isoformat()}}
    )

    return {"message": "Allocation deleted successfully"}


@router.get("/target-planning/{plan_id}/allocations/{allocation_id}/children")
async def get_allocation_children(
    plan_id: str,
    allocation_id: str,
    current_user: dict = Depends(get_current_user)
):
    """Get child allocations for a parent allocation"""
    children = await db.target_allocations_v2.find(
        {'plan_id': plan_id, 'parent_allocation_id': allocation_id},
        {'_id': 0}
    ).to_list(500)
    return children


@router.put("/target-planning/{plan_id}/allocations/{allocation_id}")
async def update_target_allocation_v2(
    plan_id: str,
    allocation_id: str,
    update_data: TargetAllocationUpdateV2,
    current_user: dict = Depends(get_current_user)
):
    """Update an existing allocation amount"""
    existing = await db.target_allocations_v2.find_one({'id': allocation_id, 'plan_id': plan_id})
    if not existing:
        raise HTTPException(status_code=404, detail="Allocation not found")

    update_fields = {'updated_at': datetime.now(timezone.utc).isoformat()}
    if update_data.amount is not None:
        update_fields['amount'] = update_data.amount

    await db.target_allocations_v2.update_one(
        {'id': allocation_id},
        {'$set': update_fields}
    )

    if existing.get('level') == 'territory' or not existing.get('level'):
        territory_allocations = await db.target_allocations_v2.aggregate([
            {'$match': {'plan_id': plan_id, 'level': 'territory'}},
            {'$group': {'_id': None, 'total': {'$sum': '$amount'}}}
        ]).to_list(1)

        allocated = territory_allocations[0]['total'] if territory_allocations else 0
        await db.target_plans_v2.update_one(
            {'id': plan_id},
            {'$set': {'allocated_amount': allocated, 'updated_at': datetime.now(timezone.utc).isoformat()}}
        )

    updated = await db.target_allocations_v2.find_one({'id': allocation_id}, {'_id': 0})
    return updated


@router.get("/target-planning/{plan_id}/dashboard")
async def get_target_planning_dashboard(
    plan_id: str,
    current_user: dict = Depends(get_current_user)
):
    """Get dashboard data for a target plan"""
    plan = await db.target_plans_v2.find_one({'id': plan_id}, {'_id': 0})
    if not plan:
        raise HTTPException(status_code=404, detail="Target plan not found")

    start_date = datetime.fromisoformat(plan['start_date'])
    end_date = datetime.fromisoformat(plan['end_date'])
    today = datetime.now(timezone.utc).replace(tzinfo=None)

    total_days = (end_date - start_date).days
    days_elapsed = max(0, (today - start_date).days)
    days_remaining = max(0, (end_date - today).days)

    all_allocations = await db.target_allocations_v2.find(
        {'plan_id': plan_id}, {'_id': 0}
    ).to_list(500)

    territory_allocations = [a for a in all_allocations if a.get('level', 'territory') == 'territory']
    city_allocations = [a for a in all_allocations if a.get('level') == 'city']
    resource_allocations = [a for a in all_allocations if a.get('level') == 'resource']

    territories_with_children = []
    for t_alloc in territory_allocations:
        t_children = [c for c in city_allocations if c.get('parent_allocation_id') == t_alloc['id']]
        t_alloc['children'] = []
        t_alloc['allocated_to_children'] = 0

        for c_alloc in t_children:
            c_children = [r for r in resource_allocations if r.get('parent_allocation_id') == c_alloc['id']]
            c_alloc['children'] = c_children
            c_alloc['allocated_to_children'] = sum(r.get('amount', 0) for r in c_children)
            t_alloc['children'].append(c_alloc)
            t_alloc['allocated_to_children'] += c_alloc['amount']

        territories_with_children.append(t_alloc)

    cities = list(set(a['city'] for a in all_allocations if a.get('city')))

    won_leads_query = {
        'status': 'won',
        'updated_at': {'$gte': plan['start_date'], '$lte': plan['end_date']}
    }
    if cities:
        won_leads_query['city'] = {'$in': cities}

    won_leads = await get_tdb().leads.find(won_leads_query, {'_id': 0}).to_list(1000)
    estimated_revenue = sum(lead.get('estimated_value', 0) or 0 for lead in won_leads)

    invoices_query = {
        'invoice_date': {'$gte': plan['start_date'], '$lte': plan['end_date']}
    }
    invoices = await get_tdb().invoices.find(invoices_query, {'_id': 0}).to_list(1000)
    actual_revenue = sum(inv.get('total_amount', 0) or inv.get('gross_invoice_value', 0) or 0 for inv in invoices)

    num_milestones = plan.get('milestones', 4)
    days_per_milestone = total_days // num_milestones if num_milestones > 0 else total_days

    milestones = []
    current = start_date
    cumulative_days = 0
    target_per_milestone = plan['total_amount'] / num_milestones if num_milestones > 0 else plan['total_amount']

    for i in range(num_milestones):
        milestone_end = start_date + timedelta(days=days_per_milestone * (i + 1))
        if i == num_milestones - 1:
            milestone_end = end_date

        cumulative_days += days_per_milestone if i < num_milestones - 1 else (end_date - current).days
        milestone_date = milestone_end

        is_completed = today >= milestone_end
        is_current = not is_completed and (i == 0 or today >= start_date + timedelta(days=days_per_milestone * i))

        milestones.append({
            'milestone': i + 1,
            'days': cumulative_days,
            'date': milestone_date.strftime('%Y-%m-%d'),
            'date_label': milestone_date.strftime('%b %d'),
            'target_amount': target_per_milestone * (i + 1),
            'is_completed': is_completed,
            'is_current': is_current
        })

        current = milestone_end

    territory_breakdown = {}
    for lead in won_leads:
        territory = lead.get('territory', 'Unknown')
        if territory not in territory_breakdown:
            territory_breakdown[territory] = {'count': 0, 'value': 0}
        territory_breakdown[territory]['count'] += 1
        territory_breakdown[territory]['value'] += lead.get('estimated_value', 0) or 0

    city_breakdown = {}
    for inv in invoices:
        account_id = inv.get('account_id')
        if account_id:
            account = await get_tdb().accounts.find_one({'account_id': account_id}, {'city': 1})
            city = account.get('city', 'Unknown') if account else 'Unknown'
        else:
            city = 'Unknown'

        if city not in city_breakdown:
            city_breakdown[city] = {'count': 0, 'value': 0}
        city_breakdown[city]['count'] += 1
        city_breakdown[city]['value'] += inv.get('total_amount', 0) or inv.get('gross_invoice_value', 0) or 0

    return {
        'plan': plan,
        'timeline': {
            'total_days': total_days,
            'days_elapsed': days_elapsed,
            'days_remaining': days_remaining,
            'progress_percent': round((days_elapsed / total_days) * 100, 1) if total_days > 0 else 0,
            'milestones': milestones
        },
        'estimated_revenue': {
            'achieved': estimated_revenue,
            'remaining': max(0, plan['total_amount'] - estimated_revenue),
            'percent': round((estimated_revenue / plan['total_amount']) * 100, 1) if plan['total_amount'] > 0 else 0,
            'won_leads_count': len(won_leads),
            'territory_breakdown': territory_breakdown
        },
        'actual_revenue': {
            'achieved': actual_revenue,
            'remaining': max(0, plan['total_amount'] - actual_revenue),
            'percent': round((actual_revenue / plan['total_amount']) * 100, 1) if plan['total_amount'] > 0 else 0,
            'invoices_count': len(invoices),
            'city_breakdown': city_breakdown
        },
        'monthly_breakdown': await get_monthly_breakdown(plan, start_date, end_date, today),
        'allocations': territories_with_children,
        'all_allocations': all_allocations
    }
