"""Reversals audit log — unified read-only view of reversed Stock-Out
deliveries and Promotional Stock-Out dispatches, for finance reconciliation
and catching accidental stock-out entries.

Reversed records live in `distributor_deliveries` (regular deliveries AND new
unified promo dispatches, flagged `is_promo`) plus legacy `promo_dispatches`.
"""
from fastapi import APIRouter, Depends, HTTPException, Query
from typing import Optional
from datetime import datetime, timezone

from database import db
from deps import get_current_user
from core.tenant import get_current_tenant_id
from routes.distributors import is_distributor_admin, can_manage_distributor_data

router = APIRouter()


def _parse_reason(doc: dict) -> Optional[str]:
    """Regular delivery reversals store the reason in remarks as 'Reversed: ...'.
    Promo reversals carry no reason."""
    remarks = doc.get("remarks") or ""
    for line in remarks.splitlines():
        line = line.strip()
        if line.lower().startswith("reversed:"):
            return line.split(":", 1)[1].strip() or None
    return doc.get("reversal_reason") or None


def _row(doc: dict, dist_name: str) -> dict:
    is_promo = bool(doc.get("is_promo")) or bool(doc.get("challan_number") and not doc.get("delivery_number"))
    value = (doc.get("net_customer_billing")
             if doc.get("net_customer_billing") is not None else doc.get("total_net_amount"))
    if value is None:
        value = doc.get("indicative_value") or doc.get("total_gross_amount") or 0
    recipient = (doc.get("account_name") or doc.get("customer_name")
                 or doc.get("recipient_name") or doc.get("contact_name") or "—")
    return {
        "id": doc.get("id"),
        "type": "Promo" if is_promo else "Delivery",
        "reference_number": doc.get("delivery_number") or doc.get("challan_number") or "—",
        "distributor_id": doc.get("distributor_id"),
        "distributor_name": dist_name or "—",
        "recipient": recipient,
        "value": round(float(value or 0), 2),
        "original_status": doc.get("reversed_from_status") or "—",
        "stock_readded": bool(doc.get("stock_readded")),
        "reversed_at": doc.get("reversed_at"),
        "reversed_by": doc.get("reversed_by_name") or "—",
        "reason": _parse_reason(doc),
        "zoho_void_pending": bool(doc.get("zoho_void_pending") or doc.get("zoho_cleanup_pending")),
    }


async def _collect_reversals(tenant_id: str, distributor_id: Optional[str],
                             from_date: Optional[str], to_date: Optional[str],
                             type_filter: Optional[str]) -> list:
    q = {"tenant_id": tenant_id, "status": "reversed"}
    if distributor_id:
        q["distributor_id"] = distributor_id
    # reversed_at is an ISO string → lexicographic range works for ISO-8601
    if from_date:
        q["reversed_at"] = {"$gte": from_date}
    if to_date:
        q.setdefault("reversed_at", {})
        q["reversed_at"]["$lte"] = to_date + "T23:59:59.999999+00:00" if len(to_date) == 10 else to_date

    docs = []
    async for d in db.distributor_deliveries.find(q, {"_id": 0}):
        docs.append(d)
    async for d in db.promo_dispatches.find(q, {"_id": 0}):
        d["is_promo"] = True
        docs.append(d)

    # distributor name lookup
    dist_ids = list({d.get("distributor_id") for d in docs if d.get("distributor_id")})
    names = {}
    if dist_ids:
        async for dd in db.distributors.find(
            {"id": {"$in": dist_ids}, "tenant_id": tenant_id},
            {"_id": 0, "id": 1, "distributor_name": 1, "name": 1, "business_name": 1, "legal_entity_name": 1}):
            names[dd["id"]] = (dd.get("distributor_name") or dd.get("name")
                               or dd.get("business_name") or dd.get("legal_entity_name") or "—")

    rows = [_row(d, names.get(d.get("distributor_id"), "—")) for d in docs]
    if type_filter and type_filter.lower() in ("delivery", "promo"):
        rows = [r for r in rows if r["type"].lower() == type_filter.lower()]
    rows.sort(key=lambda r: r.get("reversed_at") or "", reverse=True)
    return rows


@router.get("/reversals")
async def list_all_reversals(
    from_date: Optional[str] = Query(None),
    to_date: Optional[str] = Query(None),
    distributor_id: Optional[str] = Query(None),
    type: Optional[str] = Query(None),
    current_user: dict = Depends(get_current_user),
):
    """Admin-wide reversals audit log across all distributors."""
    if not is_distributor_admin(current_user):
        raise HTTPException(status_code=403, detail="Not authorised to view the reversals log.")
    tenant_id = get_current_tenant_id()
    rows = await _collect_reversals(tenant_id, distributor_id, from_date, to_date, type)
    return {
        "reversals": rows,
        "total": len(rows),
        "total_value": round(sum(r["value"] for r in rows), 2),
    }


@router.get("/distributors/{distributor_id}/reversals")
async def list_distributor_reversals(
    distributor_id: str,
    from_date: Optional[str] = Query(None),
    to_date: Optional[str] = Query(None),
    type: Optional[str] = Query(None),
    current_user: dict = Depends(get_current_user),
):
    """Reversals for a single distributor (admin or that distributor's user)."""
    if not can_manage_distributor_data(current_user, distributor_id):
        raise HTTPException(status_code=403, detail="Not authorised to view this distributor's reversals.")
    tenant_id = get_current_tenant_id()
    rows = await _collect_reversals(tenant_id, distributor_id, from_date, to_date, type)
    return {
        "reversals": rows,
        "total": len(rows),
        "total_value": round(sum(r["value"] for r in rows), 2),
    }
