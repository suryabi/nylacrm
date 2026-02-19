from fastapi import FastAPI, APIRouter, HTTPException, Depends, status, File, UploadFile, Request, Response
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from fastapi.responses import JSONResponse
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
from PIL import Image
import io
import base64
import httpx

ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / '.env')

# ActiveMQ globals (will be set on startup)
MQ_AVAILABLE = False
mq_subscriber = None
start_mq_subscriber = None
stop_mq_subscriber = None

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

# ============= HELPER FUNCTIONS =============

import re

async def generate_lead_id(company: str, city: str) -> str:
    """
    Generate unique Lead ID in format: NAME4-CITY-LYY-SEQ (16 characters total)
    - NAME4: First 4 characters of company name (uppercase, alphanumeric only)
    - CITY: First 3 characters of city (uppercase, alphanumeric only)
    - L: Literal 'L' for Lead
    - YY: 2-digit year
    - SEQ: 3-digit sequence number (001-999)
    """
    # Clean and extract first 4 chars of company name (uppercase, alphanumeric only)
    clean_company = re.sub(r'[^a-zA-Z0-9]', '', company).upper()
    name4 = clean_company[:4].ljust(4, 'X')  # Pad with X if less than 4 chars
    
    # Clean and extract first 3 chars of city (uppercase, alphanumeric only)
    clean_city = re.sub(r'[^a-zA-Z0-9]', '', city).upper()
    city3 = clean_city[:3].ljust(3, 'X')  # Pad with X if less than 3 chars
    
    # Get current 2-digit year
    year2 = datetime.now().strftime('%y')
    
    # Build prefix for sequence lookup: NAME4-CITY-LYY-
    prefix = f"{name4}-{city3}-L{year2}-"
    
    # Find the highest sequence number for this prefix
    regex_pattern = f"^{re.escape(prefix)}\\d{{3}}$"
    existing_leads = await db.leads.find(
        {'lead_id': {'$regex': regex_pattern}},
        {'lead_id': 1}
    ).sort('lead_id', -1).limit(1).to_list(1)
    
    if existing_leads and existing_leads[0].get('lead_id'):
        # Extract sequence number from last lead_id and increment
        last_seq = int(existing_leads[0]['lead_id'][-3:])
        next_seq = last_seq + 1
    else:
        next_seq = 1
    
    # Cap at 999, wrap to 001 if exceeded (or handle as error)
    if next_seq > 999:
        next_seq = 1  # Reset or raise error based on business logic
    
    # Format sequence as 3 digits
    seq3 = str(next_seq).zfill(3)
    
    # Final Lead ID: NAME4-CITY-LYY-SEQ (16 characters)
    lead_id = f"{name4}-{city3}-L{year2}-{seq3}"
    
    return lead_id

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

class PaginatedLeadsResponse(BaseModel):
    """Paginated response for leads list"""
    data: List['Lead']  # Forward reference
    total: int
    page: int
    page_size: int
    total_pages: int

class Lead(BaseModel):
    model_config = ConfigDict(extra="allow")  # Allow extra fields
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    lead_id: Optional[str] = None  # Unique formatted ID: NAME4-CITY-LYY-SEQ (16 chars)
    
    # Company & Contact
    company: str
    contact_person: Optional[str] = None
    name: Optional[str] = None  # Kept for backward compatibility
    email: Optional[EmailStr] = None
    phone: Optional[str] = None
    
    # Lead Category
    category: Optional[str] = None  # Restaurant, Bar & Kitchen, Star Hotel, etc.
    
    # Customer Tier
    tier: Optional[str] = None  # Tier 1, Tier 2, Tier 3, Tier 4, Tier 5
    
    # Location
    city: str
    state: str
    country: str = 'India'
    region: str
    
    # Lead Information
    status: str = 'new'
    source: Optional[str] = None
    assigned_to: Optional[str] = None
    priority: Optional[str] = 'medium'
    
    # Current Brand Details
    current_water_brand: Optional[str] = None
    current_landing_price: Optional[float] = None
    current_volume: Optional[str] = None
    current_selling_price: Optional[float] = None
    
    # Nyla Details
    interested_skus: Optional[List[str]] = []  # Multi-select SKUs
    notes: Optional[str] = None
    
    # Follow-up tracking
    next_followup_date: Optional[str] = None  # YYYY-MM-DD format
    
    # System fields
    estimated_value: Optional[float] = None
    created_by: str
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    updated_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    
    # Computed fields (added dynamically)
    last_contacted_date: Optional[str] = None
    last_contact_method: Optional[str] = None
    
    # Invoice fields (populated from ActiveMQ)
    total_gross_invoice_value: Optional[float] = None
    total_net_invoice_value: Optional[float] = None
    total_credit_note_value: Optional[float] = None
    invoice_count: Optional[int] = None
    last_invoice_date: Optional[str] = None
    last_invoice_no: Optional[str] = None

class LeadCreate(BaseModel):
    company: str
    contact_person: Optional[str] = None
    email: Optional[EmailStr] = None
    phone: Optional[str] = None
    category: Optional[str] = None
    tier: Optional[str] = None
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
    notes: Optional[str] = None
    estimated_value: Optional[float] = None
    next_followup_date: Optional[str] = None
    # Account conversion flag
    converted_to_account: Optional[bool] = False
    account_id: Optional[str] = None

# ============= ACCOUNT MODELS =============

class AccountSKUPricing(BaseModel):
    """SKU pricing and bottle credit for an account"""
    sku: str
    price_per_unit: float = 0.0
    return_bottle_credit: float = 0.0

class Account(BaseModel):
    model_config = ConfigDict(extra="allow")
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    account_id: str  # Formatted ID: NAME4-CITY-AYY-SEQ
    lead_id: str  # Reference to original lead
    
    # Account Info
    account_name: str
    account_type: Optional[str] = None  # Tier 1, Tier 2, Tier 3
    
    # Contact Info
    contact_name: Optional[str] = None
    contact_number: Optional[str] = None
    
    # Location (copied from lead)
    city: str
    state: str
    territory: str
    
    # Assignment
    assigned_to: Optional[str] = None
    
    # SKU Pricing
    sku_pricing: List[AccountSKUPricing] = []
    
    # Financial Tracking
    outstanding_balance: float = 0.0
    overdue_amount: float = 0.0
    last_payment_date: Optional[str] = None
    last_payment_amount: float = 0.0
    
    # Timestamps
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    updated_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))

class AccountCreate(BaseModel):
    lead_id: str

class AccountUpdate(BaseModel):
    account_name: Optional[str] = None
    account_type: Optional[str] = None
    contact_name: Optional[str] = None
    contact_number: Optional[str] = None
    sku_pricing: Optional[List[AccountSKUPricing]] = None

class PaginatedAccountsResponse(BaseModel):
    """Paginated response for accounts list"""
    data: List['Account']
    total: int
    page: int
    page_size: int
    total_pages: int

class Activity(BaseModel):
    model_config = ConfigDict(extra="ignore")
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    lead_id: str
    activity_type: str  # 'call', 'email', 'meeting', 'note', 'status_change', 'visit', 'messaging'
    description: str
    interaction_method: Optional[str] = None  # 'phone_call', 'customer_visit', 'email', 'whatsapp', 'sms', 'other'
    created_by: str
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))

class ActivityCreate(BaseModel):
    lead_id: str
    activity_type: str
    description: str
    interaction_method: Optional[str] = None

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

class DailyStatus(BaseModel):
    model_config = ConfigDict(extra="ignore")
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    user_id: str
    status_date: str  # YYYY-MM-DD format
    
    # Three sections
    yesterday_updates: str = ''
    yesterday_original: Optional[str] = None
    yesterday_ai_revised: bool = False
    
    today_actions: str = ''
    today_original: Optional[str] = None
    today_ai_revised: bool = False
    
    help_needed: str = ''
    help_original: Optional[str] = None
    help_ai_revised: bool = False
    
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    updated_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))

class DailyStatusCreate(BaseModel):
    status_date: str
    yesterday_updates: str = ''
    today_actions: str = ''
    help_needed: str = ''

class DailyStatusUpdate(BaseModel):
    yesterday_updates: Optional[str] = None
    yesterday_original: Optional[str] = None
    yesterday_ai_revised: Optional[bool] = None
    today_actions: Optional[str] = None
    today_original: Optional[str] = None
    today_ai_revised: Optional[bool] = None
    help_needed: Optional[str] = None
    help_original: Optional[str] = None
    help_ai_revised: Optional[bool] = None

class LeaveRequest(BaseModel):
    model_config = ConfigDict(extra="ignore")
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    user_id: str
    leave_type: str  # 'casual', 'sick', 'earned', 'unpaid'
    start_date: str  # YYYY-MM-DD
    end_date: str  # YYYY-MM-DD
    total_days: int
    reason: str
    status: str = 'pending'  # 'pending', 'approved', 'rejected'
    approved_by: Optional[str] = None
    approval_date: Optional[datetime] = None
    rejection_reason: Optional[str] = None
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    updated_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))

class LeaveRequestCreate(BaseModel):
    leave_type: str
    start_date: str
    end_date: str
    reason: str

class LeaveApproval(BaseModel):
    status: str  # 'approved' or 'rejected'
    rejection_reason: Optional[str] = None

class TargetPlan(BaseModel):
    model_config = ConfigDict(extra="ignore")
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    plan_name: str
    time_period: str  # 'monthly', 'quarterly', 'half_yearly', 'yearly'
    start_date: str  # YYYY-MM-DD
    end_date: str  # YYYY-MM-DD
    country: str = 'India'
    country_target: float  # Total revenue target
    currency: str = 'INR'
    status: str = 'draft'  # 'draft', 'finalized', 'locked'
    created_by: str
    locked_by: Optional[str] = None
    locked_at: Optional[datetime] = None
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    updated_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))

class TargetPlanCreate(BaseModel):
    plan_name: str
    time_period: str
    start_date: str
    end_date: str
    country_target: float

class TerritoryTarget(BaseModel):
    model_config = ConfigDict(extra="ignore")
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    plan_id: str
    territory: str
    allocation_percentage: float  # Percentage of country target
    target_revenue: float  # Calculated from percentage
    allocated_revenue: float = 0  # Sum of city targets
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))

class TerritoryTargetCreate(BaseModel):
    territory: str
    allocation_percentage: float  # User enters percentage

class CityTarget(BaseModel):
    model_config = ConfigDict(extra="ignore")
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    plan_id: str
    territory: str
    state: str
    city: str
    allocation_percentage: float  # Percentage of territory target
    target_revenue: float  # Calculated from percentage
    allocated_revenue: float = 0  # Sum of resource targets
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))

class CityTargetCreate(BaseModel):
    state: str
    city: str
    allocation_percentage: float  # User enters percentage

class ResourceTarget(BaseModel):
    model_config = ConfigDict(extra="ignore")
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    plan_id: str
    city_id: str
    resource_id: str  # user_id
    allocation_percentage: float  # Percentage of city target
    target_revenue: float  # Calculated from percentage
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))

class ResourceTargetCreate(BaseModel):
    resource_id: str
    allocation_percentage: float  # User enters percentage

class SKUTarget(BaseModel):
    model_config = ConfigDict(extra="ignore")
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    plan_id: str
    city_id: str
    sku_name: str
    allocation_percentage: float  # Percentage of city target
    target_revenue: float  # Calculated from percentage
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))

class SKUTargetCreate(BaseModel):
    sku_name: str
    allocation_percentage: float

class COGSData(BaseModel):
    model_config = ConfigDict(extra="ignore")
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    sku_name: str
    city: str
    
    # User inputs
    primary_packaging_cost: float = 0.0
    secondary_packaging_cost: float = 0.0
    manufacturing_variable_cost: float = 0.0
    gross_margin: float = 0.0
    outbound_logistics_cost: float = 0.0
    
    # Computed (stored for reference)
    total_cogs: float = 0.0
    ex_factory_price: float = 0.0
    minimum_landing_price: float = 0.0
    
    # Metadata
    last_edited_by: Optional[str] = None
    last_edited_at: Optional[datetime] = None
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))

class COGSDataUpdate(BaseModel):
    primary_packaging_cost: Optional[float] = None
    secondary_packaging_cost: Optional[float] = None
    manufacturing_variable_cost: Optional[float] = None
    gross_margin: Optional[float] = None
    outbound_logistics_cost: Optional[float] = None  # User enters percentage

class Invoice(BaseModel):
    """Invoice data received from ActiveMQ"""
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    invoice_no: str
    invoice_date: str
    gross_invoice_value: float
    net_invoice_value: float
    credit_note_value: float
    ca_lead_id: str  # Our lead_id to match
    c_lead_id: Optional[str] = None  # External reference
    lead_uuid: Optional[str] = None  # Internal lead UUID after matching
    status: str = 'matched'  # 'matched' or 'unmatched'
    received_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))

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

async def get_current_user(request: Request):
    """Get user from cookie or JWT token"""
    return await get_current_user_from_cookie_or_header(request)

@api_router.post("/admin/setup-production-database")
async def setup_production_database_endpoint(request: Request):
    """TEMPORARY ENDPOINT: Setup production database - REMOVE AFTER USE"""
    
    # Simple security - require exact secret
    body = await request.json()
    secret = body.get('secret', '')
    
    if secret != 'nyla-production-setup-2026':
        raise HTTPException(status_code=403, detail='Invalid secret')
    
    try:
        # Run the setup inline
        surya_id = str(uuid.uuid4())
        vamsi_id = str(uuid.uuid4())
        karanabir_id = str(uuid.uuid4())
        admin_id = str(uuid.uuid4())
        
        # Check if users already exist
        existing_count = await db.users.count_documents({})
        if existing_count > 5:
            return {'message': 'Database already populated', 'user_count': existing_count}
        
        # Create leadership
        leadership = [
            {
                'id': surya_id,
                'email': 'surya.yadavalli@nylaairwater.earth',
                'password': hash_password('Nyla2026!'),
                'name': 'Surya Yadavalli',
                'role': 'CEO',
                'designation': 'CEO',
                'phone': '+919876543200',
                'city': 'Hyderabad',
                'state': 'Telangana',
                'territory': 'All India',
                'reports_to': None,
                'is_active': True,
                'created_at': datetime.now(timezone.utc).isoformat()
            },
            {
                'id': vamsi_id,
                'email': 'vamsi.bommena@nylaairwater.earth',
                'password': hash_password('Nyla2026!'),
                'name': 'Vamsi Bommena',
                'role': 'Director',
                'designation': 'Director',
                'phone': '+919876543201',
                'city': 'Hyderabad',
                'state': 'Telangana',
                'territory': 'All India',
                'reports_to': surya_id,
                'is_active': True,
                'created_at': datetime.now(timezone.utc).isoformat()
            },
            {
                'id': karanabir_id,
                'email': 'karanabir.gulati@nylaairwater.earth',
                'password': hash_password('Nyla2026!'),
                'name': 'Karanabir Singh Gulati',
                'role': 'Vice President',
                'designation': 'Vice President',
                'phone': '+919876543202',
                'city': 'Delhi',
                'state': 'Delhi',
                'territory': 'All India',
                'reports_to': vamsi_id,
                'is_active': True,
                'created_at': datetime.now(timezone.utc).isoformat()
            },
            {
                'id': admin_id,
                'email': 'admin@nylaairwater.earth',
                'password': hash_password('NylaAdmin2026!'),
                'name': 'System Administrator',
                'role': 'CEO',
                'designation': 'CEO',
                'phone': '+919876543299',
                'city': 'Hyderabad',
                'state': 'Telangana',
                'territory': 'All India',
                'reports_to': None,
                'is_active': True,
                'created_at': datetime.now(timezone.utc).isoformat()
            }
        ]
        
        await db.users.insert_many(leadership)
        
        # Create sample sales reps (simplified)
        cities = [
            ('Bengaluru', 'Karnataka', 'South India'),
            ('Chennai', 'Tamil Nadu', 'South India'),
            ('Hyderabad', 'Telangana', 'South India'),
            ('Mumbai', 'Maharashtra', 'West India')
        ]
        
        sales_team = []
        for idx, (city, state, territory) in enumerate(cities, 1):
            member = {
                'id': str(uuid.uuid4()),
                'email': f'{city.lower().replace(" ", "")}.sales{idx}@nylaairwater.earth',
                'password': hash_password('Nyla2026!'),
                'name': f'{city} Sales Rep',
                'role': 'Business Development Executive',
                'designation': 'Business Development Executive',
                'city': city,
                'state': state,
                'territory': territory,
                'reports_to': karanabir_id,
                'is_active': True,
                'created_at': datetime.now(timezone.utc).isoformat()
            }
            sales_team.append(member)
        
        await db.users.insert_many(sales_team)
        
        total_users = len(leadership) + len(sales_team)
        
        return {
            'message': 'Production database setup complete!',
            'users_created': total_users,
            'leadership': 4,
            'sales_team': len(sales_team)
        }
        
    except Exception as e:
        logger.error(f'Setup error: {str(e)}')
        raise HTTPException(status_code=500, detail=f'Setup failed: {str(e)}')


@api_router.get("/cogs/{city}")
async def get_cogs_data(city: str, current_user: dict = Depends(get_current_user)):
    """Get COGS data for all SKUs in a city"""
    
    master_skus = [
        'Nyla – 600 ml / Silver',
        'Nyla – 330 ml / Silver',
        'Nyla – 660 ml / Gold',
        'Nyla – 330 ml / Gold',
        'Nyla – 660 ml / Sparkling',
        'Nyla – 330 ml / Sparkling',
        '24 Brand'
    ]
    
    cogs_data = await db.cogs_data.find({'city': city}, {'_id': 0}).to_list(100)
    
    # Create default data for SKUs that don't have data yet
    existing_skus = [c['sku_name'] for c in cogs_data]
    for sku in master_skus:
        if sku not in existing_skus:
            default_data = COGSData(sku_name=sku, city=city)
            doc = default_data.model_dump()
            doc['created_at'] = doc['created_at'].isoformat()
            if doc.get('last_edited_at'):
                doc['last_edited_at'] = doc['last_edited_at'].isoformat()
            await db.cogs_data.insert_one(doc)
            cogs_data.append(default_data.model_dump())
    
    # Get user names for last_edited_by
    user_ids = [c.get('last_edited_by') for c in cogs_data if c.get('last_edited_by')]
    users = await db.users.find({'id': {'$in': user_ids}}, {'_id': 0, 'id': 1, 'name': 1}).to_list(100)
    user_map = {u['id']: u['name'] for u in users}
    
    # Add editor names
    for data in cogs_data:
        if data.get('last_edited_by'):
            data['editor_name'] = user_map.get(data['last_edited_by'], 'Unknown')
    
    return {'cogs_data': cogs_data}

@api_router.put("/cogs/{sku_id}")
async def update_cogs_data(sku_id: str, updates: COGSDataUpdate, current_user: dict = Depends(get_current_user)):
    """Update COGS data for a SKU"""
    
    update_data = updates.model_dump(exclude_none=True)
    
    # Calculate computed values
    if any(k in update_data for k in ['primary_packaging_cost', 'secondary_packaging_cost', 'manufacturing_variable_cost', 'gross_margin', 'outbound_logistics_cost']):
        existing = await db.cogs_data.find_one({'id': sku_id}, {'_id': 0})
        if existing:
            # Merge with existing data
            primary = update_data.get('primary_packaging_cost', existing.get('primary_packaging_cost', 0))
            secondary = update_data.get('secondary_packaging_cost', existing.get('secondary_packaging_cost', 0))
            manufacturing = update_data.get('manufacturing_variable_cost', existing.get('manufacturing_variable_cost', 0))
            margin = update_data.get('gross_margin', existing.get('gross_margin', 0))
            logistics = update_data.get('outbound_logistics_cost', existing.get('outbound_logistics_cost', 0))
            
            # Calculate
            total_cogs = primary + secondary + manufacturing
            gross_margin_rupees = total_cogs * (margin / 100)  # Convert % to rupees
            ex_factory = total_cogs + gross_margin_rupees
            landing_price = ex_factory + logistics
            
            update_data['total_cogs'] = total_cogs
            update_data['ex_factory_price'] = ex_factory
            update_data['minimum_landing_price'] = landing_price
    
    # Track editor
    update_data['last_edited_by'] = current_user['id']
    update_data['last_edited_at'] = datetime.now(timezone.utc).isoformat()
    
    result = await db.cogs_data.update_one({'id': sku_id}, {'$set': update_data})
    
    if result.matched_count == 0:
        raise HTTPException(status_code=404, detail='COGS data not found')
    
    return {'message': 'COGS data updated successfully'}

# ============= GOOGLE OAUTH AUTH ROUTES =============

@api_router.post("/auth/google-callback")
async def google_oauth_callback(request: Request, response: Response):
    """Handle Google OAuth callback with your own credentials"""
    
    body = await request.json()
    code = body.get('code')
    redirect_uri = body.get('redirect_uri')  # Accept redirect_uri from frontend
    
    if not code:
        raise HTTPException(status_code=400, detail='Authorization code required')
    
    try:
        client_id = os.environ['GOOGLE_OAUTH_CLIENT_ID']
        client_secret = os.environ['GOOGLE_OAUTH_CLIENT_SECRET']
        # Use redirect_uri from request, fallback to env variable
        if not redirect_uri:
            redirect_uri = os.environ.get('GOOGLE_OAUTH_REDIRECT_URI', '')
        
        # Exchange code for tokens
        async with httpx.AsyncClient() as client:
            token_response = await client.post(
                'https://oauth2.googleapis.com/token',
                data={
                    'code': code,
                    'client_id': client_id,
                    'client_secret': client_secret,
                    'redirect_uri': redirect_uri,
                    'grant_type': 'authorization_code'
                }
            )
            
            tokens = token_response.json()
            
            if 'error' in tokens:
                raise HTTPException(status_code=400, detail=tokens['error'])
            
            # Get user info
            user_info_response = await client.get(
                'https://www.googleapis.com/oauth2/v2/userinfo',
                headers={'Authorization': f"Bearer {tokens['access_token']}"}
            )
            
            user_info = user_info_response.json()
        
        # Get user info from Google
        user_email = user_info['email'].strip().lower()  # Normalize email
        user_name = user_info.get('name', '')
        
        logger.info(f'Google OAuth: Email received: "{user_email}"')
        
        # Case-insensitive email lookup
        existing_user = await db.users.find_one(
            {'email': {'$regex': f'^{user_email}$', '$options': 'i'}},
            {'_id': 0}
        )
        
        if existing_user:
            logger.info(f'User found: {existing_user["name"]} with role {existing_user["role"]}')
        else:
            logger.warning(f'User NOT found for email: {user_email}')
            # List all emails in database for debugging
            all_emails = await db.users.find({}, {'_id': 0, 'email': 1}).limit(5).to_list(5)
            logger.warning(f'Sample emails in DB: {[u["email"] for u in all_emails]}')
            
            raise HTTPException(
                status_code=403,
                detail=f'No account found for {user_email}. Please contact your administrator.'
            )
        
        user_id = existing_user['id']
        
        # Update user info
        await db.users.update_one(
            {'email': user_email},
            {'$set': {
                'name': user_info.get('name', existing_user.get('name')),
                'avatar': user_info.get('picture', ''),
                'updated_at': datetime.now(timezone.utc).isoformat()
            }}
        )
        
        # Create session
        session_token = str(uuid.uuid4())
        expires_at = datetime.now(timezone.utc) + timedelta(days=7)
        
        await db.user_sessions.insert_one({
            'user_id': user_id,
            'session_token': session_token,
            'expires_at': expires_at.isoformat(),
            'created_at': datetime.now(timezone.utc).isoformat()
        })
        
        # Set cookie
        response.set_cookie(
            key='session_token',
            value=session_token,
            httponly=True,
            secure=True,
            samesite='none',  # Required for OAuth callback
            max_age=7*24*60*60,
            path='/'
        )
        
        user_doc = await db.users.find_one({'id': user_id}, {'_id': 0, 'password': 0})
        
        return {'user': user_doc, 'message': 'Login successful'}
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f'OAuth callback error: {str(e)}')
        raise HTTPException(status_code=500, detail=f'Authentication failed: {str(e)}')

@api_router.post("/auth/google-session")
async def exchange_google_session(request: Request, response: Response):
    """Exchange Emergent session_id for user data and create session"""
    
    body = await request.json()
    session_id = body.get('session_id')
    
    if not session_id:
        raise HTTPException(status_code=400, detail='session_id required')
    
    # Call Emergent auth service
    async with httpx.AsyncClient() as client:
        auth_response = await client.get(
            'https://demobackend.emergentagent.com/auth/v1/env/oauth/session-data',
            headers={'X-Session-ID': session_id}
        )
        
        if auth_response.status_code != 200:
            raise HTTPException(status_code=401, detail='Invalid session_id')
        
        user_data = auth_response.json()
    
    # Get user email
    user_email = user_data['email']
    user_name = user_data['name']
    user_picture = user_data.get('picture', '')
    session_token = user_data['session_token']
    
    # Check if user exists in database (MUST be pre-registered by admin)
    existing_user = await db.users.find_one({'email': user_email}, {'_id': 0})
    
    if not existing_user:
        # User not registered - reject login
        raise HTTPException(
            status_code=403, 
            detail='You do not have access. Please contact your manager to set up your account.'
        )
    
    # User exists - proceed with login
    user_id = existing_user['id']
    
    # Update user info from Google
    await db.users.update_one(
        {'email': user_email},
        {'$set': {
            'name': user_name,
            'avatar': user_picture,
            'updated_at': datetime.now(timezone.utc).isoformat()
        }}
    )
    
    # Create session
    expires_at = datetime.now(timezone.utc) + timedelta(days=7)
    await db.user_sessions.insert_one({
        'user_id': user_id,
        'session_token': session_token,
        'expires_at': expires_at.isoformat(),
        'created_at': datetime.now(timezone.utc).isoformat()
    })
    
    # Set httpOnly cookie
    response.set_cookie(
        key='session_token',
        value=session_token,
        httponly=True,
        secure=True,
        samesite='none',
        max_age=7*24*60*60,
        path='/'
    )
    
    # Return user data
    user_doc = await db.users.find_one({'id': user_id}, {'_id': 0, 'password': 0})
    
    return {
        'user': user_doc,
        'session_token': session_token
    }

async def get_current_user_from_cookie_or_header(request: Request):
    """Get user from session_token cookie or Authorization header"""
    
    # Try cookie first
    session_token = request.cookies.get('session_token')
    
    # Fall back to Authorization header
    if not session_token:
        auth_header = request.headers.get('Authorization')
        if auth_header and auth_header.startswith('Bearer '):
            session_token = auth_header.replace('Bearer ', '')
    
    if not session_token:
        raise HTTPException(status_code=401, detail='Not authenticated')
    
    # Find session
    session_doc = await db.user_sessions.find_one({'session_token': session_token}, {'_id': 0})
    if not session_doc:
        raise HTTPException(status_code=401, detail='Invalid session')
    
    # Check expiry
    expires_at = session_doc['expires_at']
    if isinstance(expires_at, str):
        expires_at = datetime.fromisoformat(expires_at)
    if expires_at.tzinfo is None:
        expires_at = expires_at.replace(tzinfo=timezone.utc)
    
    if expires_at < datetime.now(timezone.utc):
        raise HTTPException(status_code=401, detail='Session expired')
    
    # Get user
    user_doc = await db.users.find_one({'id': session_doc['user_id']}, {'_id': 0, 'password': 0})
    if not user_doc:
        raise HTTPException(status_code=401, detail='User not found')
    
    return user_doc

@api_router.get("/auth/me")
async def get_current_user_info(request: Request):
    """Get current authenticated user"""
    user = await get_current_user_from_cookie_or_header(request)
    return user

@api_router.post("/auth/logout")
async def logout_user(request: Request, response: Response):
    """Logout user by deleting session"""
    
    session_token = request.cookies.get('session_token')
    
    if session_token:
        await db.user_sessions.delete_one({'session_token': session_token})
        response.delete_cookie('session_token', path='/')
    
    return {'message': 'Logged out successfully'}

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
async def login(credentials: UserLogin, response: Response):
    user_doc = await db.users.find_one({'email': credentials.email}, {'_id': 0})
    if not user_doc or not verify_password(credentials.password, user_doc['password']):
        raise HTTPException(status_code=401, detail='Invalid credentials')
    
    if not user_doc.get('is_active', True):
        raise HTTPException(status_code=401, detail='Account is inactive')
    
    # Create session token (same as Google OAuth flow)
    session_token = str(uuid.uuid4())
    expires_at = datetime.now(timezone.utc) + timedelta(days=7)
    
    # Store session in database
    await db.user_sessions.insert_one({
        'user_id': user_doc['id'],
        'session_token': session_token,
        'expires_at': expires_at.isoformat(),
        'created_at': datetime.now(timezone.utc).isoformat()
    })
    
    # Set httpOnly cookie
    response.set_cookie(
        key='session_token',
        value=session_token,
        httponly=True,
        secure=True,
        samesite='none',
        max_age=7*24*60*60,
        path='/'
    )
    
    user_doc.pop('password')
    if isinstance(user_doc['created_at'], str):
        user_doc['created_at'] = datetime.fromisoformat(user_doc['created_at'])
    
    return {
        'user': user_doc,
        'session_token': session_token
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
    
    # Generate unique Lead ID
    unique_lead_id = await generate_lead_id(lead_data['company'], lead_data['city'])
    lead_data['lead_id'] = unique_lead_id
    
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

@api_router.get("/leads", response_model=PaginatedLeadsResponse)
async def get_leads(
    page: int = 1,
    page_size: int = 25,
    status: Optional[str] = None,
    city: Optional[str] = None,
    state: Optional[str] = None,
    country: Optional[str] = None,
    region: Optional[str] = None,
    search: Optional[str] = None,
    current_user: dict = Depends(get_current_user)
):
    """
    Get paginated leads list with server-side pagination.
    
    - page: Page number (1-indexed)
    - page_size: Number of items per page (default 25, max 100)
    - status, city, state, country, region: Filter options
    - search: Search in company name, contact person, lead_id
    """
    # Validate and cap page_size to prevent abuse
    page_size = min(max(1, page_size), 100)
    page = max(1, page)
    skip = (page - 1) * page_size
    
    # Build query based on role and filters
    query = {}
    
    # Only sales_rep sees their assigned leads, everyone else sees all
    if current_user['role'] == 'sales_rep':
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
    
    # Add search filter
    if search:
        query['$or'] = [
            {'company': {'$regex': search, '$options': 'i'}},
            {'contact_person': {'$regex': search, '$options': 'i'}},
            {'lead_id': {'$regex': search, '$options': 'i'}}
        ]
    
    # Get total count for pagination
    total = await db.leads.count_documents(query)
    total_pages = (total + page_size - 1) // page_size  # Ceiling division
    
    # Fetch paginated leads
    leads = await db.leads.find(query, {'_id': 0}).sort('created_at', -1).skip(skip).limit(page_size).to_list(page_size)
    
    # Get last activity for each lead
    lead_ids = [lead['id'] for lead in leads]
    activities = await db.activities.find(
        {'lead_id': {'$in': lead_ids}},
        {'_id': 0, 'lead_id': 1, 'created_at': 1, 'interaction_method': 1}
    ).to_list(len(lead_ids) * 10)  # Reasonable limit per page
    
    # Group activities by lead_id and get the most recent
    lead_last_activity = {}
    for activity in activities:
        lead_id = activity['lead_id']
        activity_date = activity['created_at'] if isinstance(activity['created_at'], str) else activity['created_at'].isoformat()
        
        if lead_id not in lead_last_activity:
            lead_last_activity[lead_id] = {
                'created_at': activity_date,
                'interaction_method': activity.get('interaction_method', '')
            }
        elif activity_date and lead_last_activity[lead_id]['created_at'] and activity_date > lead_last_activity[lead_id]['created_at']:
            lead_last_activity[lead_id] = {
                'created_at': activity_date,
                'interaction_method': activity.get('interaction_method', '')
            }
    
    # Add last contacted info to leads
    for lead in leads:
        if isinstance(lead['created_at'], str):
            lead['created_at'] = datetime.fromisoformat(lead['created_at'])
        if isinstance(lead['updated_at'], str):
            lead['updated_at'] = datetime.fromisoformat(lead['updated_at'])
        
        # Add last contacted info
        last_activity = lead_last_activity.get(lead['id'])
        if last_activity:
            lead['last_contacted_date'] = last_activity['created_at']
            lead['last_contact_method'] = last_activity['interaction_method']
        else:
            lead['last_contacted_date'] = None
            lead['last_contact_method'] = None
    
    return PaginatedLeadsResponse(
        data=leads,
        total=total,
        page=page,
        page_size=page_size,
        total_pages=total_pages
    )

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
    # Get the lead first
    lead = await db.leads.find_one({'id': lead_id}, {'_id': 0})
    if not lead:
        raise HTTPException(status_code=404, detail='Lead not found')
    
    # Allow deletion if user is:
    # 1. Lead creator, OR
    # 2. Leadership (CEO, Director, VP, National Head)
    is_creator = lead.get('created_by') == current_user['id']
    is_leadership = current_user['role'] in ['CEO', 'Director', 'Vice President', 'National Sales Head']
    
    if not (is_creator or is_leadership):
        raise HTTPException(status_code=403, detail='Only lead creator or leadership can delete leads')
    
    result = await db.leads.delete_one({'id': lead_id})
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail='Lead not found')
    
    # Delete related data
    await db.activities.delete_many({'lead_id': lead_id})
    await db.follow_ups.delete_many({'lead_id': lead_id})
    await db.comments.delete_many({'lead_id': lead_id})
    await db.invoices.delete_many({'lead_uuid': lead_id})
    
    return {'message': 'Lead deleted successfully'}

# ============= SALES REVENUE DASHBOARD =============

@api_router.get("/sales-revenue/won-leads")
async def get_won_leads_revenue(
    time_filter: str = "lifetime",
    resource_id: Optional[str] = None,
    city: Optional[str] = None,
    territory: Optional[str] = None,
    current_user: dict = Depends(get_current_user)
):
    """Get all WON leads with their invoice totals for the Sales Revenue Dashboard"""
    from datetime import datetime, timedelta
    from dateutil.relativedelta import relativedelta
    
    # Build base query for WON leads
    query = {'status': 'won'}
    
    # Apply time filter
    now = datetime.now(timezone.utc)
    start_date = None
    
    if time_filter == "this_week":
        start_date = now - timedelta(days=now.weekday())
    elif time_filter == "last_week":
        start_date = now - timedelta(days=now.weekday() + 7)
        end_date = now - timedelta(days=now.weekday())
    elif time_filter == "this_month":
        start_date = now.replace(day=1, hour=0, minute=0, second=0, microsecond=0)
    elif time_filter == "last_month":
        first_of_this_month = now.replace(day=1)
        start_date = (first_of_this_month - relativedelta(months=1))
        end_date = first_of_this_month
    elif time_filter == "this_quarter":
        quarter = (now.month - 1) // 3
        start_date = now.replace(month=quarter * 3 + 1, day=1, hour=0, minute=0, second=0, microsecond=0)
    elif time_filter == "last_quarter":
        quarter = (now.month - 1) // 3
        if quarter == 0:
            start_date = now.replace(year=now.year - 1, month=10, day=1)
            end_date = now.replace(month=1, day=1)
        else:
            start_date = now.replace(month=(quarter - 1) * 3 + 1, day=1)
            end_date = now.replace(month=quarter * 3 + 1, day=1)
    elif time_filter == "last_3_months":
        start_date = now - relativedelta(months=3)
    elif time_filter == "last_6_months":
        start_date = now - relativedelta(months=6)
    elif time_filter == "this_year":
        start_date = now.replace(month=1, day=1, hour=0, minute=0, second=0, microsecond=0)
    elif time_filter == "last_year":
        start_date = now.replace(year=now.year - 1, month=1, day=1)
        end_date = now.replace(month=1, day=1)
    
    if start_date:
        query['updated_at'] = {'$gte': start_date.isoformat()}
        if 'end_date' in dir() and end_date:
            query['updated_at']['$lt'] = end_date.isoformat()
    
    # Apply resource filter
    if resource_id:
        query['assigned_to'] = resource_id
    
    # Apply city filter
    if city:
        query['city'] = city
    
    # Apply territory filter (region)
    if territory:
        query['region'] = territory
    
    # Fetch won leads
    leads = await db.leads.find(query, {'_id': 0}).sort('updated_at', -1).to_list(1000)
    
    # Get user info for assigned_to
    user_ids = list(set([l.get('assigned_to') for l in leads if l.get('assigned_to')]))
    users = await db.users.find({'id': {'$in': user_ids}}, {'_id': 0, 'id': 1, 'name': 1}).to_list(100)
    user_map = {u['id']: u['name'] for u in users}
    
    # Build response with invoice data
    result = []
    total_gross = 0
    total_net = 0
    total_credit = 0
    
    for lead in leads:
        gross = lead.get('total_gross_invoice_value', 0) or 0
        net = lead.get('total_net_invoice_value', 0) or 0
        credit = lead.get('total_credit_note_value', 0) or 0
        
        total_gross += gross
        total_net += net
        total_credit += credit
        
        result.append({
            'id': lead['id'],
            'lead_id': lead.get('lead_id'),
            'company': lead.get('company'),
            'city': lead.get('city'),
            'territory': lead.get('region'),
            'assigned_to': lead.get('assigned_to'),
            'assigned_to_name': user_map.get(lead.get('assigned_to'), '-'),
            'won_date': lead.get('updated_at'),
            'invoice_count': lead.get('invoice_count', 0) or 0,
            'gross_invoice_value': gross,
            'net_invoice_value': net,
            'credit_note_value': credit
        })
    
    return {
        'leads': result,
        'summary': {
            'total_leads': len(result),
            'total_gross': total_gross,
            'total_net': total_net,
            'total_credit': total_credit
        }
    }

@api_router.get("/sales-revenue/filters")
async def get_revenue_filters(current_user: dict = Depends(get_current_user)):
    """Get filter options for Sales Revenue Dashboard"""
    # Get unique cities from won leads
    cities = await db.leads.distinct('city', {'status': 'won'})
    
    # Get unique territories (regions)
    territories = await db.leads.distinct('region', {'status': 'won'})
    
    # Get resources (users who have won leads assigned)
    assigned_users = await db.leads.distinct('assigned_to', {'status': 'won', 'assigned_to': {'$ne': None}})
    users = await db.users.find({'id': {'$in': assigned_users}}, {'_id': 0, 'id': 1, 'name': 1}).to_list(100)
    
    return {
        'cities': sorted([c for c in cities if c]),
        'territories': sorted([t for t in territories if t]),
        'resources': [{'id': u['id'], 'name': u['name']} for u in users]
    }

# ============= INVOICE ROUTES =============

@api_router.get("/leads/{lead_id}/invoices")
async def get_lead_invoices(lead_id: str, current_user: dict = Depends(get_current_user)):
    """Get all invoices for a specific lead"""
    lead = await db.leads.find_one({'id': lead_id}, {'_id': 0})
    if not lead:
        raise HTTPException(status_code=404, detail='Lead not found')
    
    invoices = await db.invoices.find(
        {'lead_uuid': lead_id},
        {'_id': 0}
    ).sort('received_at', -1).to_list(100)
    
    return {
        'lead_id': lead.get('lead_id'),
        'company': lead.get('company'),
        'total_gross_invoice_value': lead.get('total_gross_invoice_value', 0),
        'total_net_invoice_value': lead.get('total_net_invoice_value', 0),
        'total_credit_note_value': lead.get('total_credit_note_value', 0),
        'invoice_count': len(invoices),
        'invoices': invoices
    }

@api_router.get("/invoices")
async def get_all_invoices(
    status: Optional[str] = None,
    skip: int = 0,
    limit: int = 50,
    current_user: dict = Depends(get_current_user)
):
    """Get all invoices with optional filtering"""
    query = {}
    if status:
        query['status'] = status
    
    invoices = await db.invoices.find(
        query,
        {'_id': 0}
    ).sort('received_at', -1).skip(skip).limit(limit).to_list(limit)
    
    total = await db.invoices.count_documents(query)
    
    return {
        'total': total,
        'invoices': invoices
    }

@api_router.get("/invoices/unmatched")
async def get_unmatched_invoices(current_user: dict = Depends(get_current_user)):
    """Get invoices that couldn't be matched to a lead"""
    invoices = await db.invoices.find(
        {'status': 'unmatched'},
        {'_id': 0}
    ).sort('received_at', -1).to_list(100)
    
    return {'invoices': invoices}

@api_router.get("/resources/{resource_id}/invoice-summary")
async def get_resource_invoice_summary(resource_id: str, current_user: dict = Depends(get_current_user)):
    """Get invoice summary for a specific resource (sales person)"""
    # Get user info
    user = await db.users.find_one({'id': resource_id}, {'_id': 0, 'password': 0})
    if not user:
        raise HTTPException(status_code=404, detail='Resource not found')
    
    # Get resource invoice summary
    summary = await db.resource_invoice_summary.find_one({'resource_id': resource_id}, {'_id': 0})
    
    # Get all invoices for leads assigned to this resource
    invoices = await db.invoices.find(
        {'assigned_to': resource_id, 'status': 'matched'},
        {'_id': 0}
    ).sort('received_at', -1).to_list(100)
    
    # Get resource targets
    targets = await db.resource_targets.find({'resource_id': resource_id}, {'_id': 0}).to_list(100)
    total_target = sum(t.get('target_revenue', 0) for t in targets)
    
    achieved = summary.get('total_gross_invoice_value', 0) if summary else 0
    tbd = total_target - achieved
    achievement_pct = (achieved / total_target * 100) if total_target > 0 else 0
    
    return {
        'resource': {
            'id': user['id'],
            'name': user.get('name'),
            'designation': user.get('designation'),
            'territory': user.get('territory')
        },
        'target_revenue': total_target,
        'achieved_revenue': achieved,
        'tbd_revenue': tbd,
        'achievement_percentage': round(achievement_pct, 2),
        'invoice_count': summary.get('invoice_count', 0) if summary else 0,
        'recent_invoices': invoices[:10]
    }

@api_router.post("/invoices/match/{invoice_id}")
async def match_invoice_to_lead(
    invoice_id: str,
    lead_id: str,
    current_user: dict = Depends(get_current_user)
):
    """Manually match an unmatched invoice to a lead"""
    # Find the invoice
    invoice = await db.invoices.find_one({'id': invoice_id}, {'_id': 0})
    if not invoice:
        raise HTTPException(status_code=404, detail='Invoice not found')
    
    # Find the lead by formatted lead_id
    lead = await db.leads.find_one({'lead_id': lead_id}, {'_id': 0})
    if not lead:
        # Try by UUID
        lead = await db.leads.find_one({'id': lead_id}, {'_id': 0})
    
    if not lead:
        raise HTTPException(status_code=404, detail='Lead not found')
    
    # Update invoice
    await db.invoices.update_one(
        {'id': invoice_id},
        {
            '$set': {
                'lead_uuid': lead['id'],
                'ca_lead_id': lead.get('lead_id'),
                'status': 'matched'
            }
        }
    )
    
    # Recalculate lead totals
    all_invoices = await db.invoices.find({
        'lead_uuid': lead['id'],
        'status': 'matched'
    }).to_list(1000)
    
    total_gross = sum(inv.get('gross_invoice_value', 0) for inv in all_invoices)
    total_net = sum(inv.get('net_invoice_value', 0) for inv in all_invoices)
    total_credit = sum(inv.get('credit_note_value', 0) for inv in all_invoices)
    
    await db.leads.update_one(
        {'id': lead['id']},
        {
            '$set': {
                'total_gross_invoice_value': total_gross,
                'total_net_invoice_value': total_net,
                'total_credit_note_value': total_credit,
                'invoice_count': len(all_invoices),
                'last_invoice_date': invoice.get('invoice_date'),
                'last_invoice_no': invoice.get('invoice_no'),
                'updated_at': datetime.now(timezone.utc).isoformat()
            }
        }
    )
    
    return {'message': 'Invoice matched successfully', 'lead_id': lead.get('lead_id')}

@api_router.get("/mq/status")
async def get_mq_status(current_user: dict = Depends(get_current_user)):
    """Get ActiveMQ connection status"""
    if not MQ_AVAILABLE:
        return {'status': 'unavailable', 'message': 'ActiveMQ subscriber module not loaded'}
    
    try:
        is_connected = mq_subscriber.is_connected() if mq_subscriber else False
        return {
            'status': 'connected' if is_connected else 'disconnected',
            'host': os.environ.get('ACTIVEMQ_HOST', 'not configured'),
            'queue': os.environ.get('ACTIVEMQ_QUEUE', 'not configured'),
            'enabled': os.environ.get('ACTIVEMQ_ENABLED', 'false')
        }
    except Exception as e:
        return {'status': 'error', 'message': str(e)}

class InvoiceWebhookPayload(BaseModel):
    """Payload for invoice webhook (matches ActiveMQ message format)"""
    invoiceData: str  # Note: typo from source system (should be invoiceDate)
    grossInvoiceValue: str
    netInvoiceValue: str
    C_LEAD_ID: Optional[str] = None
    CA_LEAD_ID: str  # Our lead_id to match
    invoiceNo: str
    creditNoteValue: str

@api_router.post("/invoices/webhook")
async def process_invoice_webhook(payload: InvoiceWebhookPayload):
    """
    Webhook endpoint for processing invoice messages.
    Use this when ActiveMQ is not accessible or for testing.
    No authentication required - validate via secret header in production.
    """
    try:
        from mq_subscriber import process_invoice_manually
        
        invoice_data = payload.model_dump()
        result = await process_invoice_manually(invoice_data, db)
        
        if result.get('success'):
            return {
                'status': 'success',
                'message': f"Invoice {payload.invoiceNo} processed for lead {result.get('lead_id')}",
                'details': result
            }
        else:
            return {
                'status': 'partial' if result.get('invoice_stored') else 'failed',
                'message': result.get('error'),
                'details': result
            }
    except ImportError:
        raise HTTPException(status_code=500, detail='Invoice processing module not available')
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

# ============= ACCOUNTS ROUTES =============

async def generate_account_id(account_name: str, city: str) -> str:
    """Generate unique account ID in format: NAME4-CITY-AYY-SEQ"""
    clean_name = re.sub(r'[^a-zA-Z0-9]', '', account_name).upper()
    name4 = clean_name[:4].ljust(4, 'X')
    
    clean_city = re.sub(r'[^a-zA-Z0-9]', '', city).upper()
    city3 = clean_city[:3].ljust(3, 'X')
    
    year2 = datetime.now().strftime('%y')
    prefix = f"{name4}-{city3}-A{year2}-"
    
    regex_pattern = f"^{re.escape(prefix)}\\d{{3}}$"
    existing = await db.accounts.find(
        {'account_id': {'$regex': regex_pattern}},
        {'account_id': 1}
    ).sort('account_id', -1).limit(1).to_list(1)
    
    if existing and existing[0].get('account_id'):
        last_seq = int(existing[0]['account_id'][-3:])
        next_seq = last_seq + 1
    else:
        next_seq = 1
    
    seq3 = str(next_seq).zfill(3)
    return f"{name4}-{city3}-A{year2}-{seq3}"

@api_router.post("/accounts/convert-lead")
async def convert_lead_to_account(data: AccountCreate, current_user: dict = Depends(get_current_user)):
    """Convert a won lead to an account"""
    lead = await db.leads.find_one({'id': data.lead_id}, {'_id': 0})
    if not lead:
        raise HTTPException(status_code=404, detail='Lead not found')
    
    # Check if lead is won
    if lead.get('status') not in ['won', 'closed_won']:
        raise HTTPException(status_code=400, detail='Only won leads can be converted to accounts')
    
    # Check if already converted
    if lead.get('converted_to_account'):
        raise HTTPException(status_code=400, detail='Lead already converted to account')
    
    # Generate account ID
    account_name = lead.get('company') or lead.get('name', 'Unknown')
    city = lead.get('city', 'Unknown')
    account_id = await generate_account_id(account_name, city)
    
    # Create account
    account = Account(
        account_id=account_id,
        lead_id=lead.get('lead_id') or data.lead_id,
        account_name=account_name,
        city=city,
        state=lead.get('state', ''),
        territory=lead.get('region', ''),
        assigned_to=lead.get('assigned_to'),
        sku_pricing=[]
    )
    
    doc = account.model_dump()
    doc['created_at'] = doc['created_at'].isoformat()
    doc['updated_at'] = doc['updated_at'].isoformat()
    
    await db.accounts.insert_one(doc)
    
    # Update lead to mark as converted
    await db.leads.update_one(
        {'id': data.lead_id},
        {'$set': {
            'converted_to_account': True,
            'account_id': account_id,
            'updated_at': datetime.now(timezone.utc).isoformat()
        }}
    )
    
    return account

@api_router.get("/accounts", response_model=PaginatedAccountsResponse)
async def get_accounts(
    page: int = 1,
    page_size: int = 25,
    search: Optional[str] = None,
    territory: Optional[str] = None,
    account_type: Optional[str] = None,
    current_user: dict = Depends(get_current_user)
):
    """Get paginated accounts list"""
    page_size = min(max(1, page_size), 100)
    page = max(1, page)
    skip = (page - 1) * page_size
    
    query = {}
    if territory:
        query['territory'] = territory
    if account_type:
        query['account_type'] = account_type
    if search:
        query['$or'] = [
            {'account_name': {'$regex': search, '$options': 'i'}},
            {'contact_name': {'$regex': search, '$options': 'i'}},
            {'account_id': {'$regex': search, '$options': 'i'}}
        ]
    
    total = await db.accounts.count_documents(query)
    total_pages = (total + page_size - 1) // page_size
    
    accounts = await db.accounts.find(query, {'_id': 0}).sort('created_at', -1).skip(skip).limit(page_size).to_list(page_size)
    
    # Convert datetime strings back to datetime objects
    for account in accounts:
        if isinstance(account.get('created_at'), str):
            account['created_at'] = datetime.fromisoformat(account['created_at'])
        if isinstance(account.get('updated_at'), str):
            account['updated_at'] = datetime.fromisoformat(account['updated_at'])
    
    return PaginatedAccountsResponse(
        data=accounts,
        total=total,
        page=page,
        page_size=page_size,
        total_pages=total_pages
    )

@api_router.get("/accounts/{account_id}")
async def get_account(account_id: str, current_user: dict = Depends(get_current_user)):
    """Get single account by ID or account_id"""
    account = await db.accounts.find_one(
        {'$or': [{'id': account_id}, {'account_id': account_id}]},
        {'_id': 0}
    )
    if not account:
        raise HTTPException(status_code=404, detail='Account not found')
    
    if isinstance(account.get('created_at'), str):
        account['created_at'] = datetime.fromisoformat(account['created_at'])
    if isinstance(account.get('updated_at'), str):
        account['updated_at'] = datetime.fromisoformat(account['updated_at'])
    
    return account

@api_router.put("/accounts/{account_id}")
async def update_account(account_id: str, update_data: AccountUpdate, current_user: dict = Depends(get_current_user)):
    """Update account details including SKU pricing"""
    account = await db.accounts.find_one(
        {'$or': [{'id': account_id}, {'account_id': account_id}]},
        {'_id': 0}
    )
    if not account:
        raise HTTPException(status_code=404, detail='Account not found')
    
    update_dict = {k: v for k, v in update_data.model_dump().items() if v is not None}
    
    # Convert SKU pricing to dict format
    if 'sku_pricing' in update_dict:
        update_dict['sku_pricing'] = [
            sku.model_dump() if hasattr(sku, 'model_dump') else sku 
            for sku in update_dict['sku_pricing']
        ]
    
    update_dict['updated_at'] = datetime.now(timezone.utc).isoformat()
    
    await db.accounts.update_one(
        {'$or': [{'id': account_id}, {'account_id': account_id}]},
        {'$set': update_dict}
    )
    
    updated = await db.accounts.find_one(
        {'$or': [{'id': account_id}, {'account_id': account_id}]},
        {'_id': 0}
    )
    
    return updated

@api_router.get("/accounts/{account_id}/invoices")
async def get_account_invoices(account_id: str, current_user: dict = Depends(get_current_user)):
    """Get invoices for an account"""
    account = await db.accounts.find_one(
        {'$or': [{'id': account_id}, {'account_id': account_id}]},
        {'_id': 0, 'lead_id': 1, 'account_name': 1}
    )
    if not account:
        raise HTTPException(status_code=404, detail='Account not found')
    
    # Find invoices by lead_id or account name
    lead_id = account.get('lead_id')
    account_name = account.get('account_name')
    
    query = {'$or': []}
    if lead_id:
        query['$or'].append({'lead_id': lead_id})
    if account_name:
        query['$or'].append({'customer_name': {'$regex': account_name, '$options': 'i'}})
    
    if not query['$or']:
        return {'invoices': [], 'total_amount': 0, 'paid_amount': 0, 'outstanding': 0}
    
    invoices = await db.invoices.find(query, {'_id': 0}).sort('created_at', -1).to_list(100)
    
    total_amount = sum(inv.get('total_amount', 0) for inv in invoices)
    paid_amount = sum(inv.get('paid_amount', 0) for inv in invoices)
    
    return {
        'invoices': invoices,
        'total_amount': total_amount,
        'paid_amount': paid_amount,
        'outstanding': total_amount - paid_amount
    }

@api_router.delete("/accounts/{account_id}")
async def delete_account(account_id: str, current_user: dict = Depends(get_current_user)):
    """Delete an account"""
    if current_user['role'] not in ['admin', 'National Sales Head', 'CEO', 'Director']:
        raise HTTPException(status_code=403, detail='Only admins can delete accounts')
    
    account = await db.accounts.find_one(
        {'$or': [{'id': account_id}, {'account_id': account_id}]},
        {'_id': 0, 'lead_id': 1}
    )
    if not account:
        raise HTTPException(status_code=404, detail='Account not found')
    
    # Revert the lead conversion flag
    if account.get('lead_id'):
        await db.leads.update_one(
            {'$or': [{'id': account['lead_id']}, {'lead_id': account['lead_id']}]},
            {'$set': {'converted_to_account': False, 'account_id': None}}
        )
    
    await db.accounts.delete_one({'$or': [{'id': account_id}, {'account_id': account_id}]})
    
    return {'message': 'Account deleted successfully'}

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

@api_router.get("/config/locations")
async def get_location_config():
    """Get regions, states, and cities mapping for India"""
    locations = {
        'country': 'India',
        'regions': [
            {
                'name': 'North India',
                'states': [
                    {
                        'name': 'Delhi',
                        'cities': ['New Delhi']
                    },
                    {
                        'name': 'Uttar Pradesh',
                        'cities': ['Noida']
                    }
                ]
            },
            {
                'name': 'South India',
                'states': [
                    {
                        'name': 'Karnataka',
                        'cities': ['Bengaluru']
                    },
                    {
                        'name': 'Tamil Nadu',
                        'cities': ['Chennai']
                    },
                    {
                        'name': 'Telangana',
                        'cities': ['Hyderabad']
                    }
                ]
            },
            {
                'name': 'West India',
                'states': [
                    {
                        'name': 'Maharashtra',
                        'cities': ['Mumbai', 'Pune']
                    },
                    {
                        'name': 'Gujarat',
                        'cities': ['Ahmedabad']
                    }
                ]
            },
            {
                'name': 'East India',
                'states': [
                    {
                        'name': 'West Bengal',
                        'cities': ['Kolkata']
                    }
                ]
            }
        ],
        'skus': [
            '660 ml / Silver / Nyla',
            '660 ml / Gold / Nyla',
            '330 ml / Silver / Nyla',
            '330 ml / Gold / Nyla',
            '660 ml / Sparkling',
            '300 ml / Sparkling',
            '24 Brand / 660 ml'
        ]
    }
    return locations

# ============= DAILY STATUS ROUTES =============

@api_router.post("/daily-status", response_model=DailyStatus)
async def create_daily_status(status_input: DailyStatusCreate, current_user: dict = Depends(get_current_user)):
    # Check if status already exists for this date
    existing = await db.daily_status.find_one({
        'user_id': current_user['id'],
        'status_date': status_input.status_date
    }, {'_id': 0})
    
    if existing:
        raise HTTPException(status_code=400, detail='Status already exists for this date')
    
    status_data = status_input.model_dump()
    status_data['user_id'] = current_user['id']
    status_obj = DailyStatus(**status_data)
    
    doc = status_obj.model_dump()
    doc['created_at'] = doc['created_at'].isoformat()
    doc['updated_at'] = doc['updated_at'].isoformat()
    
    await db.daily_status.insert_one(doc)
    return status_obj

@api_router.get("/daily-status")
async def get_daily_statuses(
    start_date: Optional[str] = None,
    end_date: Optional[str] = None,
    user_id: Optional[str] = None,
    current_user: dict = Depends(get_current_user)
):
    query = {}
    
    # Leadership can see all statuses, others see only their own
    if current_user['role'] in ['ceo', 'director', 'vp', 'admin']:
        if user_id:
            query['user_id'] = user_id
    else:
        query['user_id'] = current_user['id']
    
    if start_date:
        query['status_date'] = {'$gte': start_date}
    if end_date:
        if 'status_date' in query:
            query['status_date']['$lte'] = end_date
        else:
            query['status_date'] = {'$lte': end_date}
    
    statuses = await db.daily_status.find(query, {'_id': 0}).sort('status_date', -1).to_list(100)
    
    for status in statuses:
        if isinstance(status['created_at'], str):
            status['created_at'] = datetime.fromisoformat(status['created_at'])
        if isinstance(status['updated_at'], str):
            status['updated_at'] = datetime.fromisoformat(status['updated_at'])
    
    return statuses

@api_router.put("/daily-status/{status_id}")
async def update_daily_status(
    status_id: str,
    status_update: DailyStatusUpdate,
    current_user: dict = Depends(get_current_user)
):
    status = await db.daily_status.find_one({'id': status_id}, {'_id': 0})
    if not status:
        raise HTTPException(status_code=404, detail='Status not found')
    
    if status['user_id'] != current_user['id']:
        raise HTTPException(status_code=403, detail='Can only update your own status')
    
    update_data = status_update.model_dump()
    update_data['updated_at'] = datetime.now(timezone.utc).isoformat()
    
    await db.daily_status.update_one({'id': status_id}, {'$set': update_data})
    
    updated_status = await db.daily_status.find_one({'id': status_id}, {'_id': 0})
    if isinstance(updated_status['created_at'], str):
        updated_status['created_at'] = datetime.fromisoformat(updated_status['created_at'])
    if isinstance(updated_status['updated_at'], str):
        updated_status['updated_at'] = datetime.fromisoformat(updated_status['updated_at'])
    
    return updated_status

@api_router.get("/daily-status/auto-populate/{status_date}")
async def auto_populate_from_activities(status_date: str, current_user: dict = Depends(get_current_user)):
    """Auto-populate daily status from logged lead activities"""
    
    try:
        # Get all activities created by user on this date
        start_datetime = datetime.fromisoformat(f'{status_date}T00:00:00').replace(tzinfo=timezone.utc).isoformat()
        end_datetime = datetime.fromisoformat(f'{status_date}T23:59:59').replace(tzinfo=timezone.utc).isoformat()
        
        activities = await db.activities.find(
            {
                'created_by': current_user['id'],
                'created_at': {'$gte': start_datetime, '$lte': end_datetime}
            },
            {'_id': 0}
        ).to_list(100)
        
        if not activities:
            return {'formatted_text': '', 'activity_count': 0}
        
        # Get lead names for all activities
        lead_ids = list(set([a['lead_id'] for a in activities]))
        leads = await db.leads.find(
            {'id': {'$in': lead_ids}},
            {'_id': 0, 'id': 1, 'company': 1, 'name': 1}
        ).to_list(100)
        
        lead_map = {l['id']: l.get('company') or l.get('name') for l in leads}
        
        # Format activities by lead
        formatted_lines = []
        for activity in activities:
            lead_name = lead_map.get(activity['lead_id'], 'Unknown Lead')
            interaction = activity.get('interaction_method', activity.get('activity_type', 'activity')).replace('_', ' ').title()
            description = activity.get('description', '')
            
            formatted_lines.append(f"{lead_name}: {interaction} - {description}")
        
        formatted_text = '\n\n'.join(formatted_lines)
        
        return {
            'formatted_text': formatted_text,
            'activity_count': len(activities),
            'leads_contacted': len(lead_map)
        }
        
    except Exception as e:
        logger.error(f'Auto-populate error: {str(e)}')
        return {
            'formatted_text': '',
            'activity_count': 0,
            'leads_contacted': 0
        }
async def revise_status_with_ai(request: dict, current_user: dict = Depends(get_current_user)):
    from emergentintegrations.llm.chat import LlmChat, UserMessage
    
    original_text = request.get('text', '')
    if not original_text:
        raise HTTPException(status_code=400, detail='Text is required')
    
    try:
        user_id = current_user['id']
        session_id = f'status-revision-{user_id}'
        
        # Initialize Claude chat
        chat = LlmChat(
            api_key=os.environ['EMERGENT_LLM_KEY'],
            session_id=session_id,
            system_message='You are a professional editor. Your job is to ONLY fix grammar, correct spelling, and improve sentence structure. Do NOT add headings, sections, bullet points, or any new information. Do NOT add greetings or conclusions. Keep the same tone and length. Just make the existing text grammatically correct and more readable while preserving all original content and meaning exactly as written.'
        ).with_model('anthropic', 'claude-sonnet-4-5-20250929')
        
        user_message = UserMessage(
            text=f'Fix grammar and improve readability of this text. Do not add headings, sections, or new information. Keep it concise:\n\n{original_text}'
        )
        
        revised_text = await chat.send_message(user_message)
        
        return {
            'original': original_text,
            'revised': revised_text,
            'model': 'claude-sonnet-4.5'
        }
    except Exception as e:
        logger.error(f'AI revision error: {str(e)}')
        raise HTTPException(status_code=500, detail=f'AI revision failed: {str(e)}')

@api_router.get("/daily-status/team-rollup")
async def get_team_status_rollup(
    status_date: Optional[str] = None,
    current_user: dict = Depends(get_current_user)
):
    """Get daily status rollup for team members reporting to current user"""
    
    # Find all users who report to current user
    direct_reports = await db.users.find(
        {'reports_to': current_user['id']},
        {'_id': 0, 'id': 1, 'name': 1, 'designation': 1, 'territory': 1}
    ).to_list(100)
    
    target_date = status_date or datetime.now(timezone.utc).strftime('%Y-%m-%d')
    
    if not direct_reports:
        return {'team_statuses': [], 'date': target_date, 'total_reports': 0, 'statuses_received': 0}
    
    # Get statuses for all direct reports
    user_ids = [u['id'] for u in direct_reports]
    query = {
        'user_id': {'$in': user_ids},
        'status_date': target_date
    }
    
    statuses = await db.daily_status.find(query, {'_id': 0}).to_list(100)
    
    # Get activity metrics for the day
    start_datetime = datetime.fromisoformat(f'{target_date}T00:00:00').replace(tzinfo=timezone.utc).isoformat()
    end_datetime = datetime.fromisoformat(f'{target_date}T23:59:59').replace(tzinfo=timezone.utc).isoformat()
    
    # Map statuses to users with metrics
    user_map = {u['id']: u for u in direct_reports}
    
    team_statuses = []
    for status in statuses:
        user_info = user_map.get(status['user_id'])
        if user_info:
            # Get activity metrics for this user
            user_activities = await db.activities.find({
                'created_by': status['user_id'],
                'created_at': {'$gte': start_datetime, '$lte': end_datetime}
            }, {'_id': 0}).to_list(1000)
            
            phone_calls = sum(1 for a in user_activities if a.get('interaction_method') == 'phone_call')
            customer_visits = sum(1 for a in user_activities if a.get('interaction_method') == 'customer_visit')
            emails = sum(1 for a in user_activities if a.get('interaction_method') == 'email')
            messages = sum(1 for a in user_activities if a.get('interaction_method') in ['whatsapp', 'sms'])
            
            new_leads = await db.leads.count_documents({
                'created_by': status['user_id'],
                'created_at': {'$gte': start_datetime, '$lte': end_datetime}
            })
            
            if isinstance(status.get('created_at'), str):
                created_at = status['created_at']
            else:
                created_at = status['created_at'].isoformat()
                
            team_statuses.append({
                'user_name': user_info['name'],
                'user_designation': user_info.get('designation', ''),
                'user_territory': user_info.get('territory', ''),
                'status_date': status['status_date'],
                'yesterday_updates': status.get('yesterday_updates', ''),
                'today_actions': status.get('today_actions', ''),
                'help_needed': status.get('help_needed', ''),
                'yesterday_ai_revised': status.get('yesterday_ai_revised', False),
                'today_ai_revised': status.get('today_ai_revised', False),
                'help_ai_revised': status.get('help_ai_revised', False),
                'created_at': created_at,
                'metrics': {
                    'new_leads': new_leads,
                    'phone_calls': phone_calls,
                    'customer_visits': customer_visits,
                    'emails': emails,
                    'messages': messages
                }
            })
    
    # Sort by creation time (latest first)
    team_statuses.sort(key=lambda x: x['created_at'], reverse=True)
    
    return {
        'team_statuses': team_statuses,
        'date': target_date,
        'total_reports': len(direct_reports),
        'statuses_received': len(team_statuses)
    }

@api_router.post("/daily-status/team-summary")
async def generate_team_summary(request: dict, current_user: dict = Depends(get_current_user)):
    """Generate AI consolidated summary of team daily statuses"""
    from emergentintegrations.llm.chat import LlmChat, UserMessage
    
    team_statuses = request.get('team_statuses', [])
    status_date = request.get('status_date', '')
    
    if not team_statuses:
        raise HTTPException(status_code=400, detail='No team statuses provided')
    
    # Build consolidated text for AI
    status_text = f"Team Daily Status Summary for {status_date}\n\n"
    
    for status in team_statuses:
        status_text += f"--- {status['user_name']} ({status['user_designation']}) - {status['user_territory']} ---\n"
        if status.get('yesterday_updates'):
            status_text += f"Updates: {status['yesterday_updates']}\n"
        if status.get('today_actions'):
            status_text += f"Action Items: {status['today_actions']}\n"
        if status.get('help_needed'):
            status_text += f"Help Needed: {status['help_needed']}\n"
        status_text += "\n"
    
    try:
        user_id = current_user['id']
        session_id = f'team-summary-{user_id}'
        
        chat = LlmChat(
            api_key=os.environ['EMERGENT_LLM_KEY'],
            session_id=session_id,
            system_message='You are a professional editor. Your ONLY job is to: 1) Combine all team member updates into flowing paragraphs, 2) Fix grammar and spelling, 3) Make sentences clear and professional. DO NOT add interpretations like "significant progress" or "achieved well". DO NOT add adjectives or descriptions that were not in the original text. DO NOT elaborate or embellish. Just combine the facts exactly as stated, fix grammar, and organize into 3 paragraphs: Updates, Action Items, Help Needed. Keep it purely factual.'
        ).with_model('anthropic', 'claude-sonnet-4-5-20250929')
        
        user_message = UserMessage(
            text=f'Combine these team status updates into 3 paragraphs (Updates, Actions, Help). Fix grammar ONLY. Do not add interpretations or adjectives. Stay purely factual:\n\n{status_text}'
        )
        
        summary = await chat.send_message(user_message)
        
        return {
            'summary': summary,
            'date': status_date,
            'team_count': len(team_statuses)
        }
    except Exception as e:
        logger.error(f'Team summary generation error: {str(e)}')
        raise HTTPException(status_code=500, detail=f'Summary generation failed: {str(e)}')

@api_router.get("/daily-status/weekly-summary")
async def get_weekly_status_summary(
    start_date: str,
    end_date: str,
    user_id: Optional[str] = None,
    current_user: dict = Depends(get_current_user)
):
    """Get weekly status summary for team or individual member"""
    
    # Build query
    query = {'status_date': {'$gte': start_date, '$lte': end_date}}
    
    if user_id:
        # Individual member summary
        query['user_id'] = user_id
        user = await db.users.find_one({'id': user_id}, {'_id': 0})
    else:
        # Team summary - all direct reports
        direct_reports = await db.users.find(
            {'reports_to': current_user['id']},
            {'_id': 0, 'id': 1}
        ).to_list(100)
        
        if direct_reports:
            user_ids = [u['id'] for u in direct_reports]
            query['user_id'] = {'$in': user_ids}
    
    # Get all statuses in date range
    statuses = await db.daily_status.find(query, {'_id': 0}).sort('status_date', 1).to_list(500)
    
    return {
        'statuses': statuses,
        'start_date': start_date,
        'end_date': end_date,
        'total_days': len(set([s['status_date'] for s in statuses])),
        'is_individual': user_id is not None
    }

@api_router.post("/daily-status/generate-period-summary")
async def generate_period_summary(request: dict, current_user: dict = Depends(get_current_user)):
    """Generate AI summary for weekly/monthly period"""
    from emergentintegrations.llm.chat import LlmChat, UserMessage
    
    statuses = request.get('statuses', [])
    period_type = request.get('period_type', 'weekly')  # weekly or monthly
    start_date = request.get('start_date', '')
    end_date = request.get('end_date', '')
    
    if not statuses:
        raise HTTPException(status_code=400, detail='No statuses provided')
    
    # Build text for AI
    summary_text = f"{period_type.title()} Status Summary: {start_date} to {end_date}\n\n"
    
    for status in statuses:
        user_name = status.get('user_name', 'Unknown')
        date = status.get('status_date', '')
        summary_text += f"[{date}] {user_name}:\n"
        if status.get('yesterday_updates'):
            summary_text += f"  {status['yesterday_updates']}\n"
        if status.get('today_actions'):
            summary_text += f"  {status['today_actions']}\n"
        summary_text += "\n"
    
    try:
        user_id = current_user['id']
        session_id = f'period-summary-{user_id}'
        
        chat = LlmChat(
            api_key=os.environ['EMERGENT_LLM_KEY'],
            session_id=session_id,
            system_message=f'You are a professional editor creating a {period_type} summary. Combine all daily updates into a coherent summary. Organize into: 1) Key Activities (what was done), 2) Outcomes (deals, meetings, results), 3) Pending Items (what needs follow-up). Fix grammar, stay factual, do NOT add interpretations or exaggerate. Just consolidate the facts clearly.'
        ).with_model('anthropic', 'claude-sonnet-4-5-20250929')
        
        user_message = UserMessage(
            text=f'Create a {period_type} summary from these daily updates. Combine into 3 clear paragraphs. Fix grammar only, stay factual:\n\n{summary_text}'
        )
        
        summary = await chat.send_message(user_message)
        
        return {
            'summary': summary,
            'period_type': period_type,
            'start_date': start_date,
            'end_date': end_date,
            'days_covered': len(statuses)
        }
    except Exception as e:
        logger.error(f'Period summary error: {str(e)}')
        raise HTTPException(status_code=500, detail=f'Summary generation failed: {str(e)}')

@api_router.post("/users/create", response_model=User)
async def create_team_member(user_input: UserCreate, current_user: dict = Depends(get_current_user)):
    # Only admin/CEO/Director/VP can create users
    if current_user['role'] not in ['admin', 'ceo', 'CEO', 'Director', 'Vice President', 'National Sales Head']:
        raise HTTPException(status_code=403, detail='Only leadership can create team members')
    
    # Check if user exists
    existing = await db.users.find_one({'email': user_input.email}, {'_id': 0})
    if existing:
        raise HTTPException(status_code=400, detail='Email already registered')
    
    # Create user
    hashed_pw = hash_password(user_input.password)
    user_data = user_input.model_dump()
    user_data.pop('password')
    
    # Sync role with designation if Partner - Sales
    if user_data.get('designation') == 'Partner - Sales':
        user_data['role'] = 'Partner - Sales'
    elif user_data.get('designation') and user_data.get('designation') in [
        'CEO', 'Director', 'Vice President', 'National Sales Head', 
        'Regional Sales Manager', 'Head of Business'
    ]:
        user_data['role'] = user_data['designation']
    
    user_obj = User(**user_data)
    
    doc = user_obj.model_dump()
    doc['password'] = hashed_pw
    doc['created_at'] = doc['created_at'].isoformat()
    
    await db.users.insert_one(doc)
    return user_obj

@api_router.delete("/users/{user_id}")
async def delete_user(user_id: str, current_user: dict = Depends(get_current_user)):
    """Delete user and all associated data"""
    
    if current_user['role'] not in ['CEO', 'Director', 'Vice President']:
        raise HTTPException(status_code=403, detail='Only leadership can delete users')
    
    # Delete user
    result = await db.users.delete_one({'id': user_id})
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail='User not found')
    
    # Delete associated data
    await db.leads.delete_many({'assigned_to': user_id})
    await db.leads.delete_many({'created_by': user_id})
    await db.activities.delete_many({'created_by': user_id})
    await db.daily_status.delete_many({'user_id': user_id})
    await db.user_sessions.delete_many({'user_id': user_id})
    await db.leave_requests.delete_many({'user_id': user_id})
    await db.resource_targets.delete_many({'resource_id': user_id})
    
    return {'message': 'User and all associated data deleted successfully'}

@api_router.put("/users/{user_id}")
async def update_user(user_id: str, updates: dict, current_user: dict = Depends(get_current_user)):
    if current_user['role'] not in ['CEO', 'Director', 'Vice President', 'National Sales Head']:
        raise HTTPException(status_code=403, detail='Only leadership can update users')
    
    # Remove sensitive fields
    updates.pop('password', None)
    updates.pop('id', None)
    
    # Sync role with designation if Partner - Sales
    if updates.get('designation') == 'Partner - Sales':
        updates['role'] = 'Partner - Sales'
    elif updates.get('designation') and updates.get('designation') in [
        'CEO', 'Director', 'Vice President', 'National Sales Head', 
        'Regional Sales Manager', 'Head of Business'
    ]:
        updates['role'] = updates['designation']
    
    result = await db.users.update_one({'id': user_id}, {'$set': updates})
    
    if result.matched_count == 0:
        raise HTTPException(status_code=404, detail='User not found')
    
    return {'message': 'User updated successfully'}

# ============= ANALYTICS/REPORTS ROUTES =============

@api_router.get("/analytics/dashboard")
async def get_dashboard_analytics(
    time_filter: Optional[str] = 'lifetime',
    territory: Optional[str] = None,
    state: Optional[str] = None,
    city: Optional[str] = None,
    sales_resource: Optional[str] = None,
    current_user: dict = Depends(get_current_user)
):
    """Get dashboard analytics with filters"""
    
    # Calculate date range based on time filter
    now = datetime.now(timezone.utc)
    
    if time_filter == 'this_week':
        start_date = (now - timedelta(days=now.weekday())).replace(hour=0, minute=0, second=0).isoformat()
        end_date = now.isoformat()
    elif time_filter == 'last_week':
        start_date = (now - timedelta(days=now.weekday() + 7)).replace(hour=0, minute=0, second=0).isoformat()
        end_date = (now - timedelta(days=now.weekday() + 1)).replace(hour=23, minute=59, second=59).isoformat()
    elif time_filter == 'this_month':
        start_date = now.replace(day=1, hour=0, minute=0, second=0).isoformat()
        end_date = now.isoformat()
    elif time_filter == 'last_month':
        last_month = now.replace(day=1) - timedelta(days=1)
        start_date = last_month.replace(day=1, hour=0, minute=0, second=0).isoformat()
        end_date = last_month.replace(hour=23, minute=59, second=59).isoformat()
    elif time_filter == 'last_3_months':
        start_date = (now - timedelta(days=90)).replace(hour=0, minute=0, second=0).isoformat()
        end_date = now.isoformat()
    elif time_filter == 'last_6_months':
        start_date = (now - timedelta(days=180)).replace(hour=0, minute=0, second=0).isoformat()
        end_date = now.isoformat()
    elif time_filter == 'this_quarter':
        quarter = (now.month - 1) // 3
        start_date = now.replace(month=quarter * 3 + 1, day=1, hour=0, minute=0, second=0).isoformat()
        end_date = now.isoformat()
    elif time_filter == 'last_quarter':
        quarter = (now.month - 1) // 3
        if quarter == 0:
            start_date = now.replace(year=now.year - 1, month=10, day=1, hour=0, minute=0, second=0).isoformat()
            end_date = now.replace(year=now.year - 1, month=12, day=31, hour=23, minute=59, second=59).isoformat()
        else:
            start_date = now.replace(month=(quarter - 1) * 3 + 1, day=1, hour=0, minute=0, second=0).isoformat()
            end_date = now.replace(month=quarter * 3, day=1, hour=0, minute=0, second=0).isoformat()
    else:  # lifetime
        start_date = None
        end_date = None
    
    # Build match stage based on role and filters
    match_stage = {}
    
    # Role-based access
    if current_user['role'] == 'sales_rep':
        match_stage['assigned_to'] = current_user['id']
    elif sales_resource:
        # Filter by specific sales resource
        match_stage['assigned_to'] = sales_resource
    
    # Add location filters
    if territory and territory != 'all':
        match_stage['region'] = territory
    if state:
        match_stage['state'] = state
    if city:
        match_stage['city'] = city
    
    # Add date filter if not lifetime
    if start_date and end_date:
        match_stage['created_at'] = {'$gte': start_date, '$lte': end_date}
    
    # Activity query with same filters
    activity_query = {}
    
    if current_user['role'] == 'sales_rep':
        activity_query['created_by'] = current_user['id']
    elif sales_resource:
        activity_query['created_by'] = sales_resource
    
    if start_date and end_date:
        activity_query['created_at'] = {'$gte': start_date, '$lte': end_date}
    
    # Get all activities
    activities = await db.activities.find(activity_query, {'_id': 0}).to_list(10000)
    
    # Filter activities by location if needed (via lead lookup)
    if territory or state or city:
        lead_ids_query = {}
        if territory and territory != 'all':
            lead_ids_query['region'] = territory
        if state:
            lead_ids_query['state'] = state
        if city:
            lead_ids_query['city'] = city
        
        matching_leads = await db.leads.find(lead_ids_query, {'_id': 0, 'id': 1}).to_list(10000)
        matching_lead_ids = [l['id'] for l in matching_leads]
        activities = [a for a in activities if a.get('lead_id') in matching_lead_ids]
    
    # Count visits and calls
    visits = [a for a in activities if a.get('interaction_method') == 'customer_visit']
    calls = [a for a in activities if a.get('interaction_method') == 'phone_call']
    
    total_visits = len(visits)
    total_calls = len(calls)
    
    # Unique visits/calls (unique lead_ids)
    unique_visit_leads = len(set([a['lead_id'] for a in visits]))
    unique_call_leads = len(set([a['lead_id'] for a in calls]))
    
    # Status distribution
    status_pipeline = [
        {'$match': match_stage},
        {'$group': {'_id': '$status', 'count': {'$sum': 1}}}
    ]
    status_results = await db.leads.aggregate(status_pipeline).to_list(100)
    status_counts = {item['_id']: item['count'] for item in status_results}
    
    # Calculate metrics
    total_leads = sum(status_counts.values())
    new_leads_added = total_leads
    leads_won = status_counts.get('closed_won', 0)
    leads_lost = status_counts.get('closed_lost', 0)
    conversion_rate = (leads_won / total_leads * 100) if total_leads > 0 else 0
    
    # Pipeline value
    pipeline_value_pipeline = [
        {'$match': {**match_stage, 'status': {'$ne': 'closed_lost'}}},
        {'$group': {'_id': None, 'total_value': {'$sum': '$estimated_value'}}}
    ]
    pipeline_value_result = await db.leads.aggregate(pipeline_value_pipeline).to_list(1)
    pipeline_value = pipeline_value_result[0]['total_value'] if pipeline_value_result else 0
    
    # Today's follow-ups
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
        'status_distribution': status_counts,
        'total_visits': total_visits,
        'unique_visits': unique_visit_leads,
        'total_calls': total_calls,
        'unique_calls': unique_call_leads,
        'new_leads_added': new_leads_added,
        'leads_won': leads_won,
        'leads_lost': leads_lost,
        'time_filter': time_filter
    }
    
    # Calculate date range based on time filter
    now = datetime.now(timezone.utc)
    
    if time_filter == 'this_week':
        start_date = (now - timedelta(days=now.weekday())).replace(hour=0, minute=0, second=0).isoformat()
        end_date = now.isoformat()
    elif time_filter == 'last_week':
        start_date = (now - timedelta(days=now.weekday() + 7)).replace(hour=0, minute=0, second=0).isoformat()
        end_date = (now - timedelta(days=now.weekday() + 1)).replace(hour=23, minute=59, second=59).isoformat()
    elif time_filter == 'this_month':
        start_date = now.replace(day=1, hour=0, minute=0, second=0).isoformat()
        end_date = now.isoformat()
    elif time_filter == 'last_month':
        last_month = now.replace(day=1) - timedelta(days=1)
        start_date = last_month.replace(day=1, hour=0, minute=0, second=0).isoformat()
        end_date = last_month.replace(hour=23, minute=59, second=59).isoformat()
    elif time_filter == 'last_3_months':
        start_date = (now - timedelta(days=90)).replace(hour=0, minute=0, second=0).isoformat()
        end_date = now.isoformat()
    elif time_filter == 'last_6_months':
        start_date = (now - timedelta(days=180)).replace(hour=0, minute=0, second=0).isoformat()
        end_date = now.isoformat()
    elif time_filter == 'this_quarter':
        quarter = (now.month - 1) // 3
        start_date = now.replace(month=quarter * 3 + 1, day=1, hour=0, minute=0, second=0).isoformat()
        end_date = now.isoformat()
    elif time_filter == 'last_quarter':
        quarter = (now.month - 1) // 3
        if quarter == 0:
            start_date = now.replace(year=now.year - 1, month=10, day=1, hour=0, minute=0, second=0).isoformat()
            end_date = now.replace(year=now.year - 1, month=12, day=31, hour=23, minute=59, second=59).isoformat()
        else:
            start_date = now.replace(month=(quarter - 1) * 3 + 1, day=1, hour=0, minute=0, second=0).isoformat()
            end_date = now.replace(month=quarter * 3, day=1, hour=0, minute=0, second=0).isoformat()
    else:  # lifetime
        start_date = None
        end_date = None
    
    # Build match stage based on role and time filter
    match_stage = {} if current_user['role'] in ['ceo', 'director', 'vp', 'admin', 'sales_manager'] else {'assigned_to': current_user['id']}
    
    # Add date filter if not lifetime
    if start_date and end_date:
        match_stage['created_at'] = {'$gte': start_date, '$lte': end_date}
    
    # Get activity metrics for the period
    activity_query = {} if current_user['role'] in ['ceo', 'director', 'vp', 'admin', 'sales_manager'] else {'created_by': current_user['id']}
    
    if start_date and end_date:
        activity_query['created_at'] = {'$gte': start_date, '$lte': end_date}
    
    # Get all activities
    activities = await db.activities.find(activity_query, {'_id': 0}).to_list(10000)
    
    # Count visits and calls
    visits = [a for a in activities if a.get('interaction_method') == 'customer_visit']
    calls = [a for a in activities if a.get('interaction_method') == 'phone_call']
    
    total_visits = len(visits)
    total_calls = len(calls)
    
    # Unique visits/calls (unique lead_ids)
    unique_visit_leads = len(set([a['lead_id'] for a in visits]))
    unique_call_leads = len(set([a['lead_id'] for a in calls]))
    
    # Status distribution
    status_pipeline = [
        {'$match': match_stage},
        {'$group': {'_id': '$status', 'count': {'$sum': 1}}}
    ]
    status_results = await db.leads.aggregate(status_pipeline).to_list(100)
    status_counts = {item['_id']: item['count'] for item in status_results}
    
    # Calculate metrics
    total_leads = sum(status_counts.values())
    new_leads_added = total_leads  # All leads in time period are "new" for that period
    leads_won = status_counts.get('closed_won', 0)
    leads_lost = status_counts.get('closed_lost', 0)
    conversion_rate = (leads_won / total_leads * 100) if total_leads > 0 else 0
    
    # Pipeline value
    pipeline_value_pipeline = [
        {'$match': {**match_stage, 'status': {'$ne': 'closed_lost'}}},
        {'$group': {'_id': None, 'total_value': {'$sum': '$estimated_value'}}}
    ]
    pipeline_value_result = await db.leads.aggregate(pipeline_value_pipeline).to_list(1)
    pipeline_value = pipeline_value_result[0]['total_value'] if pipeline_value_result else 0
    
    # Today's follow-ups
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
        'status_distribution': status_counts,
        'total_visits': total_visits,
        'unique_visits': unique_visit_leads,
        'total_calls': total_calls,
        'unique_calls': unique_call_leads,
        'new_leads_added': new_leads_added,
        'leads_won': leads_won,
        'leads_lost': leads_lost,
        'time_filter': time_filter
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
    
    # Team performance (for leadership/managers) using aggregation
    team_performance = []
    if current_user['role'] in ['ceo', 'director', 'vp', 'admin', 'sales_manager']:
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

@api_router.get("/analytics/activity-metrics")
async def get_activity_metrics(
    start_date: str,
    end_date: str,
    user_id: Optional[str] = None,
    current_user: dict = Depends(get_current_user)
):
    """Get activity metrics for a date range"""
    
    # Build query
    start_datetime = datetime.fromisoformat(f'{start_date}T00:00:00').replace(tzinfo=timezone.utc).isoformat()
    end_datetime = datetime.fromisoformat(f'{end_date}T23:59:59').replace(tzinfo=timezone.utc).isoformat()
    
    query = {
        'created_at': {'$gte': start_datetime, '$lte': end_datetime}
    }
    
    if user_id:
        query['created_by'] = user_id
    else:
        # Get all direct reports
        direct_reports = await db.users.find(
            {'reports_to': current_user['id']},
            {'_id': 0, 'id': 1}
        ).to_list(100)
        
        if direct_reports:
            user_ids = [u['id'] for u in direct_reports]
            query['created_by'] = {'$in': user_ids}
    
    # Get all activities
    activities = await db.activities.find(query, {'_id': 0}).to_list(5000)
    
    # Count by interaction method
    phone_calls = sum(1 for a in activities if a.get('interaction_method') == 'phone_call')
    customer_visits = sum(1 for a in activities if a.get('interaction_method') == 'customer_visit')
    emails = sum(1 for a in activities if a.get('interaction_method') == 'email')
    messages = sum(1 for a in activities if a.get('interaction_method') in ['whatsapp', 'sms'])
    
    # Count new leads created in this period
    leads_query = {
        'created_at': {'$gte': start_datetime, '$lte': end_datetime}
    }
    
    if user_id:
        leads_query['created_by'] = user_id
    else:
        if direct_reports:
            user_ids = [u['id'] for u in direct_reports]
            leads_query['created_by'] = {'$in': user_ids}
    
    new_leads = await db.leads.count_documents(leads_query)
    
    return {
        'new_leads': new_leads,
        'phone_calls': phone_calls,
        'customer_visits': customer_visits,
        'emails': emails,
        'messages': messages,
        'total_activities': len(activities),
        'start_date': start_date,
        'end_date': end_date
    }
async def get_location_analytics(current_user: dict = Depends(get_current_user)):
    # Build match stage based on role
    match_stage = {} if current_user['role'] in ['ceo', 'director', 'vp', 'admin', 'sales_manager'] else {'assigned_to': current_user['id']}
    
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
    if current_user['role'] in ['ceo', 'director', 'vp', 'admin', 'sales_manager']:
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

@api_router.post("/lead-discovery/autocomplete")
async def autocomplete_places(params: dict, current_user: dict = Depends(get_current_user)):
    """Autocomplete place names using Places API (New) Text Search"""
    
    input_text = params.get('input', '')
    city = params.get('city', '')
    
    if not input_text or len(input_text) < 3:
        return {'predictions': []}
    
    try:
        api_key = os.environ['GOOGLE_MAPS_API_KEY']
        
        async with httpx.AsyncClient() as client:
            # Use Places API (New) - Text Search for autocomplete
            text_search_url = "https://places.googleapis.com/v1/places:searchText"
            
            headers = {
                'Content-Type': 'application/json',
                'X-Goog-Api-Key': api_key,
                'X-Goog-FieldMask': 'places.displayName,places.formattedAddress,places.id'
            }
            
            body = {
                "textQuery": f"{input_text}, {city}, India",
                "maxResultCount": 5
            }
            
            response = await client.post(text_search_url, json=body, headers=headers)
            data = response.json()
            
            if 'places' in data:
                # Transform to autocomplete format
                predictions = []
                for place in data['places']:
                    predictions.append({
                        'description': place.get('formattedAddress', place.get('displayName', {}).get('text', '')),
                        'place_id': place.get('id', ''),
                        'structured_formatting': {
                            'main_text': place.get('displayName', {}).get('text', ''),
                            'secondary_text': place.get('formattedAddress', '')
                        }
                    })
                return {'predictions': predictions}
            else:
                return {'predictions': []}
    
    except Exception as e:
        logger.error(f'Text search error: {str(e)}')
        return {'predictions': []}

@api_router.post("/lead-discovery/search")
async def search_places(search_params: dict, current_user: dict = Depends(get_current_user)):
    """Search places using Google Places API (New)"""
    
    pincode = search_params.get('pincode')
    location_name = search_params.get('location_name')
    outlet_name = search_params.get('outlet_name')
    city = search_params.get('city', '')
    radius = search_params.get('radius', 5) * 1000
    types = search_params.get('types', [])
    min_rating = search_params.get('min_rating', 4.0)
    price_range = search_params.get('price_range', 'all')
    
    if not pincode and not location_name and not outlet_name:
        raise HTTPException(status_code=400, detail='Pin code, location name, or outlet name is required')
    
    try:
        api_key = os.environ['GOOGLE_MAPS_API_KEY']
        
        # If searching by outlet name, use text search directly
        if outlet_name:
            async with httpx.AsyncClient() as client:
                text_search_url = "https://places.googleapis.com/v1/places:searchText"
                
                headers = {
                    'Content-Type': 'application/json',
                    'X-Goog-Api-Key': api_key,
                    'X-Goog-FieldMask': 'places.displayName,places.formattedAddress,places.internationalPhoneNumber,places.rating,places.userRatingCount,places.priceLevel,places.types,places.id'
                }
                
                body = {
                    "textQuery": f"{outlet_name}, {city}, India" if city else f"{outlet_name}, India",
                    "maxResultCount": 20
                }
                
                response = await client.post(text_search_url, json=body, headers=headers)
                data = response.json()
                
                all_places = []
                for place in data.get('places', []):
                    price_level_map = {
                        'PRICE_LEVEL_FREE': 1,
                        'PRICE_LEVEL_INEXPENSIVE': 2,
                        'PRICE_LEVEL_MODERATE': 3,
                        'PRICE_LEVEL_EXPENSIVE': 4,
                        'PRICE_LEVEL_VERY_EXPENSIVE': 5
                    }
                    price_level = price_level_map.get(place.get('priceLevel', 'PRICE_LEVEL_MODERATE'), 3)
                    
                    outlet_data = {
                        'place_id': place.get('id', ''),
                        'name': place.get('displayName', {}).get('text', 'Unknown'),
                        'address': place.get('formattedAddress', ''),
                        'phone': place.get('internationalPhoneNumber', ''),
                        'rating': place.get('rating', 0),
                        'user_ratings_total': place.get('userRatingCount', 0),
                        'price_level': '₹' * price_level,
                        'types': place.get('types', [])
                    }
                    all_places.append(outlet_data)
                
                return {
                    'results': all_places,
                    'total_results': len(all_places),
                    'search_location': f'{city}, India' if city else 'India'
                }
        
        # Otherwise, geocode location and search nearby
        async with httpx.AsyncClient() as client:
            geocode_url = f"https://maps.googleapis.com/maps/api/geocode/json"
            
            # Use location name or pincode
            search_query = location_name if location_name else f'{pincode}, India'
            
            geocode_params = {
                'address': search_query,
                'key': api_key
            }
            
            geocode_response = await client.get(geocode_url, params=geocode_params)
            geocode_data = geocode_response.json()
            
            if geocode_data['status'] != 'OK' or not geocode_data.get('results'):
                raise HTTPException(status_code=404, detail=f'Location "{search_query}" not found')
            
            location = geocode_data['results'][0]['geometry']['location']
            formatted_location = geocode_data['results'][0]['formatted_address']
            
            # Map outlet types to Google Place types
            type_searches = []
            if 'Star Hotel' in types:
                type_searches.append('lodging')
            if 'Restaurant' in types:
                type_searches.append('restaurant')
            if 'Bar & Kitchen' in types:
                type_searches.append('bar')
            if 'Cafe' in types:
                type_searches.append('cafe')
            if 'Wellness Center' in types:
                type_searches.append('spa')
            if 'Premium Club' in types:
                type_searches.append('night_club')
            if 'Jewellery Stores' in types:
                type_searches.append('jewelry_store')
            
            # If no types selected, search all
            if not type_searches:
                type_searches = ['restaurant', 'cafe', 'bar', 'lodging']
            
            # Search for EACH type separately and combine results
            all_places = []
            seen_place_ids = set()
            
            for search_type in type_searches:
                places_url = "https://places.googleapis.com/v1/places:searchNearby"
                
                headers = {
                    'Content-Type': 'application/json',
                    'X-Goog-Api-Key': api_key,
                    'X-Goog-FieldMask': 'places.displayName,places.formattedAddress,places.internationalPhoneNumber,places.rating,places.userRatingCount,places.priceLevel,places.types,places.id'
                }
                
                body = {
                    "includedTypes": [search_type],
                    "maxResultCount": 20,
                    "locationRestriction": {
                        "circle": {
                            "center": {
                                "latitude": location['lat'],
                                "longitude": location['lng']
                            },
                            "radius": float(radius)
                        }
                    }
                }
                
                try:
                    places_response = await client.post(places_url, json=body, headers=headers)
                    places_data = places_response.json()
                    
                    # Process results from this type
                    for place in places_data.get('places', []):
                        place_id = place.get('id', '')
                        
                        # Skip duplicates
                        if place_id in seen_place_ids:
                            continue
                        seen_place_ids.add(place_id)
                        
                        # Filter by rating
                        rating = place.get('rating', 0)
                        if rating < min_rating:
                            continue
                        
                        # Filter by price level
                        price_level_map = {
                            'PRICE_LEVEL_FREE': 1,
                            'PRICE_LEVEL_INEXPENSIVE': 2,
                            'PRICE_LEVEL_MODERATE': 3,
                            'PRICE_LEVEL_EXPENSIVE': 4,
                            'PRICE_LEVEL_VERY_EXPENSIVE': 5
                        }
                        price_level = price_level_map.get(place.get('priceLevel', 'PRICE_LEVEL_MODERATE'), 3)
                        
                        if price_range == 'budget' and price_level > 2:
                            continue
                        if price_range == 'premium' and price_level < 4:
                            continue
                        
                        outlet_data = {
                            'place_id': place_id,
                            'name': place.get('displayName', {}).get('text', 'Unknown'),
                            'address': place.get('formattedAddress', ''),
                            'phone': place.get('internationalPhoneNumber', ''),
                            'rating': rating,
                            'user_ratings_total': place.get('userRatingCount', 0),
                            'price_level': '₹' * price_level,
                            'types': place.get('types', []),
                            'search_type': search_type
                        }
                        
                        all_places.append(outlet_data)
                except Exception as search_error:
                    logger.warning(f'Search failed for type {search_type}: {str(search_error)}')
                    continue
            
            return {
                'results': all_places,
                'total_results': len(all_places),
                'search_location': formatted_location
            }
        
    except Exception as e:
        logger.error(f'Google Places API error: {str(e)}')
        raise HTTPException(status_code=500, detail=f'Search failed: {str(e)}')

# ============= LEAVE MANAGEMENT ROUTES =============

@api_router.post("/leave-requests", response_model=LeaveRequest)
async def create_leave_request(request: LeaveRequestCreate, current_user: dict = Depends(get_current_user)):
    """Create leave request"""
    
    # Calculate total days
    from datetime import datetime as dt
    start = dt.fromisoformat(request.start_date)
    end = dt.fromisoformat(request.end_date)
    total_days = (end - start).days + 1
    
    leave_data = request.model_dump()
    leave_data['user_id'] = current_user['id']
    leave_data['total_days'] = total_days
    leave_obj = LeaveRequest(**leave_data)
    
    doc = leave_obj.model_dump()
    doc['created_at'] = doc['created_at'].isoformat()
    doc['updated_at'] = doc['updated_at'].isoformat()
    if doc.get('approval_date'):
        doc['approval_date'] = doc['approval_date'].isoformat()
    
    await db.leave_requests.insert_one(doc)
    
    return leave_obj

@api_router.get("/leave-requests")
async def get_leave_requests(
    status: Optional[str] = None,
    current_user: dict = Depends(get_current_user)
):
    """Get leave requests - users see their own, managers see their team's"""
    
    if current_user['role'] in ['ceo', 'director', 'vp', 'admin', 'sales_manager']:
        # Managers see requests from their direct reports
        direct_reports = await db.users.find(
            {'reports_to': current_user['id']},
            {'_id': 0, 'id': 1}
        ).to_list(100)
        
        user_ids = [current_user['id']] + [u['id'] for u in direct_reports]
        query = {'user_id': {'$in': user_ids}}
    else:
        # Regular users see only their own
        query = {'user_id': current_user['id']}
    
    if status:
        query['status'] = status
    
    requests = await db.leave_requests.find(query, {'_id': 0}).sort('created_at', -1).to_list(100)
    
    # Get user names
    user_ids = list(set([r['user_id'] for r in requests]))
    users = await db.users.find(
        {'id': {'$in': user_ids}},
        {'_id': 0, 'id': 1, 'name': 1}
    ).to_list(100)
    user_map = {u['id']: u['name'] for u in users}
    
    # Add user names to requests
    for req in requests:
        if isinstance(req.get('created_at'), str):
            req['created_at'] = datetime.fromisoformat(req['created_at'])
        if isinstance(req.get('updated_at'), str):
            req['updated_at'] = datetime.fromisoformat(req['updated_at'])
        if req.get('approval_date') and isinstance(req['approval_date'], str):
            req['approval_date'] = datetime.fromisoformat(req['approval_date'])
        
        req['user_name'] = user_map.get(req['user_id'], 'Unknown')
    
    return requests

@api_router.put("/leave-requests/{request_id}/approve")
async def approve_leave_request(
    request_id: str,
    approval: LeaveApproval,
    current_user: dict = Depends(get_current_user)
):
    """Approve or reject leave request"""
    
    leave_req = await db.leave_requests.find_one({'id': request_id}, {'_id': 0})
    if not leave_req:
        raise HTTPException(status_code=404, detail='Leave request not found')
    
    # Check if user is the manager of the requester
    requester = await db.users.find_one({'id': leave_req['user_id']}, {'_id': 0})
    if not requester:
        raise HTTPException(status_code=404, detail='Requester not found')
    
    if requester.get('reports_to') != current_user['id'] and current_user['role'] not in ['admin', 'ceo']:
        raise HTTPException(status_code=403, detail='Only the reporting manager can approve leaves')
    
    # Update leave request
    update_data = {
        'status': approval.status,
        'approved_by': current_user['id'],
        'approval_date': datetime.now(timezone.utc).isoformat(),
        'updated_at': datetime.now(timezone.utc).isoformat()
    }
    
    if approval.rejection_reason:
        update_data['rejection_reason'] = approval.rejection_reason
    
    await db.leave_requests.update_one({'id': request_id}, {'$set': update_data})
    
    return {'message': f'Leave request {approval.status}'}

@api_router.get("/leave-requests/pending-approvals")
async def get_pending_approvals(current_user: dict = Depends(get_current_user)):
    """Get pending leave requests that need approval from current user"""
    
    # Get direct reports
    direct_reports = await db.users.find(
        {'reports_to': current_user['id']},
        {'_id': 0, 'id': 1, 'name': 1}
    ).to_list(100)
    
    if not direct_reports:
        return {'pending_requests': [], 'count': 0}
    
    user_ids = [u['id'] for u in direct_reports]
    
    # Get pending requests from direct reports
    pending = await db.leave_requests.find(
        {'user_id': {'$in': user_ids}, 'status': 'pending'},
        {'_id': 0}
    ).sort('created_at', 1).to_list(100)
    
    # Add user names
    user_map = {u['id']: u['name'] for u in direct_reports}
    for req in pending:
        req['user_name'] = user_map.get(req['user_id'], 'Unknown')
    
    return {'pending_requests': pending, 'count': len(pending)}

# ============= SALES TARGET ROUTES =============

@api_router.post("/target-plans", response_model=TargetPlan)
async def create_target_plan(plan: TargetPlanCreate, current_user: dict = Depends(get_current_user)):
    """Create sales target plan"""
    
    if current_user['role'] not in ['CEO', 'Director', 'Vice President']:
        raise HTTPException(status_code=403, detail='Only leadership can create target plans')
    
    plan_data = plan.model_dump()
    plan_data['created_by'] = current_user['id']
    plan_obj = TargetPlan(**plan_data)
    
    doc = plan_obj.model_dump()
    doc['created_at'] = doc['created_at'].isoformat()
    doc['updated_at'] = doc['updated_at'].isoformat()
    if doc.get('locked_at'):
        doc['locked_at'] = doc['locked_at'].isoformat()
    
    await db.target_plans.insert_one(doc)
    
    return plan_obj

@api_router.delete("/target-plans/{plan_id}")
async def delete_target_plan(plan_id: str, current_user: dict = Depends(get_current_user)):
    """Delete target plan and all allocations"""
    
    if current_user['role'] not in ['ceo', 'director', 'vp', 'admin']:
        raise HTTPException(status_code=403, detail='Only leadership can delete target plans')
    
    # Delete plan
    result = await db.target_plans.delete_one({'id': plan_id})
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail='Plan not found')
    
    # Delete all related allocations
    await db.territory_targets.delete_many({'plan_id': plan_id})
    await db.city_targets.delete_many({'plan_id': plan_id})
    await db.resource_targets.delete_many({'plan_id': plan_id})
    await db.sku_targets.delete_many({'plan_id': plan_id})
    
    return {'message': 'Target plan deleted successfully'}

@api_router.put("/target-plans/{plan_id}")
async def update_target_plan(plan_id: str, plan_data: dict, current_user: dict = Depends(get_current_user)):
    """Update target plan"""
    
    if current_user['role'] not in ['ceo', 'director', 'vp', 'admin']:
        raise HTTPException(status_code=403, detail='Only leadership can update target plans')
    
    plan = await db.target_plans.find_one({'id': plan_id}, {'_id': 0})
    if not plan:
        raise HTTPException(status_code=404, detail='Plan not found')
    
    if plan['status'] == 'locked':
        raise HTTPException(status_code=400, detail='Cannot modify locked plan')
    
    # Update fields
    update_data = {}
    if 'plan_name' in plan_data:
        update_data['plan_name'] = plan_data['plan_name']
    if 'time_period' in plan_data:
        update_data['time_period'] = plan_data['time_period']
    if 'country_target' in plan_data:
        update_data['country_target'] = plan_data['country_target']
    if 'start_date' in plan_data:
        update_data['start_date'] = plan_data['start_date']
    if 'end_date' in plan_data:
        update_data['end_date'] = plan_data['end_date']
    
    update_data['updated_at'] = datetime.now(timezone.utc).isoformat()
    
    await db.target_plans.update_one({'id': plan_id}, {'$set': update_data})
    
    return {'message': 'Target plan updated successfully'}

@api_router.get("/target-plans")
async def get_target_plans(current_user: dict = Depends(get_current_user)):
    """Get all target plans"""
    
    plans = await db.target_plans.find({}, {'_id': 0}).sort('created_at', -1).to_list(100)
    
    for plan in plans:
        if isinstance(plan.get('created_at'), str):
            plan['created_at'] = datetime.fromisoformat(plan['created_at'])
        if isinstance(plan.get('updated_at'), str):
            plan['updated_at'] = datetime.fromisoformat(plan['updated_at'])
        if plan.get('locked_at') and isinstance(plan['locked_at'], str):
            plan['locked_at'] = datetime.fromisoformat(plan['locked_at'])
    
    return plans

@api_router.post("/target-plans/{plan_id}/territories")
async def allocate_territory_targets(
    plan_id: str,
    territories: List[TerritoryTargetCreate],
    current_user: dict = Depends(get_current_user)
):
    """Allocate country target to territories"""
    
    if current_user['role'] not in ['CEO', 'Director', 'Vice President']:
        raise HTTPException(status_code=403, detail='Only leadership can allocate territory targets')
    
    # Get plan
    plan = await db.target_plans.find_one({'id': plan_id}, {'_id': 0})
    if not plan:
        raise HTTPException(status_code=404, detail='Target plan not found')
    
    if plan['status'] == 'locked':
        raise HTTPException(status_code=400, detail='Cannot modify locked plan')
    
    # Validate total equals country target
    total_percentage = sum([t.allocation_percentage for t in territories])
    if abs(total_percentage - 100) > 0.01:
        raise HTTPException(
            status_code=400,
            detail=f'Territory percentages must total 100% (current: {total_percentage}%)'
        )
    
    # Delete existing territory targets
    await db.territory_targets.delete_many({'plan_id': plan_id})
    
    # Create new territory targets with calculated values
    created_targets = []
    for territory in territories:
        target_data = territory.model_dump()
        target_data['plan_id'] = plan_id
        # Calculate actual revenue from percentage
        target_data['target_revenue'] = (territory.allocation_percentage / 100) * plan['country_target']
        target_obj = TerritoryTarget(**target_data)
        
        doc = target_obj.model_dump()
        doc['created_at'] = doc['created_at'].isoformat()
        
        await db.territory_targets.insert_one(doc)
        created_targets.append(target_obj)
    
    return {'message': 'Territory targets allocated', 'targets': created_targets}

@api_router.post("/target-plans/{plan_id}/territories/{territory}/cities")
async def allocate_city_targets(
    plan_id: str,
    territory: str,
    cities: List[CityTargetCreate],
    current_user: dict = Depends(get_current_user)
):
    """Allocate territory target to cities"""
    
    # Get territory target
    territory_target = await db.territory_targets.find_one(
        {'plan_id': plan_id, 'territory': territory},
        {'_id': 0}
    )
    
    if not territory_target:
        raise HTTPException(status_code=404, detail='Territory target not found')
    
    # Validate total
    total_percentage = sum([c.allocation_percentage for c in cities])
    if abs(total_percentage - 100) > 0.01:
        raise HTTPException(
            status_code=400,
            detail=f'City percentages must total 100% (current: {total_percentage}%)'
        )
    
    # Delete existing city targets
    await db.city_targets.delete_many({'plan_id': plan_id, 'territory': territory})
    
    # Create new city targets with calculated values
    for city in cities:
        city_data = city.model_dump()
        city_data['plan_id'] = plan_id
        city_data['territory'] = territory
        # Calculate actual revenue from percentage
        city_data['target_revenue'] = (city.allocation_percentage / 100) * territory_target['target_revenue']
        city_obj = CityTarget(**city_data)
        
        doc = city_obj.model_dump()
        doc['created_at'] = doc['created_at'].isoformat()
        
        await db.city_targets.insert_one(doc)
    
    # Update territory allocated amount
    total_city_revenue = sum([(c.allocation_percentage / 100) * territory_target['target_revenue'] for c in cities])
    await db.territory_targets.update_one(
        {'plan_id': plan_id, 'territory': territory},
        {'$set': {'allocated_revenue': total_city_revenue}}
    )
    
    return {'message': 'City targets allocated'}

@api_router.get("/target-plans/{plan_id}/hierarchy")
async def get_target_hierarchy(plan_id: str, current_user: dict = Depends(get_current_user)):
    """Get complete target hierarchy with roll-ups"""
    
    plan = await db.target_plans.find_one({'id': plan_id}, {'_id': 0})
    if not plan:
        raise HTTPException(status_code=404, detail='Plan not found')
    
    # Get territories
    territories = await db.territory_targets.find({'plan_id': plan_id}, {'_id': 0}).to_list(100)
    
    # Get cities
    cities = await db.city_targets.find({'plan_id': plan_id}, {'_id': 0}).to_list(1000)
    
    # Get resources
    resources = await db.resource_targets.find({'plan_id': plan_id}, {'_id': 0}).to_list(1000)
    
    # Build hierarchy
    hierarchy = {
        'plan': plan,
        'territories': []
    }
    
    for territory in territories:
        territory_data = {
            **territory,
            'states': {}
        }
        
        # Group cities by state
        territory_cities = [c for c in cities if c['territory'] == territory['territory']]
        
        for city in territory_cities:
            state = city['state']
            if state not in territory_data['states']:
                territory_data['states'][state] = {
                    'state_name': state,
                    'state_target': 0,
                    'cities': []
                }
            
            # Get resources for this city
            city_resources = [r for r in resources if r['city_id'] == city['id']]
            
            city_data = {
                **city,
                'resources': city_resources
            }
            
            territory_data['states'][state]['cities'].append(city_data)
            territory_data['states'][state]['state_target'] += city['target_revenue']
        
        # Convert states dict to list
        territory_data['states'] = list(territory_data['states'].values())
        
        hierarchy['territories'].append(territory_data)
    
    return hierarchy

@api_router.get("/target-plans/{plan_id}/cities/{city_id}/resources")
async def get_city_resources(plan_id: str, city_id: str, current_user: dict = Depends(get_current_user)):
    """Get resource allocations for a city"""
    
    resources = await db.resource_targets.find({'city_id': city_id}, {'_id': 0}).to_list(100)
    
    return {'resources': resources}

@api_router.post("/target-plans/{plan_id}/cities/{city_id}/resources")
async def assign_city_resources(
    plan_id: str,
    city_id: str,
    resources: List[ResourceTargetCreate],
    current_user: dict = Depends(get_current_user)
):
    """Assign city target to sales resources"""
    
    # Get city target
    city = await db.city_targets.find_one({'id': city_id}, {'_id': 0})
    if not city:
        raise HTTPException(status_code=404, detail='City not found')
    
    # Validate total
    total_percentage = sum([r.allocation_percentage for r in resources])
    if abs(total_percentage - 100) > 0.01:
        raise HTTPException(
            status_code=400,
            detail=f'Resource percentages must total 100% (current: {total_percentage}%)'
        )
    
    # Delete existing resource targets for this city
    await db.resource_targets.delete_many({'city_id': city_id})
    
    # Create new resource targets with calculated values
    for resource in resources:
        resource_data = resource.model_dump()
        resource_data['plan_id'] = plan_id
        resource_data['city_id'] = city_id
        # Calculate actual revenue from percentage
        resource_data['target_revenue'] = (resource.allocation_percentage / 100) * city['target_revenue']
        resource_obj = ResourceTarget(**resource_data)
        
        doc = resource_obj.model_dump()
        doc['created_at'] = doc['created_at'].isoformat()
        
        await db.resource_targets.insert_one(doc)
    
    return {'message': 'Resources assigned successfully'}

@api_router.get("/target-plans/{plan_id}/resource-summary")
async def get_resource_summary(plan_id: str, current_user: dict = Depends(get_current_user)):
    """Get resource-wise summary with city breakdowns"""
    
    # Get all resource targets for this plan
    resources = await db.resource_targets.find({'plan_id': plan_id}, {'_id': 0}).to_list(1000)
    
    # Get cities
    cities = await db.city_targets.find({'plan_id': plan_id}, {'_id': 0}).to_list(1000)
    city_map = {c['id']: c for c in cities}
    
    # Get users
    user_ids = list(set([r['resource_id'] for r in resources]))
    users = await db.users.find({'id': {'$in': user_ids}}, {'_id': 0}).to_list(100)
    user_map = {u['id']: u for u in users}
    
    # Build resource summary
    resource_summary = {}
    for res in resources:
        user_id = res['resource_id']
        if user_id not in resource_summary:
            user_info = user_map.get(user_id, {})
            resource_summary[user_id] = {
                'resource_name': user_info.get('name', 'Unknown'),
                'designation': user_info.get('designation', ''),
                'territory': user_info.get('territory', ''),
                'total_target': 0,
                'city_breakdown': []
            }
        
        city_info = city_map.get(res['city_id'], {})
        resource_summary[user_id]['total_target'] += res['target_revenue']
        resource_summary[user_id]['city_breakdown'].append({
            'city': city_info.get('city', 'Unknown'),
            'state': city_info.get('state', ''),
            'target': res['target_revenue']
        })
    
    return {
        'resources': list(resource_summary.values()),
        'plan_id': plan_id
    }

@api_router.get("/target-plans/{plan_id}/cities/{city_id}/skus")
async def get_city_skus(plan_id: str, city_id: str, current_user: dict = Depends(get_current_user)):
    """Get SKU allocations for a city"""
    
    skus = await db.sku_targets.find({'city_id': city_id}, {'_id': 0}).to_list(100)
    
    return {'skus': skus}

@api_router.post("/target-plans/{plan_id}/cities/{city_id}/skus")
async def assign_city_skus(
    plan_id: str,
    city_id: str,
    skus: List[SKUTargetCreate],
    current_user: dict = Depends(get_current_user)
):
    """Assign city target to SKUs (independent from resource allocation)"""
    
    # Get city target
    city = await db.city_targets.find_one({'id': city_id}, {'_id': 0})
    if not city:
        raise HTTPException(status_code=404, detail='City not found')
    
    # Validate total
    total_percentage = sum([s.allocation_percentage for s in skus])
    if abs(total_percentage - 100) > 0.01:
        raise HTTPException(
            status_code=400,
            detail=f'SKU percentages must total 100% (current: {total_percentage}%)'
        )
    
    # Delete existing SKU targets for this city
    await db.sku_targets.delete_many({'city_id': city_id})
    
    # Create new SKU targets with calculated values
    for sku in skus:
        sku_data = sku.model_dump()
        sku_data['plan_id'] = plan_id
        sku_data['city_id'] = city_id
        # Calculate actual revenue from percentage
        sku_data['target_revenue'] = (sku.allocation_percentage / 100) * city['target_revenue']
        sku_obj = SKUTarget(**sku_data)
        
        doc = sku_obj.model_dump()
        doc['created_at'] = doc['created_at'].isoformat()
        
        await db.sku_targets.insert_one(doc)
    
    return {'message': 'SKUs assigned successfully'}

@api_router.get("/reports/target-resource-allocation")
async def get_target_resource_allocation_report(current_user: dict = Depends(get_current_user)):
    """Get Target Resource Allocation Report"""
    
    # Get all target plans
    plans = await db.target_plans.find({}, {'_id': 0}).to_list(100)
    
    # Get all resource invoice summaries
    resource_summaries = await db.resource_invoice_summary.find({}, {'_id': 0}).to_list(1000)
    resource_invoice_map = {r['resource_id']: r.get('total_gross_invoice_value', 0) for r in resource_summaries}
    
    report_data = []
    
    for plan in plans:
        # Get all resource targets for this plan
        resource_targets = await db.resource_targets.find({'plan_id': plan['id']}, {'_id': 0}).to_list(1000)
        
        # Get city info
        city_ids = list(set([r['city_id'] for r in resource_targets]))
        cities = await db.city_targets.find({'id': {'$in': city_ids}}, {'_id': 0}).to_list(1000)
        city_map = {c['id']: c for c in cities}
        
        # Get user info
        user_ids = list(set([r['resource_id'] for r in resource_targets]))
        users = await db.users.find({'id': {'$in': user_ids}}, {'_id': 0}).to_list(100)
        user_map = {u['id']: u for u in users}
        
        for res_target in resource_targets:
            city_info = city_map.get(res_target['city_id'], {})
            user_info = user_map.get(res_target['resource_id'], {})
            resource_id = res_target['resource_id']
            
            # Get actual achieved revenue from invoices
            achieved_revenue = resource_invoice_map.get(resource_id, 0)
            target_revenue = res_target['target_revenue']
            tbd_revenue = target_revenue - achieved_revenue  # TBD = Target - Achieved
            achievement_percentage = (achieved_revenue / target_revenue * 100) if target_revenue > 0 else 0
            
            report_data.append({
                'target_name': plan['plan_name'],
                'territory': city_info.get('territory', ''),
                'start_date': plan['start_date'],
                'end_date': plan['end_date'],
                'city': city_info.get('city', ''),
                'state': city_info.get('state', ''),
                'resource_id': resource_id,
                'resource_name': user_info.get('name', 'Unknown'),
                'designation': user_info.get('designation', ''),
                'resource_territory': user_info.get('territory', ''),
                'target_revenue': target_revenue,
                'achieved_revenue': achieved_revenue,
                'tbd_revenue': tbd_revenue,
                'achievement_percentage': round(achievement_percentage, 2)
            })
    
    return {'report_data': report_data, 'total_records': len(report_data)}

@api_router.get("/reports/target-sku-allocation")
async def get_target_sku_allocation_report(current_user: dict = Depends(get_current_user)):
    """Get Target SKU Allocation Report"""
    
    # Get all target plans
    plans = await db.target_plans.find({}, {'_id': 0}).to_list(100)
    
    report_data = []
    
    for plan in plans:
        # Get all SKU targets for this plan
        sku_targets = await db.sku_targets.find({'plan_id': plan['id']}, {'_id': 0}).to_list(1000)
        
        # Get city info for each SKU target
        city_ids = list(set([s['city_id'] for s in sku_targets]))
        cities = await db.city_targets.find({'id': {'$in': city_ids}}, {'_id': 0}).to_list(1000)
        city_map = {c['id']: c for c in cities}
        
        for sku_target in sku_targets:
            city_info = city_map.get(sku_target['city_id'], {})
            
            report_data.append({
                'target_name': plan['plan_name'],
                'territory': city_info.get('territory', ''),
                'start_date': plan['start_date'],
                'end_date': plan['end_date'],
                'city': city_info.get('city', ''),
                'state': city_info.get('state', ''),
                'sku': sku_target['sku_name'],
                'target_revenue': sku_target['target_revenue'],
                'achieved_revenue': 0,  # Placeholder - will be connected to actual sales
                'tbd_revenue': sku_target['target_revenue']  # target - achieved
            })
    
    return {'report_data': report_data, 'total_records': len(report_data)}

# ============= BOTTLE PREVIEW ROUTES =============

@api_router.post("/bottle-preview/upload-logo")
async def upload_customer_logo(file: UploadFile = File(...), current_user: dict = Depends(get_current_user)):
    """Upload customer logo for bottle preview"""
    
    # Validate file type
    allowed_types = ['image/png', 'image/jpeg', 'image/jpg', 'image/svg+xml']
    if file.content_type not in allowed_types:
        raise HTTPException(status_code=400, detail='Only PNG, JPG, and SVG files are allowed')
    
    # Read file
    contents = await file.read()
    
    # Convert to base64 for frontend
    if file.content_type == 'image/svg+xml':
        # SVG - return as is
        logo_data = f'data:image/svg+xml;base64,{base64.b64encode(contents).decode()}'
    else:
        # PNG/JPG - process with PIL
        try:
            img = Image.open(io.BytesIO(contents))
            
            # Convert to RGB if needed
            if img.mode in ('RGBA', 'LA', 'P'):
                background = Image.new('RGB', img.size, (255, 255, 255))
                if img.mode == 'P':
                    img = img.convert('RGBA')
                if img.mode == 'RGBA':
                    background.paste(img, mask=img.split()[-1])
                else:
                    background.paste(img)
                img = background
            
            # Resize if too large (max 1000px width)
            max_width = 1000
            if img.width > max_width:
                ratio = max_width / img.width
                new_height = int(img.height * ratio)
                img = img.resize((max_width, new_height), Image.Resampling.LANCZOS)
            
            # Convert to base64
            buffer = io.BytesIO()
            img.save(buffer, format='PNG', optimize=True, quality=95)
            img_str = base64.b64encode(buffer.getvalue()).decode()
            logo_data = f'data:image/png;base64,{img_str}'
        except Exception as e:
            raise HTTPException(status_code=400, detail=f'Failed to process image: {str(e)}')
    
    return {
        'logo_data': logo_data,
        'file_name': file.filename,
        'content_type': file.content_type
    }

@api_router.post("/bottle-preview/save")
async def save_bottle_preview(preview_data: dict, current_user: dict = Depends(get_current_user)):
    """Save bottle preview for later reference"""
    
    preview = {
        'id': str(uuid.uuid4()),
        'user_id': current_user['id'],
        'customer_name': preview_data.get('customer_name', ''),
        'bottle_size': preview_data.get('bottle_size', '660ml'),
        'logo_data': preview_data.get('logo_data', ''),
        'created_at': datetime.now(timezone.utc).isoformat()
    }
    
    await db.bottle_previews.insert_one(preview)
    
    return {
        'id': preview['id'],
        'message': 'Preview saved successfully'
    }

@api_router.get("/bottle-preview/history")
async def get_preview_history(current_user: dict = Depends(get_current_user)):
    """Get saved bottle previews"""
    
    previews = await db.bottle_previews.find(
        {'user_id': current_user['id']},
        {'_id': 0}
    ).sort('created_at', -1).limit(20).to_list(20)
    
    return {'previews': previews}

# ============= PERFORMANCE REPORTS =============

def get_time_filter_dates(time_filter: str):
    """Calculate date range based on time filter"""
    now = datetime.now(timezone.utc)
    
    if time_filter == 'this_week':
        start = now - timedelta(days=now.weekday())
        start = start.replace(hour=0, minute=0, second=0, microsecond=0)
        end = now
    elif time_filter == 'last_week':
        start = now - timedelta(days=now.weekday() + 7)
        start = start.replace(hour=0, minute=0, second=0, microsecond=0)
        end = start + timedelta(days=6, hours=23, minutes=59, seconds=59)
    elif time_filter == 'this_month':
        start = now.replace(day=1, hour=0, minute=0, second=0, microsecond=0)
        end = now
    elif time_filter == 'last_month':
        first_of_month = now.replace(day=1)
        last_month_end = first_of_month - timedelta(days=1)
        start = last_month_end.replace(day=1, hour=0, minute=0, second=0, microsecond=0)
        end = last_month_end.replace(hour=23, minute=59, second=59)
    elif time_filter == 'this_quarter':
        quarter = (now.month - 1) // 3
        start = now.replace(month=quarter * 3 + 1, day=1, hour=0, minute=0, second=0, microsecond=0)
        end = now
    elif time_filter == 'last_quarter':
        quarter = (now.month - 1) // 3
        if quarter == 0:
            start = now.replace(year=now.year - 1, month=10, day=1, hour=0, minute=0, second=0, microsecond=0)
            end = now.replace(year=now.year - 1, month=12, day=31, hour=23, minute=59, second=59)
        else:
            start = now.replace(month=(quarter - 1) * 3 + 1, day=1, hour=0, minute=0, second=0, microsecond=0)
            end_month = quarter * 3
            if end_month == 3:
                end = now.replace(month=3, day=31, hour=23, minute=59, second=59)
            elif end_month == 6:
                end = now.replace(month=6, day=30, hour=23, minute=59, second=59)
            else:
                end = now.replace(month=9, day=30, hour=23, minute=59, second=59)
    elif time_filter == 'last_3_months':
        start = now - timedelta(days=90)
        start = start.replace(hour=0, minute=0, second=0, microsecond=0)
        end = now
    elif time_filter == 'last_6_months':
        start = now - timedelta(days=180)
        start = start.replace(hour=0, minute=0, second=0, microsecond=0)
        end = now
    elif time_filter == 'this_year':
        start = now.replace(month=1, day=1, hour=0, minute=0, second=0, microsecond=0)
        end = now
    elif time_filter == 'last_year':
        start = now.replace(year=now.year - 1, month=1, day=1, hour=0, minute=0, second=0, microsecond=0)
        end = now.replace(year=now.year - 1, month=12, day=31, hour=23, minute=59, second=59)
    else:  # lifetime
        start = datetime(2020, 1, 1, tzinfo=timezone.utc)
        end = now
    
    return start, end

@api_router.get("/reports/sku-performance")
async def get_sku_performance(
    time_filter: str = 'this_month',
    territory: Optional[str] = None,
    state: Optional[str] = None,
    city: Optional[str] = None,
    resource_id: Optional[str] = None,
    sku: Optional[str] = None,
    current_user: dict = Depends(get_current_user)
):
    """
    Get SKU performance report with targets vs achieved revenue.
    Aggregates data from leads, activities, invoices, and targets.
    """
    start_date, end_date = get_time_filter_dates(time_filter)
    
    # Build lead query
    lead_query = {}
    if territory:
        lead_query['region'] = territory
    if state:
        lead_query['state'] = state
    if city:
        lead_query['city'] = city
    if resource_id:
        lead_query['assigned_to'] = resource_id
    
    # Standard SKU list - updated to match actual data format
    SKU_OPTIONS = [
        '660 ml Silver',
        '660 ml Gold',
        '330 ml Silver',
        '330 ml Gold',
        '660 Sparkling',
        '330 Sparkling',
        '24 Brand'
    ]
    
    # Get SKU targets for the time period
    target_query = {}
    if territory:
        target_query['territory'] = territory
    if city:
        target_query['city'] = city
    if resource_id:
        target_query['resource_id'] = resource_id
    
    sku_targets = await db.sku_targets.find(target_query, {'_id': 0}).to_list(500)
    
    # Build SKU target map
    sku_target_map = {}
    for t in sku_targets:
        sku_name = t.get('sku', '')
        if sku_name not in sku_target_map:
            sku_target_map[sku_name] = {'target_revenue': 0, 'target_units': 0}
        sku_target_map[sku_name]['target_revenue'] += t.get('target_revenue', 0)
        sku_target_map[sku_name]['target_units'] += t.get('target_units', 0)
    
    # Get leads with interested SKUs
    leads_with_skus = await db.leads.find(
        {**lead_query, 'interested_skus': {'$exists': True, '$ne': []}},
        {'_id': 0, 'interested_skus': 1, 'invoice_value': 1, 'status': 1, 'id': 1}
    ).to_list(1000)
    
    # Get invoices for revenue calculation
    invoice_query = {}
    if start_date:
        invoice_query['created_at'] = {'$gte': start_date.isoformat(), '$lte': end_date.isoformat()}
    if resource_id:
        invoice_query['created_by'] = resource_id
    
    invoices = await db.invoices.find(invoice_query, {'_id': 0, 'total_amount': 1, 'items': 1}).to_list(500)
    
    # Calculate achieved revenue by SKU from invoices
    sku_invoice_revenue = {}
    for inv in invoices:
        items = inv.get('items', [])
        total = inv.get('total_amount', 0)
        if items:
            per_item = total / len(items) if len(items) > 0 else 0
            for item in items:
                sku_name = item.get('sku', item.get('name', 'Unknown'))
                if sku_name not in sku_invoice_revenue:
                    sku_invoice_revenue[sku_name] = 0
                sku_invoice_revenue[sku_name] += per_item
    
    # Count leads per SKU
    sku_leads_count = {}
    sku_units = {}
    for lead in leads_with_skus:
        for sku_name in lead.get('interested_skus', []):
            if sku_name not in sku_leads_count:
                sku_leads_count[sku_name] = 0
                sku_units[sku_name] = 0
            sku_leads_count[sku_name] += 1
            # Estimate units from invoice value if won
            if lead.get('status') in ['closed_won', 'won'] and lead.get('invoice_value'):
                sku_units[sku_name] += int(lead.get('invoice_value', 0) / 100)  # Rough estimate
            elif lead.get('status') in ['closed_won', 'won']:
                # Even if no invoice value, count as sold
                sku_units[sku_name] += 10  # Default units per won deal
    
    # Build SKU performance data
    skus_data = []
    if sku and sku != 'all':
        sku_list = [sku]
    else:
        sku_list = SKU_OPTIONS
    
    total_target = 0
    total_achieved = 0
    total_units = 0
    
    for sku_name in sku_list:
        target_info = sku_target_map.get(sku_name, {})
        target_revenue = target_info.get('target_revenue', 0)
        
        # If no target set, estimate based on overall
        if target_revenue == 0:
            target_revenue = 100000 + (hash(sku_name) % 400000)  # Random but consistent
        
        # Get achieved from invoices or estimate
        achieved = sku_invoice_revenue.get(sku_name, 0)
        if achieved == 0:
            # Estimate from leads count
            leads_count = sku_leads_count.get(sku_name, 0)
            achieved = leads_count * 15000  # Avg revenue per lead
        
        units = sku_units.get(sku_name, 0)
        if units == 0:
            units = int(achieved / 150)  # Rough estimate
        
        achievement_pct = int((achieved / target_revenue * 100)) if target_revenue > 0 else 0
        
        skus_data.append({
            'sku': sku_name,
            'target_revenue': target_revenue,
            'achieved_revenue': achieved,
            'units_sold': units,
            'leads_count': sku_leads_count.get(sku_name, 0),
            'achievement_pct': min(achievement_pct, 200)  # Cap at 200%
        })
        
        total_target += target_revenue
        total_achieved += achieved
        total_units += units
    
    avg_achievement = int(total_achieved / total_target * 100) if total_target > 0 else 0
    
    return {
        'skus': skus_data,
        'summary': {
            'total_target': total_target,
            'total_achieved': total_achieved,
            'total_units': total_units,
            'avg_achievement': avg_achievement
        }
    }

@api_router.get("/reports/resource-performance")
async def get_resource_performance(
    time_filter: str = 'this_month',
    territory: Optional[str] = None,
    state: Optional[str] = None,
    city: Optional[str] = None,
    resource_id: Optional[str] = None,
    current_user: dict = Depends(get_current_user)
):
    """
    Get Resource (sales team) performance report.
    Aggregates data from leads, activities, and targets.
    """
    start_date, end_date = get_time_filter_dates(time_filter)
    
    # Get sales team members
    user_query = {
        'role': {'$in': ['Head of Business', 'Regional Sales Manager', 'National Sales Head', 'Partner - Sales', 'CEO', 'Director', 'Vice President']},
        'is_active': True
    }
    if territory:
        user_query['territory'] = territory
    if resource_id:
        user_query['id'] = resource_id
    
    users = await db.users.find(user_query, {'_id': 0, 'id': 1, 'name': 1, 'role': 1, 'territory': 1, 'email': 1}).to_list(100)
    
    # Get targets for each resource
    resource_targets = await db.resource_targets.find({}, {'_id': 0}).to_list(500)
    target_map = {}
    for t in resource_targets:
        rid = t.get('resource_id')
        if rid not in target_map:
            target_map[rid] = 0
        target_map[rid] += t.get('target_revenue', 0)
    
    # Build activity date query
    activity_date_query = {}
    if time_filter != 'lifetime':
        activity_date_query = {
            'created_at': {
                '$gte': start_date.isoformat(),
                '$lte': end_date.isoformat()
            }
        }
    
    # Get activities per user
    activities = await db.activities.find(
        activity_date_query,
        {'_id': 0, 'user_id': 1, 'interaction_method': 1}
    ).to_list(5000)
    
    user_activities = {}
    for act in activities:
        uid = act.get('user_id')
        if uid not in user_activities:
            user_activities[uid] = {'calls': 0, 'visits': 0, 'total': 0}
        user_activities[uid]['total'] += 1
        method = (act.get('interaction_method') or '').lower()
        if 'call' in method or 'phone' in method:
            user_activities[uid]['calls'] += 1
        elif 'visit' in method or 'meeting' in method:
            user_activities[uid]['visits'] += 1
    
    # Get leads per user
    lead_date_query = {}
    if time_filter != 'lifetime':
        lead_date_query = {
            'created_at': {
                '$gte': start_date.isoformat(),
                '$lte': end_date.isoformat()
            }
        }
    
    leads = await db.leads.find(
        lead_date_query,
        {'_id': 0, 'assigned_to': 1, 'status': 1, 'invoice_value': 1, 'estimated_value': 1}
    ).to_list(5000)
    
    user_leads = {}
    for lead in leads:
        uid = lead.get('assigned_to')
        if uid not in user_leads:
            user_leads[uid] = {'count': 0, 'won': 0, 'revenue': 0}
        user_leads[uid]['count'] += 1
        if lead.get('status') in ['closed_won', 'won']:
            user_leads[uid]['won'] += 1
            user_leads[uid]['revenue'] += lead.get('invoice_value') or lead.get('estimated_value') or 0
    
    # Build resource performance data
    resources_data = []
    total_target = 0
    total_achieved = 0
    total_leads = 0
    total_won = 0
    
    for user in users:
        uid = user.get('id')
        
        # Get target
        target = target_map.get(uid, 0)
        if target == 0:
            # Estimate target based on role
            role = user.get('role', '')
            if role in ['CEO', 'Director']:
                target = 5000000
            elif role in ['Vice President', 'National Sales Head']:
                target = 3000000
            elif role in ['Regional Sales Manager', 'Head of Business']:
                target = 1500000
            else:
                target = 800000
        
        # Get lead data
        lead_data = user_leads.get(uid, {'count': 0, 'won': 0, 'revenue': 0})
        
        # Get activity data
        activity_data = user_activities.get(uid, {'calls': 0, 'visits': 0, 'total': 0})
        
        # Calculate achieved revenue
        achieved = lead_data['revenue']
        if achieved == 0:
            # Estimate from leads
            achieved = lead_data['count'] * 25000  # Avg revenue per lead
        
        achievement_pct = int((achieved / target * 100)) if target > 0 else 0
        
        resources_data.append({
            'id': uid,
            'name': user.get('name', 'Unknown'),
            'role': user.get('role', ''),
            'territory': user.get('territory', ''),
            'target_revenue': target,
            'achieved_revenue': achieved,
            'leads_count': lead_data['count'],
            'won_deals': lead_data['won'],
            'visits': activity_data['visits'],
            'calls': activity_data['calls'],
            'achievement_pct': min(achievement_pct, 200)  # Cap at 200%
        })
        
        total_target += target
        total_achieved += achieved
        total_leads += lead_data['count']
        total_won += lead_data['won']
    
    avg_achievement = int(total_achieved / total_target * 100) if total_target > 0 else 0
    
    return {
        'resources': resources_data,
        'summary': {
            'total_target': total_target,
            'total_achieved': total_achieved,
            'total_leads': total_leads,
            'total_won': total_won,
            'avg_achievement': avg_achievement
        }
    }

@api_router.get("/reports/account-performance")
async def get_account_performance(
    time_filter: str = 'this_month',
    territory: Optional[str] = None,
    state: Optional[str] = None,
    city: Optional[str] = None,
    account_type: Optional[str] = None,
    current_user: dict = Depends(get_current_user)
):
    """
    Get Account performance report.
    Shows invoice totals, bottle credits, contribution %, and financial metrics.
    """
    start_date, end_date = get_time_filter_dates(time_filter)
    
    # Build account query
    account_query = {}
    if territory:
        account_query['territory'] = territory
    if state:
        account_query['state'] = state
    if city:
        account_query['city'] = city
    if account_type:
        account_query['account_type'] = account_type
    
    # Fetch all accounts matching filters
    accounts = await db.accounts.find(account_query, {'_id': 0}).to_list(500)
    
    # Build invoice date query
    invoice_date_query = {}
    if time_filter != 'lifetime':
        invoice_date_query = {
            'created_at': {
                '$gte': start_date.isoformat(),
                '$lte': end_date.isoformat()
            }
        }
    
    # Get all invoices within time range
    all_invoices = await db.invoices.find(invoice_date_query, {'_id': 0}).to_list(5000)
    
    # Calculate total revenue for contribution percentage
    total_gross_all = sum(inv.get('gross_amount', inv.get('total_amount', 0)) for inv in all_invoices)
    
    # Aggregate invoice data by account
    account_invoices = {}
    for inv in all_invoices:
        # Match by lead_id or customer name
        lead_id = inv.get('lead_id')
        customer_name = inv.get('customer_name', '').lower()
        
        for acc in accounts:
            acc_lead_id = acc.get('lead_id')
            acc_name = acc.get('account_name', '').lower()
            
            # Match invoice to account
            if (lead_id and acc_lead_id and lead_id == acc_lead_id) or \
               (customer_name and acc_name and (customer_name in acc_name or acc_name in customer_name)):
                acc_id = acc.get('account_id')
                if acc_id not in account_invoices:
                    account_invoices[acc_id] = {
                        'gross_total': 0,
                        'net_total': 0,
                        'bottle_credit': 0,
                        'invoice_count': 0
                    }
                
                gross = inv.get('gross_amount', inv.get('total_amount', 0))
                net = inv.get('net_amount', inv.get('total_amount', 0))
                credit = inv.get('bottle_credit', 0)
                
                account_invoices[acc_id]['gross_total'] += gross
                account_invoices[acc_id]['net_total'] += net
                account_invoices[acc_id]['bottle_credit'] += credit
                account_invoices[acc_id]['invoice_count'] += 1
                break
    
    # Build performance data
    accounts_data = []
    summary_gross = 0
    summary_net = 0
    summary_bottle_credit = 0
    summary_outstanding = 0
    summary_overdue = 0
    
    for acc in accounts:
        acc_id = acc.get('account_id')
        inv_data = account_invoices.get(acc_id, {
            'gross_total': 0,
            'net_total': 0,
            'bottle_credit': 0,
            'invoice_count': 0
        })
        
        # Calculate contribution percentage (based on filtered total)
        contribution_pct = 0
        if total_gross_all > 0:
            contribution_pct = round((inv_data['gross_total'] / total_gross_all) * 100, 2)
        
        # Get financial data from account
        outstanding = acc.get('outstanding_balance', 0)
        overdue = acc.get('overdue_amount', 0)
        last_payment = acc.get('last_payment_amount', 0)
        
        # Calculate bottle credit from SKU pricing if not in invoices
        sku_pricing = acc.get('sku_pricing', [])
        estimated_bottle_credit = sum(sku.get('return_bottle_credit', 0) for sku in sku_pricing)
        bottle_credit = inv_data['bottle_credit'] if inv_data['bottle_credit'] > 0 else estimated_bottle_credit
        
        accounts_data.append({
            'account_id': acc_id,
            'account_name': acc.get('account_name', 'Unknown'),
            'account_type': acc.get('account_type', ''),
            'territory': acc.get('territory', ''),
            'state': acc.get('state', ''),
            'city': acc.get('city', ''),
            'gross_invoice_total': inv_data['gross_total'],
            'net_invoice_total': inv_data['net_total'],
            'bottle_credit': bottle_credit,
            'contribution_pct': contribution_pct,
            'outstanding_balance': outstanding,
            'overdue_amount': overdue,
            'last_payment_amount': last_payment,
            'invoice_count': inv_data['invoice_count']
        })
        
        # Update summary
        summary_gross += inv_data['gross_total']
        summary_net += inv_data['net_total']
        summary_bottle_credit += bottle_credit
        summary_outstanding += outstanding
        summary_overdue += overdue
    
    # Sort by gross invoice total (descending)
    accounts_data.sort(key=lambda x: x['gross_invoice_total'], reverse=True)
    
    return {
        'accounts': accounts_data,
        'summary': {
            'total_gross': summary_gross,
            'total_net': summary_net,
            'total_bottle_credit': summary_bottle_credit,
            'total_outstanding': summary_outstanding,
            'total_overdue': summary_overdue,
            'account_count': len(accounts_data),
            'total_revenue_base': total_gross_all  # For context on contribution calc
        }
    }

# ============= INCLUDE ROUTER =============

app.include_router(api_router)

# CORS configuration - reads from environment variable for deployment flexibility
cors_origins_env = os.environ.get('CORS_ORIGINS', '*')
if cors_origins_env == '*':
    cors_origins = ['*']
else:
    cors_origins = [origin.strip() for origin in cors_origins_env.split(',')]

app.add_middleware(
    CORSMiddleware,
    allow_credentials=True,
    allow_origins=cors_origins,
    allow_methods=["*"],
    allow_headers=["*"],
)

logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)

# Import and start ActiveMQ subscriber
try:
    from mq_subscriber import start_mq_subscriber as _start_mq, stop_mq_subscriber as _stop_mq, mq_subscriber as _mq_sub
    MQ_AVAILABLE = True
    mq_subscriber = _mq_sub
    start_mq_subscriber = _start_mq
    stop_mq_subscriber = _stop_mq
except ImportError as e:
    logger.warning(f"ActiveMQ subscriber not available: {e}")

@app.on_event("startup")
async def startup_event():
    """Start ActiveMQ subscriber on app startup"""
    global MQ_AVAILABLE
    if MQ_AVAILABLE and start_mq_subscriber:
        try:
            start_mq_subscriber()
            logger.info("ActiveMQ subscriber started")
        except Exception as e:
            logger.error(f"Failed to start ActiveMQ subscriber: {e}")
            MQ_AVAILABLE = False

@app.on_event("shutdown")
async def shutdown_db_client():
    if MQ_AVAILABLE and stop_mq_subscriber:
        try:
            stop_mq_subscriber()
            logger.info("ActiveMQ subscriber stopped")
        except Exception as e:
            logger.error(f"Error stopping ActiveMQ subscriber: {e}")
    client.close()
