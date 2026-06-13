import React, { useEffect, useState, useCallback } from 'react';
import axios from 'axios';
import { toast } from 'sonner';
import { Mail as MailIcon, Loader2, ChevronDown, ChevronRight, Plug, PenSquare, Send, ExternalLink } from 'lucide-react';
import { Button } from '../ui/button';
import { Input } from '../ui/input';
import { Textarea } from '../ui/textarea';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '../ui/dialog';
import { useNavigate } from 'react-router-dom';

const API_URL = process.env.REACT_APP_BACKEND_URL + '/api';
const authHeaders = () => ({ Authorization: `Bearer ${localStorage.getItem('token')}` });

const parseAddr = (raw) => {
  if (!raw) return { name: '', email: '' };
  const m = raw.match(/^\s*"?([^"<]*)"?\s*<([^>]+)>/);
  if (m) return { name: m[1].trim() || m[2].trim(), email: m[2].trim() };
  return { name: raw.trim(), email: raw.trim() };
};
const relTime = (d) => {
  if (!d) return '';
  const dt = new Date(d);
  if (isNaN(dt)) return d;
  return dt.toLocaleDateString([], { month: 'short', day: 'numeric', year: 'numeric' });
};

/**
 * Embedded panel showing all Gmail messages exchanged with `email`,
 * for Lead / Account / Contact detail pages. Lets the user reply/compose inline.
 */
export default function ContactEmails({ email, name }) {
  const navigate = useNavigate();
  const [status, setStatus] = useState(null);
  const [loading, setLoading] = useState(true);
  const [messages, setMessages] = useState([]);
  const [openId, setOpenId] = useState(null);
  const [bodyCache, setBodyCache] = useState({});
  const [composeOpen, setComposeOpen] = useState(false);
  const [compose, setCompose] = useState({ subject: '', body_text: '', reply_to_message_id: null, thread_id: null });
  const [sending, setSending] = useState(false);

  const load = useCallback(async () => {
    if (!email) { setLoading(false); return; }
    setLoading(true);
    try {
      const st = await axios.get(`${API_URL}/gmail/status`, { headers: authHeaders() });
      setStatus(st.data);
      if (st.data.connected) {
        const res = await axios.get(`${API_URL}/gmail/contact-emails`, { headers: authHeaders(), params: { email } });
        setMessages(res.data.messages || []);
      }
    } catch {
      setStatus({ connected: false, configured: true });
    } finally {
      setLoading(false);
    }
  }, [email]);

  useEffect(() => { load(); }, [load]);

  const toggle = async (m) => {
    if (openId === m.id) { setOpenId(null); return; }
    setOpenId(m.id);
    if (!bodyCache[m.id]) {
      try {
        const res = await axios.get(`${API_URL}/gmail/messages/${m.id}`, { headers: authHeaders() });
        setBodyCache((c) => ({ ...c, [m.id]: res.data }));
      } catch { /* ignore */ }
    }
  };

  const openCompose = (m) => {
    setCompose({
      subject: m ? (m.subject?.toLowerCase().startsWith('re:') ? m.subject : `Re: ${m.subject || ''}`) : '',
      body_text: '',
      reply_to_message_id: m?.id || null,
      thread_id: m?.threadId || null,
    });
    setComposeOpen(true);
  };

  const send = async () => {
    if (!compose.body_text.trim()) { toast.error('Message body is required'); return; }
    setSending(true);
    try {
      await axios.post(`${API_URL}/gmail/send`, {
        to: email,
        subject: compose.subject,
        body_text: compose.body_text,
        reply_to_message_id: compose.reply_to_message_id,
        thread_id: compose.thread_id,
      }, { headers: authHeaders() });
      toast.success('Email sent');
      setComposeOpen(false);
      load();
    } catch (e) {
      toast.error(e.response?.data?.detail || 'Failed to send');
    } finally {
      setSending(false);
    }
  };

  const connect = async () => {
    try {
      const res = await axios.get(`${API_URL}/oauth/gmail/login`, { headers: authHeaders(), params: { redirect_base: window.location.origin } });
      window.location.href = res.data.authorization_url;
    } catch { toast.error('Could not start Gmail connection'); }
  };

  if (loading) return <div className="flex items-center justify-center py-8"><Loader2 className="h-5 w-5 animate-spin text-slate-400" /></div>;

  if (!status?.configured) return null;

  if (!status?.connected) {
    return (
      <div className="rounded-lg border border-dashed border-slate-200 p-5 text-center" data-testid="contact-emails-connect">
        <MailIcon className="h-6 w-6 text-slate-300 mx-auto mb-2" />
        <p className="text-sm text-muted-foreground mb-3">Connect your Gmail to see emails exchanged with this contact.</p>
        <Button size="sm" variant="outline" onClick={connect} data-testid="contact-emails-connect-btn"><Plug className="h-4 w-4 mr-1.5" /> Connect Gmail</Button>
      </div>
    );
  }

  return (
    <div data-testid="contact-emails">
      <div className="flex items-center justify-between mb-3">
        <p className="text-xs text-muted-foreground">{messages.length} email{messages.length !== 1 ? 's' : ''} with {email}</p>
        <div className="flex gap-1.5">
          <Button size="sm" variant="outline" onClick={() => openCompose(null)} data-testid="contact-emails-compose-btn"><PenSquare className="h-3.5 w-3.5 mr-1" /> New email</Button>
          <Button size="sm" variant="ghost" className="text-muted-foreground" onClick={() => navigate('/mail')} title="Open Mail"><ExternalLink className="h-3.5 w-3.5" /></Button>
        </div>
      </div>

      {messages.length === 0 ? (
        <p className="text-sm text-muted-foreground text-center py-6">No emails exchanged with this contact yet.</p>
      ) : (
        <ul className="divide-y divide-slate-100 border rounded-lg overflow-hidden">
          {messages.map((m) => {
            const a = parseAddr(m.from);
            const body = bodyCache[m.id];
            const isOpen = openId === m.id;
            return (
              <li key={m.id} data-testid={`contact-email-${m.id}`}>
                <button onClick={() => toggle(m)} className="w-full text-left px-3 py-2.5 hover:bg-slate-50 flex items-start gap-2">
                  {isOpen ? <ChevronDown className="h-4 w-4 text-slate-400 mt-0.5 shrink-0" /> : <ChevronRight className="h-4 w-4 text-slate-400 mt-0.5 shrink-0" />}
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <span className={`truncate text-sm ${m.unread ? 'font-semibold' : 'text-slate-700'}`}>{a.name}</span>
                      <span className="ml-auto text-[11px] text-slate-400 shrink-0">{relTime(m.date)}</span>
                    </div>
                    <p className="truncate text-sm text-slate-700">{m.subject}</p>
                    {!isOpen && <p className="truncate text-xs text-slate-400">{m.snippet}</p>}
                  </div>
                </button>
                {isOpen && (
                  <div className="px-4 pb-3" data-testid={`contact-email-body-${m.id}`}>
                    {!body ? (
                      <div className="py-3"><Loader2 className="h-4 w-4 animate-spin text-slate-400" /></div>
                    ) : body.html_body ? (
                      <iframe title="email" sandbox="" className="w-full border rounded bg-white" style={{ height: 280 }} srcDoc={`<!doctype html><html><head><meta charset='utf-8'><base target='_blank'><style>body{font-family:system-ui;font-size:13px;color:#0f172a;margin:8px;line-height:1.5}img{max-width:100%}</style></head><body>${body.html_body}</body></html>`} />
                    ) : (
                      <pre className="whitespace-pre-wrap text-sm text-slate-700 font-sans bg-slate-50 rounded p-2">{body.text_body || '(no content)'}</pre>
                    )}
                    <div className="mt-2 flex justify-end">
                      <Button size="sm" variant="outline" className="text-rose-600" onClick={() => openCompose(m)}>Reply</Button>
                    </div>
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      )}

      <Dialog open={composeOpen} onOpenChange={setComposeOpen}>
        <DialogContent className="max-w-xl" data-testid="contact-compose-dialog">
          <DialogHeader><DialogTitle>{compose.reply_to_message_id ? 'Reply' : 'Email'} {name || email}</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <Input value={email} disabled />
            <Input placeholder="Subject" value={compose.subject} onChange={(e) => setCompose({ ...compose, subject: e.target.value })} data-testid="contact-compose-subject" />
            <Textarea rows={8} placeholder="Write your message..." value={compose.body_text} onChange={(e) => setCompose({ ...compose, body_text: e.target.value })} data-testid="contact-compose-body" />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setComposeOpen(false)}>Cancel</Button>
            <Button className="bg-rose-600 hover:bg-rose-700 text-white" onClick={send} disabled={sending} data-testid="contact-compose-send">
              {sending ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Send className="h-4 w-4 mr-2" />} Send
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
