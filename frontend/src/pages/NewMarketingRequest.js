import React, { useEffect, useState, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import axios from 'axios';
import { Button } from '../components/ui/button';
import { Card } from '../components/ui/card';
import { Input } from '../components/ui/input';
import { Label } from '../components/ui/label';
import { Textarea } from '../components/ui/textarea';
import { Badge } from '../components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../components/ui/select';
import { ArrowLeft, Sparkles, Upload, X, Link as LinkIcon, AlertTriangle, Loader2, Plus } from 'lucide-react';
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

  const [form, setForm] = useState({
    title: '',
    request_type_id: '',
    assigned_department_id: '',
    requested_due_date: '',
    requirement_details: '',
    additional_comments: '',
    short_timeline_reason: '',
  });
  const [logoFile, setLogoFile] = useState(null);
  const [referenceFiles, setReferenceFiles] = useState([]); // [{id, filename}]
  const [socialLinks, setSocialLinks] = useState([]);
  const [fileLinks, setFileLinks] = useState([]);
  const [newSocialLink, setNewSocialLink] = useState('');
  const [newFileLink, setNewFileLink] = useState('');
  const refFileInput = useRef(null);

  useEffect(() => {
    (async () => {
      try {
        const [t, d] = await Promise.all([
          axios.get(`${API}/marketing-request-types`, { headers: HEAD() }),
          axios.get(`${API}/master-departments?kind=fulfilment`, { headers: HEAD() }),
        ]);
        setTypes(t.data?.types || []);
        setDepartments(d.data?.departments || []);
      } catch (e) {
        toast.error('Failed to load masters');
      }
    })();
  }, []);

  const selectedType = types.find(t => t.id === form.request_type_id);
  const minLeadDays = selectedType ? (selectedType.design_lead_time_days + selectedType.production_lead_time_days) : 0;
  const earliestDate = (() => {
    const d = new Date();
    d.setDate(d.getDate() + minLeadDays);
    return d.toISOString().slice(0, 10);
  })();
  const isShortTimeline = selectedType && form.requested_due_date && (form.requested_due_date < earliestDate);

  const uploadFile = async (file) => {
    const fd = new FormData();
    fd.append('file', file);
    const res = await axios.post(`${API}/marketing-requests/upload`, fd, {
      headers: { ...HEAD(), 'Content-Type': 'multipart/form-data' },
    });
    return res.data; // {id, filename, ...}
  };

  const handleLogoChange = async (e) => {
    const f = e.target.files?.[0];
    if (!f) return;
    try {
      const uploaded = await uploadFile(f);
      setLogoFile(uploaded);
      toast.success(`Uploaded logo: ${f.name}`);
    } catch { toast.error('Logo upload failed'); }
  };

  const handleRefFilesChange = async (e) => {
    const files = Array.from(e.target.files || []);
    if (!files.length) return;
    for (const f of files) {
      try {
        const uploaded = await uploadFile(f);
        setReferenceFiles(prev => [...prev, uploaded]);
      } catch { toast.error(`Failed to upload ${f.name}`); }
    }
    if (refFileInput.current) refFileInput.current.value = '';
  };

  const removeRefFile = (id) => setReferenceFiles(prev => prev.filter(f => f.id !== id));

  const addSocialLink = () => {
    const v = newSocialLink.trim();
    if (!v) return;
    setSocialLinks(prev => [...prev, v]);
    setNewSocialLink('');
  };
  const addFileLink = () => {
    const v = newFileLink.trim();
    if (!v) return;
    setFileLinks(prev => [...prev, v]);
    setNewFileLink('');
  };

  const canSubmit = form.title && form.request_type_id && form.assigned_department_id && form.requested_due_date && form.requirement_details && (!isShortTimeline || form.short_timeline_reason.trim());

  const handleSubmit = async () => {
    if (!canSubmit) {
      toast.error('Please fill all required fields.');
      return;
    }
    setSubmitting(true);
    try {
      const payload = {
        title: form.title.trim(),
        request_type_id: form.request_type_id,
        assigned_department_id: form.assigned_department_id,
        requested_due_date: form.requested_due_date,
        requirement_details: form.requirement_details,
        additional_comments: form.additional_comments || null,
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
    <div className="space-y-4 p-4 sm:p-6 max-w-3xl mx-auto">
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="sm" onClick={() => navigate(-1)} data-testid="back-btn">
          <ArrowLeft className="h-4 w-4 mr-2" /> Back
        </Button>
        <h1 className="text-xl font-semibold flex items-center gap-2">
          <Sparkles className="h-5 w-5 text-violet-600" /> New Marketing Request
        </h1>
      </div>

      <Card className="p-5 space-y-4">
        <div className="space-y-2">
          <Label>Request Title *</Label>
          <Input
            value={form.title}
            onChange={(e) => setForm({ ...form, title: e.target.value })}
            placeholder="e.g. Neck-tag design for new mineral water bottle"
            data-testid="mr-title-input"
          />
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div className="space-y-2">
            <Label>Request Type *</Label>
            <Select value={form.request_type_id} onValueChange={(v) => setForm({ ...form, request_type_id: v })}>
              <SelectTrigger data-testid="mr-type-select"><SelectValue placeholder="Select type" /></SelectTrigger>
              <SelectContent>
                {types.map(t => (<SelectItem key={t.id} value={t.id}>{t.name}</SelectItem>))}
              </SelectContent>
            </Select>
            {selectedType && (
              <p className="text-[11px] text-muted-foreground">
                Design: {selectedType.design_lead_time_days}d &middot; Production: {selectedType.production_lead_time_days}d &middot; Min total: {minLeadDays}d (earliest {earliestDate})
              </p>
            )}
          </div>

          <div className="space-y-2">
            <Label>Assigned Department *</Label>
            <Select value={form.assigned_department_id} onValueChange={(v) => setForm({ ...form, assigned_department_id: v })}>
              <SelectTrigger data-testid="mr-dept-select"><SelectValue placeholder="Select department" /></SelectTrigger>
              <SelectContent>
                {departments.map(d => (<SelectItem key={d.id} value={d.id}>{d.name}</SelectItem>))}
              </SelectContent>
            </Select>
          </div>
        </div>

        <div className="space-y-2">
          <Label>Requested Due Date *</Label>
          <Input
            type="date"
            value={form.requested_due_date}
            onChange={(e) => setForm({ ...form, requested_due_date: e.target.value })}
            data-testid="mr-due-input"
          />
          {isShortTimeline && (
            <div className="rounded-md bg-amber-50 border border-amber-200 px-3 py-2 space-y-2">
              <div className="text-xs text-amber-800 flex items-center gap-1.5 font-medium">
                <AlertTriangle className="h-4 w-4" /> Shorter than the minimum lead time ({minLeadDays} days, earliest {earliestDate}).
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
        </div>

        <div className="space-y-2">
          <Label>Requirement Details *</Label>
          <Textarea
            rows={5}
            value={form.requirement_details}
            onChange={(e) => setForm({ ...form, requirement_details: e.target.value })}
            placeholder="Describe what you need, target audience, brand cues, do/don'ts…"
            data-testid="mr-details-input"
          />
        </div>

        {/* Logo */}
        <div className="space-y-2">
          <Label>Logo Upload</Label>
          {logoFile ? (
            <div className="flex items-center justify-between bg-slate-50 border rounded-md px-3 py-2 text-sm">
              <span className="truncate">{logoFile.filename}</span>
              <Button variant="ghost" size="sm" onClick={() => setLogoFile(null)}>
                <X className="h-4 w-4" />
              </Button>
            </div>
          ) : (
            <Input type="file" accept="image/*" onChange={handleLogoChange} data-testid="mr-logo-input" />
          )}
        </div>

        {/* References */}
        <div className="space-y-2">
          <Label>Reference Files (multiple)</Label>
          <Input type="file" multiple onChange={handleRefFilesChange} ref={refFileInput} data-testid="mr-references-input" />
          {referenceFiles.length > 0 && (
            <div className="space-y-1.5 mt-2">
              {referenceFiles.map((f) => (
                <div key={f.id} className="flex items-center justify-between bg-slate-50 border rounded-md px-3 py-2 text-sm">
                  <span className="truncate">{f.filename}</span>
                  <Button variant="ghost" size="sm" onClick={() => removeRefFile(f.id)}>
                    <X className="h-4 w-4" />
                  </Button>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Social media links */}
        <div className="space-y-2">
          <Label>Social Media Links</Label>
          <div className="flex gap-2">
            <Input
              placeholder="https://instagram.com/…"
              value={newSocialLink}
              onChange={(e) => setNewSocialLink(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); addSocialLink(); } }}
            />
            <Button type="button" variant="outline" size="sm" onClick={addSocialLink}>
              <Plus className="h-4 w-4" />
            </Button>
          </div>
          <div className="flex flex-wrap gap-1.5">
            {socialLinks.map((l, i) => (
              <Badge key={i} variant="outline" className="text-xs">
                <LinkIcon className="h-3 w-3 mr-1" /> {l}
                <button onClick={() => setSocialLinks(p => p.filter((_, j) => j !== i))} className="ml-1.5 hover:text-red-600"><X className="h-3 w-3" /></button>
              </Badge>
            ))}
          </div>
        </div>

        {/* File links */}
        <div className="space-y-2">
          <Label>File Links (Google Drive, etc.)</Label>
          <div className="flex gap-2">
            <Input
              placeholder="https://drive.google.com/…"
              value={newFileLink}
              onChange={(e) => setNewFileLink(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); addFileLink(); } }}
            />
            <Button type="button" variant="outline" size="sm" onClick={addFileLink}>
              <Plus className="h-4 w-4" />
            </Button>
          </div>
          <div className="flex flex-wrap gap-1.5">
            {fileLinks.map((l, i) => (
              <Badge key={i} variant="outline" className="text-xs">
                <LinkIcon className="h-3 w-3 mr-1" /> {l}
                <button onClick={() => setFileLinks(p => p.filter((_, j) => j !== i))} className="ml-1.5 hover:text-red-600"><X className="h-3 w-3" /></button>
              </Badge>
            ))}
          </div>
        </div>

        <div className="space-y-2">
          <Label>Additional Comments</Label>
          <Textarea
            rows={2}
            value={form.additional_comments}
            onChange={(e) => setForm({ ...form, additional_comments: e.target.value })}
          />
        </div>

        <div className="flex justify-end gap-2 pt-2 border-t">
          <Button variant="outline" onClick={() => navigate('/marketing-requests')}>Cancel</Button>
          <Button onClick={handleSubmit} disabled={!canSubmit || submitting} data-testid="mr-submit-btn">
            {submitting ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" /> Submitting…</> : <><Upload className="h-4 w-4 mr-2" /> Submit Request</>}
          </Button>
        </div>
      </Card>
    </div>
  );
}
