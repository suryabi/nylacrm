"""
Accounts routes - Account CRUD, invoices, SKU pricing, contracts
Multi-tenant aware - all queries automatically filter by tenant_id
"""
from fastapi import APIRouter, HTTPException, Depends, UploadFile, File, Query
from typing import List, Optional
from datetime import datetime, timezone
from pydantic import BaseModel, Field
import uuid
import re
import base64

from database import get_tenant_db
from deps import get_current_user
from core.tenant import get_current_tenant_id
from services.external_invoices_service import (
    is_external_payload,
    create_external_invoice,
    update_external_invoice,
)

router = APIRouter()

def get_tdb():
    """Get tenant-aware database wrapper"""
    return get_tenant_db()


def _account_match(account_id: str) -> dict:
    """Mongo filter that matches either the UUID (`id`) or the human code
    (`account_id`) — frontend URLs use either depending on the page."""
    return {'$or': [{'id': account_id}, {'account_id': account_id}]}


# Common company-name suffixes/noise stripped before name-based reconciliation.
_COMPANY_NOISE = {
    'pvt', 'private', 'ltd', 'limited', 'llp', 'inc', 'incorporated', 'co',
    'company', 'corp', 'corporation', 'enterprises', 'enterprise', 'and', 'the',
}


def _norm_company_name(name) -> str:
    """Normalise a company name for one-time ID-bootstrap reconciliation:
    lowercase, strip punctuation, drop common business suffixes (Pvt/Ltd/...),
    collapse whitespace. So 'Varma Steels Pvt Ltd' == 'Varma Steels Private
    Limited' == 'M/s Varma Steels Pvt. Ltd.'. Returns '' when nothing usable
    remains (we never match on an empty token)."""
    if not name:
        return ''
    s = re.sub(r'[^a-z0-9\s]', ' ', str(name).lower())
    tokens = [t for t in s.split() if len(t) > 1 and t not in _COMPANY_NOISE and t != 'ms']
    return ' '.join(tokens).strip()


# ============= MODELS =============

class AccountSKUPricing(BaseModel):
    # Stable identifier that survives `master_skus.sku_name` renames. Optional
    # for backwards compat with rows created before this field existed — the
    # admin → "Sync SKU names" migration backfills it by current-name match.
    sku_id: Optional[str] = None
    sku: str
    price_per_unit: float = 0.0
    return_bottle_credit: float = 0.0
    # MRP printed on the invoice for this account. Optional on the model
    # (older rows don't have it) but **required** for every row before an
    # account can be activated.
    mrp: Optional[float] = None
    # Optional validity window. When set we only consider this row "active"
    # if `active_from <= today <= active_to`. Either bound may be omitted to
    # mean "no lower / upper bound" respectively. Plain ISO date strings
    # (YYYY-MM-DD) — kept as `Optional[str]` to avoid breaking historical rows
    # that already exist without these fields.
    active_from: Optional[str] = None
    active_to: Optional[str] = None


class DeliveryAddress(BaseModel):
    address_line1: Optional[str] = None
    address_line2: Optional[str] = None
    city: Optional[str] = None
    state: Optional[str] = None
    pincode: Optional[str] = None
    landmark: Optional[str] = None
    lat: Optional[float] = None
    lng: Optional[float] = None
    formatted_address: Optional[str] = None


class BillingAddress(BaseModel):
    address_line1: Optional[str] = None
    address_line2: Optional[str] = None
    city: Optional[str] = None
    state: Optional[str] = None
    pincode: Optional[str] = None


class Account(BaseModel):
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    account_id: str
    lead_id: str
    account_name: str
    account_type: Optional[str] = None
    contact_name: Optional[str] = None
    contact_number: Optional[str] = None
    city: str
    state: str
    territory: str
    assigned_to: Optional[str] = None
    next_follow_up: Optional[str] = None
    sku_pricing: List[AccountSKUPricing] = []
    outstanding_balance: float = 0.0
    overdue_amount: float = 0.0
    last_payment_date: Optional[str] = None
    last_payment_amount: float = 0.0
    onboarded_month: Optional[int] = None
    onboarded_year: Optional[int] = None
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    updated_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))

    class Config:
        extra = "allow"


class AccountCreate(BaseModel):
    lead_id: str


class AccountUpdate(BaseModel):
    account_name: Optional[str] = None
    account_type: Optional[str] = None
    category: Optional[str] = None
    contact_name: Optional[str] = None
    contact_number: Optional[str] = None
    gst_number: Optional[str] = None
    next_follow_up: Optional[str] = None
    sku_pricing: Optional[List[AccountSKUPricing]] = None
    delivery_address: Optional[DeliveryAddress] = None
    onboarded_month: Optional[int] = None
    onboarded_year: Optional[int] = None
    # ── Customer's Delivery & Accounting section ──
    delivery_contact_name: Optional[str] = None
    delivery_contact_phone: Optional[str] = None
    billing_address: Optional[BillingAddress] = None
    pan_number: Optional[str] = None
    gst_legal_name: Optional[str] = None
    gst_trade_name: Optional[str] = None
    gst_registration_date: Optional[str] = None
    gst_certificate_url: Optional[str] = None
    # Net credit period agreed with the customer. When set, we pass this
    # through to Zoho on every invoice we push so the due-date computes
    # correctly. e.g. 0 = "Due on Receipt", 15 = "Net 15", 30 = "Net 30".
    payment_terms_days: Optional[int] = None
    payment_terms_label: Optional[str] = None
    # Pre-activation billing route — `'company'` (we invoice → Zoho sync) or
    # `'distributor'` (third-party distributor invoices). Exposed here so the
    # operator can save the choice independently of the activation flow, since
    # stock-out / invoice gates downstream depend on it.
    billed_by: Optional[str] = Field(None, pattern='^(company|distributor)$')


class PaginatedAccountsResponse(BaseModel):
    data: List[Account]
    total: int
    page: int
    page_size: int
    total_pages: int


# ============= HELPER FUNCTIONS =============

async def generate_account_id(company: str, city: str) -> str:
    """Generate unique Account ID in format: NAME4-CITY-AYY-SEQ"""
    tdb = get_tdb()
    clean_company = re.sub(r'[^a-zA-Z0-9]', '', company).upper()
    name4 = clean_company[:4].ljust(4, 'X')
    
    clean_city = re.sub(r'[^a-zA-Z0-9]', '', city).upper()
    city3 = clean_city[:3].ljust(3, 'X')
    
    year2 = datetime.now().strftime('%y')
    prefix = f"{name4}-{city3}-A{year2}-"
    
    regex_pattern = f"^{re.escape(prefix)}\\d{{3}}$"
    existing = await tdb.accounts.find(
        {'account_id': {'$regex': regex_pattern}},
        {'account_id': 1}
    ).sort('account_id', -1).limit(1).to_list(1)
    
    if existing and existing[0].get('account_id'):
        last_seq = int(existing[0]['account_id'][-3:])
        next_seq = last_seq + 1
    else:
        next_seq = 1
    
    if next_seq > 999:
        next_seq = 1
    
    seq3 = str(next_seq).zfill(3)
    return f"{name4}-{city3}-A{year2}-{seq3}"


# ============= ACCOUNT ROUTES =============

@router.post("/relink-invoices")
async def relink_invoices_to_accounts(
    dry_run: bool = Query(False, description="Preview only; do not write any changes"),
    current_user: dict = Depends(get_current_user),
):
    """Backfill the stable CRM account linkage (`account_uuid` + `account_id`
    code) onto every invoice using ID-based keys ONLY — never names.

    Invoices synced from Zoho / matched to leads often carry the Zoho customer
    id or a lead link but NOT the CRM account id, so the account-detail page
    can't associate them. This re-stamps the canonical account id so matching is
    deterministic going forward.

    Resolution priority (first hit wins):
      1) existing `account_uuid` already resolves to an account (leave as-is)
      2) `account_id` resolves (by account UUID or human code)
      3) `zoho_customer_id` / `zoho_contact_id` -> account.zoho_contact_id
      4) `lead_uuid` -> account.lead_id
      5) `ca_lead_id` (formatted lead id) -> lead -> account.lead_id
    Anything matching none is reported under `unresolved`.
    """
    role = (current_user.get('role') or '').strip()
    if role not in ('CEO', 'Admin', 'System Admin'):
        raise HTTPException(status_code=403, detail='Only CEO / Admin can relink invoices')

    tdb = get_tdb()
    accounts = await tdb.accounts.find(
        {}, {'_id': 0, 'id': 1, 'account_id': 1, 'zoho_contact_id': 1, 'lead_id': 1, 'account_name': 1}
    ).to_list(50000)
    by_uuid, by_code, by_zoho, by_lead = {}, {}, {}, {}
    by_norm_name: dict = {}
    for a in accounts:
        if a.get('id'):
            by_uuid[a['id']] = a
        if a.get('account_id'):
            by_code[str(a['account_id']).lower()] = a
        if a.get('zoho_contact_id'):
            by_zoho[str(a['zoho_contact_id'])] = a
        if a.get('lead_id'):
            by_lead[a['lead_id']] = a
        nn = _norm_company_name(a.get('account_name'))
        if nn:
            by_norm_name.setdefault(nn, []).append(a)

    leads = await tdb.leads.find({}, {'_id': 0, 'id': 1, 'lead_id': 1}).to_list(100000)
    lead_fmt_to_uuid = {
        str(le['lead_id']).lower(): le.get('id') for le in leads if le.get('lead_id')
    }

    invoices = await tdb.invoices.find(
        {}, {'_id': 0, 'id': 1, 'invoice_no': 1, 'account_id': 1, 'account_uuid': 1,
             'zoho_customer_id': 1, 'zoho_contact_id': 1, 'lead_uuid': 1, 'ca_lead_id': 1,
             'account_name': 1, 'customer_name': 1}
    ).to_list(500000)

    def resolve(inv):
        au = inv.get('account_uuid')
        if au and au in by_uuid:
            return by_uuid[au], 'account_uuid'
        aid = inv.get('account_id')
        if aid:
            if aid in by_uuid:
                return by_uuid[aid], 'account_id_uuid'
            if str(aid).lower() in by_code:
                return by_code[str(aid).lower()], 'account_code'
        z = inv.get('zoho_customer_id') or inv.get('zoho_contact_id')
        if z and str(z) in by_zoho:
            return by_zoho[str(z)], 'zoho_customer_id'
        lu = inv.get('lead_uuid')
        if lu and lu in by_lead:
            return by_lead[lu], 'lead_uuid'
        cl = inv.get('ca_lead_id')
        if cl:
            luid = lead_fmt_to_uuid.get(str(cl).lower())
            if luid and luid in by_lead:
                return by_lead[luid], 'ca_lead_id'
        # LAST RESORT (one-time bootstrap only): normalized company name, but
        # ONLY when it maps to exactly one account (never guess across dupes).
        nn = _norm_company_name(inv.get('account_name') or inv.get('customer_name'))
        if nn and nn in by_norm_name:
            cands = by_norm_name[nn]
            if len(cands) == 1:
                return cands[0], 'name_normalized'
            return None, 'ambiguous_name'
        return None, None

    scanned = len(invoices)
    updated = 0
    already_linked = 0
    by_key: dict = {}
    unresolved: list = []
    ambiguous_name = 0

    for inv in invoices:
        acc, key = resolve(inv)
        if not acc:
            if key == 'ambiguous_name':
                ambiguous_name += 1
            unresolved.append(inv.get('invoice_no') or inv.get('id'))
            continue
        desired_uuid = acc.get('id')
        desired_code = acc.get('account_id')
        if inv.get('account_uuid') == desired_uuid and inv.get('account_id') == desired_code:
            already_linked += 1
            continue
        updated += 1
        by_key[key] = by_key.get(key, 0) + 1
        if not dry_run:
            await tdb.invoices.update_one(
                {'id': inv.get('id')},
                {'$set': {'account_uuid': desired_uuid, 'account_id': desired_code}},
            )

    return {
        'dry_run': dry_run,
        'scanned': scanned,
        'updated': updated,
        'already_linked': already_linked,
        'unresolved_count': len(unresolved),
        'ambiguous_name_count': ambiguous_name,
        'by_key': by_key,
        # Cap the list so the response stays small; count is authoritative.
        'unresolved_sample': unresolved[:50],
    }



@router.post("/convert-lead")
async def convert_lead_to_account(data: AccountCreate, current_user: dict = Depends(get_current_user)):
    """Convert a won lead to an account"""
    tdb = get_tdb()
    lead = await tdb.leads.find_one({'id': data.lead_id}, {'_id': 0})
    if not lead:
        raise HTTPException(status_code=404, detail='Lead not found')
    
    # Check if already converted
    existing = await tdb.accounts.find_one({'lead_id': data.lead_id}, {'_id': 0})
    if existing:
        raise HTTPException(status_code=400, detail='Lead already converted to account')
    
    # Generate account ID
    account_id = await generate_account_id(lead['company'], lead['city'])
    
    # Map SKU pricing from lead's proposed pricing.
    # Default each row's validity window to "active from today, no end date" so
    # the converted account is immediately quotable. MRP is intentionally NOT
    # carried over — it's an account-level concept (per-customer / per-channel)
    # and must be set by the user under Account Detail before activation.
    today_iso = datetime.now(timezone.utc).date().isoformat()
    sku_pricing = []
    if lead.get('proposed_sku_pricing'):
        for sku_item in lead['proposed_sku_pricing']:
            sku_pricing.append({
                # Carry `sku_id` if the lead row has it — this is the stable
                # identifier that survives renames. The legacy `sku` (name)
                # is still saved for backwards compat / display fallbacks.
                'sku_id': sku_item.get('sku_id'),
                'sku': sku_item.get('sku', ''),
                'price_per_unit': sku_item.get('proposed_price', sku_item.get('price_per_unit', 0)),
                'return_bottle_credit': sku_item.get('bottle_return_credit', sku_item.get('return_bottle_credit', 0)),
                'mrp': None,
                'active_from': sku_item.get('active_from') or today_iso,
                'active_to': sku_item.get('active_to') or None,
            })
    
    # Create account - tenant_id added automatically by TenantDB
    account_data = {
        'id': str(uuid.uuid4()),
        'account_id': account_id,
        'lead_id': data.lead_id,
        'account_name': lead['company'],
        'account_type': lead.get('tier'),
        'category': lead.get('category'),
        'contact_name': lead.get('contact_person') or lead.get('name'),
        'contact_number': lead.get('phone'),
        'city': lead['city'],
        'state': lead['state'],
        'territory': lead.get('region', ''),
        'assigned_to': lead.get('assigned_to'),
        'sku_pricing': sku_pricing,
        'outstanding_balance': 0.0,
        'overdue_amount': 0.0,
        'onboarded_month': lead.get('onboarded_month'),
        'onboarded_year': lead.get('onboarded_year'),
        'created_at': datetime.now(timezone.utc).isoformat(),
        'updated_at': datetime.now(timezone.utc).isoformat()
    }
    
    await tdb.accounts.insert_one(account_data)
    
    # Update lead with account reference
    await tdb.leads.update_one(
        {'id': data.lead_id},
        {'$set': {
            'converted_to_account': True,
            'account_id': account_data['id'],
            'updated_at': datetime.now(timezone.utc).isoformat()
        }}
    )
    
    return {'account': account_data, 'message': 'Lead converted to account successfully'}


@router.get("", response_model=PaginatedAccountsResponse)
async def get_accounts(
    page: int = 1,
    page_size: int = 20,
    search: Optional[str] = None,
    territory: Optional[str] = None,
    state: Optional[str] = None,
    city: Optional[str] = None,
    account_type: Optional[str] = None,
    category: Optional[str] = None,
    current_user: dict = Depends(get_current_user)
):
    """Get paginated list of accounts"""
    tdb = get_tdb()
    query = {}
    
    if search:
        query['$or'] = [
            {'account_name': {'$regex': search, '$options': 'i'}},
            {'account_id': {'$regex': search, '$options': 'i'}},
            {'contact_name': {'$regex': search, '$options': 'i'}}
        ]
    
    if territory:
        query['territory'] = territory
    
    if state:
        query['state'] = state
    
    if city:
        query['city'] = city
    
    if account_type:
        query['account_type'] = account_type
    
    if category:
        query['category'] = category
    
    total = await tdb.accounts.count_documents(query)
    skip = (page - 1) * page_size
    
    accounts = await tdb.accounts.find(query, {'_id': 0}).sort('created_at', -1).skip(skip).limit(page_size).to_list(page_size)
    
    # Add sales person name
    for account in accounts:
        if account.get('assigned_to'):
            user = await tdb.users.find_one({'id': account['assigned_to']}, {'_id': 0, 'name': 1})
            account['sales_person_name'] = user.get('name') if user else None
        
        if isinstance(account.get('created_at'), str):
            account['created_at'] = datetime.fromisoformat(account['created_at'].replace('Z', '+00:00'))
        if isinstance(account.get('updated_at'), str):
            account['updated_at'] = datetime.fromisoformat(account['updated_at'].replace('Z', '+00:00'))
    
    total_pages = (total + page_size - 1) // page_size
    
    return PaginatedAccountsResponse(
        data=accounts,
        total=total,
        page=page,
        page_size=page_size,
        total_pages=total_pages
    )


@router.get("/stats/summary")
async def get_accounts_stats(
    territory: Optional[str] = None,
    state: Optional[str] = None,
    city: Optional[str] = None,
    current_user: dict = Depends(get_current_user)
):
    """Get account statistics summary"""
    tdb = get_tdb()
    query = {}
    if territory:
        query['territory'] = territory
    if state:
        query['state'] = state
    if city:
        query['city'] = city
    
    total = await tdb.accounts.count_documents(query)
    
    # Count by lead_type (B2B / Retail / Individual)
    b2b = await tdb.accounts.count_documents({**query, 'lead_type': 'B2B'})
    retail = await tdb.accounts.count_documents({**query, 'lead_type': 'Retail'})
    individual = await tdb.accounts.count_documents({**query, 'lead_type': 'Individual'})
    # Accounts without lead_type default to B2B (matches frontend display fallback)
    b2b_no_type = await tdb.accounts.count_documents({**query, 'lead_type': {'$in': [None, '']}})
    b2b_total = b2b + b2b_no_type

    # Top categories - aggregate with tenant filter
    pipeline = [
        {'$group': {'_id': '$category', 'count': {'$sum': 1}}},
        {'$sort': {'count': -1}},
        {'$limit': 5}
    ]
    categories = await tdb.accounts.aggregate(pipeline).to_list(5)

    return {
        'total': total,
        'total_accounts': total,
        'by_lead_type': {
            'B2B': b2b_total,
            'Retail': retail,
            'Individual': individual,
        },
        'top_categories': categories
    }


@router.get("/{account_id}")
async def get_account(account_id: str, current_user: dict = Depends(get_current_user)):
    """Get a single account by ID"""
    tdb = get_tdb()
    account = await tdb.accounts.find_one(_account_match(account_id), {'_id': 0})
    if not account:
        raise HTTPException(status_code=404, detail='Account not found')
    
    # Add sales person name
    if account.get('assigned_to'):
        user = await tdb.users.find_one({'id': account['assigned_to']}, {'_id': 0, 'name': 1})
        account['sales_person_name'] = user.get('name') if user else None
    
    return account


@router.put("/{account_id}")
async def update_account(account_id: str, update: AccountUpdate, current_user: dict = Depends(get_current_user)):
    """Update an account"""
    tdb = get_tdb()
    existing = await tdb.accounts.find_one(_account_match(account_id), {'_id': 0})
    if not existing:
        raise HTTPException(status_code=404, detail='Account not found')
    
    update_data = {}
    for key, value in update.model_dump().items():
        if value is not None:
            if key == 'sku_pricing':
                update_data[key] = [s.model_dump() if hasattr(s, 'model_dump') else s for s in value]
            elif key == 'delivery_address':
                update_data[key] = value.model_dump() if hasattr(value, 'model_dump') else value
            else:
                update_data[key] = value
    
    update_data['updated_at'] = datetime.now(timezone.utc).isoformat()
    
    await tdb.accounts.update_one(_account_match(account_id), {'$set': update_data})

    updated = await tdb.accounts.find_one(_account_match(account_id), {'_id': 0})

    # ── Best-effort Zoho re-sync ──
    # If this account is already linked to a Zoho contact AND any Zoho-relevant
    # field changed in this update, push the new values to Zoho so the very
    # next invoice / credit-note uses the updated Bill To / Ship To / GST /
    # contact info — without the user needing to deactivate/reactivate.
    ZOHO_RELEVANT_FIELDS = {
        'billing_address', 'delivery_address',
        'gst_number', 'pan_number', 'gst_legal_name', 'gst_trade_name',
        'contact_name', 'contact_number', 'account_name',
        'delivery_contact_name', 'delivery_contact_phone',
    }
    changed_zoho_fields = ZOHO_RELEVANT_FIELDS.intersection(update_data.keys())
    if changed_zoho_fields and updated and updated.get('zoho_contact_id'):
        billed_by = (updated.get('billed_by') or 'company').lower()
        if billed_by == 'company':
            try:
                from services import zoho_service as _zoho
                if _zoho.is_zoho_configured():
                    tenant_id = get_current_tenant_id()
                    creds = await _zoho.get_credentials(tenant_id)
                    if creds:
                        await _zoho.upsert_contact(tenant_id, updated)
                        _logger.info(
                            f"[zoho] Re-synced contact for account {updated.get('account_id')} "
                            f"after edits: {sorted(changed_zoho_fields)}"
                        )
            except Exception as e:
                # Never break the user's save because Zoho is down / mis-configured.
                # The change is already in our DB — the user can hit save again
                # later or manually re-sync.
                _logger.warning(
                    f"[zoho] Auto re-sync failed for account {updated.get('account_id')}: {e}"
                )

    return updated


@router.delete("/{account_id}")
async def delete_account(account_id: str, current_user: dict = Depends(get_current_user)):
    """Delete an account"""
    tdb = get_tdb()
    account = await tdb.accounts.find_one(_account_match(account_id), {'_id': 0})
    if not account:
        raise HTTPException(status_code=404, detail='Account not found')
    
    # Remove account reference from lead
    if account.get('lead_id'):
        await tdb.leads.update_one(
            {'id': account['lead_id']},
            {'$set': {'converted_to_account': False, 'account_id': None}}
        )
    
    await tdb.accounts.delete_one(_account_match(account_id))
    
    return {'message': 'Account deleted successfully'}


@router.delete("/{account_id}/purge")
async def purge_account_completely(
    account_id: str,
    confirm: str = Query(..., description="Must equal 'YES-PURGE-ACCOUNT' to proceed"),
    current_user: dict = Depends(get_current_user),
):
    """DANGER: Deep-delete an account AND every record that references it —
    invoices, deliveries, activities, returns, credit notes, case targets,
    Zoho mappings, etc. CEO / System Admin only. Requires explicit confirm.

    Returns a dict with per-collection deletion counts so callers can audit.
    """
    user_role = (current_user.get('role') or '').strip()
    if user_role not in ('CEO', 'System Admin'):
        raise HTTPException(status_code=403, detail='Only CEO and System Admin can purge an account.')
    if confirm != 'YES-PURGE-ACCOUNT':
        raise HTTPException(status_code=400, detail="Pass ?confirm=YES-PURGE-ACCOUNT to confirm this destructive action.")

    tdb = get_tdb()
    account = await tdb.accounts.find_one(_account_match(account_id), {'_id': 0})
    if not account:
        raise HTTPException(status_code=404, detail='Account not found')

    # Collect every identifier the account can be matched by across other collections
    acc_uuid = account.get('id')
    acc_code = account.get('account_id')
    acc_lead_id = account.get('lead_id')
    acc_name = account.get('account_name')

    # ── 1. Invoices: match by every possible foreign-key shape used in the system
    inv_or: list[dict] = []
    if acc_uuid:
        inv_or += [{'account_uuid': acc_uuid}, {'account_id': acc_uuid}]
    if acc_code:
        inv_or += [{'account_id': acc_code}, {'account_id_from_mq': acc_code}]
    if acc_lead_id:
        inv_or += [{'ca_lead_id': acc_lead_id}, {'lead_id': acc_lead_id}]
    if acc_name:
        inv_or.append({'customer_name': acc_name})
    invoices_deleted = 0
    if inv_or:
        r = await tdb.invoices.delete_many({'$or': inv_or})
        invoices_deleted = r.deleted_count

    # ── 2. Distributor deliveries + their line items
    deliveries_deleted = 0
    delivery_items_deleted = 0
    delivery_ids: list[str] = []
    if acc_uuid:
        async for d in tdb.distributor_deliveries.find(
            {'$or': [{'account_id': acc_uuid}, {'account_uuid': acc_uuid}]},
            {'_id': 0, 'id': 1}
        ):
            if d.get('id'):
                delivery_ids.append(d['id'])
        if delivery_ids:
            di = await tdb.distributor_delivery_items.delete_many({'delivery_id': {'$in': delivery_ids}})
            delivery_items_deleted = di.deleted_count
        r = await tdb.distributor_deliveries.delete_many(
            {'$or': [{'account_id': acc_uuid}, {'account_uuid': acc_uuid}]}
        )
        deliveries_deleted = r.deleted_count

    # ── 3. Customer returns + linked credit notes & issuances
    return_ids: list[str] = []
    credit_note_ids: list[str] = []
    if acc_uuid:
        async for ret in tdb.customer_returns.find(
            {'account_id': acc_uuid}, {'_id': 0, 'id': 1, 'credit_note_id': 1}
        ):
            if ret.get('id'):
                return_ids.append(ret['id'])
            if ret.get('credit_note_id'):
                credit_note_ids.append(ret['credit_note_id'])
    returns_deleted = (await tdb.customer_returns.delete_many({'account_id': acc_uuid})).deleted_count if acc_uuid else 0
    credit_notes_deleted = 0
    if credit_note_ids:
        credit_notes_deleted = (await tdb.credit_notes.delete_many({'id': {'$in': credit_note_ids}})).deleted_count
        await tdb.credit_note_issuances.delete_many({'credit_note_id': {'$in': credit_note_ids}})

    # ── 4. Zoho mappings for delivery / return / contact (best-effort)
    zoho_mappings_deleted = 0
    zoho_or: list[dict] = []
    if delivery_ids:
        zoho_or.append({'source_type': 'distributor_delivery', 'source_id': {'$in': delivery_ids}})
    if return_ids:
        zoho_or.append({'source_type': 'customer_return', 'source_id': {'$in': return_ids}})
    if zoho_or:
        try:
            r = await tdb.zoho_invoice_mappings.delete_many({'$or': zoho_or})
            zoho_mappings_deleted = r.deleted_count
        except Exception:
            pass

    # ── 5. Account-level config / scoring / case targets
    case_targets_deleted = (await tdb.account_case_targets.delete_many({'account_id': acc_uuid})).deleted_count if acc_uuid else 0

    # ── 6. Activities (linked via lead_id of the account)
    activities_deleted = 0
    if acc_lead_id:
        activities_deleted = (await tdb.lead_activities.delete_many({'lead_id': acc_lead_id})).deleted_count

    # ── 7. Tasks bound to this account (if any)
    tasks_deleted = 0
    task_or: list[dict] = []
    if acc_uuid:
        task_or += [{'account_id': acc_uuid}, {'related_account_id': acc_uuid}]
    if acc_lead_id:
        task_or += [{'lead_id': acc_lead_id}]
    if task_or:
        try:
            r = await tdb.tasks.delete_many({'$or': task_or})
            tasks_deleted = r.deleted_count
        except Exception:
            pass

    # ── 8. Reset the source lead so the user can re-convert later if needed
    if acc_lead_id:
        await tdb.leads.update_one(
            {'id': acc_lead_id},
            {'$set': {'converted_to_account': False, 'account_id': None}}
        )

    # ── 9. Finally — the account itself
    account_deleted = (await tdb.accounts.delete_one(_account_match(account_id))).deleted_count

    return {
        'success': True,
        'account_id': acc_code or acc_uuid,
        'account_name': acc_name,
        'deleted': {
            'account': account_deleted,
            'invoices': invoices_deleted,
            'deliveries': deliveries_deleted,
            'delivery_items': delivery_items_deleted,
            'customer_returns': returns_deleted,
            'credit_notes': credit_notes_deleted,
            'zoho_mappings': zoho_mappings_deleted,
            'case_targets': case_targets_deleted,
            'activities': activities_deleted,
            'tasks': tasks_deleted,
        },
    }


class ZohoContactIdUpdate(BaseModel):
    zoho_contact_id: Optional[str] = None  # None / "" clears the link


@router.patch("/{account_id}/zoho-contact")
async def update_zoho_contact_id(
    account_id: str,
    payload: ZohoContactIdUpdate,
    current_user: dict = Depends(get_current_user),
):
    """Manually set / clear the Zoho contact_id for an account.

    Use this when the auto-match (by email/name) misses the right Zoho contact —
    paste the Zoho contact_id directly from the Zoho Books URL or contact details
    page. Pass `zoho_contact_id: null` (or empty string) to unlink.
    """
    user_role = (current_user.get('role') or '').strip()
    if user_role not in ('CEO', 'System Admin'):
        raise HTTPException(status_code=403, detail='Only CEO and System Admin can edit the Zoho contact link.')

    tdb = get_tdb()
    account = await tdb.accounts.find_one(_account_match(account_id), {'_id': 0, 'id': 1, 'account_name': 1, 'zoho_contact_id': 1})
    if not account:
        raise HTTPException(status_code=404, detail='Account not found')

    new_id = (payload.zoho_contact_id or '').strip() or None

    await tdb.accounts.update_one(
        {'id': account['id']},
        {'$set': {
            'zoho_contact_id': new_id,
            'updated_at': datetime.now(timezone.utc).isoformat(),
        }}
    )

    return {
        'success': True,
        'account_id': account.get('id'),
        'account_name': account.get('account_name'),
        'previous_zoho_contact_id': account.get('zoho_contact_id'),
        'zoho_contact_id': new_id,
    }



@router.get("/{account_id}/sku-pricing")
async def get_account_sku_pricing(account_id: str, current_user: dict = Depends(get_current_user)):
    """Get SKU pricing for an account"""
    tdb = get_tdb()
    tenant_id = get_current_tenant_id()
    
    account = await tdb.accounts.find_one(_account_match(account_id), {'_id': 0})
    if not account:
        raise HTTPException(status_code=404, detail='Account not found')
    
    # Get account-specific SKU pricing
    sku_pricing = await tdb.account_sku_pricing.find(
        {'account_id': account_id, 'tenant_id': tenant_id},
        {'_id': 0}
    ).to_list(500)
    
    # If no account-specific pricing, get from the account's sku_pricing field
    if not sku_pricing and account.get('sku_pricing'):
        sku_pricing = account.get('sku_pricing', [])
    
    # Enrich with SKU details from master_skus
    enriched_pricing = []
    for pricing in sku_pricing:
        sku_id = pricing.get('sku_id')
        if sku_id:
            sku = await tdb.master_skus.find_one({'id': sku_id}, {'_id': 0, 'name': 1, 'sku_code': 1, 'hsn_code': 1, 'base_price': 1})
            enriched_pricing.append({
                **pricing,
                'sku_name': sku.get('name') if sku else pricing.get('sku_name'),
                'sku_code': sku.get('sku_code') if sku else pricing.get('sku_code'),
                'hsn_code': sku.get('hsn_code') if sku else pricing.get('hsn_code'),
                'base_price': sku.get('base_price') if sku else pricing.get('base_price', 0)
            })
        else:
            enriched_pricing.append(pricing)
    
    return {'sku_pricing': enriched_pricing, 'account_id': account_id}


# ============= INVOICE ROUTES =============

@router.get("/{account_id}/invoices")
async def get_account_invoices(account_id: str, current_user: dict = Depends(get_current_user)):
    """Get all invoices for an account"""
    tdb = get_tdb()
    account = await tdb.accounts.find_one(_account_match(account_id), {'_id': 0})
    if not account:
        raise HTTPException(status_code=404, detail='Account not found')
    
    # Get invoices by account_id or lead's lead_id
    lead = await tdb.leads.find_one({'id': account.get('lead_id')}, {'_id': 0, 'lead_id': 1})
    
    query = {'$or': [{'account_id': account_id}]}
    if lead and lead.get('lead_id'):
        query['$or'].append({'ca_lead_id': lead['lead_id']})
    
    invoices = await tdb.invoices.find(query, {'_id': 0}).sort('invoice_date', -1).to_list(1000)
    
    # Calculate totals
    total_gross = sum(inv.get('gross_invoice_value', 0) for inv in invoices)
    total_net = sum(inv.get('net_invoice_value', 0) for inv in invoices)
    total_credit = sum(inv.get('credit_note_value', 0) for inv in invoices)
    total_outstanding = sum(inv.get('outstanding', 0) or 0 for inv in invoices)
    
    return {
        'invoices': invoices,
        'summary': {
            'total_gross': total_gross,
            'total_net': total_net,
            'total_credit': total_credit,
            'total_outstanding': total_outstanding,
            'invoice_count': len(invoices)
        }
    }


@router.delete("/{account_id}/invoices")
async def delete_all_account_invoices(account_id: str, current_user: dict = Depends(get_current_user)):
    """Bulk-delete every invoice for an account. Restricted to CEO and System Admin.

    Also resets the account's invoice-derived rollups (outstanding_balance, totals,
    invoice_count, last_payment, last_invoice_*) so the UI reflects the cleared state.
    """
    role = (current_user.get('role') or '').strip()
    if role not in ('CEO', 'System Admin'):
        raise HTTPException(status_code=403, detail='Only CEO and System Admin can delete invoices in bulk')

    tdb = get_tdb()
    account = await tdb.accounts.find_one(_account_match(account_id), {'_id': 0})
    if not account:
        raise HTTPException(status_code=404, detail='Account not found')

    # Match invoices either by internal UUID or the external CA lead id (legacy linkage)
    lead = await tdb.leads.find_one({'id': account.get('lead_id')}, {'_id': 0, 'lead_id': 1})
    or_clauses = [{'account_id': account_id}, {'account_uuid': account_id}]
    if lead and lead.get('lead_id'):
        or_clauses.append({'ca_lead_id': lead['lead_id']})

    deleted = await tdb.invoices.delete_many({'$or': or_clauses})

    # Reset the account's invoice-derived financial rollups
    await tdb.accounts.update_one(
        {'id': account_id},
        {'$set': {
            'outstanding_balance': 0.0,
            'total_gross_invoice_value': 0.0,
            'total_net_invoice_value': 0.0,
            'total_credit_note_value': 0.0,
            'invoice_count': 0,
            'last_invoice_no': None,
            'last_invoice_date': None,
            'last_payment_amount': None,
            'last_payment_date': None,
            'updated_at': datetime.now(timezone.utc).isoformat(),
        }}
    )

    return {
        'deleted': True,
        'count': deleted.deleted_count,
        'account_id': account_id,
    }




@router.post("/{account_id}/invoices")
async def create_account_invoice(account_id: str, invoice_data: dict, current_user: dict = Depends(get_current_user)):
    """Create an invoice for an account.

    Supports two payload shapes:
    1. Internal CRM (legacy): `{line_items, invoice_date, notes}` — uses internal UUID account id, computes COGS/margin.
    2. External system: `{invoiceNo, invoiceDate, grossInvoiceValue, items[{itemId,...}], ...}` — itemId maps to master_skus.external_sku_id.
    """
    if is_external_payload(invoice_data):
        return await create_external_invoice(account_id, invoice_data, current_user.get('id'))

    tdb = get_tdb()
    account = await tdb.accounts.find_one(_account_match(account_id), {'_id': 0})
    if not account:
        raise HTTPException(status_code=404, detail='Account not found')
    
    # Generate invoice number
    today = datetime.now().strftime('%Y%m%d')
    count = await tdb.invoices.count_documents({'invoice_no': {'$regex': f'^INV-{today}'}})
    invoice_no = f"INV-{today}-{str(count + 1).zfill(4)}"
    
    # Get COGS data for the account's city
    city = account.get('city', '')
    line_items = invoice_data.get('line_items', [])
    processed_items = []
    total_amount = 0
    total_cogs = 0
    total_logistics = 0
    
    for item in line_items:
        sku_name = item.get('sku')
        bottles = item.get('bottles', 0)
        price_per_bottle = item.get('price_per_bottle', 0)
        line_total = bottles * price_per_bottle
        
        # Get COGS for this SKU in this city - cogs_data is tenant-aware
        cogs_data = await tdb.cogs_data.find_one(
            {'sku_name': sku_name, 'city': city},
            {'_id': 0}
        )
        
        cogs_per_bottle = cogs_data.get('total_cogs', 0) if cogs_data else 0
        logistics_per_bottle = cogs_data.get('outbound_logistics_cost', 0) if cogs_data else 0
        
        cogs_total = cogs_per_bottle * bottles
        logistics_total = logistics_per_bottle * bottles
        margin = line_total - cogs_total - logistics_total
        margin_percent = (margin / line_total * 100) if line_total > 0 else 0
        
        processed_items.append({
            'sku': sku_name,
            'bottles': bottles,
            'price_per_bottle': price_per_bottle,
            'line_total': line_total,
            'cogs_per_bottle': cogs_per_bottle,
            'cogs_total': cogs_total,
            'logistics_per_bottle': logistics_per_bottle,
            'logistics_total': logistics_total,
            'margin': margin,
            'margin_percent': round(margin_percent, 2)
        })
        
        total_amount += line_total
        total_cogs += cogs_total
        total_logistics += logistics_total
    
    gross_margin = total_amount - total_cogs - total_logistics
    gross_margin_percent = (gross_margin / total_amount * 100) if total_amount > 0 else 0
    
    invoice = {
        'id': str(uuid.uuid4()),
        'invoice_no': invoice_no,
        'invoice_date': invoice_data.get('invoice_date', datetime.now().strftime('%Y-%m-%d')),
        'account_id': account_id,
        'account_name': account.get('account_name'),
        'city': city,
        'line_items': processed_items,
        'gross_invoice_value': total_amount,
        'net_invoice_value': total_amount,
        'credit_note_value': 0,
        'total_cogs': total_cogs,
        'total_logistics': total_logistics,
        'gross_margin': gross_margin,
        'gross_margin_percent': round(gross_margin_percent, 2),
        'notes': invoice_data.get('notes', ''),
        'created_by': current_user['id'],
        'created_at': datetime.now(timezone.utc).isoformat()
    }
    
    await tdb.invoices.insert_one(invoice)
    
    return {
        'invoice': invoice,
        'margin_summary': {
            'gross_margin': gross_margin,
            'gross_margin_percent': round(gross_margin_percent, 2)
        }
    }


@router.put("/{account_id}/invoices/{invoice_no}")
async def update_account_invoice(
    account_id: str,
    invoice_no: str,
    invoice_data: dict,
    current_user: dict = Depends(get_current_user),
):
    """Update an existing invoice from an external system.

    Expects external-system payload (`invoiceNo`, `invoiceDate`, `grossInvoiceValue`, `items[]`).
    `account_id` may be the human ACCOUNT_ID code (e.g. ORLO-HYD-A26-001) or the UUID.
    `invoice_no` is the stored `id` (== external invoiceNo).
    """
    if not is_external_payload(invoice_data):
        raise HTTPException(
            status_code=400,
            detail="PUT /accounts/{account_id}/invoices/{invoice_no} expects external-system payload (invoiceNo, invoiceDate, items[]).",
        )
    return await update_external_invoice(account_id, invoice_no, invoice_data, current_user.get('id'))


# ============= LOGO ROUTES =============

@router.post("/{account_id}/logo")
async def upload_account_logo(
    account_id: str,
    logo: UploadFile = File(...),
    current_user: dict = Depends(get_current_user)
):
    """Upload a logo for an account"""
    tdb = get_tdb()
    account = await tdb.accounts.find_one(_account_match(account_id), {'_id': 0})
    if not account:
        raise HTTPException(status_code=404, detail='Account not found')
    
    content = await logo.read()
    if len(content) > 5 * 1024 * 1024:
        raise HTTPException(status_code=400, detail='File too large (max 5MB)')
    
    logo_base64 = base64.b64encode(content).decode('utf-8')
    logo_data = f"data:{logo.content_type};base64,{logo_base64}"
    
    await tdb.accounts.update_one(
        _account_match(account_id),
        {'$set': {'logo': logo_data, 'updated_at': datetime.now(timezone.utc).isoformat()}}
    )
    
    return {'message': 'Logo uploaded successfully', 'logo': logo_data}


@router.delete("/{account_id}/logo")
async def delete_account_logo(account_id: str, current_user: dict = Depends(get_current_user)):
    """Delete an account's logo"""
    tdb = get_tdb()
    result = await tdb.accounts.update_one(
        _account_match(account_id),
        {'$unset': {'logo': ''}, '$set': {'updated_at': datetime.now(timezone.utc).isoformat()}}
    )
    
    if result.modified_count == 0:
        raise HTTPException(status_code=404, detail='Account not found')
    
    return {'message': 'Logo deleted successfully'}


# ============= ACCOUNT ACTIVATION =============

class ActivationChecklist(BaseModel):
    """Sales-confirmation checklist that must all be True before an account
    can be activated and synced to Zoho Books as a customer."""
    gst_updated: bool
    delivery_address_updated: bool
    sku_prices_correct: bool
    delivery_contact_updated: bool
    logo_uploaded: bool
    payment_terms_set: bool
    # Who bills this customer:
    #   "company"     → Nyla bills the customer directly → create a Zoho Books contact
    #   "distributor" → A third-party distributor bills them → DO NOT register in Zoho
    # Default 'company' to preserve legacy behaviour for any caller that
    # doesn't send the field.
    billed_by: str = Field('company', pattern='^(company|distributor)$')


async def _is_user_in_management_chain(tdb, user_id: str, target_user_id: str, max_depth: int = 8) -> bool:
    """Returns True if `user_id` is anywhere in the upward management chain of
    `target_user_id` (i.e. target's manager, or manager's manager, etc.).
    """
    if not user_id or not target_user_id or user_id == target_user_id:
        return False
    current = target_user_id
    for _ in range(max_depth):
        u = await tdb.users.find_one({'id': current}, {'_id': 0, 'reports_to': 1})
        if not u:
            return False
        parent = u.get('reports_to')
        if not parent:
            return False
        if parent == user_id:
            return True
        current = parent
    return False


@router.get("/{account_id}/activation-status")
async def get_activation_status(
    account_id: str,
    current_user: dict = Depends(get_current_user),
):
    """Returns which of the 4 onboarding checks currently pass for this
    account, so the activation modal can render them as auto-validated."""
    tdb = get_tdb()
    account = await tdb.accounts.find_one(_account_match(account_id), {'_id': 0})
    if not account:
        raise HTTPException(status_code=404, detail='Account not found')

    da = account.get('delivery_address') or {}
    sku_pricing = account.get('sku_pricing') or []

    # Build sku_name → allow_custom_mrp map so we can skip MRP validation for
    # SKUs that don't have the feature toggled on.
    allow_mrp_by_name: dict = {}
    if sku_pricing:
        async for ms in tdb.master_skus.find(
            {}, {'_id': 0, 'sku_name': 1, 'sku': 1, 'name': 1, 'allow_custom_mrp': 1}
        ):
            flag = bool(ms.get('allow_custom_mrp', False))
            for k in ('sku_name', 'sku', 'name'):
                v = ms.get(k)
                if v:
                    allow_mrp_by_name[str(v).strip().lower()] = flag

    def _row_passes_mrp(p: dict) -> bool:
        key = str(p.get('sku') or p.get('sku_name') or '').strip().lower()
        # Rows whose SKU doesn't allow custom MRP always pass.
        if not allow_mrp_by_name.get(key, False):
            return True
        try:
            return p.get('mrp') is not None and float(p['mrp']) > 0
        except (TypeError, ValueError):
            return False

    sku_pricing_complete = bool(sku_pricing) and all(_row_passes_mrp(p) for p in sku_pricing)

    return {
        'is_active': account.get('status') == 'active',
        'checks': {
            'gst_updated': bool((account.get('gst_number') or '').strip()),
            'delivery_address_updated': bool(
                da.get('address_line1') and da.get('city') and da.get('state') and da.get('pincode')
            ),
            # True only when there's at least one row AND every row has its
            # own MRP. Renamed in the UI to "SKU Pricing and MRP pricing is
            # correct".
            'sku_prices_correct': sku_pricing_complete,
            'delivery_contact_updated': bool(
                account.get('delivery_contact_name') and account.get('delivery_contact_phone')
            ),
            'logo_uploaded': bool((account.get('logo_url') or '').strip()) or bool((account.get('logo') or '').strip()),
            # Net 0 is a legitimate term ("Due on Receipt") so we accept 0 as set —
            # we only consider it missing when the field is None.
            'payment_terms_set': account.get('payment_terms_days') is not None,
        },
    }


@router.post("/{account_id}/activate")
async def activate_account(
    account_id: str,
    checklist: ActivationChecklist,
    current_user: dict = Depends(get_current_user),
):
    """Activate a freshly-converted account.

    The 4 checklist items are AUTO-VALIDATED against the account state — even if
    a privileged user sends `true` for everything, we re-verify the underlying
    data before activating.
    """
    if not all([
        checklist.gst_updated,
        checklist.delivery_address_updated,
        checklist.sku_prices_correct,
        checklist.delivery_contact_updated,
        checklist.logo_uploaded,
        checklist.payment_terms_set,
    ]):
        raise HTTPException(status_code=400, detail='All checklist items must be confirmed before activation.')

    tdb = get_tdb()
    account = await tdb.accounts.find_one(_account_match(account_id), {'_id': 0})
    if not account:
        raise HTTPException(status_code=404, detail='Account not found')

    # ── Permission check ──
    role = (current_user or {}).get('role') or ''
    user_id = (current_user or {}).get('id')
    privileged_roles = {'CEO', 'Admin', 'System Admin'}
    allowed = (
        role in privileged_roles
        or (account.get('assigned_to') and account['assigned_to'] == user_id)
        or await _is_user_in_management_chain(tdb, user_id, account.get('assigned_to') or '')
    )
    if not allowed:
        raise HTTPException(
            status_code=403,
            detail='Only the assigned salesperson, their managers, CEO or Admin can activate this account.'
        )

    # ── Auto-validate the 4 checklist items against actual account data ──
    failures: list = []
    if not (account.get('gst_number') or '').strip():
        failures.append('GST number is missing on the account. Upload the GST certificate first.')
    da = account.get('delivery_address') or {}
    if not (da.get('address_line1') and da.get('city') and da.get('state') and da.get('pincode')):
        failures.append('Delivery address is incomplete (line 1, city, state and PIN are required).')
    if not (account.get('delivery_contact_name') and account.get('delivery_contact_phone')):
        failures.append('Delivery contact name and phone are required.')
    sku_pricing = account.get('sku_pricing') or []
    if not sku_pricing:
        failures.append('No SKU pricing configured. Add agreed prices under SKU Pricing.')
    if not (account.get('logo_url') or '').strip() and not (account.get('logo') or '').strip():
        failures.append('Account logo is missing. Upload it under Account Logo.')
    if account.get('payment_terms_days') is None:
        failures.append('Payment terms are not set. Choose Net 0 / 7 / 30 / 45 under Customer\u2019s Delivery & Accounting.')

    # Every SKU pricing row whose MASTER SKU has `allow_custom_mrp=True` must
    # have an MRP > 0 on the row. Rows referencing SKUs without the flag are
    # exempt — MRP is hidden in the UI for them anyway.
    if sku_pricing:
        # Build sku_name → allow_custom_mrp map from the master.
        allow_mrp_by_name: dict = {}
        async for ms in tdb.master_skus.find(
            {}, {'_id': 0, 'sku_name': 1, 'sku': 1, 'name': 1, 'allow_custom_mrp': 1}
        ):
            flag = bool(ms.get('allow_custom_mrp', False))
            for k in ('sku_name', 'sku', 'name'):
                v = ms.get(k)
                if v:
                    allow_mrp_by_name[str(v).strip().lower()] = flag
        missing_mrp: list = []
        for p in sku_pricing:
            label = p.get('sku') or p.get('sku_name') or p.get('sku_id') or '—'
            key = str(label).strip().lower()
            if not allow_mrp_by_name.get(key, False):
                continue  # MRP not required for this SKU
            try:
                mrp_val = p.get('mrp')
                if mrp_val is None or float(mrp_val) <= 0:
                    missing_mrp.append(label)
            except (TypeError, ValueError):
                missing_mrp.append(label)
        if missing_mrp:
            failures.append(
                'MRP is missing on the SKU Pricing row for: '
                + ', '.join(sorted(set(missing_mrp)))
                + '. Add MRP next to each SKU Pricing row under the Account Detail page.'
            )

    if failures:
        raise HTTPException(status_code=400, detail=' '.join(failures))

    # ── Validate every SKU has a Zoho item mapping ──
    # We accept either an explicit `sku_id` reference on the pricing row or a
    # name match against master_skus → then look up zoho_sku_mappings.
    # Skip this validation entirely when the customer is billed by a third-party
    # distributor — those accounts never touch Zoho.
    billed_by_pre = (checklist.billed_by or 'company').lower()
    if billed_by_pre == 'company':
        sku_id_set: set = set()
        name_to_id: dict = {}
        async for ms in tdb.master_skus.find({}, {'_id': 0, 'id': 1, 'sku_name': 1, 'sku': 1, 'name': 1}):
            sid = ms.get('id')
            if sid:
                for k in ('sku_name', 'sku', 'name'):
                    v = ms.get(k)
                    if v:
                        name_to_id[str(v).strip().lower()] = sid

        for p in sku_pricing:
            sid = p.get('sku_id')
            if not sid:
                name = (p.get('sku') or p.get('sku_name') or '').strip().lower()
                sid = name_to_id.get(name)
            if sid:
                sku_id_set.add(sid)

        unmapped: list = []
        for p in sku_pricing:
            sid = p.get('sku_id')
            name = p.get('sku') or p.get('sku_name') or ''
            if not sid:
                sid = name_to_id.get(name.strip().lower())
            if not sid:
                unmapped.append(name)
                continue
            mapping = await tdb.zoho_sku_mappings.find_one(
                {'our_sku_id': sid}, {'_id': 0, 'zoho_item_id': 1}
            )
            if not mapping or not mapping.get('zoho_item_id'):
                unmapped.append(name)
        if unmapped:
            raise HTTPException(
                status_code=400,
                detail=(
                    "The following SKUs are not mapped to Zoho items: "
                    + ", ".join(sorted(set(unmapped)))
                    + ". Go to Settings → Integrations → Zoho Books → SKU Mapping first."
                ),
            )

    # ── Sync to Zoho only when the customer is billed by the company ──
    # If the customer is billed by a third-party distributor, we deliberately
    # SKIP Zoho contact creation — downstream invoice / credit-note pushes
    # already respect `account.zoho_contact_id` being absent.
    from services import zoho_service as zoho
    tenant_id = get_current_tenant_id()
    zoho_contact_id = None
    billed_by = (checklist.billed_by or 'company').lower()

    if billed_by == 'company':
        if not zoho.is_zoho_configured():
            raise HTTPException(
                status_code=400,
                detail='Zoho Books integration is not configured. Ask an admin to set ZOHO_CLIENT_ID/SECRET.'
            )
        creds = await zoho.get_credentials(tenant_id)
        if not creds:
            raise HTTPException(
                status_code=400,
                detail='Zoho Books is not connected for this tenant. Go to Settings → Integrations → Zoho Books and click Connect.'
            )
        try:
            zoho_contact_id = await zoho.upsert_contact(tenant_id, account)
        except Exception as e:
            raise HTTPException(status_code=502, detail=f'Failed to sync customer to Zoho Books: {e}')

    now = datetime.now(timezone.utc).isoformat()
    update_doc = {
        'status': 'active',
        'activated_at': now,
        'activated_by': user_id,
        'activated_by_name': (current_user or {}).get('name'),
        'updated_at': now,
        'activation_checklist': checklist.model_dump(),
        'billed_by': billed_by,
    }
    if zoho_contact_id:
        update_doc['zoho_contact_id'] = zoho_contact_id
    await tdb.accounts.update_one(_account_match(account_id), {'$set': update_doc})

    if billed_by == 'distributor':
        return {
            'message': 'Account activated. Billed by third-party distributor — Zoho registration was skipped.',
            'account_id': account_id,
            'billed_by': 'distributor',
            'zoho_contact_id': None,
            'activated_at': now,
            'activated_by_name': (current_user or {}).get('name'),
        }

    return {
        'message': 'Account activated and synced to Zoho Books.',
        'account_id': account_id,
        'billed_by': 'company',
        'zoho_contact_id': zoho_contact_id,
        'activated_at': now,
        'activated_by_name': (current_user or {}).get('name'),
    }


# ============= GST CERTIFICATE PARSING (Gemini multimodal OCR) =============

import json as _json
import tempfile
import os as _os
from pathlib import Path as _Path
from utils import object_storage as _objstore

from fastapi.responses import StreamingResponse as _StreamingResponse
import io as _io
import logging as _logging
_logger = _logging.getLogger(__name__)

GST_EXTRACTION_PROMPT = """You are an OCR + structured-data extractor for Indian GST registration certificates.

Read the attached GST certificate (image or PDF) and return ONLY a JSON object — no commentary, no markdown fences — with this exact shape:

{
  "gst_number": "<15-character GSTIN, uppercase>",
  "pan_number": "<10-character PAN, uppercase>",
  "gst_legal_name": "<Legal Name of Business as on the certificate>",
  "gst_trade_name": "<Trade Name if different, else same as legal name>",
  "gst_registration_date": "<YYYY-MM-DD if visible, else null>",
  "billing_address": {
    "address_line1": "<Building / floor / street>",
    "address_line2": "<Locality / area, optional>",
    "city": "<City / town>",
    "state": "<State name>",
    "pincode": "<6-digit PIN>"
  }
}

Rules:
- Use null for any field you cannot find with confidence. Never invent values.
- GSTIN format: 2 digits + 5 letters + 4 digits + 1 letter + 1 char + Z + 1 char.
- PAN is positions 3-12 of the GSTIN; cross-check if the certificate prints PAN explicitly.
- Return ONLY the JSON object, nothing else.
"""


def _detect_mime(filename: str, content_type: Optional[str]) -> str:
    if content_type and content_type != "application/octet-stream":
        return content_type
    ext = (_os.path.splitext(filename or "")[1] or "").lower()
    return {
        ".pdf": "application/pdf",
        ".png": "image/png",
        ".jpg": "image/jpeg",
        ".jpeg": "image/jpeg",
        ".webp": "image/webp",
    }.get(ext, "application/octet-stream")


async def _parse_gst_with_gemini(file_bytes: bytes, mime: str) -> dict:
    """Call Gemini 2.5 Flash directly (user's own GEMINI_API_KEY) to OCR + parse a GST cert."""
    from utils.gemini_helpers import gemini_text_with_file
    try:
        response = await gemini_text_with_file(
            prompt=GST_EXTRACTION_PROMPT,
            file_bytes=file_bytes,
            mime_type=mime,
            system="You extract structured JSON from Indian GST registration certificates. Return only JSON.",
        )
    except RuntimeError as e:
        raise HTTPException(status_code=500, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=502, detail=f"AI parsing failed: {e}")

    text = (response or "").strip()
    if text.startswith("```"):
        text = text.strip("`")
        if text.lower().startswith("json\n"):
            text = text[5:]
    try:
        data = _json.loads(text)
    except _json.JSONDecodeError as e:
        raise HTTPException(
            status_code=502,
            detail=f"AI returned unparseable JSON. Try a clearer scan of the GST certificate. ({e})"
        )

    if not isinstance(data, dict):
        raise HTTPException(status_code=502, detail="AI did not return a JSON object.")
    return data


@router.post("/{account_id}/gst-certificate")
async def upload_gst_certificate(
    account_id: str,
    file: UploadFile = File(...),
    current_user: dict = Depends(get_current_user),
):
    """Upload a GST certificate, run Gemini OCR to extract structured fields,
    persist them on the account, and store the file in object storage."""
    tdb = get_tdb()
    account = await tdb.accounts.find_one(_account_match(account_id), {'_id': 0, 'id': 1})
    if not account:
        raise HTTPException(status_code=404, detail='Account not found')

    contents = await file.read()
    if not contents:
        raise HTTPException(status_code=400, detail='Empty file')
    if len(contents) > 8 * 1024 * 1024:
        raise HTTPException(status_code=400, detail='File too large (max 8MB)')

    mime = _detect_mime(file.filename or "", file.content_type)
    if mime not in {"application/pdf", "image/png", "image/jpeg", "image/webp"}:
        raise HTTPException(
            status_code=400,
            detail=f'Unsupported file type {mime}. Use PDF, PNG, JPG or WEBP.'
        )

    suffix = {
        "application/pdf": ".pdf",
        "image/png": ".png",
        "image/jpeg": ".jpg",
        "image/webp": ".webp",
    }.get(mime, "")
    parsed = await _parse_gst_with_gemini(contents, mime)

    # If this account was converted from a lead, route the GST cert into
    # the lead's dedicated Drive folder (so all collateral stays together).
    storage_path = f"{_objstore.APP_NAME}/gst-certs/{account_id}{suffix}"
    try:
        account_doc = await tdb.accounts.find_one(_account_match(account_id), {'_id': 0, 'lead_id': 1})
        src_lead_uuid = (account_doc or {}).get('lead_id')
        if src_lead_uuid:
            lead_doc = await tdb.leads.find_one({'id': src_lead_uuid}, {'_id': 0, 'lead_id': 1})
            human_lead_id = (lead_doc or {}).get('lead_id')
            if human_lead_id:
                storage_path = f"{human_lead_id}/gst-certificates/{account_id}{suffix}"
                # Ensure the folder exists (idempotent, no-op if Drive is off)
                try:
                    from utils.google_drive_storage import ensure_lead_folder
                    from core.tenant import get_current_tenant_id as _gctid
                    await ensure_lead_folder(_gctid(), human_lead_id)
                except Exception:
                    pass
    except Exception:
        pass

    try:
        from utils.storage import put_object as _disp_put
        await _disp_put(storage_path, contents, mime)
    except Exception as e:
        _logger.warning(f"Failed to persist GST cert to object storage: {e}")
        storage_path = None

    update_doc: dict = {'updated_at': datetime.now(timezone.utc).isoformat()}
    if parsed.get('gst_number'):
        update_doc['gst_number'] = str(parsed['gst_number']).upper().strip()
    if parsed.get('pan_number'):
        update_doc['pan_number'] = str(parsed['pan_number']).upper().strip()
    if parsed.get('gst_legal_name'):
        update_doc['gst_legal_name'] = parsed['gst_legal_name'].strip()
    if parsed.get('gst_trade_name'):
        update_doc['gst_trade_name'] = parsed['gst_trade_name'].strip()
    if parsed.get('gst_registration_date'):
        update_doc['gst_registration_date'] = parsed['gst_registration_date']
    if isinstance(parsed.get('billing_address'), dict):
        ba = parsed['billing_address']
        update_doc['billing_address'] = {
            'address_line1': (ba.get('address_line1') or '').strip() or None,
            'address_line2': (ba.get('address_line2') or '').strip() or None,
            'city': (ba.get('city') or '').strip() or None,
            'state': (ba.get('state') or '').strip() or None,
            'pincode': (ba.get('pincode') or '').strip() or None,
        }
    if storage_path:
        update_doc['gst_certificate_url'] = f"/api/accounts/{account_id}/gst-certificate"
        update_doc['gst_certificate_path'] = storage_path
        update_doc['gst_certificate_mime'] = mime

    await tdb.accounts.update_one(_account_match(account_id), {'$set': update_doc})

    return {
        'message': 'GST certificate parsed and saved.',
        'parsed': parsed,
        'persisted_fields': {k: v for k, v in update_doc.items() if k != 'updated_at'},
    }


@router.get("/{account_id}/gst-certificate")
async def download_gst_certificate(
    account_id: str,
    current_user: dict = Depends(get_current_user),
):
    """Stream the previously-uploaded GST certificate for an account."""
    tdb = get_tdb()
    account = await tdb.accounts.find_one(
        _account_match(account_id),
        {'_id': 0, 'gst_certificate_path': 1, 'gst_certificate_mime': 1}
    )
    if not account or not account.get('gst_certificate_path'):
        raise HTTPException(status_code=404, detail='No GST certificate uploaded for this account')
    try:
        from utils.storage import get_object as _disp_get
        content, content_type = await _disp_get(account['gst_certificate_path'])
    except Exception as e:
        raise HTTPException(status_code=502, detail=f'Could not retrieve GST certificate: {e}')
    return _StreamingResponse(
        _io.BytesIO(content),
        media_type=account.get('gst_certificate_mime') or content_type,
        headers={'Content-Disposition': 'inline; filename="gst-certificate"'},
    )


@router.delete("/{account_id}/gst-certificate")
async def delete_gst_certificate(
    account_id: str,
    current_user: dict = Depends(get_current_user),
):
    """Delete the uploaded GST certificate and clear all GST-parsed fields on the account.

    Removes the file from object storage and unsets:
      gst_number, pan_number, gst_legal_name, gst_trade_name,
      gst_registration_date, billing_address,
      gst_certificate_url, gst_certificate_path, gst_certificate_mime.
    The base account address (city/state) is preserved — only the parsed
    GST-derived billing block and certificate file are removed.
    """
    tdb = get_tdb()
    account = await tdb.accounts.find_one(
        _account_match(account_id),
        {'_id': 0, 'id': 1, 'gst_certificate_path': 1}
    )
    if not account:
        raise HTTPException(status_code=404, detail='Account not found')

    # Best-effort delete the file from object storage (idempotent)
    stored_path = account.get('gst_certificate_path')
    if stored_path:
        try:
            from utils.storage import delete_object as _disp_del
            await _disp_del(stored_path)
        except Exception as e:
            _logger.warning(f"Storage delete failed for {stored_path}: {e} — continuing with DB cleanup")

    unset_fields = {
        'gst_number': '',
        'pan_number': '',
        'gst_legal_name': '',
        'gst_trade_name': '',
        'gst_registration_date': '',
        'billing_address': '',
        'gst_certificate_url': '',
        'gst_certificate_path': '',
        'gst_certificate_mime': '',
    }
    await tdb.accounts.update_one(
        _account_match(account_id),
        {
            '$unset': unset_fields,
            '$set': {'updated_at': datetime.now(timezone.utc).isoformat()},
        }
    )
    return {'message': 'GST certificate removed.', 'account_id': account_id}


# ============= GOOGLE PLACES — place details (lat/lng) =============

import httpx as _httpx


@router.get("/places/details")
async def get_place_details(
    place_id: str,
    current_user: dict = Depends(get_current_user),
):
    """Fetch detailed info for a Google Places place_id — primarily lat/lng
    + structured address components. Used by the Delivery Address picker.
    """
    api_key = _os.environ.get('GOOGLE_MAPS_API_KEY')
    if not api_key:
        raise HTTPException(status_code=500, detail='Google Maps API key not configured')
    if not place_id:
        raise HTTPException(status_code=400, detail='place_id is required')

    url = f"https://places.googleapis.com/v1/places/{place_id}"
    headers = {
        'X-Goog-Api-Key': api_key,
        'X-Goog-FieldMask': 'id,displayName,formattedAddress,location,addressComponents',
    }
    async with _httpx.AsyncClient(timeout=15.0) as client:
        resp = await client.get(url, headers=headers)
    if resp.status_code != 200:
        raise HTTPException(status_code=502, detail=f"Google Places error: {resp.text}")
    data = resp.json()
    loc = (data.get('location') or {})

    # Parse address components into our structured shape
    def _find(comp_types: list, components: list, short: bool = False) -> Optional[str]:
        for comp in components or []:
            ctypes = comp.get('types') or []
            if any(t in comp_types for t in ctypes):
                return comp.get('shortText' if short else 'longText')
        return None

    components = data.get('addressComponents') or []
    city = (
        _find(['locality'], components)
        or _find(['administrative_area_level_2'], components)
        or _find(['sublocality_level_1'], components)
    )
    state = _find(['administrative_area_level_1'], components)
    pincode = _find(['postal_code'], components)
    line1_parts: list = []
    for t in ('street_number', 'route', 'premise', 'sublocality_level_2'):
        v = _find([t], components)
        if v:
            line1_parts.append(v)
    line1 = ', '.join(line1_parts) or None

    return {
        'place_id': data.get('id') or place_id,
        'formatted_address': data.get('formattedAddress'),
        'lat': loc.get('latitude'),
        'lng': loc.get('longitude'),
        'address': {
            'address_line1': line1,
            'address_line2': _find(['sublocality_level_1', 'neighborhood'], components),
            'city': city,
            'state': state,
            'pincode': pincode,
        },
    }


@router.patch("/{account_id}/delivery-info")
async def update_delivery_info(
    account_id: str,
    payload: AccountUpdate,
    current_user: dict = Depends(get_current_user),
):
    """Save the Customer's Delivery & Accounting fields: delivery_address
    (with lat/lng), delivery_contact_name, delivery_contact_phone."""
    tdb = get_tdb()
    account = await tdb.accounts.find_one(_account_match(account_id), {'_id': 0, 'id': 1})
    if not account:
        raise HTTPException(status_code=404, detail='Account not found')

    update_doc: dict = {'updated_at': datetime.now(timezone.utc).isoformat()}
    data = payload.model_dump(exclude_unset=True)
    for k in ('delivery_address', 'delivery_contact_name', 'delivery_contact_phone'):
        if k in data and data[k] is not None:
            update_doc[k] = data[k]

    if len(update_doc) == 1:
        raise HTTPException(status_code=400, detail='No delivery fields provided')

    await tdb.accounts.update_one(_account_match(account_id), {'$set': update_doc})

    # ── Best-effort Zoho re-sync (mirrors PUT /accounts/{id}) ──
    try:
        updated = await tdb.accounts.find_one(_account_match(account_id), {'_id': 0})
        if updated and updated.get('zoho_contact_id') and (updated.get('billed_by') or 'company').lower() == 'company':
            from services import zoho_service as _zoho
            if _zoho.is_zoho_configured():
                tenant_id = get_current_tenant_id()
                creds = await _zoho.get_credentials(tenant_id)
                if creds:
                    await _zoho.upsert_contact(tenant_id, updated)
                    _logger.info(
                        f"[zoho] Re-synced contact for account {updated.get('account_id')} "
                        f"after delivery-info save: {[k for k in update_doc.keys() if k != 'updated_at']}"
                    )
    except Exception as e:
        _logger.warning(f"[zoho] Auto re-sync failed after delivery-info save: {e}")

    return {'message': 'Delivery & contact details saved', 'updates': update_doc}
