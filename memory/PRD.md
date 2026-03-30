# Sales CRM & Distribution Management Application

## Core Architecture
- **Frontend**: React + Shadcn/UI + Tailwind CSS
- **Backend**: FastAPI (Python)
- **Database**: MongoDB

## Completed Features

### Distribution Module
- [x] Stock Out: GST handling, collapsible sections (Dist->Customer, Dist->Factory)
- [x] Factory Return: Source-first selection, SKU from margin matrix, credit at transfer_price
- [x] Settlement: Independently queries Credit Notes + Factory Returns, stores all fields including `total_at_transfer_price`

### Billing Reconciliation - Two Entry System
- [x] **Entry 1: Monthly Billing** = qty x transfer_price (from margin matrix per SKU)
  - **Weekly line items**: Week 1 (1-7), Week 2 (8-14), Week 3 (15-21), Week 4 (22-28), Week 5 (29-end)
  - Based on delivery date, 4-5 weeks depending on month
  - Direct field `total_at_transfer_price` stored in settlement
  - **Expandable weekly rows**: Click to show deliveries grouped by customer, date, delivery number, amount (at transfer price)
- [x] **Entry 2: Monthly Settlement** = All adjustments -> Debit/Credit Note
  - Selling Price Adjustments (customer price vs base price)
  - Return Credits (credit notes from customer returns)
  - Factory Returns (warehouse stock returned to factory at transfer price)
  - Net: positive = Debit Note, negative = Credit Note
- [x] **Reconciled Two-Entry View**: After reconciliation, full Entry 1 + Entry 2 data remains visible with expandable weekly details, adjustment breakdown, and per-account summary (2026-03-30)

## Key API Endpoints
- `POST /api/distributors/{id}/settlements/generate-monthly`
- `GET /api/distributors/{id}/settlement-preview?month=X&year=Y`
- `GET /api/distributors/{id}/monthly-reconciliation?month=X&year=Y` (returns weekly_billing + reconciled_weekly_billing with expandable details)
- `POST /api/distributors/{id}/generate-monthly-note`

## Upcoming Tasks (P1)
- Auto-generate Provisional Invoice (on shipment -> "delivered")
- Build Reporting Module

## Backlog (P2)
- Task email notifications, First-login Password Change, Email Invoice Sharing
- Settlement Auto-scheduling, Dashboard analytics, server.py refactoring
