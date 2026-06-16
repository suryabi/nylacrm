import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import axios from 'axios';
import { Bell, Check, CheckCheck } from 'lucide-react';
import { Popover, PopoverContent, PopoverTrigger } from './ui/popover';
import { Button } from './ui/button';

const API = `${process.env.REACT_APP_BACKEND_URL}/api`;

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

export default function NotificationBell() {
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState([]);
  const [unread, setUnread] = useState(0);
  const [loading, setLoading] = useState(false);
  const pollRef = useRef(null);

  const authHeaders = useCallback(() => {
    const token = localStorage.getItem('token');
    return token ? { Authorization: `Bearer ${token}` } : {};
  }, []);

  const fetchCount = useCallback(async () => {
    try {
      const { data } = await axios.get(`${API}/notifications/unread-count`, {
        headers: authHeaders(), withCredentials: true,
      });
      setUnread(data.unread_count || 0);
    } catch (_) { /* silent */ }
  }, [authHeaders]);

  const fetchList = useCallback(async () => {
    setLoading(true);
    try {
      const { data } = await axios.get(`${API}/notifications?limit=20`, {
        headers: authHeaders(), withCredentials: true,
      });
      setItems(data.notifications || []);
      setUnread(data.unread_count || 0);
    } catch (_) { /* silent */ } finally {
      setLoading(false);
    }
  }, [authHeaders]);

  useEffect(() => {
    fetchCount();
    pollRef.current = setInterval(fetchCount, 60000);
    return () => clearInterval(pollRef.current);
  }, [fetchCount]);

  useEffect(() => { if (open) fetchList(); }, [open, fetchList]);

  const openLink = (link) => {
    if (!link) return;
    if (/^https?:\/\//i.test(link)) {
      try {
        const url = new URL(link);
        if (url.origin === window.location.origin) { navigate(url.pathname + url.search); return; }
      } catch (_) { /* fall through */ }
      window.open(link, '_blank', 'noopener');
      return;
    }
    navigate(link);
  };

  const onClickItem = async (n) => {
    if (!n.is_read) {
      setItems(prev => prev.map(x => x.id === n.id ? { ...x, is_read: true } : x));
      setUnread(u => Math.max(0, u - 1));
      try { await axios.post(`${API}/notifications/${n.id}/read`, {}, { headers: authHeaders(), withCredentials: true }); } catch (_) {}
    }
    setOpen(false);
    openLink(n.link);
  };

  const markAllRead = async () => {
    setItems(prev => prev.map(x => ({ ...x, is_read: true })));
    setUnread(0);
    try { await axios.post(`${API}/notifications/read-all`, {}, { headers: authHeaders(), withCredentials: true }); } catch (_) {}
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          className="relative h-9 w-9 flex items-center justify-center rounded-lg text-white/60 hover:text-white hover:bg-white/10 transition-colors"
          title="Notifications"
          data-testid="notification-bell-btn"
        >
          <Bell className="h-5 w-5" />
          {unread > 0 && (
            <span
              className="absolute -top-0.5 -right-0.5 min-w-[18px] h-[18px] px-1 rounded-full bg-red-500 text-white text-[10px] font-bold flex items-center justify-center ring-2 ring-[#0b1220]"
              data-testid="notification-unread-badge"
            >
              {unread > 99 ? '99+' : unread}
            </span>
          )}
        </button>
      </PopoverTrigger>
      <PopoverContent align="start" side="top" className="w-80 p-0 overflow-hidden" data-testid="notification-panel">
        <div className="flex items-center justify-between px-3 py-2.5 border-b bg-slate-50">
          <span className="text-sm font-semibold text-slate-800">Notifications</span>
          {unread > 0 && (
            <button onClick={markAllRead} className="text-xs text-slate-500 hover:text-slate-900 inline-flex items-center gap-1" data-testid="notification-mark-all-read">
              <CheckCheck className="h-3.5 w-3.5" /> Mark all read
            </button>
          )}
        </div>
        <div className="max-h-[360px] overflow-y-auto">
          {loading && items.length === 0 ? (
            <div className="px-3 py-8 text-center text-sm text-slate-400">Loading…</div>
          ) : items.length === 0 ? (
            <div className="px-3 py-10 text-center text-sm text-slate-400" data-testid="notification-empty">
              <Bell className="h-8 w-8 mx-auto mb-2 opacity-40" />
              You're all caught up
            </div>
          ) : (
            items.map((n) => (
              <button
                key={n.id}
                onClick={() => onClickItem(n)}
                className={`w-full text-left px-3 py-2.5 border-b last:border-b-0 hover:bg-slate-50 transition-colors flex gap-2 ${n.is_read ? '' : 'bg-fuchsia-50/40'}`}
                data-testid={`notification-item-${n.id}`}
              >
                <span className={`mt-1.5 h-2 w-2 rounded-full shrink-0 ${n.is_read ? 'bg-transparent' : 'bg-fuchsia-500'}`} />
                <span className="min-w-0 flex-1">
                  <span className="block text-sm font-medium text-slate-800 truncate">{n.title}</span>
                  {n.body && <span className="block text-xs text-slate-500 mt-0.5 line-clamp-2">{n.body}</span>}
                  <span className="block text-[10px] text-slate-400 mt-1">{timeAgo(n.created_at)}</span>
                </span>
                {n.is_read && <Check className="h-3.5 w-3.5 text-slate-300 shrink-0 mt-1" />}
              </button>
            ))
          )}
        </div>
        <button
          onClick={() => { setOpen(false); navigate('/notifications'); }}
          className="w-full text-center px-3 py-2.5 text-xs font-medium text-emerald-700 hover:bg-emerald-50 border-t transition-colors"
          data-testid="notification-view-all"
        >
          View all notifications
        </button>
      </PopoverContent>
    </Popover>
  );
}
