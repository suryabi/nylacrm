import React, { useEffect, useMemo, useState } from 'react';
import axios from 'axios';
import { useNavigate } from 'react-router-dom';
import { Card } from '../components/ui/card';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Badge } from '../components/ui/badge';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '../components/ui/table';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '../components/ui/select';
import { Building2, Search, Download, Loader2, ArrowUpDown, Package } from 'lucide-react';
import { toast } from 'sonner';
import AppBreadcrumb from '../components/AppBreadcrumb';

export default function AccountSKUPricing() {
  const navigate = useNavigate();
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [accountsCount, setAccountsCount] = useState(0);
  const [territoryFilter, setTerritoryFilter] = useState('all');
  const [tierFilter, setTierFilter] = useState('all');
  const [skuFilter, setSkuFilter] = useState('all');
  const [exporting, setExporting] = useState(false);

  useEffect(() => {
    fetchGrid();
  }, []);

  const fetchGrid = async () => {
    try {
      setLoading(true);
      const token = localStorage.getItem('token');
      const { data } = await axios.get(
        `${process.env.REACT_APP_BACKEND_URL}/api/accounts/sku-pricing-grid`,
        { headers: { Authorization: `Bearer ${token}` }, withCredentials: true }
      );
      setRows(data.rows || []);
      setAccountsCount(data.accounts_count || 0);
    } catch (err) {
      console.error(err);
      toast.error('Failed to load account SKU pricing');
    } finally {
      setLoading(false);
    }
  };

  const { territories, tiers, skus } = useMemo(() => {
    const t = new Set(), tier = new Set(), sk = new Set();
    rows.forEach((r) => {
      if (r.territory) t.add(r.territory);
      if (r.account_type) tier.add(r.account_type);
      if (r.sku_name) sk.add(r.sku_name);
    });
    return {
      territories: Array.from(t).sort(),
      tiers: Array.from(tier).sort(),
      skus: Array.from(sk).sort(),
    };
  }, [rows]);

  const filteredRows = useMemo(() => {
    const q = search.trim().toLowerCase();
    return rows.filter((r) => {
      if (territoryFilter !== 'all' && r.territory !== territoryFilter) return false;
      if (tierFilter !== 'all' && r.account_type !== tierFilter) return false;
      if (skuFilter !== 'all' && r.sku_name !== skuFilter) return false;
      if (!q) return true;
      return (
        (r.account_name || '').toLowerCase().includes(q) ||
        (r.account_code || '').toLowerCase().includes(q) ||
        (r.city || '').toLowerCase().includes(q) ||
        (r.sku_name || '').toLowerCase().includes(q) ||
        (r.sku_code || '').toLowerCase().includes(q)
      );
    });
  }, [rows, search, territoryFilter, tierFilter, skuFilter]);

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
        'Account Code', 'Account Name', 'Tier', 'City', 'State', 'Territory',
        'SKU Code', 'SKU Name', 'SKU Category', 'HSN Code',
        'Base Price', 'Price Per Unit', 'Return Bottle Credit',
      ];
      const csvRows = [headers.join(',')];
      filteredRows.forEach((r) => {
        const row = [
          r.account_code, r.account_name, r.account_type,
          r.city, r.state, r.territory,
          r.sku_code, r.sku_name, r.sku_category, r.hsn_code,
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
          <p className="text-xs text-muted-foreground">Avg. price / unit</p>
          <p className="text-2xl font-bold text-slate-800 dark:text-white mt-1">
            ₹{summary.avgPrice.toFixed(2)}
          </p>
        </Card>
        <Card className="p-4">
          <p className="text-xs text-muted-foreground">Unique SKUs</p>
          <p className="text-2xl font-bold text-slate-800 dark:text-white mt-1">{skus.length}</p>
        </Card>
      </div>

      {/* Filters */}
      <Card className="p-4">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
          <div className="relative">
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
              {territories.map((t) => <SelectItem key={t} value={t}>{t}</SelectItem>)}
            </SelectContent>
          </Select>

          <Select value={tierFilter} onValueChange={setTierFilter}>
            <SelectTrigger data-testid="tier-filter"><SelectValue placeholder="Tier" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Tiers</SelectItem>
              {tiers.map((t) => <SelectItem key={t} value={t}>{t}</SelectItem>)}
            </SelectContent>
          </Select>

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
                  <TableHead className="min-w-[200px]">Account</TableHead>
                  <TableHead>Tier</TableHead>
                  <TableHead>Location</TableHead>
                  <TableHead className="min-w-[220px]">SKU</TableHead>
                  <TableHead>SKU Code</TableHead>
                  <TableHead className="text-right">Price / Unit (₹)</TableHead>
                  <TableHead className="text-right">Return Credit (₹)</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredRows.map((r, idx) => (
                  <TableRow
                    key={`${r.account_id}-${r.sku_id || r.sku_name || idx}`}
                    className="cursor-pointer hover:bg-muted/50"
                    onClick={() => navigate(`/accounts/${r.account_id}`)}
                    data-testid={`pricing-row-${idx}`}
                  >
                    <TableCell className="font-medium">
                      <div className="flex flex-col">
                        <span className="text-slate-800 dark:text-white">{r.account_name}</span>
                        {r.account_code && (
                          <span className="text-xs text-muted-foreground font-mono">{r.account_code}</span>
                        )}
                      </div>
                    </TableCell>
                    <TableCell>
                      {r.account_type ? (
                        <Badge variant="outline" className="text-xs">{r.account_type}</Badge>
                      ) : <span className="text-muted-foreground">—</span>}
                    </TableCell>
                    <TableCell>
                      <div className="text-sm">
                        <div>{r.city || '—'}</div>
                        <div className="text-xs text-muted-foreground">{r.territory || ''}</div>
                      </div>
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
                        <Badge variant="secondary" className="text-xs">No SKU pricing set</Badge>
                      )}
                    </TableCell>
                    <TableCell className="font-mono text-xs">
                      {r.sku_code || '—'}
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
