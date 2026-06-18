"""
Analytics module - dashboard, pipeline-accounts, activity-metrics analytics.
"""
from fastapi import APIRouter, HTTPException, Depends, Query
from typing import Optional
from datetime import datetime, timezone, timedelta

from database import db, get_tenant_db
from deps import get_current_user

router = APIRouter()


def get_tdb():
    return get_tenant_db()


# ============= ANALYTICS/REPORTS ROUTES =============

@router.get("/analytics/dashboard")
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
        # Get the first day of current month, then go back one day to get last day of previous month
        first_of_current = now.replace(day=1, hour=0, minute=0, second=0, microsecond=0)
        last_day_of_prev = first_of_current - timedelta(days=1)
        first_of_prev = last_day_of_prev.replace(day=1)
        start_date = first_of_prev.isoformat()
        end_date = last_day_of_prev.replace(hour=23, minute=59, second=59).isoformat()
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
    
    # Add date filter if not lifetime — match leads created OR updated in the period
    if start_date and end_date:
        date_range = {'$gte': start_date, '$lte': end_date}
        match_stage['$or'] = [
            {'created_at': date_range},
            {'updated_at': date_range}
        ]
    
    # Activity query with same filters
    activity_query = {}
    
    if current_user['role'] == 'sales_rep':
        activity_query['created_by'] = current_user['id']
    elif sales_resource:
        activity_query['created_by'] = sales_resource
    
    if start_date and end_date:
        activity_query['created_at'] = {'$gte': start_date, '$lte': end_date}
    
    # Get all activities
    activities = await get_tdb().activities.find(activity_query, {'_id': 0}).to_list(10000)
    
    # Filter activities by location if needed (via lead lookup)
    if territory or state or city:
        lead_ids_query = {}
        if territory and territory != 'all':
            lead_ids_query['region'] = territory
        if state:
            lead_ids_query['state'] = state
        if city:
            lead_ids_query['city'] = city
        
        matching_leads = await get_tdb().leads.find(lead_ids_query, {'_id': 0, 'id': 1}).to_list(10000)
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
    status_results = await get_tdb().leads.aggregate(status_pipeline).to_list(100)
    status_counts = {item['_id']: item['count'] for item in status_results}
    
    # Calculate metrics
    total_leads = sum(status_counts.values())
    new_leads_added = total_leads
    leads_won = status_counts.get('closed_won', 0)
    leads_lost = status_counts.get('closed_lost', 0)
    conversion_rate = (leads_won / total_leads * 100) if total_leads > 0 else 0
    
    # Pipeline value - based on target_closure_month/year matching the time filter
    # Sum opportunity_estimation.estimated_monthly_revenue from proposed SKU section
    pipeline_match = {}
    if current_user['role'] == 'sales_rep':
        pipeline_match['assigned_to'] = current_user['id']
    elif sales_resource:
        pipeline_match['assigned_to'] = sales_resource
    if territory and territory != 'all':
        pipeline_match['region'] = territory
    if state:
        pipeline_match['state'] = state
    if city:
        pipeline_match['city'] = city
    pipeline_match['status'] = {'$nin': ['closed_lost', 'closed_won', 'not_qualified', 'won', 'lost']}

    # Build target_closure month/year conditions from time_filter
    def _get_target_closure_conditions(tf, ref_now):
        conditions = []
        if tf == 'this_month':
            conditions = [{'target_closure_month': ref_now.month, 'target_closure_year': ref_now.year}]
        elif tf == 'last_month':
            prev = ref_now.replace(day=1) - timedelta(days=1)
            conditions = [{'target_closure_month': prev.month, 'target_closure_year': prev.year}]
        elif tf == 'this_week':
            conditions = [{'target_closure_month': ref_now.month, 'target_closure_year': ref_now.year}]
        elif tf == 'last_week':
            lw = ref_now - timedelta(days=ref_now.weekday() + 7)
            conditions = [{'target_closure_month': lw.month, 'target_closure_year': lw.year}]
        elif tf == 'this_quarter':
            q_start = ((ref_now.month - 1) // 3) * 3 + 1
            for m in range(q_start, q_start + 3):
                conditions.append({'target_closure_month': m, 'target_closure_year': ref_now.year})
        elif tf == 'last_quarter':
            q = (ref_now.month - 1) // 3
            if q == 0:
                for m in [10, 11, 12]:
                    conditions.append({'target_closure_month': m, 'target_closure_year': ref_now.year - 1})
            else:
                q_start = (q - 1) * 3 + 1
                for m in range(q_start, q_start + 3):
                    conditions.append({'target_closure_month': m, 'target_closure_year': ref_now.year})
        elif tf == 'last_3_months':
            d = ref_now
            seen = set()
            for _ in range(90):
                key = (d.month, d.year)
                if key not in seen:
                    seen.add(key)
                    conditions.append({'target_closure_month': d.month, 'target_closure_year': d.year})
                d = d - timedelta(days=1)
                if len(seen) >= 3:
                    break
        elif tf == 'last_6_months':
            d = ref_now
            seen = set()
            for _ in range(180):
                key = (d.month, d.year)
                if key not in seen:
                    seen.add(key)
                    conditions.append({'target_closure_month': d.month, 'target_closure_year': d.year})
                d = d - timedelta(days=1)
                if len(seen) >= 6:
                    break
        return conditions

    tc_conditions = _get_target_closure_conditions(time_filter, now)
    if tc_conditions:
        pipeline_match['$or'] = tc_conditions

    pipeline_value_pipeline = [
        {'$match': pipeline_match},
        {'$group': {'_id': None, 'total_value': {'$sum': {'$ifNull': ['$opportunity_estimation.estimated_monthly_revenue', 0]}}}}
    ]
    pipeline_value_result = await get_tdb().leads.aggregate(pipeline_value_pipeline).to_list(1)
    pipeline_value = pipeline_value_result[0]['total_value'] if pipeline_value_result else 0
    
    # Today's follow-ups
    today = datetime.now(timezone.utc).date()
    today_start = datetime.combine(today, datetime.min.time()).replace(tzinfo=timezone.utc).isoformat()
    today_end = datetime.combine(today, datetime.max.time()).replace(tzinfo=timezone.utc).isoformat()
    
    today_follow_ups_count = await get_tdb().follow_ups.count_documents({
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
        # Get the first day of current month, then go back one day to get last day of previous month
        first_of_current = now.replace(day=1, hour=0, minute=0, second=0, microsecond=0)
        last_day_of_prev = first_of_current - timedelta(days=1)
        first_of_prev = last_day_of_prev.replace(day=1)
        start_date = first_of_prev.isoformat()
        end_date = last_day_of_prev.replace(hour=23, minute=59, second=59).isoformat()
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
    activities = await get_tdb().activities.find(activity_query, {'_id': 0}).to_list(10000)
    
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
    status_results = await get_tdb().leads.aggregate(status_pipeline).to_list(100)
    status_counts = {item['_id']: item['count'] for item in status_results}
    
    # Calculate metrics
    total_leads = sum(status_counts.values())
    new_leads_added = total_leads  # All leads in time period are "new" for that period
    leads_won = status_counts.get('closed_won', 0)
    leads_lost = status_counts.get('closed_lost', 0)
    conversion_rate = (leads_won / total_leads * 100) if total_leads > 0 else 0
    
    # Pipeline value - exclude won, lost, closed_won, closed_lost, and not_qualified (only active opportunities)
    pipeline_value_pipeline = [
        {'$match': {**match_stage, 'status': {'$nin': ['closed_lost', 'closed_won', 'not_qualified', 'won', 'lost']}}},
        {'$group': {'_id': None, 'total_value': {'$sum': '$estimated_value'}}}
    ]
    pipeline_value_result = await get_tdb().leads.aggregate(pipeline_value_pipeline).to_list(1)
    pipeline_value = pipeline_value_result[0]['total_value'] if pipeline_value_result else 0
    
    # Today's follow-ups
    today = datetime.now(timezone.utc).date()
    today_start = datetime.combine(today, datetime.min.time()).replace(tzinfo=timezone.utc).isoformat()
    today_end = datetime.combine(today, datetime.max.time()).replace(tzinfo=timezone.utc).isoformat()
    
    today_follow_ups_count = await get_tdb().follow_ups.count_documents({
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


@router.get("/analytics/pipeline-accounts")
async def get_pipeline_accounts(
    time_filter: Optional[str] = 'lifetime',
    territory: Optional[str] = None,
    state: Optional[str] = None,
    city: Optional[str] = None,
    sales_resource: Optional[str] = None,
    page: int = Query(1, ge=1),
    page_size: int = Query(50, ge=1, le=100),
    current_user: dict = Depends(get_current_user)
):
    """Get list of accounts/leads contributing to pipeline value"""
    
    now = datetime.now(timezone.utc)
    
    # Build match stage - exclude won, lost, closed statuses, only leads with opportunity estimation
    match_stage = {
        'status': {'$nin': ['closed_lost', 'closed_won', 'not_qualified', 'won', 'lost']},
        'opportunity_estimation.estimated_monthly_revenue': {'$gt': 0}
    }
    
    # Build target_closure month/year conditions from time_filter
    def _get_tc_conditions(tf, ref_now):
        conditions = []
        if tf == 'this_month':
            conditions = [{'target_closure_month': ref_now.month, 'target_closure_year': ref_now.year}]
        elif tf == 'last_month':
            prev = ref_now.replace(day=1) - timedelta(days=1)
            conditions = [{'target_closure_month': prev.month, 'target_closure_year': prev.year}]
        elif tf == 'this_week':
            conditions = [{'target_closure_month': ref_now.month, 'target_closure_year': ref_now.year}]
        elif tf == 'last_week':
            lw = ref_now - timedelta(days=ref_now.weekday() + 7)
            conditions = [{'target_closure_month': lw.month, 'target_closure_year': lw.year}]
        elif tf == 'this_quarter':
            q_start = ((ref_now.month - 1) // 3) * 3 + 1
            for m in range(q_start, q_start + 3):
                conditions.append({'target_closure_month': m, 'target_closure_year': ref_now.year})
        elif tf == 'last_quarter':
            q = (ref_now.month - 1) // 3
            if q == 0:
                for m in [10, 11, 12]:
                    conditions.append({'target_closure_month': m, 'target_closure_year': ref_now.year - 1})
            else:
                q_start = (q - 1) * 3 + 1
                for m in range(q_start, q_start + 3):
                    conditions.append({'target_closure_month': m, 'target_closure_year': ref_now.year})
        elif tf == 'last_3_months':
            d = ref_now
            seen = set()
            for _ in range(90):
                key = (d.month, d.year)
                if key not in seen:
                    seen.add(key)
                    conditions.append({'target_closure_month': d.month, 'target_closure_year': d.year})
                d = d - timedelta(days=1)
                if len(seen) >= 3:
                    break
        elif tf == 'last_6_months':
            d = ref_now
            seen = set()
            for _ in range(180):
                key = (d.month, d.year)
                if key not in seen:
                    seen.add(key)
                    conditions.append({'target_closure_month': d.month, 'target_closure_year': d.year})
                d = d - timedelta(days=1)
                if len(seen) >= 6:
                    break
        return conditions

    tc_conditions = _get_tc_conditions(time_filter, now)
    if tc_conditions:
        match_stage['$or'] = tc_conditions
    
    # Add territory/state/city filters
    if territory and territory != 'all':
        match_stage['territory'] = territory
    if state and state != 'all':
        match_stage['state'] = state
    if city and city != 'all':
        match_stage['city'] = city
    
    # Add sales resource filter
    if sales_resource and sales_resource != 'all':
        match_stage['assigned_to'] = sales_resource
    
    # Get total count
    total = await get_tdb().leads.count_documents(match_stage)
    
    # Get total pipeline value
    pipeline_value_result = await get_tdb().leads.aggregate([
        {'$match': match_stage},
        {'$group': {'_id': None, 'total_value': {'$sum': {'$ifNull': ['$opportunity_estimation.estimated_monthly_revenue', 0]}}}}
    ]).to_list(1)
    total_pipeline_value = pipeline_value_result[0]['total_value'] if pipeline_value_result else 0
    
    # Get paginated accounts sorted by opportunity estimation descending
    accounts = await get_tdb().leads.find(
        match_stage,
        {
            '_id': 0,
            'id': 1,
            'company': 1,
            'contact_person': 1,
            'phone': 1,
            'city': 1,
            'state': 1,
            'status': 1,
            'estimated_value': 1,
            'opportunity_estimation.estimated_monthly_revenue': 1,
            'assigned_to': 1,
            'assigned_to_name': 1,
            'target_closure_month': 1,
            'target_closure_year': 1,
            'created_at': 1,
            'updated_at': 1
        }
    ).sort('opportunity_estimation.estimated_monthly_revenue', -1).skip((page - 1) * page_size).limit(page_size).to_list(page_size)
    
    # Map company to account_name and use opportunity estimation for display value
    for account in accounts:
        account['account_name'] = account.pop('company', None)
        oe = account.pop('opportunity_estimation', None) or {}
        account['estimated_value'] = oe.get('estimated_monthly_revenue', 0) or account.get('estimated_value', 0) or 0
    
    return {
        'accounts': accounts,
        'total': total,
        'total_pipeline_value': total_pipeline_value,
        'page': page,
        'page_size': page_size,
        'total_pages': (total + page_size - 1) // page_size
    }
async def get_reports(current_user: dict = Depends(get_current_user)):
    # Build match stage based on role
    match_stage = {} if current_user['role'] in ['admin', 'sales_manager'] else {'assigned_to': current_user['id']}
    
    # Lead source analysis using aggregation
    source_pipeline = [
        {'$match': match_stage},
        {'$group': {'_id': {'$ifNull': ['$source', 'unknown']}, 'count': {'$sum': 1}}}
    ]
    source_results = await get_tdb().leads.aggregate(source_pipeline).to_list(100)
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
        team_results = await get_tdb().leads.aggregate(team_pipeline).to_list(100)
        
        # Get user names
        user_ids = [item['_id'] for item in team_results if item['_id']]
        users = await get_tdb().users.find(
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
    monthly_results = await get_tdb().leads.aggregate(monthly_pipeline).to_list(1000)
    
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

@router.get("/analytics/activity-metrics")
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
        direct_reports = await get_tdb().users.find(
            {'reports_to': current_user['id']},
            {'_id': 0, 'id': 1}
        ).to_list(100)
        
        if direct_reports:
            user_ids = [u['id'] for u in direct_reports]
            query['created_by'] = {'$in': user_ids}
    
    # Get all activities
    activities = await get_tdb().activities.find(query, {'_id': 0}).to_list(5000)
    
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
    
    new_leads = await get_tdb().leads.count_documents(leads_query)
    
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
    country_results = await get_tdb().leads.aggregate(country_pipeline).to_list(100)
    
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
    state_results = await get_tdb().leads.aggregate(state_pipeline).to_list(100)
    
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
    city_results = await get_tdb().leads.aggregate(city_pipeline).to_list(20)
    
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
    region_results = await get_tdb().leads.aggregate(region_pipeline).to_list(100)
    
    # Team locations
    team_locations = []
    if current_user['role'] in ['ceo', 'director', 'vp', 'admin', 'sales_manager']:
        users = await get_tdb().users.find(
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

