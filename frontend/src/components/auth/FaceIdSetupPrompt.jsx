import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { ScanFace } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { FaceEnrollModal } from '../qc/FaceEnrollModal';
import { getDeviceToken } from '../../lib/faceRecognition';

const API_URL = process.env.REACT_APP_BACKEND_URL + '/api';

function authHeaders() {
  return {
    'Authorization': `Bearer ${localStorage.getItem('token')}`,
    'X-Tenant-ID': localStorage.getItem('selectedTenant') || localStorage.getItem('tenant_id'),
  };
}

// After-login prompt to set up Face ID (shown once per user), plus a manual
// opener via the global 'open-face-setup' event (sidebar "Face ID" button).
export default function FaceIdSetupPrompt() {
  const { user } = useAuth();
  const [showPrompt, setShowPrompt] = useState(false);
  const [showEnroll, setShowEnroll] = useState(false);

  useEffect(() => {
    const openSetup = () => setShowEnroll(true);
    window.addEventListener('open-face-setup', openSetup);
    return () => window.removeEventListener('open-face-setup', openSetup);
  }, []);

  useEffect(() => {
    if (!user || sessionStorage.getItem('faceid_prompt_checked')) return;
    sessionStorage.setItem('faceid_prompt_checked', '1');
    (async () => {
      try {
        const { data } = await axios.get(`${API_URL}/auth/face/status`, { headers: authHeaders(), withCredentials: true });
        if (data.enrolled) localStorage.setItem('face_enrolled_device', '1');
        if (!data.enrolled && !data.prompt_seen) setTimeout(() => setShowPrompt(true), 1200);
      } catch { /* silent */ }
    })();
  }, [user]);

  const skip = async () => {
    setShowPrompt(false);
    try { await axios.post(`${API_URL}/auth/face/dismiss-prompt`, {}, { headers: authHeaders(), withCredentials: true }); } catch { /* ok */ }
  };

  const saveEnrollment = async (descriptors) => {
    await axios.post(`${API_URL}/auth/face/enroll`,
      { descriptors, device_token: getDeviceToken() },
      { headers: authHeaders(), withCredentials: true });
    localStorage.setItem('face_enrolled_device', '1');
  };

  if (!user) return null;
  return (
    <>
      {showPrompt && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4" data-testid="faceid-setup-prompt">
          <div className="bg-white rounded-2xl w-full max-w-sm p-6 shadow-2xl text-center">
            <div className="inline-flex items-center justify-center w-14 h-14 rounded-2xl bg-slate-900 mb-4">
              <ScanFace className="text-white" size={26} />
            </div>
            <h2 className="text-lg font-bold text-slate-800 mb-1">Set up Face ID?</h2>
            <p className="text-sm text-slate-500 mb-5">Sign in faster next time — just look at the camera. Only a numeric signature is stored, never photos. Works on this device.</p>
            <div className="flex gap-2">
              <button onClick={skip}
                className="flex-1 px-4 py-2.5 rounded-xl border border-slate-200 text-slate-600 text-sm font-medium hover:bg-slate-50"
                data-testid="faceid-skip-btn">Skip</button>
              <button onClick={() => { setShowPrompt(false); setShowEnroll(true); }}
                className="flex-1 px-4 py-2.5 rounded-xl bg-slate-900 hover:bg-slate-800 text-white text-sm font-semibold"
                data-testid="faceid-setup-btn">Set up Face ID</button>
            </div>
            <p className="text-[11px] text-slate-400 mt-3">You can set this up anytime from the sidebar → Face ID</p>
          </div>
        </div>
      )}
      {showEnroll && (
        <FaceEnrollModal
          member={{ id: user.id, name: user.name || user.email }}
          title="Set up Face ID"
          onSave={saveEnrollment}
          onClose={() => setShowEnroll(false)}
          onDone={() => {}}
        />
      )}
    </>
  );
}
