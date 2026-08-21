"""Account Volume Tracking Grid — spreadsheet-style per-account volume view for Sales.
Auto-computed delivery metrics + manually entered Expected Monthly Volume + custom columns."""
import uuid
import re
from datetime import datetime, timezone
from typing import Optional, List, Dict, Any
from pydantic import BaseModel, Field
from fastapi import APIRouter, HTTPException, Depends

from deps import get_current_user
from core.tenant import get_current_tenant_id
from database import db

router = APIRouter(prefix="/account-volume-grid", tags=["Account Volume Grid"])

CONFIG = "volume_grid_config"
DONE_STATUSES = ["delivered", "complete"]

EDIT_ROLES = {"ceo", "director", "admin", "system admin", "vice president",
              "national sales head", "regional sales manager", "head of business",
              "partner - sales", "sales partner", "sales rep"}


def _require_edit(user: dict):
    if (user.get("role") or "").strip().lower() not in EDIT_ROLES:
        raise HTTPException(status_code=403, detail="Sales/Admin access required")


def _now():
    return datetime.now(timezone.utc).isoformat()


def _parse_dt(v):
    if not v:
        return None
    try:
        return datetime.fromisoformat(str(v).replace("Z", "+00:00"))
    except Exception:
        try:
            return datetime.strptime(str(v)[:10], "%Y-%m-%d")
        except Exception:
            return None


async def _get_config(tenant_id: str) -> dict:
    doc = await db[CONFIG].find_one({"tenant_id": tenant_id}, {"_id": 0})
    if not doc:
        doc = {"id": str(uuid.uuid4()), "tenant_id": tenant_id, "columns": [],
               "created_at": _now(), "updated_at": _now()}
        await db[CONFIG].insert_one({**doc})
        doc.pop("_id", None)
    return doc


@router.get("")
async def get_grid(
    territory: Optional[str] = None, state: Optional[str] = None,
    city: Optional[str] = None, search: Optional[str] = None,
    current_user: dict = Depends(get_current_user),
):
    tenant_id = get_current_tenant_id()
    q = {"tenant_id": tenant_id}
    if territory:
        q["territory"] = territory
    if state:
        q["state"] = state
    if city:
        q["city"] = city
    if search:
        q["account_name"] = {"$regex": re.escape(search), "$options": "i"}

    accounts = await db.accounts.find(q, {
        "_id": 0, "id": 1, "account_id": 1, "account_name": 1, "territory": 1,
        "state": 1, "city": 1, "contract_signed_date": 1,
        "expected_monthly_volume_crates": 1, "volume_grid_values": 1,
    }).sort("account_name", 1).to_list(5000)

    # Delivery metrics per account (dates in bottles; totals per delivery)
    acc_ids = [a["id"] for a in accounts] + [a.get("account_id") for a in accounts if a.get("account_id")]
    deliveries = await db.distributor_deliveries.find(
        {"tenant_id": tenant_id, "status": {"$in": DONE_STATUSES}, "account_id": {"$in": acc_ids}},
        {"_id": 0, "account_id": 1, "delivered_at": 1, "delivery_date": 1,
         "created_at": 1, "total_quantity": 1}
    ).to_list(20000)

    by_acc: Dict[str, list] = {}
    for d in deliveries:
        dt = _parse_dt(d.get("delivered_at") or d.get("delivery_date") or d.get("created_at"))
        if not dt:
            continue
        by_acc.setdefault(d["account_id"], []).append((dt, d.get("total_quantity") or 0))

    rows = []
    for a in accounts:
        dels = sorted(by_acc.get(a["id"], []) + by_acc.get(a.get("account_id"), []), key=lambda x: x[0])
        first_dt = dels[0][0] if dels else None
        last_dt = dels[-1][0] if dels else None
        last_qty = dels[-1][1] if dels else None
        freq = None
        if len(dels) >= 2:
            span_days = (dels[-1][0].replace(tzinfo=None) - dels[0][0].replace(tzinfo=None)).days
            freq = round(span_days / (len(dels) - 1)) if span_days > 0 else 0
        emv = a.get("expected_monthly_volume_crates")
        rows.append({
            "account_id": a["id"],
            "account_code": a.get("account_id"),
            "account_name": a.get("account_name"),
            "territory": a.get("territory"), "state": a.get("state"), "city": a.get("city"),
            "contract_signed_date": (a.get("contract_signed_date") or "")[:10] or None,
            "avg_order_frequency_days": freq,
            "order_count": len(dels),
            "first_delivery_date": first_dt.strftime("%Y-%m-%d") if first_dt else None,
            "latest_delivery_date": last_dt.strftime("%Y-%m-%d") if last_dt else None,
            "last_order_quantity": last_qty,
            "expected_monthly_volume_crates": emv,
            "biweekly_volume_crates": round(emv / 2, 1) if isinstance(emv, (int, float)) else None,
            "custom_values": a.get("volume_grid_values") or {},
        })

    config = await _get_config(tenant_id)
    return {"rows": rows, "custom_columns": config.get("columns") or [], "total": len(rows)}


class RowUpdate(BaseModel):
    expected_monthly_volume_crates: Optional[float] = Field(default=None, ge=0)
    custom_values: Optional[Dict[str, Any]] = None
    clear_expected: bool = False


@router.put("/rows/{account_id}")
async def update_row(account_id: str, payload: RowUpdate, current_user: dict = Depends(get_current_user)):
    _require_edit(current_user)
    tenant_id = get_current_tenant_id()
    acc = await db.accounts.find_one({"id": account_id, "tenant_id": tenant_id}, {"_id": 0, "id": 1, "volume_grid_values": 1})
    if not acc:
        raise HTTPException(status_code=404, detail="Account not found")
    upd = {"updated_at": _now()}
    if payload.clear_expected:
        upd["expected_monthly_volume_crates"] = None
    elif payload.expected_monthly_volume_crates is not None:
        upd["expected_monthly_volume_crates"] = payload.expected_monthly_volume_crates
    if payload.custom_values is not None:
        config = await _get_config(tenant_id)
        known_ids = {c["id"] for c in config.get("columns") or []}
        incoming = {k: v for k, v in payload.custom_values.items() if k in known_ids}
        if payload.custom_values and not incoming:
            raise HTTPException(status_code=400, detail="Unknown custom column")
        merged = {**(acc.get("volume_grid_values") or {}), **incoming}
        upd["volume_grid_values"] = merged
    await db.accounts.update_one({"id": account_id, "tenant_id": tenant_id}, {"$set": upd})
    return {"saved": True}


class ColumnIn(BaseModel):
    name: str
    type: str  # text | number | date | formula
    formula: Optional[str] = None


@router.post("/columns")
async def add_column(payload: ColumnIn, current_user: dict = Depends(get_current_user)):
    _require_edit(current_user)
    tenant_id = get_current_tenant_id()
    if payload.type not in ("text", "number", "date", "formula"):
        raise HTTPException(status_code=400, detail="Invalid column type")
    name = payload.name.strip()
    if not name:
        raise HTTPException(status_code=400, detail="Column name is required")
    if payload.type == "formula" and not (payload.formula or "").strip():
        raise HTTPException(status_code=400, detail="Formula is required for formula columns")
    config = await _get_config(tenant_id)
    if any(c["name"].lower() == name.lower() for c in config.get("columns") or []):
        raise HTTPException(status_code=400, detail="A column with this name already exists")
    col = {"id": str(uuid.uuid4()), "name": name, "type": payload.type,
           "formula": (payload.formula or "").strip() or None, "created_at": _now()}
    await db[CONFIG].update_one({"tenant_id": tenant_id},
                                {"$push": {"columns": col}, "$set": {"updated_at": _now()}})
    return col


@router.delete("/columns/{column_id}")
async def delete_column(column_id: str, current_user: dict = Depends(get_current_user)):
    _require_edit(current_user)
    tenant_id = get_current_tenant_id()
    exists = await db[CONFIG].find_one({"tenant_id": tenant_id, "columns.id": column_id}, {"_id": 1})
    if not exists:
        raise HTTPException(status_code=404, detail="Column not found")
    await db[CONFIG].update_one(
        {"tenant_id": tenant_id},
        {"$pull": {"columns": {"id": column_id}}, "$set": {"updated_at": _now()}})
    # Purge orphaned values for the removed column from all accounts
    await db.accounts.update_many(
        {"tenant_id": tenant_id, f"volume_grid_values.{column_id}": {"$exists": True}},
        {"$unset": {f"volume_grid_values.{column_id}": ""}})
    return {"deleted": True}
