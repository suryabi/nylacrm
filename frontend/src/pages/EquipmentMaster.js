import React, { useState, useEffect, useCallback } from 'react';
import { Card, CardContent } from '../components/ui/card';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from '../components/ui/dropdown-menu';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Label } from '../components/ui/label';
import { Textarea } from '../components/ui/textarea';
import { Badge } from '../components/ui/badge';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '../components/ui/tabs';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '../components/ui/dialog';
import { Cog, Plus, Pencil, Trash2, Search, Wrench, RefreshCw, Star, ShoppingCart, CalendarCheck, Repeat, Paperclip, Download, Upload, FileText, Image as ImageIcon, BadgeCheck, ReceiptText, Camera as CameraIcon, MapPin, AlertTriangle, Layers, Users, MoreVertical, X, Filter, BookOpen, QrCode } from 'lucide-react';
import EquipmentInstructions from '../components/EquipmentInstructions';
import { toast } from 'sonner';
import { MaintenanceProfile } from '../components/MaintenanceProfile';
import { FormSection } from '../components/FormSection';

const API_URL = process.env.REACT_APP_BACKEND_URL;
const authHeaders = () => ({ Authorization: `Bearer ${localStorage.getItem('session_token')}`, 'Content-Type': 'application/json' });

const FREQ_OPTIONS = [
  { label: 'Daily', value: 1 },
  { label: 'Alternate Days', value: 2 },
  { label: 'Weekly', value: 7 },
  { label: 'Every 10 days', value: 10 },
  { label: 'Bi-Weekly', value: 14 },
  { label: 'Monthly', value: 30 },
  { label: 'Quarterly', value: 90 },
];
const freqLabel = (days) => (FREQ_OPTIONS.find((o) => o.value === Number(days)) || {}).label || (days ? `Every ${days} days` : null);

const AssignStaffDialog = ({ equipment, onClose }) => {
  const [users, setUsers] = useState([]);
  const [sel, setSel] = useState(() => new Set(equipment.maintenance_staff_ids || []));
  const [roleFilter, setRoleFilter] = useState('');
  const [search, setSearch] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    fetch(`${API_URL}/api/production/qc-team`, { headers: authHeaders() })
      .then((r) => r.json())
      .then((d) => setUsers(Array.isArray(d) ? d : []))
      .catch(() => toast.error('Could not load factory staff'));
  }, []);

  const roles = [...new Set(users.map((u) => u.role).filter(Boolean))].sort();
  const filtered = users.filter((u) =>
    (!roleFilter || u.role === roleFilter) &&
    (!search || `${u.name || ''} ${u.email || ''}`.toLowerCase().includes(search.toLowerCase())));
  const grouped = {};
  filtered.forEach((u) => { const r = u.role || 'No Role'; (grouped[r] = grouped[r] || []).push(u); });

  const toggle = (id) => setSel((s) => { const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n; });

  const save = async () => {
    setSaving(true);
    try {
      const res = await fetch(`${API_URL}/api/production/equipment/${equipment.id}/maintenance-staff`, {
        method: 'PUT', headers: authHeaders(), body: JSON.stringify({ user_ids: [...sel] }),
      });
      if (!res.ok) throw new Error((await res.json()).detail || 'Save failed');
      const d = await res.json();
      toast.success(d.maintenance_staff.length ? `${d.maintenance_staff.length} factory staff assigned` : 'Assignment cleared — any factory staff can record maintenance');
      onClose(true);
    } catch (e) { toast.error(e.message); } finally { setSaving(false); }
  };

  return (
    <Dialog open onOpenChange={() => onClose(false)}>
      <DialogContent className="max-w-lg" data-testid="assign-staff-dialog">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2"><Users className="h-5 w-5 text-blue-600" /> Assign Maintenance Staff</DialogTitle>
          <DialogDescription>{equipment.name} — only assigned factory staff (verified via Face ID / PIN) can record maintenance via QR scan. Leave empty to allow any factory staff.</DialogDescription>
        </DialogHeader>
        <div className="flex gap-2">
          <div className="relative flex-1">
            <Search className="h-4 w-4 absolute left-2.5 top-2.5 text-slate-400" />
            <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search name…" className="pl-8 h-9" data-testid="assign-staff-search" />
          </div>
          <select value={roleFilter} onChange={(e) => setRoleFilter(e.target.value)}
            className="h-9 rounded-md border border-input bg-background px-2 text-sm max-w-[180px]" data-testid="assign-staff-role-filter">
            <option value="">All roles</option>
            {roles.map((r) => <option key={r} value={r}>{r}</option>)}
          </select>
        </div>
        <div className="max-h-[320px] overflow-y-auto space-y-3 pr-1" data-testid="assign-staff-list">
          {Object.keys(grouped).sort().map((role) => (
            <div key={role}>
              <p className="text-[11px] font-bold text-slate-500 uppercase tracking-wide mb-1">{role} ({grouped[role].length})</p>
              <div className="space-y-1">
                {grouped[role].map((u) => (
                  <label key={u.id} className={`flex items-center gap-2.5 rounded-lg border px-3 py-2 cursor-pointer text-sm ${sel.has(u.id) ? 'border-blue-400 bg-blue-50 dark:bg-blue-950/30' : 'hover:bg-slate-50 dark:hover:bg-slate-800'}`}
                    data-testid={`assign-staff-user-${u.id}`}>
                    <input type="checkbox" checked={sel.has(u.id)} onChange={() => toggle(u.id)} className="h-4 w-4 accent-blue-600" />
                    <span className="flex-1 font-medium truncate">{u.name}</span>
                    <span className={`text-[10px] shrink-0 ${(!u.has_face && !u.has_pin) ? 'text-amber-600 font-bold' : 'text-slate-400'}`}>{[u.has_face && 'Face ✓', u.has_pin && 'PIN ✓'].filter(Boolean).join(' · ') || 'No Face/PIN'}</span>
                    <Badge variant="outline" className="text-[10px] shrink-0">{u.role || '—'}</Badge>
                  </label>
                ))}
              </div>
            </div>
          ))}
          {users.length > 0 && filtered.length === 0 && <p className="text-sm text-muted-foreground text-center py-6">No staff match</p>}
          {users.length === 0 && <p className="text-sm text-muted-foreground text-center py-6">No factory staff yet — add them in the Factory Staff module first</p>}
        </div>
        {(() => {
          const unenrolled = users.filter((u) => sel.has(u.id) && !u.has_face && !u.has_pin);
          if (unenrolled.length === 0) return null;
          return (
            <div className="rounded-lg border-2 border-amber-300 bg-amber-50 dark:bg-amber-950/30 px-3 py-2.5 flex items-start gap-2" data-testid="assign-staff-enroll-warning">
              <AlertTriangle className="h-4 w-4 text-amber-600 mt-0.5 shrink-0" />
              <div className="text-xs flex-1">
                <p className="font-bold text-amber-800 dark:text-amber-300">{unenrolled.map((u) => u.name).join(', ')} {unenrolled.length === 1 ? 'has' : 'have'} no Face or PIN set up</p>
                <p className="text-amber-700 dark:text-amber-400">They can't verify their identity at the QR scan until enrolled.</p>
              </div>
              <Button size="sm" variant="outline" className="h-7 text-xs border-amber-400 text-amber-800 hover:bg-amber-100 shrink-0"
                onClick={() => window.open('/qc-team', '_blank')} data-testid="assign-staff-enroll-btn">
                Enroll now
              </Button>
            </div>
          );
        })()}
        <DialogFooter className="items-center gap-2">
          <span className="text-xs text-muted-foreground mr-auto">{sel.size} selected</span>
          <Button variant="outline" onClick={() => onClose(false)} data-testid="assign-staff-cancel">Cancel</Button>
          <Button onClick={save} disabled={saving} style={{ backgroundColor: '#002FA7' }} data-testid="assign-staff-save">{saving ? 'Saving…' : 'Save Assignment'}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

const printEquipmentQr = async (e) => {
  try {
    const res = await fetch(`${API_URL}/api/maintenance/equipment/${e.id}/sticker?origin=${encodeURIComponent(window.location.origin)}`, { headers: authHeaders() });
    if (!res.ok) throw new Error((await res.json()).detail || 'Could not generate QR sticker');
    const s = await res.json();
    const row = (label, value) => (value ? `<tr><td class="lbl">${label}</td><td class="val">${value}</td></tr>` : '');
    const w = window.open('', '_blank');
    if (!w) { toast.error('Pop-up blocked — allow pop-ups to print'); return; }
    w.document.write(`<!DOCTYPE html><html><head><title>Equipment QR — ${s.name}</title><style>
      @page { size: A4 portrait; margin: 12mm; }
      * { box-sizing: border-box; font-family: Arial, Helvetica, sans-serif; }
      body { margin: 0; display: flex; justify-content: center; padding-top: 10mm; }
      .sticker { width: 110mm; border: 2.5px solid #002FA7; border-radius: 5mm; overflow: hidden; }
      .head { background: #002FA7; color: #fff; text-align: center; padding: 4mm 5mm; }
      .head .nm { font-size: 17pt; font-weight: 800; letter-spacing: 0.3px; }
      .head .tp { font-size: 10pt; opacity: 0.9; margin-top: 1mm; }
      .qrwrap { text-align: center; padding: 5mm 0 2mm; }
      .qrwrap img { width: 62mm; height: 62mm; }
      .scanline { text-align: center; font-size: 9.5pt; font-weight: 700; color: #002FA7; padding-bottom: 3mm; }
      table { width: 100%; border-collapse: collapse; }
      td { padding: 2.2mm 5mm; font-size: 10.5pt; border-top: 1px solid #dbe2f0; }
      .lbl { color: #64748b; font-weight: 700; width: 34%; text-transform: uppercase; font-size: 8.5pt; letter-spacing: 0.5px; }
      .val { font-weight: 700; color: #0f172a; }
      .foot { background: #eef2fb; text-align: center; font-size: 8.5pt; color: #475569; padding: 2.5mm; }
    </style></head><body>
      <div class="sticker">
        <div class="head"><div class="nm">${s.name}</div><div class="tp">${s.type || ''}</div></div>
        <div class="qrwrap"><img src="${s.qr}" alt="QR" /></div>
        <div class="scanline">SCAN FOR TODAY'S MAINTENANCE CHECK-IN</div>
        <table>
          ${row('Facility', s.facility)}${row('Floor', s.floor)}${row('Area', s.area)}
          ${row('Make', s.make)}${row('Model', s.model)}
          ${row('Frequency', s.frequency_label)}${row('Equip. ID', s.code)}
        </table>
        <div class="foot">Nyla Air Water · Equipment Maintenance QR · Keep this sticker on the equipment</div>
      </div>
      <script>window.onload = function(){ window.print(); };</script>
    </body></html>`);
    w.document.close();
  } catch (err) { toast.error(err.message); }
};

const FreqSelect = ({ value, onChange, testid }) => {
  const known = FREQ_OPTIONS.some((o) => String(o.value) === String(value));
  return (
    <select className="mt-1 w-full h-10 rounded-md border border-input bg-background px-3 text-sm" value={value === '' || value == null ? '' : String(value)} onChange={(e) => onChange(e.target.value)} data-testid={testid}>
      <option value="">No schedule</option>
      {FREQ_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
      {!known && value !== '' && value != null && <option value={String(value)}>Every {value} days (custom)</option>}
    </select>
  );
};


const EMPTY_EQ = {
  name: '', equipment_type_id: '', make_brand: '', model_spec: '',
  maintenance_frequency_days: '', replacement_frequency_days: '', procurement_lead_time_days: '',
  maintenance_start_date: '', replacement_start_date: '',
  last_maintenance_date: '', next_maintenance_due: '', last_replacement_date: '', next_replacement_due: '',
  expected_life: '', min_stock_level: '', remarks: '', vendors: [],
  parent_equipment_id: '', has_children: false,
  facility_id: '', floor_id: '', area_id: '', photo_inspections_per_month: '',
};

const EMPTY_VENDOR = { vendor_id: '', vendor_name: '', preferred: false, lead_time_days: '', last_purchase_price: '', vendor_part_code: '', contact_details: '', amc_details: '' };

const daysUntil = (d) => {
  if (!d) return null;
  return Math.ceil((new Date(d) - new Date(new Date().toDateString())) / 86400000);
};

const DOC_CATEGORIES = [
  { key: 'photo', label: 'Photos', icon: ImageIcon },
  { key: 'certification', label: 'Vendor Certifications', icon: BadgeCheck },
  { key: 'quotation', label: 'Vendor Documents / Quotations', icon: ReceiptText },
  { key: 'document', label: 'Other Documents', icon: FileText },
];
const fmtSize = (b) => (b > 1048576 ? `${(b / 1048576).toFixed(1)} MB` : `${Math.max(1, Math.round(b / 1024))} KB`);

// Order items as a tree: parents first, children indented beneath (multi-level).
const buildTree = (items) => {
  const ids = new Set(items.map((i) => i.id));
  const byParent = {};
  items.forEach((i) => {
    const p = i.parent_equipment_id && ids.has(i.parent_equipment_id) ? i.parent_equipment_id : '__root__';
    (byParent[p] = byParent[p] || []).push(i);
  });
  const out = [];
  const walk = (pid, depth) => {
    (byParent[pid] || []).forEach((i) => { out.push({ ...i, _depth: depth }); walk(i.id, depth + 1); });
  };
  walk('__root__', 0);
  return out;
};

// All descendant ids of an equipment (to block circular parent selection).
const descendantIds = (items, rootId) => {
  const byParent = {};
  items.forEach((i) => { if (i.parent_equipment_id) (byParent[i.parent_equipment_id] = byParent[i.parent_equipment_id] || []).push(i.id); });
  const out = new Set();
  const stack = [rootId];
  while (stack.length) {
    const cur = stack.pop();
    (byParent[cur] || []).forEach((id) => { if (!out.has(id)) { out.add(id); stack.push(id); } });
  }
  return out;
};

const isOverdue = (e) => (e.next_maintenance_due && daysUntil(e.next_maintenance_due) < 0) || (e.next_replacement_due && daysUntil(e.next_replacement_due) < 0);

// id -> count of overdue descendant parts (multi-level rollup).
const overdueChildCounts = (items) => {
  const byId = Object.fromEntries(items.map((i) => [i.id, i]));
  const counts = {};
  items.forEach((e) => {
    if (!isOverdue(e)) return;
    let pid = e.parent_equipment_id;
    const seen = new Set();
    while (pid && byId[pid] && !seen.has(pid)) {
      counts[pid] = (counts[pid] || 0) + 1;
      seen.add(pid);
      pid = byId[pid].parent_equipment_id;
    }
  });
  return counts;
};

const CameraDialog = ({ open, onClose, onCapture }) => {
  const videoRef = React.useRef(null);
  const streamRef = React.useRef(null);
  const [camError, setCamError] = useState('');
  const [ready, setReady] = useState(false);
  useEffect(() => {
    if (!open) return undefined;
    setCamError(''); setReady(false);
    navigator.mediaDevices?.getUserMedia({ video: { facingMode: 'environment' } })
      .then((s) => {
        streamRef.current = s;
        if (videoRef.current) { videoRef.current.srcObject = s; videoRef.current.onloadedmetadata = () => setReady(true); }
      })
      .catch(() => setCamError('Camera not available or permission denied. Please allow camera access in your browser, or use "From gallery / files" instead.'));
    return () => { streamRef.current?.getTracks().forEach((t) => t.stop()); streamRef.current = null; };
  }, [open]);
  const capture = () => {
    const v = videoRef.current;
    if (!v || !v.videoWidth) return;
    const canvas = document.createElement('canvas');
    canvas.width = v.videoWidth; canvas.height = v.videoHeight;
    canvas.getContext('2d').drawImage(v, 0, 0);
    canvas.toBlob((blob) => {
      if (blob) onCapture(new File([blob], `camera_${Date.now()}.jpg`, { type: 'image/jpeg' }));
      onClose();
    }, 'image/jpeg', 0.9);
  };
  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-lg" data-testid="eq-camera-dialog">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2"><CameraIcon className="h-5 w-5 text-[#002FA7]" /> Take Photo</DialogTitle>
          <DialogDescription>Point the camera at the equipment and hit Capture.</DialogDescription>
        </DialogHeader>
        {camError ? (
          <p className="text-sm text-amber-700 bg-amber-50 border border-amber-200 rounded-md p-3" data-testid="eq-camera-error">{camError}</p>
        ) : (
          <video ref={videoRef} autoPlay playsInline muted className="w-full rounded-md bg-black aspect-video object-contain" data-testid="eq-camera-video" />
        )}
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button className="bg-[#002FA7] hover:bg-[#00227A]" disabled={!ready || !!camError} onClick={capture} data-testid="eq-camera-capture-btn">
            <CameraIcon className="h-4 w-4 mr-1.5" /> Capture
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

const TypeCodeBadge = ({ type, onSave }) => {
  const [editing, setEditing] = useState(false);
  const [val, setVal] = useState(type.code || '');
  useEffect(() => { setVal(type.code || ''); }, [type.code]);
  const commit = () => { setEditing(false); if (val && val !== (type.code || '')) onSave(type.id, val); else setVal(type.code || ''); };
  if (editing) {
    return (
      <input
        autoFocus
        value={val}
        onChange={(e) => setVal(e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 6))}
        onKeyDown={(e) => { if (e.key === 'Enter') commit(); if (e.key === 'Escape') { setEditing(false); setVal(type.code || ''); } }}
        onBlur={commit}
        onClick={(e) => e.stopPropagation()}
        className="font-mono text-sm font-bold w-24 px-2 py-1 rounded-md border-2 border-blue-500 outline-none bg-white text-slate-800"
        data-testid={`type-code-input-${type.id}`}
      />
    );
  }
  return (
    <span
      role="button"
      tabIndex={0}
      title="Click to edit code"
      onClick={(e) => { e.stopPropagation(); setEditing(true); }}
      onKeyDown={(e) => { if (e.key === 'Enter') setEditing(true); }}
      className={`inline-flex items-center gap-1.5 font-mono text-xs font-bold px-2 py-0.5 rounded-md border cursor-pointer transition-colors ${type.code ? 'bg-blue-50 text-blue-700 border-blue-200 hover:bg-blue-100 hover:border-blue-400 dark:bg-blue-950 dark:text-blue-300 dark:border-blue-800' : 'bg-amber-50 text-amber-700 border-amber-300 hover:bg-amber-100'}`}
      data-testid={`type-code-${type.id}`}
    >
      {type.code || 'SET CODE'}
      <Pencil className="h-3 w-3 opacity-60" />
    </span>
  );
};

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
      <div className={`${className} bg-slate-100 flex flex-col items-center justify-center gap-1 text-slate-400`} data-testid={testid} title="File is missing from storage — please re-upload">
        <ImageIcon className="h-5 w-5" />
        <span className="text-[9px] font-medium uppercase">missing</span>
      </div>
    );
  }
  if (!url) return <div className={`${className} bg-slate-100 animate-pulse`} data-testid={testid} />;
  return <img src={url} alt={alt} className={className} onClick={onClick} data-testid={testid} />;
};

const DueChip = ({ date, testid }) => {
  const n = daysUntil(date);
  if (n == null) return <span className="text-muted-foreground text-xs">—</span>;
  let cls = 'bg-emerald-50 text-emerald-700 border-emerald-200';
  let label = date;
  if (n < 0) { cls = 'bg-red-100 text-red-700 border-red-300'; label = `${date} · ${-n}d overdue`; }
  else if (n <= 30) { cls = 'bg-amber-50 text-amber-700 border-amber-300'; label = `${date} · in ${n}d`; }
  return <Badge variant="outline" className={`${cls} whitespace-nowrap`} data-testid={testid}>{label}</Badge>;
};

export default function EquipmentMaster() {
  const [types, setTypes] = useState([]);
  const [equipment, setEquipment] = useState([]);
  const [vendors, setVendors] = useState([]);
  const [facilities, setFacilities] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [typeFilter, setTypeFilter] = useState('');
  const [facFilter, setFacFilter] = useState('');
  const [floorFilter, setFloorFilter] = useState('');
  const [areaFilter, setAreaFilter] = useState('');
  const [quickFilter, setQuickFilter] = useState('');
  const [importing, setImporting] = useState(false);
  const [importResult, setImportResult] = useState(null);
  const [compYear, setCompYear] = useState(new Date().getFullYear());
  const [compMon, setCompMon] = useState(new Date().getMonth() + 1);
  const [compWeek, setCompWeek] = useState('entire');
  const [compliance, setCompliance] = useState(null);
  const [compLoading, setCompLoading] = useState(false);

  const loadCompliance = useCallback(async (year, mon, week) => {
    setCompLoading(true);
    try {
      const q = week && week !== 'entire'
        ? `start=${week.split('_')[0]}&end=${week.split('_')[1]}`
        : `month=${year}-${String(mon).padStart(2, '0')}`;
      const res = await fetch(`${API_URL}/api/maintenance/compliance?${q}`, { headers: authHeaders() });
      if (!res.ok) throw new Error();
      setCompliance(await res.json());
    } catch { toast.error('Failed to load compliance'); } finally { setCompLoading(false); }
  }, []);
  const [showEqForm, setShowEqForm] = useState(false);
  const [editingEq, setEditingEq] = useState(null);
  const [eqForm, setEqForm] = useState(EMPTY_EQ);
  const DEFAULT_SECS = { basic: true, hierarchy: false, maintenance: true, replacement: false, procurement: false, vendors: false };
  const [openSecs, setOpenSecs] = useState(DEFAULT_SECS);
  const toggleSec = (k) => setOpenSecs((s) => ({ ...s, [k]: !s[k] }));
  const [saving, setSaving] = useState(false);
  const [showTypeForm, setShowTypeForm] = useState(false);
  const [editingType, setEditingType] = useState(null);
  const [typeForm, setTypeForm] = useState({ name: '', description: '' });
  const [logTarget, setLogTarget] = useState(null); // {equipment, kind: 'maintenance'|'replacement'}
  const [logDate, setLogDate] = useState('');
  const [logRemarks, setLogRemarks] = useState('');
  const [logPhotos, setLogPhotos] = useState([]);
  const [logUploading, setLogUploading] = useState(false);

  const uploadLogPhoto = async (fileList) => {
    if (!fileList?.length) return;
    setLogUploading(true);
    try {
      for (const f of Array.from(fileList)) {
        const fd = new FormData();
        fd.append('file', f);
        fd.append('category', 'photo');
        const res = await fetch(`${API_URL}/api/production/equipment/${logTarget.equipment.id}/files`, {
          method: 'POST', headers: { Authorization: `Bearer ${localStorage.getItem('session_token')}` }, body: fd,
        });
        if (!res.ok) throw new Error((await res.json()).detail || 'Upload failed');
        const meta = await res.json();
        setLogPhotos((p) => [...p, meta]);
      }
    } catch (e) { toast.error(typeof e.message === 'string' ? e.message : 'Photo upload failed'); }
    finally { setLogUploading(false); }
  };
  const [docsTarget, setDocsTarget] = useState(null);
  const [maintTarget, setMaintTarget] = useState(null);
  const [staffTarget, setStaffTarget] = useState(null);
  const [instrTarget, setInstrTarget] = useState(null);
  const [docCategory, setDocCategory] = useState('photo');
  const [uploading, setUploading] = useState(false);
  const [previewFile, setPreviewFile] = useState(null);
  const [cameraFor, setCameraFor] = useState(null); // 'docs' | 'log'

  const uploadDoc = async (fileList, categoryOverride) => {
    if (!fileList?.length) return;
    setUploading(true);
    try {
      for (const f of Array.from(fileList)) {
        const fd = new FormData();
        fd.append('file', f);
        fd.append('category', categoryOverride || docCategory);
        const res = await fetch(`${API_URL}/api/production/equipment/${docsTarget.id}/files`, {
          method: 'POST', headers: { Authorization: `Bearer ${localStorage.getItem('session_token')}` }, body: fd,
        });
        if (!res.ok) throw new Error((await res.json()).detail || 'Upload failed');
        const meta = await res.json();
        setDocsTarget((t) => ({ ...t, attachments: [...(t.attachments || []), meta] }));
      }
      toast.success('Uploaded');
      loadAll();
    } catch (e) { toast.error(typeof e.message === 'string' ? e.message : 'Upload failed'); }
    finally { setUploading(false); }
  };

  const downloadDoc = async (f) => {
    try {
      const res = await fetch(`${API_URL}/api/production/equipment/${docsTarget.id}/files/${f.id}`, { headers: authHeaders() });
      if (res.status === 404) { toast.error(`"${f.filename}" is missing from storage — it was uploaded before the storage upgrade and needs to be re-uploaded.`); return; }
      if (!res.ok) throw new Error();
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url; a.download = f.filename; a.click();
      URL.revokeObjectURL(url);
    } catch { toast.error('Download failed'); }
  };

  const downloadZip = async () => {
    try {
      const res = await fetch(`${API_URL}/api/production/equipment/${docsTarget.id}/files-zip`, { headers: authHeaders() });
      if (!res.ok) throw new Error();
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${(docsTarget.name || 'equipment').replace(/\s+/g, '_')}_documents.zip`;
      a.click();
      URL.revokeObjectURL(url);
      toast.success('Documents zip downloaded');
    } catch { toast.error('Zip download failed'); }
  };

  const deleteDoc = async (f) => {
    if (!window.confirm(`Delete "${f.filename}"?`)) return;
    const res = await fetch(`${API_URL}/api/production/equipment/${docsTarget.id}/files/${f.id}`, { method: 'DELETE', headers: authHeaders() });
    if (!res.ok) return toast.error('Delete failed');
    setDocsTarget((t) => ({ ...t, attachments: (t.attachments || []).filter((x) => x.id !== f.id) }));
    toast.success('File deleted');
    loadAll();
  };

  const loadAll = useCallback(async () => {
    setLoading(true);
    try {
      const [tRes, eRes, vRes, fRes] = await Promise.all([
        fetch(`${API_URL}/api/production/equipment/types`, { headers: authHeaders() }),
        fetch(`${API_URL}/api/production/equipment`, { headers: authHeaders() }),
        fetch(`${API_URL}/api/inventory/vendors`, { headers: authHeaders() }),
        fetch(`${API_URL}/api/facilities`, { headers: authHeaders() }),
      ]);
      setTypes((await tRes.json()).types || []);
      setEquipment((await eRes.json()).equipment || []);
      setFacilities(fRes.ok ? ((await fRes.json()).facilities || []) : []);
      const vData = await vRes.json();
      setVendors(vData.vendors || vData.items || (Array.isArray(vData) ? vData : []));
    } catch { toast.error('Failed to load equipment master'); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { loadAll(); }, [loadAll]);

  const saveTypeCode = async (typeId, code) => {
    try {
      const res = await fetch(`${API_URL}/api/production/equipment/types/${typeId}/code`, { method: 'PUT', headers: authHeaders(), body: JSON.stringify({ code }) });
      if (!res.ok) { const d = await res.json().catch(() => ({})); toast.error(d.detail || 'Failed to update code'); return; }
      toast.success('Code updated');
      loadAll();
    } catch { toast.error('Failed to update code'); }
  };

  const seedDefaults = async () => {
    const res = await fetch(`${API_URL}/api/production/equipment/types/seed-defaults`, { method: 'POST', headers: authHeaders() });
    const d = await res.json();
    toast.success(`${d.created} default types added`);
    loadAll();
  };

  const saveType = async () => {
    if (!typeForm.name.trim()) return toast.error('Type name is required');
    const url = editingType ? `${API_URL}/api/production/equipment/types/${editingType.id}` : `${API_URL}/api/production/equipment/types`;
    const res = await fetch(url, { method: editingType ? 'PUT' : 'POST', headers: authHeaders(), body: JSON.stringify(typeForm) });
    if (!res.ok) return toast.error((await res.json()).detail || 'Save failed');
    toast.success(editingType ? 'Type updated' : 'Type created');
    setShowTypeForm(false);
    loadAll();
  };

  const deleteType = async (t) => {
    if (!window.confirm(`Delete equipment type "${t.name}"?`)) return;
    const res = await fetch(`${API_URL}/api/production/equipment/types/${t.id}`, { method: 'DELETE', headers: authHeaders() });
    if (!res.ok) return toast.error((await res.json()).detail || 'Delete failed');
    toast.success('Type deleted');
    loadAll();
  };

  const openNewEq = () => { setEditingEq(null); setEqForm({ ...EMPTY_EQ, equipment_type_id: typeFilter || '' }); setOpenSecs(DEFAULT_SECS); setShowEqForm(true); };
  const openEditEq = (e) => {
    setEditingEq(e);
    setOpenSecs({
      basic: true,
      hierarchy: !!(e.parent_equipment_id || e.has_children || e.facility_id),
      maintenance: !!(e.maintenance_frequency_days || e.last_maintenance_date || e.maintenance_start_date),
      replacement: !!(e.replacement_frequency_days || e.last_replacement_date || e.replacement_start_date),
      procurement: !!(e.procurement_lead_time_days || e.min_stock_level || e.expected_life || e.remarks),
      vendors: (e.vendors || []).length > 0,
    });
    setEqForm({
      ...EMPTY_EQ, ...e,
      facility_id: e.facility_id || '', floor_id: e.floor_id || '', area_id: e.area_id || '',
      photo_inspections_per_month: e.photo_inspections_per_month ?? '',
      parent_equipment_id: e.parent_equipment_id || '',
      maintenance_frequency_days: e.maintenance_frequency_days ?? '', replacement_frequency_days: e.replacement_frequency_days ?? '',
      procurement_lead_time_days: e.procurement_lead_time_days ?? '', min_stock_level: e.min_stock_level ?? '',
      last_maintenance_date: e.last_maintenance_date || '', next_maintenance_due: e.next_maintenance_due || '',
      last_replacement_date: e.last_replacement_date || '', next_replacement_due: e.next_replacement_due || '',
      maintenance_start_date: e.maintenance_start_date || '', replacement_start_date: e.replacement_start_date || '',
      vendors: (e.vendors || []).map((v) => ({ ...EMPTY_VENDOR, ...v, lead_time_days: v.lead_time_days ?? '', last_purchase_price: v.last_purchase_price ?? '' })),
    });
    setShowEqForm(true);
  };

  const setF = (k, v) => setEqForm((p) => ({ ...p, [k]: v }));
  const setVendorField = (i, k, v) => setEqForm((p) => {
    const vs = [...p.vendors];
    vs[i] = { ...vs[i], [k]: v };
    if (k === 'vendor_id') vs[i].vendor_name = (vendors.find((x) => x.id === v) || {}).vendor_name || '';
    return { ...p, vendors: vs };
  });

  const saveEq = async () => {
    if (!eqForm.name.trim() || !eqForm.equipment_type_id) return toast.error('Name and equipment type are required');
    setSaving(true);
    try {
      const payload = {
        ...eqForm,
        parent_equipment_id: eqForm.parent_equipment_id || null,
        has_children: !!eqForm.has_children,
        facility_id: eqForm.facility_id || null,
        floor_id: (eqForm.facility_id && eqForm.floor_id) || null,
        area_id: (eqForm.facility_id && eqForm.floor_id && eqForm.area_id) || null,
        maintenance_frequency_days: eqForm.maintenance_frequency_days === '' ? null : parseInt(eqForm.maintenance_frequency_days),
        replacement_frequency_days: eqForm.replacement_frequency_days === '' ? null : parseInt(eqForm.replacement_frequency_days),
        procurement_lead_time_days: eqForm.procurement_lead_time_days === '' ? null : parseInt(eqForm.procurement_lead_time_days),
        min_stock_level: eqForm.min_stock_level === '' ? null : parseInt(eqForm.min_stock_level),
        photo_inspections_per_month: eqForm.photo_inspections_per_month === '' || eqForm.photo_inspections_per_month == null ? null : parseInt(eqForm.photo_inspections_per_month),
        last_maintenance_date: eqForm.last_maintenance_date || null, next_maintenance_due: eqForm.next_maintenance_due || null,
        last_replacement_date: eqForm.last_replacement_date || null, next_replacement_due: eqForm.next_replacement_due || null,
        maintenance_start_date: eqForm.maintenance_start_date || null, replacement_start_date: eqForm.replacement_start_date || null,
        vendors: eqForm.vendors.filter((v) => v.vendor_id).map((v) => ({
          ...v,
          lead_time_days: v.lead_time_days === '' ? null : parseInt(v.lead_time_days),
          last_purchase_price: v.last_purchase_price === '' ? null : parseFloat(v.last_purchase_price),
        })),
      };
      const url = editingEq ? `${API_URL}/api/production/equipment/${editingEq.id}` : `${API_URL}/api/production/equipment`;
      const res = await fetch(url, { method: editingEq ? 'PUT' : 'POST', headers: authHeaders(), body: JSON.stringify(payload) });
      if (!res.ok) throw new Error((await res.json()).detail || 'Save failed');
      toast.success(editingEq ? 'Equipment updated' : 'Equipment created');
      setShowEqForm(false);
      loadAll();
    } catch (e) { toast.error(e.message); }
    finally { setSaving(false); }
  };

  const deleteEq = async (e) => {
    if (!window.confirm(`Delete "${e.name}"?`)) return;
    const res = await fetch(`${API_URL}/api/production/equipment/${e.id}`, { method: 'DELETE', headers: authHeaders() });
    if (!res.ok) return toast.error((await res.json()).detail || 'Delete failed');
    toast.success('Equipment deleted');
    loadAll();
  };

  const submitLog = async () => {
    const res = await fetch(`${API_URL}/api/production/equipment/${logTarget.equipment.id}/log-${logTarget.kind}`, {
      method: 'POST', headers: authHeaders(),
      body: JSON.stringify({ date: logDate || null, remarks: logRemarks || null, photo_ids: logPhotos.map((p) => p.id) }),
    });
    if (!res.ok) return toast.error((await res.json()).detail || 'Failed');
    toast.success(`${logTarget.kind === 'maintenance' ? 'Maintenance' : 'Replacement'} logged${logPhotos.length ? ` with ${logPhotos.length} photo${logPhotos.length === 1 ? '' : 's'}` : ''} — next due date updated`);
    setLogTarget(null); setLogDate(''); setLogRemarks(''); setLogPhotos([]);
    loadAll();
  };

  const overdueByParent = overdueChildCounts(equipment);
  const isOrderNow = (e) => { const n = daysUntil(e.next_replacement_due); return n != null && e.procurement_lead_time_days && n <= e.procurement_lead_time_days; };

  const downloadXlsx = async (kind, fallbackName) => {
    try {
      const res = await fetch(`${API_URL}/api/production/equipment/${kind}`, { headers: { Authorization: `Bearer ${localStorage.getItem('session_token')}` } });
      if (!res.ok) throw new Error((await res.json()).detail || 'Download failed');
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url; a.download = fallbackName; a.click();
      URL.revokeObjectURL(url);
    } catch (e) { toast.error(e.message); }
  };

  const exportFiltered = async (rows) => {
    try {
      const res = await fetch(`${API_URL}/api/production/equipment/export-filtered`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${localStorage.getItem('session_token')}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ ids: rows.map((r) => r.id) }),
      });
      if (!res.ok) throw new Error((await res.json()).detail || 'Download failed');
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url; a.download = 'equipment_export_filtered.xlsx'; a.click();
      URL.revokeObjectURL(url);
      toast.success(`Exported ${rows.length} equipment (current filters applied)`);
    } catch (e) { toast.error(e.message); }
  };

  const importXlsx = async (file) => {
    if (!file) return;
    setImporting(true);
    setImportResult(null);
    try {
      const fd = new FormData();
      fd.append('file', file);
      const res = await fetch(`${API_URL}/api/production/equipment/import`, {
        method: 'POST', headers: { Authorization: `Bearer ${localStorage.getItem('session_token')}` }, body: fd,
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.detail || 'Import failed');
      setImportResult(data);
      if (data.errors?.length) toast.warning(data.message); else toast.success(data.message);
      loadAll();
    } catch (e) { toast.error(e.message); } finally { setImporting(false); }
  };
  const quickMatch = (e) => {
    if (!quickFilter) return true;
    if (quickFilter === 'overdue') return e.next_maintenance_due && daysUntil(e.next_maintenance_due) < 0;
    if (quickFilter === 'due_soon') { const n = daysUntil(e.next_maintenance_due); return n != null && n >= 0 && n <= 30; }
    if (quickFilter === 'order_now') return isOrderNow(e);
    return true;
  };
  const baseFiltered = equipment.filter((e) =>
    (!typeFilter || e.equipment_type_id === typeFilter) &&
    (!facFilter || e.facility_id === facFilter) &&
    (!floorFilter || e.floor_id === floorFilter) &&
    (!areaFilter || e.area_id === areaFilter) &&
    (!search || `${e.name} ${e.make_brand} ${e.model_spec}`.toLowerCase().includes(search.toLowerCase())));
  const filtered = buildTree(baseFiltered.filter(quickMatch));

  // KPI cards honor the active search/type/location filters (quick filter excluded — the cards drive it)
  const overdueM = baseFiltered.filter((e) => daysUntil(e.next_maintenance_due) < 0 && e.next_maintenance_due).length;
  const dueSoonM = baseFiltered.filter((e) => { const n = daysUntil(e.next_maintenance_due); return n != null && n >= 0 && n <= 30; }).length;
  const orderNow = baseFiltered.filter((e) => {
    const n = daysUntil(e.next_replacement_due);
    return n != null && e.procurement_lead_time_days && n <= e.procurement_lead_time_days;
  }).length;

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-white to-slate-100/50 dark:from-slate-950 dark:via-slate-900 dark:to-slate-950" data-testid="equipment-master-page">
      <div className="relative p-6 lg:p-8 max-w-[1600px] mx-auto space-y-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-xl bg-gradient-to-br from-indigo-50 to-blue-100 dark:from-indigo-950/40 dark:to-blue-900/30">
              <Cog className="h-6 w-6 text-indigo-700 dark:text-indigo-400" />
            </div>
            <div>
              <h1 className="text-2xl lg:text-3xl font-bold tracking-tight text-slate-800 dark:text-white">Equipment Master</h1>
              <p className="text-muted-foreground">Equipment, consumables, maintenance & replacement schedules, vendor associations</p>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Button variant="outline" className="h-10 rounded-lg" onClick={() => downloadXlsx('import-template', 'equipment_import_template.xlsx')} data-testid="eq-template-btn">
              <FileText className="w-4 h-4 mr-2 text-slate-500" /> Template
            </Button>
            <Button variant="outline" className="h-10 rounded-lg" onClick={() => exportFiltered(filtered)} data-testid="eq-export-btn">
              <Download className="w-4 h-4 mr-2 text-slate-500" /> Export
            </Button>
            <label>
              <input type="file" accept=".xlsx" className="hidden" onChange={(e) => { importXlsx(e.target.files?.[0]); e.target.value = ''; }} data-testid="eq-import-input" />
              <Button variant="outline" className="h-10 rounded-lg" disabled={importing} asChild>
                <span className="cursor-pointer" data-testid="eq-import-btn"><Upload className="w-4 h-4 mr-2 text-slate-500" />{importing ? 'Importing…' : 'Import'}</span>
              </Button>
            </label>
            <Button className="h-10 rounded-lg" onClick={openNewEq} data-testid="eq-new-btn"><Plus className="w-4 h-4 mr-2" /> Add Equipment</Button>
          </div>
        </div>

        {importResult && (
          <div className={`rounded-xl border px-4 py-3 text-sm flex items-start gap-2.5 ${importResult.errors?.length ? 'bg-amber-50 border-amber-300 text-amber-800' : 'bg-emerald-50 border-emerald-300 text-emerald-800'}`} data-testid="eq-import-result">
            {importResult.errors?.length ? <AlertTriangle className="h-4 w-4 mt-0.5 shrink-0" /> : <BadgeCheck className="h-4 w-4 mt-0.5 shrink-0" />}
            <div className="flex-1">
              <p className="font-semibold">Import finished: {importResult.message}</p>
              {(importResult.errors || []).slice(0, 8).map((er, i) => (
                <p key={i} className="text-xs mt-0.5">Row {er.row}: {er.error}</p>
              ))}
              {(importResult.errors || []).length > 8 && <p className="text-xs mt-0.5">…and {importResult.errors.length - 8} more</p>}
            </div>
            <button onClick={() => setImportResult(null)} className="shrink-0 hover:opacity-70" data-testid="eq-import-result-close"><X className="h-4 w-4" /></button>
          </div>
        )}

        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
          {[
            { id: '', label: 'Total Equipment', value: baseFiltered.length, testid: 'eq-stat-total', icon: Cog,
              iconBg: 'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300', border: 'border-slate-200 hover:border-slate-400 dark:border-slate-800',
              ring: 'ring-2 ring-slate-900 bg-slate-50/80 dark:bg-slate-800/60 dark:ring-slate-300', text: 'text-slate-900 dark:text-white', sub: 'All active equipment & assemblies' },
            { id: 'overdue', label: 'Maintenance Overdue', value: overdueM, testid: 'eq-stat-overdue', icon: AlertTriangle,
              iconBg: 'bg-rose-100 text-rose-700 dark:bg-rose-900/40 dark:text-rose-400', border: 'border-rose-200 hover:border-rose-400 dark:border-rose-900/50',
              ring: 'ring-2 ring-rose-600 bg-rose-50/80 dark:bg-rose-950/40 dark:ring-rose-500', text: overdueM > 0 ? 'text-rose-700 dark:text-rose-400' : 'text-slate-900 dark:text-white', sub: 'Needs immediate attention' },
            { id: 'due_soon', label: 'Due in 30 Days', value: dueSoonM, testid: 'eq-stat-duesoon', icon: CalendarCheck,
              iconBg: 'bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-400', border: 'border-amber-200 hover:border-amber-400 dark:border-amber-900/50',
              ring: 'ring-2 ring-amber-500 bg-amber-50/80 dark:bg-amber-950/40 dark:ring-amber-400', text: 'text-slate-900 dark:text-white', sub: 'Upcoming preventive maintenance' },
            { id: 'order_now', label: 'Order Now (Lead Time)', value: orderNow, testid: 'eq-stat-ordernow', icon: ShoppingCart,
              iconBg: 'bg-orange-100 text-orange-700 dark:bg-orange-900/40 dark:text-orange-400', border: 'border-orange-200 hover:border-orange-400 dark:border-orange-900/50',
              ring: 'ring-2 ring-orange-600 bg-orange-50/80 dark:bg-orange-950/40 dark:ring-orange-500', text: orderNow > 0 ? 'text-orange-700 dark:text-orange-400' : 'text-slate-900 dark:text-white', sub: 'Replacement within lead time' },
          ].map((s) => {
            const active = quickFilter === s.id && s.id !== '';
            const Icon = s.icon;
            return (
              <button key={s.label} type="button"
                onClick={() => setQuickFilter(s.id === '' ? '' : (quickFilter === s.id ? '' : s.id))}
                className={`text-left cursor-pointer transition-all duration-200 hover:-translate-y-0.5 hover:shadow-md rounded-xl p-4 sm:p-5 border bg-white dark:bg-slate-900 shadow-sm relative overflow-hidden group ${active ? s.ring : s.border}`}
                data-testid={s.testid}>
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">{s.label}</p>
                    <p className={`text-2xl sm:text-3xl font-bold tabular-nums tracking-tight mt-1 ${s.text}`}>{s.value}</p>
                    <p className="text-[11px] text-slate-400 dark:text-slate-500 mt-0.5 hidden sm:block">{active ? 'Filtering — click to clear' : s.sub}</p>
                  </div>
                  <span className={`p-2.5 rounded-lg shrink-0 ${s.iconBg}`}><Icon className="h-5 w-5" /></span>
                </div>
              </button>
            );
          })}
        </div>

        <Tabs defaultValue="equipment">
          <TabsList>
            <TabsTrigger value="equipment" data-testid="eq-tab-equipment">Equipment / Components</TabsTrigger>
            <TabsTrigger value="types" data-testid="eq-tab-types">Equipment Types</TabsTrigger>
            <TabsTrigger value="compliance" data-testid="eq-tab-compliance">Compliance</TabsTrigger>
          </TabsList>

          <TabsContent value="equipment" className="space-y-4 mt-4">
            <div className="bg-white dark:bg-slate-900 p-3 sm:p-4 rounded-xl border border-slate-200/80 dark:border-slate-800 shadow-sm space-y-2">
              <div className="flex flex-col lg:flex-row items-stretch lg:items-center gap-3">
                <div className="relative flex-1 min-w-[240px] max-w-md">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
                  <Input placeholder="Search name, make, model…" value={search} onChange={(e) => setSearch(e.target.value)}
                    className="pl-9 h-10 rounded-lg border-slate-200 dark:border-slate-700 bg-slate-50/50 dark:bg-slate-800/50 focus:bg-white dark:focus:bg-slate-900 text-sm transition-colors" data-testid="eq-search" />
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <select className="h-10 px-3 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-sm text-slate-700 dark:text-slate-200 focus:ring-2 focus:ring-[#002FA7]/20 focus:border-[#002FA7] transition-colors" value={typeFilter} onChange={(e) => setTypeFilter(e.target.value)} data-testid="eq-type-filter">
                    <option value="">All Types</option>
                    {types.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
                  </select>
                  <select className="h-10 px-3 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-sm text-slate-700 dark:text-slate-200 focus:ring-2 focus:ring-[#002FA7]/20 focus:border-[#002FA7] transition-colors" value={facFilter}
                    onChange={(e) => { setFacFilter(e.target.value); setFloorFilter(''); setAreaFilter(''); }} data-testid="eq-facility-filter">
                    <option value="">All Facilities</option>
                    {facilities.map((f) => <option key={f.id} value={f.id}>{f.facility_name}</option>)}
                  </select>
                  {(() => {
                    const selFac = facilities.find((f) => f.id === facFilter);
                    const selFloor = (selFac?.floors || []).find((fl) => fl.id === floorFilter);
                    if (!selFac) return null;
                    return (
                      <>
                        <select className="h-10 px-3 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-sm text-slate-700 dark:text-slate-200 focus:ring-2 focus:ring-[#002FA7]/20 focus:border-[#002FA7] transition-colors" value={floorFilter}
                          onChange={(e) => { setFloorFilter(e.target.value); setAreaFilter(''); }} data-testid="eq-floor-filter">
                          <option value="">All Floors</option>
                          {(selFac.floors || []).map((fl) => <option key={fl.id} value={fl.id}>{fl.name}</option>)}
                        </select>
                        {selFloor && (
                          <select className="h-10 px-3 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-sm text-slate-700 dark:text-slate-200 focus:ring-2 focus:ring-[#002FA7]/20 focus:border-[#002FA7] transition-colors" value={areaFilter}
                            onChange={(e) => setAreaFilter(e.target.value)} data-testid="eq-area-filter">
                            <option value="">All Areas</option>
                            {(selFloor.areas || []).map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
                          </select>
                        )}
                      </>
                    );
                  })()}
                </div>
              </div>
              {(quickFilter || search || typeFilter || facFilter) && (
                <div className="flex flex-wrap items-center gap-2 pt-2 border-t border-slate-100 dark:border-slate-800 text-xs text-slate-500" data-testid="eq-active-filters">
                  <Filter className="h-3.5 w-3.5" />
                  <span className="font-medium">{filtered.length} shown</span>
                  {quickFilter && (
                    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-200 font-medium">
                      {quickFilter === 'overdue' ? 'Maintenance overdue' : quickFilter === 'due_soon' ? 'Due in 30 days' : 'Order now'}
                      <button onClick={() => setQuickFilter('')} className="hover:text-rose-600" data-testid="eq-clear-quickfilter"><X className="h-3 w-3" /></button>
                    </span>
                  )}
                  <button onClick={() => { setQuickFilter(''); setSearch(''); setTypeFilter(''); setFacFilter(''); setFloorFilter(''); setAreaFilter(''); }}
                    className="text-xs font-medium text-[#002FA7] hover:underline dark:text-blue-400 ml-auto" data-testid="eq-clear-all-filters">Clear all filters</button>
                </div>
              )}
            </div>
            <Card><CardContent className="p-0">
              {loading ? (
                <div className="flex items-center justify-center py-12 text-muted-foreground"><RefreshCw className="h-5 w-5 animate-spin mr-2" /> Loading…</div>
              ) : filtered.length === 0 ? (
                <div className="text-center py-12 text-muted-foreground" data-testid="eq-empty">
                  <Cog className="h-10 w-10 mx-auto mb-3 opacity-40" />
                  No equipment yet. {types.length === 0 && 'Create equipment types first (Types tab).'}
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm" data-testid="eq-table">
                    <thead>
                      <tr className="border-b bg-slate-50/80 dark:bg-slate-900/80 text-left text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                        <th className="px-5 py-3.5">Equipment & Location</th>
                        <th className="px-4 py-3.5">Type</th>
                        <th className="px-4 py-3.5">Make / Model</th>
                        <th className="px-4 py-3.5">Vendors</th>
                        <th className="px-4 py-3.5">Next Maintenance</th>
                        <th className="px-4 py-3.5">Next Replacement / Lead</th>
                        <th className="px-4 py-3.5 text-right">Quick Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {filtered.map((e, rowIdx) => {
                        const nRep = daysUntil(e.next_replacement_due);
                        const orderFlag = nRep != null && e.procurement_lead_time_days && nRep <= e.procurement_lead_time_days;
                        return (
                          <tr key={e.id} className={`border-b border-slate-100 dark:border-slate-800/60 hover:bg-blue-50/60 dark:hover:bg-slate-800/60 transition-colors align-top group ${rowIdx % 2 === 1 ? 'bg-slate-50/80 dark:bg-slate-800/30' : 'bg-white dark:bg-slate-900'}`} data-testid={`eq-row-${e.name.replace(/\s/g, '-')}`}>
                            <td className="px-5 py-4">
                              <div style={{ paddingLeft: (e._depth || 0) * 18 }} className="flex items-start gap-1.5">
                                {e._depth > 0 && <span className="text-slate-400 select-none">└</span>}
                                <div>
                                  <p className="font-semibold flex items-center gap-1.5 flex-wrap">
                                    {e.name}
                                    {(e.children_count > 0 || e.has_children) && (
                                      <Badge variant="outline" className="text-[10px] px-1.5 py-0 bg-indigo-50 text-indigo-700 border-indigo-200" data-testid={`eq-assembly-${e.name.replace(/\s/g, '-')}`}>
                                        Assembly{e.children_count > 0 ? ` · ${e.children_count} child${e.children_count === 1 ? '' : 'ren'}` : ''}
                                      </Badge>
                                    )}
                                    {overdueByParent[e.id] > 0 && (
                                      <Badge className="text-[10px] px-1.5 py-0 bg-red-600 text-white" data-testid={`eq-child-overdue-${e.name.replace(/\s/g, '-')}`}>
                                        <AlertTriangle className="h-3 w-3 mr-1" />{overdueByParent[e.id]} child part{overdueByParent[e.id] === 1 ? '' : 's'} overdue
                                      </Badge>
                                    )}
                                  </p>
                                  {e._depth === 0 && e.parent_equipment_id && (
                                    <p className="text-[11px] text-muted-foreground">Part of: {e.parent_equipment_name}</p>
                                  )}
                                  {e.facility_name && (
                                    <p className="text-[11px] text-muted-foreground flex items-center gap-1" data-testid={`eq-location-${e.name.replace(/\s/g, '-')}`}>
                                      <MapPin className="h-3 w-3" />{[e.facility_name, e.floor_name, e.area_name].filter(Boolean).join(' › ')}
                                    </p>
                                  )}
                                  {e.expected_life && <p className="text-[11px] text-muted-foreground">Life: {e.expected_life}</p>}
                                </div>
                              </div>
                            </td>
                            <td className="px-4 py-4"><Badge variant="outline">{e.equipment_type_name}</Badge></td>
                            <td className="px-4 py-4 text-xs">{[e.make_brand, e.model_spec].filter(Boolean).join(' · ') || '—'}</td>
                            <td className="px-4 py-4">
                              {(e.vendors || []).length === 0 ? <span className="text-xs text-muted-foreground">—</span> : (
                                <div className="space-y-0.5">
                                  {e.vendors.map((v, i) => (
                                    <p key={i} className="text-xs flex items-center gap-1">
                                      {v.preferred && <Star className="h-3 w-3 text-amber-500 fill-amber-400" />}
                                      {v.vendor_name}{v.lead_time_days ? ` · ${v.lead_time_days}d` : ''}
                                    </p>
                                  ))}
                                </div>
                              )}
                            </td>
                            <td className="px-4 py-4">
                              <DueChip date={e.next_maintenance_due} testid={`eq-maint-due-${e.name.replace(/\s/g, '-')}`} />
                              {freqLabel(e.maintenance_frequency_days) && <p className="text-[11px] text-muted-foreground mt-0.5">{freqLabel(e.maintenance_frequency_days)}</p>}
                              {e.last_maintenance_date && <p className="text-[11px] text-muted-foreground mt-0.5">Last: {e.last_maintenance_date}</p>}
                            </td>
                            <td className="px-4 py-4">
                              <DueChip date={e.next_replacement_due} testid={`eq-repl-due-${e.name.replace(/\s/g, '-')}`} />
                              {freqLabel(e.replacement_frequency_days) && <p className="text-[11px] text-muted-foreground mt-0.5">{freqLabel(e.replacement_frequency_days)}</p>}
                              <p className="text-[11px] text-muted-foreground mt-0.5">
                                {e.procurement_lead_time_days ? `Lead: ${e.procurement_lead_time_days}d` : ''}{e.procurement_lead_time_days && e.min_stock_level != null ? ' · ' : ''}{e.min_stock_level != null ? `Min stock: ${e.min_stock_level}` : ''}
                              </p>
                              {orderFlag && (
                                <Badge className="mt-1 bg-red-600 text-white block w-fit" data-testid={`eq-order-now-${e.name.replace(/\s/g, '-')}`}>
                                  <ShoppingCart className="h-3 w-3 mr-1" /> Order now
                                </Badge>
                              )}
                            </td>
                            <td className="px-4 py-4">
                              <div className="flex items-center justify-end gap-1.5 whitespace-nowrap">
                                <Button size="sm" className="h-9 px-3 text-xs font-medium rounded-lg bg-emerald-50 text-emerald-700 border border-emerald-200 hover:bg-emerald-100 dark:bg-emerald-950/40 dark:text-emerald-300 dark:border-emerald-800 shadow-none"
                                  onClick={() => { setLogTarget({ equipment: e, kind: 'maintenance' }); setLogDate(new Date().toISOString().slice(0, 10)); setLogPhotos([]); }}
                                  data-testid={`eq-log-maint-${e.name.replace(/\s/g, '-')}`}>
                                  <CalendarCheck className="h-4 w-4 mr-1.5" /> Log
                                </Button>
                                <Button size="sm" variant="outline" className="h-9 px-3 text-xs font-medium rounded-lg relative bg-slate-50 text-slate-700 border-slate-200 hover:bg-slate-100 dark:bg-slate-800 dark:text-slate-300 dark:border-slate-700"
                                  onClick={() => { setDocsTarget(e); setDocCategory('photo'); }}
                                  data-testid={`eq-docs-${e.name.replace(/\s/g, '-')}`}>
                                  <Paperclip className="h-4 w-4" />
                                  {(e.attachments || []).length > 0 && (
                                    <span className="absolute -top-1.5 -right-1.5 h-4 min-w-[16px] px-1 rounded-full bg-[#002FA7] text-white text-[10px] font-bold flex items-center justify-center shadow-sm">{e.attachments.length}</span>
                                  )}
                                </Button>
                                <Button size="sm" variant="outline" className={`h-9 px-3 text-xs font-medium rounded-lg relative ${(e.maintenance_instructions || e.replacement_instructions) ? 'bg-emerald-50 text-emerald-700 border-emerald-200 hover:bg-emerald-100' : 'bg-slate-50 text-slate-700 border-slate-200 hover:bg-slate-100 dark:bg-slate-800 dark:text-slate-300 dark:border-slate-700'}`}
                                  onClick={() => setInstrTarget(e)}
                                  title="Maintenance & replacement instructions"
                                  data-testid={`eq-instructions-${e.name.replace(/\s/g, '-')}`}>
                                  <BookOpen className="h-4 w-4" />
                                </Button>
                                <DropdownMenu>
                                  <DropdownMenuTrigger asChild>
                                    <Button size="icon" variant="ghost" className="h-9 w-9 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-600 dark:text-slate-300"
                                      data-testid={`eq-more-actions-${e.name.replace(/\s/g, '-')}`}>
                                      <MoreVertical className="h-4 w-4" />
                                    </Button>
                                  </DropdownMenuTrigger>
                                  <DropdownMenuContent align="end" className="w-56">
                                    <DropdownMenuItem onClick={() => setMaintTarget(e)} data-testid={`eq-maint-profile-${e.name.replace(/\s/g, '-')}`}>
                                      <Wrench className="h-4 w-4 mr-2 text-blue-600" /> Maintenance Profile & QR Sheet
                                    </DropdownMenuItem>
                                    <DropdownMenuItem onClick={() => printEquipmentQr(e)} data-testid={`eq-print-qr-${e.name.replace(/\s/g, '-')}`}>
                                      <QrCode className="h-4 w-4 mr-2 text-emerald-600" /> Print Equipment QR Sticker
                                    </DropdownMenuItem>
                                    <DropdownMenuItem onClick={() => setStaffTarget(e)} data-testid={`eq-assign-staff-${e.name.replace(/\s/g, '-')}`}>
                                      <Users className="h-4 w-4 mr-2 text-amber-600" /> Assign Maintenance Staff{(e.maintenance_staff_ids || []).length > 0 ? ` (${e.maintenance_staff_ids.length})` : ''}
                                    </DropdownMenuItem>
                                    <DropdownMenuItem onClick={() => { setLogTarget({ equipment: e, kind: 'replacement' }); setLogDate(new Date().toISOString().slice(0, 10)); setLogPhotos([]); }} data-testid={`eq-log-repl-${e.name.replace(/\s/g, '-')}`}>
                                      <Repeat className="h-4 w-4 mr-2 text-indigo-600" /> Log Replacement Done
                                    </DropdownMenuItem>
                                    <DropdownMenuItem onClick={() => openEditEq(e)} data-testid={`eq-edit-${e.name.replace(/\s/g, '-')}`}>
                                      <Pencil className="h-4 w-4 mr-2 text-slate-700 dark:text-slate-300" /> Edit Equipment Details
                                    </DropdownMenuItem>
                                    <DropdownMenuSeparator />
                                    <DropdownMenuItem onClick={() => deleteEq(e)} className="text-rose-600 focus:text-rose-600" data-testid={`eq-delete-${e.name.replace(/\s/g, '-')}`}>
                                      <Trash2 className="h-4 w-4 mr-2" /> Delete Equipment
                                    </DropdownMenuItem>
                                  </DropdownMenuContent>
                                </DropdownMenu>
                              </div>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </CardContent></Card>
          </TabsContent>

          <TabsContent value="types" className="space-y-4 mt-4">
            <div className="flex gap-2">
              <Button onClick={() => { setEditingType(null); setTypeForm({ name: '', description: '' }); setShowTypeForm(true); }} data-testid="type-new-btn">
                <Plus className="w-4 h-4 mr-2" /> Add Type
              </Button>
              <Button variant="outline" onClick={seedDefaults} data-testid="type-seed-btn">Add Suggested Types</Button>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
              {types.map((t) => (
                <Card key={t.id} data-testid={`type-card-${t.name.replace(/\s|\//g, '-')}`}>
                  <CardContent className="p-4 flex items-start justify-between">
                    <div>
                      <p className="font-semibold flex items-center gap-2">{t.name}
                        <TypeCodeBadge type={t} onSave={saveTypeCode} />
                      </p>
                      <p className="text-xs text-muted-foreground">{t.equipment_count} equipment item{t.equipment_count === 1 ? '' : 's'}</p>
                      {t.description && <p className="text-xs text-muted-foreground mt-1">{t.description}</p>}
                    </div>
                    <div className="flex gap-1">
                      <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => { setEditingType(t); setTypeForm({ name: t.name, description: t.description || '' }); setShowTypeForm(true); }}>
                        <Pencil className="h-3.5 w-3.5" />
                      </Button>
                      <Button size="icon" variant="ghost" className="h-7 w-7 text-red-500" onClick={() => deleteType(t)}>
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              ))}
              {types.length === 0 && !loading && (
                <p className="text-sm text-muted-foreground col-span-full" data-testid="types-empty">No equipment types yet — add your own or use "Add Suggested Types".</p>
              )}
            </div>
          </TabsContent>

          <TabsContent value="compliance" className="space-y-4 mt-4">
            {(() => {
              const scoreColor = (s) => (s == null ? 'text-slate-400' : s >= 85 ? 'text-emerald-600' : s >= 60 ? 'text-amber-600' : 'text-rose-600');
              const barColor = (s) => (s == null ? 'bg-slate-300' : s >= 85 ? 'bg-emerald-500' : s >= 60 ? 'bg-amber-500' : 'bg-rose-500');
              const nowY = new Date().getFullYear();
              const years = []; for (let y = nowY + 1; y >= nowY - 3; y--) years.push(y);
              const monthNames = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
              const fmtD = (d) => d.toISOString().slice(0, 10);
              const weekLbl = (d) => `${String(d.getUTCDate()).padStart(2, '0')} ${d.toLocaleString('en', { month: 'short', timeZone: 'UTC' })}`;
              const weeks = [];
              {
                const last = new Date(Date.UTC(compYear, compMon, 0));
                const d = new Date(Date.UTC(compYear, compMon - 1, 1));
                d.setUTCDate(d.getUTCDate() - ((d.getUTCDay() + 6) % 7)); // back to Monday
                while (d <= last) {
                  const e2 = new Date(d); e2.setUTCDate(e2.getUTCDate() + 6);
                  weeks.push({ value: `${fmtD(d)}_${fmtD(e2)}`, label: `${weekLbl(d)} – ${weekLbl(e2)}` });
                  d.setUTCDate(d.getUTCDate() + 7);
                }
              }
              const selCls = 'h-10 rounded-lg border border-input bg-background px-2.5 text-sm';
              return (
                <>
                  <div className="bg-white dark:bg-slate-900 p-3 sm:p-4 rounded-xl border border-slate-200/80 dark:border-slate-800 shadow-sm flex flex-wrap items-center gap-3">
                    <Label className="text-sm font-semibold">Year</Label>
                    <select value={compYear} onChange={(e) => { setCompYear(Number(e.target.value)); setCompWeek('entire'); }} className={selCls} data-testid="comp-year-select">
                      {years.map((y) => <option key={y} value={y}>{y}</option>)}
                    </select>
                    <Label className="text-sm font-semibold">Month</Label>
                    <select value={compMon} onChange={(e) => { setCompMon(Number(e.target.value)); setCompWeek('entire'); }} className={selCls} data-testid="comp-month-select">
                      {monthNames.map((m, i) => <option key={m} value={i + 1}>{m}</option>)}
                    </select>
                    <Label className="text-sm font-semibold">Week</Label>
                    <select value={compWeek} onChange={(e) => setCompWeek(e.target.value)} className={selCls} data-testid="comp-week-select">
                      <option value="entire">Entire month</option>
                      {weeks.map((w) => <option key={w.value} value={w.value}>{w.label} (Mon–Sun)</option>)}
                    </select>
                    <Button className="h-10 rounded-lg" onClick={() => loadCompliance(compYear, compMon, compWeek)} disabled={compLoading} data-testid="comp-load-btn">
                      {compLoading ? 'Loading…' : 'Show Compliance'}
                    </Button>
                    {compliance?.as_of && <span className="text-xs text-muted-foreground">{compliance?.period?.label ? `${compliance.period.label} · ` : ''}Scored on scheduled dates up to {compliance.as_of} (QR check-ins marked Complete)</span>}
                  </div>

                  {!compliance ? (
                    <p className="text-sm text-muted-foreground px-1">Pick a year, month and week (or the entire month) and click Show Compliance.</p>
                  ) : !compliance.overall ? (
                    <div className="bg-white dark:bg-slate-900 rounded-xl border p-8 text-center text-muted-foreground" data-testid="comp-empty">
                      No scheduled maintenance found for {compliance?.period?.label || compliance.month}. Sheets must be generated (Maintenance profile → Print Sheet) for dates to be scored.
                    </div>
                  ) : (
                    <>
                      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
                        <div className="rounded-xl border bg-white dark:bg-slate-900 p-4">
                          <p className="text-xs font-semibold uppercase tracking-wider text-slate-500">Overall Score</p>
                          <p className={`text-3xl font-bold tabular-nums ${scoreColor(compliance.overall.score)}`} data-testid="comp-overall-score">{compliance.overall.score == null ? '—' : `${compliance.overall.score}%`}</p>
                          <p className="text-[11px] text-slate-400">{compliance.overall.completed}/{compliance.overall.due} check-ins completed</p>
                        </div>
                        {compliance.areas.slice(0, 3).map((a) => (
                          <div key={a.area} className="rounded-xl border bg-white dark:bg-slate-900 p-4" data-testid={`comp-area-${a.area.replace(/[^a-z0-9]/gi, '-')}`}>
                            <p className="text-xs font-semibold uppercase tracking-wider text-slate-500 truncate" title={a.area}>{a.area}</p>
                            <p className={`text-3xl font-bold tabular-nums ${scoreColor(a.score)}`}>{a.score == null ? '—' : `${a.score}%`}</p>
                            <p className="text-[11px] text-slate-400">{a.completed}/{a.due} done · {a.equipment_count} equipment</p>
                          </div>
                        ))}
                      </div>

                      {compliance.areas.length > 0 && (
                        <div className="bg-white dark:bg-slate-900 rounded-xl border p-4 space-y-2">
                          <p className="text-sm font-semibold">Compliance by area <span className="text-xs font-normal text-muted-foreground">(weakest first)</span></p>
                          {compliance.areas.map((a) => (
                            <div key={a.area} className="flex items-center gap-3 text-sm">
                              <span className="w-64 truncate" title={a.area}>{a.area}</span>
                              <div className="flex-1 h-2.5 rounded-full bg-slate-100 dark:bg-slate-800 overflow-hidden">
                                <div className={`h-full rounded-full ${barColor(a.score)}`} style={{ width: `${a.score || 0}%` }} />
                              </div>
                              <span className={`w-14 text-right font-semibold tabular-nums ${scoreColor(a.score)}`}>{a.score == null ? '—' : `${a.score}%`}</span>
                              <span className="w-24 text-right text-xs text-muted-foreground tabular-nums">{a.completed}/{a.due} done</span>
                            </div>
                          ))}
                        </div>
                      )}

                      <div className="bg-white dark:bg-slate-900 rounded-xl border overflow-hidden">
                        <table className="w-full text-sm">
                          <thead>
                            <tr className="border-b bg-slate-50/80 dark:bg-slate-900/80 text-left text-xs font-semibold uppercase tracking-wider text-slate-500">
                              <th className="px-5 py-3">Equipment</th>
                              <th className="px-4 py-3">Location</th>
                              <th className="px-4 py-3 text-right">Due</th>
                              <th className="px-4 py-3 text-right">Done</th>
                              <th className="px-4 py-3 text-right">Incomplete</th>
                              <th className="px-4 py-3 text-right">Missed</th>
                              <th className="px-4 py-3 w-56">Score</th>
                            </tr>
                          </thead>
                          <tbody>
                            {compliance.equipment.map((e) => (
                              <tr key={e.equipment_id} className="border-b border-slate-100 dark:border-slate-800/60 hover:bg-slate-50/80 dark:hover:bg-slate-800/40" data-testid={`comp-row-${e.name.replace(/\s/g, '-')}`}>
                                <td className="px-5 py-3">
                                  <p className="font-semibold">{e.name}</p>
                                  <p className="text-[11px] text-muted-foreground">{e.type}</p>
                                </td>
                                <td className="px-4 py-3 text-xs text-muted-foreground">{e.location || '—'}</td>
                                <td className="px-4 py-3 text-right tabular-nums">{e.due}</td>
                                <td className="px-4 py-3 text-right tabular-nums text-emerald-700">{e.completed}</td>
                                <td className="px-4 py-3 text-right tabular-nums text-amber-600">{e.incomplete}</td>
                                <td className="px-4 py-3 text-right tabular-nums text-rose-600">{e.missed}</td>
                                <td className="px-4 py-3">
                                  <div className="flex items-center gap-2">
                                    <div className="flex-1 h-2.5 rounded-full bg-slate-100 dark:bg-slate-800 overflow-hidden">
                                      <div className={`h-full rounded-full ${barColor(e.score)}`} style={{ width: `${e.score || 0}%` }} />
                                    </div>
                                    <span className={`font-semibold tabular-nums ${scoreColor(e.score)}`}>{e.score == null ? '—' : `${e.score}%`}</span>
                                  </div>
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </>
                  )}
                </>
              );
            })()}
          </TabsContent>

        </Tabs>
      </div>

      {/* Equipment form */}
      {maintTarget && <MaintenanceProfile equipment={maintTarget} onClose={() => { setMaintTarget(null); loadAll(); }} />}
      {staffTarget && <AssignStaffDialog equipment={staffTarget} onClose={(saved) => { setStaffTarget(null); if (saved) loadAll(); }} />}
      {instrTarget && <EquipmentInstructions equipment={instrTarget} onClose={() => setInstrTarget(null)} onSaved={loadAll} />}
      <Dialog open={showEqForm} onOpenChange={setShowEqForm}>
        <DialogContent className="sm:max-w-3xl max-h-[90vh] overflow-y-auto" data-testid="eq-form-dialog">
          <DialogHeader>
            <DialogTitle>{editingEq ? `Edit ${editingEq.name}` : 'Add Equipment / Component'}</DialogTitle>
            <DialogDescription>Maintenance & replacement schedules auto-compute next due dates from last date + frequency.</DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            {/* 1 — Basic Details */}
            <FormSection icon={Cog} title="Basic Details" open={openSecs.basic} onToggle={() => toggleSec('basic')}
              hint={[eqForm.name, types.find((t) => t.id === eqForm.equipment_type_id)?.name].filter(Boolean).join(' · ') || 'name & type'}
              testid="eq-sec-basic">
              <div>
                <Label>Name *</Label>
                <Input value={eqForm.name} onChange={(e) => setF('name', e.target.value)} placeholder="e.g. 5 Micron Filter" className="mt-1" data-testid="eq-input-name" />
              </div>
              <div>
                <Label>Equipment Type *</Label>
                <select className="mt-1 w-full h-10 rounded-md border border-input bg-background px-3 text-sm" value={eqForm.equipment_type_id} onChange={(e) => setF('equipment_type_id', e.target.value)} data-testid="eq-input-type">
                  <option value="">Select type…</option>
                  {types.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
                </select>
              </div>
              <div><Label>Make / Brand</Label><Input value={eqForm.make_brand} onChange={(e) => setF('make_brand', e.target.value)} className="mt-1" data-testid="eq-input-make" /></div>
              <div><Label>Model / Specification</Label><Input value={eqForm.model_spec} onChange={(e) => setF('model_spec', e.target.value)} className="mt-1" data-testid="eq-input-model" /></div>
            </FormSection>

            {/* 2 — Hierarchy & Location */}
            <FormSection icon={Layers} title="Hierarchy & Location" color="emerald" open={openSecs.hierarchy} onToggle={() => toggleSec('hierarchy')}
              hint={[
                eqForm.parent_equipment_id ? `part of ${(equipment.find((x) => x.id === eqForm.parent_equipment_id) || {}).name || 'parent'}` : null,
                eqForm.facility_id ? (facilities.find((f) => f.id === eqForm.facility_id) || {}).facility_name : null,
              ].filter(Boolean).join(' · ') || 'parent equipment, facility, floor & area'}
              testid="eq-sec-hierarchy">
              <div>
                <Label>Parent Equipment <span className="text-xs text-muted-foreground">(if part of another equipment)</span></Label>
                <select className="mt-1 w-full h-10 rounded-md border border-input bg-background px-3 text-sm" value={eqForm.parent_equipment_id || ''} onChange={(e) => setF('parent_equipment_id', e.target.value)} data-testid="eq-input-parent">
                  <option value="">None (top-level equipment)</option>
                  {(() => {
                    const blocked = editingEq ? descendantIds(equipment, editingEq.id) : new Set();
                    return equipment
                      .filter((x) => (!editingEq || (x.id !== editingEq.id && !blocked.has(x.id))))
                      .map((x) => <option key={x.id} value={x.id}>{x.name}{x.parent_equipment_name ? ` (under ${x.parent_equipment_name})` : ''}</option>);
                  })()}
                </select>
              </div>
              <div className="flex items-end pb-2">
                <label className="flex items-center gap-2 text-sm">
                  <input type="checkbox" checked={!!eqForm.has_children} onChange={(e) => setF('has_children', e.target.checked)} data-testid="eq-input-haschildren" />
                  Has child equipment <span className="text-xs text-muted-foreground">(assembly — e.g. Machine)</span>
                </label>
              </div>
              <div className="sm:col-span-2">
                <Label className="flex items-center gap-1"><MapPin className="h-3.5 w-3.5" /> Location <span className="text-xs text-muted-foreground font-normal">(Facility › Floor › Area)</span></Label>
                <div className="mt-1 grid grid-cols-1 sm:grid-cols-3 gap-2">
                  <select className="h-10 rounded-md border border-input bg-background px-3 text-sm" value={eqForm.facility_id || ''}
                    onChange={(e) => setEqForm((p) => ({ ...p, facility_id: e.target.value, floor_id: '', area_id: '' }))} data-testid="eq-input-facility">
                    <option value="">No facility</option>
                    {facilities.map((f) => <option key={f.id} value={f.id}>{f.facility_name} ({f.facility_type})</option>)}
                  </select>
                  {(() => {
                    const selFac = facilities.find((f) => f.id === eqForm.facility_id);
                    const selFloor = (selFac?.floors || []).find((fl) => fl.id === eqForm.floor_id);
                    return (
                      <>
                        <select className="h-10 rounded-md border border-input bg-background px-3 text-sm disabled:opacity-50" value={eqForm.floor_id || ''} disabled={!selFac}
                          onChange={(e) => setEqForm((p) => ({ ...p, floor_id: e.target.value, area_id: '' }))} data-testid="eq-input-floor">
                          <option value="">{selFac ? 'Select floor…' : 'Pick facility first'}</option>
                          {(selFac?.floors || []).map((fl) => <option key={fl.id} value={fl.id}>{fl.name}</option>)}
                        </select>
                        <select className="h-10 rounded-md border border-input bg-background px-3 text-sm disabled:opacity-50" value={eqForm.area_id || ''} disabled={!selFloor}
                          onChange={(e) => setF('area_id', e.target.value)} data-testid="eq-input-area">
                          <option value="">{selFloor ? 'Select area…' : 'Pick floor first'}</option>
                          {(selFloor?.areas || []).map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
                        </select>
                      </>
                    );
                  })()}
                </div>
              </div>
            </FormSection>

            {/* 3 — Maintenance Schedule */}
            <FormSection icon={CalendarCheck} title="Maintenance Schedule" color="blue" open={openSecs.maintenance} onToggle={() => toggleSec('maintenance')}
              hint={freqLabel(eqForm.maintenance_frequency_days) ? `${freqLabel(eqForm.maintenance_frequency_days)}${eqForm.maintenance_start_date ? ` · from ${eqForm.maintenance_start_date}` : ''}` : 'frequency & dates'}
              testid="eq-sec-maintenance">
              <div><Label>Maintenance Frequency</Label><FreqSelect value={eqForm.maintenance_frequency_days} onChange={(v) => setF('maintenance_frequency_days', v)} testid="eq-input-maintfreq" /></div>
              <div><Label>Maintenance Start Date <span className="text-xs text-muted-foreground">(schedule begins)</span></Label><Input type="date" value={eqForm.maintenance_start_date} onChange={(e) => setF('maintenance_start_date', e.target.value)} className="mt-1" data-testid="eq-input-maintstart" /></div>
              <div><Label>Last Maintenance Date</Label><Input type="date" value={eqForm.last_maintenance_date} onChange={(e) => setF('last_maintenance_date', e.target.value)} className="mt-1" data-testid="eq-input-lastmaint" /></div>
              <div><Label>Next Maintenance Due <span className="text-xs text-muted-foreground">(blank = auto)</span></Label><Input type="date" value={eqForm.next_maintenance_due} onChange={(e) => setF('next_maintenance_due', e.target.value)} className="mt-1" /></div>
              <div><Label>Photo Inspections / Month <span className="text-xs text-muted-foreground">(random, not disclosed)</span></Label><Input type="number" min="0" value={eqForm.photo_inspections_per_month} onChange={(e) => setF('photo_inspections_per_month', e.target.value)} placeholder="e.g. 5" className="mt-1" data-testid="eq-input-photoinsp" /></div>
            </FormSection>

            {/* 4 — Replacement Schedule */}
            <FormSection icon={Repeat} title="Replacement Schedule" color="violet" open={openSecs.replacement} onToggle={() => toggleSec('replacement')}
              hint={freqLabel(eqForm.replacement_frequency_days) ? `${freqLabel(eqForm.replacement_frequency_days)}${eqForm.replacement_start_date ? ` · from ${eqForm.replacement_start_date}` : ''}` : 'frequency & dates'}
              testid="eq-sec-replacement">
              <div><Label>Replacement Frequency</Label><FreqSelect value={eqForm.replacement_frequency_days} onChange={(v) => setF('replacement_frequency_days', v)} testid="eq-input-replfreq" /></div>
              <div><Label>Replacement Start Date <span className="text-xs text-muted-foreground">(schedule begins)</span></Label><Input type="date" value={eqForm.replacement_start_date} onChange={(e) => setF('replacement_start_date', e.target.value)} className="mt-1" data-testid="eq-input-replstart" /></div>
              <div><Label>Last Replacement Date</Label><Input type="date" value={eqForm.last_replacement_date} onChange={(e) => setF('last_replacement_date', e.target.value)} className="mt-1" data-testid="eq-input-lastrepl" /></div>
              <div><Label>Next Replacement Due <span className="text-xs text-muted-foreground">(blank = auto)</span></Label><Input type="date" value={eqForm.next_replacement_due} onChange={(e) => setF('next_replacement_due', e.target.value)} className="mt-1" /></div>
            </FormSection>

            {/* 5 — Procurement, Stock & Remarks */}
            <FormSection icon={ShoppingCart} title="Procurement, Stock & Remarks" color="amber" open={openSecs.procurement} onToggle={() => toggleSec('procurement')}
              hint={[
                eqForm.procurement_lead_time_days !== '' && eqForm.procurement_lead_time_days != null ? `${eqForm.procurement_lead_time_days}d lead` : null,
                eqForm.min_stock_level !== '' && eqForm.min_stock_level != null ? `min ${eqForm.min_stock_level}` : null,
              ].filter(Boolean).join(' · ') || 'lead time, life, reorder level & notes'}
              testid="eq-sec-procurement">
              <div><Label>Procurement Lead Time (days)</Label><Input type="number" min="0" value={eqForm.procurement_lead_time_days} onChange={(e) => setF('procurement_lead_time_days', e.target.value)} className="mt-1" data-testid="eq-input-leadtime" /></div>
              <div><Label>Expected Life / Usage Limit</Label><Input placeholder="e.g. 6 months / 50,000 L" value={eqForm.expected_life} onChange={(e) => setF('expected_life', e.target.value)} className="mt-1" /></div>
              <div><Label>Minimum Stock / Reorder Level</Label><Input type="number" min="0" value={eqForm.min_stock_level} onChange={(e) => setF('min_stock_level', e.target.value)} className="mt-1" data-testid="eq-input-minstock" /></div>
              <div className="sm:col-span-2"><Label>Remarks / Maintenance Instructions</Label><Textarea rows={2} value={eqForm.remarks} onChange={(e) => setF('remarks', e.target.value)} className="mt-1" /></div>
            </FormSection>

            {/* 6 — Vendor Associations */}
            <FormSection icon={Users} title="Vendor Associations" color="rose" open={openSecs.vendors} onToggle={() => toggleSec('vendors')}
              hint={eqForm.vendors.length ? `${eqForm.vendors.length} vendor${eqForm.vendors.length === 1 ? '' : 's'} linked` : 'link suppliers, prices & AMC'}
              testid="eq-sec-vendors">
              <div className="sm:col-span-2 space-y-3">
                <div className="flex items-center justify-between">
                  {eqForm.vendors.length === 0
                    ? <p className="text-xs text-muted-foreground">No vendors associated yet.</p>
                    : <p className="text-xs text-muted-foreground">{eqForm.vendors.length} vendor{eqForm.vendors.length === 1 ? '' : 's'}</p>}
                  <Button size="sm" variant="outline" onClick={() => setEqForm((p) => ({ ...p, vendors: [...p.vendors, { ...EMPTY_VENDOR }] }))} data-testid="eq-add-vendor-btn">
                    <Plus className="h-3.5 w-3.5 mr-1" /> Add Vendor
                  </Button>
                </div>
              {eqForm.vendors.map((v, i) => (
                <div key={i} className="rounded-lg border p-3 grid grid-cols-1 sm:grid-cols-3 gap-3 relative" data-testid={`eq-vendor-row-${i}`}>
                  <div>
                    <Label className="text-xs">Vendor *</Label>
                    <select className="mt-1 w-full h-9 rounded-md border border-input bg-background px-2 text-sm" value={v.vendor_id} onChange={(e) => setVendorField(i, 'vendor_id', e.target.value)} data-testid={`eq-vendor-select-${i}`}>
                      <option value="">Select vendor…</option>
                      {vendors.map((x) => <option key={x.id} value={x.id}>{x.vendor_name}</option>)}
                    </select>
                  </div>
                  <div>
                    <Label className="text-xs">Lead Time (days)</Label>
                    <Input type="number" min="0" className="mt-1 h-9" value={v.lead_time_days} onChange={(e) => setVendorField(i, 'lead_time_days', e.target.value)} />
                  </div>
                  <div>
                    <Label className="text-xs">Last Purchase Price (₹)</Label>
                    <Input type="number" min="0" step="0.01" className="mt-1 h-9" value={v.last_purchase_price} onChange={(e) => setVendorField(i, 'last_purchase_price', e.target.value)} />
                  </div>
                  <div>
                    <Label className="text-xs">Vendor Part / Item Code</Label>
                    <Input className="mt-1 h-9" value={v.vendor_part_code} onChange={(e) => setVendorField(i, 'vendor_part_code', e.target.value)} />
                  </div>
                  <div>
                    <Label className="text-xs">Contact / Support</Label>
                    <Input className="mt-1 h-9" value={v.contact_details} onChange={(e) => setVendorField(i, 'contact_details', e.target.value)} />
                  </div>
                  <div>
                    <Label className="text-xs">AMC / Service Contract</Label>
                    <Input className="mt-1 h-9" value={v.amc_details} onChange={(e) => setVendorField(i, 'amc_details', e.target.value)} />
                  </div>
                  <label className="flex items-center gap-2 text-sm sm:col-span-2">
                    <input type="checkbox" checked={v.preferred} onChange={(e) => setVendorField(i, 'preferred', e.target.checked)} data-testid={`eq-vendor-preferred-${i}`} />
                    <Star className="h-3.5 w-3.5 text-amber-500" /> Preferred vendor
                  </label>
                  <Button size="sm" variant="ghost" className="text-red-500 justify-self-end sm:col-span-1" data-testid={`eq-vendor-remove-${i}`}
                    onClick={() => setEqForm((p) => ({ ...p, vendors: p.vendors.filter((_, j) => j !== i) }))}>
                    <Trash2 className="h-3.5 w-3.5 mr-1" /> Remove
                  </Button>
                </div>
                ))}
              </div>
            </FormSection>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setShowEqForm(false)}>Cancel</Button>
            <Button onClick={saveEq} disabled={saving} data-testid="eq-save-btn">{saving ? 'Saving…' : editingEq ? 'Update Equipment' : 'Create Equipment'}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Type form */}
      <Dialog open={showTypeForm} onOpenChange={setShowTypeForm}>
        <DialogContent className="sm:max-w-md" data-testid="type-form-dialog">
          <DialogHeader><DialogTitle>{editingType ? 'Edit Equipment Type' : 'New Equipment Type'}</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div><Label>Name *</Label><Input value={typeForm.name} onChange={(e) => setTypeForm((p) => ({ ...p, name: e.target.value }))} placeholder="e.g. Filters" className="mt-1" data-testid="type-input-name" /></div>
            <div><Label>Description</Label><Textarea rows={2} value={typeForm.description} onChange={(e) => setTypeForm((p) => ({ ...p, description: e.target.value }))} className="mt-1" /></div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowTypeForm(false)}>Cancel</Button>
            <Button onClick={saveType} data-testid="type-save-btn">{editingType ? 'Update' : 'Create'}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Log maintenance/replacement */}
      <Dialog open={!!logTarget} onOpenChange={(o) => !o && setLogTarget(null)}>
        <DialogContent className="sm:max-w-md" data-testid="eq-log-dialog">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Wrench className="h-5 w-5 text-emerald-600" />
              Log {logTarget?.kind === 'maintenance' ? 'Maintenance' : 'Replacement'} — {logTarget?.equipment?.name}
            </DialogTitle>
            <DialogDescription>The next due date will be recalculated automatically from the frequency.</DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div><Label>Date</Label><Input type="date" value={logDate} onChange={(e) => setLogDate(e.target.value)} className="mt-1" data-testid="eq-log-date" /></div>
            <div><Label>Remarks</Label><Textarea rows={2} value={logRemarks} onChange={(e) => setLogRemarks(e.target.value)} className="mt-1" /></div>
            <div>
              <Label>Evidence Photos</Label>
              <div className="mt-1 flex flex-wrap items-center gap-2">
                <Button className="h-9 bg-[#002FA7] hover:bg-[#00227A]" disabled={logUploading} onClick={() => setCameraFor('log')} data-testid="eq-log-camera-label">
                  <CameraIcon className="h-4 w-4 mr-1.5" /> {logUploading ? 'Uploading…' : 'Take Photo'}
                </Button>
                <label className="inline-flex items-center gap-1.5 h-9 px-3 rounded-md border border-input bg-background text-sm font-medium cursor-pointer hover:bg-slate-50" data-testid="eq-log-upload-label">
                  <Upload className="h-4 w-4" /> From gallery / files
                  <input type="file" accept="image/*" multiple className="hidden" disabled={logUploading}
                    onChange={(e) => { uploadLogPhoto(e.target.files); e.target.value = ''; }} data-testid="eq-log-upload-input" />
                </label>
              </div>
              {logPhotos.length > 0 && (
                <div className="mt-2 flex flex-wrap gap-2" data-testid="eq-log-photos">
                  {logPhotos.map((p) => (
                    <div key={p.id} className="w-16">
                      <AuthImg src={`${API_URL}/api/production/equipment/${logTarget?.equipment?.id}/files/${p.id}`} alt={p.filename}
                        className="w-16 h-16 object-cover rounded-md border" testid={`eq-log-photo-${p.id}`} />
                      <p className="truncate text-[9px] text-muted-foreground mt-0.5">{p.filename}</p>
                    </div>
                  ))}
                </div>
              )}
              <p className="text-[11px] text-muted-foreground mt-1">Photos are saved with this log entry and also appear under the equipment's Photos.</p>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setLogTarget(null)}>Cancel</Button>
            <Button onClick={submitLog} data-testid="eq-log-confirm-btn">Save Log</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Equipment documents */}
      <Dialog open={!!docsTarget} onOpenChange={(o) => !o && setDocsTarget(null)}>
        <DialogContent className="sm:max-w-2xl max-h-[85vh] overflow-y-auto" data-testid="eq-docs-dialog">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Paperclip className="h-5 w-5 text-[#002FA7]" /> Documents — {docsTarget?.name}
            </DialogTitle>
            <DialogDescription>Photos, vendor certifications, quotations and any other relevant documents for this equipment.</DialogDescription>
          </DialogHeader>
          <div className="flex flex-wrap items-center gap-2">
            <select className="h-9 rounded-md border border-input bg-background px-3 text-sm" value={docCategory} onChange={(e) => setDocCategory(e.target.value)} data-testid="eq-doc-category">
              {DOC_CATEGORIES.map((c) => <option key={c.key} value={c.key}>{c.label}</option>)}
            </select>
            <label className="inline-flex items-center gap-1.5 h-9 px-3 rounded-md border border-input bg-background text-sm font-medium cursor-pointer hover:bg-slate-50" data-testid="eq-doc-upload-label">
              <Upload className="h-4 w-4" /> {uploading ? 'Uploading…' : 'Upload files'}
              <input type="file" multiple className="hidden" disabled={uploading}
                accept={docCategory === 'photo' ? 'image/*' : undefined}
                onChange={(e) => { uploadDoc(e.target.files); e.target.value = ''; }} data-testid="eq-doc-file-input" />
            </label>
            <Button className="h-9 bg-[#002FA7] hover:bg-[#00227A]" disabled={uploading} onClick={() => setCameraFor('docs')} data-testid="eq-doc-camera-label">
              <CameraIcon className="h-4 w-4 mr-1.5" /> Take Photo
            </Button>
            <span className="text-xs text-muted-foreground">Max 15 MB per file</span>
            {(docsTarget?.attachments || []).length > 0 && (
              <Button variant="outline" className="h-9 ml-auto" onClick={downloadZip} data-testid="eq-doc-zip-btn">
                <Download className="h-4 w-4 mr-1.5 text-[#002FA7]" /> Download all (zip)
              </Button>
            )}
          </div>
          {DOC_CATEGORIES.map(({ key, label, icon: Icon }) => {
            const files = (docsTarget?.attachments || []).filter((f) => f.category === key);
            if (files.length === 0) return null;
            if (key === 'photo') {
              return (
                <div key={key} className="space-y-1.5">
                  <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5"><Icon className="h-3.5 w-3.5" /> {label} ({files.length})</p>
                  <div className="flex flex-wrap gap-2">
                    {files.map((f) => (
                      <div key={f.id} className="relative group" data-testid={`eq-doc-thumb-${f.id}`}>
                        <AuthImg src={`${API_URL}/api/production/equipment/${docsTarget.id}/files/${f.id}`} alt={f.filename}
                          className="w-24 h-24 object-cover rounded-md border cursor-pointer hover:opacity-90 transition-opacity"
                          onClick={() => setPreviewFile(f)} testid={`eq-doc-thumb-img-${f.id}`} />
                        <button type="button" className="absolute top-1 right-1 h-5 w-5 rounded-full bg-black/60 text-white text-[10px] leading-5 opacity-0 group-hover:opacity-100 transition-opacity"
                          onClick={() => deleteDoc(f)} title="Delete" data-testid={`eq-doc-delete-${f.id}`}>✕</button>
                        <p className="w-24 truncate text-[10px] text-muted-foreground mt-0.5">{f.filename}</p>
                      </div>
                    ))}
                  </div>
                </div>
              );
            }
            return (
              <div key={key} className="space-y-1.5">
                <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5"><Icon className="h-3.5 w-3.5" /> {label} ({files.length})</p>
                <div className="divide-y rounded-md border">
                  {files.map((f) => (
                    <div key={f.id} className="flex items-center gap-2 px-3 py-2 text-sm" data-testid={`eq-doc-file-${f.id}`}>
                      <span className="flex-1 truncate">{f.filename}</span>
                      <span className="text-xs text-muted-foreground whitespace-nowrap">{fmtSize(f.size)} · {f.uploaded_by} · {(f.uploaded_at || '').slice(0, 10)}</span>
                      <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => downloadDoc(f)} data-testid={`eq-doc-download-${f.id}`}>
                        <Download className="h-3.5 w-3.5 text-[#002FA7]" />
                      </Button>
                      <Button size="icon" variant="ghost" className="h-7 w-7 text-red-500" onClick={() => deleteDoc(f)} data-testid={`eq-doc-delete-${f.id}`}>
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  ))}
                </div>
              </div>
            );
          })}
          {(docsTarget?.attachments || []).length === 0 && (
            <p className="text-sm text-muted-foreground text-center py-6 border border-dashed rounded-md" data-testid="eq-docs-empty">
              No documents yet — pick a category and upload photos, certifications or quotations.
            </p>
          )}
        </DialogContent>
      </Dialog>

      <CameraDialog open={!!cameraFor} onClose={() => setCameraFor(null)}
        onCapture={(file) => (cameraFor === 'log' ? uploadLogPhoto([file]) : uploadDoc([file], 'photo'))} />

      {/* Photo preview lightbox */}
      <Dialog open={!!previewFile} onOpenChange={(o) => !o && setPreviewFile(null)}>
        <DialogContent className="sm:max-w-3xl" data-testid="eq-photo-preview-dialog">
          <DialogHeader>
            <DialogTitle className="text-base">{previewFile?.filename}</DialogTitle>
            <DialogDescription>{previewFile ? `${fmtSize(previewFile.size)} · uploaded by ${previewFile.uploaded_by} on ${(previewFile.uploaded_at || '').slice(0, 10)}` : ''}</DialogDescription>
          </DialogHeader>
          {previewFile && docsTarget && (
            <AuthImg src={`${API_URL}/api/production/equipment/${docsTarget.id}/files/${previewFile.id}`} alt={previewFile.filename}
              className="w-full max-h-[65vh] object-contain rounded-md bg-slate-50" testid="eq-photo-preview-img" />
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => downloadDoc(previewFile)} data-testid="eq-photo-preview-download">
              <Download className="h-4 w-4 mr-1.5" /> Download
            </Button>
            <Button variant="outline" className="text-red-600 border-red-200 hover:bg-red-50"
              onClick={() => { deleteDoc(previewFile); setPreviewFile(null); }} data-testid="eq-photo-preview-delete">
              <Trash2 className="h-4 w-4 mr-1.5" /> Delete
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
