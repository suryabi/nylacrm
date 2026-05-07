"""
Tenant-wide Customer Returns listing.
Provides a single endpoint to list returns across ALL distributors in the
current tenant — used by the global "Customer Returns" module visible from
Sales, Distribution and Production sidebars.

Existing per-distributor CRUD lives in routes/customer_returns.py.
"""
from fastapi import APIRouter, Depends, Query, HTTPException
from typing import Optional
import logging

from database import db
from deps import get_current_user
from core.tenant import get_current_tenant_id

router = APIRouter(tags=["Customer Returns"])
logger = logging.getLogger(__name__)


@router.get("")
async def list_all_customer_returns(
    search: Optional[str] = Query(None, description="Search by return number or account name"),
    status: Optional[str] = Query(None),
    distributor_id: Optional[str] = Query(None),
    account_id: Optional[str] = Query(None),
    from_date: Optional[str] = Query(None),
    to_date: Optional[str] = Query(None),
    page: int = Query(1, ge=1),
    limit: int = Query(50, ge=1, le=200),
    current_user: dict = Depends(get_current_user),
):
    """List customer returns across the tenant with filters and pagination."""
    tenant_id = get_current_tenant_id()
    query: dict = {"tenant_id": tenant_id}

    if status and status != 'all':
        query["status"] = status
    if distributor_id and distributor_id != 'all':
        query["distributor_id"] = distributor_id
    if account_id:
        query["account_id"] = account_id
    if from_date or to_date:
        rng = {}
        if from_date:
            rng["$gte"] = from_date
        if to_date:
            rng["$lte"] = to_date
        query["return_date"] = rng
    if search:
        query["$or"] = [
            {"return_number": {"$regex": search, "$options": "i"}},
            {"account_name": {"$regex": search, "$options": "i"}},
        ]

    total = await db.customer_returns.count_documents(query)
    skip = (page - 1) * limit
    pages = (total + limit - 1) // limit if total > 0 else 0

    returns = await db.customer_returns.find(query, {"_id": 0}) \
        .sort("created_at", -1).skip(skip).limit(limit).to_list(limit)

    # Enrich with distributor name (one DB hit per distinct id)
    distributor_ids = list({r.get('distributor_id') for r in returns if r.get('distributor_id')})
    if distributor_ids:
        dists = await db.distributors.find(
            {"id": {"$in": distributor_ids}},
            {"_id": 0, "id": 1, "name": 1, "company_name": 1},
        ).to_list(len(distributor_ids))
        dmap = {d['id']: (d.get('name') or d.get('company_name') or '') for d in dists}
        for r in returns:
            r['distributor_name'] = dmap.get(r.get('distributor_id'), '')

    # Summary across the *filtered* result set (not just current page)
    summary_cursor = db.customer_returns.find(
        query, {"_id": 0, "total_quantity": 1, "total_credit": 1}
    )
    summary_docs = await summary_cursor.to_list(100000)
    summary = {
        'total_returns': total,
        'total_quantity': sum(r.get('total_quantity', 0) or 0 for r in summary_docs),
        'total_credit': round(sum(r.get('total_credit', 0) or 0 for r in summary_docs), 2),
    }

    return {
        'returns': returns,
        'total': total,
        'page': page,
        'limit': limit,
        'pages': pages,
        'summary': summary,
    }


@router.get("/distributors")
async def list_distributors_for_filter(current_user: dict = Depends(get_current_user)):
    """Light list of distributors for the filter dropdown."""
    tenant_id = get_current_tenant_id()
    dists = await db.distributors.find(
        {"tenant_id": tenant_id, "is_active": {"$ne": False}},
        {"_id": 0, "id": 1, "name": 1, "company_name": 1},
    ).to_list(500)
    return [
        {"id": d['id'], "name": d.get('name') or d.get('company_name') or 'Distributor'}
        for d in dists
    ]
