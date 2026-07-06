import React, { useEffect, useState, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import axios from 'axios';
import { toast } from 'sonner';
import { format, parseISO, isValid } from 'date-fns';
import { Button } from '../components/ui/button';
import { Card, CardContent } from '../components/ui/card';
import { Badge } from '../components/ui/badge';
import { Input } from '../components/ui/input';
import { Label } from '../components/ui/label';
import { Textarea } from '../components/ui/textarea';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '../components/ui/select';
import { DatePicker } from '../components/ui/date-picker';
import { PrintRequestOrderBanner } from '../components/PrintRequestOrderBanner';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from '../components/ui/dialog';
import {
  ArrowLeft, Printer, Tag, Calendar, Users, Building2, FileText,
  Download, Loader2, Pencil, Trash2, History, ExternalLink, Sparkles, FileCheck2,
  Boxes, TrendingUp, Gauge,
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { useTenantConfig } from '../context/TenantConfigContext';

const API = `${process.env.REACT_APP_BACKEND_URL}/api`;
const HEAD = () => {
  const t = localStorage.getItem('token');
  return t ? { Authorization: `Bearer ${t}` } : {};
};
const fmtDate = (s, f = 'MMM d, yyyy') => { try { const d = parseISO(s); return isValid(d) ? format(d, f) : '—'; } catch { return '—'; } };
const statusStyle = (color) => ({ color: color || '#64748b', borderColor: (color || '#64748b') + '55', backgroundColor: (color || '#64748b') + '14' });
const ADMIN_ROLES = ['ceo', 'director', 'admin', 'system admin', 'system_admin', 'tenant_admin'];

const InfoRow = ({ icon: Icon, label, value, testid }) => (
  <div className="flex items-start gap-2.5" data-testid={testid}>
    <Icon className="h-4 w-4 text-emerald-500 mt-0.5 shrink-0" />
    <div className="min-w-0">
      <p className="text-[11px] uppercase tracking-wide text-slate-400">{label}</p>
      <p className="text-sm text-slate-800 font-medium break-words">{value || '—'}</p>
    </div>
  </div>
);

export default function PrintRequestDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { user } = useAuth();
  const { hasActionPermission } = useTenantConfig();
  const canDelete = ADMIN_ROLES.includes((user?.role || '').trim().toLowerCase()) || hasActionPermission('print_requests', 'delete');

  const [pr, setPr] = useState(null);
  const [loading, setLoading] = useState(true);
  const [statuses, setStatuses] = useState([]);
  const [departments, setDepartments] = useState([]);
  const [vendors, setVendors] = useState([]);

  const [newStatus, setNewStatus] = useState('');
  const [statusNote, setStatusNote] = useState('');
  const [savingStatus, setSavingStatus] = useState(false);

  const [editOpen, setEditOpen] = useState(false);
  const [form, setForm] = useState({});
  const [savingEdit, setSavingEdit] = useState(false);

  const [showDelete, setShowDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [downloadingId, setDownloadingId] = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const { data } = await axios.get(`${API}/print-requests/${id}`, { headers: HEAD() });
      setPr(data);
      setNewStatus(data.status_id || '');
    } catch (e) {
      toast.error(e.response?.data?.detail || 'Failed to load print request');
    } finally { setLoading(false); }
  }, [id]);

  useEffect(() => { load(); }, [load]);
  useEffect(() => {
    axios.get(`${API}/print-request-statuses`, { headers: HEAD() }).then((r) => setStatuses(r.data?.statuses || [])).catch(() => {});
    axios.get(`${API}/master-departments`, { headers: HEAD() }).then((r) => setDepartments(r.data?.departments || [])).catch(() => {});
    axios.get(`${API}/print-vendors`, { headers: HEAD() }).then((r) => setVendors(r.data?.vendors || [])).catch(() => {});
  }, []);

  const updateStatus = async () => {
    if (!newStatus || newStatus === pr.status_id) { toast.info('Pick a different status'); return; }
    setSavingStatus(true);
    try {
      const { data } = await axios.patch(`${API}/print-requests/${id}/status`, { status_id: newStatus, note: statusNote || null }, { headers: HEAD() });
      setPr(data); setStatusNote('');
      toast.success(`Status updated to ${data.status_name}`);
    } catch (e) {
      toast.error(e.response?.data?.detail || 'Failed to update status');
    } finally { setSavingStatus(false); }
  };

  const openEdit = () => {
    setForm({
      initialOrderQty: pr.initial_order_quantity ?? pr.quantity ?? '',
      startingMonthlyVolume: pr.starting_monthly_volume ?? '',
      totalMonthlyVolume: pr.total_monthly_volume ?? '',
      dueDate: pr.requested_due_date ? parseISO(pr.requested_due_date) : null,
      notes: pr.notes || '',
      deptId: pr.assigned_department_id || '',
      vendorId: pr.vendor_id || '',
    });
    setEditOpen(true);
  };

  const saveEdit = async () => {
    if (!form.initialOrderQty || Number(form.initialOrderQty) <= 0) { toast.error('Enter a valid Initial Order Quantity'); return; }
    if (form.startingMonthlyVolume === '' || Number(form.startingMonthlyVolume) < 0) { toast.error('Enter the Initial Monthly Quantity'); return; }
    if (!form.dueDate) { toast.error('Select a Requested Delivery Date'); return; }
    setSavingEdit(true);
    try {
      const { data } = await axios.patch(`${API}/print-requests/${id}`, {
        initial_order_quantity: Number(form.initialOrderQty),
        starting_monthly_volume: Number(form.startingMonthlyVolume),
        total_monthly_volume: form.totalMonthlyVolume === '' ? null : Number(form.totalMonthlyVolume),
        requested_due_date: form.dueDate ? format(form.dueDate, 'yyyy-MM-dd') : undefined,
        notes: form.notes || '',
        assigned_department_id: form.deptId || null,
        vendor_id: form.vendorId || null,
      }, { headers: HEAD() });
      setPr(data); setEditOpen(false);
      toast.success('Print request updated');
    } catch (e) {
      toast.error(e.response?.data?.detail || 'Failed to update');
    } finally { setSavingEdit(false); }
  };

  const confirmDelete = async () => {
    setDeleting(true);
    try {
      await axios.delete(`${API}/print-requests/${id}`, { headers: HEAD() });
      toast.success('Print request deleted');
      navigate('/print-requests');
    } catch (e) {
      toast.error(e.response?.data?.detail || 'Failed to delete');
      setDeleting(false);
    }
  };

  const downloadFile = async (file) => {
    setDownloadingId(file.id);
    try {
      const res = await axios.get(`${API}/marketing-requests/files/${file.id}`, { headers: HEAD(), responseType: 'blob' });
      const url = window.URL.createObjectURL(new Blob([res.data], { type: file.content_type || 'application/octet-stream' }));
      const a = document.createElement('a');
      a.href = url; a.download = file.filename || 'design-file';
      document.body.appendChild(a); a.click(); a.remove();
      window.URL.revokeObjectURL(url);
    } catch (e) {
      toast.error('Could not download file');
    } finally { setDownloadingId(null); }
  };

  if (loading) return <div className="flex items-center justify-center h-96"><Loader2 className="h-8 w-8 animate-spin text-emerald-600" /></div>;
  if (!pr) return null;

  const files = pr.approved_design_files || [];

  return (
    <div className="p-4 sm:p-6 max-w-5xl mx-auto space-y-6" data-testid="print-detail-page">
      <div className="flex items-center justify-between">
        <Button variant="ghost" size="sm" onClick={() => navigate('/print-requests')} data-testid="print-back-btn">
          <ArrowLeft className="h-4 w-4 mr-2" /> Back to Print Requests
        </Button>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={openEdit} data-testid="print-edit-btn"><Pencil className="h-4 w-4 mr-2" /> Edit</Button>
          {canDelete && (
            <Button variant="outline" size="sm" onClick={() => setShowDelete(true)} className="text-red-600 border-red-200 hover:bg-red-50 hover:text-red-700" data-testid="print-delete-btn">
              <Trash2 className="h-4 w-4 mr-2" /> Delete
            </Button>
          )}
        </div>
      </div>

      {/* Hero */}
      <div className="relative overflow-hidden rounded-3xl bg-white border border-slate-200/70 p-6 md:p-8 shadow-[0_10px_40px_-15px_rgba(6,78,59,0.18)]" data-testid="print-hero">
        <div className="absolute left-0 top-0 h-full w-1.5 bg-gradient-to-b from-emerald-400 to-emerald-600" />
        <div className="flex flex-col lg:flex-row lg:items-start lg:justify-between gap-4">
          <div className="min-w-0">
            <div className="flex items-center gap-2 mb-3 flex-wrap">
              <span className="inline-flex items-center gap-1.5 text-[11px] font-medium px-2.5 py-1 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-100 font-mono">
                <Tag className="h-3 w-3" /> {pr.print_number}
              </span>
              <Badge variant="outline" style={statusStyle(pr.status_color)} className="border text-xs" data-testid="print-status-badge">{pr.status_name}</Badge>
            </div>
            <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-slate-900">{pr.source_title || pr.request_type_name || 'Print Request'}</h1>
            <button onClick={() => navigate(`/marketing-requests/${pr.source_marketing_request_id}`)} className="mt-2 inline-flex items-center gap-1.5 text-sm text-emerald-600 hover:text-emerald-700" data-testid="print-source-link">
              <Sparkles className="h-3.5 w-3.5" /> From design {pr.source_request_number} <ExternalLink className="h-3 w-3" />
            </button>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left: details */}
        <div className="lg:col-span-2 space-y-6">
          <Card className="border border-slate-100 rounded-xl">
            <CardContent className="p-5 grid grid-cols-1 sm:grid-cols-2 gap-5">
              <InfoRow icon={Users} label="Lead" value={pr.lead_company || pr.lead_name} testid="print-info-lead" />
              <InfoRow icon={Boxes} label="Initial Order Quantity" value={pr.initial_order_quantity ?? pr.quantity} testid="print-info-initial-qty" />
              {(pr.total_monthly_volume ?? null) !== null && (
                <InfoRow icon={TrendingUp} label="Total Monthly Volume (Future Potential)" value={pr.total_monthly_volume} testid="print-info-total-volume" />
              )}
              {(pr.starting_monthly_volume ?? null) !== null && (
                <InfoRow icon={Gauge} label="Initial Monthly Quantity" value={pr.starting_monthly_volume} testid="print-info-starting-volume" />
              )}
              <InfoRow icon={Calendar} label="Requested Due Date" value={fmtDate(pr.requested_due_date)} testid="print-info-due" />
              <InfoRow icon={Sparkles} label="Production Team" value={pr.assigned_department_name} testid="print-info-team" />
              <InfoRow icon={Building2} label="Vendor" value={pr.vendor_name} testid="print-info-vendor" />
              <InfoRow icon={Printer} label="Created By" value={`${pr.created_by_name} · ${fmtDate(pr.created_at)}`} testid="print-info-creator" />
            </CardContent>
          </Card>

          {/* Approved design files */}
          <Card className="border border-slate-100 rounded-xl">
            <CardContent className="p-5">
              <h3 className="text-sm font-semibold text-slate-800 flex items-center gap-2 mb-3">
                <FileCheck2 className="h-4 w-4 text-emerald-600" /> Approved Design {pr.approved_version_no ? `(V${pr.approved_version_no})` : ''}
              </h3>
              {files.length === 0 && (pr.approved_design_links || []).length === 0 ? (
                <p className="text-sm text-muted-foreground">No approved design files were attached.</p>
              ) : (
                <div className="space-y-2">
                  {files.map((f) => (
                    <div key={f.id} className="flex items-center justify-between gap-2 rounded-lg border border-slate-100 px-3 py-2" data-testid={`print-file-${f.id}`}>
                      <div className="flex items-center gap-2 min-w-0">
                        <FileText className="h-4 w-4 text-slate-400 shrink-0" />
                        <span className="text-sm text-slate-700 truncate">{f.filename}</span>
                      </div>
                      <Button variant="ghost" size="sm" onClick={() => downloadFile(f)} disabled={downloadingId === f.id} data-testid={`print-file-dl-${f.id}`}>
                        {downloadingId === f.id ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
                      </Button>
                    </div>
                  ))}
                  {(pr.approved_design_links || []).map((lnk, i) => (
                    <a key={i} href={lnk} target="_blank" rel="noreferrer" className="flex items-center gap-2 rounded-lg border border-slate-100 px-3 py-2 text-sm text-emerald-600 hover:bg-emerald-50" data-testid={`print-link-${i}`}>
                      <ExternalLink className="h-4 w-4" /> <span className="truncate">{lnk}</span>
                    </a>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>

          {/* CDR File Link for Printing — live from the associated design request */}
          <Card className="border border-emerald-200 rounded-xl bg-emerald-50/40" data-testid="print-cdr-section">
            <CardContent className="p-5">
              <h3 className="text-sm font-semibold text-slate-800 flex items-center gap-2 mb-1">
                <ExternalLink className="h-4 w-4 text-emerald-600" /> CDR File Link for Printing
              </h3>
              <p className="text-xs text-slate-500 mb-3">Always reflects the current File Link on the source design request.</p>
              {(pr.design_file_links || []).length === 0 ? (
                <p className="text-sm text-muted-foreground" data-testid="print-cdr-empty">No CDR / file link set on the design request yet.</p>
              ) : (
                <div className="space-y-2">
                  {(pr.design_file_links || []).map((lnk, i) => (
                    <a key={i} href={lnk} target="_blank" rel="noreferrer" className="flex items-center gap-2 rounded-lg border border-emerald-200 bg-white px-3 py-2.5 text-sm text-emerald-700 hover:bg-emerald-50 break-all" data-testid={`print-cdr-link-${i}`}>
                      <ExternalLink className="h-4 w-4 shrink-0" /> <span className="truncate">{lnk}</span>
                    </a>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>

          {pr.notes && (
            <Card className="border border-slate-100 rounded-xl">
              <CardContent className="p-5">
                <h3 className="text-sm font-semibold text-slate-800 mb-2">Notes / Print Specs</h3>
                <p className="text-sm text-slate-700 whitespace-pre-wrap" data-testid="print-notes">{pr.notes}</p>
              </CardContent>
            </Card>
          )}
        </div>

        {/* Right: status + history */}
        <div className="space-y-6">
          <Card className="border border-emerald-100 rounded-xl">
            <CardContent className="p-5 space-y-3">
              <h3 className="text-sm font-semibold text-slate-800">Update Status</h3>
              <Select value={newStatus} onValueChange={setNewStatus}>
                <SelectTrigger data-testid="print-status-select"><SelectValue placeholder="Select status" /></SelectTrigger>
                <SelectContent>
                  {statuses.map((s) => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}
                </SelectContent>
              </Select>
              <Input value={statusNote} onChange={(e) => setStatusNote(e.target.value)} placeholder="Optional note…" data-testid="print-status-note" />
              <Button onClick={updateStatus} disabled={savingStatus} className="w-full bg-emerald-600 hover:bg-emerald-700" data-testid="print-status-update">
                {savingStatus ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Update Status'}
              </Button>
            </CardContent>
          </Card>

          <Card className="border border-slate-100 rounded-xl">
            <CardContent className="p-5">
              <h3 className="text-sm font-semibold text-slate-800 flex items-center gap-2 mb-3"><History className="h-4 w-4 text-slate-400" /> Status History</h3>
              <div className="space-y-3">
                {(pr.status_history || []).slice().reverse().map((h, i) => (
                  <div key={i} className="flex gap-2.5" data-testid={`print-history-${i}`}>
                    <div className="w-2 h-2 rounded-full mt-1.5 shrink-0" style={{ backgroundColor: '#10b981' }} />
                    <div className="min-w-0">
                      <p className="text-sm text-slate-800 font-medium">{h.status_name}</p>
                      <p className="text-[11px] text-slate-500">{fmtDate(h.timestamp, 'MMM d, hh:mm a')} · {h.user_name}</p>
                      {h.note && <p className="text-xs text-slate-600 mt-0.5 italic">{h.note}</p>}
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </div>
      </div>

      {/* Edit dialog */}
      <Dialog open={editOpen} onOpenChange={(o) => { if (!o && !savingEdit) setEditOpen(false); }}>
        <DialogContent className="max-w-lg" data-testid="print-edit-dialog">
          <DialogHeader>
            <DialogTitle>Edit Print Request</DialogTitle>
            <DialogDescription>Update order quantities, delivery date, assignment, vendor and notes.</DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-1">
            <PrintRequestOrderBanner />
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Initial Order Quantity <span className="text-red-500">*</span></Label>
                <Input type="number" min={1} value={form.initialOrderQty || ''} onChange={(e) => setForm({ ...form, initialOrderQty: e.target.value })} data-testid="print-edit-qty" />
              </div>
              <div className="space-y-1.5">
                <Label>Requested Delivery Date <span className="text-red-500">*</span></Label>
                <DatePicker value={form.dueDate} onChange={(d) => setForm({ ...form, dueDate: d })} data-testid="print-edit-due" />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Initial Monthly Quantity <span className="text-red-500">*</span></Label>
                <Input type="number" min={0} value={form.startingMonthlyVolume ?? ''} onChange={(e) => setForm({ ...form, startingMonthlyVolume: e.target.value })} data-testid="print-edit-starting-volume" />
              </div>
              <div className="space-y-1.5">
                <Label>Total Monthly Volume (Future Potential)</Label>
                <Input type="number" min={0} value={form.totalMonthlyVolume ?? ''} onChange={(e) => setForm({ ...form, totalMonthlyVolume: e.target.value })} data-testid="print-edit-total-volume" />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label>Production team</Label>
              <Select value={form.deptId || '__none'} onValueChange={(v) => setForm({ ...form, deptId: v === '__none' ? '' : v })}>
                <SelectTrigger data-testid="print-edit-dept"><SelectValue placeholder="Select team" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="__none">— None —</SelectItem>
                  {departments.map((d) => <SelectItem key={d.id} value={d.id}>{d.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Vendor</Label>
              <Select value={form.vendorId || '__none'} onValueChange={(v) => setForm({ ...form, vendorId: v === '__none' ? '' : v })}>
                <SelectTrigger data-testid="print-edit-vendor"><SelectValue placeholder="Select vendor" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="__none">— None —</SelectItem>
                  {vendors.map((v) => <SelectItem key={v.id} value={v.id}>{v.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Notes / print specs</Label>
              <Textarea value={form.notes || ''} onChange={(e) => setForm({ ...form, notes: e.target.value })} rows={3} data-testid="print-edit-notes" />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditOpen(false)} disabled={savingEdit}>Cancel</Button>
            <Button onClick={saveEdit} disabled={savingEdit} className="bg-emerald-600 hover:bg-emerald-700" data-testid="print-edit-save">
              {savingEdit ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" /> Saving…</> : 'Save'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete confirm */}
      <Dialog open={showDelete} onOpenChange={(o) => { if (!o && !deleting) setShowDelete(false); }}>
        <DialogContent className="max-w-md" data-testid="print-delete-dialog">
          <DialogHeader>
            <DialogTitle>Delete this print request?</DialogTitle>
            <DialogDescription><b>{pr.print_number}</b> will be permanently removed. The approved design files remain on the original design request.</DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowDelete(false)} disabled={deleting}>Cancel</Button>
            <Button onClick={confirmDelete} disabled={deleting} className="bg-red-600 hover:bg-red-700" data-testid="print-delete-confirm">
              {deleting ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" /> Deleting…</> : 'Delete'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
