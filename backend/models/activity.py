"""Activity models"""
from pydantic import BaseModel, Field, ConfigDict
from typing import Optional
from datetime import datetime, timezone
import uuid

class Activity(BaseModel):
    model_config = ConfigDict(extra="ignore")
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    lead_id: str
    activity_type: str
    description: str
    interaction_method: Optional[str] = None
    created_by: str
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))

class ActivityCreate(BaseModel):
    lead_id: str
    activity_type: str
    description: str
    interaction_method: Optional[str] = None

class FollowUp(BaseModel):
    model_config = ConfigDict(extra="ignore")
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    lead_id: str
    title: str
    description: Optional[str] = None
    scheduled_date: datetime
    is_completed: bool = False
    completed_at: Optional[datetime] = None
    assigned_to: str
    created_by: str
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))

class FollowUpCreate(BaseModel):
    lead_id: str
    title: str
    description: Optional[str] = None
    scheduled_date: datetime
    assigned_to: str

class Comment(BaseModel):
    model_config = ConfigDict(extra="ignore")
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    lead_id: str
    comment: str
    created_by: str
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))

class CommentCreate(BaseModel):
    lead_id: str
    comment: str
