"""Per-lead proposal routes — upload, auto-generate, customize, preview, review and share.

Extracted from the legacy server.py monolith. Helpers that still live in server.py
(approval tasks, PDF signature stamping, ApprovalType) are imported lazily inside the
handlers to avoid a circular import at module-load time.
"""
import os
import uuid
import base64
import asyncio
import logging
from datetime import datetime, timezone, timedelta
from typing import List, Optional

import resend
from fastapi import APIRouter, Depends, HTTPException, Request, UploadFile, File
from fastapi.responses import Response
from pydantic import BaseModel, Field, EmailStr

from database import get_tenant_db
from deps import get_current_user

router = APIRouter()


def get_tdb():
    return get_tenant_db()


# Roles that can approve/reject proposals
PROPOSAL_APPROVER_ROLES = ['CEO', 'Director', 'Vice President', 'National Sales Head']

# Proposal statuses
PROPOSAL_STATUSES = ['pending_review', 'changes_requested', 'revised', 'approved', 'rejected']

# Allowed file types for proposals
ALLOWED_PROPOSAL_TYPES = {
    'application/pdf': 'pdf',
    'application/msword': 'doc',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document': 'docx'
}

MAX_PROPOSAL_SIZE = 5 * 1024 * 1024  # 5 MB


class ProposalReviewComment(BaseModel):
    """Review comment on a proposal"""
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    reviewer_id: str
    reviewer_name: str
    action: str  # 'approved', 'rejected', 'changes_requested', 'comment'
    comment: str
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))


class LeadProposal(BaseModel):
    """Proposal document for a lead"""
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    lead_id: str
    file_name: str
    file_size: int
    content_type: str
    document_type: str  # 'pdf', 'doc', 'docx'
    file_data: str  # base64 encoded
    status: str = 'pending_review'  # pending_review, changes_requested, revised, approved, rejected
    uploaded_by: str
    uploaded_by_name: str
    uploaded_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    reviewed_by: Optional[str] = None
    reviewed_by_name: Optional[str] = None
    reviewed_at: Optional[datetime] = None
    review_comments: List[dict] = []
    version: int = 1


def can_approve_proposal(role: str) -> bool:
    """Check if user role can approve/reject proposals"""
    return role in PROPOSAL_APPROVER_ROLES


@router.get("/leads/{lead_id}/proposal")
async def get_lead_proposal(lead_id: str, current_user: dict = Depends(get_current_user)):
    """Get the current proposal for a lead"""
    lead = await get_tdb().leads.find_one({'id': lead_id})
    if not lead:
        raise HTTPException(status_code=404, detail='Lead not found')

    proposal = await get_tdb().lead_proposals.find_one(
        {'lead_id': lead_id},
        {'_id': 0, 'file_data': 0}
    )

    if not proposal:
        return {'proposal': None}

    return {'proposal': proposal}


@router.post("/leads/{lead_id}/proposal")
async def upload_lead_proposal(
    lead_id: str,
    file: UploadFile = File(...),
    current_user: dict = Depends(get_current_user)
):
    """Upload a proposal for a lead (replaces existing)"""
    from server import create_approval_task, ApprovalType

    lead = await get_tdb().leads.find_one({'id': lead_id})
    if not lead:
        raise HTTPException(status_code=404, detail='Lead not found')

    if file.content_type not in ALLOWED_PROPOSAL_TYPES:
        raise HTTPException(
            status_code=400,
            detail='Only PDF and DOC/DOCX files are allowed for proposals'
        )

    contents = await file.read()
    if len(contents) > MAX_PROPOSAL_SIZE:
        raise HTTPException(
            status_code=400,
            detail=f'File size exceeds 5 MB limit. Your file is {round(len(contents) / (1024*1024), 2)} MB'
        )

    existing = await get_tdb().lead_proposals.find_one({'lead_id': lead_id})
    version = 1

    if existing:
        version = existing.get('version', 1) + 1
        await get_tdb().lead_proposals.delete_one({'lead_id': lead_id})

    status = 'revised' if existing and existing.get('status') == 'changes_requested' else 'pending_review'

    proposal = LeadProposal(
        lead_id=lead_id,
        file_name=file.filename,
        file_size=len(contents),
        content_type=file.content_type,
        document_type=ALLOWED_PROPOSAL_TYPES[file.content_type],
        file_data=base64.b64encode(contents).decode('utf-8'),
        status=status,
        uploaded_by=current_user['id'],
        uploaded_by_name=current_user['name'],
        version=version
    )

    doc = proposal.model_dump()
    doc['uploaded_at'] = doc['uploaded_at'].isoformat()

    await get_tdb().lead_proposals.insert_one(doc)

    reports_to = current_user.get('reports_to')
    if reports_to:
        company_name = lead.get('company', 'Unknown Company')
        await create_approval_task(
            approval_type=ApprovalType.PROPOSAL,
            requester_id=current_user['id'],
            requester_name=current_user.get('name', 'Unknown'),
            approver_id=reports_to,
            details=f"{company_name} - {file.filename}",
            description=f"Proposal uploaded by {current_user.get('name')} for review.\n\nLead: {company_name}\nFile: {file.filename}\nVersion: {version}",
            reference_id=lead_id,
            reference_type='proposal',
            lead_id=lead_id
        )

    response = {k: v for k, v in doc.items() if k not in ['_id', 'file_data']}

    return {'proposal': response, 'message': f'Proposal v{version} uploaded successfully'}


@router.get("/leads/{lead_id}/proposal/customization")
async def get_lead_proposal_customization(lead_id: str, current_user: dict = Depends(get_current_user)):
    """Return the chosen/default proposal template, the list of available templates,
    and any per-lead override so the customize dialog can pre-fill content."""
    from services.proposal_pdf import list_templates, resolve_template

    lead = await get_tdb().leads.find_one({'id': lead_id})
    if not lead:
        raise HTTPException(status_code=404, detail='Lead not found')
    tpls = await list_templates(get_tdb())
    template_id = lead.get('proposal_template_id')
    template = await resolve_template(get_tdb(), template_id)
    if not template_id or not any(t.get('id') == template_id for t in tpls):
        template_id = template.get('id')
    override = lead.get('proposal_override')
    return {'template': template, 'template_id': template_id,
            'templates': [{'id': t.get('id'), 'name': t.get('name'), 'is_default': bool(t.get('is_default'))} for t in tpls],
            'override': override, 'has_override': bool(override),
            'company_name': lead.get('company')}


@router.put("/leads/{lead_id}/proposal/customization")
async def save_lead_proposal_customization(lead_id: str, request: Request, current_user: dict = Depends(get_current_user)):
    """Save the per-lead template choice + override (text content + section set/order)."""
    lead = await get_tdb().leads.find_one({'id': lead_id})
    if not lead:
        raise HTTPException(status_code=404, detail='Lead not found')
    body = await request.json()
    update = {'proposal_override': body.get('override')}
    if 'template_id' in body:
        update['proposal_template_id'] = body.get('template_id')
    await get_tdb().leads.update_one({'id': lead_id}, {'$set': update})
    return {'ok': True, 'has_override': bool(body.get('override'))}


@router.delete("/leads/{lead_id}/proposal/customization")
async def reset_lead_proposal_customization(lead_id: str, current_user: dict = Depends(get_current_user)):
    """Remove the per-lead override + template choice so the lead falls back to the default template."""
    res = await get_tdb().leads.update_one(
        {'id': lead_id}, {'$unset': {'proposal_override': '', 'proposal_template_id': ''}})
    if not res.matched_count:
        raise HTTPException(status_code=404, detail='Lead not found')
    return {'ok': True}


@router.post("/leads/{lead_id}/proposal/preview")
async def preview_lead_proposal(lead_id: str, request: Request, current_user: dict = Depends(get_current_user)):
    """Build a live PDF preview for the lead using the supplied (unsaved) template_id +
    override if provided, else the saved values / default template. Returns raw PDF bytes."""
    from services.proposal_pdf import resolve_template, build_pricing_rows, build_proposal_pdf, merge_override

    lead = await get_tdb().leads.find_one({'id': lead_id})
    if not lead:
        raise HTTPException(status_code=404, detail='Lead not found')
    body = {}
    try:
        body = await request.json()
    except Exception:
        body = {}
    override = body.get('override', lead.get('proposal_override'))
    template_id = body.get('template_id', lead.get('proposal_template_id'))
    template = await resolve_template(get_tdb(), template_id)
    template = merge_override(template, override)
    pricing_rows = await build_pricing_rows(get_tdb(), lead)
    pdf_bytes = build_proposal_pdf(lead, template, pricing_rows)
    return Response(content=pdf_bytes, media_type='application/pdf',
                    headers={'Content-Disposition': 'inline; filename="proposal-preview.pdf"'})


@router.post("/leads/{lead_id}/proposal/generate")
async def generate_lead_proposal(lead_id: str, current_user: dict = Depends(get_current_user)):
    """Auto-generate a branded proposal PDF from the lead (company name + proposed
    SKUs/pricing) using the lead's chosen (or default) proposal template + override."""
    from services.proposal_pdf import resolve_template, build_pricing_rows, build_proposal_pdf, merge_override
    from server import create_approval_task, ApprovalType

    lead = await get_tdb().leads.find_one({'id': lead_id})
    if not lead:
        raise HTTPException(status_code=404, detail='Lead not found')

    template = await resolve_template(get_tdb(), lead.get('proposal_template_id'))
    template_name = template.get('name')
    template = merge_override(template, lead.get('proposal_override'))
    pricing_rows = await build_pricing_rows(get_tdb(), lead)
    pdf_bytes = build_proposal_pdf(lead, template, pricing_rows)

    company = (lead.get('company') or 'Proposal').strip().replace('/', '-').replace(' ', '_')
    file_name = f"Nyla_{company}_Proposal.pdf"

    existing = await get_tdb().lead_proposals.find_one({'lead_id': lead_id})
    version = 1
    if existing:
        version = existing.get('version', 1) + 1
        await get_tdb().lead_proposals.delete_one({'lead_id': lead_id})
    status = 'revised' if existing and existing.get('status') == 'changes_requested' else 'pending_review'

    proposal = LeadProposal(
        lead_id=lead_id,
        file_name=file_name,
        file_size=len(pdf_bytes),
        content_type='application/pdf',
        document_type='pdf',
        file_data=base64.b64encode(pdf_bytes).decode('utf-8'),
        status=status,
        uploaded_by=current_user['id'],
        uploaded_by_name=current_user['name'],
        version=version,
    )
    doc = proposal.model_dump()
    doc['uploaded_at'] = doc['uploaded_at'].isoformat()
    doc['generated'] = True
    doc['template_name'] = template_name
    await get_tdb().lead_proposals.insert_one(doc)

    reports_to = current_user.get('reports_to')
    if reports_to:
        company_name = lead.get('company', 'Unknown Company')
        await create_approval_task(
            approval_type=ApprovalType.PROPOSAL,
            requester_id=current_user['id'],
            requester_name=current_user.get('name', 'Unknown'),
            approver_id=reports_to,
            details=f"{company_name} - {file_name}",
            description=f"Proposal generated by {current_user.get('name')} for review.\n\nLead: {company_name}\nFile: {file_name}\nVersion: {version}",
            reference_id=lead_id,
            reference_type='proposal',
            lead_id=lead_id,
        )

    response = {k: v for k, v in doc.items() if k not in ['_id', 'file_data']}
    return {'proposal': response, 'message': f'Proposal v{version} generated successfully'}


@router.get("/leads/{lead_id}/proposal/download")
async def download_lead_proposal(lead_id: str, current_user: dict = Depends(get_current_user)):
    """Download the proposal document for a lead"""
    proposal = await get_tdb().lead_proposals.find_one({'lead_id': lead_id}, {'_id': 0})

    if not proposal:
        raise HTTPException(status_code=404, detail='No proposal found for this lead')

    return {'proposal': proposal}


@router.delete("/leads/{lead_id}/proposal")
async def delete_lead_proposal(lead_id: str, current_user: dict = Depends(get_current_user)):
    """Delete a proposal (only uploader and only when pending_review)"""
    proposal = await get_tdb().lead_proposals.find_one({'lead_id': lead_id})

    if not proposal:
        raise HTTPException(status_code=404, detail='No proposal found for this lead')

    if proposal['uploaded_by'] != current_user['id']:
        raise HTTPException(status_code=403, detail='Only the uploader can delete this proposal')

    if proposal['status'] != 'pending_review':
        raise HTTPException(
            status_code=400,
            detail='Proposal can only be deleted while in Pending Review status'
        )

    await get_tdb().lead_proposals.delete_one({'lead_id': lead_id})

    return {'message': 'Proposal deleted successfully'}


@router.put("/leads/{lead_id}/proposal/review")
async def review_lead_proposal(
    lead_id: str,
    review_data: dict,
    current_user: dict = Depends(get_current_user)
):
    """Review a proposal (approve, reject, or request changes)"""
    from server import complete_approval_task, ApprovalType, stamp_pdf_with_signature

    if not can_approve_proposal(current_user['role']):
        raise HTTPException(
            status_code=403,
            detail='Only CEO, Director, VP, or National Sales Head can review proposals'
        )

    proposal = await get_tdb().lead_proposals.find_one({'lead_id': lead_id})

    if not proposal:
        raise HTTPException(status_code=404, detail='No proposal found for this lead')

    action = review_data.get('action')  # 'approved', 'rejected', 'changes_requested'
    comment = review_data.get('comment', '')

    if action not in ['approved', 'rejected', 'changes_requested']:
        raise HTTPException(status_code=400, detail='Invalid review action')

    review_comment = {
        'id': str(uuid.uuid4()),
        'reviewer_id': current_user['id'],
        'reviewer_name': current_user['name'],
        'action': action,
        'comment': comment,
        'created_at': datetime.now(timezone.utc).isoformat()
    }

    new_status = action  # 'approved', 'rejected', or 'changes_requested'

    update_data = {
        'status': new_status,
        'reviewed_by': current_user['id'],
        'reviewed_by_name': current_user['name'],
        'reviewed_at': datetime.now(timezone.utc).isoformat()
    }

    if action == 'approved' and proposal.get('content_type') == 'application/pdf':
        try:
            original_pdf_data = base64.b64decode(proposal['file_data'])

            utc_now = datetime.now(timezone.utc)
            ist_offset = timedelta(hours=5, minutes=30)
            ist_now = utc_now + ist_offset
            approval_datetime = ist_now.strftime('%B %d, %Y at %I:%M %p IST')

            stamped_pdf_data = stamp_pdf_with_signature(
                original_pdf_data,
                current_user['name'],
                approval_datetime
            )

            update_data['file_data'] = base64.b64encode(stamped_pdf_data).decode('utf-8')
            update_data['file_size'] = len(stamped_pdf_data)

            logging.info(f"Digital signature added to proposal for lead {lead_id}")
        except Exception as e:
            logging.error(f"Failed to stamp PDF with signature: {str(e)}")

    await get_tdb().lead_proposals.update_one(
        {'lead_id': lead_id},
        {
            '$set': update_data,
            '$push': {'review_comments': review_comment}
        }
    )

    if action in ['approved', 'rejected']:
        await complete_approval_task(
            approval_type=ApprovalType.PROPOSAL,
            reference_id=lead_id,
            status='completed'
        )
    elif action == 'changes_requested':
        await complete_approval_task(
            approval_type=ApprovalType.PROPOSAL,
            reference_id=lead_id,
            status='cancelled'
        )

    updated = await get_tdb().lead_proposals.find_one({'lead_id': lead_id}, {'_id': 0, 'file_data': 0})

    return {'proposal': updated, 'message': f'Proposal {action.replace("_", " ")}'}


# ============= PROPOSAL EMAIL SHARING =============

class ProposalShareEmailRequest(BaseModel):
    """Request model for sharing proposal via email"""
    to_emails: List[EmailStr]
    cc_emails: Optional[List[EmailStr]] = []
    bcc_emails: Optional[List[EmailStr]] = []
    subject: str = "Nyla Air Water - Proposal for review"
    message: Optional[str] = ""


@router.post("/leads/{lead_id}/proposal/share-email")
async def share_proposal_via_email(
    lead_id: str,
    email_data: ProposalShareEmailRequest,
    current_user: dict = Depends(get_current_user)
):
    """Share an approved proposal via email with attachment"""
    if not os.environ.get('RESEND_API_KEY'):
        raise HTTPException(
            status_code=500,
            detail='Email service not configured. Please contact administrator.'
        )

    proposal = await get_tdb().lead_proposals.find_one({'lead_id': lead_id})

    if not proposal:
        raise HTTPException(status_code=404, detail='No proposal found for this lead')

    if proposal.get('status') != 'approved':
        raise HTTPException(
            status_code=400,
            detail='Only approved proposals can be shared via email'
        )

    lead = await get_tdb().leads.find_one({'id': lead_id}, {'_id': 0})
    company_name = lead.get('company', 'Unknown Company') if lead else 'Unknown Company'

    sender_name = current_user.get('name', 'Nyla Air Water Team')

    message_html = email_data.message.replace('\n', '<br>') if email_data.message else ''

    html_content = f"""
    <div style="font-family: Helvetica, Arial, sans-serif; font-size: 14px; color: #333; line-height: 1.6;">
        {message_html}
    </div>
    """

    attachment = {
        "filename": proposal['file_name'],
        "content": proposal['file_data'],  # Already base64 encoded
        "content_type": proposal['content_type']
    }

    sender_from_email = os.environ.get('SENDER_EMAIL', 'onboarding@resend.dev')
    email_params = {
        "from": f"{sender_name} <{sender_from_email}>",
        "to": email_data.to_emails,
        "subject": email_data.subject,
        "html": html_content,
        "attachments": [attachment]
    }

    cc_list = list(email_data.cc_emails) if email_data.cc_emails else []

    user_email = current_user.get('email')
    if user_email and user_email not in cc_list and user_email not in email_data.to_emails:
        cc_list.append(user_email)

    reports_to_id = current_user.get('reports_to')
    if reports_to_id:
        manager = await get_tdb().users.find_one({'id': reports_to_id}, {'_id': 0, 'email': 1})
        if manager and manager.get('email'):
            manager_email = manager['email']
            if manager_email not in cc_list and manager_email not in email_data.to_emails:
                cc_list.append(manager_email)

    if cc_list:
        email_params["cc"] = cc_list

    if email_data.bcc_emails:
        email_params["bcc"] = email_data.bcc_emails

    try:
        email_result = await asyncio.to_thread(resend.Emails.send, email_params)

        await get_tdb().lead_activities.insert_one({
            'id': str(uuid.uuid4()),
            'lead_id': lead_id,
            'activity_type': 'email',
            'interaction_method': 'email',
            'description': f'Proposal shared via email to: {", ".join(email_data.to_emails)}',
            'created_by': current_user['id'],
            'created_by_name': current_user.get('name'),
            'created_at': datetime.now(timezone.utc).isoformat()
        })

        return {
            'status': 'success',
            'message': f'Proposal sent successfully to {", ".join(email_data.to_emails)}',
            'email_id': email_result.get('id')
        }
    except Exception as e:
        logging.error(f"Failed to send proposal email: {str(e)}")
        raise HTTPException(
            status_code=500,
            detail=f'Failed to send email: {str(e)}'
        )


# ============= UNIFIED DOCUMENT SHARING (Proposal + Deck + Files) =============

class ShareDocumentsRequest(BaseModel):
    """Share any combination of a lead's documents in one email."""
    to_emails: List[EmailStr]
    cc_emails: Optional[List[EmailStr]] = []
    bcc_emails: Optional[List[EmailStr]] = []
    subject: str = "Documents from Nyla Air & Water"
    message: Optional[str] = ""
    include_proposal: bool = False
    include_deck: bool = False
    document_ids: Optional[List[str]] = []


@router.post("/leads/{lead_id}/share-documents")
async def share_lead_documents(
    lead_id: str,
    payload: ShareDocumentsRequest,
    current_user: dict = Depends(get_current_user),
):
    """Email a chosen set of the lead's documents (proposal, deck PDF, and/or
    files from the Files & Documents store) together as attachments."""
    if not os.environ.get('RESEND_API_KEY'):
        raise HTTPException(status_code=500, detail='Email service not configured. Please contact administrator.')

    tdb = get_tdb()
    lead = await tdb.leads.find_one({'id': lead_id}, {'_id': 0})
    if not lead:
        raise HTTPException(status_code=404, detail='Lead not found')

    attachments = []
    attached_names = []

    # 1) Proposal (approved) — base64 already stored
    if payload.include_proposal:
        proposal = await tdb.lead_proposals.find_one({'lead_id': lead_id})
        if not proposal:
            raise HTTPException(status_code=400, detail='No proposal found for this lead')
        if proposal.get('status') != 'approved':
            raise HTTPException(status_code=400, detail='Only an approved proposal can be shared')
        attachments.append({
            'filename': proposal['file_name'],
            'content': proposal['file_data'],
            'content_type': proposal['content_type'],
        })
        attached_names.append(proposal['file_name'])

    # 2) Deck — download the Gamma PDF export and attach
    if payload.include_deck:
        deck = await tdb.gamma_generations.find_one(
            {'source_type': 'lead', 'source_id': lead_id}, sort=[('created_at', -1)])
        if not deck:
            raise HTTPException(status_code=400, detail='No deck found for this lead')
        if deck.get('review_status') != 'approved':
            raise HTTPException(status_code=400, detail='Only an approved deck can be shared')
        export_url = deck.get('export_url')
        if not export_url:
            raise HTTPException(status_code=400, detail='Deck PDF is not ready yet')
        try:
            import httpx
            async with httpx.AsyncClient(timeout=60, follow_redirects=True) as client:
                r = await client.get(export_url)
                r.raise_for_status()
                deck_bytes = r.content
        except Exception as e:
            raise HTTPException(status_code=502, detail=f'Could not fetch deck PDF: {str(e)[:200]}')
        deck_name = f"{(deck.get('title') or 'Deck').strip().replace('/', '-')}.pdf"
        attachments.append({
            'filename': deck_name,
            'content': base64.b64encode(deck_bytes).decode('utf-8'),
            'content_type': 'application/pdf',
        })
        attached_names.append(deck_name)

    # 3) Files & Documents store
    for doc_id in (payload.document_ids or []):
        doc = await tdb.documents.find_one({'id': doc_id})
        if not doc or not doc.get('file_data'):
            continue
        fname = doc.get('file_name') or doc.get('name') or 'document'
        attachments.append({
            'filename': fname,
            'content': doc['file_data'],
            'content_type': doc.get('content_type', 'application/octet-stream'),
        })
        attached_names.append(fname)

    if not attachments:
        raise HTTPException(status_code=400, detail='Select at least one document to attach')

    sender_name = current_user.get('name', 'Nyla Air & Water Team')
    message_html = payload.message or ''
    if message_html and '<' not in message_html:
        message_html = message_html.replace('\n', '<br>')
    html_content = f"""
    <div style="font-family: Helvetica, Arial, sans-serif; font-size: 14px; color: #333; line-height: 1.6;">
        {message_html}
    </div>
    """

    sender_from_email = os.environ.get('SENDER_EMAIL', 'onboarding@resend.dev')
    email_params = {
        'from': f"{sender_name} <{sender_from_email}>",
        'to': payload.to_emails,
        'subject': payload.subject,
        'html': html_content,
        'attachments': attachments,
    }

    cc_list = list(payload.cc_emails) if payload.cc_emails else []
    user_email = current_user.get('email')
    if user_email and user_email not in cc_list and user_email not in payload.to_emails:
        cc_list.append(user_email)
    if cc_list:
        email_params['cc'] = cc_list
    if payload.bcc_emails:
        email_params['bcc'] = payload.bcc_emails

    try:
        email_result = await asyncio.to_thread(resend.Emails.send, email_params)
        await tdb.lead_activities.insert_one({
            'id': str(uuid.uuid4()),
            'lead_id': lead_id,
            'activity_type': 'email',
            'interaction_method': 'email',
            'description': f'Documents shared via email to {", ".join(payload.to_emails)}: {", ".join(attached_names)}',
            'created_by': current_user['id'],
            'created_by_name': current_user.get('name'),
            'created_at': datetime.now(timezone.utc).isoformat(),
        })
        return {
            'status': 'success',
            'message': f'Sent {len(attachments)} document(s) to {", ".join(payload.to_emails)}',
            'email_id': (email_result or {}).get('id'),
        }
    except Exception as e:
        logging.error(f"Failed to send documents email: {str(e)}")
        raise HTTPException(status_code=500, detail=f'Failed to send email: {str(e)}')
