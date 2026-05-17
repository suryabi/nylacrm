# Nyla Air & Water — Multi-Tenant CRM (PRD)

## Original problem statement (verbatim intent)
Production QC tracking, dynamic Distributor & Warehouse configuration, automated settlement generation, detailed reporting. Recent emphasis:
- New Marketing Requests workflow (Sales → Marketing → Delivery/Production) with versioned uploads, lead-time gating, distinct work queues.
- Geo-fenced "I am here" check-ins for Sales Reps.
- Zoho Books full-cycle: gated by Billed-by-Company vs Distributor; CN push deferred until applied to a delivery (India GST compliance).

## Stack
React + FastAPI + MongoDB (multi-tenant). Object storage via Emergent integration. Emergent LLM key for AI features. Zoho Books OAuth integration.

## Test credentials (see /app/memory/test_credentials.md)
- surya.yadavalli@nylaairwater.earth / test123 — Tenant: `nyla-air-water` — Role: CEO/Admin

## What's implemented (changelog)

### 2026-05-17 — "Optimize route" button (nearest-neighbour) ✅ DONE
- Backend `POST /api/distributor/delivery-schedules/{id}/optimize-route` with `apply` flag. Pulls a Google Routes computeRouteMatrix for the warehouse + every addressed stop, runs a greedy nearest-neighbour from the warehouse, and returns `{original_order, optimized_order, original_total_km, optimized_total_km, savings_km, applied, warnings}`. Safety: when the heuristic produces a route *worse* than the original, it falls back to the original order. Stops without an address trail at the end. Disallowed on approved/in_progress/completed/cancelled schedules when `apply=true`.
- Frontend "Optimize route" button on the Stops card header (only when editable + ≥2 stops). Opens a preview dialog showing current vs. optimised km, savings, warnings, and the proposed new order with "was #N" badges on moved stops. "Apply new order" persists via the existing schedule PUT.

### 2026-05-17 — Schedule progress bar + per-stop status pills ✅ DONE
- New `<ScheduleProgress />` card on `DeliveryScheduleDetail` for schedules at approved or later: segmented progress bar (emerald=delivered, amber=in-transit pulse, rose=skipped) + status pills ("3 of 7 delivered", "1 in-transit", "4 pending", "2 skipped") + start/end timestamp.
- Per-stop badges next to each customer row: Delivered (emerald) / In-transit (amber, first pending while live) / Pending (slate) / Skipped (rose, on completed schedules).
- Auto-refresh every 60s while `schedule.status === 'in_progress'` so distributors see driver progress without manual reload.

### 2026-05-17 — Driver mobile-web app + live GPS tracking ✅ DONE
- **Auto-provisioning**: adding a driver under Admin → Fleet now creates a linked `users` row with `role=Driver`, `phone`, synthetic email and a system-generated one-time password (8-char base32-ish, ambiguous chars dropped). The plaintext password is returned ONCE in the create response and surfaced in a "Share these credentials" Dialog (copy-to-clipboard + done). A `KeyRound` action on each driver row regenerates the password. Renames/phone changes/status flips cascade to the user row; deleting a driver deletes the user.
- **Driver login**: dedicated `POST /api/driver/login` (phone + password) and `/driver/login` page (mobile-only layout, no DashboardLayout). The shared `/login` page routes Driver-role users to `/driver/schedules` on success.
- **Driver UI**: `/driver/schedules` lists today + tomorrow approved/in_progress/completed schedules assigned to the driver (with distributor name, vehicle reg, stop count, completed_count). `/driver/schedules/:id` shows stops in dispatch order, Phone + Navigate (Google Maps directions) links, "Mark Delivered" per stop, sticky Start/End buttons.
- **GPS pings**: `POST /api/driver/tracking/ping` ingests lat/lng/accuracy/speed/heading; driver UI calls it on tenant cadence using `navigator.geolocation.watchPosition`. Settings: `gps_ping_interval_minutes` (default 5) added to `TenantSettings` and editable on the Tenant Settings screen.
- **Live map for distributors & admins**: `GET /api/distributor/delivery-schedules/{id}/tracking` returns pings + latest + `tracking_active` + interval. New `<LiveDriverMap scheduleId={...} />` component embedded in `DeliveryScheduleDetail` for schedules in approved/in_progress/completed status. Plots breadcrumb polyline + animated marker, polls at tenant cadence with incremental `since=` query.
- **Stop completion** flips `distributor_deliveries.status` from `scheduled` → `delivered` and stamps `delivered_at`/`delivered_by`/lat-lng. When every stop on a schedule is delivered the schedule auto-completes (status → `completed`, tracking_active=false). Manual "End Delivery" does the same. New status pills (in_progress, completed) added; editing is disabled once a schedule leaves `confirmed`.
- Backend tests: 11/11 pytest cases (admin create / regenerate / rotate-rejects-old / cascade-delete / driver-login / phone-validation / schedules-empty / tracking-settings / tenant-setting-persist / ping-auth-guard / stop-complete-auto-schedule).

### 2026-05-17 — Schedule approval flow + crates + round-trip distance ✅ DONE
- **Two-step workflow**: Draft → Confirmed → Approved. Stock-outs move from `confirmed` → `scheduled` **only on Approve** (not on Confirm). Approver name + UTC timestamp are stamped on the driver PDF and surfaced in a green banner on the detail page.
- **Packaging units (crates) everywhere**: schedule UI, eligible-picker, and driver PDF now show packaging counts (e.g. "3 Crate - 12") instead of raw bottle counts. Conversion uses SKU's `packaging_config.stock_out` default `units_per_package` with round-up for partial crates.
- **Distance = round trip**: Warehouse → all customers → back to Warehouse. Factory leg removed (factory_address setting no longer used by this flow).
- Approved schedules are locked: no attach/detach/reorder; only cancellation is allowed (which reverts attached stock-outs from `scheduled` → `confirmed`).
- PDF available from `confirmed` onwards (so the user can preview before approving).

### 2026-05-17 — Delivery Schedule detail: redesign + distance + drag-drop ✅ DONE
- Fixed data mapping that was showing "—" for address and crates: customer name now uses `account_name`, address falls back to `accounts.delivery_address`/`billing_address`, items pulled from `distributor_delivery_items` collection (where crates actually live).
- Redesigned stops from tile/card to **collapsible row format with expander chevron**. Compact row shows #, name, address-line, qty, controls. Expanded view shows full address, phone, and a per-SKU crates table with totals.
- **Drag-and-drop reorder** via HTML5 native (no new dep). Grip handle on each row + visual ring on drop target. Up/down arrow buttons retained as fallback.
- New `GET /api/distributor/delivery-schedules/{id}/distance` endpoint using Google Maps **Routes API** (computeRouteMatrix). Computes leg-by-leg km: distributor warehouse → stop 1 → stop 2 → ... → stop N → factory. UI shows total km in a header card AND a per-leg banner between rows (so each delivery shows its incoming-leg distance and the last row shows distance to factory).
- Added `factory_address` to TenantSettings; read by the distance route; warning surfaces in the UI if missing.
- Distance refetches automatically on reorder, attach, or detach.

### 2026-05-17 — Distributor → Deliveries module ✅ DONE
- New module visible in distributor sidebar (only for `Distributor` role): **Deliveries → Delivery Schedules**.
- Workflow: create draft schedule for a date (Today / Tomorrow / pick) → assign Vehicle + Driver (filtered to distributor's city from Admin fleet) → attach confirmed stock-outs → reorder via Move Up / Move Down → Confirm Schedule → underlying `distributor_deliveries` move `confirmed → scheduled` → download driver-friendly PDF (ReportLab, A4).
- Schedule remains editable after confirmation (per scope): attach/remove/reorder still allowed; cancellation reverts attached deliveries back to `confirmed`.
- Backend: `routes/distributor_delivery_schedules.py` (CRUD, attach/detach, confirm, cancel, PDF, fleet pickers, quick-dates). Mounted at `/api/distributor/delivery-schedules`.
- Tenant-aware. Role-gated to users with `distributor_id` set. Same-delivery-on-two-schedules guard. PDF includes schedule date, vehicle reg+name, driver name+phone, then numbered list of customer name, phone, address, SKU+qty.
- Side changes: added `city` field to drivers (parity with vehicles); added `scheduled` to DELIVERY_STATUSES and to status transition guards for "mark delivered" and "push to Zoho"; whitelisted `/distributor/delivery-schedules*` in DashboardLayout's distributor redirect guard.
- Verified end-to-end via curl: create → eligible → attach → confirm (delivery → scheduled) → PDF 200 (2.4 KB application/pdf) → cancel (delivery → confirmed) → delete. UI screenshots confirm sidebar entry, list, create dialog, and detail page.

### 2026-05-17 — Vehicles · Name + City fields ✅ DONE
- Vehicles + Drivers both have `city` (sourced from `master-locations`) for fleet filtering and the distributor's delivery-schedule picker.

### 2026-05-17 — Admin module + Fleet (Vehicles & Drivers) ✅ DONE
- New top-level context **"Admin"** in module switcher (CEO / Director / Admin / System Admin only). Default route `/admin/vehicles`.
- Admin sidebar groups: **Fleet** (Vehicles, Drivers), **Product & SKU**, **Master Data** (Locations, Lead Statuses, Business/Contact/Expense Categories, COGS Components, Lead Scoring Model), **Settings & Integrations** (Tenant Settings, API Keys, Zoho Books, Platform Admin).
- Backend: `routes/admin_vehicles.py` + `routes/admin_drivers.py` mounted at `/api/admin/vehicles` and `/api/admin/drivers`. CRUD + duplicate guards + meta/options. Tenant-aware.
- Vehicle fields (trimmed essentials): `registration_number` (unique, normalised upper/no-space), `vehicle_type`, `status`, `notes`.
- Driver fields (trimmed essentials): `full_name`, `phone` (unique, last-10-digit normalised), `license_number` (unique, upper/no-space), `status`, `notes`.
- Frontend: `pages/admin/VehiclesList.js`, `pages/admin/DriversList.js` — full CRUD UI (list, add/edit Dialog, delete confirm AlertDialog, search, status filter).
- Backend CRUD verified end-to-end via curl (create, duplicate guard, update, list, delete). Frontend smoke screenshot confirms render + dialog.

### 2026-05-17 — Auto Zoho-contact re-sync on Account edit ✅ DONE
- `PUT /accounts/{id}` and `PATCH /accounts/{id}/delivery-info` now auto-trigger `zoho_service.upsert_contact()` whenever a Zoho-relevant field changes (billing_address, delivery_address, GST/PAN/legal/trade names, contact/account name, delivery contact name/phone).
- Best-effort: Zoho failure does not block the user's save; warning is logged. Manual edits flow to the Zoho contact in the background → next invoice picks up new Bill To / Ship To automatically.
- Bonus fix in same session: removed per-invoice `billing_address` / `shipping_address` override from `create_invoice_for_delivery` so Zoho falls back to the contact defaults (eliminates the recurring "billing_address < 100 chars" 400).

### 2026-05-17 — P0 Fix: Tax & Billing manual edits no longer revert ✅ DONE
- Root cause: `server.py` had a duplicate `@api_router.put("/accounts/{account_id}")` route registered BEFORE `routes/accounts.py`'s router was included, so it shadowed the newer endpoint. Its outdated `AccountUpdate` model did not list `gst_legal_name`, `gst_trade_name`, `pan_number`, `billing_address`, `delivery_contact_name`, `delivery_contact_phone` — Pydantic silently dropped them and the GST-cert parsed values stayed in Mongo.
- Fix: Removed the duplicate route + obsolete `AccountUpdate` class from `server.py`. The full-featured route in `routes/accounts.py` now handles all PUT updates.
- Verified via curl PUT against preview backend — all four fields persist on GET after save.

### 2026-05-16 — NEW Marketing Requests module (P0) - ✅ DONE
- Backend: `models/marketing_request.py`, `routes/marketing_requests.py`, `routes/marketing_request_masters.py` (auto-seeds defaults).
- Endpoints: upload/download, list (queues), counts, detail, status (with ALLOWED_TRANSITIONS + dept/role gating), comments, versions, production-submit, production-status.
- Frontend: 3 pages — `MarketingRequests.js` (tabbed Sales/Marketing/Delivery queues), `NewMarketingRequest.js` (lead-time guardrail, file uploads, links), `MarketingRequestDetail.js` (lifecycle, versions dialog, production dialog, comments timeline).
- Wired into `App.js` routes and sidebar (Sales/Marketing/Production contexts).
- Tested: 19/19 backend pytest pass + frontend smoke verified.

### Previously completed (last session, see prior PRDs)
- Zoho Template dropdown remount fix; Geo-fenced check-in; Account billed-by toggle; Zoho CN deferred-push; Account Detail invoice match; Revenue Report fix; Distributor CN deep-links; Account activation gating; Old Marketing Requests purge.

## Active backlog

### P1
- Standardize `master_locations` as single source of truth for city spellings (recurring bug)
- KB Phase 2: per-document permissions, embedding retrieval, Drive auto-sync

### P2
- Inter-warehouse stock transfers for distributors
- Task email notifications (Resend on assignment/due)
- First-login force password change modal
- Email Invoice sharing
- Settlement auto-scheduling
- Continue refactoring `server.py` (>10k lines)
- Optional polish for Marketing Requests: shadcn DatePicker in `NewMarketingRequest.js`; role-based negative tests for illegal status transitions

## Key models & endpoints (Marketing Requests)
- Collections: `marketing_requests`, `marketing_request_files`, `marketing_request_types`, `marketing_request_statuses`, `master_departments`
- Routes: `/api/marketing-requests/*`, `/api/marketing-request-types`, `/api/marketing-request-statuses`, `/api/master-departments`
- Lifecycle keys: submitted → inputs_needed ↔ in_progress → in_review → approved_internal → final_approved → production_in_progress → production_completed

## 3rd-party integrations
- Zoho Books (OAuth + invoices + credit notes + refunds + contact mapping)
- Emergent Object Storage (Marketing Request files)
- Emergent LLM Key (Knowledge Base, AI features)
