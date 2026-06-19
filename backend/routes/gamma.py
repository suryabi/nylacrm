"""
Gamma deck generator.

Build presentation-ready text from CRM data (Lead / Account) or free-form input,
send it to the Gamma Generate API, and track the async job + result (gammaUrl +
PDF exportUrl) per tenant.

Routes (mounted under /api/gamma)
  GET    /themes                     → workspace themes (for theme picker)
  POST   /draft                      → auto-build editable draft text from a Lead/Account
  POST   /generations                → start a generation, persist job
  GET    /generations                → list this tenant's generations (history)
  GET    /generations/{id}           → poll status (proxies Gamma, updates job)
"""
import os
import re
import uuid
from datetime import datetime, timezone
from typing import List, Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from motor.motor_asyncio import AsyncIOMotorClient
from pydantic import BaseModel, Field

from deps import get_current_user
from core.tenant import get_current_tenant_id
from services import gamma_service

router = APIRouter(prefix="/gamma", tags=["Gamma Generator"])

_client = AsyncIOMotorClient(os.environ["MONGO_URL"])
_db = _client[os.environ["DB_NAME"]]

ADMIN_ROLES = {"ceo", "admin", "system admin"}


def _now() -> str:
    return datetime.now(timezone.utc).isoformat()


def _is_admin(user: dict) -> bool:
    return (user.get("role") or "").strip().lower() in ADMIN_ROLES


def _extract_gamma_id(value: str) -> str:
    """Accept a raw Gamma ID or a full deck URL and return the Gamma ID."""
    s = (value or "").strip()
    m = re.search(r"g_[A-Za-z0-9]+", s)
    if m:
        return m.group(0)
    if s.startswith("http"):
        seg = s.rstrip("/").split("/")[-1].split("?")[0]
        return seg.split("-")[-1] if "-" in seg else seg
    return s


# ── Schemas ──────────────────────────────────────────────────────────────
class DraftRequest(BaseModel):
    source_type: str  # 'lead' | 'account'
    source_id: str


class GenerateRequest(BaseModel):
    title: Optional[str] = None
    input_text: str = Field(..., min_length=1)
    num_cards: int = Field(10, ge=1, le=60)
    text_mode: str = "generate"          # generate | condense | preserve
    theme_id: Optional[str] = None
    template_id: Optional[str] = None    # CRM gamma_templates.id → use from-template
    source_type: Optional[str] = None
    source_id: Optional[str] = None
    source_label: Optional[str] = None


class TemplateCreate(BaseModel):
    name: str = Field(..., min_length=1, max_length=120)
    gamma_id_or_url: str = Field(..., min_length=1)
    description: Optional[str] = Field(None, max_length=500)


class TemplateUpdate(BaseModel):
    name: Optional[str] = None
    gamma_id_or_url: Optional[str] = None
    description: Optional[str] = None


# ── Draft builders ────────────────────────────────────────────────────────
def _line(label: str, value) -> str:
    return f"{label}: {value}" if value not in (None, "", []) else ""


def _build_lead_draft(lead: dict) -> tuple[str, str]:
    company = lead.get("company") or "Prospect"
    title = f"Sales Proposal — {company}"
    parts = [
        f"# Sales Proposal for {company}",
        "",
        "## About the Prospect",
        _line("Company", company),
        _line("Primary Contact", lead.get("name") or lead.get("contact_person")),
        _line("Location", ", ".join([x for x in [lead.get("city"), lead.get("state"), lead.get("country")] if x])),
        _line("Region", lead.get("region")),
        _line("Lead source", lead.get("source")),
        _line("Priority", lead.get("priority")),
        _line("Estimated value", lead.get("estimated_value")),
        "",
        "## Requirements & Notes",
        lead.get("notes") or "Capture the prospect's key requirements, pain points and goals here.",
        "",
        "## Why Nyla Air & Water",
        "- Premium, reliable beverage & water supply tailored to your needs",
        "- Strong distribution and on-time delivery",
        "- Competitive, transparent pricing",
        "",
        "## Proposed Next Steps",
        "- Align on product mix and volumes",
        "- Finalise commercials and onboarding timeline",
        "- Kick off pilot / first order",
    ]
    return title, "\n".join([p for p in parts if p is not None])


def _build_account_draft(account: dict) -> tuple[str, str]:
    name = account.get("account_name") or "Account"
    title = f"Business Review — {name}"
    parts = [
        f"# Business Review for {name}",
        "",
        "## Account Overview",
        _line("Account", name),
        _line("Type", account.get("account_type") or account.get("category")),
        _line("Primary Contact", account.get("contact_name")),
        _line("Location", ", ".join([x for x in [account.get("city"), account.get("state")] if x])),
        _line("Territory", account.get("territory")),
        _line("Sales Owner", account.get("sales_owner_name")),
        _line("Status", account.get("status")),
        "",
        "## Commercial Performance",
        _line("Total invoices", account.get("invoice_count")),
        _line("Gross invoice value", account.get("total_gross_invoice_value")),
        _line("Net invoice value", account.get("total_net_invoice_value")),
        _line("Outstanding balance", account.get("total_outstanding") or account.get("outstanding_balance")),
        _line("Overdue amount", account.get("overdue_amount")),
        _line("Last invoice date", account.get("last_invoice_date")),
        _line("Payment terms", account.get("payment_terms_label")),
        "",
        "## Highlights & Wins",
        "- Summarise key achievements and growth in the period",
        "",
        "## Opportunities & Action Plan",
        "- Identify upsell / cross-sell opportunities",
        "- Address any service or payment concerns",
        "- Agree next-quarter goals",
    ]
    return title, "\n".join([p for p in parts if p is not None])


# ── Endpoints ──────────────────────────────────────────────────────────────
@router.get("/themes")
async def get_themes(current_user: dict = Depends(get_current_user)):
    try:
        themes = await gamma_service.list_themes()
    except Exception as exc:
        raise HTTPException(status_code=502, detail=f"Gamma themes error: {exc}")
    # return a lightweight list
    return {"themes": [{"id": t.get("id"), "name": t.get("name")} for t in themes]}


# ── Template registry (admin-managed) ──────────────────────────────────────
@router.get("/templates")
async def list_templates(current_user: dict = Depends(get_current_user)):
    tenant_id = get_current_tenant_id()
    rows = await _db.gamma_templates.find({"tenant_id": tenant_id}, {"_id": 0}).sort("name", 1).to_list(200)
    return {"templates": rows, "can_manage": _is_admin(current_user)}


@router.post("/templates")
async def create_template(body: TemplateCreate, current_user: dict = Depends(get_current_user)):
    if not _is_admin(current_user):
        raise HTTPException(status_code=403, detail="Only admins can manage Gamma templates")
    tenant_id = get_current_tenant_id()
    gamma_id = _extract_gamma_id(body.gamma_id_or_url)
    if not gamma_id:
        raise HTTPException(status_code=400, detail="Could not read a Gamma ID from that value")
    now = _now()
    doc = {
        "id": str(uuid.uuid4()),
        "tenant_id": tenant_id,
        "name": body.name.strip(),
        "gamma_id": gamma_id,
        "description": (body.description or "").strip() or None,
        "created_by": current_user.get("id"),
        "created_by_name": current_user.get("name"),
        "created_at": now,
        "updated_at": now,
    }
    await _db.gamma_templates.insert_one(doc)
    doc.pop("_id", None)
    return doc


@router.put("/templates/{template_id}")
async def update_template(template_id: str, body: TemplateUpdate, current_user: dict = Depends(get_current_user)):
    if not _is_admin(current_user):
        raise HTTPException(status_code=403, detail="Only admins can manage Gamma templates")
    tenant_id = get_current_tenant_id()
    updates = {"updated_at": _now()}
    if body.name is not None:
        updates["name"] = body.name.strip()
    if body.gamma_id_or_url is not None:
        updates["gamma_id"] = _extract_gamma_id(body.gamma_id_or_url)
    if body.description is not None:
        updates["description"] = body.description.strip() or None
    res = await _db.gamma_templates.update_one(
        {"id": template_id, "tenant_id": tenant_id}, {"$set": updates}
    )
    if res.matched_count == 0:
        raise HTTPException(status_code=404, detail="Template not found")
    doc = await _db.gamma_templates.find_one({"id": template_id, "tenant_id": tenant_id}, {"_id": 0})
    return doc


@router.delete("/templates/{template_id}")
async def delete_template(template_id: str, current_user: dict = Depends(get_current_user)):
    if not _is_admin(current_user):
        raise HTTPException(status_code=403, detail="Only admins can manage Gamma templates")
    tenant_id = get_current_tenant_id()
    res = await _db.gamma_templates.delete_one({"id": template_id, "tenant_id": tenant_id})
    if res.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Template not found")
    return {"message": "Template deleted"}


@router.post("/draft")
async def build_draft(body: DraftRequest, current_user: dict = Depends(get_current_user)):
    tenant_id = get_current_tenant_id()
    if body.source_type == "lead":
        doc = await _db.leads.find_one({"id": body.source_id, "tenant_id": tenant_id}, {"_id": 0})
        if not doc:
            raise HTTPException(status_code=404, detail="Lead not found")
        title, text = _build_lead_draft(doc)
        return {"title": title, "input_text": text, "source_label": doc.get("company")}
    if body.source_type == "account":
        doc = await _db.accounts.find_one({"id": body.source_id, "tenant_id": tenant_id}, {"_id": 0})
        if not doc:
            raise HTTPException(status_code=404, detail="Account not found")
        title, text = _build_account_draft(doc)
        return {"title": title, "input_text": text, "source_label": doc.get("account_name")}
    raise HTTPException(status_code=400, detail="Invalid source_type")


@router.post("/generations")
async def start_generation(body: GenerateRequest, current_user: dict = Depends(get_current_user)):
    tenant_id = get_current_tenant_id()

    template_doc = None
    if body.template_id:
        template_doc = await _db.gamma_templates.find_one(
            {"id": body.template_id, "tenant_id": tenant_id}, {"_id": 0}
        )
        if not template_doc:
            raise HTTPException(status_code=404, detail="Template not found")

    try:
        if template_doc:
            # Create-from-template: remix the chosen Gamma using our content as the prompt.
            payload = {
                "gammaId": template_doc["gamma_id"],
                "prompt": body.input_text,
                "exportAs": "pdf",
            }
            if body.theme_id:
                payload["themeId"] = body.theme_id
            result = await gamma_service.create_from_template(payload)
        else:
            payload = {
                "inputText": body.input_text,
                "format": "presentation",
                "textMode": body.text_mode,
                "numCards": body.num_cards,
                "exportAs": "pdf",
            }
            if body.title:
                payload["title"] = body.title
            if body.theme_id:
                payload["themeId"] = body.theme_id
            result = await gamma_service.create_generation(payload)
    except Exception as exc:
        raise HTTPException(status_code=502, detail=f"Gamma generation error: {exc}")

    generation_id = result.get("generationId")
    if not generation_id:
        raise HTTPException(status_code=502, detail="Gamma did not return a generationId")

    now = _now()
    job = {
        "id": str(uuid.uuid4()),
        "tenant_id": tenant_id,
        "gamma_generation_id": generation_id,
        "title": body.title or (f"From template: {template_doc['name']}" if template_doc else "Untitled deck"),
        "status": "pending",
        "gamma_url": None,
        "export_url": None,
        "num_cards": body.num_cards,
        "theme_id": body.theme_id,
        "template_id": body.template_id,
        "template_name": template_doc["name"] if template_doc else None,
        "source_type": body.source_type,
        "source_id": body.source_id,
        "source_label": body.source_label,
        "credits_deducted": None,
        "error_message": None,
        "created_by": current_user.get("id"),
        "created_by_name": current_user.get("name"),
        "created_at": now,
        "updated_at": now,
    }
    await _db.gamma_generations.insert_one(job)
    job.pop("_id", None)
    return job


@router.get("/generations")
async def list_generations(
    source_type: Optional[str] = None,
    source_id: Optional[str] = None,
    limit: int = Query(20, ge=1, le=100),
    current_user: dict = Depends(get_current_user),
):
    tenant_id = get_current_tenant_id()
    query = {"tenant_id": tenant_id}
    if source_type and source_id:
        query["source_type"] = source_type
        query["source_id"] = source_id
    rows = await _db.gamma_generations.find(query, {"_id": 0}).sort("created_at", -1).limit(limit).to_list(limit)
    return {"generations": rows}


@router.get("/generations/{job_id}")
async def poll_generation(job_id: str, current_user: dict = Depends(get_current_user)):
    tenant_id = get_current_tenant_id()
    job = await _db.gamma_generations.find_one({"id": job_id, "tenant_id": tenant_id}, {"_id": 0})
    if not job:
        raise HTTPException(status_code=404, detail="Generation not found")

    # Terminal states — no need to re-query Gamma.
    if job["status"] in ("completed", "failed"):
        return job

    try:
        g = await gamma_service.get_generation_status(job["gamma_generation_id"])
    except Exception as exc:
        return {**job, "poll_error": str(exc)}

    raw_status = (g.get("status") or "").lower()
    gamma_url = g.get("gammaUrl") or job.get("gamma_url")
    export_url = g.get("exportUrl") or job.get("export_url")
    credits = (g.get("credits") or {}).get("deducted") if isinstance(g.get("credits"), dict) else None

    updates = {"updated_at": _now()}
    if gamma_url:
        updates["gamma_url"] = gamma_url
    if export_url:
        updates["export_url"] = export_url
    if credits is not None:
        updates["credits_deducted"] = credits

    if raw_status == "failed":
        updates["status"] = "failed"
        updates["error_message"] = str(g.get("error") or "Generation failed")
    elif raw_status == "completed":
        # The PDF export URL can lag a moment behind the gammaUrl — keep the job
        # in a non-terminal 'finalizing' state until the export link is present.
        if export_url:
            updates["status"] = "completed"
        else:
            updates["status"] = "finalizing"
    else:
        updates["status"] = "processing"

    await _db.gamma_generations.update_one(
        {"id": job_id, "tenant_id": tenant_id}, {"$set": updates}
    )
    return {**job, **updates}
