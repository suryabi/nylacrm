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
    production_line: Optional[str] = None
    notes: Optional[str] = None

class BatchUpdate(BaseModel):
    total_crates: Optional[int] = None
    bottles_per_crate: Optional[int] = None
    production_line: Optional[str] = None
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
        "production_line": data.production_line or "",
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
    for field in ["total_crates", "bottles_per_crate", "production_line", "notes", "status"]:
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

class RejectionEntry(BaseModel):
    resource_id: str
    resource_name: str
    date: str
    qty_inspected: int  # crates inspected by this resource
    qty_rejected: int  # bottles rejected
    reason: str

class InspectionRecord(BaseModel):
    stage_id: str
    rejections: List[RejectionEntry] = []  # grid of inspection/rejection records
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
    """Record QC inspection: each row has crates inspected and rejected bottles per resource.
    All inspected crates pass through; rejected bottles are tracked separately."""
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

    if not data.rejections:
        raise HTTPException(status_code=400, detail="At least one inspection entry is required")

    # Compute totals from row-level data
    total_crates_inspected = sum(r.qty_inspected for r in data.rejections)
    total_rej_bottles = sum(r.qty_rejected for r in data.rejections)

    if total_crates_inspected <= 0:
        raise HTTPException(status_code=400, detail="Total crates inspected must be > 0")
    if total_crates_inspected > pending:
        raise HTTPException(status_code=400, detail=f"Only {pending} crates pending at {stage['name']}")

    # Validate each entry
    for r in data.rejections:
        if r.qty_inspected <= 0:
            raise HTTPException(status_code=400, detail="Crates inspected must be > 0 for each row")
        if r.qty_rejected < 0:
            raise HTTPException(status_code=400, detail="Rejected count cannot be negative")
        max_bottles = r.qty_inspected * bottles_per_crate
        if r.qty_rejected > max_bottles:
            raise HTTPException(status_code=400, detail=f"Rejected ({r.qty_rejected}) exceeds max {max_bottles} bottles for {r.resource_name}")

    # All inspected crates pass through; rejected bottles tracked separately
    bal["pending"] = pending - total_crates_inspected
    bal["passed"] = bal.get("passed", 0) + total_crates_inspected
    bal["rejected"] = bal.get("rejected", 0) + total_rej_bottles
    balances[data.stage_id] = bal

    # Track total rejected bottles and final QC pass-through
    batch_total_rejected = batch.get("total_rejected", 0) + total_rej_bottles
    total_passed_final = batch.get("total_passed_final", 0)

    if stage.get("stage_type") == "final_qc":
        total_passed_final += total_crates_inspected

    # Check if batch is completed
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

    # Record inspection with row-level entries
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
        "rejections": [r.model_dump() for r in data.rejections],
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
    date_from: Optional[str] = None,
    date_to: Optional[str] = None,
    batch_id: Optional[str] = None,
    resource_id: Optional[str] = None,
    stage_type: Optional[str] = None,
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
    if date_from or date_to:
        date_filter = {}
        if date_from:
            date_filter["$gte"] = date_from
        if date_to:
            date_filter["$lte"] = date_to + "T23:59:59"
        query["inspected_at"] = date_filter

    inspections = await tdb.inspections.find(query, {"_id": 0}).sort("inspected_at", -1).to_list(5000)

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
        # New format: rejections array with per-resource entries
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
                        "qty_inspected": rej.get("qty_inspected", 0),
                        "qty_rejected": rej.get("qty_rejected", 0),
                        "rejection_reason": rej.get("reason", ""),
                        "remarks": ins.get("remarks", ""),
                    })
        elif ins.get("qty_rejected", 0) > 0:
            # Legacy format (single rejection)
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
