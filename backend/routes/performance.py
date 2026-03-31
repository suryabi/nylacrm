"""
Monthly Performance Tracking Module
Captures sales outcomes, activity metrics, pipeline movement, collections position, and support needs.
Linked to Target Setup Module for target vs achievement tracking.
"""

from fastapi import APIRouter, HTTPException, Depends
from datetime import datetime, timezone
from deps import get_current_user
from core.tenant import get_current_tenant_id
from database import db
import uuid
import logging

logger = logging.getLogger(__name__)

router = APIRouter()


# ============ Helper: Auto-populate metrics ============

async def compute_metrics(tenant_id: str, resource_id: str, plan_id: str, month: int, year: int):
    """Compute all auto-populated metrics for a sales resource for a given month."""
    
    month_start = f"{year}-{month:02d}-01"
    if month == 12:
        month_end = f"{year + 1}-01-01"
    else:
        month_end = f"{year}-{month + 1:02d}-01"
    
    # === A. REVENUE METRICS ===
    # Get target from plan
    target_alloc = await db.target_allocations_v2.find_one(
        {"plan_id": plan_id, "resource_id": resource_id, "level": "resource"},
        {"_id": 0, "amount": 1, "city": 1, "resource_name": 1}
    )
    monthly_target = target_alloc.get("amount", 0) if target_alloc else 0
    resource_name = target_alloc.get("resource_name", "") if target_alloc else ""
    resource_city = target_alloc.get("city", "") if target_alloc else ""
    
    # Revenue from invoices for this month
    invoices = await db.invoices.find(
        {
            "tenant_id": tenant_id,
            "assigned_to": resource_id,
            "invoice_date": {"$gte": month_start, "$lt": month_end}
        },
        {"_id": 0, "net_invoice_value": 1, "gross_invoice_value": 1, "outstanding": 1, "account_uuid": 1, "account_id": 1, "invoice_date": 1}
    ).to_list(10000)
    
    revenue_achieved = sum(inv.get("net_invoice_value") or inv.get("gross_invoice_value") or 0 for inv in invoices)
    achievement_pct = round((revenue_achieved / monthly_target * 100), 1) if monthly_target > 0 else 0
    
    # === B. ACCOUNT METRICS ===
    # Won/Active accounts owned by this resource
    existing_accounts = await db.leads.find(
        {
            "tenant_id": tenant_id,
            "assigned_to": resource_id,
            "status": {"$in": ["won", "active_customer"]}
        },
        {"_id": 0, "id": 1, "company": 1, "name": 1, "status": 1, "city": 1, "onboarded_month": 1, "onboarded_year": 1}
    ).to_list(1000)
    
    # New accounts onboarded this month
    # Priority: 1) onboarded_month/year field, 2) won_date, 3) activity status_change
    new_accounts_by_onboarded = [
        a for a in existing_accounts
        if a.get("onboarded_month") == month and a.get("onboarded_year") == year
    ]
    
    # Also check leads with won_date in this month (that don't have onboarded_month set)
    onboarded_ids = set(a.get("id") for a in new_accounts_by_onboarded)
    new_accounts_by_won_date = await db.leads.find(
        {
            "tenant_id": tenant_id,
            "assigned_to": resource_id,
            "status": "won",
            "won_date": {"$gte": month_start, "$lt": month_end},
            "id": {"$nin": list(onboarded_ids)},
            "$or": [{"onboarded_month": None}, {"onboarded_month": {"$exists": False}}]
        },
        {"_id": 0, "id": 1, "company": 1, "name": 1, "city": 1, "won_date": 1}
    ).to_list(100)
    
    new_accounts = new_accounts_by_onboarded + new_accounts_by_won_date
    
    # If still no results, check activities for status_change to won in this month
    if not new_accounts:
        won_activities = await db.activities.find(
            {
                "tenant_id": tenant_id,
                "activity_type": "status_change",
                "description": {"$regex": "won", "$options": "i"},
                "created_at": {"$gte": month_start, "$lt": month_end}
            },
            {"_id": 0, "lead_id": 1}
        ).to_list(1000)
        won_lead_ids = [a["lead_id"] for a in won_activities]
        if won_lead_ids:
            new_accounts = await db.leads.find(
                {
                    "tenant_id": tenant_id,
                    "id": {"$in": won_lead_ids},
                    "assigned_to": resource_id,
                    "$or": [{"onboarded_month": None}, {"onboarded_month": {"$exists": False}}]
                },
                {"_id": 0, "id": 1, "company": 1, "name": 1, "city": 1}
            ).to_list(100)
    
    # Revenue from new vs existing
    new_account_ids = set(a.get("id") for a in new_accounts)
    
    revenue_new = sum(
        inv.get("net_invoice_value") or inv.get("gross_invoice_value") or 0
        for inv in invoices if inv.get("account_uuid") in new_account_ids
    )
    revenue_existing = revenue_achieved - revenue_new
    
    # === C. PIPELINE METRICS ===
    pipeline_statuses = ["qualified", "proposal_shared_with_customer", "proposal_internal_review", "contacted"]
    pipeline_leads = await db.leads.find(
        {
            "tenant_id": tenant_id,
            "assigned_to": resource_id,
            "status": {"$in": pipeline_statuses}
        },
        {"_id": 0, "id": 1, "company": 1, "name": 1, "city": 1, "status": 1, "expected_value": 1, "expected_close_date": 1}
    ).to_list(1000)
    
    pipeline_value = sum(lead.get("expected_value", 0) or 0 for lead in pipeline_leads)
    
    # Next month pipeline
    next_month = month + 1 if month < 12 else 1
    next_year = year if month < 12 else year + 1
    next_month_start = f"{next_year}-{next_month:02d}-01"
    if next_month == 12:
        next_month_end_str = f"{next_year + 1}-01-01"
    else:
        next_month_end_str = f"{next_year}-{next_month + 1:02d}-01"
    
    next_month_pipeline = [
        lead for lead in pipeline_leads
        if lead.get("expected_close_date", "") >= next_month_start and lead.get("expected_close_date", "") < next_month_end_str
    ]
    next_month_pipeline_value = sum(lead.get("expected_value", 0) or 0 for lead in next_month_pipeline)
    
    # === D. OUTSTANDING METRICS ===
    # Outstanding from existing accounts (won/active_customer)
    outstanding_invoices = await db.invoices.find(
        {
            "tenant_id": tenant_id,
            "assigned_to": resource_id,
            "outstanding": {"$gt": 0}
        },
        {"_id": 0, "account_uuid": 1, "account_id": 1, "outstanding": 1, "invoice_date": 1, "invoice_no": 1}
    ).to_list(10000)
    
    total_outstanding = sum(inv.get("outstanding", 0) for inv in outstanding_invoices)
    
    # Aging buckets
    now_str = datetime.now(timezone.utc).strftime('%Y-%m-%d')
    aging = {"0_30": 0, "31_60": 0, "61_90": 0, "90_plus": 0}
    account_outstanding = {}
    
    for inv in outstanding_invoices:
        inv_date = inv.get("invoice_date", "")
        acc_id = inv.get("account_id") or inv.get("account_uuid", "")
        outstanding_amt = inv.get("outstanding", 0)
        
        if acc_id not in account_outstanding:
            account_outstanding[acc_id] = {"account_id": acc_id, "outstanding": 0, "invoices": 0}
        account_outstanding[acc_id]["outstanding"] += outstanding_amt
        account_outstanding[acc_id]["invoices"] += 1
        
        try:
            days_old = (datetime.strptime(now_str, '%Y-%m-%d') - datetime.strptime(inv_date, '%Y-%m-%d')).days
            if days_old <= 30:
                aging["0_30"] += outstanding_amt
            elif days_old <= 60:
                aging["31_60"] += outstanding_amt
            elif days_old <= 90:
                aging["61_90"] += outstanding_amt
            else:
                aging["90_plus"] += outstanding_amt
        except Exception:
            aging["0_30"] += outstanding_amt
    
    # === E. ACTIVITY METRICS ===
    # Visits
    visits = await db.activities.count_documents({
        "tenant_id": tenant_id,
        "created_by": resource_id,
        "activity_type": {"$in": ["visit", "customer_visit"]},
        "created_at": {"$gte": month_start, "$lt": month_end}
    })
    
    # Calls
    calls = await db.activities.count_documents({
        "tenant_id": tenant_id,
        "created_by": resource_id,
        "activity_type": "call",
        "created_at": {"$gte": month_start, "$lt": month_end}
    })
    
    # Follow-ups
    follow_ups = await db.activities.count_documents({
        "tenant_id": tenant_id,
        "created_by": resource_id,
        "activity_type": {"$in": ["follow_up", "meeting"]},
        "created_at": {"$gte": month_start, "$lt": month_end}
    })
    
    # === F. CALCULATED METRICS ===
    pipeline_coverage = round((next_month_pipeline_value / monthly_target * 100), 1) if monthly_target > 0 else 0
    outstanding_ratio = round((total_outstanding / revenue_achieved * 100), 1) if revenue_achieved > 0 else 0
    visit_productivity = round(revenue_achieved / visits, 0) if visits > 0 else 0
    call_productivity = round(revenue_achieved / calls, 0) if calls > 0 else 0
    account_conversion_rate = round((len(new_accounts) / len(pipeline_leads) * 100), 1) if len(pipeline_leads) > 0 else 0
    
    return {
        "resource_id": resource_id,
        "resource_name": resource_name,
        "resource_city": resource_city,
        "month": month,
        "year": year,
        "plan_id": plan_id,
        "monthly_target": monthly_target,
        "revenue": {
            "achieved": round(revenue_achieved, 2),
            "target": monthly_target,
            "achievement_pct": achievement_pct,
            "from_new_accounts": round(revenue_new, 2),
            "from_existing_accounts": round(revenue_existing, 2),
        },
        "accounts": {
            "existing_count": len(existing_accounts),
            "existing_accounts": [{"id": a["id"], "name": a.get("company") or a.get("name", "Unknown"), "city": a.get("city", ""), "status": a.get("status", "")} for a in existing_accounts],
            "new_onboarded": len(new_accounts),
            "new_accounts": [{"id": a["id"], "name": a.get("company") or a.get("name", "Unknown"), "city": a.get("city", "")} for a in new_accounts],
        },
        "pipeline": {
            "current_value": round(pipeline_value, 2),
            "current_count": len(pipeline_leads),
            "current_accounts": [{"id": lead["id"], "name": lead.get("company") or lead.get("name", "Unknown"), "status": lead.get("status", ""), "value": lead.get("expected_value", 0)} for lead in pipeline_leads],
            "next_month_value": round(next_month_pipeline_value, 2),
            "next_month_count": len(next_month_pipeline),
            "next_month_accounts": [{"id": lead["id"], "name": lead.get("company") or lead.get("name", "Unknown"), "value": lead.get("expected_value", 0)} for lead in next_month_pipeline],
            "coverage_ratio": pipeline_coverage,
        },
        "collections": {
            "total_outstanding": round(total_outstanding, 2),
            "aging": {k: round(v, 2) for k, v in aging.items()},
            "account_details": sorted(list(account_outstanding.values()), key=lambda x: x["outstanding"], reverse=True),
            "outstanding_ratio": outstanding_ratio,
        },
        "activities": {
            "visits": visits,
            "calls": calls,
            "follow_ups": follow_ups,
            "visit_productivity": visit_productivity,
            "call_productivity": call_productivity,
        },
        "calculated": {
            "achievement_pct": achievement_pct,
            "pipeline_coverage": pipeline_coverage,
            "outstanding_ratio": outstanding_ratio,
            "visit_productivity": visit_productivity,
            "call_productivity": call_productivity,
            "account_conversion_rate": account_conversion_rate,
        },
    }


# ============ ROUTES ============

@router.get("/target-plans")
async def get_target_plans(current_user: dict = Depends(get_current_user)):
    """Get all target plans for selection."""
    tenant_id = get_current_tenant_id()
    plans = await db.target_plans_v2.find(
        {"$or": [{"tenant_id": tenant_id}, {"tenant_id": {"$exists": False}}]},
        {"_id": 0}
    ).sort("created_at", -1).to_list(100)
    return plans


@router.get("/resources-for-plan/{plan_id}")
async def get_resources_for_plan(plan_id: str, current_user: dict = Depends(get_current_user)):
    """Get all resources allocated under a target plan."""
    allocations = await db.target_allocations_v2.find(
        {"plan_id": plan_id, "level": "resource"},
        {"_id": 0}
    ).to_list(500)
    return allocations


@router.get("/generate")
async def generate_performance(
    plan_id: str,
    resource_id: str,
    month: int,
    year: int,
    current_user: dict = Depends(get_current_user)
):
    """Generate/compute monthly performance metrics for a resource."""
    tenant_id = get_current_tenant_id()
    
    # Validate plan exists
    plan = await db.target_plans_v2.find_one(
        {"id": plan_id}, {"_id": 0, "name": 1}
    )
    if not plan:
        raise HTTPException(status_code=404, detail="Target plan not found")
    
    metrics = await compute_metrics(tenant_id, resource_id, plan_id, month, year)
    
    # Check for existing saved record
    existing = await db.monthly_performance.find_one(
        {
            "tenant_id": tenant_id,
            "resource_id": resource_id,
            "plan_id": plan_id,
            "month": month,
            "year": year
        },
        {"_id": 0}
    )
    
    if existing:
        metrics["saved_record"] = existing
        metrics["record_id"] = existing.get("id")
        metrics["status"] = existing.get("status", "draft")
        metrics["support_needed"] = existing.get("support_needed", [])
        metrics["remarks"] = existing.get("remarks", "")
        metrics["next_month_pipeline_manual"] = existing.get("next_month_pipeline_manual", [])
        metrics["manual_revenue"] = existing.get("manual_revenue")
        metrics["manual_visits"] = existing.get("manual_visits")
        metrics["manual_calls"] = existing.get("manual_calls")
    else:
        metrics["saved_record"] = None
        metrics["record_id"] = None
        metrics["status"] = "not_created"
    
    metrics["plan_name"] = plan.get("name", "")
    return metrics


@router.post("/save")
async def save_performance(
    data: dict,
    current_user: dict = Depends(get_current_user)
):
    """Save/update monthly performance record with user-entered fields."""
    tenant_id = get_current_tenant_id()
    now = datetime.now(timezone.utc).isoformat()
    
    plan_id = data.get("plan_id")
    resource_id = data.get("resource_id")
    month = data.get("month")
    year = data.get("year")
    
    if not all([plan_id, resource_id, month, year]):
        raise HTTPException(status_code=400, detail="plan_id, resource_id, month, year are required")
    
    existing = await db.monthly_performance.find_one(
        {"tenant_id": tenant_id, "resource_id": resource_id, "plan_id": plan_id, "month": month, "year": year}
    )
    
    record = {
        "tenant_id": tenant_id,
        "plan_id": plan_id,
        "resource_id": resource_id,
        "resource_name": data.get("resource_name", ""),
        "month": month,
        "year": year,
        "status": data.get("status", "draft"),
        # User-entered fields
        "support_needed": data.get("support_needed", []),
        "remarks": data.get("remarks", ""),
        "next_month_pipeline_manual": data.get("next_month_pipeline_manual", []),
        "manual_revenue": data.get("manual_revenue"),
        "manual_visits": data.get("manual_visits"),
        "manual_calls": data.get("manual_calls"),
        # Snapshot of auto-computed metrics at save time
        "snapshot": {
            "revenue_achieved": data.get("revenue_achieved", 0),
            "monthly_target": data.get("monthly_target", 0),
            "achievement_pct": data.get("achievement_pct", 0),
            "existing_accounts": data.get("existing_accounts", 0),
            "new_accounts": data.get("new_accounts", 0),
            "pipeline_value": data.get("pipeline_value", 0),
            "total_outstanding": data.get("total_outstanding", 0),
            "visits": data.get("visits", 0),
            "calls": data.get("calls", 0),
        },
        "updated_at": now,
        "updated_by": current_user.get("id"),
        "updated_by_name": current_user.get("name", ""),
    }
    
    if existing:
        if existing.get("status") == "approved":
            raise HTTPException(status_code=400, detail="Cannot edit an approved record")
        await db.monthly_performance.update_one(
            {"_id": existing["_id"]},
            {"$set": record}
        )
        record_id = existing.get("id")
    else:
        record["id"] = str(uuid.uuid4())
        record["created_at"] = now
        record["created_by"] = current_user.get("id")
        record["created_by_name"] = current_user.get("name", "")
        await db.monthly_performance.insert_one(record)
        record_id = record["id"]
    
    return {"message": "Performance record saved", "id": record_id, "status": record["status"]}


@router.post("/{record_id}/submit")
async def submit_performance(record_id: str, current_user: dict = Depends(get_current_user)):
    """Submit monthly performance for manager review."""
    tenant_id = get_current_tenant_id()
    result = await db.monthly_performance.update_one(
        {"id": record_id, "tenant_id": tenant_id, "status": {"$in": ["draft", "returned"]}},
        {"$set": {"status": "submitted", "submitted_at": datetime.now(timezone.utc).isoformat(), "submitted_by": current_user.get("id")}}
    )
    if result.modified_count == 0:
        raise HTTPException(status_code=400, detail="Record not found or already submitted/approved")
    return {"message": "Performance record submitted for review"}


@router.post("/{record_id}/approve")
async def approve_performance(record_id: str, data: dict = {}, current_user: dict = Depends(get_current_user)):
    """Approve a submitted performance record."""
    tenant_id = get_current_tenant_id()
    result = await db.monthly_performance.update_one(
        {"id": record_id, "tenant_id": tenant_id, "status": "submitted"},
        {"$set": {
            "status": "approved",
            "approved_at": datetime.now(timezone.utc).isoformat(),
            "approved_by": current_user.get("id"),
            "approved_by_name": current_user.get("name", ""),
            "manager_comments": data.get("comments", ""),
        }}
    )
    if result.modified_count == 0:
        raise HTTPException(status_code=400, detail="Record not found or not in submitted status")
    return {"message": "Performance record approved"}


@router.post("/{record_id}/return")
async def return_performance(record_id: str, data: dict = {}, current_user: dict = Depends(get_current_user)):
    """Return a submitted record for corrections."""
    tenant_id = get_current_tenant_id()
    result = await db.monthly_performance.update_one(
        {"id": record_id, "tenant_id": tenant_id, "status": "submitted"},
        {"$set": {
            "status": "returned",
            "returned_at": datetime.now(timezone.utc).isoformat(),
            "returned_by_name": current_user.get("name", ""),
            "return_comments": data.get("comments", ""),
        }}
    )
    if result.modified_count == 0:
        raise HTTPException(status_code=400, detail="Record not found or not in submitted status")
    return {"message": "Performance record returned for corrections"}


@router.get("/comparison")
async def get_comparison(
    resource_id: str,
    plan_id: str,
    months: int = 3,
    current_user: dict = Depends(get_current_user)
):
    """Get month-on-month comparison data for a resource."""
    tenant_id = get_current_tenant_id()
    
    now = datetime.now(timezone.utc)
    comparison_data = []
    
    for i in range(months):
        m = now.month - i
        y = now.year
        while m <= 0:
            m += 12
            y -= 1
        
        metrics = await compute_metrics(tenant_id, resource_id, plan_id, m, y)
        
        saved = await db.monthly_performance.find_one(
            {"tenant_id": tenant_id, "resource_id": resource_id, "plan_id": plan_id, "month": m, "year": y},
            {"_id": 0, "status": 1, "support_needed": 1, "remarks": 1}
        )
        
        comparison_data.append({
            "month": m,
            "year": y,
            "label": f"{['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'][m-1]} {y}",
            "revenue_achieved": metrics["revenue"]["achieved"],
            "monthly_target": metrics["revenue"]["target"],
            "achievement_pct": metrics["revenue"]["achievement_pct"],
            "new_accounts": metrics["accounts"]["new_onboarded"],
            "existing_accounts": metrics["accounts"]["existing_count"],
            "pipeline_value": metrics["pipeline"]["current_value"],
            "pipeline_count": metrics["pipeline"]["current_count"],
            "total_outstanding": metrics["collections"]["total_outstanding"],
            "visits": metrics["activities"]["visits"],
            "calls": metrics["activities"]["calls"],
            "status": saved.get("status") if saved else "not_created",
            "support_count": len(saved.get("support_needed", [])) if saved else 0,
        })
    
    comparison_data.reverse()
    return {"resource_id": resource_id, "months": comparison_data}
