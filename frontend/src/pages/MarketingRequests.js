/* eslint-disable no-restricted-globals */
import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { Link, useNavigate } from 'react-router-dom';
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
  const [showAdd, setShowAdd] = useState(false);
  const [label, setLabel] = useState('');
  const [notes, setNotes] = useState('');
  const [imgList, setImgList] = useState([]); // array of image URLs (uploaded or pasted)
  const [imgInput, setImgInput] = useState('');
  const [adding, setAdding] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [previewOption, setPreviewOption] = useState(null);
  const [commentText, setCommentText] = useState('');
  const [posting, setPosting] = useState(false);
  const fileRef = React.useRef(null);

  const options = (request.design_options || []).slice().sort((a, b) => (a.version || 0) - (b.version || 0));

  const resetAdd = () => { setLabel(''); setNotes(''); setImgList([]); setImgInput(''); setShowAdd(false); };

  const uploadFile = async (files) => {
    if (!files?.length) return;
    setUploading(true);
    try {
      for (const f of Array.from(files)) {
        const fd = new FormData();
        fd.append('file', f);
        const { data } = await axios.post(`${API}/marketing-requests/${requestId}/upload-image`, fd, {
          headers: { 'Content-Type': 'multipart/form-data' },
        });
        setImgList((p) => [...p, data.url]);
      }
    } catch (e) {
      toast.error(e?.response?.data?.detail || 'Upload failed');
    } finally { setUploading(false); }
  };

  const addOption = async () => {
    if (!label.trim() && imgList.length === 0) { toast.error('Add a label or at least one image'); return; }
    setAdding(true);
    try {
      await axios.post(`${API}/marketing-requests/${requestId}/options`, {
        label: label.trim() || undefined,
        notes: notes.trim() || undefined,
        image_urls: imgList,
      });
      resetAdd();
      onChanged?.();
    } catch (e) {
      toast.error(e?.response?.data?.detail || 'Failed to add option');
    } finally { setAdding(false); }
  };

  const selectOption = async (optionId) => {
    try {
      await axios.post(`${API}/marketing-requests/${requestId}/options/${optionId}/select`);
      onChanged?.();
      // Refresh preview with updated option
      setPreviewOption((p) => p && p.id === optionId ? { ...p, selected: true } : p);
    } catch { toast.error('Failed to select option'); }
  };

  const postComment = async () => {
    if (!previewOption || !commentText.trim()) return;
    setPosting(true);
    try {
      await axios.post(`${API}/marketing-requests/${requestId}/options/${previewOption.id}/comments`, { text: commentText.trim() });
      setCommentText('');
      onChanged?.();
      // Fetch latest to refresh the comments on the preview
      const { data } = await axios.get(`${API}/marketing-requests/${requestId}`);
      const fresh = (data.design_options || []).find((o) => o.id === previewOption.id);
      if (fresh) setPreviewOption(fresh);
    } catch { toast.error('Failed to post comment'); }
    finally { setPosting(false); }
  };

  const removeImg = (url) => setImgList((p) => p.filter((u) => u !== url));

  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-4" data-testid="mr-design-options">
      <div className="flex items-center justify-between mb-3">
        <div>
          <h3 className="text-sm font-semibold text-slate-800 flex items-center gap-2">
            <Sparkles className="h-4 w-4 text-indigo-500" />
            Design Options <span className="text-slate-400 font-normal">({options.length})</span>
          </h3>
          <p className="text-[11px] text-slate-500">Upload multiple versions as a grid. Click any tile to preview, comment, or select.</p>
        </div>
      </div>

      {/* ── Grid of option tiles + a "+" tile to add ── */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
        {options.map((o) => {
          const cover = (o.image_urls || [])[0] || (o.files || [])[0]?.url;
          return (
            <button
              key={o.id}
              type="button"
              onClick={() => { setPreviewOption(o); setCommentText(''); }}
              className={`group relative aspect-square rounded-xl overflow-hidden border-2 transition-all text-left ${o.selected ? 'border-emerald-400 ring-2 ring-emerald-200' : 'border-slate-200 hover:border-indigo-400 hover:shadow-md'}`}
              data-testid={`mr-option-tile-${o.id}`}
            >
              {cover ? (
                <img src={cover} alt={o.label} className="w-full h-full object-cover" onError={(e) => { e.currentTarget.style.display = 'none'; }} />
              ) : (
                <div className="w-full h-full bg-gradient-to-br from-slate-100 to-slate-200 flex items-center justify-center">
                  <Sparkles className="h-8 w-8 text-slate-300" />
                </div>
              )}
              <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/70 to-transparent p-2">
                <div className="flex items-center gap-1 text-[10px] text-white/90 font-mono">v{o.version}</div>
                <div className="text-xs font-semibold text-white truncate">{o.label}</div>
              </div>
              {o.selected && (
                <div className="absolute top-2 right-2 bg-emerald-500 text-white rounded-full p-1">
                  <CheckCircle2 className="h-3.5 w-3.5" />
                </div>
              )}
              {(o.comments || []).length > 0 && (
                <div className="absolute top-2 left-2 bg-black/50 text-white rounded-full px-1.5 py-0.5 text-[10px] flex items-center gap-1">
                  <MessageSquare className="h-2.5 w-2.5" />{o.comments.length}
                </div>
              )}
            </button>
          );
        })}

        {/* + tile */}
        <button
          type="button"
          onClick={() => setShowAdd(true)}
          className="group aspect-square rounded-xl border-2 border-dashed border-indigo-300 bg-indigo-50/40 hover:bg-indigo-50 hover:border-indigo-500 flex flex-col items-center justify-center transition-all"
          data-testid="mr-option-add-tile"
        >
          <div className="h-12 w-12 rounded-full bg-indigo-100 group-hover:bg-indigo-200 flex items-center justify-center transition-colors">
            <Plus className="h-6 w-6 text-indigo-600" />
          </div>
          <p className="text-xs font-semibold text-indigo-700 mt-2">Add Option</p>
          <p className="text-[10px] text-slate-500 mt-0.5">Upload + comment</p>
        </button>
      </div>

      {/* ── Add modal ── */}
      <Dialog open={showAdd} onOpenChange={(o) => { if (!o) resetAdd(); else setShowAdd(true); }}>
        <DialogContent className="max-w-2xl">
          <DialogHeader><DialogTitle>Add Design Option</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div>
              <Label className="text-xs">Label <span className="text-slate-400 font-normal">(optional)</span></Label>
              <Input placeholder="e.g. Modern Blue" value={label} onChange={(e) => setLabel(e.target.value)} className="h-10" data-testid="mr-add-label" />
            </div>

            <div>
              <Label className="text-xs">Images</Label>
              <div className="grid grid-cols-3 sm:grid-cols-4 gap-2 mt-1">
                {imgList.map((u, i) => (
                  <div key={i} className="relative aspect-square rounded-lg overflow-hidden border border-slate-200 group bg-slate-100">
                    <img src={u} alt="" className="w-full h-full object-cover" onError={(e) => { e.currentTarget.style.display = 'none'; }} />
                    <button type="button" onClick={() => removeImg(u)} className="absolute top-1 right-1 bg-rose-500 hover:bg-rose-600 text-white rounded-full p-1 opacity-0 group-hover:opacity-100 transition-opacity">
                      <X className="h-3 w-3" />
                    </button>
                  </div>
                ))}
                {/* Add-image tile */}
                <button
                  type="button"
                  onClick={() => fileRef.current?.click()}
                  disabled={uploading}
                  className="aspect-square rounded-lg border-2 border-dashed border-slate-300 hover:border-indigo-500 hover:bg-indigo-50/40 flex flex-col items-center justify-center text-slate-500 hover:text-indigo-600 transition-all"
                  data-testid="mr-add-image-btn"
                >
                  {uploading ? <Loader2 className="h-5 w-5 animate-spin" /> : <Plus className="h-5 w-5" />}
                  <span className="text-[10px] mt-1">{uploading ? 'Uploading…' : 'Upload'}</span>
                </button>
                <input ref={fileRef} type="file" accept="image/*" multiple className="hidden" onChange={(e) => { uploadFile(e.target.files); e.target.value = ''; }} />
              </div>
              <div className="flex gap-2 mt-2">
                <Input
                  placeholder="…or paste an image URL + Enter"
                  value={imgInput}
                  onChange={(e) => setImgInput(e.target.value)}
                  onKeyDown={(e) => { if (e.key === 'Enter' && imgInput.trim()) { e.preventDefault(); setImgList((p) => [...p, imgInput.trim()]); setImgInput(''); } }}
                  className="h-9 flex-1"
                />
                <Button type="button" size="sm" variant="outline" onClick={() => { if (imgInput.trim()) { setImgList((p) => [...p, imgInput.trim()]); setImgInput(''); } }} disabled={!imgInput.trim()}>Add URL</Button>
              </div>
            </div>

            <div>
              <Label className="text-xs">Comments / Notes <span className="text-slate-400 font-normal">(optional)</span></Label>
              <Textarea rows={3} placeholder="e.g. Bold sans-serif, emerald accent, 2-color print." value={notes} onChange={(e) => setNotes(e.target.value)} data-testid="mr-add-notes" />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={resetAdd}>Cancel</Button>
            <Button onClick={addOption} disabled={adding || uploading} className="bg-indigo-600 hover:bg-indigo-700" data-testid="mr-add-save">
              {adding ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" />Saving…</> : <><Plus className="h-3.5 w-3.5 mr-1" />Add Option</>}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Preview modal ── */}
      <Dialog open={!!previewOption} onOpenChange={(o) => { if (!o) { setPreviewOption(null); setCommentText(''); } }}>
        <DialogContent className="max-w-3xl max-h-[92vh] overflow-y-auto">
          {previewOption && (
            <>
              <DialogHeader>
                <div className="flex items-center gap-2">
                  <Badge variant="outline" className="bg-indigo-50 text-indigo-700 border-indigo-200 font-mono">v{previewOption.version}</Badge>
                  <DialogTitle>{previewOption.label}</DialogTitle>
                  {previewOption.selected && <Badge className="bg-emerald-600 text-white"><CheckCircle2 className="h-3 w-3 mr-1" />Selected</Badge>}
                </div>
              </DialogHeader>

              {(previewOption.image_urls || []).length > 0 && (
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                  {previewOption.image_urls.map((u, i) => (
                    <a key={i} href={u} target="_blank" rel="noreferrer" className="block rounded-lg overflow-hidden border border-slate-200 aspect-square bg-slate-50 hover:ring-2 hover:ring-indigo-300">
                      <img src={u} alt={`v${previewOption.version}-${i}`} className="w-full h-full object-cover" onError={(e) => { e.currentTarget.style.display = 'none'; }} />
                    </a>
                  ))}
                </div>
              )}
              {(previewOption.files || []).length > 0 && (
                <div className="flex gap-2 flex-wrap">
                  {previewOption.files.map((f) => (
                    <a key={f.id} href={f.url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 px-2 py-1 rounded bg-slate-50 border border-slate-200 text-xs hover:bg-slate-100">
                      <Paperclip className="h-3 w-3" />{f.name}
                    </a>
                  ))}
                </div>
              )}

              {previewOption.notes && (
                <div className="rounded-lg bg-slate-50 border border-slate-200 p-3">
                  <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-500 mb-1">Notes</p>
                  <p className="text-sm text-slate-700 whitespace-pre-wrap">{previewOption.notes}</p>
                </div>
              )}

              {/* Comments */}
              <div>
                <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-500 mb-2">Inline comments</p>
                <div className="space-y-2 mb-2 max-h-60 overflow-y-auto">
                  {(previewOption.comments || []).length === 0 ? (
                    <p className="text-xs text-slate-400 italic">No comments yet — be the first.</p>
                  ) : (
                    previewOption.comments.map((c) => (
                      <div key={c.id} className="bg-slate-50 rounded px-3 py-2 text-sm">
                        <div className="flex items-center justify-between mb-0.5">
                          <span className="font-medium text-slate-700">{c.by_name || 'User'}</span>
                          <span className="text-[10px] text-slate-400">{new Date(c.at).toLocaleString()}</span>
                        </div>
                        <p className="text-slate-600 whitespace-pre-wrap">{c.text}</p>
                      </div>
                    ))
                  )}
                </div>
                <div className="flex gap-2">
                  <Input
                    className="h-9"
                    placeholder="Write a comment on this option…"
                    value={commentText}
                    onChange={(e) => setCommentText(e.target.value)}
                    onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); postComment(); } }}
                    data-testid="mr-preview-comment-input"
                  />
                  <Button size="sm" onClick={postComment} disabled={!commentText.trim() || posting}>Post</Button>
                </div>
              </div>

              <DialogFooter>
                <Button variant="outline" onClick={() => { setPreviewOption(null); setCommentText(''); }}>Close</Button>
                {!previewOption.selected && (
                  <Button onClick={() => selectOption(previewOption.id)} className="bg-emerald-600 hover:bg-emerald-700" data-testid="mr-preview-select">
                    <CheckCircle2 className="h-4 w-4 mr-1" />Select this option
                  </Button>
                )}
              </DialogFooter>
            </>
          )}
        </DialogContent>
      </Dialog>
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

export function RequestDetailContent({ requestId, onChanged, types, departments, leadOptions }) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [comment, setComment] = useState('');
  const [deptUsers, setDeptUsers] = useState([]);
  const [linkLabel, setLinkLabel] = useState('');
  const [linkUrl, setLinkUrl] = useState('');
  const [linkKind, setLinkKind] = useState('output');

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
      <div className="flex items-center justify-center h-40"><Loader2 className="w-6 h-6 animate-spin text-slate-400" /></div>
    );
  }

  const allFiles = [...(data.input_files || []), ...(data.output_files || [])];
  const allLinks = [...(data.reference_links || []), ...(data.output_links || [])];

  return (
    <div className="space-y-4" data-testid="mr-detail-content">
      {/* ── Title strip ── */}
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h1 className="text-xl sm:text-2xl font-bold text-slate-900 flex items-center gap-2">
            <Sparkles className="h-5 w-5 text-indigo-500" />
            {data.title}
          </h1>
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
    </div>
  );
}

// ──────────────────────────────────────────────────────────────────────────
// Main page — list + tiles + filter + create modal
// ──────────────────────────────────────────────────────────────────────────

export default function MarketingRequests() {
  const navigate = useNavigate();
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [summary, setSummary] = useState({});
  const [types, setTypes] = useState([]);
  const [departments, setDepartments] = useState([]);
  const [filter, setFilter] = useState({ status: '', request_type_id: '', department: '', q: '' });
  const [sort, setSort] = useState({ key: 'updated_at', dir: 'desc' });
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
        <Button onClick={() => navigate('/marketing-requests/new')} className="bg-indigo-600 hover:bg-indigo-700" data-testid="open-create-btn">
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
            <Button variant="outline" size="sm" className="mt-4" onClick={() => navigate('/marketing-requests/new')} data-testid="empty-create-btn">
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
                    <tr key={r.id} className="hover:bg-slate-50 cursor-pointer" onClick={() => navigate(`/marketing-requests/${r.id}`)} data-testid={`mr-row-${r.id}`}>
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

      {/* Detail view is now a dedicated route at /marketing-requests/:id */}
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

