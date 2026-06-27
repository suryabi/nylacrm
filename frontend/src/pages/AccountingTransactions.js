import React, { useState, useEffect, useCallback } from 'react';
import axios from 'axios';
import { toast } from 'sonner';
import {
  RefreshCw, Search, Loader2, ArrowDownLeft, ArrowUpRight, Paperclip, Upload,
  Trash2, FileText, Link2, X, Banknote, CheckCircle2,
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
  Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription,
} from '../components/ui/sheet';

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
  const [selected, setSelected] = useState(null);

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

  const tabs = [
    { key: 'untagged', label: 'Untagged', count: summary.untagged },
    { key: 'tagged', label: 'Tagged', count: summary.tagged },
    { key: 'all', label: 'All', count: summary.all },
  ];

  return (
    <div className="mx-auto max-w-7xl p-6" data-testid="transactions-page">
      <div className="mb-5 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-bold text-slate-900">
            <Banknote className="h-6 w-6 text-indigo-600" /> Transactions
          </h1>
          <p className="mt-0.5 text-sm text-slate-500">Bank transactions pulled from Zoho. Tag expense/income masters, link accounts &amp; attach proofs.</p>
        </div>
        <Button onClick={sync} disabled={syncing} className="bg-indigo-600 hover:bg-indigo-700" data-testid="sync-zoho-btn">
          {syncing ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <RefreshCw className="mr-2 h-4 w-4" />} Sync from Zoho
        </Button>
      </div>

      <div className="mb-4 flex flex-wrap items-center gap-2">
        <div className="flex rounded-lg border border-slate-200 bg-white p-1">
          {tabs.map((t) => (
            <button key={t.key} onClick={() => setTab(t.key)}
              className={`rounded-md px-3 py-1.5 text-sm transition-colors ${tab === t.key ? 'bg-indigo-600 text-white' : 'text-slate-600 hover:bg-slate-50'}`}
              data-testid={`tab-${t.key}`}>
              {t.label} <span className="ml-1 opacity-70">{t.count}</span>
            </button>
          ))}
        </div>
        <Select value={direction} onValueChange={setDirection}>
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

      <div className="rounded-xl border border-slate-200 bg-white">
        {loading ? (
          <div className="flex justify-center py-16 text-slate-400"><Loader2 className="h-6 w-6 animate-spin" /></div>
        ) : items.length === 0 ? (
          <div className="py-16 text-center text-sm text-slate-400" data-testid="txn-empty">
            No transactions. Click “Sync from Zoho” to pull bank transactions.
          </div>
        ) : (
          <table className="w-full text-sm" data-testid="txn-table">
            <thead>
              <tr className="border-b border-slate-100 bg-slate-50 text-[11px] uppercase tracking-wide text-slate-500">
                <th className="p-3 text-left font-medium">Date</th>
                <th className="p-3 text-left font-medium">Description</th>
                <th className="p-3 text-left font-medium">Bank</th>
                <th className="p-3 text-right font-medium">Amount</th>
                <th className="p-3 text-center font-medium">Status</th>
                <th className="p-3 text-center font-medium">Proofs</th>
              </tr>
            </thead>
            <tbody>
              {items.map((it) => {
                const credit = it.direction === 'credit';
                const proofs = (it.proofs || []).filter((p) => !p.is_deleted);
                return (
                  <tr key={it.id} className="cursor-pointer border-b border-slate-100 hover:bg-slate-50" onClick={() => setSelected(it)} data-testid={`txn-row-${it.id}`}>
                    <td className="p-3 text-slate-500">{it.date}</td>
                    <td className="p-3">
                      <div className="font-medium text-slate-800">{it.payee || it.description || '—'}</div>
                      <div className="text-xs text-slate-400">{it.reference_number || it.zoho_transaction_type || ''}</div>
                    </td>
                    <td className="p-3 text-slate-500">{it.bank_account_name || '—'}</td>
                    <td className={`p-3 text-right font-semibold ${credit ? 'text-emerald-600' : 'text-rose-600'}`}>
                      <span className="inline-flex items-center gap-1 justify-end">
                        {credit ? <ArrowDownLeft className="h-3.5 w-3.5" /> : <ArrowUpRight className="h-3.5 w-3.5" />}{fmt(it.amount)}
                      </span>
                    </td>
                    <td className="p-3 text-center">
                      <Badge variant="outline" className={it.status === 'tagged' ? 'border-emerald-200 text-emerald-700' : 'text-amber-600 border-amber-200'}>{it.status}</Badge>
                    </td>
                    <td className="p-3 text-center text-slate-500">{proofs.length ? <span className="inline-flex items-center gap-1"><Paperclip className="h-3.5 w-3.5" />{proofs.length}</span> : '—'}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>

      {selected && (
        <TxnDetail txn={selected} masters={masters} vendors={vendors}
          onClose={() => setSelected(null)} onSaved={() => { setSelected(null); load(); }} />
      )}
    </div>
  );
}

function masterLabel(item) {
  const indent = '— '.repeat(item.level || 0);
  return `${indent}${item.name}`;
}

function TxnDetail({ txn, masters, vendors, onClose, onSaved }) {
  const credit = txn.direction === 'credit';
  const [tags, setTags] = useState(txn.tags || {});
  const [vendorId, setVendorId] = useState(txn.vendor_id || '');
  const [notes, setNotes] = useState(txn.notes || '');
  const [proofs, setProofs] = useState((txn.proofs || []).filter((p) => !p.is_deleted));
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [adjustment, setAdjustment] = useState(txn.account_adjustment || null);
  const [accountName, setAccountName] = useState(txn.account_name || '');
  // account search
  const [acctQuery, setAcctQuery] = useState('');
  const [acctResults, setAcctResults] = useState([]);

  const masterGroups = credit ? INCOME_MASTERS : EXPENSE_MASTERS;
  const setTag = (k, v) => setTags((p) => ({ ...p, [k]: v === '__none__' ? undefined : v }));

  const saveTags = async () => {
    setSaving(true);
    try {
      const vendor = vendors.find((v) => v.id === vendorId);
      await axios.patch(`${API}/api/accounting/transactions/${txn.id}/tags`, {
        tags: Object.fromEntries(Object.entries(tags).filter(([, v]) => v)),
        vendor_id: vendorId || null, vendor_name: vendor ? vendor.name : null, notes,
      }, auth());
      toast.success('Tags saved'); onSaved();
    } catch (e) { toast.error(e.response?.data?.detail || 'Save failed'); } finally { setSaving(false); }
  };

  const onUpload = async (e, proofType) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    try {
      const fd = new FormData();
      fd.append('file', file);
      fd.append('proof_type', proofType);
      const { data } = await axios.post(`${API}/api/accounting/transactions/${txn.id}/proofs`, fd, {
        headers: { Authorization: `Bearer ${localStorage.getItem('token')}`, 'Content-Type': 'multipart/form-data' }, withCredentials: true,
      });
      setProofs((p) => [...p, data]); toast.success('Proof uploaded');
    } catch (err) { toast.error(err.response?.data?.detail || 'Upload failed'); } finally { setUploading(false); e.target.value = ''; }
  };

  const viewProof = async (p) => {
    try {
      const res = await axios.get(`${API}/api/accounting/transactions/${txn.id}/proofs/${p.id}/download`, { ...auth(), responseType: 'blob' });
      window.open(URL.createObjectURL(res.data), '_blank');
    } catch { toast.error('Could not open proof'); }
  };

  const deleteProof = async (p) => {
    try { await axios.delete(`${API}/api/accounting/transactions/${txn.id}/proofs/${p.id}`, auth()); setProofs((x) => x.filter((q) => q.id !== p.id)); }
    catch { toast.error('Delete failed'); }
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
      const { data } = await axios.post(`${API}/api/accounting/transactions/${txn.id}/apply-account`, { account_id: aid, account_name: acct.account_name }, auth());
      setAdjustment(data.adjustment); setAccountName(acct.account_name); setAcctResults([]); setAcctQuery('');
      toast.success(data.message);
    } catch (e) { toast.error(e.response?.data?.detail || 'Apply failed'); }
  };

  const unapplyAccount = async () => {
    try {
      const { data } = await axios.post(`${API}/api/accounting/transactions/${txn.id}/unapply-account`, {}, auth());
      setAdjustment(null); setAccountName(''); toast.success(data.message);
    } catch (e) { toast.error(e.response?.data?.detail || 'Failed'); }
  };

  return (
    <Sheet open onOpenChange={(o) => !o && onClose()}>
      <SheetContent className="w-full overflow-y-auto sm:max-w-lg" data-testid="txn-detail">
        <SheetHeader>
          <SheetTitle className="flex items-center gap-2">
            {credit ? <ArrowDownLeft className="h-5 w-5 text-emerald-600" /> : <ArrowUpRight className="h-5 w-5 text-rose-600" />}
            {credit ? 'Money In' : 'Money Out'} · {fmt(txn.amount)}
          </SheetTitle>
          <SheetDescription>
            {txn.date} · {txn.payee || txn.description || '—'} · {txn.bank_account_name || ''}
          </SheetDescription>
        </SheetHeader>

        <div className="mt-5 space-y-5">
          {/* Master tags */}
          <div className="space-y-3">
            <h3 className="text-xs font-semibold uppercase tracking-wide text-slate-500">{credit ? 'Income Tags' : 'Expense Tags'}</h3>
            {masterGroups.map((m) => (
              <div key={m.key}>
                <Label className="text-xs text-slate-600">{m.label}</Label>
                <Select value={tags[m.key] || undefined} onValueChange={(v) => setTag(m.key, v)}>
                  <SelectTrigger data-testid={`tag-${m.key}`}><SelectValue placeholder="Select" /></SelectTrigger>
                  <SelectContent className="max-h-72">
                    <SelectItem value="__none__">— None —</SelectItem>
                    {(masters[m.key] || []).map((it) => <SelectItem key={it.id} value={it.id}>{masterLabel(it)}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            ))}
            {!credit && (
              <div>
                <Label className="text-xs text-slate-600">Vendor</Label>
                <Select value={vendorId || undefined} onValueChange={(v) => setVendorId(v === '__none__' ? '' : v)}>
                  <SelectTrigger data-testid="tag-vendor"><SelectValue placeholder="Select vendor" /></SelectTrigger>
                  <SelectContent className="max-h-72">
                    <SelectItem value="__none__">— None —</SelectItem>
                    {vendors.map((v) => <SelectItem key={v.id} value={v.id}>{v.name}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            )}
            <div>
              <Label className="text-xs text-slate-600">Notes</Label>
              <Textarea rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} data-testid="tag-notes" />
            </div>
            <Button onClick={saveTags} disabled={saving} className="w-full bg-indigo-600 hover:bg-indigo-700" data-testid="save-tags-btn">
              {saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null} Save Tags
            </Button>
          </div>

          {/* Account application (income only) */}
          {credit && (
            <div className="space-y-2 rounded-lg border border-slate-200 p-3">
              <h3 className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-slate-500"><Link2 className="h-3.5 w-3.5" /> Payment Received — Link Account</h3>
              {adjustment?.applied ? (
                <div className="flex items-center justify-between gap-2 rounded-md bg-emerald-50 px-3 py-2 text-sm text-emerald-800" data-testid="account-applied">
                  <span><CheckCircle2 className="mr-1 inline h-4 w-4" />Applied {fmt(adjustment.amount)} to <b>{accountName}</b></span>
                  <Button variant="ghost" size="sm" className="h-7 text-rose-600" onClick={unapplyAccount} data-testid="unapply-account-btn">Remove</Button>
                </div>
              ) : (
                <div className="relative">
                  <Input placeholder="Search account…" value={acctQuery} onChange={(e) => searchAccounts(e.target.value)} data-testid="account-search" />
                  {acctResults.length > 0 && (
                    <div className="absolute z-10 mt-1 w-full rounded-md border border-slate-200 bg-white shadow-lg">
                      {acctResults.map((a) => (
                        <button key={a.id || a.account_id} onClick={() => applyAccount(a)}
                          className="flex w-full items-center justify-between px-3 py-2 text-left text-sm hover:bg-slate-50" data-testid={`account-opt-${a.id || a.account_id}`}>
                          <span>{a.account_name}</span>
                          <span className="text-xs text-slate-400">Out: {fmt(a.outstanding_balance)}</span>
                        </button>
                      ))}
                    </div>
                  )}
                  <p className="mt-1 text-xs text-slate-400">Applying reduces the account's outstanding balance by {fmt(txn.amount)}.</p>
                </div>
              )}
            </div>
          )}

          {/* Proofs */}
          <div className="space-y-2 rounded-lg border border-slate-200 p-3">
            <h3 className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-slate-500"><Paperclip className="h-3.5 w-3.5" /> Proofs</h3>
            {proofs.length === 0 && <p className="text-xs text-slate-400">No proofs attached.</p>}
            {proofs.map((p) => (
              <div key={p.id} className="flex items-center justify-between gap-2 rounded-md bg-slate-50 px-2.5 py-1.5 text-sm" data-testid={`proof-${p.id}`}>
                <button className="flex items-center gap-2 truncate text-left text-slate-700 hover:text-indigo-600" onClick={() => viewProof(p)}>
                  <FileText className="h-4 w-4 shrink-0" /><span className="truncate">{p.original_filename}</span>
                  <Badge variant="outline" className="text-[10px]">{p.type}</Badge>
                </button>
                <Button variant="ghost" size="icon" className="h-6 w-6 text-rose-500" onClick={() => deleteProof(p)} data-testid={`delete-proof-${p.id}`}><Trash2 className="h-3.5 w-3.5" /></Button>
              </div>
            ))}
            <div className="flex gap-2 pt-1">
              <ProofUploadButton label="Payment Proof" type="payment_proof" onUpload={onUpload} uploading={uploading} />
              <ProofUploadButton label="Invoice Proof" type="invoice_proof" onUpload={onUpload} uploading={uploading} />
            </div>
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
}

function ProofUploadButton({ label, type, onUpload, uploading }) {
  return (
    <label className="flex flex-1 cursor-pointer items-center justify-center gap-1.5 rounded-md border border-dashed border-slate-300 px-2 py-2 text-xs text-slate-600 hover:border-indigo-400 hover:text-indigo-600" data-testid={`upload-${type}`}>
      {uploading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Upload className="h-3.5 w-3.5" />} {label}
      <input type="file" className="hidden" accept=".pdf,.png,.jpg,.jpeg,.webp" disabled={uploading} onChange={(e) => onUpload(e, type)} />
    </label>
  );
}
