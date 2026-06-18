"""Daily status models"""
from pydantic import BaseModel, Field, ConfigDict
from typing import Optional, List, Dict, Any
from datetime import datetime, timezone
import uuid

class DailyStatus(BaseModel):
    model_config = ConfigDict(extra="ignore")
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    user_id: str
    status_date: str

    yesterday_updates: str = ''
    yesterday_original: Optional[str] = None
    yesterday_ai_revised: bool = False

    today_actions: str = ''
    today_original: Optional[str] = None
    today_ai_revised: bool = False
    # Structured action items list. Each item:
    #   { description: str, lead_id: str|None, lead_name: str|None,
    #     no_lead: bool, follow_up_date: 'YYYY-MM-DD'|None }
    # Every item must satisfy: (lead_id is truthy) OR no_lead == True.
    action_items_v2: List[Dict[str, Any]] = []

    help_needed: str = ''
    help_original: Optional[str] = None
    help_ai_revised: bool = False

    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    updated_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))

class DailyStatusCreate(BaseModel):
    status_date: str
    yesterday_updates: str = ''
    today_actions: str = ''
    action_items_v2: Optional[List[Dict[str, Any]]] = None
    help_needed: str = ''

class DailyStatusUpdate(BaseModel):
    yesterday_updates: Optional[str] = None
    yesterday_original: Optional[str] = None
    yesterday_ai_revised: Optional[bool] = None
    today_actions: Optional[str] = None
    today_original: Optional[str] = None
    today_ai_revised: Optional[bool] = None
    action_items_v2: Optional[List[Dict[str, Any]]] = None
    help_needed: Optional[str] = None
    help_original: Optional[str] = None
    help_ai_revised: Optional[bool] = None
