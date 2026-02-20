# Nyla Sales CRM - Product Requirements Document

## Original Problem Statement
Build a comprehensive, mobile-ready Sales CRM application with:
- Lead management and team hierarchy
- Activity tracking and dashboards
- Daily status updates and sales target planning
- COGS calculator and proposal generator
- Lead discovery and Google Workspace authentication
- **Account management from converted leads**

## User Personas
- **National Sales Head**: Full access to all features, territories, and reports
- **Regional Sales Manager / Partner - Sales**: Regional access and team management
- **Sales Representative**: Individual lead and activity management

## Core Requirements
1. Lead Management (CRUD operations, status tracking, activity logging)
2. Team Hierarchy (reporting structure, territory-based access)
3. Dashboard & Reports (Sales Overview, Revenue Report, Target Reports, Performance Reports)
4. Activity Tracking (calls, meetings, notes, follow-ups)
5. Sales Targets (territory and SKU based planning)
6. COGS Calculator
7. Proposal Generator with customizable templates
8. **Account Management (convert leads to accounts, SKU pricing, invoices)**

---

## What's Been Implemented

### Feb 20, 2026 (Session 3)
- **FEATURE**: Enhanced Bottle Preview with Logo Editing Tools
  - Added logo cropping with react-easy-crop library
  - Shape changes: Original, Circle, Square options
  - Client-side background removal (threshold-based for white/light backgrounds)
  - Logo resizing with slider (30%-150% scale)
  - Live preview updates on bottle template
  - Reset Edits and Reset All functionality
  - Download edited logo
  - Save to History integration
  - Status: VERIFIED - All 20 frontend tests passed (100% success rate)

### Feb 19, 2026 (Session 2)
- **FEATURE**: Convert Lead to Account
  - Created Account entity with fields: account_id, account_name, contact info, location, SKU pricing, financial tracking
  - Account ID format: NAME4-CITY-AYY-SEQ (e.g., TOOP-HYD-A26-001)
  - Backend APIs: POST /api/accounts/convert-lead, GET/PUT/DELETE /api/accounts/:id, GET /api/accounts/:id/invoices
  - Frontend: Accounts List page with pagination, search, type filter
  - Frontend: Account Detail page with editable SKU pricing grid
  - LeadDetail page: "Convert to Account" button for won leads, "View Account" button for converted leads
  - Added "Accounts" to sidebar navigation
  - Status: VERIFIED - All 16 backend tests passed, all UI flows working

- **FEATURE**: Account Performance Report
  - Created `/api/reports/account-performance` endpoint with filters: time_filter, territory, state, city, account_type
  - Shows: Account name, Gross Invoice Total, Net Invoice Total, Bottle Credit, Contribution % (dynamic), Last Payment, Outstanding, Overdue
  - Contribution % calculated on-the-fly based on filtered total revenue
  - Added to Dashboard submenu alongside Resource Performance
  - Click on account row navigates to account detail
  - Status: VERIFIED - All 16 backend tests passed, all UI flows working

### Feb 19, 2026 (Session 1)
- **BUG FIX**: Lead creation form now validates region field properly
  - Root cause: Form used `user.territory` ("All India") which backend rejected
  - Fix: Added `getInitialRegion()` validation + frontend required field checks
  - Status: VERIFIED - All tests passed

- **BUG FIX**: Lead Discovery import not saving leads
  - Root cause: Silent failures in import loop, no per-item error handling
  - Fix: Added individual error tracking, accurate success/failure counts
  - Added "Re-import All" feature for updating existing leads
  - Status: VERIFIED - MTR lead imported successfully

- **BUG FIX**: Imported leads not showing in Leads list
  - Root cause: 40+ older leads had NULL `lead_id` (showing as "-" in table)
  - Fix: Ran database backfill script to generate lead_ids for all existing leads
  - Also fixed 3 leads with missing city field
  - Status: VERIFIED - All 59 leads now have proper Lead IDs

- **BUG FIX**: "Session expired" error during Lead Discovery import
  - Root cause: Redundant /api/auth/me call that could fail
  - Fix: Use AuthContext for user data, use centralized leadsAPI
  - Status: VERIFIED

- **FEATURE**: Implemented Server-Side Pagination
  - Root cause: Previous limit of 100 leads was not scalable
  - Fix: Full server-side pagination with PaginatedLeadsResponse model
  - Backend returns total count, current page, and page_size
  - Frontend fetches only current page with debounced search
  - Status: VERIFIED - Works with 63 leads across 3 pages

- **FEATURE**: Implemented Backend APIs for Performance Dashboards
  - Created `/api/reports/sku-performance` endpoint
  - Created `/api/reports/resource-performance` endpoint
  - Status: VERIFIED - Both dashboards showing real data

### Previous Session (from handoff)
- Resolved critical Babel/dev server error (craco.config.js fix)
- Dashboard navigation overhaul (single dropdown menu)
- Created SKU Performance and Resource Performance pages
- Redesigned Sales Overview page (chart-less, card-based)
- Standardized SKUs and Partner-Sales role logic
- Fixed CORS configuration for deployment

---

## Current Architecture
```
/app/
├── backend/
│   └── server.py         # FastAPI with MongoDB, Account models & APIs
├── frontend/
│   ├── craco.config.js   # Babel fix applied
│   └── src/
│       ├── pages/
│       │   ├── AddEditLead.js      # Lead form with validation
│       │   ├── LeadDetail.js       # Convert to Account button
│       │   ├── AccountsList.js     # NEW: Accounts list with pagination
│       │   ├── AccountDetail.js    # NEW: Account detail with SKU pricing
│       │   ├── Dashboard.js        # Sales Overview
│       │   ├── SKUPerformance.js   # Live data
│       │   ├── ResourcePerformance.js # Live data
│       │   └── BottlePreview.js    # UPDATED: Logo editing tools
│       ├── utils/
│       │   └── api.js              # accountsAPI added
│       └── layouts/
│           └── DashboardLayout.js  # Accounts nav added
└── memory/
    └── PRD.md (this file)
```

---

## Prioritized Backlog

### P0 - Critical
1. ~~Lead creation bug~~ ✅ FIXED
2. ~~SKU/Resource Performance dashboards~~ ✅ IMPLEMENTED
3. ~~Convert Lead to Account feature~~ ✅ IMPLEMENTED
4. ~~Bottle Preview Enhancement~~ ✅ IMPLEMENTED (cropping, shapes, bg removal, resize)

### P1 - High Priority
- Implement Invoices functionality for Accounts
- Update Account List Page UI (if user provides requirements)
- Re-implement Grid View for Sales Targets module
- Partner - Sales role permissions audit

### P2 - Medium Priority
- User verification for Custom Proposal Template
- Google Workspace authentication as alternative login

### P3 - Low Priority/Future
- Additional report customizations
- Mobile responsiveness improvements

---

## Test Credentials
- **Email**: admin@nylaairwater.earth
- **Password**: admin123

## 3rd Party Integrations
- Claude Sonnet 4.5 (Emergent LLM Key) - Text revision
- Google Places API - Lead Discovery
- Google Workspace OAuth - Authentication (pending)
- ActiveMQ - Invoice processing
