"""
Distributor Management Models
Pydantic models for the Distribution module
"""
from pydantic import BaseModel, Field
from typing import Optional, List
from datetime import datetime
from enum import Enum


class DistributorStatus(str, Enum):
    ACTIVE = "active"
    INACTIVE = "inactive"
    SUSPENDED = "suspended"
    PENDING = "pending"


class PaymentTerms(str, Enum):
    ADVANCE = "advance"
    COD = "cod"
    NET_7 = "net_7"
    NET_15 = "net_15"
    NET_30 = "net_30"
    NET_45 = "net_45"
    NET_60 = "net_60"


# ============ Distributor Master ============

class DistributorCreate(BaseModel):
    distributor_name: str
    legal_entity_name: Optional[str] = None
    distributor_code: Optional[str] = None
    gstin: Optional[str] = None
    pan: Optional[str] = None
    billing_address: Optional[str] = None
    registered_address: Optional[str] = None
    primary_contact_name: str
    primary_contact_mobile: str
    primary_contact_email: Optional[str] = None
    secondary_contact_name: Optional[str] = None
    secondary_contact_mobile: Optional[str] = None
    secondary_contact_email: Optional[str] = None
    payment_terms: Optional[str] = "net_30"
    credit_days: Optional[int] = 30
    credit_limit: Optional[float] = 0
    security_deposit: Optional[float] = 0
    status: Optional[str] = "active"
    notes: Optional[str] = None


class DistributorUpdate(BaseModel):
    distributor_name: Optional[str] = None
    legal_entity_name: Optional[str] = None
    distributor_code: Optional[str] = None
    gstin: Optional[str] = None
    pan: Optional[str] = None
    billing_address: Optional[str] = None
    registered_address: Optional[str] = None
    primary_contact_name: Optional[str] = None
    primary_contact_mobile: Optional[str] = None
    primary_contact_email: Optional[str] = None
    secondary_contact_name: Optional[str] = None
    secondary_contact_mobile: Optional[str] = None
    secondary_contact_email: Optional[str] = None
    payment_terms: Optional[str] = None
    credit_days: Optional[int] = None
    credit_limit: Optional[float] = None
    security_deposit: Optional[float] = None
    status: Optional[str] = None
    notes: Optional[str] = None


class Distributor(BaseModel):
    id: str
    tenant_id: str
    distributor_name: str
    legal_entity_name: Optional[str] = None
    distributor_code: str
    gstin: Optional[str] = None
    pan: Optional[str] = None
    billing_address: Optional[str] = None
    registered_address: Optional[str] = None
    primary_contact_name: str
    primary_contact_mobile: str
    primary_contact_email: Optional[str] = None
    secondary_contact_name: Optional[str] = None
    secondary_contact_mobile: Optional[str] = None
    secondary_contact_email: Optional[str] = None
    payment_terms: str = "net_30"
    credit_days: int = 30
    credit_limit: float = 0
    security_deposit: float = 0
    status: str = "active"
    notes: Optional[str] = None
    created_at: str
    updated_at: str
    created_by: Optional[str] = None


# ============ Operating Coverage ============

class OperatingCoverageCreate(BaseModel):
    distributor_id: str
    state: str
    city: str
    effective_from: Optional[str] = None
    effective_to: Optional[str] = None
    status: Optional[str] = "active"


class OperatingCoverageUpdate(BaseModel):
    state: Optional[str] = None
    city: Optional[str] = None
    effective_from: Optional[str] = None
    effective_to: Optional[str] = None
    status: Optional[str] = None


class OperatingCoverage(BaseModel):
    id: str
    tenant_id: str
    distributor_id: str
    state: str
    city: str
    effective_from: Optional[str] = None
    effective_to: Optional[str] = None
    status: str = "active"
    created_at: str
    updated_at: str


# ============ Distributor Locations/Warehouses ============

class DistributorLocationCreate(BaseModel):
    distributor_id: str
    location_name: str
    location_code: Optional[str] = None
    address_line_1: Optional[str] = None
    address_line_2: Optional[str] = None
    state: str
    city: str
    pincode: Optional[str] = None
    contact_person: Optional[str] = None
    contact_number: Optional[str] = None
    email: Optional[str] = None
    is_default: Optional[bool] = False
    status: Optional[str] = "active"


class DistributorLocationUpdate(BaseModel):
    location_name: Optional[str] = None
    location_code: Optional[str] = None
    address_line_1: Optional[str] = None
    address_line_2: Optional[str] = None
    state: Optional[str] = None
    city: Optional[str] = None
    pincode: Optional[str] = None
    contact_person: Optional[str] = None
    contact_number: Optional[str] = None
    email: Optional[str] = None
    is_default: Optional[bool] = None
    status: Optional[str] = None


class DistributorLocation(BaseModel):
    id: str
    tenant_id: str
    distributor_id: str
    location_name: str
    location_code: str
    address_line_1: Optional[str] = None
    address_line_2: Optional[str] = None
    state: str
    city: str
    pincode: Optional[str] = None
    contact_person: Optional[str] = None
    contact_number: Optional[str] = None
    email: Optional[str] = None
    is_default: bool = False
    status: str = "active"
    created_at: str
    updated_at: str


# ============ Distributor Margin Matrix ============

class MarginType(str, Enum):
    PERCENTAGE = "percentage"
    FIXED_PER_BOTTLE = "fixed_per_bottle"
    FIXED_PER_CASE = "fixed_per_case"


class MarginMatrixCreate(BaseModel):
    distributor_id: str
    state: str
    city: str
    sku_id: str
    sku_name: Optional[str] = None
    margin_type: str  # percentage, fixed_per_bottle, fixed_per_case
    margin_value: float
    min_quantity: Optional[int] = None
    max_quantity: Optional[int] = None
    effective_from: Optional[str] = None
    effective_to: Optional[str] = None
    remarks: Optional[str] = None
    status: Optional[str] = "active"


class MarginMatrixUpdate(BaseModel):
    state: Optional[str] = None
    city: Optional[str] = None
    sku_id: Optional[str] = None
    sku_name: Optional[str] = None
    margin_type: Optional[str] = None
    margin_value: Optional[float] = None
    min_quantity: Optional[int] = None
    max_quantity: Optional[int] = None
    effective_from: Optional[str] = None
    effective_to: Optional[str] = None
    remarks: Optional[str] = None
    status: Optional[str] = None


class MarginMatrix(BaseModel):
    id: str
    tenant_id: str
    distributor_id: str
    state: str
    city: str
    sku_id: str
    sku_name: Optional[str] = None
    margin_type: str
    margin_value: float
    min_quantity: Optional[int] = None
    max_quantity: Optional[int] = None
    effective_from: Optional[str] = None
    effective_to: Optional[str] = None
    remarks: Optional[str] = None
    status: str = "active"
    created_at: str
    updated_at: str

