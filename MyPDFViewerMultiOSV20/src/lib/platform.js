// Thin abstraction over the two runtimes the app ships in:
//   • Desktop  — the Tauri app: native dialogs, real filesystem paths, OS
//                clipboard, settings mirrored to <config>/MyPDFViewer/settings.json
//                (window.desktopAPI, installed by ./desktop-bridge.js)
//   • Web      — <input type="file">, Blob downloads, the async Clipboard API,
//                settings in localStorage
//
// Every long-running operation (open / save / download) reports progress so the
// UI can put a progress dialog in front of the user.
import { toFolderEntries } from './folders.js';

export const api = typeof window !== 'undefined' ? window.desktopAPI : undefined;
export const isDesktop = !!(api && api.isDesktop);

// ── Progress plumbing ─────────────────────────────────────
const progressHandlers = new Map();
let taskSeq = 0;

if (isDesktop && api.onProgress) {
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

function pickFileWeb(accept, { multiple = false } = {}) {
  return new Promise((resolve) => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = accept;
    if (multiple) input.multiple = true;
    input.style.display = 'none';
    document.body.appendChild(input);
    // `cancel` is not reliable across browsers; a null resolve on blur+timeout
    // would race the change event, so we simply resolve on change only.
    input.addEventListener('change', async () => {
      const files = [...(input.files || [])];
      input.remove();
      if (!files.length) { resolve(null); return; }
      if (!multiple) {
        resolve(await fileToPayload(files[0]));
        return;
      }
      resolve(await Promise.all(files.map(fileToPayload)));
    }, { once: true });
    input.click();
  });
}

// Opens a PDF (or .pdfvw workspace). Returns { data, name, path, dir, size }
// or null when the user cancels. With `multi`, returns an array of those.
export async function openFileDialog({ defaultDir, onProgress, multi } = {}) {
  if (!isDesktop) return pickFileWeb('.pdf,.pdfvw,application/pdf', { multiple: !!multi });
  const filePath = await api.openPdfDialog({ defaultDir, multi });
  if (!filePath) return null;
  if (multi && Array.isArray(filePath)) {
    const out = [];
    for (const p of filePath) out.push(await readPath(p, { onProgress }));
    return out;
  }
  return readPath(filePath, { onProgress });
}

// Reads a file by absolute path (desktop only — recent files, file
// associations, drag & drop of a real path).
export async function readPath(filePath, { onProgress } = {}) {
  if (!isDesktop) throw new Error('Reading by path is only available in the desktop app.');
  const { id, release } = withTask(onProgress);
  try {
    return await api.readBinary({ filePath, id });
  } finally {
    release();
  }
}

export async function pathExists(p) {
  if (!isDesktop) return false;
  try { return await api.exists(p); } catch { return false; }
}

export async function pickDirectory(defaultDir) {
  if (!isDesktop) return null;
  return api.pickDirectory({ defaultDir });
}

export async function listDirectory(dirPath) {
  if (!isDesktop || !dirPath) return [];
  try { return toFolderEntries(await api.readDir(dirPath)); } catch { return []; }
}

export async function listDrives() {
  if (!isDesktop) return [];
  try {
    const list = await api.listDrives();
    return Array.isArray(list)
      ? list.filter((d) => d && typeof d.path === 'string' && typeof d.name === 'string')
      : [];
  } catch {
    return [];
  }
}

// ── Saving ────────────────────────────────────────────────
export async function saveBinary({ defaultName, defaultDir, bytes, filters, onProgress }) {
  if (isDesktop) {
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
  if (isDesktop) {
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
  if (!isDesktop) throw new Error('Writing to a path is only available in the desktop app.');
  return api.writeText({ filePath, content });
}

export async function writeBinaryTo(filePath, bytes) {
  if (!isDesktop) throw new Error('Writing to a path is only available in the desktop app.');
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
  if (isDesktop) {
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
// Fetches a PDF from a URL. The desktop app goes through the host (no CORS
// restrictions); the web build uses fetch() and is therefore subject to the
// remote server's CORS policy.
export async function downloadUrl(url, { onProgress } = {}) {
  if (isDesktop) {
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
// localStorage is the live store (and the only one on the web). On the desktop we
// additionally mirror to settings.json so state survives reinstalls of
// the renderer origin and can be inspected/backed up by the user.
const STORE_KEY = 'mypdfviewer-state';

export function readLocalState() {
  try { return JSON.parse(localStorage.getItem(STORE_KEY) || 'null'); } catch { return null; }
}

export function writeLocalState(state) {
  try { localStorage.setItem(STORE_KEY, JSON.stringify(state)); } catch { /* quota — ignore */ }
  if (isDesktop && api.saveSettings) {
    // Fire and forget: the disk mirror must never block the UI.
    api.saveSettings(state).catch(() => {});
  }
}

// Loads persisted state, preferring the on-disk copy on the desktop.
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
    version: '1.0.0',
    platform: 'web',
    arch: navigator.platform || '',
    chrome: (/Chrome\/([\d.]+)/.exec(navigator.userAgent) || [])[1] || '',
  };
}

// Paths from a file-manager drop, in order, without blanks or repeats.
// Anything that is not a PDF or workspace is still opened, so the user gets
// the same "not a PDF" message as when choosing it in the open dialog.
export function droppedPaths(paths) {
  const out = [];
  for (const p of Array.isArray(paths) ? paths : []) {
    if (typeof p === 'string' && p.trim() && !out.includes(p)) out.push(p);
  }
  return out;
}

export function baseName(p) {
  if (!p) return '';
  return String(p).split(/[\\/]/).pop();
}

export function dirName(p) {
  if (!p) return '';
  const parts = String(p).split(/[\\/]/);
  parts.pop();
  return parts.join(isDesktop && /\\/.test(String(p)) ? '\\' : '/');
}

export function formatBytes(n) {
  if (!Number.isFinite(n)) return '';
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  if (n < 1024 * 1024 * 1024) return `${(n / 1024 / 1024).toFixed(1)} MB`;
  return `${(n / 1024 / 1024 / 1024).toFixed(2)} GB`;
}
