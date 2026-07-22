import React, { useState, useEffect, useRef } from 'react';
import { toast } from 'sonner';
import axios from 'axios';
import { Loader2, Check, X, ScanFace } from 'lucide-react';
import { loadModels, getFullDetection, headPose, poseGap, isGoodFace } from '../../lib/faceRecognition';

const API_URL = process.env.REACT_APP_BACKEND_URL + '/api';
const TARGET = 7;          // angle samples to collect
const POSE_GAP_MIN = 0.055; // how different a new head angle must be

function getAuthHeaders() {
  const token = localStorage.getItem('token');
  const tenantId = localStorage.getItem('tenant_id');
  return { 'Authorization': `Bearer ${token}`, 'X-Tenant-ID': tenantId, 'Content-Type': 'application/json' };
}

// Face ID-style tick ring that fills clockwise as samples are captured.
const TickRing = ({ progress, done }) => {
  const ticks = 60;
  const filled = done ? ticks : Math.round(progress * ticks);
  return (
    <svg viewBox="0 0 200 200" className="absolute inset-0 w-full h-full pointer-events-none">
      {Array.from({ length: ticks }).map((_, i) => {
        const active = i < filled;
        const leading = !done && active && i === filled - 1;
        return (
          <line key={i} x1="100" y1={leading ? 3 : 4.5} x2="100" y2={leading ? 13 : 11.5}
            stroke={active ? '#10b981' : '#e2e8f0'}
            strokeWidth={leading ? 3 : 2} strokeLinecap="round"
            style={{
              transition: 'stroke 0.35s ease, stroke-width 0.2s ease',
              filter: active ? 'drop-shadow(0 0 1.5px rgba(16,185,129,0.55))' : 'none',
            }}
            transform={`rotate(${(360 / ticks) * i} 100 100)`} />
        );
      })}
    </svg>
  );
};

export const FaceEnrollModal = ({ member, onClose, onDone, onSave, title }) => {
  const videoRef = useRef(null);
  const streamRef = useRef(null);
  const timerRef = useRef(null);
  const samplesRef = useRef([]);   // [{descriptor, pose}]
  const stalledRef = useRef(0);
  const doneRef = useRef(false);
  const [ready, setReady] = useState(false);
  const [error, setError] = useState('');
  const [count, setCount] = useState(0);
  const [hint, setHint] = useState('Position your face in the circle');
  const [done, setDone] = useState(false);
  const [saving, setSaving] = useState(false);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let cancelled = false;

    const save = async () => {
      setSaving(true);
      try {
        const descriptors = samplesRef.current.map(s => s.descriptor);
        if (onSave) {
          await onSave(descriptors);
        } else {
          // Erase any previous enrollment first, then store the fresh one.
          await axios.delete(`${API_URL}/production/qc-team/${member.id}/face`, { headers: getAuthHeaders() });
          await axios.put(`${API_URL}/production/qc-team/${member.id}/face`,
            { descriptors }, { headers: getAuthHeaders() });
        }
        setDone(true);
        toast.success(`Face ID set up for ${member.name}`);
        setTimeout(() => { onDone?.(); onClose(); }, 1400);
      } catch (err) {
        doneRef.current = false;
        toast.error(err.response?.data?.detail || 'Failed to save — try again');
        setSaving(false);
        timerRef.current = setTimeout(tick, 400);
      }
    };

    const tick = async () => {
      if (cancelled || doneRef.current) return;
      try {
        const det = await getFullDetection(videoRef.current, true);
        if (!isGoodFace(det)) {
          setHint(det ? 'Move a little closer' : 'Position your face in the circle');
        } else {
          const pose = headPose(det.landmarks);
          const isNewAngle = samplesRef.current.every(s => poseGap(s.pose, pose) > POSE_GAP_MIN);
          stalledRef.current += 1;
          if (samplesRef.current.length === 0 || isNewAngle || stalledRef.current > 9) {
            samplesRef.current.push({ descriptor: Array.from(det.descriptor), pose });
            stalledRef.current = 0;
            setCount(samplesRef.current.length);
            setHint(samplesRef.current.length >= TARGET ? 'All angles captured' : 'Move your head slowly in a circle');
            if (samplesRef.current.length >= TARGET) { doneRef.current = true; save(); return; }
          } else {
            setHint('Keep turning your head slowly…');
          }
        }
      } catch { /* ignore frame errors */ }
      if (!cancelled && !doneRef.current) timerRef.current = setTimeout(tick, 380);
    };

    (async () => {
      setError('');
      try {
        await loadModels();
      } catch {
        if (!cancelled) setError('Face models failed to load — check your internet connection and retry');
        return;
      }
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'user', width: 480, height: 480 } });
        if (cancelled) { stream.getTracks().forEach(t => t.stop()); return; }
        streamRef.current = stream;
        if (videoRef.current) { videoRef.current.srcObject = stream; await videoRef.current.play(); }
        setReady(true);
        timerRef.current = setTimeout(tick, 600);
      } catch (e) {
        setError(
          e.name === 'NotAllowedError' ? 'Camera permission denied — allow camera access for this site in your browser settings'
          : e.name === 'NotFoundError' ? 'No camera found on this device'
          : e.name === 'NotReadableError' ? 'Camera is in use by another app — close it and retry'
          : `Could not start camera (${e.name || 'unknown error'})`
        );
      }
    })();

    return () => {
      cancelled = true;
      if (timerRef.current) clearTimeout(timerRef.current);
      if (streamRef.current) streamRef.current.getTracks().forEach(t => t.stop());
    };
  }, [member.id, attempt]); // eslint-disable-line react-hooks/exhaustive-deps

  const reset = () => {
    samplesRef.current = [];
    stalledRef.current = 0;
    setCount(0);
    setHint('Move your head slowly in a circle');
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4" data-testid="face-enroll-modal">
      <div className="bg-white rounded-2xl w-full max-w-md overflow-hidden shadow-2xl">
        <div className="px-5 py-4 border-b border-slate-100 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <ScanFace size={18} className="text-slate-700" />
            <p className="font-bold text-slate-800">{title || `Set up Face ID · ${member.name}`}</p>
          </div>
          <button onClick={onClose} className="p-2 rounded-lg hover:bg-slate-100" data-testid="face-enroll-close"><X size={16} /></button>
        </div>
        <div className="p-6">
          <div className="relative aspect-square max-w-[300px] mx-auto mb-5">
            <TickRing progress={count / TARGET} done={done} />
            <div className="absolute inset-[34px] rounded-full overflow-hidden bg-slate-900 ring-1 ring-slate-100 shadow-inner">
              <video ref={videoRef} muted playsInline className="w-full h-full object-cover -scale-x-100" />
              {!ready && !error && (
                <div className="absolute inset-0 flex flex-col items-center justify-center text-white gap-2">
                  <Loader2 className="w-6 h-6 animate-spin" /><span className="text-xs">Starting camera…</span>
                </div>
              )}
              {error && <div className="absolute inset-0 flex items-center justify-center text-red-300 text-xs px-6 text-center">{error}</div>}
              {done && (
                <div className="absolute inset-0 bg-emerald-500/85 flex items-center justify-center" data-testid="face-enroll-success">
                  <Check className="text-white animate-in zoom-in duration-300" size={64} strokeWidth={3} />
                </div>
              )}
            </div>
          </div>
          <p className="text-sm font-medium text-slate-700 text-center mb-1" data-testid="face-enroll-hint">
            {done ? `Face ID ready for ${member.name}` : saving ? 'Saving…' : hint}
          </p>
          <p className="text-xs text-slate-400 text-center mb-4">
            {done ? '' : `${count}/${TARGET} angles · Only a numeric signature is stored — no photos. Replaces any previous enrollment.`}
          </p>
          {error && (
            <button onClick={() => setAttempt(a => a + 1)}
              className="w-full px-4 py-2.5 rounded-xl bg-slate-900 hover:bg-slate-800 text-white text-sm font-semibold mb-2"
              data-testid="face-retry-btn">Try again</button>
          )}
          {!done && count > 0 && !saving && (
            <button onClick={reset} className="w-full px-4 py-2.5 rounded-xl border border-slate-200 text-slate-500 text-sm" data-testid="face-reset-btn">Start over</button>
          )}
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
