# Nyla Air Water CRM — PRD

## Original Problem Statement
Multi-tenant CRM covering Sales, Production, Marketing & Distribution. Recently the focus has been on:
- Production QC tracking
- Auto Provisional Invoicing
- Comprehensive Reporting (actuals from Invoices, not Lead estimates)
- Marketing Request Lifecycle (10-stage workflow)
- Personal Calendar two-way sync (Google Calendar)
- "Ask Nyla" AI Knowledge Base (RAG via Emergent LLM key)
- Distributor self-service portal (Home, Contacts, Stock Out, Settlements, Returns)
- Standardize Account categorisation to Lead Type (B2B, Retail, Individual)
- Refactor `server.py` (>10k lines)

## Tech Stack
- React (CRA) + Tailwind + shadcn/ui
- FastAPI + Motor (async MongoDB)
- Emergent LLM key (Ask Nyla)
- Amazon MQ (ActiveMQ)
- Emergent Object Storage (PDFs, attachments)
- Google Calendar, Zoom, Resend

## Recent Implementations

### 2026-02-04 (this session)
- **Account-to-distributor assignment alias-aware fix** — Bangalore/Bengaluru, Mumbai/Bombay, etc.
  - Added `CITY_ALIASES` map + `cities_match()` helper in `routes/distributors.py`.
  - Fixed `create_account_assignment`, primary-assignment dedupe, `search-assignable-accounts`.
  - Verified: assigning "Bangalore Tech Park" (city=Bangalore) to a distributor covering "Bengaluru" works.
- **Billing ↔ Settlements alignment (single source of truth)** — `monthly-reconciliation` and `generate-monthly-note` endpoints now compute Entry 2 Net via the same `stockout_totals`-driven formula used in the Settlements tab popup:
  - `net_settlement = net_billable − billed_at_transfer − direct_credit_issued − factory_return_credit`
  - Response now exposes `stockout_aggregate` block (customer_order_value, distributor_margin, actual_billable, credit_applied, billed_at_transfer, direct_credit_issued, factory_return_credit, net_settlement).
  - Same for reconciled (`stockout_aggregate_reconciled`).
  - Frontend `BillingTab.jsx` Entry 2 now displays the canonical math ladder + per-account/per-settlement rows derived from stockout. Verified: Σ per-settlement net = backend `net_adjustment_amount` (₹2,763 for Brian / May 2026).
  - The displayed **Debit Note amount in Billing tab now matches Settlements tab Net Settlement exactly**.

### Earlier this session
- Standalone Credit Note issuance ("Pay Customer") on Returns grid.
- Settlement math correction — direct credit-note issuances deducted *after* Net Billable; delivery-linked credits *before*.
- Unified sign convention across UI ("+" Distributor pays Supplier, "-" Supplier pays Distributor).
- Removed "Factory pending" column from Return Detail items table.
- Single `PayCustomerDialog`, popups auto-close on action.

## Roadmap

### P0
- AI features for Marketing Requests (Gemini 3 Flash via Emergent LLM key — feedback summarisation, auto-suggest timelines, similar past designs, SLA breach flags).
- **Master Locations as single source of truth** — replace remaining free-text city inputs (account delivery address, contacts, tenant settings, customer return address) with master_cities-driven Selects; canonicalise on write; one-time migration of existing rows. Backend canonicalisation helper (DB-driven) to replace the inline `CITY_ALIASES` map.

### P1
- Auto-generate Provisional Invoice when primary shipment status → "delivered".
- KB Phase 2: per-doc permissions, embedding-based retrieval, GDrive auto-sync, "ask about this lead" context-aware queries.

### P2
- Task email notifications via Resend.
- First-login force password change modal.
- Email Invoice sharing.
- Settlement period auto-scheduling.
- Continue refactoring `server.py` (still >10k lines).
- Google Workspace OAuth `redirect_uri_mismatch` fix.

## Pending User Verification (Production)
- PNG/JPEG bottle preview uploads
- Ask Nyla markdown rendering
- Invoices page blank in production

## Test Credentials
- Admin: `admin@nylaairwater.earth` / `test123`
- Test Distributor: `john.distributor@test.com` / `nyladist##`
- Tenant ID: `nyla-air-water`

## Key Files
- `/app/backend/routes/distributors.py` — distributor / assignment / shipment / settlements / monthly-reconciliation APIs.
- `/app/backend/routes/credit_notes.py` — credit notes incl. standalone issuances.
- `/app/frontend/src/components/distributor/SettlementsTab.jsx` — settlements list + per-settlement Net.
- `/app/frontend/src/components/distributor/BillingTab.jsx` — monthly billing + Net Settlement (now stockout-driven).
- `/app/frontend/src/components/distributor/AssignmentsTab.jsx` — assignment dialog.

## Canonical Settlement Math (single source of truth)

For each settlement, derived from `stockout_totals`:

```
Customer Order Value           (Σ stockout_qty × selling_price)
− Distributor Margin           (margin %)
= Actual Billable
− Delivery-linked Credit Notes (returns offset against the same delivery)
− Direct Credit Notes          (standalone issuances paid out-of-pocket)
− Already Billed at Transfer   (Stock-In billed entire stock at TP)
− Factory Return Credit        (warehouse returns sent back to factory)
= Net Settlement               (+ ⇒ Debit Note, − ⇒ Credit Note)
```

Both the **Settlements tab** and the **Billing & Reconciliation tab** read from this same formula. They cannot drift.
