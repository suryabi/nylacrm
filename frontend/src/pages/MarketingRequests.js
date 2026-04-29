/* eslint-disable no-restricted-globals */
import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { useSearchParams, Link } from 'react-router-dom';
import axios from 'axios';
import { toast } from 'sonner';
import {
  Sparkles, Plus, Filter, Search, Loader2, Calendar, User, Tag,
  AlertTriangle, CheckCircle2, Clock, Eye, X, Link as LinkIcon, Paperclip,
  ArrowRight, ChevronRight, MessageSquare, Trash2, ExternalLink,
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
  created:     { label: 'Created',     icon: Clock,         tone: 'bg-slate-100 text-slate-700 border-slate-200' },
  assigned:    { label: 'Assigned',    icon: User,          tone: 'bg-sky-100 text-sky-700 border-sky-200' },
  in_progress: { label: 'In Progress', icon: ArrowRight,    tone: 'bg-amber-100 text-amber-700 border-amber-200' },
  review:      { label: 'Review',      icon: Eye,           tone: 'bg-violet-100 text-violet-700 border-violet-200' },
  completed:   { label: 'Completed',   icon: CheckCircle2,  tone: 'bg-emerald-100 text-emerald-700 border-emerald-200' },
  rejected:    { label: 'Rejected',    icon: X,             tone: 'bg-rose-100 text-rose-700 border-rose-200' },
};
const STATUSES = Object.keys(STATUS_META);

const PRIORITY_META = {
  low:    { tone: 'bg-slate-100 text-slate-600' },
  medium: { tone: 'bg-sky-100 text-sky-700' },
  high:   { tone: 'bg-amber-100 text-amber-800' },
  urgent: { tone: 'bg-rose-100 text-rose-800' },
};

function StatusPill({ status }) {
  const m = STATUS_META[status] || STATUS_META.created;
  const Icon = m.icon;
  return (
    <Badge variant="outline" className={`gap-1 font-medium ${m.tone}`} data-testid={`pill-status-${status}`}>
      <Icon className="h-3 w-3" />
      {m.label}
    </Badge>
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

        {/* ── Lifecycle controls ── */}
        <div className="border border-slate-200 rounded-xl p-4 bg-slate-50/50">
          <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground mb-2">Lifecycle</p>
          <div className="flex flex-wrap gap-2">
            {STATUSES.map((s) => {
              const m = STATUS_META[s];
              const Icon = m.icon;
              const active = data.status === s;
              return (
                <Button
                  key={s}
                  size="sm"
                  variant={active ? 'default' : 'outline'}
                  onClick={() => {
                    if (s === 'rejected') {
                      const reason = prompt('Rejection reason:');
                      if (reason) updateField({ status: 'rejected', rejection_reason: reason });
                    } else {
                      updateField({ status: s });
                    }
                  }}
                  className={active ? '' : 'bg-white'}
                  disabled={saving}
                  data-testid={`btn-status-${s}`}
                >
                  <Icon className="h-3.5 w-3.5 mr-1.5" />
                  {m.label}
                </Button>
              );
            })}
          </div>
          {data.rejection_reason && (
            <div className="mt-3 px-3 py-2 bg-rose-50 border border-rose-200 rounded-md text-xs text-rose-700">
              <strong>Rejection reason:</strong> {data.rejection_reason}
            </div>
          )}
        </div>

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
    if (!filter.q) return rows;
    const q = filter.q.toLowerCase();
    return rows.filter((r) =>
      (r.title || '').toLowerCase().includes(q) ||
      (r.description || '').toLowerCase().includes(q) ||
      (r.request_type_name || '').toLowerCase().includes(q) ||
      (r.assigned_to_name || '').toLowerCase().includes(q)
    );
  }, [rows, filter.q]);

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
            <Input value={filter.q} onChange={(e) => setFilter((p) => ({ ...p, q: e.target.value }))} placeholder="Search title, type, assignee…" className="h-9 pl-8" data-testid="filter-search" />
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
                  {['Title', 'Type', 'Status', 'Priority', 'Assignee', 'Due', 'Updated'].map((h) => (
                    <th key={h} className="text-left px-4 py-2.5 text-[10px] uppercase tracking-wider font-semibold text-slate-500">{h}</th>
                  ))}
                  <th className="px-3"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filtered.map((r) => (
                  <tr key={r.id} className="hover:bg-slate-50 cursor-pointer" onClick={() => setOpenId(r.id)} data-testid={`mr-row-${r.id}`}>
                    <td className="px-4 py-3">
                      <div className="font-medium text-slate-800 truncate max-w-[280px]">{r.title}</div>
                      {r.description && <div className="text-[11px] text-slate-400 truncate max-w-[280px]">{r.description}</div>}
                    </td>
                    <td className="px-4 py-3">
                      {r.request_type_name && <Badge variant="outline" className="bg-slate-50">{r.request_type_name}</Badge>}
                    </td>
                    <td className="px-4 py-3"><StatusPill status={r.status} /></td>
                    <td className="px-4 py-3"><PriorityPill priority={r.priority} /></td>
                    <td className="px-4 py-3 text-slate-700">
                      <div>{r.assigned_to_name || <span className="text-slate-400 italic">Unassigned</span>}</div>
                      <div className="text-[10px] text-slate-400">{r.assigned_to_department}</div>
                    </td>
                    <td className="px-4 py-3 text-slate-600 whitespace-nowrap">{r.due_date || '—'}</td>
                    <td className="px-4 py-3 text-slate-500 text-xs whitespace-nowrap">{new Date(r.updated_at).toLocaleDateString()}</td>
                    <td className="px-3 py-3 text-slate-300"><ChevronRight className="h-4 w-4" /></td>
                  </tr>
                ))}
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
function CreateRequestModal({ types, leadOptions, departments, onClose, onCreated }) {
  const [form, setForm] = useState({
    title: '', description: '', request_type_id: '',
    priority: 'medium', due_date: '',
    assigned_to_department: 'Marketing', lead_ids: [],
    reference_links: [],
  });
  const [linkLabel, setLinkLabel] = useState('');
  const [linkUrl, setLinkUrl] = useState('');
  const [leadSearch, setLeadSearch] = useState('');
  const [saving, setSaving] = useState(false);

  const submit = async () => {
    if (!form.title.trim() || !form.request_type_id) {
      toast.error('Title and Request Type are required');
      return;
    }
    setSaving(true);
    try {
      const { data } = await axios.post(`${API}/marketing-requests`, form);
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
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto" data-testid="mr-create-modal">
        <DialogHeader>
          <DialogTitle>New Marketing Request</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <div>
            <Label>Title *</Label>
            <Input value={form.title} onChange={(e) => setForm((p) => ({ ...p, title: e.target.value }))} placeholder="e.g. Need a new neck tag for Hyatt order" data-testid="form-title" />
          </div>
          <div>
            <Label>Description</Label>
            <Textarea value={form.description} onChange={(e) => setForm((p) => ({ ...p, description: e.target.value }))} rows={3} placeholder="Add context, dimensions, brand guidelines…" data-testid="form-description" />
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div>
              <Label>Request Type *</Label>
              <Select value={form.request_type_id} onValueChange={(v) => setForm((p) => ({ ...p, request_type_id: v }))}>
                <SelectTrigger data-testid="form-type"><SelectValue placeholder="Pick a type" /></SelectTrigger>
                <SelectContent>
                  {types.map((t) => <SelectItem key={t.id} value={t.id}>{t.name}</SelectItem>)}
                  {types.length === 0 && <div className="px-3 py-2 text-xs text-slate-400">No types yet — ask admin to add some under Tenant Settings → Masters</div>}
                </SelectContent>
              </Select>
            </div>
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
              <Label>Due Date</Label>
              <Input type="date" value={form.due_date} onChange={(e) => setForm((p) => ({ ...p, due_date: e.target.value }))} data-testid="form-due-date" />
            </div>
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
          <div>
            <Label>Linked Leads (optional)</Label>
            <div className="text-[11px] text-slate-400 mb-1">{leadOptions.length} leads · search then tick to link</div>
            <Input
              value={leadSearch}
              onChange={(e) => setLeadSearch(e.target.value)}
              placeholder="Search leads by company or contact…"
              className="h-8 mb-1.5"
              data-testid="form-lead-search"
            />
            <div className="border border-slate-200 rounded-md p-2 max-h-40 overflow-y-auto space-y-1">
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
                      <label key={l.id} className="flex items-center gap-2 text-sm cursor-pointer hover:bg-slate-50 rounded px-1 py-0.5">
                        <input
                          type="checkbox"
                          checked={form.lead_ids.includes(l.id)}
                          onChange={(e) => {
                            setForm((p) => ({
                              ...p,
                              lead_ids: e.target.checked
                                ? [...p.lead_ids, l.id]
                                : p.lead_ids.filter((x) => x !== l.id),
                            }));
                          }}
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
            {form.lead_ids.length > 0 && (
              <p className="text-[11px] text-indigo-600 mt-1">{form.lead_ids.length} lead{form.lead_ids.length === 1 ? '' : 's'} selected</p>
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
