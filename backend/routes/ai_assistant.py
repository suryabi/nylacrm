"""
AI Assistant Routes - RAG-based chat assistant for CRM data
Uses Gemini 3 Flash for text generation
"""
from fastapi import APIRouter, HTTPException, Depends, Request
from pydantic import BaseModel
from typing import Optional, List, Dict, Any
from datetime import datetime, timezone
import uuid
import os
import logging
from dotenv import load_dotenv

load_dotenv()

from database import db
from deps import get_current_user
from core.tenant import get_current_tenant_id

router = APIRouter()
logger = logging.getLogger(__name__)

# Only CEO can access the AI assistant
ALLOWED_ROLES = ['CEO', 'Director', 'System Admin', 'ceo', 'director', 'Admin', 'admin']


def is_allowed_role(user: dict) -> bool:
    """Check if user has permission to use AI assistant"""
    user_role = user.get('role', '').strip()
    return user_role in ALLOWED_ROLES or user_role.lower() in [r.lower() for r in ALLOWED_ROLES]


class ChatMessage(BaseModel):
    message: str
    session_id: Optional[str] = None


class ChatResponse(BaseModel):
    response: str
    session_id: str
    data_context: Optional[Dict[str, Any]] = None


async def get_crm_context(tenant_id: str, query: str) -> Dict[str, Any]:
    """
    Gather relevant CRM data based on the user's query.
    Supports filtering by city, status, month, and other criteria.
    """
    context = {}
    query_lower = query.lower()
    
    # Common Indian cities for location detection
    CITIES = [
        'hyderabad', 'bangalore', 'bengaluru', 'mumbai', 'delhi', 'chennai', 
        'pune', 'kolkata', 'ahmedabad', 'jaipur', 'lucknow', 'kanpur',
        'nagpur', 'indore', 'thane', 'bhopal', 'visakhapatnam', 'vizag',
        'patna', 'vadodara', 'ghaziabad', 'ludhiana', 'agra', 'nashik',
        'faridabad', 'meerut', 'rajkot', 'varanasi', 'srinagar', 'aurangabad',
        'dhanbad', 'amritsar', 'navi mumbai', 'allahabad', 'ranchi', 'howrah',
        'coimbatore', 'jabalpur', 'gwalior', 'vijayawada', 'jodhpur', 'madurai',
        'raipur', 'kota', 'chandigarh', 'guwahati', 'solapur', 'hubli', 'noida',
        'goa', 'panaji', 'margao'
    ]
    
    # Lead statuses for filtering
    STATUSES = [
        'new', 'contacted', 'qualified', 'proposal', 'negotiation', 
        'won', 'lost', 'on hold', 'follow up', 'meeting scheduled',
        'internal review', 'sent', 'shared with customer'
    ]
    
    # Months for date filtering
    MONTHS = {
        'january': '01', 'february': '02', 'march': '03', 'april': '04',
        'may': '05', 'june': '06', 'july': '07', 'august': '08',
        'september': '09', 'october': '10', 'november': '11', 'december': '12',
        'jan': '01', 'feb': '02', 'mar': '03', 'apr': '04',
        'jun': '06', 'jul': '07', 'aug': '08', 'sep': '09', 'sept': '09',
        'oct': '10', 'nov': '11', 'dec': '12'
    }
    
    # Detect city in query
    detected_city = None
    for city in CITIES:
        if city in query_lower:
            detected_city = city.title()
            if city == 'bengaluru':
                detected_city = 'Bangalore'
            elif city == 'goa':
                detected_city = 'Goa'
            break
    
    # Detect month in query
    detected_month = None
    detected_year = datetime.now().year
    for month_name, month_num in MONTHS.items():
        if month_name in query_lower:
            detected_month = month_num
            # Check if year is mentioned
            import re
            year_match = re.search(r'20\d{2}', query)
            if year_match:
                detected_year = int(year_match.group())
            break
            if city == 'bengaluru':
                detected_city = 'Bangalore'  # Handle alternate name
            break
    
    # Detect status in query
    detected_status = None
    for status in STATUSES:
        if status in query_lower:
            detected_status = status.title()
            break
    
    try:
        # Lead-related queries
        if any(word in query_lower for word in ['lead', 'leads', 'prospect', 'prospects']):
            # Build filter based on detected criteria
            lead_filter = {'tenant_id': tenant_id}
            
            if detected_city:
                # Try multiple city fields
                lead_filter['$or'] = [
                    {'city': {'$regex': detected_city, '$options': 'i'}},
                    {'location': {'$regex': detected_city, '$options': 'i'}},
                    {'address': {'$regex': detected_city, '$options': 'i'}},
                    {'state': {'$regex': detected_city, '$options': 'i'}}
                ]
            
            if detected_status:
                lead_filter['status'] = {'$regex': detected_status, '$options': 'i'}
            
            # Get filtered leads count
            filtered_count = await db.leads.count_documents(lead_filter)
            
            # Get filtered leads with details
            filtered_leads = await db.leads.find(
                lead_filter,
                {'_id': 0, 'company_name': 1, 'status': 1, 'city': 1, 'location': 1, 
                 'contact_person': 1, 'phone': 1, 'email': 1, 'assigned_to_name': 1,
                 'created_at': 1, 'last_contacted_date': 1}
            ).sort('created_at', -1).limit(20).to_list(20)
            
            # Get status breakdown for filtered leads
            status_pipeline = [
                {'$match': lead_filter},
                {'$group': {'_id': '$status', 'count': {'$sum': 1}}},
                {'$sort': {'count': -1}}
            ]
            status_breakdown = await db.leads.aggregate(status_pipeline).to_list(20)
            
            # Get city breakdown for leads
            city_pipeline = [
                {'$match': {'tenant_id': tenant_id}},
                {'$group': {'_id': '$city', 'count': {'$sum': 1}}},
                {'$sort': {'count': -1}},
                {'$limit': 15}
            ]
            city_breakdown = await db.leads.aggregate(city_pipeline).to_list(15)
            
            # Get owner breakdown for filtered leads
            owner_pipeline = [
                {'$match': lead_filter},
                {'$group': {'_id': '$assigned_to_name', 'count': {'$sum': 1}}},
                {'$sort': {'count': -1}},
                {'$limit': 10}
            ]
            leads_by_owner = await db.leads.aggregate(owner_pipeline).to_list(10)
            
            # Total leads (without filter)
            total_leads = await db.leads.count_documents({'tenant_id': tenant_id})
            
            context['leads'] = {
                'total': total_leads,
                'filtered_count': filtered_count,
                'filter_applied': {
                    'city': detected_city,
                    'status': detected_status
                },
                'by_status': {item['_id']: item['count'] for item in status_breakdown if item['_id']},
                'by_city': {item['_id']: item['count'] for item in city_breakdown if item['_id']},
                'by_owner': {item['_id']: item['count'] for item in leads_by_owner if item['_id']},
                'filtered_leads': filtered_leads
            }
        
        # Account-related queries
        if any(word in query_lower for word in ['account', 'accounts', 'customer', 'customers', 'client', 'outstanding', 'balance', 'receivable']):
            account_filter = {'tenant_id': tenant_id}
            
            if detected_city:
                account_filter['$or'] = [
                    {'city': {'$regex': detected_city, '$options': 'i'}},
                    {'location': {'$regex': detected_city, '$options': 'i'}},
                    {'address': {'$regex': detected_city, '$options': 'i'}}
                ]
            
            total_accounts = await db.accounts.count_documents({'tenant_id': tenant_id})
            filtered_accounts = await db.accounts.count_documents(account_filter)
            
            accounts_list = await db.accounts.find(
                account_filter,
                {'_id': 0, 'company_name': 1, 'city': 1, 'created_at': 1, 'contact_person': 1, 
                 'outstanding_balance': 1, 'total_revenue': 1, 'id': 1}
            ).sort('created_at', -1).limit(15).to_list(15)
            
            # Calculate total outstanding balance for filtered accounts
            total_outstanding = sum(float(acc.get('outstanding_balance', 0) or 0) for acc in accounts_list)
            total_revenue_from_accounts = sum(float(acc.get('total_revenue', 0) or 0) for acc in accounts_list)
            
            context['accounts'] = {
                'total': total_accounts,
                'filtered_count': filtered_accounts,
                'filter_applied': {'city': detected_city},
                'accounts': accounts_list,
                'total_outstanding_balance': total_outstanding,
                'total_revenue': total_revenue_from_accounts
            }
        
        # Invoice/Financial queries
        if any(word in query_lower for word in ['invoice', 'invoices', 'outstanding', 'balance', 'payment', 'receivable', 'revenue', 'billing']):
            invoice_filter = {'tenant_id': tenant_id}
            
            if detected_city:
                # Join with accounts to filter by city
                pass  # Will aggregate below
            
            # Get invoice statistics
            total_invoices = await db.invoices.count_documents({'tenant_id': tenant_id})
            
            # Outstanding balance aggregation
            outstanding_pipeline = [
                {'$match': {'tenant_id': tenant_id, 'status': {'$in': ['pending', 'overdue', 'partial']}}},
                {'$group': {
                    '_id': None,
                    'total_outstanding': {'$sum': '$balance_due'},
                    'count': {'$sum': 1}
                }}
            ]
            outstanding_result = await db.invoices.aggregate(outstanding_pipeline).to_list(1)
            
            # Revenue by month
            revenue_pipeline = [
                {'$match': {'tenant_id': tenant_id, 'status': {'$in': ['paid', 'partial']}}},
                {'$group': {
                    '_id': {'$substr': ['$invoice_date', 0, 7]},  # YYYY-MM
                    'revenue': {'$sum': '$amount_paid'},
                    'invoice_count': {'$sum': 1}
                }},
                {'$sort': {'_id': -1}},
                {'$limit': 12}
            ]
            revenue_by_month = await db.invoices.aggregate(revenue_pipeline).to_list(12)
            
            # Recent invoices
            recent_invoices = await db.invoices.find(
                {'tenant_id': tenant_id},
                {'_id': 0, 'invoice_number': 1, 'account_name': 1, 'total_amount': 1, 
                 'balance_due': 1, 'status': 1, 'invoice_date': 1, 'due_date': 1}
            ).sort('invoice_date', -1).limit(10).to_list(10)
            
            # Invoice status breakdown
            status_pipeline = [
                {'$match': {'tenant_id': tenant_id}},
                {'$group': {'_id': '$status', 'count': {'$sum': 1}, 'total': {'$sum': '$total_amount'}}},
                {'$sort': {'total': -1}}
            ]
            invoice_by_status = await db.invoices.aggregate(status_pipeline).to_list(10)
            
            context['invoices'] = {
                'total_invoices': total_invoices,
                'total_outstanding': outstanding_result[0]['total_outstanding'] if outstanding_result else 0,
                'outstanding_count': outstanding_result[0]['count'] if outstanding_result else 0,
                'revenue_by_month': {item['_id']: item['revenue'] for item in revenue_by_month if item['_id']},
                'by_status': {item['_id']: {'count': item['count'], 'total': item['total']} for item in invoice_by_status if item['_id']},
                'recent_invoices': recent_invoices
            }
        
        # Sales/Revenue queries
        if any(word in query_lower for word in ['sale', 'sales', 'revenue', 'performance', 'target']):
            # Get target plans
            targets = await db.target_plans_v2.find(
                {'tenant_id': tenant_id},
                {'_id': 0, 'name': 1, 'status': 1, 'total_target_value': 1}
            ).limit(5).to_list(5)
            
            context['targets'] = targets
        
        # Team/User queries
        if any(word in query_lower for word in ['team', 'user', 'employee', 'sales rep', 'representative']):
            users = await db.users.find(
                {'tenant_id': tenant_id, 'is_active': True},
                {'_id': 0, 'name': 1, 'email': 1, 'role': 1, 'designation': 1}
            ).limit(20).to_list(20)
            
            context['team'] = {
                'total_active': len(users),
                'members': users
            }
        
        # Activity queries
        if any(word in query_lower for word in ['activity', 'activities', 'call', 'meeting', 'follow']):
            recent_activities = await db.activities.find(
                {'tenant_id': tenant_id},
                {'_id': 0, 'type': 1, 'description': 1, 'created_at': 1}
            ).sort('created_at', -1).limit(20).to_list(20)
            
            # Activity type breakdown
            activity_pipeline = [
                {'$match': {'tenant_id': tenant_id}},
                {'$group': {'_id': '$type', 'count': {'$sum': 1}}},
                {'$sort': {'count': -1}}
            ]
            activity_breakdown = await db.activities.aggregate(activity_pipeline).to_list(10)
            
            context['activities'] = {
                'recent': recent_activities,
                'by_type': {item['_id']: item['count'] for item in activity_breakdown if item['_id']}
            }
        
        # Daily status queries
        if any(word in query_lower for word in ['status', 'daily', 'today', 'yesterday', 'update']):
            recent_status = await db.daily_status_logs.find(
                {'tenant_id': tenant_id},
                {'_id': 0, 'user_name': 1, 'date': 1, 'activities': 1}
            ).sort('date', -1).limit(10).to_list(10)
            
            context['daily_status'] = recent_status
        
        # General overview if no specific topic
        if not context:
            total_leads = await db.leads.count_documents({'tenant_id': tenant_id})
            total_accounts = await db.accounts.count_documents({'tenant_id': tenant_id})
            total_users = await db.users.count_documents({'tenant_id': tenant_id, 'is_active': True})
            
            context['overview'] = {
                'total_leads': total_leads,
                'total_accounts': total_accounts,
                'total_team_members': total_users
            }
    
    except Exception as e:
        logger.error(f"Error gathering CRM context: {e}")
        context['error'] = str(e)
    
    return context


async def generate_ai_response(query: str, context: Dict[str, Any], session_id: str) -> str:
    """
    Generate AI response using Gemini with CRM context
    """
    from emergentintegrations.llm.chat import LlmChat, UserMessage
    
    api_key = os.environ.get('EMERGENT_LLM_KEY')
    if not api_key:
        raise HTTPException(status_code=500, detail="AI service not configured")
    
    # Build system message with context
    system_message = """You are an AI assistant for a Sales CRM system. You help the CEO and executives understand their sales data, team performance, and business metrics.

Your capabilities:
- Answer questions about leads, accounts, sales targets, and team performance
- Provide insights and summaries from the CRM data
- Suggest actions based on the data
- Be concise and business-focused

Guidelines:
- Always base your answers on the provided data context
- If data is not available, say so clearly
- Use bullet points and numbers for clarity
- Be professional and helpful
- When showing numbers, format them nicely (e.g., "1,234" instead of "1234")
"""
    
    # Format context for the AI
    context_str = f"""
Current CRM Data Context:
{format_context_for_ai(context)}
"""
    
    try:
        chat = LlmChat(
            api_key=api_key,
            session_id=session_id,
            system_message=system_message
        ).with_model("gemini", "gemini-3-flash-preview")
        
        # Combine user query with context
        full_message = f"""Based on the following CRM data:

{context_str}

User Question: {query}

Please provide a helpful, data-driven response."""
        
        user_message = UserMessage(text=full_message)
        response = await chat.send_message(user_message)
        
        return response
    
    except Exception as e:
        logger.error(f"AI generation error: {e}")
        raise HTTPException(status_code=500, detail=f"AI service error: {str(e)}")


def format_context_for_ai(context: Dict[str, Any]) -> str:
    """Format the context dictionary into a readable string for the AI"""
    lines = []
    
    if 'leads' in context:
        leads = context['leads']
        lines.append(f"LEADS DATA:")
        lines.append(f"  - Total Leads in CRM: {leads.get('total', 0)}")
        
        # Show filter info if applied
        filter_info = leads.get('filter_applied', {})
        if filter_info.get('city') or filter_info.get('status'):
            filter_parts = []
            if filter_info.get('city'):
                filter_parts.append(f"City: {filter_info['city']}")
            if filter_info.get('status'):
                filter_parts.append(f"Status: {filter_info['status']}")
            lines.append(f"  - FILTER APPLIED: {', '.join(filter_parts)}")
            lines.append(f"  - Filtered Results Count: {leads.get('filtered_count', 0)}")
        
        if leads.get('by_status'):
            lines.append(f"  - By Status: {leads['by_status']}")
        if leads.get('by_city'):
            lines.append(f"  - By City: {leads['by_city']}")
        if leads.get('by_owner'):
            lines.append(f"  - By Owner: {leads['by_owner']}")
        
        # Show filtered leads with details
        if leads.get('filtered_leads'):
            lines.append(f"  - Matching Leads ({len(leads['filtered_leads'])} shown):")
            for lead in leads['filtered_leads']:
                city = lead.get('city') or lead.get('location') or 'N/A'
                lines.append(f"    * {lead.get('company_name', 'N/A')} | Status: {lead.get('status', 'N/A')} | City: {city} | Contact: {lead.get('contact_person', 'N/A')} | Assigned: {lead.get('assigned_to_name', 'N/A')}")
    
    if 'accounts' in context:
        accounts = context['accounts']
        lines.append(f"\nACCOUNTS DATA:")
        lines.append(f"  - Total Accounts: {accounts.get('total', 0)}")
        
        filter_info = accounts.get('filter_applied', {})
        if filter_info.get('city'):
            lines.append(f"  - FILTER APPLIED: City: {filter_info['city']}")
            lines.append(f"  - Filtered Results Count: {accounts.get('filtered_count', 0)}")
        
        if accounts.get('accounts'):
            lines.append(f"  - Accounts List:")
            for acc in accounts['accounts'][:10]:
                outstanding = acc.get('outstanding_balance', 0) or 0
                lines.append(f"    * {acc.get('company_name', 'N/A')} ({acc.get('city', 'N/A')}) - Outstanding: ₹{outstanding:,.2f}")
        
        if accounts.get('total_outstanding_balance'):
            lines.append(f"  - Total Outstanding Balance: ₹{accounts['total_outstanding_balance']:,.2f}")
        if accounts.get('total_revenue'):
            lines.append(f"  - Total Revenue from filtered accounts: ₹{accounts['total_revenue']:,.2f}")
    
    if 'invoices' in context:
        invoices = context['invoices']
        lines.append(f"\nINVOICE/FINANCIAL DATA:")
        lines.append(f"  - Total Invoices: {invoices.get('total_invoices', 0)}")
        lines.append(f"  - Total Outstanding Balance: ₹{invoices.get('total_outstanding', 0):,.2f}")
        lines.append(f"  - Outstanding Invoice Count: {invoices.get('outstanding_count', 0)}")
        
        if invoices.get('revenue_by_month'):
            lines.append(f"  - Revenue by Month:")
            for month, revenue in invoices['revenue_by_month'].items():
                lines.append(f"    * {month}: ₹{revenue:,.2f}")
        
        if invoices.get('by_status'):
            lines.append(f"  - Invoices by Status:")
            for status, data in invoices['by_status'].items():
                lines.append(f"    * {status}: {data['count']} invoices, Total: ₹{data['total']:,.2f}")
        
        if invoices.get('recent_invoices'):
            lines.append(f"  - Recent Invoices:")
            for inv in invoices['recent_invoices'][:5]:
                lines.append(f"    * {inv.get('invoice_number', 'N/A')} | {inv.get('account_name', 'N/A')} | ₹{inv.get('total_amount', 0):,.2f} | Due: ₹{inv.get('balance_due', 0):,.2f} | Status: {inv.get('status', 'N/A')}")
    
    if 'targets' in context:
        lines.append(f"\nSALES TARGETS:")
        for target in context['targets']:
            lines.append(f"  - {target.get('name', 'N/A')}: {target.get('status', 'N/A')} - Value: {target.get('total_target_value', 0)}")
    
    if 'team' in context:
        team = context['team']
        lines.append(f"\nTEAM DATA:")
        lines.append(f"  - Total Active Members: {team.get('total_active', 0)}")
        if team.get('members'):
            lines.append(f"  - Members:")
            for member in team['members'][:10]:
                lines.append(f"    * {member.get('name', 'N/A')} - {member.get('role', 'N/A')} ({member.get('designation', 'N/A')})")
    
    if 'activities' in context:
        activities = context['activities']
        lines.append(f"\nACTIVITIES DATA:")
        if activities.get('by_type'):
            lines.append(f"  - By Type: {activities['by_type']}")
        lines.append(f"  - Recent Activities: {len(activities.get('recent', []))} shown")
    
    if 'daily_status' in context:
        lines.append(f"\nDAILY STATUS UPDATES:")
        for status in context['daily_status'][:5]:
            lines.append(f"  - {status.get('user_name', 'N/A')} ({status.get('date', 'N/A')})")
    
    if 'overview' in context:
        overview = context['overview']
        lines.append(f"\nOVERVIEW:")
        lines.append(f"  - Total Leads: {overview.get('total_leads', 0)}")
        lines.append(f"  - Total Accounts: {overview.get('total_accounts', 0)}")
        lines.append(f"  - Total Team Members: {overview.get('total_team_members', 0)}")
    
    return '\n'.join(lines) if lines else "No specific data available for this query."


@router.post("/chat")
async def chat_with_assistant(
    chat_message: ChatMessage,
    current_user: dict = Depends(get_current_user)
):
    """
    Chat with the AI assistant. Only available to CEO role.
    """
    if not is_allowed_role(current_user):
        raise HTTPException(
            status_code=403, 
            detail=f"AI Assistant is only available to: {', '.join(ALLOWED_ROLES)}"
        )
    
    tenant_id = get_current_tenant_id()
    session_id = chat_message.session_id or str(uuid.uuid4())
    
    # Get relevant CRM context
    context = await get_crm_context(tenant_id, chat_message.message)
    
    # Generate AI response
    response = await generate_ai_response(
        chat_message.message, 
        context, 
        f"{tenant_id}_{current_user.get('id', 'unknown')}_{session_id}"
    )
    
    # Store chat history
    chat_doc = {
        'id': str(uuid.uuid4()),
        'tenant_id': tenant_id,
        'user_id': current_user.get('id'),
        'user_name': current_user.get('name'),
        'session_id': session_id,
        'message': chat_message.message,
        'response': response,
        'context_summary': list(context.keys()),
        'created_at': datetime.now(timezone.utc).isoformat()
    }
    await db.ai_chat_history.insert_one(chat_doc)
    
    return {
        'response': response,
        'session_id': session_id,
        'data_context': list(context.keys())
    }


@router.get("/chat/history")
async def get_chat_history(
    session_id: Optional[str] = None,
    limit: int = 50,
    current_user: dict = Depends(get_current_user)
):
    """
    Get chat history for the current user
    """
    if not is_allowed_role(current_user):
        raise HTTPException(
            status_code=403, 
            detail=f"AI Assistant is only available to: {', '.join(ALLOWED_ROLES)}"
        )
    
    tenant_id = get_current_tenant_id()
    
    query = {
        'tenant_id': tenant_id,
        'user_id': current_user.get('id')
    }
    
    if session_id:
        query['session_id'] = session_id
    
    history = await db.ai_chat_history.find(
        query,
        {'_id': 0}
    ).sort('created_at', -1).limit(limit).to_list(limit)
    
    return {'history': history}


@router.delete("/chat/history")
async def clear_chat_history(
    session_id: Optional[str] = None,
    current_user: dict = Depends(get_current_user)
):
    """
    Clear chat history for the current user
    """
    if not is_allowed_role(current_user):
        raise HTTPException(
            status_code=403, 
            detail=f"AI Assistant is only available to: {', '.join(ALLOWED_ROLES)}"
        )
    
    tenant_id = get_current_tenant_id()
    
    query = {
        'tenant_id': tenant_id,
        'user_id': current_user.get('id')
    }
    
    if session_id:
        query['session_id'] = session_id
    
    result = await db.ai_chat_history.delete_many(query)
    
    return {'deleted': result.deleted_count}


@router.get("/status")
async def get_assistant_status(current_user: dict = Depends(get_current_user)):
    """
    Check if AI assistant is available for the current user
    """
    is_allowed = is_allowed_role(current_user)
    
    return {
        'available': is_allowed,
        'user_role': current_user.get('role'),
        'allowed_roles': ALLOWED_ROLES,
        'message': 'AI Assistant is available' if is_allowed else f'AI Assistant requires one of these roles: {", ".join(ALLOWED_ROLES)}'
    }
