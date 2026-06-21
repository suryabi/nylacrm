import React, { useEffect, useState } from 'react';
import axios from 'axios';
import { toast } from 'sonner';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from './ui/dialog';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { Label } from './ui/label';
import { Textarea } from './ui/textarea';
import { Checkbox } from './ui/checkbox';
import {
  Loader2, Mail, FileText, Presentation, Paperclip, X, Send,
} from 'lucide-react';
import CrmDocumentPicker from './gmail/CrmDocumentPicker';

const API = `${process.env.REACT_APP_BACKEND_URL}/api`;
const HEAD = () => ({ Authorization: `Bearer ${localStorage.getItem('token')}` });
const parseEmails = (s) => (s || '').split(/[,\n;]/).map((x) => x.trim()).filter(Boolean);

export const ShareDocumentsDialog = ({ open, onOpenChange, leadId, companyName, defaultTo = '' }) => {
  const [loading, setLoading] = useState(false);
  const [proposal, setProposal] = useState(null);
  const [deck, setDeck] = useState(null);

  const [includeProposal, setIncludeProposal] = useState(false);
  const [includeDeck, setIncludeDeck] = useState(false);
  const [files, setFiles] = useState([]);
  const [pickerOpen, setPickerOpen] = useState(false);

  const [to, setTo] = useState(defaultTo);
  const [cc, setCc] = useState('');
  const [subject, setSubject] = useState('');
  const [message, setMessage] = useState('');
  const [sending, setSending] = useState(false);

  useEffect(() => {
    if (!open) return;
    setLoading(true);
    setFiles([]);
    setTo(defaultTo);
    setCc('');
    setSubject(`Documents for ${companyName || 'your review'}`);
    setMessage(`Hi,\n\nPlease find the attached document(s) for ${companyName || 'your review'}.\n\nBest regards`);
    Promise.all([
      axios.get(`${API}/leads/${leadId}/proposal`, { headers: HEAD() }).then((r) => r.data.proposal).catch(() => null),
      axios.get(`${API}/gamma/generations`, { params: { source_type: 'lead', source_id: leadId, limit: 1 }, headers: HEAD() })
        .then((r) => (r.data.generations || [])[0] || null).catch(() => null),
    ]).then(([p, d]) => {
      setProposal(p);
      setDeck(d);
      const pOk = p && p.status === 'approved';
      const dOk = d && d.review_status === 'approved' && d.status === 'completed';
      setIncludeProposal(!!pOk);
      setIncludeDeck(!!dOk);
    }).finally(() => setLoading(false));
  }, [open, leadId, companyName, defaultTo]);

  const proposalApproved = proposal && proposal.status === 'approved';
  const deckApproved = deck && deck.review_status === 'approved' && deck.status === 'completed';

  const onPickFiles = (docs) => {
    setFiles((prev) => {
      const ids = new Set(prev.map((f) => f.id));
      return [...prev, ...docs.filter((d) => !ids.has(d.id))];
    });
  };
  const removeFile = (id) => setFiles((prev) => prev.filter((f) => f.id !== id));

  const attachmentCount = (includeProposal ? 1 : 0) + (includeDeck ? 1 : 0) + files.length;

  const send = async () => {
    const toList = parseEmails(to);
    if (toList.length === 0) { toast.error('Add at least one recipient'); return; }
    if (attachmentCount === 0) { toast.error('Select at least one document to attach'); return; }
    setSending(true);
    try {
      const r = await axios.post(`${API}/leads/${leadId}/share-documents`, {
        to_emails: toList,
        cc_emails: parseEmails(cc),
        subject,
        message,
        include_proposal: includeProposal,
        include_deck: includeDeck,
        document_ids: files.map((f) => f.id),
      }, { headers: HEAD() });
      toast.success(r.data.message || 'Documents sent');
      onOpenChange(false);
    } catch (e) {
      toast.error(e.response?.data?.detail || 'Failed to send');
    } finally {
      setSending(false);
    }
  };

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="sm:max-w-[640px] max-h-[90vh] overflow-y-auto" data-testid="share-documents-dialog">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Mail className="h-5 w-5" /> Share via Email
            </DialogTitle>
          </DialogHeader>

          {loading ? (
            <div className="flex items-center justify-center py-10"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>
          ) : (
            <div className="space-y-4">
              {/* Attachments */}
              <div className="space-y-2">
                <Label className="text-sm">Attachments</Label>
                <label className={`flex items-center gap-3 p-3 rounded-lg border ${proposalApproved ? 'cursor-pointer hover:bg-muted/40' : 'opacity-50'}`}>
                  <Checkbox checked={includeProposal} disabled={!proposalApproved}
                    onCheckedChange={(v) => setIncludeProposal(!!v)} data-testid="share-include-proposal" />
                  <FileText className="h-5 w-5 text-red-500" />
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium truncate">{proposal?.file_name || 'Proposal'}</p>
                    <p className="text-xs text-muted-foreground">
                      {proposalApproved ? 'Approved proposal PDF' : 'No approved proposal available'}
                    </p>
                  </div>
                </label>
                <label className={`flex items-center gap-3 p-3 rounded-lg border ${deckApproved ? 'cursor-pointer hover:bg-muted/40' : 'opacity-50'}`}>
                  <Checkbox checked={includeDeck} disabled={!deckApproved}
                    onCheckedChange={(v) => setIncludeDeck(!!v)} data-testid="share-include-deck" />
                  <Presentation className="h-5 w-5 text-indigo-600" />
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium truncate">{deck?.title || 'Deck'}</p>
                    <p className="text-xs text-muted-foreground">
                      {deckApproved ? 'Approved presentation (PDF)' : 'No approved deck available'}
                    </p>
                  </div>
                </label>

                {/* Picked files */}
                {files.map((f) => (
                  <div key={f.id} className="flex items-center gap-3 p-3 rounded-lg border bg-muted/30" data-testid={`share-file-${f.id}`}>
                    <Paperclip className="h-4 w-4 text-slate-500" />
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium truncate">{f.name}</p>
                      <p className="text-xs text-muted-foreground truncate">{f.file_name}</p>
                    </div>
                    <Button variant="ghost" size="sm" onClick={() => removeFile(f.id)} data-testid={`share-file-remove-${f.id}`}>
                      <X className="h-4 w-4" />
                    </Button>
                  </div>
                ))}

                <Button variant="outline" size="sm" onClick={() => setPickerOpen(true)} data-testid="share-attach-files-btn">
                  <Paperclip className="h-4 w-4 mr-1.5" /> Attach from Files &amp; Documents
                </Button>
              </div>

              {/* Recipients */}
              <div className="grid grid-cols-1 gap-3">
                <div className="space-y-1.5">
                  <Label className="text-sm">To <span className="text-red-500">*</span></Label>
                  <Input value={to} onChange={(e) => setTo(e.target.value)}
                    placeholder="email1@x.com, email2@y.com" data-testid="share-to-input" />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-sm">Cc</Label>
                  <Input value={cc} onChange={(e) => setCc(e.target.value)}
                    placeholder="Optional" data-testid="share-cc-input" />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-sm">Subject</Label>
                  <Input value={subject} onChange={(e) => setSubject(e.target.value)} data-testid="share-subject-input" />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-sm">Message</Label>
                  <Textarea value={message} onChange={(e) => setMessage(e.target.value)} rows={5} data-testid="share-message-input" />
                </div>
              </div>
            </div>
          )}

          <DialogFooter className="sm:justify-between">
            <span className="text-xs text-muted-foreground self-center">{attachmentCount} attachment(s)</span>
            <div className="flex gap-2">
              <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
              <Button onClick={send} disabled={sending || loading} data-testid="share-send-btn">
                {sending ? <Loader2 className="h-4 w-4 mr-1.5 animate-spin" /> : <Send className="h-4 w-4 mr-1.5" />}
                Send
              </Button>
            </div>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <CrmDocumentPicker
        open={pickerOpen}
        onOpenChange={setPickerOpen}
        onSelect={onPickFiles}
        alreadySelectedIds={files.map((f) => f.id)}
      />
    </>
  );
};

export default ShareDocumentsDialog;
