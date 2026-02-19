# Nyla Air Water - Sales CRM PRD

## Original Problem Statement
Build a comprehensive, mobile-ready Sales CRM application with:
- Lead management and team hierarchy
- Activity tracking and dashboards
- Daily status updates and sales target planning
- COGS calculator and proposal generator
- Lead discovery and Google Workspace authentication
- Unique Lead ID generation
- ActiveMQ invoice integration for real-time data
- Resource-based revenue tracking
- Sales Revenue Dashboard

## Architecture
- **Frontend**: React with Tailwind CSS, Shadcn UI, React Router
- **Backend**: FastAPI with Motor (MongoDB async driver)
- **Database**: MongoDB
- **Auth**: Session-based (cookie) + Google Workspace OAuth
- **Integrations**: Google Places API, Claude Sonnet 4.5, ActiveMQ

## What's Been Implemented

### Core Features (Complete)
- [x] Lead management (CRUD, status tracking)
- [x] Team management with hierarchy
- [x] Activity tracking (visits, calls, meetings)
- [x] Main dashboard with analytics
- [x] Daily status updates
- [x] Sales target planning
- [x] COGS Calculator
- [x] Proposal Generator
- [x] Lead Discovery (Google Places)
- [x] Google Workspace OAuth
- [x] Email/Password login (fixed)

### Recent Additions (Feb 2026)
- [x] Unique Lead ID generation (NAME4-CITY-LYY-SEQ format)
- [x] ActiveMQ invoice integration
- [x] Resource-based revenue tracking
- [x] Sales Revenue Dashboard with filters
- [x] Invoice display on Lead Detail page
- [x] Fixed Babel compilation error (disabled visual edits plugin)
- [x] Dashboard dropdown navigation with:
  - Sales Overview (pipeline metrics)
  - Revenue Report (won deals tracking)

## Database Schema

### leads
- lead_id (string, unique formatted ID)
- company_name, contact info, location
- status, stage, assigned_to
- total_gross_invoice_value, total_net_invoice_value
- total_credit_note_value, invoice_count

### invoices
- lead_id, invoice_no, invoice_date
- gross_value, net_value, credit_note_value
- assigned_to (resource)

### resource_invoice_summary
- resource_id
- total_gross/net/credit_note values

## Priority Backlog

### P0 - Critical
- None currently

### P1 - High Priority
- [ ] Complete "Partner - Sales" role implementation (permissions)

### P2 - Medium Priority
- [ ] User verification for custom Proposal Template

### P3 - Future
- [ ] Re-implement Grid View for Sales Target module
- [ ] Refactor server.py into modular APIRouter structure
- [ ] Component refactoring for large files

## Key Files
- `/app/backend/server.py` - Main API
- `/app/backend/mq_subscriber.py` - ActiveMQ integration
- `/app/frontend/src/pages/SalesRevenueDashboard.js` - Revenue dashboard
- `/app/frontend/src/pages/LeadDetail.js` - Lead details with invoices
- `/app/frontend/craco.config.js` - Webpack config (visual edits disabled)

## Credentials
- Admin: admin@nylaairwater.earth / admin123
- Google Workspace OAuth for regular users

## Last Updated
Feb 19, 2026 - Fixed Babel compilation error, system restored
