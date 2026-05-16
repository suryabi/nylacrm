import React, { useEffect, useState, useRef, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import axios from 'axios';
import { format, parseISO, isValid, isPast, isToday } from 'date-fns';
import { Button } from '../components/ui/button';
import { Card, CardContent } from '../components/ui/card';
import { Input } from '../components/ui/input';
import { Label } from '../components/ui/label';
import { Textarea } from '../components/ui/textarea';
import { Badge } from '../components/ui/badge';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from '../components/ui/dialog';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '../components/ui/select';
import {
  ArrowLeft, Sparkles, Send, MessageSquare, Plus, Upload, FileText, X,
  Loader2, ExternalLink, ChevronRight, Truck, AlertTriangle, Clock,
  Tag, Calendar, Building2, User, Image as ImageIcon, Link as LinkIcon,
} from 'lucide-react';
import { toast } from 'sonner';
import { useAuth } from '../context/AuthContext';

const API = `${process.env.REACT_APP_BACKEND_URL}/api`;
const HEAD = () => {
  const t = localStorage.getItem('token');
  return t ? { Authorization: `Bearer ${t}` } : {};
};

// Mirrors the styles in MarketingRequests.js list view
const STATUS_STYLES = {
  submitted:               { label: 'Submitted',           color: 'text-slate-700',   bg: 'bg-slate-100',   ring: 'border-slate-300' },
  inputs_needed:           { label: 'Inputs Needed',       color: 'text-amber-700',   bg: 'bg-amber-100',   ring: 'border-amber-300' },
  in_progress:             { label: 'In Progress',         color: 'text-blue-700',    bg: 'bg-blue-100',    ring: 'border-blue-300' },
  in_review:               { label: 'In Review',           color: 'text-violet-700',  bg: 'bg-violet-100',  ring: 'border-violet-300' },
  approved_internal:       { label: 'Approved (Internal)', color: 'text-indigo-700',  bg: 'bg-indigo-100',  ring: 'border-indigo-300' },
  final_approved:          { label: 'Final Approved',      color: 'text-emerald-700', bg: 'bg-emerald-100', ring: 'border-emerald-300' },
  production_in_progress:  { label: 'Production',          color: 'text-orange-700',  bg: 'bg-orange-100',  ring: 'border-orange-300' },
  production_completed:    { label: 'Completed',           color: 'text-green-700',   bg: 'bg-green-100',   ring: 'border-green-300' },
};

const NEXT_TRANSITIONS = {
  submitted: ['inputs_needed', 'in_progress'],
  inputs_needed: ['in_progress', 'submitted'],
  in_progress: ['inputs_needed', 'in_review'],
  in_review: ['in_progress', 'approved_internal'],
  approved_internal: ['in_progress', 'final_approved'],
  final_approved: [],
  production_in_progress: ['production_completed'],
  production_completed: [],
};

const isOverdueDate = (s) => { if (!s) return false; try { const d = parseISO(s); return isValid(d) && isPast(d) && !isToday(d); } catch { return false; } };
const fmtDate = (s, f = 'dd MMM yyyy') => { try { return format(parseISO(s), f); } catch { return s || '—'; } };
const getInitials = (name) => {
  if (!name) return 'NA';
  const parts = name.trim().split(' ').filter(Boolean);
  if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase();
  return name.slice(0, 2).toUpperCase();
};

const FileChip = ({ f }) => (
  <a
    href={`${API}/marketing-requests/files/${f.id}`}
    target="_blank" rel="noopener noreferrer"
    className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-md border border-emerald-100 bg-white text-slate-700 hover:bg-emerald-50/60 text-xs transition-colors"
    data-testid={`file-chip-${f.id}`}
  >
    <FileText className="h-3.5 w-3.5 text-emerald-600" /> {f.filename}
  </a>
);

export default function MarketingRequestDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { user } = useAuth();
  const [req, setReq] = useState(null);
  const [loading, setLoading] = useState(true);
  const [comment, setComment] = useState('');

  // Version dialog state
  const [showVersion, setShowVersion] = useState(false);
  const [versionName, setVersionName] = useState('');
  const [versionFiles, setVersionFiles] = useState([]);
  const [versionLinks, setVersionLinks] = useState([]);
  const [newVLink, setNewVLink] = useState('');
  const [versionComment, setVersionComment] = useState('');
  const [savingVersion, setSavingVersion] = useState(false);
  const versionFileInput = useRef(null);

  // Production submit dialog state
  const [showProd, setShowProd] = useState(false);
  const [departments, setDepartments] = useState([]);
  const [prodForm, setProdForm] = useState({
    quantity_required: '', requested_production_date: '',
    assigned_delivery_department_id: '', production_notes: '',
  });
  const [savingProd, setSavingProd] = useState(false);

  const fetchReq = useCallback(async () => {
    setLoading(true);
    try {
      const { data } = await axios.get(`${API}/marketing-requests/${id}`, { headers: HEAD() });
      setReq(data);
    } catch {
      toast.error('Failed to load request');
      navigate('/marketing-requests');
    } finally { setLoading(false); }
  }, [id, navigate]);
  useEffect(() => { fetchReq(); }, [fetchReq]);

  const userDepts = (() => {
    const d = user?.department;
    if (Array.isArray(d)) return d.map(x => String(x || '').toLowerCase()).join(' ');
    return String(d || '').toLowerCase();
  })();
  const isInAssignedDept = req && userDepts.includes((req.assigned_department_name || '').toLowerCase());
  const isInDeliveryDept = req?.production && userDepts.includes((req.production.assigned_delivery_department_name || '').toLowerCase());
  const isRequestor = req && user?.id === req.created_by;

  const changeStatus = async (status_key, commentText) => {
    try {
      await axios.post(`${API}/marketing-requests/${id}/status`, { status_key, comment: commentText || null }, { headers: HEAD() });
      toast.success(`Status → ${STATUS_STYLES[status_key]?.label || status_key}`);
      fetchReq();
    } catch (e) { toast.error(e.response?.data?.detail || 'Status change failed'); }
  };

  const addComment = async () => {
    if (!comment.trim()) return;
    try {
      await axios.post(`${API}/marketing-requests/${id}/comments`, { text: comment.trim() }, { headers: HEAD() });
      setComment('');
      fetchReq();
    } catch (e) { toast.error(e.response?.data?.detail || 'Failed to add comment'); }
  };

  const uploadFile = async (file) => {
    const fd = new FormData();
    fd.append('file', file);
    const res = await axios.post(`${API}/marketing-requests/upload`, fd, {
      headers: { ...HEAD(), 'Content-Type': 'multipart/form-data' },
    });
    return res.data;
  };
  const handleVersionFiles = async (e) => {
    const files = Array.from(e.target.files || []);
    for (const f of files) {
      try { const up = await uploadFile(f); setVersionFiles(p => [...p, up]); }
      catch { toast.error(`Failed to upload ${f.name}`); }
    }
    if (versionFileInput.current) versionFileInput.current.value = '';
  };
  const addVersion = async () => {
    if (!versionName.trim()) { toast.error('Version name required'); return; }
    setSavingVersion(true);
    try {
      await axios.post(`${API}/marketing-requests/${id}/versions`, {
        version_name: versionName.trim(),
        file_ids: versionFiles.map(f => f.id),
        links: versionLinks,
        comments: versionComment || null,
      }, { headers: HEAD() });
      toast.success(`Version "${versionName}" added`);
      setShowVersion(false);
      setVersionName(''); setVersionFiles([]); setVersionLinks([]); setVersionComment('');
      fetchReq();
    } catch (e) { toast.error(e.response?.data?.detail || 'Failed to add version'); }
    finally { setSavingVersion(false); }
  };

  const openProdDialog = async () => {
    try {
      const { data } = await axios.get(`${API}/master-departments?kind=delivery`, { headers: HEAD() });
      let depts = data?.departments || [];
      if (!depts.length) {
        const all = await axios.get(`${API}/master-departments`, { headers: HEAD() });
        depts = all.data?.departments || [];
      }
      setDepartments(depts);
      setShowProd(true);
    } catch { toast.error('Failed to load delivery departments'); }
  };
  const submitProduction = async () => {
    if (!prodForm.quantity_required || !prodForm.requested_production_date || !prodForm.assigned_delivery_department_id) {
      toast.error('Fill all required production fields'); return;
    }
    setSavingProd(true);
    try {
      await axios.post(`${API}/marketing-requests/${id}/production-submit`, {
        quantity_required: parseInt(prodForm.quantity_required),
        requested_production_date: prodForm.requested_production_date,
        assigned_delivery_department_id: prodForm.assigned_delivery_department_id,
        production_notes: prodForm.production_notes || null,
        final_approved_file_ids: [],
        final_approved_links: [],
      }, { headers: HEAD() });
      toast.success('Submitted for production');
      setShowProd(false);
      fetchReq();
    } catch (e) { toast.error(e.response?.data?.detail || 'Production submit failed'); }
    finally { setSavingProd(false); }
  };

  if (loading) return <div className="flex items-center justify-center h-96"><Loader2 className="h-8 w-8 animate-spin text-emerald-600" /></div>;
  if (!req) return null;

  const st = STATUS_STYLES[req.status_key] || STATUS_STYLES.submitted;
  const allowedNext = NEXT_TRANSITIONS[req.status_key] || [];
  const overdue = req.requested_due_date && req.status_key !== 'production_completed' && isOverdueDate(req.requested_due_date);

  return (
    <div className="p-6 max-w-6xl mx-auto space-y-6" data-testid="mr-detail-page">
      {/* Back link */}
      <div>
        <Button variant="ghost" size="sm" onClick={() => navigate('/marketing-requests')} data-testid="mr-back-btn">
          <ArrowLeft className="h-4 w-4 mr-2" /> Back to Marketing Requests
        </Button>
      </div>

      {/* Hero header — Request Type is the prominent element */}
      <Card className="border border-emerald-100/60 rounded-xl shadow-[0_2px_8px_rgba(6,95,70,0.04)] overflow-hidden">
        <CardContent className="p-6">
          <div className="flex items-center gap-2 mb-2">
            <span className="inline-flex items-center gap-1 text-[11px] text-emerald-700 bg-emerald-50 border border-emerald-100 px-1.5 py-0.5 rounded font-mono">
              <Tag className="h-3 w-3" /> {req.request_number}
            </span>
            <Badge variant="outline" className={`${st.bg} ${st.color} border ${st.ring}`}>{st.label}</Badge>
            {overdue && (
              <Badge variant="outline" className="text-xs bg-red-50 text-red-700 border-red-200">
                <AlertTriangle className="h-3 w-3 mr-1" /> Overdue
              </Badge>
            )}
            {req.short_timeline_reason && (
              <Badge variant="outline" className="text-xs bg-amber-50 text-amber-700 border-amber-200">
                <Clock className="h-3 w-3 mr-1" /> Tight Timeline
              </Badge>
            )}
          </div>
          <h1 className="text-3xl font-bold text-slate-900 dark:text-white tracking-tight flex items-center gap-3">
            <Sparkles className="h-7 w-7 text-emerald-600 shrink-0" />
            {req.request_type_name || 'Untyped Request'}
          </h1>
          <div className="flex flex-wrap items-center gap-x-5 gap-y-2 mt-4 text-sm text-slate-600">
            <span className="flex items-center gap-1.5"><Building2 className="h-4 w-4 text-slate-400" /> {req.assigned_department_name}</span>
            <span className="flex items-center gap-1.5">
              <Calendar className="h-4 w-4 text-slate-400" /> Due {fmtDate(req.requested_due_date)}
            </span>
            <span className="flex items-center gap-1.5">
              <Clock className="h-4 w-4 text-slate-400" /> Lead Design {req.design_lead_time_days}d &middot; Production {req.production_lead_time_days}d
            </span>
            <span className="flex items-center gap-1.5">
              <div className="w-6 h-6 rounded-full bg-emerald-100 border border-white flex items-center justify-center text-[10px] font-medium text-emerald-700">{getInitials(req.created_by_name)}</div>
              Raised by <span className="text-slate-800 font-medium">{req.created_by_name}</span>
            </span>
          </div>
        </CardContent>
      </Card>

      {/* Status action bar */}
      <Card className="border border-emerald-100/60 rounded-xl shadow-[0_2px_8px_rgba(6,95,70,0.04)]">
        <CardContent className="p-4 flex items-center gap-2 flex-wrap">
          <span className="text-xs text-slate-500 mr-1">Move to:</span>
          {allowedNext.length === 0 && <span className="text-xs text-slate-500 italic">(terminal state)</span>}
          {allowedNext.map(s => {
            const disabled =
              (s === 'final_approved' && !isRequestor) ||
              (['inputs_needed', 'in_progress', 'in_review', 'approved_internal'].includes(s) && !isInAssignedDept);
            return (
              <Button
                key={s}
                variant="outline"
                size="sm"
                disabled={disabled}
                title={disabled ? (s === 'final_approved' ? 'Only the requestor can mark Final Approved' : 'Only members of the assigned department can change this status') : ''}
                onClick={() => changeStatus(s)}
                data-testid={`status-${s}-btn`}
              >
                <ChevronRight className="h-3.5 w-3.5 mr-1" /> {STATUS_STYLES[s]?.label || s}
              </Button>
            );
          })}
          {req.status_key === 'final_approved' && (isRequestor || isInAssignedDept) && (
            <Button size="sm" onClick={openProdDialog} className="ml-auto bg-emerald-600 hover:bg-emerald-700" data-testid="submit-production-btn">
              <Truck className="h-4 w-4 mr-2" /> Submit for Production
            </Button>
          )}
          {req.status_key === 'production_in_progress' && isInDeliveryDept && (
            <Button size="sm" onClick={() => changeStatus('production_completed')} className="ml-auto bg-green-600 hover:bg-green-700" data-testid="mark-prod-complete-btn">
              <Truck className="h-4 w-4 mr-2" /> Mark Production Completed
            </Button>
          )}
        </CardContent>
      </Card>

      {/* Body: Requirement + Inputs (col span 2)  ·  Side panel */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
        <Card className="lg:col-span-2 border border-emerald-100/60 rounded-xl shadow-[0_2px_8px_rgba(6,95,70,0.04)]">
          <CardContent className="p-5 space-y-4">
            <div>
              <span className="text-[10px] uppercase tracking-wider text-emerald-700 font-semibold">Requirement</span>
              <p className="text-sm whitespace-pre-wrap text-slate-800 mt-1.5 leading-relaxed">{req.requirement_details}</p>
            </div>
            {req.additional_comments && (
              <div>
                <span className="text-[10px] uppercase tracking-wider text-emerald-700 font-semibold">Additional Comments</span>
                <p className="text-sm whitespace-pre-wrap text-slate-700 mt-1.5">{req.additional_comments}</p>
              </div>
            )}
            {(req.logo || req.references?.length > 0) && (
              <div>
                <span className="text-[10px] uppercase tracking-wider text-emerald-700 font-semibold flex items-center gap-1.5">
                  <ImageIcon className="h-3 w-3" /> Brand Assets & References
                </span>
                <div className="flex flex-wrap gap-1.5 mt-2">
                  {req.logo && <FileChip f={req.logo} />}
                  {(req.references || []).map(f => <FileChip key={f.id} f={f} />)}
                </div>
              </div>
            )}
            {(req.social_media_links?.length > 0 || req.file_links?.length > 0) && (
              <div>
                <span className="text-[10px] uppercase tracking-wider text-emerald-700 font-semibold flex items-center gap-1.5">
                  <LinkIcon className="h-3 w-3" /> Links
                </span>
                <div className="flex flex-wrap gap-1.5 mt-2">
                  {[...(req.social_media_links || []), ...(req.file_links || [])].map((l, i) => (
                    <a key={i} href={l} target="_blank" rel="noopener noreferrer"
                      className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-md border border-emerald-100 bg-white hover:bg-emerald-50/60 text-xs text-slate-700 transition-colors">
                      <ExternalLink className="h-3 w-3 text-emerald-600" /> {l.length > 46 ? l.slice(0, 46) + '…' : l}
                    </a>
                  ))}
                </div>
              </div>
            )}
          </CardContent>
        </Card>

        <Card className="border border-emerald-100/60 rounded-xl shadow-[0_2px_8px_rgba(6,95,70,0.04)]">
          <CardContent className="p-5 space-y-3 text-sm">
            <div>
              <span className="text-[10px] uppercase tracking-wider text-emerald-700 font-semibold">Created</span>
              <p className="text-xs text-slate-700 mt-0.5">{fmtDate(req.created_at, 'dd MMM yyyy, hh:mm a')}</p>
            </div>
            <div>
              <span className="text-[10px] uppercase tracking-wider text-emerald-700 font-semibold">Last Updated</span>
              <p className="text-xs text-slate-700 mt-0.5">{fmtDate(req.updated_at, 'dd MMM yyyy, hh:mm a')}</p>
            </div>
            <div>
              <span className="text-[10px] uppercase tracking-wider text-emerald-700 font-semibold">Versions</span>
              <p className="text-xs text-slate-700 mt-0.5">{req.versions?.length || 0} uploaded</p>
            </div>
            <div>
              <span className="text-[10px] uppercase tracking-wider text-emerald-700 font-semibold">Comments</span>
              <p className="text-xs text-slate-700 mt-0.5">{(req.comments || []).filter(c => c.kind === 'comment').length} added</p>
            </div>
            {req.short_timeline_reason && (
              <div className="rounded-md bg-amber-50 border border-amber-200 px-2.5 py-1.5">
                <span className="text-[10px] uppercase tracking-wider text-amber-700 font-semibold flex items-center gap-1"><Clock className="h-3 w-3" /> Short Timeline</span>
                <p className="text-xs text-amber-800 mt-0.5">{req.short_timeline_reason}</p>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Production submission */}
      {req.production && (
        <Card className="border border-orange-200 bg-orange-50/40 rounded-xl shadow-[0_2px_8px_rgba(6,95,70,0.04)]">
          <CardContent className="p-5">
            <div className="flex items-center justify-between flex-wrap gap-2">
              <div className="flex items-center gap-2">
                <Truck className="h-5 w-5 text-orange-700" />
                <span className="font-semibold text-slate-900">Production Submission</span>
                <Badge variant="outline" className="text-[10px] bg-white">{req.production.production_status}</Badge>
              </div>
              <span className="text-xs text-slate-500">Submitted by {req.production.submitted_by_name} on {fmtDate(req.production.submitted_at)}</span>
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mt-3 text-sm">
              <div><span className="text-[10px] uppercase text-slate-500">Quantity</span><p className="text-slate-900">{req.production.quantity_required}</p></div>
              <div><span className="text-[10px] uppercase text-slate-500">Production Date</span><p className="text-slate-900">{fmtDate(req.production.requested_production_date)}</p></div>
              <div className="col-span-2"><span className="text-[10px] uppercase text-slate-500">Delivery Team</span><p className="text-slate-900">{req.production.assigned_delivery_department_name}</p></div>
              {req.production.production_notes && (
                <div className="col-span-2 sm:col-span-4"><span className="text-[10px] uppercase text-slate-500">Notes</span><p className="whitespace-pre-wrap text-slate-700">{req.production.production_notes}</p></div>
              )}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Work versions */}
      <Card className="border border-emerald-100/60 rounded-xl shadow-[0_2px_8px_rgba(6,95,70,0.04)]">
        <CardContent className="p-5 space-y-3">
          <div className="flex items-center justify-between">
            <h3 className="text-base font-semibold text-slate-900 flex items-center gap-2">
              <Upload className="h-4 w-4 text-emerald-600" /> Work Versions ({req.versions?.length || 0})
            </h3>
            {isInAssignedDept && (
              <Button size="sm" variant="outline" onClick={() => setShowVersion(true)} data-testid="add-version-btn">
                <Plus className="h-4 w-4 mr-1" /> Add Version
              </Button>
            )}
          </div>
          {(req.versions || []).length === 0 ? (
            <p className="text-xs text-slate-500 italic">No work versions uploaded yet.</p>
          ) : (
            <div className="space-y-3">
              {req.versions.map((v) => (
                <div key={v.id} className="border border-emerald-100 rounded-lg p-3 bg-emerald-50/30">
                  <div className="flex items-center justify-between flex-wrap gap-2 mb-2">
                    <span className="font-semibold text-slate-900">{v.version_name}</span>
                    <span className="text-xs text-slate-500">
                      <span className="font-medium text-slate-700">{v.uploaded_by_name}</span> &middot; {fmtDate(v.uploaded_at, 'dd MMM yyyy, hh:mm a')}
                    </span>
                  </div>
                  {v.comments && <p className="text-xs text-slate-700 italic mb-2">{v.comments}</p>}
                  <div className="flex flex-wrap gap-1.5">
                    {(v.files || []).map(f => <FileChip key={f.id} f={f} />)}
                    {(v.links || []).map((l, i) => (
                      <a key={i} href={l} target="_blank" rel="noopener noreferrer"
                        className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-md border border-emerald-100 bg-white text-xs hover:bg-emerald-50/60">
                        <ExternalLink className="h-3 w-3 text-emerald-600" /> {l.length > 40 ? l.slice(0, 40) + '…' : l}
                      </a>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Comments timeline */}
      <Card className="border border-emerald-100/60 rounded-xl shadow-[0_2px_8px_rgba(6,95,70,0.04)]">
        <CardContent className="p-5 space-y-3">
          <h3 className="text-base font-semibold text-slate-900 flex items-center gap-2">
            <MessageSquare className="h-4 w-4 text-emerald-600" /> Comments & Activity
          </h3>
          <div className="space-y-2">
            {(req.comments || []).slice().reverse().map((c) => (
              <div key={c.id} className={`text-xs p-2.5 rounded-md border ${c.kind === 'comment' ? 'bg-white border-slate-200' : 'bg-emerald-50/40 border-emerald-100 italic text-slate-700'}`}>
                <div className="flex items-center justify-between gap-2 mb-0.5">
                  <span className="font-medium text-slate-800 flex items-center gap-1.5">
                    <div className="w-5 h-5 rounded-full bg-emerald-100 flex items-center justify-center text-[10px] font-medium text-emerald-700">{getInitials(c.user_name)}</div>
                    {c.user_name}
                  </span>
                  <span className="text-[10px] text-slate-500">{fmtDate(c.created_at, 'dd MMM, hh:mm a')}</span>
                </div>
                <p className="whitespace-pre-wrap pl-7">{c.text}</p>
              </div>
            ))}
          </div>
          <div className="flex gap-2 pt-1">
            <Textarea rows={2} value={comment} onChange={(e) => setComment(e.target.value)} placeholder="Add a comment…" data-testid="mr-comment-input" />
            <Button onClick={addComment} size="sm" disabled={!comment.trim()} className="bg-emerald-600 hover:bg-emerald-700 self-start">
              <Send className="h-4 w-4" />
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Add Version Dialog */}
      <Dialog open={showVersion} onOpenChange={setShowVersion}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Add Work Version</DialogTitle>
            <DialogDescription>Upload a new version of the work along with files, links and reviewer notes.</DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <Label>Version Name *</Label>
              <Input value={versionName} onChange={(e) => setVersionName(e.target.value)} placeholder="e.g. v1, v2 - revised colors" />
            </div>
            <div>
              <Label>Files</Label>
              <Input type="file" multiple ref={versionFileInput} onChange={handleVersionFiles} />
              <div className="flex flex-wrap gap-1.5 mt-2">
                {versionFiles.map((f) => (
                  <Badge key={f.id} variant="outline" className="text-xs bg-white">
                    {f.filename}
                    <button onClick={() => setVersionFiles(p => p.filter(x => x.id !== f.id))} className="ml-1.5"><X className="h-3 w-3" /></button>
                  </Badge>
                ))}
              </div>
            </div>
            <div>
              <Label>Work Links</Label>
              <div className="flex gap-2">
                <Input value={newVLink} onChange={(e) => setNewVLink(e.target.value)} placeholder="https://…"
                  onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); const v = newVLink.trim(); if (v) { setVersionLinks(p => [...p, v]); setNewVLink(''); } } }} />
                <Button type="button" variant="outline" size="sm"
                  onClick={() => { const v = newVLink.trim(); if (v) { setVersionLinks(p => [...p, v]); setNewVLink(''); } }}>
                  <Plus className="h-4 w-4" />
                </Button>
              </div>
              <div className="flex flex-wrap gap-1.5 mt-2">
                {versionLinks.map((l, i) => (
                  <Badge key={i} variant="outline" className="text-xs bg-white">{l}
                    <button onClick={() => setVersionLinks(p => p.filter((_, j) => j !== i))} className="ml-1.5"><X className="h-3 w-3" /></button>
                  </Badge>
                ))}
              </div>
            </div>
            <div>
              <Label>Comments</Label>
              <Textarea rows={2} value={versionComment} onChange={(e) => setVersionComment(e.target.value)} placeholder="What changed in this version?" />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowVersion(false)}>Cancel</Button>
            <Button onClick={addVersion} disabled={savingVersion || !versionName.trim()} className="bg-emerald-600 hover:bg-emerald-700">
              {savingVersion ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" /> Saving…</> : <><Upload className="h-4 w-4 mr-2" /> Save Version</>}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Production submit dialog */}
      <Dialog open={showProd} onOpenChange={setShowProd}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Submit for Production</DialogTitle>
            <DialogDescription>Capture quantity, target date and the delivery team to hand off this approved design.</DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <Label>Quantity Required *</Label>
              <Input type="number" min="1" value={prodForm.quantity_required} onChange={(e) => setProdForm({ ...prodForm, quantity_required: e.target.value })} />
            </div>
            <div>
              <Label>Requested Production Date *</Label>
              <Input type="date" value={prodForm.requested_production_date} onChange={(e) => setProdForm({ ...prodForm, requested_production_date: e.target.value })} />
            </div>
            <div>
              <Label>Assigned Delivery Team *</Label>
              <Select value={prodForm.assigned_delivery_department_id} onValueChange={(v) => setProdForm({ ...prodForm, assigned_delivery_department_id: v })}>
                <SelectTrigger><SelectValue placeholder="Select team" /></SelectTrigger>
                <SelectContent>
                  {departments.map(d => (<SelectItem key={d.id} value={d.id}>{d.name}</SelectItem>))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Production Notes</Label>
              <Textarea rows={2} value={prodForm.production_notes} onChange={(e) => setProdForm({ ...prodForm, production_notes: e.target.value })} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowProd(false)}>Cancel</Button>
            <Button onClick={submitProduction} disabled={savingProd} className="bg-emerald-600 hover:bg-emerald-700">
              {savingProd ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" /> Submitting…</> : <><Truck className="h-4 w-4 mr-2" /> Submit</>}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
