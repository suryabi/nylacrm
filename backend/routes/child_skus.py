"""Customer-Specific Child SKUs (Phase 1).

A master SKU with `allows_child_skus=True` acts as a PARENT: customer-specific
(or one generic) child SKUs can be created under it for inventory
classification / fulfilment / traceability. Children inherit all product info
from the parent at read time and deliberately carry NO pricing — quotes,
invoices, production and revenue always stay on the parent master SKU.
"""
import uuid
from datetime import datetime, timezone
from typing import Optional

from fastapi import APIRouter, HTTPException, Depends, File, UploadFile
from fastapi.responses import Response
from pydantic import BaseModel

from database import db, get_tenant_db
from deps import get_current_user

router = APIRouter()

CHILD_TYPES = {"generic", "customer"}
MAX_ARTWORK_BYTES = 25 * 1024 * 1024  # 25 MB (CDR/AI files can be large)

# Collections that may reference a child SKU once Phase 2/3 land. Used to decide
# delete vs deactivate-only.
TXN_TOP_COLLECTIONS = ["factory_warehouse_stock", "distributor_stock", "warehouse_transfers"]
TXN_ITEMS_COLLECTIONS = [("delivery_orders", "items.fulfilment_child_sku_id")]


def _now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


class ChildSkuCreate(BaseModel):
    parent_sku_id: str
    child_sku_name: str
    child_sku_code: str
    child_type: str  # 'generic' | 'customer'
    customer_account_id: Optional[str] = None
    customer_brand_name: Optional[str] = None
    branding_type: Optional[str] = None
    label_version: Optional[str] = None
    is_active: bool = True


class ChildSkuUpdate(BaseModel):
    child_sku_name: Optional[str] = None
    child_sku_code: Optional[str] = None
    customer_account_id: Optional[str] = None
    customer_brand_name: Optional[str] = None
    branding_type: Optional[str] = None
    label_version: Optional[str] = None
    is_active: Optional[bool] = None


async def _has_transactions(child_id: str) -> bool:
    for coll in TXN_TOP_COLLECTIONS:
        if await db[coll].count_documents({"child_sku_id": child_id}, limit=1):
            return True
    for coll, field in TXN_ITEMS_COLLECTIONS:
        if await db[coll].count_documents({field: child_id}, limit=1):
            return True
    return False


async def _get_parent(parent_sku_id: str) -> dict:
    parent = await db.master_skus.find_one({"id": parent_sku_id}, {"_id": 0})
    if not parent:
        raise HTTPException(status_code=404, detail="Parent master SKU not found")
    return parent


def _sku_association_filter(parent: dict) -> dict:
    # Accounts are associated with a SKU via their sku_pricing rows
    return {"$or": [
        {"sku_pricing.sku_id": parent["id"]},
        {"sku_pricing.sku": parent.get("sku_name")},
    ]}


async def _ensure_account_linked_to_parent(tdb, account_ref: str, parent: dict) -> dict:
    account = await tdb.accounts.find_one(
        {"$or": [{"id": account_ref}, {"account_id": account_ref}]},
        {"_id": 0, "id": 1, "account_name": 1, "sku_pricing": 1},
    )
    if not account:
        raise HTTPException(status_code=404, detail="Customer account not found")
    rows = account.get("sku_pricing") or []
    linked = any(
        r.get("sku_id") == parent["id"] or (r.get("sku") and r.get("sku") == parent.get("sku_name"))
        for r in rows
    )
    if not linked:
        raise HTTPException(
            status_code=400,
            detail=f"'{account.get('account_name')}' is not associated with parent SKU '{parent.get('sku_name')}'. Add this SKU under Account Detail → SKU Pricing first.",
        )
    return account


@router.get("/eligible-accounts")
async def list_eligible_accounts(parent_sku_id: str, current_user: dict = Depends(get_current_user)):
    """Accounts that already have the parent SKU in their SKU pricing."""
    parent = await _get_parent(parent_sku_id)
    tdb = get_tenant_db()
    rows = await tdb.accounts.find(
        _sku_association_filter(parent),
        {"_id": 0, "id": 1, "account_name": 1, "city": 1, "state": 1, "territory": 1},
    ).sort("account_name", 1).to_list(1000)
    return {"accounts": rows}


@router.get("")
async def list_child_skus(
    parent_sku_id: Optional[str] = None,
    include_inactive: bool = False,
    current_user: dict = Depends(get_current_user),
):
    tdb = get_tenant_db()
    query = {}
    if parent_sku_id:
        query["parent_sku_id"] = parent_sku_id
    if not include_inactive:
        query["is_active"] = {"$ne": False}
    rows = await tdb.child_skus.find(query, {"_id": 0}).sort("created_at", 1).to_list(1000)

    # Refresh denormalised parent names from the master list
    parent_ids = list({r["parent_sku_id"] for r in rows})
    if parent_ids:
        parents = await db.master_skus.find({"id": {"$in": parent_ids}}, {"_id": 0, "id": 1, "sku_name": 1}).to_list(len(parent_ids))
        pmap = {p["id"]: p.get("sku_name") for p in parents}
        for r in rows:
            r["parent_sku_name"] = pmap.get(r["parent_sku_id"], r.get("parent_sku_name"))
    return {"child_skus": rows}


@router.post("")
async def create_child_sku(payload: ChildSkuCreate, current_user: dict = Depends(get_current_user)):
    tdb = get_tenant_db()

    if payload.child_type not in CHILD_TYPES:
        raise HTTPException(status_code=400, detail="child_type must be 'generic' or 'customer'")

    parent = await _get_parent(payload.parent_sku_id)
    if not parent.get("allows_child_skus"):
        raise HTTPException(
            status_code=400,
            detail=f"'{parent.get('sku_name')}' does not allow customer-specific child SKUs. Enable the option on the parent SKU first.",
        )

    name = payload.child_sku_name.strip()
    code = payload.child_sku_code.strip()
    if not name or not code:
        raise HTTPException(status_code=400, detail="Child SKU name and code are required")

    # Uniqueness: code per tenant, name per parent
    if await tdb.child_skus.find_one({"child_sku_code": code}):
        raise HTTPException(status_code=400, detail=f"Child SKU code '{code}' is already in use")
    if await tdb.child_skus.find_one({"parent_sku_id": payload.parent_sku_id, "child_sku_name": name}):
        raise HTTPException(status_code=400, detail=f"Child SKU '{name}' already exists under this parent")

    customer_name = None
    if payload.child_type == "customer":
        if not payload.customer_account_id:
            raise HTTPException(status_code=400, detail="A customer account is required for a customer-specific child SKU")
        account = await _ensure_account_linked_to_parent(tdb, payload.customer_account_id, parent)
        customer_name = account.get("account_name")
    else:
        # Only one generic child per parent
        existing_generic = await tdb.child_skus.find_one({"parent_sku_id": payload.parent_sku_id, "child_type": "generic"})
        if existing_generic:
            raise HTTPException(
                status_code=400,
                detail=f"A generic child SKU ('{existing_generic.get('child_sku_name')}') already exists under this parent",
            )

    doc = {
        "id": str(uuid.uuid4()),
        "parent_sku_id": payload.parent_sku_id,
        "parent_sku_name": parent.get("sku_name"),
        "child_sku_name": name,
        "child_sku_code": code,
        "child_type": payload.child_type,
        "customer_account_id": payload.customer_account_id if payload.child_type == "customer" else None,
        "customer_account_name": customer_name,
        "customer_brand_name": payload.customer_brand_name,
        "branding_type": payload.branding_type,
        "label_version": payload.label_version,
        "artwork_storage_path": None,
        "artwork_file_name": None,
        "artwork_content_type": None,
        "is_active": payload.is_active,
        "created_at": _now_iso(),
        "updated_at": _now_iso(),
        "created_by": current_user.get("id"),
    }
    await tdb.child_skus.insert_one(doc)
    doc.pop("_id", None)
    return doc


@router.put("/{child_id}")
async def update_child_sku(child_id: str, payload: ChildSkuUpdate, current_user: dict = Depends(get_current_user)):
    tdb = get_tenant_db()
    existing = await tdb.child_skus.find_one({"id": child_id}, {"_id": 0})
    if not existing:
        raise HTTPException(status_code=404, detail="Child SKU not found")

    update = {k: v for k, v in payload.model_dump().items() if v is not None}

    if "child_sku_code" in update:
        code = update["child_sku_code"].strip()
        dup = await tdb.child_skus.find_one({"child_sku_code": code, "id": {"$ne": child_id}})
        if dup:
            raise HTTPException(status_code=400, detail=f"Child SKU code '{code}' is already in use")
        update["child_sku_code"] = code

    if "child_sku_name" in update:
        name = update["child_sku_name"].strip()
        dup = await tdb.child_skus.find_one(
            {"parent_sku_id": existing["parent_sku_id"], "child_sku_name": name, "id": {"$ne": child_id}}
        )
        if dup:
            raise HTTPException(status_code=400, detail=f"Child SKU '{name}' already exists under this parent")
        update["child_sku_name"] = name

    if "customer_account_id" in update and update["customer_account_id"] != existing.get("customer_account_id"):
        if existing.get("child_type") != "customer":
            raise HTTPException(status_code=400, detail="A generic child SKU cannot be linked to a customer")
        if await _has_transactions(child_id):
            raise HTTPException(
                status_code=400,
                detail="This child SKU has transaction history — its customer cannot be changed. Use a rebranding process instead.",
            )
        parent = await _get_parent(existing["parent_sku_id"])
        account = await _ensure_account_linked_to_parent(tdb, update["customer_account_id"], parent)
        update["customer_account_name"] = account.get("account_name")

    update["updated_at"] = _now_iso()
    await tdb.child_skus.update_one({"id": child_id}, {"$set": update})
    updated = await tdb.child_skus.find_one({"id": child_id}, {"_id": 0})
    return updated


@router.delete("/{child_id}")
async def delete_child_sku(child_id: str, current_user: dict = Depends(get_current_user)):
    tdb = get_tenant_db()
    existing = await tdb.child_skus.find_one({"id": child_id}, {"_id": 0})
    if not existing:
        raise HTTPException(status_code=404, detail="Child SKU not found")

    if await _has_transactions(child_id):
        await tdb.child_skus.update_one({"id": child_id}, {"$set": {"is_active": False, "updated_at": _now_iso()}})
        return {"message": "Child SKU has transaction history — it was deactivated instead of deleted", "deactivated": True}

    await tdb.child_skus.delete_one({"id": child_id})
    return {"message": "Child SKU deleted", "deactivated": False}


@router.post("/{child_id}/artwork")
async def upload_child_sku_artwork(child_id: str, file: UploadFile = File(...), current_user: dict = Depends(get_current_user)):
    tdb = get_tenant_db()
    existing = await tdb.child_skus.find_one({"id": child_id}, {"_id": 0})
    if not existing:
        raise HTTPException(status_code=404, detail="Child SKU not found")

    contents = await file.read()
    if not contents:
        raise HTTPException(status_code=400, detail="Uploaded file is empty")
    if len(contents) > MAX_ARTWORK_BYTES:
        raise HTTPException(status_code=413, detail="Artwork file is larger than 25 MB")

    from object_storage import put_object, APP_NAME
    ext = (file.filename or "file").rsplit(".", 1)[-1].lower() if "." in (file.filename or "") else "bin"
    path = f"{APP_NAME}/child-sku-artwork/{uuid.uuid4()}.{ext}"
    content_type = file.content_type or "application/octet-stream"
    result = put_object(path, contents, content_type)
    storage_path = result.get("path", path)

    await tdb.child_skus.update_one(
        {"id": child_id},
        {"$set": {
            "artwork_storage_path": storage_path,
            "artwork_file_name": file.filename,
            "artwork_content_type": content_type,
            "updated_at": _now_iso(),
        }},
    )
    return {"message": "Artwork uploaded", "artwork_file_name": file.filename}


@router.get("/{child_id}/artwork")
async def download_child_sku_artwork(child_id: str, current_user: dict = Depends(get_current_user)):
    tdb = get_tenant_db()
    existing = await tdb.child_skus.find_one({"id": child_id}, {"_id": 0})
    if not existing:
        raise HTTPException(status_code=404, detail="Child SKU not found")
    storage_path = existing.get("artwork_storage_path")
    if not storage_path:
        raise HTTPException(status_code=404, detail="No artwork uploaded for this child SKU")

    from object_storage import get_object
    contents, content_type = get_object(storage_path)
    filename = existing.get("artwork_file_name") or "artwork"
    return Response(
        content=contents,
        media_type=existing.get("artwork_content_type") or content_type,
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )
