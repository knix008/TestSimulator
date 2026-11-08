// Files and the window, on the desktop (Tauri commands in src-tauri/src/lib.rs) and in a
// browser (File System Access API where there is one, a file input and a download otherwise).
// The rest of the app only sees these functions.
import { OPEN_FILTERS, baseName, defaultExt, kindOf } from '../domain/doctypes.js';

export const desktop = Boolean(globalThis.window?.__TAURI_INTERNALS__);

let tauri = null;
async function api() {
  if (!tauri) {
    const [core, dialog, win, webview] = await Promise.all([
      import('@tauri-apps/api/core'), import('@tauri-apps/plugin-dialog'), import('@tauri-apps/api/window'), import('@tauri-apps/api/webview'),
    ]);
    tauri = { core, dialog, win, webview };
  }
  return tauri;
}
const invoke = async (command, args) => (await api()).core.invoke(command, args);

/** The dialog filters in the UI language (labels from the caller). */
const dialogFilters = (labels, only) => OPEN_FILTERS.filter((f) => !only || f.id === only || f.id === 'all').map((f) => ({ name: labels[f.id] ?? f.id, extensions: f.ext }));

// ───────────────────────── desktop

/** Paths chosen in the Open dialog (empty when cancelled). */
export async function chooseFiles(labels, directory) {
  if (!desktop) return webChooseFiles();
  const { dialog } = await api();
  const result = await dialog.open({ multiple: true, directory: false, defaultPath: directory || undefined, filters: [...dialogFilters(labels), { name: labels.any ?? '*', extensions: ['*'] }] });
  if (!result) return [];
  return (Array.isArray(result) ? result : [result]).map((path) => ({ path }));
}

/** The path chosen in the Save dialog (null when cancelled). */
export async function chooseSavePath(labels, suggested, kind) {
  if (!desktop) return null;
  const { dialog } = await api();
  const ext = defaultExt(kind);
  const filter = OPEN_FILTERS.find((f) => f.id === kind) ?? OPEN_FILTERS[0];
  return dialog.save({ defaultPath: suggested, filters: [{ name: labels[kind] ?? kind, extensions: filter.ext }, { name: labels.any ?? '*', extensions: ['*'] }] }).then((path) => (path && !/\.[^\\/.]+$/.test(path) ? `${path}.${ext}` : path));
}

/** { text, encoding, bom, mtime, size } — the text decoded by Rust (UTF-8, UTF-16 or the Korean code page). */
export async function readFile(file) {
  if (file.handle || file.file) return webRead(file);
  return invoke('read_text_file', { path: file.path });
}

/** Writes text in an encoding (utf-8, utf-8-bom, utf-16le, euc-kr); returns { mtime, size }. */
export async function writeFile(doc, text) {
  if (!desktop) return webWrite(doc, text);
  return invoke('write_text_file', { path: doc.path, content: text, encoding: doc.encoding ?? 'utf-8' });
}

// ───────────────────────── bytes, explorer, find in files, pictures

const fromBase64 = (data) => Uint8Array.from(atob(data), (c) => c.charCodeAt(0));
export function toBase64(bytes) {
  let binary = '';
  for (let i = 0; i < bytes.length; i += 0x8000) binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(binary);
}

/** A file's bytes (the hex editor; pictures dropped into a document). */
export async function readBytes(file) {
  if (file.file || file.handle) return new Uint8Array(await (file.file ?? (await file.handle.getFile())).arrayBuffer());
  return fromBase64(await invoke('read_bytes', { path: file.path }));
}

export async function writeBytes(doc, bytes) {
  if (desktop) return invoke('write_bytes', { path: doc.path, data: toBase64(bytes) });
  if (!doc.handle && globalThis.showSaveFilePicker) {
    try { doc.handle = await globalThis.showSaveFilePicker({ suggestedName: doc.name }); } catch (error) { if (error?.name === 'AbortError') return null; throw error; }
  }
  if (doc.handle) { const w = await doc.handle.createWritable(); await w.write(bytes); await w.close(); return { mtime: Date.now(), size: bytes.length }; }
  download(doc.name, bytes, 'application/octet-stream');
  return { mtime: Date.now(), size: bytes.length, downloaded: true };
}

/** A URL a viewer can load: the asset protocol on the desktop, an object URL in the browser. */
export async function viewUrl(file) {
  if (file.file || file.handle) return URL.createObjectURL(file.file ?? (await file.handle.getFile()));
  await allowDirectory(dirOf(file.path));
  return fileUrl(file.path);
}
const dirOf = (path) => { const i = Math.max(path.lastIndexOf('/'), path.lastIndexOf('\\')); return i > 0 ? path.slice(0, i) : path; };

export const explorerPlaces = () => (desktop ? invoke('explorer_places') : Promise.resolve([]));
export const listDir = (dir, hidden) => invoke('list_dir', { dir, hidden });
export const searchFiles = (options) => invoke('search_files', options);
export const copyImage = (source, docDir) => invoke('copy_image', { source, docDir });
export const writeImage = (bytes, name, docDir) => invoke('write_image', { data: toBase64(bytes), name, docDir });
export const fileDetails = (path) => invoke('file_details', { path });
export const fileHashes = (path) => invoke('file_hashes', { path });
export const setAlwaysOnTop = (on) => (desktop ? invoke('set_always_on_top', { on }) : Promise.resolve());

export async function chooseFolder(directory) {
  if (!desktop) return null;
  const { dialog } = await api();
  return dialog.open({ directory: true, multiple: false, defaultPath: directory || undefined });
}

export const fileStat = (path) => (desktop ? invoke('file_stat', { path }) : Promise.resolve(null));
export const pathsExist = (paths) => (desktop ? invoke('paths_exist', { paths }) : Promise.resolve(paths.map(() => true)));
export const startupFiles = () => (desktop ? invoke('startup_files') : Promise.resolve([]));
export const appInfo = () => (desktop ? invoke('app_info') : Promise.resolve(null));
export const openExternal = (target) => (desktop ? invoke('open_external', { target }) : Promise.resolve(globalThis.open(target, '_blank', 'noopener')));
/** Lets the preview show pictures from the document's folder (asset protocol). */
export const allowDirectory = (dir) => (desktop && dir ? invoke('allow_directory', { dir }).catch(() => {}) : Promise.resolve());

/** A URL the preview can load for a local file. */
export async function fileUrl(path) {
  if (!desktop) return path;
  return (await api()).core.convertFileSrc(path);
}

// ───────────────────────── window

export async function windowCommand(command) {
  if (!desktop) return;
  const { win } = await api();
  const w = win.getCurrentWindow();
  if (command === 'minimize') await w.minimize();
  else if (command === 'maximize') await w.toggleMaximize();
  else if (command === 'fullscreen') await w.setFullscreen(!(await w.isFullscreen()));
}

export async function isMaximized() {
  if (!desktop) return false;
  return (await api()).win.getCurrentWindow().isMaximized().catch(() => false);
}

export async function onWindowResized(handler) {
  if (!desktop) return;
  (await api()).win.getCurrentWindow().onResized(handler).catch(() => {});
}

/** Moves the window (edge: resize from that edge), started from a pointer press. */
export const windowDrag = (edge) => (desktop ? invoke('window_drag', { edge: edge ?? null }).catch(() => {}) : Promise.resolve());
export const setMinimumSize = (width, height) => (desktop ? invoke('set_min_size', { width, height }).catch(() => {}) : Promise.resolve());
export const setWindowTitle = async (title) => { if (desktop) await (await api()).win.getCurrentWindow().setTitle(title).catch(() => {}); else document.title = title; };
export const showWindow = () => (desktop ? invoke('window_ready').catch(() => {}) : Promise.resolve());
/** The user's guide in a window of its own (a second call brings it to the front). */
export function openGuideWindow(title) {
  if (desktop) return invoke('open_guide_window', { title });
  const url = `${location.pathname}?view=guide`;
  const win = globalThis.open(url, 'mytextmaster-guide', 'width=1040,height=780');
  win?.focus?.();
  return Promise.resolve(Boolean(win));
}
export const quitApp = () => (desktop ? invoke('quit_app') : Promise.resolve(globalThis.close()));

/** handler() → true when the window may close (asked before every close of the main window). */
export async function onCloseRequested(handler) {
  if (desktop) {
    const w = (await api()).win.getCurrentWindow();
    await w.onCloseRequested(async (event) => {
      event.preventDefault();
      if (await handler()) invoke('quit_app');
    });
  } else {
    globalThis.addEventListener('beforeunload', (event) => {
      if (handler.hasUnsaved?.()) { event.preventDefault(); event.returnValue = ''; }
    });
  }
}

/** Files dropped on the window from the file manager: handler([{ path } | { file }]). */
export async function onFileDrop(handler, hover) {
  if (desktop) {
    const { webview } = await api();
    await webview.getCurrentWebview().onDragDropEvent((event) => {
      const type = event.payload.type;
      if (type === 'enter' || type === 'over') hover(true);
      else if (type === 'leave') hover(false);
      else if (type === 'drop') {
        hover(false);
        // Physical pixels → CSS pixels, so the page can tell where in the editor the files fell.
        const p = event.payload.position;
        const at = p ? { x: p.x / devicePixelRatio, y: p.y / devicePixelRatio } : null;
        handler((event.payload.paths ?? []).map((path) => ({ path })), at);
      }
    });
    return;
  }
  const has = (event) => [...(event.dataTransfer?.types ?? [])].includes('Files');
  globalThis.addEventListener('dragover', (event) => { if (has(event)) { event.preventDefault(); hover(true); } });
  globalThis.addEventListener('dragleave', (event) => { if (!event.relatedTarget) hover(false); });
  globalThis.addEventListener('drop', (event) => {
    if (!has(event)) return;
    event.preventDefault();
    hover(false);
    handler([...event.dataTransfer.files].map((file) => ({ file, path: file.name, web: true })), { x: event.clientX, y: event.clientY });
  });
}

// ───────────────────────── web

const pickerTypes = () => [{ description: 'Text', accept: { 'text/plain': OPEN_FILTERS[0].ext.map((ext) => `.${ext}`) } }];

async function webChooseFiles() {
  if (globalThis.showOpenFilePicker) {
    try {
      const handles = await globalThis.showOpenFilePicker({ multiple: true, types: pickerTypes(), excludeAcceptAllOption: false });
      return handles.map((handle) => ({ handle, path: handle.name, web: true }));
    } catch (error) {
      if (error?.name === 'AbortError') return [];
      throw error;
    }
  }
  return new Promise((resolve) => {
    const input = document.createElement('input');
    input.type = 'file';
    input.multiple = true;
    input.accept = OPEN_FILTERS[0].ext.map((ext) => `.${ext}`).join(',');
    input.addEventListener('change', () => resolve([...input.files].map((file) => ({ file, path: file.name, web: true }))));
    input.addEventListener('cancel', () => resolve([]));
    input.click();
  });
}

async function webRead(item) {
  const file = item.file ?? (await item.handle.getFile());
  const buffer = new Uint8Array(await file.arrayBuffer());
  return { ...decodeBytes(buffer), mtime: file.lastModified, size: file.size };
}

/** Bytes to text: UTF-8 (with or without BOM), UTF-16 with a BOM, else the Korean code page. */
export function decodeBytes(bytes) {
  if (bytes[0] === 0xef && bytes[1] === 0xbb && bytes[2] === 0xbf) return { text: new TextDecoder('utf-8').decode(bytes.subarray(3)), encoding: 'utf-8-bom' };
  if (bytes[0] === 0xff && bytes[1] === 0xfe) return { text: new TextDecoder('utf-16le').decode(bytes.subarray(2)), encoding: 'utf-16le' };
  if (bytes[0] === 0xfe && bytes[1] === 0xff) return { text: new TextDecoder('utf-16be').decode(bytes.subarray(2)), encoding: 'utf-16be' };
  try {
    return { text: new TextDecoder('utf-8', { fatal: true }).decode(bytes), encoding: 'utf-8' };
  } catch {
    return { text: new TextDecoder('euc-kr').decode(bytes), encoding: 'euc-kr' };
  }
}

/** Text to bytes in an encoding the browser can write (it has no EUC-KR encoder: UTF-8 then). */
export function encodeBytes(text, encoding) {
  if (encoding === 'utf-16le') {
    const out = new Uint8Array(2 + text.length * 2);
    out[0] = 0xff; out[1] = 0xfe;
    for (let i = 0; i < text.length; i += 1) { const c = text.charCodeAt(i); out[2 + i * 2] = c & 0xff; out[3 + i * 2] = c >> 8; }
    return out;
  }
  const body = new TextEncoder().encode(text);
  if (encoding !== 'utf-8-bom') return body;
  const out = new Uint8Array(body.length + 3);
  out.set([0xef, 0xbb, 0xbf]);
  out.set(body, 3);
  return out;
}

async function webWrite(doc, text) {
  const bytes = encodeBytes(text, doc.encoding);
  if (!doc.handle && globalThis.showSaveFilePicker) {
    try {
      doc.handle = await globalThis.showSaveFilePicker({ suggestedName: doc.name, types: pickerTypes() });
    } catch (error) {
      if (error?.name === 'AbortError') return null;
      throw error;
    }
  }
  if (doc.handle) {
    const writable = await doc.handle.createWritable();
    await writable.write(bytes);
    await writable.close();
    doc.name = doc.handle.name;
    doc.path = doc.handle.name;
    doc.kind = doc.kind ?? kindOf(doc.name);
    return { mtime: Date.now(), size: bytes.length };
  }
  download(doc.name, bytes);
  return { mtime: Date.now(), size: bytes.length, downloaded: true };
}

/** Saves bytes or text as a download (the web build's "Save" without file access). */
export function download(name, data, type = 'text/plain;charset=utf-8') {
  const blob = new Blob([data], { type });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = baseName(name);
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}

/** Writes an exported file: a Save dialog on the desktop, a download in the browser. */
export async function exportFile(labels, suggested, kind, text) {
  if (!desktop) { download(suggested, text, kind === 'html' ? 'text/html;charset=utf-8' : 'text/plain;charset=utf-8'); return suggested; }
  const path = await chooseSavePath(labels, suggested, kind);
  if (!path) return null;
  await invoke('write_text_file', { path, content: text, encoding: 'utf-8' });
  return path;
}

export async function clipboardWrite(text, html) {
  if (html && globalThis.ClipboardItem && navigator.clipboard?.write) {
    try {
      await navigator.clipboard.write([new ClipboardItem({ 'text/html': new Blob([html], { type: 'text/html' }), 'text/plain': new Blob([text], { type: 'text/plain' }) })]);
      return;
    } catch { /* fall back to plain text */ }
  }
  await navigator.clipboard.writeText(text);
}

export const clipboardRead = () => navigator.clipboard.readText();
