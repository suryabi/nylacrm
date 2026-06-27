"""
Accounting Master models — configurable masters for the Accounting module.
A single `accounting_masters` collection backs every master type. Expense
Category supports an arbitrary-depth hierarchy via `parent_id`; all other
types are single-level.
"""
from pydantic import BaseModel
from typing import Optional


# master_type -> config. `hierarchical` types support parent_id drill-down.
MASTER_TYPES = {
    "expense_type": {"label": "Expense Type", "hierarchical": False},
    "expense_category": {"label": "Expense Category", "hierarchical": True},
    "department": {"label": "Department", "hierarchical": False},
    "cost_center": {"label": "Cost Center", "hierarchical": False},
    "project_business_unit": {"label": "Project / Business Unit", "hierarchical": False},
    "payment_source": {"label": "Payment Source", "hierarchical": False},
    "vendor": {"label": "Vendor", "hierarchical": False},
    "employee": {"label": "Employee", "hierarchical": False},
    "city_location": {"label": "City / Location", "hierarchical": False},
    "budget_head": {"label": "Budget Head", "hierarchical": False},
    "approval_category": {"label": "Approval Category", "hierarchical": False},
}

HIERARCHICAL_TYPES = {k for k, v in MASTER_TYPES.items() if v["hierarchical"]}

# Seeded once per tenant on first access — still fully editable afterwards.
# Authoritative Expense Type list.
DEFAULT_EXPENSE_TYPES = [
    "COGS (Cost of Goods Sold)",
    "Operating Expense (OPEX)",
    "Capital Expense (CAPEX)",
    "Financial Expense",
    "Tax & Statutory",
    "Depreciation & Amortization",
    "Extraordinary / Exceptional Expense",
    "Intercompany Expense",
    "Prepaid Expense",
    "Accrued Expense",
]

# Old short auto-seeded defaults — cleaned up once when installing the
# authoritative list above (never touches user-created values).
LEGACY_EXPENSE_TYPES = ["OPEX", "COGS", "CAPEX", "Financial", "Tax"]

DEFAULT_PAYMENT_SOURCES = [
    "Petty Cash", "Cash", "Bank Transfer", "Cheque", "UPI",
    "Credit Card", "Debit Card", "Employee Reimbursement", "Vendor Credit",
    "Advance Payment", "Letter of Credit", "Journal Entry", "Internal Adjustment",
]

DEFAULT_PROJECT_BUSINESS_UNITS = [
    "24 Brand Premium Water", "Household AWG", "Commercial AWG", "Operations Cloud",
    "AI Initiatives", "Factory Expansion", "Hyderabad Operations", "Goa Expansion",
    "Mumbai Expansion", "Delhi Expansion", "Bangalore Expansion", "Export Business",
    "Corporate Operations", "Sustainability Initiatives",
]

DEFAULT_COST_CENTERS = [
    "Corporate Office", "Hyderabad Plant", "Hyderabad Warehouse", "Delhi Warehouse",
    "Mumbai Warehouse", "Goa Warehouse", "Bangalore Warehouse", "Factory Operations",
    "Production Line 1", "Production Line 2", "Laboratory", "Quality Lab",
    "Marketing Team", "Sales Team", "Customer Success", "Finance Team", "IT Team",
    "R&D Center", "Distribution Network",
]

# master_type -> list of default values seeded once per tenant on first access.
DEFAULT_SEEDS = {
    "expense_type": DEFAULT_EXPENSE_TYPES,
    "payment_source": DEFAULT_PAYMENT_SOURCES,
    "project_business_unit": DEFAULT_PROJECT_BUSINESS_UNITS,
    "cost_center": DEFAULT_COST_CENTERS,
}


class AccountingMasterCreate(BaseModel):
    name: str
    code: Optional[str] = None
    description: Optional[str] = None
    parent_id: Optional[str] = None  # expense_category only
    is_active: bool = True
    sort_order: int = 0
    # Vendor-specific (optional)
    gstin: Optional[str] = None
    email: Optional[str] = None
    phone: Optional[str] = None
    # Employee link (optional)
    linked_user_id: Optional[str] = None


class AccountingMasterUpdate(BaseModel):
    name: Optional[str] = None
    code: Optional[str] = None
    description: Optional[str] = None
    parent_id: Optional[str] = None
    is_active: Optional[bool] = None
    sort_order: Optional[int] = None
    gstin: Optional[str] = None
    email: Optional[str] = None
    phone: Optional[str] = None
    linked_user_id: Optional[str] = None
