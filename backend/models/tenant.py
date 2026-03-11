"""
Tenant Model and Configuration
Multi-tenant support for the Sales CRM
"""
from pydantic import BaseModel, Field
from typing import Optional, List, Dict, Any
from datetime import datetime, timezone
import uuid


class TenantBranding(BaseModel):
    """Branding configuration for a tenant"""
    logo_url: Optional[str] = None
    favicon_url: Optional[str] = None
    primary_color: str = "#000000"  # Black (default)
    accent_color: str = "#ffffff"   # White (default)
    secondary_color: str = "#374151"  # Gray-700 for subtle elements
    app_name: str = "Sales CRM"
    tagline: Optional[str] = None


class TenantModules(BaseModel):
    """Module enable/disable configuration"""
    leads: bool = True
    accounts: bool = True
    pipeline: bool = True
    target_planning: bool = True
    daily_status: bool = True
    contacts: bool = True
    expense_management: bool = True
    travel_requests: bool = True
    budget_requests: bool = True
    meetings: bool = True
    tasks: bool = True
    files_documents: bool = True
    inventory: bool = False
    quality_control: bool = False
    maintenance: bool = False
    assets: bool = False


class TenantIntegrations(BaseModel):
    """Integration settings per tenant"""
    email_enabled: bool = True
    calendar_enabled: bool = True
    activemq_enabled: bool = False
    activemq_queue: Optional[str] = None
    zoom_enabled: bool = False
    google_maps_enabled: bool = True


class TenantSettings(BaseModel):
    """General settings for a tenant"""
    timezone: str = "Asia/Kolkata"
    currency: str = "INR"
    currency_symbol: str = "₹"
    date_format: str = "DD/MM/YYYY"
    fiscal_year_start: str = "04-01"  # April 1st


class CompanyAddress(BaseModel):
    """Company address details"""
    building_name: Optional[str] = None
    floor: Optional[str] = None
    unit_flat_no: Optional[str] = None
    building_plot_no: Optional[str] = None
    landmark: Optional[str] = None
    road_street: Optional[str] = None
    locality: Optional[str] = None
    city: Optional[str] = None
    district: Optional[str] = None
    state: Optional[str] = None
    pin_code: Optional[str] = None
    google_maps_url: Optional[str] = None


class BankDetails(BaseModel):
    """Company bank account details"""
    account_name: Optional[str] = None
    account_number: Optional[str] = None
    ifsc_code: Optional[str] = None
    bank_name: Optional[str] = None
    branch: Optional[str] = None
    terminal_id: Optional[str] = None
    payment_qr_url: Optional[str] = None


class Director(BaseModel):
    """Company director/key personnel"""
    name: str
    designation: str = "Director"
    resident_state: Optional[str] = None
    email: Optional[str] = None
    phone: Optional[str] = None


class OfficeContact(BaseModel):
    """Office contact person"""
    name: Optional[str] = None
    phone: Optional[str] = None
    email: Optional[str] = None
    purpose: Optional[str] = "For Couriers / Parcels or directions"


class CompanyProfile(BaseModel):
    """Complete company profile information"""
    # Business Identity
    legal_name: Optional[str] = None
    trade_name: Optional[str] = None
    brand_name: Optional[str] = None
    constitution: Optional[str] = "Private Limited Company"
    
    # GST Details
    gstin: Optional[str] = None
    registration_type: Optional[str] = "Regular"
    gst_act: Optional[str] = "Goods and Services Tax Act, 2017"
    registration_approval_date: Optional[str] = None
    validity_from: Optional[str] = None
    certificate_issue_date: Optional[str] = None
    
    # MSME Details
    msme_registration_number: Optional[str] = None
    
    # Contact Information
    company_email: Optional[str] = None
    company_phone: Optional[str] = None
    company_website: Optional[str] = None
    
    # Address
    principal_address: CompanyAddress = Field(default_factory=CompanyAddress)
    
    # Bank Details
    bank_details: BankDetails = Field(default_factory=BankDetails)
    
    # Office Contact
    office_contact: OfficeContact = Field(default_factory=OfficeContact)
    
    # Directors / Key Personnel
    directors: List[Director] = Field(default_factory=list)
    

class Tenant(BaseModel):
    """Main Tenant model"""
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    tenant_id: str  # URL-friendly identifier (subdomain)
    name: str  # Display name
    domain: Optional[str] = None  # Custom domain if any
    
    # Status
    is_active: bool = True
    is_trial: bool = False
    trial_ends_at: Optional[str] = None
    
    # Configuration
    branding: TenantBranding = Field(default_factory=TenantBranding)
    modules: TenantModules = Field(default_factory=TenantModules)
    integrations: TenantIntegrations = Field(default_factory=TenantIntegrations)
    settings: TenantSettings = Field(default_factory=TenantSettings)
    
    # Company Profile
    company_profile: CompanyProfile = Field(default_factory=CompanyProfile)
    
    # Admin
    owner_id: Optional[str] = None  # Primary admin user
    
    # Metadata
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    updated_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    
    class Config:
        json_encoders = {
            datetime: lambda v: v.isoformat()
        }


class TenantCreate(BaseModel):
    """Schema for creating a new tenant"""
    tenant_id: str  # URL-friendly identifier
    name: str
    domain: Optional[str] = None
    owner_email: Optional[str] = None
    branding: Optional[TenantBranding] = None
    modules: Optional[TenantModules] = None


class TenantUpdate(BaseModel):
    """Schema for updating a tenant"""
    name: Optional[str] = None
    domain: Optional[str] = None
    is_active: Optional[bool] = None
    branding: Optional[TenantBranding] = None
    modules: Optional[TenantModules] = None
    integrations: Optional[TenantIntegrations] = None
    settings: Optional[TenantSettings] = None


# Default tenant configuration
DEFAULT_TENANT = Tenant(
    id="default-tenant-001",
    tenant_id="nyla-air-water",
    name="Nyla Air Water",
    branding=TenantBranding(
        app_name="Nyla Sales CRM",
        tagline="Sales CRM",
        primary_color="#000000",  # Black
        accent_color="#ffffff",   # White
        secondary_color="#374151" # Gray
    ),
    modules=TenantModules(
        leads=True,
        accounts=True,
        pipeline=True,
        target_planning=True,
        daily_status=True,
        contacts=True,
        expense_management=True,
        travel_requests=True,
        budget_requests=True,
        meetings=True,
        tasks=True,
        files_documents=True,
        inventory=False,
        quality_control=False,
        maintenance=False,
        assets=False
    ),
    integrations=TenantIntegrations(
        email_enabled=True,
        calendar_enabled=True,
        activemq_enabled=True,
        activemq_queue="/queue/order-invoice",
        zoom_enabled=True,
        google_maps_enabled=True
    )
)
