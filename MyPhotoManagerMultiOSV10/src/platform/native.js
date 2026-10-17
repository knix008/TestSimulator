// The desktop app's Rust backend (Tauri). Every call is desktop-only; the web
// build never reaches these (see fs.js for the shared file API).
import { convertFileSrc, invoke as tauriInvoke } from '@tauri-apps/api/core';
import { listen as tauriListen } from '@tauri-apps/api/event';
import { getCurrentWindow } from '@tauri-apps/api/window';
import { open as openDialog, save as saveDialog } from '@tauri-apps/plugin-dialog';

export const isDesktop = () => Boolean(globalThis.window?.__TAURI_INTERNALS__);

export const invoke = (command, args, options) => tauriInvoke(command, args, options);

const recentErrors = [];

/** Readable text of anything thrown (Rust errors arrive as strings). */
export function errorText(error) {
  if (error instanceof Error) {
    recentErrors.push(error);
    if (recentErrors.length > 16) recentErrors.shift();
  }
  return error instanceof Error ? error.message : typeof error === 'string' ? error : JSON.stringify(error) ?? String(error);
}

function formatError(error, depth = 0) {
  if (error == null || depth > 4) return '';
  if (error instanceof Error) {
    const head = error.stack || `${error.name}: ${error.message}`;
    return error.cause != null ? `${head}\n\nCause:\n${formatError(error.cause, depth + 1)}` : head;
  }
  if (typeof error === 'string') return error;
  try { return JSON.stringify(error, null, 2); } catch { return String(error); }
}

/** Full text for an error popup: the message, then the stack when one was just thrown. */
export function errorDetails(value) {
  if (value instanceof Error) return formatError(value);
  if (typeof value !== 'string') return formatError(value);
  const hit = [...recentErrors].reverse().find((error) => error.message && (value === error.message || value.endsWith(error.message)) && error.stack);
  if (hit && !value.includes(hit.stack)) return `${value}\n\n${formatError(hit)}`;
  return value;
}

export const assetUrl = (path) => convertFileSrc(path);

export async function listen(event, handler) {
  if (!isDesktop()) return () => {};
  return tauriListen(event, (message) => handler(message.payload));
}

/** OS files dragged over or dropped on the window. The handler receives the Tauri payload (type, paths, position). */
export async function onFileDrop(handler) {
  if (!isDesktop()) return () => {};
  const { getCurrentWebview } = await import('@tauri-apps/api/webview');
  return getCurrentWebview().onDragDropEvent((event) => handler(event.payload));
}

/** Starts an OS file drag of real paths. Resolves when the user drops or cancels. Desktop only. */
export function startFileDrag(paths) {
  if (!isDesktop() || !paths?.length) return Promise.resolve(false);
  return invoke('start_file_drag', { paths }).then(() => true);
}

// E2E tests answer the native pickers by pushing to window.__myphotoPicks
// (one answer per call: a path, an array of paths, or null for Cancel).
const testPick = () => (globalThis.__myphotoPicks?.length ? { value: globalThis.__myphotoPicks.shift() } : null);

export async function chooseFolder(defaultPath) {
  const pick = testPick();
  if (pick) return pick.value;
  const result = await openDialog({ directory: true, multiple: false, defaultPath: defaultPath || undefined });
  return Array.isArray(result) ? result[0] ?? null : result ?? null;
}

export async function chooseFiles(filters, defaultPath) {
  const pick = testPick();
  if (pick) return pick.value ?? [];
  const result = await openDialog({ directory: false, multiple: true, defaultPath: defaultPath || undefined, filters });
  if (!result) return [];
  return Array.isArray(result) ? result : [result];
}

export async function chooseSavePath(defaultPath, filters) {
  const pick = testPick();
  if (pick) return pick.value === true ? defaultPath : pick.value;
  return (await saveDialog({ defaultPath: defaultPath || undefined, filters })) ?? null;
}

export async function setFullscreen(on) {
  if (!isDesktop()) return;
  await getCurrentWindow().setFullscreen(on).catch(() => {});
}

/** Starts resizing the window from its bottom-right corner (the status bar grip). */
export const startWindowResize = () => (isDesktop() ? getCurrentWindow().startResizeDragging('SouthEast').catch(() => {}) : Promise.resolve());

export const setWindowTheme = (dark) => (isDesktop() ? getCurrentWindow().setTheme(dark ? 'dark' : 'light').catch(() => {}) : Promise.resolve());
export const showWindow = () => (isDesktop() ? getCurrentWindow().show().catch(() => {}) : Promise.resolve());
/** The user asked to close the window (the title-bar button, Alt+F4). `preventDefault` keeps it open. */
export function onCloseRequested(handler) {
  if (!isDesktop()) return Promise.resolve(() => {});
  return getCurrentWindow().onCloseRequested(handler);
}

export const setWindowTitle = (title) => {
  document.title = title;
  return isDesktop() ? getCurrentWindow().setTitle(title).catch(() => {}) : Promise.resolve();
};
