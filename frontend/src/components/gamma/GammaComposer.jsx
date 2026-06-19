import React, { useState, useEffect, useRef } from 'react';
import axios from 'axios';
import { toast } from 'sonner';
import { Button } from '../ui/button';
import { Input } from '../ui/input';
import { Label } from '../ui/label';
import { Textarea } from '../ui/textarea';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '../ui/select';
import {
  Loader2, Sparkles, ExternalLink, Download, RefreshCw, CheckCircle2, AlertCircle,
} from 'lucide-react';

const API = `${process.env.REACT_APP_BACKEND_URL}/api`;
const HEAD = () => ({ Authorization: `Bearer ${localStorage.getItem('token')}` });

const TERMINAL = new Set(['completed', 'failed']);

/**
 * Self-contained Gamma deck composer: edit content, pick options, generate,
 * poll, and show the result (Open in Gamma + Download PDF).
 * Props: initialTitle, initialText, sourceType, sourceId, sourceLabel, onDone
 */
export default function GammaComposer({
  initialTitle = '', initialText = '', sourceType = null, sourceId = null,
  sourceLabel = null, loadingDraft = false,
}) {
  const [title, setTitle] = useState(initialTitle);
  const [text, setText] = useState(initialText);
  const [numCards, setNumCards] = useState(10);
  const [themeId, setThemeId] = useState('default');
  const [themes, setThemes] = useState([]);
  const [templates, setTemplates] = useState([]);
  const [templateId, setTemplateId] = useState('none');
  const [generating, setGenerating] = useState(false);
  const [job, setJob] = useState(null);
  const pollRef = useRef(null);

  useEffect(() => { setTitle(initialTitle); }, [initialTitle]);
  useEffect(() => { setText(initialText); }, [initialText]);

  useEffect(() => {
    axios.get(`${API}/gamma/themes`, { headers: HEAD() })
      .then((r) => setThemes(r.data.themes || [])).catch(() => {});
    axios.get(`${API}/gamma/templates`, { headers: HEAD() })
      .then((r) => setTemplates(r.data.templates || [])).catch(() => {});
    return () => { if (pollRef.current) clearInterval(pollRef.current); };
  }, []);

  const poll = (jobId) => {
    pollRef.current = setInterval(async () => {
      try {
        const r = await axios.get(`${API}/gamma/generations/${jobId}`, { headers: HEAD() });
        setJob(r.data);
        if (TERMINAL.has(r.data.status)) {
          clearInterval(pollRef.current);
          setGenerating(false);
          if (r.data.status === 'completed') toast.success('Deck ready!');
          if (r.data.status === 'failed') toast.error(r.data.error_message || 'Generation failed');
        }
      } catch (e) { /* keep polling */ }
    }, 5000);
  };

  const generate = async () => {
    if (!text.trim()) { toast.error('Add some content first'); return; }
    setGenerating(true);
    setJob(null);
    try {
      const r = await axios.post(`${API}/gamma/generations`, {
        title, input_text: text, num_cards: numCards,
        theme_id: themeId === 'default' ? null : themeId,
        template_id: templateId === 'none' ? null : templateId,
        source_type: sourceType, source_id: sourceId, source_label: sourceLabel,
      }, { headers: HEAD() });
      setJob(r.data);
      poll(r.data.id);
    } catch (e) {
      setGenerating(false);
      toast.error(e.response?.data?.detail || 'Failed to start generation');
    }
  };

  const reset = () => { setJob(null); };

  // ── Result view ──
  if (job && job.status === 'completed') {
    return (
      <div className="text-center py-6 space-y-4" data-testid="gamma-result">
        <div className="h-14 w-14 rounded-full bg-emerald-100 text-emerald-600 flex items-center justify-center mx-auto">
          <CheckCircle2 className="h-7 w-7" />
        </div>
        <div>
          <p className="font-semibold text-slate-800">{job.title}</p>
          <p className="text-sm text-muted-foreground">Your deck is ready{job.credits_deducted ? ` · ${job.credits_deducted} credits used` : ''}</p>
        </div>
        <div className="flex flex-wrap gap-2 justify-center">
          <Button asChild className="bg-indigo-600 hover:bg-indigo-700" data-testid="gamma-open-btn">
            <a href={job.gamma_url} target="_blank" rel="noopener noreferrer"><ExternalLink className="h-4 w-4 mr-1.5" /> Open in Gamma</a>
          </Button>
          {job.export_url && (
            <Button asChild variant="outline" data-testid="gamma-download-btn">
              <a href={job.export_url} target="_blank" rel="noopener noreferrer"><Download className="h-4 w-4 mr-1.5" /> Download PDF</a>
            </Button>
          )}
          <Button variant="ghost" onClick={reset} data-testid="gamma-again-btn"><RefreshCw className="h-4 w-4 mr-1.5" /> Generate another</Button>
        </div>
      </div>
    );
  }

  if (job && job.status === 'failed') {
    return (
      <div className="text-center py-6 space-y-4">
        <div className="h-14 w-14 rounded-full bg-rose-100 text-rose-600 flex items-center justify-center mx-auto"><AlertCircle className="h-7 w-7" /></div>
        <p className="text-sm text-rose-700">{job.error_message || 'Generation failed'}</p>
        <Button variant="outline" onClick={reset}>Try again</Button>
      </div>
    );
  }

  if (generating || (job && !TERMINAL.has(job.status))) {
    return (
      <div className="text-center py-10 space-y-3" data-testid="gamma-progress">
        <Loader2 className="h-8 w-8 animate-spin text-indigo-600 mx-auto" />
        <p className="font-medium text-slate-700">Generating your deck…</p>
        <p className="text-sm text-muted-foreground capitalize">{(job?.status || 'starting').replace('_', ' ')} · this usually takes ~30s</p>
      </div>
    );
  }

  // ── Compose form ──
  return (
    <div className="space-y-4" data-testid="gamma-composer">
      <div className="space-y-1.5">
        <Label>Title</Label>
        <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Deck title" data-testid="gamma-title-input" />
      </div>
      <div className="space-y-1.5">
        <Label>Content {loadingDraft && <span className="text-xs text-muted-foreground">(building draft…)</span>}</Label>
        <Textarea value={text} onChange={(e) => setText(e.target.value)} rows={12}
          placeholder="Write or paste the content for your deck. Use # headings to structure slides."
          className="font-mono text-sm" data-testid="gamma-content-input" />
        <p className="text-xs text-muted-foreground">Tip: Gamma turns your outline into a polished presentation. Edit freely before generating.</p>
      </div>
      <div className="space-y-1.5">
        <Label>Template</Label>
        <Select value={templateId} onValueChange={setTemplateId}>
          <SelectTrigger data-testid="gamma-template-select"><SelectValue /></SelectTrigger>
          <SelectContent className="max-h-[260px]">
            <SelectItem value="none">No template — generate from scratch</SelectItem>
            {templates.map((t) => (
              <SelectItem key={t.id} value={t.id}>{t.name}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        {templateId !== 'none' && (
          <p className="text-xs text-muted-foreground">Your content becomes the prompt; the deck's structure & branding follow your Gamma template.</p>
        )}
      </div>
      <div className="grid grid-cols-2 gap-3">
        {templateId === 'none' && (
          <div className="space-y-1.5">
            <Label>Slides</Label>
            <Select value={String(numCards)} onValueChange={(v) => setNumCards(Number(v))}>
              <SelectTrigger data-testid="gamma-cards-select"><SelectValue /></SelectTrigger>
              <SelectContent>{[5, 8, 10, 12, 15, 20].map((n) => <SelectItem key={n} value={String(n)}>{n} slides</SelectItem>)}</SelectContent>
            </Select>
          </div>
        )}
        <div className="space-y-1.5">
          <Label>Theme {templateId !== 'none' && <span className="text-xs text-muted-foreground">(optional override)</span>}</Label>
          <Select value={themeId} onValueChange={setThemeId}>
            <SelectTrigger data-testid="gamma-theme-select"><SelectValue /></SelectTrigger>
            <SelectContent className="max-h-[260px]">
              <SelectItem value="default">{templateId !== 'none' ? "Template's theme" : 'Gamma default'}</SelectItem>
              {themes.map((t) => <SelectItem key={t.id} value={t.id}>{t.name}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
      </div>
      <Button onClick={generate} disabled={loadingDraft || !text.trim()} className="w-full bg-indigo-600 hover:bg-indigo-700" data-testid="gamma-generate-btn">
        <Sparkles className="h-4 w-4 mr-2" /> Generate deck
      </Button>
    </div>
  );
}
