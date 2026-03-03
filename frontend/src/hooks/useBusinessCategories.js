import { useState, useEffect } from 'react';
import axios from 'axios';

const API_URL = process.env.REACT_APP_BACKEND_URL + '/api';

export function useBusinessCategories() {
  const [categories, setCategories] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    const fetchCategories = async () => {
      try {
        const response = await axios.get(`${API_URL}/master/business-categories`, {
          withCredentials: true
        });
        // Extract just the names for dropdown compatibility
        const categoryList = (response.data.categories || [])
          .filter(cat => cat.is_active !== false)
          .map(cat => cat.name);
        setCategories(categoryList);
      } catch (err) {
        console.error('Failed to fetch business categories:', err);
        setError(err);
        // Fallback to hardcoded list if API fails
        setCategories([
          'Restaurant',
          'Bar & Kitchen',
          'Star Hotel',
          'Cafe',
          'Event Caterer',
          'HNIs',
          'Government',
          'Theatre',
          'Premium Club',
          'Wellness Center',
          'Corporate'
        ]);
      } finally {
        setLoading(false);
      }
    };

    fetchCategories();
  }, []);

  return { categories, loading, error };
}
