# Nyla Sales CRM - Product Requirements Document

## Original Problem Statement
Build a comprehensive, mobile-ready Sales CRM application with multi-tenancy support.

## Current Session Updates (Mar 14, 2026)

### City-Based Lead Scoring Model (NEW)
- **Feature**: Lead Scoring Model is now city-specific
- **Admin Page Changes**:
  - City selector dropdown at top (from master locations)
  - "Copy to City" button to duplicate models
  - "Delete City Model" button for non-default models
  - "Configured cities" badges showing which cities have models
  - Fallback indicator when using default model
- **Lead Detail Page Changes**:
  - New `LeadScoringCard` component on right column
  - Shows "Using model for: X" indicator
  - 5 scoring categories with tier selection
  - "Score Lead" button to open scoring interface
- **Backend Changes**:
  - Scoring moved from Accounts to Leads
  - City-specific model lookup with default fallback
  - New endpoints: `/api/scoring/models/cities`, `/api/scoring/models/copy`, `/api/scoring/leads/{id}/score`
  - Legacy model migration (adds `city: default` to old models)

### Files Modified (City-Based Scoring)
- `/app/backend/routes/scoring.py` - Full rewrite for city-based lead scoring
- `/app/frontend/src/pages/LeadScoringModel.js` - Added city selector and copy functionality
- `/app/frontend/src/components/LeadScoringCard.js` - NEW component for lead detail
- `/app/frontend/src/pages/LeadDetail.js` - Added LeadScoringCard

### Proposed SKU Pricing Enhancement (Mar 14, 2026)
- **Feature**: Enhanced SKU Pricing section on Lead Detail page with revenue forecasting
- **Location**: Lead Detail page, left column, "Proposed SKU Pricing" card
- **New Columns Added**:
  - `% Dist.` - Percentage distribution for each SKU (total should = 100%)
  - `Est. Qty` - Auto-calculated (monthly bottles × percentage / 100)
  - `Revenue` - Auto-calculated (Est. Qty × Price/Unit)
- **Estimated Monthly Opportunity Display**:
  - Prominent green gradient card at top showing total revenue
  - Shows "Based on X bottles/month" from Opportunity Estimation
  - Shows "X% allocated" with warning if > 100%
- **Total Row**: Aggregates percentages, quantities, and revenue
- **Validation**: Warning shown when no Opportunity Estimation exists

### Files Modified (SKU Pricing Enhancement)
- `/app/frontend/src/pages/LeadDetail.js` - Added percentage field, calculation functions, enhanced table UI

---

## Previous Session Updates (Mar 13, 2026)

### Industry/Vertical Tags System
- **Tenant Industry Profiles** - Each tenant can be tagged with an industry type
- **Industry Types**: `water_brand` (Water/Beverage Brand) and `generic` (Standard CRM)
- **Industry-Specific Features** - Features are gated by industry type:
  - `water_brand`: lead_bottle_tracking, bottle_preview, cogs_calculator, sku_management, account_bottle_volume
  - `generic`: No industry-specific features (standard CRM)
- **Industry Configuration** - Customizable settings per industry (bottle_sizes, default_bottles_per_cover)
- **Super Admin Only** - Industry can only be set via Platform Admin
- **Frontend Helper** - `hasIndustryFeature('feature_key')` in TenantConfigContext

### Opportunity Estimation Module (NEW - Water Brand Industry)
- **Purpose**: Estimate potential bottle volume for a lead based on venue characteristics
- **Location**: Lead Detail page right column (only visible for `water_brand` industry)
- **Inputs**:
  - Total Covers (seating capacity)
  - Operating Pattern (Morning, Evening, Night, Snacks toggles with density %)
  - Dining Behavior (Avg Table Time, Water Adoption Rate, Operating Days)
- **Outputs**:
  - Mode-wise Estimation (bottles per time slot)
  - Daily Water Opportunity (total bottles/day)
  - Monthly Water Opportunity (total bottles/month)
- **Features**:
  - Compact card view with expand/collapse
  - Full modal view for detailed editing
  - Manual override option for known values
  - Auto-saves to lead with `opportunity_estimation` field

### Files Created/Modified (Opportunity Estimation)
- `/app/frontend/src/components/OpportunityEstimation.js` - NEW component
- `/app/backend/routes/leads.py` - Added opportunity estimation endpoints
- `/app/frontend/src/pages/LeadDetail.js` - Integrated OpportunityEstimation component

### Files Created/Modified (Industry System)
- `/app/backend/models/tenant.py` - Added INDUSTRY_TYPES, TenantIndustry, IndustryConfig models
- `/app/backend/routes/tenant_admin.py` - Added industry endpoints (list types, update industry, get current industry)
- `/app/frontend/src/context/TenantConfigContext.js` - Added industry state, hasIndustryFeature(), getIndustryConfig()
- `/app/frontend/src/pages/PlatformAdmin.js` - Added Industry tab for Super Admin

### Lead Scoring Model Admin Module (NEW)
- **Tenant-specific scoring model** - Each tenant can define their own scoring categories
- **5 default categories** seeded: Volume Potential (25pts), Margin Potential (20pts), Brand Prestige (20pts), Guest Influence (20pts), Sustainability Alignment (15pts)
- **Category & Tier Management** - Admin can create/edit/delete categories and scoring tiers
- **Weight validation** - Total weight must equal 100, tiers cannot exceed category weight
- **Account Scoring** - Score individual accounts by selecting tiers for each category
- **Portfolio Matrix** - 2x2 visualization (Stars, Showcase, Plough Horses, Puzzles) based on Volume vs Commercial Value
- **Account Score Card** - Integrated into Account Detail page for inline scoring

### Files Created/Modified
- `/app/backend/routes/scoring.py` - NEW Lead Scoring API endpoints
- `/app/backend/routes/__init__.py` - Registered scoring router
- `/app/frontend/src/pages/LeadScoringModel.js` - NEW Admin UI page
- `/app/frontend/src/components/AccountScoringCard.js` - NEW Account scoring component
- `/app/frontend/src/pages/AccountDetail.js` - Added AccountScoringCard
- `/app/frontend/src/layouts/DashboardLayout.js` - Added Lead Scoring Model navigation
- `/app/frontend/src/App.js` - Added route for /lead-scoring-model

---

## Previous Session Updates (Mar 12, 2026)

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

### Industry Profile (NEW)
- `GET /api/tenants/industry-types/list` - Get available industry types
- `PUT /api/tenants/{tenant_id}/industry?industry_type=...` - Set tenant industry (Super Admin)
- `PUT /api/tenants/{tenant_id}/industry-config` - Update industry config (Super Admin)
- `GET /api/tenants/current/industry` - Get current tenant's industry profile and features

### Opportunity Estimation (NEW - Water Brand)
- `PUT /api/leads/{lead_id}/opportunity-estimation` - Save opportunity estimation to lead
- `GET /api/leads/{lead_id}/opportunity-estimation` - Get opportunity estimation for a lead

### Lead Scoring (NEW)
- `GET /api/scoring/model` - Get tenant's scoring model
- `PUT /api/scoring/model` - Update model name/description
- `POST /api/scoring/categories` - Create category
- `PUT /api/scoring/categories/{id}` - Update category
- `DELETE /api/scoring/categories/{id}` - Delete category
- `POST /api/scoring/categories/{id}/tiers` - Add tier
- `PUT /api/scoring/categories/{id}/tiers/{tier_id}` - Update tier
- `DELETE /api/scoring/categories/{id}/tiers/{tier_id}` - Delete tier
- `POST /api/scoring/accounts/{id}/score` - Score an account
- `GET /api/scoring/accounts/{id}/score` - Get account score
- `GET /api/scoring/accounts/scores` - Get all scored accounts
- `GET /api/scoring/portfolio-matrix` - Get portfolio matrix data
- `POST /api/scoring/seed-default-model` - Seed default categories

### AI Assistant
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
- [x] Lead Scoring Model Admin Module ✅
- [x] SKU Pricing with Revenue Forecasting ✅
- [ ] Deploy to production

### P1 - High
- [ ] Cleanup temporary debug endpoints from server.py
- [ ] Run legacy roles/designations migration in production
- [ ] Verify branding applies correctly after deploy
- [ ] Test AI assistant in production

### P2 - Medium
- [ ] Refactor server.py into modular route files
- [ ] Add more data sources to AI assistant
- [ ] Build out placeholder modules (Maintenance, Inventory, Quality Control, Assets, Vendors)
- [ ] Upgrade AI Assistant to True RAG with vector database

---

## 3rd Party Integrations
- Gemini 3 Flash (AI Assistant) - Emergent LLM Key
- Claude Sonnet 4.5 (OCR) - Emergent LLM Key
- Zoom API, Resend, Google Places, Amazon MQ

---

## Database Schema Notes

### scoring_models Collection (NEW)
```json
{
  "id": "uuid",
  "tenant_id": "nyla-air-water",
  "name": "Default Scoring Model",
  "categories": [
    {
      "id": "uuid",
      "name": "Volume Potential",
      "weight": 25,
      "is_numeric": true,
      "tiers": [
        {"id": "uuid", "label": ">5000", "score": 25, "min_value": 5000}
      ]
    }
  ],
  "total_weight": 100,
  "is_active": true
}
```

### accounts Collection (Updated)
```json
{
  "scoring": {
    "total_score": 100,
    "quadrant": "Stars",
    "category_scores": {"cat_id": {"score": 25, "tier_id": "...", "tier_label": "..."}},
    "scored_at": "2026-03-13T...",
    "scored_by": "user_id"
  }
}
```
