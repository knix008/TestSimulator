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
    name: 'MyHomeMaker', version: BUILD.version, commit: BUILD.commit, buildDate: BUILD.date, target: 'web (browser)',
    profile: import.meta.env?.MODE ?? 'production', tauri: '-', rustc: '-', os: navigator.userAgentData?.platform ?? navigator.platform ?? 'web',
    arch: '-', web: true, uiBuild: BUILD,
  };
}

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

const SITE_FILTERS = () => [
  { name: 'MyHomeMaker (*.myhome, *.mhomt)', extensions: ['myhome', 'mhomt', 'json'] },
  { name: 'MyHomeMaker Site (*.myhome)', extensions: ['myhome'] },
  { name: 'MyHomeMaker Template (*.mhomt)', extensions: ['mhomt'] },
];
/** Save types: the site, a template, a page, a ZIP archive. */
export const SAVE_TYPES = {
  myhome: { name: 'MyHomeMaker Site (*.myhome)', extensions: ['myhome'] },
  mhomt: { name: 'MyHomeMaker Template (*.mhomt)', extensions: ['mhomt'] },
  html: { name: 'HTML (*.html)', extensions: ['html', 'htm'] },
  zip: { name: 'ZIP (*.zip)', extensions: ['zip'] },
  json: { name: 'JSON (*.json)', extensions: ['json'] },
};
const IMAGE_EXTENSIONS = ['png', 'jpg', 'jpeg', 'gif', 'webp', 'bmp', 'svg', 'avif', 'ico'];

// Tests answer the system file dialogs through these (E2E only; normal use never sets them).
const testPick = (name) => {
  const queue = globalThis.window?.[name];
  return Array.isArray(queue) && queue.length ? { value: queue.shift() } : null;
};

/** Open dialog with given filters ([{ name, extensions }]); multiple → array. */
export async function chooseFiles(defaultPath, filters, multiple = true) {
  const picked = testPick('__myhomemakerOpenPicks');
  if (picked) return [].concat(picked.value ?? []);
  const result = await openDialog({ multiple, directory: false, defaultPath: defaultPath ?? undefined, filters });
  if (!result) return [];
  return Array.isArray(result) ? result : [result];
}

export async function chooseSitesToOpen(defaultPath) {
  const picked = testPick('__myhomemakerOpenPicks');
  if (picked) return [].concat(picked.value ?? []);
  const result = await openDialog({ multiple: false, directory: false, defaultPath: defaultPath ?? undefined, filters: SITE_FILTERS() });
  if (!result) return [];
  return Array.isArray(result) ? result : [result];
}

/** Save dialog for one of SAVE_TYPES (the first listed is preselected). */
export async function chooseSavePath(defaultPath, types = ['myhome']) {
  const picked = testPick('__myhomemakerSavePicks');
  if (picked) return picked.value;
  return (await saveDialog({ defaultPath: defaultPath ?? undefined, filters: types.map((type) => SAVE_TYPES[type]) })) ?? null;
}

export async function chooseFolder(defaultPath) {
  const picked = testPick('__myhomemakerFolderPicks');
  if (picked) return picked.value;
  const result = await openDialog({ multiple: false, directory: true, defaultPath: defaultPath ?? undefined });
  return Array.isArray(result) ? result[0] ?? null : result ?? null;
}

export async function chooseImage(defaultPath) {
  const picked = testPick('__myhomemakerImagePicks');
  if (picked) return picked.value;
  const result = await openDialog({ multiple: false, directory: false, defaultPath: defaultPath ?? undefined, filters: [{ name: 'Images', extensions: IMAGE_EXTENSIONS }] });
  return Array.isArray(result) ? result[0] ?? null : result ?? null;
}

export const writeBase64File = (path, data, op) => invoke('write_base64_file', { path, data, op });
/** Binary file contents as base64 (pictures). */
export const readBase64File = (path, op) => invoke('read_base64_file', { path, op });

// ───────────────────────── publishing (desktop)

const fileEntry = (file) => (typeof file.data === 'string' ? { path: file.path, text: file.data, base64: null } : { path: file.path, text: null, base64: bytesToBase64Local(file.data) });
function bytesToBase64Local(bytes) {
  let binary = '';
  for (let i = 0; i < bytes.length; i += 0x8000) binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(binary);
}
/** Writes the site's files into a folder (made when missing); returns how many were written. */
export const writeSiteFiles = (dir, files, op) => invoke('write_site_files', { dir, files: files.map(fileEntry), op });
/** Writes the site into a temporary folder and opens the given page in the system browser. */
export const previewSite = (files, page = 'index.html') => invoke('preview_site', { files: files.map(fileEntry), page });

export const openDocument = (name) => (isDesktop() ? invoke('open_document', { name }) : Promise.resolve(globalThis.open(`./docs/${name}`, '_blank')));
export const openExternal = (target) => (isDesktop() ? invoke('open_external', { target }) : Promise.resolve(globalThis.open(target, '_blank', 'noopener')));

// ───────────────────────── files (web)

export const hasFileSystemAccess = () => typeof globalThis.showOpenFilePicker === 'function';

const WEB_TYPES = [{ description: 'MyHomeMaker', accept: { 'application/json': ['.myhome', '.mhomt', '.json'] } }];
const isBinaryName = () => false;
const readContent = async (file) => (isBinaryName(file.name) ? new Uint8Array(await file.arrayBuffer()) : file.text());

/** Web: lets the user pick drawing files; returns [{ name, content (text or bytes), handle }]. */
export async function pickSiteFilesWeb() {
  if (hasFileSystemAccess()) {
    let handles;
    try {
      handles = await globalThis.showOpenFilePicker({ id: 'myhomemaker', multiple: false, types: WEB_TYPES });
    } catch (error) {
      if (error?.name === 'AbortError') return [];
      throw error;
    }
    return Promise.all(handles.map(async (handle) => {
      const file = await handle.getFile();
      return { name: file.name, content: await readContent(file), handle, size: file.size };
    }));
  }
  const files = await pickWithInput('.myhome,.mhomt,.json,application/json', false);
  return Promise.all(files.map(async (file) => ({ name: file.name, content: await readContent(file), handle: null, size: file.size })));
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
      picked = await globalThis.showSaveFilePicker({ id: 'myhomemaker', suggestedName: name, types: [{ description: 'MyHomeMaker', accept: { [mime]: [extension] } }] });
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

/** The window's minimum (the toolbar's width): kept by the backend also against Snap and other programs. */
export async function setMinimumSize(width, height) {
  if (!isDesktop()) return;
  await invoke('window_min_size', { width, height });
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
