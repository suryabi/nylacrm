# Roadmap — Inventory Management Module

Large module being delivered in tested phases (user approved phased build, 2026-06-11).
User choices: replace mock Vendors/Inventory pages (done); reuse Master Locations for
warehouses; customer-specific items link to Leads OR Accounts; single-step PO approval.

## ✅ Phase 1 — Masters (DONE 2026-06-11)
- Item Master, Vendor Master, Vendor-Item time-bounded pricing (+overlap guard).

## 🔜 Phase 2 — Stock & Dashboard
- Inventory Stock Entry types: Opening Stock, Purchase Receipt, Manual Adjustment,
  Stock Return, Damaged Stock, Consumption/Issue to Production.
- Each entry: item, qty, UoM, warehouse/location (reuse Master Locations), date,
  reference type/number, remarks, created_by. Auto-update current_stock + audit ledger.
- Inventory Dashboard: total items, low/out-of-stock, pending/delayed POs (later),
  customer-specific inventory, stock value, recent inward/consumption.
- Reorder/low-stock alerts when stock <= reorder level.

## 🔜 Phase 3 — Purchase Orders
- PO creation: auto PO#, vendor, expected delivery, item lines (qty/UoM/rate/tax/total),
  delivery location, payment terms, remarks. Auto totals. Pick active vendor price by PO date.
- Approval workflow: Draft → Submitted → Approved → Sent to Vendor → Partially/Fully Received
  → Cancelled/Closed. Single approval step. Only Approved POs can be received.
- Order tracking: raised/confirmation/expected/actual dates, delay days, pending/received qty,
  vendor lead-time performance.

## 🔜 Phase 4 — Goods Receipt / Inward
- GRN against approved POs: ordered/received/pending/accepted/rejected qty, batch#, invoice#/date.
- After GRN approval: accepted qty → stock; auto-update PO status (partial/full received).

## 🔜 Phase 5 — Customer-specific, Reports, RBAC polish, Validations
- Customer-specific inventory views + guard (don't use a customer's item for another customer).
- Reports (9): Current Stock, Item-wise Stock Ledger, Vendor Price History, Pending PO,
  GRN, Low Stock, Customer-specific Inventory, Stock Consumption, Purchase Price Comparison.
- Role access mapping: Purchase Team, Inventory Team, Production Team, Sales Team, Finance Team.
- Remaining validations/automation: negative-stock guard (admin override), reorder alerts,
  PO-number generation, delay alerts, complete audit trail.
