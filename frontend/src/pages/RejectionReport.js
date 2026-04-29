import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { toast } from 'sonner';
import axios from 'axios';
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from '../components/ui/select';
import {
  Loader2, AlertTriangle, Filter, BarChart3, User, Calendar,
  IndianRupee, Tags, Layers, Sparkles, ChevronLeft, ChevronRight,
} from 'lucide-react';

const API_URL = process.env.REACT_APP_BACKEND_URL + '/api';
const PAGE_SIZE_OPTIONS = [25, 50, 100, 200];

function getAuthHeaders() {
  const token = localStorage.getItem('token');
  return { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' };
}

const MONTHS = ['January','February','March','April','May','June','July','August','September','October','November','December'];

const inr = (n) => `₹${(Number(n) || 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const num = (n) => (Number(n) || 0).toLocaleString();

// ─────────────────────────────────────────────────────────────────────
// GOP-style hero tile
// ─────────────────────────────────────────────────────────────────────
const ACCENT_GRAD = {
  rose:    'from-rose-50 via-rose-50/50 to-white',
  amber:   'from-amber-50 via-amber-50/50 to-white',
  indigo:  'from-indigo-50 via-indigo-50/50 to-white',
  emerald: 'from-emerald-50 via-emerald-50/50 to-white',
  sky:     'from-sky-50 via-sky-50/50 to-white',
  slate:   'from-slate-50 via-slate-50/50 to-white',
};
const ACCENT_ICON = {
  rose:    'text-rose-600 bg-rose-500/10',
  amber:   'text-amber-600 bg-amber-500/10',
  indigo:  'text-indigo-600 bg-indigo-500/10',
  emerald: 'text-emerald-600 bg-emerald-500/10',
  sky:     'text-sky-600 bg-sky-500/10',
  slate:   'text-slate-600 bg-slate-500/10',
};
const ACCENT_HALO = {
  rose: 'bg-rose-500/10', amber: 'bg-amber-500/10', indigo: 'bg-indigo-500/10',
  emerald: 'bg-emerald-500/10', sky: 'bg-sky-500/10', slate: 'bg-slate-500/10',
};
const ACCENT_BAR = {
  rose: 'bg-rose-500', amber: 'bg-amber-500', indigo: 'bg-indigo-500',
  emerald: 'bg-emerald-500', sky: 'bg-sky-500', slate: 'bg-slate-500',
};

function HeroTile({ label, value, sub, icon: Icon, accent = 'slate', dataTestId }) {
  return (
    <div
      className={`relative group rounded-2xl border border-slate-200/70 bg-gradient-to-br ${ACCENT_GRAD[accent]} p-4 sm:p-5 overflow-hidden transition-all hover:-translate-y-0.5 hover:shadow-lg`}
      data-testid={dataTestId}
    >
      <div className={`absolute -top-6 -right-6 h-24 w-24 rounded-full ${ACCENT_HALO[accent]} blur-2xl opacity-40 transition-opacity group-hover:opacity-60`} />
      <div className="flex items-start justify-between gap-2 relative">
        <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">{label}</p>
        <div className={`shrink-0 h-8 w-8 rounded-xl flex items-center justify-center ${ACCENT_ICON[accent]}`}>
          <Icon className="h-4 w-4" />
        </div>
      </div>
      <p className="mt-3 text-2xl sm:text-3xl font-bold tracking-tight text-slate-900 tabular-nums truncate relative" title={typeof value === 'string' ? value : undefined}>{value}</p>
      {sub && <p className="text-[11px] text-muted-foreground mt-1 relative">{sub}</p>}
    </div>
  );
}

// Compact bar list with cost + bottles for each entry
function BreakdownPanel({ title, items, icon: Icon, accent = 'rose', labelKey, max }) {
  if (!items || !items.length) return null;
  const peak = max ?? Math.max(...items.map((i) => i.cost || 0), 0);
  return (
    <div className={`relative rounded-2xl border border-slate-200/70 bg-gradient-to-br ${ACCENT_GRAD[accent]} p-4 sm:p-5 overflow-hidden`}>
      <div className={`absolute -top-6 -right-6 h-24 w-24 rounded-full ${ACCENT_HALO[accent]} blur-2xl opacity-40`} />
      <div className="flex items-center gap-2 mb-4 relative">
        <div className={`shrink-0 h-7 w-7 rounded-lg flex items-center justify-center ${ACCENT_ICON[accent]}`}>
          <Icon className="h-3.5 w-3.5" />
        </div>
        <h4 className="text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">{title}</h4>
      </div>
      <div className="space-y-2.5 relative max-h-56 overflow-y-auto pr-1">
        {items.slice(0, 8).map((it, idx) => {
          const label = it[labelKey] || '—';
          const pct = peak > 0 ? Math.round(((it.cost || 0) / peak) * 100) : 0;
          return (
            <div key={`${label}-${idx}`} className="space-y-1">
              <div className="flex items-center justify-between gap-2 text-[12px]">
                <span className="text-slate-700 truncate" title={label}>{label}</span>
                <span className="flex items-center gap-2 shrink-0">
                  <span className="text-[10px] text-muted-foreground tabular-nums">{num(it.bottles)} bottles</span>
                  <span className="tabular-nums font-semibold text-slate-900">{inr(it.cost)}</span>
                </span>
              </div>
              <div className="h-1.5 bg-slate-200/60 rounded-full overflow-hidden">
                <div className={`h-full rounded-full ${ACCENT_BAR[accent]} transition-all duration-500`} style={{ width: `${pct}%` }} />
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

export default function RejectionReport() {
  const now = new Date();
  const [report, setReport] = useState(null);
  const [loading, setLoading] = useState(true);
  const [batches, setBatches] = useState([]);
  const [skus, setSkus] = useState([]);
  const [rejectionReasons, setRejectionReasons] = useState([]);
  const [filters, setFilters] = useState({
    month: String(now.getMonth() + 1),
    year: String(now.getFullYear()),
    batch_id: '',
    sku_id: '',
    resource_id: '',
    stage_type: '',
    rejection_reason: '',
  });
  const [resources, setResources] = useState([]);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);

  const fetchReport = useCallback(async (f) => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (f.month) params.set('month', f.month);
      if (f.year) params.set('year', f.year);
      if (f.batch_id) params.set('batch_id', f.batch_id);
      if (f.sku_id) params.set('sku_id', f.sku_id);
      if (f.resource_id) params.set('resource_id', f.resource_id);
      if (f.stage_type) params.set('stage_type', f.stage_type);
      if (f.rejection_reason) params.set('rejection_reason', f.rejection_reason);
      const { data } = await axios.get(`${API_URL}/production/rejection-report?${params}`, { headers: getAuthHeaders() });
      setReport(data);
      setPage(1);
      const resMap = {};
      (data.rows || []).forEach((r) => { if (r.resource_id) resMap[r.resource_id] = r.resource_name; });
      setResources(Object.entries(resMap).map(([id, name]) => ({ id, name })));
    } catch {
      toast.error('Failed to load rejection report');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const loadMeta = async () => {
      try {
        const [batchRes, reasonsRes] = await Promise.all([
          axios.get(`${API_URL}/production/batches`, { headers: getAuthHeaders() }),
          axios.get(`${API_URL}/production/rejection-reasons`, { headers: getAuthHeaders() }),
        ]);
        setBatches(batchRes.data);
        const skuMap = {};
        batchRes.data.forEach((b) => { if (b.sku_id && b.sku_name) skuMap[b.sku_id] = b.sku_name; });
        setSkus(Object.entries(skuMap).map(([id, name]) => ({ id, name })));
        setRejectionReasons(reasonsRes.data || []);
      } catch { /* ignore */ }
    };
    loadMeta();
    fetchReport(filters);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const filteredBatches = useMemo(() => batches.filter((b) => {
    if (filters.sku_id && b.sku_id !== filters.sku_id) return false;
    if (filters.year && b.production_date) {
      const pd = new Date(b.production_date);
      if (pd.getFullYear() !== parseInt(filters.year, 10)) return false;
      if (filters.month && (pd.getMonth() + 1) !== parseInt(filters.month, 10)) return false;
    } else if (filters.month && b.production_date) {
      const pd = new Date(b.production_date);
      if ((pd.getMonth() + 1) !== parseInt(filters.month, 10)) return false;
    }
    return true;
  }), [batches, filters.sku_id, filters.month, filters.year]);

  useEffect(() => {
    if (filters.batch_id) {
      const stillExists = filteredBatches.some((b) => b.id === filters.batch_id);
      if (!stillExists) setFilters((p) => ({ ...p, batch_id: '' }));
    }
  }, [filteredBatches, filters.batch_id]);

  const applyFilters = () => fetchReport(filters);
  const clearFilters = () => {
    const empty = { month: '', year: '', batch_id: '', sku_id: '', resource_id: '', stage_type: '', rejection_reason: '' };
    setFilters(empty);
    fetchReport(empty);
  };

  const yearOptions = [];
  for (let y = now.getFullYear() - 2; y <= now.getFullYear() + 1; y++) yearOptions.push(y);

  // ── Pagination ──────────────────────────────────────────────────────
  const totalRows = report?.rows?.length || 0;
  const totalPages = Math.max(1, Math.ceil(totalRows / pageSize));
  const safePage = Math.min(page, totalPages);
  const pagedRows = useMemo(() => {
    if (!report?.rows) return [];
    const start = (safePage - 1) * pageSize;
    return report.rows.slice(start, start + pageSize);
  }, [report, safePage, pageSize]);

  // Derived metrics
  const avgCostPerBottle = (report?.total_rejected || 0) > 0
    ? (report.total_cost || 0) / report.total_rejected
    : 0;
  const topSku = report?.top_skus?.[0];
  const unmappedCount = report?.unmapped_count || 0;

  return (
    <div className="p-4 sm:p-6 lg:p-8 max-w-[1600px] mx-auto space-y-4 sm:space-y-6" data-testid="rejection-report-page">
      <div>
        <h1 className="text-xl sm:text-2xl font-bold tracking-tight text-slate-800">Rejection Report</h1>
        <p className="text-xs sm:text-sm text-slate-500 mt-0.5">Bottle rejections across all batches — by resource, date, stage, and the rupee cost they carry</p>
      </div>

      {/* Filters */}
      <div className="bg-white border border-slate-200 rounded-2xl p-4 sm:p-5">
        <div className="flex items-center gap-2 mb-3">
          <Filter size={14} className="text-slate-400" />
          <span className="text-xs font-semibold text-slate-600 uppercase tracking-wider">Filters</span>
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-8 gap-2 sm:gap-3">
          <div>
            <label className="text-[10px] text-slate-500 mb-1 block">Month</label>
            <Select value={filters.month || '__all__'} onValueChange={(v) => setFilters((p) => ({ ...p, month: v === '__all__' ? '' : v }))}>
              <SelectTrigger className="h-9 text-sm border-slate-200" data-testid="filter-month"><SelectValue placeholder="All Months" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="__all__">All Months</SelectItem>
                {MONTHS.map((m, i) => <SelectItem key={i} value={String(i + 1)}>{m}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div>
            <label className="text-[10px] text-slate-500 mb-1 block">Year</label>
            <Select value={filters.year || '__all__'} onValueChange={(v) => setFilters((p) => ({ ...p, year: v === '__all__' ? '' : v }))}>
              <SelectTrigger className="h-9 text-sm border-slate-200" data-testid="filter-year"><SelectValue placeholder="All Years" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="__all__">All Years</SelectItem>
                {yearOptions.map((y) => <SelectItem key={y} value={String(y)}>{y}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div>
            <label className="text-[10px] text-slate-500 mb-1 block">SKU</label>
            <Select value={filters.sku_id || '__all__'} onValueChange={(v) => setFilters((p) => ({ ...p, sku_id: v === '__all__' ? '' : v }))}>
              <SelectTrigger className="h-9 text-sm border-slate-200" data-testid="filter-sku"><SelectValue placeholder="All SKUs" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="__all__">All SKUs</SelectItem>
                {skus.map((s) => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div>
            <label className="text-[10px] text-slate-500 mb-1 block">Batch</label>
            <Select value={filters.batch_id || '__all__'} onValueChange={(v) => setFilters((p) => ({ ...p, batch_id: v === '__all__' ? '' : v }))}>
              <SelectTrigger className="h-9 text-sm border-slate-200" data-testid="filter-batch"><SelectValue placeholder="All Batches" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="__all__">All Batches</SelectItem>
                {filteredBatches.map((b) => <SelectItem key={b.id} value={b.id}>{b.batch_code}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div>
            <label className="text-[10px] text-slate-500 mb-1 block">Stage</label>
            <Select value={filters.stage_type || '__all__'} onValueChange={(v) => setFilters((p) => ({ ...p, stage_type: v === '__all__' ? '' : v }))}>
              <SelectTrigger className="h-9 text-sm border-slate-200" data-testid="filter-stage-type"><SelectValue placeholder="All Stages" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="__all__">All Stages</SelectItem>
                <SelectItem value="qc">QC</SelectItem>
                <SelectItem value="labeling">Labeling</SelectItem>
                <SelectItem value="final_qc">Final QC</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div>
            <label className="text-[10px] text-slate-500 mb-1 block">Resource</label>
            <Select value={filters.resource_id || '__all__'} onValueChange={(v) => setFilters((p) => ({ ...p, resource_id: v === '__all__' ? '' : v }))}>
              <SelectTrigger className="h-9 text-sm border-slate-200" data-testid="filter-resource"><SelectValue placeholder="All Resources" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="__all__">All Resources</SelectItem>
                {resources.map((r) => <SelectItem key={r.id} value={r.id}>{r.name}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div>
            <label className="text-[10px] text-slate-500 mb-1 block">Reason</label>
            <Select value={filters.rejection_reason || '__all__'} onValueChange={(v) => setFilters((p) => ({ ...p, rejection_reason: v === '__all__' ? '' : v }))}>
              <SelectTrigger className="h-9 text-sm border-slate-200" data-testid="filter-rejection-reason"><SelectValue placeholder="All Reasons" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="__all__">All Reasons</SelectItem>
                {rejectionReasons.map((r) => <SelectItem key={r.id} value={r.name}>{r.name}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="flex items-end gap-2">
            <button onClick={applyFilters}
              className="px-4 py-2 text-sm font-medium text-white bg-slate-800 hover:bg-slate-700 rounded-lg"
              data-testid="apply-filters-btn">Apply</button>
            <button onClick={clearFilters}
              className="px-3 py-2 text-sm text-slate-500 hover:bg-slate-100 rounded-lg">Clear</button>
          </div>
        </div>
      </div>

      {loading ? (
        <div className="flex items-center justify-center h-32"><Loader2 className="w-6 h-6 animate-spin text-slate-400" /></div>
      ) : !report || (report.rows || []).length === 0 ? (
        <div className="bg-slate-50 border border-slate-200 rounded-2xl p-8 text-center">
          <AlertTriangle className="w-8 h-8 text-slate-300 mx-auto mb-2" />
          <p className="text-sm text-slate-500">No rejections found for the selected filters</p>
        </div>
      ) : (
        <>
          {/* ─── Hero Tiles: Quality + Cost Impact ──────────────── */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
            <HeroTile
              label="Total Rejected"
              value={num(report.total_rejected)}
              sub={`${num(report.rows.length)} rejection rows`}
              icon={BarChart3}
              accent="rose"
              dataTestId="hero-total-rejected"
            />
            <HeroTile
              label="Total Rejection Cost"
              value={inr(report.total_cost)}
              sub={`Avg ${inr(avgCostPerBottle)} / bottle`}
              icon={IndianRupee}
              accent="rose"
              dataTestId="hero-total-cost"
            />
            <HeroTile
              label="Top Costly SKU"
              value={topSku ? topSku.sku_name : '—'}
              sub={topSku ? `${num(topSku.bottles)} bottles · ${inr(topSku.cost)}` : 'No cost recorded'}
              icon={Tags}
              accent="indigo"
              dataTestId="hero-top-sku"
            />
            <HeroTile
              label="Unmapped Rows"
              value={num(unmappedCount)}
              sub={unmappedCount > 0 ? 'Configure cost mappings →' : 'All rows mapped'}
              icon={Sparkles}
              accent="amber"
              dataTestId="hero-unmapped"
            />
          </div>

          {/* ─── Cost Breakdown panels ───────────────────────────── */}
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-3 sm:gap-4">
            <BreakdownPanel title="By Reason"   items={report.by_reason}   icon={AlertTriangle} accent="rose"    labelKey="reason" />
            <BreakdownPanel title="By Stage"    items={report.by_stage}    icon={Layers}        accent="amber"   labelKey="stage" />
            <BreakdownPanel title="By Resource" items={report.by_resource} icon={User}          accent="indigo"  labelKey="name" />
            <BreakdownPanel title="By Date"     items={report.by_date}     icon={Calendar}      accent="sky"     labelKey="date" />
          </div>

          {/* ─── Detail Table with pagination ───────────────────── */}
          <div className="bg-white border border-slate-200 rounded-2xl overflow-hidden">
            <div className="px-4 sm:px-5 py-3 border-b border-slate-100 flex items-center justify-between flex-wrap gap-2">
              <span className="text-sm font-semibold text-slate-800">
                Rejection Details
                <span className="ml-2 text-xs font-normal text-slate-500 tabular-nums">
                  {totalRows.toLocaleString()} {totalRows === 1 ? 'row' : 'rows'}
                  {' · '}{inr(report.total_cost)} total cost
                </span>
              </span>
              <div className="flex items-center gap-2 text-xs text-slate-500">
                <span>Rows / page</span>
                <select
                  value={pageSize}
                  onChange={(e) => { setPageSize(Number(e.target.value)); setPage(1); }}
                  className="px-2 py-1 border border-slate-200 rounded-md bg-white text-sm focus:ring-2 focus:ring-primary/20 focus:border-primary"
                  data-testid="page-size-select"
                >
                  {PAGE_SIZE_OPTIONS.map((s) => <option key={s} value={s}>{s}</option>)}
                </select>
              </div>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-sm min-w-[1000px]">
                <thead>
                  <tr className="bg-slate-50 border-b border-slate-200">
                    {['Date', 'Batch', 'SKU', 'Stage', 'Resource', 'Inspected', 'Rejected', 'Reason', 'Cost', 'Remarks'].map((h) => (
                      <th key={h} className="text-left px-4 py-2.5 text-[10px] text-slate-500 uppercase tracking-wider font-medium whitespace-nowrap">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {pagedRows.map((r, idx) => (
                    <tr key={`${r.id}-${idx}`} className="hover:bg-slate-50 transition-colors" data-testid={`rejection-row-${r.id}`}>
                      <td className="px-4 py-2.5 text-slate-600 whitespace-nowrap">{r.date}</td>
                      <td className="px-4 py-2.5 font-medium text-slate-800 whitespace-nowrap">{r.batch_code}</td>
                      <td className="px-4 py-2.5 text-slate-600 whitespace-nowrap">{r.sku_name}</td>
                      <td className="px-4 py-2.5 text-slate-600 whitespace-nowrap">{r.stage_name}</td>
                      <td className="px-4 py-2.5 text-slate-700 whitespace-nowrap">{r.resource_name}</td>
                      <td className="px-4 py-2.5 text-slate-600 text-center tabular-nums">{r.qty_inspected}</td>
                      <td className="px-4 py-2.5 font-bold text-rose-600 text-center tabular-nums">{r.qty_rejected}</td>
                      <td className="px-4 py-2.5 text-slate-600">{r.rejection_reason || '-'}</td>
                      <td className="px-4 py-2.5 text-right whitespace-nowrap">
                        {r.missing_mapping ? (
                          <span className="text-amber-600 text-xs italic" title="No mapping configured for this Stage × Reason. Configure under Production → Rejection Cost Config.">— not mapped</span>
                        ) : (
                          <span className="font-semibold text-rose-700 tabular-nums">{inr(r.cost_of_rejection)}</span>
                        )}
                      </td>
                      <td className="px-4 py-2.5 text-slate-400">{r.remarks || '-'}</td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr className="bg-slate-50 border-t border-slate-200 font-semibold">
                    <td colSpan={6} className="px-4 py-2.5 text-right text-slate-600">Total (all rows)</td>
                    <td className="px-4 py-2.5 text-rose-600 text-center tabular-nums">{num(report.total_rejected)}</td>
                    <td className="px-4 py-2.5"></td>
                    <td className="px-4 py-2.5 text-right text-rose-700 tabular-nums">{inr(report.total_cost)}</td>
                    <td></td>
                  </tr>
                </tfoot>
              </table>
            </div>

            {/* Pagination footer */}
            <div className="px-4 sm:px-5 py-3 border-t border-slate-100 flex items-center justify-between flex-wrap gap-3 text-xs text-slate-600">
              <span data-testid="pagination-info">
                Showing <span className="font-semibold tabular-nums">{(safePage - 1) * pageSize + 1}</span>–
                <span className="font-semibold tabular-nums">{Math.min(safePage * pageSize, totalRows)}</span>
                {' of '}<span className="font-semibold tabular-nums">{totalRows.toLocaleString()}</span>
              </span>
              <div className="flex items-center gap-1">
                <button
                  onClick={() => setPage(1)} disabled={safePage === 1}
                  className="px-2 py-1 rounded-md border border-slate-200 text-slate-600 disabled:opacity-40 hover:bg-slate-50"
                  data-testid="pagination-first">«</button>
                <button
                  onClick={() => setPage((p) => Math.max(1, p - 1))} disabled={safePage === 1}
                  className="p-1.5 rounded-md border border-slate-200 text-slate-600 disabled:opacity-40 hover:bg-slate-50"
                  data-testid="pagination-prev"><ChevronLeft className="w-4 h-4" /></button>
                <span className="px-3 py-1 rounded-md bg-slate-100 text-slate-700 tabular-nums" data-testid="pagination-current">
                  Page {safePage} / {totalPages}
                </span>
                <button
                  onClick={() => setPage((p) => Math.min(totalPages, p + 1))} disabled={safePage === totalPages}
                  className="p-1.5 rounded-md border border-slate-200 text-slate-600 disabled:opacity-40 hover:bg-slate-50"
                  data-testid="pagination-next"><ChevronRight className="w-4 h-4" /></button>
                <button
                  onClick={() => setPage(totalPages)} disabled={safePage === totalPages}
                  className="px-2 py-1 rounded-md border border-slate-200 text-slate-600 disabled:opacity-40 hover:bg-slate-50"
                  data-testid="pagination-last">»</button>
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
