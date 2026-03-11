"""
Meetings routes - Meeting CRUD with Zoom integration
Multi-tenant aware - all queries automatically filter by tenant_id
"""
from fastapi import APIRouter, HTTPException, Depends
from typing import List, Optional
from datetime import datetime, timezone
from pydantic import BaseModel, Field
import uuid
import asyncio

from database import get_tenant_db
from deps import get_current_user

router = APIRouter()

def get_tdb():
    """Get tenant-aware database wrapper"""
    return get_tenant_db()

# Try to import zoom service
try:
    from zoom_service import create_zoom_meeting
    ZOOM_AVAILABLE = True
except ImportError:
    ZOOM_AVAILABLE = False
    create_zoom_meeting = None

# Try to import resend for email notifications
try:
    import resend
    import os
    RESEND_API_KEY = os.environ.get('RESEND_API_KEY')
    if RESEND_API_KEY:
        resend.api_key = RESEND_API_KEY
    RESEND_AVAILABLE = bool(RESEND_API_KEY)
except ImportError:
    RESEND_AVAILABLE = False


# ============= MODELS =============

class Meeting(BaseModel):
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    title: str
    description: Optional[str] = None
    meeting_type: str = 'internal'
    meeting_date: str
    start_time: str
    end_time: Optional[str] = None
    duration_minutes: int = 30
    location: Optional[str] = None
    meeting_link: Optional[str] = None
    zoom_meeting_id: Optional[str] = None
    zoom_password: Optional[str] = None
    attendees: List[str] = []
    attendee_names: List[str] = []
    lead_id: Optional[str] = None
    account_id: Optional[str] = None
    organizer_id: str
    organizer_name: Optional[str] = None
    status: str = 'scheduled'
    notes: Optional[str] = None
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    updated_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))

    class Config:
        extra = "ignore"


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
    create_zoom_meeting: bool = False


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


# ============= HELPER FUNCTIONS =============

async def send_meeting_notification(meeting: dict, notification_type: str, organizer: dict):
    """Send email notifications for meeting events"""
    if not RESEND_AVAILABLE:
        return
    
    attendees = meeting.get('attendees', [])
    if not attendees:
        return
    
    sender_email = os.environ.get('SENDER_EMAIL', 'onboarding@resend.dev')
    organizer_name = organizer.get('name', 'Someone')
    meeting_title = meeting.get('title', 'Meeting')
    
    subjects = {
        'scheduled': f"Meeting Invitation: {meeting_title}",
        'rescheduled': f"Meeting Rescheduled: {meeting_title}",
        'cancelled': f"Meeting Cancelled: {meeting_title}"
    }
    subject = subjects.get(notification_type, f"Meeting Update: {meeting_title}")
    
    # Build simple HTML content
    html_content = f"""
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <h2>{subject}</h2>
        <p><strong>Organizer:</strong> {organizer_name}</p>
        <p><strong>Date:</strong> {meeting.get('meeting_date', '')}</p>
        <p><strong>Time:</strong> {meeting.get('start_time', '')} ({meeting.get('duration_minutes', 30)} minutes)</p>
        {f'<p><strong>Zoom Link:</strong> <a href="{meeting.get("meeting_link")}">{meeting.get("meeting_link")}</a></p>' if meeting.get('meeting_link') else ''}
    </div>
    """
    
    try:
        await asyncio.to_thread(
            resend.Emails.send,
            {
                "from": f"Nyla CRM <{sender_email}>",
                "to": attendees,
                "subject": subject,
                "html": html_content
            }
        )
    except Exception as e:
        print(f"Failed to send meeting notification: {e}")


# ============= MEETING ROUTES =============

@router.post("")
async def create_meeting(meeting: MeetingCreate, current_user: dict = Depends(get_current_user)):
    """Create a new meeting"""
    tdb = get_tdb()
    meeting_data = {
        'id': str(uuid.uuid4()),
        'title': meeting.title,
        'description': meeting.description,
        'meeting_type': meeting.meeting_type,
        'meeting_date': meeting.meeting_date,
        'start_time': meeting.start_time,
        'end_time': meeting.end_time,
        'duration_minutes': meeting.duration_minutes,
        'location': meeting.location,
        'meeting_link': meeting.meeting_link,
        'attendees': meeting.attendees,
        'attendee_names': meeting.attendee_names,
        'lead_id': meeting.lead_id,
        'account_id': meeting.account_id,
        'organizer_id': current_user['id'],
        'organizer_name': current_user.get('name'),
        'status': 'scheduled',
        'created_at': datetime.now(timezone.utc).isoformat(),
        'updated_at': datetime.now(timezone.utc).isoformat()
    }
    
    # Create Zoom meeting if requested
    if meeting.create_zoom_meeting and ZOOM_AVAILABLE and create_zoom_meeting:
        try:
            zoom_data = await create_zoom_meeting(
                topic=meeting.title,
                start_time=f"{meeting.meeting_date}T{meeting.start_time}:00",
                duration=meeting.duration_minutes
            )
            meeting_data['meeting_link'] = zoom_data.get('join_url')
            meeting_data['zoom_meeting_id'] = str(zoom_data.get('id'))
            meeting_data['zoom_password'] = zoom_data.get('password')
            meeting_data['location'] = 'Online (Zoom)'
        except Exception as e:
            print(f"Failed to create Zoom meeting: {e}")
    
    await tdb.meetings.insert_one(meeting_data)
    
    # Send notification emails
    await send_meeting_notification(meeting_data, 'scheduled', current_user)
    
    return meeting_data


@router.get("")
async def get_meetings(
    organizer_id: Optional[str] = None,
    status: Optional[str] = None,
    lead_id: Optional[str] = None,
    account_id: Optional[str] = None,
    from_date: Optional[str] = None,
    to_date: Optional[str] = None,
    current_user: dict = Depends(get_current_user)
):
    """Get meetings with optional filters"""
    tdb = get_tdb()
    query = {}
    
    if organizer_id:
        query['organizer_id'] = organizer_id
    
    if status:
        query['status'] = status
    
    if lead_id:
        query['lead_id'] = lead_id
    
    if account_id:
        query['account_id'] = account_id
    
    if from_date:
        query['meeting_date'] = {'$gte': from_date}
    
    if to_date:
        if 'meeting_date' in query:
            query['meeting_date']['$lte'] = to_date
        else:
            query['meeting_date'] = {'$lte': to_date}
    
    meetings = await tdb.meetings.find(query, {'_id': 0}).sort('meeting_date', 1).to_list(1000)
    
    return meetings


@router.get("/{meeting_id}")
async def get_meeting(meeting_id: str, current_user: dict = Depends(get_current_user)):
    """Get a single meeting"""
    tdb = get_tdb()
    meeting = await tdb.meetings.find_one({'id': meeting_id}, {'_id': 0})
    if not meeting:
        raise HTTPException(status_code=404, detail='Meeting not found')
    return meeting


@router.put("/{meeting_id}")
async def update_meeting(meeting_id: str, update: MeetingUpdate, current_user: dict = Depends(get_current_user)):
    """Update a meeting"""
    tdb = get_tdb()
    existing = await tdb.meetings.find_one({'id': meeting_id}, {'_id': 0})
    if not existing:
        raise HTTPException(status_code=404, detail='Meeting not found')
    
    update_data = {k: v for k, v in update.model_dump().items() if v is not None}
    update_data['updated_at'] = datetime.now(timezone.utc).isoformat()
    
    # Check if date/time changed for rescheduled notification
    date_changed = (
        update.meeting_date and update.meeting_date != existing.get('meeting_date') or
        update.start_time and update.start_time != existing.get('start_time')
    )
    
    await tdb.meetings.update_one({'id': meeting_id}, {'$set': update_data})
    
    updated = await tdb.meetings.find_one({'id': meeting_id}, {'_id': 0})
    
    # Send rescheduled notification
    if date_changed and update.status != 'cancelled':
        await send_meeting_notification(updated, 'rescheduled', current_user)
    
    # Send cancelled notification
    if update.status == 'cancelled' and existing.get('status') != 'cancelled':
        await send_meeting_notification(updated, 'cancelled', current_user)
    
    return updated


@router.delete("/{meeting_id}")
async def delete_meeting(meeting_id: str, current_user: dict = Depends(get_current_user)):
    """Delete a meeting"""
    tdb = get_tdb()
    meeting = await tdb.meetings.find_one({'id': meeting_id}, {'_id': 0})
    if not meeting:
        raise HTTPException(status_code=404, detail='Meeting not found')
    
    # Send cancellation notification before deleting
    await send_meeting_notification(meeting, 'cancelled', current_user)
    
    await tdb.meetings.delete_one({'id': meeting_id})
    
    return {'message': 'Meeting deleted successfully'}
