# Backend Architecture Documentation

## Overview
The Sales CRM backend has been refactored into a modular architecture. This document describes the new structure and migration path.

## Directory Structure

```
backend/
├── server.py              # Main FastAPI application (monolith - being migrated)
├── server_backup.py       # Backup of original server.py
├── server_modular.py      # New modular entry point (for future use)
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
├── routes/                # API route modules
│   ├── __init__.py
│   ├── auth.py            # Authentication routes
│   └── master_data.py     # SKUs, Locations, Categories
└── mq_subscriber.py       # ActiveMQ integration
```

## Module Descriptions

### database.py
Single source of truth for MongoDB connection.
```python
from database import db, client, get_db
```

### config.py
Environment configuration (JWT, API keys).
```python
from config import JWT_SECRET, JWT_ALGORITHM, JWT_EXPIRATION_HOURS
```

### deps.py
Authentication and authorization utilities.
```python
from deps import get_current_user, hash_password, verify_password, create_access_token
```

### utils.py
Shared utility functions.
```python
from utils import generate_lead_id, generate_account_id
```

## Route Modules (routes/)

### auth.py
- POST /api/auth/register
- POST /api/auth/login
- POST /api/auth/logout
- GET /api/auth/me
- POST /api/auth/google-callback
- POST /api/auth/google-session

### master_data.py
- GET/POST/PUT/DELETE /api/master-skus
- GET /api/sku-categories
- GET /api/master-locations
- GET /api/master-locations/flat
- POST/PUT/DELETE /api/master-locations/territories
- POST/PUT/DELETE /api/master-locations/states
- POST/PUT/DELETE /api/master-locations/cities

## Migration Plan

### Phase 1 (Complete)
- Created modular structure (database.py, config.py, deps.py, utils.py)
- Created model files in models/
- Created route modules for auth and master_data

### Phase 2 (Planned)
- Create routes/leads.py - Lead CRUD and proposals
- Create routes/accounts.py - Account CRUD and contracts
- Create routes/activities.py - Activities, comments, follow-ups

### Phase 3 (Planned)
- Create routes/daily_status.py - Daily status updates
- Create routes/analytics.py - Dashboard and reports
- Create routes/targets.py - Sales targets and plans

### Phase 4 (Planned)
- Create routes/documents.py - Document management
- Create routes/discovery.py - Lead discovery and transport
- Create routes/leave.py - Leave requests

### Phase 5 (Final)
- Switch server.py to use server_modular.py structure
- Full testing and validation
- Remove deprecated code

## Usage Notes

### Current State
The application currently runs from `server.py` which contains all routes in a single file (~7000 lines). The modular files have been created but are not yet actively used.

### To Use Modular Imports
```python
# Instead of defining models in server.py, import from models/
from models.user import User, UserCreate, UserLogin
from models.lead import Lead, LeadCreate, LeadUpdate

# Instead of defining auth functions in server.py, import from deps
from deps import get_current_user, hash_password

# Instead of defining db connection in server.py, import from database
from database import db
```

## API Organization

| Domain | Prefix | Module |
|--------|--------|--------|
| Authentication | /api/auth | routes/auth.py |
| Users | /api/users | routes/users.py (planned) |
| Leads | /api/leads | routes/leads.py (planned) |
| Accounts | /api/accounts | routes/accounts.py (planned) |
| Activities | /api/activities | routes/activities.py (planned) |
| Daily Status | /api/daily-status | routes/daily_status.py (planned) |
| Analytics | /api/analytics | routes/analytics.py (planned) |
| Targets | /api/target-plans | routes/targets.py (planned) |
| Master Data | /api/master-* | routes/master_data.py |
| Documents | /api/documents | routes/documents.py (planned) |
| Discovery | /api/lead-discovery | routes/discovery.py (planned) |
| Leave | /api/leave-requests | routes/leave.py (planned) |
