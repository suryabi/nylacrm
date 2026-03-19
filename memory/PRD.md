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

## Latest Session - March 19, 2026

### FEATURE: "Active & Ongoing Only" Toggle for Margin Matrix ✅
**User Request**: Add a toggle switch on the Margin Matrix tab to filter and show only active and ongoing pricing entries, hiding expired ones.

**Implementation**:
1. Added `showOnlyActiveMargins` state variable
2. Added Switch component from shadcn/ui in the Margin Matrix header
3. Added client-side filtering logic:
   - Toggle OFF: Shows all entries (active, future, expired)
   - Toggle ON: Filters out entries where `active_to < today`
4. Updated summary section:
   - OFF: "Total: X entries | Active: Y | SKUs: Z"
   - ON: "Showing: X of Y entries | SKUs: Z"
5. Empty state message when all filtered out: "No active or ongoing margin entries"

**Testing**: Verified with testing_agent_v3_fork (iteration_60.json) - 100% pass rate (5/5 features)
- Toggle visibility when margins exist ✅
- Toggle OFF shows all entries ✅
- Toggle ON filters correctly ✅
- Summary format changes based on state ✅
- Toggle on/off state transitions ✅

---

### Bug Fix: Record Delivery Account Selection ✅
**Issue**: In the "Record Delivery" popup, the account list was not showing account names correctly. The search was also not user-friendly.

**Root Cause**: 
- Backend was using wrong field names (`company`/`name` instead of `account_name`)
- Frontend was displaying wrong fields

**Fix Applied**:
1. Backend API `GET /api/distributors/{id}/assigned-accounts` updated to return:
   - `account_name`, `contact_name`, `contact_number`
   - `city`, `state`, `territory`
   - `delivery_address`, `distributor_location_id`, `distributor_location_name`
2. Backend API `GET /api/distributors/accounts/search` updated to search:
   - `account_name`, `contact_name`, `account_id`, `city`
3. Frontend Record Delivery dialog updated:
   - Changed from dropdown to searchable list
   - Filter accounts by name, city, or contact name
   - Clear display with all account details (name, location, contact info)
   - Primary indicator (★) for primary accounts
   - Distributor location badge
4. Assignment dialog updated to use `account_name`

**Testing**: Verified with testing_agent_v3_fork (iteration_55.json) - 100% pass rate

### Bug Fix 2: Record Delivery SKU Filtering ✅
**Issue**: In the Record Delivery screen, after selecting an account, the SKU dropdown was showing all master SKUs instead of only the SKUs configured in the account's SKU Pricing section.

**Fix Applied**:
1. Backend API `GET /api/distributors/{id}/assigned-accounts` now returns `sku_pricing` array with enriched data:
   - SKU ID (mapped from master_skus collection)
   - SKU name, price_per_unit, return_bottle_credit
2. Frontend SKU dropdown filters based on `selectedDeliveryAccount.sku_pricing`:
   - Shows only account's configured SKUs with prices ("SKU Name - ₹price")
   - Auto-populates unit price when SKU is selected
   - Add Item button disabled until account is selected
   - Shows helpful message: "Showing X SKU(s) configured for [Account Name]"
   - Falls back to all master SKUs if account has no SKU pricing configured

**Testing**: Verified with testing_agent_v3_fork (iteration_56.json) - 100% pass rate

### NEW FEATURE: Distributor Billing & Reconciliation Module ✅
**User Request**: Build a billing and reconciliation module where stock is sent to distributor at provisional transfer price, and later reconciled based on actual selling prices to customers.

**Business Logic Implemented**:
1. **Base Price Configuration**: Configure base price and margin % per SKU per distributor
   - Transfer Price = Base Price × (1 - Margin%/100)
   - Example: ₹100 base × 97.5% = ₹97.5 transfer price
   
2. **Provisional Billing**: When stock is shipped, distributor pays transfer price
   
3. **Reconciliation**: Periodic comparison of provisional vs actual amounts
   - Provisional Amount = quantity × transfer_price
   - Actual Gross = quantity × customer_selling_price
   - Entitled Margin = actual_gross × margin_percent
   - Actual Net = actual_gross - entitled_margin
   - Difference = actual_net - provisional_amount
   
4. **Settlement**:
   - Positive difference → **Debit Note** (Distributor owes Nyla)
   - Negative difference → **Credit Note** (Nyla owes Distributor)

**Database Collections Added**:
- `distributor_billing_config`: Base prices per SKU per distributor
- `distributor_provisional_invoices`: Invoices for stock transfers
- `distributor_reconciliations`: Reconciliation records with line items
- `distributor_debit_credit_notes`: Settlement documents with payment tracking

**Key API Endpoints**:
- `GET/POST/DELETE /{id}/billing-config` - Base price configuration
- `GET /{id}/billing/summary` - Real-time billing dashboard
- `POST /{id}/reconciliations/calculate` - Preview reconciliation
- `POST /{id}/reconciliations` - Create reconciliation
- `POST /{id}/reconciliations/{rec_id}/confirm` - Confirm and generate note
- `GET /{id}/debit-credit-notes` - List settlement notes
- `POST /{id}/debit-credit-notes/{note_id}/record-payment` - Record payment

**Frontend UI**:
- New "Billing & Reconciliation" tab in distributor detail
- Summary cards: Base Prices, Unreconciled Deliveries, Net Balance, Pending Credits
- Base Price Configuration table with CRUD
- Reconciliations table with detail view
- Debit/Credit Notes table with payment recording

**Testing**: Verified with testing_agent_v3_fork (iteration_57.json) - 100% pass rate (14/14 backend, 100% frontend)

### ENHANCEMENT: Merged Base Price into Margin Matrix ✅
**User Request**: Merge Base Price Configuration into Margin Matrix. Add active_from and active_to date fields for time-based validity.

**Changes Made**:
1. **Margin Matrix Model Updated**:
   - Added `base_price` field - the base price for the SKU
   - Added `transfer_price` field - calculated as base_price × (1 - margin_value/100)
   - Renamed `effective_from/to` to `active_from/active_to` for clarity
   
2. **Backend Logic**:
   - Create/Update margin entry now calculates transfer_price automatically
   - Reconciliation now uses Margin Matrix instead of separate Billing Config
   - Reconciliation filters by active dates: entry is valid if (active_from <= period_end) AND (active_to >= period_start)
   
3. **Frontend UI**:
   - Margin Matrix grid updated with columns: Base Price, Transfer Price, Active From, Active To
   - Transfer Price shown as calculated value (green text)
   - Date pickers for Active From/To
   - Billing tab replaced "Base Price Configuration" section with note directing to Margins tab

**Formula**: Transfer Price = Base Price × (1 - Margin%/100)
- Example: ₹100 × (1 - 2.5/100) = ₹97.5

**Testing**: Verified with testing_agent_v3_fork (iteration_58.json) - 100% pass rate (11/11 backend, 100% frontend)

### ENHANCEMENT: Multiple Margin Entries Per SKU with Date Overlap Validation ✅
**User Request**: Allow multiple margin entries per SKU to maintain pricing history. Ensure only one entry is active at any given time by validating date overlaps.

**Changes Made**:
1. **Date Overlap Validation**:
   - New entries validated against existing ones: `new_start <= exist_end AND exist_start <= new_end` = overlap
   - Clear error message: "Date range overlaps with existing entry (ID: xxx, Active: date to date)"
   - Same validation on update operations
   
2. **Multiple Entries Per SKU**:
   - Can now create entries like: 2026 (₹100, 2.5%), 2027 (₹110, 3.0%)
   - Each entry has `active_from` and `active_to` dates
   - Empty `active_to` = ongoing/indefinite
   
3. **Status Indicators**:
   - 🟢 **Active**: Currently valid (active_from <= today <= active_to)
   - 🔵 **Future**: Not yet valid (active_from > today)
   - ⚫ **Expired**: No longer valid (active_to < today)
   
4. **UI Redesigned**:
   - Changed from grid-based (one row per SKU) to list-based (multiple rows per SKU)
   - "Add Price Entry" button to create new entries
   - Edit dialog for each entry
   - Summary: Total entries | Active | Unique SKUs

**Testing**: Verified with testing_agent_v3_fork (iteration_59.json) - 100% pass rate (9/9 backend, 100% frontend)

## Distribution Module - Complete Implementation

### Phase 1: Distributor Master ✅
- Full CRUD for distributors
- Operating coverage (states/cities)
- Warehouse/stocking locations

### Phase 2: Commercial Setup ✅
- Margin Matrix (city + SKU level margins)
- Account-Distributor Assignment

### Phase 3: Operations & Transactions ✅
- Primary Shipments (stock transfer to distributors)
- Account Deliveries (distributor to customer)
- Stock tracking per location

### Phase 4: Settlement & Reports (Backend Complete, Frontend Untested)
- Settlement calculation engine
- Settlement approval workflow (Pending → Approved/Rejected)
- Reports need UI verification

## Pending Tasks

### P0 - Immediate
1. **Refactor DistributorDetail.js** - CRITICAL: File is now 5300+ lines
   - Break into: OverviewTab.js, CoverageTab.js, LocationsTab.js, MarginsTab.js, AssignmentsTab.js, ShipmentsTab.js, DeliveriesTab.js, SettlementsTab.js, BillingTab.js
2. **Test Distributor Settlement Feature** - Frontend UI exists but untested

### P1 - High Priority
1. **Stock Dashboard** - Real-time stock levels across distributor locations
2. **Auto-generate Provisional Invoice** - Trigger invoice when shipment status is "delivered"

### P2 - Medium Priority
1. **Server.py Refactoring** - Move remaining routes to modular files
2. **Settlement Period Configuration** - Auto weekly/monthly cycles
3. **Reporting Module** - Stock balance, deliveries, settlements reports
4. **Cleanup deprecated BillingConfig** - Remove obsolete billing config models/routes after merging into Margin Matrix

## Key API Endpoints - Distribution Module
- `GET/POST/PUT/DELETE /api/distributors` - Distributor CRUD
- `GET/POST/DELETE /api/distributors/{id}/coverage` - Coverage management
- `GET/POST/PUT/DELETE /api/distributors/{id}/locations` - Location management
- `GET/POST/PUT/DELETE /api/distributors/{id}/margins` - Margin matrix
- `GET/POST/PUT/DELETE /api/distributors/{id}/assignments` - Account assignments
- `GET /api/distributors/accounts/search` - Search accounts (uses account_name)
- `GET /api/distributors/{id}/assigned-accounts` - Get accounts for delivery (uses account_name)
- `GET/POST/PUT/DELETE /api/distributors/{id}/shipments` - Shipment CRUD
- `GET/POST/DELETE /api/distributors/{id}/deliveries` - Delivery CRUD
- `GET/POST/PUT/DELETE /api/distributors/{id}/settlements` - Settlement CRUD
- `POST /api/distributors/{id}/settlements/generate` - Generate settlement report

## Test Credentials
- **CEO**: `surya.yadavalli@nylaairwater.earth` / `test123`
- **Tenant Header**: `X-Tenant-ID: nyla-air-water`

## Test Data
- **Distributor**: "Test" (ID: 99fb55dc-532c-4e85-b618-6b8a5e552c04)
- **Assigned Account**: "Test Status Validation Company" (Delhi)

## Technical Debt
1. **DistributorDetail.js** - 5300+ lines, urgently needs refactoring into separate tab components
2. **server.py** - Still contains many routes that should be modularized
3. **Deprecated BillingConfig** - Old billing config models/routes should be removed after being merged into Margin Matrix
