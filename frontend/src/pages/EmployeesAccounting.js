import React, { useState, useEffect, useCallback } from 'react';
import axios from 'axios';
import { toast } from 'sonner';
import { Plus, Pencil, Trash2, Search, Loader2, Users } from 'lucide-react';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Label } from '../components/ui/label';
import { Textarea } from '../components/ui/textarea';
import { Switch } from '../components/ui/switch';
import { Badge } from '../components/ui/badge';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '../components/ui/select';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from '../components/ui/dialog';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '../components/ui/alert-dialog';

const API = process.env.REACT_APP_BACKEND_URL;
const auth = () => ({ headers: { Authorization: `Bearer ${localStorage.getItem('token')}` }, withCredentials: true });

export default function EmployeesAccounting() {
  const [items, setItems] = useState([]);
  const [users, setUsers] = useState([]);
  const [departments, setDepartments] = useState([]);
  const [cities, setCities] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [dialog, setDialog] = useState(null);
  const [confirmDel, setConfirmDel] = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [e, loc] = await Promise.all([
        axios.get(`${API}/api/accounting/employees`, auth()),
        axios.get(`${API}/api/master-locations/flat`, auth()),
      ]);
      setItems(e.data.items || []);
      setCities(loc.data.cities || []);
      // optional sources — don't fail the page if these error
      axios.get(`${API}/api/users`, auth()).then((r) => {
        const list = Array.isArray(r.data) ? r.data : (r.data.users || r.data.items || []);
        setUsers(list);
      }).catch(() => {});
      axios.get(`${API}/api/accounting/masters/department`, auth())
        .then((r) => setDepartments((r.data.items || []).filter((d) => d.is_active))).catch(() => {});
    } catch (e) { toast.error('Failed to load employees'); } finally { setLoading(false); }
  }, []);

  useEffect(() => { load(); }, [load]);

  const filtered = items.filter((i) => [i.full_name, i.employee_code, i.department, i.designation, i.city]
    .some((f) => (f || '').toLowerCase().includes(search.toLowerCase())));

  const onDelete = async () => {
    try {
      await axios.delete(`${API}/api/accounting/employees/${confirmDel.id}`, auth());
      toast.success(`Deleted "${confirmDel.full_name}"`); setConfirmDel(null); load();
    } catch (e) { toast.error(e.response?.data?.detail || 'Delete failed'); }
  };

  return (
    <div className="mx-auto max-w-6xl p-6" data-testid="employees-page">
      <div className="mb-6">
        <h1 className="flex items-center gap-2 text-2xl font-bold text-slate-900">
          <Users className="h-6 w-6 text-indigo-600" /> Employees
        </h1>
        <p className="mt-0.5 text-sm text-slate-500">Master list of employees with department, banking and contact details for payroll &amp; reimbursements.</p>
      </div>

      <div className="rounded-xl border border-slate-200 bg-white">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 p-4">
          <p className="text-xs text-slate-400">{filtered.length} employee{filtered.length === 1 ? '' : 's'}</p>
          <div className="flex items-center gap-2">
            <div className="relative">
              <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-slate-400" />
              <Input placeholder="Search…" value={search} onChange={(e) => setSearch(e.target.value)} className="h-9 w-52 pl-8" data-testid="employee-search" />
            </div>
            <Button onClick={() => setDialog({ mode: 'create' })} className="bg-indigo-600 hover:bg-indigo-700" data-testid="add-employee-btn">
              <Plus className="mr-1.5 h-4 w-4" /> Add Employee
            </Button>
          </div>
        </div>

        {loading ? (
          <div className="flex justify-center py-16 text-slate-400"><Loader2 className="h-6 w-6 animate-spin" /></div>
        ) : filtered.length === 0 ? (
          <div className="py-16 text-center text-sm text-slate-400" data-testid="employee-empty">No employees yet — click “Add Employee”.</div>
        ) : (
          <table className="w-full text-sm" data-testid="employee-table">
            <thead>
              <tr className="border-b border-slate-100 bg-slate-50 text-[11px] uppercase tracking-wide text-slate-500">
                <th className="p-3 text-left font-medium">Name</th>
                <th className="p-3 text-left font-medium">Code</th>
                <th className="p-3 text-left font-medium">Department</th>
                <th className="p-3 text-left font-medium">Designation</th>
                <th className="p-3 text-left font-medium">City</th>
                <th className="p-3 text-center font-medium">Status</th>
                <th className="p-3 text-right font-medium">Actions</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((it) => (
                <tr key={it.id} className="group border-b border-slate-100 hover:bg-slate-50" data-testid={`employee-row-${it.id}`}>
                  <td className={`p-3 font-medium ${it.is_active ? 'text-slate-800' : 'text-slate-400'}`}>{it.full_name}</td>
                  <td className="p-3 text-slate-500">{it.employee_code || '—'}</td>
                  <td className="p-3 text-slate-500">{it.department || '—'}</td>
                  <td className="p-3 text-slate-500">{it.designation || '—'}</td>
                  <td className="p-3 text-slate-500">{it.city || '—'}</td>
                  <td className="p-3 text-center"><Badge variant="outline" className={it.is_active ? 'border-emerald-200 text-emerald-700' : 'text-slate-400'}>{it.is_active ? 'Active' : 'Inactive'}</Badge></td>
                  <td className="p-3 text-right">
                    <div className="flex items-center justify-end gap-1 opacity-0 transition-opacity group-hover:opacity-100">
                      <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => setDialog({ mode: 'edit', item: it })} data-testid={`edit-employee-${it.id}`}><Pencil className="h-3.5 w-3.5" /></Button>
                      <Button size="icon" variant="ghost" className="h-7 w-7 text-rose-600" onClick={() => setConfirmDel(it)} data-testid={`delete-employee-${it.id}`}><Trash2 className="h-3.5 w-3.5" /></Button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {dialog && <EmployeeForm dialog={dialog} users={users} departments={departments} cities={cities} onClose={() => setDialog(null)} onSaved={() => { setDialog(null); load(); }} />}

      <AlertDialog open={!!confirmDel} onOpenChange={(o) => !o && setConfirmDel(null)}>
        <AlertDialogContent data-testid="employee-delete-confirm">
          <AlertDialogHeader>
            <AlertDialogTitle>Delete “{confirmDel?.full_name}”?</AlertDialogTitle>
            <AlertDialogDescription>This permanently removes the employee record.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction className="bg-rose-600 hover:bg-rose-700" onClick={onDelete} data-testid="confirm-delete-employee-btn">Delete</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

function Field({ label, children }) {
  return <div><Label className="text-xs text-slate-600">{label}</Label>{children}</div>;
}

function EmployeeForm({ dialog, users, departments, cities, onClose, onSaved }) {
  const editing = dialog.mode === 'edit';
  const it = dialog.item || {};
  const [f, setF] = useState({
    full_name: it.full_name || '', employee_code: it.employee_code || '', linked_user_id: it.linked_user_id || '',
    department: it.department || '', designation: it.designation || '', email: it.email || '', phone: it.phone || '',
    date_of_joining: it.date_of_joining || '', pan: it.pan || '', bank_account_no: it.bank_account_no || '',
    bank_ifsc: it.bank_ifsc || '', bank_name: it.bank_name || '', reporting_manager: it.reporting_manager || '',
    city: it.city || '', is_active: it.is_active !== false, notes: it.notes || '',
  });
  const [saving, setSaving] = useState(false);
  const set = (k, v) => setF((p) => ({ ...p, [k]: v }));

  const submit = async () => {
    if (!f.full_name.trim()) { toast.error('Employee name is required'); return; }
    setSaving(true);
    try {
      const payload = { ...f, linked_user_id: f.linked_user_id || null };
      if (editing) await axios.patch(`${API}/api/accounting/employees/${it.id}`, payload, auth());
      else await axios.post(`${API}/api/accounting/employees`, payload, auth());
      toast.success(editing ? 'Updated' : 'Created'); onSaved();
    } catch (e) { toast.error(e.response?.data?.detail || 'Save failed'); } finally { setSaving(false); }
  };

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-2xl max-h-[88vh] overflow-y-auto" data-testid="employee-form-dialog">
        <DialogHeader>
          <DialogTitle>{editing ? 'Edit' : 'Add'} Employee</DialogTitle>
          <DialogDescription>Capture full employee details for payroll &amp; reimbursements.</DialogDescription>
        </DialogHeader>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Full Name *"><Input value={f.full_name} onChange={(e) => set('full_name', e.target.value)} data-testid="employee-form-name" /></Field>
          <Field label="Employee Code"><Input value={f.employee_code} onChange={(e) => set('employee_code', e.target.value)} data-testid="employee-form-code" /></Field>
          <Field label="Link to CRM User (optional)">
            <Select value={f.linked_user_id || undefined} onValueChange={(v) => set('linked_user_id', v === '__none__' ? '' : v)}>
              <SelectTrigger data-testid="employee-form-user"><SelectValue placeholder="Not linked" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="__none__">Not linked</SelectItem>
                {users.map((u) => <SelectItem key={u.id} value={u.id}>{u.name || u.full_name || u.email}</SelectItem>)}
              </SelectContent>
            </Select>
          </Field>
          <Field label="Department">
            {departments.length ? (
              <Select value={f.department || undefined} onValueChange={(v) => set('department', v)}>
                <SelectTrigger data-testid="employee-form-dept"><SelectValue placeholder="Select" /></SelectTrigger>
                <SelectContent>{departments.map((d) => <SelectItem key={d.id} value={d.name}>{d.name}</SelectItem>)}</SelectContent>
              </Select>
            ) : (
              <Input value={f.department} onChange={(e) => set('department', e.target.value)} data-testid="employee-form-dept" />
            )}
          </Field>
          <Field label="Designation"><Input value={f.designation} onChange={(e) => set('designation', e.target.value)} /></Field>
          <Field label="Reporting Manager"><Input value={f.reporting_manager} onChange={(e) => set('reporting_manager', e.target.value)} /></Field>
          <Field label="Email"><Input value={f.email} onChange={(e) => set('email', e.target.value)} /></Field>
          <Field label="Phone"><Input value={f.phone} onChange={(e) => set('phone', e.target.value)} /></Field>
          <Field label="Date of Joining"><Input type="date" value={f.date_of_joining} onChange={(e) => set('date_of_joining', e.target.value)} data-testid="employee-form-doj" /></Field>
          <Field label="PAN"><Input value={f.pan} onChange={(e) => set('pan', e.target.value)} /></Field>
          <Field label="City (from Admin Locations)">
            <Input list="employee-cities" value={f.city} onChange={(e) => set('city', e.target.value)} placeholder="Type to search" data-testid="employee-form-city" />
            <datalist id="employee-cities">{cities.map((c) => <option key={c.id} value={c.name} />)}</datalist>
          </Field>
          <Field label="Bank A/c No."><Input value={f.bank_account_no} onChange={(e) => set('bank_account_no', e.target.value)} /></Field>
          <Field label="IFSC"><Input value={f.bank_ifsc} onChange={(e) => set('bank_ifsc', e.target.value)} /></Field>
          <Field label="Bank Name"><Input value={f.bank_name} onChange={(e) => set('bank_name', e.target.value)} /></Field>
          <div className="col-span-2"><Field label="Notes"><Textarea rows={2} value={f.notes} onChange={(e) => set('notes', e.target.value)} /></Field></div>
          <div className="flex items-center gap-2"><Switch checked={f.is_active} onCheckedChange={(v) => set('is_active', v)} data-testid="employee-form-active" /><Label className="text-xs">Active</Label></div>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={onClose} disabled={saving}>Cancel</Button>
          <Button onClick={submit} disabled={saving} className="bg-indigo-600 hover:bg-indigo-700" data-testid="employee-form-save-btn">{saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}{editing ? 'Save' : 'Create'}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
