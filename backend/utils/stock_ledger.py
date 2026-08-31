"""Stock movement ledger — one row per physical stock deduction or re-add so
any warehouse number can be traced. Best-effort: never raises to the caller."""
import uuid
import logging
from datetime import datetime, timezone

from database import db

logger = logging.getLogger("stock_ledger")


async def log_stock_movement(
    tenant_id: str,
    *,
    direction: str,            # "out" (deduction) | "in" (re-add / restore)
    quantity,
    sku_id: str,
    sku_name: str = None,
    child_sku_id: str = None,
    child_sku_name: str = None,
    batch_id: str = None,
    batch_code: str = None,
    location_id: str = None,
    location_kind: str = "factory",   # factory | distributor
    source_type: str = "delivery",    # delivery | delivery_reverse | manual_readd | promo | promo_reverse
    reference: str = None,            # delivery / challan number
    performed_by: str = None,
    note: str = None,
):
    try:
        qty = int(quantity or 0)
        if qty <= 0:
            return
        await db.stock_movements.insert_one({
            "id": str(uuid.uuid4()),
            "tenant_id": tenant_id,
            "direction": direction,
            "quantity": qty,
            "sku_id": sku_id,
            "sku_name": sku_name,
            "child_sku_id": child_sku_id,
            "child_sku_name": child_sku_name,
            "batch_id": batch_id,
            "batch_code": batch_code,
            "location_id": location_id,
            "location_kind": location_kind,
            "source_type": source_type,
            "reference": reference,
            "performed_by": performed_by,
            "note": note,
            "created_at": datetime.now(timezone.utc).isoformat(),
        })
    except Exception:
        logger.exception("Failed to log stock movement")
