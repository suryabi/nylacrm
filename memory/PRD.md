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

### Feb 23, 2026 (Session 7)
- **FEATURE**: Team Activity Tracking
  - Added "Last Active" column to Team Management table showing when user last performed any action
  - Added "Session Time" column showing time spent in current/latest session
  - Online indicator (green dot) for users active within last 2 minutes
  - Activity Details Dialog (click Eye icon) showing:
    - Session summary (Last Active, Duration, Session Start)
    - Pages Visited with time spent and visit count
    - Actions Performed with count
    - Recent Activity Timeline with timestamps
  - **Backend APIs**:
    - `POST /api/activity/heartbeat` - Records user activity every 30 seconds
    - `GET /api/activity/my-session` - Get current user's session activity
    - `GET /api/activity/user/{user_id}` - Get specific user's last session
    - `GET /api/activity/team` - Get activity summary for all team members
  - **Frontend**:
    - Created `useActivityTracker` hook for automatic heartbeat tracking
    - Updated `TeamManagement.js` with new columns and Activity Dialog
  - Status: VERIFIED via screenshot testing

- **FEATURE**: PWA (Progressive Web App) Support
  - App is now installable on mobile/desktop devices
  - Offline support with service worker caching
  - Push notification capability enabled
  - **Assets created**:
    - `/public/manifest.json` - PWA manifest with app metadata
    - `/public/sw.js` - Service worker with caching strategies
    - `/public/offline.html` - Offline fallback page
    - `/public/icons/` - App icons in multiple sizes (72-512px)
  - Updated `index.html` with PWA meta tags and service worker registration
  - Caching strategies: Cache-first for static assets, Network-first for API calls
  - Status: VERIFIED - manifest, service worker, and icons all serving correctly

- **FIX**: Brand Comparison Calculator - Return Credit Display Update
  - Updated `SalesPortal.js` to show return credit breakdown:
    - "Return Credit / Bottle (₹)" - shows per-bottle return credit based on % bottle returns
    - "Total Return Credit (X bottles)" - shows total return credit for the sample size
  - Added Return Credit Comparison row in summary section:
    - Shows "Extra Return Credit with Nyla/Your Brand" difference
    - Displays both per-bottle and total sample values for each brand
  - Changed default "% Bottle Returns" from 100 to **75** for both brands
  - Calculation: Return Credit/Bottle = (% Bottle Returns / 100) × Bottle Return Credit
  - Status: VERIFIED via screenshot testing

### Feb 23, 2026 (Session 6)
- **FEATURE**: Lead Proposal Section Module
  - Added proposal management within Lead Detail page
  - **Backend APIs**:
    - `GET /api/leads/{lead_id}/proposal` - Get current proposal
    - `POST /api/leads/{lead_id}/proposal` - Upload proposal (replaces existing)
    - `GET /api/leads/{lead_id}/proposal/download` - Download with file data
    - `DELETE /api/leads/{lead_id}/proposal` - Delete (uploader only, pending_review only)
    - `PUT /api/leads/{lead_id}/proposal/review` - Approve/Reject/Request Changes
  - **Features**:
    - Upload PDF or DOC/DOCX proposals (5 MB limit)
    - Status workflow: Pending Review → Changes Requested → Revised → Approved/Rejected
    - Approver roles: CEO, Director, VP, National Sales Head
    - Uploader can delete only when in Pending Review status
    - Download available at all stages
    - Version tracking on re-uploads
    - Review history with comments displayed
    - Single active proposal per lead (new upload replaces old)
  - **UI Components**:
    - Proposal card with file info, status badge, download button
    - Review actions (Approve, Request Changes, Reject) for approvers
    - Review comment input with validation
    - Review history timeline with icons
    - Upload/Replace proposal button
  - Status: VERIFIED - All 16 backend tests passed (100% success rate)

- **FEATURE**: Lead Status Workflow Enhancement
  - Added new status: "Proposal Approved by Customer"
  - Renamed "Proposal Stage" → "Proposal Shared"
  - **Validation Rules**:
    - "Proposal Shared" requires an approved proposal document
    - "Won" can only be set from "Proposal Approved by Customer" status
  - Updated across all pages: LeadDetail, LeadsList, Dashboard, AddEditLead
  - Status flow: ... → Proposal Shared → Proposal Approved by Customer → Won

- **FIX**: BottlePreview production CORS issue
  - Changed API_URL from hardcoded env variable to relative `/api` URL
  - Now works correctly on any domain (preview, production, custom)

- **REMOVED**: Proposals menu item (per user request)

### Feb 22, 2026 (Session 5)
- **FEATURE**: Files & Documents Management Module
  - New `/files-documents` page for centralized document management
  - **Backend APIs**:
    - `GET/POST/PUT/DELETE /api/document-categories` - Category CRUD
    - `GET/POST/PUT/DELETE /api/document-subcategories` - Subcategory CRUD  
    - `GET/POST/DELETE /api/documents` - Document management
    - `POST /api/documents/upload` - File upload with multipart/form-data
  - **Features**:
    - Category & Subcategory organization (hierarchical structure)
    - Key Users (Admin, CEO, Director) can manage categories
    - All users can upload, view, and download documents
    - Delete permission: Admin/CEO/Director + document uploader
    - Supported file types: PDF, DOC, DOCX, PNG, JPG, JPEG, GIF, WEBP
    - 5 MB file size limit per upload
    - Document type icons/thumbnails (PDF icon, Doc icon, Image preview)
    - Search and filter by category/subcategory
    - Breadcrumb navigation for category hierarchy
  - **UI Components**:
    - Manage Categories modal (for key users only)
    - Upload Document modal with category/subcategory selection
    - Document card grid with hover actions (download, delete)
    - Category filter dropdown with subcategory cascade
  - Status: VERIFIED - All 23 backend tests passed (100% success rate)

### Feb 22, 2026 (Session 4)
- **FEATURE**: Bottle Preview Phase 2 Enhancements
  - **Tabbed bottle view**: Added "Air Water Duo" (2 bottles) and "Air Water Single" tabs to switch between bottle images
  - **Rounded Square shape**: Added new logo shape option alongside Original, Circle, and Square
  - **Advanced background removal**: 
    - "Remove White Background" button for quick white/light background removal
    - "Pick Color from Logo" feature with eyedropper-style color selection
    - Tolerance slider (10-100) for fine-tuning color removal sensitivity
    - Color preview with RGB values display
  - Cropper dialog updated with "Rounded" crop shape option (20% corner radius)
  - Updated bottle templates to use actual Air Water product images
  - Status: VERIFIED - All 29 frontend tests passed (100% success rate)

### Feb 20, 2026 (Session 3)
- **FEATURE**: Enhanced Bottle Preview with Logo Editing Tools
  - Added logo cropping with react-easy-crop library
  - Shape changes: Original, Circle, Square options
  - Client-side background removal (threshold-based for white/light backgrounds)
  - Logo resizing with slider (30%-150% scale)
  - **Draggable logo positioning**: Click and drag logo on bottle to reposition
  - Position controls with X/Y coordinates and Reset to Center button
  - Touch support for mobile drag
  - Live preview updates on bottle template
  - Reset Edits and Reset All functionality
  - Download edited logo
  - Save to History integration
  - Updated bottle image to Nyla branded clear glass bottle
  - Status: VERIFIED - All 30 frontend tests passed (100% success rate)

- **FEATURE**: Master SKU List API and SKU Pricing Enhancements
  - Created `/api/master-skus` endpoint returning 14 standardized SKUs with category and unit info
  - Account Detail page: SKU dropdown now populated from master SKU API
  - Lead Detail page: Added "Proposed SKU Pricing" section for pre-sale pricing proposals
  - SKUs include: 20L Premium/Regular, bottle packs, Nyla variants (Silver, Gold, Sparkling), 24 Brand
  - Backend updated: `proposed_sku_pricing` field added to Lead model
  - Status: VERIFIED - All backend (10/10) and frontend (16/16) tests passed

- **FEATURE**: SKU Management Module with Full CRUD
  - New `/sku-management` page with complete SKU catalog management
  - MongoDB-backed storage (`master_skus` collection) - no hardcoded data
  - Full CRUD: Create, Read, Update, Soft-Delete SKUs
  - Features: Search, category filter, show/hide inactive toggle
  - SKUs grouped by category with color-coded badges
  - Reactivate deactivated SKUs functionality
  - Default 14 SKUs seeded on first load
  - All app components (Lead Detail, Account Detail, COGS Calculator) now use master list
  - Role-based access: CEO, Director, VP, National Sales Head only
  - Status: VERIFIED - Backend (20/20) and Frontend (17/17) tests passed

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
│   └── server.py         # FastAPI with MongoDB, Files & Documents APIs
├── frontend/
│   ├── craco.config.js   # Babel fix applied
│   └── src/
│       ├── pages/
│       │   ├── AddEditLead.js      # Lead form with validation
│       │   ├── LeadDetail.js       # Convert to Account button
│       │   ├── AccountsList.js     # Accounts list with pagination
│       │   ├── AccountDetail.js    # Account detail with SKU pricing
│       │   ├── FilesDocuments.js   # NEW: Files & Documents management
│       │   ├── Dashboard.js        # Sales Overview
│       │   ├── SKUPerformance.js   # Live data
│       │   ├── ResourcePerformance.js # Live data
│       │   └── BottlePreview.js    # Logo editing tools
│       ├── utils/
│       │   └── api.js              # filesAPI added
│       └── layouts/
│           └── DashboardLayout.js  # Files & Documents nav added
└── memory/
    └── PRD.md (this file)
```

---

## Prioritized Backlog

### P0 - Critical
1. ~~Lead creation bug~~ ✅ FIXED
2. ~~SKU/Resource Performance dashboards~~ ✅ IMPLEMENTED
3. ~~Convert Lead to Account feature~~ ✅ IMPLEMENTED
4. ~~Bottle Preview Enhancement Phase 1~~ ✅ IMPLEMENTED (cropping, shapes, bg removal, resize)
5. ~~Bottle Preview Enhancement Phase 2~~ ✅ IMPLEMENTED (tabbed bottles, rounded square, color picker bg removal)
6. ~~Files & Documents Module~~ ✅ IMPLEMENTED (categories, subcategories, upload, download, permissions)
7. ~~Brand Comparison Calculator~~ ✅ IMPLEMENTED (return credit per-bottle & total sample display, 75% default bottle return)
8. ~~Team Activity Tracking~~ ✅ IMPLEMENTED (last active, session time, pages visited, actions performed)
9. ~~PWA Support~~ ✅ IMPLEMENTED (installable, offline support, push notifications)

### P1 - High Priority
- Implement Invoices functionality for Accounts
- Partner - Sales role permissions audit (same permissions as Regional Sales Manager)
- Re-implement Grid View for Sales Targets module
- Update Account List Page UI (if user provides requirements)

### P2 - Medium Priority
- User verification for Custom Proposal Template
- Google Workspace authentication as alternative login
- Refactor `/app/backend/server.py` into smaller APIRouter modules

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
