/* Desktop bridge — the page's only way to the operating system in the Tauri app.
 *
 * Every call below is a #[tauri::command] in src-tauri/src/lib.rs and every on* is an
 * event the host emits to this window. The object keeps the shape the Electron preload
 * had, so src/js/platform.js (and through it the whole app) is unchanged in spirit:
 * `window.desktopAPI` exists → desktop mode; otherwise the browser fallbacks apply.
 *
 * Loaded before platform.js on every page (index.html, popup.html). In a plain browser
 * there is no __TAURI__ global and this file does nothing.
 */
(function () {
  const T = window.__TAURI__;
  if (!T || !T.core || typeof T.core.invoke !== 'function') return;
  const invoke = T.core.invoke;
  const current = () => T.webviewWindow.getCurrentWebviewWindow();

  const toBytes = (data) => {
    if (data instanceof Uint8Array) return data;
    if (data instanceof ArrayBuffer) return new Uint8Array(data);
    if (ArrayBuffer.isView(data)) return new Uint8Array(data.buffer, data.byteOffset, data.byteLength);
    if (Array.isArray(data)) return Uint8Array.from(data);
    return new Uint8Array(0);
  };
  const toBuffer = (r) => {
    if (r instanceof ArrayBuffer) return r;
    const b = toBytes(r);
    return b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength);
  };
  const enc = (s) => encodeURIComponent(String(s == null ? '' : s));

  // One host listener per event, fanned out to the page's subscribers. Events that arrive
  // before anyone subscribed (a file handed over during start-up) wait for the first one.
  const channels = new Map();
  function channel(event, buffer) {
    if (channels.has(event)) return channels.get(event);
    const ch = { subs: new Set(), queue: [], buffer: !!buffer };
    channels.set(event, ch);
    current().listen(event, (e) => {
      if (!ch.subs.size) { if (ch.buffer) ch.queue.push(e.payload); return; }
      for (const fn of [...ch.subs]) { try { fn(e.payload); } catch (err) { console.error(err); } }
    }).catch((err) => console.error(err));
    return ch;
  }
  const on = (event, buffer) => (fn) => {
    const ch = channel(event, buffer);
    ch.subs.add(fn);
    if (ch.queue.length) { const q = ch.queue.splice(0); queueMicrotask(() => q.forEach((p) => fn(p))); }
    return () => ch.subs.delete(fn);
  };
  // subscribed at once so nothing sent while the page starts is lost
  channel('open-path', true); channel('popup-init', true); channel('popup-send', true);

  let platform = /Windows/i.test(navigator.userAgent) ? 'win32' : /Mac/i.test(navigator.userAgent) ? 'darwin' : 'linux';
  const naturally = (a, b) => (a.isDir === b.isDir ? a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: 'base' }) : a.isDir ? -1 : 1);

  window.desktopAPI = {
    runtime: 'tauri',
    get platform() { return platform; },
    appInfo: async () => { const info = await invoke('app_info'); platform = info.platform || platform; return info; },
    settingsGet: () => invoke('settings_get'),
    settingsSet: (patch) => invoke('settings_set', { patch: patch || {} }),
    defaultDir: () => invoke('default_dir'),
    homeDir: () => invoke('home_dir'),
    samplesDir: () => invoke('samples_dir'),
    listDrives: () => invoke('list_drives'),

    readDir: async (dir) => (await invoke('fs_read_dir', { path: String(dir) })).sort(naturally),
    stat: (p) => invoke('fs_stat', { path: String(p) }),
    readFile: async (p) => toBuffer(await invoke('fs_read_file', { path: String(p) })),
    readFileHead: async (p, n) => toBuffer(await invoke('fs_read_head', { path: String(p), n: Math.max(0, n | 0) })),
    writeFile: (p, data) => invoke('fs_write_file', toBytes(data), { headers: { 'x-path': enc(p) } }),
    mkdir: (p) => invoke('fs_mkdir', { path: String(p) }),
    uniqueDir: (base) => invoke('fs_unique_dir', { base: String(base) }),
    trash: (p) => invoke('fs_trash', { path: String(p) }),
    copyInto: (sources, destDir, move) => invoke('fs_copy_into', { sources: sources.map(String), destDir: String(destDir), moving: !!move }),
    showInFolder: (p) => invoke('shell_show_item', { path: String(p) }),
    openExternal: (url) => invoke('shell_open_external', { url: String(url) }),
    pathForFile: () => '',   // dropped files arrive as paths through onFileDrop

    openFileDialog: (opts = {}) => invoke('dialog_open_file', { opts: { defaultPath: opts.defaultPath || null, multiple: !!opts.multiple } }),
    openFolderDialog: (opts = {}) => invoke('dialog_open_folder', { opts: { defaultPath: opts.defaultPath || null } }),
    saveDialog: (opts = {}) => invoke('dialog_save', { opts: { defaultPath: opts.defaultPath || null, filters: opts.filters || [] } }),
    messageBox: (opts = {}) => invoke('dialog_message', { opts: { type: opts.type || 'info', title: opts.title || null, message: String(opts.message || ''), detail: opts.detail || null, buttons: opts.buttons || [] } }),

    ready: () => invoke('window_ready'),
    toggleFullscreen: () => invoke('win_toggle_fullscreen'),
    /* the page's own title row (the window has no native one) */
    minimize: () => invoke('win_minimize'),
    toggleMaximize: () => invoke('win_toggle_maximize'),
    isMaximized: () => invoke('win_is_maximized'),
    setBounds: (x, y, w, h) => invoke('win_set_bounds', { x: Number(x) || 0, y: Number(y) || 0, width: Number(w) || 0, height: Number(h) || 0 }),
    setPosition: (x, y) => invoke('win_set_position', { x: Number(x) || 0, y: Number(y) || 0 }),
    /** Menus drawn by the overlay window (past the main window's edges): see MenuMirror in app.js. */
    menuOpen: (payload) => invoke('menu_open', { payload }),
    menuClose: () => invoke('menu_close'),
    menuVisible: () => invoke('menu_visible'),
    setMinSize: (w, h) => invoke('win_set_min_size', { width: Number(w) || 0, height: Number(h) || 0 }),
    startResize: () => invoke('win_start_resize'),
    toggleDevTools: () => invoke('win_toggle_devtools'),
    setTitle: (title) => invoke('win_set_title', { title: String(title || '') }),
    closeWindow: () => invoke('win_close'),

    clipboardWriteText: (text) => invoke('clipboard_write_text', { text: String(text == null ? '' : text) }),
    /** RGBA pixels of a canvas. */
    clipboardWriteImageData: (imageData) => invoke('clipboard_write_image', toBytes(imageData.data), { headers: { 'x-width': String(imageData.width), 'x-height': String(imageData.height) } }),
    listPrinters: () => invoke('print_list_printers'),
    /** Pages as JPEG bytes → the printer (empty name = the default printer). */
    printPages: ({ pages, printer = '', copies = 1, landscape = false, title = '', paper = '', duplex = '', color = true }) => {
      const list = pages.map(toBytes);
      const out = new Uint8Array(4 + list.length * 4 + list.reduce((n, b) => n + b.length, 0));
      const view = new DataView(out.buffer);
      view.setUint32(0, list.length, true);
      let at = 4 + list.length * 4;
      list.forEach((b, i) => { view.setUint32(4 + i * 4, b.length, true); out.set(b, at); at += b.length; });
      return invoke('print_pages', out, { headers: { 'x-printer': enc(printer), 'x-copies': String(Math.max(1, Math.min(99, copies | 0 || 1))), 'x-landscape': landscape ? '1' : '0', 'x-title': enc(title), 'x-paper': enc(paper), 'x-duplex': enc(duplex), 'x-color': color ? '1' : '0' } });
    },

    watchDir: (dir) => invoke('watch_dir', { dir: String(dir) }),
    unwatchDir: (dir) => invoke('unwatch_dir', { dir: String(dir) }),

    // Popup windows (opened by the main window)
    popupOpen: (opts) => invoke('popup_open', { opts }),
    popupSend: (kind, event, data) => invoke('popup_send', { msg: { kind: kind || null, event, data: data === undefined ? null : data } }),
    popupClose: (kind) => invoke('popup_close', { kind }),
    onPopupEvent: on('popup-event'),
    // inside a popup
    popupReady: () => invoke('popup_ready'),
    popupResize: ({ width, height }) => invoke('popup_resize', { width: Number(width) || 400, height: Number(height) || 300 }),
    popupEmit: (msg) => invoke('popup_emit', { msg }),
    onPopupInit: on('popup-init', true),
    onPopupSend: on('popup-send', true),

    // Raw TCP sockets for DICOM networking (src/js/net-transport.js, src-tauri/src/net.rs).
    netConnect: (host, port, timeoutMs) => invoke('net_connect', { host: String(host), port: Number(port), timeoutMs: Number(timeoutMs) || 10000 }),
    netSend: (id, bytes) => invoke('net_send', toBytes(bytes), { headers: { 'x-id': String(id) } }),
    netClose: (id) => invoke('net_close', { id }),
    netListen: (port) => invoke('net_listen', { port: Number(port) || 0 }),
    netStopListen: (id) => invoke('net_stop_listen', { id }),
    onNetData: on('net-data'),
    onNetClosed: on('net-closed'),
    onNetAccept: on('net-accept'),

    onOpenPath: on('open-path', true),
    onDirChanged: on('dir-changed'),
    onFileDrop: on('file-drop'),
    onMenuEvent: on('menu-event'),
    onWinState: on('win-state'),
  };
})();
