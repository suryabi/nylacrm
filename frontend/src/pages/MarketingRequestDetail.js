import React, { useEffect, useState, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import axios from 'axios';
import { format } from 'date-fns';
import { Button } from '../components/ui/button';
import { Card } from '../components/ui/card';
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
} from 'lucide-react';
import { toast } from 'sonner';
import { useAuth } from '../contexts/AuthContext';

const API = `${process.env.REACT_APP_BACKEND_URL}/api`;
const HEAD = () => {
  const t = localStorage.getItem('token');
  return t ? { Authorization: `Bearer ${t}` } : {};
};

const STATUS_COLORS = {
  submitted: 'bg-slate-100 text-slate-700 border-slate-300',
  inputs_needed: 'bg-amber-100 text-amber-800 border-amber-300',
  in_progress: 'bg-blue-100 text-blue-800 border-blue-300',
  in_review: 'bg-violet-100 text-violet-800 border-violet-300',
  approved_internal: 'bg-indigo-100 text-indigo-800 border-indigo-300',
  final_approved: 'bg-emerald-100 text-emerald-800 border-emerald-300',
  production_in_progress: 'bg-orange-100 text-orange-800 border-orange-300',
  production_completed: 'bg-green-100 text-green-800 border-green-300',
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
const STATUS_LABEL = {
  submitted: 'Submitted', inputs_needed: 'Inputs Needed', in_progress: 'In Progress',
  in_review: 'In Review', approved_internal: 'Approved - Internal', final_approved: 'Final Approved',
  production_in_progress: 'Production In Progress', production_completed: 'Production Completed',
};

const FileChip = ({ f }) => (
  <a
    href={`${API}/marketing-requests/files/${f.id}`}
    target="_blank" rel="noopener noreferrer"
    className="inline-flex items-center gap-1.5 px-2 py-1 rounded-md border bg-slate-50 text-slate-700 hover:bg-slate-100 text-xs"
    data-testid={`file-chip-${f.id}`}
  >
    <FileText className="h-3.5 w-3.5" /> {f.filename}
  </a>
);

export default function MarketingRequestDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { user } = useAuth();
  const [req, setReq] = useState(null);
  const [loading, setLoading] = useState(true);
  const [comment, setComment] = useState('');

  // Version dialog
  const [showVersion, setShowVersion] = useState(false);
  const [versionName, setVersionName] = useState('');
  const [versionFiles, setVersionFiles] = useState([]);
  const [versionLinks, setVersionLinks] = useState([]);
  const [newVLink, setNewVLink] = useState('');
  const [versionComment, setVersionComment] = useState('');
  const [savingVersion, setSavingVersion] = useState(false);
  const versionFileInput = useRef(null);

  // Production submit dialog
  const [showProd, setShowProd] = useState(false);
  const [departments, setDepartments] = useState([]);
  const [prodForm, setProdForm] = useState({
    quantity_required: '', requested_production_date: '',
    assigned_delivery_department_id: '', production_notes: '',
  });
  const [savingProd, setSavingProd] = useState(false);

  const fetchReq = async () => {
    setLoading(true);
    try {
      const { data } = await axios.get(`${API}/marketing-requests/${id}`, { headers: HEAD() });
      setReq(data);
    } catch (e) {
      toast.error('Failed to load request');
      navigate('/marketing-requests');
    } finally { setLoading(false); }
  };
  useEffect(() => { fetchReq(); }, [id]); // eslint-disable-line

  const userDepts = (user?.department || '').toString().toLowerCase();
  const isInAssignedDept = req && userDepts.includes((req.assigned_department_name || '').toLowerCase());
  const isInDeliveryDept = req?.production && userDepts.includes((req.production.assigned_delivery_department_name || '').toLowerCase());
  const isRequestor = req && user?.id === req.created_by;

  const changeStatus = async (status_key, commentText) => {
    try {
      await axios.post(`${API}/marketing-requests/${id}/status`, { status_key, comment: commentText || null }, { headers: HEAD() });
      toast.success(`Status → ${STATUS_LABEL[status_key]}`);
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

  // Version upload helpers
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

  // Production submit
  const openProdDialog = async () => {
    try {
      const { data } = await axios.get(`${API}/master-departments?kind=delivery`, { headers: HEAD() });
      setDepartments(data?.departments || []);
      // include all if delivery list empty
      if (!data?.departments?.length) {
        const all = await axios.get(`${API}/master-departments`, { headers: HEAD() });
        setDepartments(all.data?.departments || []);
      }
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

  if (loading) return <div className="p-8 text-center text-muted-foreground">Loading…</div>;
  if (!req) return null;

  const allowedNext = NEXT_TRANSITIONS[req.status_key] || [];
  const isOverdue = req.requested_due_date && req.status_key !== 'production_completed' &&
    new Date(req.requested_due_date) < new Date(new Date().toDateString());

  return (
    <div className="space-y-4 p-4 sm:p-6 max-w-5xl mx-auto">
      {/* Header */}
      <div className="flex items-center gap-3 flex-wrap">
        <Button variant="ghost" size="sm" onClick={() => navigate('/marketing-requests')}>
          <ArrowLeft className="h-4 w-4 mr-2" /> Back
        </Button>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="font-mono text-xs text-slate-500">{req.request_number}</span>
            <Badge variant="outline" className={`text-xs ${STATUS_COLORS[req.status_key] || ''}`}>
              {req.status_name || req.status_key}
            </Badge>
            {isOverdue && (
              <Badge variant="outline" className="text-xs bg-red-50 text-red-700 border-red-200">
                <AlertTriangle className="h-3 w-3 mr-1" /> Overdue
              </Badge>
            )}
          </div>
          <h1 className="text-xl font-semibold text-slate-900 flex items-center gap-2 mt-0.5">
            <Sparkles className="h-5 w-5 text-violet-600" /> {req.title}
          </h1>
        </div>
      </div>

      {/* Status actions */}
      <Card className="p-3">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-xs text-muted-foreground">Move to:</span>
          {allowedNext.length === 0 && <span className="text-xs text-muted-foreground italic">(no further status transitions)</span>}
          {allowedNext.map(s => {
            const disabled =
              (s === 'final_approved' && !isRequestor) ||
              (['inputs_needed','in_progress','in_review','approved_internal'].includes(s) && !isInAssignedDept);
            return (
              <Button
                key={s}
                variant="outline"
                size="sm"
                disabled={disabled}
                title={disabled ? (s === 'final_approved' ? 'Only the requestor can mark Final Approved' : 'Only the assigned department can change this status') : ''}
                onClick={() => changeStatus(s)}
                data-testid={`status-${s}-btn`}
              >
                <ChevronRight className="h-3.5 w-3.5 mr-1" /> {STATUS_LABEL[s]}
              </Button>
            );
          })}
          {req.status_key === 'final_approved' && (isRequestor || isInAssignedDept) && (
            <Button size="sm" onClick={openProdDialog} data-testid="submit-production-btn" className="ml-auto">
              <Truck className="h-4 w-4 mr-2" /> Submit for Production
            </Button>
          )}
          {req.status_key === 'production_in_progress' && isInDeliveryDept && (
            <Button size="sm" onClick={() => changeStatus('production_completed')} className="ml-auto bg-green-600 hover:bg-green-700">
              <Truck className="h-4 w-4 mr-2" /> Mark Production Completed
            </Button>
          )}
        </div>
      </Card>

      {/* Core info */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card className="p-4 space-y-2.5 md:col-span-2">
          <div>
            <span className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold">Requirement</span>
            <p className="text-sm whitespace-pre-wrap text-slate-800 mt-0.5">{req.requirement_details}</p>
          </div>
          {req.additional_comments && (
            <div>
              <span className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold">Additional Comments</span>
              <p className="text-sm whitespace-pre-wrap text-slate-700">{req.additional_comments}</p>
            </div>
          )}
          {(req.logo || req.references?.length > 0) && (
            <div>
              <span className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold">Inputs</span>
              <div className="flex flex-wrap gap-1.5 mt-1">
                {req.logo && <FileChip f={req.logo} />}
                {(req.references || []).map(f => <FileChip key={f.id} f={f} />)}
              </div>
            </div>
          )}
          {(req.social_media_links?.length > 0 || req.file_links?.length > 0) && (
            <div>
              <span className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold">Links</span>
              <div className="flex flex-wrap gap-1.5 mt-1">
                {[...(req.social_media_links || []), ...(req.file_links || [])].map((l, i) => (
                  <a key={i} href={l} target="_blank" rel="noopener noreferrer"
                    className="inline-flex items-center gap-1 px-2 py-1 rounded-md border bg-slate-50 hover:bg-slate-100 text-xs text-slate-700">
                    <ExternalLink className="h-3 w-3" /> {l.length > 40 ? l.slice(0, 40) + '…' : l}
                  </a>
                ))}
              </div>
            </div>
          )}
        </Card>

        <Card className="p-4 space-y-2 text-sm">
          <div><span className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold">Type</span><p>{req.request_type_name}</p></div>
          <div><span className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold">Assigned Department</span><p>{req.assigned_department_name}</p></div>
          <div>
            <span className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold">Due Date</span>
            <p>{req.requested_due_date && format(new Date(req.requested_due_date), 'dd MMM yyyy')}</p>
          </div>
          <div>
            <span className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold">Lead Time</span>
            <p className="text-xs text-slate-600">Design: {req.design_lead_time_days}d &middot; Production: {req.production_lead_time_days}d</p>
          </div>
          {req.short_timeline_reason && (
            <div>
              <span className="text-[10px] uppercase tracking-wider text-amber-700 font-semibold flex items-center gap-1"><Clock className="h-3 w-3" /> Short Timeline Reason</span>
              <p className="text-xs text-amber-800 bg-amber-50 border border-amber-200 rounded p-2 mt-0.5">{req.short_timeline_reason}</p>
            </div>
          )}
          <div><span className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold">Raised by</span><p>{req.created_by_name}</p></div>
          <div><span className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold">Created</span><p className="text-xs">{format(new Date(req.created_at), 'dd MMM yyyy, hh:mm a')}</p></div>
        </Card>
      </div>

      {/* Production */}
      {req.production && (
        <Card className="p-4 bg-orange-50/40 border-orange-200">
          <div className="flex items-center justify-between flex-wrap gap-2">
            <div className="flex items-center gap-2">
              <Truck className="h-5 w-5 text-orange-700" />
              <span className="font-semibold text-slate-900">Production Submission</span>
              <Badge variant="outline" className="text-[10px] bg-white">{req.production.production_status}</Badge>
            </div>
            <span className="text-xs text-muted-foreground">Submitted by {req.production.submitted_by_name} on {format(new Date(req.production.submitted_at), 'dd MMM yyyy')}</span>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mt-3 text-sm">
            <div><span className="text-[10px] uppercase text-muted-foreground">Quantity</span><p>{req.production.quantity_required}</p></div>
            <div><span className="text-[10px] uppercase text-muted-foreground">Production Date</span><p>{req.production.requested_production_date && format(new Date(req.production.requested_production_date), 'dd MMM yyyy')}</p></div>
            <div className="col-span-2"><span className="text-[10px] uppercase text-muted-foreground">Delivery Team</span><p>{req.production.assigned_delivery_department_name}</p></div>
            {req.production.production_notes && (
              <div className="col-span-2 sm:col-span-4"><span className="text-[10px] uppercase text-muted-foreground">Notes</span><p className="whitespace-pre-wrap text-slate-700">{req.production.production_notes}</p></div>
            )}
          </div>
        </Card>
      )}

      {/* Work versions */}
      <Card className="p-4 space-y-3">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-semibold text-slate-900">Work Versions ({req.versions?.length || 0})</h3>
          {isInAssignedDept && (
            <Button size="sm" variant="outline" onClick={() => setShowVersion(true)} data-testid="add-version-btn">
              <Plus className="h-4 w-4 mr-1" /> Add Version
            </Button>
          )}
        </div>
        {(req.versions || []).length === 0 ? (
          <p className="text-xs text-muted-foreground italic">No work versions uploaded yet.</p>
        ) : (
          <div className="space-y-3">
            {req.versions.map((v) => (
              <div key={v.id} className="border rounded-lg p-3 bg-slate-50/40">
                <div className="flex items-center justify-between flex-wrap gap-2 mb-2">
                  <span className="font-medium text-slate-900">{v.version_name}</span>
                  <span className="text-xs text-muted-foreground">{v.uploaded_by_name} · {format(new Date(v.uploaded_at), 'dd MMM yyyy, hh:mm a')}</span>
                </div>
                {v.comments && <p className="text-xs text-slate-700 italic mb-2">{v.comments}</p>}
                <div className="flex flex-wrap gap-1.5">
                  {(v.files || []).map(f => <FileChip key={f.id} f={f} />)}
                  {(v.links || []).map((l, i) => (
                    <a key={i} href={l} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 px-2 py-1 rounded-md border bg-white text-xs hover:bg-slate-50">
                      <ExternalLink className="h-3 w-3" /> {l.length > 40 ? l.slice(0, 40) + '…' : l}
                    </a>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
      </Card>

      {/* Comments timeline */}
      <Card className="p-4 space-y-3">
        <h3 className="text-sm font-semibold flex items-center gap-2"><MessageSquare className="h-4 w-4" /> Comments & Activity</h3>
        <div className="space-y-2">
          {(req.comments || []).slice().reverse().map((c) => (
            <div key={c.id} className={`text-xs p-2 rounded-md border ${c.kind === 'comment' ? 'bg-white' : 'bg-slate-50 border-slate-200 italic text-slate-700'}`}>
              <div className="flex items-center justify-between gap-2 mb-0.5">
                <span className="font-medium text-slate-800">{c.user_name}</span>
                <span className="text-[10px] text-muted-foreground">{format(new Date(c.created_at), 'dd MMM, hh:mm a')}</span>
              </div>
              <p className="whitespace-pre-wrap">{c.text}</p>
            </div>
          ))}
        </div>
        <div className="flex gap-2">
          <Textarea rows={2} value={comment} onChange={(e) => setComment(e.target.value)} placeholder="Add a comment…" data-testid="mr-comment-input" />
          <Button onClick={addComment} size="sm" disabled={!comment.trim()}>
            <Send className="h-4 w-4" />
          </Button>
        </div>
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
              <Label>Version Name</Label>
              <Input value={versionName} onChange={(e) => setVersionName(e.target.value)} placeholder="e.g. v1, v2 - revised colors" />
            </div>
            <div>
              <Label>Files</Label>
              <Input type="file" multiple ref={versionFileInput} onChange={handleVersionFiles} />
              <div className="flex flex-wrap gap-1.5 mt-2">
                {versionFiles.map((f) => (
                  <Badge key={f.id} variant="outline" className="text-xs">
                    {f.filename}
                    <button onClick={() => setVersionFiles(p => p.filter(x => x.id !== f.id))} className="ml-1.5"><X className="h-3 w-3" /></button>
                  </Badge>
                ))}
              </div>
            </div>
            <div>
              <Label>Work Links</Label>
              <div className="flex gap-2">
                <Input value={newVLink} onChange={(e) => setNewVLink(e.target.value)} placeholder="https://…" onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); const v = newVLink.trim(); if (v) { setVersionLinks(p => [...p, v]); setNewVLink(''); } } }} />
                <Button type="button" variant="outline" size="sm" onClick={() => { const v = newVLink.trim(); if (v) { setVersionLinks(p => [...p, v]); setNewVLink(''); } }}><Plus className="h-4 w-4" /></Button>
              </div>
              <div className="flex flex-wrap gap-1.5 mt-2">
                {versionLinks.map((l, i) => (
                  <Badge key={i} variant="outline" className="text-xs">{l}<button onClick={() => setVersionLinks(p => p.filter((_, j) => j !== i))} className="ml-1.5"><X className="h-3 w-3" /></button></Badge>
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
            <Button onClick={addVersion} disabled={savingVersion || !versionName.trim()}>
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
              <Label>Quantity Required</Label>
              <Input type="number" min="1" value={prodForm.quantity_required} onChange={(e) => setProdForm({ ...prodForm, quantity_required: e.target.value })} />
            </div>
            <div>
              <Label>Requested Production Date</Label>
              <Input type="date" value={prodForm.requested_production_date} onChange={(e) => setProdForm({ ...prodForm, requested_production_date: e.target.value })} />
            </div>
            <div>
              <Label>Assigned Delivery Team</Label>
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
            <Button onClick={submitProduction} disabled={savingProd}>
              {savingProd ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" /> Submitting…</> : <><Truck className="h-4 w-4 mr-2" /> Submit</>}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
