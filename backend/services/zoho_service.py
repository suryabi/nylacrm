"""
Zoho Books OAuth + Invoice push service (India DC).

Responsibilities:
  • OAuth 2.0 Authorization Code flow (initiate URL, code -> tokens, refresh)
  • Encrypted at-rest storage of access / refresh tokens (Fernet)
  • Per-tenant credential lookup with auto-refresh 5 min before expiry
  • Contact upsert (by email) + Invoice creation in Zoho Books
  • Rate-limit aware (respects 429 Retry-After header)
  • Tenacity-style retry with exponential backoff for transient failures

Collections (Mongo):
  • zoho_credentials      — { tenant_id, encrypted access/refresh, org_id, ... }
  • zoho_oauth_state      — short-lived CSRF state (TTL-indexed)
  • zoho_sku_mappings     — { tenant_id, our_sku_id, zoho_item_id, ... }
  • zoho_invoice_mappings — { tenant_id, our_invoice_ref, zoho_invoice_id, status, ... }
"""
from __future__ import annotations

import asyncio
import logging
import os
import secrets
import uuid
from datetime import datetime, timezone, timedelta
from typing import Optional

import httpx
from cryptography.fernet import Fernet, InvalidToken

from database import db

logger = logging.getLogger(__name__)


# ---------- config helpers (env-driven, no defaults so missing config fails fast) ----------

def _env(key: str, *, required: bool = True) -> str:
    val = os.environ.get(key, "")
    if required and not val:
        raise RuntimeError(f"Missing required env var: {key}")
    return val


def get_zoho_config() -> dict:
    """Returns the Zoho OAuth config (read each time so .env changes are picked up)."""
    return {
        "client_id": os.environ.get("ZOHO_CLIENT_ID", ""),
        "client_secret": os.environ.get("ZOHO_CLIENT_SECRET", ""),
        "accounts_url": os.environ.get("ZOHO_ACCOUNTS_URL", "https://accounts.zoho.in"),
        "api_base_url": os.environ.get("ZOHO_API_BASE_URL", "https://www.zohoapis.in"),
        "scopes": [
            "ZohoBooks.contacts.CREATE",
            "ZohoBooks.contacts.READ",
            "ZohoBooks.contacts.UPDATE",
            "ZohoBooks.invoices.CREATE",
            "ZohoBooks.invoices.READ",
            "ZohoBooks.items.READ",
            "ZohoBooks.settings.READ",
        ],
    }


def is_zoho_configured() -> bool:
    cfg = get_zoho_config()
    return bool(cfg["client_id"] and cfg["client_secret"])


def get_redirect_uri(request) -> str:
    """Compute the OAuth callback URI from the incoming request.

    Honours `X-Forwarded-Proto` / `X-Forwarded-Host` set by the Kubernetes ingress
    so the URL matches the *public* preview/production URL the user registered with
    Zoho — not the internal cluster URL FastAPI sees.

    Falls back to env var `ZOHO_REDIRECT_URI` if set (escape hatch for overrides).
    """
    override = os.environ.get("ZOHO_REDIRECT_URI", "").strip()
    if override:
        return override

    # Prefer forwarded headers (set by Emergent ingress)
    headers = getattr(request, "headers", {}) or {}
    forwarded_proto = (headers.get("x-forwarded-proto") or "").split(",")[0].strip()
    forwarded_host = (headers.get("x-forwarded-host") or headers.get("host") or "").split(",")[0].strip()

    if forwarded_host:
        scheme = forwarded_proto or "https"
        return f"{scheme}://{forwarded_host}/api/zoho/oauth/callback"

    # Last resort: FastAPI's base_url (internal cluster URL — only used in dev/local)
    base = str(request.base_url).rstrip("/")
    return f"{base}/api/zoho/oauth/callback"


# ---------- encryption ----------

def _fernet() -> Fernet:
    key = os.environ.get("ZOHO_ENCRYPTION_KEY", "")
    if not key:
        raise RuntimeError("ZOHO_ENCRYPTION_KEY env var not set")
    return Fernet(key.encode() if isinstance(key, str) else key)


def encrypt_token(plain: str) -> str:
    return _fernet().encrypt(plain.encode()).decode()


def decrypt_token(encrypted: str) -> str:
    try:
        return _fernet().decrypt(encrypted.encode()).decode()
    except InvalidToken:
        raise RuntimeError("Failed to decrypt Zoho token; encryption key may have changed")


# ---------- OAuth flow ----------

def build_authorize_url(state: str, redirect_uri: str) -> str:
    cfg = get_zoho_config()
    params = {
        "scope": ",".join(cfg["scopes"]),
        "client_id": cfg["client_id"],
        "response_type": "code",
        "access_type": "offline",
        "prompt": "consent",
        "redirect_uri": redirect_uri,
        "state": state,
    }
    qs = "&".join(f"{k}={v}" for k, v in params.items())
    return f"{cfg['accounts_url']}/oauth/v2/auth?{qs}"


async def exchange_code_for_tokens(code: str, redirect_uri: str, accounts_url: Optional[str] = None) -> dict:
    """Exchange an authorization code for tokens.

    `accounts_url` overrides the default accounts URL. Zoho's OAuth callback
    includes `accounts-server` and/or `location` query parameters indicating
    the data centre the user actually consented on (e.g. .in, .com, .eu, .au).
    We must hit /token on THAT DC or Zoho returns `invalid_code`.
    """
    cfg = get_zoho_config()
    base = (accounts_url or cfg["accounts_url"]).rstrip("/")
    async with httpx.AsyncClient(timeout=15.0) as client:
        resp = await client.post(
            f"{base}/oauth/v2/token",
            params={
                "grant_type": "authorization_code",
                "client_id": cfg["client_id"],
                "client_secret": cfg["client_secret"],
                "redirect_uri": redirect_uri,
                "code": code,
            },
        )
    if resp.status_code != 200:
        raise RuntimeError(f"Zoho token exchange failed ({resp.status_code}) at {base}: {resp.text}")
    data = resp.json()
    if "access_token" not in data:
        logger.error(
            f"Zoho /token returned no access_token. accounts_url={base} redirect_uri={redirect_uri} response={data}"
        )
        raise RuntimeError(f"Zoho did not return access_token: {data}")
    return data


async def refresh_access_token(refresh_token: str, accounts_url: Optional[str] = None) -> dict:
    cfg = get_zoho_config()
    base = (accounts_url or cfg["accounts_url"]).rstrip("/")
    async with httpx.AsyncClient(timeout=15.0) as client:
        resp = await client.post(
            f"{base}/oauth/v2/token",
            params={
                "grant_type": "refresh_token",
                "client_id": cfg["client_id"],
                "client_secret": cfg["client_secret"],
                "refresh_token": refresh_token,
            },
        )
    if resp.status_code != 200:
        raise RuntimeError(f"Zoho token refresh failed ({resp.status_code}) at {base}: {resp.text}")
    return resp.json()


async def revoke_refresh_token(refresh_token: str) -> bool:
    cfg = get_zoho_config()
    try:
        async with httpx.AsyncClient(timeout=10.0) as client:
            resp = await client.post(
                f"{cfg['accounts_url']}/oauth/v2/token/revoke",
                params={"token": refresh_token},
            )
        return resp.status_code in (200, 204)
    except Exception as e:
        logger.warning(f"Zoho revoke failed: {e}")
        return False


async def fetch_organizations(access_token: str, api_base_url: Optional[str] = None) -> list[dict]:
    """Returns the list of Zoho Books organizations the access token can see."""
    cfg = get_zoho_config()
    base = (api_base_url or cfg["api_base_url"]).rstrip("/")
    url = f"{base}/books/v3/organizations"
    logger.info(f"Zoho fetch_organizations: GET {url}")
    async with httpx.AsyncClient(timeout=15.0) as client:
        resp = await client.get(
            url,
            headers={"Authorization": f"Zoho-oauthtoken {access_token}"},
        )
    if resp.status_code != 200:
        raise RuntimeError(f"Failed to list Zoho organizations at {base}: {resp.text}")
    return resp.json().get("organizations", [])


# ---------- credential persistence ----------

async def store_credentials(
    *,
    tenant_id: str,
    token_response: dict,
    organization_id: str,
    organization_name: Optional[str],
    user_email: Optional[str],
    accounts_url: Optional[str] = None,
    api_base_url: Optional[str] = None,
) -> None:
    now = datetime.now(timezone.utc)
    expires_in = int(token_response.get("expires_in", 3600))
    update = {
        "tenant_id": tenant_id,
        "organization_id": organization_id,
        "organization_name": organization_name,
        "access_token": encrypt_token(token_response["access_token"]),
        "token_expires_at": (now + timedelta(seconds=expires_in)).isoformat(),
        "connection_status": "connected",
        "updated_at": now.isoformat(),
        "connected_by": user_email,
        "is_active": True,
        "zoho_datacenter": "in",
    }
    if accounts_url:
        update["accounts_url"] = accounts_url
    if api_base_url:
        update["api_base_url"] = api_base_url
    if token_response.get("refresh_token"):
        update["refresh_token"] = encrypt_token(token_response["refresh_token"])
    await db.zoho_credentials.update_one(
        {"tenant_id": tenant_id},
        {"$set": update, "$setOnInsert": {"created_at": now.isoformat()}},
        upsert=True,
    )


async def get_credentials(tenant_id: str) -> Optional[dict]:
    return await db.zoho_credentials.find_one(
        {"tenant_id": tenant_id, "is_active": True}, {"_id": 0}
    )


async def get_valid_access_token(tenant_id: str) -> str:
    """Returns a valid access token, refreshing if within 5 minutes of expiry."""
    creds = await get_credentials(tenant_id)
    if not creds:
        raise RuntimeError("Zoho Books is not connected for this tenant")

    expires_at_str = creds.get("token_expires_at")
    expires_at = datetime.fromisoformat(expires_at_str) if expires_at_str else datetime.now(timezone.utc)
    if expires_at.tzinfo is None:
        expires_at = expires_at.replace(tzinfo=timezone.utc)

    if datetime.now(timezone.utc) < expires_at - timedelta(minutes=5):
        return decrypt_token(creds["access_token"])

    # Need to refresh
    if not creds.get("refresh_token"):
        # Mark as expired so UI prompts reconnection
        await db.zoho_credentials.update_one(
            {"tenant_id": tenant_id},
            {"$set": {"connection_status": "expired", "updated_at": datetime.now(timezone.utc).isoformat()}},
        )
        raise RuntimeError("Zoho refresh token missing; please reconnect Zoho Books")

    refresh = decrypt_token(creds["refresh_token"])
    token_response = await refresh_access_token(refresh, accounts_url=creds.get("accounts_url"))
    new_access = token_response["access_token"]
    new_expiry = datetime.now(timezone.utc) + timedelta(seconds=int(token_response.get("expires_in", 3600)))
    await db.zoho_credentials.update_one(
        {"tenant_id": tenant_id},
        {"$set": {
            "access_token": encrypt_token(new_access),
            "token_expires_at": new_expiry.isoformat(),
            "connection_status": "connected",
            "updated_at": datetime.now(timezone.utc).isoformat(),
        }},
    )
    return new_access


# ---------- Zoho Books API calls with retry / rate-limit handling ----------

class ZohoApiError(Exception):
    """Wraps a non-2xx Zoho Books API error."""
    def __init__(self, status_code: int, message: str, payload: Optional[dict] = None):
        super().__init__(f"Zoho API {status_code}: {message}")
        self.status_code = status_code
        self.payload = payload or {}


async def _zoho_request(
    method: str,
    path: str,
    *,
    tenant_id: str,
    json: Optional[dict] = None,
    params: Optional[dict] = None,
    max_attempts: int = 3,
) -> dict:
    """Authenticated request with exponential backoff + 429 Retry-After handling."""
    cfg = get_zoho_config()
    creds = await get_credentials(tenant_id)
    if not creds:
        raise RuntimeError("Zoho Books is not connected for this tenant")
    api_base = (creds.get("api_base_url") or cfg["api_base_url"]).rstrip("/")
    url = f"{api_base}{path}"

    # Ensure organization_id is on every request
    params = dict(params or {})
    params.setdefault("organization_id", creds["organization_id"])

    last_exc: Optional[Exception] = None
    for attempt in range(1, max_attempts + 1):
        token = await get_valid_access_token(tenant_id)
        headers = {
            "Authorization": f"Zoho-oauthtoken {token}",
            "Content-Type": "application/json",
        }
        try:
            async with httpx.AsyncClient(timeout=20.0) as client:
                resp = await client.request(method, url, headers=headers, params=params, json=json)
        except httpx.RequestError as e:
            last_exc = e
            backoff = min(2 ** attempt, 8)
            logger.warning(f"Zoho network error (attempt {attempt}/{max_attempts}): {e}; retrying in {backoff}s")
            await asyncio.sleep(backoff)
            continue

        if resp.status_code == 429:
            retry_after = int(resp.headers.get("Retry-After", "5"))
            logger.warning(f"Zoho rate limited (429); waiting {retry_after}s")
            await asyncio.sleep(min(retry_after, 30))
            continue

        if 500 <= resp.status_code < 600 and attempt < max_attempts:
            backoff = min(2 ** attempt, 8)
            logger.warning(f"Zoho 5xx ({resp.status_code}); retrying in {backoff}s")
            await asyncio.sleep(backoff)
            continue

        if resp.status_code >= 400:
            payload = None
            try:
                payload = resp.json()
            except Exception:
                pass
            raise ZohoApiError(resp.status_code, resp.text[:500], payload)

        try:
            return resp.json()
        except Exception:
            return {}

    if last_exc:
        raise last_exc
    raise RuntimeError("Zoho request failed after maximum retries")


# ---------- Contact upsert ----------

async def upsert_contact(tenant_id: str, account: dict) -> str:
    """Find-or-create a Zoho contact for a Nyla account. Returns the Zoho contact_id."""
    email = (account.get("email") or "").strip()
    name = account.get("account_name") or account.get("name") or "Unnamed Customer"

    existing = None
    if email:
        try:
            search = await _zoho_request("GET", "/books/v3/contacts", tenant_id=tenant_id, params={"email": email})
            contacts = search.get("contacts", [])
            existing = contacts[0] if contacts else None
        except ZohoApiError as e:
            logger.warning(f"Zoho contact lookup by email failed: {e}")

    payload = {
        "contact_name": name,
        "company_name": account.get("company_name") or name,
        "contact_type": "customer",
    }
    if email:
        payload["contact_persons"] = [{
            "first_name": (account.get("contact_name") or name).split(" ", 1)[0],
            "last_name": " ".join((account.get("contact_name") or name).split(" ", 1)[1:]) or "",
            "email": email,
            "phone": account.get("contact_number") or account.get("phone") or "",
            "is_primary_contact": True,
        }]
    if account.get("gstin"):
        payload["gst_no"] = account["gstin"]
        payload["gst_treatment"] = "business_gst"
    if account.get("delivery_address") or account.get("billing_address"):
        payload["billing_address"] = {
            "address": account.get("billing_address") or account.get("delivery_address") or "",
            "city": account.get("city") or "",
            "state": account.get("state") or "",
            "zip": account.get("postal_code") or "",
            "country": "India",
        }

    if existing:
        contact_id = existing["contact_id"]
        try:
            await _zoho_request("PUT", f"/books/v3/contacts/{contact_id}", tenant_id=tenant_id, json=payload)
        except ZohoApiError as e:
            logger.warning(f"Zoho contact update failed (continuing with existing): {e}")
        return contact_id

    result = await _zoho_request("POST", "/books/v3/contacts", tenant_id=tenant_id, json=payload)
    return result["contact"]["contact_id"]


# ---------- SKU mapping lookup ----------

async def get_zoho_item_id(tenant_id: str, our_sku_id: str) -> str:
    mapping = await db.zoho_sku_mappings.find_one(
        {"tenant_id": tenant_id, "our_sku_id": our_sku_id}, {"_id": 0}
    )
    if not mapping or not mapping.get("zoho_item_id"):
        raise RuntimeError(
            f"SKU {our_sku_id} is not mapped to a Zoho item. "
            "Please add a mapping in Settings → Integrations → Zoho Books → SKU Mapping."
        )
    return mapping["zoho_item_id"]


# ---------- Invoice creation ----------

class MissingAgreedPriceError(RuntimeError):
    """Raised when the account has no agreed `sku_pricing` for one or more SKUs
    on the delivery. The Zoho invoice MUST use customer-agreed pricing, not the
    Zoho catalog rate, so we refuse to push when pricing is unknown."""


def _zoho_books_url(zoho_invoice_id: str, creds: dict) -> Optional[str]:
    """Construct the admin-facing Zoho Books URL for an invoice based on the
    tenant's connected data centre.
    """
    if not zoho_invoice_id:
        return None
    org_id = (creds or {}).get("organization_id")
    accts = (creds or {}).get("accounts_url") or ""
    books_domain = "books.zoho.com"
    if "zoho.in" in accts:
        books_domain = "books.zoho.in"
    elif "zoho.eu" in accts:
        books_domain = "books.zoho.eu"
    elif "zoho.com.au" in accts:
        books_domain = "books.zoho.com.au"
    elif "zoho.jp" in accts:
        books_domain = "books.zoho.jp"
    elif "zohocloud.ca" in accts:
        books_domain = "books.zoho.ca"
    elif "zoho.sa" in accts:
        books_domain = "books.zoho.sa"
    if org_id:
        return f"https://{books_domain}/app/{org_id}#/invoices/{zoho_invoice_id}"
    return f"https://{books_domain}/#/invoices/{zoho_invoice_id}"


async def create_invoice_for_delivery(
    *, tenant_id: str, delivery: dict, items: list[dict], account: dict
) -> dict:
    """Push a Nyla distributor delivery as a Zoho Books invoice using the
    customer-agreed prices from `account.sku_pricing`. Fails fast (no push)
    if any SKU on the delivery has no agreed price on the account.

    On success:
      • Creates the invoice in Zoho Books (rate = account.sku_pricing.price_per_unit)
      • Stores the Zoho identifiers + share URL on the delivery doc
      • Mirrors a row into the `invoices` collection so the invoice shows up
        under Account → Invoices (with a `zoho_invoice_url` to "View in Zoho")
      • Persists the canonical mapping in `zoho_invoice_mappings`

    Returns the persisted mapping document.
    """
    if not is_zoho_configured():
        raise RuntimeError("Zoho Books integration is not configured (ZOHO_CLIENT_ID missing).")

    # 1. Upsert contact
    customer_id = await upsert_contact(tenant_id, account)

    # 2. Build agreed-price lookup from account.sku_pricing (case-insensitive on name)
    agreed_prices: dict[str, float] = {}
    for p in (account.get("sku_pricing") or []):
        sku_key = (p.get("sku") or p.get("sku_name") or "").strip().lower()
        if not sku_key:
            continue
        try:
            agreed_prices[sku_key] = float(p.get("price_per_unit") or p.get("agreed_price") or 0)
        except (TypeError, ValueError):
            agreed_prices[sku_key] = 0.0

    # 3. Build line items using ONLY the account-agreed price
    missing_skus: list[str] = []
    line_items: list[dict] = []
    for it in items:
        zoho_item_id = await get_zoho_item_id(tenant_id, it.get("sku_id"))
        sku_name = (it.get("sku_name") or it.get("sku_code") or "").strip()
        key = sku_name.lower()
        agreed = agreed_prices.get(key)
        if agreed is None or agreed <= 0:
            if sku_name and sku_name not in missing_skus:
                missing_skus.append(sku_name)
            continue
        qty = float(it.get("quantity", 0) or 0)
        line_items.append({
            "item_id": zoho_item_id,
            "name": sku_name,
            "quantity": qty,
            "rate": agreed,
            "discount": float(it.get("discount_percent", 0) or 0),
            "discount_type": "entity_level",
        })

    if missing_skus:
        raise MissingAgreedPriceError(
            "No agreed price configured on the account for SKU(s): "
            + ", ".join(missing_skus)
            + ". Add pricing under Account → SKU Pricing before this delivery can be pushed to Zoho."
        )

    invoice_payload = {
        "customer_id": customer_id,
        "reference_number": delivery.get("delivery_number"),
        "date": (delivery.get("delivery_date") or datetime.now(timezone.utc).strftime("%Y-%m-%d"))[:10],
        "line_items": line_items,
        "notes": f"Generated from Nyla CRM delivery {delivery.get('delivery_number')}",
    }

    result = await _zoho_request("POST", "/books/v3/invoices", tenant_id=tenant_id, json=invoice_payload)
    invoice = result.get("invoice") or {}

    zoho_invoice_id = invoice.get("invoice_id")
    zoho_invoice_number = invoice.get("invoice_number")
    creds = await get_credentials(tenant_id) or {}
    # Prefer Zoho's customer-share URL if returned; else build admin URL
    zoho_invoice_url = invoice.get("invoice_url") or _zoho_books_url(zoho_invoice_id, creds)

    now = datetime.now(timezone.utc).isoformat()

    # 4. Stamp Zoho identifiers on the source delivery (visible on Deliveries detail)
    try:
        await db.distributor_deliveries.update_one(
            {"id": delivery.get("id"), "tenant_id": tenant_id},
            {"$set": {
                "zoho_invoice_id": zoho_invoice_id,
                "zoho_invoice_number": zoho_invoice_number,
                "zoho_invoice_url": zoho_invoice_url,
                "zoho_synced_at": now,
            }}
        )
    except Exception as e:
        logger.warning(f"Failed to stamp Zoho ids on delivery {delivery.get('id')}: {e}")

    # 5. Mirror the invoice into the `invoices` collection so it shows up on
    #    the Account → Invoices listing, with a link back to Zoho Books.
    account_uuid = account.get("id") or account.get("account_uuid")
    if account_uuid:
        items_list = []
        for li in line_items:
            net = float(li["quantity"]) * float(li["rate"])
            items_list.append({
                "sku_name": li["name"],
                "quantity": li["quantity"],
                "bottles": li["quantity"],          # accountdetail UI reads `bottles`
                "rate": li["rate"],
                "net_amount": net,
                "line_total": net,
            })
        gross_total = float(invoice.get("total") or sum(i["net_amount"] for i in items_list))
        invoice_doc = {
            "id": str(uuid.uuid4()),
            "tenant_id": tenant_id,
            "account_id": account_uuid,
            "account_name": account.get("account_name") or account.get("name"),
            "invoice_no": zoho_invoice_number,
            "invoice_number": zoho_invoice_number,
            "invoice_date": invoice_payload["date"],
            "gross_invoice_value": gross_total,
            "net_invoice_value": gross_total,
            "outstanding": float(invoice.get("balance") or 0.0),
            "items": items_list,
            "source": "zoho_books",
            "source_type": "distributor_delivery",
            "source_id": delivery.get("id"),
            "distributor_id": delivery.get("distributor_id"),
            "zoho_invoice_id": zoho_invoice_id,
            "zoho_invoice_number": zoho_invoice_number,
            "zoho_invoice_url": zoho_invoice_url,
            "zoho_organization_id": creds.get("organization_id"),
            "created_at": now,
            "updated_at": now,
        }
        # Upsert by source so a retry / re-push doesn't duplicate the row
        try:
            await db.invoices.update_one(
                {"tenant_id": tenant_id, "source_type": "distributor_delivery", "source_id": delivery.get("id")},
                {"$set": invoice_doc, "$setOnInsert": {"created_at": now}},
                upsert=True,
            )
        except Exception as e:
            logger.warning(f"Failed to mirror Zoho invoice into invoices collection: {e}")

    # 6. Persist canonical mapping (used by Sync Status panel)
    mapping_doc = {
        "tenant_id": tenant_id,
        "source_type": "distributor_delivery",
        "source_id": delivery.get("id"),
        "source_reference": delivery.get("delivery_number"),
        "distributor_id": delivery.get("distributor_id"),
        "zoho_invoice_id": zoho_invoice_id,
        "zoho_invoice_number": zoho_invoice_number,
        "zoho_invoice_url": zoho_invoice_url,
        "zoho_customer_id": customer_id,
        "account_id": account_uuid,
        "status": "synced",
        "synced_at": now,
        "error": None,
        "attempts": 1,
    }
    await db.zoho_invoice_mappings.update_one(
        {"tenant_id": tenant_id, "source_type": "distributor_delivery", "source_id": delivery.get("id")},
        {"$set": mapping_doc, "$setOnInsert": {"created_at": now}},
        upsert=True,
    )
    return mapping_doc


async def record_sync_failure(
    *, tenant_id: str, source_type: str, source_id: str, source_reference: Optional[str],
    distributor_id: Optional[str], error: str, attempts: int
) -> None:
    now = datetime.now(timezone.utc).isoformat()
    await db.zoho_invoice_mappings.update_one(
        {"tenant_id": tenant_id, "source_type": source_type, "source_id": source_id},
        {
            "$set": {
                "tenant_id": tenant_id,
                "source_type": source_type,
                "source_id": source_id,
                "source_reference": source_reference,
                "distributor_id": distributor_id,
                "status": "sync_failed",
                "error": error[:1000],
                "last_failed_at": now,
                "attempts": attempts,
            },
            "$setOnInsert": {"created_at": now},
        },
        upsert=True,
    )


# ---------- Background sync orchestrator (3 retries, exponential backoff) ----------

async def sync_delivery_to_zoho(tenant_id: str, distributor_id: str, delivery_id: str) -> None:
    """Background task: push a delivery to Zoho with retry. Never raises."""
    if not is_zoho_configured():
        logger.info("Zoho not configured, skipping auto-push")
        return
    creds = await get_credentials(tenant_id)
    if not creds:
        logger.info(f"Zoho not connected for tenant {tenant_id}, skipping auto-push")
        return

    delivery = await db.distributor_deliveries.find_one(
        {"id": delivery_id, "tenant_id": tenant_id, "distributor_id": distributor_id}, {"_id": 0}
    )
    if not delivery:
        logger.warning(f"sync_delivery_to_zoho: delivery {delivery_id} not found")
        return

    items = await db.distributor_delivery_items.find(
        {"delivery_id": delivery_id, "tenant_id": tenant_id}, {"_id": 0}
    ).to_list(500)
    if not items:
        logger.warning(f"sync_delivery_to_zoho: no items for delivery {delivery_id}")
        return

    account = await db.accounts.find_one(
        {"id": delivery.get("account_id"), "tenant_id": tenant_id}, {"_id": 0}
    ) or {"account_name": delivery.get("account_name") or "Customer"}

    backoff_seconds = [0, 4, 16]  # 3 attempts total: immediate, +4s, +16s
    last_error: Optional[str] = None
    for attempt, wait_s in enumerate(backoff_seconds, start=1):
        if wait_s:
            await asyncio.sleep(wait_s)
        try:
            await create_invoice_for_delivery(
                tenant_id=tenant_id, delivery=delivery, items=items, account=account
            )
            logger.info(f"Zoho invoice created for delivery {delivery.get('delivery_number')} (attempt {attempt})")
            return
        except MissingAgreedPriceError as e:
            # Don't retry: missing price is a configuration issue, not transient.
            last_error = str(e)
            logger.warning(
                f"Zoho push aborted (no agreed price) for delivery "
                f"{delivery.get('delivery_number')}: {e}"
            )
            break
        except Exception as e:
            last_error = str(e)
            logger.warning(
                f"Zoho push attempt {attempt}/{len(backoff_seconds)} failed for delivery "
                f"{delivery.get('delivery_number')}: {e}"
            )

    # All attempts failed
    await record_sync_failure(
        tenant_id=tenant_id,
        source_type="distributor_delivery",
        source_id=delivery_id,
        source_reference=delivery.get("delivery_number"),
        distributor_id=distributor_id,
        error=last_error or "Unknown error",
        attempts=len(backoff_seconds),
    )
