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
- [x] **Revenue Metrics**: Target (from Target Setup Module), Achieved, Achievement %, New vs Existing account revenue, Manual override
- [x] **Account Metrics**: Existing (Won/Active) count with company names, New accounts onboarded, Clickable tiles open Dialog popup with leads list
- [x] **Pipeline Metrics**: Current value & count, Next month pipeline, Coverage ratio (no expansion toggle)
- [x] **Collections/Outstanding**: Total outstanding, Aging buckets (0-30, 31-60, 61-90, 90+), Account-level details (expandable)
- [x] **Activity Metrics**: Visits, Calls, Follow-ups, Visit/Call Productivity (auto-populated, no manual overrides)
- [x] **Support Metrics**: Category badges (Pricing, Logistics, Marketing, Collections, Management, Product), Remarks
- [x] **Approval Workflow**: Draft → Submitted → Approved/Returned, locked once approved
- [x] **Month-on-Month Comparison**: Last 3 months table with trend arrows
- [x] **Performance KPIs**: Achievement %, Pipeline Coverage, Outstanding Ratio, Visit/Call Productivity, Conversion Rate
- [x] **Integration**: Linked to Target Setup Module for monthly targets per resource

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
