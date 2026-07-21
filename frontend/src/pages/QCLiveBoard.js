import React, { useState, useEffect, useCallback, useRef } from 'react';
import { toast } from 'sonner';
import axios from 'axios';
import * as Icons from 'lucide-react';
import { Loader2, Users, Radio, Factory, RefreshCw } from 'lucide-react';

const API_URL = process.env.REACT_APP_BACKEND_URL + '/api';
const REFRESH_MS = 5000;

function getAuthHeaders() {
  const token = localStorage.getItem('token');
  const tenantId = localStorage.getItem('tenant_id');
  return { 'Authorization': `Bearer ${token}`, 'X-Tenant-ID': tenantId, 'Content-Type': 'application/json' };
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

// Fresh = updated in the last 90s → pulsing green "live" dot.
function isFresh(iso) {
  return iso && (Date.now() - new Date(iso).getTime()) < 90000;
}

export default function QCLiveBoard() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const timer = useRef(null);

  const fetchLive = useCallback(async (silent) => {
    if (!silent) setRefreshing(true);
    try {
      const { data } = await axios.get(`${API_URL}/production/qc-sessions/live`, { headers: getAuthHeaders() });
      setData(data);
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
    return () => clearInterval(timer.current);
  }, [fetchLive]);

  if (loading) return <div className="flex items-center justify-center h-[70vh]"><Loader2 className="w-8 h-8 animate-spin text-slate-400" /></div>;

  const sessions = data?.sessions || [];

  return (
    <div className="p-4 sm:p-8 max-w-[1300px] mx-auto" data-testid="qc-live-board">
      <div className="flex items-center justify-between gap-3 mb-6 flex-wrap">
        <div>
          <div className="flex items-center gap-2">
            <span className="relative flex h-3 w-3">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
              <span className="relative inline-flex rounded-full h-3 w-3 bg-emerald-500" />
            </span>
            <h1 className="text-3xl font-bold tracking-tight text-slate-800">QC Live Board</h1>
          </div>
          <p className="text-slate-500 mt-1">Who's inspecting what, right now · auto-refreshes every 5s</p>
        </div>
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2 bg-white border border-slate-200 rounded-xl px-4 py-2" data-testid="qc-live-operators">
            <Users size={16} className="text-slate-400" />
            <span className="text-sm font-semibold text-slate-700">{data?.active_operators || 0} active</span>
          </div>
          <button onClick={() => fetchLive(false)} className="p-2.5 rounded-xl bg-white border border-slate-200 hover:bg-slate-50" data-testid="qc-live-refresh">
            <RefreshCw size={16} className={`text-slate-500 ${refreshing ? 'animate-spin' : ''}`} />
          </button>
        </div>
      </div>

      {sessions.length === 0 ? (
        <div className="bg-slate-50 border border-slate-200 rounded-2xl p-12 text-center" data-testid="qc-live-empty">
          <Radio className="w-10 h-10 text-slate-300 mx-auto mb-3" />
          <p className="text-slate-700 font-medium">No active QC sessions</p>
          <p className="text-sm text-slate-500 mt-1">Sessions appear here the moment a QC operator opens a batch on their tablet</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4" data-testid="qc-live-grid">
          {sessions.map(s => {
            const fresh = isFresh(s.last_activity_at);
            const rate = s.crates_inspected > 0 ? ((s.total_rejected / s.crates_inspected)) : 0;
            return (
              <div key={s.id} className="bg-white border border-slate-200 rounded-2xl p-4 shadow-sm" data-testid={`qc-live-card-${s.id}`}>
                {/* Operator */}
                <div className="flex items-center gap-3 mb-3">
                  <div className="w-11 h-11 rounded-full bg-gradient-to-br from-slate-700 to-slate-900 text-white flex items-center justify-center font-bold text-sm flex-shrink-0">
                    {initials(s.operator_name)}
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="font-semibold text-slate-800 truncate">{s.operator_name || 'Operator'}</p>
                    <div className="flex items-center gap-1.5">
                      <span className={`inline-flex h-2 w-2 rounded-full ${fresh ? 'bg-emerald-500' : 'bg-slate-300'}`} />
                      <span className="text-[11px] text-slate-400">{fresh ? 'active' : 'idle'} · {timeAgo(s.last_activity_at)}</span>
                    </div>
                  </div>
                </div>

                {/* Batch + stage */}
                <div className="bg-slate-50 rounded-xl px-3 py-2 mb-3">
                  <div className="flex items-center gap-1.5 text-slate-700">
                    <Factory size={13} className="text-slate-400 flex-shrink-0" />
                    <span className="text-sm font-semibold truncate">{s.batch_number || s.sku_name || 'Batch'}</span>
                  </div>
                  <p className="text-[11px] text-slate-400 mt-0.5 truncate">{s.sku_name} · <span className="font-medium text-slate-500">{s.stage_name}</span></p>
                </div>

                {/* Metrics */}
                <div className="flex items-center gap-4 mb-3">
                  <div>
                    <p className="text-[10px] text-slate-400 uppercase tracking-wider">Crates</p>
                    <p className="text-xl font-extrabold text-slate-800">{s.crates_inspected}</p>
                  </div>
                  <div>
                    <p className="text-[10px] text-slate-400 uppercase tracking-wider">Rejected</p>
                    <p className="text-xl font-extrabold text-red-600" data-testid={`qc-live-rejected-${s.id}`}>{s.total_rejected}</p>
                  </div>
                  {s.crates_inspected > 0 && (
                    <div>
                      <p className="text-[10px] text-slate-400 uppercase tracking-wider">Rej/Crate</p>
                      <p className="text-xl font-extrabold text-amber-600">{rate.toFixed(1)}</p>
                    </div>
                  )}
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
                  <p className="text-[11px] text-slate-300 italic">No rejections tapped yet</p>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
