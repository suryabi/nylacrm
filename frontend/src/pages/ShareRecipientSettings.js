import React, { useEffect, useState } from 'react';
import axios from 'axios';
import { toast } from 'sonner';
import { Share2, Loader2, X, Plus, Save, Lock, UserCog } from 'lucide-react';
import { Button } from '../components/ui/button';
import { Card, CardContent } from '../components/ui/card';
import { Input } from '../components/ui/input';
import { Label } from '../components/ui/label';
import { Switch } from '../components/ui/switch';

const API = `${process.env.REACT_APP_BACKEND_URL}/api`;
const HEAD = () => {
  const t = localStorage.getItem('token');
  return t ? { Authorization: `Bearer ${t}` } : {};
};
const isEmail = (e) => /^\S+@\S+\.\S+$/.test(e || '');

/** Editable list of fixed default recipients (email + optional name). */
const EmailList = ({ list, setList, placeholder, testId }) => {
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const add = () => {
    if (!isEmail(email)) { toast.error('Enter a valid email'); return; }
    if (list.some((r) => (r.email || '').toLowerCase() === email.toLowerCase())) return;
    setList([...list, { name: name.trim(), email: email.trim(), role: 'Configured' }]);
    setName(''); setEmail('');
  };
  return (
    <div className="space-y-2">
      <div className="flex flex-wrap gap-1.5">
        {list.length === 0 && <span className="text-xs text-slate-400">None</span>}
        {list.map((r, i) => (
          <span key={i} className="inline-flex items-center gap-1 text-xs px-2 py-1 rounded-full bg-teal-50 text-teal-800 border border-teal-200">
            {r.name ? `${r.name} ` : ''}<span className="opacity-70">{r.email}</span>
            <button type="button" onClick={() => setList(list.filter((_, j) => j !== i))} className="hover:text-rose-600"
              data-testid={`${testId}-remove-${i}`}>
              <X className="h-3 w-3" />
            </button>
          </span>
        ))}
      </div>
      <div className="flex gap-1.5">
        <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Name (optional)" className="h-8 text-sm w-32" data-testid={`${testId}-name`} />
        <Input value={email} onChange={(e) => setEmail(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); add(); } }}
          placeholder={placeholder} className="h-8 text-sm flex-1" data-testid={`${testId}-email`} />
        <Button type="button" size="sm" variant="outline" className="h-8 px-2" onClick={add} data-testid={`${testId}-add`}>
          <Plus className="h-3.5 w-3.5" />
        </Button>
      </div>
    </div>
  );
};

const PolicyCard = ({ dt, onSaved }) => {
  const [defaultTo, setDefaultTo] = useState(dt.policy.default_to || []);
  const [defaultCc, setDefaultCc] = useState(dt.policy.default_cc || []);
  const [defaultBcc, setDefaultBcc] = useState(dt.policy.default_bcc || []);
  const [ccManager, setCcManager] = useState(!!dt.policy.cc_manager);
  const [saving, setSaving] = useState(false);

  const lockedEmails = new Set(); // locked = the default_cc emails marked non-removable in the dialog
  (dt.policy.locked || []).forEach((e) => lockedEmails.add(e));

  const save = async () => {
    setSaving(true);
    try {
      await axios.put(`${API}/share/policies/${dt.document_type}`, {
        default_to: defaultTo,
        default_cc: defaultCc,
        default_bcc: defaultBcc,
        cc_manager: ccManager,
        // Lock all configured CC entries so users can't remove mandatory CCs.
        locked: defaultCc.map((r) => r.email),
      }, { headers: HEAD() });
      toast.success(`Saved recipient rules for ${dt.label}`);
      onSaved && onSaved();
    } catch (e) {
      toast.error(e.response?.data?.detail || 'Failed to save');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Card data-testid={`policy-card-${dt.document_type}`}>
      <CardContent className="p-5 space-y-4">
        <div>
          <div className="flex items-center gap-2">
            <h3 className="font-semibold text-slate-900">{dt.label}</h3>
            <span className="text-[10px] font-mono text-slate-400">{dt.document_type}</span>
          </div>
          <p className="text-xs text-slate-500 mt-0.5">{dt.description}</p>
          {dt.sources?.length > 0 && (
            <p className="text-[11px] text-slate-400 mt-1">Auto-suggested from: {dt.sources.join(', ')}</p>
          )}
        </div>

        <div className="flex items-center justify-between rounded-lg bg-slate-50 px-3 py-2">
          <div className="flex items-center gap-2 text-sm text-slate-700">
            <UserCog className="h-4 w-4 text-slate-500" /> Always CC the sender's reporting manager
          </div>
          <Switch checked={ccManager} onCheckedChange={setCcManager} data-testid={`policy-ccmanager-${dt.document_type}`} />
        </div>

        <div className="space-y-1.5">
          <Label className="text-xs text-slate-500 uppercase tracking-wide">Always add to "To"</Label>
          <EmailList list={defaultTo} setList={setDefaultTo} placeholder="default-to@example.com" testId={`policy-to-${dt.document_type}`} />
        </div>

        <div className="space-y-1.5">
          <Label className="text-xs text-slate-500 uppercase tracking-wide flex items-center gap-1">
            Always CC <Lock className="h-3 w-3 text-slate-400" /> <span className="normal-case text-slate-400 text-[11px]">(locked — users can't remove)</span>
          </Label>
          <EmailList list={defaultCc} setList={setDefaultCc} placeholder="accounts@example.com" testId={`policy-cc-${dt.document_type}`} />
        </div>

        <div className="space-y-1.5">
          <Label className="text-xs text-slate-500 uppercase tracking-wide">Always Bcc</Label>
          <EmailList list={defaultBcc} setList={setDefaultBcc} placeholder="archive@example.com" testId={`policy-bcc-${dt.document_type}`} />
        </div>

        <div className="flex justify-end">
          <Button onClick={save} disabled={saving} className="bg-teal-700 hover:bg-teal-800" data-testid={`policy-save-${dt.document_type}`}>
            {saving ? <Loader2 className="h-4 w-4 mr-1.5 animate-spin" /> : <Save className="h-4 w-4 mr-1.5" />} Save
          </Button>
        </div>
      </CardContent>
    </Card>
  );
};

export default function ShareRecipientSettings() {
  const [loading, setLoading] = useState(true);
  const [types, setTypes] = useState([]);
  const [forbidden, setForbidden] = useState(false);

  const load = async () => {
    setLoading(true);
    try {
      const { data } = await axios.get(`${API}/share/policies`, { headers: HEAD() });
      setTypes(data.document_types || []);
    } catch (e) {
      if (e.response?.status === 403) setForbidden(true);
      else toast.error('Failed to load sharing policies');
    } finally {
      setLoading(false);
    }
  };
  useEffect(() => { load(); }, []);

  return (
    <div className="max-w-3xl mx-auto p-6 space-y-6" data-testid="share-recipient-settings">
      <div className="flex items-center gap-3">
        <div className="h-10 w-10 rounded-xl bg-teal-50 flex items-center justify-center">
          <Share2 className="h-5 w-5 text-teal-700" />
        </div>
        <div>
          <h1 className="text-xl font-semibold text-slate-900">Document Sharing — Recipients</h1>
          <p className="text-sm text-slate-500">Configure default To / CC recipients per document type. These apply on top of the auto-suggested contacts in every share dialog.</p>
        </div>
      </div>

      {loading ? (
        <div className="py-16 flex justify-center text-slate-400"><Loader2 className="h-6 w-6 animate-spin" /></div>
      ) : forbidden ? (
        <Card><CardContent className="p-8 text-center text-slate-500">Admin or CEO access is required to configure sharing recipients.</CardContent></Card>
      ) : (
        <div className="space-y-4">
          {types.map((dt) => (
            <PolicyCard key={dt.document_type} dt={dt} onSaved={load} />
          ))}
        </div>
      )}
    </div>
  );
}
