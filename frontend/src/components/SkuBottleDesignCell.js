import React, { useState } from 'react';
import { Button } from './ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from './ui/dialog';
import { Upload, X, Image as ImageIcon, Loader2 } from 'lucide-react';
import { toast } from 'sonner';

const API_URL = process.env.REACT_APP_BACKEND_URL + '/api';

const ACCEPTED_IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/webp'];
const ACCEPTED_EXTENSIONS = ['.jpg', '.jpeg', '.png', '.webp'];

// Compact per-row uploader/preview for the approved bottle design inside the
// Account "SKU Details" table. Fields live on the sku_pricing row itself.
export default function SkuBottleDesignCell({ accountId, skuId, designUrl, editing, onChange, testId }) {
  const [saving, setSaving] = useState(false);
  const [previewOpen, setPreviewOpen] = useState(false);
  const [localSrc, setLocalSrc] = useState(null); // freshly-uploaded preview before pricing save

  const src = localSrc || (designUrl ? `${process.env.REACT_APP_BACKEND_URL}${designUrl}` : null);

  const handleFileSelect = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const lowerName = (file.name || '').toLowerCase();
    const okType = ACCEPTED_IMAGE_TYPES.includes(file.type)
      || ACCEPTED_EXTENSIONS.some((ext) => lowerName.endsWith(ext));
    if (!okType) {
      toast.error('Unsupported file. Please upload a JPG, JPEG, PNG or WEBP image.');
      e.target.value = '';
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      toast.error('File size must be less than 5MB');
      e.target.value = '';
      return;
    }
    const reader = new FileReader();
    reader.onload = async () => {
      setSaving(true);
      try {
        const response = await fetch(`${API_URL}/accounts/${accountId}/sku-pricing/${skuId}/bottle-design`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include',
          body: JSON.stringify({ image: reader.result }),
        });
        if (!response.ok) throw new Error('upload failed');
        const data = await response.json();
        setLocalSrc(reader.result);
        onChange?.({
          bottle_design_url: data.bottle_design_url,
          bottle_design_storage_path: data.bottle_design_storage_path,
          bottle_design_content_type: data.bottle_design_content_type,
        });
        toast.success('Bottle design uploaded');
      } catch (err) {
        toast.error('Failed to upload bottle design');
      } finally {
        setSaving(false);
      }
    };
    reader.readAsDataURL(file);
    e.target.value = '';
  };

  const handleRemove = async () => {
    setSaving(true);
    try {
      const response = await fetch(`${API_URL}/accounts/${accountId}/sku-pricing/${skuId}/bottle-design`, {
        method: 'DELETE',
        credentials: 'include',
      });
      if (!response.ok) throw new Error('remove failed');
      setLocalSrc(null);
      onChange?.({ bottle_design_url: null, bottle_design_storage_path: null, bottle_design_content_type: null });
      toast.success('Bottle design removed');
    } catch (err) {
      toast.error('Failed to remove bottle design');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="flex items-center gap-1.5">
      {src ? (
        <button
          type="button"
          onClick={() => setPreviewOpen(true)}
          className="w-10 h-10 border rounded-md overflow-hidden bg-gray-50 cursor-zoom-in hover:border-blue-400 hover:shadow transition-all shrink-0"
          title="Click to preview"
          data-testid={testId ? `${testId}-thumbnail` : undefined}
        >
          <img src={src} alt="Approved bottle design" className="w-full h-full object-contain" />
        </button>
      ) : (
        !editing && <span className="text-xs text-slate-300">—</span>
      )}

      {editing && (
        <>
          <label className={skuId ? 'cursor-pointer' : 'cursor-not-allowed'} title={skuId ? '' : 'Select a SKU first'}>
            <input
              type="file"
              accept=".jpg,.jpeg,.png,.webp,image/jpeg,image/png,image/webp"
              onChange={handleFileSelect}
              className="hidden"
              disabled={saving || !skuId}
              data-testid={testId ? `${testId}-file-input` : undefined}
            />
            <Button type="button" variant="outline" size="sm" className="h-8 px-2 text-xs" asChild disabled={saving || !skuId}>
              <span>
                {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Upload className="w-3.5 h-3.5" />}
                <span className="ml-1">{src ? 'Change' : 'Upload'}</span>
              </span>
            </Button>
          </label>
          {src && (
            <Button
              type="button"
              variant="ghost"
              size="icon"
              onClick={handleRemove}
              disabled={saving}
              className="h-8 w-8 text-red-500 hover:text-red-700 hover:bg-red-50"
              title="Remove design"
              data-testid={testId ? `${testId}-remove-btn` : undefined}
            >
              <X className="w-3.5 h-3.5" />
            </Button>
          )}
        </>
      )}

      <Dialog open={previewOpen} onOpenChange={setPreviewOpen}>
        <DialogContent className="max-w-3xl" data-testid="sku-bottle-design-preview-dialog">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <ImageIcon className="w-5 h-5" /> Approved Bottle Design
            </DialogTitle>
          </DialogHeader>
          <div className="flex justify-center items-center bg-slate-50 rounded-lg p-4 min-h-[260px]">
            {src && <img src={src} alt="Approved bottle design" className="max-h-[60vh] max-w-full object-contain" />}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
