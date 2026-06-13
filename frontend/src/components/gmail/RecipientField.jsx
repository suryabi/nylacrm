import React, { useEffect, useState, useRef, useCallback } from 'react';
import axios from 'axios';
import { X, User } from 'lucide-react';

const API_URL = process.env.REACT_APP_BACKEND_URL + '/api';
const authHeaders = () => ({ Authorization: `Bearer ${localStorage.getItem('token')}` });

// Module-level cache so the internal-user list is fetched once per session.
let _usersCache = null;
async function getInternalUsers() {
  if (_usersCache) return _usersCache;
  try {
    const res = await axios.get(`${API_URL}/users`, { headers: authHeaders(), params: { limit: 500 } });
    _usersCache = (res.data || [])
      .filter((u) => u.email)
      .map((u) => ({ name: u.name || u.email, email: u.email, designation: u.designation || u.role || '' }));
  } catch {
    _usersCache = [];
  }
  return _usersCache;
}

const splitEmails = (str) => (str || '').split(',').map((s) => s.trim()).filter(Boolean);

/**
 * Gmail-style recipient field with chips + internal-user autocomplete.
 * value is a comma-separated string (kept for backend compatibility).
 */
export default function RecipientField({ value, onChange, placeholder = 'To', testid }) {
  const [users, setUsers] = useState([]);
  const [text, setText] = useState('');
  const [open, setOpen] = useState(false);
  const [activeIdx, setActiveIdx] = useState(0);
  const inputRef = useRef(null);
  const emails = splitEmails(value);

  useEffect(() => { getInternalUsers().then(setUsers); }, []);

  const suggestions = useCallback(() => {
    const q = text.trim().toLowerCase();
    if (!q) return [];
    return users
      .filter((u) => !emails.includes(u.email))
      .filter((u) => u.name.toLowerCase().includes(q) || u.email.toLowerCase().includes(q))
      .slice(0, 6);
  }, [text, users, emails])();

  const commit = (email) => {
    const e = email.trim().replace(/,$/, '');
    if (!e) return;
    if (!emails.includes(e)) onChange([...emails, e].join(', '));
    setText('');
    setOpen(false);
    setActiveIdx(0);
    inputRef.current?.focus();
  };

  const removeChip = (email) => onChange(emails.filter((x) => x !== email).join(', '));

  const onKeyDown = (e) => {
    if ((e.key === 'Enter' || e.key === ',' || e.key === ' ') && text.trim()) {
      if (open && suggestions.length) { e.preventDefault(); commit(suggestions[activeIdx].email); }
      else if (e.key !== ' ') { e.preventDefault(); commit(text); }
    } else if (e.key === 'Backspace' && !text && emails.length) {
      removeChip(emails[emails.length - 1]);
    } else if (e.key === 'ArrowDown' && suggestions.length) {
      e.preventDefault(); setActiveIdx((i) => Math.min(i + 1, suggestions.length - 1));
    } else if (e.key === 'ArrowUp' && suggestions.length) {
      e.preventDefault(); setActiveIdx((i) => Math.max(i - 1, 0));
    }
  };

  return (
    <div className="relative">
      <div className="flex flex-wrap items-center gap-1.5 min-h-[40px] rounded-md border border-input bg-background px-2.5 py-1.5 text-sm focus-within:ring-2 focus-within:ring-ring focus-within:ring-offset-0" data-testid={testid}>
        {emails.map((e) => (
          <span key={e} className="inline-flex items-center gap-1 rounded-full bg-slate-100 px-2 py-0.5 text-xs text-slate-700" data-testid={`${testid}-chip-${e}`}>
            {(users.find((u) => u.email === e)?.name) || e}
            <button type="button" onClick={() => removeChip(e)} className="text-slate-400 hover:text-rose-600"><X className="h-3 w-3" /></button>
          </span>
        ))}
        <input
          ref={inputRef}
          value={text}
          onChange={(e) => { setText(e.target.value); setOpen(true); setActiveIdx(0); }}
          onKeyDown={onKeyDown}
          onFocus={() => text && setOpen(true)}
          onBlur={() => { setTimeout(() => setOpen(false), 150); if (text.trim() && text.includes('@')) commit(text); }}
          placeholder={emails.length ? '' : placeholder}
          className="flex-1 min-w-[120px] bg-transparent outline-none border-0 p-0 text-sm"
          data-testid={testid ? `${testid}-input` : undefined}
        />
      </div>

      {open && suggestions.length > 0 && (
        <ul className="absolute z-50 mt-1 w-full max-h-56 overflow-y-auto rounded-md border border-slate-200 bg-white shadow-lg" data-testid={`${testid}-suggestions`}>
          {suggestions.map((u, i) => (
            <li key={u.email}>
              <button
                type="button"
                onMouseDown={(e) => { e.preventDefault(); commit(u.email); }}
                className={`w-full text-left px-3 py-2 flex items-center gap-2 hover:bg-slate-50 ${i === activeIdx ? 'bg-slate-50' : ''}`}
                data-testid={`${testid}-suggestion-${u.email}`}
              >
                <span className="h-7 w-7 rounded-full bg-rose-100 text-rose-600 flex items-center justify-center text-xs font-semibold shrink-0">
                  {(u.name || '?')[0]?.toUpperCase()}
                </span>
                <span className="min-w-0">
                  <span className="block text-sm text-slate-800 truncate">{u.name}{u.designation ? ` · ${u.designation}` : ''}</span>
                  <span className="block text-xs text-slate-400 truncate">{u.email}</span>
                </span>
                <User className="h-3.5 w-3.5 text-slate-300 ml-auto shrink-0" />
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
