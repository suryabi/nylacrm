"""
Accounting Master models — configurable masters for the Accounting module.
A single `accounting_masters` collection backs every master type. Expense
Category supports an arbitrary-depth hierarchy via `parent_id`; all other
types are single-level.
"""
from pydantic import BaseModel
from typing import Optional


# master_type -> config. `hierarchical` types support parent_id drill-down.
# `group` separates Expense vs Income masters (same architecture, same collection).
MASTER_TYPES = {
    "expense_type": {"label": "Expense Type", "hierarchical": False, "group": "expense"},
    "expense_category": {"label": "Expense Category", "hierarchical": True, "group": "expense"},
    "department": {"label": "Department", "hierarchical": False, "group": "expense"},
    "cost_center": {"label": "Cost Center", "hierarchical": False, "group": "expense"},
    "project_business_unit": {"label": "Project / Business Unit", "hierarchical": False, "group": "expense"},
    "payment_source": {"label": "Payment Source", "hierarchical": False, "group": "expense"},
    "budget_head": {"label": "Budget Head", "hierarchical": False, "group": "expense"},
    "approval_category": {"label": "Approval Category", "hierarchical": False, "group": "expense"},
    "income_category": {"label": "Income Category", "hierarchical": True, "group": "income"},
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

# Hierarchical Expense Category seed: top category -> { sub-category -> [items] }.
# Seeded once per tenant (gated on the canonical root being absent).
EXPENSE_CATEGORY_TREE = {
    "Production & Manufacturing": {
        "Raw Materials": ["Glass Bottles", "Caps", "Neck Tags", "Labels", "Cartons", "Crates", "Shrink Wrap", "Minerals", "Chemicals"],
        "Packaging Materials": [], "Consumables": [],
        "Utilities": ["Electricity", "Water", "Diesel", "Generator Fuel"],
        "Factory Maintenance": [], "Quality Control": [], "Production Labour": [], "Production Overheads": [],
    },
    "Sales": {
        "Customer Acquisition": [], "Sales Commission": [], "Customer Entertainment": [], "Samples": [],
        "Sales Promotions": [], "Dealer Incentives": [], "Trade Schemes": [],
    },
    "Marketing": {
        "Digital Marketing": ["Google Ads", "Meta Ads", "LinkedIn Ads", "SEO", "Email Marketing", "Influencer Marketing"],
        "Branding": [], "Events": [], "Sponsorships": [], "Photography": [], "Video Production": [],
        "Public Relations": [], "Printing": [], "Merchandise": [],
    },
    "Logistics": {
        "Freight": [], "Transportation": [], "Fuel": [], "Warehousing": [], "Courier": [],
        "Loading & Unloading": [], "Reverse Logistics": [],
        "Local Transport": [], "Interstate Freight": [], "Cold Chain": [], "Last Mile Delivery": [],
    },
    "HR": {
        "Salaries": ["Monthly Salary", "Bonus", "Incentives", "PF", "ESI", "Gratuity"],
        "Recruitment": [], "Training": [], "Employee Welfare": [], "Uniforms": [], "Insurance": [],
    },
    "Administration": {
        "Office Expenses": [], "Housekeeping": [], "Pantry": [], "Security": [],
        "Repairs": ["Machinery Repair", "Vehicle Repair", "Building Maintenance", "Computer Repair"],
        "Rent": [], "Electricity": [], "Internet": [],
    },
    "IT": {
        "Cloud Services": [], "AI Services": [],
        "Software Licenses": ["Zoho", "Microsoft 365", "Google Workspace", "OpenAI", "Emergent", "AWS", "Azure", "Oracle", "GitHub", "Slack", "Canva"],
        "Hardware": [], "Mobile Bills": [], "Website": [], "Domains": [], "Cyber Security": [],
    },
    "Finance": {
        "Audit": [], "Accounting": [], "Legal": [], "Bank Charges": [], "Interest": [], "Consultancy": [],
    },
    "Travel": {
        "Flights": [], "Hotels": [], "Taxi": [], "Local Travel": [], "Fuel": [], "Meals": [],
        "Airfare": [], "Hotel Stay": [], "Toll Charges": [], "Food": [],
    },
    "Capital Assets": {
        "Machinery": [], "Vehicles": [], "Furniture": [], "Computers": [],
        "Factory Equipment": [], "Laboratory Equipment": [], "Office Equipment": [],
    },
    "Taxes": {
        "GST": [], "Customs Duty": [], "Import Duty": [], "TDS": [], "Professional Tax": [], "Stamp Duty": [],
    },
}


# Hierarchical Income Category seed: top category -> { sub-category -> [items] }.
# Five authoritative roots requested by the business; seeded once per tenant.
INCOME_CATEGORY_TREE = {
    "Operating Income": {
        "Product Sales": ["Bottled Water Sales", "AWG Unit Sales", "Accessories & Spares"],
        "Service Income": ["Installation Charges", "Maintenance Contracts", "AMC Income"],
        "Subscription Revenue": [],
        "Distribution Income": ["Distributor Margins", "Franchise Fees"],
    },
    "Non-Operating Income": {
        "Rental Income": [], "Scrap Sales": [], "Commission Received": [], "Miscellaneous Income": [],
    },
    "Financial Receipts": {
        "Interest Income": ["Bank Interest", "Loan Interest"],
        "Dividend Income": [], "Forex Gains": [],
    },
    "Investing Receipts": {
        "Asset Sale Proceeds": [], "Investment Maturity": [], "Capital Gains": [],
    },
    "Other Income": {
        "Grants & Subsidies": [], "Refunds & Reimbursements": [], "Insurance Claims": [], "Liabilities Written Back": [],
    },
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
