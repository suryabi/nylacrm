/**
 * NotificationsPanel — a contemporary right-side slide-over notification center.
 * Replaces the old popover + full-page inbox. Controlled via `open`/`onOpenChange`.
 */
import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import axios from 'axios';
import { toast } from 'sonner';
import {
  Bell, CheckCheck, Search, Loader2, Inbox, AtSign, CheckSquare,
  ShieldCheck, Palette, UserPlus, Package, RotateCcw, CalendarDays, Printer,
} from 'lucide-react';
import { Sheet, SheetContent } from './ui/sheet';
import { Input } from './ui/input';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from './ui/select';

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
  return d.toLocaleDateString('en-IN', { day: '2-digit', month: 'short' });
};

const fmtFull = (iso) => {
  if (!iso) return '';
  try { return new Date(iso).toLocaleString('en-IN', { day: '2-digit', month: 'short', year: 'numeric', hour: 'numeric', minute: '2-digit' }); } catch { return ''; }
};

// Date-bucket label for grouping.
const groupOf = (iso) => {
  if (!iso) return 'Earlier';
  const d = new Date(iso);
  const now = new Date();
  const startToday = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  const t = d.getTime();
  if (t >= startToday) return 'Today';
  if (t >= startToday - 86400000) return 'Yesterday';
  if (t >= startToday - 7 * 86400000) return 'Earlier this week';
  return 'Earlier';
};

const CAT = {
  mention: { icon: AtSign, cls: 'bg-rose-100 text-rose-600', label: '@-mention' },
  task: { icon: CheckSquare, cls: 'bg-blue-100 text-blue-600', label: 'Task' },
  approval: { icon: ShieldCheck, cls: 'bg-amber-100 text-amber-600', label: 'Approval' },
  design_request: { icon: Palette, cls: 'bg-fuchsia-100 text-fuchsia-600', label: 'Design' },
  lead: { icon: UserPlus, cls: 'bg-emerald-100 text-emerald-600', label: 'Lead' },
  account: { icon: UserPlus, cls: 'bg-teal-100 text-teal-600', label: 'Account' },
  stock_transfer: { icon: Package, cls: 'bg-indigo-100 text-indigo-600', label: 'Stock' },
  return: { icon: RotateCcw, cls: 'bg-orange-100 text-orange-600', label: 'Return' },
  meeting: { icon: CalendarDays, cls: 'bg-violet-100 text-violet-600', label: 'Meeting' },
  print_request: { icon: Printer, cls: 'bg-cyan-100 text-cyan-600', label: 'Print' },
};
const catMeta = (key) => CAT[key] || { icon: Bell, cls: 'bg-slate-100 text-slate-500', label: (key || '').replace(/_/g, ' ') };

const STATUS_TABS = [
  { key: 'all', label: 'All' },
  { key: 'unread', label: 'Unread' },
  { key: 'read', label: 'Read' },
];

export default function NotificationsPanel({ open, onOpenChange, onUnreadChange }) {
  const navigate = useNavigate();
  const [items, setItems] = useState([]);
  const [unread, setUnread] = useState(0);
  const [total, setTotal] = useState(0);
  const [pages, setPages] = useState(1);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);

  const [status, setStatus] = useState('all');
  const [category, setCategory] = useState('all');
  const [search, setSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [categories, setCategories] = useState([]);
  const debRef = useRef(null);

  useEffect(() => {
    clearTimeout(debRef.current);
    debRef.current = setTimeout(() => setDebouncedSearch(search), 350);
    return () => clearTimeout(debRef.current);
  }, [search]);

  useEffect(() => {
    if (!open) return;
    axios.get(`${API}/notifications/categories`, { headers: authHeaders() })
      .then((r) => setCategories(Array.isArray(r.data) ? r.data : []))
      .catch(() => setCategories([]));
  }, [open]);

  const fetchPage = useCallback(async (pageNo, replace) => {
    if (replace) setLoading(true); else setLoadingMore(true);
    try {
      const params = { page: pageNo, limit: 15 };
      if (status !== 'all') params.status = status;
      if (category !== 'all') params.category = category;
      if (debouncedSearch) params.search = debouncedSearch;
      const { data } = await axios.get(`${API}/notifications`, { headers: authHeaders(), params });
      setItems((prev) => (replace ? (data.notifications || []) : [...prev, ...(data.notifications || [])]));
      setUnread(data.unread_count || 0);
      onUnreadChange?.(data.unread_count || 0);
      setTotal(data.total || 0);
      setPages(data.pages || 1);
      setPage(pageNo);
    } catch {
      if (replace) setItems([]);
    } finally {
      setLoading(false);
      setLoadingMore(false);
    }
  }, [status, category, debouncedSearch, onUnreadChange]);

  // (Re)load page 1 whenever the panel opens or filters change.
  useEffect(() => {
    if (open) fetchPage(1, true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, status, category, debouncedSearch]);

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
      setUnread((u) => { const nu = Math.max(0, u - 1); onUnreadChange?.(nu); return nu; });
      try { await axios.post(`${API}/notifications/${n.id}/read`, {}, { headers: authHeaders() }); } catch { /* ignore */ }
    }
    onOpenChange?.(false);
    openLink(n.link);
  };

  const markAllRead = async () => {
    try {
      const { data } = await axios.post(`${API}/notifications/read-all`, {}, { headers: authHeaders() });
      toast.success(`Marked ${data.updated || 0} as read`);
      setUnread(0);
      onUnreadChange?.(0);
      fetchPage(1, true);
    } catch { toast.error('Failed to mark all as read'); }
  };

  const resetFilters = () => { setStatus('all'); setCategory('all'); setSearch(''); };
  const activeFilters = (status !== 'all' ? 1 : 0) + (category !== 'all' ? 1 : 0) + (debouncedSearch ? 1 : 0);

  // Group items by date bucket while preserving order.
  const groups = [];
  let lastG = null;
  items.forEach((n) => {
    const g = groupOf(n.created_at);
    if (g !== lastG) { groups.push({ label: g, items: [n] }); lastG = g; }
    else groups[groups.length - 1].items.push(n);
  });

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="right"
        className="w-full sm:max-w-md p-0 flex flex-col gap-0 border-l border-slate-200"
        data-testid="notifications-panel"
      >
        {/* Header */}
        <div className="relative px-5 pt-5 pb-4 bg-gradient-to-br from-emerald-600 to-teal-700 text-white shrink-0">
          <div className="absolute inset-0 opacity-20" style={{ backgroundImage: 'radial-gradient(circle at 20% 20%, rgba(255,255,255,0.4) 0, transparent 40%)' }} />
          <div className="relative flex items-start gap-3">
            <div className="h-10 w-10 rounded-xl bg-white/15 backdrop-blur flex items-center justify-center ring-1 ring-white/20">
              <Bell className="h-5 w-5" />
            </div>
            <div className="flex-1 min-w-0">
              <h2 className="text-lg font-semibold tracking-tight">Notifications</h2>
              <p className="text-xs text-emerald-50/80 mt-0.5">
                {unread > 0 ? `${unread} unread` : 'All caught up'}{total ? ` · ${total} total` : ''}
              </p>
            </div>
            <button
              onClick={markAllRead}
              disabled={unread === 0}
              className="mr-7 inline-flex items-center gap-1.5 text-xs font-medium px-2.5 py-1.5 rounded-lg bg-white/15 hover:bg-white/25 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
              data-testid="panel-mark-all-read"
            >
              <CheckCheck className="h-3.5 w-3.5" /> Mark all
            </button>
          </div>
        </div>

        {/* Filters */}
        <div className="px-4 py-3 border-b border-slate-100 bg-white space-y-2.5 shrink-0">
          <div className="flex items-center gap-2">
            <div className="inline-flex rounded-lg border border-slate-200 p-0.5 bg-slate-50" data-testid="panel-status-tabs">
              {STATUS_TABS.map((t) => (
                <button
                  key={t.key}
                  onClick={() => setStatus(t.key)}
                  className={`px-2.5 py-1 text-xs rounded-md transition-colors ${status === t.key ? 'bg-white shadow-sm text-slate-900 font-semibold' : 'text-slate-500 hover:text-slate-800'}`}
                  data-testid={`panel-status-${t.key}`}
                >
                  {t.label}{t.key === 'unread' && unread > 0 ? ` ${unread}` : ''}
                </button>
              ))}
            </div>
            <Select value={category} onValueChange={setCategory}>
              <SelectTrigger className="h-8 flex-1 text-xs" data-testid="panel-category-filter">
                <SelectValue placeholder="All types" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All types</SelectItem>
                {categories.map((c) => (
                  <SelectItem key={c.key} value={c.key} data-testid={`panel-category-${c.key}`}>{c.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="relative">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-slate-400" />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search notifications…"
              className="pl-8 h-8 text-xs"
              data-testid="panel-search"
            />
            {activeFilters > 0 && (
              <button onClick={resetFilters} className="absolute right-2 top-1/2 -translate-y-1/2 text-[10px] text-slate-400 hover:text-slate-700" data-testid="panel-clear-filters">
                Clear
              </button>
            )}
          </div>
        </div>

        {/* List */}
        <div className="flex-1 overflow-y-auto bg-slate-50/60" data-testid="panel-list">
          {loading ? (
            <div className="py-20 text-center text-slate-400"><Loader2 className="h-6 w-6 mx-auto animate-spin mb-2" />Loading…</div>
          ) : items.length === 0 ? (
            <div className="py-24 px-6 text-center text-slate-400" data-testid="panel-empty">
              <div className="h-14 w-14 rounded-2xl bg-slate-100 flex items-center justify-center mx-auto mb-3">
                <Inbox className="h-7 w-7 opacity-50" />
              </div>
              <p className="text-sm font-medium text-slate-500">{activeFilters > 0 ? 'No matches' : "You're all caught up"}</p>
              <p className="text-xs mt-1 text-slate-400">{activeFilters > 0 ? 'Try clearing the filters.' : 'New notifications will show up here.'}</p>
            </div>
          ) : (
            groups.map((grp) => (
              <div key={grp.label}>
                <div className="sticky top-0 z-10 px-4 py-1.5 bg-slate-100/90 backdrop-blur text-[10px] font-semibold uppercase tracking-wider text-slate-500 border-b border-slate-200/70">
                  {grp.label}
                </div>
                {grp.items.map((n) => {
                  const meta = catMeta(n.category);
                  const Icon = meta.icon;
                  return (
                    <button
                      key={n.id}
                      onClick={() => onClickItem(n)}
                      className={`group w-full text-left px-4 py-3 flex gap-3 border-b border-slate-100 transition-colors relative ${n.is_read ? 'bg-white hover:bg-slate-50' : 'bg-emerald-50/50 hover:bg-emerald-50'}`}
                      data-testid={`panel-item-${n.id}`}
                    >
                      {!n.is_read && <span className="absolute left-0 top-0 bottom-0 w-1 bg-emerald-500" />}
                      <span className={`h-9 w-9 rounded-xl flex items-center justify-center shrink-0 ${meta.cls}`}>
                        <Icon className="h-4 w-4" />
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="flex items-center justify-between gap-2">
                          <span className={`text-sm truncate ${n.is_read ? 'font-medium text-slate-700' : 'font-semibold text-slate-900'}`}>{n.title}</span>
                          <span className="text-[10px] text-slate-400 shrink-0" title={fmtFull(n.created_at)}>{timeAgo(n.created_at)}</span>
                        </span>
                        {n.body && <span className="block text-xs text-slate-500 mt-0.5 line-clamp-2">{n.body}</span>}
                        <span className="inline-block mt-1.5 text-[9px] font-medium uppercase tracking-wide text-slate-400">{meta.label}</span>
                      </span>
                      {!n.is_read && <span className="mt-1 h-2 w-2 rounded-full bg-emerald-500 shrink-0" />}
                    </button>
                  );
                })}
              </div>
            ))
          )}

          {/* Load more */}
          {!loading && page < pages && (
            <div className="p-4">
              <button
                onClick={() => fetchPage(page + 1, false)}
                disabled={loadingMore}
                className="w-full py-2.5 rounded-lg border border-slate-200 bg-white text-sm font-medium text-slate-600 hover:bg-slate-50 transition-colors inline-flex items-center justify-center gap-2"
                data-testid="panel-load-more"
              >
                {loadingMore ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                Load older ({total - items.length} more)
              </button>
            </div>
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}
