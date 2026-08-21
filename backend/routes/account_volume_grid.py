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
MANUAL = "volume_grid_manual_rows"
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

    # Manual (spreadsheet-style) rows — free rows not tied to an account
    mq = {"tenant_id": tenant_id}
    if search:
        mq["account_name"] = {"$regex": re.escape(search), "$options": "i"}
    manual = await db[MANUAL].find(mq, {"_id": 0}).sort("created_at", 1).to_list(1000)
    for m in manual:
        emv = m.get("expected_monthly_volume_crates")
        rows.append({
            "account_id": m["id"], "account_code": None, "is_manual": True,
            "account_name": m.get("account_name") or "",
            "territory": None, "state": None, "city": None,
            "contract_signed_date": None, "avg_order_frequency_days": None,
            "order_count": 0, "first_delivery_date": None, "latest_delivery_date": None,
            "last_order_quantity": None,
            "expected_monthly_volume_crates": emv,
            "biweekly_volume_crates": round(emv / 2, 1) if isinstance(emv, (int, float)) else None,
            "custom_values": m.get("custom_values") or {},
        })

    return {"rows": rows, "custom_columns": config.get("columns") or [], "total": len(rows)}


_FORMULA_FNS = {
    "SUM": lambda *a: sum(float(x or 0) for x in a),
    "AVERAGE": lambda *a: (sum(float(x or 0) for x in a) / len(a)) if a else 0,
    "AVG": lambda *a: (sum(float(x or 0) for x in a) / len(a)) if a else 0,
    "MIN": lambda *a: min(float(x or 0) for x in a),
    "MAX": lambda *a: max(float(x or 0) for x in a),
    "ROUND": lambda x, n=0: round(float(x), int(n)),
    "ABS": lambda x: abs(float(x)),
    "IF": lambda c, t, f=0: t if c else f,
}
_FN_NAMES = "|".join(_FORMULA_FNS)


def _eval_formula(formula: str, ctx: dict):
    expr = (formula or "").strip()
    if expr.startswith("="):
        expr = expr[1:]
    for name in sorted(ctx, key=len, reverse=True):
        v = ctx[name]
        sub = "0" if v in (None, "") else f"({float(v)})"
        expr = re.sub(rf"(?<!\w){re.escape(name)}(?!\w)", sub, expr, flags=re.IGNORECASE)
    expr = re.sub(rf"\b({_FN_NAMES})\s*\(", lambda m: m.group(1).upper() + "(", expr, flags=re.IGNORECASE)
    expr = expr.replace("^", "**").replace("<>", "!=")
    expr = re.sub(r"(?<![<>=!*])=(?!=)", "==", expr)
    expr = re.sub(r"(\d+(?:\.\d+)?)\s*%", r"(\1/100)", expr)
    stripped = re.sub(rf"\b({_FN_NAMES})\b", "", expr)
    if not re.fullmatch(r"[0-9+\-*/()., <>=!\s]*", stripped):
        return None
    try:
        val = eval(expr, {"__builtins__": {}}, dict(_FORMULA_FNS))  # noqa: S307 — charset-restricted
        val = float(val)
        if val == val and abs(val) != float("inf"):
            return round(val, 2)
    except Exception:
        pass
    return None


@router.get("/export/excel")
async def export_excel(
    territory: Optional[str] = None, state: Optional[str] = None,
    city: Optional[str] = None, search: Optional[str] = None,
    current_user: dict = Depends(get_current_user),
):
    from io import BytesIO
    from openpyxl import Workbook
    from openpyxl.styles import Font, PatternFill
    from fastapi.responses import StreamingResponse
    from utils.excel_branding import brand_workbook

    data = await get_grid(territory=territory, state=state, city=city, search=search, current_user=current_user)
    rows, custom_cols = data["rows"], data["custom_columns"]

    def ctx_for(r):
        ctx = {
            "Expected Monthly Volume": r.get("expected_monthly_volume_crates"),
            "Bi-weekly Volume": r.get("biweekly_volume_crates"),
            "Last Order Quantity": r.get("last_order_quantity"),
            "Average Order Frequency": r.get("avg_order_frequency_days"),
        }
        for c in custom_cols:
            if c["type"] == "number":
                ctx[c["name"]] = (r.get("custom_values") or {}).get(c["id"])
        return ctx

    headers = ["Account Name", "Territory", "State", "City", "Contract Signed Date",
               "Avg Order Frequency (Days)", "First Delivery Date", "Latest Delivery Date",
               "Last Order Quantity", "Bi-weekly Volume (Crates)", "Expected Monthly Volume (Crates)"] \
        + [c["name"] for c in custom_cols]

    def row_values(r):
        base = [r.get("account_name") or "", r.get("territory") or "", r.get("state") or "",
                r.get("city") or "", r.get("contract_signed_date") or "",
                r.get("avg_order_frequency_days"), r.get("first_delivery_date") or "",
                r.get("latest_delivery_date") or "", r.get("last_order_quantity"),
                r.get("biweekly_volume_crates"), r.get("expected_monthly_volume_crates")]
        for c in custom_cols:
            if c["type"] == "formula":
                base.append(_eval_formula(c.get("formula"), ctx_for(r)))
            else:
                base.append((r.get("custom_values") or {}).get(c["id"]))
        return base

    all_values = [row_values(r) for r in rows]

    # Totals: only Bi-weekly, Expected Monthly, and custom columns opted into totals
    totals = [f"TOTAL — {len(rows)} rows"] + [""] * (len(headers) - 1)
    total_indexes = {9, 10}  # Bi-weekly, Expected Monthly
    for j, c in enumerate(custom_cols):
        if c.get("include_in_total"):
            total_indexes.add(11 + j)
    for i in sorted(total_indexes):
        nums = [v[i] for v in all_values if isinstance(v[i], (int, float))]
        if nums:
            totals[i] = round(sum(nums), 2)

    wb = Workbook()
    ws = wb.active
    ws.title = "Volume Tracking"
    ws.append(headers)
    for c in ws[1]:
        c.font = Font(bold=True, color="FFFFFF")
        c.fill = PatternFill(start_color="003048", end_color="003048", fill_type="solid")
    ws.append(totals)
    for c in ws[2]:
        c.font = Font(bold=True, color="002FA7")
        c.fill = PatternFill(start_color="E8EDFB", end_color="E8EDFB", fill_type="solid")
    for v in all_values:
        ws.append(v)
    widths = [34, 16, 16, 16, 18, 22, 16, 16, 16, 20, 26] + [18] * len(custom_cols)
    for idx, w in enumerate(widths, start=1):
        ws.column_dimensions[ws.cell(row=1, column=idx).column_letter].width = w
    brand_workbook(wb)

    buf = BytesIO()
    wb.save(buf)
    buf.seek(0)
    fname = f"Account Volume Tracking - {datetime.now(timezone.utc).strftime('%Y-%m-%d')}.xlsx"
    return StreamingResponse(
        buf, media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        headers={"Content-Disposition": f'attachment; filename="{fname}"'},
    )


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


class ManualRowUpdate(BaseModel):
    account_name: Optional[str] = None
    expected_monthly_volume_crates: Optional[float] = Field(default=None, ge=0)
    clear_expected: bool = False
    custom_values: Optional[Dict[str, Any]] = None


@router.post("/manual-rows")
async def add_manual_row(current_user: dict = Depends(get_current_user)):
    _require_edit(current_user)
    tenant_id = get_current_tenant_id()
    doc = {"id": str(uuid.uuid4()), "tenant_id": tenant_id, "account_name": "",
           "expected_monthly_volume_crates": None, "custom_values": {},
           "created_by": current_user.get("name"), "created_at": _now(), "updated_at": _now()}
    await db[MANUAL].insert_one({**doc})
    doc.pop("_id", None)
    return doc


@router.put("/manual-rows/{row_id}")
async def update_manual_row(row_id: str, payload: ManualRowUpdate, current_user: dict = Depends(get_current_user)):
    _require_edit(current_user)
    tenant_id = get_current_tenant_id()
    row = await db[MANUAL].find_one({"id": row_id, "tenant_id": tenant_id}, {"_id": 0, "custom_values": 1})
    if not row:
        raise HTTPException(status_code=404, detail="Row not found")
    upd = {"updated_at": _now()}
    if payload.account_name is not None:
        upd["account_name"] = payload.account_name.strip()
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
        upd["custom_values"] = {**(row.get("custom_values") or {}), **incoming}
    await db[MANUAL].update_one({"id": row_id, "tenant_id": tenant_id}, {"$set": upd})
    return {"saved": True}


@router.delete("/manual-rows/{row_id}")
async def delete_manual_row(row_id: str, current_user: dict = Depends(get_current_user)):
    _require_edit(current_user)
    tenant_id = get_current_tenant_id()
    res = await db[MANUAL].delete_one({"id": row_id, "tenant_id": tenant_id})
    if res.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Row not found")
    return {"deleted": True}


class ColumnIn(BaseModel):
    name: str
    type: str  # text | number | date | formula
    formula: Optional[str] = None
    include_in_total: bool = False


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
           "formula": (payload.formula or "").strip() or None,
           "include_in_total": bool(payload.include_in_total) and payload.type in ("number", "formula"),
           "created_at": _now()}
    await db[CONFIG].update_one({"tenant_id": tenant_id},
                                {"$push": {"columns": col}, "$set": {"updated_at": _now()}})
    return col


class ColumnToggleTotal(BaseModel):
    include_in_total: bool


@router.put("/columns/{column_id}")
async def update_column(column_id: str, payload: ColumnToggleTotal, current_user: dict = Depends(get_current_user)):
    _require_edit(current_user)
    tenant_id = get_current_tenant_id()
    res = await db[CONFIG].update_one(
        {"tenant_id": tenant_id, "columns.id": column_id},
        {"$set": {"columns.$.include_in_total": payload.include_in_total, "updated_at": _now()}})
    if res.matched_count == 0:
        raise HTTPException(status_code=404, detail="Column not found")
    return {"saved": True}


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
