# Sales CRM & Distribution Management Application

## Original Problem Statement
A comprehensive Sales CRM and Distribution Management platform built with React frontend, FastAPI backend, and MongoDB. The system manages leads, accounts, invoices, distributor operations (stock-in, stock-out, returns, settlements, billing), and integrates with multiple 3rd party services.

## Core Architecture
- **Frontend**: React + Shadcn/UI + Tailwind CSS
- **Backend**: FastAPI (Python)
- **Database**: MongoDB
- **Integrations**: Amazon MQ, Emergent Object Storage, Gemini LLM, Zoom API, Resend, Google Places, Google Workspace OAuth, Claude Sonnet 4.5

## Completed Features

### Distribution Module - Stock Out & Settlement Overhaul
- [x] Stock Out UI with GST handling (pre-tax main table, post-tax popup summaries)
- [x] Collapsible sections: "Distributor to Customer" and "Distributor to Factory"
- [x] Factory Return dialog with Source-first selection (Warehouse vs Customer)
- [x] Factory Return SKU dropdown from `distributor_margin_matrix` only
- [x] Factory Return credit formula uses `transfer_price` (not `base_price`)

### Settlement Generation (Fixed 2026-03-30)
- [x] Settlement independently queries Credit Notes and Factory Returns
- [x] Settlement stores `total_credit_notes_issued` and `total_factory_return_credit`
- [x] Net Payout formula: Earnings - Price Adj + Credit Notes + Factory Returns
- [x] Settlement Preview endpoint (`GET /api/distributors/{id}/settlement-preview`)
- [x] Redesigned Settlements tab with 3 summary cards, payout formula bar, 3 detail tables
- [x] Account-level grouping with expand/collapse and grand totals

### Billing Reconciliation - Transfer Price Based (Redesigned 2026-03-30)
- [x] **Core Logic**: Distributor pays Nyla at transfer price for stock sold to customers
- [x] **Formula**: Amount Payable (at Transfer Price) - Credit Notes - Factory Returns = Net Settlement
- [x] **Debit/Credit Note**: Positive net = Debit Note (dist owes), Negative = Credit Note (Nyla owes)
- [x] Reconciliation flow visualization (4-step: Stock → Less CN → Less FR → Net)
- [x] Formula bar showing calculation breakdown
- [x] Settlement breakdown by account with "At Transfer Price" column
- [x] Generate Note dialog with complete flow summary
- [x] Backend returns `total_payable_to_nyla`, `net_settlement`, `settlement_note_type`

## Key API Endpoints (Distribution)
- `POST /api/distributors/{id}/settlements/generate-monthly` - Generate monthly settlements
- `GET /api/distributors/{id}/settlement-preview?month=X&year=Y` - Preview settlement components
- `GET /api/distributors/{id}/monthly-reconciliation?month=X&year=Y` - Transfer-price reconciliation
- `POST /api/distributors/{id}/generate-monthly-note` - Generate Debit/Credit Note
- `POST /api/distributors/{id}/factory-returns` - Create factory return

## Key DB Collections
- `distributor_settlements`: `{total_billing_value, distributor_earnings, factory_distributor_adjustment, total_credit_notes_issued, total_factory_return_credit, final_payout, settlement_month, settlement_year}`
- `distributor_debit_credit_notes`: `{note_type, amount, total_payable_to_nyla, total_credit_notes, total_factory_return_credit, net_settlement}`
- `credit_notes`: `{original_amount, created_at (datetime), status, account_id}`
- `distributor_factory_returns`: `{source, reason, requires_settlement, total_credit_amount, return_date (string)}`

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
