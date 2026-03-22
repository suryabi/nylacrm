import React, { createContext, useContext, useState, useEffect } from 'react';
import { useAuth } from './AuthContext';

const AppContextContext = createContext(null);

// Roles that can access all modules
const ADMIN_ROLES = ['CEO', 'Director'];

// Module definitions
const MODULES = {
  sales: { id: 'sales', label: 'Sales', icon: 'Store', defaultRoute: '/home' },
  production: { id: 'production', label: 'Production', icon: 'Factory', defaultRoute: '/maintenance' },
  distribution: { id: 'distribution', label: 'Distribution', icon: 'Truck', defaultRoute: '/distributors' },
};

export function AppContextProvider({ children }) {
  const { user } = useAuth();
  const [currentContext, setCurrentContext] = useState('sales');
  
  // Determine which modules the user can access
  const canAccessModule = (moduleId) => {
    if (!user) return false;
    
    // Distributor role users can ONLY access Distribution module
    if (user.role === 'Distributor') {
      return moduleId === 'distribution';
    }
    
    // Admin roles can always access all modules
    if (ADMIN_ROLES.includes(user.role)) return true;
    // Check department-based access
    if (user.department === 'both' || user.department === 'all') return true;
    if (moduleId === 'sales' && (user.department === 'sales' || !user.department)) return true;
    if (moduleId === 'production' && user.department === 'production') return true;
    if (moduleId === 'distribution' && (user.department === 'distribution' || user.department === 'sales')) return true;
    return false;
  };
  
  const getAccessibleModules = () => {
    return Object.values(MODULES).filter(module => canAccessModule(module.id));
  };
  
  const canAccessMultipleModules = () => {
    return getAccessibleModules().length > 1;
  };
  
  const canAccessSales = () => canAccessModule('sales');
  const canAccessProduction = () => canAccessModule('production');
  const canAccessDistribution = () => canAccessModule('distribution');
  
  // Check if user is a Distributor
  const isDistributorUser = () => {
    return user?.role === 'Distributor';
  };
  
  // Get distributor_id for Distributor users
  const getDistributorId = () => {
    return user?.distributor_id || null;
  };
  
  // Set default context based on user's role/department
  useEffect(() => {
    if (user) {
      // Distributor users always go to Distribution module
      if (user.role === 'Distributor') {
        setCurrentContext('distribution');
        localStorage.setItem(`appContext_${user.id}`, 'distribution');
        return;
      }
      
      // Load saved context from localStorage
      const savedContext = localStorage.getItem(`appContext_${user.id}`);
      
      if (savedContext && MODULES[savedContext] && canAccessModule(savedContext)) {
        setCurrentContext(savedContext);
      } else {
        setDefaultContext();
      }
    }
  }, [user]);
  
  const setDefaultContext = () => {
    if (!user) return;
    
    // Distributor users always default to distribution
    if (user.role === 'Distributor') {
      setCurrentContext('distribution');
      return;
    }
    
    // Admin roles default to sales
    if (ADMIN_ROLES.includes(user.role)) {
      setCurrentContext('sales');
      return;
    }
    
    // Set based on department
    if (user.department === 'production') {
      setCurrentContext('production');
    } else if (user.department === 'distribution') {
      setCurrentContext('distribution');
    } else {
      setCurrentContext('sales');
    }
  };
  
  const switchContext = (newContext) => {
    // Distributor users cannot switch context
    if (user?.role === 'Distributor') {
      return;
    }
    
    if (canAccessModule(newContext)) {
      setCurrentContext(newContext);
      if (user) {
        localStorage.setItem(`appContext_${user.id}`, newContext);
      }
    }
  };
  
  const value = {
    currentContext,
    switchContext,
    canAccessMultipleModules: canAccessMultipleModules(),
    canAccessBothContexts: canAccessMultipleModules(), // Backward compatibility
    canAccessSales: canAccessSales(),
    canAccessProduction: canAccessProduction(),
    canAccessDistribution: canAccessDistribution(),
    getAccessibleModules,
    modules: MODULES,
    isDistributorUser: isDistributorUser(),
    getDistributorId: getDistributorId(),
  };
  
  return (
    <AppContextContext.Provider value={value}>
      {children}
    </AppContextContext.Provider>
  );
}

export function useAppContext() {
  const context = useContext(AppContextContext);
  if (!context) {
    throw new Error('useAppContext must be used within an AppContextProvider');
  }
  return context;
}
