import React, { useState, useEffect, useMemo } from 'react';
import axios from 'axios';
import { toast } from 'sonner';
import {
  Plus, Pencil, Trash2, Loader2, Truck, Search, RefreshCw,
} from 'lucide-react';
import { Card } from '../../components/ui/card';
import { Button } from '../../components/ui/button';
import { Input } from '../../components/ui/input';
import { Label } from '../../components/ui/label';
import { Textarea } from '../../components/ui/textarea';
import { Badge } from '../../components/ui/badge';
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

const STATUS_LABELS = {
  active: { label: 'Active', cls: 'bg-emerald-100 text-emerald-700 border-emerald-200' },
  under_maintenance: { label: 'Under maintenance', cls: 'bg-amber-100 text-amber-800 border-amber-200' },
  retired: { label: 'Retired', cls: 'bg-slate-200 text-slate-700 border-slate-300' },
};

const emptyForm = { registration_number: '', vehicle_name: '', vehicle_type: 'Truck', city: '', status: 'active', notes: '' };

export default function VehiclesList() {
  const [vehicles, setVehicles] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchInput, setSearchInput] = useState('');
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [options, setOptions] = useState({ vehicle_types: ['Truck', 'Van', 'Mini-truck', 'Two-wheeler', 'Tempo', 'Other'], statuses: ['active', 'under_maintenance', 'retired'] });
  const [cities, setCities] = useState([]);

  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState(emptyForm);
  const [saving, setSaving] = useState(false);

  const [deleteTarget, setDeleteTarget] = useState(null);
  const [deleting, setDeleting] = useState(false);

  const fetchVehicles = async () => {
    setLoading(true);
    try {
      const params = {};
      if (search) params.search = search;
      if (statusFilter !== 'all') params.status = statusFilter;
      const { data } = await axios.get(`${API_URL}/admin/vehicles`, { params, withCredentials: true });
      setVehicles(data.vehicles || []);
    } catch (e) {
      toast.error(e?.response?.data?.detail || 'Failed to load vehicles');
    } finally {
      setLoading(false);
    }
  };

  const fetchOptions = async () => {
    try {
      const { data } = await axios.get(`${API_URL}/admin/vehicles/meta/options`, { withCredentials: true });
      if (data) setOptions(data);
    } catch { /* keep defaults */ }
  };

  const fetchCities = async () => {
    try {
      const { data } = await axios.get(`${API_URL}/master-locations/flat`, { withCredentials: true });
      const list = (data?.cities || []).map(c => ({ name: c.name, state: c.state_name })).sort((a, b) => a.name.localeCompare(b.name));
      setCities(list);
    } catch { /* leave empty; user can still pick city via free text fallback */ }
  };

  useEffect(() => { fetchOptions(); fetchCities(); }, []);
  useEffect(() => { fetchVehicles(); /* eslint-disable-next-line */ }, [search, statusFilter]);

  // Debounce search input → search
  useEffect(() => {
    const t = setTimeout(() => setSearch(searchInput.trim()), 250);
    return () => clearTimeout(t);
  }, [searchInput]);

  const openCreate = () => { setEditing(null); setForm(emptyForm); setDialogOpen(true); };
  const openEdit = (v) => {
    setEditing(v);
    setForm({
      registration_number: v.registration_number || '',
      vehicle_name: v.vehicle_name || '',
      vehicle_type: v.vehicle_type || 'Truck',
      city: v.city || '',
      status: v.status || 'active',
      notes: v.notes || '',
    });
    setDialogOpen(true);
  };

  const handleSave = async () => {
    if (!form.registration_number.trim()) { toast.error('Registration number is required'); return; }
    setSaving(true);
    try {
      if (editing) {
        await axios.put(`${API_URL}/admin/vehicles/${editing.id}`, form, { withCredentials: true });
        toast.success('Vehicle updated');
      } else {
        await axios.post(`${API_URL}/admin/vehicles`, form, { withCredentials: true });
        toast.success('Vehicle added');
      }
      setDialogOpen(false);
      fetchVehicles();
    } catch (e) {
      toast.error(e?.response?.data?.detail || 'Failed to save vehicle');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      await axios.delete(`${API_URL}/admin/vehicles/${deleteTarget.id}`, { withCredentials: true });
      toast.success('Vehicle removed');
      setDeleteTarget(null);
      fetchVehicles();
    } catch (e) {
      toast.error(e?.response?.data?.detail || 'Failed to delete vehicle');
    } finally {
      setDeleting(false);
    }
  };

  const stats = useMemo(() => {
    const by = { active: 0, under_maintenance: 0, retired: 0 };
    vehicles.forEach(v => { by[v.status] = (by[v.status] || 0) + 1; });
    return { total: vehicles.length, ...by };
  }, [vehicles]);

  return (
    <div className="p-6 max-w-7xl mx-auto" data-testid="vehicles-page">
      {/* Header */}
      <div className="flex items-start justify-between mb-6 gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 flex items-center gap-2">
            <Truck className="h-6 w-6 text-slate-700" /> Vehicles
          </h1>
          <p className="text-sm text-slate-500 mt-1">
            Manage your delivery fleet. {stats.total} vehicle{stats.total === 1 ? '' : 's'} · {stats.active} active · {stats.under_maintenance} in maintenance · {stats.retired} retired.
          </p>
        </div>
        <Button onClick={openCreate} data-testid="vehicle-add-btn">
          <Plus className="h-4 w-4 mr-1.5" /> Add Vehicle
        </Button>
      </div>

      {/* Filter row */}
      <Card className="p-3 mb-4 flex items-center gap-3 flex-wrap">
        <div className="relative flex-1 min-w-[220px]">
          <Search className="h-4 w-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <Input
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            placeholder="Search by reg no, type, notes…"
            className="pl-9"
            data-testid="vehicle-search-input"
          />
        </div>
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-44" data-testid="vehicle-status-filter">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All statuses</SelectItem>
            {options.statuses.map(s => (
              <SelectItem key={s} value={s}>{STATUS_LABELS[s]?.label || s}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Button variant="outline" size="icon" onClick={fetchVehicles} title="Refresh" data-testid="vehicle-refresh-btn">
          <RefreshCw className="h-4 w-4" />
        </Button>
      </Card>

      {/* List */}
      <Card>
        {loading ? (
          <div className="p-10 flex items-center justify-center text-slate-500">
            <Loader2 className="h-5 w-5 animate-spin mr-2" /> Loading vehicles…
          </div>
        ) : vehicles.length === 0 ? (
          <div className="p-12 text-center" data-testid="vehicles-empty-state">
            <Truck className="h-10 w-10 text-slate-300 mx-auto mb-3" />
            <p className="text-slate-600 font-medium">No vehicles yet</p>
            <p className="text-sm text-slate-400 mt-1">Click "Add Vehicle" to register the first one.</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-slate-50 border-b text-slate-600">
                <tr>
                  <th className="text-left px-4 py-2.5 font-medium">Registration</th>
                  <th className="text-left px-4 py-2.5 font-medium">Name</th>
                  <th className="text-left px-4 py-2.5 font-medium">Type</th>
                  <th className="text-left px-4 py-2.5 font-medium">City</th>
                  <th className="text-left px-4 py-2.5 font-medium">Status</th>
                  <th className="text-left px-4 py-2.5 font-medium">Notes</th>
                  <th className="text-right px-4 py-2.5 font-medium w-32">Actions</th>
                </tr>
              </thead>
              <tbody>
                {vehicles.map((v) => {
                  const s = STATUS_LABELS[v.status] || { label: v.status, cls: 'bg-slate-100 text-slate-700 border-slate-200' };
                  return (
                    <tr key={v.id} className="border-b last:border-b-0 hover:bg-slate-50/50" data-testid={`vehicle-row-${v.id}`}>
                      <td className="px-4 py-3 font-mono font-medium text-slate-900">{v.registration_number}</td>
                      <td className="px-4 py-3 text-slate-700">{v.vehicle_name || <span className="text-slate-300">—</span>}</td>
                      <td className="px-4 py-3 text-slate-700">{v.vehicle_type}</td>
                      <td className="px-4 py-3 text-slate-700">{v.city || <span className="text-slate-300">—</span>}</td>
                      <td className="px-4 py-3">
                        <Badge variant="outline" className={s.cls}>{s.label}</Badge>
                      </td>
                      <td className="px-4 py-3 text-slate-600 max-w-md truncate">{v.notes || <span className="text-slate-300">—</span>}</td>
                      <td className="px-4 py-3 text-right">
                        <Button size="sm" variant="ghost" onClick={() => openEdit(v)} data-testid={`vehicle-edit-${v.id}`}>
                          <Pencil className="h-4 w-4" />
                        </Button>
                        <Button size="sm" variant="ghost" onClick={() => setDeleteTarget(v)} className="text-red-600 hover:text-red-700 hover:bg-red-50" data-testid={`vehicle-delete-${v.id}`}>
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      {/* Add / Edit Dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-md" data-testid="vehicle-dialog">
          <DialogHeader>
            <DialogTitle>{editing ? 'Edit Vehicle' : 'Add Vehicle'}</DialogTitle>
            <DialogDescription>
              {editing ? 'Update the registered vehicle details.' : 'Register a new vehicle in your fleet.'}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3 py-2">
            <div className="space-y-1.5">
              <Label className="text-xs uppercase tracking-wider text-slate-500">Registration Number *</Label>
              <Input
                value={form.registration_number}
                onChange={(e) => setForm({ ...form, registration_number: e.target.value.toUpperCase() })}
                placeholder="TS09AB1234"
                className="font-mono"
                maxLength={32}
                data-testid="vehicle-reg-input"
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs uppercase tracking-wider text-slate-500">Vehicle Name</Label>
              <Input
                value={form.vehicle_name}
                onChange={(e) => setForm({ ...form, vehicle_name: e.target.value })}
                placeholder="e.g. Truck 1, Banjara Hills Van, Old Tempo"
                maxLength={80}
                data-testid="vehicle-name-input"
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label className="text-xs uppercase tracking-wider text-slate-500">Type</Label>
                <Select value={form.vehicle_type} onValueChange={(v) => setForm({ ...form, vehicle_type: v })}>
                  <SelectTrigger data-testid="vehicle-type-input"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {options.vehicle_types.map(t => <SelectItem key={t} value={t}>{t}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs uppercase tracking-wider text-slate-500">City</Label>
                <Select
                  value={form.city || '__none__'}
                  onValueChange={(v) => setForm({ ...form, city: v === '__none__' ? '' : v })}
                >
                  <SelectTrigger data-testid="vehicle-city-input"><SelectValue placeholder="Select city" /></SelectTrigger>
                  <SelectContent className="max-h-72">
                    <SelectItem value="__none__">— None —</SelectItem>
                    {cities.length === 0 && form.city && (
                      <SelectItem value={form.city}>{form.city}</SelectItem>
                    )}
                    {cities.map(c => (
                      <SelectItem key={c.name} value={c.name}>
                        {c.name}{c.state ? <span className="text-slate-400 ml-1">· {c.state}</span> : null}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs uppercase tracking-wider text-slate-500">Status</Label>
              <Select value={form.status} onValueChange={(v) => setForm({ ...form, status: v })}>
                <SelectTrigger data-testid="vehicle-status-input"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {options.statuses.map(s => <SelectItem key={s} value={s}>{STATUS_LABELS[s]?.label || s}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs uppercase tracking-wider text-slate-500">Notes</Label>
              <Textarea
                value={form.notes}
                onChange={(e) => setForm({ ...form, notes: e.target.value })}
                rows={3}
                placeholder="Any other details (insurance/fitness reminders, assigned route, etc.)"
                data-testid="vehicle-notes-input"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)} disabled={saving}>Cancel</Button>
            <Button onClick={handleSave} disabled={saving} data-testid="vehicle-save-btn">
              {saving ? <><Loader2 className="h-4 w-4 mr-1.5 animate-spin" /> Saving…</> : (editing ? 'Save' : 'Add Vehicle')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete confirmation */}
      <AlertDialog open={!!deleteTarget} onOpenChange={(open) => { if (!open) setDeleteTarget(null); }}>
        <AlertDialogContent data-testid="vehicle-delete-dialog">
          <AlertDialogHeader>
            <AlertDialogTitle>Remove vehicle?</AlertDialogTitle>
            <AlertDialogDescription>
              {deleteTarget?.registration_number} will be removed from the fleet list. This cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleting}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDelete}
              disabled={deleting}
              className="bg-red-600 hover:bg-red-700 text-white"
              data-testid="vehicle-confirm-delete-btn"
            >
              {deleting ? <><Loader2 className="h-4 w-4 mr-1.5 animate-spin" /> Removing…</> : 'Remove'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
