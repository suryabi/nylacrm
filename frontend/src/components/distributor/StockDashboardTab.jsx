import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '../ui/card';
import { Badge } from '../ui/badge';
import { Button } from '../ui/button';
import {
  RefreshCw, Package, Truck, RotateCcw, Factory, AlertTriangle,
  TrendingUp, Clock, Droplets, ChevronDown, ChevronRight, BarChart3
} from 'lucide-react';

const fmt = (v) => (v || 0).toLocaleString('en-IN');
const pct = (v) => `${(v || 0).toFixed(1)}%`;

export default function StockDashboardTab({ distributor, API_URL, token }) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [expandedSku, setExpandedSku] = useState({});

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

  return (
    <div className="space-y-6" data-testid="stock-dashboard">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold flex items-center gap-2">
            <BarChart3 className="h-5 w-5 text-indigo-600" />
            Stock Dashboard
          </h2>
          <p className="text-sm text-muted-foreground">Real-time inventory across all SKUs</p>
        </div>
        <Button variant="outline" size="sm" onClick={fetchDashboard} disabled={loading} data-testid="refresh-stock-dashboard">
          <RefreshCw className={`h-4 w-4 mr-2 ${loading ? 'animate-spin' : ''}`} />
          Refresh
        </Button>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3" data-testid="stock-summary-cards">
        <SummaryCard
          label="Stock Received"
          value={fmt(t.stock_received)}
          icon={<Package className="h-4 w-4" />}
          color="blue"
          testId="total-stock-received"
        />
        <SummaryCard
          label="Delivered to Customers"
          value={fmt(t.stock_delivered)}
          icon={<Truck className="h-4 w-4" />}
          color="emerald"
          testId="total-stock-delivered"
        />
        <SummaryCard
          label="Customer Returns"
          value={fmt(t.customer_returns)}
          icon={<RotateCcw className="h-4 w-4" />}
          color="amber"
          testId="total-customer-returns"
        />
        <SummaryCard
          label="Factory Returns"
          value={fmt(t.factory_returns)}
          icon={<Factory className="h-4 w-4" />}
          color="purple"
          testId="total-factory-returns"
        />
        <SummaryCard
          label="Stock at Hand"
          value={fmt(t.stock_at_hand)}
          icon={<Droplets className="h-4 w-4" />}
          color="indigo"
          sub={pct(t.pct_stock_at_hand)}
          testId="total-stock-at-hand"
        />
        <SummaryCard
          label="SKUs Tracked"
          value={data.sku_count}
          icon={<BarChart3 className="h-4 w-4" />}
          color="slate"
          testId="sku-count"
        />
      </div>

      {/* Bottle Tracking */}
      <Card data-testid="bottle-tracking-card">
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <AlertTriangle className="h-4 w-4 text-amber-500" />
            Bottle Tracking (Customer Returns)
          </CardTitle>
          <CardDescription>Breakdown of returned bottles by category</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <BottleCard label="Empty / Reusable" value={bt.empty_reusable} color="emerald" />
            <BottleCard label="Damaged" value={bt.damaged} color="red" />
            <BottleCard label="Expired" value={bt.expired} color="amber" />
            <BottleCard label="Pending Factory Return" value={bt.pending_factory_return} color="purple" highlight />
          </div>
        </CardContent>
      </Card>

      {/* SKU-wise Stock Table */}
      <Card data-testid="sku-stock-table">
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <Package className="h-4 w-4 text-blue-600" />
            Stock by SKU
          </CardTitle>
          <CardDescription>Complete inventory picture per product</CardDescription>
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
                    <span className="text-amber-600">Cust. Returns</span>
                  </th>
                  <th className="text-right p-3">
                    <span className="text-purple-600">Factory Ret.</span>
                  </th>
                  <th className="text-right p-3">
                    <span className="text-indigo-700 font-bold">At Hand</span>
                  </th>
                  <th className="text-right p-3">% At Hand</th>
                  <th className="text-right p-3">
                    <span className="text-teal-600">Wkly Avg</span>
                  </th>
                  <th className="text-right p-3">Days Left</th>
                </tr>
              </thead>
              <tbody>
                {skus.map((sku, i) => {
                  const isExpanded = expandedSku[sku.sku_id];
                  const hasReturns = sku.customer_returns > 0 || sku.factory_returns > 0;
                  const lowStock = sku.days_of_stock !== null && sku.days_of_stock <= 7;
                  return (
                    <React.Fragment key={sku.sku_id}>
                      <tr
                        className={`border-b transition-colors ${hasReturns ? 'cursor-pointer hover:bg-slate-50' : ''} ${lowStock ? 'bg-red-50/40' : i % 2 === 1 ? 'bg-slate-50/30' : ''}`}
                        onClick={() => hasReturns && toggleSku(sku.sku_id)}
                        data-testid={`sku-row-${sku.sku_id}`}
                      >
                        <td className="p-3 pl-4">
                          <div className="flex items-center gap-2">
                            {hasReturns ? (
                              isExpanded ? <ChevronDown className="h-3.5 w-3.5 text-slate-400" /> : <ChevronRight className="h-3.5 w-3.5 text-slate-400" />
                            ) : <div className="w-3.5" />}
                            <div>
                              <p className="font-medium text-slate-800">{sku.sku_name}</p>
                              {sku.pending_factory_return > 0 && (
                                <span className="text-[10px] text-purple-600 font-medium">{sku.pending_factory_return} pending factory return</span>
                              )}
                            </div>
                          </div>
                        </td>
                        <td className="p-3 text-right text-blue-600 font-medium">{fmt(sku.stock_received)}</td>
                        <td className="p-3 text-right text-emerald-600 font-medium">{fmt(sku.stock_delivered)}</td>
                        <td className={`p-3 text-right font-medium ${sku.customer_returns > 0 ? 'text-amber-600' : 'text-slate-300'}`}>
                          {sku.customer_returns > 0 ? fmt(sku.customer_returns) : '-'}
                        </td>
                        <td className={`p-3 text-right font-medium ${sku.factory_returns > 0 ? 'text-purple-600' : 'text-slate-300'}`}>
                          {sku.factory_returns > 0 ? fmt(sku.factory_returns) : '-'}
                        </td>
                        <td className="p-3 text-right">
                          <span className={`font-bold ${sku.stock_at_hand < 0 ? 'text-red-600' : sku.stock_at_hand === 0 ? 'text-slate-400' : 'text-indigo-700'}`}>
                            {fmt(sku.stock_at_hand)}
                          </span>
                        </td>
                        <td className="p-3 text-right">
                          <StockBar value={sku.pct_stock_at_hand} />
                        </td>
                        <td className="p-3 text-right text-teal-600 font-medium">
                          {sku.weekly_avg_deliveries > 0 ? fmt(sku.weekly_avg_deliveries) : '-'}
                          {sku.weeks_analyzed > 0 && <span className="text-[10px] text-slate-400 ml-1">/{sku.weeks_analyzed}w</span>}
                        </td>
                        <td className="p-3 text-right">
                          {sku.days_of_stock !== null ? (
                            <Badge className={`text-xs ${sku.days_of_stock <= 7 ? 'bg-red-100 text-red-700' : sku.days_of_stock <= 14 ? 'bg-amber-100 text-amber-700' : 'bg-emerald-100 text-emerald-700'}`}>
                              {sku.days_of_stock}d
                            </Badge>
                          ) : (
                            <span className="text-slate-300">-</span>
                          )}
                        </td>
                      </tr>
                      {isExpanded && hasReturns && (
                        <tr>
                          <td colSpan={9} className="p-0">
                            <div className="bg-slate-50/80 border-b px-6 py-3 grid grid-cols-2 gap-4">
                              {/* Customer Returns Breakdown */}
                              {sku.customer_returns > 0 && (
                                <div>
                                  <p className="text-xs text-amber-600 font-semibold uppercase tracking-wider mb-2">Customer Returns Breakdown</p>
                                  <div className="grid grid-cols-2 gap-2 text-xs">
                                    {sku.customer_returns_breakdown.empty_reusable > 0 && (
                                      <div className="flex justify-between bg-emerald-50 rounded px-2 py-1">
                                        <span className="text-emerald-700">Empty/Reusable</span>
                                        <span className="font-semibold text-emerald-800">{fmt(sku.customer_returns_breakdown.empty_reusable)}</span>
                                      </div>
                                    )}
                                    {sku.customer_returns_breakdown.damaged > 0 && (
                                      <div className="flex justify-between bg-red-50 rounded px-2 py-1">
                                        <span className="text-red-700">Damaged</span>
                                        <span className="font-semibold text-red-800">{fmt(sku.customer_returns_breakdown.damaged)}</span>
                                      </div>
                                    )}
                                    {sku.customer_returns_breakdown.expired > 0 && (
                                      <div className="flex justify-between bg-amber-50 rounded px-2 py-1">
                                        <span className="text-amber-700">Expired</span>
                                        <span className="font-semibold text-amber-800">{fmt(sku.customer_returns_breakdown.expired)}</span>
                                      </div>
                                    )}
                                    {sku.customer_returns_breakdown.promotional > 0 && (
                                      <div className="flex justify-between bg-slate-100 rounded px-2 py-1">
                                        <span className="text-slate-700">Promotional</span>
                                        <span className="font-semibold text-slate-800">{fmt(sku.customer_returns_breakdown.promotional)}</span>
                                      </div>
                                    )}
                                  </div>
                                </div>
                              )}
                              {/* Factory Returns Breakdown */}
                              {sku.factory_returns > 0 && (
                                <div>
                                  <p className="text-xs text-purple-600 font-semibold uppercase tracking-wider mb-2">Factory Returns Breakdown</p>
                                  <div className="grid grid-cols-2 gap-2 text-xs">
                                    {sku.factory_returns_breakdown.empty_reusable > 0 && (
                                      <div className="flex justify-between bg-emerald-50 rounded px-2 py-1">
                                        <span className="text-emerald-700">Empty/Reusable</span>
                                        <span className="font-semibold text-emerald-800">{fmt(sku.factory_returns_breakdown.empty_reusable)}</span>
                                      </div>
                                    )}
                                    {sku.factory_returns_breakdown.damaged > 0 && (
                                      <div className="flex justify-between bg-red-50 rounded px-2 py-1">
                                        <span className="text-red-700">Damaged</span>
                                        <span className="font-semibold text-red-800">{fmt(sku.factory_returns_breakdown.damaged)}</span>
                                      </div>
                                    )}
                                    {sku.factory_returns_breakdown.expired > 0 && (
                                      <div className="flex justify-between bg-amber-50 rounded px-2 py-1">
                                        <span className="text-amber-700">Expired</span>
                                        <span className="font-semibold text-amber-800">{fmt(sku.factory_returns_breakdown.expired)}</span>
                                      </div>
                                    )}
                                  </div>
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
                    <td colSpan={9} className="text-center py-8 text-muted-foreground">
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
                    <td className="p-3 text-right text-amber-700">{fmt(t.customer_returns)}</td>
                    <td className="p-3 text-right text-purple-700">{fmt(t.factory_returns)}</td>
                    <td className="p-3 text-right text-indigo-800 text-base">{fmt(t.stock_at_hand)}</td>
                    <td className="p-3 text-right">{pct(t.pct_stock_at_hand)}</td>
                    <td className="p-3 text-right" colSpan={2}></td>
                  </tr>
                </tfoot>
              )}
            </table>
          </div>
        </CardContent>
      </Card>
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
