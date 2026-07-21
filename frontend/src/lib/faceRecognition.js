// On-device face recognition helper (models served from /face-models).
// No images ever leave the browser — only 128-float descriptors are used.
import * as faceapi from '@vladmandic/face-api';

const MODEL_URL = '/face-models';
// Euclidean-distance threshold for a confident match (lower = stricter).
export const MATCH_THRESHOLD = 0.5;

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

// Return a single 128-length descriptor (Array) for the largest face, or null.
export async function getDescriptor(videoOrImage) {
  const res = await faceapi
    .detectSingleFace(videoOrImage, detectorOpts)
    .withFaceLandmarks()
    .withFaceDescriptor();
  if (!res) return null;
  return Array.from(res.descriptor);
}

export function distance(a, b) {
  let sum = 0;
  for (let i = 0; i < a.length; i++) { const d = a[i] - b[i]; sum += d * d; }
  return Math.sqrt(sum);
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
