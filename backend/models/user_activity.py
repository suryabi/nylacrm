"""User activity tracking models"""
from pydantic import BaseModel, ConfigDict
from typing import Optional, List

class UserActivityEvent(BaseModel):
    """Single activity event within a session"""
    type: str
    page: Optional[str] = None
    action: Optional[str] = None
    timestamp: str

class UserActivity(BaseModel):
    """User activity tracking for current session"""
    model_config = ConfigDict(extra="ignore")
    user_id: str
    session_id: str
    session_start: str
    last_active: str
    total_time_seconds: int = 0
    pages_visited: List[dict] = []
    actions: List[dict] = []
    events: List[UserActivityEvent] = []

class ActivityHeartbeat(BaseModel):
    """Heartbeat data sent from frontend"""
    current_page: str
    action: Optional[str] = None
