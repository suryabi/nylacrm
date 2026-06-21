# Changelog


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
