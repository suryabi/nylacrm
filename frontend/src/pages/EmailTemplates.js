/**
 * Email Templates management page.
 *
 * Lists the current user's templates and every public template across the
 * tenant. Owners can edit / delete / toggle public; others can preview and
 * "use as starting point" (server clone) to get a private editable copy.
 */
import React, { useEffect, useState } from 'react';
import axios from 'axios';
import { toast } from 'sonner';
import { Plus, Pencil, Trash2, Globe, Lock, Copy, FileText, X, Save, Loader2, Paperclip } from 'lucide-react';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Label } from '../components/ui/label';
import { Card } from '../components/ui/card';
import { Badge } from '../components/ui/badge';
import { Switch } from '../components/ui/switch';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '../components/ui/dialog';
import RichEmailEditor from '../components/gmail/RichEmailEditor';
import CrmDocumentPicker from '../components/gmail/CrmDocumentPicker';
import { humanSize } from '../components/gmail/gmailUtils';

const API_URL = process.env.REACT_APP_BACKEND_URL + '/api';
const authHeaders = () => ({ Authorization: `Bearer ${localStorage.getItem('token') || localStorage.getItem('session_token')}` });

// Variables a template author can reference inside subject + body. The
// resolver lives server-side (`_resolve_variables` in email_templates.py) and
// stays in sync with this list.
const AVAILABLE_VARS = [
  { tag: '{{contact_name}}', desc: 'Recipient name (lead contact / account contact / contact)' },
  { tag: '{{company}}', desc: 'Lead company / account name (whichever applies)' },
  { tag: '{{account_name}}', desc: 'Account name' },
  { tag: '{{lead_company}}', desc: 'Lead company name' },
  { tag: '{{city}}', desc: 'Entity city' },
  { tag: '{{state}}', desc: 'Entity state' },
  { tag: '{{my_name}}', desc: 'Your name (the signed-in user)' },
  { tag: '{{my_email}}', desc: 'Your email' },
  { tag: '{{today}}', desc: 'Today\u2019s date (e.g. 16 Jun 2026)' },
];

const empty = () => ({ name: '', subject: '', body_html: '', is_public: false, crm_document_ids: [] });

export default function EmailTemplates() {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState(null);   // template doc or empty()
  const [pickerOpen, setPickerOpen] = useState(false);
  const [attachmentDocs, setAttachmentDocs] = useState([]); // hydrated header info for the editing template's docs
  const [saving, setSaving] = useState(false);

  const refresh = async () => {
    setLoading(true);
    try {
      const { data } = await axios.get(`${API_URL}/email-templates`, { headers: authHeaders() });
      setItems(Array.isArray(data) ? data : []);
    } catch (e) { toast.error('Failed to load templates'); }
    finally { setLoading(false); }
  };
  useEffect(() => { refresh(); }, []);

  // When opening the editor, hydrate the attachment chips by fetching headers
  // for any pre-attached CRM document ids.
  const openEditor = async (tpl) => {
    setEditing(tpl || empty());
    const ids = (tpl?.crm_document_ids) || [];
    if (ids.length === 0) { setAttachmentDocs([]); return; }
    try {
      // Reuse the /api/documents list endpoint to fetch headers in one call.
      const { data } = await axios.get(`${API_URL}/documents`, { headers: authHeaders() });
      const all = Array.isArray(data) ? data : (data?.documents || []);
      setAttachmentDocs(all.filter((d) => ids.includes(d.id)));
    } catch { setAttachmentDocs([]); }
  };

  const save = async () => {
    if (!editing.name?.trim()) { toast.error('Template name is required'); return; }
    setSaving(true);
    try {
      const payload = {
        name: editing.name.trim(),
        subject: editing.subject || '',
        body_html: editing.body_html || '',
        is_public: !!editing.is_public,
        crm_document_ids: attachmentDocs.map((d) => d.id),
      };
      if (editing.id) {
        await axios.put(`${API_URL}/email-templates/${editing.id}`, payload, { headers: authHeaders() });
        toast.success('Template updated');
      } else {
        await axios.post(`${API_URL}/email-templates`, payload, { headers: authHeaders() });
        toast.success('Template created');
      }
      setEditing(null);
      setAttachmentDocs([]);
      refresh();
    } catch (e) {
      toast.error(e.response?.data?.detail || 'Failed to save template');
    } finally { setSaving(false); }
  };

  const remove = async (tpl) => {
    if (!window.confirm(`Delete template "${tpl.name}"?`)) return;
    try {
      await axios.delete(`${API_URL}/email-templates/${tpl.id}`, { headers: authHeaders() });
      toast.success('Template deleted');
      refresh();
    } catch (e) { toast.error(e.response?.data?.detail || 'Failed to delete'); }
  };

  const clone = async (tpl) => {
    try {
      const { data } = await axios.post(`${API_URL}/email-templates/${tpl.id}/clone`, {}, { headers: authHeaders() });
      toast.success('Saved as private copy');
      refresh();
      openEditor(data);
    } catch (e) { toast.error(e.response?.data?.detail || 'Failed to clone'); }
  };

  const insertVarAt = (tag) => {
    setEditing((p) => ({ ...p, subject: (p.subject || '') + tag }));
  };

  return (
    <div className="p-6 space-y-5" data-testid="email-templates-page">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">Email Templates</h1>
          <p className="text-sm text-slate-500">Save reusable emails with variables and attachments. Mark a template public to share it with the rest of the team.</p>
        </div>
        <Button onClick={() => openEditor(null)} className="bg-rose-600 hover:bg-rose-700 text-white" data-testid="new-template-btn">
          <Plus className="h-4 w-4 mr-1" /> New Template
        </Button>
      </div>

      {loading ? (
        <div className="text-sm text-muted-foreground py-8 text-center">Loading…</div>
      ) : items.length === 0 ? (
        <Card className="p-10 text-center text-sm text-slate-500">
          No templates yet. Click <span className="font-medium">New Template</span> to create your first one.
        </Card>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {items.map((t) => (
            <Card key={t.id} className="p-4 flex flex-col gap-3" data-testid={`template-card-${t.id}`}>
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <div className="font-medium truncate" title={t.name}>{t.name}</div>
                  <div className="text-xs text-slate-500 truncate" title={t.subject}>{t.subject || <em>No subject</em>}</div>
                </div>
                {t.is_public ? (
                  <Badge className="bg-emerald-100 text-emerald-700 border border-emerald-200 text-[10px] uppercase tracking-wider"><Globe className="h-3 w-3 mr-1" />Public</Badge>
                ) : (
                  <Badge className="bg-slate-100 text-slate-700 border border-slate-200 text-[10px] uppercase tracking-wider"><Lock className="h-3 w-3 mr-1" />Private</Badge>
                )}
              </div>
              <div className="text-[11px] text-slate-500 flex items-center gap-2">
                <span>by {t.owner_name || 'someone'}</span>
                {(t.crm_document_ids || []).length > 0 && (
                  <span className="inline-flex items-center gap-0.5"><Paperclip className="h-3 w-3" />{t.crm_document_ids.length}</span>
                )}
              </div>
              <div className="flex items-center gap-1 pt-2 border-t mt-auto">
                {t.is_mine ? (
                  <>
                    <Button size="sm" variant="ghost" onClick={() => openEditor(t)} data-testid={`edit-${t.id}`}>
                      <Pencil className="h-4 w-4 mr-1" /> Edit
                    </Button>
                    <Button size="sm" variant="ghost" className="text-rose-600 hover:text-rose-700 hover:bg-rose-50 ml-auto" onClick={() => remove(t)} data-testid={`delete-${t.id}`}>
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </>
                ) : (
                  <Button size="sm" variant="ghost" onClick={() => clone(t)} data-testid={`clone-${t.id}`}>
                    <Copy className="h-4 w-4 mr-1" /> Save a copy
                  </Button>
                )}
              </div>
            </Card>
          ))}
        </div>
      )}

      {/* Editor dialog */}
      <Dialog open={!!editing} onOpenChange={(v) => { if (!v) { setEditing(null); setAttachmentDocs([]); } }}>
        <DialogContent className="max-w-3xl max-h-[92vh] overflow-y-auto" data-testid="template-editor-dialog">
          <DialogHeader>
            <DialogTitle>{editing?.id ? 'Edit template' : 'New template'}</DialogTitle>
            <DialogDescription>Use <code className="text-[11px] bg-slate-100 px-1 rounded">{'{{variable}}'}</code> placeholders. They auto-fill from the lead / account / contact when the template is used.</DialogDescription>
          </DialogHeader>

          {editing && (
            <div className="space-y-4">
              <div>
                <Label className="text-xs">Template name</Label>
                <Input
                  value={editing.name}
                  onChange={(e) => setEditing({ ...editing, name: e.target.value })}
                  placeholder="e.g. Intro to Nyla"
                  data-testid="tpl-name"
                />
              </div>
              <div>
                <Label className="text-xs">Subject</Label>
                <Input
                  value={editing.subject}
                  onChange={(e) => setEditing({ ...editing, subject: e.target.value })}
                  placeholder="Welcome {{contact_name}} – introducing Nyla"
                  data-testid="tpl-subject"
                />
              </div>
              <div>
                <Label className="text-xs">Body</Label>
                <RichEmailEditor
                  value={editing.body_html}
                  onChange={(html) => setEditing({ ...editing, body_html: html })}
                />
              </div>

              {/* Variable chips */}
              <div>
                <Label className="text-xs mb-1.5 block">Insert a variable</Label>
                <div className="flex flex-wrap gap-1.5">
                  {AVAILABLE_VARS.map((v) => (
                    <button
                      key={v.tag}
                      type="button"
                      className="text-[11px] font-mono bg-slate-100 hover:bg-slate-200 text-slate-700 rounded px-1.5 py-0.5"
                      title={v.desc}
                      onClick={() => insertVarAt(v.tag)}
                      data-testid={`insert-var-${v.tag.replace(/[^a-z]/gi, '')}`}
                    >
                      {v.tag}
                    </button>
                  ))}
                </div>
                <p className="text-[11px] text-slate-400 mt-1">Click to append to the subject. You can also type the variable anywhere in the body.</p>
              </div>

              {/* Attachments */}
              <div className="rounded-md border bg-slate-50/40 p-3">
                <div className="flex items-center justify-between mb-2">
                  <Label className="text-xs">Default attachments</Label>
                  <Button size="sm" variant="outline" onClick={() => setPickerOpen(true)} data-testid="tpl-attach-btn">
                    <Paperclip className="h-3.5 w-3.5 mr-1" /> Add from Files &amp; Documents
                  </Button>
                </div>
                {attachmentDocs.length === 0 ? (
                  <p className="text-[11px] text-slate-500 italic">No default attachments. Files added here will be pre-checked when the template is used in the email composer (the user can untick before sending).</p>
                ) : (
                  <div className="flex flex-wrap gap-2">
                    {attachmentDocs.map((d) => (
                      <span key={d.id} className="inline-flex items-center gap-1.5 text-xs bg-white border rounded px-2 py-1 text-slate-700">
                        <FileText className="h-3 w-3 text-rose-500" /> {d.name} <span className="text-slate-400">{humanSize(d.file_size)}</span>
                        <button type="button" onClick={() => setAttachmentDocs((p) => p.filter((x) => x.id !== d.id))} className="text-slate-400 hover:text-rose-600"><X className="h-3 w-3" /></button>
                      </span>
                    ))}
                  </div>
                )}
              </div>

              {/* Visibility */}
              <div className="flex items-center gap-3 rounded-md border bg-white p-3">
                <Switch
                  checked={!!editing.is_public}
                  onCheckedChange={(v) => setEditing({ ...editing, is_public: v })}
                  data-testid="tpl-public-switch"
                />
                <div className="flex-1">
                  <div className="text-sm font-medium flex items-center gap-1.5">
                    {editing.is_public ? <Globe className="h-4 w-4 text-emerald-600" /> : <Lock className="h-4 w-4 text-slate-500" />}
                    {editing.is_public ? 'Public — visible to your whole team' : 'Private — only you can see this'}
                  </div>
                  <div className="text-[11px] text-slate-500">Teammates with a public template can still save their own copy to tweak.</div>
                </div>
              </div>
            </div>
          )}

          <DialogFooter>
            <Button variant="outline" onClick={() => { setEditing(null); setAttachmentDocs([]); }} data-testid="tpl-cancel">Cancel</Button>
            <Button onClick={save} disabled={saving} className="bg-rose-600 hover:bg-rose-700 text-white" data-testid="tpl-save">
              {saving ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : <Save className="h-4 w-4 mr-1" />}
              {editing?.id ? 'Save changes' : 'Create template'}
            </Button>
          </DialogFooter>

          <CrmDocumentPicker
            open={pickerOpen}
            onOpenChange={setPickerOpen}
            onSelect={(docs) => {
              setAttachmentDocs((prev) => {
                const ids = new Set(prev.map((d) => d.id));
                return [...prev, ...docs.filter((d) => !ids.has(d.id))];
              });
            }}
            alreadySelectedIds={attachmentDocs.map((d) => d.id)}
          />
        </DialogContent>
      </Dialog>
    </div>
  );
}
