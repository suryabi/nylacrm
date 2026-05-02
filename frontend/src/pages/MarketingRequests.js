/* eslint-disable no-restricted-globals */
import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { useSearchParams, Link } from 'react-router-dom';
import axios from 'axios';
import { toast } from 'sonner';
import {
  Sparkles, Plus, Filter, Search, Loader2, Calendar, User, Tag,
  AlertTriangle, CheckCircle2, Clock, Eye, X, Link as LinkIcon, Paperclip,
  ArrowRight, ChevronRight, MessageSquare, Trash2, ExternalLink, ArrowUp, ArrowDown,
} from 'lucide-react';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Textarea } from '../components/ui/textarea';
import { Label } from '../components/ui/label';
import { Badge } from '../components/ui/badge';
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from '../components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '../components/ui/dialog';

const API = process.env.REACT_APP_BACKEND_URL + '/api';

const STATUS_META = {
  submitted:              { label: 'Submitted',              icon: Clock,         tone: 'bg-slate-100 text-slate-700 border-slate-200' },
  in_progress_marketing:  { label: 'In Progress',            icon: ArrowRight,    tone: 'bg-amber-100 text-amber-700 border-amber-200' },
  internal_review:        { label: 'Internal Review',        icon: Eye,           tone: 'bg-violet-100 text-violet-700 border-violet-200' },
  sent_to_sales:          { label: 'Sent to Sales',          icon: ArrowRight,    tone: 'bg-sky-100 text-sky-700 border-sky-200' },
  client_review:          { label: 'Client Review',          icon: User,          tone: 'bg-indigo-100 text-indigo-700 border-indigo-200' },
  approved:               { label: 'Approved',               icon: CheckCircle2,  tone: 'bg-emerald-100 text-emerald-700 border-emerald-200' },
  quantity_confirmation:  { label: 'Qty Confirmation',       icon: Clock,         tone: 'bg-teal-100 text-teal-700 border-teal-200' },
  production_ready:       { label: 'Production Ready',       icon: CheckCircle2,  tone: 'bg-cyan-100 text-cyan-700 border-cyan-200' },
  sent_for_printing:      { label: 'Sent for Printing',      icon: ArrowRight,    tone: 'bg-purple-100 text-purple-700 border-purple-200' },
  completed:              { label: 'Completed',              icon: CheckCircle2,  tone: 'bg-emerald-200 text-emerald-900 border-emerald-300' },
  rejected:               { label: 'Rejected',               icon: X,             tone: 'bg-rose-100 text-rose-700 border-rose-200' },
  // Legacy (still surfaced so old rows render gracefully)
  created:                { label: 'Submitted',              icon: Clock,         tone: 'bg-slate-100 text-slate-700 border-slate-200' },
  assigned:               { label: 'Submitted',              icon: User,          tone: 'bg-slate-100 text-slate-700 border-slate-200' },
  in_progress:            { label: 'In Progress',            icon: ArrowRight,    tone: 'bg-amber-100 text-amber-700 border-amber-200' },
  review:                 { label: 'Internal Review',        icon: Eye,           tone: 'bg-violet-100 text-violet-700 border-violet-200' },
};

const WORKFLOW_STEPS = [
  'submitted', 'in_progress_marketing', 'internal_review', 'sent_to_sales',
  'client_review', 'approved', 'quantity_confirmation', 'production_ready',
  'sent_for_printing', 'completed',
];

const NEXT_ACTION_COLORS = {
  Marketing:           'bg-amber-100 text-amber-900 ring-amber-300',
  'Marketing Manager': 'bg-violet-100 text-violet-900 ring-violet-300',
  Sales:               'bg-sky-100 text-sky-900 ring-sky-300',
  Client:              'bg-indigo-100 text-indigo-900 ring-indigo-300',
  Production:          'bg-cyan-100 text-cyan-900 ring-cyan-300',
  Requester:           'bg-rose-100 text-rose-900 ring-rose-300',
  '—':                 'bg-slate-100 text-slate-700 ring-slate-300',
};
const STATUSES = Object.keys(STATUS_META);

const PRIORITY_META = {
  low:    { tone: 'bg-slate-100 text-slate-600' },
  medium: { tone: 'bg-sky-100 text-sky-700' },
  high:   { tone: 'bg-amber-100 text-amber-800' },
  urgent: { tone: 'bg-rose-100 text-rose-800' },
};

function StatusPill({ status }) {
  const m = STATUS_META[status] || STATUS_META.submitted;
  const Icon = m.icon;
  return (
    <Badge variant="outline" className={`gap-1 font-medium ${m.tone}`} data-testid={`pill-status-${status}`}>
      <Icon className="h-3 w-3" />
      {m.label}
    </Badge>
  );
}

// ─── Pipeline Tracker ─── visually shows where the request is in the flow
function StatusTracker({ currentStatus, approvalType }) {
  const steps = WORKFLOW_STEPS.filter((s) => {
    if (s === 'client_review' && approvalType !== 'client') return false;
    return true;
  });
  const normalized = (STATUS_META[currentStatus] || {}).label ? currentStatus : 'submitted';
  let activeIdx = steps.indexOf(normalized);
  if (activeIdx === -1 && normalized === 'rejected') activeIdx = -2; // rejected = sidelined
  return (
    <div className="overflow-x-auto" data-testid="mr-status-tracker">
      <div className="flex items-center gap-0 min-w-max pb-1 pt-2">
        {steps.map((s, i) => {
          const done = activeIdx >= 0 && i < activeIdx;
          const active = i === activeIdx;
          const m = STATUS_META[s];
          return (
            <div key={s} className="flex items-center">
              <div className="flex flex-col items-center px-2">
                <div
                  className={
                    `w-7 h-7 rounded-full flex items-center justify-center text-xs font-semibold border-2 transition-all ` +
                    (done ? 'bg-emerald-500 border-emerald-500 text-white' :
                     active ? 'bg-indigo-600 border-indigo-600 text-white shadow-lg ring-4 ring-indigo-200' :
                     'bg-white border-slate-300 text-slate-400')
                  }
                >
                  {done ? <CheckCircle2 className="h-4 w-4" /> : i + 1}
                </div>
                <div className={`text-[10px] font-medium mt-1 whitespace-nowrap ${active ? 'text-indigo-700' : done ? 'text-emerald-700' : 'text-slate-400'}`}>
                  {m.label}
                </div>
              </div>
              {i < steps.length - 1 && (
                <div className={`h-0.5 w-5 ${done ? 'bg-emerald-500' : 'bg-slate-200'}`} />
              )}
            </div>
          );
        })}
        {currentStatus === 'rejected' && (
          <div className="ml-4 px-2 py-1 rounded bg-rose-100 text-rose-700 text-[11px] font-semibold">Rejected</div>
        )}
      </div>
    </div>
  );
}

function NextActionChip({ owner, priority }) {
  const tone = NEXT_ACTION_COLORS[owner] || NEXT_ACTION_COLORS['—'];
  return (
    <div className={`inline-flex items-center gap-2 px-3 py-1.5 rounded-full ring-2 text-sm font-semibold ${tone}`} data-testid="mr-next-owner">
      <ArrowRight className="h-3.5 w-3.5" />
      <span>Next: {owner}</span>
      {priority && <span className="text-[10px] uppercase tracking-wider opacity-70">· {priority}</span>}
    </div>
  );
}

// ─── Workflow transition buttons ───
const ALLOWED = {
  submitted:             ['in_progress_marketing', 'rejected'],
  in_progress_marketing: ['internal_review', 'rejected'],
  internal_review:       ['sent_to_sales', 'in_progress_marketing', 'rejected'],
  sent_to_sales:         ['client_review', 'approved', 'in_progress_marketing', 'rejected'],
  client_review:         ['approved', 'in_progress_marketing', 'rejected'],
  approved:              ['quantity_confirmation', 'rejected'],
  quantity_confirmation: ['production_ready', 'rejected'],
  production_ready:      ['sent_for_printing', 'rejected'],
  sent_for_printing:     ['completed', 'rejected'],
  completed:             [],
  rejected:              ['submitted'],
};

function AdvanceActions({ request, onAdvance, saving }) {
  const allowed = (ALLOWED[request.status] || []).filter((s) => {
    if (s === 'client_review' && request.approval_type !== 'client') return false;
    return true;
  });
  if (!allowed.length) return <p className="text-xs text-emerald-700 font-medium">Workflow complete — no further actions.</p>;
  return (
    <div className="flex flex-wrap gap-2" data-testid="mr-advance-actions">
      {allowed.map((s) => {
        const m = STATUS_META[s];
        const Icon = m.icon;
        const isReject = s === 'rejected';
        return (
          <Button
            key={s}
            size="sm"
            variant={isReject ? 'outline' : 'default'}
            onClick={() => {
              if (isReject) {
                const reason = window.prompt('Rejection reason:');
                if (reason) onAdvance(s, { rejection_reason: reason });
              } else {
                onAdvance(s);
              }
            }}
            disabled={saving}
            className={isReject ? 'border-rose-200 text-rose-600 hover:bg-rose-50' : 'bg-indigo-600 hover:bg-indigo-700'}
            data-testid={`advance-to-${s}`}
          >
            <Icon className="h-3.5 w-3.5 mr-1.5" />
            {isReject ? 'Reject' : `Move to ${m.label}`}
          </Button>
        );
      })}
    </div>
  );
}

function PriorityPill({ priority }) {
  const m = PRIORITY_META[priority] || PRIORITY_META.medium;
  return (
    <span className={`px-2 py-0.5 rounded-md text-[10px] uppercase tracking-wider font-semibold ${m.tone}`}>
      {priority}
    </span>
  );
}

// ─── HeroTile (reused minimal version) ───
const ACCENTS = {
  indigo: { grad: 'from-indigo-50 via-indigo-50/50 to-white', icon: 'text-indigo-600 bg-indigo-500/10', halo: 'bg-indigo-500/10' },
  amber:  { grad: 'from-amber-50 via-amber-50/50 to-white',  icon: 'text-amber-600 bg-amber-500/10',  halo: 'bg-amber-500/10' },
  rose:   { grad: 'from-rose-50 via-rose-50/50 to-white',    icon: 'text-rose-600 bg-rose-500/10',    halo: 'bg-rose-500/10' },
  emerald:{ grad: 'from-emerald-50 via-emerald-50/50 to-white', icon: 'text-emerald-600 bg-emerald-500/10', halo: 'bg-emerald-500/10' },
  sky:    { grad: 'from-sky-50 via-sky-50/50 to-white',      icon: 'text-sky-600 bg-sky-500/10',      halo: 'bg-sky-500/10' },
};

function HeroTile({ label, value, sub, icon: Icon, accent = 'indigo', onClick, dataTestId }) {
  const a = ACCENTS[accent] || ACCENTS.indigo;
  return (
    <div
      className={`relative group rounded-2xl border border-slate-200/70 bg-gradient-to-br ${a.grad} p-4 overflow-hidden transition-all hover:-translate-y-0.5 hover:shadow-lg ${onClick ? 'cursor-pointer' : ''}`}
      onClick={onClick}
      data-testid={dataTestId}
    >
      <div className={`absolute -top-6 -right-6 h-20 w-20 rounded-full ${a.halo} blur-2xl opacity-40`} />
      <div className="flex items-start justify-between gap-2 relative">
        <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">{label}</p>
        <div className={`shrink-0 h-8 w-8 rounded-xl flex items-center justify-center ${a.icon}`}>
          <Icon className="h-4 w-4" />
        </div>
      </div>
      <p className="mt-3 text-2xl sm:text-3xl font-bold tracking-tight text-slate-900 tabular-nums relative">{value}</p>
      {sub && <p className="text-[11px] text-muted-foreground mt-1 relative">{sub}</p>}
    </div>
  );
}

// ─── Design Options: versioned option cards w/ select + per-option comments ───
function DesignOptionsSection({ requestId, request, onChanged }) {
  const [label, setLabel] = useState('');
  const [notes, setNotes] = useState('');
  const [imgInput, setImgInput] = useState('');
  const [imgList, setImgList] = useState([]);
  const [adding, setAdding] = useState(false);
  const [commentTexts, setCommentTexts] = useState({}); // {optionId: text}

  const options = (request.design_options || []).slice().sort((a, b) => (a.version || 0) - (b.version || 0));

  const addOption = async () => {
    setAdding(true);
    try {
      await axios.post(`${API}/marketing-requests/${requestId}/options`, {
        label: label.trim() || undefined,
        notes: notes.trim() || undefined,
        image_urls: imgList,
      });
      setLabel(''); setNotes(''); setImgInput(''); setImgList([]);
      onChanged?.();
    } catch (e) {
      toast.error(e?.response?.data?.detail || 'Failed to add option');
    } finally { setAdding(false); }
  };

  const selectOption = async (optionId) => {
    try {
      await axios.post(`${API}/marketing-requests/${requestId}/options/${optionId}/select`);
      onChanged?.();
    } catch (e) { toast.error('Failed to select option'); }
  };

  const commentOnOption = async (optionId) => {
    const text = (commentTexts[optionId] || '').trim();
    if (!text) return;
    try {
      await axios.post(`${API}/marketing-requests/${requestId}/options/${optionId}/comments`, { text });
      setCommentTexts((p) => ({ ...p, [optionId]: '' }));
      onChanged?.();
    } catch (e) { toast.error('Failed to post comment'); }
  };

  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-4" data-testid="mr-design-options">
      <div className="flex items-center justify-between mb-3">
        <div>
          <h3 className="text-sm font-semibold text-slate-800 flex items-center gap-2">
            <Sparkles className="h-4 w-4 text-indigo-500" />
            Design Options <span className="text-slate-400 font-normal">({options.length})</span>
          </h3>
          <p className="text-[11px] text-slate-500">Submit multiple design versions. Sales or the client picks one.</p>
        </div>
      </div>

      {options.length === 0 && <p className="text-xs text-slate-400 italic py-4 text-center border border-dashed border-slate-200 rounded-lg">No options submitted yet. Add the first version below.</p>}

      <div className="space-y-3">
        {options.map((o) => (
          <div key={o.id} className={`rounded-xl border-2 p-4 transition-all ${o.selected ? 'border-emerald-400 bg-emerald-50/40' : 'border-slate-200 bg-slate-50/50'}`} data-testid={`mr-option-${o.id}`}>
            <div className="flex items-start justify-between gap-3 mb-2">
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <Badge variant="outline" className="bg-indigo-50 text-indigo-700 border-indigo-200 font-mono text-xs">v{o.version}</Badge>
                  <div className="font-semibold text-sm text-slate-800 truncate">{o.label}</div>
                  {o.selected && <Badge className="bg-emerald-600 text-white text-[10px]"><CheckCircle2 className="h-3 w-3 mr-1" />Selected</Badge>}
                </div>
                {o.notes && <p className="text-xs text-slate-600 mt-1 whitespace-pre-wrap">{o.notes}</p>}
              </div>
              {!o.selected && (
                <Button size="sm" variant="outline" onClick={() => selectOption(o.id)} className="shrink-0 border-emerald-200 text-emerald-700 hover:bg-emerald-50" data-testid={`option-select-${o.id}`}>
                  <CheckCircle2 className="h-3.5 w-3.5 mr-1.5" />Select
                </Button>
              )}
            </div>

            {(o.image_urls || []).length > 0 && (
              <div className="flex gap-2 flex-wrap mb-2">
                {o.image_urls.map((url, i) => (
                  <a key={i} href={url} target="_blank" rel="noreferrer" className="block h-20 w-20 rounded-lg overflow-hidden border border-slate-200 hover:ring-2 hover:ring-indigo-300">
                    <img src={url} alt={`v${o.version}-${i}`} className="h-full w-full object-cover" onError={(e) => { e.currentTarget.style.display = 'none'; }} />
                  </a>
                ))}
              </div>
            )}
            {(o.files || []).length > 0 && (
              <div className="flex gap-2 flex-wrap mb-2">
                {o.files.map((f) => (
                  <a key={f.id} href={f.url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 px-2 py-1 rounded bg-white border border-slate-200 text-xs hover:bg-slate-50">
                    <Paperclip className="h-3 w-3" />{f.name}
                  </a>
                ))}
              </div>
            )}

            {/* inline comments */}
            <div className="mt-2 pt-2 border-t border-slate-200/70">
              <div className="space-y-1 mb-2">
                {(o.comments || []).map((c) => (
                  <div key={c.id} className="flex gap-2 items-start text-xs">
                    <span className="font-medium text-slate-700">{c.by_name || 'User'}:</span>
                    <span className="text-slate-600 flex-1">{c.text}</span>
                    <span className="text-slate-400 text-[10px]">{new Date(c.at).toLocaleDateString()}</span>
                  </div>
                ))}
                {(o.comments || []).length === 0 && <p className="text-[11px] text-slate-400 italic">No comments yet.</p>}
              </div>
              <div className="flex gap-2">
                <Input
                  className="h-8 text-xs"
                  placeholder="Add a comment on this option…"
                  value={commentTexts[o.id] || ''}
                  onChange={(e) => setCommentTexts((p) => ({ ...p, [o.id]: e.target.value }))}
                  onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); commentOnOption(o.id); } }}
                  data-testid={`option-comment-input-${o.id}`}
                />
                <Button size="sm" variant="outline" onClick={() => commentOnOption(o.id)} disabled={!(commentTexts[o.id] || '').trim()}>Post</Button>
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Add new option */}
      <div className="mt-4 border-t border-slate-200 pt-4">
        <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-500 mb-2">Add new version</p>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
          <Input placeholder="Label (e.g. Modern Blue)" value={label} onChange={(e) => setLabel(e.target.value)} className="h-9" data-testid="option-label-input" />
          <div className="flex gap-2">
            <Input placeholder="Paste an image URL, then press +" value={imgInput} onChange={(e) => setImgInput(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter' && imgInput.trim()) { setImgList((p) => [...p, imgInput.trim()]); setImgInput(''); } }} className="h-9 flex-1" />
            <Button type="button" size="sm" variant="outline" onClick={() => { if (imgInput.trim()) { setImgList((p) => [...p, imgInput.trim()]); setImgInput(''); } }} disabled={!imgInput.trim()}>Add img</Button>
          </div>
        </div>
        {imgList.length > 0 && (
          <div className="flex gap-1 flex-wrap mt-2">
            {imgList.map((u, i) => (
              <div key={i} className="flex items-center gap-1 text-[11px] px-2 py-0.5 bg-slate-100 rounded">
                <span className="truncate max-w-[140px]">{u}</span>
                <button onClick={() => setImgList((p) => p.filter((_, idx) => idx !== i))}><X className="h-3 w-3" /></button>
              </div>
            ))}
          </div>
        )}
        <Textarea rows={2} placeholder="Notes on this version…" value={notes} onChange={(e) => setNotes(e.target.value)} className="mt-2" data-testid="option-notes-input" />
        <div className="flex justify-end mt-2">
          <Button size="sm" onClick={addOption} disabled={adding} className="bg-indigo-600 hover:bg-indigo-700" data-testid="option-add-btn">
            {adding ? 'Adding…' : (<><Plus className="h-3.5 w-3.5 mr-1" />Add option</>)}
          </Button>
        </div>
      </div>
    </div>
  );
}

// ─── Client Share Link ───
function ClientShareSection({ requestId, request }) {
  const [token, setToken] = useState(request.client_share_token || '');
  const [generating, setGenerating] = useState(false);

  const publicUrl = token ? `${window.location.origin}/public/marketing-requests/${token}` : '';

  const generate = async () => {
    setGenerating(true);
    try {
      const { data } = await axios.post(`${API}/marketing-requests/${requestId}/share-link`);
      setToken(data.token);
    } catch { toast.error('Failed to generate link'); }
    finally { setGenerating(false); }
  };

  const copy = async () => {
    if (!publicUrl) return;
    try { await navigator.clipboard.writeText(publicUrl); toast.success('Link copied'); }
    catch { /* no-op */ }
  };

  const fb = request.client_feedback;

  return (
    <div className="rounded-2xl border border-indigo-200 bg-gradient-to-br from-indigo-50 to-white p-4" data-testid="mr-client-share">
      <div className="flex items-center justify-between mb-2">
        <h3 className="text-sm font-semibold text-indigo-900 flex items-center gap-2">
          <LinkIcon className="h-4 w-4" />Client Share Link
        </h3>
        <Badge variant="outline" className="bg-white">{request.approval_type === 'client' ? 'Client approval required' : 'Internal approval'}</Badge>
      </div>

      {!token ? (
        <div className="flex items-center justify-between gap-3">
          <p className="text-xs text-slate-600 flex-1">Generate a public URL to share with the client. No login required.</p>
          <Button size="sm" onClick={generate} disabled={generating} className="bg-indigo-600 hover:bg-indigo-700" data-testid="mr-generate-link">
            {generating ? 'Generating…' : 'Generate Link'}
          </Button>
        </div>
      ) : (
        <div className="space-y-2">
          <div className="flex items-center gap-2">
            <Input readOnly value={publicUrl} className="h-9 text-xs font-mono bg-white" data-testid="mr-share-url" />
            <Button size="sm" variant="outline" onClick={copy}>Copy</Button>
            <a href={publicUrl} target="_blank" rel="noreferrer">
              <Button size="sm" variant="outline"><ExternalLink className="h-3.5 w-3.5" /></Button>
            </a>
          </div>
          {fb && (
            <div className={`px-3 py-2 rounded-lg text-xs ${fb.decision === 'approve' ? 'bg-emerald-50 border border-emerald-200 text-emerald-800' : fb.decision === 'request_changes' ? 'bg-amber-50 border border-amber-200 text-amber-800' : 'bg-indigo-50 border border-indigo-200 text-indigo-800'}`}>
              <div className="font-semibold mb-0.5">Client decision: {fb.decision.replace('_', ' ')}</div>
              {fb.comment && <div className="whitespace-pre-wrap">{fb.comment}</div>}
              <div className="text-[10px] text-slate-500 mt-1">{new Date(fb.at).toLocaleString()}</div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ──────────────────────────────────────────────────────────────────────────
// Detail drawer — shows lifecycle, comments, files, activity, reassignment.
// Lives inline in this file to keep the module self-contained.
// ──────────────────────────────────────────────────────────────────────────

function RequestDetailDrawer({ requestId, onClose, onChanged, types, departments, leadOptions }) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [comment, setComment] = useState('');
  const [deptUsers, setDeptUsers] = useState([]);
  const [linkLabel, setLinkLabel] = useState('');
  const [linkUrl, setLinkUrl] = useState('');
  const [linkKind, setLinkKind] = useState('output');
  const [rejectReason, setRejectReason] = useState('');

  const refresh = useCallback(async () => {
    try {
      const { data } = await axios.get(`${API}/marketing-requests/${requestId}`);
      setData(data);
    } catch {
      toast.error('Failed to load request');
    } finally { setLoading(false); }
  }, [requestId]);

  useEffect(() => { refresh(); }, [refresh]);

  // Fetch users in the currently-assigned department
  useEffect(() => {
    if (!data?.assigned_to_department) return;
    (async () => {
      try {
        const { data: users } = await axios.get(`${API}/marketing-requests/lookups/users-by-department`, {
          params: { department: data.assigned_to_department },
        });
        setDeptUsers(users || []);
      } catch { setDeptUsers([]); }
    })();
  }, [data?.assigned_to_department]);

  const updateField = async (patch) => {
    setSaving(true);
    try {
      await axios.put(`${API}/marketing-requests/${requestId}`, patch);
      await refresh();
      onChanged?.();
    } catch (e) {
      toast.error(e?.response?.data?.detail || 'Update failed');
    } finally { setSaving(false); }
  };

  const advanceTo = async (toStatus, extra = {}) => {
    setSaving(true);
    try {
      await axios.post(`${API}/marketing-requests/${requestId}/advance`, { to_status: toStatus, ...extra });
      await refresh();
      onChanged?.();
    } catch (e) {
      toast.error(e?.response?.data?.detail || 'Transition failed');
    } finally { setSaving(false); }
  };

  const addComment = async () => {
    if (!comment.trim()) return;
    try {
      await axios.post(`${API}/marketing-requests/${requestId}/comments`, { text: comment.trim() });
      setComment('');
      await refresh();
    } catch (e) {
      toast.error(e?.response?.data?.detail || 'Failed to add comment');
    }
  };

  const addLink = async () => {
    if (!linkUrl.trim() || !linkLabel.trim()) return;
    try {
      await axios.post(`${API}/marketing-requests/${requestId}/links`, {
        label: linkLabel.trim(), url: linkUrl.trim(), kind: linkKind,
      });
      setLinkLabel(''); setLinkUrl('');
      await refresh();
      onChanged?.();
    } catch (e) {
      toast.error(e?.response?.data?.detail || 'Failed to add link');
    }
  };

  const removeLink = async (linkId) => {
    try {
      await axios.delete(`${API}/marketing-requests/${requestId}/links/${linkId}`);
      await refresh();
    } catch { toast.error('Failed to remove link'); }
  };

  const removeFile = async (fileId) => {
    try {
      await axios.delete(`${API}/marketing-requests/${requestId}/files/${fileId}`);
      await refresh();
    } catch { toast.error('Failed to remove file'); }
  };

  if (loading || !data) {
    return (
      <Dialog open onOpenChange={onClose}>
        <DialogContent className="max-w-2xl">
          <div className="flex items-center justify-center h-40"><Loader2 className="w-6 h-6 animate-spin text-slate-400" /></div>
        </DialogContent>
      </Dialog>
    );
  }

  const allFiles = [...(data.input_files || []), ...(data.output_files || [])];
  const allLinks = [...(data.reference_links || []), ...(data.output_links || [])];

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto" data-testid="mr-detail-drawer">
        <DialogHeader>
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <DialogTitle className="text-base sm:text-lg flex items-center gap-2">
                <Sparkles className="h-4 w-4 text-indigo-500" />
                {data.title}
              </DialogTitle>
              <div className="flex flex-wrap items-center gap-2 mt-2">
                <StatusPill status={data.status} />
                <PriorityPill priority={data.priority} />
                {data.request_type_name && (
                  <Badge variant="outline" className="bg-slate-50">
                    <Tag className="h-3 w-3 mr-1" />{data.request_type_name}
                  </Badge>
                )}
                {data.due_date && (
                  <Badge variant="outline" className="bg-slate-50">
                    <Calendar className="h-3 w-3 mr-1" />Due {data.due_date}
                  </Badge>
                )}
              </div>
            </div>
          </div>
        </DialogHeader>

        {/* ── Status Tracker + Next Action Owner ── */}
        <div className="rounded-2xl border border-slate-200 bg-white p-4">
          <div className="flex items-center justify-between gap-3 mb-3 flex-wrap">
            <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Workflow</p>
            <div className="flex items-center gap-2">
              <NextActionChip owner={data.next_action_owner || '—'} />
              <Select value={data.approval_type || 'internal'} onValueChange={(v) => updateField({ approval_type: v })}>
                <SelectTrigger className="h-8 text-xs w-40" data-testid="select-approval-type"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="internal">Internal approval</SelectItem>
                  <SelectItem value="client">Client required</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <StatusTracker currentStatus={data.status} approvalType={data.approval_type} />
          <div className="mt-4 pt-3 border-t border-slate-100">
            <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground mb-2">Advance to…</p>
            <AdvanceActions request={data} onAdvance={advanceTo} saving={saving} />
          </div>
          {data.rejection_reason && (
            <div className="mt-3 px-3 py-2 bg-rose-50 border border-rose-200 rounded-md text-xs text-rose-700">
              <strong>Rejection reason:</strong> {data.rejection_reason}
            </div>
          )}
        </div>

        {/* ── Design Options ── */}
        <DesignOptionsSection requestId={requestId} request={data} onChanged={async () => { await refresh(); onChanged?.(); }} />

        {/* ── Client Share Link ── */}
        <ClientShareSection requestId={requestId} request={data} />

        {/* ── Assignment ── */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <Label className="text-xs">Department</Label>
            <Select
              value={data.assigned_to_department || ''}
              onValueChange={(v) => updateField({ assigned_to_department: v, assigned_to: null })}
            >
              <SelectTrigger className="h-9" data-testid="select-department"><SelectValue /></SelectTrigger>
              <SelectContent>
                {departments.map((d) => <SelectItem key={d} value={d}>{d}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label className="text-xs">Assignee</Label>
            <Select
              value={data.assigned_to || '__none__'}
              onValueChange={(v) => updateField({ assigned_to: v === '__none__' ? null : v })}
            >
              <SelectTrigger className="h-9" data-testid="select-assignee"><SelectValue placeholder="Unassigned" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="__none__">Unassigned</SelectItem>
                {deptUsers.map((u) => <SelectItem key={u.id} value={u.id}>{u.name} <span className="text-slate-400 text-xs">({u.role})</span></SelectItem>)}
              </SelectContent>
            </Select>
          </div>
        </div>

        {/* ── Description ── */}
        {data.description && (
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground mb-1">Description</p>
            <p className="text-sm text-slate-700 whitespace-pre-wrap">{data.description}</p>
          </div>
        )}

        {/* ── Lead linkage ── */}
        <LeadLinker
          requestId={requestId}
          currentLeads={data.leads_summary || []}
          currentLeadIds={data.lead_ids || []}
          onChanged={async () => { await refresh(); onChanged?.(); }}
        />

        {/* ── Files ── */}
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground mb-2 flex items-center gap-2">
            <Paperclip className="h-3 w-3" /> Files ({allFiles.length})
          </p>
          {allFiles.length === 0 ? (
            <p className="text-xs text-slate-400 italic">No files attached yet</p>
          ) : (
            <div className="space-y-1.5">
              {allFiles.map((f) => (
                <div key={f.id} className="flex items-center gap-2 px-3 py-2 rounded-lg border border-slate-200 bg-white hover:bg-slate-50">
                  <Paperclip className="h-3.5 w-3.5 text-slate-400" />
                  <a href={f.url} target="_blank" rel="noreferrer" className="text-sm text-slate-700 hover:underline flex-1 truncate">{f.name}</a>
                  <Badge variant="outline" className="text-[10px]">{f.kind}</Badge>
                  <button onClick={() => removeFile(f.id)} className="text-rose-500 hover:bg-rose-50 rounded p-1" data-testid={`rm-file-${f.id}`}><Trash2 className="h-3 w-3" /></button>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* ── Links (Google Drive, video previews, etc.) ── */}
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground mb-2 flex items-center gap-2">
            <LinkIcon className="h-3 w-3" /> External Links ({allLinks.length})
          </p>
          {allLinks.length > 0 && (
            <div className="space-y-1.5 mb-3">
              {allLinks.map((l) => (
                <div key={l.id} className="flex items-center gap-2 px-3 py-2 rounded-lg border border-slate-200 bg-white hover:bg-slate-50">
                  <LinkIcon className="h-3.5 w-3.5 text-slate-400" />
                  <a href={l.url} target="_blank" rel="noreferrer" className="text-sm text-slate-700 hover:underline flex-1 truncate flex items-center gap-1">
                    {l.label}<ExternalLink className="h-3 w-3 text-slate-300" />
                  </a>
                  <Badge variant="outline" className="text-[10px]">{l.kind}</Badge>
                  <button onClick={() => removeLink(l.id)} className="text-rose-500 hover:bg-rose-50 rounded p-1" data-testid={`rm-link-${l.id}`}><Trash2 className="h-3 w-3" /></button>
                </div>
              ))}
            </div>
          )}
          <div className="grid grid-cols-1 sm:grid-cols-12 gap-2">
            <Input className="sm:col-span-3" placeholder="Label (e.g. Drive folder)" value={linkLabel} onChange={(e) => setLinkLabel(e.target.value)} data-testid="link-label-input" />
            <Input className="sm:col-span-6" placeholder="https://drive.google.com/..." value={linkUrl} onChange={(e) => setLinkUrl(e.target.value)} data-testid="link-url-input" />
            <Select value={linkKind} onValueChange={setLinkKind}>
              <SelectTrigger className="h-9 sm:col-span-2"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="reference">Reference</SelectItem>
                <SelectItem value="output">Output</SelectItem>
              </SelectContent>
            </Select>
            <Button size="sm" onClick={addLink} disabled={!linkUrl.trim() || !linkLabel.trim()} className="sm:col-span-1" data-testid="add-link-btn">Add</Button>
          </div>
        </div>

        {/* ── Comments ── */}
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground mb-2 flex items-center gap-2">
            <MessageSquare className="h-3 w-3" /> Comments ({(data.comments || []).length})
          </p>
          <div className="space-y-2 max-h-60 overflow-y-auto pr-1">
            {(data.comments || []).map((c) => (
              <div key={c.id} className="px-3 py-2 rounded-lg bg-slate-50 border border-slate-100">
                <div className="flex items-baseline justify-between mb-0.5">
                  <span className="text-xs font-semibold text-slate-700">{c.by_name}</span>
                  <span className="text-[10px] text-slate-400">{new Date(c.at).toLocaleString()}</span>
                </div>
                <p className="text-sm text-slate-700 whitespace-pre-wrap">{c.text}</p>
              </div>
            ))}
          </div>
          <div className="flex gap-2 mt-3">
            <Textarea value={comment} onChange={(e) => setComment(e.target.value)} placeholder="Add a comment…" className="min-h-[60px]" data-testid="comment-input" />
            <Button onClick={addComment} disabled={!comment.trim()} data-testid="add-comment-btn">Post</Button>
          </div>
        </div>

        {/* ── Activity ── */}
        <details className="border border-slate-200 rounded-xl">
          <summary className="px-4 py-2 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground cursor-pointer hover:bg-slate-50">Activity Log ({(data.activity || []).length})</summary>
          <div className="px-4 py-2 space-y-1 max-h-60 overflow-y-auto">
            {(data.activity || []).slice().reverse().map((a) => (
              <div key={a.id} className="text-[11px] text-slate-600 flex items-baseline gap-2">
                <span className="text-slate-400 shrink-0 tabular-nums">{new Date(a.at).toLocaleString()}</span>
                <span className="text-slate-700 font-medium">{a.by_name}</span>
                <span className="text-slate-500">
                  {a.kind === 'status_change' && <>changed status: <strong>{a.from_status || '—'}</strong> → <strong>{a.to_status}</strong></>}
                  {a.kind === 'assignment' && a.to_user_name && <>reassigned to <strong>{a.to_user_name}</strong></>}
                  {a.kind === 'assignment' && a.to_department && <>routed to <strong>{a.to_department}</strong> dept</>}
                  {a.kind === 'comment' && <>added a comment</>}
                  {a.kind === 'file' && <>attached {a.file_kind} file <strong>{a.file_name}</strong></>}
                  {a.kind === 'link' && <>added {a.link_kind} link <strong>{a.label}</strong></>}
                </span>
              </div>
            ))}
          </div>
        </details>

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Close</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ──────────────────────────────────────────────────────────────────────────
// Main page — list + tiles + filter + create modal
// ──────────────────────────────────────────────────────────────────────────

export default function MarketingRequests() {
  const [searchParams, setSearchParams] = useSearchParams();
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [summary, setSummary] = useState({});
  const [types, setTypes] = useState([]);
  const [departments, setDepartments] = useState([]);
  const [filter, setFilter] = useState({ status: '', request_type_id: '', department: '', q: '' });
  const [sort, setSort] = useState({ key: 'updated_at', dir: 'desc' });
  const [openCreate, setOpenCreate] = useState(false);
  const [openId, setOpenId] = useState(searchParams.get('id') || '');
  const [leadOptions, setLeadOptions] = useState([]);

  const fetchRows = useCallback(async () => {
    setLoading(true);
    try {
      const params = {};
      if (filter.status) params.status = filter.status;
      if (filter.request_type_id) params.request_type_id = filter.request_type_id;
      if (filter.department) params.department = filter.department;
      const { data } = await axios.get(`${API}/marketing-requests`, { params });
      setRows(data || []);
    } catch { toast.error('Failed to load marketing requests'); }
    setLoading(false);
  }, [filter.status, filter.request_type_id, filter.department]);

  const fetchSummary = useCallback(async () => {
    try {
      const { data } = await axios.get(`${API}/marketing-requests/summary/dashboard`);
      setSummary(data || {});
    } catch { /* ignore */ }
  }, []);

  useEffect(() => {
    (async () => {
      try {
        const [t, d, l] = await Promise.all([
          axios.get(`${API}/master-request-types`),
          axios.get(`${API}/marketing-requests/lookups/departments`),
          axios.get(`${API}/leads`, { params: { limit: 500 } }).catch(() => ({ data: [] })),
        ]);
        setTypes(t.data || []);
        setDepartments(d.data || []);
        // Leads endpoint returns either {data:[...]} (paginated) or a raw array.
        const raw = l.data;
        const leads = Array.isArray(raw) ? raw : (raw?.data || raw?.leads || raw?.items || []);
        setLeadOptions(leads.map((x) => {
          const label = x.company || x.company_name || x.business_name || x.name || x.contact_name || x.hotel_name || 'Untitled Lead';
          const sub = x.contact_name || x.name || x.city || x.status || '';
          return {
            id: x.id,
            label: sub && sub !== label ? `${label} · ${sub}` : label,
          };
        }));
      } catch { /* ignore */ }
    })();
  }, []);

  useEffect(() => { fetchRows(); fetchSummary(); }, [fetchRows, fetchSummary]);

  // Sync drawer id ↔ url
  useEffect(() => {
    if (openId) setSearchParams({ id: openId }, { replace: true });
    else if (searchParams.get('id')) setSearchParams({}, { replace: true });
  }, [openId]); // eslint-disable-line

  const filtered = useMemo(() => {
    const base = !filter.q
      ? rows
      : rows.filter((r) => {
          const q = filter.q.toLowerCase();
          return (
            (r.title || '').toLowerCase().includes(q) ||
            (r.description || '').toLowerCase().includes(q) ||
            (r.request_type_name || '').toLowerCase().includes(q) ||
            (r.custom_request_type || '').toLowerCase().includes(q) ||
            (r.customer_name || '').toLowerCase().includes(q) ||
            (r.assigned_to_name || '').toLowerCase().includes(q)
          );
        });

    // Stable sort
    const PRIORITY_RANK = { urgent: 0, high: 1, medium: 2, low: 3 };
    const STATUS_RANK = { created: 0, assigned: 1, in_progress: 2, review: 3, completed: 4, rejected: 5 };
    const getKey = (r) => {
      switch (sort.key) {
        case 'request': return (r.request_type_name || r.custom_request_type || '').toLowerCase();
        case 'priority': return PRIORITY_RANK[r.priority] ?? 99;
        case 'customer': return (r.customer_name || '').toLowerCase();
        case 'status': return STATUS_RANK[r.status] ?? 99;
        case 'assignee': return (r.assigned_to_name || '').toLowerCase();
        case 'due_date': return r.due_date ? new Date(r.due_date).getTime() : Number.POSITIVE_INFINITY;
        case 'updated_at': return r.updated_at ? new Date(r.updated_at).getTime() : 0;
        default: return 0;
      }
    };
    const sorted = [...base].sort((a, b) => {
      const av = getKey(a), bv = getKey(b);
      if (av < bv) return sort.dir === 'asc' ? -1 : 1;
      if (av > bv) return sort.dir === 'asc' ? 1 : -1;
      return 0;
    });
    return sorted;
  }, [rows, filter.q, sort]);

  const toggleSort = (key) => {
    setSort((p) => p.key === key ? { key, dir: p.dir === 'asc' ? 'desc' : 'asc' } : { key, dir: 'asc' });
  };

  const onChanged = () => { fetchRows(); fetchSummary(); };

  return (
    <div className="p-4 sm:p-6 lg:p-8 max-w-[1600px] mx-auto space-y-5" data-testid="marketing-requests-page">
      {/* ── Header ── */}
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-3">
          <div className="h-10 w-10 rounded-xl bg-gradient-to-br from-indigo-500 to-violet-600 flex items-center justify-center shadow-sm">
            <Sparkles className="h-5 w-5 text-white" />
          </div>
          <div>
            <h1 className="text-xl sm:text-2xl font-bold text-slate-800">Marketing Requests</h1>
            <p className="text-xs sm:text-sm text-slate-500">Sales raises · Marketing fulfils · Track every step</p>
          </div>
        </div>
        <Button onClick={() => setOpenCreate(true)} className="bg-indigo-600 hover:bg-indigo-700" data-testid="open-create-btn">
          <Plus className="h-4 w-4 mr-1.5" /> New Request
        </Button>
      </div>

      {/* ── Hero tiles ── */}
      <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
        <HeroTile label="Total" value={summary.total || 0} icon={Sparkles} accent="indigo" dataTestId="tile-total" />
        <HeroTile label="In Progress" value={summary.by_status?.in_progress || 0} icon={ArrowRight} accent="amber" dataTestId="tile-in-progress" />
        <HeroTile label="Review" value={summary.by_status?.review || 0} icon={Eye} accent="indigo" dataTestId="tile-review" />
        <HeroTile label="Completed" value={summary.by_status?.completed || 0} icon={CheckCircle2} accent="emerald" dataTestId="tile-completed" />
        <HeroTile label="Overdue" value={summary.overdue || 0} icon={AlertTriangle} accent="rose" sub="past due, still open" dataTestId="tile-overdue" />
      </div>

      {/* ── Filters ── */}
      <div className="bg-white border border-slate-200 rounded-2xl p-4">
        <div className="flex items-center gap-2 mb-3">
          <Filter className="h-3.5 w-3.5 text-slate-400" />
          <span className="text-xs font-semibold uppercase tracking-wider text-slate-600">Filters</span>
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-5 gap-2">
          <div className="relative">
            <Search className="h-3.5 w-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <Input value={filter.q} onChange={(e) => setFilter((p) => ({ ...p, q: e.target.value }))} placeholder="Search type, customer, assignee…" className="h-9 pl-8" data-testid="filter-search" />
          </div>
          <Select value={filter.status || '__all__'} onValueChange={(v) => setFilter((p) => ({ ...p, status: v === '__all__' ? '' : v }))}>
            <SelectTrigger className="h-9" data-testid="filter-status"><SelectValue placeholder="All statuses" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="__all__">All statuses</SelectItem>
              {STATUSES.map((s) => <SelectItem key={s} value={s}>{STATUS_META[s].label}</SelectItem>)}
            </SelectContent>
          </Select>
          <Select value={filter.request_type_id || '__all__'} onValueChange={(v) => setFilter((p) => ({ ...p, request_type_id: v === '__all__' ? '' : v }))}>
            <SelectTrigger className="h-9" data-testid="filter-type"><SelectValue placeholder="All types" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="__all__">All types</SelectItem>
              {types.map((t) => <SelectItem key={t.id} value={t.id}>{t.name}</SelectItem>)}
            </SelectContent>
          </Select>
          <Select value={filter.department || '__all__'} onValueChange={(v) => setFilter((p) => ({ ...p, department: v === '__all__' ? '' : v }))}>
            <SelectTrigger className="h-9" data-testid="filter-department"><SelectValue placeholder="All departments" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="__all__">All departments</SelectItem>
              {departments.map((d) => <SelectItem key={d} value={d}>{d}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* ── List ── */}
      <div className="bg-white border border-slate-200 rounded-2xl overflow-hidden">
        {loading ? (
          <div className="flex items-center justify-center h-32"><Loader2 className="h-6 w-6 animate-spin text-slate-400" /></div>
        ) : filtered.length === 0 ? (
          <div className="p-12 text-center">
            <Sparkles className="h-10 w-10 text-slate-300 mx-auto mb-3" />
            <p className="text-sm text-slate-500">No marketing requests match the current filters</p>
            <Button variant="outline" size="sm" className="mt-4" onClick={() => setOpenCreate(true)} data-testid="empty-create-btn">
              <Plus className="h-3.5 w-3.5 mr-1" /> Create the first request
            </Button>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm" data-testid="mr-table">
              <thead className="bg-slate-50 border-b">
                <tr>
                  {[
                    { label: 'Request Type', key: 'request' },
                    { label: 'Priority',     key: 'priority' },
                    { label: 'Customer',     key: 'customer' },
                    { label: 'Status',       key: 'status' },
                    { label: 'Assignee',     key: 'assignee' },
                    { label: 'Due',          key: 'due_date' },
                    { label: 'Updated',      key: 'updated_at' },
                  ].map((h) => {
                    const active = sort.key === h.key;
                    return (
                      <th
                        key={h.key}
                        onClick={() => toggleSort(h.key)}
                        className="text-left px-4 py-2.5 text-[10px] uppercase tracking-wider font-semibold text-slate-500 cursor-pointer select-none hover:text-slate-700"
                        data-testid={`mr-sort-${h.key}`}
                      >
                        <span className="inline-flex items-center gap-1">
                          {h.label}
                          {active ? (
                            sort.dir === 'asc'
                              ? <ArrowUp className="h-3 w-3" />
                              : <ArrowDown className="h-3 w-3" />
                          ) : (
                            <ArrowUp className="h-3 w-3 opacity-25" />
                          )}
                        </span>
                      </th>
                    );
                  })}
                  <th className="px-3"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filtered.map((r) => {
                  const customer = r.customer_name || (r.leads_summary && r.leads_summary[0] && r.leads_summary[0].name) || '—';
                  const typeLabel = r.request_type_name || r.custom_request_type || 'Untyped';
                  return (
                    <tr key={r.id} className="hover:bg-slate-50 cursor-pointer" onClick={() => setOpenId(r.id)} data-testid={`mr-row-${r.id}`}>
                      <td className="px-4 py-3">
                        <Badge variant="outline" className="bg-slate-50 font-medium">{typeLabel}</Badge>
                        {r.description && <div className="text-[11px] text-slate-400 truncate max-w-[280px] mt-1">{r.description}</div>}
                      </td>
                      <td className="px-4 py-3"><PriorityPill priority={r.priority} /></td>
                      <td className="px-4 py-3 font-medium text-slate-800 max-w-[260px] truncate">{customer}</td>
                      <td className="px-4 py-3"><StatusPill status={r.status} /></td>
                      <td className="px-4 py-3 text-slate-700">
                        <div>{r.assigned_to_name || <span className="text-slate-400 italic">Unassigned</span>}</div>
                        <div className="text-[10px] text-slate-400">{r.assigned_to_department}</div>
                      </td>
                      <td className="px-4 py-3 text-slate-600 whitespace-nowrap">{r.due_date || '—'}</td>
                      <td className="px-4 py-3 text-slate-500 text-xs whitespace-nowrap">{new Date(r.updated_at).toLocaleDateString()}</td>
                      <td className="px-3 py-3 text-slate-300"><ChevronRight className="h-4 w-4" /></td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {openCreate && (
        <CreateRequestModal
          types={types}
          leadOptions={leadOptions}
          departments={departments}
          onClose={() => setOpenCreate(false)}
          onCreated={(id) => { setOpenCreate(false); onChanged(); setOpenId(id); }}
        />
      )}

      {openId && (
        <RequestDetailDrawer
          requestId={openId}
          onClose={() => setOpenId('')}
          onChanged={onChanged}
          types={types}
          departments={departments}
          leadOptions={leadOptions}
        />
      )}
    </div>
  );
}

// ─── Lead linker (drawer sub-component) ───
function LeadLinker({ requestId, currentLeads, currentLeadIds, onChanged }) {
  const [editing, setEditing] = useState(false);
  const [allLeads, setAllLeads] = useState([]);
  const [leadSearch, setLeadSearch] = useState('');
  const [selected, setSelected] = useState(new Set(currentLeadIds));
  const [saving, setSaving] = useState(false);

  useEffect(() => { setSelected(new Set(currentLeadIds)); }, [currentLeadIds.join('|')]); // eslint-disable-line

  const startEdit = async () => {
    setEditing(true);
    if (allLeads.length === 0) {
      try {
        const { data } = await axios.get(`${API}/leads`, { params: { limit: 500 } });
        const raw = data;
        const leads = Array.isArray(raw) ? raw : (raw?.data || raw?.leads || raw?.items || []);
        setAllLeads(leads.map((x) => {
          const label = x.company || x.company_name || x.business_name || x.name || x.contact_name || x.hotel_name || 'Untitled Lead';
          const sub = x.contact_name || x.name || x.city || x.status || '';
          return { id: x.id, label: sub && sub !== label ? `${label} · ${sub}` : label };
        }));
      } catch { toast.error('Failed to load leads'); }
    }
  };

  const save = async () => {
    setSaving(true);
    try {
      await axios.put(`${API}/marketing-requests/${requestId}`, { lead_ids: Array.from(selected) });
      toast.success('Leads updated');
      setEditing(false);
      onChanged?.();
    } catch (e) {
      toast.error(e?.response?.data?.detail || 'Failed to update leads');
    } finally { setSaving(false); }
  };

  const filteredLeads = (() => {
    const q = leadSearch.trim().toLowerCase();
    return q ? allLeads.filter((l) => l.label.toLowerCase().includes(q)) : allLeads;
  })();

  return (
    <div>
      <div className="flex items-baseline justify-between mb-2">
        <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Linked Leads ({currentLeads.length})</p>
        <Button size="sm" variant="outline" onClick={editing ? () => setEditing(false) : startEdit} data-testid="edit-leads-btn">
          {editing ? 'Cancel' : currentLeads.length > 0 ? 'Edit' : 'Link leads'}
        </Button>
      </div>

      {!editing && (
        currentLeads.length === 0 ? (
          <p className="text-xs text-slate-400 italic">No leads linked yet</p>
        ) : (
          <div className="flex flex-wrap gap-2">
            {currentLeads.map((l) => (
              <Link key={l.id} to={`/leads/${l.id}`} className="px-3 py-1.5 rounded-lg bg-indigo-50 border border-indigo-200 text-xs text-indigo-700 hover:bg-indigo-100" data-testid={`drawer-lead-${l.id}`}>
                {l.name} {l.company_name && <span className="text-indigo-400">· {l.company_name}</span>}
              </Link>
            ))}
          </div>
        )
      )}

      {editing && (
        <div className="border border-slate-200 rounded-xl p-3 bg-slate-50/40 space-y-2">
          <Input
            value={leadSearch}
            onChange={(e) => setLeadSearch(e.target.value)}
            placeholder="Search leads by company or contact…"
            className="h-8"
            data-testid="drawer-lead-search"
          />
          <div className="border border-slate-200 rounded-md p-2 max-h-52 overflow-y-auto space-y-1 bg-white">
            {filteredLeads.slice(0, 100).map((l) => (
              <label key={l.id} className="flex items-center gap-2 text-sm cursor-pointer hover:bg-slate-50 rounded px-1 py-0.5">
                <input
                  type="checkbox"
                  checked={selected.has(l.id)}
                  onChange={(e) => {
                    setSelected((prev) => {
                      const next = new Set(prev);
                      if (e.target.checked) next.add(l.id); else next.delete(l.id);
                      return next;
                    });
                  }}
                  data-testid={`drawer-lead-check-${l.id}`}
                />
                <span className="truncate">{l.label}</span>
              </label>
            ))}
            {filteredLeads.length === 0 && <p className="text-xs text-slate-400 italic">No leads match</p>}
            {filteredLeads.length > 100 && (
              <p className="text-[10px] text-slate-400 italic pt-1">Showing first 100 of {filteredLeads.length}. Refine your search to see more.</p>
            )}
          </div>
          <div className="flex items-center justify-between">
            <span className="text-[11px] text-indigo-600">{selected.size} lead{selected.size === 1 ? '' : 's'} selected</span>
            <Button size="sm" onClick={save} disabled={saving} data-testid="save-leads-btn">
              {saving ? 'Saving…' : 'Save Links'}
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Create modal ───
const OTHER_TYPE_VALUE = '__other__';

function CreateRequestModal({ types, leadOptions, departments, onClose, onCreated }) {
  const [form, setForm] = useState({
    description: '', request_type_id: '',
    custom_request_type: '',
    priority: 'medium', due_date: '',
    assigned_to_department: 'Marketing', lead_id: '',
    reference_links: [],
    approval_type: 'internal',
  });
  const [linkLabel, setLinkLabel] = useState('');
  const [linkUrl, setLinkUrl] = useState('');
  const [leadSearch, setLeadSearch] = useState('');
  const [saving, setSaving] = useState(false);

  const isOther = form.request_type_id === OTHER_TYPE_VALUE;
  const selectedLead = leadOptions.find((l) => l.id === form.lead_id);

  const submit = async () => {
    if (!form.request_type_id) { toast.error('Please choose a request type'); return; }
    if (isOther && !form.custom_request_type.trim()) {
      toast.error('Please specify the request type');
      return;
    }
    setSaving(true);
    try {
      const payload = {
        description: form.description,
        priority: form.priority,
        due_date: form.due_date || null,
        assigned_to_department: form.assigned_to_department,
        lead_ids: form.lead_id ? [form.lead_id] : [],
        reference_links: form.reference_links,
        approval_type: form.approval_type,
      };
      if (isOther) {
        payload.custom_request_type = form.custom_request_type.trim();
      } else {
        payload.request_type_id = form.request_type_id;
      }
      const { data } = await axios.post(`${API}/marketing-requests`, payload);
      toast.success('Marketing request created');
      onCreated?.(data.id);
    } catch (e) {
      toast.error(e?.response?.data?.detail || 'Failed to create request');
    } finally { setSaving(false); }
  };

  const addLink = () => {
    if (!linkUrl.trim() || !linkLabel.trim()) return;
    setForm((p) => ({ ...p, reference_links: [...p.reference_links, { label: linkLabel, url: linkUrl, kind: 'reference' }] }));
    setLinkLabel(''); setLinkUrl('');
  };

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="max-w-3xl max-h-[92vh] overflow-y-auto" data-testid="mr-create-modal">
        <DialogHeader>
          <DialogTitle>New Marketing Request</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          {/* ── Primary action — pick a Request Type ── */}
          <div className="rounded-2xl border-2 border-indigo-200 bg-gradient-to-br from-indigo-50 via-white to-violet-50 p-4">
            <div className="flex items-center gap-2 mb-2">
              <Tag className="h-4 w-4 text-indigo-600" />
              <Label className="text-sm font-semibold text-indigo-900">Request Type *</Label>
            </div>
            <p className="text-xs text-slate-500 mb-3">Start by telling us what you need.</p>
            <Select
              value={form.request_type_id}
              onValueChange={(v) => setForm((p) => ({ ...p, request_type_id: v, custom_request_type: v === OTHER_TYPE_VALUE ? p.custom_request_type : '' }))}
            >
              <SelectTrigger className="h-11 text-base bg-white" data-testid="form-type">
                <SelectValue placeholder="Pick a request type to begin" />
              </SelectTrigger>
              <SelectContent>
                {types.map((t) => <SelectItem key={t.id} value={t.id}>{t.name}</SelectItem>)}
                <SelectItem value={OTHER_TYPE_VALUE}>Other (specify)</SelectItem>
              </SelectContent>
            </Select>
            {isOther && (
              <div className="mt-3">
                <Label className="text-xs font-medium text-indigo-900">Specify the type</Label>
                <Input
                  value={form.custom_request_type}
                  onChange={(e) => setForm((p) => ({ ...p, custom_request_type: e.target.value }))}
                  placeholder="e.g. Trade-show booth visuals"
                  className="mt-1 bg-white"
                  data-testid="form-custom-type"
                />
              </div>
            )}
          </div>

          {/* ── Description with bigger area for image refs / drive links / notes ── */}
          <div>
            <Label>Description / Notes</Label>
            <Textarea
              value={form.description}
              onChange={(e) => setForm((p) => ({ ...p, description: e.target.value }))}
              rows={8}
              className="min-h-[180px]"
              placeholder="Describe the request, paste reference image URLs, Google Drive links, brand guidelines, dimensions, deadlines…"
              data-testid="form-description"
            />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div>
              <Label>Priority</Label>
              <Select value={form.priority} onValueChange={(v) => setForm((p) => ({ ...p, priority: v }))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="low">Low</SelectItem>
                  <SelectItem value="medium">Medium</SelectItem>
                  <SelectItem value="high">High</SelectItem>
                  <SelectItem value="urgent">Urgent</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Due Date <span className="text-slate-400 font-normal">(optional)</span></Label>
              <Input type="date" value={form.due_date} onChange={(e) => setForm((p) => ({ ...p, due_date: e.target.value }))} data-testid="form-due-date" />
            </div>
            <div>
              <Label>Department</Label>
              <Select value={form.assigned_to_department} onValueChange={(v) => setForm((p) => ({ ...p, assigned_to_department: v }))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {departments.map((d) => <SelectItem key={d} value={d}>{d}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* Approval Type */}
          <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
            <Label className="text-xs font-semibold text-slate-700">Approval Type</Label>
            <p className="text-[11px] text-slate-500 mb-2">Does the client need to sign off, or is internal approval enough?</p>
            <div className="grid grid-cols-2 gap-2">
              {[
                { v: 'internal', label: 'Internal only',   hint: 'Marketing Manager approves' },
                { v: 'client',   label: 'Client required', hint: 'Share link, client picks option' },
              ].map((opt) => (
                <button
                  key={opt.v}
                  type="button"
                  onClick={() => setForm((p) => ({ ...p, approval_type: opt.v }))}
                  className={`text-left rounded-lg border-2 p-2.5 transition-all ${form.approval_type === opt.v ? 'border-indigo-500 bg-indigo-50 ring-2 ring-indigo-200' : 'border-slate-200 bg-white hover:border-slate-300'}`}
                  data-testid={`approval-type-${opt.v}`}
                >
                  <div className="text-xs font-semibold text-slate-800">{opt.label}</div>
                  <div className="text-[11px] text-slate-500 mt-0.5">{opt.hint}</div>
                </button>
              ))}
            </div>
          </div>

          {/* ── Single Lead picker ── */}
          <div>
            <Label>Linked Lead <span className="text-slate-400 font-normal">(optional)</span></Label>
            <div className="text-[11px] text-slate-400 mb-1">{leadOptions.length} leads · search and select one</div>
            <Input
              value={leadSearch}
              onChange={(e) => setLeadSearch(e.target.value)}
              placeholder="Search leads by company or contact…"
              className="h-9 mb-2"
              data-testid="form-lead-search"
            />
            <div className="border border-slate-200 rounded-md p-2 max-h-44 overflow-y-auto space-y-1">
              {(() => {
                const q = leadSearch.trim().toLowerCase();
                const base = q ? leadOptions.filter((l) => l.label.toLowerCase().includes(q)) : leadOptions;
                const shown = base.slice(0, 100);
                if (shown.length === 0) {
                  return <p className="text-xs text-slate-400 italic">{leadOptions.length === 0 ? 'No leads available' : 'No leads match your search'}</p>;
                }
                return (
                  <>
                    {shown.map((l) => (
                      <label
                        key={l.id}
                        className={`flex items-center gap-2 text-sm cursor-pointer rounded px-2 py-1 transition-colors ${form.lead_id === l.id ? 'bg-indigo-50 ring-1 ring-indigo-300' : 'hover:bg-slate-50'}`}
                      >
                        <input
                          type="radio"
                          name="mr-create-lead"
                          checked={form.lead_id === l.id}
                          onChange={() => setForm((p) => ({ ...p, lead_id: l.id }))}
                          data-testid={`form-lead-${l.id}`}
                        />
                        <span className="truncate">{l.label}</span>
                      </label>
                    ))}
                    {base.length > shown.length && (
                      <p className="text-[10px] text-slate-400 italic pt-1">Showing first 100 of {base.length}. Refine your search to see more.</p>
                    )}
                  </>
                );
              })()}
            </div>
            {selectedLead && (
              <div className="mt-2 flex items-center justify-between gap-3 px-3 py-2 rounded-lg bg-indigo-50 border border-indigo-200">
                <div className="min-w-0">
                  <div className="text-xs uppercase tracking-wider text-indigo-500 font-semibold">Lead ID</div>
                  <div className="font-mono text-sm font-bold text-indigo-900 truncate" data-testid="selected-lead-id">{selectedLead.id}</div>
                  <div className="text-xs text-indigo-700 truncate">{selectedLead.label}</div>
                </div>
                <button
                  type="button"
                  className="text-rose-500 hover:bg-rose-50 rounded p-1"
                  onClick={() => setForm((p) => ({ ...p, lead_id: '' }))}
                  data-testid="clear-selected-lead"
                  title="Remove lead"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              </div>
            )}
          </div>

          <div>
            <Label>Reference Links (Google Drive, etc.)</Label>
            <div className="space-y-1.5 mb-2">
              {form.reference_links.map((l, i) => (
                <div key={i} className="flex items-center gap-2 text-xs px-2 py-1 bg-slate-50 rounded">
                  <span className="font-medium">{l.label}</span>
                  <span className="text-slate-400 truncate flex-1">{l.url}</span>
                  <button onClick={() => setForm((p) => ({ ...p, reference_links: p.reference_links.filter((_, idx) => idx !== i) }))}><X className="h-3 w-3" /></button>
                </div>
              ))}
            </div>
            <div className="flex gap-2">
              <Input className="flex-1" placeholder="Label" value={linkLabel} onChange={(e) => setLinkLabel(e.target.value)} />
              <Input className="flex-[2]" placeholder="https://drive.google.com/..." value={linkUrl} onChange={(e) => setLinkUrl(e.target.value)} />
              <Button size="sm" type="button" variant="outline" onClick={addLink} disabled={!linkUrl.trim()}>Add</Button>
            </div>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button onClick={submit} disabled={saving} className="bg-indigo-600 hover:bg-indigo-700" data-testid="form-submit-btn">
            {saving ? 'Creating…' : 'Create Request'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
