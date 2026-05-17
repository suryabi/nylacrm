import React, { useState, useEffect, useMemo } from 'react';
import axios from 'axios';
import { toast } from 'sonner';
import {
  Plus, Pencil, Trash2, Loader2, IdCard, Search, RefreshCw, KeyRound, Copy, Check,
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
  on_leave: { label: 'On leave', cls: 'bg-amber-100 text-amber-800 border-amber-200' },
  inactive: { label: 'Inactive', cls: 'bg-slate-200 text-slate-700 border-slate-300' },
};

const emptyForm = { full_name: '', phone: '', license_number: '', city: '', status: 'active', notes: '' };

export default function DriversList() {
  const [drivers, setDrivers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchInput, setSearchInput] = useState('');
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [options, setOptions] = useState({ statuses: ['active', 'on_leave', 'inactive'] });
  const [cities, setCities] = useState([]);

  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState(emptyForm);
  const [saving, setSaving] = useState(false);

  const [deleteTarget, setDeleteTarget] = useState(null);
  const [deleting, setDeleting] = useState(false);

  // One-time password disclosure modal (shown after create / regenerate).
  const [credentials, setCredentials] = useState(null); // { driver_name, login_username, login_password }
  const [copied, setCopied] = useState(false);
  const [regenerating, setRegenerating] = useState(null); // driver_id while in-flight

  const fetchDrivers = async () => {
    setLoading(true);
    try {
      const params = {};
      if (search) params.search = search;
      if (statusFilter !== 'all') params.status = statusFilter;
      const { data } = await axios.get(`${API_URL}/admin/drivers`, { params, withCredentials: true });
      setDrivers(data.drivers || []);
    } catch (e) {
      toast.error(e?.response?.data?.detail || 'Failed to load drivers');
    } finally {
      setLoading(false);
    }
  };

  const fetchOptions = async () => {
    try {
      const { data } = await axios.get(`${API_URL}/admin/drivers/meta/options`, { withCredentials: true });
      if (data) setOptions(data);
    } catch { /* keep defaults */ }
  };

  const fetchCities = async () => {
    try {
      const { data } = await axios.get(`${API_URL}/master-locations/flat`, { withCredentials: true });
      const list = (data?.cities || []).map(c => ({ name: c.name, state: c.state_name })).sort((a, b) => a.name.localeCompare(b.name));
      setCities(list);
    } catch { /* leave empty */ }
  };

  useEffect(() => { fetchOptions(); fetchCities(); }, []);
  useEffect(() => { fetchDrivers(); /* eslint-disable-next-line */ }, [search, statusFilter]);

  useEffect(() => {
    const t = setTimeout(() => setSearch(searchInput.trim()), 250);
    return () => clearTimeout(t);
  }, [searchInput]);

  const openCreate = () => { setEditing(null); setForm(emptyForm); setDialogOpen(true); };
  const openEdit = (d) => {
    setEditing(d);
    setForm({
      full_name: d.full_name || '',
      phone: d.phone || '',
      license_number: d.license_number || '',
      city: d.city || '',
      status: d.status || 'active',
      notes: d.notes || '',
    });
    setDialogOpen(true);
  };

  const handleSave = async () => {
    if (!form.full_name.trim()) { toast.error('Full name is required'); return; }
    if (!form.phone.trim()) { toast.error('Phone is required'); return; }
    if (!form.license_number.trim()) { toast.error('License number is required'); return; }
    setSaving(true);
    try {
      if (editing) {
        await axios.put(`${API_URL}/admin/drivers/${editing.id}`, form, { withCredentials: true });
        toast.success('Driver updated');
        setDialogOpen(false);
        fetchDrivers();
      } else {
        const { data } = await axios.post(`${API_URL}/admin/drivers`, form, { withCredentials: true });
        setDialogOpen(false);
        fetchDrivers();
        if (data?.login_password) {
          setCredentials({
            driver_name: data.full_name,
            login_username: data.login_username,
            login_password: data.login_password,
          });
        } else {
          toast.success('Driver added');
        }
      }
    } catch (e) {
      toast.error(e?.response?.data?.detail || 'Failed to save driver');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      await axios.delete(`${API_URL}/admin/drivers/${deleteTarget.id}`, { withCredentials: true });
      toast.success('Driver removed');
      setDeleteTarget(null);
      fetchDrivers();
    } catch (e) {
      toast.error(e?.response?.data?.detail || 'Failed to delete driver');
    } finally {
      setDeleting(false);
    }
  };

  const handleRegenerate = async (driver) => {
    setRegenerating(driver.id);
    try {
      const { data } = await axios.post(
        `${API_URL}/admin/drivers/${driver.id}/regenerate-password`, {}, { withCredentials: true }
      );
      setCredentials({
        driver_name: driver.full_name,
        login_username: data.login_username,
        login_password: data.login_password,
      });
    } catch (e) {
      toast.error(e?.response?.data?.detail || 'Failed to regenerate password');
    } finally {
      setRegenerating(null);
    }
  };

  const handleCopyCreds = () => {
    if (!credentials) return;
    const text = `Mobile: ${credentials.login_username}\nPassword: ${credentials.login_password}`;
    navigator.clipboard?.writeText(text).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    });
  };

  const stats = useMemo(() => {
    const by = { active: 0, on_leave: 0, inactive: 0 };
    drivers.forEach(d => { by[d.status] = (by[d.status] || 0) + 1; });
    return { total: drivers.length, ...by };
  }, [drivers]);

  return (
    <div className="p-6 max-w-7xl mx-auto" data-testid="drivers-page">
      <div className="flex items-start justify-between mb-6 gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 flex items-center gap-2">
            <IdCard className="h-6 w-6 text-slate-700" /> Drivers
          </h1>
          <p className="text-sm text-slate-500 mt-1">
            Manage your driver roster. {stats.total} driver{stats.total === 1 ? '' : 's'} · {stats.active} active · {stats.on_leave} on leave · {stats.inactive} inactive.
          </p>
        </div>
        <Button onClick={openCreate} data-testid="driver-add-btn">
          <Plus className="h-4 w-4 mr-1.5" /> Add Driver
        </Button>
      </div>

      <Card className="p-3 mb-4 flex items-center gap-3 flex-wrap">
        <div className="relative flex-1 min-w-[220px]">
          <Search className="h-4 w-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <Input
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            placeholder="Search by name, phone, license, notes…"
            className="pl-9"
            data-testid="driver-search-input"
          />
        </div>
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-44" data-testid="driver-status-filter">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All statuses</SelectItem>
            {options.statuses.map(s => (
              <SelectItem key={s} value={s}>{STATUS_LABELS[s]?.label || s}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Button variant="outline" size="icon" onClick={fetchDrivers} title="Refresh" data-testid="driver-refresh-btn">
          <RefreshCw className="h-4 w-4" />
        </Button>
      </Card>

      <Card>
        {loading ? (
          <div className="p-10 flex items-center justify-center text-slate-500">
            <Loader2 className="h-5 w-5 animate-spin mr-2" /> Loading drivers…
          </div>
        ) : drivers.length === 0 ? (
          <div className="p-12 text-center" data-testid="drivers-empty-state">
            <IdCard className="h-10 w-10 text-slate-300 mx-auto mb-3" />
            <p className="text-slate-600 font-medium">No drivers yet</p>
            <p className="text-sm text-slate-400 mt-1">Click "Add Driver" to register the first one.</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-slate-50 border-b text-slate-600">
                <tr>
                  <th className="text-left px-4 py-2.5 font-medium">Name</th>
                  <th className="text-left px-4 py-2.5 font-medium">Phone</th>
                  <th className="text-left px-4 py-2.5 font-medium">License</th>
                  <th className="text-left px-4 py-2.5 font-medium">City</th>
                  <th className="text-left px-4 py-2.5 font-medium">Status</th>
                  <th className="text-left px-4 py-2.5 font-medium">Notes</th>
                  <th className="text-right px-4 py-2.5 font-medium w-32">Actions</th>
                </tr>
              </thead>
              <tbody>
                {drivers.map((d) => {
                  const s = STATUS_LABELS[d.status] || { label: d.status, cls: 'bg-slate-100 text-slate-700 border-slate-200' };
                  return (
                    <tr key={d.id} className="border-b last:border-b-0 hover:bg-slate-50/50" data-testid={`driver-row-${d.id}`}>
                      <td className="px-4 py-3 font-medium text-slate-900">{d.full_name}</td>
                      <td className="px-4 py-3 font-mono text-slate-700">{d.phone}</td>
                      <td className="px-4 py-3 font-mono text-slate-700">{d.license_number}</td>
                      <td className="px-4 py-3 text-slate-700">{d.city || <span className="text-slate-300">—</span>}</td>
                      <td className="px-4 py-3">
                        <Badge variant="outline" className={s.cls}>{s.label}</Badge>
                      </td>
                      <td className="px-4 py-3 text-slate-600 max-w-md truncate">{d.notes || <span className="text-slate-300">—</span>}</td>
                      <td className="px-4 py-3 text-right">
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => handleRegenerate(d)}
                          disabled={regenerating === d.id}
                          title="Regenerate driver login password"
                          data-testid={`driver-regenerate-${d.id}`}
                        >
                          {regenerating === d.id ? <Loader2 className="h-4 w-4 animate-spin" /> : <KeyRound className="h-4 w-4" />}
                        </Button>
                        <Button size="sm" variant="ghost" onClick={() => openEdit(d)} data-testid={`driver-edit-${d.id}`}>
                          <Pencil className="h-4 w-4" />
                        </Button>
                        <Button size="sm" variant="ghost" onClick={() => setDeleteTarget(d)} className="text-red-600 hover:text-red-700 hover:bg-red-50" data-testid={`driver-delete-${d.id}`}>
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

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-md" data-testid="driver-dialog">
          <DialogHeader>
            <DialogTitle>{editing ? 'Edit Driver' : 'Add Driver'}</DialogTitle>
            <DialogDescription>
              {editing ? 'Update driver details.' : 'Add a new driver to your roster.'}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3 py-2">
            <div className="space-y-1.5">
              <Label className="text-xs uppercase tracking-wider text-slate-500">Full Name *</Label>
              <Input
                value={form.full_name}
                onChange={(e) => setForm({ ...form, full_name: e.target.value })}
                placeholder="Ramesh Kumar"
                maxLength={120}
                data-testid="driver-name-input"
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label className="text-xs uppercase tracking-wider text-slate-500">Phone *</Label>
                <Input
                  value={form.phone}
                  onChange={(e) => setForm({ ...form, phone: e.target.value.replace(/[^0-9+\-\s]/g, '') })}
                  placeholder="9876543210"
                  className="font-mono"
                  maxLength={20}
                  data-testid="driver-phone-input"
                />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs uppercase tracking-wider text-slate-500">License # *</Label>
                <Input
                  value={form.license_number}
                  onChange={(e) => setForm({ ...form, license_number: e.target.value.toUpperCase() })}
                  placeholder="DL1420110012345"
                  className="font-mono"
                  maxLength={32}
                  data-testid="driver-license-input"
                />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label className="text-xs uppercase tracking-wider text-slate-500">Status</Label>
                <Select value={form.status} onValueChange={(v) => setForm({ ...form, status: v })}>
                  <SelectTrigger data-testid="driver-status-input"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {options.statuses.map(s => <SelectItem key={s} value={s}>{STATUS_LABELS[s]?.label || s}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs uppercase tracking-wider text-slate-500">City</Label>
                <Select
                  value={form.city || '__none__'}
                  onValueChange={(v) => setForm({ ...form, city: v === '__none__' ? '' : v })}
                >
                  <SelectTrigger data-testid="driver-city-input"><SelectValue placeholder="Select city" /></SelectTrigger>
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
              <Label className="text-xs uppercase tracking-wider text-slate-500">Notes</Label>
              <Textarea
                value={form.notes}
                onChange={(e) => setForm({ ...form, notes: e.target.value })}
                rows={3}
                placeholder="License expiry reminders, languages, route familiarity, etc."
                data-testid="driver-notes-input"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)} disabled={saving}>Cancel</Button>
            <Button onClick={handleSave} disabled={saving} data-testid="driver-save-btn">
              {saving ? <><Loader2 className="h-4 w-4 mr-1.5 animate-spin" /> Saving…</> : (editing ? 'Save' : 'Add Driver')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={!!deleteTarget} onOpenChange={(open) => { if (!open) setDeleteTarget(null); }}>
        <AlertDialogContent data-testid="driver-delete-dialog">
          <AlertDialogHeader>
            <AlertDialogTitle>Remove driver?</AlertDialogTitle>
            <AlertDialogDescription>
              {deleteTarget?.full_name} will be removed from the roster. This cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleting}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDelete}
              disabled={deleting}
              className="bg-red-600 hover:bg-red-700 text-white"
              data-testid="driver-confirm-delete-btn"
            >
              {deleting ? <><Loader2 className="h-4 w-4 mr-1.5 animate-spin" /> Removing…</> : 'Remove'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* One-time credentials disclosure modal */}
      <Dialog open={!!credentials} onOpenChange={(open) => { if (!open) { setCredentials(null); setCopied(false); } }}>
        <DialogContent className="max-w-md" data-testid="driver-credentials-dialog">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <KeyRound className="h-5 w-5 text-emerald-600" /> Share these credentials
            </DialogTitle>
            <DialogDescription>
              {credentials?.driver_name} can log in to the driver app with this mobile number and password.
              The password is shown <strong>only once</strong> — copy it now.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3 py-2">
            <div>
              <Label className="text-xs uppercase tracking-wider text-slate-500">Mobile Number</Label>
              <Input value={credentials?.login_username || ''} readOnly className="font-mono mt-1" data-testid="driver-creds-username" />
            </div>
            <div>
              <Label className="text-xs uppercase tracking-wider text-slate-500">Password</Label>
              <Input value={credentials?.login_password || ''} readOnly className="font-mono mt-1 text-lg" data-testid="driver-creds-password" />
            </div>
            <p className="text-xs text-slate-500">
              Driver login URL: <span className="font-mono text-slate-700">/driver/login</span>
            </p>
          </div>
          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={handleCopyCreds} data-testid="driver-creds-copy">
              {copied ? <><Check className="h-4 w-4 mr-1.5" /> Copied</> : <><Copy className="h-4 w-4 mr-1.5" /> Copy</>}
            </Button>
            <Button onClick={() => { setCredentials(null); setCopied(false); }} data-testid="driver-creds-done">
              Done
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
