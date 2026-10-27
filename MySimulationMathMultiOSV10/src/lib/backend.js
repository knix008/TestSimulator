// The host API (CONTRACT §6) as the page sees it. Web: the same origin's
// ./api/ (server/server.js or the Vite middleware). Desktop: the Rust host
// (src-tauri/src/host.rs) on 127.0.0.1 with a bearer token; the shell injects
// window.__MSM_HOST__ = { port, token, platform } and child windows ask for it
// with the host_info command.
export const isDesktop = typeof window !== 'undefined' && !!(window.__TAURI_INTERNALS__ || window.__TAURI__);

let hostAsk = null;
async function shellHost() {
  if (typeof window === 'undefined') return null;
  if (window.__MSM_HOST__) return window.__MSM_HOST__;
  if (!isDesktop) return null;
  if (!hostAsk) {
    hostAsk = import('@tauri-apps/api/core').then((m) => m.invoke('host_info')).then((h) => { window.__MSM_HOST__ = h; return h; }).catch(() => null);
  }
  return hostAsk;
}

/** { base, token }: where the API answers (absolute URL, ends with "/"). */
export async function apiEndpoint() {
  const h = await shellHost();
  if (h && h.port) return { base: `http://127.0.0.1:${h.port}/api/`, token: h.token || '' };
  return { base: new URL('./api/', window.location.href).href, token: '' };
}

export async function api(name, args = {}) {
  const { base, token } = await apiEndpoint();
  const headers = { 'content-type': 'application/json' };
  if (token) headers.authorization = `Bearer ${token}`;
  let res;
  try {
    res = await fetch(`${base}${name}`, { method: 'POST', headers, body: JSON.stringify(args || {}) });
  } catch (e) {
    throw Object.assign(new Error(`The file service did not answer (${(e && e.message) || e}).`), { code: 'EIO' });
  }
  let body;
  try { body = await res.json(); } catch {
    throw Object.assign(new Error(`${name}: HTTP ${res.status}`), { code: 'BAD_RESPONSE' });
  }
  if (!body || !body.ok) {
    const e = (body && body.error) || {};
    throw Object.assign(new Error(e.message || `HTTP ${res.status}`), { code: e.code || 'EIO' });
  }
  return body.data;
}

let infoCache = null;
/** platform, start folder, home, temp, whether system() works, version, jail. */
export function hostInfo() {
  if (!infoCache) infoCache = api('host/info').catch((e) => { infoCache = null; throw e; });
  return infoCache;
}

/** Asynchronous file calls for the GUI (the engine has its own synchronous ones). */
export const fsApi = {
  list: (path) => api('fs/list', { path }),
  stat: (path) => api('fs/stat', { path }),
  exists: (path) => api('fs/exists', { path }),
  readText: (path) => api('fs/readText', { path }),
  writeText: (path, text) => api('fs/writeText', { path, text }),
  readBytes: async (path) => {
    const { base64 } = await api('fs/readBytes', { path });
    const bin = atob(base64 || '');
    const out = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
    return out;
  },
  writeBytes: (path, bytes) => {
    let s = '';
    for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
    return api('fs/writeBytes', { path, base64: btoa(s) });
  },
  mkdir: (path) => api('fs/mkdir', { path }),
  remove: (path, recursive = false) => api('fs/remove', { path, recursive }),
  rename: (from, to) => api('fs/rename', { from, to }),
  copy: (from, to) => api('fs/copy', { from, to }),
};

export const loadSettings = () => api('settings/get').catch(() => ({}));
export const storeSettings = (settings) => api('settings/set', { settings });

// ── Paths ("/" separators everywhere) ──────────────────────
export const joinPath = (dir, name) => `${String(dir).replace(/\/+$/, '')}/${name}`.replace(/^\/\//, '/');
export const baseName = (p) => String(p || '').replace(/\/+$/, '').split('/').pop() || String(p || '');
export function dirName(p) {
  const s = String(p || '').replace(/\/+$/, '');
  const i = s.lastIndexOf('/');
  if (i < 0) return s;
  if (i === 0) return '/';
  if (/^[A-Za-z]:$/.test(s.slice(0, i))) return `${s.slice(0, i)}/`;
  return s.slice(0, i);
}
export const extOf = (p) => { const b = baseName(p); const i = b.lastIndexOf('.'); return i > 0 ? b.slice(i).toLowerCase() : ''; };

// ── Native dialogs (desktop) ───────────────────────────────
export async function pickFolder({ defaultPath } = {}) {
  if (!isDesktop) return null;
  try {
    const { open } = await import('@tauri-apps/plugin-dialog');
    const picked = await open({ directory: true, multiple: false, defaultPath: defaultPath || undefined });
    return typeof picked === 'string' ? picked.replace(/\\/g, '/') : null;
  } catch { return null; }
}

export async function pickFile({ filters, defaultPath, multiple = false } = {}) {
  if (!isDesktop) return null;
  try {
    const { open } = await import('@tauri-apps/plugin-dialog');
    const picked = await open({ directory: false, multiple, filters, defaultPath: defaultPath || undefined });
    if (Array.isArray(picked)) return picked.map((p) => p.replace(/\\/g, '/'));
    return typeof picked === 'string' ? picked.replace(/\\/g, '/') : null;
  } catch { return null; }
}

export async function pickSavePath({ defaultPath, filters } = {}) {
  if (!isDesktop) return null;
  try {
    const { save } = await import('@tauri-apps/plugin-dialog');
    const picked = await save({ defaultPath: defaultPath || undefined, filters });
    return typeof picked === 'string' ? picked.replace(/\\/g, '/') : null;
  } catch { return null; }
}

// ── Window ─────────────────────────────────────────────────
export function windowControl(action) {
  if (!isDesktop) {
    if (action === 'close') window.close();
    return;
  }
  import('@tauri-apps/api/window').then(({ getCurrentWindow }) => {
    const win = getCurrentWindow();
    if (action === 'minimize') win.minimize();
    else if (action === 'maximize') win.toggleMaximize();
    else if (action === 'close') win.close();
    else if (action === 'destroy') win.destroy();
    else if (action === 'resize') Promise.resolve(win.startResizeDragging('SouthEast')).catch(() => {});
  }).catch(() => {});
}

export function openExternal(url) {
  if (!url) return;
  if (!isDesktop) { window.open(url, '_blank', 'noopener'); return; }
  import('@tauri-apps/plugin-opener').then((m) => m.openUrl(url)).catch(() => { window.open(url, '_blank', 'noopener'); });
}

/** Windows: whether .m files open with this app (per user); null elsewhere. */
export async function mAssociation() {
  if (!isDesktop) return null;
  try { return await (await import('@tauri-apps/api/core')).invoke('m_association'); } catch { return null; }
}

export async function setMAssociation(on) {
  if (!isDesktop) return false;
  try { return await (await import('@tauri-apps/api/core')).invoke('set_m_association', { on: !!on }); } catch { return false; }
}
