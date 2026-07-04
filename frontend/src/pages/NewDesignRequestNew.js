import React, { useEffect, useState, useMemo } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import axios from 'axios';
import { format } from 'date-fns';
import { Button } from '../components/ui/button';
import { Card, CardContent } from '../components/ui/card';
import { Input } from '../components/ui/input';
import { Label } from '../components/ui/label';
import { Textarea } from '../components/ui/textarea';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '../components/ui/select';
import { Popover, PopoverContent, PopoverTrigger } from '../components/ui/popover';
import { Calendar } from '../components/ui/calendar';
import { Switch } from '../components/ui/switch';
import { FileDropzone } from '../components/FileDropzone';
import {
  ArrowLeft, Sparkles, X, Link as LinkIcon, AlertTriangle, Loader2, Plus,
  Tag, ImageIcon, FileText, CalendarClock, Building2, Send, Users, Trash2, CalendarIcon, Flame,
} from 'lucide-react';
import { toast } from 'sonner';

const API = `${process.env.REACT_APP_BACKEND_URL}/api`;
const HEAD = () => {
  const t = localStorage.getItem('token');
  return t ? { Authorization: `Bearer ${t}` } : {};
};

// Contemporary form-control style tokens (emerald, soft glow focus)
const INPUT_CLS = 'h-12 rounded-xl border-emerald-100 bg-white px-4 shadow-sm transition-all focus-visible:border-emerald-500 focus-visible:ring-4 focus-visible:ring-emerald-500/10';
const TEXTAREA_CLS = 'rounded-xl border-emerald-100 bg-white px-4 py-3 shadow-sm transition-all focus-visible:border-emerald-500 focus-visible:ring-4 focus-visible:ring-emerald-500/10';
const SELECT_CLS = 'h-12 rounded-xl border-emerald-100 bg-white px-4 shadow-sm transition-all focus:border-emerald-500 focus:ring-4 focus:ring-emerald-500/10';
const LABEL_CLS = 'text-xs uppercase tracking-wider text-slate-500 font-semibold flex items-center gap-1.5';
const CAL_CLASSNAMES = { day_selected: 'bg-emerald-600 text-white hover:bg-emerald-600 focus:bg-emerald-600 rounded-lg shadow-sm', day_today: 'bg-emerald-50 text-emerald-700 font-semibold rounded-lg' };

const isImg = (f) => (f?.content_type || '').startsWith('image/') || /\.(png|jpe?g|gif|webp|svg|bmp)$/i.test(f?.filename || '');

// Repeatable URL list — stacked styled rows + dashed "Add link" button.
const LinkListField = ({ label, placeholder, links, onChange, onAdd, onRemove, testPrefix }) => (
  <div className="space-y-2">
    <Label className={LABEL_CLS}>{label}</Label>
    <div className="space-y-2">
      {links.map((l, i) => (
        <div
          key={i}
          className="flex items-center gap-2 bg-slate-50 border border-slate-200 p-2 pl-3.5 rounded-xl focus-within:border-emerald-400 focus-within:ring-4 focus-within:ring-emerald-500/10 transition-all"
        >
          <LinkIcon className="h-4 w-4 text-emerald-500 shrink-0" />
          <input
            className="flex-1 border-0 bg-transparent outline-none text-sm text-slate-800 placeholder:text-slate-400"
            placeholder={placeholder}
            value={l}
            onChange={(e) => onChange(i, e.target.value)}
            data-testid={`${testPrefix}-input-${i}`}
          />
          <button
            type="button"
            onClick={() => onRemove(i)}
            className="p-1.5 text-slate-400 hover:text-red-500 hover:bg-red-50 rounded-lg transition-colors"
            aria-label="Remove link"
            data-testid={`${testPrefix}-remove-${i}`}
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      ))}
    </div>
    <button
      type="button"
      onClick={onAdd}
      className="flex items-center justify-center gap-2 w-full py-2.5 px-4 text-sm font-medium text-emerald-700 bg-emerald-50/50 border border-dashed border-emerald-200 rounded-xl hover:bg-emerald-50 hover:border-emerald-300 transition-all"
      data-testid={`${testPrefix}-add`}
    >
      <Plus className="h-4 w-4" /> Add link
    </button>
  </div>
);

export default function NewDesignRequestNew() {
  const navigate = useNavigate();
  const { id: editId } = useParams();
  const isEdit = Boolean(editId);
  const [loadingExisting, setLoadingExisting] = useState(Boolean(editId));
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
    is_urgent: false,
  });
  const [logoFile, setLogoFile] = useState(null);
  const [referenceFiles, setReferenceFiles] = useState([]);
  const [logoBusy, setLogoBusy] = useState(false);
  const [refBusy, setRefBusy] = useState(false);
  const [socialLinks, setSocialLinks] = useState(['']);
  const [fileLinks, setFileLinks] = useState(['']);

  useEffect(() => {
    (async () => {
      try {
        const [t, d] = await Promise.all([
          axios.get(`${API}/marketing-request-types`, { headers: HEAD() }),
          axios.get(`${API}/master-departments?kind=fulfilment`, { headers: HEAD() }),
        ]);
        setTypes(t.data?.types || []);
        const depts = d.data?.departments || [];
        setDepartments(depts);
        // Default the assigned department to "Design" when available.
        const design = depts.find((x) => (x.name || '').trim().toLowerCase() === 'design');
        if (design) setForm((prev) => (prev.assigned_department_id ? prev : { ...prev, assigned_department_id: design.id }));
      } catch {
        toast.error('Failed to load masters');
      }
    })();
  }, []);

  // Edit mode: load the existing request and prefill the form once.
  useEffect(() => {
    if (!editId) return;
    (async () => {
      try {
        const { data: req } = await axios.get(`${API}/design-requests-new/${editId}`, { headers: HEAD() });
        setForm({
          request_type_id: req.request_type_id || '',
          assigned_department_id: req.assigned_department_id || '',
          requested_due_date: req.requested_due_date || '',
          requirement_details: req.requirement_details || '',
          additional_comments: req.additional_comments || '',
          short_timeline_reason: req.short_timeline_reason || '',
          is_urgent: !!req.is_urgent,
        });
        if (req.logo) setLogoFile({ ...req.logo, _preview: isImg(req.logo) ? `${API}/design-requests-new/files/${req.logo.id}` : null });
        if (Array.isArray(req.references)) setReferenceFiles(req.references.map(f => ({ ...f, _preview: null })));
        setSocialLinks(req.social_media_links?.length ? req.social_media_links : ['']);
        setFileLinks(req.file_links?.length ? req.file_links : ['']);
        if (req.lead_id) {
          setSelectedLead({ id: req.lead_id, company: req.lead_company, contact_person: req.lead_name, name: req.lead_name });
        }
      } catch (e) {
        toast.error(e.response?.data?.detail || 'Failed to load request');
        navigate('/design-requests-new');
      } finally {
        setLoadingExisting(false);
      }
    })();
  }, [editId, navigate]);

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

  const selectedType = useMemo(() => types.find(t => t.id === form.request_type_id), [types, form.request_type_id]);
  const minLeadDays = selectedType ? (selectedType.design_lead_time_days + selectedType.production_lead_time_days) : 0;
  const earliestDate = useMemo(() => {
    const d = new Date();
    d.setDate(d.getDate() + minLeadDays);
    return d.toISOString().slice(0, 10);
  }, [minLeadDays]);
  const isShortTimeline = selectedType && form.requested_due_date && (form.requested_due_date < earliestDate);

  const uploadFile = async (file) => {
    const fd = new FormData();
    fd.append('file', file);
    const res = await axios.post(`${API}/design-requests-new/upload`, fd, {
      headers: { ...HEAD(), 'Content-Type': 'multipart/form-data' },
    });
    return res.data;
  };

  const handleLogo = async (files) => {
    const f = files[0];
    if (!f) return;
    setLogoBusy(true);
    try {
      const up = await uploadFile(f);
      setLogoFile({ ...up, _preview: isImg(up) ? URL.createObjectURL(f) : null });
      toast.success('Logo uploaded');
    } catch { toast.error('Logo upload failed'); }
    finally { setLogoBusy(false); }
  };

  const handleRefFiles = async (files) => {
    setRefBusy(true);
    for (const f of files) {
      try {
        const up = await uploadFile(f);
        setReferenceFiles(prev => [...prev, { ...up, _preview: isImg(up) ? URL.createObjectURL(f) : null }]);
      } catch { toast.error(`Failed to upload ${f.name}`); }
    }
    setRefBusy(false);
  };
  const removeRefFile = (id) => setReferenceFiles(prev => prev.filter(f => f.id !== id));

  // Repeatable link rows (always keep a trailing empty row for input)
  const updateLink = (setter) => (idx, val) => setter(prev => prev.map((l, i) => (i === idx ? val : l)));
  const addLinkRow = (setter) => () => setter(prev => [...prev, '']);
  const removeLinkRow = (setter) => (idx) => setter(prev => (prev.length <= 1 ? [''] : prev.filter((_, i) => i !== idx)));

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
        is_urgent: !!form.is_urgent,
        logo_file_id: logoFile?.id || null,
        reference_file_ids: referenceFiles.map(f => f.id),
        social_media_links: socialLinks.map(l => l.trim()).filter(Boolean),
        file_links: fileLinks.map(l => l.trim()).filter(Boolean),
      };
      const { data } = isEdit
        ? await axios.put(`${API}/design-requests-new/${editId}`, payload, { headers: HEAD() })
        : await axios.post(`${API}/design-requests-new`, payload, { headers: HEAD() });
      toast.success(isEdit ? `Updated ${data.request_number}` : `Created ${data.request_number}`);
      navigate(`/design-requests-new/${data.id}`);
    } catch (e) {
      toast.error(e.response?.data?.detail || (isEdit ? 'Failed to update request' : 'Failed to create request'));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="p-6 max-w-4xl mx-auto space-y-6" data-testid="new-mr-page">
      {loadingExisting && (
        <div className="flex items-center justify-center py-24 text-slate-500" data-testid="mr-edit-loading">
          <Loader2 className="h-5 w-5 mr-2 animate-spin text-emerald-600" /> Loading request…
        </div>
      )}
      {!loadingExisting && (<>
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="sm" onClick={() => navigate(-1)} data-testid="back-btn">
          <ArrowLeft className="h-4 w-4 mr-2" /> Back
        </Button>
        <div>
          <h1 className="text-2xl font-bold text-slate-900 dark:text-white tracking-tight flex items-center gap-2">
            <Sparkles className="h-6 w-6 text-emerald-600" /> {isEdit ? 'Edit Design Request' : 'New Design Request'}
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
              <Label className={LABEL_CLS}>
                <Building2 className="h-3.5 w-3.5" /> Assigned Department *
              </Label>
              <Select value={form.assigned_department_id} onValueChange={(v) => setForm({ ...form, assigned_department_id: v })}>
                <SelectTrigger className={SELECT_CLS} data-testid="mr-dept-select"><SelectValue placeholder="Choose a fulfilment team" /></SelectTrigger>
                <SelectContent>
                  {departments.map(d => (<SelectItem key={d.id} value={d.id}>{d.name}</SelectItem>))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label className={LABEL_CLS}>
                <CalendarClock className="h-3.5 w-3.5" /> Requested Due Date *
              </Label>
              <Popover>
                <PopoverTrigger asChild>
                  <button
                    type="button"
                    className={`${SELECT_CLS} flex w-full items-center justify-start gap-3 text-left hover:border-emerald-300 ${form.requested_due_date ? 'text-slate-900' : 'text-slate-400'}`}
                    data-testid="mr-due-input"
                  >
                    <CalendarIcon className="h-5 w-5 text-emerald-600" />
                    {form.requested_due_date ? format(new Date(form.requested_due_date + 'T00:00:00'), 'EEE, dd MMM yyyy') : 'Pick a delivery date'}
                  </button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0 rounded-2xl border-emerald-100 shadow-xl" align="start">
                  <Calendar
                    mode="single"
                    selected={form.requested_due_date ? new Date(form.requested_due_date + 'T00:00:00') : undefined}
                    onSelect={(d) => d && setForm({ ...form, requested_due_date: format(d, 'yyyy-MM-dd') })}
                    disabled={(d) => d < new Date(new Date().setHours(0, 0, 0, 0))}
                    classNames={CAL_CLASSNAMES}
                    initialFocus
                  />
                </PopoverContent>
              </Popover>
            </div>
          </div>

          {/* Urgent flag */}
          <div
            className={`flex items-center justify-between gap-4 rounded-xl border p-3.5 transition-colors ${form.is_urgent ? 'border-red-300 bg-red-50/70' : 'border-slate-200 bg-white'}`}
            data-testid="mr-urgent-toggle-row"
          >
            <div className="flex items-start gap-3">
              <div className={`mt-0.5 h-9 w-9 rounded-lg flex items-center justify-center shrink-0 ${form.is_urgent ? 'bg-red-100 text-red-600' : 'bg-slate-100 text-slate-400'}`}>
                <Flame className="h-5 w-5" />
              </div>
              <div>
                <p className="text-sm font-semibold text-slate-900">Mark as Urgent</p>
                <p className="text-xs text-slate-500">Highlights this request in red for the design team across the list & board.</p>
              </div>
            </div>
            <Switch
              checked={form.is_urgent}
              onCheckedChange={(v) => setForm({ ...form, is_urgent: v })}
              className="data-[state=checked]:bg-red-600"
              data-testid="mr-urgent-switch"
            />
          </div>

          {/* Lead this request is raised for (optional) */}
          <div className="space-y-2">
            <Label className={LABEL_CLS}>
              <Users className="h-3.5 w-3.5" /> Lead (optional)
            </Label>
            {selectedLead ? (
              <div className="flex items-center justify-between p-3.5 rounded-xl border border-emerald-200 bg-emerald-50/60" data-testid="mr-selected-lead">
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
                  className={INPUT_CLS}
                  placeholder="Search leads by company, contact, phone..."
                  value={leadSearch}
                  onChange={(e) => setLeadSearch(e.target.value)}
                  data-testid="mr-lead-search"
                />
                {leadSearch && (
                  <div className="border border-emerald-100 rounded-xl max-h-[180px] overflow-y-auto shadow-sm">
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
            <div className="rounded-xl bg-amber-50 border border-amber-200 px-4 py-3 space-y-2">
              <div className="text-xs text-amber-800 flex items-center gap-1.5 font-medium">
                <AlertTriangle className="h-4 w-4" /> Tighter than the minimum lead time ({minLeadDays} days, earliest {earliestDate}). Please explain why.
              </div>
              <Textarea
                rows={2}
                className={TEXTAREA_CLS}
                placeholder="Why does this need a shorter turnaround? (required)"
                value={form.short_timeline_reason}
                onChange={(e) => setForm({ ...form, short_timeline_reason: e.target.value })}
                data-testid="mr-short-reason-input"
              />
            </div>
          )}

          <div className="space-y-2">
            <Label className={LABEL_CLS}>Requirement Details *</Label>
            <Textarea
              rows={5}
              className={TEXTAREA_CLS}
              value={form.requirement_details}
              onChange={(e) => setForm({ ...form, requirement_details: e.target.value })}
              placeholder="Describe what you need, target audience, brand cues, do's/don'ts…"
              data-testid="mr-details-input"
            />
          </div>

          {/* Logo */}
          <div className="space-y-2">
            <Label className={LABEL_CLS}>
              <ImageIcon className="h-3.5 w-3.5" /> Logo Upload
            </Label>
            {logoFile ? (
              <div className="flex items-center gap-3 bg-white border border-emerald-100 rounded-xl p-3 shadow-sm">
                <div className="w-12 h-12 rounded-lg bg-emerald-50 flex items-center justify-center text-emerald-600 shrink-0 overflow-hidden">
                  {logoFile._preview ? <img src={logoFile._preview} alt={logoFile.filename} className="w-full h-full object-cover" /> : <ImageIcon className="h-5 w-5" />}
                </div>
                <span className="flex-1 truncate text-sm text-slate-700">{logoFile.filename}</span>
                <Button variant="ghost" size="sm" className="text-slate-400 hover:text-red-500" onClick={() => setLogoFile(null)} data-testid="mr-logo-remove"><Trash2 className="h-4 w-4" /></Button>
              </div>
            ) : (
              <FileDropzone
                onFiles={handleLogo}
                accept="image/*"
                busy={logoBusy}
                title="Drop your logo here, or click to browse"
                hint="PNG, JPG or SVG"
                testId="mr-logo-dropzone"
              />
            )}
          </div>

          {/* References */}
          <div className="space-y-2">
            <Label className={LABEL_CLS}>
              <FileText className="h-3.5 w-3.5" /> Reference Files
            </Label>
            <FileDropzone
              onFiles={handleRefFiles}
              multiple
              busy={refBusy}
              title="Drop reference files here, or click to browse"
              hint="Add as many as you like — images, PDFs, decks…"
              testId="mr-references-dropzone"
            />
            {referenceFiles.length > 0 && (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 mt-2">
                {referenceFiles.map((f) => (
                  <div key={f.id} className="flex items-center gap-3 bg-white border border-emerald-100 rounded-xl p-2.5 shadow-sm" data-testid={`mr-ref-chip-${f.id}`}>
                    <div className="w-10 h-10 rounded-lg bg-emerald-50 flex items-center justify-center text-emerald-600 shrink-0 overflow-hidden">
                      {f._preview ? <img src={f._preview} alt={f.filename} className="w-full h-full object-cover" /> : <FileText className="h-4 w-4" />}
                    </div>
                    <span className="flex-1 truncate text-sm text-slate-700">{f.filename}</span>
                    <Button variant="ghost" size="sm" className="text-slate-400 hover:text-red-500" onClick={() => removeRefFile(f.id)}><Trash2 className="h-4 w-4" /></Button>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Social media + file links */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
            <LinkListField
              label="Social Media Links"
              placeholder="https://instagram.com/…"
              links={socialLinks}
              onChange={updateLink(setSocialLinks)}
              onAdd={addLinkRow(setSocialLinks)}
              onRemove={removeLinkRow(setSocialLinks)}
              testPrefix="mr-social"
            />
            <LinkListField
              label="File Links (Drive, etc.)"
              placeholder="https://drive.google.com/…"
              links={fileLinks}
              onChange={updateLink(setFileLinks)}
              onAdd={addLinkRow(setFileLinks)}
              onRemove={removeLinkRow(setFileLinks)}
              testPrefix="mr-filelink"
            />
          </div>

          <div className="space-y-2">
            <Label className={LABEL_CLS}>Additional Comments</Label>
            <Textarea
              rows={2}
              className={TEXTAREA_CLS}
              value={form.additional_comments}
              onChange={(e) => setForm({ ...form, additional_comments: e.target.value })}
              placeholder="Anything else the team should know?"
            />
          </div>
        </CardContent>
      </Card>

      <div className="flex justify-end gap-2">
        <Button variant="outline" onClick={() => navigate(isEdit ? `/design-requests-new/${editId}` : '/design-requests-new')}>Cancel</Button>
        <Button onClick={handleSubmit} disabled={!canSubmit || submitting} className="bg-emerald-600 hover:bg-emerald-700" data-testid="mr-submit-btn">
          {submitting
            ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" /> {isEdit ? 'Saving…' : 'Submitting…'}</>
            : <><Send className="h-4 w-4 mr-2" /> {isEdit ? 'Save Changes' : 'Submit Request'}</>}
        </Button>
      </div>
      </>)}
    </div>
  );
}
