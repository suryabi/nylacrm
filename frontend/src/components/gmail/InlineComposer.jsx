import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { toast } from 'sonner';
import { Loader2, Send, X, Paperclip, FolderOpen, FileText } from 'lucide-react';
import { Button } from '../ui/button';
import { Input } from '../ui/input';
import { filesToAttachments, humanSize, htmlToText, isEmptyHtml } from './gmailUtils';
import RecipientField from './RecipientField';
import RichEmailEditor from './RichEmailEditor';
import CrmDocumentPicker from './CrmDocumentPicker';

const API_URL = process.env.REACT_APP_BACKEND_URL + '/api';
const authHeaders = () => ({ Authorization: `Bearer ${localStorage.getItem('token')}` });

/**
 * Inline (non-modal) email composer used for Compose, Reply and Reply-all.
 * Supports rich text, Cc/Bcc, local file uploads AND attaching documents
 * straight from the CRM's Files & Documents store.
 */
export default function InlineComposer({
  initialTo = '',
  toEditable = true,
  recipientLabel = '',
  initialSubject = '',
  replyToMessageId = null,
  threadId = null,
  onCancel,
  onSent,
  testid = 'inline-composer',
}) {
  const [to, setTo] = useState(initialTo);
  const [cc, setCc] = useState('');
  const [bcc, setBcc] = useState('');
  const [subject, setSubject] = useState(initialSubject);
  const [bodyHtml, setBodyHtml] = useState('');
  const [showCcBcc, setShowCcBcc] = useState(false);
  const [localFiles, setLocalFiles] = useState([]);
  const [crmDocs, setCrmDocs] = useState([]);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [sending, setSending] = useState(false);

  // Auto-append the user's saved signature (if enabled) to a fresh composer.
  useEffect(() => {
    let active = true;
    axios.get(`${API_URL}/gmail/signature`, { headers: authHeaders() })
      .then((res) => {
        const sig = res.data;
        if (active && sig?.enabled && sig?.html && isEmptyHtml(bodyHtml)) {
          setBodyHtml(`<p><br></p><p><br></p>${sig.html}`);
        }
      })
      .catch(() => {});
    return () => { active = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const send = async () => {
    if (toEditable && !to.trim()) { toast.error('Recipient is required'); return; }
    if (isEmptyHtml(bodyHtml)) { toast.error('Message body is required'); return; }
    setSending(true);
    try {
      const attachments = localFiles.length ? await filesToAttachments(localFiles) : undefined;
      await axios.post(`${API_URL}/gmail/send`, {
        to: toEditable ? to : initialTo,
        cc: cc || undefined,
        bcc: bcc || undefined,
        subject,
        body_html: bodyHtml,
        body_text: htmlToText(bodyHtml),
        reply_to_message_id: replyToMessageId,
        thread_id: threadId,
        attachments,
        crm_document_ids: crmDocs.length ? crmDocs.map((d) => d.id) : undefined,
      }, { headers: authHeaders() });
      toast.success('Email sent');
      onSent && onSent();
    } catch (e) {
      toast.error(e.response?.data?.detail || 'Failed to send email');
    } finally {
      setSending(false);
    }
  };

  const addCrmDocs = (docs) => {
    setCrmDocs((prev) => {
      const ids = new Set(prev.map((d) => d.id));
      return [...prev, ...docs.filter((d) => !ids.has(d.id))];
    });
  };

  return (
    <div className="rounded-xl border border-rose-200 bg-rose-50/30 p-3 sm:p-4 space-y-3" data-testid={testid}>
      {toEditable ? (
        <div className="flex items-start gap-2">
          <div className="flex-1"><RecipientField value={to} onChange={setTo} placeholder="To" testid={`${testid}-to`} /></div>
          {!showCcBcc && <Button type="button" variant="ghost" size="sm" className="text-xs text-muted-foreground shrink-0 mt-1" onClick={() => setShowCcBcc(true)} data-testid={`${testid}-show-ccbcc`}>Cc/Bcc</Button>}
        </div>
      ) : (
        <div className="flex items-center gap-2 text-sm">
          <span className="text-slate-500">To:</span>
          <span className="font-medium text-slate-800 truncate">{recipientLabel || initialTo}</span>
          {!showCcBcc && <button type="button" className="text-xs text-muted-foreground hover:text-slate-700 ml-auto shrink-0" onClick={() => setShowCcBcc(true)} data-testid={`${testid}-show-ccbcc`}>+ Cc/Bcc</button>}
        </div>
      )}

      {showCcBcc && (
        <>
          <RecipientField value={cc} onChange={setCc} placeholder="Cc" testid={`${testid}-cc`} />
          <RecipientField value={bcc} onChange={setBcc} placeholder="Bcc" testid={`${testid}-bcc`} />
        </>
      )}

      <Input placeholder="Subject" value={subject} onChange={(e) => setSubject(e.target.value)} data-testid={`${testid}-subject`} />
      <RichEmailEditor value={bodyHtml} onChange={setBodyHtml} />

      {(localFiles.length > 0 || crmDocs.length > 0) && (
        <div className="flex flex-wrap gap-2" data-testid={`${testid}-attachments`}>
          {localFiles.map((f, i) => (
            <span key={`l-${i}`} className="inline-flex items-center gap-1.5 text-xs bg-white border rounded px-2 py-1 text-slate-700">
              <Paperclip className="h-3 w-3" /> {f.name} <span className="text-slate-400">{humanSize(f.size)}</span>
              <button type="button" onClick={() => setLocalFiles(localFiles.filter((_, idx) => idx !== i))} className="text-slate-400 hover:text-rose-600"><X className="h-3 w-3" /></button>
            </span>
          ))}
          {crmDocs.map((d) => (
            <span key={`c-${d.id}`} className="inline-flex items-center gap-1.5 text-xs bg-white border rounded px-2 py-1 text-slate-700">
              <FileText className="h-3 w-3 text-rose-500" /> {d.name} <span className="text-slate-400">{humanSize(d.file_size)}</span>
              <button type="button" onClick={() => setCrmDocs(crmDocs.filter((x) => x.id !== d.id))} className="text-slate-400 hover:text-rose-600"><X className="h-3 w-3" /></button>
            </span>
          ))}
        </div>
      )}

      <div className="flex items-center justify-between gap-2 flex-wrap">
        <div className="flex items-center gap-3">
          <label className="inline-flex items-center gap-1.5 text-sm text-slate-600 hover:text-slate-900 cursor-pointer" data-testid={`${testid}-attach-local`}>
            <Paperclip className="h-4 w-4" /> Computer
            <input type="file" multiple className="hidden" onChange={(e) => { setLocalFiles([...localFiles, ...Array.from(e.target.files)]); e.target.value = ''; }} data-testid={`${testid}-attach-input`} />
          </label>
          <button type="button" className="inline-flex items-center gap-1.5 text-sm text-slate-600 hover:text-slate-900" onClick={() => setPickerOpen(true)} data-testid={`${testid}-attach-crm`}>
            <FolderOpen className="h-4 w-4" /> Files &amp; Documents
          </button>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={onCancel} data-testid={`${testid}-cancel`}>Cancel</Button>
          <Button size="sm" className="bg-rose-600 hover:bg-rose-700 text-white" onClick={send} disabled={sending} data-testid={`${testid}-send`}>
            {sending ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Send className="h-4 w-4 mr-2" />} Send
          </Button>
        </div>
      </div>

      <CrmDocumentPicker open={pickerOpen} onOpenChange={setPickerOpen} onSelect={addCrmDocs} alreadySelectedIds={crmDocs.map((d) => d.id)} />
    </div>
  );
}
