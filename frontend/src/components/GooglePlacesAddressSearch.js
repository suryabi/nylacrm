import React, { useState, useCallback, useRef } from 'react';
import axios from 'axios';
import { Search, Loader2, MapPin } from 'lucide-react';
import { Input } from './ui/input';

const API_URL = process.env.REACT_APP_BACKEND_URL + '/api';

/**
 * GooglePlacesAddressSearch — reusable autocomplete input that calls our
 * backend `/lead-discovery/autocomplete` and `/accounts/places/details`
 * endpoints (both already wired to Google Places API New).
 *
 * Props:
 *   - cityHint: optional string — biases search & sorts in-city results first
 *   - placeholder: input placeholder
 *   - onPick(place):  fires with `{address_line_1, address_line_2, city, state,
 *                     pincode, lat, lng, formatted_address}` once the user picks
 *                     a suggestion. All fields may be empty strings.
 *   - testId: optional data-testid prefix
 */
export default function GooglePlacesAddressSearch({ cityHint, placeholder, onPick, testId = 'places-search' }) {
  const [query, setQuery] = useState('');
  const [suggestions, setSuggestions] = useState([]);
  const [searching, setSearching] = useState(false);
  const [open, setOpen] = useState(false);
  const debounceRef = useRef(null);

  const fetchSuggestions = useCallback(async (q) => {
    if (!q || q.length < 3) {
      setSuggestions([]);
      setSearching(false);
      return;
    }
    setSearching(true);
    try {
      const { data } = await axios.post(
        `${API_URL}/lead-discovery/autocomplete`,
        { input: q, city: cityHint || '' },
        { withCredentials: true }
      );
      const preds = data?.predictions || [];
      const cl = (cityHint || '').toLowerCase();
      preds.sort((a, b) => {
        const aIn = a.description.toLowerCase().includes(cl);
        const bIn = b.description.toLowerCase().includes(cl);
        if (aIn && !bIn) return -1;
        if (!aIn && bIn) return 1;
        return 0;
      });
      setSuggestions(preds);
      setOpen(true);
    } catch (_) {
      setSuggestions([]);
    } finally {
      setSearching(false);
    }
  }, [cityHint]);

  const handleChange = (v) => {
    setQuery(v);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => fetchSuggestions(v), 250);
  };

  const handlePick = async (p) => {
    setQuery(p.description);
    setSuggestions([]);
    setOpen(false);
    try {
      const { data } = await axios.get(`${API_URL}/accounts/places/details`, {
        params: { place_id: p.place_id },
        withCredentials: true,
      });
      const a = data?.address || {};
      onPick?.({
        address_line_1: a.address_line1 || p.description.split(',')[0]?.trim() || '',
        address_line_2: a.address_line2 || '',
        city: a.city || '',
        state: a.state || '',
        pincode: a.pincode || '',
        lat: data?.lat ?? null,
        lng: data?.lng ?? null,
        formatted_address: data?.formatted_address || p.description,
      });
    } catch (_) {
      // Fallback: hand back description-only
      onPick?.({
        address_line_1: p.description,
        address_line_2: '',
        city: '',
        state: '',
        pincode: '',
        lat: null,
        lng: null,
        formatted_address: p.description,
      });
    }
  };

  return (
    <div className="relative">
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400 pointer-events-none" />
        <Input
          value={query}
          onChange={(e) => handleChange(e.target.value)}
          onFocus={() => suggestions.length > 0 && setOpen(true)}
          onBlur={() => setTimeout(() => setOpen(false), 200)}
          placeholder={placeholder || 'Search for a place (3+ chars)…'}
          className="pl-9 pr-9"
          data-testid={`${testId}-input`}
        />
        {searching && (
          <Loader2 className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 animate-spin text-slate-400" />
        )}
      </div>
      {open && suggestions.length > 0 && (
        <div
          className="absolute z-50 mt-1 w-full bg-white border border-slate-200 rounded-md shadow-lg max-h-72 overflow-y-auto"
          data-testid={`${testId}-results`}
        >
          {suggestions.map((s, idx) => (
            <button
              key={s.place_id || idx}
              type="button"
              onClick={() => handlePick(s)}
              className="w-full text-left px-3 py-2 hover:bg-slate-50 border-b border-slate-100 last:border-b-0 flex items-start gap-2"
              data-testid={`${testId}-option-${idx}`}
            >
              <MapPin className="h-4 w-4 mt-0.5 text-slate-400 flex-shrink-0" />
              <div className="min-w-0">
                <div className="text-sm text-slate-800 truncate">
                  {s.structured_formatting?.main_text || s.description.split(',')[0]}
                </div>
                <div className="text-xs text-slate-500 truncate">
                  {s.structured_formatting?.secondary_text || s.description}
                </div>
              </div>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
