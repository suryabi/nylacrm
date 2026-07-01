from fastapi import FastAPI, APIRouter, HTTPException, Depends, status, File, UploadFile, Request, Response, Form, Query
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from fastapi.responses import JSONResponse
from dotenv import load_dotenv
from starlette.middleware.cors import CORSMiddleware
from motor.motor_asyncio import AsyncIOMotorClient
import os
import logging
import urllib.parse
from pathlib import Path
from pydantic import BaseModel, Field, ConfigDict, EmailStr
from typing import List, Optional, Union, Dict, Any
import uuid
from datetime import datetime, timezone, timedelta
import jwt
import bcrypt
from PIL import Image
import io
import base64
import httpx
from reportlab.pdfgen import canvas
from reportlab.lib.pagesizes import letter
from reportlab.lib.colors import Color
from PyPDF2 import PdfReader, PdfWriter
import asyncio
import resend

ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / '.env')

# Setup logging
logger = logging.getLogger(__name__)

# ActiveMQ globals (will be set on startup)
MQ_AVAILABLE = False
mq_subscriber = None
start_mq_subscriber = None
stop_mq_subscriber = None

# Resend email configuration
RESEND_API_KEY = os.environ.get('RESEND_API_KEY')
if RESEND_API_KEY:
    resend.api_key = RESEND_API_KEY

# Meeting email notification helper
async def send_meeting_notification(meeting: dict, notification_type: str, organizer: dict):
    """
    Send email notifications for meeting events.
    notification_type: 'scheduled', 'rescheduled', 'cancelled'
    """
    if not RESEND_API_KEY:
        print("Resend API key not configured, skipping email notification")
        return
    
    attendees = meeting.get('attendees', [])
    if not attendees:
        return
    
    sender_email = os.environ.get('SENDER_EMAIL', 'onboarding@resend.dev')
    organizer_name = organizer.get('name', 'Someone')
    meeting_title = meeting.get('title', 'Meeting')
    meeting_date = meeting.get('meeting_date', '')
    meeting_time = meeting.get('start_time', '')
    duration = meeting.get('duration_minutes', 30)
    meeting_link = meeting.get('meeting_link', '')
    zoom_password = meeting.get('zoom_password', '')
    location = meeting.get('location', '')
    description = meeting.get('description', '')
    
    # Subject line based on notification type
    subjects = {
        'scheduled': f"Meeting Invitation: {meeting_title}",
        'rescheduled': f"Meeting Rescheduled: {meeting_title}",
        'cancelled': f"Meeting Cancelled: {meeting_title}"
    }
    subject = subjects.get(notification_type, f"Meeting Update: {meeting_title}")
    
    # Build email content
    if notification_type == 'cancelled':
        html_content = f"""
        <div style="font-family: Helvetica, Arial, sans-serif; max-width: 600px; margin: 0 auto;">
            <div style="background: #dc2626; color: white; padding: 20px; border-radius: 8px 8px 0 0;">
                <h2 style="margin: 0;">Meeting Cancelled</h2>
            </div>
            <div style="padding: 20px; background: #f9fafb; border: 1px solid #e5e7eb; border-top: none; border-radius: 0 0 8px 8px;">
                <p style="color: #374151; font-size: 16px;">
                    <strong>{organizer_name}</strong> has cancelled the following meeting:
                </p>
                <div style="background: white; padding: 15px; border-radius: 8px; margin: 15px 0; border-left: 4px solid #dc2626;">
                    <h3 style="margin: 0 0 10px 0; color: #111827;">{meeting_title}</h3>
                    <p style="margin: 5px 0; color: #6b7280;">
                        <strong>Originally scheduled:</strong> {meeting_date} at {meeting_time}
                    </p>
                </div>
                <p style="color: #6b7280; font-size: 14px;">
                    If you have any questions, please contact {organizer_name}.
                </p>
            </div>
        </div>
        """
    else:
        status_color = '#2563eb' if notification_type == 'scheduled' else '#f59e0b'
        status_text = 'New Meeting' if notification_type == 'scheduled' else 'Meeting Rescheduled'
        
        zoom_section = ""
        if meeting_link:
            zoom_section = f"""
            <div style="background: #eff6ff; padding: 15px; border-radius: 8px; margin: 15px 0; border: 1px solid #bfdbfe;">
                <p style="margin: 0 0 10px 0; color: #1e40af; font-weight: bold;">
                    📹 Zoom Meeting
                </p>
                <p style="margin: 5px 0;">
                    <a href="{meeting_link}" style="color: #2563eb; text-decoration: none; font-weight: bold;">
                        Join Meeting
                    </a>
                </p>
                {f'<p style="margin: 5px 0; color: #6b7280; font-size: 14px;">Password: <strong>{zoom_password}</strong></p>' if zoom_password else ''}
            </div>
            """
        
        location_text = f"<p style='margin: 5px 0; color: #6b7280;'><strong>Location:</strong> {location}</p>" if location and not meeting_link else ""
        description_text = f"<p style='margin: 10px 0; color: #374151;'>{description}</p>" if description else ""
        
        html_content = f"""
        <div style="font-family: Helvetica, Arial, sans-serif; max-width: 600px; margin: 0 auto;">
            <div style="background: {status_color}; color: white; padding: 20px; border-radius: 8px 8px 0 0;">
                <h2 style="margin: 0;">{status_text}</h2>
            </div>
            <div style="padding: 20px; background: #f9fafb; border: 1px solid #e5e7eb; border-top: none; border-radius: 0 0 8px 8px;">
                <p style="color: #374151; font-size: 16px;">
                    <strong>{organizer_name}</strong> has {'invited you to' if notification_type == 'scheduled' else 'rescheduled'} a meeting:
                </p>
                <div style="background: white; padding: 15px; border-radius: 8px; margin: 15px 0; border-left: 4px solid {status_color};">
                    <h3 style="margin: 0 0 10px 0; color: #111827;">{meeting_title}</h3>
                    <p style="margin: 5px 0; color: #6b7280;">
                        <strong>📅 Date:</strong> {meeting_date}
                    </p>
                    <p style="margin: 5px 0; color: #6b7280;">
                        <strong>🕐 Time:</strong> {meeting_time} ({duration} minutes)
                    </p>
                    {location_text}
                    {description_text}
                </div>
                {zoom_section}
                <p style="color: #6b7280; font-size: 14px;">
                    If you have any questions, please contact {organizer_name}.
                </p>
            </div>
        </div>
        """
    
    try:
        email_params = {
            "from": f"Nyla CRM <{sender_email}>",
            "to": attendees,
            "subject": subject,
            "html": html_content
        }
        
        await asyncio.to_thread(resend.Emails.send, email_params)
        print(f"Meeting notification sent to {len(attendees)} attendees")
    except Exception as e:
        print(f"Failed to send meeting notification: {e}")

# MongoDB connection
mongo_url = os.environ['MONGO_URL']
client = AsyncIOMotorClient(mongo_url)
db = client[os.environ['DB_NAME']]

# Import tenant-aware database helper
from database import get_tenant_db

def get_tdb():
    """Get tenant-aware database wrapper for multi-tenant queries"""
    return get_tenant_db()

# JWT Configuration
JWT_SECRET = os.environ['JWT_SECRET']
JWT_ALGORITHM = 'HS256'
JWT_EXPIRATION_HOURS = 24

security = HTTPBearer()

# Create the main app
app = FastAPI()
api_router = APIRouter(prefix="/api")

# ============= HEALTH CHECK ENDPOINTS =============
# These MUST be defined FIRST and kept simple to guarantee availability
# for Kubernetes probes, Cloudflare checks, and deployment orchestrators.

@app.get("/health")
async def health_check():
    """Health check endpoint for Kubernetes/deployment health probes"""
    return {"status": "healthy", "service": "backend"}

@app.get("/healthz")
async def healthz():
    """K8s-style health probe"""
    return {"status": "healthy"}

@app.get("/ready")
async def ready():
    """K8s-style readiness probe"""
    return {"status": "ready"}

@app.get("/livez")
async def livez():
    """K8s-style liveness probe"""
    return {"status": "alive"}

@app.get("/")
async def root():
    """Root endpoint"""
    return {"status": "ok", "service": "nyla-crm-api"}

# Health checks also under /api prefix (in case ingress strips or requires /api)
@api_router.get("/")
async def api_root():
    """API root endpoint"""
    return {"status": "ok", "service": "nyla-crm-api"}

@api_router.get("/health")
async def api_health_check():
    """Health check endpoint under /api prefix"""
    return {"status": "healthy", "service": "backend"}

@api_router.get("/healthz")
async def api_healthz():
    """K8s-style health probe under /api prefix"""
    return {"status": "healthy"}

@api_router.get("/ping")
async def api_ping():
    """Simple ping endpoint"""
    return {"pong": True}

# Import modular routes
from routes import routes_router

# Import and add tenant middleware
from core.tenant import tenant_middleware, get_current_tenant_id, add_tenant_filter, with_tenant_id

@app.middleware("http")
async def tenant_context_middleware(request: Request, call_next):
    """Middleware to set tenant context for each request"""
    return await tenant_middleware(request, call_next)

# Include modular routes - these are the refactored endpoints
# Note: We're including them here but the original routes in this file
# will take precedence due to FastAPI route ordering
# As we migrate more routes to the modular structure, we'll remove them from here
# Keeping both during transition to ensure backward compatibility

# Static files for logos - resilient to read-only filesystems (best-effort)
from fastapi.staticfiles import StaticFiles
import os
logos_dir = '/app/backend/static/logos'
try:
    os.makedirs(logos_dir, exist_ok=True)
except OSError as _mkdir_err:
    # Filesystem may be read-only in some deployment environments; ignore
    logger.warning(f"Could not create static dir {logos_dir}: {_mkdir_err}")
try:
    app.mount("/api/static", StaticFiles(directory="/app/backend/static"), name="static")
except Exception as _mount_err:
    logger.warning(f"Static mount failed: {_mount_err}")

# ============= HELPER FUNCTIONS =============

import re

async def generate_lead_id(company: str, city: str) -> str:
    """
    Generate unique Lead ID in format: NAME4-CITY-LYY-SEQ (16 characters total)
    - NAME4: First 4 characters of company name (uppercase, alphanumeric only)
    - CITY: First 3 characters of city (uppercase, alphanumeric only)
    - L: Literal 'L' for Lead
    - YY: 2-digit year
    - SEQ: 3-digit sequence number (001-999)
    """
    # Clean and extract first 4 chars of company name (uppercase, alphanumeric only)
    clean_company = re.sub(r'[^a-zA-Z0-9]', '', company).upper()
    name4 = clean_company[:4].ljust(4, 'X')  # Pad with X if less than 4 chars
    
    # Clean and extract first 3 chars of city (uppercase, alphanumeric only)
    clean_city = re.sub(r'[^a-zA-Z0-9]', '', city).upper()
    city3 = clean_city[:3].ljust(3, 'X')  # Pad with X if less than 3 chars
    
    # Get current 2-digit year
    year2 = datetime.now().strftime('%y')
    
    # Build prefix for sequence lookup: NAME4-CITY-LYY-
    prefix = f"{name4}-{city3}-L{year2}-"
    
    # Find the highest sequence number for this prefix
    regex_pattern = f"^{re.escape(prefix)}\\d{{3}}$"
    existing_leads = await get_tdb().leads.find(
        {'lead_id': {'$regex': regex_pattern}},
        {'lead_id': 1}
    ).sort('lead_id', -1).limit(1).to_list(1)
    
    if existing_leads and existing_leads[0].get('lead_id'):
        # Extract sequence number from last lead_id and increment
        last_seq = int(existing_leads[0]['lead_id'][-3:])
        next_seq = last_seq + 1
    else:
        next_seq = 1
    
    # Cap at 999, wrap to 001 if exceeded (or handle as error)
    if next_seq > 999:
        next_seq = 1  # Reset or raise error based on business logic
    
    # Format sequence as 3 digits
    seq3 = str(next_seq).zfill(3)
    
    # Final Lead ID: NAME4-CITY-LYY-SEQ (16 characters)
    lead_id = f"{name4}-{city3}-L{year2}-{seq3}"
    
    return lead_id


def stamp_pdf_with_signature(pdf_data: bytes, approver_name: str, approval_date: str) -> bytes:
    """
    Stamp a PDF document with a digital signature (text overlay) at the bottom of the last page.
    
    Args:
        pdf_data: The original PDF as bytes
        approver_name: Name of the person who approved
        approval_date: Date of approval
    
    Returns:
        The stamped PDF as bytes
    """
    # Read the original PDF
    pdf_reader = PdfReader(io.BytesIO(pdf_data))
    pdf_writer = PdfWriter()
    
    # Copy all pages except the last one
    for i, page in enumerate(pdf_reader.pages[:-1]):
        pdf_writer.add_page(page)
    
    # Get the last page
    last_page = pdf_reader.pages[-1]
    page_width = float(last_page.mediabox.width)
    page_height = float(last_page.mediabox.height)
    
    # Create a stamp overlay with the signature text
    stamp_buffer = io.BytesIO()
    stamp_canvas = canvas.Canvas(stamp_buffer, pagesize=(page_width, page_height))
    
    # Set font and color for the signature - subtle gray text
    stamp_canvas.setFont("Helvetica", 8)
    stamp_canvas.setFillColor(Color(0.4, 0.4, 0.4, alpha=0.8))  # Gray color
    
    # Signature text
    signature_text = f"Approved by: {approver_name}  |  Date: {approval_date}"
    
    # Position at bottom center of the page (30 points from bottom)
    text_width = stamp_canvas.stringWidth(signature_text, "Helvetica", 8)
    x_position = (page_width - text_width) / 2
    y_position = 30
    
    stamp_canvas.drawString(x_position, y_position, signature_text)
    stamp_canvas.save()
    
    # Merge the stamp with the last page
    stamp_buffer.seek(0)
    stamp_pdf = PdfReader(stamp_buffer)
    stamp_page = stamp_pdf.pages[0]
    
    last_page.merge_page(stamp_page)
    pdf_writer.add_page(last_page)
    
    # Write the final PDF to bytes
    output_buffer = io.BytesIO()
    pdf_writer.write(output_buffer)
    output_buffer.seek(0)
    
    return output_buffer.read()


# ============= APPROVAL TASK FRAMEWORK =============

class ApprovalType:
    """Enum-like class for approval types"""
    LEAVE_REQUEST = 'leave_request'
    TRAVEL_REQUEST = 'travel_request'
    BUDGET_REQUEST = 'budget_request'
    PROPOSAL = 'proposal'
    CONTRACT = 'contract'
    DECK = 'deck'
    EXPENSE = 'expense'
    PURCHASE_ORDER = 'purchase_order'

APPROVAL_CONFIG = {
    ApprovalType.LEAVE_REQUEST: {
        'title_template': 'Leave Request: {requester_name} - {details}',
        'task_type': 'general',
        'priority': 'high',
        'due_days': 1,  # Days from now for due date
    },
    ApprovalType.TRAVEL_REQUEST: {
        'title_template': 'Travel Approval: {requester_name} - {details}',
        'task_type': 'general',
        'priority': 'high',
        'due_days': 2,
    },
    ApprovalType.BUDGET_REQUEST: {
        'title_template': 'Budget Approval: {requester_name} - {details}',
        'task_type': 'general',
        'priority': 'high',
        'due_days': 2,
    },
    ApprovalType.PROPOSAL: {
        'title_template': 'Proposal Approval: {details}',
        'task_type': 'general',
        'priority': 'high',
        'due_days': 2,
    },
    ApprovalType.CONTRACT: {
        'title_template': 'Contract Approval: {details}',
        'task_type': 'general',
        'priority': 'high',
        'due_days': 2,
    },
    ApprovalType.DECK: {
        'title_template': 'Deck Approval: {details}',
        'task_type': 'general',
        'priority': 'high',
        'due_days': 2,
    },
    ApprovalType.EXPENSE: {
        'title_template': 'Expense Approval: {requester_name} - {details}',
        'task_type': 'general',
        'priority': 'medium',
        'due_days': 3,
    },
    ApprovalType.PURCHASE_ORDER: {
        'title_template': 'PO Approval: {details}',
        'task_type': 'general',
        'priority': 'high',
        'due_days': 2,
    },
}

async def create_approval_task(
    approval_type: str,
    requester_id: str,
    requester_name: str,
    approver_id: str,
    details: str,
    description: str = None,
    reference_id: str = None,
    reference_type: str = None,
    lead_id: str = None,
    account_id: str = None,
    custom_due_date: str = None,
    custom_priority: str = None
) -> dict:
    """
    Create an approval task automatically when an approval is requested.
    
    Args:
        approval_type: Type of approval (from ApprovalType class)
        requester_id: ID of the user requesting approval
        requester_name: Name of the user requesting approval
        approver_id: ID of the user who needs to approve
        details: Short details for the task title (e.g., leave dates, proposal name)
        description: Optional longer description
        reference_id: Optional ID of the related document (leave request ID, proposal ID, etc.)
        reference_type: Optional type of the related document
        lead_id: Optional link to a lead
        account_id: Optional link to an account
        custom_due_date: Optional custom due date (YYYY-MM-DD)
        custom_priority: Optional custom priority override
    
    Returns:
        Created task document
    """
    config = APPROVAL_CONFIG.get(approval_type, {
        'title_template': 'Approval Required: {details}',
        'task_type': 'general',
        'priority': 'medium',
        'due_days': 2,
    })
    
    # Generate title from template
    title = config['title_template'].format(
        requester_name=requester_name,
        details=details
    )
    
    # Calculate due date
    if custom_due_date:
        due_date = custom_due_date
    else:
        due_date = (datetime.now(timezone.utc) + timedelta(days=config['due_days'])).strftime('%Y-%m-%d')
    
    # Get approver name
    approver = await get_tdb().users.find_one({'id': approver_id}, {'_id': 0, 'name': 1})
    approver_name = approver.get('name') if approver else None
    
    # Build description with reference info
    full_description = description or ''
    if reference_id and reference_type:
        if full_description:
            full_description += '\n\n'
        full_description += f'Reference: {reference_type} #{reference_id}'
    
    # Create the task
    task_id = str(uuid.uuid4())
    now = datetime.now(timezone.utc)
    
    task_doc = {
        'id': task_id,
        'title': title,
        'description': full_description if full_description else None,
        'task_type': config['task_type'],
        'priority': custom_priority or config['priority'],
        'status': 'pending',
        'due_date': due_date,
        'due_time': None,
        'assigned_to': approver_id,
        'assigned_to_name': approver_name,
        'assigned_by': requester_id,
        'assigned_by_name': requester_name,
        'created_by': requester_id,
        'created_by_name': requester_name,
        'lead_id': lead_id,
        'account_id': account_id,
        'completed_at': None,
        'created_at': now.isoformat(),
        'updated_at': now.isoformat(),
        # Approval-specific metadata
        'is_approval_task': True,
        'approval_type': approval_type,
        'approval_reference_id': reference_id,
        'approval_reference_type': reference_type,
        'approval_requester_id': requester_id,
    }
    
    await get_tdb().tasks.insert_one(task_doc)
    
    # Also create in tasks_v2 (Task Management module) so it shows up in the new module
    approver_dept = 'Sales'
    approver_doc = await get_tdb().users.find_one({'id': approver_id}, {'_id': 0, 'department': 1})
    if approver_doc:
        approver_dept = approver_doc.get('department', 'Sales')
    
    task_count = await get_tdb().tasks_v2.count_documents({})
    task_v2_doc = {
        'id': task_id,
        'task_number': f"TASK-{task_count + 1:05d}",
        'title': title,
        'description': full_description if full_description else None,
        'severity': 'high' if (custom_priority or config['priority']) == 'high' else 'medium',
        'status': 'open',
        'department_id': approver_dept,
        'assignees': [approver_id],
        'assignees_data': [{'id': approver_id, 'name': approver_name or ''}],
        'milestone_id': None,
        'labels': [],
        'due_date': due_date,
        'due_time': None,
        'reminder_date': None,
        'linked_entity_type': reference_type or f'{approval_type}',
        'linked_entity_id': reference_id,
        'watchers': [requester_id, approver_id],
        'created_by': requester_id,
        'created_by_name': requester_name,
        'is_approval_task': True,
        'approval_type': approval_type,
        'created_at': now.isoformat(),
        'updated_at': now.isoformat()
    }
    
    await get_tdb().tasks_v2.insert_one(task_v2_doc)
    
    # Return without _id
    return {k: v for k, v in task_doc.items() if k != '_id'}


async def resolve_request_approver(requester_id: str) -> Optional[dict]:
    """Resolve who should approve a request raised by `requester_id`.

    Priority: direct reporting manager (`reports_to`) -> dotted-line manager
    (`dotted_line_to`) -> any active Director/CEO -> any active Admin.
    Returns the approver user dict ({id, name, email}) or None.
    """
    tdb = get_tdb()
    requester = await tdb.users.find_one(
        {'id': requester_id},
        {'_id': 0, 'reports_to': 1, 'dotted_line_to': 1}
    ) or {}
    for key in ('reports_to', 'dotted_line_to'):
        uid = requester.get(key)
        if uid:
            mgr = await tdb.users.find_one(
                {'id': uid, 'is_active': True},
                {'_id': 0, 'id': 1, 'name': 1, 'email': 1}
            )
            if mgr:
                return mgr
    # Fallback: any active Director or CEO
    fallback = await tdb.users.find_one(
        {'role': {'$in': ['Director', 'CEO']}, 'is_active': True},
        {'_id': 0, 'id': 1, 'name': 1, 'email': 1}
    )
    if fallback:
        return fallback
    # Last resort: any active Admin / System Admin
    return await tdb.users.find_one(
        {'role': {'$in': ['Admin', 'System Admin']}, 'is_active': True},
        {'_id': 0, 'id': 1, 'name': 1, 'email': 1}
    )


async def notify_approver(approver: dict, *, title: str, body: str, link: str,
                          entity_type: str, entity_id: str, kind: str = 'approval'):
    """Best-effort in-app + email notification to a user. Never raises."""
    if not approver or not approver.get('id'):
        return
    try:
        from utils.notify import notify_users
        await notify_users(
            get_current_tenant_id(),
            [approver['id']],
            title=title,
            body=body,
            link=link,
            kind=kind,
            entity_type=entity_type,
            entity_id=entity_id,
            send_email_too=True,
        )
    except Exception:
        logger.exception('notify_approver failed')


async def complete_approval_task(
    approval_type: str,
    reference_id: str,
    status: str = 'completed'
) -> bool:
    """
    Mark an approval task as completed when the approval is processed.
    
    Args:
        approval_type: Type of approval
        reference_id: ID of the related document
        status: 'completed' or 'cancelled'
    
    Returns:
        True if task was found and updated, False otherwise
    """
    result = await get_tdb().tasks.update_one(
        {
            'is_approval_task': True,
            'approval_type': approval_type,
            'approval_reference_id': reference_id,
            'status': {'$in': ['pending', 'open', 'in_progress']}
        },
        {
            '$set': {
                'status': status,
                'completed_at': datetime.now(timezone.utc).isoformat() if status == 'completed' else None,
                'updated_at': datetime.now(timezone.utc).isoformat()
            }
        }
    )
    
    # Also update in tasks_v2 (Task Management module)
    v2_status = 'closed' if status == 'completed' else 'closed'
    await get_tdb().tasks_v2.update_many(
        {
            'is_approval_task': True,
            'approval_type': approval_type,
            'linked_entity_id': reference_id,
            'status': {'$in': ['open', 'in_progress', 'review']}
        },
        {
            '$set': {
                'status': v2_status,
                'updated_at': datetime.now(timezone.utc).isoformat()
            }
        }
    )
    
    return result.modified_count > 0


# ============= MODELS =============

class UserRole(BaseModel):
    role: str  # 'admin', 'sales_manager', 'sales_rep'

class User(BaseModel):
    model_config = ConfigDict(extra="ignore")
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    email: EmailStr
    name: str
    role: str  # 'ceo', 'director', 'vp', 'admin', 'sales_manager', 'sales_rep', 'Distributor'
    designation: Optional[str] = None  # Full title like 'CEO & Managing Director'
    department: Optional[Union[str, List[str]]] = 'Sales'
    phone: Optional[str] = None
    avatar: Optional[str] = None
    city: Optional[str] = None
    state: Optional[str] = None
    country: Optional[str] = None
    territory: Optional[str] = None
    reports_to: Optional[str] = None  # user_id of direct manager
    dotted_line_to: Optional[str] = None  # user_id for dotted line reporting
    is_active: bool = True
    # Employee HR fields (visible to CEO, Director, Admin only)
    ctc_monthly: Optional[float] = None  # Cost to Company per month in INR
    joining_date: Optional[str] = None  # Format: YYYY-MM-DD
    # Distributor link (for Distributor role users)
    distributor_id: Optional[str] = None  # Links user to their distributor record
    force_password_change: bool = False  # Force password change on first login
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))

class UserCreate(BaseModel):
    email: EmailStr
    password: str
    name: str
    role: str = 'sales_rep'
    designation: Optional[str] = None
    department: Optional[Union[str, List[str]]] = 'Sales'
    phone: Optional[str] = None
    city: Optional[str] = None
    state: Optional[str] = None
    country: Optional[str] = None
    territory: Optional[str] = None
    reports_to: Optional[str] = None
    dotted_line_to: Optional[str] = None
    ctc_monthly: Optional[float] = None
    joining_date: Optional[str] = None
    distributor_id: Optional[str] = None  # Links user to their distributor record
    force_password_change: bool = False

class UserLogin(BaseModel):
    email: EmailStr
    password: str

class LeadStatus(BaseModel):
    status: str  # 'new', 'contacted', 'qualified', 'proposal', 'closed_won', 'closed_lost'

class PaginatedLeadsResponse(BaseModel):
    """Paginated response for leads list"""
    data: List['Lead']  # Forward reference
    total: int
    page: int
    page_size: int
    total_pages: int

class Lead(BaseModel):
    model_config = ConfigDict(extra="allow")  # Allow extra fields
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    lead_id: Optional[str] = None  # Unique formatted ID: NAME4-CITY-LYY-SEQ (16 chars)
    
    # Company & Contact
    company: str
    contact_person: Optional[str] = None
    name: Optional[str] = None  # Kept for backward compatibility
    email: Optional[EmailStr] = None
    phone: Optional[str] = None
    
    # Lead Category
    category: Optional[str] = None  # Restaurant, Bar & Kitchen, Star Hotel, etc.
    
    # Lead Type — B2B or Retail (defaults to B2B)
    lead_type: Optional[str] = 'B2B'
    
    # Customer Tier
    tier: Optional[str] = None  # Tier 1, Tier 2, Tier 3, Tier 4, Tier 5
    
    # Lead Rank (A+, A, B, C, D)
    rank: Optional[str] = None  # A+, A, B, C, D
    
    # Location
    city: str
    state: str
    country: str = 'India'
    region: str
    
    # Lead Information
    status: str = 'new'
    source: Optional[str] = None
    assigned_to: Optional[str] = None
    priority: Optional[str] = 'medium'
    
    # Current Brand Details
    current_water_brand: Optional[str] = None
    current_landing_price: Optional[float] = None
    current_volume: Optional[str] = None
    current_selling_price: Optional[float] = None
    current_brands: Optional[List[dict]] = []  # Multi-brand grid: [{brand_name, volume, landing_price, selling_price}]
    
    # Nyla Details
    interested_skus: Optional[List[str]] = []  # Multi-select SKUs
    proposed_sku_pricing: Optional[List[dict]] = []  # Proposed pricing for this lead
    notes: Optional[str] = None
    
    # Follow-up tracking
    next_followup_date: Optional[str] = None  # YYYY-MM-DD format
    
    # System fields
    estimated_value: Optional[float] = None
    created_by: str
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    updated_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    
    # Computed fields (added dynamically)
    last_contacted_date: Optional[str] = None
    last_contact_method: Optional[str] = None
    
    # Invoice fields (populated from ActiveMQ)
    total_gross_invoice_value: Optional[float] = None
    total_net_invoice_value: Optional[float] = None
    total_credit_note_value: Optional[float] = None
    invoice_count: Optional[int] = None
    last_invoice_date: Optional[str] = None
    last_invoice_no: Optional[str] = None
    
    # Onboarding tracking
    onboarded_month: Optional[int] = None
    onboarded_year: Optional[int] = None
    target_closure_month: Optional[int] = None
    target_closure_year: Optional[int] = None

class LeadCreate(BaseModel):
    company: str
    contact_person: Optional[str] = None
    email: Optional[EmailStr] = None
    phone: Optional[str] = None
    category: Optional[str] = None
    lead_type: Optional[str] = 'B2B'  # B2B or Retail
    tier: Optional[str] = None
    rank: Optional[str] = None  # A+, A, B, C, D
    city: str
    state: str
    country: str = 'India'
    region: str
    status: str = 'new'
    source: Optional[str] = None
    assigned_to: Optional[str] = None
    priority: Optional[str] = 'medium'
    current_water_brand: Optional[str] = None
    current_landing_price: Optional[float] = None
    current_volume: Optional[str] = None
    current_selling_price: Optional[float] = None
    current_brands: Optional[List[dict]] = []
    interested_skus: Optional[List[str]] = []
    notes: Optional[str] = None
    estimated_value: Optional[float] = None
    onboarded_month: Optional[int] = None
    onboarded_year: Optional[int] = None
    target_closure_month: Optional[int] = None
    target_closure_year: Optional[int] = None
    delivery_address: Optional[Dict[str, Any]] = None

class LeadUpdate(BaseModel):
    company: Optional[str] = None
    contact_person: Optional[str] = None
    email: Optional[EmailStr] = None
    phone: Optional[str] = None
    category: Optional[str] = None
    lead_type: Optional[str] = None  # B2B or Retail
    tier: Optional[str] = None
    rank: Optional[str] = None  # A+, A, B, C, D
    city: Optional[str] = None
    state: Optional[str] = None
    country: Optional[str] = None
    region: Optional[str] = None
    status: Optional[str] = None
    source: Optional[str] = None
    assigned_to: Optional[str] = None
    priority: Optional[str] = None
    current_water_brand: Optional[str] = None
    current_landing_price: Optional[float] = None
    current_volume: Optional[str] = None
    current_selling_price: Optional[float] = None
    current_brands: Optional[List[dict]] = None
    interested_skus: Optional[List[str]] = None
    proposed_sku_pricing: Optional[List[dict]] = None  # Proposed pricing for this lead
    notes: Optional[str] = None
    estimated_value: Optional[float] = None
    next_followup_date: Optional[str] = None
    temperature: Optional[str] = None  # Hot, Warm, Cold lead temperature
    # Account conversion flag
    converted_to_account: Optional[bool] = False
    account_id: Optional[str] = None
    onboarded_month: Optional[int] = None
    onboarded_year: Optional[int] = None
    target_closure_month: Optional[int] = None
    target_closure_year: Optional[int] = None
    delivery_address: Optional[Dict[str, Any]] = None

# ============= ACCOUNT MODELS =============

class AccountSKUPricing(BaseModel):
    """SKU pricing and bottle credit for an account"""
    # Stable id that survives master_skus name renames. Optional for legacy rows.
    sku_id: Optional[str] = None
    sku: str
    price_per_unit: float = 0.0
    return_bottle_credit: float = 0.0

class Account(BaseModel):
    model_config = ConfigDict(extra="allow")
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    account_id: str  # Formatted ID: NAME4-CITY-AYY-SEQ
    lead_id: str  # Reference to original lead
    
    # Account Info
    account_name: str
    account_type: Optional[str] = None  # Tier 1, Tier 2, Tier 3
    
    # Lead Type — B2B or Retail (propagated from lead on conversion)
    lead_type: Optional[str] = 'B2B'
    
    # Include in GOP (Gross Operating Profit) metrics
    # Default: B2B=True, Retail=False (handled on conversion; explicit override allowed via update)
    include_in_gop_metrics: Optional[bool] = True
    
    # Contact Info
    contact_name: Optional[str] = None
    contact_number: Optional[str] = None
    
    # Location (copied from lead)
    city: str
    state: str
    territory: str
    
    # Assignment
    assigned_to: Optional[str] = None
    
    # Follow-up
    next_follow_up: Optional[str] = None  # YYYY-MM-DD
    
    # SKU Pricing
    sku_pricing: List[AccountSKUPricing] = []
    
    # Financial Tracking
    outstanding_balance: Optional[float] = 0.0
    overdue_amount: Optional[float] = 0.0
    last_payment_date: Optional[str] = None
    last_payment_amount: Optional[float] = 0.0
    
    # Onboarding tracking
    onboarded_month: Optional[int] = None
    onboarded_year: Optional[int] = None
    
    # Timestamps
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    updated_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))

class AccountCreate(BaseModel):
    lead_id: str
    copy_lead_address: Optional[bool] = False

class DeliveryAddress(BaseModel):
    """Delivery address for an account or lead"""
    model_config = ConfigDict(extra="allow")
    address_line1: Optional[str] = None
    address_line2: Optional[str] = None
    city: Optional[str] = None
    state: Optional[str] = None
    pincode: Optional[str] = None
    landmark: Optional[str] = None
    lat: Optional[float] = None
    lng: Optional[float] = None
    formatted_address: Optional[str] = None

class PaginatedAccountsResponse(BaseModel):
    """Paginated response for accounts list"""
    data: List['Account']
    total: int
    page: int
    page_size: int
    total_pages: int

class Activity(BaseModel):
    model_config = ConfigDict(extra="ignore")
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    lead_id: str
    activity_type: str  # 'call', 'email', 'meeting', 'note', 'status_change', 'visit', 'messaging'
    description: str
    interaction_method: Optional[str] = None  # 'phone_call', 'customer_visit', 'email', 'whatsapp', 'sms', 'other'
    created_by: str
    created_by_name: Optional[str] = None  # User's display name at time of creation
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))

class ActivityCreate(BaseModel):
    lead_id: str
    activity_type: str
    description: str
    interaction_method: Optional[str] = None
    # Optional fields for combined activity + status change
    new_status: Optional[str] = None
    next_followup_date: Optional[str] = None
    created_at: Optional[str] = None  # Admin override for activity date
    copy_to_lead_ids: Optional[List[str]] = None  # Copy activity to linked leads

class FollowUp(BaseModel):
    model_config = ConfigDict(extra="ignore")
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    lead_id: str
    title: str
    description: Optional[str] = None
    scheduled_date: datetime
    is_completed: bool = False
    completed_at: Optional[datetime] = None
    assigned_to: str
    created_by: str
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))

class FollowUpCreate(BaseModel):
    lead_id: str
    title: str
    description: Optional[str] = None
    scheduled_date: datetime
    assigned_to: str

class Comment(BaseModel):
    model_config = ConfigDict(extra="ignore")
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    lead_id: str
    comment: str
    created_by: str
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))

class CommentCreate(BaseModel):
    lead_id: str
    comment: str

class DailyStatus(BaseModel):
    model_config = ConfigDict(extra="ignore")
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    user_id: str
    status_date: str  # YYYY-MM-DD format
    
    # Three sections
    yesterday_updates: str = ''
    yesterday_original: Optional[str] = None
    yesterday_ai_revised: bool = False
    
    today_actions: str = ''
    today_original: Optional[str] = None
    today_ai_revised: bool = False
    
    help_needed: str = ''
    help_original: Optional[str] = None
    help_ai_revised: bool = False
    
    # Track who posted this status (for manager posting on behalf of subordinate)
    posted_by: Optional[str] = None  # User ID of who posted
    posted_by_name: Optional[str] = None  # Name of who posted
    
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    updated_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))

class DailyStatusCreate(BaseModel):
    status_date: str
    yesterday_updates: str = ''
    today_actions: str = ''
    help_needed: str = ''
    target_user_id: Optional[str] = None  # For managers posting on behalf of subordinates

class DailyStatusUpdate(BaseModel):
    yesterday_updates: Optional[str] = None
    yesterday_original: Optional[str] = None
    yesterday_ai_revised: Optional[bool] = None
    today_actions: Optional[str] = None
    today_original: Optional[str] = None
    today_ai_revised: Optional[bool] = None
    help_needed: Optional[str] = None
    help_original: Optional[str] = None
    help_ai_revised: Optional[bool] = None

# ============= TASK MODELS =============

class Task(BaseModel):
    """Task/Action item model"""
    model_config = ConfigDict(extra="ignore")
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    title: str
    description: Optional[str] = None
    task_type: str = 'general'  # 'general', 'follow_up', 'call', 'meeting', 'email', 'visit'
    priority: str = 'medium'  # 'low', 'medium', 'high', 'urgent'
    status: str = 'pending'  # 'pending', 'in_progress', 'completed', 'cancelled'
    due_date: str  # YYYY-MM-DD
    due_time: Optional[str] = None  # HH:MM
    assigned_to: str  # User ID
    assigned_to_name: Optional[str] = None
    assigned_by: str  # User ID (who assigned the task)
    assigned_by_name: Optional[str] = None
    created_by: Optional[str] = None  # User ID (who created the task)
    created_by_name: Optional[str] = None
    lead_id: Optional[str] = None  # Optional link to lead
    account_id: Optional[str] = None  # Optional link to account
    completed_at: Optional[datetime] = None
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    updated_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))

class TaskCreate(BaseModel):
    title: str
    description: Optional[str] = None
    task_type: str = 'general'
    priority: str = 'medium'
    due_date: str
    due_time: Optional[str] = None
    assigned_to: str
    lead_id: Optional[str] = None
    account_id: Optional[str] = None

class TaskUpdate(BaseModel):
    title: Optional[str] = None
    description: Optional[str] = None
    task_type: Optional[str] = None
    priority: Optional[str] = None
    status: Optional[str] = None
    due_date: Optional[str] = None
    due_time: Optional[str] = None
    assigned_to: Optional[str] = None
    lead_id: Optional[str] = None
    account_id: Optional[str] = None
    comment: Optional[str] = None  # For adding comments

# ============= MEETING MODELS =============

class Meeting(BaseModel):
    """Meeting model"""
    model_config = ConfigDict(extra="ignore")
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    title: str
    description: Optional[str] = None
    meeting_type: str = 'internal'  # 'internal', 'client', 'vendor', 'other'
    meeting_date: str  # YYYY-MM-DD
    start_time: str  # HH:MM
    end_time: Optional[str] = None  # HH:MM
    duration_minutes: int = 30
    location: Optional[str] = None  # Physical location or 'Online'
    meeting_link: Optional[str] = None  # Zoom/Teams/Meet link
    zoom_meeting_id: Optional[str] = None  # Zoom meeting ID
    zoom_password: Optional[str] = None  # Zoom meeting password
    attendees: List[str] = []  # List of email addresses
    attendee_names: List[str] = []  # List of names
    lead_id: Optional[str] = None
    account_id: Optional[str] = None
    organizer_id: str
    organizer_name: Optional[str] = None
    status: str = 'scheduled'  # 'scheduled', 'completed', 'cancelled'
    notes: Optional[str] = None
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    updated_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))

class MeetingCreate(BaseModel):
    title: str
    description: Optional[str] = None
    meeting_type: str = 'internal'
    meeting_date: str
    start_time: str
    end_time: Optional[str] = None
    duration_minutes: int = 30
    location: Optional[str] = None
    meeting_link: Optional[str] = None
    attendees: List[str] = []
    attendee_names: List[str] = []
    lead_id: Optional[str] = None
    account_id: Optional[str] = None
    create_zoom_meeting: bool = False  # Flag to create Zoom meeting

class MeetingUpdate(BaseModel):
    title: Optional[str] = None
    description: Optional[str] = None
    meeting_type: Optional[str] = None
    meeting_date: Optional[str] = None
    start_time: Optional[str] = None
    end_time: Optional[str] = None
    duration_minutes: Optional[int] = None
    location: Optional[str] = None
    meeting_link: Optional[str] = None
    attendees: Optional[List[str]] = None
    attendee_names: Optional[List[str]] = None
    lead_id: Optional[str] = None
    account_id: Optional[str] = None
    status: Optional[str] = None
    notes: Optional[str] = None

class LeaveRequest(BaseModel):
    model_config = ConfigDict(extra="ignore")
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    user_id: str
    leave_type: str  # 'casual', 'sick', 'earned', 'unpaid'
    start_date: str  # YYYY-MM-DD
    end_date: str  # YYYY-MM-DD
    total_days: int
    reason: str
    status: str = 'pending'  # 'pending', 'approved', 'rejected'
    approved_by: Optional[str] = None
    approval_date: Optional[datetime] = None
    rejection_reason: Optional[str] = None
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    updated_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))

class LeaveRequestCreate(BaseModel):
    leave_type: str
    start_date: str
    end_date: str
    reason: str

class LeaveApproval(BaseModel):
    status: str  # 'approved' or 'rejected'
    rejection_reason: Optional[str] = None

# ============= TRAVEL REQUEST MODELS =============

class TravelRequestLead(BaseModel):
    """Lead attached to a travel request"""
    lead_id: str
    lead_name: str
    city: Optional[str] = None
    estimated_deal_value: float = 0

class TravelRequestBudget(BaseModel):
    """Budget breakdown for travel request"""
    travel: float = 0
    accommodation: float = 0
    local_transport: float = 0
    meals: float = 0
    others: float = 0
    total: float = 0

class TravelRequest(BaseModel):
    model_config = ConfigDict(extra="ignore")
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    user_id: str
    user_name: Optional[str] = None
    
    # Trip Details
    from_location: str
    to_location: str
    departure_date: str  # YYYY-MM-DD
    return_date: str  # YYYY-MM-DD
    is_flexible: bool = False
    flexible_window: Optional[int] = None  # ±days
    flexibility_notes: Optional[str] = None
    
    # Policy Check
    days_before_travel: int = 0
    is_short_notice: bool = False
    short_notice_explanation: Optional[str] = None
    
    # Purpose
    purpose: str  # 'lead_customer_visits', 'distribution', 'manufacturing', 'team_visit', 'vendor_visits'
    
    # Lead/Customer Visits (conditional)
    selected_leads: List[TravelRequestLead] = []
    opportunity_size: float = 0  # Sum of estimated deal values
    
    # Budget
    tentative_budget: float = 0
    budget_breakdown: Optional[TravelRequestBudget] = None
    
    # Notes
    additional_notes: Optional[str] = None
    
    # Status & Workflow
    status: str = 'draft'  # 'draft', 'pending_approval', 'approved', 'rejected', 'cancelled'
    approved_by: Optional[str] = None
    approved_by_name: Optional[str] = None
    approval_date: Optional[datetime] = None
    rejection_reason: Optional[str] = None
    
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    updated_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))

class TravelRequestCreate(BaseModel):
    from_location: str
    to_location: str
    departure_date: str
    return_date: str
    is_flexible: bool = False
    flexible_window: Optional[int] = None
    flexibility_notes: Optional[str] = None
    short_notice_explanation: Optional[str] = None
    purpose: str
    selected_leads: List[dict] = []
    tentative_budget: float = 0
    budget_breakdown: Optional[dict] = None
    additional_notes: Optional[str] = None
    submit_for_approval: bool = False  # If True, submit immediately; else save as draft

class TravelRequestUpdate(BaseModel):
    from_location: Optional[str] = None
    to_location: Optional[str] = None
    departure_date: Optional[str] = None
    return_date: Optional[str] = None
    is_flexible: Optional[bool] = None
    flexible_window: Optional[int] = None
    flexibility_notes: Optional[str] = None
    short_notice_explanation: Optional[str] = None
    purpose: Optional[str] = None
    selected_leads: Optional[List[dict]] = None
    tentative_budget: Optional[float] = None
    budget_breakdown: Optional[dict] = None
    additional_notes: Optional[str] = None
    submit_for_approval: bool = False

class TravelApproval(BaseModel):
    status: str  # 'approved' or 'rejected'
    rejection_reason: Optional[str] = None

# ============= BUDGET REQUEST MODELS =============

# Budget Request Categories (Non-lead/account specific - General company expenses)
BUDGET_CATEGORIES = [
    {'id': 'event_sponsorship_amount', 'label': 'Event Sponsorship - Amount', 'requires_lead': False, 'requires_sku': False},
    {'id': 'event_sponsorship_stock', 'label': 'Event Sponsorship - Stock', 'requires_lead': False, 'requires_sku': True},
    {'id': 'event_participation', 'label': 'Event Participation', 'requires_lead': False, 'requires_sku': False},
    {'id': 'setup_exhibit', 'label': 'Set up Exhibit', 'requires_lead': False, 'requires_sku': False},
    {'id': 'digital_promotion', 'label': 'Digital Promotion', 'requires_lead': False, 'requires_sku': False},
    {'id': 'marketing_collateral', 'label': 'Marketing Collateral', 'requires_lead': False, 'requires_sku': False},
    {'id': 'office_supplies', 'label': 'Office Supplies', 'requires_lead': False, 'requires_sku': False},
    {'id': 'travel_general', 'label': 'General Travel', 'requires_lead': False, 'requires_sku': False},
    {'id': 'other', 'label': 'Other', 'requires_lead': False, 'requires_sku': False},
]

class BudgetLineItem(BaseModel):
    """Single budget line item in a request"""
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    category_id: str
    category_label: str
    
    # Lead info (for customer-related categories)
    lead_id: Optional[str] = None
    lead_name: Optional[str] = None
    lead_city: Optional[str] = None
    
    # SKU info (for stock-based categories)
    sku_id: Optional[str] = None
    sku_name: Optional[str] = None
    bottle_count: Optional[int] = None
    price_per_unit: Optional[float] = None  # From COGS minimum landing price
    
    # Amount
    amount: float = 0
    notes: Optional[str] = None

class BudgetRequest(BaseModel):
    model_config = ConfigDict(extra="ignore")
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    user_id: str
    user_name: Optional[str] = None
    
    # Request Details
    title: str
    description: Optional[str] = None
    
    # Line Items
    line_items: List[BudgetLineItem] = []
    total_amount: float = 0
    
    # Event Details (for event-related categories)
    event_name: Optional[str] = None
    event_date: Optional[str] = None
    event_city: Optional[str] = None
    
    # Status & Workflow
    status: str = 'draft'  # 'draft', 'pending_approval', 'approved', 'rejected', 'cancelled'
    approved_by: Optional[str] = None
    approved_by_name: Optional[str] = None
    approval_date: Optional[datetime] = None
    rejection_reason: Optional[str] = None
    
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    updated_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))

class BudgetRequestCreate(BaseModel):
    title: str
    description: Optional[str] = None
    line_items: List[dict] = []
    event_name: Optional[str] = None
    event_date: Optional[str] = None
    event_city: Optional[str] = None
    submit_for_approval: bool = False

class BudgetRequestUpdate(BaseModel):
    title: Optional[str] = None
    description: Optional[str] = None
    line_items: Optional[List[dict]] = None
    event_name: Optional[str] = None
    event_date: Optional[str] = None
    event_city: Optional[str] = None
    submit_for_approval: bool = False

class BudgetApproval(BaseModel):
    status: str  # 'approved' or 'rejected'
    rejection_reason: Optional[str] = None

# ============= EXPENSE REQUEST MODELS (Lead/Account Level) =============

EXPENSE_TYPES = [
    {'id': 'gifting', 'label': 'Gifting Expense', 'requires_sku': False},
    {'id': 'onboarding', 'label': 'On-boarding Expense', 'requires_sku': False},
    {'id': 'staff_gifting', 'label': 'Staff Gifting Expense', 'requires_sku': False},
    {'id': 'sponsorship', 'label': 'Sponsorship Expense', 'requires_sku': False},
    {'id': 'free_trial', 'label': 'Free Trial Expense', 'requires_sku': True},
]

class ExpenseSKUItem(BaseModel):
    """SKU item for Free Trial expense"""
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    sku_id: str
    sku_name: str
    quantity: int = 0
    minimum_landing_price: float = 0
    total_cost: float = 0  # quantity * minimum_landing_price

class ExpenseRequest(BaseModel):
    """Expense request at Lead or Account level"""
    model_config = ConfigDict(extra="ignore")
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    
    # Entity Reference (either lead or account)
    entity_type: str  # 'lead' or 'account'
    entity_id: str  # lead_id or account_id
    entity_name: Optional[str] = None  # Company/Account name for display
    entity_city: Optional[str] = None  # City for COGS lookup
    
    # Request Info
    expense_type: str  # 'gifting', 'onboarding', 'staff_gifting', 'sponsorship', 'free_trial'
    expense_type_label: Optional[str] = None
    description: Optional[str] = None
    
    # For all expense types except free_trial
    amount: float = 0
    
    # For Free Trial expense specifically
    free_trial_days: Optional[int] = None
    sku_items: List[ExpenseSKUItem] = []
    total_sku_cost: float = 0  # Sum of all SKU item costs
    
    # Requester Info
    user_id: str
    user_name: Optional[str] = None
    
    # Status & Approval Workflow
    status: str = 'draft'  # 'draft', 'pending_approval', 'approved', 'rejected', 'cancelled'
    approved_by: Optional[str] = None
    approved_by_name: Optional[str] = None
    approval_date: Optional[datetime] = None
    rejection_reason: Optional[str] = None
    
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    updated_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))

class ExpenseRequestCreate(BaseModel):
    entity_type: str  # 'lead' or 'account'
    entity_id: str
    expense_type: str
    description: Optional[str] = None
    amount: float = 0
    free_trial_days: Optional[int] = None
    sku_items: List[dict] = []
    submit_for_approval: bool = False

class ExpenseRequestUpdate(BaseModel):
    description: Optional[str] = None
    amount: Optional[float] = None
    free_trial_days: Optional[int] = None
    sku_items: Optional[List[dict]] = None
    submit_for_approval: bool = False

class ExpenseApproval(BaseModel):
    status: str  # 'approved' or 'rejected'
    rejection_reason: Optional[str] = None


class COGSData(BaseModel):
    model_config = ConfigDict(extra="ignore")
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    sku_name: str
    city: str
    
    # User inputs
    primary_packaging_cost: float = 0.0
    secondary_packaging_cost: float = 0.0
    manufacturing_variable_cost: float = 0.0
    gross_margin: float = 0.0
    outbound_logistics_cost: float = 0.0
    distribution_cost: float = 0.0  # Distribution cost percentage
    
    # Custom components defined in master/cogs-components — keyed by component.key
    custom_components: Dict[str, float] = Field(default_factory=dict)
    
    # Computed (stored for reference)
    total_cogs: float = 0.0
    ex_factory_price: float = 0.0
    base_cost: float = 0.0
    minimum_landing_price: float = 0.0
    
    # Metadata
    last_edited_by: Optional[str] = None
    last_edited_at: Optional[datetime] = None
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))

class COGSDataUpdate(BaseModel):
    primary_packaging_cost: Optional[float] = None
    secondary_packaging_cost: Optional[float] = None
    manufacturing_variable_cost: Optional[float] = None
    gross_margin: Optional[float] = None
    outbound_logistics_cost: Optional[float] = None
    distribution_cost: Optional[float] = None  # Distribution cost percentage
    custom_components: Optional[Dict[str, float]] = None  # Custom master-defined components

class Invoice(BaseModel):
    """Invoice data received from ActiveMQ"""
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    invoice_no: str
    invoice_date: str
    gross_invoice_value: float
    net_invoice_value: float
    credit_note_value: float
    ca_lead_id: str  # Our lead_id to match
    c_lead_id: Optional[str] = None  # External reference
    lead_uuid: Optional[str] = None  # Internal lead UUID after matching
    status: str = 'matched'  # 'matched' or 'unmatched'
    received_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))

class UserActivityEvent(BaseModel):
    """Single activity event within a session"""
    type: str  # 'page_view', 'action'
    page: Optional[str] = None
    action: Optional[str] = None
    timestamp: str

class UserActivity(BaseModel):
    """User activity tracking for current session"""
    model_config = ConfigDict(extra="ignore")
    user_id: str
    session_id: str
    session_start: str
    last_active: str
    total_time_seconds: int = 0
    pages_visited: List[dict] = []  # [{page, visit_count, total_time_seconds}]
    actions: List[dict] = []  # [{action, count, last_at}]
    events: List[UserActivityEvent] = []

class ActivityHeartbeat(BaseModel):
    """Heartbeat data sent from frontend"""
    current_page: str
    action: Optional[str] = None

# ============= HELPERS =============

def hash_password(password: str) -> str:
    return bcrypt.hashpw(password.encode('utf-8'), bcrypt.gensalt()).decode('utf-8')

def verify_password(password: str, hashed: str) -> bool:
    return bcrypt.checkpw(password.encode('utf-8'), hashed.encode('utf-8'))

def create_access_token(user_id: str, email: str, role: str) -> str:
    expiration = datetime.now(timezone.utc) + timedelta(hours=JWT_EXPIRATION_HOURS)
    payload = {
        'user_id': user_id,
        'email': email,
        'role': role,
        'exp': expiration
    }
    return jwt.encode(payload, JWT_SECRET, algorithm=JWT_ALGORITHM)

async def get_current_user(request: Request):
    """Get user from cookie or JWT token"""
    return await get_current_user_from_cookie_or_header(request)


async def get_user_or_api_key(request: Request):
    """Authenticate via API key (X-API-Key or 'Authorization: Bearer ak_...') OR fall back to JWT/session.

    When authenticated via API key, returns a synthetic user dict with `is_api_key=True`.
    When the request method+path is not in the key's allowed_endpoints, raises 403.
    """
    from routes.api_keys import authenticate_api_key
    api_user = await authenticate_api_key(request)
    if api_user:
        return api_user
    return await get_current_user_from_cookie_or_header(request)

@api_router.post("/admin/migrate-sku")
async def admin_migrate_sku(request: Request, current_user: dict = Depends(get_current_user)):
    """
    Migrate all references from `from_sku_id` to `to_sku_id` across every
    collection that references SKUs. Supports dry_run=True to preview.
    Body: { from_sku_id, to_sku_id, dry_run: bool }
    """
    if current_user.get('role') not in ('CEO', 'Director', 'System Admin', 'Admin'):
        raise HTTPException(status_code=403, detail="Not authorized")

    body = await request.json()
    from_sku_id = body.get('from_sku_id')
    to_sku_id = body.get('to_sku_id')
    dry_run = bool(body.get('dry_run', True))

    if not from_sku_id or not to_sku_id:
        raise HTTPException(status_code=400, detail="from_sku_id and to_sku_id are required")
    if from_sku_id == to_sku_id:
        raise HTTPException(status_code=400, detail="from_sku_id and to_sku_id must differ")

    tdb = get_tdb()
    from_sku = await tdb.master_skus.find_one({'id': from_sku_id}, {'_id': 0})
    to_sku = await tdb.master_skus.find_one({'id': to_sku_id}, {'_id': 0})
    if not from_sku:
        raise HTTPException(status_code=404, detail=f"from_sku_id {from_sku_id} not found")
    if not to_sku:
        raise HTTPException(status_code=404, detail=f"to_sku_id {to_sku_id} not found")

    from_name = from_sku.get('name') or from_sku.get('sku') or from_sku.get('sku_name')
    to_name = to_sku.get('name') or to_sku.get('sku') or to_sku.get('sku_name')
    counts = {}

    # 1) accounts.sku_pricing[] (name-based)
    counts['accounts.sku_pricing'] = await tdb.accounts.count_documents({'sku_pricing.sku': from_name})
    if not dry_run and counts['accounts.sku_pricing']:
        await tdb.accounts.update_many(
            {'sku_pricing.sku': from_name},
            {'$set': {'sku_pricing.$[elem].sku': to_name}},
            array_filters=[{'elem.sku': from_name}],
        )

    # 2) leads.proposed_sku_pricing[] (id-based)
    counts['leads.proposed_sku_pricing'] = await tdb.leads.count_documents({'proposed_sku_pricing.sku_id': from_sku_id})
    if not dry_run and counts['leads.proposed_sku_pricing']:
        await tdb.leads.update_many(
            {'proposed_sku_pricing.sku_id': from_sku_id},
            {'$set': {
                'proposed_sku_pricing.$[elem].sku_id': to_sku_id,
                'proposed_sku_pricing.$[elem].sku_name': to_name,
            }},
            array_filters=[{'elem.sku_id': from_sku_id}],
        )

    # 3) leads.interested_skus[] (id-based, plain or object)
    interest_str = await tdb.leads.count_documents({'interested_skus': from_sku_id})
    interest_obj = await tdb.leads.count_documents({'interested_skus.sku_id': from_sku_id})
    counts['leads.interested_skus'] = interest_str + interest_obj
    if not dry_run:
        if interest_str:
            await tdb.leads.update_many(
                {'interested_skus': from_sku_id},
                {'$set': {'interested_skus.$[elem]': to_sku_id}},
                array_filters=[{'elem': from_sku_id}],
            )
        if interest_obj:
            await tdb.leads.update_many(
                {'interested_skus.sku_id': from_sku_id},
                {'$set': {
                    'interested_skus.$[elem].sku_id': to_sku_id,
                    'interested_skus.$[elem].sku_name': to_name,
                }},
                array_filters=[{'elem.sku_id': from_sku_id}],
            )

    # 4) cost_cards
    counts['cost_cards'] = await tdb.cost_cards.count_documents({'sku_id': from_sku_id})
    if not dry_run and counts['cost_cards']:
        await tdb.cost_cards.update_many(
            {'sku_id': from_sku_id},
            {'$set': {'sku_id': to_sku_id, 'sku_name': to_name}},
        )

    # 5) cogs_data (by name, optionally by id)
    cogs_by_name = await tdb.cogs_data.count_documents({'sku_name': from_name})
    cogs_by_id = await tdb.cogs_data.count_documents({'sku_id': from_sku_id})
    counts['cogs_data'] = cogs_by_name + cogs_by_id
    if not dry_run:
        if cogs_by_name:
            await tdb.cogs_data.update_many(
                {'sku_name': from_name},
                {'$set': {'sku_name': to_name, 'sku_id': to_sku_id}},
            )
        if cogs_by_id:
            await tdb.cogs_data.update_many(
                {'sku_id': from_sku_id},
                {'$set': {'sku_id': to_sku_id, 'sku_name': to_name}},
            )

    # 6) production_batches
    counts['production_batches'] = await tdb.production_batches.count_documents({'sku_id': from_sku_id})
    if not dry_run and counts['production_batches']:
        await tdb.production_batches.update_many(
            {'sku_id': from_sku_id},
            {'$set': {'sku_id': to_sku_id, 'sku_name': to_name}},
        )

    # 7) account_sku_pricing
    counts['account_sku_pricing'] = await tdb.account_sku_pricing.count_documents({'sku_id': from_sku_id})
    if not dry_run and counts['account_sku_pricing']:
        await tdb.account_sku_pricing.update_many(
            {'sku_id': from_sku_id},
            {'$set': {'sku_id': to_sku_id, 'sku_name': to_name}},
        )

    # 8, 9, 10) shipments / deliveries / invoices items[]
    for coll_name in ('primary_shipments', 'deliveries', 'provisional_invoices', 'invoices'):
        try:
            coll = tdb[coll_name]
            key = f'{coll_name}.items'
            counts[key] = await coll.count_documents({'items.sku_id': from_sku_id})
            if not dry_run and counts[key]:
                await coll.update_many(
                    {'items.sku_id': from_sku_id},
                    {'$set': {
                        'items.$[elem].sku_id': to_sku_id,
                        'items.$[elem].sku_name': to_name,
                    }},
                    array_filters=[{'elem.sku_id': from_sku_id}],
                )
        except Exception:
            counts[f'{coll_name}.items'] = 0

    total_affected = sum(counts.values())
    return {
        'dry_run': dry_run,
        'from': {'id': from_sku_id, 'name': from_name},
        'to': {'id': to_sku_id, 'name': to_name},
        'counts': counts,
        'total_affected': total_affected,
        'message': (
            f"DRY RUN — would update {total_affected} reference(s). Set dry_run=false to apply."
            if dry_run else
            f"Migration complete. Updated {total_affected} reference(s) across "
            f"{sum(1 for v in counts.values() if v > 0)} collection(s)."
        ),
    }


@api_router.post("/admin/backdate-won-leads")
async def backdate_won_leads(request: Request):
    """Admin endpoint to backdate won leads to a specific date"""
    body = await request.json()
    target_date = body.get('target_date', '2026-02-15')
    dry_run = body.get('dry_run', True)
    
    # Parse target date
    try:
        backdate = datetime.strptime(target_date, '%Y-%m-%d').replace(
            hour=12, minute=0, second=0, microsecond=0, tzinfo=timezone.utc
        )
    except ValueError:
        raise HTTPException(status_code=400, detail=f'Invalid date format: {target_date}. Use YYYY-MM-DD')
    
    # Find leads that are WON or converted to accounts
    query = {
        '$or': [
            {'status': 'won'},
            {'converted_to_account': True}
        ]
    }
    
    leads = await get_tdb().leads.find(query, {
        '_id': 0,
        'id': 1,
        'lead_id': 1,
        'company': 1,
        'status': 1,
        'converted_to_account': 1,
        'estimated_value': 1,
        'updated_at': 1
    }).to_list(1000)
    
    total_value = sum(lead.get('estimated_value', 0) or 0 for lead in leads)
    
    result = {
        'dry_run': dry_run,
        'target_date': backdate.isoformat(),
        'leads_found': len(leads),
        'total_estimated_value': total_value,
        'leads': leads
    }
    
    if not dry_run:
        # Perform the update
        lead_ids = [lead['id'] for lead in leads]
        update_result = await get_tdb().leads.update_many(
            {'id': {'$in': lead_ids}},
            {'$set': {'updated_at': backdate.isoformat()}}
        )
        result['leads_updated'] = update_result.modified_count
        result['message'] = f'Successfully updated {update_result.modified_count} leads'
    else:
        result['message'] = 'Dry run - no changes made. Set dry_run: false to apply changes.'
    
    return result


@api_router.post("/admin/setup-production-database")
async def setup_production_database_endpoint(request: Request):
    """TEMPORARY ENDPOINT: Setup production database - REMOVE AFTER USE"""
    
    # Simple security - require exact secret
    body = await request.json()
    secret = body.get('secret', '')
    
    if secret != 'nyla-production-setup-2026':
        raise HTTPException(status_code=403, detail='Invalid secret')
    
    try:
        # Run the setup inline
        surya_id = str(uuid.uuid4())
        vamsi_id = str(uuid.uuid4())
        karanabir_id = str(uuid.uuid4())
        admin_id = str(uuid.uuid4())
        
        # Check if users already exist
        existing_count = await get_tdb().users.count_documents({})
        if existing_count > 5:
            return {'message': 'Database already populated', 'user_count': existing_count}
        
        # Create leadership
        leadership = [
            {
                'id': surya_id,
                'email': 'surya.yadavalli@nylaairwater.earth',
                'password': hash_password('Nyla2026!'),
                'name': 'Surya Yadavalli',
                'role': 'CEO',
                'designation': 'CEO',
                'phone': '+919876543200',
                'city': 'Hyderabad',
                'state': 'Telangana',
                'territory': 'All India',
                'reports_to': None,
                'is_active': True,
                'created_at': datetime.now(timezone.utc).isoformat()
            },
            {
                'id': vamsi_id,
                'email': 'vamsi.bommena@nylaairwater.earth',
                'password': hash_password('Nyla2026!'),
                'name': 'Vamsi Bommena',
                'role': 'Director',
                'designation': 'Director',
                'phone': '+919876543201',
                'city': 'Hyderabad',
                'state': 'Telangana',
                'territory': 'All India',
                'reports_to': surya_id,
                'is_active': True,
                'created_at': datetime.now(timezone.utc).isoformat()
            },
            {
                'id': karanabir_id,
                'email': 'karanabir.gulati@nylaairwater.earth',
                'password': hash_password('Nyla2026!'),
                'name': 'Karanabir Singh Gulati',
                'role': 'Vice President',
                'designation': 'Vice President',
                'phone': '+919876543202',
                'city': 'Delhi',
                'state': 'Delhi',
                'territory': 'All India',
                'reports_to': vamsi_id,
                'is_active': True,
                'created_at': datetime.now(timezone.utc).isoformat()
            },
            {
                'id': admin_id,
                'email': 'admin@nylaairwater.earth',
                'password': hash_password('NylaAdmin2026!'),
                'name': 'System Administrator',
                'role': 'CEO',
                'designation': 'CEO',
                'phone': '+919876543299',
                'city': 'Hyderabad',
                'state': 'Telangana',
                'territory': 'All India',
                'reports_to': None,
                'is_active': True,
                'created_at': datetime.now(timezone.utc).isoformat()
            }
        ]
        
        await get_tdb().users.insert_many(leadership)
        
        # Create sample sales reps (simplified)
        cities = [
            ('Bengaluru', 'Karnataka', 'South India'),
            ('Chennai', 'Tamil Nadu', 'South India'),
            ('Hyderabad', 'Telangana', 'South India'),
            ('Mumbai', 'Maharashtra', 'West India')
        ]
        
        sales_team = []
        for idx, (city, state, territory) in enumerate(cities, 1):
            member = {
                'id': str(uuid.uuid4()),
                'email': f'{city.lower().replace(" ", "")}.sales{idx}@nylaairwater.earth',
                'password': hash_password('Nyla2026!'),
                'name': f'{city} Sales Rep',
                'role': 'Business Development Executive',
                'designation': 'Business Development Executive',
                'city': city,
                'state': state,
                'territory': territory,
                'reports_to': karanabir_id,
                'is_active': True,
                'created_at': datetime.now(timezone.utc).isoformat()
            }
            sales_team.append(member)
        
        await get_tdb().users.insert_many(sales_team)
        
        total_users = len(leadership) + len(sales_team)
        
        return {
            'message': 'Production database setup complete!',
            'users_created': total_users,
            'leadership': 4,
            'sales_team': len(sales_team)
        }
        
    except Exception as e:
        logger.error(f'Setup error: {str(e)}')
        raise HTTPException(status_code=500, detail=f'Setup failed: {str(e)}')

@api_router.post("/admin/populate-lead-statuses")
async def populate_lead_statuses_endpoint(request: Request):
    """Populate lead statuses in production - requires secret"""
    
    body = await request.json()
    secret = body.get('secret', '')
    
    if secret != 'nyla-production-setup-2026':
        raise HTTPException(status_code=403, detail='Invalid secret')
    
    lead_statuses = [
        {"id": "new", "label": "New", "color": "blue", "order": 1, "is_active": True},
        {"id": "qualified", "label": "Qualified", "color": "green", "order": 2, "is_active": True},
        {"id": "contacted", "label": "Contacted", "color": "yellow", "order": 3, "is_active": True},
        {"id": "proposal_internal_review", "label": "Proposal - Internal Review", "color": "purple", "order": 4, "is_active": True},
        {"id": "ready_to_share_proposal", "label": "Ready to Share Proposal", "color": "cyan", "order": 5, "is_active": True},
        {"id": "proposal_shared_with_customer", "label": "Proposal - Shared with Customer", "color": "orange", "order": 6, "is_active": True},
        {"id": "trial_in_progress", "label": "Trial in Progress", "color": "indigo", "order": 7, "is_active": True},
        {"id": "won", "label": "Won", "color": "emerald", "order": 8, "is_active": True},
        {"id": "lost", "label": "Lost", "color": "red", "order": 9, "is_active": True},
        {"id": "not_qualified", "label": "Not Qualified", "color": "gray", "order": 10, "is_active": True}
    ]
    
    # Clear existing and insert new
    await db.lead_statuses.delete_many({})
    await db.lead_statuses.insert_many(lead_statuses)
    
    return {
        "message": "Lead statuses populated successfully",
        "count": len(lead_statuses),
        "statuses": [s["label"] for s in lead_statuses]
    }


# ============= SKU MANAGEMENT =============

class SKUModel(BaseModel):
    """Master SKU Model for the product catalog"""
    model_config = ConfigDict(extra="allow")
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    sku_name: str  # e.g., "20L Premium", "Nyla – 600 ml / Silver"
    external_sku_id: Optional[str] = None  # Identifier used by external systems / integrations
    category: str  # e.g., "Jar", "Bottle", "Premium", "Sparkling", "White Label"
    unit: str  # e.g., "20L", "600ml", "1L x 12"
    base_uom: str = "Bottle"  # Canonical countable base unit (inventory is tracked in this). All packaging units_per_package are expressed in this UOM.
    description: Optional[str] = None
    # When True, accounts can/must set a per-row MRP for this SKU on the
    # Account Detail page; activation will then enforce that MRP > 0. When
    # False (default), the MRP field is hidden in account SKU pricing and
    # activation does not check MRP for rows referencing this SKU.
    allow_custom_mrp: bool = False
    is_active: bool = True
    sort_order: int = 0  # For custom ordering in dropdowns
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    updated_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    created_by: Optional[str] = None

class SKUCreate(BaseModel):
    sku_name: str
    external_sku_id: Optional[str] = None
    category: str
    unit: str
    base_uom: Optional[str] = "Bottle"
    description: Optional[str] = None
    hsn_code: Optional[str] = None  # 4-8 digit HSN code for GST returns + E-way Bill JSON.
    base_price: Optional[float] = None  # ₹ per bottle. Used for Stock Transfer Schedule-I invoicing & E-way Bill valuation.
    mrp: Optional[float] = None  # ₹ Maximum Retail Price. Default MRP for the SKU; pre-fills account-level MRP when custom MRP is allowed.
    standard_price: Optional[float] = None  # ₹ list/standard price shown struck-through in lead proposals
    return_bottle_credit: Optional[float] = None  # ₹ default credit per returned bottle (used in proposals)
    allow_custom_mrp: bool = False
    is_active: bool = True
    sort_order: int = 0
    packaging_config: Optional[dict] = None  # {production: [{id,name,units,is_default}], stock_in: [...], stock_out: [...]}
    cogs_components_values: Optional[Dict[str, Optional[float]]] = None  # {component_key: price_in_rupees}

class SKUUpdate(BaseModel):
    sku_name: Optional[str] = None
    external_sku_id: Optional[str] = None
    category: Optional[str] = None
    unit: Optional[str] = None
    base_uom: Optional[str] = None
    description: Optional[str] = None
    hsn_code: Optional[str] = None  # set to "" to clear effectively
    base_price: Optional[float] = None  # ₹ per bottle (no margin); set to 0 to clear effectively
    mrp: Optional[float] = None  # ₹ Maximum Retail Price (default for the SKU); set to 0 to clear effectively
    standard_price: Optional[float] = None  # ₹ list/standard price shown struck-through in lead proposals
    return_bottle_credit: Optional[float] = None  # ₹ default credit per returned bottle (used in proposals)
    allow_custom_mrp: Optional[bool] = None
    is_active: Optional[bool] = None
    sort_order: Optional[int] = None
    packaging_config: Optional[dict] = None
    cogs_components_values: Optional[Dict[str, Optional[float]]] = None  # merged (not replaced) on PUT; null removes a key

# Default SKUs to seed if database is empty
DEFAULT_SKUS = [
    {'sku_name': '20L Premium', 'category': 'Jar', 'unit': '20L', 'sort_order': 1},
    {'sku_name': '20L Regular', 'category': 'Jar', 'unit': '20L', 'sort_order': 2},
    {'sku_name': '1L Pack (12)', 'category': 'Bottle', 'unit': '1L x 12', 'sort_order': 3},
    {'sku_name': '500ml Pack (24)', 'category': 'Bottle', 'unit': '500ml x 24', 'sort_order': 4},
    {'sku_name': '250ml Pack (48)', 'category': 'Bottle', 'unit': '250ml x 48', 'sort_order': 5},
    {'sku_name': '5L Can', 'category': 'Can', 'unit': '5L', 'sort_order': 6},
    {'sku_name': '2L Bottle', 'category': 'Bottle', 'unit': '2L', 'sort_order': 7},
    {'sku_name': 'Nyla – 600 ml / Silver', 'category': 'Premium', 'unit': '600ml', 'sort_order': 8},
    {'sku_name': 'Nyla – 330 ml / Silver', 'category': 'Premium', 'unit': '330ml', 'sort_order': 9},
    {'sku_name': 'Nyla – 660 ml / Gold', 'category': 'Premium', 'unit': '660ml', 'sort_order': 10},
    {'sku_name': 'Nyla – 330 ml / Gold', 'category': 'Premium', 'unit': '330ml', 'sort_order': 11},
    {'sku_name': 'Nyla – 660 ml / Sparkling', 'category': 'Sparkling', 'unit': '660ml', 'sort_order': 12},
    {'sku_name': 'Nyla – 330 ml / Sparkling', 'category': 'Sparkling', 'unit': '330ml', 'sort_order': 13},
    {'sku_name': '24 Brand', 'category': 'White Label', 'unit': 'Custom', 'sort_order': 14},
]

async def seed_default_skus():
    """Seed default SKUs if the collection is empty"""
    count = await db.master_skus.count_documents({})
    if count == 0:
        for sku_data in DEFAULT_SKUS:
            sku = SKUModel(**sku_data)
            doc = sku.model_dump()
            doc['created_at'] = doc['created_at'].isoformat()
            doc['updated_at'] = doc['updated_at'].isoformat()
            await db.master_skus.insert_one(doc)
        print(f"Seeded {len(DEFAULT_SKUS)} default SKUs")

@api_router.get("/master-skus")
async def get_master_skus(
    include_inactive: bool = False,
    current_user: dict = Depends(get_user_or_api_key)
):
    """Get the master list of all available SKUs from database"""
    # Seed defaults if empty
    await seed_default_skus()
    
    query = {} if include_inactive else {'is_active': {'$ne': False}}
    skus = await db.master_skus.find(query, {'_id': 0}).sort('sort_order', 1).to_list(200)
    
    # Transform to expected format for backward compatibility
    formatted_skus = []
    for sku in skus:
        formatted_skus.append({
            'id': sku.get('id'),
            'sku': sku.get('sku_name'),
            'sku_name': sku.get('sku_name'),
            'external_sku_id': sku.get('external_sku_id'),
            'category': sku.get('category'),
            'unit': sku.get('unit'),
            'base_uom': sku.get('base_uom') or 'Bottle',
            'description': sku.get('description'),
            'hsn_code': sku.get('hsn_code'),
            'base_price': sku.get('base_price'),
            'mrp': sku.get('mrp'),
            'standard_price': sku.get('standard_price'),
            'return_bottle_credit': sku.get('return_bottle_credit'),
            'allow_custom_mrp': bool(sku.get('allow_custom_mrp', False)),
            'is_active': sku.get('is_active', True),
            'sort_order': sku.get('sort_order', 0),
            'packaging_config': sku.get('packaging_config'),
            'cogs_components_values': sku.get('cogs_components_values') or {}
        })
    
    return {'skus': formatted_skus}

@api_router.post("/master-skus")
async def create_sku(
    sku_data: SKUCreate,
    current_user: dict = Depends(get_current_user)
):
    """Create a new SKU in the master list"""
    # Check for duplicate SKU name
    existing = await db.master_skus.find_one({'sku_name': sku_data.sku_name})
    if existing:
        raise HTTPException(status_code=400, detail=f"SKU '{sku_data.sku_name}' already exists")

    # Enforce uniqueness on external_sku_id (when provided)
    if sku_data.external_sku_id:
        ext_dup = await db.master_skus.find_one({'external_sku_id': sku_data.external_sku_id})
        if ext_dup:
            raise HTTPException(status_code=400, detail=f"External SKU ID '{sku_data.external_sku_id}' is already used by another SKU")

    sku = SKUModel(**sku_data.model_dump(), created_by=current_user.get('id'))
    doc = sku.model_dump()
    doc['created_at'] = doc['created_at'].isoformat()
    doc['updated_at'] = doc['updated_at'].isoformat()
    # Add packaging_config if provided
    if sku_data.packaging_config:
        doc['packaging_config'] = sku_data.packaging_config
    
    await db.master_skus.insert_one(doc)
    
    return {
        'id': sku.id,
        'sku': sku.sku_name,
        'sku_name': sku.sku_name,
        'external_sku_id': sku.external_sku_id,
        'category': sku.category,
        'unit': sku.unit,
        'base_uom': doc.get('base_uom') or 'Bottle',
        'description': sku.description,
        'hsn_code': doc.get('hsn_code'),
        'base_price': doc.get('base_price'),
        'mrp': doc.get('mrp'),
        'standard_price': doc.get('standard_price'),
        'return_bottle_credit': doc.get('return_bottle_credit'),
        'allow_custom_mrp': bool(doc.get('allow_custom_mrp', False)),
        'is_active': sku.is_active,
        'sort_order': sku.sort_order,
        'packaging_config': doc.get('packaging_config'),
        'cogs_components_values': doc.get('cogs_components_values') or {}
    }

@api_router.put("/master-skus/{sku_id}")
async def update_sku(
    sku_id: str,
    sku_data: SKUUpdate,
    current_user: dict = Depends(get_current_user)
):
    """Update an existing SKU"""
    existing = await db.master_skus.find_one({'id': sku_id})
    if not existing:
        raise HTTPException(status_code=404, detail="SKU not found")
    
    # Check for duplicate name if changing name
    if sku_data.sku_name and sku_data.sku_name != existing.get('sku_name'):
        duplicate = await db.master_skus.find_one({'sku_name': sku_data.sku_name, 'id': {'$ne': sku_id}})
        if duplicate:
            raise HTTPException(status_code=400, detail=f"SKU '{sku_data.sku_name}' already exists")

    # Enforce uniqueness on external_sku_id (when changing or set)
    if sku_data.external_sku_id and sku_data.external_sku_id != existing.get('external_sku_id'):
        ext_dup = await db.master_skus.find_one({'external_sku_id': sku_data.external_sku_id, 'id': {'$ne': sku_id}})
        if ext_dup:
            raise HTTPException(status_code=400, detail=f"External SKU ID '{sku_data.external_sku_id}' is already used by another SKU")

    update_dict = {k: v for k, v in sku_data.model_dump().items() if v is not None}
    # Merge (not replace) cogs_components_values dict
    if 'cogs_components_values' in update_dict:
        new_vals = update_dict.pop('cogs_components_values') or {}
        existing_vals = existing.get('cogs_components_values') or {}
        merged = {**existing_vals}
        for k, v in new_vals.items():
            if v is None or v == '':
                merged.pop(k, None)
            else:
                try:
                    merged[k] = float(v)
                except (TypeError, ValueError):
                    pass
        update_dict['cogs_components_values'] = merged
    update_dict['updated_at'] = datetime.now(timezone.utc).isoformat()
    
    await db.master_skus.update_one({'id': sku_id}, {'$set': update_dict})

    # If the display name changed, refresh every denormalised snapshot of
    # `sku_name` across transactional collections so downstream views (stock,
    # deliveries, returns, transfers, invoices, …) stop showing the old label.
    # master_skus is global — same renamed name should propagate to every
    # tenant that uses this SKU.
    new_name = update_dict.get('sku_name')
    if new_name and new_name != existing.get('sku_name'):
        try:
            from routes.admin_sku_migration import COLLECTIONS as _SKU_DENORM_COLS
            from routes.admin_sku_migration import EMBEDDED_NAME_ONLY as _SKU_EMBED_COLS
            for col_name, shape in _SKU_DENORM_COLS:
                if shape == "top":
                    await db[col_name].update_many(
                        {"sku_id": sku_id, "sku_name": {"$ne": new_name}},
                        {"$set": {"sku_name": new_name}},
                    )
                else:  # items[]
                    await db[col_name].update_many(
                        {"items.sku_id": sku_id},
                        {"$set": {"items.$[el].sku_name": new_name}},
                        array_filters=[{"el.sku_id": sku_id, "el.sku_name": {"$ne": new_name}}],
                    )
            # Embedded name-only arrays (accounts.sku_pricing[],
            # leads.proposed_sku_pricing[], sampling_trials.sku_plans[]).
            # Only refresh rows already linked via `sku_id` — orphaned rows
            # need the admin to re-link via the "Sync SKU names" tool first.
            for col_name, array_field, name_field in _SKU_EMBED_COLS:
                await db[col_name].update_many(
                    {f"{array_field}.sku_id": sku_id},
                    {"$set": {f"{array_field}.$[el].{name_field}": new_name}},
                    array_filters=[{"el.sku_id": sku_id, f"el.{name_field}": {"$ne": new_name}}],
                )
        except Exception as e:
            # Don't block the rename if rehydration partially fails — admin
            # can always replay /admin/migrations/sku/rehydrate-sku-names.
            logger.exception("SKU rename rehydration failed for sku_id=%s: %s", sku_id, e)
    
    updated = await db.master_skus.find_one({'id': sku_id}, {'_id': 0})
    return {
        'id': updated.get('id'),
        'sku': updated.get('sku_name'),
        'sku_name': updated.get('sku_name'),
        'external_sku_id': updated.get('external_sku_id'),
        'category': updated.get('category'),
        'unit': updated.get('unit'),
        'base_uom': updated.get('base_uom') or 'Bottle',
        'description': updated.get('description'),
        'hsn_code': updated.get('hsn_code'),
        'base_price': updated.get('base_price'),
        'mrp': updated.get('mrp'),
        'standard_price': updated.get('standard_price'),
        'return_bottle_credit': updated.get('return_bottle_credit'),
        'allow_custom_mrp': bool(updated.get('allow_custom_mrp', False)),
        'is_active': updated.get('is_active', True),
        'sort_order': updated.get('sort_order', 0),
        'packaging_config': updated.get('packaging_config'),
        'cogs_components_values': updated.get('cogs_components_values') or {}
    }

@api_router.delete("/master-skus/{sku_id}")
async def delete_sku(
    sku_id: str,
    current_user: dict = Depends(get_current_user)
):
    """Delete (or deactivate) a SKU"""
    existing = await db.master_skus.find_one({'id': sku_id})
    if not existing:
        raise HTTPException(status_code=404, detail="SKU not found")
    
    # Soft delete by marking as inactive instead of hard delete
    await db.master_skus.update_one(
        {'id': sku_id}, 
        {'$set': {'is_active': False, 'updated_at': datetime.now(timezone.utc).isoformat()}}
    )
    
    return {'message': 'SKU deactivated successfully', 'id': sku_id}

@api_router.delete("/master-skus/{sku_id}/permanent")
async def hard_delete_sku(
    sku_id: str,
    current_user: dict = Depends(get_current_user)
):
    """Permanently delete an INACTIVE SKU. Restricted to CEO / Admin / System Admin."""
    role = (current_user.get('role') or '').strip()
    if role not in ('CEO', 'Admin', 'System Admin'):
        raise HTTPException(status_code=403, detail='Only CEO and Admin can permanently delete SKUs')
    existing = await db.master_skus.find_one({'id': sku_id})
    if not existing:
        raise HTTPException(status_code=404, detail="SKU not found")
    if existing.get('is_active', True) is not False:
        raise HTTPException(status_code=400, detail="Only inactive SKUs can be permanently deleted. Deactivate it first.")
    await db.master_skus.delete_one({'id': sku_id})
    return {'message': 'SKU permanently deleted', 'id': sku_id}


@api_router.get("/sku-categories")
async def get_sku_categories(current_user: dict = Depends(get_current_user)):
    """Get list of unique SKU categories"""
    await seed_default_skus()
    categories = await db.master_skus.distinct('category')
    return {'categories': sorted(categories)}


# ── Packaging Types ──────────────────────────────────────────

class PackagingTypeCreate(BaseModel):
    name: str
    units_per_package: int
    description: Optional[str] = None

class PackagingTypeUpdate(BaseModel):
    name: Optional[str] = None
    units_per_package: Optional[int] = None
    description: Optional[str] = None

@api_router.get("/packaging-types")
async def list_packaging_types(current_user: dict = Depends(get_current_user)):
    """Get all packaging types"""
    types = await db.packaging_types.find({}, {"_id": 0}).sort("name", 1).to_list(200)
    return {"packaging_types": types}

@api_router.post("/packaging-types")
async def create_packaging_type(data: PackagingTypeCreate, current_user: dict = Depends(get_current_user)):
    """Create a new packaging type"""
    existing = await db.packaging_types.find_one({"name": data.name})
    if existing:
        raise HTTPException(status_code=400, detail=f"Packaging type '{data.name}' already exists")
    if data.units_per_package <= 0:
        raise HTTPException(status_code=400, detail="Units per package must be > 0")
    now = datetime.now(timezone.utc).isoformat()
    doc = {
        "id": str(uuid.uuid4()),
        "name": data.name,
        "units_per_package": data.units_per_package,
        "description": data.description or "",
        "created_at": now,
        "updated_at": now,
    }
    await db.packaging_types.insert_one(doc)
    doc.pop("_id", None)
    return doc

@api_router.put("/packaging-types/{type_id}")
async def update_packaging_type(type_id: str, data: PackagingTypeUpdate, current_user: dict = Depends(get_current_user)):
    """Update a packaging type"""
    existing = await db.packaging_types.find_one({"id": type_id})
    if not existing:
        raise HTTPException(status_code=404, detail="Packaging type not found")
    if data.name and data.name != existing.get("name"):
        dup = await db.packaging_types.find_one({"name": data.name, "id": {"$ne": type_id}})
        if dup:
            raise HTTPException(status_code=400, detail=f"Packaging type '{data.name}' already exists")
    updates = {"updated_at": datetime.now(timezone.utc).isoformat()}
    if data.name is not None:
        updates["name"] = data.name
    if data.units_per_package is not None:
        if data.units_per_package <= 0:
            raise HTTPException(status_code=400, detail="Units per package must be > 0")
        updates["units_per_package"] = data.units_per_package
    if data.description is not None:
        updates["description"] = data.description
    await db.packaging_types.update_one({"id": type_id}, {"$set": updates})
    updated = await db.packaging_types.find_one({"id": type_id}, {"_id": 0})
    return updated

@api_router.delete("/packaging-types/{type_id}")
async def delete_packaging_type(type_id: str, current_user: dict = Depends(get_current_user)):
    """Delete a packaging type"""
    result = await db.packaging_types.delete_one({"id": type_id})
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Packaging type not found")
    return {"message": "Packaging type deleted"}

@api_router.get("/cogs/{city}")
async def get_cogs_data(city: str, current_user: dict = Depends(get_current_user)):
    """Get COGS data for all SKUs in a city.

    Source of truth = `master_skus` (where is_active != False). The endpoint:
      • returns ONE row per *active* master SKU — never returns rows for SKUs
        that were renamed away or deactivated;
      • lazily backfills `sku_id` on legacy cogs_data rows so future lookups
        can match by id, not name;
      • auto-creates default rows for active SKUs that don't yet have one,
        always stamping the master `sku_id`;
      • overlays per-SKU master COGS values so renames in SKU Management
        propagate automatically.
    """

    tenant_id = get_current_tenant_id()

    # Active master SKUs — the only source of truth for what shows up on the
    # COGS screen. Anything else is legacy noise.
    await seed_default_skus()
    master_sku_docs = await db.master_skus.find(
        {'is_active': {'$ne': False}},
        {'_id': 0, 'id': 1, 'sku_name': 1, 'cogs_components_values': 1, 'category': 1, 'sort_order': 1}
    ).to_list(200)
    active_id_set = {s['id'] for s in master_sku_docs}
    active_name_to_id = {s['sku_name']: s['id'] for s in master_sku_docs}
    master_name_by_id = {s['id']: s['sku_name'] for s in master_sku_docs}
    master_values_by_id = {
        s['id']: (s.get('cogs_components_values') or {}) for s in master_sku_docs
    }
    # Per-SKU ordering metadata so the COGS table mirrors SKU Management's
    # display order: category (alphabetical) → sort_order (asc) → name.
    master_meta_by_id = {
        s['id']: {
            'category': (s.get('category') or 'Other'),
            'sort_order': (s.get('sort_order') if s.get('sort_order') is not None else 0),
        } for s in master_sku_docs
    }

    # Resolve which keys are master-managed (so we know what to overlay)
    try:
        comps = await db.cogs_components.find(
            {'tenant_id': tenant_id},
            {'_id': 0, 'key': 1, 'unit': 1}
        ).to_list(200)
        master_managed_keys = {c['key'] for c in comps if c.get('unit') == 'rupee'}
    except Exception:
        master_managed_keys = set()
    # Always exclude calculator-owned system keys
    master_managed_keys -= {'outbound_logistics_cost', 'distribution_cost', 'gross_margin'}

    # Pull all rows for this city. Some are legacy (no sku_id), some carry the
    # current sku_id, some are orphans from renamed/deactivated SKUs.
    cogs_rows = await get_tdb().cogs_data.find({'city': city}, {'_id': 0}).to_list(500)

    # Backfill `sku_id` on legacy rows by name match (one-shot, persistent).
    # This is what lets the canonical sku_id-based filter work going forward
    # without forcing the user to rebuild every row.
    rows_by_sku_id: dict = {}
    for row in cogs_rows:
        sid = row.get('master_sku_id') or row.get('sku_id')
        if not sid:
            sid = active_name_to_id.get(row.get('sku_name'))
            if sid:
                row['sku_id'] = sid
                await get_tdb().cogs_data.update_one(
                    {'id': row['id']},
                    {'$set': {'sku_id': sid}}
                )
        if not sid or sid not in active_id_set:
            # Orphan — SKU was renamed away / deactivated. Skip.
            continue
        # Always reflect the *current* master name (handles SKU renames).
        row['sku_name'] = master_name_by_id[sid]
        row['sku_id'] = sid
        # If multiple legacy rows exist for the same SKU (rename history),
        # the most-recent one wins.
        existing = rows_by_sku_id.get(sid)
        if existing is None or (row.get('last_edited_at') or '') > (existing.get('last_edited_at') or ''):
            rows_by_sku_id[sid] = row

    # Auto-create a default row for every active SKU that doesn't yet have one.
    # Always stamps the canonical sku_id so we don't create another orphan.
    for sid, sku_name in master_name_by_id.items():
        if sid in rows_by_sku_id:
            continue
        default_data = COGSData(sku_name=sku_name, city=city)
        doc = default_data.model_dump()
        doc['sku_id'] = sid
        doc['created_at'] = doc['created_at'].isoformat()
        if doc.get('last_edited_at'):
            doc['last_edited_at'] = doc['last_edited_at'].isoformat()
        await get_tdb().cogs_data.insert_one(doc)
        rows_by_sku_id[sid] = doc

    cogs_data = list(rows_by_sku_id.values())

    # Get user names for last_edited_by
    user_ids = [c.get('last_edited_by') for c in cogs_data if c.get('last_edited_by')]
    users = await get_tdb().users.find({'id': {'$in': user_ids}}, {'_id': 0, 'id': 1, 'name': 1}).to_list(100)
    user_map = {u['id']: u['name'] for u in users}

    # Overlay master values + add master_sku_id for client-side dispatch
    for data in cogs_data:
        if data.get('last_edited_by'):
            data['editor_name'] = user_map.get(data['last_edited_by'], 'Unknown')
        sid = data['sku_id']
        master_vals = master_values_by_id.get(sid) or {}
        # Defensive: legacy/corrupt rows may store `custom_components` as a list
        # (or other non-dict). Coerce to a dict so the overlay + reads below
        # never crash with "list indices must be integers".
        if not isinstance(data.get('custom_components'), dict):
            data['custom_components'] = {}
        # Overlay master-managed keys (legacy + custom contributors)
        for k, v in master_vals.items():
            if k in master_managed_keys or k not in {'outbound_logistics_cost', 'distribution_cost', 'gross_margin'}:
                # Top-level legacy key (primary/secondary/manufacturing) OR custom key
                if k in {'primary_packaging_cost', 'secondary_packaging_cost', 'manufacturing_variable_cost'}:
                    data[k] = v
                else:
                    cc = data.get('custom_components') or {}
                    cc[k] = v
                    data['custom_components'] = cc
        data['master_sku_id'] = sid
        # Recompute total_cogs / derived fields based on overlaid values
        try:
            # COGS = master-managed components only (primary/secondary/manufacturing + custom).
            # Outbound logistics is NOT part of COGS — it's added post-margin into landing price.
            total_cogs = 0.0
            for k in master_managed_keys:
                if k in {'primary_packaging_cost', 'secondary_packaging_cost', 'manufacturing_variable_cost'}:
                    total_cogs += float(data.get(k) or 0)
                else:
                    total_cogs += float((data.get('custom_components') or {}).get(k) or 0)
            margin_pct = float(data.get('gross_margin') or 0)
            dist_pct = float(data.get('distribution_cost') or 0)
            outbound_logistics = float(data.get('outbound_logistics_cost') or 0)
            gross_margin_rupees = total_cogs * (margin_pct / 100)
            # Logistics is added after margin (it's a passthrough, not a cost-of-goods)
            base_cost = total_cogs + gross_margin_rupees + outbound_logistics
            if dist_pct >= 100:
                landing = 0
            elif dist_pct > 0:
                landing = base_cost / (1 - dist_pct / 100)
            else:
                landing = base_cost
            data['total_cogs'] = round(total_cogs, 2)
            data['ex_factory_price'] = round(base_cost, 2)
            data['base_cost'] = round(base_cost, 2)
            data['minimum_landing_price'] = round(landing, 2)
        except Exception:
            pass

    # Order rows to mirror SKU Management's display: category (alphabetical,
    # case-insensitive) → sort_order (asc) → SKU name. Rows whose master SKU
    # lacks a category fall under "Other" (same as SKU Management).
    def _sku_sort_key(d):
        meta = master_meta_by_id.get(d.get('sku_id')) or {}
        cat = str(meta.get('category') or 'Other').lower()
        try:
            order = float(meta.get('sort_order') or 0)
        except (TypeError, ValueError):
            order = 0.0
        return (cat, order, str(d.get('sku_name') or '').lower())
    cogs_data.sort(key=_sku_sort_key)

    return {'cogs_data': cogs_data}

@api_router.put("/cogs/{sku_id}")
async def update_cogs_data(sku_id: str, updates: COGSDataUpdate, current_user: dict = Depends(get_current_user)):
    """Update COGS data for a SKU.

    Master-managed COGS components (e.g., primary/secondary/manufacturing + any
    custom rupee components in cogs_components master) are stored on the SKU
    master so they apply across all cities. Calculator-owned system columns
    (outbound_logistics_cost, distribution_cost, gross_margin) and editor
    metadata stay on the per-city cogs_data row.
    """
    update_data = updates.model_dump(exclude_none=True)

    # Merge custom_components dict (don't replace whole dict — patch keys)
    if 'custom_components' in update_data:
        patch = update_data.pop('custom_components') or {}
        existing_cc = (await get_tdb().cogs_data.find_one({'id': sku_id}, {'_id': 0, 'custom_components': 1}) or {}).get('custom_components')
        if not isinstance(existing_cc, dict):
            existing_cc = {}  # guard against legacy/corrupt non-dict values
        merged = {**existing_cc, **{k: float(v) for k, v in patch.items() if v is not None}}
        update_data['custom_components'] = merged

    # Look up the cogs_data row's sku_name so we can dispatch master keys to SKU master
    row = await get_tdb().cogs_data.find_one({'id': sku_id}, {'_id': 0, 'sku_name': 1})
    sku_name = (row or {}).get('sku_name')

    # Resolve master-managed rupee component keys (excluding calculator-owned system keys)
    try:
        comps = await db.cogs_components.find(
            {'tenant_id': get_current_tenant_id()},
            {'_id': 0, 'key': 1, 'unit': 1}
        ).to_list(200)
        master_managed_keys = {c['key'] for c in comps if c.get('unit') == 'rupee'}
    except Exception:
        master_managed_keys = set()
    master_managed_keys -= {'outbound_logistics_cost', 'distribution_cost', 'gross_margin'}
    LEGACY_TOP = {'primary_packaging_cost', 'secondary_packaging_cost', 'manufacturing_variable_cost'}

    # Dispatch master-managed values to SKU master (cogs_components_values)
    if sku_name:
        master_patch = {}
        for k in list(update_data.keys()):
            if k in master_managed_keys and k in LEGACY_TOP:
                master_patch[k] = float(update_data[k] or 0)
        # Custom components patches that are master-managed:
        for k, v in (update_data.get('custom_components') or {}).items():
            if k in master_managed_keys:
                master_patch[k] = float(v or 0)
        if master_patch:
            sku_doc = await db.master_skus.find_one({'sku_name': sku_name}, {'_id': 0, 'id': 1, 'cogs_components_values': 1})
            if sku_doc:
                existing_master = sku_doc.get('cogs_components_values')
                if not isinstance(existing_master, dict):
                    existing_master = {}  # guard against legacy/corrupt non-dict values
                merged_master = {**existing_master, **master_patch}
                await db.master_skus.update_one(
                    {'id': sku_doc['id']},
                    {'$set': {
                        'cogs_components_values': merged_master,
                        'updated_at': datetime.now(timezone.utc).isoformat(),
                    }}
                )

    # Calculate computed values
    if any(k in update_data for k in ['primary_packaging_cost', 'secondary_packaging_cost', 'manufacturing_variable_cost', 'gross_margin', 'outbound_logistics_cost', 'distribution_cost', 'custom_components']):
        existing = await get_tdb().cogs_data.find_one({'id': sku_id}, {'_id': 0})
        if existing:
            # Merge with existing data
            primary = update_data.get('primary_packaging_cost', existing.get('primary_packaging_cost', 0))
            secondary = update_data.get('secondary_packaging_cost', existing.get('secondary_packaging_cost', 0))
            manufacturing = update_data.get('manufacturing_variable_cost', existing.get('manufacturing_variable_cost', 0))
            margin = update_data.get('gross_margin', existing.get('gross_margin', 0))
            logistics = update_data.get('outbound_logistics_cost', existing.get('outbound_logistics_cost', 0))
            distribution = update_data.get('distribution_cost', existing.get('distribution_cost', 0))
            cc = update_data.get('custom_components', existing.get('custom_components', {}))
            if not isinstance(cc, dict):
                cc = {}  # guard against legacy/corrupt non-dict values

            # Resolve master config for active components & units
            try:
                active_comps = await db.cogs_components.find(
                    {'tenant_id': get_current_tenant_id(), 'is_active': True},
                    {'_id': 0, 'key': 1, 'unit': 1}
                ).to_list(200)
            except Exception:
                active_comps = []
            active_keys = {c['key']: c.get('unit', 'rupee') for c in active_comps}

            # System calculator columns are always treated as active (they are not in the master).
            SYSTEM_CALC_KEYS = {
                'outbound_logistics_cost': 'rupee',
                'distribution_cost': 'percent',
                'gross_margin': 'percent',
            }

            def _on(key, unit):
                # System columns are always on
                if SYSTEM_CALC_KEYS.get(key) == unit:
                    return True
                # Fail-open if master is empty (legacy behavior)
                if not active_keys:
                    return True
                return active_keys.get(key) == unit

            # Total COGS = sum of all active ₹ master-managed components (legacy + custom).
            # Outbound logistics is NOT part of COGS — added post-margin into landing price below.
            total_cogs = 0.0
            if _on('primary_packaging_cost', 'rupee'):
                total_cogs += float(primary or 0)
            if _on('secondary_packaging_cost', 'rupee'):
                total_cogs += float(secondary or 0)
            if _on('manufacturing_variable_cost', 'rupee'):
                total_cogs += float(manufacturing or 0)
            for k, v in cc.items():
                if active_keys.get(k) == 'rupee':
                    try:
                        total_cogs += float(v or 0)
                    except (TypeError, ValueError):
                        pass

            eff_margin = float(margin or 0) if _on('gross_margin', 'percent') else 0.0
            gross_margin_rupees = total_cogs * (eff_margin / 100)
            ex_factory = total_cogs + gross_margin_rupees
            # Logistics is a passthrough cost added on top of COGS+margin (not part of COGS)
            outbound_logistics = float(logistics or 0) if _on('outbound_logistics_cost', 'rupee') else 0.0
            base_cost = total_cogs + gross_margin_rupees + outbound_logistics

            eff_dist = float(distribution or 0) if _on('distribution_cost', 'percent') else 0.0
            if eff_dist >= 100:
                landing_price = 0
            elif eff_dist > 0:
                landing_price = base_cost / (1 - eff_dist / 100)
            else:
                landing_price = base_cost

            update_data['total_cogs'] = total_cogs
            update_data['ex_factory_price'] = ex_factory
            update_data['base_cost'] = base_cost
            update_data['minimum_landing_price'] = landing_price
    
    # Track editor
    update_data['last_edited_by'] = current_user['id']
    update_data['last_edited_at'] = datetime.now(timezone.utc).isoformat()
    
    result = await get_tdb().cogs_data.update_one({'id': sku_id}, {'$set': update_data})
    
    if result.matched_count == 0:
        raise HTTPException(status_code=404, detail='COGS data not found')
    
    return {'message': 'COGS data updated successfully'}

class CopyCostsRequest(BaseModel):
    source_city: str
    cost_data: list  # List of {sku_name, primary_packaging_cost, secondary_packaging_cost, manufacturing_variable_cost}

@api_router.post("/cogs/copy-costs-to-all-cities")
async def copy_costs_to_all_cities(request: CopyCostsRequest, current_user: dict = Depends(get_current_user)):
    """
    Copy all input field values from one city to all other cities.
    Only CEO, Director, and System Admin can perform this action.
    """
    # Check permission
    if current_user.get('role') not in ['CEO', 'Director', 'System Admin']:
        raise HTTPException(status_code=403, detail="Only CEO, Director, or System Admin can copy values to all cities")
    
    source_city = request.source_city
    cost_data = request.cost_data
    
    # Get all active cities except source
    all_cities = await db.master_cities.find({'is_active': True}, {'name': 1}).to_list(5000)
    target_cities = [c['name'] for c in all_cities if c['name'] != source_city]
    
    if not target_cities:
        raise HTTPException(status_code=400, detail="No other cities to copy to")
    
    # Create a map of SKU name to all input values
    cost_map = {item['sku_name']: {
        'primary_packaging_cost': item.get('primary_packaging_cost', 0),
        'secondary_packaging_cost': item.get('secondary_packaging_cost', 0),
        'manufacturing_variable_cost': item.get('manufacturing_variable_cost', 0),
        'gross_margin': item.get('gross_margin', 0),
        'outbound_logistics_cost': item.get('outbound_logistics_cost', 0),
        'distribution_cost': item.get('distribution_cost', 0)
    } for item in cost_data}
    
    cities_updated = 0
    
    for city in target_cities:
        # Get all COGS data for this city
        city_cogs = await get_tdb().cogs_data.find({'city': city}).to_list(5000)
        
        for cogs_row in city_cogs:
            sku_name = cogs_row.get('sku_name')
            if sku_name in cost_map:
                values = cost_map[sku_name]
                
                # Get all input values
                primary = values['primary_packaging_cost']
                secondary = values['secondary_packaging_cost']
                manufacturing = values['manufacturing_variable_cost']
                margin = values['gross_margin']
                logistics = values['outbound_logistics_cost']
                distribution = values['distribution_cost']
                
                # Recalculate computed fields
                total_cogs = primary + secondary + manufacturing
                gross_margin_rupees = total_cogs * (margin / 100) if margin else 0
                ex_factory = total_cogs + gross_margin_rupees
                base_cost = primary + secondary + manufacturing + gross_margin_rupees + logistics
                
                if distribution >= 100:
                    landing_price = 0
                elif distribution > 0:
                    landing_price = base_cost / (1 - distribution / 100)
                else:
                    landing_price = base_cost
                
                # Update all input fields + recalculated fields
                await get_tdb().cogs_data.update_one(
                    {'id': cogs_row['id']},
                    {'$set': {
                        'primary_packaging_cost': primary,
                        'secondary_packaging_cost': secondary,
                        'manufacturing_variable_cost': manufacturing,
                        'gross_margin': margin,
                        'outbound_logistics_cost': logistics,
                        'distribution_cost': distribution,
                        'total_cogs': total_cogs,
                        'ex_factory_price': ex_factory,
                        'base_cost': base_cost,
                        'minimum_landing_price': landing_price,
                        'last_edited_by': current_user['id'],
                        'last_edited_at': datetime.now(timezone.utc).isoformat()
                    }}
                )
        
        cities_updated += 1
    
    return {
        'message': 'Values copied successfully',
        'source_city': source_city,
        'cities_updated': cities_updated
    }

@api_router.delete("/cogs/{sku_id}")
async def delete_cogs_entry(sku_id: str, current_user: dict = Depends(get_current_user)):
    """
    Delete a COGS entry by ID.
    Only CEO and System Admin can delete COGS entries.
    """
    user_role = current_user.get('role', '').lower()
    if user_role not in ['ceo', 'system admin']:
        raise HTTPException(status_code=403, detail="Only CEO and System Admin can delete COGS entries")
    
    # Find the entry first
    entry = await get_tdb().cogs_data.find_one({'id': sku_id}, {'_id': 0})
    if not entry:
        raise HTTPException(status_code=404, detail="COGS entry not found")
    
    # Delete the entry
    result = await get_tdb().cogs_data.delete_one({'id': sku_id})
    
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="COGS entry not found")
    
    logger.info(f"[COGS] Deleted COGS entry {sku_id} ({entry.get('sku_name')}) by {current_user.get('email')}")
    
    return {
        'success': True,
        'message': f'COGS entry for {entry.get("sku_name")} deleted successfully'
    }

@api_router.delete("/cogs/city/{city}")
async def delete_all_cogs_for_city(city: str, current_user: dict = Depends(get_current_user)):
    """
    Delete all COGS entries for a city.
    Only CEO and System Admin can delete COGS entries.
    """
    user_role = current_user.get('role', '').lower()
    if user_role not in ['ceo', 'system admin']:
        raise HTTPException(status_code=403, detail="Only CEO and System Admin can delete COGS entries")
    
    # Count entries first
    count = await get_tdb().cogs_data.count_documents({'city': city})
    
    if count == 0:
        raise HTTPException(status_code=404, detail=f"No COGS entries found for city: {city}")
    
    # Delete all entries for this city
    result = await get_tdb().cogs_data.delete_many({'city': city})
    
    logger.info(f"[COGS] Deleted {result.deleted_count} COGS entries for city {city} by {current_user.get('email')}")
    
    return {
        'success': True,
        'message': f'Deleted {result.deleted_count} COGS entries for {city}'
    }

@api_router.post("/cogs/cleanup-invalid-skus")
async def cleanup_invalid_skus(current_user: dict = Depends(get_current_user)):
    """
    Delete every cogs_data row that doesn't belong to a *currently active*
    master SKU.

    Orphan detection is sku_id-based:
      • Rows already carrying a `sku_id` are checked against the active master
        SKU id set.
      • Legacy rows without `sku_id` are matched by `sku_name`; matches are
        backfilled in-place, non-matches are deleted.

    Only CEO / Director / System Admin can run this.
    """
    if current_user.get('role') not in ['CEO', 'Director', 'System Admin']:
        raise HTTPException(status_code=403, detail="Not authorized")

    master_skus = await db.master_skus.find(
        {'is_active': True},
        {'_id': 0, 'id': 1, 'sku_name': 1},
    ).to_list(5000)
    active_ids = {s['id'] for s in master_skus if s.get('id')}
    active_name_to_id = {s['sku_name']: s['id'] for s in master_skus if s.get('sku_name')}

    rows = await get_tdb().cogs_data.find({}, {'_id': 0, 'id': 1, 'sku_id': 1, 'master_sku_id': 1, 'sku_name': 1}).to_list(20000)
    orphan_ids: list = []
    backfilled = 0
    orphan_labels: list = []
    for r in rows:
        sid = r.get('sku_id') or r.get('master_sku_id')
        if not sid and r.get('sku_name') in active_name_to_id:
            # Legacy row but the SKU name is still valid — backfill.
            sid = active_name_to_id[r['sku_name']]
            await get_tdb().cogs_data.update_one(
                {'id': r['id']}, {'$set': {'sku_id': sid}}
            )
            backfilled += 1
            continue
        if not sid or sid not in active_ids:
            orphan_ids.append(r['id'])
            orphan_labels.append(r.get('sku_name') or sid or '(unknown)')

    deleted_count = 0
    if orphan_ids:
        result = await get_tdb().cogs_data.delete_many({'id': {'$in': orphan_ids}})
        deleted_count = result.deleted_count

    return {
        'message': 'Cleanup completed',
        'invalid_skus_found': sorted(set(orphan_labels)),
        'records_deleted': deleted_count,
        'records_backfilled': backfilled,
        'master_sku_count': len(active_ids),
    }

# ============= GOOGLE OAUTH AUTH ROUTES =============

@api_router.post("/auth/google-callback")
async def google_oauth_callback(request: Request, response: Response):
    """Handle Google OAuth callback with your own credentials"""
    
    body = await request.json()
    code = body.get('code')
    redirect_uri = body.get('redirect_uri')  # Accept redirect_uri from frontend
    
    if not code:
        raise HTTPException(status_code=400, detail='Authorization code required')
    
    try:
        client_id = os.environ['GOOGLE_OAUTH_CLIENT_ID']
        client_secret = os.environ['GOOGLE_OAUTH_CLIENT_SECRET']
        # Use redirect_uri from request, fallback to env variable
        if not redirect_uri:
            redirect_uri = os.environ.get('GOOGLE_OAUTH_REDIRECT_URI', '')
        
        logger.info(f'Google OAuth callback - redirect_uri: {redirect_uri}, client_id: {client_id[:10]}...')
        
        # Exchange code for tokens
        async with httpx.AsyncClient() as client:
            token_response = await client.post(
                'https://oauth2.googleapis.com/token',
                data={
                    'code': code,
                    'client_id': client_id,
                    'client_secret': client_secret,
                    'redirect_uri': redirect_uri,
                    'grant_type': 'authorization_code'
                }
            )
            
            tokens = token_response.json()
            
            if 'error' in tokens:
                logger.error(f'Google token exchange error: {tokens}')
                error_desc = tokens.get('error_description', tokens.get('error', 'Token exchange failed'))
                raise HTTPException(status_code=400, detail=f'Google auth error: {error_desc}')
            
            # Get user info
            user_info_response = await client.get(
                'https://www.googleapis.com/oauth2/v2/userinfo',
                headers={'Authorization': f"Bearer {tokens['access_token']}"}
            )
            
            user_info = user_info_response.json()
        
        # Get user info from Google
        user_email = user_info['email'].strip().lower()  # Normalize email
        user_name = user_info.get('name', '')
        
        logger.info(f'Google OAuth: Email received: "{user_email}"')
        
        # Case-insensitive email lookup
        existing_user = await get_tdb().users.find_one(
            {'email': {'$regex': f'^{user_email}$', '$options': 'i'}},
            {'_id': 0}
        )
        
        if existing_user:
            logger.info(f'User found: {existing_user["name"]} with role {existing_user["role"]}')
        else:
            logger.warning(f'User NOT found for email: {user_email}')
            # List all emails in database for debugging
            all_emails = await get_tdb().users.find({}, {'_id': 0, 'email': 1}).limit(5).to_list(5)
            logger.warning(f'Sample emails in DB: {[u["email"] for u in all_emails]}')
            
            raise HTTPException(
                status_code=403,
                detail=f'No account found for {user_email}. Please contact your administrator.'
            )
        
        user_id = existing_user['id']
        
        # Update user info
        await get_tdb().users.update_one(
            {'email': user_email},
            {'$set': {
                'name': user_info.get('name', existing_user.get('name')),
                'avatar': user_info.get('picture', ''),
                'updated_at': datetime.now(timezone.utc).isoformat()
            }}
        )
        
        # Create session
        session_token = str(uuid.uuid4())
        expires_at = datetime.now(timezone.utc) + timedelta(days=7)
        
        await db.user_sessions.insert_one({
            'user_id': user_id,
            'session_token': session_token,
            'expires_at': expires_at.isoformat(),
            'created_at': datetime.now(timezone.utc).isoformat()
        })
        
        # Set cookie
        response.set_cookie(
            key='session_token',
            value=session_token,
            httponly=True,
            secure=True,
            samesite='none',  # Required for OAuth callback
            max_age=7*24*60*60,
            path='/'
        )
        
        user_doc = await get_tdb().users.find_one({'id': user_id}, {'_id': 0, 'password': 0})
        
        return {'user': user_doc, 'session_token': session_token, 'message': 'Login successful'}
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f'OAuth callback error: {type(e).__name__}: {str(e)}')
        raise HTTPException(status_code=500, detail=f'Authentication failed: {str(e)}')

@api_router.post("/auth/google-session")
async def exchange_google_session(request: Request, response: Response):
    """Exchange Emergent session_id for user data and create session"""
    
    body = await request.json()
    session_id = body.get('session_id')
    
    if not session_id:
        raise HTTPException(status_code=400, detail='session_id required')
    
    # Call Emergent auth service
    async with httpx.AsyncClient() as client:
        auth_response = await client.get(
            'https://demobackend.emergentagent.com/auth/v1/env/oauth/session-data',
            headers={'X-Session-ID': session_id}
        )
        
        if auth_response.status_code != 200:
            raise HTTPException(status_code=401, detail='Invalid session_id')
        
        user_data = auth_response.json()
    
    # Get user email
    user_email = user_data['email']
    user_name = user_data['name']
    user_picture = user_data.get('picture', '')
    session_token = user_data['session_token']
    
    # Check if user exists in database (MUST be pre-registered by admin)
    existing_user = await get_tdb().users.find_one({'email': user_email}, {'_id': 0})
    
    if not existing_user:
        # User not registered - reject login
        raise HTTPException(
            status_code=403, 
            detail='You do not have access. Please contact your manager to set up your account.'
        )
    
    # User exists - proceed with login
    user_id = existing_user['id']
    
    # Update user info from Google
    await get_tdb().users.update_one(
        {'email': user_email},
        {'$set': {
            'name': user_name,
            'avatar': user_picture,
            'updated_at': datetime.now(timezone.utc).isoformat()
        }}
    )
    
    # Create session
    expires_at = datetime.now(timezone.utc) + timedelta(days=7)
    await db.user_sessions.insert_one({
        'user_id': user_id,
        'session_token': session_token,
        'expires_at': expires_at.isoformat(),
        'created_at': datetime.now(timezone.utc).isoformat()
    })
    
    # Set httpOnly cookie
    response.set_cookie(
        key='session_token',
        value=session_token,
        httponly=True,
        secure=True,
        samesite='none',
        max_age=7*24*60*60,
        path='/'
    )
    
    # Return user data
    user_doc = await get_tdb().users.find_one({'id': user_id}, {'_id': 0, 'password': 0})
    
    return {
        'user': user_doc,
        'session_token': session_token
    }

async def get_current_user_from_cookie_or_header(request: Request):
    """Get user from session_token cookie or Authorization header"""
    
    # Try cookie first
    session_token = request.cookies.get('session_token')
    
    # Fall back to Authorization header
    if not session_token:
        auth_header = request.headers.get('Authorization')
        if auth_header and auth_header.startswith('Bearer '):
            session_token = auth_header.replace('Bearer ', '')
    
    if not session_token:
        raise HTTPException(status_code=401, detail='Not authenticated')
    
    # Find session
    session_doc = await db.user_sessions.find_one({'session_token': session_token}, {'_id': 0})
    if not session_doc:
        raise HTTPException(status_code=401, detail='Invalid session')
    
    # Check expiry
    expires_at = session_doc['expires_at']
    if isinstance(expires_at, str):
        expires_at = datetime.fromisoformat(expires_at)
    if expires_at.tzinfo is None:
        expires_at = expires_at.replace(tzinfo=timezone.utc)
    
    if expires_at < datetime.now(timezone.utc):
        raise HTTPException(status_code=401, detail='Session expired')
    
    # Get user - use global db, NOT tenant-filtered, since user lookup should work across tenants
    user_doc = await db.users.find_one({'id': session_doc['user_id']}, {'_id': 0, 'password': 0})
    if not user_doc:
        raise HTTPException(status_code=401, detail='User not found')
    
    return user_doc

@api_router.get("/auth/me")
async def get_current_user_info(request: Request):
    """Get current authenticated user"""
    user = await get_current_user_from_cookie_or_header(request)
    return user

class LogoutData(BaseModel):
    time_spent: Optional[int] = 0
    due_to_inactivity: Optional[bool] = False

@api_router.post("/auth/logout")
async def logout_user(request: Request, response: Response, data: LogoutData = None):
    """Logout user by deleting session"""
    
    session_token = request.cookies.get('session_token')
    
    if session_token:
        # Get session info before deleting
        session = await db.user_sessions.find_one({'session_token': session_token}, {'_id': 0})
        
        if session:
            user_id = session.get('user_id')
            now = datetime.now(timezone.utc)
            
            # Calculate time spent (from request body or calculate from session)
            time_spent = data.time_spent if data else 0
            
            # Update user's last login info
            update_data = {
                'last_logout_at': now.isoformat(),
                'last_session_duration': time_spent,
            }
            
            # If logout due to inactivity, mark it
            if data and data.due_to_inactivity:
                update_data['last_logout_reason'] = 'inactivity'
            else:
                update_data['last_logout_reason'] = 'manual'
            
            # Update user record
            await get_tdb().users.update_one(
                {'id': user_id},
                {'$set': update_data, '$inc': {'total_time_spent': time_spent}}
            )
        
        await db.user_sessions.delete_one({'session_token': session_token})
        response.delete_cookie('session_token', path='/')
    
    return {'message': 'Logged out successfully'}

# ============= USER ACTIVITY TRACKING =============

@api_router.post("/activity/heartbeat")
async def activity_heartbeat(data: ActivityHeartbeat, request: Request):
    """Record user activity heartbeat - called every 30 seconds from frontend"""
    try:
        user = await get_current_user_from_cookie_or_header(request)
    except:
        return {'status': 'skipped', 'reason': 'not authenticated'}
    
    user_id = user['id']
    session_token = request.cookies.get('session_token') or request.headers.get('Authorization', '').replace('Bearer ', '')
    now = datetime.now(timezone.utc).isoformat()
    
    # Get or create activity record for this session
    activity = await db.user_activity.find_one({
        'user_id': user_id,
        'session_id': session_token
    }, {'_id': 0})
    
    if not activity:
        # Create new activity record
        activity = {
            'user_id': user_id,
            'session_id': session_token,
            'session_start': now,
            'last_active': now,
            'total_time_seconds': 0,
            'pages_visited': [],
            'actions': [],
            'events': []
        }
        await db.user_activity.insert_one(activity)
    
    # Calculate time since last heartbeat
    last_active = activity.get('last_active', now)
    if isinstance(last_active, str):
        last_active_dt = datetime.fromisoformat(last_active.replace('Z', '+00:00'))
    else:
        last_active_dt = last_active
    
    now_dt = datetime.now(timezone.utc)
    time_diff = (now_dt - last_active_dt).total_seconds()
    
    # Only count time if less than 60 seconds (user was active)
    time_to_add = min(time_diff, 60) if time_diff < 120 else 0
    
    # Update pages visited
    pages_visited = activity.get('pages_visited', [])
    page_found = False
    for page in pages_visited:
        if page['page'] == data.current_page:
            page['visit_count'] += 1
            page['total_time_seconds'] += int(time_to_add)
            page['last_visit'] = now
            page_found = True
            break
    
    if not page_found:
        pages_visited.append({
            'page': data.current_page,
            'visit_count': 1,
            'total_time_seconds': int(time_to_add),
            'first_visit': now,
            'last_visit': now
        })
    
    # Update actions if provided
    actions = activity.get('actions', [])
    if data.action:
        action_found = False
        for action in actions:
            if action['action'] == data.action:
                action['count'] += 1
                action['last_at'] = now
                action_found = True
                break
        
        if not action_found:
            actions.append({
                'action': data.action,
                'count': 1,
                'first_at': now,
                'last_at': now
            })
    
    # Add event to timeline (keep last 100 events)
    events = activity.get('events', [])
    event = {
        'type': 'action' if data.action else 'page_view',
        'page': data.current_page,
        'action': data.action,
        'timestamp': now
    }
    events.append(event)
    if len(events) > 100:
        events = events[-100:]
    
    # Update activity record
    await db.user_activity.update_one(
        {'user_id': user_id, 'session_id': session_token},
        {'$set': {
            'last_active': now,
            'total_time_seconds': activity.get('total_time_seconds', 0) + int(time_to_add),
            'pages_visited': pages_visited,
            'actions': actions,
            'events': events
        }}
    )
    
    # Also update the user's last_active field
    await get_tdb().users.update_one(
        {'id': user_id},
        {'$set': {'last_active': now}}
    )
    
    return {'status': 'ok', 'time_added': int(time_to_add)}

@api_router.get("/activity/my-session")
async def get_my_session_activity(request: Request):
    """Get current user's session activity"""
    user = await get_current_user_from_cookie_or_header(request)
    session_token = request.cookies.get('session_token') or request.headers.get('Authorization', '').replace('Bearer ', '')
    
    activity = await db.user_activity.find_one({
        'user_id': user['id'],
        'session_id': session_token
    }, {'_id': 0})
    
    if not activity:
        return {
            'session_start': datetime.now(timezone.utc).isoformat(),
            'last_active': datetime.now(timezone.utc).isoformat(),
            'total_time_seconds': 0,
            'pages_visited': [],
            'actions': [],
            'events': []
        }
    
    return activity

@api_router.get("/activity/user/{user_id}")
async def get_user_activity(user_id: str, current_user: dict = Depends(get_current_user)):
    """Get a specific user's last session activity (for team management view)"""
    # Get the user's most recent activity record
    activity = await db.user_activity.find_one(
        {'user_id': user_id},
        {'_id': 0},
        sort=[('last_active', -1)]
    )
    
    # Get user's last_active from users collection
    user_doc = await get_tdb().users.find_one({'id': user_id}, {'_id': 0, 'last_active': 1})
    last_active = user_doc.get('last_active') if user_doc else None
    
    if not activity:
        return {
            'user_id': user_id,
            'last_active': last_active,
            'session_start': None,
            'total_time_seconds': 0,
            'pages_visited': [],
            'actions': [],
            'events': []
        }
    
    activity['last_active'] = last_active or activity.get('last_active')
    return activity

@api_router.get("/activity/team")
async def get_team_activity(current_user: dict = Depends(get_current_user)):
    """Get activity summary for all team members"""
    # Get all users
    users = await get_tdb().users.find({}, {'_id': 0, 'id': 1, 'name': 1, 'last_active': 1}).to_list(1000)
    
    result = []
    for user in users:
        # Get most recent activity for each user
        activity = await db.user_activity.find_one(
            {'user_id': user['id']},
            {'_id': 0, 'session_start': 1, 'total_time_seconds': 1, 'pages_visited': 1, 'actions': 1, 'events': 1},
            sort=[('last_active', -1)]
        )
        
        result.append({
            'user_id': user['id'],
            'name': user.get('name', 'Unknown'),
            'last_active': user.get('last_active'),
            'session': activity if activity else {
                'session_start': None,
                'total_time_seconds': 0,
                'pages_visited': [],
                'actions': [],
                'events': []
            }
        })
    
    return result

# ============= AUTH ROUTES =============

@api_router.post("/auth/register", response_model=User)
async def register(user_input: UserCreate):
    # Check if user exists
    existing = await get_tdb().users.find_one({'email': user_input.email}, {'_id': 0})
    if existing:
        raise HTTPException(status_code=400, detail='Email already registered')
    
    # Create user
    hashed_pw = hash_password(user_input.password)
    user_data = user_input.model_dump()
    user_data.pop('password')
    user_obj = User(**user_data)
    
    doc = user_obj.model_dump()
    doc['password'] = hashed_pw
    doc['created_at'] = doc['created_at'].isoformat()
    
    await get_tdb().users.insert_one(doc)
    return user_obj

@api_router.post("/auth/login")
async def login(credentials: UserLogin, request: Request, response: Response):
    # Use db directly (not get_tdb) for login since we don't have tenant context yet
    user_doc = await db.users.find_one({'email': credentials.email}, {'_id': 0})
    if not user_doc or not verify_password(credentials.password, user_doc['password']):
        raise HTTPException(status_code=401, detail='Invalid credentials')
    
    if not user_doc.get('is_active', True):
        raise HTTPException(status_code=401, detail='Account is inactive')
    
    # Create session token (same as Google OAuth flow)
    session_token = str(uuid.uuid4())
    expires_at = datetime.now(timezone.utc) + timedelta(days=7)
    now = datetime.now(timezone.utc)
    
    # Get client IP and user agent
    client_ip = request.headers.get('X-Forwarded-For', request.client.host if request.client else 'unknown')
    if client_ip and ',' in client_ip:
        client_ip = client_ip.split(',')[0].strip()
    user_agent = request.headers.get('User-Agent', 'unknown')
    
    # Store session in database
    await db.user_sessions.insert_one({
        'user_id': user_doc['id'],
        'session_token': session_token,
        'expires_at': expires_at.isoformat(),
        'created_at': now.isoformat(),
        'client_ip': client_ip,
        'user_agent': user_agent
    })
    
    # Update user's last login info
    await get_tdb().users.update_one(
        {'id': user_doc['id']},
        {'$set': {
            'last_login_at': now.isoformat(),
            'last_login_ip': client_ip,
            'last_login_user_agent': user_agent
        }}
    )
    
    # Set httpOnly cookie
    response.set_cookie(
        key='session_token',
        value=session_token,
        httponly=True,
        secure=True,
        samesite='none',
        max_age=7*24*60*60,
        path='/'
    )
    
    user_doc.pop('password')
    if isinstance(user_doc['created_at'], str):
        user_doc['created_at'] = datetime.fromisoformat(user_doc['created_at'])
    
    # Include distributor-specific fields in response
    return {
        'user': user_doc,
        'session_token': session_token,
        'force_password_change': user_doc.get('force_password_change', False),
        'distributor_id': user_doc.get('distributor_id')
    }

@api_router.get("/auth/me", response_model=User)
async def get_me(current_user: dict = Depends(get_current_user)):
    if isinstance(current_user['created_at'], str):
        current_user['created_at'] = datetime.fromisoformat(current_user['created_at'])
    return current_user


class PasswordChangeRequest(BaseModel):
    current_password: str
    new_password: str


@api_router.post("/auth/change-password")
async def change_password(
    request: PasswordChangeRequest,
    current_user: dict = Depends(get_current_user)
):
    """Change user password (also clears force_password_change flag)"""
    # Verify current password
    user_doc = await db.users.find_one({'id': current_user['id']}, {'_id': 0})
    if not user_doc:
        raise HTTPException(status_code=404, detail='User not found')
    
    if not verify_password(request.current_password, user_doc.get('password', '')):
        raise HTTPException(status_code=401, detail='Current password is incorrect')
    
    # Validate new password
    if len(request.new_password) < 6:
        raise HTTPException(status_code=400, detail='New password must be at least 6 characters')
    
    # Update password and clear force_password_change flag
    new_hashed = hash_password(request.new_password)
    await db.users.update_one(
        {'id': current_user['id']},
        {'$set': {
            'password': new_hashed,
            'force_password_change': False,
            'updated_at': datetime.now(timezone.utc).isoformat()
        }}
    )
    
    return {'message': 'Password changed successfully'}

# ============= DASHBOARD ROUTES =============

def calculate_lead_score(lead: dict) -> int:
    """Calculate win probability score for a lead (0-100)"""
    score = 0
    
    # Status progression scoring (max 40 points)
    status_scores = {
        'new': 10,
        'contacted': 20,
        'qualified': 35,
        'proposal_sent': 50,
        'proposal_shared': 55,
        'proposal_submitted': 60,
        'negotiation': 75,
        'won': 100,
        'lost': 0,
        'closed_lost': 0
    }
    status = lead.get('status', 'new')
    score += status_scores.get(status, 10) * 0.4  # 40% weight
    
    # Activity count in last 7 days (max 30 points)
    # This will be calculated separately with actual activity data
    
    # Days since last contact (max 30 points)
    # More recent = higher score
    
    return int(score)

@api_router.get("/dashboard")
async def get_dashboard_data(current_user: dict = Depends(get_current_user)):
    """Get comprehensive dashboard data for the logged-in user"""
    user_id = current_user['id']
    user_role = current_user.get('role', '')
    today = datetime.now(timezone.utc).date()
    today_str = today.isoformat()
    
    # Calculate date ranges
    week_from_now = (today + timedelta(days=7)).isoformat()
    week_ago = (today - timedelta(days=7)).isoformat()
    month_start = today.replace(day=1).isoformat()
    
    # For managers (CEO, Director, VP, NSH), also show leads from their team
    team_user_ids = [user_id]
    manager_roles = ['CEO', 'Director', 'Vice President', 'National Sales Head']
    if user_role in manager_roles:
        # Get all users who report to this user (direct reports)
        subordinates = await get_tdb().users.find(
            {'reports_to': user_id, 'is_active': True},
            {'_id': 0, 'id': 1}
        ).to_list(length=100)
        team_user_ids.extend([s['id'] for s in subordinates])
    
    # 1. ACTION ITEMS - Tasks assigned to OR created by user
    tasks_cursor = db.tasks.find({
        '$or': [
            {'assigned_to': user_id},
            {'created_by': user_id}
        ],
        'status': {'$in': ['pending', 'in_progress']}
    }, {'_id': 0}).sort('due_date', 1).limit(10)
    tasks = await tasks_cursor.to_list(length=10)
    
    # 2. OVERDUE FOLLOW-UPS - Leads with past follow-up dates assigned to user or team
    overdue_leads_cursor = db.leads.find({
        'assigned_to': {'$in': team_user_ids},
        'next_followup_date': {'$lt': today_str, '$ne': None},
        'status': {'$nin': ['won', 'lost', 'closed_won', 'closed_lost']}
    }, {'_id': 0, 'id': 1, 'lead_id': 1, 'company': 1, 'next_followup_date': 1, 'status': 1, 'contact_person': 1, 'phone': 1, 'assigned_to': 1}).limit(10)
    overdue_leads = await overdue_leads_cursor.to_list(length=10)
    
    # Add assigned_to_name for team leads and normalize field name
    for lead in overdue_leads:
        lead['next_follow_up'] = lead.pop('next_followup_date', None)
        if lead.get('assigned_to') and lead['assigned_to'] != user_id:
            assignee = await get_tdb().users.find_one({'id': lead['assigned_to']}, {'_id': 0, 'name': 1})
            lead['assigned_to_name'] = assignee.get('name') if assignee else None
    
    # 3. UPCOMING LEADS - Leads with future follow-up dates within a week
    upcoming_leads_cursor = db.leads.find({
        'assigned_to': {'$in': team_user_ids},
        'next_followup_date': {'$gte': today_str, '$lte': week_from_now},
        'status': {'$nin': ['won', 'lost', 'closed_won', 'closed_lost']}
    }, {'_id': 0, 'id': 1, 'lead_id': 1, 'company': 1, 'next_followup_date': 1, 'status': 1, 'contact_person': 1, 'phone': 1, 'assigned_to': 1}).sort('next_followup_date', 1).limit(10)
    upcoming_leads = await upcoming_leads_cursor.to_list(length=10)
    
    # Add assigned_to_name for team leads and normalize field name
    for lead in upcoming_leads:
        lead['next_follow_up'] = lead.pop('next_followup_date', None)
        if lead.get('assigned_to') and lead['assigned_to'] != user_id:
            assignee = await get_tdb().users.find_one({'id': lead['assigned_to']}, {'_id': 0, 'name': 1})
            lead['assigned_to_name'] = assignee.get('name') if assignee else None
    
    # 3b. UPCOMING ACCOUNTS - Accounts with future follow-up dates within a week
    upcoming_accounts_cursor = db.accounts.find({
        'assigned_to': {'$in': team_user_ids},
        'next_follow_up': {'$gte': today_str, '$lte': week_from_now}
    }, {'_id': 0, 'id': 1, 'account_id': 1, 'account_name': 1, 'next_follow_up': 1, 'contact_name': 1, 'contact_number': 1, 'assigned_to': 1}).sort('next_follow_up', 1).limit(10)
    upcoming_accounts = await upcoming_accounts_cursor.to_list(length=10)
    
    # Add assigned_to_name and mark as account type
    for account in upcoming_accounts:
        account['type'] = 'account'
        if account.get('assigned_to') and account['assigned_to'] != user_id:
            assignee = await get_tdb().users.find_one({'id': account['assigned_to']}, {'_id': 0, 'name': 1})
            account['assigned_to_name'] = assignee.get('name') if assignee else None
    
    # Mark leads with their type
    for lead in upcoming_leads:
        lead['type'] = 'lead'
    
    # Combine and sort upcoming follow-ups (leads + accounts)
    combined_upcoming = upcoming_leads + upcoming_accounts
    combined_upcoming.sort(key=lambda x: x.get('next_follow_up', ''))
    
    # 4. SMART LEAD RECOMMENDATIONS - Leads likely to close
    # Get all active leads for the user
    all_leads_cursor = db.leads.find({
        'assigned_to': user_id,
        'status': {'$nin': ['won', 'lost', 'closed_won', 'closed_lost']}
    }, {'_id': 0})
    all_leads = await all_leads_cursor.to_list(length=100)
    
    # Calculate scores for each lead
    for lead in all_leads:
        lead_id = lead.get('id')
        
        # Base score from status
        score = calculate_lead_score(lead)
        
        # Get activity count in last 7 days
        activity_count = await get_tdb().lead_activities.count_documents({
            'lead_id': lead_id,
            'created_at': {'$gte': week_ago}
        })
        # Activity score (max 30 points) - more activities = higher score
        activity_score = min(activity_count * 5, 30)
        score += activity_score
        
        # Days since last contact score (max 30 points)
        last_activity = await get_tdb().lead_activities.find_one(
            {'lead_id': lead_id},
            sort=[('created_at', -1)]
        )
        if last_activity:
            last_contact_str = last_activity.get('created_at', '')
            if last_contact_str:
                try:
                    last_contact = datetime.fromisoformat(last_contact_str.replace('Z', '+00:00'))
                    days_since = (datetime.now(timezone.utc) - last_contact).days
                    # Recent contact gets higher score
                    if days_since <= 1:
                        score += 30
                    elif days_since <= 3:
                        score += 25
                    elif days_since <= 7:
                        score += 15
                    elif days_since <= 14:
                        score += 5
                    # Older than 14 days = 0 additional points
                except:
                    pass
        
        lead['win_score'] = min(int(score), 100)
    
    # Sort by win score and get top recommendations
    recommended_leads = sorted(all_leads, key=lambda x: x.get('win_score', 0), reverse=True)[:5]
    # Simplify the data
    recommended_leads = [{
        'id': l['id'],
        'lead_id': l.get('lead_id'),
        'company': l.get('company'),
        'status': l.get('status'),
        'contact_person': l.get('contact_person'),
        'phone': l.get('phone'),
        'win_score': l.get('win_score', 0),
        'next_follow_up': l.get('next_follow_up')
    } for l in recommended_leads]
    
    # 5. UPCOMING MEETINGS - Next 7 days
    meetings_cursor = db.meetings.find({
        '$or': [
            {'organizer_id': user_id},
            {'attendees': current_user.get('email')}
        ],
        'meeting_date': {'$gte': today_str, '$lte': week_from_now},
        'status': {'$ne': 'cancelled'}
    }, {'_id': 0}).sort([('meeting_date', 1), ('start_time', 1)]).limit(10)
    upcoming_meetings = await meetings_cursor.to_list(length=10)
    
    # 6. TODAY'S ACTIVITY SUMMARY
    today_activities = await get_tdb().lead_activities.count_documents({
        'created_by': user_id,
        'created_at': {'$gte': today_str}
    })
    
    today_calls = await get_tdb().lead_activities.count_documents({
        'created_by': user_id,
        'created_at': {'$gte': today_str},
        'activity_type': {'$in': ['call', 'phone']}
    })
    
    today_emails = await get_tdb().lead_activities.count_documents({
        'created_by': user_id,
        'created_at': {'$gte': today_str},
        'activity_type': 'email'
    })
    
    today_meetings_count = await get_tdb().lead_activities.count_documents({
        'created_by': user_id,
        'created_at': {'$gte': today_str},
        'activity_type': {'$in': ['meeting', 'visit']}
    })
    
    # 7. SALES PIPELINE - Leads by status (using dynamic statuses)
    pipeline_stats = []
    
    # Get dynamic statuses from lead_statuses collection
    dynamic_statuses = await db.lead_statuses.find({'is_active': True}, {'_id': 0, 'id': 1, 'label': 1, 'order': 1}).sort('order', 1).to_list(20)
    
    # Determine if user should see all leads or just their own
    user_role = current_user.get('role', '').lower()
    is_leadership = user_role in ['ceo', 'director', 'vp', 'vice president', 'national sales head']
    
    if dynamic_statuses:
        # Use dynamic statuses
        for status_doc in dynamic_statuses:
            status_id = status_doc['id']
            # Leadership sees all leads, others see only assigned leads
            query = {'status': status_id}
            if not is_leadership:
                query['assigned_to'] = user_id
            
            count = await get_tdb().leads.count_documents(query)
            pipeline_stats.append({
                'status': status_id,
                'label': status_doc.get('label', status_id),
                'count': count
            })
    else:
        # Fallback to hardcoded statuses if no dynamic statuses exist
        status_list = ['new', 'contacted', 'qualified', 'proposal_sent', 'negotiation', 'won', 'lost']
        for status in status_list:
            query = {'status': status}
            if not is_leadership:
                query['assigned_to'] = user_id
            
            count = await get_tdb().leads.count_documents(query)
            pipeline_stats.append({'status': status, 'label': status.replace('_', ' ').title(), 'count': count})
    
    # 8. MONTHLY TARGETS VS ACTUALS
    # Get user's sales target for current month
    current_month = today.strftime('%Y-%m')
    target_doc = await db.sales_targets.find_one({
        'user_id': user_id,
        'month': current_month
    }, {'_id': 0})
    
    monthly_target = target_doc.get('target_amount', 0) if target_doc else 0
    
    # Calculate actual revenue from won leads this month
    won_leads_cursor = db.leads.find({
        'assigned_to': user_id,
        'status': 'won',
        'updated_at': {'$gte': month_start}
    }, {'_id': 0, 'expected_value': 1})
    won_leads = await won_leads_cursor.to_list(length=100)
    actual_revenue = sum(lead.get('expected_value', 0) or 0 for lead in won_leads)
    
    # 9. RECENT ACTIVITIES FEED - Last 10 activities
    recent_activities_cursor = db.lead_activities.find({
        'created_by': user_id
    }, {'_id': 0}).sort('created_at', -1).limit(10)
    recent_activities = await recent_activities_cursor.to_list(length=10)
    
    # Enrich with lead company names
    for activity in recent_activities:
        lead_id = activity.get('lead_id')
        if lead_id:
            lead = await get_tdb().leads.find_one({'id': lead_id}, {'_id': 0, 'company': 1})
            activity['company'] = lead.get('company') if lead else 'Unknown'
    
    return {
        'action_items': {
            'tasks': tasks,
            'overdue_follow_ups': overdue_leads
        },
        'upcoming_leads': combined_upcoming,  # Now includes both leads and accounts
        'recommended_leads': recommended_leads,
        'upcoming_meetings': upcoming_meetings,
        'today_summary': {
            'total_activities': today_activities,
            'calls': today_calls,
            'emails': today_emails,
            'meetings': today_meetings_count
        },
        'pipeline': pipeline_stats,
        'monthly_performance': {
            'target': monthly_target,
            'actual': actual_revenue,
            'percentage': round((actual_revenue / monthly_target * 100) if monthly_target > 0 else 0, 1)
        },
        'recent_activities': recent_activities
    }

@api_router.get("/employee-insights")
async def get_employee_insights(current_user: dict = Depends(get_current_user)):
    """Get comprehensive employee insights including CTC, revenue, and expenses"""
    
    user_id = current_user['id']
    user_role = current_user.get('role', '').lower()
    
    # Get full user data including HR fields
    user_data = await get_tdb().users.find_one({'id': user_id}, {'_id': 0})
    if not user_data:
        raise HTTPException(status_code=404, detail='User not found')
    
    # Check if user can view sensitive HR data (CEO, Director, Admin, VP)
    can_view_hr_data = user_role in ['ceo', 'director', 'admin', 'vp', 'vice president']
    
    ctc_monthly = user_data.get('ctc_monthly', 0) or 0
    joining_date_str = user_data.get('joining_date')
    
    # Calculate days/months since joining
    today = datetime.now(timezone.utc).date()
    days_since_joining = 0
    months_since_joining = 0
    ctc_till_date = 0
    
    if joining_date_str:
        try:
            joining_date = datetime.strptime(joining_date_str, '%Y-%m-%d').date()
            days_since_joining = (today - joining_date).days
            months_since_joining = max(1, days_since_joining // 30)  # Approximate months
            ctc_till_date = ctc_monthly * months_since_joining
        except:
            pass
    
    # Calculate total revenue from WON leads (since joining or all time)
    revenue_query = {
        'assigned_to': user_id,
        'status': 'won'
    }
    if joining_date_str:
        revenue_query['updated_at'] = {'$gte': joining_date_str}
    
    won_leads = await get_tdb().leads.find(revenue_query, {'_id': 0, 'expected_value': 1, 'actual_value': 1}).to_list(1000)
    total_revenue = sum(lead.get('actual_value') or lead.get('expected_value', 0) or 0 for lead in won_leads)
    
    # Calculate total accounts revenue (from invoices)
    accounts_revenue = 0
    try:
        # Get accounts assigned to this user
        user_accounts = await get_tdb().accounts.find({'sales_owner_id': user_id}, {'_id': 0, 'id': 1, 'account_id': 1}).to_list(500)
        account_ids = [acc.get('id') or acc.get('account_id') for acc in user_accounts]
        
        if account_ids:
            # Sum invoice values for these accounts
            invoice_pipeline = [
                {'$match': {'account_id': {'$in': account_ids}}},
                {'$group': {'_id': None, 'total': {'$sum': '$grand_total'}}}
            ]
            invoice_result = await get_tdb().invoices.aggregate(invoice_pipeline).to_list(1)
            accounts_revenue = invoice_result[0]['total'] if invoice_result else 0
    except:
        pass
    
    total_revenue += accounts_revenue
    
    # Calculate Gross Margin (simplified - based on won leads with margin info)
    # For more accuracy, this would need actual cost data
    gross_margin = 0
    try:
        margin_leads = await get_tdb().leads.find({
            'assigned_to': user_id,
            'status': 'won'
        }, {'_id': 0, 'expected_value': 1, 'actual_value': 1, 'gross_margin': 1, 'gross_margin_percent': 1}).to_list(1000)
        
        for lead in margin_leads:
            lead_value = lead.get('actual_value') or lead.get('expected_value', 0) or 0
            if lead.get('gross_margin'):
                gross_margin += lead.get('gross_margin', 0)
            elif lead.get('gross_margin_percent'):
                gross_margin += lead_value * (lead.get('gross_margin_percent', 0) / 100)
            else:
                # Default estimate: 25% gross margin
                gross_margin += lead_value * 0.25
    except:
        pass
    
    # Calculate total expenses (budget requests + expense requests for this user)
    total_expenses = 0
    
    # Budget requests created by this user (approved only)
    try:
        budget_expenses = await get_tdb().budget_requests.find({
            'created_by': user_id,
            'status': 'approved'
        }, {'_id': 0, 'total_budget': 1}).to_list(500)
        total_expenses += sum(b.get('total_budget', 0) or 0 for b in budget_expenses)
    except:
        pass
    
    # Expense requests created by this user (approved only)
    try:
        expense_requests = await get_tdb().expense_requests.find({
            'user_id': user_id,
            'status': 'approved'
        }, {'_id': 0, 'amount': 1}).to_list(500)
        total_expenses += sum(e.get('amount', 0) or 0 for e in expense_requests)
    except:
        pass
    
    # Calculate ROI (Revenue - CTC - Expenses) / CTC * 100
    roi = 0
    if ctc_till_date > 0:
        net_contribution = total_revenue - ctc_till_date - total_expenses
        roi = round((net_contribution / ctc_till_date) * 100, 1)
    
    return {
        'user_id': user_id,
        'user_name': user_data.get('name'),
        'designation': user_data.get('designation'),
        'can_view_hr_data': can_view_hr_data,
        'joining_date': joining_date_str,
        'days_since_joining': days_since_joining,
        'months_since_joining': months_since_joining,
        'ctc': {
            'monthly': ctc_monthly if can_view_hr_data else None,
            'yearly': ctc_monthly * 12 if can_view_hr_data else None,
            'till_date': ctc_till_date if can_view_hr_data else None,
        },
        'revenue': {
            'total': total_revenue,
            'from_leads': total_revenue - accounts_revenue,
            'from_accounts': accounts_revenue,
        },
        'gross_margin': gross_margin,
        'expenses': {
            'total': total_expenses,
        },
        'roi_percentage': roi if can_view_hr_data else None,
        'net_contribution': (total_revenue - ctc_till_date - total_expenses) if can_view_hr_data else None,
    }

@api_router.get("/sales-roi-summary")
async def get_sales_roi_summary(
    start_date: Optional[str] = None,
    end_date: Optional[str] = None,
    current_user: dict = Depends(get_current_user)
):
    """
    Get Sales ROI Accounting Summary for the logged-in user and their reporting hierarchy.
    Only available for users in the Sales department.
    
    Default period: March 1st of current year to current date
    """
    
    user_id = current_user['id']
    user_department = current_user.get('department', '')
    
    # Check if user belongs to Sales department
    dept_list = user_department if isinstance(user_department, list) else [user_department or '']
    if not any('sales' in (d or '').lower() for d in dept_list):
        raise HTTPException(
            status_code=403, 
            detail='Sales ROI Summary is only available for Sales department employees'
        )
    
    # Set default date range (March 1st to current date)
    now = datetime.now(timezone.utc)
    if not start_date:
        start_date = f"{now.year}-03-01"
    if not end_date:
        end_date = now.strftime('%Y-%m-%d')
    
    # Parse dates
    try:
        start_dt = datetime.strptime(start_date, '%Y-%m-%d')
        end_dt = datetime.strptime(end_date, '%Y-%m-%d')
    except:
        start_dt = datetime(now.year, 3, 1)
        end_dt = now
    
    # Calculate days in period for CTC proration
    days_in_period = (end_dt - start_dt).days + 1
    
    # Get all users in the reporting hierarchy (self + all direct/indirect reports)
    async def get_reporting_hierarchy(user_id: str) -> list:
        """Recursively get all users reporting to this user"""
        team_ids = [user_id]
        
        # Find direct reports
        direct_reports = await get_tdb().users.find(
            {'reports_to': user_id, 'is_active': True},
            {'_id': 0, 'id': 1}
        ).to_list(100)
        
        for report in direct_reports:
            # Recursively get their reports
            sub_reports = await get_reporting_hierarchy(report['id'])
            team_ids.extend(sub_reports)
        
        return team_ids
    
    # Get all team member IDs (self + reporting hierarchy)
    team_user_ids = await get_reporting_hierarchy(user_id)
    
    # Get team member details
    team_members = await get_tdb().users.find(
        {'id': {'$in': team_user_ids}},
        {'_id': 0, 'id': 1, 'name': 1, 'ctc_monthly': 1, 'joining_date': 1, 'department': 1}
    ).to_list(100)
    
    # Filter only Sales department members for CTC calculation
    def is_sales_dept(m):
        d = m.get('department', '')
        if isinstance(d, list):
            return any('sales' in (x or '').lower() for x in d)
        return 'sales' in (d or '').lower()
    sales_team = [m for m in team_members if is_sales_dept(m)]
    
    # ==================== COST SECTION ====================
    
    # 1. Calculate Team CTC (prorated for period)
    total_team_ctc = 0
    team_ctc_details = []
    
    for member in sales_team:
        ctc_monthly = member.get('ctc_monthly', 0) or 0
        # Prorate: (monthly CTC / 30) * days_in_period
        prorated_ctc = round((ctc_monthly / 30) * days_in_period, 2)
        total_team_ctc += prorated_ctc
        team_ctc_details.append({
            'name': member.get('name'),
            'ctc_monthly': ctc_monthly,
            'prorated_ctc': prorated_ctc
        })
    
    # 2. Calculate Sales Expenses by Category
    expense_categories = {
        'travel': {'label': 'Travel Expenses', 'amount': 0},
        'onboarding': {'label': 'Customer Onboarding', 'amount': 0},
        'free_trial': {'label': 'Free Trials', 'amount': 0},
        'gifting': {'label': 'Customer Gifting', 'amount': 0},
        'event_participation': {'label': 'Event Participation', 'amount': 0},
        'event_sponsorship': {'label': 'Event Sponsorship', 'amount': 0},
        'sponsorship': {'label': 'Customer Sponsorship', 'amount': 0},
        'staff_gifting': {'label': 'Staff Gifting', 'amount': 0},
        'other': {'label': 'Other Expenses', 'amount': 0}
    }
    
    # Get approved budget requests for team members
    budget_requests = await get_tdb().budget_requests.find({
        'created_by': {'$in': team_user_ids},
        'status': 'approved',
        'created_at': {'$gte': start_date, '$lte': end_date + 'T23:59:59'}
    }, {'_id': 0, 'request_type': 1, 'total_budget': 1, 'items': 1}).to_list(1000)
    
    for req in budget_requests:
        req_type = (req.get('request_type') or 'other').lower().replace(' ', '_')
        amount = req.get('total_budget', 0) or 0
        
        if req_type == 'travel' or 'travel' in req_type:
            expense_categories['travel']['amount'] += amount
        elif req_type in expense_categories:
            expense_categories[req_type]['amount'] += amount
        else:
            expense_categories['other']['amount'] += amount
    
    # Get approved expense requests for team members
    expense_requests = await get_tdb().expense_requests.find({
        'created_by': {'$in': team_user_ids},
        'status': 'approved',
        'created_at': {'$gte': start_date, '$lte': end_date + 'T23:59:59'}
    }, {'_id': 0, 'expense_type': 1, 'amount': 1, 'items': 1}).to_list(1000)
    
    for exp in expense_requests:
        exp_type = (exp.get('expense_type') or 'other').lower().replace(' ', '_').replace('-', '_')
        amount = exp.get('amount', 0) or 0
        
        # Handle free_trial items (sum of SKU amounts)
        if exp_type == 'free_trial' and exp.get('items'):
            amount = sum(item.get('total', 0) or 0 for item in exp.get('items', []))
        
        if exp_type in expense_categories:
            expense_categories[exp_type]['amount'] += amount
        elif 'gift' in exp_type:
            expense_categories['gifting']['amount'] += amount
        elif 'sponsor' in exp_type:
            expense_categories['sponsorship']['amount'] += amount
        elif 'onboard' in exp_type:
            expense_categories['onboarding']['amount'] += amount
        else:
            expense_categories['other']['amount'] += amount
    
    # Calculate total expenses
    total_expenses = sum(cat['amount'] for cat in expense_categories.values())
    
    # 3. Total Cost
    total_cost = total_team_ctc + total_expenses
    
    # ==================== REVENUE SECTION ====================
    
    # Get revenue from invoices (gross invoice value) for accounts owned by team members
    team_accounts = await get_tdb().accounts.find(
        {'sales_owner_id': {'$in': team_user_ids}},
        {'_id': 0, 'id': 1, 'city': 1}
    ).to_list(500)
    account_ids = [acc['id'] for acc in team_accounts]
    
    invoice_revenue = 0
    invoice_cogs = 0
    
    if account_ids:
        invoices = await get_tdb().invoices.find({
            'account_id': {'$in': account_ids},
            'invoice_date': {'$gte': start_date, '$lte': end_date}
        }, {'_id': 0, 'grand_total': 1, 'total_cogs': 1, 'gross_margin': 1, 'line_items': 1, 'account_id': 1}).to_list(1000)
        
        for inv in invoices:
            grand_total = inv.get('grand_total', 0) or 0
            invoice_revenue += grand_total
            
            # Use pre-calculated COGS if available
            if inv.get('total_cogs') is not None:
                invoice_cogs += inv.get('total_cogs', 0) or 0
            elif inv.get('line_items'):
                # Calculate from line items if not pre-calculated
                for item in inv.get('line_items', []):
                    invoice_cogs += item.get('cogs_total', 0) or 0
            else:
                # No line items, estimate COGS as 65% of revenue
                invoice_cogs += grand_total * 0.65
    
    # Calculate deductions from Gross Invoice Value
    # Distribution Cost: 10% of Gross Invoice Value (hardcoded)
    distribution_cost = round(invoice_revenue * 0.10, 2)
    
    # Logistics Cost: 8% of Gross Invoice Value (hardcoded)
    logistics_cost = round(invoice_revenue * 0.08, 2)
    
    # Gross Margin = Gross Invoice Value - Distribution - Logistics - COGS
    gross_margin = invoice_revenue - distribution_cost - logistics_cost - invoice_cogs
    gross_margin_percent = round((gross_margin / invoice_revenue) * 100, 2) if invoice_revenue > 0 else 0
    
    total_revenue = invoice_revenue
    
    # ==================== PROFITABILITY SECTION ====================
    
    # Net Contribution = Gross Margin - (Team CTC + Sales Expenses)
    net_contribution = gross_margin - total_cost
    roi_percentage = round((net_contribution / total_cost) * 100, 2) if total_cost > 0 else 0
    
    # Format expense categories for response (only non-zero)
    expense_breakdown = [
        {'category': cat['label'], 'amount': cat['amount']}
        for key, cat in expense_categories.items()
        if cat['amount'] > 0
    ]
    
    return {
        'period': {
            'start_date': start_date,
            'end_date': end_date,
            'days': days_in_period
        },
        'team': {
            'total_members': len(sales_team),
            'member_ids': team_user_ids
        },
        'cost': {
            'team_ctc': {
                'total': round(total_team_ctc, 2),
                'details': team_ctc_details
            },
            'expenses': {
                'total': round(total_expenses, 2),
                'breakdown': expense_breakdown
            },
            'total_cost': round(total_cost, 2)
        },
        'revenue': {
            'gross_invoice_value': round(invoice_revenue, 2),
            'distribution_cost': round(distribution_cost, 2),
            'distribution_percent': 10.0,
            'logistics_cost': round(logistics_cost, 2),
            'logistics_percent': 8.0,
            'total_cogs': round(invoice_cogs, 2),
            'gross_margin': round(gross_margin, 2),
            'gross_margin_percent': gross_margin_percent
        },
        'profitability': {
            'net_contribution': round(net_contribution, 2),
            'roi_percentage': roi_percentage,
            'is_profitable': net_contribution > 0
        }
    }

@api_router.put("/users/{user_id}/hr-data")
async def update_user_hr_data(
    user_id: str,
    ctc_monthly: Optional[float] = None,
    joining_date: Optional[str] = None,
    current_user: dict = Depends(get_current_user)
):
    """Update user HR data (CTC and joining date) - Admin only"""
    
    # Only CEO, Director, Admin can update HR data
    user_role = current_user.get('role', '').lower()
    if user_role not in ['ceo', 'director', 'admin', 'vp', 'vice president']:
        raise HTTPException(status_code=403, detail='Only CEO, Director, or Admin can update HR data')
    
    update_data = {}
    if ctc_monthly is not None:
        update_data['ctc_monthly'] = ctc_monthly
    if joining_date is not None:
        update_data['joining_date'] = joining_date
    
    if not update_data:
        raise HTTPException(status_code=400, detail='No data to update')
    
    result = await get_tdb().users.update_one({'id': user_id}, {'$set': update_data})
    
    if result.matched_count == 0:
        raise HTTPException(status_code=404, detail='User not found')
    
    return {'message': 'HR data updated successfully'}

# ============= TASK ROUTES =============

@api_router.post("/tasks")
async def create_task(task_input: TaskCreate, current_user: dict = Depends(get_current_user)):
    """Create a new task"""
    # Get assignee name
    assignee = await get_tdb().users.find_one({'id': task_input.assigned_to}, {'_id': 0, 'name': 1})
    
    task = Task(
        **task_input.model_dump(),
        assigned_to_name=assignee.get('name') if assignee else None,
        assigned_by=current_user['id'],
        assigned_by_name=current_user.get('name'),
        created_by=current_user['id'],
        created_by_name=current_user.get('name')
    )
    
    doc = task.model_dump()
    doc['created_at'] = doc['created_at'].isoformat()
    doc['updated_at'] = doc['updated_at'].isoformat()
    
    await get_tdb().tasks.insert_one(doc)
    return task

@api_router.get("/tasks")
async def get_tasks(
    assigned_to: Optional[str] = None,
    status: Optional[str] = None,
    priority: Optional[str] = None,
    current_user: dict = Depends(get_current_user)
):
    """Get tasks with optional filters"""
    query = {}
    
    if assigned_to:
        query['assigned_to'] = assigned_to
    else:
        # Default to current user's tasks
        query['assigned_to'] = current_user['id']
    
    if status:
        query['status'] = status
    
    if priority:
        query['priority'] = priority
    
    cursor = db.tasks.find(query, {'_id': 0}).sort('due_date', 1)
    tasks = await cursor.to_list(length=100)
    return {'tasks': tasks}

@api_router.get("/tasks/{task_id}")
async def get_task(task_id: str, current_user: dict = Depends(get_current_user)):
    """Get a specific task"""
    task = await get_tdb().tasks.find_one({'id': task_id}, {'_id': 0})
    if not task:
        raise HTTPException(status_code=404, detail='Task not found')
    return task

@api_router.put("/tasks/{task_id}")
async def update_task(task_id: str, task_update: TaskUpdate, current_user: dict = Depends(get_current_user)):
    """Update a task"""
    task = await get_tdb().tasks.find_one({'id': task_id}, {'_id': 0})
    if not task:
        raise HTTPException(status_code=404, detail='Task not found')
    
    update_data = {k: v for k, v in task_update.model_dump().items() if v is not None and k != 'comment'}
    update_data['updated_at'] = datetime.now(timezone.utc).isoformat()
    
    # If marking as completed, only the creator can do this
    if update_data.get('status') == 'completed':
        # For approval tasks, the approver (assigned_to) can also complete
        is_approval_task = task.get('is_approval_task', False)
        is_creator = task.get('assigned_by') == current_user['id'] or task.get('created_by') == current_user['id']
        is_assignee = task.get('assigned_to') == current_user['id']
        
        if is_approval_task:
            # Approval tasks can be completed by the assignee (approver)
            if not is_assignee and not is_creator:
                raise HTTPException(
                    status_code=403,
                    detail='Only the task creator or approver can mark this task as complete'
                )
        else:
            # Regular tasks can only be completed by the creator
            if not is_creator:
                raise HTTPException(
                    status_code=403,
                    detail='Only the task creator can mark this task as complete'
                )
        
        update_data['completed_at'] = datetime.now(timezone.utc).isoformat()
        update_data['completed_by'] = current_user['id']
        update_data['completed_by_name'] = current_user.get('name')
    
    # If assignee changed, update name
    if 'assigned_to' in update_data:
        assignee = await get_tdb().users.find_one({'id': update_data['assigned_to']}, {'_id': 0, 'name': 1})
        update_data['assigned_to_name'] = assignee.get('name') if assignee else None
    
    # Handle comment - append to comments array
    if task_update.comment:
        comment_entry = {
            'id': str(uuid.uuid4()),
            'text': task_update.comment,
            'created_by': current_user['id'],
            'created_by_name': current_user.get('name'),
            'created_at': datetime.now(timezone.utc).isoformat()
        }
        await get_tdb().tasks.update_one(
            {'id': task_id},
            {'$push': {'comments': comment_entry}}
        )
    
    await get_tdb().tasks.update_one({'id': task_id}, {'$set': update_data})
    
    updated = await get_tdb().tasks.find_one({'id': task_id}, {'_id': 0})
    return updated

@api_router.delete("/tasks/{task_id}")
async def delete_task(task_id: str, current_user: dict = Depends(get_current_user)):
    """Delete a task"""
    result = await get_tdb().tasks.delete_one({'id': task_id})
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail='Task not found')
    return {'message': 'Task deleted successfully'}

# ============= MEETING ROUTES =============

@api_router.post("/meetings")
async def create_meeting(meeting_input: MeetingCreate, current_user: dict = Depends(get_current_user)):
    """Create a new meeting, optionally with Zoom integration"""
    from zoom_service import get_zoom_client
    
    meeting_data = meeting_input.model_dump()
    create_zoom = meeting_data.pop('create_zoom_meeting', False)
    
    zoom_meeting_id = None
    zoom_password = None
    
    # Create Zoom meeting if requested
    if create_zoom:
        try:
            zoom_client = get_zoom_client()
            if zoom_client.is_configured():
                # Format start time for Zoom API (YYYY-MM-DDTHH:MM:SS)
                zoom_start_time = f"{meeting_data['meeting_date']}T{meeting_data['start_time']}:00"
                
                zoom_result = zoom_client.create_meeting(
                    topic=meeting_data['title'],
                    start_time=zoom_start_time,
                    duration=meeting_data.get('duration_minutes', 30),
                    timezone="Asia/Kolkata",
                    agenda=meeting_data.get('description')
                )
                
                zoom_meeting_id = zoom_result.get('meeting_id')
                zoom_password = zoom_result.get('password')
                # Override meeting_link with Zoom join URL
                meeting_data['meeting_link'] = zoom_result.get('join_url')
            else:
                raise HTTPException(status_code=500, detail="Zoom API not configured")
        except Exception as e:
            raise HTTPException(status_code=500, detail=f"Failed to create Zoom meeting: {str(e)}")
    
    meeting = Meeting(
        **meeting_data,
        organizer_id=current_user['id'],
        organizer_name=current_user.get('name'),
        zoom_meeting_id=zoom_meeting_id,
        zoom_password=zoom_password
    )
    
    doc = meeting.model_dump()
    doc['created_at'] = doc['created_at'].isoformat()
    doc['updated_at'] = doc['updated_at'].isoformat()
    
    await get_tdb().meetings.insert_one(doc)
    
    # Send email notifications to attendees
    if meeting.attendees:
        try:
            await send_meeting_notification(
                meeting=doc,
                notification_type='scheduled',
                organizer=current_user
            )
        except Exception as e:
            print(f"Failed to send meeting notification: {e}")
    
    return meeting

@api_router.get("/meetings")
async def get_meetings(
    start_date: Optional[str] = None,
    end_date: Optional[str] = None,
    status: Optional[str] = None,
    current_user: dict = Depends(get_current_user)
):
    """Get meetings for the current user"""
    query = {
        '$or': [
            {'organizer_id': current_user['id']},
            {'attendees': current_user.get('email')}
        ]
    }
    
    if start_date:
        query['meeting_date'] = {'$gte': start_date}
    if end_date:
        if 'meeting_date' in query:
            query['meeting_date']['$lte'] = end_date
        else:
            query['meeting_date'] = {'$lte': end_date}
    
    if status:
        query['status'] = status
    
    cursor = db.meetings.find(query, {'_id': 0}).sort([('meeting_date', 1), ('start_time', 1)])
    meetings = await cursor.to_list(length=100)
    return {'meetings': meetings}

@api_router.get("/meetings/{meeting_id}")
async def get_meeting(meeting_id: str, current_user: dict = Depends(get_current_user)):
    """Get a specific meeting"""
    meeting = await get_tdb().meetings.find_one({'id': meeting_id}, {'_id': 0})
    if not meeting:
        raise HTTPException(status_code=404, detail='Meeting not found')
    return meeting

@api_router.put("/meetings/{meeting_id}")
async def update_meeting(meeting_id: str, meeting_update: MeetingUpdate, current_user: dict = Depends(get_current_user)):
    """Update a meeting and send email notifications"""
    meeting = await get_tdb().meetings.find_one({'id': meeting_id}, {'_id': 0})
    if not meeting:
        raise HTTPException(status_code=404, detail='Meeting not found')
    
    update_data = {k: v for k, v in meeting_update.model_dump().items() if v is not None}
    update_data['updated_at'] = datetime.now(timezone.utc).isoformat()
    
    # Check if this is a reschedule (date/time changed) or cancellation
    is_reschedule = any([
        meeting_update.meeting_date and meeting_update.meeting_date != meeting.get('meeting_date'),
        meeting_update.start_time and meeting_update.start_time != meeting.get('start_time')
    ])
    is_cancellation = meeting_update.status == 'cancelled'
    
    await get_tdb().meetings.update_one({'id': meeting_id}, {'$set': update_data})
    
    updated = await get_tdb().meetings.find_one({'id': meeting_id}, {'_id': 0})
    
    # Send email notification for reschedule or cancellation
    attendees = updated.get('attendees', [])
    if attendees and (is_reschedule or is_cancellation):
        try:
            await send_meeting_notification(
                meeting=updated,
                notification_type='cancelled' if is_cancellation else 'rescheduled',
                organizer=current_user
            )
        except Exception as e:
            print(f"Failed to send meeting notification: {e}")
    
    return updated

@api_router.delete("/meetings/{meeting_id}")
async def delete_meeting(meeting_id: str, current_user: dict = Depends(get_current_user)):
    """Delete a meeting"""
    result = await get_tdb().meetings.delete_one({'id': meeting_id})
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail='Meeting not found')
    return {'message': 'Meeting deleted successfully'}

# ============= LEADS ROUTES =============

@api_router.post("/leads", response_model=Lead)
async def create_lead(lead_input: LeadCreate, current_user: dict = Depends(get_current_user)):
    lead_data = lead_input.model_dump()
    lead_data['created_by'] = current_user['id']
    
    # Generate unique Lead ID
    unique_lead_id = await generate_lead_id(lead_data['company'], lead_data['city'])
    lead_data['lead_id'] = unique_lead_id
    
    lead_obj = Lead(**lead_data)
    
    doc = lead_obj.model_dump()
    doc['created_at'] = doc['created_at'].isoformat()
    doc['updated_at'] = doc['updated_at'].isoformat()
    
    await get_tdb().leads.insert_one(doc)
    
    # Best-effort: create a dedicated Drive folder for this lead (no-op if
    # Drive isn't configured for this tenant).
    try:
        from utils.google_drive_storage import ensure_lead_folder
        from core.tenant import get_current_tenant_id as _gctid
        folder_id = await ensure_lead_folder(_gctid(), lead_obj.lead_id)
        if folder_id:
            await get_tdb().leads.update_one(
                {'id': lead_obj.id},
                {'$set': {'drive_folder_id': folder_id}}
            )
    except Exception:
        logger.exception('Drive folder creation failed for lead %s', lead_obj.lead_id)
    
    # Create initial activity
    activity = Activity(
        lead_id=lead_obj.id,
        activity_type='note',
        description=f'Lead created by {current_user["name"]}',
        created_by=current_user['id']
    )
    activity_doc = activity.model_dump()
    activity_doc['created_at'] = activity_doc['created_at'].isoformat()
    await get_tdb().activities.insert_one(activity_doc)
    
    return lead_obj

@api_router.get("/leads", response_model=PaginatedLeadsResponse)
async def get_leads(
    page: int = 1,
    page_size: int = 25,
    status: Optional[str] = None,
    city: Optional[str] = None,
    state: Optional[str] = None,
    territory: Optional[str] = None,
    country: Optional[str] = None,
    region: Optional[str] = None,
    search: Optional[str] = None,
    assigned_to: Optional[str] = None,
    time_filter: Optional[str] = None,
    quadrant: Optional[str] = None,
    target_closure_month: Optional[int] = None,
    target_closure_year: Optional[int] = None,
    target_closure_months: Optional[str] = None,
    target_closure_years: Optional[str] = None,
    pipeline_view: Optional[bool] = None,
    sort_by: Optional[str] = 'created_at',
    sort_order: Optional[str] = 'desc',
    no_limit: Optional[bool] = False,
    current_user: dict = Depends(get_current_user)
):
    """
    Get paginated leads list with server-side pagination.
    
    - page: Page number (1-indexed)
    - page_size: Number of items per page (default 25, max 100, or unlimited if no_limit=true)
    - status, city, state, territory, country, region: Filter options
    - search: Search in company name, contact person, lead_id
    - assigned_to: Filter by assigned user ID
    - time_filter: Filter by time period (this_week, last_week, this_month, last_month, etc.)
    - sort_by: Field to sort by (default: created_at)
    - sort_order: asc or desc (default: desc)
    - no_limit: If true, returns all matching leads without pagination (for Pipeline/Kanban view)
    """
    # Validate and cap page_size to prevent abuse (unless no_limit is set)
    if no_limit:
        page_size = 10000  # Effectively unlimited for pipeline view
    else:
        page_size = min(max(1, page_size), 100)
    page = max(1, page)
    skip = (page - 1) * page_size
    
    # Build query based on role and filters
    query = {}
    
    # Only sales_rep sees their assigned leads, everyone else sees all
    if current_user['role'] == 'sales_rep':
        query['assigned_to'] = current_user['id']
    
    # Add location filters
    if status and status != 'all':
        # Support comma-separated multiple statuses
        status_list = [s.strip() for s in status.split(',') if s.strip()]
        if len(status_list) == 1:
            query['status'] = status_list[0]
        elif len(status_list) > 1:
            query['status'] = {'$in': status_list}
    if city and city != 'all':
        query['city'] = city
    if state and state != 'all':
        query['state'] = state
    if territory and territory != 'all':
        # Note: Leads store territory in 'region' field, not 'territory'
        query['region'] = territory
    if country and country != 'all':
        query['country'] = country
    if region and region != 'all':
        query['region'] = region
    
    # Add assigned_to filter - support comma-separated multiple values
    if assigned_to and assigned_to != 'all':
        assigned_list = [a.strip() for a in assigned_to.split(',') if a.strip()]
        if len(assigned_list) == 1:
            query['assigned_to'] = assigned_list[0]
        elif len(assigned_list) > 1:
            query['assigned_to'] = {'$in': assigned_list}
    
    # Add time filter
    # Add target closure month/year filter (single or multi for pipeline view)
    if target_closure_months and target_closure_years:
        months = [int(m) for m in target_closure_months.split(',') if m.strip()]
        years = [int(y) for y in target_closure_years.split(',') if y.strip()]
        # Build $or conditions for each month/year pair
        tc_conditions = []
        for i in range(min(len(months), len(years))):
            tc_conditions.append({'target_closure_month': months[i], 'target_closure_year': years[i]})
        if len(tc_conditions) == 1:
            query['target_closure_month'] = tc_conditions[0]['target_closure_month']
            query['target_closure_year'] = tc_conditions[0]['target_closure_year']
        elif tc_conditions:
            if '$or' in query:
                query['$and'] = query.get('$and', [])
                query['$and'].append({'$or': query.pop('$or')})
                query['$and'].append({'$or': tc_conditions})
            else:
                query['$or'] = tc_conditions
    elif target_closure_month is not None:
        query['target_closure_month'] = target_closure_month
        if target_closure_year is not None:
            query['target_closure_year'] = target_closure_year
    
    if time_filter and time_filter != 'all' and time_filter != 'lifetime':
        now = datetime.now(timezone.utc)
        start_date = None
        end_date = None
        
        if time_filter == 'this_week':
            # Start of this week (Monday)
            start_date = now - timedelta(days=now.weekday())
            start_date = start_date.replace(hour=0, minute=0, second=0, microsecond=0)
        elif time_filter == 'last_week':
            # Last week Monday to Sunday
            start_date = now - timedelta(days=now.weekday() + 7)
            start_date = start_date.replace(hour=0, minute=0, second=0, microsecond=0)
            end_date = start_date + timedelta(days=6, hours=23, minutes=59, seconds=59)
        elif time_filter == 'this_month':
            start_date = now.replace(day=1, hour=0, minute=0, second=0, microsecond=0)
        elif time_filter == 'last_month':
            # First day of last month
            first_of_this_month = now.replace(day=1)
            last_month = first_of_this_month - timedelta(days=1)
            start_date = last_month.replace(day=1, hour=0, minute=0, second=0, microsecond=0)
            end_date = first_of_this_month - timedelta(seconds=1)
        elif time_filter == 'last_3_months':
            start_date = now - timedelta(days=90)
            start_date = start_date.replace(hour=0, minute=0, second=0, microsecond=0)
        elif time_filter == 'last_6_months':
            start_date = now - timedelta(days=180)
            start_date = start_date.replace(hour=0, minute=0, second=0, microsecond=0)
        elif time_filter == 'this_quarter':
            quarter = (now.month - 1) // 3
            start_date = now.replace(month=quarter * 3 + 1, day=1, hour=0, minute=0, second=0, microsecond=0)
        elif time_filter == 'last_quarter':
            quarter = (now.month - 1) // 3 - 1
            if quarter < 0:
                quarter = 3
                year = now.year - 1
            else:
                year = now.year
            start_date = datetime(year, quarter * 3 + 1, 1, tzinfo=timezone.utc)
            end_month = (quarter + 1) * 3
            if end_month > 12:
                end_date = datetime(year + 1, 1, 1, tzinfo=timezone.utc) - timedelta(seconds=1)
            else:
                end_date = datetime(year, end_month + 1, 1, tzinfo=timezone.utc) - timedelta(seconds=1)
        elif time_filter == 'this_year':
            start_date = now.replace(month=1, day=1, hour=0, minute=0, second=0, microsecond=0)
        
        # Convert datetime to ISO string for MongoDB string comparison (created_at is stored as ISO string)
        if start_date:
            start_date_str = start_date.isoformat()
            if end_date:
                end_date_str = end_date.isoformat()
                date_range = {'$gte': start_date_str, '$lte': end_date_str}
            else:
                date_range = {'$gte': start_date_str}
            # Match leads created OR updated within the time period
            date_or = [{'created_at': date_range}, {'updated_at': date_range}]
            if '$or' in query:
                query['$and'] = [{'$or': query.pop('$or')}, {'$or': date_or}]
            else:
                query['$or'] = date_or
    
    # Add search filter
    search_filter = None
    if search:
        search_filter = {'$or': [
            {'company': {'$regex': search, '$options': 'i'}},
            {'contact_person': {'$regex': search, '$options': 'i'}},
            {'lead_id': {'$regex': search, '$options': 'i'}}
        ]}
    
    # Add lead scoring quadrant filter
    quadrant_filter = None
    if quadrant:
        quadrants = quadrant.split(',')
        # Check if 'unscored' is in the filter
        if 'unscored' in quadrants:
            quadrants.remove('unscored')
            if quadrants:
                # Both scored quadrants and unscored
                quadrant_filter = {'$or': [
                    {'scoring.quadrant': {'$in': quadrants}},
                    {'scoring.quadrant': {'$exists': False}},
                    {'scoring': {'$exists': False}}
                ]}
            else:
                # Only unscored
                quadrant_filter = {'$or': [
                    {'scoring.quadrant': {'$exists': False}},
                    {'scoring': {'$exists': False}}
                ]}
        else:
            quadrant_filter = {'scoring.quadrant': {'$in': quadrants}}
    
    # Combine search and quadrant filters properly with $and
    extra_conditions = []
    if search_filter:
        extra_conditions.append(search_filter)
    if quadrant_filter:
        extra_conditions.append(quadrant_filter)
    
    if extra_conditions:
        if '$and' not in query:
            query['$and'] = []
        # Move existing $or into $and if we need to add more $or conditions
        if '$or' in query and extra_conditions:
            query['$and'].append({'$or': query.pop('$or')})
        for cond in extra_conditions:
            query['$and'].append(cond)
        # Clean up empty $and
        if not query['$and']:
            del query['$and']
    
    # Get total count for pagination
    total = await get_tdb().leads.count_documents(query)
    total_pages = (total + page_size - 1) // page_size  # Ceiling division
    
    # Fetch paginated leads with sorting
    sort_direction = -1 if sort_order == 'desc' else 1
    
    # Map frontend sort fields to database fields
    sort_field_map = {
        'estimated_revenue': 'opportunity_estimation.estimated_monthly_revenue',
        'opportunity_estimation.estimated_monthly_revenue': 'opportunity_estimation.estimated_monthly_revenue',
    }
    db_sort_field = sort_field_map.get(sort_by, sort_by)
    
    leads = await get_tdb().leads.find(query, {'_id': 0}).sort(db_sort_field, sort_direction).skip(skip).limit(page_size).to_list(page_size)
    
    # Get last activity for each lead
    lead_ids = [lead['id'] for lead in leads]
    activities = await get_tdb().activities.find(
        {'lead_id': {'$in': lead_ids}},
        {'_id': 0, 'lead_id': 1, 'created_at': 1, 'interaction_method': 1, 'activity_type': 1}
    ).to_list(len(lead_ids) * 10)  # Reasonable limit per page
    
    # Group activities by lead_id and get the most recent
    lead_last_activity = {}
    for activity in activities:
        lead_id = activity['lead_id']
        activity_date = activity['created_at'] if isinstance(activity['created_at'], str) else activity['created_at'].isoformat()
        
        # Use interaction_method if available, otherwise fall back to activity_type
        contact_method = activity.get('interaction_method') or activity.get('activity_type', '')
        
        if lead_id not in lead_last_activity:
            lead_last_activity[lead_id] = {
                'created_at': activity_date,
                'interaction_method': contact_method
            }
        elif activity_date and lead_last_activity[lead_id]['created_at'] and activity_date > lead_last_activity[lead_id]['created_at']:
            lead_last_activity[lead_id] = {
                'created_at': activity_date,
                'interaction_method': contact_method
            }
    
    # Add last contacted info to leads (prefer stored value, fallback to activity lookup)
    for lead in leads:
        if isinstance(lead['created_at'], str):
            lead['created_at'] = datetime.fromisoformat(lead['created_at'])
        if isinstance(lead['updated_at'], str):
            lead['updated_at'] = datetime.fromisoformat(lead['updated_at'])
        
        # Use stored value if available, otherwise lookup from activities
        if not lead.get('last_contacted_date'):
            last_activity = lead_last_activity.get(lead['id'])
            if last_activity:
                lead['last_contacted_date'] = last_activity['created_at']
                lead['last_contact_method'] = last_activity['interaction_method']
            else:
                lead['last_contacted_date'] = None
                lead['last_contact_method'] = None
        
        # Calculate estimated_monthly_revenue on the fly if not stored, and save to DB
        opportunity_estimation = lead.get('opportunity_estimation') or {}
        if not opportunity_estimation.get('estimated_monthly_revenue'):
            monthly_bottles = opportunity_estimation.get('final_monthly') or opportunity_estimation.get('calculated_monthly') or 0
            proposed_sku_pricing = lead.get('proposed_sku_pricing') or []
            
            if monthly_bottles and proposed_sku_pricing:
                estimated_revenue = 0
                for sku in proposed_sku_pricing:
                    percentage = sku.get('percentage', 0)
                    price_per_unit = sku.get('price_per_unit', 0)
                    estimated_qty = round((monthly_bottles * percentage) / 100) if percentage else 0
                    estimated_revenue += estimated_qty * price_per_unit
                
                if estimated_revenue > 0:
                    if not lead.get('opportunity_estimation'):
                        lead['opportunity_estimation'] = {}
                    lead['opportunity_estimation']['estimated_monthly_revenue'] = estimated_revenue
                    
                    # Save to DB for future use in dashboards and metrics
                    await get_tdb().leads.update_one(
                        {'id': lead['id']},
                        {'$set': {'opportunity_estimation.estimated_monthly_revenue': estimated_revenue}}
                    )
    
    return PaginatedLeadsResponse(
        data=leads,
        total=total,
        page=page,
        page_size=page_size,
        total_pages=total_pages
    )


@api_router.get("/leads/export")
async def export_leads_csv(
    status: Optional[str] = None,
    city: Optional[str] = None,
    state: Optional[str] = None,
    territory: Optional[str] = None,
    country: Optional[str] = None,
    region: Optional[str] = None,
    search: Optional[str] = None,
    assigned_to: Optional[str] = None,
    time_filter: Optional[str] = None,
    quadrant: Optional[str] = None,
    target_closure_month: Optional[int] = None,
    target_closure_year: Optional[int] = None,
    target_closure_months: Optional[str] = None,
    target_closure_years: Optional[str] = None,
    sort_by: Optional[str] = 'created_at',
    sort_order: Optional[str] = 'desc',
    current_user: dict = Depends(get_current_user)
):
    """Export all leads matching the filters as a CSV spreadsheet."""
    import csv
    import io
    from fastapi.responses import StreamingResponse

    # Build same query as GET /leads
    query = {}
    if current_user['role'] == 'sales_rep':
        query['assigned_to'] = current_user['id']

    if status and status != 'all':
        status_list = [s.strip() for s in status.split(',') if s.strip()]
        if len(status_list) == 1:
            query['status'] = status_list[0]
        elif len(status_list) > 1:
            query['status'] = {'$in': status_list}
    if city and city != 'all':
        query['city'] = city
    if state and state != 'all':
        query['state'] = state
    if territory and territory != 'all':
        query['region'] = territory
    if country and country != 'all':
        query['country'] = country
    if region and region != 'all':
        query['region'] = region

    if assigned_to and assigned_to != 'all':
        assigned_list = [a.strip() for a in assigned_to.split(',') if a.strip()]
        if len(assigned_list) == 1:
            query['assigned_to'] = assigned_list[0]
        elif len(assigned_list) > 1:
            query['assigned_to'] = {'$in': assigned_list}

    if target_closure_months and target_closure_years:
        months = [int(m) for m in target_closure_months.split(',') if m.strip()]
        years = [int(y) for y in target_closure_years.split(',') if y.strip()]
        tc_conditions = [
            {'target_closure_month': months[i], 'target_closure_year': years[i]}
            for i in range(min(len(months), len(years)))
        ]
        if len(tc_conditions) == 1:
            query['target_closure_month'] = tc_conditions[0]['target_closure_month']
            query['target_closure_year'] = tc_conditions[0]['target_closure_year']
        elif tc_conditions:
            query['$or'] = tc_conditions
    elif target_closure_month is not None:
        query['target_closure_month'] = target_closure_month
        if target_closure_year is not None:
            query['target_closure_year'] = target_closure_year

    if time_filter and time_filter not in ('all', 'lifetime'):
        now = datetime.now(timezone.utc)
        start_date, end_date = None, None
        if time_filter == 'this_week':
            start_date = (now - timedelta(days=now.weekday())).replace(hour=0, minute=0, second=0, microsecond=0)
        elif time_filter == 'last_week':
            start_date = (now - timedelta(days=now.weekday() + 7)).replace(hour=0, minute=0, second=0, microsecond=0)
            end_date = start_date + timedelta(days=6, hours=23, minutes=59, seconds=59)
        elif time_filter == 'this_month':
            start_date = now.replace(day=1, hour=0, minute=0, second=0, microsecond=0)
        elif time_filter == 'last_month':
            first_of_this_month = now.replace(day=1)
            last_month = first_of_this_month - timedelta(days=1)
            start_date = last_month.replace(day=1, hour=0, minute=0, second=0, microsecond=0)
            end_date = first_of_this_month - timedelta(seconds=1)
        elif time_filter == 'last_3_months':
            start_date = (now - timedelta(days=90)).replace(hour=0, minute=0, second=0, microsecond=0)
        elif time_filter == 'last_6_months':
            start_date = (now - timedelta(days=180)).replace(hour=0, minute=0, second=0, microsecond=0)
        elif time_filter == 'this_year':
            start_date = now.replace(month=1, day=1, hour=0, minute=0, second=0, microsecond=0)

        if start_date:
            date_range = {'$gte': start_date.isoformat()}
            if end_date:
                date_range['$lte'] = end_date.isoformat()
            query['$or'] = [{'created_at': date_range}, {'updated_at': date_range}]

    extra = []
    if search:
        extra.append({'$or': [
            {'company': {'$regex': search, '$options': 'i'}},
            {'contact_person': {'$regex': search, '$options': 'i'}},
            {'lead_id': {'$regex': search, '$options': 'i'}},
        ]})
    if quadrant:
        quadrants = [q for q in quadrant.split(',') if q]
        if 'unscored' in quadrants:
            quadrants.remove('unscored')
            if quadrants:
                extra.append({'$or': [
                    {'scoring.quadrant': {'$in': quadrants}},
                    {'scoring.quadrant': {'$exists': False}},
                    {'scoring': {'$exists': False}},
                ]})
            else:
                extra.append({'$or': [
                    {'scoring.quadrant': {'$exists': False}},
                    {'scoring': {'$exists': False}},
                ]})
        else:
            extra.append({'scoring.quadrant': {'$in': quadrants}})
    if extra:
        if '$or' in query:
            query.setdefault('$and', []).append({'$or': query.pop('$or')})
        query.setdefault('$and', []).extend(extra)

    # Fetch all matching leads (export has no pagination cap beyond a safety 50k)
    sort_direction = -1 if sort_order == 'desc' else 1
    leads = await get_tdb().leads.find(query, {'_id': 0}).sort(sort_by, sort_direction).limit(50000).to_list(50000)

    # Build user lookup for assigned-to name + created_by name
    user_ids = {l.get('assigned_to') for l in leads if l.get('assigned_to')} | \
               {l.get('created_by') for l in leads if l.get('created_by')}
    users_map = {}
    if user_ids:
        users_docs = await get_tdb().users.find({'id': {'$in': list(user_ids)}}, {'_id': 0, 'id': 1, 'name': 1, 'email': 1}).to_list(len(user_ids))
        users_map = {u['id']: u.get('name') or u.get('email') or '' for u in users_docs}

    # Latest activity per lead for last_contacted_date / method
    lead_ids = [l['id'] for l in leads]
    last_activity_map = {}
    if lead_ids:
        activities = await get_tdb().activities.find(
            {'lead_id': {'$in': lead_ids}},
            {'_id': 0, 'lead_id': 1, 'created_at': 1, 'interaction_method': 1, 'activity_type': 1}
        ).sort('created_at', -1).to_list(len(lead_ids) * 5)
        for a in activities:
            lid = a['lead_id']
            if lid not in last_activity_map:
                method = a.get('interaction_method') or a.get('activity_type') or ''
                ts = a['created_at'] if isinstance(a['created_at'], str) else a['created_at'].isoformat()
                last_activity_map[lid] = (ts, method)

    # CSV columns - comprehensive list
    columns = [
        ('lead_id', 'Lead ID'),
        ('company', 'Company'),
        ('contact_person', 'Contact Person'),
        ('email', 'Email'),
        ('phone', 'Phone'),
        ('category', 'Category'),
        ('city', 'City'),
        ('country', 'Country'),
        ('status', 'Status'),
        ('priority', 'Priority'),
        ('estimated_monthly_bottles', 'Est. Monthly Bottles'),
        ('estimated_monthly_revenue', 'Est. Monthly Revenue'),
        ('target_closure_month', 'Target Closure Month'),
        ('target_closure_year', 'Target Closure Year'),
        ('next_followup_date', 'Next Follow-up Date'),
        ('last_contacted_date', 'Last Contacted Date'),
        ('last_contact_method', 'Last Contact Method'),
    ]

    def _flatten(lead):
        """Flatten a lead doc into a dict of primitive values for CSV."""
        current_brands = lead.get('current_brands') or []
        current_brands_summary = '; '.join(
            f"{b.get('brand_name','')} ({b.get('volume','')} @ {b.get('selling_price','')})"
            for b in current_brands if isinstance(b, dict)
        )
        interested = lead.get('interested_skus') or []
        interested_summary = ', '.join(str(s) for s in interested)

        proposed = lead.get('proposed_sku_pricing') or []
        proposed_summary = '; '.join(
            f"{p.get('sku_name','')}: {p.get('selling_price','')} ({p.get('percentage','')}%)"
            for p in proposed if isinstance(p, dict)
        )

        opp = lead.get('opportunity_estimation') or {}
        est_monthly_bottles = opp.get('final_monthly') or opp.get('calculated_monthly') or ''
        est_monthly_revenue = opp.get('estimated_monthly_revenue') or ''

        scoring = lead.get('scoring') or {}

        last_contacted = lead.get('last_contacted_date')
        last_method = lead.get('last_contact_method')
        if not last_contacted:
            la = last_activity_map.get(lead['id'])
            if la:
                last_contacted, last_method = la

        def _iso(v):
            if v is None:
                return ''
            if isinstance(v, datetime):
                return v.isoformat()
            return str(v)

        return {
            'lead_id': lead.get('lead_id') or lead.get('id') or '',
            'company': lead.get('company') or '',
            'contact_person': lead.get('contact_person') or lead.get('name') or '',
            'email': lead.get('email') or '',
            'phone': lead.get('phone') or '',
            'category': lead.get('category') or '',
            'tier': lead.get('tier') or '',
            'rank': lead.get('rank') or '',
            'city': lead.get('city') or '',
            'state': lead.get('state') or '',
            'region': lead.get('region') or '',
            'country': lead.get('country') or '',
            'status': lead.get('status') or '',
            'source': lead.get('source') or '',
            'priority': lead.get('priority') or '',
            'assigned_to_name': users_map.get(lead.get('assigned_to'), '') if lead.get('assigned_to') else '',
            'created_by_name': users_map.get(lead.get('created_by'), '') if lead.get('created_by') else '',
            'current_water_brand': lead.get('current_water_brand') or '',
            'current_landing_price': lead.get('current_landing_price') or '',
            'current_volume': lead.get('current_volume') or '',
            'current_selling_price': lead.get('current_selling_price') or '',
            'current_brands_summary': current_brands_summary,
            'interested_skus_summary': interested_summary,
            'proposed_sku_pricing_summary': proposed_summary,
            'estimated_monthly_bottles': est_monthly_bottles,
            'estimated_monthly_revenue': est_monthly_revenue,
            'estimated_value': lead.get('estimated_value') or '',
            'onboarded_month': lead.get('onboarded_month') or '',
            'onboarded_year': lead.get('onboarded_year') or '',
            'target_closure_month': lead.get('target_closure_month') or '',
            'target_closure_year': lead.get('target_closure_year') or '',
            'next_followup_date': lead.get('next_followup_date') or '',
            'last_contacted_date': last_contacted or '',
            'last_contact_method': last_method or '',
            'total_gross_invoice_value': lead.get('total_gross_invoice_value') or '',
            'total_net_invoice_value': lead.get('total_net_invoice_value') or '',
            'total_credit_note_value': lead.get('total_credit_note_value') or '',
            'invoice_count': lead.get('invoice_count') or '',
            'last_invoice_date': lead.get('last_invoice_date') or '',
            'last_invoice_no': lead.get('last_invoice_no') or '',
            'scoring_quadrant': scoring.get('quadrant') or '',
            'scoring_score': scoring.get('total_score') or scoring.get('score') or '',
            'notes': (lead.get('notes') or '').replace('\r\n', ' ').replace('\n', ' '),
            'created_at': _iso(lead.get('created_at')),
            'updated_at': _iso(lead.get('updated_at')),
        }

    # Stream CSV
    buffer = io.StringIO()
    writer = csv.writer(buffer, quoting=csv.QUOTE_MINIMAL)
    writer.writerow([header for _, header in columns])
    for lead in leads:
        row = _flatten(lead)
        writer.writerow([row.get(key, '') for key, _ in columns])

    buffer.seek(0)
    filename = f"leads_export_{datetime.now(timezone.utc).strftime('%Y%m%d_%H%M%S')}.csv"
    return StreamingResponse(
        iter([buffer.getvalue()]),
        media_type='text/csv',
        headers={'Content-Disposition': f'attachment; filename="{filename}"'}
    )
async def get_lead(lead_id: str, current_user: dict = Depends(get_current_user)):
    lead = await get_tdb().leads.find_one({'id': lead_id}, {'_id': 0})
    if not lead:
        raise HTTPException(status_code=404, detail='Lead not found')
    
    # Check permission
    if current_user['role'] == 'sales_rep' and lead.get('assigned_to') != current_user['id']:
        raise HTTPException(status_code=403, detail='Access denied')
    
    if isinstance(lead['created_at'], str):
        lead['created_at'] = datetime.fromisoformat(lead['created_at'])
    if isinstance(lead['updated_at'], str):
        lead['updated_at'] = datetime.fromisoformat(lead['updated_at'])
    
    return lead

@api_router.put("/leads/{lead_id}", response_model=Lead)
async def update_lead(
    lead_id: str, 
    lead_update: LeadUpdate, 
    current_user: dict = Depends(get_current_user),
    skip_activity_log: bool = False
):
    lead = await get_tdb().leads.find_one({'id': lead_id}, {'_id': 0})
    if not lead:
        raise HTTPException(status_code=404, detail='Lead not found')
    
    # Check permission
    if current_user['role'] == 'sales_rep' and lead.get('assigned_to') != current_user['id']:
        raise HTTPException(status_code=403, detail='Access denied')
    
    # Build update data - handle None values specially for fields that can be cleared
    # If a field is in `clearable_fields`, sending it as `null` from the client
    # will write None to the DB (clear it). Other null fields are skipped so we
    # don't accidentally blank values during a partial update.
    clearable_fields = {
        'next_followup_date', 'last_contacted_date', 'dotted_line_to', 'reports_to',
        # Onboarding / closure planning fields — users need to be able to clear
        # these after setting them once.
        'onboarded_month', 'onboarded_year',
        'target_closure_month', 'target_closure_year',
    }
    update_data = {}

    # `model_dump(exclude_unset=True)` returns only the fields the client put in
    # the request body, so we can distinguish "field not provided" from
    # "field provided as null". Use that to decide whether a clearable field
    # was explicitly set to null.
    explicit = lead_update.model_dump(exclude_unset=True)
    for k, v in lead_update.model_dump().items():
        # Include the field if it has a value, OR if it's a clearable field
        # that the client EXPLICITLY set to None.
        if v is not None:
            update_data[k] = v
        elif k in clearable_fields and k in explicit:
            update_data[k] = None
    
    # Status transition validation
    if 'status' in update_data and update_data['status'] != lead.get('status'):
        new_status = update_data['status']
        current_status = lead.get('status')
        
        # CEO and System Admin can change status without restrictions
        user_role = current_user.get('role', '').lower()
        is_admin = user_role in ['ceo', 'admin', 'director', 'system admin']
        
        if not is_admin:
            # Validation 1: "proposal_shared" requires an approved proposal
            if new_status == 'proposal_shared':
                proposal = await get_tdb().lead_proposals.find_one({'lead_id': lead_id})
                if not proposal or proposal.get('status') != 'approved':
                    raise HTTPException(
                        status_code=400, 
                        detail='Cannot set status to "Proposal Shared" without an approved proposal. Please get the proposal approved first.'
                    )
            
            # Validation 2: "proposal_approved_by_customer" can only be set from "proposal_shared_with_customer"
            if new_status == 'proposal_approved_by_customer':
                if current_status != 'proposal_shared_with_customer':
                    raise HTTPException(
                        status_code=400,
                        detail='Lead can only be marked as "Proposal Approved by Customer" from "Proposal Shared with Customer" status.'
                    )
            
            # Validation 3: "won" can only be set from "proposal_approved_by_customer"
            if new_status == 'won':
                if current_status != 'proposal_approved_by_customer':
                    raise HTTPException(
                        status_code=400,
                        detail='Lead can only be marked as "Won" from "Proposal Approved by Customer" status.'
                    )
    
    update_data['updated_at'] = datetime.now(timezone.utc).isoformat()
    
    # Calculate estimated_monthly_revenue if proposed_sku_pricing is being updated
    if 'proposed_sku_pricing' in update_data:
        monthly_bottles = 0
        opportunity_estimation = lead.get('opportunity_estimation') or {}
        if opportunity_estimation:
            monthly_bottles = opportunity_estimation.get('final_monthly') or opportunity_estimation.get('calculated_monthly') or 0
        
        estimated_revenue = 0
        for sku in (update_data['proposed_sku_pricing'] or []):
            percentage = sku.get('percentage', 0)
            price_per_unit = sku.get('price_per_unit', 0)
            estimated_qty = round((monthly_bottles * percentage) / 100) if percentage else 0
            estimated_revenue += estimated_qty * price_per_unit
        
        # Store calculated revenue in opportunity_estimation
        if opportunity_estimation:
            opportunity_estimation['estimated_monthly_revenue'] = estimated_revenue
            update_data['opportunity_estimation'] = opportunity_estimation
        else:
            update_data['opportunity_estimation'] = {'estimated_monthly_revenue': estimated_revenue}
    
    # Track status change (skip if activity was already logged via activity endpoint)
    if 'status' in update_data and update_data['status'] != lead.get('status') and not skip_activity_log:
        activity = Activity(
            lead_id=lead_id,
            activity_type='status_change',
            description=f'Status changed from {lead.get("status")} to {update_data["status"]} by {current_user["name"]}',
            created_by=current_user['id']
        )
        activity_doc = activity.model_dump()
        activity_doc['created_at'] = activity_doc['created_at'].isoformat()
        await get_tdb().activities.insert_one(activity_doc)
    
    await get_tdb().leads.update_one({'id': lead_id}, {'$set': update_data})
    
    updated_lead = await get_tdb().leads.find_one({'id': lead_id}, {'_id': 0})
    if isinstance(updated_lead['created_at'], str):
        updated_lead['created_at'] = datetime.fromisoformat(updated_lead['created_at'])
    if isinstance(updated_lead['updated_at'], str):
        updated_lead['updated_at'] = datetime.fromisoformat(updated_lead['updated_at'])
    
    return updated_lead


# ============== LEAD CHECK-IN (Geo-fenced "I am here") ==============

class LeadCheckInPayload(BaseModel):
    latitude: float
    longitude: float
    accuracy: Optional[float] = None  # GPS accuracy in meters as reported by browser

def _haversine_meters(lat1: float, lng1: float, lat2: float, lng2: float) -> float:
    """Great-circle distance in meters between two (lat, lng) points."""
    import math
    R = 6371000.0  # Earth radius in meters
    phi1 = math.radians(lat1)
    phi2 = math.radians(lat2)
    dphi = math.radians(lat2 - lat1)
    dlmb = math.radians(lng2 - lng1)
    a = math.sin(dphi / 2) ** 2 + math.cos(phi1) * math.cos(phi2) * math.sin(dlmb / 2) ** 2
    c = 2 * math.atan2(math.sqrt(a), math.sqrt(1 - a))
    return R * c

@api_router.post("/leads/{lead_id}/check-in")
async def lead_check_in(
    lead_id: str,
    payload: LeadCheckInPayload,
    current_user: dict = Depends(get_current_user),
):
    """Sales rep "I am here" check-in.

    Computes distance from the lead's saved delivery address and logs a visit
    activity. Distance is always recorded; an off-site flag is set when the
    sales rep is outside the tenant's configured geo-fence radius.
    """
    lead = await get_tdb().leads.find_one({'id': lead_id}, {'_id': 0})
    if not lead:
        raise HTTPException(status_code=404, detail='Lead not found')

    delivery = (lead.get('delivery_address') or {})
    lead_lat = delivery.get('lat')
    lead_lng = delivery.get('lng')
    if lead_lat is None or lead_lng is None:
        raise HTTPException(
            status_code=400,
            detail='Lead has no GPS coordinates. Save the lead address from Google search first.'
        )

    # Compute distance from lead's stored coordinates
    distance_m = _haversine_meters(
        float(lead_lat), float(lead_lng),
        float(payload.latitude), float(payload.longitude),
    )

    # Resolve tenant radius (default 50m if unset)
    tenant_id = get_current_tenant_id()
    tenant = await db.tenants.find_one({'tenant_id': tenant_id}, {'_id': 0})
    radius_m = 50
    try:
        radius_m = int(((tenant or {}).get('settings') or {}).get('check_in_radius_meters') or 50)
    except (TypeError, ValueError):
        radius_m = 50

    within = distance_m <= radius_m
    distance_label = f"{distance_m:.0f}m" if distance_m < 1000 else f"{(distance_m/1000):.2f}km"
    now = datetime.now(timezone.utc)

    # Format time in tenant timezone if available; fall back to UTC ISO
    timestamp_label = now.strftime('%d %b %Y, %I:%M %p UTC')
    try:
        tz_name = ((tenant or {}).get('settings') or {}).get('timezone') or 'Asia/Kolkata'
        try:
            from zoneinfo import ZoneInfo
            local_now = now.astimezone(ZoneInfo(tz_name))
            timestamp_label = local_now.strftime('%d %b %Y, %I:%M %p')
        except Exception:
            pass
    except Exception:
        pass

    if within:
        description = (
            f"Visited this place at {timestamp_label} — {distance_label} from the lead location "
            f"(within {radius_m}m fence)."
        )
    else:
        description = (
            f"Visited (off-site) at {timestamp_label} — {distance_label} from the lead location "
            f"(outside {radius_m}m fence)."
        )

    activity_doc = {
        'id': str(uuid.uuid4()),
        'lead_id': lead_id,
        'activity_type': 'visit',
        'description': description,
        'interaction_method': 'customer_visit',
        'created_by': current_user['id'],
        'created_by_name': current_user.get('name') or current_user.get('email') or '',
        'created_at': now.isoformat(),
        # Geo-tracking metadata
        'check_in': {
            'latitude': float(payload.latitude),
            'longitude': float(payload.longitude),
            'accuracy': float(payload.accuracy) if payload.accuracy is not None else None,
            'distance_m': round(distance_m, 2),
            'radius_m': radius_m,
            'within_radius': within,
            'lead_lat': float(lead_lat),
            'lead_lng': float(lead_lng),
        },
    }
    await get_tdb().activities.insert_one(activity_doc)

    # Update last contact info on the lead
    await get_tdb().leads.update_one(
        {'id': lead_id},
        {'$set': {
            'updated_at': now.isoformat(),
            'last_contacted_date': now.isoformat(),
            'last_contact_method': 'visit',
        }}
    )

    return {
        'activity_id': activity_doc['id'],
        'distance_m': round(distance_m, 2),
        'radius_m': radius_m,
        'within_radius': within,
        'description': description,
    }


@api_router.delete("/leads/{lead_id}")
async def delete_lead(lead_id: str, current_user: dict = Depends(get_current_user)):
    # Get the lead first
    lead = await get_tdb().leads.find_one({'id': lead_id}, {'_id': 0})
    if not lead:
        raise HTTPException(status_code=404, detail='Lead not found')
    
    # Allow deletion if user is:
    # 1. Lead creator, OR
    # 2. Leadership (CEO, Director, VP, National Head)
    is_creator = lead.get('created_by') == current_user['id']
    is_leadership = current_user['role'] in ['CEO', 'Director', 'Vice President', 'National Sales Head']
    
    if not (is_creator or is_leadership):
        raise HTTPException(status_code=403, detail='Only lead creator or leadership can delete leads')
    
    result = await get_tdb().leads.delete_one({'id': lead_id})
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail='Lead not found')
    
    # Delete related data
    await get_tdb().activities.delete_many({'lead_id': lead_id})
    await get_tdb().follow_ups.delete_many({'lead_id': lead_id})
    await get_tdb().comments.delete_many({'lead_id': lead_id})
    await get_tdb().invoices.delete_many({'lead_uuid': lead_id})
    
    return {'message': 'Lead deleted successfully'}

@api_router.post("/leads/{lead_id}/generate-lead-id")
async def generate_lead_id_for_lead(lead_id: str, current_user: dict = Depends(get_current_user)):
    """Generate a lead_id for a lead that doesn't have one"""
    lead = await get_tdb().leads.find_one({'id': lead_id}, {'_id': 0})
    if not lead:
        raise HTTPException(status_code=404, detail='Lead not found')
    
    # Check if lead already has a lead_id
    if lead.get('lead_id'):
        raise HTTPException(status_code=400, detail='Lead already has a Lead ID')
    
    # Check permission
    if current_user['role'] == 'sales_rep' and lead.get('assigned_to') != current_user['id']:
        raise HTTPException(status_code=403, detail='Access denied')
    
    # Get company and city for generating lead_id
    company = lead.get('company', 'UNKNOWN')
    city = lead.get('city', 'XXX')
    
    # Generate the lead_id
    new_lead_id = await generate_lead_id(company, city)
    
    # Update the lead
    await get_tdb().leads.update_one(
        {'id': lead_id},
        {
            '$set': {
                'lead_id': new_lead_id,
                'updated_at': datetime.now(timezone.utc).isoformat()
            }
        }
    )
    
    return {'lead_id': new_lead_id, 'message': f'Lead ID generated successfully: {new_lead_id}'}

# ============= MASTER LEAD STATUSES =============

class LeadStatusCreate(BaseModel):
    label: str
    color: str = 'gray'

class LeadStatusUpdate(BaseModel):
    label: Optional[str] = None
    color: Optional[str] = None
    order: Optional[int] = None
    is_active: Optional[bool] = None

# ============= BUSINESS CATEGORY MODELS =============

class BusinessCategory(BaseModel):
    """Business category for leads/accounts"""
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    name: str  # e.g., "Restaurant", "Star Hotel", "Hospital"
    description: Optional[str] = None
    icon: Optional[str] = None  # Icon name for UI
    color: str = 'blue'  # Color for badges
    order: int = 0
    is_active: bool = True
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))

class BusinessCategoryCreate(BaseModel):
    name: str
    description: Optional[str] = None
    icon: Optional[str] = None
    color: str = 'blue'

class BusinessCategoryUpdate(BaseModel):
    name: Optional[str] = None
    description: Optional[str] = None
    icon: Optional[str] = None
    color: Optional[str] = None
    is_active: Optional[bool] = None

@api_router.get("/master/lead-statuses")
async def get_lead_statuses(current_user: dict = Depends(get_current_user)):
    """Get all lead statuses ordered by 'order' field"""
    statuses = await db.lead_statuses.find({}, {'_id': 0}).sort('order', 1).to_list(100)
    return {'statuses': statuses}

@api_router.post("/master/lead-statuses")
async def create_lead_status(status: LeadStatusCreate, current_user: dict = Depends(get_current_user)):
    """Create a new lead status (Admin/Director only)"""
    if current_user['role'].lower() not in ['ceo', 'director', 'admin', 'system admin']:
        raise HTTPException(status_code=403, detail='Only admins can manage lead statuses')
    
    # Generate ID from label
    status_id = status.label.lower().replace(' ', '_').replace('-', '_')
    status_id = ''.join(c for c in status_id if c.isalnum() or c == '_')
    
    # Check if already exists
    existing = await db.lead_statuses.find_one({'id': status_id})
    if existing:
        raise HTTPException(status_code=400, detail='Status with this name already exists')
    
    # Get max order
    max_order_doc = await db.lead_statuses.find_one(sort=[('order', -1)])
    max_order = max_order_doc.get('order', 0) if max_order_doc else 0
    
    new_status = {
        'id': status_id,
        'label': status.label,
        'color': status.color,
        'order': max_order + 1,
        'is_active': True
    }
    
    await db.lead_statuses.insert_one(new_status)
    return {'status': {k: v for k, v in new_status.items() if k != '_id'}, 'message': 'Status created successfully'}

@api_router.put("/master/lead-statuses/{status_id}")
async def update_lead_status(status_id: str, status: LeadStatusUpdate, current_user: dict = Depends(get_current_user)):
    """Update a lead status (Admin/Director only)"""
    if current_user['role'].lower() not in ['ceo', 'director', 'admin', 'system admin']:
        raise HTTPException(status_code=403, detail='Only admins can manage lead statuses')
    
    existing = await db.lead_statuses.find_one({'id': status_id})
    if not existing:
        raise HTTPException(status_code=404, detail='Status not found')
    
    update_data = {k: v for k, v in status.dict().items() if v is not None}
    if not update_data:
        raise HTTPException(status_code=400, detail='No data to update')
    
    await db.lead_statuses.update_one({'id': status_id}, {'$set': update_data})
    
    updated = await db.lead_statuses.find_one({'id': status_id}, {'_id': 0})
    return {'status': updated, 'message': 'Status updated successfully'}

@api_router.delete("/master/lead-statuses/{status_id}")
async def delete_lead_status(status_id: str, current_user: dict = Depends(get_current_user)):
    """Delete a lead status (Admin/Director only) - only if no leads use it"""
    if current_user['role'].lower() not in ['ceo', 'director', 'admin', 'system admin']:
        raise HTTPException(status_code=403, detail='Only admins can manage lead statuses')
    
    # Check if any leads use this status
    leads_count = await get_tdb().leads.count_documents({'status': status_id})
    if leads_count > 0:
        raise HTTPException(status_code=400, detail=f'Cannot delete: {leads_count} leads have this status')
    
    result = await db.lead_statuses.delete_one({'id': status_id})
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail='Status not found')
    
    return {'message': 'Status deleted successfully'}

@api_router.put("/master/lead-statuses/reorder")
async def reorder_lead_statuses(status_ids: List[str], current_user: dict = Depends(get_current_user)):
    """Reorder lead statuses (Admin/Director only)"""
    if current_user['role'].lower() not in ['ceo', 'director', 'admin', 'system admin']:
        raise HTTPException(status_code=403, detail='Only admins can manage lead statuses')
    
    for i, status_id in enumerate(status_ids):
        await db.lead_statuses.update_one({'id': status_id}, {'$set': {'order': i + 1}})
    
    return {'message': 'Statuses reordered successfully'}

# ============= BUSINESS CATEGORY ROUTES =============

@api_router.get("/master/business-categories")
async def get_business_categories(current_user: dict = Depends(get_current_user)):
    """Get all business categories ordered by 'order' field"""
    categories = await db.business_categories.find({}, {'_id': 0}).sort('order', 1).to_list(100)
    return {'categories': categories}

@api_router.post("/master/business-categories")
async def create_business_category(category: BusinessCategoryCreate, current_user: dict = Depends(get_current_user)):
    """Create a new business category (Admin/Director only)"""
    if current_user['role'].lower() not in ['ceo', 'director', 'admin', 'system admin']:
        raise HTTPException(status_code=403, detail='Only admins can manage business categories')
    
    # Check if category already exists
    existing = await db.business_categories.find_one({'name': category.name})
    if existing:
        raise HTTPException(status_code=400, detail='Category with this name already exists')
    
    # Get max order
    max_order_doc = await db.business_categories.find_one({}, sort=[('order', -1)])
    new_order = (max_order_doc.get('order', 0) + 1) if max_order_doc else 1
    
    new_category = BusinessCategory(
        name=category.name,
        description=category.description,
        icon=category.icon,
        color=category.color,
        order=new_order
    )
    
    doc = new_category.model_dump()
    doc['created_at'] = doc['created_at'].isoformat()
    
    await db.business_categories.insert_one(doc)
    
    return {'message': 'Business category created', 'category': {**doc, '_id': None}}

@api_router.put("/master/business-categories/{category_id}")
async def update_business_category(
    category_id: str,
    update: BusinessCategoryUpdate,
    current_user: dict = Depends(get_current_user)
):
    """Update a business category (Admin/Director only)"""
    if current_user['role'].lower() not in ['ceo', 'director', 'admin', 'system admin']:
        raise HTTPException(status_code=403, detail='Only admins can manage business categories')
    
    existing = await db.business_categories.find_one({'id': category_id})
    if not existing:
        raise HTTPException(status_code=404, detail='Business category not found')
    
    update_data = {k: v for k, v in update.model_dump().items() if v is not None}
    
    if update_data:
        await db.business_categories.update_one({'id': category_id}, {'$set': update_data})
    
    return {'message': 'Business category updated'}

@api_router.delete("/master/business-categories/{category_id}")
async def delete_business_category(category_id: str, current_user: dict = Depends(get_current_user)):
    """Delete a business category (Admin/Director only)"""
    if current_user['role'].lower() not in ['ceo', 'director', 'admin', 'system admin']:
        raise HTTPException(status_code=403, detail='Only admins can manage business categories')
    
    existing = await db.business_categories.find_one({'id': category_id})
    if not existing:
        raise HTTPException(status_code=404, detail='Business category not found')
    
    # Check if category is in use
    leads_using = await get_tdb().leads.count_documents({'category': existing.get('name')})
    if leads_using > 0:
        # Instead of deleting, deactivate it
        await db.business_categories.update_one({'id': category_id}, {'$set': {'is_active': False}})
        return {'message': f'Category deactivated (in use by {leads_using} leads)'}
    
    await db.business_categories.delete_one({'id': category_id})
    return {'message': 'Business category deleted'}

@api_router.put("/master/business-categories/reorder")
async def reorder_business_categories(category_ids: List[str], current_user: dict = Depends(get_current_user)):
    """Reorder business categories (Admin/Director only)"""
    if current_user['role'].lower() not in ['ceo', 'director', 'admin', 'system admin']:
        raise HTTPException(status_code=403, detail='Only admins can manage business categories')
    
    for i, category_id in enumerate(category_ids):
        await db.business_categories.update_one({'id': category_id}, {'$set': {'order': i + 1}})
    
    return {'message': 'Categories reordered successfully'}

# ============= SALES REVENUE DASHBOARD =============

@api_router.get("/sales-revenue/won-leads")
async def get_won_leads_revenue(
    time_filter: str = "lifetime",
    resource_id: Optional[str] = None,
    city: Optional[str] = None,
    territory: Optional[str] = None,
    current_user: dict = Depends(get_current_user)
):
    """Get all WON leads with their invoice totals for the Sales Revenue Dashboard"""
    from datetime import datetime, timedelta
    from dateutil.relativedelta import relativedelta
    
    # Build base query for WON leads
    query = {'status': 'won'}

    # ── Resolve the (start, end) period datetimes for filtering ──
    # The Revenue Report is now driven by each lead's `target_closure_month` /
    # `target_closure_year` (the period the deal was *expected to close in*),
    # NOT by `updated_at`. We also scope invoices to the same window via
    # `invoice_date` further below.
    now = datetime.now(timezone.utc)
    start_date = None
    end_date = None

    if time_filter == "this_week":
        start_date = now - timedelta(days=now.weekday())
        end_date = now
    elif time_filter == "last_week":
        start_date = now - timedelta(days=now.weekday() + 7)
        end_date = now - timedelta(days=now.weekday())
    elif time_filter == "this_month":
        start_date = now.replace(day=1, hour=0, minute=0, second=0, microsecond=0)
        end_date = now
    elif time_filter == "last_month":
        first_of_this_month = now.replace(day=1, hour=0, minute=0, second=0, microsecond=0)
        start_date = (first_of_this_month - relativedelta(months=1))
        end_date = first_of_this_month
    elif time_filter == "this_quarter":
        quarter = (now.month - 1) // 3
        start_date = now.replace(month=quarter * 3 + 1, day=1, hour=0, minute=0, second=0, microsecond=0)
        end_date = now
    elif time_filter == "last_quarter":
        quarter = (now.month - 1) // 3
        if quarter == 0:
            start_date = now.replace(year=now.year - 1, month=10, day=1, hour=0, minute=0, second=0, microsecond=0)
            end_date = now.replace(month=1, day=1, hour=0, minute=0, second=0, microsecond=0)
        else:
            start_date = now.replace(month=(quarter - 1) * 3 + 1, day=1, hour=0, minute=0, second=0, microsecond=0)
            end_date = now.replace(month=quarter * 3 + 1, day=1, hour=0, minute=0, second=0, microsecond=0)
    elif time_filter == "last_3_months":
        start_date = now - relativedelta(months=3)
        end_date = now
    elif time_filter == "last_6_months":
        start_date = now - relativedelta(months=6)
        end_date = now
    elif time_filter == "this_year":
        start_date = now.replace(month=1, day=1, hour=0, minute=0, second=0, microsecond=0)
        end_date = now
    elif time_filter == "last_year":
        start_date = now.replace(year=now.year - 1, month=1, day=1, hour=0, minute=0, second=0, microsecond=0)
        end_date = now.replace(month=1, day=1, hour=0, minute=0, second=0, microsecond=0)

    # Build the set of (year, month) pairs the time window spans. For
    # multi-month windows (e.g., this_quarter, last_3_months) we accept any
    # lead whose target_closure_year/month falls in the set.
    target_year_month_pairs: list = []
    if start_date and end_date:
        cur = start_date.replace(day=1, hour=0, minute=0, second=0, microsecond=0)
        # Walk month-by-month until we go past end_date
        # Cap at 60 months as a sanity guard (we never expose > 5y windows)
        for _ in range(60):
            if cur >= end_date:
                break
            target_year_month_pairs.append((cur.year, cur.month))
            cur = cur + relativedelta(months=1)
        # Always include the start month even if end_date == start_date
        if not target_year_month_pairs:
            target_year_month_pairs.append((start_date.year, start_date.month))

    # Apply lead-period filter: match by target_closure_month/year (preferred),
    # falling back to updated_at for leads that lack those fields.
    if target_year_month_pairs:
        ym_or = [
            {'target_closure_year': y, 'target_closure_month': m}
            for (y, m) in target_year_month_pairs
        ]
        query['$or'] = [
            *ym_or,
            # Fallback: leads with no target_closure_* set — use updated_at
            {
                'target_closure_year': {'$in': [None, '', 0]},
                'updated_at': {
                    '$gte': start_date.isoformat(),
                    '$lt': end_date.isoformat(),
                },
            },
            {
                'target_closure_year': {'$exists': False},
                'updated_at': {
                    '$gte': start_date.isoformat(),
                    '$lt': end_date.isoformat(),
                },
            },
        ]

    # Apply resource filter
    if resource_id:
        query['assigned_to'] = resource_id
    
    # Apply city filter
    if city:
        query['city'] = city
    
    # Apply territory filter (region)
    if territory:
        query['region'] = territory
    
    # Fetch won leads
    leads = await get_tdb().leads.find(query, {'_id': 0}).sort('updated_at', -1).to_list(1000)
    
    # Get user info for assigned_to
    user_ids = list(set([l.get('assigned_to') for l in leads if l.get('assigned_to')]))
    users = await get_tdb().users.find({'id': {'$in': user_ids}}, {'_id': 0, 'id': 1, 'name': 1}).to_list(100)
    user_map = {u['id']: u['name'] for u in users}

    # ── INVOICE AGGREGATION (recomputed live, not from stale lead-cached fields) ──
    # External invoices were migrated to an account-centric linkage. The
    # per-lead rollup fields (total_gross_invoice_value etc.) are no longer
    # refreshed, so we must reconcile by querying invoices via every possible
    # linkage field and bucketing them back to leads.
    lead_ids = [l['id'] for l in leads if l.get('id')]
    lead_formatted_ids = [l.get('lead_id') for l in leads if l.get('lead_id')]

    # Resolve each lead → account(s). Accounts may store EITHER the lead UUID
    # OR the formatted lead_id (e.g., TOOP-HYD-L26-001) in account.lead_id,
    # depending on when they were created. Query for both.
    lead_lookup_ids = [x for x in (lead_ids + lead_formatted_ids) if x]
    accounts_for_leads = await get_tdb().accounts.find(
        {'lead_id': {'$in': lead_lookup_ids}},
        {'_id': 0, 'id': 1, 'account_id': 1, 'account_name': 1, 'lead_id': 1}
    ).to_list(len(lead_lookup_ids) or 1) if lead_lookup_ids else []

    # Build a map: account.lead_id (whatever it is) → lead.id (UUID).
    # account.lead_id may be either a UUID or a formatted id, so cover both.
    lead_uuid_by_any_id = {}
    for ld in leads:
        if ld.get('id'):
            lead_uuid_by_any_id[ld['id']] = ld['id']
        if ld.get('lead_id'):
            lead_uuid_by_any_id[ld['lead_id']] = ld['id']

    # Build reverse maps: any invoice-linkage value → owning lead UUID
    inv_linkage_to_lead_id: dict = {}
    account_uuids: list = []
    account_formatted_ids: list = []
    for acc in accounts_for_leads:
        # Resolve the lead UUID this account belongs to (account.lead_id may
        # be either UUID or formatted lead id).
        owning_lead = lead_uuid_by_any_id.get(acc.get('lead_id'))
        if not owning_lead:
            continue
        if acc.get('id'):
            inv_linkage_to_lead_id[acc['id']] = owning_lead
            account_uuids.append(acc['id'])
        if acc.get('account_id'):
            inv_linkage_to_lead_id[acc['account_id']] = owning_lead
            account_formatted_ids.append(acc['account_id'])
    for ld in leads:
        if ld.get('id'):
            inv_linkage_to_lead_id[ld['id']] = ld['id']
        if ld.get('lead_id'):
            inv_linkage_to_lead_id[ld['lead_id']] = ld['id']

    # Build the master invoice query — match any linkage that points to a won lead
    inv_or: list = []
    if account_uuids:
        inv_or.append({'account_uuid': {'$in': account_uuids}})
        inv_or.append({'account_id': {'$in': account_uuids}})
    if account_formatted_ids:
        inv_or.append({'account_id': {'$in': account_formatted_ids}})
        inv_or.append({'account_id_from_mq': {'$in': account_formatted_ids}})
    if lead_ids:
        inv_or.append({'lead_id': {'$in': lead_ids}})
        inv_or.append({'lead_uuid': {'$in': lead_ids}})
    if lead_formatted_ids:
        inv_or.append({'ca_lead_id': {'$in': lead_formatted_ids}})

    invoice_totals: dict = {}  # lead_id → {gross, net, credit, count}
    if inv_or:
        # Scope invoices to the same time window the user selected, so the
        # totals shown reflect billings during that period only. invoice_date
        # may be stored as a YYYY-MM-DD string or a BSON datetime — match both.
        inv_query: dict = {'$or': inv_or}
        if start_date and end_date and time_filter != 'lifetime':
            start_s = start_date.strftime('%Y-%m-%d')
            end_s = end_date.strftime('%Y-%m-%d')
            inv_query = {
                '$and': [
                    {'$or': inv_or},
                    {'$or': [
                        {'invoice_date': {'$gte': start_s, '$lt': end_s + 'T23:59:59'}},
                        {'invoice_date': {'$gte': start_date, '$lt': end_date}},
                    ]},
                ]
            }
        invoices_all = await get_tdb().invoices.find(
            inv_query,
            {'_id': 0, 'account_uuid': 1, 'account_id': 1, 'account_id_from_mq': 1,
             'ca_lead_id': 1, 'lead_id': 1, 'lead_uuid': 1, 'invoice_date': 1,
             'gross_invoice_value': 1, 'grand_total': 1, 'total_amount': 1,
             'net_invoice_value': 1, 'paid_amount': 1,
             'credit_note_value': 1, 'credit_note': 1}
        ).to_list(20000)

        for inv in invoices_all:
            # Find which lead this invoice belongs to (priority order)
            owner = None
            for key in ('account_uuid', 'account_id', 'account_id_from_mq', 'ca_lead_id', 'lead_id', 'lead_uuid'):
                val = inv.get(key)
                if val and val in inv_linkage_to_lead_id:
                    owner = inv_linkage_to_lead_id[val]
                    break
            if not owner:
                continue
            bucket = invoice_totals.setdefault(owner, {'gross': 0.0, 'net': 0.0, 'credit': 0.0, 'count': 0})
            bucket['gross'] += float(inv.get('gross_invoice_value') or inv.get('grand_total') or inv.get('total_amount') or 0)
            bucket['net']   += float(inv.get('net_invoice_value')   or inv.get('paid_amount') or 0)
            bucket['credit']+= float(inv.get('credit_note_value')   or inv.get('credit_note') or 0)
            bucket['count'] += 1
    
    # Build response with invoice data
    result = []
    total_gross = 0
    total_net = 0
    total_credit = 0
    
    for lead in leads:
        live = invoice_totals.get(lead['id']) or {}
        # When a time window is in effect, trust the live period-scoped totals
        # exclusively (no fallback to lifetime-cached fields — those would be
        # misleading inside a "Last Month" or "Last Quarter" view). For
        # `lifetime` we still fall back if the live recompute returned nothing.
        if time_filter == 'lifetime':
            gross = live.get('gross') or (lead.get('total_gross_invoice_value') or 0)
            net = live.get('net') or (lead.get('total_net_invoice_value') or 0)
            credit = live.get('credit') or (lead.get('total_credit_note_value') or 0)
            invoice_count = live.get('count') or (lead.get('invoice_count') or 0)
        else:
            gross = live.get('gross') or 0
            net = live.get('net') or 0
            credit = live.get('credit') or 0
            invoice_count = live.get('count') or 0
        
        total_gross += gross
        total_net += net
        total_credit += credit
        
        result.append({
            'id': lead['id'],
            'lead_id': lead.get('lead_id'),
            'company': lead.get('company'),
            'city': lead.get('city'),
            'territory': lead.get('region'),
            'assigned_to': lead.get('assigned_to'),
            'assigned_to_name': user_map.get(lead.get('assigned_to'), '-'),
            'won_date': lead.get('updated_at'),
            'invoice_count': invoice_count,
            'gross_invoice_value': gross,
            'net_invoice_value': net,
            'credit_note_value': credit
        })
    
    return {
        'leads': result,
        'summary': {
            'total_leads': len(result),
            'total_gross': total_gross,
            'total_net': total_net,
            'total_credit': total_credit
        }
    }

@api_router.get("/sales-revenue/filters")
async def get_revenue_filters(current_user: dict = Depends(get_current_user)):
    """Get filter options for Sales Revenue Dashboard"""
    # Get unique cities from won leads
    cities = await get_tdb().leads.distinct('city', {'status': 'won'})
    
    # Get unique territories (regions)
    territories = await get_tdb().leads.distinct('region', {'status': 'won'})
    
    # Get resources (users who have won leads assigned)
    assigned_users = await get_tdb().leads.distinct('assigned_to', {'status': 'won', 'assigned_to': {'$ne': None}})
    users = await get_tdb().users.find({'id': {'$in': assigned_users}}, {'_id': 0, 'id': 1, 'name': 1}).to_list(100)
    
    return {
        'cities': sorted([c for c in cities if c]),
        'territories': sorted([t for t in territories if t]),
        'resources': [{'id': u['id'], 'name': u['name']} for u in users]
    }

# ============= INVOICE ROUTES =============

@api_router.get("/leads/{lead_id}/invoices")
async def get_lead_invoices(lead_id: str, current_user: dict = Depends(get_current_user)):
    """Get all invoices for a specific lead"""
    lead = await get_tdb().leads.find_one({'id': lead_id}, {'_id': 0})
    if not lead:
        raise HTTPException(status_code=404, detail='Lead not found')
    
    invoices = await get_tdb().invoices.find(
        {'lead_uuid': lead_id},
        {'_id': 0}
    ).sort('received_at', -1).to_list(100)
    
    return {
        'lead_id': lead.get('lead_id'),
        'company': lead.get('company'),
        'total_gross_invoice_value': lead.get('total_gross_invoice_value', 0),
        'total_net_invoice_value': lead.get('total_net_invoice_value', 0),
        'total_credit_note_value': lead.get('total_credit_note_value', 0),
        'invoice_count': len(invoices),
        'invoices': invoices
    }

@api_router.get("/invoices/unmatched")
async def get_unmatched_invoices(current_user: dict = Depends(get_current_user)):
    """Get invoices that couldn't be matched to a lead"""
    invoices = await get_tdb().invoices.find(
        {'status': 'unmatched'},
        {'_id': 0}
    ).sort('received_at', -1).to_list(100)
    
    return {'invoices': invoices}

@api_router.get("/resources/{resource_id}/invoice-summary")
async def get_resource_invoice_summary(resource_id: str, current_user: dict = Depends(get_current_user)):
    """Get invoice summary for a specific resource (sales person)"""
    # Get user info
    user = await get_tdb().users.find_one({'id': resource_id}, {'_id': 0, 'password': 0})
    if not user:
        raise HTTPException(status_code=404, detail='Resource not found')
    
    # Get resource invoice summary
    summary = await db.resource_invoice_summary.find_one({'resource_id': resource_id}, {'_id': 0})
    
    # Get all invoices for leads assigned to this resource
    invoices = await get_tdb().invoices.find(
        {'assigned_to': resource_id, 'status': 'matched'},
        {'_id': 0}
    ).sort('received_at', -1).to_list(100)
    
    # Get resource targets
    targets = await get_tdb().resource_targets.find({'resource_id': resource_id}, {'_id': 0}).to_list(100)
    total_target = sum(t.get('target_revenue', 0) for t in targets)
    
    achieved = summary.get('total_gross_invoice_value', 0) if summary else 0
    tbd = total_target - achieved
    achievement_pct = (achieved / total_target * 100) if total_target > 0 else 0
    
    return {
        'resource': {
            'id': user['id'],
            'name': user.get('name'),
            'designation': user.get('designation'),
            'territory': user.get('territory')
        },
        'target_revenue': total_target,
        'achieved_revenue': achieved,
        'tbd_revenue': tbd,
        'achievement_percentage': round(achievement_pct, 2),
        'invoice_count': summary.get('invoice_count', 0) if summary else 0,
        'recent_invoices': invoices[:10]
    }

@api_router.post("/invoices/match/{invoice_id}")
async def match_invoice_to_lead(
    invoice_id: str,
    lead_id: str,
    current_user: dict = Depends(get_current_user)
):
    """Manually match an unmatched invoice to a lead"""
    # Find the invoice
    invoice = await get_tdb().invoices.find_one({'id': invoice_id}, {'_id': 0})
    if not invoice:
        raise HTTPException(status_code=404, detail='Invoice not found')
    
    # Find the lead by formatted lead_id
    lead = await get_tdb().leads.find_one({'lead_id': lead_id}, {'_id': 0})
    if not lead:
        # Try by UUID
        lead = await get_tdb().leads.find_one({'id': lead_id}, {'_id': 0})
    
    if not lead:
        raise HTTPException(status_code=404, detail='Lead not found')
    
    # Update invoice — link to the lead AND, when that lead has been converted
    # to an account, stamp the stable CRM account ids so the account-detail page
    # can match this invoice by ID (never by name).
    inv_update = {
        'lead_uuid': lead['id'],
        'ca_lead_id': lead.get('lead_id'),
        'status': 'matched',
    }
    linked_account = await get_tdb().accounts.find_one(
        {'lead_id': lead['id']}, {'_id': 0, 'id': 1, 'account_id': 1}
    )
    if linked_account:
        inv_update['account_uuid'] = linked_account.get('id')
        inv_update['account_id'] = linked_account.get('account_id')

    await get_tdb().invoices.update_one(
        {'id': invoice_id},
        {'$set': inv_update}
    )
    
    # Recalculate lead totals
    all_invoices = await get_tdb().invoices.find({
        'lead_uuid': lead['id'],
        'status': 'matched'
    }).to_list(1000)
    
    total_gross = sum(inv.get('gross_invoice_value', 0) for inv in all_invoices)
    total_net = sum(inv.get('net_invoice_value', 0) for inv in all_invoices)
    total_credit = sum(inv.get('credit_note_value', 0) for inv in all_invoices)
    
    await get_tdb().leads.update_one(
        {'id': lead['id']},
        {
            '$set': {
                'total_gross_invoice_value': total_gross,
                'total_net_invoice_value': total_net,
                'total_credit_note_value': total_credit,
                'invoice_count': len(all_invoices),
                'last_invoice_date': invoice.get('invoice_date'),
                'last_invoice_no': invoice.get('invoice_no'),
                'updated_at': datetime.now(timezone.utc).isoformat()
            }
        }
    )
    
    return {'message': 'Invoice matched successfully', 'lead_id': lead.get('lead_id')}

@api_router.get("/mq/status")
async def get_mq_status(current_user: dict = Depends(get_current_user)):
    """Get ActiveMQ connection status"""
    if not MQ_AVAILABLE:
        return {'status': 'unavailable', 'message': 'ActiveMQ subscriber module not loaded'}
    
    try:
        is_connected = mq_subscriber.is_connected() if mq_subscriber else False
        return {
            'status': 'connected' if is_connected else 'disconnected',
            'host': os.environ.get('ACTIVEMQ_HOST', 'not configured'),
            'queue': os.environ.get('ACTIVEMQ_QUEUE', 'not configured'),
            'enabled': os.environ.get('ACTIVEMQ_ENABLED', 'false')
        }
    except Exception as e:
        return {'status': 'error', 'message': str(e)}

class InvoiceWebhookPayload(BaseModel):
    """Payload for invoice webhook (matches ActiveMQ message format)"""
    invoiceDate: Optional[str] = None  # Correct field name
    invoiceData: Optional[str] = None  # Legacy field name (typo in source system)
    grossInvoiceValue: str
    netInvoiceValue: str
    C_LEAD_ID: Optional[str] = None
    CA_LEAD_ID: str  # Our lead_id to match
    invoiceNo: str
    creditNoteValue: str
    outstanding: Optional[float] = None
    items: Optional[List[dict]] = None

@api_router.post("/invoices/webhook")
async def process_invoice_webhook(payload: InvoiceWebhookPayload):
    """
    Webhook endpoint for processing invoice messages.
    Use this when ActiveMQ is not accessible or for testing.
    No authentication required - validate via secret header in production.
    """
    try:
        from mq_subscriber import process_invoice_manually
        
        invoice_data = payload.model_dump()
        result = await process_invoice_manually(invoice_data, db)
        
        if result.get('success'):
            return {
                'status': 'success',
                'message': f"Invoice {payload.invoiceNo} processed for lead {result.get('lead_id')}",
                'details': result
            }
        else:
            return {
                'status': 'partial' if result.get('invoice_stored') else 'failed',
                'message': result.get('error'),
                'details': result
            }
    except ImportError:
        raise HTTPException(status_code=500, detail='Invoice processing module not available')
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@api_router.get("/activemq/status")
async def get_activemq_status_endpoint():
    """
    Get ActiveMQ connection status and statistics.
    Useful for monitoring in production. No auth required for health checks.
    """
    try:
        from mq_subscriber import get_activemq_status
        status = get_activemq_status()
        return status
    except ImportError:
        return {
            'enabled': False,
            'error': 'ActiveMQ module not available'
        }
    except Exception as e:
        return {
            'enabled': False,
            'error': str(e)
        }

# ============= ACCOUNTS ROUTES =============

async def generate_account_id(account_name: str, city: str) -> str:
    """Generate unique account ID in format: NAME4-CITY-AYY-SEQ"""
    clean_name = re.sub(r'[^a-zA-Z0-9]', '', account_name).upper()
    name4 = clean_name[:4].ljust(4, 'X')
    
    clean_city = re.sub(r'[^a-zA-Z0-9]', '', city).upper()
    city3 = clean_city[:3].ljust(3, 'X')
    
    year2 = datetime.now().strftime('%y')
    prefix = f"{name4}-{city3}-A{year2}-"
    
    regex_pattern = f"^{re.escape(prefix)}\\d{{3}}$"
    existing = await get_tdb().accounts.find(
        {'account_id': {'$regex': regex_pattern}},
        {'account_id': 1}
    ).sort('account_id', -1).limit(1).to_list(1)
    
    if existing and existing[0].get('account_id'):
        last_seq = int(existing[0]['account_id'][-3:])
        next_seq = last_seq + 1
    else:
        next_seq = 1
    
    seq3 = str(next_seq).zfill(3)
    return f"{name4}-{city3}-A{year2}-{seq3}"

@api_router.post("/accounts/convert-lead")
async def convert_lead_to_account(data: AccountCreate, current_user: dict = Depends(get_current_user)):
    """Convert a won lead to an account.

    Idempotent: if the lead has already been converted (or another concurrent
    request is converting it right now), the existing account is returned
    instead of creating a duplicate.
    """
    lead = await get_tdb().leads.find_one({'id': data.lead_id}, {'_id': 0})
    if not lead:
        raise HTTPException(status_code=404, detail='Lead not found')

    # Check if lead is won
    if lead.get('status') not in ['won', 'closed_won']:
        raise HTTPException(status_code=400, detail='Only won leads can be converted to accounts')

    # IDEMPOTENCY GUARD #1: lead already marked converted → return existing account
    async def _existing_account_for_lead() -> Optional[dict]:
        """Find the account previously created for this lead, by either link."""
        existing = None
        if lead.get('account_id'):
            existing = await get_tdb().accounts.find_one({'account_id': lead['account_id']}, {'_id': 0})
        if not existing and lead.get('lead_id'):
            existing = await get_tdb().accounts.find_one({'lead_id': lead['lead_id']}, {'_id': 0})
        if not existing:
            existing = await get_tdb().accounts.find_one({'lead_id': data.lead_id}, {'_id': 0})
        return existing

    if lead.get('converted_to_account') or lead.get('account_id'):
        existing = await _existing_account_for_lead()
        if existing:
            existing['already_existed'] = True
            return existing
        # Flag was set but no account found — clear and recreate (rare, self-healing)

    # IDEMPOTENCY GUARD #1b: an account with this GSTIN / name+city may already
    # exist from a different lead (or manual creation). Link & return it instead
    # of creating a duplicate.
    async def _existing_account_by_identity() -> Optional[dict]:
        """Find an existing account that matches the lead by identity (no
        cross-lead linkage). Match order: GSTIN → company+city (case-insensitive)."""
        gstin = (lead.get('gstin') or lead.get('GSTIN') or '').strip().upper()
        if gstin and len(gstin) >= 10:
            found = await get_tdb().accounts.find_one(
                {'gstin': {'$regex': f'^{gstin}$', '$options': 'i'}},
                {'_id': 0},
            )
            if found:
                return found
        company = (lead.get('company') or '').strip()
        city = (lead.get('city') or '').strip()
        if company and city:
            found = await get_tdb().accounts.find_one(
                {
                    'account_name': {'$regex': f'^{re.escape(company)}$', '$options': 'i'},
                    'city': {'$regex': f'^{re.escape(city)}$', '$options': 'i'},
                },
                {'_id': 0},
            )
            if found:
                return found
        return None

    duplicate = await _existing_account_by_identity()
    if duplicate:
        # Link this lead to the pre-existing account and mark it converted —
        # this stops the same dedup work from running again on subsequent clicks.
        await get_tdb().leads.update_one(
            {'id': data.lead_id},
            {'$set': {
                'converted_to_account': True,
                'account_id': duplicate.get('account_id') or duplicate.get('id'),
                'updated_at': datetime.now(timezone.utc).isoformat(),
            }},
        )
        duplicate['already_existed'] = True
        duplicate['matched_on'] = 'gstin' if (lead.get('gstin') or lead.get('GSTIN')) else 'company_and_city'
        # Bring the lead's contacts over to the matched account too.
        await get_tdb().contacts.update_many(
            {'lead_id': data.lead_id},
            {'$set': {
                'account_id': duplicate.get('account_id') or duplicate.get('id'),
                'updated_at': datetime.now(timezone.utc).isoformat(),
            }}
        )
        return duplicate

    # Validate proposed SKU pricing exists
    proposed_pricing = lead.get('proposed_sku_pricing', [])
    if not proposed_pricing or len(proposed_pricing) == 0:
        raise HTTPException(
            status_code=400, 
            detail='Please add at least one SKU with pricing before converting to account'
        )
    
    # Validate SKU pricing data
    for idx, sku_item in enumerate(proposed_pricing):
        sku_name = sku_item.get('sku', '')
        price = sku_item.get('proposed_price') or sku_item.get('price_per_unit') or 0
        
        if not sku_name or not sku_name.strip():
            raise HTTPException(
                status_code=400,
                detail=f'SKU #{idx + 1} is missing a name. Please select a valid SKU.'
            )
        
        if float(price) <= 0:
            raise HTTPException(
                status_code=400,
                detail=f'SKU "{sku_name}" has an invalid price. Price must be greater than 0.'
            )

    # IDEMPOTENCY GUARD #2 (race protection): atomically claim the conversion.
    # Only the first concurrent request will get matched_count == 1; all other
    # parallel requests find an account already linked and return it.
    claim = await get_tdb().leads.update_one(
        {'id': data.lead_id, 'converted_to_account': {'$ne': True}},
        {'$set': {'converted_to_account': True, 'updated_at': datetime.now(timezone.utc).isoformat()}}
    )
    if claim.matched_count == 0:
        # Another request beat us to the conversion — return its account
        # (give the writer a beat to insert the doc, then read)
        import asyncio as _asyncio
        for _ in range(5):
            existing = await _existing_account_for_lead()
            if existing:
                existing['already_existed'] = True
                return existing
            await _asyncio.sleep(0.2)
        raise HTTPException(status_code=409, detail='Lead is already being converted. Please refresh the page.')

    # Generate account ID
    account_name = lead.get('company') or lead.get('name', 'Unknown')
    city = lead.get('city', 'Unknown')
    account_id = await generate_account_id(account_name, city)
    
    # Convert proposed_sku_pricing from lead to account's sku_pricing format
    sku_pricing_list = []
    proposed_pricing = lead.get('proposed_sku_pricing', [])
    if proposed_pricing:
        for sku_item in proposed_pricing:
            # Map lead's proposed pricing fields to account's SKU pricing format
            sku_pricing_list.append(AccountSKUPricing(
                sku=sku_item.get('sku', ''),
                price_per_unit=float(sku_item.get('proposed_price', 0) or sku_item.get('price_per_unit', 0) or 0),
                return_bottle_credit=float(sku_item.get('bottle_return_credit', 0) or sku_item.get('return_bottle_credit', 0) or 0)
            ))
    
    # Create account with category and contact info from lead
    lead_type_val = lead.get('lead_type') or 'B2B'
    # Default include_in_gop_metrics: B2B → True, Retail → False
    default_include_gop = lead_type_val.lower() != 'retail'
    account = Account(
        account_id=account_id,
        lead_id=lead.get('lead_id') or data.lead_id,
        account_name=account_name,
        lead_type=lead_type_val,
        include_in_gop_metrics=default_include_gop,
        city=city,
        state=lead.get('state', ''),
        territory=lead.get('region', ''),
        assigned_to=lead.get('assigned_to'),
        contact_name=lead.get('contact_person') or lead.get('name'),
        contact_number=lead.get('phone'),
        sku_pricing=sku_pricing_list,
        onboarded_month=lead.get('onboarded_month'),
        onboarded_year=lead.get('onboarded_year')
    )
    
    doc = account.model_dump()
    # Add category from lead (extra field allowed by model)
    doc['category'] = lead.get('category')
    # Carry the lead's delivery address over to the new account when the
    # converting user confirmed the addresses are the same. The frontend asks
    # the user explicitly before sending `copy_lead_address=True`.
    if data.copy_lead_address and lead.get('delivery_address'):
        lda = lead['delivery_address'] or {}
        if lda.get('address_line1'):
            doc['delivery_address'] = {
                'address_line1': lda.get('address_line1') or '',
                'address_line2': lda.get('address_line2') or '',
                'city': lda.get('city') or lead.get('city') or '',
                'state': lda.get('state') or lead.get('state') or '',
                'pincode': lda.get('pincode') or '',
                'landmark': lda.get('landmark') or '',
                'lat': lda.get('lat'),
                'lng': lda.get('lng'),
                'formatted_address': lda.get('formatted_address') or lda.get('address_line1') or '',
                'source': 'copied_from_lead',
                'copied_from_lead_id': lead.get('id'),
            }
    doc['created_at'] = doc['created_at'].isoformat()
    doc['updated_at'] = doc['updated_at'].isoformat()

    try:
        await get_tdb().accounts.insert_one(doc)
    except Exception as e:
        # Rollback the conversion claim so the user can retry, then surface the error
        await get_tdb().leads.update_one(
            {'id': data.lead_id},
            {'$set': {'converted_to_account': False}, '$unset': {'account_id': ''}}
        )
        raise HTTPException(status_code=500, detail=f'Failed to create account: {e}')

    # Persist the account_id link on the lead now that the doc is safely inserted
    await get_tdb().leads.update_one(
        {'id': data.lead_id},
        {'$set': {'account_id': account_id, 'updated_at': datetime.now(timezone.utc).isoformat()}}
    )

    # Copy the lead's contacts onto the new account: same contact records, now
    # also tagged with this account_id so they appear under the account's
    # Contacts table (single source of truth — no duplication).
    await get_tdb().contacts.update_many(
        {'lead_id': data.lead_id},
        {'$set': {
            'account_id': account_id,
            'company': account_name,
            'updated_at': datetime.now(timezone.utc).isoformat(),
        }}
    )

    # Return the actual saved document (includes delivery_address when copied
    # from the lead). The Pydantic Account model would otherwise drop the
    # extra delivery_address field from the response payload.
    doc.pop('_id', None)
    return doc

@api_router.get("/accounts", response_model=PaginatedAccountsResponse)
async def get_accounts(
    page: int = 1,
    page_size: int = 25,
    search: Optional[str] = None,
    territory: Optional[str] = None,
    state: Optional[str] = None,
    city: Optional[str] = None,
    account_type: Optional[str] = None,
    lead_type: Optional[str] = None,
    category: Optional[str] = None,
    sku_category: Optional[str] = None,
    current_user: dict = Depends(get_current_user)
):
    """Get paginated accounts list with enhanced filters"""
    page_size = min(max(1, page_size), 100)
    page = max(1, page)
    skip = (page - 1) * page_size
    
    query = {}
    if territory:
        query['territory'] = territory
    if state:
        query['state'] = state
    if city:
        query['city'] = city
    if account_type:
        query['account_type'] = account_type
    # `lead_type` filter — applied as $and to coexist with search $or
    lead_type_clause = None
    if lead_type:
        if lead_type == 'B2B':
            # Treat missing/null lead_type as B2B (legacy default)
            lead_type_clause = {'$or': [
                {'lead_type': 'B2B'},
                {'lead_type': {'$exists': False}},
                {'lead_type': None},
            ]}
        else:
            lead_type_clause = {'lead_type': lead_type}
    if category:
        query['category'] = category
    # Filter by SKU category: accounts whose configured sku_pricing includes a
    # SKU belonging to the given master-SKU category.
    if sku_category:
        cat_sku_docs = await get_tdb().master_skus.find(
            {'category': sku_category}, {'_id': 0, 'id': 1}
        ).to_list(10000)
        query['sku_pricing.sku_id'] = {'$in': [s['id'] for s in cat_sku_docs]}
    if search:
        query['$or'] = [
            {'account_name': {'$regex': search, '$options': 'i'}},
            {'contact_name': {'$regex': search, '$options': 'i'}},
            {'account_id': {'$regex': search, '$options': 'i'}}
        ]
    # Combine lead_type clause via $and to coexist with search $or
    if lead_type_clause is not None:
        query.setdefault('$and', []).append(lead_type_clause)
    
    total = await get_tdb().accounts.count_documents(query)
    total_pages = (total + page_size - 1) // page_size
    
    accounts = await get_tdb().accounts.find(query, {'_id': 0}).sort('created_at', -1).skip(skip).limit(page_size).to_list(page_size)
    
    # Get user names for assigned_to field and category from original leads
    user_ids = list(set(a.get('assigned_to') for a in accounts if a.get('assigned_to')))
    lead_ids = list(set(a.get('lead_id') for a in accounts if a.get('lead_id')))
    
    user_map = {}
    if user_ids:
        users = await get_tdb().users.find({'id': {'$in': user_ids}}, {'_id': 0, 'id': 1, 'name': 1}).to_list(len(user_ids))
        user_map = {u['id']: u['name'] for u in users}
    
    lead_map = {}
    if lead_ids:
        leads = await get_tdb().leads.find({'id': {'$in': lead_ids}}, {'_id': 0, 'id': 1, 'category': 1}).to_list(len(lead_ids))
        lead_map = {l['id']: l.get('category') for l in leads}
    
    # Enrich account data
    for account in accounts:
        # Convert datetime strings back to datetime objects
        if isinstance(account.get('created_at'), str):
            account['created_at'] = datetime.fromisoformat(account['created_at'])
        if isinstance(account.get('updated_at'), str):
            account['updated_at'] = datetime.fromisoformat(account['updated_at'])
        
        # Add sales person name
        account['sales_person_name'] = user_map.get(account.get('assigned_to'), None)
        
        # Add category from lead if not already set
        if not account.get('category') and account.get('lead_id'):
            account['category'] = lead_map.get(account.get('lead_id'))
    
    return PaginatedAccountsResponse(
        data=accounts,
        total=total,
        page=page,
        page_size=page_size,
        total_pages=total_pages
    )

@api_router.get("/accounts/stats/summary")
async def get_accounts_stats(
    territory: Optional[str] = None,
    state: Optional[str] = None,
    city: Optional[str] = None,
    current_user: dict = Depends(get_current_user)
):
    """Get account statistics for dashboard metrics"""
    query = {}
    if territory:
        query['territory'] = territory
    if state:
        query['state'] = state
    if city:
        query['city'] = city
    
    # Total accounts
    total_accounts = await get_tdb().accounts.count_documents(query)
    
    # Accounts by lead_type (B2B / Retail / Individual)
    lead_type_pipeline = [
        {'$match': query},
        {'$group': {'_id': '$lead_type', 'count': {'$sum': 1}}}
    ]
    lt_results = await get_tdb().accounts.aggregate(lead_type_pipeline).to_list(10)
    by_lead_type = {'B2B': 0, 'Retail': 0, 'Individual': 0}
    for r in lt_results:
        key = r['_id'] or 'B2B'  # default unset → B2B (matches frontend display)
        by_lead_type[key] = by_lead_type.get(key, 0) + r['count']
    
    # Accounts by category (directly from accounts collection)
    category_pipeline = [
        {'$match': {**query, 'category': {'$ne': None}}},
        {'$group': {'_id': '$category', 'count': {'$sum': 1}}}
    ]
    category_results = await get_tdb().accounts.aggregate(category_pipeline).to_list(20)
    by_category = {r['_id']: r['count'] for r in category_results if r['_id']}
    
    # If no categories found in accounts, try to get from linked leads (for backward compatibility)
    if not by_category:
        all_accounts = await get_tdb().accounts.find(query, {'_id': 0, 'lead_id': 1}).to_list(10000)
        lead_ids = [a['lead_id'] for a in all_accounts if a.get('lead_id')]
        
        if lead_ids:
            lead_category_pipeline = [
                {'$match': {'id': {'$in': lead_ids}, 'category': {'$ne': None}}},
                {'$group': {'_id': '$category', 'count': {'$sum': 1}}}
            ]
            lead_category_results = await get_tdb().leads.aggregate(lead_category_pipeline).to_list(20)
            by_category = {r['_id']: r['count'] for r in lead_category_results if r['_id']}
    
    # Accounts by SKU category (via the account's configured sku_pricing list).
    # An account is counted once in EACH SKU category it is associated with.
    accounts_sku = await get_tdb().accounts.find(
        query, {'_id': 0, 'id': 1, 'sku_pricing': 1}
    ).to_list(10000)
    referenced_sku_ids = set()
    for a in accounts_sku:
        for sp in (a.get('sku_pricing') or []):
            if isinstance(sp, dict) and sp.get('sku_id'):
                referenced_sku_ids.add(sp['sku_id'])
    sku_category_by_id = {}
    if referenced_sku_ids:
        sku_docs = await get_tdb().master_skus.find(
            {'id': {'$in': list(referenced_sku_ids)}}, {'_id': 0, 'id': 1, 'category': 1}
        ).to_list(10000)
        sku_category_by_id = {s['id']: (s.get('category') or 'Uncategorised') for s in sku_docs}
    by_sku_category = {}
    for a in accounts_sku:
        cats = set()
        for sp in (a.get('sku_pricing') or []):
            if isinstance(sp, dict) and sp.get('sku_id') in sku_category_by_id:
                cats.add(sku_category_by_id[sp['sku_id']])
        for c in cats:
            by_sku_category[c] = by_sku_category.get(c, 0) + 1
    by_sku_category = dict(sorted(by_sku_category.items(), key=lambda x: -x[1]))

    return {
        'total_accounts': total_accounts,
        'by_lead_type': by_lead_type,
        'by_category': by_category,
        'by_sku_category': by_sku_category,
    }


@api_router.get("/accounts/sku-pricing-grid")
async def get_accounts_sku_pricing_grid(
    territory: Optional[str] = None,
    state: Optional[str] = None,
    city: Optional[str] = None,
    assigned_to: Optional[str] = None,
    current_user: dict = Depends(get_current_user)
):
    """
    Return a flat grid of (account, SKU, pricing) rows — one row per
    SKU per account. Used by the Account SKU Pricing page.
    Supports filters: territory, state, city, assigned_to.
    """
    from core.tenant import get_current_tenant_id
    tdb = get_tdb()
    tenant_id = get_current_tenant_id()

    # Visibility: sales_rep only sees accounts assigned to them
    account_filter = {}
    if current_user.get('role') == 'sales_rep':
        account_filter['assigned_to'] = current_user['id']

    # Apply filters
    if territory and territory != 'all':
        account_filter['territory'] = territory
    if state and state != 'all':
        account_filter['state'] = state
    if city and city != 'all':
        account_filter['city'] = city
    if assigned_to and assigned_to != 'all':
        assigned_list = [a.strip() for a in assigned_to.split(',') if a.strip()]
        if len(assigned_list) == 1:
            account_filter['assigned_to'] = assigned_list[0]
        elif len(assigned_list) > 1:
            account_filter['assigned_to'] = {'$in': assigned_list}

    accounts = await tdb.accounts.find(account_filter, {'_id': 0}).sort('account_name', 1).to_list(5000)

    # Build SKU lookup for enrichment
    sku_docs = await tdb.master_skus.find(
        {}, {'_id': 0, 'id': 1, 'name': 1, 'sku_code': 1, 'hsn_code': 1, 'base_price': 1, 'category': 1}
    ).to_list(2000)
    sku_by_id = {s['id']: s for s in sku_docs}
    sku_by_name = {s.get('name', '').lower(): s for s in sku_docs if s.get('name')}

    # Fetch per-account SKU pricing in one shot
    per_account_pricing = await tdb.account_sku_pricing.find(
        {'tenant_id': tenant_id}, {'_id': 0}
    ).to_list(20000)
    pricing_by_account = {}
    for p in per_account_pricing:
        pricing_by_account.setdefault(p.get('account_id'), []).append(p)

    rows = []
    for account in accounts:
        account_id = account.get('id')
        account_rows = pricing_by_account.get(account_id) or []

        # Fallback to account's embedded sku_pricing field
        if not account_rows:
            for p in (account.get('sku_pricing') or []):
                account_rows.append({
                    'sku_name': p.get('sku') or p.get('sku_name'),
                    'price_per_unit': p.get('price_per_unit', 0),
                    'return_bottle_credit': p.get('return_bottle_credit', 0),
                })

        if not account_rows:
            rows.append({
                'account_id': account_id,
                'account_code': account.get('account_id'),
                'account_name': account.get('account_name'),
                'account_type': account.get('account_type'),
                'lead_type': account.get('lead_type') or 'B2B',
                'include_in_gop_metrics': account.get('include_in_gop_metrics', (account.get('lead_type', 'B2B') or 'B2B').lower() != 'retail'),
                'city': account.get('city'),
                'state': account.get('state'),
                'territory': account.get('territory'),
                'sku_id': None,
                'sku_name': None,
                'sku_code': None,
                'hsn_code': None,
                'sku_category': None,
                'base_price': None,
                'price_per_unit': None,
                'return_bottle_credit': None,
            })
            continue

        for p in account_rows:
            sku_id = p.get('sku_id')
            sku = sku_by_id.get(sku_id) if sku_id else None
            if not sku and p.get('sku_name'):
                sku = sku_by_name.get(str(p.get('sku_name')).lower())

            rows.append({
                'account_id': account_id,
                'account_code': account.get('account_id'),
                'account_name': account.get('account_name'),
                'account_type': account.get('account_type'),
                'lead_type': account.get('lead_type') or 'B2B',
                'include_in_gop_metrics': account.get('include_in_gop_metrics', (account.get('lead_type', 'B2B') or 'B2B').lower() != 'retail'),
                'city': account.get('city'),
                'state': account.get('state'),
                'territory': account.get('territory'),
                'sku_id': sku_id or (sku.get('id') if sku else None),
                'sku_name': (sku.get('name') if sku else None) or p.get('sku_name') or p.get('sku'),
                'sku_code': (sku.get('sku_code') if sku else None) or p.get('sku_code'),
                'hsn_code': (sku.get('hsn_code') if sku else None) or p.get('hsn_code'),
                'sku_category': sku.get('category') if sku else p.get('category'),
                'base_price': sku.get('base_price') if sku else None,
                'price_per_unit': p.get('price_per_unit') or p.get('price') or 0,
                'return_bottle_credit': p.get('return_bottle_credit') or p.get('return_credit_per_unit') or 0,
            })

    return {'rows': rows, 'total': len(rows), 'accounts_count': len(accounts), 'cogs_by_sku': await _build_cogs_by_sku(tdb, accounts)}


async def _build_cogs_by_sku(tdb, accounts):
    """
    Return a map of { sku_name: { avg_cogs, cities: [...], cities_count } }
    averaged across the cities that the in-scope accounts belong to.
    COGS data is stored per (sku_name, city) and uses the COGS calculator's
    `total_cogs` field (primary + secondary + manufacturing).
    """
    cities_in_scope = sorted({a.get('city') for a in accounts if a.get('city')})
    if not cities_in_scope:
        return {}

    cogs_docs = await tdb.cogs_data.find(
        {'city': {'$in': cities_in_scope}},
        {'_id': 0, 'sku_name': 1, 'city': 1, 'total_cogs': 1,
         'primary_packaging_cost': 1, 'secondary_packaging_cost': 1,
         'manufacturing_variable_cost': 1}
    ).to_list(5000)

    # Aggregate by sku_name
    by_sku = {}
    for c in cogs_docs:
        name = c.get('sku_name')
        if not name:
            continue
        total_cogs = c.get('total_cogs')
        if total_cogs is None or total_cogs == 0:
            # Fallback: compute from parts
            total_cogs = (c.get('primary_packaging_cost') or 0) \
                + (c.get('secondary_packaging_cost') or 0) \
                + (c.get('manufacturing_variable_cost') or 0)
        if total_cogs <= 0:
            continue

        if name not in by_sku:
            by_sku[name] = {'sum': 0.0, 'cities': []}
        by_sku[name]['sum'] += total_cogs
        by_sku[name]['cities'].append(c.get('city'))

    return {
        name: {
            'avg_cogs': round(v['sum'] / len(v['cities']), 2),
            'cities': v['cities'],
            'cities_count': len(v['cities']),
        }
        for name, v in by_sku.items()
    }


@api_router.get("/accounts/{account_id}")
async def get_account(account_id: str, current_user: dict = Depends(get_current_user)):
    """Get single account by ID or account_id"""
    account = await get_tdb().accounts.find_one(
        {'$or': [{'id': account_id}, {'account_id': account_id}]},
        {'_id': 0}
    )
    if not account:
        raise HTTPException(status_code=404, detail='Account not found')
    
    if isinstance(account.get('created_at'), str):
        account['created_at'] = datetime.fromisoformat(account['created_at'])
    if isinstance(account.get('updated_at'), str):
        account['updated_at'] = datetime.fromisoformat(account['updated_at'])
    
    return account

@api_router.post("/accounts/migrate-categories")
async def migrate_account_categories(current_user: dict = Depends(get_current_user)):
    """Migrate categories from leads to existing accounts (one-time migration)"""
    # Get all accounts without category
    accounts = await get_tdb().accounts.find({'category': {'$exists': False}}, {'_id': 0, 'lead_id': 1, 'account_id': 1}).to_list(10000)
    
    if not accounts:
        # Also check for null categories
        accounts = await get_tdb().accounts.find({'category': None}, {'_id': 0, 'lead_id': 1, 'account_id': 1}).to_list(10000)
    
    updated_count = 0
    for account in accounts:
        lead_id = account.get('lead_id')
        if lead_id:
            # Find the lead and get its category
            lead = await get_tdb().leads.find_one(
                {'$or': [{'id': lead_id}, {'lead_id': lead_id}]},
                {'_id': 0, 'category': 1, 'contact_person': 1, 'name': 1, 'phone': 1}
            )
            if lead and lead.get('category'):
                update_data = {'category': lead['category']}
                # Also update contact info if missing
                if not account.get('contact_name') and (lead.get('contact_person') or lead.get('name')):
                    update_data['contact_name'] = lead.get('contact_person') or lead.get('name')
                if not account.get('contact_number') and lead.get('phone'):
                    update_data['contact_number'] = lead['phone']
                
                await get_tdb().accounts.update_one(
                    {'account_id': account['account_id']},
                    {'$set': update_data}
                )
                updated_count += 1
    
    return {'message': f'Updated {updated_count} accounts with categories from leads', 'updated': updated_count}

# NOTE: PUT /accounts/{account_id} is handled by routes/accounts.py (which has the
# full AccountUpdate model including gst_legal_name, gst_trade_name, pan_number,
# billing_address, delivery_contact_*). The duplicate route that used to live
# here shadowed the new one and silently dropped those fields — causing manual
# edits to revert to GST-cert parsed text. Do not re-add it.

# Admin endpoint to fix invoices missing tenant_id
@api_router.post("/admin/fix-invoice-tenant-ids")
async def fix_invoice_tenant_ids(current_user: dict = Depends(get_current_user)):
    """
    Fix invoices that are missing tenant_id field.
    This is needed for invoices created by MQ subscriber before the tenant fix.
    Admin only endpoint.
    """
    # Check if user has admin privileges
    user_role = current_user.get('role', '').lower()
    if user_role not in ['ceo', 'director', 'admin', 'vice president']:
        raise HTTPException(status_code=403, detail='Admin access required')
    
    # Use raw db to find invoices without tenant_id
    invoices_without_tenant = await db.invoices.count_documents({'tenant_id': {'$exists': False}})
    
    if invoices_without_tenant == 0:
        return {
            'success': True,
            'message': 'All invoices already have tenant_id',
            'updated_count': 0
        }
    
    # Update all invoices without tenant_id
    result = await db.invoices.update_many(
        {'tenant_id': {'$exists': False}},
        {'$set': {'tenant_id': 'nyla-air-water'}}
    )
    
    logger.info(f"[ADMIN] Fixed {result.modified_count} invoices with missing tenant_id")
    
    return {
        'success': True,
        'message': f'Updated {result.modified_count} invoices with tenant_id',
        'updated_count': result.modified_count
    }

@api_router.get("/accounts/{account_id}/invoices")
async def get_account_invoices(
    account_id: str, 
    current_user: dict = Depends(get_current_user),
    page: int = Query(1, ge=1),
    limit: int = Query(5, ge=1, le=100),
    time_filter: str = Query("this_month", description="Time filter: this_week, last_week, this_month, last_month, last_3_months, last_6_months, this_quarter, lifetime")
):
    """Get invoices for an account with pagination and time filter"""
    logger.info(f"[INVOICE_FETCH] Fetching invoices for account_id: {account_id}, page={page}, limit={limit}, time_filter={time_filter}")
    
    account = await get_tdb().accounts.find_one(
        {'$or': [{'id': account_id}, {'account_id': account_id}]},
        {'_id': 0, 'id': 1, 'lead_id': 1, 'account_name': 1, 'account_id': 1, 'outstanding_balance': 1, 'zoho_contact_id': 1, 'gst_number': 1, 'gstin': 1}
    )
    if not account:
        logger.warning(f"[INVOICE_FETCH] Account not found: {account_id}")
        raise HTTPException(status_code=404, detail='Account not found')
    
    logger.info(f"[INVOICE_FETCH] Account found: uuid={account.get('id')}, account_id={account.get('account_id')}")
    
    # Find invoices by account_id (primary), account_uuid, account_id_from_mq, ca_lead_id, or lead_id
    account_uuid = account.get('id')
    acc_id = account.get('account_id')
    lead_id = account.get('lead_id')
    account_name = account.get('account_name')
    zoho_contact_id = account.get('zoho_contact_id')
    gstin = account.get('gst_number') or account.get('gstin')
    
    # Resolve the lead's formatted lead_id (e.g., ASEM-HYD-L26-001). External invoices
    # may store this string in `ca_lead_id`, not the lead UUID — so we must look it up.
    lead_doc = None
    if lead_id:
        lead_doc = await get_tdb().leads.find_one({'id': lead_id}, {'_id': 0, 'lead_id': 1, 'id': 1})
    lead_formatted_id = (lead_doc or {}).get('lead_id')

    import re as _re

    def _ci_eq(value: str) -> dict:
        """Case-insensitive exact-match regex (handles uppercase/lowercase storage)."""
        return {'$regex': f'^{_re.escape(value)}$', '$options': 'i'}

    query = {'$or': []}
    if account_uuid:
        query['$or'].append({'account_id': account_uuid})  # Primary match - account_id field in invoice
        query['$or'].append({'account_uuid': account_uuid})  # Legacy match
    if acc_id:
        # Case-insensitive match — handles upper/lower-case stored variants
        query['$or'].append({'account_id': _ci_eq(acc_id)})
        query['$or'].append({'account_id_from_mq': _ci_eq(acc_id)})
        query['$or'].append({'ACCOUNT_ID': _ci_eq(acc_id)})  # Raw payload field used by some integrations
    if lead_id:
        # Lead UUID linkage
        query['$or'].append({'lead_id': lead_id})
        query['$or'].append({'lead_uuid': lead_id})
    if lead_formatted_id:
        # Formatted lead id (ca_lead_id) — distinct from lead UUID
        query['$or'].append({'ca_lead_id': _ci_eq(lead_formatted_id)})
        query['$or'].append({'lead_id': _ci_eq(lead_formatted_id)})  # In case it stored the formatted id under lead_id
    if zoho_contact_id:
        # Invoices pushed via Zoho carry the Zoho customer id — this is a strong
        # linkage when the legacy account_id/account_uuid/account_name fields don't agree
        # (e.g., recently-activated accounts where the external system pushed
        # invoices using only the Zoho contact id).
        query['$or'].append({'zoho_customer_id': zoho_contact_id})
        query['$or'].append({'zoho_contact_id': zoho_contact_id})
    if gstin:
        # GSTIN linkage — invoices pushed via Zoho carry the customer's GSTIN.
        # Useful when the account was re-created and account_id changed but GSTIN stayed.
        query['$or'].append({'gst_number': _ci_eq(gstin)})
        query['$or'].append({'gstin': _ci_eq(gstin)})
        query['$or'].append({'customer_gstin': _ci_eq(gstin)})
    if account_name:
        # Escape regex special chars in account_name (parens, dots, plus, etc.)
        # so account names like "Asem (Hyderabad)" don't silently break the match.
        query['$or'].append({'customer_name': {'$regex': _re.escape(account_name), '$options': 'i'}})
        query['$or'].append({'account_name': {'$regex': _re.escape(account_name), '$options': 'i'}})

    # Apply time filter
    if time_filter and time_filter != 'lifetime':
        from datetime import timedelta
        # Compute "now" in the TENANT's timezone (default Asia/Kolkata) so the
        # window aligns with the LOCAL calendar the user sees. invoice_date is
        # stored as a local (IST) 'YYYY-MM-DD' string; a UTC "now" can still
        # report the PREVIOUS month until 05:30 IST, which made current-month
        # invoices disappear from the account page near month boundaries.
        now = datetime.now(timezone.utc)
        try:
            from zoneinfo import ZoneInfo
            _tenant = await db.tenants.find_one(
                {'tenant_id': get_current_tenant_id()}, {'_id': 0, 'settings': 1}
            )
            _tz = ((_tenant or {}).get('settings') or {}).get('timezone') or 'Asia/Kolkata'
            now = now.astimezone(ZoneInfo(_tz))
        except Exception:
            pass
        
        date_ranges = {
            'this_week': (now - timedelta(days=now.weekday()), now),
            'last_week': (now - timedelta(days=now.weekday() + 7), now - timedelta(days=now.weekday())),
            'this_month': (now.replace(day=1), now),
            'last_month': ((now.replace(day=1) - timedelta(days=1)).replace(day=1), now.replace(day=1) - timedelta(days=1)),
            'last_3_months': (now - timedelta(days=90), now),
            'last_6_months': (now - timedelta(days=180), now),
            'this_quarter': (now.replace(month=((now.month - 1) // 3) * 3 + 1, day=1), now),
        }
        
        if time_filter in date_ranges:
            start, end = date_ranges[time_filter]
            if start and end:
                # invoice_date may be stored as a 'YYYY-MM-DD' string OR a BSON
                # datetime depending on the ingestion path. Use an $or on both
                # representations so neither variant is silently dropped.
                start_str = start.strftime('%Y-%m-%d')
                end_str = end.replace(hour=23, minute=59, second=59).strftime('%Y-%m-%d')
                start_dt = start.replace(hour=0, minute=0, second=0, microsecond=0)
                end_dt = end.replace(hour=23, minute=59, second=59, microsecond=999000)
                date_clause = {'$or': [
                    {'invoice_date': {'$gte': start_str, '$lte': end_str + 'T23:59:59'}},
                    {'invoice_date': {'$gte': start_dt, '$lte': end_dt}},
                ]}
                # Merge with the account-linkage $or via $and so both must hold.
                query = {'$and': [query, date_clause]}
    
    logger.info(f"[INVOICE_FETCH] Query: {query}")
    
    # Detect "empty linkage" — the original $or list of account-linkage clauses
    # (may now be wrapped in $and with the date clause).
    _linkage_or = query.get('$or')
    if _linkage_or is None and '$and' in query:
        _linkage_or = (query['$and'][0] or {}).get('$or') or []
    if not _linkage_or:
        logger.warning(f"[INVOICE_FETCH] Empty query for account: {account_id}")
        return {'invoices': [], 'total_amount': 0, 'paid_amount': 0, 'outstanding': 0, 'total': 0, 'page': page, 'limit': limit, 'pages': 0}
    
    # Get total count for pagination
    total_count = await get_tdb().invoices.count_documents(query)
    total_pages = (total_count + limit - 1) // limit if total_count > 0 else 0
    skip = (page - 1) * limit

    # If matcher returned zero invoices in the requested window, log the per-clause
    # counts so we can see *which* linkage path is failing (this surfaces stale
    # external invoices that lack proper account_id / account_uuid / ca_lead_id).
    if total_count == 0 and time_filter == 'this_month':
        try:
            from datetime import timedelta as _td_dbg
            from zoneinfo import ZoneInfo as _ZI_dbg
            _now_dbg = datetime.now(timezone.utc)
            try:
                _t_dbg = await db.tenants.find_one({'tenant_id': get_current_tenant_id()}, {'_id': 0, 'settings': 1})
                _tz_dbg = ((_t_dbg or {}).get('settings') or {}).get('timezone') or 'Asia/Kolkata'
                _now_dbg = _now_dbg.astimezone(_ZI_dbg(_tz_dbg))
            except Exception:
                pass
            _date_clause_dbg = {'$or': [
                {'invoice_date': {'$gte': _now_dbg.replace(day=1).strftime('%Y-%m-%d'), '$lte': _now_dbg.strftime('%Y-%m-%d') + 'T23:59:59'}},
                {'invoice_date': {'$gte': _now_dbg.replace(day=1, hour=0, minute=0, second=0, microsecond=0), '$lte': _now_dbg}},
            ]}
            for clause in _linkage_or:
                cnt = await get_tdb().invoices.count_documents({'$and': [clause, _date_clause_dbg]})
                if cnt > 0:
                    logger.warning(f"[INVOICE_FETCH] DIAGNOSTIC clause {clause} returned {cnt} this-month invoices in isolation")
        except Exception as _e:
            logger.warning(f"[INVOICE_FETCH] diagnostic block failed: {_e}")
    
    # Fetch paginated invoices
    invoices = await get_tdb().invoices.find(query, {'_id': 0}).sort('invoice_date', -1).skip(skip).limit(limit).to_list(limit)
    logger.info(f"[INVOICE_FETCH] Found {len(invoices)} invoices for account: {account_id} (page {page}/{total_pages}, total {total_count})")
    
    # Get ALL invoices for totals + bottle metrics (without pagination).
    # We also need invoice_date to determine the latest invoice's outstanding.
    all_invoices = await get_tdb().invoices.find(
        query,
        {'_id': 0, 'gross_invoice_value': 1, 'net_invoice_value': 1, 'credit_note_value': 1,
         'outstanding': 1, 'grand_total': 1, 'total_amount': 1, 'paid_amount': 1,
         'items': 1, 'line_items': 1, 'invoice_date': 1}
    ).to_list(10000)
    
    # Calculate totals - support both old and new field names
    total_amount = sum(inv.get('grand_total', inv.get('gross_invoice_value', inv.get('total_amount', 0))) or 0 for inv in all_invoices)
    net_amount = sum(inv.get('net_invoice_value', inv.get('paid_amount', 0)) or 0 for inv in all_invoices)
    credit_amount = sum(inv.get('credit_note_value', 0) or 0 for inv in all_invoices)

    # Outstanding: ALWAYS read from account.outstanding_balance. That's the
    # running balance the external system overwrites on every incoming invoice
    # (including back-dated ones). Deriving it from invoice rows would be wrong
    # — every invoice carries the same running total, so picking "latest by
    # invoice_date" can return a stale value when back-dated invoices arrive.
    outstanding = float(account.get('outstanding_balance') or 0)

    # Bottles delivered across the time window
    bottles_delivered = 0
    for inv in all_invoices:
        for it in (inv.get('items') or inv.get('line_items') or []):
            try:
                bottles_delivered += float(it.get('quantity') or it.get('bottles') or 0)
            except (TypeError, ValueError):
                pass

    # Bottles returned via customer_returns for this account in the same window.
    # customer_returns store account_id either as the UUID or the human account_id;
    # query both to cover legacy records.
    return_query: dict = {}
    return_or = []
    if account_uuid:
        return_or.append({'account_id': account_uuid})
    if acc_id and acc_id != account_uuid:
        return_or.append({'account_id': acc_id})
    if return_or:
        return_query['$or'] = return_or
    if time_filter and time_filter != 'lifetime':
        from datetime import timedelta as _td
        _now = datetime.now(timezone.utc)
        _ranges = {
            'this_week': (_now - _td(days=_now.weekday()), _now),
            'last_week': (_now - _td(days=_now.weekday() + 7), _now - _td(days=_now.weekday())),
            'this_month': (_now.replace(day=1), _now),
            'last_month': ((_now.replace(day=1) - _td(days=1)).replace(day=1), _now.replace(day=1) - _td(days=1)),
            'last_3_months': (_now - _td(days=90), _now),
            'last_6_months': (_now - _td(days=180), _now),
            'this_quarter': (_now.replace(month=((_now.month - 1) // 3) * 3 + 1, day=1), _now),
        }
        if time_filter in _ranges:
            _start, _end = _ranges[time_filter]
            return_query['return_date'] = {'$gte': _start.strftime('%Y-%m-%d'), '$lte': _end.strftime('%Y-%m-%d')}
    cust_returns = await get_tdb().customer_returns.find(return_query, {'_id': 0, 'items': 1}).to_list(2000)
    bottles_returned = 0
    for r in cust_returns:
        for it in (r.get('items') or []):
            try:
                bottles_returned += float(it.get('quantity') or 0)
            except (TypeError, ValueError):
                pass

    return_pct = round((bottles_returned / bottles_delivered) * 100, 2) if bottles_delivered > 0 else 0.0
    
    # Resolve each line item's SKU display name to the CURRENT master SKU
    # (code-first + sku_aliases) so historic invoices show the current SKU.
    from services.sku_resolver import build_sku_resolver
    _sku_resolver = await build_sku_resolver(get_tdb())

    # Transform invoices to consistent format for frontend
    formatted_invoices = []
    for inv in invoices:
        formatted_invoices.append({
            'id': inv.get('id'),
            'invoice_number': inv.get('invoice_number', inv.get('invoice_no')),
            'invoice_date': inv.get('invoice_date'),
            'gross_amount': inv.get('grand_total', inv.get('gross_invoice_value', inv.get('total_amount', 0))),
            'net_amount': inv.get('net_invoice_value', inv.get('paid_amount', 0)),
            'credit_note': inv.get('credit_note_value', 0),
            'outstanding': inv.get('outstanding', 0),
            'status': inv.get('status', 'matched'),
            'items': _sku_resolver.enrich_items(inv.get('line_items', inv.get('items', []))),
            'received_at': inv.get('received_at'),
            'total_bottles': inv.get('total_bottles', 0),
            'total_cogs': inv.get('total_cogs', 0),
            'total_logistics': inv.get('total_logistics', 0),
            'gross_margin': inv.get('gross_margin', 0),
            'gross_margin_percent': inv.get('gross_margin_percent', 0)
        })
    
    return {
        'invoices': formatted_invoices,
        'total_amount': total_amount,
        'net_amount': net_amount,
        'credit_amount': credit_amount,
        'paid_amount': net_amount,  # For backwards compatibility
        'outstanding': outstanding,
        'total': total_count,
        'page': page,
        'limit': limit,
        'pages': total_pages,
        'time_filter': time_filter,
        'summary': {
            'total_gross': round(total_amount, 2),
            'total_net': round(net_amount, 2),
            'total_credit': round(credit_amount, 2),
            'total_outstanding': round(outstanding, 2),
            'invoice_count': total_count,
            'bottles_delivered': int(bottles_delivered),
            'bottles_returned': int(bottles_returned),
            'return_pct': return_pct,
        },
    }

class InvoiceLineItemCreate(BaseModel):
    """Line item for creating an invoice"""
    sku_name: str
    bottles: int
    price_per_bottle: float

class AccountInvoiceCreate(BaseModel):
    """Create invoice for an account"""
    invoice_date: str
    line_items: List[InvoiceLineItemCreate]
    notes: Optional[str] = None

@api_router.post("/accounts/{account_id}/invoices")
async def create_account_invoice(
    account_id: str, 
    invoice_data: dict, 
    current_user: dict = Depends(get_user_or_api_key)
):
    """
    Create a new invoice for an account.

    Supports two payload shapes:
    1. Internal CRM (legacy): `{invoice_date, line_items[{sku_name, bottles, price_per_bottle}], notes}` — auto-fetches COGS/logistics for the account's city, computes margins.
    2. External system: `{invoiceNo, invoiceDate, grossInvoiceValue, items[{itemId, quantity, rate, ...}], ...}` — `itemId` maps to `master_skus.external_sku_id`; `account_id` may be the human ACCOUNT_ID code.
    """
    # Dispatch to external-invoice handler when payload matches external shape
    from services.external_invoices_service import is_external_payload, create_external_invoice as _create_ext_invoice
    if is_external_payload(invoice_data):
        return await _create_ext_invoice(account_id, invoice_data, current_user.get('id'))

    # Validate internal CRM payload shape
    try:
        parsed = AccountInvoiceCreate(**invoice_data)
    except Exception as e:
        raise HTTPException(status_code=422, detail=str(e))

    # Get account details
    account = await get_tdb().accounts.find_one(
        {'$or': [{'id': account_id}, {'account_id': account_id}]},
        {'_id': 0}
    )
    if not account:
        raise HTTPException(status_code=404, detail='Account not found')
    
    account_uuid = account.get('id')
    account_city = account.get('city', 'Hyderabad')
    account_name = account.get('account_name') or account.get('company_name')
    
    # Get COGS data for the account's city
    cogs_data = await get_tdb().cogs_data.find({'city': account_city}, {'_id': 0}).to_list(100)
    cogs_lookup = {c['sku_name']: c for c in cogs_data}
    
    # Process line items and calculate costs
    processed_items = []
    total_revenue = 0
    total_cogs = 0
    total_logistics = 0
    total_bottles = 0
    
    for item in parsed.line_items:
        sku_name = item.sku_name
        bottles = item.bottles
        price_per_bottle = item.price_per_bottle
        line_total = round(bottles * price_per_bottle, 2)
        
        # Look up COGS and logistics for this SKU in the account's city
        cogs_info = cogs_lookup.get(sku_name, {})
        cogs_per_bottle = cogs_info.get('total_cogs', 0) or 0
        logistics_per_bottle = cogs_info.get('outbound_logistics_cost', 0) or 0
        
        # If COGS not found for this city, try to get from any city as fallback
        if cogs_per_bottle == 0:
            fallback_cogs = await get_tdb().cogs_data.find_one({'sku_name': sku_name}, {'_id': 0})
            if fallback_cogs:
                cogs_per_bottle = fallback_cogs.get('total_cogs', 0) or 0
                logistics_per_bottle = fallback_cogs.get('outbound_logistics_cost', 0) or 0
        
        # Calculate totals for this line item
        line_cogs = round(bottles * cogs_per_bottle, 2)
        line_logistics = round(bottles * logistics_per_bottle, 2)
        line_margin = round(line_total - line_cogs - line_logistics, 2)
        line_margin_percent = round((line_margin / line_total) * 100, 2) if line_total > 0 else 0
        
        processed_items.append({
            'id': str(uuid.uuid4()),
            'sku_name': sku_name,
            'sku_code': sku_name.replace(' ', '_').replace('–', '').upper()[:15],
            'bottles': bottles,
            'price_per_bottle': price_per_bottle,
            'line_total': line_total,
            'cogs_per_bottle': cogs_per_bottle,
            'cogs_total': line_cogs,
            'logistics_per_bottle': logistics_per_bottle,
            'logistics_total': line_logistics,
            'margin': line_margin,
            'margin_percent': line_margin_percent
        })
        
        total_revenue += line_total
        total_cogs += line_cogs
        total_logistics += line_logistics
        total_bottles += bottles
    
    # Calculate invoice-level totals
    gross_margin = round(total_revenue - total_cogs - total_logistics, 2)
    gross_margin_percent = round((gross_margin / total_revenue) * 100, 2) if total_revenue > 0 else 0
    
    # Generate invoice number
    today = datetime.now().strftime('%Y%m%d')
    count = await get_tdb().invoices.count_documents({'invoice_number': {'$regex': f'^INV-{today}'}})
    invoice_number = f"INV-{today}-{str(count + 1).zfill(4)}"
    
    # Create invoice document
    invoice = {
        'id': str(uuid.uuid4()),
        'invoice_number': invoice_number,
        'account_id': account_uuid,
        'account_name': account_name,
        'account_city': account_city,
        'invoice_date': parsed.invoice_date,
        'due_date': (datetime.strptime(parsed.invoice_date, '%Y-%m-%d') + timedelta(days=30)).strftime('%Y-%m-%d'),
        'line_items': processed_items,
        'total_bottles': total_bottles,
        'grand_total': round(total_revenue, 2),
        'total_cogs': round(total_cogs, 2),
        'total_logistics': round(total_logistics, 2),
        'gross_margin': gross_margin,
        'gross_margin_percent': gross_margin_percent,
        'notes': parsed.notes,
        'status': 'pending',
        'created_by': current_user['id'],
        'created_by_name': current_user.get('name'),
        'created_at': datetime.now(timezone.utc).isoformat()
    }
    
    await get_tdb().invoices.insert_one(invoice)
    
    # Return response with margin summary
    return {
        'message': 'Invoice created successfully',
        'invoice': {
            'id': invoice['id'],
            'invoice_number': invoice_number,
            'account_name': account_name,
            'invoice_date': parsed.invoice_date,
            'total_bottles': total_bottles,
            'line_items_count': len(processed_items)
        },
        'margin_summary': {
            'invoice_revenue': round(total_revenue, 2),
            'total_cogs': round(total_cogs, 2),
            'total_logistics': round(total_logistics, 2),
            'gross_margin': gross_margin,
            'gross_margin_percent': gross_margin_percent
        }
    }

@api_router.put("/accounts/{account_id}/invoices/{invoice_no}")
async def update_account_invoice(
    account_id: str,
    invoice_no: str,
    invoice_data: dict,
    current_user: dict = Depends(get_user_or_api_key),
):
    """Update an existing invoice from an external system.

    Expects external-system payload (`invoiceNo`, `invoiceDate`, `grossInvoiceValue`, `items[]`).
    `account_id` may be the human ACCOUNT_ID code (e.g. ORLO-HYD-A26-001) or the UUID.
    `invoice_no` is the stored invoice id (== external invoiceNo).
    """
    from services.external_invoices_service import is_external_payload, update_external_invoice as _update_ext_invoice
    if not is_external_payload(invoice_data):
        raise HTTPException(
            status_code=400,
            detail="PUT /accounts/{account_id}/invoices/{invoice_no} expects external-system payload (invoiceNo, invoiceDate, items[]).",
        )
    return await _update_ext_invoice(account_id, invoice_no, invoice_data, current_user.get('id'))


@api_router.delete("/accounts/{account_id}")
async def delete_account(account_id: str, current_user: dict = Depends(get_current_user)):
    """Delete an account"""
    if current_user['role'] not in ['admin', 'National Sales Head', 'CEO', 'Director']:
        raise HTTPException(status_code=403, detail='Only admins can delete accounts')
    
    account = await get_tdb().accounts.find_one(
        {'$or': [{'id': account_id}, {'account_id': account_id}]},
        {'_id': 0, 'lead_id': 1}
    )
    if not account:
        raise HTTPException(status_code=404, detail='Account not found')
    
    # Revert the lead conversion flag
    if account.get('lead_id'):
        await get_tdb().leads.update_one(
            {'$or': [{'id': account['lead_id']}, {'lead_id': account['lead_id']}]},
            {'$set': {'converted_to_account': False, 'account_id': None}}
        )
    
    await get_tdb().accounts.delete_one({'$or': [{'id': account_id}, {'account_id': account_id}]})
    
    return {'message': 'Account deleted successfully'}

# ============= ACCOUNT LOGO ROUTES =============

class LogoUploadRequest(BaseModel):
    logo: str  # Base64 encoded image
    width_mm: int = 35
    height_mm: int = 35

@api_router.post("/accounts/{account_id}/logo")
async def upload_account_logo(account_id: str, request: LogoUploadRequest, current_user: dict = Depends(get_current_user)):
    """Upload and save account logo"""
    import base64
    import os
    
    account = await get_tdb().accounts.find_one(
        {'$or': [{'id': account_id}, {'account_id': account_id}]},
        {'_id': 0}
    )
    if not account:
        raise HTTPException(status_code=404, detail='Account not found')
    
    try:
        # Extract base64 data
        logo_data = request.logo
        if ',' in logo_data:
            logo_data = logo_data.split(',')[1]
        
        # Decode base64
        image_bytes = base64.b64decode(logo_data)
        
        # Create logos directory if not exists
        logos_dir = '/app/backend/static/logos'
        os.makedirs(logos_dir, exist_ok=True)
        
        # Save file with account ID
        file_name = f"{account.get('id', account_id)}.png"
        file_path = os.path.join(logos_dir, file_name)
        
        with open(file_path, 'wb') as f:
            f.write(image_bytes)
        
        # Update account with logo info
        logo_url = f"/api/static/logos/{file_name}"
        await get_tdb().accounts.update_one(
            {'$or': [{'id': account_id}, {'account_id': account_id}]},
            {'$set': {
                'logo_url': logo_url,
                'logo_width_mm': request.width_mm,
                'logo_height_mm': request.height_mm,
                'updated_at': datetime.now(timezone.utc).isoformat()
            }}
        )
        
        return {'logo_url': logo_url, 'message': 'Logo uploaded successfully'}
        
    except Exception as e:
        logger.error(f"Error uploading logo: {str(e)}")
        raise HTTPException(status_code=500, detail=f'Failed to upload logo: {str(e)}')

@api_router.delete("/accounts/{account_id}/logo")
async def delete_account_logo(account_id: str, current_user: dict = Depends(get_current_user)):
    """Delete account logo"""
    import os
    
    account = await get_tdb().accounts.find_one(
        {'$or': [{'id': account_id}, {'account_id': account_id}]},
        {'_id': 0}
    )
    if not account:
        raise HTTPException(status_code=404, detail='Account not found')
    
    # Remove file if exists
    logo_url = account.get('logo_url', '')
    if logo_url:
        file_name = logo_url.split('/')[-1]
        file_path = f'/app/backend/static/logos/{file_name}'
        if os.path.exists(file_path):
            os.remove(file_path)
    
    # Update account to remove logo
    await get_tdb().accounts.update_one(
        {'$or': [{'id': account_id}, {'account_id': account_id}]},
        {'$unset': {'logo_url': '', 'logo_width_mm': '', 'logo_height_mm': ''}}
    )
    
    return {'message': 'Logo deleted successfully'}

# NOTE: Lead logo routes are now in routes/leads.py to support FormData uploads
# The routes below are kept for backwards compatibility with base64 uploads from LogoUploader component
# TODO: Remove these once all logo uploads use FormData

# ============= ACTIVITIES ROUTES =============

@api_router.post("/activities", response_model=Activity)
async def create_activity(activity_input: ActivityCreate, current_user: dict = Depends(get_current_user)):
    activity_data = activity_input.model_dump()
    activity_data['created_by'] = current_user['id']
    activity_data['created_by_name'] = current_user.get('name') or current_user.get('email') or ''
    
    # Extract optional fields before creating activity object
    new_status = activity_data.pop('new_status', None)
    next_followup_date = activity_data.pop('next_followup_date', None)
    custom_created_at = activity_data.pop('created_at', None)
    copy_to_lead_ids = activity_data.pop('copy_to_lead_ids', None) or []
    
    # Build the final description - combine activity text with status info
    description_parts = [activity_data['description']]
    
    # Get the lead to include current status in activity
    lead = await get_tdb().leads.find_one({'id': activity_data['lead_id']}, {'_id': 0})
    current_status = lead.get('status') if lead else None
    
    # Always include status in activity for consolidated view
    if new_status and current_status and current_status != new_status:
        # Status is being changed - show transition
        old_status_label = current_status.replace('_', ' ').title()
        new_status_label = new_status.replace('_', ' ').title()
        description_parts.append(f"[Status: {old_status_label} → {new_status_label}]")
    elif current_status:
        # Status not changed - just show current status
        status_label = current_status.replace('_', ' ').title()
        description_parts.append(f"[Status: {status_label}]")
    
    # Combine description parts
    activity_data['description'] = ' '.join(description_parts)
    
    activity_obj = Activity(**activity_data)
    original_activity_id = activity_obj.id
    
    # Override created_at if admin provided a custom date
    if custom_created_at:
        activity_obj.created_at = datetime.fromisoformat(custom_created_at.replace('Z', '+00:00'))
    
    doc = activity_obj.model_dump()
    doc['created_at'] = doc['created_at'].isoformat()
    
    await get_tdb().activities.insert_one(doc)
    
    # Update lead with last contacted info and optionally status/follow-up
    lead_updates = {
        'updated_at': datetime.now(timezone.utc).isoformat(),
        'last_contacted_date': doc['created_at'],
        'last_contact_method': activity_data.get('activity_type', '')
    }
    
    if new_status and current_status != new_status:
        lead_updates['status'] = new_status
    if next_followup_date:
        lead_updates['next_followup_date'] = next_followup_date
    
    await get_tdb().leads.update_one({'id': activity_data['lead_id']}, {'$set': lead_updates})
    
    # Copy activity and status to linked leads if requested
    copied_count = 0
    if copy_to_lead_ids:
        source_lead_id = activity_data['lead_id']
        for target_lead_id in copy_to_lead_ids:
            # Get the target lead
            target_lead = await get_tdb().leads.find_one({'id': target_lead_id}, {'_id': 0})
            if target_lead:
                # Create copied activity with custom description for the target lead
                target_current_status = target_lead.get('status')
                target_description_parts = [activity_input.description]  # Use original description
                
                if new_status and target_current_status and target_current_status != new_status:
                    old_label = target_current_status.replace('_', ' ').title()
                    new_label = new_status.replace('_', ' ').title()
                    target_description_parts.append(f"[Status: {old_label} → {new_label}]")
                elif target_current_status:
                    status_label = target_current_status.replace('_', ' ').title()
                    target_description_parts.append(f"[Status: {status_label}]")
                
                copied_activity = {
                    'id': str(uuid.uuid4()),
                    'lead_id': target_lead_id,
                    'activity_type': activity_data['activity_type'],
                    'description': ' '.join(target_description_parts),
                    'interaction_method': activity_data.get('interaction_method'),
                    'created_by': current_user['id'],
                    'created_by_name': current_user.get('name') or current_user.get('email') or '',
                    'created_at': doc['created_at'],
                    'is_shared_copy': True,
                    'original_activity_id': original_activity_id,
                    'source_lead_id': source_lead_id
                }
                await get_tdb().activities.insert_one(copied_activity)
                
                # Update target lead status if new_status was provided
                target_lead_updates = {
                    'updated_at': datetime.now(timezone.utc).isoformat(),
                    'last_contacted_date': doc['created_at'],
                    'last_contact_method': activity_data.get('activity_type', '')
                }
                if new_status and target_current_status != new_status:
                    target_lead_updates['status'] = new_status
                
                await get_tdb().leads.update_one({'id': target_lead_id}, {'$set': target_lead_updates})
                copied_count += 1
    
    return activity_obj

@api_router.get("/activities/{lead_id}", response_model=List[Activity])
async def get_activities(
    lead_id: str,
    skip: int = 0,
    limit: int = 100,
    current_user: dict = Depends(get_current_user)
):
    activities = await get_tdb().activities.find({'lead_id': lead_id}, {'_id': 0}).sort('created_at', -1).skip(skip).limit(limit).to_list(limit)

    # Backfill missing created_by_name from users collection
    missing_ids = [a['created_by'] for a in activities if not a.get('created_by_name') and a.get('created_by')]
    if missing_ids:
        users_docs = await get_tdb().users.find(
            {'id': {'$in': list(set(missing_ids))}},
            {'_id': 0, 'id': 1, 'name': 1, 'email': 1}
        ).to_list(len(missing_ids))
        users_map = {u['id']: u.get('name') or u.get('email') or '' for u in users_docs}
        for a in activities:
            if not a.get('created_by_name'):
                a['created_by_name'] = users_map.get(a.get('created_by'), '')

    for activity in activities:
        if isinstance(activity['created_at'], str):
            activity['created_at'] = datetime.fromisoformat(activity['created_at'])

    return activities


@api_router.delete("/activities/{activity_id}")
async def delete_activity(
    activity_id: str,
    current_user: dict = Depends(get_current_user),
):
    """Delete a single logged activity. Restricted to CEO / System Admin.

    The activity is removed from the `activities` collection. We don't recompute
    derived lead-stage metrics here — those are computed on the fly from the
    remaining activities, so they'll self-correct on the next read.
    """
    user_role = (current_user.get('role') or '').strip()
    if user_role not in ('CEO', 'System Admin'):
        raise HTTPException(status_code=403, detail='Only CEO and System Admin can delete a logged activity.')

    tdb = get_tdb()
    activity = await tdb.activities.find_one({'id': activity_id}, {'_id': 0})
    if not activity:
        raise HTTPException(status_code=404, detail='Activity not found')

    await tdb.activities.delete_one({'id': activity_id})
    logger.info(
        f"Activity {activity_id} (type={activity.get('activity_type')}) on lead "
        f"{activity.get('lead_id')} deleted by {current_user.get('email')}"
    )
    return {
        'success': True,
        'activity_id': activity_id,
        'lead_id': activity.get('lead_id'),
    }


# ============= FOLLOW-UPS ROUTES =============

@api_router.post("/follow-ups", response_model=FollowUp)
async def create_follow_up(follow_up_input: FollowUpCreate, current_user: dict = Depends(get_current_user)):
    follow_up_data = follow_up_input.model_dump()
    follow_up_data['created_by'] = current_user['id']
    follow_up_obj = FollowUp(**follow_up_data)
    
    doc = follow_up_obj.model_dump()
    doc['created_at'] = doc['created_at'].isoformat()
    doc['scheduled_date'] = doc['scheduled_date'].isoformat()
    if doc.get('completed_at'):
        doc['completed_at'] = doc['completed_at'].isoformat()
    
    await get_tdb().follow_ups.insert_one(doc)
    
    # Create activity
    activity = Activity(
        lead_id=follow_up_obj.lead_id,
        activity_type='note',
        description=f'Follow-up scheduled: {follow_up_obj.title}',
        created_by=current_user['id']
    )
    activity_doc = activity.model_dump()
    activity_doc['created_at'] = activity_doc['created_at'].isoformat()
    await get_tdb().activities.insert_one(activity_doc)
    
    return follow_up_obj

@api_router.get("/follow-ups", response_model=List[FollowUp])
async def get_follow_ups(
    skip: int = 0,
    limit: int = 100,
    current_user: dict = Depends(get_current_user)
):
    # Get follow-ups assigned to current user or created by them
    if current_user['role'] in ['admin', 'sales_manager']:
        follow_ups = await get_tdb().follow_ups.find({}, {'_id': 0}).skip(skip).limit(limit).to_list(limit)
    else:
        follow_ups = await get_tdb().follow_ups.find({'assigned_to': current_user['id']}, {'_id': 0}).skip(skip).limit(limit).to_list(limit)
    
    for follow_up in follow_ups:
        if isinstance(follow_up['created_at'], str):
            follow_up['created_at'] = datetime.fromisoformat(follow_up['created_at'])
        if isinstance(follow_up['scheduled_date'], str):
            follow_up['scheduled_date'] = datetime.fromisoformat(follow_up['scheduled_date'])
        if follow_up.get('completed_at') and isinstance(follow_up['completed_at'], str):
            follow_up['completed_at'] = datetime.fromisoformat(follow_up['completed_at'])
    
    return follow_ups

@api_router.put("/follow-ups/{follow_up_id}/complete")
async def complete_follow_up(follow_up_id: str, current_user: dict = Depends(get_current_user)):
    result = await get_tdb().follow_ups.update_one(
        {'id': follow_up_id},
        {'$set': {'is_completed': True, 'completed_at': datetime.now(timezone.utc).isoformat()}}
    )
    
    if result.matched_count == 0:
        raise HTTPException(status_code=404, detail='Follow-up not found')
    
    return {'message': 'Follow-up completed'}

# ============= COMMENTS ROUTES =============

@api_router.post("/comments", response_model=Comment)
async def create_comment(comment_input: CommentCreate, current_user: dict = Depends(get_current_user)):
    comment_data = comment_input.model_dump()
    comment_data['created_by'] = current_user['id']
    comment_obj = Comment(**comment_data)
    
    doc = comment_obj.model_dump()
    doc['created_at'] = doc['created_at'].isoformat()
    
    await get_tdb().comments.insert_one(doc)
    
    # Create activity
    activity = Activity(
        lead_id=comment_obj.lead_id,
        activity_type='note',
        description=f'Comment added by {current_user["name"]}',
        created_by=current_user['id']
    )
    activity_doc = activity.model_dump()
    activity_doc['created_at'] = activity_doc['created_at'].isoformat()
    await get_tdb().activities.insert_one(activity_doc)

    # @-mention notifications — parse the comment body for inline
    # `@[Name](user-id)` chips inserted by the frontend MentionTextarea and
    # ping the referenced users (minus the author). Best-effort.
    try:
        from utils.entity_comments import notify_comment_mentions
        lead = await get_tdb().leads.find_one(
            {'id': comment_obj.lead_id}, {'_id': 0, 'company': 1, 'contact_person': 1}
        )
        lead_label = (lead or {}).get('company') or (lead or {}).get('contact_person') or 'lead'
        await notify_comment_mentions(
            tenant_id=get_current_tenant_id(),
            text=comment_obj.comment or '',
            current_user=current_user,
            link=f"/leads/{comment_obj.lead_id}",
            title=f"{current_user.get('name') or current_user.get('email') or 'Someone'} mentioned you",
            body=f"Comment on lead {lead_label}",
            entity_type='lead',
            entity_id=comment_obj.lead_id,
        )
    except Exception:
        logger.exception("Mention notification failed for lead comment")

    return comment_obj

@api_router.get("/comments/{lead_id}", response_model=List[Comment])
async def get_comments(
    lead_id: str,
    skip: int = 0,
    limit: int = 100,
    current_user: dict = Depends(get_current_user)
):
    comments = await get_tdb().comments.find({'lead_id': lead_id}, {'_id': 0}).sort('created_at', -1).skip(skip).limit(limit).to_list(limit)
    
    for comment in comments:
        if isinstance(comment['created_at'], str):
            comment['created_at'] = datetime.fromisoformat(comment['created_at'])
    
    return comments

# ============= USERS/TEAM ROUTES =============

@api_router.get("/users")
async def get_users(
    skip: int = 0,
    limit: int = 100,
    current_user: dict = Depends(get_current_user)
):
    users = await get_tdb().users.find({}, {'_id': 0, 'password': 0}).skip(skip).limit(limit).to_list(limit)
    
    for user in users:
        # Handle created_at conversion safely - ensure consistent ISO string output
        try:
            created_at = user.get('created_at')
            if created_at is None:
                user['created_at'] = datetime.now(timezone.utc).isoformat()
            elif isinstance(created_at, datetime):
                # Already a datetime object, convert to ISO string
                user['created_at'] = created_at.isoformat() if created_at.tzinfo else created_at.replace(tzinfo=timezone.utc).isoformat()
            elif isinstance(created_at, str):
                # Validate the string is a valid ISO format, keep as string
                datetime.fromisoformat(created_at.replace('Z', '+00:00'))
                user['created_at'] = created_at
        except (ValueError, AttributeError, TypeError) as e:
            # If parsing fails, set a default value
            logger.warning(f"Error handling created_at for user {user.get('id')}: {e}")
            user['created_at'] = datetime.now(timezone.utc).isoformat()
        
        # Ensure department has a default value for legacy data
        if not user.get('department'):
            user['department'] = 'Sales'
    
    return users

@api_router.get("/users/org-chart")
async def get_org_chart(current_user: dict = Depends(get_current_user)):
    """Get organizational hierarchy chart"""
    users = await get_tdb().users.find({}, {'_id': 0, 'password': 0}).to_list(1000)
    
    # Convert datetime strings safely
    for user in users:
        try:
            created_at = user.get('created_at')
            if created_at is None:
                user['created_at'] = datetime.now(timezone.utc).isoformat()
            elif isinstance(created_at, datetime):
                user['created_at'] = created_at.isoformat() if created_at.tzinfo else created_at.replace(tzinfo=timezone.utc).isoformat()
            elif isinstance(created_at, str):
                datetime.fromisoformat(created_at.replace('Z', '+00:00'))
                user['created_at'] = created_at
        except (ValueError, AttributeError, TypeError):
            user['created_at'] = datetime.now(timezone.utc).isoformat()
    
    # Build hierarchy
    users_by_id = {user['id']: user for user in users}
    
    # Find root (CEO - no reports_to)
    root = None
    for user in users:
        if not user.get('reports_to'):
            root = user
            break
    
    # Build tree structure
    def build_tree(user_id):
        user = users_by_id.get(user_id)
        if not user:
            return None
        
        # Find direct reports
        direct_reports = [u for u in users if u.get('reports_to') == user_id]
        
        # Find dotted line reports
        dotted_reports = [u for u in users if u.get('dotted_line_to') == user_id]
        
        node = {
            'id': user['id'],
            'name': user['name'],
            'role': user['role'],
            'designation': user.get('designation', user['role'].replace('_', ' ').title()),
            'email': user['email'],
            'phone': user.get('phone'),
            'city': user.get('city'),
            'state': user.get('state'),
            'territory': user.get('territory'),
            'direct_reports': [build_tree(r['id']) for r in direct_reports],
            'dotted_line_reports': [
                {
                    'id': r['id'],
                    'name': r['name'],
                    'role': r['role'],
                    'designation': r.get('designation', r['role'].replace('_', ' ').title())
                }
                for r in dotted_reports
            ]
        }
        return node
    
    if root:
        org_chart = build_tree(root['id'])
        return {'org_chart': org_chart, 'total_employees': len(users)}
    
    return {'org_chart': None, 'total_employees': len(users), 'users': users}

@api_router.get("/config/locations")
async def get_location_config():
    """Get regions, states, and cities mapping for India"""
    locations = {
        'country': 'India',
        'regions': [
            {
                'name': 'North India',
                'states': [
                    {
                        'name': 'Delhi',
                        'cities': ['New Delhi']
                    },
                    {
                        'name': 'Uttar Pradesh',
                        'cities': ['Noida']
                    }
                ]
            },
            {
                'name': 'South India',
                'states': [
                    {
                        'name': 'Karnataka',
                        'cities': ['Bengaluru']
                    },
                    {
                        'name': 'Tamil Nadu',
                        'cities': ['Chennai']
                    },
                    {
                        'name': 'Telangana',
                        'cities': ['Hyderabad']
                    }
                ]
            },
            {
                'name': 'West India',
                'states': [
                    {
                        'name': 'Maharashtra',
                        'cities': ['Mumbai', 'Pune']
                    },
                    {
                        'name': 'Gujarat',
                        'cities': ['Ahmedabad']
                    }
                ]
            },
            {
                'name': 'East India',
                'states': [
                    {
                        'name': 'West Bengal',
                        'cities': ['Kolkata']
                    }
                ]
            }
        ],
        'skus': [
            '660 ml / Silver / Nyla',
            '660 ml / Gold / Nyla',
            '330 ml / Silver / Nyla',
            '330 ml / Gold / Nyla',
            '660 ml / Sparkling',
            '300 ml / Sparkling',
            '24 Brand / 660 ml'
        ]
    }
    return locations


@api_router.post("/users/create", response_model=User)
async def create_team_member(user_input: UserCreate, request: Request, current_user: dict = Depends(get_current_user)):
    # Only admin/CEO/Director/VP can create users
    if current_user['role'] not in ['admin', 'ceo', 'CEO', 'Director', 'Vice President', 'National Sales Head']:
        raise HTTPException(status_code=403, detail='Only leadership can create team members')
    
    # Check if user exists
    existing = await get_tdb().users.find_one({'email': user_input.email}, {'_id': 0})
    if existing:
        raise HTTPException(status_code=400, detail='Email already registered')
    
    # Create user
    hashed_pw = hash_password(user_input.password)
    user_data = user_input.model_dump()
    user_data.pop('password')
    
    # Add tenant_id from request context
    tenant_id = getattr(request.state, 'tenant_id', None) or get_current_tenant_id()
    user_data['tenant_id'] = tenant_id
    
    # Sync role with designation if Partner - Sales
    if user_data.get('designation') == 'Partner - Sales':
        user_data['role'] = 'Partner - Sales'
    elif user_data.get('designation') and user_data.get('designation') in [
        'CEO', 'Director', 'Vice President', 'National Sales Head', 
        'Regional Sales Manager', 'Head of Business'
    ]:
        user_data['role'] = user_data['designation']
    
    user_obj = User(**user_data)
    
    doc = user_obj.model_dump()
    doc['password'] = hashed_pw
    doc['created_at'] = doc['created_at'].isoformat()
    doc['tenant_id'] = tenant_id  # Ensure tenant_id is in the document
    
    await get_tdb().users.insert_one(doc)
    return user_obj

@api_router.delete("/users/{user_id}")
async def delete_user(user_id: str, current_user: dict = Depends(get_current_user)):
    """Delete user and all associated data"""
    
    if current_user['role'] not in ['CEO', 'Director', 'Vice President']:
        raise HTTPException(status_code=403, detail='Only leadership can delete users')
    
    # Delete user
    result = await get_tdb().users.delete_one({'id': user_id})
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail='User not found')
    
    # Delete associated data
    await get_tdb().leads.delete_many({'assigned_to': user_id})
    await get_tdb().leads.delete_many({'created_by': user_id})
    await get_tdb().activities.delete_many({'created_by': user_id})
    await get_tdb().daily_status.delete_many({'user_id': user_id})
    await db.user_sessions.delete_many({'user_id': user_id})
    await get_tdb().leave_requests.delete_many({'user_id': user_id})
    await get_tdb().resource_targets.delete_many({'resource_id': user_id})
    
    return {'message': 'User and all associated data deleted successfully'}

@api_router.put("/users/{user_id}")
async def update_user(user_id: str, updates: dict, current_user: dict = Depends(get_current_user)):
    if current_user['role'] not in ['CEO', 'Director', 'Vice President', 'National Sales Head']:
        raise HTTPException(status_code=403, detail='Only leadership can update users')
    
    # Remove sensitive fields
    updates.pop('password', None)
    updates.pop('id', None)
    
    # Sync role with designation if Partner - Sales
    if updates.get('designation') == 'Partner - Sales':
        updates['role'] = 'Partner - Sales'
    elif updates.get('designation') and updates.get('designation') in [
        'CEO', 'Director', 'Vice President', 'National Sales Head', 
        'Regional Sales Manager', 'Head of Business'
    ]:
        updates['role'] = updates['designation']
    
    result = await get_tdb().users.update_one({'id': user_id}, {'$set': updates})
    
    if result.matched_count == 0:
        raise HTTPException(status_code=404, detail='User not found')
    
    return {'message': 'User updated successfully'}

@api_router.post("/lead-discovery/autocomplete")
async def autocomplete_places(params: dict, current_user: dict = Depends(get_current_user)):
    """Autocomplete place names using Places API (New) Text Search"""
    
    input_text = params.get('input', '')
    city = params.get('city', '')
    
    if not input_text or len(input_text) < 3:
        return {'predictions': []}
    
    try:
        api_key = os.environ['GOOGLE_MAPS_API_KEY']
        
        async with httpx.AsyncClient() as client:
            # Use Places API (New) - Text Search for autocomplete
            text_search_url = "https://places.googleapis.com/v1/places:searchText"
            
            headers = {
                'Content-Type': 'application/json',
                'X-Goog-Api-Key': api_key,
                'X-Goog-FieldMask': 'places.displayName,places.formattedAddress,places.id'
            }
            
            body = {
                "textQuery": f"{input_text}, {city}, India",
                "maxResultCount": 5
            }
            
            response = await client.post(text_search_url, json=body, headers=headers)
            data = response.json()
            
            if 'places' in data:
                # Transform to autocomplete format
                predictions = []
                for place in data['places']:
                    predictions.append({
                        'description': place.get('formattedAddress', place.get('displayName', {}).get('text', '')),
                        'place_id': place.get('id', ''),
                        'structured_formatting': {
                            'main_text': place.get('displayName', {}).get('text', ''),
                            'secondary_text': place.get('formattedAddress', '')
                        }
                    })
                return {'predictions': predictions}
            else:
                return {'predictions': []}
    
    except Exception as e:
        logger.error(f'Text search error: {str(e)}')
        return {'predictions': []}

@api_router.post("/lead-discovery/search")
async def search_places(search_params: dict, current_user: dict = Depends(get_current_user)):
    """Search places using Google Places API (New)"""
    
    pincode = search_params.get('pincode')
    location_name = search_params.get('location_name')
    outlet_name = search_params.get('outlet_name')
    city = search_params.get('city', '')
    radius = search_params.get('radius', 5) * 1000
    types = search_params.get('types', [])
    min_rating = search_params.get('min_rating', 4.0)
    price_range = search_params.get('price_range', 'all')
    
    if not pincode and not location_name and not outlet_name:
        raise HTTPException(status_code=400, detail='Pin code, location name, or outlet name is required')
    
    try:
        api_key = os.environ['GOOGLE_MAPS_API_KEY']
        
        # If searching by outlet name, use text search directly
        if outlet_name:
            async with httpx.AsyncClient() as client:
                text_search_url = "https://places.googleapis.com/v1/places:searchText"
                
                headers = {
                    'Content-Type': 'application/json',
                    'X-Goog-Api-Key': api_key,
                    'X-Goog-FieldMask': 'places.displayName,places.formattedAddress,places.internationalPhoneNumber,places.rating,places.userRatingCount,places.priceLevel,places.types,places.id,places.location,places.addressComponents'
                }
                
                body = {
                    "textQuery": f"{outlet_name}, {city}, India" if city else f"{outlet_name}, India",
                    "maxResultCount": 20
                }
                
                response = await client.post(text_search_url, json=body, headers=headers)
                data = response.json()
                
                all_places = []
                for place in data.get('places', []):
                    price_level_map = {
                        'PRICE_LEVEL_FREE': 1,
                        'PRICE_LEVEL_INEXPENSIVE': 2,
                        'PRICE_LEVEL_MODERATE': 3,
                        'PRICE_LEVEL_EXPENSIVE': 4,
                        'PRICE_LEVEL_VERY_EXPENSIVE': 5
                    }
                    price_level = price_level_map.get(place.get('priceLevel', 'PRICE_LEVEL_MODERATE'), 3)

                    # Structured address (postal code / city / state) — same
                    # extraction as the nearby-search path so the created lead
                    # carries proper geo + components.
                    addr_comps = place.get('addressComponents', []) or []
                    def _pick(types, _comps=addr_comps):
                        for c in _comps:
                            if any(t in (c.get('types') or []) for t in types):
                                return c.get('longText') or c.get('shortText') or ''
                        return ''
                    place_loc = place.get('location', {}) or {}

                    outlet_data = {
                        'place_id': place.get('id', ''),
                        'name': place.get('displayName', {}).get('text', 'Unknown'),
                        'address': place.get('formattedAddress', ''),
                        'phone': place.get('internationalPhoneNumber', ''),
                        'rating': place.get('rating', 0),
                        'user_ratings_total': place.get('userRatingCount', 0),
                        'price_level': '₹' * price_level,
                        'types': place.get('types', []),
                        # Geo + structured address so the created lead's
                        # delivery_address has lat/lng for field check-in.
                        'lat': place_loc.get('latitude'),
                        'lng': place_loc.get('longitude'),
                        'pincode': _pick(['postal_code']),
                        'city': _pick(['locality', 'administrative_area_level_2']),
                        'state': _pick(['administrative_area_level_1']),
                    }
                    all_places.append(outlet_data)
                
                return {
                    'results': all_places,
                    'total_results': len(all_places),
                    'search_location': f'{city}, India' if city else 'India'
                }
        
        # Otherwise, geocode location and search nearby
        async with httpx.AsyncClient() as client:
            geocode_url = "https://maps.googleapis.com/maps/api/geocode/json"
            
            # Use location name or pincode
            search_query = location_name if location_name else f'{pincode}, India'
            
            geocode_params = {
                'address': search_query,
                'key': api_key
            }
            
            geocode_response = await client.get(geocode_url, params=geocode_params)
            geocode_data = geocode_response.json()
            
            if geocode_data['status'] != 'OK' or not geocode_data.get('results'):
                raise HTTPException(status_code=404, detail=f'Location "{search_query}" not found')
            
            location = geocode_data['results'][0]['geometry']['location']
            formatted_location = geocode_data['results'][0]['formatted_address']
            
            # Map outlet types to Google Place types
            type_searches = []
            if 'Star Hotel' in types:
                type_searches.append('lodging')
            if 'Restaurant' in types:
                type_searches.append('restaurant')
            if 'Bar & Kitchen' in types:
                type_searches.append('bar')
            if 'Cafe' in types:
                type_searches.append('cafe')
            if 'Wellness Center' in types:
                type_searches.append('spa')
            if 'Premium Club' in types:
                type_searches.append('night_club')
            if 'Jewellery Stores' in types:
                type_searches.append('jewelry_store')
            
            # If no types selected, search all
            if not type_searches:
                type_searches = ['restaurant', 'cafe', 'bar', 'lodging']
            
            # Search for EACH type separately and combine results
            all_places = []
            seen_place_ids = set()
            
            for search_type in type_searches:
                places_url = "https://places.googleapis.com/v1/places:searchNearby"
                
                headers = {
                    'Content-Type': 'application/json',
                    'X-Goog-Api-Key': api_key,
                    'X-Goog-FieldMask': 'places.displayName,places.formattedAddress,places.internationalPhoneNumber,places.rating,places.userRatingCount,places.priceLevel,places.types,places.id,places.location,places.addressComponents'
                }
                
                body = {
                    "includedTypes": [search_type],
                    "maxResultCount": 20,
                    "locationRestriction": {
                        "circle": {
                            "center": {
                                "latitude": location['lat'],
                                "longitude": location['lng']
                            },
                            "radius": float(radius)
                        }
                    }
                }
                
                try:
                    places_response = await client.post(places_url, json=body, headers=headers)
                    places_data = places_response.json()
                    
                    # Process results from this type
                    for place in places_data.get('places', []):
                        place_id = place.get('id', '')
                        
                        # Skip duplicates
                        if place_id in seen_place_ids:
                            continue
                        seen_place_ids.add(place_id)
                        
                        # Filter by rating
                        rating = place.get('rating', 0)
                        if rating < min_rating:
                            continue
                        
                        # Filter by price level
                        price_level_map = {
                            'PRICE_LEVEL_FREE': 1,
                            'PRICE_LEVEL_INEXPENSIVE': 2,
                            'PRICE_LEVEL_MODERATE': 3,
                            'PRICE_LEVEL_EXPENSIVE': 4,
                            'PRICE_LEVEL_VERY_EXPENSIVE': 5
                        }
                        price_level = price_level_map.get(place.get('priceLevel', 'PRICE_LEVEL_MODERATE'), 3)
                        
                        if price_range == 'budget' and price_level > 2:
                            continue
                        if price_range == 'premium' and price_level < 4:
                            continue
                        
                        # Extract structured address components (postal code, locality, etc.)
                        addr_comps = place.get('addressComponents', []) or []
                        def _pick(types):
                            for c in addr_comps:
                                if any(t in (c.get('types') or []) for t in types):
                                    return c.get('longText') or c.get('shortText') or ''
                            return ''
                        place_loc = place.get('location', {}) or {}
                        outlet_data = {
                            'place_id': place_id,
                            'name': place.get('displayName', {}).get('text', 'Unknown'),
                            'address': place.get('formattedAddress', ''),
                            'phone': place.get('internationalPhoneNumber', ''),
                            'rating': rating,
                            'user_ratings_total': place.get('userRatingCount', 0),
                            'price_level': '₹' * price_level,
                            'types': place.get('types', []),
                            'search_type': search_type,
                            'lat': place_loc.get('latitude'),
                            'lng': place_loc.get('longitude'),
                            'pincode': _pick(['postal_code']),
                            'city': _pick(['locality', 'administrative_area_level_2']),
                            'state': _pick(['administrative_area_level_1']),
                        }
                        
                        all_places.append(outlet_data)
                except Exception as search_error:
                    logger.warning(f'Search failed for type {search_type}: {str(search_error)}')
                    continue
            
            return {
                'results': all_places,
                'total_results': len(all_places),
                'search_location': formatted_location
            }
        
    except Exception as e:
        logger.error(f'Google Places API error: {str(e)}')
        raise HTTPException(status_code=500, detail=f'Search failed: {str(e)}')

# ============= TRANSPORTATION CALCULATOR ROUTES =============

@api_router.post("/transport/autocomplete")
async def transport_autocomplete(params: dict, current_user: dict = Depends(get_current_user)):
    """Autocomplete location names for transportation calculator"""
    
    input_text = params.get('input', '')
    
    if not input_text or len(input_text) < 3:
        return {'predictions': []}
    
    try:
        api_key = os.environ.get('GOOGLE_MAPS_API_KEY')
        if not api_key:
            return {'predictions': [], 'error': 'API key not configured'}
        
        async with httpx.AsyncClient() as client:
            # Use Places API (New) - Text Search for autocomplete
            text_search_url = "https://places.googleapis.com/v1/places:searchText"
            
            headers = {
                'Content-Type': 'application/json',
                'X-Goog-Api-Key': api_key,
                'X-Goog-FieldMask': 'places.displayName,places.formattedAddress,places.id,places.location'
            }
            
            body = {
                "textQuery": f"{input_text}, India",
                "maxResultCount": 5
            }
            
            response = await client.post(text_search_url, json=body, headers=headers)
            data = response.json()
            
            if 'places' in data:
                predictions = []
                for place in data['places']:
                    location = place.get('location', {})
                    predictions.append({
                        'description': place.get('formattedAddress', place.get('displayName', {}).get('text', '')),
                        'place_id': place.get('id', ''),
                        'name': place.get('displayName', {}).get('text', ''),
                        'lat': location.get('latitude'),
                        'lng': location.get('longitude')
                    })
                return {'predictions': predictions}
            else:
                return {'predictions': []}
    
    except Exception as e:
        logger.error(f'Transport autocomplete error: {str(e)}')
        return {'predictions': [], 'error': str(e)}

@api_router.post("/transport/calculate-route")
async def calculate_transport_route(params: dict, current_user: dict = Depends(get_current_user)):
    """Calculate route between two locations using Google Routes API (New)"""
    
    origin = params.get('origin', {})  # {lat, lng} or address string
    destination = params.get('destination', {})  # {lat, lng} or address string
    
    if not origin or not destination:
        raise HTTPException(status_code=400, detail='Origin and destination required')
    
    try:
        api_key = os.environ.get('GOOGLE_MAPS_API_KEY')
        if not api_key:
            raise HTTPException(status_code=500, detail='Google Maps API key not configured')
        
        async with httpx.AsyncClient() as client:
            # Use Routes API (New)
            routes_url = "https://routes.googleapis.com/directions/v2:computeRoutes"
            
            headers = {
                'Content-Type': 'application/json',
                'X-Goog-Api-Key': api_key,
                'X-Goog-FieldMask': 'routes.duration,routes.distanceMeters,routes.description,routes.legs.startLocation,routes.legs.endLocation'
            }
            
            # Build origin waypoint
            if isinstance(origin, dict) and 'lat' in origin and origin['lat']:
                origin_waypoint = {
                    "location": {
                        "latLng": {
                            "latitude": float(origin['lat']),
                            "longitude": float(origin['lng'])
                        }
                    }
                }
            else:
                origin_waypoint = {
                    "address": str(origin)
                }
            
            # Build destination waypoint
            if isinstance(destination, dict) and 'lat' in destination and destination['lat']:
                dest_waypoint = {
                    "location": {
                        "latLng": {
                            "latitude": float(destination['lat']),
                            "longitude": float(destination['lng'])
                        }
                    }
                }
            else:
                dest_waypoint = {
                    "address": str(destination)
                }
            
            body = {
                "origin": origin_waypoint,
                "destination": dest_waypoint,
                "travelMode": "DRIVE",
                "routingPreference": "TRAFFIC_AWARE",
                "computeAlternativeRoutes": False,
                "languageCode": "en-US",
                "units": "METRIC"
            }
            
            response = await client.post(routes_url, json=body, headers=headers)
            data = response.json()
            
            if 'routes' in data and len(data['routes']) > 0:
                route = data['routes'][0]
                
                # Calculate distance in km
                distance_meters = route.get('distanceMeters', 0)
                distance_km = distance_meters / 1000
                
                # Get duration
                duration_str = route.get('duration', '0s')
                # Parse duration string like "12345s" to seconds
                duration_seconds = int(duration_str.replace('s', '')) if duration_str else 0
                
                # Convert to human readable
                hours = duration_seconds // 3600
                minutes = (duration_seconds % 3600) // 60
                if hours > 0:
                    duration_text = f"{hours} hr {minutes} min"
                else:
                    duration_text = f"{minutes} min"
                
                # Estimate tolls based on distance
                route_description = route.get('description', '').lower()
                uses_highway = 'nh' in route_description or 'highway' in route_description or 'expressway' in route_description or distance_km > 100
                
                toll_count = 0
                if uses_highway and distance_km >= 50:
                    toll_count = max(1, int(distance_km / 70))
                
                return {
                    'success': True,
                    'distance_km': round(distance_km, 1),
                    'duration_text': duration_text,
                    'duration_seconds': duration_seconds,
                    'toll_count': toll_count,
                    'route_summary': route.get('description', ''),
                }
            else:
                error_msg = data.get('error', {}).get('message', 'No route found')
                return {
                    'success': False,
                    'error': error_msg
                }
    
    except Exception as e:
        logger.error(f'Route calculation error: {str(e)}')
        raise HTTPException(status_code=500, detail=f'Route calculation failed: {str(e)}')

# ============= LEAVE MANAGEMENT ROUTES =============

@api_router.post("/leave-requests", response_model=LeaveRequest)
async def create_leave_request(request: LeaveRequestCreate, current_user: dict = Depends(get_current_user)):
    """Create leave request"""
    
    # Calculate total days
    from datetime import datetime as dt
    start = dt.fromisoformat(request.start_date)
    end = dt.fromisoformat(request.end_date)
    total_days = (end - start).days + 1
    
    leave_data = request.model_dump()
    leave_data['user_id'] = current_user['id']
    leave_data['total_days'] = total_days
    leave_obj = LeaveRequest(**leave_data)
    
    doc = leave_obj.model_dump()
    doc['created_at'] = doc['created_at'].isoformat()
    doc['updated_at'] = doc['updated_at'].isoformat()
    if doc.get('approval_date'):
        doc['approval_date'] = doc['approval_date'].isoformat()
    
    await get_tdb().leave_requests.insert_one(doc)
    
    # Create approval task for reporting manager
    reports_to = current_user.get('reports_to')
    if reports_to:
        leave_details = f"{request.leave_type.capitalize()} Leave ({request.start_date} to {request.end_date})"
        await create_approval_task(
            approval_type=ApprovalType.LEAVE_REQUEST,
            requester_id=current_user['id'],
            requester_name=current_user.get('name', 'Unknown'),
            approver_id=reports_to,
            details=leave_details,
            description=f"Leave request from {current_user.get('name')}:\n\nType: {request.leave_type.capitalize()}\nDates: {request.start_date} to {request.end_date}\nDays: {total_days}\nReason: {request.reason or 'Not specified'}",
            reference_id=leave_obj.id,
            reference_type='leave_request'
        )
    
    return leave_obj

@api_router.get("/leave-requests")
async def get_leave_requests(
    status: Optional[str] = None,
    current_user: dict = Depends(get_current_user)
):
    """Get leave requests - users see their own, managers see their team's"""
    
    if current_user['role'].lower() in ['ceo', 'director', 'vp', 'admin', 'sales_manager']:
        # Managers see requests from their direct reports
        direct_reports = await get_tdb().users.find(
            {'reports_to': current_user['id']},
            {'_id': 0, 'id': 1}
        ).to_list(100)
        
        user_ids = [current_user['id']] + [u['id'] for u in direct_reports]
        query = {'user_id': {'$in': user_ids}}
    else:
        # Regular users see only their own
        query = {'user_id': current_user['id']}
    
    if status:
        query['status'] = status
    
    requests = await get_tdb().leave_requests.find(query, {'_id': 0}).sort('created_at', -1).to_list(100)
    
    # Get user names
    user_ids = list(set([r['user_id'] for r in requests]))
    users = await get_tdb().users.find(
        {'id': {'$in': user_ids}},
        {'_id': 0, 'id': 1, 'name': 1}
    ).to_list(100)
    user_map = {u['id']: u['name'] for u in users}
    
    # Add user names to requests
    for req in requests:
        if isinstance(req.get('created_at'), str):
            req['created_at'] = datetime.fromisoformat(req['created_at'])
        if isinstance(req.get('updated_at'), str):
            req['updated_at'] = datetime.fromisoformat(req['updated_at'])
        if req.get('approval_date') and isinstance(req['approval_date'], str):
            req['approval_date'] = datetime.fromisoformat(req['approval_date'])
        
        req['user_name'] = user_map.get(req['user_id'], 'Unknown')
    
    return requests

@api_router.get("/leave-requests/for-approver")
async def get_leave_requests_for_approver(
    status: Optional[str] = None,
    current_user: dict = Depends(get_current_user)
):
    """Get all leave requests relevant to approver (pending from reportees + previously acted upon)"""
    import logging
    logger = logging.getLogger(__name__)
    logger.info(f"get_leave_requests_for_approver called for user: {current_user.get('id')}")
    
    # Get users who report to current user
    reporters = await get_tdb().users.find({'reports_to': current_user['id']}, {'_id': 0, 'id': 1}).to_list(100)
    reporter_ids = [r['id'] for r in reporters]
    logger.info(f"Reporter IDs: {reporter_ids}")
    
    # Build query: requests from reportees OR approved/rejected by this user
    query = {
        '$or': [
            {'user_id': {'$in': reporter_ids}},  # From reportees
            {'approved_by': current_user['id']}   # Previously acted upon
        ]
    }
    logger.info(f"Query: {query}")
    
    if status and status != 'all':
        query['status'] = status
    
    requests = await get_tdb().leave_requests.find(query, {'_id': 0}).sort('created_at', -1).to_list(1000)
    logger.info(f"Found {len(requests)} leave requests")
    
    # Get user names for all requests
    user_ids = list(set([r.get('user_id') for r in requests if r.get('user_id')]))
    if user_ids:
        users = await get_tdb().users.find(
            {'id': {'$in': user_ids}},
            {'_id': 0, 'id': 1, 'name': 1}
        ).to_list(100)
        user_map = {u['id']: u['name'] for u in users}
        
        for req in requests:
            if req.get('user_id'):
                req['user_name'] = user_map.get(req['user_id'], req.get('user_name', 'Unknown'))
    
    return requests

@api_router.put("/leave-requests/{request_id}/approve")
async def approve_leave_request(
    request_id: str,
    approval: LeaveApproval,
    current_user: dict = Depends(get_current_user)
):
    """Approve or reject leave request"""
    
    leave_req = await get_tdb().leave_requests.find_one({'id': request_id}, {'_id': 0})
    if not leave_req:
        raise HTTPException(status_code=404, detail='Leave request not found')
    
    # Check if user is the manager of the requester
    requester = await get_tdb().users.find_one({'id': leave_req['user_id']}, {'_id': 0})
    if not requester:
        raise HTTPException(status_code=404, detail='Requester not found')
    
    if requester.get('reports_to') != current_user['id'] and current_user['role'] not in ['admin', 'ceo']:
        raise HTTPException(status_code=403, detail='Only the reporting manager can approve leaves')
    
    # Update leave request
    update_data = {
        'status': approval.status,
        'approved_by': current_user['id'],
        'approval_date': datetime.now(timezone.utc).isoformat(),
        'updated_at': datetime.now(timezone.utc).isoformat()
    }
    
    if approval.rejection_reason:
        update_data['rejection_reason'] = approval.rejection_reason
    
    await get_tdb().leave_requests.update_one({'id': request_id}, {'$set': update_data})
    
    # Complete the approval task
    await complete_approval_task(
        approval_type=ApprovalType.LEAVE_REQUEST,
        reference_id=request_id,
        status='completed'
    )
    
    return {'message': f'Leave request {approval.status}'}

@api_router.get("/leave-requests/pending-approvals")
async def get_pending_approvals(current_user: dict = Depends(get_current_user)):
    """Get pending leave requests that need approval from current user"""
    
    # Get direct reports
    direct_reports = await get_tdb().users.find(
        {'reports_to': current_user['id']},
        {'_id': 0, 'id': 1, 'name': 1}
    ).to_list(100)
    
    if not direct_reports:
        return {'pending_requests': [], 'count': 0}
    
    user_ids = [u['id'] for u in direct_reports]
    
    # Get pending requests from direct reports
    pending = await get_tdb().leave_requests.find(
        {'user_id': {'$in': user_ids}, 'status': 'pending'},
        {'_id': 0}
    ).sort('created_at', 1).to_list(100)
    
    # Add user names
    user_map = {u['id']: u['name'] for u in direct_reports}
    for req in pending:
        req['user_name'] = user_map.get(req['user_id'], 'Unknown')
    
    return {'pending_requests': pending, 'count': len(pending)}

# ============= TRAVEL REQUEST ROUTES =============

TRAVEL_PURPOSES = [
    {'value': 'lead_customer_visits', 'label': 'Lead / Customer visits'},
    {'value': 'distribution', 'label': 'Distribution'},
    {'value': 'manufacturing', 'label': 'Manufacturing'},
    {'value': 'team_visit', 'label': 'Team visit'},
    {'value': 'vendor_visits', 'label': 'Vendor visits'},
]

@api_router.get("/travel-requests/purposes")
async def get_travel_purposes():
    """Get list of travel purposes"""
    return TRAVEL_PURPOSES

@api_router.post("/travel-requests")
async def create_travel_request(request: TravelRequestCreate, current_user: dict = Depends(get_current_user)):
    """Create travel request"""
    
    # Calculate days before travel
    from datetime import datetime as dt
    today = dt.now().date()
    departure = dt.fromisoformat(request.departure_date).date()
    days_before_travel = (departure - today).days
    is_short_notice = days_before_travel < 15
    
    # Validate short notice explanation
    if is_short_notice and request.submit_for_approval:
        if not request.short_notice_explanation or len(request.short_notice_explanation.strip()) < 20:
            raise HTTPException(
                status_code=400, 
                detail='Short notice travel (less than 15 days) requires an explanation of at least 20 characters'
            )
    
    # Process selected leads
    selected_leads = []
    opportunity_size = 0
    for lead_data in request.selected_leads:
        lead = TravelRequestLead(
            lead_id=lead_data.get('lead_id', ''),
            lead_name=lead_data.get('lead_name', ''),
            city=lead_data.get('city'),
            estimated_deal_value=float(lead_data.get('estimated_deal_value', 0))
        )
        selected_leads.append(lead)
        opportunity_size += lead.estimated_deal_value
    
    # Process budget breakdown
    budget_breakdown = None
    if request.budget_breakdown:
        budget_breakdown = TravelRequestBudget(
            travel=request.budget_breakdown.get('travel', 0),
            accommodation=request.budget_breakdown.get('accommodation', 0),
            local_transport=request.budget_breakdown.get('local_transport', 0),
            meals=request.budget_breakdown.get('meals', 0),
            others=request.budget_breakdown.get('others', 0),
            total=request.budget_breakdown.get('travel', 0) + 
                  request.budget_breakdown.get('accommodation', 0) + 
                  request.budget_breakdown.get('local_transport', 0) + 
                  request.budget_breakdown.get('meals', 0) + 
                  request.budget_breakdown.get('others', 0)
        )
    
    # Determine status
    status = 'pending_approval' if request.submit_for_approval else 'draft'
    
    travel_obj = TravelRequest(
        user_id=current_user['id'],
        user_name=current_user.get('name'),
        from_location=request.from_location,
        to_location=request.to_location,
        departure_date=request.departure_date,
        return_date=request.return_date,
        is_flexible=request.is_flexible,
        flexible_window=request.flexible_window,
        flexibility_notes=request.flexibility_notes,
        days_before_travel=days_before_travel,
        is_short_notice=is_short_notice,
        short_notice_explanation=request.short_notice_explanation,
        purpose=request.purpose,
        selected_leads=selected_leads,
        opportunity_size=opportunity_size,
        tentative_budget=request.tentative_budget,
        budget_breakdown=budget_breakdown,
        additional_notes=request.additional_notes,
        status=status
    )
    
    doc = travel_obj.model_dump()
    doc['created_at'] = doc['created_at'].isoformat()
    doc['updated_at'] = doc['updated_at'].isoformat()
    if doc.get('approval_date'):
        doc['approval_date'] = doc['approval_date'].isoformat()
    # Convert nested models to dicts
    doc['selected_leads'] = [l.model_dump() if hasattr(l, 'model_dump') else l for l in travel_obj.selected_leads]
    if travel_obj.budget_breakdown:
        doc['budget_breakdown'] = travel_obj.budget_breakdown.model_dump()
    
    await get_tdb().travel_requests.insert_one(doc)
    
    # Create approval task for the requester's reporting manager (with fallbacks)
    if request.submit_for_approval:
        approver = await resolve_request_approver(current_user['id'])

        if approver:
            await get_tdb().travel_requests.update_one(
                {'id': travel_obj.id},
                {'$set': {'approver_id': approver['id'], 'approver_name': approver.get('name')}}
            )
            travel_details = f"{request.from_location} to {request.to_location} ({request.departure_date})"
            await create_approval_task(
                approval_type=ApprovalType.TRAVEL_REQUEST,
                requester_id=current_user['id'],
                requester_name=current_user.get('name', 'Unknown'),
                approver_id=approver['id'],
                details=travel_details,
                description=f"Travel request from {current_user.get('name')}:\n\nFrom: {request.from_location}\nTo: {request.to_location}\nDeparture: {request.departure_date}\nReturn: {request.return_date}\nPurpose: {request.purpose}\nBudget: ₹{request.tentative_budget:,.0f}\n\n{'Short Notice: ' + request.short_notice_explanation if is_short_notice else ''}",
                reference_id=travel_obj.id,
                reference_type='travel_request'
            )
            await notify_approver(
                approver,
                title=f"Travel approval needed: {request.to_location}",
                body=f"{current_user.get('name', 'A team member')} submitted a travel request ({travel_details}, ₹{request.tentative_budget:,.0f}). Your approval is required.",
                link="/travel-requests",
                entity_type='travel_request',
                entity_id=travel_obj.id,
            )
        else:
            logger.warning(f"No approver could be resolved for travel {travel_obj.id} raised by {current_user.get('name')}")
    
    return {k: v for k, v in doc.items() if k != '_id'}

@api_router.get("/travel-requests")
async def get_travel_requests(
    status: Optional[str] = None,
    current_user: dict = Depends(get_current_user)
):
    """Get travel requests - users see their own, CEO/Director see all pending"""
    
    query = {}
    
    if current_user['role'].lower() in ['ceo', 'director']:
        # CEO/Director see their own + all pending for approval
        if status:
            if status == 'pending_approval':
                # Show all pending
                query = {'status': 'pending_approval'}
            else:
                # Show own with specific status
                query = {'user_id': current_user['id'], 'status': status}
        else:
            # Show own + all pending
            query = {'$or': [
                {'user_id': current_user['id']},
                {'status': 'pending_approval'}
            ]}
    else:
        # Regular users see only their own
        query = {'user_id': current_user['id']}
        if status:
            query['status'] = status
    
    requests = await get_tdb().travel_requests.find(query, {'_id': 0}).sort('created_at', -1).to_list(100)
    
    # Get user names for all requests
    user_ids = list(set([r['user_id'] for r in requests]))
    users = await get_tdb().users.find(
        {'id': {'$in': user_ids}},
        {'_id': 0, 'id': 1, 'name': 1}
    ).to_list(100)
    user_map = {u['id']: u['name'] for u in users}
    
    for req in requests:
        req['user_name'] = user_map.get(req['user_id'], req.get('user_name', 'Unknown'))
    
    return requests

@api_router.get("/travel-requests/for-approver")
async def get_travel_requests_for_approver(
    status: Optional[str] = None,
    current_user: dict = Depends(get_current_user)
):
    """Get all travel requests relevant to approver (pending from reportees + previously acted upon)"""
    # Get users who report to current user
    reporters = await get_tdb().users.find({'reports_to': current_user['id']}, {'_id': 0, 'id': 1}).to_list(100)
    reporter_ids = [r['id'] for r in reporters]
    
    # Build query: requests from reportees OR approved/rejected by this user
    query = {
        '$or': [
            {'user_id': {'$in': reporter_ids}},  # From reportees
            {'approved_by': current_user['id']}   # Previously acted upon
        ]
    }
    
    if status and status != 'all':
        query['status'] = status
    
    requests = await get_tdb().travel_requests.find(query, {'_id': 0}).sort('created_at', -1).to_list(1000)
    
    # Get user names for all requests
    user_ids = list(set([r['user_id'] for r in requests]))
    if user_ids:
        users = await get_tdb().users.find(
            {'id': {'$in': user_ids}},
            {'_id': 0, 'id': 1, 'name': 1}
        ).to_list(100)
        user_map = {u['id']: u['name'] for u in users}
        
        for req in requests:
            req['user_name'] = user_map.get(req['user_id'], req.get('user_name', 'Unknown'))
    
    return requests

@api_router.get("/travel-requests/{request_id}")
async def get_travel_request(request_id: str, current_user: dict = Depends(get_current_user)):
    """Get single travel request"""
    
    travel_req = await get_tdb().travel_requests.find_one({'id': request_id}, {'_id': 0})
    if not travel_req:
        raise HTTPException(status_code=404, detail='Travel request not found')
    
    # Check access
    if travel_req['user_id'] != current_user['id'] and current_user['role'].lower() not in ['ceo', 'director']:
        raise HTTPException(status_code=403, detail='Access denied')
    
    return travel_req

@api_router.put("/travel-requests/{request_id}")
async def update_travel_request(
    request_id: str,
    request: TravelRequestUpdate,
    current_user: dict = Depends(get_current_user)
):
    """Update travel request (only if in draft status)"""
    
    travel_req = await get_tdb().travel_requests.find_one({'id': request_id}, {'_id': 0})
    if not travel_req:
        raise HTTPException(status_code=404, detail='Travel request not found')
    
    if travel_req['user_id'] != current_user['id']:
        raise HTTPException(status_code=403, detail='You can only edit your own travel requests')
    
    if travel_req['status'] != 'draft':
        raise HTTPException(status_code=400, detail='Only draft requests can be edited')
    
    update_data = {}
    
    # Update fields if provided
    if request.from_location is not None:
        update_data['from_location'] = request.from_location
    if request.to_location is not None:
        update_data['to_location'] = request.to_location
    if request.departure_date is not None:
        update_data['departure_date'] = request.departure_date
        # Recalculate days before travel
        from datetime import datetime as dt
        today = dt.now().date()
        departure = dt.fromisoformat(request.departure_date).date()
        update_data['days_before_travel'] = (departure - today).days
        update_data['is_short_notice'] = update_data['days_before_travel'] < 15
    if request.return_date is not None:
        update_data['return_date'] = request.return_date
    if request.is_flexible is not None:
        update_data['is_flexible'] = request.is_flexible
    if request.flexible_window is not None:
        update_data['flexible_window'] = request.flexible_window
    if request.flexibility_notes is not None:
        update_data['flexibility_notes'] = request.flexibility_notes
    if request.short_notice_explanation is not None:
        update_data['short_notice_explanation'] = request.short_notice_explanation
    if request.purpose is not None:
        update_data['purpose'] = request.purpose
    if request.selected_leads is not None:
        update_data['selected_leads'] = request.selected_leads
        update_data['opportunity_size'] = sum(l.get('estimated_deal_value', 0) for l in request.selected_leads)
    if request.tentative_budget is not None:
        update_data['tentative_budget'] = request.tentative_budget
    if request.budget_breakdown is not None:
        update_data['budget_breakdown'] = request.budget_breakdown
    if request.additional_notes is not None:
        update_data['additional_notes'] = request.additional_notes
    
    # Check if submitting for approval
    if request.submit_for_approval:
        is_short_notice = update_data.get('is_short_notice', travel_req.get('is_short_notice', False))
        explanation = update_data.get('short_notice_explanation', travel_req.get('short_notice_explanation'))
        
        if is_short_notice and (not explanation or len(explanation.strip()) < 20):
            raise HTTPException(
                status_code=400,
                detail='Short notice travel requires an explanation of at least 20 characters'
            )
        
        update_data['status'] = 'pending_approval'
        
        # Create approval tasks
        approvers = await get_tdb().users.find(
            {'role': {'$in': ['CEO', 'Director']}, 'is_active': True},
            {'_id': 0, 'id': 1, 'name': 1}
        ).to_list(10)
        
        from_loc = update_data.get('from_location', travel_req['from_location'])
        to_loc = update_data.get('to_location', travel_req['to_location'])
        dep_date = update_data.get('departure_date', travel_req['departure_date'])
        purpose = update_data.get('purpose', travel_req['purpose'])
        budget = update_data.get('tentative_budget', travel_req['tentative_budget'])
        
        travel_details = f"{from_loc} to {to_loc} ({dep_date})"
        
        for approver in approvers:
            await create_approval_task(
                approval_type=ApprovalType.TRAVEL_REQUEST,
                requester_id=current_user['id'],
                requester_name=current_user.get('name', 'Unknown'),
                approver_id=approver['id'],
                details=travel_details,
                description=f"Travel request from {current_user.get('name')}:\n\nFrom: {from_loc}\nTo: {to_loc}\nDeparture: {dep_date}\nPurpose: {purpose}\nBudget: ₹{budget:,.0f}",
                reference_id=request_id,
                reference_type='travel_request'
            )
    
    update_data['updated_at'] = datetime.now(timezone.utc).isoformat()
    
    await get_tdb().travel_requests.update_one({'id': request_id}, {'$set': update_data})
    
    return {'message': 'Travel request updated successfully'}

@api_router.put("/travel-requests/{request_id}/approve")
async def approve_travel_request(
    request_id: str,
    approval: TravelApproval,
    current_user: dict = Depends(get_current_user)
):
    """Approve or reject travel request (CEO/Director only)"""
    
    travel_req = await get_tdb().travel_requests.find_one({'id': request_id}, {'_id': 0})
    if not travel_req:
        raise HTTPException(status_code=404, detail='Travel request not found')
    
    # The designated approver (reporting manager) OR a senior approver can act.
    _senior_roles = ['CEO', 'Director', 'Vice President', 'Admin', 'System Admin']
    if current_user['id'] != travel_req.get('approver_id') and current_user['role'] not in _senior_roles:
        raise HTTPException(status_code=403, detail='You are not authorized to approve this travel request')
    
    if travel_req['status'] != 'pending_approval':
        raise HTTPException(status_code=400, detail='Only pending requests can be approved/rejected')
    
    update_data = {
        'status': approval.status,
        'approved_by': current_user['id'],
        'approved_by_name': current_user.get('name'),
        'approval_date': datetime.now(timezone.utc).isoformat(),
        'updated_at': datetime.now(timezone.utc).isoformat()
    }
    
    if approval.rejection_reason:
        update_data['rejection_reason'] = approval.rejection_reason
    
    await get_tdb().travel_requests.update_one({'id': request_id}, {'$set': update_data})
    
    # Complete approval tasks
    await complete_approval_task(
        approval_type=ApprovalType.TRAVEL_REQUEST,
        reference_id=request_id,
        status='completed'
    )
    
    return {'message': f'Travel request {approval.status}'}

@api_router.put("/travel-requests/{request_id}/cancel")
async def cancel_travel_request(request_id: str, current_user: dict = Depends(get_current_user)):
    """Cancel travel request"""
    
    travel_req = await get_tdb().travel_requests.find_one({'id': request_id}, {'_id': 0})
    if not travel_req:
        raise HTTPException(status_code=404, detail='Travel request not found')
    
    if travel_req['user_id'] != current_user['id']:
        raise HTTPException(status_code=403, detail='You can only cancel your own travel requests')
    
    if travel_req['status'] in ['approved', 'rejected', 'cancelled']:
        raise HTTPException(status_code=400, detail='Cannot cancel this request')
    
    await get_tdb().travel_requests.update_one(
        {'id': request_id},
        {'$set': {
            'status': 'cancelled',
            'updated_at': datetime.now(timezone.utc).isoformat()
        }}
    )
    
    # Complete any pending approval tasks
    await complete_approval_task(
        approval_type=ApprovalType.TRAVEL_REQUEST,
        reference_id=request_id,
        status='cancelled'
    )
    
    return {'message': 'Travel request cancelled'}

@api_router.get("/travel-requests/pending-approvals/count")
async def get_pending_travel_approvals_count(current_user: dict = Depends(get_current_user)):
    """Get count of pending travel approvals (for CEO/Director)"""
    
    if current_user['role'].lower() not in ['ceo', 'director']:
        return {'count': 0}
    
    count = await get_tdb().travel_requests.count_documents({'status': 'pending_approval'})
    return {'count': count}

# ============= BUDGET REQUEST ROUTES =============

@api_router.get("/budget-categories")
async def get_budget_categories():
    """Get list of budget categories"""
    return BUDGET_CATEGORIES

@api_router.post("/budget-requests")
async def create_budget_request(request: BudgetRequestCreate, current_user: dict = Depends(get_current_user)):
    """Create budget request"""
    
    # Process line items
    line_items = []
    total_amount = 0
    
    for item_data in request.line_items:
        item = BudgetLineItem(
            category_id=item_data.get('category_id', ''),
            category_label=item_data.get('category_label', ''),
            lead_id=item_data.get('lead_id'),
            lead_name=item_data.get('lead_name'),
            lead_city=item_data.get('lead_city'),
            sku_id=item_data.get('sku_id'),
            sku_name=item_data.get('sku_name'),
            bottle_count=item_data.get('bottle_count'),
            price_per_unit=item_data.get('price_per_unit'),
            amount=float(item_data.get('amount', 0)),
            notes=item_data.get('notes')
        )
        line_items.append(item)
        total_amount += item.amount
    
    status = 'pending_approval' if request.submit_for_approval else 'draft'
    
    budget_obj = BudgetRequest(
        user_id=current_user['id'],
        user_name=current_user.get('name'),
        title=request.title,
        description=request.description,
        line_items=line_items,
        total_amount=total_amount,
        event_name=request.event_name,
        event_date=request.event_date,
        event_city=request.event_city,
        status=status
    )
    
    doc = budget_obj.model_dump()
    doc['created_at'] = doc['created_at'].isoformat()
    doc['updated_at'] = doc['updated_at'].isoformat()
    if doc.get('approval_date'):
        doc['approval_date'] = doc['approval_date'].isoformat()
    # Convert line items to dicts
    doc['line_items'] = [li.model_dump() if hasattr(li, 'model_dump') else li for li in budget_obj.line_items]
    
    await get_tdb().budget_requests.insert_one(doc)
    
    # Create approval task for the requester's reporting manager (with fallbacks)
    if request.submit_for_approval:
        approver = await resolve_request_approver(current_user['id'])

        if approver:
            await get_tdb().budget_requests.update_one(
                {'id': budget_obj.id},
                {'$set': {'approver_id': approver['id'], 'approver_name': approver.get('name')}}
            )
            budget_details = f"{request.title} - ₹{total_amount:,.0f}"
            await create_approval_task(
                approval_type=ApprovalType.BUDGET_REQUEST,
                requester_id=current_user['id'],
                requester_name=current_user.get('name', 'Unknown'),
                approver_id=approver['id'],
                details=budget_details,
                description=f"Budget request from {current_user.get('name')}:\n\nTitle: {request.title}\nTotal Amount: ₹{total_amount:,.0f}\nCategories: {len(line_items)} items\n\n{request.description or ''}",
                reference_id=budget_obj.id,
                reference_type='budget_request'
            )
            await notify_approver(
                approver,
                title=f"Budget approval needed: {request.title}",
                body=f"{current_user.get('name', 'A team member')} submitted a budget request '{request.title}' of ₹{total_amount:,.0f}. Your approval is required.",
                link="/budget-requests",
                entity_type='budget_request',
                entity_id=budget_obj.id,
            )
        else:
            logger.warning(f"No approver could be resolved for budget {budget_obj.id} raised by {current_user.get('name')}")
    
    return {k: v for k, v in doc.items() if k != '_id'}

@api_router.get("/budget-requests")
async def get_budget_requests(
    status: Optional[str] = None,
    current_user: dict = Depends(get_current_user)
):
    """Get budget requests - users see their own, Director sees all pending"""
    
    query = {}
    
    if current_user['role'].lower() == 'director':
        # Director sees their own + all pending for approval
        if status:
            if status == 'pending_approval':
                query = {'status': 'pending_approval'}
            else:
                query = {'user_id': current_user['id'], 'status': status}
        else:
            query = {'$or': [
                {'user_id': current_user['id']},
                {'status': 'pending_approval'}
            ]}
    else:
        # Regular users see only their own
        query = {'user_id': current_user['id']}
        if status:
            query['status'] = status
    
    requests = await get_tdb().budget_requests.find(query, {'_id': 0}).sort('created_at', -1).to_list(100)
    
    # Get user names
    user_ids = list(set([r['user_id'] for r in requests]))
    users = await get_tdb().users.find(
        {'id': {'$in': user_ids}},
        {'_id': 0, 'id': 1, 'name': 1}
    ).to_list(100)
    user_map = {u['id']: u['name'] for u in users}
    
    for req in requests:
        req['user_name'] = user_map.get(req['user_id'], req.get('user_name', 'Unknown'))
    
    return requests

@api_router.get("/budget-requests/for-approver")
async def get_budget_requests_for_approver(
    status: Optional[str] = None,
    current_user: dict = Depends(get_current_user)
):
    """Get all budget requests relevant to approver (pending from reportees + previously acted upon)"""
    # Get users who report to current user
    reporters = await get_tdb().users.find({'reports_to': current_user['id']}, {'_id': 0, 'id': 1}).to_list(100)
    reporter_ids = [r['id'] for r in reporters]
    
    # Build query: requests from reportees OR approved/rejected by this user
    query = {
        '$or': [
            {'user_id': {'$in': reporter_ids}},  # From reportees
            {'approved_by': current_user['id']}   # Previously acted upon
        ]
    }
    
    if status and status != 'all':
        query['status'] = status
    
    requests = await get_tdb().budget_requests.find(query, {'_id': 0}).sort('created_at', -1).to_list(1000)
    
    # Get user names for all requests
    user_ids = list(set([r.get('user_id') for r in requests if r.get('user_id')]))
    if user_ids:
        users = await get_tdb().users.find(
            {'id': {'$in': user_ids}},
            {'_id': 0, 'id': 1, 'name': 1}
        ).to_list(100)
        user_map = {u['id']: u['name'] for u in users}
        
        for req in requests:
            if req.get('user_id'):
                req['user_name'] = user_map.get(req['user_id'], req.get('user_name', 'Unknown'))
    
    return requests

@api_router.get("/budget-requests/{request_id}")
async def get_budget_request(request_id: str, current_user: dict = Depends(get_current_user)):
    """Get single budget request"""
    
    budget_req = await get_tdb().budget_requests.find_one({'id': request_id}, {'_id': 0})
    if not budget_req:
        raise HTTPException(status_code=404, detail='Budget request not found')
    
    # Check access
    if budget_req['user_id'] != current_user['id'] and current_user['role'].lower() != 'director':
        raise HTTPException(status_code=403, detail='Access denied')
    
    return budget_req

@api_router.put("/budget-requests/{request_id}")
async def update_budget_request(
    request_id: str,
    request: BudgetRequestUpdate,
    current_user: dict = Depends(get_current_user)
):
    """Update budget request (only if in draft status)"""
    
    budget_req = await get_tdb().budget_requests.find_one({'id': request_id}, {'_id': 0})
    if not budget_req:
        raise HTTPException(status_code=404, detail='Budget request not found')
    
    if budget_req['user_id'] != current_user['id']:
        raise HTTPException(status_code=403, detail='You can only edit your own budget requests')
    
    if budget_req['status'] != 'draft':
        raise HTTPException(status_code=400, detail='Only draft requests can be edited')
    
    update_data = {}
    
    if request.title is not None:
        update_data['title'] = request.title
    if request.description is not None:
        update_data['description'] = request.description
    if request.event_name is not None:
        update_data['event_name'] = request.event_name
    if request.event_date is not None:
        update_data['event_date'] = request.event_date
    if request.event_city is not None:
        update_data['event_city'] = request.event_city
    
    if request.line_items is not None:
        total_amount = sum(float(item.get('amount', 0)) for item in request.line_items)
        update_data['line_items'] = request.line_items
        update_data['total_amount'] = total_amount
    
    if request.submit_for_approval:
        update_data['status'] = 'pending_approval'
        
        # Create approval tasks for Directors
        approvers = await get_tdb().users.find(
            {'role': 'Director', 'is_active': True},
            {'_id': 0, 'id': 1, 'name': 1}
        ).to_list(10)
        
        title = update_data.get('title', budget_req['title'])
        total = update_data.get('total_amount', budget_req['total_amount'])
        budget_details = f"{title} - ₹{total:,.0f}"
        
        for approver in approvers:
            await create_approval_task(
                approval_type=ApprovalType.BUDGET_REQUEST,
                requester_id=current_user['id'],
                requester_name=current_user.get('name', 'Unknown'),
                approver_id=approver['id'],
                details=budget_details,
                description=f"Budget request from {current_user.get('name')}:\n\nTitle: {title}\nTotal Amount: ₹{total:,.0f}",
                reference_id=request_id,
                reference_type='budget_request'
            )
    
    update_data['updated_at'] = datetime.now(timezone.utc).isoformat()
    
    await get_tdb().budget_requests.update_one({'id': request_id}, {'$set': update_data})
    
    return {'message': 'Budget request updated successfully'}

@api_router.put("/budget-requests/{request_id}/approve")
async def approve_budget_request(
    request_id: str,
    approval: BudgetApproval,
    current_user: dict = Depends(get_current_user)
):
    """Approve or reject budget request (Director only)"""
    
    budget_req = await get_tdb().budget_requests.find_one({'id': request_id}, {'_id': 0})
    if not budget_req:
        raise HTTPException(status_code=404, detail='Budget request not found')
    
    # The designated approver (reporting manager) OR a senior approver can act.
    _senior_roles = ['CEO', 'Director', 'Vice President', 'Admin', 'System Admin']
    if current_user['id'] != budget_req.get('approver_id') and current_user['role'] not in _senior_roles:
        raise HTTPException(status_code=403, detail='You are not authorized to approve this budget request')
    
    if budget_req['status'] != 'pending_approval':
        raise HTTPException(status_code=400, detail='Only pending requests can be approved/rejected')
    
    update_data = {
        'status': approval.status,
        'approved_by': current_user['id'],
        'approved_by_name': current_user.get('name'),
        'approval_date': datetime.now(timezone.utc).isoformat(),
        'updated_at': datetime.now(timezone.utc).isoformat()
    }
    
    if approval.rejection_reason:
        update_data['rejection_reason'] = approval.rejection_reason
    
    await get_tdb().budget_requests.update_one({'id': request_id}, {'$set': update_data})
    
    # Complete approval tasks
    await complete_approval_task(
        approval_type=ApprovalType.BUDGET_REQUEST,
        reference_id=request_id,
        status='completed'
    )
    
    return {'message': f'Budget request {approval.status}'}

@api_router.put("/budget-requests/{request_id}/cancel")
async def cancel_budget_request(request_id: str, current_user: dict = Depends(get_current_user)):
    """Cancel budget request"""
    
    budget_req = await get_tdb().budget_requests.find_one({'id': request_id}, {'_id': 0})
    if not budget_req:
        raise HTTPException(status_code=404, detail='Budget request not found')
    
    if budget_req['user_id'] != current_user['id']:
        raise HTTPException(status_code=403, detail='You can only cancel your own budget requests')
    
    if budget_req['status'] in ['approved', 'rejected', 'cancelled']:
        raise HTTPException(status_code=400, detail='Cannot cancel this request')
    
    await get_tdb().budget_requests.update_one(
        {'id': request_id},
        {'$set': {
            'status': 'cancelled',
            'updated_at': datetime.now(timezone.utc).isoformat()
        }}
    )
    
    # Complete any pending approval tasks
    await complete_approval_task(
        approval_type=ApprovalType.BUDGET_REQUEST,
        reference_id=request_id,
        status='cancelled'
    )
    
    return {'message': 'Budget request cancelled'}

# ============= EXPENSE REQUEST ROUTES (Lead/Account Level) =============

@api_router.get("/expense-types")
async def get_expense_types(current_user: dict = Depends(get_current_user)):
    """Get list of expense types"""
    return EXPENSE_TYPES

@api_router.post("/expense-requests")
async def create_expense_request(request: ExpenseRequestCreate, current_user: dict = Depends(get_current_user)):
    """Create a new expense request for a lead or account"""
    
    # Validate expense type
    expense_type_info = next((t for t in EXPENSE_TYPES if t['id'] == request.expense_type), None)
    if not expense_type_info:
        raise HTTPException(status_code=400, detail='Invalid expense type')
    
    # Get entity info (lead or account)
    entity_name = None
    entity_city = None
    
    if request.entity_type == 'lead':
        lead = await get_tdb().leads.find_one({'id': request.entity_id}, {'_id': 0, 'company': 1, 'city': 1})
        if not lead:
            raise HTTPException(status_code=404, detail='Lead not found')
        entity_name = lead.get('company')
        entity_city = lead.get('city')
    elif request.entity_type == 'account':
        account = await get_tdb().accounts.find_one({'id': request.entity_id}, {'_id': 0, 'account_name': 1, 'city': 1})
        if not account:
            # Try with account_id
            account = await get_tdb().accounts.find_one({'account_id': request.entity_id}, {'_id': 0, 'account_name': 1, 'city': 1})
        if not account:
            raise HTTPException(status_code=404, detail='Account not found')
        entity_name = account.get('account_name')
        entity_city = account.get('city')
    else:
        raise HTTPException(status_code=400, detail='entity_type must be "lead" or "account"')
    
    # Process SKU items for free_trial expense
    sku_items = []
    total_sku_cost = 0
    
    if request.expense_type == 'free_trial' and request.sku_items:
        for item in request.sku_items:
            # Get minimum landing price from COGS
            cogs_data = await get_tdb().cogs_data.find_one(
                {'city': entity_city, 'sku_name': item.get('sku_name')},
                {'_id': 0, 'minimum_landing_price': 1}
            )
            mlp = cogs_data.get('minimum_landing_price', 0) if cogs_data else 0
            quantity = item.get('quantity', 0)
            item_cost = mlp * quantity
            
            sku_items.append(ExpenseSKUItem(
                sku_id=item.get('sku_id', ''),
                sku_name=item.get('sku_name', ''),
                quantity=quantity,
                minimum_landing_price=mlp,
                total_cost=item_cost
            ))
            total_sku_cost += item_cost
    
    # Calculate total amount — rounded to whole rupees end-to-end so the
    # stored amount, the notification body, and the approval task description
    # never carry confusing fractional paise from MLP × Qty products.
    raw_amount = total_sku_cost if request.expense_type == 'free_trial' else request.amount
    final_amount = round(float(raw_amount or 0))
    
    # Create expense request
    expense_obj = ExpenseRequest(
        entity_type=request.entity_type,
        entity_id=request.entity_id,
        entity_name=entity_name,
        entity_city=entity_city,
        expense_type=request.expense_type,
        expense_type_label=expense_type_info['label'],
        description=request.description,
        amount=final_amount,
        free_trial_days=request.free_trial_days if request.expense_type == 'free_trial' else None,
        sku_items=sku_items,
        total_sku_cost=total_sku_cost,
        user_id=current_user['id'],
        user_name=current_user.get('name'),
        status='pending_approval' if request.submit_for_approval else 'draft'
    )
    
    # Store document
    doc = expense_obj.model_dump()
    doc['created_at'] = doc['created_at'].isoformat()
    doc['updated_at'] = doc['updated_at'].isoformat()
    if doc.get('approval_date'):
        doc['approval_date'] = doc['approval_date'].isoformat()
    
    # Convert SKU items to dicts
    doc['sku_items'] = [item.model_dump() for item in sku_items]
    
    await get_tdb().expense_requests.insert_one(doc)
    
    # Create approval task if submitted for approval
    if request.submit_for_approval:
        # Route to the requester's reporting manager (with fallbacks)
        approver = await resolve_request_approver(current_user['id'])

        if approver:
            # Persist the resolved approver on the request so the approve
            # endpoint can authorize them (even if they aren't a Director).
            await get_tdb().expense_requests.update_one(
                {'id': expense_obj.id},
                {'$set': {'approver_id': approver['id'], 'approver_name': approver.get('name')}}
            )
            expense_label = expense_type_info['label']
            await create_approval_task(
                approval_type=ApprovalType.EXPENSE,
                requester_id=current_user['id'],
                requester_name=current_user.get('name', 'Unknown'),
                approver_id=approver['id'],
                details=f"{expense_label} - {entity_name} (₹{final_amount:,.0f})",
                description=f"Expense request for {entity_name}:\n\nType: {expense_label}\nAmount: ₹{final_amount:,.0f}\n{('Free Trial Days: ' + str(request.free_trial_days)) if request.free_trial_days else ''}\n{request.description or ''}",
                reference_id=expense_obj.id,
                reference_type='expense_request',
                lead_id=request.entity_id if request.entity_type == 'lead' else None,
                account_id=request.entity_id if request.entity_type == 'account' else None,
            )
            _entity_link = f"/leads/{request.entity_id}" if request.entity_type == 'lead' else f"/accounts/{request.entity_id}"
            await notify_approver(
                approver,
                title=f"Expense approval needed: {entity_name}",
                body=f"{current_user.get('name', 'A team member')} submitted a {expense_label} of ₹{final_amount:,.0f} for {entity_name}. Your approval is required.",
                link=_entity_link,
                entity_type='expense_request',
                entity_id=expense_obj.id,
            )
        else:
            logger.warning(f"No approver could be resolved for expense {expense_obj.id} raised by {current_user.get('name')}")
    
    return {
        'id': expense_obj.id,
        'message': 'Expense request created' + (' and submitted for approval' if request.submit_for_approval else ''),
        'status': expense_obj.status
    }

@api_router.get("/expense-requests")
async def get_expense_requests(
    entity_type: Optional[str] = None,
    entity_id: Optional[str] = None,
    status: Optional[str] = None,
    current_user: dict = Depends(get_current_user)
):
    """Get expense requests, optionally filtered by entity"""
    
    query = {}
    
    # Filter by entity if provided
    if entity_type and entity_id:
        query['entity_type'] = entity_type
        query['entity_id'] = entity_id
    
    # Filter by status if provided
    if status:
        query['status'] = status
    
    # Non-directors can only see their own requests OR ones they must approve
    if current_user['role'] not in ['CEO', 'Director', 'Vice President', 'ceo', 'director', 'vp']:
        query['$or'] = [
            {'user_id': current_user['id']},
            {'approver_id': current_user['id']},
        ]
    
    expenses = await get_tdb().expense_requests.find(query, {'_id': 0}).sort('created_at', -1).to_list(500)
    
    return expenses

@api_router.get("/expense-requests/for-approver")
async def get_expense_requests_for_approver(
    status: Optional[str] = None,
    current_user: dict = Depends(get_current_user)
):
    """Get all expense requests relevant to approver (pending from reportees + previously acted upon)"""
    # Get users who report to current user
    reporters = await get_tdb().users.find({'reports_to': current_user['id']}, {'_id': 0, 'id': 1}).to_list(100)
    reporter_ids = [r['id'] for r in reporters]
    
    # Build query: requests from reportees OR approved/rejected by this user
    query = {
        '$or': [
            {'user_id': {'$in': reporter_ids}},  # From reportees
            {'approved_by': current_user['id']}   # Previously acted upon
        ]
    }
    
    if status and status != 'all':
        query['status'] = status
    
    expenses = await get_tdb().expense_requests.find(query, {'_id': 0}).sort('created_at', -1).to_list(1000)
    
    return expenses

@api_router.get("/expense-requests/{request_id}")
async def get_expense_request(request_id: str, current_user: dict = Depends(get_current_user)):
    """Get a single expense request"""
    
    expense = await get_tdb().expense_requests.find_one({'id': request_id}, {'_id': 0})
    if not expense:
        raise HTTPException(status_code=404, detail='Expense request not found')
    
    return expense

@api_router.put("/expense-requests/{request_id}")
async def update_expense_request(
    request_id: str,
    request: ExpenseRequestUpdate,
    current_user: dict = Depends(get_current_user)
):
    """Update an expense request"""
    
    expense_req = await get_tdb().expense_requests.find_one({'id': request_id}, {'_id': 0})
    if not expense_req:
        raise HTTPException(status_code=404, detail='Expense request not found')
    
    if expense_req['user_id'] != current_user['id']:
        raise HTTPException(status_code=403, detail='You can only update your own expense requests')
    
    if expense_req['status'] not in ['draft', 'rejected']:
        raise HTTPException(status_code=400, detail='Cannot update this expense request')
    
    update_data = {}
    
    if request.description is not None:
        update_data['description'] = request.description
    
    if request.amount is not None and expense_req['expense_type'] != 'free_trial':
        update_data['amount'] = request.amount
    
    if request.free_trial_days is not None and expense_req['expense_type'] == 'free_trial':
        update_data['free_trial_days'] = request.free_trial_days
    
    # Update SKU items for free trial
    if request.sku_items is not None and expense_req['expense_type'] == 'free_trial':
        entity_city = expense_req.get('entity_city')
        sku_items = []
        total_sku_cost = 0
        
        for item in request.sku_items:
            cogs_data = await get_tdb().cogs_data.find_one(
                {'city': entity_city, 'sku_name': item.get('sku_name')},
                {'_id': 0, 'minimum_landing_price': 1}
            )
            mlp = cogs_data.get('minimum_landing_price', 0) if cogs_data else 0
            quantity = item.get('quantity', 0)
            item_cost = mlp * quantity
            
            sku_items.append({
                'id': item.get('id', str(uuid.uuid4())),
                'sku_id': item.get('sku_id', ''),
                'sku_name': item.get('sku_name', ''),
                'quantity': quantity,
                'minimum_landing_price': mlp,
                'total_cost': item_cost
            })
            total_sku_cost += item_cost
        
        update_data['sku_items'] = sku_items
        update_data['total_sku_cost'] = total_sku_cost
        update_data['amount'] = total_sku_cost
    
    # Submit for approval
    if request.submit_for_approval:
        update_data['status'] = 'pending_approval'
        
        # Create approval task
        director = await get_tdb().users.find_one(
            {'role': {'$in': ['Director', 'director']}},
            {'_id': 0, 'id': 1, 'name': 1}
        )
        
        if director:
            expense_type_label = expense_req.get('expense_type_label', expense_req['expense_type'])
            entity_name = expense_req.get('entity_name', 'Unknown')
            final_amount = update_data.get('amount', expense_req.get('amount', 0))
            
            await create_approval_task(
                approval_type=ApprovalType.EXPENSE,
                requester_id=current_user['id'],
                requester_name=current_user.get('name', 'Unknown'),
                approver_id=director['id'],
                details=f"{expense_type_label} - {entity_name} (₹{final_amount:,.0f})",
                description=f"Expense request for {entity_name}:\n\nType: {expense_type_label}\nAmount: ₹{final_amount:,.0f}",
                reference_id=request_id,
                reference_type='expense_request'
            )
    
    update_data['updated_at'] = datetime.now(timezone.utc).isoformat()
    
    await get_tdb().expense_requests.update_one({'id': request_id}, {'$set': update_data})
    
    return {'message': 'Expense request updated'}

@api_router.put("/expense-requests/{request_id}/approve")
async def approve_expense_request(
    request_id: str,
    approval: ExpenseApproval,
    current_user: dict = Depends(get_current_user)
):
    """Approve or reject an expense request"""
    
    expense_req = await get_tdb().expense_requests.find_one({'id': request_id}, {'_id': 0})
    if not expense_req:
        raise HTTPException(status_code=404, detail='Expense request not found')
    
    # The designated approver (reporting manager) OR a senior approver can act.
    _senior_roles = ['CEO', 'Director', 'Vice President', 'Admin', 'System Admin', 'ceo', 'director', 'vp']
    if current_user['id'] != expense_req.get('approver_id') and current_user['role'] not in _senior_roles:
        raise HTTPException(status_code=403, detail='You are not authorized to approve this expense request')
    
    if expense_req['status'] != 'pending_approval':
        raise HTTPException(status_code=400, detail='Expense request is not pending approval')
    
    update_data = {
        'status': approval.status,
        'approved_by': current_user['id'],
        'approved_by_name': current_user.get('name'),
        'approval_date': datetime.now(timezone.utc).isoformat(),
        'updated_at': datetime.now(timezone.utc).isoformat()
    }
    
    if approval.status == 'rejected' and approval.rejection_reason:
        update_data['rejection_reason'] = approval.rejection_reason
    
    await get_tdb().expense_requests.update_one({'id': request_id}, {'$set': update_data})
    
    # Complete approval task
    await complete_approval_task(
        approval_type=ApprovalType.EXPENSE,
        reference_id=request_id,
        status='completed' if approval.status == 'approved' else 'cancelled'
    )
    
    # Notify the requester of the decision (best-effort)
    try:
        from utils.notify import notify_users
        _ent = expense_req.get('entity_name') or 'your request'
        _link = (f"/leads/{expense_req.get('entity_id')}" if expense_req.get('entity_type') == 'lead'
                 else f"/accounts/{expense_req.get('entity_id')}")
        _reason = f" Reason: {approval.rejection_reason}" if (approval.status == 'rejected' and approval.rejection_reason) else ''
        await notify_users(
            get_current_tenant_id(), [expense_req.get('user_id')],
            title=f"Expense {approval.status}: {_ent}",
            body=f"Your expense request for {_ent} was {approval.status} by {current_user.get('name')}.{_reason}",
            link=_link, kind='approval_decision',
            entity_type='expense_request', entity_id=request_id,
        )
    except Exception:
        logger.exception('notify requester (expense decision) failed')
    
    return {'message': f'Expense request {approval.status}'}

@api_router.get("/approvals/my-pending")
async def get_my_pending_approvals(current_user: dict = Depends(get_current_user)):
    """Approval tasks assigned to the current user that still need action.

    Powers the Home "Pending Approvals" card. Enriches each approval task with
    its underlying request (status + amount + entity) and drops any that have
    already been decided elsewhere.
    """
    tdb = get_tdb()
    tasks = await tdb.tasks.find(
        {
            'is_approval_task': True,
            'assigned_to': current_user['id'],
            'status': {'$in': ['pending', 'open', 'in_progress']},
        },
        {'_id': 0}
    ).sort('created_at', -1).to_list(200)

    coll_for_ref = {
        'expense_request': 'expense_requests',
        'travel_request': 'travel_requests',
        'budget_request': 'budget_requests',
        'leave_request': 'leave_requests',
    }
    out = []
    for t in tasks:
        ref_type = t.get('approval_reference_type')
        ref_id = t.get('approval_reference_id')
        amount = None
        entity_name = None
        decided = False

        if ref_type == 'proposal':
            # Proposals live in lead_proposals keyed by lead_id
            prop = await tdb.lead_proposals.find_one({'lead_id': ref_id}, {'_id': 0, 'status': 1})
            if not prop or prop.get('status') not in ('pending_review', 'revised'):
                decided = True
            else:
                lead = await tdb.leads.find_one({'id': ref_id}, {'_id': 0, 'company': 1, 'contact_person': 1})
                entity_name = (lead or {}).get('company') or (lead or {}).get('contact_person')
        elif ref_type == 'contract':
            # Contracts live in account_contracts, one per account, keyed by account_id
            contract = await tdb.account_contracts.find_one({'account_id': ref_id}, {'_id': 0, 'status': 1})
            if not contract or contract.get('status') not in ('pending_review', 'revised'):
                decided = True
            else:
                acct = await tdb.accounts.find_one(
                    {'$or': [{'account_id': ref_id}, {'id': ref_id}]},
                    {'_id': 0, 'company_name': 1, 'name': 1},
                )
                entity_name = (acct or {}).get('company_name') or (acct or {}).get('name')
        else:
            coll = coll_for_ref.get(ref_type)
            if coll and ref_id:
                req = await getattr(tdb, coll).find_one({'id': ref_id}, {'_id': 0})
                if req:
                    if req.get('status') not in ('pending_approval', 'pending'):
                        decided = True
                    else:
                        amount = req.get('amount') or req.get('total_amount') or req.get('tentative_budget')
                        entity_name = req.get('entity_name')

        if decided:
            # Self-heal: the underlying request was already approved/rejected, so
            # close the lingering approval task instead of showing it forever.
            await complete_approval_task(
                approval_type=t.get('approval_type'),
                reference_id=ref_id,
                status='completed',
            )
            continue

        out.append({
            'task_id': t.get('id'),
            'approval_type': t.get('approval_type'),
            'title': t.get('title'),
            'description': t.get('description'),
            'requester_name': t.get('created_by_name') or t.get('assigned_by_name'),
            'due_date': t.get('due_date'),
            'created_at': t.get('created_at'),
            'reference_type': ref_type,
            'reference_id': ref_id,
            'lead_id': t.get('lead_id'),
            'account_id': t.get('account_id'),
            'amount': amount,
            'entity_name': entity_name,
        })
    return out


@api_router.delete("/expense-requests/{request_id}")
async def delete_expense_request(request_id: str, current_user: dict = Depends(get_current_user)):
    """Delete/cancel an expense request"""
    
    expense_req = await get_tdb().expense_requests.find_one({'id': request_id}, {'_id': 0})
    if not expense_req:
        raise HTTPException(status_code=404, detail='Expense request not found')
    
    if expense_req['user_id'] != current_user['id']:
        raise HTTPException(status_code=403, detail='You can only delete your own expense requests')
    
    if expense_req['status'] in ['approved']:
        raise HTTPException(status_code=400, detail='Cannot delete approved expense requests')
    
    await get_tdb().expense_requests.update_one(
        {'id': request_id},
        {'$set': {
            'status': 'cancelled',
            'updated_at': datetime.now(timezone.utc).isoformat()
        }}
    )
    
    # Complete any pending approval tasks
    await complete_approval_task(
        approval_type=ApprovalType.EXPENSE,
        reference_id=request_id,
        status='cancelled'
    )
    
    return {'message': 'Expense request cancelled'}

@api_router.get("/cogs/sku-price/{city}/{sku_name}")
async def get_sku_price_for_city(city: str, sku_name: str, current_user: dict = Depends(get_current_user)):
    """Get minimum landing price for a SKU in a specific city"""
    
    cogs_data = await get_tdb().cogs_data.find_one(
        {'city': city, 'sku_name': sku_name},
        {'_id': 0, 'minimum_landing_price': 1, 'sku_name': 1, 'city': 1}
    )
    
    if not cogs_data:
        # Try to find default city pricing or return 0
        return {'minimum_landing_price': 0, 'sku_name': sku_name, 'city': city, 'found': False}
    
    return {**cogs_data, 'found': True}




# ============= FILES & DOCUMENTS MODULE =============

# Models
class DocumentCategory(BaseModel):
    """Category for organizing documents"""
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    name: str
    description: Optional[str] = None
    created_by: str
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    updated_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))

class DocumentSubCategory(BaseModel):
    """Sub-category under a category"""
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    category_id: str
    name: str
    description: Optional[str] = None
    created_by: str
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    updated_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))

class Document(BaseModel):
    """Document metadata"""
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    name: str
    category_id: str
    subcategory_id: Optional[str] = None
    document_type: str  # 'pdf', 'doc', 'docx', 'image'
    file_name: str
    file_size: int  # in bytes
    content_type: str
    file_data: str  # base64 encoded file
    uploaded_by: str
    uploaded_by_name: str
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))

# Key user roles that can manage categories
KEY_USER_ROLES = ['admin', 'Admin', 'CEO', 'Director']

def is_key_user(role: str) -> bool:
    """Check if user has key user (admin) privileges"""
    return role in KEY_USER_ROLES

# Category endpoints
@api_router.get("/document-categories")
async def get_document_categories(current_user: dict = Depends(get_current_user)):
    """Get all document categories"""
    categories = await db.document_categories.find({}, {'_id': 0}).sort('name', 1).to_list(100)
    return {'categories': categories}

@api_router.post("/document-categories")
async def create_document_category(data: dict, current_user: dict = Depends(get_current_user)):
    """Create a new document category (key users only)"""
    if not is_key_user(current_user['role']):
        raise HTTPException(status_code=403, detail='Only Admin, CEO, and Director can create categories')
    
    # Check for duplicate name
    existing = await db.document_categories.find_one({'name': {'$regex': f"^{data['name']}$", '$options': 'i'}})
    if existing:
        raise HTTPException(status_code=400, detail='Category with this name already exists')
    
    category = DocumentCategory(
        name=data['name'],
        description=data.get('description', ''),
        created_by=current_user['id']
    )
    
    doc = category.model_dump()
    doc['created_at'] = doc['created_at'].isoformat()
    doc['updated_at'] = doc['updated_at'].isoformat()
    
    await db.document_categories.insert_one(doc)
    
    return {'category': {k: v for k, v in doc.items() if k != '_id'}}

@api_router.put("/document-categories/{category_id}")
async def update_document_category(category_id: str, data: dict, current_user: dict = Depends(get_current_user)):
    """Update a document category (key users only)"""
    if not is_key_user(current_user['role']):
        raise HTTPException(status_code=403, detail='Only Admin, CEO, and Director can update categories')
    
    # Check if exists
    existing = await db.document_categories.find_one({'id': category_id})
    if not existing:
        raise HTTPException(status_code=404, detail='Category not found')
    
    # Check for duplicate name (excluding current)
    if 'name' in data:
        duplicate = await db.document_categories.find_one({
            'name': {'$regex': f"^{data['name']}$", '$options': 'i'},
            'id': {'$ne': category_id}
        })
        if duplicate:
            raise HTTPException(status_code=400, detail='Category with this name already exists')
    
    updates = {
        'updated_at': datetime.now(timezone.utc).isoformat()
    }
    if 'name' in data:
        updates['name'] = data['name']
    if 'description' in data:
        updates['description'] = data['description']
    
    await db.document_categories.update_one({'id': category_id}, {'$set': updates})
    
    return {'message': 'Category updated successfully'}

@api_router.delete("/document-categories/{category_id}")
async def delete_document_category(category_id: str, current_user: dict = Depends(get_current_user)):
    """Delete a document category (key users only)"""
    if not is_key_user(current_user['role']):
        raise HTTPException(status_code=403, detail='Only Admin, CEO, and Director can delete categories')
    
    # Check if has documents
    doc_count = await get_tdb().documents.count_documents({'category_id': category_id})
    if doc_count > 0:
        raise HTTPException(status_code=400, detail=f'Cannot delete category with {doc_count} document(s). Move or delete documents first.')
    
    # Delete subcategories first
    await db.document_subcategories.delete_many({'category_id': category_id})
    
    # Delete category
    result = await db.document_categories.delete_one({'id': category_id})
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail='Category not found')
    
    return {'message': 'Category and its subcategories deleted successfully'}

# SubCategory endpoints
@api_router.get("/document-subcategories")
async def get_document_subcategories(category_id: Optional[str] = None, current_user: dict = Depends(get_current_user)):
    """Get document subcategories, optionally filtered by category"""
    query = {}
    if category_id:
        query['category_id'] = category_id
    
    subcategories = await db.document_subcategories.find(query, {'_id': 0}).sort('name', 1).to_list(500)
    return {'subcategories': subcategories}

@api_router.post("/document-subcategories")
async def create_document_subcategory(data: dict, current_user: dict = Depends(get_current_user)):
    """Create a new document subcategory (key users only)"""
    if not is_key_user(current_user['role']):
        raise HTTPException(status_code=403, detail='Only Admin, CEO, and Director can create subcategories')
    
    # Verify category exists
    category = await db.document_categories.find_one({'id': data['category_id']})
    if not category:
        raise HTTPException(status_code=404, detail='Parent category not found')
    
    # Check for duplicate name within category
    existing = await db.document_subcategories.find_one({
        'category_id': data['category_id'],
        'name': {'$regex': f"^{data['name']}$", '$options': 'i'}
    })
    if existing:
        raise HTTPException(status_code=400, detail='Subcategory with this name already exists in this category')
    
    subcategory = DocumentSubCategory(
        category_id=data['category_id'],
        name=data['name'],
        description=data.get('description', ''),
        created_by=current_user['id']
    )
    
    doc = subcategory.model_dump()
    doc['created_at'] = doc['created_at'].isoformat()
    doc['updated_at'] = doc['updated_at'].isoformat()
    
    await db.document_subcategories.insert_one(doc)
    
    return {'subcategory': {k: v for k, v in doc.items() if k != '_id'}}

@api_router.put("/document-subcategories/{subcategory_id}")
async def update_document_subcategory(subcategory_id: str, data: dict, current_user: dict = Depends(get_current_user)):
    """Update a document subcategory (key users only)"""
    if not is_key_user(current_user['role']):
        raise HTTPException(status_code=403, detail='Only Admin, CEO, and Director can update subcategories')
    
    existing = await db.document_subcategories.find_one({'id': subcategory_id})
    if not existing:
        raise HTTPException(status_code=404, detail='Subcategory not found')
    
    # Check for duplicate name within category (excluding current)
    if 'name' in data:
        duplicate = await db.document_subcategories.find_one({
            'category_id': existing['category_id'],
            'name': {'$regex': f"^{data['name']}$", '$options': 'i'},
            'id': {'$ne': subcategory_id}
        })
        if duplicate:
            raise HTTPException(status_code=400, detail='Subcategory with this name already exists in this category')
    
    updates = {
        'updated_at': datetime.now(timezone.utc).isoformat()
    }
    if 'name' in data:
        updates['name'] = data['name']
    if 'description' in data:
        updates['description'] = data['description']
    
    await db.document_subcategories.update_one({'id': subcategory_id}, {'$set': updates})
    
    return {'message': 'Subcategory updated successfully'}

@api_router.delete("/document-subcategories/{subcategory_id}")
async def delete_document_subcategory(subcategory_id: str, current_user: dict = Depends(get_current_user)):
    """Delete a document subcategory (key users only)"""
    if not is_key_user(current_user['role']):
        raise HTTPException(status_code=403, detail='Only Admin, CEO, and Director can delete subcategories')
    
    # Check if has documents
    doc_count = await get_tdb().documents.count_documents({'subcategory_id': subcategory_id})
    if doc_count > 0:
        raise HTTPException(status_code=400, detail=f'Cannot delete subcategory with {doc_count} document(s). Move or delete documents first.')
    
    result = await db.document_subcategories.delete_one({'id': subcategory_id})
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail='Subcategory not found')
    
    return {'message': 'Subcategory deleted successfully'}

# Document endpoints
MAX_FILE_SIZE = 5 * 1024 * 1024  # 5 MB

ALLOWED_DOCUMENT_TYPES = {
    'application/pdf': 'pdf',
    'application/msword': 'doc',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document': 'docx',
    'image/png': 'image',
    'image/jpeg': 'image',
    'image/jpg': 'image',
    'image/gif': 'image',
    'image/webp': 'image'
}

@api_router.get("/documents")
async def get_documents(
    category_id: Optional[str] = None,
    subcategory_id: Optional[str] = None,
    current_user: dict = Depends(get_current_user)
):
    """Get documents filtered by category/subcategory"""
    query = {}
    if category_id:
        query['category_id'] = category_id
    if subcategory_id:
        query['subcategory_id'] = subcategory_id
    
    # Get all documents including file_data for preview
    documents = await get_tdb().documents.find(query, {'_id': 0}).sort('created_at', -1).to_list(1000)
    
    return {'documents': documents}

@api_router.post("/documents/upload")
async def upload_document(
    file: UploadFile = File(...),
    name: str = Form(None),
    category_id: str = Form(None),
    subcategory_id: str = Form(None),
    current_user: dict = Depends(get_current_user)
):
    """Upload a new document"""
    
    # Validate file type
    if file.content_type not in ALLOWED_DOCUMENT_TYPES:
        raise HTTPException(
            status_code=400, 
            detail='File type not allowed. Allowed types: PDF, DOC, DOCX, PNG, JPG, GIF, WEBP'
        )
    
    # Read file
    contents = await file.read()
    
    # Validate file size
    if len(contents) > MAX_FILE_SIZE:
        raise HTTPException(
            status_code=400, 
            detail=f'File size exceeds 5 MB limit. Your file is {round(len(contents) / (1024*1024), 2)} MB'
        )
    
    # Verify category exists
    if not category_id:
        raise HTTPException(status_code=400, detail='Category is required')
    
    category = await db.document_categories.find_one({'id': category_id})
    if not category:
        raise HTTPException(status_code=404, detail='Category not found')
    
    # Verify subcategory if provided
    if subcategory_id:
        subcategory = await db.document_subcategories.find_one({'id': subcategory_id, 'category_id': category_id})
        if not subcategory:
            raise HTTPException(status_code=404, detail='Subcategory not found in selected category')
    
    # Get document type
    doc_type = ALLOWED_DOCUMENT_TYPES[file.content_type]
    
    # Encode file to base64
    file_data = base64.b64encode(contents).decode('utf-8')
    
    # Create document record
    document = Document(
        name=name or file.filename,
        category_id=category_id,
        subcategory_id=subcategory_id,
        document_type=doc_type,
        file_name=file.filename,
        file_size=len(contents),
        content_type=file.content_type,
        file_data=file_data,
        uploaded_by=current_user['id'],
        uploaded_by_name=current_user['name']
    )
    
    doc = document.model_dump()
    doc['created_at'] = doc['created_at'].isoformat()
    
    await get_tdb().documents.insert_one(doc)
    
    # Return without file_data for response
    response = {k: v for k, v in doc.items() if k not in ['_id', 'file_data']}
    
    return {'document': response, 'message': 'Document uploaded successfully'}

@api_router.get("/documents/{document_id}")
async def get_document(document_id: str, current_user: dict = Depends(get_current_user)):
    """Get a single document with file data for download"""
    document = await get_tdb().documents.find_one({'id': document_id}, {'_id': 0})
    if not document:
        raise HTTPException(status_code=404, detail='Document not found')
    
    return {'document': document}

@api_router.get("/documents/{document_id}/download")
async def download_document(document_id: str, current_user: dict = Depends(get_current_user)):
    """Download a document file"""
    document = await get_tdb().documents.find_one({'id': document_id})
    if not document:
        raise HTTPException(status_code=404, detail='Document not found')
    
    file_data = document.get('file_data')
    if not file_data:
        raise HTTPException(status_code=404, detail='File data not found')
    
    # Decode base64
    import base64
    file_bytes = base64.b64decode(file_data)
    
    # Return file as response
    from fastapi.responses import Response
    return Response(
        content=file_bytes,
        media_type=document.get('content_type', 'application/octet-stream'),
        headers={
            'Content-Disposition': f'inline; filename="{document.get("file_name", "file")}"'
        }
    )

@api_router.delete("/documents/{document_id}")
async def delete_document(document_id: str, current_user: dict = Depends(get_current_user)):
    """Delete a document (uploader or key users only)"""
    document = await get_tdb().documents.find_one({'id': document_id})
    if not document:
        raise HTTPException(status_code=404, detail='Document not found')
    
    # Check permission: uploader or key user
    if document['uploaded_by'] != current_user['id'] and not is_key_user(current_user['role']):
        raise HTTPException(status_code=403, detail='Only the uploader, Admin, CEO, or Director can delete this document')
    
    await get_tdb().documents.delete_one({'id': document_id})
    
    return {'message': 'Document deleted successfully'}

# ============= PROPOSAL / CONTRACT SHARED CONSTANTS =============
# Lead proposal endpoints were extracted to routes/lead_proposals.py.
# These two constants stay because the Account Contract endpoints below reuse them.
ALLOWED_PROPOSAL_TYPES = {
    'application/pdf': 'pdf',
    'application/msword': 'doc',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document': 'docx'
}

MAX_PROPOSAL_SIZE = 5 * 1024 * 1024  # 5 MB

@api_router.get("/users/{user_id}/reporting-manager")
async def get_reporting_manager(user_id: str, current_user: dict = Depends(get_current_user)):
    """Get the reporting manager details for a user"""
    user = await get_tdb().users.find_one({'id': user_id}, {'_id': 0})
    if not user:
        raise HTTPException(status_code=404, detail='User not found')
    
    reports_to = user.get('reports_to')
    if not reports_to:
        return {'manager': None}
    
    manager = await get_tdb().users.find_one({'id': reports_to}, {'_id': 0, 'id': 1, 'name': 1, 'email': 1})
    return {'manager': manager}

# ============= ACCOUNT CONTRACT ENDPOINTS =============

class AccountContract(BaseModel):
    """Signed contract document for an account"""
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    account_id: str
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

CONTRACT_APPROVER_ROLES = ['ceo', 'CEO', 'director', 'Director', 'vp', 'Vice President', 'national_sales_head', 'National Sales Head', 'admin']

def can_approve_contract(role: str) -> bool:
    """Check if user role can approve/reject contracts"""
    return role in CONTRACT_APPROVER_ROLES

@api_router.get("/accounts/{account_id}/contract")
async def get_account_contract(account_id: str, current_user: dict = Depends(get_current_user)):
    """Get the current contract for an account"""
    # Verify account exists
    account = await get_tdb().accounts.find_one({'$or': [{'id': account_id}, {'account_id': account_id}]})
    if not account:
        raise HTTPException(status_code=404, detail='Account not found')
    
    actual_account_id = account.get('account_id', account_id)
    
    # Get contract without file_data for listing
    contract = await get_tdb().account_contracts.find_one(
        {'account_id': actual_account_id},
        {'_id': 0, 'file_data': 0}
    )
    
    if not contract:
        return {'contract': None}
    
    return {'contract': contract}

@api_router.post("/accounts/{account_id}/contract")
async def upload_account_contract(
    account_id: str,
    file: UploadFile = File(...),
    current_user: dict = Depends(get_current_user)
):
    """Upload a signed contract for an account (replaces existing)"""
    # Verify account exists
    account = await get_tdb().accounts.find_one({'$or': [{'id': account_id}, {'account_id': account_id}]})
    if not account:
        raise HTTPException(status_code=404, detail='Account not found')
    
    actual_account_id = account.get('account_id', account_id)
    
    # Validate file type
    if file.content_type not in ALLOWED_PROPOSAL_TYPES:
        raise HTTPException(
            status_code=400,
            detail='Only PDF and DOC/DOCX files are allowed for contracts'
        )
    
    # Read and validate file size
    contents = await file.read()
    if len(contents) > MAX_PROPOSAL_SIZE:
        raise HTTPException(
            status_code=400,
            detail=f'File size exceeds 5 MB limit. Your file is {round(len(contents) / (1024*1024), 2)} MB'
        )
    
    # Check if there's an existing contract
    existing = await get_tdb().account_contracts.find_one({'account_id': actual_account_id})
    version = 1
    
    if existing:
        version = existing.get('version', 1) + 1
        # Delete existing contract
        await get_tdb().account_contracts.delete_one({'account_id': actual_account_id})
    
    # Determine status for new/revised contract
    status = 'revised' if existing and existing.get('status') == 'changes_requested' else 'pending_review'
    
    # Create new contract
    contract = AccountContract(
        account_id=actual_account_id,
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
    
    doc = contract.model_dump()
    doc['uploaded_at'] = doc['uploaded_at'].isoformat()
    
    await get_tdb().account_contracts.insert_one(doc)
    
    # Create approval task for reporting manager
    reports_to = current_user.get('reports_to')
    if reports_to:
        account_name = account.get('company_name', account.get('name', 'Unknown Account'))
        await create_approval_task(
            approval_type=ApprovalType.CONTRACT,
            requester_id=current_user['id'],
            requester_name=current_user.get('name', 'Unknown'),
            approver_id=reports_to,
            details=f"{account_name} - {file.filename}",
            description=f"Contract uploaded by {current_user.get('name')} for review.\n\nAccount: {account_name}\nFile: {file.filename}\nVersion: {version}",
            reference_id=actual_account_id,
            reference_type='contract',
            account_id=actual_account_id
        )
    
    # Return without file_data
    response = {k: v for k, v in doc.items() if k not in ['_id', 'file_data']}
    
    return {'contract': response, 'message': f'Contract v{version} uploaded successfully'}

@api_router.get("/accounts/{account_id}/contract/download")
async def download_account_contract(account_id: str, current_user: dict = Depends(get_current_user)):
    """Download the contract document for an account"""
    account = await get_tdb().accounts.find_one({'$or': [{'id': account_id}, {'account_id': account_id}]})
    if not account:
        raise HTTPException(status_code=404, detail='Account not found')
    
    actual_account_id = account.get('account_id', account_id)
    
    contract = await get_tdb().account_contracts.find_one({'account_id': actual_account_id}, {'_id': 0})
    
    if not contract:
        raise HTTPException(status_code=404, detail='No contract found for this account')
    
    return {'contract': contract}

@api_router.delete("/accounts/{account_id}/contract")
async def delete_account_contract(account_id: str, current_user: dict = Depends(get_current_user)):
    """Delete a contract (only uploader and only when pending_review)"""
    account = await get_tdb().accounts.find_one({'$or': [{'id': account_id}, {'account_id': account_id}]})
    if not account:
        raise HTTPException(status_code=404, detail='Account not found')
    
    actual_account_id = account.get('account_id', account_id)
    
    contract = await get_tdb().account_contracts.find_one({'account_id': actual_account_id})
    
    if not contract:
        raise HTTPException(status_code=404, detail='No contract found for this account')
    
    # Check if user is the uploader
    if contract['uploaded_by'] != current_user['id']:
        raise HTTPException(status_code=403, detail='Only the uploader can delete this contract')
    
    # Check if status is pending_review
    if contract['status'] != 'pending_review':
        raise HTTPException(
            status_code=400,
            detail='Contract can only be deleted while in Pending Review status'
        )
    
    await get_tdb().account_contracts.delete_one({'account_id': actual_account_id})
    
    return {'message': 'Contract deleted successfully'}

@api_router.put("/accounts/{account_id}/contract/review")
async def review_account_contract(
    account_id: str,
    review_data: dict,
    current_user: dict = Depends(get_current_user)
):
    """Review a contract (approve, reject, or request changes)"""
    # Check if user can approve
    if not can_approve_contract(current_user['role']):
        raise HTTPException(
            status_code=403,
            detail='Only CEO, Director, VP, or National Sales Head can review contracts'
        )
    
    account = await get_tdb().accounts.find_one({'$or': [{'id': account_id}, {'account_id': account_id}]})
    if not account:
        raise HTTPException(status_code=404, detail='Account not found')
    
    actual_account_id = account.get('account_id', account_id)
    
    contract = await get_tdb().account_contracts.find_one({'account_id': actual_account_id})
    
    if not contract:
        raise HTTPException(status_code=404, detail='No contract found for this account')
    
    action = review_data.get('action')  # 'approved', 'rejected', 'changes_requested'
    comment = review_data.get('comment', '')
    
    if action not in ['approved', 'rejected', 'changes_requested']:
        raise HTTPException(status_code=400, detail='Invalid review action')
    
    # Create review comment
    review_comment = {
        'id': str(uuid.uuid4()),
        'reviewer_id': current_user['id'],
        'reviewer_name': current_user['name'],
        'action': action,
        'comment': comment,
        'created_at': datetime.now(timezone.utc).isoformat()
    }
    
    # Determine new status
    new_status = action  # 'approved', 'rejected', or 'changes_requested'
    
    # Update contract
    update_data = {
        'status': new_status,
        'reviewed_by': current_user['id'],
        'reviewed_by_name': current_user['name'],
        'reviewed_at': datetime.now(timezone.utc).isoformat()
    }
    
    await get_tdb().account_contracts.update_one(
        {'account_id': actual_account_id},
        {
            '$set': update_data,
            '$push': {'review_comments': review_comment}
        }
    )
    
    # Complete the approval task when reviewed
    if action in ['approved', 'rejected']:
        await complete_approval_task(
            approval_type=ApprovalType.CONTRACT,
            reference_id=actual_account_id,
            status='completed'
        )
    elif action == 'changes_requested':
        await complete_approval_task(
            approval_type=ApprovalType.CONTRACT,
            reference_id=actual_account_id,
            status='cancelled'
        )
    
    # Get updated contract
    updated = await get_tdb().account_contracts.find_one({'account_id': actual_account_id}, {'_id': 0, 'file_data': 0})
    
    return {'contract': updated, 'message': f'Contract {action.replace("_", " ")}'}

@app.on_event("startup")
async def init_master_locations_startup():
    """Kick off location seeding in the background so startup stays fast"""
    asyncio.create_task(_init_master_locations_async())


async def _init_master_locations_async():
    """Initialize default Indian territories, states, and cities (background task)"""
    try:
        # Check if territories already exist
        existing_count = await db.master_territories.count_documents({})
        if existing_count > 0:
            return  # Already initialized
    
        # Default territories
        territories_data = [
            {"name": "North India", "code": "north_india"},
            {"name": "South India", "code": "south_india"},
            {"name": "West India", "code": "west_india"},
            {"name": "East India", "code": "east_india"},
            {"name": "Central India", "code": "central_india"},
        ]
        
        territory_map = {}
        for t in territories_data:
            territory_id = str(uuid.uuid4())
            territory_map[t["code"]] = territory_id
            await db.master_territories.insert_one({
                "id": territory_id,
                "name": t["name"],
                "code": t["code"],
                "is_active": True,
                "created_at": datetime.now(timezone.utc).isoformat(),
                "updated_at": datetime.now(timezone.utc).isoformat()
            })
        
        # Default states by territory
        states_data = {
            "north_india": [
                {"name": "Delhi NCR", "code": "delhi_ncr"},
                {"name": "Uttar Pradesh", "code": "uttar_pradesh"},
                {"name": "Punjab", "code": "punjab"},
                {"name": "Haryana", "code": "haryana"},
                {"name": "Rajasthan", "code": "rajasthan"},
                {"name": "Himachal Pradesh", "code": "himachal_pradesh"},
                {"name": "Uttarakhand", "code": "uttarakhand"},
                {"name": "Jammu & Kashmir", "code": "jammu_kashmir"},
            ],
            "south_india": [
                {"name": "Karnataka", "code": "karnataka"},
                {"name": "Tamil Nadu", "code": "tamil_nadu"},
                {"name": "Kerala", "code": "kerala"},
                {"name": "Andhra Pradesh", "code": "andhra_pradesh"},
                {"name": "Telangana", "code": "telangana"},
            ],
            "west_india": [
                {"name": "Maharashtra", "code": "maharashtra"},
                {"name": "Gujarat", "code": "gujarat"},
                {"name": "Goa", "code": "goa"},
            ],
            "east_india": [
                {"name": "West Bengal", "code": "west_bengal"},
                {"name": "Bihar", "code": "bihar"},
                {"name": "Odisha", "code": "odisha"},
                {"name": "Jharkhand", "code": "jharkhand"},
                {"name": "Assam", "code": "assam"},
            ],
            "central_india": [
                {"name": "Madhya Pradesh", "code": "madhya_pradesh"},
                {"name": "Chhattisgarh", "code": "chhattisgarh"},
            ],
        }
        
        state_map = {}
        for territory_code, states in states_data.items():
            territory_id = territory_map[territory_code]
            for s in states:
                state_id = str(uuid.uuid4())
                state_map[s["code"]] = state_id
                await db.master_states.insert_one({
                    "id": state_id,
                    "name": s["name"],
                    "code": s["code"],
                    "territory_id": territory_id,
                    "is_active": True,
                    "created_at": datetime.now(timezone.utc).isoformat(),
                    "updated_at": datetime.now(timezone.utc).isoformat()
                })
        
        # Default cities by state
        cities_data = {
            "delhi_ncr": ["New Delhi", "Gurugram", "Noida", "Faridabad", "Ghaziabad"],
            "uttar_pradesh": ["Lucknow", "Kanpur", "Agra", "Varanasi", "Prayagraj", "Meerut"],
            "punjab": ["Chandigarh", "Ludhiana", "Amritsar", "Jalandhar", "Patiala"],
            "haryana": ["Gurugram", "Faridabad", "Panipat", "Ambala", "Karnal"],
            "rajasthan": ["Jaipur", "Jodhpur", "Udaipur", "Kota", "Ajmer"],
            "karnataka": ["Bengaluru", "Mysuru", "Hubli", "Mangaluru", "Belgaum"],
            "tamil_nadu": ["Chennai", "Coimbatore", "Madurai", "Tiruchirappalli", "Salem"],
            "kerala": ["Thiruvananthapuram", "Kochi", "Kozhikode", "Thrissur", "Kollam"],
            "andhra_pradesh": ["Visakhapatnam", "Vijayawada", "Guntur", "Nellore", "Tirupati"],
            "telangana": ["Hyderabad", "Warangal", "Nizamabad", "Karimnagar", "Khammam"],
            "maharashtra": ["Mumbai", "Pune", "Nagpur", "Nashik", "Aurangabad", "Thane"],
            "gujarat": ["Ahmedabad", "Surat", "Vadodara", "Rajkot", "Gandhinagar"],
            "goa": ["Panaji", "Margao", "Vasco da Gama"],
            "west_bengal": ["Kolkata", "Howrah", "Durgapur", "Asansol", "Siliguri"],
            "bihar": ["Patna", "Gaya", "Bhagalpur", "Muzaffarpur", "Darbhanga"],
            "odisha": ["Bhubaneswar", "Cuttack", "Rourkela", "Berhampur", "Sambalpur"],
            "madhya_pradesh": ["Bhopal", "Indore", "Jabalpur", "Gwalior", "Ujjain"],
            "chhattisgarh": ["Raipur", "Bhilai", "Bilaspur", "Korba", "Durg"],
        }
        
        for state_code, cities in cities_data.items():
            if state_code not in state_map:
                continue
            state_id = state_map[state_code]
            for city_name in cities:
                city_code = city_name.lower().replace(" ", "_").replace("'", "")
                await db.master_cities.insert_one({
                    "id": str(uuid.uuid4()),
                    "name": city_name,
                    "code": city_code,
                    "state_id": state_id,
                    "is_active": True,
                    "created_at": datetime.now(timezone.utc).isoformat(),
                    "updated_at": datetime.now(timezone.utc).isoformat()
                })
        
        logger.info("Master locations initialized with default Indian territories, states, and cities")
    except Exception as e:
        logger.warning(f"Failed to initialize master locations (non-blocking): {e}")

# ============= INCLUDE ROUTERS =============

# Include the modular routes (refactored endpoints)
# The modular routes are organized in /app/backend/routes/
# This includes: auth, leads, accounts, targets, tasks, meetings, users, requests
api_router.include_router(routes_router)

# Include the main api_router with all routes
app.include_router(api_router)

# CORS configuration - reads from environment variable for deployment flexibility
# When credentials are enabled, we cannot use wildcard '*' - must specify exact origins
cors_origins_env = os.environ.get('CORS_ORIGINS', '')

# Default allowed origins for production and development
default_origins = [
    'https://crm.nylaairwater.earth',
    'http://localhost:3000',
    'http://127.0.0.1:3000'
]

if cors_origins_env and cors_origins_env != '*':
    cors_origins = [origin.strip() for origin in cors_origins_env.split(',')]
else:
    cors_origins = list(default_origins)

# Regex to allow any subdomain under our known production/preview domains.
# This covers:
#   - https://*.emergent.host (Emergent native deployment URLs)
#   - https://*.emergentagent.com and https://crm-accounting-fix.preview.emergentagent.com (preview URLs)
#   - https://*.nylaairwater.earth (custom tenant domains)
#   - https://*.briefingiq.com (external integration partner)
cors_origin_regex = (
    r"https://([a-zA-Z0-9\-]+\.)*"
    r"(emergent\.host|emergentagent\.com|nylaairwater\.earth|briefingiq\.com)$"
)

app.add_middleware(
    CORSMiddleware,
    allow_credentials=True,
    allow_origins=cors_origins,
    allow_origin_regex=cors_origin_regex,
    allow_methods=["*"],
    allow_headers=["*"],
)


# ============= PUBLIC INTEGRATION CORS OVERRIDE =============
# External Invoice ingestion endpoints are intentionally open to ANY origin so
# third-party ERPs / browser-based integrations can POST / PUT invoices without
# being whitelisted. These endpoints do NOT use cookies — auth is via Bearer
# token — so allow_credentials is intentionally False here.
import re as _re
_PUBLIC_INVOICE_PATH = _re.compile(r"^/api/accounts/[^/]+/invoices(/[^/]+)?/?$")


@app.middleware("http")
async def _open_cors_for_external_invoices(request, call_next):
    path = request.url.path
    is_public = bool(_PUBLIC_INVOICE_PATH.match(path))

    if is_public and request.method == "OPTIONS":
        # Handle preflight ourselves so unknown origins are not blocked.
        from starlette.responses import Response
        req_headers = request.headers.get("access-control-request-headers", "*")
        return Response(
            status_code=204,
            headers={
                "Access-Control-Allow-Origin": request.headers.get("origin", "*"),
                "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
                "Access-Control-Allow-Headers": req_headers,
                "Access-Control-Max-Age": "86400",
                "Vary": "Origin",
            },
        )

    response = await call_next(request)
    if is_public:
        # Override any CORS headers set by the global CORSMiddleware so the
        # response is accepted by the browser regardless of origin.
        origin = request.headers.get("origin", "*")
        response.headers["Access-Control-Allow-Origin"] = origin
        response.headers["Access-Control-Allow-Methods"] = "GET, POST, PUT, DELETE, OPTIONS"
        response.headers["Access-Control-Allow-Headers"] = "*"
        response.headers["Access-Control-Expose-Headers"] = "*"
        response.headers["Vary"] = "Origin"
        # Browsers ignore credentials when '*' is used; never expose them here.
        if "access-control-allow-credentials" in response.headers:
            del response.headers["access-control-allow-credentials"]
    return response

logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)

# Import and start ActiveMQ subscriber
try:
    from mq_subscriber import start_mq_subscriber as _start_mq, stop_mq_subscriber as _stop_mq, mq_subscriber as _mq_sub
    MQ_AVAILABLE = True
    mq_subscriber = _mq_sub
    start_mq_subscriber = _start_mq
    stop_mq_subscriber = _stop_mq
except ImportError as e:
    logger.warning(f"ActiveMQ subscriber not available: {e}")

@app.on_event("startup")
async def startup_event():
    """Start ActiveMQ subscriber on app startup"""
    global MQ_AVAILABLE
    if MQ_AVAILABLE and start_mq_subscriber:
        try:
            start_mq_subscriber()
            logger.info("ActiveMQ subscriber started")
        except Exception as e:
            logger.error(f"Failed to start ActiveMQ subscriber: {e}")
            MQ_AVAILABLE = False
    # Ensure the accounting-transactions de-dup unique index exists from boot,
    # so the no-duplicate guarantee holds even before the first Zoho sync.
    try:
        from routes.accounting_transactions import ensure_indexes as _ensure_txn_indexes
        await _ensure_txn_indexes()
    except Exception as e:
        logger.error(f"Failed to ensure accounting_transactions indexes: {e}")

@app.on_event("shutdown")
async def shutdown_db_client():
    if MQ_AVAILABLE and stop_mq_subscriber:
        try:
            stop_mq_subscriber()
            logger.info("ActiveMQ subscriber stopped")
        except Exception as e:
            logger.error(f"Error stopping ActiveMQ subscriber: {e}")
    client.close()
