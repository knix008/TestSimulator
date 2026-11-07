// Turning the scene into an image: the path tracer across workers, or the real-time renderer on the GPU; then denoise,
// compositor and display. Row by row, so the Image Editor fills in as it goes and Cancel takes effect at once.
import * as THREE from 'three';
import { getObject, setFrame, worldMatrix } from '../core/doc.js';
import { evalCompositor } from '../core/nodes.js';
import { buildRenderScene, denoiseImage, toDisplay } from '../core/pathtracer.js';
import { SceneSync } from './sync.js';
import { drawFreestyle } from '../core/freestyle.js';
import { renderPathGPU } from './gpupath.js';

/** Decodes the document's images for shading (kept by id). */
export async function decodeImages(doc, cache = {}) {
  for (const image of doc.images) {
    if (cache[image.id]?.src === image.dataUrl) continue;
    const element = new Image();
    element.src = image.dataUrl;
    await element.decode();
    const canvas = document.createElement('canvas');
    canvas.width = element.naturalWidth;
    canvas.height = element.naturalHeight;
    const g = canvas.getContext('2d');
    g.drawImage(element, 0, 0);
    cache[image.id] = { src: image.dataUrl, width: canvas.width, height: canvas.height, rgba: g.getImageData(0, 0, canvas.width, canvas.height).data };
  }
  return cache;
}

/** A picture as a compressed PNG data URL. */
export function encodeImageData(image) {
  const canvas = document.createElement('canvas');
  canvas.width = image.width;
  canvas.height = image.height;
  canvas.getContext('2d').putImageData(new ImageData(new Uint8ClampedArray(image.rgba), image.width, image.height), 0, 0);
  return canvas.toDataURL('image/png');
}

function finish(doc, linear, passes) {
  const r = doc.render;
  let image = linear;
  if ((r.engine === 'PATH' || r.engine === 'GPU') && r.denoise) image = denoiseImage(image, 1, 0.35);
  if (r.freestyle?.enabled) image = drawFreestyle(doc, buildRenderScene(doc, { width: image.width, height: image.height }), image);
  if (doc.compositorEnabled && doc.compositor) image = evalCompositor(doc.compositor, image, passes);
  const display = toDisplay(image, { exposure: r.exposure, gamma: r.gamma, viewTransform: r.viewTransform });
  return { width: image.width, height: image.height, linear: image, display, passes };
}

/** Path tracing with one worker per spare CPU. `onRow(fraction, partial)` as rows come in. Returns { promise, cancel }. */
let threadLimit = 0;
/** How many workers the path tracer may use; 0 means one per spare CPU. */
export const setRenderThreads = (n) => { threadLimit = Math.max(0, Math.round(Number(n) || 0)); };
export function renderPath(doc, images, { onProgress } = {}) {
  if (doc.render.engine === 'GPU') {
    const job = renderPathGPU(doc, images, { onProgress: (fraction) => onProgress?.(fraction, { width: 1, height: 1, display: new Uint8ClampedArray(4) }) });
    return { promise: job.promise.then((image) => finish(doc, image, null)), cancel: job.cancel };
  }
  const scene = buildRenderScene(doc);
  scene.images = images;
  const { width, height } = scene;
  const samples = scene.settings.samples;
  const data = new Float32Array(width * height * 4);
  const depth = { width, height, data: new Float32Array(width * height * 4) };
  const normal = { width, height, data: new Float32Array(width * height * 4) };
  const count = threadLimit || Math.max(1, Math.min(16, (navigator.hardwareConcurrency || 4) - 1));
  const workers = [];
  let cancelled = false;
  let settle;
  const promise = new Promise((resolve, reject) => { settle = { resolve, reject }; });
  let next = 0;
  let done = 0;
  const preview = new Uint8ClampedArray(width * height * 4);
  const stop = () => { for (const w of workers) w.terminate(); workers.length = 0; };
  const feed = (worker) => {
    if (cancelled || next >= height) return;
    worker.postMessage({ type: 'row', y: next++ });
  };
  for (let i = 0; i < count; i++) {
    const worker = new Worker(new URL('../platform/render-worker.js', import.meta.url), { type: 'module' });
    workers.push(worker);
    worker.onerror = (e) => { stop(); settle.reject(new Error(e.message || 'The render worker failed')); };
    worker.onmessage = (e) => {
      const m = e.data;
      if (m.type === 'ready') { feed(worker); return; }
      const offset = m.y * width * 4;
      for (let k = 0; k < m.data.length; k++) data[offset + k] = m.data[k] / samples;
      for (let x = 0; x < width; x++) {
        const p = (m.y * width + x) * 4;
        depth.data.fill(m.depth[x], p, p + 3);
        depth.data[p + 3] = 1;
        normal.data[p] = m.normal[x * 3] * 0.5 + 0.5;
        normal.data[p + 1] = m.normal[x * 3 + 1] * 0.5 + 0.5;
        normal.data[p + 2] = m.normal[x * 3 + 2] * 0.5 + 0.5;
        normal.data[p + 3] = 1;
      }
      preview.set(toDisplay({ width, height: 1, data: data.subarray(offset, offset + width * 4) }, { exposure: scene.settings.exposure, gamma: scene.settings.gamma, viewTransform: scene.settings.viewTransform }), offset);
      done++;
      onProgress?.(done / height, { width, height, display: preview });
      if (done === height) {
        stop();
        settle.resolve(finish(doc, { width, height, data }, { depth, normal }));
      } else feed(worker);
    };
    worker.postMessage({ type: 'init', scene });
  }
  return { promise, cancel: () => { cancelled = true; stop(); settle.reject(Object.assign(new Error('Cancelled'), { cancelled: true })); } };
}

/** A real-time frame through three.js at the render size, with the scene's own lights and shadows. */
export function renderRealtime(doc, images) {
  const r = doc.render;
  const width = Math.max(1, Math.round((r.width * r.percent) / 100));
  const height = Math.max(1, Math.round((r.height * r.percent) / 100));
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, preserveDrawingBuffer: true, alpha: true });
  renderer.setSize(width, height, false);
  renderer.outputColorSpace = THREE.LinearSRGBColorSpace;
  renderer.toneMapping = THREE.NoToneMapping;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFShadowMap;
  renderer.debug.checkShaderErrors = false;
  const sync = new SceneSync();
  sync.sync(doc, { shading: 'RENDERED', selection: false, images, renderMode: true });
  sync.syncLights(doc, true);
  const c = doc.world.color;
  if (!r.filmTransparent) sync.scene.background = new THREE.Color(c[0] * doc.world.strength, c[1] * doc.world.strength, c[2] * doc.world.strength);
  const camObj = getObject(doc, doc.activeCamera);
  const camera = new THREE.PerspectiveCamera(50, width / height, 0.01, 10000);
  if (camObj) {
    const data = camObj.data;
    const fovX = 2 * Math.atan(data.sensor / (2 * data.lens));
    camera.fov = (2 * Math.atan(Math.tan(fovX / 2) * (height / width)) * 180) / Math.PI;
    camera.near = data.clipStart;
    camera.far = data.clipEnd;
    camera.updateProjectionMatrix();
    const m = worldMatrix(doc, camObj);
    camera.matrixAutoUpdate = false;
    camera.matrix.copy(m);
    camera.matrixWorld.copy(m);
    camera.matrixWorldInverse.copy(m).invert();
  }
  renderer.render(sync.scene, camera);
  // Read back the linear colour.
  const gl = renderer.getContext();
  const raw = new Uint8Array(width * height * 4);
  gl.readPixels(0, 0, width, height, gl.RGBA, gl.UNSIGNED_BYTE, raw);
  const data = new Float32Array(width * height * 4);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const [from, to] = [((height - 1 - y) * width + x) * 4, (y * width + x) * 4];
      for (let k = 0; k < 4; k++) data[to + k] = raw[from + k] / 255;
    }
  }
  sync.dispose();
  renderer.dispose();
  renderer.forceContextLoss?.();
  return finish(doc, { width, height, data }, null);
}

/** Every frame of the range, one after the other; each result goes to `onFrame`. */
export async function renderSequence(doc, images, { onFrame, onProgress, isCancelled }) {
  const { frameStart, frameEnd, frameStep } = doc;
  const saved = doc.frame;
  try {
    const frames = [];
    for (let f = frameStart; f <= frameEnd; f += Math.max(1, frameStep)) frames.push(f);
    for (const [index, frame] of frames.entries()) {
      if (isCancelled()) return false;
      setFrame(doc, frame);
      const result = doc.render.engine === 'REALTIME' ? renderRealtime(doc, images) : await renderPath(doc, images).promise;
      await onFrame(frame, result);
      onProgress?.((index + 1) / frames.length, frame);
    }
    return true;
  } finally {
    setFrame(doc, saved);
  }
}

/** A render result as a PNG blob (Korean-safe: no file name handling here). */
export function resultToPng(result) {
  const canvas = document.createElement('canvas');
  canvas.width = result.width;
  canvas.height = result.height;
  canvas.getContext('2d').putImageData(new ImageData(new Uint8ClampedArray(result.display), result.width, result.height), 0, 0);
  return new Promise((resolve) => canvas.toBlob(resolve, 'image/png'));
}
