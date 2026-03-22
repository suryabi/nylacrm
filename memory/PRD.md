# Sales CRM Application - Product Requirements Document

## Original Problem Statement
Build a comprehensive, mobile-ready Sales CRM application for Nyla Air Water. The application helps manage leads, accounts, invoices, COGS calculations, and sales team performance.

## Latest Session - March 22, 2026 (Session 2)

### Distribution as Separate Top-Level Module ✅

**User Requirements:**
- Make Distribution a separate module like Sales and Production
- Current toggle won't work for many modules - need scalable selector
- Distribution should have its own sidebar items like Sales does

**Implementation:**
1. **Module Selector Dropdown** - Replaced toggle with scalable dropdown
   - Shows: Sales, Production, Distribution
   - Icon indicator shows active module
   - Persists selection in localStorage per user

2. **Distribution Module Navigation** - Separate sidebar when Distribution selected:
   - DISTRIBUTION: Distributors, Stock Dashboard
   - PRODUCT & SKU: SKU Management
   - DOCUMENTS: Files & Documents
   - ORGANIZATION: Company Profile, Team
   - ADMIN: Tenant Settings

3. **Sales Module Cleanup** - Removed Distribution section from Sales sidebar

**Files Modified:**
- `/app/frontend/src/context/AppContextContext.js` - Added Distribution module support
- `/app/frontend/src/layouts/DashboardLayout.js` - Module selector & Distribution nav groups

**Testing Results (iteration_70.json):**
- Frontend: 100% (all 7 features verified)
- Module switching, navigation, persistence all tested

---

### Distribution Module Complete Redesign ✅

**User Requirements:**
- Clean & Minimal design with whitespace, subtle shadows, simple icons
- Modernize teal/green brand colors to professional emerald/sage
- Replace clumsy horizontal tabs with sidebar navigation

**Implementation:**
1. **New Sidebar Navigation** - Vertical nav with grouped sections:
   - General: Overview
   - Operations: Coverage, Locations
   - Commercial: Margin Matrix, Accounts
   - Transactions: Stock In, Stock Out
   - Financial: Settlements, Reconciliation

2. **New Header Component** - Displays distributor avatar, name, code, status badge, and action buttons

3. **Emerald Color Scheme** - Updated CSS variables:
   - Primary: Deep Emerald (#065F46)
   - Light backgrounds with subtle shadows
   - Active states with emerald-50 tint and left border

4. **Enhanced Card Styling** - Subtle hover shadows, emerald accent icons

**New Components Created:**
- `/app/frontend/src/components/distributor/DistributorSidebar.jsx`
- `/app/frontend/src/components/distributor/DistributorHeader.jsx`

**Testing Results (iteration_69.json):**
- Frontend: 100% (all 9 navigation items verified)
- All sidebar nav, header elements, and color scheme tested

---

### P0 Bug Fixed: Delivery Detail Popup ✅

**Issue:** Margin column showed ₹368.75 instead of correct ₹312.50
**Root Cause:** Used legacy `margin_amount` instead of `distributor_earnings`
**Fix:** Updated DistributorDetail.js lines 2387-2404

---

### Previous Session Changes

1. **CEO/Admin Delete Delivery** - Can delete deliveries regardless of status
2. **Delivery Total Row** - Always shows for all deliveries (including single SKU)
3. **Settlement Detail Popup Fixed** - Correct field mappings for new schema
4. **Login Bug Fix** - Fixed tenant-agnostic user lookup

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
- Monthly Settlement generation (per account)
- Monthly Reconciliation (all accounts combined)
- Debit/Credit Note generation
- E2E tested with 100% pass rate

---

## Billing & Reconciliation Flow

### Calculation Logic:
1. **Customer Billing Value** = Qty × Customer Selling Price
2. **Distributor Earnings** = Billing Value × Commission %
3. **Margin at Transfer Price** = Qty × Transfer Price × Commission %
4. **Adjustment Payable** = Earnings - Margin at Transfer
   - Positive → We owe distributor (Credit Note)
   - Negative → Distributor owes us (Debit Note)

---

## Pending Tasks

### P1 - High Priority
1. **Auto-generate Provisional Invoice** - Trigger invoice when shipment status → "delivered"
2. **Build Reporting Module** - Stock balance, deliveries, settlements reports

### P2 - Medium Priority
1. **Server.py Refactoring** - Move remaining routes to modular files
2. **Settlement Period Configuration** - Auto weekly/monthly cycles

---

## Completed Fixes - March 22, 2026 (Session 2)

### P0 Bug Fixed ✅
- **Delivery Detail Popup Margin Bug** - Fixed incorrect margin display
  - Before: Showed ₹368.75 (legacy `margin_amount` field with tax-inclusive formula)
  - After: Shows ₹312.50 (correct `distributor_earnings` = gross_amount × commission%)
  - File changed: `/app/frontend/src/pages/DistributorDetail.js` (lines 2387-2404)
  - Total margin now calculated dynamically from items' `distributor_earnings`

### Customer-Grouped Settlements ✅
- Settlements tab now groups by Customer/Account with accordion layout
- Shows per-customer totals (Billing Value, Earnings, Adjustment)
- Grand Total row aggregates across all customers

---

## Key API Endpoints - Distribution Module

### Distributor Management
- `GET/POST/PUT/DELETE /api/distributors` - Distributor CRUD
- `GET/POST/DELETE /api/distributors/{id}/coverage` - Coverage management
- `GET/POST/PUT/DELETE /api/distributors/{id}/locations` - Location management
- `GET/POST/PUT/DELETE /api/distributors/{id}/margins` - Margin matrix

### Operations
- `GET/POST/PUT/DELETE /api/distributors/{id}/shipments` - Shipment CRUD
- `GET/POST/DELETE /api/distributors/{id}/deliveries` - Delivery CRUD (CEO/Admin can delete any status)

### Settlements
- `GET/POST/PUT/DELETE /api/distributors/{id}/settlements` - Settlement CRUD
- `POST /api/distributors/{id}/settlements/generate-monthly` - Generate monthly settlements per account

### Billing & Reconciliation
- `GET /api/distributors/{id}/monthly-reconciliation?month=X&year=Y` - Monthly reconciliation data
- `POST /api/distributors/{id}/generate-monthly-note` - Generate Debit/Credit Note
- `GET /api/distributors/{id}/debit-credit-notes` - List notes

---

## Test Credentials
- **CEO**: `surya.yadavalli@nylaairwater.earth` / `test123`
- **Tenant Header**: `X-Tenant-ID: nyla-air-water`

## Test Data
- **Distributor**: "Test" (ID: 99fb55dc-532c-4e85-b618-6b8a5e552c04)
- **Settlements**: 3 for March 2026 (total adjustment: +₹865.81)
- **Credit Note**: CN-2026-0001 for ₹165.81 (generated earlier with 2 settlements)

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
- `SettlementsTab.jsx` - Monthly settlement generation per account
- `BillingTab.jsx` - Monthly Reconciliation and Debit/Credit Notes
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
