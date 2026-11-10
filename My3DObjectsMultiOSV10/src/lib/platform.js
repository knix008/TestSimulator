// Thin abstraction over the two runtimes the app ships in:
//   • Desktop  — the Tauri app: native dialogs, real file paths, the OS
//                clipboard, settings mirrored to <config>/My3DObjects/settings.json
//                (window.desktopAPI, installed by ./desktop-bridge.js)
//   • Web      — <input type="file">, Blob downloads, the async Clipboard API,
//                settings in localStorage
import buildInfo from '../build-info.json';

export const api = typeof window !== 'undefined' ? window.desktopAPI : undefined;
export const isDesktop = !!(api && api.isDesktop);

// ── Opening ───────────────────────────────────────────────
function fileToPayload(file) {
  return file.arrayBuffer().then((buf) => ({
    data: new Uint8Array(buf),
    name: file.name,
    path: null,
    dir: null,
    size: file.size,
    mtime: file.lastModified,
  }));
}

export function filesToPayloads(files) {
  return Promise.all([...(files || [])].map(fileToPayload));
}

function pickFilesWeb(accept, multiple) {
  return new Promise((resolve) => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = accept;
    input.multiple = !!multiple;
    input.style.display = 'none';
    document.body.appendChild(input);
    input.addEventListener('change', async () => {
      const files = [...(input.files || [])];
      input.remove();
      resolve(files.length ? await filesToPayloads(files) : null);
    }, { once: true });
    input.click();
  });
}

// Shows the open dialog. `filters`: [{ name, extensions }]. Returns an array
// of { data, name, path, dir, size } or null. On the web every selected file
// is returned (a model and its textures can be picked together).
export async function openFilesDialog({ filters = [], defaultDir, multi = true } = {}) {
  if (!isDesktop) {
    const accept = filters.flatMap((f) => f.extensions.filter((e) => e !== '*').map((e) => `.${e}`)).join(',');
    return pickFilesWeb(accept, multi);
  }
  const picked = await api.openDialog({ defaultDir, multi, filters });
  if (!picked) return null;
  const paths = Array.isArray(picked) ? picked : [picked];
  const out = [];
  for (const p of paths) out.push(await readPath(p));
  return out;
}

export async function readPath(filePath) {
  if (!isDesktop) throw new Error('Reading by path is only available in the desktop app.');
  return api.readBinary({ filePath });
}

// A file next to `basePath` (a texture an OBJ refers to), or null.
export async function readSibling(basePath, rel) {
  if (!isDesktop || !basePath) return null;
  const dir = dirName(basePath);
  const sep = /\\/.test(basePath) ? '\\' : '/';
  const clean = String(rel).replace(/[\\/]/g, sep).replace(/^\.[\\/]/, '');
  const candidates = [`${dir}${sep}${clean}`, `${dir}${sep}${baseName(clean)}`];
  for (const p of candidates) {
    try {
      if (await api.exists(p)) return (await api.readBinary({ filePath: p })).data;
    } catch { /* try the next */ }
  }
  return null;
}

export async function pathExists(p) {
  if (!isDesktop) return false;
  try { return await api.exists(p); } catch { return false; }
}

export async function pickDirectory(defaultDir) {
  if (!isDesktop) return null;
  return api.pickDirectory({ defaultDir });
}

// ── Saving ────────────────────────────────────────────────
export async function saveBinary({ defaultName, defaultDir, bytes, filters }) {
  if (isDesktop) return api.saveBinary({ defaultName, defaultDir, data: bytes, filters });
  downloadBlob(new Blob([bytes]), defaultName);
  return defaultName;
}

export async function saveText({ defaultName, defaultDir, content, filters }) {
  const bytes = new TextEncoder().encode(String(content ?? ''));
  return saveBinary({ defaultName, defaultDir, bytes, filters });
}

export async function writeBinaryTo(filePath, bytes) {
  if (!isDesktop) throw new Error('Writing to a path is only available in the desktop app.');
  return api.writeBinary({ filePath, data: bytes });
}

function downloadBlob(blob, filename) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename || 'download';
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

// ── Clipboard ─────────────────────────────────────────────
export async function copyText(text) {
  if (isDesktop) return api.writeClipboardText(text);
  if (navigator.clipboard?.writeText) return navigator.clipboard.writeText(text);
  throw new Error('The clipboard is not available in this browser (a secure context is required).');
}

export async function copyImage(dataUrl) {
  if (isDesktop) return api.writeClipboardImage(dataUrl);
  if (!navigator.clipboard?.write || typeof ClipboardItem === 'undefined') {
    throw new Error('Copying images requires a browser with async Clipboard API support over HTTPS.');
  }
  const blob = await (await fetch(dataUrl)).blob();
  await navigator.clipboard.write([new ClipboardItem({ 'image/png': blob })]);
  return true;
}

// ── Shell ─────────────────────────────────────────────────
export async function openExternal(url) {
  if (isDesktop) return api.openExternal(url);
  window.open(url, '_blank', 'noopener,noreferrer');
  return true;
}

export async function showItemInFolder(p) {
  if (!isDesktop) return false;
  return api.showItem(p);
}

// ── Persisted application state ───────────────────────────
const STORE_KEY = 'my3dobjects-state';

export function readLocalState() {
  try { return JSON.parse(localStorage.getItem(STORE_KEY) || 'null'); } catch { return null; }
}

export function writeLocalState(state) {
  try { localStorage.setItem(STORE_KEY, JSON.stringify(state)); } catch { /* quota — ignore */ }
  if (isDesktop && api.saveSettings) api.saveSettings(state).catch(() => {});
}

export async function loadPersistedState() {
  if (isDesktop && api.loadSettings) {
    try {
      const disk = await api.loadSettings();
      if (disk && typeof disk === 'object') {
        try { localStorage.setItem(STORE_KEY, JSON.stringify(disk)); } catch { /* ignore */ }
        return disk;
      }
    } catch { /* fall back to localStorage */ }
  }
  return readLocalState();
}

// ── Misc ──────────────────────────────────────────────────
export async function appInfo() {
  if (isDesktop) return api.getInfo();
  return {
    version: buildInfo.version,
    platform: 'web',
    arch: navigator.platform || '',
    chrome: (/Chrome\/([\d.]+)/.exec(navigator.userAgent) || [])[1] || '',
  };
}

export function baseName(p) {
  if (!p) return '';
  return String(p).split(/[\\/]/).pop();
}

export function dirName(p) {
  if (!p) return '';
  const parts = String(p).split(/[\\/]/);
  parts.pop();
  return parts.join(/\\/.test(String(p)) ? '\\' : '/');
}

export function formatBytes(n) {
  if (!Number.isFinite(n)) return '';
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  if (n < 1024 * 1024 * 1024) return `${(n / 1024 / 1024).toFixed(1)} MB`;
  return `${(n / 1024 / 1024 / 1024).toFixed(2)} GB`;
}

export function formatDuration(sec) {
  const s = Number(sec) || 0;
  if (s < 60) return `${s.toFixed(1)} s`;
  const m = Math.floor(s / 60);
  return `${m}:${String(Math.round(s % 60)).padStart(2, '0')}`;
}
