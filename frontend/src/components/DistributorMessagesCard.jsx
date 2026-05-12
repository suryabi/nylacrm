import React, { useEffect, useState } from 'react';
import axios from 'axios';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from './ui/card';
import { Badge } from './ui/badge';
import { Button } from './ui/button';
import { MessageSquare, ChevronRight, RefreshCw } from 'lucide-react';
import { useAuth } from '../context/AuthContext';

const API_URL = process.env.REACT_APP_BACKEND_URL;
const authHeaders = () => ({
  Authorization: `Bearer ${localStorage.getItem('token') || localStorage.getItem('session_token') || ''}`,
});

const SUPPLIER_ROLES = ['CEO', 'Admin', 'Distribution Manager', 'Distribution Admin', 'System Admin'];

/**
 * Home dashboard card showing distributor-message unread alerts.
 * Visible only to supplier-side admin roles. Clicking a row triggers a global
 * event that the FAB listens to, so the same chat drawer opens to that thread.
 */
export default function DistributorMessagesCard() {
  const { user } = useAuth();
  const [threads, setThreads] = useState([]);
  const [loading, setLoading] = useState(true);
  const [totalUnread, setTotalUnread] = useState(0);

  const isSupplier = user && SUPPLIER_ROLES.includes(user.role);

  const load = async () => {
    setLoading(true);
    try {
      const { data } = await axios.get(`${API_URL}/api/distributor-chat/threads`, { headers: authHeaders() });
      setThreads(data?.threads || []);
      setTotalUnread(data?.total_unread || 0);
    } catch (_) { /* silent */ }
    finally { setLoading(false); }
  };

  useEffect(() => {
    if (!isSupplier) return;
    load();
    // refresh on tab focus
    const onFocus = () => load();
    window.addEventListener('focus', onFocus);
    return () => window.removeEventListener('focus', onFocus);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isSupplier]);

  if (!isSupplier) return null;

  // Only show rows with unread or any activity in the last 30 days. Limit to 5.
  const visible = threads.filter(t => t.unread_count > 0).slice(0, 5);
  const otherCount = Math.max(0, threads.length - visible.length);

  return (
    <Card className={totalUnread > 0 ? 'border-amber-300 bg-amber-50/40' : ''} data-testid="distributor-messages-card">
      <CardHeader className="pb-3">
        <div className="flex items-start justify-between gap-2">
          <div>
            <CardTitle className="flex items-center gap-2 text-base">
              <MessageSquare className="h-4 w-4 text-emerald-600" />
              Distributor Messages
              {totalUnread > 0 && (
                <Badge className="bg-red-500 hover:bg-red-500 text-white">{totalUnread} new</Badge>
              )}
            </CardTitle>
            <CardDescription className="text-xs mt-0.5">
              {totalUnread > 0
                ? `${visible.length} distributor${visible.length === 1 ? '' : 's'} waiting for a response`
                : 'No new questions from distributors'}
            </CardDescription>
          </div>
          <Button size="sm" variant="ghost" onClick={load} className="h-7 w-7 p-0">
            <RefreshCw className={`h-3.5 w-3.5 ${loading ? 'animate-spin' : ''}`} />
          </Button>
        </div>
      </CardHeader>
      <CardContent className="pt-0">
        {loading ? (
          <div className="py-3 text-center text-xs text-muted-foreground">Loading…</div>
        ) : visible.length === 0 ? (
          <p className="text-xs text-muted-foreground py-2">
            All caught up. Distributors can ping you anytime through the chat — you'll see new messages here.
          </p>
        ) : (
          <ul className="space-y-1">
            {visible.map((t) => (
              <li key={t.distributor_id}>
                <button
                  onClick={() => window.dispatchEvent(new CustomEvent('open-distributor-chat', { detail: { distributor_id: t.distributor_id, name: t.distributor_name, code: t.distributor_code } }))}
                  className="w-full text-left px-3 py-2 rounded-md hover:bg-white border border-transparent hover:border-slate-200 transition flex items-center gap-2"
                  data-testid={`home-thread-${t.distributor_id}`}
                >
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="font-medium text-sm truncate">{t.distributor_name}</span>
                      <Badge className="bg-red-500 hover:bg-red-500 text-white text-xs">{t.unread_count}</Badge>
                    </div>
                    <p className="text-xs text-muted-foreground truncate">{t.last_message}</p>
                  </div>
                  <ChevronRight className="h-4 w-4 text-muted-foreground" />
                </button>
              </li>
            ))}
            {otherCount > 0 && (
              <li className="text-xs text-muted-foreground px-3 pt-1">
                + {otherCount} other conversation{otherCount === 1 ? '' : 's'} without new messages
              </li>
            )}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}
