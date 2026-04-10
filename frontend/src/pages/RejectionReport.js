import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { toast } from 'sonner';
import axios from 'axios';
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from '../components/ui/select';
import { Loader2, AlertTriangle, Filter, BarChart3, User, Calendar, Droplets } from 'lucide-react';

const API_URL = process.env.REACT_APP_BACKEND_URL + '/api';

function getAuthHeaders() {
  const token = localStorage.getItem('session_token');
  const tenantId = localStorage.getItem('tenant_id');
  return { 'Authorization': `Bearer ${token}`, 'X-Tenant-ID': tenantId, 'Content-Type': 'application/json' };
}

const MONTHS = ['January','February','March','April','May','June','July','August','September','October','November','December'];

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
      const resMap = {};
      (data.rows || []).forEach(r => { if (r.resource_id) resMap[r.resource_id] = r.resource_name; });
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
        batchRes.data.forEach(b => { if (b.sku_id && b.sku_name) skuMap[b.sku_id] = b.sku_name; });
        setSkus(Object.entries(skuMap).map(([id, name]) => ({ id, name })));
        setRejectionReasons(reasonsRes.data || []);
      } catch { }
    };
    loadMeta();
    fetchReport(filters);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Filter batches dynamically based on selected SKU, month, and year
  const filteredBatches = useMemo(() => {
    return batches.filter(b => {
      // Filter by SKU
      if (filters.sku_id && b.sku_id !== filters.sku_id) return false;
      // Filter by month/year based on production_date (format: "YYYY-MM-DD")
      if (filters.year && b.production_date) {
        const pd = new Date(b.production_date);
        if (pd.getFullYear() !== parseInt(filters.year)) return false;
        if (filters.month && (pd.getMonth() + 1) !== parseInt(filters.month)) return false;
      } else if (filters.month && b.production_date) {
        const pd = new Date(b.production_date);
        if ((pd.getMonth() + 1) !== parseInt(filters.month)) return false;
      }
      return true;
    });
  }, [batches, filters.sku_id, filters.month, filters.year]);

  // When SKU/month/year changes, reset batch_id if it's no longer in the filtered list
  useEffect(() => {
    if (filters.batch_id) {
      const stillExists = filteredBatches.some(b => b.id === filters.batch_id);
      if (!stillExists) {
        setFilters(p => ({ ...p, batch_id: '' }));
      }
    }
  }, [filteredBatches, filters.batch_id]);

  const applyFilters = () => fetchReport(filters);
  const clearFilters = () => {
    const empty = { month: '', year: '', batch_id: '', sku_id: '', resource_id: '', stage_type: '', rejection_reason: '' };
    setFilters(empty);
    fetchReport(empty);
  };

  // Generate year options (current year ± 2)
  const yearOptions = [];
  for (let y = now.getFullYear() - 2; y <= now.getFullYear() + 1; y++) yearOptions.push(y);

  return (
    <div className="p-4 sm:p-6 lg:p-8 max-w-[1600px] mx-auto space-y-4 sm:space-y-6" data-testid="rejection-report-page">
      <div>
        <h1 className="text-xl sm:text-2xl font-bold tracking-tight text-slate-800">Rejection Report</h1>
        <p className="text-xs sm:text-sm text-slate-500 mt-0.5">Bottle rejections across all batches — by resource, date, and stage</p>
      </div>

      {/* Filters */}
      <div className="bg-white border border-slate-200 rounded-xl p-4">
        <div className="flex items-center gap-2 mb-3">
          <Filter size={14} className="text-slate-400" />
          <span className="text-xs font-semibold text-slate-600 uppercase tracking-wider">Filters</span>
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-8 gap-2 sm:gap-3">
          {/* Month */}
          <div>
            <label className="text-[10px] text-slate-500 mb-1 block">Month</label>
            <Select value={filters.month || "__all__"} onValueChange={v => setFilters(p => ({ ...p, month: v === "__all__" ? "" : v }))}>
              <SelectTrigger className="h-9 text-sm border-slate-200" data-testid="filter-month">
                <SelectValue placeholder="All Months" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="__all__">All Months</SelectItem>
                {MONTHS.map((m, i) => <SelectItem key={i} value={String(i + 1)}>{m}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          {/* Year */}
          <div>
            <label className="text-[10px] text-slate-500 mb-1 block">Year</label>
            <Select value={filters.year || "__all__"} onValueChange={v => setFilters(p => ({ ...p, year: v === "__all__" ? "" : v }))}>
              <SelectTrigger className="h-9 text-sm border-slate-200" data-testid="filter-year">
                <SelectValue placeholder="All Years" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="__all__">All Years</SelectItem>
                {yearOptions.map(y => <SelectItem key={y} value={String(y)}>{y}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          {/* SKU */}
          <div>
            <label className="text-[10px] text-slate-500 mb-1 block">SKU</label>
            <Select value={filters.sku_id || "__all__"} onValueChange={v => setFilters(p => ({ ...p, sku_id: v === "__all__" ? "" : v }))}>
              <SelectTrigger className="h-9 text-sm border-slate-200" data-testid="filter-sku">
                <SelectValue placeholder="All SKUs" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="__all__">All SKUs</SelectItem>
                {skus.map(s => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          {/* Batch — dynamically filtered by SKU, month, year */}
          <div>
            <label className="text-[10px] text-slate-500 mb-1 block">Batch</label>
            <Select value={filters.batch_id || "__all__"} onValueChange={v => setFilters(p => ({ ...p, batch_id: v === "__all__" ? "" : v }))}>
              <SelectTrigger className="h-9 text-sm border-slate-200" data-testid="filter-batch">
                <SelectValue placeholder="All Batches" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="__all__">All Batches</SelectItem>
                {filteredBatches.map(b => <SelectItem key={b.id} value={b.id}>{b.batch_code}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          {/* Stage Type */}
          <div>
            <label className="text-[10px] text-slate-500 mb-1 block">Stage</label>
            <Select value={filters.stage_type || "__all__"} onValueChange={v => setFilters(p => ({ ...p, stage_type: v === "__all__" ? "" : v }))}>
              <SelectTrigger className="h-9 text-sm border-slate-200" data-testid="filter-stage-type">
                <SelectValue placeholder="All Stages" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="__all__">All Stages</SelectItem>
                <SelectItem value="qc">QC</SelectItem>
                <SelectItem value="labeling">Labeling</SelectItem>
                <SelectItem value="final_qc">Final QC</SelectItem>
              </SelectContent>
            </Select>
          </div>
          {/* Resource (populated from results) */}
          <div>
            <label className="text-[10px] text-slate-500 mb-1 block">Resource</label>
            <Select value={filters.resource_id || "__all__"} onValueChange={v => setFilters(p => ({ ...p, resource_id: v === "__all__" ? "" : v }))}>
              <SelectTrigger className="h-9 text-sm border-slate-200" data-testid="filter-resource">
                <SelectValue placeholder="All Resources" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="__all__">All Resources</SelectItem>
                {resources.map(r => <SelectItem key={r.id} value={r.id}>{r.name}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          {/* Rejection Reason */}
          <div>
            <label className="text-[10px] text-slate-500 mb-1 block">Reason</label>
            <Select value={filters.rejection_reason || "__all__"} onValueChange={v => setFilters(p => ({ ...p, rejection_reason: v === "__all__" ? "" : v }))}>
              <SelectTrigger className="h-9 text-sm border-slate-200" data-testid="filter-rejection-reason">
                <SelectValue placeholder="All Reasons" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="__all__">All Reasons</SelectItem>
                {rejectionReasons.map(r => <SelectItem key={r.id} value={r.name}>{r.name}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          {/* Buttons */}
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
      ) : !report || report.rows.length === 0 ? (
        <div className="bg-slate-50 border border-slate-200 rounded-xl p-8 text-center">
          <AlertTriangle className="w-8 h-8 text-slate-300 mx-auto mb-2" />
          <p className="text-sm text-slate-500">No rejections found for the selected filters</p>
        </div>
      ) : (
        <>
          {/* Summary Cards */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 sm:gap-4">
            <div className="bg-red-50 border border-red-200 rounded-xl p-4 sm:p-5">
              <div className="flex items-center gap-2 mb-2">
                <BarChart3 size={16} className="text-red-500" />
                <span className="text-[10px] sm:text-xs text-red-500 font-semibold uppercase tracking-wider">Total Rejected</span>
              </div>
              <p className="text-2xl sm:text-3xl font-bold text-red-600" data-testid="total-rejected-count">{report.total_rejected.toLocaleString()}</p>
              <p className="text-[10px] text-red-400 mt-0.5">bottles</p>
            </div>

            <div className="bg-white border border-slate-200 rounded-xl p-4 sm:p-5">
              <div className="flex items-center gap-2 mb-3">
                <User size={16} className="text-slate-500" />
                <span className="text-[10px] sm:text-xs text-slate-500 font-semibold uppercase tracking-wider">By Resource</span>
              </div>
              <div className="space-y-1.5 max-h-40 overflow-y-auto">
                {report.by_resource.map((r, i) => (
                  <div key={i} className="flex items-center justify-between text-sm">
                    <span className="text-slate-700">{r.name}</span>
                    <span className="font-bold text-red-600">{r.bottles}</span>
                  </div>
                ))}
              </div>
            </div>

            <div className="bg-white border border-slate-200 rounded-xl p-4 sm:p-5">
              <div className="flex items-center gap-2 mb-3">
                <Calendar size={16} className="text-slate-500" />
                <span className="text-[10px] sm:text-xs text-slate-500 font-semibold uppercase tracking-wider">By Date</span>
              </div>
              <div className="space-y-1.5 max-h-40 overflow-y-auto">
                {report.by_date.map((d, i) => (
                  <div key={i} className="flex items-center justify-between text-sm">
                    <span className="text-slate-700">{d.date}</span>
                    <span className="font-bold text-red-600">{d.bottles}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* Detail Table */}
          <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
            <div className="px-4 sm:px-5 py-3 border-b border-slate-100 flex items-center justify-between">
              <span className="text-sm font-semibold text-slate-800">Rejection Details ({report.rows.length})</span>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm min-w-[800px]">
                <thead>
                  <tr className="bg-slate-50 border-b border-slate-200">
                    {['Date', 'Batch', 'SKU', 'Stage', 'Resource', 'Crates Inspected', 'Rejected Count', 'Reason', 'Remarks'].map(h => (
                      <th key={h} className="text-left px-4 py-2.5 text-[10px] text-slate-500 uppercase tracking-wider font-medium whitespace-nowrap">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {report.rows.map((r, idx) => (
                    <tr key={`${r.id}-${idx}`} className="hover:bg-slate-50 transition-colors" data-testid={`rejection-row-${r.id}`}>
                      <td className="px-4 py-2.5 text-slate-600 whitespace-nowrap">{r.date}</td>
                      <td className="px-4 py-2.5 font-medium text-slate-800 whitespace-nowrap">{r.batch_code}</td>
                      <td className="px-4 py-2.5 text-slate-600 whitespace-nowrap">{r.sku_name}</td>
                      <td className="px-4 py-2.5 text-slate-600 whitespace-nowrap">{r.stage_name}</td>
                      <td className="px-4 py-2.5 text-slate-700 whitespace-nowrap">{r.resource_name}</td>
                      <td className="px-4 py-2.5 text-slate-600 text-center">{r.qty_inspected}</td>
                      <td className="px-4 py-2.5 font-bold text-red-600 text-center">{r.qty_rejected}</td>
                      <td className="px-4 py-2.5 text-slate-600">{r.rejection_reason || '-'}</td>
                      <td className="px-4 py-2.5 text-slate-400">{r.remarks || '-'}</td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr className="bg-slate-50 border-t border-slate-200 font-semibold">
                    <td colSpan={6} className="px-4 py-2.5 text-right text-slate-600">Total</td>
                    <td className="px-4 py-2.5 text-red-600 text-center">{report.total_rejected.toLocaleString()}</td>
                    <td colSpan={2}></td>
                  </tr>
                </tfoot>
              </table>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
