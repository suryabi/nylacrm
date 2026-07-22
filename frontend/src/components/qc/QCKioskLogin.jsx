import React, { useState, useEffect, useRef, useCallback } from 'react';
import { toast } from 'sonner';
import axios from 'axios';
import { Loader2, ScanFace, Users, KeyRound, ArrowLeft, ShieldCheck, Check } from 'lucide-react';
import {
  loadModels, getDescriptor, getFullDetection, matchDescriptor, CONFIRM_FRAMES,
  eyeOpenness, headPose, createLivenessDetector, faceDebugEnabled,
} from '../../lib/faceRecognition';
import FaceDebugPanel from '../auth/FaceDebugPanel';

const API_URL = process.env.REACT_APP_BACKEND_URL + '/api';
const CONFIRM_TIMEOUT = 20000; // return to scanning if nobody taps

function getAuthHeaders() {
  const token = localStorage.getItem('token');
  const tenantId = localStorage.getItem('tenant_id');
  return { 'Authorization': `Bearer ${token}`, 'X-Tenant-ID': tenantId, 'Content-Type': 'application/json' };
}

export default function QCKioskLogin({ onLogin }) {
  const videoRef = useRef(null);
  const streamRef = useRef(null);
  const timerRef = useRef(null);
  const confirmTimerRef = useRef(null);
  const indexRef = useRef([]);
  const streakRef = useRef({ id: null, count: 0 });
  const phaseRef = useRef('scan');       // scan | confirm | success
  const candidateRef = useRef(null);
  const stoppedRef = useRef(false);
  const [ready, setReady] = useState(false);
  const [error, setError] = useState('');
  const [phase, setPhase] = useState('scan');
  const [candidate, setCandidate] = useState(null);
  const [members, setMembers] = useState([]);
  const [mode, setMode] = useState('face');       // face | pick | pin
  const [picked, setPicked] = useState(null);
  const [pin, setPin] = useState('');
  const [verifying, setVerifying] = useState(false);
  const [debug, setDebug] = useState(null);
  const livenessRef = useRef(null);
  const confirmActionRef = useRef(null);
  const debugOn = faceDebugEnabled();
  const onLoginRef = useRef(onLogin);
  onLoginRef.current = onLogin;

  const doLogin = useCallback((member) => {
    stoppedRef.current = true;
    if (timerRef.current) clearTimeout(timerRef.current);
    if (confirmTimerRef.current) clearTimeout(confirmTimerRef.current);
    if (streamRef.current) streamRef.current.getTracks().forEach(t => t.stop());
    const op = { id: member.id, name: member.name, role: member.role || '' };
    toast.success(`Welcome, ${member.name}`);
    onLoginRef.current(op);
  }, []);

  const setPhaseBoth = (p) => { phaseRef.current = p; setPhase(p); };

  const backToScan = useCallback(() => {
    if (confirmTimerRef.current) clearTimeout(confirmTimerRef.current);
    streakRef.current = { id: null, count: 0 };
    candidateRef.current = null;
    setCandidate(null);
    setPhaseBoth('scan');
  }, []);

  useEffect(() => {
    let cancelled = false;

    const tick = async () => {
      if (cancelled || stoppedRef.current || !videoRef.current) return;
      try {
        if (phaseRef.current === 'scan') {
          const d = await getDescriptor(videoRef.current);
          if (d && indexRef.current.length) {
            const { member } = matchDescriptor(d, indexRef.current);
            if (member) {
              const s = streakRef.current;
              streakRef.current = { id: member.id, count: s.id === member.id ? s.count + 1 : 1 };
              if (streakRef.current.count >= CONFIRM_FRAMES) {
                candidateRef.current = member;
                setCandidate(member);
                livenessRef.current = createLivenessDetector();
                setPhaseBoth('confirm');
                confirmTimerRef.current = setTimeout(() => {
                  if (phaseRef.current === 'confirm') backToScan();
                }, CONFIRM_TIMEOUT);
              }
            } else {
              streakRef.current = { id: null, count: 0 };
            }
          }
        } else if (phaseRef.current === 'confirm' && livenessRef.current) {
          const t0 = performance.now();
          const det = await getFullDetection(videoRef.current, false);
          if (det) {
            const ev = livenessRef.current.update({ ear: eyeOpenness(det.landmarks), yaw: headPose(det.landmarks).yaw });
            if (debugOn) setDebug({ ...livenessRef.current.state, fps: 1000 / Math.max(1, performance.now() - t0), event: ev || undefined });
            if (ev && confirmActionRef.current) { confirmActionRef.current(); return; }
          }
        }
      } catch { /* ignore frame errors */ }
      if (!cancelled && !stoppedRef.current) {
        timerRef.current = setTimeout(tick, phaseRef.current === 'confirm' ? 70 : 600);
      }
    };

    (async () => {
      try {
        const [idx, mem] = await Promise.all([
          axios.get(`${API_URL}/production/qc-team/face-index`, { headers: getAuthHeaders() }),
          axios.get(`${API_URL}/production/qc-team`, { headers: getAuthHeaders() }),
        ]);
        indexRef.current = idx.data || [];
        setMembers(mem.data || []);
        try {
          await loadModels();
        } catch {
          if (!cancelled) { setError('Face models failed to load — use manual login below'); setReady(false); }
          return;
        }
        const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'user', width: 480, height: 480 } });
        if (cancelled) { stream.getTracks().forEach(t => t.stop()); return; }
        streamRef.current = stream;
        if (videoRef.current) { videoRef.current.srcObject = stream; await videoRef.current.play(); }
        setReady(true);
        timerRef.current = setTimeout(tick, 600);
      } catch (e) {
        setError(
          e.name === 'NotAllowedError' ? 'Camera permission denied — use manual login below'
          : (e.name === 'NotFoundError' || e.name === 'NotReadableError') ? 'No camera found — use manual login below'
          : 'Camera unavailable — use manual login below'
        );
        setReady(false);
      }
    })();

    return () => {
      cancelled = true;
      if (timerRef.current) clearTimeout(timerRef.current);
      if (confirmTimerRef.current) clearTimeout(confirmTimerRef.current);
      if (streamRef.current) streamRef.current.getTracks().forEach(t => t.stop());
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const confirmIdentity = () => {
    setPhaseBoth('success');
    setTimeout(() => doLogin(candidateRef.current), 700);
  };
  confirmActionRef.current = confirmIdentity;

  const pickMember = (m) => {
    if (m.has_pin) { setPicked(m); setPin(''); setMode('pin'); }
    else doLogin(m);
  };

  const verifyPin = async () => {
    setVerifying(true);
    try {
      const { data } = await axios.post(`${API_URL}/production/qc-team/verify-pin`,
        { member_id: picked.id, pin }, { headers: getAuthHeaders() });
      doLogin(data);
    } catch (err) {
      toast.error(err.response?.data?.detail || 'Incorrect PIN');
    } finally { setVerifying(false); }
  };

  return (
    <div className="min-h-[80vh] flex items-center justify-center p-4" data-testid="qc-kiosk-login">
      <div className="w-full max-w-md">
        <div className="text-center mb-6">
          <div className="inline-flex items-center justify-center w-14 h-14 rounded-2xl bg-slate-900 mb-3">
            <ShieldCheck className="text-white" size={26} />
          </div>
          <h1 className="text-2xl font-bold text-slate-800">QC Station Login</h1>
          <p className="text-slate-500 text-sm mt-1">Look at the camera to sign in</p>
        </div>

        {mode === 'face' && (
          <>
            <div className="relative rounded-3xl overflow-hidden bg-slate-900 aspect-square mb-4 shadow-lg">
              <video ref={videoRef} muted playsInline className="w-full h-full object-cover -scale-x-100" />
              {debugOn && <FaceDebugPanel data={debug} />}
              {ready && phase === 'scan' && (
                <>
                  <div className="absolute inset-6 border-2 border-white/40 rounded-3xl" />
                  <div className="absolute bottom-4 left-1/2 -translate-x-1/2 flex items-center gap-2 bg-black/50 px-3 py-1.5 rounded-full text-white text-xs">
                    <span className="relative flex h-2 w-2"><span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" /><span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500" /></span>
                    Scanning…
                  </div>
                </>
              )}
              {ready && phase === 'confirm' && candidate && (
                <div className="absolute inset-0 bg-slate-900/70 backdrop-blur-sm flex flex-col items-center justify-center gap-4 p-6 animate-in fade-in duration-200" data-testid="qc-confirm-overlay">
                  <div className="w-16 h-16 rounded-full bg-gradient-to-br from-sky-500 to-sky-700 text-white flex items-center justify-center font-bold text-xl">
                    {(candidate.name || '?').split(' ').map(s => s[0]).slice(0, 2).join('').toUpperCase()}
                  </div>
                  <p className="text-white text-xl font-bold">Welcome, {candidate.name}</p>
                  <button onClick={confirmIdentity}
                    className="w-full max-w-[260px] px-4 py-3.5 rounded-xl bg-emerald-500 hover:bg-emerald-600 text-white font-bold text-base active:scale-95 transition-transform"
                    data-testid="qc-confirm-yes-btn">Yes, it's me — start</button>
                  <button onClick={backToScan} className="text-white/70 text-sm underline underline-offset-2" data-testid="qc-not-me-btn">Not me</button>
                  <p className="text-white/50 text-[11px] -mt-1">A blink or slight head turn also confirms</p>
                </div>
              )}
              {phase === 'success' && candidate && (
                <div className="absolute inset-0 bg-emerald-500/85 flex flex-col items-center justify-center gap-2" data-testid="qc-face-success">
                  <Check className="text-white animate-in zoom-in duration-300" size={64} strokeWidth={3} />
                  <p className="text-white font-bold">Welcome, {candidate.name}</p>
                </div>
              )}
              {!ready && !error && (
                <div className="absolute inset-0 flex flex-col items-center justify-center text-white gap-2">
                  <Loader2 className="w-6 h-6 animate-spin" /><span className="text-xs">Starting camera…</span>
                </div>
              )}
              {error && <div className="absolute inset-0 flex items-center justify-center text-amber-300 text-sm px-6 text-center">{error}</div>}
            </div>
            <button onClick={() => setMode('pick')} className="w-full px-4 py-3 rounded-xl border border-slate-200 text-slate-600 font-medium flex items-center justify-center gap-2 hover:bg-slate-50" data-testid="qc-manual-login-btn">
              <Users size={16} /> Not recognised? Pick your name
            </button>
          </>
        )}

        {mode === 'pick' && (
          <div className="bg-white border border-slate-200 rounded-2xl p-4" data-testid="qc-manual-pick">
            <div className="flex items-center justify-between mb-3">
              <button onClick={() => setMode('face')} className="text-sm text-slate-500 flex items-center gap-1 hover:text-slate-800"><ArrowLeft size={14} /> Face scan</button>
              <p className="text-sm font-semibold text-slate-700">Who are you?</p>
            </div>
            <div className="grid grid-cols-2 gap-2 max-h-[50vh] overflow-y-auto">
              {members.map(m => (
                <button key={m.id} onClick={() => pickMember(m)}
                  className="p-3 rounded-xl border border-slate-200 hover:border-slate-800 text-left active:scale-95 transition-all" data-testid={`qc-pick-${m.id}`}>
                  <div className="w-9 h-9 rounded-full bg-gradient-to-br from-slate-700 to-slate-900 text-white flex items-center justify-center font-bold text-xs mb-1.5">
                    {(m.name || '?').split(' ').map(s => s[0]).slice(0, 2).join('').toUpperCase()}
                  </div>
                  <p className="text-sm font-medium text-slate-800 truncate">{m.name}</p>
                  <p className="text-[11px] text-slate-400 flex items-center gap-1">{m.has_pin && <KeyRound size={9} />}{m.role || 'QC'}</p>
                </button>
              ))}
            </div>
            {members.length === 0 && <p className="text-sm text-slate-400 text-center py-6">No QC team members yet</p>}
          </div>
        )}

        {mode === 'pin' && picked && (
          <div className="bg-white border border-slate-200 rounded-2xl p-5" data-testid="qc-pin-entry">
            <button onClick={() => setMode('pick')} className="text-sm text-slate-500 flex items-center gap-1 hover:text-slate-800 mb-3"><ArrowLeft size={14} /> Back</button>
            <p className="font-bold text-slate-800 text-center">{picked.name}</p>
            <p className="text-xs text-slate-500 text-center mb-4">Enter your PIN</p>
            <input value={pin} onChange={e => setPin(e.target.value.replace(/\D/g, '').slice(0, 8))} inputMode="numeric" autoFocus
              className="w-full border border-slate-200 rounded-xl px-3 py-3 text-center text-3xl tracking-[0.4em] mb-4" data-testid="qc-pin-input" />
            <button onClick={verifyPin} disabled={verifying || pin.length < 4}
              className="w-full px-4 py-3 rounded-xl bg-slate-900 hover:bg-slate-800 text-white font-semibold flex items-center justify-center gap-2 disabled:opacity-50" data-testid="qc-pin-submit">
              {verifying ? <Loader2 size={16} className="animate-spin" /> : <ScanFace size={16} />} Sign in
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
