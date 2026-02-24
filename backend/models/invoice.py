"""Invoice models"""
from pydantic import BaseModel, Field
from typing import Optional
from datetime import datetime, timezone
import uuid

class Invoice(BaseModel):
    """Invoice data received from ActiveMQ"""
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    invoice_no: str
    invoice_date: str
    gross_invoice_value: float
    net_invoice_value: float
    credit_note_value: float
    ca_lead_id: str
    c_lead_id: Optional[str] = None
    lead_uuid: Optional[str] = None
    status: str = 'matched'
    received_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
