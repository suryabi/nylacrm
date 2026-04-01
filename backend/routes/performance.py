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

async def compute_metrics(tenant_id: str, resource_ids: list, plan_id: str, month: int, year: int):
    """Compute all auto-populated metrics for one or more sales resources for a given month."""
    
    month_start = f"{year}-{month:02d}-01"
    if month == 12:
        month_end = f"{year + 1}-01-01"
    else:
        month_end = f"{year}-{month + 1:02d}-01"
    
    resource_filter = {"$in": resource_ids} if len(resource_ids) > 1 else resource_ids[0]
    
    # === A. REVENUE METRICS (from accounts/invoices) ===
    # Get target from plan — sum across all selected resources
    target_allocs = await db.target_allocations_v2.find(
        {"plan_id": plan_id, "resource_id": resource_filter, "level": "resource"},
        {"_id": 0, "amount": 1, "city": 1, "resource_name": 1}
    ).to_list(100)
    monthly_target = sum(t.get("amount", 0) for t in target_allocs)
    resource_names = [t.get("resource_name", "") for t in target_allocs]
    resource_name = ", ".join(resource_names) if resource_names else ""
    resource_city = ", ".join(sorted(set(t.get("city", "") for t in target_allocs if t.get("city")))) if target_allocs else ""
    
    # All invoices this month for these resources
    invoices_this_month = await db.invoices.find(
        {
            "tenant_id": tenant_id,
            "assigned_to": resource_filter,
            "invoice_date": {"$gte": month_start, "$lt": month_end}
        },
        {"_id": 0, "net_invoice_value": 1, "gross_invoice_value": 1, "outstanding": 1, "account_uuid": 1, "account_id": 1, "invoice_date": 1}
    ).to_list(10000)
    
    # All invoices ever (lifetime) for these resources
    all_invoices = await db.invoices.find(
        {
            "tenant_id": tenant_id,
            "assigned_to": resource_filter,
        },
        {"_id": 0, "net_invoice_value": 1, "gross_invoice_value": 1, "account_uuid": 1}
    ).to_list(50000)
    
    revenue_this_month = sum(inv.get("net_invoice_value") or inv.get("gross_invoice_value") or 0 for inv in invoices_this_month)
    revenue_lifetime = sum(inv.get("net_invoice_value") or inv.get("gross_invoice_value") or 0 for inv in all_invoices)
    achievement_pct = round((revenue_this_month / monthly_target * 100), 1) if monthly_target > 0 else 0
    
    # === B. ACCOUNT METRICS (from accounts collection, NOT leads) ===
    # All accounts for these resources (lifetime)
    all_accounts = await db.accounts.find(
        {
            "tenant_id": tenant_id,
            "assigned_to": resource_filter,
        },
        {"_id": 0, "id": 1, "account_name": 1, "city": 1, "account_type": 1, "onboarded_month": 1, "onboarded_year": 1, "created_at": 1}
    ).to_list(1000)
    
    existing_accounts_count = len(all_accounts)
    
    # Compute average monthly sales per account from invoices
    account_avg_sales = {}
    for inv in all_invoices:
        acc_id = inv.get("account_uuid") or inv.get("account_id")
        if acc_id:
            account_avg_sales.setdefault(acc_id, []).append(inv.get("net_invoice_value") or inv.get("gross_invoice_value") or 0)
    # Average across all invoices for each account
    for acc_id, values in account_avg_sales.items():
        account_avg_sales[acc_id] = round(sum(values) / len(values), 2) if values else 0
    
    # Get estimated opportunity value from leads for each account
    account_leads = await db.leads.find(
        {"tenant_id": tenant_id, "assigned_to": resource_filter, "status": "active_customer"},
        {"_id": 0, "id": 1, "account_id": 1, "estimated_value": 1, "opportunity_estimation": 1}
    ).to_list(1000)
    account_estimated = {}
    for lead in account_leads:
        acc_id = lead.get("account_id")
        if acc_id:
            opp = lead.get("opportunity_estimation", {})
            est_val = (opp.get("estimated_monthly_revenue") if opp else None) or lead.get("estimated_value") or 0
            if est_val:
                account_estimated[acc_id] = round(est_val, 2)
    
    # Get manual account value overrides
    account_overrides = {}
    override_docs = await db.account_value_overrides.find(
        {"tenant_id": tenant_id, "plan_id": plan_id},
        {"_id": 0, "account_id": 1, "manual_value": 1}
    ).to_list(1000)
    for ov in override_docs:
        account_overrides[ov["account_id"]] = ov["manual_value"]
    
    existing_accounts_list = [
        {
            "id": a["id"],
            "name": a.get("account_name", "Unknown"),
            "city": a.get("city", ""),
            "status": a.get("account_type", ""),
            "avg_sales": account_avg_sales.get(a["id"], 0),
            "estimated_value": account_estimated.get(a["id"], 0),
            "manual_value": account_overrides.get(a["id"]),
            "display_value": account_overrides.get(a["id"]) or account_avg_sales.get(a["id"], 0) or account_estimated.get(a["id"], 0),
        }
        for a in all_accounts
    ]
    
    # New accounts onboarded this month (by onboarded_month/year at account level)
    new_accounts = [
        a for a in all_accounts
        if a.get("onboarded_month") == month and a.get("onboarded_year") == year
    ]
    new_accounts_list = [
        {
            "id": a["id"],
            "name": a.get("account_name", "Unknown"),
            "city": a.get("city", ""),
            "avg_sales": account_avg_sales.get(a["id"], 0),
            "estimated_value": account_estimated.get(a["id"], 0),
            "manual_value": account_overrides.get(a["id"]),
            "display_value": account_overrides.get(a["id"]) or account_avg_sales.get(a["id"], 0) or account_estimated.get(a["id"], 0),
        }
        for a in new_accounts
    ]
    new_account_ids = set(a.get("id") for a in new_accounts)
    
    # Revenue from accounts onboarded this month
    revenue_new_accounts = sum(
        inv.get("net_invoice_value") or inv.get("gross_invoice_value") or 0
        for inv in invoices_this_month if inv.get("account_uuid") in new_account_ids
    )
    
    # === C. PIPELINE METRICS (from leads, excluding won/active_customer/not_qualified/lost) ===
    excluded_statuses = ["won", "active_customer", "not_qualified", "lost"]
    pipeline_leads = await db.leads.find(
        {
            "tenant_id": tenant_id,
            "assigned_to": resource_filter,
            "status": {"$nin": excluded_statuses}
        },
        {"_id": 0, "id": 1, "company": 1, "name": 1, "city": 1, "status": 1, "expected_value": 1, "estimated_value": 1, "opportunity_estimation": 1, "target_closure_month": 1, "target_closure_year": 1}
    ).to_list(5000)
    
    def get_pipeline_value(lead):
        """Get estimated revenue in INR from opportunity_estimation, fallback to expected_value."""
        opp = lead.get("opportunity_estimation")
        if opp and opp.get("estimated_monthly_revenue"):
            return opp["estimated_monthly_revenue"]
        return lead.get("expected_value") or 0
    
    # Group by status
    status_groups = {}
    for lead in pipeline_leads:
        status = lead.get("status", "unknown")
        if status not in status_groups:
            status_groups[status] = {"status": status, "count": 0, "value": 0}
        status_groups[status]["count"] += 1
        status_groups[status]["value"] += get_pipeline_value(lead)
    
    pipeline_by_status = sorted(status_groups.values(), key=lambda x: x["value"], reverse=True)
    pipeline_total_value = sum(s["value"] for s in pipeline_by_status)
    pipeline_total_count = sum(s["count"] for s in pipeline_by_status)
    
    # Leads targeting next month (based on target_closure_month/year)
    next_month = month + 1 if month < 12 else 1
    next_year = year if month < 12 else year + 1
    
    next_month_leads = [
        lead for lead in pipeline_leads
        if lead.get("target_closure_month") == next_month and lead.get("target_closure_year") == next_year
    ]
    next_month_pipeline_value = sum(get_pipeline_value(lead) for lead in next_month_leads)
    
    # === D. OUTSTANDING METRICS ===
    outstanding_invoices = await db.invoices.find(
        {
            "tenant_id": tenant_id,
            "assigned_to": resource_filter,
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
    activity_filter = {
        "tenant_id": tenant_id,
        "created_by": resource_filter,
        "created_at": {"$gte": month_start, "$lt": month_end}
    }
    
    # Total counts per activity type
    messages_count = await db.activities.count_documents({**activity_filter, "activity_type": "messaging"})
    calls_count = await db.activities.count_documents({**activity_filter, "activity_type": "call"})
    visits_count = await db.activities.count_documents({**activity_filter, "activity_type": {"$in": ["visit", "meeting", "customer_visit"]}})
    emails_count = await db.activities.count_documents({**activity_filter, "activity_type": "email"})
    
    # Unique customer counts (distinct lead_ids per activity type)
    unique_messages = len(await db.activities.distinct("lead_id", {**activity_filter, "activity_type": "messaging"}))
    unique_calls = len(await db.activities.distinct("lead_id", {**activity_filter, "activity_type": "call"}))
    unique_visits = len(await db.activities.distinct("lead_id", {**activity_filter, "activity_type": {"$in": ["visit", "meeting", "customer_visit"]}}))
    unique_emails = len(await db.activities.distinct("lead_id", {**activity_filter, "activity_type": "email"}))
    
    total_activities = messages_count + calls_count + visits_count + emails_count
    
    # === F. CALCULATED METRICS ===
    pipeline_coverage = round((next_month_pipeline_value / monthly_target * 100), 1) if monthly_target > 0 else 0
    outstanding_ratio = round((total_outstanding / revenue_this_month * 100), 1) if revenue_this_month > 0 else 0
    visit_productivity = round(revenue_this_month / visits_count, 0) if visits_count > 0 else 0
    call_productivity = round(revenue_this_month / calls_count, 0) if calls_count > 0 else 0
    account_conversion_rate = round((len(new_accounts) / pipeline_total_count * 100), 1) if pipeline_total_count > 0 else 0
    
    return {
        "resource_id": ",".join(resource_ids),
        "resource_name": resource_name,
        "resource_city": resource_city,
        "month": month,
        "year": year,
        "plan_id": plan_id,
        "monthly_target": monthly_target,
        "revenue": {
            "target": monthly_target,
            "lifetime": round(revenue_lifetime, 2),
            "this_month": round(revenue_this_month, 2),
            "from_new_accounts": round(revenue_new_accounts, 2),
            "achievement_pct": achievement_pct,
        },
        "accounts": {
            "existing_count": existing_accounts_count,
            "existing_accounts": existing_accounts_list,
            "new_onboarded": len(new_accounts),
            "new_accounts": new_accounts_list,
        },
        "pipeline": {
            "by_status": pipeline_by_status,
            "total_value": round(pipeline_total_value, 2),
            "total_count": pipeline_total_count,
            "next_month": next_month,
            "next_year": next_year,
            "next_month_leads_count": len(next_month_leads),
            "next_month_pipeline_value": round(next_month_pipeline_value, 2),
            "coverage_ratio": pipeline_coverage,
        },
        "collections": {
            "total_outstanding": round(total_outstanding, 2),
            "aging": {k: round(v, 2) for k, v in aging.items()},
            "account_details": sorted(list(account_outstanding.values()), key=lambda x: x["outstanding"], reverse=True),
            "outstanding_ratio": outstanding_ratio,
        },
        "activities": {
            "messages": messages_count,
            "calls": calls_count,
            "visits": visits_count,
            "emails": emails_count,
            "total": total_activities,
            "unique_messages": unique_messages,
            "unique_calls": unique_calls,
            "unique_visits": unique_visits,
            "unique_emails": unique_emails,
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


@router.get("/territories-for-plan/{plan_id}")
async def get_territories_for_plan(plan_id: str, current_user: dict = Depends(get_current_user)):
    """Get all territories allocated under a target plan."""
    allocations = await db.target_allocations_v2.find(
        {"plan_id": plan_id, "level": "territory"},
        {"_id": 0, "id": 1, "territory_id": 1, "territory_name": 1, "amount": 1}
    ).to_list(100)
    return allocations


@router.get("/cities-for-plan/{plan_id}")
async def get_cities_for_plan(plan_id: str, current_user: dict = Depends(get_current_user)):
    """Get all cities allocated under a target plan."""
    allocations = await db.target_allocations_v2.find(
        {"plan_id": plan_id, "level": "city"},
        {"_id": 0, "id": 1, "territory_id": 1, "territory_name": 1, "city": 1, "state": 1, "amount": 1}
    ).to_list(100)
    return allocations


@router.get("/resources-by-territory/{plan_id}/{territory_id}")
async def get_resources_by_territory(plan_id: str, territory_id: str, current_user: dict = Depends(get_current_user)):
    """Get all resource IDs under a territory for a plan."""
    resources = await db.target_allocations_v2.find(
        {"plan_id": plan_id, "territory_id": territory_id, "level": "resource"},
        {"_id": 0, "resource_id": 1}
    ).to_list(100)
    return [r["resource_id"] for r in resources if r.get("resource_id")]


@router.get("/resources-by-city/{plan_id}/{city}")
async def get_resources_by_city(plan_id: str, city: str, current_user: dict = Depends(get_current_user)):
    """Get all resource IDs under a city for a plan."""
    resources = await db.target_allocations_v2.find(
        {"plan_id": plan_id, "city": city, "level": "resource"},
        {"_id": 0, "resource_id": 1}
    ).to_list(100)
    return [r["resource_id"] for r in resources if r.get("resource_id")]


@router.get("/generate")
async def generate_performance(
    plan_id: str,
    resource_id: str,
    month: int,
    year: int,
    current_user: dict = Depends(get_current_user)
):
    """Generate/compute monthly performance metrics for one or more resources."""
    tenant_id = get_current_tenant_id()
    
    # Parse comma-separated resource_ids
    resource_ids = [r.strip() for r in resource_id.split(",") if r.strip()]
    if not resource_ids:
        raise HTTPException(status_code=400, detail="No resource IDs provided")
    
    # Validate plan exists
    plan = await db.target_plans_v2.find_one(
        {"id": plan_id}, {"_id": 0, "name": 1}
    )
    if not plan:
        raise HTTPException(status_code=404, detail="Target plan not found")
    
    metrics = await compute_metrics(tenant_id, resource_ids, plan_id, month, year)
    
    # Check for existing saved record (only for single resource)
    if len(resource_ids) == 1:
        existing = await db.monthly_performance.find_one(
            {
                "tenant_id": tenant_id,
                "resource_id": resource_ids[0],
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
    else:
        metrics["saved_record"] = None
        metrics["record_id"] = None
        metrics["status"] = "multi_resource"
    
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
        "revenue_lifetime_override": data.get("revenue_lifetime_override"),
        "revenue_this_month_override": data.get("revenue_this_month_override"),
        "revenue_new_accounts_override": data.get("revenue_new_accounts_override"),
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
    month: int = None,
    year: int = None,
    months: int = 3,
    current_user: dict = Depends(get_current_user)
):
    """Get month-on-month comparison data for one or more resources."""
    tenant_id = get_current_tenant_id()
    
    # Parse comma-separated resource_ids
    resource_ids = [r.strip() for r in resource_id.split(",") if r.strip()]
    resource_filter = {"$in": resource_ids} if len(resource_ids) > 1 else resource_ids[0]
    
    # Use selected month/year as the anchor (last column), default to current month
    if month is None or year is None:
        now = datetime.now(timezone.utc)
        anchor_month = now.month
        anchor_year = now.year
    else:
        anchor_month = month
        anchor_year = year
    
    comparison_data = []
    
    for i in range(months):
        m = anchor_month - i
        y = anchor_year
        while m <= 0:
            m += 12
            y -= 1
        
        metrics = await compute_metrics(tenant_id, resource_ids, plan_id, m, y)
        
        # Compute cumulative existing accounts up to this month
        if m == 12:
            cumulative_end_next = f"{y + 1}-01-01"
        else:
            cumulative_end_next = f"{y}-{m + 1:02d}-01"
        
        # Count accounts that existed by end of this month:
        # accounts created before month_end OR onboarded in/before this month
        all_accs = await db.accounts.find(
            {"tenant_id": tenant_id, "assigned_to": resource_filter},
            {"_id": 0, "id": 1, "onboarded_month": 1, "onboarded_year": 1, "created_at": 1}
        ).to_list(5000)
        
        cumulative_existing = 0
        for acc in all_accs:
            ob_m = acc.get("onboarded_month")
            ob_y = acc.get("onboarded_year")
            if ob_m and ob_y:
                if (ob_y < y) or (ob_y == y and ob_m <= m):
                    cumulative_existing += 1
            else:
                # Fallback: use created_at
                created = acc.get("created_at", "")
                if isinstance(created, str) and created < cumulative_end_next:
                    cumulative_existing += 1
                elif hasattr(created, 'isoformat') and created.isoformat() < cumulative_end_next:
                    cumulative_existing += 1
        
        # New accounts onboarded specifically in this month
        new_onboarded_this_month = len([
            acc for acc in all_accs
            if acc.get("onboarded_month") == m and acc.get("onboarded_year") == y
        ])
        
        saved = await db.monthly_performance.find_one(
            {"tenant_id": tenant_id, "resource_id": resource_filter, "plan_id": plan_id, "month": m, "year": y},
            {"_id": 0, "status": 1, "support_needed": 1, "remarks": 1}
        )
        
        # Check for manual overrides
        override = await db.comparison_overrides.find_one(
            {"tenant_id": tenant_id, "resource_id": resource_filter, "plan_id": plan_id, "month": m, "year": y},
            {"_id": 0}
        )
        
        row = {
            "month": m,
            "year": y,
            "label": f"{['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'][m-1]} {y}",
            "revenue_achieved": metrics["revenue"]["this_month"],
            "monthly_target": metrics["revenue"]["target"],
            "achievement_pct": metrics["revenue"]["achievement_pct"],
            "new_accounts": new_onboarded_this_month,
            "existing_accounts": cumulative_existing,
            "pipeline_value": metrics["pipeline"]["total_value"],
            "pipeline_count": metrics["pipeline"]["total_count"],
            "total_outstanding": metrics["collections"]["total_outstanding"],
            "visits": metrics["activities"]["visits"],
            "calls": metrics["activities"]["calls"],
            "messages": metrics["activities"]["messages"],
            "emails": metrics["activities"]["emails"],
            "status": saved.get("status") if saved else "not_created",
            "support_count": len(saved.get("support_needed", [])) if saved else 0,
            # Auto-computed originals (always available for reset)
            "auto_revenue": metrics["revenue"]["this_month"],
            "auto_outstanding": metrics["collections"]["total_outstanding"],
            # Override flags
            "has_revenue_override": False,
            "has_outstanding_override": False,
        }
        
        if override:
            if override.get("manual_revenue") is not None:
                row["revenue_achieved"] = override["manual_revenue"]
                row["has_revenue_override"] = True
            if override.get("manual_outstanding") is not None:
                row["total_outstanding"] = override["manual_outstanding"]
                row["has_outstanding_override"] = True
        
        comparison_data.append(row)
    
    comparison_data.reverse()
    return {"resource_id": resource_id, "months": comparison_data}


@router.post("/comparison/override")
async def save_comparison_override(
    data: dict,
    current_user: dict = Depends(get_current_user)
):
    """Save a manual override for a comparison row (revenue or outstanding)."""
    tenant_id = get_current_tenant_id()
    now = datetime.now(timezone.utc).isoformat()
    
    resource_id = data.get("resource_id")
    plan_id = data.get("plan_id")
    month = data.get("month")
    year = data.get("year")
    field = data.get("field")  # 'revenue' or 'outstanding'
    value = data.get("value")
    
    if not all([resource_id, plan_id, month, year, field]):
        raise HTTPException(status_code=400, detail="resource_id, plan_id, month, year, field are required")
    
    if field not in ("revenue", "outstanding"):
        raise HTTPException(status_code=400, detail="field must be 'revenue' or 'outstanding'")
    
    db_field = "manual_revenue" if field == "revenue" else "manual_outstanding"
    
    existing = await db.comparison_overrides.find_one(
        {"tenant_id": tenant_id, "resource_id": resource_id, "plan_id": plan_id, "month": month, "year": year}
    )
    
    if existing:
        await db.comparison_overrides.update_one(
            {"_id": existing["_id"]},
            {"$set": {db_field: float(value), "updated_at": now, "updated_by": current_user.get("id")}}
        )
    else:
        await db.comparison_overrides.insert_one({
            "id": str(uuid.uuid4()),
            "tenant_id": tenant_id,
            "resource_id": resource_id,
            "plan_id": plan_id,
            "month": month,
            "year": year,
            db_field: float(value),
            "created_at": now,
            "updated_at": now,
            "updated_by": current_user.get("id"),
        })
    
    return {"message": f"{field} override saved for {month}/{year}"}


@router.delete("/comparison/override")
async def reset_comparison_override(
    resource_id: str,
    plan_id: str,
    month: int,
    year: int,
    field: str,
    current_user: dict = Depends(get_current_user)
):
    """Reset a manual override for a comparison row back to auto-computed."""
    tenant_id = get_current_tenant_id()
    
    if field not in ("revenue", "outstanding"):
        raise HTTPException(status_code=400, detail="field must be 'revenue' or 'outstanding'")
    
    db_field = "manual_revenue" if field == "revenue" else "manual_outstanding"
    
    await db.comparison_overrides.update_one(
        {"tenant_id": tenant_id, "resource_id": resource_id, "plan_id": plan_id, "month": month, "year": year},
        {"$unset": {db_field: ""}, "$set": {"updated_at": datetime.now(timezone.utc).isoformat()}}
    )
    
    return {"message": f"{field} override reset for {month}/{year}"}



@router.post("/account-value-override")
async def save_account_value_override(
    data: dict,
    current_user: dict = Depends(get_current_user)
):
    """Save a manual value override for an account in performance tracking."""
    tenant_id = get_current_tenant_id()
    account_id = data.get("account_id")
    value = data.get("value")
    plan_id = data.get("plan_id")
    
    if not account_id or value is None or not plan_id:
        raise HTTPException(status_code=400, detail="account_id, value, and plan_id required")
    
    await db.account_value_overrides.update_one(
        {"tenant_id": tenant_id, "account_id": account_id, "plan_id": plan_id},
        {"$set": {
            "tenant_id": tenant_id,
            "account_id": account_id,
            "plan_id": plan_id,
            "manual_value": float(value),
            "updated_at": datetime.now(timezone.utc).isoformat(),
            "updated_by": current_user.get("id")
        }},
        upsert=True
    )
    return {"message": "Account value saved"}


@router.delete("/account-value-override")
async def reset_account_value_override(
    account_id: str,
    plan_id: str,
    current_user: dict = Depends(get_current_user)
):
    """Reset a manual account value override."""
    tenant_id = get_current_tenant_id()
    await db.account_value_overrides.delete_one(
        {"tenant_id": tenant_id, "account_id": account_id, "plan_id": plan_id}
    )
    return {"message": "Account value override reset"}
