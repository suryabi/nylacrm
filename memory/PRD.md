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

## Upcoming Tasks (P1)
- Auto-generate Provisional Invoice (on shipment -> "delivered")
- Build Reporting Module
- Manager Dashboard (team-wise comparison, activity vs outcome)
- Leadership Dashboard (territory trends, pipeline health)
- **Continue server.py refactor Phase 2**: Extract accounts/leads/invoices/production/meetings/tasks routes (current: 9,140 lines, target <2,000)
- **Google Workspace OAuth fix**: Once prod is stable, debug `/api/auth/google-callback` errors (likely `redirect_uri_mismatch`)

### Factory Return — Master-Driven Reason Dropdown (2026-04-25)
- [x] **DeliveriesTab "New Factory Return" dialog**: Reason dropdown now pulls from master `Return Reasons` (`/api/return-reasons?is_active=true`) instead of hardcoded `expired/damaged/empty_reusable` options.
- [x] **Source-aware filtering**: For `source=customer_return` shows reasons in categories [empty_reusable, expired, damaged]; for `source=warehouse` shows [expired, damaged].
- [x] **Backend contract preserved**: Submits the master reason's `category` as the legacy `reason` field (validated regex unchanged), and now also persists `reason_id` + `reason_name` on the factory return doc for richer display & audit.
- [x] **Display update**: Factory returns table shows `reason_name` from master when present, falling back to legacy reason label.
- [x] **Empty-state hint**: When no active reasons, dropdown shows guidance to add them in Settings → Returns.
- [x] **Files**: `frontend/src/components/distributor/DeliveriesTab.jsx`, `backend/routes/factory_returns.py`

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
