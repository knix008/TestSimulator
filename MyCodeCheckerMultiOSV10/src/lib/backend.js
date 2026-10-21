// Web calls the Vite (or Node) /api. The Tauri shell injects window.__MCC_HOST__
// and the page calls the sidecar with its bearer token.

export const isDesktop = typeof window !== 'undefined' && !!(window.__TAURI_INTERNALS__ || window.__TAURI__);

function host() {
  return (typeof window !== 'undefined' && window.__MCC_HOST__) || null;
}

export async function call(name, args = {}) {
  const info = host();
  const url = info ? `http://127.0.0.1:${info.port}/api/${encodeURIComponent(name)}` : `./api/${encodeURIComponent(name)}`;
  const headers = { 'content-type': 'application/json' };
  if (info && info.token) headers.authorization = `Bearer ${info.token}`;
  const res = await fetch(url, { method: 'POST', headers, body: JSON.stringify(args || {}) });
  let body;
  try { body = await res.json(); } catch { throw new Error(`HTTP ${res.status}`); }
  if (!body || !body.ok) {
    const err = new Error(body && body.error ? body.error.message : `HTTP ${res.status}`);
    if (body && body.error) err.code = body.error.code;
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
  }).catch(() => {});
}

export function quitApp() {
  windowControl('close');
}
