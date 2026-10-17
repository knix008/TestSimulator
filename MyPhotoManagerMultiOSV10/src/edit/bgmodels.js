// REMBG 1 and REMBG 2. The ONNX runtime ships with the app (src/edit/bgort.js).
// The model files are downloaded on request and kept on this device: the desktop
// app stores them under its data folder, and the web app stores them in IndexedDB.
// Official weights: https://github.com/danielgatis/rembg/releases/tag/v0.0.0
import { t } from '../i18n.js';
import { idbDelete, idbGet, idbSet } from '../platform/idb.js';
import { progressDialog } from '../ui/dialog.js';
import { clearNeuralAlgorithm, hasNeuralAlpha, neuralKey, selectionMask, storeNeuralAlpha } from './background.js';

const REMBG = 'https://github.com/danielgatis/rembg/releases/download/v0.0.0';

export const MODEL_SPECS = Object.freeze({
  rembg1: Object.freeze({
    id: 'rembg1',
    file: 'u2net.onnx',
    url: `${REMBG}/u2net.onnx`,
    bytes: 176000000,
    size: [320, 320],
    mean: [0.485, 0.456, 0.406],
    std: [0.229, 0.224, 0.225],
  }),
  rembg2: Object.freeze({
    id: 'rembg2',
    file: 'isnet-general-use.onnx',
    url: `${REMBG}/isnet-general-use.onnx`,
    bytes: 179000000,
    size: [1024, 1024],
    mean: [0.485, 0.456, 0.406],
    std: [1, 1, 1],
  }),
});

const storageKey = (id) => `bg-model:${id}`;
const sessions = new Map();
const inflight = new Map();
const aborters = new Map();
const dialogs = new Map();
const phases = new Map();
const listeners = new Set();
let nativeApi = null;
let inferChain = Promise.resolve();

function emit(payload) {
  phases.set(payload.id, payload);
  for (const listener of listeners) listener(payload);
}

export function modelPhase(id) {
  return phases.get(id) ?? null;
}

export function onModelProgress(listener) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

function devUrl(spec) {
  const dev = typeof import.meta !== 'undefined' && import.meta.env && import.meta.env.DEV;
  if (dev && typeof document !== 'undefined') return new URL(`bg-models/${spec.file}`, document.baseURI).href;
  return spec.url;
}

async function desktop() {
  nativeApi ??= import('../platform/native.js');
  return nativeApi;
}

function asBytes(value) {
  if (value instanceof Uint8Array) return value;
  if (value instanceof ArrayBuffer) return new Uint8Array(value);
  if (ArrayBuffer.isView(value)) return new Uint8Array(value.buffer, value.byteOffset, value.byteLength);
  return null;
}

function cancelledError(error) {
  const text = error instanceof Error ? error.message : String(error ?? '');
  if (error?.name === 'AbortError' || text === 'cancelled' || text.includes('cancelled')) return new Error('cancelled');
  return error instanceof Error ? error : new Error(text);
}

/** A failed download or install. Callers tell the user to try again. Cancel stays a plain Error('cancelled'). */
export function asDownloadError(error) {
  const wrapped = cancelledError(error);
  if (wrapped.message !== 'cancelled') wrapped.downloadFailed = true;
  return wrapped;
}

/** Download one model body, reporting byte progress. `fetchImpl` is for tests. */
export async function fetchModel(spec, { onProgress, signal, fetchImpl } = {}) {
  const fetchFn = fetchImpl ?? globalThis.fetch;
  let response;
  try {
    response = await fetchFn(spec.url, { signal });
  } catch (error) {
    throw cancelledError(error);
  }
  if (!response?.ok) throw new Error(`HTTP ${response?.status ?? 0}`);
  const total = Number(response.headers?.get?.('content-length')) || spec.bytes || 0;
  const reader = response.body.getReader();
  const chunks = [];
  let received = 0;
  let last = 0;
  try {
    while (true) {
      if (signal?.aborted) throw new Error('cancelled');
      const { done, value } = await reader.read();
      if (done) break;
      chunks.push(value);
      received += value.byteLength;
      const now = Date.now();
      if (onProgress && (now - last > 80 || (total > 0 && received >= total))) {
        last = now;
        onProgress({ id: spec.id, phase: 'download', received, total: total || received });
      }
    }
  } catch (error) {
    throw cancelledError(error);
  }
  const out = new Uint8Array(received);
  let offset = 0;
  for (const chunk of chunks) {
    out.set(chunk, offset);
    offset += chunk.byteLength;
  }
  onProgress?.({ id: spec.id, phase: 'install', received, total: total || received });
  return out;
}

export async function isInstalled(id) {
  const api = await desktop();
  if (api.isDesktop()) {
    const info = await api.invoke('bg_model_info', { id });
    return Boolean(info?.installed);
  }
  const bytes = asBytes(await idbGet(storageKey(id)));
  return Boolean(bytes && bytes.byteLength > 1_000_000);
}

async function downloadDesktop(id, onProgress, signal) {
  const api = await desktop();
  const unlisten = await api.listen('bg-model-progress', (payload) => {
    if (payload?.id === id) onProgress?.(payload);
  });
  const timer = setInterval(() => {
    if (signal?.aborted) api.invoke('bg_model_cancel', { id }).catch(() => {});
  }, 200);
  try {
    await api.invoke('bg_model_download', { id });
  } catch (error) {
    throw cancelledError(error);
  } finally {
    clearInterval(timer);
    unlisten();
  }
}

async function ensureInstalled(id, onProgress) {
  if (!MODEL_SPECS[id]) throw new Error(`unknown model ${id}`);
  if (await isInstalled(id)) return;
  if (inflight.has(id)) return inflight.get(id);
  const controller = new AbortController();
  aborters.set(id, controller);
  const job = (async () => {
    const api = await desktop();
    if (api.isDesktop()) {
      await downloadDesktop(id, onProgress, controller.signal);
      return;
    }
    const spec = { ...MODEL_SPECS[id], url: devUrl(MODEL_SPECS[id]) };
    const bytes = await fetchModel(spec, { onProgress, signal: controller.signal });
    await idbSet(storageKey(id), bytes);
  })().finally(() => {
    inflight.delete(id);
    aborters.delete(id);
  });
  inflight.set(id, job);
  return job;
}

export function cancelModel(id) {
  if (!aborters.has(id) && !inflight.has(id)) return;
  aborters.get(id)?.abort();
  desktop().then((api) => {
    if (api.isDesktop()) api.invoke('bg_model_cancel', { id }).catch(() => {});
  }).catch(() => {});
}

async function modelSource(id) {
  const api = await desktop();
  if (api.isDesktop()) {
    const info = await api.invoke('bg_model_info', { id });
    if (!info?.installed) throw new Error('not installed');
    return { url: api.assetUrl(info.path), id };
  }
  const bytes = asBytes(await idbGet(storageKey(id)));
  if (!bytes || bytes.byteLength < 1_000_000) throw new Error('not installed');
  return { bytes, id };
}

async function loadSession(id) {
  if (sessions.has(id)) return sessions.get(id);
  const { loadOrt } = await import('./bgort.js');
  const ort = await loadOrt();
  const source = await modelSource(id);
  const options = { executionProviders: ['wasm'] };
  let session;
  try {
    session = await ort.InferenceSession.create(source.url ?? source.bytes, options);
  } catch (error) {
    if (!source.url) throw error;
    const api = await desktop();
    const data = await api.invoke('bg_model_read', { id });
    const bytes = asBytes(data) ?? (Array.isArray(data) ? Uint8Array.from(data) : null);
    if (!bytes) throw error;
    session = await ort.InferenceSession.create(bytes, options);
  }
  sessions.set(id, session);
  return session;
}

function pixelBounds(selection, width, height) {
  let left = width;
  let top = height;
  let right = 0;
  let bottom = 0;
  if (selection?.kind === 'rect' || selection?.kind === 'ellipse' || selection?.kind === 'circle') {
    const box = selection.kind === 'circle'
      ? { x: selection.x + (selection.w - Math.min(selection.w, selection.h)) / 2, y: selection.y + (selection.h - Math.min(selection.w, selection.h)) / 2, w: Math.min(selection.w, selection.h), h: Math.min(selection.w, selection.h) }
      : selection;
    left = box.x;
    top = box.y;
    right = box.x + box.w;
    bottom = box.y + box.h;
  } else {
    for (const point of selection?.points ?? []) {
      left = Math.min(left, point[0]);
      top = Math.min(top, point[1]);
      right = Math.max(right, point[0]);
      bottom = Math.max(bottom, point[1]);
    }
  }
  const x = Math.max(0, Math.min(width - 1, Math.floor(left)));
  const y = Math.max(0, Math.min(height - 1, Math.floor(top)));
  const r = Math.max(x + 1, Math.min(width, Math.ceil(right)));
  const b = Math.max(y + 1, Math.min(height, Math.ceil(bottom)));
  return { x, y, w: r - x, h: b - y };
}

function cropRGBA(image, box) {
  const data = new Uint8ClampedArray(box.w * box.h * 4);
  for (let y = 0; y < box.h; y++) {
    const src = ((y + box.y) * image.width + box.x) * 4;
    data.set(image.data.subarray(src, src + box.w * 4), y * box.w * 4);
  }
  return { width: box.w, height: box.h, data };
}

/** NCHW float tensor, normalised the way rembg normalises a picture for this model. */
export function modelTensor(image, spec) {
  const [tw, th] = spec.size;
  const { width, height, data } = image;
  const rgb = new Float32Array(tw * th * 3);
  let max = 0;
  for (let y = 0; y < th; y++) {
    const sy = ((y + 0.5) * height) / th - 0.5;
    const y0 = Math.max(0, Math.min(height - 1, Math.floor(sy)));
    const y1 = Math.max(0, Math.min(height - 1, y0 + 1));
    const fy = height === 1 ? 0 : Math.max(0, Math.min(1, sy - y0));
    for (let x = 0; x < tw; x++) {
      const sx = ((x + 0.5) * width) / tw - 0.5;
      const x0 = Math.max(0, Math.min(width - 1, Math.floor(sx)));
      const x1 = Math.max(0, Math.min(width - 1, x0 + 1));
      const fx = width === 1 ? 0 : Math.max(0, Math.min(1, sx - x0));
      const at = (px, py) => {
        const i = (py * width + px) * 4;
        return [data[i], data[i + 1], data[i + 2]];
      };
      const samples = [at(x0, y0), at(x1, y0), at(x0, y1), at(x1, y1)];
      const weights = [(1 - fx) * (1 - fy), fx * (1 - fy), (1 - fx) * fy, fx * fy];
      const o = (y * tw + x) * 3;
      for (let channel = 0; channel < 3; channel++) {
        let value = 0;
        for (let s = 0; s < 4; s++) value += samples[s][channel] * weights[s];
        rgb[o + channel] = value;
        if (value > max) max = value;
      }
    }
  }
  if (max <= 0) max = 1;
  const out = new Float32Array(3 * tw * th);
  for (let i = 0; i < tw * th; i++) {
    for (let channel = 0; channel < 3; channel++) {
      out[channel * tw * th + i] = (rgb[i * 3 + channel] / max - spec.mean[channel]) / spec.std[channel];
    }
  }
  return out;
}

/** Stretch a model plane to 0–255 and resize it to the picture. */
export function maskFromValues(values, srcW, srcH, dstW, dstH) {
  const count = srcW * srcH;
  let low = Infinity;
  let high = -Infinity;
  for (let i = 0; i < count; i++) {
    const value = values[i];
    if (value < low) low = value;
    if (value > high) high = value;
  }
  const span = high - low || 1;
  const out = new Uint8Array(dstW * dstH);
  const sample = (x, y) => (values[y * srcW + x] - low) / span;
  for (let y = 0; y < dstH; y++) {
    const sy = dstH === 1 ? 0 : ((y + 0.5) * srcH) / dstH - 0.5;
    const y0 = Math.max(0, Math.min(srcH - 1, Math.floor(sy)));
    const y1 = Math.max(0, Math.min(srcH - 1, y0 + 1));
    const fy = srcH === 1 ? 0 : Math.max(0, Math.min(1, sy - y0));
    for (let x = 0; x < dstW; x++) {
      const sx = dstW === 1 ? 0 : ((x + 0.5) * srcW) / dstW - 0.5;
      const x0 = Math.max(0, Math.min(srcW - 1, Math.floor(sx)));
      const x1 = Math.max(0, Math.min(srcW - 1, x0 + 1));
      const fx = srcW === 1 ? 0 : Math.max(0, Math.min(1, sx - x0));
      const value = sample(x0, y0) * (1 - fx) * (1 - fy) + sample(x1, y0) * fx * (1 - fy) + sample(x0, y1) * (1 - fx) * fy + sample(x1, y1) * fx * fy;
      out[y * dstW + x] = Math.max(0, Math.min(255, Math.round(value * 255)));
    }
  }
  return out;
}

async function inferMask(image, selection, algorithm) {
  const spec = MODEL_SPECS[algorithm];
  const session = await loadSession(algorithm);
  const { loadOrt } = await import('./bgort.js');
  const ort = await loadOrt();
  const box = pixelBounds(selection, image.width, image.height);
  const [tw, th] = spec.size;
  const input = new ort.Tensor('float32', modelTensor(cropRGBA(image, box), spec), [1, 3, th, tw]);
  const output = await session.run({ [session.inputNames[0]]: input });
  const plane = output[session.outputNames[0]];
  const dims = plane.dims ?? [];
  const srcW = dims.length >= 1 ? dims[dims.length - 1] : Math.round(Math.sqrt(plane.data.length));
  const srcH = dims.length >= 2 ? dims[dims.length - 2] : srcW;
  const local = maskFromValues(plane.data, srcW, srcH, box.w, box.h);
  const alpha = new Uint8Array(image.width * image.height);
  const keep = selectionMask(image.width, image.height, selection);
  for (let y = 0; y < box.h; y++) {
    for (let x = 0; x < box.w; x++) {
      const index = (y + box.y) * image.width + (x + box.x);
      if (!keep[index]) continue;
      alpha[index] = local[y * box.w + x];
    }
  }
  return alpha;
}

function queueInference(work) {
  const run = inferChain.then(work, work);
  inferChain = run.then(() => {}, () => {});
  return run;
}

async function runInstall(id) {
  if (sessions.has(id) && await isInstalled(id)) return;
  const name = t(`edit.bg.${id}`);
  const progress = progressDialog(t('edit.bgDownloading', { name, percent: 0 }));
  const stop = onModelProgress((payload) => {
    if (payload.id !== id) return;
    const total = payload.total || 1;
    const ratio = payload.phase === 'download' ? Math.min(1, payload.received / total) : 1;
    const percent = Math.min(99, Math.round(ratio * (payload.phase === 'download' ? 90 : 100)));
    const text = payload.phase === 'download' ? t('edit.bgDownloading', { name, percent }) : t('edit.bgInstalling', { name });
    progress.update(payload.phase === 'download' ? percent : 95, 100, text);
  });
  const timer = setInterval(() => { if (progress.cancelled) cancelModel(id); }, 200);
  try {
    await ensureInstalled(id, emit);
    emit({ id, phase: 'install', received: 1, total: 1 });
    await loadSession(id);
    emit({ id, phase: 'ready', received: 1, total: 1 });
    progress.update(100, 100, t('edit.bgInstalling', { name }));
  } catch (error) {
    emit({ id, phase: 'error', received: 0, total: 1 });
    throw asDownloadError(error);
  } finally {
    clearInterval(timer);
    stop();
    progress.close();
  }
}

/** Popup text: the download failed, try again, and the reason underneath. */
export function downloadFailedText(id, error) {
  const detail = error instanceof Error ? error.message : String(error ?? '');
  return t('edit.bgDownloadFailed', { name: t(`edit.bg.${id}`), error: detail });
}

/** Download the model if it is missing, then load it. Shows download and install progress. */
export function installModel(id) {
  if (dialogs.has(id)) return dialogs.get(id);
  const job = runInstall(id).finally(() => dialogs.delete(id));
  dialogs.set(id, job);
  return job;
}

/** Install the model if needed, run it, and store the alpha mask used by removeBackground. */
export async function prepareNeuralMask(image, selection, algorithm, report) {
  const key = neuralKey(algorithm, selection, image.width, image.height);
  if (hasNeuralAlpha(key)) {
    report?.(100, 100);
    return key;
  }
  await installModel(algorithm);
  const name = t(`edit.bg.${algorithm}`);
  const text = (percent) => t('edit.bgRemoving', { name, percent });
  const progress = report ? null : progressDialog(text(0), { cancellable: false, immediate: true });
  const say = (percent) => {
    const done = Math.max(0, Math.min(100, Math.round(percent)));
    if (report) report(done, 100);
    else progress.update(done, 100, text(done));
  };
  try {
    say(8);
    await new Promise((resolve) => setTimeout(resolve, 40));
    say(30);
    await new Promise((resolve) => setTimeout(resolve, 40));
    const alpha = await queueInference(async () => {
      say(55);
      await new Promise((resolve) => setTimeout(resolve, 40));
      const mask = await inferMask(image, selection, algorithm);
      say(92);
      return mask;
    });
    storeNeuralAlpha(key, alpha);
    say(100);
    return key;
  } finally {
    progress?.close();
  }
}

export async function deleteModel(id) {
  cancelModel(id);
  sessions.delete(id);
  clearNeuralAlgorithm(id);
  const api = await desktop();
  if (api.isDesktop()) await api.invoke('bg_model_delete', { id });
  else await idbDelete(storageKey(id));
  emit({ id, phase: 'removed', received: 0, total: 0 });
}
