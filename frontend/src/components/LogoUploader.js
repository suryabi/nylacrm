import React, { useState, useCallback } from 'react';
import Cropper from 'react-easy-crop';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { Label } from './ui/label';
import { Slider } from './ui/slider';
import { 
  Dialog, 
  DialogContent, 
  DialogHeader, 
  DialogTitle,
  DialogFooter 
} from './ui/dialog';
import { Upload, ZoomIn, ZoomOut, Crop, Save, X, Image as ImageIcon } from 'lucide-react';
import { toast } from 'sonner';

const API_URL = process.env.REACT_APP_BACKEND_URL + '/api';

// Helper function to create cropped image
const createImage = (url) =>
  new Promise((resolve, reject) => {
    const image = new window.Image();
    image.addEventListener('load', () => resolve(image));
    image.addEventListener('error', (error) => reject(error));
    image.src = url;
  });

const getCroppedImg = async (imageSrc, pixelCrop, targetWidth, targetHeight) => {
  const image = await createImage(imageSrc);
  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d');

  // Set canvas size to target dimensions
  canvas.width = targetWidth;
  canvas.height = targetHeight;

  // Draw the cropped image scaled to target dimensions
  ctx.drawImage(
    image,
    pixelCrop.x,
    pixelCrop.y,
    pixelCrop.width,
    pixelCrop.height,
    0,
    0,
    targetWidth,
    targetHeight
  );

  // Return as base64
  return canvas.toDataURL('image/png');
};

// Convert mm to pixels (assuming 96 DPI for screen)
const mmToPixels = (mm) => Math.round(mm * 3.7795275591);
const pixelsToMm = (px) => Math.round(px / 3.7795275591);

export default function LogoUploader({ entityType = 'accounts', entityId, currentLogo, onLogoUpdate, label = 'Logo' }) {
  const [isOpen, setIsOpen] = useState(false);
  const [imageSrc, setImageSrc] = useState(null);
  const [crop, setCrop] = useState({ x: 0, y: 0 });
  const [zoom, setZoom] = useState(1);
  const [croppedAreaPixels, setCroppedAreaPixels] = useState(null);
  const [saving, setSaving] = useState(false);
  
  // Dimension controls (in mm)
  const [widthMm, setWidthMm] = useState(35);
  const [heightMm, setHeightMm] = useState(35);
  const [lockAspect, setLockAspect] = useState(true);

  const onCropComplete = useCallback((croppedArea, croppedAreaPixels) => {
    setCroppedAreaPixels(croppedAreaPixels);
  }, []);

  const handleFileSelect = (e) => {
    const file = e.target.files?.[0];
    if (file) {
      if (file.size > 5 * 1024 * 1024) {
        toast.error('File size must be less than 5MB');
        return;
      }
      
      const reader = new FileReader();
      reader.onload = () => {
        setImageSrc(reader.result);
        setIsOpen(true);
        setCrop({ x: 0, y: 0 });
        setZoom(1);
      };
      reader.readAsDataURL(file);
    }
  };

  const handleWidthChange = (value) => {
    const newWidth = Math.max(10, Math.min(200, parseInt(value) || 35));
    setWidthMm(newWidth);
    if (lockAspect) {
      setHeightMm(newWidth);
    }
  };

  const handleHeightChange = (value) => {
    const newHeight = Math.max(10, Math.min(200, parseInt(value) || 35));
    setHeightMm(newHeight);
    if (lockAspect) {
      setWidthMm(newHeight);
    }
  };

  const handleSave = async () => {
    if (!croppedAreaPixels || !imageSrc) return;

    setSaving(true);
    try {
      // Convert mm to pixels for output
      const targetWidth = mmToPixels(widthMm);
      const targetHeight = mmToPixels(heightMm);
      
      // Get cropped image as base64
      const croppedImage = await getCroppedImg(imageSrc, croppedAreaPixels, targetWidth, targetHeight);
      
      // Upload to server
      const response = await fetch(`${API_URL}/${entityType}/${entityId}/logo`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        credentials: 'include',
        body: JSON.stringify({
          logo: croppedImage,
          width_mm: widthMm,
          height_mm: heightMm
        })
      });

      if (!response.ok) {
        throw new Error('Failed to upload logo');
      }

      const data = await response.json();
      toast.success('Logo saved successfully');
      onLogoUpdate?.(data.logo_url);
      setIsOpen(false);
      setImageSrc(null);
    } catch (error) {
      console.error('Error saving logo:', error);
      toast.error('Failed to save logo');
    } finally {
      setSaving(false);
    }
  };

  const handleRemoveLogo = async () => {
    if (!currentLogo) return;
    
    setSaving(true);
    try {
      const response = await fetch(`${API_URL}/accounts/${accountId}/logo`, {
        method: 'DELETE',
        credentials: 'include'
      });

      if (!response.ok) {
        throw new Error('Failed to remove logo');
      }

      toast.success('Logo removed');
      onLogoUpdate?.(null);
    } catch (error) {
      console.error('Error removing logo:', error);
      toast.error('Failed to remove logo');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-3">
      <Label className="text-sm font-medium">Account Logo</Label>
      
      {/* Current logo display */}
      <div className="flex items-center gap-4">
        <div className="w-24 h-24 border-2 border-dashed border-gray-300 rounded-lg flex items-center justify-center bg-gray-50 overflow-hidden">
          {currentLogo ? (
            <img 
              src={currentLogo} 
              alt="Account logo" 
              className="w-full h-full object-contain"
            />
          ) : (
            <ImageIcon className="w-8 h-8 text-gray-400" />
          )}
        </div>
        
        <div className="flex flex-col gap-2">
          <label className="cursor-pointer">
            <input
              type="file"
              accept="image/*"
              onChange={handleFileSelect}
              className="hidden"
            />
            <Button type="button" variant="outline" size="sm" asChild>
              <span>
                <Upload className="w-4 h-4 mr-2" />
                {currentLogo ? 'Change Logo' : 'Upload Logo'}
              </span>
            </Button>
          </label>
          
          {currentLogo && (
            <Button 
              type="button" 
              variant="ghost" 
              size="sm"
              onClick={handleRemoveLogo}
              disabled={saving}
              className="text-red-600 hover:text-red-700 hover:bg-red-50"
            >
              <X className="w-4 h-4 mr-2" />
              Remove
            </Button>
          )}
        </div>
      </div>

      {/* Crop Dialog */}
      <Dialog open={isOpen} onOpenChange={setIsOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Crop className="w-5 h-5" />
              Edit Logo
            </DialogTitle>
          </DialogHeader>

          <div className="space-y-4">
            {/* Cropper Area */}
            <div className="relative h-80 bg-gray-900 rounded-lg overflow-hidden">
              {imageSrc && (
                <Cropper
                  image={imageSrc}
                  crop={crop}
                  zoom={zoom}
                  aspect={lockAspect ? 1 : widthMm / heightMm}
                  onCropChange={setCrop}
                  onCropComplete={onCropComplete}
                  onZoomChange={setZoom}
                />
              )}
            </div>

            {/* Zoom Control */}
            <div className="space-y-2">
              <Label className="text-sm flex items-center gap-2">
                <ZoomIn className="w-4 h-4" />
                Zoom
              </Label>
              <div className="flex items-center gap-4">
                <ZoomOut className="w-4 h-4 text-gray-500" />
                <Slider
                  value={[zoom]}
                  onValueChange={(value) => setZoom(value[0])}
                  min={1}
                  max={3}
                  step={0.1}
                  className="flex-1"
                />
                <ZoomIn className="w-4 h-4 text-gray-500" />
                <span className="text-sm text-gray-500 w-12">{zoom.toFixed(1)}x</span>
              </div>
            </div>

            {/* Dimension Controls */}
            <div className="grid grid-cols-3 gap-4">
              <div className="space-y-2">
                <Label className="text-sm">Width (mm)</Label>
                <Input
                  type="number"
                  value={widthMm}
                  onChange={(e) => handleWidthChange(e.target.value)}
                  min={10}
                  max={200}
                  className="[appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                />
              </div>
              <div className="space-y-2">
                <Label className="text-sm">Height (mm)</Label>
                <Input
                  type="number"
                  value={heightMm}
                  onChange={(e) => handleHeightChange(e.target.value)}
                  min={10}
                  max={200}
                  className="[appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                />
              </div>
              <div className="space-y-2">
                <Label className="text-sm">Aspect Ratio</Label>
                <Button
                  type="button"
                  variant={lockAspect ? "default" : "outline"}
                  size="sm"
                  onClick={() => setLockAspect(!lockAspect)}
                  className="w-full"
                >
                  {lockAspect ? 'Locked (1:1)' : 'Custom'}
                </Button>
              </div>
            </div>

            {/* Output Info */}
            <div className="bg-gray-50 p-3 rounded-lg text-sm text-gray-600">
              <p>Output dimensions: <strong>{mmToPixels(widthMm)} x {mmToPixels(heightMm)} pixels</strong> ({widthMm}mm x {heightMm}mm at 96 DPI)</p>
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setIsOpen(false)}>
              Cancel
            </Button>
            <Button onClick={handleSave} disabled={saving}>
              {saving ? (
                <>
                  <span className="animate-spin mr-2">⏳</span>
                  Saving...
                </>
              ) : (
                <>
                  <Save className="w-4 h-4 mr-2" />
                  Save Logo
                </>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
