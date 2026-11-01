// The desktop app's only way to the operating system: `window.desktopAPI`.
//
// Inside the Tauri window every call below is a #[tauri::command] in
// src-tauri/src/lib.rs (engine.rs for the engine), and every on* is an event
// the host emits to this window. In a plain browser there is no Tauri runtime,
// nothing is installed, and src/lib/platform.js falls back to the web APIs.
//
// main.jsx imports this module before anything else, because platform.js reads
// `window.desktopAPI` once, when it is first evaluated.
import { invoke } from '@tauri-apps/api/core';
import { getCurrentWebviewWindow } from '@tauri-apps/api/webviewWindow';

export function hasTauri(win = typeof window !== 'undefined' ? window : undefined) {
  return !!(win && win.__TAURI_INTERNALS__ && typeof win.__TAURI_INTERNALS__.invoke === 'function');
}

// One host listener per event, fanned out to every subscriber. Events that
// arrive before anyone subscribes (a file handed over while the app is still
// loading its settings, the engine's first log lines) are kept for the first
// subscriber when `buffer` is set.
function makeChannels(listenFn) {
  const channels = new Map();
  const ready = [];

  const channel = (event, { buffer = false } = {}) => {
    if (channels.has(event)) return channels.get(event);
    const ch = { subs: new Set(), queue: [], buffer };
    channels.set(event, ch);
    ready.push(Promise.resolve(listenFn(event, (payload) => {
      if (!ch.subs.size) {
        if (ch.buffer) ch.queue.push(payload);
        return;
      }
      for (const fn of [...ch.subs]) {
        try { fn(payload); } catch (err) { console.error(err); }
      }
    })).catch(() => {}));
    return ch;
  };

  const on = (event, opts) => (fn) => {
    const ch = channel(event, opts);
    ch.subs.add(fn);
    if (ch.queue.length) {
      const queued = ch.queue.splice(0);
      queueMicrotask(() => { for (const p of queued) fn(p); });
    }
    return () => { ch.subs.delete(fn); };
  };

  return { channel, on, whenListening: () => Promise.all(ready) };
}

function baseName(p) {
  return String(p || '').split(/[\\/]/).pop();
}

function toBytes(data) {
  if (data instanceof Uint8Array) return data;
  if (data instanceof ArrayBuffer) return new Uint8Array(data);
  if (ArrayBuffer.isView(data)) return new Uint8Array(data.buffer, data.byteOffset, data.byteLength);
  return new Uint8Array(data || []);
}

export function createDesktopApi({
  call = invoke,
  listen = (event, fn) => getCurrentWebviewWindow().listen(event, (e) => fn(e.payload)),
} = {}) {
  const { on, channel, whenListening } = makeChannels(listen);

  // Subscribed up front so nothing the host sends during start-up is lost.
  channel('open-path', { buffer: true });
  channel('engine-log', { buffer: true });
  channel('engine-state', { buffer: true });
  channel('close-request');

  const writeBinary = ({ filePath, data }) => call('fs_write_binary', toBytes(data), {
    headers: { 'x-path': encodeURIComponent(String(filePath || '')) },
  });

  const pickSavePath = ({ defaultName, defaultDir, filters, title } = {}) => (
    call('dialog_save_path', { opts: { defaultName, defaultDir, filters: filters || [], title } })
  );

  return {
    isDesktop: true,
    runtime: 'tauri',

    // The page has painted: the host shows the window.
    ready: async () => {
      await whenListening();
      return call('window_ready');
    },

    getInfo: () => call('app_info'),
    takePendingOpen: () => call('take_pending_open'),
    onOpenPath: on('open-path', { buffer: true }),

    home: () => call('fs_home'),
    exists: (p) => call('fs_exists', { path: String(p || '') }),
    stat: (p) => call('fs_stat', { path: String(p || '') }),
    readBinary: async ({ filePath }) => {
      const [buf, st] = await Promise.all([
        call('fs_read_binary', { path: filePath }),
        call('fs_stat', { path: filePath }),
      ]);
      const data = toBytes(buf);
      return {
        data,
        name: st?.name || baseName(filePath),
        dir: st?.dir || '',
        path: filePath,
        size: data.length,
        mtime: st?.mtime || Date.now(),
      };
    },
    readText: (p) => call('fs_read_text', { path: p }),
    writeText: ({ filePath, content }) => call('fs_write_text', { path: filePath, content: String(content ?? '') }),

    openDialog: ({ defaultDir, multi, title, filters } = {}) => (
      call('dialog_open', { opts: { defaultDir, multi: !!multi, title, filters: filters || [] } })
    ),
    pickDirectory: ({ defaultDir, title } = {}) => call('dialog_pick_directory', { opts: { defaultDir, title } }),
    pickSavePath,
    writeBinary,
    saveBinary: async ({ defaultName, defaultDir, data, filters }) => {
      const filePath = await pickSavePath({ defaultName: defaultName || 'file.bin', defaultDir, filters });
      if (!filePath) return null;
      await writeBinary({ filePath, data });
      return filePath;
    },

    writeClipboardText: (text) => call('clipboard_write_text', { text: String(text ?? '') }),
    writeClipboardImage: (dataUrl) => call('clipboard_write_image', { dataUrl: String(dataUrl || '') }),

    openExternal: (url) => call('shell_open_external', { url: String(url || '') }),
    showItem: (p) => call('shell_show_item', { path: String(p || '') }),
    openPath: (p) => call('shell_open_path', { path: String(p || '') }),

    listFonts: () => call('list_fonts'),

    loadSettings: () => call('settings_load'),
    saveSettings: (data) => call('settings_save', { data }),

    // Files dropped from the file manager: { type: enter|over|drop|leave, paths }.
    onFileDrop: on('file-drop'),

    // The local engine (src-tauri/src/engine.rs): started with the app.
    engine: {
      status: () => call('engine_status'),
      url: () => call('engine_url'),
      restart: () => call('engine_restart'),
      stop: () => call('engine_stop'),
      folder: () => call('engine_folder'),
      onLog: on('engine-log', { buffer: true }),
      onState: on('engine-state', { buffer: true }),
    },

    // Stability AI's API through the host (no CORS in the way). Only ever
    // called when the user picked that backend in Settings.
    stabilityConvert: ({ key, data, name, fields }) => call('stability_convert', toBytes(data), {
      headers: {
        'x-key': encodeURIComponent(String(key || '')),
        'x-name': encodeURIComponent(String(name || 'image.png')),
        'x-fields': encodeURIComponent(JSON.stringify(fields || {})),
      },
    }),

    win: {
      close: () => call('win_close'),
      forceClose: () => call('win_force_close'),
      onCloseRequest: on('close-request'),
      setTitle: (t) => call('win_set_title', { title: String(t || '') }),
      setMinWidth: (w) => call('win_set_min_width', { width: Number(w) || 0 }),
      getContentBounds: () => call('win_get_content_bounds'),
      openThemePopup: (payload = {}) => call('win_open_theme_popup', { opts: payload }),
      closeThemePopup: () => call('win_close_theme_popup'),
      setPopupSize: ({ width, height } = {}) => call('win_set_popup_size', { width: Number(width), height: Number(height) }),
      pickTheme: (id) => call('win_pick_theme', { id: String(id || '') }),
      // The user's guide (doc/…html) in an ordinary window of its own.
      openGuide: (page) => call('win_open_guide', { page: String(page || 'Guide.html') }),
      setThemeKind: (dark) => call('win_set_theme_kind', { dark: Boolean(dark) }),
      onThemePicked: on('theme-picked'),
      // Settings and About as windows of their own (lib/popout.js, popout.rs).
      popoutShow: (opts = {}) => call('popout_show', { opts }),
      popoutHide: (label) => call('popout_hide', { label: String(label || '') }),
      popoutClose: (label) => call('popout_close', { label: String(label || '') }),
      onPopoutClosed: on('popout-closed'),
    },
  };
}

export function installDesktopBridge(win = typeof window !== 'undefined' ? window : undefined) {
  if (!hasTauri(win) || win.desktopAPI) return win?.desktopAPI;
  win.desktopAPI = createDesktopApi();
  return win.desktopAPI;
}

installDesktopBridge();
