import React, { useState, useEffect, useCallback, useMemo } from 'react';
import axios from 'axios';
import { toast } from 'sonner';
import { Input } from '../ui/input';
import { Button } from '../ui/button';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '../ui/select';
import { Badge } from '../ui/badge';
import { RotateCcw, Download, Loader2, Search, AlertTriangle } from 'lucide-react';

const API_URL = process.env.REACT_APP_BACKEND_URL;

const fmtINR = (n) => '₹' + Math.round(n || 0).toLocaleString('en-IN');
const fmtDate = (iso) => {
  if (!iso) return '—';
  try {
    return new Date(iso).toLocaleString('en-IN', {
      day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit',
    });
  } catch { return iso; }
};

/**
 * Unified Reversals audit log.
 * @param {string} [distributorId] - when set, scopes to one distributor (hides distributor column/filter).
 */
export const ReversalsLog = ({ distributorId }) => {
  const isGlobal = !distributorId;
  const [loading, setLoading] = useState(true);
  const [data, setData] = useState({ reversals: [], total: 0, total_value: 0 });
  const [fromDate, setFromDate] = useState('');
  const [toDate, setToDate] = useState('');
  const [typeFilter, setTypeFilter] = useState('all');
  const [search, setSearch] = useState('');

  const authHeaders = () => ({
    headers: { Authorization: `Bearer ${localStorage.getItem('token')}` },
    withCredentials: true,
  });

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const params = {};
      if (fromDate) params.from_date = fromDate;
      if (toDate) params.to_date = toDate;
      if (typeFilter !== 'all') params.type = typeFilter;
      const url = isGlobal
        ? `${API_URL}/api/reversals`
        : `${API_URL}/api/distributors/${distributorId}/reversals`;
      const res = await axios.get(url, { ...authHeaders(), params });
      setData(res.data || { reversals: [], total: 0, total_value: 0 });
    } catch (e) {
      toast.error(e.response?.data?.detail || 'Failed to load reversals');
      setData({ reversals: [], total: 0, total_value: 0 });
    } finally {
      setLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [distributorId, fromDate, toDate, typeFilter]);

  useEffect(() => { fetchData(); }, [fetchData]);

  const rows = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return data.reversals;
    return data.reversals.filter((r) =>
      [r.reference_number, r.recipient, r.distributor_name, r.reversed_by, r.reason]
        .filter(Boolean).some((v) => String(v).toLowerCase().includes(q)));
  }, [data.reversals, search]);

  const filteredValue = useMemo(
    () => rows.reduce((s, r) => s + (r.value || 0), 0), [rows]);

  const exportCsv = () => {
    const cols = ['Date Reversed', 'Distributor', 'Type', 'Reference #', 'Account/Recipient',
      'Value', 'Original Status', 'Stock Added Back', 'Reversed By', 'Reason'];
    const esc = (v) => `"${String(v ?? '').replace(/"/g, '""')}"`;
    const lines = [cols.join(',')];
    rows.forEach((r) => {
      lines.push([
        fmtDate(r.reversed_at), r.distributor_name, r.type, r.reference_number, r.recipient,
        r.value, r.original_status, r.stock_readded ? 'Yes' : 'No', r.reversed_by, r.reason || '',
      ].map(esc).join(','));
    });
    const blob = new Blob([lines.join('\n')], { type: 'text/csv;charset=utf-8;' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `reversals_${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(a.href);
  };

  const colCount = isGlobal ? 9 : 8;

  return (
    <div className="space-y-4" data-testid="reversals-log">
      {/* Summary + filters */}
      <div className="flex flex-wrap items-end gap-3 rounded-xl border border-slate-200 bg-white p-4">
        <div className="mr-auto flex items-center gap-3">
          <span className="flex h-10 w-10 items-center justify-center rounded-lg bg-gradient-to-br from-rose-100 to-orange-100">
            <RotateCcw className="h-5 w-5 text-rose-600" />
          </span>
          <div>
            <p className="text-sm font-semibold text-slate-800">Reversals Audit Log</p>
            <p className="text-xs text-slate-500">
              {data.total} reversal{data.total === 1 ? '' : 's'} · {fmtINR(data.total_value)} total reversed value
            </p>
          </div>
        </div>
        <div className="min-w-[140px]">
          <label className="mb-1 block text-[11px] font-medium uppercase tracking-wide text-slate-500">From</label>
          <Input type="date" value={fromDate} onChange={(e) => setFromDate(e.target.value)} data-testid="reversals-from-date" />
        </div>
        <div className="min-w-[140px]">
          <label className="mb-1 block text-[11px] font-medium uppercase tracking-wide text-slate-500">To</label>
          <Input type="date" value={toDate} onChange={(e) => setToDate(e.target.value)} data-testid="reversals-to-date" />
        </div>
        <div className="min-w-[130px]">
          <label className="mb-1 block text-[11px] font-medium uppercase tracking-wide text-slate-500">Type</label>
          <Select value={typeFilter} onValueChange={setTypeFilter}>
            <SelectTrigger data-testid="reversals-type-filter"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Types</SelectItem>
              <SelectItem value="delivery">Delivery</SelectItem>
              <SelectItem value="promo">Promo</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <Button variant="outline" onClick={exportCsv} disabled={!rows.length} data-testid="reversals-export-csv">
          <Download className="mr-1.5 h-4 w-4" /> CSV
        </Button>
      </div>

      <div className="relative max-w-sm">
        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
        <Input
          className="pl-9"
          placeholder="Search reference, recipient, reason, user…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          data-testid="reversals-search"
        />
      </div>

      <div className="overflow-hidden rounded-xl border border-slate-200 bg-white">
        <div className="overflow-x-auto">
          <table className="w-full border-collapse text-sm">
            <thead>
              <tr className="border-b border-slate-200 bg-slate-50 text-[11px] uppercase tracking-wider text-slate-500">
                <th className="px-4 py-3 text-left font-semibold">Date Reversed</th>
                {isGlobal && <th className="px-4 py-3 text-left font-semibold">Distributor</th>}
                <th className="px-4 py-3 text-left font-semibold">Type</th>
                <th className="px-4 py-3 text-left font-semibold">Reference #</th>
                <th className="px-4 py-3 text-left font-semibold">Account / Recipient</th>
                <th className="px-4 py-3 text-right font-semibold">Value</th>
                <th className="px-4 py-3 text-left font-semibold">Original Status</th>
                <th className="px-4 py-3 text-center font-semibold">Stock Back</th>
                <th className="px-4 py-3 text-left font-semibold">Reversed By</th>
                <th className="px-4 py-3 text-left font-semibold">Reason</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={colCount + 2} className="py-16 text-center">
                  <Loader2 className="mx-auto h-6 w-6 animate-spin text-rose-500" />
                </td></tr>
              ) : rows.length === 0 ? (
                <tr><td colSpan={colCount + 2} className="py-16 text-center text-sm text-slate-500" data-testid="reversals-empty">
                  No reversals found for the selected filters.
                </td></tr>
              ) : rows.map((r, i) => (
                <tr key={`${r.id}-${i}`} className="border-b border-slate-100 transition-colors last:border-0 hover:bg-slate-50" data-testid={`reversal-row-${r.reference_number}`}>
                  <td className="whitespace-nowrap px-4 py-3 text-slate-600">{fmtDate(r.reversed_at)}</td>
                  {isGlobal && <td className="px-4 py-3 font-medium text-slate-800">{r.distributor_name}</td>}
                  <td className="px-4 py-3">
                    <Badge variant="outline" className={r.type === 'Promo' ? 'border-violet-200 bg-violet-50 text-violet-700' : 'border-sky-200 bg-sky-50 text-sky-700'}>
                      {r.type}
                    </Badge>
                  </td>
                  <td className="px-4 py-3 font-mono text-slate-700">{r.reference_number}</td>
                  <td className="px-4 py-3 text-slate-700">{r.recipient}</td>
                  <td className="px-4 py-3 text-right font-mono font-semibold tabular-nums text-slate-900">{fmtINR(r.value)}</td>
                  <td className="px-4 py-3"><span className="capitalize text-slate-600">{r.original_status}</span></td>
                  <td className="px-4 py-3 text-center">
                    {r.stock_readded
                      ? <Badge className="bg-emerald-100 text-emerald-700 hover:bg-emerald-100">Yes</Badge>
                      : <span className="text-slate-400">—</span>}
                  </td>
                  <td className="px-4 py-3 text-slate-700">{r.reversed_by}</td>
                  <td className="px-4 py-3 max-w-[220px] truncate text-slate-500" title={r.reason || ''}>
                    {r.reason || <span className="text-slate-300">—</span>}
                    {r.zoho_void_pending && (
                      <span className="ml-1 inline-flex items-center gap-0.5 text-amber-600" title="Zoho void/cleanup pending">
                        <AlertTriangle className="h-3 w-3" />
                      </span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
      {!loading && search && (
        <p className="text-xs text-slate-500">
          Showing {rows.length} of {data.total} · {fmtINR(filteredValue)} in view
        </p>
      )}
    </div>
  );
};

export default ReversalsLog;
