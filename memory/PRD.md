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
- [x] CEO/Admin can delete any transaction regardless of status (deliveries, customer returns, factory returns, credit notes)

### Billing Reconciliation - Two Entry System
- [x] Entry 1: Monthly Billing at transfer price with expandable weekly details
- [x] Entry 2: Monthly Settlement (Debit/Credit Note) with full adjustment breakdown
- [x] Reconciled Two-Entry View: Full data visible after reconciliation
- [x] Draft Note Deletion reverts reconciliation status

### Stock Dashboard (NEW - 2026-03-30)
- [x] New "Stock" tab on distributor page — real-time inventory dashboard
- [x] **Summary Cards**: Stock Received, Delivered to Customers, Customer Returns, Factory Returns, Stock at Hand (with %), SKUs Tracked
- [x] **Bottle Tracking**: Empty/Reusable, Damaged, Expired, Pending Factory Return counts
- [x] **SKU Table**: Per-SKU breakdown with all metrics, expandable rows showing return category breakdowns
- [x] **Performance Metrics**: Weekly average deliveries, % stock at hand, days of stock remaining
- [x] Visual indicators: negative stock in red, low stock days highlighted, progress bars for % at hand

## Key API Endpoints
- `GET /api/distributors/{id}/stock-dashboard` — Real-time stock aggregation
- `GET /api/distributors/{id}/monthly-reconciliation?month=X&year=Y`
- `DELETE /api/distributors/{id}/deliveries/{delivery_id}` (CEO/Admin: any status)
- `DELETE /api/distributors/{id}/returns/{return_id}` (CEO/Admin: any status)
- `DELETE /api/distributors/{id}/factory-returns/{return_id}` (CEO/Admin: any status)
- `DELETE /api/distributors/{id}/credit-notes/{credit_note_id}` (CEO/Admin only)

## Upcoming Tasks (P1)
- Auto-generate Provisional Invoice (on shipment -> "delivered")
- Build Reporting Module

## Backlog (P2)
- Task email notifications, First-login Password Change, Email Invoice Sharing
- Settlement Auto-scheduling, Dashboard analytics, server.py refactoring
