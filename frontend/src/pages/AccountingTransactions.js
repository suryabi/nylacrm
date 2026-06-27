import React, { useState, useEffect, useCallback, useRef } from 'react';
import axios from 'axios';
import { toast } from 'sonner';
import {
  RefreshCw, Search, Loader2, ArrowDownLeft, ArrowUpRight, Paperclip, Upload,
  Trash2, FileText, Link2, Banknote, CheckCircle2, ChevronRight, Tag, Building2,
} from 'lucide-react';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Label } from '../components/ui/label';
import { Textarea } from '../components/ui/textarea';
import { Badge } from '../components/ui/badge';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '../components/ui/select';

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

export default function AccountingTransactions() {
  const [tab, setTab] = useState('untagged');
  const [items, setItems] = useState([]);
  const [summary, setSummary] = useState({ untagged: 0, tagged: 0, all: 0 });
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [search, setSearch] = useState('');
  const [direction, setDirection] = useState('all');
  const [masters, setMasters] = useState({});
  const [vendors, setVendors] = useState([]);
  const [expandedId, setExpandedId] = useState(null);

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
      const { data } = await axios.get(`${API}/api/accounting/transactions?${params}`, auth());
      setItems(data.items || []);
      setSummary(data.summary || { untagged: 0, tagged: 0, all: 0 });
    } catch (e) { toast.error('Failed to load transactions'); } finally { setLoading(false); }
  }, [tab, direction, search]);

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

  const tabs = [
    { key: 'untagged', label: 'Untagged', count: summary.untagged },
    { key: 'tagged', label: 'Tagged', count: summary.tagged },
    { key: 'all', label: 'All', count: summary.all },
  ];

  return (
    <div className="mx-auto max-w-6xl p-6" data-testid="transactions-page">
      <div className="mb-5 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-bold text-slate-900">
            <Banknote className="h-6 w-6 text-indigo-600" /> Transactions
          </h1>
          <p className="mt-0.5 text-sm text-slate-500">Bank transactions from Zoho. Click a row to categorise, link an account &amp; attach documents.</p>
        </div>
        <Button onClick={sync} disabled={syncing} className="bg-indigo-600 hover:bg-indigo-700" data-testid="sync-zoho-btn">
          {syncing ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <RefreshCw className="mr-2 h-4 w-4" />} Sync from Zoho
        </Button>
      </div>

      <div className="mb-4 flex flex-wrap items-center gap-2">
        <div className="flex rounded-lg border border-slate-200 bg-white p-1 shadow-sm">
          {tabs.map((t) => (
            <button key={t.key} onClick={() => { setTab(t.key); setExpandedId(null); }}
              className={`rounded-md px-3.5 py-1.5 text-sm font-medium transition-colors ${tab === t.key ? 'bg-indigo-600 text-white shadow-sm' : 'text-slate-600 hover:bg-slate-50'}`}
              data-testid={`tab-${t.key}`}>
              {t.label} <span className={`ml-1 rounded-full px-1.5 text-xs ${tab === t.key ? 'bg-white/20' : 'bg-slate-100'}`}>{t.count}</span>
            </button>
          ))}
        </div>
        <Select value={direction} onValueChange={(v) => { setDirection(v); setExpandedId(null); }}>
          <SelectTrigger className="h-9 w-40" data-testid="filter-direction"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All directions</SelectItem>
            <SelectItem value="credit">Money In (Income)</SelectItem>
            <SelectItem value="debit">Money Out (Expense)</SelectItem>
          </SelectContent>
        </Select>
        <div className="relative">
          <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-slate-400" />
          <Input placeholder="Search payee / ref…" value={search} onChange={(e) => setSearch(e.target.value)} className="h-9 w-56 pl-8" data-testid="txn-search" />
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
                <th className="p-3 text-left font-medium">Date</th>
                <th className="p-3 text-left font-medium">Description</th>
                <th className="p-3 text-left font-medium">Bank</th>
                <th className="p-3 text-right font-medium">Amount</th>
                <th className="p-3 text-center font-medium">Status</th>
                <th className="p-3 text-center font-medium">Docs</th>
              </tr>
            </thead>
            <tbody>
              {items.map((it) => (
                <Row key={it.id} it={it} masters={masters} vendors={vendors}
                  expanded={expandedId === it.id}
                  onToggle={() => setExpandedId(expandedId === it.id ? null : it.id)}
                  onChange={patchRow} />
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}

function masterLabel(item) {
  const indent = '— '.repeat(item.level || 0);
  return `${indent}${item.name}`;
}

function Row({ it, masters, vendors, expanded, onToggle, onChange }) {
  const credit = it.direction === 'credit';
  const proofs = (it.proofs || []).filter((p) => !p.is_deleted);
  return (
    <>
      <tr className={`cursor-pointer border-b border-slate-100 transition-colors ${expanded ? 'bg-indigo-50/60' : 'hover:bg-slate-50'}`}
        onClick={onToggle} data-testid={`txn-row-${it.id}`}>
        <td className="p-3 text-slate-400">
          <ChevronRight className={`h-4 w-4 transition-transform ${expanded ? 'rotate-90 text-indigo-600' : ''}`} />
        </td>
        <td className="p-3 text-slate-500">{it.date}</td>
        <td className="p-3">
          <div className="font-medium text-slate-800">{it.payee || it.description || '—'}</div>
          <div className="text-xs text-slate-400">{it.reference_number || it.zoho_transaction_type || ''}</div>
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
          <td colSpan={7} className="p-0">
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

  const masterGroups = credit ? INCOME_MASTERS : EXPENSE_MASTERS;
  const setTag = (k, v) => setTags((p) => ({ ...p, [k]: v === '__none__' ? undefined : v }));

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

  const viewProof = async (p) => {
    try {
      const res = await axios.get(`${API}/api/accounting/transactions/${it.id}/proofs/${p.id}/download`, { ...auth(), responseType: 'blob' });
      window.open(URL.createObjectURL(res.data), '_blank');
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
            <div key={m.key} className={m.key === 'expense_category' ? 'sm:col-span-2' : ''}>
              <Label className="text-xs text-slate-600">{m.label}</Label>
              <Select value={tags[m.key] || undefined} onValueChange={(v) => setTag(m.key, v)}>
                <SelectTrigger className="mt-1" data-testid={`tag-${m.key}`}><SelectValue placeholder="Select" /></SelectTrigger>
                <SelectContent className="max-h-72">
                  <SelectItem value="__none__">— None —</SelectItem>
                  {(masters[m.key] || []).map((x) => <SelectItem key={x.id} value={x.id}>{masterLabel(x)}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
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

        {/* Documents — generic multi-upload */}
        <SectionCard icon={Paperclip} title="Documents">
          <div className="space-y-1.5">
            {proofs.length === 0 && <p className="text-xs text-slate-400">No documents attached yet.</p>}
            {proofs.map((p) => (
              <div key={p.id} className="flex items-center justify-between gap-2 rounded-lg bg-slate-50 px-2.5 py-1.5 text-sm" data-testid={`proof-${p.id}`}>
                <button className="flex items-center gap-2 truncate text-left text-slate-700 hover:text-indigo-600" onClick={() => viewProof(p)}>
                  <FileText className="h-4 w-4 shrink-0 text-slate-400" /><span className="truncate">{p.original_filename}</span>
                </button>
                <Button variant="ghost" size="icon" className="h-6 w-6 shrink-0 text-rose-500" onClick={() => deleteProof(p)} data-testid={`delete-proof-${p.id}`}><Trash2 className="h-3.5 w-3.5" /></Button>
              </div>
            ))}
          </div>
          <label className="mt-3 flex cursor-pointer flex-col items-center justify-center gap-1 rounded-lg border-2 border-dashed border-slate-300 px-3 py-4 text-center text-sm text-slate-500 transition-colors hover:border-indigo-400 hover:bg-indigo-50/40 hover:text-indigo-600" data-testid="upload-document">
            {uploading ? <Loader2 className="h-5 w-5 animate-spin" /> : <Upload className="h-5 w-5" />}
            <span className="font-medium">{uploading ? 'Uploading…' : 'Upload documents'}</span>
            <span className="text-xs text-slate-400">Any file — invoices, receipts, payment proofs. Select multiple.</span>
            <input ref={fileRef} type="file" multiple className="hidden" disabled={uploading} onChange={onUpload}
              accept=".pdf,.png,.jpg,.jpeg,.webp,.doc,.docx,.xls,.xlsx,.csv,.txt" />
          </label>
        </SectionCard>
      </div>
    </div>
  );
}
