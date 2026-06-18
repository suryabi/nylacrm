# Document Sharing Framework — Design (Email + WhatsApp)

**Status:** DESIGN ONLY (not implemented). Goal: a reusable framework so ANY module
(invoices, delivery challans, driver bundles, Files & Documents, settlements, returns…)
can share a document to a contact via Email or WhatsApp using the same pipeline.
Adding sharing to a new screen should be a one-line frontend drop + one backend resolver.

---

## Core principle: separate "WHAT to share" from "HOW to share"

```
[Document Source Resolver]  →  [Share Service]  →  [Channel Adapters]
   (what + who)                 (orchestration)      (email / whatsapp)
```

---

## Layer 1 — Document Source Registry (the abstraction)

A registry where each document type registers a resolver. Given
`(document_type, document_id)` the resolver returns a normalized object:

| Field | Example |
|---|---|
| `fetch_fn` (lazy) / `pdf_bytes` | renders/returns the PDF |
| `filename` | `INV-00017.pdf` |
| `title` | "Invoice INV-00017" |
| `default_recipients` | account contact, delivery contact, distributor |
| `entity_context` | `{account_id, distributor_id, ...}` for recipient lookup + audit |

Resolvers just WRAP existing endpoints (the "fetch" half already exists):
- Invoice / Challan → `zoho-pdf`, `invoice-pdf`, `fetch_invoice_pdf`, `fetch_delivery_challan_pdf`
- Driver bundle → `bundle-pdf`
- Files & Documents → authenticated `/download`
- Settlements / Returns → existing PDF builders

Registry keys: `("invoice", id)`, `("driver_bundle", id)`, `("file", id)`, etc.

---

## Layer 2 — Signed Public Link service (critical for WhatsApp)

Email can attach a PDF; WhatsApp CANNOT attach an arbitrary private PDF — it needs a
public media URL. So introduce short-lived signed links (also helps email: smaller
payloads, click tracking, revocable).

- Create `share_links` record: `{token, document_type, document_id, tenant_id,
  expires_at, max_downloads, created_by}`.
- New PUBLIC endpoint `GET /api/share/d/{token}` → validate token+expiry → call resolver
  → stream PDF. The token IS the auth (no header). Tenant-scoped. Logs every open.
- Security: expiring (e.g. 7d), optional download cap, revocable, no internal IDs leaked,
  optional "shared copy" watermark.

This one endpoint is what BOTH channels point to.

---

## Layer 3 — Channel Adapters (uniform interface)

Common interface: `send(recipient, document, message, link)`.

- **Email** — viable TODAY via existing Resend setup (`RESEND_API_KEY`,
  `SENDER_EMAIL=noreply@nylaairwater.earth`). Sends PDF attachment and/or signed link
  with a template body.
- **WhatsApp** — needs a provider decision (the only new paid integration):
  - Meta WhatsApp Cloud API (official, cheapest, more setup)
  - Twilio WhatsApp (fastest to integrate)
  - Gupshup / AiSensy (India aggregators, template UI)
  - ⚠️ Business-initiated WhatsApp messages require PRE-APPROVED templates
    (e.g. "Hi {{name}}, here's your invoice {{number}}: {{link}}"). The doc is sent as a
    WhatsApp *document message* pointing to the signed link.

---

## Recipient resolution (shared helper)

`resolve_recipients(entity_context)` pulls candidates from existing collections and returns
`{name, email?, phone(E.164)?}`:
- `contacts` (incl. `category="Delivery"`), `leads`, `accounts`, `distributors`.
- Validates: WhatsApp needs clean `+91…`; email needs valid address. UI greys out a
  channel when the contact lacks the needed field.

---

## Unified API + Audit

```
POST /api/share
{ document_type, document_id, channel: "email"|"whatsapp",
  recipient: {name, email?, phone?}, message?, template_id? }
```
Flow: resolve doc → create signed link → render template → dispatch via adapter →
write `share_events` audit `{doc, channel, recipient, status, link_id, sent_by, sent_at,
provider_message_id}`. Provider webhooks later update delivered/read status.

---

## Frontend — one reusable component

`<ShareButton documentType=… documentId=… />` (opens `<ShareDialog>`), dropped next to
EVERY existing Download button (invoice rows, driver schedule header, Files & Documents
cards…). Dialog: channel toggle, recipient picker (prefilled from resolver + free entry),
editable message from templates, Send. Driven purely by `(documentType, documentId)` →
adding sharing to a new screen = one-line drop. Ties into the planned reusable Email
Templates feature (templates = the message bodies).

---

## Rollout phases

1. **Phase 1** — Signed-link service + `share_events` audit + Email (Resend, already
   configured) + `<ShareButton>` on invoices & driver bundles. Ships value with ZERO new
   paid integration.
2. **Phase 2** — WhatsApp provider integration (after provider chosen) + template approval.
3. **Phase 3** — Files & Documents, settlements, returns; delivery/read receipts via
   webhooks; "shared with" history per entity.

---

## OPEN DECISION (needed before Phase 2)
Which WhatsApp provider: Meta Cloud API / Twilio / Gupshup-AiSensy?
(Phase 1 email sharing can proceed independently of this.)


---

# ADDENDUM — Context-aware Recipient Resolution (To / CC, per module)

## The problem
Different modules need different recipients, pre-filled from the *applicable*
source, with the user able to add/remove, and some defaults (e.g. manager on CC)
applied automatically:
- Lead proposal → **To** = lead's contacts; **CC** = the user's manager (+ the user).
- Delivery schedule bundle → **To** = distributor contacts + the route's delivery people.
- Invoice → **To** = account/customer contact; **CC** = sales owner / accounts.

## Core abstraction: a RecipientResolver per document_type → a RecipientPlan
Split "who" from "what". Alongside the PDF resolver, register a **recipient
resolver** keyed by document_type. It receives `(tenant_id, document_id,
context, current_user)` (current_user is needed for manager-CC + sender) and
returns a structured **RecipientPlan**:

```
RecipientPlan = {
  "to":  [ Recipient ],          # pre-filled To (editable)
  "cc":  [ Recipient ],          # pre-filled CC (editable) — e.g. manager
  "candidates": [ Recipient ],   # the SELECTABLE pool for this document
                                  # (grouped by `source`) the user can pick from
  "policy": {
     "allow_manual_add": true,   # user may type a new address
     "allow_remove": true,       # user may remove a pre-filled entry
     "min_to": 1,                # validation
     "locked": ["accounts@nyla…"]# entries that cannot be removed (rare)
  }
}
Recipient = { name, email, phone, source, role }
   # source: "lead_contact" | "manager" | "distributor" | "delivery_person" | "manual" | "configured"
```

The existing Phase-1 `suggested_recipients` is just the degenerate case
(`candidates` only, no To/CC split) — this is a backward-compatible upgrade.

## Composable Recipient Providers (the reusable building blocks)
Small async helpers, each returning `[Recipient]`. Per-module resolvers just
COMPOSE these — no duplicated query logic:
- `lead_contacts(tenant, lead_id)`            → from the lead's linked contacts
- `account_contacts(tenant, account_id)`      → account + delivery contact
- `distributor_contacts(tenant, distributor_id)` → primary/secondary
- `delivery_people(tenant, schedule_id)`      → driver(s) + each stop's delivery contact
- `reporting_manager(current_user)`           → user.reports_to → manager
- `self_recipient(current_user)`              → the sender (common CC)
- `configured_recipients(tenant, document_type)` → tenant-admin defaults (see below)

Example resolver (lead proposal):
```
to  = await lead_contacts(t, lead_id)
cc  = [reporting_manager(user), self_recipient(user)]
candidates = to + account_contacts(...) + configured_recipients(t, "lead_proposal")
```
Example resolver (delivery bundle):
```
to  = distributor_contacts(...) + delivery_people(...)
cc  = configured_recipients(t, "driver_bundle")   # e.g. ops@…
```

## Pre-configured defaults (the "per-configured" requirement)
A tenant-admin screen + collection `share_recipient_policies`
`{ tenant_id, document_type, default_to[], default_cc[], cc_manager: bool,
   locked[] }`. The resolver MERGES configured defaults with the dynamic
sources. This is what lets admins say "always CC accounts@…​ on every invoice"
or "CC the manager on every proposal" without code changes. A global default
(e.g. `cc_manager = true`) can apply unless a module overrides it.

## Editability & validation rules (enforced by policy, not per-screen)
- Pre-filled To/CC chips show a remove (×) unless in `policy.locked`.
- "Add" = free-type (if `allow_manual_add`) OR pick from the `candidates`
  dropdown (grouped by source: "Lead contacts", "Distributor", "Delivery").
- Validate `min_to`, valid email format, and **dedupe** across To+CC.

## Channel-awareness (forward-compatible with WhatsApp)
The same RecipientPlan serves both channels: email uses `to`/`cc` (needs
`email`); WhatsApp ignores CC and uses `phone`. Each Recipient already carries
both, so the dialog greys out entries lacking the field required by the chosen
channel. No second data model.

## Frontend (one dialog, driven by the plan)
`ShareDialog` fetches the RecipientPlan from `GET /api/share/recipients`
(extended to return `{to, cc, candidates, policy}`), and renders:
- **To** chips (removable) + add-from-candidates dropdown + manual input.
- **CC** chips (removable) + add (manager pre-added when `cc_manager`).
- Validation from `policy`. The send payload becomes
  `{ to:[…], cc:[…], … }` instead of a single recipient.
`POST /api/share` accepts `to[]`/`cc[]`, logs them on the `share_events` audit.

## Unifying the existing proposal email
The current `POST /leads/{id}/proposal/share-email` (manual To + manager-CC
logic hand-rolled in server.py) becomes a registered `lead_proposal`
document_type. Its recipient resolver encodes exactly today's behavior
(To = chosen contacts, CC = user + manager) — so the bespoke endpoint is
replaced by the generic framework with zero behavior change.

## Net effect
Adding a new shareable doc still = register a PDF resolver + a recipient
resolver (a few `compose(...)` lines) + drop `<ShareButton>`. All To/CC,
manager-CC, configurable defaults, add/remove and validation behavior is shared.
