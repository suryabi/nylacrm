"""
Daily Status module - Team status updates, AI revisions, rollups, and period summaries.
"""
from fastapi import APIRouter, HTTPException, Depends
from pydantic import BaseModel, Field, ConfigDict
from typing import Optional
from datetime import datetime, timezone, timedelta
import os
import uuid
import logging

from database import db, get_tenant_db
from deps import get_current_user

logger = logging.getLogger(__name__)
router = APIRouter()


def get_tdb():
    return get_tenant_db()


# ============= Daily Status Models =============

class DailyStatus(BaseModel):
    model_config = ConfigDict(extra="ignore")
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    user_id: str
    status_date: str

    yesterday_updates: str = ''
    yesterday_original: Optional[str] = None
    yesterday_ai_revised: bool = False

    today_actions: str = ''
    today_original: Optional[str] = None
    today_ai_revised: bool = False

    help_needed: str = ''
    help_original: Optional[str] = None
    help_ai_revised: bool = False

    posted_by: Optional[str] = None
    posted_by_name: Optional[str] = None

    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    updated_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))


class DailyStatusCreate(BaseModel):
    status_date: str
    yesterday_updates: str = ''
    today_actions: str = ''
    help_needed: str = ''
    target_user_id: Optional[str] = None


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


# ============= DAILY STATUS ROUTES =============

@router.post("/daily-status", response_model=DailyStatus)
async def create_daily_status(status_input: DailyStatusCreate, current_user: dict = Depends(get_current_user)):
    # Determine target user (self or subordinate)
    target_user_id = status_input.target_user_id if status_input.target_user_id else current_user['id']
    posted_by = None
    posted_by_name = None
    
    # If posting for someone else, verify authorization
    if target_user_id != current_user['id']:
        # Check if current user is a manager of the target user
        async def is_subordinate(manager_id, target_id, visited=None):
            if visited is None:
                visited = set()
            if manager_id in visited:
                return False
            visited.add(manager_id)
            
            direct_reports = await get_tdb().users.find(
                {'reports_to': manager_id, 'is_active': True},
                {'_id': 0, 'id': 1}
            ).to_list(100)
            
            for report in direct_reports:
                if report['id'] == target_id:
                    return True
                if await is_subordinate(report['id'], target_id, visited):
                    return True
            return False
        
        # Leadership roles can post for anyone
        is_leadership = current_user['role'] in ['ceo', 'director', 'vp', 'admin', 'CEO', 'Director', 'Vice President', 'Admin']
        
        if not is_leadership and not await is_subordinate(current_user['id'], target_user_id):
            raise HTTPException(status_code=403, detail='Not authorized to post status for this user')
        
        # Mark who posted this status
        posted_by = current_user['id']
        posted_by_name = current_user.get('name', current_user.get('email'))
    
    # Check if status already exists for this date
    existing = await get_tdb().daily_status.find_one({
        'user_id': target_user_id,
        'status_date': status_input.status_date
    }, {'_id': 0})
    
    if existing:
        raise HTTPException(status_code=400, detail='Status already exists for this date')
    
    status_data = status_input.model_dump()
    status_data.pop('target_user_id', None)  # Remove from data
    status_data['user_id'] = target_user_id
    status_data['posted_by'] = posted_by
    status_data['posted_by_name'] = posted_by_name
    status_obj = DailyStatus(**status_data)
    
    doc = status_obj.model_dump()
    doc['created_at'] = doc['created_at'].isoformat()
    doc['updated_at'] = doc['updated_at'].isoformat()
    
    await get_tdb().daily_status.insert_one(doc)
    return status_obj

@router.get("/daily-status")
async def get_daily_statuses(
    start_date: Optional[str] = None,
    end_date: Optional[str] = None,
    user_id: Optional[str] = None,
    current_user: dict = Depends(get_current_user)
):
    query = {}
    
    # If user_id is provided, check if current user can view it
    if user_id and user_id != current_user['id']:
        # Leadership can see all statuses
        if current_user['role'] in ['ceo', 'director', 'vp', 'admin', 'CEO', 'Director', 'Vice President', 'Admin']:
            query['user_id'] = user_id
        else:
            # Check if the requested user is a subordinate (direct or indirect)
            async def is_subordinate(manager_id, target_id, visited=None):
                if visited is None:
                    visited = set()
                if manager_id in visited:
                    return False
                visited.add(manager_id)
                
                direct_reports = await get_tdb().users.find(
                    {'reports_to': manager_id, 'is_active': True},
                    {'_id': 0, 'id': 1}
                ).to_list(100)
                
                for report in direct_reports:
                    if report['id'] == target_id:
                        return True
                    if await is_subordinate(report['id'], target_id, visited):
                        return True
                return False
            
            if await is_subordinate(current_user['id'], user_id):
                query['user_id'] = user_id
            else:
                # Not authorized to view this user's status
                query['user_id'] = current_user['id']
    else:
        query['user_id'] = user_id if user_id else current_user['id']
    
    if start_date:
        query['status_date'] = {'$gte': start_date}
    if end_date:
        if 'status_date' in query:
            query['status_date']['$lte'] = end_date
        else:
            query['status_date'] = {'$lte': end_date}
    
    statuses = await get_tdb().daily_status.find(query, {'_id': 0}).sort('status_date', -1).to_list(100)
    
    for status in statuses:
        if isinstance(status['created_at'], str):
            status['created_at'] = datetime.fromisoformat(status['created_at'])
        if isinstance(status['updated_at'], str):
            status['updated_at'] = datetime.fromisoformat(status['updated_at'])
    
    return statuses

@router.put("/daily-status/{status_id}")
async def update_daily_status(
    status_id: str,
    status_update: DailyStatusUpdate,
    current_user: dict = Depends(get_current_user)
):
    status = await get_tdb().daily_status.find_one({'id': status_id}, {'_id': 0})
    if not status:
        raise HTTPException(status_code=404, detail='Status not found')
    
    # Check authorization
    is_own_status = status['user_id'] == current_user['id']
    
    if not is_own_status:
        # Check if current user is a manager of the status owner
        async def is_subordinate(manager_id, target_id, visited=None):
            if visited is None:
                visited = set()
            if manager_id in visited:
                return False
            visited.add(manager_id)
            
            direct_reports = await get_tdb().users.find(
                {'reports_to': manager_id, 'is_active': True},
                {'_id': 0, 'id': 1}
            ).to_list(100)
            
            for report in direct_reports:
                if report['id'] == target_id:
                    return True
                if await is_subordinate(report['id'], target_id, visited):
                    return True
            return False
        
        # Leadership roles can update anyone's status
        is_leadership = current_user['role'] in ['ceo', 'director', 'vp', 'admin', 'CEO', 'Director', 'Vice President', 'Admin']
        
        if not is_leadership and not await is_subordinate(current_user['id'], status['user_id']):
            raise HTTPException(status_code=403, detail='Not authorized to update this status')
    
    update_data = status_update.model_dump()
    update_data['updated_at'] = datetime.now(timezone.utc).isoformat()
    
    # Track who updated if different from owner
    if not is_own_status:
        update_data['posted_by'] = current_user['id']
        update_data['posted_by_name'] = current_user.get('name', current_user.get('email'))
    
    await get_tdb().daily_status.update_one({'id': status_id}, {'$set': update_data})
    
    updated_status = await get_tdb().daily_status.find_one({'id': status_id}, {'_id': 0})
    if isinstance(updated_status['created_at'], str):
        updated_status['created_at'] = datetime.fromisoformat(updated_status['created_at'])
    if isinstance(updated_status['updated_at'], str):
        updated_status['updated_at'] = datetime.fromisoformat(updated_status['updated_at'])
    
    return updated_status

@router.get("/daily-status/auto-populate/{status_date}")
async def auto_populate_from_activities(
    status_date: str, 
    target_user_id: Optional[str] = None,
    current_user: dict = Depends(get_current_user)
):
    """Auto-populate daily status from logged lead activities, grouped by interaction method.
    Activities shared to linked leads are grouped together to avoid duplication."""
    
    try:
        # Determine which user's activities to fetch
        fetch_user_id = target_user_id if target_user_id else current_user['id']
        
        # If fetching for someone else, verify authorization
        if target_user_id and target_user_id != current_user['id']:
            async def is_subordinate(manager_id, target_id, visited=None):
                if visited is None:
                    visited = set()
                if manager_id in visited:
                    return False
                visited.add(manager_id)
                
                direct_reports = await get_tdb().users.find(
                    {'reports_to': manager_id, 'is_active': True},
                    {'_id': 0, 'id': 1}
                ).to_list(100)
                
                for report in direct_reports:
                    if report['id'] == target_id:
                        return True
                    if await is_subordinate(report['id'], target_id, visited):
                        return True
                return False
            
            is_leadership = current_user['role'] in ['ceo', 'director', 'vp', 'admin', 'CEO', 'Director', 'Vice President', 'Admin']
            
            if not is_leadership and not await is_subordinate(current_user['id'], target_user_id):
                raise HTTPException(status_code=403, detail='Not authorized to fetch activities for this user')
        
        # Get all activities created by target user on this date
        # EXCLUDE shared copies to avoid duplicate counting - only original activities
        start_datetime = datetime.fromisoformat(f'{status_date}T00:00:00').replace(tzinfo=timezone.utc).isoformat()
        end_datetime = datetime.fromisoformat(f'{status_date}T23:59:59').replace(tzinfo=timezone.utc).isoformat()
        
        # Get original activities (not copies)
        activities = await get_tdb().activities.find(
            {
                'created_by': fetch_user_id,
                'created_at': {'$gte': start_datetime, '$lte': end_datetime},
                'is_shared_copy': {'$ne': True}  # Exclude copied activities to avoid duplicates
            },
            {'_id': 0}
        ).to_list(100)
        
        if not activities:
            return {'formatted_text': '', 'activity_count': 0}
        
        # Get all activity IDs to find their copies (linked leads)
        activity_ids = [a['id'] for a in activities]
        
        # Find all copies of these activities to get the linked lead IDs
        copied_activities = await get_tdb().activities.find(
            {
                'original_activity_id': {'$in': activity_ids},
                'is_shared_copy': True
            },
            {'_id': 0, 'original_activity_id': 1, 'lead_id': 1}
        ).to_list(500)
        
        # Build a map of original activity ID -> list of linked lead IDs
        activity_linked_leads = {}
        for copied in copied_activities:
            orig_id = copied['original_activity_id']
            if orig_id not in activity_linked_leads:
                activity_linked_leads[orig_id] = []
            activity_linked_leads[orig_id].append(copied['lead_id'])
        
        # Get lead names for all activities (including linked leads)
        all_lead_ids = list(set([a['lead_id'] for a in activities]))
        for linked_ids in activity_linked_leads.values():
            all_lead_ids.extend(linked_ids)
        all_lead_ids = list(set(all_lead_ids))
        
        leads = await get_tdb().leads.find(
            {'id': {'$in': all_lead_ids}},
            {'_id': 0, 'id': 1, 'company': 1, 'name': 1}
        ).to_list(200)
        
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
            # Replace newlines with space to keep activity as single line
            description = ' '.join(description.split('\n')).strip()
            description = ' '.join(description.split())  # Normalize multiple spaces
            interaction_method = (activity.get('interaction_method') or activity.get('activity_type') or '').lower()
            
            # Check if this activity was shared to linked leads
            linked_lead_ids = activity_linked_leads.get(activity['id'], [])
            if linked_lead_ids:
                # Group all lead names together (comma-separated)
                linked_names = [lead_map.get(lid, 'Unknown') for lid in linked_lead_ids]
                all_names = [lead_name] + linked_names
                lead_display = ', '.join(all_names)
                activity_text = f"{lead_display} - {description}" if description else lead_display
            else:
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

@router.get("/daily-status/team-rollup")
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
        all_users = await get_tdb().users.find(
            {'is_active': True},
            {'_id': 0, 'id': 1, 'name': 1, 'role': 1, 'designation': 1, 'territory': 1, 'city': 1, 'state': 1}
        ).to_list(500)
        user_ids = [u['id'] for u in all_users]
        user_map = {u['id']: u for u in all_users}
    else:
        # For other roles, show only direct reports
        direct_reports = await get_tdb().users.find(
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
    
    statuses = await get_tdb().daily_status.find(query, {'_id': 0}).to_list(500)
    
    # Get activity metrics for the day
    start_datetime = datetime.fromisoformat(f'{target_date}T00:00:00').replace(tzinfo=timezone.utc).isoformat()
    end_datetime = datetime.fromisoformat(f'{target_date}T23:59:59').replace(tzinfo=timezone.utc).isoformat()
    
    # Map statuses to users with metrics
    team_statuses = []
    for status in statuses:
        user_info = user_map.get(status['user_id'])
        if user_info:
            # Get activity metrics for this user
            user_activities = await get_tdb().activities.find({
                'created_by': status['user_id'],
                'created_at': {'$gte': start_datetime, '$lte': end_datetime}
            }, {'_id': 0}).to_list(1000)
            
            phone_calls = sum(1 for a in user_activities if a.get('interaction_method') == 'phone_call')
            customer_visits = sum(1 for a in user_activities if a.get('interaction_method') == 'customer_visit')
            emails = sum(1 for a in user_activities if a.get('interaction_method') == 'email')
            messages = sum(1 for a in user_activities if a.get('interaction_method') in ['whatsapp', 'sms'])
            
            new_leads = await get_tdb().leads.count_documents({
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

@router.post("/daily-status/team-summary")
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

@router.get("/daily-status/weekly-summary")
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
        user = await get_tdb().users.find_one({'id': user_id}, {'_id': 0})
    else:
        # Team summary - all direct reports
        direct_reports = await get_tdb().users.find(
            {'reports_to': current_user['id']},
            {'_id': 0, 'id': 1}
        ).to_list(100)
        
        if direct_reports:
            user_ids = [u['id'] for u in direct_reports]
            query['user_id'] = {'$in': user_ids}
    
    # Get all statuses in date range
    statuses = await get_tdb().daily_status.find(query, {'_id': 0}).sort('status_date', 1).to_list(500)
    
    return {
        'statuses': statuses,
        'start_date': start_date,
        'end_date': end_date,
        'total_days': len(set([s['status_date'] for s in statuses])),
        'is_individual': user_id is not None
    }

@router.post("/daily-status/generate-period-summary")
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
