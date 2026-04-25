import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Card } from '../components/ui/card';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Label } from '../components/ui/label';
import { Slider } from '../components/ui/slider';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '../components/ui/select';
import { Plus, Trash2, Download, Upload, Image as ImageIcon, RefreshCw, Tag as TagIcon } from 'lucide-react';
import { toast } from 'sonner';
import AppBreadcrumb from '../components/AppBreadcrumb';

// Template asset (placed at /app/frontend/public/neck-tag/template.png)
const TEMPLATE_URL = '/neck-tag/template.png';

// On-screen design dimensions (kept consistent with template aspect 220:668 ≈ 1:3.04).
// We render the design at 400 x 1216 viewBox; for high-res print we scale up.
const VIEW_W = 400;
const VIEW_H = 1216;

// Print export config — 80mm x 240mm @ 600 DPI (= 1890 x 5670).
// Practical default: scale to 4x viewBox for a crisp ~2400px tall PNG.
const PRINT_SCALE = 4;

const PRESETS = [
  { name: 'Classic White', stops: [{ offset: 0, color: '#FFFFFF' }, { offset: 1, color: '#F1F5F9' }] },
  { name: 'Sunset', stops: [{ offset: 0, color: '#FF7E5F' }, { offset: 1, color: '#FEB47B' }] },
  { name: 'Ocean', stops: [{ offset: 0, color: '#0EA5E9' }, { offset: 0.5, color: '#22D3EE' }, { offset: 1, color: '#A7F3D0' }] },
  { name: 'Royal', stops: [{ offset: 0, color: '#1E1B4B' }, { offset: 1, color: '#7C3AED' }] },
  { name: 'Forest', stops: [{ offset: 0, color: '#064E3B' }, { offset: 1, color: '#34D399' }] },
  { name: 'Gold Leaf', stops: [{ offset: 0, color: '#F5E6B3' }, { offset: 1, color: '#C9A650' }] },
];

export default function NeckTagDesigner() {
  // Gradient config
  const [gradientType, setGradientType] = useState('linear'); // 'linear' | 'radial'
  const [angle, setAngle] = useState(180);
  const [stops, setStops] = useState([
    { offset: 0, color: '#FFFFFF' },
    { offset: 1, color: '#F1F5F9' },
  ]);

  // Logo
  const [logoDataUrl, setLogoDataUrl] = useState(null);
  const [logoScale, setLogoScale] = useState(60); // % of body width
  const [logoOffsetY, setLogoOffsetY] = useState(48); // % from top

  // Template overlay
  const [showTemplate, setShowTemplate] = useState(true);
  const [templateOpacity, setTemplateOpacity] = useState(100);

  // Refs
  const fileInputRef = useRef(null);

  // Load image bitmap for canvas export
  const [templateImg, setTemplateImg] = useState(null);
  const [logoImg, setLogoImg] = useState(null);

  useEffect(() => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => setTemplateImg(img);
    img.src = TEMPLATE_URL;
  }, []);

  useEffect(() => {
    if (!logoDataUrl) {
      setLogoImg(null);
      return;
    }
    const img = new Image();
    img.onload = () => setLogoImg(img);
    img.src = logoDataUrl;
  }, [logoDataUrl]);

  const applyPreset = (preset) => {
    setStops(preset.stops.map((s) => ({ ...s })));
  };

  const updateStop = (idx, patch) => {
    setStops((prev) => prev.map((s, i) => (i === idx ? { ...s, ...patch } : s)));
  };

  const addStop = () => {
    if (stops.length >= 4) return;
    const sorted = [...stops].sort((a, b) => a.offset - b.offset);
    const lastTwo = sorted.slice(-2);
    const newOffset = lastTwo.length === 2 ? (lastTwo[0].offset + lastTwo[1].offset) / 2 : 0.5;
    setStops([...stops, { offset: newOffset, color: '#888888' }]);
  };

  const removeStop = (idx) => {
    if (stops.length <= 2) return;
    setStops((prev) => prev.filter((_, i) => i !== idx));
  };

  const handleLogoUpload = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!/^image\/(png|jpe?g|svg\+xml|webp)$/.test(file.type)) {
      toast.error('Please upload a PNG, JPG, SVG, or WebP image');
      return;
    }
    const reader = new FileReader();
    reader.onload = () => setLogoDataUrl(reader.result);
    reader.readAsDataURL(file);
  };

  // Sorted stops for SVG/Canvas
  const sortedStops = useMemo(
    () => [...stops].sort((a, b) => a.offset - b.offset),
    [stops]
  );

  // Compute linear gradient endpoints from angle (CSS-style, 0 = top → bottom going up)
  const linearEndpoints = useMemo(() => {
    const a = ((angle - 90) * Math.PI) / 180; // SVG's 0deg points right; we treat 180=top→bottom
    const cx = 0.5;
    const cy = 0.5;
    const r = 0.5;
    return {
      x1: cx - r * Math.cos(a),
      y1: cy - r * Math.sin(a),
      x2: cx + r * Math.cos(a),
      y2: cy + r * Math.sin(a),
    };
  }, [angle]);

  // Tag SVG path: rounded rectangle with top circular cut-out (matching template aspect)
  // viewBox 0 0 400 1216
  const tagPath = useMemo(() => {
    // Body: rounded rect 0,80 to 400,1216 (top 80px reserved for hang area)
    // Top circular cut-out at (cx=200, cy=180, r=110)
    return [
      'M 30 0',
      'L 370 0',
      'A 30 30 0 0 1 400 30',
      'L 400 1186',
      'A 30 30 0 0 1 370 1216',
      'L 30 1216',
      'A 30 30 0 0 1 0 1186',
      'L 0 30',
      'A 30 30 0 0 1 30 0',
      'Z',
    ].join(' ');
  }, []);

  // Hole position
  const HOLE = { cx: VIEW_W / 2, cy: 220, r: 130 };

  // Logo placement
  const logoPlacement = useMemo(() => {
    const w = (VIEW_W * logoScale) / 100;
    const y = (VIEW_H * logoOffsetY) / 100;
    return { w, y };
  }, [logoScale, logoOffsetY]);

  // Download as PNG (high resolution)
  const handleDownloadPng = async () => {
    try {
      const W = VIEW_W * PRINT_SCALE;
      const H = VIEW_H * PRINT_SCALE;
      const canvas = document.createElement('canvas');
      canvas.width = W;
      canvas.height = H;
      const ctx = canvas.getContext('2d');
      if (!ctx) return;

      // 1. Build clip path (tag shape + hole cutout)
      ctx.save();
      ctx.beginPath();
      // Outer rounded rect
      const r = 30 * PRINT_SCALE;
      ctx.moveTo(r, 0);
      ctx.lineTo(W - r, 0);
      ctx.quadraticCurveTo(W, 0, W, r);
      ctx.lineTo(W, H - r);
      ctx.quadraticCurveTo(W, H, W - r, H);
      ctx.lineTo(r, H);
      ctx.quadraticCurveTo(0, H, 0, H - r);
      ctx.lineTo(0, r);
      ctx.quadraticCurveTo(0, 0, r, 0);
      ctx.closePath();
      ctx.clip();

      // 2. Fill gradient
      let grad;
      if (gradientType === 'linear') {
        grad = ctx.createLinearGradient(
          linearEndpoints.x1 * W,
          linearEndpoints.y1 * H,
          linearEndpoints.x2 * W,
          linearEndpoints.y2 * H
        );
      } else {
        grad = ctx.createRadialGradient(W / 2, H / 2, 0, W / 2, H / 2, Math.max(W, H) / 2);
      }
      sortedStops.forEach((s) => grad.addColorStop(s.offset, s.color));
      ctx.fillStyle = grad;
      ctx.fillRect(0, 0, W, H);

      // 3. Template overlay (multiply blend so white→transparent visually)
      if (showTemplate && templateImg) {
        ctx.save();
        ctx.globalAlpha = templateOpacity / 100;
        ctx.globalCompositeOperation = 'multiply';
        ctx.drawImage(templateImg, 0, 0, W, H);
        ctx.restore();
      }

      // 4. Logo (centered)
      if (logoImg) {
        const lw = logoPlacement.w * PRINT_SCALE;
        const ratio = logoImg.height / logoImg.width;
        const lh = lw * ratio;
        const lx = (W - lw) / 2;
        const ly = logoPlacement.y * PRINT_SCALE - lh / 2;
        ctx.drawImage(logoImg, lx, ly, lw, lh);
      }

      // 5. Cut out the hole (destination-out)
      ctx.globalCompositeOperation = 'destination-out';
      ctx.beginPath();
      ctx.arc(HOLE.cx * PRINT_SCALE, HOLE.cy * PRINT_SCALE, HOLE.r * PRINT_SCALE, 0, Math.PI * 2);
      ctx.closePath();
      ctx.fill();
      ctx.restore();

      // Trigger download
      canvas.toBlob((blob) => {
        if (!blob) return;
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        const stamp = new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-');
        a.download = `neck-tag_${stamp}.png`;
        a.click();
        URL.revokeObjectURL(url);
        toast.success('Neck tag downloaded');
      }, 'image/png');
    } catch (err) {
      console.error(err);
      toast.error('Failed to render PNG');
    }
  };

  const resetDesign = () => {
    applyPreset(PRESETS[0]);
    setGradientType('linear');
    setAngle(180);
    setLogoDataUrl(null);
    setLogoScale(60);
    setLogoOffsetY(48);
    setShowTemplate(true);
    setTemplateOpacity(100);
  };

  return (
    <div className="p-4 sm:p-6 lg:p-8 space-y-6" data-testid="neck-tag-designer-page">
      <AppBreadcrumb />

      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-3">
          <div className="p-2 rounded-lg bg-primary/10">
            <TagIcon className="h-6 w-6 text-primary" />
          </div>
          <div>
            <h1 className="text-xl sm:text-2xl lg:text-3xl font-bold tracking-tight text-slate-800 dark:text-white">
              Neck Tag Designer
            </h1>
            <p className="text-xs sm:text-sm text-muted-foreground">
              Upload a logo, pick a gradient, download a print-ready neck tag.
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={resetDesign} data-testid="reset-design-btn">
            <RefreshCw className="h-4 w-4 mr-2" /> Reset
          </Button>
          <Button onClick={handleDownloadPng} data-testid="download-png-btn">
            <Download className="h-4 w-4 mr-2" /> Download PNG
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Controls */}
        <div className="lg:col-span-5 space-y-4">
          {/* Logo */}
          <Card className="p-4 space-y-3">
            <h2 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">Customer Logo</h2>
            <div className="flex items-center gap-3">
              <Button
                variant="outline"
                onClick={() => fileInputRef.current?.click()}
                data-testid="upload-logo-btn"
                className="gap-2"
              >
                <Upload className="h-4 w-4" /> {logoDataUrl ? 'Replace Logo' : 'Upload Logo'}
              </Button>
              <input
                ref={fileInputRef}
                type="file"
                accept="image/png,image/jpeg,image/svg+xml,image/webp"
                onChange={handleLogoUpload}
                className="hidden"
                data-testid="logo-file-input"
              />
              {logoDataUrl && (
                <Button variant="ghost" size="sm" onClick={() => setLogoDataUrl(null)} className="text-red-600">
                  <Trash2 className="h-4 w-4" />
                </Button>
              )}
              {!logoDataUrl && (
                <p className="text-xs text-muted-foreground italic">PNG / JPG / SVG / WebP</p>
              )}
            </div>
            {logoDataUrl && (
              <>
                <div className="space-y-1">
                  <div className="flex items-center justify-between">
                    <Label className="text-xs">Logo Size</Label>
                    <span className="text-xs text-muted-foreground tabular-nums">{logoScale}%</span>
                  </div>
                  <Slider value={[logoScale]} min={20} max={90} step={1} onValueChange={(v) => setLogoScale(v[0])} data-testid="logo-scale-slider" />
                </div>
                <div className="space-y-1">
                  <div className="flex items-center justify-between">
                    <Label className="text-xs">Vertical Position</Label>
                    <span className="text-xs text-muted-foreground tabular-nums">{logoOffsetY}%</span>
                  </div>
                  <Slider value={[logoOffsetY]} min={30} max={80} step={1} onValueChange={(v) => setLogoOffsetY(v[0])} data-testid="logo-offset-slider" />
                </div>
              </>
            )}
          </Card>

          {/* Gradient */}
          <Card className="p-4 space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">Background Gradient</h2>
              <Select value={gradientType} onValueChange={setGradientType}>
                <SelectTrigger className="w-32 h-8 text-xs" data-testid="gradient-type-select">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="linear">Linear</SelectItem>
                  <SelectItem value="radial">Radial</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {/* Presets */}
            <div className="flex items-center gap-2 flex-wrap">
              {PRESETS.map((p) => (
                <button
                  key={p.name}
                  type="button"
                  onClick={() => applyPreset(p)}
                  className="h-8 w-8 rounded-md border border-slate-300 hover:scale-110 transition-transform shadow-sm"
                  style={{
                    background: `linear-gradient(135deg, ${p.stops.map((s) => `${s.color} ${s.offset * 100}%`).join(', ')})`,
                  }}
                  title={p.name}
                  data-testid={`preset-${p.name.toLowerCase().replace(/\s+/g, '-')}`}
                />
              ))}
            </div>

            {/* Angle (linear only) */}
            {gradientType === 'linear' && (
              <div className="space-y-1">
                <div className="flex items-center justify-between">
                  <Label className="text-xs">Angle</Label>
                  <span className="text-xs text-muted-foreground tabular-nums">{angle}°</span>
                </div>
                <Slider value={[angle]} min={0} max={360} step={1} onValueChange={(v) => setAngle(v[0])} data-testid="angle-slider" />
              </div>
            )}

            {/* Stops */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label className="text-xs">Color Stops ({stops.length})</Label>
                <Button variant="ghost" size="sm" onClick={addStop} disabled={stops.length >= 4} className="h-7" data-testid="add-stop-btn">
                  <Plus className="h-3.5 w-3.5 mr-1" /> Add Stop
                </Button>
              </div>
              {stops.map((s, idx) => (
                <div key={idx} className="flex items-center gap-2" data-testid={`stop-row-${idx}`}>
                  <Input
                    type="color"
                    value={s.color}
                    onChange={(e) => updateStop(idx, { color: e.target.value })}
                    className="h-9 w-12 p-1"
                    data-testid={`stop-color-${idx}`}
                  />
                  <Input
                    type="text"
                    value={s.color.toUpperCase()}
                    onChange={(e) => updateStop(idx, { color: e.target.value })}
                    className="font-mono text-xs h-9 w-24"
                    data-testid={`stop-hex-${idx}`}
                  />
                  <Input
                    type="number"
                    min="0"
                    max="100"
                    value={Math.round(s.offset * 100)}
                    onChange={(e) => updateStop(idx, { offset: Math.min(1, Math.max(0, Number(e.target.value) / 100)) })}
                    className="h-9 w-20 text-xs"
                    data-testid={`stop-offset-${idx}`}
                  />
                  <span className="text-xs text-muted-foreground">%</span>
                  {stops.length > 2 && (
                    <Button variant="ghost" size="sm" onClick={() => removeStop(idx)} className="h-9 text-red-600 px-2">
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  )}
                </div>
              ))}
            </div>
          </Card>

          {/* Template Overlay */}
          <Card className="p-4 space-y-3">
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">Template Overlay</h2>
              <label className="flex items-center gap-2 text-xs cursor-pointer">
                <input
                  type="checkbox"
                  checked={showTemplate}
                  onChange={(e) => setShowTemplate(e.target.checked)}
                  data-testid="toggle-template"
                />
                <span>Show decorative artwork</span>
              </label>
            </div>
            {showTemplate && (
              <div className="space-y-1">
                <div className="flex items-center justify-between">
                  <Label className="text-xs">Overlay Opacity</Label>
                  <span className="text-xs text-muted-foreground tabular-nums">{templateOpacity}%</span>
                </div>
                <Slider value={[templateOpacity]} min={0} max={100} step={1} onValueChange={(v) => setTemplateOpacity(v[0])} data-testid="template-opacity-slider" />
                <p className="text-[11px] text-muted-foreground italic mt-2">
                  The brand artwork (gold lines, "air water", "Green Innovation") is preserved from your template; the white area becomes your gradient.
                </p>
              </div>
            )}
          </Card>
        </div>

        {/* Preview */}
        <div className="lg:col-span-7">
          <Card className="p-6 flex items-center justify-center bg-gradient-to-br from-slate-100 to-slate-200 dark:from-slate-900 dark:to-slate-800 min-h-[600px]">
            <div className="relative" style={{ width: 280, height: 280 * (VIEW_H / VIEW_W) / 1, maxHeight: '80vh' }} data-testid="neck-tag-preview">
              <svg viewBox={`0 0 ${VIEW_W} ${VIEW_H}`} className="w-full h-full" style={{ filter: 'drop-shadow(0 8px 24px rgba(0,0,0,0.18))' }}>
                <defs>
                  {gradientType === 'linear' ? (
                    <linearGradient id="bgGrad" x1={linearEndpoints.x1} y1={linearEndpoints.y1} x2={linearEndpoints.x2} y2={linearEndpoints.y2}>
                      {sortedStops.map((s, i) => (
                        <stop key={i} offset={s.offset} stopColor={s.color} />
                      ))}
                    </linearGradient>
                  ) : (
                    <radialGradient id="bgGrad" cx="0.5" cy="0.5" r="0.5">
                      {sortedStops.map((s, i) => (
                        <stop key={i} offset={s.offset} stopColor={s.color} />
                      ))}
                    </radialGradient>
                  )}
                  {/* Mask: tag body MINUS circular hole */}
                  <mask id="tagMask">
                    <path d={tagPath} fill="white" />
                    <circle cx={HOLE.cx} cy={HOLE.cy} r={HOLE.r} fill="black" />
                  </mask>
                </defs>

                <g mask="url(#tagMask)">
                  {/* Gradient background */}
                  <rect x="0" y="0" width={VIEW_W} height={VIEW_H} fill="url(#bgGrad)" />

                  {/* Template artwork (multiply blend turns white → transparent) */}
                  {showTemplate && (
                    <image
                      href={TEMPLATE_URL}
                      x="0"
                      y="0"
                      width={VIEW_W}
                      height={VIEW_H}
                      preserveAspectRatio="xMidYMid slice"
                      style={{ mixBlendMode: 'multiply', opacity: templateOpacity / 100 }}
                    />
                  )}

                  {/* Customer logo */}
                  {logoImg && (
                    <image
                      href={logoDataUrl}
                      x={(VIEW_W - logoPlacement.w) / 2}
                      y={logoPlacement.y - (logoPlacement.w * (logoImg.height / logoImg.width)) / 2}
                      width={logoPlacement.w}
                      preserveAspectRatio="xMidYMid meet"
                    />
                  )}
                </g>

                {/* Border (outside mask so it shows on top) */}
                <path d={tagPath} fill="none" stroke="rgba(0,0,0,0.12)" strokeWidth="1" />
              </svg>

              {!logoImg && (
                <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                  <div className="bg-white/80 dark:bg-slate-900/80 px-3 py-1.5 rounded-md text-xs text-muted-foreground border flex items-center gap-1.5">
                    <ImageIcon className="h-3.5 w-3.5" /> Upload a logo to preview
                  </div>
                </div>
              )}
            </div>
          </Card>
        </div>
      </div>
    </div>
  );
}
