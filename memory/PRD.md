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
