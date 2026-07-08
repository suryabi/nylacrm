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
            # Delivery challans — used for promotional stock-outs & inter-branch
            # transfers. DELETE is required for the "Reverse → cleanup" flow.
            # Without these scopes Zoho returns 401 code 57 ("not authorized").
            "ZohoBooks.deliverychallans.CREATE",
            "ZohoBooks.deliverychallans.READ",
            "ZohoBooks.deliverychallans.UPDATE",
            "ZohoBooks.deliverychallans.DELETE",
            "ZohoBooks.items.READ",
            "ZohoBooks.settings.READ",
            # settings.UPDATE lets us push a warehouse's full address into its
            # mapped Zoho Branch so the printed challan/invoice header (the
            # "From" address) shows the dispatching warehouse, not just the state.
            "ZohoBooks.settings.UPDATE",
            # Banking — used by the Accounting Transactions inbox to pull the
            # connected bank-feed lines for tagging. Without this scope Zoho
            # returns 401 code 57 ("not authorized") on /banktransactions.
            "ZohoBooks.banking.READ",
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
        self.message = message
        self.payload = payload or {}


def _flatten_strs(d, prefix=""):
    """Yield (dotted_path, value) for every string in a (possibly nested) dict.
    Used to surface field lengths in user-facing Zoho errors."""
    if isinstance(d, dict):
        for k, v in d.items():
            yield from _flatten_strs(v, f"{prefix}{k}.")
    elif isinstance(d, str):
        yield (prefix.rstrip("."), d)


# Zoho Books rejects address subfields (address / street2 / attention / city /
# state / zip) with "… has less than 100 characters" when they reach 100, so the
# safe ceiling is 99. Clip to 99 everywhere we build a Zoho address.
ZOHO_ADDR_MAX = 99


def _zoho_clip(s, n: int = ZOHO_ADDR_MAX) -> str:
    if not s:
        return ""
    return str(s).strip()[:n]


def _is_zoho_address_length_error(e: "ZohoApiError") -> bool:
    """True when Zoho rejects a create payload because an inline billing/shipping
    address field is (claimed to be) >= 100 chars — Zoho error code 15
    ("Please ensure that the \"shipping_address\" has less than 100 characters.").

    Zoho can raise this for inline addresses even when each sub-field is well
    under the limit, so the only reliable recovery is to retry the create
    WITHOUT the inline address block. The recipient is still captured in the
    challan `notes`, so nothing is lost on the printed document."""
    if e.status_code != 400:
        return False
    payload = e.payload or {}
    code = payload.get("code")
    msg = (payload.get("message") or e.message or "").lower()
    return code == 15 and "address" in msg and "100 char" in msg


def _zoho_shipping_address(*, attention: str = "", address: str = "", street2: str = "",
                           city: str = "", state: str = "", zip: str = "",
                           country: str = "India", phone: str = "") -> dict:
    """Build a Zoho-safe shipping/billing address dict: every field clipped to
    <100 chars, with any `address` overflow pushed into `street2` so the full
    address still prints on the challan."""
    attention = (attention or "").strip()
    addr_full = (address or "").strip()
    # Avoid the "outlet name printed twice" rendering the user reported: when the
    # address line redundantly repeats the recipient/attention name, strip that
    # leading duplicate (it's already shown on the attention line). This also
    # shortens the address so it stays comfortably under Zoho's 100-char ceiling.
    if attention and addr_full.lower().startswith(attention.lower()):
        deduped = addr_full[len(attention):].lstrip(" ,-–—").strip()
        if deduped:
            addr_full = deduped
    addr = _zoho_clip(addr_full)
    overflow = addr_full[ZOHO_ADDR_MAX:].strip() if len(addr_full) > ZOHO_ADDR_MAX else ""
    street2_combined = ", ".join([p for p in (overflow, (street2 or "").strip()) if p])
    out = {
        "attention": _zoho_clip(attention),
        "address": addr,
        "street2": _zoho_clip(street2_combined),
        "country": country or "India",
    }
    if city:
        out["city"] = _zoho_clip(city)
    if state:
        out["state"] = _zoho_clip(state)
    if zip:
        out["zip"] = _zoho_clip(zip)
    if phone:
        out["phone"] = _zoho_clip(phone, 50)
    return out


async def _post_deliverychallan_resilient(tenant_id: str, payload: dict, ref: Optional[str] = None) -> dict:
    """POST a delivery challan to Zoho, recovering from the spurious code-15
    "shipping_address has less than 100 characters" rejection.

    Zoho intermittently rejects an inline `shipping_address` (and/or
    `billing_address`) on create even when every sub-field is under the limit.
    When that happens we retry the create WITHOUT the inline address block — the
    recipient is already fully described in the challan `notes`, so the printed
    document remains self-describing and the sync no longer hard-fails."""
    try:
        return await _zoho_request("POST", "/books/v3/deliverychallans", tenant_id=tenant_id, json=payload)
    except ZohoApiError as e:
        if _is_zoho_address_length_error(e) and ("shipping_address" in payload or "billing_address" in payload):
            logger.warning(
                f"Zoho rejected inline address (code 15) for delivery challan "
                f"{ref or '(no ref)'}; retrying without the inline address block "
                f"(recipient is preserved in notes). Original error: {e.message}"
            )
            retry_payload = {k: v for k, v in payload.items() if k not in ("shipping_address", "billing_address")}
            return await _zoho_request("POST", "/books/v3/deliverychallans", tenant_id=tenant_id, json=retry_payload)
        raise


async def _set_deliverychallan_shipping_address(tenant_id: str, challan_id: str, addr: dict, ref: Optional[str] = None) -> bool:
    """Set the *Deliver To* (shipping) address on an existing Zoho delivery
    challan via the dedicated endpoint:
        PUT /books/v3/deliverychallans/{id}/address/shipping

    This is done as a post-create step (not inline on the create payload)
    because Zoho rejects an inline `shipping_address` on create with the
    spurious code-15 "less than 100 characters" error. The dedicated address
    endpoint accepts the structured fields reliably and renders the recipient
    (lead / contact / employee) in the printed challan's Deliver-To block.

    Best-effort: a failure is logged but does NOT fail the sync (the recipient
    is also captured in the challan `notes`)."""
    if not challan_id or not addr:
        return False
    body = {k: v for k, v in {
        "attention": addr.get("attention"),
        "address": addr.get("address"),
        "street2": addr.get("street2"),
        "city": addr.get("city"),
        "state": addr.get("state"),
        "zip": addr.get("zip"),
        "country": addr.get("country") or "India",
        "phone": addr.get("phone"),
    }.items() if v}
    # Need at least a street/city for a meaningful Deliver-To.
    if not (body.get("address") or body.get("city")):
        return False
    try:
        await _zoho_request(
            "PUT",
            f"/books/v3/deliverychallans/{challan_id}/address/shipping",
            tenant_id=tenant_id,
            json=body,
        )
        logger.info(f"Set Deliver-To shipping address on challan {ref or challan_id}")
        return True
    except ZohoApiError as e:
        logger.warning(
            f"Could not set Deliver-To shipping address on challan {ref or challan_id}: {e.message}"
        )
        return False




async def _zoho_request(
    method: str,
    path: str,
    *,
    tenant_id: str,
    json: Optional[dict] = None,
    params: Optional[dict] = None,
    max_attempts: int = 3,
    timeout: float = 20.0,
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
            async with httpx.AsyncClient(timeout=timeout) as client:
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


async def get_contact_statement_pdf(tenant_id: str, contact_id: str, params: Optional[dict] = None) -> bytes:
    """Fetch a customer's Statement of Accounts as a PDF, live from Zoho Books.

    Uses GET /books/v3/contacts/{contact_id}/statement with `accept=pdf`. Returns
    the raw PDF bytes. Retries once on a 401 (expired token)."""
    cfg = get_zoho_config()
    creds = await get_credentials(tenant_id)
    if not creds:
        raise RuntimeError("Zoho Books is not connected for this tenant")
    api_base = (creds.get("api_base_url") or cfg["api_base_url"]).rstrip("/")
    url = f"{api_base}/books/v3/contacts/{contact_id}/statement"
    req_params = dict(params or {})
    req_params["organization_id"] = creds["organization_id"]
    req_params["accept"] = "pdf"
    # Zoho requires start_date & end_date for the statement. Default to the
    # current India financial year (Apr 1 → today) when the caller omits them.
    if not req_params.get("start_date") or not req_params.get("end_date"):
        today = datetime.now(timezone.utc).date()
        fy_start_year = today.year if today.month >= 4 else today.year - 1
        req_params.setdefault("start_date", f"{fy_start_year}-04-01")
        req_params.setdefault("end_date", today.isoformat())

    for attempt in range(2):
        token = await get_valid_access_token(tenant_id)
        headers = {
            "Authorization": f"Zoho-oauthtoken {token}",
            "Accept": "application/pdf",
        }
        try:
            async with httpx.AsyncClient(timeout=httpx.Timeout(20.0, connect=10.0), follow_redirects=True) as client:
                resp = await client.get(url, headers=headers, params=req_params)
        except httpx.TimeoutException:
            logger.error("Zoho statement request timed out for tenant=%s contact=%s", tenant_id, contact_id)
            raise ZohoApiError(504, "Zoho Books took too long to return this statement. Please try again in a moment.")
        except httpx.HTTPError as e:
            logger.error("Zoho statement request network error: %s", e)
            raise ZohoApiError(502, "Could not reach Zoho Books to fetch this statement. Please try again.")
        if resp.status_code == 401 and attempt == 0:
            # Force a token refresh on the retry by expiring the cached token.
            await db.zoho_credentials.update_one(
                {"tenant_id": tenant_id},
                {"$set": {"token_expires_at": datetime.now(timezone.utc).isoformat()}},
            )
            continue
        if resp.status_code >= 400:
            payload = None
            try:
                payload = resp.json()
            except Exception:
                pass
            zmsg = (payload or {}).get("message") if isinstance(payload, dict) else None
            raise ZohoApiError(resp.status_code, zmsg or resp.text[:500], payload)
        ctype = (resp.headers.get("content-type") or "").lower()
        if "pdf" not in ctype:
            # Zoho fell back to a JSON body instead of the PDF — surface why.
            body_text = ""
            try:
                body_text = resp.text[:400]
            except Exception:
                pass
            logger.error("Zoho statement returned non-PDF content-type=%r body=%r", ctype, body_text)
            raise ZohoApiError(
                502,
                "Zoho returned a non-PDF response for this statement. In Zoho Books, open "
                "Settings → Preferences → Customers/Statements and set a default statement "
                "template, then retry.",
            )
        return resp.content
    raise RuntimeError("Zoho statement request failed")



# ---------- Contact upsert ----------

async def upsert_contact(tenant_id: str, account: dict) -> str:
    """Find-or-create a Zoho contact for a Nyla account. Returns the Zoho contact_id.

    Lookup order:
      0) by the account's existing `zoho_contact_id` (manual mapping or prior
         activation) — if present we UPDATE that exact contact, never create.
      1) by email (when account has one)
      2) by exact contact_name (case-insensitive on Zoho's side)
    Falls through to create only if none match.
    """
    email = (account.get("email") or "").strip()
    name = (account.get("account_name") or account.get("name") or "Unnamed Customer").strip()

    existing = None

    # 0) If the account is ALREADY linked to a Zoho contact — either mapped
    #    manually via the "Link Zoho Customer" action, or set on a prior
    #    activation — re-sync THAT EXACT contact. We must never search by
    #    email/name and risk falling through to create, which would spawn a
    #    duplicate customer in Zoho Books.
    mapped_id = (account.get("zoho_contact_id") or "").strip()
    if mapped_id:
        existing = {"contact_id": mapped_id}

    # 1) Try email
    if email and not existing:
        try:
            search = await _zoho_request("GET", "/books/v3/contacts", tenant_id=tenant_id, params={"email": email})
            contacts = search.get("contacts", [])
            existing = contacts[0] if contacts else None
        except ZohoApiError as e:
            logger.warning(f"Zoho contact lookup by email failed: {e}")

    # 2) Fallback: by exact contact_name (Zoho enforces unique name per org).
    # We try multiple candidate display names so a re-synced contact is found
    # regardless of which naming convention it was first pushed under:
    #   • account_name        (legacy: pre this change, contact_name was set to this)
    #   • gst_trade_name      (current: post this change, contact_name is set to this)
    #   • gst_legal_name      (also tried — some imports used the legal entity)
    candidates = []
    for cand in (name, account.get("gst_trade_name"), account.get("gst_legal_name")):
        c = (cand or "").strip()
        if c and c.lower() not in {x.lower() for x in candidates}:
            candidates.append(c)
    for cand_name in candidates:
        if existing:
            break
        try:
            search = await _zoho_request(
                "GET", "/books/v3/contacts", tenant_id=tenant_id,
                params={"contact_name": cand_name},
            )
            contacts = search.get("contacts", [])
            # Exact-match (Zoho contact_name filter is a contains-like search)
            for c in contacts:
                if (c.get("contact_name") or "").strip().lower() == cand_name.lower():
                    existing = c
                    break
            if not existing and contacts and len(contacts) == 1:
                existing = contacts[0]
        except ZohoApiError as e:
            logger.warning(f"Zoho contact lookup by name '{cand_name}' failed: {e}")

    # Compute the labels used by Zoho's invoice "Bill To" block and the
    # contact's Display Name (what shows in Zoho lists). Per business
    # convention:
    #   • Zoho `company_name`  (bold first line of Bill To)     ← LEGAL entity name
    #     e.g. "Kwality Beverages Private Limited"
    #   • Zoho `contact_name`  (Display Name in Zoho lists)     ← TRADE name
    #     e.g. "Kwality"
    #   • `attention`          (secondary Bill-To line)         ← TRADE name (or account name)
    #
    # Fallback chain when a field is missing: legal → trade → account_name,
    # so the customer is never created with a blank name.
    trade_name = (account.get("gst_trade_name") or "").strip()
    legal_name = (account.get("gst_legal_name") or "").strip()
    acct_label = (account.get("account_name") or name or "").strip()

    # company_name = LEGAL entity name (the "official" registered name that
    # belongs on a tax invoice). Falls back to trade name then account name.
    company_name = legal_name or trade_name or acct_label

    # display_name (== Zoho contact_name) = TRADE name (the brand the rep
    # knows the customer by). Falls back to account name. We DO NOT use
    # `legal_name` here because it would clutter the Zoho contact list with
    # full "Pvt Ltd" suffixes.
    display_name = trade_name or acct_label

    # attention = the friendly secondary line under the bold legal name on
    # the Bill-To block. Use trade name; if it equals the company name, blank
    # it so Zoho doesn't render the same line twice.
    secondary_label = (trade_name or acct_label) if (company_name and (trade_name or acct_label).lower() != company_name.lower()) else ""

    payload = {
        # contact_name is the Zoho "Display Name" (shown in lists & dropdowns)
        # AND the dedup key (Zoho enforces uniqueness per organisation).
        # Per user request, this is now the trade name so reps can find
        # customers by the brand they recognise — not the legal entity suffix.
        "contact_name": display_name,
        # company_name is the registered legal-entity name printed as the
        # bold heading of the "Bill To" block on tax invoices.
        "company_name": company_name,
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

    # Zoho enforces a 100-char limit on each of address / street2 / city / state.
    # We clip defensively and overflow address-line-1 into street2 so we never
    # drop content — also surfaces a cleaner rendering on the invoice PDF.
    def _clip100(s: Optional[str]) -> str:
        if not s:
            return ""
        s = str(s).strip()
        return s[:ZOHO_ADDR_MAX]

    def _zoho_addr(src) -> Optional[dict]:
        if not src:
            return None
        if isinstance(src, str):
            full = src.strip()
            return {
                "attention": _clip100(attention_line),
                "address": _clip100(full),
                "street2": _clip100(full[ZOHO_ADDR_MAX:ZOHO_ADDR_MAX * 2]) if len(full) > ZOHO_ADDR_MAX else "",
                "country": "India",
            }
        if not isinstance(src, dict):
            return None
        line1 = (src.get("address_line1") or src.get("line1") or "").strip()
        line2 = (src.get("address_line2") or src.get("line2") or "").strip()
        landmark = (src.get("landmark") or "").strip()
        city = (src.get("city") or "").strip()
        state = (src.get("state") or "").strip()
        zipc = (src.get("pincode") or src.get("zip") or src.get("postal_code") or "").strip()

        # Build a candidate address line (line1 + landmark) but cap at <100.
        # If still too long after that, overflow goes to street2 so nothing is lost.
        candidate_addr = ", ".join([p for p in (line1, landmark) if p]).strip()
        if not (candidate_addr or line2 or city or state or zipc):
            return None
        address = _clip100(candidate_addr) or _clip100(city)
        # If the original candidate was longer than the cap, capture the overflow.
        overflow = candidate_addr[ZOHO_ADDR_MAX:].strip() if len(candidate_addr) > ZOHO_ADDR_MAX else ""
        street2 = _clip100(", ".join([p for p in (overflow, line2) if p]).strip())
        return {
            "attention": _clip100(attention_line),
            "address": address,
            "street2": street2,
            "city": _clip100(city),
            "state": _clip100(state),
            "zip": _clip100(zipc),
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
            return contact_id
        except ZohoApiError as e:
            # Zoho enforces a GLOBALLY-unique `contact_name` per organisation.
            # When this already-linked contact's desired name collides with a
            # DIFFERENT existing contact (typically a leftover duplicate created
            # before the manual link), Zoho rejects the update with code 3062
            # ("... already exists. Please specify a different name.").
            # Since the account is already mapped to THIS contact_id, the right
            # behaviour is to re-sync every other field and keep the contact's
            # existing Zoho name — never create a new customer.
            msg = (e.message or "")
            is_dup_name = e.status_code == 400 and (
                "3062" in msg or "already exists" in msg.lower()
            )
            if is_dup_name and "contact_name" in payload:
                retry_payload = {k: v for k, v in payload.items() if k != "contact_name"}
                try:
                    await _zoho_request("PUT", f"/books/v3/contacts/{contact_id}", tenant_id=tenant_id, json=retry_payload)
                    logger.warning(
                        f"Zoho contact {contact_id}: name '{name}' collided with another "
                        f"Zoho contact (code 3062). Re-synced all other fields and kept the "
                        f"contact's existing name to avoid creating a duplicate."
                    )
                    return contact_id
                except ZohoApiError:
                    pass  # fall through to the detailed diagnostic raise below
            # Diagnostic dump — print every string field length in the payload
            # we sent to Zoho. Lets us instantly spot which sub-field tripped a
            # Zoho length validation when the error message is generic (e.g.
            # "billing_address has less than 100 characters").
            def _lens(d, prefix=""):
                lines = []
                if not isinstance(d, dict):
                    return lines
                for k, v in d.items():
                    if isinstance(v, dict):
                        lines.extend(_lens(v, f"{prefix}{k}."))
                    elif isinstance(v, str):
                        lines.append(f"  {prefix}{k} = {len(v)} chars | {v[:80]!r}")
                return lines
            len_dump = "\n".join(_lens(payload))
            logger.error(
                f"Zoho contact PUT failed for {contact_id}: {e}\n"
                f"Payload field lengths:\n{len_dump}"
            )
            # Surface the field lengths to the caller too, so the user sees the
            # exact overflow in the production error toast (no backend log access).
            longest = max(
                ((k, len(v)) for k, v in _flatten_strs(payload)),
                default=("", 0), key=lambda t: t[1],
            )
            raise ZohoApiError(
                e.status_code,
                f"{e.message}  ·  longest field: {longest[0]} ({longest[1]} chars)",
                payload,
            ) from e

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


class ZohoBranchNotMappedError(RuntimeError):
    """Raised when a self-managed warehouse stock-out is pushed to Zoho but the
    source warehouse has no `zoho_branch_id`. Without a branch, Zoho books the
    invoice under the org's PRIMARY branch (wrong GSTIN). This is a config issue
    — map the warehouse to a Zoho Branch under Distributors → warehouse settings
    — so we block the push rather than emit a wrong-GST invoice."""


class InvoiceNotRegenerableError(RuntimeError):
    """Raised during invoice regeneration when Zoho rejects BOTH an in-place
    update AND a void of the existing invoice — typically because it's already
    paid / partially paid or has credit notes applied. The user must resolve it
    in Zoho (issue a credit note / remove the payment) before regenerating."""


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


async def fetch_invoice_pdf(tenant_id: str, zoho_invoice_id: str) -> tuple[bytes, str]:
    """Download the official invoice PDF straight from Zoho Books.

    Returns `(pdf_bytes, invoice_number)`. `invoice_number` is the human-readable
    Zoho identifier (e.g. `INV-00017`) used by the caller to build a clean
    `Content-Disposition` filename. Falls back to the supplied zoho_invoice_id
    if the API response doesn't contain `invoice_number`.

    We call this endpoint directly (rather than going through `_zoho_request`)
    because we need the raw binary body — `_zoho_request` parses JSON only.
    """
    if not zoho_invoice_id:
        raise RuntimeError("zoho_invoice_id is required")
    cfg = get_zoho_config()
    creds = await get_credentials(tenant_id)
    if not creds:
        raise RuntimeError("Zoho Books is not connected for this tenant")
    api_base = (creds.get("api_base_url") or cfg["api_base_url"]).rstrip("/")
    token = await get_valid_access_token(tenant_id)
    org_id = creds["organization_id"]
    headers = {"Authorization": f"Zoho-oauthtoken {token}"}
    # Zoho Books invoice URL prefix. Every other helper goes through
    # `_zoho_request`, which adds this prefix automatically — but the PDF
    # download has to bypass that helper (it returns binary, not JSON) so
    # we add the prefix here explicitly. Missing this prefix made the
    # request hit a generic zohoapis host and return a Zoho CRM HTML error.
    invoice_url = f"{api_base}/books/v3/invoices/{zoho_invoice_id}"
    # First fetch the invoice metadata for invoice_number.
    invoice_number = zoho_invoice_id
    try:
        async with httpx.AsyncClient(timeout=20.0) as client:
            meta = await client.get(
                invoice_url,
                headers={**headers, "Content-Type": "application/json"},
                params={"organization_id": org_id},
            )
            if meta.status_code == 200:
                payload = meta.json()
                inv = payload.get("invoice") or {}
                invoice_number = inv.get("invoice_number") or invoice_number
    except Exception as e:
        logger.warning(f"Failed to fetch invoice meta for {zoho_invoice_id}: {e}")
    # Now stream the PDF binary.
    # Zoho Books accepts BOTH the `Accept: application/pdf` header AND the
    # legacy `accept=pdf` query param. We send both for maximum compatibility
    # — some Zoho data centres only honour one. Without this, the call falls
    # through to the JSON `invoice` payload and yields 400.
    pdf_headers = {**headers, "Accept": "application/pdf"}
    async with httpx.AsyncClient(timeout=30.0) as client:
        pdf_resp = await client.get(
            invoice_url,
            headers=pdf_headers,
            params={"organization_id": org_id, "accept": "pdf"},
        )
    if pdf_resp.status_code != 200:
        # Surface Zoho's actual error message so the caller can act on it.
        body_text = ""
        try:
            body_text = pdf_resp.text[:500]
        except Exception:
            pass
        logger.error(
            f"Zoho PDF download failed: status={pdf_resp.status_code} "
            f"url={invoice_url} body={body_text!r}"
        )
        raise ZohoApiError(pdf_resp.status_code, body_text)
    # Defensive: if Zoho returned JSON (e.g. fell back to the metadata
    # response), don't pretend it's a PDF.
    ctype = (pdf_resp.headers.get("content-type") or "").lower()
    if "pdf" not in ctype:
        body_text = pdf_resp.text[:500] if hasattr(pdf_resp, "text") else ""
        logger.error(
            f"Zoho PDF download returned non-PDF content-type='{ctype}' "
            f"body={body_text!r}"
        )
        raise ZohoApiError(
            502,
            f"Zoho returned content-type '{ctype}' instead of PDF. "
            f"This usually means the invoice was created without a template attached. "
            f"Open the invoice in Zoho Books → set a print template → retry."
        )
    return pdf_resp.content, invoice_number


async def find_invoice_id_by_number(tenant_id: str, invoice_number: str) -> Optional[str]:
    """Resolve a Zoho Books invoice_id from its human-readable invoice_number.

    Used for invoices synced into the CRM (source=external_api) that never
    stored the Zoho id. Returns the exact-match invoice_id, else None.
    Raises RuntimeError if Zoho is not connected; ZohoApiError on API failure.
    """
    if not invoice_number:
        return None
    resp = await _zoho_request(
        "GET", "/books/v3/invoices",
        tenant_id=tenant_id,
        params={"invoice_number": invoice_number},
    )
    invoices = resp.get("invoices") or []
    if not invoices:
        return None
    target = str(invoice_number).strip().lower()
    for inv in invoices:
        if str(inv.get("invoice_number") or "").strip().lower() == target:
            return inv.get("invoice_id")
    # Fall back to the first result when Zoho's search matched loosely.
    return invoices[0].get("invoice_id")



async def fetch_delivery_challan_pdf(tenant_id: str, zoho_deliverychallan_id: str) -> tuple[bytes, str]:
    """Download the official delivery-challan PDF from Zoho Books.

    Returns `(pdf_bytes, challan_number)`. Same shape as `fetch_invoice_pdf`
    but targets the `/books/v3/deliverychallans/{id}` endpoint.
    """
    if not zoho_deliverychallan_id:
        raise RuntimeError("zoho_deliverychallan_id is required")
    cfg = get_zoho_config()
    creds = await get_credentials(tenant_id)
    if not creds:
        raise RuntimeError("Zoho Books is not connected for this tenant")
    api_base = (creds.get("api_base_url") or cfg["api_base_url"]).rstrip("/")
    token = await get_valid_access_token(tenant_id)
    org_id = creds["organization_id"]
    headers = {"Authorization": f"Zoho-oauthtoken {token}"}
    challan_url = f"{api_base}/books/v3/deliverychallans/{zoho_deliverychallan_id}"

    # Fetch metadata so we have a clean challan_number for the filename.
    challan_number = zoho_deliverychallan_id
    try:
        async with httpx.AsyncClient(timeout=20.0) as client:
            meta = await client.get(
                challan_url,
                headers={**headers, "Content-Type": "application/json"},
                params={"organization_id": org_id},
            )
            if meta.status_code == 200:
                payload = meta.json()
                ch = payload.get("deliverychallan") or payload.get("delivery_challan") or {}
                challan_number = (
                    ch.get("deliverychallan_number")
                    or ch.get("delivery_challan_number")
                    or challan_number
                )
    except Exception as e:
        logger.warning(f"Failed to fetch challan meta for {zoho_deliverychallan_id}: {e}")

    pdf_headers = {**headers, "Accept": "application/pdf"}
    async with httpx.AsyncClient(timeout=30.0) as client:
        pdf_resp = await client.get(
            challan_url,
            headers=pdf_headers,
            params={"organization_id": org_id, "accept": "pdf"},
        )
    if pdf_resp.status_code != 200:
        body_text = ""
        try:
            body_text = pdf_resp.text[:500]
        except Exception:
            pass
        logger.error(
            f"Zoho challan PDF download failed: status={pdf_resp.status_code} "
            f"url={challan_url} body={body_text!r}"
        )
        raise ZohoApiError(pdf_resp.status_code, body_text)
    ctype = (pdf_resp.headers.get("content-type") or "").lower()
    if "pdf" not in ctype:
        body_text = pdf_resp.text[:500] if hasattr(pdf_resp, "text") else ""
        logger.error(
            f"Zoho challan PDF returned non-PDF content-type='{ctype}' "
            f"body={body_text!r}"
        )
        raise ZohoApiError(
            502,
            f"Zoho returned content-type '{ctype}' instead of PDF. "
            "Open the delivery challan in Zoho Books → set a print template → retry."
        )
    return pdf_resp.content, challan_number



async def delete_delivery_challan(tenant_id: str, zoho_deliverychallan_id: str) -> bool:
    """Delete a delivery challan in Zoho Books.

    Zoho Books does NOT support "void" for delivery challans (only invoices /
    credit notes), so a reversal hard-deletes the challan via
    `DELETE /books/v3/deliverychallans/{id}`.

    Returns True on success. A 404 (challan already gone) is treated as success
    so cleanup is idempotent. Any other failure raises, letting the caller flag
    "Zoho cleanup pending" for a retry.
    """
    if not zoho_deliverychallan_id:
        return True
    try:
        await _zoho_request(
            "DELETE",
            f"/books/v3/deliverychallans/{zoho_deliverychallan_id}",
            tenant_id=tenant_id,
            max_attempts=2,
            timeout=12.0,
        )
        return True
    except ZohoApiError as e:
        if e.status_code == 404:
            logger.info(f"Delivery challan {zoho_deliverychallan_id} already absent in Zoho — treating as deleted.")
            return True
        # Code 57 = "You are not authorized to perform this operation". This
        # happens when the connected Zoho token was authorized BEFORE the
        # delivery-challan scopes (incl. DELETE) were added — the token simply
        # lacks permission. Surface an actionable message so the admin knows to
        # reconnect Zoho to grant the new scopes.
        if e.status_code == 401 and (e.payload or {}).get("code") == 57:
            raise ZohoApiError(
                401,
                "Zoho hasn't granted permission to delete delivery challans. "
                "An admin needs to reconnect Zoho Books (Settings → Integrations "
                "→ Zoho Books → Disconnect, then Connect again) so the updated "
                "delivery-challan permissions are authorized, then retry cleanup.",
                e.payload,
            )
        raise


async def void_invoice(tenant_id: str, zoho_invoice_id: str) -> bool:
    """Void an invoice in Zoho Books via `POST /invoices/{id}/status/void`.

    Used when a scheduled delivery is reversed before it actually happens: the
    invoice is marked VOID in Zoho (kept for audit, number preserved) rather than
    deleted, which is the accounting-correct way to invalidate it.

    Returns True on success. A 404 (invoice already gone) and an already-void
    invoice are both treated as success so the reversal is idempotent. Any other
    failure raises so the caller can flag "Zoho void pending" for a retry.
    """
    if not zoho_invoice_id:
        return True
    try:
        await _zoho_request(
            "POST",
            f"/books/v3/invoices/{zoho_invoice_id}/status/void",
            tenant_id=tenant_id,
            max_attempts=2,
            timeout=12.0,
        )
        return True
    except ZohoApiError as e:
        if e.status_code == 404:
            logger.info(f"Invoice {zoho_invoice_id} already absent in Zoho — treating as voided.")
            return True
        # Zoho returns a 400 with this message when the invoice is already void.
        msg = ((e.payload or {}).get("message") or e.message or "").lower()
        if "already" in msg and "void" in msg:
            logger.info(f"Invoice {zoho_invoice_id} is already void in Zoho.")
            return True
        if e.status_code == 401 and (e.payload or {}).get("code") == 57:
            raise ZohoApiError(
                401,
                "Zoho hasn't granted permission to void invoices. An admin needs "
                "to reconnect Zoho Books (Settings → Integrations → Zoho Books → "
                "Disconnect, then Connect again), then retry.",
                e.payload,
            )
        raise




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

    # Company-billed (Zoho) invoices are generated WITHIN our system, so — unlike
    # `external_api` invoices which OVERWRITE the running balance — their net must
    # be ADDED to the account's existing outstanding balance. We do this exactly
    # ONCE, on the first mirror of a delivery, so retries / re-syncs never
    # double-count (guarded by the `outstanding_counted` flag + existence check).
    existing_mirror = await db.invoices.find_one(
        {"tenant_id": tenant_id, "source_type": "distributor_delivery",
         "source_id": delivery.get("id")},
        {"_id": 0, "outstanding": 1, "outstanding_counted": 1},
    )
    if existing_mirror is None:
        acct = await db.accounts.find_one(
            {"tenant_id": tenant_id, "$or": [{"id": account_uuid}, {"account_id": account_uuid}]},
            {"_id": 0, "outstanding_balance": 1},
        )
        prior_balance = float((acct or {}).get("outstanding_balance") or 0)
        outstanding_value = round(prior_balance + gross_total, 2)  # new running balance
        counted = True
    else:
        # Already mirrored — keep the previously-stamped running balance and never
        # re-increment the account.
        outstanding_value = float(existing_mirror.get("outstanding") or 0.0)
        counted = bool(existing_mirror.get("outstanding_counted", False))

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
        "outstanding": outstanding_value,
        "outstanding_counted": counted,
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
        if existing_mirror is None and gross_total:
            # First mirror: add this invoice's net to the running outstanding balance.
            await db.accounts.update_one(
                {"tenant_id": tenant_id, "$or": [{"id": account_uuid}, {"account_id": account_uuid}]},
                {"$inc": {"outstanding_balance": round(gross_total, 2)},
                 "$set": {"updated_at": now}},
            )
        logger.info(
            f"Mirrored Zoho invoice {zoho_invoice_number} into account "
            f"{account.get('account_name')} (delivery {delivery.get('delivery_number')})"
        )
    except Exception as e:
        logger.warning(f"Failed to mirror Zoho invoice into invoices collection: {e}")


async def _base_uom_map(tenant_id: str, items: list[dict]) -> dict:
    """sku_id → base_uom (defaults to 'Bottle') for the SKUs on these lines."""
    sku_ids = list({it.get("sku_id") for it in items if it.get("sku_id")})
    out: dict = {}
    if sku_ids:
        async for s in db.master_skus.find({"id": {"$in": sku_ids}}, {"_id": 0, "id": 1, "base_uom": 1}):
            out[s["id"]] = s.get("base_uom") or "Bottle"
    return out


def _pluralize_uom(uom: str, count) -> str:
    u = (uom or "Bottle").strip()
    try:
        if int(float(count)) == 1:
            return u
    except (TypeError, ValueError):
        pass
    return u if u.lower().endswith("s") else f"{u}s"


def _pack_clause(packages, units, name, base_qty, base_uom: str = "Bottle") -> str:
    """Packaging clause for challan/invoice line NAMES, e.g.
    "5 × Crate-12 (60 Bottles)". Empty when not a multi-unit pack."""
    try:
        packages = int(packages or 0)
        units = int(units or 0)
        base_qty = int(float(base_qty or 0))
    except (TypeError, ValueError):
        return ""
    if packages > 0 and units > 1:
        nm = (name or f"Pack-{units}").strip()
        return f"{packages} × {nm} ({base_qty} {_pluralize_uom(base_uom, base_qty)})"
    return ""


def _line_description(it: dict, base_uom: str = "Bottle", *, prefix: str = "") -> str:
    """Compose a Zoho line `description`: packaging breakdown + batch.
    e.g. "5 × Crate-12 (60 Bottles) | Batch: B-2026-01". `quantity` is in
    base units; packages × packaging_units == quantity."""
    parts: list[str] = []
    if prefix:
        parts.append(prefix)
    try:
        packages = int(it.get("packages") or 0)
        units = int(it.get("packaging_units") or 0)
        qty = int(float(it.get("quantity") or 0))
    except (TypeError, ValueError):
        packages = units = qty = 0
    if packages > 0 and units > 1:
        name = (it.get("packaging_type_name") or f"Pack-{units}").strip()
        parts.append(f"{packages} × {name} ({qty} {_pluralize_uom(base_uom, qty)})")
    batch_code = (it.get("batch_code") or "").strip()
    if batch_code:
        parts.append(f"Batch: {batch_code}")
    return " | ".join(parts)



async def create_invoice_for_delivery(
    *, tenant_id: str, delivery: dict, items: list[dict], account: dict, force: bool = False
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
    existing_invoice_id = (existing_mapping or {}).get("zoho_invoice_id")
    if existing_invoice_id and not force:
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
    uom_map = await _base_uom_map(tenant_id, items)
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
        # Surface the production batch + packaging breakdown on the printed Zoho
        # invoice/challan so customers + FSSAI auditors can trace what was
        # delivered. Zoho prints `description` directly under the item name.
        description = _line_description(it, uom_map.get(it.get("sku_id"), "Bottle"))
        line_items.append({
            "item_id": zoho_item_id,
            "name": sku_name,
            "description": description,
            "quantity": qty,
            "rate": agreed,
            # Per-line PERCENTAGE discount — Zoho needs the "%" suffix + invoice
            # discount_type=item_level, else a bare number is read as a flat ₹ amount.
            "discount": f"{float(it.get('discount_percent', 0) or 0):g}%",
        })

    if missing_skus:
        raise MissingAgreedPriceError(
            "No agreed price configured on the account for SKU(s): "
            + ", ".join(missing_skus)
            + ". Add pricing under Account → SKU Pricing before this delivery can be pushed to Zoho."
        )

    # ── Missing-bottle Debit Notes → TAXABLE line items on the invoice ──────
    # When a debit note (customer owes us for unreturned bottles) is applied to
    # this delivery, charge it back as real taxable line items so Zoho applies
    # GST via each SKU's tax mapping. Full application pushes the per-SKU lines;
    # a partial application pushes a single line (on a representative SKU item so
    # GST still applies) whose rate equals the applied amount.
    applied_dns = delivery.get("applied_debit_notes") or []
    for entry in applied_dns:
        dn_id = entry.get("debit_note_id")
        try:
            amount_applied = float(entry.get("amount_applied") or 0)
        except (TypeError, ValueError):
            amount_applied = 0.0
        if not dn_id or amount_applied <= 0:
            continue
        dn = await db.debit_notes.find_one({"id": dn_id, "tenant_id": tenant_id}) or {}
        dn_number = entry.get("debit_note_number") or dn.get("debit_note_number") or ""
        dn_items = dn.get("items") or []
        try:
            original_amount = float(dn.get("original_amount") or 0)
        except (TypeError, ValueError):
            original_amount = 0.0
        is_full = bool(dn_items) and abs(amount_applied - original_amount) < 0.01

        async def _dn_item_id(sku_id):
            if not sku_id:
                return None
            try:
                return await get_zoho_item_id(tenant_id, sku_id)
            except Exception as e:
                logger.warning(f"[zoho] No Zoho item mapping for debit-note SKU {sku_id}: {e}")
                return None

        if is_full:
            for di in dn_items:
                zid = await _dn_item_id(di.get("sku_id"))
                line = {
                    "name": (di.get("sku_name") or "Missing Bottle Recovery").strip(),
                    "description": f"Missing / unreturned bottles — {dn_number}",
                    "quantity": float(di.get("quantity") or 0),
                    "rate": float(di.get("rate_per_unit") or 0),
                }
                if zid:
                    line["item_id"] = zid
                line_items.append(line)
        else:
            rep_sku = dn_items[0].get("sku_id") if dn_items else None
            zid = await _dn_item_id(rep_sku)
            line = {
                "name": f"Missing Bottle Recovery — {dn_number}",
                "description": "Charge for unreturned / missing bottles",
                "quantity": 1,
                "rate": round(amount_applied, 2),
            }
            if zid:
                line["item_id"] = zid
            line_items.append(line)

    invoice_payload = {
        "customer_id": customer_id,
        "reference_number": delivery.get("delivery_number"),
        "date": (delivery.get("delivery_date") or datetime.now(timezone.utc).strftime("%Y-%m-%d"))[:10],
        "line_items": line_items,
        "discount_type": "item_level",
        "is_discount_before_tax": True,
        "notes": f"Generated from Nyla CRM delivery {delivery.get('delivery_number')}",
    }

    # ── Branch (multi-GSTIN) — CRITICAL for correct GST ─────────────────────
    # The invoice must be booked under the Zoho Branch that maps to the
    # warehouse this stock-out shipped from, so Zoho applies THAT warehouse's
    # GSTIN + source-of-supply (and thus computes CGST/SGST vs IGST against the
    # customer correctly). Without `branch_id`, Zoho silently uses the org's
    # primary branch — which is how a Delhi stock-out got a Hyderabad GSTIN.
    src_loc_id = delivery.get("distributor_location_id")
    src_loc = None
    if src_loc_id:
        src_loc = await db.distributor_locations.find_one(
            {"id": src_loc_id, "tenant_id": tenant_id},
            {"_id": 0, "zoho_branch_id": 1, "zoho_branch_name": 1, "location_name": 1},
        )
    branch_id = (src_loc or {}).get("zoho_branch_id")
    if branch_id:
        invoice_payload["branch_id"] = str(branch_id)
    else:
        loc_name = (src_loc or {}).get("location_name") or "this warehouse"
        raise ZohoBranchNotMappedError(
            f"Warehouse '{loc_name}' is not mapped to a Zoho Branch, so the invoice "
            f"would carry the wrong GSTIN. Map it to the correct Zoho Branch under "
            f"Distributors → (self-managed) → Warehouses → edit '{loc_name}', then retry the push."
        )

    # ── Payment terms — pulled from account.payment_terms_days when set.
    # Zoho Books expects an integer for `payment_terms` (number of credit days)
    # and an optional `payment_terms_label` (human-readable string). If the
    # account doesn't specify any terms we leave them off and Zoho falls back
    # to its own default ("Due on Receipt").
    try:
        ptd_raw = account.get("payment_terms_days")
        if ptd_raw is not None and ptd_raw != "":
            ptd = int(ptd_raw)
            if ptd >= 0:
                invoice_payload["payment_terms"] = ptd
                ptd_label = (account.get("payment_terms_label") or "").strip()
                if not ptd_label:
                    ptd_label = "Due on Receipt" if ptd == 0 else f"Net {ptd}"
                invoice_payload["payment_terms_label"] = ptd_label
    except (TypeError, ValueError):
        # Bad data — skip silently so the invoice still pushes.
        pass

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

    # ── Bill To / Ship To: delegate to the Zoho contact ─────────────────────
    # We deliberately DO NOT send `billing_address` or `shipping_address` on
    # the invoice payload. Zoho will fall back to the addresses already stored
    # on the contact (see `upsert_contact` above, which syncs both blocks at
    # create/update time). This mirrors what Zoho does when you create an
    # invoice manually in the Zoho UI — and avoids the recurring
    # "billing_address has less than 100 characters" 400 that came from our
    # per-invoice override when any sub-field overflowed.

    # Optional: per-tenant Zoho template override for the invoice PDF.
    # Configured via PUT /api/zoho/admin/template-settings — see zoho_books.py.
    tenant_creds = await get_credentials(tenant_id) or {}
    invoice_tmpl = (tenant_creds.get("invoice_template_id") or "").strip()
    if invoice_tmpl:
        invoice_payload["template_id"] = invoice_tmpl

    regen_mode = "created"
    if force and existing_invoice_id:
        # ── Regeneration ────────────────────────────────────────────────────
        # Prefer UPDATE-IN-PLACE (keeps the same invoice number). If Zoho rejects
        # the edit (invoice paid / partially paid / has credits applied), fall
        # back to void + recreate. If even the void is rejected, surface a clear
        # error so the user resolves it in Zoho.
        try:
            result = await _zoho_request(
                "PUT", f"/books/v3/invoices/{existing_invoice_id}",
                tenant_id=tenant_id, json=invoice_payload)
            regen_mode = "updated"
            logger.info(f"[zoho] Invoice {existing_invoice_id} updated in place for delivery {delivery.get('delivery_number')}")
        except Exception as e:
            logger.warning(
                f"[zoho] In-place update failed for invoice {existing_invoice_id}: {e}. "
                f"Falling back to void + recreate.")
            try:
                await void_invoice(tenant_id, existing_invoice_id)
            except Exception as ve:
                raise InvoiceNotRegenerableError(
                    f"Invoice {existing_mapping.get('zoho_invoice_number') or existing_invoice_id} "
                    f"can't be edited or voided in Zoho (it's likely paid, partially paid, or has "
                    f"credit notes applied). Issue a credit note in Zoho or remove the payment, then retry."
                ) from ve
            result = await _zoho_request("POST", "/books/v3/invoices", tenant_id=tenant_id, json=invoice_payload)
            regen_mode = "recreated"
    else:
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
        "regen_mode": regen_mode,
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


# ---------- Delivery Challan (inter-branch stock transfer) ----------

async def create_delivery_challan_for_stock_transfer(
    *, tenant_id: str, transfer: dict, dest_distributor: dict
) -> dict:
    """Push a Nyla inter-branch stock transfer as a Zoho Books *Delivery Challan*.

    Used when both source and destination warehouses belong to self-managed
    distributors AND share the same GSTIN (per Indian GST law: no taxable
    supply, so no tax invoice — only a delivery challan).

    Zoho endpoint: POST /books/v3/deliverychallans (India edition).
    challan_type = "branch_transfer" — this is the Zoho enum for inter-branch
    stock movements within the same legal entity.

    `transfer` shape:
        {
          id, transfer_number, transfer_date, items: [{sku_id, sku_name, quantity, rate?}],
          source_distributor_name, source_location_name, dest_location_name,
          notes?, vehicle_number?, gstin
        }
    `dest_distributor` is the destination distributor doc (used to upsert the
    Zoho contact for the challan).
    """
    if not is_zoho_configured():
        raise RuntimeError("Zoho Books integration is not configured (ZOHO_CLIENT_ID missing).")

    # Idempotency — if this transfer was already pushed, return the existing mapping.
    existing_mapping = await db.zoho_invoice_mappings.find_one(
        {"tenant_id": tenant_id, "source_type": "stock_transfer",
         "source_id": transfer.get("id"), "status": "synced"},
        {"_id": 0},
    )
    if existing_mapping and existing_mapping.get("zoho_invoice_id"):
        logger.info(
            f"Zoho delivery challan already synced for stock transfer "
            f"{transfer.get('transfer_number')}; skipping re-push."
        )
        return existing_mapping

    # Zoho requires a contact for any delivery challan. We synthesize a Zoho
    # contact from the destination distributor — `upsert_contact` already
    # handles dedup by email/name. For branch-transfer challans Zoho doesn't
    # GST-charge the contact, so this is purely a routing identifier.
    customer_id = await upsert_contact(tenant_id, {
        "id": dest_distributor.get("id"),
        "account_name": dest_distributor.get("distributor_name") or dest_distributor.get("legal_entity_name"),
        "legal_entity_name": dest_distributor.get("legal_entity_name") or dest_distributor.get("distributor_name"),
        # Zoho Bill-To: the bold heading (company_name) must be the LEGAL ENTITY
        # name, while the Display Name (contact_name) stays the distributor's
        # trade name. upsert_contact derives company_name from gst_legal_name.
        "gst_legal_name": dest_distributor.get("legal_entity_name") or dest_distributor.get("distributor_name"),
        "gst_trade_name": dest_distributor.get("distributor_name") or dest_distributor.get("legal_entity_name"),
        "gstin": dest_distributor.get("gstin"),
        "primary_contact_name": dest_distributor.get("primary_contact_name"),
        "primary_contact_email": dest_distributor.get("primary_contact_email"),
        "primary_contact_mobile": dest_distributor.get("primary_contact_mobile"),
        "billing_address": dest_distributor.get("billing_address") or dest_distributor.get("registered_address"),
        "delivery_address": dest_distributor.get("registered_address"),
        # Use a dedicated `zoho_contact_id_self_managed_*` slot to avoid clobbering
        # the regular customer mapping (these contacts are "self" contacts).
        "zoho_contact_id": dest_distributor.get("zoho_contact_id"),
    })

    # Build line items. Stock transfers carry per-line rates that the user
    # entered (for E-way bill compliance). Quantity is in PACKAGES (crates / cartons),
    # NOT raw units. The packaging_type_name is appended to the line name so the
    # challan is unambiguous (e.g. "Nyla 600ml · Crate - 12").
    line_items: list[dict] = []
    uom_map = await _base_uom_map(tenant_id, transfer.get("items") or [])
    for it in transfer.get("items") or []:
        zoho_item_id = await get_zoho_item_id(tenant_id, it.get("sku_id"))
        base_name = (it.get("sku_name") or "").strip() or "Item"
        pkg = (it.get("packaging_type_name") or "").strip()
        # Embed batch in line description so the printed Challan carries traceability.
        batch_code = (it.get("batch_code") or "").strip()
        pkgs = int(it.get("quantity") or 0)             # transfer qty is in PACKAGES
        units = int(it.get("units_per_package") or 0)
        clause = _pack_clause(pkgs, units, pkg, pkgs * units, uom_map.get(it.get("sku_id"), "Bottle"))
        parts = [base_name]
        if clause:
            parts.append(clause)
        elif pkg:
            parts.append(pkg)
        if batch_code:
            parts.append(f"Batch {batch_code}")
        display_name = " · ".join(parts)
        line_items.append({
            "item_id": zoho_item_id,
            "name": display_name,
            "quantity": float(it.get("quantity", 0) or 0),  # packages
            "rate": float(it.get("rate", 0) or 0),          # per-package rate
            # Branch-transfer challan = NO GST. Same-GSTIN movement is not a
            # taxable supply under Indian GST law. We zero the line-level tax
            # to override any GST rate inherited from the Zoho item master
            # (where the same SKU is rated at 18% for customer invoices).
            "tax_id": "",
            "tax_name": "",
            "tax_type": "",
            "tax_percentage": 0,
            "item_tax_preferences": [],
        })

    if not line_items:
        raise RuntimeError(f"Stock transfer {transfer.get('transfer_number')} has no items to push.")

    notes = transfer.get("notes") or ""
    if transfer.get("vehicle_number"):
        notes = (f"Vehicle: {transfer['vehicle_number']}\n" + notes).strip()
    notes = (
        f"Inter-branch stock transfer "
        f"{transfer.get('source_distributor_name', '')} ({transfer.get('source_location_name', '')}) "
        f"→ {transfer.get('dest_distributor_name', '')} ({transfer.get('dest_location_name', '')}).\n"
        + notes
    ).strip()

    payload = {
        "customer_id": customer_id,
        # Zoho Books accepts only: supply_of_liquid_gas, supply_on_approval,
        # job_work, others. There is NO "branch_transfer" enum — that was
        # rejected with API code 6 "Invalid value specified for the parameter".
        # For inter-branch stock movement we use "others" (most generic) and
        # encode the actual context in `notes` + `reference_number`.
        "challan_type": "others",
        "reference_number": transfer.get("transfer_number"),
        "date": (transfer.get("transfer_date") or datetime.now(timezone.utc).strftime("%Y-%m-%d"))[:10],
        "line_items": line_items,
        "notes": notes,
        # Hard guarantee no GST is computed at document level for a same-GSTIN
        # branch transfer (per Indian GST: no taxable supply, hence no tax).
        # `is_inclusive_tax=false` + `gst_treatment="out_of_scope"` keeps the
        # printed PDF clean of any CGST/SGST/IGST rows.
        "is_inclusive_tax": False,
        "gst_treatment": "out_of_scope",
        "tax_total": 0,
    }

    result = await _post_deliverychallan_resilient(tenant_id, payload, transfer.get("reference_number") or transfer.get("transfer_number"))
    challan = result.get("deliverychallan") or result.get("delivery_challan") or {}
    zoho_challan_id = challan.get("deliverychallan_id") or challan.get("delivery_challan_id")
    zoho_challan_number = challan.get("deliverychallan_number") or challan.get("delivery_challan_number")
    challan_url = _zoho_books_url(zoho_challan_id, await get_credentials(tenant_id) or {})
    if challan_url:
        # The /invoices URL helper above hardcodes "/invoices/{id}". Re-target
        # to the deliverychallans path so "View in Zoho" lands on the right page.
        challan_url = challan_url.replace("/invoices/", "/deliverychallans/")

    now = datetime.now(timezone.utc).isoformat()
    mapping_doc = {
        "tenant_id": tenant_id,
        "source_type": "stock_transfer",
        "source_id": transfer.get("id"),
        "source_number": transfer.get("transfer_number"),
        "zoho_invoice_id": zoho_challan_id,          # reuse `invoice` columns for cross-doc audit
        "zoho_invoice_number": zoho_challan_number,
        "zoho_invoice_url": challan_url,
        "zoho_doc_type": "delivery_challan",
        "status": "synced",
        "created_at": now,
        "updated_at": now,
    }
    await db.zoho_invoice_mappings.update_one(
        {"tenant_id": tenant_id, "source_type": "stock_transfer", "source_id": transfer.get("id")},
        {"$set": mapping_doc, "$setOnInsert": {"first_synced_at": now}},
        upsert=True,
    )

    return mapping_doc


async def create_delivery_challan_for_promo_dispatch(
    *, tenant_id: str, dispatch: dict, items: list[dict], distributor: dict
) -> dict:
    """Push a promotional / non-sale stock-out as a Zoho Books *Delivery Challan*.

    Promo dispatches are gifted samples, brand promotions or sponsorships — they
    move stock physically but are **NOT a taxable supply**. Per the same Indian
    GST rule used for branch transfers we use a Delivery Challan (no GST) with:
      • `gst_treatment="out_of_scope"`
      • zero `tax_total`
      • a prominent "Not for sale · No commercial value" banner in `notes`

    The "customer" is the distributor itself (its own Zoho contact) — there is
    no real buyer. The actual recipient (CRM Contact / Lead / Employee) is
    recorded in `notes` and as `shipping_address` so the printed PDF is still
    fully self-describing.

    Idempotent — re-pushing the same `dispatch.id` returns the existing mapping.
    """
    if not is_zoho_configured():
        raise RuntimeError("Zoho Books integration is not configured (ZOHO_CLIENT_ID missing).")

    existing_mapping = await db.zoho_invoice_mappings.find_one(
        {"tenant_id": tenant_id, "source_type": "promo_dispatch",
         "source_id": dispatch.get("id"), "status": "synced"},
        {"_id": 0},
    )
    if existing_mapping and existing_mapping.get("zoho_invoice_id"):
        logger.info(
            f"Zoho delivery challan already synced for promo dispatch "
            f"{dispatch.get('challan_number')}; skipping re-push."
        )
        return existing_mapping

    # Use the distributor's own Zoho contact as the document's `customer_id`.
    # If the distributor isn't yet linked, upsert one on the fly so the push
    # doesn't fail just because the distributor was never invoiced before.
    customer_id = await upsert_contact(tenant_id, {
        "id": distributor.get("id"),
        "account_name": distributor.get("distributor_name") or distributor.get("legal_entity_name"),
        "legal_entity_name": distributor.get("legal_entity_name") or distributor.get("distributor_name"),
        # Bill-To legal name (company_name) ← legal entity; Display (contact_name) ← trade name.
        "gst_legal_name": distributor.get("legal_entity_name") or distributor.get("distributor_name"),
        "gst_trade_name": distributor.get("distributor_name") or distributor.get("legal_entity_name"),
        "gstin": distributor.get("gstin"),
        "primary_contact_name": distributor.get("primary_contact_name"),
        "primary_contact_email": distributor.get("primary_contact_email"),
        "primary_contact_mobile": distributor.get("primary_contact_mobile"),
        "billing_address": distributor.get("billing_address") or distributor.get("registered_address"),
        "delivery_address": distributor.get("registered_address"),
        "zoho_contact_id": distributor.get("zoho_contact_id"),
    })

    # Build line items. Promo dispatches carry indicative unit_price on each
    # line for record-keeping (asset valuation) — we pass it as `rate` but the
    # document is marked out-of-scope so Zoho will NOT compute or charge tax.
    line_items: list[dict] = []
    uom_map = await _base_uom_map(tenant_id, items)
    for it in items:
        zoho_item_id = await get_zoho_item_id(tenant_id, it.get("sku_id"))
        base_name = (it.get("sku_name") or "").strip() or "Item"
        batch_code = (it.get("batch_code") or "").strip()
        qty_bottles = float(it.get("quantity", 0) or 0)
        upp = int(it.get("packaging_units") or it.get("units_per_package") or 0)
        base_uom = uom_map.get(it.get("sku_id"), "Bottle")
        parts = [base_name]
        if batch_code:
            parts.append(f"Batch {batch_code}")
        # Packaging breakdown so the delivery team sees BOTH the pack count and
        # the total base units, e.g. "2 × Crate-12 (24 Bottles)".
        pkgs = it.get("packages") or (int(qty_bottles // upp) if upp else 0)
        clause = _pack_clause(pkgs, upp, it.get("packaging_type_name"), qty_bottles, base_uom)
        if clause:
            parts.append(clause)
        else:
            parts.append(f"{int(qty_bottles)} {_pluralize_uom(base_uom, qty_bottles)}")
        display_name = " · ".join(parts) + "  — Sample / Promotional (Not for Sale)"
        line_items.append({
            "item_id": zoho_item_id,
            "name": display_name,
            "quantity": qty_bottles,
            "rate": float(it.get("unit_price", 0) or 0),
            "tax_id": "",
            "tax_name": "",
            "tax_type": "",
            "tax_percentage": 0,
            "item_tax_preferences": [],
        })

    if not line_items:
        raise RuntimeError(f"Promo dispatch {dispatch.get('challan_number')} has no items to push.")

    # Condensed to TWO short lines so the printed Zoho challan stays on ONE
    # page (the recipient details were previously 6 separate lines, which pushed
    # the notes block onto a 2nd page). Banner = 1 line; recipient = 1 line.
    banner = "*** NOT FOR SALE · NO COMMERCIAL VALUE — Promotional stock-out (no GST, no consideration receivable) ***"
    recipient_bits = [
        f"Recipient: {dispatch.get('contact_name') or '—'}"
        + (f" ({dispatch.get('contact_company')})" if dispatch.get('contact_company') else "")
    ]
    if dispatch.get('contact_phone'):
        recipient_bits.append(f"Ph: {dispatch.get('contact_phone')}")
    if dispatch.get('promo_reason'):
        recipient_bits.append(f"Reason: {dispatch.get('promo_reason')}")
    if dispatch.get('vehicle_number'):
        recipient_bits.append(f"Vehicle: {dispatch.get('vehicle_number')}")
    if dispatch.get('driver_name'):
        recipient_bits.append(f"Driver: {dispatch.get('driver_name')}")
    if dispatch.get('remarks'):
        recipient_bits.append(f"Remarks: {dispatch.get('remarks')}")
    notes = (banner + "\n" + " · ".join(recipient_bits)).strip()

    payload = {
        "customer_id": customer_id,
        "challan_type": "others",   # Zoho enum — see stock-transfer function for the limited set
        "reference_number": dispatch.get("challan_number"),
        "date": (dispatch.get("delivery_date") or datetime.now(timezone.utc).strftime("%Y-%m-%d"))[:10],
        "line_items": line_items,
        "notes": notes,
        "is_inclusive_tax": False,
        "gst_treatment": "out_of_scope",
        "tax_total": 0,
    }

    # FROM (header) address: pin the document to the source warehouse's Zoho
    # Branch so the printed challan header switches from the org HQ (Madhapur)
    # to that branch's registered address (e.g. Delhi). The branch id is
    # configured per warehouse under Distributor → Locations → "Zoho Branch ID".
    src_branch_id = (dispatch.get("source_zoho_branch_id") or "").strip()
    if src_branch_id:
        payload["branch_id"] = src_branch_id
        # Best-effort: push the source warehouse's full street address into its
        # mapped Zoho Branch so the printed challan header ("From") shows the
        # dispatching warehouse address — not just the branch's state. Requires
        # the ZohoBooks.settings.UPDATE scope (granted on reconnect).
        try:
            src_wh = await db.distributor_locations.find_one(
                {"id": dispatch.get("distributor_location_id"), "tenant_id": tenant_id}, {"_id": 0}
            )
            if src_wh:
                await sync_warehouse_to_zoho_branch(tenant_id=tenant_id, location=src_wh)
        except Exception as e:
            logger.warning(
                f"Could not sync warehouse address to Zoho branch for challan "
                f"{dispatch.get('challan_number')}: {e}"
            )

    # DELIVER-TO (recipient) address — the lead / contact / employee the promo
    # stock-out is gifted to. Two important Zoho quirks drive this design:
    #   1. Zoho rejects an inline `shipping_address` on delivery-challan *create*
    #      (spurious code-15), so we set it AFTER create via the dedicated
    #      `/address/shipping` endpoint (see `_set_deliverychallan_shipping_address`).
    #   2. Zoho's challan template prints the CUSTOMER (distributor) name as the
    #      Deliver-To heading and IGNORES the shipping `attention` field — so the
    #      recipient name would never show. We therefore put the recipient name
    #      as the first visible ADDRESS line and push the street into `street2`.
    rsa = dispatch.get("recipient_shipping_address") or {}
    recipient_nm = (rsa.get("attention") or dispatch.get("contact_name") or "").strip()
    street_block = ", ".join([p for p in [
        (rsa.get("address") or "").strip(),
        (rsa.get("street2") or "").strip(),
    ] if p]).strip()
    if not street_block and dispatch.get("delivery_address"):
        street_block = str(dispatch["delivery_address"]).strip()
    has_addr = bool(recipient_nm or street_block or (rsa.get("city") or "").strip())
    shipping_addr = None
    if has_addr:
        shipping_addr = {
            # attention omitted on purpose — Zoho's template doesn't render it
            # for challans, and we already surface the name as address line 1.
            "address": _zoho_clip(recipient_nm) or _zoho_clip(street_block),
            "street2": _zoho_clip(street_block) if recipient_nm else "",
            "city": _zoho_clip(rsa.get("city") or ""),
            "state": _zoho_clip(rsa.get("state") or ""),
            "zip": _zoho_clip(rsa.get("zip") or ""),
            "country": rsa.get("country") or "India",
            "phone": _zoho_clip(rsa.get("phone") or "", 50),
        }

    result = await _post_deliverychallan_resilient(tenant_id, payload, dispatch.get("challan_number"))
    challan = result.get("deliverychallan") or result.get("delivery_challan") or {}
    zoho_challan_id = challan.get("deliverychallan_id") or challan.get("delivery_challan_id")
    zoho_challan_number = challan.get("deliverychallan_number") or challan.get("delivery_challan_number")

    # Now set the recipient as the Deliver-To address (best-effort).
    if shipping_addr and zoho_challan_id:
        await _set_deliverychallan_shipping_address(
            tenant_id, zoho_challan_id, shipping_addr, ref=dispatch.get("challan_number")
        )

    challan_url = _zoho_books_url(zoho_challan_id, await get_credentials(tenant_id) or {})
    if challan_url:
        challan_url = challan_url.replace("/invoices/", "/deliverychallans/")

    now = datetime.now(timezone.utc).isoformat()
    mapping_doc = {
        "tenant_id": tenant_id,
        "source_type": "promo_dispatch",
        "source_id": dispatch.get("id"),
        "source_number": dispatch.get("challan_number"),
        "zoho_invoice_id": zoho_challan_id,
        "zoho_invoice_number": zoho_challan_number,
        "zoho_invoice_url": challan_url,
        "zoho_doc_type": "delivery_challan",
        "status": "synced",
        "created_at": now,
        "updated_at": now,
    }
    await db.zoho_invoice_mappings.update_one(
        {"tenant_id": tenant_id, "source_type": "promo_dispatch", "source_id": dispatch.get("id")},
        {"$set": mapping_doc, "$setOnInsert": {"first_synced_at": now}},
        upsert=True,
    )
    return mapping_doc


async def create_invoice_for_stock_transfer(
    *, tenant_id: str, transfer: dict, dest_distributor: dict
) -> dict:
    """Push a Nyla inter-branch stock transfer as a Zoho Books *Tax Invoice*.

    Used when source & destination warehouses have DIFFERENT GSTINs of the SAME
    legal entity (same PAN) — per CGST Schedule I a Tax Invoice is mandatory even
    though no real sale happened. Per CGST Rule 30 the value is the SKU's
    list / base price (no margin) — which is exactly what the transfer item's
    `rate` already carries (computed from `master_skus.base_price`).

    This function INTENTIONALLY does not consult `account.sku_pricing` — Stock
    Transfer pricing is destination-independent and comes from the SKU master.

    Sibling of `create_delivery_challan_for_stock_transfer`. Same persistence
    pattern; persisted mapping uses `zoho_doc_type='invoice'`.
    """
    if not is_zoho_configured():
        raise RuntimeError("Zoho Books integration is not configured (ZOHO_CLIENT_ID missing).")

    # Idempotency — if this transfer was already pushed, return existing mapping.
    existing_mapping = await db.zoho_invoice_mappings.find_one(
        {"tenant_id": tenant_id, "source_type": "stock_transfer",
         "source_id": transfer.get("id"), "status": "synced"},
        {"_id": 0},
    )
    if existing_mapping and existing_mapping.get("zoho_invoice_id"):
        logger.info(
            f"Zoho invoice already synced for stock transfer "
            f"{transfer.get('transfer_number')}; skipping re-push."
        )
        return existing_mapping

    # Upsert contact for the destination distributor (Zoho needs a customer ref).
    customer_id = await upsert_contact(tenant_id, {
        "id": dest_distributor.get("id"),
        "account_name": dest_distributor.get("distributor_name") or dest_distributor.get("legal_entity_name"),
        "legal_entity_name": dest_distributor.get("legal_entity_name") or dest_distributor.get("distributor_name"),
        # Zoho Bill-To: the bold heading (company_name) must be the LEGAL ENTITY
        # name, while the Display Name (contact_name) stays the distributor's
        # trade name. upsert_contact derives company_name from gst_legal_name.
        "gst_legal_name": dest_distributor.get("legal_entity_name") or dest_distributor.get("distributor_name"),
        "gst_trade_name": dest_distributor.get("distributor_name") or dest_distributor.get("legal_entity_name"),
        "gstin": dest_distributor.get("gstin"),
        "primary_contact_name": dest_distributor.get("primary_contact_name"),
        "primary_contact_email": dest_distributor.get("primary_contact_email"),
        "primary_contact_mobile": dest_distributor.get("primary_contact_mobile"),
        "billing_address": dest_distributor.get("billing_address") or dest_distributor.get("registered_address"),
        "delivery_address": dest_distributor.get("registered_address"),
        "zoho_contact_id": dest_distributor.get("zoho_contact_id"),
    })

    # Build line items — quantity in PACKAGES (crates/cartons), rate per package
    # (already = master_skus.base_price × units_per_package from create_stock_transfer).
    line_items: list[dict] = []
    uom_map = await _base_uom_map(tenant_id, transfer.get("items") or [])
    for it in transfer.get("items") or []:
        zoho_item_id = await get_zoho_item_id(tenant_id, it.get("sku_id"))
        base_name = (it.get("sku_name") or "").strip() or "Item"
        pkg = (it.get("packaging_type_name") or "").strip()
        # Embed batch in line description so the printed PDF carries traceability.
        batch_code = (it.get("batch_code") or "").strip()
        pkgs = int(it.get("quantity") or 0)             # transfer qty is in PACKAGES
        units = int(it.get("units_per_package") or 0)
        clause = _pack_clause(pkgs, units, pkg, pkgs * units, uom_map.get(it.get("sku_id"), "Bottle"))
        parts = [base_name]
        if clause:
            parts.append(clause)
        elif pkg:
            parts.append(pkg)
        if batch_code:
            parts.append(f"Batch {batch_code}")
        display_name = " · ".join(parts)
        line_items.append({
            "item_id": zoho_item_id,
            "name": display_name,
            "quantity": float(it.get("quantity", 0) or 0),
            "rate": float(it.get("rate", 0) or 0),
        })

    if not line_items:
        raise RuntimeError(f"Stock transfer {transfer.get('transfer_number')} has no items to push.")

    notes_parts: list[str] = []
    if transfer.get("vehicle_number"):
        notes_parts.append(f"Vehicle: {transfer['vehicle_number']}")
    notes_parts.append(
        f"Inter-branch stock transfer "
        f"{transfer.get('source_distributor_name', '')} ({transfer.get('source_location_name', '')}) "
        f"→ {transfer.get('dest_distributor_name', '')} ({transfer.get('dest_location_name', '')})."
    )
    if transfer.get("notes"):
        notes_parts.append(transfer["notes"])
    notes = "\n".join(notes_parts).strip()

    invoice_payload = {
        "customer_id": customer_id,
        "reference_number": transfer.get("transfer_number"),
        "date": (transfer.get("transfer_date") or datetime.now(timezone.utc).strftime("%Y-%m-%d"))[:10],
        "line_items": line_items,
        "notes": notes,
    }

    # Optional per-tenant invoice template override (mirrors create_invoice_for_delivery).
    tenant_creds = await get_credentials(tenant_id) or {}
    invoice_tmpl = (tenant_creds.get("invoice_template_id") or "").strip()
    if invoice_tmpl:
        invoice_payload["template_id"] = invoice_tmpl

    result = await _zoho_request("POST", "/books/v3/invoices", tenant_id=tenant_id, json=invoice_payload)
    invoice = result.get("invoice") or {}
    zoho_invoice_id = invoice.get("invoice_id")
    zoho_invoice_number = invoice.get("invoice_number")

    # Flip draft → sent so the invoice appears as an open receivable instantly.
    if zoho_invoice_id:
        try:
            await _zoho_request(
                "POST",
                f"/books/v3/invoices/{zoho_invoice_id}/status/sent",
                tenant_id=tenant_id,
            )
        except Exception as e:
            logger.warning(
                f"[zoho] Could not mark stock-transfer invoice {zoho_invoice_number} as sent: {e}. "
                "It will stay in Drafts until sent manually."
            )

    creds = await get_credentials(tenant_id) or {}
    zoho_invoice_url = invoice.get("invoice_url") or _zoho_books_url(zoho_invoice_id, creds)

    now = datetime.now(timezone.utc).isoformat()
    mapping_doc = {
        "tenant_id": tenant_id,
        "source_type": "stock_transfer",
        "source_id": transfer.get("id"),
        "source_number": transfer.get("transfer_number"),
        "zoho_invoice_id": zoho_invoice_id,
        "zoho_invoice_number": zoho_invoice_number,
        "zoho_invoice_url": zoho_invoice_url,
        "zoho_doc_type": "invoice",
        "status": "synced",
        "created_at": now,
        "updated_at": now,
    }
    await db.zoho_invoice_mappings.update_one(
        {"tenant_id": tenant_id, "source_type": "stock_transfer", "source_id": transfer.get("id")},
        {"$set": mapping_doc, "$setOnInsert": {"first_synced_at": now}},
        upsert=True,
    )
    return mapping_doc


# ---------- Background sync orchestrator (3 retries, exponential backoff) ----------

async def sync_delivery_to_zoho(tenant_id: str, distributor_id: str, delivery_id: str) -> None:
    """Background task: push a delivery to Zoho with retry. Never raises.

    Only deliveries dispatched from a **factory warehouse** (`distributor_locations.is_factory == True`)
    generate Zoho invoices. Deliveries from a distributor's own warehouse are skipped — those
    are handled by the distributor's own billing flow.
    """
    # First-pass guard: if the account is billed by a third-party distributor
    # we skip the push regardless of Zoho connection state. Run this BEFORE
    # the connectivity checks so the UI surfaces the right reason even on
    # tenants that haven't connected Zoho yet.
    delivery = await db.distributor_deliveries.find_one(
        {"id": delivery_id, "tenant_id": tenant_id, "distributor_id": distributor_id},
        {"_id": 0, "account_id": 1, "delivery_number": 1, "is_promo": 1}
    )
    # Promotional stock-outs are zero-value give-aways that push a delivery
    # CHALLAN (handled by the promo flow), never a tax invoice. Guard here so a
    # manual "push to Zoho" from the regular Deliveries UI can't create an
    # invoice for a promo delivery.
    if delivery and delivery.get("is_promo"):
        raise ZohoPushSkippedError(
            "This is a promotional stock-out — it generates a delivery challan, not an invoice."
        )
    if delivery and delivery.get("account_id"):
        acc_meta = await db.accounts.find_one(
            {"id": delivery["account_id"], "tenant_id": tenant_id},
            {"_id": 0, "account_name": 1, "billed_by": 1}
        ) or {}
        if (acc_meta.get("billed_by") or "company").lower() == "distributor":
            logger.info(
                f"sync_delivery_to_zoho: account {acc_meta.get('account_name')} is billed by "
                f"third-party distributor; skipping Zoho push for delivery {delivery.get('delivery_number')}"
            )
            raise ZohoPushSkippedError(
                f"Account '{acc_meta.get('account_name')}' is billed by a third-party distributor — Zoho invoice not generated."
            )

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

    # Guard: only stock-outs from company-owned warehouses are invoiced via Zoho.
    # A warehouse qualifies when it is either a Factory warehouse (`is_factory`)
    # OR belongs to a self-managed distributor (`distributors.is_self_managed`).
    # Third-party distributor warehouses are skipped — they bill in their own books.
    src_loc_id = delivery.get("distributor_location_id")
    if not src_loc_id:
        logger.info(f"sync_delivery_to_zoho: delivery {delivery.get('delivery_number')} has no source location; skipping")
        raise ZohoPushSkippedError("Delivery has no source warehouse — cannot determine if it should be invoiced via Zoho.")
    src_loc = await db.distributor_locations.find_one(
        {"id": src_loc_id, "tenant_id": tenant_id},
        {"_id": 0, "is_factory": 1, "location_name": 1, "distributor_id": 1}
    )
    loc_name = (src_loc or {}).get("location_name") or "(unknown)"
    is_factory = bool(src_loc and src_loc.get("is_factory"))
    is_self_managed = False
    if src_loc and not is_factory:
        src_dist = await db.distributors.find_one(
            {"id": src_loc.get("distributor_id"), "tenant_id": tenant_id},
            {"_id": 0, "is_self_managed": 1}
        )
        is_self_managed = bool(src_dist and src_dist.get("is_self_managed"))
    if not (is_factory or is_self_managed):
        logger.info(
            f"sync_delivery_to_zoho: delivery {delivery.get('delivery_number')} dispatched from "
            f"third-party distributor warehouse '{loc_name}'; skipping Zoho push"
        )
        raise ZohoPushSkippedError(
            f"This delivery is dispatched from '{loc_name}', which belongs to a third-party distributor. "
            "Only company-owned warehouses (Factory warehouses or self-managed distributors) are invoiced via Zoho "
            "(third-party distributors bill in their own books). "
            "If this should be invoiced via Zoho, mark the source warehouse as Factory, or mark its distributor as Self-Managed."
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

    # Product rule: when an account is billed by a third-party distributor
    # (account.billed_by == 'distributor') we don't push to Zoho at all — the
    # distributor raises the invoice in their own books. The CRM still tracks
    # the delivery; only the Zoho leg is skipped.
    billed_by = (account.get("billed_by") or "company").lower()
    if billed_by == "distributor":
        logger.info(
            f"sync_delivery_to_zoho: account {account.get('account_name')} is billed by "
            f"third-party distributor; skipping Zoho push for delivery {delivery.get('delivery_number')}"
        )
        raise ZohoPushSkippedError(
            f"Account '{account.get('account_name')}' is billed by a third-party distributor — Zoho invoice not generated."
        )

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
        except ZohoBranchNotMappedError as e:
            # Don't retry: warehouse→branch mapping is a configuration issue.
            last_error = str(e)
            logger.warning(
                f"Zoho push aborted (warehouse not mapped to a Zoho Branch) for delivery "
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


async def _load_delivery_context(tenant_id: str, distributor_id: str, delivery_id: str, require_zoho: bool = True):
    """Load (delivery, items, account) for a delivery, raising friendly errors.
    `require_zoho=False` skips the connectivity guards (used by the local preview,
    which performs no Zoho calls)."""
    if require_zoho:
        if not is_zoho_configured():
            raise ZohoPushSkippedError("Zoho Books integration is not configured on this tenant.")
        if not await get_credentials(tenant_id):
            raise ZohoPushSkippedError("Zoho Books is not connected for this tenant.")
    delivery = await db.distributor_deliveries.find_one(
        {"id": delivery_id, "tenant_id": tenant_id, "distributor_id": distributor_id}, {"_id": 0})
    if not delivery:
        raise ZohoPushSkippedError("Delivery not found.")
    items = await db.distributor_delivery_items.find(
        {"delivery_id": delivery_id, "tenant_id": tenant_id}, {"_id": 0}).to_list(500)
    if not items:
        raise ZohoPushSkippedError("This delivery has no line items to invoice.")
    account = await db.accounts.find_one(
        {"id": delivery.get("account_id"), "tenant_id": tenant_id}, {"_id": 0}
    ) or {"account_name": delivery.get("account_name") or "Customer"}
    return delivery, items, account


async def regenerate_delivery_invoice(tenant_id: str, distributor_id: str, delivery_id: str) -> dict:
    """Regenerate the Zoho invoice for a delivery (e.g. after a discount fix).

    Tries an in-place update of the existing invoice first (same number); on a
    Zoho rejection it voids + recreates. Raises InvoiceNotRegenerableError if the
    invoice is paid/has credits and can be neither edited nor voided. Returns the
    mapping doc (incl. `regen_mode` = updated | recreated | created)."""
    delivery, items, account = await _load_delivery_context(tenant_id, distributor_id, delivery_id)
    return await create_invoice_for_delivery(
        tenant_id=tenant_id, delivery=delivery, items=items, account=account, force=True)


async def build_delivery_invoice_preview(tenant_id: str, distributor_id: str, delivery_id: str) -> dict:
    """Compute a pre-push preview of the delivery invoice (line items at the
    account-agreed price, per-line % discount, subtotal, total discount and net
    taxable amount). GST is applied by Zoho per each SKU's tax mapping, so it is
    not estimated here — the preview lets reps verify quantities/rates/discounts
    BEFORE the invoice is generated."""
    delivery, items, account = await _load_delivery_context(tenant_id, distributor_id, delivery_id, require_zoho=False)
    agreed: dict[str, float] = {}
    for p in (account.get("sku_pricing") or []):
        key = (p.get("sku") or p.get("sku_name") or "").strip().lower()
        if key:
            try:
                agreed[key] = float(p.get("price_per_unit") or p.get("agreed_price") or 0)
            except (TypeError, ValueError):
                agreed[key] = 0.0
    lines, subtotal, total_discount = [], 0.0, 0.0
    missing = []
    uom_map = await _base_uom_map(tenant_id, items)
    for it in items:
        name = (it.get("sku_name") or it.get("sku_code") or "").strip()
        rate = agreed.get(name.lower())
        if rate is None or rate <= 0:
            if name and name not in missing:
                missing.append(name)
            rate = 0.0
        qty = float(it.get("quantity", 0) or 0)
        disc_pct = float(it.get("discount_percent", 0) or 0)
        gross = round(qty * rate, 2)
        disc_amt = round(gross * disc_pct / 100.0, 2)
        net = round(gross - disc_amt, 2)
        subtotal += gross
        total_discount += disc_amt
        lines.append({
            "sku_name": name or "(unnamed)", "quantity": qty, "rate": rate,
            "discount_percent": disc_pct, "gross_amount": gross,
            "discount_amount": disc_amt, "net_amount": net,
            "batch_code": it.get("batch_code"),
            "packaging_type_name": it.get("packaging_type_name"),
            "packaging_units": it.get("packaging_units"),
            "packages": it.get("packages"),
            "base_uom": uom_map.get(it.get("sku_id"), "Bottle"),
        })
    subtotal = round(subtotal, 2)
    total_discount = round(total_discount, 2)
    existing = await db.zoho_invoice_mappings.find_one(
        {"tenant_id": tenant_id, "source_type": "distributor_delivery",
         "source_id": delivery_id, "status": "synced"},
        {"_id": 0, "zoho_invoice_id": 1, "zoho_invoice_number": 1})
    return {
        "delivery_number": delivery.get("delivery_number"),
        "account_name": account.get("account_name"),
        "currency": "INR",
        "lines": lines,
        "subtotal": subtotal,
        "total_discount": total_discount,
        "net_taxable_amount": round(subtotal - total_discount, 2),
        "gst_note": "GST is added by Zoho per each SKU's tax mapping at push time.",
        "missing_agreed_price_skus": missing,
        "already_invoiced": bool(existing and existing.get("zoho_invoice_id")),
        "existing_invoice_number": (existing or {}).get("zoho_invoice_number"),
    }



# ── Warehouse → Zoho Branch sync ──────────────────────────────────────────
async def sync_warehouse_to_zoho_branch(*, tenant_id: str, location: dict) -> dict:
    """Push a self-managed warehouse's address, GSTIN and contact details into
    the matched Zoho branch so the printed Tax-Invoice / Delivery-Challan PDF
    carries the correct registered address for that branch.

    Pre-conditions:
        • `is_zoho_configured()` is True for the tenant.
        • The warehouse already has a `zoho_branch_id` filled in (we deliberately
          do NOT create branches automatically — Zoho requires `tax_settings_id`
          configs that must be set up by the user in the Zoho UI first).

    Returns the updated branch dict from Zoho on success.
    """
    if not is_zoho_configured():
        raise ZohoPushSkippedError(
            "Zoho Books integration is not configured. Connect Zoho first under "
            "Settings → Integrations → Zoho Books."
        )

    branch_id = (location.get("zoho_branch_id") or "").strip()
    if not branch_id:
        raise ZohoPushSkippedError(
            "This warehouse is not yet linked to a Zoho branch. Open the warehouse → "
            "fill in the Zoho Branch ID (from Zoho Books → Settings → Branches) and "
            "save before clicking Sync."
        )

    addr = {
        "street_address1": (
            location.get("address_line_1")  # canonical column name in distributor_locations
            or location.get("address_line1")
            or location.get("address")
            or ""
        )[:200],
        "street_address2": (location.get("address_line_2") or location.get("address_line2") or "")[:200],
        "city":            (location.get("city") or "")[:100],
        "state":           (location.get("state") or "")[:100],
        "zip":             str(location.get("pincode") or "")[:20],
        "country":         (location.get("country") or "India")[:50],
        "phone":           (location.get("contact_number") or location.get("phone") or "")[:50],
    }

    payload = {
        # Branch display name (kept in sync with what the warehouse is called in CRM)
        "branch_name": location.get("location_name") or "",
        # All Zoho branches require an address; we send it once at this top level
        # and Zoho replicates it to billing & shipping when blank.
        "address": addr,
        "billing_address": addr,
        "shipping_address": addr,
        # GSTIN attached to this branch — the whole reason multi-branch sync matters.
        "gstin": (location.get("gstin") or "").strip(),
        "is_primary_branch": False,
    }
    # Drop empty top-level scalars so Zoho doesn't overwrite an existing value
    # with a blank one (we only push what the CRM actually has).
    payload = {k: v for k, v in payload.items() if v not in ("", None)}

    result = await _zoho_request(
        "PUT",
        f"/books/v3/branches/{branch_id}",
        tenant_id=tenant_id,
        json=payload,
        max_attempts=2,
        timeout=10.0,
    )
    return result.get("branch") or result


async def update_stock_transfer_zoho_quantities(tenant_id: str, transfer_doc: dict) -> dict:
    """Best-effort sync of edited package quantities onto the EXISTING Zoho
    Invoice / Delivery Challan for a stock transfer (read-modify-write so the
    line_item_ids are preserved and lines are updated in place, not duplicated).

    Returns {ok, error, action}. Never raises — a failure flags the caller so
    the local inventory edit still succeeds and Zoho can be fixed manually.
    """
    zoho_id = transfer_doc.get("zoho_invoice_id")
    doc_type = transfer_doc.get("zoho_doc_type") or "invoice"
    if not zoho_id or transfer_doc.get("zoho_status") != "synced":
        return {"ok": True, "error": None, "action": "skipped"}

    resource = "deliverychallans" if doc_type == "delivery_challan" else "invoices"
    key = "deliverychallan" if doc_type == "delivery_challan" else "invoice"
    new_items = transfer_doc.get("items") or []
    try:
        current = await _zoho_request("GET", f"/books/v3/{resource}/{zoho_id}", tenant_id=tenant_id)
        zdoc = current.get(key) or {}
        existing_lines = zdoc.get("line_items") or []
        # Our line_items are pushed 1:1 in the same order as transfer["items"],
        # so match by index and only change `quantity` (in packages).
        updated_lines = []
        for idx, line in enumerate(existing_lines):
            new_line = {
                "line_item_id": line.get("line_item_id"),
                "item_id": line.get("item_id"),
                "name": line.get("name"),
                "rate": line.get("rate"),
            }
            if idx < len(new_items):
                new_line["quantity"] = float(new_items[idx].get("quantity", 0) or 0)
            else:
                new_line["quantity"] = float(line.get("quantity", 0) or 0)
            updated_lines.append(new_line)

        if not updated_lines:
            return {"ok": True, "error": None, "action": "no_lines"}

        await _zoho_request(
            "PUT",
            f"/books/v3/{resource}/{zoho_id}",
            tenant_id=tenant_id,
            json={"line_items": updated_lines},
        )
        return {"ok": True, "error": None, "action": f"{key}_updated"}
    except Exception as e:
        logger.warning(
            f"[zoho] Failed to update quantities on {doc_type} for stock transfer "
            f"{transfer_doc.get('transfer_number')}: {e}"
        )
        return {"ok": False, "error": str(e)[:500], "action": "failed"}


# ---------- Stock In (factory → distributor shipment) Tax Invoice ----------

async def create_invoice_for_shipment(
    *, tenant_id: str, shipment: dict, items: list[dict], distributor: dict
) -> dict:
    """Push a Nyla Stock In (factory → distributor) shipment as a Zoho Books
    *Tax Invoice*, billing the DISTRIBUTOR who receives the stock.

    Pricing follows EXACTLY what the Stock In record already stores: each line's
    `unit_price` already encodes the distributor's billing approach —
      • cost-based  → unit_price == base_price (margin applied later at reconciliation)
      • margin_upfront → unit_price == transfer_price (= base − margin)
    so we simply push `rate = unit_price` and let the per-SKU Zoho item tax
    mapping apply GST (same model as `create_invoice_for_delivery`).

    Sibling of `create_invoice_for_stock_transfer`; mapping uses
    `source_type='distributor_shipment'`.
    """
    if not is_zoho_configured():
        raise RuntimeError("Zoho Books integration is not configured (ZOHO_CLIENT_ID missing).")

    # Idempotency — if this shipment was already pushed, return existing mapping.
    existing_mapping = await db.zoho_invoice_mappings.find_one(
        {"tenant_id": tenant_id, "source_type": "distributor_shipment",
         "source_id": shipment.get("id"), "status": "synced"},
        {"_id": 0},
    )
    if existing_mapping and existing_mapping.get("zoho_invoice_id"):
        logger.info(
            f"Zoho invoice already synced for shipment "
            f"{shipment.get('shipment_number')}; skipping re-push."
        )
        return existing_mapping

    # Bill the distributor receiving the stock.
    customer_id = await upsert_contact(tenant_id, {
        "id": distributor.get("id"),
        "account_name": distributor.get("distributor_name") or distributor.get("legal_entity_name"),
        "legal_entity_name": distributor.get("legal_entity_name") or distributor.get("distributor_name"),
        "gst_legal_name": distributor.get("legal_entity_name") or distributor.get("distributor_name"),
        "gst_trade_name": distributor.get("distributor_name") or distributor.get("legal_entity_name"),
        "gstin": distributor.get("gstin"),
        "primary_contact_name": distributor.get("primary_contact_name"),
        "primary_contact_email": distributor.get("primary_contact_email"),
        "primary_contact_mobile": distributor.get("primary_contact_mobile"),
        "billing_address": distributor.get("billing_address") or distributor.get("registered_address"),
        "delivery_address": distributor.get("registered_address"),
        "zoho_contact_id": distributor.get("zoho_contact_id"),
    })

    # Build line items — rate = the shipment item's stored unit_price (already
    # base-vs-transfer correct), GST applied via each SKU's Zoho item tax mapping.
    line_items: list[dict] = []
    uom_map = await _base_uom_map(tenant_id, items)
    for it in items:
        zoho_item_id = await get_zoho_item_id(tenant_id, it.get("sku_id"))
        sku_name = (it.get("sku_name") or it.get("sku_code") or "Item").strip()
        description = _line_description(it, uom_map.get(it.get("sku_id"), "Bottle"))
        line_items.append({
            "item_id": zoho_item_id,
            "name": sku_name,
            "description": description,
            "quantity": float(it.get("quantity", 0) or 0),
            "rate": float(it.get("unit_price", 0) or 0),
            # Per-line PERCENTAGE discount (see delivery invoice note above).
            "discount": f"{float(it.get('discount_percent', 0) or 0):g}%",
        })

    if not line_items:
        raise RuntimeError(f"Shipment {shipment.get('shipment_number')} has no items to push.")

    invoice_payload = {
        "customer_id": customer_id,
        "reference_number": shipment.get("shipment_number"),
        "date": (shipment.get("shipment_date") or datetime.now(timezone.utc).strftime("%Y-%m-%d"))[:10],
        "line_items": line_items,
        "discount_type": "item_level",
        "is_discount_before_tax": True,
        "notes": f"Generated from Nyla CRM Stock In {shipment.get('shipment_number')}",
    }

    # Branch (multi-GSTIN): book the invoice under the SOURCE factory warehouse's
    # Zoho Branch so Zoho applies that warehouse's GSTIN + correct CGST/SGST/IGST.
    src_wh_id = shipment.get("source_warehouse_id")
    src_wh = None
    if src_wh_id:
        src_wh = await db.distributor_locations.find_one(
            {"id": src_wh_id, "tenant_id": tenant_id},
            {"_id": 0, "zoho_branch_id": 1, "location_name": 1},
        )
    branch_id = (src_wh or {}).get("zoho_branch_id")
    if branch_id:
        invoice_payload["branch_id"] = str(branch_id)
    else:
        loc_name = (src_wh or {}).get("location_name") or "the source warehouse"
        raise ZohoBranchNotMappedError(
            f"Source factory warehouse '{loc_name}' is not mapped to a Zoho Branch, so "
            f"the invoice would carry the wrong GSTIN. Map it to the correct Zoho Branch "
            f"under Admin → Fleet/Warehouses, then retry the push."
        )

    tenant_creds = await get_credentials(tenant_id) or {}
    invoice_tmpl = (tenant_creds.get("invoice_template_id") or "").strip()
    if invoice_tmpl:
        invoice_payload["template_id"] = invoice_tmpl

    result = await _zoho_request("POST", "/books/v3/invoices", tenant_id=tenant_id, json=invoice_payload)
    invoice = result.get("invoice") or {}
    zoho_invoice_id = invoice.get("invoice_id")
    zoho_invoice_number = invoice.get("invoice_number")

    # Flip draft → sent so it appears as an open receivable instantly.
    if zoho_invoice_id:
        try:
            await _zoho_request(
                "POST", f"/books/v3/invoices/{zoho_invoice_id}/status/sent", tenant_id=tenant_id,
            )
        except Exception as e:
            logger.warning(
                f"[zoho] Could not mark shipment invoice {zoho_invoice_number} as sent: {e}. "
                "It will stay in Drafts until sent manually."
            )

    creds = await get_credentials(tenant_id) or {}
    zoho_invoice_url = invoice.get("invoice_url") or _zoho_books_url(zoho_invoice_id, creds)

    now = datetime.now(timezone.utc).isoformat()

    # Stamp Zoho identifiers on the source shipment (visible on Stock In detail).
    try:
        await db.distributor_shipments.update_one(
            {"id": shipment.get("id"), "tenant_id": tenant_id},
            {"$set": {
                "zoho_invoice_id": zoho_invoice_id,
                "zoho_invoice_number": zoho_invoice_number,
                "zoho_invoice_url": zoho_invoice_url,
                "zoho_synced_at": now,
                "zoho_push_pending": False,
                "zoho_push_error": None,
            }}
        )
    except Exception as e:
        logger.warning(f"Failed to stamp Zoho ids on shipment {shipment.get('id')}: {e}")

    mapping_doc = {
        "tenant_id": tenant_id,
        "source_type": "distributor_shipment",
        "source_id": shipment.get("id"),
        "source_reference": shipment.get("shipment_number"),
        "distributor_id": shipment.get("distributor_id"),
        "zoho_invoice_id": zoho_invoice_id,
        "zoho_invoice_number": zoho_invoice_number,
        "zoho_invoice_url": zoho_invoice_url,
        "zoho_customer_id": customer_id,
        "zoho_doc_type": "invoice",
        "status": "synced",
        "synced_at": now,
        "error": None,
        "attempts": 1,
    }
    await db.zoho_invoice_mappings.update_one(
        {"tenant_id": tenant_id, "source_type": "distributor_shipment", "source_id": shipment.get("id")},
        {"$set": mapping_doc, "$setOnInsert": {"created_at": now}},
        upsert=True,
    )
    return mapping_doc


async def sync_shipment_to_zoho(tenant_id: str, distributor_id: str, shipment_id: str) -> None:
    """Background task: push a confirmed Stock In shipment to Zoho with retry.
    Never raises for transient errors — records a failure flag so the UI can
    surface a Retry. Raises ZohoPushSkippedError only for clear skip cases."""
    if not is_zoho_configured():
        logger.info("Zoho not configured, skipping shipment auto-push")
        raise ZohoPushSkippedError("Zoho Books integration is not configured on this tenant.")
    creds = await get_credentials(tenant_id)
    if not creds:
        logger.info(f"Zoho not connected for tenant {tenant_id}, skipping shipment auto-push")
        raise ZohoPushSkippedError("Zoho Books is not connected for this tenant. Go to Settings → Integrations → Zoho Books and click Connect.")

    shipment = await db.distributor_shipments.find_one(
        {"id": shipment_id, "tenant_id": tenant_id, "distributor_id": distributor_id}, {"_id": 0}
    )
    if not shipment:
        logger.warning(f"sync_shipment_to_zoho: shipment {shipment_id} not found")
        raise ZohoPushSkippedError("Shipment not found.")

    items = await db.distributor_shipment_items.find(
        {"shipment_id": shipment_id, "tenant_id": tenant_id}, {"_id": 0}
    ).to_list(500)
    if not items:
        logger.warning(f"sync_shipment_to_zoho: no items for shipment {shipment_id}")
        raise ZohoPushSkippedError("This shipment has no line items to invoice.")

    distributor = await db.distributors.find_one(
        {"id": distributor_id, "tenant_id": tenant_id}, {"_id": 0}
    )
    if not distributor:
        raise ZohoPushSkippedError("Distributor not found for this shipment.")

    backoff_seconds = [0, 4, 16]  # 3 attempts: immediate, +4s, +16s
    last_error: Optional[str] = None
    for attempt, wait_s in enumerate(backoff_seconds, start=1):
        if wait_s:
            await asyncio.sleep(wait_s)
        try:
            await create_invoice_for_shipment(
                tenant_id=tenant_id, shipment=shipment, items=items, distributor=distributor
            )
            logger.info(f"Zoho invoice created for shipment {shipment.get('shipment_number')} (attempt {attempt})")
            return
        except (MissingZohoMappingError, ZohoBranchNotMappedError) as e:
            # Configuration issues — don't retry.
            last_error = str(e)
            logger.warning(f"Zoho push aborted (config) for shipment {shipment.get('shipment_number')}: {e}")
            break
        except Exception as e:
            last_error = str(e)
            logger.warning(
                f"Zoho push attempt {attempt}/{len(backoff_seconds)} failed for shipment "
                f"{shipment.get('shipment_number')}: {e}"
            )

    # All attempts failed — flag for retry.
    await record_sync_failure(
        tenant_id=tenant_id,
        source_type="distributor_shipment",
        source_id=shipment_id,
        source_reference=shipment.get("shipment_number"),
        distributor_id=distributor_id,
        error=last_error or "Unknown error",
        attempts=len(backoff_seconds),
    )
    try:
        await db.distributor_shipments.update_one(
            {"id": shipment_id, "tenant_id": tenant_id},
            {"$set": {"zoho_push_pending": True, "zoho_push_error": (last_error or "Unknown error")[:500]}},
        )
    except Exception:
        logger.exception(f"Failed to flag zoho_push_pending on shipment {shipment_id}")


# ---------- Bank Transactions (Banking feed) — read for Accounting sync ----------

async def fetch_bank_transactions(
    tenant_id: str, date_start: str = None, date_end: str = None,
    page: int = 1, per_page: int = 200, status: str = "All",
) -> dict:
    """Fetch a page of Zoho Books bank transactions (the bank-feed lines).
    Requires the ZohoBooks.banking.READ scope on the connected account.

    `status` defaults to "All" so we pull EVERY transaction regardless of state
    (uncategorized, categorized, matched, manually_added, excluded). NOTE: the
    correct parameter for this endpoint is `status` — `filter_by` is NOT valid
    for /banktransactions and causes a 400.

    Zoho's date_start/date_end filters are unreliable for this endpoint (often
    ignored server-side), so callers must additionally filter by date client-side.
    Returns {"transactions": [...], "has_more": bool, "page": n}."""
    if not is_zoho_configured():
        raise RuntimeError("Zoho Books integration is not configured.")
    params = {"page": page, "per_page": per_page}
    if status:
        params["status"] = status
    if date_start:
        params["date_start"] = date_start
    if date_end:
        params["date_end"] = date_end
    result = await _zoho_request("GET", "/books/v3/banktransactions", tenant_id=tenant_id, params=params)
    txns = result.get("banktransactions") or result.get("bank_transactions") or []
    ctx = result.get("page_context") or {}
    return {"transactions": txns, "has_more": bool(ctx.get("has_more_page")), "page": page}


async def fetch_bank_accounts(tenant_id: str) -> list:
    """List the org's bank / credit-card accounts (chart-of-accounts banking
    nodes). Used to enumerate accounts for the per-account uncategorized pull."""
    if not is_zoho_configured():
        raise RuntimeError("Zoho Books integration is not configured.")
    result = await _zoho_request("GET", "/books/v3/bankaccounts", tenant_id=tenant_id,
                                 params={"per_page": 200})
    return result.get("bankaccounts") or result.get("bank_accounts") or []


async def fetch_uncategorized_bank_transactions(
    tenant_id: str, account_id: str, date_start: str = None, date_end: str = None,
    page: int = 1, per_page: int = 200, strategy: str = "endpoint",
) -> dict:
    """Fetch a page of UNCATEGORIZED bank-feed statement lines for one account.

    These are a SEPARATE Zoho resource from the categorized/matched register
    transactions returned by /banktransactions?status=All. Two strategies are
    supported because Zoho's banking surface is inconsistent across orgs:
      • strategy="endpoint": GET /banktransactions/uncategorized?account_id=...
      • strategy="status":   GET /banktransactions?account_id=...&status=uncategorized
    `account_id` is required for both. Returns {"transactions", "has_more", "page"}."""
    if not is_zoho_configured():
        raise RuntimeError("Zoho Books integration is not configured.")
    params = {"account_id": account_id, "page": page, "per_page": per_page}
    if date_start:
        params["date_start"] = date_start
    if date_end:
        params["date_end"] = date_end
    if strategy == "status":
        params["status"] = "uncategorized"
        path = "/books/v3/banktransactions"
    else:
        path = "/books/v3/banktransactions/uncategorized"
    result = await _zoho_request("GET", path, tenant_id=tenant_id, params=params)
    txns = result.get("banktransactions") or result.get("bank_transactions") or []
    ctx = result.get("page_context") or {}
    return {"transactions": txns, "has_more": bool(ctx.get("has_more_page")), "page": page}
