import React, { useEffect, useRef, useState } from 'react';
import axios from 'axios';
import { toast } from 'sonner';
import { Card } from '../components/ui/card';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Label } from '../components/ui/label';
import { Textarea } from '../components/ui/textarea';
import { Switch } from '../components/ui/switch';
import { Separator } from '../components/ui/separator';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '../components/ui/select';
import {
  Loader2, Save, FileText, RotateCcw, Upload, Trash2, Plus, ChevronUp, ChevronDown, ImageIcon, X,
} from 'lucide-react';

const API_URL = process.env.REACT_APP_BACKEND_URL;
const HEAD = () => ({ Authorization: `Bearer ${localStorage.getItem('token')}` });

const FONTS = [
  { value: 'dejavu', label: 'DejaVu Sans (₹ support)' },
  { value: 'helvetica', label: 'Helvetica' },
  { value: 'times', label: 'Times' },
  { value: 'courier', label: 'Courier' },
];
const SIZES = [8, 9, 10, 11, 12, 13, 14, 16, 18, 19, 20, 22, 24, 28];
const SECTION_TYPES = [
  { value: 'paragraph', label: 'Paragraph' },
  { value: 'list', label: 'Bulleted list' },
  { value: 'category', label: 'Category placement' },
  { value: 'pricing_table', label: 'Pricing table (auto)' },
  { value: 'image', label: 'Image' },
];

const toText = (arr) => (Array.isArray(arr) ? arr.join('\n') : '');
const toList = (txt) => (txt || '').split('\n').map((s) => s.trim()).filter(Boolean);
const uid = () => `sec_${Math.random().toString(36).slice(2, 9)}`;

// ── Color picker field ─────────────────────────────────────────────────────
function ColorField({ label, value, onChange, testId }) {
  const v = value || '#000000';
  return (
    <div className="space-y-1.5">
      <Label className="text-sm">{label}</Label>
      <div className="flex items-center gap-2">
        <input type="color" value={v} onChange={(e) => onChange(e.target.value)}
          className="h-9 w-11 rounded-md border cursor-pointer p-0.5 bg-background" data-testid={`${testId}-swatch`} />
        <Input value={value || ''} onChange={(e) => onChange(e.target.value)}
          className="h-9 w-28 font-mono text-sm uppercase" data-testid={testId} />
      </div>
    </div>
  );
}

const HF_TYPES = [
  { value: 'none', label: 'None' },
  { value: 'logo', label: 'Logo' },
  { value: 'company_name', label: 'Company name' },
  { value: 'company_block', label: 'Company details (full)' },
  { value: 'address', label: 'Address' },
  { value: 'email', label: 'Email' },
  { value: 'website', label: 'Website' },
  { value: 'cin', label: 'CIN / Reg' },
  { value: 'phone', label: 'Phone' },
  { value: 'date', label: 'Date' },
  { value: 'page', label: 'Page number' },
  { value: 'custom', label: 'Custom text' },
];

// ── Number field (spacing) ─────────────────────────────────────────────────
function NumField({ label, value, onChange, step = 1, testId }) {
  return (
    <div className="space-y-1.5">
      <Label className="text-xs text-muted-foreground">{label}</Label>
      <Input type="number" step={step} className="h-9" data-testid={testId}
        value={value ?? ''} onChange={(e) => onChange(e.target.value === '' ? undefined : Number(e.target.value))} />
    </div>
  );
}

// ── Header / footer zone editor ────────────────────────────────────────────
function ZoneEditor({ which, name, zone, onType, onText }) {
  const z = zone || { type: 'none', text: '' };
  return (
    <div className="space-y-2 rounded-md border p-3">
      <Label className="text-sm font-medium capitalize">{name}</Label>
      <Select value={z.type || 'none'} onValueChange={onType}>
        <SelectTrigger className="h-9" data-testid={`${which}-${name}-type`}><SelectValue /></SelectTrigger>
        <SelectContent>
          {HF_TYPES.map((t) => <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>)}
        </SelectContent>
      </Select>
      {(z.type === 'page' || z.type === 'custom') && (
        <Input className="h-9 text-sm" data-testid={`${which}-${name}-text`}
          placeholder={z.type === 'page' ? 'Page {n} of {total}' : 'Custom text…'}
          value={z.text || ''} onChange={(e) => onText(e.target.value)} />
      )}
    </div>
  );
}

function HFCard({ which, label, cfg, onEnabled, onZone }) {
  const enabled = cfg.enabled !== false;
  return (
    <Card className="p-5 space-y-4" data-testid={`tpl-${which}-card`}>
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <h2 className="font-semibold text-lg">{label}</h2>
          <p className="text-sm text-muted-foreground">Pick what shows on the left, center &amp; right. In text use {'{n}'}, {'{total}'}, {'{company}'}, {'{date}'}.</p>
        </div>
        <div className="flex items-center gap-2">
          <Switch checked={enabled} onCheckedChange={onEnabled} data-testid={`${which}-enabled`} />
          <Label className="text-sm font-normal">Show {label.toLowerCase()}</Label>
        </div>
      </div>
      {enabled && (
        <div className="grid sm:grid-cols-3 gap-3">
          {['left', 'center', 'right'].map((zn) => (
            <ZoneEditor key={zn} which={which} name={zn} zone={cfg[zn]}
              onType={(v) => onZone(zn, { type: v })} onText={(v) => onZone(zn, { text: v })} />
          ))}
        </div>
      )}
    </Card>
  );
}

// ── Small reusable font + size picker ──────────────────────────────────────
function FontSize({ font, size, onFont, onSize, label }) {
  return (
    <div className="flex items-end gap-2">
      <div className="space-y-1.5 flex-1">
        <Label className="text-xs text-muted-foreground">{label} font</Label>
        <Select value={font || 'dejavu'} onValueChange={onFont}>
          <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
          <SelectContent>
            {FONTS.map((f) => <SelectItem key={f.value} value={f.value}>{f.label}</SelectItem>)}
          </SelectContent>
        </Select>
      </div>
      <div className="space-y-1.5 w-24">
        <Label className="text-xs text-muted-foreground">Size</Label>
        <Select value={String(size || 10)} onValueChange={(v) => onSize(Number(v))}>
          <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
          <SelectContent>
            {SIZES.map((s) => <SelectItem key={s} value={String(s)}>{s} pt</SelectItem>)}
          </SelectContent>
        </Select>
      </div>
    </div>
  );
}

export default function ProposalTemplateSettings() {
  const [tpl, setTpl] = useState(null);
  const [defaults, setDefaults] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [logoUploading, setLogoUploading] = useState(false);
  const logoInput = useRef(null);
  const imgInputs = useRef({});

  const load = async () => {
    setLoading(true);
    try {
      const res = await axios.get(`${API_URL}/api/proposals/template`, { headers: HEAD() });
      setTpl(res.data.template);
      setDefaults(res.data.defaults);
    } catch (e) {
      toast.error('Failed to load proposal template');
    } finally {
      setLoading(false);
    }
  };
  useEffect(() => { load(); }, []);

  const setCompany = (k, v) => setTpl((p) => ({ ...p, company: { ...(p.company || {}), [k]: v } }));
  const setTitle = (k, v) => setTpl((p) => ({ ...p, title: { ...(p.title || {}), [k]: v } }));
  const setColor = (k, v) => setTpl((p) => ({ ...p, colors: { ...(p.colors || {}), [k]: v } }));
  const setHFEnabled = (which, v) => setTpl((p) => ({ ...p, [which]: { ...(p[which] || {}), enabled: v } }));
  const setHFZone = (which, zone, patch) => setTpl((p) => ({
    ...p, [which]: { ...(p[which] || {}), [zone]: { ...((p[which] || {})[zone] || {}), ...patch } },
  }));

  const setSection = (idx, patch) =>
    setTpl((p) => {
      const sections = [...(p.sections || [])];
      sections[idx] = { ...sections[idx], ...patch };
      return { ...p, sections };
    });

  const moveSection = (idx, dir) =>
    setTpl((p) => {
      const sections = [...(p.sections || [])];
      const j = idx + dir;
      if (j < 0 || j >= sections.length) return p;
      [sections[idx], sections[j]] = [sections[j], sections[idx]];
      return { ...p, sections };
    });

  const removeSection = (idx) =>
    setTpl((p) => ({ ...p, sections: (p.sections || []).filter((_, i) => i !== idx) }));

  const addSection = () =>
    setTpl((p) => ({
      ...p,
      sections: [
        ...(p.sections || []),
        {
          id: uid(), type: 'paragraph', heading: 'New Section',
          heading_font: 'dejavu', heading_size: 13, body_font: 'dejavu', body_size: 10,
          page_break_before: false, space_before: 6, space_after: 8, line_spacing: 1.4, content: '',
        },
      ],
    }));

  const save = async () => {
    setSaving(true);
    try {
      const res = await axios.put(`${API_URL}/api/proposals/template`, { template: tpl }, { headers: HEAD() });
      setTpl(res.data.template);
      toast.success('Proposal template saved');
    } catch (e) {
      toast.error(e.response?.data?.detail || 'Failed to save template');
    } finally {
      setSaving(false);
    }
  };

  const resetDefaults = () => {
    if (defaults && window.confirm('Reset all fields to the built-in defaults? (You still need to Save.)')) {
      setTpl(JSON.parse(JSON.stringify(defaults)));
    }
  };

  const uploadLogo = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setLogoUploading(true);
    try {
      const fd = new FormData();
      fd.append('file', file);
      const res = await axios.post(`${API_URL}/api/proposals/template/logo`, fd, { headers: HEAD() });
      const dataUrl = res.data.logo_data_url || '';
      const b64 = dataUrl.split(',')[1] || null;
      setCompany('logo_data', b64);
      toast.success('Logo uploaded');
    } catch (err) {
      toast.error(err.response?.data?.detail || 'Logo upload failed');
    } finally {
      setLogoUploading(false);
      if (logoInput.current) logoInput.current.value = '';
    }
  };

  const removeLogo = async () => {
    try {
      await axios.delete(`${API_URL}/api/proposals/template/logo`, { headers: HEAD() });
      setCompany('logo_data', null);
      toast.success('Logo removed');
    } catch {
      toast.error('Could not remove logo');
    }
  };

  const readImageToBase64 = (file) =>
    new Promise((resolve, reject) => {
      const r = new FileReader();
      r.onload = () => resolve((r.result || '').toString().split(',')[1] || '');
      r.onerror = reject;
      r.readAsDataURL(file);
    });

  const uploadSectionImage = async (idx, e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 3 * 1024 * 1024) { toast.error('Image must be under 3 MB'); return; }
    try {
      const b64 = await readImageToBase64(file);
      setSection(idx, { image_data: b64 });
      toast.success('Image attached (remember to Save)');
    } catch {
      toast.error('Could not read image');
    }
  };

  if (loading || !tpl) {
    return <div className="flex items-center justify-center py-32"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div>;
  }

  const company = tpl.company || {};
  const title = tpl.title || {};
  const cols = tpl.colors || {};
  const header = tpl.header || {};
  const footer = tpl.footer || {};
  const sections = tpl.sections || [];
  const logoSrc = company.logo_data ? `data:${company.logo_content_type || 'image/png'};base64,${company.logo_data}` : null;

  return (
    <div className="space-y-6 p-3 sm:p-0 max-w-4xl" data-testid="proposal-template-settings">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl lg:text-3xl font-bold tracking-tight flex items-center gap-2">
            <FileText className="h-6 w-6 text-primary" /> Proposal Template
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Fully customizable. Add or remove sections, pick fonts &amp; sizes, and upload your logo. The customer name and pricing table fill in automatically per lead.
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={resetDefaults} data-testid="reset-defaults-btn"><RotateCcw className="h-4 w-4 mr-1.5" /> Reset to defaults</Button>
          <Button onClick={save} disabled={saving} data-testid="save-template-btn">
            {saving ? <Loader2 className="h-4 w-4 mr-1.5 animate-spin" /> : <Save className="h-4 w-4 mr-1.5" />} Save
          </Button>
        </div>
      </div>

      {/* Header / company + logo */}
      <Card className="p-5 space-y-4" data-testid="tpl-company-card">
        <h2 className="font-semibold text-lg">Header, Logo &amp; Company Details</h2>
        <div className="flex flex-col sm:flex-row gap-5">
          <div className="space-y-2">
            <Label>Company logo</Label>
            <div className="w-44 h-24 rounded-md border border-dashed flex items-center justify-center bg-muted/40 overflow-hidden" data-testid="logo-preview">
              {logoSrc
                ? <img src={logoSrc} alt="Logo" className="max-h-full max-w-full object-contain" />
                : <ImageIcon className="h-8 w-8 text-muted-foreground" />}
            </div>
            <input ref={logoInput} type="file" accept="image/png,image/jpeg,image/webp" className="hidden" onChange={uploadLogo} data-testid="logo-file-input" />
            <div className="flex gap-2">
              <Button size="sm" variant="outline" disabled={logoUploading} onClick={() => logoInput.current?.click()} data-testid="upload-logo-btn">
                {logoUploading ? <Loader2 className="h-4 w-4 mr-1.5 animate-spin" /> : <Upload className="h-4 w-4 mr-1.5" />} Upload
              </Button>
              {logoSrc && (
                <Button size="sm" variant="ghost" className="text-destructive" onClick={removeLogo} data-testid="remove-logo-btn">
                  <Trash2 className="h-4 w-4 mr-1.5" /> Remove
                </Button>
              )}
            </div>
            <p className="text-xs text-muted-foreground">PNG/JPG/WebP, under 2 MB.</p>
          </div>
          <div className="flex-1 space-y-3">
            <div className="space-y-2">
              <Label>Address lines (one per line)</Label>
              <Textarea rows={3} value={toText(company.address_lines)} onChange={(e) => setCompany('address_lines', toList(e.target.value))} data-testid="tpl-address" />
            </div>
            <div className="grid sm:grid-cols-3 gap-3">
              <div className="space-y-2"><Label>Email</Label><Input value={company.email || ''} onChange={(e) => setCompany('email', e.target.value)} data-testid="tpl-email" /></div>
              <div className="space-y-2"><Label>Website</Label><Input value={company.website || ''} onChange={(e) => setCompany('website', e.target.value)} data-testid="tpl-website" /></div>
              <div className="space-y-2"><Label>CIN / Reg</Label><Input value={company.cin || ''} onChange={(e) => setCompany('cin', e.target.value)} data-testid="tpl-cin" /></div>
            </div>
          </div>
        </div>
      </Card>

      {/* Title */}
      <Card className="p-5 space-y-4" data-testid="tpl-title-card">
        <h2 className="font-semibold text-lg">Title</h2>
        <div className="space-y-2">
          <Label>Title template <span className="text-xs text-muted-foreground">(use {'{company}'} for the customer name)</span></Label>
          <Input value={title.text_template || ''} onChange={(e) => setTitle('text_template', e.target.value)} data-testid="tpl-title" />
        </div>
        <FontSize label="Title" font={title.font} size={title.size}
          onFont={(v) => setTitle('font', v)} onSize={(v) => setTitle('size', v)} />
      </Card>

      {/* Colors */}
      <Card className="p-5 space-y-4" data-testid="tpl-colors-card">
        <div>
          <h2 className="font-semibold text-lg">Colors</h2>
          <p className="text-sm text-muted-foreground">Match these to your brand — they apply to the generated PDF.</p>
        </div>
        <div className="grid sm:grid-cols-3 gap-x-4 gap-y-3">
          <ColorField label="Accent / side bar" value={cols.accent} onChange={(v) => setColor('accent', v)} testId="color-accent" />
          <ColorField label="Section headers" value={cols.heading} onChange={(v) => setColor('heading', v)} testId="color-heading" />
          <ColorField label="Title text" value={cols.title} onChange={(v) => setColor('title', v)} testId="color-title" />
          <ColorField label="Body text" value={cols.body} onChange={(v) => setColor('body', v)} testId="color-body" />
          <ColorField label="Header & footer text" value={cols.header_text} onChange={(v) => setColor('header_text', v)} testId="color-header-text" />
          <ColorField label="Offer price" value={cols.offer} onChange={(v) => setColor('offer', v)} testId="color-offer" />
          <ColorField label="Table grid / borders" value={cols.border} onChange={(v) => setColor('border', v)} testId="color-border" />
          <ColorField label="Table header text" value={cols.table_header_text} onChange={(v) => setColor('table_header_text', v)} testId="color-table-header-text" />
          <ColorField label="Alternate row background" value={cols.row_alt} onChange={(v) => setColor('row_alt', v)} testId="color-row-alt" />
        </div>
      </Card>

      {/* Header & Footer */}
      <HFCard which="header" label="Header" cfg={header}
        onEnabled={(v) => setHFEnabled('header', v)} onZone={(zn, patch) => setHFZone('header', zn, patch)} />
      <HFCard which="footer" label="Footer" cfg={footer}
        onEnabled={(v) => setHFEnabled('footer', v)} onZone={(zn, patch) => setHFZone('footer', zn, patch)} />

      {/* Dynamic sections */}
      <div className="flex items-center justify-between">
        <h2 className="font-semibold text-lg">Sections</h2>
        <Button size="sm" variant="outline" onClick={addSection} data-testid="add-section-btn"><Plus className="h-4 w-4 mr-1.5" /> Add section</Button>
      </div>

      {sections.map((sec, idx) => (
        <Card key={sec.id || idx} className="p-5 space-y-4" data-testid={`section-card-${idx}`}>
          <div className="flex items-center justify-between gap-2 flex-wrap">
            <div className="flex items-center gap-2">
              <span className="text-xs font-medium text-muted-foreground bg-muted px-2 py-1 rounded">#{idx + 1}</span>
              <Select value={sec.type} onValueChange={(v) => setSection(idx, { type: v })}>
                <SelectTrigger className="h-9 w-48" data-testid={`section-type-${idx}`}><SelectValue /></SelectTrigger>
                <SelectContent>
                  {SECTION_TYPES.map((t) => <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="flex items-center gap-1">
              <Button size="icon" variant="ghost" className="h-8 w-8" disabled={idx === 0} onClick={() => moveSection(idx, -1)} data-testid={`section-up-${idx}`}><ChevronUp className="h-4 w-4" /></Button>
              <Button size="icon" variant="ghost" className="h-8 w-8" disabled={idx === sections.length - 1} onClick={() => moveSection(idx, 1)} data-testid={`section-down-${idx}`}><ChevronDown className="h-4 w-4" /></Button>
              <Button size="icon" variant="ghost" className="h-8 w-8 text-destructive" onClick={() => removeSection(idx)} data-testid={`section-remove-${idx}`}><Trash2 className="h-4 w-4" /></Button>
            </div>
          </div>

          <div className="space-y-2">
            <Label>Heading <span className="text-xs text-muted-foreground">(leave blank to hide)</span></Label>
            <Input value={sec.heading || ''} onChange={(e) => setSection(idx, { heading: e.target.value })} data-testid={`section-heading-${idx}`} />
          </div>
          <FontSize label="Heading" font={sec.heading_font} size={sec.heading_size}
            onFont={(v) => setSection(idx, { heading_font: v })} onSize={(v) => setSection(idx, { heading_size: v })} />

          <Separator />

          {/* Type-specific body */}
          {sec.type === 'paragraph' && (
            <div className="space-y-2">
              <Label>Paragraph text</Label>
              <Textarea rows={4} value={sec.content || ''} onChange={(e) => setSection(idx, { content: e.target.value })} data-testid={`section-content-${idx}`} />
            </div>
          )}

          {sec.type === 'list' && (
            <>
              <div className="space-y-2">
                <Label>Intro <span className="text-xs text-muted-foreground">(optional)</span></Label>
                <Textarea rows={2} value={sec.intro || ''} onChange={(e) => setSection(idx, { intro: e.target.value })} />
              </div>
              <div className="space-y-2">
                <Label>Items (one per line)</Label>
                <Textarea rows={5} value={toText(sec.items)} onChange={(e) => setSection(idx, { items: toList(e.target.value) })} data-testid={`section-items-${idx}`} />
              </div>
            </>
          )}

          {sec.type === 'category' && (
            <>
              <div className="space-y-2"><Label>Intro</Label><Input value={sec.intro || ''} onChange={(e) => setSection(idx, { intro: e.target.value })} /></div>
              <div className="grid sm:grid-cols-2 gap-3">
                <div className="space-y-2"><Label>Allowed (one per line)</Label><Textarea rows={4} value={toText(sec.allowed)} onChange={(e) => setSection(idx, { allowed: toList(e.target.value) })} /></div>
                <div className="space-y-2"><Label>Not allowed (one per line)</Label><Textarea rows={4} value={toText(sec.not_allowed)} onChange={(e) => setSection(idx, { not_allowed: toList(e.target.value) })} /></div>
              </div>
            </>
          )}

          {sec.type === 'pricing_table' && (
            <>
              <div className="space-y-2"><Label>Disclaimer</Label><Textarea rows={2} value={sec.disclaimer || ''} onChange={(e) => setSection(idx, { disclaimer: e.target.value })} data-testid={`section-disclaimer-${idx}`} /></div>
              <p className="text-xs text-muted-foreground">The table rows fill in automatically from each lead's Proposed SKUs &amp; pricing.</p>
            </>
          )}

          {sec.type === 'image' && (
            <div className="space-y-2">
              <Label>Image</Label>
              <div className="flex items-center gap-3">
                <div className="w-36 h-24 rounded-md border border-dashed flex items-center justify-center bg-muted/40 overflow-hidden">
                  {sec.image_data
                    ? <img src={`data:image/png;base64,${sec.image_data}`} alt="Section" className="max-h-full max-w-full object-contain" />
                    : <ImageIcon className="h-7 w-7 text-muted-foreground" />}
                </div>
                <input ref={(el) => (imgInputs.current[idx] = el)} type="file" accept="image/png,image/jpeg,image/webp" className="hidden" onChange={(e) => uploadSectionImage(idx, e)} data-testid={`section-image-input-${idx}`} />
                <div className="flex gap-2">
                  <Button size="sm" variant="outline" onClick={() => imgInputs.current[idx]?.click()} data-testid={`section-image-btn-${idx}`}><Upload className="h-4 w-4 mr-1.5" /> Upload</Button>
                  {sec.image_data && <Button size="sm" variant="ghost" className="text-destructive" onClick={() => setSection(idx, { image_data: null })}><X className="h-4 w-4 mr-1.5" /> Clear</Button>}
                </div>
              </div>
              <p className="text-xs text-muted-foreground">Leave empty to use the built-in product image.</p>
            </div>
          )}

          {sec.type !== 'image' && sec.type !== 'pricing_table' && (
            <FontSize label="Body" font={sec.body_font} size={sec.body_size}
              onFont={(v) => setSection(idx, { body_font: v })} onSize={(v) => setSection(idx, { body_size: v })} />
          )}

          <div className="grid grid-cols-3 gap-3 pt-1">
            <NumField label="Space before (pt)" value={sec.space_before} onChange={(v) => setSection(idx, { space_before: v })} testId={`section-space-before-${idx}`} />
            <NumField label="Space after (pt)" value={sec.space_after} onChange={(v) => setSection(idx, { space_after: v })} testId={`section-space-after-${idx}`} />
            <NumField label="Line spacing (×)" step={0.1} value={sec.line_spacing} onChange={(v) => setSection(idx, { line_spacing: v })} testId={`section-line-spacing-${idx}`} />
          </div>

          <div className="flex items-center gap-2 pt-1">
            <Switch checked={!!sec.page_break_before} onCheckedChange={(v) => setSection(idx, { page_break_before: v })} data-testid={`section-pagebreak-${idx}`} />
            <Label className="text-sm font-normal cursor-pointer">Start this section on a new page</Label>
          </div>
        </Card>
      ))}

      <Button variant="outline" className="w-full border-dashed" onClick={addSection} data-testid="add-section-btn-bottom"><Plus className="h-4 w-4 mr-1.5" /> Add section</Button>

      <div className="flex justify-end pb-10">
        <Button onClick={save} disabled={saving} data-testid="save-template-btn-bottom">
          {saving ? <Loader2 className="h-4 w-4 mr-1.5 animate-spin" /> : <Save className="h-4 w-4 mr-1.5" />} Save Template
        </Button>
      </div>
    </div>
  );
}
