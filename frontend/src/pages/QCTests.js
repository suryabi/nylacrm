import React, { useState, useEffect, useCallback } from 'react';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Label } from '../components/ui/label';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '../components/ui/dialog';
import { FlaskConical, Download, RefreshCw, Search, Pencil, Plus, Trash2 } from 'lucide-react';
import { toast } from 'sonner';

const API_URL = process.env.REACT_APP_BACKEND_URL;
const authHeaders = () => ({ Authorization: `Bearer ${localStorage.getItem('token')}`, 'Content-Type': 'application/json' });

const fmt = (d) => (d ? new Date(d).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }) : '—');

function ResultChip({ result }) {
  const pass = result === 'pass';
  return (
    <span className={`inline-flex items-center px-2.5 py-1 rounded-sm border text-xs font-bold uppercase tracking-wider ${pass ? 'bg-green-50 text-green-700 border-green-300' : 'bg-red-50 text-red-700 border-red-300'}`}
      data-testid={`qc-result-${result}`}>
      {pass ? 'Pass' : 'Reject'}
    </span>
  );
}

const TH = 'px-4 py-3 text-left text-xs font-semibold uppercase tracking-[0.05em] text-slate-500 whitespace-nowrap';

export default function QCTests() {
  const [tests, setTests] = useState([]);
  const [counts, setCounts] = useState({});
  const [latestAttempts, setLatestAttempts] = useState({});
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [sampleType, setSampleType] = useState('');
  const [result, setResult] = useState('');
  const [editRec, setEditRec] = useState(null);
  const [retest, setRetest] = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (search.trim()) params.set('search', search.trim());
      if (sampleType) params.set('sample_type', sampleType);
      if (result) params.set('result', result);
      const r = await fetch(`${API_URL}/api/production/qc-tests?${params}`, { headers: authHeaders() });
      const d = await r.json();
      setTests(d.tests || []);
      setCounts(d.counts || {});
      setLatestAttempts(d.latest_attempts || {});
    } catch { toast.error('Failed to load QC tests'); }
    setLoading(false);
  }, [search, sampleType, result]);
  useEffect(() => { load(); }, [load]);

  const downloadExcel = async () => {
    try {
      const params = new URLSearchParams();
      if (search.trim()) params.set('search', search.trim());
      if (sampleType) params.set('sample_type', sampleType);
      if (result) params.set('result', result);
      const r = await fetch(`${API_URL}/api/production/qc-tests/export/excel?${params}`, { headers: authHeaders() });
      if (!r.ok) throw new Error('Export failed');
      const blob = await r.blob();
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = `QC Tests - ${new Date().toISOString().slice(0, 10)}.xlsx`;
      a.click();
      URL.revokeObjectURL(a.href);
      toast.success('Excel downloaded');
    } catch (e) { toast.error(e.message); }
  };

  const saveEdit = async () => {
    try {
      const r = await fetch(`${API_URL}/api/production/qc-tests/${editRec.id}`, {
        method: 'PUT', headers: authHeaders(),
        body: JSON.stringify({
          sample_type: editRec.sample_type, test_result: editRec.test_result,
          testing_date: editRec.testing_date, reviewed_date: editRec.reviewed_date,
        }),
      });
      if (!r.ok) throw new Error((await r.json()).detail || 'Save failed');
      toast.success('QC test updated');
      setEditRec(null); load();
    } catch (e) { toast.error(e.message); }
  };

  const saveRetest = async () => {
    try {
      const r = await fetch(`${API_URL}/api/production/qc-tests/batch/${retest.batch_id}/retest`, {
        method: 'POST', headers: authHeaders(),
        body: JSON.stringify({
          test_result: retest.test_result, testing_date: retest.testing_date,
          reviewed_date: retest.reviewed_date,
        }),
      });
      if (!r.ok) throw new Error((await r.json()).detail || 'Retest failed');
      toast.success(`Retest attempt recorded (${retest.test_result})`);
      setRetest(null); load();
    } catch (e) { toast.error(e.message); }
  };

  const delAttempt = async (t) => {
    if (!window.confirm(`Delete attempt ${t.attempt} for ${t.batch_code}?`)) return;
    try {
      const r = await fetch(`${API_URL}/api/production/qc-tests/${t.id}`, { method: 'DELETE', headers: authHeaders() });
      if (!r.ok) throw new Error((await r.json()).detail || 'Delete failed');
      load();
    } catch (e) { toast.error(e.message); }
  };

  // latest attempt per batch (server-computed, unaffected by filters)
  const latestAttempt = latestAttempts;

  return (
    <div className="p-6 lg:p-8 max-w-[1300px] mx-auto space-y-6" data-testid="qc-tests-page">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900 flex items-center gap-2">
            <FlaskConical className="h-6 w-6 text-[#002FA7]" /> QC Tests
          </h1>
          <p className="text-slate-500 text-sm mt-1">Quality test log per production batch — Production samples pass first time; Trial samples are retested until Pass.</p>
        </div>
        <Button className="rounded-sm bg-[#002FA7] hover:bg-[#00227A] text-white" onClick={downloadExcel} data-testid="qc-download-excel-btn">
          <Download className="h-4 w-4 mr-1.5" /> Download Excel
        </Button>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-5 border border-slate-200 rounded-sm bg-white divide-x divide-slate-200 overflow-hidden">
        {[
          { label: 'Total Tests', value: counts.total },
          { label: 'Production', value: counts.production },
          { label: 'Trial', value: counts.trial },
          { label: 'Pass', value: counts.pass, cls: 'text-green-700' },
          { label: 'Reject', value: counts.reject, cls: 'text-red-600' },
        ].map((s) => (
          <div key={s.label} className="p-4">
            <p className="text-[10px] font-semibold uppercase tracking-[0.08em] text-slate-500 mb-1">{s.label}</p>
            <p className={`font-mono text-xl font-semibold tabular-nums ${s.cls || 'text-slate-900'}`}>{s.value ?? '—'}</p>
          </div>
        ))}
      </div>

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative">
          <Search className="h-4 w-4 absolute left-2.5 top-2.5 text-slate-400" />
          <Input className="h-9 pl-8 w-64 rounded-sm" placeholder="Search batch code…" value={search} onChange={(e) => setSearch(e.target.value)} data-testid="qc-search-input" />
        </div>
        <select className="h-9 rounded-sm border border-slate-300 bg-white px-2 text-sm" value={sampleType} onChange={(e) => setSampleType(e.target.value)} data-testid="qc-sample-type-filter">
          <option value="">All sample types</option>
          <option value="production">Production</option>
          <option value="trial">Trial</option>
        </select>
        <select className="h-9 rounded-sm border border-slate-300 bg-white px-2 text-sm" value={result} onChange={(e) => setResult(e.target.value)} data-testid="qc-result-filter">
          <option value="">All results</option>
          <option value="pass">Pass</option>
          <option value="reject">Reject</option>
        </select>
      </div>

      {/* Table */}
      {loading ? (
        <div className="flex items-center justify-center py-20 text-slate-500"><RefreshCw className="h-5 w-5 animate-spin mr-2" /> Loading…</div>
      ) : (
        <div className="bg-white border border-slate-200 rounded-sm overflow-x-auto">
          <table className="w-full text-sm" data-testid="qc-tests-table">
            <thead><tr className="border-b border-slate-200 bg-slate-50">
              <th className={TH}>Production Batch</th>
              <th className={TH}>Production Date</th>
              <th className={TH}>Sample Type</th>
              <th className={`${TH} text-center`}>Attempt</th>
              <th className={TH}>Testing Date</th>
              <th className={TH}>Tested By</th>
              <th className={TH}>Test Result</th>
              <th className={TH}>Reviewed / Approved By</th>
              <th className={TH}>Reviewed Date</th>
              <th className={`${TH} w-28`}></th>
            </tr></thead>
            <tbody>
              {tests.length === 0 && (
                <tr><td colSpan={10} className="px-4 py-12 text-center text-slate-500" data-testid="qc-empty">No QC tests match the current filters.</td></tr>
              )}
              {tests.map((t) => {
                const isLatest = latestAttempt[t.batch_id] === t.attempt;
                const canRetest = t.sample_type === 'trial' && t.test_result === 'reject' && isLatest;
                return (
                  <tr key={t.id} className="border-b border-slate-100 hover:bg-slate-50 transition-colors group" data-testid={`qc-row-${t.batch_code}-${t.attempt}`}>
                    <td className="px-4 py-3">
                      <p className="font-semibold text-slate-900">{t.batch_code}</p>
                      {t.sku_name && <p className="text-xs text-slate-500">{t.sku_name}</p>}
                    </td>
                    <td className="px-4 py-3 font-mono text-xs text-slate-600 whitespace-nowrap">{fmt(t.production_date)}</td>
                    <td className="px-4 py-3">
                      <span className={`inline-flex items-center px-2 py-0.5 rounded-sm border text-xs font-medium ${t.sample_type === 'production' ? 'bg-[#002FA7]/5 text-[#002FA7] border-[#002FA7]/30' : 'bg-amber-50 text-amber-800 border-amber-300'}`}>
                        {t.sample_type === 'production' ? 'Production' : 'Trial'}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-center font-mono text-slate-700">{t.attempt}</td>
                    <td className="px-4 py-3 font-mono text-xs text-slate-600 whitespace-nowrap">{fmt(t.testing_date)}</td>
                    <td className="px-4 py-3 text-slate-700">{t.tested_by}</td>
                    <td className="px-4 py-3"><ResultChip result={t.test_result} /></td>
                    <td className="px-4 py-3 text-slate-700">{t.reviewed_by}</td>
                    <td className="px-4 py-3 font-mono text-xs text-slate-600 whitespace-nowrap">{fmt(t.reviewed_date)}</td>
                    <td className="px-4 py-3">
                      <div className="flex items-center justify-end gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                        {canRetest && (
                          <Button size="sm" variant="outline" className="h-7 rounded-sm text-xs border-[#002FA7]/40 text-[#002FA7]"
                            onClick={() => setRetest({ batch_id: t.batch_id, batch_code: t.batch_code, next_attempt: t.attempt + 1, test_result: 'pass', testing_date: new Date().toISOString().slice(0, 10), reviewed_date: new Date().toISOString().slice(0, 10) })}
                            data-testid={`qc-retest-${t.batch_code}`}>
                            <Plus className="h-3 w-3 mr-0.5" /> Retest
                          </Button>
                        )}
                        <Button size="icon" variant="ghost" className="h-7 w-7 rounded-sm" onClick={() => setEditRec({ ...t })} data-testid={`qc-edit-${t.batch_code}-${t.attempt}`}>
                          <Pencil className="h-3.5 w-3.5 text-slate-500" />
                        </Button>
                        {t.sample_type === 'trial' && t.attempt > 1 && isLatest && (
                          <Button size="icon" variant="ghost" className="h-7 w-7 rounded-sm text-red-500 hover:bg-red-50" onClick={() => delAttempt(t)} data-testid={`qc-delete-${t.batch_code}-${t.attempt}`}>
                            <Trash2 className="h-3.5 w-3.5" />
                          </Button>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* Edit dialog */}
      <Dialog open={!!editRec} onOpenChange={(o) => !o && setEditRec(null)}>
        <DialogContent className="sm:max-w-md" data-testid="qc-edit-dialog">
          <DialogHeader>
            <DialogTitle>Edit QC Test — {editRec?.batch_code} (Attempt {editRec?.attempt})</DialogTitle>
            <DialogDescription>Production samples always Pass with a single attempt. Trials can Pass or Reject.</DialogDescription>
          </DialogHeader>
          {editRec && (
            <div className="space-y-4">
              <div>
                <Label>Sample Type</Label>
                <select className="mt-1 h-10 w-full rounded-sm border border-slate-300 bg-white px-3 text-sm" value={editRec.sample_type}
                  onChange={(e) => setEditRec((p) => ({ ...p, sample_type: e.target.value, test_result: e.target.value === 'production' ? 'pass' : p.test_result }))}
                  data-testid="qc-edit-sample-type">
                  <option value="production">Production</option>
                  <option value="trial">Trial</option>
                </select>
              </div>
              <div>
                <Label>Test Result</Label>
                <select className="mt-1 h-10 w-full rounded-sm border border-slate-300 bg-white px-3 text-sm disabled:bg-slate-50 disabled:text-slate-400"
                  value={editRec.test_result} disabled={editRec.sample_type === 'production'}
                  onChange={(e) => setEditRec((p) => ({ ...p, test_result: e.target.value }))} data-testid="qc-edit-result">
                  <option value="pass">Pass</option>
                  <option value="reject">Reject</option>
                </select>
                {editRec.sample_type === 'production' && <p className="text-xs text-slate-500 mt-1">Production samples are always Pass.</p>}
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div><Label>Testing Date</Label><Input type="date" className="mt-1 h-10 rounded-sm" value={editRec.testing_date} onChange={(e) => setEditRec((p) => ({ ...p, testing_date: e.target.value }))} data-testid="qc-edit-testing-date" /></div>
                <div><Label>Reviewed Date</Label><Input type="date" className="mt-1 h-10 rounded-sm" value={editRec.reviewed_date} onChange={(e) => setEditRec((p) => ({ ...p, reviewed_date: e.target.value }))} data-testid="qc-edit-reviewed-date" /></div>
              </div>
              <div className="flex justify-end gap-2">
                <Button variant="outline" className="rounded-sm" onClick={() => setEditRec(null)}>Cancel</Button>
                <Button className="rounded-sm bg-[#002FA7] hover:bg-[#00227A] text-white" onClick={saveEdit} data-testid="qc-edit-save">Save</Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Retest dialog */}
      <Dialog open={!!retest} onOpenChange={(o) => !o && setRetest(null)}>
        <DialogContent className="sm:max-w-md" data-testid="qc-retest-dialog">
          <DialogHeader>
            <DialogTitle>Add Retest — {retest?.batch_code} (Attempt {retest?.next_attempt})</DialogTitle>
            <DialogDescription>Record the next test attempt for this trial sample.</DialogDescription>
          </DialogHeader>
          {retest && (
            <div className="space-y-4">
              <div>
                <Label>Test Result</Label>
                <select className="mt-1 h-10 w-full rounded-sm border border-slate-300 bg-white px-3 text-sm" value={retest.test_result}
                  onChange={(e) => setRetest((p) => ({ ...p, test_result: e.target.value }))} data-testid="qc-retest-result">
                  <option value="pass">Pass</option>
                  <option value="reject">Reject</option>
                </select>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div><Label>Testing Date</Label><Input type="date" className="mt-1 h-10 rounded-sm" value={retest.testing_date} onChange={(e) => setRetest((p) => ({ ...p, testing_date: e.target.value }))} data-testid="qc-retest-testing-date" /></div>
                <div><Label>Reviewed Date</Label><Input type="date" className="mt-1 h-10 rounded-sm" value={retest.reviewed_date} onChange={(e) => setRetest((p) => ({ ...p, reviewed_date: e.target.value }))} data-testid="qc-retest-reviewed-date" /></div>
              </div>
              <div className="flex justify-end gap-2">
                <Button variant="outline" className="rounded-sm" onClick={() => setRetest(null)}>Cancel</Button>
                <Button className="rounded-sm bg-[#002FA7] hover:bg-[#00227A] text-white" onClick={saveRetest} data-testid="qc-retest-save">Record Attempt</Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
