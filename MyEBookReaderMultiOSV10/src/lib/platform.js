// Thin abstraction over the two runtimes the app ships in:
//   • Electron — native dialogs, real filesystem paths, the OS clipboard,
//                popup menus and dialogs as real windows, settings mirrored to
//                userData/settings.json
//   • Web      — <input type="file">, Blob downloads, the async Clipboard API,
//                in-page popups, settings in localStorage
//
// Every long-running operation (open / save / download) reports progress so the
// UI can put a progress dialog in front of the user.
import { toFolderEntries, isArchiveFileName, ARCHIVE_EXTENSIONS } from './folders.js';
import { BOOK_EXTENSIONS, LIBRARY_EXT } from './book.js';
import { adoptArchive, listArchive, listOpenArchive } from './archive.js';

export const api = typeof window !== 'undefined' ? window.electronAPI : undefined;
export const isElectron = !!(api && api.isElectron);

/** The accept list for the web file picker. */
export const ACCEPT_BOOKS = [...BOOK_EXTENSIONS, LIBRARY_EXT, ...ARCHIVE_EXTENSIONS].map((ext) => `.${ext}`).join(',');

// ── Progress plumbing ─────────────────────────────────────
const progressHandlers = new Map();
let taskSeq = 0;

if (isElectron && api.onProgress) {
  api.onProgress(({ id, done, total }) => {
    const handler = progressHandlers.get(id);
    if (handler) handler({ done, total });
  });
}

function withTask(onProgress) {
  const id = `t${++taskSeq}`;
  if (onProgress) progressHandlers.set(id, onProgress);
  return { id, release: () => progressHandlers.delete(id) };
}

// ── Opening ───────────────────────────────────────────────
function fileToPayload(file) {
  return file.arrayBuffer().then((buffer) => ({
    data: new Uint8Array(buffer),
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
    input.addEventListener('change', async () => {
      const files = [...(input.files || [])];
      input.remove();
      if (!files.length) { resolve(null); return; }
      if (!multiple) { resolve(await fileToPayload(files[0])); return; }
      resolve(await Promise.all(files.map(fileToPayload)));
    }, { once: true });
    input.click();
  });
}

/** Opens a book (or an .ebkr reading file). Returns the bytes, or null. */
export async function openFileDialog({ defaultDir, onProgress, multi } = {}) {
  if (!isElectron) return pickFileWeb(ACCEPT_BOOKS, { multiple: !!multi });
  const picked = await api.openBookDialog({ defaultDir, multi });
  if (!picked) return null;
  if (multi && Array.isArray(picked)) {
    const out = [];
    for (const filePath of picked) out.push(await readPath(filePath, { onProgress }));
    return out;
  }
  return readPath(Array.isArray(picked) ? picked[0] : picked, { onProgress });
}

/** Just the paths, so the caller can report progress per file as it reads them. */
export async function pickBookPaths({ defaultDir, multi = true } = {}) {
  if (!isElectron) return null;
  const picked = await api.openBookDialog({ defaultDir, multi });
  if (!picked) return null;
  return Array.isArray(picked) ? picked : [picked];
}

export async function pickImage({ defaultDir } = {}) {
  if (!isElectron) return pickFileWeb('image/*');
  const filePath = await api.openImageDialog({ defaultDir });
  if (!filePath) return null;
  return readPath(filePath);
}

/** Reads a file by absolute path (Electron only). */
export async function readPath(filePath, { onProgress } = {}) {
  if (!isElectron) throw new Error('Reading by path is only available in the desktop app.');
  const { id, release } = withTask(onProgress);
  try {
    return await api.readBinary({ filePath, id });
  } finally {
    release();
  }
}

export async function readTextPath(filePath) {
  if (!isElectron) throw new Error('Reading by path is only available in the desktop app.');
  return api.readText(filePath);
}

export async function pathExists(p) {
  if (!isElectron) return false;
  try { return await api.exists(p); } catch { return false; }
}

export async function statPath(p) {
  if (!isElectron) return null;
  try { return await api.stat(p); } catch { return null; }
}

/**
 * Where a dropped file lives on disk, or '' when there is no telling.
 *
 * A dropped `File` used to carry its own `path`; Electron 32 removed it in favour
 * of `webUtils.getPathForFile`, which only the preload can call. Both are tried,
 * newest first, so this works on either.
 */
export function droppedPath(file) {
  if (!isElectron || !file) return '';
  try {
    const viaPreload = api.pathForFile?.(file);
    if (viaPreload) return viaPreload;
  } catch { /* fall through to the old way */ }
  return file.path || '';
}

/** Whether a path is a folder. False when there is no way to ask. */
export async function isDirectory(p) {
  const st = await statPath(p);
  return !!st?.isDir;
}

/**
 * The path a `file://` URL names.
 *
 * Not every application hands over a file when you drop one on a window: many
 * hand over its location as a URL instead, which is why dropping from them used
 * to do nothing at all. The spelling differs by platform — `file:///C:/a%20b.epub`
 * is a Windows path with a drive letter and an escaped space, and a UNC share
 * arrives as the URL's host — so this is the one place that untangles it.
 */
export function fileUrlToPath(url) {
  const raw = String(url || '').trim();
  const match = /^file:\/\/([^/]*)(\/.*)$/i.exec(raw);
  if (!match) return '';
  const host = match[1];
  let out;
  try { out = decodeURIComponent(match[2]); } catch { return ''; }
  if (host && host.toLowerCase() !== 'localhost') {
    return `\\\\${host}${out.split('/').join('\\')}`;
  }
  // A leading slash before a drive letter belongs to the URL, not to the path.
  if (/^\/[A-Za-z]:/.test(out)) return out.slice(1).split('/').join('\\');
  return out;
}

/** The files a drop names by location rather than handing over. */
export function droppedFileUrls(dataTransfer) {
  if (!dataTransfer) return [];
  const read = (type) => {
    try { return dataTransfer.getData(type) || ''; } catch { return ''; }
  };
  const text = read('text/uri-list') || read('text/plain') || '';
  const seen = new Set();
  const out = [];
  for (const line of text.split(/[\r\n]+/)) {
    const trimmed = line.trim();
    // A uri-list may carry comments, which begin with a hash.
    if (!trimmed || trimmed.startsWith('#')) continue;
    const where = fileUrlToPath(trimmed);
    if (!where || seen.has(where)) continue;
    seen.add(where);
    out.push(where);
  }
  return out;
}

export async function pickDirectory(defaultDir) {
  if (!isElectron) return null;
  return api.pickDirectory({ defaultDir });
}

export async function listDirectory(dirPath) {
  if (!dirPath) return [];
  try {
    const opened = listOpenArchive(dirPath);
    if (opened) return opened;
  } catch { return []; }
  if (isArchiveFileName(dirPath)) {
    if (!isElectron) return [];
    try {
      const st = await statPath(dirPath);
      if (!st || st.isDir) return [];
      const payload = await readPath(dirPath);
      const id = adoptArchive({ data: payload.data, name: payload.name || baseName(dirPath), path: dirPath });
      return listArchive(id, '');
    } catch { return []; }
  }
  if (!isElectron) return [];
  try { return toFolderEntries(await api.readDir(dirPath)); } catch { return []; }
}

/**
 * The drives and the home folder, for starting a folder tree somewhere.
 *
 * Only the desktop app can answer this — a browser has no drives to offer, and
 * says so with an empty list rather than an error, so the panel simply shows
 * nothing where the drives would be.
 */
export async function listDrives() {
  if (!isElectron || typeof api.drives !== 'function') return [];
  try {
    const rows = await api.drives();
    return (Array.isArray(rows) ? rows : []).filter((row) => row && row.path);
  } catch { return []; }
}

export async function homeDir() {
  if (!isElectron) return '';
  try { return await api.home(); } catch { return ''; }
}

// ── Saving ────────────────────────────────────────────────
export async function saveText({ defaultName, defaultDir, content, filters, onProgress }) {
  if (isElectron) {
    onProgress?.({ done: 0, total: content.length });
    const saved = await api.saveText({ defaultName, defaultDir, content, filters });
    onProgress?.({ done: content.length, total: content.length });
    return saved;
  }
  onProgress?.({ done: content.length, total: content.length });
  downloadBlob(new Blob([content], { type: 'text/plain;charset=utf-8' }), defaultName);
  return defaultName;
}

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

/** Writes to a known path without a dialog (the reading file's "Save"). */
export async function writeTextTo(filePath, content) {
  if (!isElectron) throw new Error('Writing to a path is only available in the desktop app.');
  return api.writeText({ filePath, content });
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
/**
 * Fetches a book from a URL. Electron goes through the main process (no CORS
 * restrictions); the web build uses fetch() and is therefore subject to the
 * remote server's CORS policy.
 */
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
  let at = 0;
  for (const chunk of chunks) { data.set(chunk, at); at += chunk.length; }
  onProgress?.({ done, total: done });
  let name = 'download.epub';
  try { name = new URL(url).pathname.split('/').pop() || name; } catch { /* keep default */ }
  return { data, name, size: data.length, url };
}

// ── Clipboard ─────────────────────────────────────────────
export async function copyText(text) {
  if (isElectron) return api.writeClipboardText(text);
  if (navigator.clipboard?.writeText) return navigator.clipboard.writeText(text);
  throw new Error('The clipboard is not available in this browser (a secure context is required).');
}

export async function readClipboardText() {
  if (isElectron) return api.readClipboardText();
  if (navigator.clipboard?.readText) return navigator.clipboard.readText();
  throw new Error('Reading the clipboard is not available in this browser.');
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

// ── Printing ──────────────────────────────────────────────
export async function printHtml({ html, title }) {
  if (isElectron) return api.printHtml({ html, title });
  return printInNewWindow({ html, title });
}

export async function printImages({ images, title }) {
  if (isElectron) return api.printImages({ images, title });
  const html = images
    .map((src) => `<div class="sheet"><img src="${src}" alt=""></div>`)
    .join('\n');
  return printInNewWindow({ html, title, sheets: true });
}

/** The web fallback: a print window the browser's own dialog then prints. */
function printInNewWindow({ html, title, sheets = false }) {
  const win = window.open('', '_blank');
  if (!win) throw new Error('The browser blocked the print window. Allow pop-ups for this page and try again.');
  win.document.write(`<!doctype html><html><head><meta charset="utf-8"><title>${String(title || 'Print').replace(/[<&]/g, '')}</title>
<style>
  @page { size: auto; margin: 14mm; }
  html, body { margin: 0; background: #fff; color: #000; font-family: system-ui, sans-serif; line-height: 1.6; }
  .sheet { page-break-after: always; break-after: page; display: flex; align-items: center; justify-content: center; }
  .sheet:last-child { page-break-after: auto; break-after: auto; }
  img { max-width: 100%; }
  ${sheets ? '' : '.chapter { page-break-after: always; break-after: page; } .chapter:last-child { break-after: auto; }'}
</style></head><body>${html}</body></html>`);
  win.document.close();
  return new Promise((resolve) => {
    const go = () => {
      win.focus();
      win.print();
      resolve({ printed: true });
    };
    if (win.document.readyState === 'complete') setTimeout(go, 200);
    else win.addEventListener('load', () => setTimeout(go, 200));
  });
}

// ── Persisted application state ───────────────────────────
// localStorage is the live store (and the only one on the web). On Electron we
// additionally mirror to userData/settings.json so state survives and can be
// inspected or backed up by the user.
const STORE_KEY = 'myebookreader-state';

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

// ── Window ────────────────────────────────────────────────
export const win = {
  setTitle(title) { if (isElectron) api.win.setTitle(title).catch(() => {}); },
  setMinWidth(width) { if (isElectron) api.win.setMinWidth(width)?.catch?.(() => {}); },
};

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
  return parts.join(/\\/.test(String(p)) ? '\\' : '/');
}

export function formatBytes(n) {
  if (!Number.isFinite(n)) return '';
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  if (n < 1024 * 1024 * 1024) return `${(n / 1024 / 1024).toFixed(1)} MB`;
  return `${(n / 1024 / 1024 / 1024).toFixed(2)} GB`;
}
