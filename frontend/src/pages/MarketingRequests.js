import React, { useEffect, useMemo, useState, useCallback } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import axios from 'axios';
import { format, parseISO, isValid, isPast, isToday } from 'date-fns';
import { Button } from '../components/ui/button';
import { Card, CardContent } from '../components/ui/card';
import { Input } from '../components/ui/input';
import { Badge } from '../components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '../components/ui/tabs';
import {
  Plus, Search, Sparkles, Clock, AlertTriangle, ChevronLeft, ChevronRight,
  LayoutList, Tag, User, Users, Calendar, X, Loader2, Truck, GitBranch,
} from 'lucide-react';
import { toast } from 'sonner';
import { useAuth } from '../context/AuthContext';

const API = `${process.env.REACT_APP_BACKEND_URL}/api`;
const HEAD = () => {
  const t = localStorage.getItem('token');
  return t ? { Authorization: `Bearer ${t}` } : {};
};

const TABLE_HEADER_CLASS = "text-left p-4 font-semibold text-emerald-800/70 uppercase tracking-wider text-xs";
const rowClass = (i) => `border-b border-emerald-50 transition-colors duration-200 cursor-pointer ${i % 2 === 1 ? 'bg-emerald-50/40' : 'bg-white'} hover:bg-emerald-50/60`;

const getInitials = (name) => {
  if (!name) return 'NA';
  const parts = name.trim().split(' ').filter(Boolean);
  if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase();
  return name.slice(0, 2).toUpperCase();
};
const formatDate = (s, fmt = 'MMM d, yyyy') => {
  if (!s) return null;
  try { const d = parseISO(s); return isValid(d) ? format(d, fmt) : null; } catch { return null; }
};
const isOverdueDate = (s) => { if (!s) return false; try { const d = parseISO(s); return isValid(d) && isPast(d) && !isToday(d); } catch { return false; } };
const stateBadgeStyle = (hex) => {
  if (!hex) return { background: '#f1f5f9', color: '#334155', borderColor: '#e2e8f0' };
  return { background: `${hex}1f`, color: hex, borderColor: `${hex}55` };
};

function MetricCard() { return null; } // legacy slot — replaced by TabsTrigger pills above

function StateChip({ state, count, isActive, onClick }) {
  const style = isActive
    ? { background: state.color || '#10b981', color: '#fff', borderColor: state.color || '#10b981' }
    : stateBadgeStyle(state.color);
  return (
    <button
      type="button"
      onClick={onClick}
      style={style}
      className={`inline-flex items-center gap-2 px-3 py-1.5 rounded-full border text-xs font-medium transition-shadow hover:shadow-sm ${isActive ? 'shadow-md' : ''}`}
      data-testid={`state-chip-${state.key}`}
    >
      <span>{state.label}</span>
      <span className={`text-[10px] rounded-full px-1.5 ${isActive ? 'bg-white/25' : 'bg-white/70'}`}>{count}</span>
    </button>
  );
}

function RequestTable({ rows, navigate }) {
  return (
    <Card className="border border-emerald-100/60 rounded-xl shadow-[0_2px_8px_rgba(6,95,70,0.04)]">
      <CardContent className="p-0">
        <div className="overflow-x-auto">
          <table className="w-full border-collapse text-sm">
            <thead>
              <tr className="bg-emerald-50/30 border-b border-emerald-100/60">
                {['Request', 'Lead', 'State', 'Assigned to', 'Due Date', 'Raised By'].map(h => (
                  <th key={h} className={TABLE_HEADER_CLASS}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.length === 0 ? (
                <tr><td colSpan={6} className="p-10 text-center text-slate-500">No requests in this view.</td></tr>
              ) : rows.map((req, i) => {
                const overdue = req.requested_due_date && req.current_state_key !== 'production_completed' && isOverdueDate(req.requested_due_date);
                const assignedTo = req.assigned_user_name
                  || req.assigned_department_name
                  || (req.assigned_role ? `Role: ${req.assigned_role}` : '—');
                const leadLabel = req.lead_company || req.lead_name;
                return (
                  <tr key={req.id} className={rowClass(i)} onClick={() => navigate(`/marketing-requests/${req.id}`)} data-testid={`mr-row-${req.id}`}>
                    <td className="p-4" style={{ maxWidth: 440 }}>
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-lg font-semibold text-slate-900 dark:text-white tracking-tight truncate" style={{ maxWidth: 380 }}>
                          {req.request_type_name || 'Untyped Request'}
                        </span>
                        {req.short_timeline_reason && (
                          <Badge variant="outline" className="text-[10px] bg-amber-50 text-amber-700 border-amber-200">
                            <Clock className="h-2.5 w-2.5 mr-0.5" /> Tight
                          </Badge>
                        )}
                      </div>
                      <div className="flex items-center gap-2 mt-1.5">
                        <span className="inline-flex items-center gap-1 text-[11px] text-emerald-700 bg-emerald-50 border border-emerald-100 px-1.5 py-0.5 rounded font-mono">
                          <Tag className="h-3 w-3" /> {req.request_number}
                        </span>
                        <span className="text-xs text-slate-500 line-clamp-1" style={{ maxWidth: 280 }}>
                          {req.requirement_details ? req.requirement_details.slice(0, 100) : ''}
                        </span>
                      </div>
                    </td>
                    <td className="p-4" data-testid={`mr-row-lead-${req.id}`}>
                      {leadLabel ? (
                        <div className="inline-flex items-center gap-2 rounded-lg bg-emerald-50 border border-emerald-200 pl-1.5 pr-2.5 py-1 max-w-[200px]">
                          <div className="w-6 h-6 rounded-md bg-emerald-600 flex items-center justify-center shrink-0">
                            <Users className="h-3.5 w-3.5 text-white" />
                          </div>
                          <span className="text-sm font-semibold text-emerald-800 truncate" title={leadLabel}>{leadLabel}</span>
                        </div>
                      ) : (
                        <span className="text-xs text-slate-300">No lead</span>
                      )}
                    </td>
                    <td className="p-4">
                      <Badge variant="outline" style={stateBadgeStyle(req.current_state_color)} className="border">
                        {req.current_state_label || req.current_state_key || 'unknown'}
                      </Badge>
                    </td>
                    <td className="p-4">
                      <Badge variant="outline" className="text-xs bg-white">{assignedTo}</Badge>
                      {req?.production?.assigned_delivery_department_name && (
                        <div className="text-[10px] text-orange-700 mt-1 flex items-center gap-1">
                          <Truck className="h-3 w-3" /> {req.production.assigned_delivery_department_name}
                        </div>
                      )}
                    </td>
                    <td className="p-4">
                      {req.requested_due_date ? (
                        <div className={`flex items-center gap-1.5 ${overdue ? 'text-red-600' : 'text-slate-600'}`}>
                          <Calendar className="h-4 w-4" /> {formatDate(req.requested_due_date, 'MMM d, yyyy')}
                          {overdue && <AlertTriangle className="h-3 w-3" />}
                        </div>
                      ) : <span className="text-slate-400">—</span>}
                    </td>
                    <td className="p-4">
                      <div className="flex items-center gap-2">
                        <div className="w-8 h-8 rounded-full bg-emerald-100 border-2 border-white flex items-center justify-center text-xs font-medium text-emerald-700" title={req.created_by_name}>
                          {getInitials(req.created_by_name)}
                        </div>
                        <span className="text-sm text-slate-700">{req.created_by_name}</span>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </CardContent>
    </Card>
  );
}

export default function MarketingRequests() {
  const navigate = useNavigate();
  const { user } = useAuth(); // eslint-disable-line no-unused-vars
  const [sp, setSp] = useSearchParams();

  const [queue, setQueue] = useState(sp.get('queue') || 'all');
  const [stateKey, setStateKey] = useState(sp.get('state') || '');
  const [search, setSearch] = useState(sp.get('q') || '');
  const [page, setPage] = useState(parseInt(sp.get('p') || '1'));
  const [loading, setLoading] = useState(false);
  const [data, setData] = useState({ items: [], total: 0, pages: 0 });
  const [counts, setCounts] = useState({ by_state: {}, queues: { my_raised: 0, my_assigned: 0, all: 0 }, states: [], state_machine_name: '' });

  const fetchList = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ queue, page: String(page), limit: '20' });
      if (search) params.set('search', search);
      if (stateKey) params.set('state_key', stateKey);
      const { data } = await axios.get(`${API}/marketing-requests?${params}`, { headers: HEAD() });
      setData(data || { items: [], total: 0, pages: 0 });
    } catch (e) {
      toast.error(e.response?.data?.detail || 'Failed to load requests');
    } finally { setLoading(false); }
  }, [queue, page, search, stateKey]);

  const fetchCounts = useCallback(async () => {
    try {
      const { data } = await axios.get(`${API}/marketing-requests/counts`, { headers: HEAD() });
      setCounts(data || {});
    } catch { /* ignore */ }
  }, []);

  useEffect(() => { fetchList(); }, [queue, page, stateKey]); // eslint-disable-line
  useEffect(() => { fetchCounts(); }, [fetchCounts]);

  useEffect(() => {
    const next = new URLSearchParams();
    next.set('queue', queue);
    if (stateKey) next.set('state', stateKey);
    if (search) next.set('q', search);
    if (page > 1) next.set('p', String(page));
    setSp(next, { replace: true });
  }, [queue, stateKey, search, page]); // eslint-disable-line

  const switchQueue = (next) => { setQueue(next); setPage(1); };
  const switchState = (key) => { setStateKey(prev => prev === key ? '' : key); setPage(1); };

  const filteredItems = useMemo(() => {
    if (!search) return data.items || [];
    const q = search.toLowerCase();
    return (data.items || []).filter(r =>
      (r.request_type_name || '').toLowerCase().includes(q) ||
      (r.request_number || '').toLowerCase().includes(q) ||
      (r.requirement_details || '').toLowerCase().includes(q),
    );
  }, [data.items, search]);

  const queueCount = (k) => counts?.queues?.[k] ?? 0;
  const stateCount = (k) => counts?.by_state?.[k] ?? 0;

  const metrics = [
    { key: 'all',         label: 'All Requests', icon: LayoutList, color: 'text-slate-700',    bg: 'bg-slate-50',    iconBg: 'bg-slate-100',    value: queueCount('all') },
    { key: 'my_raised',   label: 'Raised By Me', icon: User,       color: 'text-emerald-700',  bg: 'bg-emerald-50',  iconBg: 'bg-emerald-100',  value: queueCount('my_raised') },
    { key: 'my_assigned', label: 'Assigned To Me', icon: Users,    color: 'text-blue-700',     bg: 'bg-blue-50',     iconBg: 'bg-blue-100',     value: queueCount('my_assigned') },
  ];

  const states = counts.states || [];

  return (
    <div className="p-6 space-y-6" data-testid="marketing-requests-page">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 dark:text-white tracking-tight flex items-center gap-2">
            <Sparkles className="h-6 w-6 text-emerald-600" /> Marketing Requests
          </h1>
          <p className="text-sm text-slate-500 dark:text-slate-400 mt-1 flex items-center gap-1.5">
            <GitBranch className="h-3.5 w-3.5" />
            Lifecycle:&nbsp;
            <span className="font-medium text-slate-700">{counts.state_machine_name || 'No state machine attached'}</span>
          </p>
        </div>
        <Button onClick={() => navigate('/marketing-requests/new')} className="bg-emerald-600 hover:bg-emerald-700" data-testid="new-marketing-request-btn">
          <Plus className="h-4 w-4 mr-2" /> New Request
        </Button>
      </div>

      {/* Queue tabs as metric cards */}
      <Tabs value={queue} onValueChange={switchQueue} className="space-y-5">
        <TabsList className="bg-slate-100 dark:bg-slate-800 p-1 h-11">
          {metrics.map(m => (
            <TabsTrigger key={m.key} value={m.key} className="data-[state=active]:bg-white px-5" data-testid={`tab-${m.key}`}>
              <m.icon className="h-4 w-4 mr-2" /> {m.label}
              <span className="ml-2 text-[10px] bg-slate-200 dark:bg-slate-700 px-1.5 rounded">{m.value}</span>
            </TabsTrigger>
          ))}
        </TabsList>

        {metrics.map(m => (
          <TabsContent key={m.key} value={m.key} className="space-y-5">
            {/* Dynamic state chips */}
            {states.length > 0 && (
              <div className="flex flex-wrap items-center gap-2" data-testid="state-chips">
                <span className="text-xs text-slate-500 mr-1">Filter by state:</span>
                {states.map(s => (
                  <StateChip
                    key={s.key}
                    state={s}
                    count={stateCount(s.key)}
                    isActive={stateKey === s.key}
                    onClick={() => switchState(s.key)}
                  />
                ))}
                {stateKey && (
                  <Button variant="ghost" size="sm" onClick={() => setStateKey('')} className="text-red-500 hover:text-red-600 hover:bg-red-50">
                    <X className="h-3.5 w-3.5 mr-1" /> Clear
                  </Button>
                )}
              </div>
            )}

            <div className="space-y-4">
              <div className="flex flex-wrap items-center gap-2">
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
                  <Input
                    placeholder="Search by type, number or details…"
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    className="pl-9 w-64"
                    data-testid="mr-search-input"
                  />
                </div>
                {search && (
                  <Button variant="ghost" size="sm" onClick={() => setSearch('')} className="text-red-500 hover:text-red-600 hover:bg-red-50">
                    <X className="h-4 w-4 mr-1" /> Clear
                  </Button>
                )}
                <div className="ml-auto text-xs text-slate-500">
                  Showing {filteredItems.length} {filteredItems.length === 1 ? 'result' : 'results'}
                </div>
              </div>

              {loading ? (
                <div className="flex items-center justify-center h-64"><Loader2 className="h-8 w-8 animate-spin text-emerald-600" /></div>
              ) : (
                <>
                  <RequestTable rows={filteredItems} navigate={navigate} />
                  {data.pages > 1 && (
                    <div className="flex items-center justify-between text-xs text-slate-600 px-1">
                      <span>Page {data.page || page} of {data.pages} &middot; {data.total} total</span>
                      <div className="flex items-center gap-1">
                        <Button size="sm" variant="outline" disabled={page <= 1} onClick={() => setPage(p => p - 1)} data-testid="mr-prev-page">
                          <ChevronLeft className="h-4 w-4" />
                        </Button>
                        <Button size="sm" variant="outline" disabled={page >= data.pages} onClick={() => setPage(p => p + 1)} data-testid="mr-next-page">
                          <ChevronRight className="h-4 w-4" />
                        </Button>
                      </div>
                    </div>
                  )}
                </>
              )}
            </div>
          </TabsContent>
        ))}
      </Tabs>

      {/* End of view */}
    </div>
  );
}
