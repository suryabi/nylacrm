# Sales CRM Application - Product Requirements Document

## Original Problem Statement
Build a comprehensive, mobile-ready Sales CRM application for Nyla Air Water. The application helps manage leads, accounts, invoices, COGS calculations, and sales team performance.

## Core Features Implemented
1. **Authentication** - Session-based login with Google OAuth and email/password
2. **Lead Management** - Full CRUD with advanced filtering, scoring quadrants, pipeline views
3. **Account Management** - Convert leads to accounts, track invoices and payments
4. **Invoice Management** - ActiveMQ integration for real-time invoice processing
5. **COGS Calculator** - Calculate cost of goods sold with SKU pricing
6. **Tasks & Meetings** - Create tasks, schedule meetings with Zoom integration
7. **Travel & Budget Requests** - Approval workflows for expenses
8. **Daily Status Updates** - Team status tracking with AI assistance
9. **AI Assistant** - Claude-powered chat for CRM queries

## Tech Stack
- **Frontend**: React 18, TailwindCSS, Shadcn/UI
- **Backend**: FastAPI (Python)
- **Database**: MongoDB
- **Message Queue**: Amazon MQ (ActiveMQ)
- **AI**: Claude Sonnet 4.5 via Emergent LLM Key, Gemini
- **Integrations**: Zoom API, Resend, Google OAuth

## What's Been Implemented (Latest Session - March 18, 2026)

### P0 - COGS Deletion Feature ✅ TESTED
- Added backend DELETE endpoint `/api/cogs/{sku_id}` for CEO/Admin roles
- Added frontend UI with checkboxes, "Delete Selected" button, confirmation dialog
- Role-based access control verified (CEO/Admin can delete, others cannot)

### P1 - Lead List Filter Fix ✅ TESTED
- Fixed territory filter (was filtering on non-existent 'territory' field, now uses 'region')
- Updated State dropdown to show all states without requiring Territory selection first
- Updated City dropdown to show all cities without requiring State selection first
- Both mobile and desktop filter UIs updated

## Pending/Upcoming Tasks

### P1 - High Priority
1. **Server.py Refactoring** - Move remaining routes to modular files under `backend/routes/`

### P2 - Medium Priority
1. **AI Assistant RAG Upgrade** - Upgrade to true vector-based RAG system
2. **Build Out Placeholder Modules** - Maintenance, Inventory modules

## Known Issues
- None currently identified (previous critical issues resolved)

## Key API Endpoints
- `GET /api/leads` - List leads with filters (territory→region mapping fixed)
- `DELETE /api/cogs/{sku_id}` - Delete COGS entry (Admin only)
- `GET /api/invoices` - List invoices with filters
- `POST /api/auth/login` - User authentication

## Test Credentials
- **CEO**: `surya.yadavalli@nylaairwater.earth` / `test123`
- **Partner-Sales**: `priya.sales@nylaairwater.earth` / `test123`

## Multi-Tenant Note
All API calls require X-Tenant-ID header (default: `nyla-air-water`)

## Files Modified This Session
1. `/app/frontend/src/pages/COGSCalculator.js` - Added delete functionality
2. `/app/backend/server.py` - Fixed territory→region filter mapping
3. `/app/frontend/src/pages/LeadsList.js` - Fixed State/City dropdown options
