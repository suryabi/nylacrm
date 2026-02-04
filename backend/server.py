from fastapi import FastAPI, APIRouter, HTTPException, Depends, status
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from dotenv import load_dotenv
from starlette.middleware.cors import CORSMiddleware
from motor.motor_asyncio import AsyncIOMotorClient
import os
import logging
from pathlib import Path
from pydantic import BaseModel, Field, ConfigDict, EmailStr
from typing import List, Optional
import uuid
from datetime import datetime, timezone, timedelta
import jwt
import bcrypt

ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / '.env')

# MongoDB connection
mongo_url = os.environ['MONGO_URL']
client = AsyncIOMotorClient(mongo_url)
db = client[os.environ['DB_NAME']]

# JWT Configuration
JWT_SECRET = os.environ['JWT_SECRET']
JWT_ALGORITHM = 'HS256'
JWT_EXPIRATION_HOURS = 24

security = HTTPBearer()

# Create the main app
app = FastAPI()
api_router = APIRouter(prefix="/api")

# ============= MODELS =============

class UserRole(BaseModel):
    role: str  # 'admin', 'sales_manager', 'sales_rep'

class User(BaseModel):
    model_config = ConfigDict(extra="ignore")
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    email: EmailStr
    name: str
    role: str  # 'ceo', 'director', 'vp', 'admin', 'sales_manager', 'sales_rep'
    designation: Optional[str] = None  # Full title like 'CEO & Managing Director'
    phone: Optional[str] = None
    avatar: Optional[str] = None
    city: Optional[str] = None
    state: Optional[str] = None
    country: Optional[str] = None
    territory: Optional[str] = None
    reports_to: Optional[str] = None  # user_id of direct manager
    dotted_line_to: Optional[str] = None  # user_id for dotted line reporting
    is_active: bool = True
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))

class UserCreate(BaseModel):
    email: EmailStr
    password: str
    name: str
    role: str = 'sales_rep'
    designation: Optional[str] = None
    phone: Optional[str] = None
    city: Optional[str] = None
    state: Optional[str] = None
    country: Optional[str] = None
    territory: Optional[str] = None
    reports_to: Optional[str] = None
    dotted_line_to: Optional[str] = None

class UserLogin(BaseModel):
    email: EmailStr
    password: str

class LeadStatus(BaseModel):
    status: str  # 'new', 'contacted', 'qualified', 'proposal', 'closed_won', 'closed_lost'

class Lead(BaseModel):
    model_config = ConfigDict(extra="ignore")
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    name: str
    email: Optional[EmailStr] = None
    phone: Optional[str] = None
    company: Optional[str] = None
    status: str = 'new'
    source: Optional[str] = None  # 'website', 'referral', 'cold_call', 'social_media', etc.
    assigned_to: Optional[str] = None  # user_id
    estimated_value: Optional[float] = None
    priority: Optional[str] = 'medium'  # 'low', 'medium', 'high'
    notes: Optional[str] = None
    city: Optional[str] = None
    state: Optional[str] = None
    country: Optional[str] = None
    region: Optional[str] = None  # Business region/territory
    created_by: str
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    updated_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))

class LeadCreate(BaseModel):
    name: str
    email: Optional[EmailStr] = None
    phone: Optional[str] = None
    company: Optional[str] = None
    status: str = 'new'
    source: Optional[str] = None
    assigned_to: Optional[str] = None
    estimated_value: Optional[float] = None
    priority: Optional[str] = 'medium'
    notes: Optional[str] = None
    city: Optional[str] = None
    state: Optional[str] = None
    country: Optional[str] = None
    region: Optional[str] = None

class LeadUpdate(BaseModel):
    name: Optional[str] = None
    email: Optional[EmailStr] = None
    phone: Optional[str] = None
    company: Optional[str] = None
    status: Optional[str] = None
    source: Optional[str] = None
    assigned_to: Optional[str] = None
    estimated_value: Optional[float] = None
    priority: Optional[str] = None
    notes: Optional[str] = None
    city: Optional[str] = None
    state: Optional[str] = None
    country: Optional[str] = None
    region: Optional[str] = None

class Activity(BaseModel):
    model_config = ConfigDict(extra="ignore")
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    lead_id: str
    activity_type: str  # 'call', 'email', 'meeting', 'note', 'status_change'
    description: str
    created_by: str
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))

class ActivityCreate(BaseModel):
    lead_id: str
    activity_type: str
    description: str

class FollowUp(BaseModel):
    model_config = ConfigDict(extra="ignore")
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

class FollowUpCreate(BaseModel):
    lead_id: str
    title: str
    description: Optional[str] = None
    scheduled_date: datetime
    assigned_to: str

class Comment(BaseModel):
    model_config = ConfigDict(extra="ignore")
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    lead_id: str
    comment: str
    created_by: str
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))

class CommentCreate(BaseModel):
    lead_id: str
    comment: str

# ============= HELPERS =============

def hash_password(password: str) -> str:
    return bcrypt.hashpw(password.encode('utf-8'), bcrypt.gensalt()).decode('utf-8')

def verify_password(password: str, hashed: str) -> bool:
    return bcrypt.checkpw(password.encode('utf-8'), hashed.encode('utf-8'))

def create_access_token(user_id: str, email: str, role: str) -> str:
    expiration = datetime.now(timezone.utc) + timedelta(hours=JWT_EXPIRATION_HOURS)
    payload = {
        'user_id': user_id,
        'email': email,
        'role': role,
        'exp': expiration
    }
    return jwt.encode(payload, JWT_SECRET, algorithm=JWT_ALGORITHM)

async def get_current_user(credentials: HTTPAuthorizationCredentials = Depends(security)):
    try:
        token = credentials.credentials
        payload = jwt.decode(token, JWT_SECRET, algorithms=[JWT_ALGORITHM])
        user_id = payload.get('user_id')
        user_doc = await db.users.find_one({'id': user_id}, {'_id': 0})
        if not user_doc:
            raise HTTPException(status_code=401, detail='User not found')
        return user_doc
    except jwt.ExpiredSignatureError:
        raise HTTPException(status_code=401, detail='Token expired')
    except jwt.InvalidTokenError:
        raise HTTPException(status_code=401, detail='Invalid token')

# ============= AUTH ROUTES =============

@api_router.post("/auth/register", response_model=User)
async def register(user_input: UserCreate):
    # Check if user exists
    existing = await db.users.find_one({'email': user_input.email}, {'_id': 0})
    if existing:
        raise HTTPException(status_code=400, detail='Email already registered')
    
    # Create user
    hashed_pw = hash_password(user_input.password)
    user_data = user_input.model_dump()
    user_data.pop('password')
    user_obj = User(**user_data)
    
    doc = user_obj.model_dump()
    doc['password'] = hashed_pw
    doc['created_at'] = doc['created_at'].isoformat()
    
    await db.users.insert_one(doc)
    return user_obj

@api_router.post("/auth/login")
async def login(credentials: UserLogin):
    user_doc = await db.users.find_one({'email': credentials.email}, {'_id': 0})
    if not user_doc or not verify_password(credentials.password, user_doc['password']):
        raise HTTPException(status_code=401, detail='Invalid credentials')
    
    if not user_doc.get('is_active', True):
        raise HTTPException(status_code=401, detail='Account is inactive')
    
    token = create_access_token(user_doc['id'], user_doc['email'], user_doc['role'])
    
    user_doc.pop('password')
    if isinstance(user_doc['created_at'], str):
        user_doc['created_at'] = datetime.fromisoformat(user_doc['created_at'])
    
    return {
        'access_token': token,
        'token_type': 'bearer',
        'user': user_doc
    }

@api_router.get("/auth/me", response_model=User)
async def get_me(current_user: dict = Depends(get_current_user)):
    if isinstance(current_user['created_at'], str):
        current_user['created_at'] = datetime.fromisoformat(current_user['created_at'])
    return current_user

# ============= LEADS ROUTES =============

@api_router.post("/leads", response_model=Lead)
async def create_lead(lead_input: LeadCreate, current_user: dict = Depends(get_current_user)):
    lead_data = lead_input.model_dump()
    lead_data['created_by'] = current_user['id']
    lead_obj = Lead(**lead_data)
    
    doc = lead_obj.model_dump()
    doc['created_at'] = doc['created_at'].isoformat()
    doc['updated_at'] = doc['updated_at'].isoformat()
    
    await db.leads.insert_one(doc)
    
    # Create initial activity
    activity = Activity(
        lead_id=lead_obj.id,
        activity_type='note',
        description=f'Lead created by {current_user["name"]}',
        created_by=current_user['id']
    )
    activity_doc = activity.model_dump()
    activity_doc['created_at'] = activity_doc['created_at'].isoformat()
    await db.activities.insert_one(activity_doc)
    
    return lead_obj

@api_router.get("/leads", response_model=List[Lead])
async def get_leads(
    skip: int = 0,
    limit: int = 100,
    status: Optional[str] = None,
    city: Optional[str] = None,
    state: Optional[str] = None,
    country: Optional[str] = None,
    region: Optional[str] = None,
    current_user: dict = Depends(get_current_user)
):
    # Build query based on role and filters
    query = {}
    
    if current_user['role'] not in ['admin', 'sales_manager']:
        query['assigned_to'] = current_user['id']
    
    # Add location filters
    if status:
        query['status'] = status
    if city:
        query['city'] = city
    if state:
        query['state'] = state
    if country:
        query['country'] = country
    if region:
        query['region'] = region
    
    leads = await db.leads.find(query, {'_id': 0}).skip(skip).limit(limit).to_list(limit)
    
    for lead in leads:
        if isinstance(lead['created_at'], str):
            lead['created_at'] = datetime.fromisoformat(lead['created_at'])
        if isinstance(lead['updated_at'], str):
            lead['updated_at'] = datetime.fromisoformat(lead['updated_at'])
    
    return leads

@api_router.get("/leads/{lead_id}", response_model=Lead)
async def get_lead(lead_id: str, current_user: dict = Depends(get_current_user)):
    lead = await db.leads.find_one({'id': lead_id}, {'_id': 0})
    if not lead:
        raise HTTPException(status_code=404, detail='Lead not found')
    
    # Check permission
    if current_user['role'] == 'sales_rep' and lead.get('assigned_to') != current_user['id']:
        raise HTTPException(status_code=403, detail='Access denied')
    
    if isinstance(lead['created_at'], str):
        lead['created_at'] = datetime.fromisoformat(lead['created_at'])
    if isinstance(lead['updated_at'], str):
        lead['updated_at'] = datetime.fromisoformat(lead['updated_at'])
    
    return lead

@api_router.put("/leads/{lead_id}", response_model=Lead)
async def update_lead(lead_id: str, lead_update: LeadUpdate, current_user: dict = Depends(get_current_user)):
    lead = await db.leads.find_one({'id': lead_id}, {'_id': 0})
    if not lead:
        raise HTTPException(status_code=404, detail='Lead not found')
    
    # Check permission
    if current_user['role'] == 'sales_rep' and lead.get('assigned_to') != current_user['id']:
        raise HTTPException(status_code=403, detail='Access denied')
    
    update_data = {k: v for k, v in lead_update.model_dump().items() if v is not None}
    update_data['updated_at'] = datetime.now(timezone.utc).isoformat()
    
    # Track status change
    if 'status' in update_data and update_data['status'] != lead.get('status'):
        activity = Activity(
            lead_id=lead_id,
            activity_type='status_change',
            description=f'Status changed from {lead.get("status")} to {update_data["status"]} by {current_user["name"]}',
            created_by=current_user['id']
        )
        activity_doc = activity.model_dump()
        activity_doc['created_at'] = activity_doc['created_at'].isoformat()
        await db.activities.insert_one(activity_doc)
    
    await db.leads.update_one({'id': lead_id}, {'$set': update_data})
    
    updated_lead = await db.leads.find_one({'id': lead_id}, {'_id': 0})
    if isinstance(updated_lead['created_at'], str):
        updated_lead['created_at'] = datetime.fromisoformat(updated_lead['created_at'])
    if isinstance(updated_lead['updated_at'], str):
        updated_lead['updated_at'] = datetime.fromisoformat(updated_lead['updated_at'])
    
    return updated_lead

@api_router.delete("/leads/{lead_id}")
async def delete_lead(lead_id: str, current_user: dict = Depends(get_current_user)):
    if current_user['role'] not in ['admin', 'sales_manager']:
        raise HTTPException(status_code=403, detail='Only admin and sales managers can delete leads')
    
    result = await db.leads.delete_one({'id': lead_id})
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail='Lead not found')
    
    # Delete related data
    await db.activities.delete_many({'lead_id': lead_id})
    await db.follow_ups.delete_many({'lead_id': lead_id})
    await db.comments.delete_many({'lead_id': lead_id})
    
    return {'message': 'Lead deleted successfully'}

# ============= ACTIVITIES ROUTES =============

@api_router.post("/activities", response_model=Activity)
async def create_activity(activity_input: ActivityCreate, current_user: dict = Depends(get_current_user)):
    activity_data = activity_input.model_dump()
    activity_data['created_by'] = current_user['id']
    activity_obj = Activity(**activity_data)
    
    doc = activity_obj.model_dump()
    doc['created_at'] = doc['created_at'].isoformat()
    
    await db.activities.insert_one(doc)
    return activity_obj

@api_router.get("/activities/{lead_id}", response_model=List[Activity])
async def get_activities(
    lead_id: str,
    skip: int = 0,
    limit: int = 100,
    current_user: dict = Depends(get_current_user)
):
    activities = await db.activities.find({'lead_id': lead_id}, {'_id': 0}).sort('created_at', -1).skip(skip).limit(limit).to_list(limit)
    
    for activity in activities:
        if isinstance(activity['created_at'], str):
            activity['created_at'] = datetime.fromisoformat(activity['created_at'])
    
    return activities

# ============= FOLLOW-UPS ROUTES =============

@api_router.post("/follow-ups", response_model=FollowUp)
async def create_follow_up(follow_up_input: FollowUpCreate, current_user: dict = Depends(get_current_user)):
    follow_up_data = follow_up_input.model_dump()
    follow_up_data['created_by'] = current_user['id']
    follow_up_obj = FollowUp(**follow_up_data)
    
    doc = follow_up_obj.model_dump()
    doc['created_at'] = doc['created_at'].isoformat()
    doc['scheduled_date'] = doc['scheduled_date'].isoformat()
    if doc.get('completed_at'):
        doc['completed_at'] = doc['completed_at'].isoformat()
    
    await db.follow_ups.insert_one(doc)
    
    # Create activity
    activity = Activity(
        lead_id=follow_up_obj.lead_id,
        activity_type='note',
        description=f'Follow-up scheduled: {follow_up_obj.title}',
        created_by=current_user['id']
    )
    activity_doc = activity.model_dump()
    activity_doc['created_at'] = activity_doc['created_at'].isoformat()
    await db.activities.insert_one(activity_doc)
    
    return follow_up_obj

@api_router.get("/follow-ups", response_model=List[FollowUp])
async def get_follow_ups(
    skip: int = 0,
    limit: int = 100,
    current_user: dict = Depends(get_current_user)
):
    # Get follow-ups assigned to current user or created by them
    if current_user['role'] in ['admin', 'sales_manager']:
        follow_ups = await db.follow_ups.find({}, {'_id': 0}).skip(skip).limit(limit).to_list(limit)
    else:
        follow_ups = await db.follow_ups.find({'assigned_to': current_user['id']}, {'_id': 0}).skip(skip).limit(limit).to_list(limit)
    
    for follow_up in follow_ups:
        if isinstance(follow_up['created_at'], str):
            follow_up['created_at'] = datetime.fromisoformat(follow_up['created_at'])
        if isinstance(follow_up['scheduled_date'], str):
            follow_up['scheduled_date'] = datetime.fromisoformat(follow_up['scheduled_date'])
        if follow_up.get('completed_at') and isinstance(follow_up['completed_at'], str):
            follow_up['completed_at'] = datetime.fromisoformat(follow_up['completed_at'])
    
    return follow_ups

@api_router.put("/follow-ups/{follow_up_id}/complete")
async def complete_follow_up(follow_up_id: str, current_user: dict = Depends(get_current_user)):
    result = await db.follow_ups.update_one(
        {'id': follow_up_id},
        {'$set': {'is_completed': True, 'completed_at': datetime.now(timezone.utc).isoformat()}}
    )
    
    if result.matched_count == 0:
        raise HTTPException(status_code=404, detail='Follow-up not found')
    
    return {'message': 'Follow-up completed'}

# ============= COMMENTS ROUTES =============

@api_router.post("/comments", response_model=Comment)
async def create_comment(comment_input: CommentCreate, current_user: dict = Depends(get_current_user)):
    comment_data = comment_input.model_dump()
    comment_data['created_by'] = current_user['id']
    comment_obj = Comment(**comment_data)
    
    doc = comment_obj.model_dump()
    doc['created_at'] = doc['created_at'].isoformat()
    
    await db.comments.insert_one(doc)
    
    # Create activity
    activity = Activity(
        lead_id=comment_obj.lead_id,
        activity_type='note',
        description=f'Comment added by {current_user["name"]}',
        created_by=current_user['id']
    )
    activity_doc = activity.model_dump()
    activity_doc['created_at'] = activity_doc['created_at'].isoformat()
    await db.activities.insert_one(activity_doc)
    
    return comment_obj

@api_router.get("/comments/{lead_id}", response_model=List[Comment])
async def get_comments(
    lead_id: str,
    skip: int = 0,
    limit: int = 100,
    current_user: dict = Depends(get_current_user)
):
    comments = await db.comments.find({'lead_id': lead_id}, {'_id': 0}).sort('created_at', -1).skip(skip).limit(limit).to_list(limit)
    
    for comment in comments:
        if isinstance(comment['created_at'], str):
            comment['created_at'] = datetime.fromisoformat(comment['created_at'])
    
    return comments

# ============= USERS/TEAM ROUTES =============

@api_router.get("/users", response_model=List[User])
async def get_users(
    skip: int = 0,
    limit: int = 100,
    current_user: dict = Depends(get_current_user)
):
    users = await db.users.find({}, {'_id': 0, 'password': 0}).skip(skip).limit(limit).to_list(limit)
    
    for user in users:
        if isinstance(user['created_at'], str):
            user['created_at'] = datetime.fromisoformat(user['created_at'])
    
    return users

@api_router.get("/users/org-chart")
async def get_org_chart(current_user: dict = Depends(get_current_user)):
    """Get organizational hierarchy chart"""
    users = await db.users.find({}, {'_id': 0, 'password': 0}).to_list(1000)
    
    # Convert datetime strings
    for user in users:
        if isinstance(user.get('created_at'), str):
            user['created_at'] = datetime.fromisoformat(user['created_at'])
    
    # Build hierarchy
    users_by_id = {user['id']: user for user in users}
    
    # Find root (CEO - no reports_to)
    root = None
    for user in users:
        if not user.get('reports_to'):
            root = user
            break
    
    # Build tree structure
    def build_tree(user_id):
        user = users_by_id.get(user_id)
        if not user:
            return None
        
        # Find direct reports
        direct_reports = [u for u in users if u.get('reports_to') == user_id]
        
        # Find dotted line reports
        dotted_reports = [u for u in users if u.get('dotted_line_to') == user_id]
        
        node = {
            'id': user['id'],
            'name': user['name'],
            'role': user['role'],
            'designation': user.get('designation', user['role'].replace('_', ' ').title()),
            'email': user['email'],
            'phone': user.get('phone'),
            'city': user.get('city'),
            'state': user.get('state'),
            'territory': user.get('territory'),
            'direct_reports': [build_tree(r['id']) for r in direct_reports],
            'dotted_line_reports': [
                {
                    'id': r['id'],
                    'name': r['name'],
                    'role': r['role'],
                    'designation': r.get('designation', r['role'].replace('_', ' ').title())
                }
                for r in dotted_reports
            ]
        }
        return node
    
    if root:
        org_chart = build_tree(root['id'])
        return {'org_chart': org_chart, 'total_employees': len(users)}
    
    return {'org_chart': None, 'total_employees': len(users), 'users': users}

@api_router.put("/users/{user_id}")
async def update_user(user_id: str, updates: dict, current_user: dict = Depends(get_current_user)):
    if current_user['role'] != 'admin':
        raise HTTPException(status_code=403, detail='Only admins can update users')
    
    # Remove sensitive fields
    updates.pop('password', None)
    updates.pop('id', None)
    
    result = await db.users.update_one({'id': user_id}, {'$set': updates})
    
    if result.matched_count == 0:
        raise HTTPException(status_code=404, detail='User not found')
    
    return {'message': 'User updated successfully'}

# ============= ANALYTICS/REPORTS ROUTES =============

@api_router.get("/analytics/dashboard")
async def get_dashboard_analytics(current_user: dict = Depends(get_current_user)):
    # Build match stage based on role
    match_stage = {} if current_user['role'] in ['admin', 'sales_manager'] else {'assigned_to': current_user['id']}
    
    # Use aggregation for status distribution
    status_pipeline = [
        {'$match': match_stage},
        {'$group': {'_id': '$status', 'count': {'$sum': 1}}}
    ]
    status_results = await db.leads.aggregate(status_pipeline).to_list(100)
    status_counts = {item['_id']: item['count'] for item in status_results}
    
    # Calculate total leads
    total_leads = sum(status_counts.values())
    
    # Calculate conversion rate
    closed_won = status_counts.get('closed_won', 0)
    conversion_rate = (closed_won / total_leads * 100) if total_leads > 0 else 0
    
    # Calculate pipeline value using aggregation
    pipeline_value_pipeline = [
        {'$match': {**match_stage, 'status': {'$ne': 'closed_lost'}}},
        {'$group': {'_id': None, 'total_value': {'$sum': '$estimated_value'}}}
    ]
    pipeline_value_result = await db.leads.aggregate(pipeline_value_pipeline).to_list(1)
    pipeline_value = pipeline_value_result[0]['total_value'] if pipeline_value_result else 0
    
    # Get today's follow-ups count using MongoDB query
    today = datetime.now(timezone.utc).date()
    today_start = datetime.combine(today, datetime.min.time()).replace(tzinfo=timezone.utc).isoformat()
    today_end = datetime.combine(today, datetime.max.time()).replace(tzinfo=timezone.utc).isoformat()
    
    today_follow_ups_count = await db.follow_ups.count_documents({
        'is_completed': False,
        'scheduled_date': {'$gte': today_start, '$lte': today_end}
    })
    
    return {
        'total_leads': total_leads,
        'conversion_rate': round(conversion_rate, 2),
        'pipeline_value': pipeline_value or 0,
        'today_follow_ups': today_follow_ups_count,
        'status_distribution': status_counts
    }

@api_router.get("/analytics/reports")
async def get_reports(current_user: dict = Depends(get_current_user)):
    # Build match stage based on role
    match_stage = {} if current_user['role'] in ['admin', 'sales_manager'] else {'assigned_to': current_user['id']}
    
    # Lead source analysis using aggregation
    source_pipeline = [
        {'$match': match_stage},
        {'$group': {'_id': {'$ifNull': ['$source', 'unknown']}, 'count': {'$sum': 1}}}
    ]
    source_results = await db.leads.aggregate(source_pipeline).to_list(100)
    source_counts = {item['_id']: item['count'] for item in source_results}
    
    # Team performance (for admins/managers) using aggregation
    team_performance = []
    if current_user['role'] in ['admin', 'sales_manager']:
        team_pipeline = [
            {'$match': match_stage},
            {'$group': {
                '_id': '$assigned_to',
                'total_leads': {'$sum': 1},
                'closed_won': {
                    '$sum': {'$cond': [{'$eq': ['$status', 'closed_won']}, 1, 0]}
                }
            }}
        ]
        team_results = await db.leads.aggregate(team_pipeline).to_list(100)
        
        # Get user names
        user_ids = [item['_id'] for item in team_results if item['_id']]
        users = await db.users.find(
            {'id': {'$in': user_ids}},
            {'_id': 0, 'id': 1, 'name': 1}
        ).to_list(100)
        user_map = {user['id']: user['name'] for user in users}
        
        for item in team_results:
            if item['_id']:
                total = item['total_leads']
                won = item['closed_won']
                team_performance.append({
                    'name': user_map.get(item['_id'], 'Unknown'),
                    'total_leads': total,
                    'closed_won': won,
                    'conversion_rate': round(won / total * 100, 2) if total > 0 else 0
                })
    
    # Monthly trends using aggregation
    monthly_pipeline = [
        {'$match': match_stage},
        {'$group': {
            '_id': {
                'month': {'$dateToString': {'format': '%Y-%m', 'date': {'$toDate': '$created_at'}}},
                'status': '$status'
            },
            'count': {'$sum': 1}
        }}
    ]
    monthly_results = await db.leads.aggregate(monthly_pipeline).to_list(1000)
    
    # Transform monthly results into desired format
    monthly_data = {}
    for item in monthly_results:
        month = item['_id']['month']
        status = item['_id']['status']
        if month not in monthly_data:
            monthly_data[month] = {'new': 0, 'closed_won': 0, 'closed_lost': 0}
        if status == 'closed_won':
            monthly_data[month]['closed_won'] = item['count']
        elif status == 'closed_lost':
            monthly_data[month]['closed_lost'] = item['count']
        monthly_data[month]['new'] += item['count']
    
    return {
        'source_analysis': source_counts,
        'team_performance': team_performance,
        'monthly_trends': monthly_data
    }

@api_router.get("/analytics/locations")
async def get_location_analytics(current_user: dict = Depends(get_current_user)):
    # Build match stage based on role
    match_stage = {} if current_user['role'] in ['admin', 'sales_manager'] else {'assigned_to': current_user['id']}
    
    # Leads by country
    country_pipeline = [
        {'$match': match_stage},
        {'$group': {
            '_id': {'$ifNull': ['$country', 'Unknown']},
            'total_leads': {'$sum': 1},
            'closed_won': {'$sum': {'$cond': [{'$eq': ['$status', 'closed_won']}, 1, 0]}},
            'pipeline_value': {'$sum': '$estimated_value'}
        }},
        {'$sort': {'total_leads': -1}}
    ]
    country_results = await db.leads.aggregate(country_pipeline).to_list(100)
    
    # Leads by state/region
    state_pipeline = [
        {'$match': match_stage},
        {'$group': {
            '_id': {'$ifNull': ['$state', 'Unknown']},
            'total_leads': {'$sum': 1},
            'closed_won': {'$sum': {'$cond': [{'$eq': ['$status', 'closed_won']}, 1, 0]}},
            'pipeline_value': {'$sum': '$estimated_value'}
        }},
        {'$sort': {'total_leads': -1}}
    ]
    state_results = await db.leads.aggregate(state_pipeline).to_list(100)
    
    # Leads by city
    city_pipeline = [
        {'$match': match_stage},
        {'$group': {
            '_id': {'$ifNull': ['$city', 'Unknown']},
            'total_leads': {'$sum': 1},
            'closed_won': {'$sum': {'$cond': [{'$eq': ['$status', 'closed_won']}, 1, 0]}},
            'pipeline_value': {'$sum': '$estimated_value'}
        }},
        {'$sort': {'total_leads': -1}},
        {'$limit': 20}  # Top 20 cities
    ]
    city_results = await db.leads.aggregate(city_pipeline).to_list(20)
    
    # Leads by region (business territory)
    region_pipeline = [
        {'$match': match_stage},
        {'$group': {
            '_id': {'$ifNull': ['$region', 'Unknown']},
            'total_leads': {'$sum': 1},
            'closed_won': {'$sum': {'$cond': [{'$eq': ['$status', 'closed_won']}, 1, 0]}},
            'pipeline_value': {'$sum': '$estimated_value'}
        }},
        {'$sort': {'total_leads': -1}}
    ]
    region_results = await db.leads.aggregate(region_pipeline).to_list(100)
    
    # Team locations
    team_locations = []
    if current_user['role'] in ['admin', 'sales_manager']:
        users = await db.users.find(
            {},
            {'_id': 0, 'id': 1, 'name': 1, 'city': 1, 'state': 1, 'country': 1, 'territory': 1}
        ).to_list(100)
        team_locations = [
            {
                'name': user['name'],
                'city': user.get('city', 'Unknown'),
                'state': user.get('state', 'Unknown'),
                'country': user.get('country', 'Unknown'),
                'territory': user.get('territory', 'Unknown')
            }
            for user in users
        ]
    
    return {
        'by_country': [
            {
                'country': item['_id'],
                'total_leads': item['total_leads'],
                'closed_won': item['closed_won'],
                'pipeline_value': item['pipeline_value'] or 0,
                'conversion_rate': round(item['closed_won'] / item['total_leads'] * 100, 2) if item['total_leads'] > 0 else 0
            }
            for item in country_results
        ],
        'by_state': [
            {
                'state': item['_id'],
                'total_leads': item['total_leads'],
                'closed_won': item['closed_won'],
                'pipeline_value': item['pipeline_value'] or 0,
                'conversion_rate': round(item['closed_won'] / item['total_leads'] * 100, 2) if item['total_leads'] > 0 else 0
            }
            for item in state_results
        ],
        'by_city': [
            {
                'city': item['_id'],
                'total_leads': item['total_leads'],
                'closed_won': item['closed_won'],
                'pipeline_value': item['pipeline_value'] or 0,
                'conversion_rate': round(item['closed_won'] / item['total_leads'] * 100, 2) if item['total_leads'] > 0 else 0
            }
            for item in city_results
        ],
        'by_region': [
            {
                'region': item['_id'],
                'total_leads': item['total_leads'],
                'closed_won': item['closed_won'],
                'pipeline_value': item['pipeline_value'] or 0,
                'conversion_rate': round(item['closed_won'] / item['total_leads'] * 100, 2) if item['total_leads'] > 0 else 0
            }
            for item in region_results
        ],
        'team_locations': team_locations
    }

# ============= INCLUDE ROUTER =============

app.include_router(api_router)

app.add_middleware(
    CORSMiddleware,
    allow_credentials=True,
    allow_origins=os.environ.get('CORS_ORIGINS', '*').split(','),
    allow_methods=["*"],
    allow_headers=["*"],
)

logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)

@app.on_event("shutdown")
async def shutdown_db_client():
    client.close()
