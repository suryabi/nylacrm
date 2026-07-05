"""
Leads routes - Lead CRUD, activities, comments, follow-ups, proposals
Multi-tenant aware - all queries automatically filter by tenant_id
"""
from fastapi import APIRouter, HTTPException, Depends, UploadFile, File, Form, Response
from typing import List, Optional
from datetime import datetime, timezone, timedelta
from pydantic import BaseModel, Field, EmailStr
import uuid
import re
import base64

from database import get_tenant_db
from deps import get_current_user
from core.tenant import with_tenant_id, get_current_tenant_id
from utils.entity_comments import notify_comment_mentions

router = APIRouter()

def get_tdb():
    """Get tenant-aware database wrapper"""
    return get_tenant_db()

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
    lead_type: Optional[str] = 'B2B'  # B2B or Retail
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
    current_brands: Optional[List[dict]] = []
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
    onboarded_month: Optional[int] = None
    onboarded_year: Optional[int] = None
    target_closure_month: Optional[int] = None
    target_closure_year: Optional[int] = None

    class Config:
        extra = "allow"


class LeadCreate(BaseModel):
    company: str
    contact_person: Optional[str] = None
    email: Optional[EmailStr] = None
    phone: Optional[str] = None
    category: Optional[str] = None
    lead_type: Optional[str] = 'B2B'  # B2B or Retail
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
    current_brands: Optional[List[dict]] = []
    interested_skus: Optional[List[str]] = []
    notes: Optional[str] = None
    estimated_value: Optional[float] = None
    onboarded_month: Optional[int] = None
    onboarded_year: Optional[int] = None
    target_closure_month: Optional[int] = None
    target_closure_year: Optional[int] = None


class LeadUpdate(BaseModel):
    company: Optional[str] = None
    contact_person: Optional[str] = None
    email: Optional[EmailStr] = None
    phone: Optional[str] = None
    category: Optional[str] = None
    lead_type: Optional[str] = None  # B2B or Retail
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
    current_brands: Optional[List[dict]] = None
    interested_skus: Optional[List[str]] = None
    proposed_sku_pricing: Optional[List[dict]] = None
    notes: Optional[str] = None
    estimated_value: Optional[float] = None
    next_followup_date: Optional[str] = None
    converted_to_account: Optional[bool] = False
    account_id: Optional[str] = None


class SocialLinksUpdate(BaseModel):
    social_links: List[dict] = []
    updated_at: Optional[str] = None  # Admin can set custom date for status changes
    onboarded_month: Optional[int] = None
    onboarded_year: Optional[int] = None
    target_closure_month: Optional[int] = None
    target_closure_year: Optional[int] = None


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
    created_at: Optional[str] = None  # Admin can set custom date
    copy_to_lead_ids: Optional[List[str]] = None  # Copy activity to these linked leads


# ============= LEAD GROUP MODELS =============

class LeadLinkRequest(BaseModel):
    """Request to link two leads"""
    target_lead_id: str
    link_type: str = "peer"  # "peer" (bi-directional) or "parent" (this lead becomes parent) or "child" (this lead becomes child)


class LeadGroupInfo(BaseModel):
    """Lead group information"""
    parent_lead_id: Optional[str] = None
    parent_lead_name: Optional[str] = None
    child_leads: Optional[List[dict]] = []  # [{id, company, city}]
    peer_leads: Optional[List[dict]] = []   # [{id, company, city}]


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
    tdb = get_tdb()
    clean_company = re.sub(r'[^a-zA-Z0-9]', '', company).upper()
    name4 = clean_company[:4].ljust(4, 'X')
    
    clean_city = re.sub(r'[^a-zA-Z0-9]', '', city).upper()
    city3 = clean_city[:3].ljust(3, 'X')
    
    year2 = datetime.now().strftime('%y')
    prefix = f"{name4}-{city3}-L{year2}-"
    
    regex_pattern = f"^{re.escape(prefix)}\\d{{3}}$"
    existing_leads = await tdb.leads.find(
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
    tdb = get_tdb()
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
    
    # tenant_id is automatically added by TenantDB
    await tdb.leads.insert_one(lead_data)
    
    # Best-effort: create a dedicated Drive folder for this lead.
    try:
        from utils.google_drive_storage import ensure_lead_folder
        from core.tenant import get_current_tenant_id as _gctid
        folder_id = await ensure_lead_folder(_gctid(), lead_data['lead_id'])
        if folder_id:
            await tdb.leads.update_one(
                {'id': lead_data['id']},
                {'$set': {'drive_folder_id': folder_id}}
            )
            lead_data['drive_folder_id'] = folder_id
    except Exception as _e:
        import logging
        logging.getLogger(__name__).exception('Drive folder creation failed for lead %s', lead_data.get('lead_id'))
    
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
    quadrant: Optional[str] = None,  # Lead scoring quadrant filter (comma-separated)
    no_limit: bool = False,
    current_user: dict = Depends(get_current_user)
):
    """Get paginated list of leads with filters"""
    tdb = get_tdb()
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
        assigned_to_list = assigned_to.split(',')
        query['assigned_to'] = {'$in': assigned_to_list}
    
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
    
    # Lead scoring quadrant filter
    if quadrant:
        quadrants = quadrant.split(',')
        import logging
        logging.warning(f"QUADRANT FILTER: received={quadrant}, parsed={quadrants}")
        # Check if 'unscored' is in the filter
        if 'unscored' in quadrants:
            quadrants.remove('unscored')
            if quadrants:
                # Both scored quadrants and unscored
                query['$or'] = [
                    {'scoring.quadrant': {'$in': quadrants}},
                    {'scoring.quadrant': {'$exists': False}}
                ]
            else:
                # Only unscored
                query['scoring.quadrant'] = {'$exists': False}
        else:
            query['scoring.quadrant'] = {'$in': quadrants}
        logging.warning(f"QUADRANT FILTER: query after={query}")
    
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
    
    import logging
    logging.warning(f"FINAL QUERY: {query}")
    total = await tdb.leads.count_documents(query)
    logging.warning(f"TOTAL RESULTS: {total}")
    
    # Handle no_limit for pipeline view
    if no_limit:
        page_size = 10000
    
    skip = (page - 1) * page_size
    leads_cursor = tdb.leads.find(query, {'_id': 0}).sort('created_at', -1).skip(skip).limit(page_size)
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
    tdb = get_tdb()
    lead = await tdb.leads.find_one({'id': lead_id}, {'_id': 0})
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
    tdb = get_tdb()
    existing = await tdb.leads.find_one({'id': lead_id}, {'_id': 0})
    if not existing:
        raise HTTPException(status_code=404, detail='Lead not found')
    
    update_data = {k: v for k, v in lead_update.model_dump().items() if v is not None}

    # Allow the client to EXPLICITLY clear a nullable field by sending it as
    # null. The dict-comp above drops every null (so unsent fields don't get
    # blanked), but we want fields the user actively cleared from the UI to
    # actually clear in the DB. `model_dump(exclude_unset=True)` only returns
    # keys the client put in the request body — any explicit null in there
    # is a deliberate clear and should overwrite the stored value.
    explicit = lead_update.model_dump(exclude_unset=True)
    for k, v in explicit.items():
        if v is None:
            update_data[k] = None
    
    # Use custom updated_at if provided (admin feature), otherwise use current time
    if 'updated_at' in update_data and update_data['updated_at']:
        try:
            custom_date = datetime.fromisoformat(update_data['updated_at'].replace('Z', '+00:00'))
            update_data['updated_at'] = custom_date.isoformat()
        except (ValueError, AttributeError):
            update_data['updated_at'] = datetime.now(timezone.utc).isoformat()
    else:
        update_data['updated_at'] = datetime.now(timezone.utc).isoformat()
    
    await tdb.leads.update_one({'id': lead_id}, {'$set': update_data})
    
    updated = await tdb.leads.find_one({'id': lead_id}, {'_id': 0})
    if isinstance(updated.get('created_at'), str):
        updated['created_at'] = datetime.fromisoformat(updated['created_at'].replace('Z', '+00:00'))
    if isinstance(updated.get('updated_at'), str):
        updated['updated_at'] = datetime.fromisoformat(updated['updated_at'].replace('Z', '+00:00'))
    
    return Lead(**updated)


@router.put("/{lead_id}/social-links")
async def update_lead_social_links(lead_id: str, payload: SocialLinksUpdate, current_user: dict = Depends(get_current_user)):
    """Update the list of social/web links for a lead."""
    tdb = get_tdb()
    existing = await tdb.leads.find_one({'id': lead_id}, {'_id': 0})
    if not existing:
        raise HTTPException(status_code=404, detail='Lead not found')

    clean = []
    for link in (payload.social_links or []):
        url = (link.get('url') or '').strip()
        if not url:
            continue
        if not re.match(r'^https?://', url, re.I):
            url = 'https://' + url
        clean.append({
            'platform': (link.get('platform') or 'Website').strip(),
            'url': url,
        })

    await tdb.leads.update_one(
        {'id': lead_id},
        {'$set': {'social_links': clean, 'updated_at': datetime.now(timezone.utc).isoformat()}}
    )
    return {'social_links': clean}


@router.delete("/{lead_id}")
async def delete_lead(lead_id: str, current_user: dict = Depends(get_current_user)):
    """Delete a lead"""
    tdb = get_tdb()
    result = await tdb.leads.delete_one({'id': lead_id})
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail='Lead not found')
    
    # Also delete related data
    await tdb.activities.delete_many({'lead_id': lead_id})
    await tdb.follow_ups.delete_many({'lead_id': lead_id})
    await tdb.comments.delete_many({'lead_id': lead_id})
    
    return {'message': 'Lead deleted successfully'}


@router.post("/{lead_id}/generate-lead-id")
async def regenerate_lead_id(lead_id: str, current_user: dict = Depends(get_current_user)):
    """Regenerate lead ID for a lead"""
    tdb = get_tdb()
    lead = await tdb.leads.find_one({'id': lead_id}, {'_id': 0})
    if not lead:
        raise HTTPException(status_code=404, detail='Lead not found')
    
    new_lead_id = await generate_lead_id(lead['company'], lead['city'])
    await tdb.leads.update_one({'id': lead_id}, {'$set': {'lead_id': new_lead_id}})
    
    return {'lead_id': new_lead_id}


# ============= LEAD GROUP ROUTES =============

@router.get("/{lead_id}/group")
async def get_lead_group(lead_id: str, current_user: dict = Depends(get_current_user)):
    """Get all linked leads for a lead (parent, children, peers)"""
    tdb = get_tdb()
    
    lead = await tdb.leads.find_one({'id': lead_id}, {'_id': 0})
    if not lead:
        raise HTTPException(status_code=404, detail='Lead not found')
    
    lead_group = lead.get('lead_group', {})
    result = {
        'parent_lead': None,
        'child_leads': [],
        'peer_leads': []
    }
    
    # Get parent lead if exists
    parent_id = lead_group.get('parent_lead_id')
    if parent_id:
        parent = await tdb.leads.find_one({'id': parent_id}, {'_id': 0, 'id': 1, 'company': 1, 'city': 1, 'status': 1})
        if parent:
            result['parent_lead'] = parent
    
    # Get child leads (leads that have this lead as parent)
    child_leads = await tdb.leads.find(
        {'lead_group.parent_lead_id': lead_id},
        {'_id': 0, 'id': 1, 'company': 1, 'city': 1, 'status': 1}
    ).to_list(100)
    result['child_leads'] = child_leads
    
    # Get peer leads (bi-directional links)
    peer_ids = lead_group.get('peer_lead_ids', [])
    if peer_ids:
        peer_leads = await tdb.leads.find(
            {'id': {'$in': peer_ids}},
            {'_id': 0, 'id': 1, 'company': 1, 'city': 1, 'status': 1}
        ).to_list(100)
        result['peer_leads'] = peer_leads
    
    return result


@router.post("/{lead_id}/link")
async def link_leads(lead_id: str, link_request: LeadLinkRequest, current_user: dict = Depends(get_current_user)):
    """Link two leads together"""
    tdb = get_tdb()
    
    # Validate both leads exist
    lead = await tdb.leads.find_one({'id': lead_id}, {'_id': 0})
    target_lead = await tdb.leads.find_one({'id': link_request.target_lead_id}, {'_id': 0})
    
    if not lead:
        raise HTTPException(status_code=404, detail='Lead not found')
    if not target_lead:
        raise HTTPException(status_code=404, detail='Target lead not found')
    if lead_id == link_request.target_lead_id:
        raise HTTPException(status_code=400, detail='Cannot link a lead to itself')
    
    link_type = link_request.link_type
    
    if link_type == "parent":
        # This lead becomes the parent of target lead
        # Set target lead's parent to this lead
        await tdb.leads.update_one(
            {'id': link_request.target_lead_id},
            {'$set': {'lead_group.parent_lead_id': lead_id}}
        )
        return {'message': f'{lead["company"]} is now parent of {target_lead["company"]}'}
    
    elif link_type == "child":
        # This lead becomes a child of target lead
        # Set this lead's parent to target lead
        await tdb.leads.update_one(
            {'id': lead_id},
            {'$set': {'lead_group.parent_lead_id': link_request.target_lead_id}}
        )
        return {'message': f'{lead["company"]} is now a branch of {target_lead["company"]}'}
    
    else:  # peer (bi-directional)
        # Add each lead to the other's peer list
        await tdb.leads.update_one(
            {'id': lead_id},
            {'$addToSet': {'lead_group.peer_lead_ids': link_request.target_lead_id}}
        )
        await tdb.leads.update_one(
            {'id': link_request.target_lead_id},
            {'$addToSet': {'lead_group.peer_lead_ids': lead_id}}
        )
        return {'message': f'{lead["company"]} and {target_lead["company"]} are now linked as peers'}


@router.delete("/{lead_id}/unlink/{target_lead_id}")
async def unlink_leads(lead_id: str, target_lead_id: str, current_user: dict = Depends(get_current_user)):
    """Remove link between two leads"""
    tdb = get_tdb()
    
    lead = await tdb.leads.find_one({'id': lead_id}, {'_id': 0})
    if not lead:
        raise HTTPException(status_code=404, detail='Lead not found')
    
    lead_group = lead.get('lead_group', {})
    
    # Check if target is the parent
    if lead_group.get('parent_lead_id') == target_lead_id:
        await tdb.leads.update_one(
            {'id': lead_id},
            {'$unset': {'lead_group.parent_lead_id': ''}}
        )
        return {'message': 'Parent link removed'}
    
    # Check if target is a child (this lead is their parent)
    child = await tdb.leads.find_one({'id': target_lead_id, 'lead_group.parent_lead_id': lead_id})
    if child:
        await tdb.leads.update_one(
            {'id': target_lead_id},
            {'$unset': {'lead_group.parent_lead_id': ''}}
        )
        return {'message': 'Child link removed'}
    
    # Remove from peer lists (both directions)
    await tdb.leads.update_one(
        {'id': lead_id},
        {'$pull': {'lead_group.peer_lead_ids': target_lead_id}}
    )
    await tdb.leads.update_one(
        {'id': target_lead_id},
        {'$pull': {'lead_group.peer_lead_ids': lead_id}}
    )
    
    return {'message': 'Peer link removed'}


# ============= ACTIVITY ROUTES =============

@router.post("/activities", response_model=Activity)
async def create_activity(activity: ActivityCreate, current_user: dict = Depends(get_current_user)):
    """Create a new activity for a lead, optionally copying to linked leads"""
    tdb = get_tdb()
    activity_data = activity.model_dump()
    original_activity_id = str(uuid.uuid4())
    activity_data['id'] = original_activity_id
    activity_data['created_by'] = current_user['id']
    
    # Extract copy_to_lead_ids before processing
    copy_to_lead_ids = activity_data.pop('copy_to_lead_ids', None) or []
    
    # Use custom created_at if provided (admin feature), otherwise use current time
    if activity_data.get('created_at'):
        # Validate and use the provided date
        try:
            custom_date = datetime.fromisoformat(activity_data['created_at'].replace('Z', '+00:00'))
            activity_data['created_at'] = custom_date.isoformat()
        except (ValueError, AttributeError):
            activity_data['created_at'] = datetime.now(timezone.utc).isoformat()
    else:
        activity_data['created_at'] = datetime.now(timezone.utc).isoformat()
    
    # Insert the original activity
    await tdb.activities.insert_one(activity_data)
    
    # Copy to linked leads if requested
    copied_count = 0
    if copy_to_lead_ids:
        source_lead_id = activity_data['lead_id']
        for target_lead_id in copy_to_lead_ids:
            # Verify the target lead exists
            target_lead = await tdb.leads.find_one({'id': target_lead_id}, {'_id': 0, 'id': 1})
            if target_lead:
                copied_activity = {
                    **activity_data,
                    'id': str(uuid.uuid4()),
                    'lead_id': target_lead_id,
                    'is_shared_copy': True,
                    'original_activity_id': original_activity_id,
                    'source_lead_id': source_lead_id
                }
                await tdb.activities.insert_one(copied_activity)
                copied_count += 1
    
    activity_data['created_at'] = datetime.fromisoformat(activity_data['created_at'].replace('Z', '+00:00'))
    activity_data['copied_to_count'] = copied_count
    return Activity(**activity_data)


@router.get("/{lead_id}/activities", response_model=List[Activity])
async def get_activities(lead_id: str, current_user: dict = Depends(get_current_user)):
    """Get all activities for a lead"""
    tdb = get_tdb()
    activities = await tdb.activities.find({'lead_id': lead_id}, {'_id': 0}).sort('created_at', -1).to_list(1000)
    
    for activity in activities:
        if isinstance(activity.get('created_at'), str):
            activity['created_at'] = datetime.fromisoformat(activity['created_at'].replace('Z', '+00:00'))
    
    return activities


# ============= FOLLOW-UP ROUTES =============

@router.post("/follow-ups", response_model=FollowUp)
async def create_follow_up(follow_up: FollowUpCreate, current_user: dict = Depends(get_current_user)):
    """Create a new follow-up"""
    tdb = get_tdb()
    follow_up_data = follow_up.model_dump()
    follow_up_data['id'] = str(uuid.uuid4())
    follow_up_data['created_by'] = current_user['id']
    follow_up_data['created_at'] = datetime.now(timezone.utc).isoformat()
    follow_up_data['scheduled_date'] = follow_up_data['scheduled_date'].isoformat()
    follow_up_data['is_completed'] = False
    
    await tdb.follow_ups.insert_one(follow_up_data)
    
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
    tdb = get_tdb()
    query = {}
    if lead_id:
        query['lead_id'] = lead_id
    if assigned_to:
        assigned_to_list = assigned_to.split(',')
        query['assigned_to'] = {'$in': assigned_to_list}
    
    follow_ups = await tdb.follow_ups.find(query, {'_id': 0}).sort('scheduled_date', 1).to_list(1000)
    
    for fu in follow_ups:
        if isinstance(fu.get('created_at'), str):
            fu['created_at'] = datetime.fromisoformat(fu['created_at'].replace('Z', '+00:00'))
        if isinstance(fu.get('scheduled_date'), str):
            fu['scheduled_date'] = datetime.fromisoformat(fu['scheduled_date'].replace('Z', '+00:00'))
    
    return follow_ups


@router.put("/follow-ups/{follow_up_id}/complete")
async def complete_follow_up(follow_up_id: str, current_user: dict = Depends(get_current_user)):
    """Mark a follow-up as completed"""
    tdb = get_tdb()
    result = await tdb.follow_ups.update_one(
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
    tdb = get_tdb()
    comment_data = comment.model_dump()
    comment_data['id'] = str(uuid.uuid4())
    comment_data['created_by'] = current_user['id']
    comment_data['created_at'] = datetime.now(timezone.utc).isoformat()
    
    await tdb.comments.insert_one(comment_data)
    
    # @-mention notifications — parse the comment body for inline
    # `@[Name](user-id)` chips inserted by the frontend MentionTextarea.
    try:
        lead = await tdb.leads.find_one({'id': comment_data['lead_id']}, {'_id': 0, 'company': 1, 'contact_person': 1})
        lead_label = (lead or {}).get('company') or (lead or {}).get('contact_person') or 'lead'
        await notify_comment_mentions(
            tenant_id=get_current_tenant_id(),
            text=comment_data.get('comment') or '',
            current_user=current_user,
            link=f"/leads/{comment_data['lead_id']}",
            title=f"{current_user.get('name') or current_user.get('email') or 'Someone'} mentioned you",
            body=f"Comment on lead {lead_label}",
            entity_type='lead',
            entity_id=comment_data['lead_id'],
        )
    except Exception:
        pass
    
    comment_data['created_at'] = datetime.fromisoformat(comment_data['created_at'])
    return Comment(**comment_data)


@router.get("/{lead_id}/comments", response_model=List[Comment])
async def get_comments(lead_id: str, current_user: dict = Depends(get_current_user)):
    """Get all comments for a lead"""
    tdb = get_tdb()
    comments = await tdb.comments.find({'lead_id': lead_id}, {'_id': 0}).sort('created_at', -1).to_list(1000)
    
    for comment in comments:
        if isinstance(comment.get('created_at'), str):
            comment['created_at'] = datetime.fromisoformat(comment['created_at'].replace('Z', '+00:00'))
    
    return comments


# ============= INVOICE ROUTES (Lead-related) =============

@router.get("/{lead_id}/invoices")
async def get_lead_invoices(lead_id: str, current_user: dict = Depends(get_current_user)):
    """Get all invoices for a lead"""
    tdb = get_tdb()
    lead = await tdb.leads.find_one({'id': lead_id}, {'_id': 0, 'lead_id': 1})
    if not lead:
        raise HTTPException(status_code=404, detail='Lead not found')
    
    invoices = await tdb.invoices.find(
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
    """Upload a logo for a lead (stored in durable object storage)."""
    import time
    from object_storage import store_image

    tdb = get_tdb()
    lead = await tdb.leads.find_one({'id': lead_id}, {'_id': 0})
    if not lead:
        raise HTTPException(status_code=404, detail='Lead not found')

    # Read and validate file
    content = await logo.read()
    if not content:
        raise HTTPException(status_code=400, detail='Uploaded file is empty')
    if len(content) > 5 * 1024 * 1024:  # 5MB limit
        raise HTTPException(status_code=400, detail='File too large (max 5MB)')

    ext = (logo.filename.split('.')[-1].lower() if logo.filename and '.' in logo.filename else 'png')
    if ext not in ('png', 'jpg', 'jpeg', 'webp', 'gif'):
        ext = 'png'
    content_type = logo.content_type or ('image/jpeg' if ext == 'jpg' else f'image/{ext}')

    # Upload to durable object storage
    storage_path = store_image(f"leads/{lead_id}", content, content_type, ext)

    # Serve through our API; cache-bust with a version so re-uploads refresh immediately
    logo_url = f"/api/leads/{lead_id}/logo-image?v={int(time.time())}"
    await tdb.leads.update_one(
        {'id': lead_id},
        {'$set': {
            'logo_url': logo_url,
            'logo_storage_path': storage_path,
            'logo_content_type': content_type,
            'updated_at': datetime.now(timezone.utc).isoformat()
        }}
    )

    return {'message': 'Logo uploaded successfully', 'logo_url': logo_url}


@router.get("/{lead_id}/logo-image")
async def get_lead_logo_image(lead_id: str):
    """Public: stream a lead's logo bytes from object storage (used by <img src>)."""
    from object_storage import get_object

    tdb = get_tdb()
    lead = await tdb.leads.find_one(
        {'id': lead_id},
        {'_id': 0, 'logo_storage_path': 1, 'logo_content_type': 1}
    )
    if not lead or not lead.get('logo_storage_path'):
        raise HTTPException(status_code=404, detail='Logo not found')
    data, ct = get_object(lead['logo_storage_path'])
    return Response(content=data, media_type=lead.get('logo_content_type') or ct or 'image/png')


@router.delete("/{lead_id}/logo")
async def delete_lead_logo(lead_id: str, current_user: dict = Depends(get_current_user)):
    """Delete a lead's logo"""
    tdb = get_tdb()
    lead = await tdb.leads.find_one({'id': lead_id}, {'_id': 0})
    if not lead:
        raise HTTPException(status_code=404, detail='Lead not found')

    # Object storage has no delete API — drop the reference (soft delete).
    await tdb.leads.update_one(
        {'id': lead_id},
        {'$unset': {'logo_url': '', 'logo': '', 'logo_storage_path': '', 'logo_content_type': ''},
         '$set': {'updated_at': datetime.now(timezone.utc).isoformat()}}
    )

    return {'message': 'Logo deleted successfully'}


# ============= BOTTLE PREVIEW DESIGNS (approved mockups saved to a lead) =============

DESIGNS_DIR = '/app/backend/static/logos/leads/designs'


def _decode_data_url(data_url: str) -> bytes:
    """Decode a 'data:image/...;base64,....' string (or bare base64) to bytes."""
    if not data_url:
        raise HTTPException(status_code=400, detail='Missing image data')
    s = data_url.strip()
    if s.lower().startswith('data:') and ',' in s:
        s = s.split(',', 1)[1]
    try:
        raw = base64.b64decode(s, validate=True)
    except Exception:
        raise HTTPException(status_code=400, detail='Invalid image data')
    if not raw:
        raise HTTPException(status_code=400, detail='Invalid image data')
    return raw


@router.get("/{lead_id}/bottle-designs")
async def get_lead_bottle_designs(lead_id: str, current_user: dict = Depends(get_current_user)):
    """List approved bottle-preview designs saved on a lead (most recent first)."""
    tdb = get_tdb()
    lead = await tdb.leads.find_one({'$or': [{'id': lead_id}, {'lead_id': lead_id}]}, {'_id': 0, 'id': 1, 'bottle_designs': 1, 'company': 1, 'logo_url': 1})
    if not lead:
        raise HTTPException(status_code=404, detail='Lead not found')
    designs = lead.get('bottle_designs') or []
    designs = sorted(designs, key=lambda d: d.get('created_at') or '', reverse=True)
    return {'designs': designs, 'company': lead.get('company'), 'has_logo': bool(lead.get('logo_url')), 'lead_uuid': lead.get('id')}


class BottleDesignCreate(BaseModel):
    image_data: str                      # composite WITH quote strip (data URL / base64)
    clean_data: Optional[str] = None     # bottle + logo, no strip (data URL / base64)
    customer_name: Optional[str] = None
    bottle_template: Optional[str] = None
    bottle_template_name: Optional[str] = None
    logo_size_mm: Optional[int] = None
    price: Optional[float] = None
    replace_design_id: Optional[str] = None


@router.post("/{lead_id}/bottle-designs")
async def save_lead_bottle_design(lead_id: str, payload: BottleDesignCreate, current_user: dict = Depends(get_current_user)):
    """Save (or replace) an approved bottle-preview design on a lead. Supports multiple designs."""
    import time
    from object_storage import store_image

    tdb = get_tdb()
    lead = await tdb.leads.find_one({'id': lead_id}, {'_id': 0})
    if not lead:
        raise HTTPException(status_code=404, detail='Lead not found')

    designs = lead.get('bottle_designs') or []
    replace_id = payload.replace_design_id
    design_id = replace_id if (replace_id and any(d.get('id') == replace_id for d in designs)) else str(uuid.uuid4())
    ver = int(time.time())

    # Store the composite (with quote strip) in durable object storage
    image_path = store_image(f"leads/{lead_id}/designs", _decode_data_url(payload.image_data), 'image/png', 'png')
    image_url = f'/api/leads/{lead_id}/bottle-designs/{design_id}/image?v={ver}'

    # Optionally store the clean (bottle + logo, no strip) variant
    clean_path = None
    clean_url = None
    if payload.clean_data:
        clean_path = store_image(f"leads/{lead_id}/designs", _decode_data_url(payload.clean_data), 'image/png', 'png')
        clean_url = f'/api/leads/{lead_id}/bottle-designs/{design_id}/clean?v={ver}'

    entry = {
        'id': design_id,
        'image_url': image_url,
        'clean_url': clean_url,
        'image_storage_path': image_path,
        'clean_storage_path': clean_path,
        'customer_name': payload.customer_name,
        'bottle_template': payload.bottle_template,
        'bottle_template_name': payload.bottle_template_name,
        'logo_size_mm': payload.logo_size_mm,
        'price': payload.price,
        'created_at': datetime.now(timezone.utc).isoformat(),
        'created_by': current_user.get('name') or current_user.get('email'),
    }

    if design_id == replace_id:
        designs = [entry if d.get('id') == replace_id else d for d in designs]
        message = 'Design replaced'
    else:
        designs = designs + [entry]
        message = 'Design saved'

    await tdb.leads.update_one(
        {'id': lead_id},
        {'$set': {'bottle_designs': designs, 'updated_at': datetime.now(timezone.utc).isoformat()}}
    )
    return {'message': message, 'design': entry, 'count': len(designs)}


async def _serve_design_image(lead_id: str, design_id: str, field: str):
    from object_storage import get_object
    tdb = get_tdb()
    lead = await tdb.leads.find_one({'id': lead_id}, {'_id': 0, 'bottle_designs': 1})
    if not lead:
        raise HTTPException(status_code=404, detail='Lead not found')
    design = next((d for d in (lead.get('bottle_designs') or []) if d.get('id') == design_id), None)
    if not design or not design.get(field):
        raise HTTPException(status_code=404, detail='Design image not found')
    data, ct = get_object(design[field])
    return Response(content=data, media_type=ct or 'image/png')


@router.get("/{lead_id}/bottle-designs/{design_id}/image")
async def get_lead_bottle_design_image(lead_id: str, design_id: str):
    """Public: stream a saved design's composite (with quote strip) from object storage."""
    return await _serve_design_image(lead_id, design_id, 'image_storage_path')


@router.get("/{lead_id}/bottle-designs/{design_id}/clean")
async def get_lead_bottle_design_clean(lead_id: str, design_id: str):
    """Public: stream a saved design's clean (no-strip) image from object storage."""
    return await _serve_design_image(lead_id, design_id, 'clean_storage_path')


@router.delete("/{lead_id}/bottle-designs/{design_id}")
async def delete_lead_bottle_design(lead_id: str, design_id: str, current_user: dict = Depends(get_current_user)):
    """Delete a saved bottle-preview design from a lead (object storage has no delete — drop the reference)."""
    tdb = get_tdb()
    lead = await tdb.leads.find_one({'id': lead_id}, {'_id': 0})
    if not lead:
        raise HTTPException(status_code=404, detail='Lead not found')

    designs = lead.get('bottle_designs') or []
    remaining = [d for d in designs if d.get('id') != design_id]
    if len(remaining) == len(designs):
        raise HTTPException(status_code=404, detail='Design not found')

    await tdb.leads.update_one(
        {'id': lead_id},
        {'$set': {'bottle_designs': remaining, 'updated_at': datetime.now(timezone.utc).isoformat()}}
    )
    return {'message': 'Design deleted', 'count': len(remaining)}



# ============= OPPORTUNITY ESTIMATION (Water Brand Industry Feature) =============

class OpportunityEstimationInput(BaseModel):
    """Input for opportunity estimation - water brand specific"""
    total_covers: int = 100
    operating_pattern: dict = {
        "morning": {"enabled": True, "density": 60},
        "evening": {"enabled": True, "density": 80},
        "night": {"enabled": True, "density": 90},
        "snacks": {"enabled": False, "density": 40}
    }
    dining_behavior: dict = {
        "avg_table_time": 45,
        "water_adoption_rate": 70,
        "operating_days": 30
    }
    calculated_daily: Optional[int] = None
    calculated_monthly: Optional[int] = None
    override_value: Optional[int] = None
    final_monthly: Optional[int] = None
    final_daily: Optional[int] = None


@router.put("/{lead_id}/opportunity-estimation")
async def update_opportunity_estimation(
    lead_id: str,
    estimation: OpportunityEstimationInput,
    current_user: dict = Depends(get_current_user)
):
    """
    Save opportunity estimation for a lead (water brand industry feature).
    This estimates the potential bottle volume based on venue characteristics.
    """
    tdb = get_tdb()
    
    # Verify lead exists
    lead = await tdb.leads.find_one({'id': lead_id}, {'_id': 0})
    if not lead:
        raise HTTPException(status_code=404, detail="Lead not found")
    
    # Build estimation data
    estimation_data = {
        'total_covers': estimation.total_covers,
        'operating_pattern': estimation.operating_pattern,
        'dining_behavior': estimation.dining_behavior,
        'calculated_daily': estimation.calculated_daily,
        'calculated_monthly': estimation.calculated_monthly,
        'override_value': estimation.override_value,
        'final_monthly': estimation.final_monthly,
        'final_daily': estimation.final_daily,
        'estimated_by': current_user['id'],
        'estimated_at': datetime.now(timezone.utc).isoformat()
    }
    
    # Calculate estimated_monthly_revenue based on proposed_sku_pricing
    proposed_sku_pricing = lead.get('proposed_sku_pricing') or []
    estimated_revenue = 0
    monthly_bottles = estimation.final_monthly or estimation.calculated_monthly or 0
    
    for sku in proposed_sku_pricing:
        percentage = sku.get('percentage', 0)
        price_per_unit = sku.get('price_per_unit', 0)
        estimated_qty = round((monthly_bottles * percentage) / 100) if percentage else 0
        estimated_revenue += estimated_qty * price_per_unit
    
    estimation_data['estimated_monthly_revenue'] = estimated_revenue
    estimation_data['monthly_bottles'] = monthly_bottles
    
    # Update lead with estimation
    await tdb.leads.update_one(
        {'id': lead_id},
        {'$set': {
            'opportunity_estimation': estimation_data,
            'estimated_value': estimation.final_monthly,  # Also update legacy field
            'updated_at': datetime.now(timezone.utc).isoformat()
        }}
    )
    
    return {
        'message': 'Opportunity estimation saved',
        'lead_id': lead_id,
        'estimation': estimation_data
    }


@router.get("/{lead_id}/opportunity-estimation")
async def get_opportunity_estimation(
    lead_id: str,
    current_user: dict = Depends(get_current_user)
):
    """Get opportunity estimation for a lead"""
    tdb = get_tdb()
    
    lead = await tdb.leads.find_one({'id': lead_id}, {'_id': 0, 'opportunity_estimation': 1, 'company': 1})
    if not lead:
        raise HTTPException(status_code=404, detail="Lead not found")
    
    estimation = lead.get('opportunity_estimation')
    
    if not estimation:
        return {
            'lead_id': lead_id,
            'has_estimation': False,
            'message': 'No estimation found for this lead'
        }
    
    return {
        'lead_id': lead_id,
        'company': lead.get('company'),
        'has_estimation': True,
        'estimation': estimation
    }
