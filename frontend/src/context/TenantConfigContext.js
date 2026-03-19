import React, { createContext, useState, useContext, useEffect, useCallback } from 'react';
import { useAuth } from './AuthContext';
import axios from 'axios';

const TenantConfigContext = createContext();

const API_URL = process.env.REACT_APP_BACKEND_URL;

// Default branding values
const DEFAULT_BRANDING = {
  app_name: 'Sales CRM',
  tagline: '',
  logo_url: '',
  primary_color: '#0d9488', // Teal
  accent_color: '#ffffff',
  secondary_color: '#374151',
};

// Convert hex color to HSL values for CSS variables
const hexToHSL = (hex) => {
  // Remove # if present
  hex = hex.replace('#', '');
  
  // Parse hex to RGB
  const r = parseInt(hex.substring(0, 2), 16) / 255;
  const g = parseInt(hex.substring(2, 4), 16) / 255;
  const b = parseInt(hex.substring(4, 6), 16) / 255;
  
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  let h, s, l = (max + min) / 2;
  
  if (max === min) {
    h = s = 0; // achromatic
  } else {
    const d = max - min;
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    
    switch (max) {
      case r:
        h = ((g - b) / d + (g < b ? 6 : 0)) / 6;
        break;
      case g:
        h = ((b - r) / d + 2) / 6;
        break;
      case b:
        h = ((r - g) / d + 4) / 6;
        break;
      default:
        h = 0;
    }
  }
  
  return {
    h: Math.round(h * 360),
    s: Math.round(s * 100),
    l: Math.round(l * 100)
  };
};

// Apply branding colors to CSS custom properties
const applyBrandingColors = (branding) => {
  const root = document.documentElement;
  
  if (branding?.primary_color) {
    const primary = hexToHSL(branding.primary_color);
    // Set primary color for both light and dark modes
    root.style.setProperty('--primary', `${primary.h} ${primary.s}% ${primary.l}%`);
    root.style.setProperty('--accent', `${primary.h} ${primary.s}% ${primary.l}%`);
    root.style.setProperty('--ring', `${primary.h} ${primary.s}% ${primary.l}%`);
    
    // Chart colors based on primary
    root.style.setProperty('--chart-1', `${primary.h} ${primary.s}% ${Math.min(primary.l + 5, 60)}%`);
    root.style.setProperty('--chart-2', `${(primary.h + 10) % 360} ${Math.max(primary.s - 5, 40)}% ${Math.min(primary.l + 10, 65)}%`);
  }
  
  // Store branding in CSS custom properties for other components
  if (branding?.primary_color) {
    root.style.setProperty('--tenant-primary', branding.primary_color);
  }
  if (branding?.accent_color) {
    root.style.setProperty('--tenant-accent', branding.accent_color);
  }
  if (branding?.secondary_color) {
    root.style.setProperty('--tenant-secondary', branding.secondary_color);
  }
};

// Mapping from module keys to their corresponding routes
export const MODULE_ROUTE_MAP = {
  // Core Modules
  home: ['/home'],
  dashboard: ['/dashboard', '/dashboard-preview'],
  leads: ['/leads', '/leads/kanban', '/leads/new'],
  pipeline: ['/leads/kanban'],
  accounts: ['/accounts'],
  sales_portal: ['/sales-portal'],
  contacts: ['/contacts'],
  
  // Dashboard Reports
  report_sales_overview: ['/dashboard'],
  report_revenue: ['/sales-revenue'],
  report_sku_performance: ['/sku-performance'],
  report_resource_performance: ['/resource-performance'],
  report_account_performance: ['/account-performance'],
  
  // Lead & Sales Operations
  lead_discovery: ['/lead-discovery'],
  target_planning: ['/target-planning'],
  daily_status: ['/daily-status'],
  status_summary: ['/status-summary'],
  
  // Pricing & Logistics
  cogs_calculator: ['/cogs-calculator'],
  transport_calculator: ['/transportation-calculator'],
  
  // Product & SKU
  sku_management: ['/sku-management'],
  bottle_preview: ['/bottle-preview'],
  
  // Documents
  company_documents: ['/company-documents'],
  files_documents: ['/files-documents'],
  
  // Requests
  leaves: ['/leaves'],
  travel_requests: ['/travel-requests'],
  budget_requests: ['/budget-requests'],
  expense_management: ['/expense-category-master'],
  
  // Meetings & Tasks
  meetings: [], // Placeholder - might be integrated within other pages
  tasks: [], // Placeholder - might be integrated within other pages
  
  // Organization & Master Data
  company_profile: ['/company-profile'],
  team: ['/team'],
  master_locations: ['/master-locations'],
  lead_statuses: ['/master-lead-status'],
  business_categories: ['/master-business-categories'],
  contact_categories: ['/master-contact-categories'],
  expense_categories: ['/expense-category-master'],
  
  // Production Modules (Beta)
  maintenance: ['/maintenance'],
  inventory: ['/inventory'],
  quality_control: ['/quality-control'],
  assets: ['/assets'],
  vendors: ['/vendors'],
  
  // Distribution Modules
  distributors: ['/distributors'],
  distributor_coverage: ['/distributors'],
  distributor_locations: ['/distributors'],
  distributor_margins: ['/distributors'],
  distributor_assignments: ['/distributors'],
  distributor_shipments: ['/distributors'],
  distributor_deliveries: ['/distributors'],
  distributor_stock: ['/distributors'],
};

// Mapping from navigation href to module key
export const ROUTE_TO_MODULE_MAP = {};
Object.entries(MODULE_ROUTE_MAP).forEach(([moduleKey, routes]) => {
  routes.forEach(route => {
    ROUTE_TO_MODULE_MAP[route] = moduleKey;
  });
});

export const TenantConfigProvider = ({ children }) => {
  const { user, token } = useAuth();
  const [tenantConfig, setTenantConfig] = useState(null);
  const [modules, setModules] = useState({});
  const [branding, setBranding] = useState(DEFAULT_BRANDING);
  const [rolePermissions, setRolePermissions] = useState({});
  const [industry, setIndustry] = useState({ industry_type: 'generic', industry_features: [], industry_config: {} });
  const [loading, setLoading] = useState(true);

  const fetchTenantConfig = useCallback(async () => {
    // Only require user to be present - token might be in cookies
    if (!user) {
      console.log('🔧 TenantConfig: No user, skipping fetch');
      setLoading(false);
      return;
    }
    
    console.log('🔧 TenantConfig: Fetching config for user:', user?.email, 'token exists:', !!token);
    
    try {
      // Fetch tenant config and industry profile in parallel
      // Use both Authorization header AND credentials for cookie-based auth
      const [configResponse, industryResponse] = await Promise.all([
        axios.get(`${API_URL}/api/tenants/current/config`, {
          headers: token ? { Authorization: `Bearer ${token}` } : {},
          withCredentials: true
        }),
        axios.get(`${API_URL}/api/tenants/current/industry`, {
          headers: token ? { Authorization: `Bearer ${token}` } : {},
          withCredentials: true
        }).catch(() => ({ data: { industry_type: 'generic', industry_features: [], industry_config: {} } }))
      ]);
      
      console.log('🔧 TenantConfig: Config response received:', !!configResponse.data);
      
      const config = configResponse.data;
      setTenantConfig(config);
      setModules(config.modules || {});
      
      // Set industry profile - handle both nested and flat formats
      const industryData = industryResponse.data || {};
      // Also check if industry is nested in the main config
      const configIndustry = config.industry || {};
      
      // Merge industry data from both sources
      // Priority: config.industry (from tenant config) > industryResponse (from industry endpoint)
      // because the industry endpoint might return 'generic' as default
      const mergedIndustry = {
        industry_type: configIndustry.industry_type || industryData.industry_type || industryData.industry || 'generic',
        industry_features: industryData.industry_features || industryData.enabled_features || configIndustry.industry_features || [],
        industry_config: configIndustry.industry_config || industryData.industry_config || {}
      };
      
      // If enabled_features is in industry_config, also add it to industry_features for backwards compat
      if (mergedIndustry.industry_config?.enabled_features) {
        mergedIndustry.industry_features = [
          ...new Set([...mergedIndustry.industry_features, ...mergedIndustry.industry_config.enabled_features])
        ];
      }
      
      console.log('🏭 Industry Config Loaded:', mergedIndustry);
      
      setIndustry(mergedIndustry);
      
      // Merge fetched branding with defaults
      const fetchedBranding = {
        ...DEFAULT_BRANDING,
        ...config.branding
      };
      setBranding(fetchedBranding);
      
      // Apply branding colors to CSS custom properties
      applyBrandingColors(fetchedBranding);
      
      // Fetch role permissions for the current user's role
      try {
        const rolesResponse = await axios.get(`${API_URL}/api/roles`, {
          headers: { Authorization: `Bearer ${token}` }
        });
        const roles = rolesResponse.data.roles || [];
        // Find the user's role permissions
        const userRole = roles.find(r => r.name === user?.role);
        if (userRole && userRole.permissions) {
          setRolePermissions(userRole.permissions);
        } else {
          // Default: allow all if role not found in Role Management
          setRolePermissions({});
        }
      } catch (roleError) {
        console.log('Could not fetch role permissions, using defaults');
        setRolePermissions({});
      }
    } catch (error) {
      console.error('❌ Failed to fetch tenant config:', error);
      console.error('❌ Error details:', error.response?.data || error.message);
      // Set defaults on error
      setModules({});
      setBranding(DEFAULT_BRANDING);
      setRolePermissions({});
      setIndustry({ industry_type: 'generic', industry_features: [], industry_config: {} });
    } finally {
      setLoading(false);
    }
  }, [user, token]);

  useEffect(() => {
    fetchTenantConfig();
  }, [fetchTenantConfig]);

  // Check if a specific module is enabled for the tenant
  const isModuleEnabled = useCallback((moduleKey) => {
    // If modules not loaded or key doesn't exist, default to enabled
    if (!modules || modules[moduleKey] === undefined) {
      return true;
    }
    return modules[moduleKey] !== false;
  }, [modules]);

  // Check if the current user's role has permission to view a module
  const hasRolePermission = useCallback((moduleKey) => {
    // If no role permissions loaded, default to allowed (backwards compatible)
    if (!rolePermissions || Object.keys(rolePermissions).length === 0) {
      return true;
    }
    // Check if the module has view permission
    const modulePerms = rolePermissions[moduleKey];
    if (!modulePerms) {
      // Module not in permissions list, default to allowed
      return true;
    }
    return modulePerms.view === true;
  }, [rolePermissions]);

  // Check if a feature is available for the current tenant's industry
  const hasIndustryFeature = useCallback((featureKey) => {
    // Check multiple possible locations for features (handles different API response formats)
    const features = 
      industry?.industry_features ||  // Old format
      industry?.industry_config?.enabled_features ||  // New format from industry endpoint
      tenantConfig?.industry?.industry_config?.enabled_features ||  // Nested in tenant config
      [];
    
    // If features array has the key, return true
    if (features.includes(featureKey)) {
      return true;
    }
    
    // Fallback: Check industry_type for water_brand specific features
    const industryType = 
      industry?.industry_type ||
      tenantConfig?.industry?.industry_type ||
      'generic';
    
    // Water brand industry features
    const waterBrandFeatures = [
      'lead_bottle_tracking',
      'bottle_preview', 
      'cogs_calculator',
      'sku_management',
      'account_bottle_volume'
    ];
    
    if (industryType === 'water_brand' && waterBrandFeatures.includes(featureKey)) {
      return true;
    }
    
    return false;
  }, [industry, tenantConfig]);

  // Get industry-specific configuration value
  const getIndustryConfig = useCallback((configKey, defaultValue = null) => {
    return industry.industry_config?.[configKey] ?? defaultValue;
  }, [industry]);

  // Check if a route is accessible based on module configuration
  const isRouteAccessible = useCallback((route) => {
    // Always allow certain routes
    const alwaysAllowedRoutes = ['/', '/login', '/auth/callback', '/tenant-settings'];
    if (alwaysAllowedRoutes.includes(route)) {
      return true;
    }
    
    // Find the module key for this route
    const moduleKey = ROUTE_TO_MODULE_MAP[route];
    
    // If no module mapping exists, allow access
    if (!moduleKey) {
      return true;
    }
    
    return isModuleEnabled(moduleKey);
  }, [isModuleEnabled]);

  // Get list of disabled routes
  const getDisabledRoutes = useCallback(() => {
    const disabledRoutes = [];
    Object.entries(ROUTE_TO_MODULE_MAP).forEach(([route, moduleKey]) => {
      if (!isModuleEnabled(moduleKey)) {
        disabledRoutes.push(route);
      }
    });
    return disabledRoutes;
  }, [isModuleEnabled]);

  // Refresh config (useful after saving module settings)
  const refreshConfig = useCallback(() => {
    fetchTenantConfig();
  }, [fetchTenantConfig]);

  return (
    <TenantConfigContext.Provider value={{
      tenantConfig,
      modules,
      branding,
      rolePermissions,
      industry,
      loading,
      isModuleEnabled,
      hasRolePermission,
      hasIndustryFeature,
      getIndustryConfig,
      isRouteAccessible,
      getDisabledRoutes,
      refreshConfig,
    }}>
      {children}
    </TenantConfigContext.Provider>
  );
};

export const useTenantConfig = () => {
  const context = useContext(TenantConfigContext);
  if (!context) {
    throw new Error('useTenantConfig must be used within TenantConfigProvider');
  }
  return context;
};
