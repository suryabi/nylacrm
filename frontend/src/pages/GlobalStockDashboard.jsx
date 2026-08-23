import React, { useEffect, useMemo, useState, useCallback } from 'react';
import axios from 'axios';
import { toast } from 'sonner';
import { Card, CardContent } from '../components/ui/card';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Badge } from '../components/ui/badge';
import { getTerm } from '../context/TenantConfigContext';
import {
  Globe, RefreshCw, Search, ChevronDown, ChevronRight, Factory, Warehouse,
  Boxes, Truck, Clock, PackageCheck, Loader2, ArrowDownToLine, Recycle,
  PackageX, Undo2, CheckCircle2, FileSpreadsheet, Scale,
} from 'lucide-react';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '../components/ui/dialog';
import { useAuth } from '../context/AuthContext';

const API_URL = process.env.REACT_APP_BACKEND_URL;
const HEAD = () => ({ Authorization: `Bearer ${localStorage.getItem('token')}` });

const METRIC_DEFS = [
  { key: 'received', label: 'Received', icon: ArrowDownToLine, color: 'text-blue-700', bg: 'bg-blue-50 border-blue-200', tip: 'Stock received: shipments + inbound transfers + production stock' },
  { key: 'delivered', label: 'Delivered', icon: PackageCheck, color: 'text-emerald-700', bg: 'bg-emerald-50 border-emerald-200', tip: 'Delivered to customer accounts (Stock Out orders completed)' },
  { key: 'reserved', label: 'Reserved', icon: Clock, color: 'text-amber-700', bg: 'bg-amber-50 border-amber-200', tip: 'Committed to open Stock Out orders — not available for other orders' },
  { key: 'sent', label: 'Transfer Out', icon: Truck, color: 'text-purple-700', bg: 'bg-purple-50 border-purple-200', tip: 'Stock transferred OUT to other warehouses (not customer deliveries)' },
  { key: 'empty_bottles', label: () => `Empty ${getTerm('unit', { plural: true })}`, icon: Recycle, color: 'text-teal-700', bg: 'bg-teal-50 border-teal-200', tip: 'Empty / Reusable + FOC units returned for recycling' },
  { key: 'product_returns', label: 'Product Ret.', icon: PackageX, color: 'text-orange-700', bg: 'bg-orange-50 border-orange-200', tip: 'Damaged + Expired — unsellable product returned by customers' },
  { key: 'factory_returns', label: () => `${getTerm('factory')} Ret.`, icon: Undo2, color: 'text-violet-700', bg: 'bg-violet-50 border-violet-200', tip: 'Stock sent back to the factory' },
  { key: 'on_hand', label: 'Wh. Stock', icon: Boxes, color: 'text-cyan-700', bg: 'bg-cyan-50 border-cyan-200', tip: 'Current physical stock at the warehouse' },
  { key: 'available', label: 'Available', icon: CheckCircle2, color: 'text-indigo-700', bg: 'bg-indigo-50 border-indigo-200', tip: 'Available = Wh. Stock − Reserved (deliverable right now)' },
];

const WH_HEADER_KEYS = ['received', 'delivered', 'on_hand', 'available'];

const fmt = (v) => (v == null ? '—' : Number(v).toLocaleString('en-IN'));

export default function GlobalStockDashboard() {
  const [loading, setLoading] = useState(true);
  const [data, setData] = useState(null);
  const [unit, setUnit] = useState('crates'); // 'crates' | 'units'
  const [search, setSearch] = useState('');
  const [openWh, setOpenWh] = useState({});
  const [openSku, setOpenSku] = useState({});
  const [exporting, setExporting] = useState(false);
  const { user } = useAuth();
  const isAdmin = ['CEO', 'Director', 'Admin', 'admin', 'ceo', 'director'].includes((user?.role || '').trim());
  const [showRealign, setShowRealign] = useState(false);
  const [realignScan, setRealignScan] = useState(null);
  const [realignBusy, setRealignBusy] = useState(false);
  const [realigningSku, setRealigningSku] = useState(null);
  const [realignDists, setRealignDists] = useState([]);
  const [realignDistId, setRealignDistId] = useState('');
  const [realignView, setRealignView] = useState('drift'); // 'drift' | 'history'
  const [realignHistory, setRealignHistory] = useState(null);
  const [includeBranding, setIncludeBranding] = useState(true);

  const fetchRealignDists = useCallback(async () => {
    try {
      const res = await axios.get(`${API_URL}/api/distributors?page_size=100`, { headers: HEAD() });
      setRealignDists(res.data.distributors || []);
    } catch (e) { /* noop */ }
  }, []);

  const fetchRealignHistory = useCallback(async (distId) => {
    try {
      const res = await axios.post(`${API_URL}/api/distributor/stock-child-realign/history`,
        { distributor_id: distId || null }, { headers: HEAD() });
      setRealignHistory(res.data.logs || []);
    } catch (e) { setRealignHistory([]); }
  }, []);

  const runRealign = useCallback(async (apply, scope = null, distId = null, inclBranding = null) => {
    const distributorId = distId || realignDistId;
    const withBranding = inclBranding == null ? includeBranding : inclBranding;
    if (!distributorId) return;
    if (scope) setRealigningSku(`${scope.location_id}|${scope.sku_id}`); else setRealignBusy(true);
    try {
      const res = await axios.post(
        `${API_URL}/api/distributor/stock-child-realign`,
        { apply, location_id: scope?.location_id || null, sku_id: scope?.sku_id || null, distributor_id: distributorId, include_branding: withBranding },
        { headers: HEAD() }
      );
      if (apply) {
        toast.success(`Realigned ${res.data.realigned} SKU(s) — totals unchanged, split corrected`);
        const r2 = await axios.post(`${API_URL}/api/distributor/stock-child-realign`,
          { apply: false, distributor_id: distributorId, include_branding: withBranding }, { headers: HEAD() });
        setRealignScan(r2.data);
        fetchRealignHistory(distributorId);
        fetchData();
      } else {
        setRealignScan(res.data);
        if (res.data.skus_with_drift === 0) toast.info('No child-split drift found for this distributor');
      }
    } catch (e) {
      toast.error(e.response?.data?.detail || 'Reconciliation failed');
    } finally {
      setRealignBusy(false);
      setRealigningSku(null);
    }
  }, [realignDistId, includeBranding]); // eslint-disable-line react-hooks/exhaustive-deps

  const runRealignUndo = useCallback(async (logIds = null) => {
    if (!realignDistId) return;
    setRealignBusy(true);
    try {
      const res = await axios.post(`${API_URL}/api/distributor/stock-child-realign/undo`,
        { log_ids: logIds, distributor_id: realignDistId }, { headers: HEAD() });
      toast.success(`Reverted ${res.data.reverted} realignment(s) — original split restored`);
      await fetchRealignHistory(realignDistId);
      const r2 = await axios.post(`${API_URL}/api/distributor/stock-child-realign`,
        { apply: false, distributor_id: realignDistId }, { headers: HEAD() });
      setRealignScan(r2.data);
      fetchData();
    } catch (e) {
      toast.error(e.response?.data?.detail || 'Undo failed');
    } finally {
      setRealignBusy(false);
    }
  }, [realignDistId]); // eslint-disable-line react-hooks/exhaustive-deps

  const exportExcel = useCallback(async () => {
    setExporting(true);
    try {
      const res = await axios.get(
        `${API_URL}/api/distributor/global-stock-dashboard/export?unit=${unit}`,
        { headers: HEAD(), responseType: 'blob' }
      );
      const url = URL.createObjectURL(res.data);
      const a = document.createElement('a');
      a.href = url;
      a.download = `global-stock-${unit}-${new Date().toISOString().slice(0, 10)}.xlsx`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
      toast.success('Excel downloaded');
    } catch (e) {
      toast.error('Export failed');
    } finally {
      setExporting(false);
    }
  }, [unit]);

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const res = await axios.get(`${API_URL}/api/distributor/global-stock-dashboard`, { headers: HEAD() });
      setData(res.data);
      const open = {};
      (res.data.warehouses || []).forEach((w) => { open[w.location_id] = true; });
      setOpenWh(open);
    } catch (e) {
      toast.error('Failed to load global stock dashboard');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchData(); }, [fetchData]);

  const val = useCallback((node, metric) => node?.[`${metric}_${unit}`], [unit]);

  const warehouses = useMemo(() => {
    const list = data?.warehouses || [];
    const q = search.trim().toLowerCase();
    if (!q) return list;
    return list
      .map((w) => {
        const whMatch = (w.location_name || '').toLowerCase().includes(q) ||
          (w.city || '').toLowerCase().includes(q) || (w.owner_name || '').toLowerCase().includes(q);
        if (whMatch) return w;
        const skus = (w.skus || []).filter((s) =>
          (s.sku_name || '').toLowerCase().includes(q) ||
          (s.children || []).some((c) => (c.child_sku_name || '').toLowerCase().includes(q))
        );
        return skus.length ? { ...w, skus } : null;
      })
      .filter(Boolean);
  }, [data, search]);

  if (loading) {
    return <div className="p-10 flex justify-center"><Loader2 className="h-7 w-7 animate-spin text-muted-foreground" /></div>;
  }

  return (
    <div className="p-6 max-w-7xl mx-auto space-y-6" data-testid="global-stock-dashboard">
      {/* Header */}
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold text-slate-800 flex items-center gap-2">
            <Globe className="h-6 w-6 text-emerald-600" /> Global Stock Dashboard
          </h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            All warehouses → SKU → child SKU · quantities in {unit === 'crates' ? getTerm('package', { plural: true, lower: true }) : `units (${getTerm('unit', { plural: true, lower: true })})`}
          </p>
        </div>
        <div className="flex items-center gap-2">
          {/* Unit toggle */}
          <div className="flex rounded-lg border overflow-hidden" data-testid="gsd-unit-toggle">
            <button
              className={`px-3.5 py-1.5 text-sm font-medium transition-colors ${unit === 'crates' ? 'bg-emerald-600 text-white' : 'bg-background hover:bg-muted'}`}
              onClick={() => setUnit('crates')} data-testid="gsd-unit-crates"
            >{getTerm('package', { plural: true })}</button>
            <button
              className={`px-3.5 py-1.5 text-sm font-medium transition-colors ${unit === 'units' ? 'bg-emerald-600 text-white' : 'bg-background hover:bg-muted'}`}
              onClick={() => setUnit('units')} data-testid="gsd-unit-units"
            >Units</button>
          </div>
          {isAdmin && (
            <Button variant="outline" size="sm" onClick={() => { setRealignScan(null); setRealignHistory(null); setRealignDistId(''); setRealignView('drift'); setShowRealign(true); fetchRealignDists(); }} data-testid="gsd-realign-btn">
              <Scale className="h-4 w-4 mr-1.5 text-amber-600" /> Reconcile
            </Button>
          )}
          <Button variant="outline" size="sm" onClick={exportExcel} disabled={exporting} data-testid="gsd-export-btn">
            {exporting
              ? <Loader2 className="h-4 w-4 mr-1.5 animate-spin" />
              : <FileSpreadsheet className="h-4 w-4 mr-1.5 text-emerald-600" />} Export
          </Button>
          <Button variant="outline" size="sm" onClick={fetchData} data-testid="gsd-refresh-btn">
            <RefreshCw className="h-4 w-4 mr-1.5" /> Refresh
          </Button>
        </div>
      </div>

      {/* KPI cards */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
        {METRIC_DEFS.map(({ key, label, icon: Icon, color, bg, tip }) => (
          <Card key={key} className={`border ${bg}`} data-testid={`gsd-kpi-${key}`} title={tip}>
            <CardContent className="pt-4 pb-3">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-xs uppercase tracking-wider text-slate-500">{typeof label === 'function' ? label() : label}</p>
                  <p className={`text-2xl font-bold ${color}`}>{fmt(val(data?.grand_totals, key))}</p>
                  <p className="text-[11px] text-muted-foreground">{unit === 'crates' ? getTerm('package', { plural: true, lower: true }) : getTerm('unit', { plural: true, lower: true })}</p>
                </div>
                <Icon className={`h-8 w-8 ${color} opacity-30`} />
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Search */}
      <div className="relative max-w-md">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
        <Input
          placeholder="Search warehouse, city, SKU or child SKU…"
          value={search} onChange={(e) => setSearch(e.target.value)}
          className="pl-9" data-testid="gsd-search-input"
        />
      </div>

      {/* Warehouse groups */}
      {warehouses.length === 0 && (
        <p className="text-center text-muted-foreground py-10">No stock data found{search ? ` for "${search}"` : ''}.</p>
      )}
      <div className="space-y-4">
        {warehouses.map((w) => {
          const isOpen = openWh[w.location_id] !== false;
          return (
            <Card key={w.location_id} data-testid={`gsd-warehouse-${w.location_id}`}>
              <button
                className="w-full flex items-center justify-between gap-3 px-4 py-3 text-left hover:bg-muted/40 transition-colors"
                onClick={() => setOpenWh((p) => ({ ...p, [w.location_id]: !isOpen }))}
                data-testid={`gsd-warehouse-toggle-${w.location_id}`}
              >
                <div className="flex items-center gap-2.5 min-w-0">
                  {isOpen ? <ChevronDown className="h-4 w-4 shrink-0" /> : <ChevronRight className="h-4 w-4 shrink-0" />}
                  {w.is_factory
                    ? <Factory className="h-4.5 w-4.5 text-slate-500 shrink-0" />
                    : <Warehouse className="h-4.5 w-4.5 text-slate-500 shrink-0" />}
                  <div className="min-w-0">
                    <p className="font-semibold text-slate-800 truncate">{w.location_name}</p>
                    <p className="text-xs text-muted-foreground truncate">
                      {[w.owner_name, w.city].filter(Boolean).join(' · ') || (w.is_factory ? 'Factory' : 'Warehouse')}
                    </p>
                  </div>
                  {w.is_factory && <Badge variant="outline" className="bg-slate-50 shrink-0">Factory</Badge>}
                </div>
                <div className="hidden md:flex items-center gap-5 shrink-0 text-sm">
                  {METRIC_DEFS.filter(({ key }) => WH_HEADER_KEYS.includes(key)).map(({ key, label, color }) => (
                    <div key={key} className="text-right min-w-[72px]">
                      <p className="text-[10px] uppercase tracking-wider text-slate-400">{typeof label === 'function' ? label() : label}</p>
                      <p className={`font-semibold ${color}`}>{fmt(val(w.totals, key))}</p>
                    </div>
                  ))}
                </div>
              </button>

              {isOpen && (
                <CardContent className="pt-0 pb-3 px-3 overflow-x-auto">
                  <table className="w-full text-sm min-w-[900px]">
                    <thead>
                      <tr className="text-[11px] uppercase tracking-wider border-b">
                        <th className="text-left py-2 pl-8 font-medium text-slate-400">SKU / Child SKU</th>
                        {METRIC_DEFS.map(({ key, label, color, tip }) => (
                          <th key={key} className={`text-right py-2 font-semibold ${color} ${key === 'available' ? 'pr-2' : ''}`} title={tip}>{typeof label === 'function' ? label() : label}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {w.skus.map((s) => {
                        const skuKey = `${w.location_id}:${s.sku_id}`;
                        const expandable = (s.children || []).length > 0;
                        const skuOpen = !!openSku[skuKey];
                        return (
                          <React.Fragment key={s.sku_id}>
                            <tr
                              className={`border-b last:border-0 ${expandable ? 'cursor-pointer hover:bg-muted/40' : ''}`}
                              onClick={() => expandable && setOpenSku((p) => ({ ...p, [skuKey]: !skuOpen }))}
                              data-testid={`gsd-sku-row-${w.location_id}-${s.sku_id}`}
                            >
                              <td className="py-2 pl-2">
                                <span className="inline-flex items-center gap-1.5">
                                  {expandable
                                    ? (skuOpen ? <ChevronDown className="h-3.5 w-3.5 text-slate-400" /> : <ChevronRight className="h-3.5 w-3.5 text-slate-400" />)
                                    : <span className="w-3.5" />}
                                  <span className="font-medium text-slate-700">{s.sku_name}</span>
                                  {expandable && (
                                    <Badge variant="outline" className="text-[10px] px-1.5 py-0 bg-indigo-50 text-indigo-600 border-indigo-200">
                                      {s.children.length} child
                                    </Badge>
                                  )}
                                </span>
                              </td>
                              {METRIC_DEFS.map(({ key, color }) => (
                                <td key={key} className={`py-2 text-right ${color} ${key === 'available' ? 'pr-2 font-bold' : key === 'on_hand' ? 'font-semibold' : ''}`}>
                                  {fmt(val(s.totals, key))}
                                </td>
                              ))}
                            </tr>
                            {skuOpen && s.children.map((c) => (
                              <tr key={c.child_sku_id || 'generic'} className="border-b last:border-0 bg-muted/20"
                                data-testid={`gsd-child-row-${w.location_id}-${s.sku_id}-${c.child_sku_id || 'generic'}`}>
                                <td className="py-1.5 pl-12 text-slate-600">
                                  <span className="text-xs">{c.child_sku_name}</span>
                                </td>
                                {METRIC_DEFS.map(({ key, color }) => (
                                  <td key={key} className={`py-1.5 text-right text-xs ${color} ${key === 'available' ? 'pr-2 font-semibold' : ''}`}>
                                    {fmt(val(c, key))}
                                  </td>
                                ))}
                              </tr>
                            ))}
                          </React.Fragment>
                        );
                      })}
                    </tbody>
                  </table>
                </CardContent>
              )}
            </Card>
          );
        })}
      </div>

      {/* Child-split reconciliation dialog */}
      <Dialog open={showRealign} onOpenChange={setShowRealign}>
        <DialogContent className="max-w-3xl" data-testid="realign-dialog">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Scale className="h-5 w-5 text-amber-600" />
              Reconcile Child-SKU Split
            </DialogTitle>
            <DialogDescription>
              Rebuilds each SKU's branding split from the transaction history for <b>one distributor at a time</b>.
              The SKU total never changes — only the distribution across brandings. Every applied
              realignment is logged and can be reversed from the History tab.
            </DialogDescription>
          </DialogHeader>
          <div className="flex items-center gap-2 border-b pb-2 flex-wrap">
            <select
              className="h-8 text-sm border rounded-md px-2 bg-white min-w-[220px]"
              value={realignDistId}
              onChange={(e) => {
                const v = e.target.value;
                setRealignDistId(v);
                setRealignScan(null);
                setRealignHistory(null);
                if (v) { runRealign(false, null, v); fetchRealignHistory(v); }
              }}
              data-testid="realign-dist-select"
            >
              <option value="">Select distributor…</option>
              {realignDists.map((d) => (
                <option key={d.id} value={d.id}>{d.distributor_name || d.name || d.id}</option>
              ))}
            </select>
            <Button size="sm" variant={realignView === 'drift' ? 'secondary' : 'ghost'} className="h-7 text-xs"
              onClick={() => setRealignView('drift')} data-testid="realign-tab-drift">Drift</Button>
            <Button size="sm" variant={realignView === 'history' ? 'secondary' : 'ghost'} className="h-7 text-xs"
              onClick={() => setRealignView('history')} data-testid="realign-tab-history">History (undo)</Button>
            <label className="flex items-center gap-1.5 text-xs text-slate-600 ml-auto cursor-pointer select-none" data-testid="realign-branding-toggle">
              <input
                type="checkbox"
                checked={includeBranding}
                onChange={(e) => {
                  setIncludeBranding(e.target.checked);
                  if (realignDistId) runRealign(false, null, realignDistId, e.target.checked);
                }}
              />
              Count branding conversions
            </label>
          </div>
          {!realignDistId ? (
            <div className="text-center py-8 text-muted-foreground text-sm" data-testid="realign-pick-dist">
              Pick a distributor to scan its warehouses.
            </div>
          ) : realignView === 'history' ? (
            realignHistory == null ? (
              <div className="flex items-center justify-center py-10">
                <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
              </div>
            ) : realignHistory.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground" data-testid="realign-history-empty">
                <p className="font-medium text-slate-700">No realignments applied yet</p>
                <p className="text-sm">Nothing to undo for this distributor.</p>
              </div>
            ) : (
              <div className="max-h-80 overflow-y-auto space-y-2 pr-1">
                {realignHistory.map((l, i) => (
                  <div key={l.id} className={`border rounded-md px-3 py-2 flex items-start gap-3 ${l.reverted_at ? 'opacity-60' : ''}`} data-testid={`realign-log-${i}`}>
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-medium">{l.sku_name} <span className="text-xs text-slate-500">@ {l.location_name}</span></div>
                      <div className="text-xs text-slate-500">
                        {(l.changes || []).map((c) => `${c.child_sku_name} ${c.delta > 0 ? '+' : ''}${c.delta}`).join(' · ')}
                      </div>
                      <div className="text-[10px] text-slate-400">
                        {String(l.applied_at).slice(0, 16).replace('T', ' ')} by {l.applied_by_name}
                        {l.reverted_at ? ` — REVERTED ${String(l.reverted_at).slice(0, 16).replace('T', ' ')}` : ''}
                      </div>
                    </div>
                    {!l.reverted_at && (
                      <Button size="sm" variant="outline"
                        className="h-7 text-xs border-rose-300 text-rose-700 hover:bg-rose-50 shrink-0"
                        disabled={realignBusy}
                        onClick={() => runRealignUndo([l.id])}
                        data-testid={`realign-undo-${i}`}
                      >Undo</Button>
                    )}
                  </div>
                ))}
              </div>
            )
          ) : realignBusy && !realignScan ? (
            <div className="flex items-center justify-center py-10">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          ) : realignScan ? (
            realignScan.skus_with_drift === 0 ? (
              <div className="text-center py-8 text-muted-foreground" data-testid="realign-no-drift">
                <CheckCircle2 className="h-10 w-10 mx-auto mb-3 text-emerald-500" />
                <p className="font-medium text-slate-700">No drift found</p>
                <p className="text-sm">Every SKU's child split matches its transaction history.</p>
              </div>
            ) : (
              <div className="space-y-3">
                <div className={`text-sm font-medium ${realignScan.dry_run ? 'text-amber-700' : 'text-emerald-700'}`} data-testid="realign-summary">
                  {realignScan.dry_run
                    ? `Preview: ${realignScan.skus_with_drift} SKU(s) have a drifted split. Nothing changed yet.`
                    : `Done: ${realignScan.realigned} SKU(s) realigned.`}
                </div>
                <div className="max-h-80 overflow-y-auto space-y-3 pr-1">
                  {(realignScan.findings || []).map((f, i) => (
                    <div key={i} className="border rounded-md" data-testid={`realign-finding-${i}`}>
                      <div className="flex items-center gap-2 px-3 py-2 bg-slate-50 border-b">
                        <span className="text-sm font-semibold">{f.sku_name}</span>
                        <span className="text-xs text-slate-500">@ {f.location_name}</span>
                        <Badge variant="outline" className="text-[10px]">total {Number(f.total).toLocaleString('en-IN')} stays unchanged</Badge>
                        {realignScan.dry_run && (
                          <Button
                            size="sm" variant="outline"
                            className="ml-auto h-7 text-xs border-emerald-300 text-emerald-700 hover:bg-emerald-50"
                            disabled={realignBusy || realigningSku != null}
                            onClick={() => runRealign(true, { location_id: f.location_id, sku_id: f.sku_id })}
                            data-testid={`realign-sku-${i}`}
                          >
                            {realigningSku === `${f.location_id}|${f.sku_id}` ? <Loader2 className="h-3 w-3 animate-spin" /> : 'Realign'}
                          </Button>
                        )}
                      </div>
                      <table className="w-full text-sm">
                        <tbody>
                          {f.children.map((c, j) => (
                            <tr key={j} className="border-t first:border-t-0">
                              <td className="px-3 py-1.5">
                                {c.child_sku_name}
                                {c.reserved > 0 && <span className="ml-2 text-[10px] text-amber-600 font-medium">reserved {Number(c.reserved).toLocaleString('en-IN')}</span>}
                                <span className="block text-[10px] text-slate-400">
                                  {['received', 'delivered', 'transfer_out', 'factory_returns', 'branding']
                                    .filter((k) => (c.flows?.[k] || 0) !== 0)
                                    .map((k) => `${{ received: 'rec', delivered: 'del', transfer_out: 'xfer', factory_returns: 'fact.ret', branding: 'brand' }[k]} ${c.flows[k] > 0 && k === 'branding' ? '+' : ''}${Number(c.flows[k]).toLocaleString('en-IN')}`)
                                    .join(' · ') || 'no transactions'}
                                </span>
                              </td>
                              <td className="px-3 py-1.5 text-right text-slate-500">{Number(c.actual).toLocaleString('en-IN')}</td>
                              <td className="px-2 py-1.5 text-center text-slate-400">→</td>
                              <td className="px-3 py-1.5 text-right font-medium">{Number(c.target).toLocaleString('en-IN')}</td>
                              <td className={`px-3 py-1.5 text-right text-xs font-medium ${c.delta > 0 ? 'text-emerald-600' : c.delta < 0 ? 'text-rose-600' : 'text-slate-400'}`}>
                                {c.delta > 0 ? `+${c.delta}` : c.delta}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  ))}
                </div>
              </div>
            )
          ) : null}
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowRealign(false)} data-testid="realign-close-btn">Close</Button>
            {realignView === 'history' && realignDistId && (realignHistory || []).some((l) => !l.reverted_at) && (
              <Button
                variant="outline"
                className="border-rose-300 text-rose-700 hover:bg-rose-50"
                disabled={realignBusy}
                onClick={() => runRealignUndo(null)}
                data-testid="realign-undo-all-btn"
              >
                {realignBusy ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Undo2 className="h-4 w-4 mr-2" />}
                Undo All
              </Button>
            )}
            {realignView === 'drift' && realignDistId && realignScan?.dry_run && realignScan.skus_with_drift > 0 && (
              <Button
                className="bg-amber-600 hover:bg-amber-700"
                disabled={realignBusy || realigningSku != null}
                onClick={() => runRealign(true)}
                data-testid="realign-all-btn"
              >
                {realignBusy ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Scale className="h-4 w-4 mr-2" />}
                Realign All
              </Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
