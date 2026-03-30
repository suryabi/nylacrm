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
  - Weekly line items with expandable delivery details (customer, date, delivery #, amount at transfer price)
- [x] **Entry 2: Monthly Settlement** = All adjustments -> Debit/Credit Note
  - Selling Price Adjustments, Return Credits, Factory Returns, Net Debit/Credit Note
- [x] **Reconciled Two-Entry View**: Full Entry 1 + Entry 2 data visible after reconciliation with expandable weekly details
- [x] **Draft Note Deletion Reverts Reconciliation**: Deleting a draft/pending note reverts linked settlements to unreconciled, allowing user to re-reconcile (2026-03-30)

## Key API Endpoints
- `POST /api/distributors/{id}/settlements/generate-monthly`
- `GET /api/distributors/{id}/settlement-preview?month=X&year=Y`
- `GET /api/distributors/{id}/monthly-reconciliation?month=X&year=Y`
- `POST /api/distributors/{id}/generate-monthly-note`
- `DELETE /api/distributors/{id}/notes/{note_id}` (reverts reconciliation for draft/pending notes)

## Upcoming Tasks (P1)
- Auto-generate Provisional Invoice (on shipment -> "delivered")
- Build Reporting Module

## Backlog (P2)
- Task email notifications, First-login Password Change, Email Invoice Sharing
- Settlement Auto-scheduling, Dashboard analytics, server.py refactoring
