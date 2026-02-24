"""Lead models"""
from pydantic import BaseModel, Field, ConfigDict, EmailStr
from typing import Optional, List
from datetime import datetime, timezone
import uuid

class LeadStatus(BaseModel):
    status: str  # 'new', 'contacted', 'qualified', 'proposal', 'closed_won', 'closed_lost'

class Lead(BaseModel):
    model_config = ConfigDict(extra="allow")
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    lead_id: Optional[str] = None
    
    # Company & Contact
    company: str
    contact_person: Optional[str] = None
    name: Optional[str] = None
    email: Optional[EmailStr] = None
    phone: Optional[str] = None
    
    # Lead Category
    category: Optional[str] = None
    tier: Optional[str] = None
    
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
    interested_skus: Optional[List[str]] = []
    proposed_sku_pricing: Optional[List[dict]] = []
    notes: Optional[str] = None
    
    # Follow-up tracking
    next_followup_date: Optional[str] = None
    
    # System fields
    estimated_value: Optional[float] = None
    created_by: str
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    updated_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    
    # Computed fields
    last_contacted_date: Optional[str] = None
    last_contact_method: Optional[str] = None
    
    # Invoice fields
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
    proposed_sku_pricing: Optional[List[dict]] = None
    notes: Optional[str] = None
    estimated_value: Optional[float] = None
    next_followup_date: Optional[str] = None
    converted_to_account: Optional[bool] = False
    account_id: Optional[str] = None

class PaginatedLeadsResponse(BaseModel):
    """Paginated response for leads list"""
    data: List[Lead]
    total: int
    page: int
    page_size: int
    total_pages: int
