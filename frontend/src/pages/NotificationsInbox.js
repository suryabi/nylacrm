import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import axios from 'axios';
import { toast } from 'sonner';
import {
  Bell, CheckCheck, Search, Loader2, ChevronLeft, ChevronRight, Inbox,
} from 'lucide-react';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '../components/ui/select';

const API = `${process.env.REACT_APP_BACKEND_URL}/api`;
const authHeaders = () => {
  const token = localStorage.getItem('token') || localStorage.getItem('session_token');
  return token ? { Authorization: `Bearer ${token}` } : {};
};

const timeAgo = (iso) => {
  if (!iso) return '';
  const d = new Date(iso);
  const s = Math.floor((Date.now() - d.getTime()) / 1000);
  if (s < 60) return 'just now';
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  if (s < 604800) return `${Math.floor(s / 86400)}d ago`;
  return d.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
};

const fmtFull = (iso) => {
  if (!iso) return '';
  try { return new Date(iso).toLocaleString('en-IN', { day: '2-digit', month: 'short', year: 'numeric', hour: 'numeric', minute: '2-digit' }); } catch { return ''; }
};

const STATUS_TABS = [
  { key: 'all', label: 'All' },
  { key: 'unread', label: 'Unread' },
  { key: 'read', label: 'Read' },
];

const CATEGORY_COLORS = {
  mention: 'bg-rose-50 text-rose-700 border-rose-200',
  task: 'bg-blue-50 text-blue-700 border-blue-200',
  approval: 'bg-amber-50 text-amber-700 border-amber-200',
  design_request: 'bg-fuchsia-50 text-fuchsia-700 border-fuchsia-200',
  lead: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  assignment: 'bg-indigo-50 text-indigo-700 border-indigo-200',
};

export default function NotificationsInbox() {
  const navigate = useNavigate();
  const [items, setItems] = useState([]);
  const [unread, setUnread] = useState(0);
  const [total, setTotal] = useState(0);
  const [pages, setPages] = useState(1);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);

  const [status, setStatus] = useState('all');
  const [category, setCategory] = useState('all');
  const [search, setSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [categories, setCategories] = useState([]);
  const debRef = useRef(null);

  // Debounce search
  useEffect(() => {
    clearTimeout(debRef.current);
    debRef.current = setTimeout(() => { setDebouncedSearch(search); setPage(1); }, 350);
    return () => clearTimeout(debRef.current);
  }, [search]);

  useEffect(() => {
    axios.get(`${API}/notifications/categories`, { headers: authHeaders() })
      .then((r) => setCategories(Array.isArray(r.data) ? r.data : []))
      .catch(() => setCategories([]));
  }, []);

  const labelFor = useCallback((key) => {
    const c = categories.find((x) => x.key === key);
    return c ? c.label : (key || '').replace(/_/g, ' ');
  }, [categories]);

  const fetchList = useCallback(async () => {
    setLoading(true);
    try {
      const params = { page, limit: 20 };
      if (status !== 'all') params.status = status;
      if (category !== 'all') params.category = category;
      if (debouncedSearch) params.search = debouncedSearch;
      const { data } = await axios.get(`${API}/notifications`, { headers: authHeaders(), params });
      setItems(data.notifications || []);
      setUnread(data.unread_count || 0);
      setTotal(data.total || 0);
      setPages(data.pages || 1);
    } catch {
      setItems([]);
    } finally {
      setLoading(false);
    }
  }, [page, status, category, debouncedSearch]);

  useEffect(() => { fetchList(); }, [fetchList]);

  const openLink = (link) => {
    if (!link) return;
    if (/^https?:\/\//i.test(link)) {
      try {
        const url = new URL(link);
        if (url.origin === window.location.origin) { navigate(url.pathname + url.search); return; }
      } catch { /* ignore */ }
      window.open(link, '_blank', 'noopener');
      return;
    }
    navigate(link);
  };

  const onClickItem = async (n) => {
    if (!n.is_read) {
      setItems((prev) => prev.map((x) => (x.id === n.id ? { ...x, is_read: true } : x)));
      setUnread((u) => Math.max(0, u - 1));
      try { await axios.post(`${API}/notifications/${n.id}/read`, {}, { headers: authHeaders() }); } catch { /* ignore */ }
    }
    openLink(n.link);
  };

  const markAllRead = async () => {
    try {
      const { data } = await axios.post(`${API}/notifications/read-all`, {}, { headers: authHeaders() });
      toast.success(`Marked ${data.updated || 0} as read`);
      setUnread(0);
      fetchList();
    } catch { toast.error('Failed to mark all as read'); }
  };

  const resetFilters = () => { setStatus('all'); setCategory('all'); setSearch(''); setPage(1); };
  const activeFilters = (status !== 'all' ? 1 : 0) + (category !== 'all' ? 1 : 0) + (debouncedSearch ? 1 : 0);

  return (
    <div className="space-y-5 pb-10" data-testid="notifications-inbox-page">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-3">
          <div className="h-10 w-10 rounded-xl bg-gradient-to-br from-emerald-500 to-teal-600 flex items-center justify-center shadow-sm">
            <Bell className="h-5 w-5 text-white" />
          </div>
          <div>
            <h1 className="text-xl sm:text-2xl lg:text-3xl font-bold tracking-tight text-slate-900">Notifications</h1>
            <p className="text-sm text-slate-500">{total} total · {unread} unread</p>
          </div>
        </div>
        <Button
          onClick={markAllRead}
          disabled={unread === 0}
          variant="outline"
          className="border-emerald-200 text-emerald-700 hover:bg-emerald-50"
          data-testid="inbox-mark-all-read"
        >
          <CheckCheck className="h-4 w-4 mr-2" /> Mark all read
        </Button>
      </div>

      {/* Filters */}
      <div className="rounded-xl border border-slate-200 bg-white p-3 sm:p-4 space-y-3" data-testid="inbox-filters">
        <div className="flex flex-col sm:flex-row gap-3 sm:items-center">
          {/* Status segmented */}
          <div className="inline-flex rounded-lg border border-slate-200 p-0.5 bg-slate-50" data-testid="inbox-status-tabs">
            {STATUS_TABS.map((t) => (
              <button
                key={t.key}
                onClick={() => { setStatus(t.key); setPage(1); }}
                className={`px-3 py-1.5 text-sm rounded-md transition-colors ${status === t.key ? 'bg-white shadow-sm text-slate-900 font-medium' : 'text-slate-500 hover:text-slate-800'}`}
                data-testid={`inbox-status-${t.key}`}
              >
                {t.label}{t.key === 'unread' && unread > 0 ? ` (${unread})` : ''}
              </button>
            ))}
          </div>

          {/* Category */}
          <Select value={category} onValueChange={(v) => { setCategory(v); setPage(1); }}>
            <SelectTrigger className="w-full sm:w-52" data-testid="inbox-category-filter">
              <SelectValue placeholder="All categories" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All categories</SelectItem>
              {categories.map((c) => (
                <SelectItem key={c.key} value={c.key} data-testid={`inbox-category-${c.key}`}>{c.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>

          {/* Search */}
          <div className="relative flex-1 min-w-[180px]">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search notifications…"
              className="pl-9"
              data-testid="inbox-search"
            />
          </div>

          {activeFilters > 0 && (
            <Button variant="ghost" size="sm" onClick={resetFilters} className="text-slate-500" data-testid="inbox-clear-filters">
              Clear ({activeFilters})
            </Button>
          )}
        </div>
      </div>

      {/* List */}
      <div className="rounded-xl border border-slate-200 bg-white overflow-hidden" data-testid="inbox-list">
        {loading ? (
          <div className="py-16 text-center text-slate-400"><Loader2 className="h-6 w-6 mx-auto animate-spin mb-2" />Loading…</div>
        ) : items.length === 0 ? (
          <div className="py-16 text-center text-slate-400" data-testid="inbox-empty">
            <Inbox className="h-10 w-10 mx-auto mb-3 opacity-40" />
            <p className="text-sm">{activeFilters > 0 ? 'No notifications match these filters.' : "You're all caught up."}</p>
          </div>
        ) : (
          items.map((n) => (
            <button
              key={n.id}
              onClick={() => onClickItem(n)}
              className={`w-full text-left px-4 py-3.5 border-b last:border-b-0 hover:bg-slate-50 transition-colors flex gap-3 ${n.is_read ? '' : 'bg-emerald-50/40'}`}
              data-testid={`inbox-item-${n.id}`}
            >
              <span className={`mt-1.5 h-2 w-2 rounded-full shrink-0 ${n.is_read ? 'bg-transparent' : 'bg-emerald-500'}`} />
              <span className="min-w-0 flex-1">
                <span className="flex items-center gap-2 flex-wrap">
                  <span className={`text-sm truncate ${n.is_read ? 'font-medium text-slate-700' : 'font-semibold text-slate-900'}`}>{n.title}</span>
                  {n.category && (
                    <span className={`text-[10px] px-1.5 py-0.5 rounded-full border ${CATEGORY_COLORS[n.category] || 'bg-slate-50 text-slate-600 border-slate-200'}`}>
                      {labelFor(n.category)}
                    </span>
                  )}
                </span>
                {n.body && <span className="block text-xs text-slate-500 mt-0.5 line-clamp-2">{n.body}</span>}
                <span className="block text-[11px] text-slate-400 mt-1" title={fmtFull(n.created_at)}>{timeAgo(n.created_at)}</span>
              </span>
            </button>
          ))
        )}
      </div>

      {/* Pagination */}
      {pages > 1 && (
        <div className="flex items-center justify-between" data-testid="inbox-pagination">
          <span className="text-xs text-slate-500">Page {page} of {pages}</span>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => setPage((p) => Math.max(1, p - 1))} data-testid="inbox-prev">
              <ChevronLeft className="h-4 w-4 mr-1" /> Prev
            </Button>
            <Button variant="outline" size="sm" disabled={page >= pages} onClick={() => setPage((p) => Math.min(pages, p + 1))} data-testid="inbox-next">
              Next <ChevronRight className="h-4 w-4 ml-1" />
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
