// Finds the face and the person in a photo.
//   1. MediaPipe face mesh (478 points, public/mediapipe/face_landmarker.task) → exact features.
//   2. MediaPipe selfie segmenter (public/mediapipe/selfie_segmenter.tflite) → the person mask.
// Both run in the page with WebAssembly from public/mediapipe/wasm (no network needed). When a
// model is missing or fails (old WebView, file not fetched), the app's own methods take over:
// engine/face.js detectFace (skin colour) and engine/styles.js maskFromFeatures.
import { detectFace, fromLandmarks } from '../engine/face.js';

let fileset = null;
let landmarker = null;
let segmenter = null;
let vision = null;
const failures = { face: null, mask: null };

const base = () => new URL('mediapipe/', globalThis.location.href).href;

async function loadVision() {
  if (!vision) vision = await import('@mediapipe/tasks-vision');
  if (!fileset) fileset = await vision.FilesetResolver.forVisionTasks(`${base()}wasm`);
  return vision;
}

async function getLandmarker() {
  if (landmarker) return landmarker;
  const v = await loadVision();
  landmarker = await v.FaceLandmarker.createFromOptions(fileset, {
    baseOptions: { modelAssetPath: `${base()}face_landmarker.task`, delegate: 'CPU' },
    runningMode: 'IMAGE',
    numFaces: 4,
    minFaceDetectionConfidence: 0.3,
    minFacePresenceConfidence: 0.3,
  });
  return landmarker;
}

async function getSegmenter() {
  if (segmenter) return segmenter;
  const v = await loadVision();
  segmenter = await v.ImageSegmenter.createFromOptions(fileset, {
    baseOptions: { modelAssetPath: `${base()}selfie_segmenter.tflite`, delegate: 'CPU' },
    runningMode: 'IMAGE',
    outputConfidenceMasks: true,
    outputCategoryMask: false,
  });
  return segmenter;
}

/** A canvas holding the raster (MediaPipe reads canvases). */
function canvasOf(raster) {
  const canvas = document.createElement('canvas');
  canvas.width = raster.width;
  canvas.height = raster.height;
  canvas.getContext('2d').putImageData(new ImageData(new Uint8ClampedArray(raster.data), raster.width, raster.height), 0, 0);
  return canvas;
}

/** The largest face of a mesh result (several people: the biggest one is the subject). */
function largestFace(faces) {
  let best = null;
  let bestArea = -1;
  for (const points of faces ?? []) {
    const xs = points.map((p) => p.x);
    const ys = points.map((p) => p.y);
    const area = (Math.max(...xs) - Math.min(...xs)) * (Math.max(...ys) - Math.min(...ys));
    if (area > bestArea) { bestArea = area; best = points; }
  }
  return best;
}

/**
 * The face mesh of the largest face: the whole picture first; when the face is small in it (the
 * detector looks for faces that fill a good part of the picture), again on enlarged crops — around
 * the head the skin-colour finder guesses, then the upper middle of the picture. Points come back
 * normalised to the whole picture: { points, faces }.
 */
async function findLandmarks(raster, canvas) {
  const mesh = await getLandmarker();
  const first = mesh.detect(canvas);
  const points = largestFace(first.faceLandmarks);
  if (points) return { points, faces: first.faceLandmarks.length };
  const W = raster.width;
  const H = raster.height;
  const crops = [];
  const guess = detectFace(raster);
  if (guess.method === 'skin') {
    const size = Math.max(guess.face.rx, guess.face.ry) * 3.4;
    crops.push({ x: guess.face.cx - size / 2, y: guess.face.cy - size / 2, w: size, h: size });
  }
  const side = Math.min(W, H) * 0.75;
  crops.push({ x: (W - side) / 2, y: Math.max(0, H * 0.36 - side / 2), w: side, h: side });
  crops.push({ x: 0, y: 0, w: W, h: Math.min(H, W) });
  const view = document.createElement('canvas');
  view.width = 512;
  view.height = 512;
  const context = view.getContext('2d');
  for (const crop of crops) {
    context.fillStyle = '#000';
    context.fillRect(0, 0, 512, 512);
    context.drawImage(canvas, crop.x, crop.y, crop.w, crop.h, 0, 0, 512, 512);
    const result = mesh.detect(view);
    const found = largestFace(result.faceLandmarks);
    if (found) {
      return {
        faces: result.faceLandmarks.length,
        points: found.map((p) => ({ x: (crop.x + p.x * crop.w) / W, y: (crop.y + p.y * crop.h) / H, z: p.z })),
      };
    }
  }
  return { points: null, faces: 0 };
}

/**
 * Features and person mask of a raster: { features, mask (Float32Array | null), faceMethod, maskMethod,
 * faces (how many the mesh found) }. `options`: { useFaceModel, usePersonMask }.
 */
export async function analyse(raster, { useFaceModel = true, usePersonMask = true } = {}) {
  const canvas = canvasOf(raster);
  let features = null;
  let faces = 0;
  if (useFaceModel) {
    try {
      const found = await findLandmarks(raster, canvas);
      faces = found.faces;
      if (found.points) features = fromLandmarks(found.points, raster.width, raster.height);
      failures.face = null;
    } catch (error) {
      failures.face = String(error?.message ?? error);
      console.warn('face mesh unavailable:', error);
    }
  }
  if (!features) features = detectFace(raster);
  let mask = null;
  if (usePersonMask) {
    try {
      const result = (await getSegmenter()).segment(canvas);
      const masks = result.confidenceMasks ?? [];
      const chosen = masks.length > 1 ? masks[masks.length - 1] : masks[0];
      if (chosen) {
        const data = Float32Array.from(chosen.getAsFloat32Array());
        mask = resizeMask(data, chosen.width, chosen.height, raster.width, raster.height);
        // The model's single mask may be the background: the face centre must be "person".
        const at = Math.round(features.face.cy) * raster.width + Math.round(features.face.cx);
        if ((mask[at] ?? 1) < 0.5) for (let i = 0; i < mask.length; i++) mask[i] = 1 - mask[i];
      }
      for (const m of masks) m.close?.();
      failures.mask = null;
    } catch (error) {
      failures.mask = String(error?.message ?? error);
      console.warn('person segmentation unavailable:', error);
    }
  }
  return { features, mask, faces, faceMethod: features.method, maskMethod: mask ? 'model' : 'shape' };
}

/**
 * Bilinear resize of a mask (w×h → W×H), optionally of a part of it: `rect` { x, y, w, h } in the
 * mask's own pixels.
 */
function resizeMask(data, w, h, W, H, rect = null) {
  if (!rect && w === W && h === H) return data;
  const r = rect ?? { x: 0, y: 0, w, h };
  const out = new Float32Array(W * H);
  for (let y = 0; y < H; y++) {
    const sy = Math.min(h - 1, Math.max(0, r.y + ((y + 0.5) * r.h) / H - 0.5));
    const y0 = Math.floor(sy);
    const y1 = Math.min(h - 1, y0 + 1);
    const ty = sy - y0;
    for (let x = 0; x < W; x++) {
      const sx = Math.min(w - 1, Math.max(0, r.x + ((x + 0.5) * r.w) / W - 0.5));
      const x0 = Math.floor(sx);
      const x1 = Math.min(w - 1, x0 + 1);
      const tx = sx - x0;
      const a = data[y0 * w + x0] + (data[y0 * w + x1] - data[y0 * w + x0]) * tx;
      const b = data[y1 * w + x0] + (data[y1 * w + x1] - data[y1 * w + x0]) * tx;
      out[y * W + x] = a + (b - a) * ty;
    }
  }
  return out;
}

export { resizeMask };
/** Why a model could not be used (null: it worked or was not asked for). */
export const modelFailures = () => ({ ...failures });
