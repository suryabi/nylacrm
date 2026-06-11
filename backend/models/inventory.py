"""
Inventory Management Models
Phase 1: Item Master, Vendor Master, Vendor-Item Pricing (time-bounded).
Convention: UUID string `id`, tenant-scoped via `tenant_id`, stored via model_dump(),
read with {"_id": 0} projection (consistent with the rest of the codebase).
"""
from pydantic import BaseModel, Field
from typing import Optional
from datetime import datetime, timezone
import uuid


# Master option lists (returned by /inventory/meta)
ITEM_CATEGORIES = [
    "Raw Material",
    "Packaging Material",
    "Labels",
    "Caps",
    "Bottles",
    "Neck Tags",
    "Customer Branding Material",
]

UNITS_OF_MEASURE = ["Nos", "Kg", "Litres", "Rolls", "Boxes", "Crates"]

# Indian GSTIN format: 2 digits state code, 5 letters PAN, 4 digits, 1 letter,
# 1 alnum entity, 'Z', 1 alnum checksum.
GSTIN_REGEX = r"^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z]{1}[1-9A-Z]{1}Z[0-9A-Z]{1}$"


def _now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


# ───────────────────────── Item Master ─────────────────────────
class InventoryItem(BaseModel):
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    tenant_id: str
    item_name: str
    item_code: str
    category: str
    description: Optional[str] = None
    unit_of_measure: str
    min_stock_level: float = 0
    reorder_level: float = 0
    opening_stock: float = 0
    current_stock: float = 0
    is_active: bool = True
    # Customer-specific linkage (to a Lead or an Account)
    is_customer_specific: bool = False
    customer_type: Optional[str] = None  # 'lead' | 'account'
    customer_id: Optional[str] = None
    customer_name: Optional[str] = None
    created_at: str = Field(default_factory=_now_iso)
    updated_at: str = Field(default_factory=_now_iso)
    created_by: Optional[str] = None


class InventoryItemCreate(BaseModel):
    item_name: str
    item_code: str
    category: str
    description: Optional[str] = None
    unit_of_measure: str
    min_stock_level: float = 0
    reorder_level: float = 0
    opening_stock: float = 0
    is_active: bool = True
    is_customer_specific: bool = False
    customer_type: Optional[str] = None
    customer_id: Optional[str] = None
    customer_name: Optional[str] = None


class InventoryItemUpdate(BaseModel):
    item_name: Optional[str] = None
    item_code: Optional[str] = None
    category: Optional[str] = None
    description: Optional[str] = None
    unit_of_measure: Optional[str] = None
    min_stock_level: Optional[float] = None
    reorder_level: Optional[float] = None
    is_active: Optional[bool] = None
    is_customer_specific: Optional[bool] = None
    customer_type: Optional[str] = None
    customer_id: Optional[str] = None
    customer_name: Optional[str] = None


# ───────────────────────── Vendor Master ─────────────────────────
class InventoryVendor(BaseModel):
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    tenant_id: str
    vendor_name: str
    contact_person: Optional[str] = None
    phone: Optional[str] = None
    email: Optional[str] = None
    address: Optional[str] = None
    gstin: Optional[str] = None
    payment_terms: Optional[str] = None
    lead_time_days: Optional[int] = None
    is_active: bool = True
    created_at: str = Field(default_factory=_now_iso)
    updated_at: str = Field(default_factory=_now_iso)
    created_by: Optional[str] = None


class InventoryVendorCreate(BaseModel):
    vendor_name: str
    contact_person: Optional[str] = None
    phone: Optional[str] = None
    email: Optional[str] = None
    address: Optional[str] = None
    gstin: Optional[str] = None
    payment_terms: Optional[str] = None
    lead_time_days: Optional[int] = None
    is_active: bool = True


class InventoryVendorUpdate(BaseModel):
    vendor_name: Optional[str] = None
    contact_person: Optional[str] = None
    phone: Optional[str] = None
    email: Optional[str] = None
    address: Optional[str] = None
    gstin: Optional[str] = None
    payment_terms: Optional[str] = None
    lead_time_days: Optional[int] = None
    is_active: Optional[bool] = None


# ─────────────────── Vendor-Item Mapping / Pricing ───────────────────
class VendorItemPrice(BaseModel):
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    tenant_id: str
    item_id: str
    item_name: Optional[str] = None
    vendor_id: str
    vendor_name: Optional[str] = None
    unit_of_measure: Optional[str] = None
    standard_lead_time_days: Optional[int] = None
    min_order_qty: float = 0
    price: float = 0
    price_active_from: str            # ISO date YYYY-MM-DD
    price_active_to: Optional[str] = None   # open-ended when None
    tax_percentage: float = 0
    remarks: Optional[str] = None
    is_active: bool = True
    created_at: str = Field(default_factory=_now_iso)
    updated_at: str = Field(default_factory=_now_iso)
    created_by: Optional[str] = None


class VendorItemPriceCreate(BaseModel):
    item_id: str
    vendor_id: str
    unit_of_measure: Optional[str] = None
    standard_lead_time_days: Optional[int] = None
    min_order_qty: float = 0
    price: float = 0
    price_active_from: str
    price_active_to: Optional[str] = None
    tax_percentage: float = 0
    remarks: Optional[str] = None
    is_active: bool = True


class VendorItemPriceUpdate(BaseModel):
    unit_of_measure: Optional[str] = None
    standard_lead_time_days: Optional[int] = None
    min_order_qty: Optional[float] = None
    price: Optional[float] = None
    price_active_from: Optional[str] = None
    price_active_to: Optional[str] = None
    tax_percentage: Optional[float] = None
    remarks: Optional[str] = None
    is_active: Optional[bool] = None
