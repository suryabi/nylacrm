"""Models for the Print Request module.

A print request is created from a *Final Approved* design (marketing) request.
It snapshots the lead + approved design files and captures quantity, due date,
notes, the assigned production team and the print vendor.

Statuses and vendors are tenant-configurable masters (managed in the Admin
module, similar to Lead Statuses).
"""
import uuid
from datetime import datetime, timezone
from typing import List, Optional

from pydantic import BaseModel, ConfigDict, Field


# ── Snapshot of an approved design file (references marketing_request_files) ──
class PrintStoredFile(BaseModel):
    model_config = ConfigDict(extra="allow")
    id: str
    filename: str
    path: str = ""
    size: int = 0
    content_type: Optional[str] = None


# ────────────────────────────── Status master ──────────────────────────────
DEFAULT_PRINT_STATUSES = [
    {"name": "New",         "color": "#94a3b8", "order": 1, "is_initial": True,  "is_terminal": False},
    {"name": "In Printing", "color": "#3b82f6", "order": 2, "is_initial": False, "is_terminal": False},
    {"name": "Printed",     "color": "#16a34a", "order": 3, "is_initial": False, "is_terminal": True},
    {"name": "On Hold",     "color": "#f59e0b", "order": 4, "is_initial": False, "is_terminal": False},
    {"name": "Cancelled",   "color": "#ef4444", "order": 5, "is_initial": False, "is_terminal": True},
]


class PrintRequestStatus(BaseModel):
    model_config = ConfigDict(extra="allow")
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    tenant_id: str
    name: str
    color: str = "#94a3b8"
    order: int = 0
    is_initial: bool = False
    is_terminal: bool = False
    is_default: bool = False  # seeded default (can be deactivated, not deleted)
    is_active: bool = True
    created_at: str = Field(default_factory=lambda: datetime.now(timezone.utc).isoformat())


class PrintRequestStatusCreate(BaseModel):
    name: str
    color: str = "#94a3b8"
    order: int = 0
    is_initial: bool = False
    is_terminal: bool = False
    is_active: bool = True


class PrintRequestStatusUpdate(BaseModel):
    name: Optional[str] = None
    color: Optional[str] = None
    order: Optional[int] = None
    is_initial: Optional[bool] = None
    is_terminal: Optional[bool] = None
    is_active: Optional[bool] = None


# ────────────────────────────── Vendor master ──────────────────────────────
class PrintVendor(BaseModel):
    model_config = ConfigDict(extra="allow")
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    tenant_id: str
    name: str
    contact_person: Optional[str] = None
    phone: Optional[str] = None
    email: Optional[str] = None
    is_active: bool = True
    created_at: str = Field(default_factory=lambda: datetime.now(timezone.utc).isoformat())


class PrintVendorCreate(BaseModel):
    name: str
    contact_person: Optional[str] = None
    phone: Optional[str] = None
    email: Optional[str] = None
    is_active: bool = True


class PrintVendorUpdate(BaseModel):
    name: Optional[str] = None
    contact_person: Optional[str] = None
    phone: Optional[str] = None
    email: Optional[str] = None
    is_active: Optional[bool] = None


# ────────────────────────────── Print request ──────────────────────────────
class PrintRequestCreate(BaseModel):
    marketing_request_id: str
    quantity: int
    requested_due_date: str  # ISO date (YYYY-MM-DD)
    notes: Optional[str] = None
    assigned_department_id: Optional[str] = None
    vendor_id: Optional[str] = None


class PrintRequestUpdate(BaseModel):
    quantity: Optional[int] = None
    requested_due_date: Optional[str] = None
    notes: Optional[str] = None
    assigned_department_id: Optional[str] = None
    vendor_id: Optional[str] = None


class PrintStatusChange(BaseModel):
    status_id: str
    note: Optional[str] = None
