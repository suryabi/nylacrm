"""
Requests routes - Leave, Travel, Budget, and Expense requests
Multi-tenant aware - all queries automatically filter by tenant_id
"""
from fastapi import APIRouter, HTTPException, Depends
from typing import List, Optional
from datetime import datetime, timezone
from pydantic import BaseModel, Field
import uuid

from database import get_tenant_db
from deps import get_current_user

router = APIRouter()

def get_tdb():
    """Get tenant-aware database wrapper"""
    return get_tenant_db()

# ============= LEAVE REQUEST MODELS =============

class LeaveRequest(BaseModel):
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    user_id: str
    leave_type: str
    start_date: str
    end_date: str
    reason: str
    status: str = 'pending'
    approved_by: Optional[str] = None
    approved_at: Optional[str] = None
    rejection_reason: Optional[str] = None
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))

    class Config:
        extra = "ignore"


class LeaveRequestCreate(BaseModel):
    leave_type: str
    start_date: str
    end_date: str
    reason: str


# ============= TRAVEL REQUEST MODELS =============

class TravelRequest(BaseModel):
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    user_id: str
    user_name: Optional[str] = None
    purpose: str
    purpose_category: Optional[str] = None
    start_date: str
    end_date: str
    from_location: str
    to_location: str
    travel_mode: Optional[str] = None
    estimated_cost: float = 0
    status: str = 'pending'
    approved_by: Optional[str] = None
    approved_at: Optional[str] = None
    approver_comments: Optional[str] = None
    leads: List[str] = []
    accounts: List[str] = []
    notes: Optional[str] = None
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    updated_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))

    class Config:
        extra = "allow"


class TravelRequestCreate(BaseModel):
    purpose: str
    purpose_category: Optional[str] = None
    start_date: str
    end_date: str
    from_location: str
    to_location: str
    travel_mode: Optional[str] = None
    estimated_cost: float = 0
    leads: List[str] = []
    accounts: List[str] = []
    notes: Optional[str] = None


class TravelRequestUpdate(BaseModel):
    purpose: Optional[str] = None
    purpose_category: Optional[str] = None
    start_date: Optional[str] = None
    end_date: Optional[str] = None
    from_location: Optional[str] = None
    to_location: Optional[str] = None
    travel_mode: Optional[str] = None
    estimated_cost: Optional[float] = None
    leads: Optional[List[str]] = None
    accounts: Optional[List[str]] = None
    notes: Optional[str] = None


# ============= BUDGET REQUEST MODELS =============

class BudgetRequest(BaseModel):
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    user_id: str
    user_name: Optional[str] = None
    category: str
    amount: float
    description: str
    justification: Optional[str] = None
    status: str = 'pending'
    approved_by: Optional[str] = None
    approved_at: Optional[str] = None
    approver_comments: Optional[str] = None
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    updated_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))

    class Config:
        extra = "allow"


class BudgetRequestCreate(BaseModel):
    category: str
    amount: float
    description: str
    justification: Optional[str] = None


class BudgetRequestUpdate(BaseModel):
    category: Optional[str] = None
    amount: Optional[float] = None
    description: Optional[str] = None
    justification: Optional[str] = None


# ============= EXPENSE REQUEST MODELS =============

class ExpenseLineItem(BaseModel):
    expense_type: str
    amount: float
    description: Optional[str] = None
    receipt_url: Optional[str] = None


class ExpenseRequest(BaseModel):
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    user_id: str
    user_name: Optional[str] = None
    title: str
    line_items: List[ExpenseLineItem] = []
    total_amount: float = 0
    status: str = 'pending'
    travel_request_id: Optional[str] = None
    approved_by: Optional[str] = None
    approved_at: Optional[str] = None
    approver_comments: Optional[str] = None
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    updated_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))

    class Config:
        extra = "allow"


class ExpenseRequestCreate(BaseModel):
    title: str
    line_items: List[ExpenseLineItem] = []
    travel_request_id: Optional[str] = None


class ExpenseRequestUpdate(BaseModel):
    title: Optional[str] = None
    line_items: Optional[List[ExpenseLineItem]] = None
    travel_request_id: Optional[str] = None


# ============= LEAVE REQUEST ROUTES =============

@router.post("/leave-requests", response_model=LeaveRequest)
async def create_leave_request(request: LeaveRequestCreate, current_user: dict = Depends(get_current_user)):
    """Create a new leave request"""
    request_data = {
        'id': str(uuid.uuid4()),
        'user_id': current_user['id'],
        'user_name': current_user.get('name'),
        'leave_type': request.leave_type,
        'start_date': request.start_date,
        'end_date': request.end_date,
        'reason': request.reason,
        'status': 'pending',
        'created_at': datetime.now(timezone.utc).isoformat()
    }
    
    await get_tdb().leave_requests.insert_one(request_data)
    
    request_data['created_at'] = datetime.fromisoformat(request_data['created_at'])
    return LeaveRequest(**request_data)


@router.get("/leave-requests")
async def get_leave_requests(
    user_id: Optional[str] = None,
    status: Optional[str] = None,
    current_user: dict = Depends(get_current_user)
):
    """Get leave requests"""
    query = {}
    if user_id:
        query['user_id'] = user_id
    if status:
        query['status'] = status
    
    requests = await get_tdb().leave_requests.find(query, {'_id': 0}).sort('created_at', -1).to_list(1000)
    return requests


@router.put("/leave-requests/{request_id}/approve")
async def approve_leave_request(
    request_id: str,
    approved: bool = True,
    rejection_reason: Optional[str] = None,
    current_user: dict = Depends(get_current_user)
):
    """Approve or reject a leave request"""
    request = await get_tdb().leave_requests.find_one({'id': request_id}, {'_id': 0})
    if not request:
        raise HTTPException(status_code=404, detail='Leave request not found')
    
    update_data = {
        'status': 'approved' if approved else 'rejected',
        'approved_by': current_user['id'],
        'approved_at': datetime.now(timezone.utc).isoformat()
    }
    
    if not approved and rejection_reason:
        update_data['rejection_reason'] = rejection_reason
    
    await get_tdb().leave_requests.update_one({'id': request_id}, {'$set': update_data})
    
    return await get_tdb().leave_requests.find_one({'id': request_id}, {'_id': 0})


@router.get("/leave-requests/pending-approvals")
async def get_pending_leave_approvals(current_user: dict = Depends(get_current_user)):
    """Get pending leave requests for approval"""
    # Get users who report to current user
    reporters = await get_tdb().users.find({'reports_to': current_user['id']}, {'_id': 0, 'id': 1}).to_list(100)
    reporter_ids = [r['id'] for r in reporters]
    
    requests = await get_tdb().leave_requests.find(
        {'user_id': {'$in': reporter_ids}, 'status': 'pending'},
        {'_id': 0}
    ).to_list(100)
    
    return requests


# ============= TRAVEL REQUEST ROUTES =============

TRAVEL_PURPOSES = [
    'Client Visit', 'Lead Follow-up', 'Sales Meeting', 'Training', 
    'Conference', 'Site Survey', 'Installation Support', 'Other'
]

@router.get("/travel-requests/purposes")
async def get_travel_purposes():
    """Get list of travel purposes"""
    return TRAVEL_PURPOSES


@router.post("/travel-requests")
async def create_travel_request(request: TravelRequestCreate, current_user: dict = Depends(get_current_user)):
    """Create a new travel request"""
    request_data = {
        'id': str(uuid.uuid4()),
        'user_id': current_user['id'],
        'user_name': current_user.get('name'),
        **request.model_dump(),
        'status': 'pending',
        'created_at': datetime.now(timezone.utc).isoformat(),
        'updated_at': datetime.now(timezone.utc).isoformat()
    }
    
    await get_tdb().travel_requests.insert_one(request_data)
    
    return request_data


@router.get("/travel-requests")
async def get_travel_requests(
    user_id: Optional[str] = None,
    status: Optional[str] = None,
    current_user: dict = Depends(get_current_user)
):
    """Get travel requests"""
    query = {}
    if user_id:
        query['user_id'] = user_id
    if status:
        query['status'] = status
    
    requests = await get_tdb().travel_requests.find(query, {'_id': 0}).sort('created_at', -1).to_list(1000)
    return requests


@router.get("/travel-requests/{request_id}")
async def get_travel_request(request_id: str, current_user: dict = Depends(get_current_user)):
    """Get a single travel request"""
    request = await get_tdb().travel_requests.find_one({'id': request_id}, {'_id': 0})
    if not request:
        raise HTTPException(status_code=404, detail='Travel request not found')
    return request


@router.put("/travel-requests/{request_id}")
async def update_travel_request(
    request_id: str,
    update: TravelRequestUpdate,
    current_user: dict = Depends(get_current_user)
):
    """Update a travel request"""
    existing = await get_tdb().travel_requests.find_one({'id': request_id}, {'_id': 0})
    if not existing:
        raise HTTPException(status_code=404, detail='Travel request not found')
    
    if existing['user_id'] != current_user['id']:
        raise HTTPException(status_code=403, detail='Not authorized to update this request')
    
    if existing['status'] != 'pending':
        raise HTTPException(status_code=400, detail='Cannot update non-pending request')
    
    update_data = {k: v for k, v in update.model_dump().items() if v is not None}
    update_data['updated_at'] = datetime.now(timezone.utc).isoformat()
    
    await get_tdb().travel_requests.update_one({'id': request_id}, {'$set': update_data})
    
    return await get_tdb().travel_requests.find_one({'id': request_id}, {'_id': 0})


@router.put("/travel-requests/{request_id}/approve")
async def approve_travel_request(
    request_id: str,
    approved: bool = True,
    comments: Optional[str] = None,
    current_user: dict = Depends(get_current_user)
):
    """Approve or reject a travel request"""
    request = await get_tdb().travel_requests.find_one({'id': request_id}, {'_id': 0})
    if not request:
        raise HTTPException(status_code=404, detail='Travel request not found')
    
    update_data = {
        'status': 'approved' if approved else 'rejected',
        'approved_by': current_user['id'],
        'approved_at': datetime.now(timezone.utc).isoformat(),
        'approver_comments': comments,
        'updated_at': datetime.now(timezone.utc).isoformat()
    }
    
    await get_tdb().travel_requests.update_one({'id': request_id}, {'$set': update_data})
    
    return await get_tdb().travel_requests.find_one({'id': request_id}, {'_id': 0})


@router.put("/travel-requests/{request_id}/cancel")
async def cancel_travel_request(request_id: str, current_user: dict = Depends(get_current_user)):
    """Cancel a travel request"""
    request = await get_tdb().travel_requests.find_one({'id': request_id}, {'_id': 0})
    if not request:
        raise HTTPException(status_code=404, detail='Travel request not found')
    
    if request['user_id'] != current_user['id']:
        raise HTTPException(status_code=403, detail='Not authorized to cancel this request')
    
    await get_tdb().travel_requests.update_one(
        {'id': request_id},
        {'$set': {'status': 'cancelled', 'updated_at': datetime.now(timezone.utc).isoformat()}}
    )
    
    return await get_tdb().travel_requests.find_one({'id': request_id}, {'_id': 0})


@router.get("/travel-requests/pending-approvals/count")
async def get_pending_travel_count(current_user: dict = Depends(get_current_user)):
    """Get count of pending travel requests for approval"""
    reporters = await get_tdb().users.find({'reports_to': current_user['id']}, {'_id': 0, 'id': 1}).to_list(100)
    reporter_ids = [r['id'] for r in reporters]
    
    count = await get_tdb().travel_requests.count_documents({
        'user_id': {'$in': reporter_ids},
        'status': 'pending'
    })
    
    return {'count': count}


# ============= BUDGET REQUEST ROUTES =============

BUDGET_CATEGORIES = [
    'Marketing', 'Training', 'Equipment', 'Travel', 'Events', 
    'Software', 'Consulting', 'Other'
]

@router.get("/budget-categories")
async def get_budget_categories():
    """Get list of budget categories"""
    return BUDGET_CATEGORIES


@router.post("/budget-requests")
async def create_budget_request(request: BudgetRequestCreate, current_user: dict = Depends(get_current_user)):
    """Create a new budget request"""
    request_data = {
        'id': str(uuid.uuid4()),
        'user_id': current_user['id'],
        'user_name': current_user.get('name'),
        **request.model_dump(),
        'status': 'pending',
        'created_at': datetime.now(timezone.utc).isoformat(),
        'updated_at': datetime.now(timezone.utc).isoformat()
    }
    
    await get_tdb().budget_requests.insert_one(request_data)
    
    return request_data


@router.get("/budget-requests")
async def get_budget_requests(
    user_id: Optional[str] = None,
    status: Optional[str] = None,
    current_user: dict = Depends(get_current_user)
):
    """Get budget requests"""
    query = {}
    if user_id:
        query['user_id'] = user_id
    if status:
        query['status'] = status
    
    requests = await get_tdb().budget_requests.find(query, {'_id': 0}).sort('created_at', -1).to_list(1000)
    return requests


@router.get("/budget-requests/{request_id}")
async def get_budget_request(request_id: str, current_user: dict = Depends(get_current_user)):
    """Get a single budget request"""
    request = await get_tdb().budget_requests.find_one({'id': request_id}, {'_id': 0})
    if not request:
        raise HTTPException(status_code=404, detail='Budget request not found')
    return request


@router.put("/budget-requests/{request_id}")
async def update_budget_request(
    request_id: str,
    update: BudgetRequestUpdate,
    current_user: dict = Depends(get_current_user)
):
    """Update a budget request"""
    existing = await get_tdb().budget_requests.find_one({'id': request_id}, {'_id': 0})
    if not existing:
        raise HTTPException(status_code=404, detail='Budget request not found')
    
    if existing['user_id'] != current_user['id']:
        raise HTTPException(status_code=403, detail='Not authorized to update this request')
    
    if existing['status'] != 'pending':
        raise HTTPException(status_code=400, detail='Cannot update non-pending request')
    
    update_data = {k: v for k, v in update.model_dump().items() if v is not None}
    update_data['updated_at'] = datetime.now(timezone.utc).isoformat()
    
    await get_tdb().budget_requests.update_one({'id': request_id}, {'$set': update_data})
    
    return await get_tdb().budget_requests.find_one({'id': request_id}, {'_id': 0})


@router.put("/budget-requests/{request_id}/approve")
async def approve_budget_request(
    request_id: str,
    approved: bool = True,
    comments: Optional[str] = None,
    current_user: dict = Depends(get_current_user)
):
    """Approve or reject a budget request"""
    request = await get_tdb().budget_requests.find_one({'id': request_id}, {'_id': 0})
    if not request:
        raise HTTPException(status_code=404, detail='Budget request not found')
    
    update_data = {
        'status': 'approved' if approved else 'rejected',
        'approved_by': current_user['id'],
        'approved_at': datetime.now(timezone.utc).isoformat(),
        'approver_comments': comments,
        'updated_at': datetime.now(timezone.utc).isoformat()
    }
    
    await get_tdb().budget_requests.update_one({'id': request_id}, {'$set': update_data})
    
    return await get_tdb().budget_requests.find_one({'id': request_id}, {'_id': 0})


@router.put("/budget-requests/{request_id}/cancel")
async def cancel_budget_request(request_id: str, current_user: dict = Depends(get_current_user)):
    """Cancel a budget request"""
    request = await get_tdb().budget_requests.find_one({'id': request_id}, {'_id': 0})
    if not request:
        raise HTTPException(status_code=404, detail='Budget request not found')
    
    if request['user_id'] != current_user['id']:
        raise HTTPException(status_code=403, detail='Not authorized to cancel this request')
    
    await get_tdb().budget_requests.update_one(
        {'id': request_id},
        {'$set': {'status': 'cancelled', 'updated_at': datetime.now(timezone.utc).isoformat()}}
    )
    
    return await get_tdb().budget_requests.find_one({'id': request_id}, {'_id': 0})


# ============= EXPENSE REQUEST ROUTES =============

EXPENSE_TYPES = [
    'Travel', 'Accommodation', 'Meals', 'Transport', 'Communication',
    'Office Supplies', 'Software', 'Other'
]

@router.get("/expense-types")
async def get_expense_types():
    """Get list of expense types"""
    return EXPENSE_TYPES


@router.post("/expense-requests")
async def create_expense_request(request: ExpenseRequestCreate, current_user: dict = Depends(get_current_user)):
    """Create a new expense request"""
    # Calculate total from line items
    line_items = [item.model_dump() if hasattr(item, 'model_dump') else item for item in request.line_items]
    total_amount = sum(item.get('amount', 0) for item in line_items)
    
    request_data = {
        'id': str(uuid.uuid4()),
        'user_id': current_user['id'],
        'user_name': current_user.get('name'),
        'title': request.title,
        'line_items': line_items,
        'total_amount': total_amount,
        'travel_request_id': request.travel_request_id,
        'status': 'pending',
        'created_at': datetime.now(timezone.utc).isoformat(),
        'updated_at': datetime.now(timezone.utc).isoformat()
    }
    
    await get_tdb().expense_requests.insert_one(request_data)
    
    return request_data


@router.get("/expense-requests")
async def get_expense_requests(
    user_id: Optional[str] = None,
    status: Optional[str] = None,
    current_user: dict = Depends(get_current_user)
):
    """Get expense requests"""
    query = {}
    if user_id:
        query['user_id'] = user_id
    if status:
        query['status'] = status
    
    requests = await get_tdb().expense_requests.find(query, {'_id': 0}).sort('created_at', -1).to_list(1000)
    return requests


@router.get("/expense-requests/{request_id}")
async def get_expense_request(request_id: str, current_user: dict = Depends(get_current_user)):
    """Get a single expense request"""
    request = await get_tdb().expense_requests.find_one({'id': request_id}, {'_id': 0})
    if not request:
        raise HTTPException(status_code=404, detail='Expense request not found')
    return request


@router.put("/expense-requests/{request_id}")
async def update_expense_request(
    request_id: str,
    update: ExpenseRequestUpdate,
    current_user: dict = Depends(get_current_user)
):
    """Update an expense request"""
    existing = await get_tdb().expense_requests.find_one({'id': request_id}, {'_id': 0})
    if not existing:
        raise HTTPException(status_code=404, detail='Expense request not found')
    
    if existing['user_id'] != current_user['id']:
        raise HTTPException(status_code=403, detail='Not authorized to update this request')
    
    if existing['status'] != 'pending':
        raise HTTPException(status_code=400, detail='Cannot update non-pending request')
    
    update_data = {}
    if update.title:
        update_data['title'] = update.title
    if update.line_items is not None:
        line_items = [item.model_dump() if hasattr(item, 'model_dump') else item for item in update.line_items]
        update_data['line_items'] = line_items
        update_data['total_amount'] = sum(item.get('amount', 0) for item in line_items)
    if update.travel_request_id is not None:
        update_data['travel_request_id'] = update.travel_request_id
    
    update_data['updated_at'] = datetime.now(timezone.utc).isoformat()
    
    await get_tdb().expense_requests.update_one({'id': request_id}, {'$set': update_data})
    
    return await get_tdb().expense_requests.find_one({'id': request_id}, {'_id': 0})


@router.put("/expense-requests/{request_id}/approve")
async def approve_expense_request(
    request_id: str,
    approved: bool = True,
    comments: Optional[str] = None,
    current_user: dict = Depends(get_current_user)
):
    """Approve or reject an expense request"""
    request = await get_tdb().expense_requests.find_one({'id': request_id}, {'_id': 0})
    if not request:
        raise HTTPException(status_code=404, detail='Expense request not found')
    
    update_data = {
        'status': 'approved' if approved else 'rejected',
        'approved_by': current_user['id'],
        'approved_at': datetime.now(timezone.utc).isoformat(),
        'approver_comments': comments,
        'updated_at': datetime.now(timezone.utc).isoformat()
    }
    
    await get_tdb().expense_requests.update_one({'id': request_id}, {'$set': update_data})
    
    return await get_tdb().expense_requests.find_one({'id': request_id}, {'_id': 0})


@router.delete("/expense-requests/{request_id}")
async def delete_expense_request(request_id: str, current_user: dict = Depends(get_current_user)):
    """Delete an expense request"""
    request = await get_tdb().expense_requests.find_one({'id': request_id}, {'_id': 0})
    if not request:
        raise HTTPException(status_code=404, detail='Expense request not found')
    
    if request['user_id'] != current_user['id']:
        raise HTTPException(status_code=403, detail='Not authorized to delete this request')
    
    if request['status'] not in ['pending', 'rejected']:
        raise HTTPException(status_code=400, detail='Cannot delete approved request')
    
    await get_tdb().expense_requests.delete_one({'id': request_id})
    
    return {'message': 'Expense request deleted successfully'}
