/**
 * AIDraftDialog — smart drafting / summaries for an account, lead or issue.
 * Streams /api/ai/draft. Also exports AIAssistButton as a ready-made trigger.
 */
import React, { useState, useEffect } from 'react';
import ReactMarkdown from 'react-markdown';
import { toast } from 'sonner';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '../ui/dialog';
import { Button } from '../ui/button';
import { Label } from '../ui/label';
import { Textarea } from '../ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../ui/select';
import { Sparkles, Loader2, Copy, Check } from 'lucide-react';
import { streamAI } from './aiStream';

const DRAFT_TYPES = [
  { value: 'summary', label: 'Summary & next actions' },
  { value: 'email', label: 'Draft email' },
  { value: 'whatsapp', label: 'Draft WhatsApp message' },
  { value: 'proposal', label: 'Draft proposal text' },
  { value: 'issue_response', label: 'Draft issue response', only: 'issue' },
];

export const AIAssistButton = ({ onClick, className = '' }) => (
  <Button
    onClick={onClick}
    variant="outline"
    size="sm"
    className={`border-violet-300 text-violet-700 hover:bg-violet-50 text-xs sm:text-sm h-8 sm:h-9 px-2 sm:px-3 ${className}`}
    data-testid="ai-assist-button"
  >
    <Sparkles className="h-3 w-3 sm:h-4 sm:w-4 sm:mr-2" />
    <span className="hidden sm:inline">AI Assist</span>
  </Button>
);

export default function AIDraftDialog({ open, onOpenChange, contextType, contextId, contextName }) {
  const [draftType, setDraftType] = useState('summary');
  const [instructions, setInstructions] = useState('');
  const [output, setOutput] = useState('');
  const [streaming, setStreaming] = useState(false);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (open) { setOutput(''); setInstructions(''); setCopied(false); }
  }, [open]);

  const types = DRAFT_TYPES.filter(t => !t.only || t.only === contextType);

  const generate = async () => {
    setOutput('');
    setStreaming(true);
    try {
      await streamAI('/api/ai/draft', {
        draft_type: draftType, context_type: contextType, context_id: contextId,
        instructions: instructions || null,
      }, (ev) => {
        if (ev.delta) setOutput(o => o + ev.delta);
        if (ev.error) toast.error(ev.error);
      });
    } catch (e) {
      toast.error(e.message);
    } finally {
      setStreaming(false);
    }
  };

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(output);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch { toast.error('Copy failed'); }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg" data-testid="ai-draft-dialog">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Sparkles className="h-4 w-4 text-violet-600" /> AI Assist
          </DialogTitle>
          <DialogDescription>{contextName}</DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div className="flex gap-2">
            <div className="flex-1">
              <Select value={draftType} onValueChange={setDraftType}>
                <SelectTrigger data-testid="ai-draft-type"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {types.map(t => <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <Button
              onClick={generate}
              disabled={streaming}
              className="bg-violet-600 hover:bg-violet-700"
              data-testid="ai-draft-generate"
            >
              {streaming ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Sparkles className="h-4 w-4 mr-2" />}
              Generate
            </Button>
          </div>
          <div>
            <Label className="text-xs text-slate-500">Extra instructions (optional)</Label>
            <Textarea
              value={instructions}
              onChange={e => setInstructions(e.target.value)}
              rows={2}
              placeholder="e.g. mention the new 1L branded SKU, keep it short…"
              data-testid="ai-draft-instructions"
            />
          </div>
          {(output || streaming) && (
            <div className="relative rounded-lg border border-slate-200 bg-slate-50 p-3 max-h-72 overflow-y-auto" data-testid="ai-draft-output">
              {output && (
                <button
                  onClick={copy}
                  className="absolute top-2 right-2 text-slate-400 hover:text-slate-700 bg-white rounded-md border p-1"
                  title="Copy"
                  data-testid="ai-draft-copy"
                >
                  {copied ? <Check className="h-3.5 w-3.5 text-emerald-600" /> : <Copy className="h-3.5 w-3.5" />}
                </button>
              )}
              <div className="prose prose-sm max-w-none prose-p:my-1 prose-ul:my-1 text-sm">
                {output ? <ReactMarkdown>{output}</ReactMarkdown>
                  : <span className="text-slate-400 text-xs flex items-center gap-2"><Loader2 className="h-3.5 w-3.5 animate-spin" /> Thinking…</span>}
              </div>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
