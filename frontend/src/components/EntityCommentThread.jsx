/**
 * EntityCommentThread — a self-contained discussion thread with @-mention
 * support and edit/delete (author or CEO/Admin), reusable across any entity:
 *   GET    {basePath}                -> [{id, text, created_by, created_by_name, created_at, edited_at?}]
 *   POST   {basePath}                body {text}
 *   PUT    {basePath}/{commentId}    body {text}
 *   DELETE {basePath}/{commentId}
 *
 * Usage:
 *   <EntityCommentThread basePath={`/accounts/${id}/comments`} testid="account-comments" />
 */
import React, { useEffect, useState, useCallback } from 'react';
import axios from 'axios';
import { toast } from 'sonner';
import { Button } from './ui/button';
import { Send, Loader2, MessageSquare, Pencil, Trash2, Check, X } from 'lucide-react';
import { SectionHeader } from './detail/SectionHeader';
import MentionTextarea, { renderMentionedText } from './MentionTextarea';
import ReactionBar from './ReactionBar';
import { useAuth } from '../context/AuthContext';

const API_URL = process.env.REACT_APP_BACKEND_URL + '/api';
const auth = () => ({ Authorization: `Bearer ${localStorage.getItem('token') || localStorage.getItem('token')}` });

const MOD_ROLES = ['CEO', 'Admin', 'System Admin'];
const getInitials = (name) => (name || '?').split(/\s+/).slice(0, 2).map((s) => s[0]).join('').toUpperCase();
const fmt = (ts) => { try { return new Date(ts).toLocaleString('en-US', { month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit' }); } catch { return ''; } };

export default function EntityCommentThread({ basePath, title = 'Discussion', testid = 'entity-comments' }) {
  const { user } = useAuth();
  const [comments, setComments] = useState([]);
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);
  const [editingId, setEditingId] = useState(null);
  const [editText, setEditText] = useState('');

  const canModify = (c) => c.created_by === user?.id || MOD_ROLES.includes(user?.role);

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

  const saveEdit = async (c) => {
    if (!editText.trim()) return;
    setBusy(true);
    try {
      const { data } = await axios.put(`${API_URL}${basePath}/${c.id}`, { text: editText.trim() }, { headers: auth() });
      setComments((prev) => prev.map((x) => (x.id === c.id ? { ...x, ...data } : x)));
      setEditingId(null); setEditText('');
      toast.success('Comment updated');
    } catch (e) {
      toast.error(e.response?.data?.detail || 'Failed to update comment');
    } finally {
      setBusy(false);
    }
  };

  const remove = async (c) => {
    if (!window.confirm('Delete this comment? This cannot be undone.')) return;
    setBusy(true);
    try {
      await axios.delete(`${API_URL}${basePath}/${c.id}`, { headers: auth() });
      setComments((prev) => prev.filter((x) => x.id !== c.id));
      toast.success('Comment deleted');
    } catch (e) {
      toast.error(e.response?.data?.detail || 'Failed to delete comment');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="border border-slate-200 rounded-xl p-5 bg-white" data-testid={testid}>
      <SectionHeader
        eyebrow="Collaboration"
        title={title}
        icon={MessageSquare}
        testid="header-comment-thread"
        actions={<span className="text-xs font-normal text-slate-400">({comments.length})</span>}
      />

      <div className="space-y-3 mb-4">
        {loading ? (
          <p className="text-sm text-slate-400 italic py-2">Loading…</p>
        ) : comments.length === 0 ? (
          <p className="text-sm text-slate-400 italic py-2 text-center">No comments yet — start the discussion.</p>
        ) : (
          comments.map((c) => (
            <div key={c.id} className="flex gap-3 group" data-testid={`${testid}-item-${c.id}`}>
              <div className="w-7 h-7 rounded-full bg-emerald-100 flex items-center justify-center text-[10px] font-semibold text-emerald-700 shrink-0">
                {getInitials(c.created_by_name)}
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="font-medium text-sm text-slate-900">{c.created_by_name}</span>
                  <span className="text-[11px] text-slate-400">{fmt(c.created_at)}</span>
                  {c.edited_at && <span className="text-[11px] text-slate-400 italic">(edited)</span>}
                  {canModify(c) && editingId !== c.id && (
                    <span className="ml-auto flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                      <button type="button" onClick={() => { setEditingId(c.id); setEditText(c.text); }}
                        className="p-1 rounded hover:bg-slate-100 text-slate-400 hover:text-slate-700 transition-colors"
                        data-testid={`${testid}-edit-${c.id}`} aria-label="Edit comment">
                        <Pencil className="h-3.5 w-3.5" />
                      </button>
                      <button type="button" onClick={() => remove(c)}
                        className="p-1 rounded hover:bg-red-50 text-slate-400 hover:text-red-600 transition-colors"
                        data-testid={`${testid}-delete-${c.id}`} aria-label="Delete comment">
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </span>
                  )}
                </div>
                {editingId === c.id ? (
                  <div className="mt-1.5 space-y-2">
                    <MentionTextarea value={editText} onChange={setEditText} rows={2} testid={`${testid}-edit-input`} />
                    <div className="flex gap-2">
                      <Button size="sm" onClick={() => saveEdit(c)} disabled={busy || !editText.trim()}
                        className="bg-emerald-600 hover:bg-emerald-700 h-7 px-2.5" data-testid={`${testid}-edit-save`}>
                        <Check className="h-3.5 w-3.5 mr-1" />Save
                      </Button>
                      <Button size="sm" variant="ghost" onClick={() => { setEditingId(null); setEditText(''); }}
                        className="h-7 px-2.5" data-testid={`${testid}-edit-cancel`}>
                        <X className="h-3.5 w-3.5 mr-1" />Cancel
                      </Button>
                    </div>
                  </div>
                ) : (
                  <>
                    <p className="text-sm text-slate-700 mt-0.5 whitespace-pre-wrap break-words">{renderMentionedText(c.text)}</p>
                    <ReactionBar
                      entityType={basePath.includes('/meeting-minutes/') ? 'meeting_comment' : 'account_comment'}
                      entityId={c.id}
                      reactions={c.reactions}
                      className="mt-1"
                    />
                  </>
                )}
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
