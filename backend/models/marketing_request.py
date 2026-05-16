"""Marketing Request Module — Pydantic models

Lifecycle (canonical status keys):
    submitted → inputs_needed ↔ in_progress → in_review →
    approved_internal → final_approved → (production submission) →
    production_in_progress → production_completed

Permissions follow `user.department` (Sales / Marketing / Delivery — multi-dept
allowed). Statuses, types, and departments are admin-managed masters so the
labels and lead-times can evolve per tenant.
"""
from datetime import datetime, timezone
from typing import List, Optional
import uuid

from pydantic import BaseModel, ConfigDict, Field


# ──────────────────────────────────────────────────────────────
# Master: Marketing Request Type
# ──────────────────────────────────────────────────────────────
class MarketingRequestType(BaseModel):
    model_config = ConfigDict(extra="allow")
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    tenant_id: str
    name: str
    design_lead_time_days: int = 7
    production_lead_time_days: int = 7
    is_active: bool = True
    is_default: bool = False
    created_at: str = Field(default_factory=lambda: datetime.now(timezone.utc).isoformat())
    updated_at: str = Field(default_factory=lambda: datetime.now(timezone.utc).isoformat())


class MarketingRequestTypeCreate(BaseModel):
    name: str
    design_lead_time_days: int = 7
    production_lead_time_days: int = 7
    is_active: bool = True


class MarketingRequestTypeUpdate(BaseModel):
    name: Optional[str] = None
    design_lead_time_days: Optional[int] = None
    production_lead_time_days: Optional[int] = None
    is_active: Optional[bool] = None


# ──────────────────────────────────────────────────────────────
# Master: Marketing Request Status
# ──────────────────────────────────────────────────────────────
class MarketingRequestStatus(BaseModel):
    model_config = ConfigDict(extra="allow")
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    tenant_id: str
    name: str        # display label (admin-editable)
    key: str         # canonical lifecycle key (immutable)
    color: str = "slate"   # tailwind color name for badges
    sequence: int = 0
    is_terminal: bool = False
    is_active: bool = True


class MarketingRequestStatusUpdate(BaseModel):
    name: Optional[str] = None
    color: Optional[str] = None
    sequence: Optional[int] = None
    is_active: Optional[bool] = None


# ──────────────────────────────────────────────────────────────
# Master: Department (used both as assigned_department and delivery_team)
# ──────────────────────────────────────────────────────────────
class MasterDepartment(BaseModel):
    model_config = ConfigDict(extra="allow")
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    tenant_id: str
    name: str
    kind: str = "general"  # 'general' | 'fulfilment' | 'delivery' — informational only
    is_active: bool = True
    is_default: bool = False


class MasterDepartmentCreate(BaseModel):
    name: str
    kind: str = "general"
    is_active: bool = True


class MasterDepartmentUpdate(BaseModel):
    name: Optional[str] = None
    kind: Optional[str] = None
    is_active: Optional[bool] = None


# ──────────────────────────────────────────────────────────────
# Marketing Request — main lifecycle document
# ──────────────────────────────────────────────────────────────
class StoredFile(BaseModel):
    model_config = ConfigDict(extra="allow")
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    filename: str
    path: str          # object-storage key
    size: int = 0
    content_type: Optional[str] = None
    uploaded_at: str = Field(default_factory=lambda: datetime.now(timezone.utc).isoformat())
    uploaded_by: Optional[str] = None
    uploaded_by_name: Optional[str] = None


class FileVersion(BaseModel):
    model_config = ConfigDict(extra="allow")
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    version_name: str
    files: List[StoredFile] = []
    links: List[str] = []
    comments: Optional[str] = None
    uploaded_by: str
    uploaded_by_name: str
    uploaded_at: str = Field(default_factory=lambda: datetime.now(timezone.utc).isoformat())


class RequestComment(BaseModel):
    model_config = ConfigDict(extra="allow")
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    user_id: str
    user_name: str
    text: str
    kind: str = "comment"  # 'comment' | 'status_change' | 'inputs_request' | 'system'
    created_at: str = Field(default_factory=lambda: datetime.now(timezone.utc).isoformat())


class ProductionSubmission(BaseModel):
    model_config = ConfigDict(extra="allow")
    submitted_at: str = Field(default_factory=lambda: datetime.now(timezone.utc).isoformat())
    submitted_by: str
    submitted_by_name: str
    quantity_required: int
    requested_production_date: str
    assigned_delivery_department_id: str
    assigned_delivery_department_name: str
    production_notes: Optional[str] = None
    final_approved_files: List[StoredFile] = []
    final_approved_links: List[str] = []
    production_status: str = "pending"  # 'pending' | 'in_progress' | 'completed'
    production_completed_at: Optional[str] = None
    production_completed_by: Optional[str] = None
    production_completed_by_name: Optional[str] = None


class MarketingRequest(BaseModel):
    model_config = ConfigDict(extra="allow")
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    request_number: Optional[str] = None  # generated server-side, e.g. MR-2026-0001
    tenant_id: str

    # core fields
    title: str
    request_type_id: str
    request_type_name: Optional[str] = None
    assigned_department_id: str
    assigned_department_name: Optional[str] = None
    requested_due_date: str  # ISO date
    requirement_details: str

    # lead-time snapshot at creation time (so changes to the master later
    # don't retroactively change the warning)
    design_lead_time_days: int = 0
    production_lead_time_days: int = 0
    short_timeline_reason: Optional[str] = None

    # attached inputs
    logo: Optional[StoredFile] = None
    references: List[StoredFile] = []
    social_media_links: List[str] = []
    file_links: List[str] = []
    additional_comments: Optional[str] = None

    # status (canonical key + display name; admin can rename the name)
    status_key: str = "submitted"
    status_name: Optional[str] = None

    # marketing work
    versions: List[FileVersion] = []
    comments: List[RequestComment] = []

    # production
    production: Optional[ProductionSubmission] = None

    # audit
    created_by: str
    created_by_name: Optional[str] = None
    created_at: str = Field(default_factory=lambda: datetime.now(timezone.utc).isoformat())
    updated_at: str = Field(default_factory=lambda: datetime.now(timezone.utc).isoformat())


# ──────────────────────────────────────────────────────────────
# DTO models for create / status-change / production-submit
# ──────────────────────────────────────────────────────────────
class MarketingRequestCreate(BaseModel):
    title: str
    request_type_id: str
    assigned_department_id: str
    requested_due_date: str
    requirement_details: str
    short_timeline_reason: Optional[str] = None
    social_media_links: List[str] = []
    file_links: List[str] = []
    additional_comments: Optional[str] = None
    # file IDs returned from prior `/upload` calls
    logo_file_id: Optional[str] = None
    reference_file_ids: List[str] = []


class StatusChangeRequest(BaseModel):
    status_key: str
    comment: Optional[str] = None


class CommentCreate(BaseModel):
    text: str
    kind: str = "comment"


class VersionCreate(BaseModel):
    version_name: str
    file_ids: List[str] = []
    links: List[str] = []
    comments: Optional[str] = None


class ProductionSubmitRequest(BaseModel):
    quantity_required: int
    requested_production_date: str
    assigned_delivery_department_id: str
    production_notes: Optional[str] = None
    final_approved_file_ids: List[str] = []
    final_approved_links: List[str] = []


# Canonical lifecycle definition — the order enforces the workflow. Admin-
# configurable masters can rename the display label, but never the key/order.
LIFECYCLE_STATUSES = [
    {"key": "submitted",        "name": "Submitted",         "color": "slate",   "sequence": 1, "is_terminal": False},
    {"key": "inputs_needed",    "name": "Inputs Needed",     "color": "amber",   "sequence": 2, "is_terminal": False},
    {"key": "in_progress",      "name": "In Progress",       "color": "blue",    "sequence": 3, "is_terminal": False},
    {"key": "in_review",        "name": "In Review",         "color": "violet",  "sequence": 4, "is_terminal": False},
    {"key": "approved_internal","name": "Approved - Internal","color": "indigo", "sequence": 5, "is_terminal": False},
    {"key": "final_approved",   "name": "Final Approved",    "color": "emerald", "sequence": 6, "is_terminal": False},
    {"key": "production_in_progress","name": "Production In Progress","color":"orange","sequence":7,"is_terminal":False},
    {"key": "production_completed","name":"Production Completed","color":"green","sequence":8,"is_terminal":True},
]

DEFAULT_REQUEST_TYPES = [
    {"name": "Neck Tags",                                       "design_lead_time_days": 5,  "production_lead_time_days": 10},
    {"name": "Bottle Designs - Physical Samples Required",      "design_lead_time_days": 10, "production_lead_time_days": 20},
    {"name": "Bottle Designs - No Samples Required",            "design_lead_time_days": 7,  "production_lead_time_days": 14},
    {"name": "Presentation",                                    "design_lead_time_days": 3,  "production_lead_time_days": 0},
    {"name": "Standees",                                        "design_lead_time_days": 5,  "production_lead_time_days": 7},
    {"name": "Others",                                          "design_lead_time_days": 5,  "production_lead_time_days": 7},
    {"name": "Video",                                           "design_lead_time_days": 10, "production_lead_time_days": 0},
]

DEFAULT_DEPARTMENTS = [
    {"name": "Marketing",        "kind": "fulfilment"},
    {"name": "Design",           "kind": "fulfilment"},
    {"name": "Branding",         "kind": "fulfilment"},
    {"name": "Production",       "kind": "delivery"},
    {"name": "Printing - Vendor","kind": "delivery"},
]
