# Nyla Sales CRM - Product Requirements Document

## Original Problem Statement
Build a comprehensive, mobile-ready Sales CRM application with:
- Lead management and team hierarchy
- Activity tracking and dashboards
- Daily status updates and sales target planning
- COGS calculator and proposal generator
- Lead discovery and Google Workspace authentication
- **Account management from converted leads**
- **Multi-tenant support for multiple customer deployments**

## User Personas
- **National Sales Head**: Full access to all features, territories, and reports
- **Regional Sales Manager / Partner - Sales**: Regional access and team management
- **Sales Representative**: Individual lead and activity management
- **Super Admin**: Platform-wide tenant management
- **Tenant Admin**: Tenant-specific configuration and branding

## Core Requirements
1. Lead Management (CRUD operations, status tracking, activity logging)
2. Team Hierarchy (reporting structure, territory-based access)
3. Dashboard & Reports (Sales Overview, Revenue Report, Target Reports, Performance Reports)
4. Activity Tracking (calls, meetings, notes, follow-ups)
5. Sales Targets (territory and SKU based planning)
6. COGS Calculator
7. Proposal Generator with customizable templates
8. **Account Management (convert leads to accounts, SKU pricing, invoices)**
9. **Multi-Tenancy (data isolation, per-tenant branding, module configuration)**

---

## What's Been Implemented

### Mar 11, 2026 (Session 26) - CURRENT

- **BUG FIX COMPLETE**: Role Management ObjectId Serialization (P0)
  - **Issue**: `POST /api/roles` returned 500 Internal Server Error due to MongoDB `ObjectId` not being JSON serializable
  - **Root Cause**: After `insert_one()`, MongoDB adds `_id` (ObjectId) to the document, which was returned directly
  - **Fix Location**: `/app/backend/routes/roles.py` line 115-118
  - **Fix Code**: Added `role_doc.pop('_id', None)` after insert_one to remove MongoDB's ObjectId before returning
  - **Testing Results**: 100% (12/12 backend tests, all frontend tests passed)
  - **All CRUD Operations Working**:
    - `GET /api/roles` - List roles for tenant
    - `POST /api/roles` - Create custom role (FIXED)
    - `PUT /api/roles/{role_id}` - Update role permissions
    - `DELETE /api/roles/{role_id}` - Delete custom roles (system roles protected)
    - `POST /api/roles/{role_id}/set-default` - Set default role for new users
  - **Frontend Role Management UI**: Fully functional at `/tenant-settings` > Roles tab
    - Create/Edit/Delete custom roles
    - Expandable permission matrix by category (Core, Reports, Operations, etc.)
    - View/Create/Edit/Delete permission checkboxes
    - System role protection (lock icon, cannot delete)
    - Default role badge
  - Status: **COMPLETE**

### Mar 11, 2026 (Session 25)

- **FEATURE COMPLETE**: Module Enable/Disable Enforcement (Phase 2.5)
  - TenantConfigContext with `isModuleEnabled()` and route protection
  - Sidebar conditionally renders navigation based on module config
  - ProtectedRoute blocks access to disabled modules with "Module Not Available" message
  - Testing Results: 100% (16/16 tests passed)
  - Status: **COMPLETE**

- **FEATURE COMPLETE**: Apply Tenant Branding (Phase 2.6)
  - Dynamic CSS variables (--primary, --accent, --ring) from tenant branding
  - Sidebar displays custom app name, tagline, logo
  - Immediate theme updates after saving branding
  - Testing Results: 100% (21/21 tests passed)
  - Status: **COMPLETE**

- **FEATURE COMPLETE**: SaaS Multi-Tenant Registration & Google Workspace SSO (Phase 3.0)
  - Self-service tenant registration (`/register`)
  - Real-time subdomain availability check
  - Google Workspace SSO per tenant (enable/disable, domain restriction)
  - Login page shows tenant branding and appropriate auth options
  - Backend auto-provisions users from Google Workspace
  - Testing Results: Backend 95%, Frontend 100%
  - Status: **COMPLETE**

- **FEATURE COMPLETE**: Platform Admin Dashboard (Phase 3.1)
  - **Access Control** (`PLATFORM_ADMIN_EMAILS`):
    - `surya.yadavalli@gmail.com`, `surya.yadavalli@nylaairwater.earth`
    - `require_platform_admin` dependency for route protection
  - **Backend APIs** (`/app/backend/routes/platform_admin.py`):
    - `GET /api/platform-admin/stats` - Platform-wide statistics
    - `GET /api/platform-admin/tenants` - List all tenants with search/filter
    - `GET /api/platform-admin/tenants/{id}` - Full tenant details with stats
    - `PUT /api/platform-admin/tenants/{id}` - Update any tenant config
    - `POST /api/platform-admin/tenants/{id}/toggle-status` - Enable/disable
    - `POST /api/platform-admin/tenants/{id}/extend-trial` - Extend trial
    - `POST /api/platform-admin/tenants/{id}/upgrade` - Change subscription
    - `DELETE /api/platform-admin/tenants/{id}` - Delete tenant and all data
  - **Frontend UI** (`/app/frontend/src/pages/PlatformAdmin.js`):
    - Stats cards: Total Tenants, Active, On Trial, Total Users
    - Workspace list with search and status filter
    - Tenant details panel with tabs: Overview, Branding, Modules, SSO, Danger Zone
    - Quick actions: Disable/Enable, +14 Days trial extension
  - **Sidebar Integration**:
    - "Platform Admin" link (with Crown icon) only visible to platform admins
    - Uses `isPlatformAdminOnly` flag in navigation items
  - **Testing Results**: 100% (15/15 backend, all frontend)
  - Status: **COMPLETE**

### Mar 11, 2026 (Session 24)

- **CRITICAL COMPLETE**: Multi-Tenant Query Refactoring (Phase 1.5)
  - **TenantDB Wrapper** (`/app/backend/core/tenant.py`):
    - TenantCollection class automatically adds tenant_id to ALL queries
    - Supports: find, find_one, count_documents, insert_one, insert_many, update_one, update_many, delete_one, delete_many, distinct, aggregate
    - GLOBAL_COLLECTIONS excluded from filtering: tenants, user_sessions, master_skus, master_territories, master_states, master_cities, lead_statuses, business_categories, document_categories, document_subcategories
  - **Database Helper** (`/app/backend/database.py`):
    - `get_tenant_db()` function returns tenant-aware TenantDB instance
    - Raw `db` still available for global collections
  - **All Route Files Updated**:
    - `/app/backend/routes/leads.py` - get_tdb() for all queries
    - `/app/backend/routes/accounts.py` - get_tdb() for all queries
    - `/app/backend/routes/users.py` - get_tdb() for all queries
    - `/app/backend/routes/auth.py` - get_tdb() for user lookup
    - `/app/backend/routes/tasks.py` - get_tdb() for all queries
    - `/app/backend/routes/meetings.py` - get_tdb() for all queries
    - `/app/backend/routes/contacts.py` - get_tdb() for all queries
    - `/app/backend/routes/expense_master.py` - get_tdb() for all queries
    - `/app/backend/routes/requests.py` - get_tdb() for all queries
  - **Server.py Updated** (`/app/backend/server.py`):
    - All 466 database calls audited
    - Tenant-specific collections use get_tdb(): leads, accounts, users, activities, invoices, tasks, meetings, follow_ups, comments, lead_proposals, lead_activities, daily_status, documents, account_contracts, travel_requests, leave_requests, budget_requests, expense_requests, resource_targets, target_allocations, contacts, contact_categories, expense_categories, expense_types, cogs_data
    - Global collections use raw db: master_skus, master_cities, master_territories, master_states, lead_statuses, business_categories, document_categories, document_subcategories, user_sessions, user_activity
  - **Testing Results**: 100% (16/16 tests passed)
    - Login works for both tenants
    - Cross-tenant login blocked (401)
    - Data isolation verified:
      - nyla-air-water: 68 leads, 23 users, 6 accounts, 29 tasks
      - acme-corp: 0 leads, 1 user, 0 accounts, 0 tasks
    - Cross-tenant resource access returns 404
  - Status: **COMPLETE**

- **FEATURE COMPLETE**: Tenant Admin Dashboard (Phase 2)
  - **New Page** (`/app/frontend/src/pages/TenantSettings.js`):
    - Three-tab interface: Branding, Modules, Settings
    - **Branding Tab**:
      - Logo upload (base64, max 2MB)
      - Application name and tagline
      - Color pickers for primary (#000000), accent (#ffffff), secondary colors
      - Live preview of branding
    - **Modules Tab**:
      - Toggle switches for all modules (Core, Sales Operations, Requests, Production)
      - Module enable/disable requires Super Admin for some modules
    - **Settings Tab**:
      - Timezone selection
      - Currency format (INR, USD, EUR, etc.)
      - Date format preferences
      - Fiscal year start configuration
  - **Backend Updates**:
    - `PUT /api/tenants/current/branding` - Update branding
    - `PUT /api/tenants/current/settings` - Update settings
    - `PUT /api/tenants/current/config` - Update full config (modules require Super Admin)
  - **Frontend Updates**:
    - Added axios interceptor for automatic X-Tenant-ID header
    - New route `/tenant-settings` in App.js
    - New "Admin" section in sidebar with "Tenant Settings" link
    - Access restricted to CEO, Director, System Admin roles
  - **Default Color Scheme**: Black (#000000) / White (#ffffff)
  - Status: **COMPLETE**

### Mar 11, 2026 (Session 23)

- **FOUNDATION COMPLETE**: Multi-Tenant Support (Phase 1)
  - **Tenant Model** (`/app/backend/models/tenant.py`):
    - Tenant entity with: id, tenant_id (subdomain), name, domain
    - TenantBranding: logo, colors, app_name, favicon
    - TenantModules: Enable/disable features per tenant
    - TenantIntegrations: Per-tenant integration settings
    - TenantSettings: Timezone, currency, date format
  - **Tenant Context** (`/app/backend/core/tenant.py`):
    - Middleware to extract tenant from subdomain or X-Tenant-ID header
    - Context variables for current tenant
    - Helper functions: `add_tenant_filter()`, `with_tenant_id()`
  - **Tenant Admin API** (`/app/backend/routes/tenant_admin.py`):
    - Super Admin: List/Create/Update/Delete tenants
    - Tenant Admin: Update branding/settings for own tenant
    - GET `/api/tenants` - List all tenants (super admin)
    - POST `/api/tenants` - Create tenant (super admin)
    - GET `/api/tenants/current/config` - Get current tenant config
    - PUT `/api/tenants/current/branding` - Update branding
  - **Data Migration** (`/app/backend/migrations/add_tenant_id.py`):
    - Added `tenant_id` field to all 560 existing documents
    - Created indexes on tenant_id for all collections
    - Default tenant: `nyla-air-water`
  - **Collections Migrated**: users, leads, accounts, contacts, activities, tasks, meetings, comments, expense_categories, expense_types, invoices, travel_requests, budget_requests, target_plans, lead_statuses, business_categories
  - Status: COMPLETE

### Mar 8, 2026 (Session 22)

- **MODULE COMPLETE**: Master Contact Categories & Contacts
  - **Purpose**: Manage business contacts (Vendors, Partners, Distributors, Hoteliers, Event Managers) with visiting card OCR
  - **Routes**: `/master-contact-categories` and `/contacts`
  - **Navigation**: Added to sidebar under "Organization" section
  - **Master Contact Categories** (`/app/backend/routes/contacts.py`, `/app/frontend/src/pages/MasterContactCategories.js`):
    - 5 default categories with icons and colors: Vendors, Partners, Distributors, Hoteliers, Event Managers
    - Full CRUD: Create, Read, Update, Delete categories
    - Stats dashboard: Total, Active, Inactive, Default counts
    - Admin-only access for modifications
  - **Contacts Module** (`/app/frontend/src/pages/ContactsList.js`):
    - **Add Contact** with two entry methods:
      1. **Scan Card Tab**: Upload front/back of visiting card, AI extracts info using Claude Sonnet 4.5
      2. **Manual Entry Tab**: Form for Name, Company, Designation, Phone, Email, Address, City, State, Country, Notes
    - **Filters**: Category, Company, City dropdowns + free-form search (debounced)
    - **Contact Cards**: Grid display with avatar, name, designation, company, phone, email, city, category badge
    - **View Contact Dialog**: Full details with clickable phone/email links, card images if uploaded
    - **Pagination**: 12 contacts per page
  - **Backend APIs** (`GET/POST/PUT/DELETE /api/contacts/*`):
    - `/api/contacts/categories` - CRUD for categories
    - `/api/contacts` - CRUD for contacts with pagination and filters
    - `/api/contacts/filter-options` - Dynamic filter dropdown values
    - `/api/contacts/extract-card` - Claude Vision OCR for visiting cards
  - **Testing**: 100% success rate (23/23 backend, all frontend flows verified)
  - Status: COMPLETE

- **FEATURE COMPLETE**: Company Documents Page
  - **Purpose**: Centralized access to company policies, guidelines, and documents for all employees
  - **Route**: `/company-documents`
  - **Navigation**: Added to sidebar under "Documents" section with FileText icon
  - **Tabs Implemented**:
    1. **Overview**: Grid of 8 document categories (4 available, 4 coming soon)
    2. **Travel Policy**: Dynamic role-based expense limits from Expense Category Master
       - Shows user's role at top
       - Displays policy guidelines per category
       - Table: Expense Type, Your Limit, Receipt Required, Justification, Status
       - Supports Travel, Accommodation, Meals & Entertainment categories
       - CEO gets 5x limits (₹75,000 Domestic Flight), Partner gets 1.2x (₹18,000)
    3. **Leave Policy**: Casual (12d), Sick (12d), Earned (18d), Public Holidays (12d)
       - Special Leaves: Maternity (26wk), Paternity (5d), Bereavement (5d), Marriage (5d)
    4. **Incentive Policy**: Monthly targets, quarterly bonuses, annual awards
    5. **Payslips**: Salary structure info (earnings/deductions breakdown)
  - **Coming Soon Placeholders**: HR Policies, Compliance Documents, Employee Handbook, Org Structure
  - **New API**: `GET /api/expense-master/policy?role={role}` - Returns role-specific limits
  - **Testing**: 100% success rate (18/18 backend, all frontend flows verified)
  - Status: COMPLETE

- **MODULE COMPLETE**: Expense Category Master
  - **Purpose**: Centralized management of expense policies, categories, types, and role-based limits for expense claims
  - **Backend Implementation** (`/app/backend/routes/expense_master.py`):
    - Full CRUD for expense categories: POST, GET, PUT, DELETE at `/api/expense-master/categories`
    - Full CRUD for expense types: POST, GET, PUT, DELETE at `/api/expense-master/types`
    - Role-based limits configuration for each expense type
    - Policy guidelines support at category and type level
    - Default data initialization with 8 categories and ~30 expense types
    - Role limits auto-populated with multipliers (CEO 5x, Director 3x, etc.)
    - Authorization: CEO, Director, System Admin only for write operations
  - **Frontend Implementation** (`/app/frontend/src/pages/ExpenseCategoryMaster.js`):
    - Stats dashboard: Categories, Expense Types, Roles Configured, Active Categories
    - Accordion layout for categories with icons and color coding
    - Expense types table with: Default Limit, Receipt Required, Justification, Status, Role Limits
    - Policy Guidelines display when category expanded
    - Add/Edit Category dialog with icon and color picker
    - Add/Edit Expense Type dialog with tabbed interface (Details, Role Limits)
    - Role Limits sheet for per-role configuration (max limit, approval threshold, allowed/disallowed)
  - **Default Categories** (8 total):
    - Travel (8 types: Domestic/International Flight, Train, Bus, Taxi, Car Rental, Fuel, Parking)
    - Accommodation (4 types: Hotel Metro/Tier 2/Other, Service Apartment)
    - Meals & Entertainment (3 types: Daily Meals, Client Entertainment, Team Meals)
    - Communication (3 types: Mobile, Internet, International Roaming)
    - Office Supplies (3 types: Stationery, Printing, Computer Accessories)
    - Training & Development (4 types: Online Courses, Certifications, Conference, Books)
    - Client Gifting (3 types: Festival Gifts, Corporate Gifts, Promotional Items)
    - Miscellaneous (3 types: Visa/Passport, Medical, Other Business)
  - **Navigation**: Added to sidebar under Organization section as "Expense Categories"
  - **Route**: `/expense-category-master`
  - **Testing**: 100% success rate (22/22 backend, all UI flows verified)
  - **Bug Fixed**: MongoDB ObjectId serialization in POST responses
  - Status: COMPLETE

### Mar 8, 2026 (Session 21)

- **FEATURE COMPLETE**: Advanced Breadcrumb and Navigation System
  - **Purpose**: Track user's actual navigation path and create dynamic breadcrumbs that preserve context
  - **Implementation**:
    - Created `NavigationContext.js` - Global navigation state management with:
      - `trail` state: Tracks navigation path as array of { path, label, search }
      - `filterStates`: Persists filter values for each page in sessionStorage
      - `navigateTo()`: Custom navigation function replacing react-router's navigate
      - `updateCurrentLabel()`: Updates current page label (for dynamic names like lead/account name)
      - `getBreadcrumbs()`: Returns formatted breadcrumb items for display
      - `saveFilters()`: Saves current page's filter state before navigating away
    - Created `AppBreadcrumb.js` component with:
      - Dynamic trail display showing actual navigation path
      - Click handlers for navigating back through trail
      - Proper hiding on login/splash pages
      - Home icon always present as first item
    - **Trail Management Rules**:
      - Sidebar navigation: Resets trail to just destination page
      - In-app navigation (clicking rows): Appends to trail
      - Back navigation: Truncates trail to clicked breadcrumb
  - **Pages Integrated**:
    - Dashboard.js: Uses `navigateTo` for status card clicks
    - LeadsList.js: Uses `navigateTo` and `saveFilters` for lead row clicks
    - LeadDetail.js: Uses `updateCurrentLabel` for dynamic lead name
    - AccountsList.js: Uses `navigateTo` and `saveFilters` for account row clicks  
    - AccountDetail.js: Uses `updateCurrentLabel` for dynamic account name
    - LeadsKanban.js: Uses `navigateTo` for card clicks
    - AddEditLead.js: Uses `navigateTo` for form submissions and cancel
  - **Testing Results**: 100% success rate (9/9 tests passed)
    - Dashboard: Home > Sales Overview
    - Leads list: Home > Leads
    - Lead detail: Home > Leads > [Lead Name]
    - Kanban view: Home > Kanban View
    - Accounts list: Home > Accounts
    - Account detail: Home > Accounts > [Account Name]
    - Breadcrumb navigation verified working
    - Sidebar reset verified working
  - Status: COMPLETE

### Mar 7, 2026 (Session 20)

- **BUG FIX**: Hierarchical Daily Status View - Subordinates API 401 Error
  - **Issue**: The `GET /api/users/subordinates/all` endpoint was returning 401 Unauthorized for authenticated users
  - **Root Cause**: Database collection name mismatch in `deps.py`:
    - Login endpoint stored sessions in `db.user_sessions` collection
    - Authentication dependency (`get_current_user_from_cookie_or_header`) was looking for sessions in `db.sessions` collection
  - **Fix Applied**: Changed `deps.py` to use `db.user_sessions` on lines 38, 58, and 93
  - **Files Modified**: `/app/backend/deps.py`
  - **Testing**: 100% success rate - 11/11 backend tests, all frontend flows verified
  - Status: VERIFIED

- **FEATURE COMPLETE**: Hierarchical Daily Status View for Managers
  - **Purpose**: Allow managers to view daily status reports of their subordinates (direct and indirect reports)
  - **Implementation**:
    - Dropdown selector "View Status For" on Daily Status page
    - Lists "Myself" and all subordinates sorted alphabetically
    - Shows user's role next to their name in dropdown
    - Read-only mode when viewing subordinate's status
    - Form fields disabled with indicator message
    - Dropdown only visible for users with subordinates
  - **Files**: 
    - `/app/backend/routes/users.py` - `get_all_subordinates` endpoint (line 166)
    - `/app/frontend/src/pages/DailyStatusUpdate.js` - Dropdown UI (line 575)
  - Status: VERIFIED

### Mar 5, 2026 (Session 19 - Continued)

- **REFACTORING**: Backend server.py Modularization (Phase 1)
  - **Purpose**: Break down the 11,000+ line monolithic server.py into maintainable, domain-specific routers
  - **New Router Files Created** (in `/app/backend/routes/`):
    | Router | Lines | Endpoints |
    |--------|-------|-----------|
    | auth.py | 256 | Login, Register, OAuth, Sessions |
    | leads.py | 630 | Lead CRUD, Activities, Comments, Proposals |
    | accounts.py | 350 | Account CRUD, Invoices, Logo upload |
    | targets.py | 415 | Target Planning V2, Allocations, Dashboard |
    | tasks.py | 155 | Tasks CRUD |
    | meetings.py | 245 | Meetings with Zoom integration |
    | users.py | 215 | User management, Org chart |
    | requests.py | 560 | Leave, Travel, Budget, Expense requests |
    | **Total** | **~3,500** | Lines of modular code |
  - **Technical Implementation**:
    - Created `routes/__init__.py` as aggregator that combines all domain routers
    - Updated `server.py` to include `routes_router` via `api_router.include_router(routes_router)`
    - Each router is self-contained with its own Pydantic models and endpoint definitions
    - Routers use shared dependencies from `database.py`, `deps.py`, and `config.py`
  - **Benefits**:
    - Easier to maintain and test individual domains
    - Clear separation of concerns
    - Faster onboarding for new developers
    - Reduced merge conflicts
  - **Remaining in server.py**:
    - Dashboard & Analytics, Daily Status, COGS, Documents, Reports, Discovery, Transport, Weather, Admin
  - **Documentation**: Updated `/app/backend/ARCHITECTURE.md` with full structure and migration plan
  - **Testing**: All API endpoints verified working (auth, leads, accounts, targets, tasks, users, requests)
  - Status: PHASE 1 COMPLETE

### Mar 5, 2026 (Session 19)

- **UI REDESIGN**: Target Plan Dashboard by Goal Type
  - **Purpose**: Simplify and focus the dashboard based on the specific target goal type
  - **Changes for "Monthly Run Rate" plans:**
    - Removed "Estimated Revenue" and "Actual Revenue" widgets completely
    - Monthly Performance table now shows only **current and past months** (future months hidden)
    - Removed columns: "Expected Run Rate", "vs Expected", "Collections", "Collection %"
    - Renamed column: "Monthly Revenue" → "Revenue Added"
    - Added new column: "% of Target Run Rate Achieved" (cumulative calculation)
    - Footer shows "Total Revenue (Run Rate)" with cumulative percentage vs target
    - Info box explains: "Build up monthly recurring revenue to reach ₹X/month by the end of the period"
  - **Changes for "Cumulative Target" plans:**
    - Removed the entire "Monthly Performance" table
    - Removed "Actual Revenue" widget
    - Renamed widget: "Estimated Revenue" → "Revenue from Won leads this month"
  - **Both plan types retain:**
    - Timeline Progress bar with milestones
    - Territory Allocations section
  - **Header updates:**
    - Shows "Monthly Run Rate" or "Cumulative Target" badge
    - Label changes: "Target Run Rate" vs "Total Target" based on goal type
  - **Files Modified:**
    - `/app/frontend/src/pages/TargetPlanDashboard.js` - Complete conditional rendering based on goal_type
  - **Testing**: 100% success rate (18/18 frontend checks passed)
  - Status: VERIFIED

### Mar 5, 2026 (Session 18)

- **NEW FEATURE**: Complete Hierarchical Target Allocation System
  - **Purpose**: Enable managers to distribute revenue targets from Plan → Territory → City → Resource levels
  - **Implementation**:
    - **Territory Level**: Allocate % or fixed amount of total plan target to territories (e.g., South India ₹48L)
    - **City Level**: Drill down into territory, allocate to cities within (e.g., Bengaluru ₹20L)
    - **Resource Level**: Drill down into city, allocate to individual sales resources
  - **Features**:
    - **Breadcrumb Navigation**: "All Territories > South India > Bengaluru" with click-to-navigate
    - **Allocation Cards**: Show amount, progress bar, allocated vs remaining, rank badges (#1, #2, #3 with medals)
    - **Dynamic Budget Display**: Territory/City Budget and Available to Allocate shown at each level
    - **Add Allocation Dialog**: Percentage or Amount toggle with real-time calculation
    - **Cascade Delete**: Deleting parent allocation removes all child allocations
    - **Resources by Location API**: `/api/target-planning/resources/by-location?city=Bengaluru`
  - **Backend APIs Added**:
    - `GET /api/target-planning/{plan_id}/allocations/{allocation_id}/children` - Get child allocations
    - `GET /api/target-planning/resources/by-location` - Get sales resources filtered by city/territory
    - Enhanced `POST /api/target-planning/{plan_id}/allocations` with `level`, `parent_allocation_id`, `state` fields
  - **DB Schema Updates**:
    - `target_allocations_v2` collection now includes: `level` ('territory'/'city'/'resource'), `parent_allocation_id`, `state`
  - **Testing**: 100% success rate (Backend 10/10, Frontend all flows verified)
  - **Test Data**: Plan H2 2026 (₹1.2Cr) with South India territory (₹48L) → Bengaluru city (₹20L)
  - Status: VERIFIED

- **UI IMPROVEMENT**: Redesigned Territory Allocation Cards (Side-by-Side Layout)
  - **Purpose**: Make territory allocations more compact and visually clear, like subscription plan cards
  - **Changes**:
    - Territory cards now display in a **2-3 column grid** (responsive)
    - Each card shows: Territory name, target amount, distribution progress, and remaining budget
    - **Cities section** within each card shows: City name, % of territory, Allocated amount, Achieved amount (from invoices)
    - **Edit functionality**: Hover on city row to reveal edit/delete buttons
    - **City Achievement API**: `GET /api/target-planning/city-achievement?city=Bengaluru&start_date=...&end_date=...`
    - **Update Allocation API**: `PUT /api/target-planning/{plan_id}/allocations/{allocation_id}` to edit city amounts
  - **Visual Features**:
    - Rank badges with trophy/medal icons for top 3 territories
    - Progress bars showing distribution percentage
    - Color-coded remaining budget (amber if remaining, green if fully distributed)
  - Status: VERIFIED

### Mar 4, 2026 (Session 17)

- **NEW FEATURE**: Invoice Creation with Automatic COGS/Logistics/Margin Calculation
  - **Purpose**: Enable users to create invoices for accounts with automatic financial calculations
  - **Backend** (`POST /api/accounts/{account_id}/invoices`):
    - Creates invoices with automatic COGS, logistics, and gross margin calculation
    - COGS and logistics fetched from `cogs_data` collection based on SKU and account city
    - Line-level calculations: cogs_per_bottle, cogs_total, logistics_per_bottle, logistics_total, margin, margin_percent
    - Invoice-level calculations: total_cogs, total_logistics, gross_margin, gross_margin_percent
    - Generates sequential invoice numbers: INV-YYYYMMDD-XXXX
    - Response includes margin_summary for immediate feedback
  - **Frontend** (`AccountDetail.js`):
    - "Create Invoice" button in Invoice Summary section
    - Create Invoice dialog with:
      - Invoice date picker
      - Account city displayed (read-only) with COGS note
      - Line items table with SKU dropdown (from master SKU list), bottles, price/bottle inputs
      - Auto-calculated line totals and invoice total
      - Add Line / Remove Line functionality
      - Notes (optional) text area
    - Success toast shows invoice number and gross margin percentage
    - Invoice list automatically refreshes after creation
  - **API Method**: `accountsAPI.createInvoice(id, data)` in `/app/frontend/src/utils/api.js`
  - **Testing**: 100% success rate (8/8 backend tests, all frontend UI flows verified)
  - **Test Data**: Test invoices created for Oceans Fresh Seafood (OCEA-HYD-A26-001) in Hyderabad
  - Status: VERIFIED

### Mar 3, 2026 (Session 16)

- **NEW FEATURE**: Sales ROI Accounting Panel
  - Fixed right-side panel on Home Dashboard (25% width)
  - Only visible to Sales department users
  - Displays accounting-style financial summary:
    - **Cost Section**: Team CTC (prorated for period) + Sales Expenses by category
    - **Revenue Section**: Revenue from Won Leads + Invoices
    - **Profitability Section**: Net Contribution and ROI %
  - Data aggregated for logged-in user + entire reporting hierarchy
  - Period: March 1st to current date (default)
  - Expandable drill-down for CTC and Expense details
  - **Backend**: `/api/sales-roi-summary` endpoint with recursive hierarchy calculation
  - **Frontend**: `/app/frontend/src/components/widgets/SalesROIPanel.js`
  - Removed old "Employee Insights" widget from Home Dashboard
  - Status: VERIFIED

- **NEW FEATURE**: Department Field for Users
  - Added `department` field to User model with options: Admin, Sales, Production, Marketing, Finance
  - Updated Team Management forms (Add/Edit) to include department selection
  - Fixed 500 error on GET /api/users by making department Optional and adding default fallback
  - Created normalization script: `/app/scripts/normalize_departments.py`
  - Status: VERIFIED

- **BUG FIX (P0)**: Pipeline View Not Showing All Leads
  - **Issue 1**: Backend had a `page_size` cap of 100, so if production had more than 100 leads, the Pipeline wouldn't show all of them
  - **Issue 2**: Pipeline view showed all team leads by default instead of filtering by logged-in user
  - **Fixes Applied**:
    - **Backend**: Added `no_limit` parameter to `/api/leads` endpoint that bypasses the 100-item page_size cap (sets it to 10000)
    - **Frontend**: Updated `LeadsKanban.js` to use `no_limit=true` when fetching leads
    - **Frontend**: Pipeline now defaults to showing logged-in user's leads only (using `useAuth` hook)
    - **Frontend**: "Reset" button clears the filter to show all team members' leads
  - **Files Modified**:
    - `/app/backend/server.py` (lines 3304-3335) - Added `no_limit` parameter
    - `/app/frontend/src/pages/LeadsKanban.js` - Added `useAuth`, default user filter, `no_limit=true` API call
  - Status: VERIFIED - Pipeline shows user's leads by default, Reset shows all leads

- **BUG FIX (P0)**: Dashboard Sales Resource Filter Not Showing All Users
  - **Issue**: When CEO/Director filtered the Sales Overview dashboard by a specific sales resource, certain users (CEO, Director, Vice President, System Admin) were missing from the dropdown, making it impossible to view their pipeline.
  - **Root Cause**: The `fetchSalesTeam()` function in Dashboard.js only included certain sales roles: `['Head of Business', 'Regional Sales Manager', 'National Sales Head', 'Partner - Sales']`
  - **Impact**: System Admin had 15 leads but couldn't be selected; Surya Yadavalli (CEO) had 21 leads but couldn't be selected
  - **Fix**: Expanded the `salesRoles` array to include all roles that can have leads assigned:
    - Added: `'CEO', 'Director', 'Vice President', 'System Admin'`
    - Kept: `'Head of Business', 'Regional Sales Manager', 'National Sales Head', 'Partner - Sales'`
  - **File Modified**: `/app/frontend/src/pages/Dashboard.js` (lines 83-92)
  - **Backend**: No changes needed - filtering was already working correctly
  - **Testing**: 100% success rate (9/9 backend tests, 100% frontend tests)
  - Status: VERIFIED - Pipeline now correctly shows leads for all users including CEO, Director, etc.

### Mar 1, 2026 (Session 15)
- **NEW MODULE**: Expense Request at Lead/Account Level
  - **Purpose**: Enable employees to submit expense requests for leads or accounts before/after onboarding
  - **Expense Types** (5 total):
    - Gifting Expense (amount + description only)
    - On-boarding Expense (amount + description only)
    - Staff Gifting Expense (amount + description only)
    - Sponsorship Expense (amount + description only)
    - Free Trial Expense (special: days + SKU grid with auto-calculated MLP)
  - **Features Implemented**:
    - Expense Request section on both **Lead Detail** and **Account Detail** pages
    - History table showing all previous expense requests with Type, Amount, Status, Date
    - Status badges: Draft, Pending Approval, Approved, Rejected, Cancelled
    - **Free Trial Expense** captures:
      - Number of free trial days
      - SKU grid with columns: SKU (dropdown), Tentative Quantity
      - Auto-calculated Minimum Landing Price based on entity city from COGS
      - Auto-calculated Total Budget (Qty × MLP)
    - Save as Draft / Submit for Approval workflow
    - Approval goes to **Director**
    - Users can submit multiple expense requests per lead/account
    - Delete/Cancel functionality for draft and pending requests
  - **New Files**:
    - `/app/frontend/src/components/ExpenseRequestSection.js` - Reusable component
    - `/app/backend/tests/test_expense_requests.py` - Test cases
  - **API Endpoints**:
    - `GET /api/expense-types` - List of 5 expense types
    - `GET /api/expense-requests` - List requests (filterable by entity_type, entity_id)
    - `POST /api/expense-requests` - Create new request
    - `PUT /api/expense-requests/{id}` - Update draft request
    - `PUT /api/expense-requests/{id}/approve` - Approve/reject (Director only)
    - `DELETE /api/expense-requests/{id}` - Cancel request
  - Status: VERIFIED - 100% test success rate (18/18 backend, 100% frontend)

- **BUG FIX**: Budget Request Module Categories Update
  - **Issue**: Budget module had customer-related categories that overlapped with new Expense Request feature
  - **Fix**: Removed customer-specific categories from Budget module:
    - Removed: Customer On-boarding, Customer Gifting, Customer Entertainment, Customer Free Trials
    - Kept: Event Sponsorship (Amount/Stock), Event Participation, Set up Exhibit, Digital Promotion, Marketing Collateral, Office Supplies, General Travel, Other
  - Updated both backend `BUDGET_CATEGORIES` constant and frontend `BUDGET_CATEGORIES` array
  - Status: VERIFIED - 100% test success rate (15/15 backend, 100% frontend)

### Mar 1, 2026 (Session 14)
- **NEW MODULE**: Budget Request Module
  - **Purpose**: Enable employees to request budget approvals for various activities with editable grid format
  - **Budget Categories** (9 total, stored as master data):
    - Customer On-boarding (requires lead)
    - Event Sponsorship - Amount
    - Event Sponsorship - Stock (requires SKU)
    - Event Participation
    - Set up Exhibit
    - Customer Gifting (requires lead)
    - Customer Entertainment (requires lead)
    - Customer - Free Trials (requires lead + SKU)
    - Digital Promotion
  - **Features Implemented**:
    - Title and Description fields
    - Optional Event Details (Name, Date, City)
    - **Editable Grid** for budget line items with columns: Category, Lead/Customer, SKU, Bottles, Price/Unit, Amount, Notes
    - Conditional fields based on category (Lead for customer-related, SKU for stock-based)
    - Auto-calculation: Amount = Bottles × Price/Unit for SKU categories
    - Price per unit fetched from COGS minimum landing price based on lead/event city
    - Total Budget auto-calculation
    - Save as Draft / Submit for Approval workflow
    - Approval goes to **Director only** (not CEO)
  - **New Files**:
    - `/app/frontend/src/pages/BudgetRequest.js` - Full page with editable grid
    - `/app/backend/tests/test_budget_requests.py` - 15 test cases
  - **API Endpoints**:
    - `GET /api/budget-categories` - List of 9 budget categories
    - `GET /api/budget-requests` - List user's requests
    - `POST /api/budget-requests` - Create new request
    - `PUT /api/budget-requests/{id}` - Update draft request
    - `PUT /api/budget-requests/{id}/approve` - Approve/reject (Director only)
    - `PUT /api/budget-requests/{id}/cancel` - Cancel request
    - `GET /api/cogs/sku-price/{city}/{sku}` - Get SKU landing price for city
  - **Bug Fixed**: SKU dropdown crash - `skus.map is not a function` error due to incorrect API response handling
  - **Sidebar**: Added "Budget Request" under REQUESTS section
  - Status: VERIFIED - 100% test success rate (15/15 backend, 100% frontend)

- **UI**: Application-Wide Contemporary Theme Update for Filters & Date Controls
  - **Purpose**: Modernize all filter components across the application with consistent contemporary styling
  - **New Components Created**:
    - `/app/frontend/src/components/ui/filter-bar.jsx` - FilterContainer, FilterItem, FilterGrid, FilterSelect, ActiveFilterTags, FilterSearch
    - `/app/frontend/src/components/ui/date-picker.jsx` - DatePicker and DateRangePicker components
  - **Updated Components**:
    - `calendar.jsx` - Rounded-lg day cells, modern colors, uppercase weekday labels
    - `multi-select.jsx` - Rounded-xl styling, Select All/Clear Selection, improved spacing
  - **Pages Updated**:
    - `LeadsList.js` - 7-column filter grid with FilterContainer
    - `AccountsList.js` - 6-column filter grid with FilterContainer
    - `AccountPerformance.js` - 6-column filter grid with FilterContainer
  - **Styling Features**:
    - Glass-morphism filter container with backdrop blur
    - Uppercase tracking labels (text-xs, tracking-wider)
    - Rounded-xl select triggers and dropdowns
    - Active filter count badge in header
    - Reset button that appears when filters are active
    - Smooth hover transitions with primary/10 highlights
  - Status: VERIFIED - 100% frontend test success rate

- **NEW MODULE**: Travel Request Module
  - **Purpose**: Enable employees to request travel approvals with trip details, purpose, lead linkage, budget, and 15-day advance policy compliance
  - **Features Implemented**:
    - Trip Details: From/To locations (searchable dropdown from Master Locations), Departure/Return dates, Flexible dates toggle
    - 15-Day Advance Rule: Short notice warning with mandatory explanation (min 20 chars) when departure < 15 days
    - Purpose Dropdown: Lead/Customer visits, Distribution, Manufacturing, Team visit, Vendor visits
    - Lead/Customer Visits Section: Typeahead search, chip multi-select, Opportunity Size calculation
    - Budget Section: Total + breakdown (Travel, Accommodation, Local Transport, Meals, Others)
    - Workflow: Save as Draft, Submit for Approval
    - Approval: CEO/Director can approve/reject with reason
    - Action Items Integration: Auto-creates tasks for approvers on submission
  - **New Files**:
    - `/app/frontend/src/pages/TravelRequest.js` - Full page with form and list
    - `/app/backend/tests/test_travel_requests.py` - 11 test cases
  - **API Endpoints**:
    - `GET /api/travel-requests/purposes` - List of travel purposes
    - `GET /api/travel-requests` - List user's requests (CEO/Director see pending)
    - `POST /api/travel-requests` - Create new request
    - `PUT /api/travel-requests/{id}` - Update draft request
    - `PUT /api/travel-requests/{id}/approve` - Approve/reject request
    - `PUT /api/travel-requests/{id}/cancel` - Cancel request
    - `GET /api/travel-requests/pending-approvals/count` - Count for approvers
  - **Sidebar**: Added "REQUESTS" section with Leaves and Travel Request
  - Status: VERIFIED - 100% test success rate (11/11 backend, 10/10 frontend)

- **UI**: Enhanced Accounts List Page with Contemporary Styling
  - **Purpose**: Apply consistent modern theme to the accounts listing table
  - **Changes**:
    - Gradient table header with amber tint and uppercase tracking
    - Account icon column with rounded amber gradient containers
    - Hover effects with gradient transitions and scale animations
    - "New" account age displayed as emerald green pill badge
    - Location icon in rounded container with city/state layout
    - Sales contact with circular gradient avatar icon
    - Enhanced view toggle with gradient active states (List/Logo Gallery)
    - Improved pagination with styled page indicator and hover effects
  - **File Modified**: `/app/frontend/src/pages/AccountsList.js`
  - Status: VERIFIED via screenshot

- **FEATURE**: Complete Dynamic Lead Status Integration
  - **Purpose**: Make the entire application's lead status system configurable from the Master Lead Status settings page, removing all hardcoded status logic
  - **Implementation**:
    - Updated `Dashboard.js` to use `useLeadStatuses` hook instead of hardcoded `STATUS_CONFIG`
    - Added `getIconForColor()` helper function to map status colors to icons
    - Status distribution cards now iterate over dynamic `statuses` array from the hook
    - Each status card is clickable and navigates to filtered leads list
  - **Bug Fixed**: Case sensitivity in role permissions for lead status CRUD operations
    - Role checks in server.py now use `.lower()` for comparison
    - Affected endpoints: POST/PUT/DELETE `/api/master/lead-statuses`
  - **Pages Using Dynamic Statuses**:
    - `Dashboard.js` - Lead Status Distribution (10 status cards)
    - `LeadsList.js` - Status filter dropdown (multi-select)
    - `AddEditLead.js` - Status dropdown in lead form
    - `LeadDetail.js` - Status display badge and update dropdown
    - `LeadsKanban.js` - Kanban columns generated dynamically
    - `MasterLeadStatus.js` - CRUD management UI
  - **Files Modified**:
    - `/app/frontend/src/pages/Dashboard.js` - Dynamic status rendering
    - `/app/backend/server.py` - Case-insensitive role checks
  - Status: VERIFIED - 100% test success rate (9/9 backend, 6/6 frontend)

### Feb 28, 2026 (Session 13)
- **FEATURE**: Daily Quote Widgets on Home Dashboard (API-Powered)
  - **Purpose**: Display inspirational daily quotes to users, with new quote on each login
  - **Backend Implementation**:
    - Created `GET /api/quotes/water` - Returns random water quote from curated list of 31 quotes
    - Created `GET /api/quotes/sales` - Proxies to ZenQuotes API for inspirational quotes (free, no auth required)
    - Both endpoints avoid CORS issues by being served from same domain
  - **Frontend Implementation**:
    - Updated `/app/frontend/src/components/widgets/WaterQuoteWidget.js` - Fetches from API on mount
    - Updated `/app/frontend/src/components/widgets/SalesQuoteWidget.js` - Fetches from API on mount
  - **Features**:
    - New quote fetched on each login/page load
    - Refresh button on each widget to get new quote manually
    - Loading spinner while fetching
    - Graceful fallback quotes on API failure
    - Contemporary styling with gradient backgrounds, glass-morphism effects, hover animations
    - Positioned immediately after header (visible without scrolling)
  - **APIs Used**:
    - Water quotes: Curated server-side list (free, unlimited)
    - Sales quotes: ZenQuotes API (https://zenquotes.io/api/random) - free, no auth required
  - **Files Modified**:
    - `/app/backend/server.py` - Added quotes proxy endpoints
    - `/app/frontend/src/components/widgets/WaterQuoteWidget.js` - API integration
    - `/app/frontend/src/components/widgets/SalesQuoteWidget.js` - API integration
  - Status: VERIFIED - All API endpoints working, new quotes on each login/refresh

### Feb 28, 2026 (Session 12)
- **UI**: Applied Contemporary Theme Across ALL Application Pages
  - **Core Pages Updated (15+ pages)**:
    - `LeadsList.js` - Blue gradient, glass-morphism filter card, colored status badges
    - `AccountsList.js` - Amber gradient, 4 stat cards, gallery/list view toggle
    - `TeamManagement.js` - Purple gradient, glass-morphism table
    - `FollowUps.js` - Cyan gradient, styled calendar and follow-up cards
    - `SalesTargets.js` - Green gradient, plan cards with glass-morphism
    - `SKUManagement.js` - Orange gradient, glass-morphism filter card
    - `DailyStatusUpdate.js` - Rose gradient, styled date picker and form cards
    - `LeaveManagement.js` - Sky gradient, styled leave request cards
    - `MasterLocations.js` - Violet gradient, colored stats (Territories/States/Cities)
    - `Maintenance.js` - Slate gradient, 4 stat cards (Scheduled/In Progress/Overdue/Completed)
    - `Inventory.js` - Blue gradient, 4 stat cards with stock level indicators
    - `QualityControl.js` - Emerald gradient, styled test cards with status badges
  - **Theme Features Applied**:
    - Gradient backgrounds: `bg-gradient-to-br from-slate-50 via-white to-[color]-50/30`
    - Glass-morphism cards: `backdrop-blur-xl bg-white/80`
    - Stat cards with gradient top borders
    - Gradient primary action buttons
    - Consistent header styling with colored icon containers
  - Status: VERIFIED - 100% test success rate (12/12 pages)

- **UI**: Applied Contemporary Theme to Additional Dashboard Pages (3 more pages)
  - `Dashboard.js` (Sales Overview) - Teal gradient, 4 activity stat cards, lead status distribution grid, won/lost summary cards
  - `TargetSKUReport.js` (Target x SKU) - Violet gradient, 4 summary stats, sortable table with in-line filters
  - `TargetResourceReport.js` (Target x Resource) - Indigo gradient, 4 summary stats, color-coded achievement %
  - Status: VERIFIED - 100% test success rate (8/8 frontend tests)

- **UI**: Applied Contemporary Theme to All Dashboard Report Pages
  - **Purpose**: Consistent modern design across all dashboard reports
  - **Pages Updated**:
    - `SalesRevenueDashboard.js` - Gradient backgrounds, glass-morphism cards, 4 colored stat cards
    - `SKUPerformance.js` - Gradient backgrounds, glass-morphism cards, 4 stat cards, trend indicators
    - `ResourcePerformance.js` - Gradient backgrounds, glass-morphism cards, 5 stat cards, rank badges for top 3
    - `AccountPerformance.js` - Gradient backgrounds, glass-morphism cards, 7 stat cards, Tier badges
  - **Theme Features Applied**:
    - Gradient backgrounds: `bg-gradient-to-br from-slate-50 via-white to-[color]-50/30`
    - Glass-morphism filter cards: `backdrop-blur-xl`
    - Colored stat cards with gradient top accent bars
    - Clean table styling with hover states
    - Consistent typography and spacing
  - **Routes**: `/sales-revenue`, `/sku-performance`, `/resource-performance`, `/account-performance`
  - Status: VERIFIED - 100% test success rate (8/8 frontend tests)

- **REFACTORING**: HomeDashboard.js Component Extraction
  - **Purpose**: Improve code maintainability by breaking down monolithic dashboard component
  - **Result**: Reduced HomeDashboard.js from 1126 lines to ~260 lines (77% reduction)
  - **New Widget Components Created** in `/app/frontend/src/components/widgets/`:
    1. `WeatherTimeWidget.js` - Weather display, digital clock, session timer
    2. `TodaySummaryWidget.js` - Today's activity summary cards (Activities, Calls, Emails, Meetings)
    3. `ActionItemsWidget.js` - Tasks with filtering, comments, expand/collapse, approval links
    4. `UpcomingFollowupsWidget.js` - Follow-ups for both Leads and Accounts
    5. `UpcomingMeetingsWidget.js` - Zoom-styled meetings widget
    6. `MonthlyPerformanceWidget.js` - Target vs Achieved progress display
    7. `PipelineSummaryWidget.js` - Pipeline status distribution
    8. `RecentActivityWidget.js` - Recent activity feed
    9. `NewTaskDialog.js` - Task creation modal
    10. `NewMeetingDialog.js` - Meeting scheduling modal
    11. `index.js` - Barrel export for all widgets
  - **Benefits**:
    - Each widget is now independently maintainable and testable
    - Improved code reusability - widgets can be used in other pages if needed
    - Better separation of concerns
    - Easier debugging and feature additions
  - Status: VERIFIED via screenshot - all widgets rendering correctly

- **FEATURE**: Zoom Integration for Meetings
  - **Purpose**: Automatically create Zoom meetings when scheduling meetings in the CRM
  - **Implementation**:
    - Created `/app/backend/zoom_service.py` - Zoom API client using Server-to-Server OAuth
    - Updated Meeting model with `zoom_meeting_id` and `zoom_password` fields
    - Added `create_zoom_meeting` flag to MeetingCreate model
    - Modified POST `/api/meetings` endpoint to create Zoom meeting when flag is true
    - Added "Create Zoom Meeting" toggle in NewMeetingDialog component
    - Updated UpcomingMeetingsWidget to show "Join" button and password for Zoom meetings
  - **UI Features**:
    - Toggle switch to enable/disable Zoom meeting creation (ON by default)
    - "Join" button appears on meetings with Zoom links
    - Password displayed for easy access
    - Button text changes to "Create with Zoom" when toggle is on
  - **Backend**: Uses Zoom Server-to-Server OAuth with `meeting:write:meeting:admin` scope
  - **Files Modified**:
    - `/app/backend/.env` - Added ZOOM_ACCOUNT_ID, ZOOM_CLIENT_ID, ZOOM_CLIENT_SECRET
    - `/app/backend/zoom_service.py` - NEW: Zoom API client
    - `/app/backend/server.py` - Updated Meeting models and create_meeting endpoint
    - `/app/frontend/src/components/widgets/NewMeetingDialog.js` - Added Zoom toggle
    - `/app/frontend/src/components/widgets/UpcomingMeetingsWidget.js` - Added Join button
    - `/app/frontend/src/pages/HomeDashboard.js` - Added create_zoom_meeting to state
  - Status: VERIFIED via curl and screenshot - Zoom meetings created successfully

- **FEATURE**: Enhanced Meeting Management
  - **Meeting Detail Dialog**: View full meeting details including Zoom info, attendees, description
    - Copy Meeting ID, Password, and Link to clipboard
    - Reschedule and Cancel Meeting buttons
  - **Reschedule/Cancel Meetings**: Full support with email notifications
  - **Attendee Selection**:
    - Internal attendees: Dropdown to select team members
    - External attendees: Email chip input with X to remove
  - **Email Notifications**: Automatic emails sent to attendees when meetings are:
    - Scheduled (new invitation)
    - Rescheduled (date/time changed)
    - Cancelled
  - **Lighter UI**: Redesigned Upcoming Meetings widget with cleaner, lighter theme
  - **Files Modified**:
    - `/app/frontend/src/components/widgets/UpcomingMeetingsWidget.js` - Redesigned with lighter theme
    - `/app/frontend/src/components/widgets/MeetingDetailDialog.js` - NEW: Meeting detail view
    - `/app/frontend/src/components/widgets/NewMeetingDialog.js` - Added attendee selection UI
    - `/app/frontend/src/pages/HomeDashboard.js` - Added meeting view/edit/cancel handlers
    - `/app/backend/server.py` - Added send_meeting_notification function, updated endpoints
  - Status: VERIFIED via screenshots and curl - all features working

- **UI**: Moved "New Task" button into Action Items widget header
  - Cleaner dashboard layout with contextual action buttons

### Feb 27, 2026 (Session 11)
- **FEATURE**: Proposal File Type Thumbnails & PDF Viewer
  - **Purpose**: Better visual identification of proposal file types and inline PDF viewing without download
  - **Implementation**:
    - Added `getProposalFileType()` function to detect PDF vs Word documents by extension
    - PDF files display: Red icon (bg-red-100), "PDF" badge, "View PDF" button
    - Word files display: Blue icon (bg-blue-100), "Word Document" badge, NO View PDF button
    - PDF viewer dialog with embedded PDF using `<embed>` tag (same as Files & Documents)
    - Dialog includes filename in title, Close and Download buttons
  - **File Modified**: `/app/frontend/src/pages/LeadDetail.js`
  - Status: VERIFIED - 100% test success rate (12/12 tests passed)

- **FEATURE**: Home Dashboard (New Landing Page)
  - **Purpose**: Centralized, action-oriented dashboard as the new default landing page after login
  - **Implementation**:
    - Created `/home` route with `HomeDashboard.js` component
    - Updated login redirect from `/dashboard` to `/home`
    - Added "Home" navigation item as first item under "Core" in sidebar
    - Context switcher now navigates to `/home` instead of `/dashboard`
  - **Widgets**:
    - **Today's Summary Cards**: Activities, Calls, Emails, Meetings counters
    - **Action Items**: User's pending tasks + overdue follow-ups with completion toggle
    - **Upcoming Follow-ups**: Leads with follow-up dates in next 7 days
    - **Leads to Focus On**: Top 5 leads by win probability score
    - **Monthly Performance**: Target vs Achieved progress bar
    - **Pipeline Summary**: Lead status distribution counts
    - **Upcoming Meetings**: Scheduled meetings for next week
    - **Recent Activity**: Latest activity timeline
  - **Form-based Task Scheduler**:
    - New Task dialog: Title, Description, Type, Priority, Due Date, Time, Assign To
    - Task types: General, Follow Up, Call, Email, Meeting, Visit
    - Priority levels: Low, Medium, High, Urgent
    - Can assign to self or team members
  - **Form-based Meeting Scheduler**:
    - Schedule Meeting dialog: Title, Description, Type, Duration, Date, Time, Location, Attendees
    - Meeting types: Client Meeting, Internal, Vendor, Other
    - Duration options: 15min, 30min, 45min, 1hr, 1.5hr, 2hr
    - Attendee emails and names fields
  - **Backend Endpoints** (built in previous session):
    - `GET /api/dashboard` - Aggregates action_items, upcoming_leads, recommended_leads, meetings, today_summary, pipeline, monthly_performance, recent_activities
    - `POST/GET/PUT/DELETE /api/tasks` - Full CRUD for tasks
    - `POST/GET/PUT/DELETE /api/meetings` - Full CRUD for meetings
  - **Files Modified**:
    - `/app/frontend/src/pages/HomeDashboard.js` - Main component
    - `/app/frontend/src/App.js` - Added /home route and import
    - `/app/frontend/src/pages/Login.js` - Changed redirect to /home
    - `/app/frontend/src/layouts/DashboardLayout.js` - Added Home nav item, updated context switch
  - Status: VERIFIED - 100% test success rate (14/14 tests passed)

- **CHANGE**: Proposal Approval - PDF Only Requirement
  - Word documents (.docx, .doc) can still be uploaded for review
  - When approving, if the proposal is a Word document, an error is shown:
    "Word documents cannot be approved directly. Please save the document as PDF and upload again."
  - Only PDF proposals can be approved and receive the digital signature stamp
  - **Files Modified**: `/app/backend/server.py`
  - Status: VERIFIED via curl testing

- **FEATURE**: Proposal Email Sharing
  - **Purpose**: Allow users to share approved proposals via email directly from the CRM
  - **Implementation**:
    - Added "Share via Email" button that appears only for approved proposals
    - Email composer styled like Outlook/Gmail:
      - To, Cc, Bcc fields on single line (no helper text)
      - Large email body with auto-populated template
      - Expand/minimize button for full-screen editing (90vh x 90vw)
      - Attachment preview at bottom
    - Default email body with signature:
      ```
      Dear Sir/Madam,
      [Proposal message]...
      
      Best Regards,
      [First Name] [Last Name]
      [Phone Number]
      [Email Address]
      ```
    - Subject pre-populated: "Nyla Air Water - Proposal for review" (editable)
    - CC pre-filled with reporting manager's email
    - Activity logged when proposal is shared
  - **Integration**: Resend email service (API key in RESEND_API_KEY env var)
  - **Files Modified**: 
    - `/app/backend/server.py` - Added Resend integration and email endpoints
    - `/app/frontend/src/pages/LeadDetail.js` - Added email composer dialog
  - Status: VERIFIED via screenshot testing

- **FEATURE**: Lead-to-Account Conversion - Copy Proposed SKU Pricing
  - **Purpose**: Automatically copy the lead's proposed SKU pricing to the account's SKU pricing during conversion
  - **Implementation**:
    - Updated `/api/accounts/convert-lead` endpoint in `server.py`
    - Maps lead's `proposed_sku_pricing` fields to account's `sku_pricing` format
    - Handles both field naming conventions: `proposed_price` → `price_per_unit`, `bottle_return_credit` → `return_bottle_credit`
    - Gracefully handles missing or null values
  - **File Modified**: `/app/backend/server.py`
  - Status: VERIFIED via curl and screenshot testing

- **FEATURE**: Daily Status - Copy Fetched Activities
  - **Purpose**: Allow users to easily copy the fetched activity list to clipboard for sharing
  - **Implementation**:
    - Added "Copy" button inside the Updates section card, positioned on the right side of the header
    - Button appears only after activities are successfully fetched
    - Button shows "Copy" icon initially, changes to green "Copied!" with checkmark on success
    - Text is cleaned for clipboard: removes [SUMMARY] and [HEADER] markers, formats nicely
    - Uses `navigator.clipboard.writeText()` with fallback for older browsers
    - State resets automatically after 2 seconds or when date changes
  - **UI Changes**:
    - StatusSection component updated to accept `showCopyButton`, `onCopy`, and `copied` props
    - Copy button styled with ghost variant, small size, positioned in header flex container
  - **File Modified**: `/app/frontend/src/pages/DailyStatusUpdate.js`
  - Status: VERIFIED via screenshot testing

- **FEATURE**: COGS Calculator - Actual Landing Price (What-If Analysis)
  - **Purpose**: Allow users to perform on-the-fly "what-if" analysis on gross margins
  - **Implementation**:
    - Added new "Actual Landing Price" input column to COGS Calculator table
    - When user enters a value, the system reverse-calculates the required Gross Margin %
    - Formula: `Base Cost = Actual Landing × (1 - Distribution %)` then `Gross Margin % = (Base Cost - Costs - Logistics) / Total COGS × 100`
    - This field is **transient** - NOT saved to database, cleared on city change or page refresh
    - The recalculated Gross Margin % CAN be saved if user clicks "Save All Changes"
  - **UI Changes**:
    - New purple-highlighted column "Actual Landing (₹)" with input fields
    - Updated formula section with explanation of the What-If feature
    - Excel export includes Actual Landing Price column
  - **Technical Details**:
    - `actualLandingPrices` state object (keyed by row ID) holds transient values
    - `updateActualLandingPrice()` function handles input changes and triggers recalculation
    - State is cleared when `selectedCity` changes via useEffect
  - **File Modified**: `/app/frontend/src/pages/COGSCalculator.js`
  - Status: VERIFIED via screenshot testing

### Feb 25, 2026 (Session 10)
- **FEATURE**: Dark/Light Mode Theme Toggle
  - **Purpose**: User-requested theme switching with dark aqua blue color scheme
  - **Implementation**:
    - `ThemeContext.js`: React context for managing theme state with localStorage persistence
    - `index.css`: CSS variables for both light and dark themes using HSL colors
      - Light mode: `--background: 195 30% 98%`, `--card: 0 0% 100%`
      - Dark mode: `--background: 200 35% 8%`, `--card: 200 30% 12%`
    - `DashboardLayout.js`: Theme toggle button with Sun/Moon icons in sidebar user section
    - `index.html`: Script to prevent flash of wrong theme before React loads
  - **Theme Colors**:
    - Primary: HSL(185, 70%, 35%) - Aqua/teal accent
    - Dark background: rgb(13, 23, 28) - Deep dark aqua blue
    - Dark cards: rgb(21, 34, 40) - Slightly lighter dark blue
    - Light background: rgb(248, 251, 251) - Light aqua tint
  - **Features**:
    - Persists theme preference in localStorage
    - Respects system preference (prefers-color-scheme) on first visit
    - Smooth 0.2s transition animations
    - Sidebar maintains dark aqua blue in both modes (consistent branding)
    - Toggle button shows "Dark Mode"/"Light Mode" based on current state
  - **Files Modified**: `ThemeContext.js`, `index.css`, `DashboardLayout.js`, `index.html`, `Dashboard.js`
  - Status: VERIFIED - 100% test success rate (13/13 tests)

### Feb 24, 2026 (Session 9)
- **FIX (P0)**: Server-Side Filtering for Leads List
  - **Problem**: Filters on Leads List page were performing client-side filtering instead of server-side, causing incorrect data display and performance issues
  - **Root Cause**: Frontend was fetching all data and filtering locally instead of passing filter parameters to backend
  - **Changes Made**:
    - Updated `api.js`: `leadsAPI.getAll()` now passes `time_filter`, `territory`, `state`, `assigned_to` parameters
    - Updated `LeadsList.js`: 
      - `fetchLeads()` now includes all filters in API params
      - `useEffect` dependencies include all filter state variables
      - Removed client-side filtering code (70+ lines)
    - Updated `server.py`: Fixed date comparison by converting datetime to ISO string for MongoDB string comparison
  - **Verification**: 
    - Backend API correctly filters (this_week=2, this_month=53, lifetime=66 leads)
    - Frontend displays correct counts matching server response
    - All filter changes trigger server-side refetch
  - Status: VERIFIED - 100% test success rate (8/8 backend tests, all frontend filter API calls verified)

- **FIX**: Daily Status "Fetch Activities" Button Not Working
  - **Problem**: Clicking "Fetch Today's Lead Activities" button was not returning any activities
  - **Root Cause**: `NoneType` error in `/api/daily-status/auto-populate/{status_date}` endpoint when activity `interaction_method` or `activity_type` was `None`
  - **Fix**: Added null-safe handling: `interaction_raw = activity.get('interaction_method') or activity.get('activity_type') or 'activity'`
  - **Verification**: Tested with today's date - successfully loaded 5 activities from 3 leads
  - Status: VERIFIED - Activities now populate correctly in "Today's Updates" field

- **ENHANCEMENT**: Daily Status UI Improvements
  - **Removed**: "Revise with AI" feature from all status sections
  - **Added**: Automatic bullet point formatting for status updates
    - Text is converted to bullet format (• ) when saving
    - Recent Updates section displays items with styled bullet points
    - Placeholder text updated to guide users: "Enter each item on a new line..."
  - **Added**: Activity Summary line when fetching activities
    - First line shows: "SUMMARY: Customer Visits: X | Phone Calls: Y | Messages/Emails: Z"
    - Counts customer_visit, phone_call/call, and sms/whatsapp/email activities
  - **Added**: Grouped Activities by Interaction Method
    - Activities grouped into: CUSTOMER VISITS, PHONE CALLS, EMAILS, WHATSAPP, SMS, OTHER
    - Each group has highlighted header with icon
    - Summary line has gradient background
  - Status: IMPLEMENTED

- **FIX**: Team Status - Team Members Dropdown Not Populated
  - **Problem**: Team Member dropdown was empty or only showing members who submitted status
  - **Root Cause**: Dropdown was populated from `rollupData.team_statuses` instead of `allUsers`
  - **Fix**: Changed to use `allUsers` list filtered by `is_active` status
  - Status: VERIFIED - Dropdown now shows all active team members

- **REFACTOR**: Replaced Team Status with Status Summary
  - **Removed**: TeamStatusFeed.js (complex weekly/monthly views, AI summary)
  - **Added**: StatusSummary.js - Simplified daily status viewer
    - Default: Yesterday selected
    - Filters: Territory, State, City, Resource dropdowns
    - Shows each team member's daily updates in card format with bullet points
    - Date picker for any past date
  - **FIX**: Backend API was only showing direct reports' statuses
    - Updated `/api/daily-status/team-rollup` to show ALL team statuses for high-level roles (CEO, Director, VP, National Sales Head)
    - Added user_role, user_city, user_state fields to response
  - Status: IMPLEMENTED & VERIFIED

- **BRANDING**: Updated sidebar brand name from "Nyla" to "Nyla Air Water"

- **FEATURE**: Master Locations Module
  - **Purpose**: Centralized management of Indian territories, states, and cities
  - **Backend APIs**:
    - `GET /api/master-locations` - Hierarchical data (territories with nested states and cities)
    - `GET /api/master-locations/flat` - Flat lists for dropdowns
    - `POST/PUT/DELETE` for territories, states, and cities
  - **Frontend**: `/app/frontend/src/pages/MasterLocations.js`
    - Tree view with expandable territories → states → cities
    - Stats cards showing counts (5 Territories, 23 States, 90 Cities)
    - Search functionality
    - CRUD operations with dialogs
  - **Hook**: `/app/frontend/src/hooks/useMasterLocations.js` for consuming across the app
  - **Default Data**: Pre-populated with 5 Indian territories, 23 states, 90 cities
  - Status: IMPLEMENTED

- **REFACTOR (P0)**: Application-wide Master Locations Integration
  - **Purpose**: Replace all hardcoded location data with dynamic data from Master Locations module
  - **Updated Files**:
    - `AddEditLead.js`: Region dropdown now shows territories from master locations; State/City cascade correctly
    - `AccountsList.js`: Territory, State, City filter dropdowns use master locations
    - `AccountPerformance.js`: Territory, State, City filter dropdowns use master locations
    - `TeamManagement.js`: Add/Edit team member forms use master locations for Territory, State, City
    - `SalesTargets.js`: CityForm component fetches and displays cities from master locations
    - `LeadDiscovery.js`: City-to-State-to-Territory mapping now uses master locations data
  - **Removed**: All hardcoded location arrays (`TERRITORY_MAP`, `LOCATIONS`, `CITY_MAP`, `cityStateMap`)
  - **Testing**: 100% success rate - 15 tests passed across all 6 pages
  - **Cascading Verified**: Territory → State → City dropdowns work correctly on all pages
  - Status: VERIFIED - 100% test success rate

- **REFACTOR**: Backend Modular Architecture
  - **Purpose**: Improve code maintainability by splitting the 7000-line server.py into domain-specific modules
  - **New Structure Created**:
    - `database.py`: MongoDB connection singleton
    - `config.py`: Environment configuration (JWT, API keys)
    - `deps.py`: Authentication dependencies (get_current_user, hash_password, etc.)
    - `utils.py`: Shared utility functions (generate_lead_id, generate_account_id)
    - `models/`: Pydantic models organized by domain (user, lead, account, activity, etc.)
    - `routes/`: API route modules (auth.py, master_data.py)
  - **Documentation**: Created `ARCHITECTURE.md` with full migration plan
  - **Migration Strategy**: Gradual migration - new modules created alongside existing server.py
  - **Backup**: Original server.py backed up as server_backup.py
  - Status: PHASE 1 COMPLETE - Structure created, full migration planned

### Feb 24, 2026 (Session 8)
- **FEATURE**: Digital Signature on Approved Proposals
  - When a PDF proposal is approved, system automatically stamps the document
  - Signature format: "Approved by: {approver_name}  |  Date: {Month DD, YYYY at HH:MM AM/PM IST}"
  - Subtle appearance: 8pt Helvetica, gray color (0.4, 0.4, 0.4 alpha 0.8)
  - Position: Bottom center of last page, 30 points from bottom
  - Only PDF files are stamped; DOCX files are approved without stamping
  - Uses `reportlab` for PDF generation and `PyPDF2` for merging
  - Backend function: `stamp_pdf_with_signature()` in `server.py`
  - Status: VERIFIED - 100% test success rate (9/9 tests)

- **FIX**: Partner - Sales Role Permissions Alignment
  - Aligned "Partner - Sales" role permissions with "Regional Sales Manager"
  - **Backend updates**:
    - Added to sales target calculation (₹1,500,000 target)
  - **Frontend updates**:
    - `ResourcePerformance.js`: Added to team filter
    - `TeamManagement.js`: Added to "reports_to" dropdown (create & edit)
    - `SalesTargets.js`: Added to sales team filter
    - `DashboardLayout.js`: Added to Transport Calculator access
  - Status: IMPLEMENTED

- **FEATURE**: Leads Kanban Board (Pipeline View)
  - New `/leads/kanban` page with drag-and-drop lead management
  - **11 status columns**: New, Contacted, Qualified, In Progress, Trial, Proposal Shared, Proposal Approved, Won, Lost, Not Qualified, Future Follow-up
  - **Lead cards** display: Company name, Lead ID, contact, location, category, assigned user
  - **Filters**: Search, City, Assigned To, Category, Reset button
  - **Activity Log Dialog**: Triggered when dragging lead between statuses
  - **Move To Dropdown**: Quick status change via arrow icon on each card (no dragging needed)
  - **Scroll Buttons**: Left/right arrows for easy navigation across columns
  - **Auto-scroll**: When dragging near edges, board scrolls automatically
  - Status: VERIFIED - 100% test success rate (16/16 tests)

- **FEATURE**: Sales/Production Context Switching
  - **Context Switcher**: Toggle buttons in sidebar (Sales | Production)
  - **Access Rules**:
    - CEO, Director: Can access both contexts
    - Users: Based on department field (Sales, Production, or Both)
  - **Department Field**: Added to User model and Team Management forms
  - **Production Modules** (placeholder pages):
    - Maintenance: Equipment scheduling and tracking
    - Inventory: Stock management with levels and alerts
    - Quality Control: QC test tracking with TDS/pH values
    - Assets: Company asset tracking
    - Vendors: Supplier management
  - **Shared Module**: SKU Management accessible in both contexts
  - **Navigation**: Context-aware sidebar navigation
  - Files: `AppContextContext.js`, `DashboardLayout.js`, Production pages
  - Status: VERIFIED - 100% test success rate (25/25 tests)

### Feb 23, 2026 (Session 7)
- **FIX**: Toast Notification Visibility & Error Messages
  - Repositioned toasts to `top-center` for better visibility
  - Enabled `richColors` - error toasts now have red background, success green
  - Extended duration to 5 seconds (6 seconds for errors)
  - Added close button for manual dismissal
  - Expanded toast size for readability
  - **Activity Logging Errors**:
    - Now shows actual API error detail message (user-friendly)
    - Added validation message "Please enter an activity description"
    - Added description subtitle for context
  - Files updated: `sonner.jsx`, `LeadDetail.js`, `DailyStatusUpdate.js`
  - Status: IMPLEMENTED

- **FEATURE**: Account Category Integration
  - Lead-to-Account conversion now copies category, contact name, phone from lead
  - Added migration endpoint to backfill existing accounts with categories
  - Category stats now display in Accounts page stats cards
  - Category badge shows on each account row
  - Status: VERIFIED

- **FEATURE**: Accounts List Page Redesign
  - Complete visual overhaul to match Account Performance page style
  - **New Filters** (same as Account Performance):
    - Search (account name, contact, ID)
    - Territory, State, City (cascading dropdowns)
    - Account Type (Tier 1/2/3)
    - Reset button
  - **Statistics Cards** above the grid:
    - Total accounts count
    - Accounts by type (Tier 1, Tier 2, Tier 3)
    - Top categories breakdown
  - **Updated Table Columns**:
    - Account (name, ID, category badge)
    - Type (Tier badge with color coding)
    - Contact (name + phone combined in one column)
    - Location (city, state)
    - Account Age (calculated in months from created_at)
    - Onboarded (created_at date)
    - Sales Contact (assigned sales person name)
    - Removed: Outstanding Amount
  - **Backend enhancements**:
    - Extended `/api/accounts` with state, city, category filters
    - Added `sales_person_name` field to account responses
    - New `/api/accounts/stats/summary` endpoint for metrics
  - Status: VERIFIED via screenshot testing

- **FEATURE**: Team Activity Tracking
  - Added "Last Active" column to Team Management table showing when user last performed any action
  - Added "Session Time" column showing time spent in current/latest session
  - Online indicator (green dot) for users active within last 2 minutes
  - Activity Details Dialog (click Eye icon) showing:
    - Session summary (Last Active, Duration, Session Start)
    - Pages Visited with time spent and visit count
    - Actions Performed with count
    - Recent Activity Timeline with timestamps
  - **Backend APIs**:
    - `POST /api/activity/heartbeat` - Records user activity every 30 seconds
    - `GET /api/activity/my-session` - Get current user's session activity
    - `GET /api/activity/user/{user_id}` - Get specific user's last session
    - `GET /api/activity/team` - Get activity summary for all team members
  - **Frontend**:
    - Created `useActivityTracker` hook for automatic heartbeat tracking
    - Updated `TeamManagement.js` with new columns and Activity Dialog
  - Status: VERIFIED via screenshot testing

- **FEATURE**: PWA (Progressive Web App) Support
  - App is now installable on mobile/desktop devices
  - Offline support with service worker caching
  - Push notification capability enabled
  - **Assets created**:
    - `/public/manifest.json` - PWA manifest with app metadata
    - `/public/sw.js` - Service worker with caching strategies
    - `/public/offline.html` - Offline fallback page
    - `/public/icons/` - App icons in multiple sizes (72-512px)
  - Updated `index.html` with PWA meta tags and service worker registration
  - Caching strategies: Cache-first for static assets, Network-first for API calls
  - Status: VERIFIED - manifest, service worker, and icons all serving correctly

- **FIX**: Brand Comparison Calculator - Return Credit Display Update
  - Updated `SalesPortal.js` to show return credit breakdown:
    - "Return Credit / Bottle (₹)" - shows per-bottle return credit based on % bottle returns
    - "Total Return Credit (X bottles)" - shows total return credit for the sample size
  - Added Return Credit Comparison row in summary section:
    - Shows "Extra Return Credit with Nyla/Your Brand" difference
    - Displays both per-bottle and total sample values for each brand
  - Changed default "% Bottle Returns" from 100 to **75** for both brands
  - Calculation: Return Credit/Bottle = (% Bottle Returns / 100) × Bottle Return Credit
  - Status: VERIFIED via screenshot testing

### Feb 23, 2026 (Session 6)
- **FEATURE**: Lead Proposal Section Module
  - Added proposal management within Lead Detail page
  - **Backend APIs**:
    - `GET /api/leads/{lead_id}/proposal` - Get current proposal
    - `POST /api/leads/{lead_id}/proposal` - Upload proposal (replaces existing)
    - `GET /api/leads/{lead_id}/proposal/download` - Download with file data
    - `DELETE /api/leads/{lead_id}/proposal` - Delete (uploader only, pending_review only)
    - `PUT /api/leads/{lead_id}/proposal/review` - Approve/Reject/Request Changes
  - **Features**:
    - Upload PDF or DOC/DOCX proposals (5 MB limit)
    - Status workflow: Pending Review → Changes Requested → Revised → Approved/Rejected
    - Approver roles: CEO, Director, VP, National Sales Head
    - Uploader can delete only when in Pending Review status
    - Download available at all stages
    - Version tracking on re-uploads
    - Review history with comments displayed
    - Single active proposal per lead (new upload replaces old)
  - **UI Components**:
    - Proposal card with file info, status badge, download button
    - Review actions (Approve, Request Changes, Reject) for approvers
    - Review comment input with validation
    - Review history timeline with icons
    - Upload/Replace proposal button
  - Status: VERIFIED - All 16 backend tests passed (100% success rate)

- **FEATURE**: Lead Status Workflow Enhancement
  - Added new status: "Proposal Approved by Customer"
  - Renamed "Proposal Stage" → "Proposal Shared"
  - **Validation Rules**:
    - "Proposal Shared" requires an approved proposal document
    - "Won" can only be set from "Proposal Approved by Customer" status
  - Updated across all pages: LeadDetail, LeadsList, Dashboard, AddEditLead
  - Status flow: ... → Proposal Shared → Proposal Approved by Customer → Won

- **FIX**: BottlePreview production CORS issue
  - Changed API_URL from hardcoded env variable to relative `/api` URL
  - Now works correctly on any domain (preview, production, custom)

- **REMOVED**: Proposals menu item (per user request)

### Feb 22, 2026 (Session 5)
- **FEATURE**: Files & Documents Management Module
  - New `/files-documents` page for centralized document management
  - **Backend APIs**:
    - `GET/POST/PUT/DELETE /api/document-categories` - Category CRUD
    - `GET/POST/PUT/DELETE /api/document-subcategories` - Subcategory CRUD  
    - `GET/POST/DELETE /api/documents` - Document management
    - `POST /api/documents/upload` - File upload with multipart/form-data
  - **Features**:
    - Category & Subcategory organization (hierarchical structure)
    - Key Users (Admin, CEO, Director) can manage categories
    - All users can upload, view, and download documents
    - Delete permission: Admin/CEO/Director + document uploader
    - Supported file types: PDF, DOC, DOCX, PNG, JPG, JPEG, GIF, WEBP
    - 5 MB file size limit per upload
    - Document type icons/thumbnails (PDF icon, Doc icon, Image preview)
    - Search and filter by category/subcategory
    - Breadcrumb navigation for category hierarchy
  - **UI Components**:
    - Manage Categories modal (for key users only)
    - Upload Document modal with category/subcategory selection
    - Document card grid with hover actions (download, delete)
    - Category filter dropdown with subcategory cascade
  - Status: VERIFIED - All 23 backend tests passed (100% success rate)

### Feb 22, 2026 (Session 4)
- **FEATURE**: Bottle Preview Phase 2 Enhancements
  - **Tabbed bottle view**: Added "Air Water Duo" (2 bottles) and "Air Water Single" tabs to switch between bottle images
  - **Rounded Square shape**: Added new logo shape option alongside Original, Circle, and Square
  - **Advanced background removal**: 
    - "Remove White Background" button for quick white/light background removal
    - "Pick Color from Logo" feature with eyedropper-style color selection
    - Tolerance slider (10-100) for fine-tuning color removal sensitivity
    - Color preview with RGB values display
  - Cropper dialog updated with "Rounded" crop shape option (20% corner radius)
  - Updated bottle templates to use actual Air Water product images
  - Status: VERIFIED - All 29 frontend tests passed (100% success rate)

### Feb 20, 2026 (Session 3)
- **FEATURE**: Enhanced Bottle Preview with Logo Editing Tools
  - Added logo cropping with react-easy-crop library
  - Shape changes: Original, Circle, Square options
  - Client-side background removal (threshold-based for white/light backgrounds)
  - Logo resizing with slider (30%-150% scale)
  - **Draggable logo positioning**: Click and drag logo on bottle to reposition
  - Position controls with X/Y coordinates and Reset to Center button
  - Touch support for mobile drag
  - Live preview updates on bottle template
  - Reset Edits and Reset All functionality
  - Download edited logo
  - Save to History integration
  - Updated bottle image to Nyla branded clear glass bottle
  - Status: VERIFIED - All 30 frontend tests passed (100% success rate)

- **FEATURE**: Master SKU List API and SKU Pricing Enhancements
  - Created `/api/master-skus` endpoint returning 14 standardized SKUs with category and unit info
  - Account Detail page: SKU dropdown now populated from master SKU API
  - Lead Detail page: Added "Proposed SKU Pricing" section for pre-sale pricing proposals
  - SKUs include: 20L Premium/Regular, bottle packs, Nyla variants (Silver, Gold, Sparkling), 24 Brand
  - Backend updated: `proposed_sku_pricing` field added to Lead model
  - Status: VERIFIED - All backend (10/10) and frontend (16/16) tests passed

- **FEATURE**: SKU Management Module with Full CRUD
  - New `/sku-management` page with complete SKU catalog management
  - MongoDB-backed storage (`master_skus` collection) - no hardcoded data
  - Full CRUD: Create, Read, Update, Soft-Delete SKUs
  - Features: Search, category filter, show/hide inactive toggle
  - SKUs grouped by category with color-coded badges
  - Reactivate deactivated SKUs functionality
  - Default 14 SKUs seeded on first load
  - All app components (Lead Detail, Account Detail, COGS Calculator) now use master list
  - Role-based access: CEO, Director, VP, National Sales Head only
  - Status: VERIFIED - Backend (20/20) and Frontend (17/17) tests passed

### Feb 19, 2026 (Session 2)
- **FEATURE**: Convert Lead to Account
  - Created Account entity with fields: account_id, account_name, contact info, location, SKU pricing, financial tracking
  - Account ID format: NAME4-CITY-AYY-SEQ (e.g., TOOP-HYD-A26-001)
  - Backend APIs: POST /api/accounts/convert-lead, GET/PUT/DELETE /api/accounts/:id, GET /api/accounts/:id/invoices
  - Frontend: Accounts List page with pagination, search, type filter
  - Frontend: Account Detail page with editable SKU pricing grid
  - LeadDetail page: "Convert to Account" button for won leads, "View Account" button for converted leads
  - Added "Accounts" to sidebar navigation
  - Status: VERIFIED - All 16 backend tests passed, all UI flows working

- **FEATURE**: Account Performance Report
  - Created `/api/reports/account-performance` endpoint with filters: time_filter, territory, state, city, account_type
  - Shows: Account name, Gross Invoice Total, Net Invoice Total, Bottle Credit, Contribution % (dynamic), Last Payment, Outstanding, Overdue
  - Contribution % calculated on-the-fly based on filtered total revenue
  - Added to Dashboard submenu alongside Resource Performance
  - Click on account row navigates to account detail
  - Status: VERIFIED - All 16 backend tests passed, all UI flows working

### Feb 19, 2026 (Session 1)
- **BUG FIX**: Lead creation form now validates region field properly
  - Root cause: Form used `user.territory` ("All India") which backend rejected
  - Fix: Added `getInitialRegion()` validation + frontend required field checks
  - Status: VERIFIED - All tests passed

- **BUG FIX**: Lead Discovery import not saving leads
  - Root cause: Silent failures in import loop, no per-item error handling
  - Fix: Added individual error tracking, accurate success/failure counts
  - Added "Re-import All" feature for updating existing leads
  - Status: VERIFIED - MTR lead imported successfully

- **BUG FIX**: Imported leads not showing in Leads list
  - Root cause: 40+ older leads had NULL `lead_id` (showing as "-" in table)
  - Fix: Ran database backfill script to generate lead_ids for all existing leads
  - Also fixed 3 leads with missing city field
  - Status: VERIFIED - All 59 leads now have proper Lead IDs

- **BUG FIX**: "Session expired" error during Lead Discovery import
  - Root cause: Redundant /api/auth/me call that could fail
  - Fix: Use AuthContext for user data, use centralized leadsAPI
  - Status: VERIFIED

- **FEATURE**: Implemented Server-Side Pagination
  - Root cause: Previous limit of 100 leads was not scalable
  - Fix: Full server-side pagination with PaginatedLeadsResponse model
  - Backend returns total count, current page, and page_size
  - Frontend fetches only current page with debounced search
  - Status: VERIFIED - Works with 63 leads across 3 pages

- **FEATURE**: Implemented Backend APIs for Performance Dashboards
  - Created `/api/reports/sku-performance` endpoint
  - Created `/api/reports/resource-performance` endpoint
  - Status: VERIFIED - Both dashboards showing real data

### Previous Session (from handoff)
- Resolved critical Babel/dev server error (craco.config.js fix)
- Dashboard navigation overhaul (single dropdown menu)
- Created SKU Performance and Resource Performance pages
- Redesigned Sales Overview page (chart-less, card-based)
- Standardized SKUs and Partner-Sales role logic
- Fixed CORS configuration for deployment

---

## Current Architecture
```
/app/
├── backend/
│   └── server.py         # FastAPI with MongoDB, Files & Documents APIs
├── frontend/
│   ├── craco.config.js   # Babel fix applied
│   └── src/
│       ├── pages/
│       │   ├── AddEditLead.js      # Lead form with validation
│       │   ├── LeadDetail.js       # Convert to Account button
│       │   ├── AccountsList.js     # Accounts list with pagination
│       │   ├── AccountDetail.js    # Account detail with SKU pricing
│       │   ├── FilesDocuments.js   # NEW: Files & Documents management
│       │   ├── Dashboard.js        # Sales Overview
│       │   ├── SKUPerformance.js   # Live data
│       │   ├── ResourcePerformance.js # Live data
│       │   └── BottlePreview.js    # Logo editing tools
│       ├── utils/
│       │   └── api.js              # filesAPI added
│       └── layouts/
│           └── DashboardLayout.js  # Files & Documents nav added
└── memory/
    └── PRD.md (this file)
```

---

## Prioritized Backlog

### P0 - Critical
1. ~~Lead creation bug~~ ✅ FIXED
2. ~~SKU/Resource Performance dashboards~~ ✅ IMPLEMENTED
3. ~~Convert Lead to Account feature~~ ✅ IMPLEMENTED
4. ~~Bottle Preview Enhancement Phase 1~~ ✅ IMPLEMENTED (cropping, shapes, bg removal, resize)
5. ~~Bottle Preview Enhancement Phase 2~~ ✅ IMPLEMENTED (tabbed bottles, rounded square, color picker bg removal)
6. ~~Files & Documents Module~~ ✅ IMPLEMENTED (categories, subcategories, upload, download, permissions)
7. ~~Brand Comparison Calculator~~ ✅ IMPLEMENTED (return credit per-bottle & total sample display, 75% default bottle return)
8. ~~Team Activity Tracking~~ ✅ IMPLEMENTED (last active, session time, pages visited, actions performed)
9. ~~PWA Support~~ ✅ IMPLEMENTED (installable, offline support, push notifications)
10. ~~Accounts List Redesign~~ ✅ IMPLEMENTED (filters, stats cards, new columns, visual overhaul)
11. ~~Digital Signature on Approved Proposals~~ ✅ IMPLEMENTED (auto-stamp PDF with approver name & date)
12. ~~Partner - Sales Role Permissions~~ ✅ IMPLEMENTED (aligned with Regional Sales Manager)
13. ~~Leads Kanban Board~~ ✅ IMPLEMENTED (drag-drop pipeline with activity logging)
14. ~~Sales/Production Context Switching~~ ✅ IMPLEMENTED (context switcher, department field, production modules)
15. ~~Server-Side Filtering for Leads List~~ ✅ FIXED (time_filter, territory, assigned_to filters now server-side)
16. ~~Home Dashboard~~ ✅ IMPLEMENTED (action-oriented landing page with tasks, meetings, leads, performance)
17. ~~HomeDashboard.js Refactoring~~ ✅ COMPLETED (Feb 28, 2026) - Extracted 10 reusable widget components

### P1 - High Priority
- Build out Production modules (Maintenance, Inventory, Quality Control, Assets, Vendors) - currently placeholders
- Implement Invoices functionality for Accounts
- Re-implement Grid View for Sales Targets module

### P2 - Medium Priority
- User verification for Custom Proposal Template
- Google Workspace authentication as alternative login
- Refactor `/app/backend/server.py` into smaller APIRouter modules

### P3 - Low Priority/Future
- Additional report customizations
- Mobile responsiveness improvements

---

## Test Credentials
- **Email**: admin@nylaairwater.earth
- **Password**: admin123

## 3rd Party Integrations
- Claude Sonnet 4.5 (Emergent LLM Key) - Text revision
- Google Places API - Lead Discovery
- Google Workspace OAuth - Authentication (pending)
- ActiveMQ - Invoice processing
