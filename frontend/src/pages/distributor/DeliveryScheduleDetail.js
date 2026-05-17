import React, { useState, useEffect, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import axios from 'axios';
import { toast } from 'sonner';
import {
  ArrowLeft, Truck, User, Loader2, ChevronUp, ChevronDown, Plus, X,
  Download, CheckCircle2, XCircle, Calendar, Package, Phone, MapPin,
} from 'lucide-react';
import { Card } from '../../components/ui/card';
import { Button } from '../../components/ui/button';
import { Badge } from '../../components/ui/badge';
import { Label } from '../../components/ui/label';
import { Checkbox } from '../../components/ui/checkbox';
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
  confirmed: { label: 'Confirmed', cls: 'bg-emerald-100 text-emerald-700 border-emerald-200' },
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
  return [a.address_line1, a.address_line2, a.city, a.state, a.pincode].filter(Boolean).join(', ') || '—';
}

export default function DeliveryScheduleDetail() {
  const { id } = useParams();
  const navigate = useNavigate();

  const [loading, setLoading] = useState(true);
  const [schedule, setSchedule] = useState(null);
  const [fleet, setFleet] = useState({ vehicles: [], drivers: [], city: null });
  const [busy, setBusy] = useState(false);

  // Attach dialog state
  const [attachOpen, setAttachOpen] = useState(false);
  const [eligible, setEligible] = useState([]);
  const [eligibleLoading, setEligibleLoading] = useState(false);
  const [picked, setPicked] = useState({});

  const [confirmOpen, setConfirmOpen] = useState(false);
  const [cancelOpen, setCancelOpen] = useState(false);

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
    } catch { /* ignore — admin may not have fleet for this city yet */ }
  }, []);

  useEffect(() => { fetchSchedule(); fetchFleet(); }, [fetchSchedule, fetchFleet]);

  const editable = schedule && schedule.status !== 'cancelled';
  const canChangeAssignments = editable;

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

  const move = async (idx, direction) => {
    if (!schedule?.deliveries) return;
    const ids = (schedule.delivery_ids || []).slice();
    const target = idx + direction;
    if (target < 0 || target >= ids.length) return;
    const [moved] = ids.splice(idx, 1);
    ids.splice(target, 0, moved);
    await patch({ delivery_ids: ids });
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
      toast.success('Schedule confirmed. Underlying stock-outs moved to Scheduled.');
      setConfirmOpen(false);
    } catch (e) {
      toast.error(e?.response?.data?.detail || 'Failed to confirm schedule');
    } finally {
      setBusy(false);
    }
  };

  const cancelSchedule = async () => {
    setBusy(true);
    try {
      const { data } = await axios.post(`${BASE}/${id}/cancel`, {}, { withCredentials: true });
      setSchedule(data);
      toast.success('Schedule cancelled. Attached stock-outs reverted to Confirmed.');
      setCancelOpen(false);
    } catch (e) {
      toast.error(e?.response?.data?.detail || 'Failed to cancel');
    } finally {
      setBusy(false);
    }
  };

  const downloadPDF = () => {
    window.open(`${BASE}/${id}/pdf`, '_blank');
  };

  if (loading || !schedule) {
    return (
      <div className="p-6 flex items-center justify-center text-slate-500">
        <Loader2 className="h-5 w-5 animate-spin mr-2" /> Loading…
      </div>
    );
  }

  const st = STATUS_LABELS[schedule.status] || { label: schedule.status, cls: 'bg-slate-100 text-slate-700 border-slate-200' };
  const deliveries = schedule.deliveries || [];

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
          {schedule.status === 'confirmed' && (
            <Button variant="outline" onClick={downloadPDF} data-testid="schedule-pdf-btn">
              <Download className="h-4 w-4 mr-1.5" /> Driver PDF
            </Button>
          )}
          {schedule.status === 'draft' && (
            <Button onClick={() => setConfirmOpen(true)} disabled={busy} data-testid="schedule-confirm-btn">
              <CheckCircle2 className="h-4 w-4 mr-1.5" /> Confirm Schedule
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
            <Truck className="h-3 w-3" /> Vehicle
            {fleet.city && <span className="text-slate-400 normal-case ml-1">· in {fleet.city}</span>}
          </Label>
          <Select
            value={schedule.vehicle_id || '__none__'}
            onValueChange={(v) => changeVehicle(v === '__none__' ? '' : v)}
            disabled={!canChangeAssignments || busy}
          >
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
          {schedule.vehicle && (
            <p className="text-xs text-slate-500 mt-2">
              {schedule.vehicle.vehicle_type} {schedule.vehicle.vehicle_name && `· ${schedule.vehicle.vehicle_name}`}
            </p>
          )}
        </Card>
        <Card className="p-4">
          <Label className="text-xs uppercase tracking-wider text-slate-500 flex items-center gap-1.5">
            <User className="h-3 w-3" /> Driver
            {fleet.city && <span className="text-slate-400 normal-case ml-1">· in {fleet.city}</span>}
          </Label>
          <Select
            value={schedule.driver_id || '__none__'}
            onValueChange={(v) => changeDriver(v === '__none__' ? '' : v)}
            disabled={!canChangeAssignments || busy}
          >
            <SelectTrigger className="mt-2" data-testid="assign-driver"><SelectValue placeholder="Pick driver" /></SelectTrigger>
            <SelectContent className="max-h-72">
              <SelectItem value="__none__">— None —</SelectItem>
              {fleet.drivers.map(d => (
                <SelectItem key={d.id} value={d.id}>
                  {d.full_name} <span className="text-slate-400 ml-1">· {d.phone}</span>
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          {schedule.driver && (
            <p className="text-xs text-slate-500 mt-2 font-mono">{schedule.driver.phone}</p>
          )}
        </Card>
      </div>

      {/* Deliveries list */}
      <Card>
        <div className="flex items-center justify-between px-5 py-3 border-b">
          <div className="font-medium text-slate-900 flex items-center gap-2">
            <Package className="h-4 w-4 text-slate-600" /> Stops · in dispatch order
          </div>
          {editable && (
            <Button size="sm" variant="outline" onClick={openAttach} data-testid="schedule-attach-btn">
              <Plus className="h-4 w-4 mr-1.5" /> Attach Stock-Outs
            </Button>
          )}
        </div>

        {deliveries.length === 0 ? (
          <div className="p-12 text-center" data-testid="schedule-empty-stops">
            <Package className="h-10 w-10 text-slate-300 mx-auto mb-3" />
            <p className="text-slate-600 font-medium">No deliveries attached yet</p>
            <p className="text-sm text-slate-400 mt-1">Click "Attach Stock-Outs" to add confirmed deliveries to this schedule.</p>
          </div>
        ) : (
          <div className="divide-y">
            {deliveries.map((d, idx) => (
              <div key={d.id} className="px-5 py-4 flex items-start gap-4" data-testid={`stop-row-${d.id}`}>
                {/* Order # + move buttons */}
                <div className="flex flex-col items-center gap-1 flex-shrink-0">
                  <div className="w-7 h-7 rounded-full bg-slate-900 text-white text-xs font-semibold flex items-center justify-center">{idx + 1}</div>
                  {editable && (
                    <div className="flex flex-col gap-0.5">
                      <Button size="icon" variant="ghost" className="h-6 w-6" onClick={() => move(idx, -1)} disabled={idx === 0 || busy} data-testid={`stop-up-${d.id}`}>
                        <ChevronUp className="h-3 w-3" />
                      </Button>
                      <Button size="icon" variant="ghost" className="h-6 w-6" onClick={() => move(idx, 1)} disabled={idx === deliveries.length - 1 || busy} data-testid={`stop-down-${d.id}`}>
                        <ChevronDown className="h-3 w-3" />
                      </Button>
                    </div>
                  )}
                </div>

                {/* Customer + address + items */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-medium text-slate-900">{d.customer_name || 'Unknown customer'}</span>
                    {d.delivery_number && <span className="text-xs text-slate-400 font-mono">{d.delivery_number}</span>}
                  </div>
                  <div className="text-xs text-slate-500 mt-1 flex flex-wrap gap-x-3 gap-y-1">
                    {d.contact_phone && <span className="flex items-center gap-1"><Phone className="h-3 w-3" /> {d.contact_phone}</span>}
                    <span className="flex items-center gap-1"><MapPin className="h-3 w-3" /> {addrStr(d.delivery_address)}</span>
                  </div>
                  {d.items && d.items.length > 0 && (
                    <div className="mt-2 flex flex-wrap gap-1.5">
                      {d.items.map((it, i) => (
                        <Badge key={i} variant="outline" className="text-xs bg-slate-50">
                          {it.sku_name || 'Item'} · <span className="font-semibold ml-1">{it.quantity}</span>
                        </Badge>
                      ))}
                    </div>
                  )}
                </div>

                {/* Remove */}
                {editable && (
                  <Button size="icon" variant="ghost" className="text-red-600 hover:text-red-700 hover:bg-red-50" onClick={() => detach(d.id)} disabled={busy} data-testid={`stop-remove-${d.id}`}>
                    <X className="h-4 w-4" />
                  </Button>
                )}
              </div>
            ))}
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
            <DialogDescription>
              Pick deliveries to add to this schedule. Each delivery can be on only one active schedule.
            </DialogDescription>
          </DialogHeader>
          <div className="max-h-[60vh] overflow-y-auto -mx-6 px-6">
            {eligibleLoading ? (
              <div className="p-8 flex items-center justify-center text-slate-500">
                <Loader2 className="h-5 w-5 animate-spin mr-2" /> Loading…
              </div>
            ) : eligible.length === 0 ? (
              <div className="p-8 text-center text-slate-500">
                <Package className="h-8 w-8 text-slate-300 mx-auto mb-2" />
                <p className="font-medium">No eligible stock-outs</p>
                <p className="text-xs mt-1">All your confirmed stock-outs are either already attached or none are confirmed yet.</p>
              </div>
            ) : (
              <div className="divide-y border rounded-md">
                {eligible.map(e => (
                  <label key={e.id} className="flex items-start gap-3 px-3 py-2.5 hover:bg-slate-50 cursor-pointer" data-testid={`eligible-row-${e.id}`}>
                    <Checkbox
                      checked={!!picked[e.id]}
                      onCheckedChange={(v) => setPicked({ ...picked, [e.id]: !!v })}
                      data-testid={`eligible-cb-${e.id}`}
                    />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-medium text-slate-900">{e.customer_name || 'Unknown'}</span>
                        {e.delivery_number && <span className="text-xs text-slate-400 font-mono">{e.delivery_number}</span>}
                      </div>
                      <div className="text-xs text-slate-500 mt-0.5">{addrStr(e.delivery_address)}</div>
                      <div className="text-xs text-slate-500 mt-0.5">
                        {e.items_count} item{e.items_count === 1 ? '' : 's'} · {e.total_quantity} unit{e.total_quantity === 1 ? '' : 's'}
                      </div>
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
              {deliveries.length} stock-out{deliveries.length === 1 ? '' : 's'} will move from "Confirmed" to "Scheduled".
              You can still reorder and add / remove stops after confirming. PDF download will become available.
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

      {/* Cancel dialog */}
      <AlertDialog open={cancelOpen} onOpenChange={setCancelOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Cancel this schedule?</AlertDialogTitle>
            <AlertDialogDescription>
              Attached stock-outs (if any) will revert to "Confirmed" so they can be added to another schedule.
              This action cannot be undone.
            </AlertDialogDescription>
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
