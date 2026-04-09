# Sales CRM & Distribution Management Application

## Core Architecture
- **Frontend**: React + Shadcn/UI + Tailwind CSS
- **Backend**: FastAPI (Python)
- **Database**: MongoDB

## Completed Features

### Distribution Module
- [x] Stock Out, Factory Return, Settlement, CEO/Admin Delete
- [x] Billing Reconciliation Two-Entry System with expandable weekly details
- [x] Reconciled Two-Entry View, Draft Note Deletion reverts reconciliation
- [x] Stock Dashboard — real-time inventory per SKU with bottle tracking, weekly averages, days remaining

### Monthly Performance Tracking Module (NEW - 2026-03-31)
- [x] **Revenue Metrics**: Target (from Target Setup Module), Achievement %, Revenue Lifetime (as-on-date), Revenue This Month (all accounts), Revenue from New Accounts This Month — each with manual override & reset
- [x] **Account Metrics (from Accounts collection)**: Existing accounts lifetime count, New accounts onboarded this month (by onboarded_month/year at account level), Inline account list with expand/collapse (show 3, expand to see all)
- [x] **Pipeline Metrics (from Leads)**: Status-wise breakdown table (Status | No of Leads | Pipeline Value) using estimated_monthly_revenue (INR). Clickable status rows navigate to Leads page with filter. Leads targeting next month, Coverage ratio
- [x] **Collections/Outstanding**: Total outstanding, Aging buckets (0-30, 31-60, 61-90, 90+), Account-level details (expandable)
- [x] **Activity Metrics**: Two sections — Total Activities (Messages, Calls, Customer Visits, Emails) and Unique Customers Reached (distinct lead_ids per type). Visit/Call Productivity
- [x] **Support Metrics**: Category badges (Pricing, Logistics, Marketing, Collections, Management, Product), Remarks
- [x] **Approval Workflow**: Draft > Submitted > Approved/Returned, locked once approved
- [x] **Month-on-Month Comparison**: Last 3 months, editable Revenue/Outstanding rows. Existing Accounts = cumulative, New Accounts = onboarded that month
- [x] **Performance KPIs**: Achievement %, Pipeline Coverage, Outstanding Ratio, Visit/Call Productivity, Conversion Rate
- [x] **Integration**: Linked to Target Setup Module for monthly targets per resource
- [x] **UI Redesign (2026-04-01)**: Full glass-morphism overhaul — gradient top bars, backdrop-blur cards, SummaryTile components matching HomeDashboard TaskMetricsWidget, gradient KPI cards, styled comparison table, dark mode support
- [x] **Bug Fixes (2026-04-01)**: Pipeline status dots use proper per-status colors from useLeadStatuses hook, Activity metrics query correct `activities` collection (was `lead_activities`), Pipeline row clicks include `assigned_to` resource filter in navigation URL
- [x] **Comparison Table Enhancements (2026-04-01)**: Alternate row colors (zebra striping), selected month is now the last column with 2 previous months before it (e.g., March selected → Jan, Feb, Mar)
- [x] **Multi-Resource Selection (2026-04-01)**: Resource dropdown is now multi-select with Select All, aggregated metrics across resources, Save/Submit disabled for multi-resource views
- [x] **Territory/City/Resource View (2026-04-01)**: Cascading filters like Leads page — Territory dropdown filters Cities, City dropdown filters Resources. "All" options at each level. Data aggregates across all matching resources. Backend endpoints added for territories-for-plan, cities-for-plan
- [x] **Target Planning Enhancements (2026-04-01)**: Resource eligibility changed from hardcoded roles to department-based filter (Sales/Admin). Resource and SKU allocations are now independent — each gets the full city budget separately
- [x] **Multi-Brand Grid (2026-04-01)**: Current Brand Details section in Lead form converted from single-brand form to editable multi-brand grid. Add/Delete rows, alternating colors, backward compatible with legacy single-brand data. LeadDetail page shows read-only brands table
- [x] **Final Tweaks (2026-04-01)**: Next Month Pipeline tile (dynamic month name), Account Amount column (avg_sales → estimated_value → manual override) with inline AccountValueCell, Clickable Leads Targeting Next Month row navigating to /leads with target_closure filters. Revenue override fields persisted in save endpoint.
- [x] **UI Redesign (2026-04-02)**: Complete redesign of Performance Tracker from glass-morphism/gradient to Swiss/high-contrast aesthetic. Summary tiles use text-2xl/3xl font sizes in a 1px-gap Swiss grid. Pipeline statuses show colored dots instead of hyperlink text. Leads Targeting Next Month is a block CTA. All gradients and backdrop-blur removed. Clean flat cards with white bg and slate-200 borders.

### Investor Module (2026-04-02)
- [x] **Annual Business Plan**: FY Summary KPIs (Revenue, Gross Margin, EBITDA, Net Profit, Cash Balance, Key Customers, New Customers Target), Revenue Build-Up table (4 streams with targets/% of total/growth drivers), Full P&L Statement (11 line items with FY Target vs Last FY Actual vs Variance)
- [x] **Monthly Updates**: Month navigator, Quick Stats (Revenue, Gross Revenue, New Customers, Orders Won with auto-computed actuals from CRM), Monthly P&L with Target vs Actual vs Variance, Key Updates list, P&L Override with Reset to Auto
- [x] **Comments System**: Section-level commenting for all sections (summary, pnl, revenue_buildup, priorities, risks, support, monthly_pnl, monthly_updates). Any role can comment. Authors and Admins can delete.
- [x] **RBAC**: CEO/Director/Admin = Editor mode (editable fields, Save). Investor = Read-only + commenting.
- [x] **Auto-Computed CRM Data**: YTD Revenue, Prev FY Revenue, Total Accounts, Outstanding — live from invoices/accounts collections
- [x] **Swiss Design**: rounded-none, JetBrains Mono for numbers, Cabinet Grotesk headings, 1px slate borders, no gradients
- [x] **API Endpoints**: GET/PUT /api/investor/plan, GET/PUT /api/investor/monthly/{year}/{month}, GET/POST/DELETE /api/investor/comments
- [x] **Navigation**: Added to sidebar under Lead & Sales Operations

### Key API Endpoints — Investor Module
- `GET /api/investor/plan?fy=FY2025-2026`
- `PUT /api/investor/plan`
- `GET /api/investor/monthly/{year}/{month}`
- `PUT /api/investor/monthly/{year}/{month}`
- `GET /api/investor/comments?section=X&fy=X&year=X&month=X`
- `POST /api/investor/comments`
- `DELETE /api/investor/comments/{comment_id}`


### Marketing Management Module (2026-04-02)
- [x] **Content Calendar**: Monthly/Weekly/Daily views with auto-events (28 global + Indian holidays), clickable cells to plan posts, post pills with status colors, today highlight
- [x] **Post Planning CRUD**: Date, Category, Content Type (Reel/Image/Video/Other), Concept, Message, Platform multi-select (LinkedIn/WhatsApp/YouTube/Instagram/Facebook), Status workflow (Draft → Review → Scheduled → Published)
- [x] **Master Data Management**: Categories (CRUD with color), Platforms (enable/disable toggle), Custom Events (CRUD, MM-DD format)
- [x] **Module Context**: Marketing as separate module context in sidebar switcher, with Content Calendar and Masters nav items
- [x] **RBAC**: Added to Tenant Settings and Platform Admin module toggles (marketing_calendar, marketing_masters)
- [x] **Design**: Corporate minimalist — white backgrounds, 1px slate borders, blue-600 accents, clean typography
- [x] **Drag & Drop**: HTML5 native drag and drop for rescheduling posts across calendar dates
- [x] **Metrics Bar**: Total Posts, Events, Reels, and category breakdowns per month
- [x] **List View (2026-04-06)**: Table view toggle with Date/Concept/Category/Type/Platforms/Status columns. Filters: month, year, status, category dropdowns. Row click navigates to detail page.
- [x] **Post Detail Page (2026-04-06)**: Dedicated page at /marketing-post/:postId. Shows concept, message/caption, platform links placeholder, workflow status progression, date/category/content-type/created-by metadata, platform badges. Edit mode with inline form fields. Delete with redirect. Back navigation to calendar.
- [x] **Platform Links & Analytics (2026-04-06)**: Per-platform URL tracking and analytics capture (views, likes, comments, shares, subscribers_added). Aggregated totals summary. Edit mode for updating links/metrics. Open external link button. Dedicated PUT /api/marketing/posts/{id}/links endpoint with validation.
- [x] **Spreadsheet Upload/Download (2026-04-06)**: Download empty Excel template with sample row + Instructions sheet. Upload filled .xlsx/.csv with preview (validation for missing date, missing concept, invalid content type). Confirm to replace all posts for the month. Export current month's data as .xlsx. Slide-out Sheet UI with 3-step flow (choose → preview → confirm).
- [x] **API Endpoints**: GET /api/marketing/calendar, CRUD /api/marketing/posts, GET /api/marketing/posts/{id}, PUT /api/marketing/posts/{id}/status, PUT /api/marketing/posts/{id}/links, GET /api/marketing/template, GET /api/marketing/export, POST /api/marketing/upload-preview, POST /api/marketing/upload-confirm, /api/marketing/categories, /api/marketing/platforms, /api/marketing/events

### Production QC Tracking Module - Phase 1 (2026-04-08)
- [x] **Backend Route**: `/app/backend/routes/production_qc.py` with full CRUD for QC Routes, Production Batches, Rejection Cost Rules, and Stats
- [x] **QC Route Master**: Define SKU-specific QC flows (e.g., QC Stage 1 → QC Stage 2 → Labeling → Final QC). One route per SKU. Visual flow with color-coded stage badges.
- [x] **Production Batches**: Create batches with SKU, batch code, production date, crates, bottles/crate, production line. Auto-calculates total bottles. Initializes stage balances from QC route.
- [x] **Batch Detail Page**: Shows batch info grid, visual QC stage flow with RECV/PASS/REJ/PEND counters, stage detail table, and summary (unallocated/rejected/delivery ready).
- [x] **Rejection Cost Rules**: CRUD for configuring cost per unit per stage with cost components.
- [x] **Production Stats**: Aggregated stats (total/active/completed batches, total crates, rejections).
- [x] **Navigation**: Added "Production Batches" and "QC Routes" to Production context sidebar.
- [x] **Routes**: `/production-batches`, `/production-batches/:batchId`, `/qc-routes`
- [x] **Collections**: `qc_routes`, `production_batches`, `rejection_cost_rules` (in tenant DB)

### Production QC Tracking Module - Phase 2 (2026-04-08)
- [x] **Stage Movement**: Move crates from unallocated → first stage, or from previous stage's passed → next stage. Partial quantity support.
- [x] **Inspection Recording**: Record pass/reject at any stage with auto-calculated rejected count (inspected - passed). Rejection reason field appears when rejected > 0.
- [x] **Stage Balance Tracking**: Each stage tracks received/pending/passed/rejected counters in real-time.
- [x] **Batch Status Transitions**: Automatic status updates (created → in_qc → in_labeling → in_final_qc → completed) based on stage type during movement.
- [x] **Activity Log**: Merged timeline of movements and inspections with user attribution and timestamps.
- [x] **Validations**: Cannot move more than available, cannot inspect more than pending, passed+rejected must equal inspected.
- [x] **StageCard UI**: Inline "Receive Stock" and "Record Inspection" forms within each stage card. Source label shows available quantity.
- [x] **Collections**: `stage_movements`, `inspections` (in tenant DB)
- [x] **Endpoints**: POST /api/production/batches/{batch_id}/move, POST /api/production/batches/{batch_id}/inspect, GET /api/production/batches/{batch_id}/history
- [x] **Testing**: 16/16 backend tests passed, all frontend UI tests verified (iteration_120)

### Production QC Tracking Module - Rejection in Bottles (2026-04-08)
- [x] **Bottle-Level Rejection**: Changed rejection tracking from crates to individual bottles. All inspected crates pass through; defective bottles tracked separately.
- [x] **Inspection Form Simplified**: Two fields — "Crates Inspected" and "Rejected Bottles" (removed old Passed field). Max bottles validation = crates × bottles_per_crate.
- [x] **Unit Labels**: Stage cards show "crates" under Received/Pending/Passed and "bottles" under Rejected. Summary bar also labeled.
- [x] **Activity Log**: Updated format — "X crates inspected, Y bottles rejected" or "all passed".
- [x] **Backend**: Removed `passed + rejected = inspected` constraint. `qty_passed` auto-set to `qty_inspected`.
- [x] **Testing**: 9/9 backend + all frontend tests passed (iteration_121)

### Rejection Tracking Enhancements (2026-04-08)
- [x] **Rejection Reasons Master Data**: CRUD page at `/rejection-reasons` for managing predefined rejection reasons. Duplicate name validation.
- [x] **Dropdown-Driven Reasons**: Inspection form now shows rejection reason as a dropdown populated from master data (replaces free-text input).
- [x] **Rejection Summary on Batch Detail**: Collapsible section showing Resource | Date | Stage | Bottles Rejected | Reason with totals row.
- [x] **Rejection Report Page**: Dedicated page at `/rejection-report` with filters (date range, batch, stage type). Summary cards: Total Rejected, By Resource, By Date. Detail table with all rejection records and totals footer.
- [x] **Navigation**: Added "Rejection Reasons" and "Rejection Report" to Production sidebar.
- [x] **Collections**: `rejection_reasons` (in tenant DB)
- [x] **Endpoints**: CRUD /api/production/rejection-reasons, GET /api/production/rejection-report
- [x] **Testing**: 15/15 backend + all frontend tests passed (iteration_122)

### Inspection Editable Grid & QC Team Master (2026-04-09)
- [x] **QC Team Master**: New CRUD page at `/qc-team` for managing QC inspection team members (name, role). Duplicate name validation.
- [x] **Editable Rejection Grid**: Inspection form now shows a table grid with columns: Resource (dropdown from QC Team master), Date (date picker, defaults to today), Bottles Rejected (number), Reason (dropdown from Rejection Reasons master).
- [x] **Add/Remove Rows**: "Add" button to add new rejection rows; trash icon to remove rows.
- [x] **Backend Model Updated**: `InspectionRecord` now accepts `rejections: List[{resource_id, resource_name, date, qty_rejected, reason}]` array. Total rejected validated against max bottles (crates x bottles/crate).
- [x] **Rejection Summary**: Batch Detail section now expands individual rejection entries per resource/date from the `rejections` array.
- [x] **Rejection Report**: Now shows per-entry rows (one row per resource/date/reason) instead of per-inspection.
- [x] **Activity Log**: Shows per-resource rejection details under each inspection event.
- [x] **Navigation**: "QC Team" added to Production sidebar.
- [x] **Collections**: `qc_team` (in tenant DB)
- [x] **Endpoints**: CRUD /api/production/qc-team
- [x] **Testing**: 14/14 backend + all frontend tests passed (iteration_123)

### UI Polish: Themed Dropdowns & Auto-Calculated Passed (2026-04-09)
- [x] **Shadcn Select Dropdowns**: Replaced native `<select>` elements in the rejection grid with Shadcn `Select` component (Radix UI) for consistent app theming.
- [x] **Auto-Calculated Passed Bottles**: When crates inspected is entered, shows inline: Total bottles, Rejected count, and auto-calculated Passed count = (crates x bottles/crate) - total rejected.

### Inspection Grid: Per-Row Crates & COGS-Style Sizing (2026-04-09)
- [x] **Crates Inspected per Resource**: Each grid row now has its own "Crates Inspected" column. No more top-level crates field.
- [x] **Renamed Column**: "Bottles" → "Rejected Count" throughout (grid, summary, report).
- [x] **COGS-Style Grid**: Inputs are h-10, p-3 padding, text-sm font, rounded-xl border — matches COGS calculator rows.
- [x] **Passed Column**: Auto-calculated per row (crates × bottles/crate - rejected) in green. Totals footer sums all.
- [x] **Backend**: `InspectionRecord` no longer has top-level `qty_inspected`; derived from sum of entry-level. `RejectionEntry` now includes `qty_inspected` per resource.
- [x] **Testing**: 8/8 backend + all frontend tests passed (iteration_124)
- [x] **CRUD**: Create/read/update/delete meeting entries with date, title, periodicity, purpose, participants, minutes, action items
- [x] **Full Page Views**: List page, dedicated detail page (/meeting-minutes/:id), dedicated edit page (/meeting-minutes/:id/edit), new meeting page (/meeting-minutes/new)
- [x] **Large Textareas**: Discussion points and action items use multi-line textareas (rows=3) for big text
- [x] **Auto-Task Creation**: Action items automatically create tasks in task management (tasks_v2) with linked_entity_type='meeting', always in "open" status
- [x] **Assignee Picker (2026-04-07)**: Replaced plain `<select>` with rich dropdown showing avatar initials, name, and role/department — matching Task Details screen pattern. Includes search functionality.
- [x] **Simplified Action Items (2026-04-07)**: Removed due date and status fields from action item form. All action items auto-create tasks in "open" status. Status/due date managed via Task Management module.
- [x] **Mandatory Assignee (2026-04-07)**: Frontend toast + backend 400 validation blocks saving action items without an assignee selected.
- [x] **Task-Modified Lock (2026-04-07)**: Action items whose linked tasks have been edited from Task Management become read-only in Meeting Minutes (amber border, lock badge "Updated from Tasks — read only", disabled inputs, no delete). Backend also protects task-modified items from being altered or deleted via PUT.
- [x] **RBAC Matrix (2026-04-07)**: Added Marketing category (Content Calendar, Marketing Masters) and Meeting Minutes to the RBAC permission matrix in both Tenant Settings and Platform Admin. Backend `MODULE_CATEGORIES` and `MODULE_LABELS` updated in `/app/backend/models/role.py`.
- [x] **Participant-Only Visibility (2026-04-07)**: Meeting minutes list and detail endpoints now filter by participant. Non-admin users only see meetings where they are a participant or the creator. Admins (CEO, Director, Admin, System Admin) see all meetings.
- [x] **Periodicity**: Weekly, Monthly, Quarterly, Ad-hoc with colored badges
- [x] **Purpose**: Multi-select from Sales, Production, General, Finance, Administration, Investors, Marketing
- [x] **Participants**: Multi-select from all team members with search, avatar initials display
- [x] **Meeting Minutes**: Bullet-point list format with add/remove functionality
- [x] **Action Items**: Description + assignee selector (from all team members) with add/remove
- [x] **Filters**: Month, year, periodicity, purpose (multi-select), participant dropdowns
- [x] **Edit History**: Full tracking — each edit records edited_by, edited_by_name, edited_at, shown in detail page sidebar
- [x] **Navigation**: Menu item alongside Daily Status with NotebookPen icon
- [x] **API Endpoints**: CRUD at /api/meeting-minutes with filter support

### Multi-Department User Assignment (2026-04-06)
- [x] **Schema Change**: `user.department` updated from `str` to `List[str]` (backend + frontend)
- [x] **Multi-Select UI**: Team Management form uses multi-select checkboxes for department assignment
- [x] **Codebase-Wide Fix (2026-04-07)**: Fixed all frontend components treating `user.department` as a string — `HomeDashboard.js`, `SalesROIPanel.js`, `AppContextContext.js`, `TaskDetail.js`, `TaskManagement.js` now use `Array.isArray()` checks with `.some()` for department matching

### Branding Generalization (2026-04-06)
- [x] **Splash Screen**: Replaced Nyla logo with generic CRM icon cluster (BarChart3 + TrendingUp + Users), dark navy gradient, "Sales CRM / Manage. Track. Grow."
- [x] **Login Left Panel**: Replaced Nyla bottle mountain image with animated CSS dashboard illustration — Revenue Pipeline chart, Deals Won / Contacts / Target metrics, "Your Sales, Supercharged." copy, feature pills (Analytics, Team CRM, Reports, Automation)
- [x] **Sidebar Fallback**: Changed from Nyla logo image to initial letter with "Sales CRM" default name. Tenant-specific branding still loads from database when available.

### Bottle Preview Bug Fix (2026-04-02)
- [x] Fixed download mismatch: download now measures actual rendered logo-to-bottle ratio from DOM via getBoundingClientRect() for WYSIWYG output


### Lead & Account Enhancements (2026-03-31)
- [x] Lead edit form: Actual Onboarded Month & Year, Target Closure Month & Year dropdowns
- [x] Account edit form: Actual Onboarded Month & Year dropdowns + read-only display
- [x] Lead-to-account conversion propagates onboarded_month/year

## Key API Endpoints
### Performance Tracking
- `GET /api/performance/target-plans`
- `GET /api/performance/resources-for-plan/{plan_id}`
- `GET /api/performance/generate?plan_id=X&resource_id=Y&month=M&year=Y`
- `POST /api/performance/save`
- `POST /api/performance/{id}/submit`
- `POST /api/performance/{id}/approve`
- `POST /api/performance/{id}/return`
- `GET /api/performance/comparison`
- `POST /api/performance/comparison/override`
- `DELETE /api/performance/comparison/override`
- `POST /api/performance/account-value-override`
- `DELETE /api/performance/account-value-override`

### Distribution
- `GET /api/distributors/{id}/stock-dashboard`
- `GET /api/distributors/{id}/monthly-reconciliation`

## Upcoming Tasks (P1)
- Auto-generate Provisional Invoice (on shipment -> "delivered")
- Build Reporting Module
- Manager Dashboard (team-wise comparison, activity vs outcome)
- Leadership Dashboard (territory trends, pipeline health)

## Backlog (P2)
- Task email notifications, First-login Password Change, Email Invoice Sharing
- Settlement Auto-scheduling, Dashboard analytics, server.py refactoring
- Alerts: low achievement, high outstanding, activity drops, no new accounts
