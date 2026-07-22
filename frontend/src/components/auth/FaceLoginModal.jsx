import React, { useState, useEffect, useRef } from 'react';
import axios from 'axios';
import { Loader2, X, ScanFace, Check } from 'lucide-react';
import {
  loadModels, getFullDetection, isGoodFace, captureFrontal, getDeviceToken,
  eyeOpenness, headPose, createLivenessDetector, faceDebugEnabled,
} from '../../lib/faceRecognition';
import FaceDebugPanel from './FaceDebugPanel';

const API_URL = process.env.REACT_APP_BACKEND_URL + '/api';

export default function FaceLoginModal({ tenantId, onSuccess, onClose }) {
  const videoRef = useRef(null);
  const streamRef = useRef(null);
  const timerRef = useRef(null);
  const phaseRef = useRef('align');
  const alignRef = useRef(0);
  const stoppedRef = useRef(false);
  const [ready, setReady] = useState(false);
  const [phase, setPhase] = useState('align'); // align | verifying | confirm | success
  const [pending, setPending] = useState(null); // server login response awaiting user tap
  const [error, setError] = useState('');
  const [debug, setDebug] = useState(null);
  const livenessRef = useRef(null);
  const confirmRef = useRef(null);
  const debugOn = faceDebugEnabled();
  const onSuccessRef = useRef(onSuccess);
  onSuccessRef.current = onSuccess;

  const setPhaseBoth = (p) => { phaseRef.current = p; setPhase(p); };

  useEffect(() => {
    let cancelled = false;

    const submit = async () => {
      const full = await captureFrontal(videoRef.current);
      if (!full) { setPhaseBoth('align'); alignRef.current = 0; return; }
      try {
        const { data } = await axios.post(`${API_URL}/auth/face/login`,
          { descriptor: Array.from(full.descriptor), device_token: getDeviceToken() },
          { withCredentials: true, headers: { 'X-Tenant-ID': tenantId } });
        setPending(data);
        livenessRef.current = createLivenessDetector();
        setPhaseBoth('confirm');
      } catch (err) {
        setError(err.response?.data?.detail || 'Face login failed — try again or use your password');
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
            if (alignRef.current >= 2) {
              setError('');
              setPhaseBoth('verifying');
              await submit();
            }
          } else {
            alignRef.current = 0;
          }
        } else if (phaseRef.current === 'confirm' && livenessRef.current) {
          const t0 = performance.now();
          const det = await getFullDetection(videoRef.current, false);
          if (det) {
            const ev = livenessRef.current.update({ ear: eyeOpenness(det.landmarks), yaw: headPose(det.landmarks).yaw });
            if (debugOn) setDebug({ ...livenessRef.current.state, fps: 1000 / Math.max(1, performance.now() - t0), event: ev || undefined });
            if (ev && confirmRef.current) { confirmRef.current(); return; }
          }
        }
      } catch { /* ignore frame errors */ }
      if (!cancelled && !stoppedRef.current) {
        timerRef.current = setTimeout(tick, phaseRef.current === 'confirm' ? 70 : 400);
      }
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
        setError(
          e.name === 'NotAllowedError' ? 'Camera permission denied — allow camera access for this site'
          : e.name === 'NotFoundError' ? 'No camera found on this device'
          : e.name === 'NotReadableError' ? 'Camera is in use by another app — close it and retry'
          : 'Could not start camera'
        );
      }
    })();

    return () => {
      cancelled = true;
      stoppedRef.current = true;
      if (timerRef.current) clearTimeout(timerRef.current);
      if (streamRef.current) streamRef.current.getTracks().forEach(t => t.stop());
    };
  }, [tenantId]); // eslint-disable-line react-hooks/exhaustive-deps

  const confirmLogin = () => {
    stoppedRef.current = true;
    setPhaseBoth('success');
    setTimeout(() => onSuccessRef.current(pending), 600);
  };
  confirmRef.current = confirmLogin;

  const notMe = async () => {
    const token = pending?.session_token;
    setPending(null);
    setError('');
    alignRef.current = 0;
    setPhaseBoth('align');
    // Best-effort: invalidate the session that was created for the wrong match.
    if (token) {
      try {
        await axios.post(`${API_URL}/auth/logout`, {}, {
          withCredentials: true,
          headers: { 'Authorization': `Bearer ${token}`, 'X-Tenant-ID': tenantId },
        });
      } catch { /* ignore */ }
    }
  };

  const pendingName = pending?.user?.name || pending?.user?.email || '';

  return (
    <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4" data-testid="face-login-modal">
      <div className="bg-white rounded-2xl w-full max-w-sm overflow-hidden shadow-2xl">
        <div className="px-5 py-4 border-b border-slate-100 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <ScanFace size={18} className="text-slate-700" />
            <p className="font-bold text-slate-800">Sign in with Face ID</p>
          </div>
          <button onClick={onClose} className="p-2 rounded-lg hover:bg-slate-100" data-testid="face-login-close"><X size={16} /></button>
        </div>
        <div className="p-6">
          <div className="relative aspect-square max-w-[260px] mx-auto mb-4">
            <div className={`absolute inset-0 rounded-full border-2 transition-colors duration-300 ${phase === 'confirm' ? 'border-sky-400' : phase === 'success' ? 'border-emerald-500' : 'border-slate-200'}`} />
            <div className="absolute inset-3 rounded-full overflow-hidden bg-slate-900">
              <video ref={videoRef} muted playsInline className="w-full h-full object-cover -scale-x-100" />
              {debugOn && <FaceDebugPanel data={debug} />}
              {!ready && !error && (
                <div className="absolute inset-0 flex flex-col items-center justify-center text-white gap-2">
                  <Loader2 className="w-6 h-6 animate-spin" /><span className="text-xs">Starting camera…</span>
                </div>
              )}
              {phase === 'success' && (
                <div className="absolute inset-0 bg-emerald-500/85 flex items-center justify-center">
                  <Check className="text-white animate-in zoom-in duration-300" size={56} strokeWidth={3} />
                </div>
              )}
            </div>
          </div>

          {phase === 'confirm' && pending ? (
            <div className="text-center animate-in fade-in zoom-in-95 duration-200" data-testid="face-login-confirm">
              <p className="text-sm text-slate-500 mb-3">Recognized as</p>
              <p className="text-lg font-bold text-slate-800 -mt-2 mb-4">{pendingName}</p>
              <button onClick={confirmLogin}
                className="w-full px-4 py-3 rounded-xl bg-slate-900 hover:bg-slate-800 text-white font-semibold mb-2"
                data-testid="face-login-confirm-btn">Sign in as {pendingName}</button>
              <button onClick={notMe}
                className="w-full px-4 py-2.5 rounded-xl border border-slate-200 text-slate-500 text-sm hover:bg-slate-50"
                data-testid="face-login-notme-btn">Not me</button>
              <p className="text-[11px] text-slate-400 mt-2">Tip: a blink or slight head turn also confirms</p>
            </div>
          ) : (
            <p className="text-sm font-medium text-slate-700 text-center flex items-center justify-center gap-1.5" data-testid="face-login-status">
              {phase === 'verifying' && <Loader2 size={14} className="animate-spin" />}
              {{ align: 'Position your face in the circle', verifying: 'Verifying…', success: 'Welcome back!' }[phase]}
            </p>
          )}
          {error && <p className="text-xs text-red-500 text-center mt-2" data-testid="face-login-error">{error}</p>}
        </div>
      </div>
    </div>
  );
}
