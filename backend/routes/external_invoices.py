"""
External Invoice ingestion endpoints.

POST  /api/accounts/{account_id}/invoices                  -> create invoice from external system
PUT   /api/accounts/{account_id}/invoices/{invoice_no}     -> update existing invoice

`account_id` in the URI is the human account code (e.g. ORLO-HYD-A26-001), NOT the UUID.
`items[].itemId` in the body is the SKU's `external_sku_id` (mapped to internal SKU on save).
The created invoice's stored `id` matches the external `invoiceNo`.
"""
from fastapi import APIRouter, Depends, HTTPException, Path
from typing import Optional, List, Any
from pydantic import BaseModel
from datetime import datetime, timezone
import logging

from database import db, get_tenant_db
from deps import get_current_user
from core.tenant import get_current_tenant_id

router = APIRouter(tags=["External Invoices"])
logger = logging.getLogger(__name__)


class ExternalInvoiceItem(BaseModel):
    itemId: str  # external_sku_id of the SKU
    quantity: float
    rate: Any  # may be string or number from external system
    discount: Optional[Any] = None
    batchNumber: Optional[str] = None
    expiryDate: Optional[str] = None


class ExternalInvoicePayload(BaseModel):
    grossInvoiceValue: Any
    netInvoiceValue: Any
    outstanding: Optional[Any] = None
    ACCOUNT_ID: Optional[str] = None
    invoiceNo: str
    tenant_id: Optional[str] = None
    invoiceDate: str
    creditNoteValue: Optional[Any] = None
    items: List[ExternalInvoiceItem] = []


def _to_float(v, default: float = 0.0) -> float:
    """Convert string/number to float; "12.85%" -> 12.85; None/invalid -> default."""
    if v is None:
        return default
    if isinstance(v, (int, float)):
        return float(v)
    s = str(v).strip().replace('%', '').replace(',', '')
    if not s:
        return default
    try:
        return float(s)
    except (ValueError, TypeError):
        return default


async def _validate_tenant(payload_tenant: Optional[str]) -> str:
    """Resolve the tenant in scope (URL/domain/header) and ensure body tenant matches."""
    current = get_current_tenant_id()
    if payload_tenant and current and payload_tenant != current:
        raise HTTPException(
            status_code=400,
            detail=f"tenant_id in body ('{payload_tenant}') does not match request tenant ('{current}')."
        )
    return current


async def _resolve_account(account_id_param: str):
    """Look up account by human code (account_id) OR uuid (id)."""
    tdb = get_tenant_db()
    acc = await tdb.accounts.find_one(
        {'$or': [{'account_id': account_id_param}, {'id': account_id_param}]},
        {'_id': 0}
    )
    if not acc:
        raise HTTPException(status_code=404, detail=f"Account '{account_id_param}' not found")
    return acc


async def _resolve_sku_by_external_id(external_id: str) -> Optional[dict]:
    """Find a SKU in master by external_sku_id."""
    if not external_id:
        return None
    sku = await db.master_skus.find_one(
        {'external_sku_id': external_id},
        {'_id': 0, 'id': 1, 'sku_name': 1, 'external_sku_id': 1, 'category': 1, 'unit': 1}
    )
    return sku


def _build_invoice_doc(
    invoice_no: str,
    account: dict,
    payload: ExternalInvoicePayload,
    items_resolved: List[dict],
    tenant_id: str,
    user_id: Optional[str],
    is_update: bool = False,
    existing: Optional[dict] = None,
) -> dict:
    now = datetime.now(timezone.utc).isoformat()
    base = {
        'id': invoice_no,                    # KEEP id == external invoiceNo per requirement
        'invoice_no': invoice_no,
        'invoice_date': payload.invoiceDate,
        'gross_invoice_value': _to_float(payload.grossInvoiceValue),
        'net_invoice_value': _to_float(payload.netInvoiceValue),
        'credit_note_value': _to_float(payload.creditNoteValue),
        'outstanding': _to_float(payload.outstanding),
        'account_id': account.get('account_id'),
        'account_uuid': account.get('id'),
        'account_name': account.get('account_name'),
        'tenant_id': tenant_id,
        'items': items_resolved,
        'source': 'external_api',
        'updated_at': now,
        'updated_by': user_id,
    }
    if is_update and existing:
        base['created_at'] = existing.get('created_at') or now
        base['created_by'] = existing.get('created_by') or user_id
    else:
        base['created_at'] = now
        base['created_by'] = user_id
    return base


async def _resolve_items(items: List[ExternalInvoiceItem]) -> tuple:
    """Resolve each itemId (external_sku_id) to internal SKU, attach SKU info, compute totals."""
    resolved: List[dict] = []
    unmatched: List[str] = []
    line_total_sum = 0.0
    for it in items:
        sku = await _resolve_sku_by_external_id(it.itemId)
        qty = _to_float(it.quantity)
        rate = _to_float(it.rate)
        discount_pct = _to_float(it.discount)
        gross = qty * rate
        discount_amt = gross * (discount_pct / 100.0)
        net = gross - discount_amt
        line_total_sum += net
        resolved.append({
            'external_item_id': it.itemId,
            'sku_id': sku.get('id') if sku else None,
            'sku_name': sku.get('sku_name') if sku else None,
            'external_sku_id': sku.get('external_sku_id') if sku else it.itemId,
            'quantity': qty,
            'rate': rate,
            'discount_percent': discount_pct,
            'gross_amount': round(gross, 2),
            'discount_amount': round(discount_amt, 2),
            'net_amount': round(net, 2),
            'batch_number': it.batchNumber,
            'expiry_date': it.expiryDate,
            'matched': sku is not None,
        })
        if not sku:
            unmatched.append(it.itemId)
    return resolved, unmatched, round(line_total_sum, 2)


@router.post("/{account_id}/invoices")
async def create_external_invoice(
    payload: ExternalInvoicePayload,
    account_id: str = Path(..., description="Account ID code (e.g. ORLO-HYD-A26-001)"),
    current_user: dict = Depends(get_current_user),
):
    """Create an invoice from an external system. Item IDs in body are external SKU IDs."""
    tenant_id = await _validate_tenant(payload.tenant_id)
    if payload.ACCOUNT_ID and payload.ACCOUNT_ID != account_id:
        raise HTTPException(
            status_code=400,
            detail=f"ACCOUNT_ID in body ('{payload.ACCOUNT_ID}') does not match URI ('{account_id}')."
        )

    account = await _resolve_account(account_id)
    tdb = get_tenant_db()

    # Reject duplicate invoice numbers
    existing = await tdb.invoices.find_one({'$or': [{'id': payload.invoiceNo}, {'invoice_no': payload.invoiceNo}]}, {'_id': 0, 'id': 1})
    if existing:
        raise HTTPException(status_code=400, detail=f"Invoice '{payload.invoiceNo}' already exists. Use PUT to update.")

    items_resolved, unmatched, lines_net = await _resolve_items(payload.items)
    doc = _build_invoice_doc(payload.invoiceNo, account, payload, items_resolved, tenant_id, current_user.get('id'))
    doc['line_items_net_total'] = lines_net

    await tdb.invoices.insert_one(dict(doc))

    response = {k: v for k, v in doc.items() if k != '_id'}
    response['unmatched_external_item_ids'] = unmatched
    if unmatched:
        logger.warning(f"[external_invoice {payload.invoiceNo}] Unmatched external SKU IDs: {unmatched}")
    return response


@router.put("/{account_id}/invoices/{invoice_no}")
async def update_external_invoice(
    payload: ExternalInvoicePayload,
    account_id: str = Path(..., description="Account ID code (e.g. ORLO-HYD-A26-001)"),
    invoice_no: str = Path(..., description="Invoice number (id) to update"),
    current_user: dict = Depends(get_current_user),
):
    """Update an existing invoice from external system."""
    tenant_id = await _validate_tenant(payload.tenant_id)
    if payload.invoiceNo and payload.invoiceNo != invoice_no:
        raise HTTPException(
            status_code=400,
            detail=f"invoiceNo in body ('{payload.invoiceNo}') does not match URI ('{invoice_no}')."
        )
    if payload.ACCOUNT_ID and payload.ACCOUNT_ID != account_id:
        raise HTTPException(
            status_code=400,
            detail=f"ACCOUNT_ID in body ('{payload.ACCOUNT_ID}') does not match URI ('{account_id}')."
        )

    account = await _resolve_account(account_id)
    tdb = get_tenant_db()

    existing = await tdb.invoices.find_one(
        {'$or': [{'id': invoice_no}, {'invoice_no': invoice_no}]},
        {'_id': 0}
    )
    if not existing:
        raise HTTPException(status_code=404, detail=f"Invoice '{invoice_no}' not found")

    items_resolved, unmatched, lines_net = await _resolve_items(payload.items)
    doc = _build_invoice_doc(invoice_no, account, payload, items_resolved, tenant_id, current_user.get('id'),
                             is_update=True, existing=existing)
    doc['line_items_net_total'] = lines_net

    await tdb.invoices.update_one(
        {'$or': [{'id': invoice_no}, {'invoice_no': invoice_no}]},
        {'$set': doc}
    )

    response = {k: v for k, v in doc.items() if k != '_id'}
    response['unmatched_external_item_ids'] = unmatched
    if unmatched:
        logger.warning(f"[external_invoice {invoice_no}] Unmatched external SKU IDs: {unmatched}")
    return response
