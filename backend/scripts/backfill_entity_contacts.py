"""
One-time, idempotent backfill: copy the legacy single contact info from each
existing Lead / Account into the new multi-contact table (the shared `contacts`
collection), tagged to that lead/account under the "Lead/Account Contacts"
category.

- Leads:    contact_person / email / phone  -> a contact tagged lead_id = lead.id
- Accounts: contact_name / contact_number / email -> a contact tagged
            account_id = account.account_id (or account.id)

Idempotent: a `backfill_origin` marker prevents duplicates on re-run.
Does NOT delete the legacy fields. Run:  python scripts/backfill_entity_contacts.py
Add --dry-run to only report counts.
"""
import os
import sys
import uuid
import asyncio
from datetime import datetime, timezone

from motor.motor_asyncio import AsyncIOMotorClient
from dotenv import load_dotenv
from pathlib import Path

load_dotenv(Path(__file__).resolve().parent.parent / ".env")

CATEGORY_NAME = "Lead/Account Contacts"
SALUTATIONS = {"mr": "Mr", "mrs": "Mrs", "ms": "Ms", "dr": "Dr", "prof": "Prof"}
DRY_RUN = "--dry-run" in sys.argv


def parse_name(raw):
    """Best-effort split of a single name into (salutation, first, last)."""
    raw = (raw or "").strip()
    if not raw:
        return "", "", ""
    tokens = raw.replace(".", " ").split()
    salutation = ""
    if tokens and tokens[0].lower() in SALUTATIONS:
        salutation = SALUTATIONS[tokens[0].lower()]
        tokens = tokens[1:]
    first = tokens[0] if tokens else ""
    last = " ".join(tokens[1:]) if len(tokens) > 1 else ""
    return salutation, first, last


def now_iso():
    return datetime.now(timezone.utc).isoformat()


async def get_or_create_category(db, tenant_id):
    """Category is a shared (non-tenant) collection; key the lookup by name."""
    existing = await db.contact_categories.find_one({"name": CATEGORY_NAME})
    if existing:
        return existing["id"]
    cat_id = str(uuid.uuid4())
    await db.contact_categories.insert_one({
        "id": cat_id,
        "name": CATEGORY_NAME,
        "description": "Contacts linked to leads and accounts",
        "icon": "users",
        "color": "#0ea5e9",
        "is_active": True,
        "is_default": False,
        "created_at": now_iso(),
        "updated_at": now_iso(),
    })
    return cat_id


async def backfill_collection(db, *, parent_coll, parent_type, fk, id_fields,
                              name_field, phone_field, email_field, company_fields,
                              designation_field):
    origin = f"{parent_type}_primary"
    created = skipped_existing = skipped_no_data = 0
    cat_cache = {}

    cursor = db[parent_coll].find({})
    async for doc in cursor:
        parent_id = next((doc.get(f) for f in id_fields if doc.get(f)), None)
        if not parent_id:
            continue

        raw_name = (doc.get(name_field) or "").strip()
        email = (doc.get(email_field) or "").strip() if email_field else ""
        phone = (doc.get(phone_field) or "").strip() if phone_field else ""

        if not (raw_name or email or phone):
            skipped_no_data += 1
            continue

        # Idempotency: skip if we already backfilled this parent
        already = await db.contacts.find_one({fk: parent_id, "backfill_origin": origin})
        if already:
            skipped_existing += 1
            continue

        salutation, first, last = parse_name(raw_name)
        if not first:
            # No usable name -> derive from email local part, else generic
            first = email.split("@")[0] if email else "Contact"

        company = next((doc.get(f) for f in company_fields if doc.get(f)), "") or ""
        designation = (doc.get(designation_field) or "") if designation_field else ""
        tenant_id = doc.get("tenant_id")

        if DRY_RUN:
            created += 1
            continue

        cat_id = cat_cache.get(tenant_id)
        if not cat_id:
            cat_id = await get_or_create_category(db, tenant_id)
            cat_cache[tenant_id] = cat_id

        contact = {
            "id": str(uuid.uuid4()),
            "category_id": cat_id,
            "category_name": CATEGORY_NAME,
            "salutation": salutation,
            "first_name": first,
            "last_name": last,
            "name": f"{first} {last}".strip(),
            "designation": designation,
            "phone": phone,
            "email": email,
            "company": company,
            fk: parent_id,
            "parent_type": parent_type,
            "backfill_origin": origin,
            "created_by": "system-migration",
            "created_by_name": "Migration",
            "created_at": now_iso(),
            "updated_at": now_iso(),
        }
        if tenant_id is not None:
            contact["tenant_id"] = tenant_id
        await db.contacts.insert_one(contact)
        created += 1

    return created, skipped_existing, skipped_no_data


async def main():
    client = AsyncIOMotorClient(os.environ["MONGO_URL"])
    db = client[os.environ["DB_NAME"]]

    print(f"{'DRY RUN — ' if DRY_RUN else ''}Backfilling entity contacts...\n")

    lc = await backfill_collection(
        db, parent_coll="leads", parent_type="lead", fk="lead_id",
        id_fields=["id"], name_field="contact_person",
        phone_field="phone", email_field="email",
        company_fields=["company"], designation_field="designation",
    )
    print(f"LEADS    -> created: {lc[0]}, skipped (already done): {lc[1]}, skipped (no contact data): {lc[2]}")

    ac = await backfill_collection(
        db, parent_coll="accounts", parent_type="account", fk="account_id",
        id_fields=["account_id", "id"], name_field="contact_name",
        phone_field="contact_number", email_field="email",
        company_fields=["account_name", "company", "name"], designation_field="designation",
    )
    print(f"ACCOUNTS -> created: {ac[0]}, skipped (already done): {ac[1]}, skipped (no contact data): {ac[2]}")

    print("\nDone." + (" (dry run, nothing written)" if DRY_RUN else ""))


if __name__ == "__main__":
    asyncio.run(main())
