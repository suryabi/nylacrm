#!/usr/bin/env python3
"""
seed_sample_data.py — Clone-and-remap demo seed generator.

Builds a fully-populated, self-contained ``demo-co`` tenant by cloning the
primary tenant's (``nyla-air-water``) data and remapping every primary UUID so
the demo tenant is completely decoupled from production data. Globally-shared
collections (product catalogue, location masters, etc.) are intentionally left
untouched because the app reads them across all tenants.

It can also export a portable JSON fixture so the generated demo data can be
committed to git and re-loaded onto a fresh deployment database that has no
source tenant to clone from.

Usage:
    python scripts/seed_sample_data.py generate   # clone src -> demo-co (current DB) + write fixture
    python scripts/seed_sample_data.py load        # wipe demo-co + load fixture (fresh deploy DB)
    python scripts/seed_sample_data.py wipe        # remove all demo-co data

Env (read from backend/.env):
    MONGO_URL, DB_NAME
    SEED_SOURCE_TENANT  (default: nyla-air-water)
    SEED_TARGET_TENANT  (default: demo-co)
"""
import argparse
import asyncio
import os
import re
import uuid
from pathlib import Path

from dotenv import load_dotenv

BACKEND_DIR = Path(__file__).resolve().parent.parent
load_dotenv(BACKEND_DIR / ".env")

import sys
sys.path.insert(0, str(BACKEND_DIR))

from bson import json_util  # noqa: E402  (handles ObjectId/datetime for the fixture)
from motor.motor_asyncio import AsyncIOMotorClient  # noqa: E402

from core.tenant import TenantCollection  # noqa: E402  (re-use the GLOBAL list)

# --------------------------------------------------------------------------- #
# Configuration
# --------------------------------------------------------------------------- #
SOURCE_TENANT = os.environ.get("SEED_SOURCE_TENANT", "nyla-air-water")
TARGET_TENANT = os.environ.get("SEED_TARGET_TENANT", "demo-co")
DEMO_PASSWORD = os.environ.get("SEED_DEMO_PASSWORD", "demo123")
DEMO_EMAIL_DOMAIN = "demo-co.com"
FIXTURE_PATH = BACKEND_DIR / "scripts" / "seed_data" / "demo_seed.json"

# Globally-shared collections (read across all tenants) — never cloned.
GLOBAL_COLLECTIONS = set(TenantCollection.GLOBAL_COLLECTIONS)

# Integration secrets / OAuth state / API keys — never cloned into a demo.
EXCLUDE_COLLECTIONS = {
    "gmail_tokens", "gmail_oauth_states", "zoho_oauth_state",
    "zoho_credentials", "zoho_invoice_mappings", "zoho_sku_mappings",
    "slack_config", "api_keys", "user_sessions",
}

UUID_RE = re.compile(
    r"^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$", re.IGNORECASE
)


def _is_uuid(value) -> bool:
    return isinstance(value, str) and bool(UUID_RE.match(value))


def _bcrypt_hash(password: str) -> str:
    import bcrypt
    return bcrypt.hashpw(password.encode("utf-8"), bcrypt.gensalt()).decode("utf-8")


def _remap_value(value, id_map: dict):
    """Recursively rewrite any UUID string that is a cloned primary id."""
    if isinstance(value, str):
        return id_map.get(value, value)
    if isinstance(value, list):
        return [_remap_value(v, id_map) for v in value]
    if isinstance(value, dict):
        return {k: _remap_value(v, id_map) for k, v in value.items()}
    return value


# --------------------------------------------------------------------------- #
# Engine
# --------------------------------------------------------------------------- #
async def _source_collections(db) -> list:
    """Collections that hold source-tenant data and are eligible for cloning."""
    eligible = []
    for name in sorted(await db.list_collection_names()):
        if name in GLOBAL_COLLECTIONS or name in EXCLUDE_COLLECTIONS:
            continue
        if await db[name].count_documents({"tenant_id": SOURCE_TENANT}) > 0:
            eligible.append(name)
    return eligible


async def build_demo_documents(db) -> dict:
    """Clone + remap source-tenant docs. Returns {collection_name: [docs]}."""
    collections = await _source_collections(db)
    print(f"  Cloning {len(collections)} collection(s) from '{SOURCE_TENANT}'")

    # Pass 1 — load every source doc and build the global id map.
    raw = {}
    id_map = {}
    for name in collections:
        docs = await db[name].find({"tenant_id": SOURCE_TENANT}).to_list(length=None)
        raw[name] = docs
        for d in docs:
            pid = d.get("id")
            if not pid or not isinstance(pid, str) or pid in id_map:
                continue
            # Always remap UUID primary ids. Also remap non-UUID `users` ids
            # (pure join keys, never display values) so user identity is unique
            # per tenant — get_current_user resolves users by id without a
            # tenant filter. Business-code ids elsewhere (e.g. invoice_no == id)
            # are left intact to avoid corrupting display fields.
            if _is_uuid(pid) or name == "users":
                id_map[pid] = str(uuid.uuid4())
    print(f"  Remapping {len(id_map)} unique primary id(s)")

    # Pass 2 — transform each doc (remap refs, set tenant, drop _id, per-collection tweaks).
    out = {}
    used_emails = set()
    for name in collections:
        transformed = []
        for d in raw[name]:
            d.pop("_id", None)
            d = _remap_value(d, id_map)
            d["tenant_id"] = TARGET_TENANT
            if name == "users":
                _demoify_user(d, used_emails)
            transformed.append(d)
        out[name] = transformed
        print(f"    {name:42} {len(transformed):>5}")
    return out


def _demoify_user(user: dict, used_emails: set):
    """Give every demo user a unique demo email + a known demo password."""
    orig = (user.get("email") or "user").strip().lower()
    local = orig.split("@")[0] or "user"
    email = f"{local}@{DEMO_EMAIL_DOMAIN}"
    n = 2
    while email in used_emails:
        email = f"{local}{n}@{DEMO_EMAIL_DOMAIN}"
        n += 1
    used_emails.add(email)
    hashed = _bcrypt_hash(DEMO_PASSWORD)
    user["email"] = email
    user["password"] = hashed
    user["password_hash"] = hashed
    user["force_password_change"] = False
    user["is_active"] = True


def _build_demo_tenant(source_tenant: dict) -> dict:
    t = dict(source_tenant)
    t.pop("_id", None)
    t["id"] = str(uuid.uuid4())
    t["tenant_id"] = TARGET_TENANT
    t["name"] = "Demo Co"
    t["is_active"] = True
    branding = dict(t.get("branding") or {})
    branding["app_name"] = "Demo Co"
    t["branding"] = branding
    return t


# --------------------------------------------------------------------------- #
# DB operations
# --------------------------------------------------------------------------- #
async def wipe_demo(db):
    """Idempotently remove all demo-co data so re-runs are clean."""
    total = 0
    for name in await db.list_collection_names():
        res = await db[name].delete_many({"tenant_id": TARGET_TENANT})
        total += res.deleted_count
    print(f"  Wiped {total} existing '{TARGET_TENANT}' doc(s)")


async def insert_documents(db, by_collection: dict):
    inserted = 0
    for name, docs in by_collection.items():
        if not docs:
            continue
        await db[name].insert_many(docs)
        inserted += len(docs)
    print(f"  Inserted {inserted} doc(s) across {len(by_collection)} collection(s)")
    return inserted


async def ensure_demo_tenant(db):
    src = await db.tenants.find_one({"tenant_id": SOURCE_TENANT})
    if not src:
        raise SystemExit(f"Source tenant '{SOURCE_TENANT}' not found in 'tenants'.")
    await db.tenants.delete_many({"tenant_id": TARGET_TENANT})
    await db.tenants.insert_one(_build_demo_tenant(src))
    print(f"  Created tenant record '{TARGET_TENANT}' (Demo Co)")


def write_fixture(by_collection: dict, demo_tenant: dict):
    FIXTURE_PATH.parent.mkdir(parents=True, exist_ok=True)
    payload = {"tenant": demo_tenant, "collections": by_collection}
    FIXTURE_PATH.write_text(json_util.dumps(payload, indent=2))
    size_kb = FIXTURE_PATH.stat().st_size / 1024
    print(f"  Wrote fixture -> {FIXTURE_PATH}  ({size_kb:,.0f} KB)")


def _print_admin_logins(by_collection: dict):
    users = by_collection.get("users", [])
    admins = [u for u in users if str(u.get("role", "")).lower() in
              ("ceo", "admin", "super admin", "superadmin")]
    print("\n  Demo logins (password = '%s'):" % DEMO_PASSWORD)
    for u in (admins or users)[:5]:
        print(f"    {u.get('email'):40} role={u.get('role')}")


# --------------------------------------------------------------------------- #
# Commands
# --------------------------------------------------------------------------- #
async def cmd_generate(db):
    print(f"\n=== GENERATE demo data: '{SOURCE_TENANT}' -> '{TARGET_TENANT}' ===")
    await wipe_demo(db)
    await ensure_demo_tenant(db)
    by_collection = await build_demo_documents(db)
    await insert_documents(db, by_collection)
    demo_tenant = await db.tenants.find_one({"tenant_id": TARGET_TENANT})
    demo_tenant.pop("_id", None)
    write_fixture(by_collection, demo_tenant)
    _print_admin_logins(by_collection)
    print("\nDone. Demo tenant is ready in the connected database.")


async def cmd_load(db):
    print(f"\n=== LOAD demo fixture -> '{TARGET_TENANT}' ===")
    if not FIXTURE_PATH.exists():
        raise SystemExit(f"Fixture not found: {FIXTURE_PATH}. Run 'generate' first.")
    payload = json_util.loads(FIXTURE_PATH.read_text())
    await wipe_demo(db)
    tenant = payload["tenant"]
    tenant.pop("_id", None)
    await db.tenants.delete_many({"tenant_id": TARGET_TENANT})
    await db.tenants.insert_one(tenant)
    print(f"  Created tenant record '{TARGET_TENANT}'")
    by_collection = payload["collections"]
    for docs in by_collection.values():
        for d in docs:
            d.pop("_id", None)
    await insert_documents(db, by_collection)
    _print_admin_logins(by_collection)
    print("\nDone. Demo tenant loaded from fixture.")


async def cmd_wipe(db):
    print(f"\n=== WIPE '{TARGET_TENANT}' ===")
    await wipe_demo(db)
    await db.tenants.delete_many({"tenant_id": TARGET_TENANT})
    print("Done.")


async def main():
    parser = argparse.ArgumentParser(description="Demo seed data generator")
    parser.add_argument("command", choices=["generate", "load", "wipe"],
                        nargs="?", default="generate")
    args = parser.parse_args()

    client = AsyncIOMotorClient(os.environ["MONGO_URL"])
    db = client[os.environ["DB_NAME"]]
    try:
        if args.command == "generate":
            await cmd_generate(db)
        elif args.command == "load":
            await cmd_load(db)
        else:
            await cmd_wipe(db)
    finally:
        client.close()


if __name__ == "__main__":
    asyncio.run(main())
