# Sales CRM Application - Product Requirements Document

## Original Problem Statement
Build a comprehensive, mobile-ready Sales CRM application for Nyla Air Water. The application helps manage leads, accounts, invoices, COGS calculations, and sales team performance.

## Core Features Implemented
1. **Authentication** - Session-based login with Google OAuth and email/password
2. **Lead Management** - Full CRUD with advanced filtering, scoring quadrants, pipeline views
3. **Account Management** - Convert leads to accounts, track invoices and payments
4. **Invoice Management** - ActiveMQ integration for real-time invoice processing
5. **COGS Calculator** - Calculate cost of goods sold with SKU pricing
6. **Tasks & Meetings** - Create tasks, schedule meetings with Zoom integration
7. **Travel & Budget Requests** - Approval workflows for expenses
8. **Daily Status Updates** - Team status tracking with AI assistance
9. **AI Assistant** - Claude-powered chat for CRM queries
10. **Distribution Module (Phase 1)** - NEW: Distributor management with coverage and locations

## Tech Stack
- **Frontend**: React 18, TailwindCSS, Shadcn/UI
- **Backend**: FastAPI (Python)
- **Database**: MongoDB
- **Message Queue**: Amazon MQ (ActiveMQ)
- **AI**: Claude Sonnet 4.5 via Emergent LLM Key, Gemini
- **Integrations**: Zoom API, Resend, Google OAuth

## Latest Session - March 18, 2026

### Completed

#### 1. COGS Deletion Feature ✅
- Added backend DELETE endpoint `/api/cogs/{sku_id}` for CEO/Admin roles
- Added frontend UI with checkboxes, "Delete Selected" button, confirmation dialog
- Role-based access control verified

#### 2. Lead List Filter Fix ✅
- Fixed territory filter (was filtering on non-existent 'territory' field, now uses 'region')
- Updated State dropdown to show all states without requiring Territory selection first
- Updated City dropdown to show all cities without requiring State selection first

#### 3. Team Edit Dialog Fix ✅
- Fixed `ReferenceError: designations is not defined` in EditTeamMemberForm
- Added roles and designations fetching

#### 4. Role/Designation Independence ✅
- Role and Designation are now independent fields (no auto-population)
- CEO can delete system designations and roles

#### 5. Distribution Module - Phase 1 ✅
**Distributor Master**
- Full CRUD operations for distributors
- Fields: name, legal entity, GSTIN, PAN, addresses, contacts, payment terms, credit limits
- Status management (active, inactive, suspended, pending)

**Operating Coverage**
- Define states/cities where distributor can operate
- Bulk add coverage for multiple cities at once
- Integration with master locations

**Distributor Locations/Warehouses**
- Add warehouse/stocking locations for distributors
- Location validation against operating coverage
- Default location flag support

#### 6. Distribution Module - Phase 2 (Margin Matrix) ✅ NEW
**Distributor Margin Matrix**
- City + SKU level commercial margins
- Three margin types supported:
  - Percentage (% on account invoice value)
  - Fixed per Bottle (₹ per bottle)
  - Fixed per Case (₹ per case/crate)
- Optional min/max quantity conditions
- Effective date range support
- Full CRUD with edit/delete capabilities
- City filter for viewing margins

**Frontend Pages**
- `/distributors` - List page with summary cards, search, filters, pagination
- `/distributors/:id` - Detail page with tabs (Overview, Coverage, Locations, **Margin Matrix**)
- Create/Edit distributor dialogs
- Add Coverage, Add Location, and **Add Margin** dialogs

**Backend APIs**
- `GET /api/distributors` - List with filters, pagination
- `GET /api/distributors/summary` - Summary stats
- `GET /api/distributors/{id}` - Get distributor with coverage and locations
- `POST /api/distributors` - Create distributor
- `PUT /api/distributors/{id}` - Update distributor
- `DELETE /api/distributors/{id}` - Soft delete
- `GET/POST/DELETE /api/distributors/{id}/coverage` - Coverage management
- `POST /api/distributors/{id}/coverage/bulk` - Bulk add coverage
- `GET/POST/PUT/DELETE /api/distributors/{id}/locations` - Location management
- `GET/POST/PUT/DELETE /api/distributors/{id}/margins` - **Margin matrix management**
- `POST /api/distributors/{id}/margins/bulk` - **Bulk add margins**

## Distribution Module - Remaining Phases

### Phase 2: Commercial Setup (Partially Complete)
- ✅ Distributor Margin Matrix (city + SKU level margins)
- ⏳ Account-Distributor Assignment (next up)
  - Map accounts to distributors and warehouse locations
  - Primary/backup distributor flags
  - Special commercial override support

### Phase 3: Operations & Transactions
- Primary Shipment to Distributor (stock transfer)
- Distributor-to-Account Delivery recording
- Stock balance tracking at distributor locations
- Validations (coverage, assignment, stock levels)

### Phase 4: Settlement & Reports
- Distributor Settlement calculation engine
- Settlement approval workflow
- Reports (stock balance, deliveries, settlements, performance)

## Pending Tasks

### P1 - High Priority
1. **Distribution Module Phase 2** - Margin Matrix, Account-Distributor Assignment
2. **Server.py Refactoring** - Move remaining routes to modular files

### P2 - Medium Priority
1. **AI Assistant RAG Upgrade** - Upgrade to true vector-based RAG system
2. **Build Out Placeholder Modules** - Maintenance, Inventory modules

## Key API Endpoints
- `GET /api/leads` - List leads with filters (territory→region mapping fixed)
- `DELETE /api/cogs/{sku_id}` - Delete COGS entry (Admin only)
- `GET /api/invoices` - List invoices with filters
- `POST /api/auth/login` - User authentication
- `GET/POST/PUT/DELETE /api/distributors` - Distributor CRUD
- `GET/POST/DELETE /api/distributors/{id}/coverage` - Coverage management
- `GET/POST/PUT/DELETE /api/distributors/{id}/locations` - Location management

## Test Credentials
- **CEO**: `surya.yadavalli@nylaairwater.earth` / `test123`
- **Partner-Sales**: `priya.sales@nylaairwater.earth` / `test123`

## Multi-Tenant Note
All API calls require X-Tenant-ID header (default: `nyla-air-water`)

## Files Created This Session
- `/app/backend/models/distributor.py` - Pydantic models for distributors
- `/app/backend/routes/distributors.py` - All distributor API endpoints
- `/app/frontend/src/pages/DistributorList.js` - Distributor list page
- `/app/frontend/src/pages/DistributorDetail.js` - Distributor detail page with tabs

## Files Modified This Session
- `/app/backend/routes/__init__.py` - Added distributors router
- `/app/frontend/src/App.js` - Added distributor routes
- `/app/frontend/src/layouts/DashboardLayout.js` - Added Distribution section to sidebar
- `/app/frontend/src/pages/TeamManagement.js` - Fixed edit dialog, role independence
- `/app/frontend/src/pages/TenantSettings.js` - CEO can delete designations
- `/app/frontend/src/components/RoleManagement.js` - CEO can delete roles
- `/app/backend/routes/designations.py` - CEO can delete system designations
- `/app/backend/routes/roles.py` - CEO can delete system roles
- `/app/backend/server.py` - Fixed territory→region filter mapping
- `/app/frontend/src/pages/LeadsList.js` - Fixed State/City dropdown options
- `/app/frontend/src/pages/COGSCalculator.js` - Added delete functionality
