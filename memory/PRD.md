# Nyla Sales CRM - Product Requirements Document

## Original Problem Statement
Build a comprehensive, mobile-ready Sales CRM application with multi-tenancy support.

## Current Session Updates (Dec 2025)

### Lead Scoring Quadrant Metric Bar (Dec 2025) - NEW
- **Feature**: Added a metric bar at the top of the Leads listing page with selectable quadrant tiles
- **Quadrant Tiles**: Stars (amber), Showcase (purple), Plough Horses (blue), Puzzles (slate), Unscored (gray)
- **Each Tile Shows**:
  - Number of leads in that category
  - Total opportunity volume (bottles/month)
  - Total estimated value (₹)
- **Behavior**:
  - No default selection on page load
  - Multi-select: users can click multiple tiles to filter
  - Works together with existing dropdown filters (status, territory, city, etc.)
  - Clear Selection button to reset quadrant filter
- **Backend Changes**:
  - New endpoint: `GET /api/scoring/quadrant-metrics`
  - Updated: `GET /api/leads` now accepts `quadrant` parameter (comma-separated, supports "unscored")
- **Files Modified**:
  - `/app/backend/routes/scoring.py` - Added quadrant-metrics endpoint
  - `/app/backend/routes/leads.py` - Added quadrant filter parameter
  - `/app/frontend/src/pages/LeadsList.js` - Added metric bar UI and state management

### Lead Scoring Model in Role Permissions (Dec 2025)
- **Feature**: Added "Lead Scoring Model" to the role permissions system
- **Location**: Under "Tools" category in Role Management
- **Files Modified**:
  - `/app/backend/models/role.py` - Added to DEFAULT_MODULE_PERMISSIONS, MODULE_CATEGORIES, MODULE_LABELS, MANAGER_PERMISSIONS

### Bug Fixes (Dec 2025)
- Fixed `DESIGNATIONS is not defined` error in TeamManagement.js user edit form
- Debug endpoints cleanup completed - all `/api/debug/*` endpoints removed

---

## Previous Session Updates (Mar 15, 2026)

### Lead Group Feature (Related Leads)
- **Feature**: Link related leads together (same owner, franchise locations, corporate-branches)
- **Two Relationship Types**:
  - **Parent-Child**: Corporate → Branches hierarchy
  - **Peer Links**: Bi-directional links for same owner outlets
- **Link Management UI**:
  - `LeadGroupCard` component on Lead Detail page
  - Shows linked count with colored badges (parent=blue, child=green, peer=violet)
  - Link dialog with relationship type selector and lead search
  - Click linked lead to navigate to their detail page
- **Copy Activity to Linked Leads**:
  - When logging activity, checkbox list appears if lead has linked leads
  - Select which linked leads should receive a copy of the activity
  - Toast confirms how many leads received the copy
- **Daily Status Deduplication**:
  - Copied activities marked with `is_shared_copy: true`
  - Daily status auto-populate excludes copied activities to prevent duplicates
- **Files Created/Modified**:
  - `/app/frontend/src/components/LeadGroupCard.js` - NEW
  - `/app/frontend/src/pages/LeadDetail.js` - Added LeadGroupCard, copy-to-linked UI
  - `/app/backend/routes/leads.py` - Added lead group endpoints and activity copy logic
  - `/app/backend/server.py` - Updated daily status to exclude copied activities

### Lead Scoring Card UI Restyle
- **Feature**: Restyled `LeadScoringCard` to match `OpportunityEstimation` card design
- **Quadrant-based Color Theming**:
  - Stars: Amber/yellow background (`bg-amber-50`)
  - Showcase: Purple background (`bg-purple-50`)
  - Plough Horses: Blue background (`bg-blue-50`)
  - Puzzles: Slate/gray background (`bg-slate-50`)
- **UX Improvements**:
  - Card background color changes based on scored quadrant for visual clarity
  - Compact 2-column grid layout showing Total Score and Quadrant
  - Prominent "Save Lead Score" button (full-width, indigo) when in edit mode
  - Clear "Cancel" button below save to prevent accidental edits
- **Files Modified**:
  - `/app/frontend/src/components/LeadScoringCard.js`

### City-Based Lead Scoring Model
- **Feature**: Lead Scoring Model is now city-specific
- **Admin Page Changes**:
  - City selector dropdown at top (from master locations)
  - "Copy to City" button to duplicate models
  - "Delete City Model" button for non-default models
  - "Configured cities" badges showing which cities have models
  - Fallback indicator when using default model
- **Lead Detail Page Changes**:
  - New `LeadScoringCard` component on right column
  - Shows "Using model for: X" indicator
  - 5 scoring categories with tier selection
  - "Score Lead" button to open scoring interface
- **Backend Changes**:
  - Scoring moved from Accounts to Leads
  - City-specific model lookup with default fallback
  - New endpoints: `/api/scoring/models/cities`, `/api/scoring/models/copy`, `/api/scoring/leads/{id}/score`

---

## Core Features Implemented

### Multi-Tenancy
- Tenant-aware database wrapper
- Automatic tenant filtering on all queries
- Tenant branding (colors, logo)
- Tenant-specific configurations

### Lead Management
- Full CRUD operations
- Lead scoring with quadrant classification
- Opportunity estimation calculator
- Proposed SKU pricing
- Related leads linking
- Logo upload

### User Management
- Role-based access control
- Custom role permissions
- Team management
- Designations

### Reporting
- Daily status reports
- Activity deduplication for linked leads
- Sales overview

---

## Code Architecture

```
/app/
├── backend/
│   ├── models/
│   │   ├── leads.py       # Lead and LeadLink models
│   │   └── role.py        # Role and permissions models
│   ├── routes/
│   │   ├── activities.py  # Activity CRUD
│   │   ├── daily_status.py # Daily status reports
│   │   ├── leads.py       # Lead CRUD, linking, logo
│   │   ├── roles.py       # Role management
│   │   └── scoring.py     # Lead scoring models and metrics
│   └── server.py          # Main FastAPI app
└── frontend/
    └── src/
        ├── components/
        │   ├── LeadGroupCard.js    # Related leads UI
        │   └── LeadScoringCard.js  # Lead scoring UI
        └── pages/
            ├── LeadDetail.js       # Lead detail page
            ├── LeadsList.js        # Leads listing with metric bar
            └── TeamManagement.js   # User management
```

---

## Key API Endpoints

### Lead Scoring
- `GET /api/scoring/quadrant-metrics` - Get quadrant metrics
- `GET /api/scoring/model` - Get scoring model for city
- `POST /api/scoring/leads/{id}/score` - Score a lead
- `GET /api/scoring/leads/{id}/score` - Get lead's score

### Leads
- `GET /api/leads` - List leads (with quadrant filter)
- `POST /api/leads/{id}/link` - Link leads
- `DELETE /api/leads/{id}/unlink/{target_id}` - Unlink leads
- `GET /api/leads/{id}/group` - Get lead's related leads
- `POST /api/leads/{id}/logo` - Upload lead logo

---

## 3rd Party Integrations
- Gemini (via Emergent LLM Key)
- Claude Sonnet 4.5 (via Emergent LLM Key)
- Zoom API
- Resend (email)
- Open-Meteo (weather)
- Google Places API
- Google Workspace OAuth
- Amazon MQ (via Stomp.py)

---

## Upcoming Tasks
1. **P1: Complete server.py Refactoring** - Move legacy routes to modular files
2. **P2: Upgrade AI Assistant to True RAG**
3. **P2: Build Out Placeholder Modules** (Maintenance, Inventory, etc.)
4. **Refactoring**: Break down LeadDetail.js into smaller components

---

## Test Credentials
- **CEO:** `surya.yadavalli@nylaairwater.earth` / `surya123` (Tenant: `nyla-air-water`)
- **Sales Partner:** `priya.menon@pipeline-master.com` / `priya123`
