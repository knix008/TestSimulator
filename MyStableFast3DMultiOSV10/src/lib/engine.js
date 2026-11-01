// Talking to whatever turns an image into a model.
//
//   local      the engine on this computer (engine/mysf3d). The desktop app
//              starts it and says where it listens; the web build expects it
//              at settings.engineUrl (`npm run engine` starts it there).
//   remote     the same engine on another computer (settings.remoteUrl).
//   stability  Stability AI's paid web API — off unless the user chooses it
//              in Settings and enters a key; never used by default.
//
// All three return the same thing: the model as GLB bytes.
import { api, isDesktop } from './platform.js';

export const STABILITY_ENDPOINT = 'https://api.stability.ai/v2beta/3d/stable-fast-3d';

export class EngineError extends Error {
  constructor(message, { status = 0, code = '' } = {}) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

async function request(url, { method = 'GET', body, headers, timeout = 8000, signal } = {}) {
  const ctrl = new AbortController();
  const timer = timeout ? setTimeout(() => ctrl.abort(), timeout) : 0;
  const onAbort = () => ctrl.abort();
  signal?.addEventListener('abort', onAbort);
  try {
    const res = await fetch(url, { method, body, headers, signal: ctrl.signal, cache: 'no-store' });
    if (!res.ok) {
      let msg = `HTTP ${res.status}`;
      try { const j = await res.json(); if (j?.error) msg = j.error; } catch { /* not JSON */ }
      throw new EngineError(msg, { status: res.status });
    }
    return res;
  } catch (err) {
    if (err instanceof EngineError) throw err;
    if (signal?.aborted) throw new EngineError('cancelled', { code: 'cancelled' });
    throw new EngineError(err?.name === 'AbortError' ? 'timeout' : (err?.message || String(err)), { code: 'unreachable' });
  } finally {
    clearTimeout(timer);
    signal?.removeEventListener('abort', onAbort);
  }
}

export function joinUrl(base, path) {
  return `${String(base || '').replace(/\/+$/, '')}${path}`;
}

// Option values travel as a query string; `model` and `name` ride along.
export function jobQuery({ model, name, options = {} }) {
  const q = new URLSearchParams();
  if (model) q.set('model', model);
  if (name) q.set('name', name);
  for (const [k, v] of Object.entries(options)) {
    if (v === undefined || v === null || v === '') continue;
    q.set(k, String(v));
  }
  return q.toString();
}

export class EngineClient {
  constructor(baseUrl) {
    this.base = baseUrl;
  }

  url(path) { return joinUrl(this.base, path); }

  async health() { return (await request(this.url('/api/health'), { timeout: 4000 })).json(); }

  async logs(after = 0) { return (await request(this.url(`/api/logs?after=${after}`), { timeout: 4000 })).json(); }

  async config(body) {
    return (await request(this.url('/api/config'), {
      method: 'POST', body: JSON.stringify(body), headers: { 'Content-Type': 'application/json' },
    })).json();
  }

  async installModel(id) { return (await request(this.url(`/api/models/${encodeURIComponent(id)}/install`), { method: 'POST' })).json(); }

  async retry() { return (await request(this.url('/api/install/retry'), { method: 'POST' })).json(); }

  async reinstall() { return (await request(this.url('/api/reinstall'), { method: 'POST' })).json(); }

  async submit({ data, name, model, options }) {
    const res = await request(this.url(`/api/jobs?${jobQuery({ model, name, options })}`), {
      method: 'POST', body: data, headers: { 'Content-Type': 'application/octet-stream' }, timeout: 120000,
    });
    return (await res.json()).id;
  }

  async job(id) { return (await request(this.url(`/api/jobs/${id}`), { timeout: 6000 })).json(); }

  async cancel(id) { return (await request(this.url(`/api/jobs/${id}/cancel`), { method: 'POST' })).json(); }

  // New surface options on a finished job (no model run): the job comes back
  // with its new result.glb ready.
  async refine(id, options) {
    return (await request(this.url(`/api/jobs/${id}/refine`), {
      method: 'POST', body: JSON.stringify(options), headers: { 'Content-Type': 'application/json' }, timeout: 300000,
    })).json();
  }

  async file(id, name) {
    const res = await request(this.url(`/api/jobs/${id}/${name}`), { timeout: 120000 });
    return new Uint8Array(await res.arrayBuffer());
  }
}

const sleep = (ms) => new Promise((r) => { setTimeout(r, ms); });

// Converts with the engine: submit, follow the job, fetch the result.
export async function convertWithEngine(client, { data, name, model, options, onProgress, signal }) {
  const id = await client.submit({ data, name, model, options });
  let cancelled = false;
  const onAbort = () => { cancelled = true; client.cancel(id).catch(() => {}); };
  signal?.addEventListener('abort', onAbort);
  try {
    let misses = 0;
    for (;;) {
      await sleep(400);
      let job;
      try {
        job = await client.job(id);
        misses = 0;
      } catch (err) {
        if (++misses > 20) throw err;
        continue;
      }
      onProgress?.(job);
      if (job.state === 'done') {
        const glb = await client.file(id, 'result.glb');
        let input = null;
        try { input = await client.file(id, 'input.png'); } catch { /* optional */ }
        return { glb, input, job };
      }
      if (job.state === 'failed') throw new EngineError(job.error || 'failed', { code: 'failed' });
      if (job.state === 'cancelled' || cancelled) throw new EngineError('cancelled', { code: 'cancelled' });
    }
  } finally {
    signal?.removeEventListener('abort', onAbort);
  }
}

// Stability AI's hosted Stable Fast 3D. Off by default; the caller has made
// sure the user chose it and confirmed that it is a paid service.
export async function convertWithStability({ data, name, options = {}, key, onProgress, signal }) {
  if (!key) throw new EngineError('No Stability AI API key', { code: 'no-key' });
  const fields = {
    texture_resolution: String(options.textureResolution === 'auto' || !options.textureResolution ? 1024 : options.textureResolution),
    foreground_ratio: String(options.foregroundRatio ?? 0.85),
    remesh: String(options.remesh || 'none'),
    vertex_count: String(options.vertexCount ?? -1),
  };
  const started = Date.now();
  onProgress?.({ state: 'running', stage: 'model', progress: 0.3, deviceName: 'Stability AI API' });
  let glb;
  if (isDesktop && api?.stabilityConvert) {
    glb = new Uint8Array(await api.stabilityConvert({ key, data, name, fields }));
  } else {
    const form = new FormData();
    form.append('image', new Blob([data]), name || 'image.png');
    for (const [k, v] of Object.entries(fields)) form.append(k, v);
    const res = await request(STABILITY_ENDPOINT, {
      method: 'POST', body: form, headers: { Authorization: `Bearer ${key}` }, timeout: 180000, signal,
    });
    glb = new Uint8Array(await res.arrayBuffer());
  }
  const job = {
    state: 'done', stage: 'done', progress: 1, model: 'stability', modelName: 'Stability AI API',
    deviceName: 'Stability AI API', elapsed: (Date.now() - started) / 1000, options: fields, stats: {},
  };
  onProgress?.(job);
  return { glb, input: null, job };
}

// Where the local engine is: the desktop host says; the web build uses the
// configured URL.
export async function localEngineUrl(settings) {
  if (isDesktop && api?.engine?.url) {
    try {
      const url = await api.engine.url();
      if (url) return url;
    } catch { /* not started yet */ }
    return '';
  }
  return settings.engineUrl;
}

// The engine a job or a status poll goes to under the current settings.
export async function engineUrlFor(settings) {
  if (settings.backend === 'remote' && settings.remoteUrl) return settings.remoteUrl;
  return localEngineUrl(settings);
}

// Stage names the UI translates (status.stage.*).
export const STAGES = ['queued', 'loading', 'background', 'model', 'mesh', 'remesh', 'uv', 'bake', 'export', 'done'];
