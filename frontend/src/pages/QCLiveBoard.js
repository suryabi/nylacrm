import React, { useState, useEffect, useCallback, useRef } from 'react';
import { toast } from 'sonner';
import axios from 'axios';
import { Loader2, Users, Radio, Factory, RefreshCw, Maximize, Minimize, Settings, AlertTriangle, Package, XCircle, ClipboardCheck, Check, FileDown, X, TrendingUp } from 'lucide-react';

const API_URL = process.env.REACT_APP_BACKEND_URL + '/api';
const REFRESH_MS = 5000;

function getAuthHeaders() {
  const token = localStorage.getItem('token');
  const tenantId = localStorage.getItem('tenant_id');
  return { 'Authorization': `Bearer ${token}`, 'X-Tenant-ID': tenantId, 'Content-Type': 'application/json' };
}

function minutesSince(iso) {
  if (!iso) return 0;
  return (Date.now() - new Date(iso).getTime()) / 60000;
}

function timeAgo(iso) {
  if (!iso) return '';
  const secs = Math.max(0, Math.floor((Date.now() - new Date(iso).getTime()) / 1000));
  if (secs < 10) return 'just now';
  if (secs < 60) return `${secs}s ago`;
  const mins = Math.floor(secs / 60);
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  return `${hrs}h ${mins % 60}m ago`;
}

function fmtTime(iso) {
  if (!iso) return '';
  try { return new Date(iso).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }); } catch { return ''; }
}

function initials(name) {
  return (name || '?').split(' ').map(s => s[0]).slice(0, 2).join('').toUpperCase();
}

// Tiny SVG sparkline over 24 hourly buckets.
const Sparkline = ({ hourly, color }) => {
  const max = Math.max(...hourly, 1);
  const w = 120, h = 28;
  const pts = hourly.map((v, i) => `${(i / 23) * w},${h - (v / max) * (h - 4) - 2}`).join(' ');
  return (
    <svg width={w} height={h} className="flex-shrink-0">
      <polyline points={pts} fill="none" stroke={color} strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" />
      {hourly.map((v, i) => v > 0 && (
        <circle key={i} cx={(i / 23) * w} cy={h - (v / max) * (h - 4) - 2} r="2" fill={color} />
      ))}
    </svg>
  );
};

// Batch drilldown modal: full stage-by-stage inspection history.
const DrillModal = ({ session, onClose, wall }) => {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      try {
        const { data } = await axios.get(`${API_URL}/production/batches/${session.batch_id}/history`, { headers: getAuthHeaders() });
        setData(data);
      } catch {
        toast.error('Failed to load batch history');
      } finally {
        setLoading(false);
      }
    })();
  }, [session.batch_id]);

  // Group inspections by stage
  const byStage = {};
  (data?.inspections || []).forEach(i => {
    const key = i.stage_name || i.stage_id || 'Stage';
    (byStage[key] = byStage[key] || []).push(i);
  });

  return (
    <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-sm flex items-center justify-center p-4" onClick={onClose} data-testid="qc-drill-modal">
      <div className={`w-full max-w-2xl max-h-[85vh] overflow-y-auto rounded-2xl ${wall ? 'bg-slate-900 text-slate-100' : 'bg-white text-slate-800'} shadow-2xl`} onClick={e => e.stopPropagation()}>
        <div className={`sticky top-0 px-5 py-4 border-b flex items-center justify-between ${wall ? 'bg-slate-900 border-slate-800' : 'bg-white border-slate-100'}`}>
          <div>
            <p className="font-bold text-lg leading-tight">{session.batch_number || session.sku_name || 'Batch'}</p>
            <p className={`text-xs ${wall ? 'text-slate-400' : 'text-slate-500'}`}>{session.sku_name} · full inspection history</p>
          </div>
          <button onClick={onClose} className={`p-2 rounded-lg ${wall ? 'hover:bg-slate-800' : 'hover:bg-slate-100'}`} data-testid="qc-drill-close">
            <X size={18} />
          </button>
        </div>
        <div className="p-5 space-y-5">
          {loading ? (
            <div className="flex justify-center py-10"><Loader2 className="w-6 h-6 animate-spin text-slate-400" /></div>
          ) : Object.keys(byStage).length === 0 ? (
            <p className={`text-sm text-center py-8 ${wall ? 'text-slate-400' : 'text-slate-500'}`}>No inspections recorded yet for this batch</p>
          ) : (
            Object.entries(byStage).map(([stageName, list]) => {
              const crates = list.reduce((a, i) => a + (i.qty_inspected || 0), 0);
              const rejected = list.reduce((a, i) => a + (i.qty_rejected || 0), 0);
              return (
                <div key={stageName} data-testid={`qc-drill-stage-${stageName}`}>
                  <div className="flex items-center justify-between mb-2">
                    <p className="font-semibold text-sm uppercase tracking-wide">{stageName}</p>
                    <p className={`text-xs ${wall ? 'text-slate-400' : 'text-slate-500'}`}>{crates} crates · <span className="text-red-500 font-semibold">{rejected} rejected</span></p>
                  </div>
                  <div className="space-y-2">
                    {list.map((insp, idx) => (
                      <div key={insp.id || idx} className={`rounded-xl px-3 py-2.5 ${wall ? 'bg-slate-800' : 'bg-slate-50'}`}>
                        <div className="flex items-center justify-between flex-wrap gap-1">
                          <p className="text-sm font-medium">{insp.inspected_by_name || 'Inspector'}</p>
                          <p className={`text-[11px] ${wall ? 'text-slate-400' : 'text-slate-400'}`}>{new Date(insp.inspected_at).toLocaleDateString()} {fmtTime(insp.inspected_at)}</p>
                        </div>
                        <p className={`text-xs mt-0.5 ${wall ? 'text-slate-400' : 'text-slate-500'}`}>
                          {insp.qty_inspected} crates inspected · <span className="text-red-500 font-medium">{insp.qty_rejected} rejected</span>
                        </p>
                        {(insp.entries || []).flatMap(e => e.rejections || []).length > 0 && (
                          <div className="flex flex-wrap gap-1 mt-1.5">
                            {(insp.entries || []).flatMap(e => e.rejections || []).map((rj, j) => (
                              <span key={j} className={`text-[10px] px-1.5 py-0.5 rounded-full ${wall ? 'bg-slate-700 text-slate-300' : 'bg-white border border-slate-200 text-slate-600'}`}>
                                {rj.reason} · {rj.qty_rejected}
                              </span>
                            ))}
                          </div>
                        )}
                        {insp.remarks && <p className={`text-[11px] italic mt-1 ${wall ? 'text-slate-500' : 'text-slate-400'}`}>{insp.remarks}</p>}
                      </div>
                    ))}
                  </div>
                </div>
              );
            })
          )}
        </div>
      </div>
    </div>
  );
};

export default function QCLiveBoard() {
  const [data, setData] = useState(null);
  const [trends, setTrends] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [wall, setWall] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [threshold, setThreshold] = useState(5);
  const [idleMin, setIdleMin] = useState(10);
  const [alertEmails, setAlertEmails] = useState('');
  const [savingSettings, setSavingSettings] = useState(false);
  const [downloading, setDownloading] = useState(false);
  const [drill, setDrill] = useState(null);
  const [, forceTick] = useState(0);
  const timer = useRef(null);
  const rootRef = useRef(null);
  const settingsLoaded = useRef(false);

  const fetchLive = useCallback(async (silent) => {
    if (!silent) setRefreshing(true);
    try {
      const [live, tr] = await Promise.all([
        axios.get(`${API_URL}/production/qc-sessions/live`, { headers: getAuthHeaders() }),
        axios.get(`${API_URL}/production/qc-reason-trends`, { headers: getAuthHeaders() }),
      ]);
      setData(live.data);
      setTrends(tr.data?.trends || []);
      if (live.data?.settings && !settingsLoaded.current) {
        setThreshold(live.data.settings.acceptable_reject_rate_pct);
        setIdleMin(live.data.settings.idle_alert_minutes);
        setAlertEmails((live.data.settings.alert_emails || []).join(', '));
        settingsLoaded.current = true;
      }
    } catch {
      if (!silent) toast.error('Failed to load live board');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    fetchLive(false);
    timer.current = setInterval(() => fetchLive(true), REFRESH_MS);
    const tick = setInterval(() => forceTick(n => n + 1), 15000);
    return () => { clearInterval(timer.current); clearInterval(tick); };
  }, [fetchLive]);

  const toggleWall = async () => {
    try {
      if (!document.fullscreenElement) {
        await rootRef.current?.requestFullscreen?.();
        setWall(true);
      } else {
        await document.exitFullscreen?.();
        setWall(false);
      }
    } catch {
      setWall(w => !w);
    }
  };

  useEffect(() => {
    const onFs = () => setWall(!!document.fullscreenElement);
    document.addEventListener('fullscreenchange', onFs);
    return () => document.removeEventListener('fullscreenchange', onFs);
  }, []);

  const saveSettings = async () => {
    setSavingSettings(true);
    try {
      await axios.put(`${API_URL}/production/qc-settings`, {
        acceptable_reject_rate_pct: Number(threshold),
        idle_alert_minutes: Number(idleMin),
        alert_emails: alertEmails.split(',').map(s => s.trim()).filter(Boolean),
      }, { headers: getAuthHeaders() });
      toast.success('QC settings saved');
      setShowSettings(false);
      fetchLive(true);
    } catch {
      toast.error('Failed to save settings');
    } finally {
      setSavingSettings(false);
    }
  };

  const downloadShiftReport = async () => {
    setDownloading(true);
    try {
      const res = await axios.get(`${API_URL}/production/qc-shift-report`, { headers: getAuthHeaders(), responseType: 'blob' });
      const url = URL.createObjectURL(new Blob([res.data], { type: 'application/pdf' }));
      const a = document.createElement('a');
      a.href = url;
      a.download = `qc-shift-report-${new Date().toISOString().slice(0, 10)}.pdf`;
      a.click();
      URL.revokeObjectURL(url);
      toast.success('Shift report downloaded');
    } catch {
      toast.error('Failed to generate shift report');
    } finally {
      setDownloading(false);
    }
  };

  if (loading) return <div className="flex items-center justify-center h-[70vh]"><Loader2 className="w-8 h-8 animate-spin text-slate-400" /></div>;

  const sessions = data?.sessions || [];
  const today = data?.today || {};
  const idleThreshold = data?.settings?.idle_alert_minutes ?? idleMin;
  const rejThreshold = data?.settings?.acceptable_reject_rate_pct ?? threshold;

  const t = wall
    ? { page: 'bg-slate-950 text-slate-100', sub: 'text-slate-400', card: 'bg-slate-900 border-slate-800',
        metricLabel: 'text-slate-500', title: 'text-white' }
    : { page: 'bg-transparent text-slate-800', sub: 'text-slate-500', card: 'bg-white border-slate-200 shadow-sm',
        metricLabel: 'text-slate-400', title: 'text-slate-800' };

  const StatCard = ({ icon: Icon, label, value, accent }) => (
    <div className={`rounded-2xl border px-4 py-3 flex items-center gap-3 ${t.card}`}>
      <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${accent}`}><Icon size={18} className="text-white" /></div>
      <div>
        <p className={`text-[10px] uppercase tracking-wider ${t.metricLabel}`}>{label}</p>
        <p className={`text-2xl font-extrabold leading-none mt-0.5 ${t.title}`}>{value}</p>
      </div>
    </div>
  );

  return (
    <div ref={rootRef} className={`${wall ? 'min-h-screen overflow-y-auto' : ''} ${t.page}`} data-testid="qc-live-board">
      <div className={`${wall ? 'p-6 lg:p-10' : 'p-4 sm:p-8'} max-w-[1500px] mx-auto`}>
        {/* Header */}
        <div className="flex items-center justify-between gap-3 mb-5 flex-wrap">
          <div>
            <div className="flex items-center gap-2">
              <span className="relative flex h-3 w-3">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
                <span className="relative inline-flex rounded-full h-3 w-3 bg-emerald-500" />
              </span>
              <h1 className={`${wall ? 'text-4xl' : 'text-3xl'} font-bold tracking-tight ${t.title}`}>QC Live Board</h1>
            </div>
            <p className={`${t.sub} mt-1`}>Who's inspecting what, right now · auto-refreshes every 5s</p>
          </div>
          <div className="flex items-center gap-2">
            <div className={`flex items-center gap-2 rounded-xl px-4 py-2 border ${t.card}`} data-testid="qc-live-operators">
              <Users size={16} className={t.sub} />
              <span className={`text-sm font-semibold ${t.title}`}>{data?.active_operators || 0} active</span>
            </div>
            <button onClick={downloadShiftReport} disabled={downloading}
              className={`px-3.5 py-2.5 rounded-xl border flex items-center gap-1.5 text-sm font-medium ${t.card} hover:opacity-80 disabled:opacity-50 ${t.title}`}
              data-testid="qc-shift-report-btn" title="Download today's shift report PDF">
              {downloading ? <Loader2 size={15} className="animate-spin" /> : <FileDown size={15} />} Shift Report
            </button>
            {!wall && (
              <button onClick={() => setShowSettings(v => !v)} className="p-2.5 rounded-xl bg-white border border-slate-200 hover:bg-slate-50" data-testid="qc-live-settings-btn" title="QC thresholds">
                <Settings size={16} className="text-slate-500" />
              </button>
            )}
            <button onClick={() => fetchLive(false)} className={`p-2.5 rounded-xl border ${t.card} hover:opacity-80`} data-testid="qc-live-refresh">
              <RefreshCw size={16} className={`${t.sub} ${refreshing ? 'animate-spin' : ''}`} />
            </button>
            <button onClick={toggleWall} className={`p-2.5 rounded-xl border ${t.card} hover:opacity-80`} data-testid="qc-live-wall-toggle" title="Big-screen wall mode">
              {wall ? <Minimize size={16} className={t.sub} /> : <Maximize size={16} className="text-slate-500" />}
            </button>
          </div>
        </div>

        {/* Settings popover */}
        {showSettings && !wall && (
          <div className="bg-white border border-slate-200 rounded-2xl p-5 mb-5 flex flex-wrap items-end gap-5" data-testid="qc-settings-panel">
            <div>
              <label className="text-[10px] text-slate-500 uppercase tracking-wider block mb-1">Acceptable reject rate (%)</label>
              <input type="number" step="0.5" min="0" value={threshold} onChange={e => setThreshold(e.target.value)}
                className="w-28 border border-slate-200 rounded-lg px-3 py-2 text-sm" data-testid="qc-threshold-input" />
            </div>
            <div>
              <label className="text-[10px] text-slate-500 uppercase tracking-wider block mb-1">Idle alert after (min)</label>
              <input type="number" min="1" value={idleMin} onChange={e => setIdleMin(e.target.value)}
                className="w-28 border border-slate-200 rounded-lg px-3 py-2 text-sm" data-testid="qc-idle-input" />
            </div>
            <div className="flex-1 min-w-[260px]">
              <label className="text-[10px] text-slate-500 uppercase tracking-wider block mb-1">Alert emails (comma-separated) — pinged when a batch crosses the threshold</label>
              <input value={alertEmails} onChange={e => setAlertEmails(e.target.value)} placeholder="supervisor@company.com, qa@company.com"
                className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm" data-testid="qc-alert-emails-input" />
            </div>
            <button onClick={saveSettings} disabled={savingSettings}
              className="px-4 py-2 text-sm font-medium text-white bg-emerald-600 hover:bg-emerald-700 rounded-lg disabled:opacity-50 flex items-center gap-1.5" data-testid="qc-settings-save">
              {savingSettings ? <Loader2 size={13} className="animate-spin" /> : <Check size={13} />} Save
            </button>
          </div>
        )}

        {/* Today's floor summary strip */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-5" data-testid="qc-today-summary">
          <StatCard icon={Package} label="Crates inspected today" value={today.crates_inspected ?? 0} accent="bg-blue-600" />
          <StatCard icon={XCircle} label="Rejected today" value={today.rejected ?? 0} accent="bg-red-600" />
          <StatCard icon={ClipboardCheck} label="Inspections submitted" value={today.inspections_submitted ?? 0} accent="bg-emerald-600" />
          <StatCard icon={Radio} label="Live sessions" value={today.live_sessions ?? 0} accent="bg-violet-600" />
        </div>

        {/* Today's defect trends (sparklines) */}
        {trends.length > 0 && (
          <div className={`rounded-2xl border p-4 mb-6 ${t.card}`} data-testid="qc-trends-panel">
            <div className="flex items-center gap-2 mb-3">
              <TrendingUp size={15} className={t.sub} />
              <p className={`text-sm font-semibold ${t.title}`}>Today's defect trends</p>
              <span className={`text-[11px] ${t.sub}`}>· by hour (UTC)</span>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-x-8 gap-y-3">
              {trends.slice(0, 6).map(tr => (
                <div key={tr.reason} className="flex items-center gap-3" data-testid={`qc-trend-${tr.reason}`}>
                  <span className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ backgroundColor: tr.color }} />
                  <div className="min-w-0 flex-1">
                    <p className={`text-xs font-medium truncate ${t.title}`}>{tr.reason}</p>
                    <p className={`text-[10px] ${t.sub}`}>{tr.total} today</p>
                  </div>
                  <Sparkline hourly={tr.hourly} color={tr.color} />
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Sessions */}
        {sessions.length === 0 ? (
          <div className={`rounded-2xl border p-12 text-center ${t.card}`} data-testid="qc-live-empty">
            <Radio className="w-10 h-10 text-slate-300 mx-auto mb-3" />
            <p className={`font-medium ${t.title}`}>No active QC sessions</p>
            <p className={`text-sm ${t.sub} mt-1`}>Sessions appear here the moment a QC operator opens a batch on their tablet</p>
          </div>
        ) : (
          <div className={`grid grid-cols-1 sm:grid-cols-2 ${wall ? 'lg:grid-cols-4' : 'lg:grid-cols-3'} gap-4`} data-testid="qc-live-grid">
            {sessions.map(s => {
              const idle = minutesSince(s.last_activity_at) >= idleThreshold;
              const over = s.over_threshold;
              const border = over ? 'border-red-400 ring-2 ring-red-200' : idle ? 'border-amber-400 ring-2 ring-amber-200' : (wall ? 'border-slate-800' : 'border-slate-200');
              return (
                <div key={s.id} onClick={() => setDrill(s)}
                  className={`rounded-2xl border p-4 cursor-pointer hover:shadow-lg transition-all active:scale-[0.99] ${wall ? 'bg-slate-900' : 'bg-white shadow-sm'} ${border}`}
                  data-testid={`qc-live-card-${s.id}`}>
                  {(over || idle) && (
                    <div className="flex flex-wrap gap-1.5 mb-2">
                      {over && (
                        <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-red-700 bg-red-50 border border-red-200 px-2 py-0.5 rounded-full" data-testid={`qc-over-threshold-${s.id}`}>
                          <AlertTriangle size={11} /> Reject rate high
                        </span>
                      )}
                      {idle && (
                        <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-amber-700 bg-amber-50 border border-amber-200 px-2 py-0.5 rounded-full" data-testid={`qc-idle-${s.id}`}>
                          <AlertTriangle size={11} /> Idle — check in
                        </span>
                      )}
                    </div>
                  )}
                  <div className="flex items-center gap-3 mb-3">
                    <div className={`w-11 h-11 rounded-full text-white flex items-center justify-center font-bold text-sm flex-shrink-0 ${idle ? 'bg-amber-500' : 'bg-gradient-to-br from-slate-700 to-slate-900'}`}>
                      {initials(s.operator_name)}
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className={`font-semibold truncate ${wall ? 'text-white' : 'text-slate-800'}`}>{s.operator_name || 'Operator'}</p>
                      <div className="flex items-center gap-1.5">
                        <span className={`inline-flex h-2 w-2 rounded-full ${idle ? 'bg-amber-500' : 'bg-emerald-500'}`} />
                        <span className="text-[11px] text-slate-400">{idle ? 'idle' : 'active'} · {timeAgo(s.last_activity_at)}</span>
                      </div>
                    </div>
                  </div>
                  <div className={`rounded-xl px-3 py-2 mb-3 ${wall ? 'bg-slate-800' : 'bg-slate-50'}`}>
                    <div className={`flex items-center gap-1.5 ${wall ? 'text-slate-200' : 'text-slate-700'}`}>
                      <Factory size={13} className="text-slate-400 flex-shrink-0" />
                      <span className="text-sm font-semibold truncate">{s.batch_number || s.sku_name || 'Batch'}</span>
                    </div>
                    <p className="text-[11px] text-slate-400 mt-0.5 truncate">{s.sku_name} · <span className="font-medium text-slate-500">{s.stage_name}</span></p>
                  </div>
                  <div className="flex items-center gap-4 mb-3">
                    <div>
                      <p className={`text-[10px] uppercase tracking-wider ${t.metricLabel}`}>Crates</p>
                      <p className={`text-xl font-extrabold ${wall ? 'text-white' : 'text-slate-800'}`}>{s.crates_inspected}</p>
                    </div>
                    <div>
                      <p className={`text-[10px] uppercase tracking-wider ${t.metricLabel}`}>Rejected</p>
                      <p className="text-xl font-extrabold text-red-500" data-testid={`qc-live-rejected-${s.id}`}>{s.total_rejected}</p>
                    </div>
                    <div>
                      <p className={`text-[10px] uppercase tracking-wider ${t.metricLabel}`}>Reject %</p>
                      <p className={`text-xl font-extrabold ${over ? 'text-red-600' : (wall ? 'text-slate-200' : 'text-slate-700')}`} data-testid={`qc-reject-rate-${s.id}`}>
                        {s.reject_rate_pct}%
                      </p>
                    </div>
                  </div>
                  {s.breakdown.length > 0 ? (
                    <div className="flex flex-wrap gap-1.5">
                      {s.breakdown.slice(0, 4).map(b => (
                        <span key={b.reason_id} className="inline-flex items-center gap-1 text-[11px] font-medium text-white px-2 py-1 rounded-full" style={{ backgroundColor: b.color }}>
                          {b.name} · {b.count}
                        </span>
                      ))}
                    </div>
                  ) : (
                    <p className="text-[11px] text-slate-400 italic">No rejections tapped yet</p>
                  )}
                </div>
              );
            })}
          </div>
        )}

        {!wall && (
          <p className="text-[11px] text-slate-400 mt-4">
            Tap a card for the batch's full inspection history · cards turn <span className="text-red-500 font-medium">red</span> above {rejThreshold}% reject rate · <span className="text-amber-500 font-medium">amber</span> when idle over {idleThreshold} min
          </p>
        )}
      </div>

      {drill && <DrillModal session={drill} onClose={() => setDrill(null)} wall={wall} />}
    </div>
  );
}
