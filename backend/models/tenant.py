"""
Tenant Model and Configuration
Multi-tenant support for the Sales CRM
"""
from pydantic import BaseModel, Field, field_validator
from typing import Optional, List, Dict, Any
from datetime import datetime, timezone
import uuid
import re


class TenantBranding(BaseModel):
    """Branding configuration for a tenant"""
    logo_url: Optional[str] = None
    favicon_url: Optional[str] = None
    primary_color: str = "#000000"  # Black (default)
    accent_color: str = "#ffffff"   # White (default)
    secondary_color: str = "#374151"  # Gray-700 for subtle elements
    app_name: str = "Sales CRM"
    tagline: Optional[str] = None


class GoogleWorkspaceConfig(BaseModel):
    """Google Workspace SSO configuration per tenant"""
    enabled: bool = False
    allowed_domain: Optional[str] = None  # e.g., "acme.com" - only emails from this domain can login
    client_id: Optional[str] = None  # Tenant's own Google OAuth client ID (optional)
    client_secret: Optional[str] = None  # Tenant's own Google OAuth client secret (optional)
    # If client_id/secret not provided, use platform's shared credentials
    
    @field_validator('allowed_domain')
    @classmethod
    def validate_domain(cls, v):
        if v:
            # Remove @ if present and validate format
            v = v.lstrip('@').lower().strip()
            if not re.match(r'^[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)+$', v):
                raise ValueError('Invalid domain format')
        return v


class TenantAuthConfig(BaseModel):
    """Authentication configuration for a tenant"""
    allow_password_login: bool = True  # Allow regular email/password login
    allow_user_registration: bool = False  # Allow users to self-register (admin creates users by default)
    google_workspace: GoogleWorkspaceConfig = Field(default_factory=GoogleWorkspaceConfig)
    # Future: SAML, Okta, Azure AD configs can be added here


class TenantModules(BaseModel):
    """Module configuration for a tenant - controls which features are enabled"""
    
    # === CORE MODULES ===
    home: bool = True
    dashboard: bool = True
    leads: bool = True
    pipeline: bool = True
    accounts: bool = True
    sales_portal: bool = True
    contacts: bool = True
    
    # === DASHBOARD REPORTS ===
    report_sales_overview: bool = True
    report_revenue: bool = True
    report_sku_performance: bool = True
    report_resource_performance: bool = True
    report_account_performance: bool = True
    
    # === LEAD & SALES OPERATIONS ===
    lead_discovery: bool = True
    target_planning: bool = True
    daily_status: bool = True
    status_summary: bool = True
    
    # === PRICING & LOGISTICS ===
    cogs_calculator: bool = True
    transport_calculator: bool = True
    
    # === PRODUCT & SKU ===
    sku_management: bool = True
    bottle_preview: bool = True
    
    # === DOCUMENTS ===
    company_documents: bool = True
    files_documents: bool = True
    
    # === REQUESTS ===
    leaves: bool = True
    travel_requests: bool = True
    budget_requests: bool = True
    expense_management: bool = True
    
    # === MEETINGS & TASKS ===
    meetings: bool = True
    tasks: bool = True
    
    # === ORGANIZATION & MASTER DATA ===
    company_profile: bool = True
    team: bool = True
    master_locations: bool = True
    lead_statuses: bool = True
    business_categories: bool = True
    contact_categories: bool = True
    expense_categories: bool = True
    
    # === PRODUCTION MODULES (Beta) ===
    maintenance: bool = False
    inventory: bool = False
    quality_control: bool = False
    assets: bool = False
    vendors: bool = False


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


# ============= INDUSTRY PROFILE SYSTEM =============

# Supported industry types
INDUSTRY_TYPES = {
    "water_brand": {
        "name": "Water/Beverage Brand",
        "description": "Water brands, beverage companies with bottle/SKU tracking",
        "features": [
            "lead_bottle_tracking",
            "bottle_preview", 
            "cogs_calculator",
            "sku_management",
            "sku_performance",
            "account_bottle_volume"
        ]
    },
    "generic": {
        "name": "Generic CRM",
        "description": "Standard CRM features for any business",
        "features": []  # No industry-specific features
    }
}


class IndustryConfig(BaseModel):
    """Industry-specific configuration"""
    # Water Brand specific
    bottle_sizes: List[str] = ["330ml", "660ml", "1L"]
    track_bottle_volume: bool = True
    default_bottles_per_cover: int = 2  # For volume estimation
    
    # Add more industry-specific configs as needed
    custom_fields: Dict[str, Any] = {}  # Flexible custom fields


class TenantIndustry(BaseModel):
    """Tenant industry profile"""
    industry_type: str = "generic"  # Key from INDUSTRY_TYPES
    industry_config: IndustryConfig = Field(default_factory=IndustryConfig)
    
    @field_validator('industry_type')
    @classmethod
    def validate_industry_type(cls, v):
        if v not in INDUSTRY_TYPES:
            raise ValueError(f'Invalid industry type. Must be one of: {list(INDUSTRY_TYPES.keys())}')
        return v


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
    
    # Industry Profile (NEW)
    industry: TenantIndustry = Field(default_factory=TenantIndustry)
    
    # Status
    is_active: bool = True
    is_trial: bool = True  # New tenants start with trial
    trial_ends_at: Optional[str] = None
    subscription_plan: str = "trial"  # trial, starter, professional, enterprise
    
    # Registration Info
    registered_email: Optional[str] = None  # Email used during registration
    email_verified: bool = False
    verification_token: Optional[str] = None
    verification_expires_at: Optional[str] = None
    
    # Configuration
    branding: TenantBranding = Field(default_factory=TenantBranding)
    modules: TenantModules = Field(default_factory=TenantModules)
    integrations: TenantIntegrations = Field(default_factory=TenantIntegrations)
    settings: TenantSettings = Field(default_factory=TenantSettings)
    auth_config: TenantAuthConfig = Field(default_factory=TenantAuthConfig)
    
    # Company Profile
    company_profile: CompanyProfile = Field(default_factory=CompanyProfile)
    
    # Admin
    owner_id: Optional[str] = None  # Primary admin user ID
    
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
    industry: Optional[TenantIndustry] = None  # NEW - Industry profile
    branding: Optional[TenantBranding] = None
    modules: Optional[TenantModules] = None
    integrations: Optional[TenantIntegrations] = None
    settings: Optional[TenantSettings] = None
    auth_config: Optional[TenantAuthConfig] = None


class TenantRegistration(BaseModel):
    """Schema for self-service tenant registration"""
    # Company Info
    company_name: str = Field(..., min_length=2, max_length=100)
    subdomain: str = Field(..., min_length=3, max_length=50)  # Will become tenant_id
    
    # Admin User Info
    admin_name: str = Field(..., min_length=2, max_length=100)
    admin_email: str = Field(..., pattern=r'^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$')
    admin_password: str = Field(..., min_length=8)
    
    @field_validator('subdomain')
    @classmethod
    def validate_subdomain(cls, v):
        v = v.lower().strip()
        if not re.match(r'^[a-z][a-z0-9-]*[a-z0-9]$', v) and len(v) > 2:
            raise ValueError('Subdomain must start with a letter, contain only lowercase letters, numbers, and hyphens')
        # Reserved subdomains
        reserved = ['www', 'api', 'admin', 'app', 'mail', 'ftp', 'localhost', 'test', 'demo', 'staging', 'production']
        if v in reserved:
            raise ValueError(f'Subdomain "{v}" is reserved')
        return v


class TenantPublicInfo(BaseModel):
    """Public tenant info returned for login page"""
    tenant_id: str
    name: str
    branding: TenantBranding
    auth_config_public: dict  # Only safe fields: allow_password_login, google_workspace.enabled, google_workspace.allowed_domain


# Default tenant configuration
DEFAULT_TENANT = Tenant(
    id="default-tenant-001",
    tenant_id="nyla-air-water",
    name="Nyla Air Water",
    industry=TenantIndustry(
        industry_type="water_brand",
        industry_config=IndustryConfig(
            bottle_sizes=["330ml", "660ml", "1L"],
            track_bottle_volume=True,
            default_bottles_per_cover=2
        )
    ),
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
