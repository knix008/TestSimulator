// Web calls the Vite (or Node) /api. The Tauri shell injects window.__MCC_HOST__
// and the page calls the sidecar with its bearer token.

export const isDesktop = typeof window !== 'undefined' && !!(window.__TAURI_INTERNALS__ || window.__TAURI__);

function host() {
  return (typeof window !== 'undefined' && window.__MCC_HOST__) || null;
}

// Child windows (popups, settings) do not get __MCC_HOST__ injected: ask the
// shell once with the host_info command.
let hostAsk = null;
async function hostAsync() {
  const info = host();
  if (info || !isDesktop) return info;
  if (!hostAsk) {
    hostAsk = import('@tauri-apps/api/core').then((m) => m.invoke('host_info')).then((h) => { window.__MCC_HOST__ = h; return h; }).catch(() => null);
  }
  return hostAsk;
}

// Session token from security.login, sent while permissions are on.
let userToken = '';
try { userToken = sessionStorage.getItem('mcc-user-token') || ''; } catch { /* storage blocked */ }

export function setUserToken(token) {
  userToken = token || '';
  try {
    if (userToken) sessionStorage.setItem('mcc-user-token', userToken);
    else sessionStorage.removeItem('mcc-user-token');
  } catch { /* storage blocked */ }
}

export function hasUserToken() {
  return !!userToken;
}

// The server keeps analyses as scans wrote them; sending them back would only
// make the request huge (a large project's issues exceed the body limit).
function withoutAnalyses(args) {
  const ws = args && args.workspace;
  if (!ws || !Array.isArray(ws.projects)) return args || {};
  return { ...args, workspace: { ...ws, projects: ws.projects.map(({ branches, desktop, ...p }) => p) } };
}

/**
 * A slim workspace (workspace.load / workspace.save with slim: true) with the
 * issue lists taken from `prev` (the workspace this window has). Saves never
 * change issues, so the window keeps its own instead of receiving them again.
 */
export function withIssuesFrom(slim, prev) {
  if (!slim || !slim.slim) return slim;
  const old = new Map(((prev && prev.projects) || []).map((p) => [p.id, p]));
  const fill = (a, b) => (a && a.issues === undefined ? { ...a, issues: (b && Array.isArray(b.issues) && b.issues) || [] } : a);
  const { slim: _, ...ws } = slim;
  return {
    ...ws,
    projects: (ws.projects || []).map((p) => {
      const o = old.get(p.id) || {};
      const branches = {};
      for (const [name, b] of Object.entries(p.branches || {})) branches[name] = b && b.latest ? { ...b, latest: fill(b.latest, o.branches && o.branches[name] && o.branches[name].latest) } : b;
      return { ...p, branches, ...(p.desktop ? { desktop: fill(p.desktop, o.desktop) } : {}) };
    }),
  };
}

export async function call(name, args = {}) {
  const info = await hostAsync();
  const url = info ? `http://127.0.0.1:${info.port}/api/${encodeURIComponent(name)}` : `./api/${encodeURIComponent(name)}`;
  const headers = { 'content-type': 'application/json' };
  if (info && info.token) headers.authorization = `Bearer ${info.token}`;
  if (userToken) headers['x-mcc-user-token'] = userToken;
  const res = await fetch(url, { method: 'POST', headers, body: JSON.stringify(name === 'workspace.save' ? withoutAnalyses(args) : (args || {})) });
  let body;
  try { body = await res.json(); } catch { throw new Error(`HTTP ${res.status}`); }
  if (!body || !body.ok) {
    const err = new Error(body && body.error ? body.error.message : `HTTP ${res.status}`);
    if (body && body.error) {
      err.code = body.error.code;
      if (body.error.text) err.text = body.error.text;
      // Extra details (projectId, projectName…) come along.
      for (const [k, v] of Object.entries(body.error)) if (!(k in err)) err[k] = v;
    }
    // Permissions were turned on or the session ended: the app shows the login screen.
    if (err.code === 'UNAUTHORIZED' && name !== 'security.login' && typeof window !== 'undefined') window.dispatchEvent(new Event('mcc-unauthorized'));
    throw err;
  }
  return body.data;
}

export async function pickFolder() {
  if (!isDesktop) return null;
  try {
    const { open } = await import('@tauri-apps/plugin-dialog');
    const picked = await open({ directory: true, multiple: false });
    return typeof picked === 'string' ? picked : null;
  } catch {
    return null;
  }
}

export async function pickFile({ filters } = {}) {
  if (!isDesktop) return null;
  try {
    const { open } = await import('@tauri-apps/plugin-dialog');
    const picked = await open({ directory: false, multiple: false, filters });
    return typeof picked === 'string' ? picked : null;
  } catch {
    return null;
  }
}

export async function pickSavePath({ defaultPath, filters } = {}) {
  if (!isDesktop) return null;
  try {
    const { save } = await import('@tauri-apps/plugin-dialog');
    const picked = await save({ defaultPath: defaultPath || undefined, filters });
    return typeof picked === 'string' ? picked : null;
  } catch {
    return null;
  }
}

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
    else if (action === 'resize') Promise.resolve(win.startResizeDragging('SouthEast')).catch(() => {});
  }).catch(() => {});
}

// Opens a web page in the user's browser (desktop: system opener).
export function openExternal(url) {
  if (!url) return;
  if (!isDesktop) { window.open(url, '_blank', 'noopener'); return; }
  import('@tauri-apps/plugin-opener').then((m) => m.openUrl(url)).catch(() => { window.open(url, '_blank', 'noopener'); });
}

export function quitApp() {
  windowControl('close');
}
