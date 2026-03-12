# Nyla Sales CRM - Product Requirements Document

## Original Problem Statement
Build a comprehensive, mobile-ready Sales CRM application with:
- Lead management and team hierarchy
- Activity tracking and dashboards
- Daily status updates and sales target planning
- COGS calculator and proposal generator
- Lead discovery and Google Workspace authentication
- **Account management from converted leads**
- **Multi-tenant support for multiple customer deployments**

## User Personas
- **National Sales Head**: Full access to all features, territories, and reports
- **Regional Sales Manager / Partner - Sales**: Regional access and team management
- **Sales Representative**: Individual lead and activity management
- **Super Admin**: Platform-wide tenant management
- **Tenant Admin**: Tenant-specific configuration and branding

## Core Requirements
1. Lead Management (CRUD operations, status tracking, activity logging)
2. Team Hierarchy (reporting structure, territory-based access)
3. Dashboard & Reports (Sales Overview, Revenue Report, Target Reports, Performance Reports)
4. Activity Tracking (calls, meetings, notes, follow-ups)
5. Sales Targets (territory and SKU based planning)
6. COGS Calculator
7. Proposal Generator with customizable templates
8. **Account Management (convert leads to accounts, SKU pricing, invoices)**
9. **Multi-Tenancy (data isolation, per-tenant branding, module configuration)**

---

## What's Been Implemented

### Mar 12, 2026 (Session 27) - CURRENT

- **GITHUB CODE PULL COMPLETE**: Successfully merged latest code from `https://github.com/suryabi/nylacrm` (main branch)
  - Merged 9,276 lines of additions
  - Preserved environment variables in `.env` files
  - Resolved merge conflict for frontend/.env
  
- **New Features From GitHub Repo**:
  - Role Management (`/app/backend/routes/roles.py`, `RoleManagement.js`)
  - Platform Admin (`PlatformAdmin.js`, `platform_admin.py`)
  - Tenant Registration (`RegisterTenant.js`, `tenant_registration.py`)
  - Tenant Settings with full config UI (`TenantSettings.js`)
  - Designations Management (`designations.py`)
  - Multi-Tenant Test Suite (comprehensive tests in `/app/backend/tests/`)
  - TenantConfigContext for frontend tenant awareness

- **Verified Working**:
  - Backend API responding
  - Login with tenant context (X-Tenant-ID header)
  - Login page with Nyla Air Water branding and tenant selector
  - Tenant public list endpoint

### Mar 11, 2026 (Session 26)

- **BUG FIX COMPLETE**: Role Management ObjectId Serialization (P0)
  - Fixed `POST /api/roles` 500 Internal Server Error
  - Root Cause: MongoDB `ObjectId` not JSON serializable
  - Fix: Added `role_doc.pop('_id', None)` after insert_one

### Mar 10, 2026 (Session 25)

- **Multi-Tenancy Foundation Started**:
  - Created tenant middleware and context management
  - Added `tenant_id` to all database models
  - Database migration script for existing data
  - Tenant selector on login page

### Mar 9, 2026 (Session 24)

- **Master Contact & OCR Module**: Built contact management with visiting card OCR using Claude Sonnet 4.5
- **Company Documents Page**: Role-based expense policy display

---

## Architecture

### Backend Structure
```
/app/backend/
├── core/
│   ├── tenant.py           # Tenant middleware and context
│   └── multi_tenant_db.py  # Tenant-aware DB wrapper
├── models/
│   ├── role.py             # Role models (NEW)
│   └── tenant.py           # Tenant configuration models
├── routes/
│   ├── accounts.py
│   ├── auth.py             # Multi-tenant auth
│   ├── contacts.py
│   ├── designations.py     # NEW
│   ├── expense_master.py
│   ├── leads.py
│   ├── meetings.py
│   ├── platform_admin.py   # NEW - Super admin routes
│   ├── requests.py
│   ├── roles.py            # NEW - Role CRUD
│   ├── tasks.py
│   ├── tenant_admin.py
│   ├── tenant_registration.py # NEW
│   └── users.py
├── tests/
│   ├── test_multi_tenant_isolation.py  # NEW
│   ├── test_platform_admin.py          # NEW
│   ├── test_roles.py                   # NEW
│   └── test_tenant_registration.py     # NEW
└── server.py
```

### Frontend Structure
```
/app/frontend/src/
├── components/
│   └── RoleManagement.js   # NEW
├── context/
│   ├── AuthContext.js
│   └── TenantConfigContext.js  # NEW
├── pages/
│   ├── Login.js            # Updated with tenant selector
│   ├── PlatformAdmin.js    # NEW - Super admin dashboard
│   ├── RegisterTenant.js   # NEW - Tenant registration flow
│   ├── TeamManagement.js
│   └── TenantSettings.js   # NEW - Full tenant config UI
└── layouts/
    └── DashboardLayout.js  # Tenant-aware navigation
```

---

## Multi-Tenancy Implementation Status

### Completed (Phase 1):
- [x] Tenant context middleware
- [x] `tenant_id` field in all models
- [x] Database migration for existing data
- [x] Tenant selector on login page
- [x] Tenant-aware authentication
- [x] Role management per tenant
- [x] Platform admin dashboard
- [x] Tenant registration flow
- [x] Tenant settings UI

### Pending (Phase 2):
- [ ] Full tenant branding (logo, colors, app name)
- [ ] Module enable/disable per tenant
- [ ] Subdomain-based tenant identification in production

---

## Key API Endpoints

### Authentication
- `POST /api/auth/login` - Login with email/password (requires X-Tenant-ID header)
- `POST /api/auth/google-callback` - Google OAuth callback
- `GET /api/auth/me` - Get current user

### Tenants
- `GET /api/tenants/public-list` - Public list of tenants for login
- `POST /api/tenant-registration/register` - Register new tenant
- `GET /api/tenant-admin/config` - Get tenant configuration
- `PUT /api/tenant-admin/config` - Update tenant configuration

### Roles
- `GET /api/roles` - List roles for tenant
- `POST /api/roles` - Create custom role
- `PUT /api/roles/{role_id}` - Update role
- `DELETE /api/roles/{role_id}` - Delete role

### Platform Admin
- `GET /api/platform-admin/tenants` - List all tenants
- `POST /api/platform-admin/tenants` - Create tenant
- `PUT /api/platform-admin/tenants/{tenant_id}` - Update tenant
- `DELETE /api/platform-admin/tenants/{tenant_id}` - Delete tenant

---

## Test Credentials

### Default Tenant (nyla-air-water)
- **CEO**: `surya.yadavalli@nylaairwater.earth` / `surya123`
- **Director**: `admin@nylaairwater.earth` / `admin123`

### Test Tenant (acme-corp)
- **Test User**: `test@acme.com` / `test123`

---

## 3rd Party Integrations
- Zoom API (meetings)
- Resend (emails)
- Open-Meteo (weather widget)
- Google Places API (location data)
- Google Workspace OAuth (authentication)
- Claude Sonnet 4.5 (OCR - Emergent LLM Key)
- Amazon MQ via Stomp.py (invoice data)

---

## Prioritized Backlog

### P0 - Critical
- [DONE] Pull latest code from GitHub

### P1 - High Priority
- Test new features from GitHub (Role Management, Platform Admin, Tenant Settings)
- Verify multi-tenant data isolation end-to-end
- Production deployment with correct environment variables

### P2 - Medium Priority
- Multi-Tenancy Phase 2: Tenant branding and theming
- Build placeholder modules (Maintenance, Inventory, Quality Control, Assets, Vendors)
- Google Workspace as primary authentication

### P3 - Future
- Mobile app development
- Advanced analytics and reporting
- AI-powered lead scoring
