# Sales CRM Application - Product Requirements Document

## Original Problem Statement
Build a comprehensive, mobile-ready Sales CRM application for Nyla Air Water. The application helps manage leads, accounts, invoices, COGS calculations, and sales team performance.

## Latest Session - March 28, 2026 (Session 9)

### Return Reasons Master - Phase 1 ✅ (March 28 - COMPLETED)

**User Request**: Build a Returns module for tracking customer returns to distributors. 4 return reason types:
1. **Empty Stock Return** - Credit from SKU return pricing
2. **Expired Stock Return** - Full price refund
3. **Damaged Stock Return** - Full price refund
4. **FOC/Promotional Return** - No credit

**Phase 1 Implementation - Return Reasons Master (Tenant Settings):**
- New "Returns" tab in Tenant Settings with 7-tab layout
- Full CRUD for return reasons with:
  - Reason Code/Name/Description
  - **Category**: empty_reusable, expired, damaged, promotional
  - **Credit Type**: sku_return_credit, full_price, percentage, no_credit
  - Color coding for UI
  - Return to Factory flag
  - Requires Inspection flag
- "Initialize Defaults" creates 4 standard system reasons
- Toggle activate/deactivate, Edit, Delete (non-system only)

**Files Created:**
- `/app/backend/routes/return_reasons.py` - Complete CRUD endpoints
- `/app/backend/models/tenant.py` - Added ReturnReason model and DEFAULT_RETURN_REASONS

**Files Modified:**
- `/app/backend/routes/__init__.py` - Registered return_reasons_router
- `/app/frontend/src/pages/TenantSettings.js` - Added Returns tab with full UI

**Testing (iteration_84.json):** 100% backend (15/15 tests), 100% frontend

**Phase 2 (Upcoming):** Customer Returns Tracking Module in Distribution

---

### Settlement Adjustment Formula Fixed ✅ (March 28 - COMPLETED)

**Issue**: Settlement tab wasn't using the newly computed adjustment from Stock Out module.

**Root Cause**: The settlement calculation was using the OLD formula which didn't match the Stock Out display.

**Fix Applied:**
- **OLD Formula**: `Adjustment = qty × margin% × (customer_price - base_price)`
- **NEW Formula**: `Adjustment = Actual Billable - Billed to Dist = qty × (1 - margin%) × (customer_price - base_price)`

**Example Comparison** (qty=1, base=₹146.25, customer=₹140, margin=2.5%):
- OLD: 1 × 0.025 × (140 - 146.25) = **-₹0.16**
- NEW: (1 × 140 × 0.975) - (1 × 146.25 × 0.975) = 136.50 - 142.59 = **-₹6.09**

**Files Updated:**
- `/app/backend/routes/distributors.py` - `calculate_delivery_item_amounts()` and `generate_monthly_settlements()`
- `/app/frontend/src/components/distributor/SettlementsTab.jsx` - Preview table calculations and column headers

**Testing (iteration_83.json):** 100% backend, 100% frontend. Verified Stock Out and Settlements now show consistent adjustment values.

---

### Customer Invoice with GST - PDF Generation ✅ (March 28 - COMPLETED)

**User Request**: Create customer invoices including GST from delivery, with PDF download from delivery detail view.

**Implementation:**
- **GST Rate**: Configurable at tenant level (Tenant Settings → Settings → Default GST %)
- **Invoice Generation**: "Download Invoice (GST)" button in delivery detail dialog (for delivered/confirmed status)
- **PDF Format**: Professional tax invoice with:
  - Company header with logo, address, GSTIN
  - Bill To / Ship To customer details
  - Itemized table with SKU, HSN, Qty, Rate, Taxable Value
  - GST breakdown (CGST + SGST split)
  - Grand total with GST
  - Bank details for payment
  - Signature blocks

**Files Modified:**
- `/app/backend/utils/pdf_generator.py` - Added `generate_customer_invoice_pdf()` function
- `/app/backend/routes/distributors.py` - Added `GET /distributors/{id}/deliveries/{id}/customer-invoice` endpoint
- `/app/frontend/src/pages/DistributorDetail.js` - Added download button and handler

**Testing (iteration_82.json):** 100% backend (2/2), 100% frontend (5/5)

---

### Column Header Renaming ✅ (March 28 - COMPLETED)

**Changes:**
- "Actual Billable" → **"Actual Billable to Dist"**
- "Adjustment" → **"Adjustment (Dist→Factory)"**

Updated in both table headers and Excel export.

---

### Final Delivery Columns Restructure ✅ (March 28 - COMPLETED)

**User's exact column order** (fully implemented):
| Column | Color | Formula |
|--------|-------|---------|
| Delivery # | Default | - |
| SKU | Default | - |
| Qty | Default | - |
| Base Price | Blue | Raw base price |
| Transfer Price | Blue | base × (1 - margin%) |
| **Billed to Dist** | Blue | qty × transfer_price |
| Customer Price | Emerald | Actual customer selling price |
| New Transfer Price | Emerald | customer × (1 - margin%) |
| **Actual Billable** | Emerald | qty × new_transfer_price |
| **Adjustment** | Amber | Actual Billable - Billed to Dist |
| **Customer Invoice** | Default | qty × customer_price |
| Status | Default | - |
| Actions | Default | - |

**Key changes from previous version:**
- Quantity moved to 3rd position (after SKU)
- Added "Billed to Dist" = qty × initial transfer price
- Added "Actual Billable" = qty × new transfer price (based on customer price)
- "Adjustment" = Actual Billable - Billed to Dist (not the old margin-based formula)
- Added "Customer Invoice" = qty × customer price
- Subtotal row shows totals for Billed, Actual Billable, Adjustment, and Customer Invoice
- Excel export includes all new columns

**Testing (iteration_81.json):** 100% frontend (7/7 test cases passed)

---

### Restructured Delivery Columns with Color Coding ✅ (March 28 continued - Previous iteration)

**New column order** (user-specified):
- **Blue tint (theoretical)**: Base Price, Transfer Price (base × (1 - margin%))
- **Emerald tint (actual)**: Customer Price, New Transfer Price (customer × (1 - margin%))
- Quantity, Distributor → Customer Billing, Factory → Distributor Adjustment

**Factory → Dist Adjustment** = qty × margin% × (customer_price - base_price)
- Green (+) when customer > base (distributor pays factory extra margin)
- Red (-) when customer < base (factory compensates distributor)

Applied consistently across Deliveries, Settlements, and Billing tabs. Old separate "Adjustment" + "Price Premium" columns merged into single "Factory → Dist Adj".

**Testing (iteration_80.json):** 100% backend (6/6), 100% frontend. Bug fixed: subtotal row undefined vars.

---

### Price Premium in Stock Out (Deliveries Tab) ✅ (March 28 continued)

Added "Price Premium" column to the **Deliveries/Stock Out** tab showing the additional amount the manufacturer receives when customer price > base price. Formula: `qty × (customer_price - transfer_price)`. Also in Excel export. Verified: DEL-2026-0009: 10 × (399.00 - 97.50) = ₹3,015.00

**Testing (iteration_79.json):** 100% backend (11/11), 100% frontend

---

### Price Premium Payable in Distribution Module ✅ (March 28 continued)

**Business Logic**: When customer is charged more than the base/transfer price, the distributor collects extra on behalf of the company. The system now calculates:
- `price_premium_payable` = qty × (customer_selling_price - base_price) when customer_price > base_price

**Implementation:**
- Backend: Added to `calculate_delivery_item_amounts()`, delivery creation (`total_price_premium`), and settlement generation
- Frontend: Added "Price Premium" column/card in SettlementsTab + BillingTab + Excel export
- Colored amber when > 0, slate when 0. Existing pre-feature data handled gracefully with || 0 fallback.

**Testing (iteration_78.json):** 100% backend (11/11), 100% frontend

---

### Task Metrics Filter Navigation Fix ✅ (March 28 continued)

**Problem**: Home dashboard task tiles navigated to task page but filters weren't applied correctly (closed tasks showed when metric excluded them). Overdue was client-side only.

**Fixes:**
1. Home tiles now pass `status=active` to exclude closed tasks (matching metric counts)
2. Backend supports `?overdue=true` and `?status=active` query params (server-side filtering)
3. Task page metric tiles highlight with emerald ring when active
4. "Overdue" badge with dismiss button shows when overdue filter is on
5. New "Active" status filter option (not closed)
6. Clean params sent to API (no empty strings)

**Testing (iteration_77.json):** 100% backend (12/12), 100% frontend

---

### Action Items Removed + Auto-Task from Requests + RBAC + OAuth Fix ✅

**Changes:**

1. **Deleted Action Items module** from Home Dashboard completely (widget, state, handlers)
2. **Auto-task creation**: Travel/Budget requests with `submit_for_approval=true` now auto-create tasks in Task Management module (`tasks_v2`) assigned to approvers
3. **RBAC**: Added Task Management (Tasks, Milestones, Labels) to role permission settings
4. **Google OAuth login loop fix**: Stored `session_token` in localStorage + `window.location.href` to force AuthProvider re-init on iPad/Chrome

**Testing (iteration_76.json):** 100% backend (10/10), 100% frontend

---

## Previous Session - March 27, 2026 (Session 8)

### Home Dashboard Task Metrics & Task Page Filters ✅

**User Requirements:**
- Remove task creation from home page
- Remove old metric tiles (Activities, Calls, Emails, Meetings) from home page
- Replace with Task metrics (Assigned to Me, Created by Me, Overdue, High Severity)
- Each metric tile clickable → navigates to /tasks with proper filters applied
- Task page: Add metrics tiles (Total, Assigned to Me, Created by Me, Open, Overdue, Closed)
- Task page: Add comprehensive filters (View, Status, Department, Severity)
- Department-based visibility for tasks

**Implementation:**

1. **Backend (`/app/backend/routes/task_management.py`):**
   - New endpoint: `GET /api/task-management/tasks/my-dashboard-stats` — personal task metrics
   - Enhanced `GET /api/task-management/tasks/stats` — added `created_by_me` field

2. **Frontend Changes:**
   - New widget: `TaskMetricsWidget.js` — 4 clickable tiles on home dashboard
   - Updated `HomeDashboard.js` — replaced TodaySummaryWidget, removed NewTaskDialog
   - Updated `ActionItemsWidget.js` — removed "New Task" button
   - Updated `TaskManagement.js` — 6 metric tiles, comprehensive filters, URL param support, Clear button

**Testing Results (iteration_75.json):**
- Backend: 100% (8/8 tests passed)
- Frontend: 100% — All features verified

---

## Previous Session - March 25, 2026 (Session 7)

### Task Management Module - GitHub-style Issue Tracker ✅

**User Requirements:**
- Comprehensive task management system like GitHub Issues
- Available across all modules (Sales, Distribution, Production)
- Department-based visibility (users see their department + tasks assigned to them)
- CEO/Director/System Admin can see all tasks
- Multiple assignees per task
- Milestones (admin-defined) with progress tracking
- Labels (admin-defined) with custom colors
- Severity levels: High, Medium, Low
- Kanban board view
- Reminders and notifications
- No time tracking, no recurring tasks, no templates

**Implementation:**

1. **Backend (`/app/backend/routes/task_management.py`):**
   - Full CRUD for Tasks, Labels, Milestones
   - Department-based visibility filtering
   - Role-based permissions (Admin/CEO/Director can manage labels/milestones)
   - Task comments with mentions
   - Activity logging for all task changes
   - Watch/Unwatch functionality
   - Widget integration endpoint for dashboard

2. **Frontend Pages:**
   - `TaskManagement.js` - Main page with 4 tabs:
     - **List View**: Table with task info, sortable, filterable
     - **Kanban Board**: 4 columns (Open, In Progress, In Review, Closed)
     - **Milestones**: Progress tracking with task counts
     - **Labels**: Admin management (color picker, preview)
   - `TaskDetail.js` - Full task view with:
     - Comments section with add/delete
     - Activity timeline
     - Sidebar: Details, Assignees, Reporter, Watchers
     - Quick status change buttons
     - Edit/Delete actions

3. **Features:**
   - Task creation with all fields (title, description, severity, status, department, assignees, milestone, labels, due date, reminder)
   - Auto-generated task numbers (TASK-00001)
   - Clickable rows in list view
   - Quick status change from Kanban card dropdown
   - Search by title, task number, description
   - Filters: Department, Severity

4. **Navigation:**
   - Added to all modules under "Requests" section
   - Accessible at `/tasks` and `/tasks/:taskId`

**Testing Results (iteration_74.json):**
- Backend: 100% (20/20 tests passed)
- Frontend: 100% - All features verified
- All CRUD operations working
- Role-based access working
- Department visibility working

**Files Created:**
- `/app/backend/routes/task_management.py` (782 lines)
- `/app/frontend/src/pages/TaskManagement.js`
- `/app/frontend/src/pages/TaskDetail.js`

**Files Modified:**
- `/app/backend/routes/__init__.py` - Added task_management router
- `/app/frontend/src/App.js` - Added routes
- `/app/frontend/src/layouts/DashboardLayout.js` - Added Tasks to navigation
- `/app/frontend/src/components/widgets/ActionItemsWidget.js` - Added "View All" link

---

## Previous Session - March 23, 2026 (Session 6)

### Complete Distribution Module UI Redesign ✅

Applied modern emerald-themed styling to all 4 tabs in Distributor Detail:
1. ShipmentsTab.jsx (Stock In)
2. DeliveriesTab.jsx (Stock Out)
3. SettlementsTab.jsx
4. BillingTab.jsx

### Deployment Fix ✅

Added health check endpoints for Kubernetes deployment:
- `GET /health` - Root level
- `GET /api/health` - Under API prefix
- Made startup events non-blocking

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
