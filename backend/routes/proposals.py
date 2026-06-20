"""Proposal template routes — admin-editable boilerplate for lead proposals."""
import base64
from fastapi import APIRouter, Depends, HTTPException, Request, UploadFile, File
from datetime import datetime, timezone

from database import get_tenant_db
from deps import get_current_user
from services.proposal_pdf import get_or_seed_template, DEFAULT_TEMPLATE

router = APIRouter()

ADMIN_ROLES = {"CEO", "Admin", "System Admin"}
MAX_LOGO_SIZE = 2 * 1024 * 1024
ALLOWED_LOGO_TYPES = {"image/png", "image/jpeg", "image/jpg", "image/webp"}


def _tdb():
    return get_tenant_db()


@router.get("/template")
async def get_proposal_template(current_user: dict = Depends(get_current_user)):
    """Get the tenant's editable proposal template (seeds defaults if missing)."""
    tpl = await get_or_seed_template(_tdb())
    tpl.pop("_id", None)
    return {"template": tpl, "defaults": DEFAULT_TEMPLATE}


@router.put("/template")
async def update_proposal_template(request: Request, current_user: dict = Depends(get_current_user)):
    """Update the proposal template (admin only)."""
    if current_user.get("role") not in ADMIN_ROLES:
        raise HTTPException(status_code=403, detail="Only admins can edit the proposal template")
    body = await request.json()
    body.pop("_id", None)
    body.pop("defaults", None)
    payload = body.get("template", body)
    payload.pop("_id", None)
    payload["updated_at"] = datetime.now(timezone.utc).isoformat()
    tdb = _tdb()
    await tdb.proposal_templates.update_one({}, {"$set": payload}, upsert=True)
    tpl = await get_or_seed_template(tdb)
    tpl.pop("_id", None)
    return {"template": tpl}


@router.post("/template/logo")
async def upload_proposal_logo(file: UploadFile = File(...), current_user: dict = Depends(get_current_user)):
    """Upload the company logo used in the proposal header (admin only)."""
    if current_user.get("role") not in ADMIN_ROLES:
        raise HTTPException(status_code=403, detail="Only admins can upload the logo")
    if file.content_type not in ALLOWED_LOGO_TYPES:
        raise HTTPException(status_code=400, detail="Logo must be PNG, JPG or WebP")
    data = await file.read()
    if len(data) > MAX_LOGO_SIZE:
        raise HTTPException(status_code=400, detail="Logo must be under 2 MB")
    b64 = base64.b64encode(data).decode("utf-8")
    tdb = _tdb()
    tpl = await get_or_seed_template(tdb)
    company = {**(tpl.get("company") or {}), "logo_data": b64, "logo_content_type": file.content_type}
    await tdb.proposal_templates.update_one(
        {}, {"$set": {"company": company, "updated_at": datetime.now(timezone.utc).isoformat()}}, upsert=True
    )
    return {"logo_data_url": f"data:{file.content_type};base64,{b64}"}


@router.delete("/template/logo")
async def delete_proposal_logo(current_user: dict = Depends(get_current_user)):
    """Remove the uploaded logo (falls back to the default)."""
    if current_user.get("role") not in ADMIN_ROLES:
        raise HTTPException(status_code=403, detail="Only admins can change the logo")
    tdb = _tdb()
    tpl = await get_or_seed_template(tdb)
    company = {**(tpl.get("company") or {}), "logo_data": None, "logo_content_type": None}
    await tdb.proposal_templates.update_one({}, {"$set": {"company": company}}, upsert=True)
    return {"ok": True}

