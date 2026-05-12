import React, { useEffect, useState, useCallback } from 'react';
import axios from 'axios';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '../components/ui/table';
import { Badge } from '../components/ui/badge';
import { Card } from '../components/ui/card';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '../components/ui/select';
import {
  PackageOpen,
  Search,
  ChevronLeft,
  ChevronRight,
  ChevronDown,
  RefreshCw,
  Truck,
  IndianRupee,
  Hash,
  Building2,
} from 'lucide-react';
import { format } from 'date-fns';
import AppBreadcrumb from '../components/AppBreadcrumb';
import { useNavigation } from '../context/NavigationContext';

const API_URL = process.env.REACT_APP_BACKEND_URL;

const STATUS_STYLES = {
  pending: 'bg-amber-100 text-amber-700 border-amber-300',
  draft: 'bg-amber-100 text-amber-700 border-amber-300',
  approved: 'bg-blue-100 text-blue-700 border-blue-300',
  direct_payment_approved: 'bg-blue-100 text-blue-700 border-blue-300',
  credit_issued: 'bg-emerald-100 text-emerald-700 border-emerald-300',
  processed: 'bg-emerald-100 text-emerald-700 border-emerald-300',
  settled: 'bg-emerald-100 text-emerald-700 border-emerald-300',
  cancelled: 'bg-slate-100 text-slate-600 border-slate-300',
};

// Status -> human-readable label. Kept in sync with the distributor portal's Returns tab.
const STATUS_LABELS = {
  draft: 'Draft',
  pending: 'Pending',
  approved: 'Credit Note Created',
  direct_payment_approved: 'Direct Payment Approved',
  credit_issued: 'Credit Issued',
  processed: 'Processed',
  settled: 'Settled',
  cancelled: 'Cancelled',
};

const formatCurrency = (val) => {
  const n = Math.round(Number(val) || 0);
  if (n >= 10000000) return '₹' + (n / 10000000).toFixed(2) + 'Cr';
  if (n >= 100000) return '₹' + (n / 100000).toFixed(2) + 'L';
  return '₹' + n.toLocaleString('en-IN');
};

export default function CustomerReturnsList() {
  const { navigateTo } = useNavigation();

  const [returns, setReturns] = useState([]);
  const [summary, setSummary] = useState({ total_returns: 0, total_quantity: 0, total_credit: 0 });
  const [distributors, setDistributors] = useState([]);
  const [loading, setLoading] = useState(true);

  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [distributorFilter, setDistributorFilter] = useState('all');

  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(0);
  const [total, setTotal] = useState(0);
  const limit = 50;

  const [expandedRows, setExpandedRows] = useState(new Set());
  const toggleExpanded = (id) => {
    setExpandedRows((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const token = localStorage.getItem('token');
      const params = new URLSearchParams();
      params.append('page', page);
      params.append('limit', limit);
      if (search) params.append('search', search);
      if (statusFilter !== 'all') params.append('status', statusFilter);
      if (distributorFilter !== 'all') params.append('distributor_id', distributorFilter);

      const res = await axios.get(`${API_URL}/api/customer-returns?${params}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const d = res.data || {};
      setReturns(Array.isArray(d.returns) ? d.returns : []);
      setSummary(d.summary || { total_returns: 0, total_quantity: 0, total_credit: 0 });
      setTotal(d.total || 0);
      setTotalPages(d.pages || 0);
    } catch (e) {
      console.error('CustomerReturnsList fetch error', e);
      setReturns([]);
    } finally {
      setLoading(false);
    }
  }, [page, search, statusFilter, distributorFilter]);

  useEffect(() => { fetchData(); }, [fetchData]);

  useEffect(() => {
    (async () => {
      try {
        const token = localStorage.getItem('token');
        const res = await axios.get(`${API_URL}/api/customer-returns/distributors`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        setDistributors(Array.isArray(res.data) ? res.data : []);
      } catch (e) {
        setDistributors([]);
      }
    })();
  }, []);

  return (
    <div className="space-y-6 p-6" data-testid="customer-returns-page">
      <AppBreadcrumb />

      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold text-slate-800 dark:text-white flex items-center gap-2">
            <PackageOpen className="h-7 w-7 text-amber-600" /> Customer Returns
          </h1>
          <p className="text-sm text-slate-500 dark:text-slate-400">
            Bottles returned by customers, recorded under each distributor.
          </p>
        </div>
        <Button variant="outline" onClick={fetchData} data-testid="refresh-returns-btn">
          <RefreshCw className="h-4 w-4 mr-2" /> Refresh
        </Button>
      </div>

      {/* Summary tiles */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <Card className="p-5 border-amber-100 dark:border-amber-900/30 bg-gradient-to-br from-amber-50 to-white dark:from-amber-900/20 dark:to-slate-900">
          <div className="flex items-center justify-between">
            <p className="text-xs uppercase tracking-wide text-amber-700/70">Returns</p>
            <Hash className="h-4 w-4 text-amber-500" />
          </div>
          <p className="text-2xl font-bold text-amber-800 dark:text-amber-300 mt-2 tabular-nums">
            {summary.total_returns?.toLocaleString() || 0}
          </p>
        </Card>
        <Card className="p-5 border-blue-100 dark:border-blue-900/30 bg-gradient-to-br from-blue-50 to-white dark:from-blue-900/20 dark:to-slate-900">
          <div className="flex items-center justify-between">
            <p className="text-xs uppercase tracking-wide text-blue-700/70">Bottles Returned</p>
            <PackageOpen className="h-4 w-4 text-blue-500" />
          </div>
          <p className="text-2xl font-bold text-blue-800 dark:text-blue-300 mt-2 tabular-nums">
            {(summary.total_quantity || 0).toLocaleString()}
          </p>
        </Card>
        <Card className="p-5 border-emerald-100 dark:border-emerald-900/30 bg-gradient-to-br from-emerald-50 to-white dark:from-emerald-900/20 dark:to-slate-900">
          <div className="flex items-center justify-between">
            <p className="text-xs uppercase tracking-wide text-emerald-700/70">Total Credit</p>
            <IndianRupee className="h-4 w-4 text-emerald-500" />
          </div>
          <p className="text-2xl font-bold text-emerald-800 dark:text-emerald-300 mt-2 tabular-nums">
            {formatCurrency(summary.total_credit)}
          </p>
        </Card>
      </div>

      {/* Filters */}
      <Card className="p-4">
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
            <Input
              placeholder="Search by return # or account"
              className="pl-9"
              value={search}
              onChange={(e) => { setSearch(e.target.value); setPage(1); }}
              data-testid="search-returns-input"
            />
          </div>
          <Select value={statusFilter} onValueChange={(v) => { setStatusFilter(v); setPage(1); }}>
            <SelectTrigger data-testid="status-filter">
              <SelectValue placeholder="All statuses" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All statuses</SelectItem>
              <SelectItem value="draft">Draft</SelectItem>
              <SelectItem value="pending">Pending</SelectItem>
              <SelectItem value="approved">Credit Note Created</SelectItem>
              <SelectItem value="direct_payment_approved">Direct Payment Approved</SelectItem>
              <SelectItem value="credit_issued">Credit Issued</SelectItem>
              <SelectItem value="processed">Processed</SelectItem>
              <SelectItem value="settled">Settled</SelectItem>
              <SelectItem value="cancelled">Cancelled</SelectItem>
            </SelectContent>
          </Select>
          <Select value={distributorFilter} onValueChange={(v) => { setDistributorFilter(v); setPage(1); }}>
            <SelectTrigger data-testid="distributor-filter">
              <SelectValue placeholder="All distributors" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All distributors</SelectItem>
              {distributors.map((d) => (
                <SelectItem key={d.id} value={d.id}>{d.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </Card>

      {/* Table */}
      <Card className="overflow-hidden">
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow className="bg-slate-50 dark:bg-slate-800/50">
                <TableHead className="w-10" />
                <TableHead>Return #</TableHead>
                <TableHead>Date</TableHead>
                <TableHead>Account</TableHead>
                <TableHead>Distributor</TableHead>
                <TableHead className="text-right">Bottles</TableHead>
                <TableHead className="text-right">Credit</TableHead>
                <TableHead>Status</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading ? (
                <TableRow>
                  <TableCell colSpan={8} className="text-center py-10 text-slate-500">Loading…</TableCell>
                </TableRow>
              ) : returns.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={8} className="text-center py-10 text-slate-500">No customer returns found.</TableCell>
                </TableRow>
              ) : returns.map((r) => {
                const id = r.id || r.return_number;
                const items = Array.isArray(r.items) ? r.items : [];
                const isExpanded = expandedRows.has(id);
                const hasItems = items.length > 0;
                const status = r.status || 'pending';
                return (
                  <React.Fragment key={id}>
                    <TableRow
                      className="hover:bg-slate-50 dark:hover:bg-slate-800/50 cursor-pointer transition-colors"
                      onClick={() => {
                        if (r.distributor_id) {
                          navigateTo(`/distributors/${r.distributor_id}`, { label: r.distributor_name || 'Distributor' });
                        }
                      }}
                    >
                      <TableCell className="w-10" onClick={(e) => e.stopPropagation()}>
                        {hasItems ? (
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-7 w-7 p-0"
                            onClick={() => toggleExpanded(id)}
                            data-testid={`expand-return-${id}`}
                            aria-label={isExpanded ? 'Collapse line items' : 'Expand line items'}
                          >
                            {isExpanded ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                          </Button>
                        ) : null}
                      </TableCell>
                      <TableCell className="font-medium text-amber-700 dark:text-amber-400">
                        {r.return_number || '-'}
                      </TableCell>
                      <TableCell className="text-slate-600 dark:text-slate-400">
                        {r.return_date ? format(new Date(r.return_date), 'dd MMM yyyy') : '-'}
                      </TableCell>
                      <TableCell>
                        <span className="font-medium text-slate-800 dark:text-slate-200 truncate block max-w-[220px]">
                          {r.account_name || r.account_id || '-'}
                        </span>
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-1.5 text-sm text-slate-600 dark:text-slate-400">
                          <Truck className="h-3.5 w-3.5 text-slate-400" />
                          <span className="truncate max-w-[160px]">{r.distributor_name || '-'}</span>
                        </div>
                      </TableCell>
                      <TableCell className="text-right tabular-nums font-semibold">
                        {(r.total_quantity || 0).toLocaleString()}
                      </TableCell>
                      <TableCell className="text-right tabular-nums font-semibold text-emerald-700 dark:text-emerald-300">
                        {formatCurrency(r.total_credit)}
                      </TableCell>
                      <TableCell>
                        <Badge variant="outline" className={STATUS_STYLES[status] || 'bg-slate-100 text-slate-700 border-slate-300'}>
                          {STATUS_LABELS[status] || String(status).replace(/_/g, ' ')}
                        </Badge>
                      </TableCell>
                    </TableRow>
                    {isExpanded && hasItems && (
                      <TableRow className="bg-slate-50/40 dark:bg-slate-800/20 hover:bg-slate-50/40">
                        <TableCell colSpan={8} className="p-0">
                          <div className="p-4" data-testid={`return-line-items-${id}`}>
                            <table className="w-full text-sm">
                              <thead>
                                <tr className="text-xs text-muted-foreground">
                                  <th className="text-left py-2 px-3 font-medium">SKU</th>
                                  <th className="text-left py-2 px-3 font-medium">Reason</th>
                                  <th className="text-right py-2 px-3 font-medium">Crates</th>
                                  <th className="text-right py-2 px-3 font-medium">Bottles</th>
                                  <th className="text-right py-2 px-3 font-medium">Credit / Unit</th>
                                  <th className="text-right py-2 px-3 font-medium">Total Credit</th>
                                </tr>
                              </thead>
                              <tbody>
                                {items.map((it, idx) => {
                                  const crates = it.crates ?? it.crate_count ?? null;
                                  const cap = it.crate_capacity ?? it.crateCapacity ?? null;
                                  return (
                                    <tr key={idx} className="border-t border-slate-100 dark:border-slate-800">
                                      <td className="py-2 px-3">
                                        <p className="font-medium">{it.sku_name || it.sku || 'N/A'}</p>
                                        {it.sku_code && <p className="text-xs text-muted-foreground">{it.sku_code}</p>}
                                      </td>
                                      <td className="py-2 px-3">
                                        <span className="text-xs">{it.reason_name || it.reason_category || '-'}</span>
                                      </td>
                                      <td className="py-2 px-3 text-right tabular-nums">
                                        {crates != null ? (
                                          <div>
                                            <p>{Number(crates).toLocaleString()}</p>
                                            {cap != null && <p className="text-[10px] text-muted-foreground">× {Number(cap)}/crate</p>}
                                          </div>
                                        ) : <span className="text-muted-foreground">-</span>}
                                      </td>
                                      <td className="py-2 px-3 text-right tabular-nums">{(it.quantity || 0).toLocaleString()}</td>
                                      <td className="py-2 px-3 text-right tabular-nums">{formatCurrency(it.credit_per_unit || 0)}</td>
                                      <td className="py-2 px-3 text-right font-medium tabular-nums text-emerald-700">{formatCurrency(it.total_credit || 0)}</td>
                                    </tr>
                                  );
                                })}
                              </tbody>
                              <tfoot className="border-t border-slate-200 dark:border-slate-700">
                                <tr>
                                  <td className="py-2 px-3 font-semibold" colSpan={3}>Total</td>
                                  <td className="py-2 px-3 text-right font-semibold tabular-nums">{(r.total_quantity || 0).toLocaleString()}</td>
                                  <td />
                                  <td className="py-2 px-3 text-right font-semibold text-emerald-700 tabular-nums">{formatCurrency(r.total_credit)}</td>
                                </tr>
                              </tfoot>
                            </table>
                          </div>
                        </TableCell>
                      </TableRow>
                    )}
                  </React.Fragment>
                );
              })}
            </TableBody>
          </Table>
        </div>

        {/* Pagination */}
        {totalPages > 1 && (
          <div className="flex items-center justify-between px-4 py-3 border-t bg-slate-50/50 dark:bg-slate-800/20">
            <span className="text-sm text-slate-500">
              <Building2 className="inline h-3.5 w-3.5 mr-1" />
              {total.toLocaleString()} returns · page {page} of {totalPages}
            </span>
            <div className="flex gap-2">
              <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => setPage(p => p - 1)} data-testid="prev-page">
                <ChevronLeft className="h-4 w-4" />
              </Button>
              <Button variant="outline" size="sm" disabled={page >= totalPages} onClick={() => setPage(p => p + 1)} data-testid="next-page">
                <ChevronRight className="h-4 w-4" />
              </Button>
            </div>
          </div>
        )}
      </Card>
    </div>
  );
}
