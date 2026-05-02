/* Full-page form for creating a new Marketing Request.
 * UX intentionally mirrors Tasks / Requests (dedicated page, card-based sections)
 * rather than a cramped modal, because the form now carries several decisions
 * (type, approval path, lead linking, reference links, priority, due date).
 */
import React, { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import axios from 'axios';
import { toast } from 'sonner';
import {
  ArrowLeft, Sparkles, Tag, Calendar, Users, X, Plus, Loader2,
  CheckCircle2, Link as LinkIcon,
} from 'lucide-react';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Textarea } from '../components/ui/textarea';
import { Label } from '../components/ui/label';
import { Badge } from '../components/ui/badge';
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from '../components/ui/select';

const API = process.env.REACT_APP_BACKEND_URL + '/api';
const OTHER_TYPE = '__other__';

function SectionCard({ icon: Icon, title, hint, children, accent = 'slate' }) {
  const tones = {
    slate:   'border-slate-200',
    indigo:  'border-indigo-200 bg-gradient-to-br from-indigo-50/40 to-white',
    emerald: 'border-emerald-200 bg-gradient-to-br from-emerald-50/30 to-white',
  };
  return (
    <div className={`rounded-2xl border-2 ${tones[accent]} bg-white p-5`}>
      <div className="flex items-center gap-2 mb-1">
        {Icon && <Icon className="h-4 w-4 text-indigo-600" />}
        <h3 className="text-sm font-semibold text-slate-800">{title}</h3>
      </div>
      {hint && <p className="text-[11px] text-slate-500 mb-3">{hint}</p>}
      <div className="mt-3">{children}</div>
    </div>
  );
}

export default function NewMarketingRequest() {
  const navigate = useNavigate();
  const [types, setTypes] = useState([]);
  const [departments, setDepartments] = useState([]);
  const [leadOptions, setLeadOptions] = useState([]);
  const [leadSearch, setLeadSearch] = useState('');
  const [saving, setSaving] = useState(false);

  const [form, setForm] = useState({
    request_type_id: '',
    custom_request_type: '',
    description: '',
    priority: 'medium',
    due_date: '',
    assigned_to_department: 'Marketing',
    lead_id: '',
    approval_type: 'internal',
    reference_links: [],
  });

  const [linkLabel, setLinkLabel] = useState('');
  const [linkUrl, setLinkUrl] = useState('');

  useEffect(() => {
    (async () => {
      try {
        const [t, d, l] = await Promise.all([
          axios.get(`${API}/master-request-types`),
          axios.get(`${API}/marketing-requests/lookups/departments`),
          axios.get(`${API}/leads`, { params: { limit: 500 } }).catch(() => ({ data: [] })),
        ]);
        setTypes(t.data || []);
        setDepartments(d.data || []);
        const raw = l.data;
        const leads = Array.isArray(raw) ? raw : (raw?.data || raw?.leads || raw?.items || []);
        setLeadOptions(leads.map((x) => {
          const label = x.company || x.company_name || x.business_name || x.name || x.contact_name || x.hotel_name || 'Untitled Lead';
          const sub = x.contact_name || x.name || x.city || x.status || '';
          return { id: x.id, label: sub && sub !== label ? `${label} · ${sub}` : label };
        }));
      } catch {}
    })();
  }, []);

  const isOther = form.request_type_id === OTHER_TYPE;
  const selectedLead = useMemo(() => leadOptions.find((l) => l.id === form.lead_id), [leadOptions, form.lead_id]);

  const filteredLeads = useMemo(() => {
    const q = leadSearch.trim().toLowerCase();
    return q ? leadOptions.filter((l) => l.label.toLowerCase().includes(q)) : leadOptions;
  }, [leadOptions, leadSearch]);

  const addLink = () => {
    if (!linkUrl.trim() || !linkLabel.trim()) return;
    setForm((p) => ({
      ...p,
      reference_links: [...p.reference_links, { label: linkLabel, url: linkUrl, kind: 'reference' }],
    }));
    setLinkLabel(''); setLinkUrl('');
  };

  const submit = async () => {
    if (!form.request_type_id) { toast.error('Please choose a request type'); return; }
    if (isOther && !form.custom_request_type.trim()) { toast.error('Please specify the request type'); return; }
    setSaving(true);
    try {
      const payload = {
        description: form.description,
        priority: form.priority,
        due_date: form.due_date || null,
        assigned_to_department: form.assigned_to_department,
        lead_ids: form.lead_id ? [form.lead_id] : [],
        reference_links: form.reference_links,
        approval_type: form.approval_type,
      };
      if (isOther) payload.custom_request_type = form.custom_request_type.trim();
      else payload.request_type_id = form.request_type_id;
      const { data } = await axios.post(`${API}/marketing-requests`, payload);
      toast.success('Marketing request created');
      navigate(`/marketing-requests/${data.id}`);
    } catch (e) {
      toast.error(e?.response?.data?.detail || 'Failed to create request');
    } finally { setSaving(false); }
  };

  return (
    <div className="max-w-4xl mx-auto px-4 sm:px-6 py-6 space-y-5" data-testid="new-marketing-request-page">
      {/* Header */}
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0">
          <Link to="/marketing-requests" className="text-xs text-slate-500 hover:text-slate-700 inline-flex items-center gap-1 mb-1">
            <ArrowLeft className="h-3 w-3" /> Back to requests
          </Link>
          <h1 className="text-2xl sm:text-3xl font-bold text-slate-900 flex items-center gap-2">
            <Sparkles className="h-6 w-6 text-indigo-500" /> New Marketing Request
          </h1>
          <p className="text-sm text-slate-500 mt-1">Tell the marketing team what you need. They'll assign it and start work.</p>
        </div>
      </div>

      {/* 1. Request type */}
      <SectionCard icon={Tag} title="Request Type *" hint="Start with what you need — this is the most important decision." accent="indigo">
        <Select value={form.request_type_id} onValueChange={(v) => setForm((p) => ({ ...p, request_type_id: v, custom_request_type: v === OTHER_TYPE ? p.custom_request_type : '' }))}>
          <SelectTrigger className="h-11 text-base bg-white" data-testid="nmr-type"><SelectValue placeholder="Pick a request type to begin" /></SelectTrigger>
          <SelectContent>
            {types.map((t) => <SelectItem key={t.id} value={t.id}>{t.name}</SelectItem>)}
            <SelectItem value={OTHER_TYPE}>Other (specify)</SelectItem>
          </SelectContent>
        </Select>
        {isOther && (
          <div className="mt-3">
            <Label className="text-xs text-indigo-900">Specify the type</Label>
            <Input
              value={form.custom_request_type}
              onChange={(e) => setForm((p) => ({ ...p, custom_request_type: e.target.value }))}
              placeholder="e.g. Trade-show booth visuals"
              className="mt-1 bg-white"
              data-testid="nmr-custom-type"
            />
          </div>
        )}
      </SectionCard>

      {/* 2. Description */}
      <SectionCard title="Description / Notes" hint="Reference images, Google Drive links, brand guidelines, sizes, deadlines — paste freely.">
        <Textarea
          rows={8}
          className="min-h-[180px]"
          placeholder="Paste your brief here…"
          value={form.description}
          onChange={(e) => setForm((p) => ({ ...p, description: e.target.value }))}
          data-testid="nmr-description"
        />
      </SectionCard>

      {/* 3. Priority / Due / Department */}
      <SectionCard title="Priority & scheduling">
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <div>
            <Label className="text-xs">Priority</Label>
            <Select value={form.priority} onValueChange={(v) => setForm((p) => ({ ...p, priority: v }))}>
              <SelectTrigger className="h-10"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="low">Low</SelectItem>
                <SelectItem value="medium">Medium</SelectItem>
                <SelectItem value="high">High</SelectItem>
                <SelectItem value="urgent">Urgent</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label className="text-xs">Due date <span className="text-slate-400 font-normal">(optional)</span></Label>
            <Input type="date" value={form.due_date} onChange={(e) => setForm((p) => ({ ...p, due_date: e.target.value }))} className="h-10" data-testid="nmr-due-date" />
          </div>
          <div>
            <Label className="text-xs">Department</Label>
            <Select value={form.assigned_to_department} onValueChange={(v) => setForm((p) => ({ ...p, assigned_to_department: v }))}>
              <SelectTrigger className="h-10"><SelectValue /></SelectTrigger>
              <SelectContent>
                {departments.map((d) => <SelectItem key={d} value={d}>{d}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
        </div>
      </SectionCard>

      {/* 4. Approval path */}
      <SectionCard icon={CheckCircle2} title="Approval Path" hint="Pick whether the client needs to sign off." accent="emerald">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {[
            { v: 'internal', label: 'Internal only',   hint: 'Marketing Manager approves — faster turnaround' },
            { v: 'client',   label: 'Client required', hint: 'Share link, client picks option or approves' },
          ].map((opt) => {
            const active = form.approval_type === opt.v;
            return (
              <button
                key={opt.v}
                type="button"
                onClick={() => setForm((p) => ({ ...p, approval_type: opt.v }))}
                className={`text-left rounded-xl border-2 p-3 transition-all ${active ? 'border-indigo-500 bg-indigo-50 ring-2 ring-indigo-200' : 'border-slate-200 bg-white hover:border-slate-300'}`}
                data-testid={`nmr-approval-${opt.v}`}
              >
                <div className="text-sm font-semibold text-slate-800">{opt.label}</div>
                <div className="text-[11px] text-slate-500 mt-0.5">{opt.hint}</div>
              </button>
            );
          })}
        </div>
      </SectionCard>

      {/* 5. Link a lead */}
      <SectionCard icon={Users} title="Linked Lead" hint="Optional. Links this request to a customer for reporting & context.">
        <Input
          value={leadSearch}
          onChange={(e) => setLeadSearch(e.target.value)}
          placeholder="Search leads by company or contact…"
          className="h-9 mb-2"
          data-testid="nmr-lead-search"
        />
        <div className="border border-slate-200 rounded-md p-2 max-h-48 overflow-y-auto space-y-1 bg-slate-50/40">
          {filteredLeads.length === 0 ? (
            <p className="text-xs text-slate-400 italic">No leads match your search.</p>
          ) : (
            filteredLeads.slice(0, 100).map((l) => (
              <label
                key={l.id}
                className={`flex items-center gap-2 text-sm cursor-pointer rounded px-2 py-1 transition-colors ${form.lead_id === l.id ? 'bg-indigo-50 ring-1 ring-indigo-300' : 'hover:bg-white'}`}
              >
                <input
                  type="radio"
                  name="nmr-lead"
                  checked={form.lead_id === l.id}
                  onChange={() => setForm((p) => ({ ...p, lead_id: l.id }))}
                  data-testid={`nmr-lead-${l.id}`}
                />
                <span className="truncate">{l.label}</span>
              </label>
            ))
          )}
        </div>
        {selectedLead && (
          <div className="mt-3 flex items-center justify-between gap-3 px-3 py-2 rounded-lg bg-indigo-50 border border-indigo-200">
            <div className="min-w-0">
              <div className="text-[10px] uppercase tracking-wider text-indigo-500 font-semibold">Lead ID</div>
              <div className="font-mono text-sm font-bold text-indigo-900 truncate" data-testid="nmr-selected-lead-id">{selectedLead.id}</div>
              <div className="text-xs text-indigo-700 truncate">{selectedLead.label}</div>
            </div>
            <button type="button" className="text-rose-500 hover:bg-rose-50 rounded p-1" onClick={() => setForm((p) => ({ ...p, lead_id: '' }))} title="Remove">
              <X className="h-3.5 w-3.5" />
            </button>
          </div>
        )}
      </SectionCard>

      {/* 6. Reference links */}
      <SectionCard icon={LinkIcon} title="Reference Links" hint="Add Google Drive folders, Dropbox links, brand guidelines — anything useful.">
        {form.reference_links.length > 0 && (
          <div className="space-y-1.5 mb-3">
            {form.reference_links.map((l, i) => (
              <div key={i} className="flex items-center gap-2 text-xs px-3 py-1.5 bg-slate-50 rounded">
                <Badge variant="outline" className="font-medium">{l.label}</Badge>
                <span className="text-slate-500 truncate flex-1">{l.url}</span>
                <button onClick={() => setForm((p) => ({ ...p, reference_links: p.reference_links.filter((_, idx) => idx !== i) }))}><X className="h-3 w-3" /></button>
              </div>
            ))}
          </div>
        )}
        <div className="flex gap-2">
          <Input className="flex-1" placeholder="Label" value={linkLabel} onChange={(e) => setLinkLabel(e.target.value)} />
          <Input className="flex-[2]" placeholder="https://drive.google.com/..." value={linkUrl} onChange={(e) => setLinkUrl(e.target.value)} />
          <Button size="sm" type="button" variant="outline" onClick={addLink} disabled={!linkUrl.trim() || !linkLabel.trim()}>Add</Button>
        </div>
      </SectionCard>

      {/* Submit bar */}
      <div className="sticky bottom-4 z-10 flex items-center justify-end gap-2 bg-white border border-slate-200 rounded-2xl p-3 shadow-lg">
        <Link to="/marketing-requests">
          <Button variant="outline">Cancel</Button>
        </Link>
        <Button onClick={submit} disabled={saving} className="bg-indigo-600 hover:bg-indigo-700" data-testid="nmr-submit-btn">
          {saving ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" />Creating…</> : <><Plus className="h-4 w-4 mr-2" />Create Request</>}
        </Button>
      </div>
    </div>
  );
}
