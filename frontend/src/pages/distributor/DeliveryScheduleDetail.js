import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import axios from 'axios';
import { toast } from 'sonner';
import {
  ArrowLeft, Truck, User, Loader2, ChevronUp, ChevronDown, Plus, X,
  Download, CheckCircle2, XCircle, Calendar, Package, Phone, MapPin,
  GripVertical, Route, AlertTriangle,
} from 'lucide-react';
import { Card } from '../../components/ui/card';
import { Button } from '../../components/ui/button';
import { Badge } from '../../components/ui/badge';
import { Label } from '../../components/ui/label';
import { Checkbox } from '../../components/ui/checkbox';
import LiveDriverMap from '../../components/LiveDriverMap';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '../../components/ui/select';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from '../../components/ui/dialog';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '../../components/ui/alert-dialog';

const API_URL = process.env.REACT_APP_BACKEND_URL + '/api';
const BASE = `${API_URL}/distributor/delivery-schedules`;

const STATUS_LABELS = {
  draft: { label: 'Draft', cls: 'bg-slate-100 text-slate-700 border-slate-200' },
  confirmed: { label: 'Confirmed', cls: 'bg-sky-100 text-sky-700 border-sky-200' },
  approved: { label: 'Approved', cls: 'bg-emerald-100 text-emerald-700 border-emerald-200' },
  in_progress: { label: 'In progress', cls: 'bg-amber-100 text-amber-800 border-amber-200' },
  completed: { label: 'Completed', cls: 'bg-slate-200 text-slate-700 border-slate-300' },
  cancelled: { label: 'Cancelled', cls: 'bg-rose-100 text-rose-700 border-rose-200' },
};

function fmtDate(iso) {
  if (!iso) return '—';
  try {
    return new Date(iso).toLocaleDateString(undefined, { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
  } catch { return iso; }
}

function addrStr(a) {
  if (!a || typeof a !== 'object') return '—';
  return a.formatted
    || [a.address_line1, a.address_line2, a.city, a.state, a.pincode].filter(Boolean).join(', ')
    || '—';
}

function legStatusLabel(s) {
  if (s === 'ok') return null;
  if (s === 'route_exists') return 'Same address';
  if (s === 'address_missing') return 'Address missing';
  if (s === 'api_error') return 'Distance unavailable';
  if (s === 'no_api_key') return 'Maps not configured';
  return s;
}

export default function DeliveryScheduleDetail() {
  const { id } = useParams();
  const navigate = useNavigate();

  const [loading, setLoading] = useState(true);
  const [schedule, setSchedule] = useState(null);
  const [fleet, setFleet] = useState({ vehicles: [], drivers: [], city: null });
  const [busy, setBusy] = useState(false);
  const [expanded, setExpanded] = useState({}); // delivery_id -> bool
  const [distance, setDistance] = useState(null);
  const [distanceLoading, setDistanceLoading] = useState(false);

  // Attach dialog state
  const [attachOpen, setAttachOpen] = useState(false);
  const [eligible, setEligible] = useState([]);
  const [eligibleLoading, setEligibleLoading] = useState(false);
  const [picked, setPicked] = useState({});

  const [confirmOpen, setConfirmOpen] = useState(false);
  const [approveOpen, setApproveOpen] = useState(false);
  const [cancelOpen, setCancelOpen] = useState(false);

  // Drag-and-drop
  const dragSrc = useRef(null);
  const [dragOver, setDragOver] = useState(null);

  const fetchSchedule = useCallback(async () => {
    setLoading(true);
    try {
      const { data } = await axios.get(`${BASE}/${id}`, { withCredentials: true });
      setSchedule(data);
    } catch (e) {
      toast.error(e?.response?.data?.detail || 'Failed to load schedule');
      navigate('/distributor/delivery-schedules');
    } finally {
      setLoading(false);
    }
  }, [id, navigate]);

  const fetchFleet = useCallback(async () => {
    try {
      const [v, d] = await Promise.all([
        axios.get(`${BASE}/fleet/vehicles`, { withCredentials: true }),
        axios.get(`${BASE}/fleet/drivers`, { withCredentials: true }),
      ]);
      setFleet({
        vehicles: v.data?.vehicles || [],
        drivers: d.data?.drivers || [],
        city: v.data?.city || d.data?.city || null,
      });
    } catch { /* ignore */ }
  }, []);

  const fetchDistance = useCallback(async () => {
    setDistanceLoading(true);
    try {
      const { data } = await axios.get(`${BASE}/${id}/distance`, { withCredentials: true });
      setDistance(data);
    } catch {
      setDistance(null);
    } finally {
      setDistanceLoading(false);
    }
  }, [id]);

  useEffect(() => { fetchSchedule(); fetchFleet(); }, [fetchSchedule, fetchFleet]);
  // Refetch distance whenever delivery_ids order changes or vehicle/driver assignments change
  useEffect(() => {
    if (schedule?.deliveries && schedule.deliveries.length > 0) {
      fetchDistance();
    } else {
      setDistance(null);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [schedule?.id, JSON.stringify(schedule?.delivery_ids || [])]);

  const editable = schedule && !['approved', 'in_progress', 'completed', 'cancelled'].includes(schedule.status);

  const patch = async (body) => {
    setBusy(true);
    try {
      const { data } = await axios.put(`${BASE}/${id}`, body, { withCredentials: true });
      setSchedule(data);
    } catch (e) {
      toast.error(e?.response?.data?.detail || 'Failed to update');
    } finally {
      setBusy(false);
    }
  };

  const changeVehicle = (vid) => patch({ vehicle_id: vid || null });
  const changeDriver = (did) => patch({ driver_id: did || null });

  const reorderTo = async (ids) => {
    // Optimistic local update so the UI feels instant; then persist.
    setSchedule((prev) => prev ? { ...prev, delivery_ids: ids, deliveries: ids.map(x => prev.deliveries.find(d => d.id === x)).filter(Boolean) } : prev);
    await patch({ delivery_ids: ids });
  };

  const move = async (idx, direction) => {
    if (!schedule?.deliveries) return;
    const ids = (schedule.delivery_ids || []).slice();
    const target = idx + direction;
    if (target < 0 || target >= ids.length) return;
    const [moved] = ids.splice(idx, 1);
    ids.splice(target, 0, moved);
    await reorderTo(ids);
  };

  // ---- Drag-and-drop handlers (HTML5 native) ----
  const onDragStart = (e, idx) => {
    dragSrc.current = idx;
    e.dataTransfer.effectAllowed = 'move';
    // Safari requires setData
    try { e.dataTransfer.setData('text/plain', String(idx)); } catch { /* ignore */ }
  };
  const onDragOver = (e, idx) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    if (dragOver !== idx) setDragOver(idx);
  };
  const onDragLeave = () => setDragOver(null);
  const onDrop = async (e, dropIdx) => {
    e.preventDefault();
    setDragOver(null);
    const srcIdx = dragSrc.current;
    dragSrc.current = null;
    if (srcIdx === null || srcIdx === undefined || srcIdx === dropIdx) return;
    const ids = (schedule.delivery_ids || []).slice();
    const [moved] = ids.splice(srcIdx, 1);
    ids.splice(dropIdx, 0, moved);
    await reorderTo(ids);
  };

  const detach = async (deliveryId) => {
    setBusy(true);
    try {
      const { data } = await axios.post(`${BASE}/${id}/detach-delivery/${deliveryId}`, {}, { withCredentials: true });
      setSchedule(data);
      toast.success('Removed from schedule');
    } catch (e) {
      toast.error(e?.response?.data?.detail || 'Failed to remove delivery');
    } finally {
      setBusy(false);
    }
  };

  const openAttach = async () => {
    setAttachOpen(true);
    setEligibleLoading(true);
    setPicked({});
    try {
      const { data } = await axios.get(`${BASE}/eligible-deliveries`, { withCredentials: true });
      setEligible(data?.deliveries || []);
    } catch (e) {
      toast.error(e?.response?.data?.detail || 'Failed to load eligible deliveries');
    } finally {
      setEligibleLoading(false);
    }
  };

  const attachSelected = async () => {
    const ids = Object.keys(picked).filter((k) => picked[k]);
    if (ids.length === 0) { toast.error('Pick at least one delivery'); return; }
    setBusy(true);
    try {
      const { data } = await axios.post(`${BASE}/${id}/attach-deliveries`, { delivery_ids: ids }, { withCredentials: true });
      setSchedule(data);
      toast.success(`${ids.length} ${ids.length === 1 ? 'delivery' : 'deliveries'} added`);
      setAttachOpen(false);
    } catch (e) {
      toast.error(e?.response?.data?.detail || 'Failed to attach deliveries');
    } finally {
      setBusy(false);
    }
  };

  const confirmSchedule = async () => {
    setBusy(true);
    try {
      const { data } = await axios.post(`${BASE}/${id}/confirm`, {}, { withCredentials: true });
      setSchedule(data);
      toast.success('Schedule confirmed. Awaiting approval before stock-outs move to Scheduled.');
      setConfirmOpen(false);
    } catch (e) {
      toast.error(e?.response?.data?.detail || 'Failed to confirm');
    } finally {
      setBusy(false);
    }
  };

  const approveSchedule = async () => {
    setBusy(true);
    try {
      const { data } = await axios.post(`${BASE}/${id}/approve`, {}, { withCredentials: true });
      setSchedule(data);
      toast.success(`Schedule approved by ${data.approved_by_name}. Stock-outs moved to Scheduled.`);
      setApproveOpen(false);
    } catch (e) {
      toast.error(e?.response?.data?.detail || 'Failed to approve');
    } finally {
      setBusy(false);
    }
  };

  const cancelSchedule = async () => {
    setBusy(true);
    try {
      const { data } = await axios.post(`${BASE}/${id}/cancel`, {}, { withCredentials: true });
      setSchedule(data);
      toast.success('Schedule cancelled.');
      setCancelOpen(false);
    } catch (e) {
      toast.error(e?.response?.data?.detail || 'Failed to cancel');
    } finally {
      setBusy(false);
    }
  };

  const downloadPDF = () => window.open(`${BASE}/${id}/pdf`, '_blank');

  if (loading || !schedule) {
    return <div className="p-6 flex items-center justify-center text-slate-500"><Loader2 className="h-5 w-5 animate-spin mr-2" /> Loading…</div>;
  }

  const st = STATUS_LABELS[schedule.status] || { label: schedule.status, cls: 'bg-slate-100 text-slate-700 border-slate-200' };
  const deliveries = schedule.deliveries || [];

  // legs keyed by destination delivery_id for quick lookup
  const legByDeliveryId = {};
  let firstLegKm = null;
  let lastLegKm = null;
  if (distance?.legs) {
    for (const l of distance.legs) {
      if (l.to_delivery_id) legByDeliveryId[l.to_delivery_id] = l;
    }
    if (distance.legs.length > 0) firstLegKm = distance.legs[0];
    // Last leg has no to_delivery_id → it's the return-to-warehouse leg
    const last = distance.legs[distance.legs.length - 1];
    if (last && !last.to_delivery_id) lastLegKm = last;
  }

  return (
    <div className="p-6 max-w-6xl mx-auto" data-testid="schedule-detail-page">
      {/* Header */}
      <div className="flex items-start justify-between mb-6 gap-4 flex-wrap">
        <div className="flex items-start gap-3">
          <Button variant="ghost" size="icon" onClick={() => navigate('/distributor/delivery-schedules')} data-testid="schedule-back-btn">
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <div>
            <div className="flex items-center gap-2 flex-wrap">
              <h1 className="text-xl font-bold text-slate-900 flex items-center gap-2">
                <Calendar className="h-5 w-5 text-slate-600" /> {fmtDate(schedule.schedule_date)}
              </h1>
              <Badge variant="outline" className={st.cls} data-testid="schedule-status-badge">{st.label}</Badge>
            </div>
            <p className="text-xs text-slate-500 mt-1">{deliveries.length} stop{deliveries.length === 1 ? '' : 's'} planned</p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {(schedule.status === 'confirmed' || schedule.status === 'approved') && (
            <Button variant="outline" onClick={downloadPDF} data-testid="schedule-pdf-btn">
              <Download className="h-4 w-4 mr-1.5" /> Driver PDF
            </Button>
          )}
          {schedule.status === 'draft' && (
            <Button onClick={() => setConfirmOpen(true)} disabled={busy} data-testid="schedule-confirm-btn">
              <CheckCircle2 className="h-4 w-4 mr-1.5" /> Confirm Schedule
            </Button>
          )}
          {schedule.status === 'confirmed' && (
            <Button onClick={() => setApproveOpen(true)} disabled={busy} data-testid="schedule-approve-btn">
              <CheckCircle2 className="h-4 w-4 mr-1.5" /> Approve
            </Button>
          )}
          {schedule.status !== 'cancelled' && (
            <Button variant="outline" onClick={() => setCancelOpen(true)} disabled={busy} className="text-red-600 hover:text-red-700 hover:bg-red-50" data-testid="schedule-cancel-btn">
              <XCircle className="h-4 w-4 mr-1.5" /> Cancel
            </Button>
          )}
        </div>
      </div>

      {/* Assignment row */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
        <Card className="p-4">
          <Label className="text-xs uppercase tracking-wider text-slate-500 flex items-center gap-1.5">
            <Truck className="h-3 w-3" /> Vehicle {fleet.city && <span className="text-slate-400 normal-case ml-1">· in {fleet.city}</span>}
          </Label>
          <Select value={schedule.vehicle_id || '__none__'} onValueChange={(v) => changeVehicle(v === '__none__' ? '' : v)} disabled={!editable || busy}>
            <SelectTrigger className="mt-2" data-testid="assign-vehicle"><SelectValue placeholder="Pick vehicle" /></SelectTrigger>
            <SelectContent className="max-h-72">
              <SelectItem value="__none__">— None —</SelectItem>
              {fleet.vehicles.map(v => (
                <SelectItem key={v.id} value={v.id}>
                  <span className="font-mono">{v.registration_number}</span>
                  {v.vehicle_name && <span className="text-slate-400 ml-2">· {v.vehicle_name}</span>}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          {schedule.vehicle && (<p className="text-xs text-slate-500 mt-2">{schedule.vehicle.vehicle_type}{schedule.vehicle.vehicle_name && ` · ${schedule.vehicle.vehicle_name}`}</p>)}
        </Card>
        <Card className="p-4">
          <Label className="text-xs uppercase tracking-wider text-slate-500 flex items-center gap-1.5">
            <User className="h-3 w-3" /> Driver {fleet.city && <span className="text-slate-400 normal-case ml-1">· in {fleet.city}</span>}
          </Label>
          <Select value={schedule.driver_id || '__none__'} onValueChange={(v) => changeDriver(v === '__none__' ? '' : v)} disabled={!editable || busy}>
            <SelectTrigger className="mt-2" data-testid="assign-driver"><SelectValue placeholder="Pick driver" /></SelectTrigger>
            <SelectContent className="max-h-72">
              <SelectItem value="__none__">— None —</SelectItem>
              {fleet.drivers.map(d => (
                <SelectItem key={d.id} value={d.id}>{d.full_name} <span className="text-slate-400 ml-1">· {d.phone}</span></SelectItem>
              ))}
            </SelectContent>
          </Select>
          {schedule.driver && (<p className="text-xs text-slate-500 mt-2 font-mono">{schedule.driver.phone}</p>)}
        </Card>
      </div>

      {/* Route summary card */}
      {deliveries.length > 0 && (
        <Card className="p-4 mb-4 bg-gradient-to-br from-slate-50 to-white">
          <div className="flex items-center justify-between gap-4 flex-wrap">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-lg bg-slate-900 text-white flex items-center justify-center">
                <Route className="h-5 w-5" />
              </div>
              <div>
                <div className="text-xs uppercase tracking-wider text-slate-500">Total route (round trip)</div>
                <div className="text-xl font-bold text-slate-900" data-testid="schedule-total-km">
                  {distanceLoading ? <Loader2 className="h-4 w-4 animate-spin inline" /> : (
                    distance?.total_km != null ? `${distance.total_km.toFixed(1)} km` : '—'
                  )}
                </div>
                <div className="text-xs text-slate-500 mt-0.5">
                  Warehouse → {deliveries.length} stop{deliveries.length === 1 ? '' : 's'} → back to warehouse
                </div>
              </div>
            </div>
            {distance?.warnings && distance.warnings.length > 0 && (
              <div className="text-xs text-amber-700 bg-amber-50 border border-amber-200 px-2.5 py-1.5 rounded-md flex items-start gap-1.5 max-w-md">
                <AlertTriangle className="h-3.5 w-3.5 flex-shrink-0 mt-0.5" />
                <span>{distance.warnings.join(' ')}</span>
              </div>
            )}
          </div>
        </Card>
      )}

      {/* Approver banner (only on approved schedules) */}
      {schedule.status === 'approved' && schedule.approved_by_name && (
        <Card className="p-3 mb-4 bg-emerald-50 border-emerald-200 flex items-center gap-2.5" data-testid="approver-banner">
          <CheckCircle2 className="h-4 w-4 text-emerald-600 flex-shrink-0" />
          <div className="text-sm">
            <span className="font-medium text-emerald-900">Approved by {schedule.approved_by_name}</span>
            {schedule.approved_at && (
              <span className="text-emerald-700 ml-1.5">
                · {new Date(schedule.approved_at).toLocaleString(undefined, { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })}
              </span>
            )}
          </div>
        </Card>
      )}

      {/* Live driver map — only meaningful once a driver is assigned + schedule
          is past the planning stage. We render it for approved/in_progress/completed. */}
      {schedule.driver_id && ['approved', 'in_progress', 'completed'].includes(schedule.status) && (
        <div className="mb-4">
          <LiveDriverMap scheduleId={schedule.id} />
        </div>
      )}

      {/* Deliveries list — ROW format with expander + drag-and-drop */}
      <Card className="overflow-hidden">
        <div className="flex items-center justify-between px-5 py-3 border-b">
          <div className="font-medium text-slate-900 flex items-center gap-2">
            <Package className="h-4 w-4 text-slate-600" /> Stops · in dispatch order
            {editable && deliveries.length > 1 && (
              <span className="text-xs text-slate-400 ml-2 font-normal">drag rows or use arrows to reorder</span>
            )}
          </div>
          {editable && (
            <Button size="sm" variant="outline" onClick={openAttach} data-testid="schedule-attach-btn">
              <Plus className="h-4 w-4 mr-1.5" /> Attach Stock-Outs
            </Button>
          )}
        </div>

        {/* First leg (Distributor → Stop 1) */}
        {firstLegKm && deliveries.length > 0 && (
          <div className="px-5 py-2 bg-slate-50/60 border-b text-xs text-slate-600 flex items-center gap-2" data-testid="leg-first">
            <Route className="h-3 w-3 text-slate-400" />
            <span className="text-slate-400">Distributor warehouse →</span>
            <span className="font-medium text-slate-700">{firstLegKm.km != null ? `${firstLegKm.km.toFixed(1)} km` : legStatusLabel(firstLegKm.status)}</span>
            {firstLegKm.duration_min != null && <span className="text-slate-400">· ~{firstLegKm.duration_min} min</span>}
          </div>
        )}

        {deliveries.length === 0 ? (
          <div className="p-12 text-center" data-testid="schedule-empty-stops">
            <Package className="h-10 w-10 text-slate-300 mx-auto mb-3" />
            <p className="text-slate-600 font-medium">No deliveries attached yet</p>
            <p className="text-sm text-slate-400 mt-1">Click "Attach Stock-Outs" to add confirmed deliveries.</p>
          </div>
        ) : (
          <div className="divide-y">
            {deliveries.map((d, idx) => {
              const isOpen = !!expanded[d.id];
              const interLeg = idx > 0 ? legByDeliveryId[d.id] : null; // leg INTO this stop (skip the first which is shown above)
              const dropping = dragOver === idx;
              return (
                <React.Fragment key={d.id}>
                  {/* Inter-leg banner between stops 1→2, 2→3, etc. */}
                  {interLeg && (
                    <div className="px-5 py-1.5 bg-slate-50/40 text-xs text-slate-500 flex items-center gap-2">
                      <Route className="h-3 w-3 text-slate-400" />
                      <span className="font-medium text-slate-700">{interLeg.km != null ? `${interLeg.km.toFixed(1)} km` : legStatusLabel(interLeg.status)}</span>
                      {interLeg.duration_min != null && <span>· ~{interLeg.duration_min} min</span>}
                    </div>
                  )}

                  <div
                    className={`group ${dropping ? 'bg-emerald-50/60 ring-2 ring-emerald-300 ring-inset' : ''}`}
                    draggable={editable && !busy}
                    onDragStart={(e) => onDragStart(e, idx)}
                    onDragOver={(e) => onDragOver(e, idx)}
                    onDragLeave={onDragLeave}
                    onDrop={(e) => onDrop(e, idx)}
                    data-testid={`stop-row-${d.id}`}
                  >
                    {/* Compact row — always visible */}
                    <button
                      type="button"
                      onClick={() => setExpanded((s) => ({ ...s, [d.id]: !s[d.id] }))}
                      className="w-full text-left px-3 py-3 flex items-center gap-3 hover:bg-slate-50/70 transition-colors"
                      data-testid={`stop-toggle-${d.id}`}
                    >
                      {editable && (
                        <span className="text-slate-300 hover:text-slate-500 cursor-grab active:cursor-grabbing hidden md:inline-flex" title="Drag to reorder">
                          <GripVertical className="h-4 w-4" />
                        </span>
                      )}
                      <div className="w-7 h-7 rounded-full bg-slate-900 text-white text-xs font-semibold flex items-center justify-center flex-shrink-0">{idx + 1}</div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="font-medium text-slate-900 truncate">{d.customer_name || 'Unknown customer'}</span>
                          {d.delivery_number && <span className="text-[11px] text-slate-400 font-mono">{d.delivery_number}</span>}
                        </div>
                        <div className="text-xs text-slate-500 mt-0.5 truncate">{addrStr(d.delivery_address)}</div>
                      </div>
                      {/* Quantity summary badge */}
                      <div className="hidden sm:flex flex-col items-end mr-2">
                        <div className="text-[10px] uppercase text-slate-400 leading-none">pkgs</div>
                        <div className="text-sm font-semibold text-slate-700 leading-tight">{d.total_quantity || 0}</div>
                      </div>
                      {editable && (
                        <div className="hidden md:flex flex-col">
                          <Button size="icon" variant="ghost" className="h-6 w-6" onClick={(e) => { e.stopPropagation(); move(idx, -1); }} disabled={idx === 0 || busy} data-testid={`stop-up-${d.id}`}>
                            <ChevronUp className="h-3 w-3" />
                          </Button>
                          <Button size="icon" variant="ghost" className="h-6 w-6" onClick={(e) => { e.stopPropagation(); move(idx, 1); }} disabled={idx === deliveries.length - 1 || busy} data-testid={`stop-down-${d.id}`}>
                            <ChevronDown className="h-3 w-3" />
                          </Button>
                        </div>
                      )}
                      {editable && (
                        <Button size="icon" variant="ghost" className="h-7 w-7 text-red-600 hover:text-red-700 hover:bg-red-50" onClick={(e) => { e.stopPropagation(); detach(d.id); }} disabled={busy} data-testid={`stop-remove-${d.id}`}>
                          <X className="h-4 w-4" />
                        </Button>
                      )}
                      <ChevronDown className={`h-4 w-4 text-slate-400 transition-transform ${isOpen ? 'rotate-180' : ''}`} />
                    </button>

                    {/* Expander details */}
                    {isOpen && (
                      <div className="px-12 pb-4 -mt-1 grid grid-cols-1 md:grid-cols-2 gap-3 text-sm" data-testid={`stop-expanded-${d.id}`}>
                        <div className="space-y-2">
                          <div className="text-xs uppercase tracking-wider text-slate-400">Delivery address</div>
                          <div className="text-slate-700 flex items-start gap-1.5">
                            <MapPin className="h-3.5 w-3.5 flex-shrink-0 mt-0.5 text-slate-400" />
                            <span>{addrStr(d.delivery_address)}</span>
                          </div>
                          {d.contact_phone && (
                            <div className="text-slate-600 flex items-center gap-1.5 text-xs">
                              <Phone className="h-3 w-3 text-slate-400" /> {d.contact_phone}
                            </div>
                          )}
                        </div>
                        <div>
                          <div className="text-xs uppercase tracking-wider text-slate-400 mb-1.5">Crates / Items</div>
                          {d.items && d.items.length > 0 ? (
                            <div className="space-y-1">
                              {d.items.map((it, i) => (
                                <div key={i} className="flex items-center justify-between bg-slate-50 rounded-md px-2.5 py-1.5">
                                  <span className="text-slate-700 truncate mr-2">{it.sku_name || 'Item'}</span>
                                  <span className="text-sm font-semibold text-slate-900 whitespace-nowrap flex items-baseline gap-1">
                                    {it.quantity}
                                    <span className="text-[10px] uppercase font-normal text-slate-400">{(it.packaging_label || 'crate')}{it.quantity === 1 ? '' : 's'}</span>
                                  </span>
                                </div>
                              ))}
                              <div className="flex items-center justify-between pt-1 px-2.5">
                                <span className="text-xs text-slate-500">Total packages</span>
                                <span className="text-sm font-bold text-slate-900">{d.total_quantity || 0}</span>
                              </div>
                            </div>
                          ) : (
                            <p className="text-xs text-slate-400 italic">No items recorded on this delivery.</p>
                          )}
                        </div>
                      </div>
                    )}
                  </div>
                </React.Fragment>
              );
            })}
            {/* Last leg (Stop N → Warehouse, round trip) */}
            {lastLegKm && (
              <div className="px-5 py-2 bg-slate-50/60 text-xs text-slate-600 flex items-center gap-2" data-testid="leg-last">
                <Route className="h-3 w-3 text-slate-400" />
                <span className="text-slate-400">→ Back to warehouse</span>
                <span className="font-medium text-slate-700">{lastLegKm.km != null ? `${lastLegKm.km.toFixed(1)} km` : legStatusLabel(lastLegKm.status)}</span>
                {lastLegKm.duration_min != null && <span className="text-slate-400">· ~{lastLegKm.duration_min} min</span>}
              </div>
            )}
          </div>
        )}
      </Card>

      {schedule.notes && (
        <Card className="mt-4 p-4 bg-amber-50/40 border-amber-200">
          <Label className="text-xs uppercase tracking-wider text-amber-700">Notes</Label>
          <p className="text-sm text-slate-700 mt-1 whitespace-pre-wrap">{schedule.notes}</p>
        </Card>
      )}

      {/* Attach dialog */}
      <Dialog open={attachOpen} onOpenChange={setAttachOpen}>
        <DialogContent className="max-w-2xl" data-testid="attach-dialog">
          <DialogHeader>
            <DialogTitle>Attach Confirmed Stock-Outs</DialogTitle>
            <DialogDescription>Pick deliveries to add to this schedule. Each delivery can be on only one active schedule.</DialogDescription>
          </DialogHeader>
          <div className="max-h-[60vh] overflow-y-auto -mx-6 px-6">
            {eligibleLoading ? (
              <div className="p-8 flex items-center justify-center text-slate-500"><Loader2 className="h-5 w-5 animate-spin mr-2" /> Loading…</div>
            ) : eligible.length === 0 ? (
              <div className="p-8 text-center text-slate-500">
                <Package className="h-8 w-8 text-slate-300 mx-auto mb-2" />
                <p className="font-medium">No eligible stock-outs</p>
                <p className="text-xs mt-1">All your confirmed stock-outs are either already attached, or none are confirmed yet.</p>
              </div>
            ) : (
              <div className="divide-y border rounded-md">
                {eligible.map(e => (
                  <label key={e.id} className="flex items-start gap-3 px-3 py-2.5 hover:bg-slate-50 cursor-pointer" data-testid={`eligible-row-${e.id}`}>
                    <Checkbox checked={!!picked[e.id]} onCheckedChange={(v) => setPicked({ ...picked, [e.id]: !!v })} data-testid={`eligible-cb-${e.id}`} />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-medium text-slate-900">{e.customer_name || 'Unknown'}</span>
                        {e.delivery_number && <span className="text-xs text-slate-400 font-mono">{e.delivery_number}</span>}
                      </div>
                      <div className="text-xs text-slate-500 mt-0.5">{addrStr(e.delivery_address)}</div>
                      <div className="text-xs text-slate-500 mt-0.5">{e.items_count} item{e.items_count === 1 ? '' : 's'} · {e.total_quantity} unit{e.total_quantity === 1 ? '' : 's'}</div>
                    </div>
                  </label>
                ))}
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setAttachOpen(false)}>Cancel</Button>
            <Button onClick={attachSelected} disabled={busy} data-testid="attach-confirm-btn">
              {busy ? <><Loader2 className="h-4 w-4 mr-1.5 animate-spin" /> Adding…</> : 'Add to Schedule'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Confirm dialog */}
      <AlertDialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <AlertDialogContent data-testid="confirm-dialog">
          <AlertDialogHeader>
            <AlertDialogTitle>Confirm this delivery schedule?</AlertDialogTitle>
            <AlertDialogDescription>
              {deliveries.length} stop{deliveries.length === 1 ? '' : 's'} will be locked into this schedule. The stock-outs stay as <b>Confirmed</b> until an approver signs off. PDF preview becomes available now.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={busy}>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={confirmSchedule} disabled={busy} data-testid="confirm-confirm-btn">
              {busy ? <><Loader2 className="h-4 w-4 mr-1.5 animate-spin" /> Confirming…</> : 'Confirm'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Approve dialog */}
      <AlertDialog open={approveOpen} onOpenChange={setApproveOpen}>
        <AlertDialogContent data-testid="approve-dialog">
          <AlertDialogHeader>
            <AlertDialogTitle>Approve this schedule?</AlertDialogTitle>
            <AlertDialogDescription>
              Approving locks the schedule and moves the {deliveries.length} underlying stock-out{deliveries.length === 1 ? '' : 's'} from <b>Confirmed</b> to <b>Scheduled</b>. Your name and the current time will be recorded on the driver PDF. This cannot be edited afterwards — only cancelled.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={busy}>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={approveSchedule} disabled={busy} className="bg-emerald-600 hover:bg-emerald-700 text-white" data-testid="approve-confirm-btn">
              {busy ? <><Loader2 className="h-4 w-4 mr-1.5 animate-spin" /> Approving…</> : 'Approve'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Cancel dialog */}
      <AlertDialog open={cancelOpen} onOpenChange={setCancelOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Cancel this schedule?</AlertDialogTitle>
            <AlertDialogDescription>Attached stock-outs (if any) will revert to "Confirmed".</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={busy}>Keep schedule</AlertDialogCancel>
            <AlertDialogAction onClick={cancelSchedule} disabled={busy} className="bg-red-600 hover:bg-red-700 text-white" data-testid="cancel-confirm-btn">
              {busy ? <><Loader2 className="h-4 w-4 mr-1.5 animate-spin" /> Cancelling…</> : 'Cancel Schedule'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
