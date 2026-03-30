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
- [x] CEO/Admin can delete any transaction regardless of status:
  - Stock Out (deliveries) — any status except settled
  - Customer Returns — any status, auto-cancels linked credit note
  - Factory Returns — any status
  - Credit Notes — if not applied to deliveries

### Billing Reconciliation - Two Entry System
- [x] **Entry 1: Monthly Billing** = qty x transfer_price (from margin matrix per SKU)
  - Weekly line items with expandable delivery details (customer, date, delivery #, amount at transfer price)
- [x] **Entry 2: Monthly Settlement** = All adjustments -> Debit/Credit Note
- [x] **Reconciled Two-Entry View**: Full Entry 1 + Entry 2 data visible after reconciliation
- [x] **Draft Note Deletion Reverts Reconciliation**: Deleting a draft/pending note reverts linked settlements

## Key API Endpoints
- `DELETE /api/distributors/{id}/deliveries/{delivery_id}` (CEO/Admin: any status)
- `DELETE /api/distributors/{id}/returns/{return_id}` (CEO/Admin: any status)
- `DELETE /api/distributors/{id}/factory-returns/{return_id}` (CEO/Admin: any status)
- `DELETE /api/distributors/{id}/credit-notes/{credit_note_id}` (CEO/Admin: if unapplied)
- `DELETE /api/distributors/{id}/notes/{note_id}` (reverts reconciliation for draft/pending)
- `GET /api/distributors/{id}/monthly-reconciliation?month=X&year=Y`
- `POST /api/distributors/{id}/generate-monthly-note`

## Upcoming Tasks (P1)
- Auto-generate Provisional Invoice (on shipment -> "delivered")
- Build Reporting Module

## Backlog (P2)
- Task email notifications, First-login Password Change, Email Invoice Sharing
- Settlement Auto-scheduling, Dashboard analytics, server.py refactoring
