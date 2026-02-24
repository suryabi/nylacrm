"""Target plan models"""
from pydantic import BaseModel, Field, ConfigDict
from typing import Optional
from datetime import datetime, timezone
import uuid

class TargetPlan(BaseModel):
    model_config = ConfigDict(extra="ignore")
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    plan_name: str
    time_period: str
    start_date: str
    end_date: str
    country: str = 'India'
    country_target: float
    currency: str = 'INR'
    status: str = 'draft'
    created_by: str
    locked_by: Optional[str] = None
    locked_at: Optional[datetime] = None
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    updated_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))

class TargetPlanCreate(BaseModel):
    plan_name: str
    time_period: str
    start_date: str
    end_date: str
    country_target: float

class TerritoryTarget(BaseModel):
    model_config = ConfigDict(extra="ignore")
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    plan_id: str
    territory: str
    allocation_percentage: float
    target_revenue: float
    allocated_revenue: float = 0
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))

class TerritoryTargetCreate(BaseModel):
    territory: str
    allocation_percentage: float

class CityTarget(BaseModel):
    model_config = ConfigDict(extra="ignore")
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    plan_id: str
    territory: str
    state: str
    city: str
    allocation_percentage: float
    target_revenue: float
    allocated_revenue: float = 0
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))

class CityTargetCreate(BaseModel):
    state: str
    city: str
    allocation_percentage: float

class ResourceTarget(BaseModel):
    model_config = ConfigDict(extra="ignore")
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    plan_id: str
    city_id: str
    resource_id: str
    allocation_percentage: float
    target_revenue: float
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))

class ResourceTargetCreate(BaseModel):
    resource_id: str
    allocation_percentage: float

class SKUTarget(BaseModel):
    model_config = ConfigDict(extra="ignore")
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    plan_id: str
    city_id: str
    sku_name: str
    allocation_percentage: float
    target_revenue: float
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))

class SKUTargetCreate(BaseModel):
    sku_name: str
    allocation_percentage: float
