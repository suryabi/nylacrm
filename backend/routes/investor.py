"""
Investor Module - Annual Business Plan & Monthly Updates
Provides endpoints for managing investor-facing financial data.
Auto-computes revenue/COGS from CRM data with manual override support.
"""

from fastapi import APIRouter, Depends, HTTPException
from datetime import datetime, timezone
from deps import get_current_user
from core.tenant import get_current_tenant_id
from database import db
import uuid

router = APIRouter()

EDITOR_ROLES = ['CEO', 'Director', 'Admin']

def check_editor(user):
    if user.get('role') not in EDITOR_ROLES:
        raise HTTPException(status_code=403, detail="Only CEO, Director, or Admin can edit investor data")


# ---- Auto-Compute Helpers ----
async def compute_revenue_data(tenant_id: str, fy_start: str, fy_end: str):
    """Auto-compute revenue and customer metrics from CRM data."""
    pipeline = [
        {"$match": {"tenant_id": tenant_id, "invoice_date": {"$gte": fy_start, "$lt": fy_end}}},
        {"$group": {"_id": None, "total_revenue": {"$sum": "$net_invoice_value"}, "gross_revenue": {"$sum": "$gross_invoice_value"}, "count": {"$sum": 1}}}
    ]
    result = await db.invoices.aggregate(pipeline).to_list(1)
    revenue = result[0] if result else {"total_revenue": 0, "gross_revenue": 0, "count": 0}

    # Previous FY revenue
    prev_start = str(int(fy_start[:4]) - 1) + fy_start[4:]
    prev_end = str(int(fy_end[:4]) - 1) + fy_end[4:]
    prev_result = await db.invoices.aggregate([
        {"$match": {"tenant_id": tenant_id, "invoice_date": {"$gte": prev_start, "$lt": prev_end}}},
        {"$group": {"_id": None, "total_revenue": {"$sum": "$net_invoice_value"}, "gross_revenue": {"$sum": "$gross_invoice_value"}}}
    ]).to_list(1)
    prev_revenue = prev_result[0] if prev_result else {"total_revenue": 0, "gross_revenue": 0}

    # Customer counts
    total_accounts = await db.accounts.count_documents({"tenant_id": tenant_id})
    new_accounts_fy = await db.accounts.count_documents({
        "tenant_id": tenant_id,
        "created_at": {"$gte": fy_start, "$lt": fy_end}
    })

    # COGS from cogs_data
    cogs_docs = await db.cogs_data.find({"tenant_id": tenant_id, "total_cogs": {"$exists": True}}, {"_id": 0, "total_cogs": 1}).to_list(1000)
    avg_cogs_per_sku = 0
    if cogs_docs:
        total_cogs = sum(d.get("total_cogs", 0) for d in cogs_docs)
        avg_cogs_per_sku = round(total_cogs / len(cogs_docs), 2) if cogs_docs else 0

    # Outstanding
    outstanding_result = await db.invoices.aggregate([
        {"$match": {"tenant_id": tenant_id, "outstanding": {"$gt": 0}}},
        {"$group": {"_id": None, "total": {"$sum": "$outstanding"}}}
    ]).to_list(1)
    total_outstanding = outstanding_result[0]["total"] if outstanding_result else 0

    return {
        "revenue": revenue.get("total_revenue", 0),
        "gross_revenue": revenue.get("gross_revenue", 0),
        "prev_fy_revenue": prev_revenue.get("total_revenue", 0),
        "invoice_count": revenue.get("count", 0),
        "total_accounts": total_accounts,
        "new_accounts_fy": new_accounts_fy,
        "total_outstanding": total_outstanding,
        "avg_cogs_per_sku": avg_cogs_per_sku,
    }


async def compute_monthly_actuals(tenant_id: str, year: int, month: int):
    """Compute monthly P&L actuals from invoices."""
    month_start = f"{year}-{month:02d}-01"
    if month == 12:
        month_end = f"{year + 1}-01-01"
    else:
        month_end = f"{year}-{month + 1:02d}-01"

    rev_result = await db.invoices.aggregate([
        {"$match": {"tenant_id": tenant_id, "invoice_date": {"$gte": month_start, "$lt": month_end}}},
        {"$group": {"_id": None, "net": {"$sum": "$net_invoice_value"}, "gross": {"$sum": "$gross_invoice_value"}}}
    ]).to_list(1)
    rev = rev_result[0] if rev_result else {"net": 0, "gross": 0}

    new_customers = await db.accounts.count_documents({
        "tenant_id": tenant_id,
        "created_at": {"$gte": month_start, "$lt": month_end}
    })

    orders_won = await db.leads.count_documents({
        "tenant_id": tenant_id, "status": "won",
        "updated_at": {"$gte": month_start, "$lt": month_end}
    })

    return {
        "revenue": rev.get("net", 0),
        "gross_revenue": rev.get("gross", 0),
        "new_customers": new_customers,
        "orders_won": orders_won,
    }


# ---- Annual Plan Endpoints ----

@router.get("/plan")
async def get_plan(fy: str = None, current_user: dict = Depends(get_current_user)):
    """Get the annual business plan. Defaults to current FY."""
    tenant_id = get_current_tenant_id()
    now = datetime.now(timezone.utc)
    if not fy:
        fy = f"FY{now.year}-{now.year + 1}" if now.month >= 4 else f"FY{now.year - 1}-{now.year}"

    plan = await db.investor_plans.find_one(
        {"tenant_id": tenant_id, "fy": fy}, {"_id": 0}
    )

    fy_year = int(fy[2:6])
    fy_start = f"{fy_year}-04-01"
    fy_end = f"{fy_year + 1}-04-01"
    auto = await compute_revenue_data(tenant_id, fy_start, fy_end)

    if not plan:
        plan = {
            "id": str(uuid.uuid4()),
            "tenant_id": tenant_id,
            "fy": fy,
            "summary": {
                "revenue": {"fy_target": 0, "last_fy_actual": auto["prev_fy_revenue"], "notes": ""},
                "gross_margin_pct": {"fy_target": 0, "last_fy_actual": 0, "notes": ""},
                "ebitda": {"fy_target": 0, "last_fy_actual": 0, "notes": ""},
                "net_profit": {"fy_target": 0, "last_fy_actual": 0, "notes": ""},
                "cash_balance": {"fy_target": 0, "last_fy_actual": 0, "notes": ""},
                "key_customers_count": {"fy_target": 0, "last_fy_actual": auto["total_accounts"], "notes": ""},
                "new_customers_target": {"fy_target": 0, "last_fy_actual": auto["new_accounts_fy"], "notes": ""},
            },
            "revenue_buildup": [
                {"stream": "Existing Business", "fy_target": 0, "pct_of_total": 0, "growth_drivers": "", "notes": ""},
                {"stream": "New Customers", "fy_target": 0, "pct_of_total": 0, "growth_drivers": "", "notes": ""},
                {"stream": "New Products / New Markets", "fy_target": 0, "pct_of_total": 0, "growth_drivers": "", "notes": ""},
                {"stream": "Strategic / One-time", "fy_target": 0, "pct_of_total": 0, "growth_drivers": "", "notes": ""},
            ],
            "pnl": {
                "revenue": {"fy_target": 0, "last_fy_actual": auto["prev_fy_revenue"]},
                "cogs": {"fy_target": 0, "last_fy_actual": 0},
                "gross_profit": {"fy_target": 0, "last_fy_actual": 0},
                "employee_cost": {"fy_target": 0, "last_fy_actual": 0},
                "selling_admin": {"fy_target": 0, "last_fy_actual": 0},
                "other_overheads": {"fy_target": 0, "last_fy_actual": 0},
                "ebitda": {"fy_target": 0, "last_fy_actual": 0},
                "interest": {"fy_target": 0, "last_fy_actual": 0},
                "depreciation": {"fy_target": 0, "last_fy_actual": 0},
                "tax": {"fy_target": 0, "last_fy_actual": 0},
                "net_profit": {"fy_target": 0, "last_fy_actual": 0},
            },
            "priorities": ["", "", "", "", ""],
            "risks": ["", "", "", "", ""],
            "support": {
                "strategy": "", "business_development": "", "hiring_leadership": "",
                "fundraising_banking": "", "partnerships": "", "other": ""
            },
            "created_at": datetime.now(timezone.utc).isoformat(),
            "updated_at": datetime.now(timezone.utc).isoformat(),
        }

    return {"plan": plan, "auto_computed": auto, "fy": fy}


@router.put("/plan")
async def update_plan(data: dict, current_user: dict = Depends(get_current_user)):
    """Update the annual business plan. CEO/Director/Admin only."""
    check_editor(current_user)
    tenant_id = get_current_tenant_id()
    fy = data.get("fy")
    if not fy:
        raise HTTPException(status_code=400, detail="FY is required")

    plan_data = data.get("plan", {})
    plan_data["tenant_id"] = tenant_id
    plan_data["fy"] = fy
    plan_data["updated_at"] = datetime.now(timezone.utc).isoformat()
    plan_data["updated_by"] = current_user.get("id")

    existing = await db.investor_plans.find_one({"tenant_id": tenant_id, "fy": fy})
    if existing:
        await db.investor_plans.update_one(
            {"tenant_id": tenant_id, "fy": fy},
            {"$set": plan_data}
        )
    else:
        plan_data["id"] = str(uuid.uuid4())
        plan_data["created_at"] = datetime.now(timezone.utc).isoformat()
        await db.investor_plans.insert_one(plan_data)

    return {"message": "Plan saved", "fy": fy}


# ---- Monthly Update Endpoints ----

@router.get("/monthly/{year}/{month}")
async def get_monthly_update(year: int, month: int, current_user: dict = Depends(get_current_user)):
    """Get monthly update with auto-computed actuals and target from plan."""
    tenant_id = get_current_tenant_id()

    saved = await db.investor_monthly.find_one(
        {"tenant_id": tenant_id, "year": year, "month": month}, {"_id": 0}
    )

    actuals = await compute_monthly_actuals(tenant_id, year, month)

    fy = f"FY{year}-{year + 1}" if month >= 4 else f"FY{year - 1}-{year}"
    plan = await db.investor_plans.find_one(
        {"tenant_id": tenant_id, "fy": fy}, {"_id": 0, "pnl": 1, "summary": 1}
    )

    monthly_targets = {}
    if plan and plan.get("pnl"):
        for key, val in plan["pnl"].items():
            monthly_targets[key] = round(val.get("fy_target", 0) / 12, 2)

    if not saved:
        saved = {
            "id": str(uuid.uuid4()),
            "tenant_id": tenant_id,
            "year": year,
            "month": month,
            "pnl_overrides": {},
            "new_customers_bd": [],
            "orders_won": [],
            "updates": [],
            "created_at": datetime.now(timezone.utc).isoformat(),
        }

    return {
        "monthly": saved,
        "actuals": actuals,
        "targets": monthly_targets,
        "fy": fy,
    }


@router.put("/monthly/{year}/{month}")
async def update_monthly(year: int, month: int, data: dict, current_user: dict = Depends(get_current_user)):
    """Update monthly data. CEO/Director/Admin only."""
    check_editor(current_user)
    tenant_id = get_current_tenant_id()

    update_data = {
        "tenant_id": tenant_id,
        "year": year,
        "month": month,
        "pnl_overrides": data.get("pnl_overrides", {}),
        "new_customers_bd": data.get("new_customers_bd", []),
        "orders_won": data.get("orders_won", []),
        "updates": data.get("updates", []),
        "updated_at": datetime.now(timezone.utc).isoformat(),
        "updated_by": current_user.get("id"),
    }

    existing = await db.investor_monthly.find_one({"tenant_id": tenant_id, "year": year, "month": month})
    if existing:
        await db.investor_monthly.update_one(
            {"tenant_id": tenant_id, "year": year, "month": month},
            {"$set": update_data}
        )
    else:
        update_data["id"] = str(uuid.uuid4())
        update_data["created_at"] = datetime.now(timezone.utc).isoformat()
        await db.investor_monthly.insert_one(update_data)

    return {"message": "Monthly update saved"}


# ---- Comments ----

@router.get("/comments")
async def get_comments(section: str = None, fy: str = None, year: int = None, month: int = None, current_user: dict = Depends(get_current_user)):
    """Get comments for a section."""
    tenant_id = get_current_tenant_id()
    query = {"tenant_id": tenant_id}
    if section:
        query["section"] = section
    if fy:
        query["fy"] = fy
    if year:
        query["year"] = year
    if month:
        query["month"] = month

    comments = await db.investor_comments.find(query, {"_id": 0}).sort("created_at", -1).to_list(200)
    return comments


@router.post("/comments")
async def add_comment(data: dict, current_user: dict = Depends(get_current_user)):
    """Add a comment to a section. Any role can comment."""
    tenant_id = get_current_tenant_id()
    comment = {
        "id": str(uuid.uuid4()),
        "tenant_id": tenant_id,
        "section": data.get("section", ""),
        "fy": data.get("fy"),
        "year": data.get("year"),
        "month": data.get("month"),
        "field": data.get("field"),
        "text": data.get("text", ""),
        "author_id": current_user.get("id"),
        "author_name": current_user.get("name", ""),
        "author_role": current_user.get("role", ""),
        "created_at": datetime.now(timezone.utc).isoformat(),
    }
    await db.investor_comments.insert_one(comment)
    comment.pop("_id", None)
    return comment


@router.delete("/comments/{comment_id}")
async def delete_comment(comment_id: str, current_user: dict = Depends(get_current_user)):
    """Delete a comment. Only the author or Admin can delete."""
    tenant_id = get_current_tenant_id()
    comment = await db.investor_comments.find_one({"id": comment_id, "tenant_id": tenant_id})
    if not comment:
        raise HTTPException(status_code=404, detail="Comment not found")
    if comment.get("author_id") != current_user.get("id") and current_user.get("role") not in EDITOR_ROLES:
        raise HTTPException(status_code=403, detail="Cannot delete this comment")
    await db.investor_comments.delete_one({"id": comment_id})
    return {"message": "Comment deleted"}
