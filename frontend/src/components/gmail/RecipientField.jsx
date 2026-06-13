import React, { useEffect, useState, useRef } from 'react';
import axios from 'axios';
import { X, User, Contact as ContactIcon } from 'lucide-react';

const API_URL = process.env.REACT_APP_BACKEND_URL + '/api';
const authHeaders = () => ({ Authorization: `Bearer ${localStorage.getItem('token')}` });

const splitEmails = (str) => (str || '').split(',').map((s) => s.trim()).filter(Boolean);

/**
 * Gmail-style recipient field with chips + server-side autocomplete across
 * internal users AND CRM contacts. `value` is a comma-separated string.
 */
export default function RecipientField({ value, onChange, placeholder = 'To', testid }) {
  const [text, setText] = useState('');
  const [results, setResults] = useState([]);
  const [open, setOpen] = useState(false);
  const [activeIdx, setActiveIdx] = useState(0);
  const [labels, setLabels] = useState({}); // email -> display name
  const inputRef = useRef(null);
  const debounceRef = useRef(null);
  const emails = splitEmails(value);

  // Debounced server-side search across users + contacts
  useEffect(() => {
    const q = text.trim();
    if (debounceRef.current) clearTimeout(debounceRef.current);
    if (!q) { setResults([]); return; }
    debounceRef.current = setTimeout(async () => {
      try {
        const res = await axios.get(`${API_URL}/recipients/search`, { headers: authHeaders(), params: { q } });
        const filtered = (res.data.results || []).filter((r) => !emails.includes(r.email));
        setResults(filtered);
        setActiveIdx(0);
      } catch {
        setResults([]);
      }
    }, 220);
    return () => debounceRef.current && clearTimeout(debounceRef.current);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [text]);

  const commit = (rec) => {
    const e = (typeof rec === 'string' ? rec : rec.email).trim().replace(/,$/, '');
    if (!e) return;
    if (typeof rec !== 'string' && rec.name) setLabels((l) => ({ ...l, [e]: rec.name }));
    if (!emails.includes(e)) onChange([...emails, e].join(', '));
    setText('');
    setResults([]);
    setOpen(false);
    setActiveIdx(0);
    inputRef.current?.focus();
  };

  const removeChip = (email) => onChange(emails.filter((x) => x !== email).join(', '));

  const onKeyDown = (e) => {
    if ((e.key === 'Enter' || e.key === ',') && (open && results.length)) {
      e.preventDefault(); commit(results[activeIdx]);
    } else if (e.key === 'Enter' && text.trim().includes('@')) {
      e.preventDefault(); commit(text);
    } else if (e.key === 'Backspace' && !text && emails.length) {
      removeChip(emails[emails.length - 1]);
    } else if (e.key === 'ArrowDown' && results.length) {
      e.preventDefault(); setActiveIdx((i) => Math.min(i + 1, results.length - 1));
    } else if (e.key === 'ArrowUp' && results.length) {
      e.preventDefault(); setActiveIdx((i) => Math.max(i - 1, 0));
    }
  };

  return (
    <div className="relative">
      <div className="flex flex-wrap items-center gap-1.5 min-h-[40px] rounded-md border border-input bg-background px-2.5 py-1.5 text-sm focus-within:ring-2 focus-within:ring-ring" data-testid={testid}>
        {emails.map((e) => (
          <span key={e} className="inline-flex items-center gap-1 rounded-full bg-slate-100 px-2 py-0.5 text-xs text-slate-700" data-testid={`${testid}-chip-${e}`}>
            {labels[e] || e}
            <button type="button" onClick={() => removeChip(e)} className="text-slate-400 hover:text-rose-600"><X className="h-3 w-3" /></button>
          </span>
        ))}
        <input
          ref={inputRef}
          value={text}
          onChange={(e) => { setText(e.target.value); setOpen(true); }}
          onKeyDown={onKeyDown}
          onFocus={() => text && setOpen(true)}
          onBlur={() => { setTimeout(() => setOpen(false), 160); if (text.trim() && text.includes('@')) commit(text); }}
          placeholder={emails.length ? '' : placeholder}
          className="flex-1 min-w-[120px] bg-transparent outline-none border-0 p-0 text-sm"
          data-testid={testid ? `${testid}-input` : undefined}
        />
      </div>

      {open && results.length > 0 && (
        <ul className="absolute z-[60] mt-1 w-full max-h-60 overflow-y-auto rounded-md border border-slate-200 bg-white shadow-lg" data-testid={`${testid}-suggestions`}>
          {results.map((r, i) => (
            <li key={`${r.type}-${r.email}`}>
              <button
                type="button"
                onMouseDown={(e) => { e.preventDefault(); commit(r); }}
                className={`w-full text-left px-3 py-2 flex items-center gap-2 hover:bg-slate-50 ${i === activeIdx ? 'bg-slate-50' : ''}`}
                data-testid={`${testid}-suggestion-${r.email}`}
              >
                <span className={`h-7 w-7 rounded-full flex items-center justify-center text-xs font-semibold shrink-0 ${r.type === 'user' ? 'bg-rose-100 text-rose-600' : 'bg-sky-100 text-sky-600'}`}>
                  {(r.name || '?')[0]?.toUpperCase()}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block text-sm text-slate-800 truncate">{r.name}</span>
                  <span className="block text-xs text-slate-400 truncate">{r.subtitle} · {r.email}</span>
                </span>
                <span className={`text-[10px] px-1.5 py-0.5 rounded-full shrink-0 ${r.type === 'user' ? 'bg-rose-50 text-rose-600' : 'bg-sky-50 text-sky-600'}`}>
                  {r.type === 'user' ? <span className="inline-flex items-center gap-0.5"><User className="h-2.5 w-2.5" />Team</span> : <span className="inline-flex items-center gap-0.5"><ContactIcon className="h-2.5 w-2.5" />Contact</span>}
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
