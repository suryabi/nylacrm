"""
COGS Components Master
Configures which columns contribute to the Cost of Goods Sold calculator.
Editable by System Admin / CEO / Director (mirrors COGS Calculator edit rule).
Other roles configurable via existing module-access matrix.
"""
from fastapi import APIRouter, Depends, HTTPException
from typing import Optional, List
from pydantic import BaseModel, Field
from datetime import datetime, timezone
import uuid
import logging

from database import db
from deps import get_current_user
from core.tenant import get_current_tenant_id

router = APIRouter(tags=["COGS Components"])
logger = logging.getLogger(__name__)


# Default seed: mirrors the legacy hardcoded COGS Calculator columns
DEFAULT_COMPONENTS = [
    {"key": "primary_packaging_cost",    "label": "Primary Packaging Cost",    "unit": "rupee",   "sort_order": 1, "is_system": True},
    {"key": "secondary_packaging_cost",  "label": "Secondary Packaging Cost",  "unit": "rupee",   "sort_order": 2, "is_system": True},
    {"key": "manufacturing_variable_cost","label": "Manufacturing Variable Cost","unit": "rupee", "sort_order": 3, "is_system": True},
    {"key": "outbound_logistics_cost",   "label": "Outbound Logistics Cost",   "unit": "rupee",   "sort_order": 4, "is_system": True},
    {"key": "distribution_cost",         "label": "Distribution Cost",         "unit": "percent", "sort_order": 5, "is_system": True},
    {"key": "gross_margin",              "label": "Gross Margin",              "unit": "percent", "sort_order": 6, "is_system": True},
]

EDIT_ROLES = {"System Admin", "CEO", "Director"}


def _can_edit(user: dict) -> bool:
    role = (user or {}).get("role") or ""
    return role.strip().title() in {r.title() for r in EDIT_ROLES} or role == "System Admin"


class ComponentCreate(BaseModel):
    key: str = Field(min_length=2, max_length=64)
    label: str = Field(min_length=1, max_length=128)
    unit: str = Field(pattern="^(rupee|percent)$")
    sort_order: Optional[int] = 99
    is_active: Optional[bool] = True


class ComponentUpdate(BaseModel):
    label: Optional[str] = None
    sort_order: Optional[int] = None
    is_active: Optional[bool] = None


async def _seed_if_empty(tenant_id: str):
    existing = await db.cogs_components.count_documents({"tenant_id": tenant_id})
    if existing > 0:
        return
    now = datetime.now(timezone.utc).isoformat()
    docs = []
    for c in DEFAULT_COMPONENTS:
        docs.append({
            "id": str(uuid.uuid4()),
            "tenant_id": tenant_id,
            "key": c["key"],
            "label": c["label"],
            "unit": c["unit"],
            "sort_order": c["sort_order"],
            "is_system": c["is_system"],
            "is_active": True,
            "created_at": now,
            "updated_at": now,
        })
    if docs:
        await db.cogs_components.insert_many(docs)


@router.get("")
async def list_components(
    is_active: Optional[bool] = None,
    current_user: dict = Depends(get_current_user),
):
    """List COGS components for the current tenant (auto-seeds defaults on first call)."""
    tenant_id = get_current_tenant_id()
    await _seed_if_empty(tenant_id)
    q = {"tenant_id": tenant_id}
    if is_active is not None:
        q["is_active"] = is_active
    rows = await db.cogs_components.find(q, {"_id": 0}).sort("sort_order", 1).to_list(200)
    return {"components": rows, "total": len(rows)}


@router.post("")
async def create_component(
    data: ComponentCreate,
    current_user: dict = Depends(get_current_user),
):
    if not _can_edit(current_user):
        raise HTTPException(status_code=403, detail="Only System Admin / CEO / Director can edit COGS components")
    tenant_id = get_current_tenant_id()
    # Enforce unique key per tenant
    existing = await db.cogs_components.find_one({"tenant_id": tenant_id, "key": data.key})
    if existing:
        raise HTTPException(status_code=400, detail=f"Component with key '{data.key}' already exists")
    now = datetime.now(timezone.utc).isoformat()
    doc = {
        "id": str(uuid.uuid4()),
        "tenant_id": tenant_id,
        "key": data.key,
        "label": data.label,
        "unit": data.unit,
        "sort_order": data.sort_order if data.sort_order is not None else 99,
        "is_system": False,
        "is_active": data.is_active if data.is_active is not None else True,
        "created_at": now,
        "updated_at": now,
    }
    await db.cogs_components.insert_one(dict(doc))
    return {k: v for k, v in doc.items() if k != "_id"}


@router.put("/{component_id}")
async def update_component(
    component_id: str,
    data: ComponentUpdate,
    current_user: dict = Depends(get_current_user),
):
    if not _can_edit(current_user):
        raise HTTPException(status_code=403, detail="Only System Admin / CEO / Director can edit COGS components")
    tenant_id = get_current_tenant_id()
    existing = await db.cogs_components.find_one({"id": component_id, "tenant_id": tenant_id}, {"_id": 0})
    if not existing:
        raise HTTPException(status_code=404, detail="Component not found")
    update = {k: v for k, v in data.model_dump().items() if v is not None}
    if update:
        update["updated_at"] = datetime.now(timezone.utc).isoformat()
        await db.cogs_components.update_one(
            {"id": component_id, "tenant_id": tenant_id},
            {"$set": update}
        )
    refreshed = await db.cogs_components.find_one({"id": component_id, "tenant_id": tenant_id}, {"_id": 0})
    return refreshed


@router.delete("/{component_id}")
async def delete_component(
    component_id: str,
    current_user: dict = Depends(get_current_user),
):
    """Hard delete a component (per user choice 2b — values are removed everywhere)."""
    if not _can_edit(current_user):
        raise HTTPException(status_code=403, detail="Only System Admin / CEO / Director can edit COGS components")
    tenant_id = get_current_tenant_id()
    existing = await db.cogs_components.find_one({"id": component_id, "tenant_id": tenant_id}, {"_id": 0})
    if not existing:
        raise HTTPException(status_code=404, detail="Component not found")
    await db.cogs_components.delete_one({"id": component_id, "tenant_id": tenant_id})
    return {"message": f"Component '{existing.get('label')}' deleted"}
