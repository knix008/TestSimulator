// The one place that knows whether the page runs in the desktop app (Tauri) or a browser.
// Desktop: native dialogs, files on disk, OS windows for the guide and the print preview.
// Web: <input type=file>, downloads, a browser tab for the guide and a frame for printing.
export const isDesktop = () => Boolean(globalThis.__TAURI_INTERNALS__);

let core = null;
async function tauri() {
  if (!core) core = await import('@tauri-apps/api/core');
  return core;
}

export async function invoke(command, args) {
  return (await tauri()).invoke(command, args);
}

export function bytesToBase64(bytes) {
  let bin = '';
  for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
  return btoa(bin);
}

export function base64ToBytes(base64) {
  const bin = atob(base64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i += 1) out[i] = bin.charCodeAt(i);
  return out;
}

const MIME = { png: 'image/png', ico: 'image/x-icon', icns: 'image/icns', svg: 'image/svg+xml', zip: 'application/zip', myico: 'application/json' };

/** Web: offers bytes as a download. */
export function download(bytes, name) {
  const ext = name.split('.').pop().toLowerCase();
  const url = URL.createObjectURL(new Blob([bytes], { type: MIME[ext] ?? 'application/octet-stream' }));
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 4000);
}

/** Desktop: asks where to save; returns the path or null (cancelled). */
export async function chooseSavePath(defaultName, filterName, extensions) {
  const { save } = await import('@tauri-apps/plugin-dialog');
  return save({ defaultPath: defaultName, filters: [{ name: filterName, extensions }] });
}

/** Desktop: asks for files to open; returns paths (empty when cancelled). */
export async function chooseOpenPaths(filterName, extensions, multiple = false) {
  const { open } = await import('@tauri-apps/plugin-dialog');
  const picked = await open({ multiple, filters: [{ name: filterName, extensions }] });
  if (!picked) return [];
  return Array.isArray(picked) ? picked : [picked];
}

export async function chooseFolder() {
  const { open } = await import('@tauri-apps/plugin-dialog');
  return open({ directory: true });
}

/** Saves bytes: desktop asks for a path (returns it), web downloads (returns the name). Null = cancelled. */
export async function saveBytes(bytes, defaultName, filterName, extensions) {
  if (!isDesktop()) { download(bytes, defaultName); return defaultName; }
  const path = await chooseSavePath(defaultName, filterName, extensions);
  if (!path) return null;
  await invoke('write_base64_file', { path, data: bytesToBase64(bytes) });
  return path;
}

/** Saves several files: desktop into a chosen folder, web as one ZIP download. */
export async function saveMany(files, zipName) {
  if (!isDesktop()) {
    const { default: JSZip } = await import('jszip');
    const zip = new JSZip();
    for (const file of files) zip.file(file.name, file.bytes);
    download(await zip.generateAsync({ type: 'uint8array' }), zipName);
    return zipName;
  }
  const dir = await chooseFolder();
  if (!dir) return null;
  await invoke('write_files_to_dir', { dir, items: files.map((file) => ({ name: file.name, data: bytesToBase64(file.bytes) })) });
  return dir;
}

/** Web: lets the user pick files with the browser's file box. */
export function pickBrowserFiles(accept, multiple = false) {
  return new Promise((resolve) => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = accept;
    input.multiple = multiple;
    input.style.display = 'none';
    input.addEventListener('change', () => { resolve([...input.files]); input.remove(); });
    input.addEventListener('cancel', () => { resolve([]); input.remove(); });
    document.body.appendChild(input);
    input.click();
  });
}

// ── Windows ──────────────────────────────────────────────────────────────────

export async function currentWindow() {
  const { getCurrentWindow } = await import('@tauri-apps/api/window');
  return getCurrentWindow();
}

export async function windowControl(action) {
  if (!isDesktop()) return;
  const win = await currentWindow();
  if (action === 'minimize') await win.minimize();
  else if (action === 'maximize') await win.toggleMaximize();
  else if (action === 'close') await win.close();
}

/** Starts moving (no edge) or resizing (edge) the frameless window from a pointer press. */
export function windowDrag(edge = null) {
  if (!isDesktop()) return;
  invoke('window_drag', { edge }).catch(async () => {
    // macOS / Linux: the backend moves the window; resizing goes through the window API.
    if (edge) (await currentWindow()).startResizeDragging(edge).catch(() => {});
  });
}

export async function listen(event, handler) {
  if (!isDesktop()) return () => {};
  const { listen: on } = await import('@tauri-apps/api/event');
  return on(event, (e) => handler(e.payload));
}

/**
 * A browser window of its own (not a tab) for one of the program's pages, placed beside the
 * current window. Returns the window, or null when the browser blocked it.
 */
export function openBrowserWindow(url, name, width, height) {
  const left = Math.max(0, Math.round((globalThis.screenX ?? 0) + 60));
  const top = Math.max(0, Math.round((globalThis.screenY ?? 0) + 40));
  const win = globalThis.open(url, name, `popup=yes,width=${width},height=${height},left=${left},top=${top},resizable=yes,scrollbars=yes`);
  win?.focus?.();
  return win ?? null;
}

/** The user's guide: an OS window (desktop) or a browser window of its own (web). */
export async function openGuide(lang, title, chapter = '') {
  if (isDesktop()) return invoke('open_guide_window', { title, lang, chapter });
  const url = `${location.pathname}?viewer=guide&lang=${lang}${chapter ? `&chapter=${chapter}` : ''}`;
  if (!openBrowserWindow(url, 'myicomaker-guide', 1040, 760)) globalThis.open(url, '_blank');
  return undefined;
}

export async function openExternal(target) {
  if (isDesktop()) return invoke('open_external', { target });
  globalThis.open(target, '_blank', 'noopener');
  return undefined;
}
