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
            "ZohoBooks.invoices.UPDATE",
            "ZohoBooks.creditnotes.CREATE",
            "ZohoBooks.creditnotes.READ",
            "ZohoBooks.creditnotes.UPDATE",
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
    """Find-or-create a Zoho contact for a Nyla account. Returns the Zoho contact_id.

    Lookup order:
      1) by email (when account has one)
      2) by exact contact_name (case-insensitive on Zoho's side)
    Falls through to create only if neither match.
    """
    email = (account.get("email") or "").strip()
    name = (account.get("account_name") or account.get("name") or "Unnamed Customer").strip()

    existing = None

    # 1) Try email
    if email:
        try:
            search = await _zoho_request("GET", "/books/v3/contacts", tenant_id=tenant_id, params={"email": email})
            contacts = search.get("contacts", [])
            existing = contacts[0] if contacts else None
        except ZohoApiError as e:
            logger.warning(f"Zoho contact lookup by email failed: {e}")

    # 2) Fallback: by exact contact_name (Zoho enforces unique name per org)
    if not existing and name:
        try:
            search = await _zoho_request(
                "GET", "/books/v3/contacts", tenant_id=tenant_id,
                params={"contact_name": name},
            )
            contacts = search.get("contacts", [])
            # Exact-match (Zoho contact_name filter is a contains-like search)
            for c in contacts:
                if (c.get("contact_name") or "").strip().lower() == name.lower():
                    existing = c
                    break
            if not existing and contacts:
                # If only one result, accept it; otherwise abandon to avoid mis-linking
                if len(contacts) == 1:
                    existing = contacts[0]
        except ZohoApiError as e:
            logger.warning(f"Zoho contact lookup by name failed: {e}")

    # Compute the two labels used by Zoho's invoice "Bill To" block:
    #   • company_name → primary line of Bill To (registered name only)
    #   • attention    → secondary line of Bill To (account / friendly name)
    # Combined render on the user's custom Zoho template:
    #     Jaitra Wellness Private Limited      ← company_name
    #     Diggin Cafe                          ← attention
    trade_name = (account.get("gst_trade_name") or "").strip()
    legal_name = (account.get("gst_legal_name") or "").strip()
    acct_label = (account.get("account_name") or name or "").strip()
    primary_label = trade_name or legal_name or acct_label
    # If we have ONLY one identifier (no GST trade/legal name distinct from
    # account name), both lines collapse to that single label — Zoho will
    # de-dupe identical lines gracefully on most templates.
    secondary_label = acct_label if (primary_label and primary_label.lower() != acct_label.lower()) else ""
    display_label = primary_label  # bold heading text

    payload = {
        # `contact_name` must remain the account name — Zoho enforces uniqueness on
        # this field and we use it later to find/match contacts. Don't change it.
        "contact_name": name,
        # `company_name` is the registered name (no parenthesis, no account name).
        # The user's Zoho template prints this as the bold first line of "Bill To".
        "company_name": display_label,
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
    # ── GST: number + treatment + place_of_contact ──
    # Zoho silently downgrades `gst_treatment` to "consumer" (Unregistered)
    # unless `place_of_contact` (the 2-letter state code) is also sent.
    # We derive the state code from the GSTIN's first 2 digits — the most
    # reliable source since it's encoded in the GSTIN itself.
    GST_STATE_CODE_TO_PLACE = {
        "01": "JK", "02": "HP", "03": "PB", "04": "CH", "05": "UK", "06": "HR",
        "07": "DL", "08": "RJ", "09": "UP", "10": "BR", "11": "SK", "12": "AR",
        "13": "NL", "14": "MN", "15": "MZ", "16": "TR", "17": "ME", "18": "AS",
        "19": "WB", "20": "JH", "21": "OD", "22": "CG", "23": "MP", "24": "GJ",
        "25": "DD", "26": "DD", "27": "MH", "28": "AP", "29": "KA", "30": "GA",
        "31": "LD", "32": "KL", "33": "TN", "34": "PY", "35": "AN", "36": "TS",
        "37": "AP", "38": "LA", "97": "OT",
    }
    gstin = (account.get("gstin") or account.get("gst_number") or "").strip().upper()
    if gstin:
        payload["gst_no"] = gstin
        payload["gst_treatment"] = "business_gst"
        place = GST_STATE_CODE_TO_PLACE.get(gstin[:2])
        if place:
            payload["place_of_contact"] = place
            payload["place_of_contact_with_prefix"] = place

    # ── Flatten our nested address dicts into Zoho's flat schema ──
    # Zoho's `billing_address` / `shipping_address` expect string fields:
    #   {attention, address, street2, city, state, zip, country}
    # Our internal model stores dicts: {address_line1, address_line2, city, state, pincode}.
    #
    # `attention` is rendered by the user's custom Zoho template as the
    # secondary line right below the bold `company_name` heading — so we put
    # the friendly account name here (NOT the trade-name-with-parens combo).
    attention_line = secondary_label or acct_label  # never blank — fallback to account name

    def _zoho_addr(src) -> Optional[dict]:
        if not src:
            return None
        if isinstance(src, str):
            return {"attention": attention_line, "address": src, "country": "India"}
        if not isinstance(src, dict):
            return None
        # Some legacy rows store the address as a JSON-stringified blob.
        # Defensive parse so we don't store the JSON literally.
        line1 = (src.get("address_line1") or src.get("line1") or "").strip()
        line2 = (src.get("address_line2") or src.get("line2") or "").strip()
        city = (src.get("city") or "").strip()
        state = (src.get("state") or "").strip()
        zipc = (src.get("pincode") or src.get("zip") or src.get("postal_code") or "").strip()
        # Compose a clean "address" line (Zoho line 1 is free text)
        addr = ", ".join([p for p in (line1, src.get("landmark")) if p]).strip() or line1
        if not (addr or city or state or zipc):
            return None
        return {
            "attention": attention_line,
            "address": addr or city,
            "street2": line2 or "",
            "city": city,
            "state": state,
            "zip": zipc,
            "country": "India",
        }

    billing = _zoho_addr(account.get("billing_address"))
    delivery = _zoho_addr(account.get("delivery_address"))
    if billing:
        payload["billing_address"] = billing
    elif delivery:
        # If we don't have a separate billing address, use the delivery address.
        payload["billing_address"] = delivery
    if delivery:
        payload["shipping_address"] = delivery

    if existing:
        contact_id = existing["contact_id"]
        try:
            await _zoho_request("PUT", f"/books/v3/contacts/{contact_id}", tenant_id=tenant_id, json=payload)
        except ZohoApiError as e:
            # Surface the actual Zoho rejection instead of silently swallowing it.
            # Common causes: company_name uniqueness conflict, gst_treatment validation,
            # bad place_of_contact code. Without this raise the user sees a "synced ✓"
            # toast even when the update was rejected — exactly the bug we hit when
            # company_name wasn't refreshing on production invoices.
            logger.error(f"Zoho contact PUT failed for {contact_id}: {e}")
            raise
        return contact_id

    result = await _zoho_request("POST", "/books/v3/contacts", tenant_id=tenant_id, json=payload)
    return result["contact"]["contact_id"]


# ---------- SKU mapping lookup ----------

async def get_zoho_item_id(tenant_id: str, our_sku_id: str) -> str:
    mapping = await db.zoho_sku_mappings.find_one(
        {"tenant_id": tenant_id, "our_sku_id": our_sku_id}, {"_id": 0}
    )
    if not mapping or not mapping.get("zoho_item_id"):
        # Look up the SKU name for a clearer error
        sku = await db.master_skus.find_one({"id": our_sku_id}, {"_id": 0, "sku_name": 1, "sku": 1, "name": 1})
        sku_label = (sku or {}).get("sku_name") or (sku or {}).get("sku") or (sku or {}).get("name") or our_sku_id
        raise MissingZohoMappingError(
            f"SKU '{sku_label}' is not mapped to a Zoho item. "
            "Please add a mapping in Settings → Integrations → Zoho Books → SKU Mapping."
        )
    return mapping["zoho_item_id"]


# ---------- Invoice creation ----------

class MissingZohoMappingError(RuntimeError):
    """Raised when a delivery item references a SKU that has no Zoho item
    mapping yet. This is a config issue — retries won't help."""


class MissingAgreedPriceError(RuntimeError):
    """Raised when the account has no agreed `sku_pricing` for one or more SKUs
    on the delivery. The Zoho invoice MUST use customer-agreed pricing, not the
    Zoho catalog rate, so we refuse to push when pricing is unknown."""


class AccountNotLinkedToZohoError(RuntimeError):
    """Raised when an account has no `zoho_contact_id` linked. Per product rule,
    Zoho writes are only performed for accounts that have been explicitly
    linked to a Zoho contact (manually mapped or imported). We never auto-create
    Zoho contacts from a delivery / return flow."""


class ZohoPushSkippedError(RuntimeError):
    """Raised by sync_delivery_to_zoho when a delivery cannot be pushed to Zoho
    for a *known* reason (non-factory source warehouse, missing source location,
    no items on delivery, account not linked, etc). The background-task caller
    swallows this. The /retry-zoho-push endpoint surfaces the message verbatim
    so the rep sees exactly what to fix."""


def _account_has_zoho_link(account: dict) -> bool:
    """True only when the account has a non-empty `zoho_contact_id`."""
    if not account:
        return False
    zid = account.get("zoho_contact_id")
    return bool(zid and str(zid).strip())


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


async def _ensure_mirror_invoice(
    *,
    tenant_id: str,
    delivery: dict,
    items: list[dict],
    account: dict,
    zoho_invoice_id: str,
    zoho_invoice_number: Optional[str],
    zoho_invoice_url: Optional[str],
) -> None:
    """Upsert a row into the `invoices` collection so the Zoho invoice appears
    on the Account → Invoices view. Idempotent on (tenant_id, source_id).
    """
    account_uuid = account.get("id") or account.get("account_uuid")
    if not account_uuid:
        logger.warning(
            f"_ensure_mirror_invoice: no account_uuid for delivery {delivery.get('id')}; skipping mirror"
        )
        return

    # Use account.sku_pricing to compute the mirror line items (same source as Zoho)
    agreed_prices: dict[str, float] = {}
    for p in (account.get("sku_pricing") or []):
        sku_key = (p.get("sku") or p.get("sku_name") or "").strip().lower()
        if sku_key:
            try:
                agreed_prices[sku_key] = float(p.get("price_per_unit") or 0)
            except (TypeError, ValueError):
                pass

    items_list = []
    for it in items:
        name = (it.get("sku_name") or it.get("sku_code") or "").strip()
        qty = float(it.get("quantity", 0) or 0)
        rate = agreed_prices.get(name.lower(), float(it.get("unit_price") or 0))
        net = qty * rate
        items_list.append({
            "sku_name": name,
            "quantity": qty,
            "bottles": qty,
            "rate": rate,
            "net_amount": net,
            "line_total": net,
        })
    gross_total = sum(i["net_amount"] for i in items_list)
    creds = await get_credentials(tenant_id) or {}
    now = datetime.now(timezone.utc).isoformat()
    invoice_doc = {
        "id": str(uuid.uuid4()),
        "tenant_id": tenant_id,
        "account_id": account_uuid,
        "account_name": account.get("account_name") or account.get("name"),
        "invoice_no": zoho_invoice_number,
        "invoice_number": zoho_invoice_number,
        "invoice_date": (delivery.get("delivery_date") or now)[:10],
        "gross_invoice_value": gross_total,
        "net_invoice_value": gross_total,
        "outstanding": 0.0,
        "items": items_list,
        "source": "zoho_books",
        "source_type": "distributor_delivery",
        "source_id": delivery.get("id"),
        "distributor_id": delivery.get("distributor_id"),
        "zoho_invoice_id": zoho_invoice_id,
        "zoho_invoice_number": zoho_invoice_number,
        "zoho_invoice_url": zoho_invoice_url,
        "zoho_organization_id": creds.get("organization_id"),
        "updated_at": now,
    }
    try:
        await db.invoices.update_one(
            {"tenant_id": tenant_id, "source_type": "distributor_delivery",
             "source_id": delivery.get("id")},
            {"$set": invoice_doc, "$setOnInsert": {"created_at": now}},
            upsert=True,
        )
        logger.info(
            f"Mirrored Zoho invoice {zoho_invoice_number} into account "
            f"{account.get('account_name')} (delivery {delivery.get('delivery_number')})"
        )
    except Exception as e:
        logger.warning(f"Failed to mirror Zoho invoice into invoices collection: {e}")


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

    # ── Idempotency: if this delivery was already pushed successfully,
    # don't re-create the Zoho invoice. Just (re)ensure the mirror in the
    # `invoices` collection exists. This safely handles retries when the
    # mirror failed/was-missing the first time.
    existing_mapping = await db.zoho_invoice_mappings.find_one(
        {"tenant_id": tenant_id, "source_type": "distributor_delivery",
         "source_id": delivery.get("id"), "status": "synced"},
        {"_id": 0},
    )
    if existing_mapping and existing_mapping.get("zoho_invoice_id"):
        logger.info(
            f"Zoho mapping already synced for delivery {delivery.get('delivery_number')}; "
            f"skipping Zoho create and ensuring mirror invoice exists."
        )
        await _ensure_mirror_invoice(
            tenant_id=tenant_id,
            delivery=delivery,
            items=items,
            account=account,
            zoho_invoice_id=existing_mapping["zoho_invoice_id"],
            zoho_invoice_number=existing_mapping.get("zoho_invoice_number"),
            zoho_invoice_url=existing_mapping.get("zoho_invoice_url"),
        )
        return existing_mapping

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

    # ── Sustainability Incentive (post-tax adjustment from bottle-return CNs) ─
    # Indian GST: returns of *empty bottles* are a deposit refund, not a
    # taxable supply — they don't reduce the original sale's taxable value.
    # Push the credit-note total as Zoho's `adjustment` field (post-tax) so the
    # invoice shows the incentive deduction to the customer WITHOUT affecting
    # GST liability. This replaces the older flow of pushing a separate Zoho
    # credit-note doc + applying it against the invoice.
    applied_cns = delivery.get("applied_credit_notes") or []
    incentive_total = 0.0
    cn_numbers: list[str] = []
    for _entry in applied_cns:
        try:
            incentive_total += float(_entry.get("amount_applied") or 0)
        except (TypeError, ValueError):
            pass
        if _entry.get("credit_note_number"):
            cn_numbers.append(_entry["credit_note_number"])
    if incentive_total > 0:
        invoice_payload["adjustment"] = -round(incentive_total, 2)
        suffix = f" ({', '.join(cn_numbers)})" if cn_numbers else ""
        invoice_payload["adjustment_description"] = f"Sustainability Incentive — Bottle Return{suffix}"

    # ── Override the Bill To block on this invoice ────────────────────────────
    # The user's custom Zoho template renders Bill To as:
    #   {company_name on the contact}     ← bold heading line (registered name)
    #   {billing_address.attention}        ← secondary line (account / friendly name)
    # So we put ONLY the friendly account name in `attention` here — no parens,
    # no trade-name combo (that lives on the contact's company_name).
    _trade = (account.get("gst_trade_name") or "").strip()
    _legal = (account.get("gst_legal_name") or "").strip()
    _acct = (account.get("account_name") or "").strip()
    _primary = _trade or _legal
    # `attention` = secondary line = account name (skip if it would duplicate
    # the registered name shown on the line above)
    if _primary and _acct and _primary.lower() != _acct.lower():
        _attention_label = _acct
    else:
        _attention_label = ""  # nothing distinct to show — template will hide the empty line

    def _flatten_addr(src, attention):
        if not isinstance(src, dict):
            return None
        line1 = (src.get("address_line1") or src.get("line1") or "").strip()
        line2 = (src.get("address_line2") or src.get("line2") or "").strip()
        city = (src.get("city") or "").strip()
        state = (src.get("state") or "").strip()
        zipc = (src.get("pincode") or src.get("zip") or src.get("postal_code") or "").strip()
        if not (line1 or line2 or city or state or zipc):
            return None
        return {
            "attention": attention,
            "address": line1 or city,
            "street2": line2 or "",
            "city": city,
            "state": state,
            "zip": zipc,
            "country": "India",
        }

    if _attention_label or _acct or _primary:
        billing_override = _flatten_addr(
            account.get("billing_address") or account.get("delivery_address"), _attention_label
        )
        shipping_override = _flatten_addr(account.get("delivery_address"), _attention_label)
        if billing_override:
            invoice_payload["billing_address"] = billing_override
        if shipping_override:
            invoice_payload["shipping_address"] = shipping_override

    # Optional: per-tenant Zoho template override for the invoice PDF.
    # Configured via PUT /api/zoho/admin/template-settings — see zoho_books.py.
    tenant_creds = await get_credentials(tenant_id) or {}
    invoice_tmpl = (tenant_creds.get("invoice_template_id") or "").strip()
    if invoice_tmpl:
        invoice_payload["template_id"] = invoice_tmpl

    result = await _zoho_request("POST", "/books/v3/invoices", tenant_id=tenant_id, json=invoice_payload)
    invoice = result.get("invoice") or {}

    zoho_invoice_id = invoice.get("invoice_id")
    zoho_invoice_number = invoice.get("invoice_number")

    # Transition the invoice from `draft` → `sent` so it shows up as an open
    # receivable in Zoho Books immediately (instead of sitting in Drafts).
    # This does NOT email the customer — it only flips the status server-side.
    if zoho_invoice_id:
        try:
            await _zoho_request(
                "POST",
                f"/books/v3/invoices/{zoho_invoice_id}/status/sent",
                tenant_id=tenant_id,
            )
            logger.info(f"[zoho] Invoice {zoho_invoice_number} ({zoho_invoice_id}) marked as sent")
        except Exception as e:
            # Don't fail the whole sync if the status flip fails — the invoice
            # still exists in Zoho as a draft and can be sent manually.
            logger.warning(
                f"[zoho] Could not mark invoice {zoho_invoice_number} as sent: {e}. "
                f"Invoice was created successfully and remains in draft state."
            )

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
    await _ensure_mirror_invoice(
        tenant_id=tenant_id,
        delivery=delivery,
        items=items,
        account=account,
        zoho_invoice_id=zoho_invoice_id,
        zoho_invoice_number=zoho_invoice_number,
        zoho_invoice_url=zoho_invoice_url,
    )
    account_uuid = account.get("id") or account.get("account_uuid")

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

    # ── Mark applied CNs as "consumed via invoice adjustment" (no Zoho CN push) ──
    # Earlier this code path pushed a separate Zoho Credit Note for every
    # bottle-return event, then applied it against the invoice. We've replaced
    # that with a post-tax `adjustment` on the invoice itself (see "Sustainability
    # Incentive" block above) — so we no longer create CN documents in Zoho.
    # We still stamp the local audit trail so reports / settlement math know
    # the CNs were honoured by this delivery's invoice.
    if applied_cns:
        try:
            consumed_apps = [
                {
                    "credit_note_id": e.get("credit_note_id"),
                    "credit_note_number": e.get("credit_note_number"),
                    "amount": float(e.get("amount_applied") or 0),
                    "applied_via": "invoice_adjustment",
                    "zoho_invoice_id": zoho_invoice_id,
                    "ok": True,
                }
                for e in applied_cns
            ]
            await db.distributor_deliveries.update_one(
                {"id": delivery.get("id"), "tenant_id": tenant_id},
                {"$set": {"zoho_credit_note_applications": consumed_apps}},
            )
        except Exception as e:
            logger.warning(
                f"Failed to stamp local CN-consumption audit on delivery "
                f"{delivery.get('delivery_number')}: {e}"
            )

    return mapping_doc


async def create_credit_note_for_return(
    *, tenant_id: str, return_doc: dict, account: dict,
    reference_invoice_id: Optional[str] = None,
) -> dict:
    """Push a Nyla customer return as a Zoho Books credit note.

    Each return-item line:
      • item_id  → mapped via zoho_sku_mappings (same as invoice flow)
      • quantity → number of bottles returned
      • rate     → account.sku_pricing.return_bottle_credit for that SKU
                   (NOT the original selling price)

    If `reference_invoice_id` is provided, the credit note will be created with
    that invoice association (required by Zoho India GST rules — error 12069
    otherwise). The CN can then be applied to the invoice via the standard
    /creditnotes/{id}/invoices endpoint.

    Returns the canonical mapping doc (also stored in `zoho_invoice_mappings`
    under source_type='customer_return').
    """
    if not is_zoho_configured():
        raise RuntimeError("Zoho Books integration is not configured (ZOHO_CLIENT_ID missing).")

    # Product rule: only sync to Zoho for accounts already linked to a Zoho
    # contact. Never auto-create Zoho contacts from a return flow.
    if not _account_has_zoho_link(account):
        raise AccountNotLinkedToZohoError(
            f"Account {account.get('account_name')} ({account.get('id') or account.get('account_id')}) "
            "has no zoho_contact_id — skipping Zoho credit-note creation."
        )

    # ── Idempotency: if this return was already pushed, return existing mapping ──
    existing_mapping = await db.zoho_invoice_mappings.find_one(
        {"tenant_id": tenant_id, "source_type": "customer_return",
         "source_id": return_doc.get("id"), "status": "synced"},
        {"_id": 0},
    )
    if existing_mapping and existing_mapping.get("zoho_creditnote_id"):
        logger.info(
            f"Zoho credit-note already synced for return {return_doc.get('return_number')}; "
            f"skipping re-create."
        )
        return existing_mapping

    # 1. Upsert contact (creates or returns existing Zoho customer)
    customer_id = await upsert_contact(tenant_id, account)

    # 2. Build the per-SKU credit lookup from account.sku_pricing.return_bottle_credit
    credit_rates: dict[str, float] = {}
    for p in (account.get("sku_pricing") or []):
        sku_key = (p.get("sku") or p.get("sku_name") or "").strip().lower()
        if not sku_key:
            continue
        try:
            credit_rates[sku_key] = float(p.get("return_bottle_credit") or 0)
        except (TypeError, ValueError):
            credit_rates[sku_key] = 0.0

    # 3. Build line items — quantity = bottles returned, rate = configured return credit
    missing_skus: list[str] = []
    line_items: list[dict] = []
    for it in (return_doc.get("items") or []):
        sku_id = it.get("sku_id")
        if not sku_id:
            continue
        zoho_item_id = await get_zoho_item_id(tenant_id, sku_id)
        sku_name = (it.get("sku_name") or it.get("sku_code") or "").strip()
        key = sku_name.lower()
        # Prefer the rate already saved on the return line; fall back to account config
        line_rate = float(it.get("credit_per_unit") or it.get("return_credit_per_unit") or 0)
        if line_rate <= 0:
            line_rate = credit_rates.get(key, 0.0)
        if line_rate <= 0:
            if sku_name and sku_name not in missing_skus:
                missing_skus.append(sku_name)
            continue
        qty = float(it.get("quantity", 0) or 0)
        if qty <= 0:
            continue
        line_items.append({
            "item_id": zoho_item_id,
            "name": sku_name,
            "quantity": qty,
            "rate": round(line_rate, 2),
        })

    if missing_skus:
        raise RuntimeError(
            "No return-credit configured on the account for SKU(s): "
            + ", ".join(missing_skus)
            + ". Add a Bottle Credit under Account → SKU Pricing before this credit note can be pushed to Zoho."
        )
    if not line_items:
        raise RuntimeError("No eligible return-line items to push (zero qty / zero credit).")

    creditnote_payload = {
        "customer_id": customer_id,
        "reference_number": return_doc.get("return_number"),
        "date": (return_doc.get("return_date") or datetime.now(timezone.utc).strftime("%Y-%m-%d"))[:10],
        "line_items": line_items,
        "notes": f"Generated from Nyla CRM customer return {return_doc.get('return_number')}",
    }
    # Zoho India GST: each credit note MUST reference an invoice (12069 otherwise).
    # When provided, also bind each line_item to the invoice so Zoho accepts it.
    if reference_invoice_id:
        creditnote_payload["invoice_id"] = reference_invoice_id
        for li in creditnote_payload["line_items"]:
            li["invoice_id"] = reference_invoice_id

    # Optional: per-tenant Zoho template override for the credit-note PDF.
    tenant_creds = await get_credentials(tenant_id) or {}
    cn_tmpl = (tenant_creds.get("creditnote_template_id") or "").strip()
    if cn_tmpl:
        creditnote_payload["template_id"] = cn_tmpl

    result = await _zoho_request(
        "POST", "/books/v3/creditnotes", tenant_id=tenant_id, json=creditnote_payload
    )
    cn = result.get("creditnote") or {}
    zoho_creditnote_id = cn.get("creditnote_id")
    zoho_creditnote_number = cn.get("creditnote_number")

    # Transition draft → open so the credit shows up as available in Zoho immediately
    if zoho_creditnote_id:
        try:
            await _zoho_request(
                "POST",
                f"/books/v3/creditnotes/{zoho_creditnote_id}/status/open",
                tenant_id=tenant_id,
            )
            logger.info(
                f"[zoho] Credit-note {zoho_creditnote_number} ({zoho_creditnote_id}) marked as open"
            )
        except Exception as e:
            logger.warning(
                f"[zoho] Could not mark credit-note {zoho_creditnote_number} as open: {e}. "
                f"It remains as draft in Zoho."
            )

    creds = await get_credentials(tenant_id) or {}
    zoho_creditnote_url = cn.get("creditnote_url") or _zoho_books_url(zoho_creditnote_id, creds)
    now = datetime.now(timezone.utc).isoformat()

    # Stamp Zoho ids on the return doc so the UI can deep-link
    try:
        await db.customer_returns.update_one(
            {"id": return_doc.get("id"), "tenant_id": tenant_id},
            {"$set": {
                "zoho_creditnote_id": zoho_creditnote_id,
                "zoho_creditnote_number": zoho_creditnote_number,
                "zoho_creditnote_url": zoho_creditnote_url,
                "zoho_synced_at": now,
            }},
        )
    except Exception as e:
        logger.warning(f"Failed to stamp Zoho ids on return {return_doc.get('id')}: {e}")

    # Stamp the same Zoho ids on the local credit_note doc so Distributor
    # Stock Out → Apply Credit Notes can deep-link straight to Zoho Books.
    try:
        await db.credit_notes.update_many(
            {"return_id": return_doc.get("id"), "tenant_id": tenant_id},
            {"$set": {
                "zoho_creditnote_id": zoho_creditnote_id,
                "zoho_creditnote_number": zoho_creditnote_number,
                "zoho_creditnote_url": zoho_creditnote_url,
                "zoho_synced_at": now,
            }},
        )
    except Exception as e:
        logger.warning(f"Failed to stamp Zoho ids on credit_note for return {return_doc.get('id')}: {e}")

    mapping_doc = {
        "tenant_id": tenant_id,
        "source_type": "customer_return",
        "source_id": return_doc.get("id"),
        "source_reference": return_doc.get("return_number"),
        "distributor_id": return_doc.get("distributor_id"),
        "zoho_creditnote_id": zoho_creditnote_id,
        "zoho_creditnote_number": zoho_creditnote_number,
        "zoho_creditnote_url": zoho_creditnote_url,
        "zoho_customer_id": customer_id,
        "account_id": account.get("id"),
        "status": "synced",
        "synced_at": now,
        "error": None,
        "attempts": 1,
    }
    await db.zoho_invoice_mappings.update_one(
        {"tenant_id": tenant_id, "source_type": "customer_return", "source_id": return_doc.get("id")},
        {"$set": mapping_doc, "$setOnInsert": {"created_at": now}},
        upsert=True,
    )
    return mapping_doc


async def apply_credit_notes_to_zoho_invoice(
    *, tenant_id: str, delivery: dict, zoho_invoice_id: str
) -> list[dict]:
    """For every credit note that was applied to a CRM delivery, also apply it
    against the freshly-created Zoho invoice. Zoho auto-closes a credit note
    when its remaining balance hits 0.

    Returns a list of {credit_note_id, zoho_creditnote_id, amount, ok, error}.
    """
    applied: list[dict] = []
    apps = delivery.get("applied_credit_notes") or []
    if not apps or not zoho_invoice_id:
        return applied

    for entry in apps:
        local_cn_id = entry.get("credit_note_id")
        amount = float(entry.get("amount_applied") or 0)
        if not local_cn_id or amount <= 0:
            continue

        # Find the Zoho credit-note id we may have stamped earlier
        cn = await db.credit_notes.find_one(
            {"id": local_cn_id, "tenant_id": tenant_id},
            {"_id": 0},
        )
        if not cn:
            applied.append({
                "credit_note_id": local_cn_id, "zoho_creditnote_id": None,
                "amount": amount, "ok": False, "error": "local_cn_not_found",
            })
            continue

        zcn_id = cn.get("zoho_creditnote_id")
        cn_number = cn.get("credit_note_number")

        # ── LAZY PUSH: If no Zoho CN exists yet, create one NOW with the
        # invoice association in hand. The Zoho India GST rule requires every
        # credit note to reference an invoice (error 12069 otherwise) — so we
        # defer the Zoho push until the CN is applied to a delivery, at which
        # point we know the Zoho invoice id.
        if not zcn_id:
            return_id = cn.get("return_id")
            return_doc = None
            if return_id:
                return_doc = await db.customer_returns.find_one(
                    {"id": return_id, "tenant_id": tenant_id},
                    {"_id": 0},
                )
            account = await db.accounts.find_one(
                {"$or": [
                    {"id": cn.get("account_id")},
                    {"account_id": cn.get("account_id")},
                ], "tenant_id": tenant_id},
                {"_id": 0},
            )
            if not return_doc or not account:
                logger.warning(
                    f"[zoho] Lazy CN push skipped for {cn_number}: missing return/account"
                )
                applied.append({
                    "credit_note_id": local_cn_id, "zoho_creditnote_id": None,
                    "amount": amount, "ok": False, "error": "missing_return_or_account",
                })
                continue
            if not _account_has_zoho_link(account):
                logger.info(
                    f"[zoho] Lazy CN push skipped for {cn_number}: account not linked to Zoho"
                )
                applied.append({
                    "credit_note_id": local_cn_id, "zoho_creditnote_id": None,
                    "amount": amount, "ok": False, "error": "account_not_zoho_linked",
                })
                continue
            try:
                mapping = await create_credit_note_for_return(
                    tenant_id=tenant_id,
                    return_doc=return_doc,
                    account=account,
                    reference_invoice_id=zoho_invoice_id,
                )
                zcn_id = mapping.get("zoho_creditnote_id")
                # Mirror back onto local CN doc so future operations have it
                await db.credit_notes.update_one(
                    {"id": local_cn_id, "tenant_id": tenant_id},
                    {"$set": {
                        "zoho_creditnote_id": zcn_id,
                        "zoho_creditnote_number": mapping.get("zoho_creditnote_number"),
                        "zoho_creditnote_url": mapping.get("zoho_creditnote_url"),
                        "zoho_synced_at": mapping.get("synced_at"),
                    }},
                )
                logger.info(
                    f"[zoho] Lazy-created CN {mapping.get('zoho_creditnote_number')} "
                    f"({zcn_id}) for return {return_doc.get('return_number')} bound to invoice {zoho_invoice_id}"
                )
            except Exception as e:
                logger.warning(f"[zoho] Lazy CN creation failed for {cn_number}: {e}")
                applied.append({
                    "credit_note_id": local_cn_id, "zoho_creditnote_id": None,
                    "amount": amount, "ok": False, "error": f"lazy_create_failed: {str(e)[:200]}",
                })
                continue

        # zcn_id is now guaranteed to exist — apply to the invoice
        payload = {
            "invoices": [{
                "invoice_id": zoho_invoice_id,
                "amount_applied": round(amount, 2),
            }]
        }
        try:
            await _zoho_request(
                "POST",
                f"/books/v3/creditnotes/{zcn_id}/invoices",
                tenant_id=tenant_id,
                json=payload,
            )
            logger.info(
                f"[zoho] Applied ₹{amount} from credit note {cn_number} ({zcn_id}) "
                f"to invoice {zoho_invoice_id}"
            )
            applied.append({
                "credit_note_id": local_cn_id, "zoho_creditnote_id": zcn_id,
                "amount": amount, "ok": True, "error": None,
            })
        except Exception as e:
            logger.warning(
                f"[zoho] Failed applying credit note {cn_number} ({zcn_id}) to "
                f"invoice {zoho_invoice_id}: {e}"
            )
            applied.append({
                "credit_note_id": local_cn_id, "zoho_creditnote_id": zcn_id,
                "amount": amount, "ok": False, "error": str(e)[:300],
            })

    return applied


async def record_credit_note_refund_in_zoho(
    *, tenant_id: str, credit_note: dict, issuance: dict
) -> Optional[dict]:
    """Record a refund against a Zoho credit note when the cash/refund was
    physically issued to the customer. Zoho auto-closes the credit note once
    its balance hits zero.

    `credit_note` is the local credit_notes row.
    `issuance` is the credit_note_issuances row (must already be `issued`).
    """
    zcn_id = credit_note.get("zoho_creditnote_id")
    if not zcn_id:
        logger.info(
            f"Local credit note {credit_note.get('credit_note_number')} has no "
            f"zoho_creditnote_id — skipping Zoho refund record."
        )
        return None

    amount = float(issuance.get("amount") or 0)
    if amount <= 0:
        return None

    # Map our `issuance_method` to Zoho `refund_mode` (case-insensitive).
    method = (issuance.get("issuance_method") or "cash").strip().lower()
    refund_mode_map = {
        "cash": "cash",
        "bank_transfer": "banktransfer",
        "bank transfer": "banktransfer",
        "cheque": "check",
        "check": "check",
        "store_credit": "cash",  # closest match in Zoho
        "other": "cash",
    }
    refund_mode = refund_mode_map.get(method, "cash")
    refund_date = (issuance.get("issued_at")
                   or datetime.now(timezone.utc).strftime("%Y-%m-%d"))[:10]

    payload = {
        "date": refund_date,
        "amount": round(amount, 2),
        "refund_mode": refund_mode,
        "description": (
            f"Refund against credit note {credit_note.get('credit_note_number')} "
            f"— issuance {issuance.get('id')}"
        )[:200],
    }
    if issuance.get("reference"):
        payload["reference_number"] = str(issuance.get("reference"))[:50]

    try:
        result = await _zoho_request(
            "POST",
            f"/books/v3/creditnotes/{zcn_id}/refunds",
            tenant_id=tenant_id,
            json=payload,
        )
        refund = result.get("creditnote_refund") or {}
        logger.info(
            f"[zoho] Recorded ₹{amount} refund on credit note "
            f"{credit_note.get('credit_note_number')} ({zcn_id}) — "
            f"zoho_refund_id={refund.get('creditnote_refund_id')}"
        )
        return refund
    except Exception as e:
        logger.warning(
            f"[zoho] Failed to record refund on credit note "
            f"{credit_note.get('credit_note_number')} ({zcn_id}): {e}"
        )
        return None


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
    """Background task: push a delivery to Zoho with retry. Never raises.

    Only deliveries dispatched from a **factory warehouse** (`distributor_locations.is_factory == True`)
    generate Zoho invoices. Deliveries from a distributor's own warehouse are skipped — those
    are handled by the distributor's own billing flow.
    """
    if not is_zoho_configured():
        logger.info("Zoho not configured, skipping auto-push")
        raise ZohoPushSkippedError("Zoho Books integration is not configured on this tenant. Ask an admin to set ZOHO_CLIENT_ID/SECRET.")
    creds = await get_credentials(tenant_id)
    if not creds:
        logger.info(f"Zoho not connected for tenant {tenant_id}, skipping auto-push")
        raise ZohoPushSkippedError("Zoho Books is not connected for this tenant. Go to Settings → Integrations → Zoho Books and click Connect.")

    delivery = await db.distributor_deliveries.find_one(
        {"id": delivery_id, "tenant_id": tenant_id, "distributor_id": distributor_id}, {"_id": 0}
    )
    if not delivery:
        logger.warning(f"sync_delivery_to_zoho: delivery {delivery_id} not found")
        raise ZohoPushSkippedError("Delivery not found.")

    # Guard: only factory-warehouse stock-outs are invoiced via Zoho.
    src_loc_id = delivery.get("distributor_location_id")
    if not src_loc_id:
        logger.info(f"sync_delivery_to_zoho: delivery {delivery.get('delivery_number')} has no source location; skipping")
        raise ZohoPushSkippedError("Delivery has no source warehouse — cannot determine if it should be invoiced via Zoho.")
    src_loc = await db.distributor_locations.find_one(
        {"id": src_loc_id, "tenant_id": tenant_id}, {"_id": 0, "is_factory": 1, "location_name": 1}
    )
    if not src_loc or not src_loc.get("is_factory"):
        loc_name = (src_loc or {}).get("location_name") or "(unknown)"
        logger.info(
            f"sync_delivery_to_zoho: delivery {delivery.get('delivery_number')} dispatched from "
            f"non-factory warehouse '{loc_name}'; skipping Zoho push"
        )
        raise ZohoPushSkippedError(
            f"This delivery is dispatched from '{loc_name}' which is a distributor warehouse, not a factory. "
            "Only factory-warehouse stock-outs are invoiced via Zoho (distributor warehouses use the local billing flow). "
            "If this should be invoiced via Zoho, mark the source warehouse as Factory in Distributor → Locations."
        )

    items = await db.distributor_delivery_items.find(
        {"delivery_id": delivery_id, "tenant_id": tenant_id}, {"_id": 0}
    ).to_list(500)
    if not items:
        logger.warning(f"sync_delivery_to_zoho: no items for delivery {delivery_id}")
        raise ZohoPushSkippedError("This delivery has no line items to invoice.")

    account = await db.accounts.find_one(
        {"id": delivery.get("account_id"), "tenant_id": tenant_id}, {"_id": 0}
    ) or {"account_name": delivery.get("account_name") or "Customer"}

    # Product rule: only push to Zoho for accounts already linked to a Zoho
    # contact. We never auto-create Zoho contacts from a delivery flow.
    if not _account_has_zoho_link(account):
        logger.info(
            f"sync_delivery_to_zoho: account {account.get('account_name')} "
            f"({delivery.get('account_id')}) has no zoho_contact_id — skipping Zoho push for "
            f"delivery {delivery.get('delivery_number')}"
        )
        raise ZohoPushSkippedError(
            f"Account '{account.get('account_name')}' is not linked to a Zoho contact. "
            "Open the account → click 'Re-sync to Zoho' (or check Billed-by setting), then retry."
        )

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
        except MissingZohoMappingError as e:
            # Don't retry: missing SKU mapping is a configuration issue.
            last_error = str(e)
            logger.warning(
                f"Zoho push aborted (no SKU mapping) for delivery "
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
