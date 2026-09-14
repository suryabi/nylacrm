"""Production Run workflow on a batch:
planned → (pre checklist + pre-QC params) → in_production → output capture → post_checklist → closed (→ QC queue 'created').
Report PDF + notifications on close. Old batches (no `run`) are untouched."""
import io
import uuid
import logging
from datetime import datetime, timezone
from typing import Optional, List, Dict

from fastapi import APIRouter, Depends, HTTPException, Query
from fastapi.responses import StreamingResponse
from pydantic import BaseModel

from database import db
from deps import get_current_user, get_user_or_factory_staff
from core.tenant import get_current_tenant_id
from routes.production_qc import _is_elevated
from routes.maintenance_sheets import (pre_production_status, consume_pre_production, create_post_run_tasks,
                                       _supervisors_for, ADMIN_ROLES)

router = APIRouter(prefix="/production/run", tags=["Production Run"])
RUN_STATUSES = ("planned", "in_production", "post_checklist")
DEFAULT_PARAMS = [
    {"key": "ph", "name": "pH", "unit": "", "min": 6.5, "max": 8.5, "required": True},
    {"key": "tds", "name": "TDS", "unit": "mg/L", "min": 50, "max": 500, "required": True},
]


class ParamDef(BaseModel):
    key: str
    name: str
    unit: str = ""
    min: Optional[float] = None
    max: Optional[float] = None
    required: bool = True


class ParamsIn(BaseModel):
    sku_id: Optional[str] = None      # None = tenant default
    params: List[ParamDef]


class ValuesIn(BaseModel):
    values: Dict[str, Optional[float]]
    override: bool = False
    override_reason: Optional[str] = None


class OverrideIn(BaseModel):
    override: bool = False
    override_reason: Optional[str] = None


class OutputIn(BaseModel):
    total_crates: int
    notes: Optional[str] = None


class InitiateIn(BaseModel):
    sku_id: str
    target_child_sku_id: Optional[str] = None


class CloseIn(OverrideIn):
    total_crates: Optional[int] = None
    bottles_per_crate: Optional[int] = None
    notes: Optional[str] = None
    batch_code: Optional[str] = None
    production_date: Optional[str] = None


def _now():
    return datetime.now(timezone.utc).isoformat()


async def _next_batch_code(tenant_id: str, sku: dict) -> str:
    prefix = (sku.get("sku_code") or "B").strip().upper().replace(" ", "")
    day = datetime.now(timezone.utc).strftime("%d%m%y")
    base = f"{prefix}-{day}-"
    n = await db.production_batches.count_documents({"tenant_id": tenant_id, "batch_code": {"$regex": f"^{base}"}})
    while True:
        code = f"{base}{101 + n}"
        if not await db.production_batches.find_one({"tenant_id": tenant_id, "batch_code": code}, {"_id": 1}):
            return code
        n += 1


async def _param_config(tenant_id: str, sku_id: Optional[str]) -> dict:
    doc = None
    if sku_id:
        doc = await db.quality_parameters.find_one({"tenant_id": tenant_id, "sku_id": sku_id}, {"_id": 0})
    if not doc:
        doc = await db.quality_parameters.find_one({"tenant_id": tenant_id, "sku_id": None}, {"_id": 0})
    return {"params": (doc or {}).get("params") or DEFAULT_PARAMS, "source": "sku" if doc and doc.get("sku_id") else ("default" if doc else "builtin")}


async def _batch(tenant_id: str, batch_id: str) -> dict:
    b = await db.production_batches.find_one({"tenant_id": tenant_id, "id": batch_id}, {"_id": 0})
    if not b:
        raise HTTPException(404, "Batch not found")
    if not b.get("run"):
        raise HTTPException(400, "This batch was created before the production-run workflow")
    return b


def _override(user: dict, data, what: str) -> Optional[dict]:
    if not data.override:
        return None
    if not _is_elevated(user):
        raise HTTPException(403, f"Only CEO / System Admin can override the {what}")
    reason = (data.override_reason or "").strip()
    if not reason:
        raise HTTPException(400, f"A reason is required to override the {what}")
    return {"by": user.get("id"), "by_name": user.get("name"), "reason": reason, "at": _now()}


async def _notify_admins(tenant_id: str, ids: list, title: str, body: str, link: str, batch_id: str):
    try:
        from utils.notify import notify_users
        await notify_users(tenant_id, ids, title=title, body=body, link=link, kind="alert", category="approval",
                           entity_type="production_batch", entity_id=batch_id)
    except Exception:
        logging.getLogger("production_run").exception("notify failed")


async def _admin_ids(tenant_id: str) -> list:
    users = await db.users.find({"tenant_id": tenant_id}, {"_id": 0, "id": 1, "role": 1}).to_list(500)
    return [u["id"] for u in users if (u.get("role") or "").lower() in ADMIN_ROLES]


# ── Parameter configuration ──────────────────────────────────────────────────
@router.get("/params")
async def get_params(sku_id: Optional[str] = Query(None), current_user: dict = Depends(get_current_user)):
    _ = current_user
    tenant_id = get_current_tenant_id()
    cfg = await _param_config(tenant_id, sku_id)
    sku_docs = await db.quality_parameters.find({"tenant_id": tenant_id, "sku_id": {"$ne": None}}, {"_id": 0, "sku_id": 1}).to_list(500)
    return {**cfg, "sku_overrides": [d["sku_id"] for d in sku_docs]}


@router.put("/params")
async def put_params(data: ParamsIn, current_user: dict = Depends(get_current_user)):
    if (current_user.get("role") or "").lower() not in ADMIN_ROLES:
        raise HTTPException(403, "Admin only")
    tenant_id = get_current_tenant_id()
    params = [p.model_dump() for p in data.params if p.key.strip() and p.name.strip()]
    if not params and data.sku_id:
        await db.quality_parameters.delete_one({"tenant_id": tenant_id, "sku_id": data.sku_id})
        return {"ok": True, "removed": True}
    await db.quality_parameters.update_one({"tenant_id": tenant_id, "sku_id": data.sku_id},
                                           {"$set": {"params": params, "updated_at": _now(), "updated_by": current_user.get("name")}}, upsert=True)
    return {"ok": True, "params": params}


async def _operator(current_user: dict) -> dict:
    """Factory Staff may drive a run only when flagged 'Production operator'; app users always may."""
    if current_user.get("is_factory_staff"):
        m = await db.qc_team.find_one({"tenant_id": get_current_tenant_id(), "id": current_user["id"]}, {"_id": 0, "production_operator": 1})
        if not (m or {}).get("production_operator"):
            raise HTTPException(403, "You are not flagged as a Production operator — ask an admin to enable it under Factory Staff")
    return current_user


@router.get("/skus")
async def run_skus(current_user: dict = Depends(get_user_or_factory_staff)):
    """Active SKUs selectable when initiating a run (staff-accessible)."""
    await _operator(current_user)
    skus = await db.master_skus.find({"is_active": True}, {"_id": 0, "id": 1, "sku_name": 1, "sku_code": 1, "category": 1, "allows_child_skus": 1}).sort("sku_name", 1).to_list(500)
    return {"skus": skus}


@router.get("/active")
async def active_runs(current_user: dict = Depends(get_user_or_factory_staff)):
    """Runs still in progress (planned / in_production / post_checklist) for resume."""
    await _operator(current_user)
    rows = await db.production_batches.find({"tenant_id": get_current_tenant_id(), "status": {"$in": list(RUN_STATUSES)}},
                                            {"_id": 0, "id": 1, "batch_code": 1, "sku_name": 1, "status": 1, "created_by_name": 1, "created_at": 1, "run.started_at": 1}).sort("created_at", -1).to_list(50)
    return {"runs": rows}


# ── Run state ────────────────────────────────────────────────────────────────
@router.post("/initiate")
async def initiate_run(data: InitiateIn, current_user: dict = Depends(get_user_or_factory_staff)):
    """Wizard entry: SKU only → draft batch (planned) with auto code, today's date, SKU default packaging."""
    await _operator(current_user)
    tenant_id = get_current_tenant_id()
    sku = await db.master_skus.find_one({"id": data.sku_id}, {"_id": 0})
    if not sku:
        raise HTTPException(404, "SKU not found")
    prod_pkg = (sku.get("packaging_config") or {}).get("production") or []
    bpc = None
    if not prod_pkg:
        pt = await db.packaging_types.find_one({"is_default": True}, {"_id": 0}) or await db.packaging_types.find_one({}, {"_id": 0})
        bpc = (pt or {}).get("units_per_package")
    from routes.production_qc import create_batch, BatchCreate
    payload = BatchCreate(sku_id=data.sku_id, batch_code=await _next_batch_code(tenant_id, sku), bottles_per_crate=bpc,
                          production_date=datetime.now(timezone.utc).strftime("%Y-%m-%d"), use_run_workflow=True,
                          target_child_sku_id=data.target_child_sku_id)
    batch = await create_batch(payload, current_user)
    await db.production_batches.update_one({"tenant_id": tenant_id, "id": batch["id"]}, {"$set": {"run.wizard": True}})
    return {"ok": True, "batch_id": batch["id"], "batch_code": batch["batch_code"]}


@router.post("/{batch_id}/cancel")
async def cancel_run(batch_id: str, current_user: dict = Depends(get_user_or_factory_staff)):
    """Abandon an in-progress run (before the batch record is finalised)."""
    await _operator(current_user)
    tenant_id = get_current_tenant_id()
    b = await _batch(tenant_id, batch_id)
    if b["status"] not in RUN_STATUSES:
        raise HTTPException(409, "Only in-progress runs can be cancelled")
    await db.post_run_tasks.delete_many({"tenant_id": tenant_id, "batch_id": batch_id})
    # Checks ticked inside this run belong to it → discard with the batch; QR-page (untagged) checks are only unlinked.
    discarded = await db.maintenance_records.delete_many({"tenant_id": tenant_id, "trigger": "per_run", "batch_id": batch_id})
    await db.maintenance_records.update_many({"tenant_id": tenant_id, "consumed_by_batch_id": batch_id},
                                             {"$set": {"cancelled_batch_id": batch_id, "cancelled_batch_code": b["batch_code"]}})
    await db.production_batches.delete_one({"tenant_id": tenant_id, "id": batch_id})
    await db.maintenance_audit.insert_one({"id": str(uuid.uuid4()), "tenant_id": tenant_id, "action": "production_run_cancelled", "batch_id": batch_id,
                                           "batch_code": b["batch_code"], "sku_name": b.get("sku_name"), "status_at_cancel": b["status"],
                                           "discarded_checks": discarded.deleted_count, "by_id": current_user.get("id"),
                                           "by_name": current_user.get("name") or current_user.get("email"), "at": _now()})
    return {"ok": True, "cancelled": b["batch_code"], "discarded_checks": discarded.deleted_count}


@router.get("/{batch_id}")
async def get_run(batch_id: str, current_user: dict = Depends(get_user_or_factory_staff)):
    await _operator(current_user)
    tenant_id = get_current_tenant_id()
    b = await _batch(tenant_id, batch_id)
    run = b["run"]
    checklist = await pre_production_status(tenant_id, b["sku_id"], current_user, batch_id) if b["status"] == "planned" else None
    post_tasks = await db.post_run_tasks.find({"tenant_id": tenant_id, "batch_id": batch_id}, {"_id": 0}).to_list(200)
    eq_params = {e["id"]: e.get("maintenance_parameters") or [] for e in await db.equipment_master.find(
        {"tenant_id": tenant_id, "id": {"$in": [t["equipment_id"] for t in post_tasks]}}, {"_id": 0, "id": 1, "maintenance_parameters": 1}).to_list(200)}
    post_tasks = [{**t, "maintenance_parameters": eq_params.get(t["equipment_id"], [])} for t in post_tasks]
    return {"batch": {k: b.get(k) for k in ("id", "batch_code", "sku_id", "sku_name", "status", "total_crates", "total_bottles", "bottles_per_crate",
                                            "production_date", "created_by_name", "created_at", "pre_production_clearances", "pre_production_override")},
            "run": run, "checklist": checklist, "params": await _param_config(tenant_id, b["sku_id"]),
            "post_tasks": post_tasks, "is_elevated": _is_elevated(current_user)}


@router.post("/{batch_id}/params")
async def record_params(batch_id: str, data: ValuesIn, current_user: dict = Depends(get_current_user)):
    tenant_id = get_current_tenant_id()
    b = await _batch(tenant_id, batch_id)
    if b["status"] != "planned":
        raise HTTPException(409, "Parameters can only be recorded before production starts")
    cfg = await _param_config(tenant_id, b["sku_id"])
    out, missing = [], []
    for p in cfg["params"]:
        v = data.values.get(p["key"])
        if v is None:
            if p.get("required"):
                missing.append(p["name"])
            continue
        if (p.get("min") is not None and v < p["min"]) or (p.get("max") is not None and v > p["max"]):
            out.append(f"{p['name']} = {v}{(' ' + p['unit']) if p.get('unit') else ''} (allowed {p.get('min', '–')}–{p.get('max', '–')})")
    if missing:
        raise HTTPException(400, "Missing required parameter(s): " + ", ".join(missing))
    override = _override(current_user, data, "quality parameters") if out else None
    pre_qc = {"values": data.values, "params": cfg["params"], "out_of_range": out, "passed": not out,
              "override": override, "recorded_by": current_user.get("name"), "recorded_by_id": current_user.get("id"), "at": _now()}
    await db.production_batches.update_one({"tenant_id": tenant_id, "id": batch_id}, {"$set": {"run.pre_qc": pre_qc, "ph_value": data.values.get("ph"), "updated_at": _now()}})
    if out and not override:
        raise HTTPException(409, "Out of range: " + "; ".join(out) + ". Values saved — correct them or use a CEO/System Admin override.")
    return {"ok": True, "pre_qc": pre_qc}


@router.post("/{batch_id}/start")
async def start_production(batch_id: str, data: OverrideIn, current_user: dict = Depends(get_user_or_factory_staff)):
    await _operator(current_user)
    tenant_id = get_current_tenant_id()
    b = await _batch(tenant_id, batch_id)
    if b["status"] != "planned":
        raise HTTPException(409, "Production already started")
    pre = await pre_production_status(tenant_id, b["sku_id"], current_user, batch_id)
    pre_qc = (b["run"] or {}).get("pre_qc")
    problems = []
    if pre["pending"]:
        problems.append("checklist pending: " + ", ".join(i["name"] for i in pre["pending"]))
    if pre_qc and not pre_qc.get("passed") and not pre_qc.get("override"):
        problems.append("quality parameters out of range")
    override = _override(current_user, data, "pre-production checks") if problems else None
    if problems and not override:
        raise HTTPException(409, "Cannot start production — " + "; ".join(problems))
    now = _now()
    batch_stub = {"id": b["id"], "batch_code": b["batch_code"], "sku_name": b.get("sku_name")}
    clearances = await consume_pre_production(tenant_id, b["sku_id"], batch_stub)
    tasks = await create_post_run_tasks(tenant_id, b["sku_id"], batch_stub)
    upd = {"status": "in_production", "run.started_at": now, "run.started_by": current_user.get("name"), "run.started_by_id": current_user.get("id"),
           "run.start_override": override, "run.pending_at_start": [{"id": i["id"], "name": i["name"], "kind": i.get("kind")} for i in pre["pending"]],
           "pre_production_clearances": clearances, "pre_production_override": ({**override, "pending": [{"equipment_name": i["name"]} for i in pre["pending"]]} if override and pre["pending"] else None),
           "post_run_tasks": tasks, "updated_at": now}
    await db.production_batches.update_one({"tenant_id": tenant_id, "id": batch_id}, {"$set": upd})
    if override:
        await _notify_admins(tenant_id, await _admin_ids(tenant_id), f"⚠ Production started with override — batch {b['batch_code']}",
                             f"{current_user.get('name')} started {b['batch_code']} ({b.get('sku_name')}) despite: {'; '.join(problems)}. Reason: {override['reason']}",
                             f"/production/batches/{batch_id}", batch_id)
    return {"ok": True, "status": "in_production", "started_at": now}


@router.post("/{batch_id}/stop")
async def stop_production(batch_id: str, data: OutputIn, current_user: dict = Depends(get_user_or_factory_staff)):
    """Stop production and capture output (crates) → post-production checklist stage."""
    await _operator(current_user)
    tenant_id = get_current_tenant_id()
    b = await _batch(tenant_id, batch_id)
    if b["status"] != "in_production":
        raise HTTPException(409, "Batch is not in production")
    if data.total_crates <= 0:
        raise HTTPException(400, "Enter the number of crates produced")
    bpc = b.get("bottles_per_crate") or 0
    now = _now()
    await db.production_batches.update_one({"tenant_id": tenant_id, "id": batch_id}, {"$set": {
        "status": "post_checklist", "total_crates": data.total_crates, "total_bottles": data.total_crates * bpc,
        "unallocated_crates": data.total_crates,
        "run.stopped_at": now, "run.stopped_by": current_user.get("name"), "run.stopped_by_id": current_user.get("id"),
        "run.output_notes": (data.notes or "").strip() or None, "updated_at": now}})
    return {"ok": True, "status": "post_checklist", "total_crates": data.total_crates, "total_bottles": data.total_crates * bpc}


@router.post("/{batch_id}/close")
async def close_run(batch_id: str, data: CloseIn, current_user: dict = Depends(get_user_or_factory_staff)):
    """Close the production run: post checklist must be done → batch enters the QC queue; report + notifications."""
    await _operator(current_user)
    tenant_id = get_current_tenant_id()
    b = await _batch(tenant_id, batch_id)
    if b["status"] != "post_checklist":
        raise HTTPException(409, "Stop production and capture output first")
    tasks = await db.post_run_tasks.find({"tenant_id": tenant_id, "batch_id": batch_id}, {"_id": 0}).to_list(200)
    pending = [t for t in tasks if t.get("status") != "completed"]
    override = _override(current_user, data, "post-production checklist") if pending else None
    if pending and not override:
        raise HTTPException(409, "Post-production checklist pending: " + ", ".join(t["equipment_name"] for t in pending))
    now = _now()
    final = {}
    if data.bottles_per_crate is not None:
        if data.bottles_per_crate <= 0:
            raise HTTPException(400, "Bottles per crate must be greater than 0")
        final["bottles_per_crate"] = data.bottles_per_crate
    crates = data.total_crates if data.total_crates is not None else (b.get("total_crates") or 0)
    if crates <= 0:
        raise HTTPException(400, "Crates produced must be greater than 0")
    bpc = data.bottles_per_crate or b.get("bottles_per_crate") or 0
    final.update({"total_crates": crates, "total_bottles": crates * bpc, "unallocated_crates": crates})
    b.update(final)
    if data.notes is not None:
        final["run.output_notes"] = data.notes.strip() or None
    if data.production_date:
        final["production_date"] = data.production_date
    code = (data.batch_code or "").strip()
    if code and code != b["batch_code"]:
        if await db.production_batches.find_one({"tenant_id": tenant_id, "batch_code": code, "id": {"$ne": batch_id}}, {"_id": 1}):
            raise HTTPException(400, f"Batch code '{code}' already exists")
        final["batch_code"] = code
        await db.post_run_tasks.update_many({"tenant_id": tenant_id, "batch_id": batch_id}, {"$set": {"batch_code": code}})
        await db.maintenance_records.update_many({"tenant_id": tenant_id, "consumed_by_batch_id": batch_id}, {"$set": {"consumed_by_batch_code": code}})
        b["batch_code"] = code
    await db.production_batches.update_one({"tenant_id": tenant_id, "id": batch_id}, {"$set": {**final,
        "status": "created", "run.closed_at": now, "run.closed_by": current_user.get("name"), "run.closed_by_id": current_user.get("id"),
        "run.close_override": override, "run.post_tasks_snapshot": tasks, "updated_at": now}})
    # notify admins + supervisors of involved equipment
    eq_ids = list({t["equipment_id"] for t in tasks} | {c.get("equipment_id") for c in (b.get("pre_production_clearances") or []) if c.get("equipment_id")})
    sup_ids = set()
    for eq in await db.equipment_master.find({"tenant_id": tenant_id, "id": {"$in": eq_ids}}, {"_id": 0}).to_list(500):
        sup_ids |= {s["id"] for s in await _supervisors_for(tenant_id, eq)}
    recipients = list(set(await _admin_ids(tenant_id)) | sup_ids)
    crates = b.get("total_crates") or 0
    body = (f"{b['batch_code']} ({b.get('sku_name')}) closed by {current_user.get('name')}: {crates} crates / {b.get('total_bottles') or 0} bottles. "
            f"Run {(b['run'].get('started_at') or '')[:16].replace('T', ' ')} → {(b['run'].get('stopped_at') or '')[:16].replace('T', ' ')} UTC."
            + (f" Post-checklist overridden: {override['reason']}." if override else "") + " Batch run report attached in the app.")
    await _notify_admins(tenant_id, recipients, f"✅ Production run closed — batch {b['batch_code']}", body, f"/production/batches/{batch_id}", batch_id)
    try:
        from utils.email_sender import send_email
        emails = [u["email"] for u in await db.users.find({"tenant_id": tenant_id, "id": {"$in": recipients}}, {"_id": 0, "email": 1}).to_list(500) if u.get("email")]
        for e in emails:
            await send_email(to=e, subject=f"Production run closed — {b['batch_code']}", html=f"<p>{body}</p><p>Open the batch in the app to download the Batch Run Report (PDF).</p>", text=body)
    except Exception:
        logging.getLogger("production_run").exception("close email failed")
    return {"ok": True, "status": "created", "closed_at": now, "notified": len(recipients)}


# ── Report PDF ───────────────────────────────────────────────────────────────
@router.get("/{batch_id}/report.pdf")
async def run_report(batch_id: str, current_user: dict = Depends(get_current_user)):
    _ = current_user
    tenant_id = get_current_tenant_id()
    b = await _batch(tenant_id, batch_id)
    run = b["run"] or {}
    tasks = run.get("post_tasks_snapshot") or await db.post_run_tasks.find({"tenant_id": tenant_id, "batch_id": batch_id}, {"_id": 0}).to_list(200)
    from reportlab.lib.pagesizes import A4
    from reportlab.lib import colors
    from reportlab.lib.styles import getSampleStyleSheet
    from reportlab.platypus import SimpleDocTemplate, Paragraph, Spacer, Table, TableStyle
    buf = io.BytesIO()
    doc = SimpleDocTemplate(buf, pagesize=A4, leftMargin=36, rightMargin=36, topMargin=36, bottomMargin=36)
    st = getSampleStyleSheet()
    f = lambda s: (s or "")[:16].replace("T", " ")
    el = [Paragraph(f"Batch Run Report — {b['batch_code']}", st["Title"]),
          Paragraph(f"SKU: <b>{b.get('sku_name')}</b> &nbsp;&nbsp; Production date: {b.get('production_date')} &nbsp;&nbsp; Created by {b.get('created_by_name')} at {f(b.get('created_at'))} UTC", st["Normal"]),
          Spacer(1, 10)]
    grid = lambda rows, widths: Table(rows, colWidths=widths, style=TableStyle([
        ("BACKGROUND", (0, 0), (-1, 0), colors.HexColor("#0f172a")), ("TEXTCOLOR", (0, 0), (-1, 0), colors.white),
        ("FONTSIZE", (0, 0), (-1, -1), 8), ("GRID", (0, 0), (-1, -1), 0.4, colors.HexColor("#cbd5e1")), ("VALIGN", (0, 0), (-1, -1), "TOP")]))
    el += [Paragraph("Run timeline", st["Heading3"]), grid([["Step", "By", "At (UTC)", "Notes"],
        ["Production started", run.get("started_by") or "", f(run.get("started_at")), (run.get("start_override") or {}).get("reason", "")],
        ["Production stopped", run.get("stopped_by") or "", f(run.get("stopped_at")), run.get("output_notes") or ""],
        ["Batch closed", run.get("closed_by") or "", f(run.get("closed_at")), (run.get("close_override") or {}).get("reason", "")]], [120, 110, 100, 190]), Spacer(1, 8)]
    el += [Paragraph("Output", st["Heading3"]), Paragraph(f"<b>{b.get('total_crates') or 0}</b> crates × {b.get('bottles_per_crate') or 0} bottles = <b>{b.get('total_bottles') or 0}</b> bottles", st["Normal"]), Spacer(1, 8)]
    pq = run.get("pre_qc") or {}
    if pq.get("params"):
        rows = [["Parameter", "Value", "Allowed", "Result"]]
        for p in pq.get("params") or []:
            v = (pq.get("values") or {}).get(p["key"])
            rng = f"{p.get('min', '–')} – {p.get('max', '–')} {p.get('unit', '')}"
            ok = v is not None and not ((p.get("min") is not None and v < p["min"]) or (p.get("max") is not None and v > p["max"]))
            rows.append([p["name"], "" if v is None else f"{v} {p.get('unit', '')}", rng, "OK" if ok else ("—" if v is None else "OUT OF RANGE")])
        el += [Paragraph(f"Pre-production quality parameters — recorded by {pq.get('recorded_by') or '—'} at {f(pq.get('at'))}" + (f" · OVERRIDE: {pq['override']['reason']}" if pq.get("override") else ""), st["Heading3"]), grid(rows, [150, 100, 150, 120]), Spacer(1, 8)]
    small = st["BodyText"].clone("small", fontSize=7, leading=9)
    def _pval(p):
        v = p.get("value")
        if v is None:
            return None
        v = ", ".join(map(str, v)) if isinstance(v, list) else str(v)
        n = len(p.get("photos") or [])
        return f"{p.get('name')}: {v}{(' ' + p['unit']) if p.get('unit') else ''}{' ⚠' if p.get('in_range') is False else ''}{f' ({n} photo)' if n else ''}"
    pv = lambda ps: Paragraph(", ".join(x for x in (_pval(p) for p in (ps or [])) if x) or "—", small)
    rows = [["Type", "Equipment", "Done by", "At", "Parameters", "Status"]]
    for c in b.get("pre_production_clearances") or []:
        rows.append(["Before run" if c.get("kind", "pre") == "pre" else f"After run ({c.get('after_batch_code')})", Paragraph(c.get("equipment_name") or "", small), c.get("performed_by") or "", f(c.get("completed_at")), pv(c.get("parameters")), c.get("status") or "completed"])
    for p in run.get("pending_at_start") or []:
        rows.append(["Pending at start", Paragraph(p.get("name") or "", small), "", "", "", "OVERRIDDEN"])
    el += [Paragraph("Pre-production equipment checklist", st["Heading3"]), grid(rows if len(rows) > 1 else rows + [["—", "No per-run equipment", "", "", "", ""]], [75, 120, 80, 75, 120, 50]), Spacer(1, 8)]
    rows = [["Equipment", "Done by", "At", "Parameters", "Status"]] + [[Paragraph(t.get("equipment_name") or "", small), t.get("performed_by") or "", f(t.get("completed_at")), pv(t.get("parameters")), (t.get("status") or "").upper()] for t in tasks]
    el += [Paragraph("Post-production equipment checklist", st["Heading3"]), grid(rows if len(rows) > 1 else rows + [["No after-run equipment", "", "", "", ""]], [140, 90, 80, 150, 60])]
    doc.build(el)
    buf.seek(0)
    return StreamingResponse(buf, media_type="application/pdf", headers={"Content-Disposition": f'inline; filename="{b["batch_code"]}-run-report.pdf"'})
