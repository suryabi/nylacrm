import React, { useState, useEffect, useRef } from 'react';
import axios from 'axios';
import { toast } from 'sonner';
import { Loader2, ScanFace, Users, KeyRound, ArrowLeft, ShieldCheck, Check } from 'lucide-react';
import {
  loadModels, getFullDetection, isGoodFace, captureFrontal,
  eyeOpenness, headPose, createLivenessDetector,
} from '../lib/faceRecognition';

const API_URL = process.env.REACT_APP_BACKEND_URL + '/api';

// Public Face/PIN sign-in for Factory Staff from a scanned maintenance QR.
// Face matching happens on the server; no app login is required.
export default function StaffScanLogin({ scanRef, equipmentName, onLogin }) {
  const videoRef = useRef(null);
  const streamRef = useRef(null);
  const timerRef = useRef(null);
  const phaseRef = useRef('align');
  const alignRef = useRef(0);
  const stoppedRef = useRef(false);
  const livenessRef = useRef(null);
  const confirmRef = useRef(null);
  const [ready, setReady] = useState(false);
  const [phase, setPhase] = useState('align'); // align | verifying | confirm | success
  const [pending, setPending] = useState(null);
  const [error, setError] = useState('');
  const [mode, setMode] = useState('face'); // face | pick | pin
  const [roster, setRoster] = useState({ members: [], face_available: true });
  const [picked, setPicked] = useState(null);
  const [pin, setPin] = useState('');
  const [verifying, setVerifying] = useState(false);

  const setPhaseBoth = (p) => { phaseRef.current = p; setPhase(p); };
  const stopCam = () => { stoppedRef.current = true; if (timerRef.current) clearTimeout(timerRef.current); if (streamRef.current) streamRef.current.getTracks().forEach(t => t.stop()); };
  const finish = (data) => { stopCam(); toast.success(`Welcome, ${data.member.name}`); onLogin(data.member, data.staff_token); };

  useEffect(() => {
    axios.get(`${API_URL}/maintenance/staff-auth/roster`, { params: scanRef })
      .then(({ data }) => { setRoster(data); if (!data.face_available) setMode('pick'); })
      .catch(() => {});
  }, [scanRef]);

  useEffect(() => {
    if (mode !== 'face') { stopCam(); return undefined; }
    let cancelled = false;
    stoppedRef.current = false;

    const submit = async () => {
      const full = await captureFrontal(videoRef.current);
      if (!full) { setPhaseBoth('align'); alignRef.current = 0; return; }
      try {
        const { data } = await axios.post(`${API_URL}/maintenance/staff-auth/login`, { ...scanRef, descriptor: Array.from(full.descriptor) });
        setPending(data);
        livenessRef.current = createLivenessDetector();
        setPhaseBoth('confirm');
      } catch (err) {
        setError(err.response?.data?.detail || 'Face sign-in failed — try again or use your PIN');
        setPhaseBoth('align');
        alignRef.current = 0;
      }
    };

    const tick = async () => {
      if (cancelled || stoppedRef.current || !videoRef.current) return;
      try {
        if (phaseRef.current === 'align') {
          const det = await getFullDetection(videoRef.current, false);
          if (isGoodFace(det)) {
            alignRef.current += 1;
            if (alignRef.current >= 2) { setError(''); setPhaseBoth('verifying'); await submit(); }
          } else alignRef.current = 0;
        } else if (phaseRef.current === 'confirm' && livenessRef.current) {
          const det = await getFullDetection(videoRef.current, false);
          if (det) {
            const ev = livenessRef.current.update({ ear: eyeOpenness(det.landmarks), yaw: headPose(det.landmarks).yaw });
            if (ev && confirmRef.current) { confirmRef.current(); return; }
          }
        }
      } catch { /* ignore frame errors */ }
      if (!cancelled && !stoppedRef.current) timerRef.current = setTimeout(tick, phaseRef.current === 'confirm' ? 70 : 400);
    };

    (async () => {
      try {
        await loadModels();
        const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'user', width: 480, height: 480 } });
        if (cancelled) { stream.getTracks().forEach(t => t.stop()); return; }
        streamRef.current = stream;
        if (videoRef.current) { videoRef.current.srcObject = stream; await videoRef.current.play(); }
        setReady(true);
        timerRef.current = setTimeout(tick, 400);
      } catch (e) {
        setError(e.name === 'NotAllowedError' ? 'Camera permission denied — use PIN below'
          : (e.name === 'NotFoundError' || e.name === 'NotReadableError') ? 'Camera unavailable — use PIN below'
          : 'Could not start face scan — use PIN below');
      }
    })();
    return () => { cancelled = true; stopCam(); };
  }, [mode, scanRef]); // eslint-disable-line react-hooks/exhaustive-deps

  const confirmLogin = () => { setPhaseBoth('success'); setTimeout(() => finish(pending), 600); };
  confirmRef.current = confirmLogin;
  const notMe = async () => {
    const t = pending?.staff_token; setPending(null); setError(''); alignRef.current = 0; setPhaseBoth('align');
    if (t) axios.post(`${API_URL}/maintenance/staff-auth/logout`, {}, { headers: { 'X-Staff-Token': t } }).catch(() => {});
  };

  const verifyPin = async () => {
    setVerifying(true);
    try {
      const { data } = await axios.post(`${API_URL}/maintenance/staff-auth/login`, { ...scanRef, member_id: picked.id, pin });
      finish(data);
    } catch (err) { toast.error(err.response?.data?.detail || 'Incorrect PIN'); } finally { setVerifying(false); }
  };

  const initials = (n) => (n || '?').split(' ').map(s => s[0]).slice(0, 2).join('').toUpperCase();
  const name = pending?.member?.name || '';

  return (
    <div className="min-h-screen bg-slate-100 flex items-start justify-center p-4 pt-8" data-testid="staff-scan-login">
      <div className="w-full max-w-md">
        <div className="text-center mb-5">
          <div className="inline-flex items-center justify-center w-14 h-14 rounded-2xl bg-slate-900 mb-3"><ShieldCheck className="text-white" size={26} /></div>
          <h1 className="text-xl font-bold text-slate-800">Factory Staff Sign-in</h1>
          {equipmentName && <p className="text-sm text-slate-600 font-medium mt-1" data-testid="staff-login-equipment">{equipmentName}</p>}
          <p className="text-slate-500 text-xs mt-1">Verify with Face ID or PIN to record maintenance</p>
        </div>

        {mode === 'face' && (
          <>
            <div className="relative rounded-3xl overflow-hidden bg-slate-900 aspect-square mb-4 shadow-lg">
              <video ref={videoRef} muted playsInline className="w-full h-full object-cover -scale-x-100" />
              {ready && phase !== 'confirm' && phase !== 'success' && (
                <div className="absolute bottom-4 left-1/2 -translate-x-1/2 flex items-center gap-2 bg-black/50 px-3 py-1.5 rounded-full text-white text-xs" data-testid="staff-face-status">
                  {phase === 'verifying' ? <Loader2 size={12} className="animate-spin" /> : <span className="relative flex h-2 w-2"><span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" /><span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500" /></span>}
                  {phase === 'verifying' ? 'Verifying…' : 'Position your face in the frame'}
                </div>
              )}
              {phase === 'confirm' && pending && (
                <div className="absolute inset-0 bg-slate-900/75 backdrop-blur-sm flex flex-col items-center justify-center gap-3 p-6" data-testid="staff-face-confirm">
                  <div className="w-16 h-16 rounded-full bg-gradient-to-br from-sky-500 to-sky-700 text-white flex items-center justify-center font-bold text-xl">{initials(name)}</div>
                  <p className="text-white text-lg font-bold">Welcome, {name}</p>
                  <button onClick={confirmLogin} className="w-full max-w-[260px] px-4 py-3 rounded-xl bg-emerald-500 hover:bg-emerald-600 text-white font-bold active:scale-95 transition-transform" data-testid="staff-face-confirm-btn">Yes, it's me</button>
                  <button onClick={notMe} className="text-white/70 text-sm underline underline-offset-2" data-testid="staff-face-notme-btn">Not me</button>
                  <p className="text-white/50 text-[11px] -mt-1">A blink or slight head turn also confirms</p>
                </div>
              )}
              {phase === 'success' && (
                <div className="absolute inset-0 bg-emerald-500/85 flex items-center justify-center"><Check className="text-white" size={64} strokeWidth={3} /></div>
              )}
              {!ready && !error && (
                <div className="absolute inset-0 flex flex-col items-center justify-center text-white gap-2"><Loader2 className="w-6 h-6 animate-spin" /><span className="text-xs">Starting camera…</span></div>
              )}
              {error && <div className="absolute inset-x-0 bottom-0 bg-black/60 text-amber-300 text-xs px-4 py-2 text-center" data-testid="staff-face-error">{error}</div>}
            </div>
            <button onClick={() => setMode('pick')} className="w-full px-4 py-3 rounded-xl border border-slate-200 bg-white text-slate-600 font-medium flex items-center justify-center gap-2 hover:bg-slate-50" data-testid="staff-use-pin-btn">
              <KeyRound size={16} /> Use PIN instead
            </button>
          </>
        )}

        {mode === 'pick' && (
          <div className="bg-white border border-slate-200 rounded-2xl p-4" data-testid="staff-pick">
            <div className="flex items-center justify-between mb-3">
              {roster.face_available ? (
                <button onClick={() => setMode('face')} className="text-sm text-slate-500 flex items-center gap-1 hover:text-slate-800" data-testid="staff-back-to-face"><ArrowLeft size={14} /> Face scan</button>
              ) : <span />}
              <p className="text-sm font-semibold text-slate-700 flex items-center gap-1"><Users size={14} /> Who are you?</p>
            </div>
            <div className="grid grid-cols-2 gap-2 max-h-[55vh] overflow-y-auto">
              {roster.members.map(m => (
                <button key={m.id} onClick={() => { if (!m.has_pin) { toast.error('No PIN set — ask your supervisor to set one'); return; } setPicked(m); setPin(''); setMode('pin'); }}
                  className={`p-3 rounded-xl border text-left active:scale-95 transition-all ${m.has_pin ? 'border-slate-200 hover:border-slate-800' : 'border-slate-100 opacity-60'}`} data-testid={`staff-pick-${m.id}`}>
                  <div className="w-9 h-9 rounded-full bg-gradient-to-br from-slate-700 to-slate-900 text-white flex items-center justify-center font-bold text-xs mb-1.5">{initials(m.name)}</div>
                  <p className="text-sm font-medium text-slate-800 truncate">{m.name}</p>
                  <p className="text-[11px] text-slate-400 flex items-center gap-1">{m.has_pin && <KeyRound size={9} />}{m.role || 'Staff'}</p>
                </button>
              ))}
            </div>
            {roster.members.length === 0 && <p className="text-sm text-slate-400 text-center py-6">No factory staff assigned to this equipment</p>}
          </div>
        )}

        {mode === 'pin' && picked && (
          <div className="bg-white border border-slate-200 rounded-2xl p-5" data-testid="staff-pin-entry">
            <button onClick={() => setMode('pick')} className="text-sm text-slate-500 flex items-center gap-1 hover:text-slate-800 mb-3"><ArrowLeft size={14} /> Back</button>
            <p className="font-bold text-slate-800 text-center">{picked.name}</p>
            <p className="text-xs text-slate-500 text-center mb-4">Enter your PIN</p>
            <input value={pin} onChange={e => setPin(e.target.value.replace(/\D/g, '').slice(0, 8))} inputMode="numeric" autoFocus
              className="w-full border border-slate-200 rounded-xl px-3 py-3 text-center text-3xl tracking-[0.4em] mb-4" data-testid="staff-pin-input" />
            <button onClick={verifyPin} disabled={verifying || pin.length < 4}
              className="w-full px-4 py-3 rounded-xl bg-slate-900 hover:bg-slate-800 text-white font-semibold flex items-center justify-center gap-2 disabled:opacity-50" data-testid="staff-pin-submit">
              {verifying ? <Loader2 size={16} className="animate-spin" /> : <ScanFace size={16} />} Sign in
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
