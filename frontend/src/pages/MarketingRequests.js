import React, { useEffect, useMemo, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import axios from 'axios';
import { format } from 'date-fns';
import { Button } from '../components/ui/button';
import { Card } from '../components/ui/card';
import { Input } from '../components/ui/input';
import { Badge } from '../components/ui/badge';
import {
  Plus, Search, RefreshCw, Sparkles, Clock, ChevronLeft, ChevronRight,
  AlertTriangle, Filter,
} from 'lucide-react';
import { toast } from 'sonner';
import { useAuth } from '../contexts/AuthContext';

const API = `${process.env.REACT_APP_BACKEND_URL}/api`;
const HEAD = () => {
  const t = localStorage.getItem('token');
  return t ? { Authorization: `Bearer ${t}` } : {};
};

const STATUS_COLORS = {
  submitted: 'bg-slate-100 text-slate-700 border-slate-300',
  inputs_needed: 'bg-amber-100 text-amber-800 border-amber-300',
  in_progress: 'bg-blue-100 text-blue-800 border-blue-300',
  in_review: 'bg-violet-100 text-violet-800 border-violet-300',
  approved_internal: 'bg-indigo-100 text-indigo-800 border-indigo-300',
  final_approved: 'bg-emerald-100 text-emerald-800 border-emerald-300',
  production_in_progress: 'bg-orange-100 text-orange-800 border-orange-300',
  production_completed: 'bg-green-100 text-green-800 border-green-300',
};

const QUEUE_DEFINITIONS = {
  // Sales group
  sales: [
    { key: 'my_requests', label: 'My Requests' },
    { key: 'my_inputs_needed', label: 'Inputs Needed' },
    { key: 'my_in_progress', label: 'In Progress' },
    { key: 'my_approved', label: 'Approved' },
    { key: 'my_sent_for_production', label: 'Sent for Production' },
  ],
  // Marketing group
  marketing: [
    { key: 'new_requests', label: 'New Requests' },
    { key: 'inputs_needed', label: 'Inputs Needed' },
    { key: 'in_progress', label: 'In Progress' },
    { key: 'in_review', label: 'In Review' },
    { key: 'approved_internal', label: 'Approved - Internal' },
    { key: 'final_approved', label: 'Final Approved' },
  ],
  // Delivery group
  delivery: [
    { key: 'ready_for_production', label: 'Ready for Production' },
    { key: 'production_pending', label: 'Production Pending' },
    { key: 'production_in_progress', label: 'Production In Progress' },
    { key: 'production_completed', label: 'Production Completed' },
  ],
};

const userPrimaryGroup = (user) => {
  const dept = (user?.department || '').toLowerCase();
  const role = (user?.role || '').toLowerCase();
  if (dept.includes('marketing') || role.includes('marketing')) return 'marketing';
  if (dept.includes('production') || dept.includes('delivery') || role.includes('delivery')) return 'delivery';
  return 'sales';
};

export default function MarketingRequests() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [sp, setSp] = useSearchParams();
  const primaryGroup = userPrimaryGroup(user);
  const defaultQueue = QUEUE_DEFINITIONS[primaryGroup][0].key;

  const [queue, setQueue] = useState(sp.get('queue') || defaultQueue);
  const [search, setSearch] = useState(sp.get('q') || '');
  const [page, setPage] = useState(parseInt(sp.get('p') || '1'));
  const [loading, setLoading] = useState(false);
  const [data, setData] = useState({ items: [], total: 0, pages: 0 });
  const [counts, setCounts] = useState({});

  // Show all 3 groups in tabs since user can be multi-dept (Sales + Marketing both raise & manage)
  const allQueues = useMemo(() => [
    { group: 'Sales',     queues: QUEUE_DEFINITIONS.sales },
    { group: 'Marketing', queues: QUEUE_DEFINITIONS.marketing },
    { group: 'Delivery',  queues: QUEUE_DEFINITIONS.delivery },
  ], []);

  const fetchList = async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ queue, page: String(page), limit: '20' });
      if (search) params.set('search', search);
      const { data } = await axios.get(`${API}/marketing-requests?${params}`, { headers: HEAD() });
      setData(data || { items: [], total: 0, pages: 0 });
    } catch (e) {
      toast.error(e.response?.data?.detail || 'Failed to load requests');
    } finally {
      setLoading(false);
    }
  };

  const fetchCounts = async () => {
    try {
      const { data } = await axios.get(`${API}/marketing-requests/counts`, { headers: HEAD() });
      setCounts(data?.counts || {});
    } catch { /* ignore */ }
  };

  useEffect(() => { fetchList(); }, [queue, page]); // eslint-disable-line
  useEffect(() => { fetchCounts(); }, []); // eslint-disable-line
  useEffect(() => {
    const next = new URLSearchParams();
    if (queue) next.set('queue', queue);
    if (search) next.set('q', search);
    if (page > 1) next.set('p', String(page));
    setSp(next, { replace: true });
  }, [queue, search, page]); // eslint-disable-line

  const isOverdue = (req) => {
    if (!req?.requested_due_date) return false;
    if (['production_completed'].includes(req.status_key)) return false;
    return new Date(req.requested_due_date) < new Date(new Date().toDateString());
  };

  return (
    <div className="space-y-4 p-4 sm:p-6">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-semibold text-slate-900 flex items-center gap-2">
            <Sparkles className="h-6 w-6 text-violet-600" /> Marketing Requests
          </h1>
          <p className="text-sm text-muted-foreground">
            Sales raises a request → Marketing fulfils → Delivery produces. Assignments are department-based.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={() => { fetchList(); fetchCounts(); }} data-testid="refresh-mr-btn">
            <RefreshCw className="h-4 w-4 mr-2" /> Refresh
          </Button>
          <Button onClick={() => navigate('/marketing-requests/new')} data-testid="new-marketing-request-btn">
            <Plus className="h-4 w-4 mr-2" /> New Request
          </Button>
        </div>
      </div>

      {/* Queue tabs */}
      <Card className="p-3 space-y-2">
        {allQueues.map((grp) => (
          <div key={grp.group} className="flex items-start gap-2 flex-wrap">
            <span className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold w-20 mt-1.5">
              {grp.group}
            </span>
            <div className="flex flex-wrap gap-1.5">
              {grp.queues.map((q) => (
                <button
                  key={q.key}
                  type="button"
                  onClick={() => { setQueue(q.key); setPage(1); }}
                  className={`text-xs px-2.5 py-1 rounded-md border transition-colors ${
                    queue === q.key
                      ? 'bg-slate-900 text-white border-slate-900'
                      : 'bg-white text-slate-700 border-slate-200 hover:bg-slate-50'
                  }`}
                  data-testid={`queue-${q.key}`}
                >
                  {q.label}
                  {typeof counts[q.key] === 'number' && (
                    <span className={`ml-1.5 inline-flex items-center justify-center min-w-[18px] h-[18px] text-[10px] rounded-full ${
                      queue === q.key ? 'bg-white/20' : 'bg-slate-100 text-slate-600'
                    }`}>{counts[q.key]}</span>
                  )}
                </button>
              ))}
            </div>
          </div>
        ))}
      </Card>

      {/* Search */}
      <div className="flex items-center gap-2">
        <div className="relative flex-1 max-w-md">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
          <Input
            placeholder="Search by request number or title..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') { setPage(1); fetchList(); } }}
            className="pl-10"
            data-testid="mr-search-input"
          />
        </div>
        <Button variant="outline" size="sm" onClick={() => { setPage(1); fetchList(); }}>
          <Filter className="h-4 w-4 mr-2" /> Apply
        </Button>
      </div>

      {/* List */}
      <Card className="overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-left">
            <tr>
              <th className="px-4 py-2.5 font-medium text-slate-700">Request</th>
              <th className="px-4 py-2.5 font-medium text-slate-700">Type</th>
              <th className="px-4 py-2.5 font-medium text-slate-700">Assigned to</th>
              <th className="px-4 py-2.5 font-medium text-slate-700">Due</th>
              <th className="px-4 py-2.5 font-medium text-slate-700">Status</th>
              <th className="px-4 py-2.5 font-medium text-slate-700">Raised by</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={6} className="px-4 py-10 text-center text-muted-foreground">Loading…</td></tr>
            ) : (data.items || []).length === 0 ? (
              <tr><td colSpan={6} className="px-4 py-10 text-center text-muted-foreground">No requests in this queue.</td></tr>
            ) : data.items.map((req) => (
              <tr
                key={req.id}
                onClick={() => navigate(`/marketing-requests/${req.id}`)}
                className="border-t border-slate-100 hover:bg-slate-50 cursor-pointer"
                data-testid={`mr-row-${req.id}`}
              >
                <td className="px-4 py-3">
                  <div className="font-mono text-xs text-slate-500">{req.request_number}</div>
                  <div className="font-medium text-slate-900 truncate max-w-xs">{req.title}</div>
                </td>
                <td className="px-4 py-3 text-slate-700">{req.request_type_name || '—'}</td>
                <td className="px-4 py-3">
                  <Badge variant="outline" className="text-xs">{req.assigned_department_name || '—'}</Badge>
                </td>
                <td className="px-4 py-3 text-slate-700">
                  <div className="flex items-center gap-1.5">
                    {req.requested_due_date && format(new Date(req.requested_due_date), 'dd MMM yyyy')}
                    {isOverdue(req) && (
                      <Badge variant="outline" className="text-[10px] bg-red-50 text-red-700 border-red-200">
                        <AlertTriangle className="h-2.5 w-2.5 mr-0.5" /> Overdue
                      </Badge>
                    )}
                  </div>
                  {req.short_timeline_reason && (
                    <div className="text-[11px] text-amber-700 mt-0.5 flex items-center gap-1">
                      <Clock className="h-3 w-3" /> Tight timeline
                    </div>
                  )}
                </td>
                <td className="px-4 py-3">
                  <Badge variant="outline" className={`text-xs ${STATUS_COLORS[req.status_key] || ''}`}>
                    {req.status_name || req.status_key}
                  </Badge>
                </td>
                <td className="px-4 py-3 text-slate-700">{req.created_by_name || '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>

        {/* Pagination */}
        {data.pages > 1 && (
          <div className="flex items-center justify-between p-3 border-t border-slate-100 text-xs text-slate-600">
            <span>Showing page {data.page || page} of {data.pages} ({data.total} total)</span>
            <div className="flex items-center gap-1">
              <Button size="sm" variant="outline" disabled={page <= 1} onClick={() => setPage(p => p - 1)}>
                <ChevronLeft className="h-4 w-4" />
              </Button>
              <Button size="sm" variant="outline" disabled={page >= data.pages} onClick={() => setPage(p => p + 1)}>
                <ChevronRight className="h-4 w-4" />
              </Button>
            </div>
          </div>
        )}
      </Card>
    </div>
  );
}
