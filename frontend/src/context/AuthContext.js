import React, { createContext, useState, useContext, useEffect, useCallback, useRef } from 'react';
import axios from 'axios';

const AuthContext = createContext();

const API_URL = process.env.REACT_APP_BACKEND_URL + '/api';
const INACTIVITY_TIMEOUT = 20 * 60 * 1000; // 20 minutes in milliseconds

// Set up axios interceptor to include X-Tenant-ID header on all requests
axios.interceptors.request.use((config) => {
  const tenantId = localStorage.getItem('selectedTenant') || 'nyla-air-water';
  config.headers['X-Tenant-ID'] = tenantId;
  return config;
});

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [token, setToken] = useState(localStorage.getItem('token'));
  const [sessionStartTime, setSessionStartTime] = useState(null);
  const [activeTime, setActiveTime] = useState(0);
  const lastActivityRef = useRef(Date.now());
  const inactivityTimerRef = useRef(null);
  const activeTimeIntervalRef = useRef(null);

  // Reset inactivity timer on user activity
  const resetInactivityTimer = useCallback(() => {
    lastActivityRef.current = Date.now();
    
    if (inactivityTimerRef.current) {
      clearTimeout(inactivityTimerRef.current);
    }
    
    if (user) {
      inactivityTimerRef.current = setTimeout(() => {
        // Auto logout due to inactivity
        logoutDueToInactivity();
      }, INACTIVITY_TIMEOUT);
    }
  }, [user]);

  // Track user activity
  useEffect(() => {
    if (!user) return;

    const events = ['mousedown', 'mousemove', 'keypress', 'scroll', 'touchstart', 'click'];
    
    const handleActivity = () => {
      resetInactivityTimer();
    };

    events.forEach(event => {
      document.addEventListener(event, handleActivity);
    });

    // Start inactivity timer
    resetInactivityTimer();

    return () => {
      events.forEach(event => {
        document.removeEventListener(event, handleActivity);
      });
      if (inactivityTimerRef.current) {
        clearTimeout(inactivityTimerRef.current);
      }
    };
  }, [user, resetInactivityTimer]);

  // Update active time every second
  useEffect(() => {
    if (sessionStartTime && user) {
      activeTimeIntervalRef.current = setInterval(() => {
        setActiveTime(Math.floor((Date.now() - sessionStartTime) / 1000));
      }, 1000);
    }

    return () => {
      if (activeTimeIntervalRef.current) {
        clearInterval(activeTimeIntervalRef.current);
      }
    };
  }, [sessionStartTime, user]);

  useEffect(() => {
    checkAuth();
  }, []);

  const checkAuth = async () => {
    try {
      // Check for cookie-based session first (Google OAuth)
      const response = await axios.get(`${API_URL}/auth/me`, {
        withCredentials: true  // Send cookies
      });
      setUser(response.data);
      // Restore session start time if available
      const storedSessionStart = localStorage.getItem('sessionStartTime');
      if (storedSessionStart) {
        setSessionStartTime(parseInt(storedSessionStart));
      } else {
        const now = Date.now();
        setSessionStartTime(now);
        localStorage.setItem('sessionStartTime', now.toString());
      }
      setLoading(false);
    } catch (error) {
      // If cookie auth fails, try JWT token
      if (token) {
        fetchCurrentUser();
      } else {
        setLoading(false);
      }
    }
  };

  const fetchCurrentUser = async () => {
    try {
      // Get tenant from localStorage for API calls
      const tenant = localStorage.getItem('selectedTenant') || 'nyla-air-water';
      
      const response = await axios.get(`${API_URL}/auth/me`, {
        headers: { 
          Authorization: `Bearer ${token}`,
          'X-Tenant-ID': tenant
        },
        withCredentials: true
      });
      setUser({ ...response.data, tenant_id: tenant });
      // Restore session start time if available
      const storedSessionStart = localStorage.getItem('sessionStartTime');
      if (storedSessionStart) {
        setSessionStartTime(parseInt(storedSessionStart));
      } else {
        const now = Date.now();
        setSessionStartTime(now);
        localStorage.setItem('sessionStartTime', now.toString());
      }
    } catch (error) {
      console.error('Failed to fetch user:', error);
      logout();
    } finally {
      setLoading(false);
    }
  };

  const login = async (email, password, tenantId = null) => {
    // Get tenant from parameter or localStorage
    const tenant = tenantId || localStorage.getItem('selectedTenant') || 'nyla-air-water';
    
    const response = await axios.post(`${API_URL}/auth/login`, { email, password }, {
      withCredentials: true,  // Important: receive and store cookies
      headers: {
        'X-Tenant-ID': tenant
      }
    });
    const { session_token, user: userData } = response.data;
    // Store session token as backup (cookie is primary)
    if (session_token) {
      localStorage.setItem('token', session_token);
      setToken(session_token);
    }
    // Store tenant_id with user
    localStorage.setItem('selectedTenant', tenant);
    setUser({ ...userData, tenant_id: tenant });
    // IMPORTANT: Set loading to false after successful login
    setLoading(false);
    // Set session start time
    const now = Date.now();
    setSessionStartTime(now);
    localStorage.setItem('sessionStartTime', now.toString());
    setActiveTime(0);
    return userData;
  };

  const register = async (userData) => {
    await axios.post(`${API_URL}/auth/register`, userData);
  };

  const logout = async (dueToInactivity = false) => {
    // Calculate time spent (exclude idle time if due to inactivity)
    let timeSpent = activeTime;
    if (dueToInactivity) {
      // Don't count the last 20 minutes of inactivity
      timeSpent = Math.max(0, activeTime - (INACTIVITY_TIMEOUT / 1000));
    }
    
    try {
      await axios.post(`${API_URL}/auth/logout`, { 
        time_spent: timeSpent,
        due_to_inactivity: dueToInactivity
      }, { withCredentials: true });
    } catch (error) {
      console.error('Logout error:', error);
    }
    localStorage.removeItem('token');
    localStorage.removeItem('sessionStartTime');
    setToken(null);
    setUser(null);
    setSessionStartTime(null);
    setActiveTime(0);
    
    if (inactivityTimerRef.current) {
      clearTimeout(inactivityTimerRef.current);
    }
  };

  const logoutDueToInactivity = async () => {
    await logout(true);
    // Redirect to login with message
    window.location.href = '/login?reason=inactivity';
  };

  return (
    <AuthContext.Provider value={{ 
      user, 
      loading, 
      login, 
      register, 
      logout, 
      token,
      sessionStartTime,
      activeTime
    }}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within AuthProvider');
  }
  return context;
};
