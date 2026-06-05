import React, { useEffect, useState, useCallback } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import axios from 'axios';
import { format, parseISO, isValid, isPast, isToday } from 'date-fns';
import { Button } from '../components/ui/button';
import { Card, CardContent } from '../components/ui/card';
import { Badge } from '../components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '../components/ui/tabs';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '../components/ui/table';
import {
  FilterContainer, FilterGrid, FilterItem, FilterSearch, FilterSelect,
} from '../components/ui/filter-bar';
import AppBreadcrumb from '../components/AppBreadcrumb';
import {
  Plus, Search, Sparkles, Clock, AlertTriangle, ChevronLeft, ChevronRight,
  LayoutList, Tag, User, Users, Calendar, X, Loader2, Truck, GitBranch, Download, Hourglass,
} from 'lucide-react';
import { toast } from 'sonner';
import { useAuth } from '../context/AuthContext';

const API = `${process.env.REACT_APP_BACKEND_URL}/api`;
const HEAD = () => {
  const t = localStorage.getItem('token');
  return t ? { Authorization: `Bearer ${t}` } : {};
};

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

const ageDays = (s) => { try { return Math.max(0, Math.floor((Date.now() - parseISO(s).getTime()) / 86400000)); } catch { return null; } };
const ageLabel = (s) => { const n = ageDays(s); if (n === null) return '—'; return n === 0 ? 'Today' : n === 1 ? '1 day' : `${n} days`; };
const AgePill = ({ createdAt }) => {
  const n = ageDays(createdAt);
  if (n === null) return null;
  const tier = n <= 2
    ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
    : n <= 7
      ? 'bg-amber-50 text-amber-700 border-amber-200'
      : 'bg-red-50 text-red-600 border-red-200';
  return (
    <span className={`inline-flex items-center gap-1 text-[10px] font-medium px-1.5 py-0.5 rounded-full border ${tier}`} title={`Age: ${ageLabel(createdAt)}`} data-testid="mr-row-age">
      <Hourglass className="h-2.5 w-2.5" /> {ageLabel(createdAt)}
    </span>
  );
};
const stateBadgeStyle = (hex) => {
  if (!hex) return { background: '#f1f5f9', color: '#334155', borderColor: '#e2e8f0' };
  return { background: `${hex}1f`, color: hex, borderColor: `${hex}55` };
};

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
    <Card className="border border-slate-100 dark:border-slate-800 rounded-xl shadow-sm overflow-hidden">
      <CardContent className="p-0">
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow className="border-b border-slate-100 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-800/50 hover:bg-slate-50/50">
                {['Request', 'Lead', 'State', 'Assigned to', 'Due Date', 'Raised By'].map(h => (
                  <TableHead key={h} className="font-semibold text-xs sm:text-sm text-muted-foreground">{h}</TableHead>
                ))}
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.length === 0 ? (
                <TableRow><TableCell colSpan={6} className="p-12 text-center text-sm text-muted-foreground">No requests in this view.</TableCell></TableRow>
              ) : rows.map((req) => {
                const overdue = req.requested_due_date && req.current_state_key !== 'production_completed' && isOverdueDate(req.requested_due_date);
                const assignedTo = req.assigned_user_name
                  || req.assigned_department_name
                  || (req.assigned_role ? `Role: ${req.assigned_role}` : '—');
                const leadLabel = req.lead_company || req.lead_name;
                return (
                  <TableRow key={req.id} className="cursor-pointer hover:bg-slate-50 dark:hover:bg-slate-800/30 border-b border-slate-50 dark:border-slate-800/50 transition-colors" onClick={() => navigate(`/marketing-requests/${req.id}`)} data-testid={`mr-row-${req.id}`}>
                    <TableCell className="py-2 sm:py-4" style={{ maxWidth: 440 }}>
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-medium text-primary truncate text-xs sm:text-sm" style={{ maxWidth: 320 }} title={req.request_type_name}>
                          {req.request_type_name || 'Untyped Request'}
                        </span>
                        {req.short_timeline_reason && (
                          <Badge variant="outline" className="text-[10px] bg-amber-50 text-amber-700 border-amber-200">
                            <Clock className="h-2.5 w-2.5 mr-0.5" /> Tight
                          </Badge>
                        )}
                        <AgePill createdAt={req.created_at} />
                      </div>
                      <div className="flex items-center gap-2 mt-1">
                        <span className="inline-flex items-center gap-1 text-[10px] sm:text-[11px] text-muted-foreground font-mono">
                          <Tag className="h-3 w-3" /> {req.request_number}
                        </span>
                        <span className="text-[10px] sm:text-xs text-muted-foreground line-clamp-1" style={{ maxWidth: 280 }}>
                          {req.requirement_details ? req.requirement_details.slice(0, 100) : ''}
                        </span>
                      </div>
                    </TableCell>
                    <TableCell className="py-2 sm:py-4" data-testid={`mr-row-lead-${req.id}`}>
                      {leadLabel ? (
                        <div className="flex items-center gap-1.5 max-w-[200px]" title={leadLabel}>
                          <Users className="h-3.5 w-3.5 text-emerald-500 shrink-0" />
                          <span className="text-xs sm:text-sm text-slate-700 truncate">{leadLabel}</span>
                        </div>
                      ) : (
                        <span className="text-xs text-muted-foreground/40">—</span>
                      )}
                    </TableCell>
                    <TableCell className="py-2 sm:py-4">
                      <Badge variant="outline" style={stateBadgeStyle(req.current_state_color)} className="border text-xs">
                        {req.current_state_label || req.current_state_key || 'unknown'}
                      </Badge>
                    </TableCell>
                    <TableCell className="py-2 sm:py-4">
                      <span className="text-xs sm:text-sm text-slate-700">{assignedTo}</span>
                      {req?.production?.assigned_delivery_department_name && (
                        <div className="text-[10px] text-orange-700 mt-1 flex items-center gap-1">
                          <Truck className="h-3 w-3" /> {req.production.assigned_delivery_department_name}
                        </div>
                      )}
                    </TableCell>
                    <TableCell className="py-2 sm:py-4">
                      {req.requested_due_date ? (
                        <div className={`flex items-center gap-1.5 text-xs sm:text-sm ${overdue ? 'text-red-600' : 'text-slate-600'}`}>
                          <Calendar className="h-3.5 w-3.5" /> {formatDate(req.requested_due_date, 'MMM d, yyyy')}
                          {overdue && <AlertTriangle className="h-3 w-3" />}
                        </div>
                      ) : <span className="text-slate-400">—</span>}
                    </TableCell>
                    <TableCell className="py-2 sm:py-4">
                      <div className="flex items-center gap-2">
                        <div className="w-7 h-7 rounded-full bg-emerald-100 border-2 border-white flex items-center justify-center text-[10px] font-medium text-emerald-700" title={req.created_by_name}>
                          {getInitials(req.created_by_name)}
                        </div>
                        <span className="text-xs sm:text-sm text-slate-700">{req.created_by_name}</span>
                      </div>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
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
  const [requestTypeId, setRequestTypeId] = useState(sp.get('type') || '');
  const [deptId, setDeptId] = useState(sp.get('dept') || '');
  const [requestedBy, setRequestedBy] = useState(sp.get('by') || '');
  const [page, setPage] = useState(parseInt(sp.get('p') || '1'));
  const [loading, setLoading] = useState(false);
  const [data, setData] = useState({ items: [], total: 0, pages: 0 });
  const [counts, setCounts] = useState({ by_state: {}, queues: { my_raised: 0, my_assigned: 0, all: 0 }, states: [], state_machine_name: '' });
  // Filter option sources
  const [types, setTypes] = useState([]);
  const [depts, setDepts] = useState([]);
  const [users, setUsers] = useState([]);

  const fetchList = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ queue, page: String(page), limit: '20' });
      if (search) params.set('search', search);
      if (stateKey) params.set('state_key', stateKey);
      if (requestTypeId) params.set('request_type_id', requestTypeId);
      if (deptId) params.set('assigned_department_id', deptId);
      if (requestedBy) params.set('created_by', requestedBy);
      const { data } = await axios.get(`${API}/marketing-requests?${params}`, { headers: HEAD() });
      setData(data || { items: [], total: 0, pages: 0 });
    } catch (e) {
      toast.error(e.response?.data?.detail || 'Failed to load requests');
    } finally { setLoading(false); }
  }, [queue, page, search, stateKey, requestTypeId, deptId, requestedBy]);

  const fetchCounts = useCallback(async () => {
    try {
      const { data } = await axios.get(`${API}/marketing-requests/counts`, { headers: HEAD() });
      setCounts(data || {});
    } catch { /* ignore */ }
  }, []);

  // Load filter option sources once
  useEffect(() => {
    (async () => {
      try {
        const [t, d, u] = await Promise.all([
          axios.get(`${API}/marketing-request-types`, { headers: HEAD() }),
          axios.get(`${API}/master-departments`, { headers: HEAD() }),
          axios.get(`${API}/users`, { headers: HEAD() }),
        ]);
        setTypes(t.data?.types || (Array.isArray(t.data) ? t.data : []));
        setDepts(d.data?.departments || []);
        setUsers((Array.isArray(u.data) ? u.data : []).filter(x => x.is_active !== false));
      } catch { /* ignore */ }
    })();
  }, []);

  // Debounced list fetch (covers search typing + every filter)
  useEffect(() => {
    const tm = setTimeout(() => fetchList(), 250);
    return () => clearTimeout(tm);
  }, [fetchList]);
  useEffect(() => { fetchCounts(); }, [fetchCounts]);

  useEffect(() => {
    const next = new URLSearchParams();
    next.set('queue', queue);
    if (stateKey) next.set('state', stateKey);
    if (search) next.set('q', search);
    if (requestTypeId) next.set('type', requestTypeId);
    if (deptId) next.set('dept', deptId);
    if (requestedBy) next.set('by', requestedBy);
    if (page > 1) next.set('p', String(page));
    setSp(next, { replace: true });
  }, [queue, stateKey, search, requestTypeId, deptId, requestedBy, page]); // eslint-disable-line

  const switchQueue = (next) => { setQueue(next); setPage(1); };
  const switchState = (key) => { setStateKey(prev => prev === key ? '' : key); setPage(1); };
  const onSearch = (v) => { setSearch(v); setPage(1); };
  const setFilter = (setter) => (v) => { setter(v === '__all' ? '' : v); setPage(1); };
  const clearFilters = () => { setRequestTypeId(''); setDeptId(''); setRequestedBy(''); setSearch(''); setPage(1); };
  const [exporting, setExporting] = useState(false);

  const exportCsv = async () => {
    setExporting(true);
    try {
      const params = new URLSearchParams({ queue });
      if (search) params.set('search', search);
      if (stateKey) params.set('state_key', stateKey);
      if (requestTypeId) params.set('request_type_id', requestTypeId);
      if (deptId) params.set('assigned_department_id', deptId);
      if (requestedBy) params.set('created_by', requestedBy);
      const res = await axios.get(`${API}/marketing-requests/export?${params}`, { headers: HEAD(), responseType: 'blob' });
      const url = URL.createObjectURL(res.data);
      const a = document.createElement('a');
      a.href = url;
      a.download = `marketing-requests-${new Date().toISOString().slice(0, 10)}.csv`;
      document.body.appendChild(a); a.click(); a.remove();
      URL.revokeObjectURL(url);
      toast.success('Export ready');
    } catch (e) { toast.error(e.response?.data?.detail || 'Export failed'); }
    finally { setExporting(false); }
  };

  const items = data.items || [];

  const queueCount = (k) => counts?.queues?.[k] ?? 0;
  const stateCount = (k) => counts?.by_state?.[k] ?? 0;

  const metrics = [
    { key: 'all',         label: 'All Requests', icon: LayoutList, color: 'text-slate-700',    bg: 'bg-slate-50',    iconBg: 'bg-slate-100',    value: queueCount('all') },
    { key: 'my_raised',   label: 'Raised By Me', icon: User,       color: 'text-emerald-700',  bg: 'bg-emerald-50',  iconBg: 'bg-emerald-100',  value: queueCount('my_raised') },
    { key: 'my_assigned', label: 'Assigned To Me', icon: Users,    color: 'text-blue-700',     bg: 'bg-blue-50',     iconBg: 'bg-blue-100',     value: queueCount('my_assigned') },
  ];

  const states = counts.states || [];

  return (
    <div className="p-4 sm:p-6 space-y-6" data-testid="marketing-requests-page">
      <AppBreadcrumb />
      <header className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="w-11 h-11 rounded-xl bg-gradient-to-br from-emerald-500 to-emerald-600 flex items-center justify-center shadow-md shadow-emerald-600/20 shrink-0">
            <Sparkles className="h-6 w-6 text-white" />
          </div>
          <div>
            <h1 className="text-xl sm:text-2xl lg:text-3xl font-bold tracking-tight text-slate-800 dark:text-white">Design Requests</h1>
            <p className="text-xs sm:text-sm text-muted-foreground mt-0.5 flex items-center gap-1.5">
              <GitBranch className="h-3.5 w-3.5" />
              {counts.state_machine_name || 'No state machine attached'}
              <span className="text-slate-300">&middot;</span>
              {data.total} {data.total === 1 ? 'request' : 'requests'}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            onClick={exportCsv}
            disabled={exporting || data.total === 0}
            data-testid="mr-export-btn"
          >
            {exporting ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Download className="h-4 w-4 mr-2" />}
            Export CSV
          </Button>
          <Button onClick={() => navigate('/marketing-requests/new')} className="bg-emerald-600 hover:bg-emerald-700" data-testid="new-marketing-request-btn">
            <Plus className="h-4 w-4 mr-2" /> New Request
          </Button>
        </div>
      </header>

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
              <FilterContainer
                title="Filters"
                activeFiltersCount={[search, requestTypeId, deptId, requestedBy].filter(Boolean).length}
                onReset={clearFilters}
              >
                <FilterGrid columns={4}>
                  <FilterItem label="Search" icon={Search}>
                    <FilterSearch
                      placeholder="Type, number or details…"
                      value={search}
                      onChange={onSearch}
                      data-testid="mr-search-input"
                    />
                  </FilterItem>
                  <FilterItem label="Request Type" icon={Tag}>
                    <FilterSelect
                      value={requestTypeId || 'all'}
                      onValueChange={(v) => setFilter(setRequestTypeId)(v === 'all' ? '__all' : v)}
                      placeholder="All types"
                      data-testid="mr-filter-type"
                      options={[{ value: 'all', label: 'All types' }, ...types.map(t => ({ value: t.id, label: t.name }))]}
                    />
                  </FilterItem>
                  <FilterItem label="Assigned Team" icon={Users}>
                    <FilterSelect
                      value={deptId || 'all'}
                      onValueChange={(v) => setFilter(setDeptId)(v === 'all' ? '__all' : v)}
                      placeholder="All teams"
                      data-testid="mr-filter-dept"
                      options={[{ value: 'all', label: 'All teams' }, ...depts.map(d => ({ value: d.id, label: d.name }))]}
                    />
                  </FilterItem>
                  <FilterItem label="Requested By" icon={User}>
                    <FilterSelect
                      value={requestedBy || 'all'}
                      onValueChange={(v) => setFilter(setRequestedBy)(v === 'all' ? '__all' : v)}
                      placeholder="Anyone"
                      data-testid="mr-filter-requestedby"
                      options={[{ value: 'all', label: 'Anyone' }, ...users.map(u => ({ value: u.id, label: u.name || u.email }))]}
                    />
                  </FilterItem>
                </FilterGrid>
              </FilterContainer>

              {loading ? (
                <div className="flex items-center justify-center h-64"><Loader2 className="h-8 w-8 animate-spin text-emerald-600" /></div>
              ) : (
                <>
                  <RequestTable rows={items} navigate={navigate} />
                  {data.pages > 1 && (
                    <div className="flex items-center justify-between text-xs sm:text-sm text-muted-foreground px-1">
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
