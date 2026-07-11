import React, { lazy, Suspense } from 'react';
import { BrowserRouter, Routes, Route, Navigate, useLocation } from 'react-router-dom';
import { AuthProvider, useAuth } from './context/AuthContext';
import { AppContextProvider, useAppContext } from './context/AppContextContext';
import { ThemeProvider } from './context/ThemeContext';
import { TenantConfigProvider, useTenantConfig } from './context/TenantConfigContext';
import { Toaster } from './components/ui/sonner';
import axios from 'axios';
import DashboardLayout from './layouts/DashboardLayout';
import SplashScreen from './pages/SplashScreen';
import Login from './pages/Login';
import RegisterTenant from './pages/RegisterTenant';
import AuthCallback from './components/AuthCallback';
import GoogleAuthCallback from './pages/GoogleAuthCallback';
const Dashboard = lazy(() => import('./pages/Dashboard'));
const HomeDashboard = lazy(() => import('./pages/HomeDashboard'));
const DistributorHome = lazy(() => import('./pages/DistributorHome'));

// CRITICAL: Configure axios to always send credentials (cookies) with all requests
axios.defaults.withCredentials = true;

// CRITICAL: Always include X-Tenant-ID + Authorization header on all API requests.
// This interceptor runs BEFORE the one in AuthContext, ensuring tenant + token are
// always set even on calls made before AuthProvider mounts.
axios.interceptors.request.use((config) => {
  // Tenant header
  if (!config.headers['X-Tenant-ID']) {
    const tenantId = localStorage.getItem('selectedTenant') || 'nyla-air-water';
    config.headers['X-Tenant-ID'] = tenantId;
  }
  // Auth header — auto-attach from localStorage if not already set by caller
  if (!config.headers['Authorization'] && !config.headers['authorization']) {
    const token = localStorage.getItem('token');
    if (token) config.headers['Authorization'] = `Bearer ${token}`;
  }
  return config;
});
const LeadsList = lazy(() => import('./pages/LeadsList'));
const LeadsKanban = lazy(() => import('./pages/LeadsKanban'));
const LeadDetail = lazy(() => import('./pages/LeadDetail'));
const AddEditLead = lazy(() => import('./pages/AddEditLead'));
const FollowUps = lazy(() => import('./pages/FollowUps'));
const Reports = lazy(() => import('./pages/Reports'));
const LocationAnalytics = lazy(() => import('./pages/LocationAnalytics'));
const TeamManagement = lazy(() => import('./pages/TeamManagement'));
const DailyStatusUpdate = lazy(() => import('./pages/DailyStatusUpdate'));
const MeetingMinutes = lazy(() => import('./pages/MeetingMinutes'));
const MeetingDetail = lazy(() => import('./pages/MeetingDetail'));
const MeetingEdit = lazy(() => import('./pages/MeetingEdit'));
const CostCards = lazy(() => import('./pages/CostCards'));
const StatusSummary = lazy(() => import('./pages/StatusSummary'));
const DashboardPreview = lazy(() => import('./pages/DashboardPreview'));
const BottlePreview = lazy(() => import('./pages/BottlePreview'));
const LeaveManagement = lazy(() => import('./pages/LeaveManagement'));
const TargetPlanningList = lazy(() => import('./pages/TargetPlanningList'));
const TargetPlanDashboard = lazy(() => import('./pages/TargetPlanDashboard'));
const ReportsPage = lazy(() => import('./pages/ReportsPage'));
const SalesPortal = lazy(() => import('./pages/SalesPortal'));
const LeadDiscovery = lazy(() => import('./pages/LeadDiscovery'));
const COGSCalculator = lazy(() => import('./pages/COGSCalculator'));
const SalesRevenueDashboard = lazy(() => import('./pages/SalesRevenueDashboard'));
const SKUPerformance = lazy(() => import('./pages/SKUPerformance'));
const ResourcePerformance = lazy(() => import('./pages/ResourcePerformance'));
const AccountsList = lazy(() => import('./pages/AccountsList'));
const AccountSKUPricing = lazy(() => import('./pages/AccountSKUPricing'));
const CustomerComplaints = lazy(() => import('./pages/CustomerComplaints'));
const CustomerComplaintDetail = lazy(() => import('./pages/CustomerComplaintDetail'));
const GammaGenerator = lazy(() => import('./pages/GammaGenerator'));
const MasterCOGSComponents = lazy(() => import('./pages/MasterCOGSComponents'));
const AdminSkuMigrate = lazy(() => import('./pages/AdminSkuMigrate'));
const VehiclesList = lazy(() => import('./pages/admin/VehiclesList'));
const DriversList = lazy(() => import('./pages/admin/DriversList'));
const ReversalsAudit = lazy(() => import('./pages/admin/ReversalsAudit'));
const DeliveryOrders = lazy(() => import('./pages/DeliveryOrders'));
const DeliverySchedulesList = lazy(() => import('./pages/distributor/DeliverySchedulesList'));
const DeliveryScheduleDetail = lazy(() => import('./pages/distributor/DeliveryScheduleDetail'));
const DriverLogin = lazy(() => import('./pages/driver/DriverLogin'));
const DriverSchedules = lazy(() => import('./pages/driver/DriverApp').then(m => ({ default: m.DriverSchedules })));
const DriverScheduleDetail = lazy(() => import('./pages/driver/DriverApp').then(m => ({ default: m.DriverScheduleDetail })));
const AccountDetail = lazy(() => import('./pages/AccountDetail'));
const AccountPerformance = lazy(() => import('./pages/AccountPerformance'));
const RevenueAnalytics = lazy(() => import('./pages/RevenueAnalytics'));
const AccountingMasters = lazy(() => import('./pages/AccountingMasters'));
const VendorTypes = lazy(() => import('./pages/VendorTypes'));
const VendorsAccounting = lazy(() => import('./pages/VendorsAccounting'));
const EmployeesAccounting = lazy(() => import('./pages/EmployeesAccounting'));
const AccountingTransactions = lazy(() => import('./pages/AccountingTransactions'));
const InvoicesList = lazy(() => import('./pages/InvoicesList'));
const CustomerReturnsList = lazy(() => import('./pages/CustomerReturnsList'));
const TransportationCostCalculator = lazy(() => import('./pages/TransportationCostCalculator'));
const SKUManagement = lazy(() => import('./pages/SKUManagement'));
const SkuRelinkTool = lazy(() => import('./pages/SkuRelinkTool'));
const BatchGenealogy = lazy(() => import('./pages/BatchGenealogy'));
const PackagingTypes = lazy(() => import('./pages/PackagingTypes'));
const CompanyProfile = lazy(() => import('./pages/CompanyProfile'));
const FilesDocuments = lazy(() => import('./pages/FilesDocuments'));
// Production Context Pages
const Maintenance = lazy(() => import('./pages/Maintenance'));
const Inventory = lazy(() => import('./pages/Inventory'));
const PublicContactCard = lazy(() => import('./pages/PublicContactCard'));
const QualityControl = lazy(() => import('./pages/QualityControl'));
const ProductionBatches = lazy(() => import('./pages/ProductionBatches'));
const ProductionDashboard = lazy(() => import('./pages/ProductionDashboard'));
const BatchDetail = lazy(() => import('./pages/BatchDetail'));
const QCRouteConfig = lazy(() => import('./pages/QCRouteConfig'));
const RejectionReasons = lazy(() => import('./pages/RejectionReasons'));
const RejectionReport = lazy(() => import('./pages/RejectionReport'));
const RejectionCostConfig = lazy(() => import('./pages/RejectionCostConfig'));
const QCTeam = lazy(() => import('./pages/QCTeam'));
const Assets = lazy(() => import('./pages/Assets'));
const Vendors = lazy(() => import('./pages/Vendors'));
const MasterLocations = lazy(() => import('./pages/MasterLocations'));
const MasterLeadStatus = lazy(() => import('./pages/MasterLeadStatus'));
const MasterBusinessCategories = lazy(() => import('./pages/MasterBusinessCategories'));
const TravelRequest = lazy(() => import('./pages/TravelRequest'));
const BudgetRequest = lazy(() => import('./pages/BudgetRequest'));
const ExpenseCategoryMaster = lazy(() => import('./pages/ExpenseCategoryMaster'));
const CompanyDocuments = lazy(() => import('./pages/CompanyDocuments'));
const MasterContactCategories = lazy(() => import('./pages/MasterContactCategories'));
const ContactsList = lazy(() => import('./pages/ContactsList'));
const TenantSettings = lazy(() => import('./pages/TenantSettings'));
const ProposalTemplateSettings = lazy(() => import('./pages/ProposalTemplateSettings'));
const ApiKeysPage = lazy(() => import('./pages/ApiKeysPage'));
const ZohoIntegration = lazy(() => import('./pages/ZohoIntegration'));
const SlackSettings = lazy(() => import('./pages/SlackSettings'));
const GoogleDriveSettings = lazy(() => import('./pages/GoogleDriveSettings'));
const StateMachines = lazy(() => import('./pages/StateMachines'));
const NotificationTemplates = lazy(() => import('./pages/NotificationTemplates'));
const PlatformAdmin = lazy(() => import('./pages/PlatformAdmin'));
const KnowledgeBase = lazy(() => import('./pages/KnowledgeBase'));
const LeadScoringModel = lazy(() => import('./pages/LeadScoringModel'));
// Distribution Module
const DistributorList = lazy(() => import('./pages/DistributorList'));
const DistributorDetail = lazy(() => import('./pages/DistributorDetail'));
const StockTransfers = lazy(() => import('./pages/StockTransfers'));
const StockDashboard = lazy(() => import('./pages/StockDashboard'));
const TaskManagement = lazy(() => import('./pages/TaskManagement'));
const TaskDetail = lazy(() => import('./pages/TaskDetail'));
const PerformanceTracker = lazy(() => import('./pages/PerformanceTracker'));
const EmailTemplates = lazy(() => import('./pages/EmailTemplates'));
const NotificationSettings = lazy(() => import('./pages/NotificationSettings'));
const ShareRecipientSettings = lazy(() => import('./pages/ShareRecipientSettings'));
const InvestorDashboard = lazy(() => import('./pages/InvestorDashboard'));
// Marketing Module
const MarketingCalendar = lazy(() => import('./pages/MarketingCalendar'));
const MarketingMasters = lazy(() => import('./pages/MarketingMasters'));
const MarketingRequestTypeMasters = lazy(() => import('./pages/MarketingRequestTypeMasters'));
const MarketingPostDetail = lazy(() => import('./pages/MarketingPostDetail'));
// New Marketing Requests Module (Sales -> Marketing -> Delivery)
const MarketingRequests = lazy(() => import('./pages/MarketingRequests'));
const NewMarketingRequest = lazy(() => import('./pages/NewMarketingRequest'));
const MarketingRequestDetail = lazy(() => import('./pages/MarketingRequestDetail'));
const DesignRequestsNew = lazy(() => import('./pages/DesignRequestsNew'));
const NewDesignRequestNew = lazy(() => import('./pages/NewDesignRequestNew'));
const DesignRequestNewDetail = lazy(() => import('./pages/DesignRequestNewDetail'));
const PrintRequests = lazy(() => import('./pages/PrintRequests'));
const PrintRequestDetail = lazy(() => import('./pages/PrintRequestDetail'));
const PrintRequestSettings = lazy(() => import('./pages/PrintRequestSettings'));
// Personal Calendar (per-user, with Google Calendar sync)
const PersonalCalendar = lazy(() => import('./pages/PersonalCalendar'));
const Mail = lazy(() => import('./pages/Mail'));
import '@/App.css';
import { useActivityTracker } from './hooks/useActivityTracker';
import { NavigationProvider } from './context/NavigationContext';

function ActivityTrackerWrapper({ children }) {
  useActivityTracker();
  return children;
}

function ProtectedRoute({ children, moduleKey, appModule }) {
  const { user, loading } = useAuth();
  const { isModuleEnabled, hasRolePermission, loading: configLoading } = useTenantConfig();
  const { canAccessSales, canAccessProduction, canAccessDistribution, canAccessMarketing } = useAppContext();
  const location = useLocation();

  if (loading || configLoading) {
    return <div className="min-h-screen flex items-center justify-center">Loading...</div>;
  }

  if (!user) {
    return <Navigate to="/login" replace />;
  }

  // Check if module is enabled at tenant level (if moduleKey is provided)
  if (moduleKey && !isModuleEnabled(moduleKey)) {
    return (
      <DashboardLayout>
        <div className="min-h-[60vh] flex items-center justify-center">
          <div className="text-center p-8 max-w-md">
            <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-muted flex items-center justify-center">
              <svg className="w-8 h-8 text-muted-foreground" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m0 0v2m0-2h2m-2 0H10m4-6V9a2 2 0 00-2-2H8a2 2 0 00-2 2v2m8 0H6m8 0a2 2 0 012 2v6a2 2 0 01-2 2H8a2 2 0 01-2-2v-6a2 2 0 012-2" />
              </svg>
            </div>
            <h2 className="text-xl font-semibold text-foreground mb-2">Module Not Available</h2>
            <p className="text-muted-foreground mb-4">
              This feature has been disabled by your administrator. Contact your admin to enable it.
            </p>
            <button 
              onClick={() => window.history.back()}
              className="px-4 py-2 bg-primary text-primary-foreground rounded-lg hover:bg-primary/90 transition-colors"
            >
              Go Back
            </button>
          </div>
        </div>
      </DashboardLayout>
    );
  }

  // Enforce role-permission at route level (URL-jump protection).
  // The Role Management UI is the sole source of truth for who can see what;
  // if the user's role does not grant view on this module, block access.
  // Distributor role is exempt — they have their own portal with its own guards.
  if (moduleKey && user?.role !== 'Distributor' && !hasRolePermission(moduleKey)) {
    return (
      <DashboardLayout>
        <div className="min-h-[60vh] flex items-center justify-center">
          <div className="text-center p-8 max-w-md">
            <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-amber-100 flex items-center justify-center">
              <svg className="w-8 h-8 text-amber-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
            </div>
            <h2 className="text-xl font-semibold text-foreground mb-2">Access Denied</h2>
            <p className="text-muted-foreground mb-4">
              Your role does not have permission to view this page. Ask an admin to enable it under Role Management.
            </p>
            <button
              onClick={() => window.history.back()}
              className="px-4 py-2 bg-primary text-primary-foreground rounded-lg hover:bg-primary/90 transition-colors"
            >
              Go Back
            </button>
          </div>
        </div>
      </DashboardLayout>
    );
  }

  // Cross-module access guard: pages tagged with an `appModule` are only
  // reachable when the user's department/role grants access to that module.
  // Prevents e.g. a Regional Sales Manager (Sales dept) from URL-jumping
  // into Distribution pages.
  if (appModule) {
    const allowed = {
      sales: canAccessSales,
      production: canAccessProduction,
      distribution: canAccessDistribution,
      marketing: canAccessMarketing,
    }[appModule];
    if (!allowed) {
      return (
        <DashboardLayout>
          <div className="min-h-[60vh] flex items-center justify-center">
            <div className="text-center p-8 max-w-md">
              <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-amber-100 flex items-center justify-center">
                <svg className="w-8 h-8 text-amber-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
              </div>
              <h2 className="text-xl font-semibold text-foreground mb-2">Access Denied</h2>
              <p className="text-muted-foreground mb-4">
                You don&apos;t have permission to view this page. Contact your administrator if you believe this is a mistake.
              </p>
              <button
                onClick={() => window.history.back()}
                className="px-4 py-2 bg-primary text-primary-foreground rounded-lg hover:bg-primary/90 transition-colors"
              >
                Go Back
              </button>
            </div>
          </div>
        </DashboardLayout>
      );
    }
  }

  return (
    <DashboardLayout>
      <ActivityTrackerWrapper>
        {children}
      </ActivityTrackerWrapper>
    </DashboardLayout>
  );
}

function App() {
  return (
    <ThemeProvider>
      <AuthProvider>
        <TenantConfigProvider>
          <AppContextProvider>
            <BrowserRouter>
              <NavigationProvider>
                <AppRouter />
              </NavigationProvider>
            </BrowserRouter>
          </AppContextProvider>
        </TenantConfigProvider>
      </AuthProvider>
    </ThemeProvider>
  );
}

function AppRouter() {
  const location = useLocation();
  
  // Check URL fragment for session_id (OAuth callback)
  // CRITICAL: Do this during render, not in useEffect
  if (location.hash?.includes('session_id=')) {
    return <AuthCallback />;
  }

  return (
    <>
      <Suspense fallback={<div className="min-h-screen flex items-center justify-center text-muted-foreground">Loading…</div>}>
      <Routes>
          <Route path="/" element={<SplashScreen />} />
          <Route path="/login" element={<Login />} />
          <Route path="/register" element={<RegisterTenant />} />
          <Route path="/auth/callback" element={<GoogleAuthCallback />} />

          {/* Public, no-login contact share card */}
          <Route path="/c/:token" element={<PublicContactCard />} />

          {/* Driver mobile-web app — own login, own minimal layout (no DashboardLayout) */}
          <Route path="/driver/login" element={<DriverLogin />} />
          <Route path="/driver" element={<DriverSchedules />} />
          <Route path="/driver/schedules" element={<DriverSchedules />} />
          <Route path="/driver/schedules/:id" element={<DriverScheduleDetail />} />
          
          <Route path="/home" element={<ProtectedRoute moduleKey="home"><HomeDashboard /></ProtectedRoute>} />
          <Route path="/dashboard" element={<ProtectedRoute moduleKey="dashboard"><Dashboard /></ProtectedRoute>} />
          <Route path="/dashboard-preview" element={<ProtectedRoute moduleKey="dashboard"><DashboardPreview /></ProtectedRoute>} />
          <Route path="/leads" element={<ProtectedRoute moduleKey="leads"><LeadsList /></ProtectedRoute>} />
          <Route path="/leads/kanban" element={<ProtectedRoute moduleKey="pipeline"><LeadsKanban /></ProtectedRoute>} />
          <Route path="/leads/new" element={<ProtectedRoute moduleKey="leads"><AddEditLead /></ProtectedRoute>} />
          <Route path="/leads/:id" element={<ProtectedRoute moduleKey="leads"><LeadDetail /></ProtectedRoute>} />
          <Route path="/leads/:id/edit" element={<ProtectedRoute moduleKey="leads"><AddEditLead /></ProtectedRoute>} />
          <Route path="/follow-ups" element={<ProtectedRoute moduleKey="leads"><FollowUps /></ProtectedRoute>} />
          <Route path="/reports" element={<ProtectedRoute><Reports /></ProtectedRoute>} />
          <Route path="/locations" element={<ProtectedRoute><LocationAnalytics /></ProtectedRoute>} />
          <Route path="/team" element={<ProtectedRoute moduleKey="team"><TeamManagement /></ProtectedRoute>} />
          <Route path="/daily-status" element={<ProtectedRoute moduleKey="daily_status"><DailyStatusUpdate /></ProtectedRoute>} />
          <Route path="/meeting-minutes" element={<ProtectedRoute moduleKey="meeting_minutes"><MeetingMinutes /></ProtectedRoute>} />
          <Route path="/meeting-minutes/new" element={<ProtectedRoute moduleKey="meeting_minutes"><MeetingEdit /></ProtectedRoute>} />
          <Route path="/meeting-minutes/:id" element={<ProtectedRoute moduleKey="meeting_minutes"><MeetingDetail /></ProtectedRoute>} />
          <Route path="/meeting-minutes/:id/edit" element={<ProtectedRoute moduleKey="meeting_minutes"><MeetingEdit /></ProtectedRoute>} />
          <Route path="/status-summary" element={<ProtectedRoute moduleKey="status_summary"><StatusSummary /></ProtectedRoute>} />
          <Route path="/bottle-preview" element={<ProtectedRoute moduleKey="bottle_preview"><BottlePreview /></ProtectedRoute>} />
          <Route path="/leaves" element={<ProtectedRoute moduleKey="leaves"><LeaveManagement /></ProtectedRoute>} />
          <Route path="/travel-requests" element={<ProtectedRoute moduleKey="travel_requests"><TravelRequest /></ProtectedRoute>} />
          <Route path="/budget-requests" element={<ProtectedRoute moduleKey="budget_requests"><BudgetRequest /></ProtectedRoute>} />
          <Route path="/target-planning" element={<ProtectedRoute moduleKey="target_planning"><TargetPlanningList /></ProtectedRoute>} />
          <Route path="/target-planning/:planId/edit" element={<ProtectedRoute moduleKey="target_planning"><TargetPlanningList /></ProtectedRoute>} />
          <Route path="/target-planning/:planId" element={<ProtectedRoute moduleKey="target_planning"><TargetPlanDashboard /></ProtectedRoute>} />
          <Route path="/reports-new" element={<ProtectedRoute><ReportsPage /></ProtectedRoute>} />
          <Route path="/sales-portal" element={<ProtectedRoute moduleKey="sales_portal"><SalesPortal /></ProtectedRoute>} />
          <Route path="/lead-discovery" element={<ProtectedRoute moduleKey="lead_discovery"><LeadDiscovery /></ProtectedRoute>} />
          <Route path="/cogs-calculator" element={<ProtectedRoute moduleKey="cogs_calculator"><COGSCalculator /></ProtectedRoute>} />
          <Route path="/sales-revenue" element={<ProtectedRoute moduleKey="report_revenue"><SalesRevenueDashboard /></ProtectedRoute>} />
          <Route path="/revenue-analytics" element={<ProtectedRoute moduleKey="report_revenue_analytics"><RevenueAnalytics /></ProtectedRoute>} />
          <Route path="/sku-performance" element={<ProtectedRoute moduleKey="report_sku_performance"><SKUPerformance /></ProtectedRoute>} />
          <Route path="/resource-performance" element={<ProtectedRoute moduleKey="report_resource_performance"><ResourcePerformance /></ProtectedRoute>} />
          <Route path="/email-templates" element={<ProtectedRoute moduleKey="email_templates"><EmailTemplates /></ProtectedRoute>} />
          <Route path="/notification-settings" element={<ProtectedRoute moduleKey="notification_settings"><NotificationSettings /></ProtectedRoute>} />
          <Route path="/settings/share-recipients" element={<ProtectedRoute moduleKey="share_recipients"><ShareRecipientSettings /></ProtectedRoute>} />
          <Route path="/accounts" element={<ProtectedRoute moduleKey="accounts"><AccountsList /></ProtectedRoute>} />
          <Route path="/accounts/sku-pricing" element={<ProtectedRoute moduleKey="accounts"><AccountSKUPricing /></ProtectedRoute>} />
          <Route path="/complaints" element={<ProtectedRoute moduleKey="customer_complaints"><CustomerComplaints /></ProtectedRoute>} />
          <Route path="/complaints/:id" element={<ProtectedRoute moduleKey="customer_complaints"><CustomerComplaintDetail /></ProtectedRoute>} />
          <Route path="/gamma-generator" element={<ProtectedRoute moduleKey="gamma_generator"><GammaGenerator /></ProtectedRoute>} />
          <Route path="/master/cogs-components" element={<ProtectedRoute moduleKey="cogs_components"><MasterCOGSComponents /></ProtectedRoute>} />
          <Route path="/admin/sku-migrate" element={<ProtectedRoute moduleKey="admin"><AdminSkuMigrate /></ProtectedRoute>} />
          <Route path="/admin/vehicles" element={<ProtectedRoute moduleKey="fleet_vehicles"><VehiclesList /></ProtectedRoute>} />
          <Route path="/admin/drivers" element={<ProtectedRoute moduleKey="fleet_drivers"><DriversList /></ProtectedRoute>} />
          <Route path="/admin/reversals" element={<ProtectedRoute moduleKey="reversals_log"><ReversalsAudit /></ProtectedRoute>} />
          <Route path="/distributor/delivery-schedules" element={<ProtectedRoute><DeliverySchedulesList /></ProtectedRoute>} />
          <Route path="/distributor/delivery-schedules/:id" element={<ProtectedRoute><DeliveryScheduleDetail /></ProtectedRoute>} />
          <Route path="/accounts/:id" element={<ProtectedRoute moduleKey="accounts"><AccountDetail /></ProtectedRoute>} />
          <Route path="/invoices" element={<ProtectedRoute moduleKey="invoices"><InvoicesList /></ProtectedRoute>} />
          <Route path="/customer-returns" element={<ProtectedRoute moduleKey="customer_returns"><CustomerReturnsList /></ProtectedRoute>} />
          <Route path="/account-performance" element={<ProtectedRoute moduleKey="report_account_performance"><AccountPerformance /></ProtectedRoute>} />
          <Route path="/transportation-calculator" element={<ProtectedRoute moduleKey="transport_calculator"><TransportationCostCalculator /></ProtectedRoute>} />
          <Route path="/sku-management" element={<ProtectedRoute moduleKey="sku_management"><SKUManagement /></ProtectedRoute>} />
          <Route path="/sku-management/relink" element={<ProtectedRoute moduleKey="sku_management"><SkuRelinkTool /></ProtectedRoute>} />
          <Route path="/admin/batch-genealogy" element={<ProtectedRoute moduleKey="batch_genealogy"><BatchGenealogy /></ProtectedRoute>} />
          <Route path="/admin/batch-genealogy/:batchId" element={<ProtectedRoute moduleKey="batch_genealogy"><BatchGenealogy /></ProtectedRoute>} />
          <Route path="/packaging-types" element={<ProtectedRoute moduleKey="sku_management"><PackagingTypes /></ProtectedRoute>} />
          <Route path="/company-profile" element={<ProtectedRoute moduleKey="company_profile"><CompanyProfile /></ProtectedRoute>} />
          <Route path="/files-documents" element={<ProtectedRoute moduleKey="files_documents"><FilesDocuments /></ProtectedRoute>} />
          <Route path="/master-locations" element={<ProtectedRoute moduleKey="master_locations"><MasterLocations /></ProtectedRoute>} />
          <Route path="/master-lead-status" element={<ProtectedRoute moduleKey="lead_statuses"><MasterLeadStatus /></ProtectedRoute>} />
          <Route path="/master-business-categories" element={<ProtectedRoute moduleKey="business_categories"><MasterBusinessCategories /></ProtectedRoute>} />
          <Route path="/expense-category-master" element={<ProtectedRoute moduleKey="expense_categories"><ExpenseCategoryMaster /></ProtectedRoute>} />
          <Route path="/company-documents" element={<ProtectedRoute moduleKey="company_documents"><CompanyDocuments /></ProtectedRoute>} />
          <Route path="/master-contact-categories" element={<ProtectedRoute moduleKey="contact_categories"><MasterContactCategories /></ProtectedRoute>} />
          <Route path="/contacts" element={<ProtectedRoute moduleKey="contacts"><ContactsList /></ProtectedRoute>} />
          <Route path="/delivery-orders" element={<ProtectedRoute moduleKey="delivery_orders"><DeliveryOrders /></ProtectedRoute>} />
          <Route path="/tenant-settings" element={<ProtectedRoute moduleKey="tenant_settings"><TenantSettings /></ProtectedRoute>} />
          <Route path="/proposal-template" element={<ProtectedRoute moduleKey="proposal_template"><ProposalTemplateSettings /></ProtectedRoute>} />
          <Route path="/admin/slack" element={<ProtectedRoute moduleKey="slack_integration"><SlackSettings /></ProtectedRoute>} />
          <Route path="/admin/google-drive" element={<ProtectedRoute moduleKey="google_drive_integration"><GoogleDriveSettings /></ProtectedRoute>} />
          <Route path="/admin/state-machines" element={<ProtectedRoute moduleKey="state_machines"><StateMachines /></ProtectedRoute>} />
          <Route path="/admin/notification-templates" element={<ProtectedRoute moduleKey="notification_templates"><NotificationTemplates /></ProtectedRoute>} />
          <Route path="/settings/api-keys" element={<ProtectedRoute moduleKey="api_keys"><ApiKeysPage /></ProtectedRoute>} />
          <Route path="/settings/integrations/zoho" element={<ProtectedRoute moduleKey="zoho_integration"><ZohoIntegration /></ProtectedRoute>} />
          <Route path="/platform-admin" element={<ProtectedRoute><PlatformAdmin /></ProtectedRoute>} />
          <Route path="/knowledge-base" element={<ProtectedRoute moduleKey="knowledge_base"><KnowledgeBase /></ProtectedRoute>} />
          <Route path="/lead-scoring-model" element={<ProtectedRoute moduleKey="lead_scoring"><LeadScoringModel /></ProtectedRoute>} />
          
          {/* Production Context Routes */}
          <Route path="/production-dashboard" element={<ProtectedRoute moduleKey="production_dashboard"><ProductionDashboard /></ProtectedRoute>} />
          <Route path="/maintenance" element={<ProtectedRoute moduleKey="maintenance"><Maintenance /></ProtectedRoute>} />
          <Route path="/inventory" element={<ProtectedRoute moduleKey="inventory"><Inventory /></ProtectedRoute>} />
          <Route path="/quality-control" element={<ProtectedRoute moduleKey="quality_control"><QualityControl /></ProtectedRoute>} />
          <Route path="/production-batches" element={<ProtectedRoute moduleKey="production_batches"><ProductionBatches /></ProtectedRoute>} />
          <Route path="/production-batches/:batchId" element={<ProtectedRoute moduleKey="production_batches"><BatchDetail /></ProtectedRoute>} />
          <Route path="/qc-routes" element={<ProtectedRoute moduleKey="qc_routes"><QCRouteConfig /></ProtectedRoute>} />
          <Route path="/rejection-reasons" element={<ProtectedRoute moduleKey="rejection_reasons"><RejectionReasons /></ProtectedRoute>} />
          <Route path="/rejection-report" element={<ProtectedRoute moduleKey="rejection_report"><RejectionReport /></ProtectedRoute>} />
          <Route path="/production/rejection-cost-config" element={<ProtectedRoute moduleKey="rejection_cost_config"><RejectionCostConfig /></ProtectedRoute>} />
          <Route path="/qc-team" element={<ProtectedRoute moduleKey="qc_team"><QCTeam /></ProtectedRoute>} />
          <Route path="/assets" element={<ProtectedRoute moduleKey="assets"><Assets /></ProtectedRoute>} />
          <Route path="/vendors" element={<ProtectedRoute moduleKey="vendors"><Vendors /></ProtectedRoute>} />
          
          {/* Distribution Module Routes */}
          <Route path="/distributor-home" element={<ProtectedRoute><DistributorHome /></ProtectedRoute>} />
          <Route path="/distributors" element={<ProtectedRoute moduleKey="distributors" appModule="distribution"><DistributorList /></ProtectedRoute>} />
          <Route path="/distributors/:id" element={<ProtectedRoute moduleKey="distributors" appModule="distribution"><DistributorDetail /></ProtectedRoute>} />
          <Route path="/distributors/:id/edit" element={<ProtectedRoute moduleKey="distributors" appModule="distribution"><DistributorDetail /></ProtectedRoute>} />
          <Route path="/distributor/stock-transfers" element={<ProtectedRoute moduleKey="stock_transfers" appModule="distribution"><StockTransfers /></ProtectedRoute>} />
          <Route path="/accounting/masters" element={<ProtectedRoute moduleKey="accounting_masters"><AccountingMasters group="expense" /></ProtectedRoute>} />
          <Route path="/accounting/income-masters" element={<ProtectedRoute moduleKey="accounting_income_masters"><AccountingMasters group="income" /></ProtectedRoute>} />
          <Route path="/accounting/transactions" element={<ProtectedRoute moduleKey="accounting_transactions"><AccountingTransactions /></ProtectedRoute>} />
          <Route path="/accounting/vendors" element={<ProtectedRoute moduleKey="accounting_vendors"><VendorsAccounting /></ProtectedRoute>} />
          <Route path="/accounting/employees" element={<ProtectedRoute moduleKey="accounting_employees"><EmployeesAccounting /></ProtectedRoute>} />
          <Route path="/admin/vendor-types" element={<ProtectedRoute moduleKey="vendor_types"><VendorTypes /></ProtectedRoute>} />
          <Route path="/stock-dashboard" element={<ProtectedRoute moduleKey="distributors" appModule="distribution"><StockDashboard /></ProtectedRoute>} />
          <Route path="/cost-cards" element={<ProtectedRoute moduleKey="distributors" appModule="distribution"><CostCards /></ProtectedRoute>} />
          
          {/* Task Management */}
          <Route path="/tasks" element={<ProtectedRoute moduleKey="task_management"><TaskManagement /></ProtectedRoute>} />
          <Route path="/tasks/:taskId" element={<ProtectedRoute moduleKey="task_management"><TaskDetail /></ProtectedRoute>} />
          <Route path="/performance" element={<ProtectedRoute moduleKey="performance_tracker"><PerformanceTracker /></ProtectedRoute>} />
          <Route path="/investor-dashboard" element={<ProtectedRoute moduleKey="investor_dashboard"><InvestorDashboard /></ProtectedRoute>} />
          {/* Marketing Module */}
          <Route path="/marketing-calendar" element={<ProtectedRoute moduleKey="marketing_calendar"><MarketingCalendar /></ProtectedRoute>} />
          <Route path="/marketing-post/:postId" element={<ProtectedRoute moduleKey="marketing_calendar"><MarketingPostDetail /></ProtectedRoute>} />
          <Route path="/marketing-masters" element={<ProtectedRoute moduleKey="marketing_masters"><MarketingMasters /></ProtectedRoute>} />
          <Route path="/admin/request-types" element={<ProtectedRoute moduleKey="marketing_request_types"><MarketingRequestTypeMasters /></ProtectedRoute>} />
          {/* New Marketing Requests Module (Sales raises -> Marketing fulfils -> Delivery produces) */}
          <Route path="/marketing-requests" element={<ProtectedRoute moduleKey="marketing_requests"><MarketingRequests /></ProtectedRoute>} />
          <Route path="/marketing-requests/new" element={<ProtectedRoute moduleKey="marketing_requests"><NewMarketingRequest /></ProtectedRoute>} />
          <Route path="/marketing-requests/:id/edit" element={<ProtectedRoute moduleKey="marketing_requests"><NewMarketingRequest /></ProtectedRoute>} />
          <Route path="/marketing-requests/:id" element={<ProtectedRoute moduleKey="marketing_requests"><MarketingRequestDetail /></ProtectedRoute>} />
          <Route path="/design-requests-new" element={<ProtectedRoute moduleKey="design_requests_new"><DesignRequestsNew /></ProtectedRoute>} />
          <Route path="/design-requests-new/new" element={<ProtectedRoute moduleKey="design_requests_new"><NewDesignRequestNew /></ProtectedRoute>} />
          <Route path="/design-requests-new/:id/edit" element={<ProtectedRoute moduleKey="design_requests_new"><NewDesignRequestNew /></ProtectedRoute>} />
          <Route path="/design-requests-new/:id" element={<ProtectedRoute moduleKey="design_requests_new"><DesignRequestNewDetail /></ProtectedRoute>} />
          <Route path="/print-requests" element={<ProtectedRoute moduleKey="print_requests"><PrintRequests /></ProtectedRoute>} />
          <Route path="/print-requests/:id" element={<ProtectedRoute moduleKey="print_requests"><PrintRequestDetail /></ProtectedRoute>} />
          <Route path="/admin/print-settings" element={<ProtectedRoute moduleKey="print_request_statuses"><PrintRequestSettings /></ProtectedRoute>} />
          {/* Personal Calendar */}
          <Route path="/personal-calendar" element={<ProtectedRoute moduleKey="personal_calendar"><PersonalCalendar /></ProtectedRoute>} />
          {/* Mail (Gmail integration) */}
          <Route path="/mail" element={<ProtectedRoute moduleKey="mail"><Mail /></ProtectedRoute>} />
        </Routes>
        </Suspense>
        <Toaster />
      </>
    );
  }

export default App;
