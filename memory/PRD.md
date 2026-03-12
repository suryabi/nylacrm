# Nyla Sales CRM - Product Requirements Document

## Original Problem Statement
Build a comprehensive, mobile-ready Sales CRM application with multi-tenancy support.

## Current Session Updates (Mar 12, 2026)

### AI Chat Assistant (NEW)
- **RAG-based AI Assistant** using Gemini 3 Flash via Emergent LLM Key
- Floating chat bubble + dedicated page
- CEO/Director/System Admin only access
- Queries leads, accounts, team, activities, targets data
- Multi-turn conversation with session persistence

### Multi-Tenancy Fixes
- Domain mapping for production (`crm.nylaairwater.earth` → `nyla-air-water`)
- Fixed authentication to use global user lookup
- Legacy roles/designations migration endpoint created

### Files Created/Modified
- `/app/backend/routes/ai_assistant.py` - NEW AI chat endpoints
- `/app/frontend/src/components/AIChatBubble.js` - NEW floating bubble
- `/app/frontend/src/pages/AIAssistant.js` - NEW dedicated page
- `/app/backend/core/tenant.py` - Domain-to-tenant mapping
- `/app/backend/server.py` - Debug endpoints, auth fix
- `/app/frontend/src/layouts/DashboardLayout.js` - Added AI bubble
- `/app/frontend/src/App.js` - AI assistant route

---

## Core Architecture

### Backend Structure
```
/app/backend/
├── routes/
│   ├── ai_assistant.py      # NEW - RAG AI chat
│   ├── auth.py
│   ├── leads.py
│   ├── accounts.py
│   ├── roles.py
│   ├── designations.py
│   ├── tenant_admin.py
│   └── ...
├── core/
│   └── tenant.py            # Domain mapping added
└── server.py                # Debug endpoints
```

### Frontend Structure
```
/app/frontend/src/
├── components/
│   └── AIChatBubble.js      # NEW
├── pages/
│   └── AIAssistant.js       # NEW
└── layouts/
    └── DashboardLayout.js   # Modified
```

---

## API Endpoints

### AI Assistant (NEW)
- `POST /api/ai/chat` - Send message, get AI response
- `GET /api/ai/status` - Check access
- `GET /api/ai/chat/history` - Get history
- `DELETE /api/ai/chat/history` - Clear history

### Debug Endpoints
- `GET /api/debug/check-user/{email}`
- `POST /api/debug/fix-user-tenant`
- `GET /api/debug/migration-status`
- `POST /api/debug/migrate-all-data`
- `POST /api/debug/migrate-legacy-roles`
- `GET /api/debug/check-targets`
- `GET /api/debug/check-session`
- `GET /api/debug/check-tenant-branding/{tenant_id}`

---

## Test Credentials
- CEO: `surya.yadavalli@nylaairwater.earth` / `surya123`
- Director: `admin@nylaairwater.earth` / `admin123`

---

## Pending Tasks

### P0 - Critical
- [x] Pull code from GitHub ✅
- [x] Implement AI Chat Assistant ✅
- [ ] Deploy to production

### P1 - High
- [ ] Run legacy roles/designations migration in production
- [ ] Verify branding applies correctly after deploy
- [ ] Test AI assistant in production

### P2 - Medium
- [ ] Add more data sources to AI assistant
- [ ] Build out placeholder modules

---

## 3rd Party Integrations
- Gemini 3 Flash (AI Assistant) - Emergent LLM Key
- Claude Sonnet 4.5 (OCR) - Emergent LLM Key
- Zoom API, Resend, Google Places, Amazon MQ
