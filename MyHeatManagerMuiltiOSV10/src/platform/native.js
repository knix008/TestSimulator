// The desktop (Tauri) and browser sides of file access and window control.
// Every function works in both: on the web, files open through a file input
// and save as downloads.

export const isTauri = Boolean(globalThis.__TAURI_INTERNALS__);

let core = null;
async function tauriCore() {
  core ??= await import('@tauri-apps/api/core');
  return core;
}

export async function invoke(command, args) {
  const { invoke: call } = await tauriCore();
  return call(command, args);
}

export async function listen(event, handler) {
  if (!isTauri) return () => {};
  const { listen: on } = await import('@tauri-apps/api/event');
  return on(event, (e) => handler(e.payload));
}

/** Open dialog → { path, name, text } or null. `filters`: [{ name, extensions }]. */
export async function openTextFile(filters) {
  if (isTauri) {
    const { open } = await import('@tauri-apps/plugin-dialog');
    const path = await open({ multiple: false, filters });
    if (!path) return null;
    return readTextFile(path);
  }
  return new Promise((resolve) => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = filters.flatMap((f) => f.extensions.map((e) => `.${e}`)).join(',');
    input.onchange = async () => {
      const file = input.files?.[0];
      resolve(file ? { path: file.name, name: file.name, text: await file.text() } : null);
    };
    input.oncancel = () => resolve(null);
    input.click();
  });
}

export async function readTextFile(path) {
  const text = await invoke('read_text_file', { path, op: 'open' });
  return { path, name: path.split(/[\\/]/).pop(), text };
}

/** Save dialog; returns the chosen path (desktop) or the downloaded name (web), null when cancelled. */
export async function saveTextFile(suggestedName, text, filters, path = null) {
  if (isTauri) {
    let target = path;
    if (!target) {
      const { save } = await import('@tauri-apps/plugin-dialog');
      target = await save({ defaultPath: suggestedName, filters });
    }
    if (!target) return null;
    await invoke('write_text_file', { path: target, content: text, op: 'save' });
    return target;
  }
  download(suggestedName, new Blob([text], { type: 'text/plain;charset=utf-8' }));
  return suggestedName;
}

/** Saves binary data given as a Blob. */
export async function saveBlobFile(suggestedName, blob, filters) {
  if (isTauri) {
    const { save } = await import('@tauri-apps/plugin-dialog');
    const target = await save({ defaultPath: suggestedName, filters });
    if (!target) return null;
    const data = await blobToBase64(blob);
    await invoke('write_base64_file', { path: target, data, op: 'save' });
    return target;
  }
  download(suggestedName, blob);
  return suggestedName;
}

function download(name, blob) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}

function blobToBase64(blob) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result).split(',')[1] ?? '');
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(blob);
  });
}

export async function appInfo() {
  if (isTauri) {
    try {
      return await invoke('app_info');
    } catch { /* fall through */ }
  }
  return {
    name: __APP_NAME__, version: __APP_VERSION__, commit: __BUILD_COMMIT__, buildTime: Date.parse(__BUILD_DATE__) / 1000,
    os: 'web', arch: navigator.platform || '', engine: 'wasm', tauri: '',
  };
}

export async function startupFiles() {
  if (!isTauri) return [];
  try {
    return await invoke('startup_files');
  } catch {
    return [];
  }
}

export async function instanceInfo() {
  if (!isTauri) return { first: true, others: 0 };
  try {
    return await invoke('instance_info');
  } catch {
    return { first: true, others: 0 };
  }
}

export async function listFonts() {
  if (!isTauri) return ['Segoe UI', 'Malgun Gothic', 'Arial', 'Helvetica', 'Noto Sans KR', 'system-ui', 'Consolas'];
  try {
    return await invoke('list_fonts');
  } catch {
    return [];
  }
}

export async function setLanguageNative(language) {
  if (isTauri) invoke('set_language', { language }).catch(() => {});
}

export async function setWindowTheme(mode) {
  if (!isTauri) return;
  try {
    const { getCurrentWindow } = await import('@tauri-apps/api/window');
    await getCurrentWindow().setTheme(mode === 'light' ? 'light' : 'dark');
  } catch { /* older systems */ }
}

export async function setWindowTitle(title) {
  if (!isTauri) {
    document.title = title;
    return;
  }
  try {
    const { getCurrentWindow } = await import('@tauri-apps/api/window');
    await getCurrentWindow().setTitle(title);
  } catch { /* ignore */ }
}

/** Starts resizing the window from its bottom-right corner (the status bar's size grip). */
export async function startResize() {
  if (!isTauri) return;
  try {
    const { getCurrentWindow } = await import('@tauri-apps/api/window');
    await getCurrentWindow().startResizeDragging('SouthEast');
  } catch { /* not resizable */ }
}

/** Window buttons of the frameless window: minimize, toggleMaximize, startDragging. Calls onMaximized(bool) on changes. */
export async function windowAction(action) {
  if (!isTauri) return;
  const { getCurrentWindow } = await import('@tauri-apps/api/window');
  const win = getCurrentWindow();
  if (action === 'minimize') await win.minimize();
  else if (action === 'toggleMaximize') await win.toggleMaximize();
  else if (action === 'startDragging') await win.startDragging();
}

export async function onMaximizedChange(handler) {
  if (!isTauri) return;
  const { getCurrentWindow } = await import('@tauri-apps/api/window');
  const win = getCurrentWindow();
  const check = async () => handler(await win.isMaximized());
  await win.onResized(check);
  check();
}

/** The narrowest the window may get (CSS px): wide enough for every toolbar button. */
export async function setMinWidth(width) {
  if (!isTauri) return;
  try {
    const { getCurrentWindow } = await import('@tauri-apps/api/window');
    const { LogicalSize } = await import('@tauri-apps/api/dpi');
    const win = getCurrentWindow();
    await win.setMinSize(new LogicalSize(width, 700));
    if (window.innerWidth < width && !(await win.isMaximized())) await win.setSize(new LogicalSize(width, Math.max(700, window.innerHeight)));
  } catch { /* older systems */ }
}

export async function windowReady() {
  if (isTauri) invoke('window_ready').catch(() => {});
}

/** Leaves full screen if the window is in it (Esc). */
export async function leaveFullscreen() {
  if (isTauri) {
    const { getCurrentWindow } = await import('@tauri-apps/api/window');
    const win = getCurrentWindow();
    if (await win.isFullscreen()) await win.setFullscreen(false);
    return;
  }
  if (document.fullscreenElement) await document.exitFullscreen();
}

export async function toggleFullscreen() {
  if (isTauri) {
    const { getCurrentWindow } = await import('@tauri-apps/api/window');
    const win = getCurrentWindow();
    await win.setFullscreen(!(await win.isFullscreen()));
    return;
  }
  if (document.fullscreenElement) await document.exitFullscreen();
  else await document.documentElement.requestFullscreen?.();
}

/** Calls `handler` when the window is asked to close; the handler decides by calling quit(). */
export async function onCloseRequested(handler) {
  if (isTauri) {
    const { getCurrentWindow } = await import('@tauri-apps/api/window');
    await getCurrentWindow().onCloseRequested((event) => {
      event.preventDefault();
      handler();
    });
  } else {
    window.addEventListener('beforeunload', (event) => {
      if (handler(true)) {
        event.preventDefault();
        event.returnValue = '';
      }
    });
  }
}

export async function quit() {
  if (isTauri) await invoke('quit_app');
  else window.close();
}

export async function openExternal(url) {
  if (isTauri) return invoke('open_external', { target: url });
  window.open(url, '_blank', 'noopener');
  return undefined;
}

/** Opens docs/<base>.html (Korean) or docs/<base>.en.html: the user's guide or the tutorial document. */
export async function openGuide(language, base = 'UsersGuide', title = 'MyHeatManager') {
  const name = language === 'en' ? `${base}.en.html` : `${base}.html`;
  // A window of its own in both: an app window on the desktop, a named browser window on the web (same origin,
  // so the page reads the app's theme and follows it when it changes).
  if (isTauri) return invoke('open_doc_window', { name, title });
  const win = window.open(`./docs/${name}`, 'myheat-docs', 'width=1040,height=820');
  win?.focus();
  return undefined;
}
