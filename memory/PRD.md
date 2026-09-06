# Nyla Air & Water — Multi-Tenant CRM (PRD)

## Original problem statement (verbatim intent)
Production QC tracking, dynamic Distributor & Warehouse configuration, automated settlement generation, detailed reporting. Recent emphasis:
- New Marketing Requests workflow (Sales → Marketing → Delivery/Production) with versioned uploads, lead-time gating, distinct work queues.
- Geo-fenced "I am here" check-ins for Sales Reps.
- Zoho Books full-cycle: gated by Billed-by-Company vs Distributor; CN push deferred until applied to a delivery (India GST compliance).

## Stack
React + FastAPI + MongoDB (multi-tenant). Object storage via Emergent integration. Emergent LLM key for AI features. Zoho Books OAuth integration.

## Test credentials (see /app/memory/test_credentials.md)

### 2026-07-20 — 👍 Emoji reactions on comments & activity log ✅ DONE (self-tested)
- **Scope**: professional set only (👍 👎 ❤️) on: lead comments, account comments, meeting comments (shared thread), and lead Activity Timeline entries.
- **Backend** (`server.py`): `POST /api/reactions/toggle` {entity_type: comment|activity|account_comment|meeting_comment, entity_id, emoji} — toggles current user's reaction, stores `reactions: {emoji: [{user_id, user_name}]}`; emoji whitelist (400 otherwise). Added `reactions` to `Activity` + `Comment` Pydantic models (and `edited_at/edited_by_name` to `Comment` — they were being DROPPED by response_model on reload; bug from earlier edit feature now fixed).
- **Frontend**: new `components/ReactionBar.jsx` (pills w/ counts, emerald highlight for own reaction, grayscale ghost buttons otherwise, tooltip with reactor names; testids `reaction-bar-{id}`, `reaction-up/down/love-{id}`). Wired into `LeadDetail.js` comments, `ActivityTimeline.js` entries, `EntityCommentThread.jsx` (accounts + meetings, entity type derived from basePath).
- **Verified (curl + screenshot)**: toggle/untoggle, persistence in GET responses, invalid emoji 400, all 3 entity paths; UI shows 👍1/❤️1 pills on timeline and click-toggles live.

### 2026-07-20 — 🔁 Promo stock-out failure visibility + Retry (Delivery Orders) ✅ DONE (self-tested)
- **User request**: when placing an order, if the promotional stock-out can't be created, show the error and let the user retry.
- **Backend** (`routes/delivery_orders.py`): place_order transition now PERSISTS failures (`fulfillment_status: "failed"`, `promo_failure_reason`); new `POST /delivery-orders/{id}/retry-promo` (creator or CEO/Director/Admin/System Admin; state must be `placed`; blocked if an active stock-out is already linked) — re-runs `_auto_create_draft_promo`, on success links promo + clears reason, on failure updates the reason. Reverse-placement also clears `promo_failure_reason`.
- **Frontend** (`DeliveryOrders.js`): red banner in detail dialog (`do-promo-failed-block` + `do-promo-failed-reason`) with **Retry** button (`do-retry-promo-btn`); `failed` added to FULFILLMENT_COLORS (red badge in list); reverse-placement button now also allowed when fulfillment=`failed`.
- **Verified (curl + screenshot)**: place with uncovered city → failed + "No distributor covers 'Nowhereville'." persisted; retry while broken → ok:false w/ error; after fixing city → retry succeeds (challan linked, reason cleared); UI banner + Retry render; list shows red `failed` badge. Fixed a stray duplicated JSX tail in DeliveryOrders.js that briefly broke the build (compile-error screen) — resolved.

### 2026-07-20 — 👩 Nyla avatar + welcome message ✅ DONE (screenshot-verified)
- Generated female avatar (`/app/frontend/public/nyla-avatar.png`, flat-vector Indian woman, teal/emerald) — used on the floating launcher button (h-14 ring), panel header, and empty-state; welcome message: "Hi, I am Nyla. How can I help you ?" (`ai-welcome-message`, `ai-launcher-avatar`, `ai-header-avatar` testids in AIAssistant.jsx).

### 2026-07-20 — 🤖 AI Assistant: full-database answering (dynamic Mongo query engine) ✅ DONE (self-tested)
- **Problem**: Ask Nyla only knew keyword-routed subsets (stock/leads/issues…); couldn't answer on the rest of the DB.
- **Solution** (`routes/ai_query_engine.py`, wired into `routes/ai_assistant.py` chat stream):
  1. **Catalog**: every collection with tenant docs + field summary (nested objects expanded 1 level, `list[{keys}]`), cached 10 min per tenant.
  2. **Planner**: LLM (gpt-5.4 via Emergent key) converts the question (+conversation) into ≤4 read-only queries (strict JSON DSL: find w/ filter/projection/sort/limit≤50, or aggregate w/ whitelisted stages $match/$group/$sort/$limit/$project/$unwind/$count/$addFields). Rule: also fetch id→name master mappings so answers show names.
  3. **Executor**: tenant_id forced into every query, blocked collections (users, sessions, tokens, roles, zoho/slack config…), sensitive-field regex stripping (password/token/secret/hash…), 14KB result budget, per-query error capture.
  4. Results injected as "LIVE DATABASE RESULTS" (authoritative; silently prefer over snapshot). SSE `{status}` event → "Querying your data…" shown in chat bubble (AIAssistant.jsx).
- **Verified (curl, answers cross-checked against Mongo)**: delivery orders placed count+value exact (15 / ₹2,630); June-2026 debit total exact (₹13.37L); top expense categories WITH names; design request status histogram; password/session-token probe correctly refused (collections not exposed). UI chat answers live ("16 open issues").
- **2026-07-20 follow-up fix**: user saw old "CRM snapshot" answer on PRODUCTION (old build — needs redeploy; preview verified fine). While reproducing, found+fixed a period-attribution bug: result blocks now include each query's filter/pipeline (`spec=…`) and explicit "0 rows (NO data matches these exact filters)"; planner also runs an all-time variant beside period queries; BASE_SYSTEM instructs matching figures to exact filters. Verified: "Citadel this month" → ₹0 this month + ₹1,500 all-time clearly separated; Toopa invoice total exact (₹62,927.50).
- ⚠️ Notes: first question after 10-min cache expiry pays catalog build (~2-4s). Planner adds one extra LLM round-trip per message (~3-6s) — status indicator covers it.

### 2026-07-20 — ✏️ Edit/Delete comments in Notes sections (Leads, Accounts, +Meetings) ✅ DONE (self-tested)
- **Permission model**: comment author can edit/delete their own; CEO/Admin/System Admin can moderate any (`can_modify_comment` in `utils/entity_comments.py`). Edits stamp `edited_at/edited_by(_name)` and show an "(edited)" marker.
- **Backend**: `PUT/DELETE /api/comments/{comment_id}` (leads, server.py); `PUT/DELETE /api/accounts/{account_id}/comments/{comment_id}` (accounts.py); `PUT/DELETE /api/meeting-minutes/{meeting_id}/comments/{comment_id}` (meeting_minutes.py — added so the shared thread component stays uniform).
- **Frontend**: `EntityCommentThread.jsx` (Accounts + Meetings) — hover Pencil/Trash icons per comment, inline MentionTextarea edit w/ Save/Cancel, confirm-delete. `LeadDetail.js` Comments card — same pattern (testids `edit-comment-{id}`, `delete-comment-{id}`, `edit-comment-input/save/cancel`). `commentsAPI.update/delete` added in utils/api.js.
- **Verified (curl + screenshots)**: lead comment edit (edited_at set) + delete; non-author 403 on both; account comment edit/delete + 403; UI hover icons, inline edit save w/ toast + "(edited)" marker on lead; account thread add + icons render. Test comments cleaned.

### 2026-07-20 — 📄 Duplicate Request (Delivery Orders, Admin/CEO only) ✅ DONE (self-tested)
- **Backend**: `POST /delivery-orders/{id}/duplicate` — roles {CEO, Admin, System Admin}; clones recipient/items/address/reason/instructions into a fresh DRAFT (new order number, reset workflow/promo/approval fields, `duplicated_from_id/_number` audit, history comment "Duplicated from DO-XXXX"); past delivery dates bumped to today+2.
- **Frontend** (`DeliveryOrders.js` DetailDialog): "Duplicate" button (`do-duplicate-btn`, Copy icon) visible for CEO/Admin/System Admin in any state; confirm → toast with new number → list refresh.
- **Verified (curl + screenshot)**: CEO clone → DO-2026-0025 draft w/ bumped date & clean linkage (test row deleted after); non-admin 403; UI button renders alongside Reverse Order Placement.

### 2026-07-20 — ↩️ Reverse Order Placement (Delivery Orders, Admin/CEO only) ✅ DONE (self-tested)
- **User request**: admin option to reverse an order placement (only while status = Order Placed AND linked delivery still draft) → request returns to Approved; reversal cancels the linked promotional stock-out. Only Admins & CEO (Director excluded).
- **Backend** (`routes/delivery_orders.py`): `POST /delivery-orders/{id}/reverse-placement` — roles {CEO, Admin, System Admin}; requires state `placed`; blocks if fulfillment scheduled-or-later or linked promo has progressed past draft (400 with pointer to reverse the stock-out first); cancels a DRAFT promo (audit `cancelled_reason`), clears promo linkage fields + `fulfillment_status`, sets state back to `approved` (SM lookup), stamps `placement_reversed_by/_at`, pushes status_history. Stale/missing promo links handled gracefully.
- **Frontend** (`pages/DeliveryOrders.js` DetailDialog): amber "Reverse Order Placement" button (`do-reverse-placement-btn`) shown only for CEO/Admin/System Admin when state=placed and fulfillment ∈ {none, draft, cancelled}; two-step (optional reason textarea → Confirm Reversal + window.confirm).
- **Verified (curl + screenshot)**: draft-promo reversal cancels DC + returns to Approved w/ note; confirmed-promo 400; re-reverse 400; non-admin (Head of Business) 403; UI button + reason flow render. Note: DO-2026-0006 & DO-2026-0024 were reversed to Approved during testing (preview data). ⚠️ Redeploy for production.

### 2026-07-19 — 📊 Accounting Dashboard (drill-down) + P0 Team-menu fix ✅ DONE (tested 100%, iteration_333)
- **P0 fix — "Team" menu missing in Admin sidebar**: nav code was correct; root cause = CEO role's permissions in `db.roles` were MASS-REVOKED (61/107 modules view=false, likely a prior partial PUT from a test). Repaired: CEO role restored to full access on all 107 modules; Director granted `team`. Verified: Admin sidebar shows Team + Fleet + Product & SKU + Master Data + Settings groups. ⚠️ If this recurs, check `db.roles` CEO permissions — do NOT PUT partial permission objects.
- **New Accounting Dashboard** (`/accounting/dashboard`, nav item at top of Accounting module, moduleKey `accounting_transactions`):
  - Backend (`routes/accounting_transactions.py`): `GET /dashboard` (KPIs w/ prev-period deltas, monthly in/out trend, root expense+income category breakdowns, top vendors/payees, per-bank summary), `GET /dashboard/category-breakdown?tag=&parent_id=` (drill level: immediate children incl. "Directly tagged" bucket, has_children flags), `GET /dashboard/category-transactions?category_id=&tag=` (descendant-inclusive txn list w/ category_name enrichment).
  - Frontend: `pages/AccountingDashboard.js` + `components/accounting/{DashKpis,DashTrendChart,CategoryDrilldown,DashSidePanels}.jsx`, `dashUtils.js`. 5 KPI cards (Money In/Out, Net, Bills Pending, Untagged w/ pulsing `.alert-ring`), recharts trend bars w/ glass tooltip, 3-level drill-down (root → sub → transactions) with breadcrumbs/back + Expenses|Income tabs + donut, top vendors/payees/banks panels. Period switcher: FY (Indian, default) / Qtr / Month / Custom with prev-next arrows.
  - Demo data: `backend/scripts/seed_accounting_demo.py` (idempotent, `demo_seed: true` marker, 534 txns 2025-04 → 2026-07, real master-category tags, 2 demo banks, demo vendors). Production shows real Zoho-synced rows. Purge: `db.accounting_transactions.delete_many({demo_seed: true})`.
  - New CSS utility `.alert-ring` in index.css (pulsing amber ring; the rotating `.alerting-border` overflows small cards — don't reuse it there).
  - Verified: testing_agent iteration_333 — backend 11/11 pytest, frontend 100% (all flows + regressions). ⚠️ Redeploy to see on production.


### 2026-02-08 — Child SKU form: account-first + auto-populated name ✅ DONE
- `ChildSkuManager.js`: reordered the create form so **Type + Customer Account are the first row**, followed by the auto-populated Name + auto-generated Code.
- Selecting an account (or switching to Generic) now auto-fills `Child SKU Name` as `{Parent SKU Name} – {Account Name}` (or `… – Generic`). The value stays editable; manual overrides are preserved and never clobbered.
- Placeholder guides the user to pick an account first (`"Select a customer account above to auto-fill"`). Existing children remain untouched (`applyAutoName` no-ops when editing).

### 2026-07-02 — Bottle Preview: real-size logo scaling + preview-dominant layout ✅ DONE
- `BottlePreview.js`: preview now occupies the left `lg:col-span-8`; controls on right `lg:col-span-4`; page `max-w-7xl`; bottle enlarged.
- Logo sized to real bottle dimensions (body Ø68.6 mm, height 286.4 mm ≈ 80% of the 1600×1361 template height) via `logoBoxWidthPct` — a 35 mm logo ≈ half the body width. `BOTTLE_HEIGHT_FRAC` per template is fine-tunable. Self-tested via screenshot at 35/50 mm.

- surya.yadavalli@nylaairwater.earth / test123 — Tenant: `nyla-air-water` — Role: CEO/Admin

## What's implemented (changelog)
### 2026-07-17 — 🤖 Consolidated "Ask Nyla" assistant (single button) ✅ DONE (tested)
- **User request**: two buttons (Ask Nyla KB widget + AI floating icon) consolidated into one; icon replaced with a labeled control.
- **Frontend**: single pill launcher bottom-right — MessageCircleQuestion icon + "Ask Nyla" text; panel header renamed "Ask Nyla"; empty-state "CRM data or company knowledge base" + KB suggestion chip. `AskNyla.jsx` widget deleted; DashboardLayout renders only `<AIAssistant />`.
- **Backend** (`routes/ai_assistant.py`): new `_ctx_kb` — keyword-overlap retrieval over `kb_documents` (top 3 docs, ~8K char budget) appended to chat context; system prompt renamed to "Nyla", instructs KB citations by title.
- **Verified**: screenshot (labeled launcher, old edge tab gone, panel opens/hides launcher) + streamed KB answer quoting the real "Pricing FAQ" doc.
- Note: old AskNyla widget's module/role gating + feedback buttons were dropped with it; the consolidated assistant is available to all logged-in users.

### 2026-07-15 — 🌐 Global unit contract fix (bottles vs crates) ✅ DONE (tested 100%)
- **User report (production)**: Sample delivery requests (Delivery Orders) are entered in BOTTLES but the auto-created promo stock-out interpreted quantity as CRATES → ×upp inflation (30 bottles → 30 crates = 450 bottles).
- **UOM tripwire (global)**: `_check_unit_consistency` model validator on `ShipmentItemCreate`, `DeliveryItemCreate` (models/distributor.py) and `RequestItem` (stock_transfer_requests.py) — any line carrying both `packages` and a units-per-package factor is rejected (422) unless `quantity == packages × upp`. Legacy payloads without packaging info pass. Verified: unit tests + API 422 + full regression (11/11 pytest).
- **Global contract**: `PromoDeliveryItemCreate.quantity_unit` ('packages' default = legacy promo dialog | 'bottles' = base units). Promo create branches on it in demand validation, totals, and item insertion; non-multiple bottle quantities fall back to loose bottles (upp=1) — inflation is now impossible. DO bridge (`_auto_create_draft_promo`) passes `quantity_unit='bottles'`.
- **UI**: Delivery Order qty input labeled "Qty (bottles)" with live pack hint ("= 2 × Crate - 12 (12/pack)") and amber not-a-multiple warning.
- **Repair tool**: `GET /api/admin/batches/repair-promo-units?apply=` — detects inflated promo lines linked to DOs (quantity == order_qty × upp), corrects bottles/packages/per-bottle price/dispatch totals; **for COMPLETED dispatches it also restores the over-deducted excess to the exact source stock row** (via `_adjust_stock_for_dispatch` sign=+1); draft/confirmed dispatches only reserve stock so item fix = reservation fix; idempotent. Tested: dry-run untouched, apply restores 420 excess (550→970), reserved-only leaves stock alone; regression 5/5.
- **Verified**: testing_agent iteration_332 — backend 5/5 (E2E: DO 24 bottles → promo 24 bottles/2 crates NOT 288; legacy packages regression; loose-bottle safety net; repair smoke), frontend 100%. Regression pytest at `backend/tests/test_do_promo_bottles_unit_contract.py`. Repair tool unit-tested (dry-run/apply/idempotent).

### 2026-07-15 — 🚨 Batch stock integrity fix (phantom 2,250 bottles) ✅ DONE (tested)
- **Bug**: batch B750-050726-101 showed 2,250 in factory stock despite 9,000/9,000 delivered. Root cause chain: (1) retro categorization splits a batch across Generic + branded stock rows; (2) the delivered-deduction targets only the item's classification row and can drive it NEGATIVE (generic misses were silently swallowed — guard only covered branded); (3) the stock dashboard dropped rows with quantity ≤ 0 (`continue`), hiding the negative row and displaying the positive sibling as phantom stock.
- **User challenge**: the affected SKU has NO child SKUs → for that batch the cause is either (a) duplicate rows for the batch (one driven negative — netting/rebalance fixes are classification-AGNOSTIC and cover it) or (b) one delivery's deduction never ran (single row genuinely holds phantom units). Added `GET /api/admin/batches/reconcile-batch-stock?batch_code=&apply=` — evidence-based reconciliation: expected on-hand = warehouse transfers in − confirmed shipments out − completed direct deliveries out ± completed stock transfers, vs actual rows; apply corrects the delta (audited via reconcile_note). Tested with the exact 9,000-in/9,000-out/2,250-phantom scenario (dry-run + apply pass).
- **Fixes**:
  - `distributors.py` stock dashboard: rows netted per (warehouse, sku, batch) BEFORE the >0 filter — phantom batches disappear.
  - `distributors.py` `_deduct_stock_with_spill`: delivery-complete deduction now spills overflow into sibling classification rows (same wh/sku/batch) instead of going negative; legacy negative fallback only when nothing left; anomalies logged; branded revert-guard only fires when nothing could be deducted.
  - `retro_categorization.py` `categorize_delivery_item`: for NOT-yet-delivered deliveries it now moves Generic on-hand → branded bucket (validated availability first) so the later deduction finds the branded row; delivered stays relabel-only.
  - `admin_batch_genealogy.py`: `GET /api/admin/batches/stock-rows?batch_code=` (shows raw rows incl. negatives) and `POST /api/admin/batches/rebalance-negative-stock?apply=true|false&batch_code=` (repairs negative/positive sibling splits, net unchanged, dry-run default). **User must run this in production after redeploy to repair B750-050726-101.**
- **Verified**: python tests (spill, over-deduct fallback, branded-miss guard, repair dry-run+apply) all pass; stock dashboard + endpoints HTTP smoke 200.

### 2026-07-15 — 🧾 Bottle count on Zoho invoice sustainability credit ✅ DONE (tested)
- **User request**: customers want to see how many bottles the return credit covers on the Zoho invoice.
- **Backend** (`services/zoho_service.py`): new `_bottles_for_applied_credit_notes` — resolves each applied CN → its customer return → `total_quantity`, pro-rated by amount on partial applications. Invoice `adjustment_description` now reads "Sustainability Incentive — 10 Bottles Returned (CN-2026-0001)" (falls back to old wording when count can't be resolved).
- **Verified**: helper tested against real CN data (full=10, half-applied=5, unknown CN/empty → 0 with fallback). Needs production redeploy + next invoice push to see it live in Zoho.

### 2026-07-15 — 🚚 Bottle designs in the Delivery/Driver Bundle PDF ✅ DONE (tested)
- **User request**: the Driver Bundle PDF must show each SKU's approved bottle design (full colour, from the account's SKU Details) so the delivery team picks the correct bottle at the warehouse.
- **Backend** (`routes/distributor_delivery_schedules.py`): `_enrich_schedule` items now carry `sku_id`; new `_collect_sku_bottle_designs(schedule, tenant_id)` maps (account_id, sku_id) → design bytes from `sku_pricing[].bottle_design_storage_path` (object storage, failures logged not fatal); `_build_schedule_pdf(schedule, dist, sku_designs)` renders a full-colour RLImage (≤22mm h / ≤30mm w, aspect kept) under each SKU line in the Crates/packages column. Both `/pdf` (driver sheet) and `/bundle-pdf` (bundle page 1) call sites pass designs.
- **Verified**: direct python test — design collected from account row, PDF embeds image (visual check: colour bottle under "24 Brand", plain SKU unaffected); regression on real approved schedule (0 designs) builds fine.

### 2026-07-15 — 🍾 Bottle design moved to SKU rows + "SKU Details" rename ✅ DONE (tested)
- **User request**: revert the account-level Approved Bottle Design upload; instead (1) rename "SKU Pricing" section → "SKU Details", (2) allow uploading the approved bottle design per SKU row (edit mode, alongside price/MRP/active from-to).
- **Reverted**: account-level `bottle_design` routes in server.py, AccountDetail logo-section split, `BottleDesignUploader.js` (deleted).
- **Backend** (`routes/accounts.py`): `AccountSKUPricing` gained `bottle_design_url/_storage_path/_content_type`; new routes `POST/GET/DELETE /api/accounts/{id}/sku-pricing/{sku_id}/bottle-design[-image]` (object storage, arrayFilters update of the matching row; unsaved rows carry fields client-side until pricing save — PUT preserves them).
- **Frontend**: new `components/SkuBottleDesignCell.js` (compact: 10×10 thumbnail w/ fullscreen preview dialog; edit mode Upload/Change + remove, disabled until SKU picked). `AccountDetail.js`: "Bottle Design" column between Bottle Credit and Active From; `handleSkuDesignChange` merges fields into row state; section title now "SKU Details".
- **Verified**: curl (upload → row persisted → stream 200 → PUT roundtrip keeps fields → delete → 404; old account-level route 404) + screenshots (view thumbnail + preview dialog, edit-mode Change/remove controls).

### 2026-07-15 — 📦 Packaging options in Stock Transfer Requests ✅ DONE (tested)
- **User request**: "need to have all the packaging options that are attached to the SKU in the sku management just like in stock out etc" for the new Transfer Request form.
- **Backend** (`routes/stock_transfer_requests.py`): `RequestItem` gained optional `packaging_type_id/packaging_type_name/units_per_package/packages` (units-only payloads still validate — backwards compatible); notification summary shows "SKU × 5 Crate - 12" when packaging present.
- **Frontend** (`pages/StockTransfers.js` `NewRequestDialog`): after SKU pick, packaging dropdown from `packaging_config.stock_out` (default pre-selected, "· default" marker), qty entered in packs with live "= N bottles" hint; payload sends packages + computed quantity_units. Requests list + approve/reject dialog show "SKU × 5 Crate - 12 (60 bottles)". Initiate-Transfer prefill prefers the requester's exact packaging (falls back to default, ceil(units/upp)).
- **Verified**: testing_agent iteration_331 — backend 6/6 pytest (`backend/tests/test_stock_transfer_requests_packaging.py`), frontend 100% (dialog, hint, list format, approve dialog, prefill, direct-transfer regression). Test requests cleaned from DB.
- ⚠️ Env note from testing: CEO role perms for Distribution modules were found revoked in `db.roles` (likely a prior test PUT a partial permissions object); testing agent re-granted them. Consider hardening PUT /api/roles against lowering admin-like role perms.

### 2026-07-15 — 📦 Stock Transfer Requests: request → approval → fulfillment workflow ✅ DONE (tested)
- **Requirement**: other users can request transfers (SKUs + quantities only — no batches/source; warehouse team handles those); approval step; then transfer initiated via existing flow.
- **User decisions**: requester roles granted in Roles & Permissions (new module key `stock_transfer_requests`); requester picks destination only; approvers = anyone who can create stock transfers (`stock_transfers.create` perm, fallback hardcoded transfer roles, admins always); quantities editable at fulfillment; bell notifications both ways.
- **Backend NEW** (`routes/stock_transfer_requests.py`, `/api/stock-transfer-requests`): create (STR-YYYY-NNNN, pending), list (approvers see all, requesters own; pending_count), approve/reject (remark), cancel (requester), `my-permissions`, `mark_request_fulfilled` helper. Notifications via `utils/notify.notify_users`. `distributor_stock_transfers.py`: `StockTransferCreate.request_id` + fail-fast guard (only approved requests) + auto-fulfil link (status fulfilled + transfer_number, notify requester) after transfer insert.
- **Permissions plumbing**: `models/role.py` adds module key (Distribution category, label "Stock Transfer Requests"); `routes/roles.py` list endpoint now ALSO backfills role docs for role names that exist on users but had no roles entry (e.g. Head of Business, Partner - Sales) so admins can grant the permission in settings.
- **Frontend** (`pages/StockTransfers.js`): Transfers | Requests tabs (pending badge, `?tab=requests` deep link), "Request Transfer" dialog (destination + SKU/qty bottles rows + reason), requests table with status badges + Approve/Reject (remark dialog) / Cancel / **Initiate Transfer** (opens NewTransferDialog prefilled: violet fulfilling-request banner, dest pre-set with name shown in trigger, items prefilled in packages, request_id sent on create).
- **Verified**: testing_agent iteration_330 — backend 12/12 pytest (permissions matrix, 403 hint, grant flow, full lifecycle, notifications, fulfil guards), frontend 100% (request→approve→initiate incl. prefill + deep link). Post-test fixes: role-doc backfill (above) + dest name display on prefill. Test data cleaned; `noida.sales3@nylaairwater.earth/test123` (Head of Business) kept active as requester test account with `stock_transfer_requests.create` granted.
- Known minor: duplicate success toast on request submit (cosmetic, sonner) — not fixed yet.

### 2026-07-14 — 🤖 ChatGPT AI integration (Emergent Universal Key, OpenAI gpt-5.4) ✅ DONE (tested)
- **User request**: integrate ChatGPT with (a) AI assistant chat, (b) smart drafting, (c) data insights, (d) lead intelligence — Emergent key.
- **Backend NEW** (`routes/ai_assistant.py`, mounted `/api/ai`, emergentintegrations 0.2.0 streaming API, model openai/gpt-5.4):
  - `POST /chat` (SSE) — multi-turn assistant grounded in tenant CRM data: keyword-routed context injection (stock incl. branded split, shipments, deliveries, transfers, accounts, leads, issues, distributors + always a snapshot); history persisted in `ai_chat_sessions`/`ai_chat_messages`, last 12 messages replayed as transcript. Session CRUD: GET/POST `/sessions`, GET `/sessions/{id}/messages`, DELETE `/sessions/{id}`.
  - `POST /draft` (SSE) — draft_type email|whatsapp|proposal|summary|issue_response for context_type account|lead|issue, with context fetched server-side (account + recent deliveries; lead + activity log; complaint doc) + optional user instructions.
  - `POST /insights` (SSE) — management digest from MTD vs last-month deliveries, top accounts, lead pipeline, stock & open issues (sections: Highlights/Sales/Inventory/Pipeline/Risks).
  - SSE responses use `X-Accel-Buffering: no`; tenant captured before generator (ContextVar-safe). `EMERGENT_LLM_KEY` in backend/.env.
- **Frontend NEW** (`components/ai/`): `aiStream.js` (shared SSE fetch reader), `AIAssistant.jsx` (global bottom-right floating launcher + chat panel with sessions dropdown, suggestion chips, markdown streaming — mounted in `DashboardLayout`), `AIDraftDialog.jsx` (+ exported `AIAssistButton`; used on LeadDetail & AccountDetail headers), `AIInsightsCard.jsx` (bottom of `/dashboard`).
- **Verified**: curl (chat streamed correct counts 13 accounts/17 distributors, multi-turn context answered follow-up, WhatsApp draft used real lead context, insights digest correct MTD numbers) + testing_agent iteration_328 (5/5 frontend: chat + follow-up + session persistence, insights digest, lead draft, account dialog, no new console errors; copy-button clipboard failure is headless-test-env only).
- Note: upgraded `emergentintegrations` 0.1.0 → 0.2.0 (streaming API); requirements.txt refreshed.

### 2026-07-14 — 🎨 Retro categorization UX rework: distributor-scoped + searchable picker ✅ DONE (tested)
- **User feedback v1**: "not user friendly — searchable, autocomplete, clean UX" → cmdk `Command` searchable picker (matches SKU name, account name AND city), options show account + city, auto-select single match as violet chip with X-to-change, line summary card, cleaner qty/split hints.
- **User feedback v2 (correction)**: scope is NOT city — "show the accounts that belong to the destination distributor". `GET /api/retro-categorize/eligible-children` accepts `distributor_id` and filters children to accounts having an ACTIVE `account_distributor_assignments` row for that distributor; returns `distributor_name` + `filtered_by_distributor`. Green badge reads "Accounts of {distributor}". Deliveries stay strictly account-scoped. Callers: shipment passes the page distributor id, transfer passes `dest_distributor_id`.
- **Verified**: curl (distributor-scoped returns only assigned account's child; unscoped returns all) + testing_agent iteration_326 (6/6 picker/search/submit) + iteration_327 (1/1 distributor scoping badge + exclusion of unassigned accounts).

### 2026-07-14 — ✨ Retrospective categorization: Generic transaction lines → customer child SKUs ✅ DONE (tested)
- **Request**: Existing Stock In / Stock Transfer / Stock Out transactions may hold customer-branded stock recorded as parent-SKU Generic. Provide an option to retrospectively categorize quantities into the appropriate customer-specific child SKU, only when such a child exists for the parent SKU (and the delivery's account), preserving original quantities and movement history.
- **User choices**: (1) move whatever Generic stock is still on hand at destination (capped), relabel line fully either way; (2) Stock Out relabels only; (3) partial split allowed; (4) roles CEO/Admin/System Admin.
- **Backend NEW** (`routes/retro_categorization.py`, mounted `/api/retro-categorize`):
  - `GET /eligible-children?sku_id=&account_id=` — active customer-type children (account-scoped for deliveries).
  - `POST /shipment-item`, `POST /delivery-item`, `POST /transfer-item` — relabel or split the line (amounts prorated / recomputed; transaction totals unchanged), stamp `retro_categorized*` audit fields. Delivered Stock In & completed Transfers additionally move Generic on-hand at the DESTINATION into the child bucket (batch-restricted when the line carries a batch, else FIFO across generic rows, capped at available) and write a **Branding Entry** (`source: retro_categorization`) for audit. Guards: only Generic lines, active customer children of the same parent, delivery child must match delivery account, no cancelled/reversed txns, split blocked on receipt-discrepancy shipment lines, qty must be a package multiple when splitting.
- **Frontend NEW** (`components/distributor/RetroCategorizeDialog.jsx`) + hooks:
  - `DistributorDetail.js`: violet "Categorize" button on Generic item rows in the Stock In shipment detail (`retro-categorize-shipment-item-{idx}`) and Stock Out delivery detail (`retro-categorize-delivery-item-{idx}`), shown only for CEO/Admin/System Admin when an eligible child exists (delivery: for that account). Child SKU meta loaded when detail dialogs open.
  - `StockTransfers.js` (route `/distributor/stock-transfers`): per-row "Categorize" button (`retro-categorize-transfer-btn-{id}`) for completed transfers with eligible Generic lines.
  - Dialog: line picker (transfers), child select, qty in packages with split hint, per-type stock-effect explainer.
- **Verified**: backend E2E `/app/test_retro_categorization.py` (18/18: eligible-children scoping, shipment partial split + 120-unit stock move + BRD entry + amounts prorated, re-categorize blocked, wrong-account child blocked, delivery relabel-only, transfer full categorize + FIFO sweep with batch lineage, RBAC 403) + testing_agent iteration_325 (frontend 100%: all 3 flows, gating, no new console errors). UI seed data cleaned after testing.

### 2026-07-14 — 🏷️ Stock In: customer-branded child SKU now visible + carried end-to-end ✅ DONE (tested)
- **Reported**: In Stock In entry, the child SKU batch appeared but the customer-branded child SKU associated with the batch was not visible — user couldn't tell which customer's branded SKU was being sent.
- **Fix (user chose full carry-through, option a)**:
  - `BatchPickerCards.jsx`: batch cards now show a **violet chip with the child SKU name** (branded) or a "Generic" chip when the list mixes classifications; cards keyed by `(batch_id, child_sku_id)`; new `selectedChildId` prop so two rows of the same batch are individually selectable; `onSelect` now passes the full batch object (3rd arg, backward compatible for Stock Out / Promo pickers).
  - `ShipmentsTab.jsx` + `DistributorDetail.js`: picking a branded card stores `child_sku_id`/`child_sku_name` on the shipment item; payload sends them; SKU change clears stale batch/child; **shipment detail dialog** shows `Batch <code>` + violet child badge per item.
  - Backend `models/distributor.py::ShipmentItemCreate` + `routes/distributors.py`: `create_shipment` validates (child belongs to parent SKU) and persists the classification; **confirm** deducts the matching branded factory row (was Generic-only → would fail/corrupt for branded batches); **deliver/acknowledge/approve-receipt refund/reverse** all move the branded row correctly, so distributor stock lands as branded for that customer (keeps "Branded Stock by Customer" report accurate).
  - `distributor_stock_transfers.py::/production-batches` now returns `child_sku_id/child_sku_name` (from batch `target_child_sku_*`) for the dest-only-tracks-batches case.
- **Verified**: backend E2E script `/app/test_stockin_child.py` (6/6: batches-available + production-batches expose child, create carries it, confirm deducts branded row 500→400, deliver credits branded distributor row, reverse restores both) + testing_agent iteration_324 (frontend 100%: chip render, exclusive selection, save, detail badge, Stock Out regression clean).
- Minor known: Radix `aria-describedby` warning on shipment dialogs (a11y-only, pre-existing).

### 2026-07-14 — 🐛 Fix: 500 on create delivery for non-factory, non-batch warehouses ✅ DONE
- `routes/distributors.py` `create_delivery`: the derived on-hand pre-aggregation (used only when the source warehouse is non-factory & non-batch-tracked — e.g. "non self-managed" third-party distributors like Pickval Traders) unpacked `stock_demand.keys()` as 2-tuples after Phase 3 changed the key to a 3-tuple `(sku_id, batch_id, child_sku_id)`. Every stock-out delivery from such a warehouse returned HTTP 500 (`ValueError: too many values to unpack (expected 2)`).
- Fix: switched to index-based access `{k[0] for k in stock_demand.keys() if k[0]}`. Verified via curl: previously 500 → now correctly reaches the margin-matrix check.
- Prod redeploy required.



### 2026-07-11 — 🔐 RBAC unification: all menu items + routes now Role-Management controllable ✅ DONE
- **Backend** (`/app/backend/models/role.py`): added 25 missing module keys to `DEFAULT_MODULE_PERMISSIONS`, `MODULE_LABELS`, and `MODULE_CATEGORIES` — `mail`, `email_templates`, `notification_settings`, `proposal_template`, `fleet_vehicles`, `fleet_drivers`, `batch_genealogy`, `vendor_types`, `reversals_log`, `zoho_integration`, `slack_integration`, `google_drive_integration`, `state_machines`, `notification_templates`, `share_recipients`, `accounting_transactions`, `accounting_masters`, `accounting_income_masters`, `accounting_vendors`, `accounting_employees`, `delivery_orders`, `knowledge_base`, `customer_returns`, `stock_transfers`. Added 6 new categories (Fleet, Integrations, Communication, Presentation, Accounting, Sales Operations Extras). Added an import-time drift-guard assertion so any future label added without a matching permission entry fails fast.
- **Frontend `DashboardLayout.js`**: every navigation item now has a `moduleKey`. No more "orphan" sidebar entries (previously ~15 items — Mail, Vehicles, Drivers, Batch Genealogy, Vendor Types, Reversals Log, Sharing Recipients, all Accounting items, Notification Templates, Proposal Template, Email Templates, Notifications — were invisible to the Role Management UI).
- **Frontend `App.js`**: every `ProtectedRoute` gets its correct `moduleKey`. `ProtectedRoute` now enforces `hasRolePermission(moduleKey)` at the URL level (in addition to the existing tenant-level `isModuleEnabled` check), so URL-jumping to a permission-denied route lands on an Access Denied screen. Distributor role exempt (has its own portal).
- **Backfill** (`/app/backend/routes/roles.py`, unchanged): on every `GET /api/roles` fetch, any new keys are auto-populated into every existing role's permissions dict — Admin/CEO-like roles get full access, non-admin roles get the defaults from `DEFAULT_MODULE_PERMISSIONS`. Existing tenants pick up the new keys transparently.
- Verified end-to-end via testing agent (iteration_318): 107 module_labels, 19 categories (including 6 new), all 5 roles in the Nyla tenant backfilled correctly, all 12 tested admin routes load cleanly for the CEO user, and Role Management UI surfaces every new category with editable toggles.


### 2026-07-10 — 📂 Account Documents section (multi-upload + categories, unified with Files & Documents) ✅ DONE
- New `components/account/AccountDocumentsSection.jsx` on the Account detail page (`data-testid=account-documents-section`), rendered right after the Signed Contract card.
- **Multi-file upload** with a **Category dropdown** whose options come from the Files & Documents categories (`GET /document-categories`). Upload blocked (toast) until a category is chosen.
- **Delete** and **Re-upload** (replace file) per document.
- Uploads are saved into the **global `documents` collection (Files & Documents)** and linked to the account — added `linked_entity_type`/`linked_entity_id` to the `Document` model + `POST /documents/upload`, an entity filter on `GET /documents`, and a new `POST /documents/{id}/reupload` endpoint (`server.py`). Extended `filesAPI` with entity params + `reuploadDocument`.
- The **approved contract** is merged into the list as a read-only row with a "Signed Contract" badge (the existing contract card + approval workflow is untouched).
- Verified: backend CRUD via curl; full frontend E2E via testing agent (iteration_317, 8/8 passed, 100%) — upload/reupload/delete, category dropdown, cross-module persistence on `/files-documents`, and the approved-contract row.


### 2026-07-10 — 🔗 Fix: broken `http:///leads/...` links in notification emails ✅ DONE
- **Root cause**: notification emails embedded a RELATIVE href (`/leads/<id>`), which mail clients resolve to an invalid `http:///leads/<id>` (empty host → "Redirect Notice").
- **Fix**: build ABSOLUTE links. Added `_current_base_url` ContextVar + `set_current_base_url_from_request()` / `get_current_base_url()` / `to_absolute_url()` in `core/tenant.py`; the tenant middleware now captures the public host from the ingress `X-Forwarded-Proto`/`X-Forwarded-Host` headers each request. `utils/notify.py` email builder now uses `to_absolute_url(link)`. This works in BOTH preview and production automatically (uses the actual request host), with `APP_BASE_URL` env as fallback.
- Also routed `services/share_service.build_public_url` through the same resolver so public document-share links are environment-correct too.
- Set `APP_BASE_URL` in preview backend/.env as the non-request fallback. Verified: `/leads/<id>` → `https://<host>/leads/<id>` for both preview host and a simulated production `warehouse-qc-engine.emergent.host` request.


### 2026-07-10 — 🗺️ Share email tweaks: Google Maps link + Admin-dept CC ✅ DONE
- **Google Maps link under Delivery Address** in the Share Details email: uses the delivery address's `maps_link`, else builds a pin from `lat`/`lng`, else a Google Maps search link from the address text. Renders as a clickable "View on Google Maps" (`AccountDetail.js` `buildShareBodyHtml`). Verified in preview.
- **Admin CC now matches by department** (not role): `department` == "Admin" (handles string or list, case-insensitive). NOTE: no users currently have an "Admin" department (depts are Sales/Marketing/Design/Distribution) — pending user decision on how "Admin team" should be defined. Salesperson + reporting manager CC unchanged.
- Confirmed "Nyla Sales Contact" (assigned salesperson name+phone) populates correctly on preview; the user's "empty" report is the older production deploy (Savara account exists only in prod) — needs redeploy.


### 2026-07-10 — 🗑️ Double-confirm delete + auto-share-on-activation + reusable template ✅ DONE
- **Double-confirmation delete (type-to-confirm), restricted to CEO/Admin:**
  - New reusable `components/DeleteConfirmDialog.jsx` — the Delete button stays disabled until the user types the exact entity name (GitHub-style). Test IDs: `delete-confirm-dialog/input/action/cancel`.
  - Wired into **Delete Account** (`AccountDetail.js` header + `AccountsList.js` row) and **Delete Lead** (`LeadsList.js` row; replaced the old single-step AlertDialog).
  - Role gate `canDelete = role ∈ {ceo, admin, system admin}` (case-insensitive) on all three surfaces (LeadsList delete was previously ungated; Account delete was previously CEO/Director → now CEO/Admin).
  - Verified by testing agent: dialog opens, action disabled on empty/wrong text, enabled on exact match, Cancel is non-destructive; throwaway lead fully deleted via the flow.
- **Auto-open Share after Activation** (`AccountDetail.js`): the activation success handler now calls `openShareComposer()` so the Share Details email opens immediately. (Code in place + `openShareComposer` verified; a full activation couldn't be exercised in preview because no seeded account passes the activation checklist.)
- **Reusable "Account Details" Email Template** (`routes/email_templates.py`): `_ensure_system_templates()` idempotently seeds a public, System-owned template (`system_key=account_details`) on GET /email-templates. Extended `_resolve_variables` for account with `account_id, gst_number, pan_number, billing_address` (incl. GST legal name), `delivery_address, delivery_contact, nyla_sales_contact` (assigned salesperson), and `my_phone`. Share composer now passes `entityType/entityId` so the template resolves in-context. Verified: renders `Account Details — Empire Restaurant · EMPI-BEN-A26-001` and appears in the composer's Templates picker (SHARED badge).


### 2026-07-10 — ✉️ Share Details email — enhancements ✅ DONE
- **Nyla Sales Contact**: now shows the **assigned salesperson's name + phone** (was the account's primary contact).
- **Formatting**: body grouped into **Tax Details / Addresses / Contacts** sections with bulleted items (survives `react-quill-new`).
- **CC**: now also adds **all Admin-team users** (role contains "admin") alongside the salesperson + reporting manager (deduped).
- **Signature** (after "Best regards,"): logged-in user's **name on one line, phone on the next** (not password — passwords are bcrypt-hashed and never retrievable; confirmed with user).
- **Billing Address** now prepends the **GST Legal Name** (`gst_legal_name`), deduped if already in the address.
- **Account Reference** (business `account_id`, e.g. `SAVA-GOA-A26-001`) added to the **subject** (`… · {account_id}`), the body intro, and a note: *"please include the Account Reference {id} in the subject line for future correspondence."*
- Verified via preview screenshot (Empire Restaurant: subject `Account Details — Empire Restaurant · EMPI-BEN-A26-001`, all sections/CC/signature render).


### 2026-07-10 — 🔗 Delivery-Contact → central Contacts linkage (P0) ✅ DONE
- When an account's **delivery contact** is saved, it's now auto-mirrored into the shared `contacts` collection so it also appears in the account's Contacts section and the global Contacts module, and feeds the driver delivery schedule.
- **Backend** (`routes/accounts.py`): new `_sync_account_delivery_contact()` helper, called from BOTH `PATCH /accounts/{id}/delivery-info` and `PUT /accounts/{id}` (only when delivery_contact fields are present). Best-effort (never blocks the save).
  - Keyed by the account's **business code** (`account_id`) so it lists under `EntityContactsSection` (which queries by `account.account_id || account.id`).
  - Tagged `category="Delivery"` (a first-class UI category + the exact tag the delivery-schedule enrichment matches).
  - **One-way sync, deduped**: a stable `source="account_delivery_sync"` marker means re-saves update the SAME record (even when the phone changes → no duplicates); falls back to phone-match for pre-existing contacts.
  - Name split into first/last via `_cap_name`/`_full_name` (reused from `entity_contacts.py`).
- **Verified (curl)**: create (delivery-info PATCH → "Delivery" contact appears), update name+phone → same record updated (count stays 2, no dup), and PUT-edit path also syncs. Test data cleaned up.


### 2026-07-10 — ✉️ Account "Share Details via Email" + contract tenant_id backfill ✅ DONE
- **New "Share Details" button** on the Account detail header (`AccountDetail.js`, `data-testid=share-details-button`). Opens the inline email composer pre-filled with:
  - **Subject**: `Account Details — {account_name}`.
  - **Body** (label:value paragraphs — chosen over an HTML table because `react-quill-new` strips `<table>`): GST Number, PAN, Billing Address, Delivery Address, Delivery Contact, Sales Contact. HTML-escaped; empty values show `—`.
  - **CC**: the assigned salesperson's email + their reporting manager's email (via `GET /api/users/{assigned_to}/reporting-manager`), deduped.
  - **Attachment**: the account's signed contract auto-attached (fetched from `GET /api/accounts/{id}/contract/download`, base64→File). If no contract, opens without attachment + shows an info toast.
  - Gmail-connected check up front (toast if not connected).
- **InlineComposer** extended with optional props `initialCc`, `initialBcc`, `initialBodyHtml`, `initialLocalFiles`, `initialCrmDocs` (auto-reveals Cc/Bcc when cc/bcc supplied). No change to existing call sites.
- **Bug fixed**: 2 legacy `account_contracts` docs lacked `tenant_id`, so the tenant-scoped `TenantDB` query hid them (contract never attached). Backfilled `tenant_id` from the owning account (0 remaining). Also removed a stale duplicated JSX fragment at the end of `AccountDetail.js` that was breaking the build.
- **Verified** (preview, UI + curl): composer opens for accounts with & without a contract; Empire Restaurant shows CC = salesperson + manager and attaches `Nyla_Citadel.pdf` (172 KB). Send uses the proven `/gmail/send` path (not fired in test to avoid a real email).


### 2026-07-09 — 🗂️ Nav reorg + ✉️ Email Template To/Cc/Bcc ✅ DONE

**Nav module reorg** (`layouts/DashboardLayout.js`):
- **Knowledge Base** moved Sales → **Admin** module (new "Documents" group; kept its broad roles per user's choice — note: only Admin-module roles will actually see it in nav).
- **Sharing Recipients** moved Sales → **Admin** ("Settings & Integrations"). No access impact (was already CEO/Director/Admin-only).
- **Notifications** (per-user `/notification-settings`) **left in Sales** per user (everyone needs their own settings).
- Verified via screenshot: Admin module shows Knowledge Base + Sharing Recipients; both removed from Sales; Notifications stays in Sales. Frontend compiles.

**Email Templates — pre-configured To/Cc/Bcc** (`routes/email_templates.py`, `EmailTemplates.js`, `gmail/InlineComposer.jsx`):
- Added `to_emails`/`cc_emails`/`bcc_emails` to template model + create/update/clone; `/render` substitutes {{variables}} in them and returns them. Added email variables (`contact_email` for lead/account/contact) to the resolver.
- Editor: To/Cc/Bcc inputs (comma-separated, variables supported; `data-testid=tpl-to/tpl-cc/tpl-bcc`).
- Composer `applyTemplate`: pre-fills To (when editable)/Cc/Bcc from the template and auto-reveals Cc/Bcc.
- Verified (curl): create stores addresses; render returns fixed cc/bcc + resolves `{{contact_email}}`; editor shows the 3 fields (screenshot).


- Added a **City** dropdown to the New Issue (create) dialog. Selecting a city narrows the Account (and Lead) picker to entities in that city; "All cities" clears it. Shown only for account/lead link types (distributors have no city).
- Backend (`routes/customer_complaints.py`): new `GET /complaints/meta/cities?link_type=` (distinct cities) + `city` query param on `/meta/entity-search` (filters leads/accounts by `city`).
- Frontend (`CustomerComplaints.js`): `EntityPicker` accepts a `city` prop (re-searches on change); dialog fetches cities per link type, resets the selected entity when city/link type changes; Account picker spans full width when the city filter is shown (`data-testid=complaint-city-select`).
- **Verified**: cities endpoint returns 6 cities; Hyderabad→6 accounts, Delhi→1 (curl) and via screenshot (picker shows only Hyderabad accounts). Backend health 200, frontend compiles.


- Renamed all user-facing labels: sidebar nav, page heading + subtitle ("N issues tracked"), "New Issue" button, empty states, table header, dialog title ("New Issue"), toasts, delete-confirm; plus the permissions module label (`models/role.py`, key `customer_complaints` → display "Issues").
- **Unchanged (intentionally)**: route `/complaints`, `moduleKey='customer_complaints'`, API prefix `/api/complaints`, DB collection, code identifiers, and the record number prefix `CMP-` (backend-generated).
- Verified via screenshot: page shows "Issues", no "Customer Complaints" anywhere; backend health 200, frontend compiles.


- **Reported (production)**: In Performance Tracker → "View by Target Plan", selecting any plan showed **Target ₹0 / 0.0%**.
- **Root cause**: `compute_metrics` (`routes/performance.py`) derived the target ONLY from **resource-level** allocations (`target_allocations_v2`, `level="resource"`). Plans allocated at the **city/territory level** (or not broken down to individual reps) have no resource-level rows, so the sum was 0. Confirmed: plans with resource-level allocations already worked (₹5.25L / ₹26.5L); a plan without them returned 0.
- **Fix**: when the resource-level sum is 0, fall back to the plan's **`total_amount`** (plan overall target). City/territory sums were deliberately NOT used — those rows nest/duplicate/share names in the data and would double-count (verified: territory-name match double-counted 4.8M→7.9M).
- **Verified**: no-allocation plan → ₹4,00,000 (plan total) via direct call + live `/api/performance/generate`; resource-level plans unchanged (₹5.25L, ₹26.5L); month-mode (no plan) still 0. Backend health 200.


- **Reported**: Clicking a variable chip always appended to the **subject**, ignoring cursor position.
- **Fix**:
  - `RichEmailEditor.jsx` → `forwardRef` exposing `insertAtCursor(text)` (uses Quill `getSelection`/`insertText`) + accepts `onFocus`.
  - `EmailTemplates.js` → tracks last-focused field (`subject`/`body`) + subject caret (onFocus/onSelect/onClick/onKeyUp); `insertVarAt` inserts into the body editor at its caret, or into the subject at the saved selection (with caret restored). Helper text updated.
- **Verified (Playwright)**: subject caret-insert → `Hello {{company}}team` with caret left right after the var; body focus → var inserted in body, **subject unchanged**. Frontend compiles clean.


- **QBR Deck removed** from the Account detail header (`AccountDetail.js`) — deleted the `GammaGenerateButton` usage + its now-unused import (avoids build error). Verified gone via screenshot; only Edit/Delete remain.
- **"I am here" check-in cooldown** (per user, per lead; configurable):
  - Setting `check_in_cooldown_minutes` (default 30) added to `TenantSettings` model + editable in **Tenant Settings → Sales/Field** (`data-testid=input-check-in-cooldown`, 0 = disabled).
  - Backend (`server.py`): new `GET /api/leads/{id}/check-in/status` (returns `can_check_in`, `seconds_remaining`, `next_allowed_at`, `cooldown_minutes`); `POST /check-in` now enforces the cooldown server-side (**429** with a friendly message) and returns `next_allowed_at`.
  - Frontend (`LeadDeliveryAddressCard.js`): fetches status on mount, **disables the button with a live mm:ss countdown** ("Available in 12:34"), sets cooldown after a successful check-in, and syncs on 429.
  - **Verified (curl)**: status→check-in(within radius)→status(1799s left)→repeat=429. Frontend renders correctly (button enabled when no active cooldown). Test activity cleaned up.


- **Goal**: Ready the existing backend for a companion **native Expo/React Native app** (built separately via Emergent's Mobile Agent) serving both drivers and distributors. Spec doc handed off at `/app/memory/MOBILE_API.md`.
- **New endpoints** (`routes/mobile.py`, mounted `/api/mobile`, reuse existing bcrypt + `user_sessions` Bearer-token auth):
  - `POST /mobile/login` — unified login: email → staff/distributor, phone → Driver; returns `{token, role, user{home_screen}}`; no user-enumeration (uniform 401).
  - `GET /mobile/me`, `POST /mobile/logout`.
  - `POST /mobile/push/register` + `/push/unregister` — device Expo push tokens (`push_tokens` collection).
  - `GET /mobile/sync?since=<ISO>` — role-based delta (notifications + driver schedules / distributor deliveries) with a `server_time` cursor for offline caching.
- **Push fan-out**: `services/push_service.py` (Expo push, no key needed) wired into the central `utils/notify.py::notify_users` → every in-app notification now also pushes to registered mobile devices (best-effort, gated by existing preference matrix).
- **Verified (curl, external URL, both roles)**: staff login→me→push register→sync; distributor login (home=distributor, 21 deliveries in sync); push unregister; delta `since` cursor returns 0 on future timestamp; wrong-pass & unknown-user both 401. Driver phone-path mirrors proven `driver_app.login` (not password-tested — system-generated pw). Backend imports clean, health 200.
- **Note**: The mobile APP itself must be built in a SEPARATE Emergent project via the **Mobile Agent** (paid feature). Android = install-from-APK link; iOS needs an Apple Developer account. Native push/GPS require an EAS standalone build (not Expo Go).


- **Context**: Production Cloud Build failed (transient/OOM signature). Local checks (frontend `craco build`, `yarn install --frozen-lockfile`, fresh backend dep resolution, `pip check`, `server` import) ALL pass → no code-level blocker; failure was infra/build-memory.
- **Fixes** (no Docker changes):
  - `frontend/.env`: added `GENERATE_SOURCEMAP=false` (cuts build memory + time).
  - `App.js`: converted ~130 page imports to **`React.lazy`** + wrapped `<Routes>` in **`<Suspense>`** (entry/auth pages — SplashScreen, Login, RegisterTenant, GoogleAuthCallback, DashboardLayout — stay eager). Named-export driver pages handled via `.then(m => ({ default: m.X }))`.
- **Result**: initial JS bundle **1.43 MB → 296 KB gzipped** (~80% smaller); split into 162 on-demand route chunks. Production build exits 0 in ~50s.
- **Verified (preview)**: login → /home → lazy `/accounts` all render; no ChunkLoadError; only benign pre-login 401s + Cloudflare RUM noise in console.
- **⚠️ Redeploy** to apply on production — lighter build should clear the Cloud Build failure.


- **Diagnosis (via the new `/statement/debug` probe on production)**: contact lookup returned 200 (auth/org/contact all fine), but every statement call returned **404 `{"code":5,"message":"Invalid URL Passed"}`**. The endpoint path was **singular** `/contacts/{id}/statement` — Zoho Books' real endpoint is **plural** `/contacts/{id}/statements`.
- **Fix**: `zoho_service.get_contact_statement_pdf` now calls `/books/v3/contacts/{id}/statements?accept=pdf` (with FY date defaults). Diagnostic probes updated to the plural path (json/pdf, with/without dates) so a re-run confirms the working combo.
- Earlier hardening retained (45s ceiling, follow_redirects, fail-fast timeouts, catch-all) — these turned the prior hang/Cloudflare-520 into a clean error and enabled this diagnosis.
- **⚠️ Redeploy to verify**: the statement should now render. If not, re-run diagnostics — it'll show which plural variant Zoho accepts.






- **Reported (PRODUCTION)**: Every customer's statement pull returned 502 "Zoho Books did not return this statement. Please try again in a moment." (GET `/api/accounts/{id}/statement/pdf` → 502).
- **Root cause**: Zoho Books' `GET /contacts/{contact_id}/statement?accept=pdf` **requires** `start_date` and `end_date` query params (confirmed via Zoho API docs). Our `get_contact_statement_pdf` sent only `organization_id` + `accept=pdf`, so Zoho rejected it — and the route masked the real reason behind a generic 502.
- **Fix**:
  - `zoho_service.get_contact_statement_pdf`: defaults `start_date`/`end_date` to the current India financial year (Apr 1 → today) when the caller omits them; still accepts explicit overrides.
  - `routes/account_ledger.py::statement_pdf`: accepts optional `start_date`/`end_date` query params and now **surfaces the real Zoho error message** (`Zoho Books: <detail>`) instead of the generic 502.
  - `components/account/AccountZohoLedger.jsx`: parses the error Blob body to display the actual Zoho reason in the UI.
- **⚠️ Verify on production** (Zoho not connected in preview): redeploy, then retry a customer statement — it should now render, or show the exact Zoho reason if any remains.


### 2026-07-08 — ✨ Per-customer Zoho ledger / Statement of Accounts (Account detail) ✅ DONE
- New **"Ledger / Statement"** section on the Account detail page that pulls the customer's **official Statement of Accounts live from Zoho Books as a PDF** (`GET /books/v3/contacts/{contact_id}/statement?accept=pdf`), embedded in an inline viewer.
- Actions: **Refresh**, **Download PDF**, and **Share via WhatsApp** (creates a 7-day signed public link via the existing document-sharing framework and opens a `wa.me` deep link prefilled with the customer's number + statement link — no Meta API needed).
- Backend: `routes/account_ledger.py` (`/statement/status`, `/statement/pdf`, `/statement/share-link`) + `zoho_service.get_contact_statement_pdf` + registered `account_statement` share resolver.
- Graceful states: Zoho-not-connected, account-not-linked, and Zoho-fetch-error all handled with clear UI.
- **Verified**: testing_agent iteration_315 (9/9 backend + frontend flow pass; regression-clean). ⚠️ **Live Zoho PDF pull is NOT verifiable in preview** (Zoho not connected here) — the 'not connected' state is expected; the live statement will render on **production** once Zoho is connected. New pytest: `backend/tests/test_account_ledger.py`.

### 2026-07-08 — 🐛 Fix: Edit Design Request blocked when request type is inactive ✅ DONE
- **Reported**: In "Edit Design Request", could not enter the reason for urgent/short delivery and could not submit.
- **Root cause** (`NewDesignRequestNew.js`): if a request's type had been deactivated, `GET /marketing-request-types` (active-only) omitted it, so the frontend's `types` list lacked it → `selectedType` was `undefined` → `minLeadDays=0` → `isShortTimeline` false → the short-timeline reason textarea never rendered. Meanwhile the backend `update_request` still resolved the type by id, saw the due date was tighter than the real lead time, and rejected the save with **400** — so the user could neither enter the required reason nor submit.
- **Fix**: on edit-load, synthesise a `fallbackType` from the request's own stored `request_type_name` / `design_lead_time_days` / `production_lead_time_days`, and merge it into a new `allTypes` list (`selectedType`, `visibleTypes`, `minLeadDays` now use `allTypes`). The lead-time guard + reason box now render correctly even for inactive/hidden types. Edit-mode only (does not affect Create).
- **Verified**: testing_agent iteration_314 (3/3 pass) — inactive-type edit (reason box renders, Save→200), active-type edit regression, and Create-flow regression all pass. **⚠️ Redeploy to apply on production.**

### 2026-07-08 — 🐛 Fix: Stock Dashboard counted crates as bottles (under-count, 3 crates → 3) ✅ DONE
- **Reported (PRODUCTION, Mumbai)**: A Stock Out of 3 crates (1 crate = 12 bottles = 36 bottles) showed as **3** in the Stock Dashboard "Delivered" column (which is in base bottles). Invoice amounts were correct; only the dashboard aggregation was wrong.
- **Root cause** (`distributors.py` `_item_crates`, ~line 8811): the earlier double-count fix returned `quantity` as-is whenever `packages > 0`, assuming `quantity` was already base bottles. But this line stored `quantity` as the **crate count (3)** while also carrying `packages=3` / `packaging_units=12` → returned 3 instead of 36.
- **Fix**: when a line has BOTH `packages` (>0, crates) and `packaging_units` (>1, bottles/crate), authoritatively return **`packages × packaging_units`** — the true base-bottle total, immune to whether `quantity` was mis-stored as crates or bottles. Self-heals at read time (no data migration). Keeps the prior over-count case correct too (10 crates × 15 = 150, not 2250). Applies to stock_received / stock_delivered / stock_pending_out.
- **Verified**: testing_agent iteration_313 (5/5 pass) — seeded a mis-stored 3-crate line → dashboard `stock_delivered=36`; no over-count regression across other SKUs. Regression test: `backend/tests/test_stock_dashboard_crate_bug.py`. **⚠️ Redeploy to apply on production.**

### 2026-07-08 — Stock Transfers & Stock Out exports: per-SKU drill-down ✅ DONE
- Both Excel exports now use **Excel outline grouping** — a per-record **summary row** (green, bold) with **collapsible per-SKU detail rows** beneath it (the +/- drill-down control in Excel; `summaryBelow=False`).
- **Stock Transfers** (`distributor_stock_transfers.py::export`): summary (transfer #, source, dest, total packages/units/value, doc type, status) + detail per SKU (packaging, units/pkg, quantity, total units, batch, rate, line value).
- **Stock Out** (new `GET /distributors/{id}/deliveries/export` in `distributors.py`): mirrors the list filters (status/account_ids/location_id/time_filter, all records not just current page); summary per delivery + detail per SKU with the full financial columns (Margin %, Base/Transfer Price, Billed to Distributor, Customer Price, New Transfer Price, Actual Billable, Adjustment, Customer Invoice). Replaces the old client-side CSV (which only covered the current page).
- **Frontend**: `DeliveriesTab.downloadExcel` now calls the backend export via `fetch` (xlsx blob).
- Verified: curl (ST 21 rows w/ lvl-0 summary + lvl-1 detail; SO 41 rows same) + Playwright UI (Stock Out "Download Excel" → `stock_out_Brian_*.xlsx` downloaded).

### 2026-07-08 — Stock Transfers: Excel download ✅ DONE
- **Stock Transfers page** (`StockTransfers.js`) header now has a **"Download"** button that exports the (search-filtered) transfers list to `.xlsx`.
- **Backend** (`distributor_stock_transfers.py`): new `GET /distributor/stock-transfers/export` (defined before `/{transfer_id}` to avoid path capture) streams an openpyxl workbook — Transfer #, Date, Source/Dest Distributor+Warehouse+GSTIN, Total Packages, SKUs, Items, Doc Type, Zoho Status, Total Value, Vehicle #, Status, Created By — honoring the same `search`/`distributor_id`/`sku_id`/`status` filters as the list.
- Verified: curl (10 transfers → 11 rows, 17 cols populated) + Playwright UI (Download renders, 10 rows).

### 2026-07-08 — Stock In: destination-warehouse filter + Excel download ✅ DONE
- **Stock In tab** (`ShipmentsTab.jsx`) header now has a **"All destinations" filter** (lists the distributor's active locations) and a **"Download"** button that exports the (filtered) shipments list to `.xlsx`.
- **Backend** (`distributors.py`): `GET /{id}/shipments` accepts a `location_id` filter; new `GET /{id}/shipments/export` streams an openpyxl workbook (Shipment #, Ref/PO, Date, Destination, From Warehouse, Status, Qty, Subtotal, Discount, GST %, GST Amt, Total), honoring the `status`/`location_id` filters. Export route defined before `/{shipment_id}` to avoid path capture.
- **Frontend** (`DistributorDetail.js`): `shipmentLocationFilter` state drives `fetchShipments` (now `page_size=100` + `location_id`); `handleExportShipments` downloads the blob.
- Verified: curl (list Delhi=23/37, export all=37 rows, export Delhi=23 rows) + Playwright UI (filter switches 37→23 rows, Download button renders).

### 2026-07-07 — Stock-by-SKU crates/bottles toggle + Factory→Master crates fix + Lead/Account detail redesign ✅ DONE
- **Stock by SKU** table (`StockDashboardTab.jsx`) has a **Bottles / Default Crates** toggle; converts each SKU by its own default crate size, which is shown per row. SKUs without a crate stay in base units.
- **P0 inventory fix**: `bottles_per_crate` now always resolved (SKU-packaging fallback) in `GET /production/batches/{id}` + `transfer_to_warehouse` (`production_qc.py`), so "Transfer to Master Warehouse" can't treat crates as bottles. Backfill: `backend/scripts/backfill_bottles_per_crate.py` (RUN ON PROD AFTER DEPLOY).
- **P0 UI redesign**: `LeadDetail.js` & `AccountDetail.js` now have a sticky "On this page" nav + distinct section headers (new `components/detail/{Section,SectionHeader,StickySectionNav}.jsx`). Inner logic untouched. Verified by testing_agent iteration_309 (regressions fixed).


### 2026-07-05 — Design Requests rename + RBAC swap + lead routing + per-type icons ✅ DONE
- OLD `marketing_requests` → "Design Requests - OLD" (admin-only in menu); `design_requests_new` → "Design Requests" (inherits old module's per-role perms via one-time `dr_rename_migrated` migration in routes/roles.py).
- Lead-initiated requests (LeadBottleDesigns.js, BottlePreview.js) now create in the NEW module; added `lead_id` filter to design_requests_new list.
- Design Request Types can upload a default icon (`icon_file_id`); request cards fall back own-image → type-icon → placeholder on Kanban + list. Verified by testing_agent iteration_289.
- Also fixed prod deploy blocker (CI ESLint-as-errors → DISABLE_ESLINT_PLUGIN) and hid Neck Tags / Bottle Design Concept / Physical Sample from the standalone New Design Request form.

### 2026-06-19 — 📄 Branded Lead Proposal generator ✅ DONE
- **One-click "Generate Proposal"** on a lead builds a branded 2-page PDF mirroring the Nyla template: header (logo/address/CIN + accent bar), customer-name title, intro, **pricing table** (Format · Standard [struck] · Offer · Return Credit · Landing = Offer−Credit), disclaimer, Reverse Logistics, Commercial Terms, Category Placement, page-2 Listing Format + Brand Onboarding + product image. Uses bundled DejaVuSans for the ₹ glyph.
- **Saved as the lead's proposal** → existing Preview / Download / Share-via-email / Review (approve/request-changes/reject) all work automatically. Covers all 4 requested outputs.
- **Admin-editable template** (`/proposal-template` page + `GET/PUT /api/proposals/template`, `proposal_templates` collection seeded with defaults).
- **Master SKU pricing**: added **Standard Price / Return Bottle Credit** (+ existing MRP) to SKU Management; persisted via `PUT /api/master-skus/{id}` and pulled into the proposal pricing table. Fixed GET-list/PUT formatters that were dropping the new fields.
- Backend: `services/proposal_pdf.py`, `routes/proposals.py`, `POST /api/leads/{id}/proposal/generate`. Logo + product image extracted from the sample PDF into `backend/assets/proposal/`.
- Tested: testing_agent (6/7 backend pass; the 1 fail — master-sku response omitting fields — now fixed & re-verified). UI: template editor + lead generate/regenerate confirmed.


### 2026-06-19 — ↕️ Moved Social Links above Comments (Lead detail) ✅ DONE
- Relocated the Social Links card from the page bottom to **directly above the Comments section** in the lead's main column. Verified via screenshot; functionality unchanged.


### 2026-06-19 — 🙈 Removed "Gamma" from all user-facing text ✅ DONE
- Replaced every visible "Gamma" mention with neutral wording: dialog title → **"Generate Presentation"**; result button → **"Open Presentation"**; composer tip reworded; template manager → **"My Presentation Templates"** + "Template link or ID" (placeholder/help no longer reference gamma.app); generator page heading + nav menu → **"Presentation Generator"**.
- Internal code/identifiers/routes/testids/API paths unchanged (integration intact). Verified: dialog contains no "Gamma" text; all files compile.


### 2026-06-19 — 📌 Single deck template auto-selected & locked ✅ DONE
- In the deck composer (`GammaComposer.jsx`): when **only one template exists**, it's set as the **default** choice and shown as a **non-editable** field (no dropdown). With 2+ templates the normal selectable dropdown (incl. "generate from scratch") remains.
- Verified: tenant has 1 template ("Proposal Template") → renders fixed/read-only; editable select absent.


### 2026-06-19 — 🎤 Lead deck input refined + themes dropdown removed ✅ DONE
- **Lead "Generate Deck"** draft now built from exactly: **lead name**, **Proposed SKUs & pricing** (SKU — ₹price/unit + return bottle credit), and **social links** (Online Presence section). Dropped the generic contact/source/priority/notes fields. (`routes/gamma.py::_build_lead_draft`)
- **Removed the predefined Themes dropdown** from the deck composer (`GammaComposer.jsx`) — only Template + Slides remain; generation sends `theme_id=null`.
- Verified: `/gamma/draft` returns the new structured text; dialog confirms theme select is gone.


### 2026-06-19 — 🔗 Lead Social Links section ✅ DONE
- Added a **Social Links** section at the **bottom of the Lead detail page** — users can add **multiple** links (platform dropdown: Website/LinkedIn/Instagram/Facebook/Twitter-X/YouTube/Other + URL), with per-row open/remove and a Save button.
- **Backend** (`routes/leads.py`): new `PUT /api/leads/{lead_id}/social-links` (model `SocialLinksUpdate`); normalizes URLs (prefixes `https://`), stores `social_links` array on the lead. `social_links` added to Lead/LeadUpdate models.
- **Frontend** (`LeadDetail.js`): platform icons via lucide; loads from `lead.social_links`; `data-testid`s on all controls.
- Verified: curl PUT/GET persists + normalizes; UI renders section with 2 links and Save works.


### 2026-06-19 — ⬇️ Per-invoice PDF download icon ✅ DONE
- Added a small **Download icon on each invoice row** (next to Location) that downloads that single invoice as a **PDF**.
- **Backend** (`routes/invoices.py`): new `GET /api/invoices/{invoice_id}/pdf` — ReportLab document with INVOICE header, bill-to (account name/address/contact/GSTIN), line items (SKU/crates/bottles/line total), totals (Gross/Credit Note/Net/Outstanding), and any applied credit notes. Looks up by `id` or `invoice_no`.
- **Frontend**: `handleDownloadInvoice` with per-row spinner; `data-testid="download-invoice-{id}"`.
- Verified: PDF generates correctly (curl + pypdf text extract); 4 icons render on the list.


### 2026-06-19 — 🐛 Fix invoice Matched/Unmatched status + remove Customer Credits column ✅ DONE
- **Bug**: invoices linked to an account (showing on the account detail page) wrongly showed "Unmatched" in the listing — the stored `status` field was stale/`None` while the invoice actually had `account_id`/`account_uuid` linkage.
- **Fix** (`routes/invoices.py`): status is now **derived at read time** from real account linkage (`account_uuid`/`account_id`/`ca_lead_id`) via `_derive_invoice_status()` — self-healing, no backfill needed. The status filter also queries by linkage (`$or`/`$nor`) instead of the stale field. Applied to list + export.
- **UI**: removed the "Customer Credits" column from the invoice table (summary card retained). Verified: all linked invoices now show Matched; status filter matched=4/unmatched=0.


### 2026-06-19 — 🔗 Per-invoice applied credit notes (stock-out → invoice) ✅ DONE
- Fixed the invoice "Credit Note" column always showing ₹0. Credit notes applied during **Stock Out** are stored on the `distributor_deliveries` doc (`total_credit_applied`, `applied_credit_notes`). Now linked to the invoice via `invoice.invoice_no == zoho_invoice_mappings.zoho_invoice_number` (synced, `source_type=distributor_delivery`) → `source_id` = delivery.
- **Backend** (`routes/invoices.py`): new `_build_invoice_applied_credit_map()`. List + export now populate per-invoice `credit_note_value` from the originating delivery's applied credit and recompute **Net = Gross − Credit**; summary `total_credit`/`total_net` reflect it. `applied_credit_notes` (CN numbers) returned for the row tooltip.
- **Frontend**: "Credit Note" cell shows applied CN numbers as subtext/tooltip; Net updates automatically.
- **Verified**: temporarily applied ₹150 credit to synced delivery DEL-2026-0009 → INV-001774 showed Credit ₹150 / Net ₹1638 in both list API and Excel export; reverted. NOTE: in current demo data no synced delivery has applied credit, so it shows ₹0 there — it populates on production where credits are applied to synced stock-out deliveries.


### 2026-06-19 — 🧾 Invoices: bottles in export + customer credit notes ✅ DONE
- **Export**: Added **Bottles** column (total bottles per invoice from line items) plus **CN Issued / CN Applied / CN Balance** columns to the `.xlsx` download.
- **Credit notes visibility**: Credit notes live in the `credit_notes` collection at the customer/account level (generated from returns) and were never shown on invoices. Now surfaced three ways (display-only — does NOT change Net): (1) per-row **"Customer Credits"** column (balance + issued/applied subtext) keyed by account_id/account_name; (2) **Customer Credits summary card** (distinct-account totals); (3) a separate **"Credit Notes" tab** on the Invoices page listing all credit notes with issued/applied/balance + summary.
- **Backend** (`routes/invoices.py`): `_build_credit_note_account_map()` + `_cn_for_invoice()` helpers; list endpoint enriches rows with `cn_issued/applied/balance` and summary with `cn_total_*`; new `GET /api/invoices/credit-notes` endpoint.
- **Tested**: curl (credit-notes endpoint, enriched list summary, xlsx columns) + UI screenshots (both tabs render; Toopa shows ₹10 credit).



### 2026-06-19 — 🧾 Invoices page: account autocomplete + Excel export ✅ DONE
- **Frontend** (`pages/InvoicesList.js`): Replaced free-text Account Name filter with a searchable multi-select autocomplete (Popover + cmdk `Command`), alphabetically sorted. Standalone `AccountMultiSelect` component (used on desktop + mobile). Added a header "Download" button that exports the currently-filtered list to `.xlsx` (blob download). Deep-linked `account_name` query param preselects the account.
- **Backend** (`routes/invoices.py`): Extracted shared `_build_invoice_query()` helper. List endpoint now accepts repeated `account_names` (exact `$in` match). New `GET /api/invoices/account-options` returns distinct invoice account names sorted alphabetically. New `GET /api/invoices/export` streams an openpyxl `.xlsx` honoring all active filters (Invoice #, Date, Account, Gross, Credit Note, Net, Outstanding, Status, City, State).
- **Tested**: curl (account-options, filtered list, export xlsx well-formed) + UI screenshot (multiselect filters to 1 invoice, summary updates).


### 2026-06-19 — ✨ Gamma deck generation integration (NEW) ✅ DONE
- **Integration**: Gamma Generate API v1.0 (`services/gamma_service.py`, `X-API-KEY`, key in `backend/.env` as `GAMMA_API_KEY`). Async generate → poll for `gammaUrl` + PDF `exportUrl`.
- **Backend** (`routes/gamma.py`, `/api/gamma`): `/themes`, `/draft` (auto-builds editable deck content from a Lead or Account), `/generations` (start), `/generations` (history), `/generations/{id}` (poll; maps Gamma status, holds 'finalizing' until PDF export URL ready). Jobs tracked in `gamma_generations` (tenant-scoped) with credits + source link.
- **Frontend**: reusable `components/gamma/GammaComposer.jsx` (edit content, slides, theme, generate, live poll, result with Open-in-Gamma + Download-PDF) and `GammaGenerateButton.jsx` (button+dialog, auto-loads CRM draft). Surfaces: **(1)** standalone `pages/GammaGenerator.js` (compose + recent-decks history), **(2)** "Deck" button on Lead detail (sales proposal), **(3)** "QBR Deck" button on Account detail (business review).
- **Content**: auto-built from CRM (lead: company/contact/location/requirements/next-steps; account: overview/commercial performance/opportunities), shown in an **editable preview** before sending.
- **RBAC**: module key `gamma_generator` (Tools category; default no access; CEO/Admin/System Admin auto). Sidebar entry under Sales → Product & SKU, gated CEO/Admin. Lead/Account buttons hidden unless the role has `gamma_generator` view.
- **Tested**: full flow via curl (themes, draft, generate → completed with PDF export, 13 credits), UI verified (standalone page + history, Lead button auto-fills draft). RBAC test → 10/10 (81 keys / 13 categories).

### 2026-06-19 — ✨ Gamma templates (use your own Gamma templates) ✅ DONE
- **API reality**: Gamma has no "list templates" endpoint. Supported path is **Create-from-Template** (`POST /v1.0/generations/from-template` with `gammaId` + `prompt` + optional `themeId`); template deck must be single-page.
- **CRM template registry** (`gamma_templates` collection, tenant-scoped): admin-only CRUD in `routes/gamma.py` (`/gamma/templates` GET/POST/PUT/DELETE). Accepts a Gamma link OR raw ID; `_extract_gamma_id` parses `g_xxx`/slug/URL. Non-admins can read (to pick) but not manage.
- **Generation**: `GenerateRequest.template_id` → when set, routes to `gamma_service.create_from_template` (content becomes the prompt; structure/branding follow the template). Job stores `template_id`/`template_name`.
- **Frontend**: `GammaComposer` gains a **Template dropdown** ("No template" = from scratch; hides Slides + offers optional theme override when a template is chosen) — appears in standalone page + Lead/Account dialogs. `GammaTemplateManager.jsx` (admin-only) on the Gamma Generator page: add (paste link/ID) / list / delete.
- **Tested**: curl from-template end-to-end (completed, PDF export, 42 credits) using a real template `g_7qlootrwqz194oh`; URL→ID extraction verified; UI verified (dropdown lists registered template, manager add/list/delete). RBAC test 10/10.


### 2026-06-19 — ✨ Customer Complaints module (NEW) ✅ DONE
- **Purpose**: Track customer complaints linked to a Lead / Account / Distributor, against one or more SKUs, with details, photo attachments and a threaded update/comment log.
- **Backend** (`routes/customer_complaints.py`, mounted at `/api/complaints`): full CRUD + `/meta/options`, `/meta/entity-search` (lead/account/distributor autocomplete), comments, photo upload/download/delete. Complaint numbers `CMP-YYYY-####`. Statuses: open → in_progress → awaiting_customer → resolved → closed (auto resolved_at/closed_at). Priority low/med/high/urgent; categories quality/packaging/delivery/billing/other; assignable to a user.
- **Photos** via Emergent Object Storage (`services/object_storage.py`) — tenant-isolated paths, multi-upload, 15 MB/image cap, image-type validation, blob-fetch rendering in UI (no base64 in DB).
- **Frontend**: `pages/CustomerComplaints.js` (list + filters + create dialog with entity autocomplete & SKU multi-select) and `pages/CustomerComplaintDetail.js` (details, photo grid upload/preview, comments, status/priority/assignment).
- **RBAC**: new module key `customer_complaints` (default no access; CEO/Admin/System Admin auto-granted — added `CEO` to admin-like backfill in `routes/roles.py`). Appears in Role → Module settings (Operations category). Sidebar entry in **both Sales and Production** menus, gated to CEO/Admin by default.
- **Tested**: backend CRUD/comments/status/photos via curl (object-storage round-trip OK); UI verified (list, detail, photo thumbnail, comment); RBAC test updated → 10/10 pass (80 keys / 13 categories).

### 2026-06-19 — ✨ Delivery-schedule QR codes (turn-by-turn) ✅ DONE
- Added a Google Maps **directions QR** (`maps/dir/?api=1&destination=<lat>,<lng>`) next to each stop's address in the delivery-schedule PDF. Renders only when the account has GPS `lat`/`lng`; omitted silently otherwise.
- Implemented in `_build_schedule_pdf` (`routes/distributor_delivery_schedules.py`), so **both** the driver schedule PDF and the combined bundle PDF (schedule + invoices) get the QR. Added `qrcode[pil]` dependency.
- **Tested**: `tests/test_delivery_schedule_qr.py` 4/4 pass (QR present with coords, omitted without, PDF always valid).



### 2026-06-18 — ✨ Seed data script: clone-and-remap `demo-co` tenant (P0) ✅ DONE
- **Request**: A seed data script for GitHub deployment so the app ships with pre-populated demo data.
- **Approach (clone-and-remap engine)**: `scripts/seed_sample_data.py` clones the primary tenant (`nyla-air-water`) into a fresh, fully-decoupled `demo-co` tenant instead of hand-authoring 100+ schemas. Builds a global map of every primary UUID `id` (and all `users` ids regardless of format, since users are resolved by id without a tenant filter) → fresh `uuid4`, then recursively rewrites all references. Business-code ids (e.g. `invoice_no == id`) are left intact to avoid corrupting display fields. Globally-shared collections (master_skus, territories, lead_statuses, etc.) are NOT cloned (read across tenants); integration secrets/OAuth/API keys are excluded.
- **Modes**: `generate` (clone src→demo-co in current DB + write portable `scripts/seed_data/demo_seed.json` fixture ~4.3 MB), `load` (wipe demo-co + rehydrate from fixture for a fresh deploy DB with no source), `wipe`. All idempotent.
- **Users**: emails rewritten to `@demo-co.com` (deduped), password reset to `demo123`, `force_password_change=False`. Admin: surya.yadavalli@demo-co.com.
- **Tested**: 1727 docs cloned across 102 collections; referential integrity verified (0 source-id leaks in demo docs, distributor→deliveries links correct: 11+7); e2e login as demo admin works and returns demo-scoped data (72 leads, 17 distributors, 12 accounts); fixture load roundtrip reproduces the same data. `tests/test_seed_sample_data.py` 5/5 PASS (remap, demoify-user dedupe/bcrypt, build-tenant, excludes). README at `scripts/seed_data/README.md`.
- **Serving demo**: set `DEFAULT_TENANT_ID=demo-co` or serve on a host/subdomain mapping to `demo-co`.



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

### 2026-06-17 — 🐛 Fix: Zoho challan "Cleanup" (reverse delete) failed with 401 code 57 "not authorized" ✅ DONE
- **Reported (PRODUCTION)**: Clicking "Cleanup" on a reversed promo challan (to delete the Zoho delivery challan) failed: `Zoho API 401: {"code":57,"message":"You are not authorized to perform this operation"}`.
- **Root cause**: The Zoho OAuth scopes requested at connect time (`zoho_service.get_zoho_config`) covered contacts/invoices/creditnotes/items/settings but **omitted `deliverychallans` entirely**. The connected token therefore had no permission to delete (or manage) delivery challans → code 57.
- **Fix** (`services/zoho_service.py`): added `ZohoBooks.deliverychallans.CREATE/READ/UPDATE/DELETE` to the OAuth scope list. Also made `delete_delivery_challan` translate the raw code-57 into an actionable message instructing an admin to reconnect Zoho Books so the new scopes are granted.
- **⚠️ Requires admin to RECONNECT Zoho**: scope changes only apply on a fresh authorization — the existing refresh token keeps the old scopes. After redeploy: Settings → Integrations → Zoho Books → Disconnect, then Connect again, then retry Cleanup.
- **Tested**: scope config asserted (delete scope present); backend healthy. Live delete not exercisable in preview (Zoho not connected). **Redeploy + reconnect Zoho to push to production.**

### 2026-06-17 — 🐛 Fix: promo challan Deliver-To name + missing "From" warehouse address ✅ DONE
- **Reported (PRODUCTION, after reconnect)**: (1) The challan Deliver-To address now updates to the recipient, but the **heading/first line still shows the distributor (e.g. "Delhi (Godamwale)")** instead of the recipient (lead). (2) The **top "From" block has no street address** — only the branch state + GSTIN.
- **Root causes**: (1) Zoho's delivery-challan template prints the **customer (distributor) name** as the Deliver-To heading and **ignores the shipping `attention` field**, so the recipient name never appeared. (2) The mapped Zoho **Branch** ("Delhi Branch") had only state + GSTIN, no street — and updating a branch needs the `ZohoBooks.settings.UPDATE` scope we didn't request.
- **Fix** (`services/zoho_service.py`, `create_delivery_challan_for_promo_dispatch`): (1) the recipient name is now placed as the **first visible address line** (street pushed to `street2`), so the Deliver-To clearly identifies the recipient regardless of the template. (2) Added `ZohoBooks.settings.UPDATE` scope and a best-effort auto-push of the source warehouse's full street address into its Zoho Branch on challan create (via existing `sync_warehouse_to_zoho_branch`), so the header "From" shows the dispatching warehouse address.
- **⚠️ Requires REDEPLOY + RECONNECT Zoho** (the new `settings.UPDATE` scope only applies on a fresh authorization), then create a NEW promo challan.
- **Tested**: scopes asserted (`settings.UPDATE` + all deliverychallans present); 8/8 unit tests pass; backend healthy. Live render not exercisable in preview.

### 2026-06-17 — ✨ Feature: Reverse action for regular stock-out (deliveries) ✅ DONE
- **Request**: Mirror the promo "Reverse" on regular deliveries — for a delivery that was scheduled & **invoiced** but never actually delivered: void the Zoho invoice and release the committed stock back to inventory.
- **Scope (per user)**: Reverse is allowed ONLY for not-yet-delivered deliveries that already have a Zoho invoice. **Completed/delivered deliveries CANNOT be reversed** (stock already moved). Also blocked for cancelled/already-reversed and settlement-linked deliveries.
- **Backend** (`services/zoho_service.py`, `routes/distributors.py`):
  - New `void_invoice()` → `POST /invoices/{id}/status/void` (uses existing `invoices.UPDATE` scope — no reconnect needed; idempotent on 404 / already-void; actionable msg on code-57).
  - `POST /distributors/{id}/deliveries/{delivery_id}/reverse`: voids the Zoho invoice (best-effort), undoes the local mirror invoice + account `outstanding_balance`, reverts applied credit notes, and sets status `reversed` — which drops it from `RESERVED_DELIVERY_STATUSES` so committed stock is released back to available (stock was never physically deducted; deduction only happens on completion).
  - `POST .../reverse-zoho-cleanup`: retry the void when `zoho_void_pending`.
- **Frontend** (`pages/DistributorDetail.js`): "Reverse (Void Invoice)" button in the delivery detail modal (shown for invoiced, not-yet-delivered deliveries), a "Retry Zoho Void" button when a void is pending, and a rose "Reversed" status badge.
- **Tested**: curl e2e on preview — guards verified (delivered→400, no-invoice→400, not-found→404) and happy path on DEL-2026-0007 (confirmed+invoiced) → status `reversed`, `reversed_by` stamped, stock released; Zoho void correctly deferred (`void_pending`, "Zoho not connected" in preview — will void on production). 12/12 unit tests pass; frontend compiles. **Note**: actual Zoho voiding only verifiable on production (Zoho connected there).

### 2026-06-17 — ✨ Feature: Driver bundle PDF includes the account's Delivery contact ✅ DONE
- **Request**: When downloading the delivery-schedule driver bundle PDF, include each account's **delivery contact** — i.e. the account contact tagged with **category = "Delivery"**.
- **Implementation** (`routes/distributor_delivery_schedules.py`):
  - `_enrich_schedule` now resolves, per stop, the account's "Delivery"-category contact from the shared `contacts` collection. Account contacts are keyed by whichever id the UI passed (usually the business `account_id` code, sometimes the UUID), so it matches against BOTH the delivery's account UUID and the account's business code. Oldest matching contact wins. It's preferred for `delivery_contact_name`/`delivery_contact_phone` (falling back to the delivery row override → account `delivery_contact_*` fields), and now also exposes `delivery_contact_designation`/`delivery_contact_email`.
  - `_build_schedule_pdf` renders a labelled "Delivery contact: Name (Designation) · Phone" line under each customer in the stops table (all values HTML-escaped).
- **Tested**: seeded a "Delivery" contact on account TOOP-HYD-A26-001, ran the real schedule e2ec4623 through `_enrich_schedule` + `_build_schedule_pdf` → contact name, phone and designation all present in the extracted PDF text; test contact cleaned up. Backend healthy.

### 2026-06-17 — ✨ Feature: Promotional Stock-Out unified into the regular delivery lifecycle (Option A) ✅ DONE
- **Request (3 parts)**: (1) promo stock-outs follow the same workflow as regular stock-outs (draft → confirmed → delivery-assigned → complete); (2) promo stock-outs are assignable in delivery schedules (and part of the driver bundle); (3) promo stock selected is RESERVED until the delivery is complete.
- **Approach (user chose A)**: New promo stock-outs are now persisted as `distributor_deliveries` records flagged `is_promo=True` (recipient = lead/contact/employee, no billing account, zero monetary totals). This makes them inherit the regular lifecycle, the shared stock-reservation pool and the delivery-schedule system. Legacy `promo_dispatches` records remain viewable (read-only, historical).
- **Backend** (`routes/promo_dispatch.py`, `services/zoho_service.py`):
  - Create writes an is_promo delivery + `distributor_delivery_items`; status `draft`/`confirmed`. **No stock deduction** — an open delivery only RESERVES (validated reservation-aware: available = on-hand − reserved, shared with regular Stock Outs).
  - New `/confirm` (draft→confirmed, reserve + push Zoho challan), `/complete` (deduct reserved stock, →complete), `/reverse` (release reservation + delete challan; legacy path still adds stock back). List/summary/get/pdf/delete/retry merge both collections via a `_load_promo` loader.
  - `sync_delivery_to_zoho` now guards `is_promo` → raises ZohoPushSkippedError (a promo never creates a tax invoice, only a challan).
  - Schedule assignability is automatic: the schedule `eligible-deliveries` query is `{distributor_id, status:'confirmed'}` — promo confirmed deliveries match (verified at DB level). Driver bundle renders them like any stop (with the Delivery-contact work).
- **Frontend** (`PromoDispatchSection.jsx`): status badges Draft/Confirmed/Scheduled/Delivered/Reversed; actions Confirm (reserves), **Delivered** (completes → deducts), Reverse. Confirm/Reverse copy updated to "reserve/release".
- **Tested (curl + DB, preview)**: create draft → confirm (stock unchanged at 1000, reservation map = 10) → complete (deducted → 990, reservation cleared) → complete-again 400. Confirmed promo appears in the eligible-deliveries query. 12/12 unit tests pass; frontend compiles; app renders. Test data cleaned up.
- **⚠️ Production-only verification**: Zoho challan generation on confirm (Zoho not connected in preview) and the schedule picker UI under a distributor-portal login. **Redeploy** to use. Existing `dispatched` legacy records keep their old (already-deducted) behaviour.




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

### 2026-06 (current) — SKU Hierarchy Phase 1: Parent & Customer-Specific Child SKUs ✅ DONE
- Master SKUs now have an "Allows Customer-Specific Child SKUs" toggle (`allows_child_skus`, default No). Enabled for `24 Brand`.
- New tenant-scoped `child_skus` collection + `/api/child-skus` CRUD (`routes/child_skus.py`): generic (max 1/parent) or customer children linked to Accounts; fields: name, code, type, customer, brand name, branding type, label version, artwork (Emergent object storage upload/download), active status.
- Children inherit product info dynamically from parent and structurally carry NO pricing; pricing/production/invoicing stay on the parent master SKU.
- Validations: children only when toggle on; toggle can't turn off while children exist; unique code per tenant; unique name per parent; customer required for customer type; delete → deactivate when transaction history exists (future-proofed for Phase 2/3).
- Frontend: toggle in SKU form + Parent badge + "Child SKUs (n)" button opening `ChildSkuManager.js` dialog (list, create/edit, artwork upload/download, deactivate/reactivate) on `/sku-management`.
- Refinements (same session): Customer Account picker is an autocomplete combobox listing ONLY accounts associated with the parent SKU (via `accounts.sku_pricing`, `GET /child-skus/eligible-accounts`, enforced server-side too); Customer Brand Name field removed (lives on Account); child SKU code AUTO-GENERATED as `{PARENT_CODE}-{ACCOUNT_CODE}` (generic → `{PARENT_CODE}-GEN`; parent code = external_sku_id or sanitized name; collision suffix -2, -3…), read-only preview in UI.
- Tested: iteration_319 — backend 9/9 pytest, frontend E2E 100%. Regression file: `/app/backend/tests/test_iteration_319_child_skus.py`.
- User decisions: Phase 1 only for now; rebranding approval flow NOT wanted yet; fulfilment (Phase 3) may use customer child OR generic OR unbranded stock (all three allowed).

### 2026-06 (current) — SKU Hierarchy Phase 3: Delivery Fulfilment Classification ✅ DONE (tested 11/11 backend + 3/3 frontend flows, iteration_321)
- **Scope**: Stock Out deliveries carry per-line `child_sku_id` (None = Generic). Rules enforced server-side: customer-type child SKUs may ONLY be delivered to their own account; generic-type children + unbranded go to anyone.
- Backend (`distributors.py`, `models/distributor.py`):
  - `DeliveryItemCreate.child_sku_id/child_sku_name`; create_delivery validates child (exists/active/parent-match/customer-match) and hydrates name; demand keyed (sku, batch, child); availability + shortage messages classification-scoped (`[child name]`); derived-on-hand dashboard fallback applies to Generic lines only; `_reserved_qty_map(by_child=True)` nets reservations per classification; items persist child fields.
  - `complete_delivery` deducts and `_readd_completed_delivery_stock` (reverse) restores per classification.
  - **Hardened all classification-less stock flows to Generic-only rows** (`child_sku_id: {"$in":[None]}`): factory shipment confirm/deliver/reverse (+under-received refund, destination removal, `_apply_stock_on_delivery`), promo dispatch adjust/availability/FIFO batch allocation, factory returns confirm/cancel. Branded stock can never be consumed by classification-less flows.
- Frontend:
  - `DeliveriesTab.jsx`: `classificationAllowed()` (customer matching via child meta); non-batch sources show a "Stock Classification" select per line (data-testid `delivery-classification-{i}`) with per-classification bottle availability, only when branded stock exists; batch cards split per (batch, classification), indigo branding chips, other customers' branded rows hidden, selection + FIFO auto-select set child; delivery detail dialog shows branding badge.
  - `DistributorDetail.js`: fetches `stock_by_child` for source + child SKU metadata; payload includes child fields.
- Testing: iteration_321 — 11/11 backend pytest + 3/3 frontend UI flows, no issues; all fixtures cleaned (Noida generic restored to 9 bottles).

### 2026-06 (current) — SKU Hierarchy Phase 2: Stock Classification + Branding Entry (Model C) ✅ DONE (tested 17/17 backend + frontend smoke)
- **Scope locked by user**: Model C — production runs optionally declare a target child SKU; transfers default to it or override per line; Branding Entry reclassifies Generic ↔ branded with **NO approval**.
- Backend:
  - `production_qc.py`: `BatchCreate`/`BatchUpdate` gained `target_child_sku_id` (denormalised name/code on batch; `""` clears). `transfer-to-warehouse` gained `child_sku_id` (absent → batch target, `""` → Generic, id → child); `factory_warehouse_stock` rows + `warehouse_transfers` history now keyed/stamped with `child_sku_id/name/code`. Force-delete cascade rollback is classification-aware.
  - `distributor_stock_transfers.py`: `TransferItem.child_sku_id/name`; `_adjust_*` stock keys include `child_sku_id` (`{"$in":[None]}` = Generic/legacy); `_read_source_stock` keys are (sku,batch,child)/(sku,child); create validates availability **per classification** with `[child name]` in errors; items persist child fields; delete/edit-qty/reverse all classification-aware. `/location-stock` returns `stock` + `stock_by_child`; `/batches-available` rows split per (batch, classification) with batch-level reservations distributed Generic-first.
  - NEW `routes/branding_entries.py` mounted at `/api/branding-entries`: `GET /stock-breakdown`, `GET /` (audit list), `POST /` — FIFO across batches, moves qty between classifications (total unchanged), `BRD-YYYY-NNNN` numbering, insufficient-stock guard, works for factory AND distributor warehouses. Collection: `branding_entries`.
  - `distributors.py` stock-summary: each by-location SKU item now carries `children` classification breakdown (empty when no branded rows).
- Frontend:
  - `BrandingEntryDialog.js` (NEW): warehouse → SKU (child-enabled with stock) → From/To classification with live availability → qty → notes.
  - `StockDashboard.jsx`: "Branding Entry" button; By-Location SKU rows show "N branded" badge + **collapsed click-to-expand** child breakdown rows (user never answered expanded-vs-collapsed → defaulted collapsed).
  - `StockTransfers.js`: per-line Classification select (non-batch sources with branded stock), batch picker options labelled `[Generic]`/`[child]` with composite batch+classification value, availability scoped to selection.
  - `BatchDetail.js`: transfer panel Stock Classification select (pre-filled from batch target) + Classification column in history.
  - `ProductionBatches.js`: create-batch modal "Target Child SKU (branding)" select for `allows_child_skus` SKUs.
- Testing: iteration_320 — 17/17 backend pytest pass, frontend smoke verified, all test fixtures cleaned up.
- ⚠️ Lesson recorded: parallel `search_replace` calls to the SAME file can clobber each other (last-writer-wins) — two edits were silently lost and re-applied. Edit the same file sequentially.

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

### P1 (SKU Hierarchy next phases — user approved design)
- ~~Phase 2: stock classification (child_sku_id on factory/distributor stock rows), Branding Entry screen (Unbranded → child), auto roll-up stock views with drill-down~~ ✅ DONE 2026-06 (Model C, no approval)
- ~~Phase 3: delivery-order fulfilment classification (fulfilment child_sku_id on items, customer-match validation, deduct from child stock; customer child / generic / unbranded all allowed)~~ ✅ DONE 2026-06 (iteration_321)
- ~~"Branded Stock by Customer" report + classification sections on both stock dashboards~~ ✅ DONE 2026-06-14 (iteration_323)

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

### 2026-07-17 — Admin cancel + permanent delete for Stock Delivery Requests - ✅ DONE
- `POST /api/delivery-orders/{id}/admin-cancel` — CEO/Director/Admin/System Admin can cancel from ANY state before delivery is scheduled (blocked if fulfillment_status is delivery_assigned/scheduled/on_the_way/in_transit/delivered etc.). Cancels a linked DRAFT promo stock-out; blocks with a clear message if the stock-out already reserved stock (must reverse first).
- `DELETE /api/delivery-orders/{id}` — now also permanently deletes CANCELLED requests (admin roles only); draft-delete behavior unchanged.
- Frontend `DeliveryOrders.js`: cancelled rows shown strike-off in list; detail dialog shows a "Request cancelled" banner, admin "Cancel Request" button (with optional reason), and "Delete Permanently" button. `EntityDeliveryOrders.js` also strikes off cancelled entries.
- Tested via curl (all state paths + promo cleanup + 400 guards) and screenshots (list strike-off, cancelled detail, Cancel Request on placed order).

### 2026-07-17 — Stock Delivery Request qty entered in packages (UOM fix) - ✅ DONE
- Create dialog (`DeliveryOrders.js`): when a multi-unit packaging (e.g. 12 Bottle Crate) is selected, the Qty field now accepts the NUMBER OF PACKAGES (placeholder "Qty (crates)"), with a live hint "9 × Crate - 12 (12/pack) = 108 bottles". Converted to bottles (base units) on submit — backend canonical unit unchanged.
- Line total & grand total computed on bottles × ₹/bottle. Detail dialog Qty column shows "108 (9 × Crate - 12)".
- E2E verified: entered 9 crates → stored quantity=108 bottles, total ₹1,080. User reported from PRODUCTION — needs redeploy to go live.

### 2026-07-17 — Promo stock-out list mislabelled bottles as crates - ✅ DONE
- Root cause: `PromoDispatchSection.jsx` showed `total_quantity` (BOTTLES, canonical) with a packaging-derived `unit_label` ("crate") → "48 crates" for a 4-crate (48-bottle) dispatch.
- Backend `list_promo_dispatches` (promo_dispatch.py): now returns `total_packages` (sum of item `packages`) per dispatch; `_promo_unit_label` fixed to pick the last ALPHABETIC word ("Crate - 12" → crate, not "12").
- Frontend: rows with `total_packages` show "{qty} bottles" + "= {packages} crates" hint; date subtotals likewise. Legacy rows (no packages data) keep old rendering.
- E2E verified: 4-crate DO → auto promo → list shows "48 bottles / = 4 crates". User reported from PRODUCTION — needs redeploy.

### 2026-07-17 — Delivery bundle PDF & schedules: package × bottles clarity (UOM fix) - ✅ DONE
- Bug: schedule builder assumed promo/DO lines' `quantity` = package count, but normalized lines store `quantity` in BOTTLES with a separate `packages` field → PDF showed "48 12 Bottle Crate" (48 bottles mislabelled as 48 crates).
- Fixed 3 spots in `distributor_delivery_schedules.py` (all now prefer `packages` when present, per the authoritative `packages × packaging_units` rule from distributors._item_crates): schedule detail item breakdown, schedule-list crate totals, eligible-deliveries totals.
- Bundle PDF line format now: "SKU — Crate - 12 × 4 = 48 bottles" (packaging × packages = bottles). Legacy lines (no `packages`) keep old behavior.
- E2E verified via seeded schedule: detail (pkgs 4 / units 48), list total_crates 4, PDF text "Crate - 12 × 4 = 48 bottles". Needs redeploy for production.

### 2026-07-17 — Bottle Preview "Failed to save / download" fix - ✅ DONE
- Report was from PRODUCTION; preview reproduced fine for all flows (PNG/SVG logo, circle shape, download, approve-save).
- Root-cause hardening: both save & download share `buildCompositeDataUrl` whose only network step was fetching the bottle template from customer-assets.emergentagent.com via the backend `/bottle-preview/proxy-image` — a production egress/proxy failure breaks BOTH actions.
- Fix: bundled the 2 bottle template images locally (`/app/frontend/public/bottles/*.jpeg`), BOTTLE_TEMPLATES now use same-origin paths (no proxy, no external dependency, no canvas taint). `fetchImageAsBlob` fetches same-origin directly, proxies only external URLs.
- Error toasts now surface the underlying error message (HTTP status / backend detail) for diagnosability.
- E2E verified in preview: local image loads (naturalWidth 1600), lead select → logo → circle → download ✓ → Approve & Save to lead ✓ (test design cleaned up). Needs redeploy.

### 2026-07-17 — Promo stock-out detail popup - ✅ DONE
- Clicking a row in the Promotional Stock-Out challan list (`PromoDispatchSection.jsx`) now opens a read-only detail dialog (data-testid `promo-detail-dialog`) via `GET /distributors/{id}/promo-deliveries/{dispatch_id}`.
- Shows: challan #, status/reason badges, recipient (name/company/phone), from-location, delivery date, created by, address, remarks, full items table (SKU, batch, packaging, packages × upp = bottles, ₹/bottle, line value) and totals.
- Footer: Confirm button on drafts (reuses confirmDispatch), Challan PDF button otherwise. Action cells stopPropagation so buttons don't trigger the popup.
- Verified via screenshots: confirmed row detail + draft row detail with Confirm button. Needs redeploy for production.

### 2026-07-17 — Gemini features switched to Emergent Universal Key - ✅ DONE
- User's personal GEMINI_API_KEY ran out of prepaid credits (429 RESOURCE_EXHAUSTED on GST upload).
- Rewrote `/app/backend/utils/gemini_helpers.py` to route through `emergentintegrations.LlmChat` with EMERGENT_LLM_KEY, model unchanged (gemini-2.5-flash). Public API identical, so all callers (GST cert OCR in accounts.py, business-card parse in contacts.py, daily_status summaries, knowledge_base) work unchanged. File attachments handled via temp files + FileContentWithMimeType. Retry/backoff kept.
- E2E verified: gemini_text returns OK; GST certificate upload parsed a synthetic cert correctly (GSTIN, PAN, names, address). Test data cleaned from account. GEMINI_API_KEY left in .env but unused. Needs redeploy for production.

### 2026-07-17 — GST Trade Name shown in account pickers - ✅ DONE
- Requirement: disambiguate same-named outlets using the GST trade name (Tax & Billing section).
- Backend: `assigned-accounts` (distributors.py) now projects + returns `gst_trade_name`; `GET /api/accounts` (server.py) search now also matches gst_trade_name / gst_legal_name.
- Frontend pickers updated (option rows + selected tiles + search filters + "no results" filters): Record Account Delivery (DeliveriesTab.jsx), Customer Returns (ReturnsTab.jsx), Sample Delivery Request recipient picker (DeliveryOrders.js RecipientPicker — also shows trade name for any recipient carrying it).
- Verified via screenshots: trade name renders in list + selected tile; searching by trade name ("Empire Foods") finds the account. Test trade name set on preview account "Empire Restaurant". Needs redeploy for production.

### 2026-07-18 — 2-step Stock Delivery Request dialog (sampling acknowledgement) - ✅ DONE
- CreateOrderDialog (DeliveryOrders.js) is now a 2-page journey: Step 1 shows a bold centered amber notice "This request is for Sampling / Free Trial only — NON-BILLING" + mandatory checkbox "Yes, I understand. We are not going to bill the individual / lead / account for these samples." Continue disabled until checked.
- Step 2 = original form, with a Back button. State resets each time the dialog opens.
- Verified via screenshots (checkbox gating + step transition + back button).
- NOTE: production deploy on 2026-07-17 20:00 FAILED (deployment timeout waiting to become ready). requirements.txt has emergentintegrations pinned, backend starts clean in preview. If user raises it, run deployment_agent.

## 2026-06 (fork): UI cleanup
- Removed the "AI Assist" button from the top-right header of Lead Detail and Account Detail pages (Ask Nyla bottom-right avatar remains the single AI entry point).

## 2026-06 (fork): Share Account Details email enhancements
- Tax Details now includes Trade Name (gst_trade_name)
- Billing Address prefixed with GST Trade Name + Legal Name (deduped)
- Delivery Address prefixed with Outlet (account) name (deduped)
- Applied in both frontend composer (AccountDetail.js buildShareBodyHtml) and backend system template renderer (email_templates.py); seeded system templates now auto-sync body updates

## 2026-06 (fork): Security Audit + Fixes (all verified, 16/16 backend tests pass)
- Audit verdict was FAIL; three findings fixed:
- SEC-001 (CRITICAL): tenant is now bound to the authenticated user (deps.py _bind_tenant + server.py duplicate auth fn); mismatched X-Tenant-ID header -> 403; platform admins (PLATFORM_ADMIN_EMAILS) may still override for cross-tenant management
- SEC-002 (HIGH): CORS narrowed to exact allowlist (preview, prod warehouse-qc-engine.emergent.host, crm.nylaairwater.earth, localhost) + regex only for *.nylaairwater.earth / *.briefingiq.com; removed *.emergent.host / *.emergentagent.com wildcards; all session cookies SameSite=Lax; CORS_ORIGINS env parsing now strips quotes/* (note: backend/.env still has stale CORS_ORIGINS="*" which is now safely ignored)
- SEC-003 (MEDIUM): email template render HTML-escapes substituted values (routes/email_templates.py _substitute escape=True for body_html)
- Remaining hardening backlog (not done): login rate limiting, stronger password policy (currently 6 chars min)
- Regression suite added: /app/backend/tests/test_security_audit_regression.py
- IMPORTANT: production still runs the vulnerable code until user redeploys

## 2026-06 (fork): Login rate limiting (brute-force lockout)
- Mongo-backed lockout in deps.py: 5 failed attempts per (IP + email) within 15 min -> 429 lockout for 15 min; counter cleared on successful login
- Applied to both login endpoints (server.py /auth/login and routes/auth.py); login_attempts.identifier index ensured at startup
- Also fixed 4 remaining samesite=none cookies in routes/auth.py -> lax (SEC-002 completion)
- Verified via curl: 5x401 -> 429 with friendly message; success clears counter; frontend Login.js already displays the detail message

## 2026-06 (fork): QC Station — tablet-first real-time rejection capture (NEW MODULE)
- Same-app new module (moduleKey qc_station) under Production; route /qc-station; menu after Production Batches
- Flow: pick active batch -> pick QC stage -> set crates inspected -> tap large reason tiles (each tap +1 rejected, undo -1, live counter) -> Submit
- Real-time autosave per tap; sessions stored in new qc_sessions collection (tenant-scoped); resume open session on re-entry
- Submit reuses record_inspection so existing balances/reports/costs stay intact (maps reason_id -> reason name)
- Rejection Reasons admin page enhanced: color swatch + lucide icon picker + optional image upload + live tile preview + card grid
- Backend endpoints in production_qc.py: GET /qc-sessions/active, POST /qc-sessions, PATCH /qc-sessions/{id}/tap, PATCH /qc-sessions/{id}, DELETE /qc-sessions/{id}, POST /qc-sessions/{id}/submit; rejection-reasons now carry color/icon/image
- role.py: added qc_station module key/label/Production category
- Tested: testing_agent iteration_335 — 9/9 backend + 100 0.000000rontend pass (new /app/backend/tests/test_qc_station.py)

## 2026-06 (fork): QC Live Board (supervisor real-time view)
- New page /qc-live-board (moduleKey qc_live_board) under Production menu, gated to manager/supervisor+ roles
- Backend GET /production/qc-sessions/live: all OPEN qc_sessions tenant-wide, enriched with total_rejected, reason breakdown (name+color+count), started/last-activity times, active operator count
- Frontend auto-refreshes every 5s; cards show operator avatar+active/idle status, batch/stage, crates/rejected/rej-per-crate, top-reason chips; live pulse header
- Self-tested: curl (2 live sessions rendered) + UI screenshot (2 cards); reuses qc_sessions from QC Station (tested iteration_335)

## 2026-06 (fork): QC Live Board enhancements (4)
- Today floor summary strip: crates inspected, rejected, inspections submitted, live sessions (submitted inspections today + open sessions)
- Reject Rate Guardrail: per-session reject_rate_pct vs tenant threshold -> card turns red + "Reject rate high" badge when over
- Stale Session Alert: sessions idle beyond idle_alert_minutes -> amber card + "Idle — check in" badge + amber avatar
- Big-Screen wall mode: fullscreen toggle + dark high-contrast 4-col layout for the QC floor monitor
- New qc_settings collection (tenant): acceptable_reject_rate_pct (default 5), idle_alert_minutes (default 10); GET/PUT /production/qc-settings; inline settings popover on the board
- Sessions now store bottles_per_crate (for accurate reject 
## 2026-06 (fork): QC Live Board enhancements (4)
- Today floor summary strip: crates inspected, rejected, inspections submitted, live sessions (submitted inspections today + open sessions)
- Reject Rate Guardrail: per-session reject_rate_pct vs tenant threshold -> card turns red + "Reject rate high" badge when over
- Stale Session Alert: sessions idle beyond idle_alert_minutes -> amber card + "Idle — check in" badge + amber avatar
- Big-Screen wall mode: fullscreen toggle + dark high-contrast 4-col layout for the QC floor monitor
- New qc_settings collection (tenant): acceptable_reject_rate_pct (default 5), idle_alert_minutes (default 10); GET/PUT /production/qc-settings; inline settings popover on the board
- Sessions now store bottles_per_crate (for accurate reject %); live endpoint returns settings + today + per-session rate/over_threshold
- Self-tested via curl (over_threshold at 50pct, today summary) + screenshots (light board red+amber cards + today strip; dark wall mode)

## 2026-06 (fork): QC Live Board — Alerts, Shift Report, Drilldown, Trends
- Reject Alerts: one-shot per session (atomic reject_alert_sent flag) fired async on tap when reject % crosses threshold; Slack via post_event_message (event qc_reject_alert, skips if bot unconfigured) + email via Resend to qc_settings.alert_emails (fallback: Production Manager/Supervisor users); alert emails editable in Live Board settings popover
- Shift Report: GET /production/qc-shift-report?date= -> landscape A4 reportlab PDF (per-batch crates/rejected/reject %/top reasons, over-threshold rows red, shift totals); "Shift Report" download button on the board
- Batch Drilldown: clicking a live card opens modal with stage-by-stage inspection history (reuses GET /batches/{id}/history), reason chips + timestamps + remarks
- Trend Sparkers: GET /production/qc-reason-trends -> per-reason 24h hourly buckets (submitted inspections by hour + open sessions at current hour); sparkline SVG panel "Today's defect trends"
- Tested: iteration_336 — 9/9 new + 9/9 regression backend tests pass, all frontend flows verified; new test file /app/backend/tests/test_qc_live_board_enhancements.py

## 2026-06 (fork): UOM clarity confirmation + labels
- CONFIRMED to user: rejections tracked in BOTTLES (qty_rejected), inspections in CRATES (qty_inspected); validation rejected <= crates x bottles_per_crate; stage flow converts bottles -> crate equivalents; total_rejected/balances stored in bottles; QC Station is an extension of core record_inspection (same inspections collection, balances, reports)
- Label tweaks for clarity: QC Station "Rejected bottles" + "each tap = 1 rejected bottle" hint; Live Board "Bottles rejected today", "Rejected (btl)", drilldown "bottles rejected"; shift report PDF column "Rejected (btl)"

## 2026-06 (fork): QC Station integrated with the batch stage flow
- Stage picker now mirrors Batch Detail: per-stage Received/Pending/Passed(crates)/Rejected(bottles) balances + Unallocated tile
- Stages with 0 pending are not inspectable ("receive crates first"); inline "Receive from Unallocated / prev stage (passed)" uses the same POST /batches/{id}/move endpoint as Batch Detail
- Capture screen shows "N crates pending at this stage" and clamps crates-inspected to pending (backend already validates)
- Batch Detail header: new "QC Station" deep-link button -> /qc-station?batch={id} (auto-opens stage step)
- Fixed batch label: batches use batch_code (not batch_number) — sessions, QC Station cards, capture header, Live Board and shift report now show batch_code

## 2026-06 (fork): QC Station <-> Batch Detail integration VERIFIED (iteration_337, 22/22 tests)
- Batch Detail header "QC Station" button deep-links to /qc-station?batch={id} (auto-opens that batch's stage step)
- QC Station stage step mirrors batch flow: per-stage Received/Pending/Passed (crates) + Rejected (bottles) + Unallocated tile; inline Receive uses same POST /batches/{id}/move
- Submissions route through record_inspection -> update same stage_balances + total_rejected; appear in Batch Detail Inspection Records by QC person + reason
- Units confirmed: rejected=bottles, received/pending/passed=crates; Batch Detail column now "Rejected (btl)"; crates-inspected clamped to stage pending
- New tests: /app/backend/tests/test_qc_station_batch_integration.py; test batch 790149fb reset to clean state after testing

## 2026-06 (fork): QC Station batch picker — organized (filters/grouping/color/SKU code)
- Toolbar: search (batch code/SKU), status filter, SKU filter, group-by toggle (By SKU default / By Stage)
- Grouping headers with count; SKU color-coding (deterministic 10-color palette) via left border + soft tile
- Each card prefixed with a SKU-code tile (from batch_code prefix e.g. 600S/20L/B660, else derived volume+variant from sku_name)
- Frontend-only (QCStation.js step 1); openBatch flow unchanged; self-tested via screenshots (both group modes, search, color tiles)

## 2026-06 (fork): QC Station picker — SKU legend + pending-first sort
- SKU colour legend row under toolbar (code + swatch + name for each distinct SKU shown)
- waitingCrates(b) = sum(stage pending) + (unallocated if created); batches sorted desc within each group so waiting batches float up
- Amber "N waiting" badge on cards with crates awaiting QC; frontend-only (QCStation.js step 1), self-tested via screenshot

## 2026-06 (fork): QC Kiosk Login — COMPLETE & VERIFIED
- Face-recognition kiosk gate on /qc-station (on-device @vladmandic/face-api, descriptors only, no images stored) + PIN fallback + manual name pick
- P0 hang FIXED: tfjs wasm backend crash on non-WebGL devices — now explicit webgl→cpu backend init in faceRecognition.js
- E2E verified: face-scan mode streams/scans, manual pick → PIN login (Raju/1234) → operator attribution on QC captures
- Endpoints: GET qc-team, GET qc-team/face-index, PUT qc-team/{id}/pin, PUT qc-team/{id}/face, POST qc-team/verify-pin

### 2026-07-26 — 🧩 Two-layer Module Control: Platform Admin + Tenant Settings redesign ✅ DONE (tested 100%, iteration_338)
- **User request**: All modules/menu items must be controllable in BOTH Platform Admin and Tenant Settings (previously only a small outdated subset was exposed). Tenant settings modules always controllable by Super Admin, System Admin and CEO.
- **Design (user-approved)**: TWO-LAYER control. Layer 1 `tenant.platform_modules` = platform provisioning (super-admin emails only). Layer 2 `tenant.modules` = tenant toggles (super admin OR role CEO/System Admin; Director/Admin see read-only). Sidebar item visible only if BOTH layers enable it (missing key = enabled).
- **Single source of truth**: `frontend/src/config/moduleRegistry.js` — ~110 module keys in 17 groups matching the sidebar exactly (Sales Core/Reports/Ops, Pricing, Product Tools, Documents, Requests, Production, Distribution, Marketing, Accounting, Organization, Fleet, Product & SKU, Master Data, AI & Knowledge, Finance & Audit, Settings & Integrations). ADD NEW SIDEBAR moduleKeys HERE ONCE — both settings UIs pick them up.
- **Shared UI**: `components/admin/ModuleMatrix.jsx` (search, group enable/disable-all, per-item switches, locked rows w/ lock icon for platform-disabled; testPrefix prop → `tenant-module-*` / `platform-module-*` testids).
- **Backend**: `models/tenant.py` TenantModules `extra=allow` + `Tenant.platform_modules` dict; `tenant_admin.py` PUT /current/config — modules editable by super admin/CEO/System Admin, platform_modules 403 for non-super-admin; `platform_admin.py` PUT tenants/{id} accepts platform_modules.
- **Frontend**: TenantSettings Modules tab rebuilt on ModuleMatrix (locked platform-disabled rows greyed, read-only mode for Director/Admin); PlatformAdmin Modules tab now edits platform_modules with full registry; TenantConfigContext.isModuleEnabled checks BOTH layers.
- **Verified**: testing_agent iteration_338 — backend 5/5 (role gates, persistence, 403s), frontend 100% (search, bulk toggles, save→sidebar disappearance E2E, platform lock reflected in tenant view, regressions). ⚠️ Redeploy for production.

### 2026-07-26 — ✏️ Editable Issue title (Issues module) ✅ DONE (self-tested)
- `CustomerComplaintDetail.js`: pencil icon next to the title (visible with edit permission) → inline Input w/ Save (Enter) / Cancel (Esc); calls existing PUT /api/complaints/{id} {title}. Testids: complaint-title-edit-btn / -edit-input / -save-btn / -cancel-btn. Backend already supported title in ComplaintUpdate. Verified E2E (UI edit persisted to DB via API check, then reverted).

### 2026-07-26 — ✏️ Editable Issue details (inline) ✅ DONE (self-tested E2E)
- `CustomerComplaintDetail.js`: pencil on the Details card header → inline Textarea w/ Save/Cancel (testids complaint-details-edit-btn / -edit-input / -save-btn / -cancel-btn), uses existing PUT /api/complaints/{id} {details}. Verified: edit persisted, then reverted.
- ⚠️ AGENT LESSON: do NOT issue multiple parallel search_replace calls against the SAME file — they clobber each other (caused corrupted duplicates twice this session in TenantSettings.js and CustomerComplaintDetail.js). Sequential edits per file.

### 2026-07-26 — 🌐 Global Stock Dashboard (Distribution) ✅ DONE (self-tested, curl + screenshots)
- **New menu item** "Global Stock Dashboard" (Distribution workspace, route /global-stock-dashboard, moduleKey `global_stock_dashboard` — added to moduleRegistry).
- **Backend**: new `routes/global_stock_dashboard.py` → GET /api/distributor/global-stock-dashboard. Hierarchy Warehouse → parent SKU → child SKU with 4 metrics each in BOTH crates & units: on_hand (distributor_stock=CRATES + factory_warehouse_stock=UNITS/bottles ÷ bottles_per_crate), delivered (delivery status delivered/complete), reserved (draft/confirmed/scheduled deliveries), sent (completed outbound stock transfers by source_location). units_per_crate per SKU from row-level bottles_per_crate → master_skus packaging fallback. ⚠️ UNIT TRUTH: factory_warehouse_stock is BOTTLES; distributor_stock/deliveries/transfers are CRATES.
- **Frontend**: `pages/GlobalStockDashboard.jsx` — KPI cards, Crates⇄Units toggle (gsd-unit-crates/units), search (gsd-search-input), collapsible warehouse cards w/ inline totals, expandable SKU rows w/ child breakdown incl. "Generic / Unbranded" bucket (only when real children exist).
- Verified: grand totals cross-checked vs raw Mongo (6,976 crates / 123k units); child hierarchy shows 24 Brand → Generic 300u + branded child 100u w/ 24u reserved.

### 2026-07-26 — 📱 Mobile/Tablet Responsiveness — Round 1 ✅ DONE (tested 100%, iteration_339)
- **Global CSS** (bottom of index.css, @media max-width:767px): every <table> → display:block + overflow-x:auto (horizontal swipe instead of clipping, no per-page wrappers needed); div[role=dialog]/[role=alertdialog] → max-height 92vh + overflow-y auto + max-width calc(100vw-1rem).
- **Issues page** header buttons row → flex-wrap (New Issue no longer clipped at 390px).
- Verified 390px/820px/1920px: no horizontal overflow on leads/accounts/dashboard/issues/global-stock-dashboard; desktop tables unaffected; dialogs fit.
- **Future rounds (backlog)**: card-style row layouts for key tables on phones; distribution portal + production + approvals screens deep pass.

### 2026-07-26 — 📱 Mobile/Tablet Responsiveness — Round 2 ✅ DONE (screenshot-verified 390px + desktop regression)
- Header wrap fixes (clipped action buttons at 390px): LeaveManagement.js, TravelRequest.js, BudgetRequest.js (flex-wrap + gap-3); TravelRequest From/To values break-words (no more overlap).
- Distributor portal: DeliveriesTab.jsx Stock Out section header now wraps ("Generate Missing EBEs" no longer overflows). Portal home/stock dashboard verified fine on mobile.
- Issues list: NEW mobile card layout (<sm) in IssuesTable — data-testid complaints-card-list / complaint-card-{id}; desktop table untouched (hidden sm:block).
- Leads list: viewMode now defaults to 'cards' on phones (<640px), 'table' on desktop.
- Noted (not fixed, minor): unknown routes like /distributor-stock render a blank page (no 404 catch-all).
- Verified: Issues cards + Leads cards + fixed headers @390px; desktop Issues=table, Leads=table.

### 2026-07-27 — 📱 Mobile/Tablet Responsiveness — Round 3 ✅ DONE (screenshot-verified 390px + desktop regression)
- Accounts list: mobile card view (<sm) — accounts-card-list / account-card-{account_id} (name, lead-type badge, city/state, contact, sales person, category); desktop table hidden sm:block, unchanged.
- Distributors list: mobile card view — distributors-card-list / distributor-card-{id} (name, status badge, code, self-managed, contact, coverage/locations); pagination footer now wraps.
- NEW 404 catch-all: pages/NotFound.jsx + <Route path="*"> in App.js (Go Back / Go Home buttons) — unknown routes no longer render blank pages.
- Accounting dashboard audited @390px: already fully responsive, no changes needed.
- Verified: 13 account cards + 17 distributor cards on phone; desktop shows tables (cards hidden); /distributor-stock now shows 404.

### 2026-07-27 — 📲 PWA support (installable app) ✅ DONE (self-tested)
- Manifest/icons/iOS meta already existed. Added SAFE service worker `public/pwa-sw.js`: network-first navigations (NEVER caches app bundles — a caching SW previously caused stale-version bugs, see kill-switch /sw.js), precaches only offline.html + 2 icons + manifest; offline fallback page.
- Registered in src/index.js ONLY for production builds (dev/preview skips → no hot-reload conflicts). Chrome/Android install prompt now eligible after redeploy; iOS Add-to-Home-Screen works via existing apple meta tags.
- Verified: pwa-sw.js/manifest/offline.html/icons all served 200 with correct content types; SW syntax checked. ⚠️ SW activates only on the PRODUCTION deployment after redeploy.

### 2026-07-27 — 🛠 Issues module upgrade: multi-assign, multi-department, no category, close/reopen, idle indicator ✅ DONE (tested, iteration_340)
- Backend (customer_complaints.py): `assignees` [{id,name}] + `departments` [str] arrays (legacy assigned_to/assigned_to_name/department mirrored = first entry, existing docs migrated); Category REMOVED from schemas/validation/options/filters/export/import (CATEGORIES const deleted; legacy docs may still carry field, ignored); filters: department matches array OR legacy field, assigned_to matches assignees.id OR legacy, unassigned = both empty; close/reopen via status w/ closed_at + reopened_at timestamps; export/import/template use 'Departments'/'Assignees' comma-separated columns.
- Frontend: CustomerComplaints.js exports getDepartments/getAssignees/daysSinceUpdate/IdleBadge/MultiPick (searchable checkbox popover); list shows dept badges + assignee names + prominent 'Last Update' IdleBadge (green<3d, amber 3-6d, red≥7d, grey when closed) on desktop col + mobile cards; group-by Department/Assignee is multi-membership; Create dialog + Detail Manage use MultiPicks; Detail header: dept badges + prominent IdleBadge + Close Issue / Reopen Issue buttons (complaint-close-btn / complaint-reopen-btn).
- Tested: backend curls all pass; testing agent frontend 100% E2E (create 2+2, badges, close→reopen, mobile cards, legacy compat). Note: still CMP- prefix (ISS- switch remains backlog).

### 2026-07-27 — Issues: "Departments" relabelled to "Category" ✅ (screenshot-verified)
- UI labels only (field remains `departments` array of DEPARTMENTS enum): list column, filter, group-by option, create dialog + detail Manage labels, export/template header 'Category', import accepts category/departments/department headers.

### 2026-07-27 — 🏷 Task Categories master + Issues → "Tasks - Internal" ✅ DONE (backend curls + UI screenshots verified)
- NEW Admin master: Task Categories (backend routes/task_categories.py, coll `task_categories`, seeded 6 defaults, CRUD admin-roles-gated; frontend pages/TaskCategories.js at /admin/task-categories, moduleKey task_categories, nav under Master Data).
- Issues module renamed "Tasks - Internal" (nav items x2, page h1, "New Task" button/dialog; route stays /complaints, moduleKey customer_complaints).
- Column relabel: departments array now shows as "Department" again; NEW single-value `category` field (string) populated from Task Categories — column, filter (filter-category), group-by, create dialog select (complaint-category-select), detail Manage select + header badge; backend filter ?category=, export/import/template have both Department + Category columns.
- Legacy docs may carry old enum category values (e.g. 'quality') — displayed as-is; detail select tolerates unknown values.

### 2026-07-27 — Rename: 'Sample Delivery Requests' → 'Delivery Requests' ✅ (sidebar nav x3 groups + moduleRegistry; page h1 remains 'Stock Delivery Requests')

### 2026-07-27 — Nav fix: 'Tasks - Internal' (customer_complaints) removed from SALES sidebar; lives only under PRODUCTION. 'Tasks & Requests' (task_management) untouched everywhere. ✅

### 2026-07-27 — 🎛 Stock Transfers row actions → ellipsis dropdown ✅ (screenshot-verified)
- StockTransfers.js: all row actions (Invoice/Challan PDF, E-way Bill, Share, Retry Zoho, Edit Qty, Categorize, Reverse, Cleanup) moved from inline buttons into a DropdownMenu (transfer-actions-btn-{id}) in a new trailing column; Zoho cell keeps status badge + external link + Reversed badge; all original data-testids preserved as menu items. ShareDialog now exported from components/share/ShareButton.jsx and opened via shareTransfer state (dialog must live outside dropdown). Reverse styled destructive red.

### 2026-07-27 — 🔍 Stock Transfer detail popup + RetroCategorize contrast fix ✅ DONE
- BUG FIX (testing_agent iteration_341 verified): RetroCategorizeDialog picker highlighted option was unreadable (dark green accent bg vs dark text) → CommandItem now data-[selected=true]:bg-violet-100 text-slate-900.
- NEW: TransferDetailDialog in StockTransfers.js — click any transfer row (transfer-row-{id}, guards clicks on buttons/menus) → popup (transfer-detail-dialog) with: header badges (doc type/zoho/reversed + Zoho # & link), source→destination card w/ GSTINs, items table incl. 'Branding / Child SKU' column (badge or 'Generic (unbranded)') + bottles subtext + rate/value, totals footer, and Customer-branded vs Generic summary cards with per-child breakdown. Verified incl. child SKU rendering (temp DB tag, reverted).

### 2026-07-27 — Transfer detail Qty display fix ✅ (screenshot-verified): '100 12 Bottle Crate' → '100 × 12 Bottle Crate' (qty bold slate, × grey, packaging name emerald)

### 2026-07-27 — 🎯 RetroCategorizeDialog UX overhaul ✅ DONE (testing_agent iteration_342, 100% frontend)
- Shared dialog (Stock Transfers + Stock Out/DistributorDetail): (1) light-violet readable option highlight (verified interactively this time); (2) quantity stepper −/+ (retro-qty-minus/plus) + blue live math badge 'N × upp = M bottles' (retro-units-calc) + amber split note (retro-split-note) + inline qty error gating submit; (3) line summary 'N × <packaging> = M bottles'.
- NOTE: user was testing on PRODUCTION where fixes aren't deployed yet — reminded to redeploy.

### 2026-07-28 — Categorize pop-up issue RESOLVED (root cause: environment)
- User confirmed they were testing on the PRODUCTION deployment. All RetroCategorizeDialog UX fixes (readable picker highlight, qty steppers, live math badge, split notes) are complete and verified on preview (iteration_342). User instructed to click Deploy to push latest code. No further code changes needed.
- CMP- → TSK- prefix switch: user explicitly deferred ("No, focus only on the popup issue"). Remains in backlog.

### 2026-07-28 — 🌍 Global Stock Dashboard: full column parity with distributor Stock Dashboard ✅ (curl + screenshot verified)
- Backend (global_stock_dashboard.py rewrite): METRICS now received/delivered/reserved/sent/empty_bottles/product_returns/factory_returns/on_hand + derived available (= on_hand − reserved) at child/SKU/warehouse/grand levels. New sources: delivered shipments (per distributor_location_id, _item_units heuristic packages×pu), inbound transfers count into received (dest_location_id), factory production stock counts into received, customer_returns → empty_bottles (empty_reusable+promotional) / product_returns (damaged+expired) attributed to distributor DEFAULT location (returns carry no warehouse), distributor_factory_returns → factory_returns per distributor_location_id. Delivery items switched from crates=quantity to units=_item_units heuristic (consistent with distributor dashboard).
- Frontend (GlobalStockDashboard.jsx): 9 KPI cards (grid 2/3/5) w/ tooltips; warehouse header shows Received/Delivered/Wh.Stock/Available; table renders all 9 metric columns via METRIC_DEFS loop (colored headers matching distributor tab), horiz-scrollable min-w-900. 'Sent' relabelled 'Transfer Out'.
- Semantics answered for user: Delivered = stock-out to CUSTOMER accounts; Transfer Out (prev 'Sent') = warehouse→warehouse transfers.

### 2026-07-29 — 📥 Global Stock Dashboard Excel export ✅ (curl + E2E download verified)
- Backend: aggregation refactored into _build_dashboard(); NEW GET /api/distributor/global-stock-dashboard/export?unit=crates|units → styled .xlsx (openpyxl): dark header, green warehouse-total rows, indented child-SKU drill-down rows (grey fill), GRAND TOTAL row, frozen header. Columns: Warehouse/Owner/City/Type/SKU/Child SKU/Units-per-Crate + all 9 metrics in chosen unit.
- Frontend: Export button (gsd-export-btn) next to Refresh, honors current Crates/Units toggle, blob download w/ auth header + loading spinner.

### 2026-07-29 — 🏷 Task Categories master repopulated with 12 business values ✅ (curl verified, preview)
- task_categories.py: DEFAULT_TASK_CATEGORIES → 12 values (Payment Issue, Customer Issue, Delivery & Logistics, Production Issue, Water Quality, Product Quality, Future Enhancement, Future Product, Process Improvement, Cost Cutting Initiative, Quality, Stock & Inventory). _seed_defaults now IDEMPOTENT SYNC: inserts missing standard values every list call + deletes legacy v1 defaults (Customer Complaint/Internal Task/Quality Check/Improvement/Maintenance/Follow-up) when unused by any task. → Production DB auto-syncs on first Task Categories/options load after redeploy.
- Tasks - Internal category dropdown already reads master via /api/complaints/meta/options → verified returns the 12.

### 2026-07-29 — Legacy lowercase 'quality' category removed ✅ (curl + DB verified)
- task_categories.py _seed_defaults sync now also NORMALIZES customer_complaints.category case-insensitively to canonical master names ('quality' → 'Quality') — runs idempotently, so production self-heals after redeploy.
- CustomerComplaintDetail.js: removed the 'tolerate unknown category' SelectItem — the category dropdown now shows ONLY active master Task Categories.

### 2026-07-29 — 🏷 Branded Stock by Customer: distributor-scoped customer buckets ✅ (curl verified, temp-data test + cleanup)
- distributors.py: NEW _branded_allowed_account_ids(tenant, dist) → None (no restriction) when distributor owns ≥1 factory warehouse (= master/factory exception), else set of account_ids from account_distributor_assignments (status active). _build_branded_stock_sections(+allowed_account_ids): 0-qty customer buckets skipped for non-associated accounts; buckets HOLDING stock always shown (totals stay truthful). Applied at both call sites: /{id}/stock-dashboard and /dashboard/stock-summary?distributor_id= (tenant-wide summary w/o distributor filter = unrestricted).
- Verified: factory distributor 'Test' shows full catalogue; non-factory 'New' (0 assignments) shows no 0-qty buckets while generic stock intact.

### 2026-07-29 — 📋 Branded Stock by Customer → TABLE format w/ parent-column parity ✅ (screenshot verified both surfaces)
- Backend (distributors.py get_stock_dashboard): NEW child_metrics map keyed (sku_id, child_sku_id|None=Generic/unclassified) built from already-fetched shipment_items/fws_docs/delivery_items/pending_items/customer_returns/factory_returns (child_sku_id added to 3 projections). _build_branded_stock_sections(+child_metrics) attaches entry.metrics = {received, delivered, reserved, empty_bottles, product_returns, factory_returns, wh_stock(=live qty), available(=wh−reserved)}. Flow lines lacking child_sku_id roll into the Generic row (consistent w/ parent totals).
- Frontend (BrandedStockSections.jsx rewrite): 2-column Generic|Customer card layout replaced by ONE table per parent SKU: Child SKU (code + location chips) | Branding badge (Generic/customer) | 8 metric columns matching parent Stock-by-SKU table | totals footer | adjust pencil kept. Feature-detects entry.metrics — tenant Stock Dashboard 'Branded Stock' tab (stock-summary endpoint, no metrics) falls back to Child|Branding|Wh.Stock columns.
- ⚠ Fixed during work: stray duplicate 20-line tail appended to distributors.py (IndentationError line 10641) — truncated; syntax verified.

### 2026-07-29 — 🐛 FIX: "Could not deduct branded stock: no on-hand row" on delivery completion ✅ (reproduced + E2E verified)
- ROOT CAUSE: retro-categorized branded rows in distributor_stock INHERIT batch_id from the generic stock they came from; complete_delivery's non-factory deduction hard-filtered batch_id={"$in":[None]} for delivery lines without a batch → branded row w/ batch never matched → matched_primary=False, spill blocked by same batch filter → HTTP 400 + status reverted to 'confirmed', despite stock being on hand.
- FIX (distributors.py complete_delivery): batch filter applied ONLY when the delivery line explicitly carries a batch_id; otherwise deduct FIFO across all rows of (warehouse, SKU, classification). _deduct_stock_with_spill primary find now sorted created_at asc (FIFO determinism).
- Verified: seeded batch-carrying branded row (600) + batchless delivery line (96) → POST /complete returns 200, row 600→504. Temp data cleaned.
- NOTE: production needs REDEPLOY; the stuck delivery reverted to 'confirmed' and can simply be completed again after deploy.

### 2026-07-31 — 🐛 FIX: branded stock invisible in Stock Out after transfer to master warehouse ✅ (drift scenario reproduced + verified)
- ANALYSIS: preview E2E worked (batches-available correctly returns branded batch rows scoped to account). Root-cause class = ACCOUNT REFERENCE DRIFT: child_skus.customer_account_id may hold the account's business code or the source LEAD id (children created pre lead→account conversion; create endpoint stored RAW payload ref) while Stock Out compares against the account UUID → branded rows silently filtered out of the batch picker.
- FIX: NEW branding_entries.account_ref_set(tenant, account_id) → {UUID id, business account_id code, lead_id}. Applied at ALL branded account checks: batches-available + location-stock (distributor_stock_transfers.py), create-delivery child validation (distributors.py ~5183), retro _resolve_customer_child + eligible-children (retro_categorization.py), frontend classificationAllowed (DeliveriesTab.jsx now matches acct.id/account_id/lead_id). child_skus.py create/update now stores RESOLVED account UUID.
- Verified: set child ref to lead id (DRIV-MUM-L26-001), batches-available with account UUID still returns branded 600-bottle batch row; restored + temp rows cleaned.

### 2026-07-31 — 🔍 Branded stock self-diagnosis hints in Stock Out batch picker ✅ (curl verified 2 scenarios)
- Context: prod still not showing Red Rhino branded batch after redeploy w/ drift fix; single account confirmed; UI renders per (batch,classification) — row confirmed ABSENT from API in prod. Cannot see prod data → built self-diagnosis.
- batches-available now returns `branded_hints[]` when account_id given: scans fws+distributor_stock for ALL of the account's child SKUs and explains exclusions: different_warehouse ("600 units at 'X' — switch From Location"), different_sku, fully_reserved, no_stock_rows ("classification transfer may not have been recorded", only when a child exists under this parent SKU).
- Frontend: DistributorDetail stores deliveryBrandedHintsBySku (reset w/ batches cache), DeliveriesTab renders amber hint box under batch cards (data-testid delivery-branded-hints-{item.id}).
- Verified: hint fires for row at another warehouse; branded card + cross-warehouse hint correct at own warehouse.

### 2026-07-31 — 🐛 ROOT CAUSE FIXED: branded stock "fully reserved by open orders" ✅ (repro + 2-scenario verify)
- Diagnosis chain: prod hint said fully_reserved, but Branded Stock table showed Red Rhino 0 reserved / 600 available → allocation bug confirmed: _reserved_qty_by_batch keyed reservations by BATCH only, and batches-available distributed each batch's reserved pool generic-first → other orders' reservations (generic/Taproom 720) spilled onto Red Rhino's branded row → available 0 → hidden.
- FIX (distributor_stock_transfers.py): _reserved_qty_by_batch now keys {(batch_id,child_sku_id): qty} — order lines reserve EXACTLY their classification (mirrors completion deduction). batches-available allocates per (batch,child); child-tagged reservations with no matching stock row fall back to the batch's Generic row (conservative).
- Verified: generic 700-unit reservation on same batch no longer hides branded 600 (generic row correctly hidden); child-tagged 200 reservation → branded card 400 avail, generic untouched. Temp data cleaned.

### 2026-07-31 — 🐛 FIX: Batch Genealogy showed stock transfers in packages as bottles ✅ (curl verified)
- ROOT CAUSE: transfer items store quantity in PACKAGES (crates) w/ units_per_package + persisted quantity_units (bottles); genealogy summed raw quantity → 100 crates displayed "100 bottles", corrupting timeline + mass balance.
- FIX (admin_batch_genealogy.py): stock_transfer events + reconcile-batch-stock now use quantity_units (fallback quantity × units_per_package). Event note shows packaging breakdown ("100 Crate × 12"). Mass-balance factory resting derivation now also accounts for COMPLETED stock transfers in/out of factory warehouses AND completed direct factory→account deliveries (both previously ignored → resting/drift wrong).
- Verified: ST-2026-0009 (5 crates ×12) now shows qty=60, note '5 Crate × 12'.

### 2026-07-31 — Mass Balance cards show crates alongside bottles ✅ (screenshot verified)
- BatchGenealogy.js MassBalanceCard(+bpc from batch.bottles_per_crate): each card shows sub-line "bottles · N crates" (1-decimal when fractional; hidden when bpc ≤ 1/unknown).

### 2026-08-01 — 🐛 FIX: Role-permission matrix not honored for workspace/module access ✅ (E2E verified w/ temp custom-role user)
- ROOT CAUSE: top-level workspace switcher (Sales/Production/Distribution/Marketing/Accounting/Admin) gated ONLY by department + hardcoded roles (ADMIN_ROLES=['CEO','Director'], ADMIN_CONTEXT_ROLES) in AppContextContext.canAccessModule — the Tenant Settings role-permission matrix (roles.permissions, keys match moduleRegistry) was never consulted → custom roles like "Vice President - Operations" couldn't see Distribution despite matrix grants. (Sidebar canSeeItem in DashboardLayout already honored matrix; ProtectedRoute appModule used same broken canAccess*.)
- FIX (AppContextContext.js): consumes useTenantConfig().rolePermissions; NEW WORKSPACE_GROUPS map (workspace → moduleRegistry group keys; sales covers 7 groups, admin covers fleet/product_sku/master_data/ai_knowledge/finance_audit/settings_integrations); matrixGrantsWorkspace() = any view:true in the workspace's groups; canAccessModule falls through dept checks to matrix; admin/accounting also extended; context-restore effect re-runs on rolePermissions load.
- NOTE: backend create_role fills unspecified modules with view:true defaults — switcher reflects stored matrix faithfully; admins control via Tenant Settings matrix.
- ⚠ LEARNING: parallel search_replace on the SAME file can drop one edit silently — verify both applied.
- E2E: temp role 'VP Operations Test' (dept Sales only) → Distribution appeared in switcher, /distributors loaded w/ matrix-gated sidebar. Temp role+user deleted after test.

### 2026-08-02 — ✅ Credit-note reminder on Record Delivery (testing_agent iteration_343 PASSED)
- DeliveriesTab.jsx: handleCreateDeliveryWithCredits → if account has credit notes w/ balance>0 and none selected → 'Credit Notes Available' dialog (credit-reminder-dialog) listing notes w/ checkboxes (shared selectedCreditNotes state), total line, 'Apply Selected & Record' (disabled until selection) + 'Proceed Without Applying' (submits w/ skipCredits). Reset on dialog close. submitDeliveryWithNotes({skipCredits}) extracted.
- testing_agent iteration_343: popup gating, toggle→total+enable, both buttons, regression (no-credit account submits directly) ALL PASS. Delivery persistence blocked only by PRE-EXISTING preview data issue: margin matrix missing for city 'Hyderabad' (unrelated).

### 2026-08-02 — ✅ RBAC gate on 'New Return' button (screenshot verified)
- ReturnsTab.jsx: canCreateReturn = role has configured matrix ? hasActionPermission('customer_returns','create') : legacy canManage fallback. Matrix is authoritative when present (grants custom roles / denies listed roles). Admin roles short-circuit true in hasActionPermission.
- Verified: temp role w/ distributors.view=true + customer_returns.create=false → Returns tab loads, NO create-return-btn; admin sees it. NOTE: create_role API defaults unspecified modules to view:false for this payload shape — page-level guard (Access Denied) correctly blocked distributor page until distributors.view granted. Temp role+user deleted.

### 2026-08-02 — Create Credit/Debit Note available to anyone who can enter returns ✅
- ReturnsTab.jsx detail dialog footer (~1284): gate switched canManage → canCreateReturn (matrix customer_returns.create when configured, legacy canManage fallback). Cancel Return + Create Note buttons now follow the same rule as New Return. Backend /returns/{id}/approve has no role restriction (auth only).
- ENV NOTE: preview frontend hit ENOSPC (inotify max_user_watches=12288, sysctl denied) → added CHOKIDAR_USEPOLLING=true + WATCHPACK_POLLING=true to frontend/.env; frontend recovered (RUNNING, 200).

### 2026-08-03 — 🔒 Only ACTIVATED accounts assignable to distributors ✅ (curl verified both layers)
- distributors.py search-assignable-accounts: query now requires status:"active" → non-activated accounts never appear in the assignment picker.
- distributors.py create assignment: server-side guard → 400 "Account 'X' is not activated (status: …). Activate the account before assigning" when account.status != active.
- Verified w/ temp status flip (Toopa → pending_activation): search returned empty; direct POST rejected 400; status restored.

### 2026-08-05 — 🔐 Tasks - Internal now RBAC-controlled & findable in role matrix ✅ (E2E verified w/ temp role)
- ROOT CAUSE: customer_complaints existed in role matrix but still LABELED "Issues" (models/role.py MODULE_LABELS) → user couldn't find it to assign.
- models/role.py: label → "Tasks - Internal"; NEW task_categories module (DEFAULT_MODULE_PERMISSIONS all-false + Operations category + label "Task Categories (Tasks - Internal)").
- AppContextContext.js: NEW WORKSPACE_EXTRA_KEYS {production: [customer_complaints, task_categories]} — grant unlocks Production workspace (nav item lives there while registry key is in sales_ops group).
- Verified: temp role w/ only customer_complaints grant → Production workspace + sidebar "Tasks - Internal" + /complaints page loads incl. New Task. Temp role+user deleted.

## 2026-08-05 — Factory Return (Stock Out Distributor → Factory) availability fix
**User report (production)**: All available stock showed 0 in the Stock Out → Factory Return dialog; wanted availability shown in crates (SKU default packaging) AND bottles.
**Root causes (2)**:
1. Backend `factory_returns.py` `GET /{distributor_id}/available-stock` derived availability from shipment history only — missed stock from production/stock transfers → zeros. Rewritten (`compute_available_stock_at_distributor`) to use live stock rows (`distributor_stock` + `factory_warehouse_stock` for the distributor's locations), minus draft warehouse factory-returns (confirmed ones already deducted live rows), plus customer-return pending quantities. Response now includes `units_per_crate` (from stock rows `bottles_per_crate`, falling back to master SKU `bottles_per_crate` / default `packaging_config`).
2. Frontend `DeliveriesTab.jsx` SKU dropdown listed only margin-matrix SKUs — SKUs with real stock but no margin row (e.g. 600ml Silver with 1,434 bottles) were invisible. Now `factoryReturnSkus` = margin SKUs ∪ any SKU with live available stock.
**Display**: `formatCratesBottles` helper — whole crates + leftover bottles + total, e.g. "119 crates + 6 bottles (1434 bottles)"; same format in the per-item max hint ("Quantity is in bottles."). SKUs whose default packaging is Bottle (upc=1) show bottles only.
**Verified**: curl on 2 distributors (nonzero wh qty + upc) + screenshot E2E on preview (dialog options + hint correct). NOT yet in production — user must redeploy.

## 2026-08-05 — Tasks - Internal: Due date + reschedule tracking
**User request**: Tasks - Internal need a due date; when it changes, show how many times it changed and how many days the deadline slipped.
**Backend** (`routes/customer_complaints.py`): `due_date` on ComplaintCreate/Update (validated YYYY-MM-DD via `_clean_date`, 400 on invalid). New doc fields: `due_date`, `original_due_date`, `due_date_history[]` ({from,to,changed_at,changed_by,changed_by_name}), `due_date_change_count`, `due_date_slip_days` (new − original due, negative = pulled in). First-ever set doesn't count as a change; it sets the baseline.
**Frontend**: Create dialog (`CustomerComplaints.js`) has Due Date input (grid with Category). Detail page (`CustomerComplaintDetail.js`) Manage card: date editor + "Rescheduled N× · deadline slipped D days" + original due + full change history. Header shows `DueBadge` (Due date / red Overdue) + amber reschedule badge. List table has a "Due" column (date, red if overdue, "N× moved · +Dd"); mobile cards show DueBadge. Shared exports in CustomerComplaints.js: `fmtDueDate`, `isOverdue`, `DueBadge`.
**Verified**: curl e2e (create w/ due date, 2 slips +10d, pull-in −5d, unrelated update leaves counters, first-set no-count, invalid date 400) + screenshot of detail page (badges, history, field all rendering). Test docs deleted. NOTE: a duplicated JSX tail from a parallel edit briefly broke compile — removed.
**Prod**: needs redeploy.

## 2026-08-05 — SaaS Phase 1: Self-serve signup + onboarding wizard
**User direction**: Make the app sellable as SaaS. Phased plan approved: (1) signup+onboarding wizard w/ templates → (2) configurable terminology → (3) per-user subscription billing (Stripe) → (4) super-admin console. Industries: generic for now. Pricing: per user.
**Already existed**: `/register` page + `POST /api/tenants/register` (tenant + Admin user + default roles/statuses, 14-day trial), tenant selector on login, `X-Tenant-ID` scoping, tenant-admin module toggles (`tenant.modules`), MODULE_REGISTRY (18 groups / 110 module keys).
**Built now**:
- Backend (`routes/tenant_registration.py`): register sets `onboarding_completed=False`; `GET /api/tenants/onboarding/status` (legacy tenants w/o flag → completed=true, no backfill needed); `POST /api/tenants/onboarding/complete` (admin/owner only) — saves `industry_label`, `company_size`, `settings.currency`(+symbol map), merges `modules.{key}` bools (key regex-validated), creates invited users w/ `secrets` temp password + `force_password_change=True` (existing change-password flow clears it), returns invited[]+skipped[].
- Frontend: `pages/OnboardingWizard.js` (standalone route `/onboarding`, own auth guard, NO DashboardLayout) — 4 steps: Company (industry/size/currency) → Template (Sales CRM / Sales+Distribution / Full Suite / Custom — group-based module presets expanded client-side from MODULE_REGISTRY) → Modules fine-tune (group toggles + per-module checkboxes, live count) → Invite team (name/email/role rows) → done screen with copyable temp passwords. `Login.js`: post-login, Admin-role users with incomplete onboarding are redirected to `/onboarding`. `FaceIdSetupPrompt.jsx`: auto-prompt suppressed on `/onboarding`.
**Verified**: curl (register, status false→true, complete w/ modules+invites, invalid email skipped, invited login w/ force_password_change, admin-only) + full UI E2E screenshot (login→redirect→4 steps→done, template changed module count 88/110, modules persisted correctly on tenant doc). Test tenants (test-saas-co, fresh-foods) deleted after verification.
**Gotcha hit**: App.js import line lost in parallel edit (route without import → runtime error) — reapplied.
**SaaS backlog**: P1 configurable terminology/labels per tenant; P2 Stripe per-user billing + plan gating + trial enforcement (trial_ends_at exists but is NOT enforced yet); P3 super-admin console (platform_admin.py exists, needs UI/protection — note `GET /api/tenants/list` is currently unprotected, tighten during super-admin phase); email verification for signup (token generated, send is TODO).

## 2026-08-05 — SaaS Phase 2: Custom Terminology per tenant
**Built**:
- Backend (`tenant_admin.py`): `PUT /api/tenants/current/terminology` (tenant admin only) — allowed keys `unit|package|distributor|factory|sku`, each `{singular, plural}` (40-char cap, unknown keys dropped). Stored as `tenant.terminology`; flows to frontend via existing `GET /current/config`. Empty body `{}` resets to defaults.
- Frontend `TenantConfigContext.js`: `DEFAULT_TERMINOLOGY` (Bottle/Crate/Distributor/Factory/SKU), reactive `term(key,{plural,lower})` in context + module-level `getTerm()` (cached, safe for helpers/subcomponents — pages render behind the config loading gate so it's populated before mount).
- Settings UI: new **Terminology** tab in Tenant Settings (`components/settings/TerminologyEditor.jsx`) — 5 concept rows (Sales Unit / Bulk Package / Channel Partner / Production Site / Product Variant) with singular+plural inputs, reset-to-defaults, save → refreshConfig.
- Applied to surfaces: sidebar nav labels (`DashboardLayout.js` navLabel regex for Distributor/s), DistributorList (h1, breadcrumb, KPI, Add button, dialog title, table title, column header), Factory Return dialog availability + qty hints (`DeliveriesTab.jsx` formatCratesBottles), BatchGenealogy (mass-balance cards, event qty, crates× badge, resting empty state), GlobalStockDashboard (subtitle + Crates toggle button).
**Coverage note**: terminology is applied to the highest-visibility surfaces; many deeper strings (stock dashboard columns, settlement screens, exports, backend-generated notes like "5 Crate × 12") still say bottles/crates/distributor — extend incrementally via `getTerm()`.
**Verified**: curl (PUT w/ bogus key dropped, config round-trip, reset) + UI screenshots with Piece/Carton/Dealer overrides: list page showed "Dealers/Add Dealer/Total Dealers", factory-return options showed "5 cartons + 17 pieces (137 pieces)", settings tab editable. Nyla terminology reset to defaults after testing.

## 2026-08-05 — SaaS Phase 3: Per-user billing (Stripe) + trial enforcement
**Setup**: Claimable Stripe sandbox NOT available (user country IN unsupported) → Flow B: emergentintegrations StripeCheckout with shared test key `STRIPE_API_KEY=sk_test_emergent` in backend/.env. LIVE payments require user's own Stripe key later.
**Model**: per-seat cycle billing (NOT Stripe-native recurring): amount = active users (excl. Driver/Distributor roles, min 1) × $10 (SERVER-side `PRICE_PER_SEAT_USD` in `routes/billing.py`) per 31-day cycle; payment extends `tenant.subscription_valid_until` (stacks on remaining time). Renewal = admin pays again ("Extend 31 days" button).
**Backend** (`routes/billing.py`, mounted in routes/__init__.py): GET /api/billing/info (plan/trial/seats/pricing); POST /api/billing/checkout (admin roles only, metadata tenant_id, txn in `payment_transactions`); GET /api/billing/status/{session_id} (polls Stripe, idempotent `_mark_paid_and_extend` — flips txn paid + sets tenant subscription_plan=pro/status=active/is_trial=false/seats/valid_until); POST /api/webhook/stripe (same idempotent activation).
**Frontend**: `pages/Billing.js` (/billing — seats × price cards, status badge, upgrade/extend, admin-only button); `PaymentSuccess.js` (/payment/success — polls status 8×2s); `PaymentCancel.js`; TenantSettings header "Billing & Plan" button; **trial gate in App.js ProtectedRoute** — lock screen when trial_ends_at past && subscription_status!=='active', exempts /billing; admins get upgrade CTA.
**CRITICAL GUARD**: legacy tenants (no `onboarding_completed` field on tenant doc — i.e. nyla-air-water, demo-co incl. in PRODUCTION DB) are EXEMPT from trial enforcement in BOTH backend `_sub_state` and the App.js gate. Also preview DB: nyla/demo-co set is_trial=false. Never remove this guard without migrating production tenant docs.
**Verified E2E**: real Stripe test payment via playwright (4242 card, ZIP needs input[placeholder="ZIP"]) → success page → tenant activated (pro/active/+31d) → lock lifted; expired-trial lock screen shown pre-payment; nyla unaffected. Test tenant `billing-test` KEPT as billing demo (see test_credentials.md).

## 2026-08-05 — SaaS Phase 4: Super-admin (platform) console
**Pre-existing**: `routes/platform_admin.py` (/api/platform-admin/*) with env `PLATFORM_ADMIN_EMAILS` (default surya.yadavalli@gmail.com + @nylaairwater.earth) + `pages/PlatformAdmin.js` at /platform-admin + nav item in `adminNavigationGroups` (visible in Admin module context only).
**Added**: stats now include paying_tenants / total_revenue / paid_transactions (from payment_transactions); tenant list includes subscription_status/valid_until/seats/onboarding_completed/industry_label + Pro badge in UI; 2 new KPI cards (Paying, Revenue); GET /api/platform-admin/me (server-verified admin check — replaced hardcoded frontend email lists in PlatformAdmin.js AND DashboardLayout.js).
**Suspension enforcement** (integration_expert playbook): the ACTIVE login route is in `server.py` (~line 3398, NOT routes/auth.py which also got the check but is shadowed) — suspended tenant (is_active=false) login → 403 "workspace has been suspended"; toggle-status disable also deletes user_sessions (matched by tenant users' ids — session docs from server.py login have NO tenant_id field!) so live sessions die instantly (verified 401).
**Security tightening**: removed public /migrate-users-tenant + /check-user-tenant endpoints; GET /api/tenants/list now requires platform admin (verified 401 unauth; frontend has no usages).
**Verified**: curl (me/stats/suspend 403/session revoke 401/re-enable 200, removed endpoints 404) + console screenshot (12 tenants, revenue $10, Pro badge). Gotchas hit: duplicate `Crown` import & pre-existing `isPlatformAdmin` const in DashboardLayout caused compile errors — consolidated.

## 2026-08-06 — Terminology presets in onboarding + settings
- `frontend/src/config/terminologyPresets.js`: TERMINOLOGY_PRESETS for 9 industries (F&B, FMCG, Pharma, Apparel, Manufacturing, Wholesale, Retail, Agriculture, Services) covering the 5 term keys. 'Apparel' added to wizard INDUSTRIES list (was missing).
- Onboarding wizard step 1: selecting an industry shows a preset panel (checkbox "Use X terminology", default ON, chips previewing all 5 terms); payload sends `terminology` → backend onboarding/complete sanitizes (same ALLOWED_TERM_KEYS validation) and stores tenant.terminology.
- TerminologyEditor (Tenant Settings): "Industry preset" select prefills the singular/plural inputs (explicit Save still required).
- Verified: full wizard E2E (Apparel → tenant.terminology stored with Piece/Carton/Dealer/Workshop/Style) + settings preset prefill screenshot (Pharma → Strip/Stockist, not saved). Test tenant threadly deleted.
- Recurring gotcha: JSX block edits in parallel batches got silently lost twice more (wizard preset panel, App.js import) — always grep-verify after batched edits to the same file.

## 2026-08-06 — Wider terminology coverage (stock dashboards, settlements, Excel exports)
**Backend**: new `core/terminology.py` — `get_terms()` (tenant terminology merged over defaults, current-tenant context) + `term(terms,key,plural,lower)`. Applied to Excel exports: Global Stock export (`global_stock_dashboard.py` — sheet title "Global Stock (cartons)", headers Item / Child Item / Units per Carton) and Stock Out deliveries export (`distributors.py` ~4783 — SKU→term, 'Billed to Dealer', 'Adjustment (Dealer to Plant)').
**Frontend** (all via getTerm): `StockDashboardTab.jsx` (Empty Units KPI, Empty {units} & Returns card + subheadings, unit toggle Bottles/Default Crates, Factory Returns KPI, Empty Bottles column, footer caption); `SettlementsTab.jsx` (Dealer Margin everywhere, pays-direction labels, Factory→Plant Return Credit/Ret. columns, formula description, frontend Excel export columns via computed keys); `GlobalStockDashboard.jsx` (METRIC_DEFS labels as functions for empty_bottles/factory_returns — render sites handle `typeof label==='function'`, KPI unit sublabels, subtitle); `DistributorDetail.js` breadcrumb Distributors→term.
**Verified**: set Piece/Carton/Dealer/Plant/Item on nyla → both Excel exports show custom headers (openpyxl inspection), 3 UI screenshots (stock tab, GSD, settlements — zero residual Factory/Distributor strings on settlements). Nyla terminology reset to defaults after testing.
**Known residuals**: ~8 deep 'bottle' strings remain on stock tab (tooltips/table internals), backend-generated genealogy notes ("5 Crate × 12") still default terms.

## 2026-08-06 — Workspace dropdown honors tenant modules + platform-admin visibility verified
**User concerns**: (1) Platform Admin visible to customers? (2) Disabled modules still show in the workspace (MODULE) dropdown.
**Fix (2)**: `AppContextContext.js` — new `tenantAllowsWorkspace(moduleId)` gate at top of `canAccessModule`: workspace appears only if ≥1 module in its WORKSPACE_GROUPS (+WORKSPACE_EXTRA_KEYS) is enabled per tenant module config (`isModuleEnabled` from useTenantConfig). 'admin' workspace always allowed (tenant settings must stay reachable). Verified with a sales-only tenant: dropdown showed Sales+Production+Admin only (Distribution/Marketing/Accounting hidden). Production remains BY DESIGN when Tasks - Internal (customer_complaints, part of sales template) is enabled since it renders in the Production sidebar.
**Verified (1)**: customer tenant admin → GET /platform-admin/me = false (sidebar item at DashboardLayout line ~507 renders only when true) and /platform-admin/stats = 403. Platform admin visibility is server-controlled via PLATFORM_ADMIN_EMAILS env; customers cannot see or access the console. Production also safe (old build used hardcoded owner emails).
Test tenant sales-only deleted.

## 2026-08-06 — Public marketing landing page
- User choices: placeholder brand "FlowStack — the operations CRM"; lives at root `/` (replaced SplashScreen route — logged-in users are redirected to /home from Landing via useAuth); pricing copy = 14-day free trial, $10/user/month, all modules.
- `pages/Landing.js` built per design_agent guidelines (Swiss high-contrast: Outfit + IBM Plex Sans via inline Google Fonts link, Klein blue #002FA7 accent, #FFD600 secondary, 1px black/10 borders, no gradients): glass fixed header (Sign in → /login, Start free trial → /register), asymmetric hero w/ warehouse photo, bento feature grid (Sales CRM / Distribution / Production & QC / Terminology / RBAC), industries grid w/ photos (Apparel/Pharma/F&B/FMCG + their term sets), dark pricing card ($10 per user/month, yellow CTA), final CTA + footer. Framer-motion staggered whileInView entrances.
- Verified: screenshots (hero, pricing, industries all render w/ images), CTAs navigate to /register, logged-in `/` → /home redirect works. SplashScreen import retained but unused route removed.
- Rename note: brand is placeholder — swap "FlowStack" strings in Landing.js when user picks a real name.

## 2026-08-06 — Hostname-based tenant resolution (custom domains / subdomains)
**Backend** (`tenant_registration.py`):
- `GET /api/tenants/resolve/host?host=` (public; NOTE path is /resolve/host with 2 segments because tenant_admin's GET /{tenant_id} — mounted first — shadows any 1-segment GET under /tenants): normalizes host (strips scheme/port/www, lowercase), matches `tenants.custom_domain` exact first, else (non-platform hosts only: guards .emergentagent.com/.emergent.host/localhost) first hostname label as tenant_id. Suspended tenants resolve to null.
- `PUT /api/tenants/current/custom-domain` (tenant admin): hostname regex validation, platform domains rejected 400, cross-tenant uniqueness 409, empty string unlinks.
**Frontend**: `Login.js` resolves window.location.hostname on mount — if matched, locks selectedTenant + hides workspace selector (`hostTenant` state). `Landing.js` — on a resolved host, `/` skips marketing → /login (white-label). New `components/settings/CustomDomainCard.jsx` in Tenant Settings → Company tab (input + save + DNS CNAME instructions, prefilled from tenantConfig.custom_domain).
**Verified**: curl matrix (set w/ messy URL input normalized, invalid 400, platform-domain 400, clash 409, resolve custom/www/subdomain-label/platform-null/unknown-null) + settings UI screenshot. Nyla test domain cleared after testing.
**Platform caveat (told to user)**: app-side resolution is ready; actually serving customer domains needs the HOSTING layer to accept them — Emergent supports linking a custom domain per deployment via "Link domain"/Entri; multi-domain/wildcard per deployment is undocumented → user should email support@emergent.sh. Product name decision: keep "FlowStack — The operations CRM" (landing/signup only); user will upload own logo LATER (pending asset).

## 2026-08-06 — Custom domain DNS verification
- Backend (`tenant_registration.py`): `GET /api/tenants/current/custom-domain/status` — resolves IPs of the tenant's custom_domain and of the serving host (x-forwarded-host → host header) via socket.getaddrinfo (6s timeout, executor); status = verified (IP overlap) / pending (resolves elsewhere) / unresolvable (no DNS) / none. Persists custom_domain_status + custom_domain_checked_at on tenant (cleared on domain change). Platform admin tenant list projection includes custom_domain(+status).
- Frontend: `CustomDomainCard.jsx` auto-checks on load/after save — colored status badge (Verified/Pending DNS/Not resolving), guidance text w/ expected CNAME target, checked-at time, "Check again" button. PlatformAdmin.js workspace rows show "Domain ✓ / Domain pending" badge.
- Verified all 3 states: example.com → pending, nonexistent domain → unresolvable, platform host injected via DB → verified (+UI screenshot showing Verified badge). Nyla domain cleared after testing.

## 2026-08-06 — Nyla-specific landing page (this deployment only)
- Context: This session's deployment = crm.nylaairwater.earth (Nyla-only). FlowStack SaaS lives in a separate session (support_agent confirmed sessions/codebases are fully isolated; Republish here only updates this deployment).
- `Landing.js` rewritten: minimal Nyla Air Water branded page (logo /nyla-logo.png in public/, teal #00A6B8 + navy #003048 from logo), tagline, single "Sign in" CTA. No pricing, no FlowStack, no trial/signup, removed host-tenant redirect fetch.
- Public self-signup removed: `/register` route now redirects to `/login` (RegisterTenant import removed from App.js); "Don't have a workspace? Create one" link removed from Login.js.
- Verified via screenshot: landing renders, no "Start free trial"/"FlowStack" text, /register → /login redirect works, login page clean.

## 2026-08-06 — Landing page rebuilt from user's reference site (hello-world-11369 preview)
- User provided a Nyla brand marketing home page as reference; option (b): same visual content but only Sign in / Team Login clickable.
- `Landing.js` rewritten: Apple-style page (#F5F5F7/#1D1D1F/#86868B, green #2C3E35, Inter font) with hero "Born from Air. Perfected by Nature.", intro + quote, 4 Explore cards, Nyla Journal (3 articles), black CTA banner, full footer (Now Serving cities, Team Login → /login). Nav items + card CTAs rendered as non-clickable spans. Header keeps "Sign in" button.
- Images downloaded locally to /app/frontend/public/landing/ (hero.jpg, blog-air.jpg, blog-alkaline.jpg compressed from 1.5MB png, blog-groundwater.jpg).
- index.html title → "Nyla Air Water — Where Nature Meets Purity" + brand meta description.
- Verified via screenshots: all sections render, blog images naturalWidth>0, footer Team Login navigates to /login.

## 2026-08-06 — Login page rebranded to Nyla clean look
- Login.js restyled to match new landing: left panel = /landing/hero.jpg water image w/ dark bottom gradient, Nyla logo + "Born from Air. Perfected by Nature." headline (logo links to /); right panel #F5F5F7, Inter font, Nyla logo above "Welcome Back", black pill Sign In/Google/Face ID buttons, rounded-xl white inputs. All auth logic untouched (tenant selector, google workspace, face id, onboarding redirect).
- Verified: screenshot + full login flow with test creds → redirected to /home dashboard successfully.

## 2026-08-06 — Favicon & PWA icons rebranded to Nyla logo
- favicon.ico (16/32/48/64, transparent) + favicon-32.png generated from nyla-logo.png; index.html adds sizes=32 png link.
- All /icons/icon-{72..512}.png regenerated (logo centered on white) for PWA/apple-touch.
- manifest.json: name "Nyla Air Water", short_name "Nyla", theme #1D1D1F, bg #F5F5F7.
- Verified: favicon.ico/png/icon-192 all serve HTTP 200; favicon-32.png visually confirmed shows kingfisher logo.

## 2026-08-06 — Mobile polish (landing + login)
- Verified landing & login at 390px: no horizontal overflow, sections stack cleanly, header nav hidden on mobile, form fully usable.
- Login tweaks: logo above "Welcome Back" now links to / (login-logo-home-link); email/password inputs use text-base (16px) to prevent iOS focus auto-zoom.
- Verified on mobile viewport: logo tap → landing; full sign-in → /home.

## 2026-08-06 — Brand font: Helvetica site-wide
- index.css: single @import Arimo (metric-compatible Helvetica fallback for Windows/Android); universal rule `*, *::before, *::after { font-family: 'Helvetica Neue', Helvetica, Arimo, Arial, sans-serif !important; }` overrides all inline fontFamily usages (IBM Plex/Manrope/Cabinet Grotesk/etc. across components) without editing each file. body/h1-h6/.font-heading/.font-body/.font-mono all set to the stack.
- index.html: old Google fonts link (Manrope/Outfit/IBM Plex/JetBrains) replaced with Arimo. Landing.js/Login.js Inter links + inline styles removed → Helvetica stack.
- Verified computed fontFamily on landing h1, login title, and dashboard body = Helvetica stack; layouts intact.

## 2026-08-06 — Brand font in PDF & Excel exports
- Downloaded Arimo-Regular/Bold TTF (Helvetica-metric, includes ₹) to /app/backend/assets/fonts/.
- utils/pdf_generator.py: registers HelveticaBrand(-Bold)=Arimo as _REGULAR_FONT/_BOLD_FONT (FreeSans fallback kept) → debit/credit notes etc. use brand font + ₹.
- services/proposal_pdf.py: FONTS["helvetica"] (default proposal font key) now maps to Arimo; "helvetica" added to _RUPEE_FONT_KEYS so ₹ renders instead of "Rs.".
- New utils/excel_branding.py apply_brand_font(wb): sets font name "Helvetica" on every cell preserving bold/size/color. Wired before all 9 wb.save() sites: accounting_transactions, customer_complaints (x2), distributor_stock_transfers, distributors (x2), global_stock_dashboard, invoices, marketing.
- Other reportlab PDFs (server.py stamp, production_qc, delivery schedules) already use base-14 Helvetica — untouched.
- Verified: e2e global-stock export → all cell fonts "Helvetica"; PDF smoke build with HelveticaBrand + ₹ OK; py_compile all touched files; backend restarted clean.

## 2026-08-06 — Branded logo header on exports
- excel_branding.py extended: brand_workbook(wb) = add_brand_header (insert 4 rows/sheet: kingfisher logo image A1, "Nyla Air Water" bold B2, tagline B3; freeze_panes auto-shifted) + apply_brand_font. All 9 export sites now call brand_workbook(wb).
- Logo copied to /app/backend/assets/nyla-logo.png.
- pdf_generator.fetch_logo_image: falls back to bundled Nyla logo when tenant branding.logo_url missing/unfetchable; 3 call sites now always call it → debit/credit note PDFs always show logo.
- Verified e2e: global-stock, invoices, complaints exports each contain 1 image + header text + Helvetica fonts, freeze panes correct (A6); PDF fallback returns 50x50 Image.

## 2026-08-06 — Login panel image swap (user request)
- Left login panel now uses /landing/forest.jpg (thick misty/moist forest stock photo, Unsplash 1448375240586) instead of the water-droplet image; top-left Nyla logo + "Nyla Air Water" text removed from that panel. Bottom overlay headline kept.
- Right-side small logo above "Welcome Back" retained (still links to /).
- Verified via screenshot: brand block count 0, forest image renders, form untouched.

## 2026-08-06 — Login panel image: dark rain sky
- Replaced forest with /landing/rainsky.jpg (dark storm clouds + raindrops, Unsplash 1534274988757, compressed). forest.jpg removed. Verified via screenshot — fits "Born from the Sky" copy.

## 2026-08-07 — BUG FIX: Stock Out false "stock unavailable" for branded batches (production report)
- Symptom: creating a Stock Out delivery for a customer-branded SKU showed "Quantity exceeds batch availability" / disabled Record Delivery even though the SELECTED batch row had stock. Guard compared against a DIFFERENT row of the same batch.
- Root cause: DeliveriesTab.jsx had two batch lookups matching on batch_id ONLY: (1) per-line over-stock warning (~line 1543), (2) submit guard disabling Record Delivery (~line 1888). Since /batches-available returns one row PER (batch, classification) — generic + customer-branded rows share the same batch_id — `.find(batch_id)` returned whichever row sorted first (received_at FIFO), often the wrong classification.
- Fix: both lookups now also match `(b.child_sku_id || '') === (item.child_sku_id || '')`, same as the availability display at line 1486 and batch-card selection at 1319.
- Reproduced with real preview data (batch TEST24: branded row 98 + generic row 300): old logic blocked a valid 200-unit generic request against the 98-qty branded row; new logic allows it. Backend guard (distributors.py ~5295) was already classification-scoped — no backend change needed.
- NOTE: fix is in PREVIEW; user must Republish to get it on production (crm.nylaairwater.earth).

## 2026-08-07 — NEW FEATURE: Glass Breakage Register (production module)
- Backend /app/backend/routes/glass_breakage.py (prefix /api/production/glass-breakage): CRUD + POST /{id}/qa-release + GET /export (branded Excel). Collection glass_breakage_register. Auto serial GBR-NNNN. Fields: incident_at, location, batch_id/batch_code (picker from production batches), production_details, cause, quantity_quarantined, quantity_rejected, cleaning_undertaken, inspection_performed, corrective_action, status open/released, qa_release{authorized_by(_name), authorized_at, remarks}, reported_by(_name).
- QA release/delete restricted to roles: CEO, System Admin, Admin, Director, VP, Production Manager, QA/QC/Quality Manager. Released entries only editable by those roles.
- Frontend /app/frontend/src/pages/GlassBreakageRegister.js at /glass-breakage-register (moduleKey glass_breakage_register — enabled by default, added to moduleRegistry + production nav in DashboardLayout with GlassWater icon). Stats cards, table with all columns, Record/Edit dialog, QA release dialog with remarks, Excel export button. data-testids gbr-*.
- Gotcha recurrence: App.js lazy import line was lost in a parallel write (runtime "GlassBreakageRegister is not defined"); re-applied.
- Tested e2e: create GBR-0001 → list → QA release (name+timestamp) → branded export verified; UI screenshot shows table, Released badge, form dialog. Test entry deleted. In PREVIEW; Republish needed for production.

## 2026-08-07 — NEW MODULE: Equipment Master & Maintenance Management (production)
- Backend /app/backend/routes/equipment_master.py (prefix /api/production/equipment). Collections: equipment_types (parent master), equipment_master (children).
- Endpoints: /types CRUD (+/types/seed-defaults inserts 9 example types idempotently; delete blocked 409 if children; rename cascades to children's equipment_type_name), equipment CRUD (auto-compute next_maintenance_due/next_replacement_due = last date + frequency when blank; invalid type 400; filter by type + search), /{id}/log-maintenance & /{id}/log-replacement (set last date, recompute next due, append maintenance_log/replacement_log entry with user name).
- Vendor associations per equipment: array of {vendor_id (from Vendor Master /api/inventory/vendors, collection inventory_vendors, field vendor_name — hydrated server-side), preferred, lead_time_days, last_purchase_price, vendor_part_code, contact_details, amc_details}.
- Frontend /app/frontend/src/pages/EquipmentMaster.js at /equipment-master (moduleKey equipment_master; nav in production group, Cog icon; moduleRegistry entry). Tabs: Equipment table (due chips red=overdue/amber≤30d/green, "Order now" badge when replacement due ≤ procurement lead time, vendor list w/ preferred star, log maintenance/replacement quick actions) + Types cards w/ seed button. data-testids eq-*, type-*.
- Tested by testing_agent iteration_344: 12/12 backend pytest + full frontend flow 100% pass. Minor polish applied after: DialogDescription on type dialog, eq-delete-*/eq-vendor-remove-* testids, leftover TEST_Vendor deleted.
- The 9 seeded default types remain in preview tenant (harmless). In PREVIEW; Republish for production.

## 2026-08-07 — Deploy failure fixed + code review actions
- PRODUCTION DEPLOY FAILED: build broke on EquipmentMaster.js corrupted trailing duplicate block ("ooter>..." lines 482-487, introduced by testing-agent edit). Removed; `yarn build` now exits 0 (verified). User must redeploy.
- code_review_agent verdict: READY WITH FIXES. Fixed MEDIUM: GBR register numbers now use atomic per-tenant counter (db.counters, ReturnDocument.AFTER, legacy skip) + unique index {tenant_id, register_no} lazily created — verified: create GBR-0001/0002, delete 0001, next = GBR-0003 (no reuse). Fixed LOW: glass_breakage update uses dict(exclude_unset=True) so explicit nulls clear fields.
- Excel branding style-shift concern from review was a FALSE POSITIVE — verified openpyxl insert_rows moves fills/bold correctly (header fill lands on row 5).

## 2026-08-07 — Dual quantity display: packaging + UOM (user request "everywhere")
- ROOT BUG: DeliveriesTab batch card read item.units_per_package but the field is item.packaging_units → factor fell back to 1 → cards showed raw "536 UNITS". Fixed; card now shows "44 CRATES +8 loose · 536 units" based on the packaging chosen in the item's packaging dropdown. Verified in live UI (temp 536-unit test batch QTYTEST at Brian's is_factory Bangalore loc 5fff767e; row deleted after).
- New helper utils/packaging.js dualQty(qty, unitsPerPkg, packagingName, baseUom) → "44 Crates + 8 (536 Bottles)". Packaging word extraction now skips numeric tokens ("Crate - 12" → "crates", was "12s") — fixed in both dualQty and batch-card unitWord.
- Applied dual display: DeliveriesTab classification dropdown options, over-stock warning message; StockDashboardTab FactoryWarehouseSkuRow (pkg prop from brandedPkgLookup) totals + per-batch rows, main-table factory stock + batch rows via pkgEquiv.
- NOTE: batches-available location routing: distributor_locations.is_factory=True → reads factory_warehouse_stock (warehouse_location_id), else distributor_stock (distributor_location_id).
- Deploy notif: user's redeploy failed with platform-side Cloud Build PermissionDenied (NOT a code issue; frontend build passes locally). If user raises it → Emergent Support.

## 2026-08-07 — BUG FIX: retro-categorization of COMPLETED deliveries now re-attributes warehouse stock
- User report (production, DEL-2026-0337): categorized delivery lines to customer brand but warehouse stock unchanged — deduction stayed on Generic, branded pile untouched.
- Root cause: routes/retro_categorization.py delivered-delivery branch was "relabel only" by design (Jul 2026 rule). User now expects classification-level correction.
- Fix: refactored _move_generic_to_child into generic _move_stock_between_buckets(from_child, to_child) (None = Generic). categorize_delivery_item: delivered statuses now move qty from the BRANDED bucket → GENERIC (batch-aware, capped at branded on-hand), i.e. Generic restored +qty / branded −qty, net on-hand unchanged; writes a BRD- Branding Entry (from=branded, to=Generic) for audit. Pre-delivery path unchanged (delegates to wrapper).
- Verified function-level in preview (temp rows at loc 5fff767e, batch RETRO-B): post-delivery: generic 140→500, branded 360→0, entry BRD- created. Regression pre-delivery direction: generic 200→80, branded +120. All temp data cleaned.
- NOTE: existing already-categorized deliveries (e.g. DEL-2026-0337) are NOT retro-corrected by this fix; user can correct via a manual Branding Entry (branded → Generic supported by branding_entries API/UI). In PREVIEW; Republish needed.

## 2026-08-07 — Shortfall warning on retro-categorization capping
- All 3 retro-categorize endpoints (delivery-item post-delivery, shipment-item, transfer-item) now return shortfall_units + warning when the move was capped (branded bucket short at source, or Generic short at destination). Delivery warning: "Only X of Y units could be re-attributed… remaining Z stay deducted from Generic."
- Frontend: DistributorDetail (shipment+delivery handlers) & StockTransfers show toast.warning(warning, 10s); delivery success toast now includes re-attributed units + BRD number; RetroCategorizeDialog delivery hint updated (was "no stock is moved" — outdated).
- Verified: capped move (branded 100, requested 360) → moved 100, shortfall 260 computed; rows correct; temp data cleaned.

## 2026-08-09 — Events module (Event Journeys) + calendar integration [TESTED: iteration_345, 100% pass]
- NEW dedicated Marketing → Events module (left-nav item, moduleKey marketing_events). Routes /events + /events/:eventId (App.js), nav in DashboardLayout marketingNavigationGroups, moduleRegistry entry.
- Backend /app/backend/routes/event_journeys.py (prefix /api/events). Collections: event_journeys, event_stakeholders, event_tasks, event_budget_items. Features: event CRUD (name, type via marketing event-types datalist, status, location, budget, attendees, date range, per-day day_schedules with start/end times + "copy day 1 to all days"), stakeholders (external company/contact/phone/email/scope chips incl. custom + internal employee picker from /api/users), plan tasks (owner=stakeholder|user, start/end dates, depends_on with enforcement — 400 if starting/completing before dependencies done, self-dep blocked, delete pulls dep refs), task file uploads (filesystem /app/backend/uploads/event_tasks, 15MB cap, download/delete), budget lines (category/desc/vendor/planned/actual, variance, over-budget badge, totals), in-app notifications (db.notifications) on task assignment + lazy due-soon(2d)/overdue reminders deduped per task/day generated on event detail GET.
- Content Calendar (/marketing-calendar): journey events now expand across their FULL date range (marketing.py get_calendar_data), bigger clearer cards (name bold, Day X/N, per-day time, location, task progress bar), Upcoming = amber ring + chip, Live = emerald ring + chip. "Upcoming Events" strip above calendar (next 6, days-to-go, progress, click→detail). Calendar "New Event" → /events?new=1 auto-opens dialog. Event cards click → /events/:id (old inline EventPanel removed).
- Marketing Masters: "Custom Events" tab REMOVED (user choice b). Tabs now Categories/Platforms/Event Types. Old marketing_events + marketing_calendar_events endpoints remain but UI removed.
- MIGRATION: legacy marketing_calendar_events (4 docs) migrated to event_journeys + event_tasks (migrated_from field, idempotent). 'Annual Product Launch 2026' preserved with 4 tasks.
- Fixed pre-existing bug in scaffolded pages: auth header used localStorage 'session_token' but app stores under 'token'.
- Events list page: live events first (Live now badge), then upcoming (In X days badge, amber ring), then past.
- Backend regression suite: /app/backend/tests/test_event_journeys.py (18 tests).
- In PREVIEW; Republish needed for production.

## 2026-08-09 — Event Budget approval workflow (state machine) + inline grids [SELF-TESTED: curl full lifecycle + UI automation]
- Budget approval uses the existing State Machine framework. New workflow key `event_budgets` in WORKFLOW_CATALOG (state_machines.py); default SM `ensure_default_event_budget_sm` (sm_helpers.py, code EB_DEFAULT_v1, seeded on first event-detail GET, editable in Admin → State Machines): draft→pending_approval→approved/rejected; approve/reject gated to role **Director** (user choice; admins bypass per framework); reject requires comment; reopen from rejected (anyone) and from approved (Director).
- Budget lines carry planned_amount / approved_amount / actual_amount. Whole-budget approval: submit locks lines; approver sets per-line approved amounts in transition dialog (default=planned); approved state allows ONLY actual_amount recording (409 otherwise); rejected requires reopen. approved_amount never editable via line CRUD (stripped/blocked in backend).
- Endpoint POST /api/events/{id}/budget/transition {action_key, comment, line_approvals}. Event detail returns budget_state(+label/color), budget_transitions (permission-filtered via user_can_trigger), budget_history (audit trail), budget_approved_total. Locking: add/delete lines only in draft.
- Notifications (user choice: yes): submit → in-app notify all Directors (vamsi.bommena is the Director in tenant); approve/reject → notify event creator (entity_type event_budget).
- Verified: full lifecycle curl (submit→409 lock→approve w/ adjusted amounts→actual-only edit→reopen→reject comment-required→reopen), RSM role got 403 + empty transitions, Director notification inserted, UI flow (submit/approve dialog/history/reopen). Test data cleaned.
- EventDetail.js REWRITTEN: Stakeholders / Plan / Budget tabs are now INLINE-EDITABLE TABLE GRIDS (user request) — no popups. Row-level editing: Add button inserts editable row at top; pencil converts row to inputs; ✓/✕ save/cancel (data-testid row-save-btn/row-cancel-btn). Scope chips + custom scope, employee select, task owner/dates/dependency chips/status, budget planned/actual all edit inline. IMPORTANT PATTERN: edit-row renderers are called as functions (StakeholderEditRow(), not <StakeholderEditRow/>) to avoid remount/focus-loss on each keystroke. Budget approve per-line dialog + Edit Event dialog remain dialogs (workflow actions).
- Verified via playwright: typing retains focus, all 3 grids add/edit inline, workflow buttons intact, variance vs approved(fallback planned). In PREVIEW; Republish for production.

## 2026-08-09 (later) — Vendor bills, post-event report, approval emails [SELF-TESTED via curl + PDF text extraction + UI screenshot]
- **Vendor bills on budget lines**: POST/GET/DELETE /api/events/{id}/budget-items/{bid}/files (mirrors task files; storage /app/backend/uploads/event_budget, 15MB cap; allowed in any budget state — proof attach doesn't change amounts). UI: "Bills" column in budget grid with download chips + paperclip (data-testid budget-upload-{cat}, budget-file-{name}).
- **Post-event report PDF**: GET /api/events/{id}/report → one-page A4 branded PDF (_build_event_report_pdf in event_journeys.py; Nyla logo /app/backend/assets/nyla-logo.png, HelveticaBrand fonts from utils.pdf_generator): KPI strip (task completion %, overdue, planned/approved/actual/variance), budget table w/ per-line variance + bill counts, task list w/ overdue flags, stakeholders, approval trail. UI: "Report" button in event header (data-testid event-report-btn). Verified via pypdf text extraction.
- **Approval email alerts**: on budget submit, Directors get an HTML email (existing utils/email_sender.py → Resend, RESEND_API_KEY + SENDER_EMAIL already in backend/.env) with line-item table, planned total, submitter, link using APP_BASE_URL env (NOTE: APP_BASE_URL in preview .env points to an old preview URL — production env may need it set to https://warehouse-qc-engine.emergent.host for correct email links; falls back to textual nav path if unset). Email is best-effort (never blocks the transition). Verified: submit → pending_approval, no send errors in logs (Resend accepted; one test email went to vamsi.bommena).
- Test data cleaned (event, notifications, uploaded files). In PREVIEW; Republish for production.

## 2026-08-09 — S.No columns on Stakeholders + Plan grids [screenshot verified]
- EventDetail.js: added S.No column (row index) to stakeholders-table and tasks-table; edit rows keep their number; colSpans updated (7 / 9).

## 2026-08-09 — Master SKU sort order honored everywhere [SELF-TESTED via curl on all 5 endpoints + UI screenshots]
- NEW helper /app/backend/utils/sku_order.py: master_sku_order(sku_ids)→{id:rank} + sku_sort_key(order). Rank = master_skus.sort_order (>0 asc); unset/0 → last, then A-Z.
- Fixed sort in: global_stock_dashboard.py (per-warehouse skus were sorted by stock desc → now master order; export inherits), distributors.py stock-summary (by_sku + by_location items were qty/alpha sorted) and _build_branded_stock_sections, distributor_stock_transfers.py warehouse-stock-overview (items_distributor/items_factory), factory_returns.py available-stock (SKU dropdown in deliveries/factory returns), master_data.py /master-skus (shadowed by server.py:2057 route which ALREADY sorts by sort_order — dropdowns were fine).
- Frontend: StockDashboard.jsx removed client-side re-sort by quantity (line ~426) so API order is preserved. GlobalStockDashboard.jsx has no client sorts.
- Verified: all warehouses now list SKUs identically (600 Silver→330 Silver→660 Gold→330 Gold→660 Sparkling→24 Brand). Note: inactive legacy SKUs with old stock (e.g. '20L Premium', sort_order=1) tie with active rank-1 and break alphabetically — consistent everywhere.
- In PREVIEW; user's screenshots were production (Pickval/Mumbai) — needs Republish.

## 2026-06 — EventDetail UX Redesign (verified)
- EventDetail.js fully redesigned (Swiss high-contrast per /app/design_guidelines.json): tab bar with underline style, stat strip (Progress/Stakeholders/Budget/Status), avatar chips, approval-trail timeline, variance column in budget table.
- User feedback addressed: inline edit inputs enlarged h-8→h-10 (40px, text-[15px]) with visible uppercase field labels (Field component) on every stakeholder/task/budget edit field; view-mode phone/email text-xs→text-sm; wider min-width columns; larger scope/dependency chips.
- Added delete-button data-testids (stakeholder-delete-*, task-delete-*, budget-delete-*) and res.ok checks on file/report downloads.
- Tested: iteration_346.json — backend 18/18, frontend 11/11 flows pass. Temp test event created+deleted; real events untouched.

## 2026-06 — Target Plan tile status tint
- TargetPlanningList.js: plan cards now tinted by status — active = bg-green-50/60 + green border, inactive = bg-red-50/60 + red border (+ INACTIVE pill now red-tinted); draft/completed/locked stay white. Verified via screenshot with a temporarily-toggled plan (reverted to draft after).

## 2026-06 — Finance/Accounting department → exclusive Accounting module access
- Bug: Finance-dept users saw empty sidebar + Access Denied on accounting pages; landed on Sales /home; could URL-jump into Sales pages.
- Fixes:
  - AppContextContext.js: ACCOUNTING_DEPTS=['accounting','finance']; isAccountingOnlyUser (non-admin, all depts in acct set) → only 'accounting' workspace; accounting workspace granted to finance/accounting depts; default context → accounting.
  - TenantConfigContext.js: hasRolePermission + hasActionPermission return true for accounting_* keys for acct-dept users (dept overrides role matrix default-deny).
  - DashboardLayout.js canSeeItem: accounting_* nav items visible for acct-dept users.
  - App.js ProtectedRoute: accounting-only users hitting non-accounting moduleKey routes → <Navigate to /accounting/dashboard>.
  - Login.js landingRouteFor: finance/accounting (no sales) → /accounting/dashboard.
  - Backend accounting_entities/masters/transactions.py: _require_admin also allows finance/accounting department users (_is_accounting_dept).
- Verified via screenshots (finance.user@nylaairwater.earth) + curl (masters 200, vendor create/delete 200 as finance user; was 403). Admin regression checked (lands /home, full access).

## 2026-06 — Water Intelligence module (NEW, tested)
- Daily water-industry news engine: Google News RSS per topic (13 default topics + custom feeds) → dedupe (normalized-title hash + URL, 30-day window) → GPT-5.5 (Emergent LLM key, emergentintegrations, batches of 8) scores 0-100 / categorizes / writes original headline+summary+why-it-matters+keywords → min_score (default 70) gate → pending_approval / rejected(low_relevance).
- Workflow: pending_approval → approved → published (+ reject/resubmit/unpublish). Manage roles: CEO/Director/Admin/System Admin/VP/Head of Business/Marketing Manager.
- Files: /app/backend/routes/water_intelligence.py (router /api/water-intelligence + public /api/public/water-news), /app/frontend/src/pages/WaterIntelligence.js, nav in both Sales+Marketing sidebars (moduleKey water_intelligence), route in App.js, role model keys added.
- Scheduler: in-process loop, daily at configurable IST time (settings schedule_hour/minute, default 05:30), marks orphaned 'running' runs as failed on startup, Run Now button (409 guard).
- Public API: GET /api/public/water-news?category=&region=&q=&page=&limit= — published articles only, no auth, for website consumption.
- Tested: iteration_347 — 19/19 backend pytest + all UI flows. Live pipeline run: 254 fetched, 17 dupes, 40 AI-reviewed, 23 kept. requirements.txt updated (feedparser).
- LESSON REPEATED: two parallel search_replace edits to App.js raced — lazy import lost, route kept → runtime 'WaterIntelligence is not defined'. Fixed by re-adding import. Never parallel-edit the same file.

## 2026-06 — QC Tests module (Production nav, tested)
- New Production → QC Tests: per-batch quality test log. Files: /app/backend/routes/qc_tests.py (/api/production/qc-tests), /app/frontend/src/pages/QCTests.js, nav in productionNavigationGroups, moduleRegistry qc_tests, route in App.js.
- Auto-seeding: lazy _sync on list — first seed (flag in qc_tests_meta.first_seed_done) gave 38 batches 94% Production(36)/6% Trial(2, with reject→reject→pass attempt chains); new batches after deployment auto-get Production/Pass attempt-1 record. Tested By always 'Baburao', Reviewed By 'Ravindra Ambati', reviewed_date >= testing_date enforced.
- Rules enforced: production = 1 attempt always pass (no reject/retest); trial pass/reject with Add Retest (attempt auto-increment) until pass; only latest trial attempt (>1) deletable; edit dialog with role gate (EDIT_ROLES). latest_attempts map returned server-side so retest button unaffected by filters.
- Branded Excel export (all 9 spec columns, green/red result font, Nyla header).
- ALSO FIXED: water_intelligence removed from role.py DEFAULT_MODULE_PERMISSIONS/labels/categories (role.py has a drift assert requiring consistency) + unset 12 backfilled view=false role entries — Directors/VPs regained Water Intelligence nav access via hardcoded role lists.
- Tested: iteration_348 — 11/11 backend pytest, 28/30 frontend (2 cosmetic script issues). Post-test review fixes applied (seed flag, server-side latest_attempts, export sync removed) + re-verified via curl.

## 2026-06 — Global Stock Dashboard unit mismatch fix (WH Stock/Available)
- Bug (user-reported, seen on production): Received/Delivered shown in crates, but WH. Stock & Available showed raw bottle counts in the crates view.
- Root cause: global_stock_dashboard.py step 1 passed distributor_stock.quantity as crates= to bump(). But distributor_stock.quantity is stored in BASE UNITS (bottles) — verified all writers: shipment delivery _apply_stock_on_delivery $inc by item bottle qty (delivery items show packages=1 × packaging_units=24 → quantity=24), stock-out deduction, reversal all use bottle quantities. factory_warehouse_stock (units=) was already correct.
- Fix: bump(..., "on_hand", units=r.get("quantity")) — available derives from on_hand so both fixed; Excel export uses same agg.
- Verified via API consistency check across all warehouses (on_hand_crates × upc == on_hand_units) + screenshots of both crates/units views.
- Production still has the bug until user redeploys.

## 2026-06 — Accounts page Excel download
- New GET /api/accounts/export/excel (in accounts.py, before /stats/summary): branded 3-column export — Outlet Name (account_name), City, Business Category (category, fallback business_category). Respects search/territory/state/city filters.
- Download Excel button in AccountsList.js toolbar (data-testid accounts-download-excel-btn), passes current filters.
- Verified: curl export (correct header + rows + Nyla branding) and button rendered on page.

## 2026-06 — Account Detail: Onboarding & First Order section
- New card on AccountDetail.js after Account Information: Actual Onboarded Month/Year (MOVED from Account Information edit/view), Contract Signed Date, Approx. Monthly Consumption, First Order Quantity, First Order Confirmation Date, First Order Delivery Date. 3-column grid, own Edit/Save (handleSaveOnboarding), shadcn Calendar+Popover date pickers (DateField helper component; shadcn calendar imported as CalendarPicker since lucide Calendar icon name taken).
- Backend: AccountUpdate model + 5 new optional str fields (accounts.py). PUT /api/accounts/{id} passes them through.
- Verified: PUT round-trip via curl, view mode + edit mode + calendar popover screenshots on test account 'Drive Folder Test Lead' (demo values left populated).

## 2026-06 — Onboarding Ageing + expanded Accounts export
- AccountDetail Onboarding & First Order card: "Onboarding Ageing" badge = days from contract_signed_date → first_order_delivery_date (or today with "awaiting first delivery" if not delivered). Colors: ≤7d green, 8–15d amber, >15d red.
- Accounts Excel export now has 7 columns: Outlet Name, City, Business Category, Contract Signed Date, First Order Confirmation Date, First Order Delivery Date, Onboarding Ageing (Days).
- Verified: export via curl (ageing=5 computed for test account), badge screenshot ("5 days", green).

## 2026-06 — Accounts list ageing badge + bottle unit labels
- AccountsList.js: Onboarding column in list view + badge on card view — days contract→first delivery, green ≤7 / amber 8–15 / red >15; "Nd+" suffix while awaiting delivery. Helper onboardingAgeing() module-level; Clock icon imported.
- AccountDetail.js labels updated: "Approx. Monthly Consumption (bottles)", "First Order Quantity (bottles)" in both edit + view modes; placeholders now numeric-only.
- Verified via screenshots (list Onboarding column shows 5d badge; detail labels show (bottles)).

## 2026-06 — Bottle fields numeric validation
- approx_monthly_consumption + first_order_quantity now Optional[int] ge=0 in AccountUpdate (422 on strings/negatives); frontend inputs type=number with digit-only sanitization, parseInt/null on save.
- Data migration ran: 1 account with string values ("600 bottles / month"→600, "240 bottles"→240) converted to ints.
- Verified: numeric PUT 200, string PUT 422, negative PUT 422.

## 2026-06 — Account Volume Tracking Grid (Sales module, tested)
- New Sales → Volume Tracking (/account-volume-grid): spreadsheet-style grid. Files: /app/backend/routes/account_volume_grid.py, /app/frontend/src/pages/AccountVolumeGrid.js, nav after Accounts, moduleRegistry account_volume_grid, route in App.js.
- Base columns: Account Name, Contract Signed Date, Average Order Frequency (avg days between completed deliveries: span/(n-1)), First/Latest Delivery Date, Last Order Quantity, Bi-weekly Volume (=EMV/2, computed), Expected Monthly Volume (Crates, inline editable, stored on account.expected_monthly_volume_crates).
- Custom columns (text/number/date/formula) in volume_grid_config; values in account.volume_grid_values; formula eval client-side (word-boundary name substitution + regex-guarded Function eval). Column hide/unhide persisted in localStorage. Click-header sorting. Territory/State/City cascading filters via useMasterLocations (like Leads). 'Annual Volume' formula column (EMV*12) left as a live example; Bangalore Tech Park EMV=200 demo value.
- Tested: iteration_349 (backend 14/15, frontend 100%) → fixed all findings: DELETE /columns unknown id now 404 (find_one pre-check) + purges orphaned values from accounts; PUT custom_values filtered to known column ids (unknown → 400); RBAC _require_edit (sales+admin roles) on all mutations (finance user 403 verified); formula replacement uses word boundaries. Regression pytest 15/15 pass.

## 2026-06 — Volume Grid v2: summary row, column resize, manual rows
- Summary row pinned at top (thead): sums for volume/number/formula columns, average for order frequency, "TOTAL — N rows" label. testid vg-summary-row / vg-summary-{col}.
- Column resizing: drag handle on right edge of each header (vg-resize-{col}); widths persisted in localStorage volume_grid_col_widths; table-layout fixed + colgroup; all cells whitespace-normal break-words (auto word wrap).
- Manual spreadsheet rows: Add Row button (vg-add-row-btn) → POST /manual-rows (volume_grid_manual_rows collection); editable name/expected volume/custom values via PUT /manual-rows/{id}; amber-tinted rows with hover trash delete; included in summary totals; auto-save on Enter/blur like other cells.
- Verified: curl (manual row CRUD, biweekly 40 from 80) + screenshot (summary totals 280/140/3360, resized wrapped column). Test data cleaned (manual row + leftover 'First Consignment' test column deleted).

## 2026-06 — Volume Grid branded Excel export
- GET /api/account-volume-grid/export/excel: Nyla-branded workbook — header, blue TOTAL row (sums + avg frequency), all base columns + custom columns with formula values computed server-side (_eval_formula: word-boundary name substitution, charset-restricted eval). Respects territory/state/city/search filters.
- Excel button on grid page (vg-download-excel-btn) passes active filters.
- Verified via curl: header + TOTAL (avg 10 days, 73/100/200, Annual Volume 2400) + data rows with computed formula column.


## 2026-06 — Volume Grid totals refined (user request)
- "Annual Volume" custom formula column removed (deleted via API from volume_grid_config).
- Totals row (grid + Excel) now sums ONLY: Bi-weekly Volume, Expected Monthly Volume, and custom number/formula columns where include_in_total=true (user's choice). No avg frequency / last order qty summaries anymore.
- Backend: ColumnIn.include_in_total (only honored for number/formula types); PUT /api/account-volume-grid/columns/{id} {include_in_total} toggle (RBAC via _require_edit); export totals use index set {9,10} + opted-in custom columns.
- Frontend (AccountVolumeGrid.js): summaryFor checks include_in_total; Add Column dialog "Include in totals row" checkbox (vg-new-col-include-total) for number/formula; Columns popover per-custom-column Σ toggle (vg-col-total-toggle-{key}) calling toggleColumnTotal.
- Verified via curl against live preview API: totals now 100/200 only; temp formula column with include_in_total=true added 400 to totals; PUT toggle off removed it; cleanup done. Frontend compiles clean (only pre-existing face-api warnings).
- NOTE: screenshot automation browser cannot reach the external preview backend in this fork (serves stale "wake servers" page → login fails in browser only). All verification done via real API calls; UI logic is thin render layer over verified data.

## 2026-06 — Volume Grid freeze panes (Excel-style)
- Scroll container (vg-scroll-container): overflow-auto, max-h calc(100vh-260px).
- Frozen on vertical scroll: header row (th sticky top-0) + summary row (td sticky, top = measured header height via ResizeObserver headerRowRef/headerH, opaque bg #E9EEF9, inset shadows replace non-sticky borders).
- Frozen on horizontal scroll: Account Name column (sticky left-0; z-30 in header/summary, z-10 in body; opaque bg white / #FDF6E7 for manual rows, group-hover bg-slate-50, inset right shadow).
- Correct preview URL is design-workflow-hub-11.preview.emergentagent.com (frontend/.env) — earlier "warehouse-qc-engine" URL is stale, serves wake-servers mock. localhost:3000 login fails due to CORS+credentials (expected, not a bug).
- Verified via browser automation on real preview: after scrollTop=400/scrollLeft=500, header offset 1px, summary offset 53px (=header height), account column left offset 1px; screenshot confirms pinned panes.

## 2026-06 — Volume Grid: Google-Sheets-style formula engine (bug fix + upgrade)
- Root cause of "formulas not working": old engine required exact-case column names and bare arithmetic only; "=" prefix, lowercase names, functions, and blank cells all silently returned null.
- New engine (mirrored in AccountVolumeGrid.js evalFormula + backend _eval_formula for Excel export):
  optional leading "=", case-insensitive column references, blank cells = 0 (Sheets behavior),
  operators + - * / ^ %, comparisons (> < >= <= = <>), functions SUM/AVERAGE/AVG/MIN/MAX/ROUND/ABS/IF.
  Safety: unknown identifiers rejected via charset validation after stripping known fn names; eval sandboxed (no builtins).
- 14-case backend test suite ALL_PASS (incl. __import__ injection rejected). E2E: formula column created via API rendered 2400 in grid summary + Excel totals. Add Column dialog help text updated with Sheets syntax examples.

## 2026-06 — Formula live preview in Add Column dialog
- While typing a formula, a live preview evaluates it against a sample account (first row with expected volume set): green box "Preview — {account}: {result}" (vg-formula-preview) or red "Can't compute yet — check column names and syntax" for invalid input.
- Verified via browser: "=ROUND(expected monthly volume * 12, 0)" → "Preview — Bangalore Tech Park: 2,400"; "=badcolumn * 12" → error state.

## 2026-06 — Volume Grid: column reordering + No. of Orders + Days labeling
- Drag any header (except frozen Account Name) onto another to rearrange columns; order persisted in localStorage volume_grid_col_order (per browser); moveColumn/allColumns ordering in AccountVolumeGrid.js; header label span draggable (cursor-move).
- New base column "No. of Orders" (order_count, completed deliveries to date) — grid + Excel export (inserted at index 6; export total_indexes now {10,11}, custom offset 12); usable in formulas as "Number of Orders" (frontend ctx + backend ctx_for).
- Avg Order Frequency was already computed in days (delivery span / (n-1)); label now explicitly "Average Order Frequency (Days)" in grid (export already had it).
- Verified via browser: drag No. of Orders before Contract Signed Date → order persists after reload; counts 0/1/10 match export; export headers/totals validated via curl.

## 2026-06 — Last Order Quantity converted to crates
- Was raw delivery total_quantity (bottles). Now: per-delivery items (distributor_delivery_items) converted via master_skus bottles_per_crate (packaging_config production default fallback), summed → crates, rounded to 2dp.
- Legacy deliveries without item docs: bottles ÷ tenant's most common bottles_per_crate (default_bpc).
- Labels now "Last Order Quantity (Crates)" in grid + Excel export.
- Verified: Citadel 12 bottles→0.5, Empire 1 bottle→0.04, Toopa→5.0 crates (grid API + export both checked).

## 2026-06 — Last 4 delivery dates + quantities columns
- Two new base columns: "Last 4 Delivery Dates" (DD-MON-YYYY, newest first, one per line) and "Last 4 Delivery Qty (Crates)" (same line order). Frontend type 'list' renders each entry as block span; Excel joins with \n + wrap_text alignment (cols J/K, indexes 9/10; export total_indexes now {12,13}, custom offset 14).
- Crate conversion fallback made account-local: legacy deliveries without item docs use the mode of bottles_per_crate from that account's own itemized deliveries (bpc_by_delivery → acc_bpc), falling back to global mode. Fixes non-determinism where filtered vs full grid gave different values (Toopa 0.5 vs 1.0 → now consistently 1.0, its SKU is 12/crate).
- Verified: grid API (full + filtered identical), Excel export line breaks + wrap, browser screenshot shows stacked dates/quantities.

## 2026-06 — Last Ordered SKU column
- New base column "Last Ordered SKU" (parent SKU name(s) from the most recent delivery's items; multiple SKUs comma-joined; legacy deliveries without item docs show blank).
- Grid (after Last Order Quantity) + Excel export (index 12; total_indexes now {13,14}, custom offset 15).
- Verified via grid API + export: Empire "Nyla – 330 ml / Silver", Toopa "Nyla – 600 ml / Silver".

## 2026-06 — AI Consignment Planner (Volume Tracking page)
- POST /api/account-volume-grid/consignment-plan {truck_capacity_crates} → plans next 3 truckloads.
- Deterministic engine: per-account profile (monthly consumption = expected volume or derived typical*30/freq; typical order = mean of last-4 delivery crates or monthly/2; freq = avg order frequency or 15d fallback; expected next order = last delivery + freq, today if none). 3 sequential simulations: sort by (next due date asc, monthly desc), allocate min(round(typical), remaining capacity) as whole crates, advance served account's next date by its frequency; top-up until truck full. Never exceeds capacity.
- AI layer: gpt-5.5 via emergentintegrations LlmChat + EMERGENT_LLM_KEY (same pattern as water_intelligence) → {"summary", "notes":{account: short note}}; plan degrades gracefully without AI on failure.
- UI: section below the grid (vg-planner-section): Truck capacity input (vg-planner-capacity) + Generate (vg-planner-generate); AI Insight banner (vg-planner-summary); 3 consignment cards with total/capacity + utilization% + accounts served; plan table (vg-planner-table) Account (+AI note) | Monthly | Frequency | Last Order | Expected Next Order | Typical Order | C1 | C2 | C3.
- Verified: curl (60-crate plan: 60/60/60 at 100%, urgency-first ordering, AI summary+notes returned, ~15s); browser E2E (input → generate → cards/table/insight rendered); capacity 0 → 422; no auth → 401/403.

## 2026-06 — Volume Tracking visual polish
- Zebra striping: even rows white, odd rows slate-50/60; manual rows amber; hover #EFF3FB; frozen Account Name cell background synced per stripe (opaque #F7F9FC / white / #FDF6E7).
- All numeric columns right-aligned (headers, summary, cells, editable buttons, last-4-qty list) via numericCol() helper; TH const no longer hardcodes text-left.
- Consignment Planner de-AI'd visually: Sparkles icons removed (Truck icon instead), renamed "Consignment Planner", banner label "Planner Insight"; planner table zebra + right-aligned numerics with per-header alignment.
- Containers upgraded to rounded-md shadow-sm.
- Verified via browser screenshots (grid top + planner with generated 60-crate plan); no lucide-sparkles in this module (remaining 3 on page are global assistant widgets).

## 2026-06 — Consignment suggested dates
- Each consignment now carries suggested_date = earliest due date among served accounts (clamped to today, strictly increasing across consignments; next date advances by each account's frequency after service).
- Shown in consignment summary cards (vg-planner-date-{n}) and under each Consignment column header in the plan table.
- Verified: API (21/26/31 Aug spacing follows 5-day dominant cadence) + browser (cards + table headers show dates).

## 2026-06 — Planner city scoping + branded Excel export
- Consignment planner now honors the page's Territory/State/City/search filters (was previously planning across ALL accounts). PlanRequest carries filters → get_grid; response echoes "filters"; planner subtitle notes "follows the filters above".
- POST /api/account-volume-grid/consignment-plan/export {plan} → branded xlsx "Consignment Plan - date.xlsx": scope/capacity info line, dark headers with "Consignment N — DD-Mon-YYYY", blue TOTAL row (totals/capacity/utilization per consignment), data rows incl. Planner Note column (AI notes), Planner Insight merged footer. Excel button (vg-planner-export) appears after a plan is generated.
- Verified: city=Hyderabad plan returns only Hyderabad accounts (Toopa, Citadel; 4/20 crates 20% — honest under-utilization + AI flags it); export 200 with correct structure; browser E2E with State→City filters + plan + export button.

## 2026-06 — Planner considers warehouse stock
- consignment_plan now reads factory_warehouse_stock (quantity>0, bottles→crates via row bottles_per_crate or master_skus fallback) → warehouse_stock_crates.
- Allocation: effective capacity per consignment = min(truck capacity, remaining stock); stock depletes across the 3 consignments; per-consignment stock_limited flag; response includes warehouse_stock_crates + stock_remaining_after_plan; both fed to the AI prompt.
- UI: stock line above cards (vg-planner-stock) "Warehouse stock: X · After this plan: Y" + amber "Plan limited by available stock" badge (vg-planner-stock-warning) when capped. Excel info line includes warehouse stock.
- Verified: API (stock 2930.8 → 2750.8 after 180-crate plan; capacity-400 plan depletes 315), browser (stock line + AI insight references stock), export info line includes stock. Stock-limited branch is simple min() arithmetic (not triggerable with current 2.9k-crate stock without mutating data).

## 2026-06 — Water news on every user's home page
- New /app/frontend/src/components/widgets/WaterNewsWidget.js: fetches GET /api/public/water-news?limit=6 (public endpoint, no permission gate) → up to 6 published articles as cards: category badge, date, headline, summary (line-clamp-3), expandable "Why it matters", source link. Auto-hides when nothing published.
- Mounted on HomeDashboard after DistributorMessagesCard (testid home-water-news-widget).
- Verified via browser: 3 published articles render, expand/collapse works, source links external.

## 2026-06 — Home Water Brief redesigned (compact rotating strip)
- New authenticated endpoint GET /api/water-intelligence/home-feed (any logged-in user, declared before /{article_id}): approved + published articles, public-safe fields, sorted by published/approved date.
- WaterNewsWidget rewritten: 46px-tall strip — left Nyla-blue accent bar + gradient, "Water Brief" label, category pill, auto-rotating headline (6s, pauses on hover), counter + prev/next arrows, animated progress dots; click headline to expand details inline (summary, Why it matters, source link). Auto-hides when nothing approved/published.
- Verified: endpoint returns approved+published (4 articles); browser — collapsed height 46px, rotation nav works, details expand.

## 2026-06 — Distributor Messages tile removed from Home
- HomeDashboard.js: DistributorMessagesCard section + import removed (component file kept; still used elsewhere if any). Verified via browser: tile gone, Water Brief + rest of home intact.

## 2026-06 — Water Brief: expanded by default + prominent arrows
- Details (summary / why-it-matters / source) open by default and stay open while rotating (removed collapse-on-idx effect); user can still collapse via headline chevron.
- Prev/next now 32px circular buttons: white with slate border + blue chevron, fill Nyla blue on hover.
- Verified via browser: open on load, stays open after next-click.

## 2026-06 — Volume grid: Contract Signed Date → On-boarded Date
- Column renamed and re-sourced: now shows accounts.activated_at (set by the account activation flow/checklist) instead of contract_signed_date. Key renamed contract_signed_date → onboarded_date in grid API, frontend BASE_COLUMNS, and Excel export header.
- Verified: grid API returns activation dates (Citadel 16-May, Ohris 14-May, Toopa 13-May); export header "On-boarded Date". No leftover contract_signed_date references in the module.

## 2026-06 — Water Brief "new" badge
- Tracks water_brief_last_seen in localStorage; articles newer than last visit get: pulsing dot + "N new" next to the Water Brief label (home-news-new-badge) and a small blue dot before each unseen headline (home-news-new-dot). Badge shows for the current visit, clears on next visit. First-ever visit shows no badge (no baseline).
- Gotcha fixed: React StrictMode double-ran the effect — second run read the just-written timestamp and cleared newIds; guarded with initRef.
- Verified in browser: seeded old last_seen → "4 new" + dot; after reload badge gone.

## 2026-06 — Volume Tracking under RBAC (backend enforcement)
- Frontend was already gated (route moduleKey account_volume_grid + Role Management registry "Volume Tracking" + sidebar roles). Added backend enforcement in account_volume_grid.py:
  _module_perms() reads db.roles permissions for the user's role; _require_view (grid GET → inherited by Excel export + consignment plan via internal get_grid call; plan export explicit); _require_edit now async: role matrix edit/create wins, legacy EDIT_ROLES fallback when module absent from matrix; ADMIN_ROLES always allowed.
- Semantics mirror frontend: module missing from role matrix → allow (backwards compatible); explicit view:false → 403 everywhere; view-only → mutations 403.
- Verified via curl with Creative Director account: default allow 200 → deny view 403 (grid/export/plan) → view-only grid 200 + mutate 403 → admin 200. Role restored (module key unset) after test.

## 2026-06 — Daily Status / Status Summary: per-lead grouped activity bullets
- auto_populate_from_activities (daily_status.py) rewritten: groups same-day activities BY LEAD instead of by interaction method. Output: "[HEADER] LEAD ACTIVITY"; single-activity leads → "• Lead — 10:24 AM — Call: desc — User"; multi-activity leads → "• Lead (N activities)" + indented "  - time — Method: desc — User" sub-bullets (chronological, IST times, creator name; geo-tracked visits included since they land in activities). Summary counts line unchanged.
- Frontend nested rendering: StyledActivityDisplay + compact renderer in DailyStatusUpdate.js and BulletedContent in StatusSummary.js render /^\s+- / lines as indented "–" sub-bullets (ds-sub-bullet / ss-sub-bullet). convertToBulletFormat preserves sub-bullet indentation (was trimming it — that bug hid the nesting on first test).
- Verified E2E in browser: Fetch Activities → nested list on Daily Status; posted status → Status Summary shows same nesting (3 sub-bullets). Test activities + test status cleaned up after.
- Note: statuses saved BEFORE this change keep the old method-grouped format (renderers still support it).

## 2026-06 — Volume Tracking now in Role Management matrix
- Root cause of "not visible in tenant settings": Role Management UI loads modules from BACKEND models/role.py (MODULE_CATEGORIES/MODULE_LABELS via GET /api/roles), not the frontend moduleRegistry. Added account_volume_grid to Core category, label "Volume Tracking", and DEFAULT_MODULE_PERMISSIONS (view-only default) — role.py has a drift assertion that requires all three.
- Existing roles auto-backfill the new key on GET /api/roles (Admin got full access; others view-only default until edited).
- Verified: /api/roles returns the module + label; Tenant Settings → Roles → Core shows "Volume Tracking" row with all four checkboxes (screenshot).

## 2026-06 — Activate account without GSTIN (Unregistered customer)
- Backend (accounts.py): ActivationChecklist.no_gst (default False). Checklist gate accepts gst_updated OR no_gst; auto-validation skips the GST-missing failure when no_gst (all other validations unchanged); gst_unregistered = no_gst AND account has no gst_number → stored on account + passed to Zoho upsert.
- Zoho (zoho_service.upsert_contact): gstin present → business_gst (unchanged); else if gst_unregistered → gst_treatment "business_none" (Zoho "Unregistered Business") with place_of_contact derived from delivery/billing/account state name (STATE_NAME_TO_PLACE map). NOT live-tested (Zoho not connected in preview).
- Frontend (AccountDetail.js): under the GST checklist row (when GST missing) a "Customer has no GST registration" option → double-confirmation dialog (no-gst-confirm-dialog): warning + mandatory "I have verified..." checkbox gates the Confirm button; on confirm the GST row shows blue "Unregistered — confirmed" badge and counts as satisfied. States reset each time the activate dialog opens. Account Info shows GST Number: "Unregistered" badge for activated no-GST accounts.
- Invoicing: unchanged — Zoho invoices inherit the contact's Unregistered treatment; CRM shows "Unregistered" wherever GSTIN is displayed.
- Verified: curl (no_gst=false → blocked; no_gst=true → GST failure gone, others enforced); browser E2E (option → dialog → verify-gated confirm → badge). Zoho branch is code-reviewed only (integration not connected in preview).

## 2026-06 — Water Intelligence: date-grouped, rank-sorted list
- Backend list_articles: aggregation adds collected_date (created_at[:10]) and sorts {collected_date: -1, relevance_score: -1, created_at: -1} — newest day first, ranked by relevance within each day. Pagination unchanged.
- Frontend WaterIntelligence.js: date group headers ("SUN, 23 AUG, 2026 — ranked by relevance", wi-date-group-{date}) inserted whenever the day changes in the list.
- Verified: API order (23 Aug: 94→92→90→88…) + browser screenshot shows header and descending rank badges.

## 2026-08 — Promo Stock-Out legacy crate-unit repair (production tally issue)
- Root cause (explained to user first, as asked): dispatches created BEFORE the 29-Jun unit fix stored crate quantity as raw package count (quantity=1, upp missing) — stock deducted 1 bottle instead of 12. New dispatches fine; old ledger never repaired.
- Backend (promo_dispatch.py): POST /api/promo-deliveries/repair-crate-units {apply} — admin-only, tenant-wide scan of promo_dispatches + distributor_delivery_items. Detects lines where packaging says Crate/Pack-N (regex on name, else SKU packaging_config / bottles_per_crate) but stored quantity == package count. Dry-run returns findings (challan, sku, packaging, stored, correct, missing). Apply: item quantity→bottles + upp/packages set, dispatch total_quantity recomputed, missing bottles deducted from factory_warehouse_stock/distributor_stock (only when status in dispatched/delivered/completed), item stamped unit_repair_applied_at (idempotent).
- Frontend (PromoDispatchSection.jsx): admin "Repair Units" button (repair-crate-units-btn) next to Reasons → dialog auto-runs dry-run, shows preview table (repair-finding-N), Apply Repair (repair-apply-btn) only shown for dry-run with findings.
- Verified in preview with seeded legacy record: dry-run found only the broken line (no false positives on real data), apply corrected 1→12 + stock 100→89, rerun = no-op; UI dialog E2E via screenshot. Test data cleaned up.
- PRODUCTION: user must redeploy, then click Repair Units → review preview → Apply on production. Preview fix is NOT live in production until redeployed.

## 2026-08 — Volume Tracking: order-recency highlighting
- User request: green background if last order within 2 weeks, else red — on Latest Delivery Date + Last Order Quantity, and on the most recent date/qty line inside Last 4 Delivery Dates / Qty columns.
- Frontend-only (AccountVolumeGrid.js): orderRecencyClass(row) — ≤14 days from latest_delivery_date → bg-emerald-100, else bg-red-100; null (neutral) when never ordered. Applied in renderCell to RECENCY_COLS and to index-0 line of the two list columns (backend sends lists newest-first). data-testid="vg-recency-{colKey}".
- Verified by screenshot: red highlights on stale accounts, only first line highlighted in Last-4 columns, no-order rows neutral.

## 2026-08 — Recency highlighting v2: 4-tier subtle pills
- User feedback: full backgrounds too disturbing. Replaced with contemporary status-dot pills (rounded-full, 10% tint bg + small solid dot): ≤7d dark green (emerald-700), ≤14d light green (emerald-400/500), ≤21d amber, >21d red. Same 4 spots (latest date, last qty, first line of both Last-4 columns); never-ordered rows neutral.
- AccountVolumeGrid.js: orderRecency(row) returns {pill,dot}; RecencyPill component; data-testid vg-recency-{colKey} unchanged.
- Verified by screenshot (red tier live on preview data; other tiers same code path).

## 2026-08 — Promo crate-unit bug v2: DO bridge + repair tool coverage (production DC-2607-0011)
- User report: 16-Jul promo stock-out (5 crates of 12) counted as 5 bottles; Repair Units found nothing.
- Root cause 1 (source): Delivery Order bridge (_auto_create_draft_promo) passes quantity_unit="bottles", but the DO stored 5 UNCONVERTED (packaging "12 Bottle Crate" had no units_per_package, so DO form never multiplied). create_promo_dispatch bottles-path saw 5 % 12 != 0 → stored 5 loose bottles but KEPT the crate label.
- Root cause 2 (repair miss): repair endpoint scanned only legacy db.promo_dispatches; new dispatches are is_promo docs in db.distributor_deliveries.
- Fixes:
  - delivery_orders.py: _normalize_item_units() at create + update — if item names a packaging but client sent upp<=1, resolve upp from SKU packaging_config (id/name match) or digits in packaging name, multiply quantity → bottles. No double-multiply when client already converted (upp>1 sent).
  - promo_dispatch.py _resolve_units: name-digit fallback ("12 Bottle Crate" → 12); loose-bottle collapse now relabels to "Bottle" (pkg_id None) instead of keeping misleading crate name.
  - Repair endpoint scans BOTH collections. is_promo deducted statuses {complete, completed, delivered} (open statuses = reservation only, recomputes from corrected qty). Detection: resolved upp>1 AND (packages==qty or packages None with package-count-shaped qty). Clean-multiple collapsed lines (upp stored 1, qty%upp==0) are AMBIGUOUS → listed, flagged, never auto-repaired. Response adds "ambiguous" count; each finding has ambiguous flag.
  - PromoDispatchSection.jsx: dialog copy updated; ambiguous rows amber with "review manually — skipped"; Apply hidden when only ambiguous lines.
- Verified in preview: replica of DC-2607-0011 detected (5→60, stock 100→45 after 55-bottle catch-up deduction), ambiguous 24-line flagged and untouched, real legacy draft DC-2606-0006 corrected (2→24, no stock change for draft), idempotent rerun, DO create with unconverted 5-crates stored as 60/upp=12 (PASS), already-converted 60 not double-multiplied (PASS). Test data cleaned up.
- PRODUCTION: redeploy, then rerun Repair Units → DC-2607-0011 will appear (5 → 60, deducts missing 55) → Apply.

## 2026-08 — Pending Approvals widget: always collapsed
- Home widget (PendingApprovalsWidget.jsx) now renders collapsed on every load — header row shows title + amber count badge + chevron; clicking toggles the list. No persistence (always starts collapsed per user request). data-testid pending-approvals-toggle.
- Verified with seeded approval tasks: badge=2 while items hidden, expand shows 2, re-collapse hides. Seeds cleaned up.

## 2026-08 — Volume Tracking recency legend
- Small legend row above the grid (below filters, data-testid vg-recency-legend): "Last order:" + four pills matching the tier styling (within 1 week / 2 weeks / 3 weeks / 4+ weeks ago). Verified by screenshot.

## 2026-08 — Promo repair v3: false positives, duplicate challan numbers
- User report (production): bottle-only "DC-2607-0011" shown as needing correction; 14 findings vs 13 lines; "all DCs flagged".
- Root causes:
  1. DUPLICATE CHALLAN NUMBERS: _generate_challan_number counted only legacy promo_dispatches (frozen at 5) while inserts go to distributor_deliveries → same numbers reissued (preview had DC-2606-0006 ×11; production has two different DC-2607-0011s). The flagged "DC-2607-0011" was the OTHER record (5-crate, DO-2026-0055), not the bottles-only one.
  2. Over-aggressive name parsing: raw (\d+) regex could read "330ml Bottle" as 330 units.
- Fixes:
  - _generate_challan_number: max numeric suffix across BOTH collections + 1 (historic dupes left untouched — printed challans/Zoho refs).
  - _pkg_units_from_name + delivery_orders._normalize_item_units + promo _resolve_units: pack size from name ONLY when it names a container (crate/case/carton/pack/box/tray/dozen), with volume tokens (ml/ltr/l/kg/g) stripped first.
  - Repair resolve_upp: SKU packaging config is authoritative (explicit units=1 → trusted, skipped); config=1 vs container-name>1 contradiction → ambiguous (manual review, never auto-repaired). Returns (upp, force_ambiguous).
  - Findings now carry recipient + delivery_date; UI shows them under the challan number for disambiguation.
- Verified in preview: bottle-only challan NOT flagged, "330ml Bottle" NOT flagged, real 5-crate bug flagged (5→60) with recipient shown; challan generator returns unique max+1 across collections; DO create keeps "330ml Bottle" qty=3 unmultiplied while "12 Bottle Crate" 2→24 (PASS). Seeds cleaned up.

## 2026-08 — Repair tool: per-row fix
- RepairRequest gains item_ids (optional list). Bulk apply (no item_ids) still skips ambiguous lines; targeted apply (item_ids) applies exactly those lines INCLUDING ambiguous ones (explicit user confirmation). Findings include item_id.
- UI: each preview row has a "Fix" button (repair-fix-row-{i}); on success re-runs dry-run to refresh the list; "Apply Repair" renamed "Apply All". Ambiguous note: "needs review — use Fix to confirm".
- Verified: targeted fix corrected only row-item-1 (3→36, stock -33 only), others untouched; explicit fix on ambiguous line applied (24→288); remaining dry-run listed only leftover line; UI click-Fix corrected 7→84 and refreshed to no-issues. Seeds cleaned up.

## 2026-08 — Repair tool: distributor scoping + legacy item collection coverage
- RepairRequest gains distributor_id; scan filters both dispatch collections by it. PromoDispatchSection always sends the current page's distributor.id, so Repair Units shows only that distributor's records.
- Legacy promo_dispatches scan now also reads promo_dispatch_items (dispatch_id key) besides distributor_delivery_items; items tagged with _items_coll so apply updates/aggregates the correct collection.
- Verified: scoped dry-run returned only distributor A's finding; unscoped returned both. Seeds cleaned up.

## 2026-08 — Undo tool for applied crate repairs (production data recovery)
- User reported production data "messed up" after applying fix(es). Audit of write path: per-row Fix targets the unique item UUID (never the challan number — duplicates cannot cross-write). Likely cause of broad corruption: "Apply All" pressed on the earlier deployed build with loose digit detection (14 findings incl. false positives).
- Recovery: every repair stamped unit_repair_applied_at and preserved original quantity in `packages` → fully reversible.
- Backend: POST /api/promo-deliveries/undo-crate-repairs {apply, item_ids, distributor_id} — dry-run lists applied repairs (current_quantity, restores_quantity_to, stock_to_restore, stock_will_be_adjusted per dispatch status); apply restores quantity=packages, clears stamp (sets unit_repair_undone_at), recomputes total_quantity, adds deducted stock back via _adjust_stock_for_dispatch sign=+1. Scans both collections + both item collections; distributor-scoped.
- UI: repair dialog now has tabs "Issues found" / "Applied fixes (undo)" — per-row Undo + Undo All (rose styling). data-testids: repair-tab-issues/applied, undo-finding-{i}, undo-row-{i}, undo-all-btn.
- Verified full round-trip in preview: fix 4→48 (stock 100→56), undo → qty 4, total 4, stock 100, stamp cleared; undone line re-appears in Issues scan (correct). UI tab screenshot OK. Seeds cleaned.
- PRODUCTION recovery: redeploy → open the affected distributor → Repair Units → "Applied fixes (undo)" tab → review each line (shows what it restores) → Undo per row or Undo All.

## 2026-08 — Child-split reconciliation tool (option b)
- Root understanding: WH stock rows carry child (branding) classification; transactions carry their own. Misattributed writes (promo generic-only deductions, etc.) drift the split while SKU totals stay right. Branding conversions (branding_entries: from_child→to_child) are LEGITIMATE split changes and are included in expected calc.
- Backend: POST /api/distributor/stock-child-realign {apply, location_id, sku_id} (CEO/Director/Admin) in global_stock_dashboard.py. Expected per child = shipments_in − deliveries_out (incl is_promo) − legacy promo dispatches − transfers(source−/dest+) − factory_returns + branding(from−/to+). Residual (production/unexplained) parked in Generic; negatives clamped (shortfall from Generic, then largest child); targets always sum EXACTLY to actual SKU total. Apply: negative delta deducts rows largest-first; positive delta upserts aggregate (batch None) row. Idempotent.
- UI (GlobalStockDashboard.jsx): admin "Reconcile" button → dialog with per-SKU drift cards (child: actual → target, ±delta, total badge), per-SKU Realign + Realign All. data-testids: gsd-realign-btn, realign-dialog, realign-finding-{i}, realign-sku-{i}, realign-all-btn.
- Verified: seeded drift scenario (shipments+delivery+branding) produced exact expected targets (A 120→96, B 60→96, Gen 36→24, total 216 preserved), apply matched, idempotent (drift 0 after). Tenant-wide scan on real preview data found only 1 legit artifact (no false positives). UI dialog verified via screenshot. Seeds cleaned.
- Pending user-approved option (a): Factory Return "from customer returns" flag to avoid deducting sellable stock for empties/damaged send-backs.

## 2026-08 — Realign v2: distributor scoping + reversal
- Realign is now distributor-scoped: RealignRequest gains distributor_id; UI dialog has a MANDATORY distributor select (realign-dist-select) — scan/apply only cover that distributor's warehouses.
- Reversal provision: every applied realignment is logged to stock_realign_log {id, location, sku, changes:[{child_sku_id, child_sku_name, delta}], applied_at/by}. New endpoints: POST /api/distributor/stock-child-realign/history {distributor_id} and /undo {log_ids?, distributor_id} — undo applies inverse deltas via shared _apply_child_delta helper (neg → deduct rows largest-first, pos → credit aggregate batch-less row) and stamps reverted_at/by. UI: Drift / History (undo) tabs, per-log Undo + Undo All (realign-undo-{i}, realign-undo-all-btn), reverted logs greyed with REVERTED label.
- Verified: wrong-distributor scope → 0 drift; correct scope apply → log with exact deltas (A −24, Gen −12, B +36); Undo All restored A=120 B=60 G=36 total 216 exactly; UI picker + tabs + empty states via screenshot. All seeds cleaned.

## 2026-08 — Realign v3: open stock-out awareness
- Verified from complete_delivery: stock rows are deducted ONLY at completion — open (draft/confirmed/scheduled/in_transit/delivery_assigned/delivery_scheduled/on_the_way) stock-outs have NOT touched physical rows, so they're correctly excluded from expected-flow subtraction.
- Added safeguard: per-child realign target is floored at that child's open stock-out commitments (reserved), borrowing from Generic-first/largest-surplus donors; totals still preserved exactly. Findings include "reserved" per child; UI shows an amber "reserved n" hint.
- Verified: open confirmed 30-generic stock-out lifted Generic target 24→30 (borrowed 6 from Child A), targets sum 216. Seeds cleaned.

## 2026-08 — Realign v4: branding transparency + toggle (production incident follow-up)
- Production incident: user applied realign; Generic went to 0 (300 rec / 15 del). Cause: branding_entries (Generic→branded conversions) counted in expected split, but production shipments already arrive child-attributed → branding entries double-counted the same movement. Instructed user to UNDO via History tab (restores exact prior split).
- Fixes:
  - flows now tracked per component (received / delivered / transfer_out / factory_returns / branding); each finding child includes a "flows" breakdown so the preview math is fully verifiable.
  - RealignRequest.include_branding (default true): when false, branding conversions are excluded and targets equal pure received−delivered−returns. UI checkbox "Count branding conversions" (realign-branding-toggle) re-runs the preview on toggle; child rows show tiny breakdown line (rec/del/xfer/fact.ret/brand).
- Verified: with branding A96/B96/G24; without branding A96/B60/G60 (pure rec−del); totals 216 both ways; UI toggle + dialog screenshot OK. Seeds cleaned.
- PRODUCTION guidance: Undo the applied realignment first, redeploy, re-open Reconcile, UNTICK branding toggle to compare, verify per-child breakdown, then apply per-SKU only when numbers match physical reality.

## 2026-08 — Production-replica simulation of realign v4 (verified before user redeploy)
- Seeded EXACT production numbers (rows 1128/1080/544/424; received 3420/1440/1800/300; delivered 2328/720/720/15; 1 generic factory return; duplicate branding entry generic→Cafe 284).
- Toggle OFF result: Royal 1092, Garci 720, Cafe 1080, Generic 284 — every child = received−delivered(−returns), total 3176 preserved. Fixes "available > received" (Garci 1080→720).
- Toggle ON reproduced the bad production result (Generic→0), confirming duplicate branding entries as root cause.
- User instruction: redeploy → Reconcile → pick distributor → UNTICK "Count branding conversions" → verify breakdown → apply per-SKU.

## 2026-08 — Branding entry cleanup tool
- Purpose: remove duplicate Branding-module conversions that double-count already-branded receipts (production root cause), making toggle-ON reconciliation trustworthy.
- Backend (global_stock_dashboard.py): refactored flow collection into _collect_child_stock_data(tenant_id) shared helper. New endpoints (admin): POST /api/distributor/branding-entries/cleanup (list, distributor-scoped, per-entry suspect flag = drift-with-branding > drift-without at that loc+sku), /cleanup/remove {entry_ids} (archives to branding_entries_removed then deletes record — stock rows untouched; realign afterwards), /cleanup/restore {entry_ids}.
- UI: third tab "Branding entries" in Reconcile dialog — entries list with rose "suspect" badge + per-row Remove, removed section with Restore, footer "Remove All Suspect (n)". data-testids: realign-tab-branding, branding-entry-{i}, branding-suspect-{i}, branding-remove-{i}, branding-restore-{i}, branding-remove-suspect-btn.
- Verified: duplicate entry flagged suspect (drift 100 with vs 0 without), legit entry not flagged (0 with vs 60 without); remove → 24 Brand vanished from drift findings even with branding ON; restore round-trip clean. UI tab screenshot OK. Seeds cleaned.

## 2026-08 — Global dashboard Reserved missing scheduled/assigned stock-outs
- Production report: Garci stock-out scheduled (status delivery_assigned, DEL-2026-0631, 360 bottles) not shown as Reserved; Available == WH.
- Root cause: global_stock_dashboard.py RESERVED_STATUSES = {draft, confirmed, scheduled} only — once a delivery attaches to a schedule it becomes delivery_assigned/delivery_scheduled/on_the_way/in_transit and fell out of Reserved. Distributor-level page already used the full set (RESERVED_DELIVERY_STATUSES in distributors.py).
- Fix: RESERVED_STATUSES now matches the full open set {draft, pending, confirmed, scheduled, delivery_scheduled, delivery_assigned, on_the_way, in_transit}; realign OPEN_STATUSES also gained "pending".
- Verified: seeded delivery_assigned 360-bottle delivery → dashboard reserved=360, available = on_hand − 360; real preview deliveries in the missed statuses now counted. Seed cleaned.

## 2026-06 — Stock Trace diagnostic (Global Stock Dashboard)
User report (production, warehouse without child SKUs): WH Stock HIGHER than Received − Delivered.
Root cause: physical stock ledger moves the RAW item `quantity` (shipment credit at distributors.py:3063/3116, delivery deduction at :6102 `_deduct_stock_with_spill`), while dashboard columns convert via `_item_units()` (quantity × packaging_units for old-model lines). An old-model delivery line (quantity=5 crates, packaging_units=12) shows Delivered 60 but only deducted 5 from stock → WH inflated by 55.
Fix delivered: read-only Stock Trace tool — GET /api/distributor/global-stock-dashboard/trace?location_id&sku_id + magnifier button per SKU row (admin-only) opening a dialog with Expected vs Actual vs Difference, mismatch total, and every movement (Stock In, Stock Out incl. reversed/reserved, legacy promo, transfers, factory returns, branding/realign net-zero notes) showing column units vs stock-moved units, mismatched lines highlighted. Verified E2E in preview (synthetic +55 case). User must REDEPLOY to use on production.
Backlog: an optional repair action for flagged mismatched delivery lines (deduct the missing units) — dry-run first, per-line, undo-able, like the promo Repair Units tool.

## 2026-06 — Stock Out grouping options
Stock Out tab (DeliveriesTab.jsx) now has a "Group by" selector (data-testid deliveries-group-by): Date (default, unchanged incl. Today/Tomorrow pills), SKU (a multi-SKU delivery appears under each of its SKU groups), Account. SKU/Account groups sort alphabetically, expand by default, collapsible headers with Package/Building2 icons. Verified via screenshots (Brian distributor, Lifetime period).

## 2026-08 — Stock Out Excel export simplified
/api/distributors/{id}/deliveries/export rewritten to a flat sheet (one row per delivery line): Account Name, City, SKU, Quantity, Invoice Value (qty × customer price), Date of Delivery, Status. Removed grouped summary + drill-down rows and pricing columns. Honors time_filter/account/warehouse params (already passed by DeliveriesTab downloadExcel). Verified via curl (lifetime 19 rows vs this_month 0, matching UI).

## 2026-08 — Actual Monthly Consumption column (Volume Tracking)
Backend (account_volume_grid.py): per account computes `actual_monthly_consumption_crates` = crates delivered in last 28 days, only when ≥30 days elapsed since first delivery; otherwise `consumption_available_in_days` = 30 − elapsed. Formula name "Actual Monthly Consumption" available; Excel export has the column (totals row includes it; pending shows "Available in X days").
Frontend (AccountVolumeGrid.js): new base column after Expected Monthly Volume; pending state renders italic "Available in X days" + Info icon (hover title + click Popover with the explanation text). data-testids: vg-amc-pending-{code}, vg-amc-info-{code}.
Preview seed kept for demo: accounts AMC Test Mature (shows 3 crates) / AMC Test New (Available in 17 days), ids amc-test-acc-a/b, deliveries amc-del-*, sku amc-test-sku — delete with regex ^amc- when user asks.

## 2026-08 — Stock at Warehouse column + low-stock red signal (Volume Tracking)
New column "Stock at Warehouse (Crates)": current stock of the account's ordered SKUs at the warehouse that last delivered to it (distributor_stock + factory_warehouse_stock). Cell (not row) gets red bg + bold red text when stock < ½ × estimated monthly consumption (Expected Monthly Volume if set, else Actual Monthly Consumption). Available in formulas as "Stock at Warehouse"; Excel export includes the column with red fill on flagged rows. testid: vg-whstock-{code}[-low]. Seed extended: amc-test-loc location + amc-test-stock (12 bottles = 1 crate) → Mature flags red (1 < 1.5).

## 2026-08 — Volume Tracking: Account Age + redesign + default hidden cols
- New "Account Age (Days)" column (days since activated_at), hidden by default; in Excel export (after On-boarded Date; totals/custom offsets shifted, low-stock fill col now 18); formula name "Account Age".
- Default hidden columns: order_count, onboarded_date, last_order_sku, account_age_days. LS key bumped to volume_grid_hidden_columns_v2 so defaults apply to all users once.
- Redesign per /app/design_guidelines.json (design_agent): dark #0b192c header (white text, wider tracking), summary row #EAF0FC/#DFE7F7 corner, zebra white/#F8FAFC, hover #EDF2FA, strict alignment (numbers/dates), tabular-nums everywhere, bordered subtle recency pills (legend + cells), low-stock cell rose-50 with inset rose left bar, list columns newest-on-top with muted history, text-xs density, rounded-lg container.
- AMC demo rows removed from preview (13 records: ^amc- regex across 6 collections).

## 2026-08 — New-account highlight + demo seed (Volume Tracking)
Accounts on-boarded within last 7 days (account_age_days <= 7): account name cell gets blue tint #EAF1FF + 2px left brand accent + "NEW" pill (testid vg-new-account-{code}), tooltip "plan stock for this new account".
Preview seed (prefix vgdemo-): Demo Fresh Mart (New) activated 3d ago → NEW badge; Demo Grand Hotel (Low Stock) expected 10 crates vs 3 crates at Demo Stock WH → red stock cell. Cleanup: delete id regex ^vgdemo- across accounts, master_skus, distributor_locations, distributor_stock, distributor_deliveries, distributor_delivery_items.

## 2026-08 — Needs Attention filter (Volume Tracking)
One-click toggle chip "Needs attention (count)" (testid vg-attention-filter) next to location filters: shows only rows with low_warehouse_stock OR account_age_days <= 7. Active state = solid rose. Verified: 15 rows → 2 (both vgdemo seeds).

## 2026-08 — Stock at Warehouse column REMOVED
Removed from grid (BASE_COLUMNS), formula context, and Excel export (custom offset back to 17+j, no red fill). Backend still computes warehouse_stock_crates/low_warehouse_stock — the "Needs attention" filter still uses the low-stock flag.

## 2026-08 — Stock at Hand column (Volume Tracking)
"Stock at Hand (Crates)": computed like Global Dashboard WH Stock (physical distributor_stock + factory_warehouse_stock rows for the account's SKUs at last-serving warehouse), crates only, EDITABLE — manual value saved to accounts.stock_at_hand_crates_override (clear cell → reverts to computed). RED cell (bg-red-100 + inset red bar, testid vg-soh-{code}-low) when stock_at_hand < ½ × monthly order volume (actual monthly consumption first, else expected monthly volume). Excel export column 18 with red fill; formula name "Stock at Hand". Needs-attention filter now uses low_stock_at_hand. PUT /rows/{id} accepts stock_at_hand_crates_override / clear_stock_at_hand. Demo: vgdemo-del-3 bumped to 120 bottles (actual 10 cr/mo vs 3 on hand → red). Verified: compute/override/clear via curl + UI screenshot.

## 2026-08 — Stock at Hand fix (units + scope)
Bug: values looked like bottles / inflated identical totals. Causes: (1) summed stock of EVERY SKU the account ever ordered; (2) crate conversion missed SKUs without master bottles_per_crate. Fix: scope to SKUs of the account's LAST delivery only (mirrors dashboard row planners check); conversion now also learns bottles_per_crate from stock rows themselves (same as global dashboard learn_upc), fallback chain upc → stock_bpc → default_bpc. Verified: SKU without master bpc, 480 bottles + row bpc 24 → 20 crates; Grand Hotel still 3 crates red. Extra seed: vgdemo-sku2/vgdemo-stock2/vgdemo-del-4.

## 2026-08 — Stock at Hand now CHILD-SKU level
Stock rows keyed (loc, sku_id, child_sku_id). For each item of the account's last delivery: use item.child_sku_id, else the account's own branded child (child_skus.customer_account_id + parent_sku_id), else Generic (child None) rows. Verified: branded child 240 bottles/24 → 10 crates for Fresh Mart (was 20 from parent total); unbranded Grand Hotel → generic 3 crates red. Extra seed: vgdemo-child + vgdemo-stock3.

## 2026-08 — Stock at Hand: name-based child matching tier
Matching priority per last-delivery item: (1) item.child_sku_id → (2) child_skus.customer_account_id link → (3) NAME match: stock child rows whose child_sku_name contains the account name (casefold, min 4 chars) — production children are named "SKU – AccountName" and often lack ID links → (4) Generic (child None). Name tier also rescues stale/mismatched ids (units==0 triggers it). Verified: unlinked child row "Demo 500ml – Demo Grand Hotel (Low Stock)" 96/12 → 8 crates picked over generic 3. Seed: vgdemo-stock4.

## 2026-08 — Stock at Hand: negative clamp + edit error fix
Negative stock aggregates clamp to 0 (mirrors dashboard max(0,..) per row); name/generic fallback also triggers when target units <= 0. saveCell now parses FastAPI 422 detail arrays → readable toast (was "[object Object]"); friendly default "enter a valid non-negative number". Verified: -2460 bottle child row → 0.0 crates; override -5 → "Input should be greater than or equal to 0".

## 2026-08 — Volume Tracking explainer
"How it works" button (vg-help-btn) in header opens dialog (vg-help-dialog, component /app/frontend/src/components/VolumeGridHelp.js): 6 action cards (edit cells, arrange grid, formulas, needs-attention, export, planner), per-column derivation table (16 rows), colour-signal legend (NEW, red stock, recency pills, Available in X days). Verified via screenshot.

## 2026-08 — Clickable recency pill filters
Legend pills (vg-recency-pill-w1..w4) now toggle filters (multi-select OR, ring highlight when active, "clear" link vg-recency-clear). Tier from latest_delivery_date. Help dialog updated (Recency filters action card + legend bullet). Verified: 15→2 (w1) →6 (w1+w4) →15 (clear).

## 2026-08 — New accounts filter
"New accounts" toggle (vg-new-filter, count badge) next to Needs-attention: filters to account_age_days <= 7 (NEW tag). Help dialog updated with "New accounts filter" card. Verified: 15 → 1 (Demo Fresh Mart).

## 2026-08 — Free stock delivery order: "no linked contact" fix
Root cause: contacts collection has NO account_id linkage in this schema, so _auto_create_draft_promo (delivery_orders.py) failed for every account-recipient order despite contact details on the order. Fix: when no linked contact exists, auto-create a lightweight contact (name/phone from order, fallback account fields; account_id set; note "Auto-created from Delivery Order …") and proceed. Verified E2E via API: draft→submit→approve→place_order → promo created (challan at Brian) for account with 0 linked contacts. Production users can use the existing retry-promo on previously failed orders after redeploy. Test artifacts cleaned.

## 2026-08 — Remove failed delivery requests (admin)
DELETE /delivery-orders/{id} now also allows CEO/Admin to delete orders with fulfillment_status=="failed" (stock-out never created). Detail dialog shows destructive "Remove Failed Request" button (do-permanent-delete-btn) for admins on failed orders. Verified via curl: seeded failed order deleted, 404 after.

## 2026-08 — Delivery request min date: tomorrow
Min requested_date changed from +2 days to +1 day (create validation, duplicate clamp, frontend calendar min + hint "Earliest delivery is tomorrow"). Verified: tomorrow accepted, today rejected with updated message.

## 2026-08 — Lead Briefs module (NEW)
Backend routes/lead_briefs.py (/api/lead-briefs): GET list (city/status filters, returns is_admin), GET /cities, POST (admin: CEO/Director/Admin/System Admin), PUT, DELETE (admin), POST /{id}/review (any user → reviewed + reviewer/at), POST /{id}/converted {lead_id, lead_company}. Collection lead_briefs: title/city/summary/content/source_name/source_url/status(new|reviewed)/converted_lead_*.
Frontend pages/LeadBriefs.js at /lead-briefs (moduleKey lead_briefs, registered in models/role.py defaults+Core+display names, App.js route, DashboardLayout Sales nav after Leads, NotebookPen icon): card grid (city+date meta, title, 3-line summary, "Read brief →", status badges New blue / Reviewed green / Lead added indigo), city select + status pill filters with counts, detail popup (full content, source link, Mark Reviewed, Add as Lead mini-form → POST /api/leads {company,contact,phone,city,state,region,source:"Lead Brief"} then /converted, admin Delete), admin Add Brief dialog. Verified E2E: create x2, filters, review, lead conversion round-trip. 2 sample briefs left in preview (Hyderabad reviewed, Bangalore new).

## 2026-08 — Lead Briefs v2 (photos, socials, contact fields, master-city dropdown)
Brief fields added: linkedin_url, instagram_url, image_url, email, phone (create/update/doc). Add-form city is now a dropdown from GET /api/master-locations/flat (master_cities). Card shows photo banner (h-36): image_url → Instagram avatar via unavatar.io/instagram/{handle}?fallback=false → brand-blue initials block (BriefPhoto component with onError fallback; LinkedIn has no public avatar API so use Photo URL for LinkedIn folks). Popup: photo + full content + contacts block (LinkedIn/Instagram links, mailto email, tel phone). Add-as-Lead prefills phone/email; mini-form has Email field. Verified via screenshots (Hyderabad brief shows photo+LinkedIn+email+phone; initials fallback works). User has real briefs in preview already (Canisio Carneiro, Goa).

## Update — 25 Jun 2026: AI-Powered Lead Brief Creation
- "Add Brief" now opens a 2-step flow: Step 1 is an info-dump textarea; Step 2 is the review form.
- New endpoint POST /api/lead-briefs/ai-extract (admin, tenant-scoped) uses LlmChat (gpt-5.5, EMERGENT_LLM_KEY, same pattern as water_intelligence.py) to extract title, city (constrained to master cities), summary, content, source_name/url, linkedin_url, instagram_url, email, phone from raw pasted text.
- Frontend LeadBriefs.js: addStep state ('dump'|'form'), "Extract with AI" button, "Fill manually instead" skip, "Back to info dump" link; unknown AI city is injected into city Select safely.
- Tested in Preview: backend curl extraction correct; Playwright e2e dump→extract→pre-filled form verified. Production requires redeploy.

## Update — 25 Jun 2026: Lead Briefs — 4-per-row grid + LinkedIn profile photos
- Grid now shows 4 cards per row on wide screens (xl:grid-cols-4).
- Backend fetches og:image from the LinkedIn profile URL (browser UA, httpx) on brief create/update, stored as linkedin_photo_url. Best-effort: LinkedIn bot-blocks some profiles (HTTP 999) — those fall back to Instagram avatar → initials.
- Photo priority: image_url → linkedin_photo_url → Instagram unavatar → initials.
- Verified in Preview: demo brief with real public LinkedIn profile renders the fetched photo. Redeploy needed for Production.

## Update — 25 Jun 2026: Instagram profile photo pickup (same mechanism as LinkedIn)
- Backend now fetches og:image from the Instagram profile URL too on brief create/update (stored as instagram_photo_url); photo priority: image_url → linkedin_photo_url → instagram_photo_url → initials.
- Removed broken client-side unavatar.io Instagram call (unavatar now paywalls Instagram).
- NOTE: Instagram aggressively login-walls anonymous/datacenter requests (429), so from Preview the IG fetch returned NONE; mechanism verified via LinkedIn path which works. May succeed from Production IP.

## Update — 25 Jun 2026: Multi-prospect AI splitting for Lead Briefs
- /api/lead-briefs/ai-extract now returns {briefs:[...]} — AI splits messy dumps into one brief per prospect, attaching correct links/contacts/city to each; unattachable intel goes under a "General notes:" section of the most relevant brief.
- Frontend: single prospect → existing review form; multiple → new 'multi' review step (stacked editable cards, include checkboxes, Save All (n)). No cap on prospect count.
- Verified in Preview: 3-prospect curl split correct (incl. Bengaluru city mapping + General notes); UI e2e tested with 2 prospects, untick + Save All worked. Redeploy for Production.

## Update — 25 Jun 2026: Duplicate Warning + Fetch Photo retry
- POST /api/lead-briefs/check-duplicates: matches on prospect name (title/name-part, min-length guarded), email (exact), phone (multi-number aware, last-10-digit sets). Verified: name/email/phone matches + zero false positives.
- Single form: save triggers dup check → amber warning box listing matches → button becomes "Save Anyway". Multi-review: amber "Possible duplicate of…" note per card.
- POST /api/lead-briefs/{id}/fetch-photo: retries LinkedIn/Instagram og:image fetch; honest ok:false message when blocked. "Fetch Photo" button in brief popup (admin, only when no photo + social URL present).
- KNOWN LIMIT: LinkedIn serves photos only for high-visibility profiles to server IPs (williamhgates=200, marcodemiranda=999 consistently, incl. Googlebot UA + jina proxy). Regular profiles need retry from Production IP or manual Photo URL.

## Update — 25 Jun 2026: Lead Brief popup cleanup + 3 features
- REMOVED "Add as Lead" conversion (button + mini-form dialog) per user request; backend /converted endpoint left in place but unused.
- Manual Photo Edit: admin row in brief popup — paste photo URL + "Set Photo" (PUT image_url). Verified working.
- Brief Ageing: AgeTag on cards + popup for status=new — "today"/"Nd unreviewed", amber ≥3d, red ≥7d.
- City Coverage: /lead-briefs/cities now aggregates new_counts; city filter dropdown shows "City — N new".
- All verified via Playwright in Preview. Redeploy for Production.

## Update — 25 Jun 2026: Social profile enrichment
- _fetch_profile_meta parses og:title/og:description + JSON-LD (name, location, followers via interactionStatistic dict-or-list) from LinkedIn/Instagram pages; stored as linkedin_profile / instagram_profile on the brief alongside photos.
- Enrichment runs on create/update and via the renamed "Fetch Profile Info" button (/{id}/fetch-photo endpoint).
- Popup shows a profile card: name, followers (en-IN formatted), location, bio/description, "auto-fetched from" label.
- Same access limits as photos: only publicly-served profiles work (Instagram mostly blocked from datacenter IPs).
- Verified in Preview: demo brief shows "Bill Gates - Gates Foundation, 4,05,99,474 followers · Seattle…, bio + experience/education".

## Update — 25 Jun 2026: Profile-aware AI extraction + Edit brief
- ai-extract now finds LinkedIn/Instagram URLs in the dump (regex, trailing-punctuation stripped — fixed bug where "url." broke the fetch), fetches live profile meta concurrently, and feeds it to the AI as VERIFIED PROFILE DATA. Verified: bare LinkedIn link produced brief enriched with name/role/org/location.
- Edit brief: admin "Edit" button in popup opens the review form pre-filled (editingId state); saves via PUT; dup-check skipped when editing; header/button switch to "Edit Brief"/"Save Changes". Verified via Playwright.

## Update — 26 Jun 2026: Delete Event in Marketing module
- Events list (/events, Events.js): trash icon on each event card (stopPropagation) → confirm dialog warning that stakeholders/tasks/budget items are removed too → DELETE /api/events/{id} (endpoint pre-existed in event_journeys.py with cascade deletes).
- Verified via Playwright in Preview: delete buttons render on cards, confirm dialog opens; cancelled without touching real data.

## Update — 26 Jun 2026: Lead Briefs in Marketing nav
- Added Lead Briefs item to marketingNavigationGroups in DashboardLayout.js (roles: CEO/Director/Admin/System Admin/Marketing Manager/Marketing Executive/Content Creator). Still present in Sales nav. Verified via Playwright with Marketing module selected.

## Update — 26 Jun 2026: Equipment document attachments
- equipment_master.py: POST/GET/DELETE /api/production/equipment/{id}/files with category form field (photo|certification|quotation|document), 15MB cap, files at /app/backend/uploads/equipment_docs, meta in `attachments` array on equipment doc.
- EquipmentMaster.js: paperclip button per row with count badge → Documents dialog (category select, multi-file upload, grouped lists per category, authenticated blob download, delete with confirm).
- NOTE: page uses localStorage 'session_token' (not 'token').
- Tested: curl upload/download/delete + invalid-category rejection; UI verified via Playwright. Demo data left in Preview: type + "Demo Booster Pump" with one certification file.

## Update — 26 Jun 2026: Equipment file auto-naming convention
- Upload endpoint renames files: {TYPE}_{Equipment_Name}_{NN}{ext}. Prefix map: photo→PHOT, certification→CERT, quotation→VEND (UI label "Vendor Documents / Quotations"), document→OTHE.
- Name: spaces→underscores, non-alnum stripped, >3 words truncated to first 3. Serial per equipment+type from max existing serial+1 (delete-safe). original_filename kept in meta.
- Verified in Preview: VEND_5_Micron_Filter_01/02.pdf, CERT_5_Micron_Filter_01.pdf, PHOT_5_Micron_Filter_01.jpg, CERT_High_Efficiency_Particulate_01.pdf, OTHE_5_Micron_Filter_01.pdf. Demo equipment "5 Micron Filter" + "High Efficiency Particulate Air Filter Assembly" left in Preview.

## Update — 26 Jun 2026: Equipment photo thumbnails + preview
- Photos category renders a thumbnail grid (AuthImg component fetches via authenticated blob URL); click opens a lightbox dialog with full image, size/uploader info, Download and Delete. Hover ✕ on thumbnails for quick delete.
- Verified via Playwright: 2 thumbnails rendered, lightbox opened with image. Fake text-based .jpg test file removed from demo data.

## Update — 26 Jun 2026: Camera capture for equipment photos
- "Take Photo" button in Documents dialog: <input type="file" accept="image/*" capture="environment"> opens the phone rear camera directly; upload forced to 'photo' category (auto-named PHOT_..._NN). Desktop falls back to file picker.
- Verified in mobile viewport via Playwright: capture attrs present, simulated capture uploaded and thumbnail appeared.

## Update — 26 Jun 2026: Maintenance photo log
- LogDateBody gains photo_ids; log-maintenance/log-replacement embed {id, filename} photo refs into the log entry (_log_photos_meta resolves from attachments).
- Log dialog: "Take Photo" (camera capture) + "From gallery" buttons upload immediately as photo category (auto-named), thumbnails preview in dialog, ids sent with the log. Fixed babel error (await inside setState updater).
- Verified via Playwright + API: log entry stored with photos [{id, filename PHOT_5_Micron_Filter_03.jpg}].

## Update — 26 Jun 2026: In-app camera (fix for "Take Photo shows file picker")
- Root cause: capture="environment" attr only opens camera on mobile; desktop browsers always show a file picker (expected browser behavior).
- Fix: CameraDialog component using getUserMedia (facingMode environment) → live <video> preview → Capture draws to canvas → JPEG file uploaded (docs → photo category; log → log photos). Graceful amber error when camera denied/absent, pointing at "From gallery / files". Works on desktop webcam + phone; HTTPS required (both envs have it).
- Verified via Playwright with camera permission granted: dialog + live video + capture + upload thumbnail all working.

## Update — 26 Jun 2026: Equipment documents zip export
- GET /api/production/equipment/{id}/files-zip: in-memory zip, category folders (Photos/Certifications/Vendor_Documents/Other_Documents), filename {Equipment_Name}_documents.zip; 404 if no docs.
- "Download all (zip)" button in Documents dialog (shows only when attachments exist). Verified: zip contained all 8 files in folders; UI download + toast confirmed via Playwright.

## Update — 26 Jun 2026: iOS date-picker fix
- Root cause: shadcn Input applies display:flex to ALL inputs; iOS Safari has a documented WebKit bug where flex-displayed date/time inputs collapse the value area and taps fail to open the native picker (desktop unaffected).
- Fix in index.css: -webkit-appearance none + ::-webkit-date-and-time-value text-align, and iOS-only (@supports -webkit-touch-callout) display:block + min-height + min-logical-width for date/time/datetime-local/month inputs. Also touch-action: manipulation on rdp/popover buttons and onOpenAutoFocus preventDefault on DatePicker popovers.
- Desktop verified unchanged (display stays flex, input works). True iOS verification requires user's device — asked user to check Preview URL on iPhone/iPad.

## Update — 26 Jun 2026: iOS calendar-popover fix (design request / lead detail / print request etc.)
- Second root cause (beyond native date-input flex bug): shadcn Calendar inside Radix Popover doesn't receive taps on iOS Safari (known radix-ui/primitives + shadcn issue). Fix: modal={true} on the Popover + remove initialFocus + :has(.rdp) pointer-events CSS.
- Patched: ui/date-picker.jsx (both pickers), DeliveriesTab.jsx (reschedule), DesignRequestNewDetail.js (est date), MarketingRequestDetail.js, DeliveryOrders.js, NewMarketingRequest.js, NewDesignRequestNew.js (mr-due-input), AccountDetail.js (DateField).
- LeadDetail.js uses native type="date" inputs — covered by the earlier iOS CSS fix.
- Desktop verified via Playwright (design request due-date select works). iOS verification pending on user's device via Preview URL.

## Update — 27 Jun 2026: Factory returns adjusted against Stock-In invoice (not settlement)
- Warehouse-source factory returns now REQUIRE a Stock-In shipment link (dropdown via GET /api/distributors/{id}/stock-in-options); requires_settlement=false.
- On confirm: Zoho credit note (services/zoho_service.create_credit_note_for_factory_return) billed to distributor, associated + applied to the Stock-In's Zoho invoice; result stored in invoice_adjustment {status applied|failed, zoho ids, error}. Retry/link endpoint: PUT .../factory-returns/{rid}/adjust-invoice (admin).
- Settlements (preview/create/monthly in distributors.py) EXCLUDE factory returns entirely.
- Correction for old settlements: POST .../settlements/{sid}/detach-factory-returns (admin, blocked when paid) zeroes FR fields, reduces adjustments/final_payout, stores detached_* audit fields; purple Undo2 button in SettlementsTab.
- UI: DeliveriesTab FR form Stock-In dropdown + banner; table shows Invoice adjusted / Adjust invoice (red pill → dialog) / Invoice adj. on confirm states.
- Testing agent iteration_350: backend 12/13 pass (1 skip, no period data), frontend 100%. Zoho not configured in Preview → adjustment records graceful 'failed' with clear error (expected; real CN will work in Production where Zoho is configured).

## Update — 28 Jun 2026: Tasks-Internal (Customer Complaints) document uploads
- customer_complaints.py: ALLOWED_ATTACHMENT_TYPES = images + pdf/doc/docx/xls/xlsx/ppt/pptx/txt/csv + mp4; clear rejection message for others.
- CustomerComplaintDetail.js: input accept extended; section renamed "Photos & Documents"; non-image attachments render as file tiles (FileText icon, ext badge, filename, click-to-download); images unchanged.
- Verified via curl (pdf upload/download OK, .exe rejected) + screenshot (PDF tile rendered). Test file cleaned up.

## Update — 28 Jun 2026: Codebase lint/deploy-blocker cleanup (finish checks)
- ObjectId serialization: added .pop("_id", None) after insert_one before returning docs in tasks.py, task_management.py (4 sites), accounts.py (2), targets.py (2), requests.py (3), credit_notes.py (existing doc).
- Route shadowing fixed: leads.py /follow-ups moved above /{lead_id}; server.py lead-statuses/reorder + business-categories/reorder moved above their /{id} routes.
- Ephemeral upload storage migrated to Emergent object storage (services/object_storage put/get + new delete_object): event_journeys task files + budget files, equipment_master attachments (upload/download/delete/zip). Legacy pod-local files still readable via fallback (storage_path absent → local path).
- Ruff: duplicate event_journeys import removed; server.py `status` import aliased http_status (params no longer shadow); 22 bare excepts → except Exception (server.py, zoom_service.py, tests); F601 duplicate $ne keys → $nin in test_delivery_qr_address.py.
- Verified: equipment upload/download/zip/delete + event task file upload/download/delete via object storage (storage_path set, bytes intact); /api/leads/follow-ups 200.

## Update — 29 Jun 2026: Production missing-thumbnails RCA + UX hardening
- User report (Production screenshot "5 Micron FIlter"): thumbnails blank + downloads failing. Preview verified healthy (all 4 thumbs render, legacy local files download 200).
- RCA: Production files uploaded BEFORE the object-storage migration lived on the pod's ephemeral disk and were wiped at redeploy; attachment metadata survived → blank thumbs/404 downloads. Unrecoverable; user must re-upload. New uploads persist in Emergent object storage (uses EMERGENT_LLM_KEY from backend/.env, available in prod).
- UX: AuthImg now shows a "missing" placeholder tile on fetch failure (instead of endless grey pulse); download of a missing file shows a clear re-upload message.

## Update — Jun 2026: Promo stock-out "available 0" despite warehouse stock (Production bug)
- Root cause: `routes/promo_dispatch.py` hardcoded `child_sku_id: None` in availability check, batch FIFO allocation and stock deduction — production warehouse stock lives under the SKU's GENERIC child (e.g. "24 Generic brand", 281 bottles). Confirm failed with "need 3, available 0"; deduction would silently miss the row.
- Fix: `_allowed_child_ids()` (null child + generic child per SKU; customer-branded children excluded) applied to `_check_stock_availability`, `_allocate_batches_if_needed` (lines now record child_sku_id/name) and `_adjust_stock_for_dispatch` (deducts from the exact row, splits across rows).
- Preview API test: draft→confirm→complete deducted 281→278 from the generic-child row; reverse released reservation without deduction; over-demand rejected showing true availability (278). Test artifacts cleaned. Needs redeploy for Production.

## Update — Jun 2026 (round 2): Promo "available 0" hardening after user reported recurrence
- Extended `_allowed_child_ids` to also match legacy child SKUs without `child_type` whose name contains generic/unbranded.
- `_allocate_batches_if_needed` now falls back to NULL-BATCH stock rows (legacy stock-in / branding conversions on batch-tracked warehouses) when batched rows can't cover demand; such lines stay batch-less and deduct correctly.
- Both insufficient-stock errors now append `Stock rows here → <child/batch: qty list>` via `_stock_rows_summary` so a Production failure self-reports the data shape we cannot inspect.
- Preview tests: null-batch generic-child stock (legacy child shape) draft→confirm→complete 281→278 OK; over-demand error shows diagnostic. Artifacts cleaned. Pending: user redeploy + retry in Production; if it still fails, the new error text reveals the exact stock rows.

## Update — Jun 2026: Promo stock-out resolved in Production
- User confirmed the promotional stock-out now confirms successfully in Production (DC-2608-0013) and Reserved stock displays correctly on the Global Stock Dashboard.
- Reservation model reminder: Confirm → Reserved (Available drops); Complete/Delivered → WH. Stock deducted.

## Update — Jun 2026: Revenue Analytics showed pre-discount invoice value (Production, INV-002460)
- Root cause: `zoho_service._ensure_mirror_invoice` wrote CRM mirror invoices as qty×rate (no discount, no GST) → INV-002460 stored ₹2,16,000 vs actual Zoho total ₹95,256 (58% discount + 5% GST). Revenue Analytics reads these mirror values.
- Fix (forward): mirror now stores the FINAL Zoho invoice total (from the create/fetch response; best-effort GET fallback), and line items carry discount_percent/gross/discount/net. Fallback when Zoho unreachable = post-discount computed total.
- Fix (historical): new admin endpoint `POST /api/invoices/admin/zoho-mirror-repair?dry_run=` re-reads each zoho_books mirror's total from Zoho, corrects gross/net, adjusts account outstanding_balance by the delta (management roles only). UI: "Verify invoice values against Zoho" + "Fix N mismatched invoices" buttons in Revenue Analytics → Revenue Reconciliation panel.
- Preview tests: direct mirror call → 95,256 stored with correct discount line breakdown; fallback → 90,720; endpoint role-gated (403 non-admin) and iterates mirrors; UI button verified via screenshot. Zoho fetch itself only works in Production (Zoho not connected in preview). User must redeploy, then run "Verify → Fix" in Revenue Analytics.

## Update — Jun 2026: Zoho mirror repair — selective fixing
- Repair endpoint now accepts body {"invoice_ids": [...]} — when applying (dry_run=false) only those mirror ids are fixed.
- UI: after "Verify", mismatched invoices render as a checkbox table (invoice, account, date, stored vs Zoho total, difference) with select-all; "Fix N selected invoices" applies only ticked rows.
- Tested: backend selection filter (apply with unknown id → checked 0), role gate, UI verify flow via screenshot. Full mismatch table only demonstrable in Production (Zoho connected there).

## Update — Jun 2026: Water Intelligence — manual article link submission
- New endpoint POST /api/water-intelligence/submit-urls (manage roles, max 10 links): fetches each page's og/meta title+description, dedupes by URL and title-hash, AI-summarises via the same gpt-5.5 engine, and creates articles as pending_approval REGARDLESS of relevance score (manual picks bypass the min_score filter). Docs flagged is_manual + submitted_by; AI failure falls back to page title/description.
- UI: "Add Links" button on Water Intelligence header → dialog with multi-line URL textarea; result toast shows created/duplicates/failed; switches to Pending tab and refreshes.
- Tested: invalid URL 400, real link created (score 55 still pending_approval), duplicate resubmit skipped, dialog + button via screenshot. Test article cleaned.

## Update — Jun 2026: Zoho mirror repair scoped to page time period
- Repair endpoint now takes time_filter/from_date/to_date (same _window resolver as revenue-analytics) and only scans mirrors with invoice_date inside the window; response includes from/to.
- UI passes the page's selected time period, clears stale results when the period changes, and the summary shows the checked window. Custom period requires From/To dates.
- Tested: this_month→0 checked, all_time→2, custom window respected; UI summary "2026-08-01 → 2026-08-30 · Checked 0".

## Update — Jun 2026: Zoho repair table — full listing, breakdown columns, IST window fix
- Table now lists ALL invoices in the window (matched show "✓ matches"; mismatched highlighted amber with checkbox); error rows show account/date + fetch error.
- New per-invoice columns from Zoho: Discount, GST (tax_total), Incentive/CN (adjustment), Zoho Total — explains the difference vs stored value.
- Period summary line: total Stored vs Zoho actual, Overall difference, plus GST/Incentive/Discount totals (backend `totals` object).
- Fixed missing "today": revenue_analytics `_window` now computes today in IST (was UTC — hid same-day invoices until 05:30 IST). Affects the whole Revenue Analytics page consistently.
- Tested via API (all_time → 2 rows with account/date + totals) and screenshot (full table, summary bar, columns render).

## Update — Jun 2026: Revenue Analytics GST toggle
- New "GST: Included / Excluded" pill toggle in the filter bar. exclude_gst=true reports product-line (post-discount, pre-tax) value via _ex_gst_value (sum of _skuperf_line_value per invoice; invoices without line items keep full value).
- Applies to headline Gross/Net, ARR, and city/state/territory/category breakdowns. SKU breakdown was already ex-GST. Card label shows "(incl. GST)"/"(excl. GST)".
- Tested: seeded invoice (95,256 incl / 90,720 excl) → totals differed by exactly 4,536 GST; UI toggle verified via screenshot; test invoice cleaned.

## Update — Jun 2026: Revenue policy — GST EXCLUDED from revenue (user decision)
- Mirror invoices (new): gross/net_invoice_value = Zoho total − tax_total (post-discount, net of incentive, EX-GST). Full billed total stored as zoho_total_value + gst_amount. Account outstanding_balance still uses full billed total (receivable incl. GST).
- Repair tool: target value = Zoho total − GST; "New Value (excl. GST)" column added; Difference = target − stored; summary shows Correct revenue (excl. GST), Zoho billed, "GST (not counted)", Incentive, Discount. Outstanding correction uses (Zoho billed − old).
- GST toggle removed from Revenue Analytics (replaced by static "Excluded from revenue" note); headline card labeled "Gross Revenue (excl. GST)". Backend exclude_gst param retained but unused by UI.
- Tested: mirror with total 95256/tax 4536 → stored 90720, zoho_total_value 95256, gst_amount 4536; UI verified via screenshot.

## Update — Jun 2026: Reconciliation Excel export
- POST /api/invoices/admin/zoho-mirror-repair/export (management roles): branded xlsx of the verification table — title with period, TOTALS row, per-invoice columns (Stored/Discount/GST/Incentive/Zoho Total/New Value excl. GST/Difference/Status), mismatched rows amber, error rows red with fetch error.
- UI "Export Excel" button next to the verify summary; downloads via blob.
- Tested: endpoint returns correct xlsx (verified content via openpyxl read-back incl. totals, match/mismatch/error rows); button verified via screenshot.

## Update — Jun 2026: Credit-note toggle in Revenue Analytics (default: NOT deducted per user)
- Default revenue = ex-GST, post-discount, NET of credit notes/incentives (unchanged). New "Credit Notes / Incentives: Deducted / Not deducted" toggle rolls back the invoice-level incentive (via new incentive_amount field) and ignores separate credit_note_value.
- incentive_amount now stored on new mirrors (_ensure_mirror_invoice reads adjustment from Zoho) and set by the repair fix. Legacy invoices without it show unchanged in "Not deducted" mode.
- Backend: deduct_credit_notes param on /reports/revenue-analytics (_rev_pair helper in _aggregate + _window_totals). UI: pill toggle + static "GST & Discounts: Always excluded" note; card label shows after CN / before CN.
- Tested: seeded invoice (stored 86,616, incentive −4,104) → deducted vs not-deducted differ by exactly 4,104; UI toggle verified via screenshot.

## Update — Jun 2026: CN toggle showed same number — metadata backfill fix
- Cause: invoices fixed via the repair tool BEFORE incentive_amount existed have no stored incentive → "Not deducted" mode had nothing to add back.
- Fix: the Verify pass (dry_run included) now always refreshes gst_amount / incentive_amount / zoho_total_value on every scanned mirror from Zoho, without touching revenue values. One Verify run after redeploy enriches all invoices and the toggle differentiates.
- Preview: endpoint stable (Zoho-disconnected errors skip rows safely). Toggle math previously verified (4,104 incentive → exact diff).

## Update — Jun 2026: Stored basis flipped to BEFORE incentive (user revert request)
- User had fixed 1 week of invoices in Production; stored values were net of incentive. They want stored amounts WITHOUT incentive deduction.
- Final policy: stored gross/net_invoice_value = Zoho total − GST − adjustment (= post-discount subtotal, before CN). Applied to mirror creation and repair target. incentive_amount still stored separately.
- _rev_pair flipped: base is before-CN; "Deducted" mode ADDS incentive_amount (negative) + subtracts credit_note_value; "Not deducted" = base as-is (default).
- Revert path for the fixed week: re-run Verify → those invoices show mismatched by the incentive → Fix restores before-incentive values (metadata backfill also runs on Verify).
- Tested: mirror total 95256/tax 4536/adj −4104 → stored 94824; analytics diff between modes exactly 4104. UI labels updated ("New Value (excl. GST & CN)").

## Update — Jun 2026: Breakdown vs Compare mismatch fixed
- Cause: compare endpoints (revenue-compare, revenue-compare-multi) called _aggregate with default deduct_cn=True (after CN) while Breakdown UI defaults to Not deducted → 54.97L vs 50.57L (diff = incentives).
- Fix: both compare endpoints take deduct_credit_notes (default False = not deducted, matching Breakdown default); Compare tab got its own Deducted/Not-deducted pill toggle wired to the param.
- Tested: seeded Aug invoice (94,824 base / −4,104 incentive) → Breakdown this_month 94,824 == Compare Aug default 94,824; Compare deducted 90,720. Toggle verified via screenshot.

## Update — Jun 2026: Reversed stock-out — stock not returned (Production report DEL-2026-0695)
- Preview round-trip of complete→reverse verified correct (deduct + re-add symmetric incl. upsert with $in). Production case is data-specific; cannot inspect prod.
- Hardened reverse_delivery: re-add failures no longer stamp stock_readded=True; stores stock_readd_error and warns in the response message.
- New GET /{dist}/deliveries/{id}/stock-audit: reversal flags + per-line current warehouse stock rows (child/batch). New POST /{dist}/deliveries/{id}/readd-stock?acknowledge=true: manual one-shot re-add for reversed deliveries (guards: reversed status only, refuses double-run, requires acknowledge).
- UI: amber History button on reversed delivery rows (Stock Out tab) → Stock Audit dialog with rows + "Re-add stock now" (hidden after manual re-add).
- Tested: audit (missing stock visible), no-ack 400, re-add 0→3000, double-run blocked, dialog verified via screenshot. Test data cleaned.

## Update — Jun 2026: Reversal alerts + Stock Movement Log
- Reversal alerts: reverse_delivery now notifies all admin-role users (notify_users, in-app + email best-effort) when the stock re-add FAILS, linking to the distributor page / Stock Audit.
- Stock Movement Log: new utils/stock_ledger.log_stock_movement (best-effort) + stock_movements collection. Instrumented: delivery completion deduction (OUT), delivery reverse re-add (IN), manual re-add (IN, performed_by), promo dispatch deduct/restore (OUT/IN via _adjust_stock_for_dispatch).
- API: GET /api/stock-movements?search=&sku_id=&direction=&limit= (routes/stock_movements.py, registered at /stock-movements). UI: "Movements" button on Global Stock Dashboard → dialog with search (delivery no/SKU/batch), IN/OUT badges, qty, batch, source, reference, by.
- Note: completed unified promos are not reversible by design (only pre-completion). Tested: OUT logged on promo complete, IN logged on manual re-add with performer, UI dialog verified via screenshot. Test rows cleaned.

## Update — Jun 2026: Admin → Facilities module
- New Admin module page: /admin/facilities (nav: Admin › Organization › Facilities, moduleKey `facilities`, ADMIN_ONLY_ROLES; registered in moduleRegistry under `organization`).
- Backend routes/facilities.py (prefix /api/facilities, admin-role gated, tenant-scoped `facilities` collection):
  - Facility CRUD: name, type (Factory/Warehouse/Administration Office/Guest House/Retail Outlet/Other), google_address (maps link rendered as "Open in Google Maps"), contact person/phone/email, notes.
  - Hierarchy: nested floors[] each with areas[] — add/rename/delete floor, add/delete area.
  - Files: upload photo|document via object storage (scope facility_docs), auto-renamed PHOT_/DOCU_ + first-3-words of facility name + serial (e.g. PHOT_Nyla_Bangalore_Factory_01.jpg), 15MB cap; inline download endpoint; delete removes object too; facility delete cleans all objects.
- Frontend pages/Facilities.js: card grid, create/edit dialog, detail dialog (contacts, floors accordion with area chips, photo thumbnails via AuthImg with click-to-preview, documents list with preview/download/delete).
- Tested via curl (create → floor → 2 areas → photo upload with correct renamed filename → list) and screenshots (list, detail dialog with floors/areas/photo grid). Test facility cleaned.

## Update — Jun 2026: Facility Area Photos (pinpointed inspection photos)
- Photo uploads can target General / a floor / a floor › area (location Select next to Upload Photo). Backend validates floor_id/area_id, stores floor/area ids+names on the attachment meta.
- Naming now includes location: PHOT_<Facility>_<Floor>_<Area>_NN.ext (e.g. PHOT_Nyla_Bangalore_Factory_Ground_Floor_Storage_Area_01.jpg).
- Thumbnails show a green location badge; a "Show:" filter narrows the photo grid to any floor/area or General.
- Tested: curl uploads (area-level, floor-level, invalid floor → 404, filenames correct) + screenshot (badges render, area filter shows exactly 1 photo). Test facility cleaned.

## Update — Jun 2026: Equipment Master parent-child hierarchy (multi-level)
- EquipmentIn: parent_equipment_id (validated: exists, not self, no circular chains — walks ancestry) + has_children flag ("assembly" declared at creation, e.g. Machine yes / Filter no).
- Create/update store parent_equipment_name; renaming an equipment cascades to children's parent_equipment_name. Delete blocked (409) while children exist. List returns children_count (aggregation on parent_equipment_id).
- UI (EquipmentMaster.js): table renders as an indented multi-level tree (└ prefix, depth×18px); "Assembly · N children" badge (also shown when has_children declared); "Part of: X" subtitle when parent filtered out. Form: Parent Equipment select (excludes self + descendants) + "Has child equipment" checkbox.
- Tested: 3-level chain (RO Machine → Pump → Seal) via curl; cycle guard 400; delete-with-children 409; children_count/parent names correct; UI tree + form verified via screenshot. Test equipment cleaned.

## Update — Jun 2026: Equipment ↔ Facility area association
- EquipmentIn: facility_id/floor_id/area_id, validated hierarchically via _resolve_location (facility exists → floor in facility → area on floor, 400 otherwise); stores facility_name/floor_name/area_name. Empty facility clears floor/area.
- GET /api/facilities is now readable by all authenticated users (writes still admin-only) so Equipment Master can list options.
- UI: cascading Location selects (Facility → Floor → Area, downstream resets/disabled until parent picked) in the equipment form; table shows "📍 Facility › Floor › Area" under the equipment name.
- Tested: create with full chain (names resolved), invalid area → 400, table location line + edit-form prefill verified via screenshot. Test equipment/facility cleaned.

## Update — Jun 2026: Child rollup alerts + location filters (Equipment Master)
- Rollup: overdueChildCounts walks each overdue item's ancestry (multi-level) → red "N child part(s) overdue" AlertTriangle badge on every ancestor row (overdue = next_maintenance_due or next_replacement_due in the past).
- Location filters: cascading Facility → Floor → Area selects next to the Type filter (floor/area appear only after upstream picked; downstream resets on change); filters equipment by facility_id/floor_id/area_id.
- Frontend-only (EquipmentMaster.js). Tested via screenshot: overdue child rolled up to parent machine badge; facility filter 3→2 rows, area filter → 1 row. Test data cleaned.

## Update — Jun 2026: Frequency dropdowns + schedule start dates (Equipment Master)
- Maintenance & Replacement Frequency are now dropdowns: Daily(1), Alternate Days(2), Weekly(7), Every 10 days(10), Bi-Weekly(14), Monthly(30), Quarterly(90); "No schedule" and a "Every N days (custom)" option preserves pre-existing custom values. Days stored as ints (no schema change).
- New maintenance_start_date & replacement_start_date fields; _compute_dues falls back to start date when no last date: next_due = (last_date or start_date) + frequency.
- Table shows the frequency label (e.g. "Weekly") under the Next Maintenance/Replacement chips.
- Tested: create with Weekly + start 2026-06-01 → next due 2026-06-08; Quarterly → 2026-08-30; edit form prefill + dropdown options verified via screenshot. Test equipment cleaned.

## Update — Jun 2026: QR Maintenance Sheets + scan check-in + audit trail
- Backend routes/maintenance_sheets.py (prefix /api/maintenance; qrcode lib added to requirements):
  - GET /equipment/{id}/sheet?month&origin → generates schedule from frequency (daily=all days; others step from maintenance_start_date/last date), upserts maintenance_slots (unique token per equipment+date), returns per-day cells with QR data-URIs pointing to {origin}/maintenance-scan/{token}.
  - GET /scan/{token} → date-locked (IST): wrong day returns valid:false "This QR code is not valid for today."; right day returns equipment + already_submitted/record.
  - POST /scan/{token}/photo → camera capture uploads; server burns "DD-Mon-YYYY HH:MM:SS IST" stamp into the JPEG (PIL), stores in object storage (maintenance_photos scope), pending on slot until submit.
  - POST /scan/{token}/submit {status completed|incomplete, remarks, photo_ids} → immutable maintenance_records doc (equipment, scheduled_date, status, performed_by, completed_at IST, photos, remarks); slot locked (re-submit 409); completed updates equipment last/next maintenance dates.
  - POST /records/{id}/correction {note, corrected_status?} → append-only corrections audit (who/when); GET /records/{id}/photos/{pid} streams stamped photo.
- Frontend:
  - pages/MaintenanceScan.js at public route /maintenance-scan/:token (login-gated via API; shows login prompt): invalid-day screen, Complete/Incomplete choice, live getUserMedia camera capture ONLY (no gallery picker), remarks, submit → locked confirmation.
  - components/MaintenanceProfile.js: wrench button on each Equipment Master row → dialog with schedule stats, upcoming 10 dates, month picker + Print Sheet (popup replicating the uploaded PDF: blue header "EQUIPMENT MAINTENANCE CALENDAR", MONTH | SCHEDULE, meta rows, MON–SUN grid, MAINT. DUE/Scan today only/QR/Initial after completion cells, instructions footer, auto window.print), records list with photos (auth blob), corrections audit + Add Correction form.
- Tested end-to-end via curl + screenshots: daily sheet 30 days all QRs; yesterday token → invalid message; today token → photo stamped upload → submit completed → 409 on resubmit → correction logged → profile shows all; equipment last/next dates advanced; print popup layout verified vs PDF. Test data + storage objects cleaned.
- Fixed during dev: duplicated import/state/button lines in EquipmentMaster.js from a double-applied edit batch (build error) — deduped.

## Update — Jun 2026: Missed maintenance day alerts
- check_missed_maintenance(): finds maintenance_slots with date < today (IST), submitted != true, missed_notified != true; groups per tenant+equipment; notifies all admin-role users via notify_users (in-app + email best-effort) with equipment name, missed date list, location; marks slots missed_notified (once-only).
- Scheduler missed_maintenance_scheduler() registered in server.py startup: runs 30s after boot, then every 6h. Manual admin trigger: POST /api/maintenance/missed-check.
- Tested: generated daily sheet → yesterday's slot unsubmitted → run 1 {missed:1, alerts:1}, notification doc verified ("⚠ Missed maintenance: …"), run 2 {0,0} dedupe. Test data + notifications cleaned.

## Update — Jun 2026: Equipment form reorganized into collapsible sections
- New FormSection component (EquipmentMaster.js): icon + title + collapsed-state hint + animated chevron toggle.
- Six sections: Basic Details (Cog), Hierarchy & Location (Layers, emerald), Maintenance Schedule (CalendarCheck, blue), Replacement Schedule (Repeat, violet), Procurement Stock & Remarks (ShoppingCart, amber), Vendor Associations (Users, rose).
- Defaults: new equipment opens Basic + Maintenance only; editing auto-expands sections that contain data. Collapsed headers show summaries (e.g. "Weekly · from 2026-06-01", "2 vendors linked").
- Frontend-only; verified via screenshot (all 6 sections render, collapsed sections hide fields, expand works).

## Update — Jun 2026: Printable maintenance sheet redesigned (A4)
- buildSheetHtml (MaintenanceProfile.js) reworked to match the user's sample: solid blue banner header (white title + "MONTH | X SCHEDULE" right), single-line meta row (ID, Name, Frequency, Department/Location with blank line), dark navy MON–SUN header band, QR top-right next to the date, green MAINT. DUE label, "Scan today only".
- Alternate scheduled dates alternate background tints (due-a #e9eff6 / due-b #f7fafc) for quick visual rhythm.
- Signature space: real sign line + "Initial after completion" under every scheduled cell (footer notes inspectors initial the same line).
- A4: @page size A4 landscape 7mm margins, mm-based cell sizing (compact mode when 6 week-rows), print-color-adjust exact for banner/tints.
- Verified via popup screenshot at A4-landscape viewport: 8 due-a + 7 due-b alternating, 15 signature lines, fits one page. Test data cleaned.

## Update — Jun 2026: Colored section headers (equipment form)
- FormSection now takes color prop with SECTION_THEMES map (header bg, icon, title, border, chevron per palette incl. dark mode): Basic=indigo, Hierarchy & Location=emerald, Maintenance=blue, Replacement=violet, Procurement=amber, Vendors=rose.
- Verified via screenshot: six distinctly tinted collapsible headers.

## Update — Jun 2026: Facilities form sectioned + shared FormSection
- Extracted FormSection (+SECTION_THEMES, dark-mode aware, columns prop) to components/FormSection.js; EquipmentMaster now imports it (local copy removed).
- Facilities add/edit dialog reorganized: Basic Details (indigo), Address (emerald), Contact Details (blue), Notes (amber) — collapsed headers show value hints; editing auto-expands sections with data.
- Verified via screenshots: facilities dialog sections + expand works; equipment form unaffected after refactor.

## Update — Jun 2026: QC Team renamed to Factory Staff (backward compatible)
- Rename is UI-only: nav item + moduleRegistry label now "Factory Staff"; route /qc-team, moduleKey qc_team, API /api/production/qc-team, collection qc_team ALL unchanged so the QC defect-tracking mobile app keeps working.
- Backend QCTeamMemberCreate/Update gained OPTIONAL designation, department, phone, employee_id (persisted on create/update; _public_member passes them through; legacy name+role payloads verified working, has_face/has_pin/face_samples untouched).
- QCTeam.js page: "Factory Staff" header, role dropdown (QC Inspector/Lead, Production/Machine Operator, Packing, Warehouse, Housekeeping, Security, Supervisor, Electrician, Maintenance Technician, Driver, Helper, Other + preserves custom legacy values), designation/department/phone/employee-ID fields, table shows new columns; existing members (Raju/Suresh with face enrolment) render fine.
- Tested: legacy create/update payloads, new-field create, list response shape, UI screenshot. Test members cleaned.

## Update — Jun 2026: Sheet margins tightened + kiosk onboarding gap highlights
- Printable sheet: @page margin 7mm→4mm, side paddings removed (banner 3mm/4mm, meta/footer flush), cells grew (min-height 29→32mm, QR 15→17mm; compact 6-row mode 24→27mm/13→15mm). Verified full-bleed A4 landscape render.
- Factory Staff: amber banner "N staff can't log in to the QC kiosk yet" listing names when a member has neither face nor PIN; their row is amber-tinted with an "Onboarding pending" chip. Verified via screenshot (Suresh flagged, Raju with Face(7)+PIN not flagged).

## Update — Jun 2026: QR validation message + random photo inspections
- QR validation: rejection text everywhere is now exactly "This QR code is not valid for today's maintenance." (scan status, photo upload, submit); server-date (IST) validation blocks submissions on expired/future QRs (verified via API).
- Random photo inspections:
  - Equipment field photo_inspections_per_month (EquipmentIn + form input in Maintenance section, "random, not disclosed").
  - _ensure_photo_assignments: on sheet generation, randomly marks min(N, scheduled) slots photo_required (prefers future unsubmitted); idempotent per month. Sheet response NEVER includes photo_required (verified no leak).
  - Scan reveals photo_required only on the actual day; submit enforces ≥1 live camera photo (400 otherwise) — client also blocks with red "Photo inspection required today" banner + "(mandatory today)" label.
  - Missed photo-required day → check_missed_maintenance promotes a random future unsubmitted slot in the same month so the monthly quota stays intact.
  - Profile returns photo_inspection {per_month, assigned_this_month, done_this_month}; MaintenanceProfile shows "Photo Inspections x/y this month" card.
- Tested via API: 5 random slots assigned, no sheet leak, submit-without-photo 400, with-photo success, wrong-day message exact, future-token submit blocked, profile stats correct. Test data cleaned.

## Update — Jun 2026: Equipment Master page redesign (design_agent guidelines in /app/design_guidelines.json)
- KPI cards → interactive quick filters (Total/Overdue/Due 30d/Order Now): icon chips, hover lift, active ring per accent (slate/rose/amber/orange); click toggles quickFilter state applied before buildTree.
- Filter bar in white card: search with icon (h-10, rounded-lg), styled selects (#002FA7 focus ring), active-filters row with count, quick-filter pill (X to clear) + "Clear all filters".
- Table: roomy px-5/py-4 rows, semibold uppercase slate header, merged "Next Replacement / Lead" column (lead time + min stock as meta lines; standalone Lead/Min columns removed).
- Actions: 7×28px icons → h-9 emerald "Log" pill + h-9 Docs button with #002FA7 count badge + h-9 kebab DropdownMenu (Maintenance Profile & QR Sheet / Log Replacement / Edit / Delete with separator). All data-testids preserved (eq-log-maint-*, eq-docs-*, eq-maint-profile-*, eq-edit-*, eq-delete-*, new eq-more-actions-*).
- Verified via screenshots + interaction test: quick filter 3→0→3 rows, kebab menu items correct, layout clean.

## Update — Jun 2026: Equipment Excel template / export / bulk import
- Backend (equipment_master.py, router prefix /production/equipment):
  - GET /import-template → styled xlsx (Equipment sheet with 20 columns + example row; Reference sheet listing tenant equipment types, valid frequencies, Facility›Floor›Area combos, notes).
  - GET /export → all equipment in the same columns (re-importable round trip).
  - POST /import → parses xlsx: Name+Type required; types auto-created; frequency accepts labels (Daily/Weekly/Fortnightly/…) or day numbers; dates YYYY-MM-DD or Excel dates; facility/floor/area matched by exact name (row error otherwise); has_children Yes/No; _compute_dues applied; UPSERT by equipment name (re-import updates, never duplicates); 2-pass parent linking by name with cycle validation; per-row error report {row, error}.
  - Gotcha fixed: routes initially written as /equipment/... under an already-prefixed router → 405; corrected to /import-template etc.
- Frontend header buttons: Template / Export / Import (.xlsx input) + green Add Equipment; import result banner (emerald/amber) listing up to 8 row errors with dismiss.
- Tested full round trip via curl: template → fill (2 good rows incl parent link + 2 bad rows) → import (2 created, errors reported: missing name, unknown facility) → child linked to parent with computed dues → re-import = 2 updated 0 created → export re-readable with Daily/parent columns correct. UI buttons verified via screenshot. Test rows + auto-created type cleaned.

## Update — Jun 2026: Intuitive short codes in the equipment template
- _mk_code(): initials for multi-word names, first 4 letters for single words, dedupe with numeric suffix (e.g. Pumps→PUMP, Air Water Generators→AWG, Ground Floor→GF, 1st Floor→1F, Terrace→TERR, Finished Goods Area→FGA).
- _ensure_codes(): assigns + persists `code` on equipment_types, facilities, floors, areas (stable across downloads); runs on template download and import.
- Template Reference sheet reorganized: EQUIPMENT TYPE CODES table (Code|Name), FREQUENCIES, LOCATION CODES table (Facility Code|Facility|Floor Code|Floor|Area Codes as "FGA = Finished Goods Area"); example row uses codes; column headers say "(name or code)".
- Import resolves type/facility/floor/area by code OR full name (case-insensitive); auto-created types get codes too.
- Tested: template shows codes for real tenant data (Factorty→FACT etc.); import row with PUMP/TBF/GF/FGA resolved to full names; bad code XXX errored per-row. Test data cleaned.

## Update — Jun 2026: Frequency codes + on-screen codes + Compliance Dashboard
- Frequency codes in template Reference sheet + import parser: D, AD, W, E10, BW/FN, M, Q (or numeric days). Verified: import with D/Q → 1/90 days.
- Codes on screen: type code badges in Equipment Types tab and equipment table; facility/floor/area code badges in Facilities page (copy-friendly for template filling).
- Compliance Dashboard (3rd tab on Equipment Master, /equipment-master):
  - Backend GET /api/maintenance/compliance?month=YYYY-MM (maintenance_sheets.py): scores scheduled slots up to today (IST): completed / due; missed = past dates with no record; groups per equipment and per area (Facility › Floor › Area, "No location set" bucket). Returns {month, as_of, overall, equipment[], areas[] weakest-first}.
  - Frontend: month picker + Show Compliance btn (comp-month-input / comp-load-btn), overall + top-3 area KPI cards, weakest-first area bars, per-equipment table (Due/Done/Incomplete/Missed/Score) with color coding (≥85 green, ≥60 amber, else red).
  - Verified E2E: seeded daily equipment, generated sheet, QR-submitted today's slot → overall 17%, per-area 0%/33%, table correct in UI screenshot. Test data cleaned.

## Update — Jun 2026: Per-user saved view preferences in Volume Tracking
- GET/PUT /api/account-volume-grid/preferences (account_volume_grid.py): stores {hidden, widths, order} in db.volume_grid_user_prefs keyed by tenant_id+user_id (upsert).
- AccountVolumeGrid.js: fetches prefs on mount (overrides localStorage defaults), debounced (800ms) PUT on any change to hidden/widths/order; localStorage kept only as instant-paint cache. prefsLoaded ref guards against overwriting server prefs before load.
- Verified: curl save/read-back; UI toggle persisted after localStorage-cleared reload (cross-device simulation). Test prefs cleaned.

## Update — Jun 2026: First Order columns in Volume Tracking (from print requests)
- Grid GET (account_volume_grid.py): loads tenant print requests, maps earliest PR per account via account_id OR lead uuid OR lead code (accounts.lead_id may hold either) → row fields first_order_date (PR created_at) and first_order_requested_date (PR requested_due_date). Computed at read → existing PRs auto-covered, no backfill script.
- EMV: read-time fallback to earliest PR's starting_monthly_volume when account.expected_monthly_volume_crates is None (stays editable — edit writes account field which overrides). Plus create_print_request hook: sets account EMV from payload.starting_monthly_volume when account linked & EMV empty.
- Frontend: 2 new BASE_COLUMNS (first_order_date, first_order_requested_date, type date) after On-boarded Date. Excel export headers/values updated; totals indexes shifted 14,15,16→16,17,18 (+2 for custom offset 18→20). NOTE: export is branded — header row is row 5, not row 1.
- Verified: grid API + UI screenshot (Drive Folder Test Lead 06 Jun / 10 Jun), Excel export headers+values+EMV total.

## Update — Jun 2026: Order Aging Flag in Volume Tracking
- Backend row fields: first_order_overdue / first_order_overdue_days — set when first_order_requested_date has passed and account has NO delivery yet (clears automatically once first delivery lands).
- Frontend: First Order Requested Date cell turns red (bg-red-100, "Nd overdue · no delivery" subtext, testid vg-fo-overdue-*); included in Needs-attention pill filter + count.
- Verified: API (85d overdue for Drive Folder Test Lead) + UI screenshot with attention filter.

## Update — Jun 2026: PR-sourced columns rework in Volume Tracking
- Removed "First Order Date"; renamed field to print_request_created_date (PR created_at). Added first_order_qty_crates (PR initial_order_quantity/quantity).
- 4 PR-populated columns marked fromPR: print_request_created_date, first_order_requested_date, first_order_qty_crates, expected_monthly_volume_crates → distinct dark-teal header (#0F4C46, teal underline, tooltip "Populated from the print request").
- Excel export updated (headers + values; totals indexes 17,18,19; custom offset 21).
- Verified: API values (500 qty), UI screenshot (teal headers, old col gone), export headers + EMV total.

## Update — Jun 2026: Saved grid filters (per user) in Volume Tracking
- prefs endpoints now also persist filters {territory, state, city}; frontend restores them on mount and saves via same debounced PUT (deps include the 3 filter states).
- Verified: set Telangana → localStorage-cleared reload restored the filter (7 rows). Test filter prefs reset after.

## Update — Jun 2026: On-boarded Date header color
- BASE_COLUMNS onboarded_date flagged fromAccount → header bg #3B2E6E with violet (#8B5CF6) underline; th logic: fromPR teal > fromAccount purple > default navy. Verified via computed-style check + screenshot.

## Update — Jun 2026: First Delivery Date header color
- first_delivery_date flagged fromDelivery → header bg #7A3B10 (burnt orange) with amber (#F59E0B) underline. Verified via computed style + screenshot.

## Update — Jun 2026: "How this view works" help refreshed
- VolumeGridHelp.js updated: new PR-sourced columns documented, header colour legend (teal/purple/orange/navy), overdue first-order flag, saved per-user view & filters, Needs-attention now includes overdue orders. Verified via dialog screenshot.

## Update — Jun 2026: Approved design thumbnails + preview in Print Request detail
- PrintRequestDetail.js: approved files render as thumbnail cards (image blob fetched with auth → object URL; non-images show file icon). Click thumb → preview dialog (img, or iframe for PDF) with Download button; non-previewable files download directly. testids: print-file-preview-*, print-preview-dialog, print-preview-image, print-preview-download.
- BUG FIX: /api/marketing-requests/files/{id} now falls back to design_requests_new_files collection — approved design files from the new design module previously 404'd on download.
- Verified via seeded PNG on PR-2026-0004: thumbnail rendered, preview dialog opened, full image shown. Test data cleaned.

## Update — Jun 2026: 100% discount footer on promo Delivery Challan
- generate_delivery_challan_pdf (utils/pdf_generator.py): items table now ends with 3 summary rows — Total, "Discount — 100% (Promotional / Free of Charge)" (−total, emerald), and "Final Payable (Zero INR) ₹0.00" (green highlight). SPANs added for label rows.
- Verified via direct PDF generation + text extraction (Total ₹260 → −₹260 → ₹0.00).

## Update — Jun 2026: 100% discount on ZOHO delivery challan (promo stock-out)
- create_delivery_challan_for_promo_dispatch (services/zoho_service.py): each line item now carries "discount": "100%"; payload adds discount_type=item_level + is_discount_before_tax=true → Zoho challan total computes to ₹0. Notes banner mentions "100% discount applied · Final payable: ₹0 / Zero INR".
- NOTE: Zoho tenant tokens exist only in PRODUCTION (preview has no zoho_credentials), so live push could not be tested in preview — verified payload against Zoho Books deliverychallans API docs (line-level discount supported) + syntax check. User must redeploy and create a promo challan to confirm.

## Update — Jun 2026: Bottles→crates conversion for PR-sourced grid values
- PR quantities are in BOTTLES; volume grid shows CRATES. Constant PR_BOTTLES_PER_CRATE=12 (user-directed assumption: all bottles in 12-bottle crates).
- first_order_qty_crates = PR initial_order_quantity/12 (round 2); EMV fallback = starting_monthly_volume/12; create_print_request hook also writes EMV/12 to account.
- Stored/manual account EMV values untouched (still take precedence).
- Verified: 500 bottles → 41.67 crates; EMV fallback 600 → 50.0 (staged + restored test data).

## Update — Jun 2026: SKU field on Print Requests + real crate-size conversion
- PrintRequestCreate/Update: optional sku_id. _resolve_sku() (print_requests.py) → stores sku_id, sku_name, sku_bottles_per_crate (explicit bottles_per_crate else default production packaging units). Update supports set/clear ("").
- Volume grid conversion now uses PR's sku_bottles_per_crate when set, else 12 (PR_BOTTLES_PER_CRATE). EMV create-hook uses same bpc.
- UI: SKU select in CreatePrintRequestDialog.jsx (pr-sku-select) + PrintRequestDetail edit dialog (print-edit-sku) + "SKU (Bottle)" InfoRow (print-info-sku) showing name · N/crate.
- Verified: PATCH sku (330ml Silver, 24 bpc) → 500 bottles = 20.83 crates; cleared → 41.67 (12). Edit dialog dropdown lists 10 SKUs. Test changes reverted.

## Update — Jun 2026: Print Request Created By column (hidden by default)
- Grid row field print_request_created_by (PR created_by_name, live reference). BASE_COLUMNS entry fromPR (teal header); added to DEFAULT_HIDDEN; one-time migration added it to existing saved prefs' hidden arrays (so it stays hidden until users opt in).
- Excel export: header/value added after PR Created Date; totals indexes now {18,19,20}, custom offset 22.
- Verified: hidden by default, toggle from Columns menu shows teal header, value "Surya Yadavalli" in API. User's view restored to hidden after test.

## Update — Jun 2026: Self-heal for legacy raw-bottle EMV copies
- Root cause of user report ("EMV/first order qty in bottles on PRODUCTION"): prod build predates conversion; EMV was COPIED raw (bottles) to account by the pre-conversion hook.
- Fix: grid GET self-heals — if stored account EMV exactly equals first PR's raw starting_monthly_volume (>0), divide by pr_bpc once and persist. First-order qty needed no data fix (computed at read).
- Verified: staged EMV=1200 + PR smv=1200 → grid shows 100.0 and persists 100.0; idempotent. Test state restored. Prod fix requires REDEPLOY, then values heal on first grid load.

## Update — Jun 2026: User-configurable facility/floor/area codes
- Codes still auto-populate first (_ensure_codes); now editable: PUT /api/facilities/{fid}/code, .../floors/{flid}/code, .../floors/{flid}/areas/{aid}/code (CodeIn; normalized A-Z0-9 max 6; sibling-duplicate rejection; admin only). Area update uses arrayFilters.
- Facilities.js: CodeBadge component — click badge → inline input (Enter/blur saves, Esc cancels); amber "SET CODE" when missing. Applied to facility cards, floor rows, area chips. saveCode() helper.
- Equipment import/reference sheets automatically use edited codes (same stored field).
- Verified: API (normalize prew!→PREW, dup rejected, all 3 levels persist) + UI inline edit (GRFC saved w/ toast). Test values reverted (GR restored).

## Update — Jun 2026: Prominent editable code chips
- CodeBadge redesigned: blue-tinted bordered chip with pencil icon (text-sm; area chips text-xs), amber "SET CODE" when missing; bigger inline input (w-24, blue border). Area chips enlarged (py-1.5, text-sm) with bigger hover-red X delete button. Verified via screenshot.

## Update — Jun 2026: Editable equipment type codes
- PUT /api/production/equipment/types/{type_id}/code (TypeCodeIn; normalize A-Z0-9 max6; dup rejection). Added `import re` to equipment_master.py.
- EquipmentMaster.js: TypeCodeBadge (blue chip + pencil, inline input, amber SET CODE) on Equipment Types cards; saveTypeCode helper reloads via loadAll.
- Verified: API set TST9 + persist + revert AWG; UI 9 chips, inline input opens (screenshot).

## Update — Jun 2026: Weekly printable maintenance sheet (Mon→Sun)
- Backend sheet endpoint now takes ?week=YYYY-MM-DD (any date; normalized to Monday) — returns 7 days Mon→Sun with day_label/weekday_label; month param still supported (legacy). _scheduled_dates refactored to _scheduled_dates_range. Photo assignments ensured for both months a week may span. Slots/QRs unchanged (same tokens/validation).
- MaintenanceProfile.js: buildSheetHtml rewritten — A4 PORTRAIT, full-page table: col1 QR (27mm) + big date (34px day number, weekday, full date, "MAINTENANCE DUE" label), col2 Operator signature box, col3 Inspector signature box; ~31mm rows; alternating row tints; off days greyed "No scheduled maintenance". Week date picker (mp-week-input) + "Print Week Sheet" button.
- Verified: API week=2026-09-03 → Mon 31 Aug–Sun 6 Sep, QRs only on scheduled days; print popup DOM: 8 rows, 4 QRs, correct 3 headers, ~122px row height.

## Update — Jun 2026: Print Whole Month (all weekly sheets)
- MaintenanceProfile.js: buildSheetHtml refactored → weekPage(sheet) + buildSheetDoc(sheets,title) with .page{height:286mm;page-break-after:always}. New "Print Whole Month" button (mp-print-month-btn) fetches every Monday-anchored week overlapping the picked date's month (local-date fmt helper, NOT toISOString — TZ bug avoided) and opens one print window (one A4 page per week).
- Verified: Sept 2026 → 5 pages (31 Aug–06 Sep … 28 Sep–04 Oct), 32 QRs, correct title.
