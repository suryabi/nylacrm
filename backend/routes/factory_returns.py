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
    reason: str = Field(pattern="^(expired|damaged|empty_reusable|promotional|unused_refundable|unused_non_refundable)$")
    reason_id: Optional[str] = None
    reason_name: Optional[str] = None
    customer_return_id: Optional[str] = None
    return_date: Optional[str] = None
    items: List[FactoryReturnItemCreate]
    remarks: Optional[str] = None
    stock_in_shipment_id: Optional[str] = None


class FactoryReturnStatusUpdate(BaseModel):
    remarks: Optional[str] = None


def is_distributor_admin(user: dict) -> bool:
    role = (user.get('role') or '').lower()
    return role in ['ceo', 'admin', 'coo', 'distribution_manager', 'distribution_admin']


def can_manage_distributor_data(user: dict, distributor_id: str) -> bool:
    """Allow admins OR a distributor user operating on their own org."""
    if is_distributor_admin(user):
        return True
    if (user.get('role') or '') == 'Distributor' and user.get('distributor_id') == distributor_id:
        return True
    return False


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


async def compute_available_stock_at_distributor(tenant_id: str, distributor_id: str) -> dict:
    """
    Returns per-SKU available stock at the distributor for factory returns.

    available[sku_id] = {
        sku_id, sku_name, units_per_crate,
        warehouse_available: LIVE on-hand stock across the distributor's
            warehouses (distributor_stock + factory_warehouse_stock) — covers
            every inflow path (shipments, stock transfers, production),
        customer_pending_factory: customer_returned - factory_returned(source=customer_return),
        total_available: warehouse_available + customer_pending_factory
    }
    Quantities are base units (bottles); units_per_crate lets the UI show the
    crate equivalent per the SKU's default packaging.
    """
    stock = {}  # sku_id -> dict

    def _node(sid, name):
        if sid not in stock:
            stock[sid] = {"sku_id": sid, "sku_name": name or 'Unknown',
                          "live_on_hand": 0,
                          "factory_returned_warehouse": 0, "factory_returned_customer": 0,
                          "customer_returned": 0}
        return stock[sid]

    # 1. LIVE warehouse stock — every row the delivery pipeline deducts from.
    upc: dict = {}
    loc_ids = await db.distributor_locations.distinct(
        "id", {"tenant_id": tenant_id, "distributor_id": distributor_id}
    )
    async for r in db.distributor_stock.find(
        {"tenant_id": tenant_id, "distributor_id": distributor_id, "quantity": {"$gt": 0}},
        {"_id": 0, "sku_id": 1, "sku_name": 1, "quantity": 1},
    ):
        if r.get("sku_id"):
            _node(r["sku_id"], r.get("sku_name"))["live_on_hand"] += r.get("quantity") or 0
    if loc_ids:
        async for r in db.factory_warehouse_stock.find(
            {"tenant_id": tenant_id, "warehouse_location_id": {"$in": loc_ids}, "quantity": {"$gt": 0}},
            {"_id": 0, "sku_id": 1, "sku_name": 1, "quantity": 1, "bottles_per_crate": 1},
        ):
            if r.get("sku_id"):
                _node(r["sku_id"], r.get("sku_name"))["live_on_hand"] += r.get("quantity") or 0
                if r.get("bottles_per_crate") and r["sku_id"] not in upc:
                    upc[r["sku_id"]] = int(r["bottles_per_crate"])

    # 3. CUSTOMER RETURNS (returned to distributor)
    cust_returns = await db.customer_returns.find(
        {
            "tenant_id": tenant_id,
            "distributor_id": distributor_id,
            "status": {"$nin": ["cancelled", "draft"]}
        },
        {"_id": 0, "items": 1}
    ).to_list(10000)
    for cr in cust_returns:
        for item in cr.get('items', []) or []:
            sid = item.get('sku_id', '')
            if not sid:
                continue
            _node(sid, item.get('sku_name'))["customer_returned"] += item.get('quantity', 0) or 0

    # 4. FACTORY RETURNS (split by source)
    fr_docs = await db.distributor_factory_returns.find(
        {
            "tenant_id": tenant_id,
            "distributor_id": distributor_id,
            "status": {"$nin": ["cancelled"]}
        },
        {"_id": 0, "items": 1, "source": 1, "status": 1}
    ).to_list(10000)
    for fr in fr_docs:
        src = fr.get('source', 'warehouse')
        for item in fr.get('items', []) or []:
            sid = item.get('sku_id', '')
            if not sid:
                continue
            qty = item.get('quantity', 0) or 0
            if src == "customer_return":
                _node(sid, item.get('sku_name'))["factory_returned_customer"] += qty
            elif fr.get('status') == 'draft':
                # Draft warehouse returns haven't deducted stock yet — treat
                # their quantity as committed (confirmed/received already
                # reflect in the live stock rows).
                _node(sid, item.get('sku_name'))["factory_returned_warehouse"] += qty

    # Fill units-per-crate from master SKUs for anything still unknown
    missing_upc = [sid for sid in stock.keys() if sid not in upc]
    if missing_upc:
        async for ms in db.master_skus.find(
            {"id": {"$in": missing_upc}},
            {"_id": 0, "id": 1, "bottles_per_crate": 1, "packaging_config": 1},
        ):
            bpc = ms.get("bottles_per_crate")
            if not bpc:
                pc = (ms.get("packaging_config") or {}).get("production") or []
                default = next((p for p in pc if p.get("is_default")), None)
                if default:
                    bpc = default.get("units") or default.get("units_per_package")
            try:
                if bpc and int(bpc) > 0:
                    upc[ms["id"]] = int(bpc)
            except Exception:
                pass

    # Compute derived availability
    out = {}
    for sid, s in stock.items():
        # Confirmed/received returns already deducted the live rows; draft
        # warehouse returns are subtracted as committed quantity.
        warehouse_available = max(0, s["live_on_hand"] - s["factory_returned_warehouse"])
        customer_pending_factory = max(0, s["customer_returned"] - s["factory_returned_customer"])
        out[sid] = {
            "sku_id": sid,
            "sku_name": s["sku_name"],
            "units_per_crate": upc.get(sid) or 1,
            "warehouse_available": warehouse_available,
            "customer_pending_factory": customer_pending_factory,
            "total_available": warehouse_available + customer_pending_factory,
        }
    return out


@router.get("/{distributor_id}/available-stock")
async def get_available_stock(
    distributor_id: str,
    current_user: dict = Depends(get_current_user)
):
    """Returns per-SKU stock available at the distributor for factory returns."""
    tenant_id = get_current_tenant_id()
    distributor = await db.distributors.find_one(
        {"id": distributor_id, "tenant_id": tenant_id}, {"_id": 0, "id": 1}
    )
    if not distributor:
        raise HTTPException(status_code=404, detail="Distributor not found")
    stock = await compute_available_stock_at_distributor(tenant_id, distributor_id)
    rows = list(stock.values())
    from utils.sku_order import master_sku_order, sku_sort_key
    order = await master_sku_order({r.get("sku_id") for r in rows})
    rows.sort(key=sku_sort_key(order))
    return {"available_stock": rows}


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


async def _apply_invoice_adjustment(tenant_id: str, fr: dict, distributor: dict) -> dict:
    """Create + apply a Zoho CN for a warehouse factory return against its Stock-In invoice."""
    now = datetime.now(timezone.utc).isoformat()
    shipment_id = fr.get("stock_in_shipment_id")
    if not shipment_id:
        result = {"status": "failed", "error": "No Stock-In linked to this return.", "attempted_at": now}
    else:
        inv_map = await db.zoho_invoice_mappings.find_one(
            {"tenant_id": tenant_id, "source_type": "distributor_shipment",
             "source_id": shipment_id, "status": "synced"}, {"_id": 0})
        zoho_invoice_id = (inv_map or {}).get("zoho_invoice_id")
        if not zoho_invoice_id:
            result = {"status": "failed",
                      "error": f"Stock-In {fr.get('stock_in_shipment_number') or shipment_id} has no Zoho invoice to adjust against.",
                      "attempted_at": now}
        else:
            try:
                from services.zoho_service import create_credit_note_for_factory_return
                mapping = await create_credit_note_for_factory_return(
                    tenant_id=tenant_id, fr=fr, distributor=distributor,
                    reference_invoice_id=zoho_invoice_id)
                result = {"status": "applied",
                          "zoho_creditnote_id": mapping.get("zoho_creditnote_id"),
                          "zoho_creditnote_number": mapping.get("zoho_creditnote_number"),
                          "zoho_creditnote_url": mapping.get("zoho_creditnote_url"),
                          "zoho_invoice_id": zoho_invoice_id,
                          "amount": fr.get("total_credit_amount", 0),
                          "adjusted_at": now}
            except Exception as e:
                result = {"status": "failed", "error": str(e)[:300], "attempted_at": now}
    await db.distributor_factory_returns.update_one(
        {"id": fr["id"], "tenant_id": tenant_id},
        {"$set": {"invoice_adjustment": result, "updated_at": now}})
    return result


@router.get("/{distributor_id}/stock-in-options")
async def stock_in_options(distributor_id: str, current_user: dict = Depends(get_current_user)):
    """Stock-In shipments (with Zoho invoice info) to adjust factory returns against."""
    tenant_id = get_current_tenant_id()
    shipments = await db.distributor_shipments.find(
        {"tenant_id": tenant_id, "distributor_id": distributor_id,
         "status": {"$in": ["confirmed", "in_transit", "delivered"]}},
        {"_id": 0, "id": 1, "shipment_number": 1, "shipment_date": 1,
         "total_net_amount": 1, "total_quantity": 1, "status": 1}
    ).sort("shipment_date", -1).to_list(200)
    maps = await db.zoho_invoice_mappings.find(
        {"tenant_id": tenant_id, "source_type": "distributor_shipment",
         "source_id": {"$in": [s["id"] for s in shipments]}, "status": "synced"},
        {"_id": 0, "source_id": 1, "zoho_invoice_id": 1, "zoho_invoice_number": 1}).to_list(200)
    by_id = {m["source_id"]: m for m in maps}
    for s in shipments:
        m = by_id.get(s["id"], {})
        s["zoho_invoice_id"] = m.get("zoho_invoice_id")
        s["zoho_invoice_number"] = m.get("zoho_invoice_number")
    return {"shipments": shipments}


@router.put("/{distributor_id}/factory-returns/{return_id}/adjust-invoice")
async def adjust_factory_return_invoice(
    distributor_id: str,
    return_id: str,
    data: dict = None,
    current_user: dict = Depends(get_current_user)
):
    """Retry / run the Stock-In invoice adjustment (Zoho CN). Optionally link a shipment first."""
    if not is_distributor_admin(current_user):
        raise HTTPException(status_code=403, detail="Admin access required")
    tenant_id = get_current_tenant_id()
    fr = await db.distributor_factory_returns.find_one(
        {"id": return_id, "tenant_id": tenant_id, "distributor_id": distributor_id}, {"_id": 0})
    if not fr:
        raise HTTPException(status_code=404, detail="Factory return not found")
    if fr.get("source") != "warehouse":
        raise HTTPException(status_code=400, detail="Only warehouse-sourced returns adjust against Stock-In invoices")
    if fr.get("status") not in ("confirmed", "received"):
        raise HTTPException(status_code=400, detail="Confirm the factory return first")
    if (fr.get("invoice_adjustment") or {}).get("status") == "applied":
        raise HTTPException(status_code=400, detail="Already adjusted against the Stock-In invoice")
    shipment_id = (data or {}).get("stock_in_shipment_id")
    if shipment_id:
        shp = await db.distributor_shipments.find_one(
            {"id": shipment_id, "tenant_id": tenant_id, "distributor_id": distributor_id},
            {"_id": 0, "id": 1, "shipment_number": 1})
        if not shp:
            raise HTTPException(status_code=404, detail="Stock-In shipment not found for this distributor")
        fr["stock_in_shipment_id"] = shp["id"]
        fr["stock_in_shipment_number"] = shp.get("shipment_number")
        await db.distributor_factory_returns.update_one(
            {"id": return_id, "tenant_id": tenant_id},
            {"$set": {"stock_in_shipment_id": shp["id"],
                      "stock_in_shipment_number": shp.get("shipment_number")}})
    distributor = await db.distributors.find_one({"id": distributor_id, "tenant_id": tenant_id}, {"_id": 0})
    result = await _apply_invoice_adjustment(tenant_id, fr, distributor)
    return {"invoice_adjustment": result}


@router.post("/{distributor_id}/factory-returns")
async def create_factory_return(
    distributor_id: str,
    data: FactoryReturnCreate,
    current_user: dict = Depends(get_current_user)
):
    if not can_manage_distributor_data(current_user, distributor_id):
        raise HTTPException(status_code=403, detail="Not authorised to manage this distributor's factory returns")

    tenant_id = get_current_tenant_id()
    now = datetime.now(timezone.utc).isoformat()

    # Validate reason based on source
    if data.source == "warehouse" and data.reason == "empty_reusable":
        raise HTTPException(status_code=400, detail="Empty/Reusable is only valid for customer return source")

    # Warehouse-sourced returns are adjusted against the original Stock-In
    # invoice (Zoho credit note), NOT the monthly settlement.
    requires_settlement = False
    stock_in_shipment = None
    if data.source == "warehouse":
        if not data.stock_in_shipment_id:
            raise HTTPException(status_code=400,
                                detail="Select the Stock-In (invoice) this return should be adjusted against.")
        stock_in_shipment = await db.distributor_shipments.find_one(
            {"id": data.stock_in_shipment_id, "tenant_id": tenant_id, "distributor_id": distributor_id},
            {"_id": 0, "id": 1, "shipment_number": 1, "status": 1})
        if not stock_in_shipment:
            raise HTTPException(status_code=404, detail="Stock-In shipment not found for this distributor")

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

    # === Validate available stock at distributor (per SKU, by source) ===
    available_map = await compute_available_stock_at_distributor(tenant_id, distributor_id)
    # Aggregate requested qty per SKU
    requested_by_sku: dict = {}
    for it in data.items:
        requested_by_sku[it.sku_id] = requested_by_sku.get(it.sku_id, 0) + it.quantity
    for sid, req_qty in requested_by_sku.items():
        avail = available_map.get(sid)
        if not avail:
            raise HTTPException(
                status_code=400,
                detail="No stock available at distributor for SKU. Cannot create factory return."
            )
        if data.source == "customer_return":
            cap = avail["customer_pending_factory"]
            label = "customer-returned (pending factory)"
        else:
            cap = avail["warehouse_available"]
            label = "warehouse"
        if req_qty > cap:
            raise HTTPException(
                status_code=400,
                detail=f"Requested {req_qty} of {avail['sku_name']} exceeds available {label} stock ({cap})."
            )

    # Build items with transfer price lookup (price at which distributor was billed)
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

        # Get transfer price from distributor margin matrix
        margin = await db.distributor_margin_matrix.find_one(
            {"distributor_id": distributor_id, "sku_id": item_data.sku_id, "tenant_id": tenant_id},
            {"_id": 0}
        )
        base_price = (margin.get('base_price') if margin else None) or 0
        transfer_price = (margin.get('transfer_price') if margin else None) or 0
        credit_amount = round(item_data.quantity * transfer_price, 2)

        items.append({
            "id": str(uuid.uuid4()),
            "sku_id": item_data.sku_id,
            "sku_name": sku.get('sku_name', '') or sku.get('name', ''),
            "sku_code": sku.get('sku', '') or sku.get('sku_code', ''),
            "quantity": item_data.quantity,
            "base_price": base_price,
            "transfer_price": transfer_price,
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
        "reason_id": data.reason_id,
        "reason_name": data.reason_name,
        "source": data.source,
        "customer_return_id": data.customer_return_id,
        "customer_return_number": customer_return_number,
        "items": items,
        "total_quantity": total_qty,
        "total_credit_amount": round(total_credit, 2),
        "requires_settlement": requires_settlement,
        "stock_in_shipment_id": stock_in_shipment.get("id") if stock_in_shipment else None,
        "stock_in_shipment_number": stock_in_shipment.get("shipment_number") if stock_in_shipment else None,
        "invoice_adjustment": None,
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
    if not can_manage_distributor_data(current_user, distributor_id):
        raise HTTPException(status_code=403, detail="Not authorised to manage this distributor's factory returns")

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

    # Deduct stock from distributor warehouse (Generic/unbranded rows only —
    # factory returns are classification-less)
    for item in fr.get('items', []):
        await db.distributor_stock.update_one(
            {
                "tenant_id": tenant_id,
                "distributor_id": distributor_id,
                "distributor_location_id": fr.get('distributor_location_id'),
                "sku_id": item.get('sku_id'),
                "child_sku_id": {"$in": [None]}
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

    # Warehouse returns: adjust against the original Stock-In invoice (Zoho CN).
    invoice_adjustment = None
    if fr.get("source") == "warehouse":
        fr_updated = {**fr, **update}
        distributor = await db.distributors.find_one(
            {"id": distributor_id, "tenant_id": tenant_id}, {"_id": 0})
        invoice_adjustment = await _apply_invoice_adjustment(tenant_id, fr_updated, distributor)

    logger.info(f"Factory return {fr['return_number']} confirmed, stock deducted")
    return {"message": f"Factory return {fr['return_number']} confirmed", "status": "confirmed",
            "invoice_adjustment": invoice_adjustment}


@router.put("/{distributor_id}/factory-returns/{return_id}/receive")
async def receive_factory_return(
    distributor_id: str,
    return_id: str,
    data: FactoryReturnStatusUpdate = FactoryReturnStatusUpdate(),
    current_user: dict = Depends(get_current_user)
):
    """Mark factory return as received by factory"""
    if not can_manage_distributor_data(current_user, distributor_id):
        raise HTTPException(status_code=403, detail="Not authorised to manage this distributor's factory returns")

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
    if not can_manage_distributor_data(current_user, distributor_id):
        raise HTTPException(status_code=403, detail="Not authorised to manage this distributor's factory returns")

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

    # If was confirmed, restore stock (Generic rows — matching the deduction)
    if fr.get('status') == 'confirmed':
        for item in fr.get('items', []):
            await db.distributor_stock.update_one(
                {
                    "tenant_id": tenant_id,
                    "distributor_id": distributor_id,
                    "distributor_location_id": fr.get('distributor_location_id'),
                    "sku_id": item.get('sku_id'),
                    "child_sku_id": {"$in": [None]}
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
    if not can_manage_distributor_data(current_user, distributor_id):
        raise HTTPException(status_code=403, detail="Not authorised to manage this distributor's factory returns")

    tenant_id = get_current_tenant_id()
    user_role = current_user.get('role', '').lower()
    is_ceo_or_admin = user_role in ['ceo', 'admin', 'system admin']

    fr = await db.distributor_factory_returns.find_one(
        {"id": return_id, "tenant_id": tenant_id, "distributor_id": distributor_id},
        {"_id": 0}
    )
    if not fr:
        raise HTTPException(status_code=404, detail="Factory return not found")
    
    if not is_ceo_or_admin and fr.get('status') != 'draft':
        raise HTTPException(status_code=400, detail="Only draft factory returns can be deleted. Contact CEO/Admin to delete non-draft returns.")

    await db.distributor_factory_returns.delete_one(
        {"id": return_id, "tenant_id": tenant_id}
    )

    logger.info(f"Factory return {fr['return_number']} (status: {fr.get('status')}) deleted by {current_user.get('email')} (role: {user_role})")

    return {"message": f"Factory return {fr['return_number']} deleted"}
