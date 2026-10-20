// The desktop app's only way to the operating system: `window.desktopAPI`.
//
// Inside the Tauri window every call below is a #[tauri::command] in
// src-tauri/src/lib.rs, and every on* is an event the host emits to this
// window. In a plain browser there is no Tauri runtime, nothing is installed,
// and src/lib/platform.js falls back to the web APIs.
//
// main.jsx imports this module before anything else, because platform.js reads
// `window.desktopAPI` once, when it is first evaluated.
import { invoke } from '@tauri-apps/api/core';
import { getCurrentWebviewWindow } from '@tauri-apps/api/webviewWindow';
import { buildPrintHtml } from './print-html.js';

export function hasTauri(win = typeof window !== 'undefined' ? window : undefined) {
  return !!(win && win.__TAURI_INTERNALS__ && typeof win.__TAURI_INTERNALS__.invoke === 'function');
}

// One host listener per event, fanned out to every subscriber. Events that
// arrive before anyone subscribes (a file handed over while the app is still
// loading its settings) are kept for the first subscriber when `buffer` is set.
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

// Download replies are framed: u32 LE length of a JSON header, the header,
// then the document bytes.
export function parseFramedDownload(buffer) {
  const bytes = buffer instanceof Uint8Array ? buffer : new Uint8Array(buffer);
  if (bytes.length < 4) throw new Error('Empty download reply');
  const headLen = new DataView(bytes.buffer, bytes.byteOffset, 4).getUint32(0, true);
  const head = JSON.parse(new TextDecoder().decode(bytes.subarray(4, 4 + headLen)));
  const data = bytes.slice(4 + headLen);
  return { data, name: head.name || 'download.pdf', size: data.length, url: head.url };
}

// Pages for print_pages: u32 LE count, a u32 LE length per page, the pages.
export function framePages(images) {
  const list = (images || []).map(toBytes);
  const total = 4 + list.length * 4 + list.reduce((n, b) => n + b.length, 0);
  const out = new Uint8Array(total);
  const view = new DataView(out.buffer);
  view.setUint32(0, list.length, true);
  let at = 4 + list.length * 4;
  list.forEach((b, i) => {
    view.setUint32(4 + i * 4, b.length, true);
    out.set(b, at);
    at += b.length;
  });
  return out;
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

// The host window cannot print a PDF, so the pages arrive as JPEGs and are
// printed from a hidden frame; the system print dialog shows exactly them.
async function printImages({ images, title } = {}) {
  if (!Array.isArray(images) || !images.length) throw new Error('There are no pages to print.');
  const urls = images.map((b) => URL.createObjectURL(new Blob([toBytes(b)], { type: 'image/jpeg' })));
  const frame = document.createElement('iframe');
  frame.setAttribute('aria-hidden', 'true');
  frame.style.cssText = 'position:fixed;right:0;bottom:0;width:1px;height:1px;border:0;opacity:0;pointer-events:none;';
  const cleanup = () => {
    frame.remove();
    for (const u of urls) URL.revokeObjectURL(u);
  };
  try {
    await new Promise((resolve, reject) => {
      frame.onload = resolve;
      frame.onerror = reject;
      frame.srcdoc = buildPrintHtml(urls.map((src) => ({ src })), title);
      document.body.appendChild(frame);
    });
    const doc = frame.contentDocument;
    await Promise.all([...doc.images].map((img) => img.decode().catch(() => {})));
    const win = frame.contentWindow;
    // The frame has to outlive the print preview, which may still be open
    // when print() returns; afterprint says it is gone.
    win.addEventListener('afterprint', () => setTimeout(cleanup, 500), { once: true });
    setTimeout(cleanup, 10 * 60 * 1000);
    win.focus();
    win.print();
    return { printed: true, reason: '', pages: images.length };
  } catch (err) {
    cleanup();
    throw err;
  }
}

export function createDesktopApi({
  call = invoke,
  listen = (event, fn) => getCurrentWebviewWindow().listen(event, (e) => fn(e.payload)),
} = {}) {
  const { on, channel, whenListening } = makeChannels(listen);

  // Subscribed up front so nothing the host sends during start-up is lost.
  channel('open-path', { buffer: true });
  channel('task-progress');
  channel('close-request');

  const writeBinary = ({ filePath, data, id }) => call('fs_write_binary', toBytes(data), {
    headers: {
      'x-path': encodeURIComponent(String(filePath || '')),
      'x-id': id ? encodeURIComponent(String(id)) : '',
    },
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
    readDir: (p) => call('fs_read_dir', { path: String(p || '') }),
    listDrives: () => call('fs_drives'),
    readBinary: async ({ filePath, id }) => {
      const [buf, st] = await Promise.all([
        call('fs_read_binary', { path: filePath, id: id || null }),
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

    openPdfDialog: ({ defaultDir, multi, title, filters } = {}) => (
      call('dialog_open_pdf', { opts: { defaultDir, multi: !!multi, title, filters: filters || [] } })
    ),
    pickDirectory: ({ defaultDir, title } = {}) => call('dialog_pick_directory', { opts: { defaultDir, title } }),
    saveText: async ({ defaultName, defaultDir, content, filters }) => {
      const filePath = await pickSavePath({
        defaultName: defaultName || 'untitled.txt',
        defaultDir,
        filters: filters || [{ name: 'Text', extensions: ['txt'] }],
      });
      if (!filePath) return null;
      await call('fs_write_text', { path: filePath, content: String(content ?? '') });
      return filePath;
    },
    saveBinary: async ({ defaultName, defaultDir, data, filters, id }) => {
      const filePath = await pickSavePath({ defaultName: defaultName || 'file.bin', defaultDir, filters });
      if (!filePath) return null;
      await writeBinary({ filePath, data, id });
      return filePath;
    },
    pickSavePath,
    writeBinary,

    download: async ({ url, id }) => parseFramedDownload(await call('net_download', { url, id: id || null })),

    // Through the system print window (fallback).
    printPages: printImages,
    // Straight to a printer chosen in the app's own dialog.
    listPrinters: () => call('print_list_printers'),
    printTo: ({ images, printer, copies = 1, landscape = false, title = '' } = {}) => call('print_pages', framePages(images), {
      headers: {
        'x-printer': encodeURIComponent(String(printer || '')),
        'x-copies': String(Math.max(1, Math.min(99, Math.round(Number(copies) || 1)))),
        'x-landscape': landscape ? '1' : '0',
        'x-title': encodeURIComponent(String(title || '')),
      },
    }),

    writeClipboardText: (text) => call('clipboard_write_text', { text: String(text ?? '') }),
    writeClipboardImage: (dataUrl) => call('clipboard_write_image', { dataUrl: String(dataUrl || '') }),

    openExternal: (url) => call('shell_open_external', { url: String(url || '') }),
    showItem: (p) => call('shell_show_item', { path: String(p || '') }),

    listFonts: () => call('list_fonts'),

    loadSettings: () => call('settings_load'),
    saveSettings: (data) => call('settings_save', { data }),

    // Progress ticks for long-running reads / writes / downloads.
    onProgress: on('task-progress'),
    // Files dropped from the file manager: { type: enter|over|drop|leave, paths }.
    onFileDrop: on('file-drop'),

    win: {
      minimize: () => call('win_minimize'),
      toggleMaximize: () => call('win_toggle_maximize'),
      close: () => call('win_close'),
      forceClose: () => call('win_force_close'),
      onCloseRequest: on('close-request'),
      isMaximized: () => call('win_is_maximized'),
      setTitle: (t) => call('win_set_title', { title: String(t || '') }),
      setMinWidth: (w) => call('win_set_min_width', { width: Number(w) || 0 }),
      getSize: () => call('win_get_size'),
      setSize: ({ width, height } = {}) => call('win_set_size', { width: Number(width), height: Number(height) }),
      onMaximizeChange: on('maximized'),
      getContentBounds: () => call('win_get_content_bounds'),
      openThemePopup: (payload = {}) => call('win_open_theme_popup', { opts: payload }),
      closeThemePopup: () => call('win_close_theme_popup'),
      setPopupSize: ({ width, height } = {}) => call('win_set_popup_size', { width: Number(width), height: Number(height) }),
      pickTheme: (id) => call('win_pick_theme', { id: String(id || '') }),
      // The program guide (doc/…html) in an ordinary window of its own.
      openGuide: (page) => call('win_open_guide', { page: String(page || 'Guide.html') }),
      // Dark or light native title bars for the app's ordinary windows.
      setThemeKind: (dark) => call('win_set_theme_kind', { dark: Boolean(dark) }),
      onThemePicked: on('theme-picked'),
    },
  };
}

export function installDesktopBridge(win = typeof window !== 'undefined' ? window : undefined) {
  if (!hasTauri(win) || win.desktopAPI) return win?.desktopAPI;
  win.desktopAPI = createDesktopApi();
  return win.desktopAPI;
}

installDesktopBridge();
