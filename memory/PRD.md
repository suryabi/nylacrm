# Sales CRM & Distribution Management Application

## Original Problem Statement
A comprehensive Sales CRM and Distribution Management platform built with React frontend, FastAPI backend, and MongoDB. The system manages leads, accounts, invoices, distributor operations (stock-in, stock-out, returns, settlements, billing), and integrates with multiple 3rd party services.

## Core Architecture
- **Frontend**: React + Shadcn/UI + Tailwind CSS
- **Backend**: FastAPI (Python)
- **Database**: MongoDB
- **Integrations**: Amazon MQ, Emergent Object Storage, Gemini LLM, Zoom API, Resend, Google Places, Google Workspace OAuth, Claude Sonnet 4.5

## Key Modules
1. **CRM Core**: Leads, Accounts, Pipeline, Invoices, Dashboard
2. **Distribution Module**: Distributors, Stock-In, Stock-Out (Deliveries), Customer Returns, Factory Returns, Credit Notes, Settlements, Billing/Reconciliation
3. **Product & SKU**: Master SKUs, COGS Calculator, Transport Calculator
4. **Sales Operations**: Lead Discovery, Target Planning, Daily Status, Status Summary

## Completed Features (as of March 2026)

### Distribution Module - Stock Out & Settlement Overhaul
- [x] Stock Out UI with GST handling (pre-tax main table, post-tax popup summaries)
- [x] Collapsible sections: "Distributor to Customer" and "Distributor to Factory"
- [x] Factory Return dialog with Source-first selection (Warehouse vs Customer)
- [x] Factory Return SKU dropdown from `distributor_margin_matrix` only
- [x] Factory Return credit formula uses `transfer_price` (not `base_price`)
- [x] **Settlement generation independently queries Credit Notes and Factory Returns** (Fixed 2026-03-30)
- [x] **Settlement stores `total_credit_notes_issued` and `total_factory_return_credit`** (Fixed 2026-03-30)
- [x] **Net Payout formula: Earnings - Price Adj + Credit Notes + Factory Returns** (Fixed 2026-03-30)
- [x] **BillingTab 7 summary cards with correct formula** (Verified 2026-03-30)
- [x] **Monthly Reconciliation API returns credit notes and factory return totals** (Verified 2026-03-30)

## Key API Endpoints (Distribution)
- `POST /api/distributors/{id}/settlements/generate-monthly` - Generate monthly settlements per account
- `GET /api/distributors/{id}/monthly-reconciliation?month=X&year=Y` - Get reconciliation data
- `POST /api/distributors/{id}/factory-returns` - Create factory return
- `GET /api/distributors/{id}/credit-notes` - List credit notes

## Key DB Collections
- `distributor_settlements`: `{total_billing_value, distributor_earnings, factory_distributor_adjustment, total_credit_notes_issued, total_factory_return_credit, final_payout, settlement_month, settlement_year, credit_note_ids, factory_return_ids}`
- `credit_notes`: `{original_amount, created_at (datetime), status, account_id, distributor_id}`
- `distributor_factory_returns`: `{source, reason, requires_settlement, total_credit_amount, return_date (string)}`
- `distributor_margin_matrix`: `{distributor_id, sku_id, sku_name, base_price, transfer_price, margin_type, margin_value}`

## Upcoming Tasks (P1)
- Auto-generate Provisional Invoice (trigger on shipment status -> "delivered")
- Build Reporting Module (stock balance, deliveries, settlements, distributor performance)

## Backlog (P2)
- Task email notifications (Resend)
- First-login Force Password Change Modal
- Email Invoice Sharing
- Settlement Period Auto-scheduling
- Dashboard analytics for distribution module
- Refactor `server.py` monolith into modular route files
