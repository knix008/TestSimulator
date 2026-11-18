const KEY = 'myworkforce-data-url';
const TOKEN = 'myworkforce-session';
const PROFILE = 'myworkforce-session-user';
const AUTO = 'myworkforce-autologin';
const OPEN = 'myworkforce-open';

const LOCAL_SERVICE = 'http://127.0.0.1:1481';

/** The desktop program's own page (tauri.localhost on Windows, tauri:// elsewhere), not a web page. */
function desktopPage() {
  try {
    const { hostname = '', protocol = '' } = globalThis.location || {};
    return Boolean(globalThis.__TAURI_INTERNALS__) || protocol === 'tauri:' || /(^|\.)tauri\.localhost$/i.test(hostname);
  } catch {
    return false;
  }
}

/**
 * Where the data service is. The installed program starts one on this computer, so the desktop window
 * always uses 127.0.0.1; a web page uses the computer it was loaded from.
 */
function defaultDataUrl() {
  if (desktopPage()) return LOCAL_SERVICE;
  try {
    const host = globalThis.location?.hostname;
    if (host) return `http://${host}:1481`;
  } catch { /* opened without a page address */ }
  return LOCAL_SERVICE;
}

/** An address built from the desktop page's own host by an older version: it never reaches the service. */
function unusable(url) {
  return /^https?:\/\/([^/]*\.)?tauri\.localhost(:|\/|$)/i.test(String(url || ''));
}

export function dataUrl() {
  try {
    const saved = localStorage.getItem(KEY) || '';
    if (saved && unusable(saved)) localStorage.removeItem(KEY);
    return ((saved && !unusable(saved) ? saved : '') || defaultDataUrl()).replace(/\/$/, '');
  } catch {
    return defaultDataUrl();
  }
}

export function sessionToken() {
  try {
    const shared = localStorage.getItem(TOKEN) || '';
    const tab = sessionStorage.getItem(TOKEN) || '';
    if (shared !== tab) {
      if (shared) sessionStorage.setItem(TOKEN, shared);
      else sessionStorage.removeItem(TOKEN);
    }
    return shared;
  } catch { return ''; }
}

export function rememberSession(token) {
  try {
    if (token) {
      sessionStorage.setItem(TOKEN, token);
      localStorage.setItem(TOKEN, token);
    } else {
      sessionStorage.removeItem(TOKEN);
      localStorage.removeItem(TOKEN);
      localStorage.removeItem(PROFILE);
    }
  } catch { /* the browser kept the page from storing the session */ }
}

export function rememberProfile(user) {
  try {
    if (user?.id) localStorage.setItem(PROFILE, JSON.stringify({ id: user.id, name: user.name || '', login: user.login || '' }));
    else localStorage.removeItem(PROFILE);
  } catch { /* the other program still follows the token */ }
}

export function sessionProfile() {
  try { return JSON.parse(localStorage.getItem(PROFILE) || 'null'); } catch { return null; }
}

export function savedLogin() {
  try {
    const saved = JSON.parse(localStorage.getItem(AUTO) || 'null');
    return saved?.account ? saved : null;
  } catch { return null; }
}

export function rememberLogin(account, password) {
  try { localStorage.setItem(AUTO, JSON.stringify({ account, password: password || '' })); } catch { /* automatic sign-in stays off */ }
}

export function clearSavedLogin() {
  try { localStorage.removeItem(AUTO); } catch { /* already clear */ }
}

export function requestMain(target) {
  const payload = { ...(target || {}), at: Date.now() };
  try { localStorage.setItem(OPEN, JSON.stringify(payload)); } catch { /* opened without storage */ }
  return payload;
}

export function readMainRequest() {
  try {
    const raw = localStorage.getItem(OPEN);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!parsed?.at || Date.now() - Number(parsed.at) > 20000) return null;
    return parsed;
  } catch { return null; }
}

export function clearMainRequest(at) {
  try {
    const raw = localStorage.getItem(OPEN);
    if (!raw) return;
    const parsed = JSON.parse(raw);
    if (!at || parsed?.at === at) localStorage.removeItem(OPEN);
  } catch { /* already clear */ }
}

export function watchMainRequest(onChange) {
  try {
    window.addEventListener('storage', (event) => {
      if (event.key === OPEN && event.newValue) onChange();
    });
  } catch { /* opened without a window */ }
}

export function watchSharedSession(onChange) {
  const fire = () => onChange(sessionToken());
  try {
    window.addEventListener('storage', (event) => {
      if (!event.key || event.key === TOKEN || event.key === PROFILE) fire();
    });
  } catch { /* opened without a window */ }
  setInterval(fire, 1000);
}

export function rememberDataUrl(url) {
  const next = String(url || '').trim().replace(/\/$/, '');
  if (!next || unusable(next)) return;
  // The default is not pinned, so it can follow where the program runs; only a chosen server is kept.
  try {
    if (next === defaultDataUrl()) localStorage.removeItem(KEY);
    else localStorage.setItem(KEY, next);
  } catch { /* storage is off: the default is used */ }
}

async function call(path, options = {}) {
  const token = sessionToken();
  let response;
  try {
    response = await fetch(`${dataUrl()}${path}`, {
      ...options,
      headers: { 'content-type': 'application/json', ...(token ? { authorization: `Bearer ${token}` } : {}), ...(options.headers || {}) },
    });
  } catch (cause) {
    // Nothing answered at all (not started yet, stopped, or a wrong address).
    const error = new Error('service');
    error.detail = `${dataUrl()} · ${cause?.message || cause}`;
    throw error;
  }
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    const error = new Error(data.error || 'connect');
    error.detail = data.detail || '';
    // What else the service said (a failed sign-in: tries left, or until when the account waits).
    error.info = data;
    error.status = response.status;
    throw error;
  }
  return data;
}

export const dataStatus = () => call('/api/status');

/** Waits until the data service answers (the installed program starts it together with the window). */
export async function waitForService(timeoutMs = 20000) {
  const until = Date.now() + timeoutMs;
  for (;;) {
    try {
      return await dataStatus();
    } catch (error) {
      if (error?.message !== 'service' || Date.now() > until) throw error;
      await new Promise((resolve) => setTimeout(resolve, 400));
    }
  }
}
export const connectData = (config) => call('/api/connect', { method: 'POST', body: JSON.stringify(config || { engine: 'sqlite' }) });
export const loadWorkspace = () => call('/api/workspace');
export const saveWorkspace = (workspace) => call('/api/workspace', { method: 'PUT', body: JSON.stringify({ workspace, revision: Number(workspace?.revision) || 0 }) });
export async function loginSession(account, password) {
  const data = await call('/api/session', { method: 'POST', body: JSON.stringify({ account, password }) });
  rememberSession(data.token);
  rememberProfile(data.user);
  return data;
}
export const currentSession = () => call('/api/session');
export function logoutSession() {
  const done = call('/api/session', { method: 'DELETE' }).catch(() => {});
  rememberSession('');
  return done;
}
export const unlockData = (userId, password) => call('/api/unlock', { method: 'POST', body: JSON.stringify({ userId, password }) });
export const changeOwnPassword = (current, next) => call('/api/account/password', { method: 'POST', body: JSON.stringify({ current, next }) });
export const setUserPassword = (userId, password, mustChange = true) => call('/api/users/password', { method: 'POST', body: JSON.stringify({ userId, password, mustChange }) });
export const testConnection = (config) => call('/api/connect/test', { method: 'POST', body: JSON.stringify(config || { engine: 'sqlite' }) });
export const encryptionKey = () => call('/api/encryption?reveal=1');
export const signInLocks = () => call('/api/lockouts');
/** The audit log, newest first: { category, action, actor, from, to, q, limit }. */
export const auditLog = (filter = {}) => {
  const query = new URLSearchParams(Object.entries(filter).filter(([, value]) => value !== '' && value != null).map(([key, value]) => [key, String(value)]));
  return call(`/api/audit${query.toString() ? `?${query}` : ''}`);
};
export const releaseSignInLock = (account) => call('/api/lockouts', { method: 'POST', body: JSON.stringify({ account }) });
export const schemaStatus = () => call('/api/schema');
export const upgradeSchema = () => call('/api/schema', { method: 'POST', body: JSON.stringify({ action: 'upgrade' }) });
export const schemaSql = (engine) => call(`/api/schema/sql?engine=${encodeURIComponent(engine || '')}`);
export const hashPassword = (password) => call('/api/password', { method: 'POST', body: JSON.stringify({ password }) });
export const sendTestMail = (to) => call('/api/mail/test', { method: 'POST', body: JSON.stringify({ to }) });
export const chatPeople = () => call('/api/chat/people');
export const chatProfile = (id) => call(`/api/chat/profile?id=${encodeURIComponent(id)}`);
export const saveChatProfile = (body) => call('/api/chat/profile', { method: 'PUT', body: JSON.stringify(body || {}) });
export const chatRooms = () => call('/api/chat/rooms');
export const openChat = (body) => call('/api/chat/rooms', { method: 'POST', body: JSON.stringify(body || {}) });
export const inviteChat = (roomId, members) => call('/api/chat/members', { method: 'POST', body: JSON.stringify({ roomId, members }) });
export const chatMessages = (room, after = '') => call(`/api/chat/messages?room=${encodeURIComponent(room)}&after=${encodeURIComponent(after)}`);
export const postChat = (roomId, body) => call('/api/chat/messages', { method: 'POST', body: JSON.stringify({ roomId, body }) });
export const checkChat = (messageId) => call('/api/chat/checks', { method: 'POST', body: JSON.stringify({ messageId }) });
export const postChatFile = (roomId, name, mime, data) => call('/api/chat/files', { method: 'POST', body: JSON.stringify({ roomId, name, mime, data }) });
export async function fetchChatFile(id) {
  const token = sessionToken();
  const response = await fetch(`${dataUrl()}/api/chat/files/${encodeURIComponent(id)}`, { headers: token ? { authorization: `Bearer ${token}` } : {} });
  if (!response.ok) throw new Error('not-found');
  return response.blob();
}

/** Writing a page together: send the text you have (with the version it started from); get the merged text. */
export const livePage = (body) => call('/api/live/page', { method: 'POST', body: JSON.stringify(body || {}) });
export const leavePage = (pageId) => call('/api/live/leave', { method: 'POST', body: JSON.stringify({ pageId }), keepalive: true });
