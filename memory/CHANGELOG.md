# Changelog

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
