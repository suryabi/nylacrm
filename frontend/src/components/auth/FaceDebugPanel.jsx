import React from 'react';

// Live liveness telemetry overlay — enable with ?facedebug=1 (or localStorage face_debug=1).
export default function FaceDebugPanel({ data }) {
  if (!data) return null;
  return (
    <div className="absolute top-2 left-2 z-40 bg-black/75 text-emerald-300 font-mono text-[10px] leading-4 rounded-lg px-2.5 py-2 pointer-events-none text-left" data-testid="face-debug-panel">
      <div>EAR {data.ear?.toFixed(3)} / base {data.baseEar?.toFixed(3)} ({Math.round((data.ratio || 1) * 100)}%)</div>
      <div>yawΔ {data.yawDiff?.toFixed(3)} · closed {String(!!data.closed)}</div>
      <div>frames {data.frames || 0} · fps {data.fps ? data.fps.toFixed(1) : '-'}</div>
      <div>last: {data.event || '—'}</div>
    </div>
  );
}
