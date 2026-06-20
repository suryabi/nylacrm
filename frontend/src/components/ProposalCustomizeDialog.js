import React, { useEffect, useRef, useState, useCallback } from 'react';
import axios from 'axios';
import { toast } from 'sonner';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription,
} from './ui/dialog';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { Label } from './ui/label';
import { Textarea } from './ui/textarea';
import {
  Loader2, Sparkles, RotateCcw, Trash2, ChevronUp, ChevronDown, Plus, FileText, Save, RefreshCw,
} from 'lucide-react';

const API_URL = process.env.REACT_APP_BACKEND_URL + '/api';

const toText = (arr) => (Array.isArray(arr) ? arr.join('\n') : '');
const toList = (txt) => (txt || '').split('\n').map((s) => s.trim()).filter(Boolean);
const uid = () => `sec_${Math.random().toString(36).slice(2, 9)}`;
const deep = (o) => JSON.parse(JSON.stringify(o || {}));

const TYPE_LABEL = {
  paragraph: 'Paragraph', list: 'Bulleted list', category: 'Category placement',
  pricing_table: 'Pricing table (auto)', image: 'Image (from template)',
};

export default function ProposalCustomizeDialog({ leadId, open, onOpenChange, hasExistingProposal, onGenerated }) {
  const [loading, setLoading] = useState(true);
  const [titleText, setTitleText] = useState('');
  const [sections, setSections] = useState([]);
  const [companyName, setCompanyName] = useState('');
  const [previewUrl, setPreviewUrl] = useState(null);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [saving, setSaving] = useState(false);
  const templateRef = useRef(null);
  const urlRef = useRef(null);

  const seedFrom = (titleTpl, secs) => {
    setTitleText(titleTpl || '');
    setSections(deep(secs) || []);
  };

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await axios.get(`${API_URL}/leads/${leadId}/proposal/customization`, { withCredentials: true });
      templateRef.current = res.data.template;
      setCompanyName(res.data.company_name || '');
      const ov = res.data.override;
      const tpl = res.data.template;
      seedFrom(ov?.title?.text_template || tpl?.title?.text_template, ov?.sections || tpl?.sections);
    } catch (e) {
      toast.error('Failed to load proposal template');
    } finally {
      setLoading(false);
    }
  }, [leadId]);

  useEffect(() => { if (open) load(); }, [open, load]);

  // cleanup blob url
  useEffect(() => () => { if (urlRef.current) URL.revokeObjectURL(urlRef.current); }, []);

  const buildOverride = useCallback(
    () => ({ title: { text_template: titleText }, sections }),
    [titleText, sections]
  );

  const refreshPreview = useCallback(async () => {
    setPreviewLoading(true);
    try {
      const res = await axios.post(
        `${API_URL}/leads/${leadId}/proposal/preview`,
        { override: buildOverride() },
        { withCredentials: true, responseType: 'blob' }
      );
      const url = URL.createObjectURL(res.data);
      if (urlRef.current) URL.revokeObjectURL(urlRef.current);
      urlRef.current = url;
      setPreviewUrl(url);
      setDirty(false);
    } catch (e) {
      toast.error('Could not refresh preview');
    } finally {
      setPreviewLoading(false);
    }
  }, [leadId, buildOverride]);

  // initial preview once the dialog finishes loading (no real-time refresh after)
  useEffect(() => {
    if (!loading && open) refreshPreview();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loading, open]);

  const changeTitle = (v) => { setTitleText(v); setDirty(true); };
  const patch = (idx, p) => { setSections((s) => s.map((x, i) => (i === idx ? { ...x, ...p } : x))); setDirty(true); };
  const move = (idx, dir) => { setSections((s) => {
    const j = idx + dir;
    if (j < 0 || j >= s.length) return s;
    const next = [...s];
    [next[idx], next[j]] = [next[j], next[idx]];
    return next;
  }); setDirty(true); };
  const remove = (idx) => { setSections((s) => s.filter((_, i) => i !== idx)); setDirty(true); };
  const add = (type) => { setSections((s) => [
    ...s,
    {
      id: uid(), type, heading: type === 'list' ? 'New List' : 'New Section',
      heading_font: 'dejavu', heading_size: 13, body_font: 'dejavu', body_size: 10,
      page_break_before: false, ...(type === 'list' ? { items: [] } : { content: '' }),
    },
  ]); setDirty(true); };

  const handleGenerate = async () => {
    if (hasExistingProposal && !window.confirm('This will replace the current proposal with your customized version. Continue?')) return;
    setGenerating(true);
    try {
      await axios.put(`${API_URL}/leads/${leadId}/proposal/customization`, { override: buildOverride() }, { withCredentials: true });
      const res = await axios.post(`${API_URL}/leads/${leadId}/proposal/generate`, {}, { withCredentials: true });
      toast.success(res.data.message || 'Proposal generated');
      onGenerated?.();
      onOpenChange(false);
    } catch (e) {
      toast.error(e.response?.data?.detail || 'Failed to generate proposal');
    } finally {
      setGenerating(false);
    }
  };

  const handleSaveDraft = async () => {
    setSaving(true);
    try {
      await axios.put(`${API_URL}/leads/${leadId}/proposal/customization`, { override: buildOverride() }, { withCredentials: true });
      toast.success('Customizations saved for this lead');
    } catch (e) {
      toast.error('Failed to save');
    } finally {
      setSaving(false);
    }
  };

  const handleReset = async () => {
    if (!window.confirm('Discard this lead\u2019s customizations and revert to the company template?')) return;
    try {
      await axios.delete(`${API_URL}/leads/${leadId}/proposal/customization`, { withCredentials: true });
    } catch { /* ignore - may not exist */ }
    const tpl = templateRef.current;
    if (tpl) seedFrom(tpl.title?.text_template, tpl.sections);
    setDirty(true);
    toast.success('Reverted to company template — click Update preview to refresh');
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-6xl w-[96vw] h-[90vh] flex flex-col p-0 gap-0" data-testid="proposal-customize-dialog">
        <DialogHeader className="px-5 py-4 border-b">
          <DialogTitle className="flex items-center gap-2">
            <Sparkles className="h-5 w-5 text-primary" /> Customize Proposal{companyName ? ` — ${companyName}` : ''}
          </DialogTitle>
          <DialogDescription>
            Edit the wording for this lead only. The logo, fonts and pricing table come from your company template.
          </DialogDescription>
        </DialogHeader>

        {loading ? (
          <div className="flex-1 flex items-center justify-center"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div>
        ) : (
          <div className="flex-1 grid grid-cols-1 lg:grid-cols-2 min-h-0">
            {/* Editor */}
            <div className="overflow-y-auto p-5 space-y-4 border-r" data-testid="customize-editor">
              <div className="space-y-2">
                <Label className="text-sm font-semibold">Title</Label>
                <Input className="text-base h-11" value={titleText} onChange={(e) => changeTitle(e.target.value)} data-testid="customize-title" />
                <p className="text-xs text-muted-foreground">Use {'{company}'} for the customer name.</p>
              </div>

              {sections.map((sec, idx) => (
                <div key={sec.id || idx} className="rounded-lg border p-3 space-y-3" data-testid={`customize-section-${idx}`}>
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-xs font-medium text-muted-foreground bg-muted px-2 py-0.5 rounded">
                      #{idx + 1} · {TYPE_LABEL[sec.type] || sec.type}
                    </span>
                    <div className="flex items-center gap-0.5">
                      <Button size="icon" variant="ghost" className="h-7 w-7" disabled={idx === 0} onClick={() => move(idx, -1)} data-testid={`customize-up-${idx}`}><ChevronUp className="h-4 w-4" /></Button>
                      <Button size="icon" variant="ghost" className="h-7 w-7" disabled={idx === sections.length - 1} onClick={() => move(idx, 1)} data-testid={`customize-down-${idx}`}><ChevronDown className="h-4 w-4" /></Button>
                      <Button size="icon" variant="ghost" className="h-7 w-7 text-destructive" onClick={() => remove(idx)} data-testid={`customize-remove-${idx}`}><Trash2 className="h-4 w-4" /></Button>
                    </div>
                  </div>

                  <div className="space-y-1.5">
                    <Label className="text-sm font-medium">Heading</Label>
                    <Input className="text-base h-11" value={sec.heading || ''} onChange={(e) => patch(idx, { heading: e.target.value })} data-testid={`customize-heading-${idx}`} />
                  </div>

                  {sec.type === 'paragraph' && (
                    <div className="space-y-1.5">
                      <Label className="text-sm font-medium">Text</Label>
                      <Textarea className="text-base leading-relaxed" rows={5} value={sec.content || ''} onChange={(e) => patch(idx, { content: e.target.value })} data-testid={`customize-content-${idx}`} />
                    </div>
                  )}

                  {sec.type === 'list' && (
                    <>
                      <div className="space-y-1.5">
                        <Label className="text-sm font-medium">Intro (optional)</Label>
                        <Textarea className="text-base leading-relaxed" rows={2} value={sec.intro || ''} onChange={(e) => patch(idx, { intro: e.target.value })} />
                      </div>
                      <div className="space-y-1.5">
                        <Label className="text-sm font-medium">Items <span className="font-normal text-muted-foreground">(one per line)</span></Label>
                        <Textarea className="text-base leading-relaxed" rows={5} value={toText(sec.items)} onChange={(e) => patch(idx, { items: toList(e.target.value) })} data-testid={`customize-items-${idx}`} />
                      </div>
                    </>
                  )}

                  {sec.type === 'category' && (
                    <>
                      <div className="space-y-1.5"><Label className="text-sm font-medium">Intro</Label><Input className="text-base h-11" value={sec.intro || ''} onChange={(e) => patch(idx, { intro: e.target.value })} /></div>
                      <div className="grid grid-cols-2 gap-2">
                        <div className="space-y-1.5"><Label className="text-sm font-medium">Allowed</Label><Textarea className="text-base leading-relaxed" rows={3} value={toText(sec.allowed)} onChange={(e) => patch(idx, { allowed: toList(e.target.value) })} /></div>
                        <div className="space-y-1.5"><Label className="text-sm font-medium">Not allowed</Label><Textarea className="text-base leading-relaxed" rows={3} value={toText(sec.not_allowed)} onChange={(e) => patch(idx, { not_allowed: toList(e.target.value) })} /></div>
                      </div>
                    </>
                  )}

                  {sec.type === 'pricing_table' && (
                    <>
                      <div className="space-y-1.5"><Label className="text-sm font-medium">Disclaimer</Label><Textarea className="text-base leading-relaxed" rows={2} value={sec.disclaimer || ''} onChange={(e) => patch(idx, { disclaimer: e.target.value })} data-testid={`customize-disclaimer-${idx}`} /></div>
                      <p className="text-xs text-muted-foreground">Rows are filled from this lead's Proposed SKUs &amp; pricing.</p>
                    </>
                  )}

                  {sec.type === 'image' && (
                    <p className="text-sm text-muted-foreground">Image is taken from the company template.</p>
                  )}
                </div>
              ))}

              <div className="flex gap-2">
                <Button size="sm" variant="outline" onClick={() => add('paragraph')} data-testid="customize-add-paragraph"><Plus className="h-4 w-4 mr-1.5" /> Paragraph</Button>
                <Button size="sm" variant="outline" onClick={() => add('list')} data-testid="customize-add-list"><Plus className="h-4 w-4 mr-1.5" /> List</Button>
              </div>
            </div>

            {/* Preview (manual refresh) */}
            <div className="relative bg-muted/40 min-h-0 flex flex-col" data-testid="customize-preview">
              <div className="flex items-center justify-between gap-2 px-3 py-2 border-b bg-background/80">
                <div className="flex items-center gap-2 text-sm">
                  {dirty
                    ? <span className="flex items-center gap-1.5 text-amber-600 font-medium"><span className="h-2 w-2 rounded-full bg-amber-500" /> Unapplied changes</span>
                    : <span className="flex items-center gap-1.5 text-muted-foreground"><FileText className="h-4 w-4" /> Preview up to date</span>}
                </div>
                <Button size="sm" onClick={refreshPreview} disabled={previewLoading || !dirty} data-testid="customize-apply-btn">
                  {previewLoading ? <Loader2 className="h-4 w-4 mr-1.5 animate-spin" /> : <RefreshCw className="h-4 w-4 mr-1.5" />} Update preview
                </Button>
              </div>
              <div className="relative flex-1 min-h-0">
                {previewLoading && (
                  <div className="absolute top-2 right-2 z-10 flex items-center gap-1.5 bg-background/90 border rounded-full px-3 py-1 text-xs shadow-sm">
                    <Loader2 className="h-3.5 w-3.5 animate-spin" /> Updating…
                  </div>
                )}
                {previewUrl ? (
                  <iframe src={previewUrl} title="Proposal preview" className="w-full h-full border-0" data-testid="customize-preview-frame" />
                ) : (
                  <div className="h-full flex flex-col items-center justify-center text-muted-foreground gap-2">
                    <FileText className="h-10 w-10" /> Generating preview…
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

        {/* Footer */}
        <div className="flex items-center justify-between gap-2 px-5 py-3 border-t flex-wrap">
          <Button variant="ghost" className="text-muted-foreground" onClick={handleReset} disabled={loading} data-testid="customize-reset-btn">
            <RotateCcw className="h-4 w-4 mr-1.5" /> Reset to company template
          </Button>
          <div className="flex items-center gap-2">
            <Button variant="outline" onClick={handleSaveDraft} disabled={loading || saving} data-testid="customize-save-btn">
              {saving ? <Loader2 className="h-4 w-4 mr-1.5 animate-spin" /> : <Save className="h-4 w-4 mr-1.5" />} Save
            </Button>
            <Button onClick={handleGenerate} disabled={loading || generating} data-testid="customize-generate-btn">
              {generating ? <Loader2 className="h-4 w-4 mr-1.5 animate-spin" /> : <Sparkles className="h-4 w-4 mr-1.5" />} Generate Proposal
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
