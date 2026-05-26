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

### 2026-05-27 — Stock Transfer pricing: `master_skus.base_price` + Cross-PAN block ✅ DONE
- **Pricing source migrated**: Stock Transfer rate now comes from a new SKU-level field `master_skus.base_price` (the company-wide no-margin list price), NOT from `distributor_margin_matrix` anymore. Schedule-I / Rule 30 compliant per Indian GST law for branch transfers between distinct GSTINs of the same legal entity.
- **Cross-PAN block**: `POST /api/distributor/stock-transfers/` now returns HTTP 400 when source PAN ≠ destination PAN with a clear message directing the user to use **Stock In** instead (where commission, settlement and margin are tracked). Runs before stock + pricing checks so the right error surfaces first.
- **Backend changes**:
  - `/app/backend/server.py`: `SKUCreate`, `SKUUpdate` Pydantic models gain `base_price: Optional[float]`; GET/POST/PUT `/api/master-skus` all read/write/return the field.
  - `/app/backend/routes/distributor_stock_transfers.py`: `_resolve_per_bottle_rate` now takes just `(tenant_id, sku_id)` and reads `master_skus.base_price`. `resolve_transfer_rate` endpoint signature simplified to `?sku_id=…&units_per_package=…` (no destination params — pricing is destination-independent). Persisted items carry `rate_source='master_sku.base_price'`. Cross-PAN block added early in `create_stock_transfer`.
- **Frontend changes**:
  - `/app/frontend/src/pages/SKUManagement.js`: SKU form now has "Base Price (₹ per bottle)" input (testid `sku-base-price-input`) — used for Stock Transfer invoicing & E-way Bill valuation. POST/PUT payload coerces to number or null.
  - `/app/frontend/src/pages/StockTransfers.js`: `resolveRateForItem` no longer depends on destination; effect re-runs only on SKU/packaging change. Dialog description rewritten to reflect new pricing source + cross-PAN block. Placeholder updated to "Pick a SKU".
- **Tests**: `/app/backend/tests/test_stock_transfer_pricing.py` rewritten — 13 unit tests over `_resolve_per_bottle_rate`, `_qualifies_for_challan`, `_extract_pan`. `/app/backend/tests/test_iteration_176_base_price_and_cross_pan.py` (created by testing agent) — 8 live-API tests for GET/POST/PUT master-skus base_price plumbing, resolve-rate signature, cross-PAN block, missing-base-price block. Combined with existing E-way Bill tests: **29/29 pass**.
- **Mental model now crystal-clear**:
  - **Stock In** = sale to a partner distributor with margin (uses `distributor_margin_matrix`)
  - **Stock Transfer** = internal logistics, no margin (uses `master_skus.base_price`); cross-PAN blocked

### 2026-05-27 — Stock Transfer: Factory Warehouses now first-class ✅ DONE
- **Problem (PRODUCTION)**: User reported empty Stock tabs and that the factory "Master Warehouse Hyderabad" with 600 crates didn't show in Stock Transfer's source picker. Root cause: factory warehouses store stock in `factory_warehouse_stock`, but the Stock Transfer module only read `distributor_stock`. The transfer flow had a cross-collection blind spot.
- **Backend** `/app/backend/routes/distributor_stock_transfers.py`:
  - New helpers `_adjust_distributor_stock`, `_adjust_factory_stock`, `_adjust_stock_for_location` (dispatcher), `_read_source_stock` — every place that reads/writes stock now routes by `location.is_factory`.
  - `GET /eligible-sources` aggregates from BOTH collections, **deduped** by `location_id` (a warehouse with rows in both collections shows once, totals summed). Each row carries `source_kind ∈ ('factory','distributor')` and `is_factory: bool`.
  - `GET /eligible-targets` exposes `is_factory: bool`.
  - **New endpoint** `GET /location-stock?location_id=…` returns per-SKU stock for ANY warehouse (factory or distributor) — used by the New Stock Transfer dialog to populate availability for factory sources.
  - **New endpoint** `GET /warehouse-stock-overview` — Safety Dashboard. Aggregates both collections grouped by warehouse, flags mismatch warnings (stock in the wrong collection) and orphan rows (stock pointing at deleted locations), returns totals.
  - `POST /` (create transfer) now uses `_read_source_stock` + `_adjust_stock_for_location` so the inventory move targets the correct collection. Persisted doc carries `source_kind`, `source_is_factory`, `dest_kind`, `dest_is_factory`. Rollback path uses the same dispatcher (factory side rolls back to `factory_warehouse_stock`).
  - Allowed flows per user choice: Factory → Distributor (1.a), Distributor → Factory (2.b), Factory → Factory, Distributor → Distributor. Zoho doc rule unchanged (3.a).
- **Frontend** `/app/frontend/src/pages/StockTransfers.js`: source dropdown labels factory warehouses with ` · Factory`; SKU availability comes from new `/location-stock` endpoint.
- **Frontend** `/app/frontend/src/pages/StockDashboard.jsx`: new **Safety Overview** tab (testid `tab-safety-overview`) shows the unified warehouse stock table with Factory/Distributor kind badges, per-warehouse total bottles, mismatch warnings, and an Orphan rows card. Tab title badge shows total issue count.
- **Testing**: 7 new pytest cases in `/app/backend/tests/test_factory_stock_transfer.py` (created by the testing agent in iteration 175) covering eligible-sources factory rows, eligible-targets is_factory, /location-stock for both kinds, /warehouse-stock-overview totals, and a full Factory→Distributor POST that asserts the inventory move lands in the correct collection. All 7 pass. Combined regression: **30/30 backend tests pass**. Frontend smoke confirmed Safety Overview surfaces a real production-data mismatch (31 bottles of `Nyla – 660 ml / Sparkling` mis-stored in distributor_stock at the `Default master` factory warehouse).

### 2026-05-27 — E-way Bill JSON payload auto-generator ✅ DONE
- **Goal**: any transfer (Invoice or Delivery Challan) with consignment value > ₹50,000 needs an E-way Bill on the GSTN portal. We now generate a one-click GSTN-bulk-upload JSON pre-filled from the transfer.
- **Backend** new builder `/app/backend/utils/eway_bill.py` (`build_eway_bill_payload`) implements GSTN single-row schema v1.03: supplyType, subSupplyType (1 Supply for INV, 5 Branch Transfer for CHL), docType (INV/CHL), docDate (DD/MM/YYYY), from*/to* addresses + GSTIN + state codes (from GSTIN first 2 digits), itemList with HSN + per-line CGST/SGST/IGST split (intra-state → CGST+SGST, inter-state → IGST), totals, transMode=Road, vehicleNo. Defaults: HSN `22011010`, GST `18%` — overridable per-SKU via `master_skus.hsn_code` / `master_skus.gst_percent`.
- **Backend endpoint** `GET /api/distributor/stock-transfers/{id}/eway-bill` returns `{transfer_number, required, is_inter_state, src_state_code, dst_state_code, warnings, totals, payload, bulk_payload}`. The `bulk_payload` is the GSTN bulk-upload wrapper (`{version: "1.0.0123", billLists: [payload]}`).
- **Frontend** `StockTransfers.js`: each row whose `total_value > 50000` shows a **"⬇ E-way Bill"** button (testid `eway-bill-btn-${id}`). Click downloads `eway-bill-<transfer_number>.json` to disk + toasts a success or yellow warning summary listing the first 3 missing fields. Tooltip shows the line value + threshold context.
- **Warnings surfaced**: missing source/dest GSTIN, missing PIN code, missing HSN on a SKU, missing GST rate on a SKU, missing vehicle number — each rendered in the toast description so the user can correct master data before uploading.
- **Tests** `/app/backend/tests/test_eway_bill_builder.py` — 8 cases: intra-state CGST+SGST split, inter-state IGST, ₹50k threshold flag, doc-type mapping (INV vs CHL → subSupplyType 1 vs 5), missing HSN/GST defaulting, missing GSTIN/PIN/vehicle warnings, location-level GSTIN override, doc-date format. All 8 pass; combined suite `tests/test_eway_bill_builder.py + tests/test_stock_transfer_pricing.py` = **22/22 green**. Live smoke verified against an existing transfer — returns valid payload with totals + warnings.

### 2026-05-27 — Stock Transfer: Delivery Challan now requires EXACT GSTIN match ✅ DONE
- **Rule change** (per user clarification): Delivery Challan is created only when both warehouses are self-managed AND share the **exact same GSTIN**. Any GSTIN difference — including inter-state branches of the same legal entity (same PAN, different state code) — now generates a **Tax Invoice** instead.
- Backend `_qualifies_for_challan` in `/app/backend/routes/distributor_stock_transfers.py` now compares full GSTINs (case-insensitive, location-level override takes precedence). `_extract_pan` still used to display the PAN on list rows and persisted transfer docs as a reference field.
- Frontend `/app/frontend/src/pages/StockTransfers.js`: doc-type preview banner and page hint text updated to reference GSTIN equality. Read-only fields use new wording: "exact same GSTIN (same legal entity AND same state registration)".
- Tests `/app/backend/tests/test_stock_transfer_pricing.py`: 6 new cases covering same-GSTIN→challan, same-PAN-different-GSTIN→invoice (the rule-change case), one-party-non-self-managed, GSTIN-missing, location-level override precedence, case-insensitive match. All **14/14 tests pass**.

### 2026-05-27 — Stock Transfer Rate Auto-Resolved from Commercials ✅ DONE
- **Problem**: users were manually entering per-package rate when creating inter-warehouse stock transfers, defeating contracted pricing held in `distributor_margin_matrix`.
- **Backend** `/app/backend/routes/distributor_stock_transfers.py`:
  - New helper `_resolve_per_bottle_rate(tenant_id, distributor_id, city, sku_id, transfer_date)` — looks up the active `distributor_margin_matrix` entry for (dest distributor + dest warehouse city + SKU) within `active_from..active_to`, prefers the most recent one, returns `{rate_per_bottle, base_price, transfer_price, margin_*}`. Falls back to `base_price` when `transfer_price` is null.
  - New endpoint `GET /api/distributor/stock-transfers/resolve-rate` (returns `{ok, rate_per_bottle, rate_per_package, details}` or `{ok:false, reason}`).
  - `POST /api/distributor/stock-transfers/` now IGNORES any client-supplied `rate`; resolves server-side from the matrix; **returns HTTP 400** ("No active commercial / transfer-price found at destination for: …") if any item has no commercial. Persisted items now carry `rate`, `rate_per_bottle`, `rate_source='distributor_margin_matrix'`, `rate_source_entry_id`.
- **Frontend** `/app/frontend/src/pages/StockTransfers.js`:
  - The per-row manual rate `<Input>` was replaced with a read-only AUTO badge (testid `item-rate-auto-${i}`) that displays the resolved rate (`₹ X.XX (₹ Y.YY/bottle)`) and a contextual missing-commercial reason (testid `item-rate-reason-${i}`).
  - `useEffect` calls `resolveRateForItem` whenever `(dest_location, sku_id, packaging_type_id, units_per_package, transfer_date)` changes.
  - `canSubmit` now requires `rate_status === 'ok'` on every item; create payload no longer sends `rate`.
- **Testing**: 8 new unit tests in `/app/backend/tests/test_stock_transfer_pricing.py` (all pass) over the resolver covering active/expired/inactive entries, case-insensitive city, missing data, base_price fallback, and "most-recent wins". Testing agent iteration 174 added integration tests in `/app/backend/tests/test_stock_transfer_auto_rate.py` exercising `/resolve-rate`, POST auto-resolve, POST 400 on missing commercial, and verified the frontend AUTO badge + disabled submit gating — **100% pass on backend + frontend**.

### 2026-05-26 — Distributor Stock Transfers (Inter-Warehouse) ✅ DONE
- **New module**: move stock between any two distributor warehouses with a Zoho document auto-generated server-side.
- **Document-type rule** (matches Indian GST law): both source & destination distributors `is_self_managed=true` AND their effective GSTINs match → **Zoho Delivery Challan** (`challan_type=branch_transfer`). Otherwise → **Zoho Tax Invoice** at the per-line rate entered by the user.
- **Backend** `/app/backend/routes/distributor_stock_transfers.py` — endpoints:
  - `GET /distributor/stock-transfers/` (list + search/pagination)
  - `GET /distributor/stock-transfers/eligible-sources` (warehouses with positive stock)
  - `GET /distributor/stock-transfers/eligible-targets` (all active warehouses, includes `is_self_managed` + effective `gstin`)
  - `GET /distributor/stock-transfers/{id}` (detail)
  - `POST /distributor/stock-transfers/` (create + inventory move + Zoho push)
  - `POST /distributor/stock-transfers/{id}/retry-zoho` (re-attempt Zoho)
- **Zoho service** `services/zoho_service.py` — added `create_delivery_challan_for_stock_transfer(...)`. Idempotent (skips re-push if mapping exists). Reuses the existing `zoho_invoice_mappings` collection with `source_type="stock_transfer"` + `zoho_doc_type="delivery_challan"` to keep a single audit table. URL helper retargets to `/deliverychallans/{id}` so the "Open in Zoho" link lands on the right doc page.
- **Inventory move** is atomic-with-rollback: deducts from source `distributor_stock`, adds to destination; if any step fails, all moves applied so far are reversed.
- **Validation**: same source/dest rejected; insufficient stock returns explicit per-SKU shortage; cross-distributor location ownership checked.
- **Frontend** `/app/frontend/src/pages/StockTransfers.js` — new page mounted at `/distributor/stock-transfers`. List + search + per-row Zoho status badge (Synced/Pending/Failed with retry button + error tooltip), "+ New Stock Transfer" dialog with source/dest pickers, dynamic doc-type preview banner (Delivery Challan vs Invoice), multi-SKU rows with live stock availability + over-quantity warning, Vehicle Number capture for E-way bills.
- **Sidebar**: new "Stock Transfers" entry under Distributors (uses existing `ArrowLeftRight` icon; admin-visible only).
- **Testing**: smoke-tested both Delivery-Challan path (self-managed + same GSTIN) and Invoice path (non-self-managed dest); verified inventory move (Brian-Bangalore 1722→1712, Test-Hyderabad +10); confirmed validations (same src/dst rejected, insufficient stock returns shortage detail, Zoho push gracefully fails with retry).

### 2026-05-25 — State Machine: Per-Workflow Actions ✅ DONE
- **Schema change**: each `StateMachine` doc now carries an `actions[]` list alongside `states[]` and `transitions[]`. Each action is `{key, label, description?, kind: positive|neutral|negative}`. Transitions reference `action_key`s defined in their *own* SM (not a global catalog).
- **Backend** `routes/state_machines.py`: added `Action` Pydantic model + `ACTION_KIND_HINTS` dict. `_validate(states, actions, transitions)` rejects (a) duplicate action keys, (b) invalid `kind`, (c) transitions referencing an action_key not in the SM's actions list ("Add it to Actions first."). POST auto-derives `actions[]` from transitions when the caller doesn't supply any (UX nicety). New helper `_migrate_actions_inplace` auto-backfills `actions[]` on legacy SMs (no actions[] in DB) using `ACTION_CATALOG` labels + `ACTION_KIND_HINTS`; invoked by GET list / GET single / PUT.
- **Default Marketing Request SM** now seeds 9 actions (start_working, request_changes, resume, send_for_review, approve, submit_for_final_approval, final_approve, close, reopen) with descriptions + kind hints.
- **Frontend** `StateMachines.js`: new "Actions" card between States and Transitions. Add action / "Quick add" hover-menu (populated from the global ACTION_CATALOG as suggestions only) / per-row key + label + description + kind editor / delete with usage-count badge. Renaming an action key propagates the new key into all referencing transitions. Deleting an action that's still referenced is blocked with a toast. The Transition row's action dropdown now lists THIS SM's actions only — no more global catalog.
- **Migration**: legacy SMs without `actions[]` get auto-filled on first GET. No manual DB migration required.
- **Testing**: testing agent iteration 173 = 100% pass on both backend (11 pytest cases in new `/app/backend/tests/test_sm_actions.py`) and frontend (Playwright smoke). Existing MR lifecycle regression still passes.

### 2026-05-24 — Marketing Requests Phase B: SM-Driven Lifecycle ✅ DONE
- **Module rebuilt from scratch** at user's request ("take out the existing module and develop fresh again — I am not using this module yet"). Dropped `marketing_requests` and `marketing_request_statuses` collections to start clean.
- **Backend** `/app/backend/routes/marketing_requests.py` completely rewritten — no hardcoded lifecycle / no `ALLOWED_TRANSITIONS` matrix. Everything is driven by the State Machine attached to the `marketing_requests` workflow.
- **Auto-seed**: first call to `GET /api/marketing-requests/state-machine` (or any create/list call) seeds a default 8-state SM ("Marketing Request Lifecycle (default)") with 12 transitions covering the canonical Sales → Marketing → Delivery flow. Admin can clone/edit/replace it in Admin → State Machines.
- **New endpoints**:
  - `GET /{id}/available-transitions` → list of action buttons valid from the current state, with `allowed` flag computed against the user's role/department/requestor permission gates.
  - `POST /{id}/transition` (body `{action_key, comment?}`) — validates against SM, applies auto-assign side-effects, appends a `status_change` timeline event, fires Slack.
  - `GET /counts` → `{total, by_state, queues:{my_raised, my_assigned, all}, states, state_machine_id, state_machine_name}`.
- **SM transition schema extended** with permission gates: `allowed_role_keys` (multi), `allowed_department_ids` (multi), `requestor_only` (bool), plus existing `comment_required`. Admins (CEO/Director/Admin) always bypass these gates.
- **New helper** `/app/backend/utils/sm_helpers.py` — `ensure_default_marketing_request_sm`, `get_attached_state_machine`, `find_transition`, `find_transitions_from`, `user_can_trigger` (async), `apply_auto_assign` (async). Single source of truth for SM consumption by downstream modules.
- **Frontend** `MarketingRequests.js` (list) — queue tabs (All / Raised By Me / Assigned To Me), dynamic state-filter chips driven by the SM (colors from SM states), search, pagination. Lifecycle name displayed in the header.
- **Frontend** `MarketingRequestDetail.js` (detail) — action buttons are dynamic from `/available-transitions`; state badge color comes from the SM; blocked actions render disabled with tooltip ("Only the requestor can do this" / "You don't have permission"); comment-required transitions open a confirm dialog before posting. Production payload attach is decoupled from state — it no longer auto-changes the state (the SM transitions do).
- **Frontend** `StateMachines.js` (builder) — gear-icon expand panel per transition for: Requestor only, Comment required, Allowed roles (multi-select), Allowed departments (multi-select). Departments source switched to `/api/master-departments`.
- **Testing**: regression test `/app/backend/tests/test_marketing_requests_lifecycle.py` covers auto-seed, create→initial state, available-transitions, transition validation (200 + 400), auto-assign side-effect, comments, versions, counts, state_key filter. Testing agent (iteration 172) ran additional permission-gate tests (allowed_role_keys 403/200, requestor_only 403/200, comment_required 400) and frontend smoke — **all green (6/6 backend, 100% frontend)**.

### 2026-05-24 — State Machine: Mutually-Exclusive Auto-Assign ✅ DONE
- **Backend** (`/app/backend/routes/state_machines.py`): replaced the original multi-target auto-assign schema (`auto_department_ids` / `auto_user_ids` / `auto_role_keys` arrays) with single-target fields `auto_assign_mode` ∈ `user | department | role | None`, plus `auto_assign_user_id`, `auto_assign_department_id`, `auto_assign_role`. `_validate` rejects any transition that sets more than one target with `HTTP 400: auto-assign supports only ONE of user / department / role`.
- **Roles catalog**: new `GET /api/state-machines/roles/catalog` returns the distinct `users.role` values for the current tenant (used to populate the role dropdown).
- **Frontend** (`/app/frontend/src/pages/StateMachines.js`): the per-transition "Auto-assign" cell is now a single mode dropdown (`No auto-assign / Assign to User / Assign to Department / Assign to Role`). Choosing a mode reveals exactly one single-select picker for the chosen target; switching modes clears the other two target IDs. Helper text reinforces "Only one of User / Department / Role can be set."
- **Smoke-tested**: valid create with `auto_assign_mode=role` accepted; create with both `auto_assign_user_id` and `auto_assign_role` rejected with 400.

### 2026-05-23 — State Machine Builder (Phase A — CRUD only) ✅ DONE
- **Backend** (`/app/backend/routes/state_machines.py`):
  - New collection `state_machines` per tenant. Schema: `{name, code, description, states: [{key, label, color, is_initial, is_terminal}], transitions: [{action_key, action_label, from_state, to_state, auto_department_ids, auto_role_keys, auto_user_ids, notify_all, comment_required}], applied_to: [workflow_key]}`.
  - CRUD: `GET/POST /api/state-machines/`, `GET/PUT/DELETE /api/state-machines/{id}`, `POST /api/state-machines/{id}/clone`.
  - Catalogs: `GET /api/state-machines/actions/catalog` (16 controlled action keys — submit, start_working, send_for_review, approve, request_changes, submit_for_final_approval, final_approve, reject, reopen, cancel, close, reassign, escalate, on_hold, resume, custom) and `GET /api/state-machines/workflows/catalog` (7 workflows that can attach a SM — marketing_requests, leads, tasks, production_qc, credit_notes, settlements, customer_returns).
  - Validation: every `to_state` / `from_state` must reference a defined state; transition pairs (action_key + from_state) must be unique.
- **Frontend** (`/app/frontend/src/pages/StateMachines.js`, route `/admin/state-machines`):
  - List view: name + state/transition counts + attached workflows + clone/delete.
  - Editor: name/code/description card · **States** table (key, label, colour picker, initial/terminal checkboxes) · **Transitions** table (controlled-vocab Action dropdown + free-text "Display label" override + From / Result state pickers + multi-select auto-assign Departments / Users) · "Attach to Workflows" checkboxes.
  - Sidebar entry under Admin → State Machines (CEO/Admin/System Admin only).
- **Phase B (deferred)**: actually consume the state machine inside Marketing Requests / Leads / Tasks lifecycles + fire auto-assignments on transition. Phase A persists the definitions and intent only.

### 2026-05-23 — Per-Lead Drive Folders + Routed Uploads ✅ DONE
- **Auto-create folder per lead**: On lead creation (both `server.py` and `routes/leads.py` endpoints), the backend calls `ensure_lead_folder(tenant_id, lead_id)` which creates `<folder_prefix>/<LEAD_ID>/` inside the Shared Drive (idempotent, cached in `google_drive_folders`). The resulting `folder_id` is stored on the lead doc as `drive_folder_id`. No-op if Drive isn't configured yet — lead creation never breaks.
- **Marketing-Request uploads** now accept an optional `lead_id` query param. When supplied, files land under `<LEAD_ID>/marketing-requests/<file_id>/<filename>` instead of the generic tenant path → so logos, references, work versions for a lead-tied request stay inside the lead folder.
- **Account GST certificates** automatically route into the linked lead's folder. The upload route looks up `account.lead_id → lead.lead_id (human-readable)` and writes to `<LEAD_ID>/gst-certificates/<account_id>.<ext>`.
- **Backfill endpoint** `POST /api/google-drive/backfill-lead-folders` (admin-only) walks every lead in the tenant and ensures each has a `drive_folder_id`. Idempotent — safe to re-run.
- **Settings UI**: new "Backfill lead folders" button appears once credentials are saved.
- **Lead Detail UI**: new "📁 Open in Drive" badge next to the Lead ID — only shown when `lead.drive_folder_id` is present. Links to `https://drive.google.com/drive/folders/<folder_id>`.

### 2026-05-23 — Google Drive Shared-Drive Storage Backend ✅ DONE
- **New storage backend** `/app/backend/utils/google_drive_storage.py` — uses a per-tenant Service Account + Shared Drive (Google Workspace) via `google-api-python-client`. Implements `put_object`, `get_object`, `delete_object`, and `test_connection` with the same surface as the legacy Emergent Object Storage helper. Auto-creates folder hierarchies inside the Shared Drive based on the storage path; caches file_id lookups in `google_drive_files` for fast reads.
- **Dispatcher** `/app/backend/utils/storage.py` (async) routes every `put/get/delete_object` call to Drive when the current tenant has `google_drive_config.enabled=true`, else falls back to Emergent storage. Includes async `upload_pdf`/`download_pdf` convenience wrappers.
- **Settings routes** `/app/backend/routes/google_drive.py` (admin-only): `GET/PUT /api/google-drive/config`, `POST /api/google-drive/test`, `GET /api/google-drive/usage`. On save, runs `drives.get + files.list` against the supplied shared drive to surface bad credentials immediately.
- **Settings UI** `/app/frontend/src/pages/GoogleDriveSettings.js` at route `/admin/google-drive`: paste service account JSON, shared drive ID, optional folder prefix → Save & Verify → connection card flips to Connected. "Run connection test" button shows sample files visible to the bot. Inline 6-step setup checklist for non-technical admins.
- **Existing call sites migrated** to use the dispatcher: `marketing_requests` (upload/download MR files), `credit_notes` (issuance attachments), `accounts` (GST certificates), `distributors` (debit/credit note PDF generation + download).
- Behaviour: until the admin pastes credentials, EVERYTHING keeps working as today (Emergent storage). Once configured + enabled, new uploads go to Drive; pre-existing files still stream from Emergent. Toggle in the Settings page pauses Drive uploads at any time.

### 2026-05-23 — Slack Integration (per-tenant, Marketing Requests v1) ✅ DONE
- **Backend** (`/app/backend/routes/slack.py`):
  - Tenant-scoped Slack config: bot_token, signing_secret, default_channel, per-event-type channel mappings (DB: `slack_config`).
  - Routes: `GET/PUT /api/slack/config`, `GET /api/slack/channels`, `POST /api/slack/test`, plus `POST /api/slack/events` (URL verification + signed event webhook) and `POST /api/slack/interactivity` (signed). Tenant resolution by `team_id` inside the inbound Slack payload.
  - HMAC signature verification (5-min replay window) using the tenant's `signing_secret`.
  - Helper `post_event_message(tenant_id, event_type, text)` looks up the channel mapping → posts via `slack_sdk.WebClient`. Failures are logged but never roll back the originating business operation.
- **Marketing Requests** lifecycle now emits Slack notifications:
  - `marketing_request_created` — on POST `/api/marketing-requests`.
  - `marketing_request_status_changed` — on POST `/{id}/status`.
  - `marketing_request_commented` — on POST `/{id}/comments` (plain comments only, not system/status_change rows).
- **Frontend** (`/app/frontend/src/pages/SlackSettings.js`, route `/admin/slack`):
  - "Workspace Connection" card: paste bot token + signing secret, click Save & Verify (runs `auth.test` server-side, captures team_id / team / bot_user_id).
  - "Event → Channel Mapping": default channel radio table + per-event-type channel selector + on/off toggle.
  - "Test" button per channel posts a hello message immediately.
  - Webhook URLs shown for the user to paste into the Slack App config (api.slack.com).
  - Sidebar entry: Settings → Slack (Admin/CEO/System Admin only).
- **Connected to workspace**: `Nylalife` (team_id T05VB9NJ6MA), bot user `U0B5Q3SFX3Q`, default channel `#designrequests` (C0B5AMPD58X). End-to-end verified via curl: created `MR-2026-0006`, transitioned to `in_progress`, added a comment → 3 Slack messages posted, no errors.

### 2026-05-23 — Action Items: Compact Table Layout + Expander ✅ DONE
- Redesigned both the **Previous Status Action Items** widget (`YesterdayActionItems`) AND the **Daily Status action-items builder** (`ActionItemsBuilder.SavedRow`) into a unified compact table layout:
  - Single horizontal row per item: status icon · MapPin · Lead name / Task badge + status pill · truncated comment · "Followed up / No follow-up / Worked on / No updates" tag · row actions (toggle, edit, delete).
  - Click the chevron icon to expand a row → full comment + linked last-activity / task metadata revealed in a tinted detail panel below.
  - Both widgets share an identical outer wrapper (`rounded-md border border-slate-200 overflow-hidden`) with `border-b` row separators, giving a true tabular look — no more chunky tile cards.
- Editing row (when adding a new item or editing an existing one) keeps its full form but slots into the same shared container as a divider-separated section.

### 2026-05-23 — Action Items: Auto-Create Tasks for No-Lead Items + Task-Aware Green/Red ✅ DONE
- When the user saves an action item with **"Not associated with any lead"** ticked, the backend now auto-creates a Task in the user's first department (defaults to "Sales"). The action item dict gets stamped with `task_id` + `task_number`, which is persisted in `daily_status.action_items_v2`.
- Task default settings: severity=medium, status=open, due_date=action item's planned date, assignees=[creator], watchers=[creator], source='daily_status_action_item'.
- The `/api/daily-status/yesterday-followup-status` endpoint now evaluates **task progress** for no-lead items: `worked_upon=true` if the linked task's status != 'open', OR there are task_activities beyond the initial 'created' row, OR there are task comments.
- **UI updates**:
  - `YesterdayActionItems` widget: no-lead items render with a clickable task badge (e.g., `TASK-00033`), task status pill, and green/red colour grading identical to lead-linked items.
  - `ActionItemsBuilder.SavedRow`: shows the auto-created task chip next to "Not associated with any lead" so the user can see the link immediately on save.
- Verified end-to-end via curl + screenshot: TASK-00033 marked in_progress → renders GREEN with "Task has been worked on"; TASK-00034 untouched → renders RED with "Task has had no updates yet".

### 2026-05-23 — Action Items: Always Log to Lead Timeline + Show with "ACTION ITEM" Label ✅ DONE
- **Bug fix**: Action items saved without comments were silently skipped by `_push_followups_to_leads` (the `if not desc: continue` guard). Now an activity row is always created — if comments are blank, the description falls back to `"Action item planned for {date}"` (or `"Action item"` when no planned date).
- **UI**: Reverted the Activity Timeline filter on Lead Detail — action items now appear in the Activity Timeline with the existing "ACTION ITEM" badge AND in the dedicated Action Items section (green/red planned-day grading). Both views coexist.
- Verified end-to-end: posted a daily status with an empty-comment action item → activity row created with `description: "Action item planned for 2026-05-25"` → ACTION ITEM label visible in the Activity Timeline at the top of the lead.

### 2026-05-23 — Daily Status auto-populate excludes Action Items ✅ DONE
- `auto_populate_from_activities` (`/api/daily-status/auto-populate/{date}`) now filters out `activity_type='action_item'` rows. Action items still log onto the lead's activity timeline (labeled "ACTION ITEM" via `ActivityTimeline`) and into the new lead-detail `Action Items` section, but they no longer boomerang into the same-day "Fetch Activities" auto-summary on the Daily Status page.
- Verified via curl: `/api/daily-status/auto-populate/2026-05-22` returns 7 activities (6 calls + 1 other), `action_item` rows are excluded.

### 2026-05-23 — Action Items: Lead-First Layout + Grey/Green/Red Grading + Selected-Date Aware Previous Status ✅ DONE
- **Saved-row layout flipped**: linked lead now appears on the first line, comments on the second line, in `ActionItemsBuilder.SavedRow` AND in `YesterdayActionItems` rows. Same flip applied to the lead-detail "Action Items" section interpretation.
- **Colour grading**:
  - Newly-saved / not-yet-due items → subtle grey (neutral slate background, no emerald). Applies to the action-item builder cards on the Daily Status page.
  - Worked-upon → green ring + check icon (in YesterdayActionItems widget and Lead Detail action-items section).
  - Not worked upon (past planned date with no activity) → red ring + alert icon.
- **Selected-date aware**: `YesterdayActionItems` now accepts a `statusDate` prop and the backend `/api/daily-status/yesterday-followup-status` accepts a `status_date` query param. The widget always fetches the user's most recent daily_status strictly BEFORE the selected date — no longer gated by `isToday`. Verified via curl with anchors 2026-05-23 (returns 2026-05-22 items with worked_upon=true) and 2026-05-24 (returns 2026-05-23 items).

### 2026-05-22 — Action Items: Per-Item Save / Edit / Delete + Collapsed List View ✅ DONE
- Every action item in the Daily Status now has its own **Save** button. After saving, the row collapses into a compact list display (numbered, green check icon, lead pin + lead name), with **Edit** (pencil) and **Delete** (trash) icons on the right.
- New items added via "+ Add Action Item" start in editing mode. Save is disabled until the row has a description AND either a linked lead OR the "Not associated with any lead" checkbox ticked.
- Loading an existing daily status hydrates items in the collapsed/saved state (clean, scannable list).
- **Submit guard**: clicking "Post Status" while any item is still in editing mode shows a toast — "Please save (or delete) every action item before posting your status."
- Internal `_editing` flag is stripped from the payload before persisting (kept out of `action_items_v2` JSON).

### 2026-05-22 — Daily Status: Remove Help-Needed + Full-Width Action Items ✅ DONE
- Removed the entire "Help Needed from the Team" section from the Daily Status Update page — input card, state, validation, submit payload (sent as empty string for backward DB compat), and the "Help Needed" column in the Recent Updates summary cards.
- The Action Items card now occupies the full row (the two-column grid that previously sandwiched Action Items + Help Needed has been removed). Past status summaries now render in a 2-column grid (Updates · Action Items).

### 2026-05-22 — Action Items Section: Full-Width Left Column + Green/Red on Planned Day ✅ DONE
- **Moved** `ActionItemsSection` from the narrow right column to the bottom of the left column on Lead Detail (`lg:col-span-5`), so it now spans the full main content width.
- **Green/Red logic**: each action item is now colour-coded based on whether the lead had any non-action_item activity on the item's `planned_date`:
  - Past planned date + activity exists on that date → **GREEN** (ring, icon, "Worked on: <activity_type via interaction_method>" tag)
  - Past planned date + no activity that day → **RED** (ring, icon, "No activity recorded on planned day" tag)
  - Future / today / unknown planned date → neutral indigo (not yet due)
- **Backend**: `_push_followups_to_leads` now persists the planned date as an explicit `planned_date` field on the action_item activity row (in addition to the legacy "(planned for YYYY-MM-DD)" suffix in the description). Backwards-compatible: frontend parses the old suffix if the new field is missing.
- Header now shows a count summary (e.g., "1 worked on planned day", "2 missed").

### 2026-05-22 — Action Items: Separate from Activity Timeline + Revert lead.next_follow_up auto-update ✅ DONE
- **Lead Detail page**: Action items (`activity_type='action_item'`) are now rendered in a dedicated `ActionItemsSection` card immediately AFTER the Activity Timeline, never mixed in with calls/visits/emails. New component: `/app/frontend/src/components/ActionItemsSection.js`. `ActivityTimeline` now receives only non-action-item activities.
- **Yesterday's Action Items widget** (`YesterdayActionItems.js`): worked-upon items now render in BLUE (badge, ring, icon, text). Not-followed-up items remain RED. Non-lead items remain neutral grey.
- **Reverted lead follow-up auto-update**: `_push_followups_to_leads` in `/app/backend/routes/daily_status.py` no longer writes `next_follow_up`, `next_follow_up_set_by`, or `next_follow_up_source` onto the linked lead. It still creates the `action_item` activity row so the daily-status commitment appears on the lead's record. Verified via curl: creating a status with `follow_up_date: 2026-05-30` no longer mutates the lead's `next_follow_up`.
- **Daily Status hint text** updated to remove the now-inaccurate "selected status date will automatically become the next follow-up date" line.

### 2026-05-22 — Daily Status: Lead Picker Search Fix ✅ DONE
- **Bug**: User reported "No leads found" when searching in the Associated Lead dropdown inside Daily Status action items.
- **Root cause**: `/api/leads` returns `{ data: [...], total, page, page_size, total_pages }`, but `ActionItemsBuilder.js` was reading `res.data.leads || res.data` — `leads` doesn't exist, so it fell back to the response object itself (not an array). `.map()` on an object threw a TypeError that was caught silently and set results to `[]`.
- **Fix**: Updated `LeadPicker` in `/app/frontend/src/components/ActionItemsBuilder.js` to read `res.data.data` (the paginated array) with safe fallbacks.
- **Verified**: Screenshot confirms picker shows the full lead list on open and filters correctly (typing "Bang" → "Bangalore Tech Park").

### 2026-05-22 — Account Logo Gallery Crash Fix ✅ DONE
- **Bug**: Switching to "Logo Gallery" view on `/accounts` crashed with `ReferenceError: AccountLogoTile is not defined`. The `AccountLogoTile` component had been extracted to `/app/frontend/src/components/AccountLogoTile.js` but the corresponding `import` statement was missing from `AccountsList.js`.
- **Fix**: Added the missing import in `/app/frontend/src/pages/AccountsList.js`. Logos with valid files now render; accounts with broken/missing `logo_url` files fall back gracefully to the account-name text tile (already handled in `AccountLogoTile`).
- Verified via screenshot: Logo Gallery loads 12 accounts, "The Rabbit Hole" logo renders, remaining accounts show the name fallback. No runtime errors.

### 2026-05-20 — Production Batch: Edit + Cascade Force-Delete ✅ DONE
- **Edit**: New "Edit" button on `BatchDetail` opens a dialog to update `batch_code`, `production_date`, `total_crates`, `bottles_per_crate`, `ph_value`, `notes`. Backend `PUT /api/production/batches/{id}` enforces (a) batch-code uniqueness on rename, (b) crates / bottles-per-crate are locked once the batch leaves `created` status (would break QC math), (c) `ph_value`/`notes`/`production_date`/`batch_code` editable at any status.
- **Force Delete (CEO / System Admin)**: New rose-coloured "Force Delete" button visible on batches that are past `created`. Opens a type-`DELETE`-to-confirm dialog. Backend `DELETE /api/production/batches/{id}?force=true` cascade-deletes:
  - `inspections` (which hold QC stage rejections + rework entries)
  - `stage_movements` (passed-to-warehouse moves, stage-to-stage moves)
  - `warehouse_transfers` for the batch
  - rolls back `factory_warehouse_stock` quantities contributed by this batch (deletes row when qty hits 0)
  - writes a `production_batch_deletions` audit row with full snapshot before dropping the parent
- Role gating: `_require_elevated` (CEO + System Admin) blocks force-delete for everyone else with 403.
- Verified via curl: created throwaway batch → force-deleted → 404 on subsequent GET → audit row written. Edit of `total_crates` on a `completed` batch returns 400 with friendly message.


### 2026-05-20 — Stock Entry feature fully removed ✅ DONE
- Deleted `/app/backend/routes/manual_stock_entries.py` and `/app/frontend/src/components/distributor/StockEntriesTab.jsx`.
- Removed router registration in `/app/backend/routes/__init__.py` (`manual_stock_router` import + include line gone).
- Removed the `MANUAL STOCK ENTRIES` block in `distributors.py` stock-dashboard that was still adding cancelled/legacy manual entries to "Stock In" — this was the source of the leftover 6500 stock the user kept seeing.
- The Reset Stock endpoint (`/api/production/factory-warehouse-stock/reset`) still cancels orphan `distributor_manual_stock_entries` rows as a cleanup, so old data is safe to wipe.
- Verified: login 200, distributors list 200, stock-dashboard 200, factory reset audits 200, `/api/distributors/{id}/manual-stock-entries` returns 404 as expected.


### 2026-05-18 — Stock-Out Delivery status flow + collapsible Live Map ✅ DONE
- **New delivery lifecycle**: Draft → Confirmed → `delivery_assigned` (attached to schedule) → `delivery_scheduled` (schedule approved) → `on_the_way` (driver starts vehicle) → `complete` (driver marks stop delivered). Direct path from Stock Out screen: Confirmed → `complete`.
- **Backend**: `distributor_delivery_schedules.attach_deliveries` now stamps `delivery_assigned` on attach (or `delivery_scheduled` when the schedule is already approved). `approve_schedule` moves underlying deliveries to `delivery_scheduled`. `driver_app.start_schedule` bumps every attached delivery to `on_the_way`. `complete_stop` writes `complete`. `complete_delivery` in `distributors.py` writes `complete`. Detach/cancel correctly revert to `confirmed`.
- **Backward compatibility**: All read queries (delivery summary, settlement-eligible, stock-out dashboard, reconciliation count) accept both legacy `delivered` and new `complete` via `$in`.
- **Frontend**: Status badges in DistributorDetail.js now render the new statuses with distinct colours (indigo/violet/amber/green); `LiveDriverMap` is wrapped in a collapsible Card defaulting to collapsed with a toggle (`data-testid="live-map-toggle"`); ScheduleProgress + StopStatusPill treat `complete` as terminal and `on_the_way` as in-transit.
- **Tests**: 7/7 pytest cases pass exercising the full lifecycle plus detach-revert plus legacy-equivalence (`/app/backend/tests/test_delivery_status_flow.py`).


### 2026-05-17 — Admin can set a custom driver password ✅ DONE
- New backend `POST /api/admin/drivers/{id}/set-password` (admin-gated) accepts `{password}` (min 4 chars, max 64) and stores it as a bcrypt hash on the linked driver user row. Creates the user row on the fly for legacy fleet rows missing one.
- Admin Drivers list now has TWO key actions per row: a "Set custom password" (key icon → dialog with show/hide toggle, enter-to-save, ≥4 char validation) and a "Regenerate random password" (refresh icon → existing one-time disclosure flow).
- Verified 200/401/404/422/auth-guard paths end-to-end; old password rejected once a new one is set; lint clean.

### 2026-05-17 — Driver sees SKU + crate manifest per stop ✅ DONE
- `GET /api/driver/schedules/{id}` now re-uses the distributor's `_enrich_schedule` helper so each stop's `items[]` (sku_name, quantity in crates, packaging_label, quantity_units, units_per_package) and rollups (`total_quantity`, `total_units`) are surfaced to the driver — identical to what the distributor saw at approval time. Driver-only `delivered_at` field is layered on top.
- Driver UI: each stop card now shows a "Manifest" panel listing SKUs with `qty Crate(s) (n units)`; schedule header card shows a "Load" row totalling crates + units across the run.

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
