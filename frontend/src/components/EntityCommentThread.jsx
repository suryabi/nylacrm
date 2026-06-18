/**
 * EntityCommentThread — a self-contained discussion thread with @-mention
 * support, reusable across any entity that exposes:
 *   GET  {basePath}  -> [{id, text, created_by_name, created_at}]
 *   POST {basePath}  body {text}
 *
 * Usage:
 *   <EntityCommentThread basePath={`/accounts/${id}/comments`} testid="account-comments" />
 */
import React, { useEffect, useState, useCallback } from 'react';
import axios from 'axios';
import { toast } from 'sonner';
import { Button } from './ui/button';
import { Send, Loader2, MessageSquare } from 'lucide-react';
import MentionTextarea, { renderMentionedText } from './MentionTextarea';

const API_URL = process.env.REACT_APP_BACKEND_URL + '/api';
const auth = () => ({ Authorization: `Bearer ${localStorage.getItem('token') || localStorage.getItem('session_token')}` });

const getInitials = (name) => (name || '?').split(/\s+/).slice(0, 2).map((s) => s[0]).join('').toUpperCase();
const fmt = (ts) => { try { return new Date(ts).toLocaleString('en-US', { month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit' }); } catch { return ''; } };

export default function EntityCommentThread({ basePath, title = 'Discussion', testid = 'entity-comments' }) {
  const [comments, setComments] = useState([]);
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    try {
      const r = await axios.get(`${API_URL}${basePath}`, { headers: auth() });
      setComments(Array.isArray(r.data) ? r.data : []);
    } catch {
      setComments([]);
    } finally {
      setLoading(false);
    }
  }, [basePath]);

  useEffect(() => { load(); }, [load]);

  const submit = async () => {
    if (!text.trim()) return;
    setBusy(true);
    try {
      await axios.post(`${API_URL}${basePath}`, { text: text.trim() }, { headers: auth() });
      setText('');
      await load();
      toast.success('Comment added');
    } catch (e) {
      toast.error(e.response?.data?.detail || 'Failed to add comment');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="border border-slate-200 rounded-xl p-5 bg-white" data-testid={testid}>
      <div className="flex items-center gap-2 mb-4">
        <MessageSquare size={16} className="text-emerald-600" />
        <h2 className="text-sm font-semibold text-slate-800">{title}</h2>
        <span className="text-xs font-normal text-slate-400">({comments.length})</span>
      </div>

      <div className="space-y-3 mb-4">
        {loading ? (
          <p className="text-sm text-slate-400 italic py-2">Loading…</p>
        ) : comments.length === 0 ? (
          <p className="text-sm text-slate-400 italic py-2 text-center">No comments yet — start the discussion.</p>
        ) : (
          comments.map((c) => (
            <div key={c.id} className="flex gap-3" data-testid={`${testid}-item-${c.id}`}>
              <div className="w-7 h-7 rounded-full bg-emerald-100 flex items-center justify-center text-[10px] font-semibold text-emerald-700 shrink-0">
                {getInitials(c.created_by_name)}
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="font-medium text-sm text-slate-900">{c.created_by_name}</span>
                  <span className="text-[11px] text-slate-400">{fmt(c.created_at)}</span>
                </div>
                <p className="text-sm text-slate-700 mt-0.5 whitespace-pre-wrap break-words">{renderMentionedText(c.text)}</p>
              </div>
            </div>
          ))
        )}
      </div>

      <div className="flex gap-2 pt-3 border-t border-slate-100">
        <div className="flex-1">
          <MentionTextarea
            value={text}
            onChange={setText}
            placeholder="Add a comment… (type @ to mention a teammate)"
            rows={2}
            testid={`${testid}-input`}
          />
        </div>
        <Button
          onClick={submit}
          size="sm"
          disabled={busy || !text.trim()}
          className="bg-emerald-600 hover:bg-emerald-700 self-start"
          data-testid={`${testid}-send`}
        >
          {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
        </Button>
      </div>
    </div>
  );
}
