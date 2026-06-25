import React, { useEffect, useState } from 'react';
import axios from 'axios';
import { toast } from 'sonner';
import { Plus, Trash2, Save, Pencil, Bell, X } from 'lucide-react';
import { Card } from '../components/ui/card';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Label } from '../components/ui/label';
import { Textarea } from '../components/ui/textarea';
import { Badge } from '../components/ui/badge';
import AppBreadcrumb from '../components/AppBreadcrumb';

const API = `${process.env.REACT_APP_BACKEND_URL}/api`;
const authHeaders = () => ({ Authorization: `Bearer ${localStorage.getItem('token')}` });

const blank = () => ({ name: '', description: '', subject: '', body: '' });

export default function NotificationTemplates() {
  const [templates, setTemplates] = useState([]);
  const [variables, setVariables] = useState([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState(null); // {id?, ...fields}
  const [saving, setSaving] = useState(false);

  const load = async () => {
    setLoading(true);
    try {
      const res = await axios.get(`${API}/notification-templates`, { headers: authHeaders() });
      setTemplates(res.data?.templates || []);
      setVariables(res.data?.variables || []);
    } catch (e) {
      toast.error(e?.response?.data?.detail || 'Failed to load templates');
    } finally {
      setLoading(false);
    }
  };
  useEffect(() => { load(); }, []);

  const save = async () => {
    if (!editing?.name?.trim()) { toast.error('Template name is required'); return; }
    setSaving(true);
    try {
      const payload = { name: editing.name, description: editing.description, subject: editing.subject, body: editing.body };
      if (editing.id) {
        await axios.put(`${API}/notification-templates/${editing.id}`, payload, { headers: authHeaders() });
        toast.success('Template updated');
      } else {
        await axios.post(`${API}/notification-templates`, payload, { headers: authHeaders() });
        toast.success('Template created');
      }
      setEditing(null);
      await load();
    } catch (e) {
      toast.error(e?.response?.data?.detail || 'Failed to save template');
    } finally {
      setSaving(false);
    }
  };

  const remove = async (id) => {
    if (!window.confirm('Delete this template?')) return;
    try {
      await axios.delete(`${API}/notification-templates/${id}`, { headers: authHeaders() });
      toast.success('Template deleted');
      await load();
    } catch (e) {
      toast.error(e?.response?.data?.detail || 'Failed to delete template');
    }
  };

  const insertVar = (key) => {
    setEditing((p) => ({ ...p, body: `${p.body || ''}{{${key}}}` }));
  };

  return (
    <div className="p-4 md:p-6 max-w-5xl mx-auto" data-testid="notification-templates-page">
      <AppBreadcrumb items={[{ label: 'Admin' }, { label: 'Notification Templates' }]} />
      <div className="flex items-center justify-between mt-3 mb-5">
        <div className="flex items-center gap-2">
          <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-indigo-600 text-white"><Bell className="h-5 w-5" /></span>
          <div>
            <h1 className="text-xl font-bold tracking-tight text-slate-800">Notification Templates</h1>
            <p className="text-sm text-slate-500">Reusable messages for workflow notifications. Use <code className="text-xs">{'{{placeholders}}'}</code> that fill in at send time.</p>
          </div>
        </div>
        {!editing && (
          <Button onClick={() => setEditing(blank())} className="bg-indigo-600 hover:bg-indigo-700" data-testid="new-template-btn">
            <Plus className="h-4 w-4 mr-1.5" /> New Template
          </Button>
        )}
      </div>

      {editing ? (
        <Card className="p-4 space-y-4" data-testid="template-editor">
          <div className="flex items-center justify-between">
            <h2 className="font-semibold text-slate-700">{editing.id ? 'Edit Template' : 'New Template'}</h2>
            <Button size="sm" variant="ghost" onClick={() => setEditing(null)}><X className="h-4 w-4" /></Button>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div>
              <Label className="text-xs text-slate-500">Name</Label>
              <Input value={editing.name} onChange={(e) => setEditing({ ...editing, name: e.target.value })} placeholder="e.g. Approval granted" data-testid="template-name-input" />
            </div>
            <div>
              <Label className="text-xs text-slate-500">Description (optional)</Label>
              <Input value={editing.description || ''} onChange={(e) => setEditing({ ...editing, description: e.target.value })} placeholder="When this template is used" data-testid="template-description-input" />
            </div>
          </div>
          <div>
            <Label className="text-xs text-slate-500">Subject / Title</Label>
            <Input value={editing.subject || ''} onChange={(e) => setEditing({ ...editing, subject: e.target.value })} placeholder="{{request_number}}: {{to_state}}" data-testid="template-subject-input" />
          </div>
          <div>
            <Label className="text-xs text-slate-500">Message</Label>
            <Textarea rows={5} value={editing.body || ''} onChange={(e) => setEditing({ ...editing, body: e.target.value })} placeholder={'Hi {{requestor_name}}, "{{title}}" was {{action}} to {{to_state}} by {{actor_name}}.'} data-testid="template-body-input" />
          </div>
          {variables.length > 0 && (
            <div>
              <div className="text-xs text-slate-500 mb-1">Available variables (click to insert):</div>
              <div className="flex flex-wrap gap-1.5">
                {variables.map((v) => (
                  <button key={v.key} type="button" onClick={() => insertVar(v.key)} className="rounded-full border border-indigo-200 bg-indigo-50 text-indigo-700 px-2 py-0.5 text-[11px] hover:bg-indigo-100" title={v.label} data-testid={`var-${v.key}`}>
                    {`{{${v.key}}}`}
                  </button>
                ))}
              </div>
            </div>
          )}
          <div className="flex justify-end gap-2 pt-2">
            <Button variant="outline" onClick={() => setEditing(null)} disabled={saving}>Cancel</Button>
            <Button onClick={save} disabled={saving} className="bg-indigo-600 hover:bg-indigo-700" data-testid="save-template-btn">
              <Save className="h-4 w-4 mr-1.5" /> {saving ? 'Saving…' : 'Save Template'}
            </Button>
          </div>
        </Card>
      ) : loading ? (
        <p className="text-sm text-slate-400">Loading…</p>
      ) : templates.length === 0 ? (
        <Card className="p-8 text-center text-slate-400" data-testid="templates-empty">
          No templates yet. Create one to reuse it across state-machine transition notifications.
        </Card>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {templates.map((t) => (
            <Card key={t.id} className="p-4" data-testid={`template-card-${t.id}`}>
              <div className="flex items-start justify-between">
                <div className="min-w-0">
                  <h3 className="font-semibold text-slate-800 truncate">{t.name}</h3>
                  {t.description && <p className="text-xs text-slate-500 mt-0.5">{t.description}</p>}
                </div>
                <div className="flex gap-1 shrink-0">
                  <Button size="sm" variant="ghost" className="h-7 w-7 p-0" onClick={() => setEditing(t)} data-testid={`edit-template-${t.id}`}><Pencil className="h-3.5 w-3.5" /></Button>
                  <Button size="sm" variant="ghost" className="h-7 w-7 p-0 text-red-600" onClick={() => remove(t.id)} data-testid={`delete-template-${t.id}`}><Trash2 className="h-3.5 w-3.5" /></Button>
                </div>
              </div>
              {t.subject && <Badge className="mt-2 bg-slate-100 text-slate-600 font-normal">{t.subject}</Badge>}
              {t.body && <p className="text-xs text-slate-500 mt-2 line-clamp-3 whitespace-pre-wrap">{t.body}</p>}
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
