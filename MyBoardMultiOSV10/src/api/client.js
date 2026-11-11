// HTTP client of the core (ARCHITECTURE.md §5). One instance per window.
//
// Desktop: the shell started the core (src-tauri/src/core.rs); `core_info` gives its base URL and
// token, sent as `Authorization: Bearer <token>`. Web: the page and the API share the origin; the
// session cookie `myboard_session` goes along (credentials: 'same-origin').
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
  async request(method, path, { body, query, headers = {}, raw = false, signal = null } = {}) {
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
    const timer = this.timeout ? setTimeout(() => controller.abort(new Error('timeout')), this.timeout) : null;
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
        const err = new ApiError(`No MyBoard core answered (HTTP ${response.status})`, { code: 'unreachable', status: response.status });
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
  // auth
  async login(username, password) { const out = await this.post('/auth/login', { username, password }); this.session = out?.token ?? out?.session?.token ?? this.session; return out; }
  /** First start of a web server without users: creates the administrator (and signs in). */
  async setup(data) { const out = await this.post('/auth/setup', data); this.session = out?.token ?? out?.session?.token ?? this.session; return out; }
  async logout() { try { return await this.post('/auth/logout'); } finally { this.session = null; } }
  me() { return this.get('/auth/me'); }
  changePassword(oldPassword, newPassword) { return this.post('/auth/password', { oldPassword, newPassword }); }
  // database (desktop / admin)
  dbConfig() { return this.get('/db/config'); }
  dbTest(config) { return this.post('/db/test', config); }
  dbSwitch(config) { return this.post('/db/switch', config); }
  dbCopy(config) { return this.post('/db/copy', config); }
  // users
  users(query) { return this.get('/users', query); }
  user(id) { return this.get(`/users/${enc(id)}`); }
  createUser(data) { return this.post('/users', data); }
  updateUser(id, patch) { return this.patch(`/users/${enc(id)}`, patch); }
  deleteUser(id) { return this.del(`/users/${enc(id)}`); }
  // icons (§4)
  icons(query) { return this.get('/icons', query); }
  /** Uploads a picture: { name, mime, data (base64) } → the icon row ({ id, … }). */
  uploadIcon({ name, mime, data }) { return this.post('/icons', { name, mime, data }); }
  deleteIcon(id) { return this.del(`/icons/${enc(id)}`); }
  iconUrl(id) { return this.url(`/icons/${enc(id)}`); }
  // projects
  projects(query) { return this.get('/projects', query); }
  project(id) { return this.get(`/projects/${enc(id)}`); }
  createProject(data) { return this.post('/projects', data); }
  updateProject(id, patch) { return this.patch(`/projects/${enc(id)}`, patch); }
  deleteProject(id) { return this.del(`/projects/${enc(id)}`); }
  /** /projects/:id/{members,types,statuses,workflows,transitions,components,versions,fields,automation} */
  projectPart(id, part, query) { return this.get(`/projects/${enc(id)}/${part}`, query); }
  createProjectPart(id, part, data) { return this.post(`/projects/${enc(id)}/${part}`, data); }
  updateProjectPart(id, part, partId, patch) { return this.patch(`/projects/${enc(id)}/${part}/${enc(partId)}`, patch); }
  deleteProjectPart(id, part, partId) { return this.del(`/projects/${enc(id)}/${part}/${enc(partId)}`); }
  priorities() { return this.get('/priorities'); }
  resolutions() { return this.get('/resolutions'); }
  // issues
  issues(query) { return this.get('/issues', query); }
  issue(idOrKey) { return this.get(`/issues/${enc(idOrKey)}`); }
  createIssue(data) { return this.post('/issues', data); }
  updateIssue(idOrKey, patch) { return this.patch(`/issues/${enc(idOrKey)}`, patch); }
  deleteIssue(idOrKey) { return this.del(`/issues/${enc(idOrKey)}`); }
  transition(id, data) { return this.post(`/issues/${enc(id)}/transition`, data); }
  move(id, data) { return this.post(`/issues/${enc(id)}/move`, data); }
  bulk(data) { return this.post('/issues/bulk', data); }
  /** /issues/:id/{comments,attachments,worklogs,links,checklist,watchers,votes,history} */
  issuePart(id, part, query) { return this.get(`/issues/${enc(id)}/${part}`, query); }
  createIssuePart(id, part, data) { return this.post(`/issues/${enc(id)}/${part}`, data); }
  updateIssuePart(id, part, partId, patch) { return this.patch(`/issues/${enc(id)}/${part}/${enc(partId)}`, patch); }
  deleteIssuePart(id, part, partId) { return this.del(`/issues/${enc(id)}/${part}/${enc(partId)}`); }
  // boards
  boards(query) { return this.get('/boards', query); }
  board(id) { return this.get(`/boards/${enc(id)}`); }
  boardData(id, query) { return this.get(`/boards/${enc(id)}/data`, query); }
  createBoard(data) { return this.post('/boards', data); }
  updateBoard(id, patch) { return this.patch(`/boards/${enc(id)}`, patch); }
  deleteBoard(id) { return this.del(`/boards/${enc(id)}`); }
  /** /boards/:id/{columns,swimlanes,quickfilters,cardcolors} */
  boardPart(id, part, query) { return this.get(`/boards/${enc(id)}/${part}`, query); }
  // search
  validateJql(jql) { return this.post('/jql/validate', { jql }); }
  suggestJql(text, caret) { return this.get('/jql/suggest', { text, caret }); }
  filters(query) { return this.get('/filters', query); }
  // reports
  report(kind, query) { return this.get(`/reports/${kind}`, query); }
  // dashboards, notifications
  dashboards(query) { return this.get('/dashboards', query); }
  notifications(query) { return this.get('/notifications', query); }
  markNotificationsRead(ids) { return this.post('/notifications/read', { ids }); }
  /** The three sample projects (admin): { projects: [{ id, key, name, boardId, issueCount }], users }. */
  createSamples(language = 'en') { return this.post('/samples', { language }); }
  // exchange
  exportProject(id) { return this.get(`/projects/${enc(id)}/export`); }
  importMyBoard(data) { return this.post('/import/myboard', data); }
  importCsv(data) { return this.post('/import/csv', data); }
  importTrello(data) { return this.post('/import/trello', data); }
}

const enc = (value) => encodeURIComponent(String(value));

/**
 * The client for this window: desktop → the core the shell started (core_info), web → same origin.
 * `MYBOARD_API` (window global or ?api=) overrides the base, for tests and a UI served apart from the core.
 */
export function createClient() {
  const override = globalThis.__MYBOARD_API__ ?? new URLSearchParams(globalThis.location?.search ?? '').get('api');
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
