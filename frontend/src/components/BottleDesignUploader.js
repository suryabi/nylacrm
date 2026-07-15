import React, { useState } from 'react';
import { Button } from './ui/button';
import { Label } from './ui/label';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from './ui/dialog';
import { Upload, X, Image as ImageIcon } from 'lucide-react';
import { toast } from 'sonner';

const API_URL = process.env.REACT_APP_BACKEND_URL + '/api';

const ACCEPTED_IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/webp'];
const ACCEPTED_EXTENSIONS = ['.jpg', '.jpeg', '.png', '.webp'];

export default function BottleDesignUploader({ entityId, currentImage, onUpdate, label = 'Approved Bottle Design' }) {
  const [saving, setSaving] = useState(false);
  const [previewOpen, setPreviewOpen] = useState(false);

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
        const response = await fetch(`${API_URL}/accounts/${entityId}/bottle-design`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include',
          body: JSON.stringify({ image: reader.result }),
        });
        if (!response.ok) throw new Error('upload failed');
        const data = await response.json();
        toast.success('Bottle design saved successfully');
        onUpdate?.(data.bottle_design_url);
      } catch (err) {
        toast.error('Failed to save bottle design');
      } finally {
        setSaving(false);
      }
    };
    reader.readAsDataURL(file);
    e.target.value = '';
  };

  const handleRemove = async () => {
    if (!currentImage) return;
    setSaving(true);
    try {
      const response = await fetch(`${API_URL}/accounts/${entityId}/bottle-design`, {
        method: 'DELETE',
        credentials: 'include',
      });
      if (!response.ok) throw new Error('remove failed');
      toast.success('Bottle design removed');
      onUpdate?.(null);
    } catch (err) {
      toast.error('Failed to remove bottle design');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-3">
      <Label className="text-sm font-medium">{label}</Label>

      <div className="flex items-center gap-4">
        <button
          type="button"
          onClick={() => currentImage && setPreviewOpen(true)}
          disabled={!currentImage}
          title={currentImage ? 'Click to preview' : ''}
          className={`w-24 h-24 border-2 border-dashed border-gray-300 rounded-lg flex items-center justify-center bg-gray-50 overflow-hidden transition-all ${currentImage ? 'cursor-zoom-in hover:border-blue-400 hover:shadow-md' : 'cursor-default'}`}
          data-testid="bottle-design-thumbnail"
        >
          {currentImage ? (
            <img src={currentImage} alt="Approved bottle design" className="w-full h-full object-contain" />
          ) : (
            <ImageIcon className="w-8 h-8 text-gray-400" />
          )}
        </button>

        <div className="flex flex-col gap-2">
          <label className="cursor-pointer">
            <input
              type="file"
              accept=".jpg,.jpeg,.png,.webp,image/jpeg,image/png,image/webp"
              onChange={handleFileSelect}
              className="hidden"
              disabled={saving}
              data-testid="bottle-design-file-input"
            />
            <Button type="button" variant="outline" size="sm" asChild disabled={saving}>
              <span>
                <Upload className="w-4 h-4 mr-2" />
                {saving ? 'Uploading…' : currentImage ? 'Change Design' : 'Upload Design'}
              </span>
            </Button>
          </label>

          {currentImage && (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={handleRemove}
              disabled={saving}
              className="text-red-600 hover:text-red-700 hover:bg-red-50"
              data-testid="bottle-design-remove-btn"
            >
              <X className="w-4 h-4 mr-2" />
              Remove
            </Button>
          )}
        </div>
      </div>

      <Dialog open={previewOpen} onOpenChange={setPreviewOpen}>
        <DialogContent className="max-w-3xl" data-testid="bottle-design-uploader-preview-dialog">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <ImageIcon className="w-5 h-5" /> {label} preview
            </DialogTitle>
          </DialogHeader>
          <div className="flex justify-center items-center bg-slate-50 rounded-lg p-4 min-h-[260px]">
            {currentImage && (
              <img src={currentImage} alt="Approved bottle design" className="max-h-[60vh] max-w-full object-contain" />
            )}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
