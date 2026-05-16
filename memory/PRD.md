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

### 2026-05-16 (later)
- **Revenue Report all-zeros bug fixed** — `GET /api/sales-revenue/won-leads` was reading invoice totals from stale lead-level cached fields (`lead.total_gross_invoice_value` etc.), which stopped being maintained after invoices migrated to account-centric linkage. Now totals are recomputed live by joining won-leads → accounts (`account.lead_id` can be either UUID or formatted lead id) → invoices via the same multi-field matcher used by the Account Detail page (`account_uuid`/`account_id`/`account_id_from_mq`/`ca_lead_id`/`lead_id`). Verified on preview: "Last Month" Toopa Ice-creamery jumped from ₹0 → ₹62,939.50 (3 invoices).

### 2026-05-16
- **Account-detail invoice matcher hardened** — `GET /api/accounts/{id}/invoices` was missing some externally-pushed invoices on the Account Detail page (visible on global `/invoices` list but absent on account page):
  - **Case-insensitive** match on `account_id`, `account_id_from_mq`, `ACCOUNT_ID`.
  - **Lead linkage fixed**: now resolves the lead's formatted `lead_id` (e.g., `ASEM-HYD-L26-001`) and matches it against `ca_lead_id` — previously matcher used the lead UUID against `ca_lead_id`, which never matched.
  - **Regex-escaped** `account_name` (parentheses/special chars no longer break the `customer_name` regex match); also matches against invoice's own `account_name` field.
  - **invoice_date as datetime OR string** — date-range clause is now an `$or` over both representations to catch invoices stored as BSON Date vs. `YYYY-MM-DD` string.
  - **Diagnostic logging** — when the matcher returns zero invoices for `this_month`, the backend now logs per-clause counts so we can pinpoint which linkage path silently fails for a specific tenant.

### 2026-05-15
- **Field check-in for Sales Reps on Leads** ("I am here" geo-fenced button)
  - New reusable `LeadDeliveryAddressCard.js` adds a Google Places autocomplete-driven address card on every Lead Detail page (mirrors AccountDetail's delivery card).
  - `DeliveryAddress` model upgraded with `lat`, `lng`, `formatted_address`, `extra="allow"`.
  - `LeadUpdate` accepts `delivery_address` and the lead update endpoint persists it.
  - New `POST /api/leads/{lead_id}/check-in` — captures sales rep's GPS, computes Haversine distance from the lead's saved coordinates, and creates a `visit` activity whose description always includes the distance and time. Off-site visits (outside the tenant's `check_in_radius_meters`) get flagged "(off-site)".
  - Configurable radius (`TenantSettings.check_in_radius_meters`, default 50m) editable from Tenant Settings ▸ Distribution Settings panel.
  - Frontend handles geolocation permission errors gracefully (denied / unavailable / timeout) with toast feedback.
- **Zoho template dropdown bug** — hoisted the inline `TemplateSelect` out of `TemplateSettingsPanel` in `ZohoIntegration.js`; the select was being remounted on every parent re-render, closing the open dropdown instantly. Now stable.

### 2026-02-13 (this session)
- **Mobile-responsive AccountDetail.js + LeadDetail.js**
  - **AccountDetail header** rewrites for mobile: title block wraps with B2B badge inline, Edit/Save/Cancel/Delete buttons drop to a 2nd row with proper sizing (`h-9 sm:h-10`, icon-only Delete on small screens).
  - All `Card className="p-6"` → `p-4 sm:p-6`; all section `<h2 className="text-lg ...">` → `text-base sm:text-lg` so cards don't waste space on phones.
  - Invoice Summary metric tiles: `grid-cols-2 sm:grid-cols-3 lg:grid-cols-5` so they ladder instead of overflowing.
  - SKU Pricing table: `min-w-[440px]` + edge-to-edge horizontal scroll on mobile (`-mx-4 sm:mx-0`).
  - Location/Account Info grids: collapse to 1-col / 3-col as appropriate; smaller text on mobile.
  - **Mobile "Show more details" collapsible** added on both pages — hides Account Details / Signed Contract / Account Scoring (AccountDetail) and Lead Scoring / Related Leads (LeadDetail) by default on phones; toggle button (`data-testid="toggle-secondary-mobile-btn"`) with rotating chevron.
  - LeadDetail outer container gets `pb-24 sm:pb-0` to clear the floating "Ask Nyla" button.
- **Corporate UI language extended across Account page** (`frontend/src/pages/AccountDetail.js`)
  - **Activation banner** redesigned: white card with amber left-rail, slate-900 icon tile, "ACTION REQUIRED" pulsing pill, dark CTA with amber accent. (Replaces violet gradient)
  - **Activated chip** redesigned: white card with emerald left-rail, slate-900 icon tile with ShieldCheck, "ACTIVE / ZOHO SYNCED" pills, mono Zoho ID, outlined dark CTA.
  - **Delivery Address visiting card** redesigned: slate-900 mini icon, emerald "GPS Locked" pill, blue left-rail on the visiting-card view, gradient background with watermark MapPin, "SHIP-TO ADDRESS" eyebrow label, mono GPS coords with own icon tile.
  - **Account page Invoice Summary locked to "This Month"** with **MoM delta indicators** under Gross & Net tiles (TrendingUp/Down + colored pct).
  - `fetchInvoices` parallelised (`Promise.all`) — fetches current period + last_month for MoM in one round-trip.
  - Empty state CTA navigates to `/invoices?account_name=<name>` without the time_filter.





### 2026-02-11 (this session — later)
- **Zoho Books OAuth integration (scaffolding)** — India DC. Per-tenant connection model; CEO/Admin/System Admin only can manage.
  - Backend service `services/zoho_service.py`: Fernet-encrypted token storage, OAuth flow (auth URL, code↔token exchange, refresh, revoke), org listing, contact upsert, invoice creation, rate-limit aware HTTP client with 429 Retry-After + exponential back-off, background sync orchestrator (3 attempts: 0s/4s/16s).
  - Backend routes `routes/zoho_books.py`:
    - `GET /api/zoho/config-status` & `GET /api/zoho/status`
    - `GET /api/zoho/oauth/initiate` (CSRF state, 15 min TTL) and `GET /api/zoho/oauth/callback` (single-use state)
    - `DELETE /api/zoho/disconnect` (revokes + clears creds)
    - `GET|PUT|DELETE /api/zoho/sku-mappings/{sku_id}` and `GET /api/zoho/items` (Zoho item search proxy)
    - `GET /api/zoho/sync-status`, `POST /api/zoho/sync/delivery/{distributor_id}/{delivery_id}` (manual retry)
  - Hook in `routes/distributors.py`: `confirm_delivery` now schedules a `BackgroundTask` to push the invoice to Zoho (no-op when integration is not configured/connected for the tenant).
  - Frontend `pages/ZohoIntegration.js` at `/settings/integrations/zoho`: 3 tabs — Connection (connect/disconnect + org info), SKU Mapping (table with Zoho item picker dialog with search), Sync Status (summary cards + filterable history + retry button).
  - Sidebar: new "Zoho Books" entry under Admin (gated to CEO/Admin/System Admin).
  - Env placeholders added: `ZOHO_CLIENT_ID`, `ZOHO_CLIENT_SECRET`, `ZOHO_ACCOUNTS_URL`, `ZOHO_API_BASE_URL`, `ZOHO_ENCRYPTION_KEY`.
  - Status: **scaffolding complete** — user needs to register OAuth client at https://api-console.zoho.in/ and paste `ZOHO_CLIENT_ID` / `ZOHO_CLIENT_SECRET` into `backend/.env` before the connect button works.

### 2026-02-11 (this session — earlier)
- **Stock-In Receipt Acknowledgement Flow** — Distributors can now review incoming shipments, acknowledge actual quantity received per SKU, and submit any discrepancy back to the supplier for approval.
  - New shipment status: `discrepancy_pending`
  - New per-item fields: `received_quantity`, `discrepancy_remark`, `acknowledged_at`, `acknowledged_by`
  - New endpoints in `routes/distributors.py`:
    - `POST /api/distributors/{distributor_id}/shipments/{shipment_id}/acknowledge` (distributor; admin fallback) — full match → delivered + stock added; any mismatch → `discrepancy_pending`
    - `POST /api/distributors/{distributor_id}/shipments/{shipment_id}/approve-receipt` (supplier admin) — locks in received qty, factory stock refunded for the delta, distributor stock added at received qty
    - `POST /api/distributors/{distributor_id}/shipments/{shipment_id}/reject-receipt` (supplier admin) — clears received qty, reverts status to `in_transit` for re-verification
  - Frontend (`DistributorDetail.js`):
    - "Acknowledge Receipt" button on `confirmed`/`in_transit`/`partially_delivered` shipments
    - New Acknowledge Receipt dialog with per-SKU Sent/Received/Δ + Discrepancy Remark inputs, "Mark all received in full" shortcut, smart submit button (green / amber)
    - Discrepancy review panel in supplier admin's shipment detail (Approve / Reject with reason)
    - Status badge updated for `discrepancy_pending`
    - Items table shows Received qty + delta + distributor remark inline
  - Regression: `backend/tests/test_shipment_acknowledge.py` — 6 tests passing (full receipt, discrepancy→approve, discrepancy→reject, validation: exceed sent qty, double-acknowledge, approve-without-pending).

### 2026-02-04
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
