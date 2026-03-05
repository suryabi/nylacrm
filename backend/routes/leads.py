"""
Leads routes - Lead CRUD, activities, comments, follow-ups, proposals
"""
from fastapi import APIRouter, HTTPException, Depends, UploadFile, File, Form
from typing import List, Optional
from datetime import datetime, timezone
from pydantic import BaseModel, Field, EmailStr
import uuid
import re
import base64

from database import db
from deps import get_current_user

router = APIRouter()

# ============= MODELS =============

class Lead(BaseModel):
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    lead_id: Optional[str] = None
    company: str
    contact_person: Optional[str] = None
    name: Optional[str] = None
    email: Optional[EmailStr] = None
    phone: Optional[str] = None
    category: Optional[str] = None
    tier: Optional[str] = None
    rank: Optional[str] = None
    city: str
    state: str
    country: str = 'India'
    region: str
    status: str = 'new'
    source: Optional[str] = None
    assigned_to: Optional[str] = None
    priority: Optional[str] = 'medium'
    current_water_brand: Optional[str] = None
    current_landing_price: Optional[float] = None
    current_volume: Optional[str] = None
    current_selling_price: Optional[float] = None
    interested_skus: Optional[List[str]] = []
    proposed_sku_pricing: Optional[List[dict]] = []
    notes: Optional[str] = None
    next_followup_date: Optional[str] = None
    estimated_value: Optional[float] = None
    created_by: str
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    updated_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    last_contacted_date: Optional[str] = None
    last_contact_method: Optional[str] = None
    total_gross_invoice_value: Optional[float] = None
    total_net_invoice_value: Optional[float] = None
    total_credit_note_value: Optional[float] = None
    invoice_count: Optional[int] = None
    last_invoice_date: Optional[str] = None
    last_invoice_no: Optional[str] = None

    class Config:
        extra = "allow"


class LeadCreate(BaseModel):
    company: str
    contact_person: Optional[str] = None
    email: Optional[EmailStr] = None
    phone: Optional[str] = None
    category: Optional[str] = None
    tier: Optional[str] = None
    rank: Optional[str] = None
    city: str
    state: str
    country: str = 'India'
    region: str
    status: str = 'new'
    source: Optional[str] = None
    assigned_to: Optional[str] = None
    priority: Optional[str] = 'medium'
    current_water_brand: Optional[str] = None
    current_landing_price: Optional[float] = None
    current_volume: Optional[str] = None
    current_selling_price: Optional[float] = None
    interested_skus: Optional[List[str]] = []
    notes: Optional[str] = None
    estimated_value: Optional[float] = None


class LeadUpdate(BaseModel):
    company: Optional[str] = None
    contact_person: Optional[str] = None
    email: Optional[EmailStr] = None
    phone: Optional[str] = None
    category: Optional[str] = None
    tier: Optional[str] = None
    rank: Optional[str] = None
    city: Optional[str] = None
    state: Optional[str] = None
    country: Optional[str] = None
    region: Optional[str] = None
    status: Optional[str] = None
    source: Optional[str] = None
    assigned_to: Optional[str] = None
    priority: Optional[str] = None
    current_water_brand: Optional[str] = None
    current_landing_price: Optional[float] = None
    current_volume: Optional[str] = None
    current_selling_price: Optional[float] = None
    interested_skus: Optional[List[str]] = None
    proposed_sku_pricing: Optional[List[dict]] = None
    notes: Optional[str] = None
    estimated_value: Optional[float] = None
    next_followup_date: Optional[str] = None
    converted_to_account: Optional[bool] = False
    account_id: Optional[str] = None


class PaginatedLeadsResponse(BaseModel):
    data: List[Lead]
    total: int
    page: int
    page_size: int
    total_pages: int


class Activity(BaseModel):
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    lead_id: str
    activity_type: str
    description: str
    interaction_method: Optional[str] = None
    created_by: str
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))

    class Config:
        extra = "ignore"


class ActivityCreate(BaseModel):
    lead_id: str
    activity_type: str
    description: str
    interaction_method: Optional[str] = None


class FollowUp(BaseModel):
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    lead_id: str
    title: str
    description: Optional[str] = None
    scheduled_date: datetime
    is_completed: bool = False
    completed_at: Optional[datetime] = None
    assigned_to: str
    created_by: str
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))

    class Config:
        extra = "ignore"


class FollowUpCreate(BaseModel):
    lead_id: str
    title: str
    description: Optional[str] = None
    scheduled_date: datetime
    assigned_to: str


class Comment(BaseModel):
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    lead_id: str
    comment: str
    created_by: str
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))

    class Config:
        extra = "ignore"


class CommentCreate(BaseModel):
    lead_id: str
    comment: str


# ============= HELPER FUNCTIONS =============

async def generate_lead_id(company: str, city: str) -> str:
    """Generate unique Lead ID in format: NAME4-CITY-LYY-SEQ"""
    clean_company = re.sub(r'[^a-zA-Z0-9]', '', company).upper()
    name4 = clean_company[:4].ljust(4, 'X')
    
    clean_city = re.sub(r'[^a-zA-Z0-9]', '', city).upper()
    city3 = clean_city[:3].ljust(3, 'X')
    
    year2 = datetime.now().strftime('%y')
    prefix = f"{name4}-{city3}-L{year2}-"
    
    regex_pattern = f"^{re.escape(prefix)}\\d{{3}}$"
    existing_leads = await db.leads.find(
        {'lead_id': {'$regex': regex_pattern}},
        {'lead_id': 1}
    ).sort('lead_id', -1).limit(1).to_list(1)
    
    if existing_leads and existing_leads[0].get('lead_id'):
        last_seq = int(existing_leads[0]['lead_id'][-3:])
        next_seq = last_seq + 1
    else:
        next_seq = 1
    
    if next_seq > 999:
        next_seq = 1
    
    seq3 = str(next_seq).zfill(3)
    return f"{name4}-{city3}-L{year2}-{seq3}"


# ============= LEAD ROUTES =============

@router.post("", response_model=Lead)
async def create_lead(lead: LeadCreate, current_user: dict = Depends(get_current_user)):
    """Create a new lead"""
    lead_data = lead.model_dump()
    lead_data['id'] = str(uuid.uuid4())
    lead_data['created_by'] = current_user['id']
    lead_data['created_at'] = datetime.now(timezone.utc).isoformat()
    lead_data['updated_at'] = datetime.now(timezone.utc).isoformat()
    
    # Generate lead_id
    lead_data['lead_id'] = await generate_lead_id(lead.company, lead.city)
    
    # Set assigned_to if not provided
    if not lead_data.get('assigned_to'):
        lead_data['assigned_to'] = current_user['id']
    
    await db.leads.insert_one(lead_data)
    
    lead_data['created_at'] = datetime.fromisoformat(lead_data['created_at'])
    lead_data['updated_at'] = datetime.fromisoformat(lead_data['updated_at'])
    return Lead(**lead_data)


@router.get("", response_model=PaginatedLeadsResponse)
async def get_leads(
    page: int = 1,
    page_size: int = 20,
    search: Optional[str] = None,
    status: Optional[str] = None,
    city: Optional[str] = None,
    state: Optional[str] = None,
    assigned_to: Optional[str] = None,
    territory: Optional[str] = None,
    time_filter: Optional[str] = None,
    category: Optional[str] = None,
    tier: Optional[str] = None,
    rank: Optional[str] = None,
    source: Optional[str] = None,
    no_limit: bool = False,
    current_user: dict = Depends(get_current_user)
):
    """Get paginated list of leads with filters"""
    query = {}
    
    if search:
        query['$or'] = [
            {'company': {'$regex': search, '$options': 'i'}},
            {'lead_id': {'$regex': search, '$options': 'i'}},
            {'contact_person': {'$regex': search, '$options': 'i'}},
            {'email': {'$regex': search, '$options': 'i'}},
            {'phone': {'$regex': search, '$options': 'i'}}
        ]
    
    if status:
        statuses = status.split(',')
        query['status'] = {'$in': statuses}
    
    if city:
        query['city'] = city
    
    if state:
        query['state'] = state
    
    if assigned_to:
        query['assigned_to'] = assigned_to
    
    if territory:
        query['region'] = territory
    
    if category:
        query['category'] = category
    
    if tier:
        query['tier'] = tier
    
    if rank:
        query['rank'] = rank
    
    if source:
        query['source'] = source
    
    # Time filter
    if time_filter:
        now = datetime.now(timezone.utc)
        if time_filter == 'today':
            start_of_day = now.replace(hour=0, minute=0, second=0, microsecond=0)
            query['created_at'] = {'$gte': start_of_day.isoformat()}
        elif time_filter == 'this_week':
            start_of_week = now - timedelta(days=now.weekday())
            start_of_week = start_of_week.replace(hour=0, minute=0, second=0, microsecond=0)
            query['created_at'] = {'$gte': start_of_week.isoformat()}
        elif time_filter == 'this_month':
            start_of_month = now.replace(day=1, hour=0, minute=0, second=0, microsecond=0)
            query['created_at'] = {'$gte': start_of_month.isoformat()}
    
    total = await db.leads.count_documents(query)
    
    # Handle no_limit for pipeline view
    if no_limit:
        page_size = 10000
    
    skip = (page - 1) * page_size
    leads_cursor = db.leads.find(query, {'_id': 0}).sort('created_at', -1).skip(skip).limit(page_size)
    leads = await leads_cursor.to_list(page_size)
    
    # Convert datetime strings
    for lead in leads:
        if isinstance(lead.get('created_at'), str):
            lead['created_at'] = datetime.fromisoformat(lead['created_at'].replace('Z', '+00:00'))
        if isinstance(lead.get('updated_at'), str):
            lead['updated_at'] = datetime.fromisoformat(lead['updated_at'].replace('Z', '+00:00'))
    
    total_pages = (total + page_size - 1) // page_size
    
    return PaginatedLeadsResponse(
        data=leads,
        total=total,
        page=page,
        page_size=page_size,
        total_pages=total_pages
    )


@router.get("/{lead_id}", response_model=Lead)
async def get_lead(lead_id: str, current_user: dict = Depends(get_current_user)):
    """Get a single lead by ID"""
    lead = await db.leads.find_one({'id': lead_id}, {'_id': 0})
    if not lead:
        raise HTTPException(status_code=404, detail='Lead not found')
    
    if isinstance(lead.get('created_at'), str):
        lead['created_at'] = datetime.fromisoformat(lead['created_at'].replace('Z', '+00:00'))
    if isinstance(lead.get('updated_at'), str):
        lead['updated_at'] = datetime.fromisoformat(lead['updated_at'].replace('Z', '+00:00'))
    
    return Lead(**lead)


@router.put("/{lead_id}", response_model=Lead)
async def update_lead(lead_id: str, lead_update: LeadUpdate, current_user: dict = Depends(get_current_user)):
    """Update a lead"""
    existing = await db.leads.find_one({'id': lead_id}, {'_id': 0})
    if not existing:
        raise HTTPException(status_code=404, detail='Lead not found')
    
    update_data = {k: v for k, v in lead_update.model_dump().items() if v is not None}
    update_data['updated_at'] = datetime.now(timezone.utc).isoformat()
    
    await db.leads.update_one({'id': lead_id}, {'$set': update_data})
    
    updated = await db.leads.find_one({'id': lead_id}, {'_id': 0})
    if isinstance(updated.get('created_at'), str):
        updated['created_at'] = datetime.fromisoformat(updated['created_at'].replace('Z', '+00:00'))
    if isinstance(updated.get('updated_at'), str):
        updated['updated_at'] = datetime.fromisoformat(updated['updated_at'].replace('Z', '+00:00'))
    
    return Lead(**updated)


@router.delete("/{lead_id}")
async def delete_lead(lead_id: str, current_user: dict = Depends(get_current_user)):
    """Delete a lead"""
    result = await db.leads.delete_one({'id': lead_id})
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail='Lead not found')
    
    # Also delete related data
    await db.activities.delete_many({'lead_id': lead_id})
    await db.follow_ups.delete_many({'lead_id': lead_id})
    await db.comments.delete_many({'lead_id': lead_id})
    
    return {'message': 'Lead deleted successfully'}


@router.post("/{lead_id}/generate-lead-id")
async def regenerate_lead_id(lead_id: str, current_user: dict = Depends(get_current_user)):
    """Regenerate lead ID for a lead"""
    lead = await db.leads.find_one({'id': lead_id}, {'_id': 0})
    if not lead:
        raise HTTPException(status_code=404, detail='Lead not found')
    
    new_lead_id = await generate_lead_id(lead['company'], lead['city'])
    await db.leads.update_one({'id': lead_id}, {'$set': {'lead_id': new_lead_id}})
    
    return {'lead_id': new_lead_id}


# ============= ACTIVITY ROUTES =============

@router.post("/activities", response_model=Activity)
async def create_activity(activity: ActivityCreate, current_user: dict = Depends(get_current_user)):
    """Create a new activity for a lead"""
    activity_data = activity.model_dump()
    activity_data['id'] = str(uuid.uuid4())
    activity_data['created_by'] = current_user['id']
    activity_data['created_at'] = datetime.now(timezone.utc).isoformat()
    
    await db.activities.insert_one(activity_data)
    
    activity_data['created_at'] = datetime.fromisoformat(activity_data['created_at'])
    return Activity(**activity_data)


@router.get("/{lead_id}/activities", response_model=List[Activity])
async def get_activities(lead_id: str, current_user: dict = Depends(get_current_user)):
    """Get all activities for a lead"""
    activities = await db.activities.find({'lead_id': lead_id}, {'_id': 0}).sort('created_at', -1).to_list(1000)
    
    for activity in activities:
        if isinstance(activity.get('created_at'), str):
            activity['created_at'] = datetime.fromisoformat(activity['created_at'].replace('Z', '+00:00'))
    
    return activities


# ============= FOLLOW-UP ROUTES =============

@router.post("/follow-ups", response_model=FollowUp)
async def create_follow_up(follow_up: FollowUpCreate, current_user: dict = Depends(get_current_user)):
    """Create a new follow-up"""
    follow_up_data = follow_up.model_dump()
    follow_up_data['id'] = str(uuid.uuid4())
    follow_up_data['created_by'] = current_user['id']
    follow_up_data['created_at'] = datetime.now(timezone.utc).isoformat()
    follow_up_data['scheduled_date'] = follow_up_data['scheduled_date'].isoformat()
    follow_up_data['is_completed'] = False
    
    await db.follow_ups.insert_one(follow_up_data)
    
    follow_up_data['created_at'] = datetime.fromisoformat(follow_up_data['created_at'])
    follow_up_data['scheduled_date'] = datetime.fromisoformat(follow_up_data['scheduled_date'])
    return FollowUp(**follow_up_data)


@router.get("/follow-ups", response_model=List[FollowUp])
async def get_follow_ups(
    lead_id: Optional[str] = None,
    assigned_to: Optional[str] = None,
    current_user: dict = Depends(get_current_user)
):
    """Get follow-ups with optional filters"""
    query = {}
    if lead_id:
        query['lead_id'] = lead_id
    if assigned_to:
        query['assigned_to'] = assigned_to
    
    follow_ups = await db.follow_ups.find(query, {'_id': 0}).sort('scheduled_date', 1).to_list(1000)
    
    for fu in follow_ups:
        if isinstance(fu.get('created_at'), str):
            fu['created_at'] = datetime.fromisoformat(fu['created_at'].replace('Z', '+00:00'))
        if isinstance(fu.get('scheduled_date'), str):
            fu['scheduled_date'] = datetime.fromisoformat(fu['scheduled_date'].replace('Z', '+00:00'))
    
    return follow_ups


@router.put("/follow-ups/{follow_up_id}/complete")
async def complete_follow_up(follow_up_id: str, current_user: dict = Depends(get_current_user)):
    """Mark a follow-up as completed"""
    result = await db.follow_ups.update_one(
        {'id': follow_up_id},
        {'$set': {
            'is_completed': True,
            'completed_at': datetime.now(timezone.utc).isoformat()
        }}
    )
    
    if result.modified_count == 0:
        raise HTTPException(status_code=404, detail='Follow-up not found')
    
    return {'message': 'Follow-up completed'}


# ============= COMMENT ROUTES =============

@router.post("/comments", response_model=Comment)
async def create_comment(comment: CommentCreate, current_user: dict = Depends(get_current_user)):
    """Create a new comment on a lead"""
    comment_data = comment.model_dump()
    comment_data['id'] = str(uuid.uuid4())
    comment_data['created_by'] = current_user['id']
    comment_data['created_at'] = datetime.now(timezone.utc).isoformat()
    
    await db.comments.insert_one(comment_data)
    
    comment_data['created_at'] = datetime.fromisoformat(comment_data['created_at'])
    return Comment(**comment_data)


@router.get("/{lead_id}/comments", response_model=List[Comment])
async def get_comments(lead_id: str, current_user: dict = Depends(get_current_user)):
    """Get all comments for a lead"""
    comments = await db.comments.find({'lead_id': lead_id}, {'_id': 0}).sort('created_at', -1).to_list(1000)
    
    for comment in comments:
        if isinstance(comment.get('created_at'), str):
            comment['created_at'] = datetime.fromisoformat(comment['created_at'].replace('Z', '+00:00'))
    
    return comments


# ============= INVOICE ROUTES (Lead-related) =============

@router.get("/{lead_id}/invoices")
async def get_lead_invoices(lead_id: str, current_user: dict = Depends(get_current_user)):
    """Get all invoices for a lead"""
    lead = await db.leads.find_one({'id': lead_id}, {'_id': 0, 'lead_id': 1})
    if not lead:
        raise HTTPException(status_code=404, detail='Lead not found')
    
    invoices = await db.invoices.find(
        {'ca_lead_id': lead.get('lead_id')},
        {'_id': 0}
    ).sort('invoice_date', -1).to_list(1000)
    
    return {'invoices': invoices}


# ============= LOGO ROUTES =============

@router.post("/{lead_id}/logo")
async def upload_lead_logo(
    lead_id: str,
    logo: UploadFile = File(...),
    current_user: dict = Depends(get_current_user)
):
    """Upload a logo for a lead"""
    lead = await db.leads.find_one({'id': lead_id}, {'_id': 0})
    if not lead:
        raise HTTPException(status_code=404, detail='Lead not found')
    
    # Read and validate file
    content = await logo.read()
    if len(content) > 5 * 1024 * 1024:  # 5MB limit
        raise HTTPException(status_code=400, detail='File too large (max 5MB)')
    
    # Convert to base64
    logo_base64 = base64.b64encode(content).decode('utf-8')
    logo_data = f"data:{logo.content_type};base64,{logo_base64}"
    
    await db.leads.update_one(
        {'id': lead_id},
        {'$set': {
            'logo': logo_data,
            'updated_at': datetime.now(timezone.utc).isoformat()
        }}
    )
    
    return {'message': 'Logo uploaded successfully', 'logo': logo_data}


@router.delete("/{lead_id}/logo")
async def delete_lead_logo(lead_id: str, current_user: dict = Depends(get_current_user)):
    """Delete a lead's logo"""
    result = await db.leads.update_one(
        {'id': lead_id},
        {'$unset': {'logo': ''}, '$set': {'updated_at': datetime.now(timezone.utc).isoformat()}}
    )
    
    if result.modified_count == 0:
        raise HTTPException(status_code=404, detail='Lead not found')
    
    return {'message': 'Logo deleted successfully'}
