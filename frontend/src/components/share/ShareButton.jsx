import React, { useState } from 'react';
import axios from 'axios';
import { toast } from 'sonner';
import {
  Share2, Mail, Loader2, MessageCircle, X, Plus, ChevronDown,
  FileText, Paperclip, Sparkles, Check,
} from 'lucide-react';
import { Button } from '../ui/button';
import { Input } from '../ui/input';
import { Label } from '../ui/label';
import { Switch } from '../ui/switch';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from '../ui/dialog';
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger,
  DropdownMenuLabel, DropdownMenuSeparator,
} from '../ui/dropdown-menu';
import RichEmailEditor from '../gmail/RichEmailEditor';

const API = `${process.env.REACT_APP_BACKEND_URL}/api`;
const HEAD = () => {
  const t = localStorage.getItem('token');
  return t ? { Authorization: `Bearer ${t}` } : {};
};
const isEmail = (e) => /^\S+@\S+\.\S+$/.test(e || '');
const norm = (e) => (e || '').trim().toLowerCase();

const escapeHtml = (s) => (s || '')
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
// Convert the server's plain-text default message into simple HTML for the editor.
const textToHtml = (t) => {
  if (!t) return '';
  if (/<[a-z][\s\S]*>/i.test(t)) return t; // already HTML
  return t.split(/\n{2,}/).map((p) => `<p>${escapeHtml(p).replace(/\n/g, '<br>')}</p>`).join('');
};
const htmlIsEmpty = (h) => !h || !h.replace(/<[^>]*>/g, '').replace(/&nbsp;/g, ' ').trim();

// Map a sharable document to a CRM entity so {{placeholders}} in templates fill.
const entityForDoc = (documentType, documentId) => {
  if (documentType === 'lead_proposal') return { entity_type: 'lead', entity_id: documentId };
  return {};
};

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

/** Editable recipient list (To / Cc / Bcc) with chips + candidate picker + manual add. */
const RecipientField = ({ which, list, setList, candidates, locked }) => {
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
  const lc = which.toLowerCase();

  return (
    <div className="space-y-1.5">
      <Label className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider">{which}</Label>
      <div className="rounded-xl border border-slate-200 bg-white focus-within:border-teal-400 focus-within:ring-2 focus-within:ring-teal-100 transition-all p-1.5">
        <div className="flex flex-wrap gap-1.5">
          {list.map((r, i) => {
            const isLocked = lockedSet.has(norm(r.email));
            return (
              <span key={i}
                className={`inline-flex items-center gap-1.5 text-xs pl-2.5 pr-1.5 py-1 rounded-full border ${
                  isLocked ? 'bg-slate-100 text-slate-500 border-slate-200' : 'bg-teal-50 text-teal-800 border-teal-200'
                }`}
                data-testid={`share-${lc}-chip-${i}`}
              >
                {r.name && <span className="font-medium">{r.name}</span>}
                <span className="opacity-70">{r.email}</span>
                {!isLocked && (
                  <button type="button" onClick={() => remove(r.email)}
                    className="rounded-full hover:bg-rose-100 hover:text-rose-600 p-0.5 transition-colors"
                    data-testid={`share-${lc}-remove-${i}`}>
                    <X className="h-3 w-3" />
                  </button>
                )}
              </span>
            );
          })}
          <div className="flex items-center gap-1 flex-1 min-w-[160px]">
            <input
              value={manual}
              onChange={(e) => setManual(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ',') { e.preventDefault(); addManual(); }
              }}
              placeholder={list.length ? 'Add another…' : 'Add email…'}
              className="flex-1 min-w-[120px] bg-transparent border-0 outline-none text-sm px-2 py-1 placeholder:text-slate-400"
              data-testid={`share-${lc}-input`}
            />
            {manual && (
              <Button type="button" size="sm" variant="ghost" className="h-7 px-2 text-teal-700" onClick={addManual}
                data-testid={`share-${lc}-add`}>
                <Plus className="h-3.5 w-3.5" />
              </Button>
            )}
            {pickable.length > 0 && (
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button type="button" size="sm" variant="ghost" className="h-7 px-2 text-slate-500 whitespace-nowrap"
                    data-testid={`share-${lc}-pick`}>
                    Suggestions <ChevronDown className="h-3.5 w-3.5 ml-1" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="max-h-64 overflow-auto">
                  <DropdownMenuLabel className="text-xs">Suggested recipients</DropdownMenuLabel>
                  <DropdownMenuSeparator />
                  {pickable.map((c, i) => (
                    <DropdownMenuItem key={i} onClick={() => add(c)} className="text-sm"
                      data-testid={`share-${lc}-candidate-${i}`}>
                      <div className="flex flex-col">
                        <span>{c.name || c.email}</span>
                        <span className="text-[11px] text-slate-400">{c.email}{c.role ? ` · ${c.role}` : ''}</span>
                      </div>
                    </DropdownMenuItem>
                  ))}
                </DropdownMenuContent>
              </DropdownMenu>
            )}
          </div>
        </div>
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
  const [bcc, setBcc] = useState([]);
  const [showCc, setShowCc] = useState(false);
  const [showBcc, setShowBcc] = useState(false);
  const [candidates, setCandidates] = useState([]);
  const [locked, setLocked] = useState([]);
  const [subject, setSubject] = useState('');
  const [message, setMessage] = useState('');         // HTML
  const [attachPdf, setAttachPdf] = useState(true);
  const [templates, setTemplates] = useState([]);
  const [appliedTemplate, setAppliedTemplate] = useState(null);

  React.useEffect(() => {
    let active = true;
    (async () => {
      try {
        const [recRes, tplRes] = await Promise.allSettled([
          axios.get(`${API}/share/recipients`, {
            headers: HEAD(), params: { document_type: documentType, document_id: documentId },
          }),
          axios.get(`${API}/email-templates`, { headers: HEAD() }),
        ]);
        if (!active) return;
        if (recRes.status === 'fulfilled') {
          const data = recRes.value.data;
          setTitle(data.title || 'Document');
          setSubject(data.default_subject || data.title || 'Document');
          setMessage(textToHtml(data.default_message || ''));
          setTo((data.to || []).filter((r) => r.email));
          const ccList = (data.cc || []).filter((r) => r.email);
          setCc(ccList);
          if (ccList.length) setShowCc(true);
          const bccList = (data.bcc || []).filter((r) => r.email);
          setBcc(bccList);
          if (bccList.length) setShowBcc(true);
          setCandidates(data.candidates || []);
          setLocked((data.policy && data.policy.locked) || []);
        } else {
          setTitle('Document'); setSubject('Document');
        }
        if (tplRes.status === 'fulfilled') setTemplates(tplRes.value.data || []);
      } finally {
        if (active) setLoading(false);
      }
    })();
    return () => { active = false; };
  }, [documentType, documentId]);

  const applyTemplate = async (tpl) => {
    try {
      const { data } = await axios.post(`${API}/email-templates/${tpl.id}/render`,
        entityForDoc(documentType, documentId), { headers: HEAD() });
      if (data.subject) setSubject(data.subject);
      setMessage(data.body_html || '');
      setAppliedTemplate(tpl.name);
      toast.success(`Applied "${tpl.name}"`);
    } catch (e) {
      toast.error(e.response?.data?.detail || 'Failed to apply template');
    }
  };

  const send = async () => {
    if (to.length === 0) { toast.error('Add at least one recipient in To'); return; }
    setSending(true);
    try {
      const body = htmlIsEmpty(message) ? '' : message;
      const { data } = await axios.post(`${API}/share`, {
        document_type: documentType, document_id: documentId, channel: 'email',
        to, cc, bcc, subject, message: body, message_is_html: true, attach_pdf: attachPdf,
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

  const recipientCount = to.length + cc.length + bcc.length;

  return (
    <Dialog open onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="sm:max-w-2xl p-0 gap-0 overflow-hidden" data-testid={`share-dialog-${testIdBase}`}>
        {/* Header */}
        <DialogHeader className="px-6 pt-5 pb-4 border-b border-slate-100 bg-gradient-to-br from-teal-50/80 to-white">
          <div className="flex items-start gap-3">
            <div className="h-10 w-10 rounded-xl bg-teal-600 text-white flex items-center justify-center shadow-sm shrink-0">
              <Mail className="h-5 w-5" />
            </div>
            <div className="min-w-0">
              <DialogTitle className="text-lg font-semibold text-slate-900">Compose email</DialogTitle>
              <p className="text-sm text-slate-500 truncate flex items-center gap-1.5 mt-0.5">
                <FileText className="h-3.5 w-3.5 shrink-0" />
                <span className="truncate">{loading ? 'Loading…' : title}</span>
              </p>
            </div>
          </div>
        </DialogHeader>

        {loading ? (
          <div className="py-16 flex items-center justify-center text-slate-400">
            <Loader2 className="h-6 w-6 animate-spin" />
          </div>
        ) : (
          <div className="px-6 py-4 space-y-4 max-h-[60vh] overflow-y-auto">
            {/* Channel + Template row */}
            <div className="flex flex-col sm:flex-row gap-2">
              <div className="flex gap-2 flex-1">
                <div className="flex-1 flex items-center justify-center gap-1.5 rounded-lg border-2 border-teal-600 bg-teal-50 py-2 text-sm font-semibold text-teal-700"
                     data-testid="share-channel-email">
                  <Mail className="h-4 w-4" /> Email
                </div>
                <div className="flex-1 flex items-center justify-center gap-1.5 rounded-lg border border-slate-200 bg-slate-50 py-2 text-sm text-slate-400 cursor-not-allowed"
                     title="WhatsApp sharing is coming soon" data-testid="share-channel-whatsapp">
                  <MessageCircle className="h-4 w-4" /> WhatsApp <span className="text-[10px]">(soon)</span>
                </div>
              </div>
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button type="button" variant="outline"
                    className="h-auto py-2 px-3 border-dashed border-teal-300 text-teal-700 hover:bg-teal-50 justify-between sm:w-56"
                    data-testid="share-template-trigger">
                    <span className="flex items-center gap-1.5 truncate">
                      <Sparkles className="h-4 w-4 shrink-0" />
                      <span className="truncate">{appliedTemplate || 'Use a template'}</span>
                    </span>
                    <ChevronDown className="h-4 w-4 ml-1 shrink-0 opacity-60" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-72 max-h-72 overflow-auto">
                  <DropdownMenuLabel className="text-xs">Email templates</DropdownMenuLabel>
                  <DropdownMenuSeparator />
                  {templates.length === 0 ? (
                    <div className="px-3 py-4 text-center text-xs text-slate-400">
                      No templates yet.<br />Create them under Settings → Email Templates.
                    </div>
                  ) : templates.map((tpl) => (
                    <DropdownMenuItem key={tpl.id} onClick={() => applyTemplate(tpl)} className="text-sm flex-col items-start gap-0.5"
                      data-testid={`share-template-${tpl.id}`}>
                      <div className="flex items-center gap-1.5 w-full">
                        <span className="font-medium truncate flex-1">{tpl.name}</span>
                        {appliedTemplate === tpl.name && <Check className="h-3.5 w-3.5 text-teal-600" />}
                        {tpl.is_public && <span className="text-[10px] bg-slate-100 text-slate-500 px-1.5 py-0.5 rounded-full">Shared</span>}
                      </div>
                      {tpl.subject && <span className="text-[11px] text-slate-400 truncate w-full">{tpl.subject}</span>}
                    </DropdownMenuItem>
                  ))}
                </DropdownMenuContent>
              </DropdownMenu>
            </div>

            {/* Recipients */}
            <RecipientField which="To" list={to} setList={setTo} candidates={candidates} locked={locked} />

            <div className="flex items-center gap-3 text-xs">
              {!showCc && (
                <button type="button" onClick={() => setShowCc(true)} className="text-teal-700 hover:underline font-medium" data-testid="share-add-cc">
                  + Add Cc
                </button>
              )}
              {!showBcc && (
                <button type="button" onClick={() => setShowBcc(true)} className="text-teal-700 hover:underline font-medium" data-testid="share-add-bcc">
                  + Add Bcc
                </button>
              )}
            </div>

            {showCc && <RecipientField which="Cc" list={cc} setList={setCc} candidates={candidates} locked={locked} />}
            {showBcc && <RecipientField which="Bcc" list={bcc} setList={setBcc} candidates={candidates} locked={locked} />}

            {/* Subject */}
            <div className="space-y-1.5">
              <Label className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider">Subject</Label>
              <Input value={subject} onChange={(e) => setSubject(e.target.value)}
                className="rounded-xl border-slate-200 focus-visible:ring-teal-100 focus-visible:border-teal-400"
                placeholder="Email subject" data-testid="share-subject-input" />
            </div>

            {/* Rich message */}
            <div className="space-y-1.5">
              <Label className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider">Message</Label>
              <RichEmailEditor value={message} onChange={setMessage} placeholder="Write your message… use the toolbar to format." />
            </div>

            {/* Attachment toggle */}
            <div className="flex items-center justify-between rounded-xl border border-slate-200 bg-slate-50/60 px-4 py-3">
              <div className="flex items-center gap-2.5">
                <Paperclip className="h-4 w-4 text-slate-500" />
                <div>
                  <p className="text-sm font-medium text-slate-700">Attach document to email</p>
                  <p className="text-xs text-slate-400">A secure download link is always included.</p>
                </div>
              </div>
              <Switch checked={attachPdf} onCheckedChange={setAttachPdf} data-testid="share-attach-toggle" />
            </div>
          </div>
        )}

        {/* Footer */}
        <DialogFooter className="px-6 py-4 border-t border-slate-100 bg-slate-50/60 sm:justify-between items-center">
          <span className="hidden sm:block text-xs text-slate-400">
            {recipientCount} recipient{recipientCount === 1 ? '' : 's'}
          </span>
          <div className="flex gap-2">
            <Button variant="outline" onClick={onClose} disabled={sending} data-testid="share-cancel-btn">Cancel</Button>
            <Button onClick={send} disabled={sending || loading || to.length === 0}
              className="bg-teal-700 hover:bg-teal-800 px-6" data-testid="share-send-btn">
              {sending ? <Loader2 className="h-4 w-4 mr-1.5 animate-spin" /> : <Mail className="h-4 w-4 mr-1.5" />}
              Send
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default ShareButton;
