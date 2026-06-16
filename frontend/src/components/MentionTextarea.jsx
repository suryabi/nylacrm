/**
 * MentionTextarea — drop-in replacement for <textarea> with @-mention
 * autocomplete. Stores mentions inline as `@[Display Name](user-id)` so the
 * server-side helper can pluck out the ids and notify.
 *
 * Usage:
 *   <MentionTextarea
 *     value={body}
 *     onChange={setBody}
 *     placeholder="Add a comment…"
 *     entityType="lead"     // optional — narrows the autocomplete to teammates
 *     entityId={leadId}
 *     testid="lead-comment"
 *   />
 */
import React, { useEffect, useRef, useState, useCallback } from 'react';
import axios from 'axios';

const API_URL = process.env.REACT_APP_BACKEND_URL + '/api';
const auth = () => ({ Authorization: `Bearer ${localStorage.getItem('token') || localStorage.getItem('session_token')}` });

const CHIP_RE = /@\[([^\]]+)\]\(([A-Za-z0-9_-]+)\)/g;

// Render saved mention chips as visible @pills (used inline in comment lists).
export function renderMentionedText(text) {
  if (!text) return null;
  const out = [];
  let last = 0;
  text.replace(CHIP_RE, (match, name, id, offset) => {
    if (offset > last) out.push(text.slice(last, offset));
    out.push(
      <span key={offset} className="inline-flex items-center bg-rose-50 text-rose-700 border border-rose-200 rounded-full px-1.5 text-[12px] font-medium mx-0.5">
        @{name}
      </span>,
    );
    last = offset + match.length;
    return match;
  });
  if (last < text.length) out.push(text.slice(last));
  return out;
}

export default function MentionTextarea({
  value = '',
  onChange,
  placeholder = '',
  rows = 3,
  className = '',
  disabled = false,
  testid = 'mention-textarea',
}) {
  const textareaRef = useRef(null);
  const [users, setUsers] = useState([]);    // cache of all active users
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [caretStart, setCaretStart] = useState(0); // index of the '@' that triggered the popup
  const [highlight, setHighlight] = useState(0);

  // One-shot load of teammates for the autocomplete. The user list is small
  // (sub-100 typically) so client-side filter is fine and snappier than a
  // per-keystroke request.
  useEffect(() => {
    axios.get(`${API_URL}/users?is_active=true`, { headers: auth() })
      .then((r) => setUsers(Array.isArray(r.data) ? r.data : (r.data?.data || [])))
      .catch(() => setUsers([]));
  }, []);

  const filtered = users
    .filter((u) => !query || (u.name || '').toLowerCase().includes(query.toLowerCase()))
    .slice(0, 8);

  const checkForTrigger = (text, caret) => {
    // Walk back from the caret looking for an @ not preceded by alphanum.
    // If found and no whitespace in between, we're in a mention context.
    for (let i = caret - 1; i >= 0; i -= 1) {
      const ch = text[i];
      if (ch === '@') {
        const prev = i === 0 ? ' ' : text[i - 1];
        if (/[\s\n>(]/.test(prev) || i === 0) {
          const q = text.slice(i + 1, caret);
          if (!/\s/.test(q)) return { at: i, q };
        }
        return null;
      }
      if (/\s/.test(ch)) return null;
    }
    return null;
  };

  const handleChange = (e) => {
    const text = e.target.value;
    onChange?.(text);
    const trig = checkForTrigger(text, e.target.selectionStart);
    if (trig) {
      setCaretStart(trig.at);
      setQuery(trig.q);
      setOpen(true);
      setHighlight(0);
    } else {
      setOpen(false);
    }
  };

  const insertMention = useCallback((user) => {
    const ta = textareaRef.current;
    if (!ta) return;
    const before = value.slice(0, caretStart);
    const after = value.slice(ta.selectionStart);
    const chip = `@[${user.name}](${user.id}) `;
    const next = before + chip + after;
    onChange?.(next);
    setOpen(false);
    // Restore the caret just past the chip on next paint.
    requestAnimationFrame(() => {
      const pos = before.length + chip.length;
      ta.focus();
      ta.setSelectionRange(pos, pos);
    });
  }, [caretStart, onChange, value]);

  const handleKeyDown = (e) => {
    if (!open || filtered.length === 0) return;
    if (e.key === 'ArrowDown') { e.preventDefault(); setHighlight((p) => (p + 1) % filtered.length); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setHighlight((p) => (p - 1 + filtered.length) % filtered.length); }
    else if (e.key === 'Enter' || e.key === 'Tab') {
      e.preventDefault();
      insertMention(filtered[highlight]);
    } else if (e.key === 'Escape') {
      setOpen(false);
    }
  };

  return (
    <div className="relative">
      <textarea
        ref={textareaRef}
        value={value}
        onChange={handleChange}
        onKeyDown={handleKeyDown}
        onBlur={() => setTimeout(() => setOpen(false), 150)}
        placeholder={placeholder}
        rows={rows}
        disabled={disabled}
        className={`w-full rounded-md border border-slate-200 bg-white p-2 text-sm focus:outline-none focus:ring-2 focus:ring-rose-200 ${className}`}
        data-testid={testid}
      />
      {open && filtered.length > 0 && (
        <div
          className="absolute z-30 mt-1 w-64 max-h-60 overflow-y-auto rounded-md border bg-white shadow-lg"
          data-testid={`${testid}-mention-list`}
        >
          {filtered.map((u, i) => (
            <button
              key={u.id}
              type="button"
              onMouseDown={(e) => { e.preventDefault(); insertMention(u); }}
              className={`w-full text-left px-3 py-2 text-sm flex items-center gap-2 ${i === highlight ? 'bg-rose-50' : 'hover:bg-slate-50'}`}
              data-testid={`${testid}-mention-option-${u.id}`}
            >
              <div className="h-6 w-6 rounded-full bg-rose-100 text-rose-700 flex items-center justify-center text-[10px] font-semibold shrink-0">
                {(u.name || '?').split(/\s+/).slice(0, 2).map((s) => s[0]).join('').toUpperCase()}
              </div>
              <div className="min-w-0 flex-1">
                <div className="font-medium truncate">{u.name}</div>
                <div className="text-[10px] text-slate-500 truncate">{u.role || u.email}</div>
              </div>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
