"""Proposal template routes — admin-editable boilerplate for lead proposals."""
from fastapi import APIRouter, Depends, HTTPException, Request
from datetime import datetime, timezone

from database import get_tenant_db
from deps import get_current_user
from services.proposal_pdf import get_or_seed_template, DEFAULT_TEMPLATE

router = APIRouter()

ADMIN_ROLES = {"CEO", "Admin", "System Admin"}


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
    payload["updated_at"] = datetime.now(timezone.utc).isoformat()
    tdb = _tdb()
    await tdb.proposal_templates.update_one({}, {"$set": payload}, upsert=True)
    tpl = await get_or_seed_template(tdb)
    tpl.pop("_id", None)
    return {"template": tpl}
