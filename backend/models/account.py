"""Account models"""
from pydantic import BaseModel, Field, ConfigDict
from typing import Optional, List
from datetime import datetime, timezone
import uuid

class AccountSKUPricing(BaseModel):
    """SKU pricing and bottle credit for an account"""
    sku: str
    price_per_unit: float = 0.0
    return_bottle_credit: float = 0.0

class DeliveryAddress(BaseModel):
    """Delivery address for an account"""
    address_line1: Optional[str] = None
    address_line2: Optional[str] = None
    city: Optional[str] = None
    state: Optional[str] = None
    pincode: Optional[str] = None
    landmark: Optional[str] = None

class Account(BaseModel):
    model_config = ConfigDict(extra="allow")
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    account_id: str
    lead_id: str
    
    # Account Info
    account_name: str
    account_type: Optional[str] = None
    
    # Contact Info
    contact_name: Optional[str] = None
    contact_number: Optional[str] = None
    
    # Location
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
    gst_number: Optional[str] = None
    sku_pricing: Optional[List[AccountSKUPricing]] = None
    delivery_address: Optional[DeliveryAddress] = None

class PaginatedAccountsResponse(BaseModel):
    """Paginated response for accounts list"""
    data: List[Account]
    total: int
    page: int
    page_size: int
    total_pages: int
