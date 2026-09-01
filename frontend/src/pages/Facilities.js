import React, { useState, useEffect, useCallback } from 'react';
import { Card, CardContent } from '../components/ui/card';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Label } from '../components/ui/label';
import { Textarea } from '../components/ui/textarea';
import { Badge } from '../components/ui/badge';
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from '../components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '../components/ui/dialog';
import { Accordion, AccordionItem, AccordionTrigger, AccordionContent } from '../components/ui/accordion';
import { Building2, Plus, Pencil, Trash2, MapPin, Phone, Mail, User, Layers, Paperclip, Download, Upload, FileText, Image as ImageIcon, X, ExternalLink } from 'lucide-react';
import { toast } from 'sonner';

const API_URL = process.env.REACT_APP_BACKEND_URL;
const authHeaders = () => ({ Authorization: `Bearer ${localStorage.getItem('session_token')}`, 'Content-Type': 'application/json' });

const EMPTY_FAC = { facility_name: '', facility_type: '', google_address: '', contact_person: '', contact_phone: '', contact_email: '', notes: '' };
const fmtSize = (b) => (b > 1048576 ? `${(b / 1048576).toFixed(1)} MB` : `${Math.max(1, Math.round(b / 1024))} KB`);

const AuthImg = ({ src, alt, className, onClick, testid }) => {
  const [url, setUrl] = useState(null);
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    let obj;
    fetch(src, { headers: { Authorization: `Bearer ${localStorage.getItem('session_token')}` } })
      .then((r) => (r.ok ? r.blob() : Promise.reject()))
      .then((b) => { obj = URL.createObjectURL(b); setUrl(obj); })
      .catch(() => setFailed(true));
    return () => { if (obj) URL.revokeObjectURL(obj); };
  }, [src]);
  if (failed) {
    return (
      <div className={`${className} bg-slate-100 flex flex-col items-center justify-center gap-1 text-slate-400`} data-testid={testid}>
        <ImageIcon className="h-5 w-5" />
        <span className="text-[9px] font-medium uppercase">missing</span>
      </div>
    );
  }
  if (!url) return <div className={`${className} bg-slate-100 animate-pulse`} data-testid={testid} />;
  return <img src={url} alt={alt} className={className} onClick={onClick} data-testid={testid} />;
};

export default function Facilities() {
  const [facilities, setFacilities] = useState([]);
  const [facilityTypes, setFacilityTypes] = useState([]);
  const [loading, setLoading] = useState(true);
  const [formOpen, setFormOpen] = useState(false);
  const [form, setForm] = useState(EMPTY_FAC);
  const [editId, setEditId] = useState(null);
  const [saving, setSaving] = useState(false);
  const [detail, setDetail] = useState(null); // facility for detail dialog
  const [newFloor, setNewFloor] = useState('');
  const [areaInputs, setAreaInputs] = useState({}); // floorId -> text
  const [uploading, setUploading] = useState(false);
  const [preview, setPreview] = useState(null); // {url, filename}

  const load = useCallback(async () => {
    try {
      const res = await fetch(`${API_URL}/api/facilities`, { headers: authHeaders() });
      if (!res.ok) throw new Error();
      const data = await res.json();
      setFacilities(data.facilities || []);
      setFacilityTypes(data.facility_types || []);
      setDetail((d) => (d ? (data.facilities || []).find((f) => f.id === d.id) || null : null));
    } catch {
      toast.error('Failed to load facilities');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const openCreate = () => { setForm(EMPTY_FAC); setEditId(null); setFormOpen(true); };
  const openEdit = (f) => {
    setForm({ facility_name: f.facility_name || '', facility_type: f.facility_type || '', google_address: f.google_address || '', contact_person: f.contact_person || '', contact_phone: f.contact_phone || '', contact_email: f.contact_email || '', notes: f.notes || '' });
    setEditId(f.id); setFormOpen(true);
  };

  const saveFacility = async () => {
    if (!form.facility_name.trim() || !form.facility_type) { toast.error('Facility name and type are required'); return; }
    setSaving(true);
    try {
      const res = await fetch(`${API_URL}/api/facilities${editId ? `/${editId}` : ''}`, {
        method: editId ? 'PUT' : 'POST', headers: authHeaders(), body: JSON.stringify(form),
      });
      if (!res.ok) throw new Error();
      toast.success(editId ? 'Facility updated' : 'Facility created');
      setFormOpen(false);
      await load();
    } catch { toast.error('Failed to save facility'); } finally { setSaving(false); }
  };

  const deleteFacility = async (f) => {
    if (!window.confirm(`Delete facility "${f.facility_name}" along with its floors, areas and files?`)) return;
    const res = await fetch(`${API_URL}/api/facilities/${f.id}`, { method: 'DELETE', headers: authHeaders() });
    if (res.ok) { toast.success('Facility deleted'); if (detail?.id === f.id) setDetail(null); load(); }
    else toast.error('Failed to delete facility');
  };

  const addFloor = async () => {
    const name = newFloor.trim();
    if (!name) return;
    const res = await fetch(`${API_URL}/api/facilities/${detail.id}/floors`, { method: 'POST', headers: authHeaders(), body: JSON.stringify({ name }) });
    if (res.ok) { setNewFloor(''); load(); } else toast.error('Failed to add floor');
  };

  const deleteFloor = async (floorId) => {
    if (!window.confirm('Delete this floor and its areas?')) return;
    const res = await fetch(`${API_URL}/api/facilities/${detail.id}/floors/${floorId}`, { method: 'DELETE', headers: authHeaders() });
    if (res.ok) load(); else toast.error('Failed to delete floor');
  };

  const addArea = async (floorId) => {
    const name = (areaInputs[floorId] || '').trim();
    if (!name) return;
    const res = await fetch(`${API_URL}/api/facilities/${detail.id}/floors/${floorId}/areas`, { method: 'POST', headers: authHeaders(), body: JSON.stringify({ name }) });
    if (res.ok) { setAreaInputs((s) => ({ ...s, [floorId]: '' })); load(); } else toast.error('Failed to add area');
  };

  const deleteArea = async (floorId, areaId) => {
    const res = await fetch(`${API_URL}/api/facilities/${detail.id}/floors/${floorId}/areas/${areaId}`, { method: 'DELETE', headers: authHeaders() });
    if (res.ok) load(); else toast.error('Failed to remove area');
  };

  const uploadFile = async (category, file) => {
    if (!file) return;
    setUploading(true);
    try {
      const fd = new FormData();
      fd.append('file', file);
      fd.append('category', category);
      const res = await fetch(`${API_URL}/api/facilities/${detail.id}/files`, {
        method: 'POST', headers: { Authorization: `Bearer ${localStorage.getItem('session_token')}` }, body: fd,
      });
      if (!res.ok) { const e = await res.json().catch(() => ({})); throw new Error(e.detail || 'Upload failed'); }
      const meta = await res.json();
      toast.success(`Uploaded as ${meta.filename}`);
      load();
    } catch (e) { toast.error(e.message || 'Upload failed'); } finally { setUploading(false); }
  };

  const downloadFile = async (fileMeta) => {
    try {
      const res = await fetch(`${API_URL}/api/facilities/${detail.id}/files/${fileMeta.id}`, { headers: { Authorization: `Bearer ${localStorage.getItem('session_token')}` } });
      if (!res.ok) throw new Error();
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url; a.download = fileMeta.filename; a.click();
      URL.revokeObjectURL(url);
    } catch { toast.error('Download failed'); }
  };

  const previewFile = async (fileMeta) => {
    try {
      const res = await fetch(`${API_URL}/api/facilities/${detail.id}/files/${fileMeta.id}`, { headers: { Authorization: `Bearer ${localStorage.getItem('session_token')}` } });
      if (!res.ok) throw new Error();
      const blob = await res.blob();
      setPreview({ url: URL.createObjectURL(blob), filename: fileMeta.filename, isImage: (fileMeta.content_type || '').startsWith('image/') });
    } catch { toast.error('Preview failed'); }
  };

  const deleteFile = async (fileMeta) => {
    if (!window.confirm(`Delete ${fileMeta.filename}?`)) return;
    const res = await fetch(`${API_URL}/api/facilities/${detail.id}/files/${fileMeta.id}`, { method: 'DELETE', headers: authHeaders() });
    if (res.ok) { toast.success('File deleted'); load(); } else toast.error('Failed to delete file');
  };

  const photos = (detail?.attachments || []).filter((a) => a.category === 'photo');
  const documents = (detail?.attachments || []).filter((a) => a.category !== 'photo');

  return (
    <div className="p-6 space-y-6" data-testid="facilities-page">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2"><Building2 className="h-6 w-6" /> Facilities</h1>
          <p className="text-sm text-muted-foreground">Organization-owned facilities — locations, contacts, floors, areas and documents</p>
        </div>
        <Button onClick={openCreate} data-testid="add-facility-btn"><Plus className="h-4 w-4 mr-1.5" /> Add Facility</Button>
      </div>

      {loading ? (
        <div className="text-sm text-muted-foreground">Loading facilities…</div>
      ) : facilities.length === 0 ? (
        <Card><CardContent className="py-12 text-center text-muted-foreground" data-testid="facilities-empty">
          <Building2 className="h-10 w-10 mx-auto mb-3 opacity-40" />
          No facilities yet. Click “Add Facility” to register your factory, warehouse, offices or guest houses.
        </CardContent></Card>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {facilities.map((f) => (
            <Card key={f.id} className="hover:shadow-md transition-shadow cursor-pointer" onClick={() => setDetail(f)} data-testid={`facility-card-${f.id}`}>
              <CardContent className="p-4 space-y-2">
                <div className="flex items-start justify-between gap-2">
                  <div className="font-semibold">{f.facility_name}</div>
                  <Badge variant="outline" className="whitespace-nowrap">{f.facility_type}</Badge>
                </div>
                {f.google_address && (
                  <div className="text-xs text-muted-foreground flex items-start gap-1.5"><MapPin className="h-3.5 w-3.5 mt-0.5 shrink-0" /><span className="line-clamp-2">{f.google_address}</span></div>
                )}
                {f.contact_person && (
                  <div className="text-xs text-muted-foreground flex items-center gap-1.5"><User className="h-3.5 w-3.5" />{f.contact_person}{f.contact_phone ? ` · ${f.contact_phone}` : ''}</div>
                )}
                <div className="flex items-center gap-3 pt-1 text-xs text-muted-foreground">
                  <span className="flex items-center gap-1"><Layers className="h-3.5 w-3.5" />{(f.floors || []).length} floors</span>
                  <span className="flex items-center gap-1"><Paperclip className="h-3.5 w-3.5" />{(f.attachments || []).length} files</span>
                </div>
                <div className="flex justify-end gap-1 pt-1" onClick={(e) => e.stopPropagation()}>
                  <Button size="sm" variant="ghost" onClick={() => openEdit(f)} data-testid={`edit-facility-${f.id}`}><Pencil className="h-3.5 w-3.5" /></Button>
                  <Button size="sm" variant="ghost" className="text-red-600" onClick={() => deleteFacility(f)} data-testid={`delete-facility-${f.id}`}><Trash2 className="h-3.5 w-3.5" /></Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Create / Edit dialog */}
      <Dialog open={formOpen} onOpenChange={setFormOpen}>
        <DialogContent className="max-w-lg" data-testid="facility-form-dialog">
          <DialogHeader>
            <DialogTitle>{editId ? 'Edit Facility' : 'Add Facility'}</DialogTitle>
            <DialogDescription>Capture the facility details, address and contact information</DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <Label>Facility Name *</Label>
              <Input value={form.facility_name} onChange={(e) => setForm({ ...form, facility_name: e.target.value })} placeholder="e.g. Nyla Bangalore Factory" data-testid="facility-name-input" />
            </div>
            <div>
              <Label>Facility Type *</Label>
              <Select value={form.facility_type} onValueChange={(v) => setForm({ ...form, facility_type: v })}>
                <SelectTrigger data-testid="facility-type-select"><SelectValue placeholder="Select type" /></SelectTrigger>
                <SelectContent>
                  {facilityTypes.map((t) => <SelectItem key={t} value={t}>{t}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Google Address / Maps Link</Label>
              <Textarea rows={2} value={form.google_address} onChange={(e) => setForm({ ...form, google_address: e.target.value })} placeholder="Full address or Google Maps link" data-testid="facility-address-input" />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Contact Person</Label>
                <Input value={form.contact_person} onChange={(e) => setForm({ ...form, contact_person: e.target.value })} data-testid="facility-contact-person-input" />
              </div>
              <div>
                <Label>Contact Phone</Label>
                <Input value={form.contact_phone} onChange={(e) => setForm({ ...form, contact_phone: e.target.value })} data-testid="facility-contact-phone-input" />
              </div>
            </div>
            <div>
              <Label>Contact Email</Label>
              <Input value={form.contact_email} onChange={(e) => setForm({ ...form, contact_email: e.target.value })} data-testid="facility-contact-email-input" />
            </div>
            <div>
              <Label>Notes</Label>
              <Textarea rows={2} value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} data-testid="facility-notes-input" />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setFormOpen(false)}>Cancel</Button>
            <Button onClick={saveFacility} disabled={saving} data-testid="save-facility-btn">{saving ? 'Saving…' : 'Save Facility'}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Detail dialog: floors/areas + files */}
      <Dialog open={!!detail} onOpenChange={(o) => { if (!o) setDetail(null); }}>
        <DialogContent className="max-w-3xl max-h-[85vh] overflow-y-auto" data-testid="facility-detail-dialog">
          {detail && (
            <>
              <DialogHeader>
                <DialogTitle className="flex items-center gap-2"><Building2 className="h-5 w-5" />{detail.facility_name}<Badge variant="outline">{detail.facility_type}</Badge></DialogTitle>
                <DialogDescription className="space-y-1">
                  {detail.google_address && (
                    <span className="flex items-start gap-1.5"><MapPin className="h-3.5 w-3.5 mt-0.5 shrink-0" />
                      {/^https?:\/\//.test(detail.google_address.trim()) ? (
                        <a href={detail.google_address.trim()} target="_blank" rel="noreferrer" className="text-blue-600 hover:underline flex items-center gap-1">Open in Google Maps <ExternalLink className="h-3 w-3" /></a>
                      ) : detail.google_address}
                    </span>
                  )}
                </DialogDescription>
              </DialogHeader>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 text-sm">
                {detail.contact_person && <div className="flex items-center gap-1.5"><User className="h-4 w-4 text-muted-foreground" />{detail.contact_person}</div>}
                {detail.contact_phone && <div className="flex items-center gap-1.5"><Phone className="h-4 w-4 text-muted-foreground" />{detail.contact_phone}</div>}
                {detail.contact_email && <div className="flex items-center gap-1.5"><Mail className="h-4 w-4 text-muted-foreground" />{detail.contact_email}</div>}
              </div>
              {detail.notes && <p className="text-sm text-muted-foreground">{detail.notes}</p>}

              {/* Floors & Areas */}
              <div className="space-y-2">
                <h3 className="font-semibold flex items-center gap-2"><Layers className="h-4 w-4" /> Floors & Areas</h3>
                <div className="flex gap-2">
                  <Input placeholder="Add a floor (e.g. Ground Floor, Terrace, Basement)" value={newFloor} onChange={(e) => setNewFloor(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && addFloor()} data-testid="add-floor-input" />
                  <Button onClick={addFloor} data-testid="add-floor-btn"><Plus className="h-4 w-4" /></Button>
                </div>
                {(detail.floors || []).length === 0 ? (
                  <p className="text-xs text-muted-foreground">No floors captured yet.</p>
                ) : (
                  <Accordion type="multiple" className="border rounded-md divide-y">
                    {detail.floors.map((fl) => (
                      <AccordionItem key={fl.id} value={fl.id} className="px-3">
                        <AccordionTrigger className="py-2.5 hover:no-underline" data-testid={`floor-row-${fl.id}`}>
                          <span className="flex items-center gap-2 text-sm font-medium">{fl.name}
                            <Badge variant="secondary" className="text-xs">{(fl.areas || []).length} areas</Badge>
                          </span>
                        </AccordionTrigger>
                        <AccordionContent className="pb-3 space-y-2">
                          <div className="flex flex-wrap gap-1.5">
                            {(fl.areas || []).map((ar) => (
                              <Badge key={ar.id} variant="outline" className="gap-1 pr-1" data-testid={`area-chip-${ar.id}`}>
                                {ar.name}
                                <button onClick={() => deleteArea(fl.id, ar.id)} className="hover:text-red-600" data-testid={`delete-area-${ar.id}`}><X className="h-3 w-3" /></button>
                              </Badge>
                            ))}
                            {(fl.areas || []).length === 0 && <span className="text-xs text-muted-foreground">No areas yet — e.g. Storage Area, Rest Rooms, RFC Area, Finished Goods Area</span>}
                          </div>
                          <div className="flex gap-2">
                            <Input className="h-8 text-sm" placeholder="Add area" value={areaInputs[fl.id] || ''} onChange={(e) => setAreaInputs((s) => ({ ...s, [fl.id]: e.target.value }))} onKeyDown={(e) => e.key === 'Enter' && addArea(fl.id)} data-testid={`add-area-input-${fl.id}`} />
                            <Button size="sm" variant="outline" onClick={() => addArea(fl.id)} data-testid={`add-area-btn-${fl.id}`}><Plus className="h-3.5 w-3.5" /></Button>
                            <Button size="sm" variant="ghost" className="text-red-600" onClick={() => deleteFloor(fl.id)} data-testid={`delete-floor-${fl.id}`}><Trash2 className="h-3.5 w-3.5" /></Button>
                          </div>
                        </AccordionContent>
                      </AccordionItem>
                    ))}
                  </Accordion>
                )}
              </div>

              {/* Photos */}
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <h3 className="font-semibold flex items-center gap-2"><ImageIcon className="h-4 w-4" /> Photos</h3>
                  <label>
                    <input type="file" accept="image/*" className="hidden" onChange={(e) => { uploadFile('photo', e.target.files?.[0]); e.target.value = ''; }} data-testid="upload-photo-input" />
                    <Button size="sm" variant="outline" disabled={uploading} asChild><span className="cursor-pointer"><Upload className="h-3.5 w-3.5 mr-1.5" />{uploading ? 'Uploading…' : 'Upload Photo'}</span></Button>
                  </label>
                </div>
                {photos.length === 0 ? <p className="text-xs text-muted-foreground">No photos uploaded.</p> : (
                  <div className="grid grid-cols-3 sm:grid-cols-5 gap-2">
                    {photos.map((p) => (
                      <div key={p.id} className="group relative">
                        <AuthImg src={`${API_URL}/api/facilities/${detail.id}/files/${p.id}`} alt={p.filename} className="h-24 w-full object-cover rounded-md border cursor-pointer" onClick={() => previewFile(p)} testid={`photo-thumb-${p.id}`} />
                        <div className="absolute inset-x-0 bottom-0 bg-black/60 text-white text-[9px] px-1 py-0.5 rounded-b-md truncate">{p.filename}</div>
                        <div className="absolute top-1 right-1 hidden group-hover:flex gap-1">
                          <button className="bg-white/90 rounded p-1" onClick={() => downloadFile(p)} data-testid={`download-photo-${p.id}`}><Download className="h-3 w-3" /></button>
                          <button className="bg-white/90 rounded p-1 text-red-600" onClick={() => deleteFile(p)} data-testid={`delete-photo-${p.id}`}><Trash2 className="h-3 w-3" /></button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Documents */}
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <h3 className="font-semibold flex items-center gap-2"><FileText className="h-4 w-4" /> Documents</h3>
                  <label>
                    <input type="file" className="hidden" onChange={(e) => { uploadFile('document', e.target.files?.[0]); e.target.value = ''; }} data-testid="upload-document-input" />
                    <Button size="sm" variant="outline" disabled={uploading} asChild><span className="cursor-pointer"><Upload className="h-3.5 w-3.5 mr-1.5" />{uploading ? 'Uploading…' : 'Upload Document'}</span></Button>
                  </label>
                </div>
                {documents.length === 0 ? <p className="text-xs text-muted-foreground">No documents uploaded.</p> : (
                  <div className="border rounded-md divide-y">
                    {documents.map((d) => (
                      <div key={d.id} className="flex items-center justify-between px-3 py-2 text-sm" data-testid={`doc-row-${d.id}`}>
                        <div className="flex items-center gap-2 min-w-0">
                          <FileText className="h-4 w-4 text-muted-foreground shrink-0" />
                          <div className="min-w-0">
                            <div className="font-medium truncate">{d.filename}</div>
                            <div className="text-xs text-muted-foreground truncate">{d.original_filename} · {fmtSize(d.size)} · {d.uploaded_by}</div>
                          </div>
                        </div>
                        <div className="flex gap-1 shrink-0">
                          <Button size="sm" variant="ghost" onClick={() => previewFile(d)} data-testid={`preview-doc-${d.id}`}><ExternalLink className="h-3.5 w-3.5" /></Button>
                          <Button size="sm" variant="ghost" onClick={() => downloadFile(d)} data-testid={`download-doc-${d.id}`}><Download className="h-3.5 w-3.5" /></Button>
                          <Button size="sm" variant="ghost" className="text-red-600" onClick={() => deleteFile(d)} data-testid={`delete-doc-${d.id}`}><Trash2 className="h-3.5 w-3.5" /></Button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>

      {/* Preview dialog */}
      <Dialog open={!!preview} onOpenChange={(o) => { if (!o) { URL.revokeObjectURL(preview?.url); setPreview(null); } }}>
        <DialogContent className="max-w-4xl" data-testid="file-preview-dialog">
          <DialogHeader><DialogTitle className="text-sm">{preview?.filename}</DialogTitle></DialogHeader>
          {preview && (preview.isImage ? (
            <img src={preview.url} alt={preview.filename} className="max-h-[70vh] w-auto mx-auto rounded" />
          ) : (
            <iframe src={preview.url} title={preview.filename} className="w-full h-[70vh] rounded border" />
          ))}
        </DialogContent>
      </Dialog>
    </div>
  );
}
