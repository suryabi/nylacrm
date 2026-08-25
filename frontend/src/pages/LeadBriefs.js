import React, { useEffect, useMemo, useState, useCallback } from 'react';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Textarea } from '../components/ui/textarea';
import { Badge } from '../components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '../components/ui/dialog';
import { toast } from 'sonner';
import { NotebookPen, Plus, MapPin, ExternalLink, CheckCircle2, UserPlus, Trash2, Loader2, ArrowRight, Linkedin, Instagram, Mail, Phone, Sparkles } from 'lucide-react';

const API = process.env.REACT_APP_BACKEND_URL;
const authHeaders = () => ({ Authorization: `Bearer ${localStorage.getItem('token')}`, 'Content-Type': 'application/json' });

const igHandle = (url) => {
  const m = (url || '').match(/instagram\.com\/([A-Za-z0-9_.]+)/);
  return m ? m[1] : null;
};
// photo priority: explicit photo URL → LinkedIn profile photo → Instagram avatar → initials block
const briefImage = (b) => {
  if (b.image_url) return b.image_url;
  if (b.linkedin_photo_url) return b.linkedin_photo_url;
  const ig = igHandle(b.instagram_url);
  if (ig) return `https://unavatar.io/instagram/${ig}?fallback=false`;
  return null;
};

const BriefPhoto = ({ brief, className }) => {
  const [failed, setFailed] = useState(false);
  const src = briefImage(brief);
  if (!src || failed) {
    return (
      <div className={`${className} bg-gradient-to-br from-[#002FA7] to-[#0B4FD6] flex items-center justify-center`}>
        <span className="text-white/90 text-3xl font-bold tracking-wide">
          {(brief.title || '?').split(' ').slice(0, 2).map((w) => w[0]).join('').toUpperCase()}
        </span>
      </div>
    );
  }
  return <img src={src} alt={brief.title} className={`${className} object-cover`} onError={() => setFailed(true)} loading="lazy" />;
};

const fmtDate = (iso) => {
  if (!iso) return '';
  return new Date(iso).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
};

const EMPTY_FORM = { title: '', city: '', summary: '', content: '', source_name: '', source_url: '', linkedin_url: '', instagram_url: '', image_url: '', email: '', phone: '' };
const EMPTY_LEAD = { company: '', contact_person: '', phone: '', email: '', city: '', state: '', region: '' };

export default function LeadBriefs() {
  const [briefs, setBriefs] = useState([]);
  const [isAdmin, setIsAdmin] = useState(false);
  const [cities, setCities] = useState([]);
  const [masterCities, setMasterCities] = useState([]);
  const [cityFilter, setCityFilter] = useState('all');
  const [statusFilter, setStatusFilter] = useState('all');
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState(null);
  const [showAdd, setShowAdd] = useState(false);
  const [addStep, setAddStep] = useState('dump'); // 'dump' → AI extract → 'form'
  const [dumpText, setDumpText] = useState('');
  const [extracting, setExtracting] = useState(false);
  const [form, setForm] = useState(EMPTY_FORM);
  const [showLeadForm, setShowLeadForm] = useState(false);
  const [leadForm, setLeadForm] = useState(EMPTY_LEAD);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (cityFilter !== 'all') params.set('city', cityFilter);
      if (statusFilter !== 'all') params.set('status', statusFilter);
      const [bR, cR] = await Promise.all([
        fetch(`${API}/api/lead-briefs?${params}`, { headers: authHeaders() }),
        fetch(`${API}/api/lead-briefs/cities`, { headers: authHeaders() }),
      ]);
      const b = await bR.json();
      setBriefs(b.briefs || []);
      setIsAdmin(!!b.is_admin);
      setCities((await cR.json()).cities || []);
    } catch { toast.error('Failed to load lead briefs'); }
    finally { setLoading(false); }
  }, [cityFilter, statusFilter]);

  useEffect(() => { load(); }, [load]);
  useEffect(() => {
    fetch(`${API}/api/master-locations/flat`, { headers: authHeaders() })
      .then((r) => r.json())
      .then((d) => setMasterCities((d.cities || []).map((c) => c.name).filter(Boolean).sort()))
      .catch(() => {});
  }, []);

  const counts = useMemo(() => ({
    new: briefs.filter((b) => b.status === 'new').length,
    reviewed: briefs.filter((b) => b.status === 'reviewed').length,
  }), [briefs]);

  const openAdd = () => { setForm(EMPTY_FORM); setDumpText(''); setAddStep('dump'); setShowAdd(true); };

  const extractWithAI = async () => {
    setExtracting(true);
    try {
      const r = await fetch(`${API}/api/lead-briefs/ai-extract`, { method: 'POST', headers: authHeaders(), body: JSON.stringify({ text: dumpText }) });
      const data = await r.json();
      if (!r.ok) throw new Error(data.detail || 'Extraction failed');
      setForm({ ...EMPTY_FORM, ...data.fields });
      setAddStep('form');
      toast.success('Fields extracted — review and save');
    } catch (e) { toast.error(typeof e.message === 'string' ? e.message : 'AI extraction failed'); }
    finally { setExtracting(false); }
  };

  const saveBrief = async () => {
    setBusy(true);
    try {
      const r = await fetch(`${API}/api/lead-briefs`, { method: 'POST', headers: authHeaders(), body: JSON.stringify(form) });
      if (!r.ok) throw new Error((await r.json()).detail || 'Failed');
      toast.success('Lead brief added');
      setShowAdd(false);
      setForm(EMPTY_FORM);
      load();
    } catch (e) { toast.error(typeof e.message === 'string' ? e.message : 'Failed to add brief'); }
    finally { setBusy(false); }
  };

  const markReviewed = async (brief) => {
    setBusy(true);
    try {
      await fetch(`${API}/api/lead-briefs/${brief.id}/review`, { method: 'POST', headers: authHeaders() });
      toast.success('Marked as reviewed');
      setSelected((s) => (s ? { ...s, status: 'reviewed' } : s));
      load();
    } catch { toast.error('Failed'); }
    finally { setBusy(false); }
  };

  const deleteBrief = async (brief) => {
    if (!window.confirm('Delete this lead brief?')) return;
    try {
      await fetch(`${API}/api/lead-briefs/${brief.id}`, { method: 'DELETE', headers: authHeaders() });
      toast.success('Brief deleted');
      setSelected(null);
      load();
    } catch { toast.error('Failed'); }
  };

  const openLeadForm = () => {
    setLeadForm({ ...EMPTY_LEAD, company: selected?.title || '', city: selected?.city || '', phone: selected?.phone || '', email: selected?.email || '' });
    setShowLeadForm(true);
  };

  const createLead = async () => {
    if (!leadForm.company.trim() || !leadForm.city.trim() || !leadForm.state.trim() || !leadForm.region.trim()) {
      toast.error('Company, city, state and region are required');
      return;
    }
    setBusy(true);
    try {
      const body = {
        ...leadForm, email: leadForm.email.trim() || undefined, country: 'India', status: 'new', source: 'Lead Brief',
        notes: `From lead brief "${selected?.title}" (${selected?.city}).${selected?.source_name ? ` Source: ${selected.source_name}.` : ''}`,
      };
      const r = await fetch(`${API}/api/leads`, { method: 'POST', headers: authHeaders(), body: JSON.stringify(body) });
      const data = await r.json();
      if (!r.ok) throw new Error(data.detail || 'Failed to create lead');
      const leadId = data.id || data.lead?.id;
      await fetch(`${API}/api/lead-briefs/${selected.id}/converted`, {
        method: 'POST', headers: authHeaders(),
        body: JSON.stringify({ lead_id: leadId, lead_company: leadForm.company }),
      });
      toast.success('Lead created from brief');
      setShowLeadForm(false);
      setSelected(null);
      load();
    } catch (e) { toast.error(typeof e.message === 'string' ? e.message : 'Failed to create lead'); }
    finally { setBusy(false); }
  };

  const statusPill = (s, converted) => converted
    ? <Badge className="bg-indigo-50 text-indigo-700 border border-indigo-200 hover:bg-indigo-50">Lead added</Badge>
    : s === 'new'
      ? <Badge className="bg-[#EAF1FF] text-[#002FA7] border border-[#B9CBF2] hover:bg-[#EAF1FF]">New</Badge>
      : <Badge className="bg-emerald-50 text-emerald-700 border border-emerald-200 hover:bg-emerald-50">Reviewed</Badge>;

  return (
    <div className="p-4 lg:p-6 max-w-[1300px] mx-auto space-y-4" data-testid="lead-briefs-page">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-xl font-bold tracking-tight text-slate-900 flex items-center gap-2">
          <NotebookPen className="h-5 w-5 text-[#002FA7]" /> Lead Briefs
        </h1>
        {isAdmin && (
          <Button className="bg-[#002FA7] hover:bg-[#00227A] rounded-sm" onClick={openAdd} data-testid="lb-add-btn">
            <Plus className="h-4 w-4 mr-1.5" /> Add Brief
          </Button>
        )}
      </div>
      <p className="text-sm text-slate-500 -mt-2">Market intel gathered from external sources — review each brief and add promising ones as leads.</p>

      <div className="flex flex-wrap items-center gap-2">
        <Select value={cityFilter} onValueChange={setCityFilter}>
          <SelectTrigger className="h-9 w-44 rounded-sm" data-testid="lb-city-filter"><SelectValue placeholder="City" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Cities</SelectItem>
            {cities.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}
          </SelectContent>
        </Select>
        {[['all', `All (${briefs.length})`], ['new', `New (${counts.new})`], ['reviewed', `Reviewed (${counts.reviewed})`]].map(([k, label]) => (
          <button key={k} type="button" onClick={() => setStatusFilter(k)}
            className={`h-8 rounded-full border px-3 text-[13px] font-medium transition-colors ${statusFilter === k
              ? 'bg-[#002FA7] border-[#002FA7] text-white'
              : 'bg-white border-slate-200 text-slate-600 hover:border-[#002FA7]/40 hover:text-[#002FA7]'}`}
            data-testid={`lb-status-${k}`}>
            {label}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-16 text-slate-400"><Loader2 className="h-5 w-5 animate-spin mr-2" /> Loading briefs…</div>
      ) : briefs.length === 0 ? (
        <div className="text-center py-16 text-slate-400 border border-dashed rounded-lg">
          No lead briefs {cityFilter !== 'all' ? `for ${cityFilter}` : 'yet'}.{isAdmin ? ' Use "Add Brief" to create one.' : ''}
        </div>
      ) : (
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
          {briefs.map((b) => (
            <button key={b.id} type="button" onClick={() => setSelected(b)}
              className="group text-left rounded-lg border border-slate-200 bg-white overflow-hidden hover:border-[#002FA7]/40 hover:shadow-md transition-all flex flex-col"
              data-testid={`lb-card-${b.id}`}>
              <BriefPhoto brief={b} className="w-full h-36" />
              <div className="p-5 flex flex-col flex-1">
              <div className="flex items-start justify-between gap-2 mb-2">
                <span className="text-[11px] font-semibold uppercase tracking-wider text-[#002FA7] flex items-center gap-1">
                  <MapPin className="h-3 w-3" /> {b.city} <span className="text-slate-300 font-normal">•</span>
                  <span className="text-slate-400 font-normal normal-case tracking-normal">{fmtDate(b.created_at)}</span>
                </span>
                {statusPill(b.status, b.converted_lead_id)}
              </div>
              <h3 className="text-base font-bold text-slate-900 leading-snug mb-1.5 group-hover:text-[#002FA7] transition-colors">{b.title}</h3>
              <p className="text-sm text-slate-500 leading-relaxed line-clamp-3 flex-1">{b.summary}</p>
              <span className="mt-3 inline-flex items-center gap-1 text-sm font-medium text-[#002FA7]">
                Read brief <ArrowRight className="h-3.5 w-3.5 group-hover:translate-x-0.5 transition-transform" />
              </span>
              </div>
            </button>
          ))}
        </div>
      )}

      {/* Detail dialog */}
      <Dialog open={!!selected} onOpenChange={(o) => !o && setSelected(null)}>
        <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto" data-testid="lb-detail-dialog">
          {selected && (
            <>
              <DialogHeader>
                <div className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-wider text-[#002FA7]">
                  <MapPin className="h-3 w-3" /> {selected.city}
                  <span className="text-slate-300">•</span>
                  <span className="text-slate-400 font-normal normal-case tracking-normal">{fmtDate(selected.created_at)}{selected.created_by_name ? ` · ${selected.created_by_name}` : ''}</span>
                  <span className="ml-auto">{statusPill(selected.status, selected.converted_lead_id)}</span>
                </div>
                <DialogTitle className="text-lg leading-snug pr-6">{selected.title}</DialogTitle>
                {selected.source_name && (
                  <DialogDescription className="flex items-center gap-1.5">
                    Source: {selected.source_url
                      ? <a href={selected.source_url} target="_blank" rel="noreferrer" className="text-[#002FA7] underline underline-offset-2 inline-flex items-center gap-1">{selected.source_name}<ExternalLink className="h-3 w-3" /></a>
                      : selected.source_name}
                  </DialogDescription>
                )}
              </DialogHeader>
              <div className="flex gap-4">
                <BriefPhoto brief={selected} className="w-24 h-24 rounded-md shrink-0" />
                <div className="text-sm text-slate-700 leading-relaxed whitespace-pre-wrap flex-1" data-testid="lb-detail-content">{selected.content}</div>
              </div>
              {(selected.linkedin_url || selected.instagram_url || selected.email || selected.phone) && (
                <div className="rounded-md border border-slate-200 bg-slate-50/60 p-3 space-y-1.5 text-sm" data-testid="lb-detail-contacts">
                  {selected.linkedin_url && (
                    <p className="flex items-center gap-2"><Linkedin className="h-4 w-4 text-[#0A66C2] shrink-0" />
                      <a href={selected.linkedin_url} target="_blank" rel="noreferrer" className="text-[#002FA7] underline underline-offset-2 break-all">{selected.linkedin_url}</a></p>
                  )}
                  {selected.instagram_url && (
                    <p className="flex items-center gap-2"><Instagram className="h-4 w-4 text-[#E1306C] shrink-0" />
                      <a href={selected.instagram_url} target="_blank" rel="noreferrer" className="text-[#002FA7] underline underline-offset-2 break-all">{selected.instagram_url}</a></p>
                  )}
                  {selected.email && (
                    <p className="flex items-center gap-2"><Mail className="h-4 w-4 text-slate-400 shrink-0" />
                      <a href={`mailto:${selected.email}`} className="text-slate-700">{selected.email}</a></p>
                  )}
                  {selected.phone && (
                    <p className="flex items-center gap-2"><Phone className="h-4 w-4 text-slate-400 shrink-0" />
                      <a href={`tel:${selected.phone}`} className="text-slate-700">{selected.phone}</a></p>
                  )}
                </div>
              )}
              {selected.status === 'reviewed' && selected.reviewed_by_name && (
                <p className="text-xs text-slate-400">Reviewed by {selected.reviewed_by_name} on {fmtDate(selected.reviewed_at)}</p>
              )}
              {selected.converted_lead_company && (
                <p className="text-xs text-indigo-600">Added as lead: {selected.converted_lead_company}</p>
              )}
              <DialogFooter className="flex-wrap gap-2">
                {isAdmin && (
                  <Button variant="outline" className="text-red-600 border-red-200 hover:bg-red-50 mr-auto" onClick={() => deleteBrief(selected)} data-testid="lb-delete-btn">
                    <Trash2 className="h-4 w-4 mr-1.5" /> Delete
                  </Button>
                )}
                {selected.status === 'new' && (
                  <Button variant="outline" disabled={busy} onClick={() => markReviewed(selected)} data-testid="lb-review-btn">
                    <CheckCircle2 className="h-4 w-4 mr-1.5 text-emerald-600" /> Mark Reviewed
                  </Button>
                )}
                {!selected.converted_lead_id && (
                  <Button className="bg-[#002FA7] hover:bg-[#00227A]" onClick={openLeadForm} data-testid="lb-add-lead-btn">
                    <UserPlus className="h-4 w-4 mr-1.5" /> Add as Lead
                  </Button>
                )}
              </DialogFooter>
            </>
          )}
        </DialogContent>
      </Dialog>

      {/* Add brief dialog (admin) */}
      <Dialog open={showAdd} onOpenChange={setShowAdd}>
        <DialogContent className="max-w-xl" data-testid="lb-add-dialog">
          {addStep === 'dump' ? (
            <>
              <DialogHeader>
                <DialogTitle className="flex items-center gap-2"><Sparkles className="h-4 w-4 text-[#002FA7]" /> Add Lead Brief</DialogTitle>
                <DialogDescription>
                  Dump everything you've gathered — text from articles, LinkedIn bios, notes, contact details. AI will sort it into the right fields for you to review.
                </DialogDescription>
              </DialogHeader>
              <Textarea
                placeholder={"Paste the raw information here…\n\ne.g. article text, a LinkedIn about section, phone numbers, emails, profile links — all in one go."}
                rows={12}
                value={dumpText}
                onChange={(e) => setDumpText(e.target.value)}
                data-testid="lb-dump-text"
              />
              <DialogFooter className="flex-wrap gap-2">
                <button type="button" className="mr-auto text-sm text-slate-500 underline underline-offset-2 hover:text-[#002FA7]"
                  onClick={() => { setForm(EMPTY_FORM); setAddStep('form'); }} data-testid="lb-skip-ai">
                  Fill manually instead
                </button>
                <Button variant="outline" onClick={() => setShowAdd(false)}>Cancel</Button>
                <Button className="bg-[#002FA7] hover:bg-[#00227A]" disabled={extracting || dumpText.trim().length < 20} onClick={extractWithAI} data-testid="lb-extract-btn">
                  {extracting ? <><Loader2 className="h-4 w-4 animate-spin mr-1.5" /> Extracting…</> : <><Sparkles className="h-4 w-4 mr-1.5" /> Extract with AI</>}
                </Button>
              </DialogFooter>
            </>
          ) : (
            <>
          <DialogHeader>
            <DialogTitle>Review &amp; Save Brief</DialogTitle>
            <DialogDescription>AI has pre-filled the fields below — correct anything before saving.</DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <Input placeholder="Title *" value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} data-testid="lb-form-title" />
            <div className="grid grid-cols-2 gap-3">
              <Select value={form.city} onValueChange={(v) => setForm({ ...form, city: v })}>
                <SelectTrigger data-testid="lb-form-city"><SelectValue placeholder="City *" /></SelectTrigger>
                <SelectContent>
                  {form.city && !masterCities.includes(form.city) && <SelectItem value={form.city}>{form.city}</SelectItem>}
                  {masterCities.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}
                </SelectContent>
              </Select>
              <Input placeholder="Source name (optional)" value={form.source_name} onChange={(e) => setForm({ ...form, source_name: e.target.value })} data-testid="lb-form-source" />
            </div>
            <Input placeholder="Source URL (optional)" value={form.source_url} onChange={(e) => setForm({ ...form, source_url: e.target.value })} data-testid="lb-form-url" />
            <div className="grid grid-cols-2 gap-3">
              <Input placeholder="LinkedIn profile URL" value={form.linkedin_url} onChange={(e) => setForm({ ...form, linkedin_url: e.target.value })} data-testid="lb-form-linkedin" />
              <Input placeholder="Instagram profile URL" value={form.instagram_url} onChange={(e) => setForm({ ...form, instagram_url: e.target.value })} data-testid="lb-form-instagram" />
            </div>
            <Input placeholder="Photo URL (optional — else LinkedIn/Instagram photo is used)" value={form.image_url} onChange={(e) => setForm({ ...form, image_url: e.target.value })} data-testid="lb-form-image" />
            <div className="grid grid-cols-2 gap-3">
              <Input placeholder="Email address" type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} data-testid="lb-form-email" />
              <Input placeholder="Phone number" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} data-testid="lb-form-phone" />
            </div>
            <Textarea placeholder="Short summary shown on the card (optional — first lines of content used if empty)" rows={2} value={form.summary} onChange={(e) => setForm({ ...form, summary: e.target.value })} data-testid="lb-form-summary" />
            <Textarea placeholder="Full information dump *" rows={6} value={form.content} onChange={(e) => setForm({ ...form, content: e.target.value })} data-testid="lb-form-content" />
          </div>
          <DialogFooter className="flex-wrap gap-2">
            <button type="button" className="mr-auto text-sm text-slate-500 underline underline-offset-2 hover:text-[#002FA7]" onClick={() => setAddStep('dump')} data-testid="lb-back-to-dump">
              ← Back to info dump
            </button>
            <Button variant="outline" onClick={() => setShowAdd(false)}>Cancel</Button>
            <Button className="bg-[#002FA7] hover:bg-[#00227A]" disabled={busy || !form.title.trim() || !form.city.trim() || !form.content.trim()} onClick={saveBrief} data-testid="lb-form-save">
              {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Save Brief'}
            </Button>
          </DialogFooter>
            </>
          )}
        </DialogContent>
      </Dialog>

      {/* Add-as-lead mini form */}
      <Dialog open={showLeadForm} onOpenChange={setShowLeadForm}>
        <DialogContent className="max-w-md" data-testid="lb-lead-dialog">
          <DialogHeader>
            <DialogTitle>Add as Lead</DialogTitle>
            <DialogDescription>Creates a lead in the Leads module linked to this brief.</DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <Input placeholder="Company / Business name *" value={leadForm.company} onChange={(e) => setLeadForm({ ...leadForm, company: e.target.value })} data-testid="lb-lead-company" />
            <div className="grid grid-cols-2 gap-3">
              <Input placeholder="Contact person" value={leadForm.contact_person} onChange={(e) => setLeadForm({ ...leadForm, contact_person: e.target.value })} data-testid="lb-lead-contact" />
              <Input placeholder="Phone" value={leadForm.phone} onChange={(e) => setLeadForm({ ...leadForm, phone: e.target.value })} data-testid="lb-lead-phone" />
            </div>
            <Input placeholder="Email" type="email" value={leadForm.email} onChange={(e) => setLeadForm({ ...leadForm, email: e.target.value })} data-testid="lb-lead-email" />
            <div className="grid grid-cols-3 gap-3">
              <Input placeholder="City *" value={leadForm.city} onChange={(e) => setLeadForm({ ...leadForm, city: e.target.value })} data-testid="lb-lead-city" />
              <Input placeholder="State *" value={leadForm.state} onChange={(e) => setLeadForm({ ...leadForm, state: e.target.value })} data-testid="lb-lead-state" />
              <Input placeholder="Region *" value={leadForm.region} onChange={(e) => setLeadForm({ ...leadForm, region: e.target.value })} data-testid="lb-lead-region" />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowLeadForm(false)}>Cancel</Button>
            <Button className="bg-[#002FA7] hover:bg-[#00227A]" disabled={busy} onClick={createLead} data-testid="lb-lead-save">
              {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Create Lead'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
