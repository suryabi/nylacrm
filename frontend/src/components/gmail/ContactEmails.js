import React, { useEffect, useState, useCallback } from 'react';
import axios from 'axios';
import { toast } from 'sonner';
import { Mail as MailIcon, Loader2, ChevronDown, ChevronRight, Plug, PenSquare, ExternalLink, Paperclip, Download } from 'lucide-react';
import { Button } from '../ui/button';
import { useNavigate } from 'react-router-dom';
import { downloadAttachment, humanSize } from './gmailUtils';
import InlineComposer from './InlineComposer';

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
  // composer: null | { replyToMessageId, threadId, subject }
  const [composer, setComposer] = useState(null);

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
    if (m.unread) {
      axios.post(`${API_URL}/gmail/mark-read`, { message_ids: [m.id] }, { headers: authHeaders() }).catch(() => {});
      setMessages((prev) => prev.map((x) => (x.id === m.id ? { ...x, unread: false } : x)));
    }
  };

  const openNewEmail = () => {
    setComposer({ replyToMessageId: null, threadId: null, subject: '' });
  };

  const openReply = (m) => {
    setComposer({
      replyToMessageId: m.id,
      threadId: m.threadId || null,
      subject: m.subject?.toLowerCase().startsWith('re:') ? m.subject : `Re: ${m.subject || ''}`,
    });
  };

  const handleSent = () => {
    setComposer(null);
    load();
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

  const isNewEmail = composer && !composer.replyToMessageId;

  return (
    <div data-testid="contact-emails">
      <div className="flex items-center justify-between mb-3">
        <p className="text-xs text-muted-foreground">{messages.length} email{messages.length !== 1 ? 's' : ''} with {email}</p>
        <div className="flex gap-1.5">
          <Button size="sm" variant="outline" onClick={openNewEmail} data-testid="contact-emails-compose-btn"><PenSquare className="h-3.5 w-3.5 mr-1" /> New email</Button>
          <Button size="sm" variant="ghost" className="text-muted-foreground" onClick={() => navigate('/mail')} title="Open Mail"><ExternalLink className="h-3.5 w-3.5" /></Button>
        </div>
      </div>

      {/* Inline new-email composer */}
      {isNewEmail && (
        <div className="mb-3" data-testid="contact-new-email-panel">
          <InlineComposer
            key="contact-compose"
            initialTo={email}
            toEditable={false}
            recipientLabel={name || email}
            onCancel={() => setComposer(null)}
            onSent={handleSent}
            testid="contact-composer"
          />
        </div>
      )}

      {messages.length === 0 ? (
        <p className="text-sm text-muted-foreground text-center py-6">No emails exchanged with this contact yet.</p>
      ) : (
        <ul className="divide-y divide-slate-100 border rounded-lg overflow-hidden">
          {messages.map((m) => {
            const a = parseAddr(m.from);
            const body = bodyCache[m.id];
            const isOpen = openId === m.id;
            const replyingHere = composer && composer.replyToMessageId === m.id;
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
                    {body?.attachments?.length > 0 && (
                      <div className="flex flex-wrap gap-2 mt-2">
                        {body.attachments.map((att, i) => (
                          <button key={i} onClick={() => downloadAttachment(m.id, att).catch(() => toast.error('Download failed'))} className="inline-flex items-center gap-1 text-xs bg-slate-50 hover:bg-slate-100 border rounded px-2 py-1 text-slate-700" data-testid={`contact-attachment-${m.id}-${i}`} title={`Download ${att.filename}`}>
                            <Paperclip className="h-3 w-3" /> {att.filename} <span className="text-slate-400">{humanSize(att.size)}</span> <Download className="h-3 w-3 text-rose-600" />
                          </button>
                        ))}
                      </div>
                    )}
                    {replyingHere ? (
                      <div className="mt-3" data-testid={`contact-reply-panel-${m.id}`}>
                        <InlineComposer
                          key={`reply-${m.id}`}
                          initialTo={email}
                          toEditable={false}
                          recipientLabel={name || email}
                          initialSubject={composer.subject}
                          replyToMessageId={composer.replyToMessageId}
                          threadId={composer.threadId}
                          onCancel={() => setComposer(null)}
                          onSent={handleSent}
                          testid={`contact-reply-composer-${m.id}`}
                        />
                      </div>
                    ) : (
                      <div className="mt-2 flex justify-end">
                        <Button size="sm" variant="outline" className="text-rose-600" onClick={() => openReply(m)} data-testid={`contact-reply-btn-${m.id}`}>Reply</Button>
                      </div>
                    )}
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
