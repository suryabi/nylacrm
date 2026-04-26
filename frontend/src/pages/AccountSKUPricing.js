import React, { useEffect, useMemo, useState } from 'react';
import axios from 'axios';
import { useNavigate } from 'react-router-dom';
import { Card } from '../components/ui/card';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '../components/ui/table';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '../components/ui/select';
import { MultiSelect } from '../components/ui/multi-select';
import { Building2, Search, Download, Loader2, Package } from 'lucide-react';
import { toast } from 'sonner';
import AppBreadcrumb from '../components/AppBreadcrumb';
import { useMasterLocations } from '../hooks/useMasterLocations';

export default function AccountSKUPricing() {
  const navigate = useNavigate();
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [accountsCount, setAccountsCount] = useState(0);
  const [cogsBySku, setCogsBySku] = useState({});
  const [exporting, setExporting] = useState(false);

  // Cascading filters (same pattern as Leads)
  const [territoryFilter, setTerritoryFilter] = useState('all');
  const [stateFilter, setStateFilter] = useState('all');
  const [cityFilter, setCityFilter] = useState('all');
  const [assignedToFilter, setAssignedToFilter] = useState([]);
  const [skuFilter, setSkuFilter] = useState('all');

  const {
    territories: masterTerritories,
    getStateNamesByTerritoryName,
    getCityNamesByStateName,
    stateNames: allStates,
    cityNames: allCities,
  } = useMasterLocations();

  const [users, setUsers] = useState([]);

  // Cascaded state/city lists based on current territory/state selection
  const stateOptions = useMemo(() => {
    if (territoryFilter === 'all') return allStates || [];
    return getStateNamesByTerritoryName ? getStateNamesByTerritoryName(territoryFilter) : [];
  }, [territoryFilter, allStates, getStateNamesByTerritoryName]);

  const cityOptions = useMemo(() => {
    if (stateFilter !== 'all') {
      return getCityNamesByStateName ? getCityNamesByStateName(stateFilter) : [];
    }
    if (territoryFilter !== 'all') {
      const stateList = getStateNamesByTerritoryName ? getStateNamesByTerritoryName(territoryFilter) : [];
      const cities = [];
      stateList.forEach((s) => {
        (getCityNamesByStateName ? getCityNamesByStateName(s) : []).forEach((c) => cities.push(c));
      });
      return Array.from(new Set(cities));
    }
    return allCities || [];
  }, [territoryFilter, stateFilter, allStates, allCities, getStateNamesByTerritoryName, getCityNamesByStateName]);

  useEffect(() => {
    fetchUsers();
  }, []);

  useEffect(() => {
    fetchGrid();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [territoryFilter, stateFilter, cityFilter, assignedToFilter]);

  const fetchUsers = async () => {
    try {
      const token = localStorage.getItem('token');
      const { data } = await axios.get(
        `${process.env.REACT_APP_BACKEND_URL}/api/users`,
        { headers: { Authorization: `Bearer ${token}` }, withCredentials: true }
      );
      setUsers(data || []);
    } catch {
      // non-blocking
    }
  };

  const fetchGrid = async () => {
    try {
      setLoading(true);
      const token = localStorage.getItem('token');
      const params = new URLSearchParams();
      if (territoryFilter !== 'all') params.append('territory', territoryFilter);
      if (stateFilter !== 'all') params.append('state', stateFilter);
      if (cityFilter !== 'all') params.append('city', cityFilter);
      if (assignedToFilter.length > 0) params.append('assigned_to', assignedToFilter.join(','));

      const url = `${process.env.REACT_APP_BACKEND_URL}/api/accounts/sku-pricing-grid${params.toString() ? '?' + params.toString() : ''}`;
      const { data } = await axios.get(url, {
        headers: { Authorization: `Bearer ${token}` },
        withCredentials: true,
      });
      setRows(data.rows || []);
      setAccountsCount(data.accounts_count || 0);
      setCogsBySku(data.cogs_by_sku || {});
    } catch (err) {
      console.error(err);
      toast.error('Failed to load account SKU pricing');
    } finally {
      setLoading(false);
    }
  };

  // Reset downstream filters when parent changes
  useEffect(() => {
    if (territoryFilter === 'all') return;
    const allowedStates = getStateNamesByTerritoryName ? getStateNamesByTerritoryName(territoryFilter) : [];
    if (stateFilter !== 'all' && !allowedStates.includes(stateFilter)) setStateFilter('all');
  }, [territoryFilter]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (stateFilter === 'all') return;
    const allowedCities = getCityNamesByStateName ? getCityNamesByStateName(stateFilter) : [];
    if (cityFilter !== 'all' && !allowedCities.includes(cityFilter)) setCityFilter('all');
  }, [stateFilter]); // eslint-disable-line react-hooks/exhaustive-deps

  // Client-side filtering (only SKU dropdown + search remain client-side)
  const skus = useMemo(() => {
    const set = new Set();
    rows.forEach((r) => r.sku_name && set.add(r.sku_name));
    return Array.from(set).sort();
  }, [rows]);

  const filteredRows = useMemo(() => {
    const q = search.trim().toLowerCase();
    return rows.filter((r) => {
      if (skuFilter !== 'all' && r.sku_name !== skuFilter) return false;
      if (!q) return true;
      return (
        (r.account_name || '').toLowerCase().includes(q) ||
        (r.account_code || '').toLowerCase().includes(q) ||
        (r.city || '').toLowerCase().includes(q) ||
        (r.sku_name || '').toLowerCase().includes(q)
      );
    });
  }, [rows, search, skuFilter]);

  // Group consecutive rows by account so we only render the account cell once
  const groupedRows = useMemo(() => {
    const out = [];
    let prevAccountId = null;
    let accountIndex = -1;
    filteredRows.forEach((r, idx) => {
      const sameAsPrev = r.account_id === prevAccountId;
      if (!sameAsPrev) accountIndex += 1;
      out.push({ ...r, _showAccount: !sameAsPrev, _idx: idx, _accountIndex: accountIndex });
      prevAccountId = r.account_id;
    });
    return out;
  }, [filteredRows]);

  // Rows used for top tiles & summary — EXCLUDE accounts marked as not-in-GOP
  const gopRows = useMemo(
    () => filteredRows.filter((r) => r.include_in_gop_metrics !== false),
    [filteredRows]
  );

  // Per-SKU stats: average, min, max price (GOP-eligible rows only)
  const skuAverages = useMemo(() => {
    const agg = {};
    gopRows.forEach((r) => {
      if (!r.sku_name) return;
      const price = Number(r.price_per_unit || 0);
      if (!price) return;
      if (!agg[r.sku_name]) agg[r.sku_name] = { sum: 0, count: 0, min: price, max: price };
      agg[r.sku_name].sum += price;
      agg[r.sku_name].count += 1;
      agg[r.sku_name].min = Math.min(agg[r.sku_name].min, price);
      agg[r.sku_name].max = Math.max(agg[r.sku_name].max, price);
    });
    return Object.entries(agg)
      .map(([name, { sum, count, min, max }]) => ({ name, avg: sum / count, count, min, max }))
      .sort((a, b) => b.avg - a.avg);
  }, [gopRows]);

  const summary = useMemo(() => {
    const uniqueAccounts = new Set(gopRows.map((r) => r.account_id)).size;
    const skuRows = gopRows.filter((r) => r.sku_name);
    const prices = skuRows.map((r) => Number(r.price_per_unit || 0)).filter((x) => x > 0);
    const avg = prices.length ? prices.reduce((a, b) => a + b, 0) / prices.length : 0;
    const excludedAccounts = new Set(
      filteredRows.filter((r) => r.include_in_gop_metrics === false).map((r) => r.account_id)
    ).size;
    const allAccounts = new Set(filteredRows.map((r) => r.account_id)).size;
    const coveragePct = allAccounts > 0 ? Math.round((uniqueAccounts / allAccounts) * 100) : 0;
    return {
      uniqueAccounts,
      totalSkuAssignments: skuRows.length,
      avgPrice: avg,
      excludedAccounts,
      allAccounts,
      coveragePct,
    };
  }, [gopRows, filteredRows]);

  const handleExport = () => {
    try {
      setExporting(true);
      const headers = [
        'Account Code', 'Account Name', 'City', 'State', 'Territory',
        'SKU Name', 'SKU Category', 'HSN Code',
        'Base Price', 'Price Per Unit', 'Return Bottle Credit',
      ];
      const csvRows = [headers.join(',')];
      filteredRows.forEach((r) => {
        const row = [
          r.account_code, r.account_name,
          r.city, r.state, r.territory,
          r.sku_name, r.sku_category, r.hsn_code,
          r.base_price, r.price_per_unit, r.return_bottle_credit,
        ].map((v) => {
          if (v === null || v === undefined) return '';
          const s = String(v);
          return /[,"\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
        });
        csvRows.push(row.join(','));
      });
      const blob = new Blob([csvRows.join('\n')], { type: 'text/csv;charset=utf-8;' });
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      const stamp = new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-');
      link.href = url;
      link.setAttribute('download', `account_sku_pricing_${stamp}.csv`);
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.URL.revokeObjectURL(url);
      toast.success('Exported successfully');
    } finally {
      setExporting(false);
    }
  };

  const userOptions = useMemo(
    () => (users || []).map((u) => ({ value: u.id, label: u.name || u.email })),
    [users]
  );

  return (
    <div className="p-4 sm:p-6 lg:p-8 space-y-6" data-testid="account-sku-pricing-page">
      <AppBreadcrumb />

      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-3">
          <div className="p-2 rounded-lg bg-primary/10">
            <Package className="h-6 w-6 text-primary" />
          </div>
          <div>
            <h1 className="text-xl sm:text-2xl lg:text-3xl font-bold tracking-tight text-slate-800 dark:text-white">
              Account GOP Metrics
            </h1>
            <p className="text-xs sm:text-sm text-muted-foreground">
              {filteredRows.length} rows · {summary.allAccounts} accounts · {accountsCount} total
            </p>
          </div>
        </div>

        <Button
          variant="outline"
          size="sm"
          onClick={handleExport}
          disabled={exporting || loading || filteredRows.length === 0}
          data-testid="export-pricing-button"
          className="gap-2"
        >
          {exporting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
          <span>{exporting ? 'Exporting…' : 'Download CSV'}</span>
        </Button>
      </div>

      {/* GOP Coverage — compact, elegant */}
      {summary.allAccounts > 0 && (() => {
        const tone =
          summary.coveragePct >= 80 ? 'emerald' :
          summary.coveragePct >= 50 ? 'amber' : 'rose';
        const ringSize = 56;
        const stroke = 5;
        const radius = (ringSize - stroke) / 2;
        const circ = 2 * Math.PI * radius;
        const dash = (summary.coveragePct / 100) * circ;
        const ringColor = {
          emerald: 'stroke-emerald-500',
          amber: 'stroke-amber-500',
          rose: 'stroke-rose-500',
        }[tone];
        const textColor = {
          emerald: 'text-emerald-600 dark:text-emerald-400',
          amber: 'text-amber-600 dark:text-amber-400',
          rose: 'text-rose-600 dark:text-rose-400',
        }[tone];
        return (
          <div
            className="flex items-center gap-4 px-4 py-3 rounded-xl border border-slate-200/70 dark:border-slate-700/60 bg-white/60 dark:bg-slate-900/40 backdrop-blur-sm"
            data-testid="gop-coverage-tile"
          >
            {/* Circular ring */}
            <div className="relative shrink-0" style={{ width: ringSize, height: ringSize }}>
              <svg width={ringSize} height={ringSize} className="-rotate-90">
                <circle
                  cx={ringSize / 2}
                  cy={ringSize / 2}
                  r={radius}
                  className="stroke-slate-200/80 dark:stroke-slate-700/60"
                  strokeWidth={stroke}
                  fill="none"
                />
                <circle
                  cx={ringSize / 2}
                  cy={ringSize / 2}
                  r={radius}
                  className={`${ringColor} transition-[stroke-dashoffset] duration-700`}
                  strokeWidth={stroke}
                  strokeLinecap="round"
                  strokeDasharray={circ}
                  strokeDashoffset={circ - dash}
                  fill="none"
                />
              </svg>
              <div className="absolute inset-0 flex items-center justify-center">
                <span
                  className={`text-[11px] font-semibold tabular-nums ${textColor}`}
                  data-testid="gop-coverage-pct"
                >
                  {summary.coveragePct}%
                </span>
              </div>
            </div>

            {/* Body */}
            <div className="flex-1 min-w-0 leading-tight">
              <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
                GOP Coverage
              </p>
              <p className="text-sm text-slate-700 dark:text-slate-200 mt-0.5">
                <span className="font-semibold tabular-nums text-slate-900 dark:text-white" data-testid="gop-coverage-included">
                  {summary.uniqueAccounts}
                </span>
                <span className="text-muted-foreground"> of </span>
                <span className="font-semibold tabular-nums text-slate-900 dark:text-white" data-testid="gop-coverage-total">
                  {summary.allAccounts}
                </span>
                <span className="text-muted-foreground"> accounts in GOP</span>
              </p>
            </div>

            {/* Excluded chip */}
            {summary.excludedAccounts > 0 && (
              <span className="hidden sm:inline-flex items-center gap-1.5 text-xs font-medium px-2.5 py-1 rounded-full bg-amber-50 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400 border border-amber-200/70 dark:border-amber-800/40">
                <span className="h-1.5 w-1.5 rounded-full bg-amber-500" />
                {summary.excludedAccounts} excluded
              </span>
            )}
          </div>
        );
      })()}

      {/* Per-SKU average price tiles */}
      {skuAverages.length > 0 && (
        <div>
          <div className="flex items-center justify-between mb-3">
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-[0.12em]">
              Average price per SKU
            </p>
            <span className="text-[11px] text-muted-foreground">{skuAverages.length} {skuAverages.length === 1 ? 'SKU' : 'SKUs'}</span>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3" data-testid="sku-average-tiles">
            {skuAverages.map((sku, idx) => {
              const gradients = [
                'from-indigo-50 via-indigo-50/50 to-white dark:from-indigo-950/40 dark:via-indigo-950/20 dark:to-slate-900',
                'from-emerald-50 via-emerald-50/50 to-white dark:from-emerald-950/40 dark:via-emerald-950/20 dark:to-slate-900',
                'from-amber-50 via-amber-50/50 to-white dark:from-amber-950/40 dark:via-amber-950/20 dark:to-slate-900',
                'from-sky-50 via-sky-50/50 to-white dark:from-sky-950/40 dark:via-sky-950/20 dark:to-slate-900',
                'from-rose-50 via-rose-50/50 to-white dark:from-rose-950/40 dark:via-rose-950/20 dark:to-slate-900',
                'from-violet-50 via-violet-50/50 to-white dark:from-violet-950/40 dark:via-violet-950/20 dark:to-slate-900',
              ];
              const accents = [
                'text-indigo-600 dark:text-indigo-400 bg-indigo-500/10',
                'text-emerald-600 dark:text-emerald-400 bg-emerald-500/10',
                'text-amber-600 dark:text-amber-400 bg-amber-500/10',
                'text-sky-600 dark:text-sky-400 bg-sky-500/10',
                'text-rose-600 dark:text-rose-400 bg-rose-500/10',
                'text-violet-600 dark:text-violet-400 bg-violet-500/10',
              ];
              const grad = gradients[idx % gradients.length];
              const accent = accents[idx % accents.length];
              const priceSpread = sku.max - sku.min;
              const hasSpread = sku.count > 1 && priceSpread > 0;

              // Gross margin computation from COGS calculator
              const cogsInfo = cogsBySku[sku.name];
              const hasCogs = cogsInfo && cogsInfo.avg_cogs > 0;
              const grossMarginRs = hasCogs ? sku.avg - cogsInfo.avg_cogs : null;
              const grossMarginPct = hasCogs && sku.avg > 0 ? (grossMarginRs / sku.avg) * 100 : null;
              const marginColor = grossMarginPct == null
                ? 'text-muted-foreground'
                : grossMarginPct >= 40
                  ? 'text-emerald-600 dark:text-emerald-400'
                  : grossMarginPct >= 20
                    ? 'text-amber-600 dark:text-amber-400'
                    : 'text-rose-600 dark:text-rose-400';

              return (
                <div
                  key={sku.name}
                  className={`relative group rounded-2xl border border-slate-200/70 dark:border-slate-700/60 bg-gradient-to-br ${grad} p-4 overflow-hidden transition-all hover:-translate-y-0.5 hover:shadow-lg`}
                  data-testid={`sku-tile-${idx}`}
                >
                  {/* Decorative icon */}
                  <div className={`absolute -top-4 -right-4 h-20 w-20 rounded-full ${accent.split(' ').find(c => c.startsWith('bg-'))} blur-2xl opacity-40 transition-opacity group-hover:opacity-60`} />

                  <div className="flex items-start justify-between gap-2 relative">
                    <div className="min-w-0 flex-1">
                      <p className="text-[11px] font-medium text-muted-foreground uppercase tracking-wider">SKU</p>
                      <p className="text-sm font-semibold text-slate-800 dark:text-white mt-0.5 truncate" title={sku.name}>
                        {sku.name}
                      </p>
                    </div>
                    <div className={`shrink-0 h-9 w-9 rounded-xl flex items-center justify-center ${accent}`}>
                      <Package className="h-4 w-4" />
                    </div>
                  </div>

                  <div className="mt-4 relative">
                    <div className="flex items-baseline gap-1.5">
                      <span className="text-[13px] text-muted-foreground">₹</span>
                      <span className="text-3xl font-bold tracking-tight text-slate-900 dark:text-white tabular-nums">
                        {sku.avg.toFixed(2)}
                      </span>
                    </div>
                    <p className="text-[11px] text-muted-foreground mt-0.5">avg. across {sku.count} {sku.count === 1 ? 'account' : 'accounts'}</p>
                  </div>

                  {/* Gross Margin block */}
                  <div className="mt-3 pt-3 border-t border-slate-200/60 dark:border-slate-700/50 relative">
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="text-[11px] text-muted-foreground uppercase tracking-wider">Gross Margin</p>
                        {hasCogs ? (
                          <div className="flex items-baseline gap-1.5 mt-0.5">
                            <span className={`text-lg font-bold tabular-nums ${marginColor}`}>
                              ₹{grossMarginRs.toFixed(2)}
                            </span>
                            <span className={`text-xs font-semibold tabular-nums ${marginColor}`}>
                              ({grossMarginPct.toFixed(1)}%)
                            </span>
                          </div>
                        ) : (
                          <p className="text-xs text-muted-foreground italic mt-0.5">COGS not set</p>
                        )}
                      </div>
                      {hasCogs && (
                        <div className="text-right">
                          <p className="text-[10px] text-muted-foreground uppercase tracking-wider">COGS</p>
                          <p className="text-xs font-semibold text-slate-700 dark:text-slate-300 tabular-nums mt-0.5">
                            ₹{cogsInfo.avg_cogs.toFixed(2)}
                          </p>
                          {cogsInfo.cities_count > 1 && (
                            <p className="text-[10px] text-muted-foreground">avg of {cogsInfo.cities_count} cities</p>
                          )}
                        </div>
                      )}
                    </div>
                  </div>

                  {hasSpread && (
                    <div className="mt-3 pt-3 border-t border-slate-200/60 dark:border-slate-700/50 flex items-center justify-between text-[11px] relative">
                      <div className="flex items-center gap-1.5">
                        <span className="text-muted-foreground">Min</span>
                        <span className="font-semibold text-slate-700 dark:text-slate-200 tabular-nums">₹{sku.min.toFixed(0)}</span>
                      </div>
                      <div className={`px-1.5 py-0.5 rounded-md ${accent} font-medium tabular-nums`}>
                        ±₹{priceSpread.toFixed(0)}
                      </div>
                      <div className="flex items-center gap-1.5">
                        <span className="text-muted-foreground">Max</span>
                        <span className="font-semibold text-slate-700 dark:text-slate-200 tabular-nums">₹{sku.max.toFixed(0)}</span>
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Filters */}
      <Card className="p-4">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-3">
          <div className="relative xl:col-span-1">
            <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search account, SKU, city…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-8"
              data-testid="pricing-search-input"
            />
          </div>

          <Select value={territoryFilter} onValueChange={setTerritoryFilter}>
            <SelectTrigger data-testid="territory-filter"><SelectValue placeholder="Territory" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Territories</SelectItem>
              {(masterTerritories || []).map((t) => (
                <SelectItem key={t.id || t.name} value={t.name}>{t.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Select value={stateFilter} onValueChange={setStateFilter}>
            <SelectTrigger data-testid="state-filter"><SelectValue placeholder="State" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All States</SelectItem>
              {stateOptions.map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}
            </SelectContent>
          </Select>

          <Select value={cityFilter} onValueChange={setCityFilter}>
            <SelectTrigger data-testid="city-filter"><SelectValue placeholder="City" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Cities</SelectItem>
              {cityOptions.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}
            </SelectContent>
          </Select>

          <MultiSelect
            options={userOptions}
            value={assignedToFilter}
            onChange={setAssignedToFilter}
            placeholder="Sales Resource"
            data-testid="resource-filter"
          />

          <Select value={skuFilter} onValueChange={setSkuFilter}>
            <SelectTrigger data-testid="sku-filter"><SelectValue placeholder="SKU" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All SKUs</SelectItem>
              {skus.map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
      </Card>

      {/* Grid */}
      <Card className="overflow-hidden">
        {loading ? (
          <div className="flex items-center justify-center py-16">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        ) : filteredRows.length === 0 ? (
          <div className="p-10 text-center text-muted-foreground">
            <Building2 className="h-10 w-10 mx-auto mb-3 opacity-40" />
            No rows match the current filters.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="min-w-[220px]">Account</TableHead>
                  <TableHead>Location</TableHead>
                  <TableHead className="min-w-[220px]">SKU</TableHead>
                  <TableHead className="text-right">Price / Unit (₹)</TableHead>
                  <TableHead className="text-right">Return Credit (₹)</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {groupedRows.map((r, idx) => {
                  const isOdd = r._accountIndex % 2 === 1;
                  const zebra = isOdd
                    ? 'bg-amber-50/40 dark:bg-amber-950/10 hover:bg-amber-100/60 dark:hover:bg-amber-900/20'
                    : 'bg-white dark:bg-slate-900/30 hover:bg-slate-50 dark:hover:bg-slate-800/40';
                  return (
                  <TableRow
                    key={`${r.account_id}-${r.sku_id || r.sku_name || idx}`}
                    className={`cursor-pointer transition-colors ${zebra} ${
                      r._showAccount && idx > 0 ? 'border-t-2 border-t-amber-200/60 dark:border-t-amber-800/30' : ''
                    }`}
                    onClick={() => navigate(`/accounts/${r.account_id}`)}
                    data-testid={`pricing-row-${idx}`}
                    data-account-index={r._accountIndex}
                  >
                    <TableCell className="font-medium align-top">
                      {r._showAccount ? (
                        <div className="flex flex-col">
                          <div className="flex items-center gap-2">
                            <span className="text-slate-800 dark:text-white">{r.account_name}</span>
                            {r.include_in_gop_metrics === false && (
                              <span
                                className="text-[10px] font-medium px-1.5 py-0.5 rounded bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300"
                                title="Excluded from GOP top-tile metrics"
                                data-testid={`row-not-in-gop-${idx}`}
                              >
                                Not in GOP
                              </span>
                            )}
                          </div>
                          {r.account_code && (
                            <span className="text-xs text-muted-foreground font-mono">{r.account_code}</span>
                          )}
                        </div>
                      ) : null}
                    </TableCell>
                    <TableCell className="align-top">
                      {r._showAccount ? (
                        <div className="text-sm">
                          <div>{r.city || '—'}</div>
                          <div className="text-xs text-muted-foreground">{r.territory || ''}</div>
                        </div>
                      ) : null}
                    </TableCell>
                    <TableCell>
                      {r.sku_name ? (
                        <div>
                          <div className="font-medium text-slate-800 dark:text-white">{r.sku_name}</div>
                          {r.sku_category && (
                            <div className="text-xs text-muted-foreground">{r.sku_category}</div>
                          )}
                        </div>
                      ) : (
                        <span className="text-xs text-muted-foreground italic">No SKU pricing set</span>
                      )}
                    </TableCell>
                    <TableCell className="text-right font-semibold">
                      {r.price_per_unit != null ? `₹${Number(r.price_per_unit).toFixed(2)}` : '—'}
                    </TableCell>
                    <TableCell className="text-right text-emerald-700 dark:text-emerald-400">
                      {r.return_bottle_credit != null ? `₹${Number(r.return_bottle_credit).toFixed(2)}` : '—'}
                    </TableCell>
                  </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>
        )}
      </Card>
    </div>
  );
}
