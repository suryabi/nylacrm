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
DEFAULT_EXPENSE_TYPES = ["OPEX", "COGS", "CAPEX", "Financial", "Tax"]


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
