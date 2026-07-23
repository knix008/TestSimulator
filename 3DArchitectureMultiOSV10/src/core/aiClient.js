const AI_URL = 'http://127.0.0.1:5001';
const TIMEOUT_MS = 4000;

function signal(ms) {
  return AbortSignal.timeout ? AbortSignal.timeout(ms) : undefined;
}

async function post(path, body) {
  const r = await fetch(`${AI_URL}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
    signal: signal(30000),
  });
  return r.json();
}

/** Returns status object or null if server is not reachable. */
export async function checkStatus() {
  try {
    const r = await fetch(`${AI_URL}/api/status`, { signal: signal(TIMEOUT_MS) });
    return r.ok ? r.json() : null;
  } catch {
    return null;
  }
}

/** Returns array of model descriptors. */
export async function getModels() {
  const r = await fetch(`${AI_URL}/api/models`, { signal: signal(TIMEOUT_MS) });
  return r.json();
}

/** Start downloading a model (non-blocking on server side). */
export async function downloadModel(id) {
  return post('/api/models/download', { id });
}

/** Load model into ONNX session (blocking, may take several seconds). */
export async function loadModel(id) {
  const r = await fetch(`${AI_URL}/api/models/load`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ id }),
    signal: signal(60000), // loading can take time
  });
  return r.json();
}

/** Unload model from memory. */
export async function unloadModel(id) {
  return post('/api/models/unload', { id });
}

/** Delete model file from disk. */
export async function deleteModel(id) {
  return post('/api/models/delete', { id });
}

/**
 * Run depth estimation inference.
 * @param {string} imageDataUrl  base64 data URL of input image
 * @param {string} modelId       model identifier
 * @returns {{ ok, depth_map, width, height } | { error }}
 */
export async function inferDepth(imageDataUrl, modelId) {
  const r = await fetch(`${AI_URL}/api/infer`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ image: imageDataUrl, model_id: modelId }),
    signal: signal(120000), // inference can be slow on CPU
  });
  return r.json();
}
