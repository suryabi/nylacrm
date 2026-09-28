import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import axios from 'axios';
import { toast } from 'sonner';
import { ArrowDown, ArrowUp, ArrowUpDown, FileSpreadsheet, Loader2, Receipt, RefreshCw, Search, Store, Users, X } from 'lucide-react';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { SearchCombobox } from '../components/SearchCombobox';
import { MultiSearchCombobox } from '../components/MultiSearchCombobox';

const API_URL = process.env.REACT_APP_BACKEND_URL;
const HEAD = () => ({ Authorization: `Bearer ${localStorage.getItem('token')}` });
const inr = (v) => Number(v || 0).toLocaleString('en-IN', { maximumFractionDigits: 0 });
const STICKY = 'sticky left-0 border-r border-slate-200/80 shadow-[2px_0_6px_-2px_rgba(0,0,0,0.06)]';
const WIDTH_KEY = 'cio-col-widths-v1';
const MIN_W = { customer: 160, month: 84, delta: 110 };
const SHARES = { customer: 0.3, month: 0.1, delta: 0.1 };

// Drag handle on a header's right edge; widths persist per browser.
const ResizeHandle = ({ onStart, testId }) => (
  <span role="separator" aria-orientation="vertical" data-testid={testId}
    onMouseDown={onStart} onTouchStart={onStart} onClick={(e) => e.stopPropagation()}
    className="absolute right-0 top-0 z-40 h-full w-2 -mr-1 cursor-col-resize select-none touch-none group/rh">
    <span className="absolute right-1 top-1/4 h-1/2 w-px bg-slate-300 opacity-0 transition-opacity group-hover/rh:opacity-100" />
  </span>
);

// Month cell: value + red ▼ / dark-green ▲ against the previous month (prev === null → no indicator).
const Amount = ({ v, prev = null, bold = false, testId }) => {
  const dir = prev === null || v === prev ? null : v > prev ? 'up' : 'down';
  return (
    <td className={`whitespace-nowrap px-3 py-3.5 text-right text-sm tabular-nums ${bold ? 'font-bold text-slate-900' : v > 0 ? 'text-slate-800' : 'text-slate-300'}`} data-testid={testId} data-trend={dir || 'flat'}>
      <span className="inline-flex items-center justify-end gap-1">
        {dir === 'up' && <ArrowUp className="h-3 w-3 text-emerald-700" strokeWidth={2.5} aria-label="up vs previous month" />}
        {dir === 'down' && <ArrowDown className="h-3 w-3 text-red-600" strokeWidth={2.5} aria-label="down vs previous month" />}
        {v > 0 || bold ? inr(v) : '0'}
      </span>
    </td>
  );
};

// Δ current month − last month: green when positive, bold red when negative, muted 0 otherwise.
const Delta = ({ v, testId }) => (
  <td className={`whitespace-nowrap px-4 py-3.5 text-right text-sm tabular-nums ${v > 0 ? 'font-semibold text-emerald-700' : v < 0 ? 'font-bold text-red-600' : 'text-slate-300'}`} data-testid={testId} data-sign={v > 0 ? 'pos' : v < 0 ? 'neg' : 'zero'}>
    {v > 0 ? `+${inr(v)}` : v < 0 ? `−${inr(Math.abs(v))}` : '0'}
  </td>
);

const SortHead = ({ id, label, sort, onSort, align = 'right', className = '', children, testId, onResize }) => {
  const active = sort.column === id;
  const Icon = !active ? ArrowUpDown : sort.direction === 'asc' ? ArrowUp : ArrowDown;
  return (
    <th className={`relative py-3.5 ${align === 'left' ? 'text-left' : 'text-right'} ${className}`} aria-sort={active ? (sort.direction === 'asc' ? 'ascending' : 'descending') : 'none'}>
      {onResize && <ResizeHandle onStart={onResize} testId={`cio-resize-${id}`} />}
      <button type="button" onClick={() => onSort(id)} data-testid={testId} data-sort={active ? sort.direction : 'none'}
        className={`group inline-flex items-center gap-1.5 whitespace-nowrap text-[11px] font-semibold uppercase tracking-wider transition-colors focus:outline-none ${active ? 'text-slate-900' : 'text-slate-500 hover:text-slate-900'} ${align === 'left' ? '' : 'flex-row-reverse'}`}>
        <Icon className={`h-3.5 w-3.5 transition-colors ${active ? 'text-[#002FA7]' : 'text-slate-300 group-hover:text-slate-500'}`} strokeWidth={active ? 2.5 : 2} />
        <span>{label}{children}</span>
      </button>
    </th>
  );
};

export default function CustomerInvoiceOverview() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [exporting, setExporting] = useState(false);
  const [q, setQ] = useState('');
  const [hideZero, setHideZero] = useState(false);
  const [distributor, setDistributor] = useState('all');
  const [customers, setCustomers] = useState([]);
  const [defaulted, setDefaulted] = useState(false);
  const [sort, setSort] = useState({ column: 'customer', direction: 'asc' });
  const wrapRef = useRef(null);
  const [widths, setWidths] = useState(() => { try { return JSON.parse(localStorage.getItem(WIDTH_KEY)) || null; } catch { return null; } });
  const [resizing, setResizing] = useState(false);

  // First visit: distribute the container width 30% / 6×10% / 10%; afterwards the user's px widths win.
  useEffect(() => {
    if (widths || !data || !wrapRef.current) return;
    const total = Math.max(wrapRef.current.clientWidth, 1050);
    const cols = ['customer', ...data.months.map((_, i) => `m${i}`), 'delta'];
    setWidths(Object.fromEntries(cols.map((c) => [c, Math.round(total * (c === 'customer' ? SHARES.customer : c === 'delta' ? SHARES.delta : SHARES.month))])));
  }, [data, widths]);

  const startResize = useCallback((col) => (e) => {
    e.preventDefault(); e.stopPropagation();
    const startX = e.touches ? e.touches[0].clientX : e.clientX;
    const startW = widths?.[col] || 120;
    const min = col === 'customer' ? MIN_W.customer : col === 'delta' ? MIN_W.delta : MIN_W.month;
    setResizing(true);
    const move = (ev) => {
      const x = ev.touches ? ev.touches[0].clientX : ev.clientX;
      setWidths((w) => ({ ...w, [col]: Math.max(min, startW + x - startX) }));
    };
    const stop = () => {
      setResizing(false);
      setWidths((w) => { try { localStorage.setItem(WIDTH_KEY, JSON.stringify(w)); } catch { /* ignore */ } return w; });
      window.removeEventListener('mousemove', move); window.removeEventListener('mouseup', stop);
      window.removeEventListener('touchmove', move); window.removeEventListener('touchend', stop);
    };
    window.addEventListener('mousemove', move); window.addEventListener('mouseup', stop);
    window.addEventListener('touchmove', move, { passive: false }); window.addEventListener('touchend', stop);
  }, [widths]);
  const resetWidths = () => { try { localStorage.removeItem(WIDTH_KEY); } catch { /* ignore */ } setWidths(null); };
  const colW = (c) => widths?.[c];
  const tableW = widths ? Object.values(widths).reduce((a, b) => a + b, 0) : null;

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
  useEffect(() => { load(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const onSort = (column) => setSort((s) => ({ column, direction: s.column === column ? (s.direction === 'asc' ? 'desc' : 'asc') : column === 'customer' ? 'asc' : 'desc' }));
  const sortValue = (r) => (sort.column === 'customer' ? (r.account_name || '').toLowerCase() : sort.column === 'delta' ? r.mom_change : r.months[Number(sort.column.slice(1))]);

  const rows = useMemo(() => {
    if (!data) return [];
    const s = q.trim().toLowerCase();
    const list = data.rows.filter((r) => (!hideZero || r.total > 0)
      && (distributor === 'all' || (distributor === 'unassigned' ? !r.distributor_id : r.distributor_id === distributor))
      && (!customers.length || customers.includes(r.account_id))
      && (!s || [r.account_name, r.account_code, r.city, r.distributor_name].some((x) => (x || '').toLowerCase().includes(s))));
    const dir = sort.direction === 'asc' ? 1 : -1;
    return [...list].sort((a, b) => {
      const av = sortValue(a), bv = sortValue(b);
      if (av === bv) return (a.account_name || '').localeCompare(b.account_name || '');
      return (av > bv ? 1 : -1) * dir;
    });
  }, [data, q, hideZero, distributor, customers, sort]); // eslint-disable-line react-hooks/exhaustive-deps
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
      a.href = url; a.download = 'customer-invoice-overview.xlsx'; document.body.appendChild(a); a.click(); a.remove();
      URL.revokeObjectURL(url);
    } catch { toast.error('Export failed'); } finally { setExporting(false); }
  };

  return (
    <div className="w-full space-y-5" data-testid="customer-invoice-overview-page" style={{ fontFamily: "'Helvetica Neue', Helvetica, Arimo, Arial, sans-serif" }}>
      <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <div className="flex items-start gap-3">
          <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-[#002FA7] text-white shadow-sm"><Receipt className="h-5 w-5" /></div>
          <div>
            <h1 className="text-2xl font-bold tracking-tight text-slate-900 sm:text-3xl">Customer Invoice Overview</h1>
            <p className="mt-0.5 flex flex-wrap items-center gap-2 text-xs text-slate-500 sm:text-sm" data-testid="cio-subtitle">
              <span>Gross invoice value per customer, month-wise · {data ? `${data.months[0].label} – ${data.months[data.months.length - 1].label}` : 'last 6 months'}</span>
              {defaultName && distributor === data?.default_distributor_id && <span className="inline-flex items-center rounded-md bg-[#002FA7]/10 px-1.5 py-0.5 text-[10px] font-medium text-[#002FA7]" data-testid="cio-default-badge">Defaulted to {defaultName} (your city)</span>}
            </p>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button variant="outline" size="sm" onClick={load} disabled={loading} className="h-9" data-testid="cio-refresh"><RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} /></Button>
          <Button size="sm" onClick={exportExcel} disabled={exporting || !data} className="h-9 bg-[#002FA7] hover:bg-[#00268a]" data-testid="cio-export-btn">
            {exporting ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> : <FileSpreadsheet className="mr-1.5 h-4 w-4" />} Excel
          </Button>
        </div>
      </div>

      <div className="flex flex-col gap-3 rounded-2xl border border-slate-200/90 bg-white p-3.5 shadow-sm lg:flex-row lg:items-center" data-testid="cio-filters">
        <div className="w-full lg:w-72">
          <SearchCombobox options={data?.filters?.distributors || []} value={distributor} onChange={(v) => { setDistributor(v); setCustomers([]); }}
            placeholder="All distributors" allLabel="All distributors" icon={Store} testId="cio-distributor" />
        </div>
        <div className="w-full lg:w-96">
          <MultiSearchCombobox options={customerOptions} values={customers} onChange={setCustomers} placeholder="All customers" icon={Users} testId="cio-customers" />
        </div>
        <div className="relative w-full sm:w-64">
          <Search className="pointer-events-none absolute left-3 top-3 h-4 w-4 text-slate-400" />
          <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search customer, code, city" className="h-[42px] rounded-xl border-slate-200/80 pl-9 pr-8 shadow-sm" data-testid="cio-search" />
          {q && <button type="button" onClick={() => setQ('')} className="absolute right-2.5 top-3 text-slate-400 hover:text-slate-700" data-testid="cio-search-clear"><X className="h-4 w-4" /></button>}
        </div>
        <label className="inline-flex cursor-pointer select-none items-center gap-2 text-xs font-medium text-slate-700">
          <input type="checkbox" checked={hideZero} onChange={(e) => setHideZero(e.target.checked)} className="h-3.5 w-3.5 accent-[#002FA7]" data-testid="cio-hide-zero" /> Hide customers with no invoices
        </label>
        {activeFilters > 0 && (
          <button type="button" onClick={() => { setDistributor('all'); setCustomers([]); setQ(''); setHideZero(false); }}
            className="text-xs font-semibold text-[#002FA7] underline decoration-dotted underline-offset-4 hover:text-[#00268a]" data-testid="cio-clear-filters">Clear filters</button>
        )}
        <span className="text-xs text-slate-400 lg:ml-auto" data-testid="cio-row-count">{rows.length} of {data?.rows.length || 0} customers</span>
      </div>

      {data && (
        <div className="flex flex-wrap items-center gap-x-6 gap-y-2 rounded-xl border border-slate-200/80 bg-slate-50 px-4 py-2.5 text-xs text-slate-600" data-testid="cio-summary">
          <span><b className="font-semibold text-slate-900">{data.summary.customers}</b> customers</span>
          <span><b className="font-semibold text-slate-900">{data.summary.invoiced_customers}</b> invoiced in period</span>
          <span><b className="font-semibold text-slate-900">{data.summary.invoices}</b> invoices</span>
          <span>Total <b className="font-semibold text-slate-900">₹{inr(data.grand_total)}</b></span>
          <span className="inline-flex items-center gap-1 text-slate-400"><ArrowUp className="h-3.5 w-3.5 text-emerald-700" strokeWidth={2.5} /> up / <ArrowDown className="h-3.5 w-3.5 text-red-600" strokeWidth={2.5} /> down vs previous month · click any header to sort · drag header edges to resize</span>
          {widths && localStorage.getItem(WIDTH_KEY) && <button type="button" onClick={resetWidths} className="ml-auto text-xs font-semibold text-[#002FA7] underline decoration-dotted underline-offset-4 hover:text-[#00268a]" data-testid="cio-reset-widths">Reset column widths</button>}
        </div>
      )}

      <div ref={wrapRef} className={`w-full overflow-x-auto rounded-2xl border border-slate-200/90 bg-white shadow-sm ${resizing ? 'cursor-col-resize select-none' : ''}`}>
        {loading && !data ? (
          <div className="flex items-center justify-center py-16 text-slate-400"><Loader2 className="h-5 w-5 animate-spin" /></div>
        ) : (
          <table className="min-w-full table-fixed border-collapse text-sm" style={tableW ? { width: tableW } : undefined} data-testid="cio-table" data-resizing={resizing ? 'true' : 'false'}>
            <colgroup>
              <col style={{ width: colW('customer') || '30%' }} />
              {data?.months.map((m, i) => <col key={m.key} style={{ width: colW(`m${i}`) || '10%' }} />)}
              <col style={{ width: colW('delta') || '10%' }} />
            </colgroup>
            <thead className="sticky top-0 z-30 bg-slate-50/95 backdrop-blur">
              <tr className="border-b border-slate-200">
                <SortHead id="customer" label="Customer" sort={sort} onSort={onSort} align="left" className={`${STICKY} z-30 bg-slate-50/95 px-4`} testId="cio-sort-customer" onResize={startResize('customer')} />
                {data?.months.map((m, i) => (
                  <SortHead key={m.key} id={`m${i}`} label={m.label} sort={sort} onSort={onSort} className={`px-3 ${m.current ? '[&_button]:text-[#002FA7]' : ''}`} testId={`cio-sort-${m.key}`} onResize={startResize(`m${i}`)}>
                    {m.current && <span className="ml-1.5 inline-flex items-center rounded-md bg-[#002FA7]/10 px-1.5 py-0.5 text-[9px] font-medium normal-case tracking-normal text-[#002FA7]">current</span>}
                  </SortHead>
                ))}
                <SortHead id="delta" label="Δ vs last month" sort={sort} onSort={onSort} className="bg-slate-100/70 px-4" testId="cio-sort-delta" onResize={startResize('delta')} />
              </tr>
            </thead>
            <tbody>
              {rows.map((r, idx) => {
                const odd = idx % 2 === 1;
                return (
                  <tr key={r.account_id} className={`border-t border-slate-100 transition-colors duration-150 ${odd ? 'bg-slate-50/75' : 'bg-white'} hover:bg-[#002FA7]/[0.035]`} data-testid={`cio-row-${r.account_id}`} data-band={odd ? 'odd' : 'even'}>
                    <td className={`${STICKY} z-20 px-4 py-3.5 ${odd ? 'bg-[#f8fafc]' : 'bg-white'}`}>
                      <p className="block truncate text-sm font-medium text-primary transition-colors hover:text-primary/90 hover:underline" title={[r.account_name, r.city, r.distributor_name !== 'Unassigned' ? r.distributor_name : null].filter(Boolean).join(' · ')} data-testid={`cio-name-${r.account_id}`}>{r.account_name}</p>
                    </td>
                    {r.months.map((v, i) => <Amount key={i} v={v} prev={i === 0 ? r.prev_month : r.months[i - 1]} testId={`cio-cell-${r.account_id}-${data.months[i].key}`} />)}
                    <Delta v={r.mom_change} testId={`cio-delta-${r.account_id}`} />
                  </tr>
                );
              })}
              {!rows.length && (
                <tr><td colSpan={(data?.months.length || 6) + 2} className="py-16 text-center text-sm text-slate-500" data-testid="cio-empty">No customers match the current filters.</td></tr>
              )}
            </tbody>
            {rows.length > 0 && (
              <tfoot>
                <tr className="border-t-2 border-slate-200 bg-slate-100" data-testid="cio-footer">
                  <td className={`${STICKY} z-20 bg-slate-100 px-4 py-4 text-[11px] font-semibold uppercase tracking-wider text-slate-500`}>Total · {rows.length} customer{rows.length === 1 ? '' : 's'}</td>
                  {filteredTotals.map((v, i) => <Amount key={i} v={v} prev={i === 0 ? filteredPrev : filteredTotals[i - 1]} bold testId={`cio-month-total-${data.months[i].key}`} />)}
                  <Delta v={filteredDelta} testId="cio-delta-total" />
                </tr>
              </tfoot>
            )}
          </table>
        )}
      </div>
    </div>
  );
}
