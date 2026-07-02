import React, { useState, useRef, useCallback } from 'react';
import Cropper from 'react-easy-crop';
import { Card } from '../components/ui/card';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Label } from '../components/ui/label';
import { Slider } from '../components/ui/slider';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '../components/ui/tabs';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '../components/ui/dialog';
import { toast } from 'sonner';
import { 
  Upload, Download, RotateCcw, Loader2, Sparkles, 
  Crop, Circle, Square, Eraser, ZoomIn, Check, X, Move, RotateCw, RectangleHorizontal,
  Pipette, Crosshair, AlertTriangle, Search, Briefcase, CheckCircle2, Trash2, Plus, ExternalLink, Images
} from 'lucide-react';
import axios from 'axios';

// Use relative URL for API calls to work in both preview and production
const API_URL = '/api';

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

// Fixed logo size options (mm).
const LOGO_SIZE_OPTIONS = [35, 40, 45, 50];
// Per-size logo printing price (INR per bottle)
const LOGO_SIZE_PRICES = { 35: 2.5, 40: 3.5, 45: 4.5, 50: 5.5 };
const DEFAULT_LOGO_MM = 35;

// Physical bottle dimensions — used to scale the logo to real-world size.
// Bottle body Ø68.6 mm width, 286.4 mm total height (cap top → base).
const BOTTLE_TOTAL_HEIGHT_MM = 286.4;
const BOTTLE_IMG_ASPECT = 1600 / 1361; // width/height of the template images
// Fraction of the image HEIGHT the full bottle occupies (cap→base). Fine-tune per template.
const BOTTLE_HEIGHT_FRAC = { bottle1: 0.805, bottle2: 0.8 };
// Logo bounding-box width as a % of the bottle IMAGE width for a given physical size (mm).
// Derived from the bottle's real height so a 35 mm logo ≈ (35/68.6) of the 68.6 mm body width.
const logoBoxWidthPct = (mm, bottleId) => {
  const heightFrac = (mm / BOTTLE_TOTAL_HEIGHT_MM) * (BOTTLE_HEIGHT_FRAC[bottleId] || 0.8);
  return (heightFrac / BOTTLE_IMG_ASPECT) * 100;
};

// Front (brandable) label center per template, as % of the BOTTLE IMAGE.
// Duo shows front+back — the front bottle is on the left (~35%, 60%).
const LOGO_ANCHORS = { bottle1: { x: 35, y: 60 }, bottle2: { x: 50, y: 55 } };
const anchorFor = (id) => LOGO_ANCHORS[id] || { x: 50, y: 50 };

// Geometric CENTER of the (front) bottle for the crosshair guides, as % of the BOTTLE IMAGE.
// Bottle spans ~cap 10.5% → base 80% vertically (reflection below is excluded), so the
// vertical mid-point sits at ~45%. Front bottle body is centered near x=36% (Duo) / 49% (Single).
const BOTTLE_CENTERS = { bottle1: { x: 36, y: 47 }, bottle2: { x: 49, y: 47 } };
const centerFor = (id) => BOTTLE_CENTERS[id] || { x: 50, y: 50 };

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

// Helper to fetch image as blob via backend proxy (bypasses CORS)
const fetchImageAsBlob = async (url) => {
  try {
    // Use backend proxy to fetch the image
    const proxyUrl = `${API_URL}/bottle-preview/proxy-image?url=${encodeURIComponent(url)}`;
    const token = localStorage.getItem('token');
    
    const response = await fetch(proxyUrl, {
      headers: {
        'Authorization': `Bearer ${token}`
      }
    });
    
    if (!response.ok) {
      throw new Error(`Failed to fetch image: ${response.status}`);
    }
    
    const blob = await response.blob();
    return URL.createObjectURL(blob);
  } catch (error) {
    console.error('Failed to fetch image via proxy:', error);
    throw error;
  }
};

// Helper to load image from blob URL
const createImageFromBlob = (blobUrl) =>
  new Promise((resolve, reject) => {
    const image = new Image();
    image.addEventListener('load', () => {
      resolve(image);
    });
    image.addEventListener('error', (error) => reject(error));
    image.src = blobUrl;
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

// Draw a premium "quote strip" below the mockup so each export doubles as a mini quote sheet.
const drawQuoteStrip = (ctx, o) => {
  const { x, y, w, h, customerName, product, sku, logoSizeMm, price } = o;
  const S = w / 1600; // scale fonts relative to the reference image width

  // Background band + emerald accent rule
  ctx.fillStyle = '#0f172a';
  ctx.fillRect(x, y, w, h);
  ctx.fillStyle = '#22c55e';
  ctx.fillRect(x, y, w, Math.max(4, Math.round(h * 0.035)));

  const padX = Math.round(w * 0.05);

  // Left: customer / product / brand
  ctx.textAlign = 'left';
  ctx.textBaseline = 'alphabetic';
  const title = customerName && customerName.trim() ? customerName.trim() : 'White-Label Bottle Preview';
  ctx.fillStyle = '#ffffff';
  ctx.font = `600 ${Math.round(52 * S)}px Inter, Arial, sans-serif`;
  ctx.fillText(title, x + padX, y + Math.round(h * 0.42));
  ctx.fillStyle = 'rgba(255,255,255,0.55)';
  ctx.font = `400 ${Math.round(30 * S)}px Inter, Arial, sans-serif`;
  ctx.fillText(product, x + padX, y + Math.round(h * 0.42) + Math.round(44 * S));
  ctx.fillStyle = 'rgba(255,255,255,0.4)';
  ctx.font = `500 ${Math.round(24 * S)}px Inter, Arial, sans-serif`;
  ctx.fillText('Nyla Air & Water', x + padX, y + h - Math.round(h * 0.12));

  // Right: SKU / logo size / print price (label + value on one right-aligned line each)
  const rightX = x + w - padX;
  const rows = [
    ['SKU', sku],
    ['Logo size', `${logoSizeMm} × ${logoSizeMm} mm`],
    ['Print price', `₹${Number(price).toFixed(2)} / bottle`],
  ];
  const rowH = Math.round(h * 0.2);
  const baseY = y + Math.round(h * 0.4);
  ctx.textAlign = 'left';
  rows.forEach((row, i) => {
    const ry = baseY + i * rowH;
    ctx.font = `600 ${Math.round(34 * S)}px Inter, Arial, sans-serif`;
    const valW = ctx.measureText(row[1]).width;
    ctx.fillStyle = i === 2 ? '#4ade80' : '#ffffff';
    ctx.fillText(row[1], rightX - valW, ry);
    ctx.font = `400 ${Math.round(26 * S)}px Inter, Arial, sans-serif`;
    const labW = ctx.measureText(row[0]).width;
    ctx.fillStyle = 'rgba(255,255,255,0.5)';
    ctx.fillText(row[0], rightX - valW - Math.round(28 * S) - labW, ry);
  });
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
  
  // Bottle template state
  const [selectedBottle, setSelectedBottle] = useState(BOTTLE_TEMPLATES[0].id);

  // Cropping state
  const [showCropper, setShowCropper] = useState(false);
  const [crop, setCrop] = useState({ x: 0, y: 0 });
  const [zoom, setZoom] = useState(1);
  const [croppedAreaPixels, setCroppedAreaPixels] = useState(null);
  const [cropShape, setCropShape] = useState('rect'); // 'rect', 'round', or 'rounded-rect'

  // Logo style state
  const [logoShape, setLogoShape] = useState('original'); // 'original', 'circle', 'square', 'rounded-square'
  const [logoSizeMm, setLogoSizeMm] = useState(DEFAULT_LOGO_MM); // fixed logo size in mm (35/40/45/50)
  const [showGuides, setShowGuides] = useState(true); // center crosshair guide lines
  const [sizeWarning, setSizeWarning] = useState(null); // {mm, price} when upsizing above 35mm

  // Logo position state (for dragging)
  const [logoPosition, setLogoPosition] = useState(LOGO_ANCHORS.bottle1); // % over bottle image (front-label center)
  const [isDragging, setIsDragging] = useState(false);
  const bottleContainerRef = useRef(null);
  const imageBoxRef = useRef(null); // tight wrapper around the bottle image (coord basis for overlays)
  
  // Background removal state
  const [isColorPickerMode, setIsColorPickerMode] = useState(false);
  const [selectedBgColor, setSelectedBgColor] = useState(null);
  const [bgRemovalTolerance, setBgRemovalTolerance] = useState(30);
  const logoImageRef = useRef(null);

  // Lead selection (autocomplete) state
  const [leadQuery, setLeadQuery] = useState('');
  const [leadResults, setLeadResults] = useState([]);
  const [leadSearching, setLeadSearching] = useState(false);
  const [showLeadDropdown, setShowLeadDropdown] = useState(false);
  const [selectedLead, setSelectedLead] = useState(null);
  const [loadingLeadLogo, setLoadingLeadLogo] = useState(false);
  const leadSearchTimer = useRef(null);

  // Approved bottle-design gallery state
  const [leadDesigns, setLeadDesigns] = useState([]);
  const [loadingDesigns, setLoadingDesigns] = useState(false);
  const [approving, setApproving] = useState(false);
  const [showApproveDialog, setShowApproveDialog] = useState(false);

  const onCropComplete = useCallback((croppedArea, croppedAreaPixels) => {
    setCroppedAreaPixels(croppedAreaPixels);
  }, []);

  const handleFileSelect = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // Some browsers (especially Safari with HEIC/HEIF/AVIF) leave file.type empty.
    // Fall back to filename extension so we don't reject valid uploads here.
    const allowedExt = ['png','jpg','jpeg','svg','webp','gif','bmp','tif','tiff','heic','heif','avif','ico'];
    const ext = (file.name?.split('.').pop() || '').toLowerCase();
    const looksLikeImage = (file.type || '').startsWith('image/') || allowedExt.includes(ext);
    if (!looksLikeImage) {
      toast.error('Please upload an image file (PNG, JPG, SVG, WebP, GIF, BMP, TIFF, HEIC, or AVIF)');
      return;
    }

    if (file.size > 15 * 1024 * 1024) {
      toast.error('File size must be less than 15MB');
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
      setLogoSizeMm(DEFAULT_LOGO_MM);
      setLogoPosition(anchorFor(selectedBottle));
      toast.success('Logo uploaded! You can now edit it.');
    } catch (error) {
      // Surface backend message (e.g. "Couldn't read this image…") instead of the generic toast
      const msg = error?.response?.data?.detail || 'Failed to upload logo';
      toast.error(msg);
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
    setLogoSizeMm(DEFAULT_LOGO_MM);
    setLogoPosition(anchorFor(selectedBottle));
    setShowCropper(false);
    setIsColorPickerMode(false);
    setSelectedBgColor(null);
    setBgRemovalTolerance(30);
    setSelectedLead(null);
    setLeadQuery('');
    setLeadResults([]);
    setShowLeadDropdown(false);
    setLeadDesigns([]);
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  // ---- Lead autocomplete + auto-load lead logo ----
  const searchLeads = async (q) => {
    if (!q || q.trim().length < 2) {
      setLeadResults([]);
      return;
    }
    setLeadSearching(true);
    try {
      const token = localStorage.getItem('token');
      const res = await axios.get(`${API_URL}/leads`, {
        params: { search: q, page_size: 8, page: 1 },
        headers: { Authorization: `Bearer ${token}` }
      });
      setLeadResults(res.data?.data || []);
      setShowLeadDropdown(true);
    } catch (error) {
      setLeadResults([]);
    } finally {
      setLeadSearching(false);
    }
  };

  const handleLeadQueryChange = (e) => {
    const v = e.target.value;
    setLeadQuery(v);
    setShowLeadDropdown(true);
    if (leadSearchTimer.current) clearTimeout(leadSearchTimer.current);
    leadSearchTimer.current = setTimeout(() => searchLeads(v), 300);
  };

  const handleClearLead = () => {
    setSelectedLead(null);
    setLeadQuery('');
    setLeadResults([]);
    setShowLeadDropdown(false);
    setLeadDesigns([]);
  };

  const handleSelectLead = async (lead) => {
    setSelectedLead(lead);
    setLeadQuery(lead.company || '');
    setShowLeadDropdown(false);
    setLeadResults([]);
    setCustomerName(lead.company || '');
    fetchLeadDesigns(lead.id);

    setLoadingLeadLogo(true);
    try {
      const token = localStorage.getItem('token');
      const res = await axios.get(`${API_URL}/bottle-preview/lead-logo/${lead.id}`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      if (res.data?.has_logo && res.data?.logo_data) {
        setLogoPreview(res.data.logo_data);
        setOriginalLogo(res.data.logo_data);
        setLogoFile({ name: `${lead.company || 'Lead'} logo` });
        setLogoShape('original');
        setLogoSizeMm(DEFAULT_LOGO_MM);
        setLogoPosition(anchorFor(selectedBottle));
        setSelectedBgColor(null);
        toast.success(`Loaded ${lead.company}'s logo`);
      } else {
        toast.info('No logo on file for this lead — upload one below');
      }
    } catch (error) {
      toast.error('Failed to load lead logo');
    } finally {
      setLoadingLeadLogo(false);
    }
  };

  const handleResetEdits = () => {
    if (originalLogo) {
      setLogoPreview(originalLogo);
      setLogoShape('original');
      setLogoSizeMm(DEFAULT_LOGO_MM);
      setLogoPosition(anchorFor(selectedBottle));
      setSelectedBgColor(null);
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
    if (!isDragging || !imageBoxRef.current) return;
    
    const container = imageBoxRef.current;
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
    if (!isDragging || !imageBoxRef.current) return;
    
    const touch = e.touches[0];
    const container = imageBoxRef.current;
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
    setLogoPosition(anchorFor(selectedBottle));
    toast.success('Logo position reset to center');
  };

  // Snap the logo so its center sits exactly on the bottle's center guides
  const handleSnapToGuides = () => {
    setLogoPosition(centerFor(selectedBottle));
    toast.success('Logo snapped to the bottle center guides');
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
      let shapeType = 'rectangle';
      if (cropShape === 'round') shapeType = 'circle';
      else if (cropShape === 'rounded-rect') shapeType = 'rounded-square';
      
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
      } else if (shape === 'rounded-square') {
        // Create rounded square version
        const image = await createImage(originalLogo);
        const canvas = document.createElement('canvas');
        const ctx = canvas.getContext('2d');
        const size = Math.min(image.width, image.height);
        const radius = size * 0.2; // 20% corner radius
        
        canvas.width = size;
        canvas.height = size;

        // Draw rounded rectangle path
        ctx.beginPath();
        ctx.moveTo(radius, 0);
        ctx.lineTo(size - radius, 0);
        ctx.quadraticCurveTo(size, 0, size, radius);
        ctx.lineTo(size, size - radius);
        ctx.quadraticCurveTo(size, size, size - radius, size);
        ctx.lineTo(radius, size);
        ctx.quadraticCurveTo(0, size, 0, size - radius);
        ctx.lineTo(0, radius);
        ctx.quadraticCurveTo(0, 0, radius, 0);
        ctx.closePath();
        ctx.clip();

        const offsetX = (image.width - size) / 2;
        const offsetY = (image.height - size) / 2;
        ctx.drawImage(image, offsetX, offsetY, size, size, 0, 0, size, size);

        setLogoPreview(canvas.toDataURL('image/png'));
      } else {
        setLogoPreview(originalLogo);
      }
      setLogoShape(shape);
      toast.success(`Shape changed to ${shape.replace('-', ' ')}`);
    } catch (error) {
      toast.error('Failed to change shape');
    } finally {
      setProcessing(false);
    }
  };

  const handleRemoveWhiteBackground = async () => {
    if (!logoPreview) return;

    setProcessing(true);
    try {
      const processedImage = await removeWhiteBackground(logoPreview, 230);
      setLogoPreview(processedImage);
      toast.success('White background removed!');
    } catch (error) {
      toast.error('Failed to remove background');
    } finally {
      setProcessing(false);
    }
  };

  // Color picker mode handlers
  const enableColorPickerMode = () => {
    setIsColorPickerMode(true);
    toast.info('Click on the logo to select a background color to remove');
  };

  const handleLogoClick = async (e) => {
    if (!isColorPickerMode || !logoPreview) return;
    
    const rect = e.currentTarget.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    
    try {
      const color = await getPixelColor(logoPreview, x, y, rect.width, rect.height);
      setSelectedBgColor(color);
      setIsColorPickerMode(false);
      toast.success(`Color selected: RGB(${color.r}, ${color.g}, ${color.b})`);
    } catch (error) {
      toast.error('Failed to pick color');
      setIsColorPickerMode(false);
    }
  };

  const handleApplyColorRemoval = async () => {
    if (!logoPreview || !selectedBgColor) return;

    setProcessing(true);
    try {
      const processedImage = await removeColorBackground(logoPreview, selectedBgColor, bgRemovalTolerance);
      setLogoPreview(processedImage);
      toast.success('Background color removed!');
    } catch (error) {
      toast.error('Failed to remove background color');
    } finally {
      setProcessing(false);
    }
  };

  const handleSizeSelect = (mm) => {
    setLogoSizeMm(mm);
    if (mm > DEFAULT_LOGO_MM) {
      setSizeWarning({ mm, price: LOGO_SIZE_PRICES[mm] });
    }
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

  // Build the composite PNG (bottle + placed logo, optionally with the quote strip).
  // Measures the actual rendered logo/bottle rects so the export matches the preview.
  const buildCompositeDataUrl = async (withStrip = true) => {
    const currentBottle = BOTTLE_TEMPLATES.find(b => b.id === selectedBottle);

    const container = bottleContainerRef.current;
    const logoEl = container.querySelector('[data-testid="preview-logo-img"]');
    const bottleEl = container.querySelector('[data-testid="bottle-image"]');
    const logoRect = logoEl.getBoundingClientRect();
    const bottleRect = bottleEl.getBoundingClientRect();

    const widthRatio = logoRect.width / bottleRect.width;
    const heightRatio = logoRect.height / bottleRect.height;
    const logoCenterX = (logoRect.left + logoRect.width / 2) - bottleRect.left;
    const logoCenterY = (logoRect.top + logoRect.height / 2) - bottleRect.top;
    const posXRatio = logoCenterX / bottleRect.width;
    const posYRatio = logoCenterY / bottleRect.height;

    let bottleBlobUrl = null;
    try {
      bottleBlobUrl = await fetchImageAsBlob(currentBottle.image);
      const bottleImage = await createImageFromBlob(bottleBlobUrl);
      const logoImage = await createImage(logoPreview);

      const canvas = document.createElement('canvas');
      const ctx = canvas.getContext('2d');
      const stripH = withStrip ? Math.round(bottleImage.width * 0.155) : 0;
      canvas.width = bottleImage.width;
      canvas.height = bottleImage.height + stripH;

      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.drawImage(bottleImage, 0, 0);

      const finalLogoWidth = widthRatio * bottleImage.width;
      const finalLogoHeight = heightRatio * bottleImage.height;
      const logoX = posXRatio * bottleImage.width - (finalLogoWidth / 2);
      const logoY = posYRatio * bottleImage.height - (finalLogoHeight / 2);
      ctx.drawImage(logoImage, logoX, logoY, finalLogoWidth, finalLogoHeight);

      if (withStrip) {
        drawQuoteStrip(ctx, {
          x: 0,
          y: bottleImage.height,
          w: bottleImage.width,
          h: stripH,
          customerName,
          product: currentBottle.name,
          sku: '24 Brand · Clear Glass',
          logoSizeMm,
          price: LOGO_SIZE_PRICES[logoSizeMm],
        });
      }

      return canvas.toDataURL('image/png');
    } finally {
      if (bottleBlobUrl) URL.revokeObjectURL(bottleBlobUrl);
    }
  };

  // Download composite image (bottle + logo + quote strip)
  const handleDownloadComposite = async () => {
    if (!logoPreview) {
      toast.error('Please upload a logo first');
      return;
    }
    setProcessing(true);
    try {
      const currentBottle = BOTTLE_TEMPLATES.find(b => b.id === selectedBottle);
      const dataUrl = await buildCompositeDataUrl(true);
      const link = document.createElement('a');
      const bottleName = currentBottle.name.replace(/\s+/g, '-').toLowerCase();
      link.download = `${bottleName}-${customerName || 'custom'}-preview.png`;
      link.href = dataUrl;
      link.click();
      toast.success(`${currentBottle.name} preview downloaded!`);
    } catch (error) {
      console.error('Download error:', error);
      toast.error('Failed to download preview');
    } finally {
      setProcessing(false);
    }
  };

  // ---- Approve & save the composed design to the selected lead ----
  const fetchLeadDesigns = async (leadId) => {
    if (!leadId) return;
    setLoadingDesigns(true);
    try {
      const token = localStorage.getItem('token');
      const res = await axios.get(`${API_URL}/leads/${leadId}/bottle-designs`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      setLeadDesigns(res.data?.designs || []);
    } catch (error) {
      setLeadDesigns([]);
    } finally {
      setLoadingDesigns(false);
    }
  };

  const handleApproveClick = () => {
    if (!selectedLead) {
      toast.error('Select a lead first (search at the top of the page)');
      return;
    }
    if (!logoPreview) {
      toast.error('Upload or load a logo before approving');
      return;
    }
    if (leadDesigns.length > 0) {
      setShowApproveDialog(true);
    } else {
      doApproveSave(null);
    }
  };

  const doApproveSave = async (replaceDesignId) => {
    if (!selectedLead || !logoPreview) return;
    setApproving(true);
    try {
      const currentBottle = BOTTLE_TEMPLATES.find(b => b.id === selectedBottle);
      const imageData = await buildCompositeDataUrl(true);
      const cleanData = await buildCompositeDataUrl(false);
      const token = localStorage.getItem('token');
      const res = await axios.post(
        `${API_URL}/leads/${selectedLead.id}/bottle-designs`,
        {
          image_data: imageData,
          clean_data: cleanData,
          customer_name: customerName || selectedLead.company,
          bottle_template: selectedBottle,
          bottle_template_name: currentBottle.name,
          logo_size_mm: logoSizeMm,
          price: LOGO_SIZE_PRICES[logoSizeMm],
          replace_design_id: replaceDesignId || null,
        },
        { headers: { Authorization: `Bearer ${token}` } }
      );
      toast.success(res.data?.message === 'Design replaced'
        ? `Design replaced for ${selectedLead.company}`
        : `Design approved & saved to ${selectedLead.company}`);
      setShowApproveDialog(false);
      await fetchLeadDesigns(selectedLead.id);
    } catch (error) {
      toast.error(error?.response?.data?.detail || 'Failed to save design');
    } finally {
      setApproving(false);
    }
  };

  const handleDeleteDesign = async (designId) => {
    if (!selectedLead) return;
    try {
      const token = localStorage.getItem('token');
      await axios.delete(`${API_URL}/leads/${selectedLead.id}/bottle-designs/${designId}`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      toast.success('Design deleted');
      await fetchLeadDesigns(selectedLead.id);
    } catch (error) {
      toast.error('Failed to delete design');
    }
  };

  const anchor = anchorFor(selectedBottle);
  const bottleCenter = centerFor(selectedBottle);

  return (
    <div className="max-w-7xl mx-auto space-y-6 pb-8">
      <div className="text-center">
        <div className="flex items-center justify-center gap-2 mb-2">
          <Sparkles className="h-8 w-8 text-primary" />
          <h1 className="text-4xl font-light text-foreground">White-Label Bottle Preview</h1>
        </div>
        <p className="text-foreground-muted">24 Brand SKU - Clear Glass Bottle with Custom Label</p>
      </div>

      {/* Lead selector — search a lead to auto-load its logo & customer name */}
      <Card className="p-5 bg-card border border-border rounded-2xl" data-testid="lead-selector-card">
        <div className="flex flex-col md:flex-row md:items-center gap-4">
          <div className="flex items-center gap-3 shrink-0">
            <div className="h-10 w-10 rounded-xl bg-primary/10 flex items-center justify-center">
              <Briefcase className="h-5 w-5 text-primary" />
            </div>
            <div>
              <h2 className="text-base font-semibold leading-tight">Working on Lead</h2>
              <p className="text-xs text-muted-foreground">Search a lead to auto-load its logo &amp; name</p>
            </div>
          </div>

          <div className="relative flex-1">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
              <Input
                value={leadQuery}
                onChange={handleLeadQueryChange}
                onFocus={() => { if (leadResults.length) setShowLeadDropdown(true); }}
                onBlur={() => setTimeout(() => setShowLeadDropdown(false), 200)}
                placeholder="Search lead by company name…"
                className="h-11 rounded-xl pl-9 pr-9"
                data-testid="lead-search-input"
              />
              {(leadSearching || loadingLeadLogo) && (
                <Loader2 className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 animate-spin text-muted-foreground" />
              )}
              {!leadSearching && !loadingLeadLogo && (leadQuery || selectedLead) && (
                <button
                  type="button"
                  onClick={handleClearLead}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                  data-testid="lead-clear-btn"
                >
                  <X className="h-4 w-4" />
                </button>
              )}
            </div>

            {showLeadDropdown && leadResults.length > 0 && (
              <div className="absolute z-30 mt-1 w-full bg-popover border border-border rounded-xl shadow-lg overflow-hidden max-h-72 overflow-y-auto" data-testid="lead-results-dropdown">
                {leadResults.map((lead) => (
                  <button
                    key={lead.id}
                    type="button"
                    onMouseDown={(e) => e.preventDefault()}
                    onClick={() => handleSelectLead(lead)}
                    className="w-full text-left px-4 py-2.5 hover:bg-secondary/70 transition-colors flex items-center justify-between gap-3"
                    data-testid={`lead-result-${lead.id}`}
                  >
                    <div className="min-w-0">
                      <p className="text-sm font-medium truncate">{lead.company}</p>
                      <p className="text-xs text-muted-foreground truncate">
                        {[lead.lead_id, lead.city].filter(Boolean).join(' · ') || 'Lead'}
                      </p>
                    </div>
                    {lead.logo_url ? (
                      <span className="text-[10px] font-medium px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300 shrink-0">Logo on file</span>
                    ) : (
                      <span className="text-[10px] font-medium px-2 py-0.5 rounded-full bg-secondary text-muted-foreground shrink-0">No logo</span>
                    )}
                  </button>
                ))}
              </div>
            )}

            {showLeadDropdown && !leadSearching && leadQuery.trim().length >= 2 && leadResults.length === 0 && (
              <div className="absolute z-30 mt-1 w-full bg-popover border border-border rounded-xl shadow-lg px-4 py-3 text-sm text-muted-foreground" data-testid="lead-no-results">
                No leads match “{leadQuery}”
              </div>
            )}
          </div>

          {selectedLead && (
            <div className="text-xs text-muted-foreground shrink-0" data-testid="selected-lead-label">
              Selected: <span className="font-medium text-foreground">{selectedLead.company}</span>
            </div>
          )}
        </div>
      </Card>

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
                <Button
                  variant={cropShape === 'rounded-rect' ? 'default' : 'outline'}
                  onClick={() => setCropShape('rounded-rect')}
                  className="flex-1"
                  data-testid="crop-shape-rounded-btn"
                >
                  <RectangleHorizontal className="h-4 w-4 mr-2" /> Rounded
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

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        <div className="space-y-6 lg:col-span-4 lg:order-2">
          {/* Logo Size — first, so reps can change size without scrolling */}
          {logoPreview && (
            <Card className="p-6 bg-card border border-border rounded-2xl">
              <h2 className="text-lg font-semibold mb-4">Logo Size on Bottle</h2>
              <div className="grid grid-cols-4 gap-2" data-testid="logo-size-options">
                {LOGO_SIZE_OPTIONS.map((mm) => (
                  <Button
                    key={mm}
                    type="button"
                    variant={logoSizeMm === mm ? 'default' : 'outline'}
                    onClick={() => handleSizeSelect(mm)}
                    className="h-auto py-2 rounded-lg text-sm font-medium flex flex-col items-center justify-center leading-tight gap-0.5"
                    data-testid={`logo-size-${mm}`}
                  >
                    <span>{mm}×{mm} mm</span>
                    <span className={`text-[11px] font-semibold ${logoSizeMm === mm ? 'text-white/90' : 'text-emerald-600 dark:text-emerald-400'}`}>₹{LOGO_SIZE_PRICES[mm].toFixed(2)}</span>
                  </Button>
                ))}
              </div>
              <p className="text-xs text-muted-foreground mt-1.5">Price shown is the logo printing cost per bottle.</p>
            </Card>
          )}

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
                  accept="image/*,.heic,.heif,.avif"
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
                  <div className="grid grid-cols-2 gap-2">
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
                    <Button
                      onClick={() => handleShapeChange('rounded-square')}
                      variant={logoShape === 'rounded-square' ? 'default' : 'outline'}
                      className="h-12 rounded-xl"
                      disabled={processing}
                      data-testid="shape-rounded-square-btn"
                    >
                      <RectangleHorizontal className="h-4 w-4 mr-1" /> Rounded
                    </Button>
                  </div>
                </div>

                {/* Background Removal */}
                <div>
                  <Label className="text-sm text-muted-foreground mb-2 block">Background Removal</Label>
                  <div className="space-y-3">
                    {/* Quick white background removal */}
                    <Button
                      onClick={handleRemoveWhiteBackground}
                      variant="outline"
                      className="w-full h-12 rounded-xl"
                      disabled={processing}
                      data-testid="remove-white-bg-btn"
                    >
                      {processing ? (
                        <Loader2 className="h-5 w-5 mr-2 animate-spin" />
                      ) : (
                        <Eraser className="h-5 w-5 mr-2" />
                      )}
                      Remove White Background
                    </Button>
                    
                    {/* Color picker background removal */}
                    <div className="bg-secondary/50 rounded-xl p-3 space-y-3">
                      <p className="text-xs text-muted-foreground text-center font-medium">
                        Or pick a specific color to remove
                      </p>
                      
                      <Button
                        onClick={enableColorPickerMode}
                        variant={isColorPickerMode ? 'default' : 'outline'}
                        className="w-full h-10 rounded-lg text-sm"
                        disabled={processing}
                        data-testid="color-picker-btn"
                      >
                        <Pipette className="h-4 w-4 mr-2" />
                        {isColorPickerMode ? 'Click on logo to pick color...' : 'Pick Color from Logo'}
                      </Button>
                      
                      {selectedBgColor && (
                        <div className="space-y-2">
                          <div className="flex items-center gap-2">
                            <div 
                              className="w-8 h-8 rounded-lg border border-border shadow-inner"
                              style={{ backgroundColor: `rgb(${selectedBgColor.r}, ${selectedBgColor.g}, ${selectedBgColor.b})` }}
                              data-testid="selected-color-preview"
                            />
                            <span className="text-xs text-muted-foreground">
                              RGB({selectedBgColor.r}, {selectedBgColor.g}, {selectedBgColor.b})
                            </span>
                          </div>
                          
                          <div className="space-y-1">
                            <Label className="text-xs text-muted-foreground">
                              Tolerance: {bgRemovalTolerance}
                            </Label>
                            <Slider
                              value={[bgRemovalTolerance]}
                              min={10}
                              max={100}
                              step={5}
                              onValueChange={(value) => setBgRemovalTolerance(value[0])}
                              className="py-1"
                              data-testid="tolerance-slider"
                            />
                            <p className="text-xs text-muted-foreground">
                              Higher = removes more similar colors
                            </p>
                          </div>
                          
                          <Button
                            onClick={handleApplyColorRemoval}
                            className="w-full h-10 rounded-lg text-sm"
                            disabled={processing}
                            data-testid="apply-color-removal-btn"
                          >
                            {processing ? (
                              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                            ) : (
                              <Check className="h-4 w-4 mr-2" />
                            )}
                            Apply Color Removal
                          </Button>
                        </div>
                      )}
                    </div>
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
                      onClick={handleSnapToGuides}
                      variant="default"
                      size="sm"
                      className="w-full h-9 rounded-lg text-xs"
                      data-testid="snap-to-guides-btn"
                    >
                      <Crosshair className="h-3 w-3 mr-1" />
                      Snap to Center Guides
                    </Button>
                    <Button
                      onClick={handleResetPosition}
                      variant="outline"
                      size="sm"
                      className="w-full h-9 rounded-lg text-xs"
                      disabled={logoPosition.x === 50 && logoPosition.y === 50}
                      data-testid="reset-position-btn"
                    >
                      <RotateCw className="h-3 w-3 mr-1" />
                      Reset to Label Position
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
            <Button
              onClick={handleReset}
              variant="outline"
              className="w-full h-14 rounded-full text-base"
              disabled={!logoPreview}
              data-testid="reset-all-btn"
            >
              <RotateCcw className="h-5 w-5 mr-2" />
              Reset All
            </Button>
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
        <div className="space-y-6 lg:col-span-8 lg:order-1">
          <Card className="p-6 bg-card border border-border rounded-2xl overflow-hidden">
            <div className="flex justify-between items-center mb-4">
              <h2 className="text-lg font-semibold">Live Preview</h2>
              {logoPreview && !isColorPickerMode && (
                <div className="flex items-center gap-2 text-xs text-muted-foreground">
                  <Move className="h-4 w-4" />
                  <span>Drag logo to reposition</span>
                </div>
              )}
              {isColorPickerMode && (
                <div className="flex items-center gap-2 text-xs text-primary animate-pulse">
                  <Pipette className="h-4 w-4" />
                  <span>Click on logo to pick color</span>
                </div>
              )}
            </div>
            
            {/* Bottle Tabs */}
            <Tabs value={selectedBottle} onValueChange={(v) => { setSelectedBottle(v); setLogoPosition(anchorFor(v)); }} className="mb-4">
              <TabsList className="grid w-full grid-cols-2 bg-secondary/50 rounded-xl p-1">
                {BOTTLE_TEMPLATES.map((bottle) => (
                  <TabsTrigger 
                    key={bottle.id} 
                    value={bottle.id}
                    className="group h-auto py-2 rounded-lg transition-colors data-[state=active]:bg-primary data-[state=active]:text-primary-foreground data-[state=active]:shadow-md"
                    data-testid={`bottle-tab-${bottle.id}`}
                  >
                    <div className="text-center">
                      <span className="font-medium text-sm">{bottle.name}</span>
                      <span className="block text-xs text-muted-foreground group-data-[state=active]:text-primary-foreground/80">{bottle.description}</span>
                    </div>
                  </TabsTrigger>
                ))}
              </TabsList>
            </Tabs>
            
            <div className="flex justify-end mb-2">
              <Button
                type="button"
                variant={showGuides ? 'default' : 'outline'}
                size="sm"
                onClick={() => setShowGuides((v) => !v)}
                className="rounded-full h-8 text-xs gap-1.5"
                data-testid="toggle-center-guides"
              >
                <Crosshair className="h-3.5 w-3.5" />
                Center guides {showGuides ? 'on' : 'off'}
              </Button>
            </div>
            
            <div 
              ref={bottleContainerRef}
              className={`relative rounded-xl min-h-[600px] lg:min-h-[760px] flex items-center justify-center select-none ${logoPreview && !isColorPickerMode ? 'cursor-move' : ''}`}
              style={{
                background: 'linear-gradient(180deg, #f8f9fa 0%, #e9ecef 50%, #dee2e6 100%)'
              }}
              onMouseMove={handleMouseMove}
              onMouseUp={handleMouseUp}
              onMouseLeave={handleMouseUp}
              onTouchMove={handleTouchMove}
              onTouchEnd={handleTouchEnd}
              data-testid="bottle-preview-area"
            >
              <div ref={imageBoxRef} className="relative inline-block max-h-[560px] lg:max-h-[720px]">
              {/* Bottle Image */}
              <img
                src={BOTTLE_TEMPLATES.find(b => b.id === selectedBottle)?.image}
                alt={BOTTLE_TEMPLATES.find(b => b.id === selectedBottle)?.name}
                className="max-h-[560px] lg:max-h-[720px] w-auto object-contain pointer-events-none rounded-lg block"
                data-testid="bottle-image"
              />

              {/* Center guide lines (crosshair) on the front-label bottle — visual aid, not in download */}
              {showGuides && (
                <div className="absolute inset-0 pointer-events-none z-10" data-testid="center-guides">
                  <div className="absolute top-0 bottom-0 border-l border-dashed border-violet-400/70" style={{ left: `${bottleCenter.x}%` }} />
                  <div className="absolute left-0 right-0 border-t border-dashed border-violet-400/70" style={{ top: `${bottleCenter.y}%` }} />
                  <div className="absolute h-2 w-2 rounded-full bg-violet-500/80 ring-2 ring-white/70" style={{ left: `${bottleCenter.x}%`, top: `${bottleCenter.y}%`, transform: 'translate(-50%, -50%)' }} />
                </div>
              )}
              
              {/* Logo Overlay - Only show if logo is uploaded */}
              {logoPreview && (
                <div
                  className={`absolute flex items-center justify-center transition-all duration-75 ${isDragging ? 'z-10' : ''} ${isColorPickerMode ? 'cursor-crosshair' : 'cursor-grab active:cursor-grabbing'}`}
                  style={{
                    left: `${logoPosition.x}%`,
                    top: `${logoPosition.y}%`,
                    transform: 'translate(-50%, -50%)',
                    width: `${logoBoxWidthPct(logoSizeMm, selectedBottle)}%`,
                    aspectRatio: '1 / 1'
                  }}
                  onMouseDown={isColorPickerMode ? undefined : handleMouseDown}
                  onTouchStart={isColorPickerMode ? undefined : handleTouchStart}
                  onClick={isColorPickerMode ? handleLogoClick : undefined}
                  data-testid="draggable-logo-container"
                >
                  <img
                    ref={logoImageRef}
                    src={logoPreview}
                    alt="Customer Logo"
                    className={`object-contain ${isColorPickerMode ? '' : 'pointer-events-none'}`}
                    style={{ 
                      filter: `drop-shadow(0 2px 8px rgba(0,0,0,${isDragging ? '0.4' : '0.25'}))`,
                      maxWidth: '100%',
                      maxHeight: '100%',
                      width: 'auto',
                      height: 'auto',
                      cursor: isColorPickerMode ? 'crosshair' : 'inherit'
                    }}
                    data-testid="preview-logo-img"
                  />
                  {isDragging && (
                    <div className="absolute -bottom-6 left-1/2 -translate-x-1/2 bg-black/70 text-white text-xs px-2 py-1 rounded whitespace-nowrap">
                      Release to place
                    </div>
                  )}
                  {isColorPickerMode && (
                    <div className="absolute -bottom-6 left-1/2 -translate-x-1/2 bg-primary text-white text-xs px-2 py-1 rounded whitespace-nowrap animate-pulse">
                      Click to select color
                    </div>
                  )}
                </div>
              )}
              
              {/* Placeholder when no logo */}
              {!logoPreview && (
                <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                  <div className="text-center bg-black/20 backdrop-blur-sm rounded-2xl p-6">
                    <div className="h-16 w-16 mx-auto mb-3 rounded-full bg-white/30 backdrop-blur flex items-center justify-center">
                      <Sparkles className="h-8 w-8 text-white" />
                    </div>
                    <p className="text-white text-sm font-medium">Upload logo to see preview</p>
                  </div>
                </div>
              )}
              </div>
            </div>

            {logoPreview && customerName && (
              <div className="mt-6 text-center bg-primary/5 rounded-xl p-4">
                <p className="text-sm text-muted-foreground">White-Label Preview for</p>
                <p className="text-xl font-semibold text-foreground">{customerName}</p>
                <p className="text-sm text-primary mt-1">
                  {BOTTLE_TEMPLATES.find(b => b.id === selectedBottle)?.name} • Air Water
                </p>
              </div>
            )}

            {logoPreview && (
              <div className="mt-4 flex flex-wrap gap-2 justify-center">
                {logoShape !== 'original' && (
                  <span className="px-3 py-1 bg-primary/10 text-primary text-xs rounded-full">
                    Shape: {logoShape.replace('-', ' ')}
                  </span>
                )}
                <span className="px-3 py-1 bg-primary/10 text-primary text-xs rounded-full">
                  Size: {logoSizeMm}×{logoSizeMm} mm
                </span>
                {(Math.round(logoPosition.x) !== anchor.x || Math.round(logoPosition.y) !== anchor.y) && (
                  <span className="px-3 py-1 bg-primary/10 text-primary text-xs rounded-full">
                    Position: {Math.round(logoPosition.x)}%, {Math.round(logoPosition.y)}%
                  </span>
                )}
                {selectedBgColor && (
                  <span className="px-3 py-1 bg-primary/10 text-primary text-xs rounded-full flex items-center gap-1">
                    <span 
                      className="w-3 h-3 rounded-full border border-white/50"
                      style={{ backgroundColor: `rgb(${selectedBgColor.r}, ${selectedBgColor.g}, ${selectedBgColor.b})` }}
                    />
                    BG Color Selected
                  </span>
                )}
              </div>
            )}
            
            {/* Approve + Download Buttons - Below Bottle Preview */}
            <div className="mt-6 space-y-3">
              <Button
                onClick={handleApproveClick}
                className="w-full h-14 rounded-full text-base bg-emerald-600 hover:bg-emerald-700 text-white"
                disabled={!logoPreview || approving}
                data-testid="approve-design-btn"
              >
                {approving ? (
                  <><Loader2 className="h-5 w-5 mr-2 animate-spin" /> Saving to lead…</>
                ) : (
                  <><CheckCircle2 className="h-5 w-5 mr-2" /> Approve &amp; Save to {selectedLead ? selectedLead.company : 'Lead'}</>
                )}
              </Button>
              {!selectedLead && (
                <p className="text-xs text-amber-600 dark:text-amber-400 text-center" data-testid="approve-no-lead-hint">
                  Select a lead at the top to approve &amp; save this design.
                </p>
              )}

              <Button
                onClick={handleDownloadComposite}
                variant="outline"
                className="w-full h-12 rounded-full text-base"
                disabled={!logoPreview || processing}
                data-testid="download-composite-btn"
              >
                {processing ? (
                  <><Loader2 className="h-5 w-5 mr-2 animate-spin" /> Creating Preview...</>
                ) : (
                  <>
                    <Download className="h-5 w-5 mr-2" />
                    Download {BOTTLE_TEMPLATES.find(b => b.id === selectedBottle)?.name} Preview
                  </>
                )}
              </Button>
              <p className="text-xs text-muted-foreground text-center">
                Approve saves the mockup to the lead's designs. Download saves a copy to your device.
              </p>
            </div>
          </Card>
        </div>
      </div>

      {selectedLead && (
        <Card className="p-6 bg-card border border-border rounded-2xl" data-testid="lead-designs-gallery">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <Images className="h-5 w-5 text-primary" />
              <h3 className="text-base font-semibold">Saved designs for {selectedLead.company}</h3>
              <span className="text-xs text-muted-foreground">({leadDesigns.length})</span>
            </div>
            {loadingDesigns && <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />}
          </div>

          {leadDesigns.length === 0 ? (
            <p className="text-sm text-muted-foreground">No approved designs yet. Configure a logo and click “Approve &amp; Save”.</p>
          ) : (
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4" data-testid="lead-designs-grid">
              {leadDesigns.map((d) => (
                <div key={d.id} className="group relative border border-border rounded-xl overflow-hidden bg-secondary/30" data-testid={`lead-design-${d.id}`}>
                  <a href={d.image_url} target="_blank" rel="noreferrer" className="block aspect-[4/5] bg-white">
                    <img src={d.image_url} alt="Saved design" className="w-full h-full object-contain" />
                  </a>
                  <div className="p-2.5 space-y-1">
                    <p className="text-xs font-medium truncate">{d.bottle_template_name || 'Design'} · {d.logo_size_mm}mm</p>
                    <p className="text-[11px] text-muted-foreground truncate">
                      {d.created_at ? new Date(d.created_at).toLocaleDateString() : ''}{d.created_by ? ` · ${d.created_by}` : ''}
                    </p>
                    <div className="flex items-center gap-2 pt-1">
                      <a href={d.image_url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-[11px] text-primary hover:underline" data-testid={`view-design-${d.id}`}>
                        <ExternalLink className="h-3 w-3" /> View
                      </a>
                      <button type="button" onClick={() => handleDeleteDesign(d.id)} className="inline-flex items-center gap-1 text-[11px] text-rose-600 hover:underline ml-auto" data-testid={`delete-design-${d.id}`}>
                        <Trash2 className="h-3 w-3" /> Delete
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </Card>
      )}

      <Card className="p-6 bg-accent/10 border border-accent/20 rounded-2xl">
        <div className="text-center">
          <h3 className="text-sm font-semibold mb-3 text-foreground">Perfect for Customer Presentations</h3>
          <p className="text-sm text-foreground-muted max-w-3xl mx-auto">
            Show customers exactly how their brand will look on Air Water's premium bottles. 
            Use the editing tools to crop, reshape, remove backgrounds, and resize logos for the perfect fit.
            Ideal for live demos, corporate gifting discussions, and closing white-label deals.
          </p>
        </div>
      </Card>

      {/* Approve: choose add-new vs replace an existing design */}
      <Dialog open={showApproveDialog} onOpenChange={(o) => { if (!o) setShowApproveDialog(false); }}>
        <DialogContent className="max-w-2xl" data-testid="approve-dialog">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <CheckCircle2 className="h-5 w-5 text-emerald-600" /> Save design to {selectedLead?.company}
            </DialogTitle>
            <DialogDescription>
              This lead already has {leadDesigns.length} saved design{leadDesigns.length === 1 ? '' : 's'}. Add this as a new design, or replace one of the existing designs below.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <Button
              onClick={() => doApproveSave(null)}
              disabled={approving}
              className="w-full h-12 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white"
              data-testid="approve-add-new-btn"
            >
              {approving ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Plus className="h-4 w-4 mr-2" />}
              Add as a new design
            </Button>

            <div>
              <p className="text-xs text-muted-foreground mb-2">Or replace an existing design:</p>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 max-h-72 overflow-y-auto">
                {leadDesigns.map((d) => (
                  <button
                    key={d.id}
                    type="button"
                    onClick={() => doApproveSave(d.id)}
                    disabled={approving}
                    className="group border border-border rounded-xl overflow-hidden text-left hover:border-rose-400 transition-colors disabled:opacity-60"
                    data-testid={`approve-replace-${d.id}`}
                  >
                    <div className="aspect-[4/5] bg-white">
                      <img src={d.image_url} alt="Existing design" className="w-full h-full object-contain" />
                    </div>
                    <div className="px-2 py-1.5 flex items-center justify-between">
                      <span className="text-[11px] truncate">{d.logo_size_mm}mm</span>
                      <span className="text-[11px] text-rose-600 font-medium inline-flex items-center gap-1"><RotateCw className="h-3 w-3" />Replace</span>
                    </div>
                  </button>
                ))}
              </div>
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setShowApproveDialog(false)} disabled={approving} data-testid="approve-cancel-btn">Cancel</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Soft warning when upsizing above the default 35×35 mm */}
      <Dialog open={!!sizeWarning} onOpenChange={(o) => { if (!o) setSizeWarning(null); }}>
        <DialogContent className="max-w-md" data-testid="size-warning-dialog">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-amber-700 dark:text-amber-400">
              <AlertTriangle className="h-5 w-5" /> Larger logo — higher print cost
            </DialogTitle>
            <DialogDescription asChild>
              <div className="space-y-2 text-sm pt-1">
                <p>
                  You selected a <strong>{sizeWarning?.mm}×{sizeWarning?.mm} mm</strong> logo, which prints at{' '}
                  <strong className="text-emerald-600 dark:text-emerald-400">₹{sizeWarning?.price?.toFixed(2)}</strong> per bottle
                  {' '}— higher than <strong>₹{LOGO_SIZE_PRICES[DEFAULT_LOGO_MM].toFixed(2)}</strong> for the default 35×35 mm.
                </p>
                <p className="text-muted-foreground">
                  Please propose the price to the customer accordingly so the higher printing cost is covered.
                </p>
              </div>
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => { handleSizeSelect(DEFAULT_LOGO_MM); setSizeWarning(null); }} data-testid="size-warning-revert">
              Keep 35×35 mm
            </Button>
            <Button onClick={() => setSizeWarning(null)} data-testid="size-warning-ok">
              Got it, proceed
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
