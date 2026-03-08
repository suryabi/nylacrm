import React, { createContext, useContext, useState, useCallback, useEffect } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';

/**
 * Navigation Context
 * 
 * Provides application-wide navigation tracking with:
 * - Breadcrumb trail based on actual navigation path
 * - Filter state preservation across navigation
 * - Distinction between sidebar navigation (reset) and in-app navigation (append)
 */

// Route metadata for display names
const ROUTE_META = {
  '/home': { label: 'Home', icon: 'home' },
  '/dashboard': { label: 'Sales Overview', icon: 'chart' },
  '/leads': { label: 'Leads', icon: 'users' },
  '/leads/new': { label: 'New Lead', icon: 'plus' },
  '/leads/kanban': { label: 'Kanban View', icon: 'columns' },
  '/accounts': { label: 'Accounts', icon: 'building' },
  '/pipeline': { label: 'Pipeline', icon: 'git-branch' },
  '/follow-ups': { label: 'Follow-ups', icon: 'clock' },
  '/daily-status': { label: 'Daily Status', icon: 'calendar' },
  '/status-summary': { label: 'Status Summary', icon: 'list' },
  '/team': { label: 'Team Management', icon: 'users' },
  '/leaves': { label: 'Leave Management', icon: 'calendar-off' },
  '/travel-requests': { label: 'Travel Requests', icon: 'plane' },
  '/budget-requests': { label: 'Budget Requests', icon: 'wallet' },
  '/target-planning': { label: 'Target Planning', icon: 'target' },
  '/sales-portal': { label: 'Sales Portal', icon: 'store' },
  '/lead-discovery': { label: 'Lead Discovery', icon: 'search' },
  '/cogs-calculator': { label: 'COGS Calculator', icon: 'calculator' },
  '/sales-revenue': { label: 'Revenue Report', icon: 'trending-up' },
  '/sku-performance': { label: 'SKU Performance', icon: 'package' },
  '/resource-performance': { label: 'Resource Performance', icon: 'users' },
  '/account-performance': { label: 'Account Performance', icon: 'building' },
  '/transportation-calculator': { label: 'Transportation Calculator', icon: 'truck' },
  '/sku-management': { label: 'SKU Management', icon: 'package' },
  '/company-profile': { label: 'Company Profile', icon: 'building' },
  '/files-documents': { label: 'Files & Documents', icon: 'file' },
  '/master-locations': { label: 'Master Locations', icon: 'map' },
  '/master-lead-status': { label: 'Lead Statuses', icon: 'tag' },
  '/master-business-categories': { label: 'Business Categories', icon: 'folder' },
  '/locations': { label: 'Location Analytics', icon: 'map-pin' },
  '/reports': { label: 'Reports', icon: 'file-text' },
  '/reports-new': { label: 'Reports', icon: 'file-text' },
  '/maintenance': { label: 'Maintenance', icon: 'tool' },
  '/inventory': { label: 'Inventory', icon: 'box' },
  '/quality-control': { label: 'Quality Control', icon: 'check-circle' },
  '/assets': { label: 'Assets', icon: 'hard-drive' },
  '/vendors': { label: 'Vendors', icon: 'truck' },
};

// Pages that are sidebar menu items (navigation to these resets the trail)
const SIDEBAR_ROUTES = [
  '/home', '/dashboard', '/leads', '/accounts', '/pipeline', '/follow-ups',
  '/daily-status', '/team', '/leaves', '/travel-requests', '/budget-requests',
  '/target-planning', '/sales-portal', '/lead-discovery', '/cogs-calculator',
  '/sales-revenue', '/sku-performance', '/resource-performance', '/account-performance',
  '/transportation-calculator', '/sku-management', '/company-profile', '/files-documents',
  '/master-locations', '/master-lead-status', '/master-business-categories',
  '/locations', '/reports', '/reports-new', '/maintenance', '/inventory',
  '/quality-control', '/assets', '/vendors'
];

const NavigationContext = createContext(null);

export const useNavigation = () => {
  const context = useContext(NavigationContext);
  if (!context) {
    throw new Error('useNavigation must be used within NavigationProvider');
  }
  return context;
};

export const NavigationProvider = ({ children }) => {
  const location = useLocation();
  const navigate = useNavigate();
  
  // Navigation trail: array of { path, label, search, state }
  const [trail, setTrail] = useState(() => {
    // Initialize from sessionStorage
    const saved = sessionStorage.getItem('nav_trail');
    if (saved) {
      try {
        return JSON.parse(saved);
      } catch {
        return [];
      }
    }
    return [];
  });
  
  // Track if navigation was from sidebar
  const [isFromSidebar, setIsFromSidebar] = useState(false);
  
  // Filter states storage: { path: { filters } }
  const [filterStates, setFilterStates] = useState(() => {
    const saved = sessionStorage.getItem('nav_filters');
    if (saved) {
      try {
        return JSON.parse(saved);
      } catch {
        return {};
      }
    }
    return {};
  });

  // Persist trail to sessionStorage
  useEffect(() => {
    sessionStorage.setItem('nav_trail', JSON.stringify(trail));
  }, [trail]);
  
  // Persist filter states to sessionStorage
  useEffect(() => {
    sessionStorage.setItem('nav_filters', JSON.stringify(filterStates));
  }, [filterStates]);

  /**
   * Get label for a path (handles dynamic routes)
   */
  const getRouteLabel = useCallback((path, customLabel = null) => {
    if (customLabel) return customLabel;
    
    // Check static routes
    if (ROUTE_META[path]) {
      return ROUTE_META[path].label;
    }
    
    // Handle dynamic routes
    if (path.match(/^\/leads\/[^/]+$/)) return 'Lead Details';
    if (path.match(/^\/leads\/[^/]+\/edit$/)) return 'Edit Lead';
    if (path.match(/^\/accounts\/[^/]+$/)) return 'Account Details';
    if (path.match(/^\/target-planning\/[^/]+$/)) return 'Plan Dashboard';
    
    // Default: capitalize path segment
    const segments = path.split('/').filter(Boolean);
    if (segments.length > 0) {
      return segments[segments.length - 1]
        .split('-')
        .map(word => word.charAt(0).toUpperCase() + word.slice(1))
        .join(' ');
    }
    
    return 'Page';
  }, []);

  /**
   * Navigate with tracking
   * @param {string} to - Destination path
   * @param {object} options - { label, filters, fromSidebar, replace }
   */
  const navigateTo = useCallback((to, options = {}) => {
    const { label, filters, fromSidebar = false, replace = false } = options;
    const currentPath = location.pathname;
    const currentSearch = location.search;
    
    // Save current page's filters before navigating
    if (filters) {
      setFilterStates(prev => ({
        ...prev,
        [currentPath]: filters
      }));
    }
    
    // Parse destination
    const [destPath, destSearch] = to.includes('?') ? to.split('?') : [to, ''];
    
    if (fromSidebar || SIDEBAR_ROUTES.includes(destPath)) {
      // Sidebar navigation: reset trail to just the destination
      setTrail([{
        path: destPath,
        search: destSearch ? `?${destSearch}` : '',
        label: getRouteLabel(destPath, label)
      }]);
      setIsFromSidebar(true);
    } else {
      // In-app navigation: append to trail
      setTrail(prev => {
        // Check if we're going back to a page already in trail
        const existingIndex = prev.findIndex(item => item.path === destPath);
        
        if (existingIndex !== -1) {
          // Going back: truncate trail to that point
          return prev.slice(0, existingIndex + 1).map((item, idx) => 
            idx === existingIndex 
              ? { ...item, search: destSearch ? `?${destSearch}` : item.search }
              : item
          );
        }
        
        // Going forward: add new entry, but avoid duplicates
        const newEntry = {
          path: destPath,
          search: destSearch ? `?${destSearch}` : '',
          label: getRouteLabel(destPath, label)
        };
        
        // Don't add if it's the same as the last entry
        if (prev.length > 0 && prev[prev.length - 1].path === destPath) {
          return prev.map((item, idx) => 
            idx === prev.length - 1 ? newEntry : item
          );
        }
        
        return [...prev, newEntry];
      });
      setIsFromSidebar(false);
    }
    
    // Perform navigation
    navigate(to, { replace });
  }, [location, navigate, getRouteLabel]);

  /**
   * Navigate back in the trail
   */
  const navigateBack = useCallback(() => {
    if (trail.length > 1) {
      const prevPage = trail[trail.length - 2];
      const savedFilters = filterStates[prevPage.path];
      
      // Build URL with saved filters
      let url = prevPage.path;
      if (savedFilters && Object.keys(savedFilters).length > 0) {
        const params = new URLSearchParams();
        Object.entries(savedFilters).forEach(([key, value]) => {
          if (value !== null && value !== undefined && value !== '' && value !== 'all') {
            if (Array.isArray(value) && value.length > 0) {
              params.set(key, value.join(','));
            } else if (!Array.isArray(value)) {
              params.set(key, value);
            }
          }
        });
        if (params.toString()) {
          url += `?${params.toString()}`;
        }
      } else if (prevPage.search) {
        url += prevPage.search;
      }
      
      // Remove current page from trail
      setTrail(prev => prev.slice(0, -1));
      
      navigate(url);
    } else {
      navigate('/home');
    }
  }, [trail, filterStates, navigate]);

  /**
   * Update current page's label (for dynamic content like lead name)
   */
  const updateCurrentLabel = useCallback((label) => {
    setTrail(prev => {
      if (prev.length === 0) return prev;
      const updated = [...prev];
      updated[updated.length - 1] = {
        ...updated[updated.length - 1],
        label
      };
      return updated;
    });
  }, []);

  /**
   * Save filters for current page
   */
  const saveFilters = useCallback((filters) => {
    const currentPath = location.pathname;
    setFilterStates(prev => ({
      ...prev,
      [currentPath]: filters
    }));
  }, [location.pathname]);

  /**
   * Get saved filters for a path
   */
  const getFilters = useCallback((path = null) => {
    const targetPath = path || location.pathname;
    return filterStates[targetPath] || {};
  }, [filterStates, location.pathname]);

  /**
   * Clear navigation trail (e.g., on logout)
   */
  const clearNavigation = useCallback(() => {
    setTrail([]);
    setFilterStates({});
    sessionStorage.removeItem('nav_trail');
    sessionStorage.removeItem('nav_filters');
  }, []);

  /**
   * Get breadcrumb items for display
   */
  const getBreadcrumbs = useCallback(() => {
    // Always start with Home
    const breadcrumbs = [{ path: '/home', label: 'Home', isHome: true }];
    
    // Add trail items (skip if trail starts with home)
    trail.forEach((item, index) => {
      if (item.path === '/home') return;
      breadcrumbs.push({
        ...item,
        isCurrent: index === trail.length - 1
      });
    });
    
    return breadcrumbs;
  }, [trail]);

  // Handle initial page load / direct URL access
  useEffect(() => {
    const currentPath = location.pathname;
    
    // Skip login and auth pages
    if (['/login', '/', '/auth/callback'].includes(currentPath)) {
      return;
    }
    
    // If trail is empty or doesn't end with current path, initialize it
    if (trail.length === 0 || trail[trail.length - 1]?.path !== currentPath) {
      setTrail([{
        path: currentPath,
        search: location.search,
        label: getRouteLabel(currentPath)
      }]);
    }
  }, []); // Only run on mount

  const value = {
    trail,
    navigateTo,
    navigateBack,
    updateCurrentLabel,
    saveFilters,
    getFilters,
    clearNavigation,
    getBreadcrumbs,
    isFromSidebar,
    getRouteLabel,
  };

  return (
    <NavigationContext.Provider value={value}>
      {children}
    </NavigationContext.Provider>
  );
};

export default NavigationContext;
