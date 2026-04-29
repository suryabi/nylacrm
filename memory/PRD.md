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

### Hierarchical Inspection Structure (2026-04-09)
- [x] **Entry-Level Grouping**: Each inspection entry = Resource + Date + Crates Inspected. Under each entry, multiple rejection items (Count + Reason).
- [x] **Card-Based UI**: Entry cards with header (Resource dropdown, Date, Crates) and sub-section for rejection details. "+ Add Entry" for new resource, "+ Add Rejection" for sub-items.
- [x] **Backend Model**: `InspectionRecord.entries[]` where each `InspectionEntry` has `resource_id, resource_name, date, qty_inspected, rejections: [{qty_rejected, reason}]`.
- [x] **Rejection Report**: Expands nested `entries[].rejections[]` into flat rows per reason.
- [x] **Activity Log**: Shows per-entry nested details (resource, date, crates, rejection breakdown).
- [x] **Totals Bar**: Aggregated crates, rejected, passed across all entries.
- [x] **Testing**: 13/13 backend + all frontend tests passed (iteration_125)

### Rejection Summary: Metrics Cards + Filterable Detail Grid (2026-04-09)
- [x] **Always-Visible Metrics**: 4 cards in gradient header — Total Rejected (big number), By Resource (progress bars), By Reason (amber bars), By Stage (blue bars). Top 3 shown per category.
- [x] **Expandable Detail View**: Toggle section with filter row (Resource, Date, Reason, Stage dropdowns) and polished grid (dark header, alternating rows, colored badges, totals footer).
- [x] **Grid Visual Upgrades**: Red pill badges for rejected count, emerald passed numbers, amber reason pills, slate stage tags, alternating row backgrounds, hover highlight.
- [x] **Shadcn UI Consistency (2026-04-09)**: Replaced native date `<select>` in Rejection Summary filters with Shadcn `Select` — all 4 filters now use consistent Shadcn components. Replaced native module context switcher `<select>` in sidebar (`DashboardLayout.js`) with Shadcn `Select` with dark theme styling matching the sidebar.
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

### Module-Based Department Default Filter (2026-04-10)
- [x] "All Tasks" tab department filter defaults to the current module's department (Sales→Sales, Production→Production, Distribution→Distribution, Marketing→Marketing)
- [x] Department filter auto-updates when module is switched via sidebar module selector
- [x] New Task form defaults department to current module's department
- [x] Uses `useAppContext()` → `currentContext` mapped via `MODULE_DEPT_MAP`

### Marketing Comments for Posts & Events (2026-04-10)
- [x] **Reusable CommentThread component**: Used in both EventPanel (events) and MarketingPostDetail (posts)
- [x] **Backend**: `GET/POST /api/marketing/comments/{entity_type}/{entity_id}`, `DELETE /api/marketing/comments/{comment_id}` — single `marketing_comments` collection with entity_type (post/event)
- [x] Comments show author name, avatar initials, relative timestamp, and delete button (author-only)
- [x] Renamed "Marketing Team Tasks" to "Marketing Team - Tasks & Requests" in EventPanel

### Tasks & Requests Two-Tab Restructure (2026-04-10)
- [x] **Renamed** "Tasks" module to "Tasks & Requests" across all sidebar entries
- [x] **"My Tasks" tab** (default): Shows tasks assigned to or created by the logged-in user. Personal metrics: Total, Assigned to Me, Created by Me, In Progress, Overdue, High Priority
- [x] **"All Tasks" tab**: Department-level view with multi-select department filter defaulting to user's departments. Department metrics: Total, Open, In Progress, In Review, Overdue, Closed
- [x] **Department multi-select**: Checkbox-based dropdown with Select All, defaults to user's departments
- [x] **Backend**: Added `view=mine` (combined assigned+created query), comma-separated `department_id` support, personal stats (my_total, my_overdue, my_in_progress, my_high_severity, my_completed)
- [x] Both tabs support List and Board sub-views. Milestones and Labels remain under All Tasks
- [x] Clickable metric cards filter the task list dynamically
- [x] **Month/Year filters** replace date_from/date_to — defaults to current month/year, uses Shadcn Select
- [x] **SKU filter** — dropdown populated from batch SKUs, filters rejections by SKU
- [x] **Backend**: Added `month`, `year`, and `sku_id` query params to `/api/production/rejection-report`
- [x] All filters use consistent Shadcn Select components, responsive grid layout
- [x] **Dynamic Batch Dropdown (2026-04-10)**: Batch dropdown dynamically filters based on selected SKU + Month + Year (uses `useMemo` on production_date). Resets batch selection when no longer valid.
- [x] **Rejection Reason Filter (2026-04-10)**: New "Reason" dropdown populated from `/api/production/rejection-reasons` master data. Backend accepts `rejection_reason` query param for case-insensitive row filtering. 8-column filter grid.

### Marketing Calendar Events (2026-04-10)
- [x] **Calendar Events CRUD** - Full events with name, date/time, description, location, budget, attendees, event type (from master), status tracking (Planned → In Progress → Completed / Cancelled)
- [x] **Requirements list** — Free-text items (e.g. "500 brochures", "2 standees")
- [x] **Marketing Team Tasks** — Action items assigned to team members with due dates and status (Pending/In Progress/Done)
- [x] **Event Types Master Data** — Configurable list (Conference, Trade Show, Webinar, Product Launch, Workshop, Meetup, Press Event) with color-coded dots
- [x] **Calendar display** — Events shown as distinct cards with colored left border (status), type badge, time, location, and task progress
- [x] **"New Event" button** alongside "New Post" in calendar header
- [x] **EventPanel** side sheet for creating/editing events with all fields
- [x] **Event Types tab** added to Marketing Masters page

### Responsive Production Module (2026-04-10)
- [x] **ProductionDashboard.js**: Mobile vertical pipeline flow with down arrows, 2-col summary cards on mobile, 4-col on tablet, 7-col on desktop
- [x] **ProductionBatches.js**: Stacked search/filters on mobile, 2-col stats grid, responsive batch cards with wrapped layout
- [x] **BatchDetail.js**: Responsive info cards, stage cards with compact balance row, stacked move/inspect forms, scrollable rejection table, responsive inspection entry grid

### Production Dashboard - Landing Page (2026-04-10)
- [x] **New `/api/production/dashboard` endpoint** aggregating stock by SKU across all batch stages
- [x] **ProductionDashboard.js** as the landing page for Production module — visual pipeline flow per SKU
- [x] **Summary cards**: SKUs, Batches, Total Crates, Unallocated, In QC Stages, Ready for Warehouse, Rejected
- [x] **SKU Pipeline visualization**: Unallocated → QC Stage 1 → QC Stage 2 → Labeling → Final QC → Ready for Warehouse
- [x] Each stage node shows crates count, pending/passed/rejected breakdown, and progress bar
- [x] Color-coded: slate (unallocated), amber (QC), violet (labeling), emerald (final QC), teal (warehouse-ready)
- [x] Set as default route when switching to Production module

### Batch Creation & pH Tracking (2026-04-10)
- [x] **Removed Production Line field** from batch creation form and detail page
- [x] **Added pH Value dropdown** (7.5, 8.5) to batch creation form
- [x] **pH Badge in batch list**: Compact colorful scale (amber→teal→blue gradient) with circle indicator and value
- [x] **pH Scale in batch detail**: Full-width gradient bar (red→green→blue→purple) with Acidic/Neutral/Alkaline labels, tick marks at 6-10, and large pH value display

### Distributor & Warehouse Flags (2026-04-14)
- [x] **is_self_managed flag**: Added to DistributorCreate/Update/Distributor models. Backend persists on POST/PUT. Frontend: checkbox in create dialog, checkbox in edit mode (OverviewTab), "Self Managed" badge in distributor list table, indicator in distributor detail overview.
- [x] **is_factory flag**: Added to DistributorLocationCreate/Update/DistributorLocation models. Backend persists on POST/PUT. Frontend: checkbox in add location dialog, "Factory" badge on location cards. Dropdown endpoint returns is_factory field.

### Warehouse Transfer: Production → Factory Warehouse (2026-04-14)
- [x] **Transfer endpoint**: `POST /api/production/batches/{batch_id}/transfer-to-warehouse` — moves warehouse-ready crates to a selected factory warehouse. Validates quantity <= available (total_passed_final - transferred_to_warehouse).
- [x] **Factory warehouse stock**: New `factory_warehouse_stock` collection tracks per-warehouse per-SKU stock quantities. Upserted on each transfer.
- [x] **Transfer history**: New `warehouse_transfers` collection records each transfer with batch, warehouse, quantity, user, timestamp.
- [x] **Batch tracking**: `transferred_to_warehouse` field on production_batches tracks total crates transferred out.
- [x] **Factory warehouses listing**: `GET /api/production/factory-warehouses` — returns all locations with is_factory=true, enriched with distributor name.
- [x] **Frontend (BatchDetail.js)**: WarehouseTransferSection component — shows available crates, factory warehouse dropdown, quantity input, transfer history table. Only visible when warehouse-ready > 0.

### Stock In: From Factory Warehouse (2026-04-14)
- [x] **Shipment model**: `PrimaryShipmentCreate` now accepts optional `source_warehouse_id`. Backend validates factory warehouse, stores `source_warehouse_id` and `source_warehouse_name` in shipment doc.
- [x] **Stock deduction on confirm**: When confirming a shipment with a source warehouse, validates sufficient stock per SKU in `factory_warehouse_stock`. If insufficient, rejects with detailed error. On success, deducts quantities from factory warehouse stock.
- [x] **Frontend (ShipmentsTab)**: "From Factory Warehouse" dropdown in create shipment dialog, populated with factory warehouses, defaults to default warehouse. "From" column in shipments table showing source warehouse name.

### Distributor Billing Approach Configuration (2026-04-15)
- [x] **Two approaches**: "Margin Applied Upfront with Reconciliation" (margin_upfront) and "No Upfront Margin – Post-Sale Adjustment" (cost_based). Default: margin_upfront.
- [x] **Profile tab**: Shows billing approach in Commercial Terms section (read-only display + editable dropdown in edit mode).
- [x] **Commercial tab**: Banner at top of Margin Matrix showing active billing approach with color coding (emerald for margin_upfront, amber for cost_based).
- [x] **Backend**: `billing_approach` field on Distributor model. Create defaults to margin_upfront. Stored and returned on all CRUD operations.

### Cost Cards Module (2026-04-15)
- [x] **Global Master Pricing**: Cost Card per City + SKU with cost_per_unit (2 decimal places). Single master applicable to all distributors by default.
- [x] **Inline Editable Grid**: Spreadsheet-style editing — click cell to edit, Save Changes button commits all pending changes. Add Row for new entries with City/SKU dropdowns.
- [x] **Filters**: City and SKU dropdown filters with Clear button. Entry count shown.
- [x] **Bulk Save**: Single "Save Changes" with badge showing pending change count. Upserts new and updated rows.
- [x] **For-Distributor API**: `GET /api/cost-cards/for-distributor/{id}` returns effective prices with override info from distributor margin matrix.
- [x] **Sidebar**: Added under Distribution module as "Cost Cards" with DollarSign icon.
- [x] **Backend**: Full CRUD + bulk save at `/api/cost-cards`. Collection: `cost_cards`.

### Factory Warehouse Stock in Distributor Dashboard (2026-04-15)
- [x] **Stock Dashboard Integration**: The distributor Stock Dashboard now shows factory warehouse stock (from production transfers). Includes a dedicated "Factory Warehouse Stock" card with per-warehouse per-SKU breakdown, a "Wh. Stock" column in the SKU table, and totals in the footer.
- [x] **Backend**: `GET /api/distributors/{id}/stock-dashboard` now queries `factory_warehouse_stock` collection for the distributor's factory warehouse locations. Returns `factory_warehouse_stock` in totals, `factory_warehouses` array, and per-SKU `factory_warehouse_stock` field.

### Distributor & Warehouse Delete with Cascading (2026-04-15)
- [x] **Cascading Distributor Delete**: Hard delete distributor + all child data (locations, coverage, margins, assignments, shipments+items, deliveries+items, settlements+items, billing configs, invoices, reconciliations+items, debit/credit notes, linked user accounts). Returns deleted_counts per collection.
- [x] **Warehouse Hard Delete**: Hard delete warehouse location + related shipments/items and deliveries/items.
- [x] **Authorization**: Only CEO and System Admin roles can delete (is_delete_authorized check).
- [x] **Frontend Confirmation**: Delete button visible for CEO/SysAdmin in distributor header. Confirmation dialog lists all data to be deleted, requires typing exact distributor name, shows "cannot be undone" warning.

### Production QC: Stage Movement Fix (2026-04-17)
- [x] **Bug Fix**: Rejected stock was incorrectly propagating to next stages. When moving stock from one stage to another, ALL inspected crates were treated as "passed" regardless of bottle-level rejections.
- [x] **Root Cause**: In `record_inspection`, `passed = inspected_crates` without deducting rejected crate equivalents.
- [x] **Fix Applied**: `rejected_crate_equiv = rejected_bottles // bottles_per_crate`, `passed = inspected_crates - rejected_crate_equiv`. Uses floor division so only full crate equivalents of rejected bottles are deducted.
- [x] **File Changed**: `/app/backend/routes/production_qc.py` (lines 558-563 in `record_inspection`)
- [x] **Testing**: 10/10 backend tests + all frontend UI tests passed (iteration_137)
- [x] **Edge Cases Verified**: 0 rejections (all pass), < 1 crate equiv (all pass), exactly 1 crate equiv (1 deducted), > 1 crate equiv (correct deduction), floor division for partial crates

### Production Batch Detail Redesign (2026-04-18)
- [x] **Two-column layout**: Left = QC pipeline stages (col-span-7). Right = rejection summary + activity log (col-span-5).
- [x] **pH as inline badge**: Replaced large pH slider/scale with a color-coded badge (teal/sky/blue) next to batch code. Readable text-sm font.
- [x] **Monochrome stage cards**: Removed colorful stage-type backgrounds (blue/purple/emerald). Headers now use slate/monochrome with slate badge. Numbers stay readable at text-lg.
- [x] **Stage-level percentages**: Pass% and Reject% shown under Passed/Rejected values with quality micro-bar.
- [x] **Overall quality bar**: Slim bar with pass/reject % below summary row.
- [x] **Rejection panel on right**: Extracted RejectionPanel component with By Resource/By Reason breakdowns, expandable detail table with filters.
- [x] **Activity log on right**: Extracted ActivityLog component, collapsible.
- [x] **Reduced spacing**: gap-4 instead of gap-6, rounded-lg instead of rounded-xl, summary chips instead of big cards.
- [x] **Testing**: 14/14 frontend tests passed (iteration_140)

### Production QC: Stage-Level & Overall Pass/Reject Percentages (2026-04-18)
- [x] **Stage-level %**: Each stage card now shows pass% and reject% under Passed and Rejected values. Calculated as bottle-based quality rates: reject% = (rejected_bottles / (received_crates * bottles_per_crate)) * 100. Shows historical quality even after stock moves to next stage.
- [x] **Mini progress bars**: Green/red progress bar under each stage's balance row, visible when rejections exist.
- [x] **Overall Quality bar**: New section below summary cards showing total pass/reject % with full-width progress bar and total bottles count.
- [x] **Summary bar %**: Total Rejected card now shows rejection percentage.

### Inspection Form Redesign (2026-04-18)
- [x] **Gradient header**: Emerald gradient background with "Record Inspection" title, stage name, pending count, bottles/crate.
- [x] **Live stats bar**: Real-time counter showing crates, bottles, rejected (with %), passed (with %) and mini progress bar — updates as user types.
- [x] **Entry cards**: Clean white cards with "Inspector Entry" label, 3-column layout (Resource, Date, Crates Inspected), per-entry pass summary with color-coded % badge (green >=95%, amber >=80%, red <80%).
- [x] **Rejection rows**: Red-tinted qty field with red border, bordered row containers, "Add Row" button styled with red accent.
- [x] **Footer**: Remarks field and Submit button in clean white section.
- [x] **Testing**: 10/10 frontend features verified (iteration_138)

### Packaging Types — Multi-Context SKU Mapping (2026-04-19)
- [x] **Moved to Production**: Packaging Types nav now under Production section in sidebar
- [x] **SKU Packaging Config**: Each SKU has `packaging_config` with 3 contexts:
  - `production`: Options for production batches (default auto-selected in batch creation)
  - `stock_in`: Options for distributor delivery (default auto-selected in shipment dialog)
  - `stock_out`: Options for customer delivery
- [x] Each context supports multiple packaging types with one marked as default
- [x] **Production Batches**: Dropdown shows SKU's production packaging options; falls back to all types if none configured
- [x] **Shipment Dialog**: Added "Packaging" column; shows SKU's stock_in options with default pre-selected
- [x] **Testing**: 100% backend + frontend (iteration_142)

### Packaging Types Master (2026-04-19)
- [x] **New page**: `/packaging-types` — CRUD for packaging formats (Crate - 24, Carton - 6, etc.)
- [x] **Backend**: `GET/POST/PUT/DELETE /api/packaging-types` with duplicate name validation
- [x] **SKU Management**: Added packaging type dropdown to SKU create/edit form (stores `packaging_type_id`, `packaging_type_name`, `units_per_package`)
- [x] **Production Batches**: Replaced `bottles_per_crate` text input with Packaging Type dropdown. Auto-fills units from selected packaging type. SKU selection auto-fills packaging if defined.
- [x] **Sidebar**: Added "Packaging Types" nav item under "Product & SKU"
- [x] **Seeded data**: Crate - 24, Crate - 12, Carton - 6, Carton - 48
- [x] **Testing**: 13/13 tests passed (iteration_141)

### server.py Refactor — Phase 1 (2026-04-19)
- [x] **Extracted 7 new router modules** to reduce monolithic `server.py`:
  - `routes/target_planning.py` — Target plans, allocations, dashboards
  - `routes/master_locations.py` — Territory/State/City CRUD
  - `routes/proxies.py` — Quotes, weather proxy endpoints
  - `routes/reports.py` — SKU / Resource / Account performance + target allocation reports
  - `routes/daily_status.py` — Daily status CRUD, AI revision, team rollup
  - `routes/analytics.py` — Dashboard, pipeline-accounts, activity-metrics
  - `routes/bottle_preview.py` — Bottle preview image proxy + history
- [x] **server.py reduced**: 12,284 → 9,140 lines (~25.6% reduction, -3,144 lines)
- [x] **Preserves `init_master_locations` startup event** for seed data
- [x] **All route registrations consolidated** in `routes/__init__.py`
- [x] **Regression Test**: 41/41 backend tests pass via `/app/backend/tests/test_refactor_regression.py` (iteration_143)
- [x] **Status**: Safe to redeploy to production

### External Invoice Ingestion API (2026-04-28)
- [x] **POST `/api/accounts/{account_id}/invoices`** now dispatches by payload shape:
  - **External payload** `{invoiceNo, invoiceDate, grossInvoiceValue, netInvoiceValue, items[{itemId, quantity, rate, discount, batchNumber, expiryDate}], outstanding, creditNoteValue, ACCOUNT_ID, tenant_id}` → resolves SKUs by `master_skus.external_sku_id`, stores invoice with `id == invoiceNo`, source='external_api'.
  - **Legacy CRM payload** `{invoice_date, line_items[{sku_name, bottles, price_per_bottle}], notes}` → unchanged, computes COGS/logistics/margin and generates `INV-YYYYMMDD-XXXX`.
- [x] **PUT `/api/accounts/{account_id}/invoices/{invoice_no}`** updates an existing external invoice; preserves `created_at/created_by`, refreshes `updated_at/updated_by`.
- [x] **`account_id` in URI** accepts either the human ACCOUNT_ID code (e.g. `ORLO-HYD-A26-001`) or UUID.
- [x] **Validations**: tenant_id mismatch → 400, ACCOUNT_ID body-vs-URI mismatch → 400, invoiceNo body-vs-URI mismatch (PUT) → 400, duplicate invoiceNo (POST) → 400, missing invoice (PUT) → 404, account not found → 404. Unmatched external SKU IDs returned in `unmatched_external_item_ids` (and logged as warning).
- [x] **System COGS components delete protection**: `DELETE /api/master/cogs-components/{id}` now returns 400 for `is_system=true` (suggest toggle inactive instead) — fixes latent risk of permanent default loss.
- [x] **Files**: `backend/server.py` (POST dispatch + new PUT), `backend/services/external_invoices_service.py` (new helpers), `backend/routes/accounts.py` (mirror dispatch), `backend/routes/cogs_components.py` (system-delete guard).
- [x] **Testing**: 25/25 backend regression tests passed (iteration_144) covering this API + 10+ untested features from prior session (lead_type propagation, include_in_gop_metrics defaults, Return Reasons CRUD, distributor available-stock, Master COGS Components, custom_components merge).

### CORS — External Integrations (2026-04-28)
- [x] **Whitelisted `briefingiq.com` (incl. subdomains)** in CORS regex for browser-based partner integrations.
- [x] **Public CORS override middleware** for `/api/accounts/{*}/invoices` and `/api/accounts/{*}/invoices/{*}` — accepts ANY origin, handles OPTIONS preflight, returns `Access-Control-Allow-Origin: <origin>`, drops `Allow-Credentials` (Bearer-token-only auth on these routes). Server-to-server callers (curl/Postman/backend) unaffected since CORS is browser-only.
- [x] **Files**: `backend/server.py` (cors_origin_regex extended; new `_open_cors_for_external_invoices` middleware).
- [x] **Tested**: POST/PUT from `random-erp.io`, `app.briefingiq.com`, and no-Origin (S2S) all return 200 with correct ACAO headers; legacy CRM payload regression unaffected.

### COGS Calculator — Honor Master Sort Order Across All Components (2026-04-28)
- [x] **Bug**: Drag-and-drop ordering set in `/master/cogs-components` was being ignored for the 6 legacy components — they were rendered in hardcoded order with custom components appended after.
- [x] **Fix**: Replaced hardcoded column blocks with a single `orderedComponents.map()` driven by `sort_order` from the master.

### COGS Components — Logistics / Distribution / Gross Margin Now Calculator-Owned (2026-04-28)
- [x] **Removed** `outbound_logistics_cost`, `distribution_cost`, `gross_margin` from the COGS Components master. They are no longer "COGS components" — they're calculator-owned system columns.
- [x] **Backend**:
  - Auto-seed defaults reduced to 3 (Primary, Secondary, Manufacturing).
  - `GET /api/master/cogs-components` filters out the 3 reserved keys (legacy seeded rows are auto-purged on first list call).
  - `POST /api/master/cogs-components` rejects creation of any of the 3 reserved keys with 400.
  - `PUT /api/cogs/{sku_id}` recompute treats these 3 as ALWAYS active so existing math (Total COGS, Gross Margin ₹, Ex-Factory, Min Landing) is unchanged.
- [x] **Frontend Calculator**:
  - `orderedComponents` excludes the 3 reserved keys (master is the single source for dynamic columns).
  - 3 fixed system columns rendered after the dynamic columns at the end of the table (in fixed order: Outbound Logistics → Distribution → Gross Margin), using existing `row.outbound_logistics_cost`, `row.distribution_cost`, `row.gross_margin` fields. Distribution gets amber bg, others standard.
  - `isShown(key)` now hardcodes the 3 reserved keys to true, so `computeDerived` always includes Logistics in Total COGS and applies Gross Margin / Distribution percentages — preserves all calculations.
- [x] **Files**: `backend/routes/cogs_components.py`, `backend/server.py` (PUT recompute), `frontend/src/pages/COGSCalculator.js`.
- [x] **Verified**: Master shows 6 true COGS components (no Logistics/Distribution/Gross Margin). Calculator shows them as fixed columns at the end. PET row Total COGS 15.00 / Gross Margin 5.25 / Ex-Factory 20.25 / Min Landing 20.25 — identical to before.

### SKU-Level COGS Costs (Per-SKU Single Source) (2026-04-28)
- [x] **Each SKU now stores `cogs_components_values: Dict[str, Optional[float]]`** holding the unit price for each active master COGS ₹ component (Primary, Cap, Manufacturing, Bird Logo, Air Water Label, etc.). City no longer matters for these — single value per SKU regardless of city.
- [x] **SKU Management dialog** (Edit/Create) now includes a "COGS Costs" section showing all active master ₹ components as numeric inputs in a 2-col grid. System columns (Logistics, Distribution, Gross Margin) are NOT shown here — they remain calculator-owned.
- [x] **PUT `/api/master-skus/{id}`** merges `cogs_components_values` (does not replace whole dict). Sending `null` for a key removes it. Empty/blank values are pruned client-side before save.
- [x] **GET `/api/cogs/{city}` overlay**: each row's master ₹ component values are pulled from the SKU master and overlaid (legacy keys onto top-level fields, custom keys into `custom_components`). `master_sku_id` attached to each row. `total_cogs` and `minimum_landing_price` recomputed using overlaid values.
- [x] **PUT `/api/cogs/{cogs_id}` dispatch**: when a master-managed key is updated via the calculator, the change is dispatched to `master_skus.cogs_components_values` so it's reflected across all cities. System columns (logistics / distribution / gross_margin) stay per-city as before.
- [x] **Files**: `backend/server.py` (SKUCreate/SKUUpdate models, GET/PUT master-skus, GET/PUT /cogs), `frontend/src/pages/SKUManagement.js` (cogsComponents fetch + COGS Costs section + cleaned save).
- [x] **Testing**: 20/20 passed (iteration_146 + null-removal fix). Pytest regression file at `backend/tests/test_iteration_146_cogs_per_sku.py`. End-to-end verified: editing in SKU dialog → calculator shows new value across cities; editing in calculator → SKU master updated; system columns isolated per-city.

### Production — Rejection Cost Module (2026-04-28)
- [x] **New module under Production sidebar** — `/production/rejection-cost-config`. Matrix-style page where admin maps each (Stage × Rejection Reason) pair to a list of impacted COGS components via checkboxes.
- [x] **Backend**:
  - `GET /api/production/rejection-cost-config` returns active master ₹ components, distinct stages from active QC routes, master reasons, and existing mappings (single payload for the matrix UI).
  - `GET/POST/DELETE /api/production/rejection-cost-mappings` — POST is upsert on `(stage_name, reason_id)`. Validates reason exists; silently filters out unknown component keys.
  - `POST /api/production/rejection-cost-calculate` — body `{sku_id, stage_name, reason_id|reason_name, qty_rejected}` returns `{breakdown[], unit_cost, total_cost, missing_mapping?, missing_sku_values?}`.
  - `GET /api/production/rejection-report` enriched with `cost_of_rejection` per row (computed via bulk-loaded mappings + SKU master COGS values) and `total_cost` at top level. Rows without mapping flagged with `missing_mapping=true`.
  - **Removed** old per-stage `rejection_cost_rules` collection and endpoints — replaced by the richer per-(stage, reason) model.
- [x] **Cost formula**: `cost_of_rejection = qty_rejected × Σ(SKU.cogs_components_values[k] for k in mapping.impacted_component_keys)`. Stage-dependent because each (stage, reason) chooses different impacted components (early stages = fewer components, later stages include labels/etc.).
- [x] **Frontend**:
  - `/production/rejection-cost-config` matrix page with add-new-mapping form (stage + reason dropdowns), filter by stage, per-row checkbox grid, Save / Delete buttons.
  - `/rejection-report` now has "Cost of Rejection" column + total row footer; unmapped rows display `— not mapped` in amber.
  - `BatchDetail.js` QC inspection form: live ₹ preview next to each rejection row when qty>0 + reason selected (uses bulk-fetched mappings + SKU's `cogs_components_values`).
- [x] **Files**: `backend/routes/production_qc.py`, `frontend/src/pages/RejectionCostConfig.js` (new), `frontend/src/pages/RejectionReport.js`, `frontend/src/pages/BatchDetail.js`, `frontend/src/App.js`, `frontend/src/layouts/DashboardLayout.js`.
- [x] **Testing**: 22/22 passed (iteration_147) — 16 backend + 6 frontend. Pytest regression at `backend/tests/test_iteration_147_rejection_cost.py`. PET SKU verified: primary 7.5 + mfg 12.25, qty=10 → ₹197.50.

### Production — Rejection Cost: Per-SKU Scoping (2026-04-29)
- [x] **Refactored to per-SKU model.** Mapping uniqueness key changed from `(tenant_id, stage_name, reason_id)` to `(tenant_id, sku_id, stage_name, reason_id)`. Each SKU now has its own (Stage × Reason) → impacted-components matrix.
- [x] **Backend**:
  - `RejectionCostMappingUpsert` requires `sku_id` (422 if missing; 404 if SKU not found).
  - `GET /api/production/rejection-cost-config` is now SKU-aware:
    - Without `sku_id` → `{skus, components, reasons}` (lightweight bootstrap for picker).
    - With `?sku_id=X` → `{sku, components, stages: <from this SKU's QC route>, reasons, mappings: <SKU-scoped>}`.
  - `_calc_rejection_cost` matches by sku_id → returns `missing_mapping=true` when querying for a SKU with no mapping at that (stage, reason).
  - `/rejection-report` enrichment uses `(sku_id, stage_name, reason_name)` tuple → rows of one SKU never use another SKU's mapping.
  - Legacy mappings without `sku_id` purged from DB.
- [x] **Frontend**:
  - `/production/rejection-cost-config` redesigned: SKU picker as the FIRST dropdown. Empty state until SKU is picked. Stages dropdown filtered to selected SKU's QC route. Header shows "Add new mapping for {SKU name}". Switching SKU isolates mappings.
  - SKUs without QC routes show an amber warning + disabled stage dropdown (with placeholder "No stages — add QC route").
  - `BatchDetail.js` inline preview now fetches `/rejection-cost-mappings?sku_id=<batch.sku_id>` and matches by sku_id.
- [x] **Files**: `backend/routes/production_qc.py`, `frontend/src/pages/RejectionCostConfig.js` (rewritten), `frontend/src/pages/BatchDetail.js`.
- [x] **Testing**: 12/12 backend (iteration_148, pytest at `backend/tests/test_iteration_148_rejection_cost_per_sku.py`) + frontend Playwright validated. SKU isolation verified end-to-end.

### Production — Rejection Cost: Live Cost / Unit Display (2026-04-29)
- [x] **Backend**: SKU-scoped config endpoint now also returns `sku.cogs_components_values`, enabling pure-frontend cost computation.
- [x] **Frontend**: Each component header in the matrix shows the SKU's price (₹X / "— not set" if unset). New right-most "Cost / unit" column shows live `Σ(SKU's price for ticked components)` — updates instantly as user toggles checkboxes. Amber banner appears when SKU has no COGS prices (with deep link to SKU Management → COGS Costs).
- [x] **Files**: `backend/routes/production_qc.py`, `frontend/src/pages/RejectionCostConfig.js`.
- [x] **Verified**: For Nyla 660ml/Gold (Primary 7.50, Cap 2.00, Mfg 12.25) → QC Stage 1 / Black Particles with [Primary, Cap] checked shows **Cost / unit: ₹9.50** instantly. Total rejection cost on event = qty × Cost/unit.

### Production — BatchDetail Rejection Cost Display (2026-04-29)
- [x] **BatchDetail right-side Rejection Panel** now shows cost-of-rejection per recorded rejection event:
  - **Header**: total qty + total ₹ cost stacked.
  - **By Reason**: each reason shows ₹ cost next to the count.
  - **Detail View table**: new "Cost" column on each row + filtered ₹ total in footer.
  - **Amber banner** when any rejection in the batch lacks a mapping, with deep link to `/production/rejection-cost-config`.
- [x] **Lookup**: same `(sku_id, stage_name, reason_name)` tuple as `/rejection-report` enrichment — math consistent everywhere.
- [x] **Files**: `frontend/src/pages/BatchDetail.js` (RejectionPanel rewritten with `costMappings` + `skuCogs` props).
- [x] **Testing**: iteration_149 — 10/10 verified (4 backend pytest + 6 frontend Playwright). Real batch "Test 123" (Nyla 600ml/Silver, 14 rejections) shows total cost ₹864.00 with the unmapped reason properly flagged.

### API Keys for External Integration Partners (2026-04-28)
- [x] **Per-partner API keys** (one key per integration like BriefingIQ). Issued at Settings → API Keys page. Format `ak_live_<48 hex>`, stored as **sha256 hash**, raw key shown ONLY ONCE on creation.
- [x] **Auth via either header**: `X-API-Key: ak_live_…` OR `Authorization: Bearer ak_live_…` (server detects by `ak_live_` prefix; falls back to JWT/session if not an API key).
- [x] **Per-key endpoint allowlist** of `(method, path_pattern)` pairs; partners get 403 if they hit an endpoint not granted. Method+path matched via regex (`{var}` → `[^/]+`).
- [x] **Catalog endpoint** `GET /api/api-keys/available-endpoints` returns the curated list of grantable endpoints (currently 5: create/update/list invoices, list master SKUs, list accounts).
- [x] **CRUD**: `GET/POST/PUT/DELETE /api/api-keys` (System Admin / CEO / Director / Admin only). PUT supports renaming, allowed-endpoints update, active toggle.
- [x] **Tenant context** is pinned to the key's tenant on every authenticated call.
- [x] **External invoice endpoints** `POST /api/accounts/{account_id}/invoices` and `PUT /api/accounts/{account_id}/invoices/{invoice_no}` now accept API key auth (replaces strict JWT).
- [x] **Frontend**: `/settings/api-keys` (sidebar entry under Admin → "API Keys" with KeyRound icon). List shows key prefix masked + endpoint badges colored by HTTP verb. Create dialog with checkbox grid of available endpoints. Reveal-once modal with copy button + curl/Bearer usage examples. Edit, active-toggle, revoke (with confirm).
- [x] **Files**: `backend/routes/api_keys.py`, `backend/deps.py` (get_user_or_api_key), `backend/server.py` (local get_user_or_api_key + endpoint deps), `backend/routes/__init__.py` (router registration), `frontend/src/pages/ApiKeysPage.js`, `frontend/src/App.js`, `frontend/src/layouts/DashboardLayout.js`.
- [x] **Testing**: 20/20 tests passed (iteration_145) — 13 backend + 7 frontend UI flows, JWT regression preserved.

### Production Dashboard — Time Filter + Rejection Insights (2026-04-29)
- [x] **Backend**: `GET /api/production/dashboard` accepts `time_filter` query param (this_week / last_week / this_month / last_month / this_quarter / last_quarter / last_3_months / last_6_months / this_year / last_year / lifetime). Filters batches by `created_at` and aggregates rejection events from inspections within scope. Returns `summary.total_rejection_cost`, `summary.rejection_events`, `summary.rejection_unmapped`, and `rejection_breakdown.{by_reason,by_stage,top_skus}`.
- [x] **Frontend (`ProductionDashboard.js`)**: Shadcn `Select` time-filter dropdown (data-testid='time-filter') with 11 options, value persisted in localStorage. New "Rejection Insights" section (data-testid='rejection-metrics-section') shown when `rejection_events > 0` — displays Total Rejected, Total Cost (₹), Events, Unmapped (with deep-link to /production/rejection-cost-config) plus three breakdown lists: by_reason, by_stage, top_costly_skus.
- [x] **Bug fix during test**: Added missing `timedelta` import to `production_qc.py` — 7 time_filter branches were raising 500s.
- [x] **Files**: `backend/routes/production_qc.py`, `frontend/src/pages/ProductionDashboard.js`
- [x] **Testing**: iteration_150 — backend 19/19 PASS, frontend Playwright 95% PASS

### Personal Calendar with Google Calendar Sync (2026-04-29)
- [x] **New page `/personal-calendar`** (sidebar nav "My Calendar" under Lead & Sales Operations, `CalendarDays` icon). Per-user view aggregating events from three sources:
  - **CRM Meetings** (sky badge) — from `meetings` collection where user is `organizer_id` or in `attendees` (email match)
  - **Meeting Minutes** (violet badge) — from `meeting_minutes` collection where user is `created_by` or in `participants[].id` (all-day events)
  - **Google Calendar** (rose badge) — from user's primary Google Calendar via OAuth (when connected)
- [x] **Google OAuth Flow**:
  - Reuses existing `GOOGLE_OAUTH_CLIENT_ID`/`GOOGLE_OAUTH_CLIENT_SECRET` from `.env` (falls back to `GOOGLE_CLIENT_ID`/`GOOGLE_CLIENT_SECRET`).
  - `GET /api/personal-calendar/google/connect` → returns `authorization_url` with `redirect_uri=/api/personal-calendar/google/callback`, scope=`calendar+userinfo.email+openid`, `access_type=offline`, `prompt=consent`, `state=user_id:tenant_id`.
  - `GET /api/personal-calendar/google/callback` (public, no auth) → exchanges code via direct POST to `oauth2.googleapis.com/token`, fetches `userinfo` for email, persists tokens in `user_google_tokens` collection (per-user), redirects to `/personal-calendar?google=connected&email=...` or `?google=error&reason=...`.
  - `GET /api/personal-calendar/google/status` → `{connected, configured, google_email?}`.
  - `POST /api/personal-calendar/google/disconnect` → removes token doc.
  - Auto-refresh: `_refresh_if_needed` uses stored `refresh_token` to refresh access tokens within 60s of expiry.
- [x] **Aggregated Events Endpoint**: `GET /api/personal-calendar/events?start_date&end_date` — single payload with all three sources merged + `google` connection status. Google events tagged with `extendedProperties.private.crm_meeting_id` are filtered out to avoid duplicates with CRM meetings already pushed to Google.
- [x] **Push CRM → Google**: `POST /api/personal-calendar/google/push-meeting/{meeting_id}` inserts/updates a Google Calendar event for a CRM meeting (uses Asia/Kolkata timezone, attendees array, `extendedProperties` for round-trip dedup). Stores `google_event_id` and `google_event_link` on the meeting doc.
- [x] **Frontend (`PersonalCalendar.js`)**:
  - Month-grid view with prev/next/today navigation, day-of-week header, color-coded event pills (max 3 per day + "+N more")
  - Connect Google Calendar button; shows connected email + Disconnect when active; "Google not configured" amber pill when env vars missing
  - Day-cell click → slide-out Sheet with full day's event list
  - Event click → detail Sheet with title, time, location, join-link, description
  - OAuth callback parsing on mount (via URL params) — toasts success/failure and refreshes events
  - data-testids: `personal-calendar`, `time-filter`, `google-connect-btn`/`google-status-connected`, `prev-month-btn`, `next-month-btn`, `today-btn`, `refresh-btn`, `day-cell-YYYY-MM-DD`, `event-card-{id}`
- [x] **Schema**: `user_google_tokens` collection in global db `{user_id, google_email, access_token, refresh_token, expires_at, scope, token_type, created_at, updated_at}`. `meetings` collection has new optional fields `google_event_id`, `google_event_link`.
- [x] **Setup required from user (Google Cloud Console)**: Enable Google Calendar API in same project as existing OAuth client, add scope `https://www.googleapis.com/auth/calendar` to consent screen, whitelist redirect URI `https://prod-qc-sync.preview.emergentagent.com/api/personal-calendar/google/callback`.
- [x] **Files**: `backend/routes/personal_calendar.py` (NEW), `backend/routes/__init__.py`, `frontend/src/pages/PersonalCalendar.js` (NEW), `frontend/src/App.js`, `frontend/src/layouts/DashboardLayout.js`, `backend/.env` (`BACKEND_PUBLIC_URL`, `FRONTEND_URL` added)
- [x] **Testing**: iteration_150 — backend 19/19 PASS (status, connect, disconnect, events aggregation), frontend Playwright validated (calendar grid, OAuth button states, event rendering). End-to-end Google consent click-through left for user verification once Calendar API is enabled in their Google Cloud project.

## Upcoming Tasks (P1)
- Auto-generate Provisional Invoice (on shipment -> "delivered")
- Build Reporting Module (stock balance, deliveries, settlements, distributor performance)
- Manager Dashboard (team-wise comparison, activity vs outcome)
- Leadership Dashboard (territory trends, pipeline health)
- **Continue server.py refactor Phase 2**: Extract accounts/leads/invoices/production/meetings/tasks routes (current: 9,899 lines, target <2,000)
- **Google Workspace OAuth fix**: Once prod is stable, debug `/api/auth/google-callback` errors (likely `redirect_uri_mismatch`)

### Factory Return — Master-Driven Reason Dropdown (2026-04-25)
- [x] **DeliveriesTab "New Factory Return" dialog**: Reason dropdown now pulls from master `Return Reasons` (`/api/return-reasons?is_active=true`) instead of hardcoded `expired/damaged/empty_reusable` options.
- [x] **Source-aware filtering**: For `source=customer_return` shows reasons in categories [empty_reusable, expired, damaged]; for `source=warehouse` shows [expired, damaged].
- [x] **Backend contract preserved**: Submits the master reason's `category` as the legacy `reason` field (validated regex unchanged), and now also persists `reason_id` + `reason_name` on the factory return doc for richer display & audit.
- [x] **Display update**: Factory returns table shows `reason_name` from master when present, falling back to legacy reason label.
- [x] **Empty-state hint**: When no active reasons, dropdown shows guidance to add them in Settings → Returns.
- [x] **Files**: `frontend/src/components/distributor/DeliveriesTab.jsx`, `backend/routes/factory_returns.py`

### Lead Type (B2B / Retail) — Lead → Account Propagation (2026-04-25)- [x] **Field added**: `lead_type` (default `'B2B'`, accepts `'Retail'`) on `Lead`, `LeadCreate`, `LeadUpdate` (server.py + routes/leads.py duplicates kept in sync) and on `Account`, `AccountUpdate`.
- [x] **Conversion propagation**: `POST /api/accounts/convert-lead` copies `lead.lead_type` to the new account; falls back to `'B2B'` if missing.
- [x] **Frontend — Add/Edit Lead form**: New "Lead Type *" Shadcn select (B2B / Retail) shown next to Business Category. Defaults to B2B for new leads; loads existing value in edit mode.
- [x] **Frontend — Lead Detail header**: Color-coded badge (`sky` for B2B, `violet` for Retail) next to status & category, `data-testid="lead-type-badge"`.
- [x] **Frontend — Account Detail**: Same color-coded badge in header next to account type + a "Lead Type" row in the account info grid.
- [x] **Tested via curl**: B2B default on create, explicit Retail accepted, PUT update flips B2B → Retail, lead → account conversion preserves Retail value, all temp records cleaned up.
- [x] **Files**: `backend/server.py`, `backend/routes/leads.py`, `frontend/src/pages/AddEditLead.js`, `frontend/src/pages/LeadDetail.js`, `frontend/src/pages/AccountDetail.js`


### Neck Tag Designer (2026-04-25)
- [x] **New page** `/sales/neck-tag-designer` (Sales module sidebar entry "Neck Tag Designer", `Tag` lucide icon).
- [x] **Logo upload**: PNG / JPG / SVG / WebP. Sliders for size (20–90% of body width) and vertical position (30–80% from top).
- [x] **Gradient editor**: linear (with 0–360° angle slider) or radial; 2 to 4 color stops with native color picker, hex input, and offset (%); 6 preset palettes (Classic White, Sunset, Ocean, Royal, Forest, Gold Leaf).
- [x] **Defragmented template layers** (2026-04-25 update): Original template split into three independent PNG layers — `layer_waves.png` (gold decorative lines, with red/green chroma cleanup), `layer_seal.png` (Green Innovation seal), `layer_tagline.png` ("air water — The Purest Water on Earth"). Each has its own visibility checkbox + opacity slider, so users can keep or remove any element.
- [x] **Composite via `mix-blend-mode: multiply`** so the gradient shows through white areas of each layer.
- [x] **SVG-based preview** with rounded corners + circular hang-hole cut-out (mask), drop shadow, live updates.
- [x] **High-resolution PNG export** (4× viewBox) using Canvas with the same per-layer composite + logo + destination-out cutout for the hole. Auto-named `neck-tag_<timestamp>.png`.
- [x] **Reset** button restores defaults (gradient preset + all layers ON 100%).
- [x] **Files**: `frontend/src/pages/NeckTagDesigner.js`, `frontend/src/App.js` (route), `frontend/src/layouts/DashboardLayout.js` (nav), `frontend/public/neck-tag/{template_full,layer_waves,layer_seal,layer_tagline}.png` (assets).


### Account — Lead Type editable + Account Type removed (2026-04-25)
- [x] **Account Detail edit form**: "Account Type" dropdown (Tier 1/2/3) replaced with "Lead Type *" dropdown (B2B / Retail). State `accountType` removed; `leadType` initialized from `account.lead_type` (default B2B).
- [x] **PUT payload** now sends `lead_type` instead of `account_type`.
- [x] **View mode**: Removed "Account Type" row; "Lead Type" remains.
- [x] **Header**: Removed Tier 1/2/3 colored badge; Lead Type pill (sky=B2B, violet=Retail) is the sole type indicator.
- [x] **Cancel-edit reset** updated; unused `accountTypeColors` constant removed.
- [x] **AccountsList**: "Type" column (Tier badge) replaced with "Lead Type" column (B2B / Retail color pill). Toolbar filter renamed "Account Type" → "Lead Type" with B2B/Retail options. Unused `ACCOUNT_TYPES` + `accountTypeColors` constants removed.
- [x] **Backend** `GET /api/accounts`: New `lead_type` query param; B2B selection treats missing/null as B2B (legacy default) using `$and`-combined `$or` clause to coexist with search.
- [x] **Tested via curl**: B2B legacy default returns 7 accounts, Retail returns 0 (correct), PUT `lead_type=Retail` updates → Retail filter then returns 1, restore to B2B works.
### COGS Components Master — Custom Components Now Render in Calculator (2026-04-26 update)
- [x] **Custom (non-legacy) components** added in master are now rendered as additional input columns in the COGS Calculator (both desktop table and mobile cards). ₹ components appear after Logistics; % components after Distribution.
- [x] **Backend** `COGSData` & `COGSDataUpdate` now have a `custom_components: Dict[str, float]` field (merged on PUT, not replaced). The PUT recompute reads master `cogs_components` to determine which keys (legacy + custom) are active and what unit they are; `total_cogs` = sum of all active ₹ components (legacy + custom). All derived fields (`ex_factory_price`, `base_cost`, `minimum_landing_price`) reflect this immediately and stay correct in downstream reports/CSV.
- [x] **Frontend** loads full active component list (key, label, unit, sort_order). `computeDerived` and the reverse-calc include `custom_components` values; new `updateCustomField` writes into `row.custom_components`. Save flow sends `custom_components` payload.
- [x] **Tested via curl**: created `quality_testing` (₹), PUT primary=10 + qt=2.5 → server `total_cogs=12.5`; toggled qt off in master → next PUT recomputed to 10.0; round-trip cleaned up.

### COGS Components Master (2026-04-26)
- [x] **New master** at `/master/cogs-components` (sidebar → "COGS Components", `Receipt` icon, visible for CEO/Director/System Admin — others configurable via module-access matrix `moduleKey=cogs_components`).
- [x] **Backend**: `backend/routes/cogs_components.py` — `GET/POST/PUT/DELETE /api/master/cogs-components`. Collection `cogs_components` per tenant. Auto-seeds 6 defaults on first read: `primary_packaging_cost`, `secondary_packaging_cost`, `manufacturing_variable_cost`, `outbound_logistics_cost` (₹), `distribution_cost`, `gross_margin` (%). Edit restricted to System Admin/CEO/Director (mirrors COGS edit rule). System components can be toggled Active off but NOT hard-deleted.
- [x] **Frontend master page**: compact GOP-style summary tile (N active · M contribute to Total COGS), table with Switch toggle per row, add/edit dialog (auto-slugs key from label; unit locked after create), hard-delete confirmation for non-system components.
- [x] **COGS Calculator dynamic columns**: reads `is_active=true` components on mount. Hardcoded input `<th>` + `<td>` cells for Primary/Secondary/Manufacturing/Logistics/Distribution/Gross Margin are gated by `isShown(key)`. Total COGS formula now = sum of all active ₹ columns (previously was primary+secondary+manufacturing only; logistics now folded in, Base Cost formula simplified to `totalCOGS + grossMargin₹`). Fail-open if master is unreachable (shows all legacy columns).
- [x] **Tested via curl**: auto-seed produces 6 components, custom component creation returns `is_system:false`, PUT toggle works, DELETE works, duplicate-key POST rejected with 400.
### Account GOP Metrics — Compact GOP Coverage Tile (2026-04-26 redesign)
- [x] **Redesigned** the GOP Coverage tile to be elegant & subtle: collapsed from a tall block (gradient bg + giant 3xl percentage + full-width progress bar) to a single compact horizontal row (~64px tall) with:
  - Soft `bg-white/60 backdrop-blur` card on the page background
  - **Inline circular SVG donut ring** (56px) on the left, % rendered in the ring center, color-tiered (emerald ≥80%, amber ≥50%, rose otherwise) with a smooth dash-offset transition
  - Single-line body: "GOP Coverage" eyebrow + "**6 of 7** accounts in GOP" with subtle muted "of"
  - Pill-shaped excluded chip on the right (only when >0), with a tiny dot
- [x] **Header subtitle** simplified — duplicate "excluded from GOP" mention removed (now lives only inside the tile).
- [x] **Files**: `frontend/src/pages/AccountSKUPricing.js`

### Account GOP Metrics (renamed from Account SKU Pricing) + Include-in-GOP Toggle (2026-04-25)
- [x] **Rename**: Page title + sidebar label renamed to **"Account GOP Metrics"** (URL `/accounts/sku-pricing` retained for backwards-compatible deep links).
- [x] **New Account field**: `include_in_gop_metrics` (bool). Defaults set **on conversion** based on lead_type: B2B → `True`, Retail → `False`. Explicit override saved via PUT `/api/accounts/{id}` (AccountUpdate now accepts this field).
- [x] **Top tile scoping**: Per-SKU average-price tiles and the Accounts summary counter now only consider `include_in_gop_metrics !== false` rows. Excluded accounts remain fully visible in the grid; header shows "· N excluded from GOP" badge.
- [x] **Row indicator**: Account rows excluded from GOP display a subtle amber "Not in GOP" pill next to the account name.
- [x] **Account Detail — View**: New "Include in GOP Metrics" label shows Yes / No (falls back to lead_type default if unset).
- [x] **Account Detail — Edit**: Full-width toggle card with Shadcn `Switch` (`data-testid="toggle-include-in-gop"`) and helper text explaining B2B/Retail defaults.
- [x] **Grid endpoint**: `GET /api/accounts/sku-pricing-grid` now emits `lead_type` + `include_in_gop_metrics` per row (falls back to lead_type-derived default when field is absent on legacy accounts).
- [x] **Tested via curl end-to-end**: Retail conversion → `False`, B2B conversion → `True`, PUT override works, grid endpoint returns the flag correctly; all temp data cleaned up.
- [x] **Files**: `backend/server.py` (Account/AccountUpdate models + convert_lead_to_account + sku-pricing-grid), `frontend/src/pages/AccountSKUPricing.js`, `frontend/src/pages/AccountDetail.js`, `frontend/src/layouts/DashboardLayout.js`


### Factory Return — Stock Cap Per SKU (2026-04-25)
- [x] **Goal**: Stock-Out (Distributor → Factory) cannot exceed quantities at hand at the distributor.
- [x] **New backend endpoint** `GET /api/distributors/{id}/available-stock` returns per-SKU `warehouse_available`, `customer_pending_factory`, `total_available`.
  - `warehouse_available = shipped_in − delivered_out − factory_returned(source=warehouse)`
  - `customer_pending_factory = customer_returned − factory_returned(source=customer_return)`
- [x] **Server-side validation** in `POST /factory-returns` rejects items where requested qty exceeds the source-appropriate cap with a clear 400 message (including SKU name and remaining qty).
- [x] **Dialog UI**: SKU dropdown shows " — Available: N" inline; quantity input is capped via `max`, highlighted red when over-limit, and shows a per-row hint ("Max N available… reduce quantity"). Save button is disabled when any line breaches its cap.
- [x] **Auto-snap**: switching SKU snaps quantity down to the new cap. Errors from server are surfaced to the user.
- [x] **Tested**: warehouse-over-limit rejected (38 cap), customer-pending-factory rejected (0 cap), valid 5-qty success, available-stock GET returns correct values for nyla-air-water tenant.


## Pipeline Value Logic (2026-04-09)
- Pipeline value is now based on `target_closure_month`/`target_closure_year` matching the time filter
- Value = sum of `opportunity_estimation.estimated_monthly_revenue` (from proposed SKU section) for active leads
- Excludes closed_won, closed_lost, won, lost, not_qualified statuses
- Pipeline accounts dialog also uses the same target_closure-based filtering

## Backlog (P2)
- Task email notifications, First-login Password Change, Email Invoice Sharing
- Settlement Auto-scheduling, Dashboard analytics
- Alerts: low achievement, high outstanding, activity drops, no new accounts
