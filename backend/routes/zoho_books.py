"""
Zoho Books integration HTTP routes.

Endpoints:
  GET    /api/zoho/config-status            — Is the integration configured at all (env vars set)?
  GET    /api/zoho/status                   — Is THIS tenant connected? Returns org name etc.
  GET    /api/zoho/oauth/initiate           — Returns the Zoho authorize URL (with CSRF state)
  GET    /api/zoho/oauth/callback           — OAuth callback; finishes the connect flow
  DELETE /api/zoho/disconnect               — Revokes refresh token + clears credentials

  GET    /api/zoho/sku-mappings             — List Nyla-SKU ↔ Zoho-Item mappings
  PUT    /api/zoho/sku-mappings/{sku_id}    — Upsert a mapping
  DELETE /api/zoho/sku-mappings/{sku_id}    — Remove a mapping
  GET    /api/zoho/items                    — List Zoho items (for the mapping picker)

  GET    /api/zoho/sync-status              — Last N invoice push attempts (success + failed)
  POST   /api/zoho/sync/delivery/{id}       — Manual push / retry of a single delivery
"""
from __future__ import annotations

import logging
import secrets
from datetime import datetime, timezone, timedelta
from typing import Optional

from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException, Query, Request
from fastapi.responses import RedirectResponse

from database import db
from deps import get_current_user
from core.tenant import get_current_tenant_id
from services import zoho_service as zoho

router = APIRouter()
logger = logging.getLogger(__name__)

CONNECT_ROLES = {"CEO", "Admin", "System Admin"}


def _ensure_admin(current_user: dict) -> None:
    if current_user.get("role") not in CONNECT_ROLES:
        raise HTTPException(status_code=403, detail="Only CEO / Admin / System Admin can manage Zoho Books integration")


# -------------------- Configuration / status --------------------

@router.get("/zoho/config-status")
async def zoho_config_status(current_user: dict = Depends(get_current_user)):
    """Whether the platform-level Zoho OAuth client is configured (env vars present)."""
    return {"configured": zoho.is_zoho_configured()}


@router.get("/zoho/status")
async def zoho_connection_status(current_user: dict = Depends(get_current_user)):
    """Current tenant's Zoho connection status."""
    tenant_id = get_current_tenant_id()
    creds = await zoho.get_credentials(tenant_id)
    if not creds:
        return {"connected": False, "configured": zoho.is_zoho_configured()}
    return {
        "connected": True,
        "configured": zoho.is_zoho_configured(),
        "organization_id": creds.get("organization_id"),
        "organization_name": creds.get("organization_name"),
        "connection_status": creds.get("connection_status"),
        "connected_by": creds.get("connected_by"),
        "connected_at": creds.get("created_at"),
        "updated_at": creds.get("updated_at"),
    }


# -------------------- OAuth flow --------------------

@router.get("/zoho/oauth/initiate")
async def initiate_oauth(request: Request, current_user: dict = Depends(get_current_user)):
    _ensure_admin(current_user)
    if not zoho.is_zoho_configured():
        raise HTTPException(
            status_code=400,
            detail="Zoho Books client credentials are not configured on the server. Contact platform admin.",
        )

    tenant_id = get_current_tenant_id()
    state = secrets.token_urlsafe(32)
    redirect_uri = zoho.get_redirect_uri(request)

    now = datetime.now(timezone.utc)
    await db.zoho_oauth_state.insert_one({
        "state": state,
        "tenant_id": tenant_id,
        "user_id": current_user.get("id"),
        "user_email": current_user.get("email"),
        "redirect_uri": redirect_uri,
        "expires_at": (now + timedelta(minutes=15)).isoformat(),
        "created_at": now.isoformat(),
        "used": False,
    })

    authorize_url = zoho.build_authorize_url(state, redirect_uri)
    return {"authorize_url": authorize_url, "state": state, "redirect_uri": redirect_uri}


@router.get("/zoho/oauth/callback")
async def oauth_callback(
    request: Request,
    code: Optional[str] = Query(None),
    state: Optional[str] = Query(None),
    error: Optional[str] = Query(None),
    location: Optional[str] = Query(None),
    accounts_server: Optional[str] = Query(None, alias="accounts-server"),
):
    """OAuth callback. We use the state lookup (not get_current_user) because Zoho hits
    this endpoint without our session cookie context guarantees — but `state` is single-use
    and tied to a specific tenant/user.

    Zoho appends `?location=in&accounts-server=https://accounts.zoho.in` (or .com / .eu / .au
    depending on which DC the user actually authenticated against). We must exchange the
    code on THAT DC; hitting the wrong DC returns `invalid_code`.
    """
    # Where to send the user back in the SPA — derive from forwarded headers
    # so we go back to the public-facing URL, not the internal cluster URL.
    headers = request.headers or {}
    fproto = (headers.get("x-forwarded-proto") or "https").split(",")[0].strip()
    fhost = (headers.get("x-forwarded-host") or headers.get("host") or "").split(",")[0].strip()
    base = f"{fproto}://{fhost}" if fhost else str(request.base_url).rstrip("/")
    success_redirect = f"{base}/settings/integrations/zoho?status=success"
    failure_redirect = f"{base}/settings/integrations/zoho?status=error"

    if error or not code or not state:
        msg = error or "Missing authorization code or state"
        return RedirectResponse(f"{failure_redirect}&message={msg}", status_code=302)

    state_doc = await db.zoho_oauth_state.find_one({"state": state})
    if not state_doc:
        return RedirectResponse(f"{failure_redirect}&message=invalid_state", status_code=302)

    expires_at = state_doc.get("expires_at")
    if state_doc.get("used") or (expires_at and datetime.fromisoformat(expires_at) < datetime.now(timezone.utc)):
        return RedirectResponse(f"{failure_redirect}&message=state_expired", status_code=302)

    # Consume state immediately to block replay
    await db.zoho_oauth_state.update_one({"state": state}, {"$set": {"used": True}})

    tenant_id = state_doc["tenant_id"]
    redirect_uri = state_doc["redirect_uri"]

    # Resolve the data centre Zoho actually issued the code on.
    # Prefer the explicit `accounts-server` URL Zoho sends; fall back to the
    # `location` short code (in / us / eu / au / jp / ca / sa); finally fall
    # back to what's configured in env.
    DC_MAP = {
        "in": ("https://accounts.zoho.in", "https://www.zohoapis.in"),
        "us": ("https://accounts.zoho.com", "https://www.zohoapis.com"),
        "eu": ("https://accounts.zoho.eu", "https://www.zohoapis.eu"),
        "au": ("https://accounts.zoho.com.au", "https://www.zohoapis.com.au"),
        "jp": ("https://accounts.zoho.jp", "https://www.zohoapis.jp"),
        "ca": ("https://accounts.zohocloud.ca", "https://www.zohoapis.ca"),
        "sa": ("https://accounts.zoho.sa", "https://www.zohoapis.sa"),
        "uk": ("https://accounts.zoho.uk", "https://www.zohoapis.uk"),
    }
    # Reverse map: accounts URL → api base URL (for `accounts-server` resolution)
    ACCT_TO_API = {acct: api for (acct, api) in DC_MAP.values()}

    accounts_url = None
    if accounts_server:
        accounts_url = accounts_server.rstrip("/")
    elif location and location.lower() in DC_MAP:
        accounts_url = DC_MAP[location.lower()][0]

    try:
        token_response = await zoho.exchange_code_for_tokens(code, redirect_uri, accounts_url=accounts_url)
        # Resolve the matching API base URL from the accounts URL using the
        # explicit lookup table (DON'T do naive string replace — `accounts.zoho.com`
        # → naive replace yields `www.zohoapis.zoho.com` which doesn't resolve).
        api_base_url = ACCT_TO_API.get(accounts_url) if accounts_url else None
        logger.info(
            f"Zoho OAuth: accounts_url={accounts_url!r} api_base_url={api_base_url!r} "
            f"location={location!r} accounts_server={accounts_server!r}"
        )
        organizations = await zoho.fetch_organizations(token_response["access_token"], api_base_url=api_base_url)
        if not organizations:
            return RedirectResponse(f"{failure_redirect}&message=no_organizations", status_code=302)
        org = organizations[0]
        await zoho.store_credentials(
            tenant_id=tenant_id,
            token_response=token_response,
            organization_id=str(org.get("organization_id")),
            organization_name=org.get("name"),
            user_email=state_doc.get("user_email"),
            accounts_url=accounts_url,
            api_base_url=api_base_url,
        )
    except Exception as e:
        logger.error(f"Zoho OAuth callback failed for tenant {tenant_id}: {e}")
        return RedirectResponse(f"{failure_redirect}&message={str(e)[:200]}", status_code=302)

    logger.info(f"Zoho Books connected for tenant {tenant_id} by {state_doc.get('user_email')} (dc={accounts_url})")
    return RedirectResponse(success_redirect, status_code=302)


@router.delete("/zoho/disconnect")
async def disconnect_zoho(current_user: dict = Depends(get_current_user)):
    _ensure_admin(current_user)
    tenant_id = get_current_tenant_id()
    creds = await zoho.get_credentials(tenant_id)
    if not creds:
        return {"message": "Zoho Books was not connected."}
    if creds.get("refresh_token"):
        try:
            await zoho.revoke_refresh_token(zoho.decrypt_token(creds["refresh_token"]))
        except Exception as e:
            logger.warning(f"Zoho revoke failed (continuing with local disconnect): {e}")
    await db.zoho_credentials.delete_one({"tenant_id": tenant_id})
    logger.info(f"Zoho Books disconnected for tenant {tenant_id} by {current_user.get('email')}")
    return {"message": "Disconnected from Zoho Books."}


# -------------------- SKU mappings --------------------

@router.get("/zoho/sku-mappings")
async def list_sku_mappings(current_user: dict = Depends(get_current_user)):
    tenant_id = get_current_tenant_id()
    mappings = await db.zoho_sku_mappings.find(
        {"tenant_id": tenant_id}, {"_id": 0}
    ).to_list(2000)
    # Enrich with our SKU master names for the UI
    sku_ids = [m["our_sku_id"] for m in mappings if m.get("our_sku_id")]
    skus = []
    if sku_ids:
        skus = await db.master_skus.find(
            {"tenant_id": tenant_id, "id": {"$in": sku_ids}},
            {"_id": 0, "id": 1, "name": 1, "sku_name": 1, "sku_code": 1},
        ).to_list(2000)
    sku_by_id = {s["id"]: s for s in skus}
    for m in mappings:
        sku = sku_by_id.get(m.get("our_sku_id"), {})
        m["sku_name"] = sku.get("name") or sku.get("sku_name")
        m["sku_code"] = sku.get("sku_code")
    return {"mappings": mappings}


@router.put("/zoho/sku-mappings/{sku_id}")
async def upsert_sku_mapping(
    sku_id: str, payload: dict, current_user: dict = Depends(get_current_user)
):
    _ensure_admin(current_user)
    tenant_id = get_current_tenant_id()
    zoho_item_id = (payload or {}).get("zoho_item_id")
    zoho_item_name = (payload or {}).get("zoho_item_name")
    if not zoho_item_id:
        raise HTTPException(status_code=400, detail="zoho_item_id is required")
    now = datetime.now(timezone.utc).isoformat()
    await db.zoho_sku_mappings.update_one(
        {"tenant_id": tenant_id, "our_sku_id": sku_id},
        {
            "$set": {
                "tenant_id": tenant_id,
                "our_sku_id": sku_id,
                "zoho_item_id": zoho_item_id,
                "zoho_item_name": zoho_item_name,
                "updated_at": now,
                "updated_by": current_user.get("email"),
            },
            "$setOnInsert": {"created_at": now},
        },
        upsert=True,
    )
    return {"message": "Mapping saved"}


@router.delete("/zoho/sku-mappings/{sku_id}")
async def delete_sku_mapping(sku_id: str, current_user: dict = Depends(get_current_user)):
    _ensure_admin(current_user)
    tenant_id = get_current_tenant_id()
    await db.zoho_sku_mappings.delete_one({"tenant_id": tenant_id, "our_sku_id": sku_id})
    return {"message": "Mapping removed"}


@router.get("/zoho/items")
async def list_zoho_items(
    search: Optional[str] = Query(None),
    page: int = Query(1, ge=1),
    current_user: dict = Depends(get_current_user),
):
    """Proxy to Zoho /items so the mapping picker can search Zoho's catalogue."""
    tenant_id = get_current_tenant_id()
    params = {"page": page}
    if search:
        params["search_text"] = search
    try:
        data = await zoho._zoho_request("GET", "/books/v3/items", tenant_id=tenant_id, params=params)
    except zoho.ZohoApiError as e:
        raise HTTPException(status_code=e.status_code, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
    return {
        "items": [
            {"item_id": i.get("item_id"), "name": i.get("name"), "sku": i.get("sku"), "rate": i.get("rate")}
            for i in data.get("items", [])
        ],
        "page": page,
    }


# -------------------- Sync status / manual retry --------------------

@router.get("/zoho/sync-status")
async def list_sync_status(
    limit: int = Query(50, ge=1, le=200),
    status: Optional[str] = Query(None, description="synced | sync_failed"),
    current_user: dict = Depends(get_current_user),
):
    tenant_id = get_current_tenant_id()
    q: dict = {"tenant_id": tenant_id}
    if status:
        q["status"] = status
    rows = await db.zoho_invoice_mappings.find(q, {"_id": 0}).sort("synced_at", -1).limit(limit).to_list(limit)
    summary = {
        "total": await db.zoho_invoice_mappings.count_documents({"tenant_id": tenant_id}),
        "synced": await db.zoho_invoice_mappings.count_documents({"tenant_id": tenant_id, "status": "synced"}),
        "failed": await db.zoho_invoice_mappings.count_documents({"tenant_id": tenant_id, "status": "sync_failed"}),
    }
    return {"items": rows, "summary": summary}


@router.post("/zoho/sync/delivery/{distributor_id}/{delivery_id}")
async def manual_sync_delivery(
    distributor_id: str,
    delivery_id: str,
    background_tasks: BackgroundTasks,
    current_user: dict = Depends(get_current_user),
):
    """Manually push (or retry) a single delivery to Zoho Books."""
    _ensure_admin(current_user)
    tenant_id = get_current_tenant_id()
    if not zoho.is_zoho_configured():
        raise HTTPException(status_code=400, detail="Zoho Books is not configured")
    creds = await zoho.get_credentials(tenant_id)
    if not creds:
        raise HTTPException(status_code=400, detail="Zoho Books is not connected. Connect from Settings.")

    delivery = await db.distributor_deliveries.find_one(
        {"id": delivery_id, "tenant_id": tenant_id, "distributor_id": distributor_id}
    )
    if not delivery:
        raise HTTPException(status_code=404, detail="Delivery not found")

    # Hard-block manual pushes from non-factory warehouses too — Zoho invoices
    # are reserved for factory-warehouse stock-outs only.
    src_loc_id = delivery.get("distributor_location_id")
    if src_loc_id:
        src_loc = await db.distributor_locations.find_one(
            {"id": src_loc_id, "tenant_id": tenant_id},
            {"_id": 0, "is_factory": 1, "location_name": 1},
        )
        if not src_loc or not src_loc.get("is_factory"):
            raise HTTPException(
                status_code=400,
                detail=(
                    f"Zoho invoices are only generated for factory warehouse stock-outs. "
                    f"This delivery was dispatched from '{(src_loc or {}).get('location_name', 'unknown')}', "
                    f"which is not a factory warehouse."
                ),
            )

    background_tasks.add_task(zoho.sync_delivery_to_zoho, tenant_id, distributor_id, delivery_id)
    return {"message": "Sync queued; check Sync Status panel in a few seconds."}



@router.post("/zoho/admin/link-existing-contacts")
async def link_existing_zoho_contacts(
    overwrite: bool = Query(False, description="Re-resolve even accounts that already have a zoho_contact_id"),
    dry_run: bool = Query(False, description="Look up matches but don't persist anything"),
    current_user: dict = Depends(get_current_user),
):
    """Sync `zoho_contact_id` onto every CRM account that has a matching contact
    already in Zoho Books (by email or contact_name). Useful when migrating —
    avoids creating duplicate Zoho contacts.

    Behaviour per account:
      • Skip if `zoho_contact_id` already set (unless overwrite=true)
      • Search Zoho contacts by email, then by contact_name
      • If a match is found → store the Zoho contact_id locally
      • If no match → leave the account untouched (no Zoho create)

    CEO / System Admin only.
    """
    user_role = (current_user.get('role') or '').strip()
    if user_role not in ('CEO', 'System Admin'):
        raise HTTPException(status_code=403, detail='Only CEO and System Admin can run bulk Zoho linkage.')

    from services import zoho_service as zoho
    if not zoho.is_zoho_configured():
        raise HTTPException(status_code=400, detail='Zoho integration is not configured for this tenant.')

    tenant_id = current_user.get('tenant_id')

    # Fetch every active account in the tenant
    q: dict = {'tenant_id': tenant_id, 'status': {'$ne': 'deleted'}}
    accounts = await db.accounts.find(q, {'_id': 0}).to_list(5000)

    linked: list[dict] = []
    skipped: list[dict] = []
    not_found: list[dict] = []
    errors: list[dict] = []

    for acc in accounts:
        acc_code = acc.get('account_id') or acc.get('id')
        acc_name = acc.get('account_name') or ''
        existing_zoho_id = (acc.get('zoho_contact_id') or '').strip()

        if existing_zoho_id and not overwrite:
            skipped.append({'account': acc_name, 'reason': 'already_linked', 'zoho_id': existing_zoho_id})
            continue

        email = (acc.get('email') or '').strip()
        match = None

        # 1) by email
        if email:
            try:
                search = await zoho._zoho_request(
                    'GET', '/books/v3/contacts', tenant_id=tenant_id, params={'email': email}
                )
                contacts = search.get('contacts', []) or []
                match = contacts[0] if contacts else None
            except Exception as e:
                logger.warning(f"[zoho-link] email lookup failed for {acc_name}: {e}")

        # 2) by exact contact_name
        if not match and acc_name:
            try:
                search = await zoho._zoho_request(
                    'GET', '/books/v3/contacts', tenant_id=tenant_id,
                    params={'contact_name': acc_name},
                )
                contacts = search.get('contacts', []) or []
                for c in contacts:
                    if (c.get('contact_name') or '').strip().lower() == acc_name.strip().lower():
                        match = c
                        break
                if not match and len(contacts) == 1:
                    match = contacts[0]
            except Exception as e:
                errors.append({'account': acc_name, 'error': str(e)[:200]})
                continue

        if not match:
            not_found.append({'account': acc_name, 'account_id': acc_code, 'email': email or None})
            continue

        zoho_contact_id = match.get('contact_id')
        if not zoho_contact_id:
            errors.append({'account': acc_name, 'error': 'match_missing_contact_id'})
            continue

        linked.append({
            'account': acc_name,
            'account_id': acc_code,
            'zoho_contact_id': zoho_contact_id,
            'zoho_contact_name': match.get('contact_name'),
            'matched_by': 'email' if email and match.get('email') == email else 'name',
        })

        if not dry_run:
            await db.accounts.update_one(
                {'id': acc.get('id'), 'tenant_id': tenant_id},
                {'$set': {
                    'zoho_contact_id': zoho_contact_id,
                    'updated_at': datetime.now(timezone.utc).isoformat(),
                }}
            )

    logger.info(
        f"[zoho-link] dry_run={dry_run} overwrite={overwrite} by {current_user.get('email')}: "
        f"linked={len(linked)} skipped={len(skipped)} not_found={len(not_found)} errors={len(errors)}"
    )

    return {
        'success': True,
        'dry_run': dry_run,
        'overwrite': overwrite,
        'summary': {
            'total_accounts': len(accounts),
            'linked': len(linked),
            'skipped_already_linked': len(skipped),
            'not_found_in_zoho': len(not_found),
            'errors': len(errors),
        },
        'linked': linked,
        'not_found': not_found,
        'errors': errors,
    }
