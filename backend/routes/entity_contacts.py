"""
Lead / Account multi-contact tables.

Each contact added under a lead or account is stored in the shared `contacts`
collection (so it also shows up in the global Contacts module), tagged with the
parent's foreign key (`lead_id` / `account_id`) and the auto-managed
"Lead/Account Contacts" category. Editing/deleting here operates on the same
single source-of-truth record.
"""
from fastapi import APIRouter, HTTPException, Depends
from pydantic import BaseModel
from typing import Optional
from datetime import datetime, timezone
import uuid

from deps import get_current_user
from database import get_tenant_db

router = APIRouter()


def get_tdb():
    return get_tenant_db()


LEAD_ACCOUNT_CATEGORY_NAME = "Lead/Account Contacts"

PARENTS = {
    "lead": {"collection": "leads", "fk": "lead_id"},
    "account": {"collection": "accounts", "fk": "account_id"},
}


class EntityContactIn(BaseModel):
    salutation: Optional[str] = None
    first_name: str
    last_name: Optional[str] = None
    email: Optional[str] = None
    phone: Optional[str] = None
    designation: Optional[str] = None


class EntityContactUpdate(BaseModel):
    salutation: Optional[str] = None
    first_name: Optional[str] = None
    last_name: Optional[str] = None
    email: Optional[str] = None
    phone: Optional[str] = None
    designation: Optional[str] = None


def _full_name(first: Optional[str], last: Optional[str]) -> str:
    return f"{(first or '').strip()} {(last or '').strip()}".strip()


async def _get_parent(tdb, parent_type: str, parent_id: str) -> dict:
    coll = getattr(tdb, PARENTS[parent_type]["collection"])
    doc = await coll.find_one({"$or": [{"id": parent_id}, {f"{parent_type}_id": parent_id}]}, {"_id": 0})
    if not doc:
        raise HTTPException(status_code=404, detail=f"{parent_type.capitalize()} not found")
    return doc


def _parent_company(parent: dict) -> str:
    return parent.get("company") or parent.get("account_name") or parent.get("name") or parent.get("business_name") or ""


async def _get_or_create_category(tdb) -> dict:
    cat = await tdb.contact_categories.find_one({"name": LEAD_ACCOUNT_CATEGORY_NAME}, {"_id": 0})
    if cat:
        return cat
    now = datetime.now(timezone.utc).isoformat()
    cat = {
        "id": str(uuid.uuid4()),
        "name": LEAD_ACCOUNT_CATEGORY_NAME,
        "description": "Contacts linked to leads and accounts",
        "icon": "users",
        "color": "#0ea5e9",
        "is_active": True,
        "is_default": False,
        "created_at": now,
        "updated_at": now,
    }
    await tdb.contact_categories.insert_one(cat)
    return cat


async def _list(parent_type: str, parent_id: str):
    tdb = get_tdb()
    await _get_parent(tdb, parent_type, parent_id)
    fk = PARENTS[parent_type]["fk"]
    contacts = await tdb.contacts.find({fk: parent_id}, {"_id": 0}).sort("created_at", 1).to_list(500)
    return {"contacts": contacts}


async def _create(parent_type: str, parent_id: str, data: EntityContactIn, current_user: dict):
    tdb = get_tdb()
    parent = await _get_parent(tdb, parent_type, parent_id)
    if not (data.first_name or "").strip():
        raise HTTPException(status_code=400, detail="First name is required")
    cat = await _get_or_create_category(tdb)
    fk = PARENTS[parent_type]["fk"]
    now = datetime.now(timezone.utc).isoformat()
    contact = {
        "id": str(uuid.uuid4()),
        "category_id": cat["id"],
        "category_name": cat["name"],
        "salutation": data.salutation,
        "first_name": data.first_name.strip(),
        "last_name": (data.last_name or "").strip(),
        "name": _full_name(data.first_name, data.last_name),
        "designation": data.designation,
        "phone": data.phone,
        "email": data.email,
        "company": _parent_company(parent),
        fk: parent_id,
        "parent_type": parent_type,
        "created_by": current_user["id"],
        "created_by_name": current_user.get("name", "Unknown"),
        "created_at": now,
        "updated_at": now,
    }
    await tdb.contacts.insert_one(contact)
    contact.pop("_id", None)
    return contact


async def _update(parent_type: str, parent_id: str, contact_id: str, data: EntityContactUpdate, current_user: dict):
    tdb = get_tdb()
    fk = PARENTS[parent_type]["fk"]
    existing = await tdb.contacts.find_one({"id": contact_id, fk: parent_id}, {"_id": 0})
    if not existing:
        raise HTTPException(status_code=404, detail="Contact not found")
    update = {k: v for k, v in data.model_dump(exclude_unset=True).items()}
    if "first_name" in update or "last_name" in update:
        fn = update.get("first_name", existing.get("first_name"))
        ln = update.get("last_name", existing.get("last_name"))
        update["name"] = _full_name(fn, ln)
    update["updated_at"] = datetime.now(timezone.utc).isoformat()
    update["updated_by"] = current_user["id"]
    await tdb.contacts.update_one({"id": contact_id}, {"$set": update})
    return await tdb.contacts.find_one({"id": contact_id}, {"_id": 0})


async def _delete(parent_type: str, parent_id: str, contact_id: str):
    tdb = get_tdb()
    fk = PARENTS[parent_type]["fk"]
    existing = await tdb.contacts.find_one({"id": contact_id, fk: parent_id}, {"_id": 0})
    if not existing:
        raise HTTPException(status_code=404, detail="Contact not found")
    await tdb.contacts.delete_one({"id": contact_id})
    return {"message": "Contact deleted"}


# ── Lead contact routes ────────────────────────────────────────────────
@router.get("/leads/{parent_id}/contacts")
async def list_lead_contacts(parent_id: str, current_user: dict = Depends(get_current_user)):
    return await _list("lead", parent_id)


@router.post("/leads/{parent_id}/contacts")
async def create_lead_contact(parent_id: str, data: EntityContactIn, current_user: dict = Depends(get_current_user)):
    return await _create("lead", parent_id, data, current_user)


@router.put("/leads/{parent_id}/contacts/{contact_id}")
async def update_lead_contact(parent_id: str, contact_id: str, data: EntityContactUpdate, current_user: dict = Depends(get_current_user)):
    return await _update("lead", parent_id, contact_id, data, current_user)


@router.delete("/leads/{parent_id}/contacts/{contact_id}")
async def delete_lead_contact(parent_id: str, contact_id: str, current_user: dict = Depends(get_current_user)):
    return await _delete("lead", parent_id, contact_id)


# ── Account contact routes ─────────────────────────────────────────────
@router.get("/accounts/{parent_id}/contacts")
async def list_account_contacts(parent_id: str, current_user: dict = Depends(get_current_user)):
    return await _list("account", parent_id)


@router.post("/accounts/{parent_id}/contacts")
async def create_account_contact(parent_id: str, data: EntityContactIn, current_user: dict = Depends(get_current_user)):
    return await _create("account", parent_id, data, current_user)


@router.put("/accounts/{parent_id}/contacts/{contact_id}")
async def update_account_contact(parent_id: str, contact_id: str, data: EntityContactUpdate, current_user: dict = Depends(get_current_user)):
    return await _update("account", parent_id, contact_id, data, current_user)


@router.delete("/accounts/{parent_id}/contacts/{contact_id}")
async def delete_account_contact(parent_id: str, contact_id: str, current_user: dict = Depends(get_current_user)):
    return await _delete("account", parent_id, contact_id)
