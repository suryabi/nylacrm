import React, { useEffect, useRef, useState, useCallback } from 'react';
import axios from 'axios';
import { Loader2, Navigation, RefreshCw } from 'lucide-react';
import { Card } from '../components/ui/card';
import { Button } from '../components/ui/button';
import { Badge } from '../components/ui/badge';

const API_URL = process.env.REACT_APP_BACKEND_URL + '/api';
const GMAPS_API_KEY = process.env.REACT_APP_GOOGLE_MAPS_API_KEY;

let gmapsLoaderPromise = null;
function loadGoogleMaps() {
  if (window.google?.maps) return Promise.resolve(window.google);
  if (gmapsLoaderPromise) return gmapsLoaderPromise;
  if (!GMAPS_API_KEY) return Promise.reject(new Error('Google Maps API key missing (REACT_APP_GOOGLE_MAPS_API_KEY)'));
  gmapsLoaderPromise = new Promise((resolve, reject) => {
    const s = document.createElement('script');
    s.src = `https://maps.googleapis.com/maps/api/js?key=${GMAPS_API_KEY}`;
    s.async = true; s.defer = true;
    s.onload = () => resolve(window.google);
    s.onerror = () => reject(new Error('Failed to load Google Maps script'));
    document.head.appendChild(s);
  });
  return gmapsLoaderPromise;
}

/**
 * LiveDriverMap — plots driver breadcrumbs + latest position for a delivery
 * schedule. Polls /tracking on the cadence configured per tenant
 * (gps_ping_interval_minutes). Used on Distributor & Admin schedule detail pages.
 */
export default function LiveDriverMap({ scheduleId }) {
  const mapRef = useRef(null);
  const mapInstanceRef = useRef(null);
  const markerRef = useRef(null);
  const polylineRef = useRef(null);
  const pingsRef = useRef([]);

  const [info, setInfo] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const pollTimerRef = useRef(null);

  const renderMap = useCallback((pings, latest) => {
    if (!window.google?.maps || !mapRef.current) return;
    if (!mapInstanceRef.current) {
      const center = latest ? { lat: latest.lat, lng: latest.lng } : { lat: 17.385, lng: 78.4867 };
      mapInstanceRef.current = new window.google.maps.Map(mapRef.current, {
        center,
        zoom: latest ? 14 : 6,
        mapTypeControl: false,
        streetViewControl: false,
      });
    }
    const map = mapInstanceRef.current;
    const path = pings.map(p => ({ lat: p.lat, lng: p.lng }));

    if (polylineRef.current) polylineRef.current.setMap(null);
    if (path.length > 1) {
      polylineRef.current = new window.google.maps.Polyline({
        path, geodesic: true, strokeColor: '#10b981', strokeOpacity: 0.85, strokeWeight: 4, map,
      });
    }

    if (latest) {
      const pos = { lat: latest.lat, lng: latest.lng };
      if (!markerRef.current) {
        markerRef.current = new window.google.maps.Marker({
          position: pos, map, title: 'Driver',
          icon: {
            path: window.google.maps.SymbolPath.CIRCLE,
            scale: 9, fillColor: '#10b981', fillOpacity: 1, strokeColor: '#fff', strokeWeight: 2,
          },
        });
      } else {
        markerRef.current.setPosition(pos);
      }
      // Only re-centre on first paint or large jumps.
      if (path.length === 1 || pingsRef.current.length === 0) map.setCenter(pos);
    }
    pingsRef.current = pings;
  }, []);

  const fetchTracking = useCallback(async () => {
    try {
      const since = pingsRef.current.length ? pingsRef.current[pingsRef.current.length - 1].recorded_at : null;
      const { data } = await axios.get(`${API_URL}/distributor/delivery-schedules/${scheduleId}/tracking`, {
        params: since ? { since } : {},
        withCredentials: true,
      });
      setInfo(data);
      // Merge new pings with existing.
      const merged = since ? pingsRef.current.concat(data.pings || []) : (data.pings || []);
      renderMap(merged, data.latest || (merged.length ? merged[merged.length - 1] : null));
      setError(null);
    } catch (e) {
      setError(e?.response?.data?.detail || 'Failed to load tracking');
    } finally {
      setLoading(false);
    }
  }, [scheduleId, renderMap]);

  useEffect(() => {
    loadGoogleMaps()
      .then(() => fetchTracking())
      .catch(err => { setError(err.message); setLoading(false); });
    return () => {
      if (pollTimerRef.current) clearInterval(pollTimerRef.current);
    };
  }, [fetchTracking]);

  // Set up polling once we know the interval.
  useEffect(() => {
    if (!info) return;
    if (pollTimerRef.current) clearInterval(pollTimerRef.current);
    if (!info.tracking_active) return;
    const intervalMs = Math.max(30, (info.gps_ping_interval_minutes || 5) * 60) * 1000;
    pollTimerRef.current = setInterval(fetchTracking, intervalMs);
    return () => { if (pollTimerRef.current) clearInterval(pollTimerRef.current); };
  }, [info, fetchTracking]);

  return (
    <Card className="overflow-hidden" data-testid="live-driver-map">
      <div className="flex items-center justify-between px-4 py-3 border-b border-slate-200">
        <div className="flex items-center gap-2">
          <Navigation className="w-4 h-4 text-emerald-600" />
          <span className="font-medium text-slate-900 text-sm">Live driver location</span>
          {info?.tracking_active && <Badge className="bg-emerald-100 text-emerald-700 border-emerald-200">Live</Badge>}
          {info && !info.tracking_active && info.status === 'completed' && (
            <Badge variant="outline" className="bg-slate-100 text-slate-600">Completed</Badge>
          )}
          {info && !info.tracking_active && info.status !== 'completed' && (
            <Badge variant="outline" className="bg-slate-100 text-slate-500">Not started</Badge>
          )}
        </div>
        <div className="flex items-center gap-2">
          {info?.latest?.recorded_at && (
            <span className="text-xs text-slate-500">Last: {new Date(info.latest.recorded_at).toLocaleTimeString()}</span>
          )}
          <Button size="sm" variant="ghost" onClick={fetchTracking} data-testid="live-map-refresh">
            <RefreshCw className="w-3.5 h-3.5" />
          </Button>
        </div>
      </div>
      <div className="relative bg-slate-100" style={{ height: 360 }}>
        {loading && (
          <div className="absolute inset-0 flex items-center justify-center text-slate-500 text-sm">
            <Loader2 className="w-5 h-5 animate-spin mr-2" /> Loading map…
          </div>
        )}
        {error && !loading && (
          <div className="absolute inset-0 flex items-center justify-center text-slate-500 text-sm text-center px-6">
            {error}
          </div>
        )}
        {!error && info && info.pings.length === 0 && !loading && (
          <div className="absolute inset-0 flex items-center justify-center text-slate-500 text-sm text-center px-6 z-10 bg-slate-50/70 pointer-events-none">
            {info.tracking_active
              ? 'Waiting for the first GPS ping from the driver…'
              : 'No GPS data yet — driver hasn\'t started the delivery.'}
          </div>
        )}
        <div ref={mapRef} className="w-full h-full" />
      </div>
    </Card>
  );
}
