"""
Credit Note Model
Auto-generated when customer returns are approved
"""
from pydantic import BaseModel, Field
from typing import Optional, List
from datetime import datetime, timezone
import uuid


class CreditNoteApplication(BaseModel):
    """Record of credit note application to a delivery/invoice"""
    delivery_id: str
    delivery_number: Optional[str] = None
    amount_applied: float = 0
    applied_at: str  # ISO datetime
    applied_by: Optional[str] = None


class CreditNote(BaseModel):
    """Credit note generated from approved customer returns"""
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    tenant_id: str
    distributor_id: str
    
    # Credit note identification
    credit_note_number: str  # Auto-generated: CN-2026-0001
    
    # Link to return
    return_id: str
    return_number: Optional[str] = None
    
    # Customer/Account
    account_id: str
    account_name: Optional[str] = None
    
    # Amounts
    original_amount: float = 0  # Total credit from return
    applied_amount: float = 0  # Amount already applied to deliveries
    balance_amount: float = 0  # Remaining amount = original - applied
    
    # Status
    status: str = "pending"  # pending, partially_applied, fully_applied, cancelled
    
    # Application history
    applications: List[CreditNoteApplication] = Field(default_factory=list)
    
    # Dates
    credit_note_date: str  # Date credit note was created
    expiry_date: Optional[str] = None  # Optional expiry
    
    # Metadata
    notes: Optional[str] = None
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    updated_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    created_by: Optional[str] = None
    
    class Config:
        json_encoders = {
            datetime: lambda v: v.isoformat()
        }


class CreditNoteApplyRequest(BaseModel):
    """Request to apply credit note to a delivery"""
    credit_note_id: str
    amount_to_apply: float  # Amount to apply (can be partial)


class DeliveryCreditApplication(BaseModel):
    """Credit note applied to a delivery"""
    credit_note_id: str
    credit_note_number: str
    amount_applied: float
    return_number: Optional[str] = None
