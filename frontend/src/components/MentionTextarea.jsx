/**
 * MentionTextarea — a rich @-mention editor (contentEditable) that renders
 * selected mentions as clean `@Name` pills WHILE typing, but serializes to the
 * canonical `@[Display Name](user-id)` form for `onChange` so the backend can
 * pluck out the ids and notify. Drop-in replacement: same props as before
 * (value / onChange(string) / placeholder / rows / className / disabled / testid).
 */
import React, { useEffect, useRef, useState, useCallback } from 'react';
import axios from 'axios';

const API_URL = process.env.REACT_APP_BACKEND_URL + '/api';
const auth = () => ({ Authorization: `Bearer ${localStorage.getItem('token') || localStorage.getItem('session_token')}` });

const CHIP_RE = /@\[([^\]]+)\]\(([A-Za-z0-9_-]+)\)/g;
const PILL_CLS = 'mention-pill inline-flex items-center bg-rose-50 text-rose-700 border border-rose-200 rounded-full px-1.5 text-[12px] font-medium mx-0.5 align-baseline';

// Render saved mention chips as visible @pills (used inline in comment lists).
export function renderMentionedText(text) {
  if (!text) return null;
  const out = [];
  let last = 0;
  String(text).replace(CHIP_RE, (match, name, id, offset) => {
    if (offset > last) out.push(String(text).slice(last, offset));
    out.push(
      <span key={offset} className="inline-flex items-center bg-rose-50 text-rose-700 border border-rose-200 rounded-full px-1.5 text-[12px] font-medium mx-0.5">
        @{name}
      </span>,
    );
    last = offset + match.length;
    return match;
  });
  if (last < String(text).length) out.push(String(text).slice(last));
  return out;
}

// ── DOM (contentEditable) ⇄ canonical-string helpers ───────────────────────
function serializeNode(node) {
  if (node.nodeType === Node.TEXT_NODE) return (node.textContent || '').replace(/\u00A0/g, ' ');
  if (node.nodeType !== Node.ELEMENT_NODE) return '';
  if (node.dataset && node.dataset.mentionId) {
    return `@[${node.dataset.mentionName}](${node.dataset.mentionId})`;
  }
  if (node.tagName === 'BR') return '\n';
  let s = '';
  node.childNodes.forEach((c) => { s += serializeNode(c); });
  if (/^(DIV|P)$/.test(node.tagName)) s += '\n';
  return s;
}

function serialize(root) {
  if (!root) return '';
  let s = '';
  root.childNodes.forEach((c) => { s += serializeNode(c); });
  return s.replace(/\n+$/, '');
}

function makePill(name, id) {
  const pill = document.createElement('span');
  pill.contentEditable = 'false';
  pill.dataset.mentionId = id;
  pill.dataset.mentionName = name;
  pill.className = PILL_CLS;
  pill.textContent = `@${name}`;
  return pill;
}

// Build DOM from a canonical string (used for initial value / external resets).
function renderCanonicalInto(root, value) {
  root.innerHTML = '';
  const v = value || '';
  let last = 0;
  let m;
  CHIP_RE.lastIndex = 0;
  while ((m = CHIP_RE.exec(v)) !== null) {
    if (m.index > last) root.appendChild(document.createTextNode(v.slice(last, m.index)));
    root.appendChild(makePill(m[1], m[2]));
    last = m.index + m[0].length;
  }
  if (last < v.length) root.appendChild(document.createTextNode(v.slice(last)));
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
  const editorRef = useRef(null);
  const activeQuery = useRef(null); // {node, atIndex, caret}
  const [users, setUsers] = useState([]);
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [highlight, setHighlight] = useState(0);

  useEffect(() => {
    axios.get(`${API_URL}/users?is_active=true`, { headers: auth() })
      .then((r) => setUsers(Array.isArray(r.data) ? r.data : (r.data?.data || [])))
      .catch(() => setUsers([]));
  }, []);

  // Keep the editor DOM in sync with external value changes (init + reset on
  // clear) without fighting the caret while the user is typing.
  useEffect(() => {
    const el = editorRef.current;
    if (!el) return;
    const incoming = value || '';
    if (incoming === '') {
      // External reset (e.g. after posting) — always clear, even if focused.
      if (el.innerHTML !== '') el.innerHTML = '';
      return;
    }
    if (document.activeElement === el) return; // don't disrupt active editing
    if (serialize(el) !== incoming) {
      renderCanonicalInto(el, incoming);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value]);

  const filtered = users
    .filter((u) => !query || (u.name || '').toLowerCase().includes(query.toLowerCase()))
    .slice(0, 8);

  const emitChange = useCallback(() => {
    onChange?.(serialize(editorRef.current));
  }, [onChange]);

  const detectQuery = () => {
    const sel = window.getSelection();
    if (!sel || !sel.rangeCount) { setOpen(false); return; }
    const range = sel.getRangeAt(0);
    const node = range.startContainer;
    if (node.nodeType !== Node.TEXT_NODE) { setOpen(false); return; }
    const caret = range.startOffset;
    const text = (node.textContent || '').slice(0, caret);
    const m = /(?:^|\s)@([^\s@]*)$/.exec(text);
    if (!m) { setOpen(false); activeQuery.current = null; return; }
    activeQuery.current = { node, atIndex: caret - m[1].length - 1, caret };
    setQuery(m[1]);
    setHighlight(0);
    setOpen(true);
  };

  const handleInput = () => {
    emitChange();
    detectQuery();
  };

  const insertMention = useCallback((user) => {
    const q = activeQuery.current;
    const el = editorRef.current;
    if (!q || !el) return;
    const { node, atIndex, caret } = q;
    const full = node.textContent || '';
    const before = full.slice(0, atIndex);
    const after = full.slice(caret);
    node.textContent = before;
    const pill = makePill(user.name, user.id);
    const spaceNode = document.createTextNode('\u00A0' + after);
    const parent = node.parentNode;
    parent.insertBefore(pill, node.nextSibling);
    parent.insertBefore(spaceNode, pill.nextSibling);
    // caret right after the inserted pill + space
    const range = document.createRange();
    range.setStart(spaceNode, 1);
    range.collapse(true);
    const sel = window.getSelection();
    sel.removeAllRanges();
    sel.addRange(range);
    setOpen(false);
    activeQuery.current = null;
    emitChange();
  }, [emitChange]);

  const handleKeyDown = (e) => {
    if (open && filtered.length > 0) {
      if (e.key === 'ArrowDown') { e.preventDefault(); setHighlight((p) => (p + 1) % filtered.length); return; }
      if (e.key === 'ArrowUp') { e.preventDefault(); setHighlight((p) => (p - 1 + filtered.length) % filtered.length); return; }
      if (e.key === 'Enter' || e.key === 'Tab') { e.preventDefault(); insertMention(filtered[highlight]); return; }
      if (e.key === 'Escape') { setOpen(false); return; }
    }
  };

  const isEmpty = !(value && value.length);

  return (
    <div className="relative">
      <div
        ref={editorRef}
        contentEditable={!disabled}
        suppressContentEditableWarning
        role="textbox"
        aria-multiline="true"
        data-placeholder={placeholder}
        onInput={handleInput}
        onKeyDown={handleKeyDown}
        onKeyUp={detectQuery}
        onMouseUp={detectQuery}
        onBlur={() => setTimeout(() => setOpen(false), 150)}
        className={`mention-editor w-full rounded-md border border-slate-200 bg-white p-2 text-sm focus:outline-none focus:ring-2 focus:ring-rose-200 overflow-y-auto whitespace-pre-wrap break-words ${isEmpty ? 'mention-empty' : ''} ${className}`}
        style={{ minHeight: `${Math.max(1, rows) * 1.5 + 1}rem`, maxHeight: '12rem' }}
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
