import React, { useState, useRef } from 'react';
import { Card } from '../components/ui/card';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Label } from '../components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '../components/ui/select';
import { toast } from 'sonner';
import { Upload, Download, Share2, RotateCcw, Loader2, Sparkles } from 'lucide-react';
import axios from 'axios';

const API_URL = process.env.REACT_APP_BACKEND_URL + '/api';

const BOTTLE_SIZES = [
  { value: '24', label: '24 Brand' },
  { value: '330-silver', label: '330 ml Silver' },
  { value: '330-gold', label: '330 ml Gold' },
  { value: '330-sparkling', label: '330 ml Sparkling' },
  { value: '660-silver', label: '660 ml Silver' },
  { value: '660-gold', label: '660 ml Gold' },
  { value: '660-sparkling', label: '660 ml Sparkling' },
];

// Premium water bottle image (clean, elegant)
const BOTTLE_BASE_IMAGE = 'https://images.unsplash.com/photo-1602143407151-7111542de6e8?w=800&q=80';

export default function BottlePreview() {
  const [logoFile, setLogoFile] = useState(null);
  const [logoPreview, setLogoPreview] = useState('');
  const [bottleSize, setBottleSize] = useState('660-silver');
  const [customerName, setCustomerName] = useState('');
  const [uploading, setUploading] = useState(false);
  const [saving, setSaving] = useState(false);
  const fileInputRef = useRef(null);
  const previewCanvasRef = useRef(null);

  const handleFileSelect = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // Validate file type
    if (!file.type.startsWith('image/')) {
      toast.error('Please upload an image file (PNG, JPG, or SVG)');
      return;
    }

    // Validate file size (max 5MB)
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
      setLogoFile(file);
      toast.success('Logo uploaded successfully!');
    } catch (error) {
      toast.error('Failed to upload logo');
    } finally {
      setUploading(false);
    }
  };

  const handleReset = () => {
    setLogoFile(null);
    setLogoPreview('');
    setCustomerName('');
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  const handleDownload = () => {
    const canvas = previewCanvasRef.current;
    if (!canvas) return;

    const link = document.createElement('a');
    link.download = `nyla-bottle-${customerName || 'preview'}.png`;
    link.href = canvas.toDataURL('image/png');
    link.click();
    toast.success('Preview downloaded!');
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
          bottle_size: bottleSize,
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

  return (
    <div className="max-w-6xl mx-auto space-y-6 pb-8">
      {/* Header */}
      <div className="text-center">
        <div className="flex items-center justify-center gap-2 mb-2">
          <Sparkles className="h-8 w-8 text-primary" />
          <h1 className="text-4xl font-light text-foreground">White-Label Bottle Preview</h1>
        </div>
        <p className="text-foreground-muted">Create instant mockups with customer logos</p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Left: Controls */}
        <div className="space-y-6">
          {/* Upload Section */}
          <Card className="p-8 bg-card border border-border rounded-2xl">
            <h2 className="text-lg font-semibold mb-6">Upload Customer Logo</h2>
            
            <div className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="customer-name">Customer Name (Optional)</Label>
                <Input
                  id="customer-name"
                  placeholder="e.g., TechCorp India"
                  value={customerName}
                  onChange={(e) => setCustomerName(e.target.value)}
                  className="h-12 rounded-xl"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="bottle-size">Bottle Size</Label>
                <Select value={bottleSize} onValueChange={setBottleSize}>
                  <SelectTrigger className="h-12 rounded-xl">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {BOTTLE_SIZES.map(size => (
                      <SelectItem key={size.value} value={size.value}>{size.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label>Logo File (PNG, JPG, SVG)</Label>
                <div
                  onClick={() => fileInputRef.current?.click()}
                  className="border-2 border-dashed border-border rounded-xl p-8 text-center cursor-pointer hover:border-primary/50 hover:bg-secondary/50 transition-all"
                >
                  {uploading ? (
                    <Loader2 className="h-12 w-12 mx-auto text-primary animate-spin mb-3" />
                  ) : (
                    <Upload className="h-12 w-12 mx-auto text-muted-foreground mb-3" />
                  )}
                  <p className="text-sm font-medium text-foreground mb-1">
                    {logoFile ? logoFile.name : 'Click to upload logo'}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    PNG, JPG, or SVG (max 5MB)
                  </p>
                </div>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/png,image/jpeg,image/jpg,image/svg+xml"
                  onChange={handleFileSelect}
                  className="hidden"
                />
              </div>
            </div>
          </Card>

          {/* Actions */}
          <Card className="p-6 bg-card border border-border rounded-2xl">
            <div className="grid grid-cols-2 gap-3">
              <Button
                onClick={handleReset}
                variant="outline"
                className="h-12 rounded-full"
                disabled={!logoPreview}
              >
                <RotateCcw className="h-4 w-4 mr-2" />
                Reset
              </Button>
              <Button
                onClick={handleDownload}
                variant="outline"
                className="h-12 rounded-full"
                disabled={!logoPreview}
              >
                <Download className="h-4 w-4 mr-2" />
                Download
              </Button>
            </div>
            <Button
              onClick={handleSave}
              className="w-full h-12 rounded-full mt-3"
              disabled={!logoPreview || saving}
            >
              {saving ? (
                <><Loader2 className="h-4 w-4 mr-2 animate-spin" /> Saving...</>
              ) : (
                'Save to History'
              )}
            </Button>
          </Card>
        </div>

        {/* Right: Preview */}
        <div className="space-y-6">
          <Card className="p-8 bg-gradient-to-br from-background to-secondary border border-border rounded-2xl">
            <h2 className="text-lg font-semibold mb-6">Bottle Preview</h2>
            
            <div className="relative bg-white rounded-2xl p-8 min-h-[500px] flex items-center justify-center">
              {!logoPreview ? (
                <div className="text-center">
                  <div className="h-24 w-24 mx-auto mb-4 rounded-full bg-muted flex items-center justify-center">
                    <Sparkles className="h-12 w-12 text-muted-foreground" />
                  </div>
                  <p className="text-foreground-muted">Upload a logo to see preview</p>
                </div>
              ) : (
                <div className="relative w-full max-w-md mx-auto">
                  {/* Bottle Base Image */}
                  <img
                    src={BOTTLE_BASE_IMAGE}
                    alt="Nyla Bottle"
                    className="w-full h-auto"
                  />
                  
                  {/* Customer Logo Overlay */}
                  <div
                    className="absolute top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2"
                    style={{
                      width: '40%',
                      maxWidth: '200px',
                      transform: 'translate(-50%, -50%) perspective(800px) rotateY(0deg)',
                    }}
                  >
                    <img
                      src={logoPreview}
                      alt="Customer Logo"
                      className="w-full h-auto object-contain drop-shadow-lg"
                      style={{
                        filter: 'drop-shadow(0 2px 8px rgba(0,0,0,0.15))'
                      }}
                    />
                  </div>
                  
                  {/* Bottle Size Label */}
                  <div className="absolute bottom-4 left-1/2 transform -translate-x-1/2 bg-primary/90 text-primary-foreground px-4 py-2 rounded-full text-sm font-semibold">
                    {BOTTLE_SIZES.find(b => b.value === bottleSize)?.label || '660 ml Silver'}
                  </div>
                </div>
              )}
            </div>

            {logoPreview && customerName && (
              <div className="mt-4 text-center">
                <p className="text-sm text-muted-foreground">Preview for</p>
                <p className="text-lg font-semibold text-foreground">{customerName}</p>
              </div>
            )}
          </Card>

          {/* Hidden Canvas for Download */}
          <canvas ref={previewCanvasRef} className="hidden" width="800" height="1200" />
        </div>
      </div>

      {/* Instructions */}
      <Card className="p-6 bg-accent/10 border border-accent/20 rounded-2xl">
        <h3 className="text-sm font-semibold mb-3 text-foreground">Quick Guide</h3>
        <ul className="text-sm text-foreground-muted space-y-2">
          <li>1. Upload customer's logo (PNG/JPG/SVG format)</li>
          <li>2. Select bottle size from Nyla's SKU range</li>
          <li>3. Preview appears instantly - show to customer</li>
          <li>4. Download for email or save to history</li>
          <li>5. Reset to try different logos or bottle sizes</li>
        </ul>
      </Card>
    </div>
  );
}
