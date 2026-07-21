import React, { useState, useEffect, useRef, useCallback } from 'react';
import { toast } from 'sonner';
import axios from 'axios';
import { Loader2, Camera, Check, X, ScanFace } from 'lucide-react';
import { loadModels, getDescriptor } from '../../lib/faceRecognition';

const API_URL = process.env.REACT_APP_BACKEND_URL + '/api';
const SAMPLES_NEEDED = 3;

function getAuthHeaders() {
  const token = localStorage.getItem('token');
  const tenantId = localStorage.getItem('tenant_id');
  return { 'Authorization': `Bearer ${token}`, 'X-Tenant-ID': tenantId, 'Content-Type': 'application/json' };
}

export const FaceEnrollModal = ({ member, onClose, onDone }) => {
  const videoRef = useRef(null);
  const streamRef = useRef(null);
  const [ready, setReady] = useState(false);
  const [error, setError] = useState('');
  const [samples, setSamples] = useState([]);
  const [capturing, setCapturing] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        await loadModels();
        const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'user', width: 480, height: 480 } });
        if (cancelled) { stream.getTracks().forEach(t => t.stop()); return; }
        streamRef.current = stream;
        if (videoRef.current) { videoRef.current.srcObject = stream; await videoRef.current.play(); }
        setReady(true);
      } catch (e) {
        setError(e.name === 'NotAllowedError' ? 'Camera permission denied' : 'Could not start camera / load models');
      }
    })();
    return () => { cancelled = true; if (streamRef.current) streamRef.current.getTracks().forEach(t => t.stop()); };
  }, []);

  const capture = useCallback(async () => {
    if (!ready || capturing) return;
    setCapturing(true);
    try {
      const d = await getDescriptor(videoRef.current);
      if (!d) { toast.error('No face detected — look straight at the camera'); return; }
      setSamples(prev => [...prev, d]);
      toast.success(`Captured ${samples.length + 1}/${SAMPLES_NEEDED}`);
    } finally {
      setCapturing(false);
    }
  }, [ready, capturing, samples.length]);

  const save = async () => {
    if (samples.length === 0) return;
    setSaving(true);
    try {
      await axios.put(`${API_URL}/production/qc-team/${member.id}/face`, { descriptors: samples }, { headers: getAuthHeaders() });
      toast.success(`Face enrolled for ${member.name}`);
      onDone?.();
      onClose();
    } catch (err) {
      toast.error(err.response?.data?.detail || 'Failed to save face');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4" data-testid="face-enroll-modal">
      <div className="bg-white rounded-2xl w-full max-w-md overflow-hidden shadow-2xl">
        <div className="px-5 py-4 border-b border-slate-100 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <ScanFace size={18} className="text-slate-700" />
            <p className="font-bold text-slate-800">Enrol face · {member.name}</p>
          </div>
          <button onClick={onClose} className="p-2 rounded-lg hover:bg-slate-100" data-testid="face-enroll-close"><X size={16} /></button>
        </div>
        <div className="p-5">
          <div className="relative rounded-2xl overflow-hidden bg-slate-900 aspect-square mb-4">
            <video ref={videoRef} muted playsInline className="w-full h-full object-cover -scale-x-100" />
            {!ready && !error && (
              <div className="absolute inset-0 flex flex-col items-center justify-center text-white gap-2">
                <Loader2 className="w-6 h-6 animate-spin" /><span className="text-xs">Starting camera…</span>
              </div>
            )}
            {error && <div className="absolute inset-0 flex items-center justify-center text-red-300 text-sm px-6 text-center">{error}</div>}
            <div className="absolute top-3 left-1/2 -translate-x-1/2 flex gap-1.5">
              {Array.from({ length: SAMPLES_NEEDED }).map((_, i) => (
                <span key={i} className={`w-2.5 h-2.5 rounded-full ${i < samples.length ? 'bg-emerald-400' : 'bg-white/40'}`} />
              ))}
            </div>
          </div>
          <p className="text-xs text-slate-500 text-center mb-4">Capture {SAMPLES_NEEDED} shots from slightly different angles. Only a numeric signature is stored — no photos.</p>
          <div className="flex gap-2">
            {samples.length < SAMPLES_NEEDED ? (
              <button onClick={capture} disabled={!ready || capturing}
                className="flex-1 px-4 py-3 rounded-xl bg-slate-800 hover:bg-slate-700 text-white font-semibold flex items-center justify-center gap-2 disabled:opacity-50" data-testid="face-capture-btn">
                {capturing ? <Loader2 size={16} className="animate-spin" /> : <Camera size={16} />} Capture ({samples.length}/{SAMPLES_NEEDED})
              </button>
            ) : (
              <button onClick={save} disabled={saving}
                className="flex-1 px-4 py-3 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-semibold flex items-center justify-center gap-2 disabled:opacity-50" data-testid="face-save-btn">
                {saving ? <Loader2 size={16} className="animate-spin" /> : <Check size={16} />} Save enrolment
              </button>
            )}
            {samples.length > 0 && <button onClick={() => setSamples([])} className="px-4 py-3 rounded-xl border border-slate-200 text-slate-600 text-sm" data-testid="face-reset-btn">Reset</button>}
          </div>
        </div>
      </div>
    </div>
  );
};

export const PinModal = ({ member, onClose, onDone }) => {
  const [pin, setPin] = useState('');
  const [saving, setSaving] = useState(false);
  const save = async (clear) => {
    if (!clear && !(pin.length >= 4 && pin.length <= 8 && /^\d+$/.test(pin))) { toast.error('PIN must be 4-8 digits'); return; }
    setSaving(true);
    try {
      await axios.put(`${API_URL}/production/qc-team/${member.id}/pin`, { pin: clear ? '' : pin }, { headers: getAuthHeaders() });
      toast.success(clear ? 'PIN cleared' : 'PIN set');
      onDone?.();
      onClose();
    } catch (err) {
      toast.error(err.response?.data?.detail || 'Failed');
    } finally { setSaving(false); }
  };
  return (
    <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4" data-testid="pin-modal">
      <div className="bg-white rounded-2xl w-full max-w-xs p-5 shadow-2xl">
        <p className="font-bold text-slate-800 mb-1">Set PIN · {member.name}</p>
        <p className="text-xs text-slate-500 mb-4">Fallback login when the camera can't recognise them.</p>
        <input value={pin} onChange={e => setPin(e.target.value.replace(/\D/g, '').slice(0, 8))} inputMode="numeric"
          placeholder="4-8 digits" className="w-full border border-slate-200 rounded-xl px-3 py-3 text-center text-2xl tracking-widest mb-4" data-testid="pin-set-input" />
        <div className="flex gap-2">
          <button onClick={() => save(false)} disabled={saving} className="flex-1 px-4 py-2.5 rounded-xl bg-emerald-600 text-white font-semibold text-sm disabled:opacity-50" data-testid="pin-save-btn">Save PIN</button>
          {member.has_pin && <button onClick={() => save(true)} className="px-3 py-2.5 rounded-xl border border-red-200 text-red-500 text-sm" data-testid="pin-clear-btn">Clear</button>}
          <button onClick={onClose} className="px-3 py-2.5 rounded-xl border border-slate-200 text-slate-500 text-sm">Cancel</button>
        </div>
      </div>
    </div>
  );
};
