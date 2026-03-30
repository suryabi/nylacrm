# Sales CRM & Distribution Management Application

## Original Problem Statement
A comprehensive Sales CRM and Distribution Management platform built with React frontend, FastAPI backend, and MongoDB.

## Core Architecture
- **Frontend**: React + Shadcn/UI + Tailwind CSS
- **Backend**: FastAPI (Python)
- **Database**: MongoDB

## Completed Features

### Distribution Module - Settlement & Billing
- [x] Stock Out: GST handling, collapsible sections, Factory Return with Source-first selection
- [x] Factory Return: SKU from margin matrix, credit at transfer_price
- [x] Settlement: Independently queries Credit Notes + Factory Returns, stores `total_credit_notes_issued`, `total_factory_return_credit`, `total_at_transfer_price`
- [x] Settlement Preview endpoint (`GET /api/distributors/{id}/settlement-preview`)

### Billing Reconciliation - Two Entry System (2026-03-30)
- [x] **Entry 1: Monthly Billing** = qty × transfer_price (from margin matrix per SKU)
  - Direct field `total_at_transfer_price` stored in settlement document
  - NOT derived from customer billing
- [x] **Entry 2: Monthly Settlement** = All adjustments → Debit/Credit Note
  - Selling Price Adjustments (customer price vs base price difference)
  - Return Credits (Credit Notes from customer returns)
  - Factory Returns (warehouse stock returned at transfer price)
  - Net: positive = Debit Note (distributor owes), negative = Credit Note (factory owes)
- [x] Two side-by-side cards in BillingTab
- [x] Account-level breakdown with expand/collapse
- [x] Generate Note dialog with adjustment breakdown

## Key API Endpoints
- `POST /api/distributors/{id}/settlements/generate-monthly`
- `GET /api/distributors/{id}/settlement-preview?month=X&year=Y`
- `GET /api/distributors/{id}/monthly-reconciliation?month=X&year=Y`
- `POST /api/distributors/{id}/generate-monthly-note`

## Key DB Fields (Settlement)
- `total_at_transfer_price`: Sum(qty × transfer_price from margin matrix) - DIRECT
- `total_billing_value`: Customer billing (MRP)
- `distributor_earnings`: Distributor commission
- `factory_distributor_adjustment`: Selling price difference
- `total_credit_notes_issued`: Independent credit notes
- `total_factory_return_credit`: Independent factory return credits

## Upcoming Tasks (P1)
- Auto-generate Provisional Invoice (on shipment → "delivered")
- Build Reporting Module

## Backlog (P2)
- Task email notifications, First-login Password Change, Email Invoice Sharing
- Settlement Auto-scheduling, Dashboard analytics, server.py refactoring
