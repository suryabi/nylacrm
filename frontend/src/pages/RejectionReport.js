import React, { useState, useEffect, useCallback } from 'react';
import { toast } from 'sonner';
import axios from 'axios';
import { Loader2, AlertTriangle, Download, Filter, BarChart3, User, Calendar } from 'lucide-react';

const API_URL = process.env.REACT_APP_BACKEND_URL + '/api';

function getAuthHeaders() {
  const token = localStorage.getItem('session_token');
  const tenantId = localStorage.getItem('tenant_id');
  return { 'Authorization': `Bearer ${token}`, 'X-Tenant-ID': tenantId, 'Content-Type': 'application/json' };
}

export default function RejectionReport() {
  const [report, setReport] = useState(null);
  const [loading, setLoading] = useState(true);
  const [batches, setBatches] = useState([]);
  const [filters, setFilters] = useState({ date_from: '', date_to: '', batch_id: '', resource_id: '', stage_type: '' });
  const [resources, setResources] = useState([]);

  const fetchReport = useCallback(async (f) => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (f.date_from) params.set('date_from', f.date_from);
      if (f.date_to) params.set('date_to', f.date_to);
      if (f.batch_id) params.set('batch_id', f.batch_id);
      if (f.resource_id) params.set('resource_id', f.resource_id);
      if (f.stage_type) params.set('stage_type', f.stage_type);
      const { data } = await axios.get(`${API_URL}/production/rejection-report?${params}`, { headers: getAuthHeaders() });
      setReport(data);
      // Extract unique resources from data
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
    const fetchBatches = async () => {
      try {
        const { data } = await axios.get(`${API_URL}/production/batches`, { headers: getAuthHeaders() });
        setBatches(data);
      } catch { /* ignore */ }
    };
    fetchBatches();
    fetchReport(filters);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const applyFilters = () => fetchReport(filters);
  const clearFilters = () => {
    const empty = { date_from: '', date_to: '', batch_id: '', resource_id: '', stage_type: '' };
    setFilters(empty);
    fetchReport(empty);
  };

  return (
    <div className="p-6 lg:p-8 max-w-[1600px] mx-auto space-y-6" data-testid="rejection-report-page">
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-slate-800">Rejection Report</h1>
        <p className="text-sm text-slate-500 mt-0.5">Bottle rejections across all batches — by resource, date, and stage</p>
      </div>

      {/* Filters */}
      <div className="bg-white border border-slate-200 rounded-xl p-4">
        <div className="flex items-center gap-2 mb-3">
          <Filter size={14} className="text-slate-400" />
          <span className="text-xs font-semibold text-slate-600 uppercase tracking-wider">Filters</span>
        </div>
        <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
          <div>
            <label className="text-[10px] text-slate-500 mb-1 block">From Date</label>
            <input type="date" value={filters.date_from} onChange={e => setFilters(p => ({ ...p, date_from: e.target.value }))}
              className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm" data-testid="filter-date-from" />
          </div>
          <div>
            <label className="text-[10px] text-slate-500 mb-1 block">To Date</label>
            <input type="date" value={filters.date_to} onChange={e => setFilters(p => ({ ...p, date_to: e.target.value }))}
              className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm" data-testid="filter-date-to" />
          </div>
          <div>
            <label className="text-[10px] text-slate-500 mb-1 block">Batch</label>
            <select value={filters.batch_id} onChange={e => setFilters(p => ({ ...p, batch_id: e.target.value }))}
              className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm" data-testid="filter-batch">
              <option value="">All Batches</option>
              {batches.map(b => <option key={b.id} value={b.id}>{b.batch_code}</option>)}
            </select>
          </div>
          <div>
            <label className="text-[10px] text-slate-500 mb-1 block">Stage Type</label>
            <select value={filters.stage_type} onChange={e => setFilters(p => ({ ...p, stage_type: e.target.value }))}
              className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm" data-testid="filter-stage-type">
              <option value="">All Stages</option>
              <option value="qc">QC</option>
              <option value="labeling">Labeling</option>
              <option value="final_qc">Final QC</option>
            </select>
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
      ) : !report || report.rows.length === 0 ? (
        <div className="bg-slate-50 border border-slate-200 rounded-xl p-8 text-center">
          <AlertTriangle className="w-8 h-8 text-slate-300 mx-auto mb-2" />
          <p className="text-sm text-slate-500">No rejections found for the selected filters</p>
        </div>
      ) : (
        <>
          {/* Summary Cards */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="bg-red-50 border border-red-200 rounded-xl p-5">
              <div className="flex items-center gap-2 mb-2">
                <BarChart3 size={16} className="text-red-500" />
                <span className="text-xs text-red-500 font-semibold uppercase tracking-wider">Total Rejected</span>
              </div>
              <p className="text-3xl font-bold text-red-600" data-testid="total-rejected-count">{report.total_rejected.toLocaleString()}</p>
              <p className="text-[10px] text-red-400 mt-0.5">bottles</p>
            </div>

            <div className="bg-white border border-slate-200 rounded-xl p-5">
              <div className="flex items-center gap-2 mb-3">
                <User size={16} className="text-slate-500" />
                <span className="text-xs text-slate-500 font-semibold uppercase tracking-wider">By Resource</span>
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

            <div className="bg-white border border-slate-200 rounded-xl p-5">
              <div className="flex items-center gap-2 mb-3">
                <Calendar size={16} className="text-slate-500" />
                <span className="text-xs text-slate-500 font-semibold uppercase tracking-wider">By Date</span>
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
            <div className="px-5 py-3 border-b border-slate-100 flex items-center justify-between">
              <span className="text-sm font-semibold text-slate-800">Rejection Details ({report.rows.length})</span>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-slate-50 border-b border-slate-200">
                    {['Date', 'Batch', 'SKU', 'Stage', 'Resource', 'Crates Inspected', 'Rejected Count', 'Reason', 'Remarks'].map(h => (
                      <th key={h} className="text-left px-4 py-2.5 text-[10px] text-slate-500 uppercase tracking-wider font-medium whitespace-nowrap">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {report.rows.map((r) => (
                    <tr key={r.id} className="hover:bg-slate-50 transition-colors" data-testid={`rejection-row-${r.id}`}>
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
