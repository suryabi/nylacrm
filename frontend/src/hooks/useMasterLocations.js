import { useState, useEffect, useCallback } from 'react';
import axios from 'axios';

const API_URL = process.env.REACT_APP_BACKEND_URL + '/api';

/**
 * Hook to fetch and use master locations data across the application
 * Provides territories, states, and cities with helper functions for filtering
 */
export function useMasterLocations() {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [territories, setTerritories] = useState([]);
  const [states, setStates] = useState([]);
  const [cities, setCities] = useState([]);

  const fetchLocations = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const token = localStorage.getItem('token');
      
      const response = await axios.get(`${API_URL}/master-locations/flat`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      
      setTerritories(response.data.territories || []);
      setStates(response.data.states || []);
      setCities(response.data.cities || []);
    } catch (err) {
      setError(err.message);
      console.error('Failed to fetch master locations:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchLocations();
  }, [fetchLocations]);

  // Get states for a specific territory
  const getStatesByTerritory = useCallback((territoryId) => {
    if (!territoryId || territoryId === 'all') return states;
    return states.filter(s => s.territory_id === territoryId);
  }, [states]);

  // Get cities for a specific state
  const getCitiesByState = useCallback((stateId) => {
    if (!stateId || stateId === 'all') return cities;
    return cities.filter(c => c.state_id === stateId);
  }, [cities]);

  // Get territory name by ID
  const getTerritoryName = useCallback((territoryId) => {
    const territory = territories.find(t => t.id === territoryId);
    return territory?.name || '';
  }, [territories]);

  // Get state name by ID
  const getStateName = useCallback((stateId) => {
    const state = states.find(s => s.id === stateId);
    return state?.name || '';
  }, [states]);

  // Get city name by ID
  const getCityName = useCallback((cityId) => {
    const city = cities.find(c => c.id === cityId);
    return city?.name || '';
  }, [cities]);

  // Get territory options for dropdown (with "All" option)
  const getTerritoryOptions = useCallback((includeAll = true) => {
    const options = territories.map(t => ({ value: t.id, label: t.name }));
    if (includeAll) {
      return [{ value: 'all', label: 'All Territories' }, ...options];
    }
    return options;
  }, [territories]);

  // Get state options for dropdown (with optional territory filter)
  const getStateOptions = useCallback((territoryId = null, includeAll = true) => {
    let filteredStates = states;
    if (territoryId && territoryId !== 'all') {
      filteredStates = states.filter(s => s.territory_id === territoryId);
    }
    const options = filteredStates.map(s => ({ value: s.id, label: s.name }));
    if (includeAll) {
      return [{ value: 'all', label: 'All States' }, ...options];
    }
    return options;
  }, [states]);

  // Get city options for dropdown (with optional state filter)
  const getCityOptions = useCallback((stateId = null, includeAll = true) => {
    let filteredCities = cities;
    if (stateId && stateId !== 'all') {
      filteredCities = cities.filter(c => c.state_id === stateId);
    }
    const options = filteredCities.map(c => ({ value: c.id, label: c.name }));
    if (includeAll) {
      return [{ value: 'all', label: 'All Cities' }, ...options];
    }
    return options;
  }, [cities]);

  // Get territory/state/city names as arrays for simple dropdowns
  const territoryNames = territories.map(t => t.name);
  const stateNames = states.map(s => s.name);
  const cityNames = cities.map(c => c.name);

  // Legacy format: Get states by territory name
  const getStateNamesByTerritoryName = useCallback((territoryName) => {
    if (!territoryName || territoryName === 'All Territories') return stateNames;
    const territory = territories.find(t => t.name === territoryName);
    if (!territory) return [];
    return states.filter(s => s.territory_id === territory.id).map(s => s.name);
  }, [territories, states, stateNames]);

  // Legacy format: Get cities by state name
  const getCityNamesByStateName = useCallback((stateName) => {
    if (!stateName || stateName === 'All States') return cityNames;
    const state = states.find(s => s.name === stateName);
    if (!state) return [];
    return cities.filter(c => c.state_id === state.id).map(c => c.name);
  }, [states, cities, cityNames]);

  return {
    loading,
    error,
    territories,
    states,
    cities,
    refetch: fetchLocations,
    // Helper functions
    getStatesByTerritory,
    getCitiesByState,
    getTerritoryName,
    getStateName,
    getCityName,
    getTerritoryOptions,
    getStateOptions,
    getCityOptions,
    // Simple arrays for legacy compatibility
    territoryNames,
    stateNames,
    cityNames,
    getStateNamesByTerritoryName,
    getCityNamesByStateName,
  };
}

export default useMasterLocations;
