import React from 'react';
import { BrowserRouter, Routes, Route, Navigate, useLocation } from 'react-router-dom';
import { AuthProvider, useAuth } from './context/AuthContext';
import { AppContextProvider } from './context/AppContextContext';
import { Toaster } from './components/ui/sonner';
import axios from 'axios';
import DashboardLayout from './layouts/DashboardLayout';
import SplashScreen from './pages/SplashScreen';
import Login from './pages/Login';
import AuthCallback from './components/AuthCallback';
import GoogleAuthCallback from './pages/GoogleAuthCallback';
import Dashboard from './pages/Dashboard';

// CRITICAL: Configure axios to always send credentials (cookies) with all requests
axios.defaults.withCredentials = true;
import LeadsList from './pages/LeadsList';
import LeadsKanban from './pages/LeadsKanban';
import LeadDetail from './pages/LeadDetail';
import AddEditLead from './pages/AddEditLead';
import FollowUps from './pages/FollowUps';
import Reports from './pages/Reports';
import LocationAnalytics from './pages/LocationAnalytics';
import TeamManagement from './pages/TeamManagement';
import DailyStatusUpdate from './pages/DailyStatusUpdate';
import TeamStatusFeed from './pages/TeamStatusFeed';
import DashboardPreview from './pages/DashboardPreview';
import BottlePreview from './pages/BottlePreview';
import LeaveManagement from './pages/LeaveManagement';
import SalesTargets from './pages/SalesTargets';
import ReportsPage from './pages/ReportsPage';
import SalesPortal from './pages/SalesPortal';
import LeadDiscovery from './pages/LeadDiscovery';
import COGSCalculator from './pages/COGSCalculator';
import SalesRevenueDashboard from './pages/SalesRevenueDashboard';
import TargetSKUReport from './pages/TargetSKUReport';
import TargetResourceReport from './pages/TargetResourceReport';
import SKUPerformance from './pages/SKUPerformance';
import ResourcePerformance from './pages/ResourcePerformance';
import AccountsList from './pages/AccountsList';
import AccountDetail from './pages/AccountDetail';
import AccountPerformance from './pages/AccountPerformance';
import TransportationCostCalculator from './pages/TransportationCostCalculator';
import SKUManagement from './pages/SKUManagement';
import CompanyProfile from './pages/CompanyProfile';
import FilesDocuments from './pages/FilesDocuments';
// Production Context Pages
import Maintenance from './pages/Maintenance';
import Inventory from './pages/Inventory';
import QualityControl from './pages/QualityControl';
import Assets from './pages/Assets';
import Vendors from './pages/Vendors';
import '@/App.css';
import { useActivityTracker } from './hooks/useActivityTracker';

function ActivityTrackerWrapper({ children }) {
  useActivityTracker();
  return children;
}

function ProtectedRoute({ children }) {
  const { user, loading } = useAuth();

  if (loading) {
    return <div className="min-h-screen flex items-center justify-center">Loading...</div>;
  }

  if (!user) {
    return <Navigate to="/login" replace />;
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
    <AuthProvider>
      <BrowserRouter>
        <AppRouter />
      </BrowserRouter>
    </AuthProvider>
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
          <Route path="/auth/callback" element={<GoogleAuthCallback />} />
          
          <Route path="/dashboard" element={<ProtectedRoute><Dashboard /></ProtectedRoute>} />
          <Route path="/dashboard-preview" element={<ProtectedRoute><DashboardPreview /></ProtectedRoute>} />
          <Route path="/leads" element={<ProtectedRoute><LeadsList /></ProtectedRoute>} />
          <Route path="/leads/kanban" element={<ProtectedRoute><LeadsKanban /></ProtectedRoute>} />
          <Route path="/leads/new" element={<ProtectedRoute><AddEditLead /></ProtectedRoute>} />
          <Route path="/leads/:id" element={<ProtectedRoute><LeadDetail /></ProtectedRoute>} />
          <Route path="/leads/:id/edit" element={<ProtectedRoute><AddEditLead /></ProtectedRoute>} />
          <Route path="/follow-ups" element={<ProtectedRoute><FollowUps /></ProtectedRoute>} />
          <Route path="/reports" element={<ProtectedRoute><Reports /></ProtectedRoute>} />
          <Route path="/locations" element={<ProtectedRoute><LocationAnalytics /></ProtectedRoute>} />
          <Route path="/team" element={<ProtectedRoute><TeamManagement /></ProtectedRoute>} />
          <Route path="/daily-status" element={<ProtectedRoute><DailyStatusUpdate /></ProtectedRoute>} />
          <Route path="/team-status" element={<ProtectedRoute><TeamStatusFeed /></ProtectedRoute>} />
          <Route path="/bottle-preview" element={<ProtectedRoute><BottlePreview /></ProtectedRoute>} />
          <Route path="/leaves" element={<ProtectedRoute><LeaveManagement /></ProtectedRoute>} />
          <Route path="/targets" element={<ProtectedRoute><SalesTargets /></ProtectedRoute>} />
          <Route path="/reports-new" element={<ProtectedRoute><ReportsPage /></ProtectedRoute>} />
          <Route path="/sales-portal" element={<ProtectedRoute><SalesPortal /></ProtectedRoute>} />
          <Route path="/lead-discovery" element={<ProtectedRoute><LeadDiscovery /></ProtectedRoute>} />
          <Route path="/cogs-calculator" element={<ProtectedRoute><COGSCalculator /></ProtectedRoute>} />
          <Route path="/sales-revenue" element={<ProtectedRoute><SalesRevenueDashboard /></ProtectedRoute>} />
          <Route path="/target-sku" element={<ProtectedRoute><TargetSKUReport /></ProtectedRoute>} />
          <Route path="/target-resource" element={<ProtectedRoute><TargetResourceReport /></ProtectedRoute>} />
          <Route path="/sku-performance" element={<ProtectedRoute><SKUPerformance /></ProtectedRoute>} />
          <Route path="/resource-performance" element={<ProtectedRoute><ResourcePerformance /></ProtectedRoute>} />
          <Route path="/accounts" element={<ProtectedRoute><AccountsList /></ProtectedRoute>} />
          <Route path="/accounts/:id" element={<ProtectedRoute><AccountDetail /></ProtectedRoute>} />
          <Route path="/account-performance" element={<ProtectedRoute><AccountPerformance /></ProtectedRoute>} />
          <Route path="/transportation-calculator" element={<ProtectedRoute><TransportationCostCalculator /></ProtectedRoute>} />
          <Route path="/sku-management" element={<ProtectedRoute><SKUManagement /></ProtectedRoute>} />
          <Route path="/company-profile" element={<ProtectedRoute><CompanyProfile /></ProtectedRoute>} />
          <Route path="/files-documents" element={<ProtectedRoute><FilesDocuments /></ProtectedRoute>} />
        </Routes>
        <Toaster />
      </>
    );
  }

export default App;
