import React from 'react';
import { BrowserRouter, Routes, Route, Navigate, useLocation } from 'react-router-dom';
import { AuthProvider, useAuth } from './context/AuthContext';
import { Toaster } from './components/ui/sonner';
import DashboardLayout from './layouts/DashboardLayout';
import SplashScreen from './pages/SplashScreen';
import Login from './pages/Login';
import AuthCallback from './components/AuthCallback';
import Dashboard from './pages/Dashboard';
import LeadsList from './pages/LeadsList';
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
import '@/App.css';

function ProtectedRoute({ children }) {
  const { user, loading } = useAuth();

  if (loading) {
    return <div className="min-h-screen flex items-center justify-center">Loading...</div>;
  }

  if (!user) {
    return <Navigate to="/login" replace />;
  }

  return <DashboardLayout>{children}</DashboardLayout>;
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
          
          <Route path="/dashboard" element={<ProtectedRoute><Dashboard /></ProtectedRoute>} />
          <Route path="/dashboard-preview" element={<ProtectedRoute><DashboardPreview /></ProtectedRoute>} />
          <Route path="/leads" element={<ProtectedRoute><LeadsList /></ProtectedRoute>} />
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
        </Routes>
        <Toaster />
      </BrowserRouter>
    </AuthProvider>
  );
}

export default App;
