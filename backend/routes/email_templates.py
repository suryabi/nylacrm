"""
Email templates — user-managed, optionally public, with auto-attached CRM
documents and {{placeholder}} substitution.

Routes
------
GET    /api/email-templates                          → list (own + public)
POST   /api/email-templates                          → create
PUT    /api/email-templates/{template_id}            → update (owner only)
DELETE /api/email-templates/{template_id}            → delete (owner only)
POST   /api/email-templates/{template_id}/clone      → clone a public template
POST   /api/email-templates/{template_id}/render     → render with an entity
                                                       (returns rendered subject,
                                                       body_html and resolved
                                                       CRM document attachments)
"""

import os
import re
import uuid
from datetime import datetime, timezone
from typing import List, Optional

from fastapi import APIRouter, Depends, HTTPException
from motor.motor_asyncio import AsyncIOMotorClient
from pydantic import BaseModel, Field

from deps import get_current_user
from core.tenant import get_current_tenant_id

router = APIRouter(prefix="/email-templates", tags=["Email Templates"])

_client = AsyncIOMotorClient(os.environ["MONGO_URL"])
_db = _client[os.environ["DB_NAME"]]


# ── Schemas ───────────────────────────────────────────────────────────────
class EmailTemplateBase(BaseModel):
    name: str = Field(..., min_length=1, max_length=120)
    subject: str = Field("", max_length=500)
    body_html: str = ""
    # Pre-configured recipients. Comma-separated; may contain {{variables}}
    # (e.g. {{contact_email}}) which are resolved on render.
    to_emails: str = Field("", max_length=1000)
    cc_emails: str = Field("", max_length=1000)
    bcc_emails: str = Field("", max_length=1000)
    is_public: bool = False
    crm_document_ids: List[str] = Field(default_factory=list)


class EmailTemplateCreate(EmailTemplateBase):
    pass


class EmailTemplateUpdate(BaseModel):
    name: Optional[str] = Field(None, min_length=1, max_length=120)
    subject: Optional[str] = Field(None, max_length=500)
    body_html: Optional[str] = None
    to_emails: Optional[str] = Field(None, max_length=1000)
    cc_emails: Optional[str] = Field(None, max_length=1000)
    bcc_emails: Optional[str] = Field(None, max_length=1000)
    is_public: Optional[bool] = None
    crm_document_ids: Optional[List[str]] = None


class RenderRequest(BaseModel):
    entity_type: Optional[str] = None   # 'lead' | 'account' | 'contact' | None
    entity_id: Optional[str] = None


# ── Helpers ───────────────────────────────────────────────────────────────
_PLACEHOLDER_RE = re.compile(r"\{\{\s*([a-zA-Z0-9_.]+)\s*\}\}")


def _fmt_addr(a) -> str:
    """Join a structured address dict into a single readable line."""
    if not a or not isinstance(a, dict):
        return ""
    return ", ".join(
        str(a.get(k)) for k in ("address_line1", "address_line2", "landmark", "city", "state", "pincode") if a.get(k)
    )


# System (built-in) templates seeded per tenant so they always appear in the
# Templates picker. Keyed by `system_key` (idempotent); owned by "system" so no
# individual user can edit/delete them (they can clone-and-edit instead).
_ACCOUNT_DETAILS_BODY = (
    "<p>Hi,</p>"
    "<p>Please find below the account details for <strong>{{account_name}}</strong> "
    "(Account Reference: <strong>{{account_id}}</strong>).</p>"
    "<p><strong>Tax Details</strong></p>"
    "<ul><li><strong>GST Number:</strong> {{gst_number}}</li>"
    "<li><strong>PAN:</strong> {{pan_number}}</li></ul>"
    "<p><strong>Addresses</strong></p>"
    "<ul><li><strong>Billing Address:</strong> {{billing_address}}</li>"
    "<li><strong>Delivery Address:</strong> {{delivery_address}}</li></ul>"
    "<p><strong>Contacts</strong></p>"
    "<ul><li><strong>Delivery Contact:</strong> {{delivery_contact}}</li>"
    "<li><strong>Nyla Sales Contact:</strong> {{nyla_sales_contact}}</li></ul>"
    "<p>For any questions regarding this account, please include the Account Reference "
    "<strong>{{account_id}}</strong> in the subject line for future correspondence.</p>"
    "<p>Best regards,</p>"
    "<p>{{my_name}}<br>{{my_phone}}</p>"
)

_SYSTEM_TEMPLATES = [
    {
        "system_key": "account_details",
        "name": "Account Details",
        "subject": "Account Details — {{account_name}} · {{account_id}}",
        "body_html": _ACCOUNT_DETAILS_BODY,
    },
]


async def _ensure_system_templates(tenant_id: str) -> None:
    """Idempotently seed built-in public templates for this tenant."""
    for t in _SYSTEM_TEMPLATES:
        existing = await _db.email_templates.find_one(
            {"tenant_id": tenant_id, "system_key": t["system_key"]}, {"_id": 0, "id": 1}
        )
        if existing:
            continue
        now = datetime.now(timezone.utc).isoformat()
        await _db.email_templates.insert_one({
            "id": str(uuid.uuid4()),
            "tenant_id": tenant_id,
            "owner_id": "system",
            "owner_name": "System",
            "system_key": t["system_key"],
            "name": t["name"],
            "subject": t["subject"],
            "body_html": t["body_html"],
            "to_emails": "",
            "cc_emails": "",
            "bcc_emails": "",
            "is_public": True,
            "crm_document_ids": [],
            "created_at": now,
            "updated_at": now,
        })


async def _resolve_variables(
    tenant_id: str,
    current_user: dict,
    entity_type: Optional[str],
    entity_id: Optional[str],
) -> dict:
    """Build the variable map for {{placeholder}} substitution.

    Always includes `my_name` / `my_email` from the current user. When a lead /
    account / contact id is supplied, that entity's name and address fields are
    folded in as well. Missing variables resolve to empty strings — never raise
    — so a template author doesn't have to worry about typos breaking a send.
    """
    vars_map = {
        "my_name": current_user.get("name", ""),
        "my_email": current_user.get("email", ""),
        "my_phone": current_user.get("phone", ""),
        # Today's date in a human-friendly format. Useful for "Hi {{contact_name}}, on {{today}} …".
        "today": datetime.now(timezone.utc).strftime("%-d %b %Y"),
    }
    if not (entity_type and entity_id):
        return vars_map

    collection_map = {
        "lead": "leads",
        "account": "accounts",
        "contact": "contacts",
    }
    coll = collection_map.get(entity_type)
    if not coll:
        return vars_map

    doc = await _db[coll].find_one(
        {"id": entity_id, "tenant_id": tenant_id},
        {"_id": 0},
    )
    if not doc:
        return vars_map

    # Shared
    vars_map["city"] = doc.get("city") or doc.get("delivery_address", {}).get("city") or ""
    vars_map["state"] = doc.get("state") or doc.get("delivery_address", {}).get("state") or ""

    if entity_type == "lead":
        vars_map["contact_name"] = doc.get("contact_person") or ""
        vars_map["company"] = doc.get("company") or ""
        vars_map["lead_company"] = doc.get("company") or ""
        vars_map["lead_city"] = vars_map["city"]
        vars_map["contact_email"] = doc.get("email") or doc.get("contact_email") or ""
    elif entity_type == "account":
        vars_map["account_name"] = doc.get("account_name") or ""
        vars_map["account_id"] = doc.get("account_id") or ""
        vars_map["contact_name"] = doc.get("contact_name") or ""
        vars_map["company"] = doc.get("account_name") or ""
        vars_map["contact_email"] = doc.get("email") or doc.get("contact_email") or doc.get("delivery_contact_email") or ""
        vars_map["gst_number"] = doc.get("gst_number") or ""
        vars_map["pan_number"] = doc.get("pan_number") or ""
        # Billing address prefixed with the GST legal name (deduped).
        legal = (doc.get("gst_legal_name") or "").strip()
        billing = _fmt_addr(doc.get("billing_address"))
        if legal and billing and legal.lower() not in billing.lower():
            billing = f"{legal}, {billing}"
        elif not billing:
            billing = legal
        vars_map["billing_address"] = billing
        vars_map["delivery_address"] = _fmt_addr(doc.get("delivery_address"))
        vars_map["delivery_contact"] = " · ".join(
            [x for x in [doc.get("delivery_contact_name"), doc.get("delivery_contact_phone")] if x]
        )
        # Nyla sales contact = the assigned salesperson (name · phone).
        assigned = doc.get("assigned_to")
        if assigned:
            sp = await _db.users.find_one({"id": assigned}, {"_id": 0, "name": 1, "phone": 1})
            if sp:
                vars_map["nyla_sales_contact"] = " · ".join(
                    [x for x in [sp.get("name"), sp.get("phone")] if x]
                )
    elif entity_type == "contact":
        vars_map["contact_name"] = doc.get("name") or doc.get("full_name") or ""
        vars_map["contact_email"] = doc.get("email") or ""
        # Contacts may also reference an account.
        if doc.get("account_name"):
            vars_map["account_name"] = doc["account_name"]
    return vars_map


def _substitute(text: str, vars_map: dict) -> str:
    """Replace every {{var}} with the matching value from vars_map. Unknown
    placeholders collapse to an empty string."""
    if not text:
        return text or ""
    return _PLACEHOLDER_RE.sub(lambda m: str(vars_map.get(m.group(1), "")), text)


def _to_public(doc: dict, current_user_id: str) -> dict:
    """Strip mongo internals and stamp `is_mine` for the UI."""
    out = {k: v for k, v in doc.items() if k != "_id"}
    out["is_mine"] = doc.get("owner_id") == current_user_id
    return out


async def _resolve_attachments(tenant_id: str, ids: List[str]) -> List[dict]:
    """Fetch CRM document headers (no file_data) for the given ids."""
    if not ids:
        return []
    docs = await _db.documents.find(
        {"id": {"$in": ids}, "tenant_id": tenant_id},
        {"_id": 0, "id": 1, "name": 1, "file_size": 1, "content_type": 1},
    ).to_list(len(ids) + 5)
    return docs


# ── Routes ────────────────────────────────────────────────────────────────
@router.get("")
async def list_templates(current_user: dict = Depends(get_current_user)):
    """Return all templates visible to the current user (their own + every
    public template across the tenant). Each row carries `is_mine` so the UI
    can render edit / delete actions only on owned rows."""
    tenant_id = get_current_tenant_id()
    uid = current_user["id"]
    await _ensure_system_templates(tenant_id)
    cursor = _db.email_templates.find(
        {
            "tenant_id": tenant_id,
            "$or": [
                {"owner_id": uid},
                {"is_public": True},
            ],
        },
        {"_id": 0},
    ).sort("updated_at", -1)
    rows = await cursor.to_list(500)
    return [_to_public(r, uid) for r in rows]


@router.post("")
async def create_template(
    payload: EmailTemplateCreate,
    current_user: dict = Depends(get_current_user),
):
    tenant_id = get_current_tenant_id()
    now = datetime.now(timezone.utc).isoformat()
    doc = {
        "id": str(uuid.uuid4()),
        "tenant_id": tenant_id,
        "owner_id": current_user["id"],
        "owner_name": current_user.get("name", ""),
        "name": payload.name.strip(),
        "subject": payload.subject or "",
        "body_html": payload.body_html or "",
        "to_emails": payload.to_emails or "",
        "cc_emails": payload.cc_emails or "",
        "bcc_emails": payload.bcc_emails or "",
        "is_public": bool(payload.is_public),
        "crm_document_ids": list(payload.crm_document_ids or []),
        "created_at": now,
        "updated_at": now,
    }
    await _db.email_templates.insert_one(doc)
    return _to_public(doc, current_user["id"])


@router.put("/{template_id}")
async def update_template(
    template_id: str,
    payload: EmailTemplateUpdate,
    current_user: dict = Depends(get_current_user),
):
    tenant_id = get_current_tenant_id()
    existing = await _db.email_templates.find_one(
        {"id": template_id, "tenant_id": tenant_id},
        {"_id": 0},
    )
    if not existing:
        raise HTTPException(status_code=404, detail="Template not found")
    if existing["owner_id"] != current_user["id"]:
        raise HTTPException(status_code=403, detail="Only the template owner can edit it")

    update = {k: v for k, v in payload.model_dump().items() if v is not None}
    if "name" in update:
        update["name"] = update["name"].strip()
    update["updated_at"] = datetime.now(timezone.utc).isoformat()
    await _db.email_templates.update_one(
        {"id": template_id, "tenant_id": tenant_id},
        {"$set": update},
    )
    after = await _db.email_templates.find_one(
        {"id": template_id, "tenant_id": tenant_id},
        {"_id": 0},
    )
    return _to_public(after, current_user["id"])


@router.delete("/{template_id}")
async def delete_template(template_id: str, current_user: dict = Depends(get_current_user)):
    tenant_id = get_current_tenant_id()
    existing = await _db.email_templates.find_one(
        {"id": template_id, "tenant_id": tenant_id},
        {"_id": 0, "owner_id": 1},
    )
    if not existing:
        raise HTTPException(status_code=404, detail="Template not found")
    if existing["owner_id"] != current_user["id"]:
        raise HTTPException(status_code=403, detail="Only the template owner can delete it")
    await _db.email_templates.delete_one({"id": template_id, "tenant_id": tenant_id})
    return {"ok": True}


@router.post("/{template_id}/clone")
async def clone_template(template_id: str, current_user: dict = Depends(get_current_user)):
    """Copy a public template into the current user's private templates so they
    can tweak it without affecting the original. The clone is always private."""
    tenant_id = get_current_tenant_id()
    src = await _db.email_templates.find_one(
        {"id": template_id, "tenant_id": tenant_id},
        {"_id": 0},
    )
    if not src:
        raise HTTPException(status_code=404, detail="Template not found")
    # Visibility check — owner can re-clone their own private templates too.
    if not src.get("is_public") and src.get("owner_id") != current_user["id"]:
        raise HTTPException(status_code=403, detail="This template isn't shared with you")

    now = datetime.now(timezone.utc).isoformat()
    doc = {
        "id": str(uuid.uuid4()),
        "tenant_id": tenant_id,
        "owner_id": current_user["id"],
        "owner_name": current_user.get("name", ""),
        "name": f"{src['name']} (copy)",
        "subject": src.get("subject", ""),
        "body_html": src.get("body_html", ""),
        "to_emails": src.get("to_emails", ""),
        "cc_emails": src.get("cc_emails", ""),
        "bcc_emails": src.get("bcc_emails", ""),
        "is_public": False,
        "crm_document_ids": list(src.get("crm_document_ids") or []),
        "created_at": now,
        "updated_at": now,
    }
    await _db.email_templates.insert_one(doc)
    return _to_public(doc, current_user["id"])


@router.post("/{template_id}/render")
async def render_template(
    template_id: str,
    payload: RenderRequest,
    current_user: dict = Depends(get_current_user),
):
    """Server-side render that substitutes {{placeholders}} from the supplied
    entity and resolves CRM document headers. The composer calls this on
    template selection so the user sees the already-filled subject/body and
    can untick any attachment they don't want."""
    tenant_id = get_current_tenant_id()
    tpl = await _db.email_templates.find_one(
        {"id": template_id, "tenant_id": tenant_id},
        {"_id": 0},
    )
    if not tpl:
        raise HTTPException(status_code=404, detail="Template not found")
    # Visibility check
    if not tpl.get("is_public") and tpl.get("owner_id") != current_user["id"]:
        raise HTTPException(status_code=403, detail="This template isn't shared with you")

    vars_map = await _resolve_variables(
        tenant_id, current_user, payload.entity_type, payload.entity_id,
    )
    attachments = await _resolve_attachments(tenant_id, tpl.get("crm_document_ids") or [])
    return {
        "id": tpl["id"],
        "name": tpl["name"],
        "subject": _substitute(tpl.get("subject", ""), vars_map),
        "body_html": _substitute(tpl.get("body_html", ""), vars_map),
        "to_emails": _substitute(tpl.get("to_emails", ""), vars_map),
        "cc_emails": _substitute(tpl.get("cc_emails", ""), vars_map),
        "bcc_emails": _substitute(tpl.get("bcc_emails", ""), vars_map),
        "crm_document_ids": tpl.get("crm_document_ids") or [],
        # Headers (no file_data) so the composer can render chips. The send
        # endpoint already accepts crm_document_ids and pulls the bytes itself.
        "attachments": attachments,
        # Echo back the variables we resolved so the UI can highlight unfilled ones.
        "variables_used": vars_map,
    }
