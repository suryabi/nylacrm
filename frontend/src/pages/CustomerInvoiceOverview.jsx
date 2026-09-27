import React, { useEffect, useMemo, useState } from 'react';
import axios from 'axios';
import { toast } from 'sonner';
import { FileSpreadsheet, Loader2, Receipt, RefreshCw, Search, Store, Users, X } from 'lucide-react';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { SearchCombobox } from '../components/SearchCombobox';
import { MultiSearchCombobox } from '../components/MultiSearchCombobox';

const API_URL = process.env.REACT_APP_BACKEND_URL;
const HEAD = () => ({ Authorization: `Bearer ${localStorage.getItem('token')}` });
const inr = (v) => Number(v || 0).toLocaleString('en-IN', { maximumFractionDigits: 0 });

const Amount = ({ v, bold = false, testId }) => (
  <td className={`whitespace-nowrap px-3 py-2.5 text-right tabular-nums ${bold ? 'font-semibold text-slate-900' : v > 0 ? 'text-slate-800' : 'text-slate-300'}`} data-testid={testId}>
    {v > 0 || bold ? inr(v) : '0'}
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

  const load = async () => {
    setLoading(true);
    try {
      const res = await axios.get(`${API_URL}/api/reports/customer-invoice-overview`, { headers: HEAD() });
      setData(res.data);
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
        </div>
      )}

      <div className="flex flex-col gap-2 rounded-2xl border border-slate-200/90 bg-white p-3 shadow-sm sm:flex-row sm:items-center" data-testid="cio-filters">
        <div className="sm:w-64">
          <SearchCombobox options={data?.filters?.distributors || []} value={distributor} onChange={(v) => { setDistributor(v); setCustomers([]); }}
            placeholder="All distributors" allLabel="All distributors" icon={Store} testId="cio-distributor" />
        </div>
        <div className="flex-1 sm:max-w-md">
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
          <table className="w-full min-w-[960px] text-sm" data-testid="cio-table">
            <thead className="sticky top-0 z-10 bg-white">
              <tr className="border-b border-slate-200">
                <th className="sticky left-0 z-20 bg-white px-4 py-3 text-left text-[11px] font-semibold uppercase tracking-wider text-slate-400">Customer</th>
                {data?.months.map((m) => (
                  <th key={m.key} className={`whitespace-nowrap px-3 py-3 text-right text-[11px] font-semibold uppercase tracking-wider ${m.current ? 'text-[#002FA7]' : 'text-slate-400'}`} data-testid={`cio-month-${m.key}`}>
                    {m.label}{m.current && <span className="ml-1 rounded bg-[#002FA7]/10 px-1 py-px text-[9px] normal-case tracking-normal">current</span>}
                  </th>
                ))}
                <th className="whitespace-nowrap px-4 py-3 text-right text-[11px] font-semibold uppercase tracking-wider text-slate-500">6-mo Total</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.account_id} className="border-t border-slate-100 hover:bg-slate-50/70" data-testid={`cio-row-${r.account_id}`}>
                  <td className="sticky left-0 z-10 bg-white px-4 py-2.5">
                    <div className="max-w-[20rem] truncate font-semibold text-slate-900" title={r.account_name} data-testid={`cio-name-${r.account_id}`}>{r.account_name}</div>
                    <div className="text-[11px] text-slate-400">{[r.account_code, r.city, r.distributor_name !== 'Unassigned' ? r.distributor_name : null].filter(Boolean).join(' · ') || '\u00a0'}</div>
                  </td>
                  {r.months.map((v, i) => <Amount key={i} v={v} testId={`cio-cell-${r.account_id}-${data.months[i].key}`} />)}
                  <Amount v={r.total} bold testId={`cio-total-${r.account_id}`} />
                </tr>
              ))}
              {!rows.length && (
                <tr><td colSpan={(data?.months.length || 6) + 2} className="py-14 text-center text-sm text-slate-500" data-testid="cio-empty">No customers match.</td></tr>
              )}
            </tbody>
            {rows.length > 0 && (
              <tfoot>
                <tr className="border-t-2 border-slate-200 bg-slate-50" data-testid="cio-footer">
                  <td className="sticky left-0 z-10 bg-slate-50 px-4 py-3 text-xs font-semibold uppercase tracking-wider text-slate-500">Total · {rows.length} customer{rows.length === 1 ? '' : 's'}</td>
                  {filteredTotals.map((v, i) => <Amount key={i} v={v} bold testId={`cio-month-total-${data.months[i].key}`} />)}
                  <Amount v={filteredTotals.reduce((a, b) => a + b, 0)} bold testId="cio-grand-total" />
                </tr>
              </tfoot>
            )}
          </table>
        )}
      </div>
    </div>
  );
}
