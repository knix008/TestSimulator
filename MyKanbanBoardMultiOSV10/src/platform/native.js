// Platform boundary. The desktop app (Tauri) calls the Rust backend; the web
// build uses browser APIs (File System Access when available, downloads
// otherwise, IndexedDB for large data). Everything platform-specific is here.
import { convertFileSrc, invoke as tauriInvoke } from '@tauri-apps/api/core';
import { emitTo as tauriEmitTo, listen as tauriListen } from '@tauri-apps/api/event';
import { getCurrentWindow, LogicalSize } from '@tauri-apps/api/window';
import { open as openDialog, save as saveDialog } from '@tauri-apps/plugin-dialog';
import { t } from '../i18n.js';
import { idbDelete, idbGet, idbSet } from './idb.js';

export const isDesktop = () => Boolean(globalThis.window?.__TAURI_INTERNALS__);

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
    name: 'MyKanbanBoard', version: BUILD.version, commit: BUILD.commit, buildDate: BUILD.date, target: 'web (browser)',
    profile: import.meta.env?.MODE ?? 'production', tauri: '-', rustc: '-', os: navigator.userAgentData?.platform ?? navigator.platform ?? 'web',
    arch: '-', web: true, uiBuild: BUILD,
  };
}

export const setBackendLanguage = (language) => (isDesktop() ? invoke('set_language', { language }).catch(() => {}) : Promise.resolve());
export const startupFiles = () => (isDesktop() ? invoke('startup_files') : Promise.resolve([]));

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

const BOARD_FILTERS = () => [
  { name: 'MyKanbanBoard (*.mkanban, *.mkproj, *.json)', extensions: ['mkanban', 'mkproj', 'json'] },
  { name: 'MyKanbanBoard Board (*.mkanban)', extensions: ['mkanban'] },
  { name: 'MyKanbanBoard Project (*.mkproj)', extensions: ['mkproj'] },
  { name: 'JSON (*.json)', extensions: ['json'] },
];
const SAVE_FILTERS = () => [{ name: 'MyKanbanBoard Board (*.mkanban)', extensions: ['mkanban'] }, { name: 'JSON (*.json)', extensions: ['json'] }];
const PROJECT_FILTERS = () => [{ name: 'MyKanbanBoard Project (*.mkproj)', extensions: ['mkproj'] }];
const IMAGE_EXTENSIONS = ['png', 'jpg', 'jpeg', 'gif', 'webp', 'bmp', 'svg', 'avif', 'ico'];

export async function chooseBoardToOpen(defaultPath) {
  const result = await openDialog({ multiple: true, directory: false, defaultPath: defaultPath ?? undefined, filters: BOARD_FILTERS() });
  if (!result) return [];
  return Array.isArray(result) ? result : [result];
}

export async function chooseBoardToSave(defaultPath) {
  return (await saveDialog({ defaultPath: defaultPath ?? undefined, filters: SAVE_FILTERS() })) ?? null;
}

export async function chooseProjectToOpen(defaultPath) {
  const result = await openDialog({ multiple: false, directory: false, defaultPath: defaultPath ?? undefined, filters: PROJECT_FILTERS() });
  return Array.isArray(result) ? result[0] ?? null : result ?? null;
}

export async function chooseProjectToSave(defaultPath) {
  return (await saveDialog({ defaultPath: defaultPath ?? undefined, filters: PROJECT_FILTERS() })) ?? null;
}

export async function chooseAnyFiles(defaultPath) {
  const result = await openDialog({ multiple: true, directory: false, defaultPath: defaultPath ?? undefined });
  if (!result) return [];
  return Array.isArray(result) ? result : [result];
}

export async function chooseFileToSave(defaultPath) {
  return (await saveDialog({ defaultPath: defaultPath ?? undefined })) ?? null;
}

export async function chooseDatabaseFile(defaultPath) {
  return (await saveDialog({ defaultPath: defaultPath ?? undefined, filters: [{ name: 'SQLite (*.db, *.sqlite)', extensions: ['db', 'sqlite', 'sqlite3'] }] })) ?? null;
}

// ───────────────────────── attachments & databases (desktop)

export const readFileBase64 = (path, op) => invoke('read_file_base64', { path, op });
export const writeBase64File = (path, data, op) => invoke('write_base64_file', { path, data, op });
export const openAttachment = (name, data) => invoke('open_attachment', { name, data });
export const dbTest = (config) => invoke('db_test', { config });
export const dbSave = (config, project, boards) => invoke('db_save', { config, project, boards });
export const dbLoad = (config, projectId) => invoke('db_load', { config, projectId });
export const dbList = (config) => invoke('db_list', { config });

export async function chooseImage(defaultPath) {
  const result = await openDialog({ multiple: false, directory: false, defaultPath: defaultPath ?? undefined, filters: [{ name: 'Images', extensions: IMAGE_EXTENSIONS }] });
  return Array.isArray(result) ? result[0] ?? null : result ?? null;
}

// ───────────────────────── files (web)

export const hasFileSystemAccess = () => typeof globalThis.showOpenFilePicker === 'function';

const WEB_TYPES = [{ description: 'MyKanbanBoard', accept: { 'application/json': ['.mkanban', '.mkproj', '.json'] } }];
const WEB_PROJECT_TYPES = [{ description: 'MyKanbanBoard Project', accept: { 'application/json': ['.mkproj'] } }];

/** Web: lets the user pick board files; returns [{ name, text, handle }]. */
export async function pickBoardFilesWeb({ project = false } = {}) {
  if (hasFileSystemAccess()) {
    let handles;
    try {
      handles = await globalThis.showOpenFilePicker({ id: 'mykanban-boards', multiple: !project, types: project ? WEB_PROJECT_TYPES : WEB_TYPES });
    } catch (error) {
      if (error?.name === 'AbortError') return [];
      throw error;
    }
    return Promise.all(handles.map(async (handle) => {
      const file = await handle.getFile();
      return { name: file.name, text: await file.text(), handle, size: file.size };
    }));
  }
  const files = await pickWithInput(project ? '.mkproj' : '.mkanban,.mkproj,.json,application/json', !project);
  return Promise.all(files.map(async (file) => ({ name: file.name, text: await file.text(), handle: null, size: file.size })));
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
export async function saveBoardWeb(text, { name, handle, saveAs, project = false }) {
  if (handle && !saveAs && typeof handle.createWritable === 'function') {
    await writeHandle(handle, text);
    return { name: handle.name, handle };
  }
  if (typeof globalThis.showSaveFilePicker === 'function') {
    let picked;
    try {
      picked = await globalThis.showSaveFilePicker({ id: 'mykanban-boards', suggestedName: name, types: project ? WEB_PROJECT_TYPES : WEB_TYPES });
    } catch (error) {
      if (error?.name === 'AbortError') return null;
      throw error;
    }
    await writeHandle(picked, text);
    return { name: picked.name, handle: picked };
  }
  const url = URL.createObjectURL(new Blob([text], { type: 'application/json' }));
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

export const printWindow = () => (isDesktop() ? invoke('print_window') : Promise.resolve(window.print()));
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
