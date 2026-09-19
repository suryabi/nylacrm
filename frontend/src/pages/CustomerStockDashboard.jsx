import React, { useCallback, useEffect, useMemo, useState } from 'react';
import axios from 'axios';
import { toast } from 'sonner';
import { AlertTriangle, Check, ChevronsUpDown, FileSpreadsheet, Layers, Loader2, Package, RefreshCw, Search, Store, Users, X } from 'lucide-react';
import { Button } from '../components/ui/button';
import { Popover, PopoverContent, PopoverTrigger } from '../components/ui/popover';
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from '../components/ui/command';
import { Input } from '../components/ui/input';
import { BrandGroupTile } from '../components/stock/BrandGroupTile';
import { CustomerTile } from '../components/stock/CustomerTile';
import { fmt, fmtCrates } from '../components/stock/tileBits';

const API_URL = process.env.REACT_APP_BACKEND_URL;
const HEAD = () => ({ Authorization: `Bearer ${localStorage.getItem('token')}` });

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

  const needle = q.trim().toLowerCase();
  // Brand Group tiles roll up their members; members are hidden from the customer grid.
  const groups = useMemo(() => {
    const list = data?.groups || [];
    return needle ? list.filter((g) => (g.name || '').toLowerCase().includes(needle) || g.members.some((m) => (m.account_name || '').toLowerCase().includes(needle))) : list;
  }, [data, needle]);
  const tiles = useMemo(() => {
    const shown = new Set((data?.groups || []).map((g) => g.group_id));
    const list = (data?.tiles || []).filter((t) => !(t.brand_group_ids || []).some((id) => shown.has(id)));
    return needle ? list.filter((t) => (t.account_name || '').toLowerCase().includes(needle) || (t.city || '').toLowerCase().includes(needle)) : list;
  }, [data, needle]);

  return (
    <div className="space-y-5" style={{ fontFamily: 'Helvetica, "Helvetica Neue", Arial, sans-serif' }} data-testid="customer-stock-dashboard">
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
        <div className="flex flex-wrap items-center gap-x-5 gap-y-2 rounded-xl border border-slate-200/80 bg-white px-4 py-3 text-sm text-slate-500 shadow-sm" data-testid="csd-summary">
          {data.summary.low_stock > 0 && <span className="inline-flex items-center gap-1.5 rounded-full bg-rose-700 px-2.5 py-1 text-xs font-semibold text-white" data-testid="csd-low-stock-count"><AlertTriangle className="h-3.5 w-3.5" /> {fmt(data.summary.low_stock)} reorder</span>}
          <span><span className="font-semibold text-slate-800">{fmt(tiles.length)}</span> customers</span>
          {groups.length > 0 && <span data-testid="csd-groups-count"><span className="font-semibold text-slate-800">{fmt(groups.length)}</span> brand groups <span className="text-slate-400">({fmt(groups.reduce((n, g) => n + g.members.length, 0))} members)</span></span>}
          <span><span className="font-semibold text-slate-800">{fmt(data.summary.with_orders)}</span> ordering</span>
          <span><span className="font-semibold text-slate-800">{fmt(data.summary.branded_skus)}</span> branded SKUs</span>
          <span className="inline-flex items-center gap-1.5"><Package className="h-3.5 w-3.5" /> <span className="font-semibold text-slate-800">{fmtCrates(data.summary.stock_crates)}</span> cr in hand</span>
          <span className="ml-auto hidden items-center gap-3 text-xs md:inline-flex" data-testid="csd-legend">
            <span className="inline-flex items-center gap-1"><span className="h-2 w-2 rounded-full bg-rose-700" /> short</span>
            <span className="inline-flex items-center gap-1"><span className="h-2 w-2 rounded-full bg-emerald-700" /> covered</span>
          </span>
        </div>
      )}

      {groups.length > 0 && (
        <section className="space-y-3" data-testid="csd-groups-section">
          <div className="flex items-center gap-2 text-xs font-medium uppercase tracking-wide text-violet-700"><Layers className="h-4 w-4" /> Brand Groups <span className="font-normal normal-case tracking-normal text-slate-400">· shared stock &amp; members&apos; orders</span></div>
          <div className="grid grid-cols-1 gap-5 xl:grid-cols-2" data-testid="csd-groups-grid">
            {groups.map((g) => <BrandGroupTile key={g.group_id} group={g} />)}
          </div>
          {tiles.length > 0 && <div className="pt-2 text-xs font-medium uppercase tracking-wide text-slate-500">Customers</div>}
        </section>
      )}

      {loading && !data ? (
        <div className="flex items-center justify-center py-20 text-slate-500"><Loader2 className="mr-2 h-5 w-5 animate-spin" /> Loading customers…</div>
      ) : tiles.length === 0 && groups.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-slate-300 py-16 text-center text-sm text-slate-500" data-testid="csd-empty">No customers match the current filters.</div>
      ) : tiles.length === 0 ? null : (
        <div className="grid grid-cols-1 gap-5 xl:grid-cols-2" data-testid="csd-grid">
          {tiles.map((t) => <CustomerTile key={t.account_id} tile={t} />)}
        </div>
      )}
    </div>
  );
}
