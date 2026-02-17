# Nyla Sales CRM - Product Requirements Document

## Original Problem Statement
Build a comprehensive, mobile-ready Sales CRM application for tracking leads, follow-ups, and statuses for the Nyla water business.

## Core Requirements
- **Lead Management**: Full CRUD with custom fields (current brand, SKUs interested)
- **Team & Hierarchy**: Role-based access (CEO, Director, VP, etc.) with org chart
- **Activity Tracking**: Visual timeline for lead activities (Call, Visit, Email)
- **Dashboard & Reporting**: Filterable KPI tiles, sortable reports
- **Daily Status Updates**: AI-powered text rewriting (Claude Sonnet 4.5)
- **Sales Target Planning**: Hierarchical allocation (Country → Territory → City → Resource/SKU)
- **Lead Discovery**: Google Places API integration with duplicate prevention
- **COGS Calculator**: Cost of Goods Sold and Minimum Landing Price by SKU/city
- **Proposal Generator**: Rich text editor with editable templates
- **Authentication**: Google Workspace OAuth 2.0
- **Invoice Integration**: ActiveMQ subscription for invoice data from ERP

## Tech Stack
- **Frontend**: React, Tailwind CSS, Shadcn UI, React Router
- **Backend**: FastAPI, MongoDB (motor), Pydantic
- **Integrations**: Claude Sonnet 4.5, Google Places API (New), Google OAuth, Amazon MQ (ActiveMQ)

---

## What's Been Implemented

### Feb 17, 2026
- **ActiveMQ Invoice Integration**:
  - STOMP subscriber for Amazon MQ (`/app/backend/mq_subscriber.py`)
  - Webhook fallback at `/api/invoices/webhook`
  - Invoice data: gross value, net value, credit notes, invoice date
  - Auto-matching via CA_LEAD_ID to our lead_id
  - Lead totals auto-calculated
  - UI: Invoice Value column in Leads List, Invoice Summary card in Lead Detail

- **Lead ID System**: Unique 16-char ID format `NAME4-CITY-LYY-SEQ`

- **Auth Fix**: Fixed login to use session tokens with cookies

### Previous Sessions
- Full lead management with custom Nyla fields
- Team hierarchy with org chart visualization
- Activity timeline for each lead
- Dashboard with filterable KPI tiles
- Daily status updates with Claude AI rewriting
- Sales target allocation system (percentage-based)
- Lead Discovery with Google Places integration
- COGS Calculator for SKU/city pricing
- Proposal Generator with rich text editor
- Google Workspace OAuth authentication

---

## Prioritized Backlog

### P0 (Critical)
- [ ] Complete "Sales Partner" role implementation
  - Backend: Mirror "Regional Sales Manager" permissions
  - Frontend: Update navigation visibility

### P1 (High)
- [ ] Enable ActiveMQ in production (`ACTIVEMQ_ENABLED=true`)
- [ ] User verification for custom proposal template
- [ ] Re-implement Grid View for Sales Target module

### P2 (Medium)
- [ ] Refactor SalesTargets.js (recurring Babel compilation errors)
- [ ] Break down server.py into modular API routes

---

## Key Files Reference
- `/app/backend/server.py` - Main backend (all API routes)
- `/app/backend/mq_subscriber.py` - ActiveMQ invoice subscriber
- `/app/frontend/src/pages/LeadsList.js` - Leads table with Invoice Value column
- `/app/frontend/src/pages/LeadDetail.js` - Lead detail with Invoice Summary
- `/app/frontend/src/pages/TeamManagement.js` - Team/role management
- `/app/frontend/src/layouts/DashboardLayout.js` - Navigation sidebar

## Database Collections
- users, leads, activities, daily_status
- invoices (NEW - stores invoice data from MQ)
- target_plans, territory_targets, city_targets, resource_targets, sku_targets
- cogs, user_sessions

## Invoice Message Format (from ActiveMQ)
```json
{
  "invoiceData": "17-02-2026",
  "grossInvoiceValue": "31755.28",
  "netInvoiceValue": "31195.82",
  "C_LEAD_ID": "LEAD_3",
  "CA_LEAD_ID": "LEAD_17",
  "invoiceNo": "INV-34131",
  "creditNoteValue": "559.46"
}
```

## Test Credentials
- **Google OAuth**: Any @nylaairwater.earth email
- **Fallback Admin**: admin@nylaairwater.earth / admin123
