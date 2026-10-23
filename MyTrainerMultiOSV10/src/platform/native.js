// Platform boundary. The desktop app (Tauri) calls the Rust backend; the web
// build uses browser APIs (File System Access when available, downloads
// otherwise). Everything platform-specific is here.
import { invoke as tauriInvoke } from '@tauri-apps/api/core';
import { emitTo as tauriEmitTo, listen as tauriListen } from '@tauri-apps/api/event';
import { getCurrentWindow, LogicalSize } from '@tauri-apps/api/window';
import { open as openDialog, save as saveDialog } from '@tauri-apps/plugin-dialog';
import { t } from '../i18n.js';

// A popup shown as a frame inside the main window (web build) works like the web build.
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
    name: 'MyTrainer', version: BUILD.version, commit: BUILD.commit, buildDate: BUILD.date, target: 'web (browser)',
    profile: import.meta.env?.MODE ?? 'production', tauri: '-', rustc: '-', os: navigator.userAgentData?.platform ?? navigator.platform ?? 'web',
    arch: '-', web: true, uiBuild: BUILD,
  };
}

export const setBackendLanguage = (language) => (isDesktop() ? invoke('set_language', { language }).catch(() => {}) : Promise.resolve());
export const startupFiles = () => (isDesktop() ? invoke('startup_files') : Promise.resolve([]));
export const instanceInfo = () => (isDesktop() ? invoke('instance_info') : Promise.resolve({ first: true, others: 0 }));

// ───────────────────────── events between windows

export async function listen(event, handler) {
  if (!isDesktop()) return () => {};
  return tauriListen(event, (message) => handler(message.payload));
}

export const emitTo = (target, event, payload) => (isDesktop() ? tauriEmitTo(target, event, payload) : Promise.resolve());

// ───────────────────────── files (desktop)

export const readTextFile = (path, op = 'open') => invoke('read_text_file', { path, op });
export const writeTextFile = (path, content, op = 'save') => invoke('write_text_file', { path, content, op });
export const readBase64File = (path, op = 'open') => invoke('read_base64_file', { path, op });
export const writeBase64File = (path, data, op = 'save') => invoke('write_base64_file', { path, data, op });
export const pathsExist = (paths) => (isDesktop() ? invoke('paths_exist', { paths }) : Promise.resolve(paths.map(() => true)));
export const listImageFolder = (dir, limit = 2000, extensions = null) => invoke('list_image_folder', { dir, limit, extensions });

export const FILE_TYPES = {
  mytrain: { name: 'MyTrainer Project (*.mytrain)', extensions: ['mytrain'] },
  csv: { name: 'CSV / TSV (*.csv, *.tsv, *.txt)', extensions: ['csv', 'tsv', 'txt'] },
  py: { name: 'Python (*.py)', extensions: ['py'] },
  png: { name: 'PNG (*.png)', extensions: ['png'] },
  json: { name: 'JSON (*.json)', extensions: ['json'] },
};

// Tests answer the system file dialogs through these (E2E only; normal use never sets them).
const testPick = (name) => {
  const queue = globalThis.window?.[name];
  return Array.isArray(queue) && queue.length ? { value: queue.shift() } : null;
};

export async function chooseOpenPath(types = ['mytrain'], defaultPath = null) {
  const picked = testPick('__mytrainerOpenPicks');
  if (picked) return picked.value;
  const result = await openDialog({ multiple: false, directory: false, defaultPath: defaultPath ?? undefined, filters: types.map((type) => FILE_TYPES[type]) });
  return Array.isArray(result) ? result[0] ?? null : result ?? null;
}

/** Several files of the given extensions (desktop). */
export async function chooseOpenPaths(extensions, name = 'Files') {
  const picked = testPick('__mytrainerOpenPicks');
  if (picked) return [].concat(picked.value ?? []);
  const result = await openDialog({ multiple: true, directory: false, filters: [{ name, extensions }] });
  if (!result) return [];
  return Array.isArray(result) ? result : [result];
}

export const listFolderFiles = (dir, extensions, limit = 2000) => invoke('list_folder_files', { dir, extensions, limit });

export async function chooseSavePath(defaultPath, types = ['mytrain']) {
  const picked = testPick('__mytrainerSavePicks');
  if (picked) return picked.value;
  return (await saveDialog({ defaultPath: defaultPath ?? undefined, filters: types.map((type) => FILE_TYPES[type]) })) ?? null;
}

export async function chooseFolder(defaultPath = null) {
  const picked = testPick('__mytrainerFolderPicks');
  if (picked) return picked.value;
  const result = await openDialog({ multiple: false, directory: true, defaultPath: defaultPath ?? undefined });
  return Array.isArray(result) ? result[0] ?? null : result ?? null;
}

/** The user's guide in its own window (desktop: an app window; web: a browser window). */
export function openGuideWindow(name, title) {
  if (isDesktop()) return invoke('open_doc_window', { name, title });
  const win = globalThis.open(`./docs/${name}`, 'mytrainer-guide', 'popup=yes,width=1000,height=820');
  win?.focus();
  return Promise.resolve();
}

export const openDocument = (name) => (isDesktop() ? invoke('open_document', { name }) : Promise.resolve(globalThis.open(`./docs/${name}`, '_blank')));
export const openExternal = (target) => (isDesktop() ? invoke('open_external', { target }) : Promise.resolve(globalThis.open(target, '_blank', 'noopener')));

// ───────────────────────── files (web)

export const hasFileSystemAccess = () => typeof globalThis.showOpenFilePicker === 'function';

export function pickWithInput(accept, { multiple = false, directory = false } = {}) {
  return new Promise((resolve) => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = accept;
    input.multiple = multiple;
    if (directory) input.webkitdirectory = true;
    input.style.display = 'none';
    input.addEventListener('change', () => { resolve([...(input.files ?? [])]); input.remove(); });
    input.addEventListener('cancel', () => { resolve([]); input.remove(); });
    document.body.append(input);
    input.click();
  });
}

/** Web: lets the user pick a file; returns { name, text, handle } or null. */
export async function pickTextFileWeb(accept, description = 'MyTrainer') {
  if (hasFileSystemAccess()) {
    try {
      const [handle] = await globalThis.showOpenFilePicker({ id: 'mytrainer', multiple: false, types: [{ description, accept: { 'application/octet-stream': accept.split(',') } }] });
      const file = await handle.getFile();
      return { name: file.name, text: await file.text(), handle };
    } catch (error) {
      if (error?.name === 'AbortError') return null;
      throw error;
    }
  }
  const [file] = await pickWithInput(accept);
  return file ? { name: file.name, text: await file.text(), handle: null } : null;
}

/** Web save: back into the file's handle, a save picker, or a download. Returns { name, handle } or null. */
export async function saveFileWeb(content, { name, handle = null, saveAs = false, mime = 'application/json' }) {
  if (handle && !saveAs && typeof handle.createWritable === 'function') {
    await writeHandle(handle, content);
    return { name: handle.name, handle };
  }
  if (typeof globalThis.showSaveFilePicker === 'function') {
    let picked;
    try {
      const extension = `.${String(name).split('.').pop()}`;
      picked = await globalThis.showSaveFilePicker({ id: 'mytrainer', suggestedName: name, types: [{ description: 'MyTrainer', accept: { [mime]: [extension] } }] });
    } catch (error) {
      if (error?.name === 'AbortError') return null;
      throw error;
    }
    await writeHandle(picked, content);
    return { name: picked.name, handle: picked };
  }
  downloadBlob(content instanceof Blob ? content : new Blob([content], { type: mime }), name);
  return { name, handle: null };
}

export function downloadBlob(blob, name) {
  const url = URL.createObjectURL(blob);
  const link = Object.assign(document.createElement('a'), { href: url, download: name });
  document.body.append(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}

async function writeHandle(handle, content) {
  if (handle.requestPermission && (await handle.queryPermission?.({ mode: 'readwrite' })) !== 'granted') {
    await handle.requestPermission({ mode: 'readwrite' });
  }
  const writable = await handle.createWritable();
  await writable.write(content);
  await writable.close();
}

// ───────────────────────── Python / PyTorch (desktop)

export const pyDetect = () => invoke('py_detect');
export const pyInstallTorch = (base, variant) => invoke('py_install_torch', { base, variant });
export const pyInstallPython = () => invoke('py_install_python');
export const pySetup = () => invoke('py_setup');
export const pyCancelInstall = () => invoke('py_cancel_install').catch(() => {});
export const pyRun = (python, code, files) => invoke('py_run', { python, code, files });
export const pySend = (run, line) => invoke('py_send', { run, line });
export const pyStop = (run) => invoke('py_stop', { run }).catch(() => {});
export const pyRunDir = (run) => invoke('py_run_dir', { run });

// ───────────────────────── fonts

const WEB_FONT_CANDIDATES = ['Arial', 'Bahnschrift', 'Calibri', 'Cambria', 'Consolas', 'Courier New', 'Georgia', 'Malgun Gothic', '맑은 고딕', 'Gulim', 'Nanum Gothic', '나눔고딕',
  'Noto Sans KR', 'Apple SD Gothic Neo', 'Menlo', 'Monaco', 'Segoe UI', 'Tahoma', 'Times New Roman', 'Trebuchet MS', 'Verdana', 'Ubuntu', 'DejaVu Sans', 'Roboto', 'Inter'];

export async function listFonts() {
  if (isDesktop()) return invoke('list_fonts');
  if (typeof globalThis.queryLocalFonts === 'function') {
    try {
      const fonts = await globalThis.queryLocalFonts();
      const families = [...new Set(fonts.map((font) => font.family))].sort((a, b) => a.toLowerCase().localeCompare(b.toLowerCase()));
      if (families.length) return families;
    } catch { /* permission denied */ }
  }
  return WEB_FONT_CANDIDATES.filter((family) => {
    try { return document.fonts.check(`12px "${family}"`); } catch { return false; }
  });
}

// ───────────────────────── window

export const setWindowTheme = (dark) => (isDesktop() ? getCurrentWindow().setTheme(dark ? 'dark' : 'light').catch(() => {}) : Promise.resolve());

/** The page needs at least width × height (CSS px). The window is a little larger than the page in it (a frameless
 * window keeps a resize border around the web view, about 7 px a side on Windows), so that difference is added. */
export async function setMinimumSize(width, height) {
  if (!isDesktop()) return;
  const appWindow = getCurrentWindow();
  const inner = (await appWindow.innerSize()).toLogical(await appWindow.scaleFactor());
  const extraW = Math.max(0, Math.ceil(inner.width - window.innerWidth));
  const extraH = Math.max(0, Math.ceil(inner.height - window.innerHeight));
  await appWindow.setMinSize(new LogicalSize(width + extraW, height + extraH));
  // An already narrower window grows to the new minimum at once.
  if (window.innerWidth < width - 1 || window.innerHeight < height - 1) await appWindow.setSize(new LogicalSize(Math.max(width, window.innerWidth) + extraW, Math.max(height, window.innerHeight) + extraH));
}

export const quitApp = () => (isDesktop() ? invoke('quit_app') : Promise.resolve());

// ───────────────────────── base64 / binary helpers

export function bytesToBase64(bytes) {
  let binary = '';
  const view = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes.buffer ?? bytes, bytes.byteOffset ?? 0, bytes.byteLength);
  for (let i = 0; i < view.length; i += 0x8000) binary += String.fromCharCode(...view.subarray(i, i + 0x8000));
  return btoa(binary);
}

export function base64ToBytes(text) {
  const binary = atob(text);
  const out = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) out[i] = binary.charCodeAt(i);
  return out;
}

export const float32ToBase64 = (values) => bytesToBase64(new Uint8Array(Float32Array.from(values).buffer));
export const base64ToFloat32 = (text) => new Float32Array(base64ToBytes(text).buffer);
