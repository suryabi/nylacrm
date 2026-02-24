"""Leave request models"""
from pydantic import BaseModel, Field, ConfigDict
from typing import Optional
from datetime import datetime, timezone
import uuid

class LeaveRequest(BaseModel):
    model_config = ConfigDict(extra="ignore")
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    user_id: str
    leave_type: str
    start_date: str
    end_date: str
    total_days: int
    reason: str
    status: str = 'pending'
    approved_by: Optional[str] = None
    approval_date: Optional[datetime] = None
    rejection_reason: Optional[str] = None
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    updated_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))

class LeaveRequestCreate(BaseModel):
    leave_type: str
    start_date: str
    end_date: str
    reason: str

class LeaveApproval(BaseModel):
    status: str
    rejection_reason: Optional[str] = None
