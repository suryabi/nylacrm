import React, { useEffect, useState, useRef, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import axios from 'axios';
import { Button } from '../components/ui/button';
import { Card, CardContent } from '../components/ui/card';
import { Input } from '../components/ui/input';
import { Label } from '../components/ui/label';
import { Textarea } from '../components/ui/textarea';
import { Badge } from '../components/ui/badge';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '../components/ui/select';
import {
  ArrowLeft, Sparkles, Upload, X, Link as LinkIcon, AlertTriangle, Loader2, Plus,
  Tag, ImageIcon, FileText, CalendarClock, Building2, Send, Users,
} from 'lucide-react';
import { toast } from 'sonner';

const API = `${process.env.REACT_APP_BACKEND_URL}/api`;
const HEAD = () => {
  const t = localStorage.getItem('token');
  return t ? { Authorization: `Bearer ${t}` } : {};
};

export default function NewMarketingRequest() {
  const navigate = useNavigate();
  const [types, setTypes] = useState([]);
  const [departments, setDepartments] = useState([]);
  const [submitting, setSubmitting] = useState(false);
  // Lead the request is being raised for (optional)
  const [leads, setLeads] = useState([]);
  const [leadSearch, setLeadSearch] = useState('');
  const [selectedLead, setSelectedLead] = useState(null);

  const [form, setForm] = useState({
    request_type_id: '',
    assigned_department_id: '',
    requested_due_date: '',
    requirement_details: '',
    additional_comments: '',
    short_timeline_reason: '',
  });
  const [logoFile, setLogoFile] = useState(null);
  const [referenceFiles, setReferenceFiles] = useState([]);
  const [socialLinks, setSocialLinks] = useState([]);
  const [fileLinks, setFileLinks] = useState([]);
  const [newSocialLink, setNewSocialLink] = useState('');
  const [newFileLink, setNewFileLink] = useState('');
  const refFileInput = useRef(null);
  const logoFileInput = useRef(null);

  useEffect(() => {
    (async () => {
      try {
        const [t, d] = await Promise.all([
          axios.get(`${API}/marketing-request-types`, { headers: HEAD() }),
          axios.get(`${API}/master-departments?kind=fulfilment`, { headers: HEAD() }),
        ]);
        setTypes(t.data?.types || []);
        setDepartments(d.data?.departments || []);
      } catch {
        toast.error('Failed to load masters');
      }
    })();
  }, []);

  // Debounced lead search (only while no lead is selected)
  useEffect(() => {
    if (selectedLead) return;
    const t = setTimeout(async () => {
      try {
        const qs = `page=1&page_size=20${leadSearch ? `&search=${encodeURIComponent(leadSearch)}` : ''}`;
        const { data } = await axios.get(`${API}/leads?${qs}`, { headers: HEAD() });
        setLeads(data.data || data.leads || []);
      } catch {
        /* silent */
      }
    }, 300);
    return () => clearTimeout(t);
  }, [leadSearch, selectedLead]);

  const selectedType = useMemo(() => types.find(t => t.id === form.request_type_id), [types, form.request_type_id]);  const minLeadDays = selectedType ? (selectedType.design_lead_time_days + selectedType.production_lead_time_days) : 0;
  const earliestDate = useMemo(() => {
    const d = new Date();
    d.setDate(d.getDate() + minLeadDays);
    return d.toISOString().slice(0, 10);
  }, [minLeadDays]);
  const isShortTimeline = selectedType && form.requested_due_date && (form.requested_due_date < earliestDate);

  const uploadFile = async (file) => {
    const fd = new FormData();
    fd.append('file', file);
    const res = await axios.post(`${API}/marketing-requests/upload`, fd, {
      headers: { ...HEAD(), 'Content-Type': 'multipart/form-data' },
    });
    return res.data;
  };

  const handleLogoChange = async (e) => {
    const f = e.target.files?.[0];
    if (!f) return;
    try { const up = await uploadFile(f); setLogoFile(up); toast.success(`Uploaded logo`); }
    catch { toast.error('Logo upload failed'); }
    if (logoFileInput.current) logoFileInput.current.value = '';
  };

  const handleRefFilesChange = async (e) => {
    const files = Array.from(e.target.files || []);
    for (const f of files) {
      try { const up = await uploadFile(f); setReferenceFiles(prev => [...prev, up]); }
      catch { toast.error(`Failed to upload ${f.name}`); }
    }
    if (refFileInput.current) refFileInput.current.value = '';
  };
  const removeRefFile = (id) => setReferenceFiles(prev => prev.filter(f => f.id !== id));

  const addSocialLink = () => { const v = newSocialLink.trim(); if (v) { setSocialLinks(p => [...p, v]); setNewSocialLink(''); } };
  const addFileLink = () => { const v = newFileLink.trim(); if (v) { setFileLinks(p => [...p, v]); setNewFileLink(''); } };

  const canSubmit = form.request_type_id && form.assigned_department_id && form.requested_due_date && form.requirement_details && (!isShortTimeline || form.short_timeline_reason.trim());

  const handleSubmit = async () => {
    if (!canSubmit) { toast.error('Please fill all required fields.'); return; }
    setSubmitting(true);
    try {
      const payload = {
        request_type_id: form.request_type_id,
        assigned_department_id: form.assigned_department_id,
        requested_due_date: form.requested_due_date,
        requirement_details: form.requirement_details,
        additional_comments: form.additional_comments || null,
        lead_id: selectedLead?.id || null,
        short_timeline_reason: isShortTimeline ? form.short_timeline_reason : null,
        logo_file_id: logoFile?.id || null,
        reference_file_ids: referenceFiles.map(f => f.id),
        social_media_links: socialLinks,
        file_links: fileLinks,
      };
      const { data } = await axios.post(`${API}/marketing-requests`, payload, { headers: HEAD() });
      toast.success(`Created ${data.request_number}`);
      navigate(`/marketing-requests/${data.id}`);
    } catch (e) {
      toast.error(e.response?.data?.detail || 'Failed to create request');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="p-6 max-w-4xl mx-auto space-y-6" data-testid="new-mr-page">
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="sm" onClick={() => navigate(-1)} data-testid="back-btn">
          <ArrowLeft className="h-4 w-4 mr-2" /> Back
        </Button>
        <div>
          <h1 className="text-2xl font-bold text-slate-900 dark:text-white tracking-tight flex items-center gap-2">
            <Sparkles className="h-6 w-6 text-emerald-600" /> New Marketing Request
          </h1>
          <p className="text-sm text-slate-500 mt-0.5">Pick a request type, set the timeline, describe the requirement.</p>
        </div>
      </div>

      {/* PROMINENT: Request Type selector */}
      <Card className="border border-emerald-100/60 rounded-xl shadow-[0_2px_8px_rgba(6,95,70,0.04)]">
        <CardContent className="p-6">
          <div className="flex items-center gap-2 mb-3">
            <Tag className="h-4 w-4 text-emerald-600" />
            <span className="text-[10px] uppercase tracking-wider text-emerald-700 font-semibold">Request Type</span>
            <span className="text-red-500">*</span>
          </div>
          {/* Big chip-style picker */}
          <div className="flex flex-wrap gap-2">
            {types.map(t => {
              const active = form.request_type_id === t.id;
              return (
                <button
                  type="button"
                  key={t.id}
                  onClick={() => setForm({ ...form, request_type_id: t.id })}
                  className={`group relative rounded-xl border px-4 py-3 text-left transition-all ${
                    active
                      ? 'bg-emerald-600 border-emerald-600 text-white shadow-[0_8px_24px_rgba(6,95,70,0.18)] -translate-y-[1px]'
                      : 'bg-white border-emerald-100 text-slate-700 hover:border-emerald-300 hover:bg-emerald-50/50'
                  }`}
                  data-testid={`mr-type-chip-${t.id}`}
                >
                  <div className={`text-base font-semibold ${active ? 'text-white' : 'text-slate-900'}`}>{t.name}</div>
                  <div className={`text-[11px] mt-0.5 ${active ? 'text-emerald-50' : 'text-slate-500'}`}>
                    Design {t.design_lead_time_days}d &middot; Production {t.production_lead_time_days}d
                  </div>
                </button>
              );
            })}
            {types.length === 0 && <span className="text-sm text-slate-400">Loading types…</span>}
          </div>
          {selectedType && (
            <div className="mt-4 rounded-lg bg-emerald-50/60 border border-emerald-100 px-3 py-2 text-xs text-emerald-800">
              <span className="font-semibold">{selectedType.name}</span> &middot; minimum lead time {minLeadDays} days (earliest delivery: {earliestDate})
            </div>
          )}
        </CardContent>
      </Card>

      {/* Main form */}
      <Card className="border border-emerald-100/60 rounded-xl shadow-[0_2px_8px_rgba(6,95,70,0.04)]">
        <CardContent className="p-6 space-y-5">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
            <div className="space-y-2">
              <Label className="text-xs uppercase tracking-wider text-slate-500 font-semibold flex items-center gap-1.5">
                <Building2 className="h-3.5 w-3.5" /> Assigned Department *
              </Label>
              <Select value={form.assigned_department_id} onValueChange={(v) => setForm({ ...form, assigned_department_id: v })}>
                <SelectTrigger data-testid="mr-dept-select"><SelectValue placeholder="Choose a fulfilment team" /></SelectTrigger>
                <SelectContent>
                  {departments.map(d => (<SelectItem key={d.id} value={d.id}>{d.name}</SelectItem>))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label className="text-xs uppercase tracking-wider text-slate-500 font-semibold flex items-center gap-1.5">
                <CalendarClock className="h-3.5 w-3.5" /> Requested Due Date *
              </Label>
              <Input
                type="date"
                value={form.requested_due_date}
                onChange={(e) => setForm({ ...form, requested_due_date: e.target.value })}
                data-testid="mr-due-input"
              />
            </div>
          </div>

          {/* Lead this request is raised for (optional) */}
          <div className="space-y-2">
            <Label className="text-xs uppercase tracking-wider text-slate-500 font-semibold flex items-center gap-1.5">
              <Users className="h-3.5 w-3.5" /> Lead (optional)
            </Label>
            {selectedLead ? (
              <div className="flex items-center justify-between p-3 rounded-lg border border-emerald-200 bg-emerald-50/60" data-testid="mr-selected-lead">
                <div className="flex-1 min-w-0">
                  <p className="font-semibold text-slate-900 truncate">
                    {selectedLead.company || selectedLead.contact_person || selectedLead.name}
                  </p>
                  <p className="text-sm text-slate-600 truncate">
                    {[selectedLead.contact_person || selectedLead.name, selectedLead.city, selectedLead.phone].filter(Boolean).join(' • ')}
                  </p>
                </div>
                <Button type="button" variant="ghost" size="sm" onClick={() => { setSelectedLead(null); setLeadSearch(''); }} data-testid="mr-clear-lead">
                  <X className="h-4 w-4" />
                </Button>
              </div>
            ) : (
              <div className="space-y-2">
                <Input
                  placeholder="Search leads by company, contact, phone..."
                  value={leadSearch}
                  onChange={(e) => setLeadSearch(e.target.value)}
                  data-testid="mr-lead-search"
                />
                {leadSearch && (
                  <div className="border rounded-lg max-h-[180px] overflow-y-auto">
                    {leads.length === 0 ? (
                      <div className="p-4 text-sm text-muted-foreground text-center">No leads found</div>
                    ) : (
                      leads.map((l) => (
                        <button
                          type="button"
                          key={l.id}
                          className="w-full text-left p-3 hover:bg-emerald-50 border-b last:border-b-0 transition-colors"
                          onClick={() => setSelectedLead(l)}
                          data-testid={`mr-lead-option-${l.id}`}
                        >
                          <p className="font-medium text-sm">{l.company}</p>
                          <p className="text-xs text-muted-foreground">{[l.contact_person || l.name, l.city, l.phone].filter(Boolean).join(' • ')}</p>
                        </button>
                      ))
                    )}
                  </div>
                )}
              </div>
            )}
          </div>

          {isShortTimeline && (
            <div className="rounded-lg bg-amber-50 border border-amber-200 px-3 py-2.5 space-y-2">
              <div className="text-xs text-amber-800 flex items-center gap-1.5 font-medium">
                <AlertTriangle className="h-4 w-4" /> Tighter than the minimum lead time ({minLeadDays} days, earliest {earliestDate}). Please explain why.
              </div>
              <Textarea
                rows={2}
                placeholder="Why does this need a shorter turnaround? (required)"
                value={form.short_timeline_reason}
                onChange={(e) => setForm({ ...form, short_timeline_reason: e.target.value })}
                data-testid="mr-short-reason-input"
              />
            </div>
          )}

          <div className="space-y-2">
            <Label className="text-xs uppercase tracking-wider text-slate-500 font-semibold">Requirement Details *</Label>
            <Textarea
              rows={5}
              value={form.requirement_details}
              onChange={(e) => setForm({ ...form, requirement_details: e.target.value })}
              placeholder="Describe what you need, target audience, brand cues, do's/don'ts…"
              data-testid="mr-details-input"
            />
          </div>

          {/* Logo */}
          <div className="space-y-2">
            <Label className="text-xs uppercase tracking-wider text-slate-500 font-semibold flex items-center gap-1.5">
              <ImageIcon className="h-3.5 w-3.5" /> Logo Upload
            </Label>
            {logoFile ? (
              <div className="flex items-center justify-between bg-emerald-50/60 border border-emerald-100 rounded-md px-3 py-2 text-sm">
                <span className="truncate flex items-center gap-2"><ImageIcon className="h-4 w-4 text-emerald-600" /> {logoFile.filename}</span>
                <Button variant="ghost" size="sm" onClick={() => setLogoFile(null)}><X className="h-4 w-4" /></Button>
              </div>
            ) : (
              <Input type="file" accept="image/*" ref={logoFileInput} onChange={handleLogoChange} data-testid="mr-logo-input" />
            )}
          </div>

          {/* References */}
          <div className="space-y-2">
            <Label className="text-xs uppercase tracking-wider text-slate-500 font-semibold flex items-center gap-1.5">
              <FileText className="h-3.5 w-3.5" /> Reference Files
            </Label>
            <Input type="file" multiple ref={refFileInput} onChange={handleRefFilesChange} data-testid="mr-references-input" />
            {referenceFiles.length > 0 && (
              <div className="space-y-1.5 mt-2">
                {referenceFiles.map((f) => (
                  <div key={f.id} className="flex items-center justify-between bg-slate-50 border rounded-md px-3 py-1.5 text-sm">
                    <span className="truncate flex items-center gap-2"><FileText className="h-4 w-4 text-slate-500" /> {f.filename}</span>
                    <Button variant="ghost" size="sm" onClick={() => removeRefFile(f.id)}><X className="h-4 w-4" /></Button>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Social media + file links */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
            <div className="space-y-2">
              <Label className="text-xs uppercase tracking-wider text-slate-500 font-semibold">Social Media Links</Label>
              <div className="flex gap-2">
                <Input placeholder="https://instagram.com/…"
                  value={newSocialLink} onChange={(e) => setNewSocialLink(e.target.value)}
                  onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); addSocialLink(); } }} />
                <Button type="button" variant="outline" size="sm" onClick={addSocialLink}><Plus className="h-4 w-4" /></Button>
              </div>
              <div className="flex flex-wrap gap-1.5">
                {socialLinks.map((l, i) => (
                  <Badge key={i} variant="outline" className="text-xs bg-white">
                    <LinkIcon className="h-3 w-3 mr-1" /> {l}
                    <button onClick={() => setSocialLinks(p => p.filter((_, j) => j !== i))} className="ml-1.5 hover:text-red-600"><X className="h-3 w-3" /></button>
                  </Badge>
                ))}
              </div>
            </div>

            <div className="space-y-2">
              <Label className="text-xs uppercase tracking-wider text-slate-500 font-semibold">File Links (Drive, etc.)</Label>
              <div className="flex gap-2">
                <Input placeholder="https://drive.google.com/…"
                  value={newFileLink} onChange={(e) => setNewFileLink(e.target.value)}
                  onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); addFileLink(); } }} />
                <Button type="button" variant="outline" size="sm" onClick={addFileLink}><Plus className="h-4 w-4" /></Button>
              </div>
              <div className="flex flex-wrap gap-1.5">
                {fileLinks.map((l, i) => (
                  <Badge key={i} variant="outline" className="text-xs bg-white">
                    <LinkIcon className="h-3 w-3 mr-1" /> {l}
                    <button onClick={() => setFileLinks(p => p.filter((_, j) => j !== i))} className="ml-1.5 hover:text-red-600"><X className="h-3 w-3" /></button>
                  </Badge>
                ))}
              </div>
            </div>
          </div>

          <div className="space-y-2">
            <Label className="text-xs uppercase tracking-wider text-slate-500 font-semibold">Additional Comments</Label>
            <Textarea
              rows={2}
              value={form.additional_comments}
              onChange={(e) => setForm({ ...form, additional_comments: e.target.value })}
              placeholder="Anything else the team should know?"
            />
          </div>
        </CardContent>
      </Card>

      <div className="flex justify-end gap-2">
        <Button variant="outline" onClick={() => navigate('/marketing-requests')}>Cancel</Button>
        <Button onClick={handleSubmit} disabled={!canSubmit || submitting} className="bg-emerald-600 hover:bg-emerald-700" data-testid="mr-submit-btn">
          {submitting ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" /> Submitting…</> : <><Send className="h-4 w-4 mr-2" /> Submit Request</>}
        </Button>
      </div>
    </div>
  );
}
