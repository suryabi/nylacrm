"""Lead Briefs — externally-sourced market intel dumped per city for the sales
team to review. Sales mark briefs Reviewed and can convert promising ones to leads."""
import uuid
from datetime import datetime, timezone
from typing import Optional
from pydantic import BaseModel
from fastapi import APIRouter, HTTPException, Depends

from deps import get_current_user
from core.tenant import get_current_tenant_id
from database import db

router = APIRouter(prefix="/lead-briefs", tags=["Lead Briefs"])

ADMIN_ROLES = {"ceo", "director", "admin", "system admin", "system_admin", "tenant_admin", "owner"}


def _is_admin(user: dict) -> bool:
    return (user or {}).get("role", "").strip().lower() in ADMIN_ROLES


def _now() -> str:
    return datetime.now(timezone.utc).isoformat()


class BriefCreate(BaseModel):
    title: str
    city: str
    content: str
    summary: Optional[str] = None
    source_name: Optional[str] = None
    source_url: Optional[str] = None


class BriefUpdate(BaseModel):
    title: Optional[str] = None
    city: Optional[str] = None
    content: Optional[str] = None
    summary: Optional[str] = None
    source_name: Optional[str] = None
    source_url: Optional[str] = None


class ConvertPayload(BaseModel):
    lead_id: str
    lead_company: Optional[str] = None


@router.get("")
async def list_briefs(city: Optional[str] = None, status: Optional[str] = None,
                      current_user: dict = Depends(get_current_user)):
    tenant_id = get_current_tenant_id()
    q = {"tenant_id": tenant_id}
    if city and city != "all":
        q["city"] = city
    if status and status != "all":
        q["status"] = status
    briefs = await db.lead_briefs.find(q, {"_id": 0}).sort("created_at", -1).to_list(1000)
    return {"briefs": briefs, "is_admin": _is_admin(current_user)}


@router.get("/cities")
async def brief_cities(current_user: dict = Depends(get_current_user)):
    tenant_id = get_current_tenant_id()
    cities = await db.lead_briefs.distinct("city", {"tenant_id": tenant_id})
    return {"cities": sorted(c for c in cities if c)}


@router.post("")
async def create_brief(payload: BriefCreate, current_user: dict = Depends(get_current_user)):
    if not _is_admin(current_user):
        raise HTTPException(403, "Only admins can add lead briefs.")
    tenant_id = get_current_tenant_id()
    if not payload.title.strip() or not payload.city.strip() or not payload.content.strip():
        raise HTTPException(400, "Title, city and content are required.")
    summary = (payload.summary or "").strip() or payload.content.strip()[:220]
    doc = {
        "id": str(uuid.uuid4()), "tenant_id": tenant_id,
        "title": payload.title.strip(), "city": payload.city.strip(),
        "content": payload.content.strip(), "summary": summary,
        "source_name": (payload.source_name or "").strip() or None,
        "source_url": (payload.source_url or "").strip() or None,
        "status": "new",
        "reviewed_by_name": None, "reviewed_at": None,
        "converted_lead_id": None, "converted_lead_company": None,
        "created_by": current_user.get("id"), "created_by_name": current_user.get("name"),
        "created_at": _now(), "updated_at": _now(),
    }
    await db.lead_briefs.insert_one({**doc})
    return {"ok": True, "brief": doc}


@router.put("/{brief_id}")
async def update_brief(brief_id: str, payload: BriefUpdate,
                       current_user: dict = Depends(get_current_user)):
    if not _is_admin(current_user):
        raise HTTPException(403, "Only admins can edit lead briefs.")
    tenant_id = get_current_tenant_id()
    upd = {k: v for k, v in payload.dict().items() if v is not None}
    if not upd:
        raise HTTPException(400, "Nothing to update.")
    upd["updated_at"] = _now()
    r = await db.lead_briefs.update_one({"id": brief_id, "tenant_id": tenant_id}, {"$set": upd})
    if r.matched_count == 0:
        raise HTTPException(404, "Brief not found")
    return {"ok": True}


@router.delete("/{brief_id}")
async def delete_brief(brief_id: str, current_user: dict = Depends(get_current_user)):
    if not _is_admin(current_user):
        raise HTTPException(403, "Only admins can delete lead briefs.")
    tenant_id = get_current_tenant_id()
    r = await db.lead_briefs.delete_one({"id": brief_id, "tenant_id": tenant_id})
    if r.deleted_count == 0:
        raise HTTPException(404, "Brief not found")
    return {"ok": True}


@router.post("/{brief_id}/review")
async def mark_reviewed(brief_id: str, current_user: dict = Depends(get_current_user)):
    tenant_id = get_current_tenant_id()
    r = await db.lead_briefs.update_one(
        {"id": brief_id, "tenant_id": tenant_id},
        {"$set": {"status": "reviewed", "reviewed_by_name": current_user.get("name"),
                  "reviewed_at": _now(), "updated_at": _now()}})
    if r.matched_count == 0:
        raise HTTPException(404, "Brief not found")
    return {"ok": True}


@router.post("/{brief_id}/converted")
async def mark_converted(brief_id: str, payload: ConvertPayload,
                         current_user: dict = Depends(get_current_user)):
    tenant_id = get_current_tenant_id()
    r = await db.lead_briefs.update_one(
        {"id": brief_id, "tenant_id": tenant_id},
        {"$set": {"converted_lead_id": payload.lead_id,
                  "converted_lead_company": payload.lead_company,
                  "status": "reviewed",
                  "reviewed_by_name": current_user.get("name"), "reviewed_at": _now(),
                  "updated_at": _now()}})
    if r.matched_count == 0:
        raise HTTPException(404, "Brief not found")
    return {"ok": True}
