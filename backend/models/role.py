"""
Role Model and Permissions
Custom role management for multi-tenant CRM
"""
from pydantic import BaseModel, Field
from typing import Optional, List, Dict
from datetime import datetime, timezone
import uuid


# Default module permissions structure
DEFAULT_MODULE_PERMISSIONS = {
    # Core Modules
    "home": {"view": True, "create": False, "edit": False, "delete": False},
    "dashboard": {"view": True, "create": False, "edit": False, "delete": False},
    "leads": {"view": True, "create": True, "edit": True, "delete": False},
    "pipeline": {"view": True, "create": False, "edit": True, "delete": False},
    "accounts": {"view": True, "create": True, "edit": True, "delete": False},
    "account_gop_metrics": {"view": True, "create": False, "edit": False, "delete": False},
    "neck_tag_designer": {"view": True, "create": True, "edit": True, "delete": False},
    "contacts": {"view": True, "create": True, "edit": True, "delete": False},
    "invoices": {"view": True, "create": True, "edit": True, "delete": False},
    "sales_portal": {"view": True, "create": False, "edit": False, "delete": False},

    # Reports
    "report_sales_overview": {"view": True, "create": False, "edit": False, "delete": False},
    "report_revenue": {"view": True, "create": False, "edit": False, "delete": False},
    "report_sku_performance": {"view": True, "create": False, "edit": False, "delete": False},
    "report_resource_performance": {"view": True, "create": False, "edit": False, "delete": False},
    "report_account_performance": {"view": True, "create": False, "edit": False, "delete": False},

    # Operations
    "lead_discovery": {"view": True, "create": True, "edit": False, "delete": False},
    "target_planning": {"view": True, "create": True, "edit": True, "delete": False},
    "performance_tracker": {"view": True, "create": False, "edit": False, "delete": False},
    "investor_dashboard": {"view": False, "create": False, "edit": False, "delete": False},
    "daily_status": {"view": True, "create": True, "edit": True, "delete": False},
    "meeting_minutes": {"view": True, "create": True, "edit": True, "delete": False},
    "personal_calendar": {"view": True, "create": True, "edit": True, "delete": True},
    "status_summary": {"view": True, "create": False, "edit": False, "delete": False},

    # Tools
    "cogs_calculator": {"view": True, "create": False, "edit": False, "delete": False},
    "transport_calculator": {"view": True, "create": False, "edit": False, "delete": False},
    "sku_management": {"view": False, "create": False, "edit": False, "delete": False},
    "bottle_preview": {"view": True, "create": False, "edit": False, "delete": False},
    "lead_scoring_model": {"view": False, "create": False, "edit": False, "delete": False},

    # Documents
    "company_documents": {"view": True, "create": True, "edit": True, "delete": False},
    "files_documents": {"view": True, "create": True, "edit": True, "delete": False},

    # Requests
    "leaves": {"view": True, "create": True, "edit": True, "delete": False},
    "travel_requests": {"view": True, "create": True, "edit": True, "delete": False},
    "budget_requests": {"view": True, "create": True, "edit": True, "delete": False},

    # Marketing
    "marketing_calendar": {"view": False, "create": False, "edit": False, "delete": False},
    "marketing_masters": {"view": False, "create": False, "edit": False, "delete": False},

    # Organization
    "company_profile": {"view": True, "create": False, "edit": False, "delete": False},
    "team": {"view": False, "create": False, "edit": False, "delete": False},
    "master_locations": {"view": False, "create": False, "edit": False, "delete": False},
    "lead_statuses": {"view": False, "create": False, "edit": False, "delete": False},
    "business_categories": {"view": False, "create": False, "edit": False, "delete": False},
    "contact_categories": {"view": False, "create": False, "edit": False, "delete": False},
    "expense_categories": {"view": False, "create": False, "edit": False, "delete": False},
    "cogs_components": {"view": False, "create": False, "edit": False, "delete": False},

    # Admin
    "tenant_settings": {"view": False, "create": False, "edit": False, "delete": False},
    "api_keys": {"view": False, "create": False, "edit": False, "delete": False},
    "sku_replace": {"view": False, "create": False, "edit": False, "delete": False},

    # Production Modules
    "production_dashboard": {"view": False, "create": False, "edit": False, "delete": False},
    "production_batches": {"view": False, "create": False, "edit": False, "delete": False},
    "qc_routes": {"view": False, "create": False, "edit": False, "delete": False},
    "qc_team": {"view": False, "create": False, "edit": False, "delete": False},
    "rejection_reasons": {"view": False, "create": False, "edit": False, "delete": False},
    "rejection_report": {"view": False, "create": False, "edit": False, "delete": False},
    "rejection_cost_config": {"view": False, "create": False, "edit": False, "delete": False},
    "packaging_types": {"view": False, "create": False, "edit": False, "delete": False},
    "maintenance": {"view": False, "create": False, "edit": False, "delete": False},
    "inventory": {"view": False, "create": False, "edit": False, "delete": False},
    "quality_control": {"view": False, "create": False, "edit": False, "delete": False},
    "assets": {"view": False, "create": False, "edit": False, "delete": False},
    "vendors": {"view": False, "create": False, "edit": False, "delete": False},

    # Distribution Modules
    "distributors": {"view": False, "create": False, "edit": False, "delete": False},
    "stock_dashboard": {"view": False, "create": False, "edit": False, "delete": False},
    "cost_cards": {"view": False, "create": False, "edit": False, "delete": False},
    "distributor_coverage": {"view": False, "create": False, "edit": False, "delete": False},
    "distributor_locations": {"view": False, "create": False, "edit": False, "delete": False},
    "distributor_margins": {"view": False, "create": False, "edit": False, "delete": False},
    "distributor_assignments": {"view": False, "create": False, "edit": False, "delete": False},
    "distributor_shipments": {"view": False, "create": False, "edit": False, "delete": False},
    "distributor_deliveries": {"view": False, "create": False, "edit": False, "delete": False},
    "distributor_stock": {"view": False, "create": False, "edit": False, "delete": False},

    # Task Management
    "task_management": {"view": True, "create": True, "edit": True, "delete": False},
    "task_milestones": {"view": True, "create": False, "edit": False, "delete": False},
    "task_labels": {"view": True, "create": False, "edit": False, "delete": False},
}

# Full access permissions (for Admin role)
FULL_ACCESS_PERMISSIONS = {
    key: {"view": True, "create": True, "edit": True, "delete": True}
    for key in DEFAULT_MODULE_PERMISSIONS.keys()
}

# Manager permissions
MANAGER_PERMISSIONS = {
    **DEFAULT_MODULE_PERMISSIONS,
    "team": {"view": True, "create": True, "edit": True, "delete": False},
    "sku_management": {"view": True, "create": True, "edit": True, "delete": False},
    "lead_scoring_model": {"view": True, "create": True, "edit": True, "delete": False},
    "master_locations": {"view": True, "create": True, "edit": True, "delete": False},
    "lead_statuses": {"view": True, "create": True, "edit": True, "delete": False},
    "business_categories": {"view": True, "create": True, "edit": True, "delete": False},
    "leads": {"view": True, "create": True, "edit": True, "delete": True},
    "accounts": {"view": True, "create": True, "edit": True, "delete": True},
}

# Viewer permissions (read-only)
VIEWER_PERMISSIONS = {
    key: {"view": True, "create": False, "edit": False, "delete": False}
    for key in DEFAULT_MODULE_PERMISSIONS.keys()
}
# Disable admin modules for viewer
VIEWER_PERMISSIONS["tenant_settings"] = {"view": False, "create": False, "edit": False, "delete": False}
VIEWER_PERMISSIONS["team"] = {"view": False, "create": False, "edit": False, "delete": False}


class ModulePermission(BaseModel):
    """Permission for a single module"""
    view: bool = False
    create: bool = False
    edit: bool = False
    delete: bool = False


class Role(BaseModel):
    """Role model with permissions"""
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    tenant_id: str
    name: str
    description: Optional[str] = None
    
    # Permissions - dict of module_key -> ModulePermission
    permissions: Dict[str, Dict[str, bool]] = Field(default_factory=lambda: DEFAULT_MODULE_PERMISSIONS.copy())
    
    # Role settings
    is_system_role: bool = False  # System roles cannot be deleted
    is_default: bool = False  # Default role for new users
    
    # Metadata
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    updated_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    created_by: Optional[str] = None
    
    class Config:
        json_encoders = {
            datetime: lambda v: v.isoformat()
        }


class RoleCreate(BaseModel):
    """Schema for creating a new role"""
    name: str
    description: Optional[str] = None
    permissions: Optional[Dict[str, Dict[str, bool]]] = None
    is_default: bool = False


class RoleUpdate(BaseModel):
    """Schema for updating a role"""
    name: Optional[str] = None
    description: Optional[str] = None
    permissions: Optional[Dict[str, Dict[str, bool]]] = None
    is_default: Optional[bool] = None


# Default system roles that are created for each tenant
def get_default_roles(tenant_id: str) -> List[dict]:
    """Get default system roles for a new tenant"""
    now = datetime.now(timezone.utc).isoformat()
    
    return [
        {
            "id": str(uuid.uuid4()),
            "tenant_id": tenant_id,
            "name": "Admin",
            "description": "Full access to all features and settings",
            "permissions": FULL_ACCESS_PERMISSIONS,
            "is_system_role": True,
            "is_default": False,
            "created_at": now,
            "updated_at": now
        },
        {
            "id": str(uuid.uuid4()),
            "tenant_id": tenant_id,
            "name": "Manager",
            "description": "Can manage team, leads, and most features",
            "permissions": MANAGER_PERMISSIONS,
            "is_system_role": True,
            "is_default": False,
            "created_at": now,
            "updated_at": now
        },
        {
            "id": str(uuid.uuid4()),
            "tenant_id": tenant_id,
            "name": "User",
            "description": "Standard user access to core features",
            "permissions": DEFAULT_MODULE_PERMISSIONS,
            "is_system_role": True,
            "is_default": True,  # Default role for new users
            "created_at": now,
            "updated_at": now
        },
        {
            "id": str(uuid.uuid4()),
            "tenant_id": tenant_id,
            "name": "Viewer",
            "description": "Read-only access to view data",
            "permissions": VIEWER_PERMISSIONS,
            "is_system_role": True,
            "is_default": False,
            "created_at": now,
            "updated_at": now
        }
    ]


# Module categories for UI grouping
MODULE_CATEGORIES = {
    "Core": ["home", "dashboard", "leads", "pipeline", "accounts", "account_gop_metrics", "neck_tag_designer", "contacts", "invoices", "sales_portal"],
    "Reports": ["report_sales_overview", "report_revenue", "report_sku_performance", "report_resource_performance", "report_account_performance"],
    "Operations": ["lead_discovery", "target_planning", "performance_tracker", "investor_dashboard", "daily_status", "meeting_minutes", "personal_calendar", "status_summary"],
    "Tools": ["cogs_calculator", "transport_calculator", "sku_management", "bottle_preview", "lead_scoring_model"],
    "Documents": ["company_documents", "files_documents"],
    "Requests": ["leaves", "travel_requests", "budget_requests"],
    "Marketing": ["marketing_calendar", "marketing_masters"],
    "Organization": ["company_profile", "team", "master_locations", "lead_statuses", "business_categories", "contact_categories", "expense_categories", "cogs_components"],
    "Admin": ["tenant_settings", "api_keys", "sku_replace"],
    "Distribution": ["distributors", "stock_dashboard", "cost_cards", "distributor_coverage", "distributor_locations", "distributor_margins", "distributor_assignments", "distributor_shipments", "distributor_deliveries", "distributor_stock"],
    "Production": ["production_dashboard", "production_batches", "qc_routes", "qc_team", "rejection_reasons", "rejection_report", "rejection_cost_config", "packaging_types", "maintenance", "inventory", "quality_control", "assets", "vendors"],
    "Task Management": ["task_management", "task_milestones", "task_labels"],
}

MODULE_LABELS = {
    "home": "Home",
    "dashboard": "Dashboard",
    "leads": "Leads",
    "pipeline": "Pipeline",
    "accounts": "Accounts",
    "account_gop_metrics": "Account GOP Metrics",
    "neck_tag_designer": "Neck Tag Designer",
    "contacts": "Contacts",
    "invoices": "Invoices",
    "sales_portal": "Sales Portal",
    "report_sales_overview": "Sales Overview",
    "report_revenue": "Revenue Report",
    "report_sku_performance": "SKU Performance",
    "report_resource_performance": "Resource Performance",
    "report_account_performance": "Account Performance",
    "lead_discovery": "Lead Discovery",
    "target_planning": "Target Planning",
    "performance_tracker": "Performance Tracker",
    "investor_dashboard": "Investor Dashboard",
    "daily_status": "Daily Status",
    "meeting_minutes": "Meeting Minutes",
    "personal_calendar": "My Calendar",
    "status_summary": "Status Summary",
    "cogs_calculator": "COGS Calculator",
    "transport_calculator": "Transport Calculator",
    "sku_management": "SKU Management",
    "bottle_preview": "Bottle Preview",
    "lead_scoring_model": "Lead Scoring Model",
    "company_documents": "Company Documents",
    "files_documents": "Files & Documents",
    "leaves": "Leaves",
    "travel_requests": "Travel Requests",
    "budget_requests": "Budget Requests",
    "marketing_calendar": "Content Calendar",
    "marketing_masters": "Marketing Masters",
    "company_profile": "Company Profile",
    "team": "Team Management",
    "master_locations": "Master Locations",
    "lead_statuses": "Lead Statuses",
    "business_categories": "Business Categories",
    "contact_categories": "Contact Categories",
    "expense_categories": "Expense Categories",
    "cogs_components": "COGS Components",
    "tenant_settings": "Tenant Settings",
    "api_keys": "API Keys",
    "sku_replace": "Replace SKU",
    "distributors": "Distributors",
    "stock_dashboard": "Stock Dashboard",
    "cost_cards": "Cost Cards",
    "distributor_coverage": "Operating Coverage",
    "distributor_locations": "Warehouse Locations",
    "distributor_margins": "Margin Matrix",
    "distributor_assignments": "Account Assignments",
    "distributor_shipments": "Primary Shipments",
    "distributor_deliveries": "Account Deliveries",
    "distributor_stock": "Stock Management",
    "production_dashboard": "Production Dashboard",
    "production_batches": "Production Batches",
    "qc_routes": "QC Routes",
    "qc_team": "QC Team",
    "rejection_reasons": "Rejection Reasons",
    "rejection_report": "Rejection Report",
    "rejection_cost_config": "Rejection Cost Config",
    "packaging_types": "Packaging Types",
    "maintenance": "Maintenance",
    "inventory": "Inventory",
    "quality_control": "Quality Control",
    "assets": "Assets",
    "vendors": "Vendors",
    "task_management": "Tasks",
    "task_milestones": "Milestones",
    "task_labels": "Labels",
}
