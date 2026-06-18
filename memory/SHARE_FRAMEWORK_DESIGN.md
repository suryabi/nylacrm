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
