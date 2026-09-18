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
const fmtDate = (iso) => {
  if (!iso) return '—';
  const d = new Date(iso.length === 10 ? `${iso}T00:00:00` : iso);
  return Number.isNaN(d.getTime()) ? iso : d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
};

const AutoComplete = ({ label, icon: Icon, options, value, onChange, placeholder, testId }) => {
  const [open, setOpen] = useState(false);
  const current = options.find((o) => o.id === value);
  return (
    <div className="flex flex-col gap-1">
      <span className="text-[10px] font-medium uppercase tracking-wide text-slate-500">{label}</span>
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button variant="outline" role="combobox" aria-expanded={open} className="h-9 w-60 justify-between text-sm font-normal" data-testid={`${testId}-trigger`}>
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
        <PopoverContent className="w-60 p-0" align="start">
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

const CustomerTile = ({ tile }) => {
  const hasOrder = tile.last_order_date != null;
  const noStock = tile.child_skus.length === 0;
  const initials = (tile.account_name || '?').split(/\s+/).slice(0, 2).map((w) => w[0]).join('').toUpperCase();
  const urg = URGENCY[tile.next_order_urgency];
  const critical = tile.low_stock;
  return (
    <div className={`group relative flex flex-col rounded-xl border bg-white p-4 transition-[transform,box-shadow] duration-200 hover:-translate-y-0.5 hover:shadow-md ${critical ? 'border-rose-300 shadow-sm shadow-rose-100' : 'border-slate-200 shadow-sm'}`} data-testid={`customer-tile-${tile.account_id}`} data-priority={tile.priority ? 'true' : 'false'}>
      {/* Header — name is the anchor; location is secondary */}
      <div className="flex items-center gap-2.5">
        <div className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-[11px] font-bold ${critical ? 'bg-rose-700 text-white' : 'bg-[#002FA7]/10 text-[#002FA7]'}`}>{initials}</div>
        <div className="min-w-0 flex-1">
          <h3 className="truncate text-sm font-bold leading-tight text-slate-900" title={tile.account_name} data-testid={`customer-name-${tile.account_id}`}>{tile.account_name}</h3>
          <p className="truncate text-[11px] leading-tight text-slate-400">{[tile.city, tile.category].filter(Boolean).join(' · ') || tile.account_code || '\u00a0'}</p>
        </div>
        {critical && (
          <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-rose-700 px-2 py-0.5 text-[10px] font-semibold text-white" data-testid={`priority-badge-${tile.account_id}`}>
            <AlertTriangle className="h-3 w-3" /> Reorder
          </span>
        )}
      </div>

      {/* Critical block — expected next order (date + crates) */}
      <div className={`mt-3 flex items-center justify-between rounded-lg px-3 py-2 ${critical ? 'bg-rose-50' : urg ? 'bg-emerald-50/60' : 'bg-slate-50'}`}>
        <span className="inline-flex items-center gap-1.5 text-[10px] font-medium uppercase tracking-wide text-slate-500"><CalendarClock className="h-3.5 w-3.5" /> Next order</span>
        {urg ? (
          <span className="inline-flex items-baseline gap-2" data-testid={`next-order-date-${tile.account_id}`} data-urgency={tile.next_order_urgency} title={tile.forecast_basis || ''}>
            <span className={`text-sm font-bold ${urg.text}`}>{fmtDate(tile.expected_next_order_date)}</span>
            <span className={`text-sm font-bold tabular-nums ${urg.text}`} data-testid={`expected-crates-${tile.account_id}`}>{fmtCrates(tile.expected_crates)} <span className="text-[10px] font-medium opacity-70">crates</span></span>
          </span>
        ) : <span className="text-sm font-semibold text-slate-300" data-testid={`next-order-date-${tile.account_id}`}>{'\u2014'}</span>}
      </div>

      {/* Stock in hand — big only when it matters */}
      <div className="mt-3">
        <div className="flex items-center justify-between">
          <p className="text-[10px] font-medium uppercase tracking-wide text-slate-500">Stock in hand</p>
          {critical && <span className="text-[10px] font-semibold text-rose-700" data-testid={`low-stock-badge-${tile.account_id}`}>short by {fmtCrates(tile.expected_crates - tile.stock_crates)} crates</span>}
        </div>
        {noStock ? (
          <p className="mt-1 text-xs text-slate-400" data-testid={`stock-none-${tile.account_id}`}>No branded SKU</p>
        ) : (
          <ul className="mt-1 divide-y divide-slate-100">
            {tile.child_skus.map((s) => (
              <li key={s.child_sku_id} className="flex items-center justify-between gap-3 py-1.5" data-testid={`stock-sku-${s.child_sku_id}`}>
                <span className="min-w-0">
                  <span className="block truncate text-xs font-medium text-slate-700" title={s.child_sku_name}>{s.child_sku_name}</span>
                  {s.warehouses.length > 0 && <span className="block truncate text-[10px] text-slate-400">{s.warehouses.map((w) => `${w.location_name} ${fmt(w.quantity)}`).join(' · ')}</span>}
                </span>
                <span className="shrink-0 text-right">
                  <span className={`block text-xl font-bold leading-none tabular-nums ${critical ? 'text-rose-700' : s.stock_in_hand > 0 ? 'text-slate-900' : 'text-slate-400'}`} data-testid={`stock-qty-${s.child_sku_id}`}>{fmtCrates(s.stock_crates)}<span className="ml-1 text-[10px] font-medium text-slate-400">cr</span></span>
                  <span className="block text-[10px] text-slate-400" data-testid={`stock-units-${s.child_sku_id}`}>{fmt(s.stock_in_hand)} units</span>
                </span>
              </li>
            ))}
            {tile.child_skus.length > 1 && (
              <li className="flex items-center justify-between pt-1.5 text-xs font-semibold text-slate-600">
                <span>Total</span><span className={`tabular-nums ${critical ? 'text-rose-700' : 'text-slate-900'}`} data-testid={`stock-total-${tile.account_id}`}>{fmtCrates(tile.stock_crates)} cr</span>
              </li>
            )}
          </ul>
        )}
      </div>

      {/* Secondary — last order, de-emphasised */}
      <div className="mt-3 flex items-center justify-between border-t border-slate-100 pt-2 text-[11px] text-slate-500">
        <span>Last order</span>
        {hasOrder ? (
          <span className="tabular-nums">
            <span className="font-semibold text-slate-700" data-testid={`last-order-qty-${tile.account_id}`}>{fmtCrates(tile.last_order_crates)} cr</span>
            <span className="mx-1 text-slate-300">·</span>
            <span data-testid={`last-order-date-${tile.account_id}`}>{fmtDate(tile.last_order_date)}</span>
          </span>
        ) : <span className="text-slate-300" data-testid={`last-order-qty-${tile.account_id}`}>{'\u2014'}</span>}
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
      <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <h1 className="text-xl font-bold text-slate-900 md:text-2xl">Customer Stock Dashboard</h1>
          <p className="mt-0.5 text-xs text-slate-500">Expected next order (from the last 6 orders) vs branded stock in hand. Customers who cannot cover their next order are listed first.</p>
        </div>
        <div className="flex flex-wrap items-end gap-3">
          <AutoComplete label="Distributor" icon={Store} options={data?.filters?.distributors || []} value={distributorId} onChange={(v) => { setDistributorId(v); setAccountId(''); }} placeholder="All distributors" testId="csd-distributor" />
          <AutoComplete label="Account" icon={Users} options={data?.filters?.accounts || []} value={accountId} onChange={setAccountId} placeholder="All accounts" testId="csd-account" />
          <div className="flex flex-col gap-1">
            <span className="text-[10px] font-medium uppercase tracking-wide text-slate-500">Quick find</span>
            <div className="relative">
              <Search className="absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
              <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Type a customer name" className="h-9 w-48 pl-8 text-sm" data-testid="csd-quick-find" />
            </div>
          </div>
          <Button variant="outline" size="icon" className="h-9 w-9" onClick={fetchData} disabled={loading} data-testid="csd-refresh"><RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} /></Button>
          <Button variant="outline" className="h-9" onClick={exportExcel} disabled={exporting || !data} data-testid="csd-export-btn">
            {exporting ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> : <FileSpreadsheet className="mr-1.5 h-4 w-4 text-emerald-600" />} Excel
          </Button>
        </div>
      </div>

      {data && (
        <div className="flex flex-wrap items-center gap-x-5 gap-y-2 text-xs text-slate-500" data-testid="csd-summary">
          {data.summary.low_stock > 0 && <span className="inline-flex items-center gap-1.5 rounded-full bg-rose-700 px-2.5 py-1 font-semibold text-white" data-testid="csd-low-stock-count"><AlertTriangle className="h-3.5 w-3.5" /> {fmt(data.summary.low_stock)} customer{data.summary.low_stock === 1 ? '' : 's'} need a reorder</span>}
          <span><span className="font-semibold text-slate-800">{fmt(tiles.length)}</span> customers</span>
          <span><span className="font-semibold text-slate-800">{fmt(data.summary.with_orders)}</span> with orders</span>
          <span><span className="font-semibold text-slate-800">{fmt(data.summary.branded_skus)}</span> branded SKUs</span>
          <span className="ml-auto hidden items-center gap-3 text-[11px] md:inline-flex" data-testid="csd-legend">
            <span className="inline-flex items-center gap-1 text-slate-500"><span className="h-2 w-2 rounded-full bg-rose-700" /> cannot cover next order</span>
            <span className="inline-flex items-center gap-1 text-slate-500"><span className="h-2 w-2 rounded-full bg-emerald-700" /> covered</span>
          </span>
          <span className="inline-flex items-center gap-1.5 text-slate-500"><Package className="h-3.5 w-3.5" /> <span className="font-semibold text-slate-800">{fmtCrates(data.summary.stock_crates)}</span> crates in hand</span>
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
