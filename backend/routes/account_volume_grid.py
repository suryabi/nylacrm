"""Account Volume Tracking Grid — spreadsheet-style per-account volume view for Sales.
Auto-computed delivery metrics + manually entered Expected Monthly Volume + custom columns."""
import uuid
import re
from datetime import datetime, timezone, timedelta
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


ADMIN_ROLES = {"ceo", "director", "system admin", "system_admin", "admin", "tenant_admin", "owner"}
MODULE_KEY = "account_volume_grid"


async def _module_perms(user: dict):
    """Role-matrix permissions for this module from Role Management (db.roles)."""
    role = (user.get("role") or "").strip()
    if not role:
        return None
    doc = await db.roles.find_one(
        {"tenant_id": get_current_tenant_id(), "name": role}, {"_id": 0, "permissions": 1})
    return ((doc or {}).get("permissions") or {}).get(MODULE_KEY)


async def _require_view(user: dict):
    if (user.get("role") or "").strip().lower() in ADMIN_ROLES:
        return
    mp = await _module_perms(user)
    if mp is None:  # module not configured in role matrix — allow (matches frontend default)
        return
    if mp.get("view") is not True:
        raise HTTPException(status_code=403, detail="Your role does not have access to Volume Tracking")


async def _require_edit(user: dict):
    if (user.get("role") or "").strip().lower() in ADMIN_ROLES:
        return
    mp = await _module_perms(user)
    if mp is not None:
        if mp.get("edit") is True or mp.get("create") is True:
            return
        raise HTTPException(status_code=403, detail="Your role does not have edit access to Volume Tracking")
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
    await _require_view(current_user)
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
        "state": 1, "city": 1, "activated_at": 1,
        "expected_monthly_volume_crates": 1, "volume_grid_values": 1,
    }).sort("account_name", 1).to_list(5000)

    # Delivery metrics per account (dates in bottles; totals per delivery)
    acc_ids = [a["id"] for a in accounts] + [a.get("account_id") for a in accounts if a.get("account_id")]
    deliveries = await db.distributor_deliveries.find(
        {"tenant_id": tenant_id, "status": {"$in": DONE_STATUSES}, "account_id": {"$in": acc_ids}},
        {"_id": 0, "id": 1, "account_id": 1, "delivered_at": 1, "delivery_date": 1,
         "created_at": 1, "total_quantity": 1, "distributor_location_id": 1}
    ).to_list(20000)
    loc_by_delivery = {d["id"]: d.get("distributor_location_id") for d in deliveries if d.get("id")}

    by_acc: Dict[str, list] = {}
    for d in deliveries:
        dt = _parse_dt(d.get("delivered_at") or d.get("delivery_date") or d.get("created_at"))
        if not dt:
            continue
        by_acc.setdefault(d["account_id"], []).append((dt, d.get("total_quantity") or 0, d.get("id")))

    # Convert delivery quantities (bottles) → crates using master_skus bottles_per_crate
    delivery_ids = [d.get("id") for d in deliveries if d.get("id")]
    crates_by_delivery: Dict[str, float] = {}
    bpc_by_delivery: Dict[str, list] = {}
    skus_by_delivery: Dict[str, list] = {}
    skuids_by_delivery: Dict[str, set] = {}
    upc: Dict[str, int] = {}
    if delivery_ids:
        items = await db.distributor_delivery_items.find(
            {"delivery_id": {"$in": delivery_ids}},
            {"_id": 0, "delivery_id": 1, "sku_id": 1, "sku_name": 1, "quantity": 1}).to_list(50000)
        sku_ids = list({i.get("sku_id") for i in items if i.get("sku_id")})
        if sku_ids:
            async for ms in db.master_skus.find(
                    {"id": {"$in": sku_ids}},
                    {"_id": 0, "id": 1, "bottles_per_crate": 1, "packaging_config": 1}):
                bpc = ms.get("bottles_per_crate")
                if not bpc:
                    pc = (ms.get("packaging_config") or {}).get("production") or []
                    default = next((p for p in pc if p.get("is_default")), None)
                    if default:
                        bpc = default.get("units") or default.get("units_per_package")
                if bpc:
                    upc[ms["id"]] = bpc
        for i in items:
            n = upc.get(i.get("sku_id"))
            if n:
                bpc_by_delivery.setdefault(i["delivery_id"], []).append(n)
            if i.get("sku_name") and i["sku_name"] not in skus_by_delivery.setdefault(i["delivery_id"], []):
                skus_by_delivery[i["delivery_id"]].append(i["sku_name"])
            if i.get("sku_id"):
                skuids_by_delivery.setdefault(i["delivery_id"], set()).add(i["sku_id"])
            crates_by_delivery[i["delivery_id"]] = crates_by_delivery.get(i["delivery_id"], 0) + (i.get("quantity") or 0) / (n or 1)
    default_bpc = max(set(upc.values()), key=list(upc.values()).count) if crates_by_delivery and upc else 1

    # Current warehouse stock (units) per (location, sku) — for the
    # "Stock at Warehouse" column (stock of the account's SKUs at the
    # warehouse that last served it).
    stock_units: Dict[tuple, int] = {}
    all_locs = list({l for l in loc_by_delivery.values() if l})
    all_skus = list({s for ss in skuids_by_delivery.values() for s in ss})
    if all_locs and all_skus:
        async for sr in db.distributor_stock.find(
                {"tenant_id": tenant_id, "distributor_location_id": {"$in": all_locs},
                 "sku_id": {"$in": all_skus}}, {"_id": 0, "distributor_location_id": 1, "sku_id": 1, "quantity": 1}):
            k = (sr["distributor_location_id"], sr["sku_id"])
            stock_units[k] = stock_units.get(k, 0) + int(sr.get("quantity") or 0)
        async for sr in db.factory_warehouse_stock.find(
                {"tenant_id": tenant_id, "warehouse_location_id": {"$in": all_locs},
                 "sku_id": {"$in": all_skus}}, {"_id": 0, "warehouse_location_id": 1, "sku_id": 1, "quantity": 1}):
            k = (sr["warehouse_location_id"], sr["sku_id"])
            stock_units[k] = stock_units.get(k, 0) + int(sr.get("quantity") or 0)

    rows = []
    for a in accounts:
        dels = sorted(by_acc.get(a["id"], []) + by_acc.get(a.get("account_id"), []), key=lambda x: x[0])
        first_dt = dels[0][0] if dels else None
        last_dt = dels[-1][0] if dels else None
        last_qty = None
        acc_bpcs = [b for _, _, did in dels for b in bpc_by_delivery.get(did, [])]
        acc_bpc = max(set(acc_bpcs), key=acc_bpcs.count) if acc_bpcs else default_bpc
        recent = dels[-4:][::-1]  # last 4 deliveries, newest first
        recent_dates, recent_crates = [], []
        for dt_i, qty_i, did_i in recent:
            cr = crates_by_delivery.get(did_i)
            if cr is None:
                cr = (qty_i or 0) / acc_bpc
            recent_dates.append(dt_i.strftime("%d-%b-%Y"))
            recent_crates.append(round(cr, 2))
        if dels:
            last_crates = crates_by_delivery.get(dels[-1][2])
            if last_crates is None:  # legacy delivery without item docs: bottles ÷ typical crate size
                last_crates = (dels[-1][1] or 0) / acc_bpc
            last_qty = round(last_crates, 2)
        last_sku = ", ".join(skus_by_delivery.get(dels[-1][2], [])) or None if dels else None
        freq = None
        if len(dels) >= 2:
            span_days = (dels[-1][0].replace(tzinfo=None) - dels[0][0].replace(tzinfo=None)).days
            freq = round(span_days / (len(dels) - 1)) if span_days > 0 else 0
        # Actual Monthly Consumption = crates delivered in the most recent 4
        # weeks; only shown once 30 days elapsed since the first delivery.
        actual_monthly = None
        consumption_in_days = None
        if dels:
            now_naive = datetime.now(timezone.utc).replace(tzinfo=None)
            days_elapsed = (now_naive - first_dt.replace(tzinfo=None)).days
            if days_elapsed >= 30:
                cutoff = now_naive - timedelta(days=28)
                total = 0.0
                for dt_i, qty_i, did_i in dels:
                    if dt_i.replace(tzinfo=None) >= cutoff:
                        cr = crates_by_delivery.get(did_i)
                        total += cr if cr is not None else (qty_i or 0) / acc_bpc
                actual_monthly = round(total, 2)
            else:
                consumption_in_days = 30 - days_elapsed
        emv = a.get("expected_monthly_volume_crates")
        # Stock at the warehouse that last served this account, for the SKUs
        # it has ordered. Red-flag when below half the estimated monthly
        # consumption (Expected Monthly Volume, else Actual Monthly Consumption).
        wh_stock = None
        if dels:
            loc = loc_by_delivery.get(dels[-1][2])
            acc_skus = {s for _, _, did in dels for s in skuids_by_delivery.get(did, set())}
            if loc and acc_skus:
                wh_stock = round(sum(
                    stock_units.get((loc, sid), 0) / (upc.get(sid) or default_bpc or 1)
                    for sid in acc_skus), 2)
        est = emv if isinstance(emv, (int, float)) else actual_monthly
        low_stock = bool(
            wh_stock is not None and isinstance(est, (int, float)) and est > 0 and wh_stock < est / 2
        )
        rows.append({
            "account_id": a["id"],
            "account_code": a.get("account_id"),
            "account_name": a.get("account_name"),
            "territory": a.get("territory"), "state": a.get("state"), "city": a.get("city"),
            "onboarded_date": (a.get("activated_at") or "")[:10] or None,
            "avg_order_frequency_days": freq,
            "order_count": len(dels),
            "first_delivery_date": first_dt.strftime("%Y-%m-%d") if first_dt else None,
            "latest_delivery_date": last_dt.strftime("%Y-%m-%d") if last_dt else None,
            "last_order_quantity": last_qty,
            "last_order_sku": last_sku,
            "recent_delivery_dates": recent_dates,
            "recent_delivery_crates": recent_crates,
            "expected_monthly_volume_crates": emv,
            "biweekly_volume_crates": round(emv / 2, 1) if isinstance(emv, (int, float)) else None,
            "actual_monthly_consumption_crates": actual_monthly,
            "consumption_available_in_days": consumption_in_days,
            "warehouse_stock_crates": wh_stock,
            "low_warehouse_stock": low_stock,
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
            "onboarded_date": None, "avg_order_frequency_days": None,
            "order_count": 0, "first_delivery_date": None, "latest_delivery_date": None,
            "last_order_quantity": None,
            "last_order_sku": None,
            "recent_delivery_dates": [], "recent_delivery_crates": [],
            "expected_monthly_volume_crates": emv,
            "biweekly_volume_crates": round(emv / 2, 1) if isinstance(emv, (int, float)) else None,
            "actual_monthly_consumption_crates": None,
            "consumption_available_in_days": None,
            "warehouse_stock_crates": None,
            "low_warehouse_stock": False,
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
    from openpyxl.styles import Font, PatternFill, Alignment
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
            "Number of Orders": r.get("order_count"),
            "Actual Monthly Consumption": r.get("actual_monthly_consumption_crates"),
            "Stock at Warehouse": r.get("warehouse_stock_crates"),
        }
        for c in custom_cols:
            if c["type"] == "number":
                ctx[c["name"]] = (r.get("custom_values") or {}).get(c["id"])
        return ctx

    headers = ["Account Name", "Territory", "State", "City", "On-boarded Date",
               "Avg Order Frequency (Days)", "No. of Orders", "First Delivery Date", "Latest Delivery Date",
               "Last 4 Delivery Dates", "Last 4 Delivery Qty (Crates)",
               "Last Order Quantity (Crates)", "Last Ordered SKU", "Bi-weekly Volume (Crates)", "Expected Monthly Volume (Crates)",
               "Actual Monthly Consumption (Crates)", "Stock at Warehouse (Crates)"] \
        + [c["name"] for c in custom_cols]

    def row_values(r):
        base = [r.get("account_name") or "", r.get("territory") or "", r.get("state") or "",
                r.get("city") or "", r.get("onboarded_date") or "",
                r.get("avg_order_frequency_days"), r.get("order_count"), r.get("first_delivery_date") or "",
                r.get("latest_delivery_date") or "",
                "\n".join(r.get("recent_delivery_dates") or []),
                "\n".join(str(c) for c in (r.get("recent_delivery_crates") or [])),
                r.get("last_order_quantity"), r.get("last_order_sku") or "",
                r.get("biweekly_volume_crates"), r.get("expected_monthly_volume_crates"),
                r.get("actual_monthly_consumption_crates") if r.get("actual_monthly_consumption_crates") is not None
                else (f"Available in {r['consumption_available_in_days']} days" if r.get("consumption_available_in_days") is not None else ""),
                r.get("warehouse_stock_crates")]
        for c in custom_cols:
            if c["type"] == "formula":
                base.append(_eval_formula(c.get("formula"), ctx_for(r)))
            else:
                base.append((r.get("custom_values") or {}).get(c["id"]))
        return base

    all_values = [row_values(r) for r in rows]

    # Totals: only Bi-weekly, Expected Monthly, and custom columns opted into totals
    totals = [f"TOTAL — {len(rows)} rows"] + [""] * (len(headers) - 1)
    total_indexes = {13, 14, 15}  # Bi-weekly, Expected Monthly, Actual Monthly Consumption
    for j, c in enumerate(custom_cols):
        if c.get("include_in_total"):
            total_indexes.add(17 + j)
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
    # Red-flag low warehouse stock (< half estimated monthly consumption)
    low_fill = PatternFill(start_color="FEE2E2", end_color="FEE2E2", fill_type="solid")
    low_font = Font(bold=True, color="B91C1C")
    for i, r in enumerate(rows):
        if r.get("low_warehouse_stock"):
            cell = ws.cell(row=3 + i, column=16)
            cell.fill = low_fill
            cell.font = low_font
    wrap = Alignment(wrap_text=True, vertical="top")
    for row_cells in ws.iter_rows(min_row=3, min_col=10, max_col=11):
        for c in row_cells:
            c.alignment = wrap
    widths = [34, 16, 16, 16, 18, 22, 14, 16, 16, 16, 16, 16, 24, 20, 26, 28, 24] + [18] * len(custom_cols)
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
    await _require_edit(current_user)
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
    await _require_edit(current_user)
    tenant_id = get_current_tenant_id()
    doc = {"id": str(uuid.uuid4()), "tenant_id": tenant_id, "account_name": "",
           "expected_monthly_volume_crates": None, "custom_values": {},
           "created_by": current_user.get("name"), "created_at": _now(), "updated_at": _now()}
    await db[MANUAL].insert_one({**doc})
    doc.pop("_id", None)
    return doc


@router.put("/manual-rows/{row_id}")
async def update_manual_row(row_id: str, payload: ManualRowUpdate, current_user: dict = Depends(get_current_user)):
    await _require_edit(current_user)
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
    await _require_edit(current_user)
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
    await _require_edit(current_user)
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
    await _require_edit(current_user)
    tenant_id = get_current_tenant_id()
    res = await db[CONFIG].update_one(
        {"tenant_id": tenant_id, "columns.id": column_id},
        {"$set": {"columns.$.include_in_total": payload.include_in_total, "updated_at": _now()}})
    if res.matched_count == 0:
        raise HTTPException(status_code=404, detail="Column not found")
    return {"saved": True}


@router.delete("/columns/{column_id}")
async def delete_column(column_id: str, current_user: dict = Depends(get_current_user)):
    await _require_edit(current_user)
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


# ── AI Consignment Planner ─────────────────────────────────────────────
class PlanRequest(BaseModel):
    truck_capacity_crates: float = Field(gt=0, le=100000)
    ai_insights: bool = True
    territory: Optional[str] = None
    state: Optional[str] = None
    city: Optional[str] = None
    search: Optional[str] = None


@router.post("/consignment-plan")
async def consignment_plan(payload: PlanRequest, current_user: dict = Depends(get_current_user)):
    import os
    import json as _json
    from datetime import timedelta

    capacity = payload.truck_capacity_crates
    data = await get_grid(territory=payload.territory, state=payload.state,
                          city=payload.city, search=payload.search, current_user=current_user)
    today = datetime.now(timezone.utc).replace(tzinfo=None, hour=0, minute=0, second=0, microsecond=0)

    profiles = []
    for r in data["rows"]:
        monthly = r.get("expected_monthly_volume_crates")
        recents = [c for c in (r.get("recent_delivery_crates") or []) if isinstance(c, (int, float)) and c > 0]
        typical = round(sum(recents) / len(recents), 2) if recents else (round(monthly / 2, 2) if monthly else None)
        if not typical:
            continue
        freq = r.get("avg_order_frequency_days")
        monthly_est = monthly if monthly else (round(typical * 30 / freq, 1) if freq and freq > 0 else round(typical * 2, 1))
        freq_est = freq if freq and freq > 0 else 15
        last_dt = _parse_dt(r.get("latest_delivery_date"))
        next_dt = (last_dt.replace(tzinfo=None) + timedelta(days=freq_est)) if last_dt else today
        profiles.append({
            "account_name": r.get("account_name"),
            "monthly_consumption_crates": monthly_est,
            "last_order_date": r.get("latest_delivery_date"),
            "last_order_quantity_crates": r.get("last_order_quantity"),
            "order_frequency_days": freq_est,
            "typical_order_crates": typical,
            "expected_next_order_date": next_dt.strftime("%Y-%m-%d"),
            "_next": next_dt,
            "alloc": [0, 0, 0],
        })

    if not profiles:
        raise HTTPException(status_code=400, detail="No accounts with volume data to plan. Set Expected Monthly Volume first.")

    # Available warehouse stock (crates) — plan can never ship more than what's in stock
    tenant_id = get_current_tenant_id()
    stock_rows = await db.factory_warehouse_stock.find(
        {"tenant_id": tenant_id, "quantity": {"$gt": 0}},
        {"_id": 0, "sku_id": 1, "quantity": 1, "bottles_per_crate": 1}).to_list(8000)
    missing_bpc = list({s["sku_id"] for s in stock_rows if not s.get("bottles_per_crate") and s.get("sku_id")})
    stock_bpc: Dict[str, int] = {}
    if missing_bpc:
        async for ms in db.master_skus.find({"id": {"$in": missing_bpc}},
                                            {"_id": 0, "id": 1, "bottles_per_crate": 1, "packaging_config": 1}):
            bpc = ms.get("bottles_per_crate")
            if not bpc:
                pc = (ms.get("packaging_config") or {}).get("production") or []
                default = next((p for p in pc if p.get("is_default")), None)
                if default:
                    bpc = default.get("units") or default.get("units_per_package")
            if bpc:
                stock_bpc[ms["id"]] = bpc
    stock_crates = 0.0
    for s in stock_rows:
        bpc = s.get("bottles_per_crate") or stock_bpc.get(s.get("sku_id")) or 1
        stock_crates += (s.get("quantity") or 0) / bpc
    stock_crates = round(stock_crates, 1)

    # Sequential simulation of 3 truckloads: most-due customers first, top-up with next-soonest
    consignments = []
    prev_date = None
    stock_remaining = stock_crates
    for k in range(3):
        effective_cap = min(capacity, max(stock_remaining, 0))
        remaining = effective_cap
        total = 0.0
        served = []
        due_dates = []
        for p in sorted(profiles, key=lambda x: (x["_next"], -x["monthly_consumption_crates"])):
            if remaining <= 0:
                break
            want = max(1, round(p["typical_order_crates"]))
            alloc = min(want, int(remaining))
            if alloc <= 0:
                continue
            p["alloc"][k] = alloc
            due_dates.append(max(p["_next"], today))
            p["_next"] = max(p["_next"], today) + timedelta(days=p["order_frequency_days"])
            remaining -= alloc
            total += alloc
            served.append(p["account_name"])
        # Suggested dispatch date = earliest due date among served accounts, strictly after previous consignment
        sug = min(due_dates) if due_dates else today
        if prev_date and sug <= prev_date:
            sug = prev_date + timedelta(days=1)
        prev_date = sug
        stock_remaining = round(stock_remaining - total, 1)
        consignments.append({
            "consignment": k + 1,
            "suggested_date": sug.strftime("%Y-%m-%d"),
            "total_crates": round(total, 2),
            "capacity_crates": capacity,
            "utilization_percent": round(total / capacity * 100, 1),
            "accounts_served": len(served),
            "stock_limited": effective_cap < capacity,
        })

    rows = [{k: v for k, v in p.items() if k != "_next"} for p in profiles]
    for r in rows:
        r["consignment_1"], r["consignment_2"], r["consignment_3"] = r.pop("alloc")
    rows.sort(key=lambda r: (-(r["consignment_1"]), -(r["consignment_2"]), -(r["consignment_3"])))

    result = {"truck_capacity_crates": capacity, "generated_at": _now(),
              "warehouse_stock_crates": stock_crates,
              "stock_remaining_after_plan": max(stock_remaining, 0),
              "filters": {"territory": payload.territory, "state": payload.state,
                          "city": payload.city, "search": payload.search},
              "rows": rows, "consignments": consignments, "ai_summary": None, "ai_notes": {}}

    if payload.ai_insights:
        try:
            from emergentintegrations.llm.chat import LlmChat, UserMessage
            api_key = os.environ.get("EMERGENT_LLM_KEY")
            if api_key:
                chat = LlmChat(
                    api_key=api_key,
                    session_id=f"consignment-plan-{uuid.uuid4()}",
                    system_message=(
                        "You are a beverage distribution planning analyst for Nyla Air Water. "
                        "You receive a computed 3-consignment truck allocation plan. Reply ONLY with JSON: "
                        '{"summary": "3-4 sentence executive insight about the plan, risks and utilization", '
                        '"notes": {"<account_name>": "one short note (max 12 words) on why/when to deliver"}}. '
                        "Notes only for accounts with allocations."
                    ),
                ).with_model("openai", "gpt-5.5")
                resp = await chat.send_message(UserMessage(text=_json.dumps(
                    {"truck_capacity_crates": capacity, "warehouse_stock_crates": stock_crates,
                     "stock_remaining_after_plan": max(stock_remaining, 0),
                     "plan_rows": rows, "consignment_totals": consignments})))
                text = re.sub(r"^```(?:json)?\s*|\s*```$", "", str(resp).strip())
                m = re.search(r"\{.*\}", text, re.S)
                parsed = _json.loads(m.group(0) if m else text)
                result["ai_summary"] = parsed.get("summary")
                result["ai_notes"] = parsed.get("notes") or {}
        except Exception:
            result["ai_summary"] = None  # plan still valid without AI narrative
    return result


class PlanExportRequest(BaseModel):
    plan: Dict[str, Any]


@router.post("/consignment-plan/export")
async def export_consignment_plan(payload: PlanExportRequest, current_user: dict = Depends(get_current_user)):
    await _require_view(current_user)
    from io import BytesIO
    from openpyxl import Workbook
    from openpyxl.styles import Font, PatternFill, Alignment
    from fastapi.responses import StreamingResponse
    from utils.excel_branding import brand_workbook

    plan = payload.plan
    rows = plan.get("rows") or []
    cons = plan.get("consignments") or []
    if not rows or len(cons) != 3:
        raise HTTPException(status_code=400, detail="Invalid plan payload")
    cap = plan.get("truck_capacity_crates")
    filters = plan.get("filters") or {}
    notes = plan.get("ai_notes") or {}

    def dmy(s):
        dt = _parse_dt(s)
        return dt.strftime("%d-%b-%Y") if dt else ""

    wb = Workbook()
    ws = wb.active
    ws.title = "Consignment Plan"

    scope = " · ".join(f"{k.title()}: {v}" for k, v in filters.items() if v) or "All accounts"
    stock_info = f" · Warehouse stock: {plan.get('warehouse_stock_crates')} crates" if plan.get("warehouse_stock_crates") is not None else ""
    ws.append([f"Truck capacity: {cap} crates{stock_info} · {scope} · Generated: {datetime.now(timezone.utc).strftime('%d-%b-%Y')}"])
    ws.merge_cells(start_row=1, start_column=1, end_row=1, end_column=10)
    ws.cell(row=1, column=1).font = Font(italic=True, color="555555")

    headers = ["Account", "Monthly (Crates)", "Frequency (Days)", "Last Order", "Expected Next Order",
               "Typical Order (Crates)"] \
        + [f"Consignment {c['consignment']} — {dmy(c.get('suggested_date'))}" for c in cons] + ["Planner Note"]
    ws.append(headers)
    for c in ws[2]:
        c.font = Font(bold=True, color="FFFFFF")
        c.fill = PatternFill(start_color="003048", end_color="003048", fill_type="solid")

    totals = [f"TOTAL — {len(rows)} accounts", "", "", "", "", ""] \
        + [f"{c.get('total_crates')} / {c.get('capacity_crates')} ({c.get('utilization_percent')}%)" for c in cons] + [""]
    ws.append(totals)
    for c in ws[3]:
        c.font = Font(bold=True, color="002FA7")
        c.fill = PatternFill(start_color="E8EDFB", end_color="E8EDFB", fill_type="solid")

    for r in rows:
        ws.append([r.get("account_name"), r.get("monthly_consumption_crates"), r.get("order_frequency_days"),
                   dmy(r.get("last_order_date")), dmy(r.get("expected_next_order_date")),
                   r.get("typical_order_crates"),
                   r.get("consignment_1") or "", r.get("consignment_2") or "", r.get("consignment_3") or "",
                   notes.get(r.get("account_name")) or ""])

    if plan.get("ai_summary"):
        ws.append([])
        ws.append([f"Planner Insight: {plan['ai_summary']}"])
        row_n = ws.max_row
        ws.merge_cells(start_row=row_n, start_column=1, end_row=row_n, end_column=10)
        ws.cell(row=row_n, column=1).alignment = Alignment(wrap_text=True, vertical="top")
        ws.cell(row=row_n, column=1).font = Font(italic=True, color="002FA7")
        ws.row_dimensions[row_n].height = 45

    for idx, w in enumerate([34, 16, 16, 14, 18, 18, 22, 22, 22, 40], start=1):
        ws.column_dimensions[ws.cell(row=2, column=idx).column_letter].width = w
    brand_workbook(wb)

    buf = BytesIO()
    wb.save(buf)
    buf.seek(0)
    fname = f"Consignment Plan - {datetime.now(timezone.utc).strftime('%Y-%m-%d')}.xlsx"
    return StreamingResponse(
        buf, media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        headers={"Content-Disposition": f'attachment; filename="{fname}"'},
    )
