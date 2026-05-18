import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import axios from 'axios';
import { toast } from 'sonner';
import {
  Plus, Truck, Loader2, Calendar, Package, ChevronRight, ChevronLeft, ChevronUp, ChevronDown,
  GripVertical, User, ChevronsRight,
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
const BASE = `${API_URL}/distributor/delivery-schedules`;

const STATUS_LABELS = {
  draft:       { label: 'Draft',       cls: 'bg-slate-100 text-slate-700 border-slate-200' },
  confirmed:   { label: 'Confirmed',   cls: 'bg-sky-100 text-sky-700 border-sky-200' },
  approved:    { label: 'Approved',    cls: 'bg-emerald-100 text-emerald-700 border-emerald-200' },
  in_progress: { label: 'In progress', cls: 'bg-amber-100 text-amber-800 border-amber-200' },
  completed:   { label: 'Completed',   cls: 'bg-slate-200 text-slate-700 border-slate-300' },
  cancelled:   { label: 'Cancelled',   cls: 'bg-rose-100 text-rose-700 border-rose-200' },
};

const DAYS_ABBR = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

const pad2 = (n) => String(n).padStart(2, '0');
const isoDay = (d) => `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
const addDays = (d, n) => { const x = new Date(d); x.setDate(x.getDate() + n); return x; };

// ============================================================================
// Date strip — 7 days, defaults to today, with navigation arrows.
// Mirrors the meetings-widget pattern used on the home dashboard.
// ============================================================================
function DateStrip({ selectedDate, onSelect, counts, anchorOffset, onShiftWeek }) {
  const today = useMemo(() => { const d = new Date(); d.setHours(0,0,0,0); return d; }, []);
  const todayKey = isoDay(today);
  const start = useMemo(() => addDays(today, anchorOffset), [today, anchorOffset]);
  const days = useMemo(() => Array.from({ length: 7 }, (_, i) => addDays(start, i)), [start]);

  return (
    <Card className="p-3 mb-4">
      <div className="flex items-center gap-2">
        <Button size="icon" variant="ghost" onClick={() => onShiftWeek(-7)} data-testid="date-strip-prev" aria-label="Previous 7 days">
          <ChevronLeft className="h-4 w-4" />
        </Button>
        <div className="flex-1 grid grid-cols-7 gap-1.5 sm:gap-2">
          {days.map(d => {
            const k = isoDay(d);
            const isToday = k === todayKey;
            const isSelected = k === selectedDate;
            const count = counts[k] || 0;
            return (
              <button
                key={k}
                onClick={() => onSelect(k)}
                className={`relative flex flex-col items-center justify-center py-2 sm:py-2.5 rounded-xl transition-all border min-w-0 ${
                  isSelected
                    ? 'bg-slate-900 text-white border-slate-900 shadow-md'
                    : isToday
                      ? 'bg-sky-50 border-sky-200 text-sky-900 hover:bg-sky-100'
                      : 'bg-white border-slate-100 text-slate-700 hover:border-slate-300 hover:bg-slate-50'
                }`}
                data-testid={`date-strip-${k}`}
              >
                <span className={`text-[10px] sm:text-[11px] font-bold uppercase tracking-wider ${isSelected ? 'text-white/80' : 'opacity-60'}`}>
                  {DAYS_ABBR[d.getDay()]}
                </span>
                <span className="text-base sm:text-xl font-black tabular-nums leading-tight">{d.getDate()}</span>
                <span className={`text-[9px] sm:text-[10px] font-medium leading-tight ${isSelected ? 'text-white/70' : 'text-slate-400'}`}>
                  {d.toLocaleDateString(undefined, { month: 'short' })}
                </span>
                {count > 0 && (
                  <span className={`absolute -top-1 -right-1 min-w-[18px] h-[18px] px-1 rounded-full text-[10px] font-bold flex items-center justify-center ${
                    isSelected ? 'bg-white text-slate-900' : 'bg-emerald-500 text-white'
                  }`}>
                    {count}
                  </span>
                )}
              </button>
            );
          })}
        </div>
        <Button size="icon" variant="ghost" onClick={() => onShiftWeek(7)} data-testid="date-strip-next" aria-label="Next 7 days">
          <ChevronRight className="h-4 w-4" />
        </Button>
        {anchorOffset !== 0 && (
          <Button size="sm" variant="outline" onClick={() => onShiftWeek('reset')} data-testid="date-strip-today">
            Today
          </Button>
        )}
      </div>
    </Card>
  );
}


// ============================================================================
// Main page
// ============================================================================
export default function DeliverySchedulesList() {
  const navigate = useNavigate();
  const [schedules, setSchedules] = useState([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState('all');
  const [selectedDate, setSelectedDate] = useState(() => isoDay(new Date()));
  // Anchor offset (days from today) for the visible 7-day window
  const [anchorOffset, setAnchorOffset] = useState(0);

  // Drag state for priority reorder
  const [dragId, setDragId] = useState(null);
  const [dragOverIdx, setDragOverIdx] = useState(null);
  const reorderBusy = useRef(false);

  // Create dialog state
  const [createOpen, setCreateOpen] = useState(false);
  const [quickDates, setQuickDates] = useState({ today: '', tomorrow: '' });
  const [createForm, setCreateForm] = useState({ schedule_date: '', vehicle_id: '', driver_id: '', notes: '' });
  const [fleet, setFleet] = useState({ vehicles: [], drivers: [], city: null });
  const [fleetLoading, setFleetLoading] = useState(false);
  const [saving, setSaving] = useState(false);

  const fetchSchedules = useCallback(async () => {
    setLoading(true);
    try {
      const params = {};
      if (statusFilter !== 'all') params.status = statusFilter;
      const { data } = await axios.get(BASE, { params, withCredentials: true });
      setSchedules(data.schedules || []);
    } catch (e) {
      toast.error(e?.response?.data?.detail || 'Failed to load delivery schedules');
    } finally {
      setLoading(false);
    }
  }, [statusFilter]);

  const fetchQuickDates = useCallback(async () => {
    try {
      const { data } = await axios.get(`${BASE}/meta/quick-dates`, { withCredentials: true });
      setQuickDates(data || { today: '', tomorrow: '' });
    } catch { /* ignore */ }
  }, []);

  const fetchFleet = useCallback(async () => {
    setFleetLoading(true);
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
    } catch (e) {
      toast.error(e?.response?.data?.detail || 'Failed to load fleet options');
    } finally {
      setFleetLoading(false);
    }
  }, []);

  useEffect(() => { fetchSchedules(); }, [fetchSchedules]);
  useEffect(() => { fetchQuickDates(); }, [fetchQuickDates]);

  // Pre-compute counts per date for the strip badges
  const countsByDate = useMemo(() => {
    const map = {};
    for (const s of schedules) {
      const k = s.schedule_date;
      if (!k) continue;
      map[k] = (map[k] || 0) + 1;
    }
    return map;
  }, [schedules]);

  // Schedules visible on the selected day, ordered by priority then created_at
  const daySchedules = useMemo(() => {
    return schedules
      .filter(s => s.schedule_date === selectedDate)
      .slice()
      .sort((a, b) => {
        const pa = a.priority_order ?? 0;
        const pb = b.priority_order ?? 0;
        if (pa !== pb) return pa - pb;
        return (a.created_at || '').localeCompare(b.created_at || '');
      });
  }, [schedules, selectedDate]);

  const totalCratesForDay = useMemo(
    () => daySchedules.reduce((acc, s) => acc + (s.total_crates || 0), 0),
    [daySchedules]
  );

  // ---- Reordering ---------------------------------------------------------
  const persistOrder = async (orderedIds) => {
    if (reorderBusy.current) return;
    reorderBusy.current = true;
    try {
      await axios.post(`${BASE}/reorder`, {
        schedule_date: selectedDate,
        schedule_ids: orderedIds,
      }, { withCredentials: true });
    } catch (e) {
      toast.error(e?.response?.data?.detail || 'Failed to save new order — refreshing');
      fetchSchedules();
    } finally {
      reorderBusy.current = false;
    }
  };

  const reorderLocally = (fromIdx, toIdx) => {
    if (fromIdx === toIdx || toIdx < 0 || toIdx >= daySchedules.length) return;
    const newOrder = daySchedules.slice();
    const [moved] = newOrder.splice(fromIdx, 1);
    newOrder.splice(toIdx, 0, moved);
    // Apply optimistically: rewrite priority_order on the matching schedules in `schedules`
    const idsInNewOrder = newOrder.map(s => s.id);
    setSchedules(prev => prev.map(s => {
      if (s.schedule_date !== selectedDate) return s;
      const pos = idsInNewOrder.indexOf(s.id);
      if (pos === -1) return s;
      return { ...s, priority_order: pos };
    }));
    persistOrder(idsInNewOrder);
  };

  const moveSchedule = (idx, delta) => reorderLocally(idx, idx + delta);

  const handleDragStart = (e, id) => { setDragId(id); e.dataTransfer.effectAllowed = 'move'; };
  const handleDragOver = (e, idx) => { e.preventDefault(); setDragOverIdx(idx); e.dataTransfer.dropEffect = 'move'; };
  const handleDragLeave = () => setDragOverIdx(null);
  const handleDrop = (e, toIdx) => {
    e.preventDefault();
    const fromIdx = daySchedules.findIndex(s => s.id === dragId);
    setDragId(null); setDragOverIdx(null);
    if (fromIdx === -1) return;
    reorderLocally(fromIdx, toIdx);
  };

  // ---- Create -------------------------------------------------------------
  const openCreate = async () => {
    setCreateForm({ schedule_date: selectedDate || quickDates.today || '', vehicle_id: '', driver_id: '', notes: '' });
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
      const { data } = await axios.post(BASE, payload, { withCredentials: true });
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
    if (which === 'today') setCreateForm(f => ({ ...f, schedule_date: quickDates.today }));
    else if (which === 'tomorrow') setCreateForm(f => ({ ...f, schedule_date: quickDates.tomorrow }));
  };

  const shiftWeek = (offset) => {
    if (offset === 'reset') {
      setAnchorOffset(0);
      setSelectedDate(isoDay(new Date()));
      return;
    }
    setAnchorOffset(prev => prev + offset);
  };

  // Pretty header for the selected day
  const selectedDateLabel = useMemo(() => {
    if (!selectedDate) return '';
    try {
      const d = new Date(selectedDate + 'T00:00');
      const todayK = isoDay(new Date());
      const tomorrowK = isoDay(addDays(new Date(), 1));
      if (selectedDate === todayK) return 'Today';
      if (selectedDate === tomorrowK) return 'Tomorrow';
      return d.toLocaleDateString(undefined, { weekday: 'long', day: 'numeric', month: 'long' });
    } catch { return selectedDate; }
  }, [selectedDate]);

  return (
    <div className="p-6 max-w-7xl mx-auto" data-testid="delivery-schedules-page">
      <div className="flex items-start justify-between mb-6 gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 flex items-center gap-2">
            <Truck className="h-6 w-6 text-slate-700" /> Delivery Schedules
          </h1>
          <p className="text-sm text-slate-500 mt-1">
            Plan deliveries by date · assign vehicle &amp; driver · prioritise runs by drag-and-drop.
          </p>
        </div>
        <Button onClick={openCreate} data-testid="schedule-create-btn">
          <Plus className="h-4 w-4 mr-1.5" /> Create Schedule
        </Button>
      </div>

      {/* Date strip */}
      <DateStrip
        selectedDate={selectedDate}
        onSelect={setSelectedDate}
        counts={countsByDate}
        anchorOffset={anchorOffset}
        onShiftWeek={shiftWeek}
      />

      {/* Status filter + day header */}
      <div className="flex items-center justify-between mb-3 gap-3 flex-wrap">
        <div className="flex items-baseline gap-3">
          <h2 className="text-lg font-semibold text-slate-900" data-testid="selected-date-label">{selectedDateLabel}</h2>
          <span className="text-xs text-slate-500">
            {daySchedules.length} schedule{daySchedules.length === 1 ? '' : 's'}
            {totalCratesForDay > 0 && <> · {totalCratesForDay} crate{totalCratesForDay === 1 ? '' : 's'} total</>}
          </span>
        </div>
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-44" data-testid="schedule-status-filter"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All statuses</SelectItem>
            <SelectItem value="draft">Draft</SelectItem>
            <SelectItem value="confirmed">Confirmed</SelectItem>
            <SelectItem value="approved">Approved</SelectItem>
            <SelectItem value="in_progress">In progress</SelectItem>
            <SelectItem value="completed">Completed</SelectItem>
            <SelectItem value="cancelled">Cancelled</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <Card>
        {loading ? (
          <div className="p-10 flex items-center justify-center text-slate-500">
            <Loader2 className="h-5 w-5 animate-spin mr-2" /> Loading…
          </div>
        ) : daySchedules.length === 0 ? (
          <div className="p-12 text-center" data-testid="schedules-empty-state">
            <Calendar className="h-10 w-10 text-slate-300 mx-auto mb-3" />
            <p className="text-slate-600 font-medium">No delivery schedules for {selectedDateLabel.toLowerCase()}</p>
            <p className="text-sm text-slate-400 mt-1">Click "Create Schedule" to plan this day.</p>
          </div>
        ) : (
          <ol className="divide-y" data-testid="schedules-day-list">
            {daySchedules.map((s, idx) => {
              const st = STATUS_LABELS[s.status] || { label: s.status, cls: 'bg-slate-100 text-slate-700 border-slate-200' };
              const isDropping = dragOverIdx === idx;
              return (
                <li
                  key={s.id}
                  draggable
                  onDragStart={(e) => handleDragStart(e, s.id)}
                  onDragOver={(e) => handleDragOver(e, idx)}
                  onDragLeave={handleDragLeave}
                  onDrop={(e) => handleDrop(e, idx)}
                  className={`flex items-center gap-3 px-3 py-3 hover:bg-slate-50/60 transition-colors ${isDropping ? 'bg-emerald-50/60 ring-2 ring-emerald-200 ring-inset' : ''}`}
                  data-testid={`schedule-row-${s.id}`}
                >
                  {/* Drag handle */}
                  <span className="text-slate-300 hover:text-slate-500 cursor-grab active:cursor-grabbing px-1 hidden md:inline-flex" title="Drag to reorder">
                    <GripVertical className="h-4 w-4" />
                  </span>

                  {/* Priority pill */}
                  <div className="flex-shrink-0 w-7 h-7 rounded-full bg-slate-900 text-white text-xs font-semibold flex items-center justify-center" data-testid={`schedule-priority-${s.id}`}>
                    {idx + 1}
                  </div>

                  {/* Up / Down arrows for keyboard users */}
                  <div className="hidden md:flex flex-col">
                    <Button
                      size="icon" variant="ghost" className="h-5 w-5"
                      onClick={(e) => { e.stopPropagation(); moveSchedule(idx, -1); }}
                      disabled={idx === 0}
                      aria-label="Move up"
                      data-testid={`schedule-up-${s.id}`}
                    >
                      <ChevronUp className="h-3 w-3" />
                    </Button>
                    <Button
                      size="icon" variant="ghost" className="h-5 w-5"
                      onClick={(e) => { e.stopPropagation(); moveSchedule(idx, 1); }}
                      disabled={idx === daySchedules.length - 1}
                      aria-label="Move down"
                      data-testid={`schedule-down-${s.id}`}
                    >
                      <ChevronDown className="h-3 w-3" />
                    </Button>
                  </div>

                  {/* Main body — clickable */}
                  <button
                    type="button"
                    onClick={() => navigate(`/distributor/delivery-schedules/${s.id}`)}
                    className="flex-1 min-w-0 text-left"
                    data-testid={`schedule-open-${s.id}`}
                  >
                    <div className="flex items-center gap-2 flex-wrap">
                      <Badge variant="outline" className={st.cls}>{st.label}</Badge>
                      <span className="font-medium text-slate-900">
                        {s.vehicle?.registration_number || <span className="text-slate-400 font-normal">No vehicle</span>}
                      </span>
                      {s.driver?.full_name && (
                        <span className="text-sm text-slate-600 inline-flex items-center gap-1">
                          <ChevronsRight className="h-3 w-3 text-slate-400" />
                          <User className="h-3 w-3 text-slate-400" /> {s.driver.full_name}
                        </span>
                      )}
                    </div>
                    <div className="text-xs text-slate-500 mt-1 flex items-center gap-3 flex-wrap">
                      <span className="inline-flex items-center gap-1">
                        <Package className="h-3 w-3" />
                        <span className="font-medium text-slate-700">{s.delivery_count || 0}</span> stop{s.delivery_count === 1 ? '' : 's'}
                      </span>
                      <span className="text-slate-300">·</span>
                      <span className="inline-flex items-center gap-1" data-testid={`schedule-crates-${s.id}`}>
                        <span className="font-semibold text-emerald-700 font-mono tabular-nums">{s.total_crates || 0}</span>
                        <span>crate{(s.total_crates || 0) === 1 ? '' : 's'}</span>
                      </span>
                      {s.notes && (
                        <>
                          <span className="text-slate-300">·</span>
                          <span className="truncate max-w-xs" title={s.notes}>{s.notes}</span>
                        </>
                      )}
                    </div>
                  </button>

                  <ChevronRight className="h-4 w-4 text-slate-300 flex-shrink-0" />
                </li>
              );
            })}
          </ol>
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
