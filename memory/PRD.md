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
