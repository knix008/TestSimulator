// Web calls the Vite (or Node) /api. The Tauri shell injects window.__MCC_HOST__
// and the page calls the sidecar with its bearer token.

import { t } from './i18n';
import { track } from './progress';
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
  // Not loaded in this window either: stays undefined (useProjectIssues fetches the open project's).
  const fill = (a, b) => (a && a.issues === undefined && b && Array.isArray(b.issues) ? { ...a, issues: b.issues } : a);
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

/**
 * The window keeps the issues of the open project only: `ws` with project
 * `projectId` filled from project.issues ({ branches, desktop }) and every
 * other project's issue lists dropped (their memory goes).
 */
export function withProjectIssues(ws, projectId, got) {
  if (!ws) return ws;
  const drop = (a) => (a && Array.isArray(a.issues) ? { ...a, issueCount: a.issues.length, issues: undefined } : a);
  return {
    ...ws,
    projects: (ws.projects || []).map((p) => {
      const mine = p.id === projectId;
      const branches = {};
      for (const [name, b] of Object.entries(p.branches || {})) {
        if (!b || !b.latest) { branches[name] = b; continue; }
        branches[name] = { ...b, latest: mine ? (got && got.branches && Array.isArray(got.branches[name]) ? { ...b.latest, issues: got.branches[name] } : b.latest) : drop(b.latest) };
      }
      const desktop = p.desktop ? (mine ? (got && Array.isArray(got.desktop) ? { ...p.desktop, issues: got.desktop } : p.desktop) : drop(p.desktop)) : p.desktop;
      return { ...p, branches, ...(p.desktop ? { desktop } : {}) };
    }),
  };
}

/**
 * All issue lists of one project, fetched in pages of `page` issues:
 * { branches: { name: issues }, desktop: issues | null }. onProgress(done, total).
 */
export async function loadProjectIssues(project, { page = 20000, onProgress } = {}) {
  const parts = [...Object.entries(project.branches || {}).filter(([, b]) => b && b.latest).map(([name]) => name), ...(project.desktop ? [''] : [])];
  const total = parts.reduce((n, name) => n + (((name ? project.branches[name].latest : project.desktop) || {}).issueCount || 0), 0);
  let done = 0;
  const job = track(t('pp_issues', { name: project.name || '' }), { total });
  const out = { branches: {}, desktop: null };
  try {
  for (const name of parts) {
    const list = [];
    for (let offset = 0; ;) {
      const r = await call('project.issues', { projectId: project.id, branch: name, offset, limit: page });
      for (const i of r.issues) list.push(i);
      offset += r.issues.length;
      done += r.issues.length;
      if (onProgress) onProgress(done, Math.max(total, done));
      job.update(done, Math.max(total, done));
      if (!r.issues.length || offset >= r.total) break;
    }
    if (name) out.branches[name] = list; else out.desktop = list;
  }
  } finally { job.end(); }
  return out;
}

/** True when the project has an analysis whose issues this window has not loaded. */
export function missingIssues(project) {
  if (!project) return false;
  return Object.values(project.branches || {}).some((b) => b && b.latest && b.latest.issues === undefined) || !!(project.desktop && project.desktop.issues === undefined);
}

// Calls that run long show the progress popup with what is being done.
// Analyses and database exports have their own popups; polling is not work.
const UNTRACKED = /^(scan\.|db\.export|tools\.job|project\.issues$|workspace\.save$|settings\.patch$|dast\.status|lsp\.)/;
const WORK_LABEL = {
  'workspace.load': 'pp_workspace', 'report.export': 'pp_report', 'report.regulatory': 'pp_report', 'arch.graph': 'pp_arch', 'metrics.his': 'pp_his',
  'sca.scan': 'pp_sca', 'project.dirs': 'pp_dirs', 'issue.update': 'pp_saving', 'project.resetAnalysis': 'pp_saving', 'snapshot.compare': 'pp_snapshots', 'defect.lifecycle': 'pp_snapshots',
};

export async function call(name, args = {}) {
  // Only work worth naming (loading a project, a report …) shows; other calls stay quiet.
  if (UNTRACKED.test(name) || !WORK_LABEL[name] || (args && args.quiet)) return rawCall(name, args);
  const job = track(t(WORK_LABEL[name]));
  try { return await rawCall(name, args); } finally { job.end(); }
}

async function rawCall(name, args = {}) {
  const info = await hostAsync();
  const url = info ? `http://127.0.0.1:${info.port}/api/${encodeURIComponent(name)}` : `./api/${encodeURIComponent(name)}`;
  const headers = { 'content-type': 'application/json' };
  if (info && info.token) headers.authorization = `Bearer ${info.token}`;
  if (userToken) headers['x-mcc-user-token'] = userToken;
  let sent = name === 'workspace.save' ? withoutAnalyses(args) : (args || {});
  // Workspace answers never carry issue lists (the open project's come in pages,
  // loadProjectIssues): large projects are more JSON than one string can hold.
  if ((name === 'workspace.load' || name === 'workspace.save') && sent.slim === undefined && sent.issuesFor === undefined) sent = { ...sent, slim: true };
  const res = await fetch(url, { method: 'POST', headers, body: JSON.stringify(sent) });
  let body;
  try { body = await res.json(); } catch (e) {
    // The answer could not be read (for example more JSON than the page can parse).
    throw Object.assign(new Error(`${name}: HTTP ${res.status} — ${(e && e.message) || 'unreadable answer'}`), { code: 'BAD_RESPONSE' });
  }
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
