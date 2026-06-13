import React, { useEffect, useState, useCallback, useRef } from 'react';
import axios from 'axios';
import { toast } from 'sonner';
import {
  Mail as MailIcon, Loader2, RefreshCw, Search, Send, X, Plug,
  ArrowLeft, Paperclip, Reply, PenSquare, AlertCircle, Inbox, ShieldCheck,
} from 'lucide-react';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Textarea } from '../components/ui/textarea';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from '../components/ui/dialog';
import { Badge } from '../components/ui/badge';

const API_URL = process.env.REACT_APP_BACKEND_URL + '/api';
const authHeaders = () => ({ Authorization: `Bearer ${localStorage.getItem('token')}` });

// Parse "Name <email>" → { name, email }
const parseAddr = (raw) => {
  if (!raw) return { name: '', email: '' };
  const m = raw.match(/^\s*"?([^"<]*)"?\s*<([^>]+)>/);
  if (m) return { name: m[1].trim() || m[2].trim(), email: m[2].trim() };
  return { name: raw.trim(), email: raw.trim() };
};

const relTime = (dateStr) => {
  if (!dateStr) return '';
  const d = new Date(dateStr);
  if (isNaN(d)) return dateStr;
  const now = new Date();
  const sameDay = d.toDateString() === now.toDateString();
  if (sameDay) return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  const sameYear = d.getFullYear() === now.getFullYear();
  return d.toLocaleDateString([], sameYear ? { month: 'short', day: 'numeric' } : { month: 'short', day: 'numeric', year: 'numeric' });
};

// Sandboxed iframe to safely render email HTML (scripts blocked)
function MessageBody({ html, text }) {
  if (html) {
    return (
      <iframe
        title="email-body"
        sandbox=""
        className="w-full min-h-[120px] border-0 bg-white"
        style={{ height: '420px' }}
        srcDoc={`<!doctype html><html><head><meta charset="utf-8"><base target="_blank"><style>body{font-family:system-ui,-apple-system,Segoe UI,Roboto,sans-serif;color:#0f172a;margin:8px;font-size:14px;line-height:1.5;}img{max-width:100%;height:auto;}</style></head><body>${html}</body></html>`}
        data-testid="email-html-body"
      />
    );
  }
  return <pre className="whitespace-pre-wrap text-sm text-slate-800 font-sans p-2" data-testid="email-text-body">{text || '(no content)'}</pre>;
}

export default function Mail() {
  const [status, setStatus] = useState(null); // {connected, configured, email}
  const [loadingStatus, setLoadingStatus] = useState(true);
  const [connecting, setConnecting] = useState(false);

  const [messages, setMessages] = useState([]);
  const [loadingList, setLoadingList] = useState(false);
  const [search, setSearch] = useState('');
  const [activeQuery, setActiveQuery] = useState('');

  const [thread, setThread] = useState(null); // {thread_id, messages:[...]}
  const [loadingThread, setLoadingThread] = useState(false);

  const [composeOpen, setComposeOpen] = useState(false);
  const [compose, setCompose] = useState({ to: '', subject: '', body_text: '', reply_to_message_id: null, thread_id: null });
  const [sending, setSending] = useState(false);
  const searchRef = useRef(null);

  const fetchStatus = useCallback(async () => {
    setLoadingStatus(true);
    try {
      const res = await axios.get(`${API_URL}/gmail/status`, { headers: authHeaders() });
      setStatus(res.data);
    } catch {
      setStatus({ connected: false, configured: false });
    } finally {
      setLoadingStatus(false);
    }
  }, []);

  const fetchMessages = useCallback(async (q = '') => {
    setLoadingList(true);
    try {
      const params = q ? { q } : { label: 'INBOX' };
      const res = await axios.get(`${API_URL}/gmail/messages`, { headers: authHeaders(), params });
      setMessages(res.data.messages || []);
    } catch (e) {
      if (e.response?.status === 409) {
        toast.error('Gmail disconnected. Please reconnect.');
        setStatus((s) => ({ ...s, connected: false }));
      } else {
        toast.error('Could not load emails');
      }
    } finally {
      setLoadingList(false);
    }
  }, []);

  useEffect(() => { fetchStatus(); }, [fetchStatus]);

  // Handle OAuth return
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get('gmail') === 'connected') {
      toast.success(`Gmail connected: ${params.get('email') || ''}`);
      window.history.replaceState({}, '', '/mail');
      fetchStatus();
    } else if (params.get('gmail') === 'error') {
      toast.error(`Gmail connection failed: ${params.get('reason') || 'unknown'}`);
      window.history.replaceState({}, '', '/mail');
    }
  }, [fetchStatus]);

  useEffect(() => {
    if (status?.connected) fetchMessages();
  }, [status?.connected, fetchMessages]);

  const connect = async () => {
    setConnecting(true);
    try {
      const res = await axios.get(`${API_URL}/oauth/gmail/login`, {
        headers: authHeaders(),
        params: { redirect_base: window.location.origin },
      });
      window.location.href = res.data.authorization_url;
    } catch (e) {
      toast.error(e.response?.data?.detail || 'Could not start Gmail connection');
      setConnecting(false);
    }
  };

  const disconnect = async () => {
    try {
      await axios.post(`${API_URL}/gmail/disconnect`, {}, { headers: authHeaders() });
      toast.success('Gmail disconnected');
      setMessages([]); setThread(null);
      fetchStatus();
    } catch {
      toast.error('Could not disconnect');
    }
  };

  const openThread = async (msg) => {
    setLoadingThread(true);
    setThread({ thread_id: msg.threadId, messages: [] });
    try {
      const res = await axios.get(`${API_URL}/gmail/threads/${msg.threadId}`, { headers: authHeaders() });
      setThread(res.data);
    } catch {
      toast.error('Could not open conversation');
      setThread(null);
    } finally {
      setLoadingThread(false);
    }
  };

  const runSearch = (e) => {
    e?.preventDefault();
    const q = search.trim();
    setActiveQuery(q);
    setThread(null);
    fetchMessages(q);
  };

  const startReply = (msg) => {
    const from = parseAddr(msg.from);
    setCompose({
      to: from.email,
      subject: msg.subject?.toLowerCase().startsWith('re:') ? msg.subject : `Re: ${msg.subject || ''}`,
      body_text: '',
      reply_to_message_id: msg.id,
      thread_id: thread?.thread_id,
    });
    setComposeOpen(true);
  };

  const startCompose = () => {
    setCompose({ to: '', subject: '', body_text: '', reply_to_message_id: null, thread_id: null });
    setComposeOpen(true);
  };

  const sendEmail = async () => {
    if (!compose.to.trim()) { toast.error('Recipient is required'); return; }
    if (!compose.body_text.trim()) { toast.error('Message body is required'); return; }
    setSending(true);
    try {
      await axios.post(`${API_URL}/gmail/send`, {
        to: compose.to,
        subject: compose.subject,
        body_text: compose.body_text,
        reply_to_message_id: compose.reply_to_message_id,
        thread_id: compose.thread_id,
      }, { headers: authHeaders() });
      toast.success('Email sent');
      setComposeOpen(false);
      if (compose.thread_id && thread) openThread({ threadId: compose.thread_id });
      else fetchMessages(activeQuery);
    } catch (e) {
      toast.error(e.response?.data?.detail || 'Failed to send email');
    } finally {
      setSending(false);
    }
  };

  // ---------- Render states ----------
  if (loadingStatus) {
    return <div className="flex items-center justify-center h-[60vh]"><Loader2 className="h-6 w-6 animate-spin text-slate-400" /></div>;
  }

  if (!status?.configured) {
    return (
      <div className="max-w-xl mx-auto mt-16 text-center px-4" data-testid="gmail-not-configured">
        <AlertCircle className="h-10 w-10 text-amber-500 mx-auto mb-3" />
        <h2 className="text-lg font-semibold">Gmail integration not configured</h2>
        <p className="text-muted-foreground text-sm mt-1">Ask your administrator to set up the Gmail integration credentials.</p>
      </div>
    );
  }

  if (!status?.connected) {
    return (
      <div className="max-w-lg mx-auto mt-16 px-4" data-testid="gmail-connect-screen">
        <div className="rounded-2xl border border-slate-200 bg-white p-8 text-center shadow-sm">
          <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-gradient-to-br from-rose-500 to-red-600">
            <MailIcon className="h-7 w-7 text-white" />
          </div>
          <h2 className="text-xl font-semibold text-slate-900">Bring your inbox into the CRM</h2>
          <p className="text-sm text-muted-foreground mt-2">Connect your Google Workspace mailbox to read, send and reply to emails — and see all messages exchanged with your contacts, right here.</p>
          <Button onClick={connect} disabled={connecting} className="mt-6 bg-rose-600 hover:bg-rose-700 text-white" data-testid="gmail-connect-btn">
            {connecting ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Plug className="h-4 w-4 mr-2" />}
            Connect Gmail
          </Button>
          <p className="text-[11px] text-slate-400 mt-4 flex items-center justify-center gap-1">
            <ShieldCheck className="h-3.5 w-3.5" /> Secure Google OAuth · only you can access your mailbox
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="p-4 sm:p-6 max-w-[1500px] mx-auto" data-testid="mail-page">
      {/* Header */}
      <div className="flex items-center gap-3 mb-4 flex-wrap">
        <div className="flex items-center gap-2">
          <div className="p-2 rounded-xl bg-rose-500/10"><MailIcon className="h-5 w-5 text-rose-600" /></div>
          <div>
            <h1 className="text-xl font-bold text-slate-900">Mail</h1>
            <p className="text-xs text-muted-foreground">{status.email}</p>
          </div>
        </div>
        <div className="ml-auto flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={() => fetchMessages(activeQuery)} data-testid="mail-refresh-btn"><RefreshCw className="h-4 w-4" /></Button>
          <Button size="sm" className="bg-rose-600 hover:bg-rose-700 text-white" onClick={startCompose} data-testid="mail-compose-btn"><PenSquare className="h-4 w-4 mr-1.5" /> Compose</Button>
          <Button variant="ghost" size="sm" className="text-muted-foreground" onClick={disconnect} data-testid="mail-disconnect-btn">Disconnect</Button>
        </div>
      </div>

      {/* Search */}
      <form onSubmit={runSearch} className="relative mb-4 max-w-xl" data-testid="mail-search-form">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
        <Input ref={searchRef} value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search mail (e.g. from:client@x.com)" className="pl-9" data-testid="mail-search-input" />
        {activeQuery && <button type="button" onClick={() => { setSearch(''); setActiveQuery(''); fetchMessages(); }} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-700"><X className="h-4 w-4" /></button>}
      </form>

      <div className="grid grid-cols-1 lg:grid-cols-[380px_1fr] gap-4">
        {/* List */}
        <div className="rounded-xl border border-slate-200 bg-white overflow-hidden" data-testid="mail-list">
          <div className="px-4 py-2.5 border-b text-xs font-medium text-slate-500 flex items-center gap-1.5">
            <Inbox className="h-3.5 w-3.5" /> {activeQuery ? 'Search results' : 'Inbox'}
          </div>
          {loadingList ? (
            <div className="flex items-center justify-center py-16"><Loader2 className="h-5 w-5 animate-spin text-slate-400" /></div>
          ) : messages.length === 0 ? (
            <div className="text-center py-16 text-sm text-muted-foreground">No emails found</div>
          ) : (
            <ul className="divide-y divide-slate-100 max-h-[70vh] overflow-y-auto">
              {messages.map((m) => {
                const a = parseAddr(m.from);
                const active = thread?.thread_id === m.threadId;
                return (
                  <li key={m.id}>
                    <button onClick={() => openThread(m)} className={`w-full text-left px-4 py-3 hover:bg-slate-50 transition-colors ${active ? 'bg-rose-50/60' : ''}`} data-testid={`mail-item-${m.id}`}>
                      <div className="flex items-center gap-2">
                        <span className={`truncate text-sm ${m.unread ? 'font-semibold text-slate-900' : 'text-slate-700'}`}>{a.name}</span>
                        {m.unread && <span className="h-1.5 w-1.5 rounded-full bg-rose-500 shrink-0" />}
                        <span className="ml-auto text-[11px] text-slate-400 shrink-0">{relTime(m.date)}</span>
                      </div>
                      <p className={`truncate text-sm mt-0.5 ${m.unread ? 'font-medium text-slate-800' : 'text-slate-600'}`}>{m.subject}</p>
                      <p className="truncate text-xs text-slate-400 mt-0.5">{m.snippet}</p>
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </div>

        {/* Thread */}
        <div className="rounded-xl border border-slate-200 bg-white overflow-hidden min-h-[400px]" data-testid="mail-thread">
          {!thread ? (
            <div className="flex flex-col items-center justify-center h-full py-24 text-slate-300">
              <MailIcon className="h-10 w-10 mb-2" />
              <p className="text-sm text-slate-400">Select a conversation to read</p>
            </div>
          ) : loadingThread ? (
            <div className="flex items-center justify-center py-24"><Loader2 className="h-6 w-6 animate-spin text-slate-400" /></div>
          ) : (
            <div>
              <div className="px-5 py-3 border-b flex items-center gap-2">
                <button className="lg:hidden" onClick={() => setThread(null)}><ArrowLeft className="h-4 w-4" /></button>
                <h2 className="font-semibold text-slate-900 truncate">{thread.messages[0]?.subject}</h2>
                <Badge variant="outline" className="ml-auto text-[10px]">{thread.messages.length} message{thread.messages.length !== 1 ? 's' : ''}</Badge>
              </div>
              <div className="divide-y divide-slate-100 max-h-[68vh] overflow-y-auto">
                {thread.messages.map((m) => {
                  const a = parseAddr(m.from);
                  return (
                    <div key={m.id} className="p-5" data-testid={`thread-msg-${m.id}`}>
                      <div className="flex items-center gap-2 mb-2">
                        <div className="h-8 w-8 rounded-full bg-slate-100 flex items-center justify-center text-xs font-semibold text-slate-600">{(a.name || '?')[0]?.toUpperCase()}</div>
                        <div className="min-w-0">
                          <p className="text-sm font-medium text-slate-900 truncate">{a.name} <span className="text-slate-400 font-normal">&lt;{a.email}&gt;</span></p>
                          <p className="text-[11px] text-slate-400">to {parseAddr(m.to).email || m.to} · {relTime(m.date)}</p>
                        </div>
                        <Button size="sm" variant="ghost" className="ml-auto text-rose-600 hover:bg-rose-50" onClick={() => startReply(m)} data-testid={`reply-btn-${m.id}`}><Reply className="h-4 w-4 mr-1" /> Reply</Button>
                      </div>
                      {m.attachments?.length > 0 && (
                        <div className="flex flex-wrap gap-2 mb-2">
                          {m.attachments.map((att, i) => (
                            <span key={i} className="inline-flex items-center gap-1 text-xs bg-slate-50 border rounded px-2 py-1 text-slate-600"><Paperclip className="h-3 w-3" /> {att.filename}</span>
                          ))}
                        </div>
                      )}
                      <div className="rounded-lg border border-slate-100 overflow-hidden">
                        <MessageBody html={m.html_body} text={m.text_body} />
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Compose / Reply dialog */}
      <Dialog open={composeOpen} onOpenChange={setComposeOpen}>
        <DialogContent className="max-w-2xl" data-testid="compose-dialog">
          <DialogHeader><DialogTitle>{compose.reply_to_message_id ? 'Reply' : 'New email'}</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <Input placeholder="To" value={compose.to} onChange={(e) => setCompose({ ...compose, to: e.target.value })} data-testid="compose-to" />
            <Input placeholder="Subject" value={compose.subject} onChange={(e) => setCompose({ ...compose, subject: e.target.value })} data-testid="compose-subject" />
            <Textarea placeholder="Write your message..." rows={10} value={compose.body_text} onChange={(e) => setCompose({ ...compose, body_text: e.target.value })} data-testid="compose-body" />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setComposeOpen(false)}>Cancel</Button>
            <Button className="bg-rose-600 hover:bg-rose-700 text-white" onClick={sendEmail} disabled={sending} data-testid="compose-send-btn">
              {sending ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Send className="h-4 w-4 mr-2" />} Send
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
