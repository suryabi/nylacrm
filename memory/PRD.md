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

### Data Cleanup & Module Rebuild ✅
**Date**: March 21, 2026

**Actions Performed:**
1. Deleted all test data from: Shipments, Deliveries, Settlements, Reconciliations, Debit/Credit Notes
2. Verified Billing & Reconciliation module works correctly with fresh state
3. Fixed login endpoint bug (was using tenant-filtered query for authentication)

**Testing Results (iteration_67.json):**
- Backend: 100% (20/20 tests passed)
- Frontend: 100% (all UI elements verified)

### Bug Fix: Login Endpoint
**Issue**: Login was using `get_tdb().users` which filters by tenant_id, but during login we don't have tenant context yet.
**Fix**: Changed to use `db.users` directly for authentication lookup.
**File**: `/app/backend/server.py` line 2534

---

### TESTING COMPLETE: Monthly Settlements & Deliveries Features ✅
**Date**: March 21, 2026

**Testing Agent Results (iteration_66.json)**:
- Backend: 100% (18/18 tests passed)
- Frontend: 100% (all features working)

**Features Verified**:
1. **Deliveries Tab**: Line-item table with all pricing columns
2. **Deliveries Filters**: Time Period, Account filter, pagination
3. **Monthly Settlements**: Generate Settlement dialog with Month/Year selection
4. **Settlements List**: All columns displaying correctly with month/year filters

**Calculation Formulas Verified**:
- Billing Value = qty × customer_selling_price ✅
- Distributor Earnings = billing × commission% ✅
- Margin at Transfer = qty × transfer_price × commission% ✅
- Adjustment = earnings - margin_at_transfer ✅

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

### Phase 4: Settlement & Billing ✅
- Monthly Settlement calculation engine
- Billing & Reconciliation module
- Debit/Credit Notes generation
- All E2E tested with 100% pass rate

---

## Billing & Reconciliation Flow

### Flow Diagram:
```
Shipment (at Transfer Price)
    ↓
Delivery (at Customer Selling Price)
    ↓
Reconciliation (Compare: Transfer vs Selling)
    ↓
Debit/Credit Note (Settlement)
```

### Calculation Logic:
1. **Provisional Amount** = Quantity × Transfer Price
2. **Actual Gross** = Quantity × Customer Selling Price
3. **Entitled Margin** = Actual Gross × Margin %
4. **Actual Net** = Actual Gross - Entitled Margin
5. **Difference** = Actual Net - Provisional Amount
   - Positive → **Debit Note** (Distributor owes)
   - Negative → **Credit Note** (Company owes)

---

## Pending Tasks

### P1 - High Priority
1. **Auto-generate Provisional Invoice** - Trigger invoice when shipment status → "delivered"
2. **Reporting Module** - Stock balance, deliveries, settlements reports

### P2 - Medium Priority
1. **Server.py Refactoring** - Move remaining routes to modular files
2. **Settlement Period Configuration** - Auto weekly/monthly cycles
3. **Cleanup deprecated BillingConfig** - Remove obsolete billing config endpoints

---

## Key API Endpoints - Distribution Module

### Distributor Management
- `GET/POST/PUT/DELETE /api/distributors` - Distributor CRUD
- `GET/POST/DELETE /api/distributors/{id}/coverage` - Coverage management
- `GET/POST/PUT/DELETE /api/distributors/{id}/locations` - Location management
- `GET/POST/PUT/DELETE /api/distributors/{id}/margins` - Margin matrix

### Operations
- `GET/POST/PUT/DELETE /api/distributors/{id}/assignments` - Account assignments
- `GET/POST/PUT/DELETE /api/distributors/{id}/shipments` - Shipment CRUD
- `GET/POST/DELETE /api/distributors/{id}/deliveries` - Delivery CRUD

### Settlements
- `GET/POST/PUT/DELETE /api/distributors/{id}/settlements` - Settlement CRUD
- `POST /api/distributors/{id}/settlements/generate-monthly` - Generate monthly settlements
- `GET /api/distributors/{id}/unsettled-deliveries` - Get unsettled deliveries

### Billing & Reconciliation
- `GET /api/distributors/{id}/billing/summary` - Billing dashboard
- `POST /api/distributors/{id}/reconciliations/calculate` - Preview reconciliation
- `POST /api/distributors/{id}/reconciliations` - Create reconciliation
- `GET /api/distributors/{id}/reconciliations` - List reconciliations
- `POST /api/distributors/{id}/reconciliations/{id}/confirm` - Confirm and generate note
- `GET /api/distributors/{id}/debit-credit-notes` - List notes

---

## Test Credentials
- **CEO**: `surya.yadavalli@nylaairwater.earth` / `test123`
- **Tenant Header**: `X-Tenant-ID: nyla-air-water`

## Test Data
- **Distributor**: "Test" (ID: 99fb55dc-532c-4e85-b618-6b8a5e552c04)
- **Status**: Clean (all transaction data deleted, 57 margin matrix entries remain)

---

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
- `BillingTab.jsx` - Reconciliations and Debit/Credit Notes
- `constants.js` - Shared constants

---

## 3rd Party Integrations
- Amazon MQ (ActiveMQ)
- Gemini (via Emergent LLM Key)
- Zoom API
- Resend
- Open-Meteo
- Google Places API
- Google Workspace OAuth
- Claude Sonnet 4.5 (via Emergent LLM Key)
