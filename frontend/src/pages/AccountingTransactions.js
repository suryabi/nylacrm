import React, { useState, useEffect, useCallback, useRef } from 'react';
import axios from 'axios';
import { toast } from 'sonner';
import {
  RefreshCw, Search, Loader2, ArrowDownLeft, ArrowUpRight, Paperclip, Upload,
  Trash2, FileText, Link2, Banknote, CheckCircle2, ChevronRight, Tag, Building2,
  Copy, ChevronLeft, CalendarRange, Download, FileSpreadsheet, FileDown, Hash,
} from 'lucide-react';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Label } from '../components/ui/label';
import { Textarea } from '../components/ui/textarea';
import { Badge } from '../components/ui/badge';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '../components/ui/select';
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger,
} from '../components/ui/dropdown-menu';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
} from '../components/ui/dialog';

const API = process.env.REACT_APP_BACKEND_URL;
const auth = () => ({ headers: { Authorization: `Bearer ${localStorage.getItem('token')}` }, withCredentials: true });
const fmt = (n) => `₹${Number(n || 0).toLocaleString('en-IN', { minimumFractionDigits: 2 })}`;

const EXPENSE_MASTERS = [
  { key: 'expense_type', label: 'Expense Type' },
  { key: 'expense_category', label: 'Expense Category' },
  { key: 'cost_center', label: 'Cost Center' },
  { key: 'project_business_unit', label: 'Business Unit' },
  { key: 'payment_source', label: 'Payment Source' },
];
const INCOME_MASTERS = [{ key: 'revenue_stream', label: 'Revenue Stream' }];
const PER_PAGE = 25;

const TIME_FILTERS = [
  { value: 'lifetime', label: 'Lifetime' },
  { value: 'this_week', label: 'This Week' }, { value: 'last_week', label: 'Last Week' },
  { value: 'this_month', label: 'This Month' }, { value: 'last_month', label: 'Last Month' },
  { value: 'this_quarter', label: 'This Quarter' }, { value: 'last_quarter', label: 'Last Quarter' },
  { value: 'last_3_months', label: 'Last 3 Months' }, { value: 'last_6_months', label: 'Last 6 Months' },
];

const iso = (d) => d.toISOString().slice(0, 10);
function presetRange(preset) {
  if (!preset || preset === 'lifetime') return null;
  const now = new Date();
  const y = now.getFullYear(), m = now.getMonth();
  const monday = (d) => { const x = new Date(d); const day = (x.getDay() + 6) % 7; x.setDate(x.getDate() - day); return x; };
  switch (preset) {
    case 'this_week': { const s = monday(now); const e = new Date(s); e.setDate(s.getDate() + 6); return { start: iso(s), end: iso(e) }; }
    case 'last_week': { const s = monday(now); s.setDate(s.getDate() - 7); const e = new Date(s); e.setDate(s.getDate() + 6); return { start: iso(s), end: iso(e) }; }
    case 'this_month': return { start: iso(new Date(y, m, 1)), end: iso(new Date(y, m + 1, 0)) };
    case 'last_month': return { start: iso(new Date(y, m - 1, 1)), end: iso(new Date(y, m, 0)) };
    case 'this_quarter': { const q = Math.floor(m / 3); return { start: iso(new Date(y, q * 3, 1)), end: iso(new Date(y, q * 3 + 3, 0)) }; }
    case 'last_quarter': { const q = Math.floor(m / 3) - 1; const yy = q < 0 ? y - 1 : y; const qq = (q + 4) % 4; return { start: iso(new Date(yy, qq * 3, 1)), end: iso(new Date(yy, qq * 3 + 3, 0)) }; }
    case 'last_3_months': return { start: iso(new Date(y, m - 2, 1)), end: iso(new Date(y, m + 1, 0)) };
    case 'last_6_months': return { start: iso(new Date(y, m - 5, 1)), end: iso(new Date(y, m + 1, 0)) };
    default: return null;
  }
}

const dateHeading = (d) => {
  const dt = new Date(d + 'T00:00:00');
  return dt.toLocaleDateString('en-IN', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' });
};

export default function AccountingTransactions() {
  const [tab, setTab] = useState('all');
  const [items, setItems] = useState([]);
  const [summary, setSummary] = useState({ untagged: 0, tagged: 0, all: 0 });
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [search, setSearch] = useState('');
  const [direction, setDirection] = useState('all');
  const [timeFilter, setTimeFilter] = useState('lifetime');
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [masters, setMasters] = useState({});
  const [vendors, setVendors] = useState([]);
  const [expandedId, setExpandedId] = useState(null);
  const [collapsedDates, setCollapsedDates] = useState({});
  const toggleDate = (d) => setCollapsedDates((p) => ({ ...p, [d]: !p[d] }));

  const loadMasters = useCallback(async () => {
    const keys = ['expense_type', 'expense_category', 'cost_center', 'project_business_unit', 'payment_source', 'revenue_stream'];
    const out = {};
    await Promise.all(keys.map(async (k) => {
      try { const { data } = await axios.get(`${API}/api/accounting/masters/${k}`, auth()); out[k] = data.items || []; }
      catch { out[k] = []; }
    }));
    setMasters(out);
    try { const { data } = await axios.get(`${API}/api/accounting/vendors`, auth()); setVendors((data.items || []).filter((v) => v.is_active)); } catch { /* ignore */ }
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (tab !== 'all') params.set('status', tab);
      if (direction !== 'all') params.set('direction', direction);
      if (search) params.set('search', search);
      const range = presetRange(timeFilter);
      if (range) { params.set('date_start', range.start); params.set('date_end', range.end); }
      params.set('page', page);
      params.set('limit', PER_PAGE);
      const { data } = await axios.get(`${API}/api/accounting/transactions?${params}`, auth());
      setItems(data.items || []);
      setTotal(data.total || 0);
      setSummary(data.summary || { untagged: 0, tagged: 0, all: 0 });
    } catch (e) { toast.error('Failed to load transactions'); } finally { setLoading(false); }
  }, [tab, direction, search, timeFilter, page]);

  useEffect(() => { loadMasters(); }, [loadMasters]);
  useEffect(() => { load(); }, [load]);

  const sync = async () => {
    setSyncing(true);
    try {
      const { data } = await axios.post(`${API}/api/accounting/transactions/sync`, {}, auth());
      toast.success(`Synced from Zoho — ${data.new} new, ${data.updated} updated`);
      load();
    } catch (e) { toast.error(e.response?.data?.detail || 'Sync failed'); } finally { setSyncing(false); }
  };

  // Update a single row in place (so expand state + counts stay smooth after edits)
  const patchRow = (updated) => {
    setItems((prev) => prev.map((r) => (r.id === updated.id ? { ...r, ...updated } : r)));
    load();
  };

  const exportData = async (format) => {
    try {
      const params = new URLSearchParams();
      if (tab !== 'all') params.set('status', tab);
      if (direction !== 'all') params.set('direction', direction);
      if (search) params.set('search', search);
      const range = presetRange(timeFilter);
      if (range) { params.set('date_start', range.start); params.set('date_end', range.end); }
      params.set('format', format);
      const res = await axios.get(`${API}/api/accounting/transactions/export?${params}`, { ...auth(), responseType: 'blob' });
      const url = URL.createObjectURL(res.data);
      const a = document.createElement('a');
      a.href = url;
      const ext = format === 'xlsx' ? 'xlsx' : format;
      a.download = `transactions.${ext}`;
      a.click();
      URL.revokeObjectURL(url);
      toast.success(`Exported ${format.toUpperCase()}`);
    } catch (e) { toast.error('Export failed'); }
  };

  return (
    <div className="mx-auto max-w-6xl p-6" data-testid="transactions-page">
      <div className="mb-5 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-bold text-slate-900">
            <Banknote className="h-6 w-6 text-indigo-600" /> Transactions
          </h1>
          <p className="mt-0.5 text-sm text-slate-500">
            Bank transactions from Zoho. <span className="font-medium text-amber-600">{summary.untagged} to tag</span> · {summary.all} total.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" data-testid="download-menu-btn"><Download className="mr-2 h-4 w-4" /> Download</Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onClick={() => exportData('xlsx')} data-testid="download-xlsx"><FileSpreadsheet className="mr-2 h-4 w-4 text-emerald-600" /> Excel (.xlsx)</DropdownMenuItem>
              <DropdownMenuItem onClick={() => exportData('csv')} data-testid="download-csv"><FileDown className="mr-2 h-4 w-4 text-slate-600" /> CSV</DropdownMenuItem>
              <DropdownMenuItem onClick={() => exportData('pdf')} data-testid="download-pdf"><FileText className="mr-2 h-4 w-4 text-rose-600" /> PDF</DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
          <Button onClick={sync} disabled={syncing} className="bg-indigo-600 hover:bg-indigo-700" data-testid="sync-zoho-btn">
            {syncing ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <RefreshCw className="mr-2 h-4 w-4" />} Sync from Zoho
          </Button>
        </div>
      </div>

      <div className="mb-4 flex flex-wrap items-center gap-2">
        <Select value={tab} onValueChange={(v) => { setTab(v); setExpandedId(null); setPage(1); }}>
          <SelectTrigger className="h-9 w-40" data-testid="filter-status"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All status</SelectItem>
            <SelectItem value="untagged">Untagged</SelectItem>
            <SelectItem value="tagged">Tagged</SelectItem>
          </SelectContent>
        </Select>
        <Select value={direction} onValueChange={(v) => { setDirection(v); setExpandedId(null); setPage(1); }}>
          <SelectTrigger className="h-9 w-40" data-testid="filter-direction"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All directions</SelectItem>
            <SelectItem value="credit">Money In (Income)</SelectItem>
            <SelectItem value="debit">Money Out (Expense)</SelectItem>
          </SelectContent>
        </Select>
        <Select value={timeFilter} onValueChange={(v) => { setTimeFilter(v); setExpandedId(null); setPage(1); }}>
          <SelectTrigger className="h-9 w-40" data-testid="filter-time">
            <CalendarRange className="mr-1 h-4 w-4 text-slate-400" /><SelectValue />
          </SelectTrigger>
          <SelectContent>
            {TIME_FILTERS.map((t) => <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>)}
          </SelectContent>
        </Select>
        <div className="relative">
          <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-slate-400" />
          <Input placeholder="Search payee / ref…" value={search} onChange={(e) => { setSearch(e.target.value); setPage(1); }} className="h-9 w-56 pl-8" data-testid="txn-search" />
        </div>
      </div>

      <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
        {loading ? (
          <div className="flex justify-center py-16 text-slate-400"><Loader2 className="h-6 w-6 animate-spin" /></div>
        ) : items.length === 0 ? (
          <div className="py-16 text-center text-sm text-slate-400" data-testid="txn-empty">
            No transactions. Click “Sync from Zoho” to pull bank transactions.
          </div>
        ) : (
          <table className="w-full text-sm" data-testid="txn-table">
            <thead>
              <tr className="border-b border-slate-100 bg-slate-50/80 text-[11px] uppercase tracking-wide text-slate-500">
                <th className="w-10 p-3"></th>
                <th className="p-3 text-left font-medium">Description</th>
                <th className="p-3 text-left font-medium">Bank</th>
                <th className="p-3 text-right font-medium">Amount</th>
                <th className="p-3 text-center font-medium">Status</th>
                <th className="p-3 text-center font-medium">Docs</th>
              </tr>
            </thead>
            <tbody>
              {(() => {
                const groups = [];
                let cur = null;
                items.forEach((it) => {
                  if (!cur || cur.date !== it.date) { cur = { date: it.date, rows: [] }; groups.push(cur); }
                  cur.rows.push(it);
                });
                let zi = 0;
                return groups.map((g) => {
                  const untagged = g.rows.filter((r) => r.status !== 'tagged').length;
                  const collapsed = !!collapsedDates[g.date];
                  return (
                    <React.Fragment key={g.date}>
                      <tr className="cursor-pointer bg-slate-100/70 hover:bg-slate-200/60" onClick={() => toggleDate(g.date)} data-testid={`date-group-${g.date}`}>
                        <td colSpan={6} className="px-3 py-2">
                          <div className="flex items-center justify-between">
                            <span className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-slate-600">
                              <ChevronRight className={`h-3.5 w-3.5 transition-transform ${collapsed ? '' : 'rotate-90'}`} />
                              {dateHeading(g.date)}
                              <span className="ml-1 rounded-full bg-slate-200 px-1.5 text-[10px] font-medium text-slate-500">{g.rows.length}</span>
                            </span>
                            {untagged > 0 ? (
                              <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[11px] font-medium text-amber-700" data-testid={`date-untagged-${g.date}`}>
                                {untagged} to tag
                              </span>
                            ) : (
                              <span className="flex items-center gap-1 text-[11px] font-medium text-emerald-600" data-testid={`date-untagged-${g.date}`}>
                                <CheckCircle2 className="h-3.5 w-3.5" /> All tagged
                              </span>
                            )}
                          </div>
                        </td>
                      </tr>
                      {!collapsed && g.rows.map((it) => {
                        const z = zi++ % 2 === 1;
                        return (
                          <Row key={it.id} it={it} masters={masters} vendors={vendors} zebra={z}
                            expanded={expandedId === it.id}
                            onToggle={() => setExpandedId(expandedId === it.id ? null : it.id)}
                            onChange={patchRow} />
                        );
                      })}
                    </React.Fragment>
                  );
                });
              })()}
            </tbody>
          </table>
        )}
      </div>

      {!loading && total > 0 && (
        <div className="mt-3 flex items-center justify-between text-sm text-slate-500" data-testid="txn-pagination">
          <span>
            Showing {(page - 1) * PER_PAGE + 1}–{Math.min(page * PER_PAGE, total)} of {total}
          </span>
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => { setPage((p) => p - 1); setExpandedId(null); }} data-testid="page-prev">
              <ChevronLeft className="h-4 w-4" /> Prev
            </Button>
            <span className="px-1">Page {page} / {Math.max(1, Math.ceil(total / PER_PAGE))}</span>
            <Button variant="outline" size="sm" disabled={page >= Math.ceil(total / PER_PAGE)} onClick={() => { setPage((p) => p + 1); setExpandedId(null); }} data-testid="page-next">
              Next <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}

function masterLabel(item) {
  const indent = '— '.repeat(item.level || 0);
  return `${indent}${item.name}`;
}

function Row({ it, masters, vendors, expanded, onToggle, onChange, zebra }) {
  const credit = it.direction === 'credit';
  const proofs = (it.proofs || []).filter((p) => !p.is_deleted);
  const copyZoho = (e) => {
    e.stopPropagation();
    navigator.clipboard?.writeText(it.zoho_transaction_id || '');
    toast.success('Zoho transaction ID copied');
  };
  const baseBg = expanded ? 'bg-indigo-50/60' : (zebra ? 'bg-slate-50/40 hover:bg-slate-100/70' : 'bg-white hover:bg-slate-50');
  return (
    <>
      <tr className={`cursor-pointer border-b border-slate-100 transition-colors ${baseBg}`}
        onClick={onToggle} data-testid={`txn-row-${it.id}`}>
        <td className="p-3 text-slate-400">
          <ChevronRight className={`h-4 w-4 transition-transform ${expanded ? 'rotate-90 text-indigo-600' : ''}`} />
        </td>
        <td className="p-3">
          <div className="flex items-center gap-2">
            {it.txn_code && (
              <span className="inline-flex items-center gap-0.5 rounded bg-indigo-50 px-1.5 py-0.5 font-mono text-[10px] font-semibold text-indigo-600" data-testid={`txn-code-${it.id}`}>
                <Hash className="h-2.5 w-2.5" />{it.txn_code.replace('TXN-', '')}
              </span>
            )}
            <span className="font-medium text-slate-800">{it.payee || it.description || '—'}</span>
          </div>
          <div className="mt-0.5 flex items-center gap-2 text-xs text-slate-400">
            {it.description && it.description !== it.payee && <span className="truncate max-w-[280px]">{it.description}</span>}
            {it.reference_number && <span>· {it.reference_number}</span>}
            {it.zoho_transaction_id && (
              <button onClick={copyZoho} title="Click to copy Zoho transaction ID"
                className="inline-flex items-center gap-0.5 rounded bg-slate-100 px-1.5 py-0.5 font-mono text-[10px] text-slate-500 hover:bg-slate-200 hover:text-slate-700"
                data-testid={`zoho-ref-${it.id}`}>
                <Copy className="h-2.5 w-2.5" />{String(it.zoho_transaction_id).slice(-10)}
              </button>
            )}
          </div>
        </td>
        <td className="p-3 text-slate-500">{it.bank_account_name || '—'}</td>
        <td className={`p-3 text-right font-semibold ${credit ? 'text-emerald-600' : 'text-rose-600'}`}>
          <span className="inline-flex items-center justify-end gap-1">
            {credit ? <ArrowDownLeft className="h-3.5 w-3.5" /> : <ArrowUpRight className="h-3.5 w-3.5" />}{fmt(it.amount)}
          </span>
        </td>
        <td className="p-3 text-center">
          <Badge variant="outline" className={it.status === 'tagged' ? 'border-emerald-200 bg-emerald-50 text-emerald-700' : 'border-amber-200 bg-amber-50 text-amber-600'}>{it.status}</Badge>
        </td>
        <td className="p-3 text-center text-slate-500">{proofs.length ? <span className="inline-flex items-center gap-1"><Paperclip className="h-3.5 w-3.5" />{proofs.length}</span> : '—'}</td>
      </tr>
      {expanded && (
        <tr className="border-b-2 border-indigo-100 bg-gradient-to-b from-indigo-50/40 to-white" data-testid={`txn-expanded-${it.id}`}>
          <td colSpan={6} className="p-0">
            <ExpandedEditor it={it} credit={credit} masters={masters} vendors={vendors} onChange={onChange} />
          </td>
        </tr>
      )}
    </>
  );
}

function SectionCard({ icon: Icon, title, accent = 'indigo', children }) {
  const accentClass = accent === 'emerald' ? 'text-emerald-600' : 'text-indigo-600';
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
      <h3 className={`mb-3 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide ${accentClass}`}>
        <Icon className="h-3.5 w-3.5" /> {title}
      </h3>
      {children}
    </div>
  );
}

function ExpandedEditor({ it, credit, masters, vendors, onChange }) {
  const [tags, setTags] = useState(it.tags || {});
  const [vendorId, setVendorId] = useState(it.vendor_id || '');
  const [notes, setNotes] = useState(it.notes || '');
  const [proofs, setProofs] = useState((it.proofs || []).filter((p) => !p.is_deleted));
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [adjustment, setAdjustment] = useState(it.account_adjustment || null);
  const [accountName, setAccountName] = useState(it.account_name || '');
  const [acctQuery, setAcctQuery] = useState('');
  const [acctResults, setAcctResults] = useState([]);
  const fileRef = useRef(null);
  const [preview, setPreview] = useState(null); // { proof, url }

  const masterGroups = credit ? INCOME_MASTERS : EXPENSE_MASTERS;
  const setTag = (k, v) => setTags((p) => ({ ...p, [k]: v === '__none__' ? undefined : v }));
  const setExpenseCategoryId = (id) => setTags((p) => ({ ...p, expense_category: id || undefined }));

  const saveTags = async () => {
    setSaving(true);
    try {
      const vendor = vendors.find((v) => v.id === vendorId);
      const { data } = await axios.patch(`${API}/api/accounting/transactions/${it.id}/tags`, {
        tags: Object.fromEntries(Object.entries(tags).filter(([, v]) => v)),
        vendor_id: vendorId || null, vendor_name: vendor ? vendor.name : null, notes,
      }, auth());
      toast.success('Saved'); onChange(data);
    } catch (e) { toast.error(e.response?.data?.detail || 'Save failed'); } finally { setSaving(false); }
  };

  const onUpload = async (e) => {
    const files = Array.from(e.target.files || []);
    if (!files.length) return;
    setUploading(true);
    const added = [];
    for (const file of files) {
      try {
        const fd = new FormData();
        fd.append('file', file);
        fd.append('proof_type', 'document');
        const { data } = await axios.post(`${API}/api/accounting/transactions/${it.id}/proofs`, fd, {
          headers: { Authorization: `Bearer ${localStorage.getItem('token')}`, 'Content-Type': 'multipart/form-data' }, withCredentials: true,
        });
        added.push(data);
      } catch (err) { toast.error(`${file.name}: ${err.response?.data?.detail || 'upload failed'}`); }
    }
    if (added.length) {
      const next = [...proofs, ...added];
      setProofs(next); onChange({ ...it, proofs: next });
      toast.success(`${added.length} document${added.length > 1 ? 's' : ''} uploaded`);
    }
    setUploading(false);
    if (fileRef.current) fileRef.current.value = '';
  };

  const openPreview = async (p) => {
    try {
      const res = await axios.get(`${API}/api/accounting/transactions/${it.id}/proofs/${p.id}/download`, { ...auth(), responseType: 'blob' });
      setPreview({ proof: p, url: URL.createObjectURL(res.data) });
    } catch { toast.error('Could not open document'); }
  };

  const deleteProof = async (p) => {
    try {
      await axios.delete(`${API}/api/accounting/transactions/${it.id}/proofs/${p.id}`, auth());
      const next = proofs.filter((q) => q.id !== p.id);
      setProofs(next); onChange({ ...it, proofs: next });
    } catch { toast.error('Delete failed'); }
  };

  const searchAccounts = async (q) => {
    setAcctQuery(q);
    if (!q || q.trim().length < 1) { setAcctResults([]); return; }
    try {
      const { data } = await axios.get(`${API}/api/accounts?page=1&page_size=8&search=${encodeURIComponent(q)}`, auth());
      setAcctResults(data.data || data.accounts || []);
    } catch { setAcctResults([]); }
  };

  const applyAccount = async (acct) => {
    try {
      const aid = acct.id || acct.account_id;
      const { data } = await axios.post(`${API}/api/accounting/transactions/${it.id}/apply-account`, { account_id: aid, account_name: acct.account_name }, auth());
      setAdjustment(data.adjustment); setAccountName(acct.account_name); setAcctResults([]); setAcctQuery('');
      onChange({ ...it, account_adjustment: data.adjustment, account_name: acct.account_name });
      toast.success(data.message);
    } catch (e) { toast.error(e.response?.data?.detail || 'Apply failed'); }
  };

  const unapplyAccount = async () => {
    try {
      const { data } = await axios.post(`${API}/api/accounting/transactions/${it.id}/unapply-account`, {}, auth());
      setAdjustment(null); setAccountName('');
      onChange({ ...it, account_adjustment: null, account_name: null });
      toast.success(data.message);
    } catch (e) { toast.error(e.response?.data?.detail || 'Failed'); }
  };

  return (
    <div className="grid grid-cols-1 gap-4 p-5 lg:grid-cols-2">
      {/* Categorisation */}
      <SectionCard icon={Tag} title={credit ? 'Income Categorisation' : 'Expense Categorisation'}>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          {masterGroups.map((m) => (
            m.key === 'expense_category' ? (
              <div key={m.key} className="sm:col-span-2">
                <Label className="text-xs text-slate-600">{m.label}</Label>
                <CategoryCascader
                  items={masters.expense_category || []}
                  value={tags.expense_category || ''}
                  onChange={setExpenseCategoryId}
                />
              </div>
            ) : (
              <div key={m.key}>
                <Label className="text-xs text-slate-600">{m.label}</Label>
                <Select value={tags[m.key] || undefined} onValueChange={(v) => setTag(m.key, v)}>
                  <SelectTrigger className="mt-1" data-testid={`tag-${m.key}`}><SelectValue placeholder="Select" /></SelectTrigger>
                  <SelectContent className="max-h-72">
                    <SelectItem value="__none__">— None —</SelectItem>
                    {(masters[m.key] || []).map((x) => <SelectItem key={x.id} value={x.id}>{masterLabel(x)}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            )
          ))}
          {!credit && (
            <div className="sm:col-span-2">
              <Label className="text-xs text-slate-600">Vendor</Label>
              <Select value={vendorId || undefined} onValueChange={(v) => setVendorId(v === '__none__' ? '' : v)}>
                <SelectTrigger className="mt-1" data-testid="tag-vendor"><SelectValue placeholder="Select vendor" /></SelectTrigger>
                <SelectContent className="max-h-72">
                  <SelectItem value="__none__">— None —</SelectItem>
                  {vendors.map((v) => <SelectItem key={v.id} value={v.id}>{v.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          )}
          <div className="sm:col-span-2">
            <Label className="text-xs text-slate-600">Notes</Label>
            <Textarea rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} className="mt-1" data-testid="tag-notes" />
          </div>
        </div>
        <Button onClick={saveTags} disabled={saving} className="mt-3 w-full bg-indigo-600 hover:bg-indigo-700" data-testid="save-tags-btn">
          {saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <CheckCircle2 className="mr-2 h-4 w-4" />} Save
        </Button>
      </SectionCard>

      {/* Right column */}
      <div className="space-y-4">
        {credit && (
          <SectionCard icon={Link2} title="Payment Received — Link Account" accent="emerald">
            {adjustment?.applied ? (
              <div className="flex items-center justify-between gap-2 rounded-lg bg-emerald-50 px-3 py-2.5 text-sm text-emerald-800" data-testid="account-applied">
                <span><CheckCircle2 className="mr-1.5 inline h-4 w-4" />Applied <b>{fmt(adjustment.amount)}</b> to <b>{accountName}</b></span>
                <Button variant="ghost" size="sm" className="h-7 text-rose-600" onClick={unapplyAccount} data-testid="unapply-account-btn">Remove</Button>
              </div>
            ) : (
              <div className="relative">
                <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-slate-400" />
                <Input className="pl-8" placeholder="Search account…" value={acctQuery} onChange={(e) => searchAccounts(e.target.value)} data-testid="account-search" />
                {acctResults.length > 0 && (
                  <div className="absolute z-20 mt-1 w-full overflow-hidden rounded-lg border border-slate-200 bg-white shadow-lg">
                    {acctResults.map((a) => (
                      <button key={a.id || a.account_id} onClick={() => applyAccount(a)}
                        className="flex w-full items-center justify-between px-3 py-2 text-left text-sm hover:bg-emerald-50" data-testid={`account-opt-${a.id || a.account_id}`}>
                        <span className="flex items-center gap-1.5"><Building2 className="h-3.5 w-3.5 text-slate-400" />{a.account_name}</span>
                        <span className="text-xs text-slate-400">Outstanding {fmt(a.outstanding_balance)}</span>
                      </button>
                    ))}
                  </div>
                )}
                <p className="mt-1.5 text-xs text-slate-400">Linking reduces the account's outstanding balance by <b>{fmt(it.amount)}</b>.</p>
              </div>
            )}
          </SectionCard>
        )}

        {/* Documents — thumbnails, generic multi-upload (images/PDF only) */}
        <SectionCard icon={Paperclip} title="Documents">
          {proofs.length === 0 && <p className="text-xs text-slate-400">No documents attached yet.</p>}
          {proofs.length > 0 && (
            <div className="grid grid-cols-3 gap-2 sm:grid-cols-4">
              {proofs.map((p) => (
                <ProofThumb key={p.id} proof={p} txnId={it.id} onPreview={() => openPreview(p)} />
              ))}
            </div>
          )}
          <label className="mt-3 flex cursor-pointer flex-col items-center justify-center gap-1 rounded-lg border-2 border-dashed border-slate-300 px-3 py-4 text-center text-sm text-slate-500 transition-colors hover:border-indigo-400 hover:bg-indigo-50/40 hover:text-indigo-600" data-testid="upload-document">
            {uploading ? <Loader2 className="h-5 w-5 animate-spin" /> : <Upload className="h-5 w-5" />}
            <span className="font-medium">{uploading ? 'Uploading…' : 'Upload documents'}</span>
            <span className="text-xs text-slate-400">Images or PDF only. Select multiple. Auto-named {it.txn_code ? `${it.txn_code}-1, -2…` : 'by transaction id'}.</span>
            <input ref={fileRef} type="file" multiple className="hidden" disabled={uploading} onChange={onUpload}
              accept="image/png,image/jpeg,image/webp,image/gif,application/pdf" />
          </label>
        </SectionCard>
      </div>

      {preview && (
        <Dialog open onOpenChange={(o) => { if (!o) { URL.revokeObjectURL(preview.url); setPreview(null); } }}>
          <DialogContent className="max-w-3xl" data-testid="proof-preview">
            <DialogHeader>
              <DialogTitle className="flex items-center justify-between gap-3 pr-6">
                <span className="truncate text-sm">{preview.proof.display_name || preview.proof.original_filename}</span>
                <div className="flex items-center gap-2">
                  <a href={preview.url} download={preview.proof.display_name || preview.proof.original_filename}>
                    <Button size="sm" variant="outline" data-testid="proof-download-btn"><Download className="mr-1.5 h-4 w-4" /> Download</Button>
                  </a>
                  <Button size="sm" variant="outline" data-testid="proof-delete-btn"
                    className="border-rose-200 text-rose-600 hover:bg-rose-50 hover:text-rose-700"
                    onClick={async () => {
                      if (!window.confirm('Delete this document?')) return;
                      await deleteProof(preview.proof);
                      URL.revokeObjectURL(preview.url);
                      setPreview(null);
                    }}>
                    <Trash2 className="mr-1.5 h-4 w-4" /> Delete
                  </Button>
                </div>
              </DialogTitle>
            </DialogHeader>
            <div className="max-h-[70vh] overflow-auto rounded-lg bg-slate-50 p-2">
              {preview.proof.is_image
                ? <img src={preview.url} alt={preview.proof.display_name} className="mx-auto max-h-[65vh] rounded" />
                : <iframe title="proof" src={preview.url} className="h-[65vh] w-full rounded" />}
            </div>
          </DialogContent>
        </Dialog>
      )}
    </div>
  );
}

function ProofThumb({ proof, txnId, onPreview }) {
  const [thumb, setThumb] = useState(null);
  useEffect(() => {
    let url;
    if (proof.is_image) {
      axios.get(`${API}/api/accounting/transactions/${txnId}/proofs/${proof.id}/download`, { ...auth(), responseType: 'blob' })
        .then((res) => { url = URL.createObjectURL(res.data); setThumb(url); }).catch(() => {});
    }
    return () => { if (url) URL.revokeObjectURL(url); };
  }, [proof.id, proof.is_image, txnId]);

  return (
    <button type="button" onClick={onPreview} title="Preview"
      className="group relative aspect-square w-full overflow-hidden rounded-lg border border-slate-200 bg-slate-50 transition-shadow hover:shadow-md focus:outline-none focus:ring-2 focus:ring-indigo-400"
      data-testid={`proof-${proof.id}`}>
      <div className="flex h-full w-full items-center justify-center">
        {proof.is_image
          ? (thumb ? <img src={thumb} alt={proof.display_name} className="h-full w-full object-cover" /> : <Loader2 className="h-4 w-4 animate-spin text-slate-300" />)
          : <div className="flex flex-col items-center gap-1 text-rose-500"><FileText className="h-7 w-7" /><span className="text-[9px] font-medium">PDF</span></div>}
      </div>
      <div className="pointer-events-none absolute inset-x-0 bottom-0 truncate bg-black/55 px-1.5 py-0.5 text-left text-[9px] font-medium text-white">
        {proof.display_name || proof.original_filename}
      </div>
    </button>
  );
}


function CategoryCascader({ items, value, onChange }) {
  // Build lookup maps once per `items` change.
  const byId = React.useMemo(() => {
    const m = {}; (items || []).forEach((x) => { m[x.id] = x; }); return m;
  }, [items]);
  const childrenOf = React.useMemo(() => {
    const m = {}; (items || []).forEach((x) => {
      const p = x.parent_id || '__root__';
      (m[p] = m[p] || []).push(x);
    });
    Object.values(m).forEach((arr) => arr.sort((a, b) => a.name.localeCompare(b.name)));
    return m;
  }, [items]);

  // Compute ancestor chain from current selected leaf (deepest first → reverse).
  const chain = React.useMemo(() => {
    const out = [];
    let cur = value && byId[value];
    while (cur) { out.unshift(cur); cur = cur.parent_id ? byId[cur.parent_id] : null; }
    return out;
  }, [value, byId]);

  // Levels to render: roots, then a level for each selected node's children if any.
  const levels = [];
  levels.push({ depth: 0, parentId: '__root__', selectedId: chain[0]?.id || '' });
  for (let i = 0; i < chain.length; i++) {
    const node = chain[i];
    if ((childrenOf[node.id] || []).length > 0) {
      levels.push({ depth: i + 1, parentId: node.id, selectedId: chain[i + 1]?.id || '' });
    }
  }

  const pickAtLevel = (depth, parentId, newId) => {
    if (!newId || newId === '__none__') {
      // Clear from this level down. Use the parent of this level (depth-1's selection) as new value.
      const parentNode = depth === 0 ? null : chain[depth - 1];
      onChange(parentNode ? parentNode.id : '');
    } else {
      onChange(newId);
    }
  };

  const labelFor = (depth) => depth === 0 ? 'Category' : (depth === 1 ? 'Sub-category' : `Level ${depth + 1}`);
  const path = chain.map((c) => c.name).join(' / ');

  return (
    <div className="mt-1 space-y-2" data-testid="tag-expense_category">
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
        {levels.map((lvl, idx) => {
          const opts = childrenOf[lvl.parentId] || [];
          if (opts.length === 0) return null;
          return (
            <div key={`${lvl.parentId}-${idx}`}>
              <span className="text-[10px] font-medium uppercase tracking-wide text-slate-400">{labelFor(lvl.depth)}</span>
              <Select value={lvl.selectedId || undefined} onValueChange={(v) => pickAtLevel(lvl.depth, lvl.parentId, v)}>
                <SelectTrigger className="mt-0.5 h-9" data-testid={`expense-cat-level-${lvl.depth}`}>
                  <SelectValue placeholder={lvl.depth === 0 ? 'Select category' : 'Select…'} />
                </SelectTrigger>
                <SelectContent className="max-h-72">
                  {lvl.depth > 0 && <SelectItem value="__none__">— None —</SelectItem>}
                  {opts.map((o) => <SelectItem key={o.id} value={o.id}>{o.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          );
        })}
      </div>
      {path && (
        <p className="truncate text-xs text-slate-500" data-testid="expense-cat-path">
          <span className="font-medium text-slate-400">Selected:</span> {path}
        </p>
      )}
    </div>
  );
}
