import React, { useEffect, useState, useCallback, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import axios from 'axios';
import { toast } from 'sonner';
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card';
import { Button } from '../components/ui/button';
import { Textarea } from '../components/ui/textarea';
import { Badge } from '../components/ui/badge';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '../components/ui/select';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '../components/ui/alert-dialog';
import {
  ArrowLeft, Loader2, Upload, Trash2, Send, MessageSquare, ImageIcon,
  Tag, Package, User, Calendar, X,
} from 'lucide-react';
import { PRIORITY_STYLES, STATUS_STYLES, LABEL } from './CustomerComplaints';
import { useTenantConfig } from '../context/TenantConfigContext';

const API = `${process.env.REACT_APP_BACKEND_URL}/api`;
const HEAD = () => ({ Authorization: `Bearer ${localStorage.getItem('token')}` });

export default function CustomerComplaintDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { hasActionPermission } = useTenantConfig();
  const canEdit = hasActionPermission ? hasActionPermission('customer_complaints', 'edit') : true;
  const canDelete = hasActionPermission ? hasActionPermission('customer_complaints', 'delete') : true;

  const [loading, setLoading] = useState(true);
  const [complaint, setComplaint] = useState(null);
  const [options, setOptions] = useState({ statuses: [], priorities: [], users: [] });
  const [comment, setComment] = useState('');
  const [posting, setPosting] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const fileRef = useRef(null);

  const fetchComplaint = useCallback(async () => {
    try {
      const res = await axios.get(`${API}/complaints/${id}`, { headers: HEAD() });
      setComplaint(res.data);
    } catch (e) {
      toast.error('Issue not found');
      navigate('/complaints');
    } finally {
      setLoading(false);
    }
  }, [id, navigate]);

  useEffect(() => { fetchComplaint(); }, [fetchComplaint]);
  useEffect(() => {
    axios.get(`${API}/complaints/meta/options`, { headers: HEAD() }).then((r) => setOptions(r.data)).catch(() => {});
  }, []);

  const patch = async (updates) => {
    try {
      const res = await axios.put(`${API}/complaints/${id}`, updates, { headers: HEAD() });
      setComplaint(res.data);
      toast.success('Updated');
    } catch (e) {
      toast.error(e.response?.data?.detail || 'Update failed');
    }
  };

  const addComment = async () => {
    if (!comment.trim()) return;
    setPosting(true);
    try {
      const res = await axios.post(`${API}/complaints/${id}/comments`, { text: comment }, { headers: HEAD() });
      setComplaint((c) => ({ ...c, comments: [...(c.comments || []), res.data] }));
      setComment('');
    } catch (e) {
      toast.error('Failed to add comment');
    } finally {
      setPosting(false);
    }
  };

  const onFiles = async (e) => {
    const files = Array.from(e.target.files || []);
    if (!files.length) return;
    setUploading(true);
    try {
      const form = new FormData();
      files.forEach((f) => form.append('files', f));
      const res = await axios.post(`${API}/complaints/${id}/photos`, form, {
        headers: { ...HEAD(), 'Content-Type': 'multipart/form-data' },
      });
      setComplaint((c) => ({ ...c, photos: [...(c.photos || []), ...res.data.photos] }));
      toast.success(`${res.data.photos.length} photo(s) uploaded`);
    } catch (e) {
      toast.error(e.response?.data?.detail || 'Upload failed');
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = '';
    }
  };

  const removePhoto = async (photoId) => {
    try {
      await axios.delete(`${API}/complaints/${id}/photos/${photoId}`, { headers: HEAD() });
      setComplaint((c) => ({ ...c, photos: (c.photos || []).filter((p) => p.id !== photoId) }));
    } catch (e) {
      toast.error('Failed to remove photo');
    }
  };

  const doDelete = async () => {
    try {
      await axios.delete(`${API}/complaints/${id}`, { headers: HEAD() });
      toast.success('Issue deleted');
      navigate('/complaints');
    } catch (e) {
      toast.error(e.response?.data?.detail || 'Delete failed');
    }
  };

  if (loading || !complaint) {
    return <div className="p-6 flex justify-center"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>;
  }

  return (
    <div className="p-6 max-w-6xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div className="flex items-start gap-3">
          <Button variant="ghost" size="icon" onClick={() => navigate('/complaints')} data-testid="complaint-back-btn">
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <div>
            <div className="flex items-center gap-2 flex-wrap">
              <h1 className="text-2xl font-bold text-slate-800">{complaint.title}</h1>
              <Badge className={PRIORITY_STYLES[complaint.priority]}>{LABEL(complaint.priority)}</Badge>
              <Badge className={STATUS_STYLES[complaint.status]}>{LABEL(complaint.status)}</Badge>
            </div>
            <p className="text-sm text-muted-foreground mt-0.5">{complaint.complaint_number}</p>
          </div>
        </div>
        {canDelete && (
          <Button variant="outline" className="text-destructive border-rose-200" onClick={() => setConfirmDelete(true)} data-testid="complaint-delete-btn">
            <Trash2 className="h-4 w-4 mr-1.5" /> Delete
          </Button>
        )}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left: details + photos + comments */}
        <div className="lg:col-span-2 space-y-6">
          <Card>
            <CardHeader className="pb-3"><CardTitle className="text-base">Details</CardTitle></CardHeader>
            <CardContent className="space-y-4">
              <p className="text-sm text-slate-700 whitespace-pre-wrap">{complaint.details || <span className="text-muted-foreground italic">No details provided.</span>}</p>
              <div className="flex flex-wrap gap-4 text-sm">
                <Meta icon={Tag} label="Category" value={LABEL(complaint.category)} />
                {complaint.customer_name && <Meta icon={User} label={LABEL(complaint.link_type || 'Customer')} value={complaint.customer_name} />}
                <Meta icon={Calendar} label="Created" value={new Date(complaint.created_at).toLocaleDateString()} />
              </div>
              {(complaint.sku_names || []).length > 0 && (
                <div>
                  <p className="text-xs uppercase tracking-wider text-slate-500 mb-1.5 flex items-center gap-1.5"><Package className="h-3.5 w-3.5" /> Affected SKUs</p>
                  <div className="flex flex-wrap gap-1.5">
                    {complaint.sku_names.map((s, i) => <Badge key={i} variant="outline" className="bg-slate-50">{s}</Badge>)}
                  </div>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Photos */}
          <Card>
            <CardHeader className="pb-3 flex flex-row items-center justify-between">
              <CardTitle className="text-base flex items-center gap-2"><ImageIcon className="h-4 w-4" /> Photos ({(complaint.photos || []).length})</CardTitle>
              {canEdit && (
                <>
                  <input ref={fileRef} type="file" accept="image/*" multiple hidden onChange={onFiles} data-testid="complaint-photo-input" />
                  <Button size="sm" variant="outline" onClick={() => fileRef.current?.click()} disabled={uploading} data-testid="complaint-upload-btn">
                    {uploading ? <Loader2 className="h-4 w-4 mr-1.5 animate-spin" /> : <Upload className="h-4 w-4 mr-1.5" />} Upload
                  </Button>
                </>
              )}
            </CardHeader>
            <CardContent>
              {(complaint.photos || []).length === 0 ? (
                <p className="text-sm text-muted-foreground py-4 text-center">No photos attached yet.</p>
              ) : (
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                  {complaint.photos.map((p) => (
                    <PhotoThumb key={p.id} complaintId={id} photo={p} canEdit={canEdit} onRemove={() => removePhoto(p.id)} />
                  ))}
                </div>
              )}
            </CardContent>
          </Card>

          {/* Updates / comments */}
          <Card>
            <CardHeader className="pb-3"><CardTitle className="text-base flex items-center gap-2"><MessageSquare className="h-4 w-4" /> Updates & Comments</CardTitle></CardHeader>
            <CardContent className="space-y-4">
              <div className="flex gap-2">
                <Textarea value={comment} onChange={(e) => setComment(e.target.value)} rows={2} placeholder="Add an update or comment…" data-testid="complaint-comment-input" />
                <Button onClick={addComment} disabled={posting || !comment.trim()} className="bg-rose-600 hover:bg-rose-700 self-end" data-testid="complaint-comment-send">
                  {posting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
                </Button>
              </div>
              <div className="space-y-3">
                {(complaint.comments || []).length === 0 ? (
                  <p className="text-sm text-muted-foreground text-center py-2">No updates yet.</p>
                ) : (
                  [...complaint.comments].reverse().map((c) => (
                    <div key={c.id} className="flex gap-3" data-testid={`complaint-comment-${c.id}`}>
                      <div className="h-8 w-8 rounded-full bg-rose-100 text-rose-700 flex items-center justify-center text-xs font-semibold shrink-0">
                        {(c.user_name || '?').slice(0, 2).toUpperCase()}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm"><span className="font-medium">{c.user_name}</span>
                          <span className="text-xs text-muted-foreground ml-2">{new Date(c.created_at).toLocaleString()}</span></p>
                        <p className="text-sm text-slate-700 whitespace-pre-wrap">{c.text}</p>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Right: status / priority / assignment */}
        <div className="space-y-6">
          <Card>
            <CardHeader className="pb-3"><CardTitle className="text-base">Manage</CardTitle></CardHeader>
            <CardContent className="space-y-4">
              <Field label="Status">
                <Select value={complaint.status} onValueChange={(v) => patch({ status: v })} disabled={!canEdit}>
                  <SelectTrigger data-testid="complaint-status-select"><SelectValue /></SelectTrigger>
                  <SelectContent>{options.statuses.map((s) => <SelectItem key={s} value={s}>{LABEL(s)}</SelectItem>)}</SelectContent>
                </Select>
              </Field>
              <Field label="Priority">
                <Select value={complaint.priority} onValueChange={(v) => patch({ priority: v })} disabled={!canEdit}>
                  <SelectTrigger data-testid="complaint-priority-select"><SelectValue /></SelectTrigger>
                  <SelectContent>{options.priorities.map((p) => <SelectItem key={p} value={p}>{LABEL(p)}</SelectItem>)}</SelectContent>
                </Select>
              </Field>
              <Field label="Assigned to">
                <Select value={complaint.assigned_to || 'unassigned'}
                  onValueChange={(v) => {
                    const u = options.users.find((x) => x.id === v);
                    patch({ assigned_to: v === 'unassigned' ? null : v, assigned_to_name: u ? u.name : null });
                  }} disabled={!canEdit}>
                  <SelectTrigger data-testid="complaint-assign-select"><SelectValue placeholder="Unassigned" /></SelectTrigger>
                  <SelectContent className="max-h-[260px]">
                    <SelectItem value="unassigned">Unassigned</SelectItem>
                    {options.users.map((u) => <SelectItem key={u.id} value={u.id}>{u.name}</SelectItem>)}
                  </SelectContent>
                </Select>
              </Field>
            </CardContent>
          </Card>
        </div>
      </div>

      <AlertDialog open={confirmDelete} onOpenChange={setConfirmDelete}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete issue?</AlertDialogTitle>
            <AlertDialogDescription>This permanently removes {complaint.complaint_number} and its comments. This cannot be undone.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction className="bg-rose-600 hover:bg-rose-700" onClick={doDelete} data-testid="confirm-delete-complaint">Delete</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

const Meta = ({ icon: Icon, label, value }) => (
  <div className="flex items-center gap-1.5 text-slate-600">
    <Icon className="h-4 w-4 text-muted-foreground" />
    <span className="text-muted-foreground">{label}:</span>
    <span className="font-medium text-slate-800">{value}</span>
  </div>
);

const Field = ({ label, children }) => (
  <div className="space-y-1.5">
    <label className="text-xs font-semibold uppercase tracking-wider text-slate-500">{label}</label>
    {children}
  </div>
);

// Photo thumbnail — fetched as a blob (img tags can't send auth headers).
const PhotoThumb = ({ complaintId, photo, canEdit, onRemove }) => {
  const [url, setUrl] = useState(null);
  useEffect(() => {
    let revoked = null;
    axios.get(`${API}/complaints/${complaintId}/photos/${photo.id}`, { headers: HEAD(), responseType: 'blob' })
      .then((r) => { const u = URL.createObjectURL(r.data); revoked = u; setUrl(u); })
      .catch(() => {});
    return () => { if (revoked) URL.revokeObjectURL(revoked); };
  }, [complaintId, photo.id]);

  return (
    <div className="relative group rounded-lg overflow-hidden border bg-slate-50 aspect-square" data-testid={`complaint-photo-${photo.id}`}>
      {url ? (
        <a href={url} target="_blank" rel="noopener noreferrer">
          <img src={url} alt={photo.original_filename} className="w-full h-full object-cover" />
        </a>
      ) : (
        <div className="w-full h-full flex items-center justify-center"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>
      )}
      {canEdit && (
        <button onClick={onRemove}
          className="absolute top-1 right-1 h-7 w-7 rounded-full bg-black/60 text-white flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
          title="Remove photo" data-testid={`remove-photo-${photo.id}`}>
          <X className="h-4 w-4" />
        </button>
      )}
    </div>
  );
};
