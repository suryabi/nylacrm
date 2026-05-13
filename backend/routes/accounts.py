"""
Accounts routes - Account CRUD, invoices, SKU pricing, contracts
Multi-tenant aware - all queries automatically filter by tenant_id
"""
from fastapi import APIRouter, HTTPException, Depends, UploadFile, File
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

# ============= MODELS =============

class AccountSKUPricing(BaseModel):
    sku: str
    price_per_unit: float = 0.0
    return_bottle_credit: float = 0.0


class DeliveryAddress(BaseModel):
    address_line1: Optional[str] = None
    address_line2: Optional[str] = None
    city: Optional[str] = None
    state: Optional[str] = None
    pincode: Optional[str] = None
    landmark: Optional[str] = None


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
    contact_name: Optional[str] = None
    contact_number: Optional[str] = None
    gst_number: Optional[str] = None
    next_follow_up: Optional[str] = None
    sku_pricing: Optional[List[AccountSKUPricing]] = None
    delivery_address: Optional[DeliveryAddress] = None
    onboarded_month: Optional[int] = None
    onboarded_year: Optional[int] = None


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
    
    # Map SKU pricing from lead's proposed pricing
    sku_pricing = []
    if lead.get('proposed_sku_pricing'):
        for sku_item in lead['proposed_sku_pricing']:
            sku_pricing.append({
                'sku': sku_item.get('sku', ''),
                'price_per_unit': sku_item.get('proposed_price', sku_item.get('price_per_unit', 0)),
                'return_bottle_credit': sku_item.get('bottle_return_credit', sku_item.get('return_bottle_credit', 0))
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
    account = await tdb.accounts.find_one({'id': account_id}, {'_id': 0})
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
    existing = await tdb.accounts.find_one({'id': account_id}, {'_id': 0})
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
    
    await tdb.accounts.update_one({'id': account_id}, {'$set': update_data})
    
    return await tdb.accounts.find_one({'id': account_id}, {'_id': 0})


@router.delete("/{account_id}")
async def delete_account(account_id: str, current_user: dict = Depends(get_current_user)):
    """Delete an account"""
    tdb = get_tdb()
    account = await tdb.accounts.find_one({'id': account_id}, {'_id': 0})
    if not account:
        raise HTTPException(status_code=404, detail='Account not found')
    
    # Remove account reference from lead
    if account.get('lead_id'):
        await tdb.leads.update_one(
            {'id': account['lead_id']},
            {'$set': {'converted_to_account': False, 'account_id': None}}
        )
    
    await tdb.accounts.delete_one({'id': account_id})
    
    return {'message': 'Account deleted successfully'}


@router.get("/{account_id}/sku-pricing")
async def get_account_sku_pricing(account_id: str, current_user: dict = Depends(get_current_user)):
    """Get SKU pricing for an account"""
    tdb = get_tdb()
    tenant_id = get_current_tenant_id()
    
    account = await tdb.accounts.find_one({'id': account_id}, {'_id': 0})
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
    account = await tdb.accounts.find_one({'id': account_id}, {'_id': 0})
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
    account = await tdb.accounts.find_one({'id': account_id}, {'_id': 0})
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
    account = await tdb.accounts.find_one({'id': account_id}, {'_id': 0})
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
    account = await tdb.accounts.find_one({'id': account_id}, {'_id': 0})
    if not account:
        raise HTTPException(status_code=404, detail='Account not found')
    
    content = await logo.read()
    if len(content) > 5 * 1024 * 1024:
        raise HTTPException(status_code=400, detail='File too large (max 5MB)')
    
    logo_base64 = base64.b64encode(content).decode('utf-8')
    logo_data = f"data:{logo.content_type};base64,{logo_base64}"
    
    await tdb.accounts.update_one(
        {'id': account_id},
        {'$set': {'logo': logo_data, 'updated_at': datetime.now(timezone.utc).isoformat()}}
    )
    
    return {'message': 'Logo uploaded successfully', 'logo': logo_data}


@router.delete("/{account_id}/logo")
async def delete_account_logo(account_id: str, current_user: dict = Depends(get_current_user)):
    """Delete an account's logo"""
    tdb = get_tdb()
    result = await tdb.accounts.update_one(
        {'id': account_id},
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


@router.post("/{account_id}/activate")
async def activate_account(
    account_id: str,
    checklist: ActivationChecklist,
    current_user: dict = Depends(get_current_user),
):
    """Activate a freshly-converted account.

    Flow:
      1. Permission: only the assigned salesperson, anyone in their upward
         management chain, CEO, Admin, or System Admin can activate.
      2. All four checklist items MUST be True (frontend gates the button too).
      3. Account MUST have at least one SKU configured under `sku_pricing`.
      4. Every SKU in `sku_pricing` MUST be mapped under Settings → Integrations
         → Zoho Books → SKU Mapping.
      5. Upsert the customer in Zoho Books (uses the account's existing
         contact / GST / address details).
      6. Mark account `status='active'` with `activated_at` / `activated_by`
         + persist `zoho_contact_id` on the account doc.

    Idempotent: re-activating an already-active account is allowed and will
    just re-sync the contact to Zoho.
    """
    # All four checklist items must be true (defensive — UI also enforces this)
    if not all([
        checklist.gst_updated,
        checklist.delivery_address_updated,
        checklist.sku_prices_correct,
        checklist.delivery_contact_updated,
    ]):
        raise HTTPException(status_code=400, detail='All four checklist items must be confirmed before activation.')

    tdb = get_tdb()
    account = await tdb.accounts.find_one({'id': account_id}, {'_id': 0})
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

    # ── Validate sku_pricing exists ──
    sku_pricing = account.get('sku_pricing') or []
    if not sku_pricing:
        raise HTTPException(
            status_code=400,
            detail='No SKU pricing configured on this account. Add agreed prices under SKU Pricing first.'
        )

    # ── Validate every SKU has a Zoho item mapping ──
    # We accept either an explicit `sku_id` reference on the pricing row or a
    # name match against master_skus → then look up zoho_sku_mappings.
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

    # ── Sync to Zoho (upsert contact) ──
    from services import zoho_service as zoho
    tenant_id = get_current_tenant_id()
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
        'zoho_contact_id': zoho_contact_id,
        'updated_at': now,
        'activation_checklist': checklist.model_dump(),
    }
    await tdb.accounts.update_one({'id': account_id}, {'$set': update_doc})

    return {
        'message': 'Account activated and synced to Zoho Books.',
        'account_id': account_id,
        'zoho_contact_id': zoho_contact_id,
        'activated_at': now,
        'activated_by_name': (current_user or {}).get('name'),
    }
