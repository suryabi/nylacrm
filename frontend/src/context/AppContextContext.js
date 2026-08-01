import React, { createContext, useContext, useState, useEffect } from 'react';
import { useAuth } from './AuthContext';
import { useTenantConfig } from './TenantConfigContext';
import { MODULE_REGISTRY } from '../config/moduleRegistry';

const AppContextContext = createContext(null);

// Roles that can access all modules
const ADMIN_ROLES = ['CEO', 'Director'];

// Roles allowed in the Admin context (fleet, masters, settings, integrations)
const ADMIN_CONTEXT_ROLES = ['CEO', 'Director', 'Admin', 'System Admin'];

// Workspace → module-registry groups. A role-permission matrix VIEW grant on
// any module inside these groups unlocks the workspace for that role.
const WORKSPACE_GROUPS = {
  sales: ['sales_core', 'sales_reports', 'sales_ops', 'pricing_logistics', 'product_tools', 'documents', 'requests'],
  production: ['production'],
  distribution: ['distribution'],
  marketing: ['marketing'],
  accounting: ['accounting'],
  admin: ['fleet', 'product_sku', 'master_data', 'ai_knowledge', 'finance_audit', 'settings_integrations'],
};

// Module definitions
const MODULES = {
  sales: { id: 'sales', label: 'Sales', icon: 'Store', defaultRoute: '/home' },
  production: { id: 'production', label: 'Production', icon: 'Factory', defaultRoute: '/production-dashboard' },
  distribution: { id: 'distribution', label: 'Distribution', icon: 'Truck', defaultRoute: '/distributors' },
  marketing: { id: 'marketing', label: 'Marketing', icon: 'Megaphone', defaultRoute: '/marketing-calendar' },
  accounting: { id: 'accounting', label: 'Accounting', icon: 'Calculator', defaultRoute: '/accounting/masters' },
  admin: { id: 'admin', label: 'Admin', icon: 'ShieldCheck', defaultRoute: '/admin/vehicles' },
};

export function AppContextProvider({ children }) {
  const { user } = useAuth();
  const { rolePermissions } = useTenantConfig();
  const [currentContext, setCurrentContext] = useState('sales');

  // Role-permission matrix (Tenant Settings → Roles): a VIEW grant on any
  // module belonging to the workspace unlocks it — this is how custom roles
  // like "Vice President - Operations" gain access without department edits.
  const matrixGrantsWorkspace = (moduleId) => {
    if (!rolePermissions || Object.keys(rolePermissions).length === 0) return false;
    const groups = WORKSPACE_GROUPS[moduleId] || [];
    return MODULE_REGISTRY
      .filter((g) => groups.includes(g.key))
      .some((g) => g.items.some((it) => rolePermissions[it.key]?.view === true));
  };

  // Determine which modules the user can access
  const canAccessModule = (moduleId) => {
    if (!user) return false;
    
    // Distributor role users can ONLY access Distribution module
    if (user.role === 'Distributor') {
      return moduleId === 'distribution';
    }
    
    // Admin context: fixed admin-capable roles, or an explicit matrix grant
    if (moduleId === 'admin') {
      return ADMIN_CONTEXT_ROLES.includes(user.role) || matrixGrantsWorkspace('admin');
    }

    // Accounting context: admin-capable roles OR users in the accounting department
    if (moduleId === 'accounting') {
      if (ADMIN_CONTEXT_ROLES.includes(user.role)) return true;
      const depts = Array.isArray(user.department) ? user.department.map(d => d?.toLowerCase()) : [(user.department || '').toLowerCase()];
      if (depts.includes('accounting') || depts.includes('both') || depts.includes('all')) return true;
      return matrixGrantsWorkspace('accounting');
    }

    // Admin roles can always access all modules
    if (ADMIN_ROLES.includes(user.role)) return true;
    // Check department-based access (support both string and array)
    const depts = Array.isArray(user.department) ? user.department.map(d => d?.toLowerCase()) : [(user.department || '').toLowerCase()];
    if (depts.includes('both') || depts.includes('all')) return true;
    if (moduleId === 'sales' && (depts.includes('sales') || depts.length === 0)) return true;
    if (moduleId === 'production' && depts.includes('production')) return true;
    if (moduleId === 'distribution' && depts.includes('distribution')) return true;
    if (moduleId === 'marketing' && depts.includes('marketing')) return true;
    // Finally: honor the role-permission matrix from Tenant Settings
    return matrixGrantsWorkspace(moduleId);
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
    // rolePermissions arrive async — re-validate the saved workspace once loaded
  }, [user, rolePermissions]);
  
  const setDefaultContext = () => {
    if (!user) return;
    
    // Distributor users always default to distribution
    if (user.role === 'Distributor') {
      setCurrentContext('distribution');
      return;
    }
    
    // Set based on department (support both string and array)
    const depts = Array.isArray(user.department) ? user.department.map(d => d?.toLowerCase()) : [(user.department || '').toLowerCase()];
    
    // Dedicated single-department teams land directly in their own module.
    // Marketing-only users (no sales) go straight to the Marketing module —
    // checked before admin-role defaulting so a Marketing-only lead lands there too.
    if (depts.includes('marketing') && !depts.includes('sales')) {
      setCurrentContext('marketing');
      return;
    }
    
    // Admin roles default to sales
    if (ADMIN_ROLES.includes(user.role)) {
      setCurrentContext('sales');
      return;
    }
    
    if (depts.includes('production') && !depts.includes('sales')) {
      setCurrentContext('production');
    } else if (depts.includes('distribution') && !depts.includes('sales')) {
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
    canAccessMarketing: canAccessModule('marketing'),
    canAccessAdmin: canAccessModule('admin'),
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
