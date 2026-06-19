"""
Customer Complaints module.

Track customer complaints linked to a Lead / Account / Distributor, against one
or more SKUs, with details, photo attachments (object storage) and a threaded
update/comment log.

Routes (mounted under /api/complaints)
  GET    /                          → paginated list (filters)
  GET    /meta/options              → enums + assignable users
  GET    /meta/entity-search        → search leads/accounts/distributors
  POST   /                          → create
  GET    /{id}                      → detail
  PUT    /{id}                      → update (fields / status / priority / assignment)
  DELETE /{id}                      → delete (admin)
  POST   /{id}/comments             → add an update/comment
  POST   /{id}/photos               → upload photo(s)
  GET    /{id}/photos/{photo_id}    → download a photo (auth header)
  DELETE /{id}/photos/{photo_id}    → soft-delete a photo
"""
import os
import uuid
from datetime import datetime, timezone
from typing import List, Optional

from fastapi import APIRouter, Depends, HTTPException, Query, UploadFile, File
from fastapi.responses import Response
from motor.motor_asyncio import AsyncIOMotorClient
from pydantic import BaseModel, Field

from deps import get_current_user
from core.tenant import get_current_tenant_id
from services.object_storage import build_path, guess_content_type, put_object, get_object

router = APIRouter(prefix="/complaints", tags=["Customer Complaints"])

_client = AsyncIOMotorClient(os.environ["MONGO_URL"])
_db = _client[os.environ["DB_NAME"]]

STATUSES = ["open", "in_progress", "awaiting_customer", "resolved", "closed"]
PRIORITIES = ["low", "medium", "high", "urgent"]
CATEGORIES = ["quality", "packaging", "delivery", "billing", "other"]
LINK_TYPES = ["lead", "account", "distributor"]
ADMIN_ROLES = {"ceo", "admin", "system admin", "director"}

ALLOWED_IMAGE_TYPES = {"image/jpeg", "image/png", "image/gif", "image/webp", "image/heic"}
MAX_PHOTO_BYTES = 15 * 1024 * 1024  # 15 MB per photo


def _now() -> str:
    return datetime.now(timezone.utc).isoformat()


# ── Schemas ──────────────────────────────────────────────────────────────
class ComplaintCreate(BaseModel):
    title: str = Field(..., min_length=1, max_length=200)
    details: str = Field("", max_length=5000)
    link_type: Optional[str] = None
    lead_id: Optional[str] = None
    account_id: Optional[str] = None
    distributor_id: Optional[str] = None
    customer_name: Optional[str] = None
    sku_ids: List[str] = []
    sku_names: List[str] = []
    category: str = "other"
    priority: str = "medium"
    assigned_to: Optional[str] = None
    assigned_to_name: Optional[str] = None


class ComplaintUpdate(BaseModel):
    title: Optional[str] = None
    details: Optional[str] = None
    link_type: Optional[str] = None
    lead_id: Optional[str] = None
    account_id: Optional[str] = None
    distributor_id: Optional[str] = None
    customer_name: Optional[str] = None
    sku_ids: Optional[List[str]] = None
    sku_names: Optional[List[str]] = None
    category: Optional[str] = None
    priority: Optional[str] = None
    status: Optional[str] = None
    assigned_to: Optional[str] = None
    assigned_to_name: Optional[str] = None


class CommentCreate(BaseModel):
    text: str = Field(..., min_length=1, max_length=4000)


# ── Helpers ──────────────────────────────────────────────────────────────
async def _next_complaint_number(tenant_id: str) -> str:
    year = datetime.now(timezone.utc).year
    prefix = f"CMP-{year}-"
    count = await _db.customer_complaints.count_documents({
        "tenant_id": tenant_id,
        "complaint_number": {"$regex": f"^{prefix}"},
    })
    return f"{prefix}{count + 1:04d}"


def _public(doc: dict) -> dict:
    doc.pop("_id", None)
    return doc


def _is_admin(user: dict) -> bool:
    return (user.get("role") or "").strip().lower() in ADMIN_ROLES


# ── Meta ─────────────────────────────────────────────────────────────────
@router.get("/meta/options")
async def get_options(current_user: dict = Depends(get_current_user)):
    tenant_id = get_current_tenant_id()
    users = await _db.users.find(
        {"tenant_id": tenant_id, "is_active": {"$ne": False}},
        {"_id": 0, "id": 1, "name": 1, "role": 1},
    ).sort("name", 1).to_list(500)
    return {
        "statuses": STATUSES,
        "priorities": PRIORITIES,
        "categories": CATEGORIES,
        "link_types": LINK_TYPES,
        "users": users,
    }


@router.get("/meta/entity-search")
async def entity_search(
    link_type: str,
    q: str = "",
    current_user: dict = Depends(get_current_user),
):
    """Search leads / accounts / distributors for linking a complaint."""
    tenant_id = get_current_tenant_id()
    q = (q or "").strip()
    results = []
    if link_type == "lead":
        query = {"tenant_id": tenant_id}
        if q:
            query["$or"] = [
                {"company": {"$regex": q, "$options": "i"}},
                {"lead_id": {"$regex": q, "$options": "i"}},
                {"contact_person": {"$regex": q, "$options": "i"}},
            ]
        rows = await _db.leads.find(query, {"_id": 0}).limit(20).to_list(20)
        results = [{"id": r["id"], "name": r.get("company") or r.get("contact_person") or "Lead",
                    "subtitle": " · ".join([x for x in [r.get("lead_id"), r.get("city")] if x])} for r in rows]
    elif link_type == "account":
        query = {"tenant_id": tenant_id}
        if q:
            query["$or"] = [
                {"account_name": {"$regex": q, "$options": "i"}},
                {"account_id": {"$regex": q, "$options": "i"}},
                {"contact_name": {"$regex": q, "$options": "i"}},
            ]
        rows = await _db.accounts.find(query, {"_id": 0}).limit(20).to_list(20)
        results = [{"id": r["id"], "name": r.get("account_name") or "Account",
                    "subtitle": " · ".join([x for x in [r.get("account_id"), r.get("city")] if x])} for r in rows]
    elif link_type == "distributor":
        query = {"tenant_id": tenant_id}
        if q:
            query["$or"] = [
                {"distributor_name": {"$regex": q, "$options": "i"}},
                {"distributor_code": {"$regex": q, "$options": "i"}},
            ]
        rows = await _db.distributors.find(query, {"_id": 0}).limit(20).to_list(20)
        results = [{"id": r["id"], "name": r.get("distributor_name") or "Distributor",
                    "subtitle": r.get("distributor_code") or ""} for r in rows]
    else:
        raise HTTPException(status_code=400, detail="Invalid link_type")
    return {"results": results}


# ── List / Create ──────────────────────────────────────────────────────────
@router.get("")
async def list_complaints(
    status: Optional[str] = None,
    priority: Optional[str] = None,
    category: Optional[str] = None,
    assigned_to: Optional[str] = None,
    search: Optional[str] = None,
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
    current_user: dict = Depends(get_current_user),
):
    tenant_id = get_current_tenant_id()
    query = {"tenant_id": tenant_id}
    if status and status != "all":
        query["status"] = status
    if priority and priority != "all":
        query["priority"] = priority
    if category and category != "all":
        query["category"] = category
    if assigned_to and assigned_to != "all":
        query["assigned_to"] = assigned_to
    if search:
        query["$or"] = [
            {"title": {"$regex": search, "$options": "i"}},
            {"complaint_number": {"$regex": search, "$options": "i"}},
            {"customer_name": {"$regex": search, "$options": "i"}},
            {"sku_names": {"$regex": search, "$options": "i"}},
        ]

    total = await _db.customer_complaints.count_documents(query)
    skip = (page - 1) * page_size
    # Light projection — omit heavy comment/photo arrays from the list.
    docs = await _db.customer_complaints.find(
        query, {"_id": 0, "comments": 0, "photos": 0}
    ).sort("created_at", -1).skip(skip).limit(page_size).to_list(page_size)

    # attach counts
    ids = [d["id"] for d in docs]
    counts = {}
    if ids:
        agg = await _db.customer_complaints.find(
            {"id": {"$in": ids}}, {"_id": 0, "id": 1, "comments": 1, "photos": 1}
        ).to_list(len(ids))
        for a in agg:
            counts[a["id"]] = {
                "comment_count": len(a.get("comments") or []),
                "photo_count": len([p for p in (a.get("photos") or []) if not p.get("is_deleted")]),
            }
    for d in docs:
        d.update(counts.get(d["id"], {"comment_count": 0, "photo_count": 0}))

    return {
        "data": docs,
        "total": total,
        "page": page,
        "page_size": page_size,
        "total_pages": (total + page_size - 1) // page_size,
    }


@router.post("")
async def create_complaint(body: ComplaintCreate, current_user: dict = Depends(get_current_user)):
    tenant_id = get_current_tenant_id()
    if body.link_type and body.link_type not in LINK_TYPES:
        raise HTTPException(status_code=400, detail="Invalid link_type")
    if body.category not in CATEGORIES:
        raise HTTPException(status_code=400, detail="Invalid category")
    if body.priority not in PRIORITIES:
        raise HTTPException(status_code=400, detail="Invalid priority")

    now = _now()
    doc = {
        "id": str(uuid.uuid4()),
        "tenant_id": tenant_id,
        "complaint_number": await _next_complaint_number(tenant_id),
        "title": body.title.strip(),
        "details": body.details or "",
        "link_type": body.link_type,
        "lead_id": body.lead_id,
        "account_id": body.account_id,
        "distributor_id": body.distributor_id,
        "customer_name": body.customer_name,
        "sku_ids": body.sku_ids or [],
        "sku_names": body.sku_names or [],
        "category": body.category,
        "priority": body.priority,
        "status": "open",
        "assigned_to": body.assigned_to,
        "assigned_to_name": body.assigned_to_name,
        "photos": [],
        "comments": [],
        "created_by": current_user.get("id"),
        "created_by_name": current_user.get("name"),
        "created_at": now,
        "updated_at": now,
        "resolved_at": None,
        "closed_at": None,
    }
    await _db.customer_complaints.insert_one(doc)
    return _public(doc)


@router.get("/{complaint_id}")
async def get_complaint(complaint_id: str, current_user: dict = Depends(get_current_user)):
    tenant_id = get_current_tenant_id()
    doc = await _db.customer_complaints.find_one({"id": complaint_id, "tenant_id": tenant_id}, {"_id": 0})
    if not doc:
        raise HTTPException(status_code=404, detail="Complaint not found")
    doc["photos"] = [p for p in (doc.get("photos") or []) if not p.get("is_deleted")]
    return doc


@router.put("/{complaint_id}")
async def update_complaint(complaint_id: str, body: ComplaintUpdate, current_user: dict = Depends(get_current_user)):
    tenant_id = get_current_tenant_id()
    doc = await _db.customer_complaints.find_one({"id": complaint_id, "tenant_id": tenant_id})
    if not doc:
        raise HTTPException(status_code=404, detail="Complaint not found")

    updates = {k: v for k, v in body.model_dump(exclude_unset=True).items()}
    if "status" in updates and updates["status"] not in STATUSES:
        raise HTTPException(status_code=400, detail="Invalid status")
    if "priority" in updates and updates["priority"] not in PRIORITIES:
        raise HTTPException(status_code=400, detail="Invalid priority")
    if "category" in updates and updates["category"] not in CATEGORIES:
        raise HTTPException(status_code=400, detail="Invalid category")

    now = _now()
    updates["updated_at"] = now
    new_status = updates.get("status")
    if new_status == "resolved" and doc.get("status") != "resolved":
        updates["resolved_at"] = now
    if new_status == "closed" and doc.get("status") != "closed":
        updates["closed_at"] = now

    await _db.customer_complaints.update_one(
        {"id": complaint_id, "tenant_id": tenant_id}, {"$set": updates}
    )
    fresh = await _db.customer_complaints.find_one({"id": complaint_id, "tenant_id": tenant_id}, {"_id": 0})
    fresh["photos"] = [p for p in (fresh.get("photos") or []) if not p.get("is_deleted")]
    return fresh


@router.delete("/{complaint_id}")
async def delete_complaint(complaint_id: str, current_user: dict = Depends(get_current_user)):
    if not _is_admin(current_user):
        raise HTTPException(status_code=403, detail="Only admins can delete complaints")
    tenant_id = get_current_tenant_id()
    res = await _db.customer_complaints.delete_one({"id": complaint_id, "tenant_id": tenant_id})
    if res.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Complaint not found")
    return {"message": "Complaint deleted"}


# ── Comments / updates ───────────────────────────────────────────────────
@router.post("/{complaint_id}/comments")
async def add_comment(complaint_id: str, body: CommentCreate, current_user: dict = Depends(get_current_user)):
    tenant_id = get_current_tenant_id()
    doc = await _db.customer_complaints.find_one({"id": complaint_id, "tenant_id": tenant_id})
    if not doc:
        raise HTTPException(status_code=404, detail="Complaint not found")
    comment = {
        "id": str(uuid.uuid4()),
        "user_id": current_user.get("id"),
        "user_name": current_user.get("name"),
        "text": body.text.strip(),
        "created_at": _now(),
    }
    await _db.customer_complaints.update_one(
        {"id": complaint_id, "tenant_id": tenant_id},
        {"$push": {"comments": comment}, "$set": {"updated_at": _now()}},
    )
    return comment


# ── Photos ───────────────────────────────────────────────────────────────
@router.post("/{complaint_id}/photos")
async def upload_photos(
    complaint_id: str,
    files: List[UploadFile] = File(...),
    current_user: dict = Depends(get_current_user),
):
    tenant_id = get_current_tenant_id()
    doc = await _db.customer_complaints.find_one({"id": complaint_id, "tenant_id": tenant_id})
    if not doc:
        raise HTTPException(status_code=404, detail="Complaint not found")

    uploaded = []
    for f in files:
        content_type = f.content_type or guess_content_type(f.filename)
        if content_type not in ALLOWED_IMAGE_TYPES:
            raise HTTPException(status_code=400, detail=f"Unsupported file type: {content_type}")
        data = await f.read()
        if len(data) > MAX_PHOTO_BYTES:
            raise HTTPException(status_code=400, detail=f"{f.filename} exceeds 15 MB")
        path = build_path(tenant_id, "complaints", f.filename or "photo.jpg")
        result = await put_object(path, data, content_type)
        photo = {
            "id": str(uuid.uuid4()),
            "storage_path": result["path"],
            "original_filename": f.filename,
            "content_type": content_type,
            "size": result.get("size", len(data)),
            "uploaded_by": current_user.get("id"),
            "uploaded_by_name": current_user.get("name"),
            "uploaded_at": _now(),
            "is_deleted": False,
        }
        uploaded.append(photo)

    await _db.customer_complaints.update_one(
        {"id": complaint_id, "tenant_id": tenant_id},
        {"$push": {"photos": {"$each": uploaded}}, "$set": {"updated_at": _now()}},
    )
    return {"photos": uploaded}


@router.get("/{complaint_id}/photos/{photo_id}")
async def download_photo(complaint_id: str, photo_id: str, current_user: dict = Depends(get_current_user)):
    tenant_id = get_current_tenant_id()
    doc = await _db.customer_complaints.find_one({"id": complaint_id, "tenant_id": tenant_id}, {"_id": 0, "photos": 1})
    if not doc:
        raise HTTPException(status_code=404, detail="Complaint not found")
    photo = next((p for p in (doc.get("photos") or []) if p.get("id") == photo_id and not p.get("is_deleted")), None)
    if not photo:
        raise HTTPException(status_code=404, detail="Photo not found")
    data, content_type = await get_object(photo["storage_path"])
    return Response(content=data, media_type=photo.get("content_type") or content_type)


@router.delete("/{complaint_id}/photos/{photo_id}")
async def delete_photo(complaint_id: str, photo_id: str, current_user: dict = Depends(get_current_user)):
    tenant_id = get_current_tenant_id()
    res = await _db.customer_complaints.update_one(
        {"id": complaint_id, "tenant_id": tenant_id, "photos.id": photo_id},
        {"$set": {"photos.$.is_deleted": True, "updated_at": _now()}},
    )
    if res.matched_count == 0:
        raise HTTPException(status_code=404, detail="Photo not found")
    return {"message": "Photo removed"}
