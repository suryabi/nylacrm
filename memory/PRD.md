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

### Meeting Minutes Module (2026-04-06)
- [x] **CRUD**: Create/read/update/delete meeting entries with date, title, periodicity, purpose, participants, minutes, action items
- [x] **Periodicity**: Weekly, Monthly, Quarterly, Ad-hoc with colored badges
- [x] **Purpose**: Multi-select from Sales, Production, General, Finance, Administration, Investors, Marketing
- [x] **Participants**: Multi-select from all team members with search, avatar initials display
- [x] **Meeting Minutes**: Bullet-point list format with add/remove functionality
- [x] **Action Items**: Description, assignee (from all team members), due date, status (Open/In Progress/Done) with add/remove
- [x] **Filters**: Month, year, periodicity, purpose (multi-select), participant dropdowns
- [x] **Edit History**: Full tracking — each edit records edited_by, edited_by_name, edited_at, shown in detail panel
- [x] **Navigation**: Menu item alongside Daily Status with NotebookPen icon
- [x] **API Endpoints**: CRUD at /api/meeting-minutes with filter support

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
