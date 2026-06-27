"""
Accounting Transactions — pulls bank transactions from Zoho Books (the bank
feed, the true bank-synced source) and lets users enrich each with master tags
(expense or income), a vendor, proof uploads, and — for money received — a CRM
account link that adjusts the account's outstanding balance.

De-dup: one doc per Zoho `bank_transaction_id`, enforced by a unique index on
(tenant_id, zoho_org_id, zoho_transaction_id). Sync upserts: new -> 'untagged';
existing -> only Zoho-side fields refresh, user tags/proofs/links preserved.
"""
from fastapi import APIRouter, Depends, HTTPException, Query, UploadFile, File, Form, Header, Response
from pydantic import BaseModel
from typing import Optional, List
from datetime import datetime, timezone
import uuid
import logging

from database import db
from deps import get_current_user
from core.tenant import get_current_tenant_id
from services import zoho_service
from services.object_storage import put_object, get_object, build_path, guess_content_type

router = APIRouter(prefix="/accounting/transactions", tags=["Accounting Transactions"])
logger = logging.getLogger(__name__)

COLL = "accounting_transactions"
SYNC_COLL = "accounting_txn_sync_state"
ADMIN_ROLES = {"CEO", "Director", "System Admin", "Admin", "Vice President", "Head of Business"}

# Zoho transaction_type -> our direction. Anything else is inferred from amount sign.
_CREDIT_TYPES = {"deposit", "sales_without_invoices", "interest_income", "owner_contribution", "other_income", "customer_payment", "vendor_payment_refund"}
_DEBIT_TYPES = {"expense", "withdrawal", "transfer_fund", "card_payment", "owner_drawings", "supplier_payment", "vendor_payment"}


def _require_admin(user: dict):
    if user.get("role") not in ADMIN_ROLES:
        raise HTTPException(status_code=403, detail="Admin access required")


def _now():
    return datetime.now(timezone.utc).isoformat()


async def ensure_indexes():
    await db[COLL].create_index(
        [("tenant_id", 1), ("zoho_org_id", 1), ("zoho_transaction_id", 1)],
        unique=True, name="uniq_zoho_txn",
    )


def _direction_of(txn: dict) -> str:
    ttype = (txn.get("transaction_type") or "").lower()
    if ttype in _CREDIT_TYPES:
        return "credit"
    if ttype in _DEBIT_TYPES:
        return "debit"
    # fall back to debit/credit flags or amount
    if txn.get("debit_or_credit"):
        return "credit" if str(txn["debit_or_credit"]).lower().startswith("c") else "debit"
    amt = float(txn.get("amount") or 0)
    return "credit" if amt >= 0 else "debit"


def _normalize(txn: dict, tenant_id: str, org_id: str) -> dict:
    """Map a raw Zoho bank transaction to the Zoho-side fields we store."""
    txn_id = txn.get("bank_transaction_id") or txn.get("transaction_id")
    return {
        "tenant_id": tenant_id,
        "zoho_org_id": org_id,
        "zoho_transaction_id": txn_id,
        "source": "zoho_bank",
        "direction": _direction_of(txn),
        "amount": abs(float(txn.get("amount") or 0)),
        "currency": txn.get("currency_code") or txn.get("currency") or "INR",
        "date": (txn.get("date") or txn.get("transaction_date") or "")[:10],
        "zoho_transaction_type": txn.get("transaction_type"),
        "zoho_status": txn.get("status"),
        "zoho_account_id": txn.get("account_id"),
        "bank_account_name": txn.get("account_name"),
        "payee": txn.get("payee"),
        "reference_number": txn.get("reference_number"),
        "description": txn.get("description"),
        "raw": txn,
    }


# ----------------------- Sync -----------------------

@router.post("/sync")
async def sync_transactions(
    date_start: Optional[str] = Query(None),
    date_end: Optional[str] = Query(None),
    current_user: dict = Depends(get_current_user),
):
    """Pull bank transactions from Zoho and upsert (de-duped). New rows land as
    'untagged'; existing rows refresh Zoho-side fields only."""
    _require_admin(current_user)
    tenant_id = get_current_tenant_id()
    await ensure_indexes()

    creds = await zoho_service.get_credentials(tenant_id)
    if not zoho_service.is_zoho_configured() or not creds:
        raise HTTPException(status_code=400, detail="Zoho Books is not connected for this tenant. Connect it under Settings → Integrations → Zoho Books (with banking access).")
    org_id = creds.get("organization_id")

    # Incremental window: from last sync (minus a 5-day overlap) unless caller overrides.
    state = await db[SYNC_COLL].find_one({"tenant_id": tenant_id}, {"_id": 0})
    if not date_start and state and state.get("last_synced_date"):
        date_start = state["last_synced_date"]
    if not date_end:
        date_end = datetime.now(timezone.utc).strftime("%Y-%m-%d")

    new_count, updated_count, page = 0, 0, 1
    try:
        while page <= 50:  # safety cap (50 * 200 = 10k txns/sync)
            res = await zoho_service.fetch_bank_transactions(tenant_id, date_start, date_end, page=page)
            for txn in res["transactions"]:
                doc = _normalize(txn, tenant_id, org_id)
                if not doc["zoho_transaction_id"]:
                    continue
                key = {"tenant_id": tenant_id, "zoho_org_id": org_id, "zoho_transaction_id": doc["zoho_transaction_id"]}
                existing = await db[COLL].find_one(key, {"_id": 0, "id": 1})
                if existing:
                    # refresh only Zoho-side fields; preserve user tags/proofs/links
                    await db[COLL].update_one(key, {"$set": {
                        **{k: doc[k] for k in ("amount", "currency", "date", "zoho_status",
                                               "zoho_transaction_type", "payee", "reference_number",
                                               "description", "bank_account_name", "zoho_account_id", "raw")},
                        "updated_at": _now(),
                    }})
                    updated_count += 1
                else:
                    doc.update({
                        "id": str(uuid.uuid4()), "status": "untagged",
                        "tags": {}, "vendor_id": None, "vendor_name": None,
                        "account_id": None, "account_name": None,
                        "account_adjustment": None, "proofs": [], "notes": None,
                        "tagged_by": None, "tagged_at": None,
                        "created_at": _now(), "updated_at": _now(),
                    })
                    await db[COLL].insert_one(doc)
                    new_count += 1
            if not res["has_more"]:
                break
            page += 1
    except Exception as e:
        logger.exception("Zoho bank transaction sync failed")
        raise HTTPException(status_code=502, detail=f"Zoho sync failed: {str(e)[:300]}")

    await db[SYNC_COLL].update_one(
        {"tenant_id": tenant_id},
        {"$set": {"tenant_id": tenant_id, "last_synced_date": date_end, "last_synced_at": _now(),
                  "last_synced_by": current_user.get("id")}},
        upsert=True,
    )
    return {"new": new_count, "updated": updated_count, "from": date_start, "to": date_end}


# ----------------------- List / filters -----------------------

@router.get("")
async def list_transactions(
    status: Optional[str] = Query(None),
    direction: Optional[str] = Query(None),
    bank_account_id: Optional[str] = Query(None),
    date_start: Optional[str] = Query(None),
    date_end: Optional[str] = Query(None),
    search: Optional[str] = Query(None),
    page: int = Query(1),
    limit: int = Query(50),
    current_user: dict = Depends(get_current_user),
):
    tenant_id = get_current_tenant_id()
    q = {"tenant_id": tenant_id}
    if status:
        q["status"] = status
    if direction:
        q["direction"] = direction
    if bank_account_id:
        q["zoho_account_id"] = bank_account_id
    if date_start or date_end:
        q["date"] = {}
        if date_start:
            q["date"]["$gte"] = date_start
        if date_end:
            q["date"]["$lte"] = date_end
    if search:
        q["$or"] = [
            {"payee": {"$regex": search, "$options": "i"}},
            {"description": {"$regex": search, "$options": "i"}},
            {"reference_number": {"$regex": search, "$options": "i"}},
        ]
    total = await db[COLL].count_documents(q)
    rows = await db[COLL].find(q, {"_id": 0, "raw": 0}).sort("date", -1).skip((page - 1) * limit).limit(limit).to_list(limit)
    # summary counts for the tabs
    summary = {"untagged": 0, "tagged": 0, "all": 0}
    async for r in db[COLL].aggregate([{"$match": {"tenant_id": tenant_id}}, {"$group": {"_id": "$status", "n": {"$sum": 1}}}]):
        summary[r["_id"]] = r["n"]
        summary["all"] += r["n"]
    return {"items": rows, "total": total, "page": page, "limit": limit, "summary": summary}


@router.get("/bank-accounts")
async def list_bank_accounts(current_user: dict = Depends(get_current_user)):
    """Distinct bank accounts seen across synced transactions (for filtering)."""
    tenant_id = get_current_tenant_id()
    rows = await db[COLL].aggregate([
        {"$match": {"tenant_id": tenant_id, "zoho_account_id": {"$ne": None}}},
        {"$group": {"_id": "$zoho_account_id", "name": {"$first": "$bank_account_name"}}},
    ]).to_list(200)
    return {"items": [{"id": r["_id"], "name": r.get("name") or r["_id"]} for r in rows]}


# ----------------------- Tagging -----------------------

class TagPayload(BaseModel):
    tags: dict = {}          # master_type -> master_id (expense or income masters)
    vendor_id: Optional[str] = None
    vendor_name: Optional[str] = None
    notes: Optional[str] = None


@router.patch("/{txn_id}/tags")
async def tag_transaction(txn_id: str, payload: TagPayload, current_user: dict = Depends(get_current_user)):
    _require_admin(current_user)
    tenant_id = get_current_tenant_id()
    txn = await db[COLL].find_one({"id": txn_id, "tenant_id": tenant_id}, {"_id": 0})
    if not txn:
        raise HTTPException(status_code=404, detail="Transaction not found")
    updates = {
        "tags": payload.tags or {},
        "vendor_id": payload.vendor_id, "vendor_name": payload.vendor_name,
        "notes": payload.notes,
        "status": "tagged" if (payload.tags or payload.vendor_id) else "untagged",
        "tagged_by": current_user.get("id"), "tagged_at": _now(), "updated_at": _now(),
    }
    await db[COLL].update_one({"id": txn_id, "tenant_id": tenant_id}, {"$set": updates})
    return await db[COLL].find_one({"id": txn_id, "tenant_id": tenant_id}, {"_id": 0, "raw": 0})


# ----------------------- Account (payment received) -----------------------

class AccountApplyPayload(BaseModel):
    account_id: str
    account_name: Optional[str] = None


@router.post("/{txn_id}/apply-account")
async def apply_account(txn_id: str, payload: AccountApplyPayload, current_user: dict = Depends(get_current_user)):
    """Tag a received payment (credit) to a CRM account and reduce that account's
    outstanding balance by the transaction amount. Reversible & idempotent."""
    _require_admin(current_user)
    tenant_id = get_current_tenant_id()
    txn = await db[COLL].find_one({"id": txn_id, "tenant_id": tenant_id}, {"_id": 0})
    if not txn:
        raise HTTPException(status_code=404, detail="Transaction not found")
    if txn.get("direction") != "credit":
        raise HTTPException(status_code=400, detail="Only money-received (credit) transactions can be applied to an account's outstanding.")
    if (txn.get("account_adjustment") or {}).get("applied"):
        raise HTTPException(status_code=400, detail="This transaction is already applied to an account. Remove it first to re-apply.")

    account = await db.accounts.find_one(
        {"tenant_id": tenant_id, "$or": [{"id": payload.account_id}, {"account_id": payload.account_id}]},
        {"_id": 0, "id": 1, "account_name": 1, "outstanding_balance": 1},
    )
    if not account:
        raise HTTPException(status_code=404, detail="Account not found")

    amount = round(float(txn.get("amount") or 0), 2)
    await db.accounts.update_one(
        {"tenant_id": tenant_id, "$or": [{"id": payload.account_id}, {"account_id": payload.account_id}]},
        {"$inc": {"outstanding_balance": -amount}, "$set": {"updated_at": _now()}},
    )
    adjustment = {
        "applied": True, "amount": amount, "account_id": payload.account_id,
        "applied_at": _now(), "applied_by": current_user.get("id"),
    }
    await db[COLL].update_one({"id": txn_id, "tenant_id": tenant_id}, {"$set": {
        "account_id": payload.account_id,
        "account_name": payload.account_name or account.get("account_name"),
        "account_adjustment": adjustment, "updated_at": _now(),
    }})
    return {"message": f"Applied ₹{amount} to {payload.account_name or account.get('account_name')}; outstanding reduced.", "adjustment": adjustment}


@router.post("/{txn_id}/unapply-account")
async def unapply_account(txn_id: str, current_user: dict = Depends(get_current_user)):
    """Reverse a previously-applied account payment, restoring the outstanding."""
    _require_admin(current_user)
    tenant_id = get_current_tenant_id()
    txn = await db[COLL].find_one({"id": txn_id, "tenant_id": tenant_id}, {"_id": 0})
    if not txn:
        raise HTTPException(status_code=404, detail="Transaction not found")
    adj = txn.get("account_adjustment") or {}
    if not adj.get("applied"):
        raise HTTPException(status_code=400, detail="Nothing applied on this transaction.")
    await db.accounts.update_one(
        {"tenant_id": tenant_id, "$or": [{"id": adj.get("account_id")}, {"account_id": adj.get("account_id")}]},
        {"$inc": {"outstanding_balance": round(float(adj.get("amount") or 0), 2)}, "$set": {"updated_at": _now()}},
    )
    await db[COLL].update_one({"id": txn_id, "tenant_id": tenant_id}, {"$set": {
        "account_id": None, "account_name": None, "account_adjustment": None, "updated_at": _now(),
    }})
    return {"message": "Account application reversed; outstanding restored."}


# ----------------------- Proofs -----------------------

@router.post("/{txn_id}/proofs")
async def upload_proof(
    txn_id: str,
    file: UploadFile = File(...),
    proof_type: str = Form("other"),
    current_user: dict = Depends(get_current_user),
):
    _require_admin(current_user)
    tenant_id = get_current_tenant_id()
    txn = await db[COLL].find_one({"id": txn_id, "tenant_id": tenant_id}, {"_id": 0, "id": 1})
    if not txn:
        raise HTTPException(status_code=404, detail="Transaction not found")
    data = await file.read()
    path = build_path(tenant_id, "accounting-proofs", file.filename)
    content_type = file.content_type or guess_content_type(file.filename)
    result = await put_object(path, data, content_type)
    proof = {
        "id": str(uuid.uuid4()), "type": proof_type,
        "storage_path": result.get("path", path), "original_filename": file.filename,
        "content_type": content_type, "size": result.get("size", len(data)),
        "uploaded_at": _now(), "uploaded_by": current_user.get("id"), "is_deleted": False,
    }
    await db[COLL].update_one({"id": txn_id, "tenant_id": tenant_id},
                              {"$push": {"proofs": proof}, "$set": {"updated_at": _now()}})
    return proof


@router.get("/{txn_id}/proofs/{proof_id}/download")
async def download_proof(
    txn_id: str, proof_id: str,
    authorization: str = Header(None), auth: str = Query(None),
    current_user: dict = Depends(get_current_user),
):
    tenant_id = get_current_tenant_id()
    txn = await db[COLL].find_one({"id": txn_id, "tenant_id": tenant_id}, {"_id": 0, "proofs": 1})
    if not txn:
        raise HTTPException(status_code=404, detail="Transaction not found")
    proof = next((p for p in (txn.get("proofs") or []) if p["id"] == proof_id and not p.get("is_deleted")), None)
    if not proof:
        raise HTTPException(status_code=404, detail="Proof not found")
    data, ctype = await get_object(proof["storage_path"])
    return Response(content=data, media_type=proof.get("content_type") or ctype,
                    headers={"Content-Disposition": f'inline; filename="{proof.get("original_filename", "proof")}"'})


@router.delete("/{txn_id}/proofs/{proof_id}")
async def delete_proof(txn_id: str, proof_id: str, current_user: dict = Depends(get_current_user)):
    _require_admin(current_user)
    tenant_id = get_current_tenant_id()
    res = await db[COLL].update_one(
        {"id": txn_id, "tenant_id": tenant_id, "proofs.id": proof_id},
        {"$set": {"proofs.$.is_deleted": True, "updated_at": _now()}},
    )
    if not res.matched_count:
        raise HTTPException(status_code=404, detail="Proof not found")
    return {"ok": True}
