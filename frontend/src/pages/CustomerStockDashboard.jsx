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
      <span className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">{label}</span>
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button variant="outline" role="combobox" aria-expanded={open} className="h-10 w-72 justify-between font-normal" data-testid={`${testId}-trigger`}>
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
        <PopoverContent className="w-72 p-0" align="start">
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

const URGENCY = {
  red: { text: 'text-red-600', label: (d) => (d < 0 ? `${Math.abs(d)}d overdue` : d === 0 ? 'today' : `in ${d}d`) },
  amber: { text: 'text-yellow-600', label: (d) => `in ${d}d` },
  green: { text: 'text-emerald-600', label: (d) => `in ${d}d` },
};

const CustomerTile = ({ tile }) => {
  const hasOrder = tile.last_order_date != null;
  const noStock = tile.child_skus.length === 0;
  const initials = (tile.account_name || '?').split(/\s+/).slice(0, 2).map((w) => w[0]).join('').toUpperCase();
  const urg = URGENCY[tile.next_order_urgency];
  return (
    <div className={`group relative flex flex-col rounded-2xl border bg-white p-5 shadow-sm transition-[transform,box-shadow] duration-200 hover:-translate-y-0.5 hover:shadow-lg hover:shadow-slate-200/60 ${tile.priority ? 'border-red-300 ring-1 ring-red-200' : 'border-slate-200/80'}`} data-testid={`customer-tile-${tile.account_id}`} data-priority={tile.priority ? 'true' : 'false'}>
      {tile.priority && (
        <span className="absolute -top-2.5 right-4 inline-flex items-center gap-1 rounded-full bg-red-600 px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wide text-white shadow-sm" data-testid={`priority-badge-${tile.account_id}`}>
          <AlertTriangle className="h-3 w-3" /> Reorder now
        </span>
      )}
      <div className="flex items-start gap-3 border-b border-slate-100 pb-4">
        <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-[#002FA7]/10 text-sm font-extrabold text-[#002FA7]">{initials}</div>
        <div className="min-w-0">
          <h3 className="truncate text-lg font-extrabold tracking-tight text-slate-900" title={tile.account_name} data-testid={`customer-name-${tile.account_id}`}>{tile.account_name}</h3>
          <p className="truncate text-xs text-slate-500">{[tile.city, tile.category].filter(Boolean).join(' · ') || tile.account_code || '\u00a0'}</p>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4 py-4">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">Last Order Quantity</p>
          <p className="mt-1 text-2xl font-extrabold tabular-nums text-slate-900" data-testid={`last-order-qty-${tile.account_id}`}>{hasOrder ? fmt(tile.last_order_quantity) : '\u2014'}</p>
          {hasOrder && <p className="mt-0.5 truncate text-[11px] text-slate-400">{tile.last_order_number}{tile.last_order_distributor ? ` \u00b7 ${tile.last_order_distributor}` : ''}</p>}
        </div>
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">Last Order Date</p>
          <p className="mt-1 text-lg font-bold text-slate-800" data-testid={`last-order-date-${tile.account_id}`}>{fmtDate(tile.last_order_date)}</p>
        </div>
        <div className="col-span-2 flex items-center justify-between rounded-lg border border-slate-100 px-3 py-2">
          <span className="inline-flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider text-slate-400"><CalendarClock className="h-3.5 w-3.5" /> Expected Next Order</span>
          {urg ? (
            <span className="text-right" data-testid={`next-order-date-${tile.account_id}`} data-urgency={tile.next_order_urgency}>
              <span className={`block text-base font-extrabold ${urg.text}`}>{fmtDate(tile.expected_next_order_date)}</span>
              <span className={`block text-[11px] font-semibold ${urg.text}`} title={tile.interval_basis}>{urg.label(tile.next_order_in_days)} · every ~{tile.order_interval_days}d</span>
            </span>
          ) : <span className="text-base font-bold text-slate-300" data-testid={`next-order-date-${tile.account_id}`}>{'\u2014'}</span>}
        </div>
      </div>

      <div className={`mt-auto rounded-xl p-4 ${tile.low_stock ? 'bg-red-50' : 'bg-slate-50'}`}>
        <div className="flex items-center justify-between">
          <p className={`text-[11px] font-semibold uppercase tracking-wider ${tile.low_stock ? 'text-red-700' : 'text-[#002FA7]'}`}>Stock in Hand</p>
          {tile.low_stock && <span className="rounded-full bg-red-600 px-2 py-0.5 text-[10px] font-bold text-white" data-testid={`low-stock-badge-${tile.account_id}`}>Low stock · below last order {fmt(tile.last_order_quantity)}</span>}
        </div>
        {noStock ? (
          <p className="mt-2 text-sm font-medium text-slate-400" data-testid={`stock-none-${tile.account_id}`}>No branded SKU for this customer</p>
        ) : (
          <ul className="mt-2 space-y-3">
            {tile.child_skus.map((s) => (
              <li key={s.child_sku_id} className="flex items-center justify-between gap-3" data-testid={`stock-sku-${s.child_sku_id}`}>
                <span className="min-w-0">
                  <span className="block truncate text-sm font-semibold text-slate-800" title={s.child_sku_name}>{s.child_sku_name}</span>
                  {s.warehouses.length > 0 && <span className="block truncate text-[11px] text-slate-400">{s.warehouses.map((w) => `${w.location_name} ${fmt(w.quantity)}`).join(' \u00b7 ')}</span>}
                </span>
                <span className={`shrink-0 text-3xl font-extrabold tabular-nums tracking-tight ${tile.low_stock ? 'text-red-600' : s.stock_in_hand > 0 ? 'text-[#002FA7]' : 'text-slate-300'}`} data-testid={`stock-qty-${s.child_sku_id}`}>{fmt(s.stock_in_hand)}</span>
              </li>
            ))}
            {tile.child_skus.length > 1 && (
              <li className="flex items-center justify-between border-t border-slate-200 pt-2 text-sm font-bold text-slate-700">
                <span>Total</span><span className={`text-xl tabular-nums ${tile.low_stock ? 'text-red-600' : 'text-[#002FA7]'}`} data-testid={`stock-total-${tile.account_id}`}>{fmt(tile.stock_in_hand)}</span>
              </li>
            )}
          </ul>
        )}
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
    <div className="space-y-6" data-testid="customer-stock-dashboard">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 md:text-3xl">Customer Stock Dashboard</h1>
          <p className="mt-1 text-sm text-slate-500">Last Stock-Out order, expected next order and branded stock in hand per customer. Customers low on stock with an order due within 7 days are listed first, then everyone A → Z.</p>
        </div>
        <div className="flex flex-wrap items-end gap-3">
          <AutoComplete label="Distributor" icon={Store} options={data?.filters?.distributors || []} value={distributorId} onChange={(v) => { setDistributorId(v); setAccountId(''); }} placeholder="All distributors" testId="csd-distributor" />
          <AutoComplete label="Account" icon={Users} options={data?.filters?.accounts || []} value={accountId} onChange={setAccountId} placeholder="All accounts" testId="csd-account" />
          <div className="flex flex-col gap-1">
            <span className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">Quick find</span>
            <div className="relative">
              <Search className="absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
              <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Type a customer name" className="h-10 w-56 pl-8" data-testid="csd-quick-find" />
            </div>
          </div>
          <Button variant="outline" size="icon" className="h-10 w-10" onClick={fetchData} disabled={loading} data-testid="csd-refresh"><RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} /></Button>
          <Button variant="outline" className="h-10" onClick={exportExcel} disabled={exporting || !data} data-testid="csd-export-btn">
            {exporting ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> : <FileSpreadsheet className="mr-1.5 h-4 w-4 text-emerald-600" />} Excel
          </Button>
        </div>
      </div>

      {data && (
        <div className="flex flex-wrap items-center gap-x-6 gap-y-2 text-sm text-slate-500" data-testid="csd-summary">
          <span><span className="font-bold text-slate-900">{fmt(tiles.length)}</span> customers</span>
          <span><span className="font-bold text-slate-900">{fmt(data.summary.with_orders)}</span> with orders</span>
          <span><span className="font-bold text-slate-900">{fmt(data.summary.branded_skus)}</span> branded SKUs</span>
          {data.summary.low_stock > 0 && <span className="font-semibold text-red-600" data-testid="csd-low-stock-count">{fmt(data.summary.low_stock)} low stock</span>}
          {data.summary.due_soon > 0 && <span className="font-semibold text-red-600" data-testid="csd-due-soon-count">{fmt(data.summary.due_soon)} orders due ≤ 7 days</span>}
          <span className="ml-auto hidden items-center gap-3 text-[11px] font-medium md:inline-flex" data-testid="csd-legend">
            <span className="inline-flex items-center gap-1"><span className="h-2 w-2 rounded-full bg-red-600" /> ≤ 7 days</span>
            <span className="inline-flex items-center gap-1"><span className="h-2 w-2 rounded-full bg-yellow-500" /> ≤ 10 days</span>
            <span className="inline-flex items-center gap-1"><span className="h-2 w-2 rounded-full bg-emerald-600" /> later</span>
          </span>
          <span className="inline-flex items-center gap-1.5 rounded-full bg-[#002FA7]/10 px-3 py-1 font-semibold text-[#002FA7]"><Package className="h-3.5 w-3.5" /> {fmt(data.summary.stock_in_hand)} units in hand</span>
        </div>
      )}

      {loading && !data ? (
        <div className="flex items-center justify-center py-20 text-slate-500"><Loader2 className="mr-2 h-5 w-5 animate-spin" /> Loading customers…</div>
      ) : tiles.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-slate-300 py-16 text-center text-sm text-slate-500" data-testid="csd-empty">No customers match the current filters.</div>
      ) : (
        <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4" data-testid="csd-grid">
          {tiles.map((t) => <CustomerTile key={t.account_id} tile={t} />)}
        </div>
      )}
    </div>
  );
}
