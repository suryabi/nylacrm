import React, { useState, useEffect, useCallback } from 'react';
import { marketingAPI } from '../utils/api';
import { toast } from 'sonner';
import { MessageCircle, Send, Trash2, Loader2 } from 'lucide-react';

const getInitials = (name) => {
  if (!name) return '?';
  const parts = name.trim().split(' ').filter(Boolean);
  if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase();
  return name.slice(0, 2).toUpperCase();
};

const timeAgo = (isoStr) => {
  if (!isoStr) return '';
  const diff = Date.now() - new Date(isoStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  if (days < 30) return `${days}d ago`;
  return new Date(isoStr).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' });
};

export default function CommentThread({ entityType, entityId, accentColor = 'violet' }) {
  const [comments, setComments] = useState([]);
  const [loading, setLoading] = useState(false);
  const [newComment, setNewComment] = useState('');
  const [posting, setPosting] = useState(false);
  const currentUserId = localStorage.getItem('user_id');

  const colorMap = {
    violet: { bg: 'bg-violet-50', border: 'border-violet-200/60', accent: 'bg-violet-600 hover:bg-violet-700', avatarBg: 'bg-violet-100', avatarText: 'text-violet-700', label: 'text-violet-600' },
    blue: { bg: 'bg-blue-50', border: 'border-blue-200/60', accent: 'bg-blue-600 hover:bg-blue-700', avatarBg: 'bg-blue-100', avatarText: 'text-blue-700', label: 'text-blue-600' },
  };
  const c = colorMap[accentColor] || colorMap.violet;

  const fetchComments = useCallback(async () => {
    if (!entityId) return;
    setLoading(true);
    try {
      const { data } = await marketingAPI.getComments(entityType, entityId);
      setComments(data);
    } catch { /* silently fail on initial load */ }
    finally { setLoading(false); }
  }, [entityType, entityId]);

  useEffect(() => { fetchComments(); }, [fetchComments]);

  const handlePost = async () => {
    if (!newComment.trim()) return;
    setPosting(true);
    try {
      await marketingAPI.addComment(entityType, entityId, newComment.trim());
      setNewComment('');
      fetchComments();
    } catch {
      toast.error('Failed to post comment');
    } finally { setPosting(false); }
  };

  const handleDelete = async (commentId) => {
    try {
      await marketingAPI.deleteComment(commentId);
      setComments(prev => prev.filter(c => c.id !== commentId));
    } catch {
      toast.error('Failed to delete comment');
    }
  };

  if (!entityId) return null;

  return (
    <div className={`${c.bg} rounded-xl border ${c.border} p-4`} data-testid="comment-thread">
      <label className={`text-[11px] font-medium uppercase tracking-wider ${c.label} mb-3 block flex items-center gap-1.5`}>
        <MessageCircle size={12} /> Comments {comments.length > 0 && `(${comments.length})`}
      </label>

      {/* Comment list */}
      <div className="space-y-3 mb-3 max-h-64 overflow-y-auto">
        {loading && comments.length === 0 ? (
          <div className="flex items-center justify-center py-4"><Loader2 className="h-4 w-4 animate-spin text-slate-400" /></div>
        ) : comments.length === 0 ? (
          <p className="text-xs text-slate-400 text-center py-2">No comments yet. Start the conversation.</p>
        ) : comments.map(comment => (
          <div key={comment.id} className="bg-white rounded-lg border border-slate-200 p-3 group" data-testid={`comment-${comment.id}`}>
            <div className="flex items-start gap-2.5">
              <div className={`w-7 h-7 rounded-full ${c.avatarBg} flex items-center justify-center text-[10px] font-semibold ${c.avatarText} shrink-0 mt-0.5`}>
                {getInitials(comment.created_by_name)}
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-semibold text-slate-800">{comment.created_by_name}</span>
                    <span className="text-[10px] text-slate-400">{timeAgo(comment.created_at)}</span>
                  </div>
                  {comment.created_by === currentUserId && (
                    <button onClick={() => handleDelete(comment.id)}
                      className="opacity-0 group-hover:opacity-100 transition-opacity p-1 hover:bg-red-50 rounded"
                      data-testid={`delete-comment-${comment.id}`}>
                      <Trash2 size={11} className="text-slate-400 hover:text-red-500" />
                    </button>
                  )}
                </div>
                <p className="text-sm text-slate-700 mt-0.5 whitespace-pre-wrap break-words">{comment.content}</p>
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* New comment input */}
      <div className="flex gap-2">
        <input
          value={newComment}
          onChange={e => setNewComment(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && !e.shiftKey && handlePost()}
          placeholder="Write a comment..."
          className="flex-1 border border-slate-200 rounded-lg px-3 py-2 text-sm bg-white focus:ring-2 focus:ring-violet-500/20 focus:border-violet-400 outline-none"
          data-testid="comment-input"
        />
        <button
          onClick={handlePost}
          disabled={posting || !newComment.trim()}
          className={`px-3 py-2 ${c.accent} text-white rounded-lg text-xs font-medium flex items-center gap-1 disabled:opacity-50 transition-colors`}
          data-testid="post-comment-btn"
        >
          {posting ? <Loader2 size={12} className="animate-spin" /> : <Send size={12} />}
        </button>
      </div>
    </div>
  );
}
