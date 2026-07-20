/**
 * AIAssistant — global floating ChatGPT assistant (bottom-right launcher + panel).
 * Multi-turn sessions, grounded in tenant CRM data via /api/ai/chat (SSE).
 */
import React, { useState, useRef, useEffect } from 'react';
import axios from 'axios';
import ReactMarkdown from 'react-markdown';
import { toast } from 'sonner';
import { Button } from '../ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../ui/select';
import { Sparkles, X, SendHorizonal, Plus, Loader2, Trash2, Bot, MessageCircleQuestion } from 'lucide-react';
import { streamAI } from './aiStream';

const API_URL = process.env.REACT_APP_BACKEND_URL;

const SUGGESTIONS = [
  'What stock is currently at each warehouse?',
  'Summarize recent deliveries',
  'Which leads need follow-up?',
  'Search the knowledge base for our pricing policy',
];

export default function AIAssistant() {
  const [open, setOpen] = useState(false);
  const [sessions, setSessions] = useState([]);
  const [sessionId, setSessionId] = useState(null);
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState('');
  const [streaming, setStreaming] = useState(false);
  const bottomRef = useRef(null);
  const token = localStorage.getItem('token');
  const authHeaders = { headers: { Authorization: `Bearer ${token}` } };

  useEffect(() => {
    if (!open) return;
    axios.get(`${API_URL}/api/ai/sessions`, authHeaders)
      .then(res => setSessions(res.data.sessions || []))
      .catch(() => {});
  }, [open]);  // eslint-disable-line react-hooks/exhaustive-deps

  // Hide the Ask Nyla right-edge tab while the inline panel is docked (visual clash).
  useEffect(() => {
    document.body.classList.toggle('ai-panel-open', open);
    return () => document.body.classList.remove('ai-panel-open');
  }, [open]);

  useEffect(() => { bottomRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [messages]);

  const loadSession = async (sid) => {
    setSessionId(sid);
    try {
      const res = await axios.get(`${API_URL}/api/ai/sessions/${sid}/messages`, authHeaders);
      setMessages(res.data.messages || []);
    } catch { setMessages([]); }
  };

  const newChat = () => { setSessionId(null); setMessages([]); };

  const deleteChat = async () => {
    if (!sessionId) return;
    try {
      await axios.delete(`${API_URL}/api/ai/sessions/${sessionId}`, authHeaders);
      setSessions(s => s.filter(x => x.id !== sessionId));
      newChat();
    } catch { toast.error('Failed to delete chat'); }
  };

  const send = async (text) => {
    const message = (text || input).trim();
    if (!message || streaming) return;
    setInput('');
    setStreaming(true);
    setMessages(m => [...m, { role: 'user', content: message }, { role: 'assistant', content: '' }]);
    try {
      await streamAI('/api/ai/chat', { session_id: sessionId, message }, (ev) => {
        if (ev.session_id && !sessionId) setSessionId(ev.session_id);
        if (ev.status) {
          setMessages(m => {
            const copy = [...m];
            copy[copy.length - 1] = { ...copy[copy.length - 1], status: ev.status };
            return copy;
          });
        }
        if (ev.delta) {
          setMessages(m => {
            const copy = [...m];
            copy[copy.length - 1] = { ...copy[copy.length - 1], content: copy[copy.length - 1].content + ev.delta, status: null };
            return copy;
          });
        }
        if (ev.error) toast.error(ev.error);
      });
      axios.get(`${API_URL}/api/ai/sessions`, authHeaders)
        .then(res => setSessions(res.data.sessions || [])).catch(() => {});
    } catch (e) {
      toast.error(e.message);
      setMessages(m => m.slice(0, -1));
    } finally {
      setStreaming(false);
    }
  };

  return (
    <>
      {/* Launcher (hidden while the panel is docked open) */}
      {!open && (
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="fixed bottom-6 right-6 z-[70] h-12 w-12 rounded-full bg-gradient-to-br from-violet-600 to-indigo-600 text-white shadow-lg shadow-violet-300/40 hover:scale-105 transition-transform flex items-center justify-center"
          title="AI Assistant"
          data-testid="ai-assistant-launcher"
        >
          <Sparkles className="h-5 w-5" />
        </button>
      )}

      {open && (
        <div
          className="fixed inset-0 h-full z-[70] sm:z-30 sm:inset-auto sm:sticky sm:top-0 sm:h-screen w-full sm:w-[380px] xl:w-[420px] sm:shrink-0 bg-white dark:bg-slate-900 border-l border-slate-200 dark:border-slate-700 shadow-xl sm:shadow-none flex flex-col overflow-hidden"
          data-testid="ai-assistant-panel"
        >
          {/* Header */}
          <div className="flex items-center gap-2 px-3 py-2.5 border-b bg-gradient-to-r from-violet-600 to-indigo-600 text-white">
            <Bot className="h-4 w-4 flex-shrink-0" />
            <span className="text-sm font-semibold flex-1">Ask Nyla</span>
            {sessions.length > 0 && (
              <Select value={sessionId || ''} onValueChange={loadSession}>
                <SelectTrigger className="h-7 w-[130px] bg-white/15 border-white/20 text-white text-[11px]" data-testid="ai-session-select">
                  <SelectValue placeholder="History" />
                </SelectTrigger>
                <SelectContent>
                  {sessions.map(s => (
                    <SelectItem key={s.id} value={s.id} className="text-xs">
                      {(s.title || 'Chat').slice(0, 32)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
            {sessionId && (
              <button onClick={deleteChat} className="text-white/70 hover:text-white" title="Delete this chat" data-testid="ai-delete-chat">
                <Trash2 className="h-3.5 w-3.5" />
              </button>
            )}
            <button onClick={newChat} className="text-white/80 hover:text-white" title="New chat" data-testid="ai-new-chat">
              <Plus className="h-4 w-4" />
            </button>
            <button onClick={() => setOpen(false)} className="text-white/80 hover:text-white ml-0.5" title="Close panel" data-testid="ai-close-panel">
              <X className="h-4 w-4" />
            </button>
          </div>

          {/* Messages */}
          <div className="flex-1 overflow-y-auto px-3 py-3 space-y-3 bg-slate-50/60 dark:bg-slate-950/40">
            {messages.length === 0 && (
              <div className="pt-6 text-center space-y-3" data-testid="ai-empty-state">
                <Sparkles className="h-8 w-8 text-violet-400 mx-auto" />
                <p className="text-sm text-slate-600 dark:text-slate-300 font-medium">Ask me anything — CRM data or company knowledge base</p>
                <div className="space-y-1.5">
                  {SUGGESTIONS.map((s, i) => (
                    <button
                      key={i}
                      onClick={() => send(s)}
                      className="block mx-auto text-xs text-violet-700 dark:text-violet-300 bg-violet-50 dark:bg-violet-900/30 border border-violet-200 dark:border-violet-800 rounded-full px-3 py-1.5 hover:bg-violet-100 transition-colors"
                      data-testid={`ai-suggestion-${i}`}
                    >
                      {s}
                    </button>
                  ))}
                </div>
              </div>
            )}
            {messages.map((m, i) => (
              <div key={i} className={`flex ${m.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                <div
                  className={m.role === 'user'
                    ? 'max-w-[85%] rounded-2xl rounded-br-sm bg-violet-600 text-white px-3 py-2 text-sm whitespace-pre-wrap'
                    : 'max-w-[90%] rounded-2xl rounded-bl-sm bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 px-3 py-2 text-sm prose prose-sm dark:prose-invert prose-p:my-1 prose-ul:my-1 prose-li:my-0.5 max-w-none'}
                  data-testid={`ai-msg-${m.role}-${i}`}
                >
                  {m.role === 'user' ? m.content : (
                    m.content
                      ? <ReactMarkdown>{m.content}</ReactMarkdown>
                      : (
                        <span className="flex items-center gap-2 text-slate-500">
                          <Loader2 className="h-4 w-4 animate-spin text-violet-500" />
                          {m.status && <span className="text-xs italic" data-testid="ai-status-text">{m.status}</span>}
                        </span>
                      )
                  )}
                </div>
              </div>
            ))}
            <div ref={bottomRef} />
          </div>

          {/* Input */}
          <div className="p-2.5 border-t bg-white dark:bg-slate-900 flex items-end gap-2">
            <textarea
              value={input}
              onChange={e => setInput(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(); } }}
              rows={1}
              placeholder="Ask about stock, sales, leads…"
              className="flex-1 resize-none rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-violet-400"
              data-testid="ai-chat-input"
            />
            <Button
              size="icon"
              className="h-9 w-9 rounded-xl bg-violet-600 hover:bg-violet-700 flex-shrink-0"
              onClick={() => send()}
              disabled={streaming || !input.trim()}
              data-testid="ai-chat-send"
            >
              {streaming ? <Loader2 className="h-4 w-4 animate-spin" /> : <SendHorizonal className="h-4 w-4" />}
            </Button>
          </div>
        </div>
      )}
    </>
  );
}
