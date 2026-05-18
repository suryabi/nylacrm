"""
Distributor Contacts
====================

Multi-contact CRUD for a distributor, plus optional portal-access provisioning.
When `has_portal_access=True` and an email is provided, a Distributor-role user
is created (or linked) so that contact can log into the distributor self-service
portal. Disabling portal access deactivates the linked user.
"""
from fastapi import APIRouter, Depends, HTTPException
from datetime import datetime, timezone
from pydantic import BaseModel, EmailStr
from typing import Optional
import uuid
import bcrypt
import logging

from database import db
from deps import get_current_user
from core.tenant import get_current_tenant_id

router = APIRouter(tags=["Distributor Contacts"])
logger = logging.getLogger(__name__)

from core.distributor_auth import DISTRIBUTOR_DEFAULT_PASSWORD  # noqa: E402


def _hash_password(password: str) -> str:
    return bcrypt.hashpw(password.encode('utf-8'), bcrypt.gensalt()).decode('utf-8')


def _is_admin(user: dict) -> bool:
    role = (user.get('role') or '').lower()
    return role in ['ceo', 'director', 'admin', 'system admin', 'vice president',
                    'national sales head', 'distributor']


# ───────── Schemas ─────────

class ContactCreate(BaseModel):
    name: str
    mobile: Optional[str] = None
    email: Optional[EmailStr] = None
    designation: Optional[str] = None
    has_portal_access: bool = False
    is_primary: bool = False


class ContactUpdate(BaseModel):
    name: Optional[str] = None
    mobile: Optional[str] = None
    email: Optional[EmailStr] = None
    designation: Optional[str] = None
    has_portal_access: Optional[bool] = None
    is_primary: Optional[bool] = None


# ───────── Helpers ─────────

async def _provision_portal_user(*, tenant_id: str, distributor_id: str,
                                 contact_id: str, name: str, mobile: Optional[str],
                                 email: str) -> str:
    """
    Create a new Distributor-role user OR re-activate / link an existing one.
    Returns the user_id.
    """
    now = datetime.now(timezone.utc).isoformat()
    existing = await db.users.find_one({'email': email}, {'_id': 0})
    if existing:
        await db.users.update_one(
            {'id': existing['id']},
            {'$set': {
                'distributor_id': distributor_id,
                'distributor_contact_id': contact_id,
                'role': 'Distributor',
                'department': 'Distribution',
                'designation': existing.get('designation') or 'Distributor',
                'is_active': True,
                'tenant_id': tenant_id,
                'name': existing.get('name') or name,
                'phone': existing.get('phone') or mobile,
            }}
        )
        return existing['id']

    user_id = str(uuid.uuid4())
    user_doc = {
        'id': user_id,
        'tenant_id': tenant_id,
        'email': email,
        'name': name,
        'password': _hash_password(DISTRIBUTOR_DEFAULT_PASSWORD),
        'role': 'Distributor',
        'designation': 'Distributor',
        'department': 'Distribution',
        'phone': mobile,
        'is_active': True,
        'distributor_id': distributor_id,
        'distributor_contact_id': contact_id,
        'force_password_change': True,
        'created_at': now,
    }
    await db.users.insert_one(user_doc)
    logger.info(f"[contacts] Portal user created email={email} distributor={distributor_id}")
    return user_id


async def _revoke_portal_user(user_id: str):
    """Deactivate the linked user; do not delete (preserve audit trail)."""
    await db.users.update_one(
        {'id': user_id},
        {'$set': {'is_active': False, 'distributor_id': None, 'distributor_contact_id': None}}
    )


def _public(contact: dict) -> dict:
    return {k: v for k, v in contact.items() if k != '_id'}


# ───────── Routes ─────────

@router.get("/{distributor_id}/contacts")
async def list_contacts(distributor_id: str,
                        current_user: dict = Depends(get_current_user)):
    tenant_id = get_current_tenant_id()

    # Distributor users can only list their own distributor's contacts
    if (current_user.get('role') or '') == 'Distributor' \
            and current_user.get('distributor_id') != distributor_id:
        raise HTTPException(status_code=403, detail="Forbidden")

    contacts = await db.distributor_contacts.find(
        {"tenant_id": tenant_id, "distributor_id": distributor_id},
        {"_id": 0}
    ).sort([("is_primary", -1), ("created_at", 1)]).to_list(200)
    return {"contacts": contacts, "total": len(contacts)}


@router.post("/{distributor_id}/contacts")
async def create_contact(distributor_id: str, data: ContactCreate,
                         current_user: dict = Depends(get_current_user)):
    if not _is_admin(current_user):
        raise HTTPException(status_code=403, detail="Admin access required")

    tenant_id = get_current_tenant_id()
    dist = await db.distributors.find_one({"id": distributor_id, "tenant_id": tenant_id}, {"_id": 0, "id": 1})
    if not dist:
        raise HTTPException(status_code=404, detail="Distributor not found")

    if data.has_portal_access and not data.email:
        raise HTTPException(status_code=400, detail="Email is required when portal access is enabled")

    contact_id = str(uuid.uuid4())
    now = datetime.now(timezone.utc).isoformat()

    user_id: Optional[str] = None
    if data.has_portal_access and data.email:
        user_id = await _provision_portal_user(
            tenant_id=tenant_id, distributor_id=distributor_id,
            contact_id=contact_id, name=data.name, mobile=data.mobile, email=str(data.email),
        )

    contact_doc = {
        "id": contact_id,
        "tenant_id": tenant_id,
        "distributor_id": distributor_id,
        "name": data.name,
        "mobile": data.mobile,
        "email": str(data.email) if data.email else None,
        "designation": data.designation,
        "is_primary": bool(data.is_primary),
        "has_portal_access": bool(data.has_portal_access),
        "user_id": user_id,
        "created_at": now,
        "updated_at": now,
        "created_by": current_user.get('id'),
    }

    # Demote any other primary contact in the same distributor if this one is primary
    if contact_doc["is_primary"]:
        await db.distributor_contacts.update_many(
            {"tenant_id": tenant_id, "distributor_id": distributor_id, "is_primary": True},
            {"$set": {"is_primary": False}}
        )

    await db.distributor_contacts.insert_one(contact_doc)
    return _public(contact_doc)


@router.put("/{distributor_id}/contacts/{contact_id}")
async def update_contact(distributor_id: str, contact_id: str, data: ContactUpdate,
                         current_user: dict = Depends(get_current_user)):
    if not _is_admin(current_user):
        raise HTTPException(status_code=403, detail="Admin access required")

    tenant_id = get_current_tenant_id()
    contact = await db.distributor_contacts.find_one(
        {"id": contact_id, "distributor_id": distributor_id, "tenant_id": tenant_id},
        {"_id": 0}
    )
    if not contact:
        raise HTTPException(status_code=404, detail="Contact not found")

    update: dict = {"updated_at": datetime.now(timezone.utc).isoformat()}
    for field in ("name", "mobile", "email", "designation", "is_primary"):
        v = getattr(data, field)
        if v is not None:
            update[field] = str(v) if field == "email" else v

    # Portal access transitions
    new_access = data.has_portal_access if data.has_portal_access is not None else contact.get('has_portal_access', False)
    new_email = update.get("email", contact.get('email'))

    if new_access and not new_email:
        raise HTTPException(status_code=400, detail="Email is required when portal access is enabled")

    update["has_portal_access"] = bool(new_access)

    # Provision / revoke user as needed
    existing_user_id = contact.get('user_id')
    if new_access:
        # (Re)provision — handles email change as well
        new_user_id = await _provision_portal_user(
            tenant_id=tenant_id, distributor_id=distributor_id,
            contact_id=contact_id,
            name=update.get("name", contact.get('name')),
            mobile=update.get("mobile", contact.get('mobile')),
            email=new_email,
        )
        update["user_id"] = new_user_id
        # If the email changed and we had a previous user, deactivate the stale one
        if existing_user_id and existing_user_id != new_user_id:
            await _revoke_portal_user(existing_user_id)
    else:
        update["user_id"] = None
        if existing_user_id:
            await _revoke_portal_user(existing_user_id)

    if update.get("is_primary"):
        await db.distributor_contacts.update_many(
            {"tenant_id": tenant_id, "distributor_id": distributor_id, "is_primary": True, "id": {"$ne": contact_id}},
            {"$set": {"is_primary": False}}
        )

    await db.distributor_contacts.update_one(
        {"id": contact_id, "tenant_id": tenant_id, "distributor_id": distributor_id},
        {"$set": update}
    )
    refreshed = await db.distributor_contacts.find_one(
        {"id": contact_id, "tenant_id": tenant_id, "distributor_id": distributor_id},
        {"_id": 0}
    )
    return _public(refreshed)


@router.delete("/{distributor_id}/contacts/{contact_id}")
async def delete_contact(distributor_id: str, contact_id: str,
                         current_user: dict = Depends(get_current_user)):
    if not _is_admin(current_user):
        raise HTTPException(status_code=403, detail="Admin access required")

    tenant_id = get_current_tenant_id()
    contact = await db.distributor_contacts.find_one(
        {"id": contact_id, "distributor_id": distributor_id, "tenant_id": tenant_id},
        {"_id": 0}
    )
    if not contact:
        raise HTTPException(status_code=404, detail="Contact not found")

    if contact.get('user_id'):
        await _revoke_portal_user(contact['user_id'])

    await db.distributor_contacts.delete_one(
        {"id": contact_id, "tenant_id": tenant_id, "distributor_id": distributor_id}
    )
    return {"deleted": True}


@router.post("/{distributor_id}/contacts/{contact_id}/reset-password")
async def reset_portal_password(distributor_id: str, contact_id: str,
                                current_user: dict = Depends(get_current_user)):
    """Reset the linked user's password back to the distributor default & force change."""
    if not _is_admin(current_user):
        raise HTTPException(status_code=403, detail="Admin access required")

    tenant_id = get_current_tenant_id()
    contact = await db.distributor_contacts.find_one(
        {"id": contact_id, "distributor_id": distributor_id, "tenant_id": tenant_id},
        {"_id": 0}
    )
    if not contact or not contact.get('user_id'):
        raise HTTPException(status_code=404, detail="Linked portal user not found")

    await db.users.update_one(
        {'id': contact['user_id']},
        {'$set': {
            'password': _hash_password(DISTRIBUTOR_DEFAULT_PASSWORD),
            'force_password_change': True,
            'is_active': True,
        }}
    )
    return {"reset": True, "default_password": DISTRIBUTOR_DEFAULT_PASSWORD}
