# Changelog

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
