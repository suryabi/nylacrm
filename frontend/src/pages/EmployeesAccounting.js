import React, { useState, useEffect, useCallback, useMemo } from 'react';
import axios from 'axios';
import { toast } from 'sonner';
import {
  Plus, Pencil, Trash2, Search, Loader2, Users, IdCard, MapPin, Landmark,
  Wallet, HeartPulse, Star, StarOff, Upload, FileText, Eye, X,
} from 'lucide-react';
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
import GooglePlacesAddressSearch from '../components/GooglePlacesAddressSearch';

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

const fmtINR = (n) => `₹${Math.round(Number(n) || 0).toLocaleString('en-IN')}`;

function Field({ label, children, className = '' }) {
  return <div className={className}><Label className="text-xs text-slate-600">{label}</Label>{children}</div>;
}

function SectionCard({ icon: Icon, title, subtitle, accent = 'indigo', children, action }) {
  const ring = {
    indigo: 'from-indigo-50 to-white border-indigo-100 text-indigo-700',
    emerald: 'from-emerald-50 to-white border-emerald-100 text-emerald-700',
    amber: 'from-amber-50 to-white border-amber-100 text-amber-700',
    rose: 'from-rose-50 to-white border-rose-100 text-rose-700',
    violet: 'from-violet-50 to-white border-violet-100 text-violet-700',
    sky: 'from-sky-50 to-white border-sky-100 text-sky-700',
  }[accent];
  return (
    <section className={`rounded-xl border bg-gradient-to-b shadow-sm ${ring} p-4`}>
      <header className="mb-3 flex items-start gap-2">
        <span className="rounded-lg bg-white p-1.5 shadow-sm"><Icon className="h-4 w-4" /></span>
        <div className="min-w-0 flex-1">
          <h4 className="text-sm font-semibold leading-none">{title}</h4>
          {subtitle && <p className="mt-0.5 text-[11px] text-slate-500">{subtitle}</p>}
        </div>
        {action}
      </header>
      <div className="rounded-lg bg-white/70 p-3 ring-1 ring-slate-100">
        {children}
      </div>
    </section>
  );
}

const SALARY_EARN_KEYS = [
  ['basic', 'Basic'],
  ['hra', 'HRA'],
  ['conveyance_allowance', 'Conveyance'],
  ['medical_allowance', 'Medical Allowance'],
  ['special_allowance', 'Special Allowance'],
  ['lta', 'LTA (monthly)'],
  ['other_allowances', 'Other Allowances'],
  ['bonus_monthly', 'Bonus (monthly)'],
];
const SALARY_EMP_KEYS = [
  ['employer_pf', 'Employer PF'],
  ['employer_esi', 'Employer ESI'],
  ['gratuity', 'Gratuity'],
];
const SALARY_DED_KEYS = [
  ['employee_pf', 'Employee PF'],
  ['employee_esi', 'Employee ESI'],
  ['professional_tax', 'Professional Tax'],
];
const SALARY_ANN_KEYS = [
  ['annual_bonus', 'Annual Bonus'],
  ['annual_variable_pay', 'Variable Pay (yearly)'],
  ['annual_lta_reimbursement', 'LTA Reimbursement (yearly)'],
  ['annual_medical_reimbursement', 'Medical Reimbursement (yearly)'],
];

function ContactsTable({ rows, onChange, primaryLabel = 'Primary', testIdPrefix, showDob = false, showDependent = false }) {
  const upd = (i, patch) => onChange(rows.map((c, idx) => (idx === i ? { ...c, ...patch } : c)));
  const del = (i) => onChange(rows.filter((_, idx) => idx !== i));
  const setPrimary = (i) => onChange(rows.map((c, idx) => ({ ...c, is_primary: idx === i })));
  const add = () => onChange([...rows, { id: `new-${Date.now()}`, name: '', relationship: '', phone: '', email: '', date_of_birth: '', is_dependent: false, is_primary: rows.length === 0 }]);
  return (
    <>
      <div className="overflow-x-auto rounded-lg border border-slate-200">
        <table className="w-full min-w-[640px] text-sm" data-testid={`${testIdPrefix}-table`}>
          <thead className="bg-slate-50 text-[11px] uppercase tracking-wide text-slate-500">
            <tr>
              <th className="p-2 text-center w-10"></th>
              <th className="p-2 text-left font-medium">Name</th>
              <th className="p-2 text-left font-medium">Relationship</th>
              <th className="p-2 text-left font-medium">Phone</th>
              <th className="p-2 text-left font-medium">Email</th>
              {showDob && <th className="p-2 text-left font-medium">DOB</th>}
              {showDependent && <th className="p-2 text-center font-medium">Dep.</th>}
              <th className="p-2 text-center w-10"></th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 && (
              <tr><td colSpan={showDob || showDependent ? 8 : 6} className="p-4 text-center text-xs text-slate-400">No contacts yet.</td></tr>
            )}
            {rows.map((c, i) => (
              <tr key={c.id || i} className="border-t border-slate-100" data-testid={`${testIdPrefix}-row-${i}`}>
                <td className="p-1 text-center">
                  <button type="button" onClick={() => setPrimary(i)} title={c.is_primary ? primaryLabel : `Mark as ${primaryLabel}`} className="rounded p-1 hover:bg-amber-50" data-testid={`${testIdPrefix}-primary-${i}`}>
                    {c.is_primary ? <Star className="h-4 w-4 fill-amber-400 text-amber-500" /> : <StarOff className="h-4 w-4 text-slate-300" />}
                  </button>
                </td>
                <td className="p-1"><Input value={c.name || ''} placeholder="Full name" onChange={(e) => upd(i, { name: e.target.value })} className="h-8" data-testid={`${testIdPrefix}-name-${i}`} /></td>
                <td className="p-1"><Input value={c.relationship || ''} placeholder="Spouse / Father / Friend…" onChange={(e) => upd(i, { relationship: e.target.value })} className="h-8" data-testid={`${testIdPrefix}-rel-${i}`} /></td>
                <td className="p-1"><Input value={c.phone || ''} placeholder="+91…" onChange={(e) => upd(i, { phone: e.target.value })} className="h-8" data-testid={`${testIdPrefix}-phone-${i}`} /></td>
                <td className="p-1"><Input value={c.email || ''} placeholder="email" onChange={(e) => upd(i, { email: e.target.value })} className="h-8" data-testid={`${testIdPrefix}-email-${i}`} /></td>
                {showDob && (
                  <td className="p-1"><Input type="date" value={c.date_of_birth || ''} onChange={(e) => upd(i, { date_of_birth: e.target.value })} className="h-8" data-testid={`${testIdPrefix}-dob-${i}`} /></td>
                )}
                {showDependent && (
                  <td className="p-1 text-center">
                    <Switch checked={!!c.is_dependent} onCheckedChange={(v) => upd(i, { is_dependent: v })} data-testid={`${testIdPrefix}-dep-${i}`} />
                  </td>
                )}
                <td className="p-1 text-center">
                  <Button type="button" size="icon" variant="ghost" className="h-7 w-7 text-rose-600" onClick={() => del(i)} data-testid={`${testIdPrefix}-delete-${i}`}><Trash2 className="h-3.5 w-3.5" /></Button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <Button type="button" variant="outline" size="sm" className="mt-3" onClick={add} data-testid={`${testIdPrefix}-add`}><Plus className="mr-1 h-3.5 w-3.5" /> Add</Button>
    </>
  );
}

function SalaryGrid({ label, accent, rows, salary, onChange }) {
  const palette = {
    emerald: 'border-emerald-100',
    amber: 'border-amber-100',
    sky: 'border-sky-100',
  }[accent] || 'border-slate-200';
  return (
    <div className={`rounded-lg border ${palette} bg-white p-3`}>
      <p className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-slate-500">{label}</p>
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">
        {rows.map(([k, lbl]) => (
          <div key={k}>
            <Label className="text-[11px] text-slate-500">{lbl}</Label>
            <Input type="number" min="0" step="0.01" value={salary[k] || ''} onChange={(e) => onChange(k, e.target.value === '' ? 0 : Number(e.target.value))} className="mt-0.5 h-8 font-mono" data-testid={`salary-${k}`} placeholder="0" />
          </div>
        ))}
      </div>
    </div>
  );
}


function IdProofField({ label, value, onChange, className, employeeId, kind, initial }) {
  const [proof, setProof] = useState(initial || null);
  const [uploading, setUploading] = useState(false);
  const [preview, setPreview] = useState(null); // blob URL string
  const fileRef = React.useRef(null);

  const upload = async (file) => {
    if (!file) return;
    if (!employeeId) {
      toast.error('Save the employee first, then upload the document.');
      return;
    }
    setUploading(true);
    try {
      const fd = new FormData();
      fd.append('file', file);
      const { data } = await axios.post(`${API}/api/accounting/employees/${employeeId}/documents/${kind}`, fd, {
        headers: { Authorization: `Bearer ${localStorage.getItem('token')}`, 'Content-Type': 'multipart/form-data' },
        withCredentials: true,
      });
      setProof(data);
      toast.success(`${label} document uploaded`);
    } catch (e) { toast.error(e.response?.data?.detail || 'Upload failed'); }
    finally { setUploading(false); if (fileRef.current) fileRef.current.value = ''; }
  };

  const openPreview = async () => {
    if (!proof || !employeeId) return;
    try {
      const res = await axios.get(`${API}/api/accounting/employees/${employeeId}/documents/${kind}/download`, { ...auth(), responseType: 'blob' });
      setPreview(URL.createObjectURL(res.data));
    } catch { toast.error('Could not open document'); }
  };

  const remove = async () => {
    if (!proof || !employeeId) { setProof(null); return; }
    if (!window.confirm(`Remove ${label} document?`)) return;
    try {
      await axios.delete(`${API}/api/accounting/employees/${employeeId}/documents/${kind}`, auth());
      setProof(null);
      toast.success(`${label} document removed`);
    } catch (e) { toast.error(e.response?.data?.detail || 'Remove failed'); }
  };

  return (
    <div>
      <Label className="text-xs text-slate-600">{label}</Label>
      <div className="mt-1 flex items-stretch gap-1.5">
        <Input value={value || ''} onChange={(e) => onChange(e.target.value)} className={`${className || ''} flex-1`} data-testid={`employee-${kind}-input`} />
        {proof ? (
          <div className="flex items-center gap-1 rounded-md border border-emerald-200 bg-emerald-50 px-1.5" data-testid={`employee-${kind}-doc`}>
            <button type="button" onClick={openPreview} title={proof.display_name || 'Preview'} className="flex h-7 w-7 items-center justify-center rounded text-emerald-700 hover:bg-emerald-100" data-testid={`employee-${kind}-preview`}>
              <Eye className="h-3.5 w-3.5" />
            </button>
            <button type="button" onClick={remove} title="Remove" className="flex h-7 w-7 items-center justify-center rounded text-rose-600 hover:bg-rose-100" data-testid={`employee-${kind}-remove`}>
              <X className="h-3.5 w-3.5" />
            </button>
          </div>
        ) : (
          <Button type="button" variant="outline" size="sm" className="h-9 shrink-0" disabled={uploading || !employeeId}
            title={employeeId ? `Upload ${label} card` : 'Save the employee first to upload documents'}
            onClick={() => fileRef.current?.click()} data-testid={`employee-${kind}-upload`}>
            {uploading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Upload className="h-3.5 w-3.5" />}
          </Button>
        )}
        <input ref={fileRef} type="file" className="hidden" accept="image/png,image/jpeg,image/webp,image/gif,application/pdf"
          onChange={(e) => upload(e.target.files?.[0])} />
      </div>
      {proof && (
        <p className="mt-1 truncate text-[11px] text-emerald-700" data-testid={`employee-${kind}-name`}>
          <FileText className="mr-1 inline-block h-3 w-3" />{proof.display_name || proof.original_filename}
        </p>
      )}
      {preview && (
        <Dialog open onOpenChange={(o) => { if (!o) { URL.revokeObjectURL(preview); setPreview(null); } }}>
          <DialogContent className="w-[95vw] max-w-2xl" data-testid={`employee-${kind}-preview-dialog`}>
            <DialogHeader>
              <DialogTitle className="truncate text-sm">{proof.display_name || label}</DialogTitle>
            </DialogHeader>
            <div className="max-h-[70vh] overflow-auto rounded-lg bg-slate-50 p-2">
              {proof.is_image
                ? <img src={preview} alt={label} className="mx-auto max-h-[65vh] rounded" />
                : <iframe title={label} src={preview} className="h-[65vh] w-full rounded" />}
            </div>
          </DialogContent>
        </Dialog>
      )}
    </div>
  );
}


function EmployeeForm({ dialog, users, departments, cities, onClose, onSaved }) {
  const editing = dialog.mode === 'edit';
  const it = dialog.item || {};
  const [f, setF] = useState({
    full_name: it.full_name || '', employee_code: it.employee_code || '', linked_user_id: it.linked_user_id || '',
    department: it.department || '', designation: it.designation || '', email: it.email || '', phone: it.phone || '',
    alternate_phone: it.alternate_phone || '',
    date_of_birth: it.date_of_birth || '', date_of_joining: it.date_of_joining || '',
    gender: it.gender || '', marital_status: it.marital_status || '', blood_group: it.blood_group || '',
    pan: it.pan || '', aadhaar: it.aadhaar || '', uan: it.uan || '', pf_number: it.pf_number || '', esi_number: it.esi_number || '',
    bank_account_no: it.bank_account_no || '', bank_ifsc: it.bank_ifsc || '', bank_name: it.bank_name || '',
    bank_branch: it.bank_branch || '', bank_account_holder: it.bank_account_holder || '', upi_id: it.upi_id || '',
    reporting_manager: it.reporting_manager || '',
    city: it.city || '', state: it.state || '',
    address: it.address || { address_line_1: '', address_line_2: '', city: it.city || '', state: it.state || '', pincode: '', country: 'India', formatted_address: '', lat: null, lng: null },
    salary: it.salary || {
      basic: 0, hra: 0, conveyance_allowance: 0, medical_allowance: 0, special_allowance: 0,
      lta: 0, other_allowances: 0, bonus_monthly: 0,
      employer_pf: 0, employer_esi: 0, gratuity: 0,
      employee_pf: 0, employee_esi: 0, professional_tax: 0,
      annual_bonus: 0, annual_variable_pay: 0, annual_lta_reimbursement: 0, annual_medical_reimbursement: 0,
    },
    family_contacts: (it.family_contacts || []).map((c) => ({ ...c })),
    emergency_contacts: (it.emergency_contacts || []).map((c) => ({ ...c })),
    is_active: it.is_active !== false, notes: it.notes || '',
  });
  const [saving, setSaving] = useState(false);
  const set = (k, v) => setF((p) => ({ ...p, [k]: v }));
  const setAddr = (patch) => setF((p) => ({ ...p, address: { ...p.address, ...patch } }));
  const setSal = (k, v) => setF((p) => ({ ...p, salary: { ...p.salary, [k]: v } }));

  const { monthlyGross, monthlyEmployerContrib, monthlyCtc, annualCtc, monthlyDeductions, takeHomeMonthly } = useMemo(() => {
    const s = f.salary || {};
    const sum = (keys) => keys.reduce((t, k) => t + (Number(s[k]) || 0), 0);
    const gross = sum(SALARY_EARN_KEYS.map((r) => r[0]));
    const ercon = sum(SALARY_EMP_KEYS.map((r) => r[0]));
    const ded = sum(SALARY_DED_KEYS.map((r) => r[0]));
    const annual = sum(SALARY_ANN_KEYS.map((r) => r[0]));
    const mctc = gross + ercon;
    return {
      monthlyGross: gross,
      monthlyEmployerContrib: ercon,
      monthlyCtc: mctc,
      annualCtc: mctc * 12 + annual,
      monthlyDeductions: ded,
      takeHomeMonthly: Math.max(0, gross - ded),
    };
  }, [f.salary]);

  const submit = async () => {
    if (!f.full_name.trim()) { toast.error('Employee name is required'); return; }
    const cleanFam = f.family_contacts.map((c) => ({ ...c, id: c.id && !String(c.id).startsWith('new-') ? c.id : undefined })).filter((c) => c.name || c.phone || c.email);
    const cleanEmg = f.emergency_contacts.map((c) => ({ ...c, id: c.id && !String(c.id).startsWith('new-') ? c.id : undefined })).filter((c) => c.name || c.phone || c.email);
    setSaving(true);
    try {
      const payload = { ...f, linked_user_id: f.linked_user_id || null, family_contacts: cleanFam, emergency_contacts: cleanEmg };
      if (editing) await axios.patch(`${API}/api/accounting/employees/${it.id}`, payload, auth());
      else await axios.post(`${API}/api/accounting/employees`, payload, auth());
      toast.success(editing ? 'Updated' : 'Created'); onSaved();
    } catch (e) { toast.error(e.response?.data?.detail || 'Save failed'); } finally { setSaving(false); }
  };

  const addr = f.address || {};

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="w-[95vw] max-w-4xl max-h-[92vh] overflow-y-auto p-4 sm:p-6" data-testid="employee-form-dialog">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2"><Users className="h-5 w-5 text-indigo-600" />{editing ? 'Edit' : 'Add'} Employee</DialogTitle>
          <DialogDescription>Capture identification, address, bank, full CTC breakdown, and family / emergency contacts.</DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <SectionCard icon={IdCard} title="Identification" subtitle="Personal & employment details" accent="indigo">
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
              <Field label="Full Name *" className="sm:col-span-2"><Input value={f.full_name} onChange={(e) => set('full_name', e.target.value)} data-testid="employee-form-name" /></Field>
              <Field label="Employee Code"><Input value={f.employee_code} onChange={(e) => set('employee_code', e.target.value)} data-testid="employee-form-code" /></Field>
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
              <Field label="Date of Birth"><Input type="date" value={f.date_of_birth} onChange={(e) => set('date_of_birth', e.target.value)} data-testid="employee-form-dob" /></Field>
              <Field label="Date of Joining"><Input type="date" value={f.date_of_joining} onChange={(e) => set('date_of_joining', e.target.value)} data-testid="employee-form-doj" /></Field>
              <Field label="Gender">
                <Select value={f.gender || undefined} onValueChange={(v) => set('gender', v)}>
                  <SelectTrigger data-testid="employee-form-gender"><SelectValue placeholder="Select" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="Male">Male</SelectItem><SelectItem value="Female">Female</SelectItem>
                    <SelectItem value="Other">Other</SelectItem><SelectItem value="Prefer not to say">Prefer not to say</SelectItem>
                  </SelectContent>
                </Select>
              </Field>
              <Field label="Marital Status">
                <Select value={f.marital_status || undefined} onValueChange={(v) => set('marital_status', v)}>
                  <SelectTrigger><SelectValue placeholder="Select" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="Single">Single</SelectItem><SelectItem value="Married">Married</SelectItem>
                    <SelectItem value="Divorced">Divorced</SelectItem><SelectItem value="Widowed">Widowed</SelectItem>
                  </SelectContent>
                </Select>
              </Field>
              <Field label="Blood Group">
                <Select value={f.blood_group || undefined} onValueChange={(v) => set('blood_group', v)}>
                  <SelectTrigger><SelectValue placeholder="Select" /></SelectTrigger>
                  <SelectContent>{['A+','A-','B+','B-','O+','O-','AB+','AB-'].map((b) => <SelectItem key={b} value={b}>{b}</SelectItem>)}</SelectContent>
                </Select>
              </Field>
              <Field label="Email"><Input value={f.email} onChange={(e) => set('email', e.target.value)} /></Field>
              <Field label="Phone"><Input value={f.phone} onChange={(e) => set('phone', e.target.value)} /></Field>
              <Field label="Alt Phone"><Input value={f.alternate_phone} onChange={(e) => set('alternate_phone', e.target.value)} /></Field>
              <Field label="Link to CRM User">
                <Select value={f.linked_user_id || '__none__'} onValueChange={(v) => set('linked_user_id', v === '__none__' ? '' : v)}>
                  <SelectTrigger data-testid="employee-form-user"><SelectValue placeholder="Not linked" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__none__">Not linked</SelectItem>
                    {users.map((u) => <SelectItem key={u.id} value={u.id}>{u.name || u.full_name || u.email}</SelectItem>)}
                  </SelectContent>
                </Select>
              </Field>
              <IdProofField label="PAN" value={f.pan} onChange={(v) => set('pan', v.toUpperCase())} className="font-mono uppercase" employeeId={editing ? it.id : null} kind="pan" initial={it.pan_document} />
              <IdProofField label="Aadhaar" value={f.aadhaar} onChange={(v) => set('aadhaar', v)} className="font-mono" employeeId={editing ? it.id : null} kind="aadhaar" initial={it.aadhaar_document} />
              <Field label="UAN"><Input value={f.uan} onChange={(e) => set('uan', e.target.value)} className="font-mono" /></Field>
              <Field label="PF Number"><Input value={f.pf_number} onChange={(e) => set('pf_number', e.target.value)} className="font-mono" /></Field>
              <Field label="ESI Number"><Input value={f.esi_number} onChange={(e) => set('esi_number', e.target.value)} className="font-mono" /></Field>
              <div className="col-span-1 flex items-center gap-2 sm:col-span-2 lg:col-span-3">
                <Switch checked={f.is_active} onCheckedChange={(v) => set('is_active', v)} data-testid="employee-form-active" />
                <Label className="text-xs">Active</Label>
              </div>
            </div>
          </SectionCard>

          <SectionCard icon={MapPin} title="Residential Address" subtitle="Search via Google Places, then refine inline" accent="amber">
            <div className="space-y-3">
              <GooglePlacesAddressSearch
                placeholder="Search address (3+ chars)…"
                cityHint={addr.city || f.city || ''}
                testId="employee-places"
                onPick={(p) => {
                  setAddr({
                    address_line_1: p.address_line_1 || '',
                    address_line_2: p.address_line_2 || '',
                    city: p.city || addr.city || '',
                    state: p.state || addr.state || '',
                    pincode: p.pincode || '',
                    formatted_address: p.formatted_address || '',
                    lat: p.lat ?? null, lng: p.lng ?? null,
                  });
                  if (p.city) setF((prev) => ({ ...prev, city: p.city, state: p.state || prev.state }));
                  toast.success('Address captured');
                }}
              />
              {addr.formatted_address && (
                <div className="flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50/60 p-2.5 text-xs text-amber-900" data-testid="employee-address-pill">
                  <MapPin className="mt-0.5 h-3.5 w-3.5 flex-shrink-0 text-amber-600" />
                  <span className="leading-relaxed">{addr.formatted_address}</span>
                </div>
              )}
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
                <Field label="Address line 1" className="sm:col-span-2"><Input value={addr.address_line_1 || ''} onChange={(e) => setAddr({ address_line_1: e.target.value })} data-testid="employee-addr1" /></Field>
                <Field label="Address line 2"><Input value={addr.address_line_2 || ''} onChange={(e) => setAddr({ address_line_2: e.target.value })} data-testid="employee-addr2" /></Field>
                <Field label="City">
                  <Input list="employee-cities" value={addr.city || ''} onChange={(e) => { setAddr({ city: e.target.value }); set('city', e.target.value); }} placeholder="Type to search" data-testid="employee-form-city" />
                  <datalist id="employee-cities">{cities.map((c) => <option key={c.id} value={c.name} />)}</datalist>
                </Field>
                <Field label="State"><Input value={addr.state || ''} onChange={(e) => { setAddr({ state: e.target.value }); set('state', e.target.value); }} /></Field>
                <Field label="Pincode"><Input value={addr.pincode || ''} onChange={(e) => setAddr({ pincode: e.target.value })} /></Field>
                <Field label="Country"><Input value={addr.country || 'India'} onChange={(e) => setAddr({ country: e.target.value })} /></Field>
              </div>
            </div>
          </SectionCard>

          <SectionCard icon={Landmark} title="Bank Account" subtitle="Salary credit & reimbursements" accent="emerald">
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
              <Field label="Bank Name"><Input value={f.bank_name} onChange={(e) => set('bank_name', e.target.value)} placeholder="e.g. HDFC Bank" data-testid="employee-bank-name" /></Field>
              <Field label="Branch"><Input value={f.bank_branch} onChange={(e) => set('bank_branch', e.target.value)} placeholder="e.g. Banjara Hills" data-testid="employee-bank-branch" /></Field>
              <Field label="Account Holder"><Input value={f.bank_account_holder} onChange={(e) => set('bank_account_holder', e.target.value)} placeholder="Name on the account" data-testid="employee-bank-holder" /></Field>
              <Field label="Account No."><Input value={f.bank_account_no} onChange={(e) => set('bank_account_no', e.target.value)} className="font-mono" data-testid="employee-bank-acno" /></Field>
              <Field label="IFSC"><Input value={f.bank_ifsc} onChange={(e) => set('bank_ifsc', e.target.value.toUpperCase())} placeholder="HDFC0001234" className="font-mono uppercase" data-testid="employee-bank-ifsc" /></Field>
              <Field label="UPI ID"><Input value={f.upi_id} onChange={(e) => set('upi_id', e.target.value)} placeholder="employee@upi" data-testid="employee-upi" /></Field>
            </div>
            {(f.bank_name || f.bank_account_no || f.upi_id) && (
              <div className="mt-3 flex flex-col items-start gap-3 rounded-lg bg-gradient-to-r from-emerald-600 to-teal-600 p-3 text-white shadow-inner sm:flex-row sm:items-center sm:justify-between" data-testid="employee-bank-pill">
                <div className="min-w-0">
                  <p className="text-[10px] uppercase tracking-widest text-emerald-100">{f.bank_name || 'Bank'}{f.bank_branch ? ` · ${f.bank_branch}` : ''}</p>
                  <p className="mt-1 truncate font-mono text-sm tracking-wider">{f.bank_account_no || '— — — — — — — —'}</p>
                  <p className="mt-0.5 text-xs text-emerald-100">{f.bank_account_holder || '—'} {f.bank_ifsc ? ` · ${f.bank_ifsc}` : ''}{f.upi_id ? ` · ${f.upi_id}` : ''}</p>
                </div>
                <Landmark className="h-8 w-8 text-emerald-200/80" />
              </div>
            )}
          </SectionCard>

          <SectionCard icon={Wallet} title="Salary Structure — CTC Breakdown" subtitle="Monthly components (₹). Totals recompute live." accent="violet">
            <div className="space-y-3">
              <SalaryGrid label="Monthly Earnings" accent="emerald" rows={SALARY_EARN_KEYS} salary={f.salary} onChange={setSal} />
              <SalaryGrid label="Employer Contributions (added to CTC)" accent="sky" rows={SALARY_EMP_KEYS} salary={f.salary} onChange={setSal} />
              <SalaryGrid label="Employee Deductions (reduce take-home)" accent="amber" rows={SALARY_DED_KEYS} salary={f.salary} onChange={setSal} />
              <SalaryGrid label="Annual / Variable Components" accent="sky" rows={SALARY_ANN_KEYS} salary={f.salary} onChange={setSal} />

              <div className="grid grid-cols-2 gap-2 rounded-lg bg-gradient-to-r from-violet-600 to-fuchsia-600 p-3 text-white shadow-inner sm:grid-cols-4" data-testid="salary-summary">
                <SummaryStat label="Monthly Gross" value={fmtINR(monthlyGross)} sub="Earnings only" />
                <SummaryStat label="Take-home (est.)" value={fmtINR(takeHomeMonthly)} sub={`After ${fmtINR(monthlyDeductions)} deductions`} />
                <SummaryStat label="Monthly CTC" value={fmtINR(monthlyCtc)} sub={`+ ${fmtINR(monthlyEmployerContrib)} employer`} />
                <SummaryStat label="Annual CTC" value={fmtINR(annualCtc)} sub="incl. annual components" highlight />
              </div>
            </div>
          </SectionCard>

          <SectionCard icon={Users} title="Family Members" subtitle="Spouse, children, parents — useful for dependants & insurance" accent="rose">
            <ContactsTable rows={f.family_contacts} onChange={(rs) => set('family_contacts', rs)} primaryLabel="Primary nominee" testIdPrefix="emp-family" showDob showDependent />
          </SectionCard>

          <SectionCard icon={HeartPulse} title="Emergency Contacts" subtitle="People to call in case of an emergency" accent="rose">
            <ContactsTable rows={f.emergency_contacts} onChange={(rs) => set('emergency_contacts', rs)} primaryLabel="Primary contact" testIdPrefix="emp-emergency" />
          </SectionCard>

          <div>
            <Field label="Notes"><Textarea rows={2} value={f.notes} onChange={(e) => set('notes', e.target.value)} /></Field>
          </div>
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={onClose} disabled={saving}>Cancel</Button>
          <Button onClick={submit} disabled={saving} className="bg-indigo-600 hover:bg-indigo-700" data-testid="employee-form-save-btn">{saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}{editing ? 'Save' : 'Create'}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function SummaryStat({ label, value, sub, highlight = false }) {
  return (
    <div className={`min-w-0 rounded-lg px-3 py-2 ${highlight ? 'bg-white/15 ring-1 ring-white/30' : ''}`}>
      <p className="text-[10px] uppercase tracking-widest text-violet-100">{label}</p>
      <p className="mt-0.5 truncate text-base font-bold">{value}</p>
      {sub && <p className="mt-0.5 truncate text-[10px] text-violet-100/80">{sub}</p>}
    </div>
  );
}
