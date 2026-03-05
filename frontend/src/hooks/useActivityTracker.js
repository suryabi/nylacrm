import { useEffect, useRef, useCallback } from 'react';
import { useLocation } from 'react-router-dom';
import axios from 'axios';

const API_URL = process.env.REACT_APP_BACKEND_URL;
const HEARTBEAT_INTERVAL = 30000; // 30 seconds

export function useActivityTracker() {
  const location = useLocation();
  const lastPageRef = useRef(location.pathname);
  const intervalRef = useRef(null);

  const sendHeartbeat = useCallback(async (action = null) => {
    const token = localStorage.getItem('token');
    if (!token) return;

    try {
      await axios.post(
        `${API_URL}/api/activity/heartbeat`,
        {
          current_page: location.pathname,
          action: action
        },
        {
          headers: { Authorization: `Bearer ${token}` },
          withCredentials: true
        }
      );
    } catch (error) {
      // Silently fail - don't disrupt user experience
      console.debug('Activity heartbeat failed:', error.message);
    }
  }, [location.pathname]);

  // Track page changes
  useEffect(() => {
    if (lastPageRef.current !== location.pathname) {
      sendHeartbeat(`navigated_to_${location.pathname.replace(/\//g, '_')}`);
      lastPageRef.current = location.pathname;
    }
  }, [location.pathname, sendHeartbeat]);

  // Start heartbeat interval
  useEffect(() => {
    const token = localStorage.getItem('token');
    if (!token) return;

    // Initial heartbeat
    sendHeartbeat();

    // Set up interval
    intervalRef.current = setInterval(() => {
      sendHeartbeat();
    }, HEARTBEAT_INTERVAL);

    // Cleanup on unmount
    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
      }
    };
  }, [sendHeartbeat]);

  // Track user actions
  const trackAction = useCallback((action) => {
    sendHeartbeat(action);
  }, [sendHeartbeat]);

  return { trackAction };
}

// Utility function to format time duration
export function formatDuration(seconds) {
  if (!seconds || seconds < 0) return '0s';
  
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const secs = Math.floor(seconds % 60);
  
  if (hours > 0) {
    return `${hours}h ${minutes}m`;
  } else if (minutes > 0) {
    return `${minutes}m ${secs}s`;
  } else {
    return `${secs}s`;
  }
}

// Utility function to format relative time
export function formatRelativeTime(isoString) {
  if (!isoString) return 'Never';
  
  const date = new Date(isoString);
  const now = new Date();
  const diffMs = now - date;
  const diffSecs = Math.floor(diffMs / 1000);
  const diffMins = Math.floor(diffSecs / 60);
  const diffHours = Math.floor(diffMins / 60);
  const diffDays = Math.floor(diffHours / 24);
  
  if (diffSecs < 60) {
    return 'Just now';
  } else if (diffMins < 60) {
    return `${diffMins}m ago`;
  } else if (diffHours < 24) {
    return `${diffHours}h ago`;
  } else if (diffDays < 7) {
    return `${diffDays}d ago`;
  } else {
    return date.toLocaleDateString();
  }
}

// Page name mapping for display
export const PAGE_NAMES = {
  '/': 'Dashboard',
  '/dashboard': 'Dashboard',
  '/leads': 'Leads',
  '/leads/add': 'Add Lead',
  '/accounts': 'Accounts',
  '/team': 'Team Management',
  '/team-status': 'Team Status',
  '/daily-status': 'Daily Status',
  '/target-planning': 'Target Planning',
  '/cogs-calculator': 'COGS Calculator',
  '/transport-calculator': 'Transport Calculator',
  '/sku-management': 'SKU Management',
  '/bottle-preview': 'Bottle Preview',
  '/sales-portal': 'Sales Portal',
  '/files-documents': 'Files & Documents',
  '/lead-discovery': 'Lead Discovery',
  '/login': 'Login'
};

export function getPageName(path) {
  // Check exact match first
  if (PAGE_NAMES[path]) {
    return PAGE_NAMES[path];
  }
  
  // Check for dynamic routes
  if (path.startsWith('/leads/')) {
    return 'Lead Details';
  }
  if (path.startsWith('/accounts/')) {
    return 'Account Details';
  }
  
  // Default to cleaned path
  return path.replace(/\//g, ' ').trim() || 'Home';
}
