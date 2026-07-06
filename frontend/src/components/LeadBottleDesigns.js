import React, { useEffect, useState } from 'react';
import axios from 'axios';
import { useNavigate } from 'react-router-dom';
import { Card } from './ui/card';
import { Button } from './ui/button';
import { Badge } from './ui/badge';
import { Checkbox } from './ui/checkbox';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from './ui/dialog';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from './ui/alert-dialog';
import { toast } from 'sonner';
import { Sparkles, Download, Trash2, Eye, Loader2, Tag, Wine, FileImage, FlaskConical, UploadCloud, ClipboardList, ChevronRight, Printer } from 'lucide-react';
import { format } from 'date-fns';
import CreatePrintRequestDialog from './CreatePrintRequestDialog';

// A Print Request can be created once a design is finalized. Mirror the detail page's
// "Send for Printing" gating (state-based) so migrated requests (stale state_machine_id)
// aren't hidden: allow when the request is in a printable state OR flagged terminal.
const PRINTABLE_STATE_KEYS = ['final_approved', 'production_in_progress', 'production_completed'];
const canRaisePrint = (r) =>
  !!r && (PRINTABLE_STATE_KEYS.includes(r.current_state_key) || !!r.current_state_is_terminal);

const API_URL = process.env.REACT_APP_BACKEND_URL + '/api';
const BACKEND = process.env.REACT_APP_BACKEND_URL;

const srcFor = (url) => (url ? `${BACKEND}${url}` : '');

export const LeadBottleDesigns = ({ leadId, company, hasLogo }) => {
  const navigate = useNavigate();
  const [designs, setDesigns] = useState([]);
  const [loading, setLoading] = useState(true);
  const [preview, setPreview] = useState(null);
  const [confirmDelete, setConfirmDelete] = useState(null);
  const [deleting, setDeleting] = useState(false);
  const [busyAction, setBusyAction] = useState(null); // 'neck-tags' | 'bottle-design'
  const [sampleOpen, setSampleOpen] = useState(false);
  const [sampleFile, setSampleFile] = useState(null);
  const [attachDesign, setAttachDesign] = useState(false);
  const [submittingSample, setSubmittingSample] = useState(false);
  const [requests, setRequests] = useState([]);
  const [requestsLoading, setRequestsLoading] = useState(true);
  const [leadHasLogo, setLeadHasLogo] = useState(!!hasLogo);
  const [resolvedLeadId, setResolvedLeadId] = useState(null);
  const [monthlyVolume, setMonthlyVolume] = useState(null);
  const [printRequestTarget, setPrintRequestTarget] = useState(null);

  const fetchDesigns = async () => {
    try {
      const res = await axios.get(`${API_URL}/leads/${leadId}/bottle-designs`, { withCredentials: true });
      setDesigns(res.data?.designs || []);
      setLeadHasLogo(!!res.data?.has_logo);
      setResolvedLeadId(res.data?.lead_uuid || leadId);
      setMonthlyVolume(res.data?.monthly_bottles ?? res.data?.current_volume ?? null);
    } catch (e) {
      setDesigns([]);
      setResolvedLeadId(leadId);
    } finally {
      setLoading(false);
    }
  };

  const fetchRequests = async () => {
    try {
      const res = await axios.get(`${API_URL}/design-requests-new`, {
        params: { lead_id: resolvedLeadId, no_limit: true },
        withCredentials: true,
      });
      setRequests(res.data?.items || []);
    } catch (e) {
      setRequests([]);
    } finally {
      setRequestsLoading(false);
    }
  };

  useEffect(() => {
    if (leadId) fetchDesigns();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [leadId]);

  useEffect(() => {
    if (resolvedLeadId) fetchRequests();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [resolvedLeadId]);

  const handleDownload = async (design) => {
    try {
      const res = await axios.get(srcFor(design.image_url), { responseType: 'blob', withCredentials: true });
      const blobUrl = URL.createObjectURL(res.data);
      const a = document.createElement('a');
      a.href = blobUrl;
      a.download = `${(company || 'lead').replace(/\s+/g, '-').toLowerCase()}-bottle-design.png`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(blobUrl);
    } catch (e) {
      toast.error('Failed to download design');
    }
  };

  const handleDelete = async () => {
    if (!confirmDelete) return;
    setDeleting(true);
    try {
      await axios.delete(`${API_URL}/leads/${resolvedLeadId}/bottle-designs/${confirmDelete.id}`, { withCredentials: true });
      toast.success('Design deleted');
      setDesigns((prev) => prev.filter((x) => x.id !== confirmDelete.id));
      setConfirmDelete(null);
    } catch (e) {
      toast.error('Failed to delete design');
    } finally {
      setDeleting(false);
    }
  };

  const handleCreateDesign = () => {
    if (!leadHasLogo) {
      toast.error('Upload a logo on the lead first, then create a bottle design.');
      return;
    }
    navigate(`/bottle-preview?lead=${resolvedLeadId}`);
  };

  // Shared: POST a lead-logo-based design request (neck tags / bottle design).
  const postLeadLogoRequest = async (action, path, label) => {
    if (!leadHasLogo) {
      toast.error('Upload a logo on the lead first, then raise this request.');
      return;
    }
    setBusyAction(action);
    try {
      const res = await axios.post(`${API_URL}/design-requests-new/${path}`, {}, { withCredentials: true });
      const num = res.data?.request_number;
      const rid = res.data?.id;
      toast.success(`${label} request ${num || ''} created`, {
        action: rid ? { label: 'View', onClick: () => navigate(`/design-requests-new/${rid}`) } : undefined,
      });
      fetchRequests();
    } catch (e) {
      toast.error(e.response?.data?.detail || `Failed to create ${label.toLowerCase()} request`);
    } finally {
      setBusyAction(null);
    }
  };

  const handleRequestNeckTags = () =>
    postLeadLogoRequest('neck-tags', `from-lead/${resolvedLeadId}/neck-tags`, 'Neck tags');
  const handleRequestBottleDesign = () =>
    postLeadLogoRequest('bottle-design', `from-lead/${resolvedLeadId}/bottle-design`, 'Bottle design');

  const handleSubmitSample = async () => {
    if (!sampleFile) {
      toast.error('Please choose the original logo file (PDF or ZIP).');
      return;
    }
    const ext = sampleFile.name.split('.').pop()?.toLowerCase();
    if (!['pdf', 'zip'].includes(ext)) {
      toast.error('Only PDF or ZIP files are allowed.');
      return;
    }
    setSubmittingSample(true);
    try {
      const fd = new FormData();
      fd.append('file', sampleFile);
      fd.append('attach_bottle_design', attachDesign ? 'true' : 'false');
      const res = await axios.post(
        `${API_URL}/design-requests-new/from-lead/${resolvedLeadId}/bottle-sample`,
        fd,
        { withCredentials: true, headers: { 'Content-Type': 'multipart/form-data' } }
      );
      const num = res.data?.request_number;
      const rid = res.data?.id;
      setSampleOpen(false);
      setSampleFile(null);
      setAttachDesign(false);
      toast.success(`Bottle sample request ${num || ''} created`, {
        action: rid ? { label: 'View', onClick: () => navigate(`/design-requests-new/${rid}`) } : undefined,
      });
      fetchRequests();
    } catch (e) {
      toast.error(e.response?.data?.detail || 'Failed to create bottle sample request');
    } finally {
      setSubmittingSample(false);
    }
  };

  return (
    <Card className="p-4 sm:p-6" data-testid="lead-bottle-designs-card">
      <div className="flex items-center gap-2 mb-1">
        <h2 className="text-base sm:text-lg font-semibold flex items-center gap-2">
          <Wine className="h-4 w-4 sm:h-5 sm:w-5 text-primary" /> Customer branding
        </h2>
        {designs.length > 0 && (
          <Badge variant="secondary" data-testid="bottle-designs-count">{designs.length} saved</Badge>
        )}
      </div>
      <p className="text-xs text-muted-foreground mb-4">
        Design and request branded artwork &amp; physical samples for {company || 'this lead'}.
      </p>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 mb-5" data-testid="customer-branding-actions">
        <Button
          variant="outline"
          className="justify-start h-auto py-2.5"
          onClick={handleRequestNeckTags}
          disabled={busyAction === 'neck-tags'}
          data-testid="request-neck-tags-btn"
        >
          {busyAction === 'neck-tags'
            ? <Loader2 className="h-4 w-4 mr-2 animate-spin shrink-0" />
            : <Tag className="h-4 w-4 mr-2 shrink-0 text-primary" />}
          <span className="text-left leading-tight">Design Neck Tags
            <span className="block text-[11px] font-normal text-muted-foreground">Uses the lead's logo</span>
          </span>
        </Button>

        <Button
          variant="outline"
          className="justify-start h-auto py-2.5"
          onClick={handleCreateDesign}
          data-testid="create-bottle-design-btn"
        >
          <Sparkles className="h-4 w-4 mr-2 shrink-0 text-primary" />
          <span className="text-left leading-tight">Create Bottle Design
            <span className="block text-[11px] font-normal text-muted-foreground">Open the bottle preview studio</span>
          </span>
        </Button>

        <Button
          variant="outline"
          className="justify-start h-auto py-2.5"
          onClick={handleRequestBottleDesign}
          disabled={busyAction === 'bottle-design'}
          data-testid="request-bottle-design-btn"
        >
          {busyAction === 'bottle-design'
            ? <Loader2 className="h-4 w-4 mr-2 animate-spin shrink-0" />
            : <FileImage className="h-4 w-4 mr-2 shrink-0 text-primary" />}
          <span className="text-left leading-tight">Request Bottle Design (Concept)
            <span className="block text-[11px] font-normal text-muted-foreground">Raise a design request (uses the lead's logo)</span>
          </span>
        </Button>

        <Button
          variant="outline"
          className="justify-start h-auto py-2.5"
          onClick={() => setSampleOpen(true)}
          data-testid="request-bottle-sample-btn"
        >
          <FlaskConical className="h-4 w-4 mr-2 shrink-0 text-amber-600" />
          <span className="text-left leading-tight">Request Bottle Sample with Logo
            <span className="block text-[11px] font-normal text-muted-foreground">Upload the original logo (PDF/ZIP)</span>
          </span>
        </Button>
      </div>

      {/* Linked design requests raised for this lead */}
      {!requestsLoading && requests.length > 0 && (
        <div className="mb-5" data-testid="lead-design-requests">
          <div className="flex items-center gap-2 mb-2">
            <ClipboardList className="h-4 w-4 text-primary" />
            <h3 className="text-sm font-semibold">Design requests</h3>
            <Badge variant="secondary" data-testid="lead-design-requests-count">{requests.length}</Badge>
          </div>
          <div className="rounded-xl border border-border divide-y divide-border overflow-hidden">
            {requests.map((r) => {
              const canPrint = canRaisePrint(r);
              return (
              <div
                key={r.id}
                className="flex items-center gap-2 pr-2 hover:bg-muted/50 transition-colors"
                data-testid={`lead-design-request-${r.id}`}
              >
                <button
                  type="button"
                  onClick={() => navigate(`/design-requests-new/${r.id}`)}
                  className="flex items-center gap-3 px-3 py-2.5 text-left flex-1 min-w-0"
                  title="Open request"
                >
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-medium text-primary truncate">{r.request_number}</span>
                      {r.is_urgent && (
                        <Badge className="text-[10px] font-normal bg-red-100 text-red-700 hover:bg-red-100">Urgent</Badge>
                      )}
                    </div>
                    <p className="text-xs text-muted-foreground truncate">
                      {r.request_type_name || r.title || 'Design request'}
                    </p>
                  </div>
                  <span
                    className="inline-flex items-center gap-1.5 shrink-0 rounded-full px-2.5 py-1 text-[11px] font-medium"
                    style={{
                      color: r.current_state_color || '#475569',
                      backgroundColor: `${r.current_state_color || '#64748b'}1a`,
                    }}
                    data-testid={`lead-design-request-status-${r.id}`}
                  >
                    <span className="w-1.5 h-1.5 rounded-full shrink-0" style={{ backgroundColor: r.current_state_color || '#64748b' }} />
                    {r.current_state_label || r.current_state_key || '—'}
                  </span>
                </button>
                {canPrint && (
                  <Button
                    size="sm"
                    className="h-8 px-3 shrink-0 text-xs bg-emerald-600 hover:bg-emerald-700 text-white shadow-sm"
                    onClick={(e) => { e.stopPropagation(); setPrintRequestTarget(r); }}
                    data-testid={`create-print-request-btn-${r.id}`}
                  >
                    <Printer className="h-3.5 w-3.5 mr-1.5" /> Print Request
                  </Button>
                )}
                <ChevronRight className="h-4 w-4 text-muted-foreground shrink-0" />
              </div>
              );
            })}
          </div>
        </div>
      )}

      {loading ? (
        <div className="flex items-center justify-center py-10 text-muted-foreground" data-testid="bottle-designs-loading">
          <Loader2 className="h-5 w-5 animate-spin mr-2" /> Loading designs…
        </div>
      ) : designs.length === 0 ? (
        <div
          className="flex flex-col items-center justify-center text-center py-8 px-4 rounded-xl border border-dashed border-border bg-muted/30"
          data-testid="bottle-designs-empty"
        >
          <div className="h-11 w-11 rounded-2xl bg-primary/10 flex items-center justify-center mb-3">
            <Sparkles className="h-5 w-5 text-primary" />
          </div>
          <p className="text-sm font-medium text-foreground">No saved bottle designs yet</p>
          <p className="text-xs text-muted-foreground mt-1 max-w-xs">
            Use “Create Bottle Design” to build a white-label mockup for {company || 'this lead'} and approve it to save it here.
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4" data-testid="bottle-designs-grid">
          {designs.map((d) => (
            <div
              key={d.id}
              className="group rounded-xl border border-border overflow-hidden bg-card hover:shadow-md transition-shadow"
              data-testid={`bottle-design-${d.id}`}
            >
              <button
                type="button"
                onClick={() => setPreview(d)}
                className="relative block w-full aspect-[3/4] bg-[repeating-conic-gradient(#f3f4f6_0%_25%,#ffffff_0%_50%)] bg-[length:20px_20px]"
                data-testid={`bottle-design-thumb-${d.id}`}
                title="Click to view"
              >
                <img
                  src={srcFor(d.image_url)}
                  alt={`${d.customer_name || company || 'Bottle'} design`}
                  className="absolute inset-0 w-full h-full object-contain"
                  loading="lazy"
                />
                <span className="absolute inset-0 bg-black/0 group-hover:bg-black/30 transition-colors flex items-center justify-center opacity-0 group-hover:opacity-100">
                  <Eye className="h-6 w-6 text-white drop-shadow" />
                </span>
              </button>

              <div className="p-3">
                <p className="text-sm font-medium truncate" title={d.customer_name || company}>
                  {d.customer_name || company || 'Design'}
                </p>
                <div className="flex flex-wrap items-center gap-1.5 mt-1.5">
                  {d.bottle_template_name && (
                    <Badge variant="secondary" className="text-[10px] font-normal">{d.bottle_template_name}</Badge>
                  )}
                  {typeof d.logo_size_mm === 'number' && (
                    <Badge variant="outline" className="text-[10px] font-normal">{d.logo_size_mm}mm</Badge>
                  )}
                  {(d.price || d.price === 0) && (
                    <Badge className="text-[10px] font-normal bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300 hover:bg-emerald-100">
                      ₹{d.price}
                    </Badge>
                  )}
                </div>
                {d.created_at && (
                  <p className="text-[11px] text-muted-foreground mt-1.5 truncate">
                    {format(new Date(d.created_at), 'dd MMM yyyy')}
                    {d.created_by ? ` · ${d.created_by}` : ''}
                  </p>
                )}
                <div className="flex items-center gap-1 mt-2">
                  <Button
                    variant="outline" size="sm" className="h-8 flex-1 px-2"
                    onClick={() => handleDownload(d)}
                    data-testid={`bottle-design-download-${d.id}`}
                  >
                    <Download className="h-3.5 w-3.5" />
                  </Button>
                  <Button
                    variant="outline" size="sm"
                    className="h-8 px-2 text-red-600 hover:text-red-700 hover:bg-red-50 dark:hover:bg-red-950/30"
                    onClick={() => setConfirmDelete(d)}
                    data-testid={`bottle-design-delete-${d.id}`}
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Request bottle sample — upload original logo (PDF/ZIP) */}
      <Dialog open={sampleOpen} onOpenChange={(o) => { setSampleOpen(o); if (!o) { setSampleFile(null); setAttachDesign(false); } }}>
        <DialogContent className="max-w-md" data-testid="bottle-sample-dialog">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <FlaskConical className="h-5 w-5 text-amber-600" /> Request Bottle Sample with Logo
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <p className="text-sm text-muted-foreground">
              Upload the original logo file for {company || 'this lead'}. This creates a physical
              bottle sample design request with the logo attached.
            </p>
            <label
              htmlFor="bottle-sample-file"
              className="flex flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed border-border hover:border-primary/50 bg-muted/30 px-4 py-6 cursor-pointer transition-colors"
              data-testid="bottle-sample-dropzone"
            >
              <UploadCloud className="h-7 w-7 text-muted-foreground" />
              {sampleFile ? (
                <span className="text-sm font-medium text-foreground break-all text-center">{sampleFile.name}</span>
              ) : (
                <>
                  <span className="text-sm font-medium text-foreground">Choose a file</span>
                  <span className="text-xs text-muted-foreground">PDF or ZIP only</span>
                </>
              )}
              <input
                id="bottle-sample-file"
                type="file"
                accept=".pdf,.zip,application/pdf,application/zip,application/x-zip-compressed"
                className="hidden"
                onChange={(e) => setSampleFile(e.target.files?.[0] || null)}
                data-testid="bottle-sample-file-input"
              />
            </label>

            {designs.length > 0 && (
              <div className="rounded-xl border border-border bg-muted/20 p-3">
                <label className="flex items-start gap-2.5 cursor-pointer" data-testid="attach-bottle-design-row">
                  <Checkbox
                    checked={attachDesign}
                    onCheckedChange={(v) => setAttachDesign(!!v)}
                    className="mt-0.5"
                    data-testid="attach-bottle-design-checkbox"
                  />
                  <span className="text-sm leading-tight">
                    Also attach the saved bottle design{designs.length > 1 ? 's' : ''}
                    <span className="text-muted-foreground"> ({designs.length})</span>
                    <span className="block text-[11px] font-normal text-muted-foreground mt-0.5">
                      Include the client-approved bottle design with this request.
                    </span>
                  </span>
                </label>
                {attachDesign && (
                  <p className="mt-2 text-[11px] text-amber-700 dark:text-amber-400 bg-amber-50 dark:bg-amber-950/30 rounded-md px-2.5 py-1.5" data-testid="attach-bottle-design-note">
                    Note: the design team will follow the same design pattern as the attached bottle design.
                  </p>
                )}
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setSampleOpen(false)} disabled={submittingSample} data-testid="bottle-sample-cancel">
              Cancel
            </Button>
            <Button onClick={handleSubmitSample} disabled={submittingSample || !sampleFile} data-testid="bottle-sample-submit">
              {submittingSample ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" /> Submitting…</> : 'Create Request'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>


      {/* Fullscreen preview */}
      <Dialog open={!!preview} onOpenChange={(o) => { if (!o) setPreview(null); }}>
        <DialogContent className="max-w-3xl" data-testid="bottle-design-preview-dialog">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Sparkles className="h-5 w-5 text-primary" />
              {preview?.customer_name || company || 'Bottle Design'}
            </DialogTitle>
          </DialogHeader>
          {preview && (
            <div className="space-y-4">
              <div className="w-full max-h-[70vh] flex items-center justify-center bg-[repeating-conic-gradient(#f3f4f6_0%_25%,#ffffff_0%_50%)] bg-[length:24px_24px] rounded-xl p-4">
                <img
                  src={srcFor(preview.image_url)}
                  alt="Bottle design preview"
                  className="max-h-[65vh] w-auto object-contain"
                />
              </div>
              <div className="flex justify-end">
                <Button onClick={() => handleDownload(preview)} data-testid="bottle-design-preview-download-btn">
                  <Download className="h-4 w-4 mr-2" /> Download
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Delete confirmation */}
      <AlertDialog open={!!confirmDelete} onOpenChange={(o) => { if (!o) setConfirmDelete(null); }}>
        <AlertDialogContent data-testid="bottle-design-delete-dialog">
          <AlertDialogHeader>
            <AlertDialogTitle>Delete this design?</AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently remove the saved bottle design for {confirmDelete?.customer_name || company || 'this lead'}. This can't be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleting} data-testid="bottle-design-delete-cancel">Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => { e.preventDefault(); handleDelete(); }}
              disabled={deleting}
              className="bg-red-600 hover:bg-red-700"
              data-testid="bottle-design-delete-confirm"
            >
              {deleting ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" /> Deleting…</> : 'Delete'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Create Print Request from an approved design request */}
      <CreatePrintRequestDialog
        open={!!printRequestTarget}
        onOpenChange={(o) => { if (!o) setPrintRequestTarget(null); }}
        designRequest={printRequestTarget}
        defaultMonthlyVolume={monthlyVolume}
        onCreated={() => { setPrintRequestTarget(null); fetchRequests(); }}
      />
    </Card>
  );
};

export default LeadBottleDesigns;
