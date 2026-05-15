"""
Monthly Performance Tracking Module
Captures sales outcomes, activity metrics, pipeline movement, collections position, and support needs.
Linked to Target Setup Module for target vs achievement tracking.
"""

from fastapi import APIRouter, HTTPException, Depends
from datetime import datetime, timezone, timedelta
from typing import List, Optional
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
    monthly_target = 0
    resource_name = ""
    resource_city = ""
    
    if plan_id:
        # Get target from plan — sum across all selected resources
        target_allocs = await db.target_allocations_v2.find(
            {"plan_id": plan_id, "resource_id": resource_filter, "level": "resource"},
            {"_id": 0, "amount": 1, "city": 1, "resource_name": 1}
        ).to_list(100)
        monthly_target = sum(t.get("amount", 0) for t in target_allocs)
        resource_names = [t.get("resource_name", "") for t in target_allocs]
        resource_name = ", ".join(resource_names) if resource_names else ""
        resource_city = ", ".join(sorted(set(t.get("city", "") for t in target_allocs if t.get("city")))) if target_allocs else ""
    
    # Fallback: get resource names/cities from users collection if not found via plan
    if not resource_name:
        users = await db.users.find(
            {"id": resource_filter},
            {"_id": 0, "id": 1, "name": 1, "city": 1}
        ).to_list(100)
        resource_name = ", ".join(u.get("name", "") for u in users)
        resource_city = ", ".join(sorted(set(u.get("city", "") for u in users if u.get("city"))))

    # === B. ACCOUNT METRICS (from accounts collection, NOT leads) ===
    # Fetch resource's accounts FIRST because invoices don't carry `assigned_to`
    # (especially externally-pushed ones). We resolve invoices→accounts via
    # account identifiers (uuid / account_id / lead_id / customer_name).
    all_accounts = await db.accounts.find(
        {
            "tenant_id": tenant_id,
            "assigned_to": resource_filter,
        },
        {"_id": 0, "id": 1, "account_id": 1, "lead_id": 1, "account_name": 1,
         "city": 1, "account_type": 1, "onboarded_month": 1, "onboarded_year": 1,
         "created_at": 1}
    ).to_list(1000)
    
    existing_accounts_count = len(all_accounts)
    
    # Build the invoice→account match query from this resource's accounts.
    # Mirrors the matching used by `GET /api/accounts/{id}/invoices`.
    acc_uuids = [a["id"] for a in all_accounts if a.get("id")]
    acc_codes = [a["account_id"] for a in all_accounts if a.get("account_id")]
    acc_lead_ids = [a["lead_id"] for a in all_accounts if a.get("lead_id")]
    acc_names = [a["account_name"] for a in all_accounts if a.get("account_name")]
    
    inv_or_clauses: list[dict] = []
    if acc_uuids:
        inv_or_clauses.append({"account_uuid": {"$in": acc_uuids}})
        inv_or_clauses.append({"account_id": {"$in": acc_uuids}})
    if acc_codes:
        inv_or_clauses.append({"account_id": {"$in": acc_codes}})
        inv_or_clauses.append({"account_id_from_mq": {"$in": acc_codes}})
    if acc_lead_ids:
        inv_or_clauses.append({"ca_lead_id": {"$in": acc_lead_ids}})
        inv_or_clauses.append({"lead_id": {"$in": acc_lead_ids}})
    if acc_names:
        inv_or_clauses.append({"customer_name": {"$in": acc_names}})
    
    if inv_or_clauses:
        invoices_this_month = await db.invoices.find(
            {
                "tenant_id": tenant_id,
                "$or": inv_or_clauses,
                "invoice_date": {"$gte": month_start, "$lt": month_end},
            },
            {"_id": 0, "net_invoice_value": 1, "gross_invoice_value": 1,
             "outstanding": 1, "account_uuid": 1, "account_id": 1, "invoice_date": 1,
             "customer_name": 1, "ca_lead_id": 1, "lead_id": 1, "account_id_from_mq": 1}
        ).to_list(10000)
        all_invoices = await db.invoices.find(
            {"tenant_id": tenant_id, "$or": inv_or_clauses},
            {"_id": 0, "net_invoice_value": 1, "gross_invoice_value": 1,
             "account_uuid": 1, "account_id": 1, "customer_name": 1,
             "ca_lead_id": 1, "lead_id": 1, "account_id_from_mq": 1}
        ).to_list(50000)
    else:
        invoices_this_month, all_invoices = [], []
    
    revenue_this_month = sum(inv.get("net_invoice_value") or inv.get("gross_invoice_value") or 0 for inv in invoices_this_month)
    revenue_lifetime = sum(inv.get("net_invoice_value") or inv.get("gross_invoice_value") or 0 for inv in all_invoices)
    achievement_pct = round((revenue_this_month / monthly_target * 100), 1) if monthly_target > 0 else 0
    
    # Helper: resolve an invoice doc back to its account UUID for grouping
    _name_to_uuid = {a["account_name"]: a["id"] for a in all_accounts if a.get("account_name") and a.get("id")}
    _code_to_uuid = {a["account_id"]: a["id"] for a in all_accounts if a.get("account_id") and a.get("id")}
    _lead_to_uuid = {a["lead_id"]: a["id"] for a in all_accounts if a.get("lead_id") and a.get("id")}

    def _resolve_inv_account_uuid(inv: dict) -> Optional[str]:
        for key in ("account_uuid", "account_id"):
            v = inv.get(key)
            if not v:
                continue
            if v in _code_to_uuid:
                return _code_to_uuid[v]
            if v in [a["id"] for a in all_accounts]:
                return v
        for key in ("account_id_from_mq",):
            v = inv.get(key)
            if v and v in _code_to_uuid:
                return _code_to_uuid[v]
        for key in ("ca_lead_id", "lead_id"):
            v = inv.get(key)
            if v and v in _lead_to_uuid:
                return _lead_to_uuid[v]
        cn = inv.get("customer_name")
        if cn and cn in _name_to_uuid:
            return _name_to_uuid[cn]
        return None
    
    # Compute average monthly sales per account from invoices.
    # Resolve each invoice→account via the resolver (matches uuid/code/lead/name).
    account_avg_sales = {}
    for inv in all_invoices:
        acc_uuid = _resolve_inv_account_uuid(inv)
        if acc_uuid:
            account_avg_sales.setdefault(acc_uuid, []).append(
                inv.get("net_invoice_value") or inv.get("gross_invoice_value") or 0
            )
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
    override_query = {"tenant_id": tenant_id}
    if plan_id:
        override_query["plan_id"] = plan_id
    override_docs = await db.account_value_overrides.find(
        override_query,
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
    
    # Revenue from accounts onboarded this month — use the resolver
    revenue_new_accounts = sum(
        inv.get("net_invoice_value") or inv.get("gross_invoice_value") or 0
        for inv in invoices_this_month
        if _resolve_inv_account_uuid(inv) in new_account_ids
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
            "next_month_leads_list": [
                {
                    "id": lead.get("id"),
                    "name": lead.get("name") or lead.get("company") or "—",
                    "company": lead.get("company") or "",
                    "city": lead.get("city") or "",
                    "status": lead.get("status") or "",
                    "pipeline_value": round(get_pipeline_value(lead) or 0, 2),
                    "target_closure_month": lead.get("target_closure_month"),
                    "target_closure_year": lead.get("target_closure_year"),
                }
                for lead in next_month_leads
            ],
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


@router.get("/all-sales-resources")
async def get_all_sales_resources(current_user: dict = Depends(get_current_user)):
    """Get all sales/admin team members with territory and city info, independent of any plan."""
    tenant_id = get_current_tenant_id()
    users = await db.users.find(
        {"tenant_id": tenant_id, "department": {"$in": ["Sales", "Admin"]}, "is_active": {"$ne": False}},
        {"_id": 0, "id": 1, "name": 1, "territory": 1, "city": 1, "role": 1, "department": 1}
    ).to_list(500)
    # Return in a format compatible with the plan-based resource list
    return [
        {
            "resource_id": u["id"],
            "resource_name": u.get("name", ""),
            "territory_id": u.get("territory", ""),
            "territory_name": u.get("territory", ""),
            "city": u.get("city", ""),
        }
        for u in users
    ]


@router.get("/generate")
async def generate_performance(
    resource_id: str,
    month: int,
    year: int,
    plan_id: str = None,
    current_user: dict = Depends(get_current_user)
):
    """Generate/compute monthly performance metrics for one or more resources. Plan is optional."""
    tenant_id = get_current_tenant_id()
    
    # Parse comma-separated resource_ids
    resource_ids = [r.strip() for r in resource_id.split(",") if r.strip()]
    if not resource_ids:
        raise HTTPException(status_code=400, detail="No resource IDs provided")
    
    # Validate plan if provided
    plan_name = ""
    if plan_id:
        plan = await db.target_plans_v2.find_one(
            {"id": plan_id}, {"_id": 0, "name": 1}
        )
        if not plan:
            raise HTTPException(status_code=404, detail="Target plan not found")
        plan_name = plan.get("name", "")
    
    metrics = await compute_metrics(tenant_id, resource_ids, plan_id, month, year)
    
    # Check for existing saved record (only for single resource — plan_id may be None for Month mode)
    if len(resource_ids) == 1:
        existing = await db.monthly_performance.find_one(
            {
                "tenant_id": tenant_id,
                "resource_id": resource_ids[0],
                "plan_id": plan_id if plan_id else None,
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
    
    metrics["plan_name"] = plan_name
    return metrics


@router.post("/save")
async def save_performance(
    data: dict,
    current_user: dict = Depends(get_current_user)
):
    """Save/update monthly performance record with user-entered fields."""
    tenant_id = get_current_tenant_id()
    now = datetime.now(timezone.utc).isoformat()
    
    plan_id = data.get("plan_id") or None
    resource_id = data.get("resource_id")
    month = data.get("month")
    year = data.get("year")
    
    if not all([resource_id, month, year]):
        raise HTTPException(status_code=400, detail="resource_id, month, year are required")
    
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



# ════════════════════════════════════════════════════════════════════
# Top-10 Priorities — Case Targets per Account, per SKU
# ════════════════════════════════════════════════════════════════════
from pydantic import BaseModel  # noqa: E402

MONTH_NAMES = ["January", "February", "March", "April", "May", "June",
               "July", "August", "September", "October", "November", "December"]


def _month_bounds(year: int, month: int):
    """Return (iso_start, iso_end) bounds for given year/month (UTC)."""
    start = datetime(year, month, 1, tzinfo=timezone.utc).isoformat()
    if month == 12:
        end = datetime(year + 1, 1, 1, tzinfo=timezone.utc).isoformat()
    else:
        end = datetime(year, month + 1, 1, tzinfo=timezone.utc).isoformat()
    return start, end


async def _sum_cases_per_sku(tenant_id: str, account_ids, start_iso, end_iso):
    """Aggregate cases (quantity) shipped per (account_id, sku_name) inside the window.

    Source: the `invoices` collection (externally-pushed sales data).
    Falls back to `distributor_deliveries` for tenants that still rely on the
    CRM's distributor flow.

    Each invoice has an `items[]` array with `{sku_name, quantity, ...}`.
    Cases = sum of `quantity` per (account, sku) for invoices dated in window.
    Returns dict keyed by (account_uuid, sku_name).
    """
    if not account_ids:
        return {}

    # Resolve invoices→accounts using the same multi-field matching used
    # elsewhere (account_uuid / account_id / ca_lead_id / customer_name / etc.).
    accounts = await db.accounts.find(
        {"tenant_id": tenant_id, "id": {"$in": list(account_ids)}},
        {"_id": 0, "id": 1, "account_id": 1, "account_name": 1, "lead_id": 1},
    ).to_list(2000)

    acc_uuids = [a["id"] for a in accounts if a.get("id")]
    acc_codes = [a["account_id"] for a in accounts if a.get("account_id")]
    acc_lead_ids = [a["lead_id"] for a in accounts if a.get("lead_id")]
    acc_names = [a["account_name"] for a in accounts if a.get("account_name")]

    inv_or: list[dict] = []
    if acc_uuids:
        inv_or.append({"account_uuid": {"$in": acc_uuids}})
        inv_or.append({"account_id": {"$in": acc_uuids}})
    if acc_codes:
        inv_or.append({"account_id": {"$in": acc_codes}})
        inv_or.append({"account_id_from_mq": {"$in": acc_codes}})
    if acc_lead_ids:
        inv_or.append({"ca_lead_id": {"$in": acc_lead_ids}})
        inv_or.append({"lead_id": {"$in": acc_lead_ids}})
    if acc_names:
        inv_or.append({"customer_name": {"$in": acc_names}})

    out: dict[tuple, float] = {}
    if not inv_or:
        return out

    # invoice_date is stored as 'YYYY-MM-DD' string; start_iso/end_iso come from
    # _month_bounds() which produces a full ISO timestamp. Strip to YYYY-MM-DD
    # for correct lex comparison on the date field.
    start_date = start_iso[:10] if isinstance(start_iso, str) else start_iso
    end_date = end_iso[:10] if isinstance(end_iso, str) else end_iso

    invoices = await db.invoices.find(
        {
            "tenant_id": tenant_id,
            "$or": inv_or,
            "invoice_date": {"$gte": start_date, "$lt": end_date},
        },
        {"_id": 0, "items": 1, "line_items": 1, "account_uuid": 1, "account_id": 1,
         "account_id_from_mq": 1, "ca_lead_id": 1, "lead_id": 1, "customer_name": 1},
    ).to_list(20000)

    # Reverse-lookup maps so we can pin every invoice back to its account UUID
    name_to_uuid = {a["account_name"]: a["id"] for a in accounts if a.get("account_name") and a.get("id")}
    code_to_uuid = {a["account_id"]: a["id"] for a in accounts if a.get("account_id") and a.get("id")}
    lead_to_uuid = {a["lead_id"]: a["id"] for a in accounts if a.get("lead_id") and a.get("id")}
    uuid_set = set(acc_uuids)

    for inv in invoices:
        acc_uuid = None
        for key in ("account_uuid", "account_id"):
            v = inv.get(key)
            if v and v in uuid_set:
                acc_uuid = v
                break
            if v and v in code_to_uuid:
                acc_uuid = code_to_uuid[v]
                break
        if not acc_uuid:
            v = inv.get("account_id_from_mq")
            if v and v in code_to_uuid:
                acc_uuid = code_to_uuid[v]
        if not acc_uuid:
            for key in ("ca_lead_id", "lead_id"):
                v = inv.get(key)
                if v and v in lead_to_uuid:
                    acc_uuid = lead_to_uuid[v]
                    break
        if not acc_uuid:
            cn = inv.get("customer_name")
            if cn and cn in name_to_uuid:
                acc_uuid = name_to_uuid[cn]
        if not acc_uuid:
            continue

        for it in (inv.get("items") or inv.get("line_items") or []):
            sku = it.get("sku_name") or it.get("sku") or it.get("name")
            if not sku:
                continue
            qty = it.get("quantity") or it.get("bottles") or 0
            try:
                qty = float(qty)
            except (TypeError, ValueError):
                qty = 0
            if qty <= 0:
                continue
            key = (acc_uuid, sku)
            out[key] = out.get(key, 0) + qty

    return out


@router.get("/account-case-targets")
async def get_account_case_targets(
    year: int,
    month: int,
    resource_ids: str = "",
    current_user: dict = Depends(get_current_user),
):
    """For the Top-10 Priorities → Case Targets section.

    For each account belonging to the selected resource(s):
      * lists SKUs the account is priced on
      * current cases shipped this month (per SKU)
      * default target = previous month's shipped cases (per SKU)
      * override target if admin saved one
      * pipeline values = cases × price_per_unit
    """
    tenant_id = get_current_tenant_id()
    if not (1 <= month <= 12):
        raise HTTPException(400, "Invalid month")

    rids = [r for r in (resource_ids or "").split(",") if r]
    acc_query = {"tenant_id": tenant_id}
    if rids:
        acc_query["assigned_to"] = {"$in": rids}
    accounts = await db.accounts.find(
        acc_query,
        {"_id": 0, "id": 1, "account_name": 1, "sku_pricing": 1, "assigned_to": 1, "city": 1},
    ).to_list(2000)
    accounts = [a for a in accounts if (a.get("sku_pricing") or [])]
    account_ids = [a["id"] for a in accounts]

    if not account_ids:
        return {
            "month_label": f"{MONTH_NAMES[month - 1]} {year}",
            "accounts": [],
            "totals": {"current_cases": 0, "target_cases": 0, "current_value": 0.0, "target_value": 0.0, "achievement_pct": None},
        }

    cur_start, cur_end = _month_bounds(year, month)
    prev_year, prev_month = (year - 1, 12) if month == 1 else (year, month - 1)
    prev_start, prev_end = _month_bounds(prev_year, prev_month)

    current_cases_map = await _sum_cases_per_sku(tenant_id, account_ids, cur_start, cur_end)
    prev_cases_map = await _sum_cases_per_sku(tenant_id, account_ids, prev_start, prev_end)

    overrides = await db.account_case_targets.find(
        {"tenant_id": tenant_id, "year": year, "month": month, "account_id": {"$in": account_ids}},
        {"_id": 0},
    ).to_list(5000)
    override_map = {(o["account_id"], o["sku_name"]): o for o in overrides}

    out_accounts = []
    grand = {"last_month_cases": 0, "current_cases": 0, "target_cases": 0, "current_value": 0.0, "target_value": 0.0}

    for acc in accounts:
        acc_id = acc["id"]
        rows = []
        acc_totals = {"last_month_cases": 0, "current_cases": 0, "target_cases": 0, "current_value": 0.0, "target_value": 0.0}
        for sp in acc.get("sku_pricing") or []:
            sku = sp.get("sku")
            price = float(sp.get("price_per_unit") or 0)
            # qty from invoice items is a float; round and cast for display
            cur_cases = int(round(float(current_cases_map.get((acc_id, sku), 0))))
            last_month_cases = int(round(float(prev_cases_map.get((acc_id, sku), 0))))
            ov = override_map.get((acc_id, sku))
            target_cases = int(ov["target_cases"]) if ov else last_month_cases
            cur_val = cur_cases * price
            tgt_val = target_cases * price
            rows.append({
                "sku": sku,
                "price_per_unit": price,
                "last_month_cases": last_month_cases,
                "current_cases": cur_cases,
                "default_target_cases": last_month_cases,  # kept for backwards compatibility
                "target_cases": target_cases,
                "is_overridden": bool(ov),
                "current_pipeline_value": cur_val,
                "target_pipeline_value": tgt_val,
                "achievement_pct": round((cur_val / tgt_val) * 100, 1) if tgt_val > 0 else None,
            })
            acc_totals["last_month_cases"] += last_month_cases
            acc_totals["current_cases"] += cur_cases
            acc_totals["target_cases"] += target_cases
            acc_totals["current_value"] += cur_val
            acc_totals["target_value"] += tgt_val
        rows.sort(key=lambda r: r["target_pipeline_value"], reverse=True)
        out_accounts.append({
            "account_id": acc_id,
            "account_name": acc.get("account_name"),
            "city": acc.get("city"),
            "rows": rows,
            "totals": acc_totals,
            "achievement_pct": round((acc_totals["current_value"] / acc_totals["target_value"]) * 100, 1) if acc_totals["target_value"] > 0 else None,
        })
        for k, v in acc_totals.items():
            grand[k] = grand.get(k, 0) + v

    out_accounts.sort(key=lambda a: a["totals"]["target_value"], reverse=True)

    return {
        "month_label": f"{MONTH_NAMES[month - 1]} {year}",
        "previous_month_label": f"{MONTH_NAMES[prev_month - 1]} {prev_year}",
        "accounts": out_accounts,
        "totals": {
            **grand,
            "achievement_pct": round((grand["current_value"] / grand["target_value"]) * 100, 1) if grand["target_value"] > 0 else None,
        },
    }


class CaseTargetUpsert(BaseModel):
    account_id: str
    sku_name: str
    year: int
    month: int
    target_cases: int


@router.post("/account-case-targets")
async def upsert_account_case_target(
    payload: CaseTargetUpsert,
    current_user: dict = Depends(get_current_user),
):
    """Store/update an admin override for one (account, sku, month) cell."""
    tenant_id = get_current_tenant_id()
    if payload.target_cases < 0:
        raise HTTPException(400, "Target cases cannot be negative")
    now = datetime.now(timezone.utc).isoformat()
    await db.account_case_targets.update_one(
        {
            "tenant_id": tenant_id,
            "account_id": payload.account_id,
            "sku_name": payload.sku_name,
            "year": payload.year,
            "month": payload.month,
        },
        {"$set": {
            "target_cases": int(payload.target_cases),
            "updated_at": now,
            "updated_by": current_user.get("id"),
            "updated_by_name": current_user.get("name"),
        }, "$setOnInsert": {
            "id": str(uuid.uuid4()),
            "tenant_id": tenant_id,
            "account_id": payload.account_id,
            "sku_name": payload.sku_name,
            "year": payload.year,
            "month": payload.month,
            "created_at": now,
        }},
        upsert=True,
    )
    return {"ok": True, "target_cases": payload.target_cases}


@router.delete("/account-case-targets")
async def reset_account_case_target(
    account_id: str,
    sku_name: str,
    year: int,
    month: int,
    current_user: dict = Depends(get_current_user),
):
    """Remove an override and revert to the auto-derived default (prev-month sales)."""
    tenant_id = get_current_tenant_id()
    await db.account_case_targets.delete_one({
        "tenant_id": tenant_id,
        "account_id": account_id,
        "sku_name": sku_name,
        "year": year,
        "month": month,
    })
    return {"ok": True}



# ════════════════════════════════════════════════════════════════════
# Top-10 Priorities — Sampling / Trials
# ════════════════════════════════════════════════════════════════════

SAMPLING_STATUSES = {"not_started", "in_progress", "completed"}


def _compute_end_date(trial_date: Optional[str], duration_days: Optional[int]) -> Optional[str]:
    if not trial_date or duration_days is None:
        return None
    try:
        days = int(duration_days)
        if days <= 0:
            return trial_date[:10]
        d = datetime.strptime(trial_date[:10], "%Y-%m-%d")
        # A 1-day trial ends same day; an N-day trial ends on start + (N-1) days.
        return (d + timedelta(days=days - 1)).strftime("%Y-%m-%d")
    except Exception:
        return None


def _lead_sku_options(lead: dict) -> List[dict]:
    """Normalize a lead's SKU pricing into [{sku, price_per_unit}] rows."""
    out = []
    seen = set()
    for sp in (lead.get("proposed_sku_pricing") or []):
        sku = sp.get("sku") or sp.get("sku_name")
        if not sku or sku in seen:
            continue
        price = sp.get("price_per_unit")
        if price is None:
            price = sp.get("proposed_price")
        try:
            price = float(price) if price is not None else 0.0
        except Exception:
            price = 0.0
        seen.add(sku)
        out.append({"sku": sku, "price_per_unit": price})
    return out


async def _sku_units_map(tenant_id: str, sku_names: List[str]) -> dict:
    """Fetch packaging info for a list of SKU names from master_skus.
    Returns: {sku_name: {default_units_per_package, packaging_options: [{id, name, units_per_package, is_default}]}}.
    Packaging options come from packaging_config.stock_out (the sales/distribution packaging set).
    """
    if not sku_names:
        return {}
    cursor = db.master_skus.find(
        {"sku_name": {"$in": list(set(sku_names))}},
        {"_id": 0, "sku_name": 1, "packaging_config": 1},
    )
    out = {}
    async for row in cursor:
        sku_name = row.get("sku_name")
        cfg = (row.get("packaging_config") or {})
        # Prefer stock_out (sales packaging); fall back to production.
        opts_raw = cfg.get("stock_out") or cfg.get("production") or []
        options = []
        default_upp = None
        for o in opts_raw:
            try:
                upp = int(o.get("units_per_package") or 0)
            except Exception:
                upp = 0
            if upp <= 0:
                continue
            entry = {
                "packaging_type_id": o.get("packaging_type_id"),
                "name": o.get("packaging_type_name") or "",
                "units_per_package": upp,
                "is_default": bool(o.get("is_default")),
            }
            options.append(entry)
            if entry["is_default"] and default_upp is None:
                default_upp = upp
        if default_upp is None and options:
            default_upp = options[0]["units_per_package"]
        out[sku_name] = {
            "default_units_per_package": default_upp,
            "packaging_options": options,
        }
    return out


def _compute_sku_plans_amount(sku_plans: List[dict]) -> float:
    total = 0.0
    for p in (sku_plans or []):
        try:
            crates = float(p.get("crates") or 0)
            upp = float(p.get("units_per_package") or 0)
            price = float(p.get("price_per_unit") or 0)
            total += crates * upp * price
        except Exception:
            pass
    return round(total, 2)


@router.get("/sampling-trials")
async def list_sampling_trials(
    resource_ids: str = "",
    current_user: dict = Depends(get_current_user),
):
    """List sampling/trial records for leads assigned to the selected resource(s).

    Returns:
      - leads: [{id, lead_id, name, city, status, sku_options: [{sku, price_per_unit, units_per_package}]}]
      - trials: [{id, lead_id, lead_name, lead_city, trial_date, duration_days, end_date,
                  status, sku_plans, total_amount, notes, created_at}]
    """
    tenant_id = get_current_tenant_id()

    rids = [r for r in (resource_ids or "").split(",") if r]
    lead_q = {"tenant_id": tenant_id}
    if rids:
        lead_q["assigned_to"] = {"$in": rids}

    leads = await db.leads.find(
        lead_q,
        {"_id": 0, "id": 1, "lead_id": 1, "company": 1, "city": 1, "status": 1, "assigned_to": 1, "proposed_sku_pricing": 1},
    ).to_list(5000)

    # Gather all SKUs across leads to bulk-lookup units_per_package
    all_skus = []
    for lead in leads:
        for row in _lead_sku_options(lead):
            all_skus.append(row["sku"])
    units_map = await _sku_units_map(tenant_id, all_skus)

    out_leads = []
    for lead in leads:
        opts = _lead_sku_options(lead)
        for o in opts:
            sku_meta = units_map.get(o["sku"]) or {}
            o["units_per_package"] = sku_meta.get("default_units_per_package") or None
            o["packaging_options"] = sku_meta.get("packaging_options") or []
        out_leads.append({
            "id": lead.get("id"),
            "lead_id": lead.get("lead_id"),
            "name": lead.get("company"),
            "city": lead.get("city"),
            "status": lead.get("status"),
            "sku_options": opts,
        })
    out_leads.sort(key=lambda x: (x.get("name") or "").lower())

    # Load trials for those leads
    lead_ids = [x["id"] for x in out_leads if x.get("id")]
    trial_q = {"tenant_id": tenant_id}
    if lead_ids:
        trial_q["lead_id"] = {"$in": lead_ids}
    trials = await db.sampling_trials.find(trial_q, {"_id": 0}).to_list(5000)
    # Enrich with lead meta
    lead_map = {x["id"]: x for x in out_leads}
    for t in trials:
        lead = lead_map.get(t.get("lead_id")) or {}
        t["lead_name"] = lead.get("name")
        t["lead_city"] = lead.get("city")
        t["total_amount"] = _compute_sku_plans_amount(t.get("sku_plans") or [])
        # Recompute end_date defensively
        if t.get("trial_date") and t.get("duration_days") is not None:
            t["end_date"] = _compute_end_date(t.get("trial_date"), t.get("duration_days"))
    trials.sort(key=lambda x: (x.get("trial_date") or ""), reverse=True)

    # Totals
    total_amount = sum(t.get("total_amount", 0) for t in trials)
    by_status = {s: 0 for s in SAMPLING_STATUSES}
    for t in trials:
        s = t.get("status") or "not_started"
        if s in by_status:
            by_status[s] += 1

    return {
        "leads": out_leads,
        "trials": trials,
        "totals": {
            "total_trials": len(trials),
            "total_amount": round(total_amount, 2),
            "by_status": by_status,
        },
    }


class SkuPlan(BaseModel):
    sku: str
    crates: float = 0
    units_per_package: Optional[int] = None
    packaging_type_id: Optional[str] = None
    price_per_unit: Optional[float] = None


class SamplingTrialCreate(BaseModel):
    lead_id: str
    trial_date: str  # YYYY-MM-DD
    duration_days: int = 1
    status: str = "not_started"
    sku_plans: List[SkuPlan] = []
    notes: Optional[str] = None


class SamplingTrialUpdate(BaseModel):
    trial_date: Optional[str] = None
    duration_days: Optional[int] = None
    status: Optional[str] = None
    sku_plans: Optional[List[SkuPlan]] = None
    notes: Optional[str] = None


def _validate_status(status: str):
    if status not in SAMPLING_STATUSES:
        raise HTTPException(400, f"Invalid status. Must be one of {sorted(SAMPLING_STATUSES)}")


@router.post("/sampling-trials")
async def create_sampling_trial(
    payload: SamplingTrialCreate,
    current_user: dict = Depends(get_current_user),
):
    tenant_id = get_current_tenant_id()
    _validate_status(payload.status)
    if payload.duration_days < 1:
        raise HTTPException(400, "Duration must be >= 1 day")

    lead = await db.leads.find_one({"id": payload.lead_id, "tenant_id": tenant_id}, {"_id": 0, "id": 1})
    if not lead:
        raise HTTPException(404, "Lead not found")

    now = datetime.now(timezone.utc).isoformat()
    sku_plans = [p.dict() for p in (payload.sku_plans or [])]
    doc = {
        "id": str(uuid.uuid4()),
        "tenant_id": tenant_id,
        "lead_id": payload.lead_id,
        "trial_date": payload.trial_date[:10],
        "duration_days": int(payload.duration_days),
        "end_date": _compute_end_date(payload.trial_date, payload.duration_days),
        "status": payload.status,
        "sku_plans": sku_plans,
        "notes": payload.notes,
        "created_at": now,
        "created_by": current_user.get("id"),
        "created_by_name": current_user.get("name"),
        "updated_at": now,
    }
    await db.sampling_trials.insert_one(dict(doc))  # copy so local dict not mutated
    doc["total_amount"] = _compute_sku_plans_amount(sku_plans)
    return doc


@router.put("/sampling-trials/{trial_id}")
async def update_sampling_trial(
    trial_id: str,
    payload: SamplingTrialUpdate,
    current_user: dict = Depends(get_current_user),
):
    tenant_id = get_current_tenant_id()
    existing = await db.sampling_trials.find_one({"id": trial_id, "tenant_id": tenant_id}, {"_id": 0})
    if not existing:
        raise HTTPException(404, "Trial not found")

    updates = {}
    if payload.status is not None:
        _validate_status(payload.status)
        updates["status"] = payload.status
    if payload.trial_date is not None:
        updates["trial_date"] = payload.trial_date[:10]
    if payload.duration_days is not None:
        if payload.duration_days < 1:
            raise HTTPException(400, "Duration must be >= 1 day")
        updates["duration_days"] = int(payload.duration_days)
    # Recompute end_date if either changed
    if "trial_date" in updates or "duration_days" in updates:
        td = updates.get("trial_date", existing.get("trial_date"))
        dd = updates.get("duration_days", existing.get("duration_days"))
        updates["end_date"] = _compute_end_date(td, dd)
    if payload.sku_plans is not None:
        updates["sku_plans"] = [p.dict() for p in payload.sku_plans]
    if payload.notes is not None:
        updates["notes"] = payload.notes
    updates["updated_at"] = datetime.now(timezone.utc).isoformat()
    updates["updated_by"] = current_user.get("id")
    updates["updated_by_name"] = current_user.get("name")

    await db.sampling_trials.update_one({"id": trial_id, "tenant_id": tenant_id}, {"$set": updates})
    doc = await db.sampling_trials.find_one({"id": trial_id, "tenant_id": tenant_id}, {"_id": 0})
    if doc:
        doc["total_amount"] = _compute_sku_plans_amount(doc.get("sku_plans") or [])
    return doc


@router.delete("/sampling-trials/{trial_id}")
async def delete_sampling_trial(
    trial_id: str,
    current_user: dict = Depends(get_current_user),
):
    tenant_id = get_current_tenant_id()
    res = await db.sampling_trials.delete_one({"id": trial_id, "tenant_id": tenant_id})
    if res.deleted_count == 0:
        raise HTTPException(404, "Trial not found")
    return {"ok": True}



# ════════════════════════════════════════════════════════════════════
# Top-10 Priorities — Focus Leads (Top N Leads to Focus)
# ════════════════════════════════════════════════════════════════════


def _lead_estimated_monthly_revenue(lead: dict) -> float:
    """Derive estimated monthly revenue from proposed_sku_pricing.

    Uses stored `estimated_monthly_revenue` if present; otherwise computes
    using lead.estimation.final_monthly * pricing percentages.
    """
    stored = lead.get("estimated_monthly_revenue") or (lead.get("estimation") or {}).get("estimated_monthly_revenue")
    try:
        if stored is not None:
            return float(stored)
    except Exception:
        pass
    try:
        est = lead.get("estimation") or {}
        monthly_bottles = float(est.get("final_monthly") or est.get("calculated_monthly") or 0)
        total = 0.0
        for sp in (lead.get("proposed_sku_pricing") or []):
            price = sp.get("price_per_unit")
            if price is None:
                price = sp.get("proposed_price")
            pct = sp.get("percentage")
            if pct is not None and monthly_bottles > 0:
                total += (monthly_bottles * float(pct or 0) / 100.0) * float(price or 0)
        return round(total, 2)
    except Exception:
        return 0.0


async def _focus_leads_enrich(tenant_id: str, resource_ids: List[str]) -> List[dict]:
    """Return leads assigned to the selected resource(s) with focus-display fields."""
    q = {"tenant_id": tenant_id}
    if resource_ids:
        q["assigned_to"] = {"$in": resource_ids}
    cursor = db.leads.find(
        q,
        {
            "_id": 0,
            "id": 1,
            "lead_id": 1,
            "company": 1,
            "city": 1,
            "status": 1,
            "priority": 1,
            "assigned_to": 1,
            "estimated_value": 1,
            "estimated_monthly_revenue": 1,
            "estimation": 1,
            "proposed_sku_pricing": 1,
            "next_followup_date": 1,
        },
    )
    out = []
    async for lead in cursor:
        out.append({
            "id": lead.get("id"),
            "lead_id": lead.get("lead_id"),
            "name": lead.get("company"),
            "city": lead.get("city"),
            "status": lead.get("status"),
            "priority": lead.get("priority"),
            "assigned_to": lead.get("assigned_to"),
            "estimated_monthly_revenue": _lead_estimated_monthly_revenue(lead),
            "next_followup_date": lead.get("next_followup_date"),
        })
    out.sort(key=lambda x: (x.get("name") or "").lower())
    return out


@router.get("/focus-leads")
async def get_focus_leads(
    year: int,
    month: int,
    resource_ids: str = "",
    current_user: dict = Depends(get_current_user),
):
    """For the Top-10 Priorities → Top N Leads to Focus section.

    Returns all leads assigned to the selected resource(s) plus the current
    selection for (year, month). If a single resource is selected, we read
    that resource's selection; if multiple, we return the union (read-only aggregate).
    """
    tenant_id = get_current_tenant_id()
    if not (1 <= month <= 12):
        raise HTTPException(400, "Invalid month")

    rids = [r for r in (resource_ids or "").split(",") if r]
    leads = await _focus_leads_enrich(tenant_id, rids)

    sel_query = {"tenant_id": tenant_id, "year": year, "month": month}
    if rids:
        sel_query["resource_id"] = {"$in": rids}
    selections = await db.focus_leads.find(sel_query, {"_id": 0}).to_list(1000)

    selected_lead_ids = []
    if len(rids) <= 1:
        if selections:
            selected_lead_ids = list(selections[0].get("lead_ids") or [])
    else:
        seen = set()
        for s in selections:
            for lid in (s.get("lead_ids") or []):
                if lid not in seen:
                    selected_lead_ids.append(lid)
                    seen.add(lid)

    lead_map = {ld["id"]: ld for ld in leads}
    total_revenue = 0.0
    for lid in selected_lead_ids:
        ld = lead_map.get(lid)
        if ld:
            total_revenue += float(ld.get("estimated_monthly_revenue") or 0)

    return {
        "year": year,
        "month": month,
        "resource_ids": rids,
        "is_editable": len(rids) == 1,
        "leads": leads,
        "selected_lead_ids": selected_lead_ids,
        "totals": {
            "selected_count": len(selected_lead_ids),
            "estimated_monthly_revenue": round(total_revenue, 2),
        },
    }


class FocusLeadsUpsert(BaseModel):
    year: int
    month: int
    resource_id: str
    lead_ids: List[str] = []


@router.post("/focus-leads")
async def upsert_focus_leads(
    payload: FocusLeadsUpsert,
    current_user: dict = Depends(get_current_user),
):
    """Save the focus-leads selection for (year, month, resource_id)."""
    tenant_id = get_current_tenant_id()
    if not (1 <= payload.month <= 12):
        raise HTTPException(400, "Invalid month")
    if not payload.resource_id:
        raise HTTPException(400, "resource_id is required")

    seen = set()
    unique_ids = []
    for lid in (payload.lead_ids or []):
        if lid and lid not in seen:
            unique_ids.append(lid)
            seen.add(lid)

    now = datetime.now(timezone.utc).isoformat()
    await db.focus_leads.update_one(
        {"tenant_id": tenant_id, "year": payload.year, "month": payload.month, "resource_id": payload.resource_id},
        {
            "$set": {
                "lead_ids": unique_ids,
                "updated_at": now,
                "updated_by": current_user.get("id"),
                "updated_by_name": current_user.get("name"),
            },
            "$setOnInsert": {
                "id": str(uuid.uuid4()),
                "tenant_id": tenant_id,
                "year": payload.year,
                "month": payload.month,
                "resource_id": payload.resource_id,
                "created_at": now,
            },
        },
        upsert=True,
    )
    return {"ok": True, "count": len(unique_ids), "lead_ids": unique_ids}



# ════════════════════════════════════════════════════════════════════
# Top-10 Priorities — Collections / Outstanding (per resource)
# ════════════════════════════════════════════════════════════════════


def _collections_time_range(time_filter: str):
    from datetime import datetime as _dt, timezone as _tz, timedelta as _td
    now = _dt.now(_tz.utc)
    if time_filter == 'this_month':
        start = now.replace(day=1, hour=0, minute=0, second=0, microsecond=0)
        return start, now
    if time_filter == 'last_month':
        first = now.replace(day=1)
        last_month_end = first - _td(days=1)
        start = last_month_end.replace(day=1, hour=0, minute=0, second=0, microsecond=0)
        return start, last_month_end.replace(hour=23, minute=59, second=59)
    if time_filter == 'this_quarter':
        q = (now.month - 1) // 3
        return now.replace(month=q * 3 + 1, day=1, hour=0, minute=0, second=0, microsecond=0), now
    if time_filter == 'this_year':
        return now.replace(month=1, day=1, hour=0, minute=0, second=0, microsecond=0), now
    # lifetime
    return None, None


@router.get("/account-collections")
async def account_collections(
    resource_ids: str = "",
    time_filter: str = "lifetime",
    mode: str = "all",  # "all" | "new" | "existing"
    period_start: Optional[str] = None,  # YYYY-MM-DD
    period_end: Optional[str] = None,    # YYYY-MM-DD
    current_user: dict = Depends(get_current_user),
):
    """Returns accounts assigned to selected resource(s) with the same fields
    shown in the Account Performance report (gross/net invoice totals, bottle
    credit, contribution %, average order, last payment, outstanding, overdue).

    Filters by the account's *onboarded* month/year (the real business
    onboarding period agreed with the customer — NOT the DB record's
    `created_at`):
      - mode='new': accounts whose onboarded_year+onboarded_month falls inside
        [period_start, period_end]
      - mode='existing': accounts onboarded BEFORE period_start's month
      - mode='all' (default): all accounts assigned to the resource(s)
    """
    tenant_id = get_current_tenant_id()
    rids = [r for r in (resource_ids or "").split(",") if r]

    acc_q = {"tenant_id": tenant_id}
    if rids:
        acc_q["assigned_to"] = {"$in": rids}

    # Date filter on account onboarding.
    # NOTE: We use the user-entered `onboarded_year` + `onboarded_month` fields
    # (which represent the *real* business onboarding period agreed with the
    # customer) — NOT `created_at` (which is just the DB-record creation
    # timestamp). Many accounts are back-dated when first imported.
    onboarding_months: Optional[set[tuple[int, int]]] = None
    existing_cutoff: Optional[tuple[int, int]] = None  # (year, month) exclusive
    if mode == "new" and period_start and period_end:
        try:
            ys, ms, _ = period_start.split("-")
            ye, me, _ = period_end.split("-")
            ys, ms, ye, me = int(ys), int(ms), int(ye), int(me)
            onboarding_months = set()
            y, m = ys, ms
            while (y, m) <= (ye, me):
                onboarding_months.add((y, m))
                m += 1
                if m > 12:
                    m, y = 1, y + 1
        except (ValueError, AttributeError):
            onboarding_months = None
    elif mode == "existing" and period_start:
        try:
            ys, ms, _ = period_start.split("-")
            existing_cutoff = (int(ys), int(ms))
        except (ValueError, AttributeError):
            existing_cutoff = None

    accounts = await db.accounts.find(acc_q, {"_id": 0}).to_list(2000)

    # Apply onboarded-month/year filter in Python (small dataset, simple math)
    def _onboarded_pair(a: dict) -> Optional[tuple[int, int]]:
        oy, om = a.get("onboarded_year"), a.get("onboarded_month")
        try:
            return (int(oy), int(om)) if oy and om else None
        except (TypeError, ValueError):
            return None

    if mode == "new" and onboarding_months is not None:
        accounts = [a for a in accounts if _onboarded_pair(a) in onboarding_months]
    elif mode == "existing" and existing_cutoff is not None:
        accounts = [
            a for a in accounts
            if (p := _onboarded_pair(a)) is not None and p < existing_cutoff
        ]

    start_date, end_date = _collections_time_range(time_filter)
    inv_q = {"tenant_id": tenant_id}
    if start_date and end_date:
        inv_q["created_at"] = {"$gte": start_date.isoformat(), "$lte": end_date.isoformat()}
    invoices = await db.invoices.find(inv_q, {"_id": 0}).to_list(20000)

    # Aggregate invoice metrics per account (match by lead_id or fuzzy customer_name)
    inv_agg = {}
    for inv in invoices:
        lead_id = inv.get("lead_id")
        cust_name = (inv.get("customer_name") or "").lower().strip()
        for acc in accounts:
            acc_id = acc.get("account_id") or acc.get("id")
            if not acc_id:
                continue
            acc_lead_id = acc.get("lead_id")
            acc_name = (acc.get("account_name") or "").lower().strip()
            matched = False
            if lead_id and acc_lead_id and lead_id == acc_lead_id:
                matched = True
            elif cust_name and acc_name and (cust_name in acc_name or acc_name in cust_name):
                matched = True
            if matched:
                bucket = inv_agg.setdefault(acc_id, {
                    "gross_total": 0, "net_total": 0, "bottle_credit": 0, "invoice_count": 0,
                })
                bucket["gross_total"] += inv.get("gross_amount", inv.get("total_amount", 0)) or 0
                bucket["net_total"] += inv.get("net_amount", inv.get("total_amount", 0)) or 0
                bucket["bottle_credit"] += inv.get("bottle_credit", 0) or 0
                bucket["invoice_count"] += 1
                break

    # Filtered total for contribution %
    filtered_total_gross = sum(b["gross_total"] for b in inv_agg.values()) or 0

    rows = []
    summary_gross = summary_net = summary_credit = summary_outstanding = summary_overdue = 0
    for acc in accounts:
        acc_id = acc.get("account_id") or acc.get("id")
        if not acc_id:
            continue
        agg = inv_agg.get(acc_id, {"gross_total": 0, "net_total": 0, "bottle_credit": 0, "invoice_count": 0})
        contribution_pct = round((agg["gross_total"] / filtered_total_gross * 100), 2) if filtered_total_gross > 0 else 0
        avg_order = round(agg["gross_total"] / agg["invoice_count"], 2) if agg["invoice_count"] > 0 else 0
        sku_pricing = acc.get("sku_pricing") or []
        estimated_credit = sum((sku.get("return_bottle_credit") or 0) for sku in sku_pricing)
        bottle_credit = agg["bottle_credit"] if agg["bottle_credit"] > 0 else estimated_credit

        outstanding = acc.get("outstanding_balance", 0) or 0
        overdue = acc.get("overdue_amount", 0) or 0
        last_payment_amount = acc.get("last_payment_amount", 0) or 0
        last_payment_date = acc.get("last_payment_date", "")

        rows.append({
            "account_id": acc_id,
            "account_name": acc.get("account_name", "Unknown"),
            "account_type": acc.get("account_type", ""),
            "territory": acc.get("territory", ""),
            "state": acc.get("state", ""),
            "city": acc.get("city", ""),
            "assigned_to": acc.get("assigned_to"),
            "gross_invoice_total": round(agg["gross_total"], 2),
            "net_invoice_total": round(agg["net_total"], 2),
            "bottle_credit": round(bottle_credit, 2),
            "contribution_pct": contribution_pct,
            "average_order_amount": avg_order,
            "outstanding_balance": round(outstanding, 2),
            "overdue_amount": round(overdue, 2),
            "last_payment_amount": round(last_payment_amount, 2),
            "last_payment_date": last_payment_date,
            "invoice_count": agg["invoice_count"],
        })

        summary_gross += agg["gross_total"]
        summary_net += agg["net_total"]
        summary_credit += bottle_credit
        summary_outstanding += outstanding
        summary_overdue += overdue

    # Sort by outstanding desc (most-needs-attention first), then by gross
    rows.sort(key=lambda r: (-(r["outstanding_balance"] or 0), -(r["gross_invoice_total"] or 0)))

    total_invoice_count = sum(r["invoice_count"] for r in rows)
    overall_avg_order = round(summary_gross / total_invoice_count, 2) if total_invoice_count > 0 else 0

    return {
        "time_filter": time_filter,
        "resource_ids": rids,
        "accounts": rows,
        "summary": {
            "account_count": len(rows),
            "total_gross": round(summary_gross, 2),
            "total_net": round(summary_net, 2),
            "total_bottle_credit": round(summary_credit, 2),
            "total_outstanding": round(summary_outstanding, 2),
            "total_overdue": round(summary_overdue, 2),
            "average_order_amount": overall_avg_order,
            "total_invoice_count": total_invoice_count,
        },
    }



# ════════════════════════════════════════════════════════════════════
# Performance Tracker — Section Order (CEO / System Admin reorderable)
# ════════════════════════════════════════════════════════════════════

DEFAULT_SECTION_ORDER = [
    "new_accounts",         # "Accounts Added this Period"
    "case_targets",         # "Volume Targets for Existing Accounts — {Month}"
    "sampling_trials",      # "Sampling / Trials"
    "focus_leads",          # "Top Leads to Focus"
    "next_month_leads",     # "Leads Targeting {NextMonth}"
    "existing_accounts",    # "Existing Accounts"
]

REORDER_ROLES = {"CEO", "System Admin"}


@router.get("/section-order")
async def get_section_order(current_user: dict = Depends(get_current_user)):
    """Return saved section order for the current tenant. Falls back to default when unset."""
    tenant_id = get_current_tenant_id()
    doc = await db.performance_settings.find_one(
        {"tenant_id": tenant_id, "key": "section_order"}, {"_id": 0}
    )
    saved = (doc or {}).get("order") or []
    # Merge: keep saved order for known ids, append any new defaults missing, drop unknowns
    valid = [s for s in saved if s in DEFAULT_SECTION_ORDER]
    for s in DEFAULT_SECTION_ORDER:
        if s not in valid:
            valid.append(s)
    return {"order": valid, "is_default": not saved}


@router.put("/section-order")
async def update_section_order(payload: dict, current_user: dict = Depends(get_current_user)):
    """Upsert the section order for the current tenant. CEO / System Admin only."""
    role = (current_user or {}).get("role") or ""
    if role not in REORDER_ROLES:
        raise HTTPException(status_code=403, detail="Only CEO or System Admin can reorder sections")

    order = payload.get("order") or []
    if not isinstance(order, list) or not order:
        raise HTTPException(status_code=400, detail="order must be a non-empty list")

    # Validate ids
    cleaned = []
    seen = set()
    for s in order:
        if s in DEFAULT_SECTION_ORDER and s not in seen:
            cleaned.append(s)
            seen.add(s)
    # Fill any missing defaults at the end so we never lose a section
    for s in DEFAULT_SECTION_ORDER:
        if s not in seen:
            cleaned.append(s)

    tenant_id = get_current_tenant_id()
    await db.performance_settings.update_one(
        {"tenant_id": tenant_id, "key": "section_order"},
        {
            "$set": {
                "tenant_id": tenant_id,
                "key": "section_order",
                "order": cleaned,
                "updated_at": datetime.now(timezone.utc).isoformat(),
                "updated_by": (current_user or {}).get("id"),
                "updated_by_name": (current_user or {}).get("name"),
            }
        },
        upsert=True,
    )
    return {"order": cleaned, "is_default": False}
