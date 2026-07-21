import React, { useState, useEffect, useCallback, useRef } from 'react';
import { toast } from 'sonner';
import axios from 'axios';
import { Loader2, Users, Radio, Factory, RefreshCw, Maximize, Minimize, Settings, AlertTriangle, Package, XCircle, ClipboardCheck, Check } from 'lucide-react';

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

function initials(name) {
  return (name || '?').split(' ').map(s => s[0]).slice(0, 2).join('').toUpperCase();
}

export default function QCLiveBoard() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [wall, setWall] = useState(false);         // big-screen wall-display mode
  const [showSettings, setShowSettings] = useState(false);
  const [threshold, setThreshold] = useState(5);
  const [idleMin, setIdleMin] = useState(10);
  const [savingSettings, setSavingSettings] = useState(false);
  const [, forceTick] = useState(0);
  const timer = useRef(null);
  const rootRef = useRef(null);

  const fetchLive = useCallback(async (silent) => {
    if (!silent) setRefreshing(true);
    try {
      const { data } = await axios.get(`${API_URL}/production/qc-sessions/live`, { headers: getAuthHeaders() });
      setData(data);
      if (data?.settings) {
        setThreshold(data.settings.acceptable_reject_rate_pct);
        setIdleMin(data.settings.idle_alert_minutes);
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
    // Tick every 15s so "idle" recalculates even between fetches
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
      setWall(w => !w); // fallback: just toggle the layout
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
      await axios.put(`${API_URL}/production/qc-settings`,
        { acceptable_reject_rate_pct: Number(threshold), idle_alert_minutes: Number(idleMin) },
        { headers: getAuthHeaders() });
      toast.success('QC settings saved');
      setShowSettings(false);
      fetchLive(true);
    } catch {
      toast.error('Failed to save settings');
    } finally {
      setSavingSettings(false);
    }
  };

  if (loading) return <div className="flex items-center justify-center h-[70vh]"><Loader2 className="w-8 h-8 animate-spin text-slate-400" /></div>;

  const sessions = data?.sessions || [];
  const today = data?.today || {};
  const idleThreshold = data?.settings?.idle_alert_minutes ?? idleMin;
  const rejThreshold = data?.settings?.acceptable_reject_rate_pct ?? threshold;

  // Theme tokens: light dashboard vs dark wall display
  const t = wall
    ? { page: 'bg-slate-950 text-slate-100', sub: 'text-slate-400', card: 'bg-slate-900 border-slate-800',
        chipbg: 'bg-slate-800', metricLabel: 'text-slate-500', title: 'text-white' }
    : { page: 'bg-transparent text-slate-800', sub: 'text-slate-500', card: 'bg-white border-slate-200 shadow-sm',
        chipbg: 'bg-slate-50', metricLabel: 'text-slate-400', title: 'text-slate-800' };

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
    <div ref={rootRef} className={`${wall ? 'min-h-screen' : ''} ${t.page}`} data-testid="qc-live-board">
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
            <button onClick={saveSettings} disabled={savingSettings}
              className="px-4 py-2 text-sm font-medium text-white bg-emerald-600 hover:bg-emerald-700 rounded-lg disabled:opacity-50 flex items-center gap-1.5" data-testid="qc-settings-save">
              {savingSettings ? <Loader2 size={13} className="animate-spin" /> : <Check size={13} />} Save
            </button>
          </div>
        )}

        {/* Today's floor summary strip */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-6" data-testid="qc-today-summary">
          <StatCard icon={Package} label="Crates inspected today" value={today.crates_inspected ?? 0} accent="bg-blue-600" />
          <StatCard icon={XCircle} label="Rejected today" value={today.rejected ?? 0} accent="bg-red-600" />
          <StatCard icon={ClipboardCheck} label="Inspections submitted" value={today.inspections_submitted ?? 0} accent="bg-emerald-600" />
          <StatCard icon={Radio} label="Live sessions" value={today.live_sessions ?? 0} accent="bg-violet-600" />
        </div>

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
              // Card accent: red if over reject threshold, amber if idle, else normal.
              const border = over ? 'border-red-400 ring-2 ring-red-200' : idle ? 'border-amber-400 ring-2 ring-amber-200' : (wall ? 'border-slate-800' : 'border-slate-200');
              return (
                <div key={s.id} className={`rounded-2xl border p-4 ${wall ? 'bg-slate-900' : 'bg-white shadow-sm'} ${border} transition-all`} data-testid={`qc-live-card-${s.id}`}>
                  {/* Alerts */}
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
                  {/* Operator */}
                  <div className="flex items-center gap-3 mb-3">
                    <div className={`w-11 h-11 rounded-full text-white flex items-center justify-center font-bold text-sm flex-shrink-0 ${idle ? 'bg-amber-500' : 'bg-gradient-to-br from-slate-700 to-slate-900'}`}>
                      {initials(s.operator_name)}
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className={`font-semibold truncate ${wall ? 'text-white' : 'text-slate-800'}`}>{s.operator_name || 'Operator'}</p>
                      <div className="flex items-center gap-1.5">
                        <span className={`inline-flex h-2 w-2 rounded-full ${idle ? 'bg-amber-500' : 'bg-emerald-500'}`} />
                        <span className={`text-[11px] ${wall ? 'text-slate-400' : 'text-slate-400'}`}>{idle ? 'idle' : 'active'} · {timeAgo(s.last_activity_at)}</span>
                      </div>
                    </div>
                  </div>
                  {/* Batch + stage */}
                  <div className={`rounded-xl px-3 py-2 mb-3 ${wall ? 'bg-slate-800' : 'bg-slate-50'}`}>
                    <div className={`flex items-center gap-1.5 ${wall ? 'text-slate-200' : 'text-slate-700'}`}>
                      <Factory size={13} className="text-slate-400 flex-shrink-0" />
                      <span className="text-sm font-semibold truncate">{s.batch_number || s.sku_name || 'Batch'}</span>
                    </div>
                    <p className="text-[11px] text-slate-400 mt-0.5 truncate">{s.sku_name} · <span className="font-medium text-slate-500">{s.stage_name}</span></p>
                  </div>
                  {/* Metrics */}
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
                  {/* Top reasons */}
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
          <p className="text-[11px] text-slate-400 mt-4">Threshold: cards turn <span className="text-red-500 font-medium">red</span> above {rejThreshold}% reject rate · <span className="text-amber-500 font-medium">amber</span> when idle over {idleThreshold} min</p>
        )}
      </div>
    </div>
  );
}
