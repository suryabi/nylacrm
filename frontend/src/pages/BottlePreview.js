import React, { useState, useRef, useCallback } from 'react';
import Cropper from 'react-easy-crop';
import { Card } from '../components/ui/card';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Label } from '../components/ui/label';
import { Slider } from '../components/ui/slider';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '../components/ui/tabs';
import { toast } from 'sonner';
import { 
  Upload, Download, RotateCcw, Loader2, Sparkles, 
  Crop, Circle, Square, Eraser, ZoomIn, Check, X, Move, RotateCw, RectangleHorizontal,
  Pipette
} from 'lucide-react';
import axios from 'axios';

const API_URL = process.env.REACT_APP_BACKEND_URL + '/api';

// Bottle templates - Air Water bottles
const BOTTLE_TEMPLATES = [
  {
    id: 'bottle1',
    name: 'Air Water Duo',
    description: 'Front & Back View',
    image: 'https://customer-assets.emergentagent.com/job_ca75408a-cd0b-4269-9030-efa58b12f03d/artifacts/c9fvt4g7_WhatsApp%20Image%202026-02-21%20at%203.39.21%20PM.jpeg'
  },
  {
    id: 'bottle2',
    name: 'Air Water Single',
    description: 'Premium View',
    image: 'https://customer-assets.emergentagent.com/job_ca75408a-cd0b-4269-9030-efa58b12f03d/artifacts/5thitm9j_WhatsApp%20Image%202026-02-21%20at%203.52.35%20PM.jpeg'
  }
];

// Helper function to create cropped image
const createCroppedImage = async (imageSrc, pixelCrop, shape = 'rectangle') => {
  const image = await createImage(imageSrc);
  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d');

  canvas.width = pixelCrop.width;
  canvas.height = pixelCrop.height;

  // For circle shape, clip the context
  if (shape === 'circle') {
    ctx.beginPath();
    ctx.arc(
      pixelCrop.width / 2,
      pixelCrop.height / 2,
      Math.min(pixelCrop.width, pixelCrop.height) / 2,
      0,
      2 * Math.PI
    );
    ctx.clip();
  } else if (shape === 'rounded-square') {
    // Rounded square with border radius
    const size = Math.min(pixelCrop.width, pixelCrop.height);
    const radius = size * 0.2; // 20% corner radius
    ctx.beginPath();
    ctx.moveTo(radius, 0);
    ctx.lineTo(pixelCrop.width - radius, 0);
    ctx.quadraticCurveTo(pixelCrop.width, 0, pixelCrop.width, radius);
    ctx.lineTo(pixelCrop.width, pixelCrop.height - radius);
    ctx.quadraticCurveTo(pixelCrop.width, pixelCrop.height, pixelCrop.width - radius, pixelCrop.height);
    ctx.lineTo(radius, pixelCrop.height);
    ctx.quadraticCurveTo(0, pixelCrop.height, 0, pixelCrop.height - radius);
    ctx.lineTo(0, radius);
    ctx.quadraticCurveTo(0, 0, radius, 0);
    ctx.closePath();
    ctx.clip();
  }

  ctx.drawImage(
    image,
    pixelCrop.x,
    pixelCrop.y,
    pixelCrop.width,
    pixelCrop.height,
    0,
    0,
    pixelCrop.width,
    pixelCrop.height
  );

  return canvas.toDataURL('image/png');
};

// Helper to load image
const createImage = (url) =>
  new Promise((resolve, reject) => {
    const image = new Image();
    image.addEventListener('load', () => resolve(image));
    image.addEventListener('error', (error) => reject(error));
    image.crossOrigin = 'anonymous';
    image.src = url;
  });

// Simple client-side background removal (basic threshold-based for white backgrounds)
const removeWhiteBackground = async (imageSrc, threshold = 240) => {
  const image = await createImage(imageSrc);
  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d');

  canvas.width = image.width;
  canvas.height = image.height;
  ctx.drawImage(image, 0, 0);

  const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
  const data = imageData.data;

  // Remove near-white backgrounds
  for (let i = 0; i < data.length; i += 4) {
    const r = data[i];
    const g = data[i + 1];
    const b = data[i + 2];

    // Check if pixel is close to white/light gray
    if (r > threshold && g > threshold && b > threshold) {
      data[i + 3] = 0; // Set alpha to 0 (transparent)
    }
  }

  ctx.putImageData(imageData, 0, 0);
  return canvas.toDataURL('image/png');
};

// Advanced background removal with color tolerance
const removeColorBackground = async (imageSrc, targetColor, tolerance = 30) => {
  const image = await createImage(imageSrc);
  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d');

  canvas.width = image.width;
  canvas.height = image.height;
  ctx.drawImage(image, 0, 0);

  const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
  const data = imageData.data;

  // Parse target color
  const targetR = targetColor.r;
  const targetG = targetColor.g;
  const targetB = targetColor.b;

  // Remove pixels close to the target color
  for (let i = 0; i < data.length; i += 4) {
    const r = data[i];
    const g = data[i + 1];
    const b = data[i + 2];

    // Calculate color distance
    const distance = Math.sqrt(
      Math.pow(r - targetR, 2) +
      Math.pow(g - targetG, 2) +
      Math.pow(b - targetB, 2)
    );

    // If the pixel is close enough to target color, make it transparent
    if (distance <= tolerance) {
      // Gradual transparency based on distance for smoother edges
      const alpha = Math.min(255, Math.max(0, (distance / tolerance) * 255));
      data[i + 3] = Math.round(alpha);
    }
  }

  ctx.putImageData(imageData, 0, 0);
  return canvas.toDataURL('image/png');
};

// Get pixel color from click position
const getPixelColor = async (imageSrc, x, y, width, height) => {
  const image = await createImage(imageSrc);
  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d');

  canvas.width = image.width;
  canvas.height = image.height;
  ctx.drawImage(image, 0, 0);

  // Scale coordinates to actual image size
  const scaleX = image.width / width;
  const scaleY = image.height / height;
  const actualX = Math.floor(x * scaleX);
  const actualY = Math.floor(y * scaleY);

  const pixel = ctx.getImageData(actualX, actualY, 1, 1).data;
  return { r: pixel[0], g: pixel[1], b: pixel[2] };
};

// Resize image
const resizeImage = async (imageSrc, scale) => {
  const image = await createImage(imageSrc);
  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d');

  const newWidth = image.width * scale;
  const newHeight = image.height * scale;

  canvas.width = newWidth;
  canvas.height = newHeight;

  ctx.drawImage(image, 0, 0, newWidth, newHeight);
  return canvas.toDataURL('image/png');
};

export default function BottlePreview() {
  const [logoFile, setLogoFile] = useState(null);
  const [logoPreview, setLogoPreview] = useState('');
  const [originalLogo, setOriginalLogo] = useState(''); // Keep original for re-processing
  const [customerName, setCustomerName] = useState('');
  const [uploading, setUploading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [processing, setProcessing] = useState(false);
  const fileInputRef = useRef(null);

  // Cropping state
  const [showCropper, setShowCropper] = useState(false);
  const [crop, setCrop] = useState({ x: 0, y: 0 });
  const [zoom, setZoom] = useState(1);
  const [croppedAreaPixels, setCroppedAreaPixels] = useState(null);
  const [cropShape, setCropShape] = useState('rect'); // 'rect' or 'round'

  // Logo style state
  const [logoShape, setLogoShape] = useState('original'); // 'original', 'circle', 'square'
  const [logoScale, setLogoScale] = useState(100); // percentage

  // Logo position state (for dragging)
  const [logoPosition, setLogoPosition] = useState({ x: 50, y: 50 }); // percentage from center
  const [isDragging, setIsDragging] = useState(false);
  const bottleContainerRef = useRef(null);

  const onCropComplete = useCallback((croppedArea, croppedAreaPixels) => {
    setCroppedAreaPixels(croppedAreaPixels);
  }, []);

  const handleFileSelect = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!file.type.startsWith('image/')) {
      toast.error('Please upload an image file (PNG, JPG, or SVG)');
      return;
    }

    if (file.size > 5 * 1024 * 1024) {
      toast.error('File size must be less than 5MB');
      return;
    }

    setUploading(true);
    try {
      const formData = new FormData();
      formData.append('file', file);

      const token = localStorage.getItem('token');
      const response = await axios.post(`${API_URL}/bottle-preview/upload-logo`, formData, {
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'multipart/form-data'
        }
      });

      setLogoPreview(response.data.logo_data);
      setOriginalLogo(response.data.logo_data);
      setLogoFile(file);
      setLogoShape('original');
      setLogoScale(100);
      toast.success('Logo uploaded! You can now edit it.');
    } catch (error) {
      toast.error('Failed to upload logo');
    } finally {
      setUploading(false);
    }
  };

  const handleReset = () => {
    setLogoFile(null);
    setLogoPreview('');
    setOriginalLogo('');
    setCustomerName('');
    setLogoShape('original');
    setLogoScale(100);
    setLogoPosition({ x: 50, y: 50 });
    setShowCropper(false);
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  const handleResetEdits = () => {
    if (originalLogo) {
      setLogoPreview(originalLogo);
      setLogoShape('original');
      setLogoScale(100);
      setLogoPosition({ x: 50, y: 50 });
      toast.success('Edits reset to original');
    }
  };

  // Drag handlers for logo positioning
  const handleMouseDown = (e) => {
    if (!logoPreview) return;
    e.preventDefault();
    setIsDragging(true);
  };

  const handleMouseMove = useCallback((e) => {
    if (!isDragging || !bottleContainerRef.current) return;
    
    const container = bottleContainerRef.current;
    const rect = container.getBoundingClientRect();
    
    // Calculate position as percentage
    const x = ((e.clientX - rect.left) / rect.width) * 100;
    const y = ((e.clientY - rect.top) / rect.height) * 100;
    
    // Clamp values between 10% and 90% to keep logo visible
    setLogoPosition({
      x: Math.max(10, Math.min(90, x)),
      y: Math.max(15, Math.min(85, y))
    });
  }, [isDragging]);

  const handleMouseUp = useCallback(() => {
    setIsDragging(false);
  }, []);

  // Touch handlers for mobile
  const handleTouchStart = (e) => {
    if (!logoPreview) return;
    setIsDragging(true);
  };

  const handleTouchMove = useCallback((e) => {
    if (!isDragging || !bottleContainerRef.current) return;
    
    const touch = e.touches[0];
    const container = bottleContainerRef.current;
    const rect = container.getBoundingClientRect();
    
    const x = ((touch.clientX - rect.left) / rect.width) * 100;
    const y = ((touch.clientY - rect.top) / rect.height) * 100;
    
    setLogoPosition({
      x: Math.max(10, Math.min(90, x)),
      y: Math.max(15, Math.min(85, y))
    });
  }, [isDragging]);

  const handleTouchEnd = useCallback(() => {
    setIsDragging(false);
  }, []);

  // Reset position to center
  const handleResetPosition = () => {
    setLogoPosition({ x: 50, y: 50 });
    toast.success('Logo position reset to center');
  };

  const handleOpenCropper = () => {
    setCrop({ x: 0, y: 0 });
    setZoom(1);
    setCropShape('rect');
    setShowCropper(true);
  };

  const handleApplyCrop = async () => {
    if (!croppedAreaPixels) {
      toast.error('Please select a crop area');
      return;
    }

    setProcessing(true);
    try {
      const shapeType = cropShape === 'round' ? 'circle' : 'rectangle';
      const croppedImage = await createCroppedImage(originalLogo, croppedAreaPixels, shapeType);
      setLogoPreview(croppedImage);
      setOriginalLogo(croppedImage); // Update original for further edits
      setShowCropper(false);
      toast.success('Crop applied!');
    } catch (error) {
      toast.error('Failed to crop image');
    } finally {
      setProcessing(false);
    }
  };

  const handleShapeChange = async (shape) => {
    if (!originalLogo) return;

    setProcessing(true);
    try {
      if (shape === 'circle') {
        // Create circular version
        const image = await createImage(originalLogo);
        const canvas = document.createElement('canvas');
        const ctx = canvas.getContext('2d');
        const size = Math.min(image.width, image.height);
        
        canvas.width = size;
        canvas.height = size;

        ctx.beginPath();
        ctx.arc(size / 2, size / 2, size / 2, 0, 2 * Math.PI);
        ctx.clip();

        // Center the image
        const offsetX = (image.width - size) / 2;
        const offsetY = (image.height - size) / 2;
        ctx.drawImage(image, offsetX, offsetY, size, size, 0, 0, size, size);

        setLogoPreview(canvas.toDataURL('image/png'));
      } else if (shape === 'square') {
        // Create square version
        const image = await createImage(originalLogo);
        const canvas = document.createElement('canvas');
        const ctx = canvas.getContext('2d');
        const size = Math.min(image.width, image.height);
        
        canvas.width = size;
        canvas.height = size;

        const offsetX = (image.width - size) / 2;
        const offsetY = (image.height - size) / 2;
        ctx.drawImage(image, offsetX, offsetY, size, size, 0, 0, size, size);

        setLogoPreview(canvas.toDataURL('image/png'));
      } else {
        setLogoPreview(originalLogo);
      }
      setLogoShape(shape);
      toast.success(`Shape changed to ${shape}`);
    } catch (error) {
      toast.error('Failed to change shape');
    } finally {
      setProcessing(false);
    }
  };

  const handleRemoveBackground = async () => {
    if (!logoPreview) return;

    setProcessing(true);
    try {
      const processedImage = await removeBackground(logoPreview, 230);
      setLogoPreview(processedImage);
      toast.success('Background removed! (Light/white backgrounds)');
    } catch (error) {
      toast.error('Failed to remove background');
    } finally {
      setProcessing(false);
    }
  };

  const handleScaleChange = async (value) => {
    const newScale = value[0];
    setLogoScale(newScale);
  };

  const handleSave = async () => {
    if (!logoPreview) {
      toast.error('Please upload a logo first');
      return;
    }

    setSaving(true);
    try {
      const token = localStorage.getItem('token');
      await axios.post(
        `${API_URL}/bottle-preview/save`,
        {
          customer_name: customerName,
          bottle_size: '24 Brand',
          logo_data: logoPreview
        },
        { headers: { Authorization: `Bearer ${token}` } }
      );
      toast.success('Preview saved to history!');
    } catch (error) {
      toast.error('Failed to save preview');
    } finally {
      setSaving(false);
    }
  };

  const handleDownload = () => {
    if (!logoPreview) return;
    
    // Create a composite image with bottle and logo
    const link = document.createElement('a');
    link.download = `bottle-preview-${customerName || 'custom'}.png`;
    link.href = logoPreview;
    link.click();
    toast.success('Logo downloaded!');
  };

  return (
    <div className="max-w-6xl mx-auto space-y-6 pb-8">
      <div className="text-center">
        <div className="flex items-center justify-center gap-2 mb-2">
          <Sparkles className="h-8 w-8 text-primary" />
          <h1 className="text-4xl font-light text-foreground">White-Label Bottle Preview</h1>
        </div>
        <p className="text-foreground-muted">24 Brand SKU - Clear Glass Bottle with Custom Label</p>
      </div>

      {/* Cropper Modal */}
      {showCropper && originalLogo && (
        <div className="fixed inset-0 bg-black/80 z-50 flex items-center justify-center p-4">
          <Card className="w-full max-w-2xl bg-card p-6 rounded-2xl">
            <div className="flex justify-between items-center mb-4">
              <h3 className="text-lg font-semibold">Crop Logo</h3>
              <Button
                variant="ghost"
                size="icon"
                onClick={() => setShowCropper(false)}
                data-testid="close-cropper-btn"
              >
                <X className="h-5 w-5" />
              </Button>
            </div>

            <div className="relative h-80 bg-gray-900 rounded-xl overflow-hidden mb-4">
              <Cropper
                image={originalLogo}
                crop={crop}
                zoom={zoom}
                aspect={cropShape === 'round' ? 1 : undefined}
                cropShape={cropShape}
                onCropChange={setCrop}
                onCropComplete={onCropComplete}
                onZoomChange={setZoom}
              />
            </div>

            <div className="space-y-4">
              <div className="space-y-2">
                <Label className="flex items-center gap-2">
                  <ZoomIn className="h-4 w-4" /> Zoom
                </Label>
                <Slider
                  value={[zoom]}
                  min={1}
                  max={3}
                  step={0.1}
                  onValueChange={(value) => setZoom(value[0])}
                  data-testid="crop-zoom-slider"
                />
              </div>

              <div className="flex gap-2">
                <Button
                  variant={cropShape === 'rect' ? 'default' : 'outline'}
                  onClick={() => setCropShape('rect')}
                  className="flex-1"
                  data-testid="crop-shape-rect-btn"
                >
                  <Square className="h-4 w-4 mr-2" /> Rectangle
                </Button>
                <Button
                  variant={cropShape === 'round' ? 'default' : 'outline'}
                  onClick={() => setCropShape('round')}
                  className="flex-1"
                  data-testid="crop-shape-round-btn"
                >
                  <Circle className="h-4 w-4 mr-2" /> Circle
                </Button>
              </div>

              <div className="flex gap-2">
                <Button
                  variant="outline"
                  onClick={() => setShowCropper(false)}
                  className="flex-1"
                  data-testid="cancel-crop-btn"
                >
                  Cancel
                </Button>
                <Button
                  onClick={handleApplyCrop}
                  className="flex-1"
                  disabled={processing}
                  data-testid="apply-crop-btn"
                >
                  {processing ? (
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  ) : (
                    <Check className="h-4 w-4 mr-2" />
                  )}
                  Apply Crop
                </Button>
              </div>
            </div>
          </Card>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="space-y-6">
          {/* Upload Section */}
          <Card className="p-8 bg-card border border-border rounded-2xl">
            <h2 className="text-lg font-semibold mb-6">Customer Logo</h2>
            
            <div className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="customer-name">Customer Name (Optional)</Label>
                <Input
                  id="customer-name"
                  placeholder="e.g., TechCorp India"
                  value={customerName}
                  onChange={(e) => setCustomerName(e.target.value)}
                  className="h-12 rounded-xl"
                  data-testid="customer-name-input"
                />
              </div>

              <div className="space-y-2">
                <Label>Upload Logo</Label>
                <div
                  onClick={() => fileInputRef.current?.click()}
                  className="border-2 border-dashed border-border rounded-xl p-12 text-center cursor-pointer hover:border-primary/50 hover:bg-secondary/50 transition-all"
                  data-testid="logo-upload-area"
                >
                  {uploading ? (
                    <Loader2 className="h-16 w-16 mx-auto text-primary animate-spin mb-4" />
                  ) : logoFile ? (
                    <div className="space-y-3">
                      <img src={logoPreview} alt="Logo" className="h-20 mx-auto object-contain" />
                      <p className="text-sm font-medium text-foreground">{logoFile.name}</p>
                      <p className="text-xs text-muted-foreground">Click to change</p>
                    </div>
                  ) : (
                    <>
                      <Upload className="h-16 w-16 mx-auto text-muted-foreground mb-4" />
                      <p className="text-base font-medium text-foreground mb-2">
                        Click to upload logo
                      </p>
                      <p className="text-sm text-muted-foreground">
                        PNG, JPG, or SVG (max 5MB)
                      </p>
                    </>
                  )}
                </div>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/png,image/jpeg,image/jpg,image/svg+xml"
                  onChange={handleFileSelect}
                  className="hidden"
                  data-testid="logo-file-input"
                />
              </div>
            </div>
          </Card>

          {/* Logo Editing Tools */}
          {logoPreview && (
            <Card className="p-6 bg-card border border-border rounded-2xl">
              <h2 className="text-lg font-semibold mb-4">Logo Editing Tools</h2>
              
              <div className="space-y-5">
                {/* Crop Button */}
                <div>
                  <Label className="text-sm text-muted-foreground mb-2 block">Crop Logo</Label>
                  <Button
                    onClick={handleOpenCropper}
                    variant="outline"
                    className="w-full h-12 rounded-xl"
                    disabled={processing}
                    data-testid="open-cropper-btn"
                  >
                    <Crop className="h-5 w-5 mr-2" />
                    Open Cropper
                  </Button>
                </div>

                {/* Shape Selection */}
                <div>
                  <Label className="text-sm text-muted-foreground mb-2 block">Logo Shape</Label>
                  <div className="grid grid-cols-3 gap-2">
                    <Button
                      onClick={() => handleShapeChange('original')}
                      variant={logoShape === 'original' ? 'default' : 'outline'}
                      className="h-12 rounded-xl"
                      disabled={processing}
                      data-testid="shape-original-btn"
                    >
                      Original
                    </Button>
                    <Button
                      onClick={() => handleShapeChange('circle')}
                      variant={logoShape === 'circle' ? 'default' : 'outline'}
                      className="h-12 rounded-xl"
                      disabled={processing}
                      data-testid="shape-circle-btn"
                    >
                      <Circle className="h-4 w-4 mr-1" /> Circle
                    </Button>
                    <Button
                      onClick={() => handleShapeChange('square')}
                      variant={logoShape === 'square' ? 'default' : 'outline'}
                      className="h-12 rounded-xl"
                      disabled={processing}
                      data-testid="shape-square-btn"
                    >
                      <Square className="h-4 w-4 mr-1" /> Square
                    </Button>
                  </div>
                </div>

                {/* Background Removal */}
                <div>
                  <Label className="text-sm text-muted-foreground mb-2 block">Background Removal</Label>
                  <Button
                    onClick={handleRemoveBackground}
                    variant="outline"
                    className="w-full h-12 rounded-xl"
                    disabled={processing}
                    data-testid="remove-bg-btn"
                  >
                    {processing ? (
                      <Loader2 className="h-5 w-5 mr-2 animate-spin" />
                    ) : (
                      <Eraser className="h-5 w-5 mr-2" />
                    )}
                    Remove White Background
                  </Button>
                  <p className="text-xs text-muted-foreground mt-1">
                    Best for logos with white/light backgrounds
                  </p>
                </div>

                {/* Size Slider */}
                <div>
                  <Label className="text-sm text-muted-foreground mb-2 block">
                    Logo Size on Bottle: {logoScale}%
                  </Label>
                  <Slider
                    value={[logoScale]}
                    min={30}
                    max={150}
                    step={5}
                    onValueChange={handleScaleChange}
                    className="py-2"
                    data-testid="logo-scale-slider"
                  />
                  <div className="flex justify-between text-xs text-muted-foreground mt-1">
                    <span>30%</span>
                    <span>100%</span>
                    <span>150%</span>
                  </div>
                </div>

                {/* Position Controls */}
                <div>
                  <Label className="text-sm text-muted-foreground mb-2 block">
                    <Move className="h-4 w-4 inline mr-1" />
                    Logo Position
                  </Label>
                  <div className="bg-secondary/50 rounded-xl p-3 space-y-2">
                    <p className="text-xs text-muted-foreground text-center">
                      Drag the logo on the bottle to reposition it
                    </p>
                    <div className="flex items-center justify-between text-xs">
                      <span className="text-muted-foreground">X: {Math.round(logoPosition.x)}%</span>
                      <span className="text-muted-foreground">Y: {Math.round(logoPosition.y)}%</span>
                    </div>
                    <Button
                      onClick={handleResetPosition}
                      variant="outline"
                      size="sm"
                      className="w-full h-9 rounded-lg text-xs"
                      disabled={logoPosition.x === 50 && logoPosition.y === 50}
                      data-testid="reset-position-btn"
                    >
                      <RotateCw className="h-3 w-3 mr-1" />
                      Reset to Center
                    </Button>
                  </div>
                </div>

                {/* Reset Edits */}
                <Button
                  onClick={handleResetEdits}
                  variant="ghost"
                  className="w-full h-10 text-sm"
                  disabled={processing}
                  data-testid="reset-edits-btn"
                >
                  <RotateCcw className="h-4 w-4 mr-2" />
                  Reset Edits to Original
                </Button>
              </div>
            </Card>
          )}

          {/* Action Buttons */}
          <Card className="p-6 bg-card border border-border rounded-2xl">
            <div className="grid grid-cols-2 gap-3">
              <Button
                onClick={handleReset}
                variant="outline"
                className="h-14 rounded-full text-base"
                disabled={!logoPreview}
                data-testid="reset-all-btn"
              >
                <RotateCcw className="h-5 w-5 mr-2" />
                Reset All
              </Button>
              <Button
                onClick={handleDownload}
                variant="outline"
                className="h-14 rounded-full text-base"
                disabled={!logoPreview}
                data-testid="download-btn"
              >
                <Download className="h-5 w-5 mr-2" />
                Download
              </Button>
            </div>
            <Button
              onClick={handleSave}
              className="w-full h-14 rounded-full mt-3 text-base"
              disabled={!logoPreview || saving}
              data-testid="save-btn"
            >
              {saving ? (
                <><Loader2 className="h-5 w-5 mr-2 animate-spin" /> Saving...</>
              ) : (
                'Save to History'
              )}
            </Button>
          </Card>
        </div>

        {/* Live Preview Section */}
        <div className="space-y-6">
          <Card className="p-6 bg-card border border-border rounded-2xl overflow-hidden">
            <div className="flex justify-between items-center mb-4">
              <h2 className="text-lg font-semibold">Live Preview</h2>
              {logoPreview && (
                <div className="flex items-center gap-2 text-xs text-muted-foreground">
                  <Move className="h-4 w-4" />
                  <span>Drag logo to reposition</span>
                </div>
              )}
            </div>
            
            <div 
              ref={bottleContainerRef}
              className={`relative rounded-xl min-h-[650px] flex items-center justify-center select-none ${logoPreview ? 'cursor-move' : ''}`}
              style={{
                background: 'linear-gradient(180deg, #6b7280 0%, #9ca3af 50%, #e5e7eb 100%)'
              }}
              onMouseMove={handleMouseMove}
              onMouseUp={handleMouseUp}
              onMouseLeave={handleMouseUp}
              onTouchMove={handleTouchMove}
              onTouchEnd={handleTouchEnd}
              data-testid="bottle-preview-area"
            >
              {!logoPreview ? (
                <div className="text-center">
                  <div className="h-24 w-24 mx-auto mb-4 rounded-full bg-white/20 backdrop-blur flex items-center justify-center">
                    <Sparkles className="h-12 w-12 text-white/70" />
                  </div>
                  <p className="text-white/80 text-lg font-medium">Upload logo to see preview</p>
                </div>
              ) : (
                <div className="relative w-full flex items-center justify-center py-4">
                  <img
                    src={BOTTLE_TEMPLATE}
                    alt="Nyla 24 Brand Clear Glass Bottle"
                    className="h-[580px] w-auto object-contain pointer-events-none"
                  />
                  
                  {/* Draggable Logo */}
                  <div
                    className={`absolute cursor-grab active:cursor-grabbing transition-all duration-75 ${isDragging ? 'scale-105 z-10' : ''}`}
                    style={{
                      left: `${logoPosition.x}%`,
                      top: `${logoPosition.y}%`,
                      transform: 'translate(-50%, -50%)',
                      maxWidth: '35%',
                      maxHeight: '25%'
                    }}
                    onMouseDown={handleMouseDown}
                    onTouchStart={handleTouchStart}
                    data-testid="draggable-logo-container"
                  >
                    <img
                      src={logoPreview}
                      alt="Customer Logo"
                      className="max-h-full object-contain transition-transform duration-200 pointer-events-none"
                      style={{ 
                        filter: `drop-shadow(0 2px 8px rgba(0,0,0,${isDragging ? '0.4' : '0.25'}))`,
                        transform: `scale(${logoScale / 100})`,
                        maxWidth: '150px',
                        maxHeight: '100px'
                      }}
                      data-testid="preview-logo-img"
                    />
                    {isDragging && (
                      <div className="absolute -bottom-6 left-1/2 -translate-x-1/2 bg-black/70 text-white text-xs px-2 py-1 rounded whitespace-nowrap">
                        Release to place
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>

            {logoPreview && customerName && (
              <div className="mt-6 text-center bg-primary/5 rounded-xl p-4">
                <p className="text-sm text-muted-foreground">White-Label Preview for</p>
                <p className="text-xl font-semibold text-foreground">{customerName}</p>
                <p className="text-sm text-primary mt-1">Nyla 24 Brand • Clear Glass</p>
              </div>
            )}

            {logoPreview && (
              <div className="mt-4 flex flex-wrap gap-2 justify-center">
                {logoShape !== 'original' && (
                  <span className="px-3 py-1 bg-primary/10 text-primary text-xs rounded-full">
                    Shape: {logoShape}
                  </span>
                )}
                {logoScale !== 100 && (
                  <span className="px-3 py-1 bg-primary/10 text-primary text-xs rounded-full">
                    Size: {logoScale}%
                  </span>
                )}
                {(logoPosition.x !== 50 || logoPosition.y !== 50) && (
                  <span className="px-3 py-1 bg-primary/10 text-primary text-xs rounded-full">
                    Position: {Math.round(logoPosition.x)}%, {Math.round(logoPosition.y)}%
                  </span>
                )}
              </div>
            )}
          </Card>
        </div>
      </div>

      <Card className="p-6 bg-accent/10 border border-accent/20 rounded-2xl">
        <div className="text-center">
          <h3 className="text-sm font-semibold mb-3 text-foreground">Perfect for Customer Presentations</h3>
          <p className="text-sm text-foreground-muted max-w-3xl mx-auto">
            Show customers exactly how their brand will look on Nyla's premium clear glass bottle. 
            Use the editing tools to crop, reshape, remove backgrounds, and resize logos for the perfect fit.
            Ideal for live demos, corporate gifting discussions, and closing white-label deals.
          </p>
        </div>
      </Card>
    </div>
  );
}
