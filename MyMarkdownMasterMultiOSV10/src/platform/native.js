// Platform boundary. The desktop app (Tauri) calls the Rust backend; the web
// build uses browser APIs (File System Access when available, downloads
// otherwise, IndexedDB for large data). Everything platform-specific is here.
import { convertFileSrc, invoke as tauriInvoke } from '@tauri-apps/api/core';
import { emitTo as tauriEmitTo, listen as tauriListen } from '@tauri-apps/api/event';
import { getCurrentWindow, LogicalSize } from '@tauri-apps/api/window';
import { open as openDialog, save as saveDialog } from '@tauri-apps/plugin-dialog';
import { t } from '../i18n.js';
import { idbDelete, idbGet, idbSet } from './idb.js';

// A popup shown as a frame inside the main window (web build, tutorial) works like the web build.
const framed = Boolean(new URLSearchParams(globalThis.location?.search ?? '').get('popup'));
export const isDesktop = () => Boolean(globalThis.window?.__TAURI_INTERNALS__) && !framed;

export function invoke(command, args) {
  if (!isDesktop()) return Promise.reject(new Error(t('web.desktopOnly')));
  return tauriInvoke(command, args);
}

/** Readable text of anything thrown (Rust errors arrive as strings). */
export const errorText = (error) => (error instanceof Error ? error.message : typeof error === 'string' ? error : JSON.stringify(error) ?? String(error));

const BUILD = {
  version: typeof __APP_VERSION__ === 'string' ? __APP_VERSION__ : '0.0.0',
  commit: typeof __BUILD_COMMIT__ === 'string' ? __BUILD_COMMIT__ : 'dev',
  date: typeof __BUILD_DATE__ === 'string' ? __BUILD_DATE__ : new Date().toISOString(),
};

export async function appInfo() {
  if (isDesktop()) {
    const info = await invoke('app_info');
    return { ...info, web: false, buildDate: new Date(info.buildTime * 1000).toISOString(), uiBuild: BUILD };
  }
  return {
    name: 'MyMarkdownMaster', version: BUILD.version, commit: BUILD.commit, buildDate: BUILD.date, target: 'web (browser)',
    profile: import.meta.env?.MODE ?? 'production', tauri: '-', rustc: '-', os: navigator.userAgentData?.platform ?? navigator.platform ?? 'web',
    arch: '-', web: true, uiBuild: BUILD,
  };
}

/** The Tauri shell is present (also in a popup shown as a frame, where isDesktop() is false). */
export const inTauri = () => Boolean(globalThis.window?.__TAURI_INTERNALS__);

export const setBackendLanguage = (language) => (isDesktop() ? invoke('set_language', { language }).catch(() => {}) : Promise.resolve());
export const startupFiles = () => (isDesktop() ? invoke('startup_files') : Promise.resolve([]));
/** { first, others }: several copies may run; only the first restores and keeps the session. */
export const instanceInfo = () => (isDesktop() ? invoke('instance_info') : Promise.resolve({ first: true, others: 0 }));

// ───────────────────────── events between windows

export async function listen(event, handler) {
  if (!isDesktop()) return () => {};
  return tauriListen(event, (message) => handler(message.payload));
}

export const emitTo = (target, event, payload) => (isDesktop() ? tauriEmitTo(target, event, payload) : Promise.resolve());

// ───────────────────────── files (desktop)

export const readTextFile = (path, op) => invoke('read_text_file', { path, op });
export const writeTextFile = (path, content, op) => invoke('write_text_file', { path, content, op });
export const pathsExist = (paths) => (isDesktop() ? invoke('paths_exist', { paths }) : Promise.resolve(paths.map(() => true)));

const MARKDOWN_FILTERS = () => [
  { name: 'Markdown (*.md, *.markdown)', extensions: ['md', 'markdown'] },
  { name: t('file.allFiles'), extensions: ['*'] },
];
/** Save types of the exports and of the document itself. */
export const SAVE_TYPES = {
  md: { name: 'Markdown (*.md)', extensions: ['md', 'markdown'] },
  html: { name: 'HTML (*.html)', extensions: ['html', 'htm'] },
  pdf: { name: 'PDF (*.pdf)', extensions: ['pdf'] },
  doc: { name: 'Word (*.doc)', extensions: ['doc'] },
  txt: { name: 'Text (*.txt)', extensions: ['txt'] },
};
const IMAGE_EXTENSIONS = ['png', 'jpg', 'jpeg', 'gif', 'webp', 'bmp', 'svg', 'avif', 'ico'];

// Tests answer the system file dialogs through these (E2E only; normal use never sets them).
const testPick = (name) => {
  const queue = globalThis.window?.[name];
  return Array.isArray(queue) && queue.length ? { value: queue.shift() } : null;
};

/** Open dialog with given filters ([{ name, extensions }]); multiple → array. */
export async function chooseFiles(defaultPath, filters, multiple = true) {
  const picked = testPick('__mymarkdownOpenPicks');
  if (picked) return [].concat(picked.value ?? []);
  const result = await openDialog({ multiple, directory: false, defaultPath: defaultPath ?? undefined, filters });
  if (!result) return [];
  return Array.isArray(result) ? result : [result];
}

/** The open dialog for Markdown files (several at once). */
export async function chooseMarkdownFiles(defaultPath) {
  const picked = testPick('__mymarkdownOpenPicks');
  if (picked) return [].concat(picked.value ?? []);
  const result = await openDialog({ multiple: true, directory: false, defaultPath: defaultPath ?? undefined, filters: MARKDOWN_FILTERS() });
  if (!result) return [];
  return Array.isArray(result) ? result : [result];
}

/** Save dialog for one of SAVE_TYPES (the first listed is preselected). */
export async function chooseSavePath(defaultPath, types = ['md']) {
  const picked = testPick('__mymarkdownSavePicks');
  if (picked) return picked.value;
  return (await saveDialog({ defaultPath: defaultPath ?? undefined, filters: types.map((type) => SAVE_TYPES[type]) })) ?? null;
}

export async function chooseFolder(defaultPath) {
  const picked = testPick('__mymarkdownFolderPicks');
  if (picked) return picked.value;
  const result = await openDialog({ multiple: false, directory: true, defaultPath: defaultPath ?? undefined });
  return Array.isArray(result) ? result[0] ?? null : result ?? null;
}

export async function chooseImage(defaultPath) {
  const picked = testPick('__mymarkdownImagePicks');
  if (picked) return picked.value;
  const result = await openDialog({ multiple: false, directory: false, defaultPath: defaultPath ?? undefined, filters: [{ name: 'Images', extensions: IMAGE_EXTENSIONS }] });
  return Array.isArray(result) ? result[0] ?? null : result ?? null;
}

export const writeBase64File = (path, data, op) => invoke('write_base64_file', { path, data, op });

// ───────────────────────── Markdown sources (src-tauri/src/markdown.rs)

/** [{ name, relPath, fullPath, mtime, size }] of a folder (and its sub-folders with `recursive`). */
export const scanMarkdown = (dir, recursive) => invoke('scan_markdown', { dir, recursive: Boolean(recursive) });
/** The same for picked files (missing ones are left out). */
export const fileInfos = (paths) => invoke('file_infos', { paths });
/** A local picture a Markdown file links to, as a data: URI (null when it is not a local picture or not there). */
export const embedImage = (mdPath, src) => invoke('embed_image', { mdPath, src });

// The render window (src/render.js): lays a standalone HTML document out in pages with paged.js, then
// writes it as a PDF (Windows) or shows it with the print dialog. It answers with the event `render-done`.
export const openRenderWindow = (job, dark) => invoke('open_render_window', { job, dark: dark ?? null });
export const takeRenderJob = () => invoke('take_render_job');
export const closeRenderWindow = () => (isDesktop() ? invoke('close_render_window') : Promise.resolve());
/** The calling window's pages as a PDF file (Windows / WebView2), sheets of width × height mm. */
export const printPagesToPdf = (path, widthMm = 210, heightMm = 297) => invoke('print_pages_to_pdf', { job: { printer: '', copies: 1, widthMm, heightMm }, path });

// Printing (src-tauri/src/printing.rs): the printers (none on the web and outside Windows → the system dialog),
// a silent print of the calling window to a printer, and the system / browser print dialog.
export const listPrinters = () => (isDesktop() ? invoke('list_printers') : Promise.resolve({ printers: [], defaultPrinter: '', filePrinters: [] }));
export const printDirect = (job) => invoke('print_direct', { job });
export const printWindow = () => (isDesktop() ? invoke('print_window') : Promise.resolve(window.print()));
/** Binary file contents as base64 (pictures). */
// `op` names the progress events; the command requires it, so callers without one get ''.
export const readBase64File = (path, op = '') => invoke('read_base64_file', { path, op: op ?? '' });

export const openDocument = (name) => (isDesktop() ? invoke('open_document', { name }) : Promise.resolve(globalThis.open(`./docs/${name}`, '_blank')));
export const openExternal = (target) => (isDesktop() ? invoke('open_external', { target }) : Promise.resolve(globalThis.open(target, '_blank', 'noopener')));

// ───────────────────────── files (web)

export const hasFileSystemAccess = () => typeof globalThis.showOpenFilePicker === 'function';

/**
 * Web: files for File › Import… with grouped filters ([{ name, extensions }], the first preselected) — the
 * File System Access picker shows them as file types; elsewhere an <input> accepting the first group.
 * Returns File objects ([] when cancelled).
 */
export async function pickImportFilesWeb(filters, multiple = true) {
  if (hasFileSystemAccess()) {
    try {
      const types = filters.map((f) => ({ description: f.name, accept: { 'application/octet-stream': f.extensions.map((e) => `.${e}`) } }));
      const handles = await globalThis.showOpenFilePicker({ id: 'mymarkdown-import', multiple, types });
      return Promise.all(handles.map((handle) => handle.getFile()));
    } catch (error) {
      if (error?.name === 'AbortError') return [];
      // A browser that refuses one of the extensions as a file type: the plain input below.
      if (error?.name !== 'TypeError') throw error;
    }
  }
  return pickWithInput((filters[0]?.extensions ?? []).map((e) => `.${e}`).join(','), multiple);
}

export function pickWithInput(accept, multiple = false) {
  return new Promise((resolve) => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = accept;
    input.multiple = multiple;
    input.style.display = 'none';
    input.addEventListener('change', () => { resolve([...(input.files ?? [])]); input.remove(); });
    input.addEventListener('cancel', () => { resolve([]); input.remove(); });
    document.body.append(input);
    input.click();
  });
}

/** Web save: back into the file's handle, a save picker, or a download. Returns { name, handle }. */
export async function saveFileWeb(content, { name, handle, saveAs, mime = 'application/json' }) {
  if (handle && !saveAs && typeof handle.createWritable === 'function') {
    await writeHandle(handle, content);
    return { name: handle.name, handle };
  }
  if (typeof globalThis.showSaveFilePicker === 'function') {
    let picked;
    try {
      const extension = `.${String(name).split('.').pop()}`;
      picked = await globalThis.showSaveFilePicker({ id: 'mymarkdown', suggestedName: name, types: [{ description: 'MyMarkdownMaster', accept: { [mime]: [extension] } }] });
    } catch (error) {
      if (error?.name === 'AbortError') return null;
      throw error;
    }
    await writeHandle(picked, content);
    return { name: picked.name, handle: picked };
  }
  const url = URL.createObjectURL(content instanceof Blob ? content : new Blob([content], { type: mime }));
  const link = Object.assign(document.createElement('a'), { href: url, download: name });
  document.body.append(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
  return { name, handle: null };
}

async function writeHandle(handle, text) {
  if (handle.requestPermission && (await handle.queryPermission?.({ mode: 'readwrite' })) !== 'granted') {
    await handle.requestPermission({ mode: 'readwrite' });
  }
  const writable = await handle.createWritable();
  await writable.write(text);
  await writable.close();
}

export const storeWebHandle = (key, handle) => idbSet(`handle:${key}`, handle).catch(() => {});
export const loadWebHandle = (key) => idbGet(`handle:${key}`).catch(() => null);
export const forgetWebHandle = (key) => idbDelete(`handle:${key}`).catch(() => {});

// ───────────────────────── background image

export const importBackground = (path, op) => invoke('import_background', { path, op });

export async function storeWebBackground(file) {
  await idbSet('background', file);
}

export async function clearBackground() {
  if (isDesktop()) return invoke('remove_background');
  return idbDelete('background').catch(() => {});
}

let webBackgroundUrl = null;
/** URL for the stored background image, or null. */
export async function backgroundUrl(settings) {
  if (!settings.backgroundImage) return null;
  if (isDesktop()) {
    const allowed = await invoke('allow_background', { path: settings.backgroundImage }).catch(() => false);
    return allowed ? convertFileSrc(settings.backgroundImage) : null;
  }
  const blob = await idbGet('background').catch(() => null);
  if (!blob) return null;
  if (webBackgroundUrl) URL.revokeObjectURL(webBackgroundUrl);
  webBackgroundUrl = URL.createObjectURL(blob);
  return webBackgroundUrl;
}

// ───────────────────────── fonts

const WEB_FONT_CANDIDATES = ['Arial', 'Arial Black', 'Bahnschrift', 'Calibri', 'Cambria', 'Candara', 'Comic Sans MS', 'Consolas', 'Constantia', 'Corbel',
  'Courier New', 'Georgia', 'Helvetica', 'Helvetica Neue', 'Impact', 'Lucida Console', 'Malgun Gothic', '맑은 고딕', 'Gulim', '굴림', 'Dotum', '돋움', 'Batang', '바탕',
  'Gungsuh', 'Nanum Gothic', '나눔고딕', 'Noto Sans KR', 'Noto Serif KR', 'Apple SD Gothic Neo', 'AppleGothic', 'Menlo', 'Monaco', 'Palatino Linotype', 'Segoe UI',
  'Segoe Print', 'Segoe Script', 'Tahoma', 'Times New Roman', 'Trebuchet MS', 'Verdana', 'Ubuntu', 'DejaVu Sans', 'Liberation Sans', 'Cantarell', 'Roboto', 'Inter'];

export async function listFonts() {
  if (isDesktop()) return invoke('list_fonts');
  if (typeof globalThis.queryLocalFonts === 'function') {
    try {
      const fonts = await globalThis.queryLocalFonts();
      const families = [...new Set(fonts.map((font) => font.family))].sort((a, b) => a.toLowerCase().localeCompare(b.toLowerCase()));
      if (families.length) return families;
    } catch { /* permission denied: fall back to probing */ }
  }
  return WEB_FONT_CANDIDATES.filter((family) => {
    try { return document.fonts.check(`12px "${family}"`) && fontInstalled(family); } catch { return false; }
  });
}

/** document.fonts.check() is true for unknown fonts too; compare rendered widths against fallbacks. */
function fontInstalled(family) {
  const canvas = fontInstalled.canvas ?? (fontInstalled.canvas = document.createElement('canvas'));
  const context = canvas.getContext('2d');
  const sample = 'mmmmmmmmmmlli가나다WW';
  return ['monospace', 'serif', 'sans-serif'].some((fallback) => {
    context.font = `32px ${fallback}`;
    const base = context.measureText(sample).width;
    context.font = `32px "${family}", ${fallback}`;
    return context.measureText(sample).width !== base;
  });
}

// ───────────────────────── window

export const setWindowTheme = (dark) => (isDesktop() ? getCurrentWindow().setTheme(dark ? 'dark' : 'light').catch(() => {}) : Promise.resolve());

export async function setMinimumSize(width, height) {
  if (!isDesktop()) return;
  const appWindow = getCurrentWindow();
  await appWindow.setMinSize(new LogicalSize(width, height));
  // An already narrower window grows to the new minimum at once.
  if (window.innerWidth < width - 1) await appWindow.setSize(new LogicalSize(width, Math.max(height, window.innerHeight)));
}

export const quitApp = () => (isDesktop() ? invoke('quit_app') : Promise.resolve());

// ───────────────────────── clipboard

export async function clipboardWrite(text) {
  if (isDesktop()) return invoke('clipboard_write', { text });
  return navigator.clipboard.writeText(text);
}

export async function clipboardRead() {
  if (isDesktop()) return invoke('clipboard_read');
  return navigator.clipboard.readText();
}
