"""
Invoices Routes - List, filter, and manage invoices
"""
from fastapi import APIRouter, HTTPException, Depends, Query, Request
from typing import Optional, List
from datetime import datetime, timezone
import logging

logger = logging.getLogger(__name__)

router = APIRouter(tags=["invoices"])

# Import dependencies
from database import get_tenant_db, get_db
from deps import get_current_user

def get_tdb():
    return get_tenant_db()


@router.get("")
async def list_invoices(
    request: Request,
    current_user: dict = Depends(get_current_user),
    search: Optional[str] = Query(None, description="Search by invoice number or account name"),
    territory: Optional[str] = Query(None),
    state: Optional[str] = Query(None),
    city: Optional[str] = Query(None),
    account_id: Optional[str] = Query(None),
    account_name: Optional[str] = Query(None),
    status: Optional[str] = Query(None),
    date_from: Optional[str] = Query(None),
    date_to: Optional[str] = Query(None),
    time_filter: Optional[str] = Query(None, description="this_week, last_week, this_month, etc."),
    sort_by: Optional[str] = Query("invoice_date", description="Field to sort by"),
    sort_order: Optional[str] = Query("desc", description="asc or desc"),
    page: int = Query(1, ge=1),
    limit: int = Query(50, ge=1, le=200),
):
    """
    List all invoices with filtering and pagination.
    Similar to leads list but for invoices.
    """
    try:
        tdb = get_tdb()
        
        logger.info(f"[INVOICES] Listing invoices with filters: search={search}, territory={territory}, state={state}, city={city}, status={status}, time_filter={time_filter}")
        
        # Build query conditions
        conditions = []
        
        # Search filter
        if search:
            conditions.append({
                '$or': [
                    {'invoice_no': {'$regex': search, '$options': 'i'}},
                    {'account_name': {'$regex': search, '$options': 'i'}},
                ]
            })
        
        # Account name filter
        if account_name:
            conditions.append({'account_name': {'$regex': account_name, '$options': 'i'}})
        
        # Status filter
        if status and status != 'all':
            conditions.append({'status': status})
        
        # Date range filters
        if date_from:
            conditions.append({'invoice_date': {'$gte': date_from}})
        
        if date_to:
            conditions.append({'invoice_date': {'$lte': date_to}})
        
        # Time filter (predefined ranges)
        if time_filter and time_filter != 'lifetime':
            from datetime import timedelta
            now = datetime.now(timezone.utc)
            
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
                if start:
                    conditions.append({'invoice_date': {'$gte': start.strftime('%Y-%m-%d')}})
                if end:
                    conditions.append({'invoice_date': {'$lte': end.strftime('%Y-%m-%d')}})
        
        # Get account IDs filtered by territory/state/city
        if territory or state or city:
            account_query = {}
            if territory:
                account_query['territory'] = territory
            if state:
                account_query['state'] = state
            if city:
                account_query['city'] = city
            
            logger.info(f"[INVOICES] Filtering accounts by: {account_query}")
            accounts = await tdb.accounts.find(account_query, {'_id': 0, 'id': 1, 'account_id': 1}).to_list(10000)
            logger.info(f"[INVOICES] Found {len(accounts)} matching accounts")
            
            if accounts:
                account_ids_list = [a.get('account_id') for a in accounts if a.get('account_id')]
                account_uuids_list = [a.get('id') for a in accounts if a.get('id')]
                
                account_filter = {'$or': []}
                if account_ids_list:
                    account_filter['$or'].append({'account_id': {'$in': account_ids_list}})
                    account_filter['$or'].append({'account_id_from_mq': {'$in': account_ids_list}})
                if account_uuids_list:
                    account_filter['$or'].append({'account_uuid': {'$in': account_uuids_list}})
                
                if account_filter['$or']:
                    conditions.append(account_filter)
            else:
                # No accounts match the filter, return empty
                logger.info(f"[INVOICES] No accounts match territory/state/city filter, returning empty")
                return {
                    'invoices': [],
                    'total': 0,
                    'page': page,
                    'limit': limit,
                    'pages': 0,
                    'summary': {'total_gross': 0, 'total_net': 0, 'total_credit': 0}
                }
        
        # Build final query
        query = {'$and': conditions} if conditions else {}
        
        logger.info(f"[INVOICES] Final query: {query}")
        
        # Sort configuration
        sort_direction = -1 if sort_order == 'desc' else 1
        sort_field = sort_by if sort_by else 'invoice_date'
        
        # Get total count
        total = await tdb.invoices.count_documents(query)
        logger.info(f"[INVOICES] Total count: {total}")
        
        # Calculate pagination
        skip = (page - 1) * limit
        pages = (total + limit - 1) // limit if total > 0 else 0
        
        # Fetch invoices
        cursor = tdb.invoices.find(query, {'_id': 0})
        cursor = cursor.sort(sort_field, sort_direction).skip(skip).limit(limit)
        invoices = await cursor.to_list(limit)
        
        # Enrich with account names if not present
        account_ids = list(set([inv.get('account_id') or inv.get('account_uuid') for inv in invoices if inv.get('account_id') or inv.get('account_uuid')]))
        
        if account_ids:
            accounts = await tdb.accounts.find(
                {'$or': [{'id': {'$in': account_ids}}, {'account_id': {'$in': account_ids}}]},
                {'_id': 0, 'id': 1, 'account_id': 1, 'account_name': 1, 'city': 1, 'state': 1, 'territory': 1}
            ).to_list(len(account_ids))
            
            account_map = {}
            for acc in accounts:
                if acc.get('id'):
                    account_map[acc['id']] = acc
                if acc.get('account_id'):
                    account_map[acc['account_id']] = acc
            
            # Enrich invoices
            for inv in invoices:
                acc_id = inv.get('account_id') or inv.get('account_uuid')
                if acc_id and acc_id in account_map:
                    acc = account_map[acc_id]
                    inv['account_name'] = inv.get('account_name') or acc.get('account_name')
                    inv['account_city'] = acc.get('city')
                    inv['account_state'] = acc.get('state')
                    inv['account_territory'] = acc.get('territory')
        
        # Normalize invoice fields (handle both old and new formats)
        for inv in invoices:
            # Normalize invoice number field
            if not inv.get('invoice_no') and inv.get('invoice_number'):
                inv['invoice_no'] = inv.get('invoice_number')
            # Normalize gross/net values (old format uses grand_total, new uses gross_invoice_value)
            if not inv.get('gross_invoice_value') and inv.get('grand_total'):
                inv['gross_invoice_value'] = inv.get('grand_total')
            if not inv.get('net_invoice_value'):
                # Calculate net as gross minus credit note
                gross = inv.get('gross_invoice_value') or inv.get('grand_total') or 0
                credit = inv.get('credit_note_value') or 0
                inv['net_invoice_value'] = gross - credit
        
        # Calculate summary - handle both old and new field names
        all_invoices_cursor = tdb.invoices.find(query, {'_id': 0, 'gross_invoice_value': 1, 'grand_total': 1, 'net_invoice_value': 1, 'credit_note_value': 1, 'outstanding': 1})
        all_invoices_for_summary = await all_invoices_cursor.to_list(10000)
        
        summary = {
            'total_gross': sum((inv.get('gross_invoice_value') or inv.get('grand_total') or 0) for inv in all_invoices_for_summary),
            'total_net': sum((inv.get('net_invoice_value') or (inv.get('gross_invoice_value') or inv.get('grand_total') or 0) - (inv.get('credit_note_value') or 0)) for inv in all_invoices_for_summary),
            'total_credit': sum(inv.get('credit_note_value', 0) or 0 for inv in all_invoices_for_summary),
        }
        
        logger.info(f"[INVOICES] Listed {len(invoices)} invoices (page {page}/{pages}, total {total})")
        
        return {
            'invoices': invoices,
            'total': total,
            'page': page,
            'limit': limit,
            'pages': pages,
            'summary': summary
        }
        
    except Exception as e:
        logger.error(f"[INVOICES] Error listing invoices: {e}")
        import traceback
        logger.error(traceback.format_exc())
        raise HTTPException(status_code=500, detail=str(e))


@router.delete("/{invoice_id}")
async def delete_invoice(
    invoice_id: str,
    current_user: dict = Depends(get_current_user),
):
    """
    Delete an invoice. Only CEO and System Admin can delete invoices.
    """
    # Check user role
    user_role = current_user.get('role', '').lower()
    allowed_roles = ['ceo', 'system admin', 'admin', 'director']
    
    if not any(role in user_role for role in allowed_roles):
        raise HTTPException(
            status_code=403, 
            detail='Only CEO and System Admin can delete invoices'
        )
    
    tdb = get_tdb()
    
    # Find the invoice first
    invoice = await tdb.invoices.find_one({'$or': [{'id': invoice_id}, {'invoice_no': invoice_id}]})
    
    if not invoice:
        raise HTTPException(status_code=404, detail='Invoice not found')
    
    # Delete the invoice
    result = await tdb.invoices.delete_one({'$or': [{'id': invoice_id}, {'invoice_no': invoice_id}]})
    
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail='Invoice not found')
    
    logger.info(f"[INVOICES] Invoice {invoice_id} deleted by {current_user.get('email')}")
    
    # Update account totals if the invoice was matched
    if invoice.get('account_uuid') or invoice.get('account_id'):
        account_id = invoice.get('account_uuid') or invoice.get('account_id')
        
        # Recalculate account totals
        remaining_invoices = await tdb.invoices.find({
            '$or': [
                {'account_uuid': account_id},
                {'account_id': account_id}
            ],
            'status': 'matched'
        }).to_list(1000)
        
        total_gross = sum(inv.get('gross_invoice_value', 0) or 0 for inv in remaining_invoices)
        total_net = sum(inv.get('net_invoice_value', 0) or 0 for inv in remaining_invoices)
        total_credit = sum(inv.get('credit_note_value', 0) or 0 for inv in remaining_invoices)
        total_outstanding = sum(inv.get('outstanding', 0) or 0 for inv in remaining_invoices)
        
        await tdb.accounts.update_one(
            {'$or': [{'id': account_id}, {'account_id': account_id}]},
            {
                '$set': {
                    'total_gross_invoice_value': total_gross,
                    'total_net_invoice_value': total_net,
                    'total_credit_note_value': total_credit,
                    'total_outstanding': total_outstanding,
                    'invoice_count': len(remaining_invoices),
                    'updated_at': datetime.now(timezone.utc).isoformat()
                }
            }
        )
    
    return {
        'success': True,
        'message': f'Invoice {invoice.get("invoice_no", invoice_id)} deleted successfully'
    }


@router.delete("")
async def bulk_delete_invoices(
    invoice_ids: List[str],
    current_user: dict = Depends(get_current_user),
):
    """
    Bulk delete invoices. Only CEO and System Admin can delete invoices.
    """
    # Check user role
    user_role = current_user.get('role', '').lower()
    allowed_roles = ['ceo', 'system admin', 'admin', 'director']
    
    if not any(role in user_role for role in allowed_roles):
        raise HTTPException(
            status_code=403, 
            detail='Only CEO and System Admin can delete invoices'
        )
    
    if not invoice_ids:
        raise HTTPException(status_code=400, detail='No invoice IDs provided')
    
    tdb = get_tdb()
    db = get_db()
    
    # Get all invoices to be deleted
    invoices = await tdb.invoices.find({
        '$or': [
            {'id': {'$in': invoice_ids}},
            {'invoice_no': {'$in': invoice_ids}}
        ]
    }).to_list(len(invoice_ids))
    
    if not invoices:
        raise HTTPException(status_code=404, detail='No invoices found')
    
    # Collect unique account IDs for recalculation
    account_ids = set()
    for inv in invoices:
        if inv.get('account_uuid'):
            account_ids.add(inv['account_uuid'])
        if inv.get('account_id'):
            account_ids.add(inv['account_id'])
    
    # Delete invoices
    result = await db.invoices.delete_many({
        '$or': [
            {'id': {'$in': invoice_ids}},
            {'invoice_no': {'$in': invoice_ids}}
        ]
    })
    
    logger.info(f"[INVOICES] Bulk deleted {result.deleted_count} invoices by {current_user.get('email')}")
    
    # Recalculate totals for affected accounts
    for account_id in account_ids:
        remaining_invoices = await tdb.invoices.find({
            '$or': [
                {'account_uuid': account_id},
                {'account_id': account_id}
            ],
            'status': 'matched'
        }).to_list(1000)
        
        total_gross = sum(inv.get('gross_invoice_value', 0) or 0 for inv in remaining_invoices)
        total_net = sum(inv.get('net_invoice_value', 0) or 0 for inv in remaining_invoices)
        total_credit = sum(inv.get('credit_note_value', 0) or 0 for inv in remaining_invoices)
        total_outstanding = sum(inv.get('outstanding', 0) or 0 for inv in remaining_invoices)
        
        await tdb.accounts.update_one(
            {'$or': [{'id': account_id}, {'account_id': account_id}]},
            {
                '$set': {
                    'total_gross_invoice_value': total_gross,
                    'total_net_invoice_value': total_net,
                    'total_credit_note_value': total_credit,
                    'total_outstanding': total_outstanding,
                    'invoice_count': len(remaining_invoices),
                    'updated_at': datetime.now(timezone.utc).isoformat()
                }
            }
        )
    
    return {
        'success': True,
        'message': f'Deleted {result.deleted_count} invoices',
        'deleted_count': result.deleted_count
    }


@router.get("/summary")
async def get_invoice_summary(
    current_user: dict = Depends(get_current_user),
    territory: Optional[str] = Query(None),
    state: Optional[str] = Query(None),
    city: Optional[str] = Query(None),
):
    """
    Get invoice summary statistics with optional filters.
    """
    tdb = get_tdb()
    
    query = {}
    
    # Get account IDs filtered by territory/state/city
    if territory or state or city:
        account_query = {}
        if territory:
            account_query['territory'] = territory
        if state:
            account_query['state'] = state
        if city:
            account_query['city'] = city
        
        accounts = await tdb.accounts.find(account_query, {'_id': 0, 'id': 1, 'account_id': 1}).to_list(10000)
        account_ids = [a.get('account_id') or a.get('id') for a in accounts]
        
        if account_ids:
            query['$or'] = [
                {'account_id': {'$in': account_ids}},
                {'account_uuid': {'$in': [a.get('id') for a in accounts if a.get('id')]}}
            ]
    
    # Get all invoices for summary
    invoices = await tdb.invoices.find(query, {'_id': 0}).to_list(100000)
    
    # Calculate stats
    total_count = len(invoices)
    matched_count = sum(1 for inv in invoices if inv.get('status') == 'matched')
    unmatched_count = sum(1 for inv in invoices if inv.get('status') == 'unmatched')
    
    total_gross = sum(inv.get('gross_invoice_value', 0) or 0 for inv in invoices)
    total_net = sum(inv.get('net_invoice_value', 0) or 0 for inv in invoices)
    total_credit = sum(inv.get('credit_note_value', 0) or 0 for inv in invoices)
    total_outstanding = sum(inv.get('outstanding', 0) or 0 for inv in invoices)
    
    return {
        'total_count': total_count,
        'matched_count': matched_count,
        'unmatched_count': unmatched_count,
        'total_gross': total_gross,
        'total_net': total_net,
        'total_credit': total_credit,
        'total_outstanding': total_outstanding
    }
