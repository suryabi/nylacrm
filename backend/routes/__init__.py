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
from .scoring import router as scoring_router
from .invoices import router as invoices_router
from .distributors import router as distributors_router
from .task_management import router as task_management_router
from .return_reasons import router as return_reasons_router
from .customer_returns import router as customer_returns_router
from .customer_returns_list import router as customer_returns_list_router
from .credit_notes import router as credit_notes_router
from .factory_returns import router as factory_returns_router
from .performance import router as performance_router
from .investor import router as investor_router
from .marketing import router as marketing_router
from .meeting_minutes import router as meeting_minutes_router
from .production_qc import router as production_qc_router
from .cost_cards import router as cost_cards_router
from .target_planning import router as target_planning_router
from .proxies import router as proxies_router
from .master_locations import router as master_locations_router
from .reports import router as reports_router
from .daily_status import router as daily_status_router
from .analytics import router as analytics_router
from .bottle_preview import router as bottle_preview_router
from .cogs_components import router as cogs_components_router
from .api_keys import router as api_keys_router
from .personal_calendar import router as personal_calendar_router
from .user_preferences import router as user_preferences_router
from .knowledge_base import router as knowledge_base_router
from .distributor_portal import router as distributor_portal_router
from .distributor_contacts import router as distributor_contacts_router
from .zoho_books import router as zoho_books_router
from .manual_stock_entries import router as manual_stock_router
from .distributor_chat import router as distributor_chat_router

# Include routers with their prefixes
# Note: These are included WITHOUT prefix because the main server.py adds /api prefix
routes_router.include_router(auth_router, prefix="/auth", tags=["Authentication"])
routes_router.include_router(leads_router, prefix="/leads", tags=["Leads"])
routes_router.include_router(accounts_router, prefix="/accounts", tags=["Accounts"])
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

# Customer Returns (under distributors)
routes_router.include_router(customer_returns_router, prefix="/distributors", tags=["Customer Returns"])

# Tenant-wide Customer Returns listing (Sales/Distribution/Production sidebar)
routes_router.include_router(customer_returns_list_router, prefix="/customer-returns", tags=["Customer Returns"])

# Credit Notes (under distributors)
routes_router.include_router(credit_notes_router, prefix="/distributors", tags=["Credit Notes"])

routes_router.include_router(factory_returns_router, prefix="/distributors", tags=["Factory Returns"])

# Performance Tracking
routes_router.include_router(performance_router, prefix="/performance", tags=["Performance Tracking"])

# Investor Module
routes_router.include_router(investor_router, prefix="/investor", tags=["Investor Module"])

# Marketing Module
routes_router.include_router(marketing_router, prefix="/marketing", tags=["Marketing Module"])

# Meeting Minutes Module
routes_router.include_router(meeting_minutes_router, tags=["Meeting Minutes"])

# Production QC Module
routes_router.include_router(production_qc_router, tags=["Production QC"])

# Cost Cards Module
routes_router.include_router(cost_cards_router, prefix="/cost-cards", tags=["Cost Cards"])

# Target Planning (V2)
routes_router.include_router(target_planning_router, tags=["Target Planning V2"])

# External Proxies (quotes, weather)
routes_router.include_router(proxies_router, tags=["Proxies"])

# Master Locations (Territories, States, Cities)
routes_router.include_router(master_locations_router, tags=["Master Locations"])

# Performance Reports
routes_router.include_router(reports_router, tags=["Reports"])

# Daily Status
routes_router.include_router(daily_status_router, tags=["Daily Status"])

# Analytics
routes_router.include_router(analytics_router, tags=["Analytics"])

# Bottle Preview
routes_router.include_router(bottle_preview_router, tags=["Bottle Preview"])

# COGS Components Master
routes_router.include_router(cogs_components_router, prefix="/master/cogs-components", tags=["COGS Components"])

# API Keys for external integrations
routes_router.include_router(api_keys_router, prefix="/api-keys", tags=["API Keys"])

# Personal Calendar (CRM meetings + Google Calendar sync)
routes_router.include_router(personal_calendar_router, tags=["Personal Calendar"])

# Per-user preferences (home widget order, etc.)
routes_router.include_router(user_preferences_router, tags=["User Preferences"])

# Marketing Requests — independent lifecycle module (Sales → Marketing → Delivery)
from .marketing_requests import router as marketing_requests_router
from .marketing_request_masters import (
    departments_router as master_departments_router,
    types_router as marketing_request_types_router,
    statuses_router as marketing_request_statuses_router,
)
routes_router.include_router(marketing_requests_router, prefix="/marketing-requests", tags=["Marketing Requests"])
routes_router.include_router(master_departments_router, prefix="/master-departments", tags=["Master Departments"])
routes_router.include_router(marketing_request_types_router, prefix="/marketing-request-types", tags=["Marketing Request Types"])
routes_router.include_router(marketing_request_statuses_router, prefix="/marketing-request-statuses", tags=["Marketing Request Statuses"])

# Knowledge Base — "Ask Nyla" (admin uploads docs, all users can ask questions)
routes_router.include_router(knowledge_base_router, tags=["Knowledge Base"])

# Distributor Self-Service Portal (welcome dashboard for Distributor-role users)
routes_router.include_router(distributor_portal_router, prefix="/distributor-portal", tags=["Distributor Portal"])

# Distributor Multi-Contact CRUD (with optional portal-access provisioning)
routes_router.include_router(distributor_contacts_router, prefix="/distributors", tags=["Distributor Contacts"])

# Zoho Books integration (OAuth, SKU mapping, invoice push)
routes_router.include_router(zoho_books_router, tags=["Zoho Books"])

# Manual stock entries (self-managed distributors only)
routes_router.include_router(manual_stock_router, prefix="/distributors", tags=["Manual Stock"])

# Distributor ↔ Supplier chat
routes_router.include_router(distributor_chat_router, tags=["Distributor Chat"])

# Admin → Fleet (Vehicles & Drivers) — independent CRUD
from .admin_vehicles import router as admin_vehicles_router
from .admin_drivers import router as admin_drivers_router
routes_router.include_router(admin_vehicles_router, prefix="/admin/vehicles", tags=["Admin · Vehicles"])
routes_router.include_router(admin_drivers_router, prefix="/admin/drivers", tags=["Admin · Drivers"])

__all__ = ['routes_router']
