"""COGS (Cost of Goods Sold) models"""
from pydantic import BaseModel, Field, ConfigDict
from typing import Optional
from datetime import datetime, timezone
import uuid

class COGSData(BaseModel):
    model_config = ConfigDict(extra="ignore")
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    sku_name: str
    city: str
    
    primary_packaging_cost: float = 0.0
    secondary_packaging_cost: float = 0.0
    manufacturing_variable_cost: float = 0.0
    gross_margin: float = 0.0
    outbound_logistics_cost: float = 0.0
    distribution_cost: float = 0.0
    
    total_cogs: float = 0.0
    ex_factory_price: float = 0.0
    base_cost: float = 0.0
    minimum_landing_price: float = 0.0
    
    last_edited_by: Optional[str] = None
    last_edited_at: Optional[datetime] = None
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))

class COGSDataUpdate(BaseModel):
    primary_packaging_cost: Optional[float] = None
    secondary_packaging_cost: Optional[float] = None
    manufacturing_variable_cost: Optional[float] = None
    gross_margin: Optional[float] = None
    outbound_logistics_cost: Optional[float] = None
    distribution_cost: Optional[float] = None
