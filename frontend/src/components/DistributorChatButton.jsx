import React, { useState, useEffect, useCallback, useRef } from 'react';
import axios from 'axios';
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from './ui/sheet';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { Badge } from './ui/badge';
import { MessageSquare, Send, ArrowLeft, RefreshCw, Building2 } from 'lucide-react';
import { toast } from 'sonner';
import { useAuth } from '../context/AuthContext';

const API_URL = process.env.REACT_APP_BACKEND_URL;
const authHeaders = () => ({
  Authorization: `Bearer ${localStorage.getItem('token') || localStorage.getItem('session_token') || ''}`,
});

const SUPPLIER_ROLES = ['CEO', 'Admin', 'Distribution Manager', 'Distribution Admin', 'System Admin'];

/**
 * Floating chat button + drawer for the Distributor ↔ Supplier chat.
 *
 * - Distributor users: opens their own thread directly.
 * - Supplier users:    opens a thread list; clicking a row opens that thread.
 *
 * Polls unread count every 30s (lightweight) and on route changes.
 */
export default function DistributorChatButton() {
  const { user } = useAuth();
  const [open, setOpen] = useState(false);
  const [unread, setUnread] = useState(0);
  const [threads, setThreads] = useState([]);
  const [activeThread, setActiveThread] = useState(null);
  const [messages, setMessages] = useState([]);
  const [draft, setDraft] = useState('');
  const [loading, setLoading] = useState(false);
  const [sending, setSending] = useState(false);
  const scrollRef = useRef(null);

  const isSupplier = user && SUPPLIER_ROLES.includes(user.role);
  const isDistributor = user && user.role === 'Distributor';
  const enabled = !!user && (isSupplier || isDistributor);

  // ---- unread badge polling ----
  const refreshUnread = useCallback(async () => {
    if (!enabled) return;
    try {
      const { data } = await axios.get(`${API_URL}/api/distributor-chat/unread-count`, { headers: authHeaders() });
      setUnread(data?.unread_count || 0);
    } catch (_) { /* silent */ }
  }, [enabled]);

  useEffect(() => {
    if (!enabled) return;
    refreshUnread();
    const id = setInterval(refreshUnread, 30000);
    return () => clearInterval(id);
  }, [enabled, refreshUnread]);

  // ---- load thread list (supplier) or open own thread (distributor) ----
  const loadThreads = useCallback(async () => {
    setLoading(true);
    try {
      const { data } = await axios.get(`${API_URL}/api/distributor-chat/threads`, { headers: authHeaders() });
      setThreads(data?.threads || []);
    } catch (err) {
      toast.error(err.response?.data?.detail || 'Failed to load chats');
    } finally {
      setLoading(false);
    }
  }, []);

  const openThread = useCallback(async (distributorId, distributorName, distributorCode) => {
    setActiveThread({ id: distributorId, name: distributorName, code: distributorCode });
    setLoading(true);
    try {
      const { data } = await axios.get(
        `${API_URL}/api/distributor-chat/distributors/${distributorId}/messages`,
        { headers: authHeaders() }
      );
      setMessages(data?.messages || []);
      // Mark unread → read on our side
      await axios.post(
        `${API_URL}/api/distributor-chat/distributors/${distributorId}/mark-read`,
        {}, { headers: authHeaders() }
      );
      refreshUnread();
    } catch (err) {
      toast.error(err.response?.data?.detail || 'Failed to load thread');
    } finally {
      setLoading(false);
      // scroll to bottom on next tick
      setTimeout(() => scrollRef.current?.scrollTo({ top: 1e9, behavior: 'smooth' }), 80);
    }
  }, [refreshUnread]);

  // ---- when drawer opens, do the right thing for the role ----
  useEffect(() => {
    if (!open || !enabled) return;
    if (isDistributor && user?.distributor_id) {
      openThread(user.distributor_id, user?.distributor_name || 'My thread', user?.distributor_code);
    } else if (isSupplier && !activeThread) {
      loadThreads();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  // ---- Global event so cards (e.g. home dashboard) can open a specific thread ----
  useEffect(() => {
    const handler = (e) => {
      const { distributor_id, name, code } = e.detail || {};
      if (!distributor_id) return;
      setOpen(true);
      openThread(distributor_id, name || 'Distributor', code);
    };
    window.addEventListener('open-distributor-chat', handler);
    return () => window.removeEventListener('open-distributor-chat', handler);
  }, [openThread]);

  const sendMessage = async () => {
    const text = draft.trim();
    if (!text || !activeThread) return;
    setSending(true);
    try {
      const { data } = await axios.post(
        `${API_URL}/api/distributor-chat/distributors/${activeThread.id}/messages`,
        { message: text },
        { headers: authHeaders() }
      );
      setMessages(prev => [...prev, data.data]);
      setDraft('');
      setTimeout(() => scrollRef.current?.scrollTo({ top: 1e9, behavior: 'smooth' }), 50);
    } catch (err) {
      toast.error(err.response?.data?.detail || 'Failed to send');
    } finally {
      setSending(false);
    }
  };

  if (!enabled) return null;

  return (
    <>
      {/* Floating button */}
      <button
        onClick={() => setOpen(true)}
        className="fixed bottom-6 right-6 z-40 h-14 w-14 rounded-full bg-emerald-600 hover:bg-emerald-700 text-white shadow-lg flex items-center justify-center transition-all hover:scale-105"
        aria-label="Open distributor chat"
        data-testid="distributor-chat-fab"
      >
        <MessageSquare className="h-6 w-6" />
        {unread > 0 && (
          <span className="absolute -top-1 -right-1 h-6 w-6 rounded-full bg-red-500 text-white text-xs font-bold flex items-center justify-center border-2 border-white">
            {unread > 99 ? '99+' : unread}
          </span>
        )}
      </button>

      <Sheet open={open} onOpenChange={setOpen}>
        <SheetContent side="right" className="w-full sm:max-w-md p-0 flex flex-col" data-testid="distributor-chat-drawer">
          <SheetHeader className="px-5 py-4 border-b">
            <div className="flex items-center gap-2">
              {isSupplier && activeThread && (
                <Button size="icon" variant="ghost" className="h-8 w-8" onClick={() => setActiveThread(null)} data-testid="chat-back-btn">
                  <ArrowLeft className="h-4 w-4" />
                </Button>
              )}
              <div className="flex-1">
                <SheetTitle className="flex items-center gap-2">
                  <MessageSquare className="h-4 w-4 text-emerald-600" />
                  {activeThread ? activeThread.name : 'Distributor Messages'}
                </SheetTitle>
                {activeThread?.code && (
                  <SheetDescription className="text-xs">{activeThread.code}</SheetDescription>
                )}
                {!activeThread && (
                  <SheetDescription className="text-xs">
                    {isSupplier ? 'Conversations with all distributors' : 'Chat with the supplier team'}
                  </SheetDescription>
                )}
              </div>
            </div>
          </SheetHeader>

          {/* Body: thread list OR conversation */}
          {!activeThread && isSupplier ? (
            <ThreadListView threads={threads} loading={loading} onOpen={openThread} onRefresh={loadThreads} />
          ) : (
            <ConversationView
              messages={messages}
              loading={loading}
              draft={draft}
              setDraft={setDraft}
              onSend={sendMessage}
              sending={sending}
              userId={user?.id}
              scrollRef={scrollRef}
            />
          )}
        </SheetContent>
      </Sheet>
    </>
  );
}

// ----------------- Thread list (supplier) -----------------
function ThreadListView({ threads, loading, onOpen, onRefresh }) {
  return (
    <div className="flex-1 flex flex-col overflow-hidden">
      <div className="flex justify-end px-5 py-2 border-b">
        <Button size="sm" variant="ghost" onClick={onRefresh} data-testid="chat-refresh-threads">
          <RefreshCw className={`h-4 w-4 mr-1.5 ${loading ? 'animate-spin' : ''}`} />Refresh
        </Button>
      </div>
      <div className="flex-1 overflow-y-auto">
        {loading ? (
          <div className="flex items-center justify-center py-12">
            <RefreshCw className="h-5 w-5 animate-spin text-muted-foreground" />
          </div>
        ) : threads.length === 0 ? (
          <div className="p-8 text-center text-sm text-muted-foreground">
            No distributor conversations yet.
          </div>
        ) : (
          <ul className="divide-y">
            {threads.map((t) => (
              <li key={t.distributor_id}>
                <button
                  onClick={() => onOpen(t.distributor_id, t.distributor_name, t.distributor_code)}
                  className="w-full text-left px-5 py-3 hover:bg-muted/40 transition flex items-start gap-3"
                  data-testid={`chat-thread-${t.distributor_id}`}
                >
                  <div className="h-10 w-10 rounded-full bg-emerald-100 flex items-center justify-center flex-shrink-0">
                    <Building2 className="h-5 w-5 text-emerald-700" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-medium truncate">{t.distributor_name}</span>
                      {t.unread_count > 0 && (
                        <Badge className="bg-red-500 hover:bg-red-500 text-white">{t.unread_count}</Badge>
                      )}
                    </div>
                    <p className="text-xs text-muted-foreground truncate">
                      {t.last_sender_side === 'distributor' ? '↳ ' : 'You: '}{t.last_message || '(no messages)'}
                    </p>
                    <p className="text-[10px] text-muted-foreground/70 mt-0.5">
                      {t.last_message_at ? new Date(t.last_message_at).toLocaleString() : ''}
                    </p>
                  </div>
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

// ----------------- Conversation view -----------------
function ConversationView({ messages, loading, draft, setDraft, onSend, sending, userId, scrollRef }) {
  return (
    <>
      <div ref={scrollRef} className="flex-1 overflow-y-auto px-4 py-3 space-y-3" data-testid="chat-messages-list">
        {loading ? (
          <div className="flex items-center justify-center py-12">
            <RefreshCw className="h-5 w-5 animate-spin text-muted-foreground" />
          </div>
        ) : messages.length === 0 ? (
          <p className="text-center text-sm text-muted-foreground py-8">
            No messages yet. Say hello to start the conversation.
          </p>
        ) : (
          messages.map((m) => {
            const mine = m.sender_id === userId;
            return (
              <div key={m.id} className={`flex ${mine ? 'justify-end' : 'justify-start'}`}>
                <div className={`max-w-[80%] ${mine ? 'bg-emerald-600 text-white' : 'bg-slate-100 text-slate-900'} rounded-2xl px-3.5 py-2 shadow-sm`}>
                  {!mine && (
                    <p className={`text-[11px] font-semibold mb-0.5 ${mine ? 'text-emerald-50' : 'text-slate-700'}`}>
                      {m.sender_name || m.sender_email}
                      {m.sender_side === 'supplier' && (
                        <span className="ml-1.5 inline-block px-1 py-0 text-[9px] rounded bg-blue-100 text-blue-700">Supplier</span>
                      )}
                    </p>
                  )}
                  <p className="text-sm whitespace-pre-wrap break-words">{m.message}</p>
                  <p className={`text-[10px] mt-1 ${mine ? 'text-emerald-100' : 'text-slate-500'} text-right`}>
                    {new Date(m.created_at).toLocaleString([], { hour: '2-digit', minute: '2-digit', day: '2-digit', month: 'short' })}
                  </p>
                </div>
              </div>
            );
          })
        )}
      </div>

      <div className="border-t p-3 flex gap-2">
        <Input
          placeholder="Type a message…"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); onSend(); } }}
          disabled={sending}
          data-testid="chat-input"
        />
        <Button onClick={onSend} disabled={sending || !draft.trim()} className="bg-emerald-600 hover:bg-emerald-700" data-testid="chat-send-btn">
          {sending ? <RefreshCw className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
        </Button>
      </div>
    </>
  );
}
