import React, { useState } from 'react';
import axios from 'axios';
import { toast } from 'sonner';
import { Share2, Mail, Loader2, MessageCircle, X, Plus, ChevronDown } from 'lucide-react';
import { Button } from '../ui/button';
import { Input } from '../ui/input';
import { Label } from '../ui/label';
import { Textarea } from '../ui/textarea';
import { Switch } from '../ui/switch';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from '../ui/dialog';
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger,
  DropdownMenuLabel, DropdownMenuSeparator,
} from '../ui/dropdown-menu';

const API = `${process.env.REACT_APP_BACKEND_URL}/api`;
const HEAD = () => {
  const t = localStorage.getItem('token');
  return t ? { Authorization: `Bearer ${t}` } : {};
};
const isEmail = (e) => /^\S+@\S+\.\S+$/.test(e || '');
const norm = (e) => (e || '').trim().toLowerCase();

/**
 * Reusable document-sharing trigger. Drop next to any Download button.
 * Props: documentType, documentId, label, variant/size/className, iconOnly, testId
 */
export const ShareButton = ({
  documentType, documentId, label = 'Share', variant = 'ghost',
  size = 'sm', className = '', iconOnly = false, testId,
}) => {
  const [open, setOpen] = useState(false);
  const base = testId || `${documentType}-${documentId}`;
  return (
    <>
      <Button
        size={size} variant={variant} className={className}
        onClick={(e) => { e.stopPropagation(); setOpen(true); }}
        title="Share via email" data-testid={`share-btn-${base}`}
      >
        <Share2 className={`h-3.5 w-3.5 ${iconOnly ? '' : 'mr-1.5'}`} />
        {!iconOnly && label}
      </Button>
      {open && (
        <ShareDialog
          documentType={documentType} documentId={documentId}
          testIdBase={base} onClose={() => setOpen(false)}
        />
      )}
    </>
  );
};

/** Editable recipient list (To or CC) with chips + candidate picker + manual add. */
const RecipientField = ({ which, list, setList, candidates, locked, testIdBase }) => {
  const [manual, setManual] = useState('');
  const lockedSet = new Set((locked || []).map(norm));
  const present = new Set(list.map((r) => norm(r.email)));

  const add = (r) => {
    if (!r.email || present.has(norm(r.email))) return;
    setList([...list, r]);
  };
  const addManual = () => {
    if (!isEmail(manual)) { toast.error('Enter a valid email'); return; }
    add({ name: '', email: manual.trim(), role: 'Manual', source: 'manual' });
    setManual('');
  };
  const remove = (email) => setList(list.filter((r) => norm(r.email) !== norm(email)));

  const pickable = (candidates || []).filter((c) => c.email && !present.has(norm(c.email)));

  return (
    <div className="space-y-1.5">
      <Label className="text-xs text-slate-500 uppercase tracking-wide">{which}</Label>
      <div className="flex flex-wrap gap-1.5 min-h-[28px]">
        {list.length === 0 && <span className="text-xs text-slate-400 py-1">No recipients</span>}
        {list.map((r, i) => {
          const isLocked = lockedSet.has(norm(r.email));
          return (
            <span key={i}
              className={`inline-flex items-center gap-1 text-xs px-2 py-1 rounded-full border ${
                isLocked ? 'bg-slate-100 text-slate-500 border-slate-200' : 'bg-teal-50 text-teal-800 border-teal-200'
              }`}
              data-testid={`share-${which.toLowerCase()}-chip-${i}`}
            >
              {r.name ? `${r.name} ` : ''}<span className="opacity-70">{r.email}</span>
              {!isLocked && (
                <button type="button" onClick={() => remove(r.email)} className="hover:text-rose-600"
                  data-testid={`share-${which.toLowerCase()}-remove-${i}`}>
                  <X className="h-3 w-3" />
                </button>
              )}
            </span>
          );
        })}
      </div>
      <div className="flex items-center gap-1.5">
        <Input value={manual} onChange={(e) => setManual(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); addManual(); } }}
          placeholder="Add email…" className="h-8 text-sm"
          data-testid={`share-${which.toLowerCase()}-input`} />
        <Button type="button" size="sm" variant="outline" className="h-8 px-2" onClick={addManual}
          data-testid={`share-${which.toLowerCase()}-add`}>
          <Plus className="h-3.5 w-3.5" />
        </Button>
        {pickable.length > 0 && (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button type="button" size="sm" variant="outline" className="h-8 px-2 whitespace-nowrap"
                data-testid={`share-${which.toLowerCase()}-pick`}>
                List <ChevronDown className="h-3.5 w-3.5 ml-1" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="max-h-64 overflow-auto">
              <DropdownMenuLabel className="text-xs">Suggested recipients</DropdownMenuLabel>
              <DropdownMenuSeparator />
              {pickable.map((c, i) => (
                <DropdownMenuItem key={i} onClick={() => add(c)} className="text-sm"
                  data-testid={`share-${which.toLowerCase()}-candidate-${i}`}>
                  <div className="flex flex-col">
                    <span>{c.name || c.email}</span>
                    <span className="text-[11px] text-slate-400">{c.email} · {c.role}</span>
                  </div>
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
        )}
      </div>
    </div>
  );
};

const ShareDialog = ({ documentType, documentId, testIdBase, onClose }) => {
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [title, setTitle] = useState('');
  const [to, setTo] = useState([]);
  const [cc, setCc] = useState([]);
  const [candidates, setCandidates] = useState([]);
  const [locked, setLocked] = useState([]);
  const [subject, setSubject] = useState('');
  const [message, setMessage] = useState('');
  const [attachPdf, setAttachPdf] = useState(true);

  React.useEffect(() => {
    let active = true;
    (async () => {
      try {
        const { data } = await axios.get(`${API}/share/recipients`, {
          headers: HEAD(), params: { document_type: documentType, document_id: documentId },
        });
        if (!active) return;
        setTitle(data.title || 'Document');
        setSubject(data.title || 'Document');
        setTo((data.to || []).filter((r) => r.email));
        setCc((data.cc || []).filter((r) => r.email));
        setCandidates(data.candidates || []);
        setLocked((data.policy && data.policy.locked) || []);
      } catch (e) {
        if (active) { setTitle('Document'); setSubject('Document'); }
      } finally {
        if (active) setLoading(false);
      }
    })();
    return () => { active = false; };
  }, [documentType, documentId]);

  const send = async () => {
    if (to.length === 0) { toast.error('Add at least one recipient in To'); return; }
    setSending(true);
    try {
      const { data } = await axios.post(`${API}/share`, {
        document_type: documentType, document_id: documentId, channel: 'email',
        to, cc, subject, message, attach_pdf: attachPdf,
        base_url: process.env.REACT_APP_BACKEND_URL,
      }, { headers: HEAD() });
      toast.success(data.message || 'Document shared');
      onClose();
    } catch (e) {
      toast.error(e.response?.data?.detail || 'Failed to share document');
    } finally {
      setSending(false);
    }
  };

  return (
    <Dialog open onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="sm:max-w-lg" data-testid={`share-dialog-${testIdBase}`}>
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-base">
            <Share2 className="h-4 w-4 text-teal-700" /> Share document
          </DialogTitle>
        </DialogHeader>

        {loading ? (
          <div className="py-8 flex items-center justify-center text-slate-400">
            <Loader2 className="h-5 w-5 animate-spin" />
          </div>
        ) : (
          <div className="space-y-4 max-h-[65vh] overflow-y-auto pr-1">
            <div className="text-sm text-slate-600">
              Sharing: <span className="font-medium text-slate-900">{title}</span>
            </div>

            <div className="flex gap-2">
              <div className="flex-1 flex items-center justify-center gap-1.5 rounded-lg border-2 border-teal-600 bg-teal-50 py-2 text-sm font-medium text-teal-700"
                   data-testid="share-channel-email">
                <Mail className="h-4 w-4" /> Email
              </div>
              <div className="flex-1 flex items-center justify-center gap-1.5 rounded-lg border border-slate-200 bg-slate-50 py-2 text-sm text-slate-400 cursor-not-allowed"
                   title="WhatsApp sharing is coming soon" data-testid="share-channel-whatsapp">
                <MessageCircle className="h-4 w-4" /> WhatsApp <span className="text-[10px]">(soon)</span>
              </div>
            </div>

            <RecipientField which="To" list={to} setList={setTo} candidates={candidates} locked={locked} testIdBase={testIdBase} />
            <RecipientField which="Cc" list={cc} setList={setCc} candidates={candidates} locked={locked} testIdBase={testIdBase} />

            <div className="space-y-1">
              <Label className="text-xs text-slate-500 uppercase tracking-wide">Subject</Label>
              <Input value={subject} onChange={(e) => setSubject(e.target.value)} data-testid="share-subject-input" />
            </div>

            <div className="space-y-1">
              <Label className="text-xs text-slate-500 uppercase tracking-wide">Message (optional)</Label>
              <Textarea value={message} onChange={(e) => setMessage(e.target.value)} rows={3} placeholder="Add a short note…" data-testid="share-message-input" />
            </div>

            <div className="flex items-center justify-between rounded-lg bg-slate-50 px-3 py-2">
              <div className="text-sm text-slate-600">Attach file to email</div>
              <Switch checked={attachPdf} onCheckedChange={setAttachPdf} data-testid="share-attach-toggle" />
            </div>
          </div>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={sending} data-testid="share-cancel-btn">Cancel</Button>
          <Button onClick={send} disabled={sending || loading} className="bg-teal-700 hover:bg-teal-800" data-testid="share-send-btn">
            {sending ? <Loader2 className="h-4 w-4 mr-1.5 animate-spin" /> : <Mail className="h-4 w-4 mr-1.5" />}
            Send
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default ShareButton;
