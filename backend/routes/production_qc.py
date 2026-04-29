"""
Production QC Tracking Module
- QC Route Master (SKU-specific QC flows)
- Production Batches (CRUD)
- Rejection Cost Rules (per-stage cost config)
"""
import uuid
from datetime import datetime, timezone, timedelta
from typing import List, Optional
from pydantic import BaseModel, Field
from fastapi import APIRouter, HTTPException, Depends
from deps import get_current_user
from core.tenant import get_current_tenant_id
from database import db, get_tenant_db

router = APIRouter(prefix="/production", tags=["Production QC"])

# ──────────────────────────────────────────────
# Models
# ──────────────────────────────────────────────

class QCStage(BaseModel):
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    name: str  # e.g. "QC Stage 1", "Labeling", "Final QC"
    stage_type: str  # "qc", "labeling", "final_qc"
    order: int
    description: Optional[str] = None

class QCRouteCreate(BaseModel):
    sku_id: str
    sku_name: str
    stages: List[QCStage]
    is_active: bool = True

class QCRouteUpdate(BaseModel):
    stages: Optional[List[QCStage]] = None
    is_active: Optional[bool] = None

class BatchCreate(BaseModel):
    sku_id: str
    sku_name: str
    batch_code: str
    production_date: str
    total_crates: int
    bottles_per_crate: int
    ph_value: Optional[float] = None
    notes: Optional[str] = None

class BatchUpdate(BaseModel):
    total_crates: Optional[int] = None
    bottles_per_crate: Optional[int] = None
    ph_value: Optional[float] = None
    notes: Optional[str] = None
    status: Optional[str] = None

class RejectionCostMappingUpsert(BaseModel):
    sku_id: str
    stage_name: str
    reason_id: str
    impacted_component_keys: List[str] = []
    notes: Optional[str] = None


class RejectionCostCalcRequest(BaseModel):
    sku_id: str
    stage_name: str
    reason_id: Optional[str] = None
    reason_name: Optional[str] = None
    qty_rejected: int = 0


class WarehouseTransfer(BaseModel):
    warehouse_location_id: str
    quantity: int  # crates to transfer
    notes: Optional[str] = None


# ──────────────────────────────────────────────
# Production Dashboard
# ──────────────────────────────────────────────

@router.get("/dashboard")
async def production_dashboard(
    time_filter: Optional[str] = "this_month",
    current_user: dict = Depends(get_current_user),
):
    """Aggregate stock + rejections, grouped by SKU and stage. Filterable by time range."""
    tenant_id = get_current_tenant_id()
    tdb = get_tenant_db()

    # ── Resolve date range from time_filter (mirrors Sales Revenue dashboard logic) ──
    start_date_iso = None
    end_date_iso = None
    if time_filter and time_filter not in ("all", "lifetime"):
        now = datetime.now(timezone.utc)
        start_date = None
        end_date = None
        if time_filter == "this_week":
            start_date = now - timedelta(days=now.weekday())
            start_date = start_date.replace(hour=0, minute=0, second=0, microsecond=0)
        elif time_filter == "last_week":
            start_date = now - timedelta(days=now.weekday() + 7)
            start_date = start_date.replace(hour=0, minute=0, second=0, microsecond=0)
            end_date = start_date + timedelta(days=6, hours=23, minutes=59, seconds=59)
        elif time_filter == "this_month":
            start_date = now.replace(day=1, hour=0, minute=0, second=0, microsecond=0)
        elif time_filter == "last_month":
            first_of_this_month = now.replace(day=1, hour=0, minute=0, second=0, microsecond=0)
            last_month_last_day = first_of_this_month - timedelta(seconds=1)
            start_date = last_month_last_day.replace(day=1, hour=0, minute=0, second=0, microsecond=0)
            end_date = first_of_this_month - timedelta(seconds=1)
        elif time_filter == "last_3_months":
            start_date = (now - timedelta(days=90)).replace(hour=0, minute=0, second=0, microsecond=0)
        elif time_filter == "last_6_months":
            start_date = (now - timedelta(days=180)).replace(hour=0, minute=0, second=0, microsecond=0)
        elif time_filter == "this_quarter":
            q = (now.month - 1) // 3
            start_date = now.replace(month=q * 3 + 1, day=1, hour=0, minute=0, second=0, microsecond=0)
        elif time_filter == "last_quarter":
            q = (now.month - 1) // 3 - 1
            year = now.year - 1 if q < 0 else now.year
            if q < 0:
                q = 3
            start_date = datetime(year, q * 3 + 1, 1, tzinfo=timezone.utc)
            em = (q + 1) * 3
            if em > 12:
                end_date = datetime(year + 1, 1, 1, tzinfo=timezone.utc) - timedelta(seconds=1)
            else:
                end_date = datetime(year, em + 1, 1, tzinfo=timezone.utc) - timedelta(seconds=1)
        elif time_filter == "this_year":
            start_date = now.replace(month=1, day=1, hour=0, minute=0, second=0, microsecond=0)
        elif time_filter == "last_year":
            start_date = datetime(now.year - 1, 1, 1, tzinfo=timezone.utc)
            end_date = datetime(now.year, 1, 1, tzinfo=timezone.utc) - timedelta(seconds=1)
        if start_date:
            start_date_iso = start_date.isoformat()
        if end_date:
            end_date_iso = end_date.isoformat()

    batch_query = {"tenant_id": tenant_id}
    if start_date_iso:
        cond = {"$gte": start_date_iso}
        if end_date_iso:
            cond["$lte"] = end_date_iso
        batch_query["created_at"] = cond

    batches = await tdb.production_batches.find(
        batch_query,
        {"_id": 0, "id": 1, "sku_id": 1, "sku_name": 1, "total_crates": 1, "bottles_per_crate": 1,
         "total_bottles": 1, "unallocated_crates": 1, "stage_balances": 1,
         "total_passed_final": 1, "transferred_to_warehouse": 1, "total_rejected": 1,
         "status": 1, "qc_stages": 1, "ph_value": 1, "created_at": 1}
    ).to_list(5000)

    # Aggregate per SKU
    sku_map = {}
    total_crates_all = 0
    total_unallocated_all = 0
    total_ready_all = 0
    total_transferred_all = 0
    total_rejected_all = 0
    active_batches = 0
    batch_id_set = set()

    for b in batches:
        batch_id_set.add(b.get("id"))
        sid = b.get("sku_id", "unknown")
        if sid not in sku_map:
            sku_map[sid] = {
                "sku_id": sid,
                "sku_name": b.get("sku_name", "Unknown"),
                "total_crates": 0,
                "total_bottles": 0,
                "unallocated_crates": 0,
                "total_passed_final": 0,
                "transferred_to_warehouse": 0,
                "total_rejected": 0,
                "rejection_cost": 0.0,
                "batch_count": 0,
                "stages": {},
                "stage_order": [],
            }
        sku = sku_map[sid]
        sku["total_crates"] += b.get("total_crates", 0)
        sku["total_bottles"] += b.get("total_bottles", 0)
        sku["unallocated_crates"] += b.get("unallocated_crates", 0)
        sku["total_passed_final"] += b.get("total_passed_final", 0)
        sku["transferred_to_warehouse"] += b.get("transferred_to_warehouse", 0) or 0
        sku["total_rejected"] += b.get("total_rejected", 0)
        sku["batch_count"] += 1

        total_crates_all += b.get("total_crates", 0)
        total_unallocated_all += b.get("unallocated_crates", 0)
        total_ready_all += b.get("total_passed_final", 0)
        total_transferred_all += b.get("transferred_to_warehouse", 0) or 0
        total_rejected_all += b.get("total_rejected", 0)
        if b.get("status") not in ("completed",):
            active_batches += 1

        if not sku["stage_order"] and b.get("qc_stages"):
            sorted_stages = sorted(b["qc_stages"], key=lambda s: s.get("order", 0))
            sku["stage_order"] = [
                {"id": s["id"], "name": s["name"], "type": s.get("stage_type", "qc"), "order": s.get("order", 0)}
                for s in sorted_stages
            ]
        for stage_id, bal in (b.get("stage_balances") or {}).items():
            sname = bal.get("stage_name", stage_id)
            if sname not in sku["stages"]:
                sku["stages"][sname] = {"pending": 0, "passed": 0, "rejected": 0, "received": 0}
            for k in ("pending", "passed", "rejected", "received"):
                sku["stages"][sname][k] += bal.get(k, 0)

    # ── Rejection cost metrics from inspections within the in-range batches ──
    total_rejection_cost = 0.0
    rejection_events = 0
    rejection_unmapped = 0
    by_reason_cost = {}
    by_stage_cost = {}
    top_costly_skus = []

    if batch_id_set:
        # Bulk-load mappings + master COGS values
        all_mappings = await tdb.rejection_cost_mappings.find(
            {"tenant_id": tenant_id}, {"_id": 0}
        ).to_list(5000)
        mapping_lookup = {(m.get("sku_id", ""), m.get("stage_name", ""), m.get("reason_name", "")): m for m in all_mappings}

        from database import db as _global_db
        sku_cogs_docs = await _global_db.master_skus.find(
            {"id": {"$in": list({s["sku_id"] for s in sku_map.values()})}},
            {"_id": 0, "id": 1, "cogs_components_values": 1},
        ).to_list(500)
        sku_cogs_map = {s["id"]: (s.get("cogs_components_values") or {}) for s in sku_cogs_docs}

        # Pull inspections for batches in scope
        ins_docs = await tdb.qc_inspections.find(
            {"tenant_id": tenant_id, "batch_id": {"$in": list(batch_id_set)}},
            {"_id": 0, "batch_id": 1, "stage_name": 1, "rejections": 1, "entries": 1,
             "qty_rejected": 1, "rejection_reason": 1}
        ).to_list(50000)

        # Build a map batch_id -> sku_id (so we can locate the SKU per inspection)
        batch_sku_map = {b.get("id"): b.get("sku_id") for b in batches}

        def add(sku_id_l, stage_l, reason_l, qty_l):
            nonlocal total_rejection_cost, rejection_events, rejection_unmapped
            qty_l = int(qty_l or 0)
            if qty_l <= 0:
                return
            rejection_events += 1
            m = mapping_lookup.get((sku_id_l, stage_l, reason_l))
            if not m:
                rejection_unmapped += 1
                return
            sku_v = sku_cogs_map.get(sku_id_l, {})
            unit = 0.0
            for k in m.get("impacted_component_keys", []):
                unit += float(sku_v.get(k) or 0)
            cost = unit * qty_l
            total_rejection_cost += cost
            by_reason_cost[reason_l] = by_reason_cost.get(reason_l, 0.0) + cost
            by_stage_cost[stage_l] = by_stage_cost.get(stage_l, 0.0) + cost
            if sku_id_l in sku_map:
                sku_map[sku_id_l]["rejection_cost"] += cost

        for ins in ins_docs:
            sku_id_for = batch_sku_map.get(ins.get("batch_id"), "")
            stage = ins.get("stage_name", "")
            entries = ins.get("entries") or []
            if entries:
                for ent in entries:
                    for r in ent.get("rejections") or []:
                        add(sku_id_for, stage, r.get("reason", ""), r.get("qty_rejected", 0))
            else:
                rej_list = ins.get("rejections") or []
                if rej_list:
                    for r in rej_list:
                        add(sku_id_for, stage, r.get("reason", ""), r.get("qty_rejected", 0))
                elif ins.get("qty_rejected"):
                    add(sku_id_for, stage, ins.get("rejection_reason", ""), ins.get("qty_rejected", 0))

        # Top 5 costly SKUs
        top_costly_skus = sorted(
            [{"sku_id": s["sku_id"], "sku_name": s["sku_name"], "rejection_cost": round(s["rejection_cost"], 2),
              "total_rejected": s["total_rejected"]}
             for s in sku_map.values() if s["rejection_cost"] > 0],
            key=lambda x: x["rejection_cost"], reverse=True
        )[:5]

    # Round per-SKU rejection cost
    for s in sku_map.values():
        s["rejection_cost"] = round(s["rejection_cost"], 2)

    skus = sorted(sku_map.values(), key=lambda s: s["total_crates"], reverse=True)

    return {
        "summary": {
            "total_skus": len(skus),
            "total_batches": len(batches),
            "active_batches": active_batches,
            "total_crates": total_crates_all,
            "unallocated_crates": total_unallocated_all,
            "ready_for_warehouse": total_ready_all - total_transferred_all,
            "transferred_to_warehouse": total_transferred_all,
            "total_rejected": total_rejected_all,
            "total_rejection_cost": round(total_rejection_cost, 2),
            "rejection_events": rejection_events,
            "rejection_unmapped": rejection_unmapped,
            "time_filter": time_filter or "this_month",
        },
        "skus": skus,
        "rejection_breakdown": {
            "by_reason": [{"reason": k, "cost": round(v, 2)} for k, v in sorted(by_reason_cost.items(), key=lambda x: x[1], reverse=True)],
            "by_stage": [{"stage": k, "cost": round(v, 2)} for k, v in sorted(by_stage_cost.items(), key=lambda x: x[1], reverse=True)],
            "top_skus": top_costly_skus,
        },
    }


# ──────────────────────────────────────────────
# QC Routes
# ──────────────────────────────────────────────

@router.get("/qc-routes")
async def list_qc_routes(current_user: dict = Depends(get_current_user)):
    tenant_id = get_current_tenant_id()
    tdb = get_tenant_db()
    routes = await tdb.qc_routes.find({"tenant_id": tenant_id}, {"_id": 0}).sort("sku_name", 1).to_list(500)
    return routes

@router.get("/qc-routes/{route_id}")
async def get_qc_route(route_id: str, current_user: dict = Depends(get_current_user)):
    tenant_id = get_current_tenant_id()
    tdb = get_tenant_db()
    route = await tdb.qc_routes.find_one({"id": route_id, "tenant_id": tenant_id}, {"_id": 0})
    if not route:
        raise HTTPException(status_code=404, detail="QC route not found")
    return route

@router.get("/qc-routes/by-sku/{sku_id}")
async def get_qc_route_by_sku(sku_id: str, current_user: dict = Depends(get_current_user)):
    tenant_id = get_current_tenant_id()
    tdb = get_tenant_db()
    route = await tdb.qc_routes.find_one({"sku_id": sku_id, "tenant_id": tenant_id}, {"_id": 0})
    if not route:
        raise HTTPException(status_code=404, detail="No QC route defined for this SKU")
    return route

@router.post("/qc-routes")
async def create_qc_route(data: QCRouteCreate, current_user: dict = Depends(get_current_user)):
    tenant_id = get_current_tenant_id()
    tdb = get_tenant_db()

    # Check if route already exists for this SKU
    existing = await tdb.qc_routes.find_one({"sku_id": data.sku_id, "tenant_id": tenant_id})
    if existing:
        raise HTTPException(status_code=400, detail=f"QC route already exists for SKU: {data.sku_name}")

    now = datetime.now(timezone.utc).isoformat()
    route = {
        "id": str(uuid.uuid4()),
        "tenant_id": tenant_id,
        "sku_id": data.sku_id,
        "sku_name": data.sku_name,
        "stages": [s.model_dump() for s in data.stages],
        "is_active": data.is_active,
        "created_by": current_user.get("id"),
        "created_by_name": current_user.get("name"),
        "created_at": now,
        "updated_at": now,
    }
    await tdb.qc_routes.insert_one(route)
    route.pop("_id", None)
    return route

@router.put("/qc-routes/{route_id}")
async def update_qc_route(route_id: str, data: QCRouteUpdate, current_user: dict = Depends(get_current_user)):
    tenant_id = get_current_tenant_id()
    tdb = get_tenant_db()

    existing = await tdb.qc_routes.find_one({"id": route_id, "tenant_id": tenant_id})
    if not existing:
        raise HTTPException(status_code=404, detail="QC route not found")

    updates = {"updated_at": datetime.now(timezone.utc).isoformat()}
    if data.stages is not None:
        updates["stages"] = [s.model_dump() for s in data.stages]
    if data.is_active is not None:
        updates["is_active"] = data.is_active

    await tdb.qc_routes.update_one({"id": route_id}, {"$set": updates})
    updated = await tdb.qc_routes.find_one({"id": route_id}, {"_id": 0})
    return updated

@router.delete("/qc-routes/{route_id}")
async def delete_qc_route(route_id: str, current_user: dict = Depends(get_current_user)):
    tenant_id = get_current_tenant_id()
    tdb = get_tenant_db()
    result = await tdb.qc_routes.delete_one({"id": route_id, "tenant_id": tenant_id})
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="QC route not found")
    return {"message": "QC route deleted"}


# ──────────────────────────────────────────────
# Production Batches
# ──────────────────────────────────────────────

@router.get("/batches")
async def list_batches(
    status: Optional[str] = None,
    sku_id: Optional[str] = None,
    current_user: dict = Depends(get_current_user)
):
    tenant_id = get_current_tenant_id()
    tdb = get_tenant_db()
    query = {"tenant_id": tenant_id}
    if status:
        query["status"] = status
    if sku_id:
        query["sku_id"] = sku_id

    batches = await tdb.production_batches.find(query, {"_id": 0}).sort("created_at", -1).to_list(1000)
    return batches

@router.get("/batches/{batch_id}")
async def get_batch(batch_id: str, current_user: dict = Depends(get_current_user)):
    tenant_id = get_current_tenant_id()
    tdb = get_tenant_db()
    batch = await tdb.production_batches.find_one({"id": batch_id, "tenant_id": tenant_id}, {"_id": 0})
    if not batch:
        raise HTTPException(status_code=404, detail="Batch not found")
    return batch

@router.post("/batches")
async def create_batch(data: BatchCreate, current_user: dict = Depends(get_current_user)):
    tenant_id = get_current_tenant_id()
    tdb = get_tenant_db()

    # Check if batch code already exists
    existing = await tdb.production_batches.find_one({"batch_code": data.batch_code, "tenant_id": tenant_id})
    if existing:
        raise HTTPException(status_code=400, detail=f"Batch code '{data.batch_code}' already exists")

    # Get QC route for this SKU
    qc_route = await tdb.qc_routes.find_one({"sku_id": data.sku_id, "tenant_id": tenant_id}, {"_id": 0})

    total_bottles = data.total_crates * data.bottles_per_crate
    now = datetime.now(timezone.utc).isoformat()

    # Initialize stage balances from QC route
    stage_balances = {}
    qc_route_id = None
    qc_stages = []
    if qc_route:
        qc_route_id = qc_route["id"]
        qc_stages = qc_route.get("stages", [])
        for stage in qc_stages:
            stage_balances[stage["id"]] = {
                "stage_id": stage["id"],
                "stage_name": stage["name"],
                "stage_type": stage["stage_type"],
                "order": stage["order"],
                "pending": 0,
                "passed": 0,
                "rejected": 0,
                "received": 0,
            }

    batch = {
        "id": str(uuid.uuid4()),
        "tenant_id": tenant_id,
        "batch_code": data.batch_code,
        "sku_id": data.sku_id,
        "sku_name": data.sku_name,
        "production_date": data.production_date,
        "total_crates": data.total_crates,
        "bottles_per_crate": data.bottles_per_crate,
        "total_bottles": total_bottles,
        "production_line": "",
        "ph_value": data.ph_value,
        "notes": data.notes or "",
        "status": "created",  # created, in_qc, in_labeling, in_final_qc, completed
        "qc_route_id": qc_route_id,
        "qc_stages": qc_stages,
        "stage_balances": stage_balances,
        "unallocated_crates": data.total_crates,  # crates not yet moved to any stage
        "total_rejected": 0,
        "total_passed_final": 0,
        "created_by": current_user.get("id"),
        "created_by_name": current_user.get("name"),
        "created_at": now,
        "updated_at": now,
    }
    await tdb.production_batches.insert_one(batch)
    batch.pop("_id", None)
    return batch

@router.put("/batches/{batch_id}")
async def update_batch(batch_id: str, data: BatchUpdate, current_user: dict = Depends(get_current_user)):
    tenant_id = get_current_tenant_id()
    tdb = get_tenant_db()

    existing = await tdb.production_batches.find_one({"id": batch_id, "tenant_id": tenant_id})
    if not existing:
        raise HTTPException(status_code=404, detail="Batch not found")

    updates = {"updated_at": datetime.now(timezone.utc).isoformat()}
    for field in ["total_crates", "bottles_per_crate", "ph_value", "notes", "status"]:
        val = getattr(data, field, None)
        if val is not None:
            updates[field] = val

    # Recalculate total_bottles if crates or bottles_per_crate changed
    new_crates = data.total_crates or existing.get("total_crates", 0)
    new_bpc = data.bottles_per_crate or existing.get("bottles_per_crate", 0)
    if data.total_crates is not None or data.bottles_per_crate is not None:
        updates["total_bottles"] = new_crates * new_bpc

    await tdb.production_batches.update_one({"id": batch_id}, {"$set": updates})
    updated = await tdb.production_batches.find_one({"id": batch_id}, {"_id": 0})
    return updated

@router.delete("/batches/{batch_id}")
async def delete_batch(batch_id: str, current_user: dict = Depends(get_current_user)):
    tenant_id = get_current_tenant_id()
    tdb = get_tenant_db()

    batch = await tdb.production_batches.find_one({"id": batch_id, "tenant_id": tenant_id})
    if not batch:
        raise HTTPException(status_code=404, detail="Batch not found")

    # Only allow deleting batches that haven't moved to QC yet
    if batch.get("status") not in ("created",):
        raise HTTPException(status_code=400, detail="Cannot delete a batch that is already in QC process")

    await tdb.production_batches.delete_one({"id": batch_id})
    return {"message": "Batch deleted"}


# ──────────────────────────────────────────────
# Stage Movement & Inspection
# ──────────────────────────────────────────────

class StageMovement(BaseModel):
    to_stage_id: str
    quantity: int  # crates to move
    notes: Optional[str] = None

class RejectionItem(BaseModel):
    qty_rejected: int  # bottles rejected
    reason: str

class InspectionEntry(BaseModel):
    resource_id: str
    resource_name: str
    date: str
    qty_inspected: int  # crates inspected by this resource on this date
    rejections: List[RejectionItem] = []

class InspectionRecord(BaseModel):
    stage_id: str
    entries: List[InspectionEntry] = []
    remarks: Optional[str] = None

@router.post("/batches/{batch_id}/move")
async def move_stock(batch_id: str, data: StageMovement, current_user: dict = Depends(get_current_user)):
    """Move crates into a stage: from unallocated → first stage, or records receiving at a stage."""
    tenant_id = get_current_tenant_id()
    tdb = get_tenant_db()

    batch = await tdb.production_batches.find_one({"id": batch_id, "tenant_id": tenant_id})
    if not batch:
        raise HTTPException(status_code=404, detail="Batch not found")
    if data.quantity <= 0:
        raise HTTPException(status_code=400, detail="Quantity must be > 0")

    stages = batch.get("qc_stages", [])
    balances = batch.get("stage_balances", {})
    target_stage = next((s for s in stages if s["id"] == data.to_stage_id), None)
    if not target_stage:
        raise HTTPException(status_code=400, detail="Invalid stage")

    sorted_stages = sorted(stages, key=lambda s: s["order"])
    target_order = target_stage["order"]
    is_first_stage = target_order == sorted_stages[0]["order"]

    if is_first_stage:
        # Moving from unallocated → first stage
        unallocated = batch.get("unallocated_crates", 0)
        if data.quantity > unallocated:
            raise HTTPException(status_code=400, detail=f"Only {unallocated} unallocated crates available")

        bal = balances.get(data.to_stage_id, {})
        bal["received"] = bal.get("received", 0) + data.quantity
        bal["pending"] = bal.get("pending", 0) + data.quantity
        balances[data.to_stage_id] = bal

        updates = {
            "unallocated_crates": unallocated - data.quantity,
            "stage_balances": balances,
            "status": "in_qc" if batch.get("status") == "created" else batch.get("status"),
            "updated_at": datetime.now(timezone.utc).isoformat(),
        }
    else:
        # Moving from previous stage (passed) → this stage
        prev_stage = None
        for s in sorted_stages:
            if s["order"] < target_order:
                prev_stage = s
        if not prev_stage:
            raise HTTPException(status_code=400, detail="No previous stage found")

        prev_bal = balances.get(prev_stage["id"], {})
        available = prev_bal.get("passed", 0)
        if data.quantity > available:
            raise HTTPException(status_code=400, detail=f"Only {available} crates passed in {prev_stage['name']}")

        # Deduct from previous stage passed, add to target stage received+pending
        prev_bal["passed"] = prev_bal.get("passed", 0) - data.quantity
        balances[prev_stage["id"]] = prev_bal

        tar_bal = balances.get(data.to_stage_id, {})
        tar_bal["received"] = tar_bal.get("received", 0) + data.quantity
        tar_bal["pending"] = tar_bal.get("pending", 0) + data.quantity
        balances[data.to_stage_id] = tar_bal

        # Update batch status based on stage type
        new_status = batch.get("status")
        if target_stage.get("stage_type") == "labeling":
            new_status = "in_labeling"
        elif target_stage.get("stage_type") == "final_qc":
            new_status = "in_final_qc"

        updates = {
            "stage_balances": balances,
            "status": new_status,
            "updated_at": datetime.now(timezone.utc).isoformat(),
        }

    # Record movement in history
    now = datetime.now(timezone.utc).isoformat()
    movement = {
        "id": str(uuid.uuid4()),
        "batch_id": batch_id,
        "to_stage_id": data.to_stage_id,
        "to_stage_name": target_stage["name"],
        "quantity": data.quantity,
        "notes": data.notes or "",
        "moved_by": current_user.get("id"),
        "moved_by_name": current_user.get("name"),
        "moved_at": now,
        "tenant_id": tenant_id,
    }
    await tdb.stage_movements.insert_one(movement)

    await tdb.production_batches.update_one({"id": batch_id}, {"$set": updates})
    updated = await tdb.production_batches.find_one({"id": batch_id}, {"_id": 0})
    return updated


@router.post("/batches/{batch_id}/inspect")
async def record_inspection(batch_id: str, data: InspectionRecord, current_user: dict = Depends(get_current_user)):
    """Record QC inspection: each entry = resource + date + crates inspected,
    with multiple rejection items (count + reason) per entry."""
    tenant_id = get_current_tenant_id()
    tdb = get_tenant_db()

    batch = await tdb.production_batches.find_one({"id": batch_id, "tenant_id": tenant_id})
    if not batch:
        raise HTTPException(status_code=404, detail="Batch not found")

    stages = batch.get("qc_stages", [])
    balances = batch.get("stage_balances", {})
    stage = next((s for s in stages if s["id"] == data.stage_id), None)
    if not stage:
        raise HTTPException(status_code=400, detail="Invalid stage")

    bal = balances.get(data.stage_id, {})
    pending = bal.get("pending", 0)
    bottles_per_crate = batch.get("bottles_per_crate", 1)

    if not data.entries:
        raise HTTPException(status_code=400, detail="At least one inspection entry is required")

    # Compute totals from entries
    total_crates_inspected = sum(e.qty_inspected for e in data.entries)
    total_rej_bottles = 0
    for e in data.entries:
        entry_rejected = sum(r.qty_rejected for r in e.rejections)
        total_rej_bottles += entry_rejected

    if total_crates_inspected <= 0:
        raise HTTPException(status_code=400, detail="Total crates inspected must be > 0")
    if total_crates_inspected > pending:
        raise HTTPException(status_code=400, detail=f"Only {pending} crates pending at {stage['name']}")

    # Validate each entry
    for e in data.entries:
        if e.qty_inspected <= 0:
            raise HTTPException(status_code=400, detail="Crates inspected must be > 0 for each entry")
        entry_rejected = sum(r.qty_rejected for r in e.rejections)
        max_bottles = e.qty_inspected * bottles_per_crate
        if entry_rejected > max_bottles:
            raise HTTPException(status_code=400, detail=f"Total rejected ({entry_rejected}) exceeds max {max_bottles} bottles for {e.resource_name}")
        for r in e.rejections:
            if r.qty_rejected < 0:
                raise HTTPException(status_code=400, detail="Rejected count cannot be negative")

    # Convert rejected bottles to crate equivalents; only net-passed crates move forward
    rejected_crate_equiv = total_rej_bottles // bottles_per_crate if bottles_per_crate > 0 else 0
    passed_crates = max(total_crates_inspected - rejected_crate_equiv, 0)
    bal["pending"] = pending - total_crates_inspected
    bal["passed"] = bal.get("passed", 0) + passed_crates
    bal["rejected"] = bal.get("rejected", 0) + total_rej_bottles
    balances[data.stage_id] = bal

    batch_total_rejected = batch.get("total_rejected", 0) + total_rej_bottles
    total_passed_final = batch.get("total_passed_final", 0)
    if stage.get("stage_type") == "final_qc":
        # Warehouse ready = only bottles that passed (total inspected bottles - rejected bottles)
        total_bottles_inspected = total_crates_inspected * (batch.get("bottles_per_crate", 1) or 1)
        passed_bottles_this_inspection = total_bottles_inspected - total_rej_bottles
        total_passed_final += max(passed_bottles_this_inspection, 0)

    sorted_stages = sorted(stages, key=lambda s: s["order"])
    all_done = batch.get("unallocated_crates", 0) == 0
    if all_done:
        for s in sorted_stages:
            sb = balances.get(s["id"], {})
            if sb.get("pending", 0) > 0 or sb.get("passed", 0) > 0:
                all_done = False
                break

    new_status = "completed" if all_done else batch.get("status")

    updates = {
        "stage_balances": balances,
        "total_rejected": batch_total_rejected,
        "total_passed_final": total_passed_final,
        "status": new_status,
        "updated_at": datetime.now(timezone.utc).isoformat(),
    }

    now = datetime.now(timezone.utc).isoformat()
    inspection = {
        "id": str(uuid.uuid4()),
        "batch_id": batch_id,
        "stage_id": data.stage_id,
        "stage_name": stage["name"],
        "stage_type": stage.get("stage_type", "qc"),
        "qty_inspected": total_crates_inspected,
        "qty_passed": total_crates_inspected,
        "qty_rejected": total_rej_bottles,
        "entries": [e.model_dump() for e in data.entries],
        "remarks": data.remarks or "",
        "inspected_by": current_user.get("id"),
        "inspected_by_name": current_user.get("name"),
        "inspected_at": now,
        "tenant_id": tenant_id,
    }
    await tdb.inspections.insert_one(inspection)

    await tdb.production_batches.update_one({"id": batch_id}, {"$set": updates})
    updated = await tdb.production_batches.find_one({"id": batch_id}, {"_id": 0})
    return updated



@router.put("/batches/{batch_id}/inspections/{inspection_id}")
async def update_inspection(batch_id: str, inspection_id: str, data: InspectionRecord, current_user: dict = Depends(get_current_user)):
    """Update an existing inspection record and recalculate stage balances."""
    tenant_id = get_current_tenant_id()
    tdb = get_tenant_db()

    batch = await tdb.production_batches.find_one({"id": batch_id, "tenant_id": tenant_id})
    if not batch:
        raise HTTPException(status_code=404, detail="Batch not found")

    old_insp = await tdb.inspections.find_one({"id": inspection_id, "batch_id": batch_id, "tenant_id": tenant_id})
    if not old_insp:
        raise HTTPException(status_code=404, detail="Inspection not found")

    stage_id = old_insp["stage_id"]
    stage = next((s for s in batch.get("qc_stages", []) if s["id"] == stage_id), None)
    if not stage:
        raise HTTPException(status_code=400, detail="Stage not found")

    bottles_per_crate = batch.get("bottles_per_crate", 1) or 1

    # Calculate old totals
    old_crates = old_insp.get("qty_inspected", 0)
    old_rej = old_insp.get("qty_rejected", 0)
    old_rej_crate_equiv = old_rej // bottles_per_crate if bottles_per_crate > 0 else 0
    old_passed = max(old_crates - old_rej_crate_equiv, 0)

    # Calculate new totals
    new_crates = sum(int(e.qty_inspected) for e in data.entries)
    new_rej = sum(sum(int(r.qty_rejected) for r in e.rejections) for e in data.entries)
    new_rej_crate_equiv = new_rej // bottles_per_crate if bottles_per_crate > 0 else 0
    new_passed = max(new_crates - new_rej_crate_equiv, 0)

    # Update stage balances: reverse old, apply new
    balances = batch.get("stage_balances", {})
    bal = balances.get(stage_id, {})
    bal["pending"] = bal.get("pending", 0) + old_crates - new_crates
    bal["passed"] = bal.get("passed", 0) - old_passed + new_passed
    bal["rejected"] = bal.get("rejected", 0) - old_rej + new_rej
    balances[stage_id] = bal

    # Update total_rejected on batch
    total_rejected = (batch.get("total_rejected", 0) or 0) - old_rej + new_rej

    # Update total_passed_final if final_qc stage
    total_passed_final = batch.get("total_passed_final", 0) or 0
    if stage.get("stage_type") == "final_qc":
        old_final_passed = old_crates * bottles_per_crate - old_rej
        new_final_passed = new_crates * bottles_per_crate - new_rej
        total_passed_final = max(0, total_passed_final - old_final_passed + new_final_passed)

    # Update inspection document
    await tdb.inspections.update_one({"id": inspection_id}, {"$set": {
        "qty_inspected": new_crates,
        "qty_passed": new_crates,
        "qty_rejected": new_rej,
        "entries": [e.model_dump() for e in data.entries],
        "remarks": data.remarks or "",
        "updated_at": datetime.now(timezone.utc).isoformat(),
        "updated_by": current_user.get("id"),
        "updated_by_name": current_user.get("name"),
    }})

    # Update batch
    await tdb.production_batches.update_one({"id": batch_id}, {"$set": {
        "stage_balances": balances,
        "total_rejected": total_rejected,
        "total_passed_final": total_passed_final,
        "updated_at": datetime.now(timezone.utc).isoformat(),
    }})

    updated = await tdb.production_batches.find_one({"id": batch_id}, {"_id": 0})
    return updated


@router.get("/batches/{batch_id}/history")
async def get_batch_history(batch_id: str, current_user: dict = Depends(get_current_user)):
    """Get movement and inspection history for a batch."""
    tenant_id = get_current_tenant_id()
    tdb = get_tenant_db()

    movements = await tdb.stage_movements.find(
        {"batch_id": batch_id, "tenant_id": tenant_id}, {"_id": 0}
    ).sort("moved_at", -1).to_list(500)

    inspections = await tdb.inspections.find(
        {"batch_id": batch_id, "tenant_id": tenant_id}, {"_id": 0}
    ).sort("inspected_at", -1).to_list(500)

    # Merge into a single timeline
    timeline = []
    for m in movements:
        timeline.append({**m, "type": "movement", "timestamp": m["moved_at"]})
    for i in inspections:
        timeline.append({**i, "type": "inspection", "timestamp": i["inspected_at"]})
    timeline.sort(key=lambda x: x["timestamp"], reverse=True)

    return {"movements": movements, "inspections": inspections, "timeline": timeline}


# ──────────────────────────────────────────────
# Rejection Cost Mappings  (per Stage × Reason → impacted COGS components)
# ──────────────────────────────────────────────

async def _resolve_master_components(tenant_id: str) -> dict:
    """Returns active rupee COGS components (key -> {label, sort_order, unit})."""
    try:
        # Master cogs_components is global (not tenant-scoped in db.cogs_components)
        from database import db as _db
        comps = await _db.cogs_components.find(
            {"tenant_id": tenant_id, "is_active": True},
            {"_id": 0, "key": 1, "label": 1, "unit": 1, "sort_order": 1},
        ).sort("sort_order", 1).to_list(200)
    except Exception:
        comps = []
    return {c["key"]: c for c in comps if c.get("unit") == "rupee"}


@router.get("/rejection-cost-config")
async def get_rejection_cost_config(
    sku_id: Optional[str] = None,
    current_user: dict = Depends(get_current_user),
):
    """SKU-scoped configuration data.

    Without `sku_id` → returns the list of active SKUs (for the picker) plus
    master COGS components and master rejection reasons.
    With `sku_id` → also returns that SKU's QC-route stages and existing
    mappings for it.
    """
    tenant_id = get_current_tenant_id()
    tdb = get_tenant_db()

    # Active master ₹ components
    comps_map = await _resolve_master_components(tenant_id)
    components = sorted(comps_map.values(), key=lambda c: c.get("sort_order", 99))

    # Active SKUs from master (global db.master_skus), ordered by master sort_order
    from database import db as _db
    sku_docs = await _db.master_skus.find(
        {"is_active": {"$ne": False}},
        {"_id": 0, "id": 1, "sku_name": 1, "external_sku_id": 1, "category": 1, "sort_order": 1},
    ).sort([("sort_order", 1), ("sku_name", 1)]).to_list(500)

    # Master rejection reasons
    reasons = await tdb.rejection_reasons.find(
        {"tenant_id": tenant_id},
        {"_id": 0, "id": 1, "name": 1},
    ).sort("name", 1).to_list(500)

    payload = {
        "components": components,
        "skus": sku_docs,
        "reasons": reasons,
    }

    if sku_id:
        # Stages from this SKU's QC route(s) — there can be multiple routes per SKU; union
        routes = await tdb.qc_routes.find(
            {"tenant_id": tenant_id, "sku_id": sku_id, "is_active": {"$ne": False}},
            {"_id": 0, "stages": 1},
        ).to_list(50)
        stage_seen = {}
        for r in routes:
            for s in r.get("stages", []):
                nm = s.get("name")
                if nm and nm not in stage_seen:
                    stage_seen[nm] = s.get("order", 99)
        stages = [{"name": k, "order": v} for k, v in sorted(stage_seen.items(), key=lambda kv: kv[1])]

        # Mappings for this SKU only
        mappings = await tdb.rejection_cost_mappings.find(
            {"tenant_id": tenant_id, "sku_id": sku_id},
            {"_id": 0},
        ).to_list(2000)

        sku_doc = next((s for s in sku_docs if s.get("id") == sku_id), None)
        if not sku_doc:
            sku_doc = await _db.master_skus.find_one(
                {"id": sku_id},
                {"_id": 0, "id": 1, "sku_name": 1, "external_sku_id": 1, "category": 1},
            )
        # Always include cogs_components_values so the UI can show live cost per row
        sku_full = await _db.master_skus.find_one(
            {"id": sku_id},
            {"_id": 0, "id": 1, "sku_name": 1, "cogs_components_values": 1},
        )
        if sku_doc and sku_full:
            sku_doc = {**sku_doc, "cogs_components_values": sku_full.get("cogs_components_values") or {}}
        payload["sku"] = sku_doc
        payload["stages"] = stages
        payload["mappings"] = mappings

    return payload


@router.get("/rejection-cost-mappings")
async def list_rejection_cost_mappings(
    sku_id: Optional[str] = None,
    current_user: dict = Depends(get_current_user),
):
    tenant_id = get_current_tenant_id()
    tdb = get_tenant_db()
    q = {"tenant_id": tenant_id}
    if sku_id:
        q["sku_id"] = sku_id
    return await tdb.rejection_cost_mappings.find(q, {"_id": 0}).to_list(5000)


@router.post("/rejection-cost-mappings")
async def upsert_rejection_cost_mapping(data: RejectionCostMappingUpsert, current_user: dict = Depends(get_current_user)):
    """Create or update a (sku_id, stage_name, reason_id) mapping atomically."""
    tenant_id = get_current_tenant_id()
    tdb = get_tenant_db()

    if not data.sku_id or not data.stage_name or not data.reason_id:
        raise HTTPException(status_code=400, detail="sku_id, stage_name and reason_id are required")

    # Validate SKU exists
    from database import db as _db
    sku = await _db.master_skus.find_one(
        {"id": data.sku_id},
        {"_id": 0, "id": 1, "sku_name": 1},
    )
    if not sku:
        raise HTTPException(status_code=404, detail="SKU not found")

    # Validate reason exists & resolve name
    reason = await tdb.rejection_reasons.find_one(
        {"id": data.reason_id, "tenant_id": tenant_id},
        {"_id": 0, "id": 1, "name": 1},
    )
    if not reason:
        raise HTTPException(status_code=404, detail="Rejection reason not found")

    # Validate components against master (ignore unknown silently)
    comps_map = await _resolve_master_components(tenant_id)
    impacted = [k for k in (data.impacted_component_keys or []) if k in comps_map]

    now = datetime.now(timezone.utc).isoformat()
    existing = await tdb.rejection_cost_mappings.find_one(
        {"tenant_id": tenant_id, "sku_id": data.sku_id, "stage_name": data.stage_name, "reason_id": data.reason_id},
        {"_id": 0},
    )
    if existing:
        await tdb.rejection_cost_mappings.update_one(
            {"id": existing["id"]},
            {"$set": {
                "impacted_component_keys": impacted,
                "notes": data.notes,
                "reason_name": reason["name"],
                "sku_name": sku["sku_name"],
                "updated_at": now,
                "updated_by": current_user.get("id"),
            }},
        )
        existing.update({
            "impacted_component_keys": impacted,
            "notes": data.notes,
            "reason_name": reason["name"],
            "sku_name": sku["sku_name"],
            "updated_at": now,
        })
        return existing

    doc = {
        "id": str(uuid.uuid4()),
        "tenant_id": tenant_id,
        "sku_id": data.sku_id,
        "sku_name": sku["sku_name"],
        "stage_name": data.stage_name,
        "reason_id": data.reason_id,
        "reason_name": reason["name"],
        "impacted_component_keys": impacted,
        "notes": data.notes,
        "created_at": now,
        "updated_at": now,
        "created_by": current_user.get("id"),
    }
    await tdb.rejection_cost_mappings.insert_one(dict(doc))
    return doc


@router.delete("/rejection-cost-mappings/{mapping_id}")
async def delete_rejection_cost_mapping(mapping_id: str, current_user: dict = Depends(get_current_user)):
    tenant_id = get_current_tenant_id()
    tdb = get_tenant_db()
    result = await tdb.rejection_cost_mappings.delete_one({"id": mapping_id, "tenant_id": tenant_id})
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Mapping not found")
    return {"message": "Mapping deleted"}


async def _calc_rejection_cost(
    tenant_id: str,
    sku_id: str,
    stage_name: str,
    reason_id: Optional[str],
    reason_name: Optional[str],
    qty_rejected: int,
) -> dict:
    """Internal helper used by the calculate endpoint AND for enrichment in reports."""
    tdb = get_tenant_db()

    # SKU master values
    from database import db as _db
    sku = await _db.master_skus.find_one(
        {"id": sku_id},
        {"_id": 0, "id": 1, "sku_name": 1, "cogs_components_values": 1},
    )
    if not sku:
        return {
            "qty_rejected": qty_rejected,
            "stage_name": stage_name,
            "reason_id": reason_id,
            "reason_name": reason_name,
            "breakdown": [],
            "unit_cost": 0.0,
            "total_cost": 0.0,
            "missing_mapping": False,
            "missing_sku": True,
        }

    # Find mapping (sku-scoped, by reason_id preferred, fallback to reason_name)
    mapping_q = {"tenant_id": tenant_id, "sku_id": sku_id, "stage_name": stage_name}
    mapping = None
    if reason_id:
        mapping = await tdb.rejection_cost_mappings.find_one({**mapping_q, "reason_id": reason_id}, {"_id": 0})
    if not mapping and reason_name:
        mapping = await tdb.rejection_cost_mappings.find_one({**mapping_q, "reason_name": reason_name}, {"_id": 0})

    impacted_keys = (mapping or {}).get("impacted_component_keys", [])
    sku_vals = sku.get("cogs_components_values") or {}
    comps_map = await _resolve_master_components(tenant_id)

    breakdown = []
    missing_sku_values = []
    unit_cost = 0.0
    for k in impacted_keys:
        comp = comps_map.get(k)
        if not comp:
            continue
        v = sku_vals.get(k)
        if v is None:
            missing_sku_values.append(k)
            v = 0.0
        v = float(v or 0)
        breakdown.append({
            "component_key": k,
            "label": comp.get("label", k),
            "unit_cost": round(v, 2),
            "qty": qty_rejected,
            "line_total": round(v * qty_rejected, 2),
        })
        unit_cost += v

    return {
        "sku_id": sku_id,
        "sku_name": sku.get("sku_name"),
        "qty_rejected": qty_rejected,
        "stage_name": stage_name,
        "reason_id": reason_id or (mapping or {}).get("reason_id"),
        "reason_name": reason_name or (mapping or {}).get("reason_name"),
        "breakdown": breakdown,
        "unit_cost": round(unit_cost, 2),
        "total_cost": round(unit_cost * qty_rejected, 2),
        "missing_mapping": mapping is None,
        "missing_sku_values": missing_sku_values,
    }


@router.post("/rejection-cost-calculate")
async def rejection_cost_calculate(data: RejectionCostCalcRequest, current_user: dict = Depends(get_current_user)):
    """Live calculator — used by the QC inspection form preview."""
    tenant_id = get_current_tenant_id()
    return await _calc_rejection_cost(
        tenant_id,
        data.sku_id,
        data.stage_name,
        data.reason_id,
        data.reason_name,
        max(int(data.qty_rejected or 0), 0),
    )


# ──────────────────────────────────────────────
# Batch Summary / Stats
# ──────────────────────────────────────────────

@router.get("/stats")
async def get_production_stats(current_user: dict = Depends(get_current_user)):
    tenant_id = get_current_tenant_id()
    tdb = get_tenant_db()

    total_batches = await tdb.production_batches.count_documents({"tenant_id": tenant_id})
    active_batches = await tdb.production_batches.count_documents({"tenant_id": tenant_id, "status": {"$nin": ["completed"]}})
    completed_batches = await tdb.production_batches.count_documents({"tenant_id": tenant_id, "status": "completed"})
    qc_routes_count = await tdb.qc_routes.count_documents({"tenant_id": tenant_id, "is_active": True})

    # Aggregate total crates and rejections
    pipeline = [
        {"$match": {"tenant_id": tenant_id}},
        {"$group": {
            "_id": None,
            "total_crates": {"$sum": "$total_crates"},
            "total_rejected": {"$sum": "$total_rejected"},
            "total_passed_final": {"$sum": "$total_passed_final"},
        }}
    ]
    agg = await tdb.production_batches.aggregate(pipeline).to_list(1)
    totals = agg[0] if agg else {"total_crates": 0, "total_rejected": 0, "total_passed_final": 0}

    return {
        "total_batches": total_batches,
        "active_batches": active_batches,
        "completed_batches": completed_batches,
        "qc_routes_configured": qc_routes_count,
        "total_crates_produced": totals.get("total_crates", 0),
        "total_rejected": totals.get("total_rejected", 0),
        "total_passed_final": totals.get("total_passed_final", 0),
    }


# ──────────────────────────────────────────────
# QC Team Master Data
# ──────────────────────────────────────────────

class QCTeamMemberCreate(BaseModel):
    name: str
    role: Optional[str] = None

class QCTeamMemberUpdate(BaseModel):
    name: Optional[str] = None
    role: Optional[str] = None

@router.get("/qc-team")
async def list_qc_team(current_user: dict = Depends(get_current_user)):
    tenant_id = get_current_tenant_id()
    tdb = get_tenant_db()
    members = await tdb.qc_team.find({"tenant_id": tenant_id}, {"_id": 0}).sort("name", 1).to_list(500)
    return members

@router.post("/qc-team")
async def create_qc_team_member(data: QCTeamMemberCreate, current_user: dict = Depends(get_current_user)):
    tenant_id = get_current_tenant_id()
    tdb = get_tenant_db()
    existing = await tdb.qc_team.find_one({"name": data.name, "tenant_id": tenant_id})
    if existing:
        raise HTTPException(status_code=400, detail=f"QC team member '{data.name}' already exists")
    now = datetime.now(timezone.utc).isoformat()
    member = {
        "id": str(uuid.uuid4()),
        "tenant_id": tenant_id,
        "name": data.name,
        "role": data.role or "",
        "created_at": now,
        "updated_at": now,
    }
    await tdb.qc_team.insert_one(member)
    member.pop("_id", None)
    return member

@router.put("/qc-team/{member_id}")
async def update_qc_team_member(member_id: str, data: QCTeamMemberUpdate, current_user: dict = Depends(get_current_user)):
    tenant_id = get_current_tenant_id()
    tdb = get_tenant_db()
    existing = await tdb.qc_team.find_one({"id": member_id, "tenant_id": tenant_id})
    if not existing:
        raise HTTPException(status_code=404, detail="QC team member not found")
    updates = {"updated_at": datetime.now(timezone.utc).isoformat()}
    if data.name is not None:
        dup = await tdb.qc_team.find_one({"name": data.name, "tenant_id": tenant_id, "id": {"$ne": member_id}})
        if dup:
            raise HTTPException(status_code=400, detail=f"QC team member '{data.name}' already exists")
        updates["name"] = data.name
    if data.role is not None:
        updates["role"] = data.role
    await tdb.qc_team.update_one({"id": member_id}, {"$set": updates})
    updated = await tdb.qc_team.find_one({"id": member_id}, {"_id": 0})
    return updated

@router.delete("/qc-team/{member_id}")
async def delete_qc_team_member(member_id: str, current_user: dict = Depends(get_current_user)):
    tenant_id = get_current_tenant_id()
    tdb = get_tenant_db()
    result = await tdb.qc_team.delete_one({"id": member_id, "tenant_id": tenant_id})
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="QC team member not found")
    return {"message": "QC team member deleted"}


# ──────────────────────────────────────────────
# Rejection Reasons Master Data
# ──────────────────────────────────────────────

class RejectionReasonCreate(BaseModel):
    name: str
    description: Optional[str] = None

class RejectionReasonUpdate(BaseModel):
    name: Optional[str] = None
    description: Optional[str] = None

@router.get("/rejection-reasons")
async def list_rejection_reasons(current_user: dict = Depends(get_current_user)):
    tenant_id = get_current_tenant_id()
    tdb = get_tenant_db()
    reasons = await tdb.rejection_reasons.find({"tenant_id": tenant_id}, {"_id": 0}).sort("name", 1).to_list(500)
    return reasons

@router.post("/rejection-reasons")
async def create_rejection_reason(data: RejectionReasonCreate, current_user: dict = Depends(get_current_user)):
    tenant_id = get_current_tenant_id()
    tdb = get_tenant_db()
    existing = await tdb.rejection_reasons.find_one({"name": data.name, "tenant_id": tenant_id})
    if existing:
        raise HTTPException(status_code=400, detail=f"Rejection reason '{data.name}' already exists")
    now = datetime.now(timezone.utc).isoformat()
    reason = {
        "id": str(uuid.uuid4()),
        "tenant_id": tenant_id,
        "name": data.name,
        "description": data.description or "",
        "created_at": now,
        "updated_at": now,
    }
    await tdb.rejection_reasons.insert_one(reason)
    reason.pop("_id", None)
    return reason

@router.put("/rejection-reasons/{reason_id}")
async def update_rejection_reason(reason_id: str, data: RejectionReasonUpdate, current_user: dict = Depends(get_current_user)):
    tenant_id = get_current_tenant_id()
    tdb = get_tenant_db()
    existing = await tdb.rejection_reasons.find_one({"id": reason_id, "tenant_id": tenant_id})
    if not existing:
        raise HTTPException(status_code=404, detail="Rejection reason not found")
    updates = {"updated_at": datetime.now(timezone.utc).isoformat()}
    if data.name is not None:
        dup = await tdb.rejection_reasons.find_one({"name": data.name, "tenant_id": tenant_id, "id": {"$ne": reason_id}})
        if dup:
            raise HTTPException(status_code=400, detail=f"Rejection reason '{data.name}' already exists")
        updates["name"] = data.name
    if data.description is not None:
        updates["description"] = data.description
    await tdb.rejection_reasons.update_one({"id": reason_id}, {"$set": updates})
    updated = await tdb.rejection_reasons.find_one({"id": reason_id}, {"_id": 0})
    return updated

@router.delete("/rejection-reasons/{reason_id}")
async def delete_rejection_reason(reason_id: str, current_user: dict = Depends(get_current_user)):
    tenant_id = get_current_tenant_id()
    tdb = get_tenant_db()
    result = await tdb.rejection_reasons.delete_one({"id": reason_id, "tenant_id": tenant_id})
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Rejection reason not found")
    return {"message": "Rejection reason deleted"}


# ──────────────────────────────────────────────
# Rejection Report (cross-batch)
# ──────────────────────────────────────────────

@router.get("/rejection-report")
async def get_rejection_report(
    month: Optional[int] = None,
    year: Optional[int] = None,
    date_from: Optional[str] = None,
    date_to: Optional[str] = None,
    batch_id: Optional[str] = None,
    sku_id: Optional[str] = None,
    resource_id: Optional[str] = None,
    stage_type: Optional[str] = None,
    rejection_reason: Optional[str] = None,
    current_user: dict = Depends(get_current_user),
):
    """Get rejection report: per resource, per date, per stage with totals."""
    tenant_id = get_current_tenant_id()
    tdb = get_tenant_db()

    query = {"tenant_id": tenant_id, "qty_rejected": {"$gt": 0}}
    if batch_id:
        query["batch_id"] = batch_id
    if resource_id:
        query["inspected_by"] = resource_id
    if stage_type:
        query["stage_type"] = stage_type

    # Month/year filter takes precedence over date_from/date_to
    if month and year:
        m_start = f"{year}-{month:02d}-01"
        if month == 12:
            m_end = f"{year + 1}-01-01"
        else:
            m_end = f"{year}-{month + 1:02d}-01"
        query["inspected_at"] = {"$gte": m_start, "$lt": m_end}
    elif date_from or date_to:
        date_filter = {}
        if date_from:
            date_filter["$gte"] = date_from
        if date_to:
            date_filter["$lte"] = date_to + "T23:59:59"
        query["inspected_at"] = date_filter

    inspections = await tdb.inspections.find(query, {"_id": 0}).sort("inspected_at", -1).to_list(5000)

    # If sku_id filter, get matching batch IDs first
    sku_batch_ids = None
    if sku_id:
        sku_batches = await tdb.production_batches.find(
            {"sku_id": sku_id, "tenant_id": tenant_id}, {"_id": 0, "id": 1}
        ).to_list(5000)
        sku_batch_ids = {b["id"] for b in sku_batches}
        inspections = [i for i in inspections if i["batch_id"] in sku_batch_ids]

    # Enrich with batch info
    batch_ids = list(set(i["batch_id"] for i in inspections))
    batches_map = {}
    if batch_ids:
        batches = await tdb.production_batches.find(
            {"id": {"$in": batch_ids}, "tenant_id": tenant_id},
            {"_id": 0, "id": 1, "batch_code": 1, "sku_name": 1, "sku_id": 1}
        ).to_list(len(batch_ids))
        batches_map = {b["id"]: b for b in batches}

    rows = []
    total_rejected = 0
    for ins in inspections:
        b = batches_map.get(ins["batch_id"], {})
        # New nested format: entries[].rejections[]
        entries = ins.get("entries", [])
        if entries:
            for entry in entries:
                for rej in entry.get("rejections", []):
                    if rej.get("qty_rejected", 0) > 0:
                        rows.append({
                            "id": ins["id"] + "-" + entry.get("resource_id", "") + "-" + rej.get("reason", ""),
                            "inspection_id": ins["id"],
                            "batch_id": ins["batch_id"],
                            "batch_code": b.get("batch_code", ""),
                            "sku_id": b.get("sku_id", ""),
                            "sku_name": b.get("sku_name", ""),
                            "stage_name": ins.get("stage_name", ""),
                            "stage_type": ins.get("stage_type", ""),
                            "date": entry.get("date", ins.get("inspected_at", "")[:10]),
                            "resource_name": entry.get("resource_name", ""),
                            "resource_id": entry.get("resource_id", ""),
                            "qty_inspected": entry.get("qty_inspected", 0),
                            "qty_rejected": rej.get("qty_rejected", 0),
                            "rejection_reason": rej.get("reason", ""),
                            "remarks": ins.get("remarks", ""),
                        })
        else:
            # Legacy flat format: rejections[] or single rejection
            rejection_entries = ins.get("rejections", [])
            if rejection_entries:
                for rej in rejection_entries:
                    if rej.get("qty_rejected", 0) > 0:
                        rows.append({
                            "id": ins["id"] + "-" + rej.get("resource_id", ""),
                            "inspection_id": ins["id"],
                            "batch_id": ins["batch_id"],
                            "batch_code": b.get("batch_code", ""),
                            "sku_id": b.get("sku_id", ""),
                            "sku_name": b.get("sku_name", ""),
                            "stage_name": ins.get("stage_name", ""),
                            "stage_type": ins.get("stage_type", ""),
                            "date": rej.get("date", ins.get("inspected_at", "")[:10]),
                            "resource_name": rej.get("resource_name", ""),
                            "resource_id": rej.get("resource_id", ""),
                            "qty_inspected": rej.get("qty_inspected", ins.get("qty_inspected", 0)),
                            "qty_rejected": rej.get("qty_rejected", 0),
                            "rejection_reason": rej.get("reason", ""),
                            "remarks": ins.get("remarks", ""),
                        })
            elif ins.get("qty_rejected", 0) > 0:
                rows.append({
                    "id": ins["id"],
                    "inspection_id": ins["id"],
                    "batch_id": ins["batch_id"],
                    "batch_code": b.get("batch_code", ""),
                    "sku_id": b.get("sku_id", ""),
                    "sku_name": b.get("sku_name", ""),
                    "stage_name": ins.get("stage_name", ""),
                    "stage_type": ins.get("stage_type", ""),
                    "date": ins.get("inspected_at", "")[:10],
                    "resource_name": ins.get("inspected_by_name", ""),
                    "resource_id": ins.get("inspected_by", ""),
                    "qty_inspected": ins.get("qty_inspected", 0),
                    "qty_rejected": ins.get("qty_rejected", 0),
                    "rejection_reason": ins.get("rejection_reason", ""),
                    "remarks": ins.get("remarks", ""),
                })
        total_rejected += ins.get("qty_rejected", 0)

    # Filter by rejection_reason if specified
    if rejection_reason:
        rows = [r for r in rows if r.get("rejection_reason", "").lower() == rejection_reason.lower()]
        total_rejected = sum(r["qty_rejected"] for r in rows)

    # ── Enrich each row with cost_of_rejection ──
    # Bulk-load mappings (stage_name + reason_name → impacted keys)
    all_mappings = await tdb.rejection_cost_mappings.find(
        {"tenant_id": tenant_id}, {"_id": 0}
    ).to_list(2000)
    mapping_lookup = {(m.get("sku_id", ""), m.get("stage_name", ""), m.get("reason_name", "")): m for m in all_mappings}

    # Bulk-load SKU master values
    sku_ids = {r.get("sku_id") for r in rows if r.get("sku_id")}
    from database import db as _global_db
    sku_docs = []
    if sku_ids:
        sku_docs = await _global_db.master_skus.find(
            {"id": {"$in": list(sku_ids)}},
            {"_id": 0, "id": 1, "cogs_components_values": 1},
        ).to_list(len(sku_ids))
    sku_vals_map = {s["id"]: (s.get("cogs_components_values") or {}) for s in sku_docs}

    total_cost = 0.0
    for r in rows:
        m = mapping_lookup.get((r.get("sku_id", ""), r.get("stage_name", ""), r.get("rejection_reason", "")))
        if not m:
            r["cost_of_rejection"] = 0.0
            r["cost_breakdown"] = []
            r["missing_mapping"] = True
            continue
        sku_v = sku_vals_map.get(r.get("sku_id", ""), {})
        unit_cost = 0.0
        breakdown = []
        for k in m.get("impacted_component_keys", []):
            v = float(sku_v.get(k) or 0)
            unit_cost += v
            breakdown.append({"component_key": k, "unit_cost": round(v, 2)})
        r["cost_of_rejection"] = round(unit_cost * (r.get("qty_rejected") or 0), 2)
        r["cost_breakdown"] = breakdown
        r["missing_mapping"] = False
        total_cost += r["cost_of_rejection"]

    # Summary by resource
    by_resource = {}
    for r in rows:
        key = r["resource_name"]
        by_resource[key] = by_resource.get(key, 0) + r["qty_rejected"]

    # Summary by date
    by_date = {}
    for r in rows:
        key = r["date"]
        by_date[key] = by_date.get(key, 0) + r["qty_rejected"]

    return {
        "rows": rows,
        "total_rejected": total_rejected,
        "total_cost": round(total_cost, 2),
        "by_resource": [{"name": k, "bottles": v} for k, v in sorted(by_resource.items())],
        "by_date": [{"date": k, "bottles": v} for k, v in sorted(by_date.items())],
    }



# ──────────────────────────────────────────────
# Warehouse Transfer (Production → Factory Warehouse)
# ──────────────────────────────────────────────

@router.get("/factory-warehouses")
async def list_factory_warehouses(current_user: dict = Depends(get_current_user)):
    """Get all factory warehouse locations across all distributors."""
    tenant_id = get_current_tenant_id()
    locations = await db.distributor_locations.find(
        {"tenant_id": tenant_id, "is_factory": True, "status": "active"},
        {"_id": 0, "id": 1, "location_name": 1, "location_code": 1, "city": 1,
         "state": 1, "distributor_id": 1, "is_default": 1}
    ).sort("location_name", 1).to_list(100)

    # Enrich with distributor name
    dist_ids = list(set(loc.get("distributor_id") for loc in locations if loc.get("distributor_id")))
    dist_map = {}
    if dist_ids:
        dists = await db.distributors.find(
            {"id": {"$in": dist_ids}, "tenant_id": tenant_id},
            {"_id": 0, "id": 1, "distributor_name": 1}
        ).to_list(500)
        dist_map = {d["id"]: d["distributor_name"] for d in dists}

    for loc in locations:
        loc["distributor_name"] = dist_map.get(loc.get("distributor_id"), "")

    return {"warehouses": locations}


@router.get("/factory-warehouse-stock")
async def get_factory_warehouse_stock(
    warehouse_id: Optional[str] = None,
    current_user: dict = Depends(get_current_user)
):
    """Get stock levels in factory warehouses."""
    tenant_id = get_current_tenant_id()
    tdb = get_tenant_db()

    query = {"tenant_id": tenant_id}
    if warehouse_id:
        query["warehouse_location_id"] = warehouse_id

    stock_docs = await tdb.factory_warehouse_stock.find(query, {"_id": 0}).to_list(5000)
    return {"stock": stock_docs}


@router.post("/batches/{batch_id}/transfer-to-warehouse")
async def transfer_to_warehouse(
    batch_id: str,
    data: WarehouseTransfer,
    current_user: dict = Depends(get_current_user)
):
    """Transfer warehouse-ready crates from a batch to a factory warehouse."""
    tenant_id = get_current_tenant_id()
    tdb = get_tenant_db()

    batch = await tdb.production_batches.find_one({"id": batch_id, "tenant_id": tenant_id})
    if not batch:
        raise HTTPException(status_code=404, detail="Batch not found")

    if data.quantity <= 0:
        raise HTTPException(status_code=400, detail="Quantity must be > 0")

    available = (batch.get("total_passed_final", 0) or 0) - (batch.get("transferred_to_warehouse", 0) or 0)
    if data.quantity > available:
        raise HTTPException(status_code=400, detail=f"Only {available} bottles available for transfer (warehouse-ready minus already transferred)")

    # Validate factory warehouse exists and is_factory
    warehouse = await db.distributor_locations.find_one(
        {"id": data.warehouse_location_id, "tenant_id": tenant_id, "is_factory": True, "status": "active"},
        {"_id": 0, "id": 1, "location_name": 1, "city": 1, "distributor_id": 1}
    )
    if not warehouse:
        raise HTTPException(status_code=400, detail="Invalid factory warehouse location")

    now = datetime.now(timezone.utc).isoformat()

    # 1. Update batch: increment transferred_to_warehouse
    new_transferred = (batch.get("transferred_to_warehouse", 0) or 0) + data.quantity
    await tdb.production_batches.update_one(
        {"id": batch_id},
        {"$set": {"transferred_to_warehouse": new_transferred, "updated_at": now}}
    )

    # 2. Upsert factory_warehouse_stock (per warehouse + sku)
    sku_id = batch.get("sku_id")
    sku_name = batch.get("sku_name")
    existing_stock = await tdb.factory_warehouse_stock.find_one({
        "tenant_id": tenant_id,
        "warehouse_location_id": data.warehouse_location_id,
        "sku_id": sku_id
    })

    if existing_stock:
        new_qty = existing_stock.get("quantity", 0) + data.quantity
        await tdb.factory_warehouse_stock.update_one(
            {"id": existing_stock["id"]},
            {"$set": {"quantity": new_qty, "updated_at": now}}
        )
    else:
        stock_doc = {
            "id": str(uuid.uuid4()),
            "tenant_id": tenant_id,
            "warehouse_location_id": data.warehouse_location_id,
            "warehouse_name": warehouse.get("location_name"),
            "sku_id": sku_id,
            "sku_name": sku_name,
            "quantity": data.quantity,
            "created_at": now,
            "updated_at": now,
        }
        await tdb.factory_warehouse_stock.insert_one(stock_doc)

    # 3. Record transfer in history
    transfer_doc = {
        "id": str(uuid.uuid4()),
        "tenant_id": tenant_id,
        "batch_id": batch_id,
        "batch_code": batch.get("batch_code"),
        "sku_id": sku_id,
        "sku_name": sku_name,
        "warehouse_location_id": data.warehouse_location_id,
        "warehouse_name": warehouse.get("location_name"),
        "quantity": data.quantity,
        "notes": data.notes or "",
        "transferred_by": current_user.get("id"),
        "transferred_by_name": current_user.get("name"),
        "transferred_at": now,
    }
    await tdb.warehouse_transfers.insert_one(transfer_doc)

    updated_batch = await tdb.production_batches.find_one({"id": batch_id}, {"_id": 0})
    return {
        "batch": updated_batch,
        "transfer": {k: v for k, v in transfer_doc.items() if k != "_id"},
    }


@router.get("/batches/{batch_id}/warehouse-transfers")
async def get_batch_warehouse_transfers(
    batch_id: str,
    current_user: dict = Depends(get_current_user)
):
    """Get warehouse transfer history for a batch."""
    tenant_id = get_current_tenant_id()
    tdb = get_tenant_db()

    transfers = await tdb.warehouse_transfers.find(
        {"batch_id": batch_id, "tenant_id": tenant_id},
        {"_id": 0}
    ).sort("transferred_at", -1).to_list(500)

    return {"transfers": transfers, "total": len(transfers)}
