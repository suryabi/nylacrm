import React, { useState, useRef, useEffect } from 'react';
import axios from 'axios';
import { useAuth } from '../../context/AuthContext';
import { Button } from '../ui/button';
import { Textarea } from '../ui/textarea';
import { ScrollArea } from '../ui/scroll-area';
import { toast } from 'sonner';
import {
  Sparkles, X, Send, Loader2, ThumbsUp, ThumbsDown, BookOpen, RefreshCw, ChevronLeft, ChevronRight,
} from 'lucide-react';

const API = process.env.REACT_APP_BACKEND_URL + '/api';

const NYLA_GREETING = `Hi! I'm Nyla, your AI sales assistant. Ask me anything about our products, pricing, processes, or playbooks — I'll answer using our company's knowledge base with citations.`;

const SUGGESTED_QUESTIONS = [
  'What is our pricing for hospitality clients?',
  'How do I handle objections about water purity?',
  'What is our product warranty policy?',
];

export default function AskNyla() {
  const { user } = useAuth();
  const [isOpen, setIsOpen] = useState(false);
  const [messages, setMessages] = useState([]); // {role, content, id?, citations?}
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [sessionId, setSessionId] = useState(null);
  const [feedback, setFeedback] = useState({}); // {message_id: 'up'|'down'}
  const scrollRef = useRef(null);

  // Auto-scroll on new messages
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages, loading]);

  const sendQuestion = async (questionOverride) => {
    const q = (questionOverride || input || '').trim();
    if (!q || loading) return;
    setInput('');
    const newMessages = [...messages, { role: 'user', content: q }];
    setMessages(newMessages);
    setLoading(true);
    try {
      const history = newMessages.slice(0, -1).filter(m => m.role === 'user' || m.role === 'assistant').map(m => ({
        role: m.role, content: m.content,
      }));
      const res = await axios.post(`${API}/kb/ask`, {
        question: q,
        session_id: sessionId,
        history,
      }, { withCredentials: true });
      const { id, session_id, answer, citations } = res.data || {};
      if (session_id) setSessionId(session_id);
      setMessages(prev => [...prev, {
        role: 'assistant', content: answer || '(empty response)', id, citations: citations || [],
      }]);
    } catch (e) {
      const msg = e?.response?.data?.detail || 'Could not reach Nyla. Please try again.';
      setMessages(prev => [...prev, { role: 'assistant', content: msg, error: true }]);
    } finally {
      setLoading(false);
    }
  };

  const submitFeedback = async (messageId, rating) => {
    if (!messageId) return;
    setFeedback(f => ({ ...f, [messageId]: rating }));
    try {
      await axios.post(`${API}/kb/feedback`, { message_id: messageId, rating }, { withCredentials: true });
      toast.success(rating === 'up' ? 'Thanks for the feedback!' : 'Got it — we\'ll work on better answers.');
    } catch (e) {
      // Silent fail; UI already reflects optimistic update
    }
  };

  const resetChat = () => {
    setMessages([]);
    setSessionId(null);
    setFeedback({});
  };

  if (!user) return null;

  const PANEL_WIDTH = 440; // px

  return (
    <>
      {/* Vertical trigger tab on right edge — slides left when panel is open */}
      <button
        onClick={() => setIsOpen(!isOpen)}
        className={`fixed top-1/2 -translate-y-1/2 z-50 h-32 w-8 bg-gradient-to-b from-violet-600 via-fuchsia-500 to-pink-500 text-white rounded-l-lg shadow-lg hover:shadow-xl hover:shadow-violet-300/50 transition-all duration-300 flex flex-col items-center justify-center gap-1 ring-1 ring-white/20`}
        style={{ right: isOpen ? `${PANEL_WIDTH}px` : 0 }}
        data-testid="ask-nyla-button"
        title={isOpen ? 'Close Ask Nyla' : 'Open Ask Nyla'}
      >
        {isOpen ? (
          <ChevronRight className="w-4 h-4" />
        ) : (
          <>
            <ChevronLeft className="w-4 h-4" />
            <Sparkles className="w-4 h-4" />
            <span className="writing-mode-vertical text-[10px] font-bold tracking-wider" style={{ writingMode: 'vertical-rl', transform: 'rotate(180deg)' }}>
              ASK NYLA
            </span>
          </>
        )}
      </button>

      {/* Side panel — slides in from right */}
      <div
        className={`fixed top-0 right-0 h-full bg-white dark:bg-slate-900 shadow-2xl z-40 flex flex-col transform transition-transform duration-300 ease-in-out border-l border-slate-200 dark:border-slate-700 ${
          isOpen ? 'translate-x-0' : 'translate-x-full'
        }`}
        style={{ width: `${PANEL_WIDTH}px` }}
        data-testid="ask-nyla-panel"
      >
        {/* Header */}
        <div className="relative flex items-center justify-between p-4 bg-gradient-to-br from-violet-600 via-fuchsia-500 to-pink-500 text-white shrink-0">
          <div className="flex items-center gap-2.5 min-w-0">
            <div className="relative h-9 w-9 rounded-full bg-white/20 backdrop-blur-sm flex items-center justify-center shrink-0">
              <Sparkles className="h-4 w-4" />
              <span className="absolute -top-0.5 -right-0.5 h-2 w-2 rounded-full bg-emerald-400 ring-2 ring-white" />
            </div>
            <div className="min-w-0">
              <div className="text-sm font-bold leading-tight">Nyla</div>
              <div className="text-[11px] text-white/80 leading-tight truncate">AI sales assistant · grounded in your KB</div>
            </div>
          </div>
          <div className="flex items-center gap-1">
            {messages.length > 0 && (
              <button
                onClick={resetChat}
                className="p-1.5 rounded-md hover:bg-white/10 transition-colors"
                title="Start new chat"
                data-testid="ask-nyla-reset"
              >
                <RefreshCw className="h-4 w-4" />
              </button>
            )}
            <button
              onClick={() => setIsOpen(false)}
              className="p-1.5 rounded-md hover:bg-white/10 transition-colors"
              data-testid="ask-nyla-close"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>

        {/* Messages area */}
        <div ref={scrollRef} className="flex-1 overflow-y-auto p-4 space-y-3 bg-slate-50/50 dark:bg-slate-900/60" data-testid="ask-nyla-messages">
          {messages.length === 0 && (
            <div className="space-y-3">
              <div className="text-sm text-slate-700 dark:text-slate-300 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl rounded-tl-sm px-3.5 py-2.5">
                {NYLA_GREETING}
              </div>
              <div className="space-y-1.5">
                <p className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider">Try asking</p>
                {SUGGESTED_QUESTIONS.map((q, i) => (
                  <button
                    key={i}
                    onClick={() => sendQuestion(q)}
                    className="block w-full text-left text-xs text-violet-700 dark:text-violet-300 bg-violet-50 dark:bg-violet-900/30 hover:bg-violet-100 dark:hover:bg-violet-900/50 border border-violet-200 dark:border-violet-800 rounded-lg px-3 py-2 transition-colors"
                    data-testid={`ask-nyla-suggestion-${i}`}
                  >
                    {q}
                  </button>
                ))}
              </div>
            </div>
          )}

          {messages.map((m, idx) => (
            <div key={idx} className={`flex ${m.role === 'user' ? 'justify-end' : 'justify-start'}`}>
              <div className={`max-w-[88%] rounded-xl px-3.5 py-2.5 text-sm whitespace-pre-wrap ${
                m.role === 'user'
                  ? 'bg-violet-600 text-white rounded-tr-sm'
                  : m.error
                    ? 'bg-rose-50 dark:bg-rose-900/30 text-rose-800 dark:text-rose-200 border border-rose-200 dark:border-rose-800 rounded-tl-sm'
                    : 'bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 border border-slate-200 dark:border-slate-700 rounded-tl-sm shadow-sm'
              }`}>
                <div className="leading-relaxed">{m.content}</div>
                {m.role === 'assistant' && m.citations && m.citations.length > 0 && (
                  <div className="mt-2 pt-2 border-t border-slate-100 dark:border-slate-700 space-y-1">
                    <div className="text-[10px] font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider flex items-center gap-1">
                      <BookOpen className="h-3 w-3" /> Sources
                    </div>
                    <div className="flex flex-wrap gap-1">
                      {m.citations.map(c => (
                        <span key={c.id} className="inline-flex items-center gap-1 text-[10px] font-medium text-slate-700 dark:text-slate-300 bg-slate-100 dark:bg-slate-700/50 px-1.5 py-0.5 rounded" title={c.title}>
                          [Doc {c.index}] <span className="truncate max-w-[140px]">{c.title}</span>
                        </span>
                      ))}
                    </div>
                  </div>
                )}
                {m.role === 'assistant' && !m.error && m.id && (
                  <div className="mt-1.5 flex items-center gap-1">
                    <button
                      onClick={() => submitFeedback(m.id, 'up')}
                      className={`p-1 rounded hover:bg-slate-100 dark:hover:bg-slate-700 transition-colors ${feedback[m.id] === 'up' ? 'text-emerald-600' : 'text-slate-400'}`}
                      title="Helpful"
                      data-testid={`ask-nyla-thumbs-up-${m.id}`}
                    >
                      <ThumbsUp className="h-3 w-3" />
                    </button>
                    <button
                      onClick={() => submitFeedback(m.id, 'down')}
                      className={`p-1 rounded hover:bg-slate-100 dark:hover:bg-slate-700 transition-colors ${feedback[m.id] === 'down' ? 'text-rose-600' : 'text-slate-400'}`}
                      title="Not helpful"
                      data-testid={`ask-nyla-thumbs-down-${m.id}`}
                    >
                      <ThumbsDown className="h-3 w-3" />
                    </button>
                  </div>
                )}
              </div>
            </div>
          ))}

          {loading && (
            <div className="flex justify-start">
              <div className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl rounded-tl-sm px-3.5 py-2.5">
                <div className="flex items-center gap-2 text-xs text-slate-500">
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  <span>Nyla is thinking...</span>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Input */}
        <div className="p-3 border-t border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 shrink-0">
          <div className="flex items-end gap-2">
            <Textarea
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault();
                  sendQuestion();
                }
              }}
              placeholder="Ask Nyla anything..."
              rows={1}
              className="min-h-[40px] max-h-[120px] resize-none text-sm"
              data-testid="ask-nyla-input"
            />
            <Button
              onClick={() => sendQuestion()}
              disabled={!input.trim() || loading}
              className="h-10 w-10 p-0 bg-gradient-to-br from-violet-600 to-fuchsia-500 hover:from-violet-700 hover:to-fuchsia-600 text-white shrink-0"
              data-testid="ask-nyla-send"
            >
              {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
            </Button>
          </div>
          <p className="text-[10px] text-slate-400 mt-1.5">Press Enter to send · Shift+Enter for new line</p>
        </div>
      </div>
    </>
  );
}
