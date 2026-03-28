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
    base_price: float  # Base price for this SKU
    margin_type: str  # percentage, fixed_per_bottle, fixed_per_case
    margin_value: float
    min_quantity: Optional[int] = None
    max_quantity: Optional[int] = None
    active_from: Optional[str] = None  # Date from which this config is active (YYYY-MM-DD)
    active_to: Optional[str] = None  # Date until which this config is active (YYYY-MM-DD)
    remarks: Optional[str] = None
    status: Optional[str] = "active"


class MarginMatrixUpdate(BaseModel):
    state: Optional[str] = None
    city: Optional[str] = None
    sku_id: Optional[str] = None
    sku_name: Optional[str] = None
    base_price: Optional[float] = None
    margin_type: Optional[str] = None
    margin_value: Optional[float] = None
    min_quantity: Optional[int] = None
    max_quantity: Optional[int] = None
    active_from: Optional[str] = None
    active_to: Optional[str] = None
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
    base_price: float  # Base price for this SKU
    margin_type: str
    margin_value: float
    transfer_price: Optional[float] = None  # Calculated: base_price * (1 - margin_value/100) for percentage type
    min_quantity: Optional[int] = None
    max_quantity: Optional[int] = None
    active_from: Optional[str] = None
    active_to: Optional[str] = None
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
    base_price: Optional[float] = None  # Base/MRP price
    distributor_margin: Optional[float] = None  # Margin percentage
    unit_price: float  # Transfer price (after margin deduction)
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
    base_price: Optional[float] = None  # Base/MRP price
    distributor_margin: Optional[float] = None  # Margin percentage
    unit_price: float  # Transfer price (after margin deduction)
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
    unit_price: float  # Customer Selling Price (Per Unit)
    customer_selling_price: Optional[float] = None  # Alias for unit_price
    distributor_commission_percent: Optional[float] = None  # Commission %
    transfer_price: Optional[float] = None  # Transfer Price to Distributor (Per Unit)
    base_price: Optional[float] = None  # Alias for transfer_price
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
    unit_price: float  # Customer Selling Price
    customer_selling_price: Optional[float] = None
    distributor_commission_percent: Optional[float] = None
    transfer_price: Optional[float] = None
    base_price: Optional[float] = None
    discount_percent: float = 0
    tax_percent: float = 0
    gross_amount: float  # Total Customer Billing Value
    discount_amount: float
    taxable_amount: float
    tax_amount: float
    net_amount: float
    distributor_earnings: Optional[float] = None  # Earnings on selling price
    margin_at_transfer_price: Optional[float] = None  # Margin at transfer price
    adjustment_payable: Optional[float] = None  # Difference to settle
    margin_type: Optional[str] = None  # From margin matrix
    margin_value: Optional[float] = None
    margin_amount: Optional[float] = None  # Calculated earning for this item
    remarks: Optional[str] = None


class CreditNoteApplicationCreate(BaseModel):
    """Credit note to apply during delivery creation"""
    credit_note_id: str
    amount_to_apply: float


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
    # Credit notes to apply
    credit_notes_to_apply: Optional[List[CreditNoteApplicationCreate]] = None


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
    
    # Credit note application
    applied_credit_notes: Optional[List[dict]] = None  # [{credit_note_id, credit_note_number, amount_applied, return_number}]
    total_credit_applied: float = 0  # Total credit notes applied
    net_customer_billing: float = 0  # total_net_amount - total_credit_applied
    
    remarks: Optional[str] = None
    items: Optional[List[DeliveryItem]] = None
    created_at: str
    updated_at: str
    created_by: Optional[str] = None
    confirmed_at: Optional[str] = None
    confirmed_by: Optional[str] = None
    delivered_at: Optional[str] = None
    delivered_by: Optional[str] = None



# ============ Distributor Settlement ============

class SettlementStatus(str, Enum):
    DRAFT = "draft"
    PENDING_APPROVAL = "pending_approval"
    APPROVED = "approved"
    REJECTED = "rejected"
    PAID = "paid"
    CANCELLED = "cancelled"


class SettlementPeriodType(str, Enum):
    WEEKLY = "weekly"
    BIWEEKLY = "biweekly"
    MONTHLY = "monthly"
    CUSTOM = "custom"


class SettlementItemCreate(BaseModel):
    delivery_id: str
    delivery_number: str
    delivery_date: str
    account_id: str
    account_name: str
    total_quantity: int
    total_amount: float
    margin_amount: float


class SettlementItem(BaseModel):
    id: str
    settlement_id: str
    delivery_id: str
    delivery_number: str
    delivery_date: str
    account_id: str
    account_name: str
    account_city: Optional[str] = None
    total_quantity: int
    total_amount: float
    margin_amount: float


class DistributorSettlementCreate(BaseModel):
    distributor_id: str
    period_type: str = "monthly"
    period_start: str  # ISO date
    period_end: str  # ISO date
    remarks: Optional[str] = None


class DistributorSettlementUpdate(BaseModel):
    remarks: Optional[str] = None
    adjustments: Optional[float] = None
    status: Optional[str] = None


class DistributorSettlement(BaseModel):
    id: str
    tenant_id: str
    settlement_number: str  # Auto-generated like STL-2026-0001
    distributor_id: str
    distributor_name: Optional[str] = None
    distributor_code: Optional[str] = None
    period_type: str = "monthly"
    period_start: str
    period_end: str
    total_deliveries: int = 0
    total_quantity: int = 0
    total_delivery_amount: float = 0
    total_margin_amount: float = 0  # Total payout to distributor
    adjustments: float = 0  # Manual adjustments (+/-)
    final_payout: float = 0  # total_margin_amount + adjustments
    status: str = "draft"
    remarks: Optional[str] = None
    items: Optional[List[SettlementItem]] = None
    created_at: str
    updated_at: str
    created_by: Optional[str] = None
    submitted_at: Optional[str] = None
    submitted_by: Optional[str] = None
    approved_at: Optional[str] = None
    approved_by: Optional[str] = None
    approved_by_name: Optional[str] = None
    rejected_at: Optional[str] = None
    rejected_by: Optional[str] = None
    rejection_reason: Optional[str] = None
    paid_at: Optional[str] = None
    paid_by: Optional[str] = None
    payment_reference: Optional[str] = None


# ============ Distributor Billing & Reconciliation ============

class BillingConfigCreate(BaseModel):
    """Configuration for base prices at distributor level"""
    sku_id: str
    sku_name: Optional[str] = None
    base_price: float  # Base price for this SKU
    margin_percent: float = 2.5  # Distributor margin percentage (default 2.5%)
    effective_from: Optional[str] = None
    effective_to: Optional[str] = None
    remarks: Optional[str] = None
    status: Optional[str] = "active"


class BillingConfigUpdate(BaseModel):
    base_price: Optional[float] = None
    margin_percent: Optional[float] = None
    effective_from: Optional[str] = None
    effective_to: Optional[str] = None
    remarks: Optional[str] = None
    status: Optional[str] = None


class BillingConfig(BaseModel):
    """Billing configuration per distributor per SKU"""
    id: str
    tenant_id: str
    distributor_id: str
    sku_id: str
    sku_name: Optional[str] = None
    base_price: float
    margin_percent: float = 2.5  # Distributor margin percentage
    transfer_price: Optional[float] = None  # Calculated: base_price * (1 - margin_percent/100)
    effective_from: Optional[str] = None
    effective_to: Optional[str] = None
    remarks: Optional[str] = None
    status: str = "active"
    created_at: str
    updated_at: str
    created_by: Optional[str] = None


class ProvisionalInvoiceItemCreate(BaseModel):
    """Item in provisional invoice"""
    sku_id: str
    sku_name: Optional[str] = None
    quantity: int
    base_price: float
    margin_percent: float = 2.5
    transfer_price: float  # base_price * (1 - margin_percent/100)
    gross_amount: float  # quantity * base_price
    margin_amount: float  # gross_amount * margin_percent/100
    net_amount: float  # gross_amount - margin_amount = quantity * transfer_price


class ProvisionalInvoiceItem(BaseModel):
    id: str
    invoice_id: str
    sku_id: str
    sku_name: Optional[str] = None
    quantity: int
    base_price: float
    margin_percent: float = 2.5
    transfer_price: float
    gross_amount: float
    margin_amount: float
    net_amount: float


class ProvisionalInvoiceCreate(BaseModel):
    """Auto-generated when shipment is marked delivered"""
    invoice_date: Optional[str] = None
    due_date: Optional[str] = None
    remarks: Optional[str] = None


class ProvisionalInvoice(BaseModel):
    """Invoice for stock transferred to distributor at provisional transfer price"""
    id: str
    tenant_id: str
    invoice_number: str  # Auto-generated like PINV-2026-0001
    distributor_id: str
    distributor_name: Optional[str] = None
    distributor_code: Optional[str] = None
    shipment_id: str
    shipment_number: Optional[str] = None
    invoice_date: str
    due_date: Optional[str] = None
    total_quantity: int = 0
    total_gross_amount: float = 0  # Sum of (qty * base_price)
    total_margin_amount: float = 0  # Sum of (gross * margin_percent/100)
    total_net_amount: float = 0  # gross - margin = amount distributor pays
    status: str = "pending"  # pending, paid, partially_paid, overdue, cancelled
    reconciliation_status: str = "pending"  # pending, partially_reconciled, fully_reconciled
    reconciled_quantity: int = 0  # Quantity reconciled so far
    reconciled_amount: float = 0  # Amount reconciled so far
    remarks: Optional[str] = None
    items: Optional[List[ProvisionalInvoiceItem]] = None
    created_at: str
    updated_at: str
    created_by: Optional[str] = None
    paid_at: Optional[str] = None
    paid_amount: Optional[float] = None
    payment_reference: Optional[str] = None


class ReconciliationLineItem(BaseModel):
    """Detailed reconciliation per delivery item"""
    id: str
    reconciliation_id: str
    delivery_id: str
    delivery_number: Optional[str] = None
    delivery_date: Optional[str] = None
    account_id: str
    account_name: Optional[str] = None
    sku_id: str
    sku_name: Optional[str] = None
    quantity: int
    # Provisional (what distributor paid initially)
    base_price: float
    margin_percent: float
    transfer_price: float  # base_price * (1 - margin_percent/100)
    provisional_amount: float  # quantity * transfer_price
    # Actual (what distributor sold to customer)
    actual_selling_price: float  # Customer price
    actual_gross_amount: float  # quantity * actual_selling_price
    entitled_margin_amount: float  # actual_gross_amount * margin_percent/100
    actual_net_amount: float  # actual_gross_amount - entitled_margin_amount
    # Difference
    difference_amount: float  # actual_net_amount - provisional_amount
    # Positive = Distributor owes Nyla (Debit Note)
    # Negative = Nyla owes Distributor (Credit Note)


class ReconciliationCreate(BaseModel):
    period_start: str
    period_end: str
    remarks: Optional[str] = None


class Reconciliation(BaseModel):
    """Periodic reconciliation comparing provisional vs actual amounts"""
    id: str
    tenant_id: str
    reconciliation_number: str  # Auto-generated like REC-2026-0001
    distributor_id: str
    distributor_name: Optional[str] = None
    distributor_code: Optional[str] = None
    period_start: str
    period_end: str
    # Summary totals
    total_deliveries: int = 0
    total_quantity: int = 0
    total_provisional_amount: float = 0  # What distributor paid initially
    total_actual_gross_amount: float = 0  # What distributor collected from customers
    total_entitled_margin: float = 0  # 2.5% of actual gross
    total_actual_net_amount: float = 0  # What distributor should remit
    total_difference: float = 0  # actual_net - provisional
    # Positive = Debit Note (distributor owes)
    # Negative = Credit Note (Nyla owes)
    adjustments: float = 0  # Manual adjustments
    final_settlement_amount: float = 0  # difference + adjustments
    settlement_type: Optional[str] = None  # "debit_note" or "credit_note"
    status: str = "draft"  # draft, confirmed, settled, cancelled
    debit_credit_note_id: Optional[str] = None
    remarks: Optional[str] = None
    items: Optional[List[ReconciliationLineItem]] = None
    created_at: str
    updated_at: str
    created_by: Optional[str] = None
    confirmed_at: Optional[str] = None
    confirmed_by: Optional[str] = None
    settled_at: Optional[str] = None
    settled_by: Optional[str] = None


class DebitCreditNoteCreate(BaseModel):
    reconciliation_id: str
    note_type: str  # "debit" or "credit"
    amount: float
    remarks: Optional[str] = None


class DebitCreditNote(BaseModel):
    """Settlement document generated from reconciliation"""
    id: str
    tenant_id: str
    note_number: str  # Auto-generated like DN-2026-0001 or CN-2026-0001
    note_type: str  # "debit" (distributor pays) or "credit" (Nyla pays)
    reconciliation_id: str
    reconciliation_number: Optional[str] = None
    distributor_id: str
    distributor_name: Optional[str] = None
    distributor_code: Optional[str] = None
    amount: float  # Absolute amount
    status: str = "pending"  # pending, paid, partially_paid, cancelled
    paid_amount: float = 0
    balance_amount: float = 0
    due_date: Optional[str] = None
    remarks: Optional[str] = None
    created_at: str
    updated_at: str
    created_by: Optional[str] = None
    paid_at: Optional[str] = None
    paid_by: Optional[str] = None
    payment_reference: Optional[str] = None


class AutoReconciliationConfig(BaseModel):
    """Configuration for automatic reconciliation"""
    id: str
    tenant_id: str
    distributor_id: str
    is_enabled: bool = True
    frequency: str = "monthly"  # "weekly", "monthly", "realtime"
    day_of_week: Optional[int] = None  # 0=Monday, for weekly
    day_of_month: Optional[int] = None  # 1-28, for monthly
    last_run_at: Optional[str] = None
    next_run_at: Optional[str] = None
    created_at: str
    updated_at: str
