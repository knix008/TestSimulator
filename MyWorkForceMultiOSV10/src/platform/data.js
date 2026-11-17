const KEY = 'myworkforce-data-url';
const TOKEN = 'myworkforce-session';
const PROFILE = 'myworkforce-session-user';
const AUTO = 'myworkforce-autologin';
const OPEN = 'myworkforce-open';

function defaultDataUrl() {
  try {
    const host = globalThis.location?.hostname;
    if (host) return `http://${host}:1481`;
  } catch { /* opened without a page address */ }
  return 'http://127.0.0.1:1481';
}

export function dataUrl() {
  try {
    return (localStorage.getItem(KEY) || defaultDataUrl()).replace(/\/$/, '');
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
  if (!next) return;
  localStorage.setItem(KEY, next);
}

async function call(path, options = {}) {
  const token = sessionToken();
  const response = await fetch(`${dataUrl()}${path}`, {
    ...options,
    headers: { 'content-type': 'application/json', ...(token ? { authorization: `Bearer ${token}` } : {}), ...(options.headers || {}) },
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    const error = new Error(data.error || 'connect');
    error.detail = data.detail || '';
    throw error;
  }
  return data;
}

export const dataStatus = () => call('/api/status');
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
