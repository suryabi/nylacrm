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

## Tech Stack
- **Frontend**: React, Tailwind CSS, Shadcn UI, React Router
- **Backend**: FastAPI, MongoDB (motor), Pydantic
- **Integrations**: Claude Sonnet 4.5, Google Places API (New), Google OAuth

---

## What's Been Implemented

### Feb 17, 2026
- **Lead ID System**: Unique 16-char ID format `NAME4-CITY-LYY-SEQ`
  - Auto-generated on lead creation
  - Displayed in Leads List (first column) and Lead Detail page
  - Searchable and sortable

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
- Role rename: "Business Development Executive" → "Head of Business"
- Added "Jewellery Stores" to Lead Discovery categories

---

## Prioritized Backlog

### P0 (Critical)
- [ ] Complete "Sales Partner" role implementation
  - Backend: Mirror "Regional Sales Manager" permissions
  - Frontend: Update navigation visibility in DashboardLayout.js

### P1 (High)
- [ ] User verification for custom proposal template
- [ ] Re-implement Grid View for Sales Target module

### P2 (Medium)
- [ ] Refactor SalesTargets.js (recurring Babel compilation errors)
- [ ] Break down server.py into modular API routes

---

## Key Files Reference
- `/app/backend/server.py` - Main backend (all API routes)
- `/app/frontend/src/pages/LeadsList.js` - Leads table with Lead ID column
- `/app/frontend/src/pages/LeadDetail.js` - Lead detail with ID display
- `/app/frontend/src/pages/TeamManagement.js` - Team/role management
- `/app/frontend/src/layouts/DashboardLayout.js` - Navigation sidebar
- `/app/frontend/src/pages/SalesTargets.js` - Target planning (fragile)

## Database Collections
- users, leads, activities, daily_status
- target_plans, territory_targets, city_targets, resource_targets, sku_targets
- cogs, user_sessions

## Test Credentials
- **Google OAuth**: Any @nylaairwater.earth email
- **Fallback Admin**: admin@nylaairwater.earth / admin123
- **Test Users**: surya123, vamsi123, karanabir123, manager123, priya123
