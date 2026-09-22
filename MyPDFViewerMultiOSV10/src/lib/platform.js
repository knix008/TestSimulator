// Thin abstraction over the two runtimes the app ships in:
//   • Electron — native dialogs, real filesystem paths, OS clipboard, settings
//                mirrored to userData/settings.json
//   • Web      — <input type="file">, Blob downloads, the async Clipboard API,
//                settings in localStorage
//
// Every long-running operation (open / save / download) reports progress so the
// UI can put a progress dialog in front of the user.
export const api = typeof window !== 'undefined' ? window.electronAPI : undefined;
export const isElectron = !!(api && api.isElectron);

// ── Progress plumbing ─────────────────────────────────────
const progressHandlers = new Map();
let taskSeq = 0;

if (isElectron && api.onProgress) {
  api.onProgress(({ id, done, total }) => {
    const cb = progressHandlers.get(id);
    if (cb) cb({ done, total });
  });
}

function withTask(onProgress) {
  const id = `t${++taskSeq}`;
  if (onProgress) progressHandlers.set(id, onProgress);
  return { id, release: () => progressHandlers.delete(id) };
}

// ── Opening ───────────────────────────────────────────────

// Web-only: prompts with a file picker and reads the chosen file.
function pickFileWeb(accept) {
  return new Promise((resolve) => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = accept;
    input.style.display = 'none';
    document.body.appendChild(input);
    // `cancel` is not reliable across browsers; a null resolve on blur+timeout
    // would race the change event, so we simply resolve on change only.
    input.addEventListener('change', async () => {
      const file = input.files?.[0];
      input.remove();
      if (!file) { resolve(null); return; }
      const buf = await file.arrayBuffer();
      resolve({
        data: new Uint8Array(buf),
        name: file.name,
        path: null,
        dir: null,
        size: file.size,
        mtime: file.lastModified,
      });
    }, { once: true });
    input.click();
  });
}

// Opens a PDF (or .pdfvw workspace). Returns { data, name, path, dir, size }
// or null when the user cancels.
export async function openFileDialog({ defaultDir, onProgress } = {}) {
  if (!isElectron) return pickFileWeb('.pdf,.pdfvw,application/pdf');
  const filePath = await api.openPdfDialog({ defaultDir });
  if (!filePath) return null;
  return readPath(filePath, { onProgress });
}

// Reads a file by absolute path (Electron only — recent files, file
// associations, drag & drop of a real path).
export async function readPath(filePath, { onProgress } = {}) {
  if (!isElectron) throw new Error('Reading by path is only available in the desktop app.');
  const { id, release } = withTask(onProgress);
  try {
    return await api.readBinary({ filePath, id });
  } finally {
    release();
  }
}

export async function pathExists(p) {
  if (!isElectron) return false;
  try { return await api.exists(p); } catch { return false; }
}

export async function pickDirectory(defaultDir) {
  if (!isElectron) return null;
  return api.pickDirectory({ defaultDir });
}

// ── Saving ────────────────────────────────────────────────
export async function saveBinary({ defaultName, defaultDir, bytes, filters, onProgress }) {
  if (isElectron) {
    const { id, release } = withTask(onProgress);
    try {
      return await api.saveBinary({ defaultName, defaultDir, data: bytes, filters, id });
    } finally {
      release();
    }
  }
  const total = bytes.byteLength ?? bytes.length ?? 0;
  onProgress?.({ done: total, total });
  downloadBlob(new Blob([bytes]), defaultName);
  return defaultName;
}

export async function saveText({ defaultName, defaultDir, content, filters, onProgress }) {
  if (isElectron) {
    onProgress?.({ done: 0, total: content.length });
    const p = await api.saveText({ defaultName, defaultDir, content, filters });
    onProgress?.({ done: content.length, total: content.length });
    return p;
  }
  onProgress?.({ done: content.length, total: content.length });
  downloadBlob(new Blob([content], { type: 'text/plain;charset=utf-8' }), defaultName);
  return defaultName;
}

// Writes to a known path without a dialog (workspace "Save", not "Save as").
export async function writeTextTo(filePath, content) {
  if (!isElectron) throw new Error('Writing to a path is only available in the desktop app.');
  return api.writeText({ filePath, content });
}

export async function writeBinaryTo(filePath, bytes) {
  if (!isElectron) throw new Error('Writing to a path is only available in the desktop app.');
  return api.writeBinary({ filePath, data: bytes });
}

// Any file, used to attach a document to the current PDF page.
export function pickAnyFile() {
  return new Promise((resolve) => {
    const input = document.createElement('input');
    input.type = 'file';
    input.style.display = 'none';
    document.body.appendChild(input);
    input.addEventListener('change', async () => {
      const file = input.files?.[0];
      input.remove();
      if (!file) { resolve(null); return; }
      const buf = await file.arrayBuffer();
      resolve({
        data: new Uint8Array(buf),
        name: file.name,
        mime: file.type || 'application/octet-stream',
        size: file.size,
      });
    }, { once: true });
    input.click();
  });
}

// Two-step save, for data whose encoding depends on the chosen file type:
// ask for the destination first, then encode, then write. Returns null when
// the user cancels. On the web there is no path to pick, so `encode` is called
// with the caller's preferred format and the result is downloaded.
export async function saveEncoded({ defaultName, defaultDir, filters, encode, fallbackExt, onProgress }) {
  if (isElectron) {
    const filePath = await api.pickSavePath({ defaultName, defaultDir, filters });
    if (!filePath) return null;
    const ext = (filePath.split('.').pop() || '').toLowerCase();
    const bytes = await encode(ext);
    const { id, release } = withTask(onProgress);
    try {
      await api.writeBinary({ filePath, data: bytes, id });
      return filePath;
    } finally {
      release();
    }
  }
  const bytes = await encode(fallbackExt);
  const total = bytes.byteLength ?? bytes.length ?? 0;
  onProgress?.({ done: total, total });
  downloadBlob(new Blob([bytes]), defaultName);
  return defaultName;
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

// ── Downloading ───────────────────────────────────────────
// Fetches a PDF from a URL. Electron goes through the main process (no CORS
// restrictions); the web build uses fetch() and is therefore subject to the
// remote server's CORS policy.
export async function downloadUrl(url, { onProgress } = {}) {
  if (isElectron) {
    const { id, release } = withTask(onProgress);
    try {
      return await api.download({ url, id });
    } finally {
      release();
    }
  }
  const res = await fetch(url);
  if (!res.ok) throw new Error(`HTTP ${res.status} ${res.statusText} — ${url}`);
  const total = Number(res.headers.get('content-length') || 0);
  const reader = res.body.getReader();
  const chunks = [];
  let done = 0;
  for (;;) {
    const { done: finished, value } = await reader.read();
    if (finished) break;
    chunks.push(value);
    done += value.length;
    onProgress?.({ done, total });
  }
  const data = new Uint8Array(done);
  let off = 0;
  for (const c of chunks) { data.set(c, off); off += c.length; }
  onProgress?.({ done, total: done });
  let name = 'download.pdf';
  try { name = new URL(url).pathname.split('/').pop() || name; } catch { /* keep default */ }
  return { data, name, size: data.length, url };
}

// ── Clipboard ─────────────────────────────────────────────
export async function copyText(text) {
  if (isElectron) return api.writeClipboardText(text);
  if (navigator.clipboard?.writeText) return navigator.clipboard.writeText(text);
  throw new Error('The clipboard is not available in this browser (a secure context is required).');
}

export async function copyImage(dataUrl) {
  if (isElectron) return api.writeClipboardImage(dataUrl);
  if (!navigator.clipboard?.write || typeof ClipboardItem === 'undefined') {
    throw new Error('Copying images requires a browser with async Clipboard API support over HTTPS.');
  }
  const blob = await (await fetch(dataUrl)).blob();
  await navigator.clipboard.write([new ClipboardItem({ 'image/png': blob })]);
  return true;
}

// ── Shell ─────────────────────────────────────────────────
export async function openExternal(url) {
  if (isElectron) return api.openExternal(url);
  window.open(url, '_blank', 'noopener,noreferrer');
  return true;
}

export async function showItemInFolder(p) {
  if (!isElectron) return false;
  return api.showItem(p);
}

// ── Persisted application state ───────────────────────────
// localStorage is the live store (and the only one on the web). On Electron we
// additionally mirror to userData/settings.json so state survives reinstalls of
// the renderer origin and can be inspected/backed up by the user.
const STORE_KEY = 'mypdfviewer-state';

export function readLocalState() {
  try { return JSON.parse(localStorage.getItem(STORE_KEY) || 'null'); } catch { return null; }
}

export function writeLocalState(state) {
  try { localStorage.setItem(STORE_KEY, JSON.stringify(state)); } catch { /* quota — ignore */ }
  if (isElectron && api.saveSettings) {
    // Fire and forget: the disk mirror must never block the UI.
    api.saveSettings(state).catch(() => {});
  }
}

// Loads persisted state, preferring the on-disk copy in Electron.
export async function loadPersistedState() {
  if (isElectron && api.loadSettings) {
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
  if (isElectron) return api.getInfo();
  return {
    version: '1.0.0',
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
  return parts.join(isElectron && /\\/.test(String(p)) ? '\\' : '/');
}

export function formatBytes(n) {
  if (!Number.isFinite(n)) return '';
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  if (n < 1024 * 1024 * 1024) return `${(n / 1024 / 1024).toFixed(1)} MB`;
  return `${(n / 1024 / 1024 / 1024).toFixed(2)} GB`;
}
