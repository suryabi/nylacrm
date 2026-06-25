# Changelog


## 2026-06-24 — Fix: Stock-Out grouped by completion date instead of delivery date ✅ (testing_agent verified, iteration_231, 3/3 pytest)
- **Root cause:** `complete_delivery` (`routes/distributors.py` ~L5037) overwrote `delivery_date` with the completion date (`now[:10]`) whenever the caller didn't pass an explicit date. Since the Stock-Out/Promo tables group by `delivery_date`, a delivery physically done yesterday but marked complete today jumped into Today's group.
- **Fix:** completion now records only `delivered_at` (actual completion timestamp) + status/updated_at, and leaves `delivery_date` untouched unless an explicit `delivery_date` query param is supplied (user's responsibility to correct). Promo complete never had the bug (verified).
- **Verified:** no-arg complete preserves yesterday's delivery_date; explicit override still works; stock deduction + status side-effects intact. Test: `tests/test_complete_delivery_date_preservation.py`.
- ⚠️ Caveat: existing records already completed in production had their `delivery_date` clobbered before this fix — those cannot be auto-recovered; users must correct them manually. Redeploy to apply going forward.

## 2026-06-24 — Per-date subtotal rows in Stock-Out & Promo tables ✅ (testing_agent verified, iteration_230)
- Added a subtotal row at the bottom of each expanded date group: Stock-Out sums deliveries count + Billing/Return Credit/Net Billing/Margin/Billable/Net Billable (`delivery-date-subtotal-{key}`); Promo sums total quantity + Indicative Value + challan count (`promo-date-subtotal-{key}`). Extracted reusable `sumDeliveries()` helper in DeliveriesTab.jsx.


## 2026-06-24 — Fix: Google Maps link not saving (Contacts/Accounts) + styled field ✅ (testing_agent verified, iteration_229, 8/8 pytest)
- **Root cause:** `ContactCreate`/`ContactUpdate` (`routes/contacts.py`) and the account write-path `DeliveryAddress` (`routes/accounts.py` + `models/account.py`) were missing the `maps_link` field. Since write paths use `model_dump()`, Pydantic silently dropped the field → contacts/accounts saved without the link. Fixed by adding `maps_link` to all four models. Promo/DO and Lead (server.py dict passthrough) already persisted it.
- **Verified persistence:** Contact create+update, Account PUT + PATCH /delivery-info, and Lead PUT all round-trip `maps_link` (8/8 pytest in `tests/test_maps_link_persistence.py`).
- **Visual upgrade:** New reusable `components/MapsLinkInput.js` — a distinct sky-tinted card with a navigation/location pin, helper text, inline validation error for bad URLs, and an "Open" button when a valid link is present. Applied across all 5 forms (Lead, Account, Contact, Stock Delivery Request, Promo Stock-Out).
- Backlog note: add light server-side URL validation for `maps_link` (currently frontend-only guard). ⚠️ Redeploy to production to go live.


## 2026-06-24 — Google Maps Link field on addresses + QR uses link first ✅ (testing_agent verified, iteration_228, 8/8 pytest)
- **New "Google Maps Link" field** (pasteable, e.g. `https://maps.app.goo.gl/...`) added to: Lead delivery address (`LeadDeliveryAddressCard.js`), Account delivery address (`AccountDetail.js`), Contact address (`ContactsList.js`), Delivery Order address (`DeliveryOrders.js`), and Promo Stock-Out dialog (`PromoDispatchSection.jsx`). Light Google-Maps-URL validation via new `utils/mapsLink.js` (`isValidMapsLink`).
- **QR priority changed** in delivery bundle + challan PDFs to: **pasted maps link → GPS coords → text-address search** (`build_maps_qr` in `pdf_generator.py`, `_maps_qr_flowable`/`_address_cell`/`_addr_from` in `distributor_delivery_schedules.py`). Bundle stop cell now renders a QR even when only a maps link exists (no longer "ADDRESS MISSING").
- Backend models updated: `PromoDeliveryCreate.maps_link`, DO `DeliveryAddress.maps_link`; `promo_dispatch.py` stores link on dispatch + `recipient_shipping_address`.
- Link stored as-is (no short-link expansion). Tests: `/app/backend/tests/test_maps_link_qr.py` (8/8). ⚠️ Redeploy to production to go live.


## 2026-06-24 — Collapsible date groups + "Bottles vs Crates" PDF fix ✅ (testing_agent verified, iteration_227, 5/5 pytest + UI)
- **Collapsible date grouping UI** (DeliveriesTab.jsx "Stock Out" section + PromoDispatchSection.jsx "Promotional Stock-Out"): date-group header rows are now clickable with a rotating chevron; only the **Today** group is expanded by default (`openDateGroups[group.key] ?? group.isToday`), all others collapsed. Added **Future** / **Past** pill badges (data-testids `delivery-future-pill-*`/`delivery-past-pill-*` and `promo-*`).
- **Backend PDF packaging fix** (`routes/distributor_delivery_schedules.py`): the line-item projections at the bundle-PDF query (~L361) and crate-total aggregation (~L697) did NOT fetch `packaging_type_name`/`units_per_package`, so promo/DO lines (e.g. "Bottle (1)") were silently re-converted to the SKU's default **Crate**. Added the missing projection fields → PDF now shows the line's own packaging (Bottles). Legacy Crate-12 path regression-tested OK.
- Tests: `/app/backend/tests/test_delivery_pdf_packaging.py` (new, 5/5). ⚠️ Redeploy to apply on production.


## 2026-06-24 — Delivery bundle & challans always show address + Google Maps QR ✅ (testing_agent verified, iteration_226, 5/5 pytest)
- **Problem:** The scheduled delivery bundle/driver sheet and delivery challans were missing the customer address + a QR code, especially for promotional stock-outs (direct & DO-created), because the QR only rendered from GPS lat/lng and the bundle's address resolution was account-only.
- **Fix (both surfaces — driver-sheet bundle `_build_schedule_pdf` AND individual challan PDF `generate_delivery_challan_pdf`):**
  - QR now falls back to a Google Maps **search link built from the text address** when no lat/lng — so a scannable QR (and 'Scan for directions') appears whenever any address exists.
  - Address is resolved for **all recipient types** — Account, plus promo recipients Contact/Lead/Employee and DO delivery addresses (`_enrich_schedule` now fetches recipient entities; `_addr_from` reads `address`/`street2`/`zip`).
  - A bold red **"⚠ ADDRESS MISSING"** guard prints when nothing can be resolved (never silently blank); challan endpoint stays HTTP 200 (no crash). QR-render failures are logged, and if a QR can't render the address still prints with a "(map QR unavailable)" note.
- New helper `build_maps_qr()` in `pdf_generator.py`.
- ⚠️ Note: Zoho-synced challans return the Zoho PDF (our QR isn't injected there); the **driver-sheet bundle** carries address+QR per stop regardless, so scheduled runs are always covered. Redeploy to apply on production.



## 2026-06-24 — Fix: DO list now mirrors live promo fulfillment status ✅ (testing_agent verified, iteration_225, 8/8 + frontend)
- **Bug:** Delivery Orders list showed Fulfillment = "Draft" even when the linked Promotional Stock-Out challan was "Confirmed". The live-status mirror only ran on the detail GET, not on the list endpoint, so the stored value (set at place-order time) stayed stale.
- **Fix:** `list_delivery_orders` now batch-looks-up each linked promo's current status from `distributor_deliveries` and reflects + persists it (single `bulk_write`). Detail GET already did this. Lead/account DO sections benefit too (same endpoint).
- ⚠️ Redeploy to apply on production.



## 2026-06-24 — Stock Out & Promo Stock-Out grouped by date (Today/Tomorrow highlighted) ✅ (testing_agent verified, iteration_224, 6/6)
- On Distributor Detail → Stock Out tab, both the regular **Stock Out** table (`DeliveriesTab`) and the **Promotional Stock-Out** table (`PromoDispatchSection`) now group rows by delivery date, ordered **descending**, with date-group header rows.
- **Today** (green) and **Tomorrow** (amber) groups are highlighted with a "Scheduling" badge; other dates show a neutral header with a localized date label + item count.
- New shared helper `frontend/src/utils/dateGrouping.js` (`groupByDateDesc`). All existing columns, totals footer, and row actions remain intact.
- ⚠️ Redeploy to apply on production.



## 2026-06-24 — Fix: promo stock-out "Insufficient stock (available 0)" on batch-tracked warehouses ✅ (testing_agent verified, iteration_223, 3/3 pytest)
- **Bug:** Confirming a promotional stock-out that a Delivery Order auto-created failed with `Insufficient stock for <SKU>: need 1, available 0`, even though the (batch-tracked) warehouse had plenty of stock (e.g. Madapur Warehouse, Hyderabad/Jaitra Wellness distributor). DO-auto-created lines have no `batch_id`, so the confirm validation queried only null-batch stock rows — which are always zero on a batch-tracked warehouse.
- **Fix:** new `_allocate_batches_if_needed` in `promo_dispatch.py` runs at confirm for batch-tracked sources: allocates available batches **FIFO** (production/created date), reservation-aware, splitting a line across batches as needed, and rewrites the delivery's line items with the chosen batches (atomic delete_many + insert_many). Genuine shortfalls now raise the **real** available count, not 0.
- Verified: batchless qty-6 draft → confirms, split into B1:5 + B2:1; over-demand qty-5 (only 2 left after reservation) → 400 "need 5, available 2"; non-batch locations unaffected.
- ⚠️ Production: redeploy to apply. This was a shared-logic bug, so it also affected regular stock-outs created without a batch on batch-tracked warehouses.



## 2026-06-24 — Migrate Free Trial expenses → Delivery Orders + entity DO sections ✅ (testing_agent verified, iteration_222)
- **Migration (admin-triggered, idempotent):** new endpoints `GET/POST /api/admin/migrate-free-trial-expenses[/preview]` convert lead/account **Free Trial** expense requests (the only stock-carrying type, has SKU items) into Delivery Orders. Maps status, defaults delivery date to approval/created date, pulls city/recipient from the linked lead/account, scoped to the current tenant's entities. Sets `migrated_to_delivery_order_id` on the expense and `migrated_from_expense_id` on the DO. Monetary expense types (gifting/onboarding/staff_gifting/sponsorship) are LEFT untouched. An admin-only banner + "Migrate Free Trials" button on the Delivery Orders page lets the user run it on production after deploy.
- **Expense section kept, free_trial removed:** `ExpenseRequestSection` no longer offers the "Free Trial" type, and hides already-migrated free-trial records.
- **Entity Delivery Orders:** `GET /api/delivery-orders` now accepts `lead_id`/`account_id` filters. New `EntityDeliveryOrders` component shows lead/account-specific DOs on the detail pages, with an inline "New" button that opens the Create dialog pre-bound to that lead/account (`CreateOrderDialog` exported + new `presetRecipient` prop).
- ⚠️ Redeploy to apply on production; then click "Migrate Free Trials" on the Delivery Orders page once.



## 2026-06-24 — Delivery Orders: mandatory date + auto Promo Stock-Out on "Place Order" ✅ (testing_agent verified, iteration_221)
- **Mandatory delivery date:** `requested_date` is now required at order creation (Create dialog has a required `do-requested-date` field; backend `create_delivery_order` rejects missing date). Removed the old "set after approval" gating — detail dialog now shows the date read-only.
- **Place Order → auto draft Promo Stock-Out:** transitioning a DO via the `place_order` action auto-creates a **DRAFT** promotional stock-out at the servicing distributor. Resolution priority: (1) existing **Account with an active (primary) distributor assignment** → assigned distributor + location; (2) fallback to **delivery-city coverage** (`distributor_operating_coverage`). New helpers `_resolve_distributor_for_order` / `_pick_distributor_location`; wired in `trigger_transition`.
- **Live status mirror (no SM duplication):** the created promo is linked on the DO (`promo_dispatch_id`, `promo_challan_number`, `promo_distributor_name`) and its live fulfillment status is mirrored read-only on `GET /api/delivery-orders/{id}`. UI shows a `do-fulfillment-block` + `FulfillmentBadge` on the detail dialog and a Fulfillment column in the list. Promo statuses are NOT duplicated into the DO state machine (per design decision).
- **Default DO state machine** updated: added `placed` state + `place_order` action (approved → placed); `mark_fulfilled` now from `placed`. Preview tenant SM patched to match (production managed separately by user).
- Bug fixed during testing: distributor name projection (`distributor_name` vs `name`) so the badge shows the distributor.
- ⚠️ Redeploy to apply on production. Production must also have a `place_order` action configured in its DO state machine.

## 2026-06-24 — State Machines: actions now persist on Save ✅ (testing_agent verified, iteration_220)
- Fixed: the editor's `save()` omitted the `actions` array from the PUT/POST body, so added actions were never saved. Added `actions: editing.actions || []`.



## 2026-06-23 — Delivery Orders: 4 follow-up fixes ✅ (testing_agent verified, iteration_218)
- **City master-match:** Google address city now normalizes to the **Location Master** city (e.g. "Rai Durg / HITEC City" → "Hyderabad") via new `matchMasterCity()` (matches city/aliases against the formatted address; cities loaded from `GET /api/master-locations/flat`). Was showing the sub-locality before.
- **Google map wizard:** added `MapPreview` (keyless `maps.google.com ...output=embed` iframe with a pin) in the create dialog (after address pick) and the order detail, with an **Expand** button → large map dialog + "Open in Google Maps".
- **Delivery date gated:** removed the requested-date field from creation; it's now settable **only after approval** (detail dialog shows an editable date + Save when `state==='approved'`; backend `update_delivery_order` allows only `requested_date` edits in approved state; `requested_date` made Optional).
- **No auto order on approval:** removed the auto-create-draft-promo side-effect from the approve transition (per user). Approval now only changes state (+ manager task on submit); no stock-out is placed automatically.
- ⚠️ Redeploy to apply on production.



## 2026-06-23 — Delivery Orders module (promotional stock-out requests) ✅
- New module accessible from **Sales, Production & Distribution** navs (`/delivery-orders`).
- Create a Delivery Order against ONE of Lead/Account/Contact/Employee; line items = SKU → packaging option (from SKU `packaging_config.promo_stock_out` ↦ falls back to `stock_out`) → quantity → unit/value; requested date; Google-address (lat/lng captured, prefilled from recipient, editable); promo reason; contact info; notes.
- **State-machine lifecycle** (`delivery_orders` workflow registered in WORKFLOW_CATALOG + FIELD_REGISTRY; default seeded by `ensure_default_delivery_order_sm`): Draft → Pending Approval → Approved → Rejected/Cancelled/Fulfilled. Editable in Admin → State Machines.
- **Approval = "both"**: reporting-manager task raised on submit + approve/reject role-gated (CEO/Director/VP/Heads/Admin).
- **On Approval → auto-creates a DRAFT promotional stock-out** for the distributor whose operating coverage includes the delivery city (`_auto_create_draft_promo` via `create_promo_dispatch`, as_draft=True). Best-effort: records `fulfillment_status`/`error`/`promo_id`/`challan_number`; account recipients map to the account's first contact.
- Backend `routes/delivery_orders.py` (CRUD + available-transitions + transition). Frontend `pages/DeliveryOrders.js` (list + create + detail/transitions).
- Verified: backend curl e2e (create→submit→approve auto-created challan DC-… for Goa/Margao) and testing agent iteration_217 (5/6 PASS; the 6th — sidebar nav — was a false negative, confirmed present in the Requests group via DOM check). Test artifacts cleaned up. ⚠️ Redeploy to apply on production.
- **Phase 2 (deferred):** on Approval optionally auto-confirm the promo (deduct stock/invoice) instead of leaving draft; per-module nav grouping polish; recipient address auto-fill from full entity detail.



## 2026-06-22 — Auto-capitalize contact names on save ✅
- Contact names are now title-cased (first letter of each word capitalized, rest preserved) on **create + update** across all flows.
- Lead/Account contacts (`routes/entity_contacts.py`): `first_name`, `last_name` and combined `name` (e.g. "john"/"mcdonald" → "John"/"Mcdonald").
- Contacts section (`routes/contacts.py`): single `name` field (e.g. "jane o'brien smith" → "Jane O'brien Smith").
- Verified via curl on both endpoints. ⚠️ Redeploy to apply on production; applies to newly saved/edited contacts only.



## 2026-06-22 — Reversals Audit Log (unified, admin + per-distributor) ✅
- New read-only audit log of all reversed Stock-Out deliveries AND Promotional Stock-Outs (unified from `distributor_deliveries` incl. `is_promo`, plus legacy `promo_dispatches`).
- Backend `routes/reversals.py`: `GET /api/reversals` (admin-wide, role-gated to distributor admins) and `GET /api/distributors/{id}/reversals` (admin or that distributor's user). Filters: from_date/to_date/type. Returns rows + total + total_value. Reason parsed from delivery remarks ("Reversed: …").
- Frontend reusable `components/reversals/ReversalsLog.jsx` (date-range + type filters, client search, CSV export, summary). Used by new admin page `/admin/reversals` (nav: Admin → Finance & Audit → Reversals Log) and a new "Reversals" tab on the distributor detail page (scoped via `distributorId`).
- Columns: Date reversed · Distributor · Type · Reference # · Account/Recipient · Value · Original status · Stock added back · Reversed by · Reason (+ Zoho-pending flag).
- Verified: backend curl (6 reversals, ₹5,650, distributor names + type filter + per-distributor scope) and admin UI screenshot (table, filters, CSV all render). ⚠️ Redeploy to apply on production.



## 2026-06-22 — Universal Stock-Out (regular delivery) REVERSAL at any stage ✅
- Extended `reverse_delivery` (`routes/distributors.py`) from "not-yet-delivered only" to **any stage** except cancelled/reversed and settlement-locked (blocked with a clear message — user chose option a).
- **Completed/delivered reversal** now adds stock back to the source warehouse via new `_readd_completed_delivery_stock()` (inverse of `complete_delivery`, factory_warehouse_stock or distributor_stock, batch-aware). Always voids the Zoho invoice (best-effort, retry-pending flag) OR deletes the External Billing Entry, undoes the local mirror + account `outstanding_balance`, and reverts applied credit notes. Marks `reversed` with `reversed_from_status`/`stock_readded` for audit.
- **Double-confirm:** draft reverses immediately (no prompt); non-draft requires server-side `acknowledge=true` (else 400) + a frontend dialog where the user must type **REVERSE** to enable the destructive button (+ optional reason). `DistributorDetail.js`: split `handleReverseDelivery`/`doReverseDelivery`, broadened `canReverse`, new `reverse-delivery-dialog`.
- **Tested:** backend e2e `tests/test_delivery_reverse_any_stage.py` PASS (guard 400, stock 100→110, status reversed). Frontend testing agent iteration_216 — all 4 behaviors PASS (draft no-prompt, non-draft type-REVERSE gating, reversed/cancelled hide action). ⚠️ Redeploy to apply on production.



## 2026-06-22 — Revenue Analytics theme aligned with app (light) ✅
- Reworked `pages/RevenueAnalytics.js` from a dark/neon glass theme (cyan/magenta glows, `bg-[#080B1F]`, white-on-dark) to the app's light design system: white cards with `border-slate-200`/soft shadows, slate text, emerald/teal accents, dotted `from-slate-50 via-white to-emerald-50/30` page background, emerald active tabs.
- Updated chart palette (`CHART`/`DONUT`) and gradients to emerald/teal/sky/violet, light grid lines, slate axes/tooltips; removed neon glow filters and text-shadows. KPI tiles now use gradient emerald/teal icon tiles. All logic, data-testids, and structure unchanged.
- Verified via screenshots (Breakdown + Compare Months tabs) — consistent with the rest of the CRM. ⚠️ Redeploy to apply on production.



## 2026-06-22 — FIX (P0, production): Promo Stock-Out false "Insufficient stock" for single-location distributors ✅
- **Reported (PRODUCTION, Goa "Pickval" distributor):** Promotional Stock-Out blocked "Insufficient stock for Nyla 660ml Silver: need 1, available -720 (-720 on-hand)" while the Stock-by-SKU dashboard showed 2,748 available.
- **Root cause:** The promo guard (`routes/promo_dispatch.py`) computed on-hand by summing `distributor_stock` rows scoped to the location. For legacy single-location distributors those rows are missing/negative (e.g. -720), whereas the dashboard derives on-hand distributor-wide from received−delivered. The earlier fix was applied only to the regular `create_delivery` path, NOT the promo create/confirm paths.
- **Fix:** Added shared helper `_derived_on_hand_by_sku()` mirroring `create_delivery`'s dashboard-consistent derivation (received − delivered; distributor-wide when single-location). Both the promo **create** and **confirm** guards now use `max(distributor_stock_rows, derived)` for non-factory, non-batch sources, so the guard never disagrees with the dashboard. Factory/batch sources unchanged.
- **Tested:** `tests/test_promo_derived_on_hand.py` — seeds a single-location distributor with legacy shipments/deliveries lacking `distributor_location_id` + a stale -720 stock row → derived returns 2,748 (matches dashboard), guard passes. PASS. ⚠️ Redeploy required to apply on production.



## 2026-06-22 — Design Request detail: city ribbon + per-city color (VERIFIED) ✅
- Confirmed the color-coded 3-letter city ribbon renders on the Design Request **detail** hero (not just Kanban). `MarketingRequestDetail.js` shows the diagonal corner ribbon using `created_by_city` + `created_by_city_color`.
- Backend `_enrich_requestor_city` populates city/color on BOTH list and detail (`GET /{request_id}`) endpoints from the user's city + `master_cities.color`.
- Verified via screenshot on MR-2026-0021: ribbon shows "HYD" in the city's assigned color (#7c3aed). The prior fork's "detail ribbon present: False" was a false negative (test request had no city) — no code change required.



## 2026-06-22 — Design Request tiles: requestor-city corner ribbon ✅
- Added a diagonal corner ribbon to the top-left of each Design Request (marketing request) Kanban tile showing the **city of the requestor**. Cards get extra top padding so content clears the ribbon.
- Backend: the requests list now returns `created_by_city` (batch user lookup), so existing requests get it too without a migration.
- Verified via screenshot: ribbons render with "HYDERABAD" across all tiles.


## 2026-06-22 — FIX (serious): promo stock-out "insufficient stock" for single-location distributors ✅
- Bug: For a single-location ("not self-managed") distributor like Goa, the stock-out/promo-stock-out guard scoped its derived on-hand (received − delivered) by `distributor_location_id`. Legacy delivered shipments often have no `distributor_location_id`, so the location-scoped "received" tallied **0** while location-scoped "delivered" matched — driving on-hand negative (e.g. −720) and falsely blocking with "insufficient stock", even though the distributor dashboard (which is distributor-wide) showed thousands available.
- Fix (`routes/distributors.py` `create_delivery`): when a distributor has a single non-factory location, the derived received/delivered view is computed **distributor-wide** (matching the dashboard) instead of location-scoped. Multi-location distributors keep location-scoped behavior (no change).
- Verified with a seeded single-location scenario: old logic gave −852 (false block); fix gives 2,748 (= received 3,600 − delivered 852), matching the dashboard. Backend healthy (200).


## 2026-06-22 — Proposal template: drag-and-drop section reordering ✅
- Added drag-and-drop reordering of proposal template sections via a grip handle, with prominent visual feedback (dragged card dims + teal ring; drop target shows a teal ring + insertion line) so it's intuitive. Kept the existing up/down buttons for accessibility. Added a "Drag the handle to reorder" hint.
- Implemented with native HTML5 DnD (no new dependency); reorder updates local state (user still clicks Save to persist).
- Verified: dragging section #1 onto position #3 reorders correctly and shows "Section moved — remember to Save" (screenshot).


## 2026-06-22 — Account activation: require delivery coordinates + 10-digit delivery phone ✅
- An account can no longer be activated unless its **delivery address has map coordinates (lat/lng)** — captured by selecting the address from Google suggestions — so the delivery team gets accurate directions. Enforced in `activation-status` (the "Delivery address is updated" check now also needs lat/lng) and in the `activate` endpoint (clear failure message). Updated the checklist helper text in the UI.
- **Delivery contact phone** now accepts exactly **10 digits**: the input strips non-digits and caps at 10, shows an inline "Enter exactly 10 digits" hint, disables Save until valid, and the backend `delivery-info` endpoint rejects anything that isn't 10 digits.
- Verified: 9-digit/12-digit phones rejected (400), 10-digit saved; address without coords → activation check False; input strips junk to 10 digits (screenshot).


## 2026-06-21 — Compose email dialog redesign (wider, taller, single-scroll) ✅
- Enlarged the Share/Compose dialog default size (880px × 86vh, responsive caps) for a roomier writing experience.
- Fixed the double-scroll: the message editor now **auto-grows with content** (removed the editor's 320px inner scroll); only the dialog body scrolls. Added a sticky formatting toolbar so it stays visible while scrolling long emails.
- Implemented via a new `autoGrow` prop on `RichEmailEditor` + `.email-quill--grow` CSS, so the Gmail composer's default behavior is unchanged.
- Verified via screenshot: larger dialog, no inner scrollbar, toolbar pinned.


## 2026-06-21 — Deck card parity: version + generated-by + date/time ✅
- The Deck card now mirrors the Proposal: shows "Version N · Generated by {name}" and the created date/time. Backend increments the deck `version` on each regenerate (carried forward before superseding the previous deck); existing decks default to Version 1.
- Verified via screenshot ("Version 1 · Generated by Surya Yadavalli · Jun 21, 2026 8:15 PM").


## 2026-06-21 — Share: template attachments now show in compose (keep/uncheck) ✅
- When an email template is applied in the lead "Share via Email" compose dialog, the template's own CRM document attachments now appear in the Attachments list as removable chips (tagged "Template"), so the user can keep or remove them before sending. The render endpoint already returned these; the composer now surfaces them.
- Verified: applying a template with an attachment adds the chip; it sends via the existing multi-attach endpoint and can be removed with the X.


## 2026-06-21 — Share via Email: restored rich compose dialog + multi-attach ✅
- Reverted the standalone custom share dialog. The lead "Share via Email" now uses the original rich **Compose email** experience (recipient chips for To/Cc/Bcc with suggestions, email templates, RichEmailEditor, channel selector).
- Extended that dialog (gated by a new `leadId` prop on `ShareButton`) with an **Attachments** section: toggle the **approved Proposal** and/or **approved Deck** (either or both) and **Attach from Files & Documents** (reuses `CrmDocumentPicker`). When attachments are chosen it sends via `POST /api/leads/{id}/share-documents`; non-lead shares keep the original `/api/share` behavior unchanged.
- Verified: dialog renders the rich compose UI with the attachments panel (screenshot); multi-attach send works (proposal + file → "Sent 2 document(s)").


## 2026-06-21 — Global "Share via Email" (multi-attach) + Deck review-history parity ✅
- **Deck Review History** now matches the Proposal's (added the review timestamp under each entry).
- **Global Share via Email:** added a single "Share via Email" action in the lead Documents header (removed the per-proposal share button). The dialog lets the user attach any combination of: the **approved Proposal**, the **approved Deck** (PDF), and any files from the **Files & Documents** store (reuses `CrmDocumentPicker`). Recipients/subject/message are prefilled.
- Backend: `POST /api/leads/{lead_id}/share-documents` gathers the selected attachments (proposal base64, deck PDF downloaded from Gamma `export_url` via httpx, documents base64) and sends one Resend email; logs a lead activity. Proposal/Deck must be approved to attach.
- Tested: validation (no attachments → 400), real multi-attach send (proposal attached, email_id returned), `/documents` list available; dialog + Documents header verified via screenshot.


## 2026-06-21 — Feature: unified Documents area (Proposal + Deck) with Deck approval flow ✅
- Moved the **Proposal** card out of the right column to sit **directly under the Interested/Proposed SKUs** card, side-by-side (horizontal on desktop, stacked on mobile) with a new **Deck** card.
- Removed the standalone "Deck" button next to *Edit Lead*. Deck generation now lives inside the Documents area.
- New `DeckSection.jsx`: generates a Gamma deck for the lead, shows a live "Generating…" state with polling, then auto-populates. One active deck per lead (regenerate replaces & resets approval).
- **Deck approval flow** mirrors proposals: on completion it enters *Pending Review* and an approval task is routed to the generator's reporting manager. Approvers (CEO/Director/VP/National Sales Head) can Approve / Request Changes / Reject with comments + review history. View (Gamma web link) and Download (PDF export) available.
- Backend (`routes/gamma.py`): added review fields to `gamma_generations`, one-active-deck supersede on generate, approval-task creation on completion (poll), and `PUT /api/gamma/generations/{id}/review`. Added `ApprovalType.DECK` in server.py.
- Tested: deck list/poll, role-gated review (403 for non-approvers, 404 for missing), full approve flow (status→approved, comment recorded). Layout verified via screenshot. NOTE: live Gamma generation requires the tenant's Gamma API key.


## 2026-06-21 — Fix: proposal pricing table rendered in a different font ✅
- User report: with the whole template set to Helvetica, the pricing table still showed a different typeface.
- Two causes: (1) the ₹ (U+20B9) symbol doesn't exist in standard PDF fonts, forcing every price to fall back to DejaVu; (2) section fonts default to the legacy `"dejavu"` key, so a pricing section left on its default rendered in DejaVu even when the title/prose were Helvetica.
- Fix (`services/proposal_pdf.py`): (a) prices are now formatted as plain ASCII **"INR 1,200"** instead of ₹, so they render in the chosen font for every typeface — no glyph fallback ever. (b) Added `_secfont()`: any section whose font is unset or on the legacy `"dejavu"` default now **inherits the document's title font**, so the whole proposal stays in ONE typeface. Title/header/footer base font also defaults to Helvetica instead of DejaVu. Explicit per-section font choices (e.g. Poppins) are still honored.
- Verified with pdfplumber: a Helvetica template with a dejavu/unset pricing section now renders 100% Helvetica with "INR" prices; a Poppins template renders 100% Poppins. Live generate + preview return 200.


## 2026-06-21 — Fix: proposal PDF still showed 2 fonts (₹ prices fell back to DejaVu) ✅
- Root cause: an all-Helvetica template still rendered price amounts in a *different* font because the ₹ (U+20B9) glyph doesn't exist in the standard PDF base fonts (Helvetica/Times/Courier), so every price in the pricing table fell back to DejaVu → two visibly different typefaces.
- Fix (`services/proposal_pdf.py`): made `_rs()` and `_smart_font()` font-aware. Fonts whose embedded TTF actually contains ₹ (DejaVu, Poppins, Montserrat, Lato — detected at load via fontTools) now render ₹ in that same font. Standard base fonts and Roboto Slab (no ₹ glyph) now show "Rs." instead, keeping the whole proposal in ONE typeface. Also registered font *families* (`registerFontFamily`) so `<b>`/`<i>` inside rich text map to the correct bold/italic TTF instead of leaking Helvetica-Bold.
- Verified per-template via pdfplumber: visible text now uses a single consistent font family (helvetica→Helvetica only; poppins→Poppins only; times→Times only). Live generate + preview return 200.


## 2026-06-21 — Refactor: extracted per-lead proposal endpoints + added modern brand fonts ✅
- Moved all 11 `/api/leads/{lead_id}/proposal*` endpoints (get/upload/generate/preview/customization GET-PUT-DELETE/download/delete/review/share-email) out of the 11k-line `server.py` into a dedicated router `routes/lead_proposals.py`. Wired via `routes/__init__.py` with no prefix; paths unchanged. server.py shrank from 11,304 → 10,762 lines. Shared `ALLOWED_PROPOSAL_TYPES` / `MAX_PROPOSAL_SIZE` kept in server.py (reused by Account Contract endpoints). Server-side helpers (`create_approval_task`, `complete_approval_task`, `ApprovalType`, `stamp_pdf_with_signature`) imported lazily inside handlers to avoid circular imports.
- Added 4 modern brand fonts to the proposal PDF generator (Poppins, Montserrat, Lato, Roboto Slab): downloaded static TTFs to `backend/assets/proposal/`, registered in `services/proposal_pdf.py` `FONTS` dict, and exposed in the Proposal Template Settings font dropdown.
- Tested (iteration_215): backend 10/10 pytest pass; all proposal endpoints 200; Poppins/Montserrat/Lato/RobotoSlab confirmed embedding in generated PDFs; frontend dropdown shows all 8 fonts and persists selection. 0 issues.


## 2026-06-21 — Fix: proposal PDF used mixed fonts despite a single chosen font ✅
- Bug (reported from production): generated proposals showed mixed fonts even when the template was set to Helvetica everywhere.
- Root cause: the date line, pricing-table cells, pricing disclaimer, and header/footer text were **hardcoded to DejaVu Sans** regardless of the chosen font. Secondary cause: the unicode-fallback check was too aggressive — it flagged en/em dashes & curly quotes (which standard PDF fonts *can* render), so any line/SKU name with a dash fell back to DejaVu too.
- Fix (`services/proposal_pdf.py`): new `_smart_font(key, text, bold)` returns the chosen font and falls back to DejaVu **only** when text contains glyphs the standard fonts can't encode. `_needs_unicode` now checks **cp1252 (WinAnsi)** — so dashes, curly quotes, bullet, euro, ellipsis stay in the chosen font; only ₹ (and similar) force DejaVu. Applied to date/disclaimer styles (base = title.font), per-cell pricing-table fonts, and header/footer drawing.
- Frontend (`ProposalTemplateSettings.js`): added **"Use this font for the whole proposal"** button (`apply-font-all-btn`) that sets title + every section's heading & body font in one click.
- Verified: testing agent iteration_214 (backend 5/5, frontend apply-all confirmed across all 8 sections) + targeted checks — all-Helvetica template with dashed content/SKU names embeds only Helvetica; ₹ still renders via DejaVu. Default template restored to factory defaults.
- NOTE: user saw this on **production** — must redeploy to apply the fix there.

## 2026-06-21 — Rich-text editors in the proposal template builder ✅
- Replaced the prose text areas with **rich-text (Quill) editors** — bold, italic, underline, strike, color, ordered/bullet lists, links — for the paragraph Text, list Intro, category Intro, and pricing Disclaimer fields. Applies to both the global `/proposal-template` editor and the per-lead Customize Proposal dialog. Structured line-based fields (list Items, Allowed/Not allowed) stay plain.
- Backend: `services/proposal_pdf.py` `rich_to_flowables()` + `_inline_html()`/`_esc()`/`_css_color()` convert Quill HTML → ReportLab flowables (Paragraphs + ListFlowable), honoring inline formatting, colors, paragraphs and lists. Plain-text content (incl. `&`/`<`/`>`) is escaped and stays backward-compatible.
- Frontend: new reusable `components/RichTextField.jsx` (react-quill-new) + `styles/proposal-quill.css`; treats Quill's empty `<p><br></p>` as ''.
- Fixed (from testing iteration_213): react-quill-new (Quill v2) emits bullets as `<ol><li data-list="bullet">`, so the converter now reads each `<li>`'s `data-list` to pick bullets vs numbers, and strips Quill's `<span class="ql-ui">` chrome.
- Verified: testing agent iteration_213 — backend 6/6 (round-trip persistence, rich + plain + empty content all generate valid PDFs, per-lead override), frontend 7 Quill editors render/save/reload in both UIs; plus a follow-up live check confirming Quill-bullet HTML generates correctly. Default template restored to factory defaults.

## 2026-06-21 — Approve/Reject expense requests from the Lead Details page ✅
- Problem: when an Expense Request went to Pending Approval, the designated approver could only act from the Home "Pending Approvals" card — not from the lead itself. Worse, a non-senior approver couldn't even *see* the request on the lead.
- Backend: `GET /api/expense-requests` now returns requests where the user is the **approver** (`approver_id`), not just their own — non-Director approvers can see what they must action (`server.py`).
- Frontend (`ExpenseRequestSection.js`): receives `currentUser`; shows inline **Approve / Reject** buttons in the expense table row for the approver (or senior roles), and a full "You are the approver" panel with Approve / Reject (+ rejection-reason capture) inside the details dialog. Reuses the existing `PUT /api/expense-requests/{id}/approve` endpoint (auth already allows the routed approver or senior roles). `LeadDetail.js` passes the logged-in `user`.
- Verified: non-senior approver visibility proven via DB-backed query simulation (old own-only filter hid it; new filter shows it); UI screenshot confirms inline + dialog Approve/Reject render for a pending request; approve persists (status→approved, approved_by set). Test artifacts cleaned up.

## 2026-06-21 — Multiple named Proposal Templates (presets) + per-lead template picker ✅
- The single shared template is now **multiple named templates** per tenant. On first access the existing template is migrated to **"Default"** and three starter presets — **Hotels, Retail, Events** (clones of Default) — are seeded once (deleting a preset never re-seeds it).
- Settings (`/proposal-template`): a **template switcher** (select + **New / Duplicate / Rename / Set default / Delete**) with a Default badge; load/save and logo upload are now per-template.
- Per-lead **Customize Proposal** dialog: a **Template** dropdown lets reps pick a branded layout for that lead; switching reseeds the editor. Resolution = lead's chosen template if set, else tenant Default ("Both"). The generated proposal stores `template_name`.
- Backend: `services/proposal_pdf.py` — `_ensure_templates` (migrate + one-time seed), `list_templates`/`get_default_template`/`get_template_by_id`/`resolve_template`, `_make_template_doc`/`_content`. `routes/proposals.py` — full CRUD (`GET/POST /templates`, `GET/PUT/DELETE /templates/{id}`, `/duplicate`, `/default`, per-template `/logo`); back-compat `GET /template` returns the default. Lead customization GET/PUT/preview/generate carry `template_id`; DELETE clears override + template choice.
- Fixed a regression: a partial PUT (e.g. colors-only) no longer wipes a template's sections/company/header/footer (route persists only the provided content keys).
- Verified: testing agent iteration_212 — backend 15/15 (incl. the partial-PUT regression test), frontend switcher + dialog flows 100%, no bugs. Templates restored to Default/Hotels/Retail/Events; test lead cleared.
- Tech-debt: PUT replaces whole nested objects (FE always sends full template, so safe); consider Pydantic models for strict per-key validation.


## 2026-06-20 — Proposal Template: section spacing + brand colors + MS-Word-style header/footer ✅
- **Colors**: 9 admin-editable PDF colors (accent/side-bar, section headers, title text, body text, header & footer text, offer price, table grid/borders, table header text, alternate row bg) via color pickers (swatch + hex) on `/proposal-template`. Previously hardcoded in `proposal_pdf.py`; now stored in `template.colors` and applied throughout the PDF.
- **Section spacing**: each section now has `space_before` (pt), `space_after` (pt) and `line_spacing` (× multiplier) controls; honored during PDF build (spacers between sections + leading = size × line_spacing).
- **Header & Footer** (MS-Word style): each has an enable toggle and three zones (left/center/right). Each zone picks a type — none, logo, company name, full company details, address, email, website, CIN, phone, date, page number, or custom text. Page/custom text supports placeholders `{n}`, `{total}`, `{company}`, `{date}`. When `{total}` is used the PDF is built in two passes to compute total pages. Top/bottom margins auto-shrink when header/footer disabled.
- Backend: `services/proposal_pdf.py` — `DEFAULT_COLORS/DEFAULT_HEADER/DEFAULT_FOOTER`, `_norm_hf`, `_draw_zone`/`_zone_lines`/`_draw_logo`, `_needs_total`, rewritten `build_proposal_pdf` (closure `make_story` + `make_doc`, two-pass). Frontend: `ProposalTemplateSettings.js` — `ColorField`, `NumField`, `ZoneEditor`, `HFCard` + the Colors/Header/Footer cards and per-section spacing row.
- Verified: testing agent iteration_210 (per-lead customization 10/10) + iteration_211 (header/footer + spacing backend 7/7, frontend 9/9), plus local PDF builds (two-pass `{total}`, disabled header/footer). Global template restored to defaults after tests.
- Tech-debt (review): proposal endpoints (~10.3k–10.6k in server.py) should move to a dedicated router; `_norm_hf` silently coerces unknown zone types to `none`; PUT /template does a wholesale `$set` (FE always sends the full template, so safe today).


## 2026-06-20 — Per-lead Proposal customization + manual-refresh PDF preview ✅
- Need: edit proposal wording for a *specific* lead before generating (company template stays the source of truth for logo/fonts).
- Backend (`server.py`): new endpoints `GET/PUT/DELETE /api/leads/{id}/proposal/customization` (stores `proposal_override` on the lead) and `POST /api/leads/{id}/proposal/preview` (returns raw `application/pdf`, accepts an unsaved override or falls back to saved/global). `generate` now merges the saved override. `services/proposal_pdf.py` got `merge_override(template, override)` — only title text + section set/order/text come from the override; company/logo/fonts always from the global template.
- Frontend: new `components/ProposalCustomizeDialog.js` — two-pane dialog (left text editor for headings/paragraphs/list items/category/disclaimer + add/remove/reorder sections; right PDF preview iframe). Wired into `LeadDetail.js`: "Generate Proposal" and "Customize & Regenerate" open this dialog; Save persists the per-lead override, Generate saves+generates, Reset reverts to the company template.
- UX refinement (per user feedback): preview is **no longer real-time** — editing marks "Unapplied changes" and the user clicks **Update preview** to refresh. Editor inputs/textareas enlarged to `text-base` for readability.
- Verified: testing agent iteration_210 (backend 10/10, frontend 10/10) + self screenshot of the manual-refresh flow. (Headless screenshots show the blob-PDF iframe blank; renders in real Chrome — validated via POST /preview 200 + %PDF-.)
- Tech-debt noted by review: per-lead overrides snapshot fonts, so later template font changes won't propagate to leads with a saved override; proposal routes should move out of the 11k-line server.py into a dedicated router.


## 2026-06-20 — Dynamic Proposal Template editor + logo upload (P0) ✅
- Backend (already in place, verified): `services/proposal_pdf.py` v2 model — `company` (incl. base64 `logo_data`), `title` {text_template, font, size}, and an ordered `sections[]` array. Each section: `type` (paragraph|list|category|pricing_table|image), `heading`, per-element font+size (heading_font/size, body_font/size), `page_break_before`, plus type-specific fields. Legacy v1 flat templates auto-migrate via `_migrate_legacy`/`_normalize`. Routes: `GET/PUT /api/proposals/template`, `POST/DELETE /api/proposals/template/logo`.
- Frontend: rewrote `pages/ProposalTemplateSettings.js` to the v2 model — logo uploader (upload/preview/remove), title font+size pickers, and a full dynamic Sections builder (add/remove/reorder ▲▼, per-section type select, heading+body font/size selectors, type-specific editors, page-break toggle, per-image upload). Reusable `FontSize` picker (fonts: dejavu/helvetica/times/courier; sizes 8–28pt).
- Verified: curl e2e — template GET returns v2 (8 default sections), PUT persists custom section with times/courier fonts + size 12 and title helvetica/22, lead proposal `generate` → valid `%PDF-` (845KB) rendered from the custom template; defaults restored after. Frontend smoke screenshot: editor renders, Add section works.



## 2026-06-18 — Lead Proposal migrated onto the Sharing Framework + BCC ✅
- The Lead Proposal "Share via Email" now uses the framework `<ShareButton documentType="lead_proposal">` instead of the bespoke dialog → its recipients are now admin-configurable.
- Backend: `lead_proposal` PDF resolver (decodes the stored approved proposal; enforces status=approved) + recipient resolver (To = lead contacts, candidates += account contacts, cc_manager default ON) returning the proposal's `default_subject` ("Nyla Air Water - Proposal for review") + signed `default_message` body. Framework-wide **BCC** added (send + `ShareRequest.bcc` + policy `default_bcc` + plan dedupe across To/Cc/Bcc).
- Frontend: ShareDialog reads server `default_subject`/`default_message`, has a "+ Add Bcc" collapsible Bcc field; admin policy screen now shows a 4th card (Lead Proposal, cc_manager ON) and an "Always Bcc" editor per card.
- Note: the old bespoke proposal dialog code in LeadDetail.js remains but is now unreachable (trigger replaced); can be deleted in a later cleanup.
- Verified: curl (recipients with defaults, real Resend send with To+Bcc, public PDF stream) + testing agent iteration_208 — all 5 e2e cases passed (proposal-specific subject/message prefill, To from lead contacts, Bcc toggle, send, empty-To validation, admin lead_proposal card + Bcc reflected in dialog).


## 2026-06-18 — Document Sharing Phase 1.5: context-aware recipients (To/CC) + admin policy ✅
- **Goal**: per-module recipient resolution — pre-fill To/CC from the *applicable* source, let users add/remove, apply configurable defaults (incl. manager-CC) PER document type. Design: `/app/memory/SHARE_FRAMEWORK_DESIGN.md` (Addendum).
- **Backend**: `services/recipient_providers.py` (composable: lead_contacts, account_contacts, distributor_contacts, delivery_people, reporting_manager, self_recipient). `services/share_service.py` — recipient-resolver registry + doc-type metadata, `resolve_recipient_plan` (merges dynamic To/CC/candidates + tenant policy: default_to/default_cc, **cc_manager per doc type**, locked, dedupe), policy CRUD → `share_recipient_policies`, multi To+CC + content-type-aware email, links store content_type. Resolvers registered for delivery_invoice, stock_transfer_doc, driver_bundle. `routes/sharing.py` — `GET /recipients` returns full plan; `POST /share` takes `to[]`/`cc[]`; admin `GET/PUT /policies` (CEO/Director/Admin).
- **Frontend**: `ShareButton.jsx` To/CC composer (chips removable unless locked, manual add, candidate "List" dropdown, validation). `pages/ShareRecipientSettings.js` (route `/settings/share-recipients`, nav "Sharing Recipients", admin-only) — per-doc-type cards: CC-manager toggle, default-To + locked default-CC editors, Save.
- **Note**: Lead proposals already have a dedicated To/Cc/Bcc + auto-manager-CC dialog (the pattern this generalizes); left as-is to avoid regression, migratable later.
- **Verified**: curl (plan merge, policy persist, manager/self + locked CC, multi To+CC real Resend send) + testing agent iteration_207 — all 5 e2e cases passed. Frontend compiles clean; preview policies reset after test.


## 2026-06-18 — Document Sharing Framework, Phase 1 (signed links + email) ✅
- **Goal**: reusable, app-wide framework to SHARE documents (driver bundles, invoices, delivery challans, stock-transfer docs) to recipients via Email (WhatsApp = Phase 2). Adding sharing to a new screen = one resolver + one `<ShareButton>` drop. Design doc: `/app/memory/SHARE_FRAMEWORK_DESIGN.md`.
- **Backend**:
  - `services/share_service.py`: resolver registry (`register_resolver`/`resolve_document`), short-lived signed links (`share_links`: token, expires_at 7d, max_downloads, download_count, revoked), audit (`share_events`), Resend email channel with PDF attachment + signed link, `build_public_url`.
  - `services/share_resolvers.py`: `delivery_invoice` (delivery's Zoho invoice / promo challan) + `stock_transfer_doc` (transfer's invoice/challan) resolvers.
  - `routes/distributor_delivery_schedules.py`: extracted reusable `build_schedule_bundle_pdf()` (driver sheet + per-stop Zoho docs) and registered the `driver_bundle` resolver.
  - `routes/sharing.py` (mounted `/api/share`): `GET /recipients`, `POST /` (send), `GET /history`, and PUBLIC `GET /d/{token}` (no auth — token is the credential; tenant taken from the link record).
- **Frontend**: reusable `components/share/ShareButton.jsx` (+ ShareDialog) — channel toggle (Email active, WhatsApp disabled "soon"), suggested-recipient chips, name/email/subject/message, Attach-PDF toggle. Wired into Delivery Schedule Detail (driver bundle), Stock Transfers (synced rows), and the Delivery Details modal (delivery invoice).
- **Verified**: backend via curl (recipients, real Resend send w/ provider_message_id, public link streamed a valid PDF with no auth, history). Frontend e2e by testing agent (iteration_206) — Share button + dialog, title/subject prefill, email validation (empty + invalid rejected), successful send, WhatsApp disabled. Stock-transfer/delivery-invoice share buttons gate on Zoho-synced docs (not present in preview; will show in production). No regressions.

## 2026-06-15 — Multi-GSTIN: stock-out invoices use the SOURCE warehouse's Zoho Branch GSTIN (P0 production bug) ✅
- **Bug**: a stock-out from the Delhi warehouse generated a Zoho invoice with the **Hyderabad** GSTIN. Root cause: `create_invoice_for_delivery` never sent a `branch_id`, so Zoho booked every invoice under the org's **primary branch** (Hyderabad). Also, warehouses didn't store a GSTIN or a Zoho-branch link.
- **Fix**:
  - `models/distributor.py`: added `gstin`, `zoho_branch_id`, `zoho_branch_name` to DistributorLocation (create/update/read); persisted by the location create & update endpoints in `routes/distributors.py`.
  - `routes/zoho_books.py`: new `GET /api/zoho/branches` — lists the org's Zoho Books Branches (branch_id, branch_name, gstin, state, place_of_supply) so each warehouse can be mapped to its GSTIN.
  - `services/zoho_service.py → create_invoice_for_delivery`: resolves the delivery's source warehouse (`distributor_location_id`) → its `zoho_branch_id` → sets `invoice_payload["branch_id"]`. If a warehouse has **no branch mapped**, raises new `ZohoBranchNotMappedError` and **blocks the push** (no wrong-GST invoice). Added a no-retry break for it in `sync_delivery_to_zoho`.
  - `routes/distributors.py` retry endpoint now surfaces the **exact** recorded failure reason (e.g. "Warehouse 'Delhi' is not mapped to a Zoho Branch…") instead of a generic message.
  - `components/distributor/LocationsTab.jsx` + `pages/DistributorDetail.js`: warehouse edit form gets a **GST & Zoho Branch** section — "Sync from Zoho" button, branch dropdown (auto-fills GSTIN), and warehouse cards show a "mapped branch" / "No Zoho branch" badge.
- **Recommendation given to user**: maintain GSTIN at the **warehouse** level (GST is state-wise), 1:1 mapped to a Zoho Branch; distributor-level GSTIN kept only as a fallback.
- Verified: model persistence (curl), branches endpoint structure, warehouse form UI renders with sync + dropdown + GSTIN, and 2/2 backend unit tests (`tests/test_zoho_warehouse_branch_gst.py`) — branch_id attached when mapped; push blocked when unmapped.
- ⚠️ The already-wrong Delhi invoice in production must be corrected manually in Zoho (change branch / void + re-push after redeploy + warehouse mapping).


- **Download button** (`FilesDocuments.js`): removed the `opacity-0 group-hover:opacity-100` so it's **always visible** (no hover needed) and made it a larger, labeled "Download" button (was a small hover-only icon). Delete stays as an icon.
- **PDF in-viewer download name**: the preview `<embed>` now points at `${API_URL}/documents/{id}/download` (cookie-authenticated) instead of a `data:` URL. That endpoint already returns `Content-Disposition: inline; filename="<file_name>"`, so the browser/Acrobat toolbar download uses the real document filename instead of "download". Verified: endpoint returns 200 + `filename="Nyla_Stone_Waters-1.pdf"`.
- Verified E2E: 5 doc cards each show the always-visible "Download" button (103×36px); download endpoint authenticates via the session cookie and carries the correct filename header.


- **Bug**: On **Stock In** (Factory → Distributor), the "Avail" / qty cap was read from the aggregate `factory_warehouse_stock` row via `warehouseStock.find(sku)`, which returns only the **first** batch row. With a SKU split across batches (e.g. 36 + 240 units), Avail was stuck at one batch (35 crates) and the user could not stock from the larger batch — it felt like FIFO was being mandated.
- **Requirement (user)**: "User should be able to choose whichever batch he wants. FIFO is only a suggestion, can't be mandated."
- **Fix (frontend only)**:
  - `ShipmentsTab.jsx`: availability now follows the **selected batch** when the source tracks batches (`selBatch.quantity`); before a batch is picked it shows the total across all batches. Batch picker **moved above** the qty row so the user picks the batch first. Added `shipment-avail-*` / `shipment-qty-*` test ids.
  - `BatchPickerCards.jsx`: unit label is now a `unitLabel` prop (default `units`) — factory batches show **units** (bottles), not "crates". Promo Stock-Out passes `unitLabel="crates"`.
  - **Reverted** the earlier mandated FIFO auto-split on Stock Out (`DistributorDetail.handleCreateDelivery` + `DeliveriesTab.jsx`) back to one line per user-selected batch — consistent with "pick any batch, FIFO is only a default". To draw from more stock, pick a batch with enough or add another line.
- Verified E2E: Stock In with Nyla 660ml Sparkling (batches 36 + 240) — Avail = 276 (none selected) → 36 (batch A) → 240 (batch B). Frontend compiles clean.


## 2026-06-14 — Production batch API accepts external SKU id ✅
- `POST /api/production/batches` (external/API-key + internal) now resolves the SKU by **`external_sku_id`** in addition to `sku_id` / `sku_code`. External systems that only know their own SKU identifier can create batches without the internal id — packaging (bottles_per_crate) and QC route are still auto-resolved from the SKU master.
- Added `external_sku_id` to `BatchCreate` (`routes/production_qc.py`), added the resolution branch, and updated the API-key endpoint catalog description (`routes/api_keys.py`).
- Verified end-to-end via a real API key (X-API-Key): created a batch with only `external_sku_id:"B660"` → resolved to "Nyla – 600 ml / Silver" (12/crate, 60 bottles); unknown external id returns a clear 404. Backend-only.


## 2026-06-14 — Approval tasks auto-close on approve/reject (+ self-heal stale ones) ✅
- Confirmed the proposal review endpoint (`PUT /leads/{id}/proposal/review`) already closes the linked approval task via `complete_approval_task` on approve/reject/changes-requested — so deciding a proposal closes the action item (no manual close needed, same as leave requests).
- **Fix**: `GET /approvals/my-pending` (powers the Home "Pending Approvals" widget) now reconciles **proposal** tasks against the proposal's status (it previously only reconciled expense/travel/budget/leave). Any approval task whose underlying request is already decided is now **auto-closed** (`complete_approval_task`) and dropped from the widget — self-healing for stale/lingering items created before the close logic existed.
- Verified via curl: (A) a stale pending proposal task with an already-approved proposal auto-closes on next widget load and disappears; (B) approving a live proposal closes its task. Backend-only; no frontend change.


## 2026-06-14 — "Log to lead timeline" for emails ✅
- On a Lead's embedded email panel (`ContactEmails`), each email now has a **"Log to timeline"** button that saves the email's content (subject, sender, date, body text) as an `email` activity on the lead's Activity Timeline. Button shows a "Logged ✓" state after saving and refreshes the timeline.
- Uses the existing `POST /api/activities` (no backend change). `ContactEmails` now accepts `leadId` + `onLogged`; wired from `LeadDetail.js`. Body HTML is converted to text and truncated (~2000 chars).
- `ActivityTimeline` descriptions now render with `whitespace-pre-wrap` so multi-line email content (and manual notes) keep their line breaks.
- Verified: email activity creation + retrieval via API (line breaks preserved); lead page renders cleanly.


## 2026-06-14 — Distributor portal: multi-facility switching ✅
- A portal user whose email has Portal Access enabled on multiple distributors can now **switch between facilities**. Previously a portal user was bound to a single `distributor_id`, so only one facility was reachable.
- **Backend** (`routes/distributor_portal.py`): `GET /distributor-portal/my-facilities` (derives accessible distributors from `distributor_contacts` where the email has portal access) and `POST /distributor-portal/switch-facility` (validates access, updates the user's active `distributor_id`/`distributor_contact_id`).
- **Frontend** (`components/distributor/FacilitySwitcher.jsx`): a dropdown in the portal sidebar header (near the user name), shown only when the user has 2+ facilities. Switching reloads into the selected facility's Home so all data re-scopes. Wired in `layouts/DashboardLayout.js` for distributor users.
- Verified e2e: my-facilities returned both facilities; switching updated the active facility and the entire dashboard re-scoped (stock/deliveries/settlements) to the new facility.


## 2026-06-13 — Lead/Account contacts: convert-copy, Mr default, combined Name + hover card ✅
- **Copy contacts on conversion**: converting a lead to an account now re-tags the lead's contacts with the new `account_id` (in the live `server.py /accounts/convert-lead`, plus the duplicate/identity-match path), so they appear under the account's Contacts table. Verified e2e (2 contacts copied). Note: there are two convert-lead endpoints; the `server.py` one (registered first) is the live handler.
- **Default salutation = Mr** in the add form on both Lead & Account contact sections.
- **Combined Name column**: First + Last shown together to save space; Email/Phone/Designation cells use ellipsis (truncate + title) so rows don't overlap. Hovering a contact's name opens a **HoverCard** showing the full details (name, designation, email, phone, company).


## 2026-06-13 — Lead/Account multi-contact tables (synced to Contacts module) ✅
- **New section** at the bottom of Lead Detail and Account Detail pages: a "Contacts" table (Salutation, First Name, Last Name, Email, Phone, Designation) with full add/edit/delete. Replaces the old single contact-person/email/phone display on both pages.
- **Synced to Contacts module**: each contact is stored once in the shared `contacts` collection, tagged with `lead_id`/`account_id` + parent `company`, auto-categorised under a new "Lead/Account Contacts" category — so it also appears in the global Contacts list & email recipient picker. First+last are combined into the contacts module `name`.
- **Backend** (`routes/entity_contacts.py`, NEW): `GET/POST/PUT/DELETE /api/leads/{id}/contacts` and `/api/accounts/{id}/contacts`. Update recomputes the combined name. Registered in `routes/__init__.py`.
- **Frontend** (`components/EntityContactsSection.jsx`, NEW): reusable table + add/edit dialog (shadcn Select salutation = Mr/Mrs/Ms/Dr/Prof) + delete confirm; embedded in `LeadDetail.js` and `AccountDetail.js`.
- Verified: backend curl CRUD for both leads+accounts (sync to global contacts confirmed); Lead UI 100% via testing agent; Account UI add/delete self-verified. Also fixed a pre-existing duplicated JSX block at the tail of `AccountDetail.js`.


## 2026-06-13 — Gmail: inline compose/reply + attach from CRM Files & Documents ✅
- **Inline editor**: Compose / Reply / Reply-all are no longer modal dialogs. New shared `components/gmail/InlineComposer.jsx` renders inline — in the right panel of `/mail` for new compose, pinned at the bottom of the conversation for replies, and embedded directly in the lead/contact Email panel (`ContactEmails.js`). Reply uses a read-only recipient; compose uses the full recipient picker.
- **Attach from CRM**: New `components/gmail/CrmDocumentPicker.jsx` — a filterable picker (Category + Subcategory dropdowns + name search, mirroring the Files & Documents page) to attach stored documents to an outgoing email, alongside normal computer uploads. Already-attached docs are disabled to prevent duplicates.
- **Backend** (`routes/gmail.py`): `POST /api/gmail/send` now accepts `crm_document_ids[]`; the server fetches each via the tenant-scoped `documents` store, decodes base64 `file_data`, and merges them into the MIME message together with local uploads (shared 20MB cap). Verified e2e via Gmail API: a send with one CRM PDF + one local file produced both attachments (`crm_attach_test.pdf` + `local.txt`).
- **Note**: Pre-existing documents in the DB have `tenant_id=None`, so they are filtered out by the tenant-scoped `/api/documents` (Files & Documents page + picker show nothing for them). A backfill of these orphaned docs' tenant_id is recommended.
- Minor: removed invalid Quill `bullet` format from `RichEmailEditor.jsx` (was spamming console warnings).


## 2026-06-13 — Gmail: rich-text composer + contacts in recipient picker ✅
- **Rich text editor**: compose now uses a Quill editor (`components/gmail/RichEmailEditor.jsx`, react-quill-new) with bold/italic/underline/strike, ordered+bullet lists, links. Sends `body_html` plus an auto plain-text fallback (`htmlToText`) so emails render rich in all clients. Used in the Mail composer and the lead Email panel.
- **Recipient picker now spans Users + Contacts**: new `GET /api/recipients/search?q=` (gmail.py) merges internal users, the contacts collection, and lead contacts (lead.email/company/contact_person), de-duped by email, each tagged Team vs Contact. `RecipientField.jsx` switched to debounced server-side search with Team/Contact badges. Verified live ("sneha" → 2 Team users + 2 Contact leads with company subtitles).

## 2026-06-13 — Gmail: mark-read on open + internal-user recipient picker ✅
- **Mark as read**: opening a thread in the Mail page (or expanding a message in the contact Email panel) now removes the UNREAD label in Gmail and clears the unread dot locally. New `POST /api/gmail/mark-read` (Gmail batchModify removeLabelIds=UNREAD). Verified live (unread→read).
- **Recipient picker**: new chip-based `components/gmail/RecipientField.jsx` with internal-user autocomplete (name · designation · email, fetched from `/api/users`, cached). Used for To/Cc/Bcc in the Mail composer and Cc/Bcc in the contact Email panel — pick teammates without typing full addresses; still supports free-typed external emails. Verified live ("rah" → Rahul Sharma / Rahul Patel, select → chip).

## 2026-06-13 — Gmail: Cc/Bcc + attachment download & upload ✅
- **Backend** (`routes/gmail.py`): `POST /api/gmail/send` now accepts `cc`, `bcc` and `attachments[]` (base64, 20MB cap; built via EmailMessage.add_attachment → multipart/mixed). New `GET /api/gmail/messages/{id}/attachments/{attachment_id}` streams a single attachment for download.
- **Frontend**: compose dialogs (Mail page + ContactEmails) gained a Cc/Bcc toggle and an "Attach" file picker with chip list/remove. Received-message attachments are now clickable to download (with size). Shared helper `components/gmail/gmailUtils.js` (downloadAttachment, filesToAttachments, humanSize).
- Verified LIVE on a connected account: inbox read, Cc/Bcc fields, attachment download (real 1450B file, HTTP 200). MIME build with cc+attachment unit-tested.

## 2026-06-13 — Gmail integration (per-user OAuth: read, send, contact history) ✅
Brings each user's Google Workspace mailbox into the CRM (no separate Gmail tab needed).
- **Backend** (`backend/routes/gmail.py`, new; registered in `routes/__init__.py`): per-user OAuth 2.0 (authorization-code, `access_type=offline`+`prompt=consent`). Endpoints: `GET /api/gmail/status`, `GET /api/oauth/gmail/login` (returns Google consent URL; redirect_uri derived from the app origin, allow-listed), public `GET /api/oauth/gmail/callback` (state-based user resolution, token exchange, stores per-user tokens in `gmail_tokens`), `POST /api/gmail/disconnect`, `GET /api/gmail/messages` (inbox/search, concurrent metadata via httpx), `GET /api/gmail/messages/{id}`, `GET /api/gmail/threads/{id}`, `GET /api/gmail/contact-emails?email=` (all mail exchanged with a contact), `POST /api/gmail/send` (compose + threaded reply with In-Reply-To/References). Tokens auto-refresh. Scopes: gmail.readonly/send/modify + userinfo. Creds in `.env` as `GMAIL_CLIENT_ID`/`GMAIL_CLIENT_SECRET` (separate from existing Google login/Calendar OAuth client).
- **Frontend**: new `pages/Mail.js` (Inbox: connect screen, list, threaded reader with sandboxed-iframe HTML render, compose/reply, search) at `/mail` + sidebar "Mail" entry (Sales & Marketing contexts). New `components/gmail/ContactEmails.js` embedded on Lead detail (shows emails exchanged with the lead's contact + inline reply/compose).
- Verified: status/login-URL/scopes via curl, protected endpoints return 409 when not connected, Mail connect screen + sidebar render. NOTE: real read/send requires the user to click "Connect Gmail" and grant Google consent (can't be auto-tested).

## 2026-06-13 — Approval routing to reporting manager + Home "Pending Approvals" ✅
Expense / Travel / Budget requests were created as `pending_approval` but **no one was actively notified** and approval was hardcoded to "any Director" (not the requester's manager). Approve endpoints also blocked non-Directors, so even a routed manager got 403.
- **`backend/server.py`**: added `resolve_request_approver()` (reports_to → dotted_line_to → Director/CEO → Admin) + `notify_approver()`. `create_expense_request` / `create_travel_request` / `create_budget_request` now route to a single resolved approver, persist `approver_id`/`approver_name` on the request, create the approval task, and send in-app + email notification. Approve endpoints (expense/travel/budget) now authorize the **designated approver** OR a senior role. Requester gets a decision notification on approve/reject. New `GET /api/approvals/my-pending` returns enriched pending approval tasks assigned to the current user.
- **`frontend/src/components/widgets/PendingApprovalsWidget.jsx`** (new) mounted on Home (`HomeDashboard.js`): auto-hiding card listing items needing the user's action with inline **Approve/Reject** (expense/travel/budget) + reason input, and "Review" deep-links. Verified end-to-end via API (rep→manager→approve) and UI screenshot.

## 2026-06-13 — Design Requests now assignable in Role Management (RBAC) ✅
- **`backend/models/role.py`**: renamed `MODULE_LABELS["marketing_requests"]` to **"Design Requests"** (the module had been renamed in the UI earlier but the RBAC label was missed, so users couldn\'t find it in tenant settings → Roles). Module + permission key unchanged; no migration needed.

## 2026-06-13 — Performance Tracker: lead pickers filter by City AND Resource ✅
- **`frontend/src/pages/PerformanceTracker.js`**: the "Top Leads to Focus" and "Sampling/Trials" lead pickers filtered only by resource (backend `resource_ids`); the active **city filter was ignored**. Passed `cityFilter` into both subsections and filter picker candidates by the lead\'s own `city` (case-insensitive). Verified live (Mumbai resource w/ a Goa lead correctly hidden under city=Mumbai, shown under city=All).

## 2026-06-13 — Marketing team lands on Marketing module after login ✅
- **`frontend/src/context/AppContextContext.js`**: added a `marketing` branch to `setDefaultContext()` (marketing-only users were defaulting to the Sales context).
- **`frontend/src/pages/Login.js`**: post-login redirect now sends marketing-only users to `/marketing-requests` (was always `/home`).
- **`backend/models/user.py`**: `department` typed `Union[str, List[str]]` so `/auth/me` no longer fails for users with list departments. Verified: Marketing user → Design Requests; CEO (Sales+Marketing) → Sales home (no regression).

## 2026-06-12 — Module-group access in Role Management ✅
Made it easy to grant a user role access to a whole area (Marketing / Sales / Production…) without ticking every feature individually.
- **`frontend/src/components/RoleManagement.js`**: each module-group header row now has group-level **View/Create/Edit/Delete** checkboxes (tri-state: all/some/none) that toggle the action across every module in the group, plus a one-click **"Full access" / "Revoke all"** pill, and **Expand all / Collapse all** buttons. Wired the previously-unused `handleToggleAllInCategory`. Frontend-only; uses existing `PUT /api/roles/{id}`.

## 2026-06-12 — Create Production Batch external API ✅
- **`backend/routes/production_qc.py`**: `POST /api/production/batches` now accepts API-key auth (`get_user_or_api_key`); resolves SKU by `sku_id` or `sku_code`, auto-fills `sku_name`/`bottles_per_crate` from the SKU master, blocks QC-bypass for API keys. **`backend/routes/api_keys.py`**: registered `create_production_batch` in the grantable endpoint catalog. **`backend/server.py`**: `GET /api/master-skus` now accepts API keys (SKU discovery). Verified via curl with a real key.

## 2026-06-12 — Shareable public Contact links ✅
Added the ability to share a contact outside the app via a public, revocable link.
- **Backend** (`backend/routes/contacts.py`): `POST /contacts/{id}/share` (enable, stable token), `DELETE /contacts/{id}/share` (revoke), and PUBLIC `GET /contacts/public/{token}` (no auth) returning only whitelisted fields (name, company, designation, phone, email, full address) — notes/card images NOT exposed.
- **Frontend**: new public page `PublicContactCard.js` at route `/c/:token` (digital business card with click-to-call/email + "Open in CRM" deep link). Share button on each contact card + view dialog opens a dialog with copy link, WhatsApp/Email/Open, and revoke. `/contacts?view={id}` deep-link opens the contact in-app.
- Verified via curl (enable/revoke→404/re-enable stable token, field whitelist) and screenshots (public card + share dialog).

## 2026-06-11 — Inventory Management Module · Phase 1 (Masters) ✅
Built the foundation of a new Inventory Management module (greenfield; the old
`Inventory.js`/`Vendors.js` were static mockups and have been replaced).

**Backend** (`backend/routes/inventory_management.py`, `backend/models/inventory.py`, mounted at `/api/inventory`):
- **Item Master** — CRUD. Fields: name, item_code (unique per tenant, case-insensitive), category, description, UoM, min_stock_level, reorder_level, opening_stock, current_stock (=opening on create), is_active, customer-specific link (Lead/Account). Derived `stock_status` (ok/low/critical/out_of_stock).
- **Vendor Master** — CRUD. Fields: vendor_name, contact_person, phone, email, address, GSTIN (format-validated), payment_terms, lead_time_days, is_active.
- **Vendor-Item Pricing** — time-bounded prices per vendor+item with **overlap guard** (only one active price per range), `active-price` resolver by date.
- Cascade deletes (item/vendor → their prices). Denormalised vendor_name kept in sync.

**Frontend**:
- `Inventory.js` → **Item Master** (stats, search/category filter, table, add/edit/delete dialog, customer-specific Lead/Account typeahead linker, per-item Vendor Prices dialog).
- `Vendors.js` → **Vendor Master** (cards, add/edit/delete, GSTIN input).

**RBAC** (`backend/models/role.py`): added `purchase_orders`, `goods_receipt` module keys + labels + a new "Inventory & Procurement" group. Reuses existing `inventory`/`vendors` keys.

**Note:** `inventory`/`vendors`/`purchase_orders`/`goods_receipt` modules were enabled for tenant `nyla-air-water` in the PREVIEW DB. In PRODUCTION the user must enable the "Inventory"/"Vendors" modules via Tenant Settings → Modules after redeploy.

**Testing:** Backend verified via curl (unique code, GSTIN, price-overlap, active-price resolver). UI verified by testing agent — 19/19 flows passed (iteration_202.json).

## 2026-06-14 — Lead/Account contact Category + Distributor form cleanup ✅
- **Lead/Account contacts** (`routes/entity_contacts.py`, `components/EntityContactsSection.jsx`): added a **Category** dropdown to the contact add/edit form with options Owner, Partner, Purchase, Stock, Delivery, Accounts, Management, Third Party. New `category` field persisted on the contact record; shown as a new "Category" column in the contacts table.
- **Distributor contacts** (`routes/distributor_contacts.py`, `components/distributor/ContactsSection.jsx`): removed the Department dropdown that had been added to the wrong form in the prior session; Mobile + Email now share a row again. `department` field removed from ContactCreate/ContactUpdate/doc.
- **Testing:** Backend verified via curl (create category=Purchase → update→Management → list verify → delete). Frontend dialog + Category column verified via screenshot.

## 2026-06-14 — Design Requests: Gantt timeline view + Submitted highlighting ✅
- **Gantt view** (`pages/MarketingRequests.js`, new `RequestGantt` component): List/Gantt toggle (URL-persisted `?view=gantt`). Horizontal timeline with month bands + day axis, sticky left request-label column, bars spanning created_at → requested_due_date colored by current state, a "Today" line, overdue bars ringed red, dashed bars for no-due-date, and a legend. Gantt fetches up to 200 rows (vs 20 for list).
- **Submitted highlighting** (earlier same day): new/initial-state requests get a ⭐ star prefix + amber row highlight; other rows use zebra striping. Initial-state detection driven by state machine `is_initial`.
- Lead/Account contact Category dropdown now also includes "Food & Beverage (F&B)".
- Frontend-only; verified via screenshots.

## 2026-06-14 — Design Requests: Kanban board + priority ordering ✅
- Replaced the Gantt view with a **Kanban board** on the Design Requests page (`MarketingRequests.js` now toggles List / Kanban; removed `RequestGantt`). New `components/marketing/RequestKanban.jsx`.
- Columns = workflow states (colored), cards grouped by `current_state_key` showing priority #, type, request #, due date (overdue in red), assigned team, requester avatar, Tight badge.
- **Team-wide priority ordering** within each column via drag up/down + up/down arrow buttons. Persisted by new backend `POST /api/marketing-requests/board-reorder` (sets `board_rank`); columns sort by board_rank then created_at.
- Cross-column drag is intentionally blocked (status changes happen in List view); shows an info toast.
- Backend: added `no_limit` to the list endpoint so the board loads all matching requests. Verified via curl (reorder persists) + UI round-trip (reload keeps order).

## 2026-06-14 — Distributor Stock Out reservation (reserve → deliver) ✅
- Stock Out orders now RESERVE stock the moment an order is created (any status incl. draft). Reservation is fully DERIVED from open orders (RESERVED_DELIVERY_STATUSES) — no schema change, no backfill; cancel/complete/delete need no extra bookkeeping.
- Model per SKU/location: On-hand (physical, unchanged until delivery), Reserved (committed to open orders), Available = On-hand − Reserved. On completion, on-hand drops and it becomes Delivered/Consumed.
- `create_delivery` now BLOCKS over-allocation against Available (helper `_reserved_qty_map`) for all source types (factory / batch / distributor). `routes/distributors.py`.
- `stock-dashboard` returns stock_on_hand / stock_reserved / stock_available (per-SKU + totals); expanded the "reserved" status set to all open orders.
- Frontend `StockDashboardTab.jsx`: new On-hand / Reserved Stock / Available / Delivered-Consumed cards + relabeled SKU table columns (Reserved, Available).
- Verified by testing agent (iteration_205, 4/4 backend pass + FE smoke); regression test at /app/backend/tests/test_iteration_205_distributor_stock_reservation.py.

## 2026-06-14 — Stock Dashboard units fixed to CRATES ✅
- Root cause: Stock-In shipments & Stock-Out deliveries are ENTERED AND STORED IN CRATES (confirmed in write paths — quantity stored as-typed, no ×pack-size), but the dashboard was dividing them by bottles-per-crate (treating them as bottles), so numbers were wrong wherever a SKU had bpc>1.
- Fix (`routes/distributors.py` get_stock_dashboard): new `_item_crates()` — shipment/delivery/pending line items now display their stored crate value directly (only legacy rows carrying per-item `packaging_units>1` are still converted). Factory-warehouse stock keeps ÷bpc since transfers store BOTTLES (crates × units_per_package).
- Result: Received / Delivered / Reserved / On-hand / Available all show crates consistently. Bonus: Reserved no longer rounds to 0 for small orders.
- Returns / damages / QC / empty bottles intentionally remain in individual bottles (the exception). Returns column bottle-vs-crate display refinement deferred (returns currently still ÷bpc for the at-hand math).
- Verified in preview (cross-checked raw crate sums vs endpoint). NOTE: applies to the Distributor Stock Dashboard; user is on PRODUCTION → must redeploy.

## 2026-06-14 — Per-user email signature with company logo ✅
- New per-user email signature (rich HTML). Backend: GET/PUT /api/gmail/signature (db.email_signatures, per user_id). routes/gmail.py.
- Frontend: "Signature" button on Mail header opens SignatureSettingsDialog (enable toggle + rich editor). New SignatureEditor.jsx has an "Insert company logo" button that embeds the tenant branding logo_url (disabled when no logo configured). Logo imgs normalized to max-width:160px for inbox rendering.
- Auto-append: InlineComposer fetches the signature on mount and appends it (with blank lines above) to new emails AND replies when enabled; user can edit/remove before sending. RichEmailEditor formats now allow 'image' so the logo renders in the composer.
- Verified: backend GET/PUT, dialog UI, and auto-append into composer (preview tenant has no logo so the insert button is disabled there; it works in production where a logo is set).

## 2026-06-14 — Email signature pivoted to ADMIN-controlled template ✅
- Per the user: signature DESIGN is admin/CEO-only; users can't edit. Switched from per-user to ONE tenant-wide template with placeholders ({{name}}, {{title}}, {{phone}}, {{email}}, {{department}}) auto-filled from each sender's profile.
- Backend (routes/gmail.py): db.email_signature_template (per tenant). Admin/CEO-only GET/PUT /api/gmail/signature/template (role in {CEO, System Admin, Admin} else 403). GET /api/gmail/signature now returns the template RESOLVED for the current sender. Added `import re` + `_resolve_signature()`.
- Frontend: removed the per-user "Signature" button/dialog from Mail. New admin section EmailSignatureSettings.jsx added as a "Signature" tab in Tenant Settings (placeholder-insert buttons, logo insert, enable toggle, live preview). SignatureEditor extended with placeholder buttons. Deleted SignatureSettingsDialog.jsx.
- InlineComposer still auto-appends via GET /gmail/signature (now per-sender resolved). Verified: template save/load, resolution for 2 users, non-admin 403, admin UI + live preview.

## 2026-06-15 — Production batch: Total Crates editable after creation ✅
- Total crates was read-only once a batch left "created" status. Now editable at any status.
- Backend (routes/production_qc.py update_batch): recomputes unallocated_crates = new_total − already-moved, and total_bottles; blocks reducing below crates already in QC/allocations (clear 400). Bottles-per-crate stays locked after QC starts (unchanged).
- Frontend (BatchDetail.js edit dialog): crates input unlocked with a "min X in QC" hint; bottles/crate still locked.
- Verified via API (increase→unallocated recomputed; reduce-below-allocated→400; restore) + UI screenshot (crates enabled, bpc disabled).
