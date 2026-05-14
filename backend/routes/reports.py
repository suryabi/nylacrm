"""
Reports module - Target allocation and performance reports (SKU, Resource, Account).
"""
from fastapi import APIRouter, Depends, HTTPException
from typing import Optional
from datetime import datetime, timezone, timedelta
import logging

from database import db, get_tenant_db
from deps import get_current_user

router = APIRouter()
logger = logging.getLogger(__name__)


def get_tdb():
    return get_tenant_db()


@router.get("/reports/target-resource-allocation")
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
        resource_targets = await get_tdb().resource_targets.find({'plan_id': plan['id']}, {'_id': 0}).to_list(1000)
        
        # Get city info
        city_ids = list(set([r['city_id'] for r in resource_targets]))
        cities = await db.city_targets.find({'id': {'$in': city_ids}}, {'_id': 0}).to_list(1000)
        city_map = {c['id']: c for c in cities}
        
        # Get user info
        user_ids = list(set([r['resource_id'] for r in resource_targets]))
        users = await get_tdb().users.find({'id': {'$in': user_ids}}, {'_id': 0}).to_list(100)
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

@router.get("/reports/target-sku-allocation")
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

@router.get("/reports/sku-performance")
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

    # ─── Build SKU master map: external_sku_id → display sku_name ───
    # Only ACTIVE master SKUs are surfaced as "known" so the report matches
    # the SKU Management screen. Inactive (soft-deleted) SKUs are still kept
    # in `ext_to_name` so historic invoice line items can resolve, but they
    # won't add empty rows to the displayed list.
    sku_masters = await get_tdb().master_skus.find({}, {'_id': 0}).to_list(500)
    ext_to_name = {}
    all_known_skus = set()
    for m in sku_masters:
        name = m.get('sku_name') or m.get('sku') or m.get('name')
        if not name:
            continue
        is_active = m.get('is_active', True)
        if is_active:
            all_known_skus.add(name)
        for k in ('external_sku_id', 'sku', 'sku_name'):
            v = m.get(k)
            if v:
                ext_to_name[str(v).strip()] = name

    # Get leads with interested SKUs (used as a fallback signal)
    leads_with_skus = await get_tdb().leads.find(
        {**lead_query, 'interested_skus': {'$exists': True, '$ne': []}},
        {'_id': 0, 'interested_skus': 1, 'invoice_value': 1, 'status': 1, 'id': 1}
    ).to_list(1000)

    # ─── Get invoices in window (filter on invoice_date, not created_at) ───
    invoice_query = {}
    if time_filter != 'lifetime':
        start_str = start_date.date().isoformat() if hasattr(start_date, 'date') else start_date.isoformat()[:10]
        end_str = end_date.date().isoformat() if hasattr(end_date, 'date') else end_date.isoformat()[:10]
        invoice_query['invoice_date'] = {'$gte': start_str, '$lte': end_str}
    if resource_id:
        invoice_query['created_by'] = resource_id

    invoices = await get_tdb().invoices.find(invoice_query, {'_id': 0}).to_list(20000)

    def _parse_num(v):
        if v is None:
            return 0.0
        try:
            return float(str(v).replace('%', '').replace(',', '').strip())
        except Exception:
            return 0.0

    def _resolve_sku_name(item):
        # Try enriched fields first, then external IDs
        for k in ('sku_name', 'sku'):
            v = item.get(k)
            if v:
                return v
        for k in ('external_sku_id', 'external_item_id', 'itemId', 'item_id', 'sku_id'):
            v = item.get(k)
            if v and str(v).strip() in ext_to_name:
                return ext_to_name[str(v).strip()]
        # Fallback: surface the raw external code so admins can fix mappings
        for k in ('external_sku_id', 'external_item_id', 'itemId', 'item_id'):
            v = item.get(k)
            if v:
                return f"[Unmapped: {v}]"
        return None

    def _line_value(item):
        # Prefer enriched net_amount → gross_amount; fall back to qty*rate*(1-disc%)
        if item.get('net_amount') is not None:
            return _parse_num(item.get('net_amount'))
        if item.get('gross_amount') is not None:
            return _parse_num(item.get('gross_amount'))
        qty = _parse_num(item.get('quantity'))
        rate = _parse_num(item.get('rate'))
        disc = _parse_num(item.get('discount_percent') or item.get('discount'))
        if disc > 100:
            disc = disc / 100.0  # safeguard for badly stored fractions
        return qty * rate * max(0.0, 1.0 - disc / 100.0)

    # ─── Tally achieved revenue + units + distinct accounts per SKU from invoice line items ───
    sku_invoice_revenue = {}
    sku_invoice_units = {}
    sku_invoice_accounts = {}  # SKU → set of account identifiers
    for inv in invoices:
        items = inv.get('items') or inv.get('line_items') or []
        # Stable account identifier (prefer human code → uuid → name)
        inv_acc = (inv.get('account_id') or inv.get('account_uuid')
                   or inv.get('account_id_from_mq')
                   or (inv.get('account_name') or '').strip().lower()
                   or None)
        for item in items:
            name = _resolve_sku_name(item)
            if not name:
                continue
            sku_invoice_revenue[name] = sku_invoice_revenue.get(name, 0) + _line_value(item)
            sku_invoice_units[name] = sku_invoice_units.get(name, 0) + _parse_num(item.get('quantity'))
            if inv_acc:
                sku_invoice_accounts.setdefault(name, set()).add(inv_acc)
    
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
    
    # Build SKU performance data — list = ACTIVE master SKUs ∪ any SKUs
    # found in invoices/targets. Blank/whitespace-only names are dropped
    # so the report never renders an empty SKU row.
    skus_data = []
    if sku and sku != 'all':
        sku_list = [sku]
    else:
        raw = all_known_skus | set(sku_invoice_revenue.keys()) | set(sku_target_map.keys())
        sku_list = sorted(s for s in raw if s and str(s).strip())
        if not sku_list:
            sku_list = SKU_OPTIONS

    total_target = 0
    total_achieved = 0
    total_units = 0

    for sku_name in sku_list:
        target_info = sku_target_map.get(sku_name, {})
        target_revenue = target_info.get('target_revenue', 0)

        achieved = sku_invoice_revenue.get(sku_name, 0)
        units = sku_invoice_units.get(sku_name, 0) or target_info.get('target_units', 0)
        accounts_count = len(sku_invoice_accounts.get(sku_name, set()))

        achievement_pct = int((achieved / target_revenue * 100)) if target_revenue > 0 else 0

        skus_data.append({
            'sku': sku_name,
            'target_revenue': target_revenue,
            'achieved_revenue': round(achieved, 2),
            'units_sold': int(units),
            'units_pct': 0,  # filled in after total is known
            'accounts_count': accounts_count,
            'leads_count': sku_leads_count.get(sku_name, 0),  # kept for backwards compatibility
            'achievement_pct': min(achievement_pct, 200)
        })

        total_target += target_revenue
        total_achieved += achieved
        total_units += units

    # Backfill units_pct now that we have total_units
    if total_units > 0:
        for row in skus_data:
            row['units_pct'] = round((row['units_sold'] / total_units) * 100, 1)
    
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

@router.get("/reports/resource-performance")
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
    
    users = await get_tdb().users.find(user_query, {'_id': 0, 'id': 1, 'name': 1, 'role': 1, 'territory': 1, 'email': 1}).to_list(100)
    
    # Get targets for each resource
    resource_targets = await get_tdb().resource_targets.find({}, {'_id': 0}).to_list(500)
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
    activities = await get_tdb().activities.find(
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
    
    leads = await get_tdb().leads.find(
        lead_date_query,
        {'_id': 0, 'assigned_to': 1, 'status': 1, 'invoice_value': 1, 'estimated_value': 1, 'id': 1, 'account_id': 1}
    ).to_list(5000)

    user_leads = {}
    for lead in leads:
        uid = lead.get('assigned_to')
        if uid not in user_leads:
            user_leads[uid] = {'count': 0, 'won': 0, 'revenue': 0}
        user_leads[uid]['count'] += 1
        if lead.get('status') in ['closed_won', 'won']:
            user_leads[uid]['won'] += 1
            # leave 'revenue' alone — we now drive revenue from invoices below

    # ─── Pull invoice revenue per resource (matched via account → assigned_to) ───
    invoice_query = {}
    if time_filter != 'lifetime':
        start_str = start_date.date().isoformat() if hasattr(start_date, 'date') else start_date.isoformat()[:10]
        end_str = end_date.date().isoformat() if hasattr(end_date, 'date') else end_date.isoformat()[:10]
        invoice_query['invoice_date'] = {'$gte': start_str, '$lte': end_str}

    all_invoices = await get_tdb().invoices.find(invoice_query, {'_id': 0}).to_list(20000)

    # Build account_code → owner (assigned_to) map (lifetime accounts, not date-filtered)
    all_accounts = await get_tdb().accounts.find({}, {'_id': 0, 'account_id': 1, 'id': 1, 'account_name': 1, 'assigned_to': 1, 'lead_id': 1}).to_list(2000)
    code_to_owner = {a.get('account_id'): a.get('assigned_to') for a in all_accounts if a.get('account_id') and a.get('assigned_to')}
    uuid_to_owner = {a.get('id'): a.get('assigned_to') for a in all_accounts if a.get('id') and a.get('assigned_to')}
    name_to_owner = {(a.get('account_name') or '').strip().lower(): a.get('assigned_to') for a in all_accounts if a.get('account_name') and a.get('assigned_to')}

    def _gross(inv):
        return inv.get('gross_invoice_value') or inv.get('gross_amount') or inv.get('grand_total') or inv.get('total_amount') or 0
    def _net(inv):
        v = inv.get('net_invoice_value') or inv.get('net_amount')
        return v if v is not None else (_gross(inv) - (inv.get('credit_note_value') or inv.get('credit_note') or 0))

    user_invoice_revenue = {}
    user_invoice_count = {}
    for inv in all_invoices:
        # 1) Direct created_by on invoice
        owner = inv.get('created_by')
        # 2) Account-id match
        if not owner:
            inv_acc = inv.get('account_id') or inv.get('account_uuid') or inv.get('account_id_from_mq')
            if inv_acc:
                owner = code_to_owner.get(inv_acc) or uuid_to_owner.get(inv_acc)
        # 3) Account-name match
        if not owner:
            nm = (inv.get('account_name') or '').strip().lower()
            if nm:
                owner = name_to_owner.get(nm)
        if not owner:
            continue
        user_invoice_revenue[owner] = user_invoice_revenue.get(owner, 0) + _net(inv)
        user_invoice_count[owner] = user_invoice_count.get(owner, 0) + 1
    
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
        
        # Calculate achieved revenue — driven by invoices (matched via account ownership)
        achieved = user_invoice_revenue.get(uid, 0)
        invoices_for_user = user_invoice_count.get(uid, 0)

        achievement_pct = int((achieved / target * 100)) if target > 0 else 0

        resources_data.append({
            'id': uid,
            'name': user.get('name', 'Unknown'),
            'role': user.get('role', ''),
            'territory': user.get('territory', ''),
            'target_revenue': target,
            'achieved_revenue': round(achieved, 2),
            'invoices_count': invoices_for_user,
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

@router.get("/reports/account-performance")
async def get_account_performance(
    time_filter: str = 'this_month',
    territory: Optional[str] = None,
    state: Optional[str] = None,
    city: Optional[str] = None,
    lead_type: Optional[str] = None,
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
    if lead_type:
        # Treat accounts with missing/empty lead_type as 'B2B' (matches Accounts List default)
        if lead_type == 'B2B':
            account_query['$or'] = [
                {'lead_type': 'B2B'},
                {'lead_type': {'$in': [None, '']}},
                {'lead_type': {'$exists': False}},
            ]
        else:
            account_query['lead_type'] = lead_type
    
    # Fetch all accounts matching filters
    accounts = await get_tdb().accounts.find(account_query, {'_id': 0}).to_list(500)

    # Build invoice date query — use invoice_date (the actual document date), not created_at (import time)
    invoice_query = {}
    if time_filter != 'lifetime':
        # invoice_date is stored as YYYY-MM-DD strings; date-string lex comparison works
        start_str = start_date.date().isoformat() if hasattr(start_date, 'date') else start_date.isoformat()[:10]
        end_str = end_date.date().isoformat() if hasattr(end_date, 'date') else end_date.isoformat()[:10]
        invoice_query['invoice_date'] = {'$gte': start_str, '$lte': end_str}

    # Get all invoices within time range
    all_invoices = await get_tdb().invoices.find(invoice_query, {'_id': 0}).to_list(20000)

    # ─── Helpers to read invoice fields (handle both internal + external payload shapes) ───
    def _gross(inv):
        return inv.get('gross_invoice_value') or inv.get('gross_amount') or inv.get('grand_total') or inv.get('total_amount') or 0
    def _net(inv):
        v = inv.get('net_invoice_value') or inv.get('net_amount')
        if v is not None:
            return v
        # Fallback: gross - credit
        return (_gross(inv)) - (inv.get('credit_note_value') or inv.get('credit_note') or 0)
    def _credit(inv):
        return inv.get('credit_note_value') or inv.get('credit_note') or inv.get('bottle_credit') or 0
    def _outstanding(inv):
        return inv.get('outstanding') or 0

    # Build lookup: account_code (human id like PATN-KOL-A26-001) → account
    accounts_by_code = {a.get('account_id'): a for a in accounts if a.get('account_id')}
    accounts_by_uuid = {a.get('id'): a for a in accounts if a.get('id')}
    accounts_by_name = {(a.get('account_name') or '').strip().lower(): a for a in accounts if a.get('account_name')}

    # Aggregate invoice data by account
    account_invoices = {}
    for inv in all_invoices:
        acc = None
        # 1) Match invoice.account_id against account.account_id (human code) or .id (uuid)
        inv_acc_field = inv.get('account_id') or inv.get('account_uuid') or inv.get('account_id_from_mq')
        if inv_acc_field:
            acc = accounts_by_code.get(inv_acc_field) or accounts_by_uuid.get(inv_acc_field)
        # 2) Fall back to account_name exact match (case-insensitive)
        if not acc:
            inv_name = (inv.get('account_name') or inv.get('customer_name') or '').strip().lower()
            if inv_name:
                acc = accounts_by_name.get(inv_name)
        if not acc:
            continue

        acc_id = acc.get('account_id') or acc.get('id')
        bucket = account_invoices.setdefault(acc_id, {
            'gross_total': 0, 'net_total': 0, 'credit_total': 0,
            'outstanding_total': 0, 'invoice_count': 0,
        })
        bucket['gross_total'] += _gross(inv)
        bucket['net_total'] += _net(inv)
        bucket['credit_total'] += _credit(inv)
        bucket['outstanding_total'] += _outstanding(inv)
        bucket['invoice_count'] += 1

    # Build performance data
    accounts_data = []
    summary_gross = 0
    summary_net = 0
    summary_bottle_credit = 0
    summary_outstanding = 0
    summary_overdue = 0

    # Calculate filtered total gross for accurate contribution %
    filtered_total_gross = sum(b['gross_total'] for b in account_invoices.values())

    for acc in accounts:
        acc_id = acc.get('account_id') or acc.get('id')
        inv_data = account_invoices.get(acc_id, {
            'gross_total': 0,
            'net_total': 0,
            'credit_total': 0,
            'outstanding_total': 0,
            'invoice_count': 0,
        })

        # Calculate contribution percentage (based on filtered accounts' total)
        contribution_pct = 0
        if filtered_total_gross > 0:
            contribution_pct = round((inv_data['gross_total'] / filtered_total_gross) * 100, 2)
        
        # Calculate average order amount
        average_order = 0
        if inv_data['invoice_count'] > 0:
            average_order = round(inv_data['gross_total'] / inv_data['invoice_count'], 2)

        # Outstanding: ALWAYS use account.outstanding_balance — that's the value the
        # external system overwrites on each incoming invoice (the running running
        # balance, even when back-dated invoices arrive). Summing across invoices is
        # wrong because every invoice carries the same running total.
        outstanding = float(acc.get('outstanding_balance') or 0)
        overdue = acc.get('overdue_amount', 0)
        last_payment = acc.get('last_payment_amount', 0)
        last_payment_date = acc.get('last_payment_date', '')

        # Bottle credit: strictly the credit-note total from invoices in this period.
        # No SKU-pricing fallback — that's a config rate, not an actual credit issued.
        bottle_credit = inv_data['credit_total']
        
        accounts_data.append({
            'account_id': acc_id,
            'account_name': acc.get('account_name', 'Unknown'),
            'lead_type': acc.get('lead_type') or 'B2B',
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


# ============================================================
# Admin: Cleanup non-master SKUs from SKU performance sources
# ============================================================
@router.post("/admin/cleanup-non-master-skus")
async def cleanup_non_master_skus(
    payload: dict,
    current_user: dict = Depends(get_current_user),
):
    """Remove references to SKUs that are not present in the master_skus
    catalog from the data sources feeding the SKU Performance report.

    Sources cleaned:
      • sku_targets              (delete entries whose `sku` is non-master)
      • leads.interested_skus[]  (pull non-master entries from the array)
      • invoices.items[] / line_items[]
                                  (pull line items whose resolved SKU is
                                   non-master — invoice totals/headers are
                                   left untouched)

    Body:
      {"confirm": "CLEANUP_SKUS", "dry_run": true|false}

    Permissions: CEO or System Admin only.
    """
    if (current_user or {}).get('role') not in ['CEO', 'System Admin']:
        raise HTTPException(status_code=403, detail="Only CEO and System Admin can run this operation")

    if (payload or {}).get('confirm') != 'CLEANUP_SKUS':
        raise HTTPException(
            status_code=400,
            detail='Missing or invalid confirm token. Provide {"confirm": "CLEANUP_SKUS"} to proceed.'
        )

    dry_run = bool((payload or {}).get('dry_run', True))
    tdb = get_tdb()

    # --- Build the universe of "valid" SKU identifiers from master_skus ---
    sku_masters = await tdb.master_skus.find({}, {'_id': 0}).to_list(500)
    valid_ids: set = set()
    valid_names: set = set()
    # Map any valid identifier → canonical display name, so the "kept"
    # breakdown groups under the human-readable SKU name.
    ident_to_name: dict = {}
    for m in sku_masters:
        display = (m.get('sku_name') or m.get('sku') or m.get('name') or '').strip()
        for k in ('id', 'sku_id', 'external_sku_id', 'sku', 'sku_code'):
            v = m.get(k)
            if v is not None and str(v).strip():
                key = str(v).strip()
                valid_ids.add(key)
                if display:
                    ident_to_name[key] = display
        for k in ('sku_name', 'sku', 'name'):
            v = m.get(k)
            if v is not None and str(v).strip():
                key = str(v).strip()
                valid_names.add(key)
                if display:
                    ident_to_name[key] = display

    valid_all = valid_ids | valid_names

    def _is_master(val) -> bool:
        if val is None:
            return False
        s = str(val).strip()
        return bool(s) and s in valid_all

    def _canonical(val) -> str:
        s = '' if val is None else str(val).strip()
        return ident_to_name.get(s, s)

    # --- 1) sku_targets: delete docs whose `sku` is non-master ---
    sku_targets_docs = await tdb.sku_targets.find({}, {'_id': 0}).to_list(5000)
    bad_target_skus: dict = {}
    kept_target_skus: dict = {}
    bad_target_count = 0
    kept_target_count = 0
    for t in sku_targets_docs:
        sku_val = t.get('sku') or t.get('sku_name') or t.get('sku_id')
        if _is_master(sku_val):
            key = _canonical(sku_val) or '<missing>'
            kept_target_skus[key] = kept_target_skus.get(key, 0) + 1
            kept_target_count += 1
        else:
            key = str(sku_val) if sku_val is not None else '<missing>'
            bad_target_skus[key] = bad_target_skus.get(key, 0) + 1
            bad_target_count += 1

    if not dry_run and bad_target_count:
        # Build deletion filter: targets whose sku field is NOT in valid_all.
        # We delete in two passes to handle both `sku` and `sku_name` keys.
        await tdb.sku_targets.delete_many({
            '$and': [
                {'$or': [
                    {'sku': {'$exists': True}},
                    {'sku_name': {'$exists': True}},
                    {'sku_id': {'$exists': True}},
                ]},
                {'sku': {'$nin': list(valid_all)}},
                {'sku_name': {'$nin': list(valid_all)}},
                {'sku_id': {'$nin': list(valid_all)}},
            ]
        })

    # --- 2) leads.interested_skus[]: pull non-master entries ---
    leads_cursor = tdb.leads.find(
        {'interested_skus': {'$exists': True, '$ne': []}},
        {'_id': 0, 'id': 1, 'interested_skus': 1}
    )
    leads_changed = 0
    leads_entries_removed = 0
    leads_entries_kept = 0
    bad_lead_skus: dict = {}
    kept_lead_skus: dict = {}
    lead_updates = []  # (lead_id, new_array)
    async for lead in leads_cursor:
        current = lead.get('interested_skus') or []
        kept = []
        removed_here = 0
        for entry in current:
            ok = False
            ident = None
            if isinstance(entry, dict):
                for k in ('sku_id', 'id', 'sku', 'sku_name', 'name'):
                    if entry.get(k):
                        ident = entry.get(k)
                        if _is_master(ident):
                            ok = True
                            break
            else:
                ident = entry
                ok = _is_master(entry)
            if ok:
                kept.append(entry)
                leads_entries_kept += 1
                k_key = _canonical(ident) or '<missing>'
                kept_lead_skus[k_key] = kept_lead_skus.get(k_key, 0) + 1
            else:
                removed_here += 1
                key = str(ident) if ident is not None else '<missing>'
                bad_lead_skus[key] = bad_lead_skus.get(key, 0) + 1
        if removed_here:
            leads_changed += 1
            leads_entries_removed += removed_here
            lead_updates.append((lead.get('id'), kept))

    if not dry_run and lead_updates:
        for lead_id, new_arr in lead_updates:
            try:
                await tdb.leads.update_one(
                    {'id': lead_id},
                    {'$set': {'interested_skus': new_arr}}
                )
            except Exception as e:
                logger.error(f"cleanup-non-master-skus: failed to update lead {lead_id}: {e}")

    # --- 3) invoices.items[] / line_items[]: pull non-master line items ---
    invoices_changed = 0
    invoice_items_removed = 0
    invoice_items_kept = 0
    bad_invoice_skus: dict = {}
    kept_invoice_skus: dict = {}

    def _resolve(item: dict):
        # Resolve a line item to an identifier for matching.
        for k in ('sku_name', 'sku', 'sku_code', 'external_sku_id',
                  'external_item_id', 'itemId', 'item_id', 'sku_id', 'id'):
            v = item.get(k)
            if v is not None and str(v).strip():
                return str(v).strip()
        return None

    inv_cursor = tdb.invoices.find(
        {'$or': [
            {'items': {'$exists': True, '$ne': []}},
            {'line_items': {'$exists': True, '$ne': []}},
        ]},
        {'_id': 0, 'id': 1, 'invoice_no': 1, 'items': 1, 'line_items': 1}
    )
    async for inv in inv_cursor:
        update_set = {}
        for key in ('items', 'line_items'):
            arr = inv.get(key)
            if not arr:
                continue
            kept = []
            removed = 0
            for item in arr:
                if not isinstance(item, dict):
                    kept.append(item)
                    continue
                # Determine "is master" by checking every plausible identifier.
                hit = False
                tried_any = False
                matched_ident = None
                for k in ('sku_id', 'id', 'external_sku_id', 'external_item_id',
                          'itemId', 'item_id', 'sku_code', 'sku', 'sku_name', 'name'):
                    v = item.get(k)
                    if v is None or not str(v).strip():
                        continue
                    tried_any = True
                    if _is_master(v):
                        hit = True
                        matched_ident = v
                        break
                if hit or not tried_any:
                    # If the line carries no SKU identifier at all, keep it.
                    kept.append(item)
                    if hit:
                        invoice_items_kept += 1
                        k_key = _canonical(matched_ident) or '<missing>'
                        kept_invoice_skus[k_key] = kept_invoice_skus.get(k_key, 0) + 1
                else:
                    removed += 1
                    ident = _resolve(item) or '<missing>'
                    bad_invoice_skus[ident] = bad_invoice_skus.get(ident, 0) + 1
            if removed:
                invoice_items_removed += removed
                update_set[key] = kept
        if update_set:
            invoices_changed += 1
            if not dry_run:
                try:
                    await tdb.invoices.update_one(
                        {'id': inv.get('id')},
                        {'$set': update_set}
                    )
                except Exception as e:
                    logger.error(f"cleanup-non-master-skus: failed to update invoice {inv.get('id')}: {e}")

    return {
        'dry_run': dry_run,
        'master_sku_count': len(sku_masters),
        'master_sku_names': sorted({_canonical(n) for n in valid_names if _canonical(n)}),
        'sku_targets': {
            'non_master_rows': bad_target_count,
            'non_master_sku_breakdown': bad_target_skus,
            'kept_rows': kept_target_count,
            'kept_sku_breakdown': kept_target_skus,
            'deleted': 0 if dry_run else bad_target_count,
        },
        'leads_interested_skus': {
            'leads_affected': leads_changed,
            'entries_removed': leads_entries_removed,
            'non_master_sku_breakdown': bad_lead_skus,
            'entries_kept': leads_entries_kept,
            'kept_sku_breakdown': kept_lead_skus,
        },
        'invoices': {
            'invoices_affected': invoices_changed,
            'line_items_removed': invoice_items_removed,
            'non_master_sku_breakdown': bad_invoice_skus,
            'line_items_kept': invoice_items_kept,
            'kept_sku_breakdown': kept_invoice_skus,
        },
    }
