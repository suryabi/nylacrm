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


def _now() -> str:
    return datetime.now(timezone.utc).isoformat()


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
    source_type: Optional[str] = None
    source_id: Optional[str] = None
    source_label: Optional[str] = None


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

    try:
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
        "title": body.title or "Untitled deck",
        "status": "pending",
        "gamma_url": None,
        "export_url": None,
        "num_cards": body.num_cards,
        "theme_id": body.theme_id,
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
