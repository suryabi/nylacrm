"""
Customer Returns Model
Track customer returns to distributors with credit calculation
"""
from pydantic import BaseModel, Field
from typing import Optional, List
from datetime import datetime, timezone
import uuid


class CustomerReturnItem(BaseModel):
    """Individual item in a customer return"""
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    sku_id: str
    sku_code: Optional[str] = None
    sku_name: Optional[str] = None
    hsn_code: Optional[str] = None
    
    # Quantity returned
    quantity: int = 0
    
    # Return reason
    reason_id: str
    reason_code: Optional[str] = None
    reason_name: Optional[str] = None
    reason_category: Optional[str] = None  # empty_reusable, expired, damaged, promotional
    
    # Pricing for credit calculation
    unit_price: float = 0  # Original selling price
    base_price: float = 0  # Base/transfer price from SKU
    return_credit_per_unit: float = 0  # From account SKU pricing (for empty returns)
    
    # Credit calculation
    credit_type: str = "sku_return_credit"  # sku_return_credit, full_price, percentage, no_credit
    credit_percentage: Optional[float] = None  # If credit_type is percentage
    credit_per_unit: float = 0  # Calculated credit per unit
    total_credit: float = 0  # quantity × credit_per_unit
    
    # Factory return tracking
    return_to_factory: bool = True
    returned_to_factory: bool = False
    factory_return_date: Optional[str] = None
    
    # Inspection
    requires_inspection: bool = False
    inspection_status: Optional[str] = None  # pending, passed, failed
    inspection_notes: Optional[str] = None
    inspected_by: Optional[str] = None
    inspected_at: Optional[str] = None


class CustomerReturn(BaseModel):
    """Customer return record"""
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    tenant_id: str
    distributor_id: str
    
    # Return identification
    return_number: str  # Auto-generated: RET-2026-0001
    
    # Customer/Account
    account_id: str
    account_name: Optional[str] = None
    account_city: Optional[str] = None
    
    # Return details
    return_date: str  # ISO date string
    received_by: Optional[str] = None  # User who received the return
    
    # Items
    items: List[CustomerReturnItem] = Field(default_factory=list)
    
    # Totals
    total_quantity: int = 0
    total_credit: float = 0
    
    # Status
    status: str = "draft"  # draft, confirmed, processed, settled, cancelled
    
    # Settlement linking
    settlement_id: Optional[str] = None
    settled_at: Optional[str] = None
    
    # Factory return summary
    factory_return_pending: int = 0  # Items pending factory return
    factory_return_completed: int = 0  # Items returned to factory
    
    # Notes
    notes: Optional[str] = None
    
    # Metadata
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    updated_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    created_by: Optional[str] = None
    
    class Config:
        json_encoders = {
            datetime: lambda v: v.isoformat()
        }


class CustomerReturnItemCreate(BaseModel):
    """Schema for creating a return item"""
    sku_id: str
    quantity: int
    reason_id: str
    unit_price: Optional[float] = None  # Can be auto-fetched from account pricing
    notes: Optional[str] = None


class CustomerReturnCreate(BaseModel):
    """Schema for creating a customer return"""
    account_id: str
    return_date: Optional[str] = None  # Defaults to today
    items: List[CustomerReturnItemCreate] = Field(default_factory=list)
    notes: Optional[str] = None


class CustomerReturnUpdate(BaseModel):
    """Schema for updating a customer return"""
    return_date: Optional[str] = None
    items: Optional[List[CustomerReturnItemCreate]] = None
    notes: Optional[str] = None
    status: Optional[str] = None


class FactoryReturnUpdate(BaseModel):
    """Schema for updating factory return status"""
    item_ids: List[str]  # List of item IDs to mark as returned
    return_date: Optional[str] = None
    notes: Optional[str] = None
