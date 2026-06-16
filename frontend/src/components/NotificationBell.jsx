import React, { useState, useEffect, useCallback, useRef } from 'react';
import axios from 'axios';
import { Bell } from 'lucide-react';
import NotificationsPanel from './NotificationsPanel';

const API = `${process.env.REACT_APP_BACKEND_URL}/api`;

export default function NotificationBell() {
  const [open, setOpen] = useState(false);
  const [unread, setUnread] = useState(0);
  const pollRef = useRef(null);

  const authHeaders = useCallback(() => {
    const token = localStorage.getItem('token') || localStorage.getItem('session_token');
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

  useEffect(() => {
    fetchCount();
    pollRef.current = setInterval(fetchCount, 60000);
    return () => clearInterval(pollRef.current);
  }, [fetchCount]);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
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
      <NotificationsPanel open={open} onOpenChange={setOpen} onUnreadChange={setUnread} />
    </>
  );
}
