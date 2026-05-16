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
  LayoutList, Inbox, ArrowRight, Eye, CheckCircle2, Truck, Loader2, Tag,
  User, Users, Calendar, X,
} from 'lucide-react';
import { toast } from 'sonner';
import { useAuth } from '../context/AuthContext';

const API = `${process.env.REACT_APP_BACKEND_URL}/api`;
const HEAD = () => {
  const t = localStorage.getItem('token');
  return t ? { Authorization: `Bearer ${t}` } : {};
};

// ─── Status visual styles (match Task Management severity/status pattern) ──
const STATUS_STYLES = {
  submitted:               { label: 'Submitted',         color: 'text-slate-700',   bg: 'bg-slate-100',   ring: 'border-slate-300' },
  inputs_needed:           { label: 'Inputs Needed',     color: 'text-amber-700',   bg: 'bg-amber-100',   ring: 'border-amber-300' },
  in_progress:             { label: 'In Progress',       color: 'text-blue-700',    bg: 'bg-blue-100',    ring: 'border-blue-300' },
  in_review:               { label: 'In Review',         color: 'text-violet-700',  bg: 'bg-violet-100',  ring: 'border-violet-300' },
  approved_internal:       { label: 'Approved (Internal)', color: 'text-indigo-700', bg: 'bg-indigo-100', ring: 'border-indigo-300' },
  final_approved:          { label: 'Final Approved',    color: 'text-emerald-700', bg: 'bg-emerald-100', ring: 'border-emerald-300' },
  production_in_progress:  { label: 'Production',        color: 'text-orange-700',  bg: 'bg-orange-100',  ring: 'border-orange-300' },
  production_completed:    { label: 'Completed',         color: 'text-green-700',   bg: 'bg-green-100',   ring: 'border-green-300' },
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

// ─── Metric Card (clones TaskManagement MetricCard) ──────────
function MetricCard({ label, value, icon: Icon, color, bg, iconBg, isActive, onClick, testId }) {
  return (
    <Card
      onClick={onClick}
      className={`border rounded-xl shadow-[0_2px_8px_rgba(6,95,70,0.04)] hover:shadow-[0_8px_24px_rgba(6,95,70,0.08)] hover:-translate-y-[2px] transition-[transform,box-shadow] duration-300 cursor-pointer ${bg} ${isActive ? 'ring-2 ring-emerald-500 border-emerald-300' : 'border-emerald-100/60'}`}
      data-testid={testId}
    >
      <CardContent className="p-4">
        <div className="flex items-center gap-3">
          <div className={`p-2 rounded-xl ${iconBg}`}><Icon className={`h-4 w-4 ${color}`} /></div>
          <div>
            <p className="text-xl font-light text-slate-900 dark:text-white">{value}</p>
            <p className="text-[10px] text-slate-500 uppercase tracking-wider">{label}</p>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

// ─── Request Row (Request Type is the prominent element) ─────
function RequestTable({ rows, navigate }) {
  return (
    <Card className="border border-emerald-100/60 rounded-xl shadow-[0_2px_8px_rgba(6,95,70,0.04)]">
      <CardContent className="p-0">
        <div className="overflow-x-auto">
          <table className="w-full border-collapse text-sm">
            <thead>
              <tr className="bg-emerald-50/30 border-b border-emerald-100/60">
                {['Request', 'Status', 'Assigned to', 'Due Date', 'Raised By'].map(h => (
                  <th key={h} className={TABLE_HEADER_CLASS}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.length === 0 ? (
                <tr><td colSpan={5} className="p-10 text-center text-slate-500">No requests in this view.</td></tr>
              ) : rows.map((req, i) => {
                const st = STATUS_STYLES[req.status_key] || STATUS_STYLES.submitted;
                const overdue = req.requested_due_date && req.status_key !== 'production_completed' && isOverdueDate(req.requested_due_date);
                return (
                  <tr key={req.id} className={rowClass(i)} onClick={() => navigate(`/marketing-requests/${req.id}`)} data-testid={`mr-row-${req.id}`}>
                    {/* Request Type (prominent) + tag chip with number + tight-timeline pill */}
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
                    <td className="p-4">
                      <Badge variant="outline" className={`${st.bg} ${st.color} border ${st.ring}`}>{st.label}</Badge>
                    </td>
                    <td className="p-4">
                      <Badge variant="outline" className="text-xs bg-white">{req.assigned_department_name || '—'}</Badge>
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

// ─── Metric→Queue mapping ──────────────────────────────────
const MY_METRICS = (counts) => [
  { key: 'my_requests',            label: 'Total Requests', icon: LayoutList,  color: 'text-slate-700',   bg: 'bg-slate-50',   iconBg: 'bg-slate-100' },
  { key: 'my_inputs_needed',       label: 'Inputs Needed',  icon: AlertTriangle, color: 'text-amber-600', bg: 'bg-amber-50',   iconBg: 'bg-amber-100' },
  { key: 'my_in_progress',         label: 'In Progress',    icon: ArrowRight,    color: 'text-blue-600',  bg: 'bg-blue-50',    iconBg: 'bg-blue-100' },
  { key: 'my_approved',            label: 'Approved',       icon: CheckCircle2,  color: 'text-emerald-600',bg: 'bg-emerald-50',iconBg: 'bg-emerald-100' },
  { key: 'my_sent_for_production', label: 'In Production',  icon: Truck,         color: 'text-orange-600',bg: 'bg-orange-50',  iconBg: 'bg-orange-100' },
].map(m => ({ ...m, value: counts[m.key] || 0 }));

const ALL_METRICS = (counts) => [
  { key: 'new_requests',           label: 'New',             icon: Inbox,         color: 'text-slate-700',  bg: 'bg-slate-50',  iconBg: 'bg-slate-100' },
  { key: 'inputs_needed',          label: 'Inputs Needed',   icon: AlertTriangle, color: 'text-amber-600',  bg: 'bg-amber-50',  iconBg: 'bg-amber-100' },
  { key: 'in_progress',            label: 'In Progress',     icon: ArrowRight,    color: 'text-blue-600',   bg: 'bg-blue-50',   iconBg: 'bg-blue-100' },
  { key: 'in_review',              label: 'In Review',       icon: Eye,           color: 'text-violet-600', bg: 'bg-violet-50', iconBg: 'bg-violet-100' },
  { key: 'final_approved',         label: 'Final Approved',  icon: CheckCircle2,  color: 'text-emerald-600',bg: 'bg-emerald-50',iconBg: 'bg-emerald-100' },
  { key: 'production_in_progress', label: 'In Production',   icon: Truck,         color: 'text-orange-600', bg: 'bg-orange-50', iconBg: 'bg-orange-100' },
].map(m => ({ ...m, value: counts[m.key] || 0 }));

// ─── MAIN ───────────────────────────────────────────────────
export default function MarketingRequests() {
  const navigate = useNavigate();
  const { user } = useAuth(); // eslint-disable-line no-unused-vars
  const [sp, setSp] = useSearchParams();

  const [primaryTab, setPrimaryTab] = useState(sp.get('primary') || 'my');
  const [queue, setQueue] = useState(sp.get('queue') || 'my_requests');
  const [search, setSearch] = useState(sp.get('q') || '');
  const [page, setPage] = useState(parseInt(sp.get('p') || '1'));
  const [loading, setLoading] = useState(false);
  const [data, setData] = useState({ items: [], total: 0, pages: 0 });
  const [counts, setCounts] = useState({});

  const fetchList = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ queue, page: String(page), limit: '20' });
      if (search) params.set('search', search);
      const { data } = await axios.get(`${API}/marketing-requests?${params}`, { headers: HEAD() });
      setData(data || { items: [], total: 0, pages: 0 });
    } catch (e) {
      toast.error(e.response?.data?.detail || 'Failed to load requests');
    } finally { setLoading(false); }
  }, [queue, page, search]);

  const fetchCounts = useCallback(async () => {
    try {
      const { data } = await axios.get(`${API}/marketing-requests/counts`, { headers: HEAD() });
      setCounts(data?.counts || {});
    } catch { /* ignore */ }
  }, []);

  useEffect(() => { fetchList(); }, [queue, page]); // eslint-disable-line
  useEffect(() => { fetchCounts(); }, [fetchCounts]);

  // Sync to URL
  useEffect(() => {
    const next = new URLSearchParams();
    next.set('primary', primaryTab);
    next.set('queue', queue);
    if (search) next.set('q', search);
    if (page > 1) next.set('p', String(page));
    setSp(next, { replace: true });
  }, [primaryTab, queue, search, page]); // eslint-disable-line

  const switchPrimary = (next) => {
    setPrimaryTab(next);
    setQueue(next === 'my' ? 'my_requests' : 'new_requests');
    setPage(1);
  };

  const filteredItems = useMemo(() => {
    if (!search) return data.items || [];
    const q = search.toLowerCase();
    return (data.items || []).filter(r =>
      (r.request_type_name || '').toLowerCase().includes(q) ||
      (r.request_number || '').toLowerCase().includes(q) ||
      (r.requirement_details || '').toLowerCase().includes(q),
    );
  }, [data.items, search]);

  const myMetrics = MY_METRICS(counts);
  const allMetrics = ALL_METRICS(counts);

  return (
    <div className="p-6 space-y-6" data-testid="marketing-requests-page">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 dark:text-white tracking-tight flex items-center gap-2">
            <Sparkles className="h-6 w-6 text-emerald-600" /> Marketing Requests
          </h1>
          <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">
            Sales raises a request &middot; Marketing designs and approves &middot; Delivery produces
          </p>
        </div>
        <Button onClick={() => navigate('/marketing-requests/new')} className="bg-emerald-600 hover:bg-emerald-700" data-testid="new-marketing-request-btn">
          <Plus className="h-4 w-4 mr-2" /> New Request
        </Button>
      </div>

      {/* Primary tabs */}
      <Tabs value={primaryTab} onValueChange={switchPrimary} className="space-y-5">
        <TabsList className="bg-slate-100 dark:bg-slate-800 p-1 h-11">
          <TabsTrigger value="my" className="data-[state=active]:bg-white dark:data-[state=active]:bg-slate-700 px-5" data-testid="tab-my-requests">
            <User className="h-4 w-4 mr-2" /> My Requests
          </TabsTrigger>
          <TabsTrigger value="all" className="data-[state=active]:bg-white dark:data-[state=active]:bg-slate-700 px-5" data-testid="tab-all-requests">
            <Users className="h-4 w-4 mr-2" /> All Requests
          </TabsTrigger>
        </TabsList>

        {/* MY */}
        <TabsContent value="my" className="space-y-5">
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-3" data-testid="my-mr-stats">
            {myMetrics.map(m => (
              <MetricCard key={m.key} {...m} isActive={queue === m.key}
                testId={`my-mr-stat-${m.key}`}
                onClick={() => { setQueue(m.key); setPage(1); }} />
            ))}
          </div>
          {renderToolbarAndTable()}
        </TabsContent>

        {/* ALL */}
        <TabsContent value="all" className="space-y-5">
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3" data-testid="all-mr-stats">
            {allMetrics.map(m => (
              <MetricCard key={m.key} {...m} isActive={queue === m.key}
                testId={`all-mr-stat-${m.key}`}
                onClick={() => { setQueue(m.key); setPage(1); }} />
            ))}
          </div>
          {renderToolbarAndTable()}
        </TabsContent>
      </Tabs>
    </div>
  );

  function renderToolbarAndTable() {
    return (
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
    );
  }
}
