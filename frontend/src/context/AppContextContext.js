import React, { createContext, useContext, useState, useEffect } from 'react';
import { useAuth } from './AuthContext';

const AppContextContext = createContext(null);

// Roles that can access both contexts
const ADMIN_ROLES = ['CEO', 'Director'];

export function AppContextProvider({ children }) {
  const { user } = useAuth();
  const [currentContext, setCurrentContext] = useState('sales');
  
  // Determine which contexts the user can access
  const canAccessBothContexts = () => {
    if (!user) return false;
    // Admin roles can always access both
    if (ADMIN_ROLES.includes(user.role)) return true;
    // Users with 'both' department can access both
    if (user.department === 'both') return true;
    return false;
  };
  
  const canAccessSales = () => {
    if (!user) return false;
    if (ADMIN_ROLES.includes(user.role)) return true;
    if (user.department === 'both' || user.department === 'sales') return true;
    return false;
  };
  
  const canAccessProduction = () => {
    if (!user) return false;
    if (ADMIN_ROLES.includes(user.role)) return true;
    if (user.department === 'both' || user.department === 'production') return true;
    return false;
  };
  
  // Set default context based on user's department
  useEffect(() => {
    if (user) {
      // Load saved context from localStorage
      const savedContext = localStorage.getItem(`appContext_${user.id}`);
      
      if (savedContext && (savedContext === 'sales' || savedContext === 'production')) {
        // Validate saved context against user permissions
        if (savedContext === 'production' && canAccessProduction()) {
          setCurrentContext('production');
        } else if (savedContext === 'sales' && canAccessSales()) {
          setCurrentContext('sales');
        } else {
          // Fall back to default based on department
          setDefaultContext();
        }
      } else {
        setDefaultContext();
      }
    }
  }, [user]);
  
  const setDefaultContext = () => {
    if (!user) return;
    
    // Admin roles default to sales
    if (ADMIN_ROLES.includes(user.role)) {
      setCurrentContext('sales');
      return;
    }
    
    // Set based on department
    if (user.department === 'production') {
      setCurrentContext('production');
    } else {
      setCurrentContext('sales');
    }
  };
  
  const switchContext = (newContext) => {
    if (newContext === 'sales' && canAccessSales()) {
      setCurrentContext('sales');
      if (user) {
        localStorage.setItem(`appContext_${user.id}`, 'sales');
      }
    } else if (newContext === 'production' && canAccessProduction()) {
      setCurrentContext('production');
      if (user) {
        localStorage.setItem(`appContext_${user.id}`, 'production');
      }
    }
  };
  
  const value = {
    currentContext,
    switchContext,
    canAccessBothContexts: canAccessBothContexts(),
    canAccessSales: canAccessSales(),
    canAccessProduction: canAccessProduction(),
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
