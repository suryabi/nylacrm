# Sales CRM Application - Product Requirements Document

## Original Problem Statement
Build a comprehensive, mobile-ready Sales CRM application for Nyla Air Water. The application helps manage leads, accounts, invoices, COGS calculations, and sales team performance.

## Latest Session - March 22, 2026

### Billing & Reconciliation Module Redesign ✅

**New Workflow:**
```
Settlements (per Account, multiple per month)
    ↓
Monthly Reconciliation (all accounts combined for the month)
    ↓
Debit/Credit Note Generation
    ↓
Payout
```

**Key Changes:**
1. Settlements no longer have approval/payout actions - they just record earnings
2. Monthly Reconciliation aggregates all settlements for a month
3. Single Debit/Credit Note per month based on net adjustment:
   - Positive adjustment → Credit Note (we pay distributor extra)
   - Negative adjustment → Debit Note (distributor owes us)

**New Endpoints:**
- `GET /api/distributors/{id}/monthly-reconciliation?month=X&year=Y` - Get all settlements for month
- `POST /api/distributors/{id}/generate-monthly-note` - Generate Debit/Credit Note

**Testing Results (iteration_68.json):**
- Backend: 100% (10/10 tests passed)
- Frontend: 100% (all UI elements verified)

---

### Other Changes This Session

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
1. **Fix Delivery Detail Popup** - "Margin" column shows incorrect value (₹368.75 vs ₹312.50)
2. **Server.py Refactoring** - Move remaining routes to modular files
3. **Settlement Period Configuration** - Auto weekly/monthly cycles

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
