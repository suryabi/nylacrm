import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import axios from 'axios';
import { toast } from 'sonner';
import {
  Plus, Truck, Loader2, Calendar, Package, Download, ChevronRight,
} from 'lucide-react';
import { Card } from '../../components/ui/card';
import { Button } from '../../components/ui/button';
import { Label } from '../../components/ui/label';
import { Badge } from '../../components/ui/badge';
import { Input } from '../../components/ui/input';
import { Textarea } from '../../components/ui/textarea';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '../../components/ui/select';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from '../../components/ui/dialog';

const API_URL = process.env.REACT_APP_BACKEND_URL + '/api';

const STATUS_LABELS = {
  draft: { label: 'Draft', cls: 'bg-slate-100 text-slate-700 border-slate-200' },
  confirmed: { label: 'Confirmed', cls: 'bg-emerald-100 text-emerald-700 border-emerald-200' },
  cancelled: { label: 'Cancelled', cls: 'bg-rose-100 text-rose-700 border-rose-200' },
};

function fmtDate(iso) {
  if (!iso) return '—';
  try {
    const d = new Date(iso);
    return d.toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' });
  } catch { return iso; }
}

export default function DeliverySchedulesList() {
  const navigate = useNavigate();
  const [schedules, setSchedules] = useState([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState('all');

  // Create dialog state
  const [createOpen, setCreateOpen] = useState(false);
  const [quickDates, setQuickDates] = useState({ today: '', tomorrow: '' });
  const [createForm, setCreateForm] = useState({ schedule_date: '', vehicle_id: '', driver_id: '', notes: '' });
  const [fleet, setFleet] = useState({ vehicles: [], drivers: [], city: null });
  const [fleetLoading, setFleetLoading] = useState(false);
  const [saving, setSaving] = useState(false);

  const fetchSchedules = async () => {
    setLoading(true);
    try {
      const params = {};
      if (statusFilter !== 'all') params.status = statusFilter;
      const { data } = await axios.get(`${API_URL}/distributor/delivery-schedules`, { params, withCredentials: true });
      setSchedules(data.schedules || []);
    } catch (e) {
      toast.error(e?.response?.data?.detail || 'Failed to load delivery schedules');
    } finally {
      setLoading(false);
    }
  };

  const fetchQuickDates = async () => {
    try {
      const { data } = await axios.get(`${API_URL}/distributor/delivery-schedules/meta/quick-dates`, { withCredentials: true });
      setQuickDates(data || { today: '', tomorrow: '' });
      if (!createForm.schedule_date) setCreateForm((f) => ({ ...f, schedule_date: data?.today || '' }));
    } catch { /* ignore */ }
  };

  const fetchFleet = async () => {
    setFleetLoading(true);
    try {
      const [v, d] = await Promise.all([
        axios.get(`${API_URL}/distributor/delivery-schedules/fleet/vehicles`, { withCredentials: true }),
        axios.get(`${API_URL}/distributor/delivery-schedules/fleet/drivers`, { withCredentials: true }),
      ]);
      setFleet({
        vehicles: v.data?.vehicles || [],
        drivers: d.data?.drivers || [],
        city: v.data?.city || d.data?.city || null,
      });
    } catch (e) {
      toast.error(e?.response?.data?.detail || 'Failed to load fleet options');
    } finally {
      setFleetLoading(false);
    }
  };

  useEffect(() => { fetchSchedules(); /* eslint-disable-next-line */ }, [statusFilter]);
  useEffect(() => { fetchQuickDates(); }, []);

  const openCreate = async () => {
    setCreateForm({ schedule_date: quickDates.today || '', vehicle_id: '', driver_id: '', notes: '' });
    setCreateOpen(true);
    if (fleet.vehicles.length === 0 && fleet.drivers.length === 0) {
      await fetchFleet();
    }
  };

  const handleCreate = async () => {
    if (!createForm.schedule_date) { toast.error('Pick a date'); return; }
    setSaving(true);
    try {
      const payload = {
        schedule_date: createForm.schedule_date,
        vehicle_id: createForm.vehicle_id || null,
        driver_id: createForm.driver_id || null,
        notes: createForm.notes || null,
      };
      const { data } = await axios.post(`${API_URL}/distributor/delivery-schedules`, payload, { withCredentials: true });
      toast.success('Schedule created');
      setCreateOpen(false);
      navigate(`/distributor/delivery-schedules/${data.id}`);
    } catch (e) {
      toast.error(e?.response?.data?.detail || 'Failed to create schedule');
    } finally {
      setSaving(false);
    }
  };

  const pickQuick = (which) => {
    if (which === 'today') setCreateForm({ ...createForm, schedule_date: quickDates.today });
    else if (which === 'tomorrow') setCreateForm({ ...createForm, schedule_date: quickDates.tomorrow });
  };

  return (
    <div className="p-6 max-w-7xl mx-auto" data-testid="delivery-schedules-page">
      <div className="flex items-start justify-between mb-6 gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 flex items-center gap-2">
            <Truck className="h-6 w-6 text-slate-700" /> Delivery Schedules
          </h1>
          <p className="text-sm text-slate-500 mt-1">
            Plan today / tomorrow's deliveries, assign vehicle &amp; driver, and download a driver-friendly PDF.
          </p>
        </div>
        <Button onClick={openCreate} data-testid="schedule-create-btn">
          <Plus className="h-4 w-4 mr-1.5" /> Create Schedule
        </Button>
      </div>

      <Card className="p-3 mb-4 flex items-center gap-3 flex-wrap">
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-44" data-testid="schedule-status-filter"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All statuses</SelectItem>
            <SelectItem value="draft">Draft</SelectItem>
            <SelectItem value="confirmed">Confirmed</SelectItem>
            <SelectItem value="cancelled">Cancelled</SelectItem>
          </SelectContent>
        </Select>
      </Card>

      <Card>
        {loading ? (
          <div className="p-10 flex items-center justify-center text-slate-500">
            <Loader2 className="h-5 w-5 animate-spin mr-2" /> Loading…
          </div>
        ) : schedules.length === 0 ? (
          <div className="p-12 text-center" data-testid="schedules-empty-state">
            <Calendar className="h-10 w-10 text-slate-300 mx-auto mb-3" />
            <p className="text-slate-600 font-medium">No delivery schedules yet</p>
            <p className="text-sm text-slate-400 mt-1">Click "Create Schedule" to plan your first day.</p>
          </div>
        ) : (
          <div className="divide-y">
            {schedules.map((s) => {
              const st = STATUS_LABELS[s.status] || { label: s.status, cls: 'bg-slate-100 text-slate-700 border-slate-200' };
              return (
                <button
                  key={s.id}
                  onClick={() => navigate(`/distributor/delivery-schedules/${s.id}`)}
                  className="w-full text-left px-5 py-4 hover:bg-slate-50/60 transition-colors flex items-center gap-4"
                  data-testid={`schedule-row-${s.id}`}
                >
                  <div className="flex-shrink-0 w-14 h-14 rounded-lg bg-slate-50 border border-slate-200 flex flex-col items-center justify-center">
                    <div className="text-[10px] uppercase text-slate-400">{(new Date(s.schedule_date)).toLocaleDateString(undefined, { month: 'short' })}</div>
                    <div className="text-lg font-bold text-slate-700 leading-tight">{(new Date(s.schedule_date)).getDate()}</div>
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-medium text-slate-900">{fmtDate(s.schedule_date)}</span>
                      <Badge variant="outline" className={st.cls}>{st.label}</Badge>
                    </div>
                    <div className="text-xs text-slate-500 mt-1 flex items-center gap-3 flex-wrap">
                      {s.vehicle?.registration_number ? (
                        <span className="font-mono">🚛 {s.vehicle.registration_number}{s.vehicle.vehicle_name ? ` · ${s.vehicle.vehicle_name}` : ''}</span>
                      ) : <span className="text-slate-400">No vehicle yet</span>}
                      <span className="text-slate-300">·</span>
                      {s.driver?.full_name ? <span>👤 {s.driver.full_name}</span> : <span className="text-slate-400">No driver yet</span>}
                      <span className="text-slate-300">·</span>
                      <span className="flex items-center gap-1"><Package className="h-3 w-3" /> {s.delivery_count || 0} stop{s.delivery_count === 1 ? '' : 's'}</span>
                    </div>
                  </div>
                  <ChevronRight className="h-4 w-4 text-slate-300" />
                </button>
              );
            })}
          </div>
        )}
      </Card>

      {/* Create Dialog */}
      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent className="max-w-md" data-testid="schedule-create-dialog">
          <DialogHeader>
            <DialogTitle>Create Delivery Schedule</DialogTitle>
            <DialogDescription>
              Pick the date, assign vehicle &amp; driver. You can attach confirmed stock-outs after creating the draft.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-2">
            <div className="space-y-1.5">
              <Label className="text-xs uppercase tracking-wider text-slate-500">Schedule Date *</Label>
              <div className="flex gap-2 flex-wrap">
                <Button type="button" size="sm"
                  variant={createForm.schedule_date === quickDates.today ? 'default' : 'outline'}
                  onClick={() => pickQuick('today')} data-testid="schedule-quick-today">Today</Button>
                <Button type="button" size="sm"
                  variant={createForm.schedule_date === quickDates.tomorrow ? 'default' : 'outline'}
                  onClick={() => pickQuick('tomorrow')} data-testid="schedule-quick-tomorrow">Tomorrow</Button>
                <Input
                  type="date" value={createForm.schedule_date}
                  onChange={(e) => setCreateForm({ ...createForm, schedule_date: e.target.value })}
                  className="w-44" data-testid="schedule-date-input"
                />
              </div>
            </div>

            <div className="space-y-1.5">
              <Label className="text-xs uppercase tracking-wider text-slate-500">
                Vehicle {fleet.city && <span className="text-slate-400 normal-case ml-1">· filtered to {fleet.city}</span>}
              </Label>
              <Select
                value={createForm.vehicle_id || '__none__'}
                onValueChange={(v) => setCreateForm({ ...createForm, vehicle_id: v === '__none__' ? '' : v })}
              >
                <SelectTrigger data-testid="schedule-vehicle-input">
                  <SelectValue placeholder={fleetLoading ? 'Loading…' : 'Select vehicle'} />
                </SelectTrigger>
                <SelectContent className="max-h-72">
                  <SelectItem value="__none__">— None —</SelectItem>
                  {fleet.vehicles.map(v => (
                    <SelectItem key={v.id} value={v.id}>
                      <span className="font-mono">{v.registration_number}</span>
                      {v.vehicle_name && <span className="text-slate-400 ml-2">· {v.vehicle_name}</span>}
                    </SelectItem>
                  ))}
                  {fleet.vehicles.length === 0 && !fleetLoading && (
                    <div className="px-2 py-3 text-sm text-slate-500">No active vehicles in {fleet.city || 'your city'} yet. Admin can add one in Admin → Fleet → Vehicles.</div>
                  )}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1.5">
              <Label className="text-xs uppercase tracking-wider text-slate-500">Driver</Label>
              <Select
                value={createForm.driver_id || '__none__'}
                onValueChange={(v) => setCreateForm({ ...createForm, driver_id: v === '__none__' ? '' : v })}
              >
                <SelectTrigger data-testid="schedule-driver-input">
                  <SelectValue placeholder={fleetLoading ? 'Loading…' : 'Select driver'} />
                </SelectTrigger>
                <SelectContent className="max-h-72">
                  <SelectItem value="__none__">— None —</SelectItem>
                  {fleet.drivers.map(d => (
                    <SelectItem key={d.id} value={d.id}>
                      {d.full_name} <span className="text-slate-400 ml-1">· {d.phone}</span>
                    </SelectItem>
                  ))}
                  {fleet.drivers.length === 0 && !fleetLoading && (
                    <div className="px-2 py-3 text-sm text-slate-500">No active drivers in {fleet.city || 'your city'} yet. Admin can add one in Admin → Fleet → Drivers.</div>
                  )}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1.5">
              <Label className="text-xs uppercase tracking-wider text-slate-500">Notes</Label>
              <Textarea
                value={createForm.notes}
                onChange={(e) => setCreateForm({ ...createForm, notes: e.target.value })}
                rows={2}
                placeholder="Route plan, urgency, special instructions…"
                data-testid="schedule-notes-input"
              />
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setCreateOpen(false)} disabled={saving}>Cancel</Button>
            <Button onClick={handleCreate} disabled={saving} data-testid="schedule-save-btn">
              {saving ? <><Loader2 className="h-4 w-4 mr-1.5 animate-spin" /> Saving…</> : 'Create Draft'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
