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
    filteredRows.forEach((r, idx) => {
      const sameAsPrev = r.account_id === prevAccountId;
      out.push({ ...r, _showAccount: !sameAsPrev, _idx: idx });
      prevAccountId = r.account_id;
    });
    return out;
  }, [filteredRows]);

  // Per-SKU average price (across all filtered rows)
  const skuAverages = useMemo(() => {
    const agg = {};
    filteredRows.forEach((r) => {
      if (!r.sku_name) return;
      const price = Number(r.price_per_unit || 0);
      if (!price) return;
      if (!agg[r.sku_name]) agg[r.sku_name] = { sum: 0, count: 0 };
      agg[r.sku_name].sum += price;
      agg[r.sku_name].count += 1;
    });
    return Object.entries(agg)
      .map(([name, { sum, count }]) => ({ name, avg: sum / count, count }))
      .sort((a, b) => b.avg - a.avg);
  }, [filteredRows]);

  const summary = useMemo(() => {
    const uniqueAccounts = new Set(filteredRows.map((r) => r.account_id)).size;
    const skuRows = filteredRows.filter((r) => r.sku_name);
    const prices = skuRows.map((r) => Number(r.price_per_unit || 0)).filter((x) => x > 0);
    const avg = prices.length ? prices.reduce((a, b) => a + b, 0) / prices.length : 0;
    return {
      uniqueAccounts,
      totalSkuAssignments: skuRows.length,
      avgPrice: avg,
    };
  }, [filteredRows]);

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
              Account SKU Pricing
            </h1>
            <p className="text-xs sm:text-sm text-muted-foreground">
              {filteredRows.length} rows · {summary.uniqueAccounts} accounts · {accountsCount} total accounts
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

      {/* Summary tiles */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <Card className="p-4">
          <p className="text-xs text-muted-foreground">Accounts shown</p>
          <p className="text-2xl font-bold text-slate-800 dark:text-white mt-1">{summary.uniqueAccounts}</p>
        </Card>
        <Card className="p-4">
          <p className="text-xs text-muted-foreground">SKU pricing rows</p>
          <p className="text-2xl font-bold text-slate-800 dark:text-white mt-1">{summary.totalSkuAssignments}</p>
        </Card>
        <Card className="p-4">
          <p className="text-xs text-muted-foreground">Avg. price / unit (all SKUs)</p>
          <p className="text-2xl font-bold text-slate-800 dark:text-white mt-1">
            ₹{summary.avgPrice.toFixed(2)}
          </p>
        </Card>
        <Card className="p-4">
          <p className="text-xs text-muted-foreground">Unique SKUs</p>
          <p className="text-2xl font-bold text-slate-800 dark:text-white mt-1">{skus.length}</p>
        </Card>
      </div>

      {/* Per-SKU average price tiles */}
      {skuAverages.length > 0 && (
        <div>
          <p className="text-xs font-medium text-muted-foreground mb-2 uppercase tracking-wide">
            Average price per SKU
          </p>
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-3" data-testid="sku-average-tiles">
            {skuAverages.map((sku) => (
              <Card key={sku.name} className="p-3 border-l-4 border-l-primary/70">
                <p className="text-xs text-muted-foreground truncate" title={sku.name}>{sku.name}</p>
                <div className="flex items-baseline justify-between mt-1">
                  <p className="text-xl font-bold text-slate-800 dark:text-white">
                    ₹{sku.avg.toFixed(2)}
                  </p>
                  <span className="text-[11px] text-muted-foreground">
                    {sku.count} {sku.count === 1 ? 'account' : 'accounts'}
                  </span>
                </div>
              </Card>
            ))}
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
                {groupedRows.map((r, idx) => (
                  <TableRow
                    key={`${r.account_id}-${r.sku_id || r.sku_name || idx}`}
                    className={`cursor-pointer hover:bg-muted/50 ${
                      r._showAccount && idx > 0 ? 'border-t-2 border-t-muted-foreground/10' : ''
                    }`}
                    onClick={() => navigate(`/accounts/${r.account_id}`)}
                    data-testid={`pricing-row-${idx}`}
                  >
                    <TableCell className="font-medium align-top">
                      {r._showAccount ? (
                        <div className="flex flex-col">
                          <span className="text-slate-800 dark:text-white">{r.account_name}</span>
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
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </Card>
    </div>
  );
}
