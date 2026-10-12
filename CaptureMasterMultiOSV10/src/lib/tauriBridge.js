// Tauri bridge. The UI keeps talking to `platform`; this object is the same
// shape as the old Electron preload, implemented with invoke + events.

import { convertFileSrc, invoke } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';

export const isTauri = typeof window !== 'undefined' && !!window.__TAURI_INTERNALS__;

function listenEvent(name, cb) {
  if (!isTauri) return () => {};
  let un = () => {};
  let dead = false;
  listen(name, (event) => cb(event.payload)).then((fn) => {
    if (dead) fn();
    else un = fn;
  }).catch(() => {});
  return () => { dead = true; un(); };
}

function bytesOf(data) {
  if (data == null) return new Uint8Array();
  if (data instanceof Uint8Array) return data;
  if (data instanceof ArrayBuffer) return new Uint8Array(data);
  if (ArrayBuffer.isView(data)) return new Uint8Array(data.buffer, data.byteOffset, data.byteLength);
  if (Array.isArray(data)) return Uint8Array.from(data);
  return new Uint8Array(data);
}

async function readFile(command, filePath, id) {
  const res = await invoke(command, { filePath, id });
  if (res && res.data) res.data = bytesOf(res.data);
  return res;
}

export const tauriApi = {
  isTauri: true,
  isElectron: false,

  getInfo: () => invoke('get_info'),
  takePendingOpen: () => invoke('take_pending_open'),
  takeInstallCheck: () => invoke('take_install_check'),
  resolveInstallCheck: (wipe) => invoke('resolve_install_check', { wipe }),
  quit: () => invoke('quit'),
  onOpenPath: (cb) => listenEvent('app:openPath', cb),
  onCloseRequested: (cb) => listenEvent('app:closeRequested', cb),
  onMainError: (cb) => listenEvent('app:mainError', cb),

  loadSettings: () => invoke('load_settings'),
  saveSettings: (data) => invoke('save_settings', { data }),

  fs: {
    exists: (p) => invoke('fs_exists', { path: p }),
    ensureDir: (p) => invoke('fs_ensure_dir', { path: p }),
    stat: (p) => invoke('fs_stat', { path: p }),
    readBinary: ({ filePath, id }) => readFile('fs_read_binary', filePath, id),
    readText: ({ filePath, id }) => invoke('fs_read_text', { filePath, id }),
    writeBinary: ({ filePath, data, id }) => invoke('fs_write_binary', { filePath, data: Array.from(bytesOf(data)), id }),
    writeText: ({ filePath, content, id }) => invoke('fs_write_text', { filePath, content, id }),
    copyFile: ({ from, to, id }) => invoke('fs_copy_file', { from, to, id }),
    tempPath: (ext) => invoke('fs_temp_path', { ext }),
    remove: (p) => invoke('fs_remove', { path: p }),
  },

  dialog: {
    openFile: (payload) => invoke('pick_open_file', { req: payload || {} }),
    pickDirectory: (payload) => invoke('pick_directory', { req: payload || {} }),
    pickSavePath: (payload) => invoke('pick_save_path', { req: payload || {} }),
  },

  download: ({ url, id }) => invoke('net_download', { url, id }).then((res) => {
    if (res && res.data) res.data = bytesOf(res.data);
    return res;
  }),

  image: {
    // Raw body: no JSON number array for multi-megabyte images.
    export: (filePath, data, format, quality) => invoke('image_export', bytesOf(data), {
      headers: { 'x-path': encodeURIComponent(filePath), 'x-format': format, 'x-quality': String(Math.round(quality)) },
    }),
    readPng: async (filePath) => bytesOf(await invoke('image_read_png', { path: filePath })),
  },

  clipboard: {
    writeText: (text) => invoke('clipboard_write_text', { text }),
    readText: () => invoke('clipboard_read_text'),
    writeImage: (dataUrl) => invoke('clipboard_write_image', { dataUrl }),
    readImage: () => invoke('clipboard_read_image'),
  },

  printer: {
    list: () => invoke('print_list_printers'),
    /** Prints the calling window's page; `options.pdfPath` writes a PDF instead. */
    printPage: (options) => invoke('print_page', { options }),
  },

  shell: {
    openExternal: (url) => invoke('shell_open_external', { url }),
    showItem: (p) => invoke('shell_show_item', { path: p }),
    openPath: (p) => invoke('shell_open_path', { path: p }),
  },

  capture: {
    listSources: (opts) => invoke('capture_list_sources', { opts: opts || {} }),
    grabScreen: (sourceId) => invoke('capture_grab_screen', { sourceId: sourceId || null }),
    grabWindow: (sourceId) => invoke('capture_grab_window', { sourceId }),
    displays: () => invoke('capture_displays'),
    cursorDisplay: () => invoke('capture_cursor_display'),
    hideApp: () => invoke('capture_hide_app'),
    showApp: () => invoke('capture_show_app'),
    minimizeApp: () => invoke('capture_minimize_app'),
    restoreApp: () => invoke('capture_restore_app'),
  },

  rec: {
    open: (filePath) => invoke('rec_open', { filePath }),
    append: (id, data) => invoke('rec_append', { id, data: Array.from(bytesOf(data)) }),
    close: (id) => invoke('rec_close', { id }),
    discard: (id, path) => invoke('rec_discard', { id, path: path || null }),
    gifStart: (sourceId, path, fps, maxWidth) => invoke('rec_gif_start', { sourceId, path, fps, maxWidth }),
    gifPause: (token, paused) => invoke('rec_gif_pause', { token, paused }),
    gifGone: (token) => invoke('rec_gif_gone', { token }),
    gifStop: (token, path) => invoke('rec_gif_stop', { token, path }),
    windowStart: (sourceId, fps) => invoke('rec_window_start', { sourceId, fps }),
    windowFrame: async (token, timeoutMs) => {
      const buf = await invoke('rec_window_frame', { token, timeoutMs });
      const bytes = bytesOf(buf);
      if (bytes.byteLength < 8) return null;
      const view = new DataView(bytes.buffer, bytes.byteOffset, 8);
      const width = view.getUint32(0, true);
      const height = view.getUint32(4, true);
      const data = new Uint8ClampedArray(bytes.buffer, bytes.byteOffset + 8, width * height * 4);
      return { width, height, data };
    },
    windowStop: (token) => invoke('rec_window_stop', { token }),
  },

  dialogs: {
    open: (name, payload) => invoke('dialog_open_window', { name, payload }),
    getPayload: () => invoke('dialog_get_payload'),
    update: (name, payload) => invoke('dialog_update', { name, payload }),
    submit: (name, data, keepOpen) => invoke('dialog_submit', { name, data, keepOpen: !!keepOpen }),
    close: (name) => invoke('dialog_close_window', { name }),
    closeSelf: () => invoke('dialog_close_self'),
    ready: () => invoke('dialog_ready'),
    isOpen: (name) => invoke('dialog_is_open', { name }),
    broadcastAppearance: (appearance) => invoke('dialog_broadcast_appearance', { appearance }),
    setSize: (width, height) => invoke('dialog_set_size', { width, height }),
    onResult: (cb) => listenEvent('dialog:result', cb),
    onClosed: (cb) => listenEvent('dialog:closed', cb),
    onPayload: (cb) => listenEvent('dialog:payload', cb),
    onAppearance: (cb) => listenEvent('dialog:appearance', cb),
  },

  listFonts: () => invoke('list_system_fonts'),

  popup: {
    show: (payload) => invoke('popup_show', { payload }),
    update: (payload) => invoke('popup_update', { payload }),
    hide: () => invoke('popup_hide'),
    getPayload: () => invoke('popup_get_payload'),
    place: (token, width, height) => invoke('popup_place', { token, width, height }),
    choose: (token, id, keepOpen) => invoke('popup_choose', { token, id, keepOpen: !!keepOpen }),
    onResult: (cb) => listenEvent('popup:result', cb),
    onClosed: (cb) => listenEvent('popup:closed', cb),
    onPayload: (cb) => listenEvent('popup:payload', cb),
  },

  onProgress: (cb) => listenEvent('task:progress', cb),

  win: {
    minimize: () => invoke('win_minimize'),
    toggleMaximize: () => invoke('win_toggle_maximize'),
    close: () => invoke('win_close'),
    isMaximized: () => invoke('win_is_maximized'),
    setTitle: (title) => invoke('win_set_title', { title }),
    setMinWidth: (width) => invoke('win_set_min_width', { width }),
    setMinHeight: (height) => invoke('win_set_min_height', { height }),
    getSize: () => invoke('win_get_size'),
    setSize: (payload) => invoke('win_set_size', { width: payload && payload.width, height: payload && payload.height }),
    onMaximizeChange: (cb) => listenEvent('win:maximized', cb),
  },

  mediaUrl(p) {
    return convertFileSrc(String(p));
  },
};
