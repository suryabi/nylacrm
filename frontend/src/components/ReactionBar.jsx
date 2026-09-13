/**
 * ReactionBar — professional emoji reactions (👍 👎 ❤️) for comments & activity
 * log entries. Toggles via POST /api/reactions/toggle.
 */
import React, { useEffect, useState } from 'react';
import axios from 'axios';
import { toast } from 'sonner';
import { useAuth } from '../context/AuthContext';

const API_URL = process.env.REACT_APP_BACKEND_URL + '/api';
const auth = () => ({ Authorization: `Bearer ${localStorage.getItem('token') || localStorage.getItem('token')}` });

const EMOJIS = ['👍', '👎', '❤️'];

export default function ReactionBar({ entityType, entityId, reactions: initial, className = '' }) {
  const { user } = useAuth();
  const [reactions, setReactions] = useState(initial || {});
  const [busy, setBusy] = useState(false);

  useEffect(() => { setReactions(initial || {}); }, [entityId]); // eslint-disable-line react-hooks/exhaustive-deps

  const toggle = async (emoji) => {
    if (busy) return;
    setBusy(true);
    try {
      const { data } = await axios.post(`${API_URL}/reactions/toggle`,
        { entity_type: entityType, entity_id: entityId, emoji }, { headers: auth() });
      setReactions(data.reactions || {});
    } catch (e) {
      toast.error(e.response?.data?.detail || 'Could not react');
    } finally { setBusy(false); }
  };

  return (
    <div className={`flex items-center gap-1 ${className}`} data-testid={`reaction-bar-${entityId}`}>
      {EMOJIS.map((e) => {
        const users = reactions[e] || [];
        const count = users.length;
        const mine = users.some((u) => u.user_id === user?.id);
        return (
          <button
            key={e}
            type="button"
            onClick={() => toggle(e)}
            title={count ? users.map((u) => u.user_name).join(', ') : `React with ${e}`}
            data-testid={`reaction-${e === '👍' ? 'up' : e === '👎' ? 'down' : 'love'}-${entityId}`}
            className={`inline-flex items-center gap-1 rounded-full border px-1.5 py-0.5 text-xs leading-none transition-all
              ${mine
                ? 'border-emerald-300 bg-emerald-50 text-emerald-800'
                : count
                  ? 'border-slate-200 bg-slate-50 text-slate-600 hover:border-slate-300'
                  : 'border-transparent text-slate-400 opacity-40 hover:opacity-100 hover:border-slate-200 grayscale hover:grayscale-0'}`}
          >
            <span className="text-[13px]">{e}</span>
            {count > 0 && <span className="font-semibold tabular-nums">{count}</span>}
          </button>
        );
      })}
    </div>
  );
}
