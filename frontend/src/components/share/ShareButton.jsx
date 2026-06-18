import React, { useState } from 'react';
import axios from 'axios';
import { toast } from 'sonner';
import { Share2, Mail, Loader2, MessageCircle } from 'lucide-react';
import { Button } from '../ui/button';
import { Input } from '../ui/input';
import { Label } from '../ui/label';
import { Textarea } from '../ui/textarea';
import { Switch } from '../ui/switch';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from '../ui/dialog';

const API = `${process.env.REACT_APP_BACKEND_URL}/api`;
const HEAD = () => {
  const t = localStorage.getItem('token');
  return t ? { Authorization: `Bearer ${t}` } : {};
};

/**
 * Reusable document-sharing trigger. Drop next to any Download button.
 * Props:
 *   documentType  e.g. "driver_bundle" | "delivery_invoice" | "stock_transfer_doc"
 *   documentId    the entity id
 *   label         button text (default "Share")
 *   variant/size/className  button styling passthrough
 *   iconOnly      render just the icon
 *   testId        base for data-testid
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
        title="Share via email"
        data-testid={`share-btn-${base}`}
      >
        <Share2 className={`h-3.5 w-3.5 ${iconOnly ? '' : 'mr-1.5'}`} />
        {!iconOnly && label}
      </Button>
      {open && (
        <ShareDialog
          documentType={documentType}
          documentId={documentId}
          testIdBase={base}
          onClose={() => setOpen(false)}
        />
      )}
    </>
  );
};

const ShareDialog = ({ documentType, documentId, testIdBase, onClose }) => {
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [title, setTitle] = useState('');
  const [recipients, setRecipients] = useState([]);
  const [email, setEmail] = useState('');
  const [name, setName] = useState('');
  const [subject, setSubject] = useState('');
  const [message, setMessage] = useState('');
  const [attachPdf, setAttachPdf] = useState(true);

  React.useEffect(() => {
    let active = true;
    (async () => {
      try {
        const { data } = await axios.get(`${API}/share/recipients`, {
          headers: HEAD(),
          params: { document_type: documentType, document_id: documentId },
        });
        if (!active) return;
        setTitle(data.title || 'Document');
        setSubject(data.title || 'Document');
        const recs = (data.recipients || []).filter((r) => r.email);
        setRecipients(recs);
        if (recs.length) { setEmail(recs[0].email); setName(recs[0].name || ''); }
      } catch (e) {
        if (active) { setTitle('Document'); setSubject('Document'); }
      } finally {
        if (active) setLoading(false);
      }
    })();
    return () => { active = false; };
  }, [documentType, documentId]);

  const pickRecipient = (r) => { setEmail(r.email); setName(r.name || ''); };

  const send = async () => {
    if (!email || !/^\S+@\S+\.\S+$/.test(email)) {
      toast.error('Enter a valid email address');
      return;
    }
    setSending(true);
    try {
      const { data } = await axios.post(`${API}/share`, {
        document_type: documentType,
        document_id: documentId,
        channel: 'email',
        recipient: { name, email },
        subject,
        message,
        attach_pdf: attachPdf,
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
      <DialogContent className="sm:max-w-md" data-testid={`share-dialog-${testIdBase}`}>
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
          <div className="space-y-4">
            <div className="text-sm text-slate-600">
              Sharing: <span className="font-medium text-slate-900">{title}</span>
            </div>

            {/* Channel selector — WhatsApp coming in Phase 2 */}
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

            {recipients.length > 0 && (
              <div className="space-y-1.5">
                <Label className="text-xs text-slate-500">Suggested recipients</Label>
                <div className="flex flex-wrap gap-1.5">
                  {recipients.map((r, i) => (
                    <button
                      key={i}
                      type="button"
                      onClick={() => pickRecipient(r)}
                      className={`text-xs px-2.5 py-1 rounded-full border transition-colors ${
                        email === r.email ? 'bg-teal-600 text-white border-teal-600' : 'bg-white text-slate-600 border-slate-200 hover:border-teal-400'
                      }`}
                      data-testid={`share-recipient-chip-${i}`}
                    >
                      {r.name || r.email} <span className="opacity-60">· {r.role}</span>
                    </button>
                  ))}
                </div>
              </div>
            )}

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label className="text-xs text-slate-500">Recipient name</Label>
                <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Name" data-testid="share-name-input" />
              </div>
              <div className="space-y-1">
                <Label className="text-xs text-slate-500">Email *</Label>
                <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="name@example.com" data-testid="share-email-input" />
              </div>
            </div>

            <div className="space-y-1">
              <Label className="text-xs text-slate-500">Subject</Label>
              <Input value={subject} onChange={(e) => setSubject(e.target.value)} data-testid="share-subject-input" />
            </div>

            <div className="space-y-1">
              <Label className="text-xs text-slate-500">Message (optional)</Label>
              <Textarea value={message} onChange={(e) => setMessage(e.target.value)} rows={3} placeholder="Add a short note…" data-testid="share-message-input" />
            </div>

            <div className="flex items-center justify-between rounded-lg bg-slate-50 px-3 py-2">
              <div className="text-sm text-slate-600">Attach PDF to email</div>
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
