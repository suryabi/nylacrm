# Changelog

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
