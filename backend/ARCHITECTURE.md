# Backend Architecture Documentation

## Overview
The Sales CRM backend has been refactored into a modular architecture. This document describes the new structure and migration path.

## Directory Structure

```
backend/
├── server.py              # Main FastAPI application with legacy routes
├── database.py            # MongoDB connection singleton
├── config.py              # Environment configuration
├── deps.py                # Authentication dependencies
├── utils.py               # Shared utility functions
├── models/                # Pydantic models by domain
│   ├── __init__.py
│   ├── user.py            # User, UserCreate, UserLogin
│   ├── lead.py            # Lead, LeadCreate, LeadUpdate
│   ├── account.py         # Account, AccountCreate, AccountUpdate
│   ├── activity.py        # Activity, FollowUp, Comment
│   ├── daily_status.py    # DailyStatus models
│   ├── leave.py           # LeaveRequest models
│   ├── target.py          # TargetPlan, TerritoryTarget, etc.
│   ├── cogs.py            # COGSData models
│   ├── invoice.py         # Invoice models
│   └── user_activity.py   # UserActivity tracking models
├── routes/                # Domain-specific API routers (ACTIVE)
│   ├── __init__.py        # Routes aggregator
│   ├── auth.py            # Authentication (256 lines)
│   ├── leads.py           # Lead CRUD, activities, comments (630 lines)
│   ├── accounts.py        # Account CRUD, invoices (350 lines)
│   ├── targets.py         # Target planning V2 (415 lines)
│   ├── tasks.py           # Tasks CRUD (155 lines)
│   ├── meetings.py        # Meetings with Zoom (245 lines)
│   ├── users.py           # User management (215 lines)
│   ├── requests.py        # Leave/Travel/Budget/Expense (560 lines)
│   └── master_data.py     # SKUs, Locations, Categories (existing)
└── mq_subscriber.py       # ActiveMQ integration
```

## Refactoring Status (March 2026)

### Phase 1: Completed ✅
Created modular routers in `/app/backend/routes/`:

| Router | Lines | Endpoints |
|--------|-------|-----------|
| auth.py | 256 | Login, Register, OAuth, Sessions |
| leads.py | 630 | Lead CRUD, Activities, Comments, Proposals |
| accounts.py | 350 | Account CRUD, Invoices, Logo upload |
| targets.py | 415 | Target Planning V2, Allocations, Dashboard |
| tasks.py | 155 | Tasks CRUD |
| meetings.py | 245 | Meetings CRUD, Zoom integration |
| users.py | 215 | User management, Org chart |
| requests.py | 560 | Leave, Travel, Budget, Expense requests |
| **Total** | **~3,500** | Modular code |

### Routes Still in server.py
The following routes remain in the main server.py file (~11,000 lines):
- Dashboard & Analytics (`/api/dashboard`, `/api/analytics/*`)
- Daily Status (`/api/daily-status/*`)
- COGS Management (`/api/cogs/*`)
- Master Data (`/api/master-skus`, `/api/master/*`)
- Documents (`/api/documents/*`)
- Lead Discovery (`/api/lead-discovery/*`)
- Transport (`/api/transport/*`)
- Invoices (`/api/invoices/*`)
- Sales Revenue (`/api/sales-revenue/*`)
- Reports (`/api/reports/*`)
- Weather & Quotes (`/api/weather`, `/api/quotes/*`)
- Admin (`/api/admin/*`)
- MQ Status (`/api/mq/*`)

### Phase 2: Planned
- Create `routes/dashboard.py` - Dashboard & Analytics
- Create `routes/daily_status.py` - Daily status updates
- Create `routes/documents.py` - Document management
- Create `routes/reports.py` - Performance reports

### Phase 3: Final
- Move remaining routes to modular structure
- Remove duplicate code from server.py
- Full testing and validation

## How It Works

### Route Inclusion
The `routes/__init__.py` aggregates all domain routers:
```python
from routes import routes_router
# routes_router is included in server.py via:
api_router.include_router(routes_router)
```

### Route Priority
FastAPI matches routes in definition order. The modular routes are included BEFORE the legacy routes in server.py, so they take precedence for overlapping paths.

### Adding New Routes
1. Create a new router file in `routes/` (e.g., `routes/dashboard.py`)
2. Define routes using `router = APIRouter()`
3. Import and include in `routes/__init__.py`
4. Remove corresponding routes from server.py

## Usage Notes

### Import Patterns
```python
# Database
from database import db

# Authentication
from deps import get_current_user, hash_password

# Configuration
from config import JWT_SECRET

# To use a router in tests
from routes.leads import router as leads_router
```

### API Organization

| Domain | Prefix | Module |
|--------|--------|--------|
| Authentication | /api/auth | routes/auth.py ✅ |
| Users | /api/users | routes/users.py ✅ |
| Leads | /api/leads | routes/leads.py ✅ |
| Accounts | /api/accounts | routes/accounts.py ✅ |
| Target Planning | /api/target-planning | routes/targets.py ✅ |
| Tasks | /api/tasks | routes/tasks.py ✅ |
| Meetings | /api/meetings | routes/meetings.py ✅ |
| Requests | /api/*-requests | routes/requests.py ✅ |
| Master Data | /api/master-* | routes/master_data.py ✅ |
| Dashboard | /api/dashboard | server.py (pending) |
| Analytics | /api/analytics | server.py (pending) |
| Daily Status | /api/daily-status | server.py (pending) |
| Documents | /api/documents | server.py (pending) |
| Discovery | /api/lead-discovery | server.py (pending) |
