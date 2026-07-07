import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '../ui/card';
import { Badge } from '../ui/badge';
import { Button } from '../ui/button';
import {
  RefreshCw, Package, Truck, RotateCcw, Factory,
  TrendingUp, Clock, Droplets, ChevronDown, ChevronRight, BarChart3, Lock
} from 'lucide-react';
import { toast } from 'sonner';
import { useAuth } from '../../context/AuthContext';

const fmt = (v) => (v || 0).toLocaleString('en-IN');

// Convert a bottle quantity into the SKU's default packaging (e.g. "144.8 Crate - 12").
// Returns null when the SKU has no multi-unit default packaging.
const pkgEquiv = (bottles, sku) => {
  const u = Number(sku?.default_packaging_units) || 0;
  if (u > 1 && bottles) {
    const n = bottles / u;
    const disp = Number.isInteger(n) ? n : Number(n.toFixed(1));
    return `${disp.toLocaleString('en-IN')} ${sku.default_packaging_name || 'pkg'}`;
  }
  return null;
};
const pct = (v) => `${(v || 0).toFixed(1)}%`;

/**
 * Factory Warehouse SKU row with optional "N batches" disclosure.
 * Renders a single consolidated line; if the SKU is sourced from more than
 * one batch, the user can click the row to expand a small inset table with
 * batch code, age and units — FIFO ordered so the oldest batch is first
 * (warehouse teams can immediately see what to ship next).
 */
function FactoryWarehouseSkuRow({ sku, fmt: format }) {
  const batches = sku.batches || [];
  const hasBatches = batches.length > 0;
  const [open, setOpen] = useState(false);
  const ageDays = (iso) => {
    if (!iso) return null;
    const t = Date.parse(iso.length === 10 ? `${iso}T00:00:00Z` : iso);
    if (Number.isNaN(t)) return null;
    return Math.max(0, Math.floor((Date.now() - t) / 86400000));
  };
  const chipFor = (days) => {
    if (days == null) return 'text-slate-600 bg-slate-100 border-slate-200';
    if (days < 30) return 'text-emerald-700 bg-emerald-100 border-emerald-200';
    if (days < 60) return 'text-amber-700 bg-amber-100 border-amber-200';
    return 'text-rose-700 bg-rose-100 border-rose-200';
  };

  return (
    <div className="rounded bg-white/60 overflow-hidden" data-testid={`fw-sku-row-${sku.sku_id}`}>
      <button
        type="button"
        onClick={() => hasBatches && setOpen(o => !o)}
        className={`w-full flex items-center justify-between text-sm px-2 py-1.5 text-left transition-colors ${hasBatches ? 'cursor-pointer hover:bg-teal-50/70' : 'cursor-default'}`}
        disabled={!hasBatches}
        data-testid={`fw-sku-toggle-${sku.sku_id}`}
      >
        <div className="flex items-center gap-1.5 min-w-0">
          {hasBatches && (
            <ChevronRight
              className={`h-3.5 w-3.5 text-teal-600 flex-shrink-0 transition-transform ${open ? 'rotate-90' : ''}`}
            />
          )}
          <span className="text-slate-700 truncate">{sku.sku_name}</span>
        </div>
        <div className="flex items-baseline gap-2 flex-shrink-0">
          <span className="font-bold text-teal-700">{format(sku.quantity)} units</span>
          {hasBatches && (
            <span className="text-[10px] font-medium text-teal-600/80 bg-teal-50 border border-teal-200 rounded px-1.5 py-0.5">
              {batches.length} batch{batches.length === 1 ? '' : 'es'}
            </span>
          )}
        </div>
      </button>
      {hasBatches && open && (
        <div className="border-t border-teal-100 bg-teal-50/40 px-2 py-1.5" data-testid={`fw-sku-batches-${sku.sku_id}`}>
          <div className="text-[10px] font-semibold text-teal-700 uppercase tracking-wider mb-1 flex items-center justify-between">
            <span>Per-batch breakdown · FIFO</span>
            <span className="text-teal-600/70 normal-case">{format(sku.quantity)} units total</span>
          </div>
          <div className="space-y-0.5">
            {batches.map((b, bi) => {
              const dateIso = b.production_date || b.received_at;
              const days = ageDays(dateIso);
              const ageLabel = days == null ? 'Age unknown' : (days === 0 ? 'Today' : `${days}d old`);
              return (
                <div key={b.batch_id || `legacy-${bi}`} className="flex items-center justify-between text-[12px] px-1.5 py-1 rounded hover:bg-white/80">
                  <div className="flex items-center gap-1.5 min-w-0">
                    <span className={`text-[9px] font-semibold uppercase tracking-wider px-1 py-0.5 rounded border ${chipFor(days)}`}>
                      {ageLabel}
                    </span>
                    <span className="font-mono text-slate-700 text-[11px] truncate">{b.batch_code}</span>
                    {dateIso && (
                      <span className="text-[10px] text-slate-400">
                        {b.production_date ? 'Prod' : 'Recv'} {String(dateIso).slice(0, 10)}
                      </span>
                    )}
                  </div>
                  <span className="font-semibold text-teal-700 tabular-nums">{format(b.quantity)}</span>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

export default function StockDashboardTab({ distributor, API_URL, token }) {
  const { user } = useAuth();
  const isElevated = ['ceo', 'system admin'].includes((user?.role || '').trim().toLowerCase());

  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [expandedSku, setExpandedSku] = useState({});
  const [unitView, setUnitView] = useState('bottles'); // 'bottles' | 'crates'
  // Reset stock dialog state — CEO / System Admin only
  const [resetOpen, setResetOpen] = useState(false);
  const [resetMode, setResetMode] = useState('zero'); // 'zero' | 'purge'
  const [resetWh, setResetWh] = useState(''); // warehouse_location_id; '' = ALL
  const [resetBusy, setResetBusy] = useState(false);

  const fetchDashboard = async () => {
    if (!distributor?.id) return;
    setLoading(true);
    try {
      const authToken = token || localStorage.getItem('token');
      const tenantId = localStorage.getItem('selectedTenant') || localStorage.getItem('tenant_id') || 'nyla-air-water';
      const res = await fetch(
        `${API_URL}/api/distributors/${distributor.id}/stock-dashboard`,
        { headers: { 'Authorization': `Bearer ${authToken}`, 'X-Tenant-ID': tenantId } }
      );
      if (res.ok) setData(await res.json());
    } catch (e) {
      console.error('Failed to fetch stock dashboard:', e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchDashboard(); }, [distributor?.id]);

  const toggleSku = (id) => setExpandedSku(prev => ({ ...prev, [id]: !prev[id] }));

  const handleResetStock = async () => {
    setResetBusy(true);
    try {
      const authToken = token || localStorage.getItem('token');
      const tenantId = localStorage.getItem('selectedTenant') || localStorage.getItem('tenant_id') || 'nyla-air-water';
      const res = await fetch(`${API_URL}/api/production/factory-warehouse-stock/reset`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${authToken}`,
          'X-Tenant-ID': tenantId,
        },
        body: JSON.stringify({
          mode: resetMode,
          warehouse_location_id: resetWh || null,
        }),
      });
      const payload = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(payload?.detail || 'Failed to reset stock');
      toast.success(
        resetMode === 'purge'
          ? `Stock rows purged (${payload.affected_rows} rows)`
          : `Stock set to zero (${payload.affected_rows} rows)`
      );
      setResetOpen(false);
      fetchDashboard();
    } catch (e) {
      toast.error(e.message || 'Failed to reset stock');
    } finally {
      setResetBusy(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <RefreshCw className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!data) {
    return (
      <div className="text-center py-20 text-muted-foreground">
        <Package className="h-12 w-12 mx-auto mb-4 opacity-40" />
        <p>No stock data available</p>
      </div>
    );
  }

  const t = data.totals || {};
  const bt = data.bottle_tracking || {};
  const skus = data.skus || [];

  // Stock-by-SKU unit view: show each quantity either in the SKU's base unit
  // (bottles) or converted to that SKU's own default crate. The crate size is
  // shown per row so the divisor is never ambiguous.
  const viewCrates = unitView === 'crates';
  const cellVal = (bottles, sku) => {
    const b = Number(bottles) || 0;
    if (!viewCrates) return fmt(b);
    const u = Number(sku?.default_packaging_units) || 0;
    if (u > 1) {
      const n = b / u;
      return (Number.isInteger(n) ? n : Number(n.toFixed(1))).toLocaleString('en-IN');
    }
    return fmt(b); // no multi-unit crate defined → keep base units
  };
  const availSub = (sku) => {
    const b = Number(sku.stock_at_hand) || 0;
    if (!viewCrates) return pkgEquiv(sku.stock_at_hand, sku); // ≈ default crates
    return b ? `${fmt(b)} ${sku.base_unit_name || 'units'}` : null; // ≈ base units
  };

  return (
    <div className="space-y-6" data-testid="stock-dashboard">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold flex items-center gap-2">
            <BarChart3 className="h-5 w-5 text-indigo-600" />
            Stock Dashboard
          </h2>
          <p className="text-sm text-muted-foreground">Real-time inventory across all SKUs · quantities shown in each SKU's base unit (UOM)</p>
        </div>
        <Button variant="outline" size="sm" onClick={fetchDashboard} disabled={loading} data-testid="refresh-stock-dashboard">
          <RefreshCw className={`h-4 w-4 mr-2 ${loading ? 'animate-spin' : ''}`} />
          Refresh
        </Button>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 xl:grid-cols-8 gap-3" data-testid="stock-summary-cards">
        <SummaryCard
          label="Stock Received"
          value={fmt(t.stock_received)}
          icon={<Package className="h-4 w-4" />}
          color="blue"
          testId="total-stock-received"
        />
        <SummaryCard
          label="Delivered / Consumed"
          value={fmt(t.stock_delivered)}
          icon={<Truck className="h-4 w-4" />}
          color="emerald"
          sub="Permanently delivered out"
          testId="total-stock-delivered"
        />
        <SummaryCard
          label="On-hand"
          value={fmt(t.stock_on_hand ?? t.stock_at_hand)}
          icon={<Package className="h-4 w-4" />}
          color="slate"
          sub="Physical balance"
          testId="total-stock-on-hand"
        />
        <SummaryCard
          label="Reserved Stock"
          value={fmt(t.stock_reserved ?? t.stock_pending_out ?? 0)}
          icon={<Lock className="h-4 w-4" />}
          color="amber"
          sub="Committed to open orders"
          testId="total-stock-reserved"
        />
        <SummaryCard
          label="Empty Bottles"
          value={fmt(t.empty_bottles_returned || 0)}
          icon={<RotateCcw className="h-4 w-4" />}
          color="emerald"
          sub="units · for recycling"
          testId="total-empty-bottles"
        />
        <SummaryCard
          label="Product Returns"
          value={fmt(t.product_returns || 0)}
          icon={<RotateCcw className="h-4 w-4" />}
          color="amber"
          sub="Damaged / expired"
          testId="total-product-returns"
        />
        <SummaryCard
          label="Factory Returns"
          value={fmt(t.factory_returns)}
          icon={<Factory className="h-4 w-4" />}
          color="purple"
          testId="total-factory-returns"
        />
        <SummaryCard
          label="Available"
          value={fmt(t.stock_available ?? t.stock_at_hand)}
          icon={<Droplets className="h-4 w-4" />}
          color="indigo"
          sub="Deliverable now"
          testId="total-stock-available"
        />
        <SummaryCard
          label="SKUs Tracked"
          value={data.sku_count}
          icon={<BarChart3 className="h-4 w-4" />}
          color="slate"
          testId="sku-count"
        />
      </div>

      {/* Factory Warehouse Stock */}
      {(t.factory_warehouse_stock > 0 || (data.factory_warehouses || []).length > 0) && (
        <Card data-testid="factory-warehouse-stock-card">
          <CardHeader className="pb-3">
            <div className="flex items-start justify-between gap-3">
              <div>
                <CardTitle className="text-base flex items-center gap-2">
                  <Factory className="h-4 w-4 text-teal-600" />
                  Factory Warehouse Stock
                  <Badge className="bg-teal-100 text-teal-700 border-teal-200 ml-2" variant="outline">
                    {fmt(t.factory_warehouse_stock)} units total
                  </Badge>
                </CardTitle>
                <CardDescription>Stock transferred from production, available for dispatch</CardDescription>
              </div>
              {isElevated && (data.factory_warehouses || []).length > 0 && (
                <Button
                  variant="outline"
                  size="sm"
                  className="border-rose-200 text-rose-700 hover:bg-rose-50 hover:text-rose-800"
                  onClick={() => { setResetMode('zero'); setResetWh(''); setResetOpen(true); }}
                  data-testid="factory-stock-reset-btn"
                >
                  <RotateCcw className="h-3.5 w-3.5 mr-1.5" /> Reset Stock
                </Button>
              )}
            </div>
          </CardHeader>
          <CardContent>
            {(data.factory_warehouses || []).length > 0 ? (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {data.factory_warehouses.map(wh => (
                  <div key={wh.warehouse_id} className="rounded-lg border border-teal-200 bg-teal-50/30 p-4">
                    <div className="flex items-center gap-2 mb-3">
                      <Factory className="h-4 w-4 text-teal-600" />
                      <h4 className="text-sm font-semibold text-teal-800">{wh.warehouse_name || 'Factory Warehouse'}</h4>
                    </div>
                    <div className="space-y-1.5">
                      {wh.skus.map((s, i) => (
                        <FactoryWarehouseSkuRow key={`${wh.warehouse_id}-${s.sku_id || i}`} sku={s} fmt={fmt} />
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-sm text-slate-400 italic text-center py-4">No stock in factory warehouses</p>
            )}
          </CardContent>
        </Card>
      )}

      {/* Bottle Tracking */}
      <Card data-testid="bottle-tracking-card">
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <RotateCcw className="h-4 w-4 text-emerald-500" />
            Empty Bottles &amp; Returns
          </CardTitle>
          <CardDescription>
            Empty &amp; FOC bottles cycle back for recycling; damaged &amp; expired are unsellable product returned to the factory.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-5">
          <div>
            <p className="text-xs font-semibold text-emerald-700 mb-2 uppercase tracking-wide">Empty bottles (for recycling)</p>
            <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
              <BottleCard label="Empty / Reusable" value={bt.empty_reusable} color="emerald" />
              <BottleCard label="FOC / Promotional" value={bt.promotional} color="emerald" />
            </div>
          </div>
          <div>
            <p className="text-xs font-semibold text-amber-700 mb-2 uppercase tracking-wide">Unsellable product (return to factory)</p>
            <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
              <BottleCard label="Damaged" value={bt.damaged} color="red" />
              <BottleCard label="Expired" value={bt.expired} color="amber" />
              <BottleCard label="Pending Factory Return" value={bt.pending_factory_return} color="purple" highlight />
            </div>
          </div>
        </CardContent>
      </Card>

      {/* SKU-wise Stock Table */}
      <Card data-testid="sku-stock-table">
        <CardHeader className="pb-3">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
            <div>
              <CardTitle className="text-base flex items-center gap-2">
                <Package className="h-4 w-4 text-blue-600" />
                Stock by SKU
              </CardTitle>
              <CardDescription>
                Complete inventory picture per product · showing quantities in{' '}
                <span className="font-semibold text-slate-600">{viewCrates ? 'default crates' : 'base units (bottles)'}</span>
              </CardDescription>
            </div>
            <div className="inline-flex items-center rounded-lg border border-slate-200 bg-slate-50 p-0.5 self-start" data-testid="stock-unit-toggle">
              <button
                type="button"
                onClick={() => setUnitView('bottles')}
                className={`px-3 py-1.5 text-xs font-semibold rounded-md transition-colors ${!viewCrates ? 'bg-white text-blue-700 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}
                data-testid="stock-unit-bottles"
              >
                Bottles
              </button>
              <button
                type="button"
                onClick={() => setUnitView('crates')}
                className={`px-3 py-1.5 text-xs font-semibold rounded-md transition-colors ${viewCrates ? 'bg-white text-blue-700 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}
                data-testid="stock-unit-crates"
              >
                Default Crates
              </button>
            </div>
          </div>
        </CardHeader>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-slate-50 border-b text-xs text-slate-500 uppercase">
                  <th className="text-left p-3 pl-4">SKU</th>
                  <th className="text-right p-3">
                    <span className="text-blue-600">Received</span>
                  </th>
                  <th className="text-right p-3">
                    <span className="text-emerald-600">Delivered</span>
                  </th>
                  <th className="text-right p-3">
                    <span className="text-amber-600" title="Committed to open Stock Out orders (draft → in-transit) — not available for other orders">Reserved</span>
                  </th>
                  <th className="text-right p-3">
                    <span className="text-emerald-600" title="Empty / Reusable + FOC units returned for recycling (counted in raw base units)">Empty Bottles</span>
                  </th>
                  <th className="text-right p-3">
                    <span className="text-amber-600" title="Damaged + Expired — unsellable product">Product Ret.</span>
                  </th>
                  <th className="text-right p-3">
                    <span className="text-purple-600">Factory Ret.</span>
                  </th>
                  <th className="text-right p-3">
                    <span className="text-teal-600">Wh. Stock</span>
                  </th>
                  <th className="text-right p-3">
                    <span className="text-indigo-700 font-bold" title="Available = On-hand − Reserved (deliverable right now)">Available</span>
                  </th>
                  <th className="text-right p-3">% Avail</th>
                  <th className="text-right p-3">
                    <span className="text-teal-600">Wkly Avg</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {skus.map((sku, i) => {
                  const isExpanded = expandedSku[sku.sku_id];
                  const hasReturns = sku.customer_returns > 0 || sku.factory_returns > 0;
                  const batches = sku.factory_warehouse_batches || [];
                  const hasBatches = batches.length > 0;
                  const isExpandable = hasReturns || hasBatches;
                  const lowStock = sku.days_of_stock !== null && sku.days_of_stock <= 7;
                  return (
                    <React.Fragment key={sku.sku_id}>
                      <tr
                        className={`border-b transition-colors ${isExpandable ? 'cursor-pointer hover:bg-slate-50' : ''} ${lowStock ? 'bg-red-50/40' : i % 2 === 1 ? 'bg-slate-50/30' : ''}`}
                        onClick={() => isExpandable && toggleSku(sku.sku_id)}
                        data-testid={`sku-row-${sku.sku_id}`}
                      >
                        <td className="p-3 pl-4">
                          <div className="flex items-center gap-2">
                            {isExpandable ? (
                              isExpanded ? <ChevronDown className="h-3.5 w-3.5 text-slate-400" /> : <ChevronRight className="h-3.5 w-3.5 text-slate-400" />
                            ) : <div className="w-3.5" />}
                            <div>
                              <p className="font-medium text-slate-800">{sku.sku_name}</p>
                              <div className="flex items-center gap-2 flex-wrap mt-0.5">
                                <span className="text-[10px] text-slate-400 font-medium" data-testid={`sku-uom-${sku.sku_id}`}>
                                  in {viewCrates && sku.default_packaging_units > 1 ? sku.default_packaging_name : (sku.base_unit_name || 'units')}
                                  {sku.default_packaging_units > 1 ? ` · 1 ${sku.default_packaging_name} = ${sku.default_packaging_units} ${sku.base_unit_name || 'units'}` : ''}
                                </span>
                                {sku.pending_factory_return > 0 && (
                                  <span className="text-[10px] text-purple-600 font-medium">{sku.pending_factory_return} pending factory return</span>
                                )}
                                {hasBatches && (
                                  <span className="text-[10px] font-medium text-teal-700 bg-teal-50 border border-teal-200 rounded px-1.5 py-0.5" data-testid={`sku-batch-count-${sku.sku_id}`}>
                                    {batches.length} batch{batches.length === 1 ? '' : 'es'}
                                  </span>
                                )}
                              </div>
                            </div>
                          </div>
                        </td>
                        <td className="p-3 text-right text-blue-600 font-medium">{cellVal(sku.stock_received, sku)}</td>
                        <td className="p-3 text-right text-emerald-600 font-medium">{cellVal(sku.stock_delivered, sku)}</td>
                        <td className={`p-3 text-right font-medium ${sku.stock_pending_out > 0 ? 'text-amber-600' : 'text-slate-300'}`} data-testid={`sku-pending-out-${sku.sku_id}`}>
                          {sku.stock_pending_out > 0 ? cellVal(sku.stock_pending_out, sku) : '-'}
                        </td>
                        <td className={`p-3 text-right font-medium ${sku.empty_bottles_returned > 0 ? 'text-emerald-600' : 'text-slate-300'}`} data-testid={`sku-empty-bottles-${sku.sku_id}`}>
                          {sku.empty_bottles_returned > 0 ? cellVal(sku.empty_bottles_returned, sku) : '-'}
                        </td>
                        <td className={`p-3 text-right font-medium ${sku.product_returns > 0 ? 'text-amber-600' : 'text-slate-300'}`} data-testid={`sku-product-returns-${sku.sku_id}`}>
                          {sku.product_returns > 0 ? cellVal(sku.product_returns, sku) : '-'}
                        </td>
                        <td className={`p-3 text-right font-medium ${sku.factory_returns > 0 ? 'text-purple-600' : 'text-slate-300'}`}>
                          {sku.factory_returns > 0 ? cellVal(sku.factory_returns, sku) : '-'}
                        </td>
                        <td className={`p-3 text-right font-medium ${sku.factory_warehouse_stock > 0 ? 'text-teal-600' : 'text-slate-300'}`}>
                          {sku.factory_warehouse_stock > 0 ? cellVal(sku.factory_warehouse_stock, sku) : '-'}
                        </td>
                        <td className="p-3 text-right">
                          <span className={`font-bold ${sku.stock_at_hand < 0 ? 'text-red-600' : sku.stock_at_hand === 0 ? 'text-slate-400' : 'text-indigo-700'}`} data-testid={`sku-available-${sku.sku_id}`}>
                            {cellVal(sku.stock_at_hand, sku)}
                          </span>
                          {availSub(sku) && (
                            <div className="text-[10px] text-slate-400 font-medium" data-testid={`sku-available-pkg-${sku.sku_id}`}>≈ {availSub(sku)}</div>
                          )}
                        </td>
                        <td className="p-3 text-right">
                          <StockBar value={sku.pct_stock_at_hand} />
                        </td>
                        <td className="p-3 text-right text-teal-600 font-medium">
                          {sku.weekly_avg_deliveries > 0 ? cellVal(sku.weekly_avg_deliveries, sku) : '-'}
                          {sku.weeks_analyzed > 0 && <span className="text-[10px] text-slate-400 ml-1">/{sku.weeks_analyzed}w</span>}
                        </td>
                      </tr>
                      {isExpanded && isExpandable && (
                        <tr>
                          <td colSpan={11} className="p-0">
                            <div className="bg-slate-50/80 border-b px-6 py-3 space-y-3">
                              {/* Per-batch breakdown of factory warehouse stock — FIFO */}
                              {hasBatches && (
                                <div className="rounded-lg border border-teal-200 overflow-hidden" data-testid={`sku-batches-${sku.sku_id}`}>
                                  <div className="bg-teal-50 px-3 py-1.5 flex items-center justify-between border-b border-teal-200">
                                    <span className="text-[11px] font-semibold text-teal-700 uppercase tracking-wider">Factory Warehouse Stock · per-batch · FIFO</span>
                                    <span className="text-[11px] font-bold text-teal-800">{fmt(sku.factory_warehouse_stock)} units</span>
                                  </div>
                                  <div className="divide-y divide-slate-100">
                                    {batches.map((b, bi) => {
                                      const iso = b.production_date || b.received_at;
                                      let days = null;
                                      if (iso) {
                                        const t = Date.parse(String(iso).length === 10 ? `${iso}T00:00:00Z` : iso);
                                        if (!Number.isNaN(t)) days = Math.max(0, Math.floor((Date.now() - t) / 86400000));
                                      }
                                      const ageLabel = days == null ? 'Age unknown' : (days === 0 ? 'Today' : `${days}d old`);
                                      const ageCls =
                                        days == null ? 'text-slate-600 bg-slate-100 border-slate-200'
                                        : days < 30 ? 'text-emerald-700 bg-emerald-100 border-emerald-200'
                                        : days < 60 ? 'text-amber-700 bg-amber-100 border-amber-200'
                                        : 'text-rose-700 bg-rose-100 border-rose-200';
                                      return (
                                        <div key={b.batch_id || `legacy-${bi}`} className="flex items-center justify-between px-3 py-1.5 text-xs" data-testid={`sku-batch-${sku.sku_id}-${bi}`}>
                                          <div className="flex items-center gap-2 min-w-0 flex-1">
                                            <span className={`text-[9px] font-semibold uppercase tracking-wider px-1.5 py-0.5 rounded border ${ageCls}`}>
                                              {ageLabel}
                                            </span>
                                            <span className="font-mono font-medium text-slate-800 text-[11px] truncate">{b.batch_code}</span>
                                            {b.warehouse_name && (
                                              <span className="text-[10px] text-slate-500 truncate">· {b.warehouse_name}</span>
                                            )}
                                            {iso && (
                                              <span className="text-[10px] text-slate-400">
                                                · {b.production_date ? 'Prod' : 'Recv'} {String(iso).slice(0, 10)}
                                              </span>
                                            )}
                                          </div>
                                          <span className="font-semibold text-teal-700 tabular-nums">{fmt(b.quantity)} units</span>
                                        </div>
                                      );
                                    })}
                                  </div>
                                </div>
                              )}
                              {/* Returns breakdown (existing) */}
                              {hasReturns && (
                                <div className="grid grid-cols-2 gap-6">
                                {/* Customer Returns Breakdown */}
                                {sku.customer_returns > 0 && (
                                  <div className="rounded-lg border border-amber-200 overflow-hidden">
                                    <div className="bg-amber-50 px-3 py-1.5 flex items-center justify-between border-b border-amber-200">
                                      <span className="text-[11px] font-semibold text-amber-700">Returns (by reason)</span>
                                      <span className="text-[11px] font-bold text-amber-800">{fmt(sku.customer_returns)}</span>
                                    </div>
                                    <div className="divide-y divide-slate-100">
                                      {[
                                        { label: 'Empty / Reusable', val: sku.customer_returns_breakdown.empty_reusable, dot: 'bg-emerald-500' },
                                        { label: 'FOC / Promotional', val: sku.customer_returns_breakdown.promotional, dot: 'bg-emerald-400' },
                                        { label: 'Damaged', val: sku.customer_returns_breakdown.damaged, dot: 'bg-red-500' },
                                        { label: 'Expired', val: sku.customer_returns_breakdown.expired, dot: 'bg-amber-500' },
                                      ].filter(r => r.val > 0).map(r => (
                                        <div key={r.label} className="flex items-center justify-between px-3 py-1.5 text-xs">
                                          <span className="flex items-center gap-1.5 text-slate-600">
                                            <span className={`w-1.5 h-1.5 rounded-full ${r.dot}`} />
                                            {r.label}
                                          </span>
                                          <span className="font-semibold text-slate-800">{fmt(r.val)}</span>
                                        </div>
                                      ))}
                                    </div>
                                  </div>
                                )}
                                {/* Factory Returns Breakdown */}
                                {sku.factory_returns > 0 && (
                                  <div className="rounded-lg border border-purple-200 overflow-hidden">
                                    <div className="bg-purple-50 px-3 py-1.5 flex items-center justify-between border-b border-purple-200">
                                      <span className="text-[11px] font-semibold text-purple-700">Factory Returns</span>
                                      <span className="text-[11px] font-bold text-purple-800">{fmt(sku.factory_returns)}</span>
                                    </div>
                                    <div className="divide-y divide-slate-100">
                                      {[
                                        { label: 'Empty / Reusable', val: sku.factory_returns_breakdown.empty_reusable, dot: 'bg-emerald-500' },
                                        { label: 'Damaged', val: sku.factory_returns_breakdown.damaged, dot: 'bg-red-500' },
                                        { label: 'Expired', val: sku.factory_returns_breakdown.expired, dot: 'bg-amber-500' },
                                      ].filter(r => r.val > 0).map(r => (
                                        <div key={r.label} className="flex items-center justify-between px-3 py-1.5 text-xs">
                                          <span className="flex items-center gap-1.5 text-slate-600">
                                            <span className={`w-1.5 h-1.5 rounded-full ${r.dot}`} />
                                            {r.label}
                                          </span>
                                          <span className="font-semibold text-slate-800">{fmt(r.val)}</span>
                                        </div>
                                      ))}
                                    </div>
                                  </div>
                                )}
                                </div>
                              )}
                            </div>
                          </td>
                        </tr>
                      )}
                    </React.Fragment>
                  );
                })}
                {skus.length === 0 && (
                  <tr>
                    <td colSpan={11} className="text-center py-8 text-muted-foreground">
                      No stock data available for this distributor
                    </td>
                  </tr>
                )}
              </tbody>
              {skus.length > 0 && (
                <tfoot>
                  <tr className="bg-slate-100 border-t-2 font-semibold text-sm">
                    <td className="p-3 pl-4">Total ({data.sku_count} SKUs)</td>
                    <td className="p-3 text-right text-blue-700">{fmt(t.stock_received)}</td>
                    <td className="p-3 text-right text-emerald-700">{fmt(t.stock_delivered)}</td>
                    <td className="p-3 text-right text-amber-700">{fmt(t.stock_pending_out || 0)}</td>
                    <td className="p-3 text-right text-emerald-700">{fmt(t.empty_bottles_returned || 0)}</td>
                    <td className="p-3 text-right text-amber-700">{fmt(t.product_returns || 0)}</td>
                    <td className="p-3 text-right text-purple-700">{fmt(t.factory_returns)}</td>
                    <td className="p-3 text-right text-teal-700">{fmt(t.factory_warehouse_stock)}</td>
                    <td className="p-3 text-right text-indigo-800 text-base">{fmt(t.stock_at_hand)}</td>
                    <td className="p-3 text-right">{pct(t.pct_stock_at_hand)}</td>
                    <td className="p-3 text-right"></td>
                  </tr>
                </tfoot>
              )}
            </table>
          </div>
        </CardContent>
      </Card>

      {/* Reset Factory Warehouse Stock — confirmation dialog (CEO / System Admin) */}
      {resetOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={() => !resetBusy && setResetOpen(false)}>
          <div className="bg-white rounded-xl shadow-2xl w-full max-w-md" onClick={e => e.stopPropagation()} data-testid="factory-stock-reset-dialog">
            <div className="px-5 py-4 border-b border-slate-100 flex items-center gap-2">
              <RotateCcw className="h-5 w-5 text-rose-600" />
              <h3 className="text-base font-semibold text-slate-900">Reset factory warehouse stock</h3>
            </div>
            <div className="px-5 py-4 space-y-4">
              <div className="rounded-md bg-amber-50 border border-amber-200 px-3 py-2 text-xs text-amber-800">
                ⚠ This is a sensitive action. The current quantities are recorded for audit, but operations relying on the live counts will be affected immediately.
              </div>

              <div>
                <label className="text-xs uppercase tracking-wider text-slate-500 font-semibold mb-1.5 block">Scope</label>
                <select
                  value={resetWh}
                  onChange={e => setResetWh(e.target.value)}
                  className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm bg-white"
                  data-testid="factory-stock-reset-scope"
                >
                  <option value="">ALL factory warehouses</option>
                  {(data.factory_warehouses || []).map(wh => (
                    <option key={wh.warehouse_id} value={wh.warehouse_id}>
                      {wh.warehouse_name || 'Factory Warehouse'}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="text-xs uppercase tracking-wider text-slate-500 font-semibold mb-1.5 block">Mode</label>
                <div className="space-y-2">
                  <label className={`flex items-start gap-2 p-2.5 rounded-lg border cursor-pointer ${resetMode === 'zero' ? 'border-rose-300 bg-rose-50' : 'border-slate-200 bg-white hover:bg-slate-50'}`}>
                    <input type="radio" name="reset-mode" value="zero" checked={resetMode === 'zero'} onChange={() => setResetMode('zero')} className="mt-0.5" data-testid="factory-stock-reset-mode-zero" />
                    <div>
                      <div className="text-sm font-medium text-slate-800">Set quantities to zero</div>
                      <div className="text-[11px] text-slate-500">Keeps SKU↔warehouse rows so reports still show every line. Recommended.</div>
                    </div>
                  </label>
                  <label className={`flex items-start gap-2 p-2.5 rounded-lg border cursor-pointer ${resetMode === 'purge' ? 'border-rose-300 bg-rose-50' : 'border-slate-200 bg-white hover:bg-slate-50'}`}>
                    <input type="radio" name="reset-mode" value="purge" checked={resetMode === 'purge'} onChange={() => setResetMode('purge')} className="mt-0.5" data-testid="factory-stock-reset-mode-purge" />
                    <div>
                      <div className="text-sm font-medium text-slate-800">Delete all rows (purge)</div>
                      <div className="text-[11px] text-slate-500">Removes every stock row. New rows will be created when transfers happen.</div>
                    </div>
                  </label>
                </div>
              </div>
            </div>
            <div className="px-5 py-3 border-t border-slate-100 flex justify-end gap-2">
              <Button variant="ghost" onClick={() => setResetOpen(false)} disabled={resetBusy} data-testid="factory-stock-reset-cancel">Cancel</Button>
              <Button
                onClick={handleResetStock}
                disabled={resetBusy}
                className="bg-rose-600 hover:bg-rose-700 text-white"
                data-testid="factory-stock-reset-confirm"
              >
                {resetBusy ? (<><RefreshCw className="h-3.5 w-3.5 mr-1.5 animate-spin" /> Resetting…</>) : 'Confirm reset'}
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// --- Sub-components ---

function SummaryCard({ label, value, icon, color, sub, testId }) {
  const colorMap = {
    blue: 'bg-blue-50 border-blue-100 text-blue-600',
    emerald: 'bg-emerald-50 border-emerald-100 text-emerald-600',
    amber: 'bg-amber-50 border-amber-100 text-amber-600',
    purple: 'bg-purple-50 border-purple-100 text-purple-600',
    indigo: 'bg-indigo-50 border-indigo-100 text-indigo-600',
    slate: 'bg-slate-50 border-slate-100 text-slate-600',
  };
  const textColor = {
    blue: 'text-blue-700', emerald: 'text-emerald-700', amber: 'text-amber-700',
    purple: 'text-purple-700', indigo: 'text-indigo-700', slate: 'text-slate-700',
  };
  return (
    <div className={`rounded-xl border p-3 ${colorMap[color]}`} data-testid={testId}>
      <div className="flex items-center gap-1.5 mb-1">{icon}<span className="text-[10px] uppercase tracking-wider font-semibold">{label}</span></div>
      <div className="flex items-baseline gap-1.5">
        <p className={`text-xl font-bold ${textColor[color]}`}>{value}</p>
        {sub && <span className="text-xs font-medium opacity-70">{sub}</span>}
      </div>
    </div>
  );
}

function BottleCard({ label, value, color, highlight }) {
  const bgMap = { emerald: 'bg-emerald-50 border-emerald-200', red: 'bg-red-50 border-red-200', amber: 'bg-amber-50 border-amber-200', purple: 'bg-purple-50 border-purple-200' };
  const textMap = { emerald: 'text-emerald-700', red: 'text-red-700', amber: 'text-amber-700', purple: 'text-purple-700' };
  return (
    <div className={`rounded-lg border p-3 ${bgMap[color]} ${highlight ? 'ring-2 ring-purple-300' : ''}`}>
      <p className={`text-xs font-medium ${textMap[color]} mb-1`}>{label}</p>
      <p className={`text-2xl font-bold ${textMap[color]}`}>{fmt(value)}</p>
    </div>
  );
}

function StockBar({ value }) {
  const v = Math.min(Math.max(value || 0, 0), 100);
  const color = v <= 20 ? 'bg-red-500' : v <= 50 ? 'bg-amber-500' : 'bg-emerald-500';
  return (
    <div className="flex items-center gap-2 justify-end">
      <div className="w-16 h-2 bg-slate-200 rounded-full overflow-hidden">
        <div className={`h-full rounded-full ${color}`} style={{ width: `${v}%` }} />
      </div>
      <span className="text-xs font-medium text-slate-600 w-10 text-right">{pct(value)}</span>
    </div>
  );
}
