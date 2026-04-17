"""
Production QC Tracking Module
- QC Route Master (SKU-specific QC flows)
- Production Batches (CRUD)
- Rejection Cost Rules (per-stage cost config)
"""
import uuid
from datetime import datetime, timezone
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

class RejectionCostRuleCreate(BaseModel):
    stage_name: str
    stage_type: str
    cost_per_unit: float  # cost per bottle/crate rejected at this stage
    cost_components: Optional[List[str]] = []  # e.g. ["bottle", "cap", "water", "production"]
    description: Optional[str] = None

class RejectionCostRuleUpdate(BaseModel):
    cost_per_unit: Optional[float] = None
    cost_components: Optional[List[str]] = None
    description: Optional[str] = None


class WarehouseTransfer(BaseModel):
    warehouse_location_id: str
    quantity: int  # crates to transfer
    notes: Optional[str] = None


# ──────────────────────────────────────────────
# Production Dashboard
# ──────────────────────────────────────────────

@router.get("/dashboard")
async def production_dashboard(current_user: dict = Depends(get_current_user)):
    """Aggregate stock across all batches, grouped by SKU and stage."""
    tenant_id = get_current_tenant_id()
    tdb = get_tenant_db()

    batches = await tdb.production_batches.find(
        {"tenant_id": tenant_id},
        {"_id": 0, "sku_id": 1, "sku_name": 1, "total_crates": 1, "bottles_per_crate": 1,
         "total_bottles": 1, "unallocated_crates": 1, "stage_balances": 1,
         "total_passed_final": 1, "transferred_to_warehouse": 1, "total_rejected": 1, "status": 1, "qc_stages": 1, "ph_value": 1}
    ).to_list(5000)

    # Aggregate per SKU
    sku_map = {}
    total_crates_all = 0
    total_unallocated_all = 0
    total_ready_all = 0
    total_transferred_all = 0
    total_rejected_all = 0
    active_batches = 0

    for b in batches:
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
                "batch_count": 0,
                "stages": {},  # stage_name -> {pending, passed, rejected, received}
                "stage_order": [],  # ordered list of stage names
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

        # Build stage order from qc_stages (first batch sets the order)
        if not sku["stage_order"] and b.get("qc_stages"):
            sorted_stages = sorted(b["qc_stages"], key=lambda s: s.get("order", 0))
            sku["stage_order"] = [
                {"id": s["id"], "name": s["name"], "type": s.get("stage_type", "qc"), "order": s.get("order", 0)}
                for s in sorted_stages
            ]

        # Accumulate stage balances
        for stage_id, bal in (b.get("stage_balances") or {}).items():
            sname = bal.get("stage_name", stage_id)
            if sname not in sku["stages"]:
                sku["stages"][sname] = {"pending": 0, "passed": 0, "rejected": 0, "received": 0}
            for k in ("pending", "passed", "rejected", "received"):
                sku["stages"][sname][k] += bal.get(k, 0)

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
        },
        "skus": skus,
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

    # All inspected crates pass through; rejected bottles tracked separately
    bal["pending"] = pending - total_crates_inspected
    bal["passed"] = bal.get("passed", 0) + total_crates_inspected
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
# Rejection Cost Rules
# ──────────────────────────────────────────────

@router.get("/rejection-cost-rules")
async def list_rejection_cost_rules(current_user: dict = Depends(get_current_user)):
    tenant_id = get_current_tenant_id()
    tdb = get_tenant_db()
    rules = await tdb.rejection_cost_rules.find({"tenant_id": tenant_id}, {"_id": 0}).sort("stage_name", 1).to_list(100)
    return rules

@router.post("/rejection-cost-rules")
async def create_rejection_cost_rule(data: RejectionCostRuleCreate, current_user: dict = Depends(get_current_user)):
    tenant_id = get_current_tenant_id()
    tdb = get_tenant_db()

    now = datetime.now(timezone.utc).isoformat()
    rule = {
        "id": str(uuid.uuid4()),
        "tenant_id": tenant_id,
        "stage_name": data.stage_name,
        "stage_type": data.stage_type,
        "cost_per_unit": data.cost_per_unit,
        "cost_components": data.cost_components or [],
        "description": data.description or "",
        "created_at": now,
        "updated_at": now,
    }
    await tdb.rejection_cost_rules.insert_one(rule)
    rule.pop("_id", None)
    return rule

@router.put("/rejection-cost-rules/{rule_id}")
async def update_rejection_cost_rule(rule_id: str, data: RejectionCostRuleUpdate, current_user: dict = Depends(get_current_user)):
    tenant_id = get_current_tenant_id()
    tdb = get_tenant_db()

    existing = await tdb.rejection_cost_rules.find_one({"id": rule_id, "tenant_id": tenant_id})
    if not existing:
        raise HTTPException(status_code=404, detail="Rule not found")

    updates = {"updated_at": datetime.now(timezone.utc).isoformat()}
    if data.cost_per_unit is not None:
        updates["cost_per_unit"] = data.cost_per_unit
    if data.cost_components is not None:
        updates["cost_components"] = data.cost_components
    if data.description is not None:
        updates["description"] = data.description

    await tdb.rejection_cost_rules.update_one({"id": rule_id}, {"$set": updates})
    updated = await tdb.rejection_cost_rules.find_one({"id": rule_id}, {"_id": 0})
    return updated

@router.delete("/rejection-cost-rules/{rule_id}")
async def delete_rejection_cost_rule(rule_id: str, current_user: dict = Depends(get_current_user)):
    tenant_id = get_current_tenant_id()
    tdb = get_tenant_db()
    result = await tdb.rejection_cost_rules.delete_one({"id": rule_id, "tenant_id": tenant_id})
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Rule not found")
    return {"message": "Rule deleted"}


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
            {"_id": 0, "id": 1, "batch_code": 1, "sku_name": 1}
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
