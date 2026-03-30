"""
Factory Returns Routes
Track stock returns from Distributor to Factory (expired/damaged stock)
Factory adjusts base price credit to distributor
"""
from fastapi import APIRouter, Depends, HTTPException, Query
from typing import Optional, List
from datetime import datetime, timezone
from pydantic import BaseModel, Field
import uuid
import logging

from database import db
from deps import get_current_user
from core.tenant import get_current_tenant_id

router = APIRouter(tags=["Factory Returns"])
logger = logging.getLogger(__name__)


# --- Pydantic Models ---

class FactoryReturnItemCreate(BaseModel):
    sku_id: str
    quantity: int = Field(gt=0)
    remarks: Optional[str] = None


class FactoryReturnCreate(BaseModel):
    distributor_location_id: str
    source: str = Field(pattern="^(customer_return|warehouse)$")
    reason: str = Field(pattern="^(expired|damaged|empty_reusable)$")
    customer_return_id: Optional[str] = None
    return_date: Optional[str] = None
    items: List[FactoryReturnItemCreate]
    remarks: Optional[str] = None


class FactoryReturnStatusUpdate(BaseModel):
    remarks: Optional[str] = None


def is_distributor_admin(user: dict) -> bool:
    role = (user.get('role') or '').lower()
    return role in ['ceo', 'admin', 'coo', 'distribution_manager', 'distribution_admin']


async def generate_factory_return_number(tenant_id: str) -> str:
    year = datetime.now().year
    latest = await db.distributor_factory_returns.find_one(
        {"tenant_id": tenant_id, "return_number": {"$regex": f"^FR-{year}-"}},
        sort=[("return_number", -1)],
        projection={"return_number": 1, "_id": 0}
    )
    if latest:
        last_num = int(latest['return_number'].split('-')[-1])
        return f"FR-{year}-{str(last_num + 1).zfill(4)}"
    return f"FR-{year}-0001"


@router.get("/{distributor_id}/factory-returns")
async def list_factory_returns(
    distributor_id: str,
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
    status: Optional[str] = None,
    reason: Optional[str] = None,
    time_filter: Optional[str] = "this_month",
    current_user: dict = Depends(get_current_user)
):
    tenant_id = get_current_tenant_id()
    query = {"tenant_id": tenant_id, "distributor_id": distributor_id}

    if status:
        query["status"] = status
    if reason:
        query["reason"] = reason

    # Time filter
    now = datetime.now(timezone.utc)
    if time_filter and time_filter != "lifetime":
        from datetime import timedelta
        if time_filter == "this_week":
            start = (now - timedelta(days=now.weekday())).strftime('%Y-%m-%d')
        elif time_filter == "last_week":
            start = (now - timedelta(days=now.weekday() + 7)).strftime('%Y-%m-%d')
        elif time_filter == "this_month":
            start = now.strftime('%Y-%m-01')
        elif time_filter == "last_month":
            if now.month == 1:
                start = f"{now.year - 1}-12-01"
            else:
                start = f"{now.year}-{str(now.month - 1).zfill(2)}-01"
        elif time_filter == "last_3_months":
            m = now.month - 3
            y = now.year
            if m <= 0:
                m += 12
                y -= 1
            start = f"{y}-{str(m).zfill(2)}-01"
        elif time_filter == "last_6_months":
            m = now.month - 6
            y = now.year
            if m <= 0:
                m += 12
                y -= 1
            start = f"{y}-{str(m).zfill(2)}-01"
        elif time_filter == "this_year":
            start = f"{now.year}-01-01"
        else:
            start = None

        if start:
            query["return_date"] = {"$gte": start}

    total = await db.distributor_factory_returns.count_documents(query)
    skip = (page - 1) * page_size

    returns = await db.distributor_factory_returns.find(
        query, {"_id": 0}
    ).sort("created_at", -1).skip(skip).limit(page_size).to_list(page_size)

    return {
        "factory_returns": returns,
        "total": total,
        "page": page,
        "page_size": page_size
    }


@router.post("/{distributor_id}/factory-returns")
async def create_factory_return(
    distributor_id: str,
    data: FactoryReturnCreate,
    current_user: dict = Depends(get_current_user)
):
    if not is_distributor_admin(current_user):
        raise HTTPException(status_code=403, detail="Admin access required")

    tenant_id = get_current_tenant_id()
    now = datetime.now(timezone.utc).isoformat()

    # Validate reason based on source
    if data.source == "warehouse" and data.reason == "empty_reusable":
        raise HTTPException(status_code=400, detail="Empty/Reusable is only valid for customer return source")

    # Settlement adjustment only for warehouse-sourced returns
    requires_settlement = data.source == "warehouse"

    # Validate distributor
    distributor = await db.distributors.find_one(
        {"id": distributor_id, "tenant_id": tenant_id}, {"_id": 0}
    )
    if not distributor:
        raise HTTPException(status_code=404, detail="Distributor not found")

    # Validate location
    location = await db.distributor_locations.find_one(
        {"id": data.distributor_location_id, "tenant_id": tenant_id}, {"_id": 0}
    )
    if not location:
        raise HTTPException(status_code=404, detail="Distributor location not found")

    # If from customer return, validate it
    customer_return_number = None
    if data.source == "customer_return" and data.customer_return_id:
        cr = await db.customer_returns.find_one(
            {"id": data.customer_return_id, "tenant_id": tenant_id}, {"_id": 0}
        )
        if not cr:
            raise HTTPException(status_code=404, detail="Customer return not found")
        customer_return_number = cr.get('return_number')

    return_id = str(uuid.uuid4())
    return_number = await generate_factory_return_number(tenant_id)
    return_date = data.return_date or now[:10]

    # Build items with base price lookup
    items = []
    total_credit = 0
    total_qty = 0

    for item_data in data.items:
        # Check master_skus (global catalog) - may not have tenant_id
        sku = await db.master_skus.find_one(
            {"id": item_data.sku_id}, {"_id": 0}
        )
        if not sku:
            raise HTTPException(status_code=404, detail=f"SKU {item_data.sku_id} not found")

        # Get base price from distributor margin or SKU
        margin = await db.distributor_margins.find_one(
            {"distributor_id": distributor_id, "sku_id": item_data.sku_id, "tenant_id": tenant_id},
            {"_id": 0}
        )
        base_price = (margin.get('base_price') if margin else None) or sku.get('base_price', 0) or sku.get('price', 0)
        credit_amount = round(item_data.quantity * base_price, 2)

        items.append({
            "id": str(uuid.uuid4()),
            "sku_id": item_data.sku_id,
            "sku_name": sku.get('sku_name', '') or sku.get('name', ''),
            "sku_code": sku.get('sku', '') or sku.get('sku_code', ''),
            "quantity": item_data.quantity,
            "base_price": base_price,
            "credit_amount": credit_amount,
            "remarks": item_data.remarks
        })
        total_credit += credit_amount
        total_qty += item_data.quantity

    doc = {
        "id": return_id,
        "tenant_id": tenant_id,
        "distributor_id": distributor_id,
        "distributor_name": distributor.get('distributor_name'),
        "return_number": return_number,
        "return_date": return_date,
        "distributor_location_id": data.distributor_location_id,
        "distributor_location_name": location.get('location_name'),
        "reason": data.reason,
        "source": data.source,
        "customer_return_id": data.customer_return_id,
        "customer_return_number": customer_return_number,
        "items": items,
        "total_quantity": total_qty,
        "total_credit_amount": round(total_credit, 2),
        "requires_settlement": requires_settlement,
        "status": "draft",
        "remarks": data.remarks,
        "created_at": now,
        "updated_at": now,
        "created_by": current_user.get('id')
    }

    await db.distributor_factory_returns.insert_one(doc)
    doc.pop('_id', None)

    logger.info(f"Factory return {return_number} created for {distributor.get('distributor_name')}")
    return doc


@router.get("/{distributor_id}/factory-returns/{return_id}")
async def get_factory_return(
    distributor_id: str,
    return_id: str,
    current_user: dict = Depends(get_current_user)
):
    tenant_id = get_current_tenant_id()
    doc = await db.distributor_factory_returns.find_one(
        {"id": return_id, "tenant_id": tenant_id, "distributor_id": distributor_id},
        {"_id": 0}
    )
    if not doc:
        raise HTTPException(status_code=404, detail="Factory return not found")
    return doc


@router.put("/{distributor_id}/factory-returns/{return_id}/confirm")
async def confirm_factory_return(
    distributor_id: str,
    return_id: str,
    data: FactoryReturnStatusUpdate = FactoryReturnStatusUpdate(),
    current_user: dict = Depends(get_current_user)
):
    """Confirm factory return - deducts stock from warehouse"""
    if not is_distributor_admin(current_user):
        raise HTTPException(status_code=403, detail="Admin access required")

    tenant_id = get_current_tenant_id()
    now = datetime.now(timezone.utc).isoformat()

    fr = await db.distributor_factory_returns.find_one(
        {"id": return_id, "tenant_id": tenant_id, "distributor_id": distributor_id},
        {"_id": 0}
    )
    if not fr:
        raise HTTPException(status_code=404, detail="Factory return not found")
    if fr.get('status') != 'draft':
        raise HTTPException(status_code=400, detail="Only draft factory returns can be confirmed")

    # Deduct stock from distributor warehouse
    for item in fr.get('items', []):
        await db.distributor_stock.update_one(
            {
                "tenant_id": tenant_id,
                "distributor_id": distributor_id,
                "distributor_location_id": fr.get('distributor_location_id'),
                "sku_id": item.get('sku_id')
            },
            {
                "$inc": {"quantity": -item.get('quantity', 0)},
                "$set": {"updated_at": now}
            }
        )

    update = {
        "status": "confirmed",
        "confirmed_at": now,
        "confirmed_by": current_user.get('id'),
        "updated_at": now
    }
    if data.remarks:
        update['remarks'] = (fr.get('remarks', '') or '') + '\n' + data.remarks

    await db.distributor_factory_returns.update_one(
        {"id": return_id, "tenant_id": tenant_id},
        {"$set": update}
    )

    logger.info(f"Factory return {fr['return_number']} confirmed, stock deducted")
    return {"message": f"Factory return {fr['return_number']} confirmed", "status": "confirmed"}


@router.put("/{distributor_id}/factory-returns/{return_id}/receive")
async def receive_factory_return(
    distributor_id: str,
    return_id: str,
    data: FactoryReturnStatusUpdate = FactoryReturnStatusUpdate(),
    current_user: dict = Depends(get_current_user)
):
    """Mark factory return as received by factory"""
    if not is_distributor_admin(current_user):
        raise HTTPException(status_code=403, detail="Admin access required")

    tenant_id = get_current_tenant_id()
    now = datetime.now(timezone.utc).isoformat()

    fr = await db.distributor_factory_returns.find_one(
        {"id": return_id, "tenant_id": tenant_id, "distributor_id": distributor_id},
        {"_id": 0}
    )
    if not fr:
        raise HTTPException(status_code=404, detail="Factory return not found")
    if fr.get('status') != 'confirmed':
        raise HTTPException(status_code=400, detail="Only confirmed factory returns can be marked as received")

    update = {
        "status": "received",
        "received_at": now,
        "received_by": current_user.get('id'),
        "updated_at": now
    }
    if data.remarks:
        update['remarks'] = (fr.get('remarks', '') or '') + '\n' + data.remarks

    await db.distributor_factory_returns.update_one(
        {"id": return_id, "tenant_id": tenant_id},
        {"$set": update}
    )

    logger.info(f"Factory return {fr['return_number']} received by factory")
    return {"message": f"Factory return {fr['return_number']} received", "status": "received"}


@router.put("/{distributor_id}/factory-returns/{return_id}/cancel")
async def cancel_factory_return(
    distributor_id: str,
    return_id: str,
    data: FactoryReturnStatusUpdate = FactoryReturnStatusUpdate(),
    current_user: dict = Depends(get_current_user)
):
    """Cancel a factory return - restores stock if was confirmed"""
    if not is_distributor_admin(current_user):
        raise HTTPException(status_code=403, detail="Admin access required")

    tenant_id = get_current_tenant_id()
    now = datetime.now(timezone.utc).isoformat()

    fr = await db.distributor_factory_returns.find_one(
        {"id": return_id, "tenant_id": tenant_id, "distributor_id": distributor_id},
        {"_id": 0}
    )
    if not fr:
        raise HTTPException(status_code=404, detail="Factory return not found")
    if fr.get('status') in ['received', 'cancelled']:
        raise HTTPException(status_code=400, detail=f"Cannot cancel a {fr['status']} factory return")

    # If was confirmed, restore stock
    if fr.get('status') == 'confirmed':
        for item in fr.get('items', []):
            await db.distributor_stock.update_one(
                {
                    "tenant_id": tenant_id,
                    "distributor_id": distributor_id,
                    "distributor_location_id": fr.get('distributor_location_id'),
                    "sku_id": item.get('sku_id')
                },
                {
                    "$inc": {"quantity": item.get('quantity', 0)},
                    "$set": {"updated_at": now}
                }
            )

    update = {
        "status": "cancelled",
        "cancelled_at": now,
        "cancelled_by": current_user.get('id'),
        "updated_at": now
    }
    if data.remarks:
        update['remarks'] = (fr.get('remarks', '') or '') + '\n' + data.remarks

    await db.distributor_factory_returns.update_one(
        {"id": return_id, "tenant_id": tenant_id},
        {"$set": update}
    )

    stock_msg = " Stock restored." if fr.get('status') == 'confirmed' else ""
    logger.info(f"Factory return {fr['return_number']} cancelled.{stock_msg}")
    return {"message": f"Factory return {fr['return_number']} cancelled.{stock_msg}", "status": "cancelled"}


@router.delete("/{distributor_id}/factory-returns/{return_id}")
async def delete_factory_return(
    distributor_id: str,
    return_id: str,
    current_user: dict = Depends(get_current_user)
):
    if not is_distributor_admin(current_user):
        raise HTTPException(status_code=403, detail="Admin access required")

    tenant_id = get_current_tenant_id()

    fr = await db.distributor_factory_returns.find_one(
        {"id": return_id, "tenant_id": tenant_id, "distributor_id": distributor_id},
        {"_id": 0}
    )
    if not fr:
        raise HTTPException(status_code=404, detail="Factory return not found")
    if fr.get('status') != 'draft':
        raise HTTPException(status_code=400, detail="Only draft factory returns can be deleted")

    await db.distributor_factory_returns.delete_one(
        {"id": return_id, "tenant_id": tenant_id}
    )

    return {"message": f"Factory return {fr['return_number']} deleted"}
