"""
Accounts routes - Account CRUD, invoices, SKU pricing, contracts
"""
from fastapi import APIRouter, HTTPException, Depends, UploadFile, File
from typing import List, Optional
from datetime import datetime, timezone
from pydantic import BaseModel, Field
import uuid
import re
import base64

from database import db
from deps import get_current_user

router = APIRouter()

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


class PaginatedAccountsResponse(BaseModel):
    data: List[Account]
    total: int
    page: int
    page_size: int
    total_pages: int


# ============= HELPER FUNCTIONS =============

async def generate_account_id(company: str, city: str) -> str:
    """Generate unique Account ID in format: NAME4-CITY-AYY-SEQ"""
    clean_company = re.sub(r'[^a-zA-Z0-9]', '', company).upper()
    name4 = clean_company[:4].ljust(4, 'X')
    
    clean_city = re.sub(r'[^a-zA-Z0-9]', '', city).upper()
    city3 = clean_city[:3].ljust(3, 'X')
    
    year2 = datetime.now().strftime('%y')
    prefix = f"{name4}-{city3}-A{year2}-"
    
    regex_pattern = f"^{re.escape(prefix)}\\d{{3}}$"
    existing = await db.accounts.find(
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
    lead = await db.leads.find_one({'id': data.lead_id}, {'_id': 0})
    if not lead:
        raise HTTPException(status_code=404, detail='Lead not found')
    
    # Check if already converted
    existing = await db.accounts.find_one({'lead_id': data.lead_id}, {'_id': 0})
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
    
    # Create account
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
        'created_at': datetime.now(timezone.utc).isoformat(),
        'updated_at': datetime.now(timezone.utc).isoformat()
    }
    
    await db.accounts.insert_one(account_data)
    
    # Update lead with account reference
    await db.leads.update_one(
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
    
    total = await db.accounts.count_documents(query)
    skip = (page - 1) * page_size
    
    accounts = await db.accounts.find(query, {'_id': 0}).sort('created_at', -1).skip(skip).limit(page_size).to_list(page_size)
    
    # Add sales person name
    for account in accounts:
        if account.get('assigned_to'):
            user = await db.users.find_one({'id': account['assigned_to']}, {'_id': 0, 'name': 1})
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
    query = {}
    if territory:
        query['territory'] = territory
    if state:
        query['state'] = state
    if city:
        query['city'] = city
    
    total = await db.accounts.count_documents(query)
    
    # Count by type
    tier1 = await db.accounts.count_documents({**query, 'account_type': 'Tier 1'})
    tier2 = await db.accounts.count_documents({**query, 'account_type': 'Tier 2'})
    tier3 = await db.accounts.count_documents({**query, 'account_type': 'Tier 3'})
    
    # Top categories
    pipeline = [
        {'$match': query},
        {'$group': {'_id': '$category', 'count': {'$sum': 1}}},
        {'$sort': {'count': -1}},
        {'$limit': 5}
    ]
    categories = await db.accounts.aggregate(pipeline).to_list(5)
    
    return {
        'total': total,
        'by_type': {'tier1': tier1, 'tier2': tier2, 'tier3': tier3},
        'top_categories': categories
    }


@router.get("/{account_id}")
async def get_account(account_id: str, current_user: dict = Depends(get_current_user)):
    """Get a single account by ID"""
    account = await db.accounts.find_one({'id': account_id}, {'_id': 0})
    if not account:
        raise HTTPException(status_code=404, detail='Account not found')
    
    # Add sales person name
    if account.get('assigned_to'):
        user = await db.users.find_one({'id': account['assigned_to']}, {'_id': 0, 'name': 1})
        account['sales_person_name'] = user.get('name') if user else None
    
    return account


@router.put("/{account_id}")
async def update_account(account_id: str, update: AccountUpdate, current_user: dict = Depends(get_current_user)):
    """Update an account"""
    existing = await db.accounts.find_one({'id': account_id}, {'_id': 0})
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
    
    await db.accounts.update_one({'id': account_id}, {'$set': update_data})
    
    return await db.accounts.find_one({'id': account_id}, {'_id': 0})


@router.delete("/{account_id}")
async def delete_account(account_id: str, current_user: dict = Depends(get_current_user)):
    """Delete an account"""
    account = await db.accounts.find_one({'id': account_id}, {'_id': 0})
    if not account:
        raise HTTPException(status_code=404, detail='Account not found')
    
    # Remove account reference from lead
    if account.get('lead_id'):
        await db.leads.update_one(
            {'id': account['lead_id']},
            {'$set': {'converted_to_account': False, 'account_id': None}}
        )
    
    await db.accounts.delete_one({'id': account_id})
    
    return {'message': 'Account deleted successfully'}


# ============= INVOICE ROUTES =============

@router.get("/{account_id}/invoices")
async def get_account_invoices(account_id: str, current_user: dict = Depends(get_current_user)):
    """Get all invoices for an account"""
    account = await db.accounts.find_one({'id': account_id}, {'_id': 0})
    if not account:
        raise HTTPException(status_code=404, detail='Account not found')
    
    # Get invoices by account_id or lead's lead_id
    lead = await db.leads.find_one({'id': account.get('lead_id')}, {'_id': 0, 'lead_id': 1})
    
    query = {'$or': [{'account_id': account_id}]}
    if lead and lead.get('lead_id'):
        query['$or'].append({'ca_lead_id': lead['lead_id']})
    
    invoices = await db.invoices.find(query, {'_id': 0}).sort('invoice_date', -1).to_list(1000)
    
    # Calculate totals
    total_gross = sum(inv.get('gross_invoice_value', 0) for inv in invoices)
    total_net = sum(inv.get('net_invoice_value', 0) for inv in invoices)
    total_credit = sum(inv.get('credit_note_value', 0) for inv in invoices)
    
    return {
        'invoices': invoices,
        'summary': {
            'total_gross': total_gross,
            'total_net': total_net,
            'total_credit': total_credit,
            'invoice_count': len(invoices)
        }
    }


@router.post("/{account_id}/invoices")
async def create_account_invoice(account_id: str, invoice_data: dict, current_user: dict = Depends(get_current_user)):
    """Create an invoice for an account"""
    account = await db.accounts.find_one({'id': account_id}, {'_id': 0})
    if not account:
        raise HTTPException(status_code=404, detail='Account not found')
    
    # Generate invoice number
    today = datetime.now().strftime('%Y%m%d')
    count = await db.invoices.count_documents({'invoice_no': {'$regex': f'^INV-{today}'}})
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
        
        # Get COGS for this SKU in this city
        cogs_data = await db.cogs_data.find_one(
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
    
    await db.invoices.insert_one(invoice)
    
    return {
        'invoice': invoice,
        'margin_summary': {
            'gross_margin': gross_margin,
            'gross_margin_percent': round(gross_margin_percent, 2)
        }
    }


# ============= LOGO ROUTES =============

@router.post("/{account_id}/logo")
async def upload_account_logo(
    account_id: str,
    logo: UploadFile = File(...),
    current_user: dict = Depends(get_current_user)
):
    """Upload a logo for an account"""
    account = await db.accounts.find_one({'id': account_id}, {'_id': 0})
    if not account:
        raise HTTPException(status_code=404, detail='Account not found')
    
    content = await logo.read()
    if len(content) > 5 * 1024 * 1024:
        raise HTTPException(status_code=400, detail='File too large (max 5MB)')
    
    logo_base64 = base64.b64encode(content).decode('utf-8')
    logo_data = f"data:{logo.content_type};base64,{logo_base64}"
    
    await db.accounts.update_one(
        {'id': account_id},
        {'$set': {'logo': logo_data, 'updated_at': datetime.now(timezone.utc).isoformat()}}
    )
    
    return {'message': 'Logo uploaded successfully', 'logo': logo_data}


@router.delete("/{account_id}/logo")
async def delete_account_logo(account_id: str, current_user: dict = Depends(get_current_user)):
    """Delete an account's logo"""
    result = await db.accounts.update_one(
        {'id': account_id},
        {'$unset': {'logo': ''}, '$set': {'updated_at': datetime.now(timezone.utc).isoformat()}}
    )
    
    if result.modified_count == 0:
        raise HTTPException(status_code=404, detail='Account not found')
    
    return {'message': 'Logo deleted successfully'}
