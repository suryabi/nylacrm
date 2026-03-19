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



# ============ Account-Distributor Assignment ============

class AccountDistributorCreate(BaseModel):
    account_id: str
    account_name: Optional[str] = None
    distributor_id: str
    distributor_name: Optional[str] = None
    servicing_state: str
    servicing_city: str
    distributor_location_id: Optional[str] = None
    distributor_location_name: Optional[str] = None
    is_primary: Optional[bool] = True
    is_backup: Optional[bool] = False
    has_special_override: Optional[bool] = False
    override_type: Optional[str] = None  # percentage, fixed_per_bottle, fixed_per_case
    override_value: Optional[float] = None
    effective_from: Optional[str] = None
    effective_to: Optional[str] = None
    remarks: Optional[str] = None
    status: Optional[str] = "active"


class AccountDistributorUpdate(BaseModel):
    distributor_id: Optional[str] = None
    distributor_name: Optional[str] = None
    servicing_state: Optional[str] = None
    servicing_city: Optional[str] = None
    distributor_location_id: Optional[str] = None
    distributor_location_name: Optional[str] = None
    is_primary: Optional[bool] = None
    is_backup: Optional[bool] = None
    has_special_override: Optional[bool] = None
    override_type: Optional[str] = None
    override_value: Optional[float] = None
    effective_from: Optional[str] = None
    effective_to: Optional[str] = None
    remarks: Optional[str] = None
    status: Optional[str] = None


class AccountDistributor(BaseModel):
    id: str
    tenant_id: str
    account_id: str
    account_name: Optional[str] = None
    distributor_id: str
    distributor_name: Optional[str] = None
    servicing_state: str
    servicing_city: str
    distributor_location_id: Optional[str] = None
    distributor_location_name: Optional[str] = None
    is_primary: bool = True
    is_backup: bool = False
    has_special_override: bool = False
    override_type: Optional[str] = None
    override_value: Optional[float] = None
    effective_from: Optional[str] = None
    effective_to: Optional[str] = None
    remarks: Optional[str] = None
    status: str = "active"
    created_at: str
    updated_at: str


# ============ Primary Shipment / Stock Receipt ============

class ShipmentStatus(str, Enum):
    DRAFT = "draft"
    CONFIRMED = "confirmed"
    IN_TRANSIT = "in_transit"
    DELIVERED = "delivered"
    PARTIALLY_DELIVERED = "partially_delivered"
    CANCELLED = "cancelled"


class ShipmentItemCreate(BaseModel):
    sku_id: str
    sku_name: Optional[str] = None
    sku_code: Optional[str] = None
    quantity: int
    unit_price: float
    discount_percent: Optional[float] = 0
    tax_percent: Optional[float] = 0
    remarks: Optional[str] = None


class ShipmentItemUpdate(BaseModel):
    sku_id: Optional[str] = None
    sku_name: Optional[str] = None
    sku_code: Optional[str] = None
    quantity: Optional[int] = None
    unit_price: Optional[float] = None
    discount_percent: Optional[float] = None
    tax_percent: Optional[float] = None
    remarks: Optional[str] = None


class ShipmentItem(BaseModel):
    id: str
    shipment_id: str
    sku_id: str
    sku_name: Optional[str] = None
    sku_code: Optional[str] = None
    quantity: int
    unit_price: float
    discount_percent: float = 0
    tax_percent: float = 0
    gross_amount: float  # quantity * unit_price
    discount_amount: float  # gross_amount * discount_percent / 100
    taxable_amount: float  # gross_amount - discount_amount
    tax_amount: float  # taxable_amount * tax_percent / 100
    net_amount: float  # taxable_amount + tax_amount
    remarks: Optional[str] = None


class PrimaryShipmentCreate(BaseModel):
    distributor_id: str
    distributor_location_id: str
    shipment_date: str  # ISO date string
    expected_delivery_date: Optional[str] = None
    reference_number: Optional[str] = None  # External reference like PO number
    vehicle_number: Optional[str] = None
    driver_name: Optional[str] = None
    driver_contact: Optional[str] = None
    shipping_address: Optional[str] = None
    remarks: Optional[str] = None
    items: List[ShipmentItemCreate]


class PrimaryShipmentUpdate(BaseModel):
    shipment_date: Optional[str] = None
    expected_delivery_date: Optional[str] = None
    reference_number: Optional[str] = None
    vehicle_number: Optional[str] = None
    driver_name: Optional[str] = None
    driver_contact: Optional[str] = None
    shipping_address: Optional[str] = None
    remarks: Optional[str] = None
    status: Optional[str] = None


class PrimaryShipment(BaseModel):
    id: str
    tenant_id: str
    shipment_number: str  # Auto-generated like SHP-2026-0001
    distributor_id: str
    distributor_name: Optional[str] = None
    distributor_code: Optional[str] = None
    distributor_location_id: str
    distributor_location_name: Optional[str] = None
    shipment_date: str
    expected_delivery_date: Optional[str] = None
    actual_delivery_date: Optional[str] = None
    reference_number: Optional[str] = None
    vehicle_number: Optional[str] = None
    driver_name: Optional[str] = None
    driver_contact: Optional[str] = None
    shipping_address: Optional[str] = None
    status: str = "draft"
    total_quantity: int = 0
    total_gross_amount: float = 0
    total_discount_amount: float = 0
    total_tax_amount: float = 0
    total_net_amount: float = 0
    remarks: Optional[str] = None
    items: Optional[List[ShipmentItem]] = None
    created_at: str
    updated_at: str
    created_by: Optional[str] = None
    confirmed_at: Optional[str] = None
    confirmed_by: Optional[str] = None
    delivered_at: Optional[str] = None
    delivered_by: Optional[str] = None


# ============ Distributor-to-Account Delivery ============

class DeliveryStatus(str, Enum):
    DRAFT = "draft"
    CONFIRMED = "confirmed"
    IN_TRANSIT = "in_transit"
    DELIVERED = "delivered"
    PARTIALLY_DELIVERED = "partially_delivered"
    RETURNED = "returned"
    CANCELLED = "cancelled"


class DeliveryItemCreate(BaseModel):
    sku_id: str
    sku_name: Optional[str] = None
    quantity: int
    unit_price: float
    discount_percent: Optional[float] = 0
    tax_percent: Optional[float] = 0
    remarks: Optional[str] = None


class DeliveryItemUpdate(BaseModel):
    sku_id: Optional[str] = None
    quantity: Optional[int] = None
    unit_price: Optional[float] = None
    discount_percent: Optional[float] = None
    tax_percent: Optional[float] = None
    remarks: Optional[str] = None


class DeliveryItem(BaseModel):
    id: str
    delivery_id: str
    sku_id: str
    sku_name: Optional[str] = None
    sku_code: Optional[str] = None
    quantity: int
    unit_price: float
    discount_percent: float = 0
    tax_percent: float = 0
    gross_amount: float
    discount_amount: float
    taxable_amount: float
    tax_amount: float
    net_amount: float
    margin_type: Optional[str] = None  # From margin matrix
    margin_value: Optional[float] = None
    margin_amount: Optional[float] = None  # Calculated earning for this item
    remarks: Optional[str] = None


class AccountDeliveryCreate(BaseModel):
    distributor_id: str
    distributor_location_id: str
    account_id: str
    delivery_date: str
    reference_number: Optional[str] = None
    vehicle_number: Optional[str] = None
    driver_name: Optional[str] = None
    driver_contact: Optional[str] = None
    delivery_address: Optional[str] = None
    remarks: Optional[str] = None
    items: List[DeliveryItemCreate]


class AccountDeliveryUpdate(BaseModel):
    delivery_date: Optional[str] = None
    reference_number: Optional[str] = None
    vehicle_number: Optional[str] = None
    driver_name: Optional[str] = None
    driver_contact: Optional[str] = None
    delivery_address: Optional[str] = None
    remarks: Optional[str] = None
    status: Optional[str] = None


class AccountDelivery(BaseModel):
    id: str
    tenant_id: str
    delivery_number: str  # Auto-generated like DEL-2026-0001
    distributor_id: str
    distributor_name: Optional[str] = None
    distributor_code: Optional[str] = None
    distributor_location_id: str
    distributor_location_name: Optional[str] = None
    account_id: str
    account_name: Optional[str] = None
    account_city: Optional[str] = None
    account_state: Optional[str] = None
    delivery_date: str
    reference_number: Optional[str] = None
    vehicle_number: Optional[str] = None
    driver_name: Optional[str] = None
    driver_contact: Optional[str] = None
    delivery_address: Optional[str] = None
    status: str = "draft"
    total_quantity: int = 0
    total_gross_amount: float = 0
    total_discount_amount: float = 0
    total_tax_amount: float = 0
    total_net_amount: float = 0
    total_margin_amount: float = 0  # Total distributor earning from this delivery
    remarks: Optional[str] = None
    items: Optional[List[DeliveryItem]] = None
    created_at: str
    updated_at: str
    created_by: Optional[str] = None
    confirmed_at: Optional[str] = None
    confirmed_by: Optional[str] = None
    delivered_at: Optional[str] = None
    delivered_by: Optional[str] = None
