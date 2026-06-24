import React, { useState, useCallback, useEffect, useRef } from 'react';
import axios from 'axios';
import { Button } from './ui/button';
import { Card } from './ui/card';
import { Input } from './ui/input';
import { Label } from './ui/label';
import { Badge } from './ui/badge';
import {
  MapPin,
  Truck,
  Search,
  Loader2,
  Save,
  Pencil,
  ExternalLink,
  Copy,
  Crosshair,
} from 'lucide-react';
import { toast } from 'sonner';
import { leadsAPI } from '../utils/api';
import { isValidMapsLink } from '../utils/mapsLink';

const API_URL = process.env.REACT_APP_BACKEND_URL;
const getHeaders = () => {
  const token = localStorage.getItem('token');
  return token ? { Authorization: `Bearer ${token}` } : {};
};

/**
 * Delivery address card for a Lead with Google Places autocomplete,
 * lat/lng capture, and a geo-fenced "I am here" check-in button.
 */
export default function LeadDeliveryAddressCard({ lead, onLeadUpdated, onActivityLogged }) {
  const saved = lead?.delivery_address || {};
  const hasSavedAddress = !!saved.address_line1;
  const hasCoordinates = saved.lat != null && saved.lng != null;

  const [editing, setEditing] = useState(!hasSavedAddress);
  const [saving, setSaving] = useState(false);
  const [checkingIn, setCheckingIn] = useState(false);

  const [form, setForm] = useState({
    address_line1: saved.address_line1 || '',
    address_line2: saved.address_line2 || '',
    city: saved.city || lead?.city || '',
    state: saved.state || lead?.state || '',
    pincode: saved.pincode || '',
    landmark: saved.landmark || '',
    lat: saved.lat ?? null,
    lng: saved.lng ?? null,
    maps_link: saved.maps_link || '',
    formatted_address: saved.formatted_address || '',
  });

  const [searchQuery, setSearchQuery] = useState(saved.address_line1 || '');
  const [suggestions, setSuggestions] = useState([]);
  const [isSearching, setIsSearching] = useState(false);
  const searchRef = useRef(null);

  // Sync state when the lead prop changes (after save)
  useEffect(() => {
    const s = lead?.delivery_address || {};
    setForm({
      address_line1: s.address_line1 || '',
      address_line2: s.address_line2 || '',
      city: s.city || lead?.city || '',
      state: s.state || lead?.state || '',
      pincode: s.pincode || '',
      landmark: s.landmark || '',
      lat: s.lat ?? null,
      lng: s.lng ?? null,
      maps_link: s.maps_link || '',
      formatted_address: s.formatted_address || '',
    });
    setSearchQuery(s.address_line1 || '');
    setEditing(!s.address_line1);
  }, [lead?.delivery_address, lead?.city, lead?.state]);

  // Close suggestions when clicking outside
  useEffect(() => {
    const handler = (e) => {
      if (searchRef.current && !searchRef.current.contains(e.target)) {
        setSuggestions([]);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const handleSearch = useCallback(async (query) => {
    setSearchQuery(query);
    if (!query || query.length < 3) {
      setSuggestions([]);
      setIsSearching(false);
      return;
    }
    setIsSearching(true);
    try {
      const res = await axios.post(
        `${API_URL}/api/lead-discovery/autocomplete`,
        { input: query, city: lead?.city || '' },
        { headers: getHeaders(), withCredentials: true }
      );
      const predictions = res.data.predictions || [];
      const cityLower = (lead?.city || '').toLowerCase();
      const sorted = predictions.sort((a, b) => {
        const aIn = a.description.toLowerCase().includes(cityLower);
        const bIn = b.description.toLowerCase().includes(cityLower);
        if (aIn && !bIn) return -1;
        if (!aIn && bIn) return 1;
        return 0;
      });
      setSuggestions(sorted);
    } catch (err) {
      console.error('Address search error:', err);
      setSuggestions([]);
    } finally {
      setIsSearching(false);
    }
  }, [lead?.city]);

  const handleSelectSuggestion = async (placeId, description) => {
    setSuggestions([]);
    setSearchQuery(description);
    try {
      const res = await axios.get(`${API_URL}/api/accounts/places/details`, {
        params: { place_id: placeId },
        headers: getHeaders(),
        withCredentials: true,
      });
      const data = res.data || {};
      const a = data.address || {};
      setForm((prev) => ({
        ...prev,
        address_line1: a.address_line1 || description.split(',')[0]?.trim() || prev.address_line1,
        address_line2: a.address_line2 || prev.address_line2,
        city: a.city || prev.city || lead?.city || '',
        state: a.state || prev.state || lead?.state || '',
        pincode: a.pincode || prev.pincode || '',
        lat: data.lat ?? null,
        lng: data.lng ?? null,
        formatted_address: data.formatted_address || description,
      }));
      toast.success('Address selected — lat/lng captured');
    } catch (err) {
      // Fallback: just keep description
      setForm((prev) => ({
        ...prev,
        address_line1: description.split(',')[0]?.trim() || prev.address_line1,
        formatted_address: description,
      }));
      toast.success('Address selected — please verify details');
    }
  };

  const handleSave = async () => {
    if (!form.address_line1?.trim()) {
      toast.error('Please enter or pick an address');
      return;
    }
    if (!isValidMapsLink(form.maps_link)) {
      toast.error('Enter a valid Google Maps link (e.g. https://maps.app.goo.gl/...)');
      return;
    }
    setSaving(true);
    try {
      await leadsAPI.update(lead.id, { delivery_address: form });
      toast.success('Lead address saved');
      setEditing(false);
      if (onLeadUpdated) await onLeadUpdated();
    } catch (err) {
      toast.error(err.response?.data?.detail || 'Failed to save address');
    } finally {
      setSaving(false);
    }
  };

  const handleCancel = () => {
    const s = lead?.delivery_address || {};
    setForm({
      address_line1: s.address_line1 || '',
      address_line2: s.address_line2 || '',
      city: s.city || lead?.city || '',
      state: s.state || lead?.state || '',
      pincode: s.pincode || '',
      landmark: s.landmark || '',
      lat: s.lat ?? null,
      lng: s.lng ?? null,
      maps_link: s.maps_link || '',
      formatted_address: s.formatted_address || '',
    });
    setSearchQuery(s.address_line1 || '');
    setEditing(false);
  };

  const buildMapsUrl = () => {
    if (!hasSavedAddress) return null;
    if (hasCoordinates) {
      return `https://www.google.com/maps/?q=${saved.lat},${saved.lng}`;
    }
    const parts = [saved.address_line1, saved.city, saved.state, saved.pincode]
      .filter(Boolean).join(', ') + ', India';
    return `https://www.google.com/maps/place/${encodeURIComponent(parts)}`;
  };

  const handleCopyAddress = () => {
    const fullAddress = [
      saved.address_line1, saved.address_line2, saved.landmark,
      saved.city, saved.state, saved.pincode,
    ].filter((p) => p && String(p).trim()).join(', ');
    const text = `${lead?.company || ''}\n${fullAddress}\n\n${buildMapsUrl() || ''}`;
    navigator.clipboard.writeText(text).then(
      () => toast.success('Address copied to clipboard'),
      () => toast.error('Could not copy')
    );
  };

  const handleCheckIn = () => {
    if (!hasCoordinates) {
      toast.error('Save the lead address from Google search first so we have GPS coordinates.');
      return;
    }
    if (!('geolocation' in navigator)) {
      toast.error('Geolocation is not supported on this device');
      return;
    }
    setCheckingIn(true);
    navigator.geolocation.getCurrentPosition(
      async (pos) => {
        try {
          const { latitude, longitude, accuracy } = pos.coords;
          const res = await axios.post(
            `${API_URL}/api/leads/${lead.id}/check-in`,
            { latitude, longitude, accuracy },
            { headers: getHeaders(), withCredentials: true }
          );
          const data = res.data || {};
          const distanceLabel = data.distance_m != null
            ? (data.distance_m < 1000
                ? `${Math.round(data.distance_m)}m`
                : `${(data.distance_m / 1000).toFixed(2)}km`)
            : '';
          if (data.within_radius) {
            toast.success(`Checked in — ${distanceLabel} from lead`);
          } else {
            toast.warning(
              `Logged off-site visit — you are ${distanceLabel} away (radius ${data.radius_m}m)`
            );
          }
          if (onActivityLogged) await onActivityLogged();
        } catch (err) {
          toast.error(err.response?.data?.detail || 'Check-in failed');
        } finally {
          setCheckingIn(false);
        }
      },
      (err) => {
        setCheckingIn(false);
        if (err.code === 1) {
          toast.error('Location permission denied. Enable it in your browser.');
        } else if (err.code === 2) {
          toast.error('Could not determine your location. Please try again.');
        } else if (err.code === 3) {
          toast.error('Location request timed out. Please try again.');
        } else {
          toast.error('Could not access your location');
        }
      },
      { enableHighAccuracy: true, timeout: 15000, maximumAge: 0 }
    );
  };

  return (
    <Card className="p-4 sm:p-6">
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <div className="flex h-7 w-7 items-center justify-center rounded-md bg-slate-900 text-blue-300">
            <Truck className="h-3.5 w-3.5" strokeWidth={2.25} />
          </div>
          <span className="font-semibold text-sm text-slate-900">Lead Address</span>
          {hasCoordinates && (
            <Badge variant="outline" className="bg-emerald-50 text-emerald-700 border-emerald-200 text-[10px]">
              <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 mr-1" />
              GPS Locked
            </Badge>
          )}
        </div>

        {!editing && hasSavedAddress && (
          <div className="flex items-center gap-1">
            <button
              type="button"
              onClick={handleCopyAddress}
              className="p-1.5 rounded-md hover:bg-slate-100 text-slate-600 hover:text-slate-900 transition-colors"
              title="Copy address"
              data-testid="lead-copy-address-btn"
            >
              <Copy className="h-4 w-4" />
            </button>
            <a
              href={buildMapsUrl()}
              target="_blank"
              rel="noopener noreferrer"
              className="p-1.5 rounded-md hover:bg-slate-100 text-slate-600 hover:text-slate-900 transition-colors"
              title="Open in Google Maps"
              data-testid="lead-open-maps-btn"
            >
              <ExternalLink className="h-4 w-4" />
            </a>
            <button
              type="button"
              onClick={() => setEditing(true)}
              className="p-1.5 rounded-md hover:bg-slate-100 text-slate-600 hover:text-slate-900 transition-colors"
              title="Edit address"
              data-testid="lead-edit-address-btn"
            >
              <Pencil className="h-4 w-4" />
            </button>
          </div>
        )}
      </div>

      {/* Visiting-card view */}
      {!editing && hasSavedAddress ? (
        <div className="relative overflow-hidden rounded-lg border border-slate-200 bg-gradient-to-br from-slate-50 to-white p-4 shadow-inner">
          <div className="absolute left-0 top-0 bottom-0 w-1 bg-gradient-to-b from-blue-600 via-blue-500 to-blue-600" />
          <div className="absolute top-3 right-3 opacity-[0.06] pointer-events-none">
            <MapPin className="h-16 w-16 text-slate-900" strokeWidth={1.5} />
          </div>
          <div className="relative pl-2">
            <p className="text-[10px] uppercase tracking-wider text-slate-400 font-semibold mb-1.5">
              Lead Location
            </p>
            <p className="text-[15px] font-semibold text-slate-900 leading-snug">
              {saved.address_line1}
            </p>
            {saved.address_line2 && (
              <p className="text-sm text-slate-700 leading-snug">{saved.address_line2}</p>
            )}
            <p className="text-sm text-slate-700 leading-snug">
              {[saved.city, saved.state, saved.pincode].filter(Boolean).join(', ')}
            </p>
            {saved.landmark && (
              <p className="text-xs text-slate-500 mt-1.5 italic">Landmark: {saved.landmark}</p>
            )}
            {hasCoordinates && (
              <div className="mt-3 pt-3 border-t border-slate-200/70 flex items-center gap-3">
                <div className="flex h-8 w-8 items-center justify-center rounded-md bg-slate-900 text-blue-300">
                  <MapPin className="h-4 w-4" strokeWidth={2.25} />
                </div>
                <div className="min-w-0">
                  <p className="text-[10px] uppercase tracking-wider text-slate-400 font-semibold">
                    GPS Coordinates
                  </p>
                  <p className="text-xs font-mono text-slate-700 tabular-nums">
                    {Number(saved.lat).toFixed(6)}, {Number(saved.lng).toFixed(6)}
                  </p>
                </div>
              </div>
            )}
          </div>
        </div>
      ) : (
        <>
          {/* Edit form */}
          <div className="relative mb-4" ref={searchRef}>
            <div className="flex items-center justify-between mb-2">
              <Label className="text-sm font-medium">Search Address</Label>
              <div className="flex items-center gap-1 text-xs text-muted-foreground">
                <span>Powered by</span>
                <span className="font-semibold text-[#4285F4]">G</span>
                <span className="font-semibold text-[#EA4335]">o</span>
                <span className="font-semibold text-[#FBBC05]">o</span>
                <span className="font-semibold text-[#4285F4]">g</span>
                <span className="font-semibold text-[#34A853]">l</span>
                <span className="font-semibold text-[#EA4335]">e</span>
              </div>
            </div>

            {lead?.city && (
              <div className="mb-2">
                <Badge variant="outline" className="text-xs bg-blue-50 text-blue-700 border-blue-200">
                  <MapPin className="h-3 w-3 mr-1" />
                  Searching in {lead.city}{lead.state ? `, ${lead.state}` : ''}
                </Badge>
              </div>
            )}

            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-blue-500" />
              <Input
                type="text"
                placeholder={`Search address in ${lead?.city || 'your city'}...`}
                value={searchQuery}
                onChange={(e) => handleSearch(e.target.value)}
                className="pl-10 pr-10 border-blue-200 focus:border-blue-400 focus:ring-blue-400/20"
                data-testid="lead-address-search-input"
              />
              {isSearching ? (
                <Loader2 className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 animate-spin text-blue-500" />
              ) : (
                <MapPin className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              )}
            </div>

            {suggestions.length > 0 && (
              <div className="absolute z-20 w-full mt-1 bg-white border border-blue-200 rounded-lg shadow-xl max-h-60 overflow-y-auto">
                {suggestions.map((s, idx) => (
                  <button
                    key={s.place_id}
                    type="button"
                    className={`w-full text-left px-4 py-3 hover:bg-blue-50 transition-colors flex items-start gap-3 ${idx !== suggestions.length - 1 ? 'border-b border-gray-100' : ''}`}
                    onClick={() => handleSelectSuggestion(s.place_id, s.description)}
                    data-testid={`lead-address-suggestion-${s.place_id}`}
                  >
                    <MapPin className="h-4 w-4 text-blue-500 mt-0.5 flex-shrink-0" />
                    <div>
                      <p className="text-sm font-medium text-gray-900">{s.structured_formatting?.main_text}</p>
                      <p className="text-xs text-muted-foreground">{s.structured_formatting?.secondary_text}</p>
                    </div>
                  </button>
                ))}
              </div>
            )}
          </div>

          <div className="space-y-3 pt-2 border-t">
            <p className="text-xs text-muted-foreground">
              Address fields will auto-populate when you select from search
            </p>
            <div>
              <Label className="text-xs text-muted-foreground">Address Line 1</Label>
              <Input
                value={form.address_line1}
                onChange={(e) => setForm({ ...form, address_line1: e.target.value })}
                placeholder="Street address"
                data-testid="lead-address-line1-input"
              />
            </div>
            <div>
              <Label className="text-xs text-muted-foreground">Address Line 2</Label>
              <Input
                value={form.address_line2}
                onChange={(e) => setForm({ ...form, address_line2: e.target.value })}
                placeholder="Area, Locality"
                data-testid="lead-address-line2-input"
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label className="text-xs text-muted-foreground">City</Label>
                <Input
                  value={form.city}
                  onChange={(e) => setForm({ ...form, city: e.target.value })}
                  placeholder="City"
                  data-testid="lead-address-city-input"
                />
              </div>
              <div>
                <Label className="text-xs text-muted-foreground">State</Label>
                <Input
                  value={form.state}
                  onChange={(e) => setForm({ ...form, state: e.target.value })}
                  placeholder="State"
                  data-testid="lead-address-state-input"
                />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label className="text-xs text-muted-foreground">Pincode</Label>
                <Input
                  value={form.pincode}
                  onChange={(e) => setForm({ ...form, pincode: e.target.value })}
                  placeholder="Pincode"
                  data-testid="lead-address-pincode-input"
                />
              </div>
              <div>
                <Label className="text-xs text-muted-foreground">Landmark</Label>
                <Input
                  value={form.landmark}
                  onChange={(e) => setForm({ ...form, landmark: e.target.value })}
                  placeholder="Landmark"
                  data-testid="lead-address-landmark-input"
                />
              </div>
            </div>
            <div>
              <Label className="text-xs text-muted-foreground flex items-center gap-1">
                <ExternalLink className="h-3 w-3" /> Google Maps Link
              </Label>
              <Input
                value={form.maps_link}
                onChange={(e) => setForm({ ...form, maps_link: e.target.value })}
                placeholder="Paste a Google Maps link e.g. https://maps.app.goo.gl/..."
                data-testid="lead-address-maps-link-input"
              />
              <p className="text-[11px] text-muted-foreground mt-1">Used for the delivery QR code when GPS isn't available.</p>
            </div>
          </div>

          <div className="flex gap-2 mt-4">
            <Button
              onClick={handleSave}
              className="flex-1"
              disabled={saving || !form.address_line1}
              data-testid="lead-save-address-btn"
            >
              {saving ? (
                <><Loader2 className="h-4 w-4 mr-2 animate-spin" /> Saving...</>
              ) : (
                <><Save className="h-4 w-4 mr-2" /> Save</>
              )}
            </Button>
            {hasSavedAddress && (
              <Button
                variant="outline"
                onClick={handleCancel}
                disabled={saving}
                data-testid="lead-cancel-address-edit-btn"
              >
                Cancel
              </Button>
            )}
          </div>
        </>
      )}

      {/* "I am here" check-in */}
      <div className="mt-4 pt-4 border-t">
        <div className="flex items-start justify-between gap-3 flex-wrap">
          <div className="min-w-0">
            <p className="text-sm font-semibold text-slate-900 flex items-center gap-2">
              <Crosshair className="h-4 w-4 text-blue-600" />
              Field check-in
            </p>
            <p className="text-xs text-muted-foreground mt-0.5">
              Tap "I am here" to log your visit. Distance from the lead is captured automatically.
            </p>
          </div>
          <Button
            onClick={handleCheckIn}
            disabled={checkingIn || !hasCoordinates}
            data-testid="lead-i-am-here-btn"
          >
            {checkingIn ? (
              <><Loader2 className="h-4 w-4 mr-2 animate-spin" /> Locating...</>
            ) : (
              <><Crosshair className="h-4 w-4 mr-2" /> I am here</>
            )}
          </Button>
        </div>
        {!hasCoordinates && (
          <p className="text-[11px] text-amber-600 mt-2">
            Add the lead's address from Google search above to enable check-in.
          </p>
        )}
      </div>
    </Card>
  );
}
