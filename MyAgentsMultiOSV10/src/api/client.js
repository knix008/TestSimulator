// HTTP client of the core (ARCHITECTURE.md §5). One instance per window.
//
// Desktop: the shell started the core (src-tauri/src/core.rs); `core_info` gives its base URL and
// token, sent as `Authorization: Bearer <token>`. Web: the page and the API share the origin; the
// session cookie `myagents_session` goes along (credentials: 'same-origin').
//
// Every request carries `X-Client-Id` (this window's id): the core puts it in the events it emits,
// and the live channel (live/channel.js) ignores events caused by this window's own requests.
//
// Errors: the core answers `{ error: { code, message, details? } }`; the client throws an ApiError
// with `.code`, `.status` and `.details` (409: `details.current` is the row as it is now). A core
// that cannot be reached throws ApiError code 'unreachable' (status 0).
import { coreInfo, inTauri } from '../platform/native.js';

export class ApiError extends Error {
  constructor(message, { code = 'error', status = 0, details = null, cause = null } = {}) {
    super(message);
    this.name = 'ApiError';
    this.code = code;
    this.status = status;
    this.details = details;
    if (cause) this.cause = cause;
  }
}

const randomId = () => {
  const bytes = new Uint8Array(10);
  globalThis.crypto?.getRandomValues?.(bytes);
  return [...bytes].map((b) => b.toString(36).padStart(2, '0')).join('').slice(0, 16) || String(Date.now());
};

/** This window's client id (stable for the window's lifetime). */
export const CLIENT_ID = `c${randomId()}`;

/** Query string from an object (undefined / null values are left out, arrays repeat the key). */
export function queryString(params = {}) {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params ?? {})) {
    if (value == null || value === '') continue;
    if (Array.isArray(value)) for (const v of value) search.append(key, String(v));
    else search.append(key, String(value));
  }
  const text = search.toString();
  return text ? `?${text}` : '';
}

export class ApiClient {
  /**
   * `base`: the API root ('/api' on the web; 'http://127.0.0.1:<port>/api' on the desktop), or a
   * function returning a promise of { base, token } (resolved once, on the first request).
   */
  constructor({ base = null, token = null, resolve = null, fetchImpl = null, timeout = 30000 } = {}) {
    this.base = base;
    this.token = token;
    this.resolver = resolve;
    this.ready = null;
    this.fetch = fetchImpl ?? ((...args) => globalThis.fetch(...args));
    this.timeout = timeout;
    this.clientId = CLIENT_ID;
    /** The session token after a login (desktop: sent as X-Session; the web also has the cookie). */
    this.session = null;
    this.listeners = new Set();
  }

  /** Where the core is: { base, token }. Rejects (ApiError 'unreachable') when the shell has no core. */
  async connection() {
    if (this.base) return { base: this.base, token: this.token };
    if (!this.resolver) throw new ApiError('No API base configured', { code: 'unreachable' });
    this.ready ??= Promise.resolve(this.resolver()).then((info) => {
      this.base = info.base;
      this.token = info.token ?? null;
      return info;
    }).catch((error) => {
      this.ready = null;
      throw error instanceof ApiError ? error : new ApiError(String(error?.message ?? error), { code: 'unreachable', cause: error });
    });
    await this.ready;
    return { base: this.base, token: this.token };
  }

  /** The absolute URL of an API path (for <img src>, downloads, the WebSocket). */
  url(path) {
    const base = this.base ?? '/api';
    return `${base.replace(/\/$/, '')}${path.startsWith('/') ? path : `/${path}`}`;
  }

  /** Listens for every failed request (the app shows "core not reachable" from it). Returns an unsubscribe. */
  onError(listener) { this.listeners.add(listener); return () => this.listeners.delete(listener); }

  /**
   * One request. `body`: an object (sent as JSON), FormData, Blob, or a string. Returns the parsed JSON
   * (or null for 204), the Response itself with `raw: true`.
   */
  async request(method, path, { body, query, headers = {}, raw = false, signal = null, timeout = this.timeout } = {}) {
    let conn;
    try {
      conn = await this.connection();
    } catch (error) {
      this.emitError(error);
      throw error;
    }
    const init = { method, headers: { Accept: 'application/json', 'X-Client-Id': this.clientId, ...headers }, credentials: 'same-origin' };
    if (conn.token) init.headers.Authorization = `Bearer ${conn.token}`;
    if (this.session) init.headers['X-Session'] = this.session;
    if (body !== undefined) {
      if (body instanceof FormData || body instanceof Blob || typeof body === 'string' || body instanceof ArrayBuffer || ArrayBuffer.isView(body)) init.body = body;
      else { init.body = JSON.stringify(body); init.headers['Content-Type'] = 'application/json'; }
    }
    const controller = new AbortController();
    const timer = timeout ? setTimeout(() => controller.abort(new Error('timeout')), timeout) : null;
    if (signal) signal.addEventListener('abort', () => controller.abort(signal.reason), { once: true });
    init.signal = controller.signal;
    let response;
    try {
      response = await this.fetch(`${conn.base.replace(/\/$/, '')}${path}${queryString(query)}`, init);
    } catch (error) {
      const err = new ApiError(error?.name === 'AbortError' && !signal?.aborted ? 'The core did not answer in time' : String(error?.message ?? error), { code: signal?.aborted ? 'aborted' : 'unreachable', cause: error });
      if (err.code !== 'aborted') this.emitError(err);
      throw err;
    } finally {
      if (timer) clearTimeout(timer);
    }
    if (raw && response.ok) return response;
    if (response.status === 204) return null;
    const type = response.headers.get('content-type') ?? '';
    const payload = type.includes('json') ? await response.json().catch(() => null) : await response.text().catch(() => '');
    if (!response.ok) {
      // The core always answers JSON: an HTML or empty error page (a web server or dev server without
      // the core behind it, a proxy with nothing to forward to) means the core was not reached.
      if (!type.includes('json') && [404, 502, 503, 504].includes(response.status)) {
        const err = new ApiError(`No MyAgents core answered (HTTP ${response.status})`, { code: 'unreachable', status: response.status });
        this.emitError(err);
        throw err;
      }
      const info = payload && typeof payload === 'object' ? payload.error ?? {} : {};
      const err = new ApiError(info.message ?? (typeof payload === 'string' && payload ? payload.slice(0, 300) : `HTTP ${response.status}`), {
        code: info.code ?? (response.status === 401 ? 'unauthorized' : response.status === 403 ? 'forbidden' : response.status === 404 ? 'not_found' : response.status === 409 ? 'conflict' : 'http_error'),
        status: response.status, details: info.details ?? null,
      });
      this.emitError(err);
      throw err;
    }
    return payload;
  }

  emitError(error) { for (const listener of this.listeners) { try { listener(error); } catch { /* a listener's own bug */ } } }

  get(path, query) { return this.request('GET', path, { query }); }
  post(path, body, query) { return this.request('POST', path, { body: body ?? {}, query }); }
  patch(path, body) { return this.request('PATCH', path, { body }); }
  put(path, body) { return this.request('PUT', path, { body }); }
  del(path, query) { return this.request('DELETE', path, { query }); }

  // ───────────────────────── typed helpers (§5)

  info() { return this.get('/info'); }
  async login(password) { const out = await this.post('/auth/login', { password }); this.session = out?.token ?? this.session; return out; }
  async logout() { try { return await this.post('/auth/logout'); } finally { this.session = null; } }
  catalog() { return this.get('/catalog'); }
  settings() { return this.get('/settings'); }
  saveSettings(patch) { return this.put('/settings', patch); }
  // agents
  agents() { return this.get('/agents'); }
  agent(id) { return this.get(`/agents/${enc(id)}`); }
  createAgent(doc) { return this.post('/agents', doc); }
  saveAgent(id, doc) { return this.put(`/agents/${enc(id)}`, doc); }
  patchAgent(id, patch) { return this.patch(`/agents/${enc(id)}`, patch); }
  deleteAgent(id) { return this.del(`/agents/${enc(id)}`); }
  duplicateAgent(id) { return this.post(`/agents/${enc(id)}/duplicate`); }
  rotateSecret(id) { return this.post(`/agents/${enc(id)}/secret`); }
  deploy(id, deployed) { return this.post(`/agents/${enc(id)}/deploy`, { deployed }); }
  exportAgent(id) { return this.request('GET', `/agents/${enc(id)}/export`, { raw: true }).then((r) => r.text()); }
  importAgent(data) { return this.post('/agents/import', data); }
  problems(agent) { return this.post('/problems', { agent }); }
  template(id, lang) { return this.get(`/templates/${enc(id)}`, { lang }); }
  build(description, lang, model) { return this.request('POST', '/build', { body: { description, lang, model }, timeout: 0 }); }
  // runs
  run(id, data) { return this.post(`/agents/${enc(id)}/run`, data); }
  runDraft(agent, data) { return this.post('/run-draft', { agent, ...data }); }
  chat(id, data) { return this.request('POST', `/agents/${enc(id)}/chat`, { body: { ...data, signal: undefined }, signal: data?.signal, timeout: 0 }); }
  runs(query) { return this.get('/runs', query); }
  activeRuns() { return this.get('/runs/active'); }
  runDetail(id) { return this.get(`/runs/${enc(id)}`); }
  cancelRun(id) { return this.post(`/runs/${enc(id)}/cancel`); }
  resumeRun(id, answer) { return this.post(`/runs/${enc(id)}/resume`, answer); }
  deleteRun(id) { return this.del(`/runs/${enc(id)}`); }
  clearRuns(agentId) { return this.del('/runs', agentId ? { agentId } : undefined); }
  schedules() { return this.get('/schedules'); }
  memory(id, session) { return this.get(`/agents/${enc(id)}/memory`, session ? { session } : undefined); }
  clearMemory(id, session) { return this.del(`/agents/${enc(id)}/memory`, session ? { session } : undefined); }
  // models & keys
  credentials() { return this.get('/credentials'); }
  createCredential(data) { return this.post('/credentials', data); }
  updateCredential(id, patch) { return this.put(`/credentials/${enc(id)}`, patch); }
  deleteCredential(id) { return this.del(`/credentials/${enc(id)}`); }
  models(provider, credential) { return this.get('/models', { provider, credential }); }
  ollamaStatus() { return this.request('GET', '/ollama', { timeout: 15000 }); }
  ollamaJob() { return this.request('GET', '/ollama/job'); }
  ollamaInstall() { return this.request('POST', '/ollama/install', { body: {} }); }
  ollamaStart() { return this.request('POST', '/ollama/start', { body: {}, timeout: 60000 }); }
  ollamaPull(model) { return this.request('POST', '/ollama/pull', { body: { model } }); }
  /** A local model (Ollama, a compatible server) may load for minutes the first time: no time limit there. */
  testModel(model) { return this.request('POST', '/models/test', { body: { model }, timeout: /^(ollama|compatible):/.test(String(model)) ? 0 : 180000 }); }
  // knowledge
  kbs() { return this.get('/kbs'); }
  kb(id) { return this.get(`/kbs/${enc(id)}`); }
  createKb(data) { return this.post('/kbs', data); }
  updateKb(id, patch) { return this.patch(`/kbs/${enc(id)}`, patch); }
  deleteKb(id) { return this.del(`/kbs/${enc(id)}`); }
  addDoc(id, data) { return this.post(`/kbs/${enc(id)}/docs`, data); }
  docText(id, docId) { return this.get(`/kbs/${enc(id)}/docs/${enc(docId)}`); }
  deleteDoc(id, docId) { return this.del(`/kbs/${enc(id)}/docs/${enc(docId)}`); }
  searchKb(id, query) { return this.post(`/kbs/${enc(id)}/search`, { query }); }
  /** The event stream URL (EventSource cannot send headers: the token goes in the query). */
  async eventsUrl(query = {}) { const conn = await this.connection(); return `${conn.base.replace(/\/$/, '')}/events${queryString({ ...query, token: conn.token ?? undefined })}`; }
  /** The public webhook URL of an agent. */
  async hookUrl(agent) { const conn = await this.connection(); const base = conn.base.startsWith('http') ? conn.base : new URL(conn.base, location.href).href; return `${base.replace(/\/$/, '')}/hooks/${enc(agent.id)}/${enc(agent.hookSecret)}`; }
}

const enc = (value) => encodeURIComponent(String(value));

/**
 * The client for this window: desktop → the core the shell started (core_info), web → same origin.
 * `MYAGENTS_API` (window global or ?api=) overrides the base, for tests and a UI served apart from the core.
 */
export function createClient() {
  const override = globalThis.__MYAGENTS_API__ ?? new URLSearchParams(globalThis.location?.search ?? '').get('api');
  if (override) return new ApiClient({ base: String(override).replace(/\/$/, '') });
  if (inTauri()) {
    return new ApiClient({
      resolve: async () => {
        const info = await coreInfo();
        return { base: `${String(info.url).replace(/\/$/, '')}/api`, token: info.token };
      },
    });
  }
  return new ApiClient({ base: new URL('api', globalThis.location?.href ?? 'http://localhost/').pathname.replace(/\/$/, '') });
}

let shared = null;
/** The window's one client. */
export const api = () => (shared ??= createClient());
