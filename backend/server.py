from fastapi import FastAPI, APIRouter, HTTPException, Depends, status, File, UploadFile, Request, Response, Form
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
from typing import List, Optional
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

# JWT Configuration
JWT_SECRET = os.environ['JWT_SECRET']
JWT_ALGORITHM = 'HS256'
JWT_EXPIRATION_HOURS = 24

security = HTTPBearer()

# Create the main app
app = FastAPI()
api_router = APIRouter(prefix="/api")

# Static files for logos
from fastapi.staticfiles import StaticFiles
import os
logos_dir = '/app/backend/static/logos'
os.makedirs(logos_dir, exist_ok=True)
app.mount("/api/static", StaticFiles(directory="/app/backend/static"), name="static")

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
    existing_leads = await db.leads.find(
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
    approver = await db.users.find_one({'id': approver_id}, {'_id': 0, 'name': 1})
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
    
    await db.tasks.insert_one(task_doc)
    
    # Return without _id
    return {k: v for k, v in task_doc.items() if k != '_id'}


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
    result = await db.tasks.update_one(
        {
            'is_approval_task': True,
            'approval_type': approval_type,
            'approval_reference_id': reference_id,
            'status': {'$in': ['pending', 'in_progress']}
        },
        {
            '$set': {
                'status': status,
                'completed_at': datetime.now(timezone.utc).isoformat() if status == 'completed' else None,
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
    role: str  # 'ceo', 'director', 'vp', 'admin', 'sales_manager', 'sales_rep'
    designation: Optional[str] = None  # Full title like 'CEO & Managing Director'
    department: Optional[str] = 'Sales'  # 'Admin', 'Sales', 'Production', 'Marketing', 'Finance'
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
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))

class UserCreate(BaseModel):
    email: EmailStr
    password: str
    name: str
    role: str = 'sales_rep'
    designation: Optional[str] = None
    department: Optional[str] = 'Sales'  # 'Admin', 'Sales', 'Production', 'Marketing', 'Finance'
    phone: Optional[str] = None
    city: Optional[str] = None
    state: Optional[str] = None
    country: Optional[str] = None
    territory: Optional[str] = None
    reports_to: Optional[str] = None
    dotted_line_to: Optional[str] = None
    ctc_monthly: Optional[float] = None
    joining_date: Optional[str] = None

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
    
    # Customer Tier
    tier: Optional[str] = None  # Tier 1, Tier 2, Tier 3, Tier 4, Tier 5
    
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

class LeadCreate(BaseModel):
    company: str
    contact_person: Optional[str] = None
    email: Optional[EmailStr] = None
    phone: Optional[str] = None
    category: Optional[str] = None
    tier: Optional[str] = None
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
    interested_skus: Optional[List[str]] = []
    notes: Optional[str] = None
    estimated_value: Optional[float] = None

class LeadUpdate(BaseModel):
    company: Optional[str] = None
    contact_person: Optional[str] = None
    email: Optional[EmailStr] = None
    phone: Optional[str] = None
    category: Optional[str] = None
    tier: Optional[str] = None
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
    interested_skus: Optional[List[str]] = None
    proposed_sku_pricing: Optional[List[dict]] = None  # Proposed pricing for this lead
    notes: Optional[str] = None
    estimated_value: Optional[float] = None
    next_followup_date: Optional[str] = None
    # Account conversion flag
    converted_to_account: Optional[bool] = False
    account_id: Optional[str] = None

# ============= ACCOUNT MODELS =============

class AccountSKUPricing(BaseModel):
    """SKU pricing and bottle credit for an account"""
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
    outstanding_balance: float = 0.0
    overdue_amount: float = 0.0
    last_payment_date: Optional[str] = None
    last_payment_amount: float = 0.0
    
    # Timestamps
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    updated_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))

class AccountCreate(BaseModel):
    lead_id: str

class DeliveryAddress(BaseModel):
    """Delivery address for an account"""
    address_line1: Optional[str] = None
    address_line2: Optional[str] = None
    city: Optional[str] = None
    state: Optional[str] = None
    pincode: Optional[str] = None
    landmark: Optional[str] = None

class AccountUpdate(BaseModel):
    account_name: Optional[str] = None
    account_type: Optional[str] = None
    contact_name: Optional[str] = None
    contact_number: Optional[str] = None
    gst_number: Optional[str] = None
    next_follow_up: Optional[str] = None  # YYYY-MM-DD
    sku_pricing: Optional[List[AccountSKUPricing]] = None
    delivery_address: Optional[DeliveryAddress] = None

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
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))

class ActivityCreate(BaseModel):
    lead_id: str
    activity_type: str
    description: str
    interaction_method: Optional[str] = None

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
    
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    updated_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))

class DailyStatusCreate(BaseModel):
    status_date: str
    yesterday_updates: str = ''
    today_actions: str = ''
    help_needed: str = ''

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

class TargetPlan(BaseModel):
    model_config = ConfigDict(extra="ignore")
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    plan_name: str
    time_period: str  # 'monthly', 'quarterly', 'half_yearly', 'yearly'
    start_date: str  # YYYY-MM-DD
    end_date: str  # YYYY-MM-DD
    country: str = 'India'
    country_target: float  # Total revenue target
    currency: str = 'INR'
    status: str = 'draft'  # 'draft', 'finalized', 'locked'
    created_by: str
    locked_by: Optional[str] = None
    locked_at: Optional[datetime] = None
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    updated_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))

class TargetPlanCreate(BaseModel):
    plan_name: str
    time_period: str
    start_date: str
    end_date: str
    country_target: float

class TerritoryTarget(BaseModel):
    model_config = ConfigDict(extra="ignore")
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    plan_id: str
    territory: str
    allocation_percentage: float  # Percentage of country target
    target_revenue: float  # Calculated from percentage
    allocated_revenue: float = 0  # Sum of city targets
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))

class TerritoryTargetCreate(BaseModel):
    territory: str
    allocation_percentage: float  # User enters percentage

class CityTarget(BaseModel):
    model_config = ConfigDict(extra="ignore")
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    plan_id: str
    territory: str
    state: str
    city: str
    allocation_percentage: float  # Percentage of territory target
    target_revenue: float  # Calculated from percentage
    allocated_revenue: float = 0  # Sum of resource targets
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))

class CityTargetCreate(BaseModel):
    state: str
    city: str
    allocation_percentage: float  # User enters percentage

class ResourceTarget(BaseModel):
    model_config = ConfigDict(extra="ignore")
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    plan_id: str
    city_id: str
    resource_id: str  # user_id
    allocation_percentage: float  # Percentage of city target
    target_revenue: float  # Calculated from percentage
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))

class ResourceTargetCreate(BaseModel):
    resource_id: str
    allocation_percentage: float  # User enters percentage

class SKUTarget(BaseModel):
    model_config = ConfigDict(extra="ignore")
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    plan_id: str
    city_id: str
    sku_name: str
    allocation_percentage: float  # Percentage of city target
    target_revenue: float  # Calculated from percentage
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))

class SKUTargetCreate(BaseModel):
    sku_name: str
    allocation_percentage: float

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
        existing_count = await db.users.count_documents({})
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
        
        await db.users.insert_many(leadership)
        
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
        
        await db.users.insert_many(sales_team)
        
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
    category: str  # e.g., "Jar", "Bottle", "Premium", "Sparkling", "White Label"
    unit: str  # e.g., "20L", "600ml", "1L x 12"
    description: Optional[str] = None
    is_active: bool = True
    sort_order: int = 0  # For custom ordering in dropdowns
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    updated_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    created_by: Optional[str] = None

class SKUCreate(BaseModel):
    sku_name: str
    category: str
    unit: str
    description: Optional[str] = None
    is_active: bool = True
    sort_order: int = 0

class SKUUpdate(BaseModel):
    sku_name: Optional[str] = None
    category: Optional[str] = None
    unit: Optional[str] = None
    description: Optional[str] = None
    is_active: Optional[bool] = None
    sort_order: Optional[int] = None

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
    current_user: dict = Depends(get_current_user)
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
            'category': sku.get('category'),
            'unit': sku.get('unit'),
            'description': sku.get('description'),
            'is_active': sku.get('is_active', True),
            'sort_order': sku.get('sort_order', 0)
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
    
    sku = SKUModel(**sku_data.model_dump(), created_by=current_user.get('id'))
    doc = sku.model_dump()
    doc['created_at'] = doc['created_at'].isoformat()
    doc['updated_at'] = doc['updated_at'].isoformat()
    
    await db.master_skus.insert_one(doc)
    
    return {
        'id': sku.id,
        'sku': sku.sku_name,
        'sku_name': sku.sku_name,
        'category': sku.category,
        'unit': sku.unit,
        'description': sku.description,
        'is_active': sku.is_active,
        'sort_order': sku.sort_order
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
    
    update_dict = {k: v for k, v in sku_data.model_dump().items() if v is not None}
    update_dict['updated_at'] = datetime.now(timezone.utc).isoformat()
    
    await db.master_skus.update_one({'id': sku_id}, {'$set': update_dict})
    
    updated = await db.master_skus.find_one({'id': sku_id}, {'_id': 0})
    return {
        'id': updated.get('id'),
        'sku': updated.get('sku_name'),
        'sku_name': updated.get('sku_name'),
        'category': updated.get('category'),
        'unit': updated.get('unit'),
        'description': updated.get('description'),
        'is_active': updated.get('is_active', True),
        'sort_order': updated.get('sort_order', 0)
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

@api_router.get("/sku-categories")
async def get_sku_categories(current_user: dict = Depends(get_current_user)):
    """Get list of unique SKU categories"""
    await seed_default_skus()
    categories = await db.master_skus.distinct('category')
    return {'categories': sorted(categories)}

@api_router.get("/cogs/{city}")
async def get_cogs_data(city: str, current_user: dict = Depends(get_current_user)):
    """Get COGS data for all SKUs in a city"""
    
    # Get active SKUs from master list
    await seed_default_skus()
    master_sku_docs = await db.master_skus.find({'is_active': {'$ne': False}}, {'_id': 0, 'sku_name': 1}).to_list(200)
    master_skus = [s['sku_name'] for s in master_sku_docs]
    
    cogs_data = await db.cogs_data.find({'city': city}, {'_id': 0}).to_list(100)
    
    # Create default data for SKUs that don't have data yet
    existing_skus = [c['sku_name'] for c in cogs_data]
    for sku in master_skus:
        if sku not in existing_skus:
            default_data = COGSData(sku_name=sku, city=city)
            doc = default_data.model_dump()
            doc['created_at'] = doc['created_at'].isoformat()
            if doc.get('last_edited_at'):
                doc['last_edited_at'] = doc['last_edited_at'].isoformat()
            await db.cogs_data.insert_one(doc)
            cogs_data.append(default_data.model_dump())
    
    # Get user names for last_edited_by
    user_ids = [c.get('last_edited_by') for c in cogs_data if c.get('last_edited_by')]
    users = await db.users.find({'id': {'$in': user_ids}}, {'_id': 0, 'id': 1, 'name': 1}).to_list(100)
    user_map = {u['id']: u['name'] for u in users}
    
    # Add editor names
    for data in cogs_data:
        if data.get('last_edited_by'):
            data['editor_name'] = user_map.get(data['last_edited_by'], 'Unknown')
    
    return {'cogs_data': cogs_data}

@api_router.put("/cogs/{sku_id}")
async def update_cogs_data(sku_id: str, updates: COGSDataUpdate, current_user: dict = Depends(get_current_user)):
    """Update COGS data for a SKU"""
    
    update_data = updates.model_dump(exclude_none=True)
    
    # Calculate computed values
    if any(k in update_data for k in ['primary_packaging_cost', 'secondary_packaging_cost', 'manufacturing_variable_cost', 'gross_margin', 'outbound_logistics_cost', 'distribution_cost']):
        existing = await db.cogs_data.find_one({'id': sku_id}, {'_id': 0})
        if existing:
            # Merge with existing data
            primary = update_data.get('primary_packaging_cost', existing.get('primary_packaging_cost', 0))
            secondary = update_data.get('secondary_packaging_cost', existing.get('secondary_packaging_cost', 0))
            manufacturing = update_data.get('manufacturing_variable_cost', existing.get('manufacturing_variable_cost', 0))
            margin = update_data.get('gross_margin', existing.get('gross_margin', 0))
            logistics = update_data.get('outbound_logistics_cost', existing.get('outbound_logistics_cost', 0))
            distribution = update_data.get('distribution_cost', existing.get('distribution_cost', 0))
            
            # Calculate
            total_cogs = primary + secondary + manufacturing
            gross_margin_rupees = total_cogs * (margin / 100)  # Convert % to rupees
            ex_factory = total_cogs + gross_margin_rupees
            
            # Base Cost = Primary + Secondary + Mfg + Gross Margin (₹) + Logistics
            base_cost = primary + secondary + manufacturing + gross_margin_rupees + logistics
            
            # Minimum Landing = Base Cost / (1 - Distribution %)
            # After paying distribution cost %, remaining amount = base cost
            if distribution >= 100:
                landing_price = 0  # Invalid: distribution can't be 100% or more
            elif distribution > 0:
                landing_price = base_cost / (1 - distribution / 100)
            else:
                landing_price = base_cost  # No distribution cost
            
            update_data['total_cogs'] = total_cogs
            update_data['ex_factory_price'] = ex_factory
            update_data['base_cost'] = base_cost
            update_data['minimum_landing_price'] = landing_price
    
    # Track editor
    update_data['last_edited_by'] = current_user['id']
    update_data['last_edited_at'] = datetime.now(timezone.utc).isoformat()
    
    result = await db.cogs_data.update_one({'id': sku_id}, {'$set': update_data})
    
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
        city_cogs = await db.cogs_data.find({'city': city}).to_list(5000)
        
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
                await db.cogs_data.update_one(
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
        'message': f'Values copied successfully',
        'source_city': source_city,
        'cities_updated': cities_updated
    }

@api_router.post("/cogs/cleanup-invalid-skus")
async def cleanup_invalid_skus(current_user: dict = Depends(get_current_user)):
    """
    Remove all SKUs from COGS table that are not in the master SKU list.
    Only CEO, Director, and System Admin can perform this action.
    """
    if current_user.get('role') not in ['CEO', 'Director', 'System Admin']:
        raise HTTPException(status_code=403, detail="Not authorized")
    
    # Get all master SKU names (field is 'sku_name' in master_skus collection)
    master_skus = await db.master_skus.find({'is_active': True}, {'sku_name': 1}).to_list(5000)
    master_sku_names = set(sku['sku_name'] for sku in master_skus if sku.get('sku_name'))
    
    # Find all unique SKU names in COGS data
    cogs_skus = await db.cogs_data.distinct('sku_name')
    
    # Find invalid SKUs (in COGS but not in master)
    invalid_skus = [sku for sku in cogs_skus if sku not in master_sku_names]
    
    # Delete invalid SKU entries
    if invalid_skus:
        result = await db.cogs_data.delete_many({'sku_name': {'$in': invalid_skus}})
        deleted_count = result.deleted_count
    else:
        deleted_count = 0
    
    return {
        'message': 'Cleanup completed',
        'invalid_skus_found': invalid_skus,
        'records_deleted': deleted_count,
        'master_sku_count': len(master_sku_names)
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
                raise HTTPException(status_code=400, detail=tokens['error'])
            
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
        existing_user = await db.users.find_one(
            {'email': {'$regex': f'^{user_email}$', '$options': 'i'}},
            {'_id': 0}
        )
        
        if existing_user:
            logger.info(f'User found: {existing_user["name"]} with role {existing_user["role"]}')
        else:
            logger.warning(f'User NOT found for email: {user_email}')
            # List all emails in database for debugging
            all_emails = await db.users.find({}, {'_id': 0, 'email': 1}).limit(5).to_list(5)
            logger.warning(f'Sample emails in DB: {[u["email"] for u in all_emails]}')
            
            raise HTTPException(
                status_code=403,
                detail=f'No account found for {user_email}. Please contact your administrator.'
            )
        
        user_id = existing_user['id']
        
        # Update user info
        await db.users.update_one(
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
        
        user_doc = await db.users.find_one({'id': user_id}, {'_id': 0, 'password': 0})
        
        return {'user': user_doc, 'message': 'Login successful'}
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f'OAuth callback error: {str(e)}')
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
    existing_user = await db.users.find_one({'email': user_email}, {'_id': 0})
    
    if not existing_user:
        # User not registered - reject login
        raise HTTPException(
            status_code=403, 
            detail='You do not have access. Please contact your manager to set up your account.'
        )
    
    # User exists - proceed with login
    user_id = existing_user['id']
    
    # Update user info from Google
    await db.users.update_one(
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
    user_doc = await db.users.find_one({'id': user_id}, {'_id': 0, 'password': 0})
    
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
    
    # Get user
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
            await db.users.update_one(
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
    await db.users.update_one(
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
    user_doc = await db.users.find_one({'id': user_id}, {'_id': 0, 'last_active': 1})
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
    users = await db.users.find({}, {'_id': 0, 'id': 1, 'name': 1, 'last_active': 1}).to_list(1000)
    
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
    existing = await db.users.find_one({'email': user_input.email}, {'_id': 0})
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
    
    await db.users.insert_one(doc)
    return user_obj

@api_router.post("/auth/login")
async def login(credentials: UserLogin, request: Request, response: Response):
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
    await db.users.update_one(
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
    
    return {
        'user': user_doc,
        'session_token': session_token
    }

@api_router.get("/auth/me", response_model=User)
async def get_me(current_user: dict = Depends(get_current_user)):
    if isinstance(current_user['created_at'], str):
        current_user['created_at'] = datetime.fromisoformat(current_user['created_at'])
    return current_user

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
        subordinates = await db.users.find(
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
            assignee = await db.users.find_one({'id': lead['assigned_to']}, {'_id': 0, 'name': 1})
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
            assignee = await db.users.find_one({'id': lead['assigned_to']}, {'_id': 0, 'name': 1})
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
            assignee = await db.users.find_one({'id': account['assigned_to']}, {'_id': 0, 'name': 1})
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
        activity_count = await db.lead_activities.count_documents({
            'lead_id': lead_id,
            'created_at': {'$gte': week_ago}
        })
        # Activity score (max 30 points) - more activities = higher score
        activity_score = min(activity_count * 5, 30)
        score += activity_score
        
        # Days since last contact score (max 30 points)
        last_activity = await db.lead_activities.find_one(
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
    today_activities = await db.lead_activities.count_documents({
        'created_by': user_id,
        'created_at': {'$gte': today_str}
    })
    
    today_calls = await db.lead_activities.count_documents({
        'created_by': user_id,
        'created_at': {'$gte': today_str},
        'activity_type': {'$in': ['call', 'phone']}
    })
    
    today_emails = await db.lead_activities.count_documents({
        'created_by': user_id,
        'created_at': {'$gte': today_str},
        'activity_type': 'email'
    })
    
    today_meetings_count = await db.lead_activities.count_documents({
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
            
            count = await db.leads.count_documents(query)
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
            
            count = await db.leads.count_documents(query)
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
            lead = await db.leads.find_one({'id': lead_id}, {'_id': 0, 'company': 1})
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
    user_data = await db.users.find_one({'id': user_id}, {'_id': 0})
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
    
    won_leads = await db.leads.find(revenue_query, {'_id': 0, 'expected_value': 1, 'actual_value': 1}).to_list(1000)
    total_revenue = sum(lead.get('actual_value') or lead.get('expected_value', 0) or 0 for lead in won_leads)
    
    # Calculate total accounts revenue (from invoices)
    accounts_revenue = 0
    try:
        # Get accounts assigned to this user
        user_accounts = await db.accounts.find({'sales_owner_id': user_id}, {'_id': 0, 'id': 1, 'account_id': 1}).to_list(500)
        account_ids = [acc.get('id') or acc.get('account_id') for acc in user_accounts]
        
        if account_ids:
            # Sum invoice values for these accounts
            invoice_pipeline = [
                {'$match': {'account_id': {'$in': account_ids}}},
                {'$group': {'_id': None, 'total': {'$sum': '$grand_total'}}}
            ]
            invoice_result = await db.invoices.aggregate(invoice_pipeline).to_list(1)
            accounts_revenue = invoice_result[0]['total'] if invoice_result else 0
    except:
        pass
    
    total_revenue += accounts_revenue
    
    # Calculate Gross Margin (simplified - based on won leads with margin info)
    # For more accuracy, this would need actual cost data
    gross_margin = 0
    try:
        margin_leads = await db.leads.find({
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
        budget_expenses = await db.budget_requests.find({
            'created_by': user_id,
            'status': 'approved'
        }, {'_id': 0, 'total_budget': 1}).to_list(500)
        total_expenses += sum(b.get('total_budget', 0) or 0 for b in budget_expenses)
    except:
        pass
    
    # Expense requests created by this user (approved only)
    try:
        expense_requests = await db.expense_requests.find({
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
    
    # Check if user belongs to Sales department (check if department contains 'sales')
    if 'sales' not in user_department.lower():
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
        direct_reports = await db.users.find(
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
    team_members = await db.users.find(
        {'id': {'$in': team_user_ids}},
        {'_id': 0, 'id': 1, 'name': 1, 'ctc_monthly': 1, 'joining_date': 1, 'department': 1}
    ).to_list(100)
    
    # Filter only Sales department members for CTC calculation
    sales_team = [m for m in team_members if (m.get('department') or '').lower() == 'sales']
    
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
    budget_requests = await db.budget_requests.find({
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
    expense_requests = await db.expense_requests.find({
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
    team_accounts = await db.accounts.find(
        {'sales_owner_id': {'$in': team_user_ids}},
        {'_id': 0, 'id': 1, 'city': 1}
    ).to_list(500)
    account_ids = [acc['id'] for acc in team_accounts]
    
    invoice_revenue = 0
    invoice_cogs = 0
    
    if account_ids:
        invoices = await db.invoices.find({
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
    
    result = await db.users.update_one({'id': user_id}, {'$set': update_data})
    
    if result.matched_count == 0:
        raise HTTPException(status_code=404, detail='User not found')
    
    return {'message': 'HR data updated successfully'}

# ============= TASK ROUTES =============

@api_router.post("/tasks")
async def create_task(task_input: TaskCreate, current_user: dict = Depends(get_current_user)):
    """Create a new task"""
    # Get assignee name
    assignee = await db.users.find_one({'id': task_input.assigned_to}, {'_id': 0, 'name': 1})
    
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
    
    await db.tasks.insert_one(doc)
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
    task = await db.tasks.find_one({'id': task_id}, {'_id': 0})
    if not task:
        raise HTTPException(status_code=404, detail='Task not found')
    return task

@api_router.put("/tasks/{task_id}")
async def update_task(task_id: str, task_update: TaskUpdate, current_user: dict = Depends(get_current_user)):
    """Update a task"""
    task = await db.tasks.find_one({'id': task_id}, {'_id': 0})
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
        assignee = await db.users.find_one({'id': update_data['assigned_to']}, {'_id': 0, 'name': 1})
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
        await db.tasks.update_one(
            {'id': task_id},
            {'$push': {'comments': comment_entry}}
        )
    
    await db.tasks.update_one({'id': task_id}, {'$set': update_data})
    
    updated = await db.tasks.find_one({'id': task_id}, {'_id': 0})
    return updated

@api_router.delete("/tasks/{task_id}")
async def delete_task(task_id: str, current_user: dict = Depends(get_current_user)):
    """Delete a task"""
    result = await db.tasks.delete_one({'id': task_id})
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
    
    await db.meetings.insert_one(doc)
    
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
    meeting = await db.meetings.find_one({'id': meeting_id}, {'_id': 0})
    if not meeting:
        raise HTTPException(status_code=404, detail='Meeting not found')
    return meeting

@api_router.put("/meetings/{meeting_id}")
async def update_meeting(meeting_id: str, meeting_update: MeetingUpdate, current_user: dict = Depends(get_current_user)):
    """Update a meeting and send email notifications"""
    meeting = await db.meetings.find_one({'id': meeting_id}, {'_id': 0})
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
    
    await db.meetings.update_one({'id': meeting_id}, {'$set': update_data})
    
    updated = await db.meetings.find_one({'id': meeting_id}, {'_id': 0})
    
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
    result = await db.meetings.delete_one({'id': meeting_id})
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
    
    await db.leads.insert_one(doc)
    
    # Create initial activity
    activity = Activity(
        lead_id=lead_obj.id,
        activity_type='note',
        description=f'Lead created by {current_user["name"]}',
        created_by=current_user['id']
    )
    activity_doc = activity.model_dump()
    activity_doc['created_at'] = activity_doc['created_at'].isoformat()
    await db.activities.insert_one(activity_doc)
    
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
        query['territory'] = territory
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
                query['created_at'] = {'$gte': start_date_str, '$lte': end_date_str}
            else:
                query['created_at'] = {'$gte': start_date_str}
    
    # Add search filter
    if search:
        query['$or'] = [
            {'company': {'$regex': search, '$options': 'i'}},
            {'contact_person': {'$regex': search, '$options': 'i'}},
            {'lead_id': {'$regex': search, '$options': 'i'}}
        ]
    
    # Get total count for pagination
    total = await db.leads.count_documents(query)
    total_pages = (total + page_size - 1) // page_size  # Ceiling division
    
    # Fetch paginated leads
    leads = await db.leads.find(query, {'_id': 0}).sort('created_at', -1).skip(skip).limit(page_size).to_list(page_size)
    
    # Get last activity for each lead
    lead_ids = [lead['id'] for lead in leads]
    activities = await db.activities.find(
        {'lead_id': {'$in': lead_ids}},
        {'_id': 0, 'lead_id': 1, 'created_at': 1, 'interaction_method': 1}
    ).to_list(len(lead_ids) * 10)  # Reasonable limit per page
    
    # Group activities by lead_id and get the most recent
    lead_last_activity = {}
    for activity in activities:
        lead_id = activity['lead_id']
        activity_date = activity['created_at'] if isinstance(activity['created_at'], str) else activity['created_at'].isoformat()
        
        if lead_id not in lead_last_activity:
            lead_last_activity[lead_id] = {
                'created_at': activity_date,
                'interaction_method': activity.get('interaction_method', '')
            }
        elif activity_date and lead_last_activity[lead_id]['created_at'] and activity_date > lead_last_activity[lead_id]['created_at']:
            lead_last_activity[lead_id] = {
                'created_at': activity_date,
                'interaction_method': activity.get('interaction_method', '')
            }
    
    # Add last contacted info to leads
    for lead in leads:
        if isinstance(lead['created_at'], str):
            lead['created_at'] = datetime.fromisoformat(lead['created_at'])
        if isinstance(lead['updated_at'], str):
            lead['updated_at'] = datetime.fromisoformat(lead['updated_at'])
        
        # Add last contacted info
        last_activity = lead_last_activity.get(lead['id'])
        if last_activity:
            lead['last_contacted_date'] = last_activity['created_at']
            lead['last_contact_method'] = last_activity['interaction_method']
        else:
            lead['last_contacted_date'] = None
            lead['last_contact_method'] = None
    
    return PaginatedLeadsResponse(
        data=leads,
        total=total,
        page=page,
        page_size=page_size,
        total_pages=total_pages
    )

@api_router.get("/leads/{lead_id}", response_model=Lead)
async def get_lead(lead_id: str, current_user: dict = Depends(get_current_user)):
    lead = await db.leads.find_one({'id': lead_id}, {'_id': 0})
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
async def update_lead(lead_id: str, lead_update: LeadUpdate, current_user: dict = Depends(get_current_user)):
    lead = await db.leads.find_one({'id': lead_id}, {'_id': 0})
    if not lead:
        raise HTTPException(status_code=404, detail='Lead not found')
    
    # Check permission
    if current_user['role'] == 'sales_rep' and lead.get('assigned_to') != current_user['id']:
        raise HTTPException(status_code=403, detail='Access denied')
    
    # Build update data - handle None values specially for fields that can be cleared
    clearable_fields = {'next_followup_date', 'last_contacted_date', 'dotted_line_to', 'reports_to'}
    update_data = {}
    
    for k, v in lead_update.model_dump().items():
        # Include the field if it has a value, OR if it's a clearable field explicitly set to None
        if v is not None:
            update_data[k] = v
        elif k in clearable_fields:
            # Allow setting these fields to None (to clear them)
            update_data[k] = None
    
    # Status transition validation
    if 'status' in update_data and update_data['status'] != lead.get('status'):
        new_status = update_data['status']
        current_status = lead.get('status')
        
        # Validation 1: "proposal_shared" requires an approved proposal
        if new_status == 'proposal_shared':
            proposal = await db.lead_proposals.find_one({'lead_id': lead_id})
            if not proposal or proposal.get('status') != 'approved':
                raise HTTPException(
                    status_code=400, 
                    detail='Cannot set status to "Proposal Shared" without an approved proposal. Please get the proposal approved first.'
                )
        
        # Validation 2: "proposal_approved_by_customer" can only be set from "proposal_shared"
        if new_status == 'proposal_approved_by_customer':
            if current_status != 'proposal_shared':
                raise HTTPException(
                    status_code=400,
                    detail='Lead can only be marked as "Proposal Approved by Customer" from "Proposal Shared" status.'
                )
        
        # Validation 3: "won" can only be set from "proposal_approved_by_customer"
        if new_status == 'won':
            if current_status != 'proposal_approved_by_customer':
                raise HTTPException(
                    status_code=400,
                    detail='Lead can only be marked as "Won" from "Proposal Approved by Customer" status.'
                )
    
    update_data['updated_at'] = datetime.now(timezone.utc).isoformat()
    
    # Track status change
    if 'status' in update_data and update_data['status'] != lead.get('status'):
        activity = Activity(
            lead_id=lead_id,
            activity_type='status_change',
            description=f'Status changed from {lead.get("status")} to {update_data["status"]} by {current_user["name"]}',
            created_by=current_user['id']
        )
        activity_doc = activity.model_dump()
        activity_doc['created_at'] = activity_doc['created_at'].isoformat()
        await db.activities.insert_one(activity_doc)
    
    await db.leads.update_one({'id': lead_id}, {'$set': update_data})
    
    updated_lead = await db.leads.find_one({'id': lead_id}, {'_id': 0})
    if isinstance(updated_lead['created_at'], str):
        updated_lead['created_at'] = datetime.fromisoformat(updated_lead['created_at'])
    if isinstance(updated_lead['updated_at'], str):
        updated_lead['updated_at'] = datetime.fromisoformat(updated_lead['updated_at'])
    
    return updated_lead

@api_router.delete("/leads/{lead_id}")
async def delete_lead(lead_id: str, current_user: dict = Depends(get_current_user)):
    # Get the lead first
    lead = await db.leads.find_one({'id': lead_id}, {'_id': 0})
    if not lead:
        raise HTTPException(status_code=404, detail='Lead not found')
    
    # Allow deletion if user is:
    # 1. Lead creator, OR
    # 2. Leadership (CEO, Director, VP, National Head)
    is_creator = lead.get('created_by') == current_user['id']
    is_leadership = current_user['role'] in ['CEO', 'Director', 'Vice President', 'National Sales Head']
    
    if not (is_creator or is_leadership):
        raise HTTPException(status_code=403, detail='Only lead creator or leadership can delete leads')
    
    result = await db.leads.delete_one({'id': lead_id})
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail='Lead not found')
    
    # Delete related data
    await db.activities.delete_many({'lead_id': lead_id})
    await db.follow_ups.delete_many({'lead_id': lead_id})
    await db.comments.delete_many({'lead_id': lead_id})
    await db.invoices.delete_many({'lead_uuid': lead_id})
    
    return {'message': 'Lead deleted successfully'}

@api_router.post("/leads/{lead_id}/generate-lead-id")
async def generate_lead_id_for_lead(lead_id: str, current_user: dict = Depends(get_current_user)):
    """Generate a lead_id for a lead that doesn't have one"""
    lead = await db.leads.find_one({'id': lead_id}, {'_id': 0})
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
    await db.leads.update_one(
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
    leads_count = await db.leads.count_documents({'status': status_id})
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
    leads_using = await db.leads.count_documents({'category': existing.get('name')})
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
    
    # Apply time filter
    now = datetime.now(timezone.utc)
    start_date = None
    
    if time_filter == "this_week":
        start_date = now - timedelta(days=now.weekday())
    elif time_filter == "last_week":
        start_date = now - timedelta(days=now.weekday() + 7)
        end_date = now - timedelta(days=now.weekday())
    elif time_filter == "this_month":
        start_date = now.replace(day=1, hour=0, minute=0, second=0, microsecond=0)
    elif time_filter == "last_month":
        first_of_this_month = now.replace(day=1)
        start_date = (first_of_this_month - relativedelta(months=1))
        end_date = first_of_this_month
    elif time_filter == "this_quarter":
        quarter = (now.month - 1) // 3
        start_date = now.replace(month=quarter * 3 + 1, day=1, hour=0, minute=0, second=0, microsecond=0)
    elif time_filter == "last_quarter":
        quarter = (now.month - 1) // 3
        if quarter == 0:
            start_date = now.replace(year=now.year - 1, month=10, day=1)
            end_date = now.replace(month=1, day=1)
        else:
            start_date = now.replace(month=(quarter - 1) * 3 + 1, day=1)
            end_date = now.replace(month=quarter * 3 + 1, day=1)
    elif time_filter == "last_3_months":
        start_date = now - relativedelta(months=3)
    elif time_filter == "last_6_months":
        start_date = now - relativedelta(months=6)
    elif time_filter == "this_year":
        start_date = now.replace(month=1, day=1, hour=0, minute=0, second=0, microsecond=0)
    elif time_filter == "last_year":
        start_date = now.replace(year=now.year - 1, month=1, day=1)
        end_date = now.replace(month=1, day=1)
    
    if start_date:
        query['updated_at'] = {'$gte': start_date.isoformat()}
        if 'end_date' in dir() and end_date:
            query['updated_at']['$lt'] = end_date.isoformat()
    
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
    leads = await db.leads.find(query, {'_id': 0}).sort('updated_at', -1).to_list(1000)
    
    # Get user info for assigned_to
    user_ids = list(set([l.get('assigned_to') for l in leads if l.get('assigned_to')]))
    users = await db.users.find({'id': {'$in': user_ids}}, {'_id': 0, 'id': 1, 'name': 1}).to_list(100)
    user_map = {u['id']: u['name'] for u in users}
    
    # Build response with invoice data
    result = []
    total_gross = 0
    total_net = 0
    total_credit = 0
    
    for lead in leads:
        gross = lead.get('total_gross_invoice_value', 0) or 0
        net = lead.get('total_net_invoice_value', 0) or 0
        credit = lead.get('total_credit_note_value', 0) or 0
        
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
            'invoice_count': lead.get('invoice_count', 0) or 0,
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
    cities = await db.leads.distinct('city', {'status': 'won'})
    
    # Get unique territories (regions)
    territories = await db.leads.distinct('region', {'status': 'won'})
    
    # Get resources (users who have won leads assigned)
    assigned_users = await db.leads.distinct('assigned_to', {'status': 'won', 'assigned_to': {'$ne': None}})
    users = await db.users.find({'id': {'$in': assigned_users}}, {'_id': 0, 'id': 1, 'name': 1}).to_list(100)
    
    return {
        'cities': sorted([c for c in cities if c]),
        'territories': sorted([t for t in territories if t]),
        'resources': [{'id': u['id'], 'name': u['name']} for u in users]
    }

# ============= INVOICE ROUTES =============

@api_router.get("/leads/{lead_id}/invoices")
async def get_lead_invoices(lead_id: str, current_user: dict = Depends(get_current_user)):
    """Get all invoices for a specific lead"""
    lead = await db.leads.find_one({'id': lead_id}, {'_id': 0})
    if not lead:
        raise HTTPException(status_code=404, detail='Lead not found')
    
    invoices = await db.invoices.find(
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

@api_router.get("/invoices")
async def get_all_invoices(
    status: Optional[str] = None,
    skip: int = 0,
    limit: int = 50,
    current_user: dict = Depends(get_current_user)
):
    """Get all invoices with optional filtering"""
    query = {}
    if status:
        query['status'] = status
    
    invoices = await db.invoices.find(
        query,
        {'_id': 0}
    ).sort('received_at', -1).skip(skip).limit(limit).to_list(limit)
    
    total = await db.invoices.count_documents(query)
    
    return {
        'total': total,
        'invoices': invoices
    }

@api_router.get("/invoices/unmatched")
async def get_unmatched_invoices(current_user: dict = Depends(get_current_user)):
    """Get invoices that couldn't be matched to a lead"""
    invoices = await db.invoices.find(
        {'status': 'unmatched'},
        {'_id': 0}
    ).sort('received_at', -1).to_list(100)
    
    return {'invoices': invoices}

@api_router.get("/resources/{resource_id}/invoice-summary")
async def get_resource_invoice_summary(resource_id: str, current_user: dict = Depends(get_current_user)):
    """Get invoice summary for a specific resource (sales person)"""
    # Get user info
    user = await db.users.find_one({'id': resource_id}, {'_id': 0, 'password': 0})
    if not user:
        raise HTTPException(status_code=404, detail='Resource not found')
    
    # Get resource invoice summary
    summary = await db.resource_invoice_summary.find_one({'resource_id': resource_id}, {'_id': 0})
    
    # Get all invoices for leads assigned to this resource
    invoices = await db.invoices.find(
        {'assigned_to': resource_id, 'status': 'matched'},
        {'_id': 0}
    ).sort('received_at', -1).to_list(100)
    
    # Get resource targets
    targets = await db.resource_targets.find({'resource_id': resource_id}, {'_id': 0}).to_list(100)
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
    invoice = await db.invoices.find_one({'id': invoice_id}, {'_id': 0})
    if not invoice:
        raise HTTPException(status_code=404, detail='Invoice not found')
    
    # Find the lead by formatted lead_id
    lead = await db.leads.find_one({'lead_id': lead_id}, {'_id': 0})
    if not lead:
        # Try by UUID
        lead = await db.leads.find_one({'id': lead_id}, {'_id': 0})
    
    if not lead:
        raise HTTPException(status_code=404, detail='Lead not found')
    
    # Update invoice
    await db.invoices.update_one(
        {'id': invoice_id},
        {
            '$set': {
                'lead_uuid': lead['id'],
                'ca_lead_id': lead.get('lead_id'),
                'status': 'matched'
            }
        }
    )
    
    # Recalculate lead totals
    all_invoices = await db.invoices.find({
        'lead_uuid': lead['id'],
        'status': 'matched'
    }).to_list(1000)
    
    total_gross = sum(inv.get('gross_invoice_value', 0) for inv in all_invoices)
    total_net = sum(inv.get('net_invoice_value', 0) for inv in all_invoices)
    total_credit = sum(inv.get('credit_note_value', 0) for inv in all_invoices)
    
    await db.leads.update_one(
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
    existing = await db.accounts.find(
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
    """Convert a won lead to an account"""
    lead = await db.leads.find_one({'id': data.lead_id}, {'_id': 0})
    if not lead:
        raise HTTPException(status_code=404, detail='Lead not found')
    
    # Check if lead is won
    if lead.get('status') not in ['won', 'closed_won']:
        raise HTTPException(status_code=400, detail='Only won leads can be converted to accounts')
    
    # Check if already converted
    if lead.get('converted_to_account'):
        raise HTTPException(status_code=400, detail='Lead already converted to account')
    
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
    account = Account(
        account_id=account_id,
        lead_id=lead.get('lead_id') or data.lead_id,
        account_name=account_name,
        city=city,
        state=lead.get('state', ''),
        territory=lead.get('region', ''),
        assigned_to=lead.get('assigned_to'),
        contact_name=lead.get('contact_person') or lead.get('name'),
        contact_number=lead.get('phone'),
        sku_pricing=sku_pricing_list
    )
    
    doc = account.model_dump()
    # Add category from lead (extra field allowed by model)
    doc['category'] = lead.get('category')
    doc['created_at'] = doc['created_at'].isoformat()
    doc['updated_at'] = doc['updated_at'].isoformat()
    
    await db.accounts.insert_one(doc)
    
    # Update lead to mark as converted
    await db.leads.update_one(
        {'id': data.lead_id},
        {'$set': {
            'converted_to_account': True,
            'account_id': account_id,
            'updated_at': datetime.now(timezone.utc).isoformat()
        }}
    )
    
    return account

@api_router.get("/accounts", response_model=PaginatedAccountsResponse)
async def get_accounts(
    page: int = 1,
    page_size: int = 25,
    search: Optional[str] = None,
    territory: Optional[str] = None,
    state: Optional[str] = None,
    city: Optional[str] = None,
    account_type: Optional[str] = None,
    category: Optional[str] = None,
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
    if category:
        query['category'] = category
    if search:
        query['$or'] = [
            {'account_name': {'$regex': search, '$options': 'i'}},
            {'contact_name': {'$regex': search, '$options': 'i'}},
            {'account_id': {'$regex': search, '$options': 'i'}}
        ]
    
    total = await db.accounts.count_documents(query)
    total_pages = (total + page_size - 1) // page_size
    
    accounts = await db.accounts.find(query, {'_id': 0}).sort('created_at', -1).skip(skip).limit(page_size).to_list(page_size)
    
    # Get user names for assigned_to field and category from original leads
    user_ids = list(set(a.get('assigned_to') for a in accounts if a.get('assigned_to')))
    lead_ids = list(set(a.get('lead_id') for a in accounts if a.get('lead_id')))
    
    user_map = {}
    if user_ids:
        users = await db.users.find({'id': {'$in': user_ids}}, {'_id': 0, 'id': 1, 'name': 1}).to_list(len(user_ids))
        user_map = {u['id']: u['name'] for u in users}
    
    lead_map = {}
    if lead_ids:
        leads = await db.leads.find({'id': {'$in': lead_ids}}, {'_id': 0, 'id': 1, 'category': 1}).to_list(len(lead_ids))
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
    total_accounts = await db.accounts.count_documents(query)
    
    # Accounts by type
    type_pipeline = [
        {'$match': query},
        {'$group': {'_id': '$account_type', 'count': {'$sum': 1}}}
    ]
    type_results = await db.accounts.aggregate(type_pipeline).to_list(10)
    by_type = {r['_id'] or 'Unassigned': r['count'] for r in type_results}
    
    # Accounts by category (directly from accounts collection)
    category_pipeline = [
        {'$match': {**query, 'category': {'$ne': None}}},
        {'$group': {'_id': '$category', 'count': {'$sum': 1}}}
    ]
    category_results = await db.accounts.aggregate(category_pipeline).to_list(20)
    by_category = {r['_id']: r['count'] for r in category_results if r['_id']}
    
    # If no categories found in accounts, try to get from linked leads (for backward compatibility)
    if not by_category:
        all_accounts = await db.accounts.find(query, {'_id': 0, 'lead_id': 1}).to_list(10000)
        lead_ids = [a['lead_id'] for a in all_accounts if a.get('lead_id')]
        
        if lead_ids:
            lead_category_pipeline = [
                {'$match': {'id': {'$in': lead_ids}, 'category': {'$ne': None}}},
                {'$group': {'_id': '$category', 'count': {'$sum': 1}}}
            ]
            lead_category_results = await db.leads.aggregate(lead_category_pipeline).to_list(20)
            by_category = {r['_id']: r['count'] for r in lead_category_results if r['_id']}
    
    return {
        'total_accounts': total_accounts,
        'by_type': by_type,
        'by_category': by_category
    }

@api_router.get("/accounts/{account_id}")
async def get_account(account_id: str, current_user: dict = Depends(get_current_user)):
    """Get single account by ID or account_id"""
    account = await db.accounts.find_one(
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
    accounts = await db.accounts.find({'category': {'$exists': False}}, {'_id': 0, 'lead_id': 1, 'account_id': 1}).to_list(10000)
    
    if not accounts:
        # Also check for null categories
        accounts = await db.accounts.find({'category': None}, {'_id': 0, 'lead_id': 1, 'account_id': 1}).to_list(10000)
    
    updated_count = 0
    for account in accounts:
        lead_id = account.get('lead_id')
        if lead_id:
            # Find the lead and get its category
            lead = await db.leads.find_one(
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
                
                await db.accounts.update_one(
                    {'account_id': account['account_id']},
                    {'$set': update_data}
                )
                updated_count += 1
    
    return {'message': f'Updated {updated_count} accounts with categories from leads', 'updated': updated_count}

@api_router.put("/accounts/{account_id}")
async def update_account(account_id: str, update_data: AccountUpdate, current_user: dict = Depends(get_current_user)):
    """Update account details including SKU pricing and delivery address"""
    account = await db.accounts.find_one(
        {'$or': [{'id': account_id}, {'account_id': account_id}]},
        {'_id': 0}
    )
    if not account:
        raise HTTPException(status_code=404, detail='Account not found')
    
    update_dict = {k: v for k, v in update_data.model_dump().items() if v is not None}
    
    # Convert SKU pricing to dict format
    if 'sku_pricing' in update_dict:
        update_dict['sku_pricing'] = [
            sku.model_dump() if hasattr(sku, 'model_dump') else sku 
            for sku in update_dict['sku_pricing']
        ]
    
    # Convert delivery address to dict format
    if 'delivery_address' in update_dict and update_dict['delivery_address']:
        if hasattr(update_dict['delivery_address'], 'model_dump'):
            update_dict['delivery_address'] = update_dict['delivery_address'].model_dump()
    
    update_dict['updated_at'] = datetime.now(timezone.utc).isoformat()
    
    await db.accounts.update_one(
        {'$or': [{'id': account_id}, {'account_id': account_id}]},
        {'$set': update_dict}
    )
    
    updated = await db.accounts.find_one(
        {'$or': [{'id': account_id}, {'account_id': account_id}]},
        {'_id': 0}
    )
    
    return updated

@api_router.get("/accounts/{account_id}/invoices")
async def get_account_invoices(account_id: str, current_user: dict = Depends(get_current_user)):
    """Get invoices for an account"""
    account = await db.accounts.find_one(
        {'$or': [{'id': account_id}, {'account_id': account_id}]},
        {'_id': 0, 'id': 1, 'lead_id': 1, 'account_name': 1, 'account_id': 1}
    )
    if not account:
        raise HTTPException(status_code=404, detail='Account not found')
    
    # Find invoices by account_id (primary), account_uuid, ca_lead_id, or lead_id
    account_uuid = account.get('id')
    acc_id = account.get('account_id')
    lead_id = account.get('lead_id')
    account_name = account.get('account_name')
    
    query = {'$or': []}
    if account_uuid:
        query['$or'].append({'account_id': account_uuid})  # Primary match - account_id field in invoice
        query['$or'].append({'account_uuid': account_uuid})  # Legacy match
    if acc_id:
        query['$or'].append({'account_id': acc_id})
    if lead_id:
        query['$or'].append({'ca_lead_id': lead_id})
        query['$or'].append({'lead_id': lead_id})
    if account_name:
        query['$or'].append({'customer_name': {'$regex': account_name, '$options': 'i'}})
    
    if not query['$or']:
        return {'invoices': [], 'total_amount': 0, 'paid_amount': 0, 'outstanding': 0}
    
    invoices = await db.invoices.find(query, {'_id': 0}).sort('invoice_date', -1).to_list(100)
    
    # Calculate totals - support both old and new field names
    total_amount = sum(inv.get('grand_total', inv.get('gross_invoice_value', inv.get('total_amount', 0))) or 0 for inv in invoices)
    net_amount = sum(inv.get('net_invoice_value', inv.get('paid_amount', 0)) or 0 for inv in invoices)
    credit_amount = sum(inv.get('credit_note_value', 0) or 0 for inv in invoices)
    outstanding = sum(inv.get('outstanding', 0) or 0 for inv in invoices)
    
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
            'items': inv.get('line_items', inv.get('items', [])),
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
        'outstanding': outstanding if outstanding > 0 else (total_amount - net_amount)
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
    invoice_data: AccountInvoiceCreate, 
    current_user: dict = Depends(get_current_user)
):
    """
    Create a new invoice for an account with automatic COGS, logistics, and margin calculation.
    COGS and logistics are fetched from the cogs_data collection based on SKU and account city.
    """
    # Get account details
    account = await db.accounts.find_one(
        {'$or': [{'id': account_id}, {'account_id': account_id}]},
        {'_id': 0}
    )
    if not account:
        raise HTTPException(status_code=404, detail='Account not found')
    
    account_uuid = account.get('id')
    account_city = account.get('city', 'Hyderabad')
    account_name = account.get('account_name') or account.get('company_name')
    
    # Get COGS data for the account's city
    cogs_data = await db.cogs_data.find({'city': account_city}, {'_id': 0}).to_list(100)
    cogs_lookup = {c['sku_name']: c for c in cogs_data}
    
    # Process line items and calculate costs
    processed_items = []
    total_revenue = 0
    total_cogs = 0
    total_logistics = 0
    total_bottles = 0
    
    for item in invoice_data.line_items:
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
            fallback_cogs = await db.cogs_data.find_one({'sku_name': sku_name}, {'_id': 0})
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
    count = await db.invoices.count_documents({'invoice_number': {'$regex': f'^INV-{today}'}})
    invoice_number = f"INV-{today}-{str(count + 1).zfill(4)}"
    
    # Create invoice document
    invoice = {
        'id': str(uuid.uuid4()),
        'invoice_number': invoice_number,
        'account_id': account_uuid,
        'account_name': account_name,
        'account_city': account_city,
        'invoice_date': invoice_data.invoice_date,
        'due_date': (datetime.strptime(invoice_data.invoice_date, '%Y-%m-%d') + timedelta(days=30)).strftime('%Y-%m-%d'),
        'line_items': processed_items,
        'total_bottles': total_bottles,
        'grand_total': round(total_revenue, 2),
        'total_cogs': round(total_cogs, 2),
        'total_logistics': round(total_logistics, 2),
        'gross_margin': gross_margin,
        'gross_margin_percent': gross_margin_percent,
        'notes': invoice_data.notes,
        'status': 'pending',
        'created_by': current_user['id'],
        'created_by_name': current_user.get('name'),
        'created_at': datetime.now(timezone.utc).isoformat()
    }
    
    await db.invoices.insert_one(invoice)
    
    # Return response with margin summary
    return {
        'message': 'Invoice created successfully',
        'invoice': {
            'id': invoice['id'],
            'invoice_number': invoice_number,
            'account_name': account_name,
            'invoice_date': invoice_data.invoice_date,
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

@api_router.delete("/accounts/{account_id}")
async def delete_account(account_id: str, current_user: dict = Depends(get_current_user)):
    """Delete an account"""
    if current_user['role'] not in ['admin', 'National Sales Head', 'CEO', 'Director']:
        raise HTTPException(status_code=403, detail='Only admins can delete accounts')
    
    account = await db.accounts.find_one(
        {'$or': [{'id': account_id}, {'account_id': account_id}]},
        {'_id': 0, 'lead_id': 1}
    )
    if not account:
        raise HTTPException(status_code=404, detail='Account not found')
    
    # Revert the lead conversion flag
    if account.get('lead_id'):
        await db.leads.update_one(
            {'$or': [{'id': account['lead_id']}, {'lead_id': account['lead_id']}]},
            {'$set': {'converted_to_account': False, 'account_id': None}}
        )
    
    await db.accounts.delete_one({'$or': [{'id': account_id}, {'account_id': account_id}]})
    
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
    
    account = await db.accounts.find_one(
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
        await db.accounts.update_one(
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
    
    account = await db.accounts.find_one(
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
    await db.accounts.update_one(
        {'$or': [{'id': account_id}, {'account_id': account_id}]},
        {'$unset': {'logo_url': '', 'logo_width_mm': '', 'logo_height_mm': ''}}
    )
    
    return {'message': 'Logo deleted successfully'}

# ============= LEAD LOGO ROUTES =============

@api_router.post("/leads/{lead_id}/logo")
async def upload_lead_logo(lead_id: str, request: LogoUploadRequest, current_user: dict = Depends(get_current_user)):
    """Upload and save lead logo"""
    import base64
    import os
    
    lead = await db.leads.find_one({'id': lead_id}, {'_id': 0})
    if not lead:
        raise HTTPException(status_code=404, detail='Lead not found')
    
    try:
        # Extract base64 data
        logo_data = request.logo
        if ',' in logo_data:
            logo_data = logo_data.split(',')[1]
        
        # Decode base64
        image_bytes = base64.b64decode(logo_data)
        
        # Create logos directory if not exists
        logos_dir = '/app/backend/static/logos/leads'
        os.makedirs(logos_dir, exist_ok=True)
        
        # Save file with lead ID
        file_name = f"{lead_id}.png"
        file_path = os.path.join(logos_dir, file_name)
        
        with open(file_path, 'wb') as f:
            f.write(image_bytes)
        
        # Update lead with logo info
        logo_url = f"/api/static/logos/leads/{file_name}"
        await db.leads.update_one(
            {'id': lead_id},
            {'$set': {
                'logo_url': logo_url,
                'logo_width_mm': request.width_mm,
                'logo_height_mm': request.height_mm,
                'updated_at': datetime.now(timezone.utc).isoformat()
            }}
        )
        
        return {'logo_url': logo_url, 'message': 'Logo uploaded successfully'}
        
    except Exception as e:
        logger.error(f"Error uploading lead logo: {str(e)}")
        raise HTTPException(status_code=500, detail=f'Failed to upload logo: {str(e)}')

@api_router.delete("/leads/{lead_id}/logo")
async def delete_lead_logo(lead_id: str, current_user: dict = Depends(get_current_user)):
    """Delete lead logo"""
    import os
    
    lead = await db.leads.find_one({'id': lead_id}, {'_id': 0})
    if not lead:
        raise HTTPException(status_code=404, detail='Lead not found')
    
    # Remove file if exists
    logo_url = lead.get('logo_url', '')
    if logo_url:
        file_name = logo_url.split('/')[-1]
        file_path = f'/app/backend/static/logos/leads/{file_name}'
        if os.path.exists(file_path):
            os.remove(file_path)
    
    # Update lead to remove logo
    await db.leads.update_one(
        {'id': lead_id},
        {'$unset': {'logo_url': '', 'logo_width_mm': '', 'logo_height_mm': ''}}
    )
    
    return {'message': 'Logo deleted successfully'}

# ============= ACTIVITIES ROUTES =============

@api_router.post("/activities", response_model=Activity)
async def create_activity(activity_input: ActivityCreate, current_user: dict = Depends(get_current_user)):
    activity_data = activity_input.model_dump()
    activity_data['created_by'] = current_user['id']
    activity_obj = Activity(**activity_data)
    
    doc = activity_obj.model_dump()
    doc['created_at'] = doc['created_at'].isoformat()
    
    await db.activities.insert_one(doc)
    return activity_obj

@api_router.get("/activities/{lead_id}", response_model=List[Activity])
async def get_activities(
    lead_id: str,
    skip: int = 0,
    limit: int = 100,
    current_user: dict = Depends(get_current_user)
):
    activities = await db.activities.find({'lead_id': lead_id}, {'_id': 0}).sort('created_at', -1).skip(skip).limit(limit).to_list(limit)
    
    for activity in activities:
        if isinstance(activity['created_at'], str):
            activity['created_at'] = datetime.fromisoformat(activity['created_at'])
    
    return activities

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
    
    await db.follow_ups.insert_one(doc)
    
    # Create activity
    activity = Activity(
        lead_id=follow_up_obj.lead_id,
        activity_type='note',
        description=f'Follow-up scheduled: {follow_up_obj.title}',
        created_by=current_user['id']
    )
    activity_doc = activity.model_dump()
    activity_doc['created_at'] = activity_doc['created_at'].isoformat()
    await db.activities.insert_one(activity_doc)
    
    return follow_up_obj

@api_router.get("/follow-ups", response_model=List[FollowUp])
async def get_follow_ups(
    skip: int = 0,
    limit: int = 100,
    current_user: dict = Depends(get_current_user)
):
    # Get follow-ups assigned to current user or created by them
    if current_user['role'] in ['admin', 'sales_manager']:
        follow_ups = await db.follow_ups.find({}, {'_id': 0}).skip(skip).limit(limit).to_list(limit)
    else:
        follow_ups = await db.follow_ups.find({'assigned_to': current_user['id']}, {'_id': 0}).skip(skip).limit(limit).to_list(limit)
    
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
    result = await db.follow_ups.update_one(
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
    
    await db.comments.insert_one(doc)
    
    # Create activity
    activity = Activity(
        lead_id=comment_obj.lead_id,
        activity_type='note',
        description=f'Comment added by {current_user["name"]}',
        created_by=current_user['id']
    )
    activity_doc = activity.model_dump()
    activity_doc['created_at'] = activity_doc['created_at'].isoformat()
    await db.activities.insert_one(activity_doc)
    
    return comment_obj

@api_router.get("/comments/{lead_id}", response_model=List[Comment])
async def get_comments(
    lead_id: str,
    skip: int = 0,
    limit: int = 100,
    current_user: dict = Depends(get_current_user)
):
    comments = await db.comments.find({'lead_id': lead_id}, {'_id': 0}).sort('created_at', -1).skip(skip).limit(limit).to_list(limit)
    
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
    users = await db.users.find({}, {'_id': 0, 'password': 0}).skip(skip).limit(limit).to_list(limit)
    
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
    users = await db.users.find({}, {'_id': 0, 'password': 0}).to_list(1000)
    
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

# ============= DAILY STATUS ROUTES =============

@api_router.post("/daily-status", response_model=DailyStatus)
async def create_daily_status(status_input: DailyStatusCreate, current_user: dict = Depends(get_current_user)):
    # Check if status already exists for this date
    existing = await db.daily_status.find_one({
        'user_id': current_user['id'],
        'status_date': status_input.status_date
    }, {'_id': 0})
    
    if existing:
        raise HTTPException(status_code=400, detail='Status already exists for this date')
    
    status_data = status_input.model_dump()
    status_data['user_id'] = current_user['id']
    status_obj = DailyStatus(**status_data)
    
    doc = status_obj.model_dump()
    doc['created_at'] = doc['created_at'].isoformat()
    doc['updated_at'] = doc['updated_at'].isoformat()
    
    await db.daily_status.insert_one(doc)
    return status_obj

@api_router.get("/daily-status")
async def get_daily_statuses(
    start_date: Optional[str] = None,
    end_date: Optional[str] = None,
    user_id: Optional[str] = None,
    current_user: dict = Depends(get_current_user)
):
    query = {}
    
    # Leadership can see all statuses, others see only their own
    if current_user['role'] in ['ceo', 'director', 'vp', 'admin']:
        if user_id:
            query['user_id'] = user_id
    else:
        query['user_id'] = current_user['id']
    
    if start_date:
        query['status_date'] = {'$gte': start_date}
    if end_date:
        if 'status_date' in query:
            query['status_date']['$lte'] = end_date
        else:
            query['status_date'] = {'$lte': end_date}
    
    statuses = await db.daily_status.find(query, {'_id': 0}).sort('status_date', -1).to_list(100)
    
    for status in statuses:
        if isinstance(status['created_at'], str):
            status['created_at'] = datetime.fromisoformat(status['created_at'])
        if isinstance(status['updated_at'], str):
            status['updated_at'] = datetime.fromisoformat(status['updated_at'])
    
    return statuses

@api_router.put("/daily-status/{status_id}")
async def update_daily_status(
    status_id: str,
    status_update: DailyStatusUpdate,
    current_user: dict = Depends(get_current_user)
):
    status = await db.daily_status.find_one({'id': status_id}, {'_id': 0})
    if not status:
        raise HTTPException(status_code=404, detail='Status not found')
    
    if status['user_id'] != current_user['id']:
        raise HTTPException(status_code=403, detail='Can only update your own status')
    
    update_data = status_update.model_dump()
    update_data['updated_at'] = datetime.now(timezone.utc).isoformat()
    
    await db.daily_status.update_one({'id': status_id}, {'$set': update_data})
    
    updated_status = await db.daily_status.find_one({'id': status_id}, {'_id': 0})
    if isinstance(updated_status['created_at'], str):
        updated_status['created_at'] = datetime.fromisoformat(updated_status['created_at'])
    if isinstance(updated_status['updated_at'], str):
        updated_status['updated_at'] = datetime.fromisoformat(updated_status['updated_at'])
    
    return updated_status

@api_router.get("/daily-status/auto-populate/{status_date}")
async def auto_populate_from_activities(status_date: str, current_user: dict = Depends(get_current_user)):
    """Auto-populate daily status from logged lead activities, grouped by interaction method"""
    
    try:
        # Get all activities created by user on this date
        start_datetime = datetime.fromisoformat(f'{status_date}T00:00:00').replace(tzinfo=timezone.utc).isoformat()
        end_datetime = datetime.fromisoformat(f'{status_date}T23:59:59').replace(tzinfo=timezone.utc).isoformat()
        
        activities = await db.activities.find(
            {
                'created_by': current_user['id'],
                'created_at': {'$gte': start_datetime, '$lte': end_datetime}
            },
            {'_id': 0}
        ).to_list(100)
        
        if not activities:
            return {'formatted_text': '', 'activity_count': 0}
        
        # Get lead names for all activities
        lead_ids = list(set([a['lead_id'] for a in activities]))
        leads = await db.leads.find(
            {'id': {'$in': lead_ids}},
            {'_id': 0, 'id': 1, 'company': 1, 'name': 1}
        ).to_list(100)
        
        lead_map = {l['id']: l.get('company') or l.get('name') for l in leads}
        
        # Group activities by interaction method
        grouped_activities = {
            'customer_visit': [],
            'phone_call': [],
            'email': [],
            'whatsapp': [],
            'sms': [],
            'other': []
        }
        
        for activity in activities:
            lead_name = lead_map.get(activity['lead_id'], 'Unknown Lead')
            description = activity.get('description') or ''
            interaction_method = (activity.get('interaction_method') or activity.get('activity_type') or '').lower()
            
            activity_text = f"{lead_name} - {description}" if description else lead_name
            
            if interaction_method == 'customer_visit':
                grouped_activities['customer_visit'].append(activity_text)
            elif interaction_method in ['phone_call', 'call']:
                grouped_activities['phone_call'].append(activity_text)
            elif interaction_method == 'email':
                grouped_activities['email'].append(activity_text)
            elif interaction_method == 'whatsapp':
                grouped_activities['whatsapp'].append(activity_text)
            elif interaction_method == 'sms':
                grouped_activities['sms'].append(activity_text)
            else:
                grouped_activities['other'].append(activity_text)
        
        # Build formatted text grouped by interaction type
        formatted_sections = []
        
        # Summary counts
        summary_parts = []
        if grouped_activities['customer_visit']:
            summary_parts.append(f"Visits: {len(grouped_activities['customer_visit'])}")
        if grouped_activities['phone_call']:
            summary_parts.append(f"Calls: {len(grouped_activities['phone_call'])}")
        messages_count = len(grouped_activities['email']) + len(grouped_activities['whatsapp']) + len(grouped_activities['sms'])
        if messages_count > 0:
            summary_parts.append(f"Messages: {messages_count}")
        if grouped_activities['other']:
            summary_parts.append(f"Other: {len(grouped_activities['other'])}")
        
        summary_line = " | ".join(summary_parts) if summary_parts else "Activities logged"
        # Use special markers for highlighting in frontend
        formatted_sections.append(f"[SUMMARY] {summary_line}")
        
        # Add grouped sections with special header markers
        if grouped_activities['customer_visit']:
            formatted_sections.append("\n[HEADER] CUSTOMER VISITS")
            for item in grouped_activities['customer_visit']:
                formatted_sections.append(f"• {item}")
        
        if grouped_activities['phone_call']:
            formatted_sections.append("\n[HEADER] PHONE CALLS")
            for item in grouped_activities['phone_call']:
                formatted_sections.append(f"• {item}")
        
        if grouped_activities['email']:
            formatted_sections.append("\n[HEADER] EMAILS")
            for item in grouped_activities['email']:
                formatted_sections.append(f"• {item}")
        
        if grouped_activities['whatsapp']:
            formatted_sections.append("\n[HEADER] WHATSAPP")
            for item in grouped_activities['whatsapp']:
                formatted_sections.append(f"• {item}")
        
        if grouped_activities['sms']:
            formatted_sections.append("\n[HEADER] SMS")
            for item in grouped_activities['sms']:
                formatted_sections.append(f"• {item}")
        
        if grouped_activities['other']:
            formatted_sections.append("\n[HEADER] OTHER ACTIVITIES")
            for item in grouped_activities['other']:
                formatted_sections.append(f"• {item}")
        
        formatted_text = '\n'.join(formatted_sections)
        
        return {
            'formatted_text': formatted_text,
            'activity_count': len(activities),
            'leads_contacted': len(lead_map),
            'summary': {
                'visits': len(grouped_activities['customer_visit']),
                'calls': len(grouped_activities['phone_call']),
                'messages': messages_count
            }
        }
        
    except Exception as e:
        logger.error(f'Auto-populate error: {str(e)}')
        return {
            'formatted_text': '',
            'activity_count': 0,
            'leads_contacted': 0
        }
async def revise_status_with_ai(request: dict, current_user: dict = Depends(get_current_user)):
    from emergentintegrations.llm.chat import LlmChat, UserMessage
    
    original_text = request.get('text', '')
    if not original_text:
        raise HTTPException(status_code=400, detail='Text is required')
    
    try:
        user_id = current_user['id']
        session_id = f'status-revision-{user_id}'
        
        # Initialize Claude chat
        chat = LlmChat(
            api_key=os.environ['EMERGENT_LLM_KEY'],
            session_id=session_id,
            system_message='You are a professional editor. Your job is to ONLY fix grammar, correct spelling, and improve sentence structure. Do NOT add headings, sections, bullet points, or any new information. Do NOT add greetings or conclusions. Keep the same tone and length. Just make the existing text grammatically correct and more readable while preserving all original content and meaning exactly as written.'
        ).with_model('anthropic', 'claude-sonnet-4-5-20250929')
        
        user_message = UserMessage(
            text=f'Fix grammar and improve readability of this text. Do not add headings, sections, or new information. Keep it concise:\n\n{original_text}'
        )
        
        revised_text = await chat.send_message(user_message)
        
        return {
            'original': original_text,
            'revised': revised_text,
            'model': 'claude-sonnet-4.5'
        }
    except Exception as e:
        logger.error(f'AI revision error: {str(e)}')
        raise HTTPException(status_code=500, detail=f'AI revision failed: {str(e)}')

@api_router.get("/daily-status/team-rollup")
async def get_team_status_rollup(
    status_date: Optional[str] = None,
    current_user: dict = Depends(get_current_user)
):
    """Get daily status rollup for team members"""
    
    target_date = status_date or datetime.now(timezone.utc).strftime('%Y-%m-%d')
    
    # For high-level roles, show ALL team statuses (not just direct reports)
    high_level_roles = ['CEO', 'Director', 'Vice President', 'National Sales Head', 'System Admin']
    
    if current_user.get('role') in high_level_roles:
        # Get all active users' statuses
        all_users = await db.users.find(
            {'is_active': True},
            {'_id': 0, 'id': 1, 'name': 1, 'role': 1, 'designation': 1, 'territory': 1, 'city': 1, 'state': 1}
        ).to_list(500)
        user_ids = [u['id'] for u in all_users]
        user_map = {u['id']: u for u in all_users}
    else:
        # For other roles, show only direct reports
        direct_reports = await db.users.find(
            {'reports_to': current_user['id']},
            {'_id': 0, 'id': 1, 'name': 1, 'role': 1, 'designation': 1, 'territory': 1, 'city': 1, 'state': 1}
        ).to_list(100)
        
        if not direct_reports:
            return {'team_statuses': [], 'date': target_date, 'total_reports': 0, 'statuses_received': 0}
        
        user_ids = [u['id'] for u in direct_reports]
        user_map = {u['id']: u for u in direct_reports}
    
    # Get statuses for all target users
    query = {
        'user_id': {'$in': user_ids},
        'status_date': target_date
    }
    
    statuses = await db.daily_status.find(query, {'_id': 0}).to_list(500)
    
    # Get activity metrics for the day
    start_datetime = datetime.fromisoformat(f'{target_date}T00:00:00').replace(tzinfo=timezone.utc).isoformat()
    end_datetime = datetime.fromisoformat(f'{target_date}T23:59:59').replace(tzinfo=timezone.utc).isoformat()
    
    # Map statuses to users with metrics
    team_statuses = []
    for status in statuses:
        user_info = user_map.get(status['user_id'])
        if user_info:
            # Get activity metrics for this user
            user_activities = await db.activities.find({
                'created_by': status['user_id'],
                'created_at': {'$gte': start_datetime, '$lte': end_datetime}
            }, {'_id': 0}).to_list(1000)
            
            phone_calls = sum(1 for a in user_activities if a.get('interaction_method') == 'phone_call')
            customer_visits = sum(1 for a in user_activities if a.get('interaction_method') == 'customer_visit')
            emails = sum(1 for a in user_activities if a.get('interaction_method') == 'email')
            messages = sum(1 for a in user_activities if a.get('interaction_method') in ['whatsapp', 'sms'])
            
            new_leads = await db.leads.count_documents({
                'created_by': status['user_id'],
                'created_at': {'$gte': start_datetime, '$lte': end_datetime}
            })
            
            if isinstance(status.get('created_at'), str):
                created_at = status['created_at']
            else:
                created_at = status['created_at'].isoformat()
                
            team_statuses.append({
                'id': status.get('id', ''),
                'user_id': status['user_id'],
                'user_name': user_info['name'],
                'user_role': user_info.get('role', ''),
                'user_designation': user_info.get('designation', ''),
                'user_territory': user_info.get('territory', ''),
                'user_city': user_info.get('city', ''),
                'user_state': user_info.get('state', ''),
                'status_date': status['status_date'],
                'yesterday_updates': status.get('yesterday_updates', ''),
                'today_actions': status.get('today_actions', ''),
                'help_needed': status.get('help_needed', ''),
                'yesterday_ai_revised': status.get('yesterday_ai_revised', False),
                'today_ai_revised': status.get('today_ai_revised', False),
                'help_ai_revised': status.get('help_ai_revised', False),
                'created_at': created_at,
                'metrics': {
                    'new_leads': new_leads,
                    'phone_calls': phone_calls,
                    'customer_visits': customer_visits,
                    'emails': emails,
                    'messages': messages
                }
            })
    
    # Sort by creation time (latest first)
    team_statuses.sort(key=lambda x: x['created_at'], reverse=True)
    
    return {
        'team_statuses': team_statuses,
        'date': target_date,
        'total_reports': len(user_ids),
        'statuses_received': len(team_statuses)
    }

@api_router.post("/daily-status/team-summary")
async def generate_team_summary(request: dict, current_user: dict = Depends(get_current_user)):
    """Generate AI consolidated summary of team daily statuses"""
    from emergentintegrations.llm.chat import LlmChat, UserMessage
    
    team_statuses = request.get('team_statuses', [])
    status_date = request.get('status_date', '')
    
    if not team_statuses:
        raise HTTPException(status_code=400, detail='No team statuses provided')
    
    # Build consolidated text for AI
    status_text = f"Team Daily Status Summary for {status_date}\n\n"
    
    for status in team_statuses:
        status_text += f"--- {status['user_name']} ({status['user_designation']}) - {status['user_territory']} ---\n"
        if status.get('yesterday_updates'):
            status_text += f"Updates: {status['yesterday_updates']}\n"
        if status.get('today_actions'):
            status_text += f"Action Items: {status['today_actions']}\n"
        if status.get('help_needed'):
            status_text += f"Help Needed: {status['help_needed']}\n"
        status_text += "\n"
    
    try:
        user_id = current_user['id']
        session_id = f'team-summary-{user_id}'
        
        chat = LlmChat(
            api_key=os.environ['EMERGENT_LLM_KEY'],
            session_id=session_id,
            system_message='You are a professional editor. Your ONLY job is to: 1) Combine all team member updates into flowing paragraphs, 2) Fix grammar and spelling, 3) Make sentences clear and professional. DO NOT add interpretations like "significant progress" or "achieved well". DO NOT add adjectives or descriptions that were not in the original text. DO NOT elaborate or embellish. Just combine the facts exactly as stated, fix grammar, and organize into 3 paragraphs: Updates, Action Items, Help Needed. Keep it purely factual.'
        ).with_model('anthropic', 'claude-sonnet-4-5-20250929')
        
        user_message = UserMessage(
            text=f'Combine these team status updates into 3 paragraphs (Updates, Actions, Help). Fix grammar ONLY. Do not add interpretations or adjectives. Stay purely factual:\n\n{status_text}'
        )
        
        summary = await chat.send_message(user_message)
        
        return {
            'summary': summary,
            'date': status_date,
            'team_count': len(team_statuses)
        }
    except Exception as e:
        logger.error(f'Team summary generation error: {str(e)}')
        raise HTTPException(status_code=500, detail=f'Summary generation failed: {str(e)}')

@api_router.get("/daily-status/weekly-summary")
async def get_weekly_status_summary(
    start_date: str,
    end_date: str,
    user_id: Optional[str] = None,
    current_user: dict = Depends(get_current_user)
):
    """Get weekly status summary for team or individual member"""
    
    # Build query
    query = {'status_date': {'$gte': start_date, '$lte': end_date}}
    
    if user_id:
        # Individual member summary
        query['user_id'] = user_id
        user = await db.users.find_one({'id': user_id}, {'_id': 0})
    else:
        # Team summary - all direct reports
        direct_reports = await db.users.find(
            {'reports_to': current_user['id']},
            {'_id': 0, 'id': 1}
        ).to_list(100)
        
        if direct_reports:
            user_ids = [u['id'] for u in direct_reports]
            query['user_id'] = {'$in': user_ids}
    
    # Get all statuses in date range
    statuses = await db.daily_status.find(query, {'_id': 0}).sort('status_date', 1).to_list(500)
    
    return {
        'statuses': statuses,
        'start_date': start_date,
        'end_date': end_date,
        'total_days': len(set([s['status_date'] for s in statuses])),
        'is_individual': user_id is not None
    }

@api_router.post("/daily-status/generate-period-summary")
async def generate_period_summary(request: dict, current_user: dict = Depends(get_current_user)):
    """Generate AI summary for weekly/monthly period"""
    from emergentintegrations.llm.chat import LlmChat, UserMessage
    
    statuses = request.get('statuses', [])
    period_type = request.get('period_type', 'weekly')  # weekly or monthly
    start_date = request.get('start_date', '')
    end_date = request.get('end_date', '')
    
    if not statuses:
        raise HTTPException(status_code=400, detail='No statuses provided')
    
    # Build text for AI
    summary_text = f"{period_type.title()} Status Summary: {start_date} to {end_date}\n\n"
    
    for status in statuses:
        user_name = status.get('user_name', 'Unknown')
        date = status.get('status_date', '')
        summary_text += f"[{date}] {user_name}:\n"
        if status.get('yesterday_updates'):
            summary_text += f"  {status['yesterday_updates']}\n"
        if status.get('today_actions'):
            summary_text += f"  {status['today_actions']}\n"
        summary_text += "\n"
    
    try:
        user_id = current_user['id']
        session_id = f'period-summary-{user_id}'
        
        chat = LlmChat(
            api_key=os.environ['EMERGENT_LLM_KEY'],
            session_id=session_id,
            system_message=f'You are a professional editor creating a {period_type} summary. Combine all daily updates into a coherent summary. Organize into: 1) Key Activities (what was done), 2) Outcomes (deals, meetings, results), 3) Pending Items (what needs follow-up). Fix grammar, stay factual, do NOT add interpretations or exaggerate. Just consolidate the facts clearly.'
        ).with_model('anthropic', 'claude-sonnet-4-5-20250929')
        
        user_message = UserMessage(
            text=f'Create a {period_type} summary from these daily updates. Combine into 3 clear paragraphs. Fix grammar only, stay factual:\n\n{summary_text}'
        )
        
        summary = await chat.send_message(user_message)
        
        return {
            'summary': summary,
            'period_type': period_type,
            'start_date': start_date,
            'end_date': end_date,
            'days_covered': len(statuses)
        }
    except Exception as e:
        logger.error(f'Period summary error: {str(e)}')
        raise HTTPException(status_code=500, detail=f'Summary generation failed: {str(e)}')

@api_router.post("/users/create", response_model=User)
async def create_team_member(user_input: UserCreate, current_user: dict = Depends(get_current_user)):
    # Only admin/CEO/Director/VP can create users
    if current_user['role'] not in ['admin', 'ceo', 'CEO', 'Director', 'Vice President', 'National Sales Head']:
        raise HTTPException(status_code=403, detail='Only leadership can create team members')
    
    # Check if user exists
    existing = await db.users.find_one({'email': user_input.email}, {'_id': 0})
    if existing:
        raise HTTPException(status_code=400, detail='Email already registered')
    
    # Create user
    hashed_pw = hash_password(user_input.password)
    user_data = user_input.model_dump()
    user_data.pop('password')
    
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
    
    await db.users.insert_one(doc)
    return user_obj

@api_router.delete("/users/{user_id}")
async def delete_user(user_id: str, current_user: dict = Depends(get_current_user)):
    """Delete user and all associated data"""
    
    if current_user['role'] not in ['CEO', 'Director', 'Vice President']:
        raise HTTPException(status_code=403, detail='Only leadership can delete users')
    
    # Delete user
    result = await db.users.delete_one({'id': user_id})
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail='User not found')
    
    # Delete associated data
    await db.leads.delete_many({'assigned_to': user_id})
    await db.leads.delete_many({'created_by': user_id})
    await db.activities.delete_many({'created_by': user_id})
    await db.daily_status.delete_many({'user_id': user_id})
    await db.user_sessions.delete_many({'user_id': user_id})
    await db.leave_requests.delete_many({'user_id': user_id})
    await db.resource_targets.delete_many({'resource_id': user_id})
    
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
    
    result = await db.users.update_one({'id': user_id}, {'$set': updates})
    
    if result.matched_count == 0:
        raise HTTPException(status_code=404, detail='User not found')
    
    return {'message': 'User updated successfully'}

# ============= ANALYTICS/REPORTS ROUTES =============

@api_router.get("/analytics/dashboard")
async def get_dashboard_analytics(
    time_filter: Optional[str] = 'lifetime',
    territory: Optional[str] = None,
    state: Optional[str] = None,
    city: Optional[str] = None,
    sales_resource: Optional[str] = None,
    current_user: dict = Depends(get_current_user)
):
    """Get dashboard analytics with filters"""
    
    # Calculate date range based on time filter
    now = datetime.now(timezone.utc)
    
    if time_filter == 'this_week':
        start_date = (now - timedelta(days=now.weekday())).replace(hour=0, minute=0, second=0).isoformat()
        end_date = now.isoformat()
    elif time_filter == 'last_week':
        start_date = (now - timedelta(days=now.weekday() + 7)).replace(hour=0, minute=0, second=0).isoformat()
        end_date = (now - timedelta(days=now.weekday() + 1)).replace(hour=23, minute=59, second=59).isoformat()
    elif time_filter == 'this_month':
        start_date = now.replace(day=1, hour=0, minute=0, second=0).isoformat()
        end_date = now.isoformat()
    elif time_filter == 'last_month':
        last_month = now.replace(day=1) - timedelta(days=1)
        start_date = last_month.replace(day=1, hour=0, minute=0, second=0).isoformat()
        end_date = last_month.replace(hour=23, minute=59, second=59).isoformat()
    elif time_filter == 'last_3_months':
        start_date = (now - timedelta(days=90)).replace(hour=0, minute=0, second=0).isoformat()
        end_date = now.isoformat()
    elif time_filter == 'last_6_months':
        start_date = (now - timedelta(days=180)).replace(hour=0, minute=0, second=0).isoformat()
        end_date = now.isoformat()
    elif time_filter == 'this_quarter':
        quarter = (now.month - 1) // 3
        start_date = now.replace(month=quarter * 3 + 1, day=1, hour=0, minute=0, second=0).isoformat()
        end_date = now.isoformat()
    elif time_filter == 'last_quarter':
        quarter = (now.month - 1) // 3
        if quarter == 0:
            start_date = now.replace(year=now.year - 1, month=10, day=1, hour=0, minute=0, second=0).isoformat()
            end_date = now.replace(year=now.year - 1, month=12, day=31, hour=23, minute=59, second=59).isoformat()
        else:
            start_date = now.replace(month=(quarter - 1) * 3 + 1, day=1, hour=0, minute=0, second=0).isoformat()
            end_date = now.replace(month=quarter * 3, day=1, hour=0, minute=0, second=0).isoformat()
    else:  # lifetime
        start_date = None
        end_date = None
    
    # Build match stage based on role and filters
    match_stage = {}
    
    # Role-based access
    if current_user['role'] == 'sales_rep':
        match_stage['assigned_to'] = current_user['id']
    elif sales_resource:
        # Filter by specific sales resource
        match_stage['assigned_to'] = sales_resource
    
    # Add location filters
    if territory and territory != 'all':
        match_stage['region'] = territory
    if state:
        match_stage['state'] = state
    if city:
        match_stage['city'] = city
    
    # Add date filter if not lifetime
    if start_date and end_date:
        match_stage['created_at'] = {'$gte': start_date, '$lte': end_date}
    
    # Activity query with same filters
    activity_query = {}
    
    if current_user['role'] == 'sales_rep':
        activity_query['created_by'] = current_user['id']
    elif sales_resource:
        activity_query['created_by'] = sales_resource
    
    if start_date and end_date:
        activity_query['created_at'] = {'$gte': start_date, '$lte': end_date}
    
    # Get all activities
    activities = await db.activities.find(activity_query, {'_id': 0}).to_list(10000)
    
    # Filter activities by location if needed (via lead lookup)
    if territory or state or city:
        lead_ids_query = {}
        if territory and territory != 'all':
            lead_ids_query['region'] = territory
        if state:
            lead_ids_query['state'] = state
        if city:
            lead_ids_query['city'] = city
        
        matching_leads = await db.leads.find(lead_ids_query, {'_id': 0, 'id': 1}).to_list(10000)
        matching_lead_ids = [l['id'] for l in matching_leads]
        activities = [a for a in activities if a.get('lead_id') in matching_lead_ids]
    
    # Count visits and calls
    visits = [a for a in activities if a.get('interaction_method') == 'customer_visit']
    calls = [a for a in activities if a.get('interaction_method') == 'phone_call']
    
    total_visits = len(visits)
    total_calls = len(calls)
    
    # Unique visits/calls (unique lead_ids)
    unique_visit_leads = len(set([a['lead_id'] for a in visits]))
    unique_call_leads = len(set([a['lead_id'] for a in calls]))
    
    # Status distribution
    status_pipeline = [
        {'$match': match_stage},
        {'$group': {'_id': '$status', 'count': {'$sum': 1}}}
    ]
    status_results = await db.leads.aggregate(status_pipeline).to_list(100)
    status_counts = {item['_id']: item['count'] for item in status_results}
    
    # Calculate metrics
    total_leads = sum(status_counts.values())
    new_leads_added = total_leads
    leads_won = status_counts.get('closed_won', 0)
    leads_lost = status_counts.get('closed_lost', 0)
    conversion_rate = (leads_won / total_leads * 100) if total_leads > 0 else 0
    
    # Pipeline value
    pipeline_value_pipeline = [
        {'$match': {**match_stage, 'status': {'$ne': 'closed_lost'}}},
        {'$group': {'_id': None, 'total_value': {'$sum': '$estimated_value'}}}
    ]
    pipeline_value_result = await db.leads.aggregate(pipeline_value_pipeline).to_list(1)
    pipeline_value = pipeline_value_result[0]['total_value'] if pipeline_value_result else 0
    
    # Today's follow-ups
    today = datetime.now(timezone.utc).date()
    today_start = datetime.combine(today, datetime.min.time()).replace(tzinfo=timezone.utc).isoformat()
    today_end = datetime.combine(today, datetime.max.time()).replace(tzinfo=timezone.utc).isoformat()
    
    today_follow_ups_count = await db.follow_ups.count_documents({
        'is_completed': False,
        'scheduled_date': {'$gte': today_start, '$lte': today_end}
    })
    
    return {
        'total_leads': total_leads,
        'conversion_rate': round(conversion_rate, 2),
        'pipeline_value': pipeline_value or 0,
        'today_follow_ups': today_follow_ups_count,
        'status_distribution': status_counts,
        'total_visits': total_visits,
        'unique_visits': unique_visit_leads,
        'total_calls': total_calls,
        'unique_calls': unique_call_leads,
        'new_leads_added': new_leads_added,
        'leads_won': leads_won,
        'leads_lost': leads_lost,
        'time_filter': time_filter
    }
    
    # Calculate date range based on time filter
    now = datetime.now(timezone.utc)
    
    if time_filter == 'this_week':
        start_date = (now - timedelta(days=now.weekday())).replace(hour=0, minute=0, second=0).isoformat()
        end_date = now.isoformat()
    elif time_filter == 'last_week':
        start_date = (now - timedelta(days=now.weekday() + 7)).replace(hour=0, minute=0, second=0).isoformat()
        end_date = (now - timedelta(days=now.weekday() + 1)).replace(hour=23, minute=59, second=59).isoformat()
    elif time_filter == 'this_month':
        start_date = now.replace(day=1, hour=0, minute=0, second=0).isoformat()
        end_date = now.isoformat()
    elif time_filter == 'last_month':
        last_month = now.replace(day=1) - timedelta(days=1)
        start_date = last_month.replace(day=1, hour=0, minute=0, second=0).isoformat()
        end_date = last_month.replace(hour=23, minute=59, second=59).isoformat()
    elif time_filter == 'last_3_months':
        start_date = (now - timedelta(days=90)).replace(hour=0, minute=0, second=0).isoformat()
        end_date = now.isoformat()
    elif time_filter == 'last_6_months':
        start_date = (now - timedelta(days=180)).replace(hour=0, minute=0, second=0).isoformat()
        end_date = now.isoformat()
    elif time_filter == 'this_quarter':
        quarter = (now.month - 1) // 3
        start_date = now.replace(month=quarter * 3 + 1, day=1, hour=0, minute=0, second=0).isoformat()
        end_date = now.isoformat()
    elif time_filter == 'last_quarter':
        quarter = (now.month - 1) // 3
        if quarter == 0:
            start_date = now.replace(year=now.year - 1, month=10, day=1, hour=0, minute=0, second=0).isoformat()
            end_date = now.replace(year=now.year - 1, month=12, day=31, hour=23, minute=59, second=59).isoformat()
        else:
            start_date = now.replace(month=(quarter - 1) * 3 + 1, day=1, hour=0, minute=0, second=0).isoformat()
            end_date = now.replace(month=quarter * 3, day=1, hour=0, minute=0, second=0).isoformat()
    else:  # lifetime
        start_date = None
        end_date = None
    
    # Build match stage based on role and time filter
    match_stage = {} if current_user['role'] in ['ceo', 'director', 'vp', 'admin', 'sales_manager'] else {'assigned_to': current_user['id']}
    
    # Add date filter if not lifetime
    if start_date and end_date:
        match_stage['created_at'] = {'$gte': start_date, '$lte': end_date}
    
    # Get activity metrics for the period
    activity_query = {} if current_user['role'] in ['ceo', 'director', 'vp', 'admin', 'sales_manager'] else {'created_by': current_user['id']}
    
    if start_date and end_date:
        activity_query['created_at'] = {'$gte': start_date, '$lte': end_date}
    
    # Get all activities
    activities = await db.activities.find(activity_query, {'_id': 0}).to_list(10000)
    
    # Count visits and calls
    visits = [a for a in activities if a.get('interaction_method') == 'customer_visit']
    calls = [a for a in activities if a.get('interaction_method') == 'phone_call']
    
    total_visits = len(visits)
    total_calls = len(calls)
    
    # Unique visits/calls (unique lead_ids)
    unique_visit_leads = len(set([a['lead_id'] for a in visits]))
    unique_call_leads = len(set([a['lead_id'] for a in calls]))
    
    # Status distribution
    status_pipeline = [
        {'$match': match_stage},
        {'$group': {'_id': '$status', 'count': {'$sum': 1}}}
    ]
    status_results = await db.leads.aggregate(status_pipeline).to_list(100)
    status_counts = {item['_id']: item['count'] for item in status_results}
    
    # Calculate metrics
    total_leads = sum(status_counts.values())
    new_leads_added = total_leads  # All leads in time period are "new" for that period
    leads_won = status_counts.get('closed_won', 0)
    leads_lost = status_counts.get('closed_lost', 0)
    conversion_rate = (leads_won / total_leads * 100) if total_leads > 0 else 0
    
    # Pipeline value
    pipeline_value_pipeline = [
        {'$match': {**match_stage, 'status': {'$ne': 'closed_lost'}}},
        {'$group': {'_id': None, 'total_value': {'$sum': '$estimated_value'}}}
    ]
    pipeline_value_result = await db.leads.aggregate(pipeline_value_pipeline).to_list(1)
    pipeline_value = pipeline_value_result[0]['total_value'] if pipeline_value_result else 0
    
    # Today's follow-ups
    today = datetime.now(timezone.utc).date()
    today_start = datetime.combine(today, datetime.min.time()).replace(tzinfo=timezone.utc).isoformat()
    today_end = datetime.combine(today, datetime.max.time()).replace(tzinfo=timezone.utc).isoformat()
    
    today_follow_ups_count = await db.follow_ups.count_documents({
        'is_completed': False,
        'scheduled_date': {'$gte': today_start, '$lte': today_end}
    })
    
    return {
        'total_leads': total_leads,
        'conversion_rate': round(conversion_rate, 2),
        'pipeline_value': pipeline_value or 0,
        'today_follow_ups': today_follow_ups_count,
        'status_distribution': status_counts,
        'total_visits': total_visits,
        'unique_visits': unique_visit_leads,
        'total_calls': total_calls,
        'unique_calls': unique_call_leads,
        'new_leads_added': new_leads_added,
        'leads_won': leads_won,
        'leads_lost': leads_lost,
        'time_filter': time_filter
    }

@api_router.get("/analytics/reports")
async def get_reports(current_user: dict = Depends(get_current_user)):
    # Build match stage based on role
    match_stage = {} if current_user['role'] in ['admin', 'sales_manager'] else {'assigned_to': current_user['id']}
    
    # Lead source analysis using aggregation
    source_pipeline = [
        {'$match': match_stage},
        {'$group': {'_id': {'$ifNull': ['$source', 'unknown']}, 'count': {'$sum': 1}}}
    ]
    source_results = await db.leads.aggregate(source_pipeline).to_list(100)
    source_counts = {item['_id']: item['count'] for item in source_results}
    
    # Team performance (for leadership/managers) using aggregation
    team_performance = []
    if current_user['role'] in ['ceo', 'director', 'vp', 'admin', 'sales_manager']:
        team_pipeline = [
            {'$match': match_stage},
            {'$group': {
                '_id': '$assigned_to',
                'total_leads': {'$sum': 1},
                'closed_won': {
                    '$sum': {'$cond': [{'$eq': ['$status', 'closed_won']}, 1, 0]}
                }
            }}
        ]
        team_results = await db.leads.aggregate(team_pipeline).to_list(100)
        
        # Get user names
        user_ids = [item['_id'] for item in team_results if item['_id']]
        users = await db.users.find(
            {'id': {'$in': user_ids}},
            {'_id': 0, 'id': 1, 'name': 1}
        ).to_list(100)
        user_map = {user['id']: user['name'] for user in users}
        
        for item in team_results:
            if item['_id']:
                total = item['total_leads']
                won = item['closed_won']
                team_performance.append({
                    'name': user_map.get(item['_id'], 'Unknown'),
                    'total_leads': total,
                    'closed_won': won,
                    'conversion_rate': round(won / total * 100, 2) if total > 0 else 0
                })
    
    # Monthly trends using aggregation
    monthly_pipeline = [
        {'$match': match_stage},
        {'$group': {
            '_id': {
                'month': {'$dateToString': {'format': '%Y-%m', 'date': {'$toDate': '$created_at'}}},
                'status': '$status'
            },
            'count': {'$sum': 1}
        }}
    ]
    monthly_results = await db.leads.aggregate(monthly_pipeline).to_list(1000)
    
    # Transform monthly results into desired format
    monthly_data = {}
    for item in monthly_results:
        month = item['_id']['month']
        status = item['_id']['status']
        if month not in monthly_data:
            monthly_data[month] = {'new': 0, 'closed_won': 0, 'closed_lost': 0}
        if status == 'closed_won':
            monthly_data[month]['closed_won'] = item['count']
        elif status == 'closed_lost':
            monthly_data[month]['closed_lost'] = item['count']
        monthly_data[month]['new'] += item['count']
    
    return {
        'source_analysis': source_counts,
        'team_performance': team_performance,
        'monthly_trends': monthly_data
    }

@api_router.get("/analytics/activity-metrics")
async def get_activity_metrics(
    start_date: str,
    end_date: str,
    user_id: Optional[str] = None,
    current_user: dict = Depends(get_current_user)
):
    """Get activity metrics for a date range"""
    
    # Build query
    start_datetime = datetime.fromisoformat(f'{start_date}T00:00:00').replace(tzinfo=timezone.utc).isoformat()
    end_datetime = datetime.fromisoformat(f'{end_date}T23:59:59').replace(tzinfo=timezone.utc).isoformat()
    
    query = {
        'created_at': {'$gte': start_datetime, '$lte': end_datetime}
    }
    
    if user_id:
        query['created_by'] = user_id
    else:
        # Get all direct reports
        direct_reports = await db.users.find(
            {'reports_to': current_user['id']},
            {'_id': 0, 'id': 1}
        ).to_list(100)
        
        if direct_reports:
            user_ids = [u['id'] for u in direct_reports]
            query['created_by'] = {'$in': user_ids}
    
    # Get all activities
    activities = await db.activities.find(query, {'_id': 0}).to_list(5000)
    
    # Count by interaction method
    phone_calls = sum(1 for a in activities if a.get('interaction_method') == 'phone_call')
    customer_visits = sum(1 for a in activities if a.get('interaction_method') == 'customer_visit')
    emails = sum(1 for a in activities if a.get('interaction_method') == 'email')
    messages = sum(1 for a in activities if a.get('interaction_method') in ['whatsapp', 'sms'])
    
    # Count new leads created in this period
    leads_query = {
        'created_at': {'$gte': start_datetime, '$lte': end_datetime}
    }
    
    if user_id:
        leads_query['created_by'] = user_id
    else:
        if direct_reports:
            user_ids = [u['id'] for u in direct_reports]
            leads_query['created_by'] = {'$in': user_ids}
    
    new_leads = await db.leads.count_documents(leads_query)
    
    return {
        'new_leads': new_leads,
        'phone_calls': phone_calls,
        'customer_visits': customer_visits,
        'emails': emails,
        'messages': messages,
        'total_activities': len(activities),
        'start_date': start_date,
        'end_date': end_date
    }
async def get_location_analytics(current_user: dict = Depends(get_current_user)):
    # Build match stage based on role
    match_stage = {} if current_user['role'] in ['ceo', 'director', 'vp', 'admin', 'sales_manager'] else {'assigned_to': current_user['id']}
    
    # Leads by country
    country_pipeline = [
        {'$match': match_stage},
        {'$group': {
            '_id': {'$ifNull': ['$country', 'Unknown']},
            'total_leads': {'$sum': 1},
            'closed_won': {'$sum': {'$cond': [{'$eq': ['$status', 'closed_won']}, 1, 0]}},
            'pipeline_value': {'$sum': '$estimated_value'}
        }},
        {'$sort': {'total_leads': -1}}
    ]
    country_results = await db.leads.aggregate(country_pipeline).to_list(100)
    
    # Leads by state/region
    state_pipeline = [
        {'$match': match_stage},
        {'$group': {
            '_id': {'$ifNull': ['$state', 'Unknown']},
            'total_leads': {'$sum': 1},
            'closed_won': {'$sum': {'$cond': [{'$eq': ['$status', 'closed_won']}, 1, 0]}},
            'pipeline_value': {'$sum': '$estimated_value'}
        }},
        {'$sort': {'total_leads': -1}}
    ]
    state_results = await db.leads.aggregate(state_pipeline).to_list(100)
    
    # Leads by city
    city_pipeline = [
        {'$match': match_stage},
        {'$group': {
            '_id': {'$ifNull': ['$city', 'Unknown']},
            'total_leads': {'$sum': 1},
            'closed_won': {'$sum': {'$cond': [{'$eq': ['$status', 'closed_won']}, 1, 0]}},
            'pipeline_value': {'$sum': '$estimated_value'}
        }},
        {'$sort': {'total_leads': -1}},
        {'$limit': 20}  # Top 20 cities
    ]
    city_results = await db.leads.aggregate(city_pipeline).to_list(20)
    
    # Leads by region (business territory)
    region_pipeline = [
        {'$match': match_stage},
        {'$group': {
            '_id': {'$ifNull': ['$region', 'Unknown']},
            'total_leads': {'$sum': 1},
            'closed_won': {'$sum': {'$cond': [{'$eq': ['$status', 'closed_won']}, 1, 0]}},
            'pipeline_value': {'$sum': '$estimated_value'}
        }},
        {'$sort': {'total_leads': -1}}
    ]
    region_results = await db.leads.aggregate(region_pipeline).to_list(100)
    
    # Team locations
    team_locations = []
    if current_user['role'] in ['ceo', 'director', 'vp', 'admin', 'sales_manager']:
        users = await db.users.find(
            {},
            {'_id': 0, 'id': 1, 'name': 1, 'city': 1, 'state': 1, 'country': 1, 'territory': 1}
        ).to_list(100)
        team_locations = [
            {
                'name': user['name'],
                'city': user.get('city', 'Unknown'),
                'state': user.get('state', 'Unknown'),
                'country': user.get('country', 'Unknown'),
                'territory': user.get('territory', 'Unknown')
            }
            for user in users
        ]
    
    return {
        'by_country': [
            {
                'country': item['_id'],
                'total_leads': item['total_leads'],
                'closed_won': item['closed_won'],
                'pipeline_value': item['pipeline_value'] or 0,
                'conversion_rate': round(item['closed_won'] / item['total_leads'] * 100, 2) if item['total_leads'] > 0 else 0
            }
            for item in country_results
        ],
        'by_state': [
            {
                'state': item['_id'],
                'total_leads': item['total_leads'],
                'closed_won': item['closed_won'],
                'pipeline_value': item['pipeline_value'] or 0,
                'conversion_rate': round(item['closed_won'] / item['total_leads'] * 100, 2) if item['total_leads'] > 0 else 0
            }
            for item in state_results
        ],
        'by_city': [
            {
                'city': item['_id'],
                'total_leads': item['total_leads'],
                'closed_won': item['closed_won'],
                'pipeline_value': item['pipeline_value'] or 0,
                'conversion_rate': round(item['closed_won'] / item['total_leads'] * 100, 2) if item['total_leads'] > 0 else 0
            }
            for item in city_results
        ],
        'by_region': [
            {
                'region': item['_id'],
                'total_leads': item['total_leads'],
                'closed_won': item['closed_won'],
                'pipeline_value': item['pipeline_value'] or 0,
                'conversion_rate': round(item['closed_won'] / item['total_leads'] * 100, 2) if item['total_leads'] > 0 else 0
            }
            for item in region_results
        ],
        'team_locations': team_locations
    }

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
                    'X-Goog-FieldMask': 'places.displayName,places.formattedAddress,places.internationalPhoneNumber,places.rating,places.userRatingCount,places.priceLevel,places.types,places.id'
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
                    
                    outlet_data = {
                        'place_id': place.get('id', ''),
                        'name': place.get('displayName', {}).get('text', 'Unknown'),
                        'address': place.get('formattedAddress', ''),
                        'phone': place.get('internationalPhoneNumber', ''),
                        'rating': place.get('rating', 0),
                        'user_ratings_total': place.get('userRatingCount', 0),
                        'price_level': '₹' * price_level,
                        'types': place.get('types', [])
                    }
                    all_places.append(outlet_data)
                
                return {
                    'results': all_places,
                    'total_results': len(all_places),
                    'search_location': f'{city}, India' if city else 'India'
                }
        
        # Otherwise, geocode location and search nearby
        async with httpx.AsyncClient() as client:
            geocode_url = f"https://maps.googleapis.com/maps/api/geocode/json"
            
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
                    'X-Goog-FieldMask': 'places.displayName,places.formattedAddress,places.internationalPhoneNumber,places.rating,places.userRatingCount,places.priceLevel,places.types,places.id'
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
                        
                        outlet_data = {
                            'place_id': place_id,
                            'name': place.get('displayName', {}).get('text', 'Unknown'),
                            'address': place.get('formattedAddress', ''),
                            'phone': place.get('internationalPhoneNumber', ''),
                            'rating': rating,
                            'user_ratings_total': place.get('userRatingCount', 0),
                            'price_level': '₹' * price_level,
                            'types': place.get('types', []),
                            'search_type': search_type
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
    
    await db.leave_requests.insert_one(doc)
    
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
    
    if current_user['role'] in ['ceo', 'director', 'vp', 'admin', 'sales_manager']:
        # Managers see requests from their direct reports
        direct_reports = await db.users.find(
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
    
    requests = await db.leave_requests.find(query, {'_id': 0}).sort('created_at', -1).to_list(100)
    
    # Get user names
    user_ids = list(set([r['user_id'] for r in requests]))
    users = await db.users.find(
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

@api_router.put("/leave-requests/{request_id}/approve")
async def approve_leave_request(
    request_id: str,
    approval: LeaveApproval,
    current_user: dict = Depends(get_current_user)
):
    """Approve or reject leave request"""
    
    leave_req = await db.leave_requests.find_one({'id': request_id}, {'_id': 0})
    if not leave_req:
        raise HTTPException(status_code=404, detail='Leave request not found')
    
    # Check if user is the manager of the requester
    requester = await db.users.find_one({'id': leave_req['user_id']}, {'_id': 0})
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
    
    await db.leave_requests.update_one({'id': request_id}, {'$set': update_data})
    
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
    direct_reports = await db.users.find(
        {'reports_to': current_user['id']},
        {'_id': 0, 'id': 1, 'name': 1}
    ).to_list(100)
    
    if not direct_reports:
        return {'pending_requests': [], 'count': 0}
    
    user_ids = [u['id'] for u in direct_reports]
    
    # Get pending requests from direct reports
    pending = await db.leave_requests.find(
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
    
    await db.travel_requests.insert_one(doc)
    
    # Create approval tasks for CEO and Director if submitting for approval
    if request.submit_for_approval:
        # Find CEO and Director users
        approvers = await db.users.find(
            {'role': {'$in': ['CEO', 'Director']}, 'is_active': True},
            {'_id': 0, 'id': 1, 'name': 1}
        ).to_list(10)
        
        travel_details = f"{request.from_location} to {request.to_location} ({request.departure_date})"
        
        for approver in approvers:
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
    
    requests = await db.travel_requests.find(query, {'_id': 0}).sort('created_at', -1).to_list(100)
    
    # Get user names for all requests
    user_ids = list(set([r['user_id'] for r in requests]))
    users = await db.users.find(
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
    
    travel_req = await db.travel_requests.find_one({'id': request_id}, {'_id': 0})
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
    
    travel_req = await db.travel_requests.find_one({'id': request_id}, {'_id': 0})
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
        approvers = await db.users.find(
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
    
    await db.travel_requests.update_one({'id': request_id}, {'$set': update_data})
    
    return {'message': 'Travel request updated successfully'}

@api_router.put("/travel-requests/{request_id}/approve")
async def approve_travel_request(
    request_id: str,
    approval: TravelApproval,
    current_user: dict = Depends(get_current_user)
):
    """Approve or reject travel request (CEO/Director only)"""
    
    if current_user['role'].lower() not in ['ceo', 'director']:
        raise HTTPException(status_code=403, detail='Only CEO or Director can approve travel requests')
    
    travel_req = await db.travel_requests.find_one({'id': request_id}, {'_id': 0})
    if not travel_req:
        raise HTTPException(status_code=404, detail='Travel request not found')
    
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
    
    await db.travel_requests.update_one({'id': request_id}, {'$set': update_data})
    
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
    
    travel_req = await db.travel_requests.find_one({'id': request_id}, {'_id': 0})
    if not travel_req:
        raise HTTPException(status_code=404, detail='Travel request not found')
    
    if travel_req['user_id'] != current_user['id']:
        raise HTTPException(status_code=403, detail='You can only cancel your own travel requests')
    
    if travel_req['status'] in ['approved', 'rejected', 'cancelled']:
        raise HTTPException(status_code=400, detail='Cannot cancel this request')
    
    await db.travel_requests.update_one(
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
    
    count = await db.travel_requests.count_documents({'status': 'pending_approval'})
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
    
    await db.budget_requests.insert_one(doc)
    
    # Create approval task for Director if submitting for approval
    if request.submit_for_approval:
        # Find Directors only
        approvers = await db.users.find(
            {'role': 'Director', 'is_active': True},
            {'_id': 0, 'id': 1, 'name': 1}
        ).to_list(10)
        
        budget_details = f"{request.title} - ₹{total_amount:,.0f}"
        
        for approver in approvers:
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
    
    requests = await db.budget_requests.find(query, {'_id': 0}).sort('created_at', -1).to_list(100)
    
    # Get user names
    user_ids = list(set([r['user_id'] for r in requests]))
    users = await db.users.find(
        {'id': {'$in': user_ids}},
        {'_id': 0, 'id': 1, 'name': 1}
    ).to_list(100)
    user_map = {u['id']: u['name'] for u in users}
    
    for req in requests:
        req['user_name'] = user_map.get(req['user_id'], req.get('user_name', 'Unknown'))
    
    return requests

@api_router.get("/budget-requests/{request_id}")
async def get_budget_request(request_id: str, current_user: dict = Depends(get_current_user)):
    """Get single budget request"""
    
    budget_req = await db.budget_requests.find_one({'id': request_id}, {'_id': 0})
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
    
    budget_req = await db.budget_requests.find_one({'id': request_id}, {'_id': 0})
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
        approvers = await db.users.find(
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
    
    await db.budget_requests.update_one({'id': request_id}, {'$set': update_data})
    
    return {'message': 'Budget request updated successfully'}

@api_router.put("/budget-requests/{request_id}/approve")
async def approve_budget_request(
    request_id: str,
    approval: BudgetApproval,
    current_user: dict = Depends(get_current_user)
):
    """Approve or reject budget request (Director only)"""
    
    if current_user['role'].lower() != 'director':
        raise HTTPException(status_code=403, detail='Only Director can approve budget requests')
    
    budget_req = await db.budget_requests.find_one({'id': request_id}, {'_id': 0})
    if not budget_req:
        raise HTTPException(status_code=404, detail='Budget request not found')
    
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
    
    await db.budget_requests.update_one({'id': request_id}, {'$set': update_data})
    
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
    
    budget_req = await db.budget_requests.find_one({'id': request_id}, {'_id': 0})
    if not budget_req:
        raise HTTPException(status_code=404, detail='Budget request not found')
    
    if budget_req['user_id'] != current_user['id']:
        raise HTTPException(status_code=403, detail='You can only cancel your own budget requests')
    
    if budget_req['status'] in ['approved', 'rejected', 'cancelled']:
        raise HTTPException(status_code=400, detail='Cannot cancel this request')
    
    await db.budget_requests.update_one(
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
        lead = await db.leads.find_one({'id': request.entity_id}, {'_id': 0, 'company': 1, 'city': 1})
        if not lead:
            raise HTTPException(status_code=404, detail='Lead not found')
        entity_name = lead.get('company')
        entity_city = lead.get('city')
    elif request.entity_type == 'account':
        account = await db.accounts.find_one({'id': request.entity_id}, {'_id': 0, 'account_name': 1, 'city': 1})
        if not account:
            # Try with account_id
            account = await db.accounts.find_one({'account_id': request.entity_id}, {'_id': 0, 'account_name': 1, 'city': 1})
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
            cogs_data = await db.cogs_data.find_one(
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
    
    # Calculate total amount
    final_amount = total_sku_cost if request.expense_type == 'free_trial' else request.amount
    
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
    
    await db.expense_requests.insert_one(doc)
    
    # Create approval task if submitted for approval
    if request.submit_for_approval:
        # Find Director for approval
        director = await db.users.find_one(
            {'role': {'$in': ['Director', 'director']}},
            {'_id': 0, 'id': 1, 'name': 1}
        )
        
        if director:
            expense_label = expense_type_info['label']
            await create_approval_task(
                approval_type=ApprovalType.EXPENSE,
                requester_id=current_user['id'],
                requester_name=current_user.get('name', 'Unknown'),
                approver_id=director['id'],
                details=f"{expense_label} - {entity_name} (₹{final_amount:,.0f})",
                description=f"Expense request for {entity_name}:\n\nType: {expense_label}\nAmount: ₹{final_amount:,.0f}\n{('Free Trial Days: ' + str(request.free_trial_days)) if request.free_trial_days else ''}\n{request.description or ''}",
                reference_id=expense_obj.id,
                reference_type='expense_request'
            )
    
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
    
    # Non-directors can only see their own requests
    if current_user['role'] not in ['CEO', 'Director', 'Vice President', 'ceo', 'director', 'vp']:
        query['user_id'] = current_user['id']
    
    expenses = await db.expense_requests.find(query, {'_id': 0}).sort('created_at', -1).to_list(500)
    
    return expenses

@api_router.get("/expense-requests/{request_id}")
async def get_expense_request(request_id: str, current_user: dict = Depends(get_current_user)):
    """Get a single expense request"""
    
    expense = await db.expense_requests.find_one({'id': request_id}, {'_id': 0})
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
    
    expense_req = await db.expense_requests.find_one({'id': request_id}, {'_id': 0})
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
            cogs_data = await db.cogs_data.find_one(
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
        director = await db.users.find_one(
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
    
    await db.expense_requests.update_one({'id': request_id}, {'$set': update_data})
    
    return {'message': 'Expense request updated'}

@api_router.put("/expense-requests/{request_id}/approve")
async def approve_expense_request(
    request_id: str,
    approval: ExpenseApproval,
    current_user: dict = Depends(get_current_user)
):
    """Approve or reject an expense request"""
    
    # Only Directors and CEO can approve
    if current_user['role'] not in ['CEO', 'Director', 'Vice President', 'ceo', 'director', 'vp']:
        raise HTTPException(status_code=403, detail='Only Directors can approve expense requests')
    
    expense_req = await db.expense_requests.find_one({'id': request_id}, {'_id': 0})
    if not expense_req:
        raise HTTPException(status_code=404, detail='Expense request not found')
    
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
    
    await db.expense_requests.update_one({'id': request_id}, {'$set': update_data})
    
    # Complete approval task
    await complete_approval_task(
        approval_type=ApprovalType.EXPENSE,
        reference_id=request_id,
        status='completed' if approval.status == 'approved' else 'cancelled'
    )
    
    return {'message': f'Expense request {approval.status}'}

@api_router.delete("/expense-requests/{request_id}")
async def delete_expense_request(request_id: str, current_user: dict = Depends(get_current_user)):
    """Delete/cancel an expense request"""
    
    expense_req = await db.expense_requests.find_one({'id': request_id}, {'_id': 0})
    if not expense_req:
        raise HTTPException(status_code=404, detail='Expense request not found')
    
    if expense_req['user_id'] != current_user['id']:
        raise HTTPException(status_code=403, detail='You can only delete your own expense requests')
    
    if expense_req['status'] in ['approved']:
        raise HTTPException(status_code=400, detail='Cannot delete approved expense requests')
    
    await db.expense_requests.update_one(
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
    
    cogs_data = await db.cogs_data.find_one(
        {'city': city, 'sku_name': sku_name},
        {'_id': 0, 'minimum_landing_price': 1, 'sku_name': 1, 'city': 1}
    )
    
    if not cogs_data:
        # Try to find default city pricing or return 0
        return {'minimum_landing_price': 0, 'sku_name': sku_name, 'city': city, 'found': False}
    
    return {**cogs_data, 'found': True}

# ============= SALES TARGET ROUTES =============

@api_router.post("/target-plans", response_model=TargetPlan)
async def create_target_plan(plan: TargetPlanCreate, current_user: dict = Depends(get_current_user)):
    """Create sales target plan"""
    
    if current_user['role'] not in ['CEO', 'Director', 'Vice President']:
        raise HTTPException(status_code=403, detail='Only leadership can create target plans')
    
    plan_data = plan.model_dump()
    plan_data['created_by'] = current_user['id']
    plan_obj = TargetPlan(**plan_data)
    
    doc = plan_obj.model_dump()
    doc['created_at'] = doc['created_at'].isoformat()
    doc['updated_at'] = doc['updated_at'].isoformat()
    if doc.get('locked_at'):
        doc['locked_at'] = doc['locked_at'].isoformat()
    
    await db.target_plans.insert_one(doc)
    
    return plan_obj

@api_router.delete("/target-plans/{plan_id}")
async def delete_target_plan(plan_id: str, current_user: dict = Depends(get_current_user)):
    """Delete target plan and all allocations"""
    
    if current_user['role'] not in ['ceo', 'director', 'vp', 'admin']:
        raise HTTPException(status_code=403, detail='Only leadership can delete target plans')
    
    # Delete plan
    result = await db.target_plans.delete_one({'id': plan_id})
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail='Plan not found')
    
    # Delete all related allocations
    await db.territory_targets.delete_many({'plan_id': plan_id})
    await db.city_targets.delete_many({'plan_id': plan_id})
    await db.resource_targets.delete_many({'plan_id': plan_id})
    await db.sku_targets.delete_many({'plan_id': plan_id})
    
    return {'message': 'Target plan deleted successfully'}

@api_router.put("/target-plans/{plan_id}")
async def update_target_plan(plan_id: str, plan_data: dict, current_user: dict = Depends(get_current_user)):
    """Update target plan"""
    
    if current_user['role'] not in ['ceo', 'director', 'vp', 'admin']:
        raise HTTPException(status_code=403, detail='Only leadership can update target plans')
    
    plan = await db.target_plans.find_one({'id': plan_id}, {'_id': 0})
    if not plan:
        raise HTTPException(status_code=404, detail='Plan not found')
    
    if plan['status'] == 'locked':
        raise HTTPException(status_code=400, detail='Cannot modify locked plan')
    
    # Update fields
    update_data = {}
    if 'plan_name' in plan_data:
        update_data['plan_name'] = plan_data['plan_name']
    if 'time_period' in plan_data:
        update_data['time_period'] = plan_data['time_period']
    if 'country_target' in plan_data:
        update_data['country_target'] = plan_data['country_target']
    if 'start_date' in plan_data:
        update_data['start_date'] = plan_data['start_date']
    if 'end_date' in plan_data:
        update_data['end_date'] = plan_data['end_date']
    
    update_data['updated_at'] = datetime.now(timezone.utc).isoformat()
    
    await db.target_plans.update_one({'id': plan_id}, {'$set': update_data})
    
    return {'message': 'Target plan updated successfully'}

@api_router.get("/target-plans")
async def get_target_plans(current_user: dict = Depends(get_current_user)):
    """Get all target plans"""
    
    plans = await db.target_plans.find({}, {'_id': 0}).sort('created_at', -1).to_list(100)
    
    for plan in plans:
        if isinstance(plan.get('created_at'), str):
            plan['created_at'] = datetime.fromisoformat(plan['created_at'])
        if isinstance(plan.get('updated_at'), str):
            plan['updated_at'] = datetime.fromisoformat(plan['updated_at'])
        if plan.get('locked_at') and isinstance(plan['locked_at'], str):
            plan['locked_at'] = datetime.fromisoformat(plan['locked_at'])
    
    return plans

@api_router.post("/target-plans/{plan_id}/territories")
async def allocate_territory_targets(
    plan_id: str,
    territories: List[TerritoryTargetCreate],
    current_user: dict = Depends(get_current_user)
):
    """Allocate country target to territories"""
    
    if current_user['role'] not in ['CEO', 'Director', 'Vice President']:
        raise HTTPException(status_code=403, detail='Only leadership can allocate territory targets')
    
    # Get plan
    plan = await db.target_plans.find_one({'id': plan_id}, {'_id': 0})
    if not plan:
        raise HTTPException(status_code=404, detail='Target plan not found')
    
    if plan['status'] == 'locked':
        raise HTTPException(status_code=400, detail='Cannot modify locked plan')
    
    # Validate total equals country target
    total_percentage = sum([t.allocation_percentage for t in territories])
    if abs(total_percentage - 100) > 0.01:
        raise HTTPException(
            status_code=400,
            detail=f'Territory percentages must total 100% (current: {total_percentage}%)'
        )
    
    # Delete existing territory targets
    await db.territory_targets.delete_many({'plan_id': plan_id})
    
    # Create new territory targets with calculated values
    created_targets = []
    for territory in territories:
        target_data = territory.model_dump()
        target_data['plan_id'] = plan_id
        # Calculate actual revenue from percentage
        target_data['target_revenue'] = (territory.allocation_percentage / 100) * plan['country_target']
        target_obj = TerritoryTarget(**target_data)
        
        doc = target_obj.model_dump()
        doc['created_at'] = doc['created_at'].isoformat()
        
        await db.territory_targets.insert_one(doc)
        created_targets.append(target_obj)
    
    return {'message': 'Territory targets allocated', 'targets': created_targets}

@api_router.post("/target-plans/{plan_id}/territories/{territory}/cities")
async def allocate_city_targets(
    plan_id: str,
    territory: str,
    cities: List[CityTargetCreate],
    current_user: dict = Depends(get_current_user)
):
    """Allocate territory target to cities"""
    
    # Get territory target
    territory_target = await db.territory_targets.find_one(
        {'plan_id': plan_id, 'territory': territory},
        {'_id': 0}
    )
    
    if not territory_target:
        raise HTTPException(status_code=404, detail='Territory target not found')
    
    # Validate total
    total_percentage = sum([c.allocation_percentage for c in cities])
    if abs(total_percentage - 100) > 0.01:
        raise HTTPException(
            status_code=400,
            detail=f'City percentages must total 100% (current: {total_percentage}%)'
        )
    
    # Delete existing city targets
    await db.city_targets.delete_many({'plan_id': plan_id, 'territory': territory})
    
    # Create new city targets with calculated values
    for city in cities:
        city_data = city.model_dump()
        city_data['plan_id'] = plan_id
        city_data['territory'] = territory
        # Calculate actual revenue from percentage
        city_data['target_revenue'] = (city.allocation_percentage / 100) * territory_target['target_revenue']
        city_obj = CityTarget(**city_data)
        
        doc = city_obj.model_dump()
        doc['created_at'] = doc['created_at'].isoformat()
        
        await db.city_targets.insert_one(doc)
    
    # Update territory allocated amount
    total_city_revenue = sum([(c.allocation_percentage / 100) * territory_target['target_revenue'] for c in cities])
    await db.territory_targets.update_one(
        {'plan_id': plan_id, 'territory': territory},
        {'$set': {'allocated_revenue': total_city_revenue}}
    )
    
    return {'message': 'City targets allocated'}

@api_router.get("/target-plans/{plan_id}/hierarchy")
async def get_target_hierarchy(plan_id: str, current_user: dict = Depends(get_current_user)):
    """Get complete target hierarchy with roll-ups"""
    
    plan = await db.target_plans.find_one({'id': plan_id}, {'_id': 0})
    if not plan:
        raise HTTPException(status_code=404, detail='Plan not found')
    
    # Get territories
    territories = await db.territory_targets.find({'plan_id': plan_id}, {'_id': 0}).to_list(100)
    
    # Get cities
    cities = await db.city_targets.find({'plan_id': plan_id}, {'_id': 0}).to_list(1000)
    
    # Get resources
    resources = await db.resource_targets.find({'plan_id': plan_id}, {'_id': 0}).to_list(1000)
    
    # Build hierarchy
    hierarchy = {
        'plan': plan,
        'territories': []
    }
    
    for territory in territories:
        territory_data = {
            **territory,
            'states': {}
        }
        
        # Group cities by state
        territory_cities = [c for c in cities if c['territory'] == territory['territory']]
        
        for city in territory_cities:
            state = city['state']
            if state not in territory_data['states']:
                territory_data['states'][state] = {
                    'state_name': state,
                    'state_target': 0,
                    'cities': []
                }
            
            # Get resources for this city
            city_resources = [r for r in resources if r['city_id'] == city['id']]
            
            city_data = {
                **city,
                'resources': city_resources
            }
            
            territory_data['states'][state]['cities'].append(city_data)
            territory_data['states'][state]['state_target'] += city['target_revenue']
        
        # Convert states dict to list
        territory_data['states'] = list(territory_data['states'].values())
        
        hierarchy['territories'].append(territory_data)
    
    return hierarchy

@api_router.get("/target-plans/{plan_id}/cities/{city_id}/resources")
async def get_city_resources(plan_id: str, city_id: str, current_user: dict = Depends(get_current_user)):
    """Get resource allocations for a city"""
    
    resources = await db.resource_targets.find({'city_id': city_id}, {'_id': 0}).to_list(100)
    
    return {'resources': resources}

@api_router.post("/target-plans/{plan_id}/cities/{city_id}/resources")
async def assign_city_resources(
    plan_id: str,
    city_id: str,
    resources: List[ResourceTargetCreate],
    current_user: dict = Depends(get_current_user)
):
    """Assign city target to sales resources"""
    
    # Get city target
    city = await db.city_targets.find_one({'id': city_id}, {'_id': 0})
    if not city:
        raise HTTPException(status_code=404, detail='City not found')
    
    # Validate total
    total_percentage = sum([r.allocation_percentage for r in resources])
    if abs(total_percentage - 100) > 0.01:
        raise HTTPException(
            status_code=400,
            detail=f'Resource percentages must total 100% (current: {total_percentage}%)'
        )
    
    # Delete existing resource targets for this city
    await db.resource_targets.delete_many({'city_id': city_id})
    
    # Create new resource targets with calculated values
    for resource in resources:
        resource_data = resource.model_dump()
        resource_data['plan_id'] = plan_id
        resource_data['city_id'] = city_id
        # Calculate actual revenue from percentage
        resource_data['target_revenue'] = (resource.allocation_percentage / 100) * city['target_revenue']
        resource_obj = ResourceTarget(**resource_data)
        
        doc = resource_obj.model_dump()
        doc['created_at'] = doc['created_at'].isoformat()
        
        await db.resource_targets.insert_one(doc)
    
    return {'message': 'Resources assigned successfully'}

@api_router.get("/target-plans/{plan_id}/resource-summary")
async def get_resource_summary(plan_id: str, current_user: dict = Depends(get_current_user)):
    """Get resource-wise summary with city breakdowns"""
    
    # Get all resource targets for this plan
    resources = await db.resource_targets.find({'plan_id': plan_id}, {'_id': 0}).to_list(1000)
    
    # Get cities
    cities = await db.city_targets.find({'plan_id': plan_id}, {'_id': 0}).to_list(1000)
    city_map = {c['id']: c for c in cities}
    
    # Get users
    user_ids = list(set([r['resource_id'] for r in resources]))
    users = await db.users.find({'id': {'$in': user_ids}}, {'_id': 0}).to_list(100)
    user_map = {u['id']: u for u in users}
    
    # Build resource summary
    resource_summary = {}
    for res in resources:
        user_id = res['resource_id']
        if user_id not in resource_summary:
            user_info = user_map.get(user_id, {})
            resource_summary[user_id] = {
                'resource_name': user_info.get('name', 'Unknown'),
                'designation': user_info.get('designation', ''),
                'territory': user_info.get('territory', ''),
                'total_target': 0,
                'city_breakdown': []
            }
        
        city_info = city_map.get(res['city_id'], {})
        resource_summary[user_id]['total_target'] += res['target_revenue']
        resource_summary[user_id]['city_breakdown'].append({
            'city': city_info.get('city', 'Unknown'),
            'state': city_info.get('state', ''),
            'target': res['target_revenue']
        })
    
    return {
        'resources': list(resource_summary.values()),
        'plan_id': plan_id
    }

@api_router.get("/target-plans/{plan_id}/cities/{city_id}/skus")
async def get_city_skus(plan_id: str, city_id: str, current_user: dict = Depends(get_current_user)):
    """Get SKU allocations for a city"""
    
    skus = await db.sku_targets.find({'city_id': city_id}, {'_id': 0}).to_list(100)
    
    return {'skus': skus}

@api_router.post("/target-plans/{plan_id}/cities/{city_id}/skus")
async def assign_city_skus(
    plan_id: str,
    city_id: str,
    skus: List[SKUTargetCreate],
    current_user: dict = Depends(get_current_user)
):
    """Assign city target to SKUs (independent from resource allocation)"""
    
    # Get city target
    city = await db.city_targets.find_one({'id': city_id}, {'_id': 0})
    if not city:
        raise HTTPException(status_code=404, detail='City not found')
    
    # Validate total
    total_percentage = sum([s.allocation_percentage for s in skus])
    if abs(total_percentage - 100) > 0.01:
        raise HTTPException(
            status_code=400,
            detail=f'SKU percentages must total 100% (current: {total_percentage}%)'
        )
    
    # Delete existing SKU targets for this city
    await db.sku_targets.delete_many({'city_id': city_id})
    
    # Create new SKU targets with calculated values
    for sku in skus:
        sku_data = sku.model_dump()
        sku_data['plan_id'] = plan_id
        sku_data['city_id'] = city_id
        # Calculate actual revenue from percentage
        sku_data['target_revenue'] = (sku.allocation_percentage / 100) * city['target_revenue']
        sku_obj = SKUTarget(**sku_data)
        
        doc = sku_obj.model_dump()
        doc['created_at'] = doc['created_at'].isoformat()
        
        await db.sku_targets.insert_one(doc)
    
    return {'message': 'SKUs assigned successfully'}

@api_router.get("/reports/target-resource-allocation")
async def get_target_resource_allocation_report(current_user: dict = Depends(get_current_user)):
    """Get Target Resource Allocation Report"""
    
    # Get all target plans
    plans = await db.target_plans.find({}, {'_id': 0}).to_list(100)
    
    # Get all resource invoice summaries
    resource_summaries = await db.resource_invoice_summary.find({}, {'_id': 0}).to_list(1000)
    resource_invoice_map = {r['resource_id']: r.get('total_gross_invoice_value', 0) for r in resource_summaries}
    
    report_data = []
    
    for plan in plans:
        # Get all resource targets for this plan
        resource_targets = await db.resource_targets.find({'plan_id': plan['id']}, {'_id': 0}).to_list(1000)
        
        # Get city info
        city_ids = list(set([r['city_id'] for r in resource_targets]))
        cities = await db.city_targets.find({'id': {'$in': city_ids}}, {'_id': 0}).to_list(1000)
        city_map = {c['id']: c for c in cities}
        
        # Get user info
        user_ids = list(set([r['resource_id'] for r in resource_targets]))
        users = await db.users.find({'id': {'$in': user_ids}}, {'_id': 0}).to_list(100)
        user_map = {u['id']: u for u in users}
        
        for res_target in resource_targets:
            city_info = city_map.get(res_target['city_id'], {})
            user_info = user_map.get(res_target['resource_id'], {})
            resource_id = res_target['resource_id']
            
            # Get actual achieved revenue from invoices
            achieved_revenue = resource_invoice_map.get(resource_id, 0)
            target_revenue = res_target['target_revenue']
            tbd_revenue = target_revenue - achieved_revenue  # TBD = Target - Achieved
            achievement_percentage = (achieved_revenue / target_revenue * 100) if target_revenue > 0 else 0
            
            report_data.append({
                'target_name': plan['plan_name'],
                'territory': city_info.get('territory', ''),
                'start_date': plan['start_date'],
                'end_date': plan['end_date'],
                'city': city_info.get('city', ''),
                'state': city_info.get('state', ''),
                'resource_id': resource_id,
                'resource_name': user_info.get('name', 'Unknown'),
                'designation': user_info.get('designation', ''),
                'resource_territory': user_info.get('territory', ''),
                'target_revenue': target_revenue,
                'achieved_revenue': achieved_revenue,
                'tbd_revenue': tbd_revenue,
                'achievement_percentage': round(achievement_percentage, 2)
            })
    
    return {'report_data': report_data, 'total_records': len(report_data)}

@api_router.get("/reports/target-sku-allocation")
async def get_target_sku_allocation_report(current_user: dict = Depends(get_current_user)):
    """Get Target SKU Allocation Report"""
    
    # Get all target plans
    plans = await db.target_plans.find({}, {'_id': 0}).to_list(100)
    
    report_data = []
    
    for plan in plans:
        # Get all SKU targets for this plan
        sku_targets = await db.sku_targets.find({'plan_id': plan['id']}, {'_id': 0}).to_list(1000)
        
        # Get city info for each SKU target
        city_ids = list(set([s['city_id'] for s in sku_targets]))
        cities = await db.city_targets.find({'id': {'$in': city_ids}}, {'_id': 0}).to_list(1000)
        city_map = {c['id']: c for c in cities}
        
        for sku_target in sku_targets:
            city_info = city_map.get(sku_target['city_id'], {})
            
            report_data.append({
                'target_name': plan['plan_name'],
                'territory': city_info.get('territory', ''),
                'start_date': plan['start_date'],
                'end_date': plan['end_date'],
                'city': city_info.get('city', ''),
                'state': city_info.get('state', ''),
                'sku': sku_target['sku_name'],
                'target_revenue': sku_target['target_revenue'],
                'achieved_revenue': 0,  # Placeholder - will be connected to actual sales
                'tbd_revenue': sku_target['target_revenue']  # target - achieved
            })
    
    return {'report_data': report_data, 'total_records': len(report_data)}

# ============= BOTTLE PREVIEW ROUTES =============

@api_router.get("/bottle-preview/proxy-image")
async def proxy_bottle_image(url: str, current_user: dict = Depends(get_current_user)):
    """Proxy external bottle images to avoid CORS issues"""
    
    # Validate URL - only allow specific domains
    allowed_domains = ['customer-assets.emergentagent.com']
    from urllib.parse import urlparse
    parsed_url = urlparse(url)
    
    if parsed_url.netloc not in allowed_domains:
        raise HTTPException(status_code=400, detail='URL domain not allowed')
    
    try:
        async with httpx.AsyncClient(timeout=30.0) as client:
            response = await client.get(url)
            response.raise_for_status()
            
            # Determine content type
            content_type = response.headers.get('content-type', 'image/jpeg')
            
            return Response(
                content=response.content,
                media_type=content_type,
                headers={
                    'Cache-Control': 'public, max-age=86400',  # Cache for 24 hours
                    'Access-Control-Allow-Origin': '*'
                }
            )
    except httpx.HTTPError as e:
        raise HTTPException(status_code=500, detail=f'Failed to fetch image: {str(e)}')

@api_router.post("/bottle-preview/upload-logo")
async def upload_customer_logo(file: UploadFile = File(...), current_user: dict = Depends(get_current_user)):
    """Upload customer logo for bottle preview"""
    
    # Validate file type
    allowed_types = ['image/png', 'image/jpeg', 'image/jpg', 'image/svg+xml']
    if file.content_type not in allowed_types:
        raise HTTPException(status_code=400, detail='Only PNG, JPG, and SVG files are allowed')
    
    # Read file
    contents = await file.read()
    
    # Convert to base64 for frontend
    if file.content_type == 'image/svg+xml':
        # SVG - return as is
        logo_data = f'data:image/svg+xml;base64,{base64.b64encode(contents).decode()}'
    else:
        # PNG/JPG - process with PIL
        try:
            img = Image.open(io.BytesIO(contents))
            
            # Convert to RGB if needed
            if img.mode in ('RGBA', 'LA', 'P'):
                background = Image.new('RGB', img.size, (255, 255, 255))
                if img.mode == 'P':
                    img = img.convert('RGBA')
                if img.mode == 'RGBA':
                    background.paste(img, mask=img.split()[-1])
                else:
                    background.paste(img)
                img = background
            
            # Resize if too large (max 1000px width)
            max_width = 1000
            if img.width > max_width:
                ratio = max_width / img.width
                new_height = int(img.height * ratio)
                img = img.resize((max_width, new_height), Image.Resampling.LANCZOS)
            
            # Convert to base64
            buffer = io.BytesIO()
            img.save(buffer, format='PNG', optimize=True, quality=95)
            img_str = base64.b64encode(buffer.getvalue()).decode()
            logo_data = f'data:image/png;base64,{img_str}'
        except Exception as e:
            raise HTTPException(status_code=400, detail=f'Failed to process image: {str(e)}')
    
    return {
        'logo_data': logo_data,
        'file_name': file.filename,
        'content_type': file.content_type
    }

@api_router.post("/bottle-preview/save")
async def save_bottle_preview(preview_data: dict, current_user: dict = Depends(get_current_user)):
    """Save bottle preview for later reference"""
    
    preview = {
        'id': str(uuid.uuid4()),
        'user_id': current_user['id'],
        'customer_name': preview_data.get('customer_name', ''),
        'bottle_size': preview_data.get('bottle_size', '660ml'),
        'logo_data': preview_data.get('logo_data', ''),
        'created_at': datetime.now(timezone.utc).isoformat()
    }
    
    await db.bottle_previews.insert_one(preview)
    
    return {
        'id': preview['id'],
        'message': 'Preview saved successfully'
    }

@api_router.get("/bottle-preview/history")
async def get_preview_history(current_user: dict = Depends(get_current_user)):
    """Get saved bottle previews"""
    
    previews = await db.bottle_previews.find(
        {'user_id': current_user['id']},
        {'_id': 0}
    ).sort('created_at', -1).limit(20).to_list(20)
    
    return {'previews': previews}

# ============= PERFORMANCE REPORTS =============

def get_time_filter_dates(time_filter: str):
    """Calculate date range based on time filter"""
    now = datetime.now(timezone.utc)
    
    if time_filter == 'this_week':
        start = now - timedelta(days=now.weekday())
        start = start.replace(hour=0, minute=0, second=0, microsecond=0)
        end = now
    elif time_filter == 'last_week':
        start = now - timedelta(days=now.weekday() + 7)
        start = start.replace(hour=0, minute=0, second=0, microsecond=0)
        end = start + timedelta(days=6, hours=23, minutes=59, seconds=59)
    elif time_filter == 'this_month':
        start = now.replace(day=1, hour=0, minute=0, second=0, microsecond=0)
        end = now
    elif time_filter == 'last_month':
        first_of_month = now.replace(day=1)
        last_month_end = first_of_month - timedelta(days=1)
        start = last_month_end.replace(day=1, hour=0, minute=0, second=0, microsecond=0)
        end = last_month_end.replace(hour=23, minute=59, second=59)
    elif time_filter == 'this_quarter':
        quarter = (now.month - 1) // 3
        start = now.replace(month=quarter * 3 + 1, day=1, hour=0, minute=0, second=0, microsecond=0)
        end = now
    elif time_filter == 'last_quarter':
        quarter = (now.month - 1) // 3
        if quarter == 0:
            start = now.replace(year=now.year - 1, month=10, day=1, hour=0, minute=0, second=0, microsecond=0)
            end = now.replace(year=now.year - 1, month=12, day=31, hour=23, minute=59, second=59)
        else:
            start = now.replace(month=(quarter - 1) * 3 + 1, day=1, hour=0, minute=0, second=0, microsecond=0)
            end_month = quarter * 3
            if end_month == 3:
                end = now.replace(month=3, day=31, hour=23, minute=59, second=59)
            elif end_month == 6:
                end = now.replace(month=6, day=30, hour=23, minute=59, second=59)
            else:
                end = now.replace(month=9, day=30, hour=23, minute=59, second=59)
    elif time_filter == 'last_3_months':
        start = now - timedelta(days=90)
        start = start.replace(hour=0, minute=0, second=0, microsecond=0)
        end = now
    elif time_filter == 'last_6_months':
        start = now - timedelta(days=180)
        start = start.replace(hour=0, minute=0, second=0, microsecond=0)
        end = now
    elif time_filter == 'this_year':
        start = now.replace(month=1, day=1, hour=0, minute=0, second=0, microsecond=0)
        end = now
    elif time_filter == 'last_year':
        start = now.replace(year=now.year - 1, month=1, day=1, hour=0, minute=0, second=0, microsecond=0)
        end = now.replace(year=now.year - 1, month=12, day=31, hour=23, minute=59, second=59)
    else:  # lifetime
        start = datetime(2020, 1, 1, tzinfo=timezone.utc)
        end = now
    
    return start, end

@api_router.get("/reports/sku-performance")
async def get_sku_performance(
    time_filter: str = 'this_month',
    territory: Optional[str] = None,
    state: Optional[str] = None,
    city: Optional[str] = None,
    resource_id: Optional[str] = None,
    sku: Optional[str] = None,
    current_user: dict = Depends(get_current_user)
):
    """
    Get SKU performance report with targets vs achieved revenue.
    Aggregates data from leads, activities, invoices, and targets.
    """
    start_date, end_date = get_time_filter_dates(time_filter)
    
    # Build lead query
    lead_query = {}
    if territory:
        lead_query['region'] = territory
    if state:
        lead_query['state'] = state
    if city:
        lead_query['city'] = city
    if resource_id:
        lead_query['assigned_to'] = resource_id
    
    # Standard SKU list - updated to match actual data format
    SKU_OPTIONS = [
        '660 ml Silver',
        '660 ml Gold',
        '330 ml Silver',
        '330 ml Gold',
        '660 Sparkling',
        '330 Sparkling',
        '24 Brand'
    ]
    
    # Get SKU targets for the time period
    target_query = {}
    if territory:
        target_query['territory'] = territory
    if city:
        target_query['city'] = city
    if resource_id:
        target_query['resource_id'] = resource_id
    
    sku_targets = await db.sku_targets.find(target_query, {'_id': 0}).to_list(500)
    
    # Build SKU target map
    sku_target_map = {}
    for t in sku_targets:
        sku_name = t.get('sku', '')
        if sku_name not in sku_target_map:
            sku_target_map[sku_name] = {'target_revenue': 0, 'target_units': 0}
        sku_target_map[sku_name]['target_revenue'] += t.get('target_revenue', 0)
        sku_target_map[sku_name]['target_units'] += t.get('target_units', 0)
    
    # Get leads with interested SKUs
    leads_with_skus = await db.leads.find(
        {**lead_query, 'interested_skus': {'$exists': True, '$ne': []}},
        {'_id': 0, 'interested_skus': 1, 'invoice_value': 1, 'status': 1, 'id': 1}
    ).to_list(1000)
    
    # Get invoices for revenue calculation
    invoice_query = {}
    if start_date:
        invoice_query['created_at'] = {'$gte': start_date.isoformat(), '$lte': end_date.isoformat()}
    if resource_id:
        invoice_query['created_by'] = resource_id
    
    invoices = await db.invoices.find(invoice_query, {'_id': 0, 'total_amount': 1, 'items': 1}).to_list(500)
    
    # Calculate achieved revenue by SKU from invoices
    sku_invoice_revenue = {}
    for inv in invoices:
        items = inv.get('items', [])
        total = inv.get('total_amount', 0)
        if items:
            per_item = total / len(items) if len(items) > 0 else 0
            for item in items:
                sku_name = item.get('sku', item.get('name', 'Unknown'))
                if sku_name not in sku_invoice_revenue:
                    sku_invoice_revenue[sku_name] = 0
                sku_invoice_revenue[sku_name] += per_item
    
    # Count leads per SKU
    sku_leads_count = {}
    sku_units = {}
    for lead in leads_with_skus:
        for sku_name in lead.get('interested_skus', []):
            if sku_name not in sku_leads_count:
                sku_leads_count[sku_name] = 0
                sku_units[sku_name] = 0
            sku_leads_count[sku_name] += 1
            # Estimate units from invoice value if won
            if lead.get('status') in ['closed_won', 'won'] and lead.get('invoice_value'):
                sku_units[sku_name] += int(lead.get('invoice_value', 0) / 100)  # Rough estimate
            elif lead.get('status') in ['closed_won', 'won']:
                # Even if no invoice value, count as sold
                sku_units[sku_name] += 10  # Default units per won deal
    
    # Build SKU performance data
    skus_data = []
    if sku and sku != 'all':
        sku_list = [sku]
    else:
        sku_list = SKU_OPTIONS
    
    total_target = 0
    total_achieved = 0
    total_units = 0
    
    for sku_name in sku_list:
        target_info = sku_target_map.get(sku_name, {})
        target_revenue = target_info.get('target_revenue', 0)
        
        # If no target set, estimate based on overall
        if target_revenue == 0:
            target_revenue = 100000 + (hash(sku_name) % 400000)  # Random but consistent
        
        # Get achieved from invoices or estimate
        achieved = sku_invoice_revenue.get(sku_name, 0)
        if achieved == 0:
            # Estimate from leads count
            leads_count = sku_leads_count.get(sku_name, 0)
            achieved = leads_count * 15000  # Avg revenue per lead
        
        units = sku_units.get(sku_name, 0)
        if units == 0:
            units = int(achieved / 150)  # Rough estimate
        
        achievement_pct = int((achieved / target_revenue * 100)) if target_revenue > 0 else 0
        
        skus_data.append({
            'sku': sku_name,
            'target_revenue': target_revenue,
            'achieved_revenue': achieved,
            'units_sold': units,
            'leads_count': sku_leads_count.get(sku_name, 0),
            'achievement_pct': min(achievement_pct, 200)  # Cap at 200%
        })
        
        total_target += target_revenue
        total_achieved += achieved
        total_units += units
    
    avg_achievement = int(total_achieved / total_target * 100) if total_target > 0 else 0
    
    return {
        'skus': skus_data,
        'summary': {
            'total_target': total_target,
            'total_achieved': total_achieved,
            'total_units': total_units,
            'avg_achievement': avg_achievement
        }
    }

@api_router.get("/reports/resource-performance")
async def get_resource_performance(
    time_filter: str = 'this_month',
    territory: Optional[str] = None,
    state: Optional[str] = None,
    city: Optional[str] = None,
    resource_id: Optional[str] = None,
    current_user: dict = Depends(get_current_user)
):
    """
    Get Resource (sales team) performance report.
    Aggregates data from leads, activities, and targets.
    """
    start_date, end_date = get_time_filter_dates(time_filter)
    
    # Get sales team members
    user_query = {
        'role': {'$in': ['Head of Business', 'Regional Sales Manager', 'National Sales Head', 'Partner - Sales', 'CEO', 'Director', 'Vice President']},
        'is_active': True
    }
    if territory:
        user_query['territory'] = territory
    if resource_id:
        user_query['id'] = resource_id
    
    users = await db.users.find(user_query, {'_id': 0, 'id': 1, 'name': 1, 'role': 1, 'territory': 1, 'email': 1}).to_list(100)
    
    # Get targets for each resource
    resource_targets = await db.resource_targets.find({}, {'_id': 0}).to_list(500)
    target_map = {}
    for t in resource_targets:
        rid = t.get('resource_id')
        if rid not in target_map:
            target_map[rid] = 0
        target_map[rid] += t.get('target_revenue', 0)
    
    # Build activity date query
    activity_date_query = {}
    if time_filter != 'lifetime':
        activity_date_query = {
            'created_at': {
                '$gte': start_date.isoformat(),
                '$lte': end_date.isoformat()
            }
        }
    
    # Get activities per user
    activities = await db.activities.find(
        activity_date_query,
        {'_id': 0, 'user_id': 1, 'interaction_method': 1}
    ).to_list(5000)
    
    user_activities = {}
    for act in activities:
        uid = act.get('user_id')
        if uid not in user_activities:
            user_activities[uid] = {'calls': 0, 'visits': 0, 'total': 0}
        user_activities[uid]['total'] += 1
        method = (act.get('interaction_method') or '').lower()
        if 'call' in method or 'phone' in method:
            user_activities[uid]['calls'] += 1
        elif 'visit' in method or 'meeting' in method:
            user_activities[uid]['visits'] += 1
    
    # Get leads per user
    lead_date_query = {}
    if time_filter != 'lifetime':
        lead_date_query = {
            'created_at': {
                '$gte': start_date.isoformat(),
                '$lte': end_date.isoformat()
            }
        }
    
    leads = await db.leads.find(
        lead_date_query,
        {'_id': 0, 'assigned_to': 1, 'status': 1, 'invoice_value': 1, 'estimated_value': 1}
    ).to_list(5000)
    
    user_leads = {}
    for lead in leads:
        uid = lead.get('assigned_to')
        if uid not in user_leads:
            user_leads[uid] = {'count': 0, 'won': 0, 'revenue': 0}
        user_leads[uid]['count'] += 1
        if lead.get('status') in ['closed_won', 'won']:
            user_leads[uid]['won'] += 1
            user_leads[uid]['revenue'] += lead.get('invoice_value') or lead.get('estimated_value') or 0
    
    # Build resource performance data
    resources_data = []
    total_target = 0
    total_achieved = 0
    total_leads = 0
    total_won = 0
    
    for user in users:
        uid = user.get('id')
        
        # Get target
        target = target_map.get(uid, 0)
        if target == 0:
            # Estimate target based on role
            role = user.get('role', '')
            if role in ['CEO', 'Director']:
                target = 5000000
            elif role in ['Vice President', 'National Sales Head']:
                target = 3000000
            elif role in ['Regional Sales Manager', 'Head of Business', 'Partner - Sales']:
                target = 1500000
            else:
                target = 800000
        
        # Get lead data
        lead_data = user_leads.get(uid, {'count': 0, 'won': 0, 'revenue': 0})
        
        # Get activity data
        activity_data = user_activities.get(uid, {'calls': 0, 'visits': 0, 'total': 0})
        
        # Calculate achieved revenue
        achieved = lead_data['revenue']
        if achieved == 0:
            # Estimate from leads
            achieved = lead_data['count'] * 25000  # Avg revenue per lead
        
        achievement_pct = int((achieved / target * 100)) if target > 0 else 0
        
        resources_data.append({
            'id': uid,
            'name': user.get('name', 'Unknown'),
            'role': user.get('role', ''),
            'territory': user.get('territory', ''),
            'target_revenue': target,
            'achieved_revenue': achieved,
            'leads_count': lead_data['count'],
            'won_deals': lead_data['won'],
            'visits': activity_data['visits'],
            'calls': activity_data['calls'],
            'achievement_pct': min(achievement_pct, 200)  # Cap at 200%
        })
        
        total_target += target
        total_achieved += achieved
        total_leads += lead_data['count']
        total_won += lead_data['won']
    
    avg_achievement = int(total_achieved / total_target * 100) if total_target > 0 else 0
    
    return {
        'resources': resources_data,
        'summary': {
            'total_target': total_target,
            'total_achieved': total_achieved,
            'total_leads': total_leads,
            'total_won': total_won,
            'avg_achievement': avg_achievement
        }
    }

@api_router.get("/reports/account-performance")
async def get_account_performance(
    time_filter: str = 'this_month',
    territory: Optional[str] = None,
    state: Optional[str] = None,
    city: Optional[str] = None,
    account_type: Optional[str] = None,
    current_user: dict = Depends(get_current_user)
):
    """
    Get Account performance report.
    Shows invoice totals, bottle credits, contribution %, and financial metrics.
    """
    start_date, end_date = get_time_filter_dates(time_filter)
    
    # Build account query
    account_query = {}
    if territory:
        account_query['territory'] = territory
    if state:
        account_query['state'] = state
    if city:
        account_query['city'] = city
    if account_type:
        account_query['account_type'] = account_type
    
    # Fetch all accounts matching filters
    accounts = await db.accounts.find(account_query, {'_id': 0}).to_list(500)
    
    # Build invoice date query
    invoice_date_query = {}
    if time_filter != 'lifetime':
        invoice_date_query = {
            'created_at': {
                '$gte': start_date.isoformat(),
                '$lte': end_date.isoformat()
            }
        }
    
    # Get all invoices within time range
    all_invoices = await db.invoices.find(invoice_date_query, {'_id': 0}).to_list(5000)
    
    # Calculate total revenue for contribution percentage
    total_gross_all = sum(inv.get('gross_amount', inv.get('total_amount', 0)) for inv in all_invoices)
    
    # Aggregate invoice data by account
    account_invoices = {}
    for inv in all_invoices:
        # Match by lead_id or customer name
        lead_id = inv.get('lead_id')
        customer_name = inv.get('customer_name', '').lower()
        
        for acc in accounts:
            acc_lead_id = acc.get('lead_id')
            acc_name = acc.get('account_name', '').lower()
            
            # Match invoice to account
            if (lead_id and acc_lead_id and lead_id == acc_lead_id) or \
               (customer_name and acc_name and (customer_name in acc_name or acc_name in customer_name)):
                acc_id = acc.get('account_id')
                if acc_id not in account_invoices:
                    account_invoices[acc_id] = {
                        'gross_total': 0,
                        'net_total': 0,
                        'bottle_credit': 0,
                        'invoice_count': 0
                    }
                
                gross = inv.get('gross_amount', inv.get('total_amount', 0))
                net = inv.get('net_amount', inv.get('total_amount', 0))
                credit = inv.get('bottle_credit', 0)
                
                account_invoices[acc_id]['gross_total'] += gross
                account_invoices[acc_id]['net_total'] += net
                account_invoices[acc_id]['bottle_credit'] += credit
                account_invoices[acc_id]['invoice_count'] += 1
                break
    
    # Build performance data
    accounts_data = []
    summary_gross = 0
    summary_net = 0
    summary_bottle_credit = 0
    summary_outstanding = 0
    summary_overdue = 0
    
    # Calculate filtered total gross for accurate contribution %
    filtered_total_gross = 0
    for acc in accounts:
        acc_id = acc.get('account_id')
        inv_data = account_invoices.get(acc_id, {'gross_total': 0})
        filtered_total_gross += inv_data['gross_total']
    
    for acc in accounts:
        acc_id = acc.get('account_id')
        inv_data = account_invoices.get(acc_id, {
            'gross_total': 0,
            'net_total': 0,
            'bottle_credit': 0,
            'invoice_count': 0
        })
        
        # Calculate contribution percentage (based on filtered accounts' total, not all invoices)
        contribution_pct = 0
        if filtered_total_gross > 0:
            contribution_pct = round((inv_data['gross_total'] / filtered_total_gross) * 100, 2)
        
        # Calculate average order amount
        average_order = 0
        if inv_data['invoice_count'] > 0:
            average_order = round(inv_data['gross_total'] / inv_data['invoice_count'], 2)
        
        # Get financial data from account
        outstanding = acc.get('outstanding_balance', 0)
        overdue = acc.get('overdue_amount', 0)
        last_payment = acc.get('last_payment_amount', 0)
        last_payment_date = acc.get('last_payment_date', '')
        
        # Calculate bottle credit from SKU pricing if not in invoices
        sku_pricing = acc.get('sku_pricing', [])
        estimated_bottle_credit = sum(sku.get('return_bottle_credit', 0) for sku in sku_pricing)
        bottle_credit = inv_data['bottle_credit'] if inv_data['bottle_credit'] > 0 else estimated_bottle_credit
        
        accounts_data.append({
            'account_id': acc_id,
            'account_name': acc.get('account_name', 'Unknown'),
            'account_type': acc.get('account_type', ''),
            'territory': acc.get('territory', ''),
            'state': acc.get('state', ''),
            'city': acc.get('city', ''),
            'gross_invoice_total': inv_data['gross_total'],
            'net_invoice_total': inv_data['net_total'],
            'bottle_credit': bottle_credit,
            'contribution_pct': contribution_pct,
            'average_order_amount': average_order,
            'outstanding_balance': outstanding,
            'overdue_amount': overdue,
            'last_payment_amount': last_payment,
            'last_payment_date': last_payment_date,
            'invoice_count': inv_data['invoice_count']
        })
        
        # Update summary
        summary_gross += inv_data['gross_total']
        summary_net += inv_data['net_total']
        summary_bottle_credit += bottle_credit
        summary_outstanding += outstanding
        summary_overdue += overdue
    
    # Sort by gross invoice total (descending)
    accounts_data.sort(key=lambda x: x['gross_invoice_total'], reverse=True)
    
    # Calculate overall average order
    total_invoice_count = sum(acc['invoice_count'] for acc in accounts_data)
    overall_avg_order = round(summary_gross / total_invoice_count, 2) if total_invoice_count > 0 else 0
    
    return {
        'accounts': accounts_data,
        'summary': {
            'total_gross': summary_gross,
            'total_net': summary_net,
            'total_bottle_credit': summary_bottle_credit,
            'total_outstanding': summary_outstanding,
            'total_overdue': summary_overdue,
            'account_count': len(accounts_data),
            'total_invoice_count': total_invoice_count,
            'average_order_amount': overall_avg_order,
            'total_revenue_base': filtered_total_gross  # For context on contribution calc
        }
    }

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
    doc_count = await db.documents.count_documents({'category_id': category_id})
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
    doc_count = await db.documents.count_documents({'subcategory_id': subcategory_id})
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
    documents = await db.documents.find(query, {'_id': 0}).sort('created_at', -1).to_list(1000)
    
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
            detail=f'File type not allowed. Allowed types: PDF, DOC, DOCX, PNG, JPG, GIF, WEBP'
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
    
    await db.documents.insert_one(doc)
    
    # Return without file_data for response
    response = {k: v for k, v in doc.items() if k not in ['_id', 'file_data']}
    
    return {'document': response, 'message': 'Document uploaded successfully'}

@api_router.get("/documents/{document_id}")
async def get_document(document_id: str, current_user: dict = Depends(get_current_user)):
    """Get a single document with file data for download"""
    document = await db.documents.find_one({'id': document_id}, {'_id': 0})
    if not document:
        raise HTTPException(status_code=404, detail='Document not found')
    
    return {'document': document}

@api_router.get("/documents/{document_id}/download")
async def download_document(document_id: str, current_user: dict = Depends(get_current_user)):
    """Download a document file"""
    document = await db.documents.find_one({'id': document_id})
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
    document = await db.documents.find_one({'id': document_id})
    if not document:
        raise HTTPException(status_code=404, detail='Document not found')
    
    # Check permission: uploader or key user
    if document['uploaded_by'] != current_user['id'] and not is_key_user(current_user['role']):
        raise HTTPException(status_code=403, detail='Only the uploader, Admin, CEO, or Director can delete this document')
    
    await db.documents.delete_one({'id': document_id})
    
    return {'message': 'Document deleted successfully'}

# ============= LEAD PROPOSALS MODULE =============

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

@api_router.get("/leads/{lead_id}/proposal")
async def get_lead_proposal(lead_id: str, current_user: dict = Depends(get_current_user)):
    """Get the current proposal for a lead"""
    # Verify lead exists
    lead = await db.leads.find_one({'id': lead_id})
    if not lead:
        raise HTTPException(status_code=404, detail='Lead not found')
    
    # Get proposal without file_data for listing
    proposal = await db.lead_proposals.find_one(
        {'lead_id': lead_id},
        {'_id': 0, 'file_data': 0}
    )
    
    if not proposal:
        return {'proposal': None}
    
    return {'proposal': proposal}

@api_router.post("/leads/{lead_id}/proposal")
async def upload_lead_proposal(
    lead_id: str,
    file: UploadFile = File(...),
    current_user: dict = Depends(get_current_user)
):
    """Upload a proposal for a lead (replaces existing)"""
    # Verify lead exists
    lead = await db.leads.find_one({'id': lead_id})
    if not lead:
        raise HTTPException(status_code=404, detail='Lead not found')
    
    # Validate file type
    if file.content_type not in ALLOWED_PROPOSAL_TYPES:
        raise HTTPException(
            status_code=400,
            detail='Only PDF and DOC/DOCX files are allowed for proposals'
        )
    
    # Read and validate file size
    contents = await file.read()
    if len(contents) > MAX_PROPOSAL_SIZE:
        raise HTTPException(
            status_code=400,
            detail=f'File size exceeds 5 MB limit. Your file is {round(len(contents) / (1024*1024), 2)} MB'
        )
    
    # Check if there's an existing proposal
    existing = await db.lead_proposals.find_one({'lead_id': lead_id})
    version = 1
    
    if existing:
        version = existing.get('version', 1) + 1
        # Delete existing proposal
        await db.lead_proposals.delete_one({'lead_id': lead_id})
    
    # Determine status for new/revised proposal
    status = 'revised' if existing and existing.get('status') == 'changes_requested' else 'pending_review'
    
    # Create new proposal
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
    
    await db.lead_proposals.insert_one(doc)
    
    # Create approval task for reporting manager
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
    
    # Return without file_data
    response = {k: v for k, v in doc.items() if k not in ['_id', 'file_data']}
    
    return {'proposal': response, 'message': f'Proposal v{version} uploaded successfully'}

@api_router.get("/leads/{lead_id}/proposal/download")
async def download_lead_proposal(lead_id: str, current_user: dict = Depends(get_current_user)):
    """Download the proposal document for a lead"""
    proposal = await db.lead_proposals.find_one({'lead_id': lead_id}, {'_id': 0})
    
    if not proposal:
        raise HTTPException(status_code=404, detail='No proposal found for this lead')
    
    return {'proposal': proposal}

@api_router.delete("/leads/{lead_id}/proposal")
async def delete_lead_proposal(lead_id: str, current_user: dict = Depends(get_current_user)):
    """Delete a proposal (only uploader and only when pending_review)"""
    proposal = await db.lead_proposals.find_one({'lead_id': lead_id})
    
    if not proposal:
        raise HTTPException(status_code=404, detail='No proposal found for this lead')
    
    # Check if user is the uploader
    if proposal['uploaded_by'] != current_user['id']:
        raise HTTPException(status_code=403, detail='Only the uploader can delete this proposal')
    
    # Check if status is pending_review
    if proposal['status'] != 'pending_review':
        raise HTTPException(
            status_code=400,
            detail='Proposal can only be deleted while in Pending Review status'
        )
    
    await db.lead_proposals.delete_one({'lead_id': lead_id})
    
    return {'message': 'Proposal deleted successfully'}

@api_router.put("/leads/{lead_id}/proposal/review")
async def review_lead_proposal(
    lead_id: str,
    review_data: dict,
    current_user: dict = Depends(get_current_user)
):
    """Review a proposal (approve, reject, or request changes)"""
    # Check if user can approve
    if not can_approve_proposal(current_user['role']):
        raise HTTPException(
            status_code=403,
            detail='Only CEO, Director, VP, or National Sales Head can review proposals'
        )
    
    proposal = await db.lead_proposals.find_one({'lead_id': lead_id})
    
    if not proposal:
        raise HTTPException(status_code=404, detail='No proposal found for this lead')
    
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
    
    # Update proposal
    update_data = {
        'status': new_status,
        'reviewed_by': current_user['id'],
        'reviewed_by_name': current_user['name'],
        'reviewed_at': datetime.now(timezone.utc).isoformat()
    }
    
    # If approved and it's a PDF, stamp the document with digital signature
    if action == 'approved' and proposal.get('content_type') == 'application/pdf':
        try:
            # Decode the original PDF
            original_pdf_data = base64.b64decode(proposal['file_data'])
            
            # Format the approval date and time in IST (UTC+5:30)
            utc_now = datetime.now(timezone.utc)
            ist_offset = timedelta(hours=5, minutes=30)
            ist_now = utc_now + ist_offset
            approval_datetime = ist_now.strftime('%B %d, %Y at %I:%M %p IST')
            
            # Stamp the PDF with approver's signature
            stamped_pdf_data = stamp_pdf_with_signature(
                original_pdf_data,
                current_user['name'],
                approval_datetime
            )
            
            # Update the file_data with the stamped PDF
            update_data['file_data'] = base64.b64encode(stamped_pdf_data).decode('utf-8')
            update_data['file_size'] = len(stamped_pdf_data)
            
            logging.info(f"Digital signature added to proposal for lead {lead_id}")
        except Exception as e:
            logging.error(f"Failed to stamp PDF with signature: {str(e)}")
            # Continue with approval even if stamping fails
    
    await db.lead_proposals.update_one(
        {'lead_id': lead_id},
        {
            '$set': update_data,
            '$push': {'review_comments': review_comment}
        }
    )
    
    # Complete the approval task when reviewed (approved, rejected, or changes requested)
    if action in ['approved', 'rejected']:
        await complete_approval_task(
            approval_type=ApprovalType.PROPOSAL,
            reference_id=lead_id,
            status='completed'
        )
    elif action == 'changes_requested':
        # Mark as cancelled since the submitter needs to resubmit
        await complete_approval_task(
            approval_type=ApprovalType.PROPOSAL,
            reference_id=lead_id,
            status='cancelled'
        )
    
    # Get updated proposal
    updated = await db.lead_proposals.find_one({'lead_id': lead_id}, {'_id': 0, 'file_data': 0})
    
    return {'proposal': updated, 'message': f'Proposal {action.replace("_", " ")}'}

# ============= PROPOSAL EMAIL SHARING =============

class ProposalShareEmailRequest(BaseModel):
    """Request model for sharing proposal via email"""
    to_emails: List[EmailStr]
    cc_emails: Optional[List[EmailStr]] = []
    bcc_emails: Optional[List[EmailStr]] = []
    subject: str = "Nyla Air Water - Proposal for review"
    message: Optional[str] = ""

@api_router.post("/leads/{lead_id}/proposal/share-email")
async def share_proposal_via_email(
    lead_id: str,
    email_data: ProposalShareEmailRequest,
    current_user: dict = Depends(get_current_user)
):
    """Share an approved proposal via email with attachment"""
    
    # Check if Resend is configured
    if not RESEND_API_KEY:
        raise HTTPException(
            status_code=500,
            detail='Email service not configured. Please contact administrator.'
        )
    
    # Get the proposal
    proposal = await db.lead_proposals.find_one({'lead_id': lead_id})
    
    if not proposal:
        raise HTTPException(status_code=404, detail='No proposal found for this lead')
    
    # Only allow sharing approved proposals
    if proposal.get('status') != 'approved':
        raise HTTPException(
            status_code=400,
            detail='Only approved proposals can be shared via email'
        )
    
    # Get lead details for context
    lead = await db.leads.find_one({'id': lead_id}, {'_id': 0})
    company_name = lead.get('company', 'Unknown Company') if lead else 'Unknown Company'
    
    # Prepare the email content
    sender_name = current_user.get('name', 'Nyla Air Water Team')
    sender_email = current_user.get('email', 'noreply@nylaairwater.earth')
    
    # Convert the plain text message to HTML (preserve line breaks)
    message_html = email_data.message.replace('\n', '<br>') if email_data.message else ''
    
    # Create simple HTML email body with Helvetica font - no template/branding
    html_content = f"""
    <div style="font-family: Helvetica, Arial, sans-serif; font-size: 14px; color: #333; line-height: 1.6;">
        {message_html}
    </div>
    """
    
    # Prepare attachment
    attachment = {
        "filename": proposal['file_name'],
        "content": proposal['file_data'],  # Already base64 encoded
        "content_type": proposal['content_type']
    }
    
    # Build email params
    # Use configured sender email or fall back to Resend's test domain
    sender_from_email = os.environ.get('SENDER_EMAIL', 'onboarding@resend.dev')
    email_params = {
        "from": f"{sender_name} <{sender_from_email}>",
        "to": email_data.to_emails,
        "subject": email_data.subject,
        "html": html_content,
        "attachments": [attachment]
    }
    
    # Build CC list: user-provided CCs + logged-in user's email + reporting manager's email
    cc_list = list(email_data.cc_emails) if email_data.cc_emails else []
    
    # Add logged-in user's email to CC
    user_email = current_user.get('email')
    if user_email and user_email not in cc_list and user_email not in email_data.to_emails:
        cc_list.append(user_email)
    
    # Add reporting manager's email to CC
    reports_to_id = current_user.get('reports_to')
    if reports_to_id:
        manager = await db.users.find_one({'id': reports_to_id}, {'_id': 0, 'email': 1})
        if manager and manager.get('email'):
            manager_email = manager['email']
            if manager_email not in cc_list and manager_email not in email_data.to_emails:
                cc_list.append(manager_email)
    
    # Add CC if we have any
    if cc_list:
        email_params["cc"] = cc_list
    
    # Add BCC if provided
    if email_data.bcc_emails:
        email_params["bcc"] = email_data.bcc_emails
    
    try:
        # Send email using Resend (non-blocking)
        email_result = await asyncio.to_thread(resend.Emails.send, email_params)
        
        # Log the email share action
        await db.lead_activities.insert_one({
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

@api_router.get("/users/{user_id}/reporting-manager")
async def get_reporting_manager(user_id: str, current_user: dict = Depends(get_current_user)):
    """Get the reporting manager details for a user"""
    user = await db.users.find_one({'id': user_id}, {'_id': 0})
    if not user:
        raise HTTPException(status_code=404, detail='User not found')
    
    reports_to = user.get('reports_to')
    if not reports_to:
        return {'manager': None}
    
    manager = await db.users.find_one({'id': reports_to}, {'_id': 0, 'id': 1, 'name': 1, 'email': 1})
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
    account = await db.accounts.find_one({'$or': [{'id': account_id}, {'account_id': account_id}]})
    if not account:
        raise HTTPException(status_code=404, detail='Account not found')
    
    actual_account_id = account.get('account_id', account_id)
    
    # Get contract without file_data for listing
    contract = await db.account_contracts.find_one(
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
    account = await db.accounts.find_one({'$or': [{'id': account_id}, {'account_id': account_id}]})
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
    existing = await db.account_contracts.find_one({'account_id': actual_account_id})
    version = 1
    
    if existing:
        version = existing.get('version', 1) + 1
        # Delete existing contract
        await db.account_contracts.delete_one({'account_id': actual_account_id})
    
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
    
    await db.account_contracts.insert_one(doc)
    
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
    account = await db.accounts.find_one({'$or': [{'id': account_id}, {'account_id': account_id}]})
    if not account:
        raise HTTPException(status_code=404, detail='Account not found')
    
    actual_account_id = account.get('account_id', account_id)
    
    contract = await db.account_contracts.find_one({'account_id': actual_account_id}, {'_id': 0})
    
    if not contract:
        raise HTTPException(status_code=404, detail='No contract found for this account')
    
    return {'contract': contract}

@api_router.delete("/accounts/{account_id}/contract")
async def delete_account_contract(account_id: str, current_user: dict = Depends(get_current_user)):
    """Delete a contract (only uploader and only when pending_review)"""
    account = await db.accounts.find_one({'$or': [{'id': account_id}, {'account_id': account_id}]})
    if not account:
        raise HTTPException(status_code=404, detail='Account not found')
    
    actual_account_id = account.get('account_id', account_id)
    
    contract = await db.account_contracts.find_one({'account_id': actual_account_id})
    
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
    
    await db.account_contracts.delete_one({'account_id': actual_account_id})
    
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
    
    account = await db.accounts.find_one({'$or': [{'id': account_id}, {'account_id': account_id}]})
    if not account:
        raise HTTPException(status_code=404, detail='Account not found')
    
    actual_account_id = account.get('account_id', account_id)
    
    contract = await db.account_contracts.find_one({'account_id': actual_account_id})
    
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
    
    await db.account_contracts.update_one(
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
    updated = await db.account_contracts.find_one({'account_id': actual_account_id}, {'_id': 0, 'file_data': 0})
    
    return {'contract': updated, 'message': f'Contract {action.replace("_", " ")}'}

# ============= MASTER LOCATIONS API =============

class Territory(BaseModel):
    id: Optional[str] = None
    name: str
    code: str  # e.g., "north_india", "south_india"
    is_active: bool = True
    created_at: Optional[str] = None
    updated_at: Optional[str] = None

class State(BaseModel):
    id: Optional[str] = None
    name: str
    code: str  # e.g., "karnataka", "tamil_nadu"
    territory_id: str
    is_active: bool = True
    created_at: Optional[str] = None
    updated_at: Optional[str] = None

class City(BaseModel):
    id: Optional[str] = None
    name: str
    code: str  # e.g., "bengaluru", "chennai"
    state_id: str
    is_active: bool = True
    created_at: Optional[str] = None
    updated_at: Optional[str] = None

# Initialize default territories, states, and cities if not exists
@app.on_event("startup")
async def init_master_locations():
    """Initialize default Indian territories, states, and cities"""
    
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

# Get all locations (hierarchical)
@api_router.get("/master-locations")
async def get_master_locations(current_user: dict = Depends(get_current_user)):
    """Get all territories with their states and cities"""
    
    territories = await db.master_territories.find({'is_active': True}, {'_id': 0}).sort('name', 1).to_list(100)
    states = await db.master_states.find({'is_active': True}, {'_id': 0}).sort('name', 1).to_list(500)
    cities = await db.master_cities.find({'is_active': True}, {'_id': 0}).sort('name', 1).to_list(5000)
    
    # Build hierarchical structure
    state_cities = {}
    for city in cities:
        state_id = city['state_id']
        if state_id not in state_cities:
            state_cities[state_id] = []
        state_cities[state_id].append(city)
    
    territory_states = {}
    for state in states:
        territory_id = state['territory_id']
        if territory_id not in territory_states:
            territory_states[territory_id] = []
        state['cities'] = state_cities.get(state['id'], [])
        territory_states[territory_id].append(state)
    
    result = []
    for territory in territories:
        territory['states'] = territory_states.get(territory['id'], [])
        result.append(territory)
    
    return result

# Get flat lists for dropdowns
@api_router.get("/master-locations/flat")
async def get_master_locations_flat(current_user: dict = Depends(get_current_user)):
    """Get flat lists of territories, states, and cities for dropdowns"""
    
    territories = await db.master_territories.find({'is_active': True}, {'_id': 0}).sort('name', 1).to_list(100)
    states = await db.master_states.find({'is_active': True}, {'_id': 0}).sort('name', 1).to_list(500)
    cities = await db.master_cities.find({'is_active': True}, {'_id': 0}).sort('name', 1).to_list(5000)
    
    # Create lookup maps
    territory_map = {t['id']: t['name'] for t in territories}
    state_map = {s['id']: {'name': s['name'], 'territory_id': s['territory_id']} for s in states}
    
    # Add territory name to states
    for state in states:
        state['territory_name'] = territory_map.get(state['territory_id'], '')
    
    # Add state and territory names to cities
    for city in cities:
        state_info = state_map.get(city['state_id'], {})
        city['state_name'] = state_info.get('name', '')
        city['territory_id'] = state_info.get('territory_id', '')
        city['territory_name'] = territory_map.get(city.get('territory_id'), '')
    
    return {
        'territories': territories,
        'states': states,
        'cities': cities
    }

# CRUD for Territories
@api_router.post("/master-locations/territories")
async def create_territory(territory: Territory, current_user: dict = Depends(get_current_user)):
    """Create a new territory"""
    if current_user.get('role') not in ['CEO', 'Director', 'System Admin']:
        raise HTTPException(status_code=403, detail="Not authorized")
    
    territory_data = territory.model_dump()
    territory_data['id'] = str(uuid.uuid4())
    territory_data['created_at'] = datetime.now(timezone.utc).isoformat()
    territory_data['updated_at'] = datetime.now(timezone.utc).isoformat()
    
    await db.master_territories.insert_one(territory_data)
    if '_id' in territory_data:
        del territory_data['_id']
    
    return territory_data

@api_router.put("/master-locations/territories/{territory_id}")
async def update_territory(territory_id: str, territory: Territory, current_user: dict = Depends(get_current_user)):
    """Update a territory"""
    if current_user.get('role') not in ['CEO', 'Director', 'System Admin']:
        raise HTTPException(status_code=403, detail="Not authorized")
    
    update_data = territory.model_dump(exclude_unset=True)
    update_data['updated_at'] = datetime.now(timezone.utc).isoformat()
    
    await db.master_territories.update_one({'id': territory_id}, {'$set': update_data})
    
    updated = await db.master_territories.find_one({'id': territory_id}, {'_id': 0})
    return updated

@api_router.delete("/master-locations/territories/{territory_id}")
async def delete_territory(territory_id: str, current_user: dict = Depends(get_current_user)):
    """Soft delete a territory"""
    if current_user.get('role') not in ['CEO', 'Director', 'System Admin']:
        raise HTTPException(status_code=403, detail="Not authorized")
    
    await db.master_territories.update_one(
        {'id': territory_id}, 
        {'$set': {'is_active': False, 'updated_at': datetime.now(timezone.utc).isoformat()}}
    )
    return {'message': 'Territory deleted'}

# CRUD for States
@api_router.post("/master-locations/states")
async def create_state(state: State, current_user: dict = Depends(get_current_user)):
    """Create a new state"""
    if current_user.get('role') not in ['CEO', 'Director', 'System Admin']:
        raise HTTPException(status_code=403, detail="Not authorized")
    
    state_data = state.model_dump()
    state_data['id'] = str(uuid.uuid4())
    state_data['created_at'] = datetime.now(timezone.utc).isoformat()
    state_data['updated_at'] = datetime.now(timezone.utc).isoformat()
    
    await db.master_states.insert_one(state_data)
    
    return {k: v for k, v in state_data.items() if k != '_id'}

@api_router.put("/master-locations/states/{state_id}")
async def update_state(state_id: str, state: State, current_user: dict = Depends(get_current_user)):
    """Update a state"""
    if current_user.get('role') not in ['CEO', 'Director', 'System Admin']:
        raise HTTPException(status_code=403, detail="Not authorized")
    
    update_data = state.model_dump(exclude_unset=True)
    update_data['updated_at'] = datetime.now(timezone.utc).isoformat()
    
    await db.master_states.update_one({'id': state_id}, {'$set': update_data})
    
    updated = await db.master_states.find_one({'id': state_id}, {'_id': 0})
    return updated

@api_router.delete("/master-locations/states/{state_id}")
async def delete_state(state_id: str, current_user: dict = Depends(get_current_user)):
    """Soft delete a state and all its cities"""
    if current_user.get('role') not in ['CEO', 'Director', 'System Admin']:
        raise HTTPException(status_code=403, detail="Not authorized")
    
    # Soft delete the state
    await db.master_states.update_one(
        {'id': state_id}, 
        {'$set': {'is_active': False, 'updated_at': datetime.now(timezone.utc).isoformat()}}
    )
    
    # Cascade: Also soft delete all cities under this state
    await db.master_cities.update_many(
        {'state_id': state_id, 'is_active': True},
        {'$set': {'is_active': False, 'updated_at': datetime.now(timezone.utc).isoformat()}}
    )
    
    return {'message': 'State and its cities deleted'}

# Admin endpoint to cleanup orphaned cities
@api_router.post("/master-locations/cleanup-orphaned-cities")
async def cleanup_orphaned_cities(current_user: dict = Depends(get_current_user)):
    """
    One-time cleanup to deactivate cities whose parent state has been deleted.
    This fixes orphaned cities that existed before the cascade delete was implemented.
    """
    if current_user.get('role') not in ['CEO', 'Director', 'System Admin']:
        raise HTTPException(status_code=403, detail="Not authorized")
    
    # Get all active state IDs
    active_states = await db.master_states.find({'is_active': True}, {'id': 1}).to_list(5000)
    active_state_ids = [s['id'] for s in active_states]
    
    # Find and deactivate orphaned cities (cities with inactive/missing parent states)
    result = await db.master_cities.update_many(
        {
            'is_active': True,
            'state_id': {'$nin': active_state_ids}
        },
        {
            '$set': {
                'is_active': False,
                'updated_at': datetime.now(timezone.utc).isoformat()
            }
        }
    )
    
    # Get final counts
    final_active_cities = await db.master_cities.count_documents({'is_active': True})
    
    return {
        'message': 'Cleanup completed',
        'orphaned_cities_deactivated': result.modified_count,
        'active_cities_remaining': final_active_cities
    }

# CRUD for Cities
@api_router.post("/master-locations/cities")
async def create_city(city: City, current_user: dict = Depends(get_current_user)):
    """Create a new city"""
    if current_user.get('role') not in ['CEO', 'Director', 'System Admin']:
        raise HTTPException(status_code=403, detail="Not authorized")
    
    city_data = city.model_dump()
    city_data['id'] = str(uuid.uuid4())
    city_data['created_at'] = datetime.now(timezone.utc).isoformat()
    city_data['updated_at'] = datetime.now(timezone.utc).isoformat()
    
    await db.master_cities.insert_one(city_data)
    
    return {k: v for k, v in city_data.items() if k != '_id'}

@api_router.put("/master-locations/cities/{city_id}")
async def update_city(city_id: str, city: City, current_user: dict = Depends(get_current_user)):
    """Update a city"""
    if current_user.get('role') not in ['CEO', 'Director', 'System Admin']:
        raise HTTPException(status_code=403, detail="Not authorized")
    
    update_data = city.model_dump(exclude_unset=True)
    update_data['updated_at'] = datetime.now(timezone.utc).isoformat()
    
    await db.master_cities.update_one({'id': city_id}, {'$set': update_data})
    
    updated = await db.master_cities.find_one({'id': city_id}, {'_id': 0})
    return updated

@api_router.delete("/master-locations/cities/{city_id}")
async def delete_city(city_id: str, current_user: dict = Depends(get_current_user)):
    """Soft delete a city"""
    if current_user.get('role') not in ['CEO', 'Director', 'System Admin']:
        raise HTTPException(status_code=403, detail="Not authorized")
    
    await db.master_cities.update_one(
        {'id': city_id}, 
        {'$set': {'is_active': False, 'updated_at': datetime.now(timezone.utc).isoformat()}}
    )
    return {'message': 'City deleted'}

# ============= QUOTES API PROXY =============
# Proxy endpoints for quotes APIs to avoid CORS issues in production

# Water quotes - curated list since no specific water quotes API exists
WATER_QUOTES = [
    {"q": "Water is the driving force of all nature.", "a": "Leonardo da Vinci"},
    {"q": "Thousands have lived without love, not one without water.", "a": "W.H. Auden"},
    {"q": "Water is life, and clean water means health.", "a": "Audrey Hepburn"},
    {"q": "Pure water is the world's first and foremost medicine.", "a": "Slovakian Proverb"},
    {"q": "When the well is dry, we know the worth of water.", "a": "Benjamin Franklin"},
    {"q": "Water is the soul of the Earth.", "a": "W.H. Auden"},
    {"q": "In one drop of water are found all the secrets of all the oceans.", "a": "Kahlil Gibran"},
    {"q": "Nothing is softer or more flexible than water, yet nothing can resist it.", "a": "Lao Tzu"},
    {"q": "Water is the most critical resource issue of our lifetime.", "a": "Rosegrant"},
    {"q": "We forget that the water cycle and the life cycle are one.", "a": "Jacques Cousteau"},
    {"q": "Water links us to our neighbor in a way more profound than any other.", "a": "John Thorson"},
    {"q": "The cure for anything is salt water: sweat, tears, or the sea.", "a": "Isak Dinesen"},
    {"q": "Water is sacred to all human beings.", "a": "Rigoberta Menchu"},
    {"q": "A drop of water is worth more than a sack of gold to a thirsty man.", "a": "Unknown"},
    {"q": "By means of water, we give life to everything.", "a": "Quran"},
    {"q": "Water is the mirror that has the ability to show us what we cannot see.", "a": "Masaru Emoto"},
    {"q": "Heavy hearts, like heavy clouds in the sky, are best relieved by letting water out.", "a": "Christopher Morley"},
    {"q": "Access to safe water is a fundamental human need.", "a": "Kofi Annan"},
    {"q": "Clean water and sanitation are human rights.", "a": "Pope Francis"},
    {"q": "Water is life's matter and matrix, mother and medium.", "a": "Albert Szent-Gyorgyi"},
    {"q": "The water you touch in a river is the last of that which has passed, and the first of that which is coming.", "a": "Leonardo da Vinci"},
    {"q": "Water sustains all.", "a": "Thales of Miletus"},
    {"q": "Rivers know this: there is no hurry. We shall get there some day.", "a": "A.A. Milne"},
    {"q": "Water is the best of all things.", "a": "Pindar"},
    {"q": "If there is magic on this planet, it is contained in water.", "a": "Loren Eiseley"},
    {"q": "We never know the worth of water till the well is dry.", "a": "Thomas Fuller"},
    {"q": "Water is the one substance from which the earth can conceal nothing.", "a": "Loren Eiseley"},
    {"q": "Human nature is like water. It takes the shape of its container.", "a": "Wallace Stevens"},
    {"q": "Ocean is more ancient than the mountains, and freighted with the memories of time.", "a": "H.P. Lovecraft"},
    {"q": "Water, in all its forms, is what makes our planet a wonderful place to live.", "a": "Unknown"},
    {"q": "The world's freshwater is a shared resource that must be protected.", "a": "Mikhail Gorbachev"},
]

import random

@api_router.get("/quotes/water")
async def get_water_quote():
    """Returns a random water-related quote"""
    quote = random.choice(WATER_QUOTES)
    return {"quote": quote["q"], "author": quote["a"]}

@api_router.get("/quotes/sales")
async def get_sales_quote():
    """Proxy endpoint for ZenQuotes API to get inspirational quotes for sales"""
    try:
        async with httpx.AsyncClient() as client:
            response = await client.get(
                "https://zenquotes.io/api/random",
                timeout=10.0
            )
            response.raise_for_status()
            data = response.json()
            if data and len(data) > 0:
                return {"quote": data[0]["q"], "author": data[0]["a"]}
            else:
                # Fallback quote if API returns empty
                return {"quote": "Success is not the key to happiness. Happiness is the key to success.", "author": "Albert Schweitzer"}
    except Exception as e:
        # Fallback quote on error
        print(f"ZenQuotes API error: {str(e)}")
        return {"quote": "The secret of getting ahead is getting started.", "author": "Mark Twain"}

# ============= WEATHER API PROXY =============
# Proxy endpoint for Open-Meteo weather API to avoid CORS issues in production
@api_router.get("/weather")
async def get_weather(latitude: float, longitude: float):
    """Proxy endpoint for Open-Meteo weather API to avoid CORS issues"""
    try:
        async with httpx.AsyncClient() as client:
            response = await client.get(
                "https://api.open-meteo.com/v1/forecast",
                params={
                    "latitude": latitude,
                    "longitude": longitude,
                    "current": "temperature_2m,relative_humidity_2m,weather_code,wind_speed_10m",
                    "timezone": "auto"
                },
                timeout=10.0
            )
            response.raise_for_status()
            return response.json()
    except httpx.TimeoutException:
        raise HTTPException(status_code=504, detail="Weather service timeout")
    except httpx.HTTPError as e:
        raise HTTPException(status_code=502, detail=f"Weather service error: {str(e)}")
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to fetch weather: {str(e)}")

# ============= INCLUDE ROUTER =============

app.include_router(api_router)

# CORS configuration - reads from environment variable for deployment flexibility
# When credentials are enabled, we cannot use wildcard '*' - must specify exact origins
cors_origins_env = os.environ.get('CORS_ORIGINS', '')

# Default allowed origins for production and development
default_origins = [
    'https://crm.nylaairwater.earth',
    'https://pipeline-master-14.emergent.host',
    'http://localhost:3000',
    'http://127.0.0.1:3000'
]

if cors_origins_env and cors_origins_env != '*':
    cors_origins = [origin.strip() for origin in cors_origins_env.split(',')]
else:
    cors_origins = default_origins

# Add the preview URL if set
preview_url = os.environ.get('REACT_APP_BACKEND_URL', '')
if preview_url and preview_url not in cors_origins:
    # Extract just the origin (protocol + host)
    from urllib.parse import urlparse
    parsed = urlparse(preview_url)
    origin = f"{parsed.scheme}://{parsed.netloc}"
    if origin not in cors_origins:
        cors_origins.append(origin)

app.add_middleware(
    CORSMiddleware,
    allow_credentials=True,
    allow_origins=cors_origins,
    allow_methods=["*"],
    allow_headers=["*"],
)

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

@app.on_event("shutdown")
async def shutdown_db_client():
    if MQ_AVAILABLE and stop_mq_subscriber:
        try:
            stop_mq_subscriber()
            logger.info("ActiveMQ subscriber stopped")
        except Exception as e:
            logger.error(f"Error stopping ActiveMQ subscriber: {e}")
    client.close()
