// On-device face recognition helper (models served from /face-models).
// No images ever leave the browser — only 128-float descriptors are used.
import * as faceapi from '@vladmandic/face-api';

const MODEL_URL = '/face-models';
// Euclidean-distance threshold for a confident match (lower = stricter).
export const MATCH_THRESHOLD = 0.45;
// Consecutive matching frames required before a face login is accepted.
export const CONFIRM_FRAMES = 3;
// Eye-aspect-ratio thresholds for blink (liveness) detection.
export const EAR_CLOSED = 0.21;
export const EAR_OPEN = 0.27;

let loadPromise = null;

async function initBackend() {
  const tf = faceapi.tf;
  const ok = await tf.setBackend('webgl').catch(() => false);
  if (!ok) await tf.setBackend('cpu');
  await tf.ready();
}

export function loadModels() {
  if (!loadPromise) {
    loadPromise = (async () => {
      await initBackend();
      await Promise.all([
        faceapi.nets.tinyFaceDetector.loadFromUri(MODEL_URL),
        faceapi.nets.faceLandmark68Net.loadFromUri(MODEL_URL),
        faceapi.nets.faceRecognitionNet.loadFromUri(MODEL_URL),
      ]);
    })().catch((e) => { loadPromise = null; throw e; });
  }
  return loadPromise;
}

const detectorOpts = new faceapi.TinyFaceDetectorOptions({ inputSize: 320, scoreThreshold: 0.5 });

// Full detection with landmarks (and optionally the 128-float descriptor).
export async function getFullDetection(input, withDescriptor = true) {
  const q = faceapi.detectSingleFace(input, detectorOpts).withFaceLandmarks();
  const res = withDescriptor ? await q.withFaceDescriptor() : await q;
  return res || null;
}

// Return a single 128-length descriptor (Array) for the largest face, or null.
export async function getDescriptor(videoOrImage) {
  const res = await getFullDetection(videoOrImage, true);
  if (!res) return null;
  return Array.from(res.descriptor);
}

const mid = (pts) => pts.reduce((a, p) => ({ x: a.x + p.x / pts.length, y: a.y + p.y / pts.length }), { x: 0, y: 0 });
const d2 = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);

// Rough head pose (yaw/pitch) from the 68 landmarks — used to vary enrollment angles.
export function headPose(landmarks) {
  const jaw = landmarks.getJawOutline();
  const nose = landmarks.getNose();
  const le = mid(landmarks.getLeftEye());
  const re = mid(landmarks.getRightEye());
  const eyeC = { x: (le.x + re.x) / 2, y: (le.y + re.y) / 2 };
  const tip = nose[3]; // landmark 30 (nose tip)
  const w = d2(jaw[0], jaw[16]) || 1;
  const yaw = (tip.x - eyeC.x) / w;
  const pitch = d2(eyeC, jaw[8]) ? (tip.y - eyeC.y) / d2(eyeC, jaw[8]) : 0.45;
  return { yaw, pitch };
}

export function poseGap(a, b) {
  return Math.hypot((a.yaw - b.yaw) * 2, a.pitch - b.pitch);
}

// Average eye-aspect-ratio; drops sharply when eyes close (blink).
export function eyeOpenness(landmarks) {
  const ear = (eye) => {
    const A = d2(eye[1], eye[5]);
    const B = d2(eye[2], eye[4]);
    const C = d2(eye[0], eye[3]) || 1;
    return (A + B) / (2 * C);
  };
  return (ear(landmarks.getLeftEye()) + ear(landmarks.getRightEye())) / 2;
}

// Dual liveness: passes on a blink OR a slight head turn (photos can do neither).
// Blink uses an adaptive per-person baseline; head turn uses yaw delta from start.
export function createLivenessDetector() {
  let baseEar = null;
  let yaw0 = null;
  let frames = 0;
  let closed = false;
  let yawHits = 0;
  return ({ ear, yaw }) => {
    frames += 1;
    if (baseEar === null) { baseEar = ear; yaw0 = yaw; return false; }
    if (!closed && ear > baseEar * 0.9) baseEar = baseEar * 0.8 + ear * 0.2;
    if (frames < 3) return false;
    if (!closed && ear < baseEar * 0.82) {
      closed = true;
    } else if (closed && ear > baseEar * 0.92) {
      return true;
    }
    if (Math.abs(yaw - yaw0) > 0.055) {
      yawHits += 1;
      if (yawHits >= 2) return true;
    } else {
      yawHits = 0;
    }
    return false;
  };
}

// Wait up to ~2s for a good frontal frame (used after a head-turn liveness pass).
export async function captureFrontal(video, tries = 14, delayMs = 150) {
  for (let i = 0; i < tries; i++) {
    const det = await getFullDetection(video, true);
    if (isGoodFace(det)) return det;
    await new Promise(r => setTimeout(r, delayMs));
  }
  return null;
}

// Quality gate: confident detection and face large enough in frame.
export function isGoodFace(det, inputWidth = 480) {
  return !!det && det.detection.score >= 0.5 && det.detection.box.width >= inputWidth * 0.2;
}

export function distance(a, b) {
  let sum = 0;
  for (let i = 0; i < a.length; i++) { const d = a[i] - b[i]; sum += d * d; }
  return Math.sqrt(sum);
}

// Stable per-browser device token for trusted-device Face ID binding.
export function getDeviceToken() {
  let t = localStorage.getItem('face_device_token');
  if (!t) {
    t = (crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(36).slice(2)}`) +
        '-' + Math.random().toString(36).slice(2);
    localStorage.setItem('face_device_token', t);
  }
  return t;
}

// Match a live descriptor against the enrolled face index.
// index: [{id, name, role, descriptors: [[...128], ...]}]
export function matchDescriptor(descriptor, index, threshold = MATCH_THRESHOLD) {
  let best = null;
  let bestDist = Infinity;
  for (const m of index) {
    for (const d of (m.descriptors || [])) {
      if (!d || d.length !== 128) continue;
      const dist = distance(descriptor, d);
      if (dist < bestDist) { bestDist = dist; best = m; }
    }
  }
  if (best && bestDist <= threshold) return { member: best, distance: bestDist };
  return { member: null, distance: bestDist };
}
