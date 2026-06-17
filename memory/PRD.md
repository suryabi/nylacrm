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


### 2026-06-17 — 🐛 Fix: Promo Stock-Out Zoho challan rejected — "shipping_address has less than 100 characters" (code 15) ✅ DONE
- **Reported (PRODUCTION)**: Confirming a Promotional Stock-Out (Delivery Challan) to a recipient with a long address (e.g. Radisson Blu Marina Hotel, DC-2606-0013) failed the Zoho push with `{"code":15,"message":"Please ensure that the \"shipping_address\" has less than 100 characters."}`. The address also rendered the outlet name **twice** + phone (~185 chars).
- **Root cause**: Zoho rejects an inline `shipping_address` on `POST /deliverychallans` with code-15 even when sub-fields look bounded; long recipient addresses tripped it. The recipient name was also duplicated because `attention` (= recipient name) and `address` (= address_line1) both began with the outlet name.
- **Fix** (`services/zoho_service.py`):
  - `_zoho_shipping_address` now **dedupes** the leading outlet name from the address line (strips the `attention` prefix when the address repeats it) on top of the existing per-field 99-char clipping.
  - New `_post_deliverychallan_resilient()` wraps the challan POST: on a code-15 inline-address rejection it **retries once without the inline `shipping_address`/`billing_address`** (the recipient is already fully captured in the challan `notes`, so nothing is lost on the printed PDF). Applied to BOTH `create_delivery_challan_for_promo_dispatch` and `create_delivery_challan_for_stock_transfer`. New `_is_zoho_address_length_error()` detector.
- **Tested**: `backend/tests/test_promo_challan_shipping_address.py` — 6/6 PASS (sub-fields <100, dedupe removes repeated outlet name, extreme-length clipping, error detector, resilient retry drops inline address, unrelated errors pass through). Live Zoho push not exercisable in preview (Zoho not connected). **Redeploy to push to production.**

### 2026-06-17 — 🐛 Fix: Promo challan "Deliver To" showed the warehouse instead of the recipient ✅ DONE
- **Reported (PRODUCTION)**: After the code-15 fix, the Zoho challan PDF (DC-00021) printed the SOURCE warehouse (Gurgaon) in the **Deliver To** block. It should show the chosen lead/contact recipient; the warehouse belongs in **Delivery From** (header).
- **Root cause**: The previous fix recovered from code-15 by dropping the inline `shipping_address`, so Zoho defaulted Deliver-To to the customer (= distributor warehouse) address. Zoho rejects an inline `shipping_address` on delivery-challan *create*, so it can never be set that way.
- **Fix** (`services/zoho_service.py`): adopted Zoho's documented two-step pattern. `create_delivery_challan_for_promo_dispatch` now (1) creates the challan WITHOUT an inline shipping address, then (2) sets the recipient as Deliver-To via the dedicated `PUT /books/v3/deliverychallans/{id}/address/shipping` endpoint (new `_set_deliverychallan_shipping_address()` — best-effort, recipient also stays in `notes`). FROM/header remains the source warehouse branch (`branch_id`), which was already correct.
- **Tested**: `backend/tests/test_promo_challan_shipping_address.py` — 8/8 PASS (adds: address-setter PUTs recipient fields to the correct endpoint with all fields <100; skips when empty). Backend healthy. Live Zoho push not exercisable in preview. **Redeploy to push to production.**



### 2026-06-17 — Promotional Stock-Out: Draft workflow + Reverse (P1 feature) ✅ DONE
- **Request**: (1) Delete a promo stock-out while in draft; (2) Reverse a confirmed promo stock-out → add stock back + cancel/delete the Zoho delivery challan.
- **Two-step lifecycle added** (`routes/promo_dispatch.py`, `models/distributor.py`): a promo stock-out now has states **draft → confirmed (dispatched) → reversed**.
  - **Save as Draft** (`as_draft=true` on create): records the stock-out **without** deducting stock or creating a Zoho challan; freely editable/deletable.
  - **Confirm** (`POST .../{id}/confirm`): re-validates stock, deducts inventory, and pushes the Zoho delivery challan (best-effort).
  - **Reverse** (`POST .../{id}/reverse`, confirmed only): **restores stock** to inventory + **deletes the Zoho delivery challan** (new `zoho_service.delete_delivery_challan` — Zoho supports delete, not void, for challans). Record is kept and marked **"Reversed"** (greyed) for audit. Partial Zoho failure → flagged `zoho_cleanup_pending` with a **retry** endpoint (`.../reverse-zoho-cleanup`).
  - **Delete** (`DELETE .../{id}`): allowed only for **draft** (never touched stock) or **reversed** (stock already restored); a confirmed stock-out is blocked with a clear 400 (must reverse first).
  - Permissions: anyone who can do promo stock-out (`can_manage_distributor_data`).
- **Frontend** (`components/distributor/PromoDispatchSection.jsx`): "Save as Draft" button in the create dialog; new **Status** column (Draft/Confirmed/Reversed badges); status-based row **Actions** (Confirm + delete for drafts, Reverse for confirmed, Delete for reversed); greyed reversed rows; "Cleanup" retry button when Zoho deletion is pending; PDF/Zoho columns hidden for drafts.
- **Tested**: curl lifecycle — draft (stock unchanged 100) → confirm (100→95) → reverse (95→100, marked reversed) → delete; confirmed-delete correctly blocked (400). UI — all three states render with correct actions; clicking Confirm on a draft deducted stock, flipped to Confirmed, and showed the Zoho "Retry" fallback (Zoho not connected in preview). Test data cleaned up.


### 2026-06-16 — Notifications: redesigned as a contemporary right-side slide-over panel ✅ DONE
- **Request**: The full-page notifications inbox didn't look good — make it contemporary/visually appealing and convert it to a side panel instead of a full page.
- **Change**: Replaced the full-page `/notifications` route + popover with a single slide-over **`components/NotificationsPanel.jsx`** (shadcn `Sheet`, side=right). Clicking the bell now opens this panel directly. Design: gradient emerald→teal header (bell tile, unread/total counts, "Mark all"), sticky filter row (status tabs All/Unread/Read + type dropdown + search), date-grouped sections (Today / Yesterday / Earlier this week / Earlier) with sticky labels, per-item color-coded category icon tiles (@-mention, Task, Approval, Design, Lead, Account, Stock, Return, Meeting, Print), unread emerald left-accent bar + dot, and a "Load older" button (15/page, accumulating). `NotificationBell.jsx` simplified to just the badge button + panel. Removed `pages/NotificationsInbox.js` and its route. Backend (paginated/filterable `GET /notifications` + `/categories`) unchanged.
- **Tested**: screenshots — panel slides in with grouped sections + category icons; Unread filter (12) works; backend filters/pagination already verified. Seed data cleaned up.


- **Request**: A dedicated notifications page with full history, filters and bulk mark-all-read (the bell only shows the latest 20).
- **Backend** (`routes/notifications.py`): extended `GET /notifications` with pagination (`page`, `limit`) + filters (`status`=unread/read/all, `category`, `search` over title/body) and now returns `total`/`page`/`pages` alongside `notifications`/`unread_count` (bell's `?limit=20` call still works unchanged). New `GET /notifications/categories` returns category keys+labels for the filter dropdown.
- **Frontend**: new page `pages/NotificationsInbox.js` at route `/notifications` — header (total · unread), status segmented tabs (All / Unread(n) / Read), category dropdown, debounced search, color-coded category badges, unread dots, click-to-open (marks read + navigates to the entity), bulk "Mark all read", and Prev/Next pagination (20/page). `NotificationBell.jsx` gained a "View all notifications" footer link. Route wired in `App.js`.
- **Tested**: curl — pagination (25 seeded → 2 pages), `category=mention` (5, all correct), `status=unread` (16, all unread), `search` (1 match), categories endpoint. Screenshots — inbox renders with badges + pagination; Unread tab → 16 items; search "number 7" → 1 result. Seed data cleaned up.


### 2026-06-16 — 🐛 Fix: @-mention editor showed raw `@[Name](uuid)` token while typing ✅ DONE
- **Reported (preview)**: Picking a name from the mention autocomplete inserted the raw canonical token `@[Sravya Pinnamameni](d6ff6bf4-…)` into the comment box instead of a clean pill.
- **Root cause**: `MentionTextarea` was a plain `<textarea>` — it can only hold raw text, so the inline `@[Name](id)` markup (needed by the backend) was visible while composing; the pretty pill only rendered after posting.
- **Fix** (`components/MentionTextarea.jsx`): rebuilt the editor as a `contentEditable` rich input. Selected mentions render as non-editable rose `@Name` pills inline while typing; the component serializes the DOM back to the canonical `@[Name](id)` string for `onChange`, so the backend mention-parse + notifications are unchanged. Same prop API (`value`/`onChange`/`placeholder`/`rows`/`className`/`disabled`/`testid`) → no call-site or backend changes. Added contentEditable placeholder CSS in `index.css`. Applies to ALL surfaces (Leads, Accounts, Tasks, Meetings, Design Requests main + version threads).
- **Tested**: screenshot — typing "Please check @Vamsi Bommena regarding pricing" shows the clean pill (no UUID); posting renders the comment with the pill, clears the editor, and the canonical token is stored (notification created). Test data cleaned up.


### 2026-06-16 — @-mentions expanded to Leads, Tasks, Accounts & Meetings (P1) ✅ DONE
- **Request**: Extend the @-mention experience beyond Design Requests to Lead notes, Account notes, Tasks and Meeting Minutes.
- **Reusable helpers**: `utils/entity_comments.py` (`build_comment` + `notify_comment_mentions`) — shared mention-parse + notify across surfaces (category `mention`, author excluded, best-effort). Frontend `components/EntityCommentThread.jsx` — self-contained discussion thread (GET/POST a `{basePath}`) using `MentionTextarea` + `renderMentionedText`.
- **Lead comments** (`routes/leads.py` `create_comment`, `pages/LeadDetail.js`): existing comment box swapped to `MentionTextarea`, chips rendered; backend now notifies mentioned users (link `/leads/{id}`).
- **Tasks** (`routes/task_management.py` `add_comment`, `pages/TaskDetail.js`): comment box swapped to `MentionTextarea`; backend extracts mentions from `content` (merged with the explicit `mentions` array), adds them as watchers AND notifies (link `/tasks/{id}`).
- **Accounts** (NEW thread): `GET/POST /accounts/{id}/comments` (`account_comments` collection) + a "Discussion" card on `AccountDetail.js` (left column, after Expense Requests).
- **Meetings** (NEW thread): `GET/POST /meeting-minutes/{id}/comments` (`meeting_comments` collection) + a "Discussion" card on `MeetingDetail.js` (main column, after Action Items).
- **Tested**: curl e2e on all four — posting a comment with `@[Vamsi Bommena](id)` created a `mention` notification for Vamsi on each entity type with the correct title/body/link; test data + watcher side-effects cleaned up. Screenshots — `@Vam` autocomplete dropdown ("Vamsi Bommena · Director") renders on Lead, Task, Account and Meeting comment boxes; new Discussion cards render on Account & Meeting detail.


### 2026-06-16 — @-mentions in Design Request comments (P0) ✅ DONE
- **Request**: Build the full @-mention experience — tag teammates in comments and notify them.
- **Frontend** (`pages/MarketingRequestDetail.js`): wired the existing `MentionTextarea` + `renderMentionedText` (`components/MentionTextarea.jsx`) into BOTH comment surfaces — the main Comments & Activity composer (replaced plain `Textarea`) and each work-version comment composer (replaced the `Input`). Saved mentions now render as rose pills in the main timeline and per-version threads. Typing `@` opens a teammate autocomplete (name + role/email), arrow/enter/tab to pick, inserts `@[Name](user-id)` inline.
- **Backend** (`routes/marketing_requests.py`): the main `POST /{id}/comments` already parsed mentions + fired `notify_users` (category `mention`). Added the same mention extraction + `notify_users` to the per-version route `POST /{id}/versions/{vid}/comments`. Mentions skip the author; best-effort (never blocks the comment). Category `mention` is registered in `notification_settings.CATEGORIES` and defaults to allowed at every preference layer.
- **Tested**: curl e2e — posting a comment with `@[Vamsi Bommena](id)` created a `mention` notification for Vamsi ("Surya Yadavalli mentioned you" → MR-2026-0021, link to the request); test data cleaned up afterward. Screenshot — typing `@Vam` in the main composer surfaces the "Vamsi Bommena · Director" autocomplete dropdown.



### 2026-02-10 — Zoho Books multi-GSTIN: per-warehouse Branch mapping (P0) ✅ DONE
- **Request**: When stock-out happens from a self-managed warehouse, the Zoho invoice must use **that warehouse's GSTIN** (not the org's primary GSTIN). Previously a Delhi-warehouse stock-out got booked with the Hyderabad GSTIN.
- **Decision**: CRM is the source of truth (CRM → Zoho). No auto-sync or auto-create of Zoho branches; user enters Branch ID + GSTIN per warehouse manually.
- **Backend** (`models/distributor.py`, `routes/distributors.py`): `DistributorLocation*` schemas gained `gstin`, `zoho_branch_id`, `zoho_branch_name`. POST/PUT endpoints persist and return these fields.
- **Backend** (`services/zoho_service.py`): Invoice push reads the source warehouse's `zoho_branch_id` and sets it on the Zoho `branch_id` payload. If the warehouse is **not mapped**, raises `ZohoBranchNotMappedError` with an actionable message ("Map it to the correct Zoho Branch under Distributors → Warehouses → edit …") — push is **blocked before** any Zoho write so we never produce a wrong-GST invoice.
- **Frontend** (`components/distributor/LocationsTab.jsx`): Add/Edit Location dialog has a "GST & Zoho Branch" section with three manual inputs — Zoho Branch ID, Branch name (optional), GSTIN. Card displays an emerald "Zoho branch" badge for mapped factory warehouses and a red "No Zoho branch" warning for unmapped factory warehouses. Removed the previously attempted "Sync from Zoho" pull flow (and unused `loadZohoBranches`/`zohoBranches` state from `DistributorDetail.js`).
- **Tested**: `backend/tests/test_zoho_warehouse_branch_gst.py` — 2/2 PASS (payload carries source warehouse `branch_id`; unmapped warehouse blocks push BEFORE Zoho write). UI smoke verified — edit dialog renders all 3 fields, save shows "Location updated" toast, the emerald branch badge appears on the location card immediately, and `PUT /api/distributors/{id}/locations/{id}` persists `gstin`/`zoho_branch_id`/`zoho_branch_name` correctly. Test data restored.



### 2026-02-10 — Misc UX fixes (stock-batch picker, docs, design urgent) ✅ DONE
- Stock In batch selection: removed FIFO mandate — availability now follows the manually selected batch.
- Stock Out: reverted forced FIFO auto-split on delivery; FIFO is now a suggestion only.
- Files & Documents: Document download button is always visible (no hover), bigger, and PDFs download with the document's actual filename via authenticated `/download` endpoint (Content-Disposition).
- Design (Marketing) Requests: new "URGENT" toggle with red Kanban borders, flame badge across list/kanban/detail views, dedicated `POST /api/marketing-requests/{id}/urgent` endpoint.



### 2026-02-06 — Promotional Stock-Out → Zoho Books delivery challan integration ✅ DONE
- **Request**: Push promo delivery challans to Zoho (use the default Zoho template — no custom template needed) and clearly mark them "Not for Sale / No Commercial Value", matching the existing inter-branch stock transfer flow.
- **Backend (`services/zoho_service.py`)**: New `create_delivery_challan_for_promo_dispatch()` pushes a Zoho Books *Delivery Challan* with `gst_treatment="out_of_scope"`, zero `tax_total`, `is_inclusive_tax=false`, and a prominent banner in `notes`:
  > "*** NOT FOR SALE · NO COMMERCIAL VALUE ***  Promotional / non-sale stock-out. Indicative values for asset tracking only — no GST applicable, no consideration receivable."
  Recipient name, company, phone, reason, vehicle, driver, remarks appended below the banner. Each line item is renamed to "<sku> · Batch <code> — Sample / Promotional (Not for Sale)" and tax fields cleared. Customer = distributor's own Zoho contact (upserted on demand). Shipping address overridden with the actual recipient delivery address. Idempotent via `zoho_invoice_mappings` keyed by `source_type="promo_dispatch"`.
- **Backend (`routes/promo_dispatch.py`)**: After local create succeeds, attempts the Zoho push best-effort. A failure does NOT block the dispatch — `zoho_sync_status` is persisted on the doc as `synced` / `failed` with the error truncated. New `POST /api/distributors/{id}/promo-deliveries/{did}/retry-zoho` endpoint re-attempts.
- **Frontend (`PromoDispatchSection.jsx`)**: New "Zoho" column on the dispatches table — shows a green "Synced · DC-Z-0001" link (opens the Zoho deliverychallan page) when pushed, or a red "Retry" button (with tooltip carrying the error) when failed. Toast feedback on retry.
- **Tested**: New `tests/test_promo_dispatch_zoho_sync.py` (3 tests) — verifies payload shape contains the banner + out-of-scope flags + line-item Sample suffix, asserts retry endpoint 404s correctly on unknown ids. 9/9 tests pass across promo + dedupe + batch picker suites.



### 2026-02-06 — Stock-by-SKU table: per-row batch disclosure ✅ DONE
- **Request**: In the Stock Dashboard's "Stock by SKU" table, allow each row to expand and reveal its batch-wise breakdown.
- **Backend** (`routes/distributors.py`): Built a `fwh_batches_by_sku` lookup from the already-aggregated `factory_wh_by_location` dict, then attached `factory_warehouse_batches: [{batch_code, quantity, production_date, received_at, warehouse_id, warehouse_name}]` (FIFO-sorted) to every SKU summary returned to the frontend.
- **Frontend** (`StockDashboardTab.jsx`): Every SKU row in the Stock-by-SKU table is now expandable (was previously only expandable when returns existed). A small teal "N batch(es)" chip beside the SKU name indicates the batch count; clicking the row opens a "FACTORY WAREHOUSE STOCK · PER-BATCH · FIFO" panel showing age-tier chip (🟢 <30d, 🟠 <60d, 🔴 ≥60d), batch code, warehouse name, prod/received date and per-batch crate count. Existing customer/factory returns breakdown still shown side-by-side when present.
- **Tested**: Backend regression test still passes (sum of batches == consolidated quantity per SKU). Live screenshot on Surya 1 distributor confirms Nyla 660ml Sparkling expands to show 2 batches in FIFO order, single-batch SKUs work identically.



### 2026-02-06 — "N batches" disclosure on Factory Warehouse Stock card ✅ DONE
- **Request**: Show a tiny "N batches" sub-label under each consolidated SKU row on the Factory Warehouse Stock card, with click-to-expand per-batch breakdown for FIFO planning.
- **Backend**: The aggregator in `routes/distributors.py` now also keeps a per-SKU `batches` array (`batch_id`, `batch_code`, `quantity`, `production_date`, `received_at`) FIFO-sorted by production_date. Single-batch SKUs still carry a 1-element array; multi-batch SKUs carry N entries that sum to the consolidated `quantity`.
- **Frontend** (`StockDashboardTab.jsx`): Extracted a new `FactoryWarehouseSkuRow` sub-component. Renders a plain line when the SKU has ≤1 batch (no clutter). When ≥2 batches, the row becomes clickable, shows a rotating chevron + a small teal "N batches" pill next to the quantity, and expands an inset showing batch code, age tier chip (green <30d, amber <60d, rose ≥60d), production/received date, and per-batch crate count.
- **Tested**: Dedupe regression test extended to assert `sum(batches.quantity) == consolidated.quantity` for every multi-batch SKU. 27 backend tests still pass. Live screenshot on Surya 1 confirms the 2-batch SKU "Nyla – 660 ml / Sparkling (23 crates · 2 batches)" expands cleanly to show BATCH-VERIFY-A-001 (3) + BATCH-VERIFY-B-002 (20).



### 2026-02-06 — 🐛 Critical fix: Factory Warehouse Stock card showed duplicate SKU rows ✅ DONE
- **Bug**: When the same SKU at the same factory warehouse had multiple `factory_warehouse_stock` documents (one per production batch), the distributor stock-dashboard returned one row per batch — so the **Factory Warehouse Stock** card on the UI listed the same SKU three or four times with split quantities, instead of one consolidated row per SKU.
- **Root cause**: `routes/distributors.py` (the `stock-dashboard` endpoint) was appending each Mongo doc into `factory_wh_by_location[wh_id]["skus"]` without deduping. With batch tracking enabled, each batch is a separate stock document → multiple appended rows for the same SKU.
- **Fix**: Refactored the per-location accumulator to a dict keyed by `sku_id` (`skus_by_id`), summing crate quantities. Final response converts it to a sorted (alphabetical) list. One row per (warehouse, SKU) — quantities summed across batches.
- **Tested**: New regression test `tests/test_factory_warehouse_stock_dedupe.py` asserts no duplicate `sku_id` per warehouse across every distributor in the tenant. 9/9 backend tests pass. Verified live for Surya 1 distributor — previously-duplicated SKU `Nyla – 660 ml / Sparkling` (2 batches) now appears once with the summed 276 crates.



### 2026-02-06 — 🐛 Critical fix: batch picker showed stale batches when switching warehouses ✅ DONE
- **Bug**: In Stock In, Stock Out (Record Account Delivery) and Promotional Stock-Out, the batch picker kept showing the previously selected warehouse's batches and quantities after the user switched "From Location" to a different warehouse. Caused by frontend caches (`shipmentBatchesBySku`, `deliveryBatchesBySku`, `batchMap`) keyed by `sku_id` only — once a SKU was loaded for one location, subsequent location changes never re-fetched.
- **Fix**: Added a one-line `useEffect` in each of the three flows that resets the per-flow batch cache to `{}` whenever the source location id changes. Backend `/batches-available` was already correctly scoped by `warehouse_location_id` / `distributor_location_id` — the bug was purely client-side cache invalidation.
- **Tested**: 26 backend tests still pass. Build green. Three lines changed in `DistributorDetail.js` (2 effects) and `PromoDispatchSection.jsx` (1 effect).



### 2026-02-06 — Batch picker card UI consolidated across Stock In + Promotional Stock Out ✅ DONE
- **Request**: Make Stock In and Promotional Stock Out use the same nice card-style batch picker (with age chip + production date + unit count) that Stock Out already uses, instead of the cramped `<select>` dropdown.
- **Frontend**:
  - Extracted the picker into a new shared component `/components/distributor/BatchPickerCards.jsx` — FIFO-sorted, age-tier coloured chips (green <30d, amber <60d, rose ≥60d), production_date/received_at, selected-card amber gradient + check badge.
  - `ShipmentsTab.jsx` (Stock In) now renders `<BatchPickerCards>` in place of the old `<select>`.
  - `PromoDispatchSection.jsx` (Promotional Stock-Out / Delivery Challan) now renders `<BatchPickerCards>` in place of the old `<select>`.
- **Tested**: Build green, lint clean on new component. Live smoke: Promo Stock-Out dialog opens; picker stays hidden when the chosen source location is not batch-tracked (correct behaviour). Stock Out continues to use its own copy (unchanged).



### 2026-02-06 — Distributor Stock In: batch picker mirrors Stock Out behaviour ✅ DONE
- **Request**: During stock in, allow selecting production batches the exact same way as during stock out.
- **Backend**: New `GET /api/distributor/stock-transfers/production-batches?sku_id=` returns all production batches for a SKU (FIFO by `production_date`) in the same response shape as `/batches-available` so the frontend can reuse the picker. Extended `POST /api/distributors/{id}/shipments` (`routes/distributors.py`) to require `batch_id` on every line when EITHER the source factory warehouse OR the destination distributor location has `track_batches=true` (previously only source-factory was enforced). Friendly 400 error names which side requires batches.
- **Frontend** (`DistributorDetail.js` + `ShipmentsTab.jsx`): The Stock In create-shipment dialog now shows the amber batch picker whenever `sourceTracksBatches || destTracksBatches`. Batch list source: source factory's available stock (`/batches-available`) when factory tracks batches; otherwise canonical production batches (`/production-batches`). Picker labels updated to "Select production batch (FIFO recommended)" and show `production_date` when available, matching the Stock Out experience.
- **Tested**: `/app/backend/tests/test_distributor_stockin_batch_picker.py` — 3 PASS, 1 SKIP (skip is expected — no track_batches distributor location seeded in test tenant). Live UI smoke: Stock In dialog renders cleanly for Brian distributor.



### 2026-02-06 — Design Requests: delete a work version (with confirmation, cascades file storage) ✅ DONE
- **Request**: From a Design Request, allow deleting a version. Must remove everything from the system after a confirmation.
- **Backend**: New `DELETE /api/marketing-requests/{request_id}/versions/{version_id}` in `routes/marketing_requests.py`. Cascade: (a) collects all `version.files[*].id`, (b) best-effort `delete_object` from storage + `marketing_request_files.delete_many`, (c) removes the version from the embedded `versions[]` array, (d) clears `approved_version_id`/`approved_version_name` if the deleted version was approved, (e) appends a system timeline comment ("Deleted work version V<n> and N attached file(s)"). Blocked when the request has already been submitted for production (matches `delete_request_file` lock).
- **Frontend**: `MarketingRequestDetail.js` — added a small red "Delete" button to each version card (`data-testid="version-delete-btn-<vid>"`), and a confirmation `Dialog` (`data-testid="delete-version-dialog"`) showing version name + file count + an amber warning if it's the currently approved version. Button hidden once `req.production` is set (assets locked).
- **Tested**: `/app/backend/tests/test_marketing_request_version_delete.py` — 5/5 PASS (404 unknown request, 404 unknown version, 401 unauth, full delete cascade with file row gone, approved-version delete clears approval). Frontend smoke: 2 delete buttons rendered on a 2-version request, dialog opens on click.


### 2026-02-06 — Print Requests module (frontend integration + RBAC hardening) ✅ DONE
- **Request**: From a final-approved Design Request, allow creating a Print Request (Send for Printing). Configurable linear status flow, vendor assignment, notes, RBAC (CEO/Admin always allowed). Make Print Requests a sidebar item like Design Requests.
- **Backend**: `routes/print_masters.py` write endpoints (`POST/PATCH/DELETE /api/print-request-statuses`, `POST/PATCH/DELETE /api/print-vendors`) now guarded by `_require_admin` (uses `_is_admin` from `utils/sm_helpers`). Reads remain open to tenant users (it's tenant config). Print Request lifecycle endpoints already existed; tests `/app/backend/tests/test_print_requests_module.py` cover full lifecycle (18/18 passing).
- **Frontend**: Fixed all blocking ESLint errors that were preventing build (unescaped quotes in `PrintRequestSettings.js`, `MarketingRequestDetail.js`, `App.js`; empty `catch {}` in `DashboardLayout.js`; unused eslint-disable directives). Pages: `PrintRequests.js` (list, data-testid `print-requests-page`), `PrintRequestDetail.js`, `PrintRequestSettings.js` (Statuses + Vendors admin tabs). Routes wired in `App.js` (`/print-requests`, `/print-requests/:id`, `/admin/print-settings`). Sidebar entries added across Sales/Production/Marketing role groups + Admin Print Settings (`DashboardLayout.js`).
- **Tested**: pytest 18/18 PASS (backend); Playwright smoke 5/5 (sidebar entry, list page, settings tabs+CRUD, send-for-printing trigger on final_approved MR). Pre-existing test data: PR-2026-0001 (In Printing), PR-2026-0002 (New).



### 2026-06-05 — Renamed "Marketing Requests" → "Design Requests" (UI label) ✅ DONE
- **Request**: Rename the module label to Design Requests.
- **Frontend**: updated user-facing labels only — sidebar nav in all role variants (`DashboardLayout.js`), list page title (`MarketingRequests.js`), detail back button (`MarketingRequestDetail.js`), new-form title (`NewMarketingRequest.js`), and breadcrumb labels (`NavigationContext.js`: `/marketing-requests` → "Design Requests", `/new` → "New Design Request", detail → "Design Request Details"). Routes (`/marketing-requests`), API endpoints, data-testids, and file/variable names kept unchanged. The state machine's own name ("Marketing Request Lifecycle") is configurable data and was left as-is.
- **Tested**: screenshot confirms "Design Requests" in nav/breadcrumb/title and no remaining "Marketing Requests" text on the page.


### 2026-06-05 — Marketing Requests list: visual consistency with Leads ✅ DONE
- **Request**: Make the Marketing Requests view consistent with Leads (font sizes, colors, filters, etc.).
- **Frontend** (`MarketingRequests.js`): adopted the shared Leads design system — `AppBreadcrumb`; header with gradient icon tile + `text-xl sm:text-2xl lg:text-3xl` title and muted subtitle (lifecycle · count); Export CSV + New Request actions in the header. Replaced the custom inline filter row with the standard `FilterContainer`/`FilterGrid columns={4}`/`FilterItem`/`FilterSearch`/`FilterSelect` (active-count + reset). Converted the bespoke `<table>` (with oversized `text-lg` titles + emerald header) to the shadcn `Table`/`TableHeader`/`TableHead`/`TableRow`/`TableCell` with Leads typography: `font-semibold text-xs sm:text-sm text-muted-foreground` headers, `text-primary text-xs sm:text-sm` name links, `py-2 sm:py-4` cells, slate borders + `hover:bg-slate-50`. Removed dead `TABLE_HEADER_CLASS`/`rowClass`/`MetricCard`. AgePill/lead pill/state badge retained.
- **Tested**: lint clean + side-by-side screenshots of Leads vs Marketing Requests confirm matching header, filter bar, and table styling.


### 2026-06-05 — Marketing Requests: age pill + status-history (time-in-status) auditing ✅ DONE
- **Request**: Show a request "age" pill in list + detail, and track how long the request spent in each status (shown in detail).
- **Backend** (`routes/marketing_requests.py`): create now seeds `status_history: [{state_key,state_label,state_color,entered_at,by_user_id,by_user_name}]`; each transition `$push`es a new entry. Detail `GET /{request_id}` backfills a single synthesized entry (from `created_at` + current state, flagged `backfilled`) for requests predating tracking.
- **Frontend**: shared `AgePill` (color tiers: ≤2d emerald, ≤7d amber, >7d red) shown in the list row (`mr-row-age`) and detail hero (`mr-age-pill`). New detail **Status History** card (`mr-status-history`): proportional color bar across statuses, aggregated time-in-status summary (`mr-status-agg-*`), and a chronological Journey timeline with per-segment durations (`fmtDuration`), entered-at, actor, and an "(ongoing)" marker for the current status. Backfill notice shown for legacy requests.
- **Tested**: curl (create seeds 1 entry; transition → 2 entries with actor; old request → backfilled=True) + screenshots (list age pills; detail Status History card).


### 2026-06-05 — Marketing Requests: CSV export of filtered list ✅ DONE
- **Request**: Export the currently-filtered list to CSV.
- **Backend** (`routes/marketing_requests.py`): refactored query building into `_build_requests_query()` (shared by list + export); new `GET /marketing-requests/export` honours the same params (queue/search/state_key/request_type_id/assigned_department_id/created_by) and streams a CSV (Response, `text/csv`, attachment filename `marketing-requests-YYYYMMDD.csv`, up to 5000 rows). Columns: Request #, Type, State, Assigned Team, Assigned To, Lead, Requested Due Date, Raised By, Created At, Requirement Details. Route registered before `/{request_id}`.
- **Frontend** (`MarketingRequests.js`): "Export CSV" button (emerald outline + download icon) in the filter bar; downloads via authed blob using the active filters; disabled when 0 results.
- **Tested**: curl (full export = 19 data rows + header w/ correct content-type & attachment; Neck Tags filter → 8 rows, all scoped) + screenshot (button visible).


### 2026-06-05 — Marketing Requests: server-side pagination + filters ✅ DONE
- **Request**: Paginate the list and add filters by Requested By, Assigned Team, and Request Type.
- **Backend** (`routes/marketing_requests.py` list): added `request_type_id`, `assigned_department_id`, `created_by` query params (AND-combined with existing queue/search/state); pagination already returned `total/page/pages/limit` (limit 20).
- **Frontend** (`MarketingRequests.js`): added three Select filters — Request type (from `/marketing-request-types`), Assigned team (from `/master-departments`), Requested by (from `/users`) — plus a "Clear filters" button. Removed the buggy client-side `filteredItems` (re-filtered only the current page); search + all filters now drive a single debounced server fetch, reset to page 1 on change, sync to the URL (`type`/`dept`/`by`), and the result count + Prev/Next pager reflect server `total`/`pages`.
- **Tested**: curl (type→8, dept(Design)→5, created_by→19, combined→1, all correctly scoped) + screenshot (Neck Tags filter → 8 results, all three dropdowns + Clear filters visible).


### 2026-06-05 — Marketing Request detail hero: light/minimalist restyle ✅ DONE
- **Request**: The solid emerald banner didn't match the app's light theme / wasn't contemporary. Make it minimalistic, contemporary, visually appealing.
- **Detail** (`MarketingRequestDetail.js`): replaced the saturated `bg-emerald-600` block with a **white surface** card (border + soft shadow) featuring a slim left emerald gradient accent bar, a subtle emerald corner glow, a gradient emerald icon tile next to a slate-900 title, soft-tinted badges (emerald request chip, red/amber outline alerts), emerald-tinted meta icons, and a clean emerald-50 "Associated Lead" card on the right (gradient avatar tile). Now visually consistent with the cards beneath it.
- **Tested**: screenshot confirms the new light hero blends with the page theme.


### 2026-06-05 — Marketing Requests: prominent Lead visibility ✅ DONE
- **Request**: Show the associated lead clearly — in the detail banner's top-right corner, and prominently in the list so it's obvious which request maps to which lead.
- **Detail** (`MarketingRequestDetail.js`): added a glassy "ASSOCIATED LEAD" card pinned to the hero's top-right (`mr-hero-lead`) with the lead company + contact name; the inline lead meta is now shown only on mobile (desktop uses the corner card).
- **List** (`MarketingRequests.js`): added a dedicated **Lead** column — a green pill (Users icon + lead name) per row (`mr-row-lead-<id>`), with a subtle "No lead" fallback. colSpan updated to 6.
- **Tested**: screenshots — list shows the Lead column with pills; detail shows the top-right associated-lead card.


### 2026-06-05 — Contemporary UI redesign: Marketing Request form + detail page ✅ DONE
- **Request**: Form/upload controls looked rudimentary (native file inputs, native date picker, flat inputs); redesign the New Marketing Request form AND the detail page with a modern, user-friendly look. (Design blueprint by design_agent → `/app/design_guidelines.json`, "Soft Utility" emerald system.)
- **New reusable component** `components/FileDropzone.jsx`: drag-and-drop upload surface (drag-over state, upload-cloud icon micro-interaction, click-to-browse, busy spinner).
- **New Marketing Request form** (`NewMarketingRequest.js`): rounded-xl emerald inputs/selects/textareas with soft-glow focus (INPUT_CLS/SELECT_CLS/TEXTAREA_CLS tokens); native date input → `Popover` + `Calendar` (emerald-styled, past dates disabled); native file inputs → `FileDropzone` for Logo + Reference files with thumbnail/icon chips + remove; repeatable links → stacked styled rows + dashed "Add link" button via new `LinkListField` component (`socialLinks`/`fileLinks` now string arrays, filtered on submit).
- **Detail page** (`MarketingRequestDetail.js`): plain card hero → emerald **hero banner** (texture overlay, glass badges, meta row); Add Work Version dialog native file input → `FileDropzone`.
- **Tested**: testing agent frontend regression (iteration_183) — 100% pass, created MR-2026-0018 end-to-end via the new controls; no regressions to version comments/approval, file preview, or transitions.


### 2026-06-05 — Marketing Requests: per-version comments + version approval ✅ DONE
- **Request**: Each work version needs (1) multiple comments shown with the commenter's name, and (2) an approve/choose-a-version option that can be reverted and re-assigned to another version.
- **Backend** (`models/marketing_request.py`, `routes/marketing_requests.py`): `FileVersion` gains `comments_thread: [VersionComment]` and approval fields (`is_approved`, `approved_by`, `approved_by_name`, `approved_at`). New endpoints: `POST /versions/{vid}/comments` (append threaded comment with user name/time), `POST /versions/{vid}/approve` (exclusive — approving one clears all others; sets request-level `approved_version_id`/`_name`; logs system timeline entry), `POST /versions/{vid}/unapprove` (revert). 
- **Frontend** (`MarketingRequestDetail.js`): each version card shows an "Approved by {name}" badge + highlighted border when approved, an "Approve this version" / "Revert approval" toggle, a comments thread (avatar + name + timestamp), and an inline comment composer (Enter to send).
- **Tested**: curl (2 comments with names; approve V1→approve V2 moves approval exclusively; revert clears) + screenshot (V1 approved badge, revert button, 2-comment thread, composer).


### 2026-06-05 — Marketing Requests: auto-incrementing Work Version numbers ✅ DONE
- **Request**: Version number must auto-increment (manual entry caused duplicate/confusing labels).
- **Backend** (`models/marketing_request.py`, `routes/marketing_requests.py`): `FileVersion` gains `version_no:int`; `VersionCreate.version_name` now optional and IGNORED. `add_version` computes `next_no = max(existing version_no)+1` (reconciled with count) and sets `version_name="V{n}"` server-side — the single source of truth, immune to duplicate/concurrent client input.
- **Frontend** (`MarketingRequestDetail.js`): removed the editable "Version Name" field from the Add Work Version dialog; replaced with a read-only "Version number → V{next}" badge ("Assigned automatically"). Save no longer requires a name.
- **Tested**: curl (3 versions → V1/V2/V3 even when sending duplicate "v99" names) + screenshot (dialog shows next = V4 on a request with 3 versions).


### 2026-06-05 — Marketing Requests: Work Version file previews + type-aware thumbnails ✅ DONE
- **Request**: In the Work Versions section, add a preview option and show thumbnails per file type (image → image thumbnail, others → type icon).
- **Frontend** (`MarketingRequestDetail.js`): replaced the plain `FileChip` in Work Versions with the rich `FileAsset` card (now used for Brand Assets AND versions). `FileAsset` classifies files via `fileKind()` (image/pdf/ppt/sheet/doc/video/audio/archive) and renders an auth-fetched image thumbnail or a colored type icon. Added a click-to-preview `FilePreviewDialog` lightbox — inline `<img>` for images, `<iframe>` for PDFs, and a graceful "preview not available + Download" fallback for other types. Shared `downloadFileBlob()` helper. Default assigned department on the new-request form set to "Design" (`NewMarketingRequest.js`).
- **Tested**: screenshots — version cards show image thumbnails + ppt icon; image opens inline in lightbox; pptx shows fallback + download.


### 2026-06-05 — State Machine transition RULE ENGINE (guards + required fields) ✅ DONE
- **Request**: Business rules for transitions, handled dynamically against fields on the form — e.g. "≥2 files before submit", "enter number of tags for Neck Tags production". Must be generic (any rule, any field, any workflow's SM).
- **Design**: Two JSON-driven rule types per transition — `guards` (preconditions on EXISTING data; block if unmet) and `required_fields` (NEW data captured at transition time). Both support `applies_when` (conditional by request type). A per-workflow **field registry** makes the builder dynamic without code.
- **Backend** (`utils/sm_helpers.py`): `FIELD_REGISTRY` (marketing_requests fields), `OPERATORS_BY_TYPE`, `REQUIRED_FIELD_TYPES`, and a generic evaluator — `evaluate_guards()`, `evaluate_required_fields()`, `applies_when()`, `applicable_required_fields()` (dot-path resolution, type-aware operators). `routes/state_machines.py`: `Transition` model gains `guards` + `required_fields`; new `GET /state-machines/fields/catalog?workflow_key=` returns fields + operators + dynamically-resolved enum options (request types, departments). `routes/marketing_requests.py`: `available-transitions` returns `guards_ok`/`block_reasons`/`required_fields`; `POST /{id}/transition` accepts `field_data`, enforces guards + required fields (HTTP 400 with message, never 5xx), and stores captured values in `transition_data`.
- **Frontend** — Builder (`StateMachines.js`): expanded transition panel now has "Preconditions (guards)" + "Required information to capture" editors driven by the field catalog (field/operator/value/message + "Only for types" applies_when; required-field key/label/type/min/max/options). Consumer (`MarketingRequestDetail.js`): action buttons disabled with tooltip when a guard fails (+ defensive toast), and a dynamic required-field dialog (`transition-fields-dialog`) collects data before the transition.
- **Tested**: curl (guard block/allow, required-field enforce, applies_when, success capture) + testing agent E2E (7/7 scenarios, builder + detail flows + regression). SM reverted to clean default. Test file: `/app/tests/test_rule_engine_e2e.py`.


### 2026-06-05 — Marketing Requests: logo/reference asset thumbnails + download + delete ✅ DONE
- **Request**: Uploaded logo (and reference) assets should show an image thumbnail, a download button, and a delete button.
- **Backend** (`routes/marketing_requests.py`): new `DELETE /marketing-requests/{request_id}/files/{file_id}` detaches the file from `logo`/`references`, logs a `system` comment, and best-effort removes the underlying object (`utils.storage.delete_object`) + `marketing_request_files` record. Locked (HTTP 400, not 5xx) once a production payload exists. 404 if the file isn't attached.
- **Frontend** (`pages/MarketingRequestDetail.js`): new `FileAsset` card replaces `FileChip` in the Brand Assets section — auth-fetched image thumbnail (blob URL, falls back to file icon for non-images), download button (auth blob download with filename), and a delete button (shown only when `!req.production`) wired to a confirmation dialog. `FileChip` retained for Work Versions.
- **Tested**: curl (delete logo ✓, re-delete 404 ✓, production-locked 400 ✓, remove-comment logged ✓) + screenshot of asset card with download/delete actions.


### 2026-06-04 — Marketing Requests: link a Lead to a request ✅ DONE
- **Request**: Sales team should be able to select the Lead a marketing request is being raised for.
- **Backend** (`models/marketing_request.py`, `routes/marketing_requests.py`): `MarketingRequestCreate` gains optional `lead_id`; on create it validates the lead (tenant-scoped) and stores `lead_id` + snapshot `lead_name` (`contact_person`→`name`→`company`) and `lead_company`. Detail/list return these fields (raw doc).
- **Frontend**: `NewMarketingRequest.js` — new "Lead (optional)" searchable selector (debounced `/api/leads` search, `mr-lead-search` / `mr-lead-option-*`, selected chip with clear `mr-selected-lead`); `lead_id` added to the create payload. `MarketingRequestDetail.js` — shows a "Lead: {company}" tag (`mr-lead-tag`) in the meta row.
- **Verified (preview)**: curl e2e — created MR-2026-0003 with `lead_id` → stored `lead_name`/`lead_company`, detail GET returns them (test request deleted after). Frontend smoke: lead search returns 15 results, selecting shows the chip, no JS errors. Py + JS lint clean. **Redeploy to push to production.**



### 2026-06-04 — Delivery Schedules: allow editing after approval (sends back for approval) ✅ DONE
- **Request**: Allow editing a delivery schedule even after it's approved; doing so should reset its status back to "pending approval".
- **Backend** (`routes/distributor_delivery_schedules.py`): editing is now permitted for `draft`/`confirmed`/**`approved`** schedules (still locked once `in_progress`/`completed`/`cancelled`). When an **approved** schedule is edited via update (date/vehicle/driver/notes/reorder), **attach-deliveries**, or **detach-delivery**, it is reset to `confirmed` (pending approval): the approval stamp (`approved_at`/`approved_by`/`approved_by_name`) is cleared, `reverted_from_approval_at`/`reverted_from_approval_by_name` are recorded, and the underlying deliveries are rolled back from the post-approval state (`scheduled`/`delivery_scheduled`) to the pre-approval `delivery_assigned` so re-approval re-applies cleanly. Added shared helpers `_approval_reset_fields` + `_revert_schedule_deliveries_to_pending` and `NON_EDITABLE_SCHEDULE_STATUSES`.
- **Frontend** (`pages/distributor/DeliveryScheduleDetail.js`): `editable` now includes approved schedules. The approver banner gains a note: "You can still edit this schedule — any change will send it back for approval." Edit/detach/attach handlers show an info toast ("…sent back for approval") when an approved schedule is edited.
- **Verified (preview)**: e2e via API on the live approved schedule (temporarily reassigned to a test distributor, then restored) — editing notes flipped status `approved → confirmed`, cleared `approved_by`/`approved_at`, set `reverted_from_approval_by_name`, and reverted both deliveries `scheduled → delivery_assigned`. Original data fully restored after the test. Py + JS lint clean. **Redeploy to push to production.**



### 2026-06-04 — Transition "Notify assignee" (in-app + email + Slack) ✅ DONE
- **Request**: Let a transition optionally notify the assignee so people know action is needed without polling the board.
- **In-app notification center** (NEW): `notifications` collection + `routes/notifications.py` (`GET /notifications`, `GET /notifications/unread-count`, `POST /notifications/{id}/read`, `POST /notifications/read-all`). Frontend `NotificationBell.jsx` mounted in the sidebar user section — bell with unread badge, popover list (unread dots, body, time-ago), click-to-open (navigates to the request) + mark-read, "Mark all read", polls unread-count every 60s.
- **Email** (`utils/email_sender.py`, `utils/notify.py`): best-effort `send_email` via **Resend** only (already configured: `RESEND_API_KEY` + `SENDER_EMAIL=noreply@nylaairwater.earth`), per user preference. `notify_users()` writes per-recipient in-app notifications and emails them. Added `.env` placeholder `APP_BASE_URL` (for clickable absolute email links).
- **Slack**: already posts "Auto-assigned to {assignee}" to the channel on every transition (unchanged).
- **Builder + trigger**: `Transition.notify_assignee` (bool) added to `state_machines.py`; checkbox "Notify assignee (in-app + email when this transition assigns someone)" added to the transition options in `StateMachines.js`. On a marketing-request transition, if `notify_assignee` is on and the auto-assign resolves assignee(s), `notify_users` is called for those assignees (excluding the actor) with a link to `/marketing-requests/{id}`. Best-effort — never breaks the transition.
- **Verified (preview)**: notification API e2e (insert → list unread=1 → mark-read → unread=0); bell renders with "2" badge and opens a populated panel with mark-all-read; zero JS errors. Py + JS lint clean. Live transition→notify path verified by code (no marketing requests/SM in preview to live-trigger). Test data cleaned up. **Redeploy to push to production.**
- **Note**: Email sends via your existing **Resend** setup (`SENDER_EMAIL=noreply@nylaairwater.earth`). Set `APP_BASE_URL=https://crm.nylaairwater.earth` for clickable links in emails.



### 2026-06-04 — State Machine transitions: "Assign to Requestor" auto-assign option ✅ DONE
- **Request**: In the Marketing Request state machine, add an "Assign to Requestor" option to the transition's Auto-assign section.
- **Backend** (`routes/state_machines.py`, `utils/sm_helpers.py`, `routes/marketing_requests.py`): `auto_assign_mode` now accepts `'requestor'` (added to `valid_modes`; exempted from the target-ID requirement since it resolves dynamically). `apply_auto_assign(transition, tenant_id, requestor_id)` gains a new `requestor` branch that resolves the document's creator (`created_by`) into the assignee; the trigger endpoint passes `doc.created_by`.
- **Frontend** (`StateMachines.js`): added `<option value="requestor">Assign to Requestor</option>` to the Auto-assign mode dropdown; selecting it shows no extra picker (none needed) and a helper note "Assigns to the person who raised the request." Existing mutual-exclusivity note now only shows for User/Department/Role.
- **Verified (preview)**: PUT persists `auto_assign_mode='requestor'` (validation passes without a target); UI dropdown shows the option and selecting it renders the helper text with no JS errors. Py + JS lint clean. End-to-end trigger assignment path verified by code (no marketing requests exist in preview to live-trigger). **Redeploy to push to production.**



### 2026-06-04 — Promo Stock-Out: add Employee recipient (sales team / staff) ✅ DONE
- **Request**: Besides Contacts & Leads, internal **employees** (sales team and others) also take stock without an invoice — track it as a Delivery Challan. Add an Employee tab that populates only employees (no one else).
- **Backend** (`models/distributor.py`, `routes/promo_dispatch.py`): `recipient_type` now also accepts `'employee'` with `employee_id`. Resolves the recipient from `db.users` (tenant-scoped), sets name = user name and "company" = `Role · Department`. **Guards** against non-staff: rejects `Distributor`/`Driver` roles with "Selected user is not an internal employee." Stores `employee_id` on the dispatch.
- **Frontend** (`PromoDispatchSection.jsx`): third **Employee** tab on the recipient toggle (`promo-recipient-employee-btn`) with a client-filtered employee search (`promo-employee-search`, `promo-employee-option-*`) hitting `/api/users?is_active=true` and excluding `Distributor`/`Driver` roles. Submit enables when a contact, lead, or employee is chosen.
- **Verified (preview)**: curl e2e — employee dispatch DC-2606-0004 created ("Rahul Sharma" / "Regional Sales Manager · Sales"); Distributor-role user correctly rejected (400). Frontend: "Rahul" search shows 2 employees, "Distributor" search shows 0 (excluded), no JS errors. Py + JS lint clean. **Redeploy to push to production.**



### 2026-06-04 — Promo Stock-Out: "Batch is required" error — batch picker now resolves per selected From-Location ✅ FIXED (needs redeploy)
- **Reported (PRODUCTION)**: Generating a promo challan failed with "Batch is required for SKU Nyla Air Water - 330 ml (Gold)" but the dialog never showed a batch picker. The backend requires a batch when the source location is a factory warehouse that tracks batches (`is_factory && track_batches`).
- **Root cause**: `PromoDispatchSection` derived batch-tracking and batch lists from static props (`sourceTracksBatches`/`batchesBySku`) passed by the parent, which were tied to the *regular* delivery form's location — not the promo dialog's own `From Location` select. So picking a batch-tracking warehouse in the promo dialog never surfaced a picker, yet the backend still demanded a batch.
- **Fix** (`PromoDispatchSection.jsx`): the promo dialog is now self-sufficient — it computes `locTracksBatches` from its **own** selected location (`distributor.locations[].track_batches`) and fetches available batches per SKU for that location via `GET /api/distributor/stock-transfers/batches-available?location_id=&sku_id=` (the same endpoint the regular Stock-Out flow uses, which transparently reads factory vs distributor stock). Batch picker now appears (required) whenever the chosen location tracks batches; batches reset when the location or SKU changes; legacy null-batch entries are handled via a sentinel that maps back to null on submit. Removed the now-unused `sourceTracksBatches`/`batchesBySku` props from the `DeliveriesTab` call.
- **Verified (preview)**: `batches-available` returns `track_batches:true` + batch list for a batch-tracking warehouse; smoke test confirms the dialog opens, location+SKU select, and no batch picker for non-batch locations (correct) with zero runtime errors. JS lint clean. (The factory-batch UI path is production-data-specific — no batch-tracking distributor location exists in preview to fully exercise it.) **Redeploy to push to production.**



### 2026-06-04 — Promotional Stock-Out now supports Leads (not just Contacts) ✅ DONE
- **Request**: The promo / non-sale stock-out (Delivery Challan) in the Stock Out module should be sendable to **Leads** as well as Contacts.
- **Backend** (`models/distributor.py`, `routes/promo_dispatch.py`, `utils/pdf_generator.py`): `PromoDeliveryCreate` now takes `recipient_type` ('contact'|'lead'), `contact_id` and `lead_id` (both optional, validated by type). The create endpoint resolves the recipient from `contacts` or `leads` (lead name = `contact_person` → `name` → `company`), stores `recipient_type`/`lead_id`, and keeps the existing `contact_*` display fields so the tracking table is unchanged. Challan PDF builds the recipient block from stored fields and labels it "Dispatched To (Lead/Contact)". Clear 400s for missing contact_id/lead_id.
- **Frontend** (`components/distributor/PromoDispatchSection.jsx`): added a **Contact / Lead** segmented toggle in the dispatch dialog (`promo-recipient-type-toggle`) with a dedicated lead search/select (`promo-lead-search`, `promo-lead-option-*`) hitting `/api/leads`. Submit enabled when either a contact or a lead is chosen; payload sends `recipient_type` + the right id.
- **Verified (preview)**: curl e2e — lead dispatch DC-2606-0003 created (recipient_type=lead, name resolved), 24KB challan PDF, and validation rejects lead without `lead_id`. Screenshot confirms the toggle + lead search render correctly. Py + JS lint clean. **Redeploy to push to production.**



### 2026-06-04 — Account Detail: "Zoho sync health" indicator + one-click re-sync ✅ DONE
- **Request**: Add a small Zoho sync health indicator on the Account Detail page (last sync status + one-click "Re-sync to Zoho").
- **Backend** (`routes/accounts.py`): new `POST /accounts/{account_id}/zoho-resync` — re-pushes the contact to Zoho via the existing `zoho_service.upsert_contact`, and records sync health on the account: `zoho_sync_status` ('synced'/'error'), `zoho_last_synced_at`, `zoho_last_sync_attempt_at`, `zoho_last_sync_error`. Rejects distributor-billed accounts (not in Zoho) and surfaces real errors as HTTP 400 (passes through Cloudflare). The same health fields are now also stamped on **activation success/failure** and on the **auto re-sync** in `update_account` (so silent edit-time failures are captured).
- **Frontend** (`pages/AccountDetail.js`): the activated card now shows a color-coded **sync badge** (`data-testid="zoho-sync-badge"`) — emerald "Zoho Synced", rose "Zoho Sync Error", or grey "Not Synced to Zoho" (status falls back to inferring 'synced' from `zoho_contact_id` for legacy accounts). Adds a "Last synced <time>" line (`zoho-last-synced`) and, on failure, a rose error line showing the exact reason (`zoho-sync-error`). The "Re-sync to Zoho" button now calls the new endpoint directly (with a spinner/"Syncing…" state) instead of re-opening the activation dialog.
- **Verified (preview)**: endpoint returns clean 400 JSON when Zoho isn't connected; screenshot shows the green "ZOHO SYNCED" badge + Re-sync button on an active company-billed account. Py + JS lint clean. (Live success/error paths require a connected Zoho — production only.) **Redeploy to push to production.**



### 2026-06-04 — Production 502 "Bad gateway" on /accounts/{id}/activate masked the real error ✅ FIXED (needs redeploy)
- **Reported (PRODUCTION)**: `POST /api/accounts/CAFE-BEN-A26-001/activate` returned Cloudflare's branded `Error 502: origin_bad_gateway` (failed fast, ~891ms — not a timeout).
- **Root cause**: the backend deliberately raised `HTTPException(status_code=502, ...)` for application-level **integration failures** (e.g. "Failed to sync customer to Zoho Books: <reason>"). 502/503/504 are **gateway-class** statuses — Cloudflare and the K8s ingress intercept any such response from the origin and replace it with their own generic "origin_bad_gateway" page, so the real, actionable `detail` (the actual Zoho error) never reached the user. The frontend already reads `err.response.data.detail`, so the message was simply being swallowed by the status code.
- **Fix**: changed all application-level integration-failure raises from gateway-class statuses (502/503/504) to **400** so the descriptive `detail` passes through Cloudflare untouched. Files: `routes/accounts.py` (Zoho activate sync + GST/AI/Google Places), `routes/credit_notes.py` (Zoho push), `routes/distributors.py` (Zoho invoice push/download), `routes/zoho_books.py` (templates), `routes/knowledge_base.py` (AI), `routes/personal_calendar.py` (Google Calendar), `routes/proxies.py` (weather). Remaining 500s left as-is (Cloudflare passes 500 through).
- **Verified (preview)**: activate now returns a clean `HTTP 400 application/json` with the full `detail` message; py lint clean on all touched files; backend healthy.
- **⚠️ Action**: **Redeploy**. After redeploy, retry activating CAFE-BEN-A26-001 — you'll now see the *real* reason the Zoho sync fails (HTTP 400 toast) instead of the masked 502, e.g. a duplicate Zoho contact name / invalid GST. Share that message and I'll fix the underlying Zoho issue.



### 2026-06-04 — Promotional / Non-sale Stock-Out (Delivery Challan) — frontend UI ✅ DONE
- **Request**: Stock out from a distributor to people saved as **Contacts** (promotion / sampling / networking) with NO sale — no invoice, no Zoho, no account balance, no revenue. Deduct stock and generate a PDF **Delivery Challan** with indicative/MRP values marked "Not for Sale". Reason from a master list; trigger inside the distributor Stock Out screen; tracking list + admin reasons manager. (Backend was already built & tested: `routes/promo_dispatch.py`.)
- **Frontend** (`components/distributor/PromoDispatchSection.jsx`, new): self-contained collapsible section rendered inside `DeliveriesTab.jsx` between the customer Stock-Out (Section 1) and factory Stock-Out (Section 2). Features: contact search/select (`/api/contacts`), From-Location + Reason (`/api/admin/promo-reasons`) selects, date/reference/vehicle/driver/address fields, item rows (SKU select auto-fills indicative value from master `mrp`→`base_price`, editable; qty; live line/total value), batch picker shown only when the source tracks batches, tracking table of past challans with per-row PDF download (blob → new tab), and an admin-only **Reasons manager** dialog (add / deactivate / reactivate). Posts to `POST /api/distributors/{id}/promo-deliveries`. Fuchsia accent to visually distinguish from billable deliveries. All elements carry data-testids (`promo-*`).
- **Verified**: curl e2e (create → DC-2606-0001, list, 24KB PDF) + frontend `testing_agent` iteration_181 — **100%**, all 8 scenarios pass (section placement, tracking table, full create flow generating DC-2606-0002 with success toast, PDF download 200, reasons add+deactivate, disabled-submit negative test, regression of Record Delivery + Factory Returns). JS lint clean. **Redeploy to push to production.**
- **Note/Open product Q**: a SKU with no master MRP/base_price would generate a 0-value indicative challan (allowed today since values are indicative + editable).



### 2026-06-01 — System-wide SKU mapping (old → current), with physical re-point ✅ DONE
- **Request**: Extend the SKU-alias mapping beyond invoices to Production, Distribution, Stock, Accounts & Leads — "wherever we have old SKUs, give the ability to map to a new SKU." User chose: (1b) the module screens themselves should show the remapped SKU, and (2) physically rewrite the records.
- **Backend** (`routes/sku_aliases.py`): 
  - `GET /admin/sku-aliases/unmapped` now scans **all SKU-bearing collections** (invoices items/line_items; production_batches, qc_routes, rejection_cost_mappings, cost_cards, batch_deletions; distributor delivery/shipment/manual-stock/margin/billing + stock_transfers items; distributor_stock, factory_warehouse_stock, warehouse_transfers; customer_returns items; accounts.sku_pricing, leads.proposed_sku_pricing, sampling_trials.sku_plans; target_allocations_v2). Each unmapped identifier now returns a **`sources` per-module breakdown** (e.g. `{distribution: 12}`) alongside count/revenue/units/sample invoices.
  - `POST /admin/sku-aliases` gained `apply_to_records` (default true): it creates the alias **and physically re-points** every matching record (`sku_id` + `sku_name`, or the embedded name field) to the chosen current SKU, returning a `{rewrite: {total, by_module}}` report. The resolver is built BEFORE the alias is written so still-unmapped records match. Matching reuses `sku_resolver.unmapped_key` so only genuinely-unmapped rows for that exact identifier are touched. Uses `getattr(tdb, col)` (tenant-auto-filtered); master_skus stays global.
- **Frontend** (`components/SkuAliasTool.jsx`): relabeled for system-wide scope ("Re-scan all records", "found across your records"), renders **sky module badges** per unmapped identifier, sends `apply_to_records:true`, and the success toast reports how many records were updated (e.g. `· updated 12 records`).
- **Why physical rewrite delivers 1b**: re-pointing the stored `sku_id`/`sku_name` means the Production/Distribution/Accounts/Leads screens (which read those fields directly) now display the new SKU — no per-screen resolver wiring needed. The alias is also kept so reports/analytics stay consolidated and any future stray rows resolve.
- **Verified (preview)**: curl — scan found "Test SKU" across 12 distribution records (invisible to the old invoice-only scan) + 2 invoice code-types; mapping returned `rewrite {total:12, by_module:{distribution:12}}`, the 12 records physically became the target SKU, and a re-scan dropped "Test SKU". DB-snapshotted the 12 records beforehand and **restored them + deleted the test alias** so preview data is intact. Screenshot confirmed the new UI with module badges. Lints clean (py + js). **Redeploy to push to production.**


### 2026-06-01 — Production batch edit: editable SKU / Product ✅ DONE
- **Request**: "In production batch edit, I should be able to edit the SKU also — currently it's not there."
- **Backend** (`routes/production_qc.py`): added `sku_id` + `sku_name` to `BatchUpdate`; `update_batch` now accepts an `sku_id` change — validates it against the **global** `master_skus` collection (404 if not found) and syncs the denormalised `sku_name` from the master record. Editable at any batch status (it's a label correction). Note: does not auto-reconcile already-transferred factory-warehouse stock rows (out of scope for this change).
- **Frontend** (`pages/BatchDetail.js`): added a "SKU / Product" `<select>` (`data-testid="edit-batch-sku"`) to the Edit Batch dialog (under Batch code), pre-selected to the current SKU and listing all active master SKUs (falls back to show the current SKU even if inactive); `saveEdit` sends `sku_id` only when changed. Stored the master-SKU list in a `skus` state from the existing `/master-skus` fetch.
- **Verified (preview)**: curl — change SKU syncs `sku_name`, invalid SKU → 404, reverted; screenshots — dropdown renders pre-selected with 8 SKUs, and a full UI change→Save showed the "Batch updated" toast + header updating to the new SKU name (then reverted the test batch). Lints clean (py + js). **Redeploy to push to production.**


### 2026-06-01 — Configurable per-tenant idle (inactivity) auto-logout ✅ DONE
- **Request**: "App times out at 20 min — it should time out only when idle, not while actively using. Also make the idle timeout configurable in tenant settings and honor it."
- **Finding**: The timeout was *already* idle-based — `AuthContext` resets a single inactivity timer on every `mousedown/mousemove/keypress/scroll/touchstart/click`, so active users are never logged out; the backend session token itself lasts 7 days (not the cause). The only change needed was making the idle duration tenant-configurable.
- **Backend** (`models/tenant.py`): added `idle_timeout_minutes: int = 20` to `TenantSettings` (persisted/returned via existing `PUT/GET /api/tenants/current/settings` + `/config`; no new endpoints).
- **Frontend**: `TenantSettings.js` — new "Idle Session Timeout" field (1–480 min, `data-testid="input-idle-timeout"`) in Regional/Distribution settings, saved via the existing Save Regional Settings button. `TenantConfigContext.js` bridges the value to `localStorage['idleTimeoutMinutes']` on config load (because `AuthProvider` is the OUTER provider and can't consume tenant config). `AuthContext.js` now reads that value dynamically (`getInactivityTimeoutMs()`, clamped 1–480, default 20) for both the inactivity timer and the idle-time exclusion on logout — so changes take effect on the next user activity without a reload.
- **Verified (preview)**: curl — field absent→defaults 20; PUT 15→GET 15→restored 20 (also restored the tenant's original gps interval=7 that the test touched). Screenshots — settings field renders with value 20; `localStorage.idleTimeoutMinutes = 20` confirmed after login. Lints clean (py + js). Frontend + 1-line model change — **redeploy to push to production**.


### 2026-05-31 — Target Planning list: "Assigned to me" + status filter bar ✅ DONE
- **Request**: Add an "Assigned to me" / status filter bar to the Target Planning list page.
- **Frontend only** (`pages/TargetPlanningList.js`): new Swiss-styled filter bar above the grid — a segmented **status control** (All / Active / Draft / Completed / Inactive, each with a live count) + an **"Assigned to me"** toggle (dark-filled when on, `UserCheck` icon). Filtering: `matchesStatus` (`status || 'draft'`) and `matchesAssignee` (`assigned_to === user.id`, via `useAuth()`); status-tab counts are computed on the assignee-filtered base so they reflect the visible set. Plans are then grouped (by `assigned_to_name`, Unassigned last) from the filtered set. New **filtered-empty state** ("No plans match these filters" + Clear filters) distinct from the global no-plans empty state. New testids: `tp-filter-bar`, `status-filter-{all|active|draft|completed|inactive}`, `assigned-to-me-toggle`, `tp-no-matches`, `clear-filters-btn`.
- **Verified (preview)**: screenshots + selector checks — Active filter → 1 card; All → 10 (groups "Surya Yadavalli" + "Unassigned"); Assigned-to-me ON → only my plan + counts recompute (All 1 / Draft 1); Assigned + Inactive → no-matches empty state. Temp-assigned a plan to surya to verify the toggle, then reverted to unassigned. JS lint clean. No backend change. Redeploy to push to production.


### 2026-05-31 — Target Plan Detail page: full Swiss/minimalist redesign ✅ DONE
- **Request**: Extend the minimalist "Swiss & High-Contrast" design language (from the list page) to the Target Plan Detail page and its inner components.
- **Frontend only** (`pages/TargetPlanDashboard.js`, per `/app/design_guidelines.json`): rewrote the inner components to the clean light theme — **CombinedProgressWidget** (removed the dark gradient header & circular stat badges → white card, `text-3xl tracking-tighter` target metric, plain time stats, thin `h-1` blue time-elapsed bar, subtle bordered milestone dots, and a light-zinc cumulative MRR section with thin emerald achievement bar + 3 plain stat columns); **MonthlyPerformanceTable** (zinc tokens, uppercase tiny labels, `h-1` emerald/teal/amber/rose bars, light footer + info banner); **HierarchicalAllocationSection** (hairline 4-cell summary band, `h-1` emerald progress, dark "Add Territory" CTA, dashed empty state); **TerritoryCard** (dropped the rank-gradient header → white `rounded-xl border` card with zinc MapPin chip, `tracking-tighter` amount, thin emerald distribution bar, hover-reveal delete); **CityAllocationRow** (clean bordered row, Allocated/Achieved split with hairline divider); **AllocationItemWithProgress** (zinc tokens, `h-1` bar); **MonthlyAllocationTab** (hairline summary band, zinc table headers/footer, dashed empty state). Removed unused helper `getRankStyle` and unused imports (`Progress`, `Clock`, `Trophy`, `Medal`, `X`, `Calendar`). Added `data-testid` `mark-completed-btn` + `revert-to-draft-btn`. All existing testids preserved; plan title stays programmatically computed (no editable title field).
- **Verified (preview)**: `testing_agent_v3_fork` frontend run (iteration_180) — **100%**, no regressions, no console errors; all flows work (CombinedProgressWidget render, cumulative MRR, run-rate MonthlyPerformanceTable, TerritoryCard+CityAllocationRow, Add Territory/City dialogs, city drawer Resources/SKUs tabs, Monthly Allocation matrix live cell→allocated/balance updates, Submit disabled while unbalanced, status buttons). Screenshots confirmed run_rate + cumulative + 5-territory + monthly-matrix views. JS lint clean. Redeploy to push to production.


### 2026-05-31 — Target Planning list: 3-letter months + full minimalist redesign ✅ DONE
- **Request**: Use the first 3 letters of the month (avoid overlap), and redesign the whole Target Planning list page to be professional, contemporary and minimalistic.
- **3-letter months**: `TP_MONTHS` now `Jan…Dec` in both `pages/TargetPlanningList.js` and `pages/TargetPlanDashboard.js` → titles like "Apr / 26" and "Jan / 26 - Dec / 26".
- **Redesign** (`pages/TargetPlanningList.js`, design blueprint via design agent → `/app/design_guidelines.json`): Swiss/minimalist light theme — `max-w-[1600px]` container with generous spacing; large `tracking-tight` page title + dark `bg-zinc-900` CTA; group headers with a thin bottom border; **4-col** responsive grid (`xl:grid-cols-4`). Cards rebuilt as crisp white `rounded-xl border border-zinc-200` tiles (removed the old colored left-border tint) with hover lift + soft shadow; header = color initials avatar + period title + subtle owner pill + UPPERCASE status pill (refined tokens) + ghost ⋯ menu; big `text-3xl tracking-tighter` ₹ metric + outline goal-type tag; **thin `h-1`** progress bars with tiny uppercase labels; "View Details →" fades in on hover. Polished dashed empty state. Removed unused imports (Card, Clock, TrendingUp, Receipt, IndianRupee, Banknote, ChevronRight) + dropped the now-unused `getStatusTile` helper.
- **Bug fix**: guarded the Allocated/Current-month % math against undefined (`allocated_amount || 0`) — was rendering "NAN%".
- **Verified (preview)**: screenshots — clean redesigned grid, 3-letter months, owner + status pills, hover "View Details" reveal, "₹0 · 0%" (no NaN). JS lint clean. Redeploy to push to production.



### 2026-05-31 — Target Planning: owner-name pill + UPPERCASE status pill ✅ DONE
- **Request**: Show the full owner name (assigned user; creator if unassigned) as a pill next to the plan title, and show the status (ACTIVE/DRAFT/…) in uppercase as a pill in the top-right corner.
- **Frontend** (`pages/TargetPlanningList.js`, `pages/TargetPlanDashboard.js`): card header restructured — title row now shows the initials avatar + computed period + an outline **owner-name pill** (`getPlanOwnerName` → assigned_to_name || created_by_name || "Unassigned"); the **status pill** moved to the top-right cluster (next to the ⋯ menu), styled `uppercase` via `getStatusBadge(status)` colors (ACTIVE=green, DRAFT=gray, INACTIVE=zinc, COMPLETED=blue). Mirrored on the plan detail header (owner pill + uppercase status pill). New testids: `plan-owner-pill-{id}`, `plan-status-pill-{id}`, `plan-owner-pill`, `plan-detail-status-pill`.
- **Verified (preview)**: screenshots — list cards show "Surya Yadavalli"/"System Admin" owner pills + ACTIVE/DRAFT uppercase pills top-right; detail header shows "System Admin" + DRAFT. JS lint clean (both files). No backend change. Redeploy to push to production.



### 2026-05-31 — Target Planning: consistent computed plan titles (initials + month period) ✅ DONE
- **Request**: Plan names were inconsistent (everyone typed their own). Replace the displayed name with a consistent format: a 2-letter initials avatar (like the Leads list) + the month period — single month → `Month / YY` (e.g. "June / 26"); multi-month → `Start Month / YY - End Month / YY`.
- **Decisions**: initials = **assigned user**, falling back to the **creator** when unassigned; the typed name is **hidden in all displays** (field kept in the form, value still stored); applied to **both the list tiles and the plan detail header** (+ breadcrumb).
- **Frontend** (`pages/TargetPlanningList.js`, `pages/TargetPlanDashboard.js`): added shared helpers `getNameAvatar` (color-hashed initials, Leads-list style), `fmtPlanMonth`/`getPlanPeriodLabel` (parses YYYY-MM-DD directly to avoid TZ drift), `getPlanOwnerName`. Card title and detail `<h1>` now render the initials avatar + computed period label (testids `plan-title-{id}`, `plan-detail-title`, `plan-owner-avatar`).
- **Backend** (`routes/target_planning.py`): added `_backfill_owner_names()` — lazily resolves & persists missing `created_by_name`/`assigned_to_name` from the users collection (batched) in the list + dashboard endpoints, so legacy plans show real initials instead of "?".
- **Verified (preview)**: screenshots — list shows "SY · April / 26" and "SA · January / 26 - December / 26"; detail header shows "SA · March / 26 - August / 26"; backfill cleared all missing names (0 remaining). 9/9 pytest pass, Py + JS lint clean. Redeploy to push to production.



### 2026-05-31 — Target Planning: assign plan to a user + group by assigned user ✅ DONE
- **Request**: Add an option to assign a target plan to a specific user, and group the dashboard tiles by the **assigned** user (instead of the creator).
- **Backend** (`routes/target_planning.py`): added `assigned_to` to `TargetPlanCreateV2` + `TargetPlanUpdateV2`; new `_resolve_user_name()` looks up the tenant user and stores a denormalized `assigned_to_name`. Create resolves & stores `assigned_to`/`assigned_to_name`; PUT re-resolves whenever `assigned_to` changes (empty string `""` clears the assignment → both null).
- **Frontend** (`pages/TargetPlanningList.js`): added an **"Assign To"** dropdown (Unassigned + all active users from `GET /api/users?is_active=true`) to the Create/Edit Plan dialog (`plan-assignee-select`); `assigned_to` flows through the create/update payload. Grouping now keys on `assigned_to_name` (was `created_by_name`), with the **"Unassigned"** bucket sorted last. (Supersedes the earlier "group by creator" entry.)
- **Verified (preview)**: `tests/test_iteration_201_target_assignee.py` (4 tests — create-with-assignee resolves name, reassign updates name, unassign clears, create-without is unassigned) + the iteration-200 suite all pass (9/9). Frontend E2E screenshots — Assign To dropdown lists Unassigned + 38 users; assigning a plan moved it out of "Unassigned" into the assignee's group with a "Target plan updated" toast. Test plan reset. Py+JS lint clean. Redeploy to push to production.



### 2026-05-31 — Target Planning list: group by creator + status color coding + Inactivate ✅ DONE
- **Request**: Group target plan tiles by the user who created them; add subtle status-based color coding to the tiles (draft/active/inactive); add an "Inactivate" action.
- **Frontend only** (`pages/TargetPlanningList.js`): (1) tiles are now grouped under a per-creator header (avatar initials + name + plan count) keyed on `created_by_name` (legacy plans without it bucket under "Unknown User"); (2) `getStatusTile()` adds a subtle left-border accent + faint tint per status — draft (slate), active (emerald), completed (blue), inactive (zinc); status badge map gained `inactive`; (3) the card dropdown gained **Inactivate** (Ban icon, on `active` plans → sets `status='inactive'`) and **Reactivate** (on `inactive` plans → `status='active'`), and `inactive` was added to the "Revert to Draft" condition. Status-change toasts now read activated/inactivated/marked completed/reverted to draft. New testids: `plan-group-{creator}`, `inactivate-plan-{id}`, `reactivate-plan-{id}`.
- **Backend**: no change — `PUT /api/target-planning/{id}` already accepts any `status` string and the list endpoint already returns `created_by_name`.
- **Verified (preview)**: screenshots — plans grouped under Surya Yadavalli / System Admin / Unknown User; active tile green, draft tiles slate; opened the active plan's menu → Inactivate → toast "Target plan inactivated" + tile turned zinc/"inactive"; Reactivate restored it to "active". JS lint clean. Redeploy to push to production.



### 2026-05-31 — Target Planning: Monthly Target Allocation table (City × Month) ✅ DONE
- **Request**: In Target Planning, let users split each city's total sales target across the individual months of the plan's period (e.g. Jun–Sep → 4 month columns). Cities as rows, months as columns, editable cells; validate each city's monthly sum == its total target, show Total/Allocated/Balance per city + grand totals, and block final submission until balanced.
- **User choices**: 1a new **"Monthly Allocation" tab** in the plan detail; rows = the plan's existing **City allocations** (each city's Total = its allocation `amount`); **no auto-split** (manual entry); same city under two territories shows as **two rows** (territory-labelled); scope = **table + validation + save now**, actual-vs-target performance tracking is a follow-up.
- **Backend** (`routes/target_planning.py`): `GET /api/target-planning/{plan_id}/monthly-allocation` returns `months[]` (derived from plan start→end), one row per `level='city'` allocation (`city`, `territory_name`, `total_target`, `monthly{YYYY-MM}`, `allocated_total`, `balance`, `is_balanced`), plus `month_totals`, `grand_target/allocated/balance`, `is_balanced`, `finalized`. `PUT …/monthly-allocation` persists the cells onto each city allocation's `monthly_allocation` dict; `finalize=true` is **rejected (400 + mismatch list)** unless every city's monthly sum equals its total; drafts (`finalize=false`) save freely. Stored on `target_allocations_v2` / plan flag `monthly_allocation_finalized`.
- **Frontend** (`pages/TargetPlanDashboard.js`): wrapped the plan detail in **Allocations** vs **Monthly Allocation** tabs. New `MonthlyAllocationTab` — summary cards (Total Target / Allocated / Balance / Status), a scrollable City×Month matrix with numeric inputs, live per-row Allocated + Balance (red/⚠ when off, green when matched), a Grand Total footer with per-month totals, and **Save Draft** (always) + **Submit Allocation** (disabled until every city is balanced) with an inline blocked-hint. testids: `tab-monthly-allocation`, `monthly-allocation-table`, `ma-cell-{allocId}-{YYYY-MM}`, `ma-row-balance-*`, `ma-save-draft-btn`, `ma-submit-btn`, `ma-status`.
- **Verified (preview)**: `tests/test_iteration_200_monthly_allocation.py` (5 tests — shape, draft persist, finalize-reject-on-mismatch, finalize-success, persistence) all pass. Frontend E2E screenshots — 6-month matrix renders with live balance highlighting; on a 1-month plan, balancing every city → Status "Balanced" → Submit enabled → success toast → "Balanced · Submitted". Test plan data reset afterward. Py + JS lint clean. Redeploy to push to production.
- **Follow-up (P1)**: actual monthly revenue vs the planned monthly target per city (performance tracking).



### 2026-05-31 — Driver Login: "Remember me on this device" (skip re-typing credentials) ✅ DONE
- **Request**: On the Driver login page, add an option to remember the password so drivers don't have to enter mobile number + password each time.
- **Frontend only** (`pages/driver/DriverLogin.js`): added a **"Remember me on this device"** checkbox (default ON, `data-testid="driver-remember-me"`). On successful login, when checked, the driver's phone + password are saved to `localStorage` (`driver_remember_me`, `driver_saved_phone`, `driver_saved_password`); when unchecked, they're cleared. On page mount, if remember-me is on, the phone + password fields are **pre-filled** so the driver signs in with a single tap. The session token already persists via AuthContext, so this removes the typing burden when a session expires and they land back on login. No backend / auth-protocol / hashing / token change.
- **Note**: password is stored in plain `localStorage` on the driver's own device (acceptable for this low-sensitivity, system-generated driver password per the explicit request).
- **Verified (preview)**: screenshots — checkbox renders default-checked; after seeding saved creds + reload, phone (`9876500011`) and password (8 chars) pre-fill and the box stays checked; unchecking toggles correctly. JS lint clean. Redeploy to push to production.



### 2026-05-31 — Account Detail → SKU Pricing: inline Add/Edit without global Edit Account ✅ DONE
- **Request**: In the Account Detail page, give Add and Edit options to the **SKU Pricing** section at all times, so the user doesn't have to click "Edit Account" (top-right) just to change pricing.
- **Frontend** (`pages/AccountDetail.js`): added a section-level inline editor — a new `pricingEditing` state + `skuEditing = isEditing || pricingEditing` flag drives the table cells. The SKU Pricing card header now always shows an **"Edit Pricing"** button (and on empty state an **"Add SKU"** button); clicking it makes rows editable inline and reveals **Add SKU / Cancel / Save**. New `handleSavePricing` does a partial `PUT /api/accounts/{id}` sending **only `sku_pricing`** (MRP blank→null coercion), `handleCancelPricing` reverts from `account.sku_pricing`. `handleAddSKU` auto-opens the inline editor. The global Edit Account flow is unchanged (section controls hide while it's active; both flows reset `pricingEditing`). New testids: `edit-pricing-btn`, `save-pricing-btn`, `cancel-pricing-btn`, `add-first-sku-btn`.
- **Backend**: no change — `update_account` already persists only non-null fields, so a `sku_pricing`-only payload leaves all other account data intact.
- **Verified (preview)**: screenshots — default shows "Edit Pricing"; after clicking, rows become editable with Add SKU/Cancel/Save. curl e2e — partial PUT (price 111→112) returned HTTP 200 and preserved `account_name`/`contact_number`; restored test value. JS lint clean. Redeploy to push to production.



### 2026-05-31 — Record Account Delivery modal: newest item on top + floating action buttons ✅ DONE
- **Request**: In Record Delivery (distributor Stock Out → "Record Account Delivery"), (1) when clicking "Add Item" the newest line should appear at the **top** of the list (so the user doesn't scroll down to fill it), and (2) the **Record Delivery / Cancel** buttons should be **floating** (always visible) instead of requiring a scroll to the bottom.
- **Fix #1 — prepend new items** (`pages/DistributorDetail.js` → `addDeliveryItem`): now prepends the new row (`[newItem, ...prev]`) so it renders directly under the "Add Item" button at the top. Safe because `updateDeliveryItem`/`removeDeliveryItem` key on `item.id` (not array index).
- **Fix #2 — sticky footer** (`components/distributor/DeliveriesTab.jsx`): restructured the delivery `DialogContent` into a `flex flex-col` with a fixed `DialogHeader` (`shrink-0`), a scrollable body (`flex-1 overflow-y-auto min-h-0 -mx-6 px-6`), and a pinned `DialogFooter` (`shrink-0 border-t pt-4`). Header + action buttons now stay visible while only the items body scrolls. The over-stock guard banner in the footer is unchanged.
- **Verified (preview)**: screenshot — added 3 items; newest "Select SKU" row sits at the top under "Add Item", and the Cancel/Record Delivery footer is pinned at the bottom with a top border while the body overflows. JS lint clean. Redeploy to push to production.



### 2026-05-31 — Compare Months: flip Change (MoM) card — % prominent, amount underneath ✅ DONE
- **Request**: In Revenue Analytics → Compare Months, the "Change (MoM)" card showed the ₹ difference large with the % small underneath. Flipped it: the **% is now the large headline** (`text-3xl`) and the **₹ amount sits underneath** in the pill (`+₹X vs <Month>`). `pages/RevenueAnalytics.js` CompareView. Verified via screenshot (shows +100% large, +₹5.4K vs Apr 2026 below). The comparison table columns (Change / %) are unchanged. Redeploy to push to production.


### 2026-05-31 — Revenue Reconciliation panel + SKU-Aliases ₹-impact upgrade ✅ DONE
- **Context / correction**: User reported SKU Performance (₹32.96L) ≠ Revenue Analytics gross (₹34.29L) and asked to fix "unmapped SKU lines". On deeper investigation my first diagnosis was **wrong**: SKU Performance does NOT drop unmapped lines — `resolve()` falls back to the verbatim stale name and `total_achieved` sums `all_known_skus ∪ invoice-revenue-keys`, so unmapped lines ARE counted (under old names). Proven on clean preview data where the two match exactly (RA ₹66,227.50 ≈ SKU Perf ₹66,227.49, `/unmapped` = 0). The real gap = **tax/charges + invoices without SKU line items** (e.g. External Billing Entries). User chose option (a): build a transparent reconciliation.
- **Revenue Reconciliation panel** (`routes/revenue_analytics.py` + `pages/RevenueAnalytics.js`): new `GET /api/reports/revenue-reconciliation?time_filter=…` returns the exact bridge over the SAME invoice window RA uses: `Gross = Product line revenue (SKU Perf basis) + Tax & charges + Invoices-without-SKU-lines + Lines-without-an-identifier`, and `Net = Gross − Credit notes`. Also returns `unmapped_line_revenue` + count (a subset of product revenue). Frontend shows it as a glassmorphism/neon collapsible panel under the KPI tiles on the Revenue Analytics page, auto-tied to the selected period, with an amber callout + link to SKU Aliases. Verified: bridge ties out to the penny across all_time/this_year/this_month and `gross`/`net` match the RA headline exactly. `data-testid="ra-reconciliation"`.
- **SKU Aliases ₹-impact upgrade** (`routes/sku_aliases.py` + `components/SkuAliasTool.jsx`): `GET /admin/sku-aliases/unmapped` now returns per-identifier **revenue + units** and is sorted by revenue desc; the tool shows ₹/units badges next to each unmapped code/name. Also fixed the scan to read `line_items` as well as `items` (and `$or` query) so unmapped lines stored under either field are surfaced (previously only `items` was scanned). Verified map→list-shrinks→delete-alias→restore flow (HTTP 200 each).
- **Tests**: `tests/test_iteration_199_revenue_reconciliation.py` (2 tests — exact bridge + clean-data match) pass; existing iteration_197 still green. Backend/JS lint clean. Screenshots confirm both UIs.
- **⚠️ Action**: redeploy to push to production. On production, the panel will show your real tax + EBE split that explains the ₹34.29L vs ₹32.96L difference.


### 2026-05-31 — SKU master MRP + Account SKU-pricing blank-MRP crash fix ✅ DONE
- **Request**: "Add MRP for SKUs under SKU Management for each SKU. If customer MRP is allowed for a SKU, it will be visible on the Account Detail page under SKU Pricing; otherwise not visible (as now). MRP editable for every SKU. Also fix: adding a SKU on the account page throws 'unable to parse the string' when MRP isn't set." User chose **(a)** SKU MRP pre-fills the account MRP as a default that's still per-account editable.
- **New feature — master MRP per SKU**:
  - Backend (`server.py`): added `mrp: Optional[float]` to `SKUCreate` + `SKUUpdate` and to the GET/POST/PUT `master-skus` responses. (`base_price` untouched.)
  - SKU Management UI (`SKUManagement.js`): new "MRP (₹)" input below Base Price (editable for every SKU), wired into create/edit form-state + save payload (coerced to number or null). `data-testid="sku-mrp-input"`.
  - Account Detail (`AccountDetail.js`): on selecting a SKU for a pricing row, the row's MRP now **pre-fills from the SKU's master MRP** when that SKU has `allow_custom_mrp` ON and a master MRP set (option a — still editable per account). The MRP column visibility rule (only shown when a row's SKU allows custom MRP) is unchanged.
- **Bug fix — "unable to parse the string"**: a freshly-added SKU row sent `mrp: ''` (empty string), which `Optional[float]` couldn't parse → 422 on account save. Added `field_validator(mode='before')` on `AccountSKUPricing` (`routes/accounts.py`) coercing blank `mrp`→None and blank `price_per_unit`/`return_bottle_credit`→0.0. Also coerce empty MRP→null in the Account Detail save payload (defense in depth).
- **Bonus (known dropped-field bug)**: added `lead_type` + `include_in_gop_metrics` to `AccountUpdate` so they persist on Account edit (the frontend was already sending them; they were silently dropped).
- **Verified (preview)**: curl — SKU PUT `mrp=45.5` persists & GET returns it (base_price intact); full E2E PUT `/api/accounts/{id}` with an empty-MRP row → **HTTP 200** (was the crash); screenshots — SKU edit modal shows MRP field, and a new account SKU row auto-fills MRP=45.5. New pytest `tests/test_iteration_198_sku_mrp.py` (5 tests, all pass). Backend/JS lint clean.
- **⚠️ Action**: redeploy to push to production.


### 2026-05-30 — COGS Calculator: freeze the result columns to the right ✅ DONE → ❌ REVERTED (user request)
- **Reverted 2026-05-31**: user said "In COGS calculator do not freeze the right side columns." Removed all sticky/frozen styling from the result block (Total COGS → Min Landing, Actual Landing, Last Edited) and the helper constants; result columns now scroll naturally with the table. The SKU column stays pinned left (original behavior) and the no-word-wrap + SKU-Management ordering changes remain in place. JS lint clean; verified via screenshot (result columns scroll, not pinned).
- ~~Request: freeze the right-hand result columns so outputs stay visible while scrolling cost inputs.~~ (superseded)


### 2026-05-30 — COGS Calculator: no word-wrap + rows follow SKU Management order ✅ DONE
- **Request**: "I want the view to be without any word wrap. Also, the rows should always follow the sort order of SKUs as per SKU Management." (screenshot of the COGS Calculator table where SKU names + column headers wrapped onto multiple lines and rows were in arbitrary order).
- **Frontend** (`pages/COGSCalculator.js`): added `whitespace-nowrap` to the desktop `<table>` (line ~792). Since `white-space` is inherited, every header cell ("Manufacturing Variable Cost (₹)", "Outbound Logistics Cost (₹)", etc.) and SKU name ("Nyla – 660 ml / Sparkling") now stays on a single line; the existing `overflow-x-auto` wrapper provides horizontal scroll. Mobile card view untouched.
- **Backend** (`server.py` → `get_cogs_data`): the returned `cogs_data` is now sorted to mirror SKU Management's display order — **category (alphabetical, case-insensitive) → sort_order (asc) → sku_name**. Added `category` + `sort_order` to the `master_skus` projection, built `master_meta_by_id`, and `cogs_data.sort(key=_sku_sort_key)` before returning. Missing category falls under "Other" (same fallback SKU Management uses).
- **Bonus fix** (same endpoint): coerce a row's `custom_components` to `{}` when it's stored as a non-dict (legacy list). This was crashing `GET /api/cogs/{city}` with HTTP 500 (`TypeError: list indices must be integers`) for corrupt rows — the same legacy-data class the previous session fixed for the PUT endpoint. Page now loads for those rows.
- **Verified (preview)**: curl — COGS `/Bengaluru` order now byte-for-byte matches the SKU-Management-sorted master list (PET → 600ml Silver → 330ml Silver → 660ml Gold → 330ml Gold → 660ml Sparkling → 330ml Sparkling → 24 Brand). Screenshot — headers + SKU names on single lines, table scrolls horizontally. JS lint clean; COGS pytest 9/10 (the 1 failure is a pre-existing out-of-date landing-price assertion unrelated to this change).
- **⚠️ Action**: redeploy to see it in production.


### 2026-05-30 — Revenue Analytics: table moved above charts ✅ DONE
- **Request**: "in revenue analytics move table to the top and charts to the bottom."
- **Frontend** (`pages/RevenueAnalytics.js`): reordered both tabs — Breakdown is now Filter → KPIs → **ranked table** → (bar + donut charts); Compare is now Filter → KPIs → **comparison table** → grouped bar chart. Pure JSX reorder; no data/testid changes.
- **Verified (preview)**: DOM-order checks (`table-before-charts`, `table-before-chart`) + screenshots on both tabs. Lint clean.
- **⚠️ Action**: redeploy to see it in production.



### 2026-05-30 — Revenue Analytics headline totals changed with group-by ✅ FIXED (needs redeploy)
- **Symptom (production)**: switching the breakdown dimension changed the headline KPIs — group_by=SKU showed Gross ₹32.96L / Net ₹32.96L / 158 invoices, while group_by=Business Category showed Gross ₹34.29L / Net ₹28.29L / 132 invoices. Totals should be identical regardless of group-by.
- **Root cause** (`routes/revenue_analytics.py`): the headline Gross/Net/Invoice-count were summed **from the grouped breakdown**, which aggregates differently per dimension — SKU iterates invoice **line items** (count = lines, net = gross, ex-tax), while City/Category/State/Territory iterate **invoices** (count = invoices, net = gross − credit notes). So the headline moved with group_by.
- **Fix**: new `_window_totals(fd, td)` computes the headline **from the invoices in the window** (gross = Σ invoice gross, net = Σ invoice net, count = #invoices), **independent of group_by**. The endpoint now returns these for `total_gross`/`total_revenue`/`total_invoice_count`; the per-group sums are kept only for the breakdown (exposed as `breakdown_*` for reconciliation).
- **Verified (preview)**: headline identical across sku/business_category/city/state/territory (e.g. 66228/66228/5) while the SKU breakdown legitimately differs (8 line items vs 5 invoices). `tests/test_iteration_197_revenue_headline_totals.py` (2) + iteration-189 regression pass. Lint clean. Backend-only — frontend already reads these fields.
- **Note**: the SKU breakdown rows may sum to slightly less than the headline Gross (SKU = product-line revenue ex-tax; headline = full invoice gross) — expected.
- **⚠️ Action**: redeploy to fix in production.



### 2026-05-30 — SKU Management: permanently delete inactive SKUs (CEO/Admin) ✅ DONE
- **Request**: "provide an option to delete the inactive SKUs in SKU Management, CEO and admin should have access."
- **Backend** (`server.py`): new `DELETE /api/master-skus/{sku_id}/permanent` — hard-deletes from `master_skus`, **only for inactive SKUs** (`is_active === false`; active → 400 "deactivate it first"), restricted to **CEO / Admin / System Admin** (else 403). (The existing `DELETE /master-skus/{id}` remains a soft delete/deactivate.)
- **Frontend** (`pages/SKUManagement.js`): for inactive SKUs (shown via "Show Inactive"), CEO/Admin now see a red **Delete** button next to Reactivate (`useAuth().role` gate + `handlePermanentDelete` with a confirm warning). `skusAPI.deletePermanent` added.
- **Verified (preview)**: curl — active SKU → 400, inactive SKU → 200 + removed, active untouched; screenshot — Delete button shows on inactive rows for CEO, not on active rows. Lint clean (py syntax + js).
- **Note**: deleting an inactive SKU removes its external-code mapping, so any historical invoice line still using that code would become "unmapped" — re-map it via Tenant Settings → SKU Aliases if needed (the confirm dialog warns about this).
- **⚠️ Action**: redeploy to use it in production.



### 2026-05-30 — Old vs current SKUs both appearing in reports (SKU consolidation) ✅ DONE (Part A + B, needs redeploy)
- **Request**: SKU Management has the current SKUs, but Revenue Analytics, SKU Performance & Invoices show OLD SKUs too (e.g. same account "Cu2" shows one invoice with "Nyla – 660 ml / Silver" and another with "Nyla Air Water - 660 ml (Silver)"). Old SKUs aren't mapped to new.
- **Root cause**: historical invoice line items carry stale denormalized `sku_name` and/or retired external codes (B500/B1000/A650). The SKU resolvers trusted the stored name **before** the external code, and had no alias map for retired codes/names → old SKUs shown verbatim as separate rows. (Production renamed master SKUs to the new format keeping the same `ext` codes B660/A660/etc.)
- **Fix — shared resolver** `services/sku_resolver.py` (`build_sku_resolver` + `SkuResolver`): resolution is now **code-first** (external code → current master SKU), then code-alias, then sku_id, then name → current master, then name-alias, then verbatim fallback. Wired into: `routes/reports.py` (SKU Performance), `routes/revenue_analytics.py` (SKU group-by, also fixed a `sku_code` vs `external_sku_id` lookup bug), `routes/invoices.py` (list — enriches item `sku_name`), and `server.py` account-invoices endpoint (enriches item `sku_name`). **Part A** auto-consolidates every old line that carries a still-valid current code — no data migration, source invoices untouched.
- **Part B — SKU Aliases tool**: new `routes/sku_aliases.py` (`GET /admin/sku-aliases`, `GET /admin/sku-aliases/unmapped` scan, `POST`, `DELETE`; CEO/Director/Admin) backed by a `sku_aliases` collection; UI `components/SkuAliasTool.jsx` in **Tenant Settings → Settings** lists every leftover unmapped code/name with counts + sample invoices and maps each → a current SKU. Applied at read-time everywhere (non-destructive).
- **Verified (preview)**: simulated the production rename (renamed A330 master, kept code) → old-name invoices consolidated under the new name with identical gross (Part A); created an alias for unmapped `A650` → merged into target & removed from the unmapped list (Part B); restored test data. `tests/test_iteration_196_sku_resolver.py` (7) + revenue-analytics regression (iteration 189) pass. Lint clean (one pre-existing unrelated F541 in invoices.py:127 left as-is).
- **⚠️ Action**: redeploy. Most old SKUs collapse automatically; then go to Tenant Settings → Settings → SKU Aliases and map any leftover unmapped codes/names.



### 2026-05-30 — Performance Tracker → "Top Leads to Focus": Est. Monthly Revenue showed ₹0 ✅ FIXED (needs redeploy)
- **Symptom (production)**: the "EST. MONTHLY REVENUE" column and "TOTAL EST. MONTHLY REVENUE" were ₹0 even though leads had an Opportunity Estimation.
- **Root cause**: the Opportunity Estimation flow (`routes/leads.py`) saves the value at **`opportunity_estimation.estimated_monthly_revenue`**, but `routes/performance.py::_lead_estimated_monthly_revenue` only read top-level `estimated_monthly_revenue` / `estimation.*`, and `_focus_leads_enrich`'s projection didn't even fetch `opportunity_estimation` → it always fell through to a compute branch that yielded 0. Verified in DB: 3 leads had `opportunity_estimation.estimated_monthly_revenue` = 432768 / 250000 / 169200 while the read paths were `None`.
- **Fix** (`routes/performance.py`): `_lead_estimated_monthly_revenue` now reads `opportunity_estimation.estimated_monthly_revenue` first (then legacy `estimated_monthly_revenue` / `estimation.*`, then computes from `proposed_sku_pricing × final_monthly`); added `opportunity_estimation` to the focus-leads projection. Backend-only; frontend already reads `estimated_monthly_revenue`.
- **Verified**: live API now returns Patni Plaza EMR ₹250,000 (was 0); `tests/test_iteration_195_focus_leads_emr.py` (6 tests) passes. Lint clean.
- **⚠️ Action**: redeploy to fix in production.



### 2026-05-30 — Revenue Analytics: ARR (Annual Run Rate) tile ✅ DONE
- **Request**: "in the revenue analytics show the ARR (annual run rate) as an additional tile from the month selected."
- **Frontend** (`pages/RevenueAnalytics.js`): added a 4th KPI tile **"Annual Run Rate"** to the Breakdown tab (magenta neon, gauge icon, testid `ra-arr`). ARR = selected-period **gross** annualized: named periods use a fixed multiplier (this/last month → ×12, week → ×52, quarter → ×4, year → ×1); custom / all-time annualize from the resolved window's day count (`365/days`, using the endpoint's `from`/`to`). Sub-label states the basis, e.g. "This Month gross × 12". KPI grid → `lg:grid-cols-4`.
- **Verified (preview)**: with default "This Month", gross ₹5,376 → ARR ₹64.5K (= ×12); screenshot confirms the tile and label. Lint clean. No backend change.
- **⚠️ Action**: redeploy to see it in production.



### 2026-05-30 — Stock Dashboard: split "Customer Returns" into Empty Bottles vs Product Returns ✅ DONE (Option A)
- **Request**: Customer returns have 4 types (Empty/Reusable, Damaged, Expired, FOC/Promotional). Empty + FOC are empty used bottles for recycling, NOT undeliverable/damaged stock — but the dashboard lumped all 4 into one amber "Customer Returns – Not deliverable" KPI, which was confusing. User approved **Option A** (reclassify display only; group Empty + FOC together).
- **Backend** (`routes/distributors.py` → `get_stock_dashboard`): added per-SKU + `totals` fields `empty_bottles_returned` (= empty_reusable + promotional, in crates) and `product_returns` (= damaged + expired); added `promotional` to `bottle_tracking`. `customer_returns` total kept for back-compat. No change to `stock_at_hand`, settlements, or credit math.
- **Frontend** (`components/distributor/StockDashboardTab.jsx`): replaced the single "Customer Returns" KPI with two — **Empty Bottles** (green, "For recycling") and **Product Returns** (amber, "Damaged / expired"); regrouped the "Empty Bottles & Returns" card into *Empty bottles (Empty/Reusable + FOC)* vs *Unsellable product (Damaged/Expired) + Pending Factory Return*; split the Stock-by-SKU "Cust. Returns" column into **Empty Bottles** + **Product Ret.** (header, rows, totals, colSpans updated). Summary grid → 8 cards.
- **Verified (preview)**: live API returns the new grouped fields and they reconcile (distributor with 20 returns → 10 empty + 10 product; another → 1 empty + 0 product); screenshot shows the split across KPIs, bottle card, and SKU table. Lint clean (py + js).
- **Scope note**: distributor Stock Dashboard only. Account-level "Return Bottles %" not touched (optional follow-up). No real "empty bottle stock ledger" yet (that was Option B — deferred).
- **⚠️ Action**: redeploy to see it in production.



### 2026-05-30 — System-generated invoices now ADD to the account's outstanding balance ✅ DONE (needs redeploy + one-time back-fill)
- **Request**: "outstanding should be added up to the existing outstanding balance, if the invoices are generated from within the system (not from external source)." (Re: account showing a system invoice INV-001880 with ₹0 outstanding that didn't move the ₹7.85L balance.)
- **Model recap**: invoices carry `source`. `external_api` (pushed by the external billing system) OVERWRITES `account.outstanding_balance` (unchanged). Company-billed invoices auto-generated from distributor deliveries carry `source: 'zoho_books'` and were historically saved with `outstanding=0` and never touched the balance.
- **User decisions**: (1) the invoice in question = delivery-generated (Zoho); (2) per-invoice Outstanding column shows the new **running balance**; (3) **back-fill** existing ones; (4) payments/credit notes do NOT reduce it; (5) production.
- **Going-forward fix** (`services/zoho_service.py` → `_ensure_mirror_invoice`): on the FIRST mirror of a delivery, add the invoice's net to `account.outstanding_balance` (atomic `$inc`) and stamp the invoice `outstanding` = the new running balance + `outstanding_counted: True`. Retries/re-syncs never double-count (guarded by existence check + flag). `external_api` and EBE (`external_billing`) untouched.
- **Back-fill** (`routes/accounts.py` → `POST /accounts/maintenance/backfill-system-outstanding`, CEO/System Admin): idempotently adds each not-yet-counted `zoho_books` invoice's net to its account balance (chronological), stamps running balance, marks `outstanding_counted`. Re-runnable safely. Exposed via new **"Back-fill System Invoice Outstanding"** card in Tenant Settings → Settings (`components/OutstandingBackfillTool.jsx`).
- **Tests/verification**: `tests/test_iteration_194_system_invoice_outstanding.py` (first mirror adds net; 3× re-sync = no double count) passes. Back-fill verified against preview via curl (counted ₹10,376, idempotent 2nd run = 0) with synthetic data cleaned up. UI button renders. Lint clean (py + js).
- **Scope note**: covers delivery-generated `zoho_books` invoices (the confirmed case). The in-CRM manual "Create Invoice" path is NOT yet wired to increment — optional follow-up.
- **⚠️ Action**: redeploy, then run **Tenant Settings → Settings → Run back-fill** once on production.



### 2026-05-29 — Zoho resync fails with code 3062 on manually-linked account (FORGE BREU-HOUS) ✅ FIXED (needs redeploy)
- **Symptom (production)**: Activating/re-syncing account FORGE BREU-HOUS (already manually linked to a Zoho contact) failed with `Zoho API 400 {"code":3062,"message":"The customer \"FORGE BREU-HOUS\" already exists. Please specify a different name."}`.
- **Root cause**: The earlier short-circuit fix IS working — because the account carries a `zoho_contact_id`, `upsert_contact` correctly does `PUT /contacts/{mapped_id}` (the error's "· longest field" suffix only comes from the PUT branch). But Zoho enforces a **globally-unique `contact_name`**, and a leftover DUPLICATE contact in their Zoho already holds the name "FORGE BREU-HOUS", so the PUT (which sends `contact_name`) is rejected with 3062. It was NOT creating a new customer.
- **Fix** (`services/zoho_service.py`, PUT branch of `upsert_contact`): on a 3062 / "already exists" error during the PUT of an already-linked contact, retry the PUT **without** `contact_name` — sync all other fields (addresses, GST, company_name, etc.) and keep the contact's existing Zoho name. Never falls through to create. Non-3062 errors still raise (with the field-length diagnostic).
- **Tests**: `tests/test_iteration_193_zoho_dup_name_retry.py` (2 tests) — dup-name retry keeps the mapped id + drops contact_name on retry + still updates addresses; non-dup error still raises with no retry. All pass alongside iteration-190 regressions.
- **Note for user**: a leftover duplicate "FORGE BREU-HOUS" contact almost certainly exists in their Zoho Books (the source of the name collision); resync now succeeds regardless, but they may want to delete/merge that duplicate in Zoho for cleanliness.
- **⚠️ Action**: redeploy to fix in production.



### 2026-05-29 — Stock Out (Distributor → Customer): totals summary row ✅ DONE
- **Request**: "include a summary row with totals" (deliveries table on the distributor detail → Stock Out section).
- **Frontend** (`components/distributor/DeliveriesTab.jsx`): added a `<tfoot>` totals row (testid `deliveries-totals-row`) summing the visible deliveries across every numeric column — Items, Billing, Return Credit, Net Billing (customer) and Margin Amt, Billable, Net Billable (distributor). Computed via a `useMemo` (`deliveryTotals`) that mirrors the exact per-row math (qty × price × (1−disc), credit applied, commission %). Styled to match the table (emerald summary band; blue customer / purple distributor column tints; bold net values; per-cell testids `totals-*`). Label shows "Totals (this page) · N deliveries" when paginated, else "Totals · N deliveries".
- **Verified (preview)**: distributor with 10 deliveries → footer shows Items 4, Billing ₹600.00, Net Billing ₹600.00, Margin ₹15.00, Billable ₹585.00, Net Billable ₹585.00 (math reconciles). Lint clean.
- **⚠️ Action**: redeploy to use it in production.



### 2026-05-29 — Account Detail: editable Business Category ✅ DONE
- **Request**: "I need an option to edit the business category in account detail."
- **Backend** (`routes/accounts.py`): added `category: Optional[str]` to `AccountUpdate` (the model had no `extra=allow`, so the field had to be declared). The generic `update_account` loop now persists `category`. This is the same field Revenue Analytics / Account Performance group by (`account.category`), so edits flow straight into those reports.
- **Frontend** (`pages/AccountDetail.js`): new "Business Category" `<Select>` (testid `edit-business-category`) in the account edit form (next to Lead Type), populated from `GET /api/master/business-categories`. Hydrates from `account.category` (falls back to `business_category`/`lead_business_category`), included in the save payload, reset on Cancel, and shown read-only (testid `account-business-category-display`). A legacy stored value not in the master list is preserved as a selectable option.
- **Verified (preview)**: backend curl PUT `{category}` persists + returns; full UI round-trip — Edit → pick "Hospital" → Save → toast + read-only display shows "Hospital"; restored test account to "Restaurant". Lint clean (JS + py).
- **⚠️ Action**: redeploy to use it in production.



### 2026-05-29 — Revenue Analytics: dark futuristic neon glassmorphism redesign ✅ DONE
- **Request (verbatim)**: "change the revenue analytics to a premium modern analytics dashboard UI inspired by futuristic SaaS products... dark glassmorphism / neon gradient aesthetic." Dark theme default; deep navy bg (#080B1F/#101427) + blurred abstract orbs; translucent glass cards w/ blur + inner glow; neon accents (electric cyan #00F0FF, aqua #00D2FF, purple #B026FF, magenta #FF00FF); gradient KPI cards w/ glowing values + neon hover.
- **Design**: `design_agent_full_stack` → "Electric & Neon Dashboard" blueprint (`/app/design_guidelines.json`). Fully rewrote `/app/frontend/src/pages/RevenueAnalytics.js`:
  - **Self-contained dark surface**: page wraps in a `rounded-3xl bg-[#080B1F] [color-scheme:dark]` container with 3 blurred neon orbs (purple/cyan/magenta), so it renders dark+immersive regardless of the host app's light/dark toggle. Sidebar/app chrome stay in their normal theme.
  - **Glass cards**: `bg-[#101427]/60 backdrop-blur-2xl border-white/10` + inner-glow/soft shadow. KPI tiles use cyan/purple/teal gradient fills, glowing mono values (`text-shadow`), neon icon chips, hover lift + orb glow.
  - **Charts (Recharts)**: cyan→purple neon gradient horizontal bar + `feGaussianBlur` glow filter; neon donut (cyan/purple/magenta/aqua/blue palette) w/ glowing center total; compare = cyan (A) vs purple (B) glowing gradient bars; glass tooltip; faint white grid, slate axes. Table on dark glass w/ neon cyan→purple inline share bars, mono numerics.
  - shadcn Select/Input/Tabs overridden with dark-glass classes (translucent bg, white text, cyan focus ring, neon-glow active tab).
  - Subtle entrance animations (`animate-in fade-in / slide-in`).
- **Note**: This intentionally supersedes the prior brand-matched (emerald/brand) look per the user's new explicit direction; up/down MoM trend keeps semantic green/red (neon).
- **Verified (preview)**: light app + this dark page, both Breakdown & Compare tabs render with live data, neon charts, working filters/selects; lint clean. Same endpoints + same data-testids → functionality identical.
- **⚠️ Action**: redeploy to see it in production.



### 2026-05-29 — Revenue Analytics: contemporary corporate-minimalist redesign ✅ DONE
- **Request (verbatim)**: "the revenue analytics dashboard doesn't look contemporary. the tiles and KPIs and the graphs look very bland and rudimentary. Please include corporate minimalistic professional theme for this analytics dashboard."
- **Design**: Used `design_agent_full_stack` → Swiss/high-contrast executive style adapted to the app's emerald/sage B2B theme (`/app/design_guidelines.json`). Rebuilt `/app/frontend/src/pages/RevenueAnalytics.js`:
  - **KPI tiles**: flat bordered cards, hover lift (`-translate-y-0.5`), uppercase tracked labels, large `font-heading tracking-tighter` values, teal icon chips, teal top-accent border on the primary tile.
  - **Charts**: minimal chrome (no axis lines, faint dashed grid), emerald gradient horizontal bars (`radius [0,4,4,0]`), donut `innerRadius 78/outerRadius 116` with center Gross Total + inline legend, custom card tooltip. Compare = slate (baseline) vs emerald (current) grouped bars.
  - **Tables**: flat (no zebra), refined hover, inline share-bar in the Share % column.
  - **Tabs**: underline-style active state.
- **Brand matching (final)**: Data-viz accents now follow the tenant's **brand theme** — KPI chips, accent border, tabs, bars, donut and share bars all use `--primary` (set from `branding.primary_color` via `TenantConfigContext`). Multi-segment charts (donut, dots) use a runtime **brand-color ramp** (`brandRamp()` derives a cohesive monochromatic/analogous scale from the brand hex), so the whole dashboard stays on-brand regardless of the configured brand color (Nyla = red/orange; default teal). Up/down MoM trend keeps semantic green/red.
- **Verified (preview)**: light + dark mode, both Breakdown & Compare tabs render with live data; fully brand-matched; lint clean. Same endpoints + same data-testids → functionality identical to the previously-tested version.
- **⚠️ Action**: redeploy to see it in production.


### 2026-05-29 — Revenue Analytics: gross revenue + more appealing bars ✅ DONE
- **Request**: Show GROSS revenue (instead of net) across Revenue Analytics; make the bars more appealing.
- **Backend** (`routes/revenue_analytics.py`): `_aggregate` now sorts groups by gross; `revenue-compare` now computes a_revenue/b_revenue/delta/delta_pct and period totals from **gross** (was net). Breakdown endpoint still returns both `total_gross` + `total_revenue`(net) and per-group `gross`+`revenue`.
- **Frontend** (`RevenueAnalytics.js`): headline metric switched to gross — KPI "Gross Revenue" (Net shown as sub), bar chart + donut ("Gross Total") + table primary column + share% all use gross; Net kept as secondary table column. Bars restyled: teal→emerald `linearGradient` fill, 6px rounded corners, subtle muted `background` track, and `LabelList` value labels on the breakdown chart; Compare chart uses gradient rounded bars (slate A / teal-emerald B), rounded `cornerRadius` donut.
- **Verified (preview)**: gross headlined on both tabs, bars look polished in light & dark; backend tests `test_iteration_189` pass (13/1 skip); lint clean. data-testids unchanged.
- **⚠️ Action**: redeploy.


- **Request**: Redesign Revenue Analytics with contemporary styling + beautiful charts; seen by investors & whole company — must feel amazing. **Follow-up**: make it seamlessly match the overall app color/font theme and be minimalistic.
- **Final design (theme-matched)**: Rebuilt `/app/frontend/src/pages/RevenueAnalytics.js` using the app's own design system — shadcn `Card`/`Tabs`/`Select`, theme tokens (`bg-card`, `text-foreground`, `text-muted-foreground`, `border-border`, `hsl(var(--border))`, `hsl(var(--muted))`), Inter body + Plus Jakarta Sans headings (`font-heading`), and the app's emerald/teal palette (bars `#0d9488`, donut emerald/teal series, green/rose deltas). Clean white (light) / dark cards, minimal KPI cards with teal/emerald/slate icon chips, compact ₹ axis (K/L/Cr), theme-aware tooltip. Removed the earlier gold/dark-terminal styling and custom Fontshare fonts (reverted index.html).
- **Adapts to both light & dark mode** automatically (verified in both). Same endpoints + same data-testids → functionality identical to the tested version.
- **Verified (preview)**: both tabs render with live data in light AND dark mode; dropdowns work; group-by/time filters refetch; donut center total; MoM compare. Lint clean, no console errors.
- **⚠️ Action**: redeploy to see it in production.


### 2026-05-29 — Bug fix: Account-detail "Invoice Summary" showed no invoices (linkage + timezone) ✅ DONE
- **Reported (PRODUCTION)**: Account-detail "Invoice Summary (This Month)" showed "No invoices found" even though the invoices existed and appeared on the global Invoices page (e.g., accounts ITLU-HYD-A26-002, VARM-HYD-A26-001 / "Varma Steels Pvt Ltd", INV-000818).
- **Root cause**: Invoices synced from Zoho / matched to leads did NOT carry the stable CRM `account_id`/`account_uuid` (`match_invoice_to_lead` set only `lead_uuid`/`ca_lead_id`). The account-detail query's name fallback then failed because the Zoho name format differed from the CRM account name ("Pvt Ltd" vs "Private Limited"). Secondary: the `this_month` window was computed in UTC, not the tenant timezone (IST), which hides current-month invoices near month boundaries (not the cause here, but fixed).
- **User directive**: match invoices to accounts by **Account ID**, never by names (names change).
- **Fixes**:
  - `routes/accounts.py`: new admin endpoint `POST /api/accounts/relink-invoices?dry_run=` — backfills the stable `account_uuid` + `account_id` onto invoices using ID keys (existing account id/uuid → Zoho customer id ↔ account.zoho_contact_id → lead link), with a **one-time normalized-name fallback** (`_norm_company_name`, unique-match only) to BOOTSTRAP the IDs onto legacy invoices. Reports updated / already_linked / unresolved / ambiguous + by-key breakdown. Idempotent.
  - `server.py`: `match_invoice_to_lead` now also stamps `account_uuid`/`account_id` from the lead's linked account (forward-fix). Account-invoices `this_month`/`this_week`/etc. windows now computed in the tenant timezone (default Asia/Kolkata), mirroring server.py:5189.
  - Frontend: `components/InvoiceRelinkTool.jsx` — admin "Relink Invoices to Accounts" card (Preview → Apply) in Tenant Settings → Settings; `accountsAPI.relinkInvoices` in utils/api.js.
- **Verified**: preview end-to-end — a name-mismatched invoice (no CRM id) was invisible on its account page; after relink (matched via `name_normalized`) it became visible and carried the stable IDs. Tests: `tests/test_iteration_191_account_invoices_this_month_tz.py`, `tests/test_iteration_192_relink_invoices.py` (all pass).
- **⚠️ Action for user**: REDEPLOY, then Tenant Settings → Settings → "Relink Invoices to Accounts" → Preview → Apply. Any `unresolved` invoices have no ID/name link and need their Zoho-customer mapping fixed (ties to the duplicate-customer fix).


### 2026-05-29 — Bug fix: Activating an account with a manually-mapped Zoho ID created a DUPLICATE Zoho customer ✅ DONE
- **Problem (PRODUCTION)**: When an account already had a `zoho_contact_id` mapped manually (via "Link Zoho Customer"), activating it should re-sync that contact — but it created a brand-new Zoho Books customer instead.
- **Root cause**: `services/zoho_service.py:upsert_contact()` searched Zoho only by email → then by exact contact_name. When neither matched (the mapped contact's email/name differed from the account's), `existing` stayed `None` and the function fell through to `POST /contacts` (create). It never consulted the account's already-stored `zoho_contact_id`.
- **Fix**: Added a step-0 short-circuit at the top of `upsert_contact` — if `account.zoho_contact_id` is non-empty, set `existing = {contact_id: <mapped_id>}` and skip the email/name search entirely, so the function does a `PUT /contacts/{mapped_id}` (re-sync) and NEVER a create. Email search guarded with `and not existing`. Fix is centralized so all 3 callers (activation + 2 edit/resync paths in `routes/accounts.py`) benefit.
- **Verified**: `/app/backend/tests/test_iteration_190_zoho_mapped_contact_resync.py` (3/3 pass, Zoho HTTP layer mocked): mapped id → single PUT, no POST, no search GET; no-mapped-id + no match → still creates (unchanged); no-mapped-id + email match → updates found contact.
- **⚠️ Action**: this change must be REDEPLOYED to production by the user to take effect there (preview has no live Zoho OAuth connection).


### 2026-05-29 — Revenue Analytics Dashboard (recharts) ✅ DONE
- **Need**: Executives wanted a visual dashboard to slice invoice revenue by dimension and compare months.
- **Backend** (`/app/backend/routes/revenue_analytics.py`, mounted in `routes/__init__.py` WITHOUT prefix → routes live at `/api/reports/*`):
  - `GET /api/reports/revenue-analytics?time_filter=&group_by=&from_date=&to_date=&top_n=` — grouped revenue for one window. `group_by ∈ city | state | territory | business_category | sku`. `time_filter ∈ this_week | last_week | this_month | last_month | this_quarter | this_year | last_year | all_time | custom` (custom requires from/to → 400 otherwise). Returns `{from, to, time_filter, group_by, groups:[{label, revenue(net), gross, count}], raw_group_count, total_revenue, total_gross, total_invoice_count}`. Tail beyond `top_n` (default 15, max 200) rolls into an "Others" bucket.
  - `GET /api/reports/revenue-compare?period_a_year=&period_a_month=&period_b_year=&period_b_month=&group_by=&top_n=` — month-over-month. Returns `{period_a, period_b, delta, delta_pct, rows:[{label, a_revenue, b_revenue, delta, delta_pct}]}`. Invalid month → 422.
  - **Consistency**: uses `get_tenant_db()` (auto tenant-scope) + the same `_gross/_net` readers and invoice→account matching as the Account-Performance report, so `total_revenue` reconciles exactly with that report's net total (verified: ₹66,227 all-time).
- **Frontend** (`/app/frontend/src/pages/RevenueAnalytics.js`, route `/revenue-analytics`): two tabs — **Breakdown** (group-by + time-period filters; Net Revenue / Invoices / Groups stat cards; horizontal bar chart + donut share + ranked table; default = City × This Month) and **Compare Months** (Period A vs B month/year selectors + group-by; two period totals + MoM Change card green/red; paired bar chart + delta table). Built with `recharts`.
- **Permission gating** (per user: "controlled by Tenant settings, Role module access for each role"): new module key `report_revenue_analytics` added to `models/role.py` (`DEFAULT_MODULE_PERMISSIONS` default view:True, `MODULE_CATEGORIES['Reports']`, `MODULE_LABELS`). Sidebar entry under Dashboard → Reports submenu (`DashboardLayout.js`), route guarded by `ProtectedRoute moduleKey="report_revenue_analytics"`, tenant-level toggle added to Tenant Settings → Modules → Dashboard Reports, and a per-role checkbox auto-renders under Tenant Settings → Roles → Reports.
- **Verified**: testing agent iteration 189 — backend 22/22 pytest pass (1 skip), frontend 100% (both tabs, dropdown refetch, custom dates, compare deltas, sidebar nav, tenant/role plumbing). Tests: `/app/backend/tests/test_iteration_189_revenue_analytics.py` (+ `_extra.py`).


### 2026-05-27 — Admin → Batch Genealogy ✅ DONE
- **Need**: FSSAI traceability + product recall scenarios. Pick any production batch, see its full lineage: Origin → Factory warehouse arrivals → Distributor shipments (Stock In) → Inter-warehouse Stock Transfers → Customer Deliveries (Stock Out) → Current resting stock → Mass balance reconciliation.
- **Backend** (`/app/backend/routes/admin_batch_genealogy.py`, mounted at `/api/admin/batches/*`):
  - `GET /search?q&limit` — paginated list of production batches by `batch_code` / `sku_name` (regex-escaped, case-insensitive).
  - `GET /{batch_id}/genealogy` — returns `{batch, timeline, resting_stock, mass_balance}`. Timeline merges & sorts events from `warehouse_transfers`, `distributor_shipment_items`+`distributor_shipments`, `distributor_stock_transfers.items[]`, `distributor_delivery_items`+`distributor_deliveries`. Resting computed batch-aware (factory derived = arrivals − shipments out, distributor read from `distributor_stock` directly since it's batch-keyed). Mass balance surfaces drift = (transferred_to_warehouse − delivered_to_customers) − currently_resting.
  - Admin-only (`CEO`, `Director`, `Admin`, `System Admin`) — distributors and other roles get 403. Tenant-scoped.
- **Frontend** (`/app/frontend/src/pages/BatchGenealogy.js`):
  - Route `/admin/batch-genealogy` → searchable batch picker (debounced 250ms).
  - Route `/admin/batch-genealogy/:batchId` → detail view with batch header card, mass-balance card (Reconciled / Drift badge), gradient-iconed timeline, and resting-stock list per location.
  - Sidebar entry "Batch Genealogy" added under Admin module → Product & SKU group (icon: `Layers`).
- **Verified**: 10/10 backend pytest pass (`tests/test_iteration_178_batch_genealogy.py`); Playwright E2E confirms search → click-through → detail render → back navigation; admin gating verified (Distributor role gets 403 on both endpoints).


### 2026-05-29 — Phase 2 Batch Tracking: Stock IN + Stock OUT ✅ DONE
- **Scope**: Extend batch tracking from Stock Transfers (Phase 1) to `create_shipment` (Stock In) and `create_delivery` (Stock Out). User chose **strict block** validation (consistent with Stock Transfers).
- **Backend** (`/app/backend/models/distributor.py` + `routes/distributors.py`):
  - `ShipmentItemCreate` and `DeliveryItemCreate` now carry optional `batch_id`, `batch_code`.
  - `create_shipment`: when source factory warehouse has `track_batches=True`, every line MUST have `batch_id` — returns HTTP 400 with a friendly list of missing SKU names. Shipment items persist `batch_id` + `batch_code`.
  - `confirm_shipment`: stock check + deduction now keyed on `(sku_id, batch_id)` when source tracks batches — per-batch insufficiency raises 400 with batch_code in the message.
  - `mark_shipment_delivered` + `_apply_stock_on_delivery`: destination `distributor_stock` row is keyed on `(loc, sku, batch_id)`; batched stock and legacy aggregate rows stay cleanly separated.
  - `create_delivery`: when source distributor location has `track_batches=True`, every line MUST have `batch_id`. Delivery items persist `batch_id` + `batch_code`.
  - `complete_delivery`: deducts from the specific batch row (or legacy aggregate when no batch_id).
- **Backend support**: `GET /production/factory-warehouses` now exposes `track_batches` so the Stock In modal can decide whether to show the batch picker without an extra fetch.
- **Frontend** (`/app/frontend/src/pages/DistributorDetail.js` + `components/distributor/{ShipmentsTab,DeliveriesTab}.jsx`):
  - Two new state maps: `shipmentBatchesBySku`, `deliveryBatchesBySku`. Effects fetch the FIFO batch list from `/distributor/stock-transfers/batches-available` whenever a tracked source + an item's SKU is set.
  - Both modals show a per-line **"Batch * FIFO"** dropdown with options `BATCH_CODE — N units · YYYY-MM-DD`, gated on `sourceTracksBatches`. Inline error if no batches available for that SKU at source.
  - Submit payloads now carry `batch_id` and `batch_code` on every item.
  - `addShipmentItem` and `addDeliveryItem` seed `batch_id: ''`, `batch_code: ''`.
- **Verified end-to-end via curl**:
  - **Stock OUT** (Brian Hyderabad location with track_batches=true, batches A=150, B=300): no-batch payload → HTTP 400 ("Warehouse 'Hyderabad' tracks batches — please pick a production batch for…"); valid-batch payload → 200, item persisted with batch metadata, complete-delivery deducted from batch A specifically (150 → 90), batch B untouched.
  - **Stock IN** (Default master factory with track_batches=true, batches BATCH-VERIFY-A=60, B=240): no-batch payload → HTTP 400; valid-batch payload → 200, item persisted, confirm-shipment deducted factory batch A (60 → 36), deliver-shipment created destination `distributor_stock` row carrying `batch_code=BATCH-VERIFY-A-001` qty=24.
- **Test data cleaned up post-verification.**



### 2026-05-29 — Bulk re-link tool for orphan SKU pricing ✅ DONE
- **Need**: Production has hundreds of accounts. Opening each one to manually re-link an orphan SKU pricing row is impractical. Admin asked for a single screen that lists every distinct orphan name once with a dropdown to pick the target SKU and applies the relink across every affected Account / Lead / Sampling Trial in one click.
- **Backend** (`/app/backend/routes/admin_sku_migration.py`):
  - `GET /api/admin/migrations/sku/orphan-pricing` — scans `accounts.sku_pricing[]`, `leads.proposed_sku_pricing[]`, and `sampling_trials.sku_plans[]` in one pass, groups orphan entries (no `sku_id`, stored name not in current `master_skus.sku_name` set) by their stored name. Returns one row per distinct orphan name with `account_rows`, `lead_rows`, `sampling_rows` counts plus sample reference names (up to 5 each). Also returns the full `master_skus` list for the dropdown picker. Tenant-scoped, admin-only.
  - `POST /api/admin/migrations/sku/bulk-relink` — body `{mappings: [{stored_name, target_sku_id}, ...]}`. Walks each of the 3 collections once; for each orphan entry whose stored name matches a mapping (case-insensitive), sets `sku_id` to the target and refreshes the `sku` field to the target SKU's current name. Idempotent. Returns per-mapping counts.
- **Frontend** (`/app/frontend/src/pages/SkuRelinkTool.js`, new):
  - Route `/sku-management/relink` — table of orphans, filter input, per-row target-SKU dropdown, single "Apply re-links" button.
  - Each row shows: warning icon + stored name in highlighted code block, account/lead/sampling row counts, sample reference names, dropdown of all current master SKUs (with category hint).
  - Apply button shows `(N)` of picks, disabled until at least one pick is made, confirm dialog, toast on success, auto-refreshes list.
- **Entry point**: New "Re-link orphans" button next to "Sync SKU names" in SKU Management header (testid `open-relink-tool-btn`).
- **Verified end-to-end**: Seeded 2 orphan rows (1 account, 1 lead) → tool listed them with counts and sample references → applied bulk relink → re-fetch showed 0 orphans → restored test data.



### 2026-05-29 — Architectural fix: Account & Lead SKU Pricing now key on `sku_id` ✅ DONE
- **Real complaint**: After yesterday's "Sync SKU names", the user noticed the SKU pricing rows on Accounts (and the proposed pricing on Leads) STILL showed the old labels and didn't surface in Stock Out dropdowns. Root cause exposed by inspection: `accounts.sku_pricing[]` and `leads.proposed_sku_pricing[]` stored ONLY the SKU name (`sku` field) with **no `sku_id`**. So once the master name changes, those rows are orphans — there's no stable key to join on.
- **Fix #1 — schema upgrade**: Added `sku_id: Optional[str]` to `AccountSKUPricing` (both `routes/accounts.py` and `server.py` model). Lead → Account conversion now carries `sku_id` through.
- **Fix #2 — frontend pickers** (`/app/frontend/src/pages/AccountDetail.js` + `pages/LeadDetail.js`):
  - Both `<Select>`s now key on `sku_id` (option value = `sku.id`, not `sku.sku_name`).
  - `handleSKUChange` writes `sku_id` AND mirrors current `sku_name` to the legacy `sku` field so server-side code that still reads `sku` keeps working.
  - Each row shows the **resolved current name** looked up by `sku_id` (not the stored snapshot). Rows that have a stored name with no `sku_id` AND no matching current SKU are flagged inline with **"⚠ re-link"** — a clear signal to the user that this row was orphaned by a past rename and needs picking from the dropdown again.
- **Fix #3 — extended migration** (`/app/backend/routes/admin_sku_migration.py`): `POST /api/admin/migrations/sku/rehydrate-sku-names` now has a Phase 2 that walks `accounts.sku_pricing[]`, `leads.proposed_sku_pricing[]`, and `sampling_trials.sku_plans[]`. For each row missing a `sku_id`, it matches the stored name against current `master_skus.sku_name` (case-insensitive). On match → backfills `sku_id` AND refreshes the name. On no match → row is listed in `orphans_sample[]` so the admin knows exactly which Account/Lead to open and fix.
- **Fix #4 — auto-rehydration hook extended**: `PUT /master-skus/{id}` now also updates the name in `accounts.sku_pricing[]`, `leads.proposed_sku_pricing[]`, and `sampling_trials.sku_plans[]` for every row whose `sku_id` matches the renamed master.
- **Verified end-to-end in preview**:
  - Dry-run found 39 embedded rows that would be linked (21 accounts + 16 leads + 2 sampling trials).
  - Live run linked all 39. Stored a stable `sku_id` on each.
  - Renamed the test SKU via PUT → both `accounts.sku_pricing[].sku` AND `leads.proposed_sku_pricing[].sku` instantly reflected the new name. Restored.



### 2026-05-29 — Fix: SKU rename leaves stale labels everywhere ✅ DONE
- **Problem (PRODUCTION)**: User renamed SKUs in `master_skus`. Many transactional collections store a denormalised snapshot of `sku_name` at write time. After the rename, stock dashboards, deliveries, returns, transfers, invoices, batches, cost cards and reports all kept showing the old labels even though they were still pointing at the right rows by `sku_id`.
- **Permanent fix #1 — auto-rehydration hook** (`/app/backend/server.py:2095` — `PUT /api/master-skus/{sku_id}`): when `sku_name` changes, walk every denormalised collection (17 of them) and update each item joined by `sku_id`. Future renames are now instant and complete. Failures are logged but don't block the rename.
- **Fix #2 — one-shot migration endpoint** (`/app/backend/routes/admin_sku_migration.py`): `POST /api/admin/migrations/sku/rehydrate-sku-names?dry_run=true|false`. Tenant-scoped, admin-only. Returns a per-collection report of `examined / would_update or updated / unknown_sku_ids`. Idempotent.
- **Fix #3 — one-click admin UI** (`/app/frontend/src/pages/SKUManagement.js`): new "Sync SKU names" button (testid `rehydrate-sku-names-btn`) in the SKU Management header, next to "Add New SKU". Confirms via dialog, calls the migration, toasts the totals.
- **Verified in preview**:
  - Dry-run reported 57 stale snapshots across 10 collections.
  - Live run updated all 57. Re-run = 0 (idempotent).
  - Renaming SKU via PUT /master-skus/{id} immediately rehydrated `factory_warehouse_stock.sku_name` and `distributor_stock_transfers.items[].sku_name`.
- **Affected collections** (17): cost_cards, customer_returns, distributor_billing_config, distributor_delivery_items, distributor_manual_stock_entries, distributor_margin_matrix, distributor_shipment_items, distributor_stock, distributor_stock_transfers, factory_warehouse_stock, invoices, production_batch_deletions, production_batches, qc_routes, rejection_cost_mappings, target_allocations_v2, warehouse_transfers.



### 2026-05-29 — Bug fix #3: ACTUAL root cause — Fleet endpoints crashed (HTTP 500) on legacy string addresses ✅ DONE
- **User-reported symptom**: empty vehicle/driver dropdowns. I'd been chasing the wrong cause for two iterations (null city, then operating coverage). The user shared a browser devtools screenshot showing the endpoint actually returns **HTTP 500**, not an empty list — frontend was rendering the "No active vehicles" fallback because the request failed.
- **Real root cause**: `_get_distributor_city` did `(dist.get("billing_address") or {}).get("city")`. **11 of 17 distributors in this tenant** have `billing_address` stored as a **string** (legacy schema — values like `"afdaf"`, `"Test Address"`, `""`). When the string is truthy, `or {}` returns the string, then `.get("city")` raises `AttributeError: 'str' object has no attribute 'get'` → 500.
- **Fix** (`/app/backend/routes/distributor_delivery_schedules.py`):
  - New `_safe_addr_city()` helper — accepts dict OR string, returns city only when the address is a dict with a string `city` value. Never raises.
  - `_get_distributor_city` rewritten to use `_safe_addr_city()` + an `isinstance(primary, str)` guard on the primary city.
  - `_get_distributor_cities` hardened: skips non-string city values defensively.
  - `_city_match_clause` now uses `re.escape()` on each city before building the regex — defensive against city names with special chars like `"Hyderabad (Sec.)"`.
  - Both `/fleet/vehicles` and `/fleet/drivers` wrapped in `try/except`: on unexpected exception, log full stack trace (`logger.exception`) and return **all active records** for the tenant with a `warning` field so the picker is at least usable instead of returning 500.
- **Verified**: Reproduced the crash in preview by setting Brian's `billing_address = "Plot 123, Bangalore, KA"` (string). Pre-fix code would have crashed with AttributeError. Post-fix returns HTTP 200 with the proper vehicle/driver list.
- **Lesson learned**: When user reports "I don't see X in dropdown", ALWAYS ask for the HTTP response (or browser console) first. Empty-array vs 500 vs auth-failure all look identical to the user but need totally different fixes.



### 2026-05-29 — Bug fix #2: Fleet pickers still empty when distributor uses Operating Coverage ✅ DONE
- **Problem (PRODUCTION)**: After the May 29 fix, user `srinivasarao.yadavilli@nylaairwater.earth` still saw empty Vehicle/Driver dropdowns in **Create Delivery Schedule**, despite vehicles & drivers being registered with `city=Hyderabad`. Root cause: their distributor's primary `city` field is set to their **head-office** city (not Hyderabad). Hyderabad is registered as **Operating Coverage** in the separate `distributor_operating_coverage` collection. The fleet endpoint was only checking `distributor.city` / `billing_address.city` / `registered_address.city` — completely ignoring operating-coverage rows.
- **Fix** (`/app/backend/routes/distributor_delivery_schedules.py`):
  - New helper `_get_distributor_cities()` — returns **every** city the distributor operates in: primary `city` + billing/registered address cities + every `status='active'` row in `distributor_operating_coverage`. De-duplicated, case-folded.
  - `_city_match_clause()` now accepts a list and matches records whose city equals ANY of the provided cities (case-insensitive) OR records with no city assigned.
  - Both `GET /fleet/vehicles` and `GET /fleet/drivers` use the multi-city list. Response shape extended with `cities: [...]` alongside the existing `city` (primary, for backwards-compat label).
- **Verified**: With test distributor "Brian" (primary city=Bangalore, operating coverage=[Gurugram, New Delhi, Noida, Bengaluru, Hyderabad]), the endpoint correctly returns vehicles/drivers from Hyderabad (in coverage) AND records with no city set, while still applying `status=active` and tenant filter. cURL test passed.



### 2026-05-29 — Phase 1 Batch Tracking for Stock Transfers ✅ VERIFIED
- **Goal**: When a distributor warehouse has `track_batches=True`, Stock Transfers from that warehouse must require selecting a specific production batch per line item, deduct stock per-batch (not per-SKU aggregate), and propagate the batch identity to the destination warehouse + Zoho invoice/challan line description.
- **Backend** (`/app/backend/routes/distributor_stock_transfers.py`):
  - `TransferItem` model carries optional `batch_id` + `batch_code`.
  - `_adjust_distributor_stock` / `_adjust_factory_stock` upsert key includes `batch_id` when set, falls back to `{$in:[None]}` for legacy aggregate rows — keeps batched and legacy stock cleanly separated.
  - `_read_source_stock` returns `(sku_id, batch_id)` keys when `batch_ids` is provided so per-batch insufficiency is detected.
  - New endpoint `GET /batches-available?location_id=&sku_id=` returns `{track_batches, batches:[{batch_id, batch_code, quantity, received_at}]}` sorted FIFO (oldest first). Hydrates `batch_code` from `production_batches` if missing on the stock row.
  - `GET /eligible-sources` & `/eligible-targets` expose `track_batches: bool` so the UI can decide.
  - `create_stock_transfer` validates `batch_id` BEFORE the stock check when source tracks batches — returns HTTP 400 with warehouse name + missing SKU names. Stock check runs per (sku, batch).
  - Zoho line description (`services/zoho_service.py:1683,1812`) appends `· Batch {batch_code}` for both Invoice and Delivery Challan flows so the printed document is traceable.
- **Frontend** (`/app/frontend/src/pages/StockTransfers.js`):
  - State carries `batch_id`, `batch_code`, `batches_available`, `batches_loading` per item.
  - `fetchBatchesForItem` calls `/batches-available` when source + SKU are set on a tracked warehouse, auto-selects the FIFO-oldest batch.
  - `sourceTracksBatches` derived from selected source; batch picker UI (`item-batch-${i}` testid) renders only when true.
  - Submit disabled until each item with a tracking source has a `batch_id`.
- **Frontend** (`/app/frontend/src/components/distributor/LocationsTab.jsx`): Location create/edit form has a `track_batches` checkbox so admins can opt-in per warehouse.
- **Verified end-to-end** (29 May 2026): pre-seeded 2 batches at "Default master" (track_batches=true) → `/batches-available` returns both FIFO-sorted; POST without `batch_id` → 400 with helpful error; POST exceeding batch A's stock → 400 'Insufficient stock'; POST with valid `batch_id` → 200, transfer #ST-2026-0009 created, source batch A decremented 120→60, destination receives new factory_warehouse_stock row carrying the same batch_id + batch_code. UI: source dropdown lists tracked factory; after SKU pick, "Batch * FIFO" picker renders with `BATCH_CODE — N bottles · date` options. **Testing agent iteration 177: 7/7 backend tests pass + frontend smoke pass.** Zoho push fails in preview (no OAuth) — expected; production will push normally.
- **Test file**: `/app/backend/tests/test_iteration_177_batch_tracking_and_fleet.py`



### 2026-05-29 — Bug fix: Fleet dropdowns empty in Delivery Schedule ✅ DONE
- **Problem (PRODUCTION)**: Drivers and vehicles added in Admin → Fleet were not appearing in the Delivery Schedule's vehicle/driver picker. Root cause: `GET /api/distributor/delivery-schedules/fleet/{vehicles,drivers}` filtered with a strict `^{distributor.city}$` regex, so any vehicle/driver created without a city (the default state) was excluded.
- **Fix** (`/app/backend/routes/distributor_delivery_schedules.py`): Introduced `_city_match_clause()` — inclusive filter that matches the distributor's city OR records with `city` null/blank/missing. Now vehicles/drivers without a city are treated as "available everywhere", which mirrors the Admin's intent when leaving the optional field empty.
- **UI labels updated** to reflect new semantics: "filtered to {city} or unassigned" instead of "filtered to {city}" (`DeliveryScheduleDetail.js`, `DeliverySchedulesList.js`).
- **Verified**: cURL test with Distributor user `john.distributor@test.com` — both endpoints now return all 2 vehicles + 3 drivers (vs zero before).


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

### 2026-06-05 — Delete Design Request with RBAC ✅ DONE
- Backend: `DELETE /api/marketing-requests/{id}` — admin roles always allowed; other roles need explicit `marketing_requests.delete` permission (`_can_delete_request` looks up role in `db.roles`). Permanently deletes the request and removes all attached files (logo/references/version files) from storage + `marketing_request_files`.
- Frontend: "Delete Request" button in detail header (guarded by new `hasActionPermission('marketing_requests','delete')` in TenantConfigContext) + confirmation dialog. testids: `mr-delete-request-btn`, `delete-request-dialog`, `delete-request-confirm-btn`, `delete-request-cancel-btn`.
- Verified via curl: admin delete 200 → 404; distributor 403. UI screenshot confirms button + dialog.


### 2026-06-06 — Slack notifications include attached Lead ✅ DONE (needs prod redeploy)
- Added `_slack_lead_line(doc)` helper in `marketing_requests.py`; injected into all 3 Slack messages: request created, status change/transition, and new comment (comment projection extended to fetch `lead_name`/`lead_company`).
- Format: `:bust_in_silhouette: Lead: <Company> — <Contact>` (single value when equal/only one present); omitted entirely when no lead attached. Helper logic unit-checked; backend healthy.


### 2026-06-06 — Design Request Types → Admin module + RBAC ✅ DONE (needs prod redeploy)
- Backend `role.py`: moved `marketing_request_types` permission key from "Organization" → "Admin" category; relabeled "Marketing Request Types" → "Design Request Types". Now appears in Tenant Settings → Roles tab (Admin group) with View/Create/Edit/Delete toggles. CEO/Admin have FULL_ACCESS (always on).
- Sidebar: removed the item from Sales/Production/Marketing contexts; kept a single entry in the **Admin** context's Master Data group with `moduleKey: 'marketing_request_types'` so visibility is RBAC-controlled (admins always; other roles need `view`). Removed the "Manage Types" button from the Design Requests list header.
- Page `MarketingRequestTypeMasters.js` guard now: admin role OR `hasActionPermission('marketing_request_types','view')`.
- Verified via `/api/roles` (Admin category, new label) + Roles tab UI (Admin count 3→4). Needs prod redeploy.


### 2026-06-06 — Discoverability: Request Types editor entry points ✅ DONE (needs prod redeploy)
- Added "Design Request Types" (→ `/admin/request-types`, admin-only) directly under "Design Requests" in Sales (Core), Production, and Marketing sidebar contexts — previously only in Admin → Master Data which Sales-module users never saw.
- Added a "Manage Types" button (admin-only) in the Design Requests list header (`mr-manage-types-btn`) so it's reachable from any module context.
- NOTE: production sidebar/route changes require redeploy.


### 2026-06-06 — Design Requests module: mobile & iPad responsive ✅ DONE (needs prod redeploy)
- List (`MarketingRequests.js`): table replaced by stacked cards below `lg` (mobile + iPad portrait) with a mobile "Sort" dropdown; full sortable table on `lg+`. Queue tabs now horizontally scrollable (`no-scrollbar`).
- Request Types admin (`MarketingRequestTypeMasters.js`): card layout below `md`, table on `md+`.
- Added `.no-scrollbar` utility in `index.css`. Detail page + New Request form verified already responsive. Tested at 390px (phone), 820px (iPad portrait), desktop.


### 2026-06-05 — Admin UI: Design Request Types master management ✅ DONE (needs prod redeploy)
- New page `MarketingRequestTypeMasters.js` at `/admin/request-types` (admin-only; CEO/Director/Admin/System Admin). Full CRUD over `marketing_request_types`: add, rename, edit Design/Production lead times, activate/deactivate (Switch), delete custom types (seeded defaults blocked from delete, can be deactivated). Uses existing backend endpoints (GET/POST/PATCH/DELETE /api/marketing-request-types).
- Linked in sidebar under Master Data → "Design Request Types". Verified CRUD via curl + UI screenshot.


### 2026-06-05 — Fix: Marketing request types not visible (resilient masters) ✅ DONE (needs prod redeploy)
- Root cause: `marketing-request-types` (and `master-departments`) list query used exact `is_active: True`, dropping legacy records missing the flag; auto-seed only ran when collection was fully empty so it never restored them.
- Fix: list query now `is_active: {"$ne": False}` (shows all but explicitly-deactivated); `_seed_default_types` is self-healing — re-adds missing default types by name on every GET. Verified preview returns 7 types.
- NOTE: code fix in preview only — user must redeploy to apply to production, then open New Request form once to trigger reseed.


### 2026-06-05 — Design Request: editable Estimated Finished Date ✅ DONE
- Backend: `PATCH /api/marketing-requests/{id}/estimated-date` sets/clears `estimated_finished_date` (ISO validation, 400 on bad input) and logs a `system` audit comment.
- Frontend: inline editable pill in the detail-page hero ("Est. Finish" / "Set est. finish date") with date picker, save/cancel/clear. testids: `mr-est-date-display`, `mr-est-date-input`, `mr-est-date-save`, `mr-est-date-cancel`, `mr-est-date-clear`.
- Verified via curl (set/verify/invalid/clear) + UI screenshot.



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
