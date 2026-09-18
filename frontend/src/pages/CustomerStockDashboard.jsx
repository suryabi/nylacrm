import React, { useCallback, useEffect, useMemo, useState } from 'react';
import axios from 'axios';
import { toast } from 'sonner';
import { Check, ChevronsUpDown, Loader2, Package, RefreshCw, Search, Store, Users, X } from 'lucide-react';
import { Button } from '../components/ui/button';
import { Badge } from '../components/ui/badge';
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

const CustomerTile = ({ tile }) => {
  const hasOrder = tile.last_order_date != null;
  const noStock = tile.child_skus.length === 0;
  return (
    <div className="group relative flex flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm transition-transform duration-200 hover:-translate-y-0.5 hover:shadow-md" data-testid={`customer-tile-${tile.account_id}`}>
      <div className="relative bg-slate-900 px-4 py-3 text-white">
        <div className="absolute inset-y-0 left-0 w-1.5 bg-cyan-400" />
        <h3 className="truncate pl-2 text-base font-extrabold tracking-tight md:text-lg" title={tile.account_name} data-testid={`customer-name-${tile.account_id}`}>{tile.account_name}</h3>
        <p className="pl-2 text-[11px] text-slate-300 truncate">{[tile.city, tile.category].filter(Boolean).join(' · ') || tile.account_code || ''}</p>
      </div>
      <div className="grid grid-cols-2 gap-px bg-slate-100 text-sm">
        <div className="bg-white p-3">
          <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-500">Last Order Quantity</p>
          <p className="mt-0.5 text-xl font-bold text-slate-900" data-testid={`last-order-qty-${tile.account_id}`}>{hasOrder ? fmt(tile.last_order_quantity) : '—'}</p>
          {hasOrder && <p className="text-[10px] text-slate-400 truncate">{tile.last_order_number}{tile.last_order_distributor ? ` · ${tile.last_order_distributor}` : ''}</p>}
        </div>
        <div className="bg-white p-3">
          <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-500">Last Order Date</p>
          <p className="mt-0.5 text-base font-semibold text-slate-800" data-testid={`last-order-date-${tile.account_id}`}>{fmtDate(tile.last_order_date)}</p>
        </div>
      </div>
      <div className="flex-1 border-t border-slate-100 bg-gradient-to-b from-cyan-50/60 to-white p-3">
        <p className="text-[10px] font-semibold uppercase tracking-wider text-cyan-800">Stock in Hand</p>
        {noStock ? (
          <p className="mt-1 text-sm text-slate-400" data-testid={`stock-none-${tile.account_id}`}>No branded SKU for this customer</p>
        ) : (
          <ul className="mt-1 space-y-1.5">
            {tile.child_skus.map((s) => (
              <li key={s.child_sku_id} className="flex items-center justify-between gap-2" data-testid={`stock-sku-${s.child_sku_id}`}>
                <span className="min-w-0">
                  <span className="block truncate text-xs font-medium text-slate-700" title={s.child_sku_name}>{s.child_sku_name}</span>
                  {s.warehouses.length > 0 && <span className="block truncate text-[10px] text-slate-400">{s.warehouses.map((w) => `${w.location_name} ${fmt(w.quantity)}`).join(' · ')}</span>}
                </span>
                <span className={`shrink-0 rounded-lg px-2 py-0.5 font-mono text-lg font-extrabold ${s.stock_in_hand > 0 ? 'bg-cyan-600 text-white' : 'bg-slate-100 text-slate-400'}`} data-testid={`stock-qty-${s.child_sku_id}`}>{fmt(s.stock_in_hand)}</span>
              </li>
            ))}
            {tile.child_skus.length > 1 && (
              <li className="flex items-center justify-between border-t border-cyan-100 pt-1.5 text-xs font-semibold text-cyan-900">
                <span>Total</span><span className="font-mono text-base" data-testid={`stock-total-${tile.account_id}`}>{fmt(tile.stock_in_hand)}</span>
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
          <p className="mt-1 text-sm text-slate-500">Last Stock-Out order and branded stock in hand, per customer (A → Z).</p>
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
        </div>
      </div>

      {data && (
        <div className="flex flex-wrap gap-2" data-testid="csd-summary">
          <Badge variant="outline" className="bg-white">{fmt(tiles.length)} customers</Badge>
          <Badge variant="outline" className="bg-white">{fmt(data.summary.with_orders)} with orders</Badge>
          <Badge variant="outline" className="bg-white">{fmt(data.summary.branded_skus)} branded SKUs</Badge>
          <Badge className="bg-cyan-600 text-white hover:bg-cyan-600"><Package className="mr-1 h-3 w-3" /> {fmt(data.summary.stock_in_hand)} units in hand</Badge>
        </div>
      )}

      {loading && !data ? (
        <div className="flex items-center justify-center py-20 text-slate-500"><Loader2 className="mr-2 h-5 w-5 animate-spin" /> Loading customers…</div>
      ) : tiles.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-slate-300 py-16 text-center text-sm text-slate-500" data-testid="csd-empty">No customers match the current filters.</div>
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4" data-testid="csd-grid">
          {tiles.map((t) => <CustomerTile key={t.account_id} tile={t} />)}
        </div>
      )}
    </div>
  );
}
