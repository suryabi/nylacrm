# Sales CRM Application - Product Requirements Document

## Original Problem Statement
Build a comprehensive, mobile-ready Sales CRM application for Nyla Air Water. The application helps manage leads, accounts, invoices, COGS calculations, and sales team performance.

## Core Features Implemented
1. **Authentication** - Session-based login with Google OAuth and email/password
2. **Lead Management** - Full CRUD with advanced filtering, scoring quadrants, pipeline views
3. **Account Management** - Convert leads to accounts, track invoices and payments
4. **Invoice Management** - ActiveMQ integration for real-time invoice processing
5. **COGS Calculator** - Calculate cost of goods sold with SKU pricing (mobile-friendly)
6. **Tasks & Meetings** - Create tasks, schedule meetings with Zoom integration
7. **Travel & Budget Requests** - Approval workflows for expenses
8. **Daily Status Updates** - Team status tracking with AI assistance
9. **AI Assistant** - Claude-powered chat for CRM queries
10. **Distribution Module** - Full distributor management with all phases complete

## Tech Stack
- **Frontend**: React 18, TailwindCSS, Shadcn/UI
- **Backend**: FastAPI (Python)
- **Database**: MongoDB
- **Message Queue**: Amazon MQ (ActiveMQ)
- **AI**: Claude Sonnet 4.5 via Emergent LLM Key, Gemini
- **Integrations**: Zoom API, Resend, Google OAuth

## Latest Session - March 21, 2026

### TESTING COMPLETE: Monthly Settlements & Deliveries Features ✅
**Date**: March 21, 2026

**Testing Agent Results (iteration_66.json)**:
- Backend: 100% (18/18 tests passed)
- Frontend: 100% (all features working)

**Features Verified**:
1. **Deliveries Tab**: Line-item table with all pricing columns (Customer Selling Price, Distributor Commission %, Billing Value, Earnings, Transfer Price, Margin at Transfer, Adjustment Payable)
2. **Deliveries Filters**: Time Period, Account filter, pagination all working
3. **Monthly Settlements**: Generate Settlement dialog with Month/Year selection, account grouping, calculation preview
4. **Settlements List**: All columns displaying correctly with month/year filters

**Calculation Formulas Verified**:
- Billing Value = qty × customer_selling_price ✅
- Distributor Earnings = billing × commission% ✅
- Margin at Transfer = qty × transfer_price × commission% ✅
- Adjustment = earnings - margin_at_transfer ✅

**Note**: Legacy settlements show ₹0.00 for new columns (expected - schema upgrade)

---

### FEATURE: Pipeline Value Popup with Account List ✅
**User Request**: Click on the Pipeline Value tile in Dashboard to see a popup with the list of accounts contributing to that value.

**Implementation**:
1. **Backend** (`/app/backend/server.py`):
   - Added new endpoint `GET /api/analytics/pipeline-accounts`
   - Returns paginated list of accounts with pipeline value (estimated_value > 0, status != closed_lost)
   - Sorted by estimated_value descending
   - Includes total count and total pipeline value

2. **Frontend** (`/app/frontend/src/pages/Dashboard.js`):
   - Added Dialog component for Pipeline Accounts
   - Pipeline Value tile is now clickable with "(click for details)" indicator
   - Dialog shows:
     - Total pipeline value and account count in header
     - Numbered list of accounts sorted by value
     - Each account shows: name, contact person, city, value, percentage of total
     - Click on account navigates to lead detail page
     - "View All in Leads" button at bottom

---

### FEATURE: Enhanced Shipments Table with Detailed Pricing Columns ✅
**User Request**: Add detailed pricing breakdown columns to the Shipments table.

**Implementation**:
1. **Backend** (`/app/backend/routes/distributors.py`):
   - Updated `list_distributor_shipments` endpoint to calculate and include weighted averages of item data
   - Added fields: `avg_base_price`, `avg_distributor_margin`, `avg_transfer_price`, `avg_gst_percent`
   - Updated `ShipmentItemCreate` model to include `base_price` and `distributor_margin`

2. **Frontend** (`/app/frontend/src/components/distributor/ShipmentsTab.jsx`):
   - Added new columns: Base Price, Margin %, Transfer Price, Total Transfer, GST %, GST Amt, Total (incl GST)
   - Displays weighted averages for shipments with multiple items

---

### FEATURE: CEO/Admin Delete Functionality ✅
**User Request**: Add delete functionality for Shipments, Deliveries, Settlements, and Billing/Reconciliation records, restricted to CEO and Admin roles only.

**Records that can be deleted by CEO/Admin**:
- ✅ Shipments (any status)
- ✅ Deliveries (any status)
- ✅ Settlements (any status)
- ✅ Reconciliations (any status)
- ✅ Debit/Credit Notes (any status)

**Testing**: 100% pass rate (iteration_65.json)

---

### FEATURE: Monthly Settlements Redesign ✅
**User Request**: Settlement screen should be done for each month, not custom dates. Generate settlements at account level showing financial calculations.

**Implementation**:
1. **Backend** (`POST /api/distributors/{id}/settlements/generate-monthly`):
   - Takes month/year parameters
   - Groups unsettled deliveries by account
   - Calculates per-account totals: billing, earnings, margin at transfer, adjustment
   - Creates one settlement per account

2. **Frontend** (`SettlementsTab.jsx`):
   - Completely rewritten for monthly/account focus
   - Month/Year selection instead of date range
   - Preview shows unsettled deliveries grouped by account
   - Columns: Settlement#, Month/Year, Account Name, Deliveries Count, Billing Value, Earnings, Margin, Adjustment, Status

---

### FEATURE: Enhanced Deliveries Table with Line Items ✅
**User Request**: Account deliveries should show detailed pricing per line item.

**Implementation**:
- Line-item rows showing: SKU, Qty, Customer Selling Price, Commission %, Billing Value, Earnings, Transfer Price, Margin at Transfer, Adjustment Payable
- Delivery subtotal rows for multi-item deliveries
- Time filters (This Week, Last Month, etc.)
- Account filter dropdown
- Pagination with dynamic page size
- Excel download

---

## Distribution Module - Complete Implementation

### Phase 1: Distributor Master ✅
- Full CRUD for distributors
- Operating coverage (states/cities)
- Warehouse/stocking locations

### Phase 2: Commercial Setup ✅
- Margin Matrix (city + SKU level margins with date validity)
- Account-Distributor Assignment

### Phase 3: Operations & Transactions ✅
- Primary Shipments (stock transfer to distributors)
- Account Deliveries (distributor to customer)
- Stock tracking per location

### Phase 4: Settlement & Reports ✅ (Fully Tested)
- Monthly Settlement calculation engine ✅
- Settlement approval workflow (Draft → Pending → Approved → Paid) ✅
- E2E tested with 100% pass rate (iteration_66.json)

## Pending Tasks

### P1 - High Priority
1. **Auto-generate Provisional Invoice** - Trigger invoice when shipment status is "delivered"
2. **Reporting Module** - Stock balance, deliveries, settlements reports

### P2 - Medium Priority
1. **Server.py Refactoring** - Move remaining routes to modular files
2. **Settlement Period Configuration** - Auto weekly/monthly cycles
3. **Cleanup deprecated BillingConfig** - Remove obsolete billing config models/routes after merging into Margin Matrix
4. **Lead Activity Date Validation** - Prevent activities dated before lead creation

## Key API Endpoints - Distribution Module
- `GET/POST/PUT/DELETE /api/distributors` - Distributor CRUD
- `GET/POST/DELETE /api/distributors/{id}/coverage` - Coverage management
- `GET/POST/PUT/DELETE /api/distributors/{id}/locations` - Location management
- `GET/POST/PUT/DELETE /api/distributors/{id}/margins` - Margin matrix
- `GET/POST/PUT/DELETE /api/distributors/{id}/assignments` - Account assignments
- `GET /api/distributors/accounts/search` - Search accounts
- `GET /api/distributors/{id}/assigned-accounts` - Get accounts for delivery
- `GET/POST/PUT/DELETE /api/distributors/{id}/shipments` - Shipment CRUD
- `GET/POST/DELETE /api/distributors/{id}/deliveries` - Delivery CRUD
- `GET/POST/PUT/DELETE /api/distributors/{id}/settlements` - Settlement CRUD
- `POST /api/distributors/{id}/settlements/generate-monthly` - Generate monthly settlements
- `GET /api/distributors/{id}/unsettled-deliveries` - Get unsettled deliveries for month
- `GET/DELETE /api/distributors/{id}/reconciliations` - Reconciliation management
- `GET/POST/DELETE /api/distributors/{id}/notes` - Debit/Credit notes management

## Test Credentials
- **CEO**: `surya.yadavalli@nylaairwater.earth` / `test123`
- **Tenant Header**: `X-Tenant-ID: nyla-air-water`

## Test Data
- **Distributor**: "Test" (ID: 99fb55dc-532c-4e85-b618-6b8a5e552c04)
- **Assigned Account**: "Test Status Validation Company" (Delhi)

## Component Directory
`/app/frontend/src/components/distributor/`
- `OverviewTab.jsx` - Basic info, contacts, commercial terms
- `CoverageTab.jsx` - Operating coverage management
- `LocationsTab.jsx` - Warehouse/location management
- `MarginsTab.jsx` - Margin Matrix with toggle filter
- `AssignmentsTab.jsx` - Account assignments
- `ShipmentsTab.jsx` - Primary shipments with pricing columns
- `DeliveriesTab.jsx` - Account deliveries with line items
- `SettlementsTab.jsx` - Monthly settlement generation
- `BillingTab.jsx` - Billing summary, reconciliations, notes
- `constants.js` - Shared constants

## Technical Debt
1. **server.py** - Still contains many routes that should be modularized
2. **Deprecated BillingConfig** - Old billing config models/routes should be removed

## 3rd Party Integrations
- Amazon MQ (ActiveMQ)
- Gemini (via Emergent LLM Key)
- Zoom API
- Resend
- Open-Meteo
- Google Places API
- Google Workspace OAuth
- Claude Sonnet 4.5 (via Emergent LLM Key)
