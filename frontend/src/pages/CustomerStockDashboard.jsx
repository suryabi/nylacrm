import React, { useCallback, useEffect, useMemo, useState } from 'react';
import axios from 'axios';
import { toast } from 'sonner';
import { AlertTriangle, CalendarClock, Check, ChevronsUpDown, FileSpreadsheet, Loader2, Package, RefreshCw, Search, Store, Users, X } from 'lucide-react';
import { Button } from '../components/ui/button';
import { Popover, PopoverContent, PopoverTrigger } from '../components/ui/popover';
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from '../components/ui/command';
import { Input } from '../components/ui/input';

const API_URL = process.env.REACT_APP_BACKEND_URL;
const HEAD = () => ({ Authorization: `Bearer ${localStorage.getItem('token')}` });
const fmt = (v) => Number(v || 0).toLocaleString('en-IN');
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
// Day + 3-letter month, no year (e.g. "15 Oct").
const fmtDate = (iso) => {
  if (!iso) return '—';
  const d = new Date(iso.length === 10 ? `${iso}T00:00:00` : iso);
  return Number.isNaN(d.getTime()) ? iso : `${String(d.getDate()).padStart(2, '0')} ${MONTHS[d.getMonth()]}`;
};

const AutoComplete = ({ label, icon: Icon, options, value, onChange, placeholder, testId }) => {
  const [open, setOpen] = useState(false);
  const current = options.find((o) => o.id === value);
  return (
    <div className="flex flex-col">
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button variant="outline" role="combobox" aria-expanded={open} className="h-9 w-44 justify-between text-sm font-normal" data-testid={`${testId}-trigger`}>
            <span className="flex items-center gap-2 truncate">
              <Icon className="h-4 w-4 text-slate-400 shrink-0" />
              <span className={`truncate ${current ? 'text-slate-900' : 'text-slate-400'}`}>{current ? current.name : placeholder}</span>
            </span>
            <span className="flex items-center gap-1">
              {current && <X className="h-3.5 w-3.5 text-slate-400 hover:text-rose-600" onClick={(e) => { e.stopPropagation(); onChange(''); }} data-testid={`${testId}-clear`} />}
              <ChevronsUpDown className="h-4 w-4 shrink-0 opacity-50" />
            </span>
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-64 p-0" align="start">
          <Command>
            <CommandInput placeholder={`Search ${label.toLowerCase()}…`} data-testid={`${testId}-input`} />
            <CommandList>
              <CommandEmpty>No match.</CommandEmpty>
              <CommandGroup>
                {options.map((o) => (
                  <CommandItem key={o.id} value={`${o.name} ${o.city || ''} ${o.code || ''}`} onSelect={() => { onChange(o.id === value ? '' : o.id); setOpen(false); }} data-testid={`${testId}-option-${o.id}`}>
                    <Check className={`mr-2 h-4 w-4 ${o.id === value ? 'opacity-100' : 'opacity-0'}`} />
                    <span className="truncate">{o.name}</span>
                    {(o.city || o.code) && <span className="ml-auto pl-2 text-[10px] text-slate-400">{o.city || o.code}</span>}
                  </CommandItem>
                ))}
              </CommandGroup>
            </CommandList>
          </Command>
        </PopoverContent>
      </Popover>
    </div>
  );
};

// Colour code shared with Global Stock Dashboard (rose / emerald 700).
// red = branded stock below the expected order, green = stock covers it, neutral = no branded SKU.
const URGENCY = {
  red: { text: 'text-rose-700', dot: 'bg-rose-700' },
  green: { text: 'text-emerald-700', dot: 'bg-emerald-700' },
  neutral: { text: 'text-slate-600', dot: 'bg-slate-300' },
};
const fmtCrates = (v) => (v == null ? '\u2014' : Number(v).toLocaleString('en-IN', { maximumFractionDigits: 1 }));

const Row = ({ label, value, sub, tone = 'text-slate-800', strong = false, testId, extra, note }) => (
  <div className="flex items-baseline justify-between gap-3 whitespace-nowrap">
    <span className="text-[11px] text-slate-400">{label}</span>
    <span className="text-right">
      {note && <span className="mr-2 text-[11px] font-medium text-rose-700">{note}</span>}
      <span className={`text-base tabular-nums ${strong ? 'font-bold' : 'font-medium'} ${tone}`} data-testid={testId} {...extra}>{value}</span>
      {sub && <span className="ml-1 text-[11px] text-slate-400">{sub}</span>}
    </span>
  </div>
);

const CustomerTile = ({ tile }) => {
  const hasOrder = tile.last_order_date != null;
  const noStock = tile.child_skus.length === 0;
  const initials = (tile.account_name || '?').split(/\s+/).slice(0, 2).map((w) => w[0]).join('').toUpperCase();
  const critical = tile.low_stock;
  const tone = critical ? 'text-rose-700' : tile.next_order_urgency === 'green' ? 'text-emerald-700' : 'text-slate-800';
  const shortfall = critical ? tile.expected_crates - tile.stock_crates : 0;
  const hasForecast = !!tile.expected_next_order_date;
  return (
    <div className={`group relative flex min-h-[15rem] flex-col rounded-xl border bg-white p-4 shadow-sm transition-[transform,box-shadow] duration-200 hover:-translate-y-0.5 hover:shadow-md ${critical ? 'border-rose-300' : 'border-slate-200'}`} data-testid={`customer-tile-${tile.account_id}`} data-priority={tile.priority ? 'true' : 'false'}>
      <div className="flex items-center gap-2.5">
        <div className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-[11px] font-semibold ${critical ? 'bg-rose-700 text-white' : 'bg-[#002FA7]/10 text-[#002FA7]'}`}>{initials}</div>
        <div className="min-w-0 flex-1">
          <h3 className="truncate text-sm font-semibold leading-tight text-slate-900" title={tile.account_name} data-testid={`customer-name-${tile.account_id}`}>{tile.account_name}</h3>
          <p className="truncate text-[11px] leading-tight text-slate-400">{tile.city || tile.account_code || '\u00a0'}</p>
        </div>
        {critical && <AlertTriangle className="h-4 w-4 shrink-0 text-rose-700" title="Cannot cover next order" data-testid={`priority-badge-${tile.account_id}`} />}
      </div>

      <div className={`mt-3 space-y-1.5 rounded-lg px-3 py-2.5 ${critical ? 'bg-rose-50' : tile.next_order_urgency === 'green' ? 'bg-emerald-50/60' : 'bg-slate-50'}`}
        data-testid={`next-order-date-${tile.account_id}`} data-urgency={tile.next_order_urgency || ''} title={tile.forecast_basis || ''}>
        <Row label="Next order" value={hasForecast ? fmtDate(tile.expected_next_order_date) : '\u2014'} tone={hasForecast ? tone : 'text-slate-300'} strong={critical} />
        <Row label="Expected" value={fmtCrates(tile.expected_crates)} sub={tile.expected_crates != null ? 'cr' : ''} tone={tile.expected_crates != null ? tone : 'text-slate-300'} strong={critical} testId={`expected-crates-${tile.account_id}`} />
        <Row label="In hand" value={noStock ? '\u2014' : fmtCrates(tile.stock_crates)} sub={noStock ? '' : 'cr'} tone={noStock ? 'text-slate-300' : critical ? 'text-rose-700' : 'text-slate-900'} strong={critical}
          testId={`stock-total-${tile.account_id}`} extra={critical ? { 'data-shortfall': shortfall } : {}} note={critical ? `−${fmtCrates(shortfall)}` : null} />
        {critical && <span className="sr-only" data-testid={`low-stock-badge-${tile.account_id}`}>short by {fmtCrates(shortfall)} crates</span>}
      </div>

      <div className="mt-3 flex-1">
        {noStock ? (
          <p className="text-[11px] text-slate-400" data-testid={`stock-none-${tile.account_id}`}>No branded SKU</p>
        ) : (
          <ul className="divide-y divide-slate-100">
            {tile.child_skus.map((sk) => (
              <li key={sk.child_sku_id} className="flex items-center justify-between gap-3 py-1.5" data-testid={`stock-sku-${sk.child_sku_id}`}>
                <span className="min-w-0 flex items-center gap-1.5 truncate text-xs text-slate-600" title={`${sk.child_sku_name}${sk.shared ? ` · shared via ${sk.brand_group_name}` : ''} · ${fmt(sk.stock_in_hand)} units${sk.warehouses.length ? ' · ' + sk.warehouses.map((w) => `${w.location_name} ${fmt(w.quantity)}`).join(', ') : ''}`}>
                  <span className="truncate">{sk.child_sku_name}</span>
                  {sk.shared && <span className="shrink-0 rounded bg-violet-100 px-1 py-px text-[9px] font-medium text-violet-700" data-testid={`shared-tag-${sk.child_sku_id}`}>shared</span>}
                </span>
                <span className={`shrink-0 whitespace-nowrap text-xs tabular-nums ${critical ? 'font-semibold text-rose-700' : sk.stock_in_hand > 0 ? 'text-slate-800' : 'text-slate-400'}`} data-testid={`stock-qty-${sk.child_sku_id}`}>{fmtCrates(sk.stock_crates)}<span className="ml-0.5 text-[10px] text-slate-400">cr</span></span>
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className="mt-3 flex items-center justify-between whitespace-nowrap border-t border-slate-100 pt-2 text-[11px] text-slate-400">
        <span>Last order</span>
        {hasOrder ? (
          <span className="tabular-nums">
            <span data-testid={`last-order-qty-${tile.account_id}`}>{fmtCrates(tile.last_order_crates)} cr</span>
            <span className="mx-1.5 text-slate-300">·</span>
            <span data-testid={`last-order-date-${tile.account_id}`}>{fmtDate(tile.last_order_date)}</span>
          </span>
        ) : <span data-testid={`last-order-qty-${tile.account_id}`}>{'\u2014'}</span>}
      </div>
    </div>
  );
};

export default function CustomerStockDashboard() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [distributorId, setDistributorId] = useState('');
  const [accountId, setAccountId] = useState('');
  const [q, setQ] = useState('');
  const [exporting, setExporting] = useState(false);

  const exportExcel = useCallback(async () => {
    setExporting(true);
    try {
      const params = new URLSearchParams();
      if (distributorId) params.set('distributor_id', distributorId);
      if (accountId) params.set('account_id', accountId);
      const res = await axios.get(`${API_URL}/api/distributor/customer-stock-dashboard/export?${params}`, { headers: HEAD(), responseType: 'blob' });
      const url = URL.createObjectURL(res.data);
      const a = document.createElement('a');
      a.href = url;
      a.download = `customer-stock-${new Date().toISOString().slice(0, 10)}.xlsx`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
      toast.success('Excel downloaded');
    } catch (e) {
      toast.error('Export failed');
    } finally { setExporting(false); }
  }, [distributorId, accountId]);

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (distributorId) params.set('distributor_id', distributorId);
      if (accountId) params.set('account_id', accountId);
      const res = await axios.get(`${API_URL}/api/distributor/customer-stock-dashboard?${params}`, { headers: HEAD() });
      setData(res.data);
    } catch (e) {
      toast.error(e.response?.data?.detail || 'Failed to load customer stock dashboard');
    } finally { setLoading(false); }
  }, [distributorId, accountId]);

  useEffect(() => { fetchData(); }, [fetchData]);

  const tiles = useMemo(() => {
    const list = data?.tiles || [];
    const needle = q.trim().toLowerCase();
    return needle ? list.filter((t) => (t.account_name || '').toLowerCase().includes(needle) || (t.city || '').toLowerCase().includes(needle)) : list;
  }, [data, q]);

  return (
    <div className="space-y-4" style={{ fontFamily: 'Helvetica, "Helvetica Neue", Arial, sans-serif' }} data-testid="customer-stock-dashboard">
      <div className="flex flex-wrap items-center gap-2 lg:flex-nowrap">
        <div className="mr-auto min-w-0">
          <h1 className="truncate text-xl font-semibold text-slate-900">Customer Stock Dashboard</h1>
          <p className="mt-0.5 hidden truncate text-xs text-slate-500 xl:block">Expected next order vs branded stock in hand · customers who cannot cover it come first</p>
        </div>
        <AutoComplete label="Distributor" icon={Store} options={data?.filters?.distributors || []} value={distributorId} onChange={(v) => { setDistributorId(v); setAccountId(''); }} placeholder="Distributor" testId="csd-distributor" />
        <AutoComplete label="Account" icon={Users} options={data?.filters?.accounts || []} value={accountId} onChange={setAccountId} placeholder="Account" testId="csd-account" />
        <div className="relative">
          <Search className="absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
          <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Find customer" className="h-9 w-40 pl-8 text-sm" data-testid="csd-quick-find" />
        </div>
        <Button variant="outline" size="icon" className="h-9 w-9" onClick={fetchData} disabled={loading} data-testid="csd-refresh"><RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} /></Button>
        <Button variant="outline" className="h-9" onClick={exportExcel} disabled={exporting || !data} data-testid="csd-export-btn">
          {exporting ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> : <FileSpreadsheet className="mr-1.5 h-4 w-4 text-emerald-600" />} Excel
        </Button>
      </div>

      {data && (
        <div className="flex flex-wrap items-center gap-x-5 gap-y-2 text-xs text-slate-500" data-testid="csd-summary">
          {data.summary.low_stock > 0 && <span className="inline-flex items-center gap-1.5 rounded-full bg-rose-700 px-2.5 py-1 text-xs font-semibold text-white" data-testid="csd-low-stock-count"><AlertTriangle className="h-3.5 w-3.5" /> {fmt(data.summary.low_stock)} reorder</span>}
          <span><span className="font-semibold text-slate-800">{fmt(tiles.length)}</span> customers</span>
          <span><span className="font-semibold text-slate-800">{fmt(data.summary.with_orders)}</span> ordering</span>
          <span><span className="font-semibold text-slate-800">{fmt(data.summary.branded_skus)}</span> branded SKUs</span>
          <span className="inline-flex items-center gap-1.5"><Package className="h-3.5 w-3.5" /> <span className="font-semibold text-slate-800">{fmtCrates(data.summary.stock_crates)}</span> cr in hand</span>
          <span className="ml-auto hidden items-center gap-3 text-[11px] md:inline-flex" data-testid="csd-legend">
            <span className="inline-flex items-center gap-1"><span className="h-2 w-2 rounded-full bg-rose-700" /> short</span>
            <span className="inline-flex items-center gap-1"><span className="h-2 w-2 rounded-full bg-emerald-700" /> covered</span>
          </span>
        </div>
      )}

      {loading && !data ? (
        <div className="flex items-center justify-center py-20 text-slate-500"><Loader2 className="mr-2 h-5 w-5 animate-spin" /> Loading customers…</div>
      ) : tiles.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-slate-300 py-16 text-center text-sm text-slate-500" data-testid="csd-empty">No customers match the current filters.</div>
      ) : (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5" data-testid="csd-grid">
          {tiles.map((t) => <CustomerTile key={t.account_id} tile={t} />)}
        </div>
      )}
    </div>
  );
}
