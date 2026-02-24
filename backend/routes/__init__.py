"""
Routes package - Domain-specific API routers
"""
from fastapi import APIRouter

# Create main routes router
routes_router = APIRouter()

# Import and include domain routers (add as they're created)
# from .auth import router as auth_router
# from .leads import router as leads_router
# from .accounts import router as accounts_router
# from .activities import router as activities_router
# from .daily_status import router as daily_status_router
# from .analytics import router as analytics_router
# from .targets import router as targets_router
# from .master_data import router as master_data_router
# from .discovery import router as discovery_router
# from .documents import router as documents_router
# from .leave import router as leave_router

# Include routers (uncomment as modules are created)
# routes_router.include_router(auth_router, prefix="/auth", tags=["Authentication"])
# routes_router.include_router(leads_router, prefix="/leads", tags=["Leads"])
# routes_router.include_router(accounts_router, prefix="/accounts", tags=["Accounts"])
