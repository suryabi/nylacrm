import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useParams } from 'react-router-dom';
import { Button } from '../components/ui/button';
import { Textarea } from '../components/ui/textarea';
import { Badge } from '../components/ui/badge';
import { Card, CardContent } from '../components/ui/card';
import { Wrench, CheckCircle2, XCircle, Camera, RefreshCw, Trash2, LogIn } from 'lucide-react';
import { toast } from 'sonner';

const API_URL = process.env.REACT_APP_BACKEND_URL;
const authHeaders = () => ({ Authorization: `Bearer ${localStorage.getItem('session_token')}`, 'Content-Type': 'application/json' });

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
  const videoRef = useRef(null);
  const streamRef = useRef(null);

  const load = useCallback(async () => {
    try {
      const res = await fetch(`${API_URL}/api/maintenance/scan/${token}`, { headers: authHeaders() });
      if (res.status === 401 || res.status === 403) { setState({ needLogin: true }); return; }
      const data = await res.json();
      if (!res.ok) { setState({ error: data.detail || 'Unknown QR code' }); return; }
      setState(data);
    } catch { setState({ error: 'Could not reach the server' }); }
  }, [token]);

  useEffect(() => { load(); }, [load]);

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
    canvas.getContext('2d').drawImage(video, 0, 0);
    canvas.toBlob(async (blob) => {
      if (!blob) return;
      setUploading(true);
      try {
        const fd = new FormData();
        fd.append('file', blob, 'capture.jpg');
        const res = await fetch(`${API_URL}/api/maintenance/scan/${token}/photo`, {
          method: 'POST', headers: { Authorization: `Bearer ${localStorage.getItem('session_token')}` }, body: fd,
        });
        if (!res.ok) throw new Error((await res.json()).detail || 'Upload failed');
        const meta = await res.json();
        setPhotos((p) => [...p, { ...meta, preview: canvas.toDataURL('image/jpeg', 0.5) }]);
        toast.success('Photo captured with timestamp');
      } catch (e) { toast.error(e.message); } finally { setUploading(false); }
    }, 'image/jpeg', 0.85);
  };

  const submit = async () => {
    if (!status) { toast.error('Select Maintenance Complete or Incomplete'); return; }
    setSubmitting(true);
    try {
      const res = await fetch(`${API_URL}/api/maintenance/scan/${token}/submit`, {
        method: 'POST', headers: authHeaders(),
        body: JSON.stringify({ status, remarks: remarks || null, photo_ids: photos.map((p) => p.id) }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.detail || 'Submit failed');
      stopCamera();
      setState((s) => ({ ...s, already_submitted: true, record: data }));
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
    return (
      <Shell>
        <Card><CardContent className="py-8 text-center space-y-3" data-testid="scan-need-login">
          <LogIn className="h-8 w-8 mx-auto text-slate-400" />
          <p className="font-medium">Please log in to record maintenance</p>
          <Button onClick={() => { window.location.href = `/login?redirect=/maintenance-scan/${token}`; }} data-testid="scan-login-btn">Go to Login</Button>
        </CardContent></Card>
      </Shell>
    );
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
    const r = state.record || {};
    return (
      <Shell>
        {info}
        <Card className="border-emerald-300"><CardContent className="py-6 text-center space-y-2" data-testid="scan-submitted">
          <CheckCircle2 className="h-10 w-10 mx-auto text-emerald-600" />
          <p className="font-bold text-lg">Maintenance record saved</p>
          <Badge className={r.status === 'completed' ? 'bg-emerald-600' : 'bg-amber-500'}>{r.status === 'completed' ? 'Maintenance Complete' : 'Maintenance Incomplete'}</Badge>
          <p className="text-sm text-muted-foreground">By {r.performed_by} · {(r.completed_at || '').slice(0, 16).replace('T', ' ')}</p>
          {(r.photos || []).length > 0 && <p className="text-xs text-muted-foreground">{r.photos.length} timestamped photo{r.photos.length === 1 ? '' : 's'} attached</p>}
          <p className="text-xs text-muted-foreground pt-2">This record is locked and cannot be edited. Corrections can be added from the equipment profile with a full audit trail.</p>
        </CardContent></Card>
      </Shell>
    );
  }

  return (
    <Shell>
      {info}
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
          <p className="text-sm font-semibold mb-1">Supporting photos <span className="text-xs font-normal text-muted-foreground">(live camera only — auto date/time stamped)</span></p>
          {camError && <p className="text-xs text-red-600 mb-2">{camError}</p>}
          {!camOn ? (
            <Button variant="outline" className="w-full" onClick={startCamera} data-testid="scan-open-camera-btn"><Camera className="h-4 w-4 mr-2" /> Open Camera</Button>
          ) : (
            <div className="space-y-2">
              <video ref={videoRef} playsInline muted className="w-full rounded-lg bg-black aspect-video" data-testid="scan-camera-video" />
              <div className="flex gap-2">
                <Button className="flex-1" onClick={capture} disabled={uploading} data-testid="scan-capture-btn"><Camera className="h-4 w-4 mr-2" />{uploading ? 'Saving…' : 'Capture Photo'}</Button>
                <Button variant="outline" onClick={stopCamera}>Close</Button>
              </div>
            </div>
          )}
          {photos.length > 0 && (
            <div className="grid grid-cols-3 gap-2 mt-2">
              {photos.map((p) => (
                <div key={p.id} className="relative">
                  <img src={p.preview} alt="capture" className="h-20 w-full object-cover rounded border" />
                  <button className="absolute top-0.5 right-0.5 bg-white/90 rounded p-0.5 text-red-600" onClick={() => setPhotos((x) => x.filter((y) => y.id !== p.id))}><Trash2 className="h-3 w-3" /></button>
                </div>
              ))}
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
