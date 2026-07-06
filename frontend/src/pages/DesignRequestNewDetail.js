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
import MentionTextarea, { renderMentionedText } from '../components/MentionTextarea';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from '../components/ui/dialog';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '../components/ui/select';
import { Popover, PopoverContent, PopoverTrigger } from '../components/ui/popover';
import { Calendar as CalendarPicker } from '../components/ui/calendar';
import {
  ArrowLeft, Send, MessageSquare, Plus, Upload, FileText, X,
  Loader2, ExternalLink, ChevronRight, Truck, AlertTriangle, Clock,
  Tag, Calendar, Building2, Image as ImageIcon, Link as LinkIcon,
  UserCircle, ShieldCheck, Users, Download, Trash2,
  Eye, FileImage, FileSpreadsheet, Presentation, Film, Music, FileArchive, File,
  CheckCircle2, RotateCcw, Hourglass, History, CalendarCheck, Pencil, Copy, Printer, Flame, Lock, ChevronDown,
} from 'lucide-react';
import { toast } from 'sonner';
import { useAuth } from '../context/AuthContext';
import { useTenantConfig } from '../context/TenantConfigContext';
import { SendForPrintingDialog } from '../components/SendForPrintingDialog';

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

// Age + duration helpers
const ageDays = (s) => { try { return Math.max(0, Math.floor((Date.now() - parseISO(s).getTime()) / 86400000)); } catch { return null; } };
const ageLabel = (s) => { const n = ageDays(s); if (n === null) return '—'; return n === 0 ? 'Today' : n === 1 ? '1 day old' : `${n} days old`; };
const fmtDuration = (ms) => {
  if (!Number.isFinite(ms) || ms < 0) ms = 0;
  const days = Math.floor(ms / 86400000);
  const hours = Math.floor((ms % 86400000) / 3600000);
  const mins = Math.floor((ms % 3600000) / 60000);
  if (days >= 1) return `${days}d ${hours}h`;
  if (hours >= 1) return `${hours}h ${mins}m`;
  return `${mins}m`;
};

// Age pill — color tiers: ≤2d emerald, ≤7d amber, >7d red.
const AgePill = ({ createdAt, className = '' }) => {
  const n = ageDays(createdAt);
  if (n === null) return null;
  const tier = n <= 2
    ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
    : n <= 7
      ? 'bg-amber-50 text-amber-700 border-amber-200'
      : 'bg-red-50 text-red-600 border-red-200';
  return (
    <span className={`inline-flex items-center gap-1 text-[11px] font-medium px-2 py-0.5 rounded-full border ${tier} ${className}`} title={`Created ${fmtDate(createdAt)}`} data-testid="mr-age-pill">
      <Hourglass className="h-3 w-3" /> {ageLabel(createdAt)}
    </span>
  );
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

// Map a workflow transition to a semantic intent color + icon for the Action Hub CTAs.
const actionMeta = (t) => {
  const k = `${t.action_key || ''} ${t.action_label || ''} ${t.to_state || ''} ${t.to_state_label || ''}`.toLowerCase();
  if (/(reject|cancel|block|hold|decline|abort|scrap)/.test(k))
    return { cls: 'bg-rose-500 hover:bg-rose-400 text-white', Icon: AlertTriangle };
  if (/(approve|final|complete|accept|sign.?off|ready|done)/.test(k))
    return { cls: 'bg-emerald-500 hover:bg-emerald-400 text-white', Icon: CheckCircle2 };
  if (/(review|submit)/.test(k))
    return { cls: 'bg-indigo-500 hover:bg-indigo-400 text-white', Icon: Eye };
  if (/(input|change|revis|clarif|need|request|rework|redo)/.test(k))
    return { cls: 'bg-amber-400 hover:bg-amber-300 text-stone-900', Icon: MessageSquare };
  if (/(production|print|dispatch|ship|manufactur)/.test(k))
    return { cls: 'bg-violet-500 hover:bg-violet-400 text-white', Icon: Truck };
  if (/(start|work|progress|begin|pick|assign)/.test(k))
    return { cls: 'bg-emerald-400 hover:bg-emerald-300 text-stone-900', Icon: ChevronRight };
  return { cls: 'bg-white hover:bg-stone-100 text-stone-900', Icon: ChevronRight };
};

const downloadFileBlob = async (f) => {
  const res = await axios.get(`${API}/design-requests-new/files/${f.id}`, { headers: HEAD(), responseType: 'blob' });
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
      .get(`${API}/design-requests-new/files/${f.id}`, { headers: HEAD(), responseType: 'blob' })
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
      .get(`${API}/design-requests-new/files/${file.id}`, { headers: HEAD(), responseType: 'blob' })
      .then((res) => { if (!active) return; objUrl = URL.createObjectURL(res.data); setUrl(objUrl); })
      .catch(() => toast.error('Preview failed'))
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; if (objUrl) URL.revokeObjectURL(objUrl); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
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
              <p className="mt-3 text-sm text-slate-600">Inline preview isn&apos;t available for this file type.</p>
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


export default function DesignRequestNewDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { user } = useAuth();
  const { hasActionPermission } = useTenantConfig();
  const canDelete = hasActionPermission('design_requests_new', 'delete');  const [req, setReq] = useState(null);
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

  // Production submit dialog state — REMOVED (superseded by Send for Printing flow)

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

  // Estimated finished date popover editor
  const [estOpen, setEstOpen] = useState(false);
  const [savingEst, setSavingEst] = useState(false);

  // Delete-request confirm state
  const [showDeleteReq, setShowDeleteReq] = useState(false);
  const [deletingReq, setDeletingReq] = useState(false);

  // Send for printing
  const [showSendPrint, setShowSendPrint] = useState(false);

  const fetchAll = useCallback(async () => {
    setLoading(true);
    try {
      const [r1, r2] = await Promise.all([
        axios.get(`${API}/design-requests-new/${id}`, { headers: HEAD() }),
        axios.get(`${API}/design-requests-new/${id}/available-transitions`, { headers: HEAD() }),
      ]);
      setReq(r1.data);
      setTransitions(r2.data?.transitions || []);
    } catch {
      toast.error('Failed to load request');
      navigate('/design-requests-new');
    } finally { setLoading(false); }
  }, [id, navigate]);
  useEffect(() => { fetchAll(); }, [fetchAll]);

  const runTransition = async (action_key, commentText, fieldData) => {
    setSavingTxn(true);
    try {
      await axios.post(`${API}/design-requests-new/${id}/transition`,
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

  const copyComment = async (text) => {
    const value = text || '';
    try {
      if (navigator.clipboard && window.isSecureContext) {
        await navigator.clipboard.writeText(value);
      } else {
        const ta = document.createElement('textarea');
        ta.value = value;
        ta.style.position = 'fixed';
        ta.style.opacity = '0';
        document.body.appendChild(ta);
        ta.focus();
        ta.select();
        document.execCommand('copy');
        document.body.removeChild(ta);
      }
      toast.success('Comment copied');
    } catch {
      // Last-resort fallback
      try {
        const ta = document.createElement('textarea');
        ta.value = value;
        ta.style.position = 'fixed';
        ta.style.opacity = '0';
        document.body.appendChild(ta);
        ta.select();
        document.execCommand('copy');
        document.body.removeChild(ta);
        toast.success('Comment copied');
      } catch {
        toast.error('Could not copy');
      }
    }
  };

  const saveEstDate = async (isoOrNull) => {
    setSavingEst(true);
    try {
      const { data } = await axios.patch(
        `${API}/design-requests-new/${id}/estimated-date`,
        { estimated_finished_date: isoOrNull },
        { headers: HEAD() },
      );
      setReq((p) => ({ ...p, estimated_finished_date: data.estimated_finished_date }));
      setEstOpen(false);
      toast.success(data.estimated_finished_date ? 'Estimated finish date saved' : 'Estimated finish date cleared');
    } catch (e) {
      toast.error(e.response?.data?.detail || 'Failed to save date');
    } finally { setSavingEst(false); }
  };

  const [savingUrgent, setSavingUrgent] = useState(false);
  const toggleUrgent = async () => {
    const next = !req?.is_urgent;
    setSavingUrgent(true);
    try {
      const { data } = await axios.patch(
        `${API}/design-requests-new/${id}/urgent`,
        { is_urgent: next },
        { headers: HEAD() },
      );
      setReq((p) => ({ ...p, is_urgent: data.is_urgent }));
      toast.success(next ? 'Marked as urgent' : 'Urgent flag removed');
    } catch (e) {
      toast.error(e.response?.data?.detail || 'Failed to update urgency');
    } finally { setSavingUrgent(false); }
  };

  const confirmDeleteRequest = async () => {
    setDeletingReq(true);
    try {
      await axios.delete(`${API}/design-requests-new/${id}`, { headers: HEAD() });
      toast.success('Design request deleted');
      navigate('/design-requests-new');
    } catch (e) {
      toast.error(e.response?.data?.detail || 'Failed to delete request');
      setDeletingReq(false);
    }
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
      await axios.post(`${API}/design-requests-new/${id}/comments`, { text: comment.trim() }, { headers: HEAD() });
      setComment('');
      fetchAll();
    } catch (e) { toast.error(e.response?.data?.detail || 'Failed to add comment'); }
  };

  const uploadFile = async (file) => {
    const fd = new FormData();
    fd.append('file', file);
    const res = await axios.post(`${API}/design-requests-new/upload`, fd, {
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
      const { data } = await axios.post(`${API}/design-requests-new/${id}/versions`, {
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
      await axios.post(`${API}/design-requests-new/${id}/versions/${versionId}/comments`, { text }, { headers: HEAD() });
      setVerComment((p) => ({ ...p, [versionId]: '' }));
      fetchAll();
    } catch (e) { toast.error(e.response?.data?.detail || 'Failed to add comment'); }
    finally { setVerBusy((p) => ({ ...p, [versionId]: false })); }
  };

  const setVersionApproval = async (versionId, approve) => {
    setVerBusy((p) => ({ ...p, [versionId]: true }));
    try {
      await axios.post(`${API}/design-requests-new/${id}/versions/${versionId}/${approve ? 'approve' : 'unapprove'}`, {}, { headers: HEAD() });
      toast.success(approve ? 'Version approved' : 'Approval reverted');
      fetchAll();
    } catch (e) { toast.error(e.response?.data?.detail || 'Action failed'); }
    finally { setVerBusy((p) => ({ ...p, [versionId]: false })); }
  };

  const [versionToDelete, setVersionToDelete] = useState(null);
  const [deletingVersion, setDeletingVersion] = useState(false);
  const confirmDeleteVersion = async () => {
    if (!versionToDelete) return;
    setDeletingVersion(true);
    try {
      await axios.delete(`${API}/design-requests-new/${id}/versions/${versionToDelete.id}`, { headers: HEAD() });
      toast.success(`${versionToDelete.version_name || 'Version'} deleted`);
      setVersionToDelete(null);
      fetchAll();
    } catch (e) { toast.error(e.response?.data?.detail || 'Failed to delete version'); }
    finally { setDeletingVersion(false); }
  };

  const allowedTransitions = useMemo(() => transitions.filter(t => t.allowed), [transitions]);

  const statusTimeline = useMemo(() => {
    const hist = (req?.status_history || []).slice().sort((a, b) => new Date(a.entered_at) - new Date(b.entered_at));
    const now = Date.now();
    const segments = hist.map((h, i) => {
      const start = new Date(h.entered_at).getTime();
      const end = i < hist.length - 1 ? new Date(hist[i + 1].entered_at).getTime() : now;
      return { ...h, start, end, ms: Math.max(0, end - start), ongoing: i === hist.length - 1 };
    });
    const total = segments.reduce((s, x) => s + x.ms, 0) || 1;
    const aggMap = {};
    segments.forEach((s) => {
      if (!aggMap[s.state_key]) aggMap[s.state_key] = { state_key: s.state_key, state_label: s.state_label, state_color: s.state_color || '#94a3b8', ms: 0 };
      aggMap[s.state_key].ms += s.ms;
    });
    const agg = Object.values(aggMap).sort((a, b) => b.ms - a.ms);
    const backfilled = hist.some((h) => h.backfilled);
    const currentMs = segments.length ? segments[segments.length - 1].ms : 0;
    return { segments, total, agg, backfilled, currentMs };
  }, [req]);
  const [statusHistoryOpen, setStatusHistoryOpen] = useState(false);
  const { daysInStatus, totalDaysElapsed } = useMemo(() => {
    const DAY = 86400000;
    const createdMs = req?.created_at ? new Date(req.created_at).getTime() : null;
    const segs = statusTimeline.segments;
    const curEnteredMs = segs.length ? new Date(segs[segs.length - 1].entered_at).getTime() : createdMs;
    const now = Date.now();
    const inStatus = Number.isFinite(curEnteredMs) ? Math.max(1, Math.ceil((now - curEnteredMs) / DAY)) : 0;
    const total = Number.isFinite(createdMs) ? Math.max(inStatus, Math.ceil((now - createdMs) / DAY)) : 0;
    return { daysInStatus: inStatus, totalDaysElapsed: total };
  }, [req, statusTimeline]);
  const blockedTransitions = useMemo(() => transitions.filter(t => !t.allowed), [transitions]);

  const confirmDeleteFile = async () => {
    if (!fileToDelete) return;
    setDeletingFile(true);
    try {
      await axios.delete(`${API}/design-requests-new/${id}/files/${fileToDelete.id}`, { headers: HEAD() });
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
  const canSendToPrint = ['final_approved', 'production_in_progress', 'production_completed'].includes(req.current_state_key) || !!req.current_state_is_terminal;

  return (
    <div className="p-4 md:p-6 lg:p-8 max-w-[1400px] mx-auto space-y-6 bg-stone-50 min-h-screen" data-testid="mr-detail-page">
      <div className="flex items-center justify-between">
        <Button variant="ghost" size="sm" onClick={() => navigate('/design-requests-new')} data-testid="mr-back-btn">
          <ArrowLeft className="h-4 w-4 mr-2" /> Back to Design Requests
        </Button>
        <div className="flex items-center gap-2">
          {((user?.id && req?.created_by && user.id === req.created_by) || hasActionPermission('design_requests_new', 'edit')) && (
            <Button
              variant="outline"
              size="sm"
              onClick={toggleUrgent}
              disabled={savingUrgent}
              className={req.is_urgent
                ? 'text-red-700 border-red-300 bg-red-50 hover:bg-red-100'
                : 'text-slate-600 border-slate-200 hover:bg-red-50 hover:text-red-700 hover:border-red-200'}
              data-testid="mr-urgent-toggle-btn"
            >
              {savingUrgent ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Flame className={`h-4 w-4 mr-2 ${req.is_urgent ? 'fill-red-500' : ''}`} />}
              {req.is_urgent ? 'Urgent' : 'Mark Urgent'}
            </Button>
          )}
          {canSendToPrint && (
            <Button
              size="sm"
              onClick={() => setShowSendPrint(true)}
              className="bg-emerald-600 hover:bg-emerald-700"
              data-testid="mr-send-print-btn"
            >
              <Printer className="h-4 w-4 mr-2" /> Send for Printing
            </Button>
          )}
          {((user?.id && req?.created_by && user.id === req.created_by) || hasActionPermission('design_requests_new', 'edit')) && (
            <Button
              variant="outline"
              size="sm"
              onClick={() => navigate(`/design-requests-new/${id}/edit`)}
              className="text-emerald-700 border-emerald-200 hover:bg-emerald-50"
              data-testid="mr-edit-request-btn"
            >
              <Pencil className="h-4 w-4 mr-2" /> Edit Request
            </Button>
          )}
          {canDelete && (
            <Button
              variant="outline"
              size="sm"
              onClick={() => setShowDeleteReq(true)}
              className="text-red-600 border-red-200 hover:bg-red-50 hover:text-red-700"
              data-testid="mr-delete-request-btn"
            >
              <Trash2 className="h-4 w-4 mr-2" /> Delete Request
            </Button>
          )}
        </div>
      </div>

      {/* Hero header — light, contemporary surface with emerald accents */}
      <div className="relative overflow-hidden rounded-3xl bg-white border border-slate-200/70 p-6 md:p-8 shadow-[0_10px_40px_-15px_rgba(6,78,59,0.18)]" data-testid="mr-hero">
        {req.lead_city && (
          <div
            className="absolute top-0 left-0 w-28 h-28 overflow-hidden pointer-events-none z-20"
            title={`Lead city: ${req.lead_city}`}
            data-testid="mr-city-ribbon"
          >
            <div
              className="absolute top-[22px] -left-[34px] w-[150px] -rotate-45 text-white text-[11px] font-bold uppercase tracking-widest text-center py-1 shadow-md"
              style={req.lead_city_color
                ? { backgroundColor: req.lead_city_color }
                : { backgroundImage: 'linear-gradient(to right, #0d9488, #059669)' }}
            >
              {req.lead_city.slice(0, 3).toUpperCase()}
            </div>
          </div>
        )}
        <div className="absolute -right-24 -top-24 w-72 h-72 rounded-full bg-emerald-100/40 blur-3xl pointer-events-none" />
        <div className="absolute left-0 top-0 h-full w-1.5 bg-gradient-to-b from-emerald-400 to-emerald-600" />
        <div className="relative flex flex-col lg:flex-row lg:items-start lg:justify-between gap-5">
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2 mb-4 flex-wrap">
              <span className="inline-flex items-center gap-1.5 text-[11px] font-medium px-2.5 py-1 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-100 font-mono">
                <Tag className="h-3 w-3" /> {req.request_number}
              </span>
              <Badge
                variant="outline"
                style={stateStyle}
                className="border shadow-sm"
                data-testid="mr-current-state-badge"
              >
                {req.current_state_label || req.current_state_key}
              </Badge>
              {overdue && (
                <Badge variant="outline" className="text-xs bg-red-50 text-red-600 border-red-200">
                  <AlertTriangle className="h-3 w-3 mr-1" /> Overdue
                </Badge>
              )}
              {req.is_urgent && (
                <Badge className="text-xs bg-red-600 hover:bg-red-600 text-white border-red-600" data-testid="mr-urgent-badge">
                  <Flame className="h-3 w-3 mr-1" /> URGENT
                </Badge>
              )}
              {req.short_timeline_reason && (
                <Badge variant="outline" className="text-xs bg-amber-50 text-amber-700 border-amber-200">
                  <Clock className="h-3 w-3 mr-1" /> Tight Timeline
                </Badge>
              )}
              <AgePill createdAt={req.created_at} />
              {totalDaysElapsed > 0 && (
                <span
                  className="inline-flex items-center gap-1.5 text-[11px] font-semibold px-2.5 py-1 rounded-full bg-slate-100 text-slate-700 border border-slate-200"
                  title={`In current status for ${daysInStatus} day(s) · ${totalDaysElapsed} day(s) total since raised`}
                  data-testid="mr-status-days"
                >
                  <Clock className="h-3 w-3 text-emerald-500" /> {daysInStatus} / {totalDaysElapsed} days
                </span>
              )}
            </div>
            <div className="flex items-start gap-3.5">
              <div className="hidden sm:flex h-12 w-12 rounded-2xl bg-white border border-slate-200 items-center justify-center shadow-sm shrink-0 overflow-hidden" title={req.request_type_name || 'Request type'} data-testid="mr-type-icon">
                {req.request_type_icon_url
                  ? <img src={`${process.env.REACT_APP_BACKEND_URL}${req.request_type_icon_url}`} alt={req.request_type_name || 'Type'} className="h-8 w-8 object-contain" />
                  : <FileImage className="h-6 w-6 text-emerald-500" />}
              </div>
              <div className="min-w-0">
                <h1 className="text-2xl md:text-3xl font-bold tracking-tight text-slate-900 leading-tight">
                  {req.request_type_name || 'Untyped Request'}
                </h1>
                <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 mt-2 text-[13px] text-slate-500">
                  <span className="flex items-center gap-1.5"><Building2 className="h-3.5 w-3.5 text-slate-400" /> {req.assigned_department_name || '—'}</span>
                  {(req.lead_company || req.lead_name) && (
                    <span className="flex items-center gap-1.5 lg:hidden" data-testid="mr-lead-tag">
                      <Users className="h-3.5 w-3.5 text-slate-400" /> {req.lead_company || req.lead_name}
                    </span>
                  )}
                  <span className="flex items-center gap-1.5">
                    <Clock className="h-3.5 w-3.5 text-slate-400" /> Design {req.design_lead_time_days}d · Prod {req.production_lead_time_days}d
                  </span>
                  <span className="flex items-center gap-1.5">
                    <div className="w-5 h-5 rounded-full bg-slate-100 flex items-center justify-center text-[9px] font-semibold text-slate-600">{getInitials(req.created_by_name)}</div>
                    {req.created_by_name}
                  </span>
                </div>
              </div>
            </div>

            {/* Dates — highlighted separately for quick scanning */}
            <div className="flex flex-wrap items-stretch gap-2 mt-4 sm:pl-[62px]">
              <div className={`inline-flex items-center gap-2.5 rounded-xl border px-3 py-2 ${overdue ? 'bg-red-50 border-red-200' : 'bg-white border-slate-200'}`} data-testid="mr-due-chip">
                <Calendar className={`h-4 w-4 shrink-0 ${overdue ? 'text-red-500' : 'text-emerald-600'}`} />
                <div className="leading-tight">
                  <p className="text-[9px] uppercase tracking-wider text-slate-400 font-semibold">Due Date</p>
                  <p className={`text-sm font-bold ${overdue ? 'text-red-600' : 'text-slate-900'}`}>{fmtDate(req.requested_due_date)}</p>
                </div>
              </div>
              <Popover open={estOpen} onOpenChange={setEstOpen}>
                <PopoverTrigger asChild>
                  <button
                    className="inline-flex items-center gap-2.5 rounded-xl border border-slate-200 bg-white px-3 py-2 hover:border-emerald-300 hover:bg-emerald-50/30 transition-colors group text-left"
                    data-testid="mr-est-date-display"
                  >
                    <CalendarCheck className="h-4 w-4 text-emerald-600 shrink-0" />
                    <div className="leading-tight">
                      <p className="text-[9px] uppercase tracking-wider text-slate-400 font-semibold">Est. Finish</p>
                      <p className="text-sm font-bold text-slate-900 flex items-center gap-1.5">
                        {req.estimated_finished_date
                          ? fmtDate(req.estimated_finished_date)
                          : <span className="text-emerald-600 font-medium">Set date</span>}
                        {savingEst
                          ? <Loader2 className="h-3 w-3 animate-spin text-emerald-500" />
                          : <Pencil className="h-3 w-3 text-slate-300 group-hover:text-emerald-500 transition-colors" />}
                      </p>
                    </div>
                  </button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0" align="start" data-testid="mr-est-date-popover">
                  <CalendarPicker
                    mode="single"
                    selected={req.estimated_finished_date ? parseISO(req.estimated_finished_date) : undefined}
                    onSelect={(d) => { if (d) saveEstDate(format(d, 'yyyy-MM-dd')); }}
                    initialFocus
                  />
                  {req.estimated_finished_date && (
                    <div className="border-t border-slate-100 p-2">
                      <Button
                        variant="ghost"
                        size="sm"
                        className="w-full text-red-600 hover:text-red-700 hover:bg-red-50"
                        onClick={() => saveEstDate(null)}
                        disabled={savingEst}
                        data-testid="mr-est-date-clear"
                      >
                        <X className="h-4 w-4 mr-1" /> Clear date
                      </Button>
                    </div>
                  )}
                </PopoverContent>
              </Popover>
            </div>
          </div>

          {/* Right rail: prominent assignee + associated lead */}
          <div className="flex flex-col gap-3 w-full lg:w-64 lg:shrink-0">
            <div className="rounded-2xl bg-white border border-emerald-100 px-4 py-3 shadow-sm" data-testid="mr-assigned-to">
              <p className="text-[10px] uppercase tracking-wider text-emerald-600 font-semibold flex items-center gap-1.5">
                <UserCircle className="h-3.5 w-3.5" /> Currently Assigned To
              </p>
              {req.assigned_user_name ? (
                <div className="flex items-center gap-2.5 mt-2">
                  <div className="w-9 h-9 rounded-full bg-gradient-to-br from-emerald-500 to-emerald-600 text-white flex items-center justify-center text-xs font-bold shrink-0 shadow-sm">
                    {getInitials(req.assigned_user_name)}
                  </div>
                  <div className="min-w-0">
                    <p className="text-sm font-bold text-slate-900 truncate">{req.assigned_user_name}</p>
                    <p className="text-[11px] text-slate-500 truncate">
                      {req.assigned_department_name || (req.assigned_role ? `Role: ${req.assigned_role}` : 'Team member')}
                    </p>
                  </div>
                </div>
              ) : (
                <div className="flex items-center gap-2.5 mt-2">
                  <div className="w-9 h-9 rounded-full bg-emerald-100 border border-emerald-200 text-emerald-600 flex items-center justify-center shrink-0">
                    {req.assigned_role ? <ShieldCheck className="h-4 w-4" /> : <Building2 className="h-4 w-4" />}
                  </div>
                  <div className="min-w-0">
                    <p className="text-sm font-bold text-slate-900 truncate">
                      {req.assigned_department_name || (req.assigned_role ? `Role: ${req.assigned_role}` : 'Unassigned')}
                    </p>
                    <p className="text-[11px] text-slate-500 truncate">{req.assigned_department_name ? 'Department' : ''}</p>
                  </div>
                </div>
              )}
            </div>
            {(req.lead_company || req.lead_name) && (
              <div className="hidden lg:flex items-center gap-3 rounded-2xl bg-emerald-50/70 border border-emerald-100 px-4 py-3" data-testid="mr-hero-lead">
                <div className="w-11 h-11 rounded-xl bg-gradient-to-br from-emerald-500 to-emerald-600 flex items-center justify-center shrink-0 shadow-sm shadow-emerald-600/20">
                  <Users className="h-5 w-5 text-white" />
                </div>
                <div className="min-w-0">
                  <p className="text-[10px] uppercase tracking-wider text-emerald-600 font-semibold">Associated Lead</p>
                  <p className="text-sm font-bold text-slate-900 truncate">{req.lead_company || req.lead_name}</p>
                  {req.lead_company && req.lead_name && req.lead_company !== req.lead_name && (
                    <p className="text-[11px] text-slate-500 truncate">{req.lead_name}</p>
                  )}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Action Hub relocated to the Command Center right rail */}

      {/* Bento — deep content · Command Center */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
        {/* LEFT — deep content */}
        <div className="lg:col-span-8 space-y-5">
        <Card className="border border-emerald-100/60 rounded-2xl shadow-[0_2px_8px_rgba(6,95,70,0.04)]">
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

        {/* details relocated to Command Center right rail */}

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
                  <div className="flex items-center justify-between flex-wrap gap-2 mb-3">
                    <span className="font-semibold text-slate-900 flex items-center gap-2">
                      {v.version_name}
                      {v.is_approved && (
                        <Badge className="bg-emerald-600 hover:bg-emerald-600 text-white text-[10px] gap-1" data-testid={`version-approved-badge-${v.id}`}>
                          <CheckCircle2 className="h-3 w-3" /> Chosen{v.approved_by_name ? ` by ${v.approved_by_name}` : ''}
                        </Badge>
                      )}
                    </span>
                    <span className="text-xs text-slate-500">
                      <span className="font-medium text-slate-700">{v.uploaded_by_name}</span> &middot; {fmtDate(v.uploaded_at, 'dd MMM yyyy, hh:mm a')}
                    </span>
                  </div>
                  {v.comments && <p className="text-xs text-slate-700 italic mb-3">{v.comments}</p>}

                  {/* Actions (left) + file preview / links (right) — compact side-by-side */}
                  <div className="flex items-stretch gap-4 flex-col sm:flex-row">
                    <div className="flex flex-col justify-center gap-2 w-full sm:w-56 shrink-0">
                      {v.is_approved ? (
                        <Button
                          variant="outline"
                          className="h-11 w-full justify-center text-sm font-medium text-amber-700 border-amber-300 hover:bg-amber-50 hover:text-amber-800"
                          onClick={() => setVersionApproval(v.id, false)}
                          disabled={verBusy[v.id]}
                          data-testid={`version-revert-btn-${v.id}`}
                        >
                          {verBusy[v.id] ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <RotateCcw className="h-4 w-4 mr-2" />} Unselect
                        </Button>
                      ) : (
                        <Button
                          className="h-11 w-full justify-center text-sm font-semibold bg-emerald-600 hover:bg-emerald-700 shadow-sm"
                          onClick={() => setVersionApproval(v.id, true)}
                          disabled={verBusy[v.id]}
                          data-testid={`version-approve-btn-${v.id}`}
                        >
                          {verBusy[v.id] ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <CheckCircle2 className="h-4 w-4 mr-2" />} Choose this design
                        </Button>
                      )}
                      {!req.production && (
                        <Button
                          variant="outline"
                          className="h-11 w-full justify-center text-sm font-medium text-red-600 border-red-200 hover:bg-red-50 hover:text-red-700"
                          onClick={() => setVersionToDelete(v)}
                          disabled={verBusy[v.id] || deletingVersion}
                          data-testid={`version-delete-btn-${v.id}`}
                        >
                          <Trash2 className="h-4 w-4 mr-2" /> Delete
                        </Button>
                      )}
                    </div>

                    <div className="flex flex-wrap gap-2.5 items-start flex-1 min-w-0">
                      {(v.files || []).map(f => <FileAsset key={f.id} f={f} onPreview={setPreviewFile} />)}
                      {(v.links || []).map((l, i) => (
                        <a key={`${v.id}-link-${i}`} href={l} target="_blank" rel="noopener noreferrer"
                          className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-md border border-emerald-100 bg-white text-xs hover:bg-emerald-50/60 self-start">
                          <ExternalLink className="h-3 w-3 text-emerald-600" /> {l.length > 40 ? l.slice(0, 40) + '…' : l}
                        </a>
                      ))}
                    </div>
                  </div>

                  {/* Per-version comments thread */}
                  <div className="mt-3 pt-3 border-t border-emerald-100/70 space-y-2">
                    <div className="flex items-center gap-1.5 text-[11px] font-medium text-slate-600">
                      <MessageSquare className="h-3.5 w-3.5 text-emerald-600" /> Comments ({(v.comments_thread || []).length})
                    </div>
                    {(v.comments_thread || []).map((c) => (
                      <div key={c.id} className="group text-xs bg-white border border-slate-200 rounded-md p-2" data-testid={`version-comment-${c.id}`}>
                        <div className="flex items-center justify-between gap-2 mb-0.5">
                          <span className="font-medium text-slate-800 flex items-center gap-1.5">
                            <div className="w-5 h-5 rounded-full bg-emerald-100 flex items-center justify-center text-[10px] font-medium text-emerald-700">{getInitials(c.user_name)}</div>
                            {c.user_name}
                          </span>
                          <span className="flex items-center gap-1.5">
                            <button
                              type="button"
                              onClick={() => copyComment(c.text)}
                              className="p-1 rounded text-slate-400 hover:text-emerald-600 hover:bg-emerald-50 opacity-0 group-hover:opacity-100 focus:opacity-100 transition-opacity"
                              title="Copy comment"
                              aria-label="Copy comment"
                              data-testid={`version-comment-copy-${c.id}`}
                            >
                              <Copy className="h-3 w-3" />
                            </button>
                            <span className="text-[10px] text-slate-500">{fmtDate(c.created_at, 'dd MMM, hh:mm a')}</span>
                          </span>
                        </div>
                        <p className="whitespace-pre-wrap pl-7 text-slate-700">{renderMentionedText(c.text)}</p>
                      </div>
                    ))}
                    <div className="flex gap-2">
                      <div className="flex-1">
                        <MentionTextarea
                          value={verComment[v.id] || ''}
                          onChange={(val) => setVerComment((p) => ({ ...p, [v.id]: val }))}
                          placeholder="Add a comment on this version… (type @ to mention)"
                          rows={2}
                          className="text-xs"
                          testid={`version-comment-input-${v.id}`}
                        />
                      </div>
                      <Button
                        size="sm"
                        className="h-8 bg-emerald-600 hover:bg-emerald-700 self-start"
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

      {/* Comments & Activity — composer on top, newest first */}
      <Card className="border border-emerald-100/60 rounded-xl shadow-[0_2px_8px_rgba(6,95,70,0.04)]" data-testid="mr-comments-activity">
        <CardContent className="p-5 space-y-3">
          <h3 className="text-base font-semibold text-slate-900 flex items-center gap-2">
            <MessageSquare className="h-4 w-4 text-emerald-600" /> Comments & Activity
          </h3>
          <div className="flex gap-2">
            <div className="flex-1">
              <MentionTextarea rows={2} value={comment} onChange={setComment} placeholder="Add a comment… (type @ to mention a teammate)" testid="mr-comment-input" />
            </div>
            <Button onClick={addComment} size="sm" disabled={!comment.trim()} className="bg-emerald-600 hover:bg-emerald-700 self-start" data-testid="mr-comment-send-btn">
              <Send className="h-4 w-4" />
            </Button>
          </div>
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
                <p className="whitespace-pre-wrap pl-7">{renderMentionedText(c.text)}</p>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Status history — collapsible, collapsed by default */}
      <Card className="border border-emerald-100/60 rounded-xl shadow-[0_2px_8px_rgba(6,95,70,0.04)]" data-testid="mr-status-history">
        <CardContent className="p-5 space-y-4">
          <button
            type="button"
            onClick={() => setStatusHistoryOpen((o) => !o)}
            className="w-full flex items-center justify-between flex-wrap gap-2 text-left"
            data-testid="mr-status-history-toggle"
          >
            <h2 className="text-sm font-semibold text-slate-800 flex items-center gap-2">
              <History className="h-4 w-4 text-emerald-600" /> Status History
            </h2>
            <span className="flex items-center gap-2">
              <AgePill createdAt={req.created_at} />
              <ChevronDown className={`h-4 w-4 text-slate-400 transition-transform ${statusHistoryOpen ? 'rotate-180' : ''}`} />
            </span>
          </button>

          {statusHistoryOpen && (
            <>
              {/* Proportional bar */}
              <div className="flex h-2.5 w-full rounded-full overflow-hidden bg-slate-100" title="Time distribution across statuses">
                {statusTimeline.segments.map((s, i) => (
                  <div
                    key={i}
                    style={{ width: `${(s.ms / statusTimeline.total) * 100}%`, backgroundColor: s.state_color || '#94a3b8' }}
                    title={`${s.state_label}: ${fmtDuration(s.ms)}`}
                  />
                ))}
              </div>

              {/* Aggregated time-in-status */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                {statusTimeline.agg.map((a) => (
                  <div key={a.state_key} className="flex items-center justify-between gap-2 rounded-lg border border-slate-100 bg-slate-50/60 px-3 py-2" data-testid={`mr-status-agg-${a.state_key}`}>
                    <span className="flex items-center gap-2 min-w-0">
                      <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: a.state_color }} />
                      <span className="text-sm text-slate-700 truncate">{a.state_label}</span>
                    </span>
                    <span className="text-sm font-semibold text-slate-900 shrink-0">{fmtDuration(a.ms)}</span>
                  </div>
                ))}
              </div>

              {/* Chronological journey */}
              <div className="pt-1">
                <p className="text-[10px] uppercase tracking-wider text-slate-400 font-semibold mb-2">Journey</p>
                <div className="space-y-0">
                  {statusTimeline.segments.map((s, i) => (
                    <div key={i} className="flex items-start gap-3" data-testid={`mr-status-segment-${i}`}>
                      <div className="flex flex-col items-center">
                        <span className="w-3 h-3 rounded-full mt-1 shrink-0 ring-2 ring-white" style={{ backgroundColor: s.state_color }} />
                        {i < statusTimeline.segments.length - 1 && <span className="w-px flex-1 bg-slate-200 my-0.5 min-h-[24px]" />}
                      </div>
                      <div className="flex-1 pb-3 min-w-0">
                        <div className="flex items-center justify-between gap-2 flex-wrap">
                          <span className="text-sm font-medium text-slate-800">{s.state_label}</span>
                          <span className="text-xs font-semibold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded-full">
                            {s.ongoing ? `${fmtDuration(s.ms)} (ongoing)` : fmtDuration(s.ms)}
                          </span>
                        </div>
                        <p className="text-xs text-slate-500 mt-0.5">
                          {fmtDate(s.entered_at, 'dd MMM yyyy, hh:mm a')}{s.by_user_name ? ` · ${s.by_user_name}` : ''}
                        </p>
                      </div>
                    </div>
                  ))}
                </div>
                {statusTimeline.backfilled && (
                  <p className="text-[11px] text-amber-600 mt-1">Detailed history wasn&apos;t tracked before this request&apos;s earlier transitions — showing time in the current status from creation.</p>
                )}
              </div>
            </>
          )}
        </CardContent>
      </Card>
        </div>

        {/* RIGHT — Command Center (sticky) */}
        <div className="lg:col-span-4">
          <div className="lg:sticky lg:top-6 space-y-5">
            {/* Action Hub — dark control panel, the hero */}
            <div className="relative overflow-hidden rounded-2xl bg-stone-900 p-6 shadow-[0_20px_50px_-20px_rgba(0,0,0,0.55)]" data-testid="mr-action-hub">
              <div
                className="absolute -right-16 -top-16 w-52 h-52 rounded-full blur-3xl pointer-events-none opacity-40"
                style={{ backgroundColor: req.current_state_color || '#10b981' }}
              />
              <div className="relative">
                <p className="text-[10px] uppercase tracking-[0.2em] text-stone-400 font-bold mb-2.5">Current State</p>
                <div className="flex items-center gap-3">
                  <span className="relative flex h-3 w-3 shrink-0">
                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full opacity-60" style={{ backgroundColor: req.current_state_color || '#10b981' }} />
                    <span className="relative inline-flex rounded-full h-3 w-3" style={{ backgroundColor: req.current_state_color || '#10b981' }} />
                  </span>
                  <h2 className="text-2xl md:text-3xl font-black tracking-tight text-white leading-tight" data-testid="mr-hub-state">
                    {req.current_state_label || req.current_state_key}
                  </h2>
                </div>
                {overdue && (
                  <p className="mt-2 inline-flex items-center gap-1 text-xs text-rose-300 font-medium">
                    <AlertTriangle className="h-3.5 w-3.5" /> Overdue — due {fmtDate(req.requested_due_date)}
                  </p>
                )}

                <p className="text-[10px] uppercase tracking-[0.2em] text-stone-500 font-bold mt-6 mb-3">Available Actions</p>
                <div className="space-y-2.5">
                  {allowedTransitions.length === 0 && blockedTransitions.length === 0 && (
                    <div className="rounded-xl border border-stone-700 bg-stone-800/60 px-4 py-4 text-center">
                      <Lock className="h-5 w-5 mx-auto text-stone-500 mb-1.5" />
                      <p className="text-xs text-stone-400">Terminal state — no transitions available.</p>
                    </div>
                  )}
                  {allowedTransitions.map((t) => {
                    const guardBlocked = t.guards_ok === false;
                    const meta = actionMeta(t);
                    const ActIcon = meta.Icon;
                    return (
                      <button
                        key={`${t.action_key}-${t.to_state}`}
                        onClick={() => onActionClick(t)}
                        disabled={savingTxn || guardBlocked}
                        title={guardBlocked ? (t.block_reasons || []).join(' ') : `Moves to: ${t.to_state_label}`}
                        className={`group w-full h-14 rounded-xl px-4 flex items-center gap-3 font-bold text-sm shadow-lg transition-transform active:scale-95 hover:-translate-y-0.5 disabled:opacity-40 disabled:hover:translate-y-0 disabled:cursor-not-allowed ${meta.cls}`}
                        data-testid={`action-${t.action_key}-btn`}
                      >
                        <ActIcon className="h-5 w-5 shrink-0" />
                        <span className="flex-1 text-left leading-tight">{t.action_label}</span>
                        {(t.required_fields || []).length > 0 && (
                          <span className="text-[9px] tracking-widest opacity-80" title="Requires additional info">•••</span>
                        )}
                        <ChevronRight className="h-4 w-4 shrink-0 opacity-70 group-hover:translate-x-0.5 transition-transform" />
                      </button>
                    );
                  })}
                  {blockedTransitions.map((t) => (
                    <button
                      key={`${t.action_key}-${t.to_state}-blocked`}
                      disabled
                      title={t.requestor_only ? 'Only the requestor can do this' : "You don't have permission for this action"}
                      className="w-full h-11 rounded-xl px-4 flex items-center gap-3 font-semibold text-sm bg-stone-800 text-stone-500 border border-stone-700 opacity-60 cursor-not-allowed"
                      data-testid={`action-${t.action_key}-blocked`}
                    >
                      <Lock className="h-4 w-4 shrink-0" />
                      <span className="flex-1 text-left truncate">{t.action_label}</span>
                    </button>
                  ))}
                </div>
              </div>
            </div>

            {/* Details / meta */}
            <Card className="border border-emerald-100/60 rounded-2xl shadow-[0_2px_8px_rgba(6,95,70,0.04)]" data-testid="mr-meta-card">
              <CardContent className="p-5 space-y-3 text-sm">
                <p className="text-[10px] uppercase tracking-[0.15em] text-emerald-700 font-bold">Details</p>
                <div className="grid grid-cols-2 gap-x-4 gap-y-3">
                  <div><span className="text-[10px] uppercase tracking-wider text-slate-400 font-semibold">Lifecycle</span><p className="text-xs text-slate-700 mt-0.5">{req.state_machine_name || '—'}</p></div>
                  <div><span className="text-[10px] uppercase tracking-wider text-slate-400 font-semibold">Versions</span><p className="text-xs text-slate-700 mt-0.5">{req.versions?.length || 0} uploaded</p></div>
                  <div><span className="text-[10px] uppercase tracking-wider text-slate-400 font-semibold">Created</span><p className="text-xs text-slate-700 mt-0.5">{fmtDate(req.created_at, 'dd MMM yyyy, hh:mm a')}</p></div>
                  <div><span className="text-[10px] uppercase tracking-wider text-slate-400 font-semibold">Updated</span><p className="text-xs text-slate-700 mt-0.5">{fmtDate(req.updated_at, 'dd MMM yyyy, hh:mm a')}</p></div>
                  <div><span className="text-[10px] uppercase tracking-wider text-slate-400 font-semibold">Comments</span><p className="text-xs text-slate-700 mt-0.5">{(req.comments || []).filter(c => c.kind === 'comment').length} added</p></div>
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
        </div>
      </div>

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

      {/* Production submit dialog — REMOVED (use Send for Printing flow on final-approved designs) */}

      {/* Delete attachment confirm dialog */}
      <Dialog open={!!fileToDelete} onOpenChange={(o) => { if (!o) setFileToDelete(null); }}>
        <DialogContent className="max-w-sm" data-testid="delete-file-dialog">
          <DialogHeader>
            <DialogTitle>Remove attachment?</DialogTitle>
            <DialogDescription>
              &quot;{fileToDelete?.filename}&quot; will be permanently removed from this request. This action cannot be undone.
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

      {/* Send for printing */}
      <SendForPrintingDialog
        open={showSendPrint}
        onOpenChange={setShowSendPrint}
        marketingRequest={req}
        onCreated={(printReq) => navigate(`/print-requests/${printReq.id}`)}
      />

      {/* File preview lightbox */}
      <FilePreviewDialog file={previewFile} onClose={() => setPreviewFile(null)} />

      {/* Delete request confirmation */}
      <Dialog open={showDeleteReq} onOpenChange={(o) => { if (!o && !deletingReq) setShowDeleteReq(false); }}>
        <DialogContent className="max-w-md" data-testid="delete-request-dialog">
          <DialogHeader>
            <DialogTitle>Delete this design request?</DialogTitle>
            <DialogDescription>
              <span className="font-medium text-slate-700">{req.request_number}</span> — {req.request_type_name || 'Untyped Request'} and all its attached files will be permanently removed. This action cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowDeleteReq(false)} disabled={deletingReq} data-testid="delete-request-cancel-btn">Cancel</Button>
            <Button
              onClick={confirmDeleteRequest}
              disabled={deletingReq}
              className="bg-red-600 hover:bg-red-700"
              data-testid="delete-request-confirm-btn"
            >
              {deletingReq ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" /> Deleting…</> : <><Trash2 className="h-4 w-4 mr-2" /> Delete Request</>}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete version confirmation */}
      <Dialog open={!!versionToDelete} onOpenChange={(o) => { if (!o && !deletingVersion) setVersionToDelete(null); }}>
        <DialogContent className="max-w-md" data-testid="delete-version-dialog">
          <DialogHeader>
            <DialogTitle>Delete {versionToDelete?.version_name || 'this version'}?</DialogTitle>
            <DialogDescription>
              All {(versionToDelete?.files || []).length} file(s), links and comments on{' '}
              <span className="font-medium text-slate-700">{versionToDelete?.version_name}</span>{' '}
              will be permanently removed from this design request. This action cannot be undone.
              {versionToDelete?.is_approved && (
                <span className="block mt-2 text-amber-700">
                  This is the currently approved version — deleting it will clear the approval.
                </span>
              )}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setVersionToDelete(null)} disabled={deletingVersion} data-testid="delete-version-cancel-btn">Cancel</Button>
            <Button
              onClick={confirmDeleteVersion}
              disabled={deletingVersion}
              className="bg-red-600 hover:bg-red-700"
              data-testid="delete-version-confirm-btn"
            >
              {deletingVersion ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" /> Deleting…</> : <><Trash2 className="h-4 w-4 mr-2" /> Delete Version</>}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
