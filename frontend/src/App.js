import React from 'react';
import { BrowserRouter, Routes, Route, Navigate, useLocation } from 'react-router-dom';
import { AuthProvider, useAuth } from './context/AuthContext';
import { AppContextProvider } from './context/AppContextContext';
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
import Dashboard from './pages/Dashboard';
import HomeDashboard from './pages/HomeDashboard';

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
import LeadsList from './pages/LeadsList';
import LeadsKanban from './pages/LeadsKanban';
import LeadDetail from './pages/LeadDetail';
import AddEditLead from './pages/AddEditLead';
import FollowUps from './pages/FollowUps';
import Reports from './pages/Reports';
import LocationAnalytics from './pages/LocationAnalytics';
import TeamManagement from './pages/TeamManagement';
import DailyStatusUpdate from './pages/DailyStatusUpdate';
import MeetingMinutes from './pages/MeetingMinutes';
import MeetingDetail from './pages/MeetingDetail';
import MeetingEdit from './pages/MeetingEdit';
import CostCards from './pages/CostCards';
import StatusSummary from './pages/StatusSummary';
import DashboardPreview from './pages/DashboardPreview';
import BottlePreview from './pages/BottlePreview';
import LeaveManagement from './pages/LeaveManagement';
import TargetPlanningList from './pages/TargetPlanningList';
import TargetPlanDashboard from './pages/TargetPlanDashboard';
import ReportsPage from './pages/ReportsPage';
import SalesPortal from './pages/SalesPortal';
import LeadDiscovery from './pages/LeadDiscovery';
import COGSCalculator from './pages/COGSCalculator';
import SalesRevenueDashboard from './pages/SalesRevenueDashboard';
import SKUPerformance from './pages/SKUPerformance';
import ResourcePerformance from './pages/ResourcePerformance';
import AccountsList from './pages/AccountsList';
import AccountSKUPricing from './pages/AccountSKUPricing';
import NeckTagDesigner from './pages/NeckTagDesigner';
import MasterCOGSComponents from './pages/MasterCOGSComponents';
import AdminSkuMigrate from './pages/AdminSkuMigrate';
import AccountDetail from './pages/AccountDetail';
import AccountPerformance from './pages/AccountPerformance';
import InvoicesList from './pages/InvoicesList';
import TransportationCostCalculator from './pages/TransportationCostCalculator';
import SKUManagement from './pages/SKUManagement';
import PackagingTypes from './pages/PackagingTypes';
import CompanyProfile from './pages/CompanyProfile';
import FilesDocuments from './pages/FilesDocuments';
// Production Context Pages
import Maintenance from './pages/Maintenance';
import Inventory from './pages/Inventory';
import QualityControl from './pages/QualityControl';
import ProductionBatches from './pages/ProductionBatches';
import ProductionDashboard from './pages/ProductionDashboard';
import BatchDetail from './pages/BatchDetail';
import QCRouteConfig from './pages/QCRouteConfig';
import RejectionReasons from './pages/RejectionReasons';
import RejectionReport from './pages/RejectionReport';
import RejectionCostConfig from './pages/RejectionCostConfig';
import QCTeam from './pages/QCTeam';
import Assets from './pages/Assets';
import Vendors from './pages/Vendors';
import MasterLocations from './pages/MasterLocations';
import MasterLeadStatus from './pages/MasterLeadStatus';
import MasterBusinessCategories from './pages/MasterBusinessCategories';
import TravelRequest from './pages/TravelRequest';
import BudgetRequest from './pages/BudgetRequest';
import ExpenseCategoryMaster from './pages/ExpenseCategoryMaster';
import CompanyDocuments from './pages/CompanyDocuments';
import MasterContactCategories from './pages/MasterContactCategories';
import ContactsList from './pages/ContactsList';
import TenantSettings from './pages/TenantSettings';
import ApiKeysPage from './pages/ApiKeysPage';
import PlatformAdmin from './pages/PlatformAdmin';
import AIAssistant from './pages/AIAssistant';
import LeadScoringModel from './pages/LeadScoringModel';
// Distribution Module
import DistributorList from './pages/DistributorList';
import DistributorDetail from './pages/DistributorDetail';
import StockDashboard from './pages/StockDashboard';
import TaskManagement from './pages/TaskManagement';
import TaskDetail from './pages/TaskDetail';
import PerformanceTracker from './pages/PerformanceTracker';
import InvestorDashboard from './pages/InvestorDashboard';
// Marketing Module
import MarketingCalendar from './pages/MarketingCalendar';
import MarketingMasters from './pages/MarketingMasters';
import MarketingPostDetail from './pages/MarketingPostDetail';
// Personal Calendar (per-user, with Google Calendar sync)
import PersonalCalendar from './pages/PersonalCalendar';
import '@/App.css';
import { useActivityTracker } from './hooks/useActivityTracker';
import { NavigationProvider } from './context/NavigationContext';

function ActivityTrackerWrapper({ children }) {
  useActivityTracker();
  return children;
}

function ProtectedRoute({ children, moduleKey }) {
  const { user, loading } = useAuth();
  const { isModuleEnabled, loading: configLoading } = useTenantConfig();
  const location = useLocation();

  if (loading || configLoading) {
    return <div className="min-h-screen flex items-center justify-center">Loading...</div>;
  }

  if (!user) {
    return <Navigate to="/login" replace />;
  }

  // Check if module is enabled (if moduleKey is provided)
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
      <Routes>
          <Route path="/" element={<SplashScreen />} />
          <Route path="/login" element={<Login />} />
          <Route path="/register" element={<RegisterTenant />} />
          <Route path="/auth/callback" element={<GoogleAuthCallback />} />
          
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
          <Route path="/target-planning/:planId" element={<ProtectedRoute moduleKey="target_planning"><TargetPlanDashboard /></ProtectedRoute>} />
          <Route path="/reports-new" element={<ProtectedRoute><ReportsPage /></ProtectedRoute>} />
          <Route path="/sales-portal" element={<ProtectedRoute moduleKey="sales_portal"><SalesPortal /></ProtectedRoute>} />
          <Route path="/lead-discovery" element={<ProtectedRoute moduleKey="lead_discovery"><LeadDiscovery /></ProtectedRoute>} />
          <Route path="/cogs-calculator" element={<ProtectedRoute moduleKey="cogs_calculator"><COGSCalculator /></ProtectedRoute>} />
          <Route path="/sales-revenue" element={<ProtectedRoute moduleKey="report_revenue"><SalesRevenueDashboard /></ProtectedRoute>} />
          <Route path="/sku-performance" element={<ProtectedRoute moduleKey="report_sku_performance"><SKUPerformance /></ProtectedRoute>} />
          <Route path="/resource-performance" element={<ProtectedRoute moduleKey="report_resource_performance"><ResourcePerformance /></ProtectedRoute>} />
          <Route path="/accounts" element={<ProtectedRoute moduleKey="accounts"><AccountsList /></ProtectedRoute>} />
          <Route path="/accounts/sku-pricing" element={<ProtectedRoute moduleKey="accounts"><AccountSKUPricing /></ProtectedRoute>} />
          <Route path="/sales/neck-tag-designer" element={<ProtectedRoute moduleKey="accounts"><NeckTagDesigner /></ProtectedRoute>} />
          <Route path="/master/cogs-components" element={<ProtectedRoute moduleKey="cogs_components"><MasterCOGSComponents /></ProtectedRoute>} />
          <Route path="/admin/sku-migrate" element={<ProtectedRoute moduleKey="admin"><AdminSkuMigrate /></ProtectedRoute>} />
          <Route path="/accounts/:id" element={<ProtectedRoute moduleKey="accounts"><AccountDetail /></ProtectedRoute>} />
          <Route path="/invoices" element={<ProtectedRoute moduleKey="invoices"><InvoicesList /></ProtectedRoute>} />
          <Route path="/account-performance" element={<ProtectedRoute moduleKey="report_account_performance"><AccountPerformance /></ProtectedRoute>} />
          <Route path="/transportation-calculator" element={<ProtectedRoute moduleKey="transport_calculator"><TransportationCostCalculator /></ProtectedRoute>} />
          <Route path="/sku-management" element={<ProtectedRoute moduleKey="sku_management"><SKUManagement /></ProtectedRoute>} />
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
          <Route path="/tenant-settings" element={<ProtectedRoute><TenantSettings /></ProtectedRoute>} />
          <Route path="/settings/api-keys" element={<ProtectedRoute><ApiKeysPage /></ProtectedRoute>} />
          <Route path="/platform-admin" element={<ProtectedRoute><PlatformAdmin /></ProtectedRoute>} />
          <Route path="/ai-assistant" element={<ProtectedRoute><AIAssistant /></ProtectedRoute>} />
          <Route path="/lead-scoring-model" element={<ProtectedRoute moduleKey="lead_scoring"><LeadScoringModel /></ProtectedRoute>} />
          
          {/* Production Context Routes */}
          <Route path="/production-dashboard" element={<ProtectedRoute><ProductionDashboard /></ProtectedRoute>} />
          <Route path="/maintenance" element={<ProtectedRoute moduleKey="maintenance"><Maintenance /></ProtectedRoute>} />
          <Route path="/inventory" element={<ProtectedRoute moduleKey="inventory"><Inventory /></ProtectedRoute>} />
          <Route path="/quality-control" element={<ProtectedRoute moduleKey="quality_control"><QualityControl /></ProtectedRoute>} />
          <Route path="/production-batches" element={<ProtectedRoute><ProductionBatches /></ProtectedRoute>} />
          <Route path="/production-batches/:batchId" element={<ProtectedRoute><BatchDetail /></ProtectedRoute>} />
          <Route path="/qc-routes" element={<ProtectedRoute><QCRouteConfig /></ProtectedRoute>} />
          <Route path="/rejection-reasons" element={<ProtectedRoute><RejectionReasons /></ProtectedRoute>} />
          <Route path="/rejection-report" element={<ProtectedRoute><RejectionReport /></ProtectedRoute>} />
          <Route path="/production/rejection-cost-config" element={<ProtectedRoute><RejectionCostConfig /></ProtectedRoute>} />
          <Route path="/qc-team" element={<ProtectedRoute><QCTeam /></ProtectedRoute>} />
          <Route path="/assets" element={<ProtectedRoute moduleKey="assets"><Assets /></ProtectedRoute>} />
          <Route path="/vendors" element={<ProtectedRoute moduleKey="vendors"><Vendors /></ProtectedRoute>} />
          
          {/* Distribution Module Routes */}
          <Route path="/distributors" element={<ProtectedRoute moduleKey="distributors"><DistributorList /></ProtectedRoute>} />
          <Route path="/distributors/:id" element={<ProtectedRoute moduleKey="distributors"><DistributorDetail /></ProtectedRoute>} />
          <Route path="/distributors/:id/edit" element={<ProtectedRoute moduleKey="distributors"><DistributorDetail /></ProtectedRoute>} />
          <Route path="/stock-dashboard" element={<ProtectedRoute moduleKey="distributors"><StockDashboard /></ProtectedRoute>} />
          <Route path="/cost-cards" element={<ProtectedRoute moduleKey="distributors"><CostCards /></ProtectedRoute>} />
          
          {/* Task Management */}
          <Route path="/tasks" element={<ProtectedRoute><TaskManagement /></ProtectedRoute>} />
          <Route path="/tasks/:taskId" element={<ProtectedRoute><TaskDetail /></ProtectedRoute>} />
          <Route path="/performance" element={<ProtectedRoute moduleKey="performance_tracker"><PerformanceTracker /></ProtectedRoute>} />
          <Route path="/investor-dashboard" element={<ProtectedRoute moduleKey="investor_dashboard"><InvestorDashboard /></ProtectedRoute>} />
          {/* Marketing Module */}
          <Route path="/marketing-calendar" element={<ProtectedRoute moduleKey="marketing_calendar"><MarketingCalendar /></ProtectedRoute>} />
          <Route path="/marketing-post/:postId" element={<ProtectedRoute moduleKey="marketing_calendar"><MarketingPostDetail /></ProtectedRoute>} />
          <Route path="/marketing-masters" element={<ProtectedRoute moduleKey="marketing_masters"><MarketingMasters /></ProtectedRoute>} />
          {/* Personal Calendar */}
          <Route path="/personal-calendar" element={<ProtectedRoute><PersonalCalendar /></ProtectedRoute>} />
        </Routes>
        <Toaster />
      </>
    );
  }

export default App;
