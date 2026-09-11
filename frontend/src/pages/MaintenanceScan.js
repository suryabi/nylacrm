import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useParams } from 'react-router-dom';
import { Button } from '../components/ui/button';
import { Textarea } from '../components/ui/textarea';
import { Badge } from '../components/ui/badge';
import { Card, CardContent } from '../components/ui/card';
import { Wrench, CheckCircle2, XCircle, Camera, RefreshCw, Trash2, Eye, UserCheck, MapPin } from 'lucide-react';
import { ScanInstructions } from '../components/ScanInstructions';
import StaffScanLogin from '../components/StaffScanLogin';
import { getStaffSession, saveStaffSession, clearStaffSession, scanAuthHeaders } from '../lib/staffSession';
import { toast } from 'sonner';

const API_URL = process.env.REACT_APP_BACKEND_URL;
const authHeaders = () => scanAuthHeaders({ 'Content-Type': 'application/json' });

const getPosition = () => new Promise((resolve) => {
  if (!navigator.geolocation) return resolve(null);
  navigator.geolocation.getCurrentPosition(
    (p) => resolve({ lat: p.coords.latitude, lng: p.coords.longitude }),
    () => resolve(null),
    { enableHighAccuracy: true, timeout: 10000, maximumAge: 30000 });
});

export default function MaintenanceScan() {
  const { token } = useParams();
  const [state, setState] = useState({ loading: true });
  const [status, setStatus] = useState(null); // 'completed' | 'incomplete'
  const [remarks, setRemarks] = useState('');
  const [photos, setPhotos] = useState([]);
  const [submitting, setSubmitting] = useState(false);
  const [camOn, setCamOn] = useState(false);
  const [camError, setCamError] = useState('');
  const [uploading, setUploading] = useState(false);
  const [photoView, setPhotoView] = useState(null);
  const [staff, setStaff] = useState(getStaffSession);
  const [reloadKey, setReloadKey] = useState(0);
  const videoRef = useRef(null);
  const streamRef = useRef(null);

  const staffLogin = (m, staffToken) => {
    setStaff(saveStaffSession(m, staffToken));
    setState({ loading: true });
    setReloadKey((k) => k + 1);
  };
  const staffLogout = () => {
    const s = getStaffSession();
    if (s?.token) fetch(`${API_URL}/api/maintenance/staff-auth/logout`, { method: 'POST', headers: { 'X-Staff-Token': s.token } }).catch(() => {});
    clearStaffSession();
    setStaff(null);
    if (!localStorage.getItem('session_token')) { setState({ loading: true }); setReloadKey((k) => k + 1); }
  };

  const load = useCallback(async () => {
    try {
      const res = await fetch(`${API_URL}/api/maintenance/scan/${token}`, { headers: authHeaders() });
      if (res.status === 401) { clearStaffSession(); setStaff(null); setState({ needLogin: true }); return; }
      if (res.status === 403) { setState({ error: (await res.json()).detail || 'Access denied' }); return; }
      const data = await res.json();
      if (!res.ok) { setState({ error: data.detail || 'Unknown QR code' }); return; }
      setState(data);
    } catch { setState({ error: 'Could not reach the server' }); }
  }, [token]);

  useEffect(() => { load(); }, [load, reloadKey]);

  useEffect(() => () => { if (streamRef.current) streamRef.current.getTracks().forEach((t) => t.stop()); }, []);

  const startCamera = async () => {
    setCamError('');
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' }, audio: false });
      streamRef.current = stream;
      setCamOn(true);
      setTimeout(() => { if (videoRef.current) { videoRef.current.srcObject = stream; videoRef.current.play(); } }, 100);
    } catch { setCamError('Camera access denied or unavailable. Photos must be captured live — gallery uploads are not allowed.'); }
  };

  const stopCamera = () => {
    if (streamRef.current) streamRef.current.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    setCamOn(false);
  };

  const capture = async () => {
    const video = videoRef.current;
    if (!video || !video.videoWidth) return;
    const canvas = document.createElement('canvas');
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    const ctx = canvas.getContext('2d');
    ctx.drawImage(video, 0, 0);
    // Burn the timestamp into the photo (bottom-right)
    const ts = new Date().toLocaleString('en-GB', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit', second: '2-digit' });
    const fs = Math.max(18, Math.round(canvas.width * 0.03));
    ctx.font = `bold ${fs}px Arial`;
    const pad = fs * 0.6;
    const tw = ctx.measureText(ts).width;
    ctx.fillStyle = 'rgba(0,0,0,0.55)';
    ctx.fillRect(canvas.width - tw - pad * 2, canvas.height - fs - pad * 1.8, tw + pad * 2, fs + pad * 1.8);
    ctx.fillStyle = '#ffffff';
    ctx.textBaseline = 'bottom';
    ctx.fillText(ts, canvas.width - tw - pad, canvas.height - pad * 0.9);
    canvas.toBlob(async (blob) => {
      if (!blob) return;
      setUploading(true);
      try {
        const fd = new FormData();
        fd.append('file', blob, 'capture.jpg');
        if (staff?.id) fd.append('staff_member_id', staff.id);
        const res = await fetch(`${API_URL}/api/maintenance/scan/${token}/photo`, {
          method: 'POST', headers: scanAuthHeaders(), body: fd,
        });
        if (!res.ok) throw new Error((await res.json()).detail || 'Upload failed');
        const meta = await res.json();
        setPhotos((p) => [...p, { ...meta, preview: canvas.toDataURL('image/jpeg', 0.7) }]);
        toast.success('Photo captured with timestamp');
      } catch (e) { toast.error(e.message); } finally { setUploading(false); }
    }, 'image/jpeg', 0.85);
  };

  const submit = async () => {
    if (!status) { toast.error('Select Maintenance Complete or Incomplete'); return; }
    if (state.photo_required && photos.length === 0 && !state.relog) { toast.error('Photo inspection required today — capture at least one live photo first'); return; }
    setSubmitting(true);
    try {
      let pos = null;
      if (state.geofence?.required) {
        pos = await getPosition();
        if (!pos) { toast.error('Location access is required — allow GPS/location in your browser to record maintenance here.'); setSubmitting(false); return; }
      }
      const res = await fetch(`${API_URL}/api/maintenance/scan/${token}/submit`, {
        method: 'POST', headers: authHeaders(),
        body: JSON.stringify({ status, remarks: remarks || null, photo_ids: photos.map((p) => p.id), staff_member_id: staff?.id || null, lat: pos?.lat ?? null, lng: pos?.lng ?? null }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.detail || 'Submit failed');
      stopCamera();
      setState((s) => ({ ...s, already_submitted: true, record: data, records: [...(s.records || []), data], can_log_another: true, relog: false }));
      setStatus(null); setRemarks(''); setPhotos([]);
      toast.success('Maintenance record saved');
    } catch (e) { toast.error(e.message); } finally { setSubmitting(false); }
  };

  const Shell = ({ children }) => (
    <div className="min-h-screen bg-slate-100 flex items-start justify-center p-4 pt-8" data-testid="maintenance-scan-page">
      <div className="w-full max-w-md space-y-4">
        <div className="flex items-center gap-2 text-slate-700">
          <div className="p-2 rounded-lg bg-[#002FA7] text-white"><Wrench className="h-5 w-5" /></div>
          <div>
            <p className="font-bold leading-tight">Equipment Maintenance</p>
            <p className="text-xs text-muted-foreground">QR maintenance check-in</p>
          </div>
        </div>
        {children}
      </div>
    </div>
  );

  if (state.loading) return <Shell><Card><CardContent className="py-10 text-center text-muted-foreground"><RefreshCw className="h-5 w-5 animate-spin mx-auto mb-2" />Checking QR code…</CardContent></Card></Shell>;

  if (state.needLogin) {
    return <StaffScanLogin scanRef={{ token }} onLogin={staffLogin} />;
  }

  if (state.error) {
    return <Shell><Card><CardContent className="py-8 text-center" data-testid="scan-error"><XCircle className="h-8 w-8 mx-auto text-red-500 mb-2" /><p className="font-medium">{state.error}</p></CardContent></Card></Shell>;
  }

  const info = (
    <Card><CardContent className="p-4 space-y-1" data-testid="scan-equipment-info">
      <p className="font-bold text-lg">{state.equipment_name}</p>
      <p className="text-xs text-muted-foreground">{state.equipment_type} · ID: {state.equipment_id?.slice(0, 8).toUpperCase()}</p>
      <p className="text-sm">Scheduled date: <span className="font-semibold">{state.scheduled_date}</span></p>
    </CardContent></Card>
  );

  const instructions = (
    <ScanInstructions equipmentId={state.equipment_id} maintenance={state.maintenance_instructions}
      replacement={state.replacement_instructions} files={state.instruction_files || []} />
  );

  if (!state.valid) {
    return (
      <Shell>
        {info}
        <Card className="border-red-300"><CardContent className="py-8 text-center" data-testid="scan-invalid">
          <XCircle className="h-10 w-10 mx-auto text-red-500 mb-3" />
          <p className="font-bold text-red-600 text-lg">This QR code is not valid for today.</p>
          <p className="text-sm text-muted-foreground mt-1">It can only be used on {state.scheduled_date}. Today is {state.today}.</p>
        </CardContent></Card>
      </Shell>
    );
  }

  if (state.already_submitted) {
    const recs = state.records && state.records.length ? state.records : (state.record ? [state.record] : []);
    const r = recs[recs.length - 1] || {};
    const logAnother = () => { setStatus(null); setRemarks(''); setPhotos([]); setState((s) => ({ ...s, already_submitted: false, relog: true })); };
    return (
      <Shell>
        {info}
        {instructions}
        <Card className="border-emerald-300"><CardContent className="py-6 text-center space-y-2" data-testid="scan-submitted">
          <CheckCircle2 className="h-10 w-10 mx-auto text-emerald-600" />
          <p className="font-bold text-lg">Maintenance record{recs.length > 1 ? 's' : ''} saved</p>
          <Badge className={r.status === 'completed' ? 'bg-emerald-600' : 'bg-amber-500'}>{r.status === 'completed' ? 'Maintenance Complete' : 'Maintenance Incomplete'}</Badge>
          <p className="text-sm text-muted-foreground">By {r.performed_by} · {(r.completed_at || '').slice(0, 16).replace('T', ' ')}</p>
          {(r.photos || []).length > 0 && <p className="text-xs text-muted-foreground">{r.photos.length} timestamped photo{r.photos.length === 1 ? '' : 's'} attached</p>}
          <p className="text-xs text-muted-foreground pt-2">Saved records are locked and cannot be edited. Corrections can be added from the equipment profile with a full audit trail.</p>
        </CardContent></Card>
        {recs.length > 1 && (
          <Card><CardContent className="p-4 space-y-2" data-testid="scan-records-list">
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">All records for today ({recs.length})</p>
            {recs.map((rec, i) => (
              <div key={rec.id || i} className="flex items-center gap-2 rounded-lg border px-3 py-2 text-sm">
                <span className="text-xs font-bold text-slate-400 w-6">#{rec.attempt || i + 1}</span>
                <Badge className={`${rec.status === 'completed' ? 'bg-emerald-600' : 'bg-amber-500'} text-[10px]`}>{rec.status === 'completed' ? 'Complete' : 'Incomplete'}</Badge>
                <span className="flex-1 truncate text-xs text-muted-foreground">{rec.performed_by} · {(rec.completed_at || '').slice(11, 16)}</span>
                {(rec.photos || []).length > 0 && <span className="text-[10px] text-muted-foreground">{rec.photos.length} photo{rec.photos.length === 1 ? '' : 's'}</span>}
              </div>
            ))}
          </CardContent></Card>
        )}
        <Card className="border-blue-200"><CardContent className="p-4 space-y-2 text-center" data-testid="scan-log-another-card">
          <p className="text-sm text-muted-foreground">Was the earlier maintenance not satisfactory, or is another round needed today?</p>
          <Button variant="outline" className="w-full border-[#002FA7] text-[#002FA7] hover:bg-blue-50" onClick={logAnother} data-testid="scan-log-another-btn">
            <RefreshCw className="h-4 w-4 mr-2" /> Log Another Maintenance Record
          </Button>
        </CardContent></Card>
      </Shell>
    );
  }

  const needsStaff = state.staff_verification_required && !state.admin_bypass;
  const assignedIds = state.assigned_staff_ids || [];

  if (needsStaff && !staff) {
    return <StaffScanLogin scanRef={{ token }} equipmentName={state.equipment_name} onLogin={staffLogin} />;
  }

  if (needsStaff && staff && assignedIds.length > 0 && !assignedIds.includes(staff.id)) {
    return (
      <Shell>
        {info}
        <Card className="border-red-300"><CardContent className="py-8 text-center space-y-2" data-testid="scan-not-assigned">
          <XCircle className="h-10 w-10 mx-auto text-red-500" />
          <p className="font-bold text-red-600">Only assigned maintenance staff can record maintenance for this equipment.</p>
          <p className="text-sm text-muted-foreground">You are signed in as <span className="font-semibold">{staff.name}</span>{staff.role ? ` (${staff.role})` : ''}.</p>
          {(state.assigned_staff || []).length > 0 && (
            <p className="text-sm text-muted-foreground">Assigned staff: <span className="font-semibold">{state.assigned_staff.map((s) => s.name).join(', ')}</span></p>
          )}
          <Button variant="outline" size="sm" onClick={staffLogout} className="mt-2" data-testid="scan-switch-user-btn">
            <UserCheck className="h-4 w-4 mr-2" /> Switch user
          </Button>
        </CardContent></Card>
        {instructions}
      </Shell>
    );
  }

  return (
    <Shell>
      {info}
      {staff && (
        <div className="flex items-center gap-2 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2" data-testid="scan-staff-chip">
          <UserCheck className="h-4 w-4 text-emerald-600 shrink-0" />
          <p className="text-sm flex-1 truncate">Recording as <span className="font-bold">{staff.name}</span>{staff.role ? <span className="text-xs text-muted-foreground"> · {staff.role}</span> : null}</p>
          <button onClick={staffLogout} className="text-xs font-semibold text-emerald-700 hover:underline shrink-0" data-testid="scan-staff-switch">Switch</button>
        </div>
      )}
      {!staff && (state.admin_bypass || state.supervisor_bypass) && (
        <div className="flex items-center gap-2 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2" data-testid="scan-actor-chip">
          <UserCheck className="h-4 w-4 text-emerald-600 shrink-0" />
          <p className="text-sm flex-1 truncate">Recording as <span className="font-bold">{state.actor_name}</span><span className="text-xs text-muted-foreground"> · {state.admin_bypass ? 'admin' : 'supervisor'}</span></p>
        </div>
      )}
      {state.geofence?.required && (
        <div className="flex items-center gap-2 rounded-lg border border-blue-200 bg-blue-50 px-3 py-2" data-testid="scan-geofence-chip">
          <MapPin className="h-4 w-4 text-[#002FA7] shrink-0" />
          <p className="text-xs text-blue-800">Geo-fenced check-in — you must be within <span className="font-bold">{state.geofence.radius} m</span> of <span className="font-bold">{state.geofence.facility_name}</span>. Your location is verified when you submit.</p>
        </div>
      )}
      {state.relog && (
        <div className="rounded-lg border-2 border-blue-300 bg-blue-50 px-4 py-3 flex items-start gap-2" data-testid="scan-relog-banner">
          <RefreshCw className="h-4 w-4 text-[#002FA7] mt-0.5 shrink-0" />
          <div className="text-sm">
            <p className="font-bold text-[#002FA7]">Logging an additional maintenance record</p>
            <p className="text-xs text-blue-700">{(state.records || []).length || 1} record{((state.records || []).length || 1) === 1 ? ' has' : 's have'} already been saved for today. They stay locked — this creates a new record.</p>
          </div>
        </div>
      )}
      {instructions}
      {state.photo_required && (
        <div className="rounded-lg border-2 border-red-300 bg-red-50 px-4 py-3 flex items-start gap-2" data-testid="scan-photo-required-banner">
          <Camera className="h-4 w-4 text-red-600 mt-0.5 shrink-0" />
          <div className="text-sm">
            <p className="font-bold text-red-700">Photo inspection required today</p>
            <p className="text-xs text-red-600">This date was randomly selected for photographic inspection. Capture at least one live camera photo before submitting.</p>
          </div>
        </div>
      )}
      <Card><CardContent className="p-4 space-y-4">
        <div>
          <p className="text-sm font-semibold mb-2">Maintenance status *</p>
          <div className="grid grid-cols-2 gap-2">
            <button onClick={() => setStatus('completed')} data-testid="scan-status-complete"
              className={`rounded-lg border-2 p-3 text-sm font-semibold flex flex-col items-center gap-1 ${status === 'completed' ? 'border-emerald-600 bg-emerald-50 text-emerald-700' : 'border-slate-200 text-slate-600'}`}>
              <CheckCircle2 className="h-5 w-5" /> Maintenance Complete
            </button>
            <button onClick={() => setStatus('incomplete')} data-testid="scan-status-incomplete"
              className={`rounded-lg border-2 p-3 text-sm font-semibold flex flex-col items-center gap-1 ${status === 'incomplete' ? 'border-amber-500 bg-amber-50 text-amber-700' : 'border-slate-200 text-slate-600'}`}>
              <XCircle className="h-5 w-5" /> Maintenance Incomplete
            </button>
          </div>
        </div>

        <div>
          <p className="text-sm font-semibold mb-1">Supporting photos {state.photo_required ? <span className="text-xs font-bold text-red-600">(mandatory today)</span> : null} <span className="text-xs font-normal text-muted-foreground">(live camera only — auto date/time stamped)</span></p>
          {camError && <p className="text-xs text-red-600 mb-2">{camError}</p>}
          {!camOn ? (
            <Button variant="outline" className="w-full" onClick={startCamera} data-testid="scan-open-camera-btn"><Camera className="h-4 w-4 mr-2" /> Open Camera</Button>
          ) : (
            <div className="fixed inset-0 z-50 bg-black flex flex-col" data-testid="scan-camera-overlay">
              <div className="flex items-center justify-between px-4 py-3 bg-black/80">
                <p className="text-white text-sm font-semibold truncate">{state.equipment_name} — live capture</p>
                <button onClick={stopCamera} className="text-white/90 p-1.5 rounded-full hover:bg-white/10" data-testid="scan-camera-close"><XCircle className="h-6 w-6" /></button>
              </div>
              <video ref={videoRef} playsInline muted className="flex-1 min-h-0 w-full object-contain bg-black" data-testid="scan-camera-video" />
              <div className="px-4 py-4 pb-6 bg-black/80 flex items-center justify-center gap-6">
                <span className="text-white/70 text-xs w-20">{photos.length} photo{photos.length === 1 ? '' : 's'} taken</span>
                <button onClick={capture} disabled={uploading} aria-label="Capture photo" data-testid="scan-capture-btn"
                  className="h-16 w-16 rounded-full bg-white border-4 border-slate-300 flex items-center justify-center active:scale-95 transition-transform disabled:opacity-60">
                  {uploading ? <RefreshCw className="h-6 w-6 animate-spin text-slate-700" /> : <Camera className="h-7 w-7 text-slate-800" />}
                </button>
                <button onClick={stopCamera} className="text-white text-sm font-semibold w-20 text-right" data-testid="scan-camera-done">Done</button>
              </div>
            </div>
          )}
          {photos.length > 0 && (
            <div className="grid grid-cols-3 gap-2 mt-2">
              {photos.map((p) => (
                <div key={p.id} className="relative group">
                  <button type="button" className="block w-full" onClick={() => setPhotoView(p.preview)} data-testid={`scan-photo-thumb-${p.id}`}>
                    <img src={p.preview} alt="capture" className="h-20 w-full object-cover rounded border" />
                    <span className="absolute inset-0 flex items-center justify-center bg-black/0 group-hover:bg-black/30 rounded transition-colors">
                      <Eye className="h-5 w-5 text-white opacity-0 group-hover:opacity-100" />
                    </span>
                  </button>
                  <button className="absolute top-0.5 right-0.5 bg-white/90 rounded p-0.5 text-red-600" onClick={() => setPhotos((x) => x.filter((y) => y.id !== p.id))}><Trash2 className="h-3 w-3" /></button>
                </div>
              ))}
            </div>
          )}
          {photoView && (
            <div className="fixed inset-0 z-[60] bg-black/95 flex items-center justify-center p-3" onClick={() => setPhotoView(null)} data-testid="scan-photo-lightbox">
              <img src={photoView} alt="captured preview" className="max-w-full max-h-full object-contain rounded-lg" />
              <button className="absolute top-4 right-4 text-white/90 p-1.5 rounded-full bg-black/50" onClick={() => setPhotoView(null)} data-testid="scan-lightbox-close"><XCircle className="h-7 w-7" /></button>
              <p className="absolute bottom-4 left-0 right-0 text-center text-white/70 text-xs">Tap anywhere to close</p>
            </div>
          )}
        </div>

        <div>
          <p className="text-sm font-semibold mb-1">Remarks (optional)</p>
          <Textarea rows={2} value={remarks} onChange={(e) => setRemarks(e.target.value)} data-testid="scan-remarks-input" />
        </div>

        <Button className="w-full" onClick={submit} disabled={submitting} data-testid="scan-submit-btn">
          {submitting ? 'Submitting…' : 'Submit Maintenance Record'}
        </Button>
        <p className="text-[11px] text-muted-foreground text-center">Once submitted, this record and its photos are locked and cannot be edited.</p>
      </CardContent></Card>
    </Shell>
  );
}
