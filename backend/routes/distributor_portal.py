"""
Distributor Portal Routes
Aggregated read-only summary endpoints for the distributor self-service portal.
The logged-in user must be linked to a distributor via `user.distributor_id`.
"""
from fastapi import APIRouter, Depends, HTTPException
from datetime import datetime, timezone
import logging

from database import db
from deps import get_current_user
from core.tenant import get_current_tenant_id

router = APIRouter(tags=["Distributor Portal"])
logger = logging.getLogger(__name__)


def _resolve_distributor_id(current_user: dict) -> str:
    distributor_id = current_user.get('distributor_id')
    if not distributor_id:
        raise HTTPException(
            status_code=403,
            detail="Your user account is not linked to a distributor. Please contact your administrator."
        )
    return distributor_id


@router.get("/home")
async def get_distributor_home(current_user: dict = Depends(get_current_user)):
    """
    Aggregated welcome dashboard summary for the logged-in distributor user.
    Returns: distributor profile snippet, stock summary, pending counts,
    last settlement, outstanding balance, and recent activity.
    """
    tenant_id = get_current_tenant_id()
    distributor_id = _resolve_distributor_id(current_user)

    # Distributor profile
    distributor = await db.distributors.find_one(
        {"id": distributor_id, "tenant_id": tenant_id},
        {"_id": 0, "id": 1, "distributor_name": 1, "distributor_code": 1,
         "billing_address": 1, "registered_address": 1,
         "outstanding_balance": 1, "last_payment_amount": 1, "last_payment_date": 1}
    )
    if not distributor:
        raise HTTPException(status_code=404, detail="Linked distributor record not found")

    # ------ Stock summary ------
    stock_items = await db.distributor_stock.find(
        {"tenant_id": tenant_id, "distributor_id": distributor_id},
        {"_id": 0, "sku_name": 1, "quantity": 1}
    ).to_list(2000)
    total_stock_units = sum(int(s.get('quantity', 0) or 0) for s in stock_items)
    sku_count = len({s.get('sku_name') for s in stock_items if s.get('quantity', 0) > 0})

    # ------ Pending Stock-In (shipments not yet delivered) ------
    pending_shipments = await db.distributor_shipments.count_documents({
        "tenant_id": tenant_id,
        "distributor_id": distributor_id,
        "status": {"$in": ["draft", "in_transit", "approved", "dispatched"]}
    })

    # ------ Pending Deliveries (drafts) ------
    pending_deliveries = await db.distributor_deliveries.count_documents({
        "tenant_id": tenant_id,
        "distributor_id": distributor_id,
        "status": {"$in": ["draft", "pending"]}
    })

    # ------ Customer Returns awaiting factory return ------
    customer_returns = await db.customer_returns.find(
        {"tenant_id": tenant_id, "distributor_id": distributor_id,
         "factory_return_status": {"$in": ["pending", "partial", None]}},
        {"_id": 0, "items": 1}
    ).to_list(1000)
    pending_return_qty = 0
    for cr in customer_returns:
        for it in (cr.get('items') or []):
            qty = int(it.get('quantity', 0) or 0)
            done = int(it.get('factory_returned_quantity', 0) or 0)
            pending_return_qty += max(0, qty - done)

    # ------ Last Settlement ------
    last_settlement_doc = await db.distributor_settlements.find_one(
        {"tenant_id": tenant_id, "distributor_id": distributor_id},
        {"_id": 0, "id": 1, "settlement_number": 1,
         "settlement_month": 1, "settlement_year": 1,
         "status": 1, "final_payout": 1, "total_billing_value": 1,
         "created_at": 1},
        sort=[("created_at", -1)]
    )

    # ------ Outstanding & Last Payment ------
    outstanding_balance = float(distributor.get('outstanding_balance') or 0)
    last_payment_amount = distributor.get('last_payment_amount')
    last_payment_date = distributor.get('last_payment_date')

    # ------ Recent activity: last 5 deliveries ------
    recent_deliveries = await db.distributor_deliveries.find(
        {"tenant_id": tenant_id, "distributor_id": distributor_id},
        {"_id": 0, "id": 1, "delivery_number": 1, "account_name": 1,
         "status": 1, "delivery_date": 1, "total_quantity": 1, "created_at": 1}
    ).sort("created_at", -1).limit(5).to_list(5)

    # ------ Recent activity: last 5 returns ------
    recent_returns = await db.customer_returns.find(
        {"tenant_id": tenant_id, "distributor_id": distributor_id},
        {"_id": 0, "id": 1, "return_number": 1, "account_name": 1,
         "status": 1, "return_date": 1, "total_quantity": 1, "created_at": 1}
    ).sort("created_at", -1).limit(5).to_list(5)

    # ------ Recent activity: last 5 stock-in (shipments) ------
    recent_shipments = await db.distributor_shipments.find(
        {"tenant_id": tenant_id, "distributor_id": distributor_id},
        {"_id": 0, "id": 1, "shipment_number": 1, "status": 1,
         "expected_arrival_date": 1, "actual_arrival_date": 1, "total_quantity": 1, "created_at": 1}
    ).sort("created_at", -1).limit(5).to_list(5)

    return {
        "distributor": distributor,
        "stock_summary": {
            "total_units": total_stock_units,
            "active_skus": sku_count,
            "pending_stock_in_shipments": pending_shipments,
            "pending_deliveries": pending_deliveries,
            "pending_return_units": pending_return_qty,
        },
        "financials": {
            "outstanding_balance": outstanding_balance,
            "last_payment_amount": float(last_payment_amount) if last_payment_amount is not None else None,
            "last_payment_date": last_payment_date,
        },
        "last_settlement": last_settlement_doc,
        "recent_deliveries": recent_deliveries,
        "recent_returns": recent_returns,
        "recent_shipments": recent_shipments,
        "fetched_at": datetime.now(timezone.utc).isoformat(),
    }
