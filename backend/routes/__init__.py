"""
Routes package - Domain-specific API routers

This module aggregates all domain routers and creates a unified routes_router
that can be included in the main FastAPI app.
"""
from fastapi import APIRouter

# Create main routes router (aggregator)
routes_router = APIRouter()

# Import domain routers
from .auth import router as auth_router
from .leads import router as leads_router
from .accounts import router as accounts_router
from .targets import router as targets_router
from .tasks import router as tasks_router
from .meetings import router as meetings_router
from .users import router as users_router
from .requests import router as requests_router
from .expense_master import router as expense_master_router
from .contacts import router as contacts_router
from .tenant_admin import router as tenant_admin_router
from .tenant_registration import router as tenant_registration_router
from .platform_admin import router as platform_admin_router
from .roles import router as roles_router
from .designations import router as designations_router
from .ai_assistant import router as ai_assistant_router
from .scoring import router as scoring_router
from .invoices import router as invoices_router
from .distributors import router as distributors_router
from .task_management import router as task_management_router
from .return_reasons import router as return_reasons_router

# Include routers with their prefixes
# Note: These are included WITHOUT prefix because the main server.py adds /api prefix
routes_router.include_router(auth_router, prefix="/auth", tags=["Authentication"])
routes_router.include_router(leads_router, prefix="/leads", tags=["Leads"])
routes_router.include_router(accounts_router, prefix="/accounts", tags=["Accounts"])
routes_router.include_router(targets_router, prefix="/target-planning", tags=["Target Planning"])
routes_router.include_router(tasks_router, prefix="/tasks", tags=["Tasks"])
routes_router.include_router(meetings_router, prefix="/meetings", tags=["Meetings"])
routes_router.include_router(users_router, prefix="/users", tags=["Users"])
routes_router.include_router(expense_master_router, tags=["Expense Master"])
routes_router.include_router(contacts_router, tags=["Contacts"])
routes_router.include_router(tenant_admin_router, tags=["Tenant Administration"])
routes_router.include_router(tenant_registration_router, prefix="/tenants", tags=["Tenant Registration"])
routes_router.include_router(platform_admin_router, prefix="/platform-admin", tags=["Platform Administration"])
routes_router.include_router(roles_router, prefix="/roles", tags=["Role Management"])
routes_router.include_router(designations_router, prefix="/designations", tags=["Designation Management"])

# Requests routes are at root level (leave-requests, travel-requests, etc.)
routes_router.include_router(requests_router, tags=["Requests"])

# AI Assistant
routes_router.include_router(ai_assistant_router, prefix="/ai", tags=["AI Assistant"])

# Lead Scoring Model
routes_router.include_router(scoring_router, prefix="/scoring", tags=["Lead Scoring"])

# Invoices Management
routes_router.include_router(invoices_router, prefix="/invoices", tags=["Invoices"])

# Distributor Management
routes_router.include_router(distributors_router, prefix="/distributors", tags=["Distributors"])

# Task Management (GitHub-style Issue Tracker)
routes_router.include_router(task_management_router, prefix="/task-management", tags=["Task Management"])

# Return Reasons Master
routes_router.include_router(return_reasons_router, prefix="/return-reasons", tags=["Return Reasons"])

__all__ = ['routes_router']
