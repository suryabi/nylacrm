import React, { useEffect, useState, useCallback, useMemo } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import axios from 'axios';
import { format, parseISO, isValid, isPast, isToday } from 'date-fns';
import { Button } from '../components/ui/button';
import { Card, CardContent } from '../components/ui/card';
import { Input } from '../components/ui/input';
import { Label } from '../components/ui/label';
import { Textarea } from '../components/ui/textarea';
import { Badge } from '../components/ui/badge';
import { FileDropzone } from '../components/FileDropzone';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from '../components/ui/dialog';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '../components/ui/select';
import {
  ArrowLeft, Sparkles, Send, MessageSquare, Plus, Upload, FileText, X,
  Loader2, ExternalLink, ChevronRight, Truck, AlertTriangle, Clock,
  Tag, Calendar, Building2, Image as ImageIcon, Link as LinkIcon,
  UserCircle, ShieldCheck, Users, Download, Trash2,
  Eye, FileImage, FileSpreadsheet, Presentation, Film, Music, FileArchive, File,
  CheckCircle2, RotateCcw,
} from 'lucide-react';
import { toast } from 'sonner';
import { useAuth } from '../context/AuthContext';

const API = `${process.env.REACT_APP_BACKEND_URL}/api`;
const HEAD = () => {
  const t = localStorage.getItem('token');
  return t ? { Authorization: `Bearer ${t}` } : {};
};

const isOverdueDate = (s) => { if (!s) return false; try { const d = parseISO(s); return isValid(d) && isPast(d) && !isToday(d); } catch { return false; } };
const fmtDate = (s, f = 'dd MMM yyyy') => { try { return format(parseISO(s), f); } catch { return s || '—'; } };
const getInitials = (name) => {
  if (!name) return 'NA';
  const parts = name.trim().split(' ').filter(Boolean);
  if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase();
  return name.slice(0, 2).toUpperCase();
};

// Build inline styles from a hex color so the badge follows the SM-defined color.
const stateBadgeStyle = (hex) => {
  if (!hex) return { background: '#f1f5f9', color: '#334155', borderColor: '#e2e8f0' };
  return { background: `${hex}1f`, color: hex, borderColor: `${hex}55` };
};

// Classify a file by extension / content-type to choose an icon + preview mode.
const fileKind = (f) => {
  const name = (f?.filename || '').toLowerCase();
  const ct = (f?.content_type || '').toLowerCase();
  if (ct.startsWith('image/') || /\.(png|jpe?g|gif|webp|svg|bmp)$/.test(name)) return 'image';
  if (ct === 'application/pdf' || name.endsWith('.pdf')) return 'pdf';
  if (/\.(pptx?|key)$/.test(name) || ct.includes('presentation')) return 'ppt';
  if (/\.(xlsx?|csv)$/.test(name) || ct.includes('spreadsheet') || ct === 'text/csv') return 'sheet';
  if (/\.(docx?|rtf)$/.test(name) || ct.includes('word')) return 'doc';
  if (/\.(mp4|mov|avi|webm|mkv)$/.test(name) || ct.startsWith('video/')) return 'video';
  if (/\.(mp3|wav|ogg|aac|flac)$/.test(name) || ct.startsWith('audio/')) return 'audio';
  if (/\.(zip|rar|7z|tar|gz)$/.test(name)) return 'archive';
  return 'file';
};
const KIND_META = {
  image: { Icon: FileImage, cls: 'text-emerald-500' },
  pdf: { Icon: FileText, cls: 'text-red-500' },
  ppt: { Icon: Presentation, cls: 'text-orange-500' },
  sheet: { Icon: FileSpreadsheet, cls: 'text-green-600' },
  doc: { Icon: FileText, cls: 'text-blue-500' },
  video: { Icon: Film, cls: 'text-purple-500' },
  audio: { Icon: Music, cls: 'text-pink-500' },
  archive: { Icon: FileArchive, cls: 'text-amber-600' },
  file: { Icon: File, cls: 'text-slate-400' },
};

const downloadFileBlob = async (f) => {
  const res = await axios.get(`${API}/marketing-requests/files/${f.id}`, { headers: HEAD(), responseType: 'blob' });
  const url = URL.createObjectURL(res.data);
  const a = document.createElement('a');
  a.href = url;
  a.download = f.filename || 'download';
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
};

// Rich asset card: type-aware thumbnail/icon, click-to-preview, download + optional delete.
const FileAsset = ({ f, canDelete, onDelete, onPreview }) => {
  const [thumb, setThumb] = useState(null);
  const [busy, setBusy] = useState(false);
  const kind = fileKind(f);
  const isImg = kind === 'image';
  const { Icon, cls } = KIND_META[kind] || KIND_META.file;

  useEffect(() => {
    if (!isImg) return undefined;
    let objUrl;
    let active = true;
    axios
      .get(`${API}/marketing-requests/files/${f.id}`, { headers: HEAD(), responseType: 'blob' })
      .then((res) => {
        if (!active) return;
        objUrl = URL.createObjectURL(res.data);
        setThumb(objUrl);
      })
      .catch(() => {});
    return () => { active = false; if (objUrl) URL.revokeObjectURL(objUrl); };
  }, [f.id, isImg]);

  const handleDownload = async (e) => {
    e?.stopPropagation();
    setBusy(true);
    try { await downloadFileBlob(f); } catch { toast.error('Download failed'); } finally { setBusy(false); }
  };

  return (
    <div
      className="group relative w-32 rounded-lg border border-emerald-100 bg-white overflow-hidden shadow-sm hover:shadow-md transition-shadow"
      data-testid={`file-asset-${f.id}`}
    >
      <button
        type="button"
        onClick={() => onPreview && onPreview(f)}
        className="relative block w-full h-24 flex items-center justify-center bg-slate-50 border-b border-emerald-50 cursor-pointer"
        title="Click to preview"
        data-testid={`file-preview-${f.id}`}
      >
        {isImg && thumb ? (
          <img src={thumb} alt={f.filename} className="h-full w-full object-contain" data-testid={`file-thumb-${f.id}`} />
        ) : (
          <Icon className={`h-8 w-8 ${cls}`} />
        )}
        <span className="absolute inset-0 flex items-center justify-center bg-black/0 group-hover:bg-black/25 opacity-0 group-hover:opacity-100 transition-all">
          <Eye className="h-5 w-5 text-white" />
        </span>
      </button>
      <div className="px-2 py-1.5">
        <p className="truncate text-[11px] text-slate-700" title={f.filename}>{f.filename}</p>
        <div className="flex items-center gap-1 mt-1.5">
          <Button
            size="sm" variant="outline"
            className="h-6 px-2 text-[10px] flex-1"
            onClick={handleDownload}
            disabled={busy}
            data-testid={`file-download-${f.id}`}
          >
            {busy ? <Loader2 className="h-3 w-3 animate-spin" /> : <Download className="h-3 w-3" />}
          </Button>
          {canDelete && (
            <Button
              size="sm" variant="outline"
              className="h-6 px-2 text-[10px] text-red-600 border-red-200 hover:bg-red-50"
              onClick={(e) => { e.stopPropagation(); onDelete(f); }}
              data-testid={`file-delete-${f.id}`}
            >
              <Trash2 className="h-3 w-3" />
            </Button>
          )}
        </div>
      </div>
    </div>
  );
};

// Lightbox preview — inline for images & PDFs, graceful fallback for others.
const FilePreviewDialog = ({ file, onClose }) => {
  const [url, setUrl] = useState(null);
  const [loading, setLoading] = useState(true);
  const kind = file ? fileKind(file) : 'file';
  const inlineable = kind === 'image' || kind === 'pdf';
  const { Icon, cls } = KIND_META[kind] || KIND_META.file;

  useEffect(() => {
    if (!file || !inlineable) { setUrl(null); setLoading(false); return undefined; }
    setLoading(true);
    let objUrl;
    let active = true;
    axios
      .get(`${API}/marketing-requests/files/${file.id}`, { headers: HEAD(), responseType: 'blob' })
      .then((res) => { if (!active) return; objUrl = URL.createObjectURL(res.data); setUrl(objUrl); })
      .catch(() => toast.error('Preview failed'))
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; if (objUrl) URL.revokeObjectURL(objUrl); };
  }, [file?.id, inlineable]);

  return (
    <Dialog open={!!file} onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="max-w-3xl" data-testid="file-preview-dialog">
        <DialogHeader>
          <DialogTitle className="truncate pr-8 text-base">{file?.filename}</DialogTitle>
        </DialogHeader>
        <div className="min-h-[300px] max-h-[70vh] overflow-auto flex items-center justify-center bg-slate-50 rounded-md">
          {loading ? (
            <Loader2 className="h-8 w-8 animate-spin text-emerald-600" />
          ) : kind === 'image' && url ? (
            <img src={url} alt={file?.filename} className="max-h-[68vh] w-auto object-contain" data-testid="preview-image" />
          ) : kind === 'pdf' && url ? (
            <iframe title="file-preview" src={url} className="w-full h-[68vh] border-0" data-testid="preview-pdf" />
          ) : (
            <div className="text-center p-10">
              <Icon className={`h-14 w-14 mx-auto ${cls}`} />
              <p className="mt-3 text-sm text-slate-600">Inline preview isn't available for this file type.</p>
              <p className="text-xs text-slate-400">Download it to view the contents.</p>
            </div>
          )}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => downloadFileBlob(file).catch(() => toast.error('Download failed'))} data-testid="preview-download-btn">
            <Download className="h-4 w-4 mr-2" /> Download
          </Button>
          <Button onClick={onClose} className="bg-emerald-600 hover:bg-emerald-700" data-testid="preview-close-btn">Close</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};


export default function MarketingRequestDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { user } = useAuth();
  const [req, setReq] = useState(null);
  const [transitions, setTransitions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [comment, setComment] = useState('');

  // Transition confirm dialog (for comment_required transitions)
  const [confirmTxn, setConfirmTxn] = useState(null); // {action_key, action_label, to_state_label, comment_required}
  const [txnComment, setTxnComment] = useState('');
  const [savingTxn, setSavingTxn] = useState(false);

  // Version dialog state
  const [showVersion, setShowVersion] = useState(false);
  const [versionFiles, setVersionFiles] = useState([]);
  const [versionLinks, setVersionLinks] = useState([]);
  const [newVLink, setNewVLink] = useState('');
  const [versionComment, setVersionComment] = useState('');
  const [savingVersion, setSavingVersion] = useState(false);

  // Production submit dialog state
  const [showProd, setShowProd] = useState(false);
  const [departments, setDepartments] = useState([]);
  const [prodForm, setProdForm] = useState({
    quantity_required: '', requested_production_date: '',
    assigned_delivery_department_id: '', production_notes: '',
  });
  const [savingProd, setSavingProd] = useState(false);

  // Delete-attachment confirm state
  const [fileToDelete, setFileToDelete] = useState(null);
  const [deletingFile, setDeletingFile] = useState(false);
  const [previewFile, setPreviewFile] = useState(null);
  // Per-version comment composer + busy flags
  const [verComment, setVerComment] = useState({}); // { [versionId]: text }
  const [verBusy, setVerBusy] = useState({});       // { [versionId]: bool }

  // Required-field capture dialog (transitions that collect new data)
  const [fieldTxn, setFieldTxn] = useState(null);
  const [fieldValues, setFieldValues] = useState({});

  const fetchAll = useCallback(async () => {
    setLoading(true);
    try {
      const [r1, r2] = await Promise.all([
        axios.get(`${API}/marketing-requests/${id}`, { headers: HEAD() }),
        axios.get(`${API}/marketing-requests/${id}/available-transitions`, { headers: HEAD() }),
      ]);
      setReq(r1.data);
      setTransitions(r2.data?.transitions || []);
    } catch {
      toast.error('Failed to load request');
      navigate('/marketing-requests');
    } finally { setLoading(false); }
  }, [id, navigate]);
  useEffect(() => { fetchAll(); }, [fetchAll]);

  const runTransition = async (action_key, commentText, fieldData) => {
    setSavingTxn(true);
    try {
      await axios.post(`${API}/marketing-requests/${id}/transition`,
        { action_key, comment: commentText || null, field_data: fieldData || null },
        { headers: HEAD() },
      );
      toast.success('Transition applied');
      setConfirmTxn(null);
      setFieldTxn(null);
      setTxnComment('');
      fetchAll();
    } catch (e) {
      toast.error(e.response?.data?.detail || 'Transition failed');
    } finally { setSavingTxn(false); }
  };

  const onActionClick = (t) => {
    // Guard gate — should be disabled already, but defend against direct clicks.
    if (t.guards_ok === false) {
      toast.error((t.block_reasons || []).join(' ') || 'This action is blocked by a workflow rule.');
      return;
    }
    if ((t.required_fields || []).length > 0) {
      const init = {};
      (t.required_fields || []).forEach((f) => { init[f.key] = ''; });
      setFieldValues(init);
      setTxnComment('');
      setFieldTxn(t);
    } else if (t.comment_required) {
      setConfirmTxn(t);
      setTxnComment('');
    } else {
      runTransition(t.action_key, null);
    }
  };

  const submitFieldTxn = () => {
    const fields = fieldTxn?.required_fields || [];
    const missing = fields.filter((f) => f.required && (fieldValues[f.key] === '' || fieldValues[f.key] == null));
    if (missing.length) {
      toast.error(`Please fill: ${missing.map((f) => f.label).join(', ')}`);
      return;
    }
    if (fieldTxn.comment_required && !txnComment.trim()) {
      toast.error('A comment is required for this action.');
      return;
    }
    runTransition(fieldTxn.action_key, txnComment || null, fieldValues);
  };

  const addComment = async () => {
    if (!comment.trim()) return;
    try {
      await axios.post(`${API}/marketing-requests/${id}/comments`, { text: comment.trim() }, { headers: HEAD() });
      setComment('');
      fetchAll();
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
  const [versionBusy, setVersionBusy] = useState(false);
  const handleVersionFiles = async (files) => {
    setVersionBusy(true);
    for (const f of files) {
      try { const up = await uploadFile(f); setVersionFiles(p => [...p, up]); }
      catch { toast.error(`Failed to upload ${f.name}`); }
    }
    setVersionBusy(false);
  };
  const addVersion = async () => {
    setSavingVersion(true);
    try {
      const { data } = await axios.post(`${API}/marketing-requests/${id}/versions`, {
        file_ids: versionFiles.map(f => f.id),
        links: versionLinks,
        comments: versionComment || null,
      }, { headers: HEAD() });
      toast.success(`${data?.version_name || 'Version'} added`);
      setShowVersion(false);
      setVersionFiles([]); setVersionLinks([]); setVersionComment('');
      fetchAll();
    } catch (e) { toast.error(e.response?.data?.detail || 'Failed to add version'); }
    finally { setSavingVersion(false); }
  };

  const addVersionComment = async (versionId) => {
    const text = (verComment[versionId] || '').trim();
    if (!text) return;
    setVerBusy((p) => ({ ...p, [versionId]: true }));
    try {
      await axios.post(`${API}/marketing-requests/${id}/versions/${versionId}/comments`, { text }, { headers: HEAD() });
      setVerComment((p) => ({ ...p, [versionId]: '' }));
      fetchAll();
    } catch (e) { toast.error(e.response?.data?.detail || 'Failed to add comment'); }
    finally { setVerBusy((p) => ({ ...p, [versionId]: false })); }
  };

  const setVersionApproval = async (versionId, approve) => {
    setVerBusy((p) => ({ ...p, [versionId]: true }));
    try {
      await axios.post(`${API}/marketing-requests/${id}/versions/${versionId}/${approve ? 'approve' : 'unapprove'}`, {}, { headers: HEAD() });
      toast.success(approve ? 'Version approved' : 'Approval reverted');
      fetchAll();
    } catch (e) { toast.error(e.response?.data?.detail || 'Action failed'); }
    finally { setVerBusy((p) => ({ ...p, [versionId]: false })); }
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
      toast.success('Production payload attached');
      setShowProd(false);
      fetchAll();
    } catch (e) { toast.error(e.response?.data?.detail || 'Production submit failed'); }
    finally { setSavingProd(false); }
  };

  const allowedTransitions = useMemo(() => transitions.filter(t => t.allowed), [transitions]);
  const blockedTransitions = useMemo(() => transitions.filter(t => !t.allowed), [transitions]);

  const confirmDeleteFile = async () => {
    if (!fileToDelete) return;
    setDeletingFile(true);
    try {
      await axios.delete(`${API}/marketing-requests/${id}/files/${fileToDelete.id}`, { headers: HEAD() });
      toast.success('Attachment removed');
      setFileToDelete(null);
      fetchAll();
    } catch (e) {
      toast.error(e.response?.data?.detail || 'Failed to remove attachment');
    } finally { setDeletingFile(false); }
  };

  if (loading) return <div className="flex items-center justify-center h-96"><Loader2 className="h-8 w-8 animate-spin text-emerald-600" /></div>;
  if (!req) return null;

  const overdue = req.requested_due_date && !['production_completed'].includes(req.current_state_key) && isOverdueDate(req.requested_due_date);
  const stateStyle = stateBadgeStyle(req.current_state_color);

  return (
    <div className="p-6 max-w-6xl mx-auto space-y-6" data-testid="mr-detail-page">
      <div>
        <Button variant="ghost" size="sm" onClick={() => navigate('/marketing-requests')} data-testid="mr-back-btn">
          <ArrowLeft className="h-4 w-4 mr-2" /> Back to Marketing Requests
        </Button>
      </div>

      {/* Hero header */}
      <div className="relative overflow-hidden rounded-3xl bg-emerald-600 p-7 md:p-9 text-white shadow-lg" data-testid="mr-hero">
        <div
          className="absolute inset-0 opacity-[0.12] mix-blend-overlay bg-cover bg-center pointer-events-none"
          style={{ backgroundImage: 'url(https://images.unsplash.com/photo-1629197520635-16570fbd0bb3?crop=entropy&cs=srgb&fm=jpg&q=85&w=1200)' }}
        />
        <div className="absolute -right-16 -top-16 w-64 h-64 rounded-full bg-emerald-500/40 blur-3xl pointer-events-none" />
        {(req.lead_company || req.lead_name) && (
          <div className="absolute top-5 right-5 z-10 hidden sm:flex items-center gap-3 rounded-2xl bg-white/15 backdrop-blur-md border border-white/25 px-4 py-2.5 max-w-[280px] shadow-lg" data-testid="mr-hero-lead">
            <div className="w-10 h-10 rounded-xl bg-white/20 flex items-center justify-center shrink-0">
              <Users className="h-5 w-5 text-white" />
            </div>
            <div className="min-w-0">
              <p className="text-[10px] uppercase tracking-wider text-emerald-100/90 font-semibold">Associated Lead</p>
              <p className="text-sm font-bold text-white truncate">{req.lead_company || req.lead_name}</p>
              {req.lead_company && req.lead_name && req.lead_company !== req.lead_name && (
                <p className="text-[11px] text-emerald-50/80 truncate">{req.lead_name}</p>
              )}
            </div>
          </div>
        )}
        <div className="relative">
          <div className="flex items-center gap-2 mb-3 flex-wrap">
            <span className="inline-flex items-center gap-1.5 text-xs font-medium px-3 py-1 rounded-full bg-white/20 backdrop-blur-md border border-white/10 font-mono">
              <Tag className="h-3 w-3" /> {req.request_number}
            </span>
            <Badge
              variant="outline"
              style={stateStyle}
              className="border-0 shadow-sm"
              data-testid="mr-current-state-badge"
            >
              {req.current_state_label || req.current_state_key}
            </Badge>
            {overdue && (
              <Badge className="text-xs bg-red-500 hover:bg-red-500 text-white border-0">
                <AlertTriangle className="h-3 w-3 mr-1" /> Overdue
              </Badge>
            )}
            {req.short_timeline_reason && (
              <Badge className="text-xs bg-amber-400 hover:bg-amber-400 text-amber-950 border-0">
                <Clock className="h-3 w-3 mr-1" /> Tight Timeline
              </Badge>
            )}
          </div>
          <h1 className="text-3xl md:text-4xl font-bold tracking-tight flex items-center gap-3">
            <Sparkles className="h-7 w-7 text-emerald-100 shrink-0" />
            {req.request_type_name || 'Untyped Request'}
          </h1>
          <div className="flex flex-wrap items-center gap-x-5 gap-y-2 mt-5 text-sm text-emerald-50/90">
            <span className="flex items-center gap-1.5"><Building2 className="h-4 w-4 text-emerald-200" /> {req.assigned_department_name || '—'}</span>
            {req.assigned_user_name && (
              <span className="flex items-center gap-1.5"><UserCircle className="h-4 w-4 text-emerald-200" /> {req.assigned_user_name}</span>
            )}
            {req.assigned_role && (
              <span className="flex items-center gap-1.5"><ShieldCheck className="h-4 w-4 text-emerald-200" /> Role: {req.assigned_role}</span>
            )}
            {(req.lead_company || req.lead_name) && (
              <span className="flex items-center gap-1.5 sm:hidden" data-testid="mr-lead-tag">
                <Users className="h-4 w-4 text-emerald-200" /> Lead: {req.lead_company || req.lead_name}
              </span>
            )}
            <span className="flex items-center gap-1.5">
              <Calendar className="h-4 w-4 text-emerald-200" /> Due {fmtDate(req.requested_due_date)}
            </span>
            <span className="flex items-center gap-1.5">
              <Clock className="h-4 w-4 text-emerald-200" /> Design {req.design_lead_time_days}d &middot; Production {req.production_lead_time_days}d
            </span>
            <span className="flex items-center gap-1.5">
              <div className="w-6 h-6 rounded-full bg-white/20 border border-white/30 flex items-center justify-center text-[10px] font-semibold text-white">{getInitials(req.created_by_name)}</div>
              Raised by <span className="text-white font-medium">{req.created_by_name}</span>
            </span>
          </div>
        </div>
      </div>

      {/* Action bar — driven by /available-transitions */}
      <Card className="border border-emerald-100/60 rounded-xl shadow-[0_2px_8px_rgba(6,95,70,0.04)]">
        <CardContent className="p-4 flex items-center gap-2 flex-wrap">
          <span className="text-xs text-slate-500 mr-1">Actions:</span>
          {allowedTransitions.length === 0 && blockedTransitions.length === 0 && (
            <span className="text-xs text-slate-500 italic">(terminal state — no transitions defined)</span>
          )}
          {allowedTransitions.map((t) => {
            const guardBlocked = t.guards_ok === false;
            return (
              <Button
                key={`${t.action_key}-${t.to_state}`}
                variant="outline"
                size="sm"
                onClick={() => onActionClick(t)}
                disabled={savingTxn || guardBlocked}
                data-testid={`action-${t.action_key}-btn`}
                title={guardBlocked ? (t.block_reasons || []).join(' ') : `Moves to: ${t.to_state_label}`}
                className={guardBlocked ? 'opacity-50' : ''}
              >
                <ChevronRight className="h-3.5 w-3.5 mr-1" /> {t.action_label}
                {((t.required_fields || []).length > 0) && (
                  <span className="ml-1 text-[9px] text-emerald-600" title="Requires additional info">●</span>
                )}
              </Button>
            );
          })}
          {blockedTransitions.map((t) => (
            <Button
              key={`${t.action_key}-${t.to_state}-blocked`}
              variant="outline"
              size="sm"
              disabled
              title={t.requestor_only ? 'Only the requestor can do this' : "You don't have permission for this action"}
              data-testid={`action-${t.action_key}-blocked`}
              className="opacity-50"
            >
              <ChevronRight className="h-3.5 w-3.5 mr-1" /> {t.action_label}
            </Button>
          ))}
          <Button
            size="sm"
            variant="outline"
            className="ml-auto"
            onClick={openProdDialog}
            data-testid="attach-production-btn"
          >
            <Truck className="h-4 w-4 mr-2" />
            {req.production ? 'Update Production Payload' : 'Attach Production Payload'}
          </Button>
        </CardContent>
      </Card>

      {/* Body: Requirement + Inputs · Side panel */}
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
                <div className="flex flex-wrap gap-2.5 mt-2">
                  {req.logo && <FileAsset f={req.logo} canDelete={!req.production} onDelete={setFileToDelete} onPreview={setPreviewFile} />}
                  {(req.references || []).map(f => (
                    <FileAsset key={f.id} f={f} canDelete={!req.production} onDelete={setFileToDelete} onPreview={setPreviewFile} />
                  ))}
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
              <span className="text-[10px] uppercase tracking-wider text-emerald-700 font-semibold">Lifecycle</span>
              <p className="text-xs text-slate-700 mt-0.5">{req.state_machine_name || '—'}</p>
            </div>
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
            <Button size="sm" variant="outline" onClick={() => setShowVersion(true)} data-testid="add-version-btn">
              <Plus className="h-4 w-4 mr-1" /> Add Version
            </Button>
          </div>
          {(req.versions || []).length === 0 ? (
            <p className="text-xs text-slate-500 italic">No work versions uploaded yet.</p>
          ) : (
            <div className="space-y-3">
              {req.versions.map((v) => (
                <div key={v.id} className={`border rounded-lg p-3 ${v.is_approved ? 'border-emerald-300 bg-emerald-50/60 ring-1 ring-emerald-200' : 'border-emerald-100 bg-emerald-50/30'}`} data-testid={`version-card-${v.id}`}>
                  <div className="flex items-center justify-between flex-wrap gap-2 mb-2">
                    <span className="font-semibold text-slate-900 flex items-center gap-2">
                      {v.version_name}
                      {v.is_approved && (
                        <Badge className="bg-emerald-600 hover:bg-emerald-600 text-white text-[10px] gap-1" data-testid={`version-approved-badge-${v.id}`}>
                          <CheckCircle2 className="h-3 w-3" /> Approved{v.approved_by_name ? ` by ${v.approved_by_name}` : ''}
                        </Badge>
                      )}
                    </span>
                    <span className="text-xs text-slate-500">
                      <span className="font-medium text-slate-700">{v.uploaded_by_name}</span> &middot; {fmtDate(v.uploaded_at, 'dd MMM yyyy, hh:mm a')}
                    </span>
                  </div>
                  {v.comments && <p className="text-xs text-slate-700 italic mb-2">{v.comments}</p>}
                  <div className="flex flex-wrap gap-2.5 items-start">
                    {(v.files || []).map(f => <FileAsset key={f.id} f={f} onPreview={setPreviewFile} />)}
                    {(v.links || []).map((l, i) => (
                      <a key={i} href={l} target="_blank" rel="noopener noreferrer"
                        className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-md border border-emerald-100 bg-white text-xs hover:bg-emerald-50/60">
                        <ExternalLink className="h-3 w-3 text-emerald-600" /> {l.length > 40 ? l.slice(0, 40) + '…' : l}
                      </a>
                    ))}
                  </div>

                  {/* Approve / Revert control */}
                  <div className="mt-3 flex items-center gap-2">
                    {v.is_approved ? (
                      <Button
                        size="sm" variant="outline"
                        className="h-7 text-xs text-amber-700 border-amber-200 hover:bg-amber-50"
                        onClick={() => setVersionApproval(v.id, false)}
                        disabled={verBusy[v.id]}
                        data-testid={`version-revert-btn-${v.id}`}
                      >
                        <RotateCcw className="h-3.5 w-3.5 mr-1" /> Revert approval
                      </Button>
                    ) : (
                      <Button
                        size="sm"
                        className="h-7 text-xs bg-emerald-600 hover:bg-emerald-700"
                        onClick={() => setVersionApproval(v.id, true)}
                        disabled={verBusy[v.id]}
                        data-testid={`version-approve-btn-${v.id}`}
                      >
                        <CheckCircle2 className="h-3.5 w-3.5 mr-1" /> Approve this version
                      </Button>
                    )}
                  </div>

                  {/* Per-version comments thread */}
                  <div className="mt-3 pt-3 border-t border-emerald-100/70 space-y-2">
                    <div className="flex items-center gap-1.5 text-[11px] font-medium text-slate-600">
                      <MessageSquare className="h-3.5 w-3.5 text-emerald-600" /> Comments ({(v.comments_thread || []).length})
                    </div>
                    {(v.comments_thread || []).map((c) => (
                      <div key={c.id} className="text-xs bg-white border border-slate-200 rounded-md p-2" data-testid={`version-comment-${c.id}`}>
                        <div className="flex items-center justify-between gap-2 mb-0.5">
                          <span className="font-medium text-slate-800 flex items-center gap-1.5">
                            <div className="w-5 h-5 rounded-full bg-emerald-100 flex items-center justify-center text-[10px] font-medium text-emerald-700">{getInitials(c.user_name)}</div>
                            {c.user_name}
                          </span>
                          <span className="text-[10px] text-slate-500">{fmtDate(c.created_at, 'dd MMM, hh:mm a')}</span>
                        </div>
                        <p className="whitespace-pre-wrap pl-7 text-slate-700">{c.text}</p>
                      </div>
                    ))}
                    <div className="flex gap-2">
                      <Input
                        value={verComment[v.id] || ''}
                        onChange={(e) => setVerComment((p) => ({ ...p, [v.id]: e.target.value }))}
                        onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); addVersionComment(v.id); } }}
                        placeholder="Add a comment on this version…"
                        className="h-8 text-xs"
                        data-testid={`version-comment-input-${v.id}`}
                      />
                      <Button
                        size="sm"
                        className="h-8 bg-emerald-600 hover:bg-emerald-700"
                        onClick={() => addVersionComment(v.id)}
                        disabled={verBusy[v.id] || !(verComment[v.id] || '').trim()}
                        data-testid={`version-comment-send-${v.id}`}
                      >
                        {verBusy[v.id] ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
                      </Button>
                    </div>
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
                    {c.kind !== 'comment' && (
                      <Badge variant="outline" className="text-[9px] bg-white border-slate-200">{c.kind.replace('_', ' ')}</Badge>
                    )}
                  </span>
                  <span className="text-[10px] text-slate-500">{fmtDate(c.created_at, 'dd MMM, hh:mm a')}</span>
                </div>
                <p className="whitespace-pre-wrap pl-7">{c.text}</p>
              </div>
            ))}
          </div>
          <div className="flex gap-2 pt-1">
            <Textarea rows={2} value={comment} onChange={(e) => setComment(e.target.value)} placeholder="Add a comment…" data-testid="mr-comment-input" />
            <Button onClick={addComment} size="sm" disabled={!comment.trim()} className="bg-emerald-600 hover:bg-emerald-700 self-start" data-testid="mr-comment-send-btn">
              <Send className="h-4 w-4" />
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Transition confirm dialog (only for comment_required transitions) */}
      <Dialog open={!!confirmTxn} onOpenChange={(o) => { if (!o) setConfirmTxn(null); }}>
        <DialogContent className="max-w-md" data-testid="transition-confirm-dialog">
          <DialogHeader>
            <DialogTitle>{confirmTxn?.action_label}</DialogTitle>
            <DialogDescription>
              Moves to <span className="font-semibold">{confirmTxn?.to_state_label}</span>.
              {confirmTxn?.comment_required && ' A comment is required for this action.'}
            </DialogDescription>
          </DialogHeader>
          <Textarea
            rows={3}
            value={txnComment}
            onChange={(e) => setTxnComment(e.target.value)}
            placeholder="Add a comment…"
            data-testid="transition-comment-input"
          />
          <DialogFooter>
            <Button variant="outline" onClick={() => setConfirmTxn(null)}>Cancel</Button>
            <Button
              onClick={() => runTransition(confirmTxn.action_key, txnComment)}
              disabled={savingTxn || (confirmTxn?.comment_required && !txnComment.trim())}
              data-testid="transition-confirm-btn"
            >
              {savingTxn ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Confirm'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Required-field capture dialog — for transitions that collect new data */}
      <Dialog open={!!fieldTxn} onOpenChange={(o) => { if (!o) setFieldTxn(null); }}>
        <DialogContent className="max-w-md" data-testid="transition-fields-dialog">
          <DialogHeader>
            <DialogTitle>{fieldTxn?.action_label}</DialogTitle>
            <DialogDescription>
              Moves to <span className="font-semibold">{fieldTxn?.to_state_label}</span>. Please provide the required information.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            {(fieldTxn?.required_fields || []).map((f) => (
              <div key={f.key}>
                <Label>{f.label}{f.required ? ' *' : ''}</Label>
                {f.type === 'number' && (
                  <Input
                    type="number"
                    min={f.min ?? undefined}
                    max={f.max ?? undefined}
                    value={fieldValues[f.key] ?? ''}
                    onChange={(e) => setFieldValues((p) => ({ ...p, [f.key]: e.target.value }))}
                    data-testid={`txn-field-${f.key}`}
                  />
                )}
                {f.type === 'date' && (
                  <Input
                    type="date"
                    value={fieldValues[f.key] ?? ''}
                    onChange={(e) => setFieldValues((p) => ({ ...p, [f.key]: e.target.value }))}
                    data-testid={`txn-field-${f.key}`}
                  />
                )}
                {f.type === 'select' && (
                  <Select value={fieldValues[f.key] ?? ''} onValueChange={(v) => setFieldValues((p) => ({ ...p, [f.key]: v }))}>
                    <SelectTrigger data-testid={`txn-field-${f.key}`}><SelectValue placeholder="Select…" /></SelectTrigger>
                    <SelectContent>
                      {(f.options || []).map((o) => (<SelectItem key={o} value={o}>{o}</SelectItem>))}
                    </SelectContent>
                  </Select>
                )}
                {(!f.type || f.type === 'text') && (
                  <Textarea
                    rows={2}
                    value={fieldValues[f.key] ?? ''}
                    onChange={(e) => setFieldValues((p) => ({ ...p, [f.key]: e.target.value }))}
                    data-testid={`txn-field-${f.key}`}
                  />
                )}
              </div>
            ))}
            {fieldTxn?.comment_required && (
              <div>
                <Label>Comment *</Label>
                <Textarea rows={2} value={txnComment} onChange={(e) => setTxnComment(e.target.value)} data-testid="txn-field-comment" />
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setFieldTxn(null)}>Cancel</Button>
            <Button onClick={submitFieldTxn} disabled={savingTxn} className="bg-emerald-600 hover:bg-emerald-700" data-testid="transition-fields-submit-btn">
              {savingTxn ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Confirm'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Add Version Dialog */}
      <Dialog open={showVersion} onOpenChange={setShowVersion}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Add Work Version</DialogTitle>
            <DialogDescription>Upload a new version of the work along with files, links and reviewer notes.</DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div className="flex items-center gap-2 rounded-md border border-emerald-100 bg-emerald-50/50 px-3 py-2">
              <span className="text-xs text-slate-600">Version number</span>
              <Badge variant="outline" className="bg-white text-emerald-700 border-emerald-200 font-semibold" data-testid="next-version-badge">
                V{(req?.versions?.length || 0) + 1}
              </Badge>
              <span className="text-[11px] text-slate-400 ml-auto">Assigned automatically</span>
            </div>
            <div>
              <Label className="mb-2 block">Files</Label>
              <FileDropzone
                onFiles={handleVersionFiles}
                multiple
                busy={versionBusy}
                title="Drop work files here, or click to browse"
                hint="Images, PDFs, decks — add as many as needed"
                testId="version-files-dropzone"
              />
              <div className="flex flex-wrap gap-1.5 mt-2">
                {versionFiles.map((f) => (
                  <Badge key={f.id} variant="outline" className="text-xs bg-white py-1">
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
            <Button onClick={addVersion} disabled={savingVersion} className="bg-emerald-600 hover:bg-emerald-700">
              {savingVersion ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" /> Saving…</> : <><Upload className="h-4 w-4 mr-2" /> Save Version</>}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Production submit dialog */}
      <Dialog open={showProd} onOpenChange={setShowProd}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Attach Production Payload</DialogTitle>
            <DialogDescription>Capture quantity, target date and delivery team. State transitions are still driven by the lifecycle actions.</DialogDescription>
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
              {savingProd ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" /> Saving…</> : <><Truck className="h-4 w-4 mr-2" /> Save</>}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete attachment confirm dialog */}
      <Dialog open={!!fileToDelete} onOpenChange={(o) => { if (!o) setFileToDelete(null); }}>
        <DialogContent className="max-w-sm" data-testid="delete-file-dialog">
          <DialogHeader>
            <DialogTitle>Remove attachment?</DialogTitle>
            <DialogDescription>
              "{fileToDelete?.filename}" will be permanently removed from this request. This action cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setFileToDelete(null)} data-testid="delete-file-cancel-btn">Cancel</Button>
            <Button
              onClick={confirmDeleteFile}
              disabled={deletingFile}
              className="bg-red-600 hover:bg-red-700"
              data-testid="delete-file-confirm-btn"
            >
              {deletingFile ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" /> Removing…</> : <><Trash2 className="h-4 w-4 mr-2" /> Remove</>}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* File preview lightbox */}
      <FilePreviewDialog file={previewFile} onClose={() => setPreviewFile(null)} />
    </div>
  );
}
