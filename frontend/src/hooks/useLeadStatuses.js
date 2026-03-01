import { useState, useEffect } from 'react';
import axios from 'axios';

const API_URL = process.env.REACT_APP_BACKEND_URL + '/api';

// Color classes mapping
const getStatusColorClasses = (color) => {
  const colorMap = {
    blue: {
      badge: 'bg-blue-100 text-blue-800 dark:bg-blue-900/50 dark:text-blue-300',
      bg: 'bg-blue-500',
      bgLight: 'bg-blue-50',
      text: 'text-blue-700',
      border: 'border-blue-200',
    },
    green: {
      badge: 'bg-green-100 text-green-800 dark:bg-green-900/50 dark:text-green-300',
      bg: 'bg-green-500',
      bgLight: 'bg-green-50',
      text: 'text-green-700',
      border: 'border-green-200',
    },
    yellow: {
      badge: 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/50 dark:text-yellow-300',
      bg: 'bg-yellow-500',
      bgLight: 'bg-yellow-50',
      text: 'text-yellow-700',
      border: 'border-yellow-200',
    },
    purple: {
      badge: 'bg-purple-100 text-purple-800 dark:bg-purple-900/50 dark:text-purple-300',
      bg: 'bg-purple-500',
      bgLight: 'bg-purple-50',
      text: 'text-purple-700',
      border: 'border-purple-200',
    },
    cyan: {
      badge: 'bg-cyan-100 text-cyan-800 dark:bg-cyan-900/50 dark:text-cyan-300',
      bg: 'bg-cyan-500',
      bgLight: 'bg-cyan-50',
      text: 'text-cyan-700',
      border: 'border-cyan-200',
    },
    orange: {
      badge: 'bg-orange-100 text-orange-800 dark:bg-orange-900/50 dark:text-orange-300',
      bg: 'bg-orange-500',
      bgLight: 'bg-orange-50',
      text: 'text-orange-700',
      border: 'border-orange-200',
    },
    indigo: {
      badge: 'bg-indigo-100 text-indigo-800 dark:bg-indigo-900/50 dark:text-indigo-300',
      bg: 'bg-indigo-500',
      bgLight: 'bg-indigo-50',
      text: 'text-indigo-700',
      border: 'border-indigo-200',
    },
    emerald: {
      badge: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/50 dark:text-emerald-300',
      bg: 'bg-emerald-500',
      bgLight: 'bg-emerald-50',
      text: 'text-emerald-700',
      border: 'border-emerald-200',
    },
    red: {
      badge: 'bg-red-100 text-red-800 dark:bg-red-900/50 dark:text-red-300',
      bg: 'bg-red-500',
      bgLight: 'bg-red-50',
      text: 'text-red-700',
      border: 'border-red-200',
    },
    gray: {
      badge: 'bg-gray-100 text-gray-800 dark:bg-gray-800 dark:text-gray-300',
      bg: 'bg-gray-500',
      bgLight: 'bg-gray-50',
      text: 'text-gray-700',
      border: 'border-gray-200',
    },
    pink: {
      badge: 'bg-pink-100 text-pink-800 dark:bg-pink-900/50 dark:text-pink-300',
      bg: 'bg-pink-500',
      bgLight: 'bg-pink-50',
      text: 'text-pink-700',
      border: 'border-pink-200',
    },
    teal: {
      badge: 'bg-teal-100 text-teal-800 dark:bg-teal-900/50 dark:text-teal-300',
      bg: 'bg-teal-500',
      bgLight: 'bg-teal-50',
      text: 'text-teal-700',
      border: 'border-teal-200',
    },
  };
  return colorMap[color] || colorMap.gray;
};

// Cache for statuses
let cachedStatuses = null;
let cacheTimestamp = null;
const CACHE_DURATION = 5 * 60 * 1000; // 5 minutes

export function useLeadStatuses() {
  const [statuses, setStatuses] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    const fetchStatuses = async () => {
      // Check cache first
      if (cachedStatuses && cacheTimestamp && (Date.now() - cacheTimestamp < CACHE_DURATION)) {
        setStatuses(cachedStatuses);
        setLoading(false);
        return;
      }

      try {
        setLoading(true);
        const response = await axios.get(`${API_URL}/master/lead-statuses`, {
          withCredentials: true
        });
        
        const mappedStatuses = (response.data.statuses || []).map(s => ({
          id: s.id,
          value: s.id,
          label: s.label,
          color: s.color,
          order: s.order,
          is_active: s.is_active,
          ...getStatusColorClasses(s.color)
        }));
        
        // Update cache
        cachedStatuses = mappedStatuses;
        cacheTimestamp = Date.now();
        
        setStatuses(mappedStatuses);
        setError(null);
      } catch (err) {
        console.error('Failed to fetch lead statuses:', err);
        setError(err);
        // Use fallback statuses if API fails
        setStatuses(getFallbackStatuses());
      } finally {
        setLoading(false);
      }
    };

    fetchStatuses();
  }, []);

  // Helper functions
  const getStatusLabel = (statusId) => {
    const status = statuses.find(s => s.id === statusId);
    return status?.label || statusId;
  };

  const getStatusColor = (statusId) => {
    const status = statuses.find(s => s.id === statusId);
    return status?.badge || 'bg-gray-100 text-gray-800';
  };

  const getStatusById = (statusId) => {
    return statuses.find(s => s.id === statusId);
  };

  // Refresh cache
  const refreshStatuses = async () => {
    cachedStatuses = null;
    cacheTimestamp = null;
    setLoading(true);
    
    try {
      const response = await axios.get(`${API_URL}/master/lead-statuses`, {
        withCredentials: true
      });
      
      const mappedStatuses = (response.data.statuses || []).map(s => ({
        id: s.id,
        value: s.id,
        label: s.label,
        color: s.color,
        order: s.order,
        is_active: s.is_active,
        ...getStatusColorClasses(s.color)
      }));
      
      cachedStatuses = mappedStatuses;
      cacheTimestamp = Date.now();
      
      setStatuses(mappedStatuses);
    } catch (err) {
      console.error('Failed to refresh statuses:', err);
    } finally {
      setLoading(false);
    }
  };

  return {
    statuses,
    loading,
    error,
    getStatusLabel,
    getStatusColor,
    getStatusById,
    refreshStatuses,
    // For backward compatibility with SELECT components
    statusOptions: statuses.map(s => ({ value: s.id, label: s.label }))
  };
}

// Fallback statuses if API fails
function getFallbackStatuses() {
  return [
    { id: 'new', value: 'new', label: 'New', color: 'blue', ...getStatusColorClasses('blue') },
    { id: 'qualified', value: 'qualified', label: 'Qualified', color: 'green', ...getStatusColorClasses('green') },
    { id: 'contacted', value: 'contacted', label: 'Contacted', color: 'yellow', ...getStatusColorClasses('yellow') },
    { id: 'proposal_internal_review', value: 'proposal_internal_review', label: 'Proposal - Internal Review', color: 'purple', ...getStatusColorClasses('purple') },
    { id: 'ready_to_share_proposal', value: 'ready_to_share_proposal', label: 'Ready to Share Proposal', color: 'cyan', ...getStatusColorClasses('cyan') },
    { id: 'proposal_shared_with_customer', value: 'proposal_shared_with_customer', label: 'Proposal - Shared with Customer', color: 'orange', ...getStatusColorClasses('orange') },
    { id: 'trial_in_progress', value: 'trial_in_progress', label: 'Trial in Progress', color: 'indigo', ...getStatusColorClasses('indigo') },
    { id: 'won', value: 'won', label: 'Won', color: 'emerald', ...getStatusColorClasses('emerald') },
    { id: 'lost', value: 'lost', label: 'Lost', color: 'red', ...getStatusColorClasses('red') },
    { id: 'not_qualified', value: 'not_qualified', label: 'Not Qualified', color: 'gray', ...getStatusColorClasses('gray') },
  ];
}

// Export the color helper for direct use
export { getStatusColorClasses };
