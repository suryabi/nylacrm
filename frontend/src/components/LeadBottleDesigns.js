import React, { useEffect, useState } from 'react';
import axios from 'axios';
import { useNavigate } from 'react-router-dom';
import { Card } from './ui/card';
import { Button } from './ui/button';
import { Badge } from './ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from './ui/dialog';
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
import { Sparkles, Plus, Download, Trash2, Eye, Loader2 } from 'lucide-react';
import { format } from 'date-fns';

const API_URL = process.env.REACT_APP_BACKEND_URL + '/api';
const BACKEND = process.env.REACT_APP_BACKEND_URL;

const srcFor = (url) => (url ? `${BACKEND}${url}` : '');

export const LeadBottleDesigns = ({ leadId, company }) => {
  const navigate = useNavigate();
  const [designs, setDesigns] = useState([]);
  const [loading, setLoading] = useState(true);
  const [preview, setPreview] = useState(null);
  const [confirmDelete, setConfirmDelete] = useState(null);
  const [deleting, setDeleting] = useState(false);

  const fetchDesigns = async () => {
    try {
      const res = await axios.get(`${API_URL}/leads/${leadId}/bottle-designs`, { withCredentials: true });
      setDesigns(res.data?.designs || []);
    } catch (e) {
      setDesigns([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (leadId) fetchDesigns();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [leadId]);

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
      await axios.delete(`${API_URL}/leads/${leadId}/bottle-designs/${confirmDelete.id}`, { withCredentials: true });
      toast.success('Design deleted');
      setDesigns((prev) => prev.filter((x) => x.id !== confirmDelete.id));
      setConfirmDelete(null);
    } catch (e) {
      toast.error('Failed to delete design');
    } finally {
      setDeleting(false);
    }
  };

  return (
    <Card className="p-4 sm:p-6" data-testid="lead-bottle-designs-card">
      <div className="flex items-center justify-between mb-4 gap-3">
        <h2 className="text-base sm:text-lg font-semibold flex items-center gap-2">
          <Sparkles className="h-4 w-4 sm:h-5 sm:w-5 text-primary" /> Bottle Designs
          {designs.length > 0 && (
            <Badge variant="secondary" className="ml-1" data-testid="bottle-designs-count">{designs.length}</Badge>
          )}
        </h2>
        <Button
          size="sm"
          onClick={() => navigate(`/bottle-preview?lead=${leadId}`)}
          data-testid="add-bottle-design-btn"
        >
          <Plus className="h-4 w-4 mr-1.5" /> Create Design
        </Button>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-10 text-muted-foreground" data-testid="bottle-designs-loading">
          <Loader2 className="h-5 w-5 animate-spin mr-2" /> Loading designs…
        </div>
      ) : designs.length === 0 ? (
        <div
          className="flex flex-col items-center justify-center text-center py-10 px-4 rounded-xl border border-dashed border-border bg-muted/30"
          data-testid="bottle-designs-empty"
        >
          <div className="h-12 w-12 rounded-2xl bg-primary/10 flex items-center justify-center mb-3">
            <Sparkles className="h-6 w-6 text-primary" />
          </div>
          <p className="text-sm font-medium text-foreground">No bottle designs yet</p>
          <p className="text-xs text-muted-foreground mt-1 max-w-xs">
            Create a white-label bottle mockup for {company || 'this lead'} and approve it to save it here.
          </p>
          <Button
            variant="outline"
            size="sm"
            className="mt-4"
            onClick={() => navigate(`/bottle-preview?lead=${leadId}`)}
            data-testid="empty-create-bottle-design-btn"
          >
            <Plus className="h-4 w-4 mr-1.5" /> Create the first design
          </Button>
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
    </Card>
  );
};

export default LeadBottleDesigns;
