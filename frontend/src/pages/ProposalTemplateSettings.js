import React, { useEffect, useState } from 'react';
import axios from 'axios';
import { toast } from 'sonner';
import { Card } from '../components/ui/card';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Label } from '../components/ui/label';
import { Textarea } from '../components/ui/textarea';
import { Loader2, Save, FileText, RotateCcw } from 'lucide-react';

const API_URL = process.env.REACT_APP_BACKEND_URL;
const HEAD = () => ({ Authorization: `Bearer ${localStorage.getItem('token')}` });

// list <-> multiline textarea helpers
const toText = (arr) => (Array.isArray(arr) ? arr.join('\n') : '');
const toList = (txt) => (txt || '').split('\n').map((s) => s.trim()).filter(Boolean);

export default function ProposalTemplateSettings() {
  const [tpl, setTpl] = useState(null);
  const [defaults, setDefaults] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

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

  const set = (k, v) => setTpl((p) => ({ ...p, [k]: v }));
  const setCompany = (k, v) => setTpl((p) => ({ ...p, company: { ...(p.company || {}), [k]: v } }));

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
      setTpl({ ...defaults });
    }
  };

  if (loading || !tpl) {
    return <div className="flex items-center justify-center py-32"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div>;
  }

  const company = tpl.company || {};

  return (
    <div className="space-y-6 p-3 sm:p-0 max-w-4xl" data-testid="proposal-template-settings">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl lg:text-3xl font-bold tracking-tight flex items-center gap-2">
            <FileText className="h-6 w-6 text-primary" /> Proposal Template
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Edit the reusable proposal content. The customer name and pricing table are filled automatically per lead.
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={resetDefaults} data-testid="reset-defaults-btn"><RotateCcw className="h-4 w-4 mr-1.5" /> Reset to defaults</Button>
          <Button onClick={save} disabled={saving} data-testid="save-template-btn">
            {saving ? <Loader2 className="h-4 w-4 mr-1.5 animate-spin" /> : <Save className="h-4 w-4 mr-1.5" />} Save
          </Button>
        </div>
      </div>

      {/* Header / company */}
      <Card className="p-5 space-y-4">
        <h2 className="font-semibold text-lg">Header & Company Details</h2>
        <div className="space-y-2">
          <Label>Address lines (one per line)</Label>
          <Textarea rows={3} value={toText(company.address_lines)} onChange={(e) => setCompany('address_lines', toList(e.target.value))} data-testid="tpl-address" />
        </div>
        <div className="grid sm:grid-cols-3 gap-3">
          <div className="space-y-2"><Label>Email</Label><Input value={company.email || ''} onChange={(e) => setCompany('email', e.target.value)} data-testid="tpl-email" /></div>
          <div className="space-y-2"><Label>Website</Label><Input value={company.website || ''} onChange={(e) => setCompany('website', e.target.value)} data-testid="tpl-website" /></div>
          <div className="space-y-2"><Label>CIN / Reg</Label><Input value={company.cin || ''} onChange={(e) => setCompany('cin', e.target.value)} data-testid="tpl-cin" /></div>
        </div>
      </Card>

      {/* Intro */}
      <Card className="p-5 space-y-4">
        <h2 className="font-semibold text-lg">Title & Introduction</h2>
        <div className="space-y-2">
          <Label>Title template <span className="text-xs text-muted-foreground">(use {'{company}'} for the customer name)</span></Label>
          <Input value={tpl.title_template || ''} onChange={(e) => set('title_template', e.target.value)} data-testid="tpl-title" />
        </div>
        <div className="space-y-2">
          <Label>Introduction paragraph</Label>
          <Textarea rows={4} value={tpl.intro_paragraph || ''} onChange={(e) => set('intro_paragraph', e.target.value)} data-testid="tpl-intro" />
        </div>
      </Card>

      {/* Pricing */}
      <Card className="p-5 space-y-4">
        <h2 className="font-semibold text-lg">Pricing Section</h2>
        <div className="space-y-2"><Label>Pricing heading</Label><Input value={tpl.pricing_heading || ''} onChange={(e) => set('pricing_heading', e.target.value)} data-testid="tpl-pricing-heading" /></div>
        <div className="space-y-2"><Label>Pricing disclaimer</Label><Textarea rows={2} value={tpl.pricing_disclaimer || ''} onChange={(e) => set('pricing_disclaimer', e.target.value)} data-testid="tpl-disclaimer" /></div>
        <p className="text-xs text-muted-foreground">The pricing table itself is generated from each lead's Proposed SKUs & pricing (Standard/MRP from the SKU catalog).</p>
      </Card>

      {/* List sections */}
      {[
        { hk: 'reverse_logistics_heading', lk: 'reverse_logistics_items', label: 'Reverse Logistics' },
        { hk: 'commercial_terms_heading', lk: 'commercial_terms_items', label: 'Commercial Terms' },
        { hk: 'listing_format_heading', lk: 'listing_format_items', label: 'Listing Format' },
        { hk: 'brand_onboarding_heading', lk: 'brand_onboarding_items', label: 'Brand Onboarding & Support', introKey: 'brand_onboarding_intro' },
      ].map((s) => (
        <Card key={s.lk} className="p-5 space-y-4">
          <h2 className="font-semibold text-lg">{s.label}</h2>
          <div className="space-y-2"><Label>Heading</Label><Input value={tpl[s.hk] || ''} onChange={(e) => set(s.hk, e.target.value)} data-testid={`tpl-${s.lk}-heading`} /></div>
          {s.introKey && (
            <div className="space-y-2"><Label>Intro</Label><Textarea rows={2} value={tpl[s.introKey] || ''} onChange={(e) => set(s.introKey, e.target.value)} /></div>
          )}
          <div className="space-y-2">
            <Label>Items (one per line)</Label>
            <Textarea rows={5} value={toText(tpl[s.lk])} onChange={(e) => set(s.lk, toList(e.target.value))} data-testid={`tpl-${s.lk}`} />
          </div>
        </Card>
      ))}

      {/* Category placement */}
      <Card className="p-5 space-y-4">
        <h2 className="font-semibold text-lg">Category Placement</h2>
        <div className="space-y-2"><Label>Heading</Label><Input value={tpl.category_placement_heading || ''} onChange={(e) => set('category_placement_heading', e.target.value)} /></div>
        <div className="space-y-2"><Label>Intro</Label><Input value={tpl.category_placement_intro || ''} onChange={(e) => set('category_placement_intro', e.target.value)} /></div>
        <div className="grid sm:grid-cols-2 gap-3">
          <div className="space-y-2"><Label>Allowed sections (one per line)</Label><Textarea rows={4} value={toText(tpl.category_placement_allowed)} onChange={(e) => set('category_placement_allowed', toList(e.target.value))} /></div>
          <div className="space-y-2"><Label>Not allowed under (one per line)</Label><Textarea rows={4} value={toText(tpl.category_placement_not_allowed)} onChange={(e) => set('category_placement_not_allowed', toList(e.target.value))} /></div>
        </div>
      </Card>

      <div className="flex justify-end pb-10">
        <Button onClick={save} disabled={saving} data-testid="save-template-btn-bottom">
          {saving ? <Loader2 className="h-4 w-4 mr-1.5 animate-spin" /> : <Save className="h-4 w-4 mr-1.5" />} Save Template
        </Button>
      </div>
    </div>
  );
}
