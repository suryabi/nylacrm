"""Proposal template routes — multiple named, admin-editable templates per tenant."""
import base64
from fastapi import APIRouter, Depends, HTTPException, Request, UploadFile, File
from datetime import datetime, timezone

from database import get_tenant_db
from deps import get_current_user
from services.proposal_pdf import (
    DEFAULT_TEMPLATE, CONTENT_KEYS, list_templates, get_default_template, get_template_by_id,
    _ensure_templates, _make_template_doc, _content, _now_iso,
)

router = APIRouter()

ADMIN_ROLES = {"CEO", "Admin", "System Admin"}
MAX_LOGO_SIZE = 2 * 1024 * 1024
ALLOWED_LOGO_TYPES = {"image/png", "image/jpeg", "image/jpg", "image/webp"}


def _tdb():
    return get_tenant_db()


def _require_admin(current_user):
    if current_user.get("role") not in ADMIN_ROLES:
        raise HTTPException(status_code=403, detail="Only admins can edit proposal templates")


def _meta(t):
    return {"id": t.get("id"), "name": t.get("name"), "is_default": bool(t.get("is_default"))}


# ── Backward-compatible: the tenant's DEFAULT template ───────────────────────
@router.get("/template")
async def get_proposal_template(current_user: dict = Depends(get_current_user)):
    tpl = await get_default_template(_tdb())
    tpl.pop("_id", None)
    return {"template": tpl, "defaults": DEFAULT_TEMPLATE}


# ── Multi-template CRUD ──────────────────────────────────────────────────────
@router.get("/templates")
async def list_proposal_templates(current_user: dict = Depends(get_current_user)):
    tpls = await list_templates(_tdb())
    return {"templates": [_meta(t) for t in tpls]}


@router.get("/templates/{template_id}")
async def get_proposal_template_by_id(template_id: str, current_user: dict = Depends(get_current_user)):
    tpl = await get_template_by_id(_tdb(), template_id)
    if not tpl:
        raise HTTPException(status_code=404, detail="Template not found")
    tpl.pop("_id", None)
    return {"template": tpl, "defaults": DEFAULT_TEMPLATE}


@router.post("/templates")
async def create_proposal_template(request: Request, current_user: dict = Depends(get_current_user)):
    """Create a new template — blank (from defaults) or cloned from `from_id`."""
    _require_admin(current_user)
    tdb = _tdb()
    await _ensure_templates(tdb)
    body = await request.json()
    name = (body.get("name") or "Untitled").strip() or "Untitled"
    from_id = body.get("from_id")
    base = DEFAULT_TEMPLATE
    if from_id:
        src = await get_template_by_id(tdb, from_id)
        if src:
            base = src
    doc = _make_template_doc(name, base, is_default=False)
    await tdb.proposal_templates.insert_one(dict(doc))
    doc.pop("_id", None)
    return {"template": doc}


@router.post("/templates/{template_id}/duplicate")
async def duplicate_proposal_template(template_id: str, current_user: dict = Depends(get_current_user)):
    _require_admin(current_user)
    tdb = _tdb()
    src = await get_template_by_id(tdb, template_id)
    if not src:
        raise HTTPException(status_code=404, detail="Template not found")
    doc = _make_template_doc(f"{src.get('name', 'Template')} copy", src, is_default=False)
    await tdb.proposal_templates.insert_one(dict(doc))
    doc.pop("_id", None)
    return {"template": doc}


@router.put("/templates/{template_id}")
async def update_proposal_template(template_id: str, request: Request, current_user: dict = Depends(get_current_user)):
    _require_admin(current_user)
    tdb = _tdb()
    existing = await get_template_by_id(tdb, template_id)
    if not existing:
        raise HTTPException(status_code=404, detail="Template not found")
    body = await request.json()
    payload = body.get("template", body) or {}
    import copy as _copy
    update = {k: _copy.deepcopy(payload[k]) for k in CONTENT_KEYS if k in payload}
    if payload.get("name"):
        update["name"] = str(payload["name"]).strip()
    update["updated_at"] = _now_iso()
    await tdb.proposal_templates.update_one({"id": template_id}, {"$set": update})
    tpl = await get_template_by_id(tdb, template_id)
    tpl.pop("_id", None)
    return {"template": tpl}


@router.post("/templates/{template_id}/default")
async def set_default_proposal_template(template_id: str, current_user: dict = Depends(get_current_user)):
    _require_admin(current_user)
    tdb = _tdb()
    existing = await get_template_by_id(tdb, template_id)
    if not existing:
        raise HTTPException(status_code=404, detail="Template not found")
    await tdb.proposal_templates.update_many({}, {"$set": {"is_default": False}})
    await tdb.proposal_templates.update_one({"id": template_id}, {"$set": {"is_default": True}})
    return {"ok": True, "default_id": template_id}


@router.delete("/templates/{template_id}")
async def delete_proposal_template(template_id: str, current_user: dict = Depends(get_current_user)):
    _require_admin(current_user)
    tdb = _tdb()
    tpls = await list_templates(tdb)
    if len(tpls) <= 1:
        raise HTTPException(status_code=400, detail="You must keep at least one template")
    target = next((t for t in tpls if t.get("id") == template_id), None)
    if not target:
        raise HTTPException(status_code=404, detail="Template not found")
    await tdb.proposal_templates.delete_one({"id": template_id})
    if target.get("is_default"):
        remaining = [t for t in tpls if t.get("id") != template_id]
        if remaining:
            await tdb.proposal_templates.update_one({"id": remaining[0]["id"]}, {"$set": {"is_default": True}})
    return {"ok": True}


# ── Per-template logo ────────────────────────────────────────────────────────
@router.post("/templates/{template_id}/logo")
async def upload_template_logo(template_id: str, file: UploadFile = File(...), current_user: dict = Depends(get_current_user)):
    _require_admin(current_user)
    if file.content_type not in ALLOWED_LOGO_TYPES:
        raise HTTPException(status_code=400, detail="Logo must be PNG, JPG or WebP")
    data = await file.read()
    if len(data) > MAX_LOGO_SIZE:
        raise HTTPException(status_code=400, detail="Logo must be under 2 MB")
    tdb = _tdb()
    tpl = await get_template_by_id(tdb, template_id)
    if not tpl:
        raise HTTPException(status_code=404, detail="Template not found")
    b64 = base64.b64encode(data).decode("utf-8")
    company = {**(tpl.get("company") or {}), "logo_data": b64, "logo_content_type": file.content_type}
    await tdb.proposal_templates.update_one({"id": template_id}, {"$set": {"company": company, "updated_at": _now_iso()}})
    return {"logo_data_url": f"data:{file.content_type};base64,{b64}"}


@router.delete("/templates/{template_id}/logo")
async def delete_template_logo(template_id: str, current_user: dict = Depends(get_current_user)):
    _require_admin(current_user)
    tdb = _tdb()
    tpl = await get_template_by_id(tdb, template_id)
    if not tpl:
        raise HTTPException(status_code=404, detail="Template not found")
    company = {**(tpl.get("company") or {}), "logo_data": None, "logo_content_type": None}
    await tdb.proposal_templates.update_one({"id": template_id}, {"$set": {"company": company}})
    return {"ok": True}
