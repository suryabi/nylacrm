import React, { useEffect, useMemo, useState } from 'react';
import axios from 'axios';
import { toast } from 'sonner';
import { ArrowDown, ArrowUp, FileSpreadsheet, Loader2, Receipt, RefreshCw, Search, Store, Users, X } from 'lucide-react';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { SearchCombobox } from '../components/SearchCombobox';
import { MultiSearchCombobox } from '../components/MultiSearchCombobox';

const API_URL = process.env.REACT_APP_BACKEND_URL;
const HEAD = () => ({ Authorization: `Bearer ${localStorage.getItem('token')}` });
const inr = (v) => Number(v || 0).toLocaleString('en-IN', { maximumFractionDigits: 0 });

// Month cell: value + red ▼ / dark-green ▲ against the previous month (prev === null → no indicator).
const Amount = ({ v, prev = null, bold = false, testId }) => {
  const dir = prev === null || v === prev ? null : v > prev ? 'up' : 'down';
  return (
    <td className={`whitespace-nowrap px-2.5 py-1 text-right tabular-nums ${bold ? 'font-semibold text-slate-900' : v > 0 ? 'text-slate-800' : 'text-slate-300'}`} data-testid={testId} data-trend={dir || 'flat'}>
      <span className="inline-flex items-center justify-end gap-0.5">
        {dir === 'up' && <ArrowUp className="h-3 w-3 text-emerald-700" strokeWidth={2.5} aria-label="up vs previous month" />}
        {dir === 'down' && <ArrowDown className="h-3 w-3 text-red-600" strokeWidth={2.5} aria-label="down vs previous month" />}
        {v > 0 || bold ? inr(v) : '0'}
      </span>
    </td>
  );
};

// Δ current month − last month: green when positive, bold red when negative, muted 0 otherwise.
const Delta = ({ v, testId }) => (
  <td className={`whitespace-nowrap px-3 py-1 text-right tabular-nums ${v > 0 ? 'font-semibold text-emerald-700' : v < 0 ? 'font-bold text-red-600' : 'text-slate-300'}`} data-testid={testId} data-sign={v > 0 ? 'pos' : v < 0 ? 'neg' : 'zero'}>
    {v > 0 ? `+${inr(v)}` : v < 0 ? `−${inr(Math.abs(v))}` : '0'}
  </td>
);

export default function CustomerInvoiceOverview() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [exporting, setExporting] = useState(false);
  const [q, setQ] = useState('');
  const [hideZero, setHideZero] = useState(false);
  const [distributor, setDistributor] = useState('all');
  const [customers, setCustomers] = useState([]);
  const [defaulted, setDefaulted] = useState(false);

  const load = async () => {
    setLoading(true);
    try {
      const res = await axios.get(`${API_URL}/api/reports/customer-invoice-overview`, { headers: HEAD() });
      setData(res.data);
      if (!defaulted) {
        setDefaulted(true);
        if (res.data.default_distributor_id) setDistributor(res.data.default_distributor_id);
      }
    } catch (e) {
      toast.error(e?.response?.data?.detail || 'Could not load invoice overview');
    } finally {
      setLoading(false);
    }
  };
  useEffect(() => { load(); }, []);

  const rows = useMemo(() => {
    if (!data) return [];
    const s = q.trim().toLowerCase();
    return data.rows.filter((r) => (!hideZero || r.total > 0)
      && (distributor === 'all' || (distributor === 'unassigned' ? !r.distributor_id : r.distributor_id === distributor))
      && (!customers.length || customers.includes(r.account_id))
      && (!s || [r.account_name, r.account_code, r.city, r.distributor_name].some((x) => (x || '').toLowerCase().includes(s))));
  }, [data, q, hideZero, distributor, customers]);
  const customerOptions = useMemo(() => (data ? data.rows
    .filter((r) => distributor === 'all' || (distributor === 'unassigned' ? !r.distributor_id : r.distributor_id === distributor))
    .map((r) => ({ id: r.account_id, name: r.account_name, sub: [r.account_code, r.city].filter(Boolean).join(' · ') })) : []), [data, distributor]);
  const activeFilters = (distributor !== 'all') + (customers.length > 0) + (!!q.trim()) + hideZero;
  const filteredTotals = useMemo(() => (data ? data.months.map((_, i) => rows.reduce((a, r) => a + r.months[i], 0)) : []), [rows, data]);
  const filteredPrev = useMemo(() => rows.reduce((a, r) => a + r.prev_month, 0), [rows]);
  const filteredDelta = useMemo(() => rows.reduce((a, r) => a + r.mom_change, 0), [rows]);
  const defaultName = data?.filters?.distributors.find((d) => d.id === data.default_distributor_id)?.name;

  const exportExcel = async () => {
    setExporting(true);
    try {
      const res = await axios.get(`${API_URL}/api/reports/customer-invoice-overview/export`, { headers: HEAD(), responseType: 'blob' });
      const url = URL.createObjectURL(res.data);
      const a = document.createElement('a');
      a.href = url; a.download = `customer-invoice-overview.xlsx`; document.body.appendChild(a); a.click(); a.remove();
      URL.revokeObjectURL(url);
    } catch { toast.error('Export failed'); } finally { setExporting(false); }
  };

  return (
    <div className="space-y-5" data-testid="customer-invoice-overview-page" style={{ fontFamily: "'Helvetica Neue', Helvetica, Arial, sans-serif" }}>
      <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <div className="flex items-start gap-3">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[#002FA7] text-white"><Receipt className="h-5 w-5" /></div>
          <div>
            <h1 className="text-xl font-semibold tracking-tight text-slate-900 sm:text-2xl">Customer Invoice Overview</h1>
            <p className="text-xs text-slate-500 sm:text-sm" data-testid="cio-subtitle">
              Gross invoice value per customer, month-wise · {data ? `${data.months[0].label} – ${data.months[data.months.length - 1].label}` : 'last 6 months'}
              {defaultName && distributor === data?.default_distributor_id && <span className="ml-2 rounded bg-[#002FA7]/10 px-1.5 py-px text-[10px] font-medium text-[#002FA7]" data-testid="cio-default-badge">Defaulted to {defaultName} (your city)</span>}
            </p>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <div className="relative">
            <Search className="pointer-events-none absolute left-2.5 top-2.5 h-4 w-4 text-slate-400" />
            <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search customer, code, city" className="h-9 w-64 pl-8 pr-8" data-testid="cio-search" />
            {q && <button type="button" onClick={() => setQ('')} className="absolute right-2 top-2.5 text-slate-400 hover:text-slate-700" data-testid="cio-search-clear"><X className="h-4 w-4" /></button>}
          </div>
          <label className="flex items-center gap-2 text-xs text-slate-600">
            <input type="checkbox" checked={hideZero} onChange={(e) => setHideZero(e.target.checked)} className="h-3.5 w-3.5 accent-[#002FA7]" data-testid="cio-hide-zero" /> Hide customers with no invoices
          </label>
          <Button variant="outline" size="sm" onClick={load} disabled={loading} data-testid="cio-refresh"><RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} /></Button>
          <Button size="sm" onClick={exportExcel} disabled={exporting || !data} className="bg-[#002FA7] hover:bg-[#00268a]" data-testid="cio-export-btn">
            {exporting ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> : <FileSpreadsheet className="mr-1.5 h-4 w-4" />} Excel
          </Button>
        </div>
      </div>

      {data && (
        <div className="flex flex-wrap gap-x-6 gap-y-1 text-xs text-slate-500" data-testid="cio-summary">
          <span><b className="text-slate-800">{data.summary.customers}</b> customers</span>
          <span><b className="text-slate-800">{data.summary.invoiced_customers}</b> invoiced in period</span>
          <span><b className="text-slate-800">{data.summary.invoices}</b> invoices</span>
          <span>Total <b className="text-slate-800">₹{inr(data.grand_total)}</b></span>
          <span className="inline-flex items-center gap-1 text-slate-400"><ArrowUp className="h-3 w-3 text-emerald-700" strokeWidth={2.5} /> up / <ArrowDown className="h-3 w-3 text-red-600" strokeWidth={2.5} /> down vs previous month</span>
        </div>
      )}

      <div className="flex flex-col gap-2 rounded-2xl border border-slate-200/90 bg-white p-3 shadow-sm sm:flex-row sm:items-center" data-testid="cio-filters">
        <div className="sm:w-64">
          <SearchCombobox options={data?.filters?.distributors || []} value={distributor} onChange={(v) => { setDistributor(v); setCustomers([]); }}
            placeholder="All distributors" allLabel="All distributors" icon={Store} testId="cio-distributor" />
        </div>
        <div className="sm:w-96">
          <MultiSearchCombobox options={customerOptions} values={customers} onChange={setCustomers} placeholder="All customers" icon={Users} testId="cio-customers" />
        </div>
        {activeFilters > 0 && (
          <button type="button" onClick={() => { setDistributor('all'); setCustomers([]); setQ(''); setHideZero(false); }}
            className="text-xs font-medium text-slate-500 underline decoration-dotted underline-offset-2 hover:text-slate-800" data-testid="cio-clear-filters">Clear filters</button>
        )}
        <span className="ml-auto text-xs text-slate-400" data-testid="cio-row-count">{rows.length} of {data?.rows.length || 0} customers</span>
      </div>

      <div className="overflow-x-auto rounded-2xl border border-slate-200/90 bg-white shadow-sm">
        {loading && !data ? (
          <div className="flex items-center justify-center py-16 text-slate-400"><Loader2 className="h-5 w-5 animate-spin" /></div>
        ) : (
          <table className="w-full min-w-[880px] text-sm" data-testid="cio-table">
            <thead className="sticky top-0 z-10 bg-white">
              <tr className="border-b border-slate-200">
                <th className="sticky left-0 z-20 w-[240px] min-w-[240px] max-w-[240px] bg-white px-3 py-2.5 text-left text-[11px] font-semibold uppercase tracking-wider text-slate-400">Customer</th>
                {data?.months.map((m) => (
                  <th key={m.key} className={`whitespace-nowrap px-2.5 py-2.5 text-right text-[11px] font-semibold uppercase tracking-wider ${m.current ? 'text-[#002FA7]' : 'text-slate-400'}`} data-testid={`cio-month-${m.key}`}>
                    {m.label}{m.current && <span className="ml-1 rounded bg-[#002FA7]/10 px-1 py-px text-[9px] normal-case tracking-normal">current</span>}
                  </th>
                ))}
                <th className="whitespace-nowrap px-3 py-2.5 text-right text-[11px] font-semibold uppercase tracking-wider text-slate-500" data-testid="cio-delta-head">Δ vs last month</th>
                <th className="w-full" />
              </tr>
            </thead>
            <tbody>
              {rows.map((r, idx) => {
                const band = idx % 2 === 1 ? 'bg-slate-50/80' : 'bg-white';
                return (
                  <tr key={r.account_id} className={`border-t border-slate-100 ${band} hover:bg-[#002FA7]/[0.04]`} data-testid={`cio-row-${r.account_id}`} data-band={idx % 2 ? 'odd' : 'even'}>
                    <td className={`sticky left-0 z-10 w-[240px] min-w-[240px] max-w-[240px] px-3 py-1 ${band}`}>
                      <p className="truncate text-sm font-medium text-primary" title={`${r.account_name}${r.city ? ' · ' + r.city : ''}${r.distributor_name !== 'Unassigned' ? ' · ' + r.distributor_name : ''}`} data-testid={`cio-name-${r.account_id}`}>{r.account_name}</p>
                    </td>
                    {r.months.map((v, i) => <Amount key={i} v={v} prev={i === 0 ? r.prev_month : r.months[i - 1]} testId={`cio-cell-${r.account_id}-${data.months[i].key}`} />)}
                    <Delta v={r.mom_change} testId={`cio-delta-${r.account_id}`} />
                    <td />
                  </tr>
                );
              })}
              {!rows.length && (
                <tr><td colSpan={(data?.months.length || 6) + 3} className="py-14 text-center text-sm text-slate-500" data-testid="cio-empty">No customers match.</td></tr>
              )}
            </tbody>
            {rows.length > 0 && (
              <tfoot>
                <tr className="border-t-2 border-slate-200 bg-slate-100" data-testid="cio-footer">
                  <td className="sticky left-0 z-10 w-[240px] min-w-[240px] max-w-[240px] bg-slate-100 px-3 py-2 text-xs font-semibold uppercase tracking-wider text-slate-500">Total · {rows.length} customer{rows.length === 1 ? '' : 's'}</td>
                  {filteredTotals.map((v, i) => <Amount key={i} v={v} prev={i === 0 ? filteredPrev : filteredTotals[i - 1]} bold testId={`cio-month-total-${data.months[i].key}`} />)}
                  <Delta v={filteredDelta} testId="cio-delta-total" />
                  <td />
                </tr>
              </tfoot>
            )}
          </table>
        )}
      </div>
    </div>
  );
}
