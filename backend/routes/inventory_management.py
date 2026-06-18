"""
Inventory Management Routes — Phase 1
Item Master, Vendor Master, Vendor-Item Pricing (time-bounded with overlap guard).
"""
from fastapi import APIRouter, Depends, HTTPException, Query
from typing import Optional
from datetime import datetime, timezone, date
import re
import logging

from database import db
from deps import get_current_user
from core.tenant import get_current_tenant_id
from models.inventory import (
    ITEM_CATEGORIES, UNITS_OF_MEASURE, GSTIN_REGEX,
    InventoryItem, InventoryItemCreate, InventoryItemUpdate,
    InventoryVendor, InventoryVendorCreate, InventoryVendorUpdate,
    VendorItemPrice, VendorItemPriceCreate, VendorItemPriceUpdate,
)

router = APIRouter(tags=["Inventory Management"])
logger = logging.getLogger(__name__)


def _now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def _parse_date(s: str) -> date:
    return date.fromisoformat(s[:10])


# ══════════════════════════ META ══════════════════════════
@router.get("/meta")
async def get_inventory_meta(current_user: dict = Depends(get_current_user)):
    """Master option lists for the inventory module."""
    return {
        "categories": ITEM_CATEGORIES,
        "units_of_measure": UNITS_OF_MEASURE,
    }


# ══════════════════════════ ITEM MASTER ══════════════════════════
@router.get("/items")
async def list_items(
    search: Optional[str] = Query(None),
    category: Optional[str] = Query(None),
    is_active: Optional[bool] = Query(None),
    is_customer_specific: Optional[bool] = Query(None),
    customer_id: Optional[str] = Query(None),
    current_user: dict = Depends(get_current_user),
):
    tenant_id = get_current_tenant_id()
    query: dict = {"tenant_id": tenant_id}
    if category:
        query["category"] = category
    if is_active is not None:
        query["is_active"] = is_active
    if is_customer_specific is not None:
        query["is_customer_specific"] = is_customer_specific
    if customer_id:
        query["customer_id"] = customer_id
    if search:
        rx = {"$regex": re.escape(search), "$options": "i"}
        query["$or"] = [{"item_name": rx}, {"item_code": rx}, {"description": rx}]
    items = await db.inventory_items.find(query, {"_id": 0}).sort("item_name", 1).to_list(5000)
    # Derive a simple stock-status flag for the UI
    for it in items:
        cur = it.get("current_stock", 0) or 0
        reorder = it.get("reorder_level", 0) or 0
        minlvl = it.get("min_stock_level", 0) or 0
        if cur <= 0:
            it["stock_status"] = "out_of_stock"
        elif minlvl and cur <= minlvl:
            it["stock_status"] = "critical"
        elif reorder and cur <= reorder:
            it["stock_status"] = "low"
        else:
            it["stock_status"] = "ok"
    return {"items": items, "total": len(items)}


@router.post("/items")
async def create_item(data: InventoryItemCreate, current_user: dict = Depends(get_current_user)):
    tenant_id = get_current_tenant_id()
    code = (data.item_code or "").strip()
    if not code:
        raise HTTPException(400, "Item code is required")
    if not (data.item_name or "").strip():
        raise HTTPException(400, "Item name is required")
    # Unique item code per tenant (case-insensitive)
    existing = await db.inventory_items.find_one(
        {"tenant_id": tenant_id, "item_code": {"$regex": f"^{re.escape(code)}$", "$options": "i"}},
        {"_id": 0, "id": 1},
    )
    if existing:
        raise HTTPException(400, f"Item code '{code}' already exists")
    if data.is_customer_specific and not data.customer_id:
        raise HTTPException(400, "Customer-specific items must be linked to a Lead or Account")

    item = InventoryItem(
        tenant_id=tenant_id,
        **data.model_dump(),
        created_by=current_user.get("id"),
    )
    item.item_code = code
    item.current_stock = data.opening_stock or 0
    await db.inventory_items.insert_one(item.model_dump())
    return {"message": "Item created", "item": item.model_dump()}


@router.get("/items/{item_id}")
async def get_item(item_id: str, current_user: dict = Depends(get_current_user)):
    tenant_id = get_current_tenant_id()
    item = await db.inventory_items.find_one({"id": item_id, "tenant_id": tenant_id}, {"_id": 0})
    if not item:
        raise HTTPException(404, "Item not found")
    return item


@router.put("/items/{item_id}")
async def update_item(item_id: str, data: InventoryItemUpdate, current_user: dict = Depends(get_current_user)):
    tenant_id = get_current_tenant_id()
    existing = await db.inventory_items.find_one({"id": item_id, "tenant_id": tenant_id}, {"_id": 0})
    if not existing:
        raise HTTPException(404, "Item not found")
    update = {k: v for k, v in data.model_dump().items() if v is not None}
    if "item_code" in update:
        code = update["item_code"].strip()
        clash = await db.inventory_items.find_one(
            {"tenant_id": tenant_id, "id": {"$ne": item_id},
             "item_code": {"$regex": f"^{re.escape(code)}$", "$options": "i"}},
            {"_id": 0, "id": 1},
        )
        if clash:
            raise HTTPException(400, f"Item code '{code}' already exists")
        update["item_code"] = code
    # If marked customer-specific, require a linked customer
    is_cs = update.get("is_customer_specific", existing.get("is_customer_specific"))
    cust_id = update.get("customer_id", existing.get("customer_id"))
    if is_cs and not cust_id:
        raise HTTPException(400, "Customer-specific items must be linked to a Lead or Account")
    if update.get("is_customer_specific") is False:
        update["customer_type"] = None
        update["customer_id"] = None
        update["customer_name"] = None
    update["updated_at"] = _now_iso()
    await db.inventory_items.update_one({"id": item_id, "tenant_id": tenant_id}, {"$set": update})
    item = await db.inventory_items.find_one({"id": item_id, "tenant_id": tenant_id}, {"_id": 0})
    return {"message": "Item updated", "item": item}


@router.delete("/items/{item_id}")
async def delete_item(item_id: str, current_user: dict = Depends(get_current_user)):
    tenant_id = get_current_tenant_id()
    existing = await db.inventory_items.find_one({"id": item_id, "tenant_id": tenant_id}, {"_id": 0})
    if not existing:
        raise HTTPException(404, "Item not found")
    await db.inventory_items.delete_one({"id": item_id, "tenant_id": tenant_id})
    # Cascade: remove its vendor prices
    await db.inventory_vendor_item_prices.delete_many({"item_id": item_id, "tenant_id": tenant_id})
    return {"message": "Item deleted"}


# ══════════════════════════ VENDOR MASTER ══════════════════════════
def _validate_gstin(gstin: Optional[str]):
    if gstin and gstin.strip():
        if not re.match(GSTIN_REGEX, gstin.strip().upper()):
            raise HTTPException(400, "Invalid GSTIN format (expected e.g. 22AAAAA0000A1Z5)")


@router.get("/vendors")
async def list_vendors(
    search: Optional[str] = Query(None),
    is_active: Optional[bool] = Query(None),
    current_user: dict = Depends(get_current_user),
):
    tenant_id = get_current_tenant_id()
    query: dict = {"tenant_id": tenant_id}
    if is_active is not None:
        query["is_active"] = is_active
    if search:
        rx = {"$regex": re.escape(search), "$options": "i"}
        query["$or"] = [{"vendor_name": rx}, {"contact_person": rx}, {"email": rx}, {"phone": rx}]
    vendors = await db.inventory_vendors.find(query, {"_id": 0}).sort("vendor_name", 1).to_list(5000)
    return {"vendors": vendors, "total": len(vendors)}


@router.post("/vendors")
async def create_vendor(data: InventoryVendorCreate, current_user: dict = Depends(get_current_user)):
    tenant_id = get_current_tenant_id()
    if not (data.vendor_name or "").strip():
        raise HTTPException(400, "Vendor name is required")
    _validate_gstin(data.gstin)
    vendor = InventoryVendor(tenant_id=tenant_id, **data.model_dump(), created_by=current_user.get("id"))
    if vendor.gstin:
        vendor.gstin = vendor.gstin.strip().upper()
    await db.inventory_vendors.insert_one(vendor.model_dump())
    return {"message": "Vendor created", "vendor": vendor.model_dump()}


@router.get("/vendors/{vendor_id}")
async def get_vendor(vendor_id: str, current_user: dict = Depends(get_current_user)):
    tenant_id = get_current_tenant_id()
    vendor = await db.inventory_vendors.find_one({"id": vendor_id, "tenant_id": tenant_id}, {"_id": 0})
    if not vendor:
        raise HTTPException(404, "Vendor not found")
    return vendor


@router.put("/vendors/{vendor_id}")
async def update_vendor(vendor_id: str, data: InventoryVendorUpdate, current_user: dict = Depends(get_current_user)):
    tenant_id = get_current_tenant_id()
    existing = await db.inventory_vendors.find_one({"id": vendor_id, "tenant_id": tenant_id}, {"_id": 0})
    if not existing:
        raise HTTPException(404, "Vendor not found")
    update = {k: v for k, v in data.model_dump().items() if v is not None}
    if "gstin" in update:
        _validate_gstin(update["gstin"])
        update["gstin"] = update["gstin"].strip().upper() if update["gstin"] else None
    update["updated_at"] = _now_iso()
    await db.inventory_vendors.update_one({"id": vendor_id, "tenant_id": tenant_id}, {"$set": update})
    # Keep denormalised vendor_name on prices in sync
    if "vendor_name" in update:
        await db.inventory_vendor_item_prices.update_many(
            {"vendor_id": vendor_id, "tenant_id": tenant_id},
            {"$set": {"vendor_name": update["vendor_name"]}},
        )
    vendor = await db.inventory_vendors.find_one({"id": vendor_id, "tenant_id": tenant_id}, {"_id": 0})
    return {"message": "Vendor updated", "vendor": vendor}


@router.delete("/vendors/{vendor_id}")
async def delete_vendor(vendor_id: str, current_user: dict = Depends(get_current_user)):
    tenant_id = get_current_tenant_id()
    existing = await db.inventory_vendors.find_one({"id": vendor_id, "tenant_id": tenant_id}, {"_id": 0})
    if not existing:
        raise HTTPException(404, "Vendor not found")
    await db.inventory_vendors.delete_one({"id": vendor_id, "tenant_id": tenant_id})
    await db.inventory_vendor_item_prices.delete_many({"vendor_id": vendor_id, "tenant_id": tenant_id})
    return {"message": "Vendor deleted"}


# ═════════════════════ VENDOR-ITEM PRICING ═════════════════════
def _ranges_overlap(a_from: date, a_to: Optional[date], b_from: date, b_to: Optional[date]) -> bool:
    """Two date ranges overlap when each starts on/before the other ends.
    `None` end = open-ended (infinity)."""
    a_end = a_to or date.max
    b_end = b_to or date.max
    return a_from <= b_end and b_from <= a_end


@router.get("/item-prices")
async def list_item_prices(
    item_id: Optional[str] = Query(None),
    vendor_id: Optional[str] = Query(None),
    current_user: dict = Depends(get_current_user),
):
    tenant_id = get_current_tenant_id()
    query: dict = {"tenant_id": tenant_id}
    if item_id:
        query["item_id"] = item_id
    if vendor_id:
        query["vendor_id"] = vendor_id
    prices = await db.inventory_vendor_item_prices.find(query, {"_id": 0}).to_list(5000)
    today = date.today()
    for p in prices:
        try:
            pf = _parse_date(p["price_active_from"])
            pt = _parse_date(p["price_active_to"]) if p.get("price_active_to") else None
            p["is_current"] = bool(p.get("is_active", True) and pf <= today and (pt is None or today <= pt))
        except Exception:
            p["is_current"] = False
    prices.sort(key=lambda x: x.get("price_active_from", ""), reverse=True)
    return {"prices": prices, "total": len(prices)}


@router.get("/items/{item_id}/active-price")
async def get_active_price(
    item_id: str,
    vendor_id: Optional[str] = Query(None),
    on_date: Optional[str] = Query(None),
    current_user: dict = Depends(get_current_user),
):
    """Resolve the single active price for an item (optionally for a vendor) on a date."""
    tenant_id = get_current_tenant_id()
    target = _parse_date(on_date) if on_date else date.today()
    query: dict = {"tenant_id": tenant_id, "item_id": item_id, "is_active": True}
    if vendor_id:
        query["vendor_id"] = vendor_id
    candidates = await db.inventory_vendor_item_prices.find(query, {"_id": 0}).to_list(5000)
    matches = []
    for p in candidates:
        pf = _parse_date(p["price_active_from"])
        pt = _parse_date(p["price_active_to"]) if p.get("price_active_to") else None
        if pf <= target and (pt is None or target <= pt):
            matches.append(p)
    matches.sort(key=lambda x: x.get("price_active_from", ""), reverse=True)
    return {"active_price": matches[0] if matches else None, "matches": matches}


async def _assert_no_overlap(tenant_id: str, item_id: str, vendor_id: str,
                             pf: date, pt: Optional[date], exclude_id: Optional[str] = None):
    existing = await db.inventory_vendor_item_prices.find(
        {"tenant_id": tenant_id, "item_id": item_id, "vendor_id": vendor_id, "is_active": True},
        {"_id": 0},
    ).to_list(5000)
    for e in existing:
        if exclude_id and e.get("id") == exclude_id:
            continue
        ef = _parse_date(e["price_active_from"])
        et = _parse_date(e["price_active_to"]) if e.get("price_active_to") else None
        if _ranges_overlap(pf, pt, ef, et):
            raise HTTPException(
                400,
                "Price date range overlaps an existing active price for this vendor-item "
                f"({e['price_active_from']} → {e.get('price_active_to') or 'open'}). "
                "Only one active price may apply at a time.",
            )


@router.post("/item-prices")
async def create_item_price(data: VendorItemPriceCreate, current_user: dict = Depends(get_current_user)):
    tenant_id = get_current_tenant_id()
    item = await db.inventory_items.find_one({"id": data.item_id, "tenant_id": tenant_id}, {"_id": 0})
    if not item:
        raise HTTPException(400, "Item not found")
    vendor = await db.inventory_vendors.find_one({"id": data.vendor_id, "tenant_id": tenant_id}, {"_id": 0})
    if not vendor:
        raise HTTPException(400, "Vendor not found")
    try:
        pf = _parse_date(data.price_active_from)
        pt = _parse_date(data.price_active_to) if data.price_active_to else None
    except ValueError:
        raise HTTPException(400, "Dates must be ISO format (YYYY-MM-DD)")
    if pt and pt < pf:
        raise HTTPException(400, "Price 'active to' date cannot be before 'active from' date")
    await _assert_no_overlap(tenant_id, data.item_id, data.vendor_id, pf, pt)

    price = VendorItemPrice(
        tenant_id=tenant_id,
        **data.model_dump(),
        item_name=item.get("item_name"),
        vendor_name=vendor.get("vendor_name"),
        created_by=current_user.get("id"),
    )
    if not price.unit_of_measure:
        price.unit_of_measure = item.get("unit_of_measure")
    await db.inventory_vendor_item_prices.insert_one(price.model_dump())
    return {"message": "Price added", "price": price.model_dump()}


@router.put("/item-prices/{price_id}")
async def update_item_price(price_id: str, data: VendorItemPriceUpdate, current_user: dict = Depends(get_current_user)):
    tenant_id = get_current_tenant_id()
    existing = await db.inventory_vendor_item_prices.find_one({"id": price_id, "tenant_id": tenant_id}, {"_id": 0})
    if not existing:
        raise HTTPException(404, "Price not found")
    update = {k: v for k, v in data.model_dump().items() if v is not None}
    # Recompute overlap with the effective new range
    new_from = update.get("price_active_from", existing.get("price_active_from"))
    new_to = update.get("price_active_to", existing.get("price_active_to"))
    is_active = update.get("is_active", existing.get("is_active", True))
    try:
        pf = _parse_date(new_from)
        pt = _parse_date(new_to) if new_to else None
    except ValueError:
        raise HTTPException(400, "Dates must be ISO format (YYYY-MM-DD)")
    if pt and pt < pf:
        raise HTTPException(400, "Price 'active to' date cannot be before 'active from' date")
    if is_active:
        await _assert_no_overlap(tenant_id, existing["item_id"], existing["vendor_id"], pf, pt, exclude_id=price_id)
    update["updated_at"] = _now_iso()
    await db.inventory_vendor_item_prices.update_one({"id": price_id, "tenant_id": tenant_id}, {"$set": update})
    price = await db.inventory_vendor_item_prices.find_one({"id": price_id, "tenant_id": tenant_id}, {"_id": 0})
    return {"message": "Price updated", "price": price}


@router.delete("/item-prices/{price_id}")
async def delete_item_price(price_id: str, current_user: dict = Depends(get_current_user)):
    tenant_id = get_current_tenant_id()
    existing = await db.inventory_vendor_item_prices.find_one({"id": price_id, "tenant_id": tenant_id}, {"_id": 0})
    if not existing:
        raise HTTPException(404, "Price not found")
    await db.inventory_vendor_item_prices.delete_one({"id": price_id, "tenant_id": tenant_id})
    return {"message": "Price deleted"}
