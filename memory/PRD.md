# Sales CRM Application - Product Requirements Document

## Original Problem Statement
Build a comprehensive, mobile-ready Sales CRM application for Nyla Air Water. The application helps manage leads, accounts, invoices, COGS calculations, and sales team performance.

## Latest Session - March 23, 2026 (Session 5)

### Distribution Module UI Redesign ✅

**User Requirements:**
- Tiles need to be more elegant with large numbers, sparklines, and status indicators
- Address cards designed more elegantly
- Tables with alternate row colors (light brand tint), sorting, pagination (50 default)
- Entire table rows should be clickable
- Minimalist style but with visual interest

**Implementation:**

1. **KPI Tiles Redesign** (`DistributorList.js`):
   - Large light-weight numbers (Manrope font)
   - Duotone icons from Phosphor Icons
   - Trend indicators (+12%, +8%, etc.)
   - Mini sparkline charts using Recharts
   - Subtle shadows with hover lift effect
   - Emerald-tinted backgrounds

2. **Data Tables Redesign**:
   - Alternate row colors (`bg-emerald-50/40` on odd rows)
   - Uppercase tracking-wider headers (IBM Plex Sans)
   - Sortable columns with sort indicators
   - 50 rows default pagination with size selector (10/25/50/100)
   - Clickable entire rows with hover effects
   - Smooth transitions and active state feedback

3. **Shared Components** (`/components/ui/data-table.jsx`):
   - `SortableHeader` - Column headers with sort indicators
   - `TableHeader` - Non-sortable headers
   - `TableRow` - Alternate colors + click handler
   - `TableCell` - Consistent padding/alignment
   - `Pagination` - Full pagination with page size selector
   - `useSorting` / `usePagination` hooks

4. **New Dependencies**:
   - `@phosphor-icons/react` - Duotone icons
   - `recharts` - Sparkline charts
   - Google Fonts: Manrope, IBM Plex Sans, JetBrains Mono

**Files Modified:**
- `/app/frontend/src/pages/DistributorList.js` - Complete redesign
- `/app/frontend/src/components/distributor/MarginsTab.jsx` - Table styling
- `/app/frontend/src/components/ui/data-table.jsx` - New reusable components
- `/app/frontend/public/index.html` - Added fonts

---

## Previous Session - March 23, 2026 (Session 4)

### Request Visibility for Requestors and Approvers ✅

**User Requirements:**
- All request types (Leave, Travel, Budget, Expense) visible to both requestor and approver
- Requestors should always see their own requests (any status)
- Approvers should see requests pending their approval + requests they've already acted upon

**Implementation:**
1. **New `/for-approver` Backend Endpoints** - Added to all request types:
   - `/api/leave-requests/for-approver`
   - `/api/travel-requests/for-approver`
   - `/api/budget-requests/for-approver`
   - `/api/expense-requests/for-approver`
   
   Each endpoint returns:
   - Requests from users who report to the current user (reportees)
   - Requests the current user has previously approved/rejected

2. **Frontend Updates**:
   - LeaveManagement.js - Split view with "Team Requests" + "My Leave Requests"
   - TravelRequest.js - Split view with "Team Requests" (Pending + Previously Reviewed) + "My Travel Requests"
   - BudgetRequest.js - Split view with "Team Requests" + "My Budget Requests"

3. **Bug Fixes Applied**:
   - Fixed route order in FastAPI (static paths before dynamic paths)
   - Fixed case-sensitive role checks (CEO vs ceo)
   - Fixed isApprover check to include CEO role
   - Added tenant_id to leave_requests collection

**Testing Results:**
- Backend: 18/18 tests passed
- Frontend: All pages showing correct Team Requests sections

---

## Previous Session - March 22, 2026 (Session 3)

### PDF Credit/Debit Note Generation ✅

**User Requirements:**
- Generate actual PDF documents for Credit/Debit notes
- Include company logos, itemized breakdown, and signature blocks
- Store PDFs in object storage for later download
- Attach PDF reference to reconciliation records

**Implementation:**
1. **PDF Generator** - `reportlab` based PDF with:
   - Company header with logo support
   - Note details (number, date, period, status)
   - Distributor details (name, GSTIN, PAN, address, contact)
   - Itemized settlements breakdown table (up to 30 items)
   - Financial summary (billing value, earnings, transfer margin, adjustment)
   - Signature blocks (Prepared By, Authorized Signatory, Distributor Acknowledgment)
   - Footer with generation timestamp

2. **Object Storage Integration** - Using Emergent Object Storage API:
   - Uploads PDFs to `nyla-crm/debit-credit-notes/{distributor_id}/{note_number}.pdf`
   - On-demand generation if PDF not stored
   - Download endpoint returns PDF with proper Content-Disposition header

3. **API Endpoints**:
   - `POST /api/distributors/{id}/generate-monthly-note` - Creates note with PDF
   - `GET /api/distributors/{id}/notes/{note_id}/download` - Downloads PDF

4. **Frontend Download Button** - Added to BillingTab.jsx:
   - FileDown icon with loading spinner during download
   - Blob-based download for proper file handling

**Files Created/Modified:**
- `/app/backend/utils/pdf_generator.py` - PDF generation logic
- `/app/backend/utils/object_storage.py` - Storage utility
- `/app/backend/utils/__init__.py` - Package init
- `/app/backend/routes/distributors.py` - Updated endpoints
- `/app/frontend/src/components/distributor/BillingTab.jsx` - Download button

**Testing Results (iteration_72.json):**
- Backend: 100% (12/12 tests)
- Frontend: 100% (PDF download verified)

---

## Previous Session - March 22, 2026 (Session 2)

### Distributor Self-Service Access ✅

**User Requirements:**
- Auto-create user when distributor is created using primary contact email
- Default password "nyladist##" with force password change on first login
- Distributor users can only see their own data
- Distributors can: View profile, Create deliveries, Update contact info, Download reports

**Implementation:**
1. **Auto-User Creation** - When distributor created:
   - Creates user with role "Distributor" using primary contact email
   - Sets `distributor_id` to link user to distributor
   - Sets `force_password_change: true`
   - Default password: "nyladist##"

2. **Data Filtering** - Distributor users see only their data:
   - List API returns only their distributor
   - Detail API validates access (403 for other distributors)
   - Cannot create/delete distributors

3. **Auto-Redirect** - On login, distributors redirect to `/distributors/{id}`

4. **Simplified Sidebar** - Only shows "My Profile" under "MY DISTRIBUTOR"

5. **Password Change API** - `POST /api/auth/change-password`

**Files Modified:**
- `/app/backend/routes/distributors.py` - Auto user creation, data filtering
- `/app/backend/server.py` - Login returns force_password_change, change-password endpoint
- `/app/frontend/src/context/AppContextContext.js` - isDistributorUser, getDistributorId
- `/app/frontend/src/layouts/DashboardLayout.js` - Redirect logic, distributorUserNavigationGroups

**Testing Results (iteration_71.json):**
- Backend: 100% (14/14 tests)
- Frontend: 100% (all features verified)
- Test Credentials: john.distributor@test.com / nyladist##

---

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
- PDF Generation with object storage ✅ (NEW - March 22, 2026)
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

### PDF Note Generation:
- PDFs generated using `reportlab` library
- Stored in Emergent Object Storage at `nyla-crm/debit-credit-notes/{distributor_id}/{note_number}.pdf`
- On-demand generation for notes without stored PDF
- Download via `GET /api/distributors/{id}/notes/{note_id}/download`

---

## Pending Tasks

### P1 - High Priority
1. **Auto-generate Provisional Invoice** - Trigger invoice when shipment status → "delivered"
2. **Build Reporting Module** - Stock balance, deliveries, settlements reports
3. **First-login Force Password Change Modal** - Frontend modal for distributors on first login

### P2 - Medium Priority
1. **Server.py Refactoring** - Move remaining routes to modular files
2. **Settlement Period Configuration** - Auto weekly/monthly cycles
3. **Bulk Copy Margins** - Copy margin matrix from one city to all covered cities

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
