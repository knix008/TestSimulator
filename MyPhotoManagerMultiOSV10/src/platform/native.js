// The desktop app's Rust backend (Tauri). Every call is desktop-only; the web
// build never reaches these (see fs.js for the shared file API).
import { convertFileSrc, invoke as tauriInvoke } from '@tauri-apps/api/core';
import { listen as tauriListen } from '@tauri-apps/api/event';
import { getCurrentWindow } from '@tauri-apps/api/window';
import { open as openDialog, save as saveDialog } from '@tauri-apps/plugin-dialog';

export const isDesktop = () => Boolean(globalThis.window?.__TAURI_INTERNALS__);

export const invoke = (command, args, options) => tauriInvoke(command, args, options);

/** Readable text of anything thrown (Rust errors arrive as strings). */
export const errorText = (error) => (error instanceof Error ? error.message : typeof error === 'string' ? error : JSON.stringify(error) ?? String(error));

export const assetUrl = (path) => convertFileSrc(path);

export async function listen(event, handler) {
  if (!isDesktop()) return () => {};
  return tauriListen(event, (message) => handler(message.payload));
}

/** OS files dropped on the window: handler(paths). */
export async function onFileDrop(handler, onHover) {
  if (!isDesktop()) return () => {};
  const { getCurrentWebview } = await import('@tauri-apps/api/webview');
  return getCurrentWebview().onDragDropEvent((event) => {
    const { type, paths } = event.payload;
    if (type === 'drop') { onHover?.(false); if (paths?.length) handler(paths); }
    else if (type === 'enter' || type === 'over') onHover?.(true);
    else onHover?.(false);
  });
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
export const setWindowTitle = (title) => (isDesktop() ? getCurrentWindow().setTitle(title).catch(() => {}) : Promise.resolve((document.title = title)));
