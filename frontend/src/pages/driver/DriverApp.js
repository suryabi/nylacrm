import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useNavigate, useParams, Link } from 'react-router-dom';
import axios from 'axios';
import { toast } from 'sonner';
import {
  Loader2, MapPin, Phone, ChevronLeft, CheckCircle2, Play, StopCircle,
  Truck, Calendar, LogOut, Navigation, Package,
} from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { Button } from '../../components/ui/button';
import { Badge } from '../../components/ui/badge';
import { Card } from '../../components/ui/card';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '../../components/ui/alert-dialog';

const API_URL = process.env.REACT_APP_BACKEND_URL + '/api';

const STATUS_PILL = {
  approved:    { label: 'Ready to start', cls: 'bg-blue-100 text-blue-700 border-blue-200' },
  in_progress: { label: 'In progress',    cls: 'bg-emerald-100 text-emerald-700 border-emerald-200' },
  completed:   { label: 'Completed',      cls: 'bg-slate-200 text-slate-700 border-slate-300' },
};

// ============================================================================
// Schedules list
// ============================================================================

export function DriverSchedules() {
  const navigate = useNavigate();
  const { user, logout, loading: authLoading } = useAuth();
  const [schedules, setSchedules] = useState([]);
  const [loading, setLoading] = useState(true);

  const fetchSchedules = useCallback(async () => {
    try {
      const { data } = await axios.get(`${API_URL}/driver/schedules`, { withCredentials: true });
      setSchedules(data.schedules || []);
    } catch (e) {
      toast.error(e?.response?.data?.detail || 'Failed to load schedules');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!authLoading && (!user || user.role !== 'Driver')) {
      navigate('/driver/login', { replace: true });
      return;
    }
    if (user?.role === 'Driver') fetchSchedules();
  }, [user, authLoading, navigate, fetchSchedules]);

  if (loading || authLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50">
        <Loader2 className="w-6 h-6 animate-spin text-slate-400" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50" data-testid="driver-schedules-page">
      <header className="bg-white border-b border-slate-200 sticky top-0 z-10">
        <div className="max-w-2xl mx-auto px-4 py-3 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-9 h-9 rounded-lg bg-emerald-600 flex items-center justify-center">
              <Truck className="w-5 h-5 text-white" />
            </div>
            <div>
              <div className="text-sm font-semibold text-slate-900 leading-tight">{user?.name}</div>
              <div className="text-[11px] text-slate-500 leading-tight font-mono mt-0.5">{user?.phone}</div>
            </div>
          </div>
          <Button
            size="sm"
            variant="ghost"
            onClick={async () => { await logout(); navigate('/driver/login', { replace: true }); }}
            data-testid="driver-logout-btn"
          >
            <LogOut className="w-4 h-4" />
          </Button>
        </div>
      </header>

      <div className="max-w-2xl mx-auto px-4 py-6">
        <h2 className="text-lg font-semibold text-slate-900 mb-1">Your deliveries</h2>
        <p className="text-sm text-slate-500 mb-4">Approved schedules for today &amp; tomorrow.</p>

        {schedules.length === 0 ? (
          <Card className="p-10 text-center" data-testid="driver-empty-state">
            <Calendar className="w-10 h-10 text-slate-300 mx-auto mb-3" />
            <p className="text-slate-600 font-medium">No deliveries assigned</p>
            <p className="text-sm text-slate-400 mt-1">Your distributor hasn't approved a schedule for you yet.</p>
          </Card>
        ) : (
          <div className="space-y-3">
            {schedules.map((s) => {
              const pill = STATUS_PILL[s.status] || { label: s.status, cls: 'bg-slate-100 text-slate-700' };
              return (
                <Link key={s.id} to={`/driver/schedules/${s.id}`} className="block" data-testid={`driver-schedule-${s.id}`}>
                  <Card className="p-4 hover:shadow-md transition-shadow active:scale-[0.99]">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0 flex-1">
                        <div className="text-xs text-slate-500 mb-1 font-medium">{s.schedule_date}</div>
                        <div className="text-base font-semibold text-slate-900 truncate">
                          {s.distributor?.distributor_name || 'Distributor'}
                        </div>
                        <div className="flex items-center gap-3 mt-1.5 text-xs text-slate-500 flex-wrap">
                          <span className="inline-flex items-center gap-1">
                            <Truck className="w-3 h-3" /> {s.vehicle?.registration_number || '—'}
                          </span>
                          <span className="inline-flex items-center gap-1">
                            <MapPin className="w-3 h-3" /> {s.delivery_count} stop{s.delivery_count === 1 ? '' : 's'}
                          </span>
                          {s.completed_count > 0 && (
                            <span className="inline-flex items-center gap-1 text-emerald-600">
                              <CheckCircle2 className="w-3 h-3" /> {s.completed_count} done
                            </span>
                          )}
                        </div>
                      </div>
                      <Badge variant="outline" className={pill.cls}>{pill.label}</Badge>
                    </div>
                  </Card>
                </Link>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}


// ============================================================================
// Schedule detail (Start, GPS pings, mark stops complete, End)
// ============================================================================

export function DriverScheduleDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { user, loading: authLoading } = useAuth();

  const [schedule, setSchedule] = useState(null);
  const [loading, setLoading] = useState(true);
  const [starting, setStarting] = useState(false);
  const [ending, setEnding] = useState(false);
  const [completingId, setCompletingId] = useState(null);
  const [pingInterval, setPingInterval] = useState(5); // minutes
  const [endDialogOpen, setEndDialogOpen] = useState(false);
  const [lastPingAt, setLastPingAt] = useState(null);

  const watchIdRef = useRef(null);
  const pingTimerRef = useRef(null);
  const lastCoordRef = useRef(null);

  const fetchSchedule = useCallback(async () => {
    try {
      const { data } = await axios.get(`${API_URL}/driver/schedules/${id}`, { withCredentials: true });
      setSchedule(data);
      return data;
    } catch (e) {
      toast.error(e?.response?.data?.detail || 'Failed to load schedule');
      navigate('/driver/schedules');
      return null;
    } finally {
      setLoading(false);
    }
  }, [id, navigate]);

  const fetchSettings = useCallback(async () => {
    try {
      const { data } = await axios.get(`${API_URL}/driver/tracking/settings`, { withCredentials: true });
      setPingInterval(Math.max(1, data.gps_ping_interval_minutes || 5));
    } catch { /* keep default */ }
  }, []);

  useEffect(() => {
    if (!authLoading && (!user || user.role !== 'Driver')) {
      navigate('/driver/login', { replace: true });
      return;
    }
    if (user?.role === 'Driver') {
      fetchSchedule();
      fetchSettings();
    }
  }, [user, authLoading, navigate, fetchSchedule, fetchSettings]);

  // ---- GPS pinging ---------------------------------------------------------
  const pushPing = useCallback(async () => {
    const coord = lastCoordRef.current;
    if (!coord || !schedule?.id) return;
    try {
      await axios.post(
        `${API_URL}/driver/tracking/ping`,
        {
          schedule_id: schedule.id,
          lat: coord.lat,
          lng: coord.lng,
          accuracy_m: coord.accuracy,
          speed_kmh: coord.speed_kmh,
          heading: coord.heading,
        },
        { withCredentials: true }
      );
      setLastPingAt(new Date());
    } catch (e) {
      console.warn('GPS ping failed', e?.response?.data?.detail || e?.message);
    }
  }, [schedule]);

  const stopWatching = useCallback(() => {
    if (watchIdRef.current != null && navigator.geolocation) {
      navigator.geolocation.clearWatch(watchIdRef.current);
      watchIdRef.current = null;
    }
    if (pingTimerRef.current) {
      clearInterval(pingTimerRef.current);
      pingTimerRef.current = null;
    }
  }, []);

  const startWatching = useCallback(() => {
    if (!navigator.geolocation) {
      toast.error('GPS not supported on this device');
      return;
    }
    if (watchIdRef.current != null) return;
    watchIdRef.current = navigator.geolocation.watchPosition(
      (pos) => {
        lastCoordRef.current = {
          lat: pos.coords.latitude,
          lng: pos.coords.longitude,
          accuracy: pos.coords.accuracy,
          speed_kmh: pos.coords.speed != null ? pos.coords.speed * 3.6 : null,
          heading: pos.coords.heading,
        };
      },
      (err) => {
        console.warn('GPS error', err);
        if (err.code === err.PERMISSION_DENIED) {
          toast.error('Please enable location access to track this delivery');
        }
      },
      { enableHighAccuracy: true, maximumAge: 30_000, timeout: 30_000 }
    );
    // Push first ping ASAP (give it ~3s for a fix), then on cadence.
    setTimeout(() => { pushPing(); }, 3000);
    pingTimerRef.current = setInterval(pushPing, pingInterval * 60 * 1000);
  }, [pushPing, pingInterval]);

  // Auto-start/stop based on schedule status
  useEffect(() => {
    if (!schedule) return;
    if (schedule.status === 'in_progress') startWatching();
    else stopWatching();
    return stopWatching;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [schedule?.status, pingInterval]);

  const handleStart = async () => {
    setStarting(true);
    try {
      // Pre-flight GPS permission ping so the browser prompt fires *before* state flip.
      if (navigator.geolocation) {
        await new Promise((res) => {
          navigator.geolocation.getCurrentPosition(
            (pos) => {
              lastCoordRef.current = {
                lat: pos.coords.latitude, lng: pos.coords.longitude,
                accuracy: pos.coords.accuracy,
                speed_kmh: pos.coords.speed != null ? pos.coords.speed * 3.6 : null,
                heading: pos.coords.heading,
              };
              res();
            },
            () => res(),
            { enableHighAccuracy: true, timeout: 8000 }
          );
        });
      }
      const { data } = await axios.post(`${API_URL}/driver/schedules/${id}/start`, {}, { withCredentials: true });
      setSchedule(data);
      toast.success('Delivery started — tracking active');
    } catch (e) {
      toast.error(e?.response?.data?.detail || 'Failed to start delivery');
    } finally {
      setStarting(false);
    }
  };

  const handleEnd = async () => {
    setEnding(true);
    try {
      const { data } = await axios.post(`${API_URL}/driver/schedules/${id}/end`, {}, { withCredentials: true });
      setSchedule(data);
      toast.success('Delivery ended');
      stopWatching();
    } catch (e) {
      toast.error(e?.response?.data?.detail || 'Failed to end delivery');
    } finally {
      setEnding(false);
      setEndDialogOpen(false);
    }
  };

  const handleCompleteStop = async (delivery) => {
    if (schedule.status !== 'in_progress') {
      toast.error('Start the delivery before marking stops complete');
      return;
    }
    setCompletingId(delivery.id);
    try {
      const coord = lastCoordRef.current;
      const { data } = await axios.post(
        `${API_URL}/driver/schedules/${id}/stops/${delivery.id}/complete`,
        { lat: coord?.lat, lng: coord?.lng },
        { withCredentials: true }
      );
      toast.success(data.auto_completed_schedule ? 'All stops done — delivery completed' : 'Stop marked complete');
      await fetchSchedule();
      if (data.auto_completed_schedule) stopWatching();
    } catch (e) {
      toast.error(e?.response?.data?.detail || 'Failed to mark stop complete');
    } finally {
      setCompletingId(null);
    }
  };

  if (loading || authLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50">
        <Loader2 className="w-6 h-6 animate-spin text-slate-400" />
      </div>
    );
  }
  if (!schedule) return null;

  const pill = STATUS_PILL[schedule.status] || { label: schedule.status, cls: 'bg-slate-100 text-slate-700' };
  const totalStops = schedule.deliveries?.length || 0;
  const doneStops = (schedule.deliveries || []).filter(d => d.status === 'delivered').length;

  return (
    <div className="min-h-screen bg-slate-50 pb-32" data-testid="driver-schedule-detail">
      <header className="bg-white border-b border-slate-200 sticky top-0 z-10">
        <div className="max-w-2xl mx-auto px-3 py-3 flex items-center gap-2">
          <Button size="icon" variant="ghost" onClick={() => navigate('/driver/schedules')} data-testid="driver-back-btn">
            <ChevronLeft className="w-5 h-5" />
          </Button>
          <div className="min-w-0 flex-1">
            <div className="text-xs text-slate-500">{schedule.schedule_date}</div>
            <div className="text-base font-semibold text-slate-900 truncate">
              {schedule.distributor?.distributor_name || 'Distributor'}
            </div>
          </div>
          <Badge variant="outline" className={pill.cls}>{pill.label}</Badge>
        </div>
      </header>

      <div className="max-w-2xl mx-auto px-4 py-5 space-y-4">
        <Card className="p-4">
          <div className="grid grid-cols-2 gap-y-2 text-sm">
            <div className="text-slate-500">Vehicle</div>
            <div className="font-medium text-slate-900 font-mono">{schedule.vehicle?.registration_number || '—'}</div>
            <div className="text-slate-500">Total stops</div>
            <div className="font-medium text-slate-900">{doneStops} of {totalStops} delivered</div>
            {(() => {
              const totalCrates = (schedule.deliveries || []).reduce((acc, d) => acc + (d.total_quantity || 0), 0);
              const totalUnits = (schedule.deliveries || []).reduce((acc, d) => acc + (d.total_units || 0), 0);
              if (totalCrates === 0 && totalUnits === 0) return null;
              return (
                <>
                  <div className="text-slate-500">Load</div>
                  <div className="font-medium text-slate-900" data-testid="driver-load-summary">
                    {totalCrates} crate{totalCrates === 1 ? '' : 's'}
                    {totalUnits > 0 && <span className="text-slate-500 font-normal"> · {totalUnits} units</span>}
                  </div>
                </>
              );
            })()}
            {schedule.tracking_active && lastPingAt && (
              <>
                <div className="text-slate-500">Last GPS ping</div>
                <div className="font-medium text-emerald-700 inline-flex items-center gap-1">
                  <Navigation className="w-3 h-3" /> {lastPingAt.toLocaleTimeString()}
                </div>
              </>
            )}
          </div>
        </Card>

        <div className="space-y-3">
          {(schedule.deliveries || []).map((d, idx) => {
            const delivered = d.status === 'delivered';
            const addr = d.delivery_address || {};
            const mapsQ = encodeURIComponent(addr.formatted || [addr.address_line1, addr.city, addr.state, addr.pincode].filter(Boolean).join(', '));
            return (
              <Card key={d.id} className={`p-4 ${delivered ? 'opacity-60' : ''}`} data-testid={`driver-stop-${d.id}`}>
                <div className="flex items-start gap-3">
                  <div className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold flex-shrink-0 ${delivered ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-100 text-slate-700'}`}>
                    {delivered ? <CheckCircle2 className="w-4 h-4" /> : idx + 1}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="font-semibold text-slate-900 truncate">{d.customer_name || '—'}</div>
                    <div className="text-xs text-slate-500 mt-0.5">{d.delivery_number}</div>
                    <div className="text-sm text-slate-600 mt-2 leading-relaxed">{addr.formatted || '—'}</div>

                    {/* SKU / crate manifest — what the driver actually has to hand over */}
                    {Array.isArray(d.items) && d.items.length > 0 && (
                      <div className="mt-3 rounded-lg border border-slate-200 bg-slate-50/60 overflow-hidden" data-testid={`driver-stop-items-${d.id}`}>
                        <div className="px-3 py-1.5 border-b border-slate-200 flex items-center justify-between bg-white">
                          <div className="text-[11px] font-semibold uppercase tracking-wider text-slate-500 flex items-center gap-1">
                            <Package className="w-3 h-3" /> Manifest
                          </div>
                          {d.total_quantity != null && (
                            <div className="text-[11px] text-slate-600 font-medium">
                              {d.total_quantity} {d.total_quantity === 1 ? 'unit' : 'units'} total
                            </div>
                          )}
                        </div>
                        <ul className="divide-y divide-slate-200">
                          {d.items.map((it, i) => (
                            <li key={`${d.id}-it-${i}`} className="flex items-center justify-between px-3 py-2 text-sm">
                              <span className="text-slate-800 truncate mr-2">{it.sku_name}</span>
                              <span className="text-slate-900 font-semibold whitespace-nowrap font-mono tabular-nums">
                                {it.quantity} {it.packaging_label || 'Crate'}{it.quantity === 1 ? '' : 's'}
                                {it.units_per_package && it.quantity_units != null && it.units_per_package > 1 && (
                                  <span className="text-[10px] text-slate-400 font-normal ml-1.5">
                                    ({it.quantity_units} units)
                                  </span>
                                )}
                              </span>
                            </li>
                          ))}
                        </ul>
                      </div>
                    )}

                    <div className="flex items-center gap-3 mt-3 flex-wrap">
                      {d.contact_phone && (
                        <a href={`tel:${d.contact_phone}`} className="inline-flex items-center gap-1 text-sm text-emerald-700 font-medium">
                          <Phone className="w-3.5 h-3.5" /> {d.contact_phone}
                        </a>
                      )}
                      {mapsQ && (
                        <a
                          href={`https://www.google.com/maps/dir/?api=1&destination=${mapsQ}`}
                          target="_blank" rel="noreferrer"
                          className="inline-flex items-center gap-1 text-sm text-blue-700 font-medium"
                        >
                          <Navigation className="w-3.5 h-3.5" /> Navigate
                        </a>
                      )}
                    </div>
                    {!delivered && (
                      <Button
                        className="mt-3 w-full"
                        size="sm"
                        onClick={() => handleCompleteStop(d)}
                        disabled={completingId === d.id || schedule.status !== 'in_progress'}
                        data-testid={`driver-mark-complete-${d.id}`}
                      >
                        {completingId === d.id ? <><Loader2 className="w-4 h-4 animate-spin mr-2" /> Saving…</> : 'Mark Delivered'}
                      </Button>
                    )}
                  </div>
                </div>
              </Card>
            );
          })}
        </div>
      </div>

      {/* Sticky bottom action */}
      <div className="fixed bottom-0 inset-x-0 bg-white border-t border-slate-200 p-3">
        <div className="max-w-2xl mx-auto">
          {schedule.status === 'approved' && (
            <Button
              className="w-full h-12 bg-emerald-600 hover:bg-emerald-700 text-base"
              onClick={handleStart}
              disabled={starting}
              data-testid="driver-start-btn"
            >
              {starting ? <><Loader2 className="w-4 h-4 animate-spin mr-2" /> Starting…</> : <><Play className="w-4 h-4 mr-2" /> Start Delivery</>}
            </Button>
          )}
          {schedule.status === 'in_progress' && (
            <Button
              variant="outline"
              className="w-full h-12 text-base text-red-700 border-red-200 hover:bg-red-50"
              onClick={() => setEndDialogOpen(true)}
              disabled={ending}
              data-testid="driver-end-btn"
            >
              <StopCircle className="w-4 h-4 mr-2" /> End Delivery
            </Button>
          )}
          {schedule.status === 'completed' && (
            <div className="text-center text-sm text-emerald-700 font-medium py-2">
              <CheckCircle2 className="w-4 h-4 inline mr-1" /> Delivery completed
            </div>
          )}
        </div>
      </div>

      <AlertDialog open={endDialogOpen} onOpenChange={setEndDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>End this delivery?</AlertDialogTitle>
            <AlertDialogDescription>
              GPS tracking will stop. You can still see the schedule, but stops can no longer be marked here.
              {doneStops < totalStops && (
                <span className="block mt-2 text-amber-700 font-medium">
                  Warning: {totalStops - doneStops} stop{totalStops - doneStops === 1 ? '' : 's'} not yet delivered.
                </span>
              )}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={ending}>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleEnd} disabled={ending} className="bg-red-600 hover:bg-red-700">
              {ending ? 'Ending…' : 'End Delivery'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
