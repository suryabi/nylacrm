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

## Recent Implementations (Feb 2026)
- 2026-02-04: Standalone Credit Note issuance ("Pay Customer") on Returns grid.
- 2026-02-04: Settlement math corrected — direct credit-note issuances deducted *after* Net Billable; delivery-linked credits *before*.
- 2026-02-04: Unified sign convention across UI ("+" Distributor pays Supplier, "-" Supplier pays Distributor).
- 2026-02-04: Removed "Factory pending" column from Return Detail items table.
- 2026-02-04: Single `PayCustomerDialog`, popups auto-close on action.
- **2026-02-04 (this session): Fixed account-to-distributor assignment failure caused by Bangalore/Bengaluru city alias mismatch.**
  - Added `CITY_ALIASES` map covering common Indian city renames (Bangalore↔Bengaluru, Bombay↔Mumbai, Madras↔Chennai, Calcutta↔Kolkata, Pune/Poona, Trivandrum/Thiruvananthapuram, Cochin/Kochi, Baroda/Vadodara, Mysore/Mysuru, Mangalore/Mangaluru, Belgaum/Belagavi, Gurgaon/Gurugram, Allahabad/Prayagraj).
  - Updated `create_account_assignment`, primary-assignment dedupe check, and `search-assignable-accounts` to use alias-aware comparison.
  - Also fixed `account_name` denormalisation fallback (was returning null).
  - Verified via curl: assigning "Bangalore Tech Park" (city=Bangalore) to a distributor covering "Bengaluru" now succeeds.

## Roadmap

### P0
- AI features for Marketing Requests (Gemini 3 Flash via Emergent LLM key — feedback summarisation, auto-suggest timelines, similar past designs, SLA breach flags).

### P1
- Auto-generate Provisional Invoice when primary shipment status → "delivered".
- Align Billing & Reconciliation tab numbers with Settlements tab (shared `stockout_totals` helper).
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
- `/app/backend/routes/distributors.py` — distributor / assignment / shipment APIs.
- `/app/backend/routes/credit_notes.py` — credit notes incl. standalone issuances.
- `/app/frontend/src/components/distributor/AssignmentsTab.jsx` — assignment dialog (uses cities from operating coverage).
- `/app/frontend/src/pages/DistributorDetail.js` — settlement popup math ladder.
