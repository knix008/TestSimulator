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
    name: 'MyCAD', version: BUILD.version, commit: BUILD.commit, buildDate: BUILD.date, target: 'web (browser)',
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
/** Any file as bytes (3D models, FreeCAD documents). */
export async function readBinaryFile(path, op) {
  const base64 = await invoke('read_base64_file', { path, op });
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

/** 3D formats MyCAD reads (FreeCAD's exchange formats). */
export const MODEL_EXTENSIONS = ['fcstd', 'step', 'stp', 'stl', 'obj', 'ply', 'off', 'amf', '3mf'];
export const writeTextFile = (path, content, op) => invoke('write_text_file', { path, content, op });
export const writeBase64File = (path, data, op) => invoke('write_base64_file', { path, data, op });
export const pathsExist = (paths) => (isDesktop() ? invoke('paths_exist', { paths }) : Promise.resolve(paths.map(() => true)));

const OPEN_FILTERS = () => [
  { name: `${t('file.allDrawings')} (*.mcad, *.dxf, *.FCStd, *.step, *.stl…)`, extensions: ['mcad', 'dxf', 'json', ...MODEL_EXTENSIONS, 'FCStd'] },
  { name: 'MyCAD (*.mcad)', extensions: ['mcad'] },
  { name: 'DXF (*.dxf)', extensions: ['dxf'] },
  { name: `${t('file.models3d')} (*.FCStd, *.step, *.stl, *.obj, *.ply, *.off, *.amf, *.3mf)`, extensions: [...MODEL_EXTENSIONS, 'FCStd'] },
];
const EXPORT_FILTERS = {
  dxf: [{ name: 'DXF R12 (*.dxf)', extensions: ['dxf'] }],
  svg: [{ name: 'SVG (*.svg)', extensions: ['svg'] }],
  png: [{ name: 'PNG (*.png)', extensions: ['png'] }],
  stl: [{ name: 'STL — 3D printing (*.stl)', extensions: ['stl'] }],
  obj: [{ name: 'Wavefront OBJ (*.obj)', extensions: ['obj'] }],
  ply: [{ name: 'Stanford PLY (*.ply)', extensions: ['ply'] }],
  off: [{ name: 'Object File Format (*.off)', extensions: ['off'] }],
  amf: [{ name: 'Additive Manufacturing (*.amf)', extensions: ['amf'] }],
  '3mf': [{ name: '3D Manufacturing (*.3mf)', extensions: ['3mf'] }],
  step: [{ name: 'STEP AP214 (*.step)', extensions: ['step', 'stp'] }],
  fcstd: [{ name: 'FreeCAD (*.FCStd)', extensions: ['FCStd'] }],
};
const IMAGE_EXTENSIONS = ['png', 'jpg', 'jpeg', 'gif', 'webp', 'bmp', 'svg', 'avif', 'ico'];

export async function chooseDrawingToOpen(defaultPath, { dxf = false, models = false } = {}) {
  const filters = dxf ? [OPEN_FILTERS()[2]] : models ? [OPEN_FILTERS()[3]] : OPEN_FILTERS();
  const result = await openDialog({ multiple: true, directory: false, defaultPath: defaultPath ?? undefined, filters });
  if (!result) return [];
  return Array.isArray(result) ? result : [result];
}

export async function chooseDrawingToSave(defaultPath) {
  return (await saveDialog({ defaultPath: defaultPath ?? undefined, filters: [OPEN_FILTERS()[1]] })) ?? null;
}

export async function chooseExportPath(defaultPath, kind) {
  return (await saveDialog({ defaultPath: defaultPath ?? undefined, filters: EXPORT_FILTERS[kind] })) ?? null;
}

export async function chooseImage(defaultPath) {
  const result = await openDialog({ multiple: false, directory: false, defaultPath: defaultPath ?? undefined, filters: [{ name: 'Images', extensions: IMAGE_EXTENSIONS }] });
  return Array.isArray(result) ? result[0] ?? null : result ?? null;
}

// ───────────────────────── files (web)

export const hasFileSystemAccess = () => typeof globalThis.showOpenFilePicker === 'function';

const WEB_MODEL_ACCEPT = { 'application/octet-stream': ['.fcstd', '.step', '.stp', '.stl', '.obj', '.ply', '.off', '.amf', '.3mf'] };
const WEB_TYPES = [{ description: 'MyCAD', accept: { 'application/json': ['.mcad', '.json'], 'application/dxf': ['.dxf'], ...WEB_MODEL_ACCEPT } }];
const WEB_MODEL_TYPES = [{ description: '3D', accept: WEB_MODEL_ACCEPT }];
const isModelName = (name) => MODEL_EXTENSIONS.includes(String(name).toLowerCase().split('.').pop());
/** A picked web file: text for drawings, bytes for 3D models. */
const readWebFile = async (file, handle) => ({ name: file.name, handle, size: file.size, ...(isModelName(file.name) ? { bytes: new Uint8Array(await file.arrayBuffer()) } : { text: await file.text() }) });
const WEB_DXF_TYPES = [{ description: 'DXF', accept: { 'application/dxf': ['.dxf'] } }];
const WEB_SAVE_TYPES = [{ description: 'MyCAD', accept: { 'application/json': ['.mcad'] } }];

/** Web: lets the user pick drawing files; returns [{ name, text, handle, size }]. */
export async function pickDrawingFilesWeb({ dxf = false, models = false } = {}) {
  if (hasFileSystemAccess()) {
    let handles;
    try {
      handles = await globalThis.showOpenFilePicker({ id: 'mycad-drawings', multiple: true, types: dxf ? WEB_DXF_TYPES : models ? WEB_MODEL_TYPES : WEB_TYPES });
    } catch (error) {
      if (error?.name === 'AbortError') return [];
      throw error;
    }
    return Promise.all(handles.map(async (handle) => readWebFile(await handle.getFile(), handle)));
  }
  const models3d = '.fcstd,.step,.stp,.stl,.obj,.ply,.off,.amf,.3mf';
  const files = await pickWithInput(dxf ? '.dxf' : models ? models3d : `.mcad,.dxf,.json,${models3d}`, true);
  return Promise.all(files.map((file) => readWebFile(file, null)));
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
export async function saveTextWeb(text, { name, handle, saveAs }) {
  if (handle && !saveAs && typeof handle.createWritable === 'function') {
    await writeHandle(handle, text);
    return { name: handle.name, handle };
  }
  if (typeof globalThis.showSaveFilePicker === 'function') {
    let picked;
    try {
      picked = await globalThis.showSaveFilePicker({ id: 'mycad-drawings', suggestedName: name, types: WEB_SAVE_TYPES });
    } catch (error) {
      if (error?.name === 'AbortError') return null;
      throw error;
    }
    await writeHandle(picked, text);
    return { name: picked.name, handle: picked };
  }
  downloadText(text, name, 'application/json');
  return { name, handle: null };
}

/** Web: offers a file to the user as a download. */
export function downloadText(text, name, type = 'text/plain') {
  const url = URL.createObjectURL(new Blob([text], { type }));
  downloadDataUrl(url, name);
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}

/** Web: offers binary data (STL) as a download. */
export function downloadBytes(bytes, name, type = 'application/octet-stream') {
  const url = URL.createObjectURL(new Blob([bytes], { type }));
  downloadDataUrl(url, name);
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}

export function downloadDataUrl(url, name) {
  const link = Object.assign(document.createElement('a'), { href: url, download: name });
  document.body.append(link);
  link.click();
  link.remove();
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
  'Courier New', 'Georgia', 'Helvetica', 'Helvetica Neue', 'Impact', 'ISOCPEUR', 'Lucida Console', 'Malgun Gothic', '맑은 고딕', 'Gulim', '굴림', 'Dotum', '돋움', 'Batang', '바탕',
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
